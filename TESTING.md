# Testing

This repo ships static, single-file web tools with no build step. Test tooling
(Vitest, Playwright) is a dev-only layer on top — installing it doesn't add a
bundler or any runtime dependency to what actually gets deployed.

## The rule

**If an app has extractable pure logic** (financial or layout math, parsing,
formatting) — move it into a plain script module next to the app's
`index.html` and unit test it with Vitest. Unit tests are fast and precise,
and they can hit numeric edge cases a browser test can't easily set up.

- `rent-or-buy/calc.js` + `rent-or-buy/calc.test.js` is the reference example:
  the financial simulation engine, state, persistence, and formatting were
  extracted out of the inline `<script>` into a UMD-style module that works
  both as a plain `<script src>` (still zero build step) and as a Node import
  for tests.

**If an app is primarily DOM/canvas/interaction with no meaningful pure
logic** — rely on Playwright E2E instead; there's nothing worth extracting.

- `passport-photo-printer/` is almost entirely Cropper.js plus canvas/DOM
  orchestration (upload → crop → grid render → print). Its first coverage
  should be a Playwright spec exercising that flow, not an extraction.
- The root landing page just needs a trivial Playwright smoke test (links
  resolve) once Playwright is already set up for another app — near-zero
  marginal cost.

## Where things live

- Unit tests are co-located with the module they test, inside the app's own
  folder (`<app>/<name>.js` + `<app>/<name>.test.js`).
- Playwright specs live under root `tests/e2e/<app>.spec.js` — browser
  tooling and config are shared across apps, so there's no reason to
  duplicate a `tests/` folder per app.
- `tests/serve.js` is a zero-dependency static file server used only by
  Playwright's `webServer`. It serves the repo root the same way GitHub
  Pages does, so specs exercise real relative paths instead of `file://`.

## Running

```bash
npm install
npm test          # unit tests (Vitest) — fast, run on every change
npm run test:e2e  # Playwright — slower, run before shipping
npm run test:all  # both
```

`npx playwright install --with-deps chromium` is needed once before the first
`test:e2e` run.

## Writing a regression test

When a bug fix lands, the test that would have caught it belongs in the same
change. Name it after what actually happened, not just what's now true — e.g.
"loanInterest is computed over the full loan term, not the horizon (regression:
bf73091)" tells the next person *why* the case exists, not just what it
asserts.
