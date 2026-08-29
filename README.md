# vibes

[![test](https://github.com/nyabongo/vibes/actions/workflows/test.yml/badge.svg)](https://github.com/nyabongo/vibes/actions/workflows/test.yml)

Small tools, vibe-coded. A monorepo of standalone browser tools, live at
**[vibes.obel.dev](https://vibes.obel.dev)**.

## The tools

| Tool | What it does | Advanced | Source | Spec |
| --- | --- | --- | --- | --- |
| [Rent or buy](https://vibes.obel.dev/rent-or-buy/) | Should you buy a home, or rent and put the same money in the market? Models what you'd be worth on each path, and shows the exact year buying overtakes renting — or doesn't. | [all on one page](https://vibes.obel.dev/rent-or-buy/advanced/) | [`rent-or-buy/`](rent-or-buy/) | [llms.txt](rent-or-buy/llms.txt) |
| [Build or invest](https://vibes.obel.dev/build-or-invest/) | Should your money build a rental block, or just sit in the market? Models the construction drag, lease-up, and what the finished building is actually worth. | [all on one page](https://vibes.obel.dev/build-or-invest/advanced/) | [`build-or-invest/`](build-or-invest/) | [llms.txt](build-or-invest/llms.txt) |
| [Brick by brick](https://vibes.obel.dev/brick-by-brick/) | Should you build a home a bit at a time, or rent and invest instead? Builds it out of salary while you rent. Works out when you move in and whether construction costs outrun you before the house is finished. | [all on one page](https://vibes.obel.dev/brick-by-brick/advanced/) | [`brick-by-brick/`](brick-by-brick/) | [llms.txt](brick-by-brick/llms.txt) |

All three calculators take their whole input set from the URL query string, so a
link opens with the scenario already filled in. The specs above document that URL
API — they are generated from the code, and
[how that works](#how-a-calculator-is-put-together) is worth reading before you
change one.

Each tool answers at two addresses over one engine and one query string.
`/<tool>/` is the default and asks for the numbers one at a time;
`/<tool>/advanced/` puts them all on screen at once. See
[the two views](#the-two-views).

Rent or buy and Build or invest default to Kenyan figures; Brick by brick opens
on Ugandan ones. Nothing is hardcoded to either: every tax, rate and transaction
cost is an input. Money in the URL is always KES whichever calculator it is —
only the display currency changes, and each engine picks its own default for
that through `DEFAULT_CUR_CODE`.

## No build step

What deploys is the repo, as-is. No bundler, no transpiler, no generated
`dist/` — GitHub Pages serves these files directly, and opening
`rent-or-buy/index.html` from disk renders the same page with nothing built
first. Serve it over HTTP if you are exercising the two copy buttons, though.
Copy link hands back `location.href`, which off disk is a `file:///…` path
nobody else can open, and Copy prompt builds its base from `location.origin`,
which a `file://` page reports as the string `"null"`.

npm is here for dev tooling only. `vitest` and `@playwright/test` are the only
dependencies [package.json](package.json) has, both of them dev-only, and
neither reaches what ships.

That is not the same as zero dependencies. One thing loads from a CDN at
runtime, and it is the only one:

- [`shared/tool.css`](shared/tool.css) imports Fraunces and IBM Plex from Google Fonts.

If you add a tool, keep it this way. The constraint is what makes the repo worth
cloning.

## Layout

```
index.html                 landing page — the list of tools
llms.txt                   generated index of the tools, for AI assistants
rent-or-buy/
  index.html               the walkthrough — markup + one mount() call
  advanced/index.html      everything on one page: markup + view layer
  guide/index.html         a redirect; the walkthrough used to live here
  calc.js                  the engine (a UMD module — see below)
  calc.test.js             unit tests, co-located with what they test
  guide.js                 the walkthrough's editorial copy (UMD)
  guide.test.js            checks that copy against the engine's own fields
  llms.txt                 generated parameter spec
build-or-invest/           same shape: index.html, advanced/, model.js, guide.js, llms.txt
brick-by-brick/            same shape again; opens in UGX rather than KES
shared/
  tool.css                 house style for the calculators (design tokens at the top)
  wizard.css               the walkthrough's own furniture, on top of tool.css
  wizard.js                the walkthrough's state machine + guide contract (UMD)
  wizard-ui.js             the walkthrough's view layer, shared by all three
  spec-text.js             renders a calculator's URL API as markdown (UMD)
  clipboard.js             copyWithFeedback() — copy, then report on the button itself
  components/              the five custom elements the calculators use
tools/llms-txt.js          generates the committed llms.txt files
tests/
  serve.js                 zero-dependency static server, for Playwright only
  e2e/                     Playwright specs — one per calculator, plus the walkthroughs
CNAME  .nojekyll           GitHub Pages configuration
robots.txt  sitemap.xml    crawler-facing files; both list the llms.txt specs
TESTING.md                 the testing convention
LICENSE                    MIT
```

## Running it

```bash
npm install
```

```bash
node tests/serve.js
```

That serves the repo root at <http://localhost:4173>. You can open the HTML
files straight off disk, but the server mirrors how Pages serves the site, so
relative paths behave the same way they will in production.

```bash
npm test
```

```bash
npm run test:e2e
```

`npm test` runs the Vitest unit tests — fast enough for every change.
`npm run test:e2e` runs Playwright, which is slower and worth doing before you
ship. `npm run test:all` does both. Playwright needs its browser once, before
the first E2E run:

```bash
npx playwright install --with-deps chromium
```

[TESTING.md](TESTING.md) has the convention: what gets a unit test, what gets an
E2E spec, and where each lives. One rule from it is worth repeating here,
because it is the failure you are most likely to hit first — **if
`tools/llms-txt.test.js` fails, run `npm run docs` and commit the result.** It
means the committed output is stale — a field, default or range moved, or the
editorial prose in the generator changed, and the specs were not regenerated
after. The generator is deliberately not chained into `npm test`: regenerating before
asserting would turn a loud failure into a silent auto-fix, and the whole point
is to notice.

CI ([.github/workflows/test.yml](.github/workflows/test.yml)) runs the unit tests
and then the E2E suite on Node 22, for every push to `main` and every PR.

## How a calculator is put together

Three ideas hold the two calculators together, and they explain most of the
shape of the code.

**The URL is the API.** Every field is a query-string parameter, mapped from a
readable internal name to a short public one in `PARAM_MAP`
([rent-or-buy/calc.js:27](rent-or-buy/calc.js#L27)). Two more sit outside that
map: `m` for the mode, named by `MODE_META.param`, and `c` for the display
currency. A link carrying at least one parameter the calculator recognises is
self-contained — the page resets to defaults, applies what the URL sets, and
leaves the visitor's saved scenario untouched. A URL with nothing recognisable
in it, `?utm_source=…` included, restores whatever they last had instead. Money
in the URL is always KES; `c` changes the display currency only.

**The engine is a UMD module.** [`rent-or-buy/calc.js`](rent-or-buy/calc.js),
[`build-or-invest/model.js`](build-or-invest/model.js) and
[`brick-by-brick/model.js`](brick-by-brick/model.js) assign to
`module.exports` under Node and attach `Calc` / `Model` / `Brick` to `window` in
the browser. One file, loaded as a plain `<script src>` with no build step, and
still importable by Vitest. The simulation, state, persistence and formatting
all live there; `index.html` holds only the view layer.

**The spec is generated, never hand-written.**
[`shared/spec-text.js`](shared/spec-text.js) reads an engine's own field
definitions and renders the markdown parameter tables. Two things consume it:
[`tools/llms-txt.js`](tools/llms-txt.js) writes them to disk at author time, and
each calculator page builds the same text live for its "Copy prompt" button. So
the published spec cannot drift from the code that parses the query string. Only
the editorial prose — what a tool is for, what its model does and does not
cover — is hand-written, and it lives in the generator.

## The two views

Every calculator answers at two addresses over one engine:

| | |
| --- | --- |
| `/<tool>/` | The default. One question a screen, in plain language, saying why the number matters and what it typically runs to in a developed and in a developing market. Anything can be skipped. |
| `/<tool>/advanced/` | Every input on screen at once, for someone who already knows what a cap rate is. |

Same query string, same model, same answer. A `view-switch` element sits under
the one-line description on both pages and carries the current scenario across,
because the query string *is* the state — a jump that dropped it would hand the
visitor the defaults back without saying so.

**The walkthrough also keeps its place in the URL fragment.** `/rent-or-buy/#term`
opens on the loan-term question rather than at the beginning, `#answer` opens on
the result, and the query string still applies either way — so a link can put
somebody straight on the one number you want them to look at. The fragment is a
step's own `id`, which is why `validateGuide()` insists those are lowercase
hyphenated words and refuses the two names the wizard's own opening and answer
screens already answer to. Written with `replaceState` rather than by assigning
`location.hash`: assigning it would push a history entry per question and leave
anyone who walked the whole thing twenty presses of Back from leaving the page.
The opener writes no fragment at all, so a fresh arrival keeps a clean URL. Each
tool's `llms.txt` publishes the full list, generated from the guide.

`/<tool>/guide/` is a redirect. The walkthrough shipped there first, and the
URL went out in `sitemap.xml` and the published `llms.txt` before it moved, so
the stub is there to hand the link on. It carries the query string too, which a
`<meta http-equiv="refresh">` cannot do on its own.

Three ideas hold the walkthrough together.

**The engine is untouched.** It reads `FIELDS`, `DEFAULTS`, `SECTION_META` and
`MODE_META`, writes to `V` and `mode`, and calls `simulate()`,
`hasScenarioParams()`, `loadFromURL()` and `updateURL()`. It adds nothing to
`calc.js` / `model.js` and changes nothing in them, so the URL API and the
published spec are the same on both pages. A link built for one opens the other:
swap the base, keep everything after the `?`.

**The prose is data, and it is checked against the code.** Each tool's
[`guide.js`](rent-or-buy/guide.js) holds the running order of the questions and,
for every field, four things: how to ask for it (`q`), what it is (`what`), why
it moves the answer (`why`), and `typical.developed` / `typical.developing`.
Numbers, ranges and defaults are never repeated there — they come from the
engine. `Wizard.validateGuide()` in
[`shared/wizard.js`](shared/wizard.js) fails loudly, at page load and in
`<tool>/guide.test.js`, if the two disagree: a field with no question written for
it, a question for a field that no longer exists, a preset outside the slider's
own range, a mode-only question asked before the mode itself. Add a field to an
engine and the walkthrough's test goes red until someone writes the words.

**One view layer, three tools.** [`shared/wizard.js`](shared/wizard.js) is the
state machine — which question you are on, which answers are the visitor's own,
how far through you are — with no DOM in it, so it unit tests under Node like the
engines do. [`shared/wizard-ui.js`](shared/wizard-ui.js) draws it. A tool's
`index.html` is a masthead, an empty `<div>`, and one `mount({ engine, guide, … })`
call.

Two things worth knowing before you change it:

- **Steps are gated by the engine's own sections, not by the guide.** A step
  whose fields live in a `mode:"let"` section is a let-only step; nothing in
  `guide.js` restates that. The walkthrough's position is held as a step id
  rather than an index for the same reason — switching mode adds and removes
  steps, and an index would silently point at a different question afterwards.
- **There are two states for an answer, not three.** A number is either one the
  visitor set or one the page chose for them. Pressing *Skip* and pressing
  *Next* without touching anything are the same claim about where the number
  came from, and the review list on the answer screen says which is which so a
  reader knows how much of the result is actually theirs.

## Adding a new tool

### Any tool

1. Create `<tool>/index.html`. A folder with an `index.html` means `/tool-name/`
   resolves on Pages with no routing config.
2. Link `../shared/tool.css` if it should match the house style. The tokens at
   the top of that file (`--ink`, `--paper`, `--accent`, `--accent2`) are all you
   need to override for a different palette.
3. Add a `favicon.svg` to the folder.
4. Add `<meta name="description">`, a canonical link, and the OG/Twitter tags —
   copy the block at the top of
   [rent-or-buy/index.html](rent-or-buy/index.html#L7) and edit it.
5. Register the tool in three places: the list in [index.html](index.html), a
   `<url>` entry in [sitemap.xml](sitemap.xml), and `SPECS[0].body` in
   [tools/llms-txt.js](tools/llms-txt.js) — under `## Other tools` if it has no
   URL API, or under `## Calculators with a URL API` if it does, with a link to
   its own spec. Then run `npm run docs` and commit the regenerated root
   `llms.txt`.
6. Add tests, choosing unit or E2E by the rule in [TESTING.md](TESTING.md).

### A calculator with a URL API

The longer path. Work module-first — `build-or-invest/model.js` was built and
unit tested before a line of its HTML existed, and that ordering is worth
copying.

1. **Write the engine.** Wrap it in the UMD prelude from
   [build-or-invest/model.js:1](build-or-invest/model.js#L1) and put the state,
   simulation, persistence and formatting inside it. What stays in the page is
   the view layer — building the fields, drawing the chart and the tiles, and
   the event wiring.

2. **Implement what `spec-text.js` needs.** Nine members, listed in its
   `REQUIRED` array ([shared/spec-text.js:48](shared/spec-text.js#L48)):
   `PARAM_MAP`, `FIELDS`, `DEFAULTS`, `SECTION_META`, `MODE_META`, `EXAMPLES`,
   `CURRENCIES`, `DEFAULT_MODE`, `DEFAULT_CUR_CODE`. If one is missing the
   renderer throws a named `StaleEngineError` up front, instead of dying on an
   undefined property somewhere deep in the output.

3. **Build `FIELDS` with the helpers.** `money(k, label, note)`,
   `pct(k, label, min, max, step, note)` and
   `num(k, label, min, max, step, note, unit)`
   ([rent-or-buy/calc.js:36](rent-or-buy/calc.js#L36)) — min and max set both
   the slider bounds and the range published in the spec, while `step` only
   moves the on-screen slider. URL values are never held to it. Keep each
   `SECTION_META[id].legend` matching the `<legend>` text in the HTML. Setting
   `mode:` on a section marks it mode-only in the generated spec; hiding the
   fieldset on screen is a separate job, done by the page's `applyModeUI()`.

4. **Keep `EXAMPLES` as data.** The unit tests round-trip it through
   `loadFromURL` / `buildQueryString`, which catches an example that silently got
   clamped, a parameter set to its own default, or a typo'd short name.

5. **Wire the page onto the shared components.** `field-group` takes
   `configure({ fields, get, set, onInput })`, `crossover-chart` takes
   `draw({ series, colorA, colorB, ... })` over a generic `{y, a, b}` series,
   `key-tiles` takes `render([{ k, v, s }])`, and `currency-select` exposes
   `setCode()` and emits `currencychange`. Script order matters — components,
   then `clipboard.js`, then `spec-text.js`, then the engine, as in
   [rent-or-buy/index.html:150](rent-or-buy/index.html#L150).

6. **Add a `SPECS` entry** in [tools/llms-txt.js](tools/llms-txt.js) with the
   editorial half: `summary`, `model` (what the calculator does with the inputs,
   and what it does not model) and `related`. That generates the tool's own
   `llms.txt`; list it in the root index too, under
   `## Calculators with a URL API` in `SPECS[0].body`, not `## Other tools`.
   Run `npm run docs`, commit both generated files, and add the new spec URL to
   [robots.txt](robots.txt) and [sitemap.xml](sitemap.xml).

7. **Two constraints on generated output.** Nothing may embed a date, timestamp
   or commit SHA — the golden test compares byte-for-byte between runs. And
   [.gitattributes](.gitattributes) pins `llms.txt` to LF so the files check out
   the same for everyone, most of whom have `core.autocrlf=true`. The golden
   test normalises CRLF before comparing as well, so a misconfigured checkout
   reports the real problem instead of a phantom staleness failure.

8. **Write the walkthrough**, which is the page people actually land on. Put
   the dense one at `<tool>/advanced/index.html` and the walkthrough at
   `<tool>/index.html`. Write `<tool>/guide.js` to the contract in
   [the section above](#the-two-views), copy an `index.html` from another tool
   and change the four arguments to `mount()`, and add `<tool>/guide.test.js`.
   Put a `<view-switch>` on both pages, `sync()` it from whatever loop keeps the
   URL current, and add `/<tool>/advanced/` to [sitemap.xml](sitemap.xml).

9. **Add tests**: `<tool>/<name>.test.js` for the engine, and
   `tests/e2e/<tool>.spec.js` for the page.

## Deployment

GitHub Pages serves the repo root. There is no deploy workflow and no build
job — merging to `main` ships. [CNAME](CNAME) points the custom domain at it, and
[.nojekyll](.nojekyll) stops Jekyll from swallowing paths that begin with an
underscore.

## License

MIT — see [LICENSE](LICENSE).
