/* The nine currencies are declared four times: once in the picker component
   here, and once more as a `CURRENCIES` array in each of the three engines.
   Nothing but a "keep in sync" comment held them together (issue #18).

   Drift is silent in both directions. A currency the picker offers but an
   engine doesn't know: `applyCurrency(code)` walks its own list, finds
   nothing, returns false, and the page keeps displaying the old currency with
   no error. A rate edited in one file and not the others is quieter still —
   amounts are stored in KES and only converted for display, so a shared link
   means one thing to the sender and another to the recipient.

   These tests pin the four lists to each other. They don't deduplicate them;
   see the issue for why that's a separate change. */

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import CurrencySelect from "./currency-select.js";
import Calc from "../../rent-or-buy/calc.js";
import Model from "../../build-or-invest/model.js";
import Brick from "../../brick-by-brick/model.js";

const ENGINES = [
  ["rent-or-buy/calc.js", Calc],
  ["build-or-invest/model.js", Model],
  ["brick-by-brick/model.js", Brick]
];

/* The picker stores [code, symbol, rate, display name]; the engines store
   {code, sym, rate} and carry no name. Flatten both to the same shape so any
   difference in code, symbol, rate, entry count or ordering surfaces as a
   single deep-equal failure with a readable diff. */
const shape = ({ code, sym, rate }) => ({ code, sym, rate });
const PICKER = CurrencySelect.CURRENCIES.map(([code, sym, rate]) => ({ code, sym, rate }));
const PICKER_BY_CODE = new Map(PICKER.map((c) => [c.code, c]));

/* Each engine also hardcodes its starting currency as an object literal in the
   constructor — a fifth place a rate can drift. Snapshot those before any test
   below reassigns `cur`. */
const INITIAL_CUR = new Map(ENGINES.map(([name, engine]) => [name, shape(engine.cur)]));

afterEach(() => {
  ENGINES.forEach(([, engine]) => engine.resetToDefaults());
});

describe("the four currency lists agree", () => {
  ENGINES.forEach(([name, engine]) => {
    it(name + " lists exactly the picker's currencies, same values, same order", () => {
      expect(engine.CURRENCIES.map(shape)).toEqual(PICKER);
    });
  });

  it("offers nine currencies, KES as the unit rate everything else is quoted against", () => {
    expect(PICKER).toHaveLength(9);
    expect(PICKER_BY_CODE.get("KES")).toEqual({ code: "KES", sym: "KSh", rate: 1 });
  });

  it("lists each code once", () => {
    const codes = PICKER.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("gives every picker entry a display name — the engines don't carry one, so nothing else checks it", () => {
    for (const [code, , , name] of CurrencySelect.CURRENCIES) {
      expect(name, code + " has no display name").toBeTruthy();
    }
  });
});

describe("every currency the picker offers actually applies", () => {
  ENGINES.forEach(([name, engine]) => {
    it(name + " accepts every code in the picker and takes its symbol and rate", () => {
      for (const currency of PICKER) {
        expect(engine.applyCurrency(currency.code), name + " rejected " + currency.code).toBe(true);
        expect(shape(engine.cur)).toEqual(currency);
      }
    });

    it(name + " starts on a currency the picker offers, priced the way the picker prices it", () => {
      const expected = PICKER_BY_CODE.get(engine.DEFAULT_CUR_CODE);
      expect(expected, engine.DEFAULT_CUR_CODE + " is not in the picker").toBeDefined();
      /* The constructor's literal, captured at import time... */
      expect(INITIAL_CUR.get(name)).toEqual(expected);
      /* ...and the list lookup resetToDefaults goes through. */
      engine.resetToDefaults();
      expect(shape(engine.cur)).toEqual(expected);
    });
  });

  it("rejects a code no list carries, rather than silently keeping the old currency", () => {
    ENGINES.forEach(([name, engine]) => {
      expect(engine.applyCurrency("XXX"), name + " accepted a bogus code").toBe(false);
    });
  });
});

/* The UMD wrapper exists so the tests above can require() this file. Guard the
   other half of that bargain: loaded the way the pages load it — a plain
   <script src> with no `module` in scope — it must still register the element. */
describe("the UMD wrapper keeps the browser path intact", () => {
  it("defines <currency-select> when a DOM is present", () => {
    const src = readFileSync(fileURLToPath(new URL("./currency-select.js", import.meta.url)), "utf8");
    const registered = {};
    class FakeHTMLElement {}
    const sandbox = {
      HTMLElement: FakeHTMLElement,
      customElements: { define: (tag, ctor) => { registered[tag] = ctor; } },
      CustomEvent: class {},
      document: {}
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInContext(src, vm.createContext(sandbox), { filename: "currency-select.js" });

    const ctor = registered["currency-select"];
    expect(ctor, "no element was registered").toBeDefined();
    expect(Object.getPrototypeOf(ctor)).toBe(FakeHTMLElement);
    expect(sandbox.window.CurrencySelect).toBe(ctor);
    /* Same list either way in — the Node branch isn't a second copy. */
    expect(ctor.CURRENCIES).toEqual(CurrencySelect.CURRENCIES);
  });
});
