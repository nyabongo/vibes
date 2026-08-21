(function(root, factory){
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.Brick = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function(){
"use strict";

var DEFAULT_MODE = "asyougo";
var DEFAULT_CUR_CODE = "UGX";

/* Keep in sync with the currency list in shared/components/currency-select.js. */
var CURRENCIES = [
  { code:"KES", sym:"KSh",  rate:1 },
  { code:"UGX", sym:"USh",  rate:28.7 },
  { code:"USD", sym:"$",    rate:0.0077 },
  { code:"GBP", sym:"£",    rate:0.0061 },
  { code:"EUR", sym:"€",    rate:0.0071 },
  { code:"ZAR", sym:"R",    rate:0.14 },
  { code:"NGN", sym:"₦",    rate:11.6 },
  { code:"INR", sym:"₹",    rate:0.65 },
  { code:"AED", sym:"AED ", rate:0.028 }
];

var STORAGE_KEY = "brickByBrick.v1";
var PARAM_MAP = {
  savings:"sav", saveMonthly:"sm", incomeGrowth:"ig",
  landCost:"land", landFeesPct:"lfee",
  sqm:"sqm", costPerSqm:"cps", permitsPct:"perm", wastagePct:"wst", buildInflation:"bi",
  moveInAt:"mi", decayPct:"dec",
  startAt:"sa", pushMonths:"pm",
  rent:"r", rentGrowth:"rg",
  ownCost:"oc", maintPct:"mnt", inflation:"infl",
  apprec:"app", finishedValuePct:"fv", partBuiltPct:"pb",
  invest:"inv", investTax:"itx", investFee:"ife",
  sellPct:"sp", cgt:"cgt", horizon:"h"
};
var PARAM_MAP_REV = {};
Object.keys(PARAM_MAP).forEach(function(k){ PARAM_MAP_REV[PARAM_MAP[k]] = k; });

/* ===================== field definitions ===================== */
function money(k,label,note){ return {k:k,label:label,note:note,type:"money"}; }
function pct(k,label,min,max,step,note){ return {k:k,label:label,min:min,max:max,step:step,note:note,type:"pct"}; }
/* a slider that reads as a plain count, not a percentage */
function num(k,label,min,max,step,note,unit){ return {k:k,label:label,min:min,max:max,step:step,note:note,unit:unit,type:"num"}; }

var FIELDS = {
  fStart:[
    money("savings","What you have saved now","Both paths start from this same figure. One buys a plot with it, the other invests it."),
    money("saveMonthly","What you can put aside each month","On top of the rent you already pay. This is the money that either becomes bricks or becomes a portfolio."),
    pct("incomeGrowth","Salary growth",0,25,0.25,"Per year. Set it against construction inflation below — if it loses that race, the house is never finished.")
  ],
  fLand:[
    money("landCost","Plot price","Bought as soon as you can afford it, which is not necessarily in month one."),
    pct("landFeesPct","Survey, transfer & legal",0,20,0.5,"Stamp duty, surveyor, transfer, lawyer. A share of the plot price, and none of it comes back.")
  ],
  fHouse:[
    num("sqm","House size",30,600,5,"A modest three-bedroom bungalow is around 120."," m²"),
    money("costPerSqm","Build cost per square metre","Shell, roof, finishes and services, at today's prices."),
    pct("permitsPct","Plans, approvals & supervision",0,25,0.5,"Architect, engineer, local authority approvals. A share of build cost."),
    pct("wastagePct","Wastage, theft & rework",0,35,1,"Materials that walk off site, spoilage, and redoing work done wrong. The tax on managing your own build."),
    pct("buildInflation","Construction cost inflation",0,30,0.25,"Per year, on cement, steel and iron sheets. This is what you are racing.")
  ],
  fAsYouGo:[
    pct("moveInAt","Move in once this much is done",30,100,5,"Most people move in before the house is finished. Rent stops here, and finishing carries on around you."),
    pct("decayPct","Deterioration while unfinished",0,20,0.5,"Per year. A shell standing out in the rain is worth less every season it waits for a roof.")
  ],
  fSaveFirst:[
    pct("startAt","Break ground once you have saved",10,150,5,"A share of the build cost. Waiting longer means a shorter build, but more months of rent."),
    num("pushMonths","Months to build once you start",3,60,1,"The short push. Running out of money mid-push simply slows it down."," months")
  ],
  fRent:[
    money("rent","Rent you pay now","Per month. It stops the month you move in, and that is the single biggest swing in the model."),
    pct("rentGrowth","Rent growth",0,25,0.25,"Per year. Every year the build runs long costs more than the year before it.")
  ],
  fOwning:[
    money("ownCost","Running the place once you own it","Per month. Ground rent, security, water, garbage — the things a rental quietly included."),
    pct("maintPct","Repairs & upkeep",0,5,0.1,"Per year, as a share of what the house is worth. 1% is the usual rule of thumb."),
    pct("inflation","Inflation",0,20,0.25,"Pushes up the running costs above.")
  ],
  fWorth:[
    pct("apprec","Land & house appreciation",-5,20,0.25,"Per year, on the plot from day one — including while you are still saving to buy it, which is what can put it out of reach — and on the house once it is finished."),
    pct("finishedValuePct","Finished house is worth",50,200,5,"A share of what it cost to build. Above 100 means you captured the margin a developer would have taken."),
    pct("partBuiltPct","An unfinished house fetches",0,100,5,"A share of the work standing in it, priced at what that work would cost today. Walls without a roof are not an asset at cost.")
  ],
  fInvest:[
    pct("invest","Return if invested instead",0,30,0.25,"Annual, compounding. Ugandan treasury bonds have run in the low-to-mid teens."),
    pct("investTax","Tax on those returns",0,40,0.5,"Withholding tax. 15% on interest in Uganda."),
    pct("investFee","Annual management fee",0,5,0.1,"Charged on the balance, so it bites every year.")
  ],
  fExit:[
    pct("sellPct","Selling costs",0,15,0.25,"Agent and legal fees, if you ever sell."),
    pct("cgt","Capital gains tax",0,40,0.5,"Uganda exempts a home you have lived in for at least two years, which is why this starts at zero."),
    num("horizon","Years to compare over",1,40,1,"How far out to run both paths."," years")
  ]
};
var FIELD_BY_KEY = {};
Object.keys(FIELDS).forEach(function(id){
  FIELDS[id].forEach(function(f){ FIELD_BY_KEY[f.k] = f; });
});

/* ===================== spec metadata =====================
   Read by shared/spec-text.js to generate llms.txt and the "ask an AI"
   prompt. Everything here describes the URL API, not the maths — the
   numbers themselves come from FIELDS and DEFAULTS. Keep `legend` matching
   the <legend> text in index.html; `mode` gates a section to one mode. */
var SECTION_META = {
  fStart:     { legend:"What you're working with" },
  fLand:      { legend:"The plot" },
  fHouse:     { legend:"The house" },
  fAsYouGo:   { legend:"Building as you go", mode:"asyougo" },
  fSaveFirst: { legend:"Saving first", mode:"savefirst" },
  fRent:      { legend:"Renting now" },
  fOwning:    { legend:"Once you move in" },
  fWorth:     { legend:"What it's worth" },
  fInvest:    { legend:"The alternative" },
  fExit:      { legend:"Getting out" }
};

var MODE_META = {
  param:"m",
  label:"how the build is paid for",
  values:[
    { value:"asyougo", label:"Build as you go",
      note:"Buy the plot, break ground, and put in whatever you have each month for as long as it takes. Uses `mi` and `dec`." },
    { value:"savefirst", label:"Save first, then build",
      note:"Leave the money compounding until a set share of the cost is in hand, then build in one short push. Uses `sa` and `pm`, and you move in only once the house is finished." }
  ],
  note:"`mi` and `dec` are ignored under `savefirst`, and `sa` and `pm` are ignored under `asyougo`. Setting the wrong one for the mode does nothing."
};

/* Worked examples for the docs. Kept as data so the tests can round-trip them
   through loadFromURL/buildQueryString — that catches an out-of-range value
   that got clamped, a param set to its own default, or a typo'd short name. */
var EXAMPLES = [
  { label:"A smaller 90 m² house at a cheaper rate per square metre, with a bigger monthly push",
    params:{ sqm:90, sm:70000, cps:45000 } },
  { label:"Saving first: leave it compounding at 16% until 85% of the cost is in hand, then build",
    params:{ m:"savefirst", sa:85, inv:16 } },
  { label:"Construction inflation at 14% against a thin monthly budget — the house that never gets finished",
    params:{ bi:14, sm:25000, h:30 } }
];

function mrate(annualPct){ return Math.pow(1+annualPct/100, 1/12) - 1; }

class BrickByBrickModel {
  constructor(){
    this.mode = DEFAULT_MODE; // "asyougo" | "savefirst" — how the build is paid for
    this.cur = { code:"UGX", sym:"USh", rate:28.7 };
    this.suppressPersist = false;

    /* Money is KES here as it is in every tool in this repo, but this one opens
       in UGX. The odd-looking fractions are chosen so the default scenario
       displays as round Ugandan shillings — 1045296.1672 * 28.7 rounds to
       exactly 30,000,000. buildQueryString omits any value still equal to its
       default, so none of them ever reach a shared link. */
    this.V = {
      savings:1045296.1672, saveMonthly:87108.0139, incomeGrowth:7,
      landCost:1393728.223, landFeesPct:8,
      sqm:120, costPerSqm:52264.8084, permitsPct:6, wastagePct:10, buildInflation:8,
      moveInAt:70, decayPct:3,
      startAt:70, pushMonths:12,
      rent:31358.885, rentGrowth:6,
      ownCost:5226.4808, maintPct:1, inflation:6,
      apprec:8, finishedValuePct:110, partBuiltPct:65,
      invest:14, investTax:15, investFee:1,
      sellPct:5, cgt:0, horizon:25
    };
    this.DEFAULTS = {};
    Object.keys(this.V).forEach((k) => { this.DEFAULTS[k] = this.V[k]; });

    this.CURRENCIES = CURRENCIES;
    this.PARAM_MAP = PARAM_MAP;
    this.PARAM_MAP_REV = PARAM_MAP_REV;
    this.STORAGE_KEY = STORAGE_KEY;
    this.FIELDS = FIELDS;
    this.FIELD_BY_KEY = FIELD_BY_KEY;
    this.SECTION_META = SECTION_META;
    this.MODE_META = MODE_META;
    this.EXAMPLES = EXAMPLES;
    this.DEFAULT_MODE = DEFAULT_MODE;
    this.DEFAULT_CUR_CODE = DEFAULT_CUR_CODE;
    this.mrate = mrate;
  }

  /* ===================== currencies ===================== */
  applyCurrency(code){
    for(var i=0;i<CURRENCIES.length;i++){
      if(CURRENCIES[i].code===code){
        this.cur = { code:CURRENCIES[i].code, sym:CURRENCIES[i].sym, rate:CURRENCIES[i].rate };
        return true;
      }
    }
    return false;
  }

  resetToDefaults(){
    Object.keys(this.DEFAULTS).forEach((k) => { this.V[k] = this.DEFAULTS[k]; });
    this.mode = DEFAULT_MODE;
    this.applyCurrency(DEFAULT_CUR_CODE);
  }

  /* ===================== sharing / persistence ===================== */
  buildQueryString(){
    var params = new URLSearchParams();
    Object.keys(PARAM_MAP).forEach((k) => {
      if(Math.abs(this.V[k]-this.DEFAULTS[k]) > 1e-9) params.set(PARAM_MAP[k], this.V[k]);
    });
    if(this.mode !== DEFAULT_MODE) params.set("m", this.mode);
    if(this.cur.code !== DEFAULT_CUR_CODE) params.set("c", this.cur.code);
    return params.toString();
  }

  updateURL(){
    var qs = this.buildQueryString();
    if(typeof window !== "undefined" && window.history && window.location){
      history.replaceState(null, "", location.pathname + (qs?("?"+qs):"") + location.hash);
    }
    if(!this.suppressPersist){
      try{ localStorage.setItem(STORAGE_KEY, JSON.stringify({ V:this.V, mode:this.mode, cur:this.cur.code })); }catch(e){}
    }
  }

  loadFromStorage(raw){
    try{
      if(raw === undefined) raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return;
      var data = JSON.parse(raw);
      if(data.V) Object.keys(data.V).forEach((k) => {
        if(Object.prototype.hasOwnProperty.call(this.V, k) && typeof data.V[k]==="number" && isFinite(data.V[k])) this.V[k] = this.clampToField(k, data.V[k]);
      });
      if(data.mode==="asyougo"||data.mode==="savefirst") this.mode = data.mode;
      if(data.cur) this.applyCurrency(data.cur);
    }catch(e){}
  }

  clampToField(k, num){
    var f = FIELD_BY_KEY[k];
    if(!f) return num;
    if(f.type==="pct" || f.type==="num"){
      if(typeof f.min==="number") num = Math.max(f.min, num);
      if(typeof f.max==="number") num = Math.min(f.max, num);
    } else if(f.type==="money"){
      num = Math.max(0, Math.min(num, 1e12));
    }
    return num;
  }

  paramKey(key){
    return Object.prototype.hasOwnProperty.call(PARAM_MAP_REV, key) ? PARAM_MAP_REV[key] : undefined;
  }

  hasScenarioParams(search){
    if(search === undefined) search = (typeof location !== "undefined" ? location.search : "");
    var found = false;
    new URLSearchParams(search).forEach((val, key) => {
      if(key==="m" || key==="c" || this.paramKey(key)) found = true;
    });
    return found;
  }

  loadFromURL(search){
    if(search === undefined) search = (typeof location !== "undefined" ? location.search : "");
    var params = new URLSearchParams(search);
    params.forEach((val, key) => {
      if(key==="m"){ this.mode = (val==="savefirst") ? "savefirst" : "asyougo"; return; }
      if(key==="c"){ this.applyCurrency(val); return; }
      var k = this.paramKey(key);
      if(k){ var num = parseFloat(val); if(isFinite(num)) this.V[k] = this.clampToField(k, num); }
    });
  }

  /* ===================== formatting ===================== */
  fmt(n){
    var x = n * this.cur.rate;
    return (x<0?"−":"") + this.cur.sym + Math.round(Math.abs(x)).toLocaleString("en-US");
  }
  fmtC(n){ // compact, for axes
    var x = n * this.cur.rate, s = x<0?"−":"", a = Math.abs(x);
    if(a>=1e9) return s+this.cur.sym+(a/1e9).toFixed(1).replace(/\.0$/,"")+"B";
    if(a>=1e6) return s+this.cur.sym+(a/1e6).toFixed(1).replace(/\.0$/,"")+"M";
    if(a>=1e3) return s+this.cur.sym+Math.round(a/1e3)+"k";
    return s+this.cur.sym+Math.round(a);
  }
  pctS(x){ return (Math.round(x*10)/10) + "%"; }

  /* ===================== the model ===================== */
  /* One net rate drives both the renter's portfolio and the builder's leftover
     cash, so the two sides are always holding the same instrument. */
  netInvestReturn(o){
    var V = this.V;
    var invest = (o && o.invest !== undefined) ? o.invest : V.invest;
    return invest * (1 - V.investTax/100) - V.investFee;
  }

  /* What the whole house costs at today's prices, before any inflation. */
  costs(o){
    var V = this.V;
    var costPerSqm = (o && o.costPerSqm !== undefined) ? o.costPerSqm : V.costPerSqm;
    var shell   = V.sqm * costPerSqm;
    var permits = shell * V.permitsPct/100;
    var wastage = (shell + permits) * V.wastagePct/100;
    return {
      shell: shell,
      permits: permits,
      wastage: wastage,
      baseCost: shell + permits + wastage,
      landFees: V.landCost * V.landFeesPct/100
    };
  }

  simulate(o){
    o = o || {};
    var V = this.V;
    var mode           = o.mode           !== undefined ? o.mode           : this.mode;
    var apprec         = o.apprec         !== undefined ? o.apprec         : V.apprec;
    var rent0          = o.rent           !== undefined ? o.rent           : V.rent;
    var saveMonthly    = o.saveMonthly    !== undefined ? o.saveMonthly    : V.saveMonthly;
    var buildInflation = o.buildInflation !== undefined ? o.buildInflation : V.buildInflation;
    var horizon        = o.horizon        !== undefined ? o.horizon        : V.horizon;

    var c = this.costs(o);
    var baseCost = c.baseCost;

    var gInv   = mrate(this.netInvestReturn(o));
    var gRent  = mrate(V.rentGrowth);
    var gInc   = mrate(V.incomeGrowth);
    var gBuild = mrate(buildInflation);
    var gAppr  = mrate(apprec);
    var gInf   = mrate(V.inflation);

    var months = Math.round(horizon*12);
    /* In a short push you stay in the rental until the house is done; moving in
       part-way through is an as-you-go idea. */
    var moveTrigger = mode === "savefirst" ? 1 : V.moveInAt/100;

    var pot  = V.savings;  // the builder's liquid cash
    var iPot = V.savings;  // the renter's portfolio — the same starting line
    var owned = false, started = false;
    var landPaid = 0, sunk = 0, progress = 0;
    var landM = null, firstSpendM = null, moveInM = null, doneM = null;
    var completeValue = 0;
    var rentPaid = 0, ownPaid = 0;
    var monthlyBefore = null, monthlyAfter = null;

    function landValueAt(m){ return V.landCost * Math.pow(1+gAppr, m); }

    /* An unfinished shell is worth a fraction of the work standing in it, priced
       at what that work would cost to put up today — not at the nominal money
       spent, which on a ten-year build is mostly long-devalued shillings. The
       fraction then slides for as long as the structure waits in the weather. */
    function houseValueAt(m){
      if(progress >= 1) return completeValue * Math.pow(1+gAppr, m - doneM);
      if(progress <= 0 || firstSpendM === null) return 0;
      var costNow = baseCost * Math.pow(1+gBuild, m);
      return progress * costNow * (V.partBuiltPct/100) *
             Math.pow(1 - V.decayPct/100, (m - firstSpendM)/12);
    }

    var series = [];
    function snapshot(y, m){
      var land  = owned ? landValueAt(m) : 0;
      var house = houseValueAt(m);
      var sale  = (land + house) * (1 - V.sellPct/100);
      var gain  = Math.max(0, sale - (landPaid + sunk));
      var net   = sale - gain * V.cgt/100 + pot;
      series.push({ y:y, build:net, invest:iPot, progress:progress,
                    house:house, land:land, pot:pot, m:m });
    }
    snapshot(0, 0);

    for(var m=1; m<=months; m++){
      pot  *= (1+gInv);
      iPot *= (1+gInv);

      var save    = saveMonthly * Math.pow(1+gInc, m);
      var rentNow = rent0 * Math.pow(1+gRent, m);
      var wallet  = rentNow + save;   // the same money is on the table for both paths

      /* the renter: pays rent, invests what is left */
      iPot += wallet - rentNow;

      /* the builder: rent until move-in, then the costs of owning */
      var movedIn = moveInM !== null;
      var housing;
      if(movedIn){
        housing = V.ownCost * Math.pow(1+gInf, m) + houseValueAt(m) * V.maintPct/100/12;
        ownPaid += housing;
      } else {
        housing = rentNow;
        rentPaid += rentNow;
      }

      var avail = wallet - housing;
      pot += avail;

      var spend = 0;
      if(!owned){
        /* the plot comes first, and affording it can take a while */
        var landNow = landValueAt(m) * (1 + V.landFeesPct/100);
        if(pot >= landNow){
          /* The whole outlay is the basis, fees included — the same convention
             as rent-or-buy taxing the gain over price plus closing costs, and
             build-or-invest over a projectCost carrying its soft costs. Stamp
             duty and the lawyer are part of what the plot cost you; crediting
             only the headline price taxes a gain that was never made. */
          pot -= landNow; landPaid = landNow; owned = true; landM = m;
        }
      } else if(baseCost > 0 && progress < 1){
        var costNow = baseCost * Math.pow(1+gBuild, m);
        var remain  = (1 - progress) * costNow;
        var budget;
        if(mode === "savefirst"){
          if(!started && pot >= costNow * V.startAt/100) started = true;
          /* running dry mid-push just slows it to whatever cash there is */
          budget = started ? costNow / Math.max(1, Math.round(V.pushMonths)) : 0;
        } else {
          budget = Infinity;
        }
        /* The pot can go negative — running costs above what the month brings
           in are a real way to live — but a negative draw would run the build
           backwards, un-pouring concrete to pay a bill. */
        spend = Math.max(0, Math.min(pot, remain, budget));
        if(spend > 0){
          pot -= spend; sunk += spend;
          progress = Math.min(1, progress + spend/costNow);
          if(firstSpendM === null) firstSpendM = m;
        }
        if(progress >= 1 && doneM === null){
          doneM = m;
          completeValue = costNow * V.finishedValuePct/100;
        }
      }

      if(moveInM === null && progress > 0 && progress >= moveTrigger) moveInM = m;

      /* One representative month either side of the flip, for the cashflow
         panel. A month's spend can exceed a month's income — the first one
         usually does, because that is the savings going into the ground — so
         prefer the first month the build is paying for itself out of income,
         and report the difference as drawn from savings when it isn't. */
      var steady = spend <= avail + 1e-9;
      var picture = function(m){
        return { build:spend, saved:Math.max(0, avail-spend),
                 drawn:Math.max(0, spend-avail), steady:steady, m:m };
      };
      if(spend > 0 && (monthlyBefore === null || !monthlyBefore.steady) && !movedIn){
        monthlyBefore = picture(m); monthlyBefore.rent = rentNow;
      }
      if(movedIn && (monthlyAfter === null || !monthlyAfter.steady)){
        monthlyAfter = picture(m); monthlyAfter.own = housing;
      }

      if(m % 12 === 0) snapshot(m/12, m);
    }
    if(months % 12 !== 0) snapshot(horizon, months);

    /* Until the plot is paid for, the two paths are not just close, they are
       the same arithmetic — identical wallet, identical rent, identical pot. A
       plain "first year build >= invest" scan, which is all the other two
       calculators need, would call that tie a crossover in year one. So a
       crossover here means overtaking: ahead, having first been behind. */
    var be = null, wasBehind = false;
    for(var i=1;i<series.length;i++){
      if(series[i].build < series[i].invest) wasBehind = true;
      else if(wasBehind){ be = series[i].y; break; }
    }
    var last = series[series.length-1];

    return {
      series: series,
      shell: c.shell, permits: c.permits, wastage: c.wastage,
      baseCost: baseCost, landFees: c.landFees,
      landPaid: landPaid, sunk: sunk,
      landYear:   landM   === null ? null : landM/12,
      moveInYear: moveInM === null ? null : moveInM/12,
      finishYear: doneM   === null ? null : doneM/12,
      neverBuysLand: !owned,
      neverFinishes: progress < 1,
      neverMovesIn: moveInM === null,
      progressAtHorizon: progress,
      rentPaid: rentPaid,
      ownPaid: ownPaid,
      monthlyBefore: monthlyBefore,
      monthlyAfter: monthlyAfter,
      breakEven: be,
      finalBuild: last.build,
      finalInvest: last.invest,
      finalHouse: last.house,
      finalLand: last.land,
      finalPot: last.pot
    };
  }

  /* ===================== solvers ===================== */
  /* find the value of one knob at which building and renting tie */
  solve(key, lo, hi){
    var self = this;
    function f(x){ var o={}; o[key]=x; var s=self.simulate(o); return s.finalBuild - s.finalInvest; }
    var a=f(lo), b=f(hi);
    if(isNaN(a)||isNaN(b)) return null;
    if((a>0&&b>0)||(a<0&&b<0)) return null;
    for(var i=0;i<60;i++){
      var mid=(lo+hi)/2, v=f(mid);
      if((v>0)===(a>0)){ lo=mid; a=v; } else { hi=mid; }
    }
    return (lo+hi)/2;
  }
}

return new BrickByBrickModel();
});
