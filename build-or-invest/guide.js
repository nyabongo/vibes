/* The editorial half of the walkthrough at /build-or-invest/ — the page this
 * calculator opens on.
 *
 * Same shape as rent-or-buy/guide.js: shared/wizard.js holds the machinery,
 * this holds the words. Every input model.js has gets a plain-language
 * question, what it is, why it moves the answer, and what it typically runs to
 * in a developed and in a developing market. Ranges and defaults are never
 * repeated here — they come from the engine, and validateGuide() fails loudly
 * if the two fall out of step.
 */
(function(root, factory){
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.BuildOrInvestGuide = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function(){
"use strict";

/* Rent as a yield on what a unit costs to build is the one rent rule of thumb
   that survives a change of country, so the rent question offers it rather
   than a figure that would only be right in Nairobi. */
function yieldOnBuild(pctPerYear){
  return function(V){ return V.costPerUnit * pctPerYear / 100 / 12; };
}
function shareOfBuild(share){
  return function(V){ return V.units * V.costPerUnit * share; };
}

var GUIDE = {
  title: "Build or invest",

  intro: {
    question: "Should your money build a rental block, or just sit in the market?",
    what: "A building looks like the obvious answer because you can stand in front of it. But it spends " +
      "years earning nothing while it goes up, and the same money in a boring index fund is compounding " +
      "the whole time. This walks you through the numbers that decide it.",
    how: [
      "<b>One question per screen.</b> Each one says what it is and why it matters before it asks you for anything.",
      "<b>Skip anything you don't know.</b> Every question already has a sensible number in it, and skipping keeps that number — the answer screen shows which ones you left alone.",
      "<b>The construction drag is the point.</b> Most spreadsheets compare a finished building against cash. This one makes you pay for the years it is a hole in the ground.",
      "<b>Nothing leaves your browser.</b> No account, no server — your answers live in the address bar, so you can bookmark or share the link."
    ]
  },

  aiIntro: [
    "I'm deciding whether to put money into building a small rental block or leave it invested.",
    "Help me fill in this guided calculator:"
  ],

  modeLabel: "How rental income is taxed",

  disclaimer:
    "<b>How this works.</b> The same lump sum goes into the building or into the market. The build side " +
    "pays for land, construction, fees and contingency, earns nothing while it goes up, fills gradually, " +
    "then earns rent net of costs and tax. At the end it is sold at a price set by the exit yield, less " +
    "selling costs and capital gains tax. The market side compounds at your return, net of tax and fees." +
    "<br><br><b>Not modelled:</b> construction finance — any shortfall between what you have and what the " +
    "project costs is charged at the same rate your investments earn, which is generous. Nor are " +
    "planning refusals, contractor failure, phased sales of individual units, or depreciation allowances." +
    "<br><br><b>This is a model, not advice.</b> Development risk is real and this arithmetic does not " +
    "capture it.",

  steps: [
    { id: "capital",  section: "What you're putting in", keys: ["capital"] },
    { id: "land",     section: "The site",  keys: ["land"] },
    { id: "units",    section: "The build", keys: ["units"] },
    { id: "cost",     section: "The build", keys: ["costPerUnit"] },
    { id: "softcost", section: "The build", keys: ["feesPct", "contingencyPct"],
      title: "What goes on top of the bricks?",
      blurb: "Two percentages that sit on top of the construction cost. Neither is optional in practice, " +
        "and leaving them out is the most common reason a development budget is wrong." },
    { id: "timing",   section: "The build", keys: ["buildMonths", "leaseMonths"],
      title: "How long until it's earning?",
      blurb: "The months the money is in the ground and the months the block spends filling up. This is " +
        "the drag that makes building lose to a boring index fund more often than people expect." },

    { id: "rent",     section: "What it earns", keys: ["rentUnit"] },
    { id: "leakage",  section: "What it earns", keys: ["vacancy", "mgmt"],
      title: "How much of that rent actually reaches you?",
      blurb: "Nobody collects twelve months of rent from twelve months of the year, and the agent takes " +
        "a cut of what does arrive." },
    { id: "rentgrow", section: "What it earns", keys: ["rentGrowth"] },

    { id: "running",  section: "Cost of running it", keys: ["ratesPct", "insurance", "repairsPct", "commonCost"],
      title: "What does the block cost to run?",
      blurb: "The bills that arrive every year whether or not the units are full. All four have sensible " +
        "defaults, so skip the screen if you would only be guessing." },

    { id: "capRate",  section: "Getting out", keys: ["capRate"] },
    { id: "horizon",  section: "Getting out", keys: ["horizon"] },
    { id: "sell",     section: "Getting out", keys: ["sellPct"] },

    { id: "invest",   section: "The alternative", keys: ["invest"] },
    { id: "drag",     section: "The alternative", keys: ["investTax", "investFee"],
      title: "What comes off that return before you see it?",
      blurb: "The market side has to be charged its own costs, or the comparison is rigged. Tax on the " +
        "returns, and the fee the fund takes for holding your money." },

    {
      id: "regime", kind: "mode", section: "Tax",
      question: "How is rental income taxed where you are?",
      what: "Two systems are common. Some countries take a flat percentage of everything you collect, " +
        "before any costs come off. Others tax the profit left after your running costs, at your own " +
        "income tax rate. Pick whichever describes your rules; if you have no idea, keep the first.",
      why: "On a block with heavy running costs the two produce very different answers. A flat rate on " +
        "gross rent is simple but unforgiving — you pay it in a year where the roof needed replacing and " +
        "you actually made nothing.",
      options: [
        { value: "gross", label: "A flat rate on the rent collected",
          blurb: "A share of everything that comes in, before costs. Kenya's residential rental regime works this way." },
        { value: "net", label: "My income tax rate, on the profit",
          blurb: "Running costs come off first, and what is left is taxed as income. The UK, US and most of Europe work this way." }
      ]
    },
    { id: "flat",  section: "Tax", keys: ["flatPct"] },
    { id: "mtx",   section: "Tax", keys: ["marginal"] },
    { id: "endtax", section: "Tax", keys: ["cgt", "inflation"],
      title: "Two last numbers",
      blurb: "The tax on the profit when you sell, and general inflation, which pushes up every running " +
        "cost over the years you hold the block." }
  ],

  fields: {

    capital: {
      q: "How much money are you putting in?",
      what: "The lump sum you have available. The exact same amount goes into the building or into the " +
        "market — that is the whole comparison.",
      why: "Oddly, this barely moves the verdict: it enters both paths identically, so it cancels out of " +
        "the gap between them. What it decides is whether you can fund the project at all. If it falls " +
        "short of what the build costs, the answer screen says so, and treats the gap generously.",
      typical: {
        note: "Set it to what you actually have, not to what the project needs. Seeing the shortfall is " +
          "more useful than hiding it.",
        developed: "A small residential development is rarely equity-funded in full — developers typically " +
          "put in 25–40% and borrow the rest through a construction facility at several points above base " +
          "rate.",
        developing: "Construction lending is scarce and expensive, so far more projects are built out of " +
          "cash, in stages, over years. That is exactly the drag this calculator is built to price."
      }
    },

    land: {
      q: "What does the plot cost?",
      what: "The price of the site, including nothing else — fees and construction come later. Put 0 if " +
        "you already own it.",
      why: "Land is dead money in this model: it earns nothing until there is a building on it, and its " +
        "cost sits in the project total that the sale price at the end has to beat.",
      typical: {
        note: "If you already own the plot, entering 0 answers a narrower question — whether building on " +
          "land you have beats selling that land and investing the proceeds is a different sum.",
        developed: "Land is often 30–50% of total project cost in desirable areas, and higher still in " +
          "supply-constrained cities, where the plot can cost more than the building on it.",
        developing: "Usually a smaller share — 15–30% is common — because construction is expensive " +
          "relative to land outside the very best addresses. Serviced plots near a growing city are the " +
          "exception and can appreciate fast on their own."
      }
    },

    units: {
      q: "How many units would you build?",
      what: "The number of lettable apartments or houses on the site.",
      why: "It scales both the cost and the income, so it moves the size of the project more than its " +
        "quality. Where it does change the answer is through the fixed costs: common areas, security and " +
        "insurance spread over more units, which is why bigger blocks tend to run at a lower cost per unit.",
      presets: [
        { label: "Small 4", value: 4 },
        { label: "Typical 12", value: 12 },
        { label: "Larger 40", value: 40 }
      ],
      typical: {
        developed: "Individual landlords build 2–10 units; anything above about 30 is a professional " +
          "development with professional financing, and planning rules often decide the number for you.",
        developing: "Owner-developers commonly build 6–24 units on a single urban plot, often in phases " +
          "as money allows. Small blocks of studios and one-beds are the standard mid-market product in " +
          "cities like Nairobi and Kampala."
      }
    },

    costPerUnit: {
      q: "What does one unit cost to build?",
      what: "Shell, finishes and services for a single apartment — the construction cost only. Fees and " +
        "contingency go on top, on the next screen.",
      why: "Multiplied by the number of units, this is the biggest line in the budget. It also decides " +
        "whether the finished block is worth more than it cost: if construction is expensive relative to " +
        "the rent it can command, there is no development margin and no reason to build.",
      typical: {
        note: "Quantity surveyors quote per square metre; multiply by the size of the unit you have in " +
          "mind. A one-bedroom apartment is typically 45–60 m², a two-bed 70–95 m².",
        developed: "Roughly US$1,500–3,500 per square metre for mid-market apartments, so a two-bedroom " +
          "flat lands somewhere between US$150,000 and US$350,000 before land — and labour is most of it.",
        developing: "Roughly US$250–700 per square metre, so the same flat is more like US$20,000–60,000. " +
          "Labour is cheap and materials are imported, which flips the cost structure and makes " +
          "construction inflation track the exchange rate."
      }
    },

    feesPct: {
      q: "What do the professionals and the approvals cost?",
      what: "Architect, engineer, quantity surveyor, planning and environmental approvals and site " +
        "supervision, as a share of construction cost.",
      why: "It is a real and fairly predictable slice of the budget that first-time developers leave out " +
        "entirely. Supervision in particular is the thing that stops the wastage on the next screen from " +
        "getting much worse.",
      presets: [
        { label: "Lean 5%", value: 5 },
        { label: "Typical 8%", value: 8 },
        { label: "Full service 14%", value: 14 }
      ],
      typical: {
        developed: "10–15% of construction cost once architect, structural and services engineers, " +
          "planning consultants and building control are counted. Fees are high because the process is " +
          "long and the liability is real.",
        developing: "5–10% is common. Kenya's approvals go through the county plus NEMA, the environmental " +
          "regulator; the professional fees are lower but the timeline is not, and paying for proper " +
          "supervision is usually the best money in the budget."
      }
    },

    contingencyPct: {
      q: "How much spare money for things going wrong?",
      what: "A reserve on top of construction and fees, for the overruns that are normal rather than " +
        "exceptional.",
      why: "Overruns are the default outcome in construction, not the unlucky one. A project with no " +
        "contingency is not a cheaper project — it is the same project with the risk hidden. Setting it " +
        "to 0 here makes the build side look better than any real build will be.",
      presets: [
        { label: "Tight 5%", value: 5 },
        { label: "Standard 10%", value: 10 },
        { label: "Cautious 20%", value: 20 }
      ],
      typical: {
        developed: "5–10% on a well-documented project with a fixed-price contract, and more where the " +
          "ground conditions or the existing structure are unknown.",
        developing: "10–20% is realistic. Currency moves on imported materials, delayed approvals and " +
          "self-managed labour all widen the range, and the cost of a stalled site is paid in months as " +
          "well as money."
      }
    },

    buildMonths: {
      q: "How long does it take to build?",
      what: "Months from breaking ground to the first tenant being able to move in. No rent arrives " +
        "during any of them.",
      why: "This is the drag that decides more of these comparisons than anything else. Every month the " +
        "site is unfinished, the whole project is earning nothing while the alternative is compounding. " +
        "Two extra years of construction can cost more than a percentage point of exit yield.",
      presets: [
        { label: "Fast 12", value: 12 },
        { label: "Typical 18", value: 18 },
        { label: "Slow 36", value: 36 }
      ],
      typical: {
        developed: "12–24 months for a small block once you are on site, but the planning and approvals " +
          "before that can add a year or more — and this question is only counting the construction.",
        developing: "18–36 months is common for owner-managed builds, and longer where the work is funded " +
          "out of cash flow rather than a facility. Rain seasons, material shortages and payment delays " +
          "all stretch it."
      }
    },

    leaseMonths: {
      q: "How long to fill it once it's finished?",
      what: "Months from completion to the block being fully let. No building fills the week it opens.",
      why: "It is a second, smaller drag right after the first, and it lands at the worst moment — the " +
        "project has spent all the money and is still earning almost nothing. The model ramps the income " +
        "up gradually over these months rather than switching it on.",
      presets: [
        { label: "Quick 3", value: 3 },
        { label: "Typical 6", value: 6 },
        { label: "Slow 15", value: 15 }
      ],
      typical: {
        developed: "3–6 months for well-priced mid-market stock in a city with a housing shortage. " +
          "Pre-letting off-plan is common and shortens it further.",
        developing: "6–12 months is realistic, and longer if a lot of similar supply arrives at the same " +
          "time — which is exactly what tends to happen when everyone spots the same opportunity."
      }
    },

    rentUnit: {
      q: "What rent would one unit earn?",
      what: "Per month, per unit, when occupied. Gross — before the agent, the empty months and tax.",
      why: "It is the whole income side of the building. It also sets the sale price at the end, because " +
        "a buyer values the block off the rent it produces — so rent works twice here, once as income and " +
        "again as capital value.",
      presets: [
        { label: "5%/yr on build cost", value: yieldOnBuild(5) },
        { label: "9%/yr on build cost", value: yieldOnBuild(9) },
        { label: "14%/yr on build cost", value: yieldOnBuild(14) }
      ],
      typical: {
        note: "The chips set the rent from what you said a unit costs to build, as an annual yield on " +
          "construction cost. Anything below the exit yield you set later means the block is worth less " +
          "than it cost to put up.",
        developed: "Rent works out to roughly 4–7% a year on construction cost, which sounds thin but " +
          "sits against low borrowing rates and slow, steady appreciation.",
        developing: "8–15% a year on construction cost is normal in cities with a real housing shortage. " +
          "The high yield is what makes building attractive there — and it has to be, because the money " +
          "could otherwise sit in government paper at low double digits."
      }
    },

    vacancy: {
      q: "How much of the year does an average unit sit empty?",
      what: "The share of the year with no rent, once the block has settled down — the gaps between " +
        "tenants, not the lease-up period you already answered for.",
      why: "It scales the income directly and forever. It is also where optimism does the most damage: " +
        "a block modelled at 3% vacancy and running at 15% loses more than a percentage point of exit " +
        "yield would cost it.",
      presets: [
        { label: "Very tight 3%", value: 3 },
        { label: "One month 8%", value: 8 },
        { label: "Slow 15%", value: 15 }
      ],
      typical: {
        developed: "3–8% in supply-constrained cities, with long tenancies and professional management " +
          "keeping the gaps short.",
        developing: "8–20%, higher for units priced above what local tenants can comfortably pay. " +
          "Mid-market Nairobi apartments have run well into double digits when a lot of new supply lands " +
          "at once."
      }
    },

    mgmt: {
      q: "What does the letting agent take?",
      what: "A share of the rent collected, every month, for finding tenants and managing them. Set it to " +
        "0 only if you would genuinely do the job yourself.",
      why: "On a block of a dozen units, managing it yourself is a part-time job — collecting rent, " +
        "chasing arrears, arranging repairs. Putting 0 here without meaning it is how a model pays you a " +
        "salary you never receive.",
      presets: [
        { label: "Self-managed 0%", value: 0 },
        { label: "Typical 8%", value: 8 },
        { label: "Full service 12%", value: 12 }
      ],
      typical: {
        developed: "8–12% of rent in the US, 10–15% for full management in the UK. Larger blocks " +
          "negotiate lower rates.",
        developing: "5–10%, with 8% standard in Kenya and much of East Africa. The service is thinner, " +
          "and chasing late rent may still end up with you."
      }
    },

    rentGrowth: {
      q: "How fast do rents rise?",
      what: "Annual growth in the rent each unit earns.",
      why: "This one works twice, which makes it a bigger lever than it looks. It grows the income every " +
        "year, and because the block is sold at a price set by its income, it also grows what the " +
        "building is worth at the end.",
      presets: [
        { label: "Slow 2%", value: 2 },
        { label: "Steady 5%", value: 5 },
        { label: "Fast 9%", value: 9 }
      ],
      typical: {
        developed: "2–4% a year, roughly tracking inflation and wages. Several cities cap increases on " +
          "sitting tenants, which slows it further.",
        developing: "5–10% nominal, in line with higher inflation. Growing cities can see sharper jumps " +
          "when demand arrives faster than buildings do."
      }
    },

    ratesPct: {
      q: "What does the council charge on the site each year?",
      what: "Land rates or property tax — the local authority's annual charge, as a share of the site's " +
        "value.",
      why: "Small each year, permanent, and it comes off the income before tax. On a long hold it " +
        "quietly removes a chunk of the return.",
      presets: [
        { label: "Minimal 0.1%", value: 0.1 },
        { label: "Modest 0.5%", value: 0.5 },
        { label: "US-style 1.5%", value: 1.5 }
      ],
      typical: {
        developed: "0.3–2.2% of value a year across US states; the UK charges business rates or council " +
          "tax on a banded basis instead, which for residential works out under 1%.",
        developing: "0.05–0.5%, usually on unimproved land value and often under-collected. Kenyan land " +
          "rates are typically a fraction of a percent of the site value."
      }
    },

    insurance: {
      q: "What does insuring the building cost a year?",
      what: "One policy for the whole block, per year.",
      why: "A modest line, included so the building side is not flattered by leaving out a bill that " +
        "genuinely arrives every year. It rises with inflation over the hold.",
      presets: [
        { label: "0.2% of build cost", value: shareOfBuild(0.002) },
        { label: "0.4% of build cost", value: shareOfBuild(0.004) }
      ],
      typical: {
        developed: "Roughly 0.2–0.5% of rebuild cost a year for a residential block, far more in flood " +
          "or wildfire zones.",
        developing: "0.2–0.6%, though many owner-developers carry only the minimum a lender demands. If " +
          "you would genuinely go without, put 0 — and know that you have priced away a real risk."
      }
    },

    repairsPct: {
      q: "What do repairs and upkeep cost each year?",
      what: "As a share of what the building cost to construct, per year. The old rule of thumb is 1%.",
      why: "A dozen tenants generate a steady stream of small failures — taps, locks, drains, paint. It " +
        "is a permanent drag on the income and one of the first things a first-time landlord " +
        "underestimates.",
      presets: [
        { label: "New build 0.5%", value: 0.5 },
        { label: "Rule of thumb 1%", value: 1 },
        { label: "Hard-worn 2%", value: 2 }
      ],
      typical: {
        developed: "1% of construction cost a year is the standard planning figure, more for older " +
          "buildings. Labour dominates the bill.",
        developing: "1–2%, with the cost balance reversed: labour is cheap, imported fittings are not, " +
          "and variable build quality can mean early work on a new block."
      }
    },

    commonCost: {
      q: "What do the common areas cost each month?",
      what: "Caretaker, security, water, lifts, grounds and lighting for the whole block, per month.",
      why: "It is a fixed cost that does not fall when units are empty, which is what makes vacancy hurt " +
        "twice. In markets where a block has to provide its own security, water storage and power backup, " +
        "it is a large number rather than a rounding error.",
      typical: {
        note: "Ask an existing block of similar size what it actually spends. This is one of the few " +
          "costs somebody can tell you exactly.",
        developed: "Building services are usually recharged to tenants through a service charge, so the " +
          "landlord's own net cost is modest. Lifts and communal heating are the expensive exceptions.",
        developing: "Often substantial, because the block supplies what the city does not: private " +
          "security around the clock, water storage and pumping, and a generator. Nairobi blocks commonly " +
          "spend tens of thousands of shillings a month on this."
      }
    },

    capRate: {
      q: "What yield would a buyer want when you sell?",
      what: "The exit yield, or cap rate — what a buyer expects to earn each year for every unit of " +
        "currency they pay. The block's sale price is its annual net income divided by this.",
      why: "This is the biggest single lever in the model, and the least intuitive. A low exit yield " +
        "means buyers accept a small annual return, so they pay a lot for your income — a block earning " +
        "the same rent is worth roughly twice as much at 5% as at 10%. It is set by the market, not by " +
        "you, and it can move against you over a long hold.",
      presets: [
        { label: "Prime 5%", value: 5 },
        { label: "Typical 8%", value: 8 },
        { label: "Risky 12%", value: 12 }
      ],
      typical: {
        developed: "3.5–6% for residential blocks in large cities — lower where interest rates are low " +
          "and the tenant demand is considered safe. Prime London and prime German residential have " +
          "traded well under 4%.",
        developing: "7–12%. Buyers demand a much bigger annual return to compensate for currency risk, " +
          "thinner buyer pools and slower sales — which means the same income buys you a far smaller " +
          "price at the exit."
      }
    },

    horizon: {
      q: "How long would you hold the block before selling?",
      what: "The years to compare both paths over. Everything is measured on the day you sell, with the " +
        "building sold and the investments cashed in and taxed.",
      why: "Building needs time. The first years are all cost and no income, so a short horizon is " +
        "almost guaranteed to lose — and if the horizon ends before the block is finished, the model " +
        "sells a part-built site, which is the most generous thing you can assume about one.",
      presets: [
        { label: "Short 5", value: 5 },
        { label: "Medium 10", value: 10 },
        { label: "Long 25", value: 25 }
      ],
      typical: {
        developed: "Institutional holders think in 7–15 year cycles; a developer who builds to sell is " +
          "out in 2–4 years, which is a different business from the one this models.",
        developing: "Family-held rental property is often kept for decades and passed on. That long " +
          "horizon is what makes the construction drag survivable."
      }
    },

    sellPct: {
      q: "What does selling the block cost?",
      what: "Agent and legal fees on the sale, as a share of the price.",
      why: "It comes off the largest single number in the model, on the last day, so a couple of " +
        "percentage points is real money. Selling a whole block also takes time this model does not " +
        "charge you for.",
      presets: [
        { label: "Low 1.5%", value: 1.5 },
        { label: "Typical 3%", value: 3 },
        { label: "Heavy 6%", value: 6 }
      ],
      typical: {
        developed: "1–3% on institutional sales, higher on smaller lots. The US residential convention " +
          "of 5–6% does not usually apply to whole blocks.",
        developing: "3–6% in commission plus legal costs, and finding a buyer for an entire block can " +
          "take a year or more."
      }
    },

    invest: {
      q: "What would the money earn if you invested it instead?",
      what: "The annual return, compounding, on the same lump sum left in the market. Before the tax and " +
        "fees on the next screen.",
      why: "This is the bar the building has to clear, and it is the second biggest lever here. Somewhere " +
        "between a boring return and a good one, the building stops being worth the years of work and the " +
        "risk of a contractor walking off site.",
      presets: [
        { label: "Bonds 4%", value: 4 },
        { label: "Global equities 7%", value: 7 },
        { label: "Local T-bills 13%", value: 13 }
      ],
      typical: {
        note: "Read it against the inflation figure you set at the end. A 13% return where inflation is " +
          "9% is a worse deal than 7% where inflation is 2%.",
        developed: "6–8% a year nominal for a broad global equity index over the long run, 4–5% for " +
          "government bonds. That is a real return of roughly 4–5% on equities after 2–3% inflation.",
        developing: "Local government paper has offered 10–16% in Kenya and Uganda and 18%+ in Nigeria — " +
          "figures that flatter, because inflation and currency depreciation take much of it back. This " +
          "is precisely why building has to work hard to win there: the safe alternative pays well."
      }
    },

    investTax: {
      q: "What tax comes off those investment returns?",
      what: "Withholding or income tax the fund takes before paying you.",
      why: "Charging the building's income tax while leaving the market's untaxed would rig the " +
        "comparison. This is the market side paying its own dues.",
      presets: [
        { label: "Sheltered 0%", value: 0 },
        { label: "Withholding 15%", value: 15 },
        { label: "Full rate 30%", value: 30 }
      ],
      typical: {
        developed: "0% inside a pension, ISA or 401(k), which is where most long-term money sits. Outside " +
          "one, dividends and interest are taxed at 15–40% depending on the country and your income.",
        developing: "10–20% withheld at source is the norm — 15% on most Kenyan and Ugandan unit trusts " +
          "and on interest. It is taken before you see the money, so it is easy to forget it happened."
      }
    },

    investFee: {
      q: "What does the fund charge you a year?",
      what: "The annual management fee, charged on the balance rather than on the gains.",
      why: "Because it is charged on the whole balance every year, a fee compounds against you the same " +
        "way returns compound for you. One and a half points a year over twenty-five years is roughly a " +
        "third of the final pot.",
      presets: [
        { label: "Index fund 0.2%", value: 0.2 },
        { label: "Typical 1%", value: 1 },
        { label: "Active local 2.5%", value: 2.5 }
      ],
      typical: {
        developed: "0.05–0.3% for a broad index tracker, 0.5–1.5% for an actively managed fund. Fee " +
          "competition has driven the floor close to zero.",
        developing: "1–3% for local unit trusts and managed funds, sometimes with an entry fee on top. " +
          "The cheap index option often is not available locally at all."
      }
    },

    flatPct: {
      q: "What flat rate is charged on the rent you collect?",
      what: "A percentage of everything collected, before any costs come off. Simple to compute and " +
        "unforgiving in a bad year.",
      why: "Because it ignores your costs, it lands hardest exactly when the block is doing badly — a " +
        "year of heavy repairs is still a year of full tax. On a high-cost building it can take more of " +
        "the profit than a higher-looking rate on net income would.",
      presets: [
        { label: "Kenya 7.5%", value: 7.5 },
        { label: "Moderate 10%", value: 10 },
        { label: "Heavy 15%", value: 15 }
      ],
      typical: {
        note: "Only applies under the flat-rate regime you picked a screen ago. Under the profit regime " +
          "this number is ignored entirely.",
        developed: "Rare as the main system, but flat withholding on rent paid to non-resident landlords " +
          "is common — 20% or more in several European countries.",
        developing: "Kenya's residential rental income tax is a flat rate on gross rent below a turnover " +
          "threshold, currently 7.5%. Simplified turnover-style regimes like it are increasingly common " +
          "across the region because they are easier to collect."
      }
    },

    marginal: {
      q: "What's your income tax rate on the top slice of your income?",
      what: "Your marginal rate, applied to the rental profit left after running costs — the profit, not " +
        "the takings.",
      why: "It taxes what the block actually made, which is fairer in a bad year but bites harder in a " +
        "good one. Whether it beats a flat rate on gross rent depends entirely on how expensive the " +
        "building is to run.",
      presets: [
        { label: "Basic 20%", value: 20 },
        { label: "Common top 30%", value: 30 },
        { label: "High 45%", value: 45 }
      ],
      typical: {
        note: "Only applies under the profit regime you picked a screen ago. Under the flat-rate regime " +
          "this number is ignored entirely.",
        developed: "Top marginal rates of 20–45% on income, reached at very different income levels. " +
          "Several countries restrict how much mortgage interest a landlord may deduct before this rate " +
          "is applied.",
        developing: "Top rates of 25–35%: Kenya 30–35%, Uganda 30–40%, India 30% plus surcharges."
      }
    },

    cgt: {
      q: "What tax would you pay on the profit when you sell?",
      what: "Capital gains tax, charged on the sale price above the total project cost — not on the whole " +
        "price.",
      why: "On a long hold with a low exit yield, the sale is the largest number in the model, so the " +
        "rate applied to it matters. Unlike a home, a rental block rarely gets an exemption.",
      presets: [
        { label: "None 0%", value: 0 },
        { label: "Moderate 15%", value: 15 },
        { label: "High 28%", value: 28 }
      ],
      typical: {
        developed: "18–28% on investment property in the UK, up to 20% federally plus state tax and a " +
          "depreciation recapture charge in the US. Rollover reliefs for reinvesting exist in several " +
          "systems and are not modelled here.",
        developing: "Kenya charges 15% on property gains, Nigeria 10%, Uganda 30%. Exemptions generally " +
          "cover a home you live in, not a block you let out."
      }
    },

    inflation: {
      q: "What's general inflation running at?",
      what: "The annual rise in prices. Here it pushes up insurance, repairs and the common-area costs " +
        "year after year.",
      why: "It is a modest lever inside the model but changes how you should read the result. Every " +
        "figure on the answer screen is in future money, so a large gap after twenty-five years of 10% " +
        "inflation is worth far less than the same gap after twenty-five years of 2%.",
      presets: [
        { label: "Low 2%", value: 2 },
        { label: "Moderate 6%", value: 6 },
        { label: "High 12%", value: 12 }
      ],
      typical: {
        developed: "2–3% is the target most central banks aim at and roughly what they deliver outside a " +
          "shock.",
        developing: "5–15% is ordinary — Kenya around 5–8%, Nigeria above 20%. Construction inputs often " +
          "inflate faster than the headline rate because so many of them are imported."
      }
    }
  },

  /* ===================== the answer screen ===================== */
  outcome: function(engine, s){
    var gap = s.finalBuild - s.finalInvest;
    var building = gap >= 0;
    var amt = engine.fmt(Math.abs(gap));
    var yrs = engine.V.horizon + (engine.V.horizon === 1 ? " year" : " years");
    var irr = engine.irr(s.cashflows);
    var netInv = engine.netInvestReturn();
    var margin = s.devMargin;

    var headline = (building ? '<span class="b">Build</span>' : '<span class="r">Invest</span>') +
      ", by " + amt + " over " + yrs + ".";

    var sub = building
      ? "The block leaves you <b>" + amt + "</b> ahead of the same money left in the market, after " +
        "selling costs and tax. " +
        (s.breakEven ? "You cross over in <b>year " + s.breakEven + "</b> — sell before that and " +
          "building loses." : "The lines don't actually cross within your horizon.")
      : "The same lump sum left invested beats the block by <b>" + amt + "</b>. " +
        (margin < 0
          ? "At this exit yield the finished building is worth less than it costs to put up, so the rent " +
            "never makes that back."
          : "The rent it earns doesn't cover the years it spends earning nothing.");

    var short = '<b class="' + (building ? "b" : "r") + '">' +
      (building ? "Building" : "The market") + "</b> is ahead by <b>" + amt + "</b> after " + yrs + ".";

    var warns = [];
    if(s.shortfall > 0){
      warns.push("<b>This project costs " + engine.fmt(s.shortfall) + " more than you said you have.</b> " +
        "There is no construction loan in this model, so the gap is charged at the same rate your " +
        "investments earn. Real finance costs more — treat the build side as optimistic until you have " +
        "closed that gap.");
    }
    if(s.horizonBeforeCompletion){
      warns.push("<b>Your horizon ends before the block is finished.</b> It is sold as a part-built " +
        "site, valued at what you have sunk into it, which is the most generous thing anyone can assume " +
        "about an unfinished building.");
    }

    return {
      headline: headline, sub: sub, short: short,
      warn: warns.length ? warns.join("<br><br>") : null,
      labelA: "Build the block",
      labelB: "Leave it in the market",
      series: s.series.map(function(p){ return { y: p.y, a: p.build, b: p.invest }; }),
      breakEven: s.breakEven,
      tiles: [
        { k: "Total project cost", v: engine.fmt(s.projectCost),
          s: "Land, build, fees and contingency" },
        { k: "Yield on cost", v: engine.pctS(s.yieldOnCost),
          s: "Buyers want " + engine.pctS(engine.V.capRate) + " — " +
            (margin >= 0 ? "worth " + engine.fmt(margin) + " more than it cost"
                         : "worth " + engine.fmt(-margin) + " less than it cost") },
        { k: "Project return", v: irr === null ? "—" : engine.pctS(irr),
          s: irr === null ? "No rate fits these cashflows"
                          : "What the project earns a year, all in. Market pays " +
                            engine.pctS(netInv) + " net" },
        { k: "Gap at year " + engine.V.horizon, v: (gap >= 0 ? "+" : "−") + amt,
          s: gap >= 0 ? "in favour of building" : "in favour of investing" }
      ]
    };
  }
};

return GUIDE;
});
