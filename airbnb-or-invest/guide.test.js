import { describe, it, expect } from "vitest";
import Airbnb from "./model.js";
import AirbnbOrInvestGuide from "./guide.js";
import Wizard from "../shared/wizard.js";

/* The contract check is the point of this file. It is what stops a field being
   added to the engine — or a range being widened, or a section being renamed —
   without anyone writing the question that goes with it. Everything under it is
   about the parts validateGuide cannot see: whether the walkthrough actually
   produces an answer at the end, in all four starting points. */
describe("airbnb-or-invest guide", () => {
  it("has a question, an explanation and typical values for every input", () => {
    expect(Wizard.validateGuide(Airbnb, AirbnbOrInvestGuide)).toBe(true);
  });

  for (const mode of Airbnb.MODES) {
    it(`produces a complete answer screen in ${mode} mode`, () => {
      Airbnb.resetToDefaults();
      Airbnb.mode = mode;
      const out = AirbnbOrInvestGuide.outcome(Airbnb, Airbnb.simulate());
      expect(out.headline).toMatch(/\S/);
      expect(out.sub).toMatch(/\S/);
      expect(out.short).toMatch(/\S/);
      expect(out.labelA).toMatch(/\S/);
      expect(out.labelB).toMatch(/\S/);
      expect(out.tiles).toHaveLength(4);
      out.tiles.forEach((t) => {
        expect(t.k).toMatch(/\S/);
        expect(t.v).toMatch(/\S/);
        expect(t.s).toMatch(/\S/);
      });
      /* crossover-chart takes {y,a,b}; handing it the engine's own
         airbnb/invest names would draw two flat lines at zero. */
      out.series.forEach((p) => {
        expect(Number.isFinite(p.y)).toBe(true);
        expect(Number.isFinite(p.a)).toBe(true);
        expect(Number.isFinite(p.b)).toBe(true);
      });
      Airbnb.resetToDefaults();
    });
  }

  /* Holding costs, appreciation, selling costs and CGT cancel when the house
     is kept on both paths, so asking about them there would be asking the
     visitor to fill in numbers that cannot change the answer. */
  it("asks nothing about the property's value, growth or sale when it is kept either way", () => {
    Airbnb.resetToDefaults();
    const wiz = Wizard.create({ engine: Airbnb, guide: AirbnbOrInvestGuide });
    const keysIn = (mode) => {
      Airbnb.mode = mode;
      return wiz.steps().flatMap((s) => s.keys);
    };
    const keep = keysIn("keep");
    for (const k of ["fixedCosts", "apprec", "sellPct", "cgt", "price", "land", "homeValue"]) {
      expect(keep, k).not.toContain(k);
    }
    expect(keysIn("own")).toEqual(expect.arrayContaining(["homeValue", "apprec", "sellPct", "cgt"]));
    expect(keysIn("build")).toEqual(expect.arrayContaining(["land", "buildCost", "worthPct"]));
    expect(keysIn("buy")).toEqual(expect.arrayContaining(["price", "buyFeesPct"]));
    Airbnb.resetToDefaults();
  });

  it("names every step once and keeps each section's questions together", () => {
    const ids = AirbnbOrInvestGuide.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);

    const seenSections = [];
    AirbnbOrInvestGuide.steps.forEach((s) => {
      const last = seenSections[seenSections.length - 1];
      if (s.section !== last) seenSections.push(s.section);
    });
    expect(new Set(seenSections).size).toBe(seenSections.length);
  });
});
