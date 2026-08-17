(function(root, factory){
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.Model = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function(){
"use strict";

var DEFAULT_MODE = "gross";
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

var STORAGE_KEY = "buildOrInvest.v1";
var PARAM_MAP = {
  capital:"cap", land:"land", units:"u", costPerUnit:"cpu", feesPct:"fee",
  contingencyPct:"cont", buildMonths:"bm", leaseMonths:"lm",
  rentUnit:"r", vacancy:"vac", mgmt:"mgmt", rentGrowth:"rg",
  ratesPct:"rt", insurance:"ins", repairsPct:"rep", commonCost:"cc",
  capRate:"cr", sellPct:"sp", horizon:"h",
  invest:"inv", investTax:"itx", investFee:"ife",
  flatPct:"flat", marginal:"mtx", cgt:"cgt", inflation:"infl"
};
var PARAM_MAP_REV = {};
Object.keys(PARAM_MAP).forEach(function(k){ PARAM_MAP_REV[PARAM_MAP[k]] = k; });

/* ===================== field definitions ===================== */
function money(k,label,note){ return {k:k,label:label,note:note,type:"money"}; }
function pct(k,label,min,max,step,note){ return {k:k,label:label,min:min,max:max,step:step,note:note,type:"pct"}; }
/* a slider that reads as a plain count, not a percentage */
function num(k,label,min,max,step,note,unit){ return {k:k,label:label,min:min,max:max,step:step,note:note,unit:unit,type:"num"}; }

var FIELDS = {
  fCapital:[
    money("capital","Money you have to deploy","The same lump sum goes into the building or into the market. That's the whole comparison.")
  ],
  fProject:[
    money("land","Land cost","Set to 0 if you already own the plot."),
    num("units","Number of units",1,200,1,null,null),
    money("costPerUnit","Build cost per unit","Shell, finishes and services, per unit."),
    pct("feesPct","Design, approvals & supervision",0,25,0.5,"Architect, engineer, county approvals, NEMA. A share of build cost."),
    pct("contingencyPct","Contingency",0,30,1,"Overruns are the norm, not the exception."),
    num("buildMonths","Months to build",1,60,1,"No rent arrives during these. This is the drag spreadsheets forget."," months"),
    num("leaseMonths","Months to fill it",0,36,1,"Occupancy ramps from empty to your long-run vacancy over this stretch."," months")
  ],
  fIncome:[
    money("rentUnit","Rent per unit","Per month, when occupied."),
    pct("vacancy","Long-run vacancy",0,40,1,"Share of the year a unit sits empty once the building has settled."),
    pct("mgmt","Agent's cut",0,25,0.5,"Letting and management fees on rent collected."),
    pct("rentGrowth","Rent growth",-5,20,0.25,"Per year. This also drives your exit value, so it works twice.")
  ],
  fOperating:[
    pct("ratesPct","Land rates",0,4,0.05,"Per year, as a share of the site value."),
    money("insurance","Insurance","Per year, for the whole building."),
    pct("repairsPct","Repairs & upkeep",0,5,0.1,"Per year, as a share of build cost. 1% is the usual rule of thumb."),
    money("commonCost","Common areas & security","Per month. Caretaker, water, lifts, grounds, lighting.")
  ],
  fExit:[
    pct("capRate","Exit yield",1,20,0.25,"What a buyer demands. The building is worth a year's net income divided by this — the single biggest lever on your exit."),
    pct("sellPct","Selling costs",0,15,0.25,"Agent and legal fees when you sell."),
    num("horizon","Years before you sell",1,40,1,null," years")
  ],
  fInvest:[
    pct("invest","Return if invested instead",0,25,0.25,"Annual, compounding. Whatever you'd actually earn leaving the money in the market."),
    pct("investTax","Tax on those returns",0,40,0.5,"Withholding tax. 15% on most Kenyan unit trusts."),
    pct("investFee","Annual management fee",0,5,0.1,"Charged on the balance, so it bites every year.")
  ],
  fGross:[
    pct("flatPct","Flat rate on gross rent",0,20,0.5,"Kenya's residential rental regime — a share of what you collect, before any costs.")
  ],
  fNet:[
    pct("marginal","Your income tax rate",0,60,1,"Applied to net rental profit after operating costs.")
  ],
  fTax:[
    pct("cgt","Capital gains tax",0,40,0.5,"On the gain over total project cost when you sell."),
    pct("inflation","Inflation",0,20,0.25,"Pushes up insurance, repairs and common-area costs.")
  ]
};
var FIELD_BY_KEY = {};
Object.keys(FIELDS).forEach(function(id){
  FIELDS[id].forEach(function(f){ FIELD_BY_KEY[f.k] = f; });
});

function mrate(annualPct){ return Math.pow(1+annualPct/100, 1/12) - 1; }

class BuildOrInvestModel {
  constructor(){
    this.mode = DEFAULT_MODE; // "gross" | "net" — which rental tax regime applies
    this.cur = { code:"KES", sym:"KSh", rate:1 };
    this.suppressPersist = false;

    this.V = {
      capital:40000000,
      land:8000000, units:12, costPerUnit:2200000, feesPct:8, contingencyPct:10,
      buildMonths:18, leaseMonths:6,
      rentUnit:35000, vacancy:8, mgmt:8, rentGrowth:5,
      ratesPct:0.2, insurance:180000, repairsPct:1, commonCost:60000,
      capRate:8, sellPct:3, horizon:10,
      invest:13, investTax:15, investFee:1,
      flatPct:7.5, marginal:30,
      cgt:15, inflation:6
    };
    this.DEFAULTS = {};
    Object.keys(this.V).forEach((k) => { this.DEFAULTS[k] = this.V[k]; });

    this.CURRENCIES = CURRENCIES;
    this.PARAM_MAP = PARAM_MAP;
    this.PARAM_MAP_REV = PARAM_MAP_REV;
    this.STORAGE_KEY = STORAGE_KEY;
    this.FIELDS = FIELDS;
    this.FIELD_BY_KEY = FIELD_BY_KEY;
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
      if(data.mode==="gross"||data.mode==="net") this.mode = data.mode;
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
      if(key==="m"){ this.mode = (val==="net") ? "net" : "gross"; return; }
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
  /* One net rate drives both the do-nothing path and the build path's cash pot,
     so the two sides are always the same instrument. */
  netInvestReturn(o){
    var V = this.V;
    var invest = (o && o.invest !== undefined) ? o.invest : V.invest;
    return invest * (1 - V.investTax/100) - V.investFee;
  }

  costs(o){
    var V = this.V;
    var costPerUnit = (o && o.costPerUnit !== undefined) ? o.costPerUnit : V.costPerUnit;
    var buildCost   = V.units * costPerUnit;
    var softCost    = buildCost * V.feesPct/100;
    var contingency = (buildCost + softCost) * V.contingencyPct/100;
    return {
      land: V.land,
      buildCost: buildCost,
      softCost: softCost,
      contingency: contingency,
      projectCost: V.land + buildCost + softCost + contingency
    };
  }

  simulate(o){
    o = o || {};
    var V = this.V;
    var mode     = o.mode     !== undefined ? o.mode     : this.mode;
    var capRate  = o.capRate  !== undefined ? o.capRate  : V.capRate;
    var rentUnit = o.rentUnit !== undefined ? o.rentUnit : V.rentUnit;
    var horizon  = o.horizon  !== undefined ? o.horizon  : V.horizon;

    var c = this.costs(o);
    var projectCost = c.projectCost, buildCost = c.buildCost;

    var gInv  = mrate(this.netInvestReturn(o));
    var gRent = mrate(V.rentGrowth);
    var gInf  = mrate(V.inflation);

    var months     = Math.round(horizon*12);
    var buildMonths= Math.round(V.buildMonths);
    var leaseMonths= Math.round(V.leaseMonths);
    var drawMonths = Math.min(buildMonths, months);
    var tranche    = buildMonths > 0 ? (projectCost - V.land) / buildMonths : 0;

    var pot  = V.capital - V.land;   // land is paid on day one
    var iPot = V.capital;            // the do-nothing path
    var sunk = V.land;

    /* Operating costs for month m, given a gross rent figure. */
    function opex(m){
      return {
        rates:  V.land * Math.pow(1+gInf, m) * V.ratesPct/100/12,
        ins:    V.insurance/12 * Math.pow(1+gInf, m),
        rep:    buildCost * V.repairsPct/100/12 * Math.pow(1+gInf, m),
        common: V.commonCost * Math.pow(1+gInf, m)
      };
    }
    function fullRent(m){ return V.units * rentUnit * Math.pow(1+gRent, m); }

    /* What a buyer would pay: stabilised income, ignoring the lease-up ramp. */
    function stabilisedNOI(m){
      var gross = fullRent(m) * (1 - V.vacancy/100);
      var e = opex(m);
      return (gross - gross*V.mgmt/100 - e.rates - e.ins - e.rep - e.common) * 12;
    }
    function valueAt(m, sunkSoFar){
      if(m <= buildMonths) return sunkSoFar;          // cost, no development margin yet
      if(capRate <= 0) return sunkSoFar;
      return stabilisedNOI(m) / (capRate/100);
    }

    var series = [], cf = [-V.land];
    var value = V.land;

    function snapshot(y, m){
      var sale  = value * (1 - V.sellPct/100);
      var gain  = Math.max(0, sale - projectCost);
      var net   = sale - gain * V.cgt/100 + pot;
      series.push({ y:y, build:net, invest:iPot, value:value, pot:pot, m:m });
    }
    snapshot(0, 0);

    var stabYear = null, totalRent = 0, totalTax = 0;
    for(var m=1; m<=months; m++){
      pot  *= (1+gInv);
      iPot *= (1+gInv);
      var flow = 0;

      if(m <= drawMonths){ pot -= tranche; sunk += tranche; flow -= tranche; }

      if(m > buildMonths){
        var ramp = leaseMonths > 0 ? Math.min(1, (m - buildMonths)/leaseMonths) : 1;
        var occ  = ramp * (1 - V.vacancy/100);
        var gross = fullRent(m) * occ;
        var agent = gross * V.mgmt/100;
        var e = opex(m);
        var noi = gross - agent - e.rates - e.ins - e.rep - e.common;
        var tax = mode === "gross" ? gross * V.flatPct/100 : Math.max(0, noi) * V.marginal/100;
        pot  += noi - tax;
        flow += noi - tax;
        totalRent += gross;
        totalTax  += tax;

        /* the first fully-stabilised month, kept for the operating breakdown */
        if(stabYear === null && ramp >= 1){
          stabYear = { gross:gross, agent:agent, rates:e.rates, ins:e.ins, rep:e.rep,
                       common:e.common, tax:tax, noi:noi, net:noi - tax, m:m };
        }
      }

      value = valueAt(m, sunk);
      cf.push(flow);
      if(m % 12 === 0) snapshot(m/12, m);
    }
    if(months % 12 !== 0) snapshot(horizon, months);

    /* the sale lands in the final month's cashflow for the IRR */
    var saleNet = value * (1 - V.sellPct/100);
    saleNet -= Math.max(0, saleNet - projectCost) * V.cgt/100;
    if(cf.length > 1) cf[cf.length-1] += saleNet;

    var completionM = buildMonths + 1;
    var stabNOI = stabilisedNOI(completionM);
    var valueAtCompletion = capRate > 0 ? stabNOI / (capRate/100) : 0;

    var be = null;
    for(var i=1;i<series.length;i++){
      if(series[i].build >= series[i].invest){ be = series[i].y; break; }
    }
    var last = series[series.length-1];

    return {
      series: series,
      land: c.land, buildCost: buildCost, softCost: c.softCost,
      contingency: c.contingency, projectCost: projectCost,
      shortfall: Math.max(0, projectCost - V.capital),
      stabNOI: stabNOI,
      yieldOnCost: projectCost > 0 ? stabNOI/projectCost*100 : 0,
      valueAtCompletion: valueAtCompletion,
      devMargin: valueAtCompletion - projectCost,
      completionYear: buildMonths/12,
      /* the horizon runs out before the block is finished — the exit is a part-built site */
      horizonBeforeCompletion: months <= buildMonths,
      stabYear: stabYear,
      totalRent: totalRent,
      totalTax: totalTax,
      cashflows: cf,
      breakEven: be,
      finalBuild: last.build,
      finalInvest: last.invest,
      finalValue: last.value,
      finalPot: last.pot
    };
  }

  /* ===================== solvers ===================== */
  /* find the value of one knob at which building and investing tie */
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

  /* annualised internal rate of return on the project's own cashflows */
  irr(cashflows){
    var cf = cashflows || this.simulate().cashflows;
    /* Discounting is done on the annual rate, so even the -90% floor leaves a monthly
       factor of ~0.825 — a 40-year run stays comfortably finite. The guard is belt and
       braces against a caller passing pathological cashflows. */
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

return new BuildOrInvestModel();
});
