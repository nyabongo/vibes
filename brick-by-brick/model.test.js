import { describe, it, expect, beforeEach } from "vitest";
import Brick from "./model.js";

const V = () => Brick.V;
const near = (a, b, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

beforeEach(() => {
  Brick.resetToDefaults();
  Brick.suppressPersist = false;
});

describe("what the house costs", () => {
  it("builds the cost from area, rate, permits and wastage", () => {
    const c = Brick.costs();
    const shell = V().sqm * V().costPerSqm;
    near(c.shell, shell);
    near(c.permits, shell * V().permitsPct / 100);
    near(c.wastage, (shell + c.permits) * V().wastagePct / 100);
    near(c.baseCost, c.shell + c.permits + c.wastage);
  });

  it("charges wastage on the permits too, not just the shell", () => {
    // Supervision fees are spent on a site that also loses materials; a
    // wastage figure applied to the shell alone quietly understates the build.
    V().permitsPct = 10;
    V().wastagePct = 10;
    const c = Brick.costs();
    near(c.wastage, (c.shell + c.permits) * 0.1);
    expect(c.wastage).toBeGreaterThan(c.shell * 0.1);
  });

  it("takes a cost-per-square-metre override without touching V", () => {
    const before = V().costPerSqm;
    const c = Brick.costs({ costPerSqm: 1000 });
    near(c.shell, V().sqm * 1000);
    expect(V().costPerSqm).toBe(before);
  });
});

describe("the two paths are fed the same money", () => {
  it("is a dead heat when there is nothing to buy and nothing to build", () => {
    // The whole comparison rests on both sides seeing the same wallet every
    // month. Strip out the plot and the house and any leak shows up at once.
    V().landCost = 0;
    V().landFeesPct = 0;
    V().sqm = 30;
    V().costPerSqm = 0;
    const s = Brick.simulate();
    expect(s.baseCost).toBe(0);
    s.series.forEach((p) => near(p.build, p.invest, 1e-9));
  });

  it("never builds and never moves in when there is no money at all", () => {
    V().savings = 0;
    V().saveMonthly = 0;
    const s = Brick.simulate();
    expect(s.progressAtHorizon).toBe(0);
    expect(s.neverBuysLand).toBe(true);
    expect(s.moveInYear).toBe(null);
    s.series.forEach((p) => near(p.build, p.invest, 1e-9));
  });

  it("grows the renter's portfolio at exactly the net return on the same contributions", () => {
    const s = Brick.simulate();
    const gInv = Brick.mrate(Brick.netInvestReturn());
    const gInc = Brick.mrate(V().incomeGrowth);
    let pot = V().savings;
    for (let m = 1; m <= Math.round(V().horizon * 12); m++) {
      pot *= 1 + gInv;
      pot += V().saveMonthly * Math.pow(1 + gInc, m);
    }
    near(s.finalInvest, pot, 1e-6);
  });

  it("nets tax and fees off the investment return on both sides", () => {
    near(Brick.netInvestReturn(), V().invest * (1 - V().investTax / 100) - V().investFee);
    near(Brick.netInvestReturn({ invest: 20 }), 20 * (1 - V().investTax / 100) - V().investFee);
  });
});

describe("the plot comes first", () => {
  it("waits until the plot is affordable rather than buying on day one", () => {
    V().savings = 0;
    const s = Brick.simulate();
    expect(s.landYear).toBeGreaterThan(0);
    expect(s.neverBuysLand).toBe(false);
  });

  it("buys sooner with more saved", () => {
    V().savings = 0;
    const slow = Brick.simulate().landYear;
    V().savings = V().landCost * 2;
    const fast = Brick.simulate().landYear;
    expect(fast).toBeLessThan(slow);
  });

  it("never breaks ground on a plot it cannot afford", () => {
    V().landCost = 1e11;
    const s = Brick.simulate();
    expect(s.neverBuysLand).toBe(true);
    expect(s.progressAtHorizon).toBe(0);
    expect(s.sunk).toBe(0);
  });
});

describe("progress is tracked as a share of the house, not as shillings", () => {
  it("finishes the house when the budget outruns construction inflation", () => {
    const s = Brick.simulate();
    expect(s.neverFinishes).toBe(false);
    expect(s.finishYear).toBeGreaterThan(0);
    near(s.progressAtHorizon, 1);
  });

  it("never finishes when construction inflation outruns the money going in", () => {
    // The headline behaviour of this calculator, and the reason progress is a
    // fraction of the house rather than a running total of shillings: a target
    // that inflates faster than the budget grows is never reached, and the
    // model has to say so instead of quietly extrapolating a finish date.
    V().buildInflation = 20;
    V().incomeGrowth = 2;
    V().saveMonthly = V().saveMonthly / 6;
    const s = Brick.simulate();
    expect(s.neverFinishes).toBe(true);
    expect(s.finishYear).toBe(null);
    expect(s.progressAtHorizon).toBeGreaterThan(0);
    expect(s.progressAtHorizon).toBeLessThan(1);
  });

  it("gets further along the longer it runs, but still short of the finish", () => {
    V().buildInflation = 20;
    V().incomeGrowth = 2;
    V().saveMonthly = V().saveMonthly / 6;
    const short = Brick.simulate({ horizon: 10 }).progressAtHorizon;
    const long = Brick.simulate({ horizon: 40 }).progressAtHorizon;
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThan(1);
  });

  it("stops at exactly complete rather than overshooting", () => {
    V().saveMonthly = V().saveMonthly * 20;
    const s = Brick.simulate();
    expect(s.progressAtHorizon).toBe(1);
    s.series.forEach((p) => expect(p.progress).toBeLessThanOrEqual(1));
  });

  it("never runs backwards when the month costs more than it brings in", () => {
    // Running costs above the monthly wallet drive the pot negative, which is a
    // real way to live. Feeding that straight into the spend would have the
    // build un-pouring concrete to pay a bill.
    V().ownCost = 1e12;
    const s = Brick.simulate();
    let last = 0;
    s.series.forEach((p) => {
      expect(p.progress).toBeGreaterThanOrEqual(last);
      expect(p.progress).toBeGreaterThanOrEqual(0);
      last = p.progress;
    });
    expect(s.sunk).toBeGreaterThanOrEqual(0);
    if (s.monthlyAfter) expect(s.monthlyAfter.build).toBeGreaterThanOrEqual(0);
  });

  it("treats a house with no cost as nothing to build, not as instantly done", () => {
    V().sqm = 30;
    V().costPerSqm = 0;
    const s = Brick.simulate();
    expect(s.progressAtHorizon).toBe(0);
    expect(s.finishYear).toBe(null);
    expect(s.moveInYear).toBe(null);
  });
});

describe("moving in", () => {
  it("moves in before the house is finished when building as you go", () => {
    const s = Brick.simulate();
    expect(s.moveInYear).toBeLessThan(s.finishYear);
  });

  it("never moves in later than it finishes", () => {
    [30, 55, 70, 100].forEach((at) => {
      Brick.resetToDefaults();
      V().moveInAt = at;
      const s = Brick.simulate();
      if (s.moveInYear !== null && s.finishYear !== null) {
        expect(s.moveInYear, "moveInAt=" + at).toBeLessThanOrEqual(s.finishYear);
      }
    });
  });

  it("moves in sooner the less finished you are willing to live with", () => {
    V().moveInAt = 90;
    const fussy = Brick.simulate().moveInYear;
    V().moveInAt = 40;
    const eager = Brick.simulate().moveInYear;
    expect(eager).toBeLessThan(fussy);
  });

  it("stops the rent at move-in", () => {
    const s = Brick.simulate();
    const gRent = Brick.mrate(V().rentGrowth);
    let paid = 0;
    for (let m = 1; m <= Math.round(s.moveInYear * 12); m++) {
      paid += V().rent * Math.pow(1 + gRent, m);
    }
    near(s.rentPaid, paid, 1e-6);
    expect(s.ownPaid).toBeGreaterThan(0);
  });

  it("pays rent for the whole horizon when it never moves in", () => {
    V().landCost = 1e11;
    const s = Brick.simulate();
    expect(s.moveInYear).toBe(null);
    expect(s.ownPaid).toBe(0);
    expect(s.rentPaid).toBeGreaterThan(0);
  });
});

describe("what the house is worth", () => {
  it("prices an unfinished house off the work in place at today's build cost", () => {
    // Not off nominal spend: on a ten-year build most of that money went in as
    // long-devalued shillings, which would value a nearly-finished house at a
    // fraction of a heap of sand.
    V().decayPct = 0;
    const s = Brick.simulate();
    const p = s.series.find((x) => x.progress > 0.2 && x.progress < 1);
    const costNow = s.baseCost * Math.pow(1 + Brick.mrate(V().buildInflation), p.m);
    near(p.house, p.progress * costNow * V().partBuiltPct / 100, 1e-6);
  });

  it("steps up at completion, because the last coat of paint is what unlocks the value", () => {
    const s = Brick.simulate();
    const before = s.series.filter((p) => p.progress < 1).pop();
    const after = s.series.find((p) => p.progress >= 1);
    expect(after.house).toBeGreaterThan(before.house);
  });

  it("docks an unfinished house for every year it stands in the weather", () => {
    V().decayPct = 0;
    const sound = Brick.simulate({ horizon: 4 });
    V().decayPct = 15;
    const rotting = Brick.simulate({ horizon: 4 });
    expect(rotting.series[4].house).toBeLessThan(sound.series[4].house);
  });

  it("leaves a finished house alone no matter what the decay knob says", () => {
    V().saveMonthly = V().saveMonthly * 20;
    V().decayPct = 0;
    const a = Brick.simulate().finalHouse;
    V().decayPct = 20;
    const b = Brick.simulate().finalHouse;
    near(a, b, 1e-6);
  });

  it("carries no house value at all before the first shilling is spent", () => {
    V().savings = 0;
    const s = Brick.simulate();
    const early = s.series.find((p) => p.progress === 0);
    expect(early.house).toBe(0);
  });
});

describe("the two modes", () => {
  it("moves in only on completion when saving first", () => {
    Brick.mode = "savefirst";
    const s = Brick.simulate();
    expect(s.moveInYear).toBe(s.finishYear);
  });

  it("breaks ground later the more it insists on saving up first", () => {
    Brick.mode = "savefirst";
    V().startAt = 30;
    const early = Brick.simulate();
    V().startAt = 140;
    const late = Brick.simulate();
    expect(late.finishYear).toBeGreaterThan(early.finishYear);
  });

  it("ignores the as-you-go knobs when saving first, and the reverse", () => {
    Brick.mode = "savefirst";
    V().moveInAt = 30;
    const a = Brick.simulate().finalBuild;
    V().moveInAt = 100;
    near(Brick.simulate().finalBuild, a, 1e-9);

    Brick.resetToDefaults();
    Brick.mode = "asyougo";
    V().startAt = 20;
    const b = Brick.simulate().finalBuild;
    V().startAt = 150;
    near(Brick.simulate().finalBuild, b, 1e-9);
  });

  it("takes a mode override without touching the live mode", () => {
    Brick.mode = "asyougo";
    const asIf = Brick.simulate({ mode: "savefirst" });
    expect(Brick.mode).toBe("asyougo");
    expect(asIf.moveInYear).toBe(asIf.finishYear);
  });

  it("slows to whatever cash there is rather than stalling when the push runs dry", () => {
    Brick.mode = "savefirst";
    V().startAt = 10;
    V().pushMonths = 3;
    const s = Brick.simulate();
    expect(s.finishYear).toBeGreaterThan(3 / 12);
    expect(s.neverFinishes).toBe(false);
  });
});

describe("the crossover", () => {
  it("means overtaking, not merely being level before either path has committed", () => {
    // Until the plot is paid for the two paths run identical arithmetic, so a
    // plain "first year build >= invest" scan — which is all the other two
    // calculators need — would report a crossover in year one.
    V().savings = 0;
    const s = Brick.simulate();
    const firstYear = s.series[1];
    near(firstYear.build, firstYear.invest, 1e-9);
    expect(s.breakEven === null || s.breakEven > 1).toBe(true);
  });

  it("matches a hand-rolled scan of the same series", () => {
    V().apprec = 14;
    const s = Brick.simulate();
    let expected = null, behind = false;
    for (let i = 1; i < s.series.length; i++) {
      if (s.series[i].build < s.series[i].invest) behind = true;
      else if (behind) { expected = s.series[i].y; break; }
    }
    expect(s.breakEven).toBe(expected);
    expect(s.breakEven).not.toBe(null);
  });

  it("reports no crossover rather than extrapolating past the horizon", () => {
    V().invest = 30;
    const s = Brick.simulate();
    expect(s.breakEven).toBe(null);
    expect(s.finalBuild).toBeLessThan(s.finalInvest);
  });

  it("reads the verdict off the last point of the series", () => {
    const s = Brick.simulate();
    const last = s.series[s.series.length - 1];
    near(s.finalBuild, last.build);
    near(s.finalInvest, last.invest);
    expect(last.y).toBe(V().horizon);
  });

  it("lands a final snapshot on the horizon even when it is not a whole number of years", () => {
    const s = Brick.simulate({ horizon: 10.5 });
    expect(s.series[s.series.length - 1].y).toBe(10.5);
  });
});

describe("the representative month either side of the flip", () => {
  const both = (s) => [s.monthlyBefore, s.monthlyAfter].filter(Boolean);

  it("picks months the build is paying for out of that month's income", () => {
    // The first month of a build is almost always the savings pile going into
    // the ground, which is not what "where the money goes each month" means.
    ["asyougo", "savefirst"].forEach((mode) => {
      Brick.resetToDefaults();
      Brick.mode = mode;
      const s = Brick.simulate();
      expect(both(s).length, mode).toBe(2);
      both(s).forEach((p) => {
        expect(p.steady, mode).toBe(true);
        expect(p.drawn, mode).toBe(0);
      });
    });
  });

  it("never reports a negative slice, whatever the scenario", () => {
    [{ startAt: 150 }, { moveInAt: 100 }, { saveMonthly: 1 }, { sqm: 600 }].forEach((over) => {
      Brick.resetToDefaults();
      Object.assign(V(), over);
      both(Brick.simulate()).forEach((p) => {
        expect(p.build, JSON.stringify(over)).toBeGreaterThanOrEqual(0);
        expect(p.saved, JSON.stringify(over)).toBeGreaterThanOrEqual(0);
        expect(p.drawn, JSON.stringify(over)).toBeGreaterThanOrEqual(0);
      });
    });
  });

  it("stops paying rent in the month it reports as after the move", () => {
    const s = Brick.simulate();
    expect(s.monthlyBefore.rent).toBeGreaterThan(0);
    expect(s.monthlyAfter.rent).toBe(undefined);
    expect(s.monthlyAfter.own).toBeGreaterThan(0);
    expect(s.monthlyAfter.m).toBeGreaterThan(s.moveInYear * 12 - 1);
  });

  it("owns up to the savings drawn down when a month outspends its income", () => {
    // A one-month push cannot be funded out of one month's salary, and the
    // panel has to say where the rest came from rather than imply an income.
    Brick.mode = "savefirst";
    V().startAt = 120;
    V().pushMonths = 3;
    const p = Brick.simulate().monthlyBefore;
    expect(p.steady).toBe(false);
    expect(p.drawn).toBeGreaterThan(0);
  });

  it("reports nothing on either side when nothing is ever built", () => {
    V().landCost = 1e11;
    const s = Brick.simulate();
    expect(s.monthlyBefore).toBe(null);
    expect(s.monthlyAfter).toBe(null);
  });
});

describe("solve", () => {
  it("finds the return at which the two paths tie", () => {
    const r = Brick.solve("invest", 0, 30);
    expect(r).not.toBe(null);
    const s = Brick.simulate({ invest: r });
    near(s.finalBuild, s.finalInvest, 1);
  });

  it("finds the appreciation rate at which the two paths tie", () => {
    const r = Brick.solve("apprec", -5, 20);
    expect(r).not.toBe(null);
    const s = Brick.simulate({ apprec: r });
    near(s.finalBuild, s.finalInvest, 1);
  });

  it("returns nothing when the verdict never changes sign across the range", () => {
    expect(Brick.solve("invest", 25, 30)).toBe(null);
  });

  it("leaves the live scenario untouched", () => {
    const before = { ...V() };
    Brick.solve("invest", 0, 30);
    Brick.solve("costPerSqm", 0, 1e6);
    expect({ ...V() }).toEqual(before);
  });

  it("accepts an override for every knob the flip panel offers", () => {
    ["invest", "apprec", "rent", "costPerSqm", "saveMonthly", "buildInflation"].forEach((k) => {
      const base = Brick.simulate().finalBuild;
      const o = {};
      o[k] = Brick.FIELD_BY_KEY[k].type === "money" ? V()[k] * 2 : V()[k] + 3;
      expect(Brick.simulate(o).finalBuild, k).not.toBe(base);
    });
  });
});

describe("sharing a scenario", () => {
  it("puts nothing in the query string for an untouched scenario", () => {
    expect(Brick.buildQueryString()).toBe("");
  });

  it("carries only what was changed", () => {
    V().sqm = 200;
    const params = new URLSearchParams(Brick.buildQueryString());
    expect(params.get("sqm")).toBe("200");
    expect(params.has("cps")).toBe(false);
  });

  it("omits the mode and currency while they are still the defaults", () => {
    const params = new URLSearchParams(Brick.buildQueryString());
    expect(params.has("m")).toBe(false);
    expect(params.has("c")).toBe(false);
    Brick.mode = "savefirst";
    Brick.applyCurrency("KES");
    const changed = new URLSearchParams(Brick.buildQueryString());
    expect(changed.get("m")).toBe("savefirst");
    expect(changed.get("c")).toBe("KES");
  });

  it("round-trips every parameter through the query string", () => {
    Object.keys(Brick.PARAM_MAP).forEach((k) => {
      const f = Brick.FIELD_BY_KEY[k];
      V()[k] = f.type === "money" ? V()[k] + 1234 : Brick.clampToField(k, V()[k] + 1);
    });
    const qs = Brick.buildQueryString();
    const changed = { ...V() };
    Brick.resetToDefaults();
    Brick.loadFromURL("?" + qs);
    Object.keys(Brick.PARAM_MAP).forEach((k) => near(V()[k], changed[k], 1e-9));
  });

  it("replaces the whole scenario rather than patching it", () => {
    // A shared link has to mean the same thing to everyone who opens it,
    // whatever the visitor last had saved.
    V().sqm = 400;
    V().invest = 25;
    Brick.resetToDefaults();
    Brick.loadFromURL("?sqm=200");
    expect(V().sqm).toBe(200);
    expect(V().invest).toBe(Brick.DEFAULTS.invest);
  });

  it("treats an unrecognised mode as the default", () => {
    Brick.loadFromURL("?m=nonsense");
    expect(Brick.mode).toBe("asyougo");
    Brick.loadFromURL("?m=savefirst");
    expect(Brick.mode).toBe("savefirst");
  });

  it("ignores an unrecognised currency instead of blanking the display", () => {
    Brick.loadFromURL("?c=ZZZ");
    expect(Brick.cur.code).toBe("UGX");
  });

  it("spots a scenario link, and ignores one carrying only tracking junk", () => {
    expect(Brick.hasScenarioParams("?sqm=200")).toBe(true);
    expect(Brick.hasScenarioParams("?m=savefirst")).toBe(true);
    expect(Brick.hasScenarioParams("?c=USD")).toBe(true);
    expect(Brick.hasScenarioParams("?utm_source=x&fbclid=y")).toBe(false);
    expect(Brick.hasScenarioParams("")).toBe(false);
  });

  it("does not resolve inherited object members as parameters", () => {
    expect(Brick.paramKey("constructor")).toBe(undefined);
    expect(Brick.paramKey("toString")).toBe(undefined);
    expect(Brick.hasScenarioParams("?constructor=1&toString=2")).toBe(false);
  });

  it("ignores a value that is not a number", () => {
    Brick.loadFromURL("?sqm=abc");
    expect(V().sqm).toBe(Brick.DEFAULTS.sqm);
  });
});

describe("clamping", () => {
  it("holds sliders inside their own range", () => {
    expect(Brick.clampToField("invest", 999)).toBe(Brick.FIELD_BY_KEY.invest.max);
    expect(Brick.clampToField("invest", -999)).toBe(Brick.FIELD_BY_KEY.invest.min);
    expect(Brick.clampToField("sqm", 10000)).toBe(Brick.FIELD_BY_KEY.sqm.max);
    expect(Brick.clampToField("apprec", -99)).toBe(Brick.FIELD_BY_KEY.apprec.min);
  });

  it("holds money at or above zero and below the cap", () => {
    expect(Brick.clampToField("landCost", -5)).toBe(0);
    expect(Brick.clampToField("landCost", 1e15)).toBe(1e12);
  });

  it("passes through a key it does not know", () => {
    expect(Brick.clampToField("nosuchfield", 42)).toBe(42);
  });

  it("clamps on the way in from a URL", () => {
    Brick.loadFromURL("?inv=999");
    expect(V().invest).toBe(Brick.FIELD_BY_KEY.invest.max);
  });
});

describe("restoring a saved scenario", () => {
  it("restores values, mode and currency", () => {
    const raw = JSON.stringify({ V: { sqm: 250 }, mode: "savefirst", cur: "USD" });
    Brick.loadFromStorage(raw);
    expect(V().sqm).toBe(250);
    expect(Brick.mode).toBe("savefirst");
    expect(Brick.cur.code).toBe("USD");
  });

  it("rejects anything that is not a finite number", () => {
    Brick.loadFromStorage(JSON.stringify({ V: { sqm: "200", invest: null, apprec: 1e999 } }));
    expect(V().sqm).toBe(Brick.DEFAULTS.sqm);
    expect(V().invest).toBe(Brick.DEFAULTS.invest);
    expect(V().apprec).toBe(Brick.DEFAULTS.apprec);
  });

  it("clamps what it restores", () => {
    Brick.loadFromStorage(JSON.stringify({ V: { invest: 999 } }));
    expect(V().invest).toBe(Brick.FIELD_BY_KEY.invest.max);
  });

  it("ignores a key the scenario does not have", () => {
    Brick.loadFromStorage(JSON.stringify({ V: { nosuchfield: 1 } }));
    expect(V().nosuchfield).toBe(undefined);
  });

  it("cannot be used to reach Object.prototype", () => {
    Brick.loadFromStorage('{"V":{"__proto__":{"polluted":1}}}');
    expect({}.polluted).toBe(undefined);
    Brick.loadFromStorage('{"V":{"constructor":1,"toString":2}}');
    expect(typeof {}.toString).toBe("function");
  });

  it("survives junk without throwing", () => {
    expect(() => Brick.loadFromStorage("not json")).not.toThrow();
    expect(() => Brick.loadFromStorage("")).not.toThrow();
    expect(() => Brick.loadFromStorage("null")).not.toThrow();
    expect(V().sqm).toBe(Brick.DEFAULTS.sqm);
  });

  it("takes only a mode it recognises", () => {
    Brick.loadFromStorage(JSON.stringify({ V: {}, mode: "nonsense" }));
    expect(Brick.mode).toBe("asyougo");
  });
});

describe("persistence is gated while a shared link is open", () => {
  it("writes when it is not suppressed, and stays quiet when it is", () => {
    const writes = [];
    globalThis.localStorage = { setItem: (k, v) => writes.push([k, v]), getItem: () => null };
    try {
      Brick.suppressPersist = false;
      Brick.updateURL();
      expect(writes.length).toBe(1);
      expect(writes[0][0]).toBe("brickByBrick.v1");

      Brick.suppressPersist = true;
      Brick.updateURL();
      expect(writes.length).toBe(1);
    } finally {
      delete globalThis.localStorage;
      Brick.suppressPersist = false;
    }
  });
});

describe("worked examples", () => {
  it("round-trips unchanged, so none is clamped or already the default", () => {
    Brick.EXAMPLES.forEach((ex) => {
      const search = "?" + new URLSearchParams(ex.params).toString();
      Brick.resetToDefaults();
      Brick.loadFromURL(search);
      const sort = (p) => [...p].sort((a, b) => a[0].localeCompare(b[0]));
      expect(sort(new URLSearchParams(Brick.buildQueryString())), ex.label)
        .toEqual(sort(new URLSearchParams(search)));
    });
  });

  it("shows a house that is never finished, as its label claims", () => {
    const ex = Brick.EXAMPLES.find((e) => /never gets finished/.test(e.label));
    Brick.resetToDefaults();
    Brick.loadFromURL("?" + new URLSearchParams(ex.params).toString());
    expect(Brick.simulate().neverFinishes).toBe(true);
  });
});

describe("display", () => {
  it("opens in Ugandan shillings", () => {
    expect(Brick.DEFAULT_CUR_CODE).toBe("UGX");
    expect(Brick.cur.code).toBe("UGX");
  });

  it("shows every money default as a round figure in shillings", () => {
    // The defaults are stored in KES like every other tool here, but chosen so
    // this one opens on numbers a Ugandan reader recognises. A tidy-up that
    // rounded them in KES would quietly wreck that.
    ["savings", "saveMonthly", "landCost", "costPerSqm", "rent", "ownCost"].forEach((k) => {
      const shown = Math.round(Brick.DEFAULTS[k] * 28.7);
      expect(shown % 10000, k + " shows as " + shown).toBe(0);
    });
  });

  it("converts for display without touching the stored value", () => {
    expect(Brick.fmt(1000)).toBe("USh28,700");
    Brick.applyCurrency("KES");
    expect(Brick.fmt(1000)).toBe("KSh1,000");
    expect(V().landCost).toBe(Brick.DEFAULTS.landCost);
  });

  it("marks a negative with a real minus sign", () => {
    Brick.applyCurrency("KES");
    expect(Brick.fmt(-1000)).toBe("−KSh1,000");
  });

  it("shortens big numbers for the axis", () => {
    Brick.applyCurrency("KES");
    expect(Brick.fmtC(2_500_000_000)).toBe("KSh2.5B");
    expect(Brick.fmtC(1_000_000)).toBe("KSh1M");
    expect(Brick.fmtC(45_000)).toBe("KSh45k");
    expect(Brick.fmtC(120)).toBe("KSh120");
    expect(Brick.fmtC(-1_000_000)).toBe("−KSh1M");
  });

  it("rounds percentages to one decimal", () => {
    expect(Brick.pctS(7.04)).toBe("7%");
    expect(Brick.pctS(7.46)).toBe("7.5%");
  });

  it("rejects a currency it does not carry", () => {
    expect(Brick.applyCurrency("ZZZ")).toBe(false);
    expect(Brick.cur.code).toBe("UGX");
    expect(Brick.applyCurrency("KES")).toBe(true);
  });
});

describe("the engine exposes what the spec renderer needs", () => {
  it("carries all nine required members", () => {
    ["PARAM_MAP", "FIELDS", "DEFAULTS", "SECTION_META", "MODE_META",
     "EXAMPLES", "CURRENCIES", "DEFAULT_MODE", "DEFAULT_CUR_CODE"].forEach((k) => {
      expect(Brick[k], k).not.toBe(undefined);
      expect(Brick[k], k).not.toBe(null);
    });
  });

  it("maps every scenario value to a short parameter name", () => {
    expect(Object.keys(Brick.V).sort()).toEqual(Object.keys(Brick.PARAM_MAP).sort());
  });

  it("keeps the short names clear of the reserved mode and currency params", () => {
    const shorts = Object.values(Brick.PARAM_MAP);
    expect(shorts).not.toContain("m");
    expect(shorts).not.toContain("c");
    expect(new Set(shorts).size).toBe(shorts.length);
  });

  it("gives every field a home in exactly one section", () => {
    const flat = Object.keys(Brick.FIELDS).flatMap((id) => Brick.FIELDS[id].map((f) => f.k));
    expect(flat.sort()).toEqual(Object.keys(Brick.PARAM_MAP).sort());
  });

  it("describes every section, and gates one to each mode", () => {
    expect(Object.keys(Brick.SECTION_META).sort()).toEqual(Object.keys(Brick.FIELDS).sort());
    const gated = Object.values(Brick.SECTION_META).filter((s) => s.mode).map((s) => s.mode);
    expect(gated.sort()).toEqual(["asyougo", "savefirst"]);
  });

  it("offers exactly two modes, the default among them", () => {
    const values = Brick.MODE_META.values.map((v) => v.value);
    expect(values.length).toBe(2);
    expect(values).toContain(Brick.DEFAULT_MODE);
  });
});
