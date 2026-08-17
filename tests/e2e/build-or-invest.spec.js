import { test, expect } from "@playwright/test";

// Input handlers coalesce into one render per animation frame, so a bare
// getAttribute straight after dispatching "input" can read the previous frame.
// Playwright's expect() auto-retries and doesn't need this; direct reads do.
async function settle(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

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

    await page.locator("#cur select").selectOption({ label: "USD — US dollar" });

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
    await settle(page);
    const narrow = parseFloat(await band.getAttribute("width"));

    await page.locator("#i_buildMonths").fill("48");
    await page.locator("#i_buildMonths").dispatchEvent("input");
    await settle(page);
    const wide = parseFloat(await band.getAttribute("width"));

    expect(wide).toBeGreaterThan(narrow);
  });

  test("a burst of input events coalesces into one render, without losing the last value", async ({ page }) => {
    await page.goto("/build-or-invest/");

    const result = await page.evaluate(async () => {
      let count = 0;
      const real = window.render;
      window.render = function () { count++; return real.apply(this, arguments); };

      const inp = document.getElementById("i_rentUnit");
      for (let i = 0; i < 25; i++) {
        inp.value = String(30000 + i * 500);
        inp.dispatchEvent(new Event("input"));
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      window.render = real;
      return { count, applied: Model.V.rentUnit };
    });

    expect(result.count).toBe(1);
    expect(result.applied).toBe(42000); // 30000 + 24*500 — the last event still wins
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

  test("the AI prompt carries the whole spec plus the visitor's current scenario", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are only reliably grantable in Chromium");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/build-or-invest/?cap=30000000&u=8");

    await page.locator("details.aihelp > summary").click();
    const btn = page.locator("#copyPrompt");
    await btn.click();
    await expect(btn).toHaveText("Copied");

    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    // Without the current URL the chatbot would start from the defaults and
    // silently discard whatever the visitor had already set up.
    expect(prompt).toContain(page.url());

    const shortNames = await page.evaluate(() => Object.values(Model.PARAM_MAP));
    for (const name of shortNames) expect(prompt).toContain("`" + name + "`");

    await expect(btn).toHaveText("Copy prompt");
  });

  test("llms.txt is served as plain text and linked from the page body", async ({ page, request }) => {
    const res = await request.get("/build-or-invest/llms.txt");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/plain");

    await page.goto("/build-or-invest/");
    // In the body, not just <head> — a fetch-only agent never runs the JS that
    // would reveal anything else about this page.
    await expect(page.locator('.aihelp a[href="llms.txt"]')).toHaveCount(1);
  });

  test("a worked example copied out of llms.txt opens the scenario it claims", async ({ page, request }) => {
    const doc = await (await request.get("/build-or-invest/llms.txt")).text();
    const example = doc.match(/https:\/\/vibes\.obel\.dev\/build-or-invest\/\?\S+/);
    expect(example, "llms.txt should publish at least one worked example").not.toBeNull();

    await page.goto("/build-or-invest/" + new URL(example[0]).search);

    await expect(page.locator("#i_capital")).toHaveValue("30000000");
    await expect(page.locator("#i_units")).toHaveValue("8");
    await expect(page.locator("#i_rentUnit")).toHaveValue("28000");
    await expect(page.locator("#headline")).not.toHaveText("…");
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
