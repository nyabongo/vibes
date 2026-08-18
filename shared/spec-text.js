/* Renders a calculator's URL API as markdown: the rules for building a link,
   the mode and currency parameters, a table per fieldset, and the worked
   examples. Everything comes from the calculator's own PARAM_MAP / FIELDS /
   DEFAULTS / SECTION_META / MODE_META / EXAMPLES, so the published spec can't
   drift from the code that reads the query string.

   Two consumers: tools/llms-txt.js writes the output to llms.txt at author
   time, and each calculator page builds it live for the "ask an AI" button.
   Hence the UMD wrapper — the other files in shared/ are browser-only custom
   elements, but this one also has to load under Node. */
(function(root, factory){
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.specText = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function(){
"use strict";

var MONEY_CAP = 1e12;

/* A cell that contains an unescaped pipe would silently split the row. */
function cell(s){
  return String(s === undefined || s === null ? "" : s).replace(/\|/g, "\\|");
}

function range(f){
  if(f.type === "money") return "KES";
  var span = f.min + " to " + f.max;
  if(f.type === "pct") return span + " %";
  return f.unit ? span + f.unit : span;
}

function table(header, rows){
  var out = ["| " + header.join(" | ") + " |", "| " + header.map(function(){ return "---"; }).join(" | ") + " |"];
  rows.forEach(function(r){ out.push("| " + r.join(" | ") + " |"); });
  return out.join("\n");
}

/* This file and the engine it reads are separate <script src> tags with their
   own cache lifetimes, so a returning visitor can hold a stale engine while
   fetching a fresh copy of this one. Say so plainly instead of dying on an
   undefined property four frames deep.

   Every engine field specText reads belongs here — keep this in step with the
   `calc.` references below, or a missing field fails deep in the render
   instead of at the door. */
var REQUIRED = ["PARAM_MAP", "FIELDS", "DEFAULTS", "SECTION_META", "MODE_META",
  "EXAMPLES", "CURRENCIES", "DEFAULT_MODE", "DEFAULT_CUR_CODE"];

function assertUsable(calc){
  /* == null rather than falsy: a legitimately empty or zero value is still
     present, and only absence means the engine predates this script. */
  var missing = REQUIRED.filter(function(k){ return !calc || calc[k] == null; });
  if(missing.length){
    var err = new Error("specText: the calculator is missing " + missing.join(", ") +
      ". This usually means a cached copy of the engine is older than this script — reload the page.");
    err.name = "StaleEngineError";
    throw err;
  }
}

return function specText(calc, base){
  assertUsable(calc);
  var L = [];
  var altModes = calc.MODE_META.values.filter(function(v){ return v.value !== calc.DEFAULT_MODE; });

  L.push("## How to build a link");
  L.push("");
  L.push("1. Start from `" + base + "`.");
  L.push("2. Append `?` then `&`-joined `name=value` pairs from the tables below.");
  L.push("3. **Only include parameters you are changing.** Anything omitted uses its");
  L.push("   default, so a bare `" + base + "` is the default scenario.");
  L.push("4. A link is self-contained. Opening one resets every parameter you left out");
  L.push("   back to its default, ignores whatever scenario the visitor had saved, and");
  L.push("   does not overwrite it.");
  L.push("5. Values are plain decimal numbers — no thousands separators, no currency");
  L.push("   symbol, no `%`. Negatives are fine where the range allows.");
  L.push("6. **All money is Kenyan shillings (KES), always.** The `c` parameter changes");
  L.push("   the display currency only. It does not convert the numbers you pass and it");
  L.push("   does not change the model, so convert to KES yourself before building the");
  L.push("   link.");
  L.push("7. Out-of-range values are never rejected, only clamped — a link stays valid");
  L.push("   while quietly meaning something else. Money is clamped to 0 to " + MONEY_CAP + ";");
  L.push("   everything else to the range in its table.");
  L.push("8. The on-screen sliders move in fixed steps, but **URL values do not have to");
  L.push("   be multiples of those steps.** Pass the real figure.");
  L.push("9. Percentages are whole-number percents: `50` means 50%, not 0.5.");
  L.push("10. Output the finished URL as raw text on its own line. Do not wrap it in a");
  L.push("    markdown link, do not percent-encode it, and do not write `&` as `&amp;`.");
  L.push("11. These parameter names are specific to this calculator. Do not reuse them on");
  L.push("    another vibes calculator — several short names mean different things there.");
  L.push("");

  L.push("## Modes");
  L.push("");
  L.push("`" + calc.MODE_META.param + "` chooses " + calc.MODE_META.label + ". Default `" +
         calc.DEFAULT_MODE + "`. Case-sensitive, and any value other than " +
         altModes.map(function(v){ return "`" + v.value + "`"; }).join(" or ") +
         " is treated as `" + calc.DEFAULT_MODE + "`.");
  L.push("");
  L.push(table(["value", "shown as", "means"], calc.MODE_META.values.map(function(v){
    return ["`" + v.value + "`", cell(v.label), cell(v.note)];
  })));
  L.push("");
  L.push(calc.MODE_META.note);
  L.push("");

  L.push("## Display currency");
  L.push("");
  L.push("`c` sets the currency results are *displayed* in. Default `" + calc.DEFAULT_CUR_CODE +
         "`. Accepted values: " + calc.CURRENCIES.map(function(x){ return "`" + x.code + "`"; }).join(", ") +
         ". An unrecognised code is ignored entirely. Display only — see rule 6.");
  L.push("");

  L.push("## Parameters");
  L.push("");
  Object.keys(calc.FIELDS).forEach(function(id){
    var meta = calc.SECTION_META[id];
    var heading = "### " + meta.legend;
    if(meta.mode) heading += " — mode `" + meta.mode + "` only";
    L.push(heading);
    L.push("");
    L.push(table(["param", "means", "default", "range", "notes"], calc.FIELDS[id].map(function(f){
      return ["`" + calc.PARAM_MAP[f.k] + "`", cell(f.label), calc.DEFAULTS[f.k], range(f), cell(f.note)];
    })));
    L.push("");
  });

  L.push("## Worked examples");
  L.push("");
  calc.EXAMPLES.forEach(function(ex){
    L.push(ex.label + ":");
    L.push(base + "?" + new URLSearchParams(ex.params).toString());
    L.push("");
  });

  return L.join("\n").replace(/\n+$/, "\n");
};
});
