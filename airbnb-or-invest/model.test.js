import { describe, it, expect, beforeEach } from "vitest";
import Airbnb from "./model.js";

beforeEach(() => {
  Airbnb.resetToDefaults();
});

describe("what each starting point puts on the table", () => {
  it("buying stakes the price, the transfer costs and the furnishing", () => {
    const V = Airbnb.V;
    expect(Airbnb.costs({ mode: "buy" }).stake)
      .toBeCloseTo(V.price * (1 + V.buyFeesPct / 100) + V.furnish, 6);
  });

  it("building stakes the plot, the build with its fees and contingency, and the furnishing", () => {
    const V = Airbnb.V;
    const build = V.buildCost * (1 + V.feesPct / 100) * (1 + V.contingencyPct / 100);
    expect(Airbnb.costs({ mode: "build" }).stake).toBeCloseTo(V.land + build + V.furnish, 6);
  });

  it("owning it stakes what a sale would put in your hand today, plus the furnishing", () => {
    const V = Airbnb.V;
    expect(Airbnb.costs({ mode: "own" }).stake)
      .toBeCloseTo(V.homeValue * (1 - V.sellPct / 100) + V.furnish, 6);
  });

  it("keeping it either way stakes only the furnishing", () => {
    expect(Airbnb.costs({ mode: "keep" }).stake).toBe(Airbnb.V.furnish);
  });

  it("hands the market path exactly that stake on day one, in every mode", () => {
    for (const mode of Airbnb.MODES) {
      const s = Airbnb.simulate({ mode });
      expect(s.series[0].invest, mode).toBeCloseTo(s.stake, 6);
    }
  });
});

describe("keeping the house either way leaves the house out of it", () => {
  // Under keep the property is held on both paths, so anything about it cancels.
  // If one of these starts moving the answer, the house has leaked into one side.
  it("is not moved by appreciation, selling costs, CGT or fixed costs", () => {
    Airbnb.mode = "keep";
    const base = Airbnb.simulate();
    const moved = Airbnb.simulate({ apprec: 15, sellPct: 10, cgt: 30, fixedCosts: 500000 });
    expect(moved.finalAirbnb).toBeCloseTo(base.finalAirbnb, 6);
    expect(moved.finalInvest).toBeCloseTo(base.finalInvest, 6);
  });

  it("but the same knobs do move the answer when the property is in play", () => {
    for (const mode of ["buy", "build", "own"]) {
      const base = Airbnb.simulate({ mode });
      expect(Airbnb.simulate({ mode, apprec: 10 }).finalAirbnb, mode).toBeGreaterThan(base.finalAirbnb);
      expect(Airbnb.simulate({ mode, fixedCosts: 500000 }).finalAirbnb, mode).toBeLessThan(base.finalAirbnb);
    }
  });
});

describe("an empty listing", () => {
  it("loses to the market and is flagged as running at a loss, in every mode", () => {
    for (const mode of Airbnb.MODES) {
      const s = Airbnb.simulate({ mode, occupancy: 0 });
      expect(s.finalAirbnb, mode).toBeLessThan(s.finalInvest);
      expect(s.runningLoss, mode).toBe(true);
    }
  });

  it("earns more the more nights are booked", () => {
    const quiet = Airbnb.simulate({ occupancy: 40 });
    const busy = Airbnb.simulate({ occupancy: 80 });
    expect(busy.finalAirbnb).toBeGreaterThan(quiet.finalAirbnb);
    expect(busy.finalInvest).toBeCloseTo(quiet.finalInvest, 6);
  });
});

describe("the build months earn nothing", () => {
  it("takes no bookings until the place is finished", () => {
    Airbnb.mode = "build";
    Airbnb.V.buildMonths = 12;
    expect(Airbnb.simulate({ horizon: 1 }).totalGross).toBe(0);
    expect(Airbnb.simulate({ horizon: 2 }).totalGross).toBeGreaterThan(0);
  });

  it("buys the furnishing at completion, and keeps the undrawn money earning until then", () => {
    Airbnb.mode = "build";
    Object.assign(Airbnb.V, { buildMonths: 12, fixedCosts: 0, invest: 0, investTax: 0, investFee: 0 });
    // With nothing earned on the float, everything staked has been drawn by the end of the build.
    expect(Airbnb.simulate({ horizon: 1 }).finalPot).toBeCloseTo(0, 4);
    Object.assign(Airbnb.V, { invest: 12, investTax: 15, investFee: 1 });
    expect(Airbnb.simulate({ horizon: 1 }).finalPot).toBeGreaterThan(0);
  });

  it("values a building site at what has gone into it, and a finished one at its worth", () => {
    Airbnb.mode = "build";
    Object.assign(Airbnb.V, { buildMonths: 24, apprec: 0 });
    const c = Airbnb.costs();
    const s = Airbnb.simulate({ horizon: 3 });
    const tranche = (c.projectCost - c.land) / 24;
    expect(s.series[1].value).toBeCloseTo(c.land + tranche * 12, 4);
    expect(s.series[3].value).toBeCloseTo(c.projectCost * Airbnb.V.worthPct / 100, 4);
  });

  it("flags a horizon that ends before the place is finished", () => {
    Airbnb.mode = "build";
    Airbnb.V.buildMonths = 24;
    expect(Airbnb.simulate({ horizon: 1 }).horizonBeforeCompletion).toBe(true);
    expect(Airbnb.simulate({ horizon: 10 }).horizonBeforeCompletion).toBe(false);
    expect(Airbnb.simulate({ mode: "buy", horizon: 1 }).horizonBeforeCompletion).toBe(false);
  });
});

describe("a new listing takes time to fill", () => {
  it("climbs to full occupancy over the ramp months", () => {
    // Twelve months ramping linearly sell 1/12 + 2/12 + ... + 12/12 = 6.5 months' worth.
    const instant = Airbnb.simulate({ horizon: 1, rampMonths: 0 });
    const ramped = Airbnb.simulate({ horizon: 1, rampMonths: 12 });
    expect(ramped.nightsSold / instant.nightsSold).toBeCloseTo(6.5 / 12, 6);
  });
});

describe("capital gains tax is charged only on the gain", () => {
  it("costs nothing when the place sells for less than it cost", () => {
    const a = Airbnb.simulate({ apprec: 0, cgt: 0 });
    const b = Airbnb.simulate({ apprec: 0, cgt: 40 });
    expect(b.finalAirbnb).toBeCloseTo(a.finalAirbnb, 6);
  });

  it("bites once the place has grown past its cost", () => {
    const a = Airbnb.simulate({ apprec: 10, cgt: 0 });
    const b = Airbnb.simulate({ apprec: 10, cgt: 40 });
    expect(b.finalAirbnb).toBeLessThan(a.finalAirbnb);
  });
});

describe("the solver finds where the two paths tie", () => {
  it("returns an occupancy at which the gap closes", () => {
    const occ = Airbnb.solve("occupancy", 0, 100);
    expect(occ).not.toBeNull();
    const s = Airbnb.simulate({ occupancy: occ });
    expect(Math.abs(s.finalAirbnb - s.finalInvest) / s.finalInvest).toBeLessThan(1e-6);
  });

  it("returns null when nothing in range changes the winner", () => {
    Airbnb.V.nightly = 0;
    expect(Airbnb.solve("occupancy", 0, 100)).toBeNull();
  });
});

describe("the return quoted for the Airbnb", () => {
  it("matches the market's net rate when the Airbnb exactly ties it", () => {
    const occ = Airbnb.solve("occupancy", 0, 100);
    const s = Airbnb.simulate({ occupancy: occ });
    // Buy mode spends the whole stake on day one, so a tie in end wealth is a tie in IRR.
    expect(Airbnb.irr(s.cashflows)).toBeCloseTo(Airbnb.netInvestReturn(), 1);
  });
});

describe("the URL and saved state", () => {
  it("opens each of the four modes from a link", () => {
    for (const mode of Airbnb.MODES) {
      Airbnb.resetToDefaults();
      Airbnb.loadFromURL("?m=" + mode);
      expect(Airbnb.mode).toBe(mode);
    }
  });

  it("falls back to buying for a mode it does not know", () => {
    Airbnb.mode = "keep";
    Airbnb.loadFromURL("?m=lease");
    expect(Airbnb.mode).toBe("buy");
  });

  it("restores the mode from saved state, and ignores a junk one", () => {
    Airbnb.loadFromStorage(JSON.stringify({ V: { occupancy: 70 }, mode: "own", cur: "UGX" }));
    expect(Airbnb.mode).toBe("own");
    expect(Airbnb.V.occupancy).toBe(70);
    expect(Airbnb.cur.code).toBe("UGX");
    Airbnb.loadFromStorage(JSON.stringify({ mode: "lease" }));
    expect(Airbnb.mode).toBe("own");
  });

  it("clamps an out-of-range value instead of rejecting it", () => {
    Airbnb.loadFromURL("?occ=140");
    expect(Airbnb.V.occupancy).toBe(100);
  });

  it("writes only what differs from the defaults", () => {
    expect(Airbnb.buildQueryString()).toBe("");
    Airbnb.V.nightly = 7500;
    Airbnb.mode = "keep";
    expect(Airbnb.buildQueryString()).toBe("rate=7500&m=keep");
  });

  for (const ex of Airbnb.EXAMPLES) {
    it(`round-trips the worked example: ${ex.label}`, () => {
      Airbnb.resetToDefaults();
      Airbnb.loadFromURL("?" + new URLSearchParams(ex.params).toString());
      const back = Object.fromEntries(new URLSearchParams(Airbnb.buildQueryString()));
      const want = Object.fromEntries(Object.entries(ex.params).map(([k, v]) => [k, String(v)]));
      expect(back).toEqual(want);
    });
  }
});
