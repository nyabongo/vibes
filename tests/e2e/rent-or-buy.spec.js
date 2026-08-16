import { test, expect } from "@playwright/test";

test.describe("rent-or-buy", () => {
  test("loads with the default scenario and renders a verdict", async ({ page }) => {
    await page.goto("/rent-or-buy/");
    const headline = page.locator("#headline");
    await expect(headline).not.toHaveText("…");
    await expect(headline).toContainText(/Buy|Rent/);
    await expect(page.locator("#tiles .tile")).toHaveCount(4);
  });

  test("changing an input updates the headline and tiles live, without a reload", async ({ page }) => {
    await page.goto("/rent-or-buy/");
    const before = await page.locator("#headline").innerText();

    const priceInput = page.locator("#i_price");
    await priceInput.fill("50000000");
    await priceInput.dispatchEvent("input");

    await expect(page.locator("#headline")).not.toHaveText(before);
    await expect(page.locator("#tiles .tile").first()).toContainText("KSh"); // still live-rendered, no navigation
  });

  test("mode toggle shows/hides the right fieldset and changes verdict copy", async ({ page }) => {
    await page.goto("/rent-or-buy/");
    await expect(page.locator("#secRent")).toBeVisible();
    await expect(page.locator("#secLet")).toBeHidden();

    await page.locator("#mLet").click();

    await expect(page.locator("#secRent")).toBeHidden();
    await expect(page.locator("#secLet")).toBeVisible();
    await expect(page.locator("#mLet")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#mLive")).toHaveAttribute("aria-pressed", "false");
  });

  test("a shared link fully reproduces the scenario in a fresh context (regression: 51811df)", async ({ page, context }) => {
    await page.goto("/rent-or-buy/");
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

  test("currency switcher changes the displayed symbol and scale", async ({ page }) => {
    await page.goto("/rent-or-buy/");
    await expect(page.locator("#tiles .tile").first()).toContainText("KSh");

    await page.locator("#cur").selectOption({ label: "USD — US dollar" });

    await expect(page.locator("#tiles .tile").first()).toContainText("$");
    await expect(page.locator("#tiles .tile").first()).not.toContainText("KSh");
    await expect(page.locator("#curhint")).toHaveText("USD");
  });

  test("copy link button copies the current URL to the clipboard", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are only reliably grantable in Chromium");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/rent-or-buy/");

    const btn = page.locator("#copyLink");
    await btn.click();
    await expect(btn).toHaveText("Copied");

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(page.url());
  });

  test("the 40-year flip claim reflects an actual 40-year run, not the chosen horizon (regression: e2baf39)", async ({ page }) => {
    await page.goto("/rent-or-buy/");

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

  test("print summary stays populated with the current field values", async ({ page }) => {
    await page.goto("/rent-or-buy/");
    await page.locator("#i_price").fill("18500000");
    await page.locator("#i_price").dispatchEvent("input");

    await expect(page.locator("#printSummary")).toContainText("KSh18,500,000");
  });

  test("accessibility: inputs have labels, mode buttons expose aria-pressed, chart has an aria-label", async ({ page }) => {
    await page.goto("/rent-or-buy/");

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
