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
    expect(Calc.solve("appr", -8, 30)).toBeCloseTo(11.611, 2);
    expect(Calc.solve("invest", 0, 30)).toBeCloseTo(3.811, 2);
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

  it("only accepts keys that are V's own fields, not ones merely inherited via the prototype chain", () => {
    const raw = '{"V":{"price":123456,"constructor":777,"toString":42}}';
    Calc.loadFromStorage(raw);
    expect(Calc.V.price).toBe(123456);
    expect(Object.prototype.hasOwnProperty.call(Calc.V, "constructor")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Calc.V, "toString")).toBe(false);
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

describe("the worked examples published in llms.txt", () => {
  /* Re-emitting a link must reproduce it exactly. One assertion catches all
     four ways a documented example can quietly lie: a value outside the
     field's range (silently clamped), a short name that isn't a real param
     (silently ignored), a param set to its own default (dropped from the
     re-emitted query), and a mode or currency value that didn't take. */
  it("each round-trips through loadFromURL/buildQueryString unchanged", () => {
    Calc.EXAMPLES.forEach((ex) => {
      const qs = new URLSearchParams(ex.params).toString();
      Calc.resetToDefaults();
      expect(Calc.hasScenarioParams("?" + qs), ex.label).toBe(true);
      Calc.loadFromURL("?" + qs);

      const sort = (p) => [...p].sort((a, b) => a[0].localeCompare(b[0]));
      expect(sort(new URLSearchParams(Calc.buildQueryString())), ex.label)
        .toEqual(sort(new URLSearchParams(qs)));
    });
  });

  it("every example carries a label, so the docs never print a bare URL", () => {
    expect(Calc.EXAMPLES.length).toBeGreaterThan(0);
    Calc.EXAMPLES.forEach((ex) => {
      expect(typeof ex.label).toBe("string");
      expect(ex.label.length).toBeGreaterThan(0);
    });
  });
});

describe("month one is today, so nothing has grown yet (regression: issue #9)", () => {
  /* A one-month run makes month 1 readable on its own: months = round(1/12*12)
     = 1, and yr1 divides by min(12, months), so every yr1 figure IS month 1. */
  const ONE_MONTH = { horizon: 1 / 12 };

  it("charges month one's rent at the figure the visitor typed, with no growth applied", () => {
    const s = Calc.simulate(ONE_MONTH);
    expect(s.yr1.rent).toBeCloseTo(Calc.V.rent, 6);
  });

  it("charges month one's insurance and service charge before any inflation", () => {
    const s = Calc.simulate(ONE_MONTH);
    expect(s.yr1.ins).toBeCloseTo(Calc.V.insurance / 12, 6);
    expect(s.yr1.hoa).toBeCloseTo(Calc.V.hoa, 6);
  });

  it("collects month one's rent at the figure the visitor typed, in let mode", () => {
    Calc.mode = "let";
    const s = Calc.simulate(ONE_MONTH);
    const net = Calc.V.income * (1 - Calc.V.vacancy / 100) * (1 - Calc.V.mgmt / 100);
    expect(s.yr1.income).toBeCloseTo(net, 6);
  });

  it("rates and upkeep in month one sit on the price paid, not on an already-appreciated value", () => {
    // `home` needs no exponent — it appreciates at the end of the loop body, so
    // it is already on the same "month 1 is today" footing as the exponents.
    const s = Calc.simulate(ONE_MONTH);
    expect(s.yr1.tax).toBeCloseTo((Calc.V.price * Calc.V.taxPct) / 100 / 12, 6);
    expect(s.yr1.mnt).toBeCloseTo((Calc.V.price * Calc.V.maintPct) / 100 / 12, 6);
  });

  it("averages months 0-11 for the year-one panel, matching the label", () => {
    const g = Calc.mrate(Calc.V.rentGrowth);
    let sum = 0;
    for (let m = 0; m < 12; m++) sum += Calc.V.rent * Math.pow(1 + g, m);
    expect(Calc.simulate().yr1.rent).toBeCloseTo(sum / 12, 6);
  });
});

describe("a month's saving earns nothing in the month it is made (regression: issue #9)", () => {
  const ONE_MONTH = { horizon: 1 / 12 };
  const lump = () => (Calc.V.price * (Calc.V.downPct + Calc.V.closingPct)) / 100;

  it("leaves the renter's pot untouched by the investment return when there is no opening lump", () => {
    // Nothing is in the pot when the month starts, so the return has nothing to
    // act on — the pot is the month's saving and no more, whatever the rate.
    Calc.V.downPct = 0;
    Calc.V.closingPct = 0;
    const slow = Calc.simulate({ ...ONE_MONTH, invest: 4 }).finalRent;
    const fast = Calc.simulate({ ...ONE_MONTH, invest: 25 }).finalRent;
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeCloseTo(slow, 6);
  });

  it("still pays the opening deposit-and-costs lump its full first month", () => {
    // Raising the return can only move the one-month pot by a month's return on
    // the lump. Anything more means the contribution was paid a return too.
    const flat = Calc.simulate({ ...ONE_MONTH, invest: 0 }).finalRent;
    const grown = Calc.simulate({ ...ONE_MONTH, invest: 12 }).finalRent;
    expect(grown - flat).toBeCloseTo(lump() * Calc.mrate(12), 6);
  });

  it("treats the buyer's pot the same way when renting is the dearer path", () => {
    Calc.V.rent = 250000; // renting now costs more, so the buyer does the saving
    Calc.V.downPct = 0;
    Calc.V.closingPct = 0;
    const pot = (invest) => {
      const s = Calc.simulate({ ...ONE_MONTH, invest: invest });
      return s.series[s.series.length - 1].pot;
    };
    expect(pot(4)).toBeGreaterThan(0);
    expect(pot(25)).toBeCloseTo(pot(4), 6);
  });
});

describe("rental losses carry forward against later profits (regression: issue #8)", () => {
  /* A leveraged let runs at a loss while interest dominates and turns
     profitable later, as rent grows and the balance amortises. Each month's
     loss is banked and offset against the profit that follows, so what gets
     taxed is cumulative profit, not the sum of the profitable months. */

  const leveragedLet = () => {
    Calc.mode = "let";
    Calc.V.price = 12000000;
    Calc.V.downPct = 10;
    Calc.V.income = 140000;
  };

  /* The rental tax charged over a whole run isn't reported directly, but the
     marginal rate reaches finalBuy through nothing else in let mode: the gap
     between finalBuy at the real rate and at a rate of zero IS the tax, with
     its forgone investment return. It collapses to exactly nothing when no
     tax is due, which is the case this issue is about. */
  const taxCost = (opts) => {
    const rate = Calc.V.marginal;
    const taxed = Calc.simulate(opts).finalBuy;
    Calc.V.marginal = 0;
    const untaxed = Calc.simulate(opts).finalBuy;
    Calc.V.marginal = rate;
    return untaxed - taxed;
  };

  /* Year one's annual net rental profit, rebuilt from the panel's own monthly
     averages — the same figures the "Tax on rent" bar segment sits beside. */
  const yr1Profit = (s) =>
    12 * (s.yr1.income - s.yr1.interest - s.yr1.tax - s.yr1.ins - s.yr1.mnt - s.yr1.hoa);

  it("charges nothing for a year that nets a loss, even though some of its months ran at a profit", () => {
    // Rent growing at 20% turns the last months of year one profitable while
    // the year as a whole still loses money. Taxing month by month billed
    // those four months in full; the banked losses cancel them.
    Calc.mode = "let";
    Calc.V.price = 12000000;
    Calc.V.downPct = 10;
    Calc.V.income = 160000;
    Calc.V.rentGrowth = 20;
    const s = Calc.simulate({ horizon: 1 });
    expect(yr1Profit(s)).toBeLessThan(0); // the year is a net loss...
    expect(s.yr1.itax).toBe(0); // ...so nothing is owed on it
  });

  it("taxes year one on the year's net profit, not on its profitable months alone", () => {
    // Same shape, higher rent: now year one ends ahead. Profit improves month
    // on month here, so cumulative profit is the whole tax base and the bill
    // is just the marginal rate applied to it.
    Calc.mode = "let";
    Calc.V.price = 12000000;
    Calc.V.downPct = 10;
    Calc.V.income = 170000;
    Calc.V.rentGrowth = 20;
    const s = Calc.simulate({ horizon: 1 });
    expect(yr1Profit(s)).toBeGreaterThan(0);
    expect(12 * s.yr1.itax).toBeCloseTo((yr1Profit(s) * Calc.V.marginal) / 100, 6);
  });

  it("leaves the issue's leveraged let untaxed for ten years, while its early losses are still unpaid", () => {
    // The first profitable month is month 65, but the losses of years 1-5
    // aren't worked off until year 11. Discarding them started the tax bill
    // in year 6.
    leveragedLet();
    expect(taxCost({ horizon: 10 })).toBeCloseTo(0, 6);
  });

  it("starts taxing once the banked losses run out, so the carry can't shelter the let forever", () => {
    leveragedLet();
    expect(taxCost({ horizon: 11 })).toBeGreaterThan(0);
    expect(taxCost({ horizon: 30 })).toBeGreaterThan(0);
  });

  it("owes nothing at any marginal rate on a let that has never been cumulatively profitable", () => {
    // The defaults let out over 25 years: 117 of its 300 months run at a
    // profit, yet it is still nearly KSh 3M down overall. A banked loss is
    // never a refund either, so a punitive rate costs no more than a zero one.
    Calc.mode = "let";
    expect(taxCost({ horizon: 25 })).toBeCloseTo(0, 6);
    Calc.V.marginal = 60;
    expect(taxCost({ horizon: 25 })).toBeCloseTo(0, 6);
  });

  it("still taxes that same let once a longer hold puts it ahead", () => {
    // Pairs with the test above: proves the zero there is a real verdict on
    // the scenario and not a model that has stopped charging tax at all.
    Calc.mode = "let";
    expect(taxCost({ horizon: 40 })).toBeGreaterThan(0);
  });

  it("keeps the running loss inside one simulate() call, so repeated runs can't contaminate each other", () => {
    // solve() calls simulate() dozens of times with different arguments. A
    // loss balance held on the instance or the module would let a short,
    // loss-making trial hand its losses to the next run and understate its tax.
    leveragedLet();
    const first = Calc.simulate({ horizon: 30 }).finalBuy;
    Calc.simulate({ horizon: 5 }); // a run that ends deep in the red
    expect(Calc.simulate({ horizon: 30 }).finalBuy).toBe(first);
  });

  it("does nothing in live mode, which never computes a rental profit to lose", () => {
    Calc.mode = "live";
    const base = Calc.simulate({ horizon: 30 });
    expect(base.yr1.itax).toBe(0);
    Calc.V.income = 500000;
    Calc.V.vacancy = 35;
    Calc.V.mgmt = 20;
    const after = Calc.simulate({ horizon: 30 });
    expect(after.yr1.itax).toBe(0);
    expect(after.finalBuy).toBe(base.finalBuy);
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
