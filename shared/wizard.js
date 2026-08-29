/* The guided walkthrough that sits in front of each calculator.
 *
 * This file is the state machine only — which question you are on, which ones
 * you answered, which ones kept the default, and how far through you are. It
 * touches no DOM, so it unit tests under Node the same way the engines do.
 * shared/wizard-ui.js is the view layer on top of it.
 *
 * It knows nothing about any particular calculator. What it takes is the pair:
 *
 *   engine — a calculator (Calc / Model / Brick). Read for FIELDS, DEFAULTS,
 *            SECTION_META, MODE_META, and the live values in V.
 *   guide  — the editorial half, one per calculator: the running order of the
 *            questions, and for each field the plain-language question, what
 *            it is, why it matters, and what it typically runs to in a
 *            developed and in a developing market.
 *
 * Splitting it that way is the same trick shared/spec-text.js plays: the
 * numbers, ranges and URL names come from the engine and cannot drift, and
 * only the prose is hand-written.
 */
(function(root, factory){
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.Wizard = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function(){
"use strict";

/* ===================== the guide contract ===================== */

/* Thrown when a guide and its engine disagree — a field with no question
   written for it, a question for a field that no longer exists, a preset
   outside the slider's own range. Named so the page can tell a content bug
   from a runtime one, the way specText's StaleEngineError does. */
function contractError(msgs){
  var err = new Error("wizard: this guide does not match its calculator.\n- " + msgs.join("\n- "));
  err.name = "GuideContractError";
  err.problems = msgs;
  return err;
}

/* key -> the FIELDS group it lives in, so a step never has to name its own
   section and then drift from the engine's. */
function sectionIndex(engine){
  var idx = {};
  Object.keys(engine.FIELDS).forEach(function(sid){
    engine.FIELDS[sid].forEach(function(f){ idx[f.k] = sid; });
  });
  return idx;
}

/* Which mode, if any, a step only applies to. Derived from the engine's own
   SECTION_META rather than restated in the guide — the "let"-only questions
   are exactly the ones whose fields sit in a "let"-only section. */
function stepMode(engine, step, idx){
  var modes = (step.keys || []).map(function(k){
    var sid = idx[k];
    return sid && engine.SECTION_META[sid] ? engine.SECTION_META[sid].mode || null : null;
  });
  return modes.reduce(function(a, b){ return a === null ? b : a; }, null);
}

function validateGuide(engine, guide){
  var problems = [];
  var idx = sectionIndex(engine);
  var allKeys = Object.keys(idx);

  ["title", "intro", "steps", "fields", "outcome", "aiIntro", "disclaimer"].forEach(function(k){
    if(guide == null || guide[k] == null) problems.push("the guide has no `" + k + "`");
  });
  if(problems.length) throw contractError(problems);

  var seen = {};
  var modeSteps = 0;
  var modeAsked = false;
  guide.steps.forEach(function(step, i){
    var where = "step " + i + " (" + (step.id || "unnamed") + ")";
    /* An id is not just a key any more: it is the URL fragment that opens the
       walkthrough on this question, so it has to survive being typed, shared
       and read aloud — and it cannot claim one of the two screens the wizard
       adds itself. */
    if(!step.id){
      problems.push(where + " has no id");
    } else if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(step.id)){
      problems.push(where + " has an id that will not do as a URL fragment; " +
                    "use lowercase words joined by hyphens");
    } else if(step.id === "intro" || step.id === "answer"){
      problems.push(where + " uses `" + step.id + "`, which the walkthrough's own " +
                    "opening and answer screens already answer to");
    }
    if(step.kind === "mode"){
      modeSteps++;
      modeAsked = true;
      var want = engine.MODE_META.values.map(function(v){ return v.value; }).join(",");
      var got = (step.options || []).map(function(o){ return o.value; }).join(",");
      if(want !== got) problems.push(where + " offers modes [" + got + "] but the engine has [" + want + "]");
      if(!step.question || !step.what) problems.push(where + " has no question or no explanation");
      return;
    }
    if(!step.keys || !step.keys.length){ problems.push(where + " asks about no fields"); return; }
    if(!step.section) problems.push(where + " has no section name for the progress line");
    /* A screen showing more than one field needs its own heading and opening
       line; the single-question layout borrows both from the field's copy and
       a group has no single field to borrow from. */
    if(step.keys.length > 1 && (!step.title || !step.blurb)){
      problems.push(where + " asks about several fields but has no title and blurb");
    }
    /* Asking a "let"-only question before the visitor has been asked whether
       they are letting is a walkthrough that has already assumed its answer. */
    if(!modeAsked && stepMode(engine, step, idx)){
      problems.push(where + " is mode-only but comes before the mode question");
    }
    step.keys.forEach(function(k){
      if(!engine.FIELD_BY_KEY[k]){ problems.push(where + " asks about `" + k + "`, which the calculator does not have"); return; }
      if(seen[k]) problems.push("`" + k + "` is asked twice — in " + seen[k] + " and again in " + where);
      seen[k] = where;
    });
    /* A step is shown or hidden as a unit, so its fields have to agree about
       which mode they belong to. Mixing them would strand a "let"-only
       question on a screen the "live" walkthrough shows. */
    var modes = {};
    step.keys.forEach(function(k){
      var sid = idx[k];
      var m = sid && engine.SECTION_META[sid] ? engine.SECTION_META[sid].mode || "" : "";
      modes[m] = true;
    });
    if(Object.keys(modes).length > 1) problems.push(where + " mixes fields from more than one mode");
  });

  if(modeSteps !== 1) problems.push("the guide has " + modeSteps + " mode questions; it needs exactly 1");

  allKeys.forEach(function(k){
    if(!seen[k]) problems.push("`" + k + "` (" + engine.FIELD_BY_KEY[k].label + ") is never asked about");
  });

  Object.keys(guide.fields).forEach(function(k){
    if(!engine.FIELD_BY_KEY[k]){ problems.push("copy is written for `" + k + "`, which the calculator does not have"); return; }
    var c = guide.fields[k], f = engine.FIELD_BY_KEY[k];
    ["q", "what", "why"].forEach(function(p){
      if(!c || !c[p]) problems.push("`" + k + "` has no " + p);
    });
    if(!c || !c.typical || !c.typical.developed || !c.typical.developing){
      problems.push("`" + k + "` has no typical values for developed and developing markets");
    }
    (c && c.presets || []).forEach(function(p){
      var v = typeof p.value === "function" ? p.value(engine.DEFAULTS) : p.value;
      if(typeof v !== "number" || !isFinite(v)){
        problems.push("`" + k + "` preset \"" + p.label + "\" is not a number");
      } else if(f.type !== "money" && (v < f.min || v > f.max)){
        problems.push("`" + k + "` preset \"" + p.label + "\" is " + v +
                      ", outside the " + f.min + "–" + f.max + " the slider allows");
      }
    });
  });
  allKeys.forEach(function(k){
    if(!guide.fields[k]) problems.push("`" + k + "` (" + engine.FIELD_BY_KEY[k].label + ") has no copy written for it");
  });

  ["question", "what", "how"].forEach(function(k){
    if(guide.intro[k] == null) problems.push("the guide's intro has no `" + k + "`");
  });

  if(problems.length) throw contractError(problems);
  return true;
}

/* ===================== the walkthrough ===================== */

class Walkthrough {
  constructor(opts){
    this.engine = opts.engine;
    this.guide = opts.guide;
    this._idx = sectionIndex(this.engine);

    /* Two states, not three. A number is either one the visitor set or one
       this page chose for them, and "I pressed skip" and "I pressed next
       without touching it" are the same claim about where the number came
       from. The review screen says which is which, because a reader deciding
       how much to trust the answer needs to know how much of it was theirs. */
    this.answered = {};

    /* Held as an id, not an index: switching mode adds and removes steps, and
       an index would silently point at a different question afterwards. */
    this.currentId = "intro";
  }

  /* A returning visitor, or one who followed a filled-in link, arrives with
     values already off their defaults. Those are answers — count them, so the
     progress bar and the review screen don't call a shared scenario blank. */
  adoptExistingValues(){
    var V = this.engine.V, D = this.engine.DEFAULTS;
    Object.keys(D).forEach((k) => {
      if(Math.abs(V[k] - D[k]) > 1e-9) this.answered[k] = true;
    });
    if(this.engine.mode !== this.engine.DEFAULT_MODE) this.answered["#mode"] = true;
    return this;
  }

  /* ---------- the step list ---------- */

  /* Every screen in order: the opener, the questions that apply to the mode
     the visitor is in, and the answer at the end. Recomputed on demand so a
     mode change is reflected the moment it happens. */
  steps(){
    var engine = this.engine, idx = this._idx;
    var out = [{ id:"intro", kind:"intro", section:"Before we start", keys:[] }];
    this.guide.steps.forEach(function(step){
      if(step.kind === "mode"){ out.push(assign(step, { kind:"mode", keys:[] })); return; }
      var m = stepMode(engine, step, idx);
      if(m && m !== engine.mode) return;
      out.push(assign(step, { kind: step.keys.length > 1 ? "group" : "question" }));
    });
    out.push({ id:"answer", kind:"answer", section:"The answer", keys:[] });
    return out;
  }

  /* The numbered ones — what "question 5 of 18" counts. */
  questionSteps(){
    return this.steps().filter(function(s){ return s.kind !== "intro" && s.kind !== "answer"; });
  }

  index(){
    var steps = this.steps();
    for(var i = 0; i < steps.length; i++) if(steps[i].id === this.currentId) return i;
    return 0;
  }

  current(){ return this.steps()[this.index()]; }

  /* ---------- moving ---------- */

  goTo(id){
    var steps = this.steps();
    for(var i = 0; i < steps.length; i++){
      if(steps[i].id === id){ this.currentId = id; return true; }
    }
    return false;
  }

  next(){
    var steps = this.steps(), i = this.index();
    if(i >= steps.length - 1) return false;
    this.currentId = steps[i + 1].id;
    return true;
  }

  back(){
    var steps = this.steps(), i = this.index();
    if(i <= 0) return false;
    this.currentId = steps[i - 1].id;
    return true;
  }

  markAnswered(key){
    this.answered[key] = true;
  }

  /* Back to a blank walkthrough. Pairs with the engine's own
     resetToDefaults() — that clears the numbers, this clears the record of
     who chose them. */
  reset(){
    this.answered = {};
    this.currentId = "intro";
  }

  /* ---------- where we are ---------- */

  /* `step` is 1-based over the numbered questions; 0 on the opener and one
     past the end on the answer, so the bar reads empty at the start and full
     at the finish without either screen pretending to be a question. */
  progress(){
    var qs = this.questionSteps();
    var total = qs.length;
    var step = 0;
    var here = this.currentId;
    if(here === "answer"){
      step = total;
    } else if(here !== "intro"){
      for(var i = 0; i < qs.length; i++) if(qs[i].id === here) step = i + 1;
    }
    var yours = 0;
    qs.forEach((s) => {
      var keys = s.kind === "mode" ? ["#mode"] : s.keys;
      if(keys.some((k) => this.answered[k])) yours++;
    });
    return {
      step: step,
      total: total,
      /* How many of the questions carry a number the visitor set, rather than
         one this page chose. It is what the answer screen reports, and it is
         the honest measure of how much of the result is theirs. */
      yours: yours,
      /* Fill tracks position, not answers: the bar answers "how much of this
         is left", and skipping a question still gets you past it. */
      pct: total === 0 ? 100 : Math.round(step / total * 100)
    };
  }

  /* The review list on the answer screen: every question that applies, in
     order, with what it is set to and how it got that way. */
  review(){
    var engine = this.engine;
    var out = [];
    this.questionSteps().forEach((s) => {
      if(s.kind === "mode"){
        var v = engine.MODE_META.values.filter(function(o){ return o.value === engine.mode; })[0];
        out.push({
          stepId: s.id, section: s.section, label: this.guide.modeLabel || engine.MODE_META.label,
          value: v ? v.label : engine.mode,
          yours: !!this.answered["#mode"]
        });
        return;
      }
      s.keys.forEach((k) => {
        out.push({
          stepId: s.id, section: s.section, key: k,
          label: engine.FIELD_BY_KEY[k].label,
          yours: !!this.answered[k]
        });
      });
    });
    return out;
  }
}

function assign(a, b){
  var out = {};
  Object.keys(a).forEach(function(k){ out[k] = a[k]; });
  Object.keys(b).forEach(function(k){ out[k] = b[k]; });
  return out;
}

return {
  create: function(opts){ return new Walkthrough(opts); },
  validateGuide: validateGuide,
  sectionIndex: sectionIndex,
  stepMode: stepMode
};
});
