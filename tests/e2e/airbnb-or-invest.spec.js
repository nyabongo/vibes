import { test, expect } from "@playwright/test";

const PAGE = "/airbnb-or-invest/advanced/";
const section = (page, id) => page.locator(`fieldset[data-sec="${id}"]`);

test.describe("airbnb-or-invest", () => {
  test("loads with the default scenario and renders a verdict", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator("#headline")).toContainText(/Airbnb|Invest/);
    await expect(page.locator("#tiles .tile")).toHaveCount(4);
    await expect(page.locator("#flip .item")).toHaveCount(4);
    await expect(page.locator("crossover-chart svg path.pathline")).toHaveCount(2);
  });

  /* Four starting points, and the property's own questions apply to three of
     them. Keeping the house either way is the one that must hide them — they
     cancel, so showing them would invite numbers that cannot move the answer. */
  test("each starting point shows its own inputs and hides the rest", async ({ page }) => {
    await page.goto(PAGE);
    await expect(section(page, "fBuy")).toBeVisible();
    await expect(section(page, "fBuild")).toBeHidden();
    await expect(section(page, "fOwn")).toBeHidden();

    await page.locator("#m_build").click();
    await expect(section(page, "fBuild")).toBeVisible();
    await expect(section(page, "fBuy")).toBeHidden();
    await expect(page.locator("#m_build")).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/[?&]m=build/);

    await page.locator("#m_own").click();
    await expect(section(page, "fOwn")).toBeVisible();
    await expect(section(page, "fHold")).toBeVisible();
    await expect(section(page, "fExit")).toBeVisible();

    await page.locator("#m_keep").click();
    for (const id of ["fBuy", "fBuild", "fOwn", "fHold", "fExit"]) {
      await expect(section(page, id), id).toBeHidden();
    }
    await expect(section(page, "fSetup")).toBeVisible();
    await expect(page.locator("#tiles .tile").first()).toContainText("Only the furnishing");
  });

  test("changing occupancy updates the answer live and reaches the URL", async ({ page }) => {
    await page.goto(PAGE);
    const before = await page.locator("#headline").innerText();

    const occ = page.locator("#i_occupancy");
    await occ.fill("90");
    await occ.dispatchEvent("input");

    await expect(page.locator("#headline")).not.toHaveText(before);
    await expect(page.locator("#headline")).toContainText("Airbnb");
    await expect(page).toHaveURL(/[?&]occ=90/);
  });

  test("a shared link fully reproduces the scenario in a fresh context", async ({ page, context }) => {
    await page.goto(PAGE);
    await page.locator("#m_own").click();
    await page.locator("#i_homeValue").fill("14000000");
    await page.locator("#i_homeValue").dispatchEvent("input");
    await expect(page).toHaveURL(/[?&]val=14000000/);

    const sharedURL = page.url();
    const headline = await page.locator("#headline").innerText();

    const fresh = await context.newPage();
    await fresh.goto(sharedURL);
    await expect(fresh.locator("#headline")).toHaveText(headline);
    await expect(fresh.locator("#m_own")).toHaveAttribute("aria-pressed", "true");
    await expect(fresh.locator("#i_homeValue")).toHaveValue("14000000");
    await fresh.close();
  });

  test("a running loss is called out rather than quietly priced", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator("#warn")).toBeHidden();
    await page.locator("#i_occupancy").fill("5");
    await page.locator("#i_occupancy").dispatchEvent("input");
    await expect(page.locator("#warn")).toBeVisible();
    await expect(page.locator("#warn")).toContainText("don't cover the running costs");
  });

  test("a worked example copied out of llms.txt opens the scenario it claims", async ({ page, request }) => {
    const res = await request.get("/airbnb-or-invest/llms.txt");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/plain");
    const doc = await res.text();
    const example = doc.match(/https:\/\/vibes\.obel\.dev\/airbnb-or-invest\/\?\S+/);
    expect(example, "llms.txt should publish at least one worked example").not.toBeNull();

    await page.goto(PAGE + new URL(example[0]).search);
    await expect(page.locator("#i_price")).toHaveValue("12000000");
    await expect(page.locator("#i_nightly")).toHaveValue("9000");
    await expect(page.locator("#headline")).not.toBeEmpty();
  });

  test("accessibility: inputs have labels, mode buttons expose aria-pressed, chart has an aria-label", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('label[for="i_nightly"]')).toBeVisible();
    for (const id of ["#m_buy", "#m_build", "#m_own", "#m_keep"]) {
      await expect(page.locator(id)).toHaveAttribute("aria-pressed", /true|false/);
    }
    const chart = page.locator("#chart");
    await expect(chart).toHaveAttribute("role", "img");
    expect((await chart.getAttribute("aria-label"))?.length).toBeGreaterThan(0);
  });
});
