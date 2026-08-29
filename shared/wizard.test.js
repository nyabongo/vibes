import { describe, it, expect, beforeEach } from "vitest";
import Wizard from "./wizard.js";

/* A deliberately tiny stand-in for a real calculator. Using one of the three
   engines here would test the guide content as well, which is what
   <tool>/guide.test.js is for — this file is about the machine that walks
   through questions, whatever they happen to be. */
function makeEngine(){
  return {
    mode: "live",
    DEFAULT_MODE: "live",
    V: { price: 100, rate: 5, rent: 10, income: 20 },
    DEFAULTS: { price: 100, rate: 5, rent: 10, income: 20 },
    FIELDS: {
      fBuy:  [{ k: "price", label: "Price", type: "money" },
              { k: "rate", label: "Rate", type: "pct", min: 0, max: 30, step: 1 }],
      fRent: [{ k: "rent", label: "Rent you'd pay", type: "money" }],
      fLet:  [{ k: "income", label: "Rent you'd collect", type: "money" }]
    },
    FIELD_BY_KEY: {
      price: { k: "price", label: "Price", type: "money" },
      rate:  { k: "rate", label: "Rate", type: "pct", min: 0, max: 30, step: 1 },
      rent:  { k: "rent", label: "Rent you'd pay", type: "money" },
      income:{ k: "income", label: "Rent you'd collect", type: "money" }
    },
    SECTION_META: {
      fBuy:  { legend: "The purchase" },
      fRent: { legend: "Renting instead", mode: "live" },
      fLet:  { legend: "Letting it out", mode: "let" }
    },
    MODE_META: {
      param: "m", label: "what it's for",
      values: [{ value: "live", label: "Live in it" }, { value: "let", label: "Let it out" }]
    }
  };
}

function copy(f){
  var t = {}, ok = ["q", "what", "why", "typical", "presets"];
  ok.forEach(function(k){ if(f[k] !== undefined) t[k] = f[k]; });
  return t;
}

function words(extra){
  var one = { q: "?", what: "x", why: "y", typical: { developed: "d", developing: "g" } };
  return Object.assign({ price: copy(one), rate: copy(one), rent: copy(one), income: copy(one) }, extra || {});
}

function makeGuide(over){
  return Object.assign({
    title: "Test",
    intro: { question: "?", what: "x", how: ["a"] },
    aiIntro: ["hello"],
    disclaimer: "careful",
    steps: [
      { id: "purpose", kind: "mode", section: "Deciding", question: "?", what: "x",
        options: [{ value: "live", label: "Live in it", blurb: "b" },
                  { value: "let", label: "Let it out", blurb: "b" }] },
      { id: "price", section: "The purchase", keys: ["price"] },
      { id: "rent",  section: "Renting instead", keys: ["rent"] },
      { id: "let",   section: "Letting it out", keys: ["income"] },
      { id: "rate",  section: "The purchase", keys: ["rate"] }
    ],
    fields: words(),
    outcome: function(){ return {}; }
  }, over || {});
}

describe("validateGuide", () => {
  it("accepts a guide that covers every field exactly once", () => {
    expect(Wizard.validateGuide(makeEngine(), makeGuide())).toBe(true);
  });

  it("names the field that has no question written for it", () => {
    const g = makeGuide();
    g.steps = g.steps.filter((s) => s.id !== "rate");
    expect(() => Wizard.validateGuide(makeEngine(), g))
      .toThrow(/`rate` \(Rate\) is never asked about/);
  });

  it("names a field asked about twice", () => {
    const g = makeGuide();
    g.steps.push({ id: "again", section: "The purchase", keys: ["price"] });
    expect(() => Wizard.validateGuide(makeEngine(), g)).toThrow(/`price` is asked twice/);
  });

  it("rejects a question about a field the calculator does not have", () => {
    const g = makeGuide();
    g.steps.push({ id: "ghost", section: "x", keys: ["nope"] });
    expect(() => Wizard.validateGuide(makeEngine(), g))
      .toThrow(/asks about `nope`, which the calculator does not have/);
  });

  it("rejects copy with no typical values for both kinds of market", () => {
    const g = makeGuide();
    g.fields.rate = { q: "?", what: "x", why: "y", typical: { developed: "d" } };
    expect(() => Wizard.validateGuide(makeEngine(), g))
      .toThrow(/no typical values for developed and developing markets/);
  });

  it("rejects a preset the slider could never reach", () => {
    const g = makeGuide();
    g.fields.rate.presets = [{ label: "way up", value: 90 }];
    expect(() => Wizard.validateGuide(makeEngine(), g))
      .toThrow(/preset "way up" is 90, outside the 0–30 the slider allows/);
  });

  it("evaluates a computed preset rather than calling it not-a-number", () => {
    const g = makeGuide();
    g.fields.rate.presets = [{ label: "a tenth of the price", value: (V) => V.price / 10 }];
    expect(Wizard.validateGuide(makeEngine(), g)).toBe(true);
  });

  it("rejects a step that mixes fields from two different modes", () => {
    const g = makeGuide();
    g.steps = g.steps.filter((s) => s.id !== "rent" && s.id !== "let");
    g.steps.push({ id: "both", section: "x", keys: ["rent", "income"] });
    expect(() => Wizard.validateGuide(makeEngine(), g))
      .toThrow(/mixes fields from more than one mode/);
  });

  it("rejects a mode-only question asked before the mode itself", () => {
    const g = makeGuide();
    const mode = g.steps.shift();
    g.steps.push(mode);
    expect(() => Wizard.validateGuide(makeEngine(), g))
      .toThrow(/is mode-only but comes before the mode question/);
  });

  it("insists a multi-field screen carries its own title and opening line", () => {
    const g = makeGuide();
    g.steps = g.steps.filter((s) => s.id !== "price" && s.id !== "rate");
    g.steps.push({ id: "both", section: "The purchase", keys: ["price", "rate"] });
    expect(() => Wizard.validateGuide(makeEngine(), g))
      .toThrow(/asks about several fields but has no title and blurb/);
  });

  /* Step ids became URL fragments the moment the walkthrough started tracking
     its position in the address bar, so they have to survive being typed and
     shared, and they cannot claim a screen the wizard adds itself. */
  it("rejects an id that would not do as a URL fragment", () => {
    const g = makeGuide();
    g.steps[1].id = "The Price";
    expect(() => Wizard.validateGuide(makeEngine(), g))
      .toThrow(/will not do as a URL fragment/);
  });

  it("rejects a step claiming the opening or answer screen's own name", () => {
    for (const taken of ["intro", "answer"]) {
      const g = makeGuide();
      g.steps[1].id = taken;
      expect(() => Wizard.validateGuide(makeEngine(), g))
        .toThrow(new RegExp("uses `" + taken + "`, which the walkthrough's own"));
    }
  });

  it("insists on exactly one mode question", () => {
    const g = makeGuide();
    g.steps = g.steps.filter((s) => s.kind !== "mode");
    expect(() => Wizard.validateGuide(makeEngine(), g)).toThrow(/has 0 mode questions/);
  });

  it("rejects a mode question offering modes the engine does not have", () => {
    const g = makeGuide();
    g.steps[0].options = [{ value: "live", label: "Live in it", blurb: "b" }];
    expect(() => Wizard.validateGuide(makeEngine(), g))
      .toThrow(/offers modes \[live\] but the engine has \[live,let\]/);
  });

  it("throws a named error, so a page can tell a content bug from a runtime one", () => {
    const g = makeGuide();
    delete g.outcome;
    expect(() => Wizard.validateGuide(makeEngine(), g)).toThrow(/GuideContractError|no `outcome`/);
    try { Wizard.validateGuide(makeEngine(), g); } catch(e){ expect(e.name).toBe("GuideContractError"); }
  });
});

describe("the walkthrough", () => {
  let engine, wiz;
  beforeEach(() => {
    engine = makeEngine();
    wiz = Wizard.create({ engine: engine, guide: makeGuide() });
  });

  it("opens on the intro and ends on the answer, with the questions between", () => {
    const ids = wiz.steps().map((s) => s.id);
    expect(ids[0]).toBe("intro");
    expect(ids[ids.length - 1]).toBe("answer");
    expect(wiz.current().id).toBe("intro");
  });

  it("hides the questions that belong to the other mode", () => {
    expect(wiz.steps().map((s) => s.id)).toContain("rent");
    expect(wiz.steps().map((s) => s.id)).not.toContain("let");
    engine.mode = "let";
    expect(wiz.steps().map((s) => s.id)).toContain("let");
    expect(wiz.steps().map((s) => s.id)).not.toContain("rent");
  });

  /* Holding the position as an index rather than an id was the bug this
     pins: switching mode adds and removes steps, so the same index points at
     a different question afterwards. */
  it("stays on the same question when a mode change reshuffles the list", () => {
    wiz.goTo("rate");
    engine.mode = "let";
    expect(wiz.current().id).toBe("rate");
  });

  it("counts only the questions in the progress readout, not the intro or the answer", () => {
    expect(wiz.progress()).toMatchObject({ step: 0, total: 4 });
    wiz.next();
    expect(wiz.progress()).toMatchObject({ step: 1, total: 4, pct: 25 });
    wiz.goTo("answer");
    expect(wiz.progress()).toMatchObject({ step: 4, total: 4, pct: 100 });
  });

  it("reports how many of the answers are the visitor's own", () => {
    expect(wiz.progress().yours).toBe(0);
    wiz.markAnswered("price");
    expect(wiz.progress().yours).toBe(1);
    wiz.markAnswered("#mode");
    expect(wiz.progress().yours).toBe(2);
  });

  it("does not count an answer to a question the current mode never asks", () => {
    wiz.markAnswered("income");
    expect(wiz.progress().yours).toBe(0);
    engine.mode = "let";
    expect(wiz.progress().yours).toBe(1);
  });

  it("walks forwards and backwards without falling off either end", () => {
    expect(wiz.back()).toBe(false);
    const n = wiz.steps().length;
    for(let i = 0; i < n; i++) wiz.next();
    expect(wiz.current().id).toBe("answer");
    expect(wiz.next()).toBe(false);
  });

  it("refuses to jump to a step that isn't in the list", () => {
    expect(wiz.goTo("let")).toBe(false);
    expect(wiz.goTo("rate")).toBe(true);
  });

  /* A visitor who followed a filled-in link, or came back to a saved
     scenario, has answers already — calling them defaults on the review
     screen would be a lie about where those numbers came from. */
  it("treats values already off their defaults as answers", () => {
    engine.V.price = 250;
    engine.mode = "let";
    wiz.adoptExistingValues();
    expect(wiz.answered.price).toBe(true);
    expect(wiz.answered["#mode"]).toBe(true);
    expect(wiz.answered.rate).toBeUndefined();
  });

  it("lists every question for review, in order, saying whose number each is", () => {
    wiz.markAnswered("price");
    const rows = wiz.review();
    expect(rows.map((r) => r.label)).toEqual(
      ["what it's for", "Price", "Rent you'd pay", "Rate"]);
    expect(rows[1]).toMatchObject({ key: "price", stepId: "price", yours: true });
    expect(rows[3]).toMatchObject({ key: "rate", yours: false });
  });

  it("shows the mode's own label in the review, not the raw value", () => {
    engine.mode = "let";
    expect(wiz.review()[0].value).toBe("Let it out");
  });
});

describe("stepMode", () => {
  it("reads a step's mode off the engine's section, not off the step", () => {
    const engine = makeEngine();
    const idx = Wizard.sectionIndex(engine);
    expect(Wizard.stepMode(engine, { keys: ["rent"] }, idx)).toBe("live");
    expect(Wizard.stepMode(engine, { keys: ["income"] }, idx)).toBe("let");
    expect(Wizard.stepMode(engine, { keys: ["price"] }, idx)).toBe(null);
  });
});
