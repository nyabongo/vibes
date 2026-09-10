/* The editorial half of the walkthrough at /airbnb-or-invest/ — the page this
 * calculator opens on.
 *
 * Same shape as build-or-invest/guide.js: shared/wizard.js holds the
 * machinery, this holds the words. Every input model.js has gets a
 * plain-language question, what it is, why it moves the answer, and what it
 * typically runs to in a developed and in a developing market. Ranges and
 * defaults are never repeated here — they come from the engine, and
 * validateGuide() fails loudly if the two fall out of step.
 *
 * outcome() is also what the advanced page draws its verdict and tiles from,
 * so the two views can't describe the same scenario differently.
 */
(function(root, factory){
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AirbnbOrInvestGuide = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function(){
"use strict";

var STAKE_MADE_OF = {
  buy:   "Price, transfer costs and furnishing",
  build: "Plot, build, fees, contingency and furnishing",
  own:   "What a sale would bring today, plus furnishing",
  keep:  "Only the furnishing — the house stays yours either way"
};

var GUIDE = {
  title: "Airbnb or invest",

  intro: {
    question: "Should your money run an Airbnb, or sit in a unit trust or government securities?",
    what: "A short let looks like the better deal because a night costs a guest so much more than a month's " +
      "rent works out to. But the place sits empty some nights, a cut comes off every booking, and every " +
      "stay needs a clean. The same money in a unit trust or T-bills compounds with none of that. This walks " +
      "you through the numbers that decide it — whether you're buying, building, or already own the place.",
    how: [
      "<b>One question per screen.</b> Each one says what it is and why it matters before it asks you for anything.",
      "<b>Skip anything you don't know.</b> Every question already has a sensible number in it, and skipping keeps that number — the answer screen shows which ones you left alone.",
      "<b>Both sides pay their own costs.</b> The Airbnb pays for cleaning, empty nights and the platform's cut; the market pays its tax and fund fees. Neither side gets a free pass.",
      "<b>Nothing leaves your browser.</b> No account, no server — your answers live in the address bar, so you can bookmark or share the link."
    ]
  },

  aiIntro: [
    "I'm deciding whether to run a property as an Airbnb or put the same money into a unit trust or",
    "government securities. Help me fill in this guided calculator:"
  ],

  modeLabel: "Where you're starting from",

  disclaimer:
    "<b>How this works.</b> The same money goes either into the Airbnb or into the market. The Airbnb side " +
    "pays for the place (or, if you own it, gives up the sale), furnishes it, fills up over the first months, " +
    "then earns bookings net of the platform, management, cleaning, bills, repairs, wear and tax. Whatever " +
    "it makes is reinvested at the market rate. At the end the place is sold, less selling costs and capital " +
    "gains tax. The market side compounds at your return, net of tax and fees." +
    "<br><br><b>Not modelled:</b> mortgages or construction loans — this compares cash against cash. Nor are " +
    "seasonality, licensing and tourism levies, building rules that ban short lets, or your own time if you " +
    "run it yourself." +
    "<br><br><b>This is a model, not advice.</b> The numbers you put in matter far more than the arithmetic.",

  steps: [
    {
      id: "start", kind: "mode", section: "Where you're starting",
      question: "Where are you starting from?",
      what: "It changes what the Airbnb is up against. If you'd buy or build, the money you'd spend could go " +
        "into the market instead. If you already own the place, the question is whether you'd otherwise sell " +
        "it — or keep it regardless, and risk only the furnishing.",
      why: "It is the difference between asking \"is this a good use of KSh10M?\" and \"is this a good use of " +
        "KSh800,000 of furniture?\". The second question is far easier for an Airbnb to win, and it is only the " +
        "right question if you really would keep the place empty or for yourself otherwise.",
      options: [
        { value: "buy", label: "I'd buy a place",
          blurb: "A finished flat or house, furnished and listed." },
        { value: "build", label: "I'd buy land and build",
          blurb: "Nothing is earned while it goes up." },
        { value: "own", label: "I own it — I could sell it instead",
          blurb: "The alternative is selling it and investing what you'd get." },
        { value: "keep", label: "I own it and I'm keeping it anyway",
          blurb: "Only the furnishing money is at stake. The house is yours on both paths." }
      ]
    },

    { id: "price",   section: "Buying it", keys: ["price"] },
    { id: "buyfees", section: "Buying it", keys: ["buyFeesPct"] },

    { id: "land",      section: "Building it", keys: ["land"] },
    { id: "buildcost", section: "Building it", keys: ["buildCost"] },
    { id: "softcost",  section: "Building it", keys: ["feesPct", "contingencyPct"],
      title: "What goes on top of the bricks?",
      blurb: "Two percentages on top of the construction cost. Neither is optional in practice, and leaving " +
        "them out is the most common reason a building budget is wrong." },
    { id: "buildtime", section: "Building it", keys: ["buildMonths"] },
    { id: "worth",     section: "Building it", keys: ["worthPct"] },

    { id: "homevalue", section: "The place you own", keys: ["homeValue"] },

    { id: "furnish", section: "Getting it guest-ready", keys: ["furnish"] },
    { id: "ramp",    section: "Getting it guest-ready", keys: ["rampMonths"] },

    { id: "nightly",    section: "What it earns", keys: ["nightly"] },
    { id: "occupancy",  section: "What it earns", keys: ["occupancy"] },
    { id: "stay",       section: "What it earns", keys: ["stayNights"] },
    { id: "rategrowth", section: "What it earns", keys: ["rateGrowth"] },

    { id: "cut", section: "Cost of running it", keys: ["platformPct", "mgmtPct"],
      title: "Who takes a cut of each booking?",
      blurb: "Two shares that come off the top of every booking, before you have paid for a single clean." },
    { id: "turnover", section: "Cost of running it", keys: ["cleanStay"] },
    { id: "bills", section: "Cost of running it", keys: ["utilities", "repairs", "refreshPct"],
      title: "What does it cost to keep it running?",
      blurb: "The bills that arrive whether or not anyone is staying. A short let pays for everything a " +
        "tenant would normally cover themselves, and wears the place out faster." },
    { id: "tax", section: "Cost of running it", keys: ["incomeTax"] },

    { id: "hold",   section: "Holding the property", keys: ["fixedCosts"] },
    { id: "apprec", section: "Holding the property", keys: ["apprec"] },

    { id: "exit", section: "Getting out", keys: ["sellPct", "cgt"],
      title: "What comes off when you sell?",
      blurb: "Two costs taken off the sale at the end. If you own the place already, the selling costs also " +
        "come off the sale you would make today instead." },

    { id: "invest", section: "The alternative", keys: ["invest"] },
    { id: "drag",   section: "The alternative", keys: ["investTax", "investFee"],
      title: "What comes off that return before you see it?",
      blurb: "The market side has to be charged its own costs, or the comparison is rigged. Tax on the " +
        "interest, and the fee a fund takes for holding your money." },

    { id: "horizon",   section: "Time", keys: ["horizon"] },
    { id: "inflation", section: "Time", keys: ["inflation"] }
  ],

  fields: {

    price: {
      q: "What does the place cost to buy?",
      what: "The price of the flat or house you would list, before stamp duty and legal fees — those come next.",
      why: "It's the biggest number on the Airbnb side, and it earns nothing on its own. The bookings and the " +
        "property's growth together have to beat what the same money would do in the market. A place that " +
        "is expensive for the nightly rate it can charge rarely wins.",
      typical: {
        developed: "Short-let investors in cities that draw visitors typically pay US$250,000–600,000 for a " +
          "one- or two-bedroom flat in a location guests want.",
        developing: "In Nairobi's Kilimani, Westlands or Kileleshwa, or Kampala's Kololo, Naguru or Bugolobi, " +
          "a one-bed that works as a short let is roughly US$50,000–100,000 and a two-bed US$80,000–150,000."
      }
    },

    buyFeesPct: {
      q: "What does the transfer cost on top?",
      what: "Stamp duty, the lawyer, the valuation and registration — the money that changes hands when the " +
        "title does, as a share of the price.",
      why: "It is gone the day you buy. The Airbnb has to earn it back before it is even level with the " +
        "market, which is one reason short holding periods so rarely work.",
      presets: [
        { label: "Uganda about 3%", value: 3 },
        { label: "Kenya about 6%", value: 6 }
      ],
      typical: {
        developed: "2–7% in most of Europe and North America, more where there is a heavy transfer tax.",
        developing: "Kenya charges 4% stamp duty in towns (2% outside them), plus legal and valuation fees. " +
          "Uganda's stamp duty is 1.5%, with legal fees on top."
      }
    },

    land: {
      q: "What does the plot cost?",
      what: "The price of the site alone. Put 0 if you already own it — the building is still weighed " +
        "against the market.",
      why: "Land is paid for on day one and earns nothing until the first guest arrives. What it adds comes " +
        "back through what the finished place is worth, a few questions on.",
      typical: {
        developed: "In cities, the land is often a third to a half of what a finished home costs.",
        developing: "Serviced plots within reach of central Nairobi or Kampala are expensive; further out " +
          "they are cheap, but so are the guests. A plot for a small unit near a town centre commonly runs " +
          "US$20,000–80,000."
      }
    },

    buildCost: {
      q: "What will it cost to build?",
      what: "Construction only — shell, roof, finishes, plumbing and wiring for the unit you would list. " +
        "Design fees and contingency go on the next screen.",
      why: "Together with the plot it sets the stake. It also decides whether the finished place is worth " +
        "more than it cost, which is the one advantage building has over buying.",
      typical: {
        note: "Builders quote per square metre. A one-bedroom flat is typically 45–60 m², a two-bed 70–95 m².",
        developed: "Roughly US$1,500–3,500 per square metre, so a 50 m² one-bed is US$75,000–175,000 before land.",
        developing: "Roughly US$300–700 per square metre in Kenya and Uganda, so a 50 m² one-bed is about " +
          "US$15,000–35,000. The finishes guests will pay for sit at the top of that range."
      }
    },

    feesPct: {
      q: "What do the professionals and the approvals cost?",
      what: "Architect, structural engineer, quantity surveyor and the local authority's approvals, as a " +
        "share of the build cost.",
      why: "Skipping them saves money until the building fails an inspection or can't be titled. Either way " +
        "it is spent before a single night is booked.",
      typical: {
        developed: "8–15% of the build cost.",
        developing: "5–12%. Kenya adds NEMA and county approvals; in Uganda it is KCCA or the municipal " +
          "council's plan approval."
      }
    },

    contingencyPct: {
      q: "How much spare for overruns?",
      what: "Money set aside for what goes wrong, as a share of the build cost plus fees.",
      why: "Overruns are the norm, not the exception. Leaving this out makes the building look cheaper than " +
        "it will be.",
      typical: {
        developed: "5–10% on a well-specified job with a fixed-price contract.",
        developing: "10–20%, and more if you're managing the build from a distance. Cement, steel and " +
          "fittings priced in dollars move with the exchange rate."
      }
    },

    buildMonths: {
      q: "How long will it take to build?",
      what: "From breaking ground to a unit ready for its furniture. The build money is drawn evenly over these months.",
      why: "Every month under construction earns nothing while the market side compounds. A year of delay can " +
        "cost more than the whole contingency.",
      presets: [
        { label: "Quick 6", value: 6 },
        { label: "Typical 12", value: 12 },
        { label: "Slow 24", value: 24 }
      ],
      typical: {
        developed: "6–12 months for a single unit once approvals are in hand.",
        developing: "9–24 months is common. Builds paid for in cash tend to pause whenever the money does."
      }
    },

    worthPct: {
      q: "What will the finished place be worth, compared with what it cost?",
      what: "As a share of everything you spent — plot, build, fees and contingency. 100 means a buyer would " +
        "pay exactly what it cost you.",
      why: "This is where building can beat buying. Build for less than a finished place sells for and you " +
        "start ahead; come in under 100 and you start with a loss the bookings have to cover.",
      presets: [
        { label: "At cost 100%", value: 100 },
        { label: "Some margin 120%", value: 120 },
        { label: "Strong 150%", value: 150 }
      ],
      typical: {
        developed: "Owner-builders who control costs well can capture 10–25% over cost. Many don't.",
        developing: "Well-located new units often sell above build cost, because finished stock and building " +
          "finance are both scarce — but a one-off unit in the wrong place can be worth less than it cost."
      }
    },

    homeValue: {
      q: "What would the place sell for today?",
      what: "Not what you paid — what a buyer would hand over now. In this scenario the alternative is selling " +
        "it and investing the proceeds.",
      why: "This money is tied up in the property whether or not it earns. A valuable home let at a nightly " +
        "rate that doesn't reflect that value is how a property quietly loses to a fund.",
      typical: {
        developed: "Two agents' valuations, or recent sales on the same street, are the best guide.",
        developing: "Recent sales nearby are the best guide. In Kenya and Uganda, asking prices on listing " +
          "sites often run 10–20% above what actually sells."
      }
    },

    furnish: {
      q: "What will it cost to furnish and set up?",
      what: "Everything that turns a flat into a listing: beds, furniture, appliances, linen, kitchenware, a " +
        "smart lock, Wi-Fi and good photos.",
      why: "It's spent in every scenario, and if you're keeping the place anyway it is the only money at " +
        "stake. Better furnishing supports a higher nightly rate — and it wears out, which the bills screen prices.",
      typical: {
        developed: "US$8,000–25,000 for a one- or two-bedroom flat.",
        developing: "US$4,000–12,000 for a one-bed in Nairobi or Kampala. Imported appliances and a good " +
          "mattress are most of it."
      }
    },

    rampMonths: {
      q: "How long until it books like an established listing?",
      what: "A new listing has no reviews and ranks low in search. Bookings climb from nothing to your " +
        "usual figure over these months.",
      why: "These are the months you pay every bill on a fraction of the income.",
      presets: [
        { label: "Straight away", value: 0 },
        { label: "A few months", value: 4 },
        { label: "Slow 9", value: 9 }
      ],
      typical: {
        developed: "3–6 months is typical for a well-presented listing.",
        developing: "3–9 months. A listing in an area visitors already look for fills faster."
      }
    },

    nightly: {
      q: "What will a guest pay per night?",
      what: "The rate before the platform's cut. Look at what similar listings nearby charge on the nights " +
        "they are actually booked — not the asking rate on the empty ones.",
      why: "It moves the answer more than any cost. Every line of income is this multiplied by the nights booked.",
      typical: {
        developed: "US$80–200 for a one-bed in a city that draws visitors.",
        developing: "Roughly US$35–70 for a one-bed in the popular parts of Nairobi or Kampala, and " +
          "US$60–120 for a two-bed. More near embassies, UN offices and the airport."
      }
    },

    occupancy: {
      q: "How much of the year will it be booked?",
      what: "The share of nights with a guest in, once the listing is established.",
      why: "The biggest lever there is. Bills, repairs and fixed charges are paid every night of the year; " +
        "only the booked ones pay them back.",
      presets: [
        { label: "Quiet 40%", value: 40 },
        { label: "Typical 55%", value: 55 },
        { label: "Busy 70%", value: 70 }
      ],
      typical: {
        developed: "Around 50–70% in most cities; the best listings go higher.",
        developing: "Commonly 40–65% in Nairobi and Kampala, dipping outside conference and holiday " +
          "seasons, with a lot of new listings competing for the same guests."
      }
    },

    stayNights: {
      q: "How long does a typical guest stay?",
      what: "Nights per booking. Every checkout means a clean, fresh linen and restocked consumables.",
      why: "Short stays mean more turnovers for the same nights. Longer stays save on cleaning but usually " +
        "come with a discount.",
      presets: [
        { label: "Weekend 2", value: 2 },
        { label: "Typical 3", value: 3 },
        { label: "Work week 5", value: 5 }
      ],
      typical: {
        developed: "2–4 nights for city listings.",
        developing: "2–5 nights. Business travellers and NGO staff often book a week or more."
      }
    },

    rateGrowth: {
      q: "How fast will nightly rates rise?",
      what: "Per year, on average.",
      why: "Rates that keep pace with inflation leave your margin where it is. Rates that lag — usually " +
        "because new listings keep arriving — squeeze it every year.",
      typical: {
        developed: "Roughly in line with inflation, 2–4% a year.",
        developing: "Often below inflation in local currency when supply grows fast; 3–6% a year in " +
          "shillings is a reasonable range."
      }
    },

    platformPct: {
      q: "What does the platform keep?",
      what: "Airbnb's or Booking.com's fee on each booking, as a share of what the guest pays.",
      why: "Under Airbnb's usual split fee the guest pays most of it and you pay a small slice. Host-only " +
        "pricing moves the whole fee onto you, in exchange for a lower price on screen.",
      presets: [
        { label: "Split fee 3%", value: 3 },
        { label: "Host-only 15%", value: 15 }
      ],
      typical: {
        developed: "About 3% under Airbnb's split fee, 14–16% host-only; Booking.com takes 15–18%.",
        developing: "The same platform fees apply. Some hosts also pay a local agent for bookings that come " +
          "in by phone or WhatsApp."
      }
    },

    mgmtPct: {
      q: "Will someone else run it for you?",
      what: "A co-host or management company's fee, as a share of bookings. Put 0 if you'll handle guests, " +
        "check-ins and cleaners yourself.",
      why: "Doing it yourself saves the fee, but it's a part-time job, and this calculator doesn't pay you for it.",
      presets: [
        { label: "Myself 0%", value: 0 },
        { label: "Co-host 15%", value: 15 },
        { label: "Full-service 25%", value: 25 }
      ],
      typical: {
        developed: "Co-hosts charge 10–20%; full-service managers 20–35%.",
        developing: "15–25% for a manager in Nairobi or Kampala, often with cleaning charged on top."
      }
    },

    cleanStay: {
      q: "What does each turnover cost?",
      what: "Cleaning, laundry and consumables — soap, toilet paper, coffee — for one checkout.",
      why: "It is paid once per stay rather than once per night, so it hurts most when stays are short.",
      typical: {
        developed: "US$40–100 per clean.",
        developing: "US$8–20 per clean. Labour is cheap; laundry, water and consumables are most of it."
      }
    },

    utilities: {
      q: "What are the monthly bills?",
      what: "Power, water, Wi-Fi, a TV subscription, security and any service charge — all paid by you, " +
        "because guests don't pay bills.",
      why: "They're paid on the empty nights too, so they are what makes a quiet month lose money.",
      typical: {
        developed: "US$150–400 a month.",
        developing: "US$60–200 a month. Power tokens and a backup generator or inverter add to it."
      }
    },

    repairs: {
      q: "What will repairs and upkeep cost each year?",
      what: "Plumbing, paint, appliance repairs and the rest. A short let wears a place faster than a tenant.",
      why: "Small against the bookings, but it is paid every year and it rises with inflation.",
      typical: {
        developed: "About 1% of the property's value a year, and more for a short let.",
        developing: "A few hundred dollars a year for a newer flat; more in older buildings."
      }
    },

    refreshPct: {
      q: "How fast do the furnishings wear out?",
      what: "The share of the setup cost you spend replacing things each year — linen, towels, a sofa, a " +
        "fridge that gives up.",
      why: "Guests are harder on a place than tenants. A full refresh every five to seven years is typical, " +
        "and the bookings have to pay for it.",
      presets: [
        { label: "Gentle 10%", value: 10 },
        { label: "Typical 15%", value: 15 },
        { label: "Hard use 25%", value: 25 }
      ],
      typical: {
        developed: "Hosts commonly budget 10–20% of the furnishing cost a year.",
        developing: "Similar, and imported replacements get dearer whenever the currency weakens."
      }
    },

    incomeTax: {
      q: "How are the bookings taxed?",
      what: "Tax as a share of everything guests pay you, before any costs come off. If you're taxed on " +
        "profit instead, put in what that works out to as a share of your takings.",
      why: "Tax on takings is paid even in a year the place made nothing, so a high rate hurts most when " +
        "bookings are thin.",
      presets: [
        { label: "Kenya 7.5%", value: 7.5 },
        { label: "Uganda 12%", value: 12 }
      ],
      typical: {
        developed: "Usually taxed as income on profit, at your marginal rate. Measured against takings " +
          "that is often 5–15%.",
        developing: "Uganda taxes individuals' rental income at 12% of the gross above a threshold. Kenya " +
          "taxes residential rent at 7.5% of the gross, but a short let run as a business can instead be " +
          "taxed on profit, plus tourism levies. Check with a tax adviser."
      }
    },

    fixedCosts: {
      q: "What does it cost to own the place each year?",
      what: "Land rates, building insurance and ground rent — the costs of owning it at all, booked or not.",
      why: "Small for most flats, but paid from day one, including every month a building is still going up.",
      typical: {
        developed: "Property tax alone is often 0.5–2% of the value a year.",
        developing: "Usually small: land rates and ground rent of a few hundred dollars a year, plus " +
          "insurance if you take it out."
      }
    },

    apprec: {
      q: "How fast will the property's value grow?",
      what: "Per year, on average, in local currency.",
      why: "When you're buying, building or could sell, this is half of the Airbnb's return. A few points " +
        "here can decide whether it beats the market at all.",
      presets: [
        { label: "Flat 0%", value: 0 },
        { label: "Steady 4%", value: 4 },
        { label: "Hot area 8%", value: 8 }
      ],
      typical: {
        developed: "2–5% a year over long periods.",
        developing: "3–8% a year in shillings in growing parts of Nairobi and Kampala. Flats in oversupplied " +
          "areas have been flat or falling."
      }
    },

    sellPct: {
      q: "What does selling cost?",
      what: "The agent's commission and legal fees, as a share of the sale price.",
      why: "It comes off the Airbnb's biggest asset at the end. If you own the place already, it also comes " +
        "off the sale you'd make today, which shrinks what the market side starts with.",
      typical: {
        developed: "5–7% with an agent in the US; 1–3% in much of Europe.",
        developing: "2–5%, commission plus legal fees."
      }
    },

    cgt: {
      q: "What tax is due on the gain?",
      what: "Capital gains tax on what you sell for above what the place cost you.",
      why: "Only the gain is taxed, so it matters most when the property has grown a lot.",
      typical: {
        developed: "15–28% of the gain in most places, often with an allowance.",
        developing: "Kenya charges 15% capital gains tax on property. Uganda taxes the gain on a rental " +
          "property as income; a home you lived in can be exempt."
      }
    },

    invest: {
      q: "What would the money earn in a unit trust or government securities?",
      what: "The return per year, before tax and fees — those come on the next screen.",
      why: "This is the bar the Airbnb has to clear. A point here moves the answer as much as several points " +
        "of occupancy.",
      presets: [
        { label: "Unit trust 10%", value: 10 },
        { label: "T-bills 12%", value: 12 },
        { label: "Long bond 15%", value: 15 }
      ],
      typical: {
        note: "Rates move with the central bank — check this week's figures before you rely on them.",
        developed: "Money market funds and short government bills pay 3–5%; long government bonds 4–5%.",
        developing: "In Kenya, money market funds and T-bills have paid roughly 8–13% in recent years, and " +
          "long bonds 13–16%. In Uganda, unit trusts have paid around 10–12%, T-bills 10–13% and long bonds 14–17%."
      }
    },

    investTax: {
      q: "What tax comes off the interest?",
      what: "Withholding tax taken off before the interest reaches you.",
      why: "Charged every year the money earns, so over a long horizon it compounds against you.",
      typical: {
        developed: "Taxed as income in most places, at 10–40% depending on your bracket.",
        developing: "15% withholding on T-bill, bond and money-market interest is common in both Kenya and " +
          "Uganda. Kenya's infrastructure bonds are tax-free, and Uganda taxes long-dated bonds at a lower rate."
      }
    },

    investFee: {
      q: "What does the fund charge each year?",
      what: "The management fee on the balance. Nothing if you hold T-bills or bonds directly.",
      why: "It comes off every year, so a fee that looks small costs a lot over a decade.",
      presets: [
        { label: "T-bills direct 0%", value: 0 },
        { label: "Unit trust 2%", value: 2 }
      ],
      typical: {
        developed: "0.1–1% for index and money market funds.",
        developing: "1.5–2.5% for unit trusts and money market funds in Kenya and Uganda; nothing on T-bills " +
          "and bonds bought through the central bank."
      }
    },

    horizon: {
      q: "Over how many years should we compare?",
      what: "Both paths are measured at this year, with the property sold.",
      why: "Short horizons punish the Airbnb, because transfer costs, furnishing and the months spent " +
        "building reviews are all paid up front.",
      presets: [
        { label: "5 years", value: 5 },
        { label: "10 years", value: 10 },
        { label: "20 years", value: 20 }
      ],
      typical: {
        developed: "Short-let investors commonly hold for 5–15 years.",
        developing: "Property is often held for decades; 10–20 years is a fair test."
      }
    },

    inflation: {
      q: "What will inflation run at?",
      what: "Per year. It pushes up cleaning, bills, repairs, fixed costs and replacing the furnishings.",
      why: "The costs rise with it. Whether the bookings keep up depends on the nightly rate growth you set earlier.",
      typical: {
        developed: "2–3% a year.",
        developing: "Kenya and Uganda have run at roughly 3–7% a year recently."
      }
    }
  },

  /* ===================== the answer screen ===================== */
  outcome: function(engine, s){
    var V = engine.V;
    var gap = s.finalAirbnb - s.finalInvest;
    var airbnb = gap >= 0;
    var amt = engine.fmt(Math.abs(gap));
    var yrs = V.horizon + (V.horizon === 1 ? " year" : " years");
    var irr = engine.irr(s.cashflows);
    var netInv = engine.netInvestReturn();
    var stake = engine.fmt(s.stake);
    var occ = engine.solve("occupancy", 0, 100);

    var headline = (airbnb ? '<span class="b">Airbnb</span>' : '<span class="r">Invest</span>') +
      ", by " + amt + " over " + yrs + ".";

    var sub = airbnb
      ? "Running it as a short let leaves you <b>" + amt + "</b> ahead of putting the same <b>" + stake +
        "</b> into the market, after every cost, tax and the sale. " +
        (s.breakEven ? "It pulls ahead in <b>year " + s.breakEven + "</b> — stop before that and the market wins."
                     : "It only gets there at the very end.")
      : "The same <b>" + stake + "</b> in a unit trust or government securities beats the Airbnb by <b>" +
        amt + "</b>. " +
        (s.runningLoss
          ? "At these numbers it loses money every year before the property's growth is counted."
          : occ !== null && occ > V.occupancy
            ? "It would need about <b>" + engine.pctS(occ) + "</b> of nights booked to tie."
            : "The bookings don't earn enough to beat compounding.");

    var short = '<b class="' + (airbnb ? "b" : "r") + '">' + (airbnb ? "The Airbnb" : "The market") +
      "</b> is ahead by <b>" + amt + "</b> after " + yrs + ".";

    var warns = [];
    if(s.runningLoss){
      warns.push("<b>The bookings don't cover the running costs.</b> Once it's fully booked the place still " +
        "loses money every year, and the loss is charged at the rate your investments would earn.");
    }
    if(s.horizonBeforeCompletion){
      warns.push("<b>Your horizon ends before the building is finished.</b> It's sold as a part-built site, " +
        "valued at what you've sunk into it — the most generous thing anyone can assume about an unfinished building.");
    }

    return {
      headline: headline, sub: sub, short: short,
      warn: warns.length ? warns.join("<br><br>") : null,
      labelA: "Run it as an Airbnb",
      labelB: "Invest the money instead",
      series: s.series.map(function(p){ return { y: p.y, a: p.airbnb, b: p.invest }; }),
      breakEven: s.breakEven,
      tiles: [
        { k: "Money at stake", v: stake, s: STAKE_MADE_OF[s.mode] || "What the Airbnb ties up" },
        { k: "Airbnb return", v: irr === null ? "—" : engine.pctS(irr),
          s: irr === null ? "No rate fits these cashflows"
                          : "A year, all in. The market pays " + engine.pctS(netInv) + " after tax and fees" },
        { k: "Nights booked to tie", v: occ === null ? "—" : engine.pctS(occ),
          s: occ === null ? (airbnb ? "It wins at any occupancy" : "Not even a full calendar ties it")
                          : "You said " + engine.pctS(V.occupancy) },
        { k: "Gap at year " + V.horizon, v: (gap >= 0 ? "+" : "−") + amt,
          s: gap >= 0 ? "in favour of the Airbnb" : "in favour of investing" }
      ]
    };
  }
};

return GUIDE;
});
