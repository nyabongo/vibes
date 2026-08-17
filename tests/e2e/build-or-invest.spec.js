import { test, expect } from "@playwright/test";

test.describe("build-or-invest", () => {
  test("loads with the default scenario and renders a verdict", async ({ page }) => {
    await page.goto("/build-or-invest/");
    const headline = page.locator("#headline");
    await expect(headline).not.toHaveText("…");
    await expect(headline).toContainText(/Build|Invest/);
    await expect(page.locator("#tiles .tile")).toHaveCount(4);
    await expect(page.locator("#flip .item")).toHaveCount(4);
  });

  test("changing the rent updates the headline and tiles live, without a reload", async ({ page }) => {
    await page.goto("/build-or-invest/");
    const before = await page.locator("#headline").innerText();

    const rent = page.locator("#i_rentUnit");
    await rent.fill("90000");
    await rent.dispatchEvent("input");

    await expect(page.locator("#headline")).not.toHaveText(before);
    await expect(page.locator("#headline")).toContainText("Build");
    await expect(page.locator("#tiles .tile").first()).toContainText("KSh");
  });

  test("tax regime toggle shows the right fieldset and changes the tax quoted", async ({ page }) => {
    await page.goto("/build-or-invest/");
    await expect(page.locator("#secGross")).toBeVisible();
    await expect(page.locator("#secNet")).toBeHidden();

    const grossCopy = await page.locator("#cf").innerText();

    await page.locator("#mNet").click();

    await expect(page.locator("#secGross")).toBeHidden();
    await expect(page.locator("#secNet")).toBeVisible();
    await expect(page.locator("#mNet")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#mGross")).toHaveAttribute("aria-pressed", "false");
    expect(await page.locator("#cf").innerText()).not.toBe(grossCopy);
  });

  test("a shared link fully reproduces the scenario in a fresh context (regression: 51811df)", async ({ page, context }) => {
    await page.goto("/build-or-invest/");
    await page.locator("#i_capital").fill("75000000");
    await page.locator("#i_capital").dispatchEvent("input");
    await page.locator("#i_capRate").fill("11");
    await page.locator("#i_capRate").dispatchEvent("input");
    await page.locator("#mNet").click();

    const sharedURL = page.url();
    const originalHeadline = await page.locator("#headline").innerText();

    const fresh = await context.newPage();
    await fresh.goto(sharedURL);

    await expect(fresh.locator("#headline")).toHaveText(originalHeadline);
    await expect(fresh.locator("#mNet")).toHaveAttribute("aria-pressed", "true");
    await expect(fresh.locator("#i_capRate")).toHaveValue("11");
    await fresh.close();
  });

  test("currency switcher changes the displayed symbol and scale", async ({ page }) => {
    await page.goto("/build-or-invest/");
    await expect(page.locator("#tiles .tile").first()).toContainText("KSh");

    await page.locator("#cur").selectOption({ label: "USD — US dollar" });

    await expect(page.locator("#tiles .tile").first()).toContainText("$");
    await expect(page.locator("#tiles .tile").first()).not.toContainText("KSh");
    await expect(page.locator("#curhint")).toHaveText("USD");
  });

  test("the shortfall banner appears when the project outgrows the capital, and clears again", async ({ page }) => {
    await page.goto("/build-or-invest/");
    await expect(page.locator("#shortfallWarn")).toBeHidden();

    const capital = page.locator("#i_capital");
    await capital.fill("10000000");
    await capital.dispatchEvent("input");

    await expect(page.locator("#shortfallWarn")).toBeVisible();
    await expect(page.locator("#shortfallWarn")).toContainText("more than you have");

    await capital.fill("60000000");
    await capital.dispatchEvent("input");

    await expect(page.locator("#shortfallWarn")).toBeHidden();
  });

  test("a horizon that ends mid-construction is called out rather than quietly priced", async ({ page }) => {
    await page.goto("/build-or-invest/");

    await page.locator("#i_buildMonths").fill("36");
    await page.locator("#i_buildMonths").dispatchEvent("input");
    await page.locator("#i_horizon").fill("2");
    await page.locator("#i_horizon").dispatchEvent("input");

    await expect(page.locator("#shortfallWarn")).toBeVisible();
    await expect(page.locator("#shortfallWarn")).toContainText("before the block is finished");
  });

  test("the construction band on the chart tracks the build time", async ({ page }) => {
    await page.goto("/build-or-invest/");
    const band = page.locator("#chart rect").first();

    await page.locator("#i_buildMonths").fill("12");
    await page.locator("#i_buildMonths").dispatchEvent("input");
    const narrow = parseFloat(await band.getAttribute("width"));

    await page.locator("#i_buildMonths").fill("48");
    await page.locator("#i_buildMonths").dispatchEvent("input");
    const wide = parseFloat(await band.getAttribute("width"));

    expect(wide).toBeGreaterThan(narrow);
  });

  test("the completion marker is drawn once the build fits inside the horizon", async ({ page }) => {
    await page.goto("/build-or-invest/");
    await expect(page.locator("#chart")).toContainText("COMPLETE");
    await expect(page.locator("#chart")).toContainText("CROSSOVER");
  });

  test("copy link button copies the current URL to the clipboard", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are only reliably grantable in Chromium");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/build-or-invest/");

    const btn = page.locator("#copyLink");
    await btn.click();
    await expect(btn).toHaveText("Copied");

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(page.url());
  });

  test("print summary stays populated with the current field values", async ({ page }) => {
    await page.goto("/build-or-invest/");
    await page.locator("#i_land").fill("13750000");
    await page.locator("#i_land").dispatchEvent("input");

    await expect(page.locator("#printSummary")).toContainText("KSh13,750,000");
  });

  test("accessibility: inputs have labels, mode buttons expose aria-pressed, chart has an aria-label", async ({ page }) => {
    await page.goto("/build-or-invest/");

    await expect(page.locator('label[for="i_capital"]')).toBeVisible();
    await expect(page.locator("#i_capital")).toHaveId("i_capital");

    await expect(page.locator("#mGross")).toHaveAttribute("aria-pressed", /true|false/);
    await expect(page.locator("#mNet")).toHaveAttribute("aria-pressed", /true|false/);

    const chart = page.locator("#chart");
    await expect(chart).toHaveAttribute("role", "img");
    const ariaLabel = await chart.getAttribute("aria-label");
    expect(ariaLabel?.length).toBeGreaterThan(0);
  });
});
