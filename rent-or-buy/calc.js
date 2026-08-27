(function(root, factory){
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.Calc = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function(){
"use strict";

var DEFAULT_MODE = "live";
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

var STORAGE_KEY = "rentOrBuy.v1";
var PARAM_MAP = { price:"p", downPct:"dp", rate:"mr", term:"term", closingPct:"cc",
  taxPct:"tx", insurance:"ins", maintPct:"mp", hoa:"hoa", rent:"rent",
  income:"inc", vacancy:"vac", mgmt:"mgmt", appr:"appr", rentGrowth:"rg",
  invest:"inv", inflation:"infl", horizon:"h", sellPct:"sp",
  marginal:"tax", reliefCap:"rc", cgt:"cgt" };
var PARAM_MAP_REV = {};
Object.keys(PARAM_MAP).forEach(function(k){ PARAM_MAP_REV[PARAM_MAP[k]] = k; });

/* ===================== field definitions ===================== */
function money(k,label,note){ return {k:k,label:label,note:note,type:"money"}; }
function pct(k,label,min,max,step,note){ return {k:k,label:label,min:min,max:max,step:step,note:note,type:"pct"}; }
function num(k,label,min,max,step,note,unit){ return {k:k,label:label,min:min,max:max,step:step,note:note,unit:unit,type:"num"}; }

var FIELDS = {
  fPurchase:[
    money("price","Property price"),
    pct("downPct","Deposit",0,100,1,null),
    pct("rate","Mortgage rate",0,30,0.1,"Annual, on the balance. Nominal, as banks quote it — monthly compounding makes the effective rate higher."),
    num("term","Loan term",1,35,1,null," years"),
    pct("closingPct","Purchase costs",0,15,0.25,"Stamp duty, legal fees, valuation, bank charges. Paid up front and never recovered.")
  ],
  fOwn:[
    pct("taxPct","Land rates / property tax",0,4,0.05,"Per year, as a share of the property's value."),
    money("insurance","Insurance","Per year."),
    pct("maintPct","Repairs & upkeep",0,5,0.1,"Per year, as a share of value. 1% is the usual rule of thumb."),
    money("hoa","Service charge","Per month.")
  ],
  fRent:[
    money("rent","Rent you'd pay","Per month, for a comparable home.")
  ],
  fLet:[
    money("income","Rent you'd collect","Per month, when occupied."),
    pct("vacancy","Empty months",0,40,1,"Share of the year with no tenant."),
    pct("mgmt","Agent's cut",0,25,0.5,"Letting and management fees on rent collected.")
  ],
  fMarket:[
    pct("appr","Property appreciation",-5,20,0.25,"Effective annual."),
    pct("rentGrowth","Rent growth",-5,20,0.25,"Effective annual."),
    pct("invest","Return if invested instead",0,25,0.25,"Effective annual. What the deposit and any monthly savings would earn elsewhere. This is the single biggest lever."),
    pct("inflation","Inflation",0,20,0.25,"Effective annual. Pushes up insurance and service charge."),
    num("horizon","Years before you sell",1,40,1,"Short stays punish buyers — the purchase costs haven't been earned back yet."," years"),
    pct("sellPct","Selling costs",0,15,0.25,"Agent and legal fees when you sell.")
  ],
  fTax:[
    pct("marginal","Your income tax rate",0,60,1,"Applied to net rental profit."),
    money("reliefCap","Interest you can deduct","Per year, cap. Owner-occupier relief — set to 0 if you don't get it."),
    pct("cgt","Capital gains tax",0,40,0.5,"On the gain when you sell. Set to 0 if your home is exempt.")
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
  fPurchase:{ legend:"The purchase" },
  fOwn:     { legend:"Cost of owning it" },
  fRent:    { legend:"Renting instead", mode:"live" },
  fLet:     { legend:"Letting it out",  mode:"let" },
  fMarket:  { legend:"What the future does" },
  fTax:     { legend:"Tax" }
};

var MODE_META = {
  param:"m",
  label:"what the property is for",
  values:[
    { value:"live", label:"I'd live in it",
      note:"You would live in the home. Compared against paying `rent` for something similar." },
    { value:"let", label:"I'd rent it out",
      note:"You would rent it out. Compared against the same money in the market — your own housing cost is identical on both paths, so it drops out entirely." }
  ],
  note:"`tax` applies in both modes: under `let` it taxes net rental profit, under `live` it sets the value of owner-occupier interest relief, capped by `rc`."
};

/* Worked examples for the docs. Kept as data so the tests can round-trip them
   through loadFromURL/buildQueryString — that catches an out-of-range value
   that got clamped, a param set to its own default, or a typo'd short name. */
var EXAMPLES = [
  { label:"A 2-bed in Kilimani at KES 14.5M with a 25% deposit, against KES 75,000 rent, over a 7-year stay",
    params:{ p:14500000, dp:25, rent:75000, h:7 } },
  { label:"A studio in Ruaka bought to let: KES 5.2M, 40% deposit, KES 28,000 a month collected, held 15 years",
    params:{ p:5200000, dp:40, inc:28000, h:15, m:"let" } },
  { label:"The first scenario shown in US dollars — the money in the URL is still KES",
    params:{ p:14500000, dp:25, rent:75000, h:7, c:"USD" } }
];

function mrate(annualPct){ return Math.pow(1+annualPct/100, 1/12) - 1; }

class RentOrBuyCalculator {
  constructor(){
    this.mode = DEFAULT_MODE; // "live" | "let"
    this.cur = { code:"KES", sym:"KSh", rate:1 };
    this.suppressPersist = false;

    this.V = {
      price:12000000, downPct:20, rate:14.5, term:20, closingPct:5,
      taxPct:0.2, insurance:24000, maintPct:1, hoa:8000,
      rent:55000,
      income:70000, vacancy:8, mgmt:8,
      appr:8, rentGrowth:5, invest:10, inflation:6, horizon:10, sellPct:3,
      marginal:30, reliefCap:300000, cgt:15
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
      if(data.mode==="live"||data.mode==="let") this.mode = data.mode;
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
      if(key==="m"){ this.mode = (val==="let") ? "let" : "live"; return; }
      if(key==="c"){ this.applyCurrency(val); return; }
      var k = this.paramKey(key);
      if(k){ var num = parseFloat(val); if(isFinite(num)) this.V[k] = this.clampToField(k, num); }
    });
  }

  /* ===================== formatting ===================== */
  fmt(n){
    var x = n * this.cur.rate;
    return this.cur.sym + Math.round(x).toLocaleString("en-US");
  }
  fmtC(n){ // compact, for axes
    var x = n * this.cur.rate, s = x<0?"-":"", a = Math.abs(x);
    if(a>=1e9) return s+this.cur.sym+(a/1e9).toFixed(1).replace(/\.0$/,"")+"B";
    if(a>=1e6) return s+this.cur.sym+(a/1e6).toFixed(1).replace(/\.0$/,"")+"M";
    if(a>=1e3) return s+this.cur.sym+Math.round(a/1e3)+"k";
    return s+this.cur.sym+Math.round(a);
  }
  pctS(x){ return (Math.round(x*10)/10) + "%"; }

  /* ===================== the model ===================== */
  simulate(o){
    o = o || {};
    var V = this.V, mode = this.mode;
    var appr    = o.appr    !== undefined ? o.appr    : V.appr;
    var invest  = o.invest  !== undefined ? o.invest  : V.invest;
    var horizon = o.horizon !== undefined ? o.horizon : V.horizon;

    var price   = V.price;
    var down    = price * V.downPct/100;
    var closing = price * V.closingPct/100;
    var loan    = price - down;
    var r       = V.rate/100/12;
    var n       = Math.round(V.term*12);

    var pay = r > 0 ? loan * r / (1 - Math.pow(1+r, -n)) : (n>0 ? loan/n : 0);
    var loanInterest = r > 0 ? pay*n - loan : 0;

    var gAppr = mrate(appr), gInv = mrate(invest), gRent = mrate(V.rentGrowth), gInf = mrate(V.inflation);

    var home = price, bal = loan;
    var buyPot = 0, rentPot = down + closing;
    var months = Math.round(horizon*12);

    var series = [], yr1 = null;
    var accInterest = 0, accCosts = {int:0,pri:0,tax:0,ins:0,mnt:0,hoa:0,inc:0,itax:0,relief:0}, accRent = 0;

    function snapshot(y){
      var sale  = home * (1 - V.sellPct/100);
      var basis = price + closing;
      var gain  = Math.max(0, sale - basis);
      var net   = sale - bal - gain * V.cgt/100 + buyPot;
      series.push({ y:y, buy:net, rent:rentPot, equity:sale - bal, pot:buyPot });
    }
    snapshot(0);

    for(var m=1; m<=months; m++){
      var interest = bal * r;
      var principal = 0, payment = 0;
      if(bal > 0.5 && m <= n){
        payment = Math.min(pay, bal + interest);
        principal = payment - interest;
        bal = Math.max(0, bal - principal);
      } else { interest = 0; }

      var tax = home * V.taxPct/100/12;
      var ins = V.insurance/12 * Math.pow(1+gInf, m);
      var mnt = home * V.maintPct/100/12;
      var hoa = V.hoa * Math.pow(1+gInf, m);

      var grossIncome = 0, netIncome = 0, incomeTax = 0, relief = 0;
      if(mode === "let"){
        grossIncome = V.income * Math.pow(1+gRent, m);
        netIncome = grossIncome * (1 - V.vacancy/100) * (1 - V.mgmt/100);
        var profit = netIncome - interest - tax - ins - mnt - hoa;
        if(profit > 0) incomeTax = profit * V.marginal/100;
      } else {
        var cap = V.reliefCap/12;
        relief = Math.min(interest, cap) * V.marginal/100;
      }

      var buyOut  = payment + tax + ins + mnt + hoa + incomeTax - netIncome - relief;
      var rentNow = mode === "live" ? V.rent * Math.pow(1+gRent, m) : 0;
      var rentOut = rentNow;

      var diff = buyOut - rentOut;
      if(diff > 0) rentPot += diff; else buyPot += -diff;

      buyPot  *= (1+gInv);
      rentPot *= (1+gInv);
      home    *= (1+gAppr);

      if(m <= 12){
        accCosts.int += interest; accCosts.pri += principal; accCosts.tax += tax;
        accCosts.ins += ins; accCosts.mnt += mnt; accCosts.hoa += hoa;
        accCosts.inc += netIncome; accCosts.itax += incomeTax; accCosts.relief += relief;
        accRent += rentNow;
      }
      if(m % 12 === 0) snapshot(m/12);
    }
    if(months % 12 !== 0) snapshot(horizon);

    var d = Math.min(12, months||1);
    yr1 = {
      interest:accCosts.int/d, principal:accCosts.pri/d, tax:accCosts.tax/d,
      ins:accCosts.ins/d, mnt:accCosts.mnt/d, hoa:accCosts.hoa/d,
      income:accCosts.inc/d, itax:accCosts.itax/d, relief:accCosts.relief/d,
      rent:accRent/d
    };

    var be = null;
    for(var i=1;i<series.length;i++){
      if(series[i].buy >= series[i].rent){ be = series[i].y; break; }
    }
    var last = series[series.length-1];
    return { series:series, payment:pay, loanInterest:loanInterest, yr1:yr1,
             breakEven:be, finalBuy:last.buy, finalRent:last.rent,
             equity:last.equity, loan:loan, upfront:down+closing };
  }

  /* find the value of one knob at which buy == rent */
  solve(key, lo, hi){
    var self = this;
    function f(x){ var o={}; o[key]=x; var s=self.simulate(o); return s.finalBuy - s.finalRent; }
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

return new RentOrBuyCalculator();
});
