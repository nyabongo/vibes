import { describe, it, expect, beforeEach } from "vitest";
import specText from "./spec-text.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Calc from "../rent-or-buy/calc.js";
import Model from "../build-or-invest/model.js";
import Brick from "../brick-by-brick/model.js";

const BASE = "https://vibes.obel.dev/x/";
const specTextSource = readFileSync(fileURLToPath(new URL("./spec-text.js", import.meta.url)), "utf8");

/* Pulls the parameter tables back out of the rendered markdown, so the
   assertions below check what a reader actually sees rather than the data
   that went in. Skips the mode table, which has different columns. */
function paramRows(text) {
  return text
    .split("\n")
    .filter((line) => /^\| `/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((c) => c.trim()))
    .filter((cells) => cells.length === 5)
    .map(([param, means, dflt, range, notes]) => ({
      param: param.replace(/`/g, ""),
      means,
      dflt,
      range,
      notes
    }));
}

const TOOLS = [
  ["rent-or-buy", Calc],
  ["build-or-invest", Model],
  ["brick-by-brick", Brick]
];

describe.each(TOOLS)("specText for %s", (_name, calc) => {
  let text, rows;

  beforeEach(() => {
    calc.resetToDefaults();
    text = specText(calc, BASE);
    rows = paramRows(text);
  });

  it("documents every URL parameter, and nothing that isn't one", () => {
    expect(rows.map((r) => r.param).sort()).toEqual(Object.values(calc.PARAM_MAP).sort());
  });

  it("gives every fieldset a section, so a new group can't go undocumented", () => {
    expect(Object.keys(calc.SECTION_META).sort()).toEqual(Object.keys(calc.FIELDS).sort());
    Object.keys(calc.FIELDS).forEach((id) => {
      expect(text).toContain("### " + calc.SECTION_META[id].legend);
    });
  });

  it("prints each parameter's real default", () => {
    rows.forEach((r) => {
      const k = calc.PARAM_MAP_REV[r.param];
      expect(parseFloat(r.dflt), r.param).toBe(calc.DEFAULTS[k]);
    });
  });

  it("prints the range clampToField actually enforces", () => {
    rows.forEach((r) => {
      const f = calc.FIELD_BY_KEY[calc.PARAM_MAP_REV[r.param]];
      if (f.type === "money") {
        expect(r.range, r.param).toBe("KES");
      } else {
        expect(r.range, r.param).toContain(f.min + " to " + f.max);
      }
    });
  });

  it("marks units the way each field type is actually read", () => {
    rows.forEach((r) => {
      const f = calc.FIELD_BY_KEY[calc.PARAM_MAP_REV[r.param]];
      if (f.type === "pct") expect(r.range, r.param).toMatch(/ %$/);
      if (f.type === "num" && f.unit) expect(r.range, r.param).toContain(f.unit);
      if (f.type === "money") expect(r.range, r.param).not.toMatch(/%/);
    });
  });

  it("never documents step, which clampToField does not enforce", () => {
    // A chatbot told about step would round a researched figure for no reason.
    expect(text).toContain("do not have to");
    rows.forEach((r) => expect(r.range, r.param).not.toContain("step"));
  });

  it("documents the mode parameter and every one of its values", () => {
    expect(text).toContain("`" + calc.MODE_META.param + "` chooses");
    calc.MODE_META.values.forEach((v) => expect(text).toContain("| `" + v.value + "` |"));
  });

  it("documents the currency parameter and every accepted code", () => {
    expect(text).toContain("`c` sets the currency");
    calc.CURRENCIES.forEach((c) => expect(text).toContain("`" + c.code + "`"));
  });

  it("says money in the URL is always KES regardless of the display currency", () => {
    expect(text).toContain("**All money is Kenyan shillings (KES), always.**");
  });

  it("warns that out-of-range values are clamped rather than rejected", () => {
    expect(text).toContain("never rejected, only clamped");
  });

  it("renders each worked example under its label, as a bare URL", () => {
    calc.EXAMPLES.forEach((ex) => {
      expect(text).toContain(ex.label + ":");
      expect(text).toContain(BASE + "?" + new URLSearchParams(ex.params).toString());
    });
  });

  it("builds every link from the base URL it was given", () => {
    expect(text).toContain("Start from `" + BASE + "`");
    [...text.matchAll(/https:\/\/\S+/g)].forEach((m) => {
      expect(m[0].startsWith(BASE), m[0]).toBe(true);
    });
  });

  it("emits no unescaped pipes inside table cells", () => {
    text.split("\n").filter((l) => l.startsWith("|")).forEach((line) => {
      const cells = line.split(/(?<!\\)\|/).length - 2;
      expect(cells, line).toBeGreaterThanOrEqual(3);
    });
  });

  it("leaves no blank cell where a note is missing", () => {
    // `price` has an undefined note and `downPct` a null one — neither may
    // reach the page as the string "undefined".
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
  });
});

describe("a cached engine older than this script fails by name, not by TypeError (regression: 69f09b1)", () => {
  // Reported from a live browser after the merge: spec-text.js was brand new so
  // it loaded fresh, while calc.js came from a 10-minute cache without
  // MODE_META. The crash was "Cannot read properties of undefined (reading
  // 'values')" four frames deep, and the button did nothing at all.
  const stale = (drop) => {
    const clone = Object.create(Object.getPrototypeOf(Calc));
    Object.assign(clone, Calc);
    delete clone[drop];
    return clone;
  };

  it("names the missing metadata and tells the reader to reload", () => {
    expect(() => specText(stale("MODE_META"), BASE)).toThrow(/MODE_META/);
    expect(() => specText(stale("MODE_META"), BASE)).toThrow(/reload the page/i);
  });

  it("guards every engine field it reads, including the two defaults", () => {
    // DEFAULT_MODE and DEFAULT_CUR_CODE shipped in the same commit as
    // MODE_META, so a stale engine loses all three together — but the guard
    // shouldn't depend on that coincidence.
    const read = [...specTextSource.matchAll(/calc\.([A-Z][A-Z_]+)/g)].map((m) => m[1]);
    expect([...new Set(read)].sort()).toEqual([
      "CURRENCIES", "DEFAULTS", "DEFAULT_CUR_CODE", "DEFAULT_MODE",
      "EXAMPLES", "FIELDS", "MODE_META", "PARAM_MAP", "SECTION_META"
    ]);
    [...new Set(read)].forEach((k) => {
      expect(() => specText(stale(k), BASE), k).toThrow(new RegExp(k));
    });
  });

  it("reports every missing piece at once, not just the first", () => {
    const gutted = stale("MODE_META");
    delete gutted.EXAMPLES;
    delete gutted.CURRENCIES;
    expect(() => specText(gutted, BASE)).toThrow(/MODE_META, EXAMPLES, CURRENCIES/);
  });

  it("treats a present-but-empty value as present, not missing", () => {
    // == null, not falsy: an engine with no worked examples yet is current,
    // just sparse, and telling that reader to reload would be wrong.
    const empty = stale("EXAMPLES");
    empty.EXAMPLES = [];
    expect(() => specText(empty, BASE)).not.toThrow();
  });

  it("throws a named error so a caller can tell it from a real bug", () => {
    expect(() => specText(stale("EXAMPLES"), BASE)).toThrow(
      expect.objectContaining({ name: "StaleEngineError" })
    );
  });

  it("still renders normally when the engine is complete", () => {
    expect(() => specText(Calc, BASE)).not.toThrow();
  });
});

describe("specText output is stable", () => {
  it("does not change between calls, so the golden file can't flake", () => {
    Calc.resetToDefaults();
    expect(specText(Calc, BASE)).toBe(specText(Calc, BASE));
  });

  it("describes the current scenario's defaults, not its live values", () => {
    Calc.resetToDefaults();
    const before = specText(Calc, BASE);
    Calc.V.price = 99000000;
    Calc.mode = "let";
    expect(specText(Calc, BASE)).toBe(before);
  });
});
