import { test, expect } from "@playwright/test";

test.describe("rent-or-buy", () => {
  test("loads with the default scenario and renders a verdict", async ({ page }) => {
    await page.goto("/rent-or-buy/advanced/");
    const headline = page.locator("#headline");
    await expect(headline).toContainText(/Buy|Rent/);
    await expect(page.locator("#tiles .tile")).toHaveCount(4);
  });

  test("changing an input updates the headline and tiles live, without a reload", async ({ page }) => {
    await page.goto("/rent-or-buy/advanced/");
    const before = await page.locator("#headline").innerText();

    const priceInput = page.locator("#i_price");
    await priceInput.fill("50000000");
    await priceInput.dispatchEvent("input");

    await expect(page.locator("#headline")).not.toHaveText(before);
    await expect(page.locator("#tiles .tile").first()).toContainText("KSh"); // still live-rendered, no navigation
  });

  test("mode toggle shows/hides the right fieldset and changes verdict copy", async ({ page }) => {
    await page.goto("/rent-or-buy/advanced/");
    await expect(page.locator("#secRent")).toBeVisible();
    await expect(page.locator("#secLet")).toBeHidden();

    await page.locator("#mLet").click();

    await expect(page.locator("#secRent")).toBeHidden();
    await expect(page.locator("#secLet")).toBeVisible();
    await expect(page.locator("#mLet")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#mLive")).toHaveAttribute("aria-pressed", "false");
  });

  test("a shared link fully reproduces the scenario in a fresh context (regression: 51811df)", async ({ page, context }) => {
    await page.goto("/rent-or-buy/advanced/");
    await page.locator("#i_price").fill("35000000");
    await page.locator("#i_price").dispatchEvent("input");
    await page.locator("#mLet").click();

    const sharedURL = page.url();
    const originalHeadline = await page.locator("#headline").innerText();

    const fresh = await context.newPage();
    await fresh.goto(sharedURL);

    await expect(fresh.locator("#headline")).toHaveText(originalHeadline);
    await expect(fresh.locator("#mLet")).toHaveAttribute("aria-pressed", "true");
    await fresh.close();
  });

  /* llms.txt rules 3 and 4 turn on this branch, and used to describe only half
     of it — they called a bare URL "the default scenario" when it is the one
     shape of URL that hands a returning visitor their own saved scenario back.
     Pinned here rather than only against the engine, because the branch itself
     lives in the page's init block. */
  test("only a link with a recognised parameter shows the defaults, as llms.txt claims", async ({ page }) => {
    await page.goto("/rent-or-buy/advanced/");
    const defaultPrice = await page.locator("#i_price").inputValue();

    await page.locator("#i_price").fill("18500000");
    await page.locator("#i_price").dispatchEvent("input");
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(Calc.STORAGE_KEY) || "{}").V?.price))
      .toBe(18500000);

    // A bare URL, and one carrying only parameters the calculator doesn't know,
    // both restore what this visitor last had.
    for (const url of ["/rent-or-buy/advanced/", "/rent-or-buy/advanced/?utm_source=x"]) {
      await page.goto(url);
      await expect(page.locator("#i_price"), url).toHaveValue("18500000");
    }

    // The defaults link llms.txt recommends: one recognised parameter, set to
    // its own default, so it changes nothing but still trips the branch.
    await page.goto("/rent-or-buy/advanced/?m=live");
    await expect(page.locator("#i_price")).toHaveValue(defaultPrice);

    // ...and opening it left the saved scenario alone.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem(Calc.STORAGE_KEY)).V.price)).toBe(18500000);
  });

  test("currency switcher changes the displayed symbol and scale", async ({ page }) => {
    await page.goto("/rent-or-buy/advanced/");
    await expect(page.locator("#tiles .tile").first()).toContainText("KSh");

    await page.locator("#cur select").selectOption({ label: "USD — US dollar" });

    await expect(page.locator("#tiles .tile").first()).toContainText("$");
    await expect(page.locator("#tiles .tile").first()).not.toContainText("KSh");
    await expect(page.locator("#curhint")).toHaveText("USD");
  });

  test("copy link button copies the current URL to the clipboard", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are only reliably grantable in Chromium");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/rent-or-buy/advanced/");

    const btn = page.locator("#copyLink");
    await btn.click();
    await expect(btn).toHaveText("Copied");

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(page.url());
  });

  test("the 40-year flip claim reflects an actual 40-year run, not the chosen horizon (regression: e2baf39)", async ({ page }) => {
    await page.goto("/rent-or-buy/advanced/");

    // At these settings there's no crossover within the chosen 5-year horizon,
    // but a real 40-year simulation does cross over at year 9. The pre-fix
    // code read the 5-year run's breakEven (null) and claimed "buying never
    // pulls ahead within 40 years" — a false claim it never actually checked.
    await page.locator("#i_invest").fill("3");
    await page.locator("#i_invest").dispatchEvent("input");
    await page.locator("#i_horizon").fill("5");
    await page.locator("#i_horizon").dispatchEvent("input");

    const flipRows = page.locator("#flip .item");
    await expect(flipRows).toHaveCount(3);
    const thirdRow = flipRows.nth(2);
    await expect(thirdRow).not.toContainText("Within 40 years, buying never pulls ahead");
    await expect(thirdRow).toContainText("Buying pulls ahead once you've held it for");
    await expect(thirdRow.locator(".target")).toHaveText("9 years");
  });

  /* The flip panel used to solve appreciation over −8…30 and investment return
     over 0…30, both wider than the sliders those levers are actually offered
     on. Turning "Return if invested instead" up to its own maximum made it
     name 22.3% appreciation, 2.3 points past the end of that slider — a target
     the visitor is told about and then cannot set. (regression: #11) */
  test("the flip panel never names a target its own slider cannot reach", async ({ page }) => {
    await page.goto("/rent-or-buy/advanced/");

    // Everything default except the one lever, pushed to its declared maximum.
    await page.locator("#i_invest").fill("25");
    await page.locator("#i_invest").dispatchEvent("input");

    const flipRows = page.locator("#flip .item");
    await expect(flipRows).toHaveCount(3);

    // The appreciation root sits above the slider's 20% ceiling here, so the
    // panel has to say so rather than quote a number nobody can dial in.
    await expect(flipRows.nth(0).locator(".target")).toHaveText("nothing in range flips it");

    // And whatever either percentage row does name has to be reachable. Bounds
    // come from the same FIELDS the sliders are built from, so this keeps
    // holding if a range is ever widened or narrowed.
    const bounds = await page.evaluate(() => ({
      appr: [Calc.FIELD_BY_KEY.appr.min, Calc.FIELD_BY_KEY.appr.max],
      invest: [Calc.FIELD_BY_KEY.invest.min, Calc.FIELD_BY_KEY.invest.max]
    }));
    for (const [row, key] of [[0, "appr"], [1, "invest"]]) {
      const target = await flipRows.nth(row).locator(".target").innerText();
      if (target === "nothing in range flips it") continue;
      const value = parseFloat(target);
      expect(Number.isNaN(value), `${key} target "${target}" should be a percentage`).toBe(false);
      expect(value, key).toBeGreaterThanOrEqual(bounds[key][0]);
      expect(value, key).toBeLessThanOrEqual(bounds[key][1]);
    }
  });

  /* The credit line quotes yr1.income — gross rent after the empty months and
     the agent,
     with tax still in it. Income tax rides the other side of the same bar as
     its own "Tax on rent" segment, so the arithmetic nets out; only the label
     was wrong, and it claimed tax even in the common case where no tax segment
     is drawn at all. (regression: #10) */
  test("the let-mode credit line names only what was actually taken out of it", async ({ page }) => {
    await page.goto("/rent-or-buy/advanced/");
    await page.locator("#mLet").click();

    const credit = page.locator("#cf .credit").first();
    const keys = page.locator("#cf .keys").first();

    // The defaults don't turn a rental profit, so nothing is taxed and no
    // "Tax on rent" segment is drawn — the old wording promised one anyway.
    await expect(keys).not.toContainText("Tax on rent");
    await expect(credit).toContainText("rent collected, after empty months and the agent");
    await expect(credit).not.toContainText("tax");

    // Push the rent high enough to be taxed: the segment shows up, and the
    // credit still quotes the pre-tax figure, so naming tax here would be
    // charging the reader for it twice.
    await page.locator("#i_income").fill("400000");
    await page.locator("#i_income").dispatchEvent("input");

    await expect(keys).toContainText("Tax on rent");
    const preTax = await page.evaluate(() => Calc.fmt(Calc.simulate().yr1.income));
    await expect(credit).toContainText(preTax);
    await expect(credit).not.toContainText("tax");
  });

  /* The property paid capital gains tax on sale while both investment pots
     compounded entirely tax-free, with no input to change it — and the page's
     own help text calls the investment return "the single biggest lever". The
     rate now has its own field beside `cgt` in the Tax fieldset, opening on the
     same 15%. Separate knobs, not a mirror: exempting the home leaves the pot
     taxed, which is the wrinkle a footnote would have hidden. (regression: #6) */
  test("investment gains are taxed at their own rate, which survives a shared link", async ({ page, context }) => {
    await page.goto("/rent-or-buy/advanced/?m=live");

    const icgt = page.locator("#i_cgtInvest");
    await expect(page.locator('label[for="i_cgtInvest"]')).toBeVisible();
    await expect(icgt).toHaveValue("15");
    await expect(page.locator("#v_cgtInvest")).toHaveText("15%");
    await expect(page.locator("#printSummary")).toContainText("Tax on investment gains");

    const taxed = await page.locator("#headline").innerText();

    // A home that's exempt from CGT is not a sheltered investment account, so
    // dropping `cgt` to 0 must leave the pot's rate exactly where it was.
    await page.locator("#i_cgt").fill("0");
    await page.locator("#i_cgt").dispatchEvent("input");
    await expect(icgt).toHaveValue("15");

    // Sheltering the pot is what turns the tax off, and it moves the verdict —
    // the old tax-free model is now something you opt into.
    await page.goto("/rent-or-buy/advanced/?m=live");
    await icgt.fill("0");
    await icgt.dispatchEvent("input");
    await expect(page.locator("#headline")).not.toHaveText(taxed);

    // ...and whatever rate you land on rides in the URL under its own name.
    await icgt.fill("7.5");
    await icgt.dispatchEvent("input");
    await expect.poll(() => new URL(page.url()).searchParams.get("icgt")).toBe("7.5");

    const sharedURL = page.url();
    const sharedHeadline = await page.locator("#headline").innerText();
    const fresh = await context.newPage();
    await fresh.goto(sharedURL);
    await expect(fresh.locator("#i_cgtInvest")).toHaveValue("7.5");
    await expect(fresh.locator("#headline")).toHaveText(sharedHeadline);
    await fresh.close();
  });

  test("print summary stays populated with the current field values", async ({ page }) => {
    await page.goto("/rent-or-buy/advanced/");
    await page.locator("#i_price").fill("18500000");
    await page.locator("#i_price").dispatchEvent("input");

    await expect(page.locator("#printSummary")).toContainText("KSh18,500,000");
  });

  test("the AI prompt carries the whole spec plus the visitor's current scenario", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are only reliably grantable in Chromium");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/rent-or-buy/advanced/?p=14500000&h=7");

    await page.locator("details.aihelp > summary").click();
    const btn = page.locator("#copyPrompt");
    await btn.click();
    await expect(btn).toHaveText("Copied");

    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    // Without the current URL the chatbot would start from the defaults and
    // silently discard whatever the visitor had already set up.
    expect(prompt).toContain(page.url());

    const shortNames = await page.evaluate(() => Object.values(Calc.PARAM_MAP));
    for (const name of shortNames) expect(prompt).toContain("`" + name + "`");

    await expect(btn).toHaveText("Copy prompt");
  });

  test("llms.txt is served as plain text and linked from the page body", async ({ page, request }) => {
    const res = await request.get("/rent-or-buy/llms.txt");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/plain");

    await page.goto("/rent-or-buy/advanced/");
    // In the body, not just <head> — a fetch-only agent never runs the JS that
    // would reveal anything else about this page.
    await expect(page.locator('.aihelp a[href="../llms.txt"]')).toHaveCount(1);
  });

  test("a worked example copied out of llms.txt opens the scenario it claims", async ({ page, request }) => {
    const doc = await (await request.get("/rent-or-buy/llms.txt")).text();
    const example = doc.match(/https:\/\/vibes\.obel\.dev\/rent-or-buy\/\?\S+/);
    expect(example, "llms.txt should publish at least one worked example").not.toBeNull();

    await page.goto("/rent-or-buy/advanced/" + new URL(example[0]).search);

    await expect(page.locator("#i_price")).toHaveValue("14500000");
    await expect(page.locator("#i_rent")).toHaveValue("75000");
    await expect(page.locator("#i_horizon")).toHaveValue("7");
    await expect(page.locator("#headline")).not.toBeEmpty();
  });

  test("accessibility: inputs have labels, mode buttons expose aria-pressed, chart has an aria-label", async ({ page }) => {
    await page.goto("/rent-or-buy/advanced/");

    await expect(page.locator('label[for="i_price"]')).toBeVisible();
    await expect(page.locator("#i_price")).toHaveId("i_price");

    await expect(page.locator("#mLive")).toHaveAttribute("aria-pressed", /true|false/);
    await expect(page.locator("#mLet")).toHaveAttribute("aria-pressed", /true|false/);

    const chart = page.locator("#chart");
    await expect(chart).toHaveAttribute("role", "img");
    const ariaLabel = await chart.getAttribute("aria-label");
    expect(ariaLabel?.length).toBeGreaterThan(0);
  });
});
