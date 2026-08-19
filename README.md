# Sentinel — Guardian

**A security watchdog for AI-generated code.** AI coding tools (Cursor, Claude Code, Bolt, v0) let anyone build apps by just describing what they want — "vibe coding." It's fast, but the AI doesn't think like a security engineer: it leaves hardcoded passwords in code, forgets to check if a user is logged in before showing their data, and sometimes invents fake library names that don't exist.

Guardian inspects what the AI built and catches the dangerous stuff before it ships — as a CLI, a CI check, a GitHub webhook, or a dashboard.

[**Pitch deck**](https://claude.ai/code/artifact/b9811531-6fa6-4629-b323-161466e80f6e) · [**Field Manual (line-by-line walkthrough)**](https://claude.ai/code/artifact/a2a94c01-1438-47d4-8877-db3b074fe0bc) · [**Evaluation numbers**](./EVALUATION.md)

## What it catches

- **Hardcoded secrets** — AWS keys, Stripe keys, GitHub tokens, Slack webhooks, private key blocks, JWT secrets, and a generic password/API-key catch-all, with placeholder-value filtering so `process.env.X` and `"changeme"` don't get flagged.
- **Missing auth checks** — Express routes (`app.get`/`router.post`/etc.) that touch sensitive paths or non-GET methods with no visible authorization check and no `.use()`-registered middleware upstream.
- **Hallucinated packages** — dependency names in `package.json` / `requirements.txt` that don't actually exist on npm or PyPI, checked live against the real registries.

Every finding gets a confidence score (see [`EVALUATION.md`](./EVALUATION.md) for why), and low-confidence matches are separated from the headline list so the tool doesn't cry wolf.

## Try it

```
Guardian scan: sample-app

[CRITICAL] AWS Access Key ID (confidence: 95%)
  sample-app/bad-server.js:7
  const AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';

[CRITICAL] Stripe Live Secret Key (confidence: 95%)
  sample-app/bad-server.js:9
  const STRIPE_SECRET_KEY = 'sk_live_FAKEFAKEFAKEFAKEFAKEFAKE';

[HIGH] Route DELETE /api/admin/users/:id has no visible auth check (confidence: 75%)
  sample-app/bad-server.js:30
  app.delete('/api/admin/users/:id', ...)

Total: 10 issue(s) — 4 CRITICAL, 5 HIGH, 1 MEDIUM
```

(That's real output from `sentinel-scan sample-app` against this repo's own deliberately-vulnerable fixture app.)

## Install & run

```bash
git clone https://github.com/pallavi-123-yadav/sentinel.git
cd sentinel
npm install

# scan any folder
node bin/sentinel-scan.js ./path/to/your/project

# or link it as a real command
npm link
sentinel-scan ./path/to/your/project --format pretty   # pretty | markdown | json
```

Useful flags: `--no-packages` (skip the network-bound hallucinated-package check), `--min-confidence <0-1>` (default `0.5`).

## Four ways to run it

| Surface | What it's for |
|---|---|
| **CLI** (`bin/sentinel-scan.js`) | Run it by hand against any local folder. |
| **GitHub Actions** (`.github/workflows/guardian.yml`) | Auto-scans every push/PR to this repo, posts findings as a PR comment, fails the check on CRITICAL issues. |
| **Webhook server** (`src/webhook/server.js`) | A standalone Express server GitHub can ping directly on push/PR — signature-verified, clones the code, scans it, posts the PR comment. No CI config needed in the target repo. See the setup steps in that file's header comment. |
| **Dashboard** (`dashboard/`) | A Next.js UI — point it at a folder, get a table of findings instead of terminal output. `cd dashboard && npm install && npm run dev`. |

## Demo

Shot-by-shot recording script (60–90s): [`docs/demo-script.md`](./docs/demo-script.md).

## Does it actually work?

Tested against 12 real public repos, not just the bundled fixture — 1 false alarm across 9 clean production libraries, and 3/3 known-vulnerable apps (OWASP NodeGoat, railsgoat, DVWA) correctly caught. Full numbers, including the honest false positives and a real coverage gap found: [`EVALUATION.md`](./EVALUATION.md).

## How it works, line by line

For a from-scratch, zero-programming-background walkthrough of every file in this repo: [**Guardian Field Manual**](https://claude.ai/code/artifact/a2a94c01-1438-47d4-8877-db3b074fe0bc).

## The bigger picture

Guardian is the first of four planned agents — the most demo-able, standalone-useful one to build first:

- **Guardian** — security scanner (this repo)
- **Historian** — project memory across chat sessions
- **Hardener** — production-readiness auto-fixer
- **Narrator** — decision log

## Development

```bash
npm test      # jest — 62 tests across secret/auth/package/CLI/webhook logic
npm run lint  # eslint
npm run format
```

Guardian scans itself on every run of its own test suite and CI — see `EVALUATION.md` for what that catches (nothing, currently — that's the point).
