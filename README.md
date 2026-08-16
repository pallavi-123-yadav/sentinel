# Sentinel — Guardian

Guardian is a security scanner built for AI-generated ("vibe-coded") code. AI coding tools
are fast but don't think like a security engineer — they leave hardcoded passwords in code,
forget to check if a user is logged in before showing their data, and nobody catches it
until it's in production. Guardian scans a folder of code and flags two of the most common
issues before they ship:

- **Hardcoded secrets** — API keys, passwords, tokens, and private keys committed straight
  into source files instead of loaded from environment variables.
- **Missing auth checks** — API routes that read or modify data with no visible
  authentication/authorization check.
- **Hallucinated packages** — dependencies in `package.json`/`requirements.txt` that don't
  actually exist on npm/PyPI. AI coding tools sometimes invent a plausible-sounding package
  name that was never published — installing it (or worse, someone squatting that name
  later) is a real supply-chain risk.

Guardian is the first of four planned agents in the larger Sentinel project (Guardian,
Historian, Hardener, Narrator). Only Guardian is being built right now.

## Install

```bash
npm install
```

## Run a scan

```bash
npm run scan -- <path-to-folder>
```

If no path is given, it scans `sample-app/`, a folder with deliberately planted
vulnerabilities used to test the scanner itself.

Example:

```bash
npm run scan -- sample-app
```

Guardian prints each finding with a severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), the file
and line number, and the offending line of code. It exits with a non-zero status code if any
`CRITICAL` findings are present, so it can be wired into CI later.

## Check for hallucinated packages

```bash
npm run check-packages -- <path-to-folder>
```

This makes live calls to the real npm and PyPI registries, so it needs network access. Any
package name that gets a 404 from the registry is flagged as likely hallucinated. If the
registry can't be reached, that package is reported separately as "unverified" rather than
flagged — a network hiccup should never look like a real finding.

## Development

```bash
npm test      # run the test suite
npm run lint  # check code style
npm run format # auto-format code
```

## Project layout

```
src/scanner/      Guardian's scanning logic
sample-app/        Sample apps used to test the scanner (planted vulnerabilities)
tests/             Automated tests for the scanner
```

## Status

Guardian currently catches:

- Hardcoded AWS keys, Stripe keys, GitHub tokens, Slack webhooks, private key blocks, and a
  generic `password`/`secret`/`token` literal pattern
- Express/Router routes with no visible auth check (inline, via `app.use`/`router.use`
  middleware, or via an inline middleware argument)
- Hallucinated npm and PyPI packages in `package.json`/`requirements.txt`

Not yet built: GitHub webhook integration and a dashboard.

<!-- test PR to verify the Guardian GitHub Action posts a comment -->
