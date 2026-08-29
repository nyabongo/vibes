"use strict";

/* The view layer for the guided walkthrough. shared/wizard.js decides which
   question you are on; this draws it.
 *
 * Browser-only on purpose — the state machine next door is the part worth unit
 * testing, and this is the part Playwright exercises.
 *
 * Everything on screen is built from the calculator's own field definitions
 * plus the guide's prose, so there is one of these for all three tools rather
 * than three near-identical pages. A tool's guide/index.html is only a
 * masthead, an empty <div>, and one mount() call. */
var WizardUI = (function(){

/* ===================== small helpers ===================== */

function el(tag, cls, text){
  var n = document.createElement(tag);
  if(cls) n.className = cls;
  if(text != null) n.textContent = text;
  return n;
}

/* Every screen names one element as the thing to move focus to when it
   arrives. The whole card is replaced on each step, and without this the focus
   falls to <body> and a screen reader is told nothing about the question that
   just appeared. A heading is the reliable target: focusing a bare container
   announces inconsistently, and an aria-live region would read the entire card
   over whatever the visitor is doing. */
function headed(node){
  node.tabIndex = -1;
  node.setAttribute("data-focus", "");
  return node;
}

function pctS(v){ return (Math.round(v * 10) / 10) + "%"; }
function numS(v, unit){ return v + (unit || ""); }

/* What a field currently reads as, for the review list and skip buttons. */
function shown(engine, k){
  var f = engine.FIELD_BY_KEY[k], v = engine.V[k];
  if(f.type === "money") return engine.fmt(v);
  if(f.type === "num") return numS(v, f.unit);
  return pctS(v);
}

function presetValue(p, V){
  return typeof p.value === "function" ? p.value(V) : p.value;
}

/* ===================== the mount ===================== */

function mount(opts){
  var engine = opts.engine;
  var guide = opts.guide;
  var host = opts.mount;
  var calcHref = opts.calcHref || "../";
  var specHref = opts.specHref || "../llms.txt";

  /* A guide that has drifted from its calculator is a content bug, and it is
     worth failing loudly at the door rather than rendering a walkthrough with
     a hole in it. Same posture as specText's StaleEngineError. */
  Wizard.validateGuide(engine, guide);

  var wiz = Wizard.create({ engine: engine, guide: guide });

  /* The same branch every calculator page takes, and the one llms.txt
     documents: a link carrying recognised parameters is self-contained and
     must not disturb the visitor's own saved scenario; anything else restores
     what they last had. */
  var fromLink = engine.hasScenarioParams();
  if(fromLink){
    engine.resetToDefaults();
    engine.loadFromURL();
    engine.suppressPersist = true;
  } else {
    engine.loadFromStorage();
  }
  var resumed = !fromLink && Object.keys(engine.DEFAULTS).some(function(k){
    return Math.abs(engine.V[k] - engine.DEFAULTS[k]) > 1e-9;
  });
  wiz.adoptExistingValues();

  /* ---------- chrome ---------- */
  var progress = el("div", "wiz-progress");
  var bar = el("div", "wiz-bar");
  var fill = el("i");
  bar.appendChild(fill);
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", "How far through the questions you are");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  var meta = el("div", "wiz-meta");
  var where = el("div", "where");
  var escape = el("button", "escape");
  escape.type = "button";
  escape.textContent = "Skip the rest, show me the answer";
  meta.appendChild(where);
  meta.appendChild(escape);
  progress.appendChild(bar);
  progress.appendChild(meta);

  var card = el("div", "card");

  /* The running answer changes under the visitor while they drag a slider, so
     it is the one thing on the page that has to announce itself. role="status"
     implies aria-live="polite" and aria-atomic; do not also write those. */
  var sofar = el("div", "sofar");
  sofar.setAttribute("role", "status");
  sofar.hidden = true;

  host.appendChild(progress);
  host.appendChild(card);
  host.appendChild(sofar);

  /* ---------- currency ---------- */
  if(opts.currency){
    opts.currency.setCode(engine.cur.code);
    opts.currency.addEventListener("currencychange", function(e){
      engine.applyCurrency(e.detail.code);
      engine.updateURL();
      draw();
    });
  }

  escape.addEventListener("click", function(){
    wiz.goTo("answer");
    draw();
  });

  /* Enter moves on, the way it would in any form. Buttons, summaries and links
     handle their own Enter, so leave those alone. */
  card.addEventListener("keydown", function(e){
    if(e.key !== "Enter") return;
    var t = e.target.tagName;
    if(t === "BUTTON" || t === "SUMMARY" || t === "A" || t === "SELECT" || t === "TEXTAREA") return;
    e.preventDefault();
    if(wiz.current().kind !== "answer"){ wiz.next(); draw(); }
  });

  /* ===================== controls ===================== */

  /* Re-run after any value change, without rebuilding the card — rebuilding
     would drop focus out of the input mid-keystroke. */
  var syncers = [];

  function onChanged(k){
    wiz.markAnswered(k);
    engine.updateURL();
    syncers.forEach(function(fn){ fn(); });
    drawSoFar();
  }

  function chipRow(k, f, presets){
    if(!presets || !presets.length) return null;
    var row = el("div", "chips");
    row.appendChild(el("span", "chiplab", "Typical:"));
    presets.forEach(function(p){
      var b = el("button", "chip");
      b.type = "button";
      b.textContent = p.label;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function(){
        engine.V[k] = engine.clampToField(k, presetValue(p, engine.V));
        onChanged(k);
      });
      row.appendChild(b);
      /* Recomputed rather than captured: a preset can be a function of the
         other answers ("about 0.3% of the price"), so what it would set
         changes as the visitor moves earlier numbers. */
      syncers.push(function(){
        b.setAttribute("aria-pressed",
          String(Math.abs(engine.V[k] - presetValue(p, engine.V)) < 1e-6));
      });
    });
    return row;
  }

  function moneyControl(k){
    var wrap = el("div");
    var box = el("div", "money-in");
    var sym = el("span", "sym", engine.cur.sym.trim());
    var input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.inputMode = "decimal";
    input.id = "w_" + k;
    box.appendChild(sym);
    box.appendChild(input);
    wrap.appendChild(box);

    var read = el("div", "readback");
    wrap.appendChild(read);

    input.addEventListener("input", function(){
      var raw = parseFloat(input.value);
      if(isNaN(raw)) return;
      engine.V[k] = engine.clampToField(k, raw / engine.cur.rate);
      onChanged(k);
    });

    syncers.push(function(){
      var v = Math.round(engine.V[k] * engine.cur.rate);
      if(document.activeElement !== input) input.value = v;
      read.innerHTML = '<span class="num">' + engine.fmt(engine.V[k]) + "</span>" +
        (engine.cur.code === "KES" ? "" : " &middot; shared links always carry KES");
    });
    return wrap;
  }

  function sliderControl(k, f){
    var wrap = el("div");
    var val = el("div", "slide-val");
    val.id = "w_v_" + k;
    var input = document.createElement("input");
    input.type = "range";
    input.min = f.min; input.max = f.max; input.step = f.step;
    input.id = "w_" + k;
    input.setAttribute("aria-describedby", val.id);
    var ends = el("div", "slide-ends");
    ends.appendChild(el("span", null, f.type === "pct" ? pctS(f.min) : numS(f.min, f.unit)));
    ends.appendChild(el("span", null, f.type === "pct" ? pctS(f.max) : numS(f.max, f.unit)));
    wrap.appendChild(val);
    wrap.appendChild(input);
    wrap.appendChild(ends);

    input.addEventListener("input", function(){
      var raw = parseFloat(input.value);
      if(isNaN(raw)) return;
      engine.V[k] = raw;
      onChanged(k);
    });

    syncers.push(function(){
      input.value = engine.V[k];
      val.textContent = f.type === "pct" ? pctS(engine.V[k]) : numS(engine.V[k], f.unit);
    });
    return wrap;
  }

  function control(k){
    var f = engine.FIELD_BY_KEY[k];
    return f.type === "money" ? moneyControl(k) : sliderControl(k, f);
  }

  /* ---------- the two disclosures ---------- */

  function disclosure(summaryText, body, open){
    var d = document.createElement("details");
    if(open) d.open = true;
    var s = document.createElement("summary");
    s.textContent = summaryText;
    d.appendChild(s);
    var b = el("div", "dbody");
    b.appendChild(body);
    d.appendChild(b);
    return d;
  }

  function worldsBlock(c){
    var frag = document.createDocumentFragment();
    if(c.typical.note) {
      var n = el("p", "worlds-note", c.typical.note);
      frag.appendChild(n);
    }
    var g = el("div", "worlds");
    [["Developed markets", c.typical.developed], ["Developing markets", c.typical.developing]].forEach(function(pair){
      var w = el("div", "world");
      w.appendChild(el("h4", null, pair[0]));
      w.appendChild(el("p", null, pair[1]));
      g.appendChild(w);
    });
    frag.appendChild(g);
    frag.appendChild(el("p", null,
      "Rough anchors, not live data — they move, and they vary hugely inside any one country. " +
      "Use them to sanity-check a number, not to source one."));
    return frag;
  }

  function tellMe(k, typicalOpen){
    var c = guide.fields[k];
    var box = el("div", "tellme");
    box.appendChild(disclosure("Why this matters", el("p", null, c.why), false));
    box.appendChild(disclosure("What's a normal number here?", worldsBlock(c), typicalOpen));
    return box;
  }

  /* ===================== screens ===================== */

  function askBlock(k, compact){
    var c = guide.fields[k], f = engine.FIELD_BY_KEY[k];
    var box = el("div", "ask");
    if(compact){
      box.appendChild(el("div", "aname", f.label));
      box.appendChild(el("div", "awhat", c.what));
    }
    box.appendChild(control(k));
    var chips = chipRow(k, f, c.presets);
    if(chips) box.appendChild(chips);
    /* With no chips there is nothing on screen carrying a typical value, so
       open the block that does. Money is the usual case: "what a house costs"
       has no number that travels. */
    box.appendChild(tellMe(k, !chips));
    return box;
  }

  function renderIntro(){
    card.appendChild(el("div", "eyebrow", "Before we start"));
    card.appendChild(headed(el("h2", "q", guide.intro.question)));
    var what = el("p", "what");
    what.innerHTML = guide.intro.what;
    card.appendChild(what);

    var list = el("ul", "dbody");
    list.style.margin = "0 0 18px";
    list.style.paddingLeft = "18px";
    guide.intro.how.forEach(function(line){
      var li = document.createElement("li");
      li.innerHTML = line;
      li.style.marginBottom = "6px";
      list.appendChild(li);
    });
    card.appendChild(list);

    if(fromLink || resumed){
      var note = el("p", "what");
      note.innerHTML = fromLink
        ? "<b>This link came with numbers in it.</b> They are already loaded. Walk through them to see what each one means, or jump straight to the answer."
        : "<b>Your last answers are still here.</b> Carry on from them, or start over below.";
      card.appendChild(note);
    }

    card.appendChild(aiHelp());
  }

  function renderMode(step){
    card.appendChild(el("div", "eyebrow", step.section || "First things first"));
    card.appendChild(headed(el("h2", "q", step.question)));
    var what = el("p", "what");
    what.innerHTML = step.what;
    card.appendChild(what);

    var box = el("div", "choices");
    step.options.forEach(function(o){
      var b = el("button", "choice");
      b.type = "button";
      b.setAttribute("aria-pressed", String(engine.mode === o.value));
      b.appendChild(el("span", "cl", o.label));
      b.appendChild(el("span", "cb", o.blurb));
      b.addEventListener("click", function(){
        engine.mode = o.value;
        wiz.markAnswered("#mode");
        engine.updateURL();
        draw();
      });
      box.appendChild(b);
    });
    card.appendChild(box);
    if(step.why){
      var t = el("div", "tellme");
      t.appendChild(disclosure("Why this matters", el("p", null, step.why), false));
      card.appendChild(t);
    }
  }

  function renderQuestion(step){
    var k = step.keys[0], c = guide.fields[k];
    card.appendChild(el("div", "eyebrow", step.section));
    card.appendChild(headed(el("h2", "q", c.q)));
    var what = el("p", "what");
    what.innerHTML = c.what;
    card.appendChild(what);
    card.appendChild(askBlock(k, false));
  }

  function renderGroup(step){
    card.appendChild(el("div", "eyebrow", step.section));
    card.appendChild(headed(el("h2", "q", step.title)));
    var what = el("p", "what");
    what.innerHTML = step.blurb;
    card.appendChild(what);
    step.keys.forEach(function(k){ card.appendChild(askBlock(k, true)); });
  }

  /* ---------- the answer ---------- */

  function renderAnswer(){
    var out = guide.outcome(engine, engine.simulate());
    card.classList.add("answer");

    var v = el("div", "verdict");
    var line = headed(el("div", "verdict-line"));
    line.innerHTML = out.headline;
    var sub = el("p");
    sub.innerHTML = out.sub;
    v.appendChild(line);
    v.appendChild(sub);
    card.appendChild(v);

    if(out.warn){
      var w = el("div", "warn");
      w.innerHTML = out.warn;
      card.appendChild(w);
    }

    /* chart */
    var chartPanel = panel("What you'd be worth if you sold that year",
                           "Years 0–" + engine.V.horizon);
    var chartBox = el("div", "chartbox");
    var chart = document.createElement("crossover-chart");
    chart.setAttribute("role", "img");
    chart.setAttribute("aria-label", out.labelA + " against " + out.labelB + ", year by year");
    chartBox.appendChild(chart);
    chartPanel.appendChild(chartBox);
    var legend = el("div", "legend");
    legend.innerHTML =
      '<span><i style="background:var(--accent)"></i>' + out.labelA + "</span>" +
      '<span><i style="background:var(--accent2)"></i>' + out.labelB + "</span>";
    chartPanel.appendChild(legend);
    card.appendChild(chartPanel);

    /* tiles */
    var tilePanel = panel("The numbers behind it", engine.V.horizon + "-year horizon");
    var tiles = document.createElement("key-tiles");
    tiles.className = "tiles";
    tilePanel.appendChild(tiles);
    card.appendChild(tilePanel);

    /* actions */
    var actions = el("div", "actions");
    var copyLink = el("button", "btn ghost", "Copy link");
    copyLink.type = "button";
    copyLink.addEventListener("click", function(){
      copyWithFeedback(this, location.href, "Copy link");
    });
    var full = document.createElement("a");
    full.className = "btn ghost";
    full.style.textDecoration = "none";
    full.textContent = "Open the full calculator";
    var pdf = el("button", "btn ghost", "Save as PDF");
    pdf.type = "button";
    pdf.title = 'Opens the print dialog — choose "Save as PDF" as the destination';
    pdf.addEventListener("click", function(){ window.print(); });
    var again = el("button", "btn ghost", "Start over");
    again.type = "button";
    again.addEventListener("click", function(){
      engine.resetToDefaults();
      wiz.reset();
      if(opts.currency) opts.currency.setCode(engine.cur.code);
      engine.updateURL();
      draw();
    });
    actions.appendChild(copyLink);
    actions.appendChild(full);
    actions.appendChild(pdf);
    actions.appendChild(again);
    card.appendChild(actions);

    /* review */
    var rvPanel = panel("Every answer you gave", "Edit any of them");
    var rv = el("div", "review");
    var lastSection = null;
    wiz.review().forEach(function(r){
      if(r.section !== lastSection){
        rv.appendChild(el("div", "rv-sec", r.section));
        lastSection = r.section;
      }
      var row = el("div", "rv-row");
      row.appendChild(el("div", "rl", r.label));
      /* Numbers get the mono face the rest of the site gives them; the mode's
         answer is a phrase, and setting a sentence in tabular figures reads as
         a mistake. */
      row.appendChild(el("div", r.key ? "rv num" : "rv", r.key ? shown(engine, r.key) : r.value));
      if(!r.yours) row.appendChild(el("span", "tag", "our default"));
      var edit = el("button", "edit", "Edit");
      edit.type = "button";
      edit.setAttribute("aria-label", "Edit " + r.label);
      edit.addEventListener("click", function(){ wiz.goTo(r.stepId); draw(); });
      row.appendChild(edit);
      rv.appendChild(row);
    });
    rvPanel.appendChild(rv);
    card.appendChild(rvPanel);

    var foot = el("footer");
    foot.innerHTML = guide.disclaimer;
    card.appendChild(foot);

    /* Drawn after the nodes are in the document: crossover-chart measures its
       own box, and a detached element measures zero. */
    requestAnimationFrame(function(){
      chart.draw({
        series: out.series,
        colorA: "var(--accent)",
        colorB: "var(--accent2)",
        formatY: function(x){ return engine.fmtC(x); },
        zeroFloor: true,
        breakEven: out.breakEven
      });
    });
    tiles.render(out.tiles);
    var qs = engine.buildQueryString();
    full.href = calcHref + (qs ? "?" + qs : "");
  }

  function panel(title, hint){
    var p = el("div", "panel");
    var hd = el("div", "panel-hd");
    hd.appendChild(el("h2", null, title));
    if(hint) hd.appendChild(el("span", "hint", hint));
    p.appendChild(hd);
    return p;
  }

  /* ---------- the AI escape hatch ---------- */

  function aiPrompt(){
    var base = location.origin + location.pathname;
    var lines = guide.aiIntro.slice();
    lines.push(base);
    lines.push("");
    if(location.search){
      lines.push("I've already set some of it up: " + location.href);
      lines.push("Treat those as a starting point and correct any you can research.");
      lines.push("");
    }
    lines.push("Ask me what you need to know about my situation, then look up current figures");
    lines.push("for my city and market. Tell me where each number came from and how confident");
    lines.push("you are. Where you can't find something, say so and use a sensible default");
    lines.push("rather than inventing precision.");
    lines.push("");
    lines.push("Then give me one link, built to the rules below. The same query string also");
    lines.push("works on the plain calculator at " + new URL(calcHref, base).href + ".");
    lines.push("");
    lines.push(specText(engine, base));
    return lines.join("\n");
  }

  function aiHelp(){
    var d = document.createElement("details");
    d.className = "aihelp wiz-ai";
    var s = document.createElement("summary");
    s.textContent = "Don't know your numbers? Get an AI to look them up";
    d.appendChild(s);
    var body = el("div", "body");
    var p = el("p", null,
      "Copy the prompt below into ChatGPT, Claude or any chatbot that can search the web. " +
      "It explains every question in here and asks for a link back that opens this " +
      "walkthrough with your numbers already filled in. You can still change any of them.");
    body.appendChild(p);
    var b = el("button", "linkbtn", "Copy prompt");
    b.type = "button";
    b.id = "copyPrompt";
    b.addEventListener("click", function(){
      var text;
      try{
        text = aiPrompt();
      }catch(e){
        var btn = this;
        btn.textContent = e.name === "StaleEngineError" ? "Reload the page" : "Copy failed";
        setTimeout(function(){ btn.textContent = "Copy prompt"; }, 2500);
        throw e;
      }
      copyWithFeedback(this, text, "Copy prompt");
    });
    body.appendChild(b);
    var fine = el("p", "fineprint");
    fine.innerHTML = 'The same spec is published at <a href="' + specHref +
      '">llms.txt</a>, if you would rather point the chatbot straight at it.';
    body.appendChild(fine);
    d.appendChild(body);
    return d;
  }

  /* ---------- navigation ---------- */

  function nav(step){
    var box = el("div", "wiz-nav");
    if(step.kind === "answer") return box;

    if(wiz.index() > 0){
      var back = el("button", "btn ghost", "Back");
      back.type = "button";
      back.addEventListener("click", function(){ wiz.back(); draw(); });
      box.appendChild(back);
    }
    box.appendChild(el("div", "grow"));

    if(step.kind !== "intro"){
      var skip = el("button", "btn quiet");
      skip.type = "button";
      /* Skipping IS moving on — the button exists for what its label says out
         loud, which is the number that stays behind if you do. */
      skip.addEventListener("click", function(){ wiz.next(); draw(); });
      box.appendChild(skip);
      /* The label names the value skipping would leave behind, so it has to
         follow that value as the visitor moves the slider. And once they have
         answered everything on the screen there is nothing left to skip —
         offering it anyway would imply the answer was about to be thrown
         away. */
      syncers.push(function(){
        var keys = step.kind === "mode" ? ["#mode"] : step.keys;
        var mine = keys.every(function(k){ return wiz.answered[k]; });
        skip.hidden = mine;
        if(!mine) skip.textContent = skipLabel(step);
      });
    }

    var next = el("button", "btn next");
    next.type = "button";
    var steps = wiz.steps();
    var atLast = wiz.index() === steps.length - 2;
    next.textContent = step.kind === "intro" ? "Start" : (atLast ? "See my answer" : "Next");
    next.addEventListener("click", function(){ wiz.next(); draw(); });
    box.appendChild(next);
    return box;
  }

  /* Say what skipping actually leaves behind. "Skip" alone hides the fact that
     a number is still going into the model. */
  function skipLabel(step){
    if(step.kind === "mode"){
      var v = engine.MODE_META.values.filter(function(o){ return o.value === engine.mode; })[0];
      return "Skip — keep “" + (v ? v.label : engine.mode) + "”";
    }
    if(step.keys.length === 1) return "Skip — keep " + shown(engine, step.keys[0]);
    return "Skip these — the defaults are fine";
  }

  /* ---------- the running answer ---------- */

  function drawSoFar(){
    var step = wiz.current();
    if(step.kind === "intro" || step.kind === "answer"){ sofar.hidden = true; return; }
    var out = guide.outcome(engine, engine.simulate());
    sofar.hidden = false;
    sofar.innerHTML = '<span class="lab">So far</span><span class="txt">' + out.short + "</span>";
  }

  /* ---------- draw ---------- */

  function draw(){
    var step = wiz.current();
    syncers = [];
    card.className = "card";
    card.innerHTML = "";

    if(step.kind === "intro") renderIntro();
    else if(step.kind === "mode") renderMode(step);
    else if(step.kind === "group") renderGroup(step);
    else if(step.kind === "answer") renderAnswer();
    else renderQuestion(step);

    card.appendChild(nav(step));
    syncers.forEach(function(fn){ fn(); });

    var p = wiz.progress();
    fill.style.width = p.pct + "%";
    bar.setAttribute("aria-valuenow", String(p.pct));
    if(step.kind === "answer"){
      where.innerHTML = p.yours === 0
        ? "<b>Done</b> — every number here is our default"
        : "<b>Done</b> — " + p.yours + " of " + p.total + " answers are yours, the rest are our defaults";
    } else if(step.kind === "intro"){
      where.innerHTML = "<b>" + p.total + " questions</b> — skip any of them";
    } else {
      where.innerHTML = "Question <b>" + p.step + "</b> of " + p.total + " — " + step.section;
    }
    escape.hidden = step.kind === "answer";

    drawSoFar();
    engine.updateURL();
    if(started) (card.querySelector("[data-focus]") || card).focus();
    window.scrollTo({ top: 0, behavior: started ? "smooth" : "auto" });
  }

  /* First paint should not steal focus or animate a scroll; every step after
     it should do both. */
  var started = false;
  draw();
  started = true;
  engine.suppressPersist = false;

  return { wizard: wiz, redraw: draw };
}

return { mount: mount };
})();
