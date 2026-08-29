/* The editorial half of the walkthrough at /rent-or-buy/ — the page this
 * calculator opens on.
 *
 * shared/wizard.js holds the machinery; this holds the words. For every input
 * the calculator has: how to ask for it in plain language, what it is, why it
 * moves the answer, and what it typically runs to in a developed and in a
 * developing market. The numbers, ranges and defaults are NOT repeated here —
 * those come from calc.js, so this file cannot quietly disagree with the
 * thing it is describing. shared/wizard.js's validateGuide() fails loudly if
 * a field is added to the engine and no question is written for it.
 *
 * On the typical values: they are rough anchors from the last few years, meant
 * for sanity-checking a number rather than sourcing one, and the UI says so
 * under every one of them. A visitor who wants real current figures is pointed
 * at the "ask an AI" prompt, which is what it is for.
 */
(function(root, factory){
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.RentOrBuyGuide = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function(){
"use strict";

/* Rent expressed as a yield on the price is the one rule of thumb that
   travels between markets, so the rent questions offer it as a preset rather
   than a number that would only be right in one city. */
function yieldOf(pctPerYear){
  return function(V){ return V.price * pctPerYear / 100 / 12; };
}

var GUIDE = {
  title: "Rent or buy",

  intro: {
    question: "Should you buy a home, or rent and invest the difference?",
    what: "Buying is not automatically the smart move and renting is not automatically wasted money. " +
      "Which one leaves you richer depends on a handful of numbers — and this walks you through them " +
      "one at a time.",
    how: [
      "<b>One question per screen.</b> Each one says what it is and why it matters before it asks you for anything.",
      "<b>Skip anything you don't know.</b> Every question already has a sensible number in it, and skipping keeps that number — the answer screen shows you exactly which ones you left alone.",
      "<b>Nothing leaves your browser.</b> There is no account and no server; the whole thing computes on this page, and your answers live in the address bar so you can bookmark or share the link.",
      "<b>You can change your mind at the end.</b> The answer screen lists every question with an edit button next to it."
    ]
  },

  aiIntro: [
    "I'm deciding whether to buy a home or keep renting. Help me fill in this guided calculator:"
  ],

  modeLabel: "What the property is for",

  disclaimer:
    "<b>How this works.</b> Both paths start with the same cash. The renter invests the deposit and the " +
    "purchase costs on day one, and whichever path has the cheaper month invests the difference. What you " +
    "would be worth in the final year is the sale price less selling costs, the loan you still owe and " +
    "capital gains tax, plus the investment pot less the tax on its own growth. Both sides are cashed in " +
    "on the same day and taxed on the same terms." +
    "<br><br><b>Not modelled:</b> mortgage insurance, service charge arrears, ground rent, the cost of " +
    "moving, or the fact that a landlord can raise your rent and a bank cannot raise a fixed repayment. " +
    "Growth rates here are steady averages; real ones arrive in lumps." +
    "<br><br><b>This is a model, not advice.</b> The numbers you put in matter far more than the " +
    "arithmetic it does with them.",

  steps: [
    {
      id: "purpose", kind: "mode", section: "What you're deciding",
      question: "Would you live in this place, or rent it out?",
      what: "It changes what buying is being compared against. If you would live in it, the alternative is " +
        "paying rent somewhere similar. If you would let it out, your own housing costs the same either " +
        "way, so the comparison is the property against the same money left in the market.",
      why: "These are genuinely different questions. An owner-occupier is buying a place to live and a " +
        "hedge against rent rises; a landlord is buying an income stream. The model taxes them " +
        "differently too — a let is taxed on its rental profit, while an owner-occupier may get relief " +
        "on mortgage interest instead.",
      options: [
        { value: "live", label: "I'd live in it",
          blurb: "Compared against renting a similar home and investing whatever you save." },
        { value: "let", label: "I'd rent it out",
          blurb: "Compared against leaving the same money in the market. Your own rent drops out of both sides." }
      ]
    },

    { id: "price",   section: "The home",        keys: ["price"] },
    { id: "rent",    section: "Renting instead", keys: ["rent"] },
    { id: "income",  section: "Letting it out",  keys: ["income"] },
    { id: "letting", section: "Letting it out",  keys: ["vacancy", "mgmt"],
      title: "How much of that rent actually reaches you?",
      blurb: "Nobody collects twelve months of rent from twelve months of the year. Two things come off " +
        "the top before anything else: the months with no tenant, and the agent." },

    { id: "deposit", section: "The mortgage", keys: ["downPct"] },
    { id: "rate",    section: "The mortgage", keys: ["rate"] },
    { id: "term",    section: "The mortgage", keys: ["term"] },
    { id: "buying",  section: "Buying costs", keys: ["closingPct"] },

    { id: "horizon", section: "Your plans",     keys: ["horizon"] },
    { id: "invest",  section: "The alternative", keys: ["invest"] },
    { id: "appr",    section: "What the future does", keys: ["appr"] },
    { id: "drift",   section: "What the future does", keys: ["rentGrowth", "inflation"],
      title: "How fast do rents and prices creep up?",
      blurb: "Two slow-moving numbers that decide a lot over a decade. Both already have reasonable " +
        "figures in them — nudge them if your market is unusual, or skip straight past." },

    { id: "running", section: "Cost of owning it", keys: ["taxPct", "insurance", "maintPct", "hoa"],
      title: "What does owning it cost every year?",
      blurb: "The bills that arrive whether or not you have a mortgage, and the ones renters never see. " +
        "Each has a sensible default in it, so skip the whole screen if you would only be guessing." },
    { id: "selling", section: "Getting out", keys: ["sellPct"] },

    { id: "tax", section: "Tax", keys: ["marginal", "reliefCap", "cgt", "cgtInvest"],
      title: "How is all of this taxed where you are?",
      blurb: "The last screen, and the one most people should skip unless they know their own rules. " +
        "Tax can move the answer by a lot, which is exactly why guessing at it is worse than leaving " +
        "the defaults in place and reading the result as approximate." }
  ],

  fields: {

    /* ---------- the home ---------- */
    price: {
      q: "What does the place cost?",
      what: "The asking price of the home you'd buy — not what you can borrow, and not what you think " +
        "it's worth. If you're browsing rather than buying, put in the price of something you'd " +
        "actually want to live in.",
      why: "Almost everything else on the way through is a percentage of this number: the deposit, the " +
        "loan, the purchase costs, the upkeep, the council's charge. Getting it roughly right matters " +
        "more than getting any single percentage exactly right.",
      typical: {
        note: "Type the price in your own currency using the picker at the top of the page — the model " +
          "does not care which one, as long as the rent you give it later is in the same one.",
        developed: "A modest first home runs from about US$250,000 in mid-size American cities to " +
          "£250,000–£400,000 in much of the UK, and well past a million in London, Sydney or " +
          "Vancouver. Prices tend to sit around 5–10 times a single median salary.",
        developing: "Prices are lower in absolute terms but far higher against local incomes — often " +
          "10–20 times a median salary. A two-bedroom flat in a good Nairobi suburb runs roughly " +
          "KES 10–20M; something similar in Lagos, Accra or Manila is usually priced in dollars " +
          "and moves with the exchange rate."
      }
    },

    rent: {
      q: "What would you pay to rent somewhere similar?",
      what: "Per month, for a home you'd be equally happy in. Not what you pay now if you'd be trading " +
        "up — the comparison only means something if both sides house you the same way.",
      why: "This is the money the buyer stops paying and the renter keeps paying, and it is the single " +
        "biggest thing on the renting side of the scale. Understate it and buying looks better than it is.",
      presets: [
        { label: "4%/yr yield", value: yieldOf(4) },
        { label: "6%/yr yield", value: yieldOf(6) },
        { label: "8%/yr yield", value: yieldOf(8) }
      ],
      typical: {
        note: "The chips above set the rent from the price you gave, using the gross yield — annual rent " +
          "as a share of the price. It is the one rent rule of thumb that travels between countries.",
        developed: "Gross yields of about 3–5% a year are normal, and lower still in the most expensive " +
          "cities — London and much of coastal California sit near 3%. Low yields are what make renting " +
          "competitive there: the rent is cheap relative to the price of buying the same place.",
        developing: "Yields of 6–10% are common — Nairobi, Lagos, Delhi and much of Latin America sit in " +
          "that band. Rent is expensive relative to the price, which pushes the answer towards buying, " +
          "if you can raise the deposit and stomach the mortgage rate."
      }
    },

    income: {
      q: "What rent would you collect?",
      what: "Per month, when there's a tenant in it. Gross — before the agent, before the empty months " +
        "and before tax. The next screen takes those off.",
      why: "This is the whole return on the let, other than the price going up. Everything the property " +
        "earns you comes out of this number.",
      presets: [
        { label: "5%/yr yield", value: yieldOf(5) },
        { label: "8%/yr yield", value: yieldOf(8) },
        { label: "10%/yr yield", value: yieldOf(10) }
      ],
      typical: {
        note: "The chips set the rent from the price you gave, as a gross annual yield.",
        developed: "3–5% gross in most large cities, before costs. After management, voids, tax and " +
          "upkeep, landlords there are often left with 1.5–3% — the case for buying rests mostly on the " +
          "price rising and the mortgage being paid down by someone else.",
        developing: "6–10% gross is normal, sometimes more for small units in high-demand areas. The " +
          "catch is on the other side of the ledger: higher vacancy, slower-paying tenants, and a " +
          "mortgage rate that can be higher than the yield itself."
      }
    },

    vacancy: {
      q: "How much of the year does it sit empty?",
      what: "The share of the year with no rent coming in — between tenants, during repairs, or because " +
        "nobody wanted it at that price. 8% is about one month in twelve.",
      why: "It scales the rent directly: at 20% vacancy you collect a fifth less than the headline figure " +
        "suggests, every year, forever. Optimism here is the most common way a rental spreadsheet lies.",
      presets: [
        { label: "Very tight 3%", value: 3 },
        { label: "One month 8%", value: 8 },
        { label: "Slow 15%", value: 15 }
      ],
      typical: {
        developed: "3–8% in cities with tight housing supply. Long tenancies, regulated notice periods " +
          "and professional agents keep the gaps short; UK and German landlords often plan on a few weeks " +
          "a year.",
        developing: "8–20% is realistic, and higher for new blocks in overbuilt areas or for units priced " +
          "above what local tenants can pay. Nairobi's mid-market apartments have run well into double " +
          "digits when a lot of supply arrives at once."
      }
    },

    mgmt: {
      q: "What does the letting agent take?",
      what: "A share of the rent collected, every month, for finding tenants and dealing with them. Put 0 " +
        "if you'd manage it yourself — but be honest about whether you actually would.",
      why: "It comes off the top of the rent for the whole time you own the place, so it compounds into a " +
        "large number even at single-digit rates.",
      presets: [
        { label: "Self-managed 0%", value: 0 },
        { label: "Typical 8%", value: 8 },
        { label: "Full service 12%", value: 12 }
      ],
      typical: {
        developed: "8–12% of rent in the US; 10–15% for full management in the UK, plus a separate " +
          "tenant-finding fee. Tenant-find-only deals are cheaper but leave the work with you.",
        developing: "5–10% is the norm — 8% is standard in Kenya and much of East Africa. Fees are lower " +
          "partly because the service is thinner: chasing late rent is often still your problem."
      }
    },

    /* ---------- the mortgage ---------- */
    downPct: {
      q: "How much of the price would you put down in cash?",
      what: "Your deposit, as a share of the price. The rest is the mortgage. This is money you have and " +
        "would hand over on day one.",
      why: "It cuts two ways, which is why the answer is rarely 'as much as possible'. A bigger deposit " +
        "means a smaller loan and less interest — but it also means more of your cash locked in a house " +
        "instead of earning a return somewhere else. The model gives the renter that same cash to invest, " +
        "so you can see which side wins.",
      presets: [
        { label: "Minimum 5%", value: 5 },
        { label: "Standard 20%", value: 20 },
        { label: "Local bank 30%", value: 30 }
      ],
      typical: {
        developed: "5–20%. The US and UK both have first-time-buyer products down at 5%, with better " +
          "rates at 20% and above; below that you usually pay mortgage insurance, which this model does " +
          "not include.",
        developing: "20–40%. Kenyan and Nigerian banks commonly want 20–30% and sometimes more, which is " +
          "the real barrier to buying in most of these markets — the deposit, not the repayment."
      }
    },

    rate: {
      q: "What interest rate would the bank charge you?",
      what: "The annual rate on the mortgage, on whatever you still owe. The number banks advertise. It " +
        "is charged monthly here, so you pay a shade more than the headline suggests.",
      why: "Over a twenty-year loan the interest can come to more than the house did. This is also the " +
        "number that most often makes buying lose outright: when the mortgage rate is well above what " +
        "the property appreciates at, the loan eats the gain.",
      presets: [
        { label: "Euro area 4%", value: 4 },
        { label: "US/UK 6.5%", value: 6.5 },
        { label: "Kenya 14%", value: 14 },
        { label: "Nigeria 22%", value: 22 }
      ],
      typical: {
        developed: "Roughly 3–7% in recent years. US 30-year fixed loans have run around 6–7%, UK fixes " +
          "around 4–5%, euro-area loans 3–4%, and Japan close to 1%. Long fixed terms are normal, so the " +
          "rate you sign is often the rate you keep.",
        developing: "10–20% is ordinary and 25%+ happens. Kenya has run in the low-to-mid teens, Nigeria " +
          "above 20%, India 8–9%, Brazil around 10%. Rates are usually variable, so a mortgage there is " +
          "a bet on the central bank as much as on the house."
      }
    },

    term: {
      q: "Over how many years would you repay it?",
      what: "The length of the mortgage. Longer means a smaller monthly payment and far more interest in " +
        "total.",
      why: "Stretching the term makes the monthly payment affordable, which is how most people get into a " +
        "house at all. It also quietly frees up cash each month — and in this model that cash goes into " +
        "the investment pot, so a longer term is not automatically worse.",
      presets: [
        { label: "Short 10", value: 10 },
        { label: "Common 20", value: 20 },
        { label: "US standard 30", value: 30 }
      ],
      typical: {
        developed: "25–30 years is standard, and 35–40 year terms exist in the UK and parts of Europe. " +
          "The US 30-year fixed is the outlier the rest of the world does not really have.",
        developing: "10–20 years, and often capped by your age at the end of the term. Kenyan lenders " +
          "rarely go past 20–25; in several markets 10–15 is the practical maximum."
      }
    },

    closingPct: {
      q: "What does the act of buying cost you?",
      what: "Stamp duty or transfer tax, legal fees, valuation, bank arrangement charges — everything you " +
        "pay to become the owner, as a share of the price. You never get any of it back.",
      why: "This is why buying and selling within a few years usually loses. The purchase costs have to be " +
        "earned back out of appreciation before ownership is even level with renting, and on a short stay " +
        "there is not enough time.",
      presets: [
        { label: "Light 2%", value: 2 },
        { label: "Typical 5%", value: 5 },
        { label: "Heavy 8%", value: 8 }
      ],
      typical: {
        developed: "2–5%. US buyers pay roughly 2–5% in closing costs; UK buyers pay stamp duty on a " +
          "sliding scale plus one to two thousand pounds of fees; but Belgium and parts of Germany can " +
          "reach 10–13% once transfer tax and notary fees are counted.",
        developing: "5–10% is common once stamp duty, legal fees, valuation and search costs are added " +
          "up — Kenya lands around 5–8%. Informal costs on top of the official ones are a real feature " +
          "of several markets and worth padding for."
      }
    },

    /* ---------- plans and the alternative ---------- */
    horizon: {
      q: "How long would you stay before selling?",
      what: "The number of years to compare the two paths over. Everything is measured on the day you " +
        "sell, with both sides cashed in and taxed.",
      why: "This is the most under-rated question here. Buying front-loads its costs and back-loads its " +
        "benefits, so short stays punish buyers hard — the purchase costs have not been earned back yet " +
        "and barely any of the loan is paid down. If you are honestly unsure whether you will still be " +
        "there in five years, that uncertainty is itself an argument for renting.",
      presets: [
        { label: "Short 5", value: 5 },
        { label: "Medium 10", value: 10 },
        { label: "Long 25", value: 25 }
      ],
      typical: {
        developed: "Owners move roughly every 8–15 years — the US median tenure has run around a decade, " +
          "the UK longer. Renters move far more often, which is part of what they are paying for.",
        developing: "Family homes are often held for a generation and passed on rather than sold, which " +
          "makes long horizons realistic. Working in a city you did not grow up in cuts the other way."
      }
    },

    invest: {
      q: "What would the money earn if you invested it instead?",
      what: "The annual return, compounding, on the deposit and on any month where renting works out " +
        "cheaper. Use what you would realistically get, not the best year you can remember.",
      why: "This is the single biggest lever in the whole model. It is what the renter's money is doing " +
        "while the buyer's money sits in a house, and a couple of percentage points here can flip the " +
        "verdict on its own. It is also the number people are most optimistic about.",
      presets: [
        { label: "Bonds 4%", value: 4 },
        { label: "Global equities 7%", value: 7 },
        { label: "Local T-bills 13%", value: 13 }
      ],
      typical: {
        note: "Compare it against inflation, two screens on. A 13% return where inflation is 9% is a " +
          "worse deal than a 7% return where inflation is 2%, and the model does not make that " +
          "adjustment for you.",
        developed: "6–8% a year nominal for a broad global equity index over the long run, 4–5% for " +
          "government bonds, 1–4% for cash. Against 2–3% inflation, that is a real return of roughly " +
          "4–5% on equities.",
        developing: "Local government paper has offered 10–16% in Kenya and Uganda and 18%+ in Nigeria — " +
          "headline numbers that flatter, because inflation and currency depreciation take much of it " +
          "back. Investors with access to offshore funds often use the developed figures instead."
      }
    },

    appr: {
      q: "How fast do you expect the property's value to rise?",
      what: "Annual growth in what the home is worth. Nominal, so it includes general inflation rather " +
        "than sitting on top of it.",
      why: "It is the buyer's whole return outside of not paying rent, and it works on the full value of " +
        "the house rather than only on the part you have paid for. That leverage is what makes buying " +
        "powerful when prices rise — and painful when they don't.",
      presets: [
        { label: "Flat-ish 2%", value: 2 },
        { label: "Steady 4%", value: 4 },
        { label: "Fast 8%", value: 8 }
      ],
      typical: {
        note: "Long-run house prices tend to track inflation plus about a point. Anything much above that " +
          "for decades is a forecast, not a trend.",
        developed: "2–5% a year over long periods, with sharp local exceptions and real falls in some " +
          "decades — Japanese property fell for twenty years. Real growth after inflation is often close " +
          "to 1%.",
        developing: "5–12% nominal is common, but much of it is inflation rather than getting richer. " +
          "Land at the edge of a growing city can do far better; a flat in an area that gets overbuilt " +
          "can do far worse."
      }
    },

    rentGrowth: {
      q: "How fast do rents rise?",
      what: "Annual growth in rent — the one you would pay, or the one you would collect.",
      why: "Rising rent is the buyer's friend: it makes the fixed mortgage payment look better every year " +
        "and pushes up what a let earns. It is also the thing renters cannot control, which is a real " +
        "risk the money in this model does not price.",
      presets: [
        { label: "Slow 2%", value: 2 },
        { label: "Steady 5%", value: 5 },
        { label: "Fast 9%", value: 9 }
      ],
      typical: {
        developed: "2–4% a year, roughly with inflation and wages. Some cities cap increases on sitting " +
          "tenants by law, which effectively slows this down further.",
        developing: "5–10% nominal, in line with higher inflation. Rents in fast-growing cities can jump " +
          "much harder than that in a single year when new demand arrives faster than new buildings."
      }
    },

    inflation: {
      q: "What's general inflation running at?",
      what: "The annual rise in prices. Here it pushes up the insurance premium and the service charge " +
        "over time.",
      why: "It is a small lever inside the model but a big one for reading the result. Every figure on the " +
        "answer screen is in future money, so a big gap after twenty-five years of 10% inflation is worth " +
        "much less than the same gap after twenty-five years of 2%.",
      presets: [
        { label: "Low 2%", value: 2 },
        { label: "Moderate 6%", value: 6 },
        { label: "High 12%", value: 12 }
      ],
      typical: {
        developed: "2–3% is the target most central banks aim at, and roughly what they have delivered " +
          "outside the 2022–23 spike.",
        developing: "5–15% is ordinary. Kenya has run around 5–8%, Uganda a little lower, Nigeria above " +
          "20%, Egypt and Argentina far higher still."
      }
    },

    /* ---------- cost of owning ---------- */
    taxPct: {
      q: "What does the council charge each year?",
      what: "Property tax, land rates, or whatever the local authority calls its annual charge — as a " +
        "share of the property's value.",
      why: "It is small each year and never stops, which makes it larger over a long hold than people " +
        "expect. In high-property-tax places it can be the difference between a let making money and not.",
      presets: [
        { label: "Minimal 0.1%", value: 0.1 },
        { label: "Modest 0.5%", value: 0.5 },
        { label: "US-style 1.5%", value: 1.5 }
      ],
      typical: {
        developed: "0.3–2.2% of value a year in the US depending on the state — New Jersey and Texas at " +
          "the top, Hawaii at the bottom. The UK charges council tax on a banded flat amount instead, " +
          "which for an average home works out under 1%.",
        developing: "0.05–0.5%, often assessed on land value only and frequently under-collected. Kenyan " +
          "land rates are typically a fraction of a percent of the unimproved site value."
      }
    },

    insurance: {
      q: "What does insuring it cost a year?",
      what: "Buildings insurance — the policy a lender will insist on. Per year.",
      why: "A minor line, included so the ownership side is not flattered by leaving out a bill that " +
        "genuinely arrives. It rises with inflation over the years you hold the place.",
      presets: [
        { label: "0.2% of price", value: function(V){ return V.price * 0.002; } },
        { label: "0.4% of price", value: function(V){ return V.price * 0.004; } }
      ],
      typical: {
        developed: "Roughly 0.2–0.5% of the property's value a year, and much more in flood or wildfire " +
          "zones — Florida and California premiums have moved sharply.",
        developing: "0.2–0.6%, though many owner-occupiers carry no cover at all unless a lender requires " +
          "it. If you would genuinely go uninsured, put 0 in and accept that the risk is real."
      }
    },

    maintPct: {
      q: "What do repairs and upkeep cost a year?",
      what: "Everything that wears out or breaks, as a share of the property's value per year. The old " +
        "rule of thumb is 1%.",
      why: "This is the cost renters simply do not have, and the one first-time buyers underestimate most " +
        "reliably. On a long hold it adds up to a substantial share of what the house cost.",
      presets: [
        { label: "New build 0.5%", value: 0.5 },
        { label: "Rule of thumb 1%", value: 1 },
        { label: "Older place 2%", value: 2 }
      ],
      typical: {
        developed: "1% of value a year is the standard planning figure, and 1–2% for older housing stock. " +
          "Labour is the expensive part, so the same repair costs far more than the materials suggest.",
        developing: "1–2% of value, with the balance reversed — labour is cheap, materials are imported " +
          "and expensive, and build quality varies enough that a new block can need work early."
      }
    },

    hoa: {
      q: "What's the monthly service charge?",
      what: "What the block or estate charges each month for security, grounds, water, lifts and common " +
        "lighting. Put 0 for a standalone house with no shared costs.",
      why: "It is a fixed monthly cost that behaves like rent you keep paying after the mortgage is gone, " +
        "and in gated developments it can be a serious number. It also rises with inflation.",
      typical: {
        note: "Ask for the actual figure before buying anywhere with shared facilities — it is one of the " +
          "few costs here that a seller can tell you exactly.",
        developed: "US condo and HOA fees commonly run US$200–600 a month and much more in buildings with " +
          "concierge or a pool. UK leasehold service charges of £1,500–£3,000 a year are ordinary.",
        developing: "Gated estates and apartment blocks charge for the things the state may not reliably " +
          "provide — private security, water storage and a generator — which makes the charge relatively " +
          "large next to the rent. Nairobi blocks often run KES 5,000–15,000 a month."
      }
    },

    sellPct: {
      q: "What does selling cost?",
      what: "Agent commission and legal fees when you sell, as a share of the sale price.",
      why: "It comes off the top of everything the property earned, on the last day. Together with the " +
        "purchase costs it is the round-trip toll on ownership, and it is why the crossover year exists " +
        "at all.",
      presets: [
        { label: "Low 1.5%", value: 1.5 },
        { label: "Typical 3%", value: 3 },
        { label: "US-style 6%", value: 6 }
      ],
      typical: {
        developed: "5–6% in the US, traditionally split between the two agents, though that convention is " +
          "loosening. The UK is far cheaper at roughly 1–3% including legal fees.",
        developing: "3–6% in commission, plus legal costs. Selling can also take a long time, which is a " +
          "cost this model does not charge you for."
      }
    },

    /* ---------- tax ---------- */
    marginal: {
      q: "What's your income tax rate on the top slice of your income?",
      what: "Your marginal rate — the tax you'd pay on one more unit of income. If you're letting, it " +
        "taxes the profit left after interest and running costs. If you'd live in it, it sets what any " +
        "mortgage interest relief is worth to you.",
      why: "For a landlord this is the difference between a good yield and a mediocre one. For an " +
        "owner-occupier it only matters if your country still gives relief on mortgage interest — many " +
        "no longer do.",
      presets: [
        { label: "Basic 20%", value: 20 },
        { label: "Common top 30%", value: 30 },
        { label: "High 45%", value: 45 }
      ],
      typical: {
        developed: "Top marginal rates of 20–45% on employment income, reached at very different levels " +
          "of income — the UK hits 40% far earlier in the income scale than the US hits 32%.",
        developing: "Top rates of 25–35% are typical: Kenya 30–35%, Uganda 30–40%, India 30% plus " +
          "surcharges. Enforcement on rental income specifically is patchy, but the legal rate is what " +
          "belongs in a model."
      }
    },

    reliefCap: {
      q: "How much mortgage interest can you deduct from your income each year?",
      what: "The most interest you can knock off your taxable income in a year. Set it to 0 if your " +
        "country does not give owner-occupiers this relief — most do not.",
      why: "Where it exists it is a genuine subsidy for buying, worth the cap times your tax rate every " +
        "year. Where it does not, leaving a number in here quietly makes buying look better than it is.",
      presets: [
        { label: "No relief", value: 0 }
      ],
      typical: {
        note: "This one is worth checking rather than guessing — it is unusually binary. Either your " +
          "country gives it or it does not.",
        developed: "The US allows interest on up to US$750,000 of mortgage debt to be itemised, though " +
          "most filers take the standard deduction instead. The Netherlands and Belgium still give " +
          "generous relief; the UK abolished it for owner-occupiers in 2000 and restricted it for " +
          "landlords in 2020.",
        developing: "Kenya allows a capped deduction for owner-occupier mortgage interest — KES 300,000 " +
          "a year, which is where this default comes from. Many other markets give nothing at all."
      }
    },

    cgt: {
      q: "What tax would you pay on the profit when you sell the home?",
      what: "Capital gains tax, charged only on what you sell for above what you paid — not on the whole " +
        "price. Set it to 0 if a home you live in is exempt where you are, which is common.",
      why: "On a long hold, the gain can be the largest number on the ownership side, so the rate applied " +
        "to it matters. An exemption for your own home is one of the biggest advantages buying has, " +
        "where it exists.",
      presets: [
        { label: "Exempt 0%", value: 0 },
        { label: "Moderate 15%", value: 15 },
        { label: "High 28%", value: 28 }
      ],
      typical: {
        developed: "Most rich countries exempt your main home in some form — the US excludes the first " +
          "US$250,000 of gain (US$500,000 for a couple), and the UK exempts a main residence entirely. " +
          "Rates on second homes and lets run 18–28%.",
        developing: "Kenya charges 15% on property gains, Nigeria 10%, Uganda 30% but with an exemption " +
          "for a home you have lived in for at least two years. Exemptions for a primary residence are " +
          "common but not universal."
      }
    },

    cgtInvest: {
      q: "And what tax would you pay on the investments?",
      what: "The tax on the growth of the money the renter invested, charged when it is cashed in. Its " +
        "own rate, not the property one — a home can be tax-free while a fund is not.",
      why: "Leaving this at zero while taxing the property would hand the renting side an advantage it " +
        "doesn't have, and the whole point of this comparison is that both sides get the same treatment. " +
        "Set it to 0 only if the money would genuinely sit in a sheltered account.",
      presets: [
        { label: "Sheltered 0%", value: 0 },
        { label: "Withholding 15%", value: 15 },
        { label: "Full rate 25%", value: 25 }
      ],
      typical: {
        note: "Tax-sheltered wrappers are the thing to check here — a UK ISA, a US 401(k) or IRA, or a " +
          "pension almost anywhere. Money inside one is genuinely at 0%.",
        developed: "Long-term capital gains run 0–20% federally in the US plus state tax; the UK charges " +
          "18–24% outside an ISA. Retirement accounts are the standard way this becomes zero.",
        developing: "Withholding tax on interest and dividends of 10–20% is the norm — 15% in Kenya and " +
          "Uganda — and it is usually taken before you ever see the money, rather than charged on exit."
      }
    }
  },

  /* ===================== the answer screen ===================== */
  outcome: function(engine, s){
    var gap = s.finalBuy - s.finalRent;
    var buying = gap >= 0;
    var amt = engine.fmt(Math.abs(gap));
    var yrs = engine.V.horizon + (engine.V.horizon === 1 ? " year" : " years");
    var live = engine.mode === "live";

    var headline = (buying
      ? '<span class="b">' + (live ? "Buy" : "Buy the let") + "</span>"
      : '<span class="r">' + (live ? "Rent" : "Invest instead") + "</span>") +
      ", by " + amt + " over " + yrs + ".";

    var sub;
    if(live){
      sub = buying
        ? "Owning leaves you <b>" + amt + "</b> better off by year " + engine.V.horizon +
          ", after selling costs and tax. " +
          (s.breakEven ? "You cross over in <b>year " + s.breakEven + "</b> — leave earlier and buying loses."
                       : "")
        : "Renting and investing the difference leaves you <b>" + amt + "</b> ahead by year " +
          engine.V.horizon + ". " +
          (s.breakEven ? "" : "At these assumptions the two lines never cross.");
    } else {
      sub = buying
        ? "The rental property beats putting the same money in the market by <b>" + amt + "</b>. " +
          (s.breakEven ? "It turns positive in <b>year " + s.breakEven + "</b>." : "")
        : "The same cash in the market beats the rental property by <b>" + amt + "</b> — the rent " +
          "collected doesn't cover the cost of the money.";
    }

    var lead = buying ? (live ? "Buying" : "The let") : (live ? "Renting and investing" : "The market");
    var short = "<b class=\"" + (buying ? "b" : "r") + "\">" + lead + "</b> is ahead by <b>" + amt +
      "</b> after " + yrs + ".";

    var warn = null;
    if(engine.V.horizon <= 3){
      warn = "<b>That is a very short stay.</b> Purchase and selling costs have barely any time to be " +
        "earned back, so buying is being judged at its worst. If you might stay longer, try the horizon " +
        "question again.";
    }

    return {
      headline: headline, sub: sub, short: short, warn: warn,
      labelA: live ? "Buy" : "Buy the let",
      labelB: live ? "Rent & invest the difference" : "Same money in the market",
      series: s.series.map(function(p){ return { y: p.y, a: p.buy, b: p.rent }; }),
      breakEven: s.breakEven,
      tiles: [
        { k: "Monthly repayment", v: engine.fmt(s.payment),
          s: "On " + engine.fmt(s.loan) + " over " + engine.V.term + " years" },
        { k: "Cash needed on day one", v: engine.fmt(s.upfront),
          s: "Deposit plus purchase costs" },
        { k: "Interest over the loan", v: engine.fmt(s.loanInterest),
          s: engine.pctS(s.loanInterest / Math.max(1, s.loan) * 100) + " of what you borrowed" },
        { k: "Gap at year " + engine.V.horizon, v: (gap >= 0 ? "+" : "−") + amt,
          s: gap >= 0 ? "in favour of buying" : "in favour of renting" }
      ]
    };
  }
};

return GUIDE;
});
