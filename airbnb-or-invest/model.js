(function(root, factory){
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.Airbnb = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function(){
"use strict";

/* Four starting points, one question: does running the place as a short let
   beat putting the same money into a unit trust or government paper?

     buy   — buy a finished place, furnish it, list it
     build — buy a plot, build, furnish, list
     own   — you own it already; the alternative is selling it and investing
     keep  — you own it and would keep it regardless; only the setup money is
             at stake, so the property itself is left out of both sides */
var MODES = ["buy", "build", "own", "keep"];
var PROPERTY_MODES = ["buy", "build", "own"];
var DEFAULT_MODE = "buy";
var DEFAULT_CUR_CODE = "KES";

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

var STORAGE_KEY = "airbnbOrInvest.v1";
var PARAM_MAP = {
  price:"pr", buyFeesPct:"bfee",
  land:"land", buildCost:"bc", feesPct:"fee", contingencyPct:"cont", buildMonths:"bm", worthPct:"wv",
  homeValue:"val",
  furnish:"furn", refreshPct:"ref", rampMonths:"ramp",
  nightly:"rate", occupancy:"occ", stayNights:"stay", rateGrowth:"rg",
  platformPct:"plat", mgmtPct:"mgmt", cleanStay:"cln", utilities:"util", repairs:"rep", incomeTax:"itax",
  fixedCosts:"fix", apprec:"app",
  sellPct:"sp", cgt:"cgt",
  invest:"inv", investTax:"itx", investFee:"ife",
  horizon:"h", inflation:"infl"
};
var PARAM_MAP_REV = {};
Object.keys(PARAM_MAP).forEach(function(k){ PARAM_MAP_REV[PARAM_MAP[k]] = k; });

/* An average month, so occupancy reads the same whichever month it is. */
var DAYS_PER_MONTH = 365 / 12;

/* ===================== field definitions ===================== */
function money(k,label,note){ return {k:k,label:label,note:note,type:"money"}; }
function pct(k,label,min,max,step,note){ return {k:k,label:label,min:min,max:max,step:step,note:note,type:"pct"}; }
/* a slider that reads as a plain count, not a percentage */
function num(k,label,min,max,step,note,unit){ return {k:k,label:label,min:min,max:max,step:step,note:note,unit:unit,type:"num"}; }

var FIELDS = {
  fBuy:[
    money("price","Purchase price","What the flat or house costs, before any fees."),
    pct("buyFeesPct","Stamp duty, legal & valuation",0,15,0.25,"Transfer costs on top of the price, as a share of it. None of it comes back when you sell.")
  ],
  fBuild:[
    money("land","Plot price","Paid on day one. Set to 0 if the plot is already yours."),
    money("buildCost","Build cost","Shell, finishes and services — construction only. Fees and contingency go on top."),
    pct("feesPct","Design, approvals & supervision",0,25,0.5,"Architect, engineer and local-authority approvals. A share of build cost."),
    pct("contingencyPct","Contingency",0,30,1,"Spare money for overruns, which are the norm. A share of build cost plus fees."),
    num("buildMonths","Months to build",1,48,1,"No guests while it goes up. The build cost is drawn evenly over these months."," months"),
    pct("worthPct","Finished place is worth",50,200,5,"A share of everything it cost, land included. Above 100 means you built for less than buyers would pay.")
  ],
  fOwn:[
    money("homeValue","What it would sell for today","Selling it and investing the proceeds is the alternative, so this is the money the Airbnb keeps tied up.")
  ],
  fSetup:[
    money("furnish","Furnishing & setup","Furniture, appliances, linen, kitchenware, a smart lock, photos. Paid once the place is ready."),
    pct("refreshPct","Replacing worn furnishings",0,50,1,"Per year, as a share of the setup cost. Guests wear things out far faster than a tenant would."),
    num("rampMonths","Months to get fully booked",0,24,1,"A new listing has no reviews. Bookings climb from nothing to your figure over these months."," months")
  ],
  fNights:[
    money("nightly","Nightly rate","What a guest pays per night, before the platform's cut."),
    pct("occupancy","Nights booked",0,100,1,"Share of the year with a guest in, once the listing is established. 55% is about 200 nights."),
    num("stayNights","Average stay",1,30,0.5,"Nights per booking. Every checkout means a clean and fresh linen."," nights"),
    pct("rateGrowth","Nightly rate growth",-5,20,0.25,"Per year.")
  ],
  fCosts:[
    pct("platformPct","Platform fee",0,20,0.5,"What Airbnb or Booking.com keeps from each booking."),
    pct("mgmtPct","Co-host or manager",0,35,1,"A share of bookings, if someone else runs it for you. 0 if you do it yourself."),
    money("cleanStay","Cleaning & laundry per stay","Per checkout, including soap, toilet paper and coffee."),
    money("utilities","Utilities & internet","Per month, booked or not: power, water, Wi-Fi, TV, security, service charge."),
    money("repairs","Repairs & upkeep","Per year. Short lets wear a place faster than long ones."),
    pct("incomeTax","Tax on bookings",0,40,0.5,"A share of everything you collect, before costs come off.")
  ],
  fHold:[
    money("fixedCosts","Rates, insurance & ground rent","Per year. What it costs to own the place at all, whether or not anyone stays."),
    pct("apprec","Property value growth",-5,20,0.25,"Per year.")
  ],
  fExit:[
    pct("sellPct","Selling costs",0,15,0.25,"Agent and legal fees when you sell — at the end, and under \"I own it\" if you sold today instead."),
    pct("cgt","Capital gains tax",0,40,0.5,"Charged on what you sell for above what the place cost you. Only the gain is taxed.")
  ],
  fInvest:[
    pct("invest","Return if invested instead",0,30,0.25,"Per year, compounding. A unit trust, money market fund, T-bills or a government bond."),
    pct("investTax","Tax on those returns",0,40,0.5,"Withholding tax taken off interest before you're paid."),
    pct("investFee","Annual management fee",0,5,0.1,"Charged on the balance every year. Unit trusts charge one; T-bills bought directly don't.")
  ],
  fTime:[
    num("horizon","Years to compare over",1,30,1,"The whole comparison is measured at this year, with the place sold."," years"),
    pct("inflation","Inflation",0,20,0.25,"Per year. Pushes up cleaning, utilities, repairs and the fixed costs.")
  ]
};
var FIELD_BY_KEY = {};
Object.keys(FIELDS).forEach(function(id){
  FIELDS[id].forEach(function(f){ FIELD_BY_KEY[f.k] = f; });
});

/* ===================== spec metadata =====================
   Read by shared/spec-text.js to generate llms.txt and the "ask an AI"
   prompt. Keep `legend` matching the <legend> text in advanced/index.html;
   `mode` gates a section to one mode, or to a list of them. */
var SECTION_META = {
  fBuy:   { legend:"Buying it", mode:"buy" },
  fBuild: { legend:"Building it", mode:"build" },
  fOwn:   { legend:"The place you own", mode:"own" },
  fSetup: { legend:"Getting it guest-ready" },
  fNights:{ legend:"What it earns" },
  fCosts: { legend:"Cost of running it" },
  fHold:  { legend:"Holding the property", mode:PROPERTY_MODES },
  fExit:  { legend:"Getting out", mode:PROPERTY_MODES },
  fInvest:{ legend:"The alternative" },
  fTime:  { legend:"Time & inflation" }
};

var MODE_META = {
  param:"m",
  label:"where you're starting from",
  values:[
    { value:"buy", label:"Buying a place",
      note:"Buy a finished flat or house and furnish it. The money at stake is `pr` plus `bfee` plus `furn`." },
    { value:"build", label:"Buying land and building",
      note:"Buy a plot and build, then furnish. Nothing is earned during the `bm` build months. The money at stake is `land`, `bc` with `fee` and `cont`, plus `furn`." },
    { value:"own", label:"I own it — or I could sell",
      note:"You own the place already. The alternative is selling it today, less `sp`, and investing that plus the furnishing money. Uses `val`." },
    { value:"keep", label:"I own it and I'm keeping it",
      note:"You own the place and would keep it either way, so only `furn` is at stake. Its value, growth, fixed costs and sale are the same on both paths and left out." }
  ],
  note:"`pr` and `bfee` apply only under `buy`; `land`, `bc`, `fee`, `cont`, `bm` and `wv` only under `build`; `val` only under `own`. `fix`, `app`, `sp` and `cgt` are ignored under `keep`. Setting a parameter the mode doesn't use does nothing."
};

/* Worked examples for the docs. Kept as data so the tests can round-trip them
   through loadFromURL/buildQueryString — that catches an out-of-range value
   that got clamped, a param set to its own default, or a typo'd short name. */
var EXAMPLES = [
  { label:"Buying a KES 12M two-bed at KES 9,000 a night, booked 60% of the year",
    params:{ pr:12000000, rate:9000, occ:60 } },
  { label:"Building on a plot you already own: KES 8M to build over 14 months",
    params:{ m:"build", land:0, bc:8000000, bm:14 } },
  { label:"A flat you own and could sell for KES 12.2M (about UGX 350M), managed yourself, shown in shillings of Uganda",
    params:{ m:"own", val:12200000, mgmt:0, c:"UGX" } },
  { label:"Keeping a flat you own either way — is KES 1M of furnishing worth it at KES 5,000 a night?",
    params:{ m:"keep", furn:1000000, rate:5000 } }
];

function mrate(annualPct){ return Math.pow(1+annualPct/100, 1/12) - 1; }

/* The live values with any per-call overrides laid over them — what solve()
   uses to move one knob at a time without touching the page's state. */
function view(V, o){
  var P = {};
  Object.keys(V).forEach(function(k){ P[k] = V[k]; });
  if(o) Object.keys(o).forEach(function(k){ if(Object.prototype.hasOwnProperty.call(V, k)) P[k] = o[k]; });
  return P;
}

class AirbnbModel {
  constructor(){
    this.mode = DEFAULT_MODE;
    this.cur = { code:"KES", sym:"KSh", rate:1 };
    this.suppressPersist = false;

    this.V = {
      price:9000000, buyFeesPct:5,
      land:3000000, buildCost:6000000, feesPct:8, contingencyPct:10, buildMonths:12, worthPct:110,
      homeValue:9000000,
      furnish:800000, refreshPct:15, rampMonths:4,
      nightly:6000, occupancy:55, stayNights:3, rateGrowth:5,
      platformPct:3, mgmtPct:15, cleanStay:1200, utilities:12000, repairs:60000, incomeTax:10,
      fixedCosts:40000, apprec:4,
      sellPct:3, cgt:15,
      invest:12, investTax:15, investFee:1,
      horizon:10, inflation:6
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
    this.MODES = MODES;
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
      if(MODES.indexOf(data.mode) >= 0) this.mode = data.mode;
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
      if(key==="m"){ this.mode = MODES.indexOf(val) >= 0 ? val : DEFAULT_MODE; return; }
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
  /* One net rate drives both the market path and the Airbnb path's cash pot,
     so the two sides are always the same instrument. */
  netInvestReturn(o){
    var P = view(this.V, o);
    return P.invest * (1 - P.investTax/100) - P.investFee;
  }

  /* What the Airbnb path puts on the table, mode by mode. `stake` is what the
     market path is handed on day one instead; `basis` is what capital gains
     are measured from. */
  costs(o){
    var P = view(this.V, o);
    var mode = (o && o.mode !== undefined) ? o.mode : this.mode;
    var c = { mode:mode, furnish:P.furnish, price:0, buyFees:0, land:0, buildCost:0, softCost:0,
              contingency:0, projectCost:0, saleNow:0, basis:0 };
    if(mode === "buy"){
      c.price = P.price;
      c.buyFees = P.price * P.buyFeesPct/100;
      c.basis = c.price + c.buyFees;
    } else if(mode === "build"){
      c.land = P.land;
      c.buildCost = P.buildCost;
      c.softCost = P.buildCost * P.feesPct/100;
      c.contingency = (c.buildCost + c.softCost) * P.contingencyPct/100;
      c.projectCost = c.land + c.buildCost + c.softCost + c.contingency;
      c.basis = c.projectCost;
    } else if(mode === "own"){
      /* The cash you'd walk away with if you sold today — the thing the
         Airbnb stops you from investing. Its CGT is measured from here too. */
      c.saleNow = P.homeValue * (1 - P.sellPct/100);
      c.basis = P.homeValue;
    }
    c.stake = c.basis - (mode === "own" ? P.homeValue - c.saleNow : 0) + c.furnish;
    return c;
  }

  simulate(o){
    o = o || {};
    var P = view(this.V, o);
    var mode = o.mode !== undefined ? o.mode : this.mode;
    var c = this.costs(o);
    var hasProperty = PROPERTY_MODES.indexOf(mode) >= 0;

    var gInv  = mrate(this.netInvestReturn(o));
    var gRate = mrate(P.rateGrowth);
    var gInf  = mrate(P.inflation);
    var gApp  = mrate(P.apprec);

    var months      = Math.round(P.horizon*12);
    var buildMonths = mode === "build" ? Math.round(P.buildMonths) : 0;
    var rampMonths  = Math.round(P.rampMonths);
    var tranche     = buildMonths > 0 ? (c.projectCost - c.land) / buildMonths : 0;

    /* Day one. Under build only the plot is paid for — the rest stays in the
       pot, earning, until it is drawn. Everywhere else the whole stake is
       spent (under own and keep, "spent" means not sold / not invested). */
    var day1 = mode === "build" ? c.land : c.stake;
    var pot  = c.stake - day1;
    var iPot = c.stake;
    var sunk = c.land;
    var cf   = [-day1];

    function valueAt(m){
      if(!hasProperty) return 0;
      if(mode === "buy") return c.price * Math.pow(1+gApp, m);
      if(mode === "own") return P.homeValue * Math.pow(1+gApp, m);
      if(m < buildMonths) return sunk;               // a building site is worth what's in it
      return c.projectCost * P.worthPct/100 * Math.pow(1+gApp, m - buildMonths);
    }
    function netWorth(value){
      if(!hasProperty) return pot;
      var sale = value * (1 - P.sellPct/100);
      var gain = Math.max(0, sale - c.basis);
      return sale - gain * P.cgt/100 + pot;
    }

    var series = [];
    var value = valueAt(0);
    function snapshot(y, m){
      series.push({ y:y, airbnb:netWorth(value), invest:iPot, value:value, pot:pot, m:m });
    }
    snapshot(0, 0);

    var stabYear = null, lastMonth = null, totalGross = 0, totalNet = 0, nightsSold = 0;
    for(var m=1; m<=months; m++){
      pot  *= (1+gInv);
      iPot *= (1+gInv);
      var flow = 0;
      var inf = Math.pow(1+gInf, m);

      if(m <= buildMonths){ pot -= tranche; sunk += tranche; flow -= tranche; }
      if(buildMonths > 0 && m === buildMonths){ pot -= c.furnish; flow -= c.furnish; }

      /* The costs of owning it at all run from day one, building site or not —
         except under keep, where they are paid on both paths and cancel. */
      var fixed = hasProperty ? P.fixedCosts/12 * inf : 0;
      pot -= fixed; flow -= fixed;

      if(m > buildMonths){
        var k = m - buildMonths;
        var ramp = rampMonths > 0 ? Math.min(1, k/rampMonths) : 1;
        var nights = DAYS_PER_MONTH * P.occupancy/100 * ramp;
        var stays = P.stayNights > 0 ? nights / P.stayNights : 0;
        var gross = nights * P.nightly * Math.pow(1+gRate, m);
        var mo = {
          gross:    gross,
          platform: gross * P.platformPct/100,
          mgmt:     gross * P.mgmtPct/100,
          cleaning: stays * P.cleanStay * inf,
          utilities:P.utilities * inf,
          repairs:  P.repairs/12 * inf,
          refresh:  P.furnish * P.refreshPct/100/12 * inf,
          fixed:    fixed,
          tax:      gross * P.incomeTax/100,
          nights:   nights
        };
        var net = gross - mo.platform - mo.mgmt - mo.cleaning - mo.utilities - mo.repairs - mo.refresh - mo.tax;
        pot += net; flow += net;
        mo.net = net - fixed;
        totalGross += gross;
        totalNet += mo.net;
        nightsSold += nights;
        lastMonth = mo;
        /* the first fully-booked month, kept for the running-cost breakdown */
        if(stabYear === null && ramp >= 1) stabYear = annualise(mo, m);
      }

      value = valueAt(m);
      cf.push(flow);
      if(m % 12 === 0) snapshot(m/12, m);
    }
    if(months % 12 !== 0) snapshot(P.horizon, months);

    /* the sale lands in the final month's cashflow for the IRR */
    if(hasProperty && cf.length > 1){
      var saleNet = value * (1 - P.sellPct/100);
      saleNet -= Math.max(0, saleNet - c.basis) * P.cgt/100;
      cf[cf.length-1] += saleNet;
    }

    var be = null;
    for(var i=1;i<series.length;i++){
      if(series[i].airbnb >= series[i].invest){ be = series[i].y; break; }
    }
    var last = series[series.length-1];
    var settled = stabYear || (lastMonth ? annualise(lastMonth, months) : null);

    return {
      mode: mode,
      costs: c,
      stake: c.stake,
      series: series,
      stabYear: stabYear,
      /* net of every running cost and tax, as a share of the money at stake */
      cashYield: settled && c.stake > 0 ? settled.net / c.stake * 100 : 0,
      runningLoss: !!settled && settled.net < 0,
      completionYear: buildMonths/12,
      horizonBeforeCompletion: mode === "build" && months <= buildMonths,
      totalGross: totalGross,
      totalNet: totalNet,
      nightsSold: nightsSold,
      cashflows: cf,
      breakEven: be,
      finalAirbnb: last.airbnb,
      finalInvest: last.invest,
      finalValue: last.value,
      finalPot: last.pot
    };
  }

  /* ===================== solvers ===================== */
  /* find the value of one knob at which the Airbnb and the market tie */
  solve(key, lo, hi){
    var self = this;
    function f(x){ var o={}; o[key]=x; var s=self.simulate(o); return s.finalAirbnb - s.finalInvest; }
    var a=f(lo), b=f(hi);
    if(isNaN(a)||isNaN(b)) return null;
    if((a>0&&b>0)||(a<0&&b<0)) return null;
    for(var i=0;i<60;i++){
      var mid=(lo+hi)/2, v=f(mid);
      if((v>0)===(a>0)){ lo=mid; a=v; } else { hi=mid; }
    }
    return (lo+hi)/2;
  }

  /* annualised internal rate of return on the Airbnb's own cashflows */
  irr(cashflows){
    var cf = cashflows || this.simulate().cashflows;
    function npv(annualPct){
      var r = Math.pow(1+annualPct/100, 1/12) - 1;
      var total = 0, d = 1;
      for(var i=0;i<cf.length;i++){
        total += cf[i] / d;
        d *= (1+r);
        if(!isFinite(total) || d === 0) return NaN;
      }
      return total;
    }
    var lo = -90, hi = 300;
    var a = npv(lo), b = npv(hi);
    if(!isFinite(a) || !isFinite(b)) return null;
    if((a>0&&b>0)||(a<0&&b<0)) return null;
    for(var i=0;i<80;i++){
      var mid=(lo+hi)/2, v=npv(mid);
      if(!isFinite(v)) return null;
      if((v>0)===(a>0)){ lo=mid; a=v; } else { hi=mid; }
    }
    return (lo+hi)/2;
  }
}

function annualise(mo, m){
  var y = { m:m };
  Object.keys(mo).forEach(function(k){ y[k] = mo[k] * 12; });
  return y;
}

return new AirbnbModel();
});
