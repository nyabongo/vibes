import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Calc from "./calc.js";

beforeEach(() => {
  Calc.resetToDefaults();
});

describe("amortization", () => {
  it("computes the standard annuity payment for the loan amount and rate", () => {
    const r = 14.5 / 100 / 12;
    const n = 20 * 12;
    const loan = 12000000 * (1 - 20 / 100);
    const expectedPay = (loan * r) / (1 - Math.pow(1 + r, -n));
    const s = Calc.simulate();
    expect(s.payment).toBeCloseTo(expectedPay, 6);
  });

  it("pays the loan down to ~0 by the end of the term", () => {
    Calc.V.appr = 0; // freeze home value so equity == sale - remaining balance, isolating the balance
    const s = Calc.simulate({ horizon: Calc.V.term });
    const expectedSale = Calc.V.price * (1 - Calc.V.sellPct / 100);
    expect(s.equity).toBeCloseTo(expectedSale, 0);
  });

  it("falls back to straight-line principal when the rate is zero", () => {
    Calc.V.rate = 0;
    const loan = Calc.V.price * (1 - Calc.V.downPct / 100);
    const n = Calc.V.term * 12;
    const s = Calc.simulate();
    expect(s.payment).toBeCloseTo(loan / n, 6);
    expect(s.loanInterest).toBe(0);
  });
});

describe("loanInterest is computed over the full loan term, not the horizon (regression: bf73091)", () => {
  it("stays constant as the horizon changes while the term is fixed", () => {
    const short = Calc.simulate({ horizon: 5 }).loanInterest;
    const long = Calc.simulate({ horizon: 30 }).loanInterest;
    expect(short).toBeCloseTo(long, 6);
  });

  it("matches pay*n - loan for the full term, independent of horizon", () => {
    const r = 14.5 / 100 / 12;
    const n = 20 * 12;
    const loan = 12000000 * (1 - 20 / 100);
    const pay = (loan * r) / (1 - Math.pow(1 + r, -n));
    const expected = pay * n - loan;
    expect(Calc.simulate({ horizon: 5 }).loanInterest).toBeCloseTo(expected, 6);
  });
});

describe("solve() and the 40-year flip claim (regression: e2baf39)", () => {
  it("finds the crossover value for a lever within the given range", () => {
    expect(Calc.solve("appr", -8, 30)).toBeCloseTo(11.645, 2);
    expect(Calc.solve("invest", 0, 30)).toBeCloseTo(3.808, 2);
  });

  it("returns null when there is no sign change across the range, instead of guessing", () => {
    Calc.V.appr = 50; // buying wins overwhelmingly no matter what the invest return is
    expect(Calc.solve("invest", 0, 30)).toBeNull();
  });

  it("bases the 40-year breakEven on an actual 40-year simulation, not extrapolation", () => {
    // No crossover within 40 years at the defaults.
    const s40default = Calc.simulate({ horizon: 40 });
    expect(s40default.breakEven).toBeNull();

    // With a lower investment return, buying does cross over — and the reported
    // year must match a genuine scan of the 40-year series, not a shortcut.
    Calc.V.invest = 3;
    const s40 = Calc.simulate({ horizon: 40 });
    let manualBreakEven = null;
    for (let i = 1; i < s40.series.length; i++) {
      if (s40.series[i].buy >= s40.series[i].rent) { manualBreakEven = s40.series[i].y; break; }
    }
    expect(s40.breakEven).toBe(manualBreakEven);
    expect(s40.breakEven).not.toBeNull();
  });
});

describe("shared links replace the whole scenario, not a patch (regression: 51811df)", () => {
  it("resetToDefaults + loadFromURL reproduces only what the link specifies, not leftover state", () => {
    Calc.V.price = 99000000;
    Calc.V.horizon = 33;
    Calc.mode = "let";

    // Simulate the "shared link" bootstrap path: reset first, then apply the URL.
    Calc.resetToDefaults();
    Calc.loadFromURL("?p=20000000&h=15&m=let");

    expect(Calc.V.price).toBe(20000000);
    expect(Calc.V.horizon).toBe(15);
    expect(Calc.mode).toBe("let");
    // Everything the link didn't mention falls back to defaults, not the prior session's state.
    expect(Calc.V.rate).toBe(Calc.DEFAULTS.rate);
  });

  it("hasScenarioParams recognizes a link carrying any known param, mode, or currency", () => {
    expect(Calc.hasScenarioParams("?p=1000")).toBe(true);
    expect(Calc.hasScenarioParams("?m=let")).toBe(true);
    expect(Calc.hasScenarioParams("?c=USD")).toBe(true);
    expect(Calc.hasScenarioParams("?unknown=1")).toBe(false);
    expect(Calc.hasScenarioParams("")).toBe(false);
  });
});

describe("clampToField clamps to each field's declared range (regression: 60cdc09)", () => {
  it("clamps pct fields to [min, max]", () => {
    expect(Calc.clampToField("downPct", -50)).toBe(0);
    expect(Calc.clampToField("downPct", 500)).toBe(100);
    expect(Calc.clampToField("downPct", 45)).toBe(45);
  });

  it("clamps money fields to [0, 1e12]", () => {
    expect(Calc.clampToField("price", -100)).toBe(0);
    expect(Calc.clampToField("price", 5e15)).toBe(1e12);
  });

  it("passes unknown keys through unchanged", () => {
    expect(Calc.clampToField("bogus", 123)).toBe(123);
  });

  it("loadFromURL clamps in-range values and rejects non-finite ones", () => {
    Calc.loadFromURL("?p=notanumber&dp=99999&h=abc");
    expect(Calc.V.price).toBe(Calc.DEFAULTS.price); // rejected, not a number
    expect(Calc.V.downPct).toBe(100); // clamped to max
    expect(Calc.V.horizon).toBe(Calc.DEFAULTS.horizon); // rejected, not a number
  });
});

describe("loadFromStorage rejects bad input and can't pollute the prototype (regression: 8abe213)", () => {
  it("ignores non-number and non-finite stored values", () => {
    Calc.loadFromStorage(JSON.stringify({ V: { downPct: "nope", term: NaN } }));
    expect(Calc.V.downPct).toBe(Calc.DEFAULTS.downPct);
    expect(Calc.V.term).toBe(Calc.DEFAULTS.term);
  });

  it("applies legitimate stored values", () => {
    Calc.loadFromStorage(JSON.stringify({ V: { price: 99999999 }, mode: "let", cur: "GBP" }));
    expect(Calc.V.price).toBe(99999999);
    expect(Calc.mode).toBe("let");
    expect(Calc.cur.code).toBe("GBP");
  });

  it("clamps out-of-range stored values instead of trusting them (a value could predate URL clamping)", () => {
    Calc.loadFromStorage(JSON.stringify({ V: { price: 5e15, downPct: 500 } }));
    expect(Calc.V.price).toBe(1e12);
    expect(Calc.V.downPct).toBe(100);
  });

  it("cannot pollute Object.prototype via a __proto__ key in the stored JSON", () => {
    const raw = '{"V":{"price":123456,"__proto__":{"polluted":true}}}';
    Calc.loadFromStorage(raw);
    expect(Calc.V.price).toBe(123456);
    expect(({}).polluted).toBeUndefined();
  });

  it("does not throw on malformed JSON, and leaves state untouched", () => {
    expect(() => Calc.loadFromStorage("{not valid json")).not.toThrow();
    expect(Calc.V.price).toBe(Calc.DEFAULTS.price);
  });
});

describe("paramKey/hasScenarioParams don't resolve inherited Object.prototype members (regression: 8abe213)", () => {
  it("paramKey returns undefined for keys only present via the prototype chain", () => {
    expect(Calc.paramKey("constructor")).toBeUndefined();
    expect(Calc.paramKey("toString")).toBeUndefined();
    expect(Calc.paramKey("hasOwnProperty")).toBeUndefined();
  });

  it("hasScenarioParams doesn't false-positive on a plain visit carrying an unrelated ?constructor= param", () => {
    expect(Calc.hasScenarioParams("?constructor=1")).toBe(false);
  });
});

describe("a shared link doesn't clobber the viewer's saved scenario until they edit it (regression: 8abe213)", () => {
  const STORAGE_KEY = "rentOrBuy.v1";
  let store;

  beforeEach(() => {
    store = {};
    global.localStorage = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = v; }
    };
  });

  afterEach(() => {
    delete global.localStorage;
  });

  it("updateURL skips the localStorage write while suppressPersist is set", () => {
    Calc.V.price = 99000000;
    Calc.suppressPersist = true;
    Calc.updateURL();
    expect(store[STORAGE_KEY]).toBeUndefined();
  });

  it("updateURL persists normally once suppressPersist is cleared", () => {
    Calc.V.price = 99000000;
    Calc.suppressPersist = false;
    Calc.updateURL();
    expect(JSON.parse(store[STORAGE_KEY]).V.price).toBe(99000000);
  });
});

describe("buildQueryString / loadFromURL round-trip", () => {
  it("encodes only fields that differ from their default, under the mapped short key", () => {
    Calc.V.price = 20000000;
    Calc.V.horizon = 15;
    Calc.mode = "let";
    const qs = Calc.buildQueryString();
    expect(qs).toContain("p=20000000");
    expect(qs).toContain("h=15");
    expect(qs).toContain("m=let");
    expect(qs).not.toContain("mr="); // rate untouched, stays at default, omitted
  });

  it("omits everything when every field is at its default", () => {
    expect(Calc.buildQueryString()).toBe("");
  });

  it("round-trips: encode then decode reproduces the original scenario", () => {
    Calc.V.price = 30000000;
    Calc.V.rate = 12;
    Calc.V.horizon = 25;
    Calc.mode = "let";
    Calc.applyCurrency("USD");
    const qs = Calc.buildQueryString();

    Calc.resetToDefaults();
    Calc.loadFromURL("?" + qs);

    expect(Calc.V.price).toBe(30000000);
    expect(Calc.V.rate).toBe(12);
    expect(Calc.V.horizon).toBe(25);
    expect(Calc.mode).toBe("let");
    expect(Calc.cur.code).toBe("USD");
  });
});

describe("mode branching in simulate()", () => {
  it("live mode compares against the renter's own rent and applies the interest-relief cap", () => {
    Calc.mode = "live";
    const s = Calc.simulate();
    expect(s.yr1.rent).toBeGreaterThan(0);
    expect(s.yr1.income).toBe(0);
  });

  it("let mode applies vacancy/management deductions and taxes positive rental profit, and drops the renter comparison", () => {
    Calc.mode = "let";
    const s = Calc.simulate();
    expect(s.yr1.rent).toBe(0);
    expect(s.yr1.income).toBeGreaterThan(0);
    // netIncome = grossIncome * (1 - vacancy%) * (1 - mgmt%), both < gross
    const grossApprox = Calc.V.income; // month 1, before rent growth compounding
    expect(s.yr1.income).toBeLessThan(grossApprox);
  });
});

describe("formatting", () => {
  it("fmt renders zero, negative, and large values with the currency symbol", () => {
    expect(Calc.fmt(0)).toBe("KSh0");
    expect(Calc.fmt(-1500)).toBe("KSh-1,500");
    expect(Calc.fmt(1234567)).toBe("KSh1,234,567");
  });

  it("fmt scales by the active currency's rate", () => {
    Calc.applyCurrency("USD");
    expect(Calc.fmt(1000000)).toBe("$7,700");
  });

  it("fmtC compacts large magnitudes with B/M/k suffixes", () => {
    expect(Calc.fmtC(0)).toBe("KSh0");
    expect(Calc.fmtC(-2500000000)).toBe("-KSh2.5B");
    expect(Calc.fmtC(7600000)).toBe("KSh7.6M");
    expect(Calc.fmtC(4300)).toBe("KSh4k");
  });

  it("pctS rounds to one decimal place", () => {
    expect(Calc.pctS(8.049)).toBe("8%");
    expect(Calc.pctS(-0.04)).toBe("0%");
  });
});
