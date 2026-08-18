# Guardian: real-world evaluation

Guardian's scanners were run against 12 real public repositories to measure
false-positive rate on production code and true-positive detection on known
vulnerable code, rather than just on Sentinel's own `sample-app` fixture.

Method: shallow-cloned each repo, ran `sentinel-scan --no-packages
--min-confidence 0` (secrets + missing-auth only, every finding surfaced
regardless of confidence), then manually reviewed every single finding by
hand and classified it true positive / false positive. The hallucinated-package
checker was tested separately against 4 of the repos' real manifests.

## Repos tested

**9 well-maintained production libraries** (measures false-positive rate on
real, non-vulnerable code):

| Repo | Language | Result |
|---|---|---|
| expressjs/express | JS | 0 findings |
| lodash/lodash | JS | 0 findings |
| chalk/chalk | JS | 0 findings |
| tj/commander.js | JS | 0 findings |
| expressjs/cors | JS | 0 findings |
| sindresorhus/got | JS | 1 finding (false positive) |
| pallets/flask | Python | 0 findings |
| psf/requests | Python | 0 findings |
| pallets/click | Python | 0 findings |

**3 intentionally-vulnerable apps**, built by OWASP and others specifically
to test security tooling against — not repos scanned for accidental leaks:

| Repo | Language | Result |
|---|---|---|
| OWASP/NodeGoat | JS | 3 findings, all true positives |
| OWASP/railsgoat | Ruby | 9 findings, 7 true / 2 false |
| digininja/DVWA | PHP | 6 findings, 1 true / 5 false |

## Headline numbers

- **False-alarm rate on clean production code: 1 finding across 9 repos.**
  8 of 9 repos scanned completely clean; the one finding (`got`) was a
  single low-signal match, not a flood of noise.
- **True-positive catch rate on known-vulnerable code: 3 of 3 repos**
  flagged real, genuinely hardcoded credentials.
- **Hallucinated-package check: 0 false positives across 4 real manifests**
  (express's 44 real dependencies, lodash, requests, flask) — every real
  package correctly recognized, 0 network/unverified failures.
- **19 total findings, 11 true positives, 8 false positives** — but the
  false positives cluster into two specific, fixable regex gaps (below),
  not random noise.

## What it actually caught (true positives)

- **NodeGoat** `config/env/all.js:8` — `cookieSecret: "session_cookie_secret_key_here"`
  and two occurrences of a hardcoded `zapApiKey` in `development.js` /
  `test.js` — real hardcoded config secrets checked into source.
- **railsgoat** `db/seeds.rb` — 7 hardcoded plaintext passwords
  (`"admin1234"`, `"yankeessuck"`, `"adminadmin"`, etc.) seeded directly in
  a checked-in Ruby file — exactly the anti-pattern Guardian targets.
- **DVWA** `vulnerabilities/sqli/test.php:4` — `$password = "password";`,
  a literal hardcoded credential.

## False positives found, and why

Every false positive traces back to one of two specific regex gaps —
useful, concrete signal for what to fix next, not just "regex is noisy":

1. **Doesn't skip commented-out code.** railsgoat's
   `bootstrap-image-gallery-main.js:61` matched `// api_key: '...'` — the
   match is inside a `//` comment in a vendored third-party JS plugin, not
   live code.
2. **Doesn't recognize PHP variable interpolation inside quotes.** DVWA had
   5 identical false positives, all `password = '$pass_new'` — `$pass_new`
   is a PHP variable being interpolated into a SQL string, not a literal
   value, but it satisfies the regex's "≥8 chars between quotes" check.
   Same root cause each time, single fix would clear all 5.
3. **Doesn't recognize semantically-empty placeholder words beyond the
   fixed placeholder list.** railsgoat's `ApiKey = 'notsupplied'` and got's
   `secret: 'passphrase'` (a TypeScript option-schema field name, not an
   assigned value) both read as obviously non-secret to a human but aren't
   covered by the current `PLACEHOLDER_VALUE` regex.

## A real coverage gap found (false negative)

NodeGoat is a real Express app with intentionally broken access control —
but Guardian's missing-auth detector caught **zero** of its route-level
vulnerabilities. Its routes are written as
`app.get("/", sessionHandler.displayWelcomePage)` — a named/imported
handler reference, the standard Express MVC/controller pattern. The
current heuristic (`hasInlineMiddlewareArg`) treats any handler that
isn't an inline arrow/`function` expression as "might be middleware I
can't verify," and skips it rather than risk a false positive. That's the
right conservative default for genuine middleware chains, but it also
means the detector currently can't evaluate a large share of real-world
Express code that uses named controller functions instead of inline
handlers. Worth fixing before leaning on missing-auth detection in a demo.

## Bottom line for the pitch

Guardian is quiet on real, clean code (near-zero false-alarm rate across 9
production libraries) and reliably catches real hardcoded-credential
patterns in vulnerable code (3/3 known-vulnerable repos flagged). Its
current weak points are narrow and well-understood rather than vague: two
specific regex blind spots account for every false positive found, and the
missing-auth detector needs to follow named handler references (not just
inline ones) to cover idiomatic Express code.
