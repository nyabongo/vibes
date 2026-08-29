import { test, expect } from "@playwright/test";

/* The walkthrough, which is what /<tool>/ now serves. The state machine is unit tested in
   shared/wizard.test.js and the copy in <tool>/guide.test.js, so what is left
   for a browser is the wiring: that a question renders its control, that
   answering one reaches the URL, that skipping leaves the default visibly
   marked as ours, and that the answer screen actually draws. */

const TOOLS = [
  { slug: "rent-or-buy", engine: "Calc", firstQuestion: /live in this place, or rent it out/i },
  { slug: "build-or-invest", engine: "Model", firstQuestion: /money are you putting in/i },
  { slug: "brick-by-brick", engine: "Brick", firstQuestion: /build as the money comes in/i }
];

async function start(page, slug, qs = "") {
  await page.goto(`/${slug}/${qs}`);
  await page.getByRole("button", { name: "Start" }).click();
}

test.describe("guided walkthrough", () => {
  for (const { slug, firstQuestion } of TOOLS) {
    test(`${slug}: opens on the intro and walks to a first question`, async ({ page }) => {
      await page.goto(`/${slug}/`);
      await expect(page.locator(".card .eyebrow")).toHaveText("Before we start");
      await expect(page.locator(".wiz-meta .where")).toContainText(/\d+ questions/);
      // Nothing has been asked yet, so nothing is claimed about the answer.
      await expect(page.locator(".sofar")).toBeHidden();

      await page.getByRole("button", { name: "Start" }).click();
      await expect(page.locator(".card h2.q")).toHaveText(firstQuestion);
      await expect(page.locator(".wiz-meta .where")).toContainText("Question 1 of");
    });

    test(`${slug}: reaches an answer with a chart, four tiles and a full review`, async ({ page }) => {
      await start(page, slug);
      await page.locator(".wiz-meta .escape").click();

      await expect(page.locator(".verdict-line")).not.toBeEmpty();
      await expect(page.locator(".tile")).toHaveCount(4);
      await expect(page.locator("crossover-chart svg path.pathline")).toHaveCount(2);
      // Every question that applies is listed, and none of them is the visitor's.
      await expect(page.locator(".rv-row")).not.toHaveCount(0);
      await expect(page.locator(".wiz-meta .where")).toContainText("every number here is our default");
      await expect(page.locator(".rv-row .tag").first()).toHaveText("our default");
    });

    /* Every question has to say what it is and what a normal number looks like,
       in both kinds of market — that is the whole reason this page exists, and
       a step that renders without them is a page that has quietly stopped
       doing its job. */
    test(`${slug}: every question explains itself and offers typical values`, async ({ page }) => {
      await start(page, slug);
      let steps = 0;
      while (await page.locator(".btn.next").innerText() !== "See my answer") {
        await expect(page.locator(".card h2.q")).not.toBeEmpty();
        await expect(page.locator(".card p.what")).not.toBeEmpty();
        if (await page.locator(".choices").count() === 0) {
          await expect(page.locator(".tellme details")).toHaveCount(
            await page.locator(".ask").count() * 2);
          await expect(page.locator(".world")).toHaveCount(
            await page.locator(".ask").count() * 2);
        }
        await page.getByRole("button", { name: "Next", exact: true }).click();
        expect(++steps, "the walkthrough should terminate").toBeLessThan(60);
      }
    });
  }

  test("an answer reaches the URL, and that URL reopens the same scenario", async ({ page, context }) => {
    await start(page, "rent-or-buy");
    await page.getByRole("button", { name: "Next", exact: true }).click(); // past the mode question
    await page.locator("#w_price").fill("18500000");
    await expect(page).toHaveURL(/[?&]p=18500000/);
    await expect(page.locator(".readback")).toContainText("KSh18,500,000");

    // Copied from the address bar mid-walkthrough, the link carries both the
    // scenario and the question you were standing on.
    const shared = page.url();
    expect(shared).toContain("#price");
    const fresh = await context.newPage();
    await fresh.goto(shared);
    await expect(fresh.locator("#w_price")).toHaveValue("18500000");

    // Strip the fragment and it opens at the beginning, saying where the
    // numbers came from.
    await fresh.goto(shared.split("#")[0]);
    await expect(fresh.locator(".card p.what").last()).toContainText("This link came with numbers");
    await fresh.getByRole("button", { name: "Start" }).click();
    await fresh.getByRole("button", { name: "Next", exact: true }).click();
    await expect(fresh.locator("#w_price")).toHaveValue("18500000");
    await fresh.close();
  });

  test("skipping keeps the default and says so on the answer screen", async ({ page }) => {
    await start(page, "rent-or-buy");
    await page.getByRole("button", { name: "Next", exact: true }).click(); // past the mode question
    const label = await page.locator(".btn.quiet").innerText();
    expect(label).toContain("Skip — keep KSh12,000,000");
    await page.locator(".btn.quiet").click();

    await page.locator(".wiz-meta .escape").click();
    const row = page.locator(".rv-row", { hasText: "Property price" });
    await expect(row.locator(".rv")).toHaveText("KSh12,000,000");
    await expect(row.locator(".tag")).toHaveText("our default");
  });

  /* Once a number is the visitor's own, offering to "keep" it would imply the
     answer was about to be thrown away. */
  test("the skip button names the live value, and goes once the question is answered", async ({ page }) => {
    await start(page, "rent-or-buy");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click(); // price -> rent
    await expect(page.locator(".btn.quiet")).toContainText("Skip — keep KSh55,000");
    await page.locator("#w_rent").fill("90000");
    await expect(page.locator(".btn.quiet")).toBeHidden();
  });

  test("a preset chip fills the number in, and shows which one is selected", async ({ page }) => {
    await start(page, "rent-or-buy");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click(); // deposit
    const chip = page.getByRole("button", { name: "Local bank 30%" });
    await chip.click();
    await expect(page.locator(".slide-val")).toHaveText("30%");
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Standard 20%" })).toHaveAttribute("aria-pressed", "false");
  });

  test("the mode question adds and removes the questions that depend on it", async ({ page }) => {
    await start(page, "rent-or-buy");
    const asLive = await page.locator(".wiz-meta .where").innerText();
    await page.getByRole("button", { name: /I'd rent it out/ }).click();
    const asLet = await page.locator(".wiz-meta .where").innerText();
    expect(asLet).not.toBe(asLive);

    // Two screens on, the walkthrough is asking a landlord's question.
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator(".card h2.q")).toContainText("rent would you collect");
  });

  test("the review's edit button goes back to the question that set it", async ({ page }) => {
    await start(page, "build-or-invest");
    await page.locator(".wiz-meta .escape").click();
    await page.locator(".rv-row", { hasText: "Exit yield" }).getByRole("button").click();
    await expect(page.locator(".card h2.q")).toContainText("yield would a buyer want");
  });

  test("the answer hands the same scenario on to the advanced view", async ({ page }) => {
    await start(page, "brick-by-brick");
    await page.getByRole("button", { name: "Next", exact: true }).click(); // past the mode question
    await page.locator("#w_savings").fill("2000000");
    await page.locator(".wiz-meta .escape").click();

    const href = await page.getByRole("link", { name: "Open the advanced view" }).getAttribute("href");
    expect(href).toMatch(/^advanced\/\?/);
    await page.getByRole("link", { name: "Open the advanced view" }).click();
    await expect(page.locator("#headline")).not.toBeEmpty();
    await expect(page.locator("#i_savings")).toHaveValue("2000000");
  });

  test("start over clears the scenario and the URL with it", async ({ page }) => {
    await start(page, "rent-or-buy");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.locator("#w_price").fill("44000000");
    await page.locator(".wiz-meta .escape").click();
    await page.getByRole("button", { name: "Start over" }).click();

    await expect(page).toHaveURL(/\/rent-or-buy\/$/);
    await expect(page.locator(".card .eyebrow")).toHaveText("Before we start");
  });

  test("Enter moves to the next question, the way it would in any form", async ({ page }) => {
    await start(page, "rent-or-buy");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.locator("#w_price").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".wiz-meta .where")).toContainText("Question 3 of");
  });

  /* Replacing the whole card leaves focus on <body>, where a screen reader is
     told nothing about the question that just arrived. */
  test("moving on puts focus on the new question's heading", async ({ page }) => {
    await start(page, "rent-or-buy");
    await expect(page.locator(".card h2.q")).toBeFocused();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator(".card h2.q")).toBeFocused();
    // The answer has no question to head it, so the verdict takes the focus.
    await page.locator(".wiz-meta .escape").click();
    await expect(page.locator(".verdict-line")).toBeFocused();
  });

  test("the AI prompt carries the walkthrough's own address and the full spec", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/rent-or-buy/");
    await page.locator(".aihelp.wiz-ai summary").click();
    await page.locator("#copyPrompt").click();
    await expect(page.locator("#copyPrompt")).toHaveText("Copied");

    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("/rent-or-buy/");
    expect(text).toContain("## How to build a link");
    expect(text).toContain("All money is Kenyan shillings");
  });
});

/* The walkthrough's position lives in the URL fragment, so a link can drop
   somebody on one question instead of at the beginning. The scenario is still
   the query string; the fragment only says where to stand in it. */
test.describe("the step in the URL", () => {
  test("a fresh arrival has no fragment, and walking on adds one", async ({ page }) => {
    await page.goto("/rent-or-buy/");
    expect(new URL(page.url()).hash).toBe("");

    await page.getByRole("button", { name: "Start" }).click();
    await expect(page).toHaveURL(/#purpose$/);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/#price$/);
  });

  test("a fragment opens the walkthrough on that question, scenario and all", async ({ page }) => {
    await page.goto("/rent-or-buy/?p=21000000&h=7#deposit");
    await expect(page.locator(".card h2.q")).toContainText("put down in cash");
    await expect(page.locator(".wiz-meta .where")).toContainText("Question 4 of");
    // The query string still did its job — the fragment only chose the screen.
    await page.locator("view-switch a").click();
    await expect(page.locator("#i_price")).toHaveValue("21000000");
    await expect(page.locator("#i_horizon")).toHaveValue("7");
  });

  test("#answer drops you straight on the result", async ({ page }) => {
    await page.goto("/build-or-invest/?cap=50000000#answer");
    await expect(page.locator(".verdict-line")).not.toBeEmpty();
    await expect(page.locator(".tile")).toHaveCount(4);
  });

  /* The mode decides which questions exist, and the mode comes from the query
     string — so the fragment has to be resolved after it, not before. */
  test("a mode-only fragment works with its mode and falls back without it", async ({ page }) => {
    await page.goto("/rent-or-buy/?m=let#income");
    await expect(page.locator(".card h2.q")).toContainText("rent would you collect");

    await page.goto("/rent-or-buy/#income");
    await expect(page.locator(".card .eyebrow")).toHaveText("Before we start");
  });

  test("a fragment naming nothing starts at the beginning rather than an empty screen", async ({ page }) => {
    await page.goto("/brick-by-brick/#not-a-question");
    await expect(page.locator(".card .eyebrow")).toHaveText("Before we start");
  });

  /* Editing the fragment on an open page does not reload it, so the
     walkthrough has to follow the browser rather than ignore it. */
  test("changing the fragment in place moves the walkthrough", async ({ page }) => {
    await page.goto("/rent-or-buy/");
    await page.evaluate(() => { location.hash = "#horizon"; });
    await expect(page.locator(".card h2.q")).toContainText("How long would you stay");
    await expect(page.locator(".wiz-meta .where")).toContainText("Your plans");
  });

  test("every fragment the spec publishes opens the question it claims", async ({ page, request }) => {
    const doc = await (await request.get("/rent-or-buy/llms.txt")).text();
    const rows = doc.split("\n").filter((l) => l.startsWith("| `#")).map((line) => {
      const cells = line.replace(/^\| | \|$/g, "").split(" | ");
      const mode = cells[1].match(/\*\(mode `(\w+)` only\)\*$/);
      return {
        id: cells[0].replace(/[`#]/g, ""),
        asks: cells[1].replace(/\s*\*\(mode `\w+` only\)\*$/, ""),
        mode: mode ? mode[1] : null
      };
    });
    expect(rows.length, "llms.txt should publish a fragment table").toBeGreaterThan(10);

    for (const { id, asks, mode } of rows) {
      await page.goto(`/rent-or-buy/${mode ? "?m=" + mode : ""}#${id}`);
      // The table's "opens on" column is the question's own heading.
      await expect(page.locator(".card h2.q"), `#${id}`).toHaveText(asks);
    }
  });
});

/* The two views are one tool. What makes that true for a visitor is that the
   switch is in the same place on both pages and that jumping does not cost
   them the numbers they have already given — the query string IS the
   scenario. */
test.describe("the Guided / Advanced switch", () => {
  for (const { slug } of TOOLS) {
    test(`${slug}: sits on both pages and marks the one you are on`, async ({ page }) => {
      await page.goto(`/${slug}/`);
      await expect(page.locator('view-switch [aria-current="page"]')).toHaveText("Guided");
      await expect(page.locator("view-switch a")).toHaveText("Advanced");

      await page.goto(`/${slug}/advanced/`);
      await expect(page.locator('view-switch [aria-current="page"]')).toHaveText("Advanced");
      await expect(page.locator("view-switch a")).toHaveText("Guided");
    });
  }

  test("carries the scenario from the walkthrough into the advanced view", async ({ page }) => {
    await start(page, "rent-or-buy");
    await page.getByRole("button", { name: "Next", exact: true }).click(); // past the mode question
    await page.locator("#w_price").fill("26000000");

    await page.locator("view-switch a").click();
    await expect(page).toHaveURL(/\/rent-or-buy\/advanced\/\?.*p=26000000/);
    await expect(page.locator("#i_price")).toHaveValue("26000000");
  });

  test("and back the other way, without losing it", async ({ page }) => {
    await page.goto("/rent-or-buy/advanced/");
    await page.locator("#i_price").fill("31000000");
    await page.locator("#i_price").dispatchEvent("input");

    await page.locator("view-switch a").click();
    await expect(page).toHaveURL(/\/rent-or-buy\/\?.*p=31000000/);
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator("#w_price")).toHaveValue("31000000");
  });
});

/* /<tool>/guide/ was the walkthrough's first address and went out in
   sitemap.xml and the published llms.txt before it moved. The stub left behind
   has one job, and it includes the query string — a bare meta refresh would
   drop the scenario and hand back the defaults. */
test.describe("the old /guide/ address", () => {
  for (const { slug } of TOOLS) {
    test(`${slug}: forwards to the walkthrough, scenario and all`, async ({ page }) => {
      await page.goto(`/${slug}/guide/?h=7`);
      await expect(page).toHaveURL(new RegExp(`/${slug}/\\?h=7$`));
      await expect(page.locator(".card .eyebrow")).toHaveText("Before we start");
    });
  }
});

test.describe("guided walkthrough on a phone", () => {
  test.use({ viewport: { width: 320, height: 780 }, hasTouch: true });

  for (const { slug } of TOOLS) {
    test(`${slug}: never scrolls sideways, intro to answer`, async ({ page }) => {
      const noOverflow = async (where) => {
        const { scrollW, clientW } = await page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth
        }));
        expect(scrollW, where).toBe(clientW);
      };
      await page.goto(`/${slug}/`);
      await noOverflow("the intro");
      await page.getByRole("button", { name: "Start" }).click();
      await noOverflow("the first question");
      await page.locator(".wiz-meta .escape").click();
      await expect(page.locator(".tile")).toHaveCount(4);
      await noOverflow("the answer");
    });
  }
});
