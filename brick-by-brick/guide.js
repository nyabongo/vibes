/* The editorial half of the walkthrough at /brick-by-brick/ — the page this
 * calculator opens on.
 *
 * Same shape as the other two guides: shared/wizard.js holds the machinery,
 * this holds the words. Every input model.js has gets a plain-language
 * question, what it is, why it moves the answer, and what it typically runs to
 * in a developed and in a developing market. Ranges and defaults come from the
 * engine and are never restated here.
 *
 * This tool is the odd one out of the three, because the thing it describes —
 * building a house slowly out of salary, with no mortgage on offer — is
 * ordinary across much of the world and almost unknown in the countries most
 * financial writing is about. The developed-market column often says so
 * plainly rather than inventing an equivalent.
 */
(function(root, factory){
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.BrickByBrickGuide = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function(){
"use strict";

function yrS(y){ return (Math.round(y * 10) / 10) + (y === 1 ? " year" : " years"); }

var GUIDE = {
  title: "Brick by brick",

  intro: {
    question: "Should you build a home a bit at a time, or rent and invest instead?",
    what: "Where mortgages are scarce or brutally expensive, people build out of salary — a plot one " +
      "year, a foundation the next, a roof when the money allows. It works. It also ties up years of " +
      "savings in something that houses nobody until it's far enough along, while construction costs " +
      "keep climbing. This walks you through whether the race is winnable.",
    how: [
      "<b>One question per screen.</b> Each says what it is and why it matters before it asks you for anything.",
      "<b>Skip anything you don't know.</b> Every question already has a sensible number in it, and skipping keeps that number — the answer screen shows which ones you left alone.",
      "<b>The race is the whole story.</b> Your salary grows at one rate and cement gets dearer at another. If cement wins, the house is never finished, and the calculator will tell you so.",
      "<b>Nothing leaves your browser.</b> No account, no server — your answers live in the address bar, so you can bookmark or share the link."
    ]
  },

  aiIntro: [
    "I'm deciding whether to build a house gradually out of my salary while renting, or to keep",
    "renting and invest the money instead. Help me fill in this guided calculator:"
  ],

  modeLabel: "How the build is paid for",

  disclaimer:
    "<b>How this works.</b> Both paths start with the same savings and the same monthly surplus. One " +
    "buys a plot as soon as it can afford one and puts every spare shilling into construction; the " +
    "other leaves the lot invested and keeps renting. Rent stops when you move in. At the end, the " +
    "house and plot are sold less selling costs and tax, against the investment pot on the same terms." +
    "<br><br><b>Not modelled:</b> borrowing of any kind, a sacco or chama loan, help from family, the " +
    "cost of a build going wrong badly enough to redo, and the very real possibility of a title dispute. " +
    "Nor the deposit-and-rent-in-advance cycle that makes moving expensive." +
    "<br><br><b>This is a model, not advice.</b> It does not price the security of a home nobody can " +
    "evict you from, which is most of why people do this.",

  steps: [
    {
      id: "strategy", kind: "mode", section: "How you'd do it",
      question: "Would you build as the money comes in, or save up first and build in one go?",
      what: "Two genuinely different strategies. Building as you go gets you out of rent sooner but " +
        "leaves a half-built house standing in the weather for years. Saving first keeps the money " +
        "compounding and builds fast at the end — but you pay rent the entire time.",
      why: "This is the biggest structural choice in the whole calculator, and it changes which " +
        "questions you get asked. Building as you go asks when you would move in and how fast an " +
        "unfinished shell deteriorates. Saving first asks how much you would bank before breaking " +
        "ground and how long the final push takes.",
      options: [
        { value: "asyougo", label: "Build as you go",
          blurb: "Buy the plot, break ground, and put in whatever you have each month for as long as it takes." },
        { value: "savefirst", label: "Save first, then build",
          blurb: "Leave it compounding until a set share of the cost is in hand, then build in one short push." }
      ]
    },

    { id: "savings",  section: "What you're working with", keys: ["savings"] },
    { id: "monthly",  section: "What you're working with", keys: ["saveMonthly"] },
    { id: "income-growth",    section: "What you're working with", keys: ["incomeGrowth"] },

    { id: "plot",     section: "The plot", keys: ["landCost", "landFeesPct"],
      title: "What does the land cost?",
      blurb: "The plot, and everything you pay to have it put in your name. In this model the plot is " +
        "bought as soon as you can afford it — which is not necessarily in month one." },

    { id: "house",    section: "The house", keys: ["sqm", "costPerSqm"],
      title: "How big a house, and what does it cost to build?",
      blurb: "Size times the rate per square metre is the shell-to-finished cost, at today's prices. " +
        "Everything after this is a percentage of that number." },
    { id: "extras",   section: "The house", keys: ["permitsPct", "wastagePct"],
      title: "What gets added on top?",
      blurb: "Two percentages that are easy to leave out of a plan and impossible to leave out of a " +
        "build. Together they routinely add a fifth to what you thought the house would cost." },
    { id: "build-inflation", section: "The house", keys: ["buildInflation"] },

    { id: "move-in",   section: "Building as you go", keys: ["moveInAt", "decayPct"],
      title: "When would you move in, and what does waiting cost the shell?",
      blurb: "Almost nobody waits for a finished house. Moving in early stops the rent, which is the " +
        "single biggest swing in this model — and the part still unfinished carries on around you." },
    { id: "save-first",     section: "Saving first", keys: ["startAt", "pushMonths"],
      title: "How much would you bank before breaking ground?",
      blurb: "The threshold you save to before starting, and how long the build takes once you do. " +
        "Under this strategy you only move in when the house is finished." },

    { id: "rent",     section: "Renting now", keys: ["rent"] },
    { id: "rent-growth", section: "Renting now", keys: ["rentGrowth"] },

    { id: "running-costs",   section: "Once you move in", keys: ["ownCost", "maintPct", "inflation"],
      title: "What does owning it cost every month?",
      blurb: "The bills a rental quietly included, plus the repairs that are now yours. All three have " +
        "sensible defaults, so skip the screen if you would only be guessing." },

    { id: "appreciation",   section: "What it's worth", keys: ["apprec"] },
    { id: "worth",    section: "What it's worth", keys: ["finishedValuePct", "partBuiltPct"],
      title: "What would the house actually fetch?",
      blurb: "What it cost to build and what somebody will pay for it are different numbers — and an " +
        "unfinished house is worth far less than the money standing in it." },

    { id: "invest",   section: "The alternative", keys: ["invest"] },
    { id: "investment-costs",     section: "The alternative", keys: ["investTax", "investFee"],
      title: "What comes off that return before you see it?",
      blurb: "The investing side has to be charged its own costs, or the comparison is rigged." },

    { id: "horizon",  section: "Getting out", keys: ["horizon"] },
    { id: "exit-costs",     section: "Getting out", keys: ["sellPct", "cgt"],
      title: "And if you sold at the end?",
      blurb: "Both paths are cashed in on the last day so the two are compared on equal terms. Most " +
        "people building a family home never sell — read this as a scoreboard, not a plan." }
  ],

  fields: {

    savings: {
      q: "How much have you got saved right now?",
      what: "The money you have today. Both paths start from this same figure — one buys a plot with it, " +
        "the other invests it.",
      why: "It decides how soon the plot becomes affordable, and land is appreciating while you save for " +
        "it. Starting with too little against a rising land price is one of the ways this plan quietly " +
        "fails: the plot moves away faster than the savings catch up.",
      typical: {
        note: "Only count money you would genuinely commit. An emergency fund you would spend on a " +
          "hospital bill is not construction money.",
        developed: "Buyers usually save towards a deposit rather than a whole plot, because a mortgage " +
          "covers the rest. A 10% deposit on a median home is the common target.",
        developing: "Enough for a plot is the usual first milestone, and it often takes years — plots in " +
          "commuter areas around Nairobi and Kampala run from a few million shillings upwards, and prices " +
          "move with each new road."
      }
    },

    saveMonthly: {
      q: "How much can you put aside each month?",
      what: "What is left over every month on top of the rent you already pay. This is the money that " +
        "either becomes bricks or becomes a portfolio.",
      why: "It is the engine of the whole plan. It sets how fast the house goes up, and whether it goes " +
        "up faster than construction costs rise. Halve this number and the house does not take twice as " +
        "long — it can take forever, because the target is moving too.",
      typical: {
        note: "Be honest rather than aspirational. A plan built on a saving rate you have never actually " +
          "hit will finish the house on paper and nowhere else.",
        developed: "Household saving rates typically run 5–15% of income, and a mortgage substitutes for " +
          "most of it — the bank fronts the money and you repay from the same monthly surplus.",
        developing: "Building households often push 20–40% of income into construction for years at a " +
          "time, which is a real sacrifice and the main reason this route works at all."
      }
    },

    incomeGrowth: {
      q: "How fast does your income grow?",
      what: "Annual growth in what you earn, and therefore in what you can put aside each month.",
      why: "This is one half of the race that decides everything here. Set it against construction " +
        "inflation a few screens on: if your salary grows slower than cement does, every year the " +
        "remaining house costs more months of work than it did the year before, and the finish line " +
        "moves away from you.",
      presets: [
        { label: "Flat 2%", value: 2 },
        { label: "Steady 7%", value: 7 },
        { label: "Fast 12%", value: 12 }
      ],
      typical: {
        developed: "2–4% a year nominal for someone staying in the same role — roughly inflation plus a " +
          "little. Real wage growth has been close to zero for long stretches.",
        developing: "5–10% nominal is common, but much of it is inflation rather than getting better off. " +
          "Compare it to the inflation figure you set later before feeling good about it."
      }
    },

    landCost: {
      q: "What does the plot cost?",
      what: "The asking price of the piece of land you would build on.",
      why: "It is the first and largest lump, and until it is paid there is nowhere to build. In this " +
        "model land keeps appreciating from day one, including while you are still saving for it — which " +
        "is exactly how a plot that was affordable three years ago stops being so.",
      typical: {
        note: "Price a plot you could actually build on: with a road to it, with a title, and zoned for a " +
          "house. Cheap land is usually cheap for a reason.",
        developed: "Individual serviced plots are rare outside rural areas; most new houses are built by " +
          "developers on land they assembled. Where self-build exists, the plot is often 30–50% of the " +
          "total.",
        developing: "Buying a plot and building on it is the normal route to a house. Land near a growing " +
          "city can appreciate at 10%+ a year, which rewards buying early and punishes saving slowly."
      }
    },

    landFeesPct: {
      q: "What do the survey, transfer and legal work cost?",
      what: "Stamp duty, surveyor, transfer and lawyer, as a share of the plot price. None of it comes " +
        "back.",
      why: "A modest percentage on a large lump, paid at the worst possible moment — the same month your " +
        "savings are emptied into the land. It is also the part of a land purchase people most often " +
        "forget to budget for.",
      presets: [
        { label: "Light 4%", value: 4 },
        { label: "Typical 8%", value: 8 },
        { label: "Heavy 12%", value: 12 }
      ],
      typical: {
        developed: "2–5% in most systems, and 10%+ in countries with high transfer taxes and notary " +
          "fees, such as Belgium and parts of Germany.",
        developing: "5–12% once stamp duty, search fees, surveyor and lawyer are counted. Verifying a " +
          "title properly costs money and is the last place to economise."
      }
    },

    sqm: {
      q: "How big a house are you building?",
      what: "Floor area in square metres. A modest three-bedroom bungalow is around 120.",
      why: "Cost scales almost directly with size, so this is the easiest lever you personally control. " +
        "Twenty square metres less is a year less of saving, and a year less of paying rent while you " +
        "wait.",
      presets: [
        { label: "Compact 80", value: 80 },
        { label: "Three-bed 120", value: 120 },
        { label: "Large 200", value: 200 }
      ],
      typical: {
        developed: "New homes average around 200 m² in the US and Australia, roughly 100 m² in the UK — " +
          "which has some of the smallest new housing in the rich world — and 110–140 m² across much of " +
          "western Europe.",
        developing: "Self-built family houses commonly run 80–150 m², frequently designed so a wing or a " +
          "second floor can be added later when money allows. Building in phases like that is exactly " +
          "what this calculator is modelling."
      }
    },

    costPerSqm: {
      q: "What does building cost per square metre?",
      what: "Shell, roof, finishes and services, at today's prices, for one square metre of finished " +
        "house.",
      why: "Multiplied by the size, this is the mountain you are climbing. It is also the number a local " +
        "quantity surveyor or a neighbour who has just finished a build can tell you far better than any " +
        "website.",
      typical: {
        note: "Ask two or three people who have built recently in the same area, and take the highest " +
          "answer. Nobody remembers the overruns.",
        developed: "Roughly US$1,500–3,500 per square metre for a standard new house, dominated by " +
          "labour, and materially more for anything architect-designed.",
        developing: "Roughly US$250–700 per square metre depending on finish level. In Kenya that is " +
          "commonly quoted as KES 35,000–60,000 per square metre, and in Uganda around UGX 1.2–2.0 " +
          "million. Materials rather than labour are the bulk of it, which is why the exchange rate " +
          "matters."
      }
    },

    permitsPct: {
      q: "What do plans, approvals and supervision cost?",
      what: "Architect, structural engineer and local authority approvals, as a share of build cost.",
      why: "Supervision especially is the money that keeps the next number — wastage and theft — from " +
        "running away. Skipping it is the classic false economy on a self-managed site.",
      presets: [
        { label: "Minimal 3%", value: 3 },
        { label: "Typical 6%", value: 6 },
        { label: "Full service 12%", value: 12 }
      ],
      typical: {
        developed: "10–15% of build cost with a full professional team and building control, and self-build " +
          "is heavily regulated in most of these countries.",
        developing: "3–8% is common, with plans drawn by a technician rather than a registered architect " +
          "on smaller houses. Paying for real supervision is usually the best-value line in the budget."
      }
    },

    wastagePct: {
      q: "How much gets wasted, stolen or done twice?",
      what: "Materials that walk off site, spoilage, and work redone because it was wrong the first time.",
      why: "This is the tax on managing your own build from a day job. It is invisible in a plan and " +
        "unmissable in a bank balance, and it is the main thing a paid site supervisor is buying you " +
        "protection from.",
      presets: [
        { label: "Tight site 5%", value: 5 },
        { label: "Typical 10%", value: 10 },
        { label: "Loose 20%", value: 20 }
      ],
      typical: {
        developed: "3–8% on a contracted site, and it is the contractor's problem rather than yours " +
          "under a fixed-price agreement.",
        developing: "10–20% is realistic for a self-managed build where the owner visits at weekends. " +
          "Cement, steel and iron sheets are the things that go missing, and they are the expensive parts."
      }
    },

    buildInflation: {
      q: "How fast are construction costs rising?",
      what: "Annual inflation on cement, steel, iron sheets and labour.",
      why: "This is the other half of the race. Every month of a slow build is a month during which the " +
        "unfinished part gets more expensive. If this number sits above your income growth, the house " +
        "recedes as you walk towards it — and the answer screen will say so outright.",
      presets: [
        { label: "Calm 3%", value: 3 },
        { label: "Typical 8%", value: 8 },
        { label: "Sharp 15%", value: 15 }
      ],
      typical: {
        developed: "2–5% a year in normal times, with a sharp spike in 2021–22 when supply chains and " +
          "energy prices moved together.",
        developing: "6–15%, and it can jump much harder in a year the currency slides, because cement, " +
          "steel and roofing are largely imported or priced against imports."
      }
    },

    moveInAt: {
      q: "How finished does it have to be before you move in?",
      what: "The share of the house that must be complete before you stop renting and move in. " +
        "Finishing carries on around you afterwards.",
      why: "It is the biggest single swing in this model, because moving in stops the rent. Somebody who " +
        "moves into a roofed, plastered, one-bathroom house at 60% done and finishes the rest over four " +
        "years is running a completely different plan from somebody who waits for the last tile.",
      presets: [
        { label: "Early 55%", value: 55 },
        { label: "Typical 70%", value: 70 },
        { label: "Finished 100%", value: 100 }
      ],
      typical: {
        note: "Be realistic about what is habitable: water, a working bathroom, a roof that does not " +
          "leak, and enough security to sleep in.",
        developed: "Building control usually will not let you occupy a house without a completion " +
          "certificate, so this is close to 100% by law rather than by choice.",
        developing: "Moving in at 60–80% is completely normal and often the plan from the start — the " +
          "family occupies the finished rooms while the rest waits for money. It is the single most " +
          "effective thing you can do to make this route work."
      }
    },

    decayPct: {
      q: "How fast does an unfinished house deteriorate?",
      what: "Annual loss in value on the part-built structure while it stands waiting for the next " +
        "phase.",
      why: "Walls without a roof do not hold their value through two rainy seasons. This charges the " +
        "slow build for the thing that actually happens to slow builds — and it is why stopping at " +
        "roof level costs less than stopping at wall plate.",
      presets: [
        { label: "Sheltered 1%", value: 1 },
        { label: "Typical 3%", value: 3 },
        { label: "Exposed 8%", value: 8 }
      ],
      typical: {
        note: "The fix is sequencing, not money: getting a roof on early protects everything underneath " +
          "it and is why most experienced self-builders prioritise it.",
        developed: "Rarely relevant, because building control and lenders both push a build to finish " +
          "within a set period.",
        developing: "Half-built structures standing for years are a common sight, and the damage is real " +
          "— rusting reinforcement bar, eroded mortar, and blockwork that has to be taken down and " +
          "rebuilt."
      }
    },

    startAt: {
      q: "How much of the cost do you want in hand before breaking ground?",
      what: "A share of the total build cost. Above 100% means the whole house is paid for before the " +
        "first block is laid.",
      why: "Saving longer means the money compounds longer and the build itself runs shorter, which cuts " +
        "wastage and deterioration. It also means paying rent for all those extra years, which is the " +
        "cost of the discipline.",
      presets: [
        { label: "Half 50%", value: 50 },
        { label: "Most 70%", value: 70 },
        { label: "All of it 100%", value: 100 }
      ],
      typical: {
        note: "Bear in mind that the target is moving: while you save, construction inflation is lifting " +
          "the cost you are saving a share of.",
        developed: "Self-build lenders release money in stages against valuations, so the equivalent " +
          "question is how much deposit the lender wants — typically 20–25%.",
        developing: "Saving to 60–80% before starting is a common discipline precisely because a build " +
          "that stalls halfway is the outcome everyone has watched a relative live through."
      }
    },

    pushMonths: {
      q: "How long does the build itself take, once you start?",
      what: "Months from breaking ground to a finished house, in the short concentrated push this " +
        "strategy is built around.",
      why: "A short push is the whole advantage of saving first: fewer months of exposure, less theft, " +
        "less deterioration and less construction inflation eating the remaining work. Running out of " +
        "money mid-push does not stop it, it just slows it down.",
      presets: [
        { label: "Fast 8", value: 8 },
        { label: "Typical 12", value: 12 },
        { label: "Slow 24", value: 24 }
      ],
      typical: {
        developed: "6–12 months for a standard new house with a contractor on a fixed-price contract.",
        developing: "9–18 months is realistic for a well-funded build with a contractor on site " +
          "continuously, and longer where the work is stop-start."
      }
    },

    rent: {
      q: "What rent do you pay now?",
      what: "Per month, for where you live today. It stops the month you move into the new house.",
      why: "It is the single biggest swing in this calculator. Every month before you move in is a month " +
        "of rent paid on top of everything you are putting into the build — and the whole case for " +
        "moving in early rests on it.",
      typical: {
        note: "Use what you actually pay, not what a comparable house would cost. This side of the model " +
          "is about your real outgoings.",
        developed: "Rent commonly takes 25–40% of take-home pay in large cities, which is what makes " +
          "saving for anything else so hard.",
        developing: "Formal-sector renters in African and South Asian cities often pay 20–40% of income " +
          "too, and a landlord may ask for several months up front — a cost this model does not charge " +
          "you for."
      }
    },

    rentGrowth: {
      q: "How fast does your rent rise?",
      what: "Annual growth in the rent you pay while you are still building.",
      why: "It compounds the cost of a slow build. Every extra year before you move in costs more than " +
        "the year before it did, which quietly pushes the answer towards moving in earlier.",
      presets: [
        { label: "Slow 2%", value: 2 },
        { label: "Steady 6%", value: 6 },
        { label: "Fast 12%", value: 12 }
      ],
      typical: {
        developed: "2–4% a year, and capped by law for sitting tenants in several countries.",
        developing: "5–10% nominal, and increases are often applied in one jump at renewal rather than " +
          "gradually."
      }
    },

    ownCost: {
      q: "What does running the place cost once you own it?",
      what: "Per month: ground rent, security, water, rubbish collection — the things a rental quietly " +
        "included in the rent.",
      why: "Moving in does not take your housing costs to zero, and treating it as though it does is the " +
        "most flattering possible assumption about owning. This is the honest residue.",
      typical: {
        developed: "Council tax or property tax, utilities and buildings insurance carry on regardless " +
          "of the mortgage — commonly a few hundred a month before any repairs.",
        developing: "Security, water delivery or pumping, and rubbish collection are often paid privately " +
          "and directly, which makes them more visible than in a rich-country household budget."
      }
    },

    maintPct: {
      q: "What do repairs and upkeep cost each year?",
      what: "As a share of what the house is worth, per year. The old rule of thumb is 1%.",
      why: "Once you own it, everything that breaks is yours. On a house you built yourself, the early " +
        "years can be worse than the rule of thumb suggests — snagging that a developer would have " +
        "carried is now your bill.",
      presets: [
        { label: "New build 0.5%", value: 0.5 },
        { label: "Rule of thumb 1%", value: 1 },
        { label: "Hard-worn 2%", value: 2 }
      ],
      typical: {
        developed: "1% of value a year is the standard figure, more for older housing. Labour dominates " +
          "the cost.",
        developing: "1–2% of value, with the balance reversed: labour is cheap, imported fittings are " +
          "not."
      }
    },

    inflation: {
      q: "What's general inflation running at?",
      what: "The annual rise in prices. Here it pushes up the running costs on the previous two " +
        "questions.",
      why: "A small lever inside the model and a big one for reading the result. Every figure on the " +
        "answer screen is in future money, so a large gap after twenty-five years of 10% inflation is " +
        "worth far less than the same gap after twenty-five years of 2%.",
      presets: [
        { label: "Low 2%", value: 2 },
        { label: "Moderate 6%", value: 6 },
        { label: "High 12%", value: 12 }
      ],
      typical: {
        developed: "2–3% is what most central banks target and roughly what they deliver outside a shock.",
        developing: "5–15% is ordinary — Kenya around 5–8%, Uganda a little lower, Nigeria above 20%."
      }
    },

    apprec: {
      q: "How fast do land and houses appreciate where you'd build?",
      what: "Annual growth in the value of the plot from day one — including while you are still saving " +
        "to buy it — and of the house once it exists.",
      why: "It cuts both ways here, which is unusual. Fast appreciation makes the finished house worth " +
        "more, but it also makes the plot more expensive to reach in the first place. Set it high enough " +
        "against thin savings and the land simply never becomes affordable.",
      presets: [
        { label: "Flat-ish 2%", value: 2 },
        { label: "Steady 5%", value: 5 },
        { label: "Fast 10%", value: 10 }
      ],
      typical: {
        developed: "2–5% a year over long periods, with real growth after inflation often near 1%.",
        developing: "5–12% nominal is common and land at the edge of a growing city can do considerably " +
          "better, particularly when a road or a power line arrives. Much of it is inflation rather than " +
          "getting richer."
      }
    },

    finishedValuePct: {
      q: "What's the finished house worth, against what it cost to build?",
      what: "A share of the total build cost. Above 100% means you captured the margin a developer would " +
        "otherwise have taken.",
      why: "Self-builders normally do beat their own cost, because they are not paying a developer's " +
        "profit. But an unusual house, an awkward plot or a fashion that has moved on can leave it worth " +
        "less than it cost — which is a real risk and worth modelling honestly.",
      presets: [
        { label: "Below cost 85%", value: 85 },
        { label: "At cost 100%", value: 100 },
        { label: "Good margin 120%", value: 120 }
      ],
      typical: {
        developed: "Self-builders commonly target 110–130% of cost, and lenders often want to see that " +
          "margin before releasing staged funds.",
        developing: "100–120% is a fair expectation in an area with real demand. Highly personalised " +
          "houses and plots without clean title sell for less, sometimes much less."
      }
    },

    partBuiltPct: {
      q: "And what would an unfinished house fetch?",
      what: "A share of the work standing in it, priced at what that work would cost today. Walls with " +
        "no roof are not an asset at cost.",
      why: "It only matters if the horizon ends before the house is done — but that is exactly the case " +
        "the model exists to warn you about. Setting it high hides the cost of a stalled build; setting " +
        "it low is closer to what half-finished structures actually sell for.",
      presets: [
        { label: "Fire sale 40%", value: 40 },
        { label: "Typical 65%", value: 65 },
        { label: "Nearly whole 90%", value: 90 }
      ],
      typical: {
        note: "The buyer for a half-built house is another builder, and they will price in the risk of " +
          "what is hidden inside the work you have already done.",
        developed: "Rarely tested, because a stalled self-build is usually finished by a lender or a " +
          "contractor rather than sold as-is.",
        developing: "Discounts of 30–50% against the money sunk in are common. There are far more " +
          "half-built structures than there are buyers for them."
      }
    },

    invest: {
      q: "What would the money earn if you invested it instead?",
      what: "The annual return, compounding, on the savings and the monthly surplus if you kept renting " +
        "and invested them. Before the tax and fees on the next screen.",
      why: "This is the bar the house has to clear, and it is the biggest lever in the model. In markets " +
        "where government paper pays low double digits, that safe alternative is a genuinely hard thing " +
        "for a slow, risky build to beat.",
      presets: [
        { label: "Bonds 6%", value: 6 },
        { label: "Global equities 9%", value: 9 },
        { label: "Local T-bills 14%", value: 14 }
      ],
      typical: {
        note: "Read it against inflation and against how fast building costs are rising. A 14% return " +
          "does not help much when cement is inflating at 12%.",
        developed: "6–8% a year nominal for a broad global equity index over the long run, 4–5% for " +
          "government bonds.",
        developing: "Ugandan and Kenyan treasury bonds have run in the low-to-mid teens, Nigerian paper " +
          "higher still. The headline is flattering: inflation and currency depreciation take much of it " +
          "back, and this default sits at 14% for exactly that reason."
      }
    },

    investTax: {
      q: "What tax comes off those returns?",
      what: "Withholding tax taken before you are paid.",
      why: "Taxing the house at the end while leaving the investments untaxed would rig the comparison. " +
        "This is the investing side paying its own dues.",
      presets: [
        { label: "Sheltered 0%", value: 0 },
        { label: "Withholding 15%", value: 15 },
        { label: "Full rate 30%", value: 30 }
      ],
      typical: {
        developed: "0% inside a pension or tax-free wrapper, which is where most long-term money sits. " +
          "Outside one, 15–40% depending on the country and the income.",
        developing: "10–20% withheld at source — 15% on interest in Uganda and Kenya. It is taken before " +
          "you ever see the money."
      }
    },

    investFee: {
      q: "What does the fund charge you a year?",
      what: "The annual management fee, charged on the balance rather than on the gains.",
      why: "Charged on the whole balance every year, a fee compounds against you the way returns compound " +
        "for you. Over twenty-five years, one and a half points a year is roughly a third of the final " +
        "pot.",
      presets: [
        { label: "Index fund 0.2%", value: 0.2 },
        { label: "Typical 1%", value: 1 },
        { label: "Active local 2.5%", value: 2.5 }
      ],
      typical: {
        developed: "0.05–0.3% for a broad index tracker, 0.5–1.5% for actively managed funds.",
        developing: "1–3% for local unit trusts, sometimes with an entry fee on top, and the cheap index " +
          "option often is not available locally at all."
      }
    },

    horizon: {
      q: "How many years should the comparison run over?",
      what: "How far out to run both paths before comparing them. Everything is measured on that day.",
      why: "Building needs time — years of it, before the house exists at all. A short horizon almost " +
        "guarantees the building path loses, and if it ends before the house is finished the model sells " +
        "a part-built structure, which is the outcome it is warning you about.",
      presets: [
        { label: "Medium 15", value: 15 },
        { label: "Long 25", value: 25 },
        { label: "A lifetime 40", value: 40 }
      ],
      typical: {
        note: "A useful trick: run it once at ten years and once at thirty. If the answer flips between " +
          "them, the honest conclusion is that it depends on how long you stay.",
        developed: "Owners move every 8–15 years on average, which makes long horizons less realistic " +
          "there.",
        developing: "A self-built family house is typically held for life and passed on, which is what " +
          "makes horizons of 25 years and more the right frame."
      }
    },

    sellPct: {
      q: "What would selling cost?",
      what: "Agent and legal fees, if you ever sell.",
      why: "It comes off the top of the largest number in the model, and both paths are cashed in at the " +
        "end so they can be compared on the same terms. If you would never sell, read the result as a " +
        "scoreboard rather than a plan.",
      presets: [
        { label: "Low 2%", value: 2 },
        { label: "Typical 5%", value: 5 },
        { label: "Heavy 8%", value: 8 }
      ],
      typical: {
        developed: "5–6% in the US, 1–3% in the UK including legal fees.",
        developing: "3–6% in commission plus legal costs, and a house can sit unsold for a long time, " +
          "which is a cost this model does not charge you for."
      }
    },

    cgt: {
      q: "What tax would you pay on the gain?",
      what: "Capital gains tax on what you sell for above what the plot and the build cost you. This " +
        "starts at zero because many countries exempt a home you have actually lived in.",
      why: "On a house held for decades the paper gain can be enormous, so the rate matters — but the " +
        "exemption for your own home matters more, and it is the single biggest tax advantage of owning " +
        "where it exists.",
      presets: [
        { label: "Exempt 0%", value: 0 },
        { label: "Moderate 15%", value: 15 },
        { label: "High 30%", value: 30 }
      ],
      typical: {
        developed: "Main homes are exempt in the UK, and the US excludes the first US$250,000 of gain " +
          "(US$500,000 for a couple). Rates on anything else run 18–28%.",
        developing: "Uganda exempts a home you have lived in for at least two years, which is why this " +
          "starts at zero. Kenya charges 15% on property gains and Nigeria 10%, both with exemptions for " +
          "a primary residence."
      }
    }
  },

  /* ===================== the answer screen ===================== */
  outcome: function(engine, s){
    var gap = s.finalBuild - s.finalInvest;
    var building = gap >= 0;
    var amt = engine.fmt(Math.abs(gap));
    var H = engine.V.horizon;

    var headline = (building ? '<span class="b">Build</span>'
                             : '<span class="r">Rent and invest</span>') +
      ", by " + amt + " over " + yrS(H) + ".";

    var sub;
    if(building){
      sub = "Building leaves you <b>" + amt + "</b> ahead by year " + H + ", after selling costs and " +
        "tax. " +
        (s.moveInYear !== null
          ? "You move in around year <b>" + (Math.round(s.moveInYear * 10) / 10) + "</b>, having paid " +
            engine.fmt(s.rentPaid) + " in rent to get there. " : "") +
        (s.breakEven ? "The two lines cross in <b>year " + s.breakEven + "</b>."
                     : "Building is ahead the whole way here.");
    } else {
      sub = "Renting and investing the same money leaves you <b>" + amt + "</b> ahead by year " + H +
        ". " +
        (s.moveInYear !== null
          ? "The build ties up cash for years before it houses you — you move in around year <b>" +
            (Math.round(s.moveInYear * 10) / 10) + "</b>. " : "") +
        "What that gap does not price is a rent nobody can raise.";
    }

    var short = '<b class="' + (building ? "b" : "r") + '">' +
      (building ? "Building" : "Renting and investing") + "</b> is ahead by <b>" + amt +
      "</b> after " + yrS(H) + ".";

    var warn = null;
    if(s.neverBuysLand){
      warn = "<b>The plot never becomes affordable.</b> Land is appreciating at " +
        engine.pctS(engine.V.apprec) + " a year and nothing you set aside catches it. Nothing is ever " +
        "built, so the building path here is just renting with a worse portfolio.";
    } else if(s.neverFinishes){
      warn = "<b>At this rate the house is never finished.</b> It reaches " +
        engine.pctS(s.progressAtHorizon * 100) + " done by year " + H + ". Building costs are rising at " +
        engine.pctS(engine.V.buildInflation) + " a year while your budget grows at " +
        engine.pctS(engine.V.incomeGrowth) + " — the target is moving away from you faster than you are " +
        "walking towards it.";
    } else if(s.neverMovesIn){
      warn = "<b>You never move in.</b> The house gets there, but not inside " + yrS(H) + ", so you pay " +
        "rent the whole way and the money sunk into the site earns nothing while you do.";
    }

    var moveV = s.moveInYear === null ? "Never" : "Year " + (Math.round(s.moveInYear * 10) / 10);
    var doneV, doneS;
    if(s.neverBuysLand){
      doneV = "No plot"; doneS = "The plot is never affordable";
    } else if(s.neverFinishes){
      doneV = "Never at this rate";
      doneS = engine.pctS(s.progressAtHorizon * 100) + " done by year " + H;
    } else {
      doneV = "Year " + (Math.round(s.finishYear * 10) / 10);
      doneS = "Plot bought in year " + (Math.round(s.landYear * 10) / 10);
    }

    return {
      headline: headline, sub: sub, short: short, warn: warn,
      labelA: "Build it",
      labelB: "Rent and invest",
      series: s.series.map(function(p){ return { y: p.y, a: p.build, b: p.invest }; }),
      breakEven: s.breakEven,
      tiles: [
        { k: "You move in", v: moveV,
          s: s.moveInYear === null ? "Not within " + yrS(H)
                                   : "After " + engine.fmt(s.rentPaid) + " of rent" },
        { k: "House finished", v: doneV, s: doneS },
        { k: "Building pulls ahead", v: s.breakEven ? "Year " + s.breakEven : "Never",
          s: s.breakEven ? "Having been behind until then" : "Not within " + yrS(H) },
        { k: "Gap at year " + H, v: (gap >= 0 ? "+" : "−") + amt,
          s: gap >= 0 ? "in favour of building" : "in favour of renting" }
      ]
    };
  }
};

return GUIDE;
});
