import { describe, it, expect, beforeEach } from "vitest";
import Model from "./model.js";

beforeEach(() => {
  Model.resetToDefaults();
});

describe("project cost composition", () => {
  it("applies fees to build cost and contingency to build plus fees, but never to land", () => {
    const c = Model.costs();
    const buildCost = Model.V.units * Model.V.costPerUnit;
    const softCost = buildCost * Model.V.feesPct / 100;
    const contingency = (buildCost + softCost) * Model.V.contingencyPct / 100;

    expect(c.buildCost).toBeCloseTo(buildCost, 6);
    expect(c.softCost).toBeCloseTo(softCost, 6);
    expect(c.contingency).toBeCloseTo(contingency, 6);
    expect(c.projectCost).toBeCloseTo(Model.V.land + buildCost + softCost + contingency, 6);
  });

  it("leaves land untouched when the build cost override moves", () => {
    const doubled = Model.costs({ costPerUnit: Model.V.costPerUnit * 2 });
    expect(doubled.land).toBe(Model.V.land);
    expect(doubled.buildCost).toBeCloseTo(Model.costs().buildCost * 2, 6);
  });

  it("reports the shortfall when the project costs more than the capital", () => {
    expect(Model.simulate().shortfall).toBe(0);
    Model.V.capital = 10000000;
    const s = Model.simulate();
    expect(s.shortfall).toBeCloseTo(s.projectCost - 10000000, 6);
    expect(isFinite(s.finalBuild)).toBe(true);
  });
});

describe("the two paths are the same instrument when there is nothing to build", () => {
  // The single most valuable invariant here: with no project at all, the build path is
  // just the investment. Any asymmetry between how the two pots compound shows up here.
  // Insurance and common-area costs are absolute figures rather than shares of the
  // project, so they have to be zeroed too — otherwise the build path is charged for
  // running a building that doesn't exist, which is correct but not what this tests.
  it("tracks the invest path exactly at every point in the series", () => {
    Model.V.land = 0;
    Model.V.units = 0;
    Model.V.insurance = 0;
    Model.V.commonCost = 0;
    Model.V.capital = 25000000;
    const s = Model.simulate();
    expect(s.projectCost).toBe(0);
    s.series.forEach((p) => {
      expect(p.build).toBeCloseTo(p.invest, 6);
    });
  });

  it("still charges the fixed running costs when a building is declared but earns nothing", () => {
    Model.V.rentUnit = 0;
    const s = Model.simulate();
    expect(s.stabYear.noi).toBeLessThan(0);
    expect(s.finalBuild).toBeLessThan(s.finalInvest);
  });
});

describe("the lump sum decides fundability, not the verdict", () => {
  // Capital enters both paths identically and linearly, so it cancels out of the gap.
  // That's a real consequence of charging any shortfall at the investment rate, and the
  // footer says so — if this ever stops holding, the footer is wrong.
  it("leaves the gap between the two paths unchanged", () => {
    const rich = Model.simulate();
    Model.V.capital = 12000000;
    const poor = Model.simulate();
    expect(poor.finalBuild - poor.finalInvest).toBeCloseTo(rich.finalBuild - rich.finalInvest, 4);
    expect(poor.breakEven).toBe(rich.breakEven);
  });

  it("still changes whether the project can be funded at all", () => {
    expect(Model.simulate().shortfall).toBe(0);
    Model.V.capital = 12000000;
    expect(Model.simulate().shortfall).toBeGreaterThan(0);
  });
});

describe("the construction period earns nothing", () => {
  it("collects no rent until after the build months have elapsed", () => {
    Model.V.buildMonths = 24;
    Model.V.horizon = 2;
    expect(Model.simulate().totalRent).toBe(0);
  });

  it("values the site at what has been sunk into it while it is still a building site", () => {
    Model.V.buildMonths = 24;
    const s = Model.simulate({ horizon: 1 });
    const c = Model.costs();
    const tranche = (c.projectCost - Model.V.land) / 24;
    // year 1 = land plus twelve monthly tranches
    expect(s.series[1].value).toBeCloseTo(Model.V.land + tranche * 12, 4);
  });

  it("flags a horizon that ends before the block is finished", () => {
    Model.V.buildMonths = 24;
    expect(Model.simulate({ horizon: 1 }).horizonBeforeCompletion).toBe(true);
    expect(Model.simulate({ horizon: 10 }).horizonBeforeCompletion).toBe(false);
  });
});

describe("undrawn capital keeps compounding while it waits", () => {
  it("leaves more in the pot at completion than plain subtraction would", () => {
    Model.V.rentUnit = 0; // isolate the drawdown from any rental income
    Model.V.buildMonths = 24;
    const s = Model.simulate({ horizon: 2 });
    const naive = Model.V.capital - s.projectCost;
    expect(s.series[2].pot).toBeGreaterThan(naive);
  });

  it("is what separates it from a model that ignores the float", () => {
    // With a zero return the float is worth nothing and the pot is exactly what's left.
    Model.V.rentUnit = 0;
    Model.V.invest = 0;
    Model.V.investTax = 0;
    Model.V.investFee = 0;
    Model.V.buildMonths = 24;
    const s = Model.simulate({ horizon: 2 });
    expect(s.series[2].pot).toBeCloseTo(Model.V.capital - s.projectCost, 4);
  });
});

describe("lease-up ramps occupancy instead of switching it on", () => {
  it("reaches exactly the long-run occupancy at the end of the ramp", () => {
    Model.V.leaseMonths = 6;
    const s = Model.simulate();
    // stabYear is captured at the first month the ramp completes
    expect(s.stabYear.m).toBe(Model.V.buildMonths + 6);
  });

  it("is fully let in the first month after handover when there is no ramp", () => {
    Model.V.leaseMonths = 0;
    const s = Model.simulate();
    expect(s.stabYear.m).toBe(Model.V.buildMonths + 1);
  });

  it("collects less over the hold than an identical block with no ramp", () => {
    const ramped = Model.simulate().totalRent;
    Model.V.leaseMonths = 0;
    const instant = Model.simulate().totalRent;
    expect(ramped).toBeLessThan(instant);
  });
});

describe("the exit is priced on stabilised income, not on cost", () => {
  it("exits at exactly cost when the exit yield equals the yield on cost", () => {
    const s = Model.simulate();
    const matched = Model.simulate({ capRate: s.yieldOnCost });
    expect(matched.valueAtCompletion).toBeCloseTo(matched.projectCost, 2);
    expect(matched.devMargin).toBeCloseTo(0, 2);
  });

  it("creates value when built at a higher yield than buyers demand, and destroys it below", () => {
    const s = Model.simulate();
    expect(Model.simulate({ capRate: s.yieldOnCost - 2 }).devMargin).toBeGreaterThan(0);
    expect(Model.simulate({ capRate: s.yieldOnCost + 2 }).devMargin).toBeLessThan(0);
  });

  it("is worth less the more yield a buyer demands, monotonically", () => {
    let prev = Infinity;
    for (let cap = 5; cap <= 15; cap += 1) {
      const v = Model.simulate({ capRate: cap }).finalBuild;
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });
});

describe("the net investment return nets tax and fees off the headline rate", () => {
  it("equals the headline rate when there is no tax and no fee", () => {
    Model.V.investTax = 0;
    Model.V.investFee = 0;
    expect(Model.netInvestReturn()).toBeCloseTo(Model.V.invest, 9);
  });

  it("compounds the invest path at exactly that rate for the whole horizon", () => {
    const s = Model.simulate();
    const months = Model.V.horizon * 12;
    const expected = Model.V.capital * Math.pow(1 + Model.mrate(Model.netInvestReturn()), months);
    expect(s.finalInvest).toBeCloseTo(expected, 4);
  });

  it("subtracts the management fee on top of withholding", () => {
    Model.V.invest = 10;
    Model.V.investTax = 20;
    Model.V.investFee = 1.5;
    expect(Model.netInvestReturn()).toBeCloseTo(10 * 0.8 - 1.5, 9);
  });
});

describe("the two rental tax regimes", () => {
  it("taxes gross rent under the flat regime even when the building loses money", () => {
    Model.mode = "gross";
    Model.V.commonCost = 5000000; // costs far exceed rent, so NOI is deeply negative
    const s = Model.simulate();
    expect(s.stabYear.noi).toBeLessThan(0);
    expect(s.stabYear.tax).toBeCloseTo(s.stabYear.gross * Model.V.flatPct / 100, 6);
    expect(s.stabYear.tax).toBeGreaterThan(0);
  });

  it("taxes nothing under the profit regime when there is no profit", () => {
    Model.mode = "net";
    Model.V.commonCost = 5000000;
    const s = Model.simulate();
    expect(s.stabYear.noi).toBeLessThan(0);
    expect(s.stabYear.tax).toBe(0);
  });

  it("takes the marginal rate on profit under the profit regime", () => {
    Model.mode = "net";
    const s = Model.simulate();
    expect(s.stabYear.tax).toBeCloseTo(s.stabYear.noi * Model.V.marginal / 100, 6);
  });

  it("can be overridden per-simulation so the other regime can be quoted", () => {
    Model.mode = "gross";
    const here = Model.simulate();
    const there = Model.simulate({ mode: "net" });
    expect(there.totalTax).not.toBeCloseTo(here.totalTax, 2);
    expect(Model.mode).toBe("gross"); // the override must not leak into module state
  });
});

describe("solve()", () => {
  it("finds the rent at which the two paths tie, and it beats the current rent when investing wins", () => {
    const s = Model.simulate();
    const tie = Model.solve("rentUnit", 0, Model.V.rentUnit * 5);
    expect(tie).not.toBeNull();
    const at = Model.simulate({ rentUnit: tie });
    expect(at.finalBuild - at.finalInvest).toBeCloseTo(0, 0);
    // building currently wins at the defaults, so the tie sits below today's rent
    expect(s.finalBuild).toBeGreaterThan(s.finalInvest);
    expect(tie).toBeLessThan(Model.V.rentUnit);
  });

  it("finds the exit yield at which the two paths tie", () => {
    const tie = Model.solve("capRate", 1, 20);
    expect(tie).not.toBeNull();
    const at = Model.simulate({ capRate: tie });
    expect(at.finalBuild - at.finalInvest).toBeCloseTo(0, 0);
  });

  it("returns null when there is no sign change across the range, instead of guessing", () => {
    Model.V.rentUnit = 5000000; // building wins overwhelmingly whatever the market returns
    expect(Model.solve("invest", 0, 25)).toBeNull();
  });
});

describe("irr()", () => {
  it("recovers a known rate from a simple cashflow series", () => {
    // -100 now, +110 in twelve months is 10% a year
    const cf = [-100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 110];
    expect(Model.irr(cf)).toBeCloseTo(10, 4);
  });

  it("returns null when the cashflows never change sign", () => {
    expect(Model.irr([-100, -50, -25])).toBeNull();
  });

  it("stays finite over a 40-year horizon rather than underflowing to null", () => {
    Model.V.horizon = 40;
    const s = Model.simulate();
    const r = Model.irr(s.cashflows);
    expect(r).not.toBeNull();
    expect(isFinite(r)).toBe(true);
  });

  it("rises as the rent rises", () => {
    const low = Model.irr(Model.simulate({ rentUnit: 25000 }).cashflows);
    const high = Model.irr(Model.simulate({ rentUnit: 45000 }).cashflows);
    expect(high).toBeGreaterThan(low);
  });
});

describe("clampToField clamps to each field's declared range (regression: 60cdc09)", () => {
  it("clamps slider fields to their min and max, including the num type", () => {
    expect(Model.clampToField("capRate", 999)).toBe(20);
    expect(Model.clampToField("capRate", -5)).toBe(1);
    expect(Model.clampToField("horizon", 500)).toBe(40);
    expect(Model.clampToField("units", 0)).toBe(1);
    expect(Model.clampToField("buildMonths", 900)).toBe(60);
  });

  it("caps money fields at a sane ceiling and refuses negatives", () => {
    expect(Model.clampToField("capital", -1)).toBe(0);
    expect(Model.clampToField("capital", 1e30)).toBe(1e12);
  });

  it("passes unknown keys through untouched", () => {
    expect(Model.clampToField("nonsense", 42)).toBe(42);
  });
});

describe("prototype keys are not treated as scenario params (regression: 8abe213)", () => {
  it("rejects inherited keys in paramKey", () => {
    expect(Model.paramKey("constructor")).toBeUndefined();
    expect(Model.paramKey("__proto__")).toBeUndefined();
    expect(Model.paramKey("toString")).toBeUndefined();
    expect(Model.paramKey("cap")).toBe("capital");
  });

  it("does not see a prototype key as a shared scenario", () => {
    expect(Model.hasScenarioParams("?constructor=1")).toBe(false);
    expect(Model.hasScenarioParams("?cap=1000")).toBe(true);
    expect(Model.hasScenarioParams("")).toBe(false);
  });

  it("ignores inherited and non-numeric keys when reading storage", () => {
    Model.loadFromStorage(JSON.stringify({ V: { constructor: 5, capital: "nope", capRate: 12 } }));
    expect(Model.V.capRate).toBe(12);
    expect(Model.V.capital).toBe(Model.DEFAULTS.capital);
  });

  it("clamps values coming back out of storage", () => {
    Model.loadFromStorage(JSON.stringify({ V: { capRate: 9999 } }));
    expect(Model.V.capRate).toBe(20);
  });
});

describe("a shared link is a full scenario, not a patch (regression: 51811df)", () => {
  it("round-trips every changed value through the query string", () => {
    Model.V.capital = 55000000;
    Model.V.capRate = 9.5;
    Model.V.units = 20;
    Model.mode = "net";
    const qs = Model.buildQueryString();

    Model.resetToDefaults();
    Model.loadFromURL("?" + qs);

    expect(Model.V.capital).toBe(55000000);
    expect(Model.V.capRate).toBe(9.5);
    expect(Model.V.units).toBe(20);
    expect(Model.mode).toBe("net");
  });

  it("omits values that are still at their defaults", () => {
    Model.V.capRate = 9.5;
    const params = new URLSearchParams(Model.buildQueryString());
    expect(params.get("cr")).toBe("9.5");
    expect(params.has("cap")).toBe(false);
    expect(params.has("m")).toBe(false);
  });

  it("clamps hostile query values to the field's range", () => {
    Model.loadFromURL("?cr=99999&h=-40");
    expect(Model.V.capRate).toBe(20);
    expect(Model.V.horizon).toBe(1);
  });
});

describe("the default scenario", () => {
  // Locked in so a change to the engine has to be a deliberate one. If these move,
  // check the model before changing the numbers.
  it("stays a close-run thing rather than a foregone conclusion", () => {
    const s = Model.simulate();
    expect(s.projectCost).toBeCloseTo(39363200, 0);
    expect(s.shortfall).toBe(0);
    expect(s.yieldOnCost).toBeCloseTo(8.42, 1);
    expect(s.breakEven).toBe(8);

    const gapShare = Math.abs(s.finalBuild - s.finalInvest) / s.finalInvest;
    expect(gapShare).toBeLessThan(0.1); // within 10% — the chart stays interesting
  });

  it("reports a project return in the same neighbourhood as the market alternative", () => {
    const s = Model.simulate();
    const irr = Model.irr(s.cashflows);
    expect(irr).toBeCloseTo(10.43, 1);
    expect(Model.netInvestReturn()).toBeCloseTo(10.05, 2);
  });
});
