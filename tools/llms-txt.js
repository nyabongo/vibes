/* Generates the published llms.txt files.
 *
 *   npm run docs
 *
 * The parameter tables come from shared/spec-text.js, which reads each
 * calculator's own field definitions — so the spec can't drift from the code
 * that parses the query string. What lives here is only the editorial half:
 * what each tool is for, what its model actually does, and what it doesn't
 * cover.
 *
 * Output is committed, and tools/llms-txt.test.js fails if it's stale. That
 * keeps the deployed site a plain static file tree with no build step: this
 * script runs at author time, never at deploy time.
 *
 * Prose lives inline as data rather than in template files because it has to
 * interpolate real values (base URLs, the default mode, the money clamp) and
 * because the examples are structured objects the tests round-trip. A markdown
 * template would need a templating engine to do the same job.
 *
 * No timestamps, no git SHAs, nothing else that varies between runs — that is
 * what makes the golden-file test possible.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var specText = require("../shared/spec-text.js");
var Wizard = require("../shared/wizard.js");

/* Same two helpers spec-text.js uses on its own tables. Duplicated rather than
   exported, because they are three lines each and exporting them would make
   spec-text.js's public surface a formatting library. */
function cell(s){ return String(s == null ? "" : s).replace(/\|/g, "\\|"); }
function table(header, rows){
  var out = ["| " + header.join(" | ") + " |",
             "| " + header.map(function(){ return "---"; }).join(" | ") + " |"];
  rows.forEach(function(r){ out.push("| " + r.join(" | ") + " |"); });
  return out.join("\n");
}

var ROOT = path.resolve(__dirname, "..");
var SITE = "https://vibes.obel.dev";

var SPECS = [
  {
    out: "llms.txt",
    title: "vibes — small, single-purpose web tools",
    summary:
      "Three standalone browser tools at " + SITE + ". No accounts, no " +
      "tracking, no server: every one is a static page that computes in the " +
      "browser. Each is a financial calculator whose entire input set is " +
      "encoded in the URL query string, so you can hand someone a link that " +
      "opens with their scenario already filled in.",
    body: [
      "## Calculators with a URL API",
      "",
      "Each of these has its own complete parameter reference. Read the one for the",
      "tool you're using — the short parameter names are not shared between them, and",
      "several mean different things in each.",
      "",
      "- [Rent or buy](" + SITE + "/rent-or-buy/): should you buy a home or rent and",
      "  invest the difference? Spec: " + SITE + "/rent-or-buy/llms.txt",
      "- [Build or invest](" + SITE + "/build-or-invest/): should a lump sum become an",
      "  apartment block or compound in the market? Spec: " + SITE + "/build-or-invest/llms.txt",
      "- [Brick by brick](" + SITE + "/brick-by-brick/): should you build a home for yourself a",
      "  bit at a time while you rent, or rent and invest instead? Spec: " + SITE + "/brick-by-brick/llms.txt",
      "",
      "## Two ways into each calculator",
      "",
      "Every one of them answers at two addresses, over one engine and one set of",
      "parameters. `/<tool>/` is the default: it asks a question at a time, explains what",
      "each number is and why it matters, offers typical values for developed and",
      "developing markets, and lets the reader skip anything they don't know.",
      "`/<tool>/advanced/` puts every input on screen at once, for someone who already",
      "knows what they mean:",
      "",
      "- " + SITE + "/rent-or-buy/advanced/",
      "- " + SITE + "/build-or-invest/advanced/",
      "- " + SITE + "/brick-by-brick/advanced/",
      "",
      "Link to the default unless you have a reason not to. The parameter names, defaults",
      "and ranges in each spec below apply to both. The default also reads a URL",
      "fragment naming the question to open on — each spec lists the fragments that",
      "calculator answers to.",
      "",
      "## Notes",
      "",
      "- Rent or buy and Build or invest default to Kenyan figures; Brick by brick opens",
      "  on Ugandan ones. Nothing is hardcoded to either. Every tax, rate and transaction",
      "  cost is an input, so set them for whatever market your reader is actually in.",
      "- Money in every URL is Kenyan shillings regardless of which calculator it is, and",
      "  regardless of the currency the page displays. Convert before building a link.",
      "- They are models, not advice. Growth rates are steady averages; real ones arrive",
      "  in lumps.",
      "- Source: https://github.com/nyabongo/vibes"
    ].join("\n")
  },

  {
    out: "rent-or-buy/llms.txt",
    mod: require("../rent-or-buy/calc.js"),
    guide: require("../rent-or-buy/guide.js"),
    base: SITE + "/rent-or-buy/",
    title: "Rent or buy — the crossover calculator",
    summary:
      "A browser calculator at " + SITE + "/rent-or-buy/ that models net worth over " +
      "time for buying a home versus renting and investing the difference, and reports " +
      "the year one path overtakes the other. Every input is encoded in the URL query " +
      "string, so a link opens with the whole scenario already filled in.",
    model: [
      "## What the calculator does with these",
      "",
      "Both paths start with the same cash. The renter invests the deposit and purchase",
      "costs on day one, and whichever path has the cheaper month invests the difference.",
      "Net worth in year `h` is the sale price less selling costs, the outstanding loan",
      "and capital gains tax, plus whatever has accumulated in the investment pot less",
      "`icgt` on that pot's own gain.",
      "",
      "Both sides are cashed in on the same day and taxed on the same terms. A pot is",
      "taxed only on its growth: the deposit and purchase costs the renter never spent,",
      "and every monthly saving either side makes, are contributed principal and pass",
      "through untaxed. Either pot can be the one doing the saving, and both are taxed",
      "the same way — under `let`, or wherever renting is the dearer month, it is the",
      "buyer's surplus that accumulates.",
      "",
      "The page reports which path wins and by how much, the crossover year if there is",
      "one, and which single input would flip the verdict.",
      "",
      "The defaults are Kenyan, but nothing is hardcoded to Kenya. The tax knobs (`tax`,",
      "`rc`, `cgt`, `icgt`), the mortgage rate and the transaction costs are all plain",
      "inputs — set them for whatever market your reader is in. `icgt` starts at the same",
      "15% as `cgt` but is a separate knob, not a mirror of it: set it to 0 for a pension",
      "or other sheltered account, and note that a `cgt=0` link does not make it 0.",
      "",
      "Not modelled: mortgage insurance, service charge arrears, ground rent, moving",
      "costs. On the tax side: fund fees, withholding on dividends and interest as they",
      "arrive, and any tax-free allowance on either gain — the pot is taxed once, on its",
      "gain, on the day it is cashed in. Appreciation and investment returns are steady",
      "averages; real ones arrive in lumps. It is a model, not advice."
    ].join("\n"),
    related: [
      [SITE + "/llms.txt", "index of the other tools"],
      [SITE + "/build-or-invest/llms.txt", "should a lump sum become a building instead?"],
      [SITE + "/brick-by-brick/llms.txt", "no mortgage on offer? the same question paid for out of salary"]
    ]
  },

  {
    out: "build-or-invest/llms.txt",
    mod: require("../build-or-invest/model.js"),
    guide: require("../build-or-invest/guide.js"),
    base: SITE + "/build-or-invest/",
    title: "Build or invest — the development crossover calculator",
    summary:
      "A browser calculator at " + SITE + "/build-or-invest/ that models what a lump sum " +
      "becomes if it builds a rental block versus if it compounds in the market, and " +
      "reports the year one overtakes the other. Every input is encoded in the URL query " +
      "string, so a link opens with the whole scenario already filled in.",
    model: [
      "## What the calculator does with these",
      "",
      "The same lump sum takes both paths. On the build path it buys land, pays for",
      "construction over `bm` months earning nothing, then ramps from empty to `vac`",
      "occupancy over `lm` months; whatever hasn't been drawn yet keeps compounding while",
      "it waits. The building's exit value is a stabilised year's net income divided by",
      "`cr`, less selling costs and capital gains tax. On the market path the same money",
      "compounds at `inv`, net of `itx` and `ife`.",
      "",
      "The page reports which path wins, the crossover year, the project's IRR and yield",
      "on cost, whether the lump sum actually covers the project, and which single input",
      "would flip the verdict.",
      "",
      "`cr` is the biggest lever on the build side and `inv` on the other — a point of",
      "exit yield moves the answer more than most of the construction budget.",
      "",
      "The defaults are Kenyan, but nothing is hardcoded to Kenya. Every tax and rate is",
      "a plain input.",
      "",
      "Not modelled: construction finance or any debt at all — this compares cash against",
      "cash. Also absent: phased sales of individual units, ground rent, and the risk that",
      "a project simply doesn't finish. It is a model, not advice."
    ].join("\n"),
    related: [
      [SITE + "/llms.txt", "index of the other tools"],
      [SITE + "/rent-or-buy/llms.txt", "the same comparison for a single home you'd live in"],
      [SITE + "/brick-by-brick/llms.txt", "a home built out of salary rather than a lump sum"]
    ]
  },

  {
    out: "brick-by-brick/llms.txt",
    mod: require("../brick-by-brick/model.js"),
    guide: require("../brick-by-brick/guide.js"),
    base: SITE + "/brick-by-brick/",
    title: "Brick by brick — build slowly, or rent and invest",
    summary:
      "A browser calculator at " + SITE + "/brick-by-brick/ that models building a home for " +
      "yourself a stage at a time out of salary, while renting, against renting for good and " +
      "investing the same money. It reports when you move in, whether the house is ever " +
      "finished, and the year one path overtakes the other. Every input is encoded in the URL " +
      "query string, so a link opens with the whole scenario already filled in.",
    model: [
      "## What the calculator does with these",
      "",
      "Both paths are handed the same wallet every month: the rent (`r`, growing at `rg`)",
      "plus what you can set aside (`sm`, growing at `ig`). The renter pays rent and",
      "invests the rest at `inv`, net of `itx` and `ife`. The builder pays that same rent",
      "until they move in, buys the plot as soon as the pot covers `land` plus `lfee` — a",
      "target that is itself rising at `app`, so a slow saver can watch it recede — and",
      "puts what is left into the house. Once they move in the rent stops and `oc`, `mnt`",
      "and inflation `infl` take its place, so the freed rent finishes the house and then",
      "goes into the same investment as the renter's money.",
      "",
      "The build is not given a duration. Progress is tracked as a share of the house:",
      "each month's spend divided by what the whole house costs that month, which is",
      "`sqm` times `cps`, plus `perm` and `wst`, inflated at `bi`. So a build cost rising",
      "faster than the budget grows means progress converges short of 100% and the house",
      "is never finished — the calculator says so rather than extrapolating a finish date.",
      "You move in at `mi` complete, not at 100%, which is when the rent stops.",
      "",
      "An unfinished house is valued at `pb` of the work standing in it, priced at what",
      "that work would cost to put up today rather than at the nominal money spent, and",
      "that fraction decays at `dec` for every year it stands unfinished. At completion it",
      "becomes `fv` of what it cost, and appreciates at `app` from there. Net worth is the",
      "plot and the house less `sp` and `cgt`, plus the pot.",
      "",
      "A crossover here means overtaking, not merely being level: before the plot is paid",
      "for the two paths run identical arithmetic, so being tied in year one is not a",
      "crossing.",
      "",
      "The defaults are Ugandan, but nothing is hardcoded to Uganda. Every tax, rate and",
      "cost is a plain input. Note that `cgt` starts at zero because Uganda exempts a home",
      "you have lived in for at least two years.",
      "",
      "Not modelled: a construction loan or mortgage part-way through, land disputes and",
      "title problems, buying materials in bulk ahead of a price rise, family labour, or",
      "renting out part of the plot while you build. Nor does the money capture the part",
      "that decides it for most people — that a landlord can raise the rent or ask you to",
      "leave, and a finished house cannot. It is a model, not advice."
    ].join("\n"),
    related: [
      [SITE + "/llms.txt", "index of the other tools"],
      [SITE + "/rent-or-buy/llms.txt", "the same question where a mortgage is on the table"],
      [SITE + "/build-or-invest/llms.txt", "building to let rather than to live in"]
    ]
  }
];

/* The walkthrough's questions, as URL fragments. Generated from the guide's own
   step list for the same reason the parameter tables are generated from the
   engine's fields: a hand-written list of these would be wrong the first time
   somebody reordered a question. */
function stepText(spec){
  var engine = spec.mod, guide = spec.guide;
  var idx = Wizard.sectionIndex(engine);
  var L = [];
  L.push("## Opening on a particular question");
  L.push("");
  L.push("The walkthrough also reads the URL fragment. `" + spec.base + "#term`");
  L.push("opens it on that question rather than at the beginning, with everything in");
  L.push("the query string still applied — so a link can put someone straight on the one");
  L.push("number you want them to think about. `#answer` skips to the result.");
  L.push("");
  L.push("Fragments are a property of the walkthrough only. The advanced view has no");
  L.push("questions to open on and ignores them. An unrecognised fragment, or one naming");
  L.push("a question the chosen mode does not ask, opens at the beginning instead of");
  L.push("failing — so pair a mode-only fragment with the `" + engine.MODE_META.param +
         "` that reaches it.");
  L.push("");
  var rows = guide.steps.map(function(step){
    var asks = step.kind === "mode" ? step.question
             : step.keys.length > 1 ? step.title
             : guide.fields[step.keys[0]].q;
    var sets = step.kind === "mode" ? "`" + engine.MODE_META.param + "`"
             : step.keys.map(function(k){ return "`" + engine.PARAM_MAP[k] + "`"; }).join(", ");
    var mode = step.kind === "mode" ? null : Wizard.stepMode(engine, step, idx);
    return ["`#" + step.id + "`", cell(asks) + (mode ? " *(mode `" + mode + "` only)*" : ""), sets];
  });
  L.push(table(["fragment", "opens on", "sets"], rows));
  L.push("");
  return L.join("\n");
}

function render(spec){
  var L = ["# " + spec.title, "", "> " + spec.summary, ""];

  if(spec.body){
    L.push(spec.body);
    L.push("");
    return L.join("\n").replace(/\n+$/, "\n");
  }

  L.push("This file is the complete parameter reference for building a link to this");
  L.push("calculator. The tables are generated from the calculator's own field");
  L.push("definitions — if this file and the app disagree, the app is right and this is a");
  L.push("bug.");
  L.push("");
  /* Both addresses run the same engine off the same query string, so one spec
     covers both. Said here rather than in each tool's hand-written prose,
     because it is a fact about how the pages are built and not an editorial
     choice any one of them gets to make differently. */
  L.push("There are two pages for this calculator, and they take exactly the same");
  L.push("parameters:");
  L.push("");
  L.push("- " + spec.base);
  L.push("  The default. One question at a time, in plain language. Each explains what the");
  L.push("  input is, why it moves the answer, and what it typically runs to in developed");
  L.push("  and in developing markets, and any of them can be skipped.");
  L.push("- " + spec.base + "advanced/");
  L.push("  Every input on one screen, for someone who already knows what they mean.");
  L.push("");
  L.push("Everything after the `?` is identical, so build the query string once and put");
  L.push("either base in front of it. Use the default unless the person you are helping");
  L.push("has asked for the dense one.");
  L.push("");
  L.push(specText(spec.mod, spec.base));
  L.push(stepText(spec));
  L.push(spec.model);
  L.push("");
  L.push("## Related");
  L.push("");
  spec.related.forEach(function(r){ L.push("- " + r[0] + " — " + r[1]); });
  L.push("");

  return L.join("\n").replace(/\n+$/, "\n");
}

function main(){
  SPECS.forEach(function(spec){
    fs.writeFileSync(path.join(ROOT, spec.out), render(spec), "utf8");
    process.stdout.write("wrote " + spec.out + "\n");
  });
}

module.exports = { SPECS: SPECS, render: render, ROOT: ROOT, SITE: SITE };

if(require.main === module) main();
