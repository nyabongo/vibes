import { describe, it, expect } from "vitest";
import Model from "./model.js";
import BuildOrInvestGuide from "./guide.js";
import Wizard from "../shared/wizard.js";

/* The contract check is the point of this file. It is what stops a field being
   added to the engine — or a range being widened, or a section being renamed —
   without anyone writing the question that goes with it. Everything under it is
   about the parts validateGuide cannot see: whether the walkthrough actually
   produces an answer at the end, in both modes. */
describe("build-or-invest guide", () => {
  it("has a question, an explanation and typical values for every input", () => {
    expect(Wizard.validateGuide(Model, BuildOrInvestGuide)).toBe(true);
  });

  for (const mode of ["gross", "net"]) {
    it(`produces a complete answer screen in ${mode} mode`, () => {
      Model.resetToDefaults();
      Model.mode = mode;
      const out = BuildOrInvestGuide.outcome(Model, Model.simulate());
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
      /* crossover-chart takes {y,a,b}; handing it the engine's own buy/rent or
         build/invest names would draw two flat lines at zero. */
      out.series.forEach((p) => {
        expect(Number.isFinite(p.y)).toBe(true);
        expect(Number.isFinite(p.a)).toBe(true);
        expect(Number.isFinite(p.b)).toBe(true);
      });
      Model.resetToDefaults();
    });
  }

  /* The walkthrough is one long screen-by-screen read, so a question that
     lands twice or a section heading that changes halfway through a run reads
     as a bug even when the arithmetic is fine. */
  it("names every step once and keeps each section's questions together", () => {
    const ids = BuildOrInvestGuide.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);

    const seenSections = [];
    BuildOrInvestGuide.steps.forEach((s) => {
      const last = seenSections[seenSections.length - 1];
      if (s.section !== last) seenSections.push(s.section);
    });
    expect(new Set(seenSections).size).toBe(seenSections.length);
  });
});
