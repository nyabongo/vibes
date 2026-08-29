import { test, expect } from "@playwright/test";

test.describe("brick-by-brick", () => {
  test("loads with the default scenario and renders a verdict", async ({ page }) => {
    await page.goto("/brick-by-brick/advanced/");
    const headline = page.locator("#headline");
    await expect(headline).toContainText(/Build|Rent and invest/);
    await expect(page.locator("#tiles .tile")).toHaveCount(4);
  });

  test("opens in Ugandan shillings without being asked", async ({ page }) => {
    // The other two calculators open in KES. This one is aimed at a reader for
    // whom that is the wrong currency and the wrong order of magnitude.
    await page.goto("/brick-by-brick/advanced/");
    await expect(page.locator("#curhint")).toHaveText("UGX");
    await expect(page.locator("#tiles .tile").last()).toContainText("USh");
    // ...and picking a different default currency costs nothing at the URL:
    // buildQueryString omits `c` while it still matches DEFAULT_CUR_CODE, so
    // links from this tool are no noisier than the other two.
    expect(new URL(page.url()).search).toBe("");
  });

  /* llms.txt rules 3 and 4 turn on this branch, and it lives in the page's init
     block rather than the engine — so it is pinned here, the same way it is for
     the other two calculators. */
  test("only a link with a recognised parameter shows the defaults, as llms.txt claims", async ({ page }) => {
    await page.goto("/brick-by-brick/advanced/");
    const defaultSqm = await page.locator("#i_sqm").inputValue();

    await page.locator("#i_sqm").fill("310");
    await page.locator("#i_sqm").dispatchEvent("input");
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(Brick.STORAGE_KEY) || "{}").V?.sqm))
      .toBe(310);

    // A bare URL, and one carrying only parameters the calculator doesn't know,
    // both restore what this visitor last had.
    for (const url of ["/brick-by-brick/advanced/", "/brick-by-brick/advanced/?utm_source=x"]) {
      await page.goto(url);
      await expect(page.locator("#i_sqm"), url).toHaveValue("310");
    }

    // The defaults link llms.txt recommends: one recognised parameter, set to
    // its own default, so it changes nothing but still trips the branch.
    await page.goto("/brick-by-brick/advanced/?m=asyougo");
    await expect(page.locator("#i_sqm")).toHaveValue(defaultSqm);

    // ...and opening it left the saved scenario alone.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem(Brick.STORAGE_KEY)).V.sqm)).toBe(310);
  });

  test("changing an input updates the headline and tiles live, without a reload", async ({ page }) => {
    await page.goto("/brick-by-brick/advanced/");
    const before = await page.locator("#headline").innerText();

    const sqm = page.locator("#i_sqm");
    await sqm.fill("300");
    await sqm.dispatchEvent("input");

    await expect(page.locator("#headline")).not.toHaveText(before);
    await expect(page.locator("#tiles .tile").last()).toContainText("USh");
  });

  test("mode toggle shows the right fieldset and moves the move-in date", async ({ page }) => {
    await page.goto("/brick-by-brick/advanced/");
    await expect(page.locator("#secAsYouGo")).toBeVisible();
    await expect(page.locator("#secSaveFirst")).toBeHidden();

    const moveIn = page.locator("#tiles .tile").first();
    await expect(moveIn).toContainText("You move in");
    const asYouGo = await moveIn.locator(".v").innerText();

    await page.locator("#mSaveFirst").click();

    await expect(page.locator("#secAsYouGo")).toBeHidden();
    await expect(page.locator("#secSaveFirst")).toBeVisible();
    await expect(page.locator("#mSaveFirst")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#mAsYouGo")).toHaveAttribute("aria-pressed", "false");

    // Saving first means you stay in the rental until the house is done, so
    // move-in slips to the completion date rather than the part-built one.
    await expect(moveIn.locator(".v")).not.toHaveText(asYouGo);
    const tiles = page.locator("#tiles .tile");
    await expect(tiles.nth(0).locator(".v")).toHaveText(await tiles.nth(1).locator(".v").innerText());
  });

  test("a build that loses the race against costs says so instead of guessing a finish date", async ({ page }) => {
    // The headline behaviour of this calculator. Construction inflation well
    // above salary growth means progress converges short of the finish, and
    // the page has to report that rather than extrapolate past the horizon.
    await page.goto("/brick-by-brick/advanced/");
    await expect(page.locator("#stallWarn")).toBeHidden();

    for (const [id, value] of [["i_buildInflation", "20"], ["i_incomeGrowth", "1"], ["i_saveMonthly", "300000"]]) {
      await page.locator("#" + id).fill(value);
      await page.locator("#" + id).dispatchEvent("input");
    }

    const warn = page.locator("#stallWarn");
    await expect(warn).toBeVisible();
    await expect(warn).toContainText("never finished");
    await expect(warn).toContainText("20%");

    await expect(page.locator("#tiles .tile").nth(1).locator(".v")).toHaveText("Never at this rate");
    await expect(page.locator("#cf")).toContainText("the rent never stops");
  });

  test("a shared link fully reproduces the scenario in a fresh context", async ({ page, context }) => {
    await page.goto("/brick-by-brick/advanced/");
    await page.locator("#i_sqm").fill("180");
    await page.locator("#i_sqm").dispatchEvent("input");
    await page.locator("#mSaveFirst").click();

    const sharedURL = page.url();
    const originalHeadline = await page.locator("#headline").innerText();

    const fresh = await context.newPage();
    await fresh.goto(sharedURL);

    await expect(fresh.locator("#headline")).toHaveText(originalHeadline);
    await expect(fresh.locator("#mSaveFirst")).toHaveAttribute("aria-pressed", "true");
    await expect(fresh.locator("#i_sqm")).toHaveValue("180");
    await fresh.close();
  });

  test("a shared link leaves the visitor's own saved scenario alone", async ({ page }) => {
    await page.goto("/brick-by-brick/advanced/");
    await page.locator("#i_sqm").fill("450");
    await page.locator("#i_sqm").dispatchEvent("input");
    const saved = await page.evaluate(() => localStorage.getItem("brickByBrick.v1"));
    expect(JSON.parse(saved).V.sqm).toBe(450);

    await page.goto("/brick-by-brick/advanced/?sqm=95");
    await expect(page.locator("#i_sqm")).toHaveValue("95");

    const after = await page.evaluate(() => localStorage.getItem("brickByBrick.v1"));
    expect(JSON.parse(after).V.sqm, "the shared link must not overwrite what they had").toBe(450);
  });

  test("currency switcher changes the displayed symbol and scale", async ({ page }) => {
    await page.goto("/brick-by-brick/advanced/");
    await expect(page.locator("#tiles .tile").last()).toContainText("USh");

    await page.locator("#cur select").selectOption({ label: "USD — US dollar" });

    await expect(page.locator("#tiles .tile").last()).toContainText("$");
    await expect(page.locator("#tiles .tile").last()).not.toContainText("USh");
    await expect(page.locator("#curhint")).toHaveText("USD");
  });

  test("copy link button copies the current URL to the clipboard", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are only reliably grantable in Chromium");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/brick-by-brick/advanced/");

    const btn = page.locator("#copyLink");
    await btn.click();
    await expect(btn).toHaveText("Copied");

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(page.url());
  });

  test("the flip panel offers four levers and answers the build-cost one", async ({ page }) => {
    await page.goto("/brick-by-brick/advanced/");
    const rows = page.locator("#flip .item");
    await expect(rows).toHaveCount(4);

    // Bisecting down to a cost of zero would land on "no house is ever built",
    // which is the wrong side of the sign change — the panel would give up and
    // print "nothing in range flips it" for a lever that plainly has one.
    await expect(rows.nth(2)).toContainText("square metre");
    await expect(rows.nth(2).locator(".target")).not.toHaveText("nothing in range flips it");
    await expect(rows.nth(2).locator(".target")).toContainText("USh");
  });

  test("each monthly bar's parts add up to the figure beside it", async ({ page }) => {
    // The first month of a build is the savings pile going into the ground, so
    // charting it as a monthly income produced slices that summed to far more
    // than the stated total and a bar that overflowed its track.
    await page.goto("/brick-by-brick/advanced/");

    const rows = await page.evaluate(() => {
      const num = (t) => Number(t.replace(/[^0-9]/g, ""));
      return [...document.querySelectorAll("#cf .cfrow")]
        .filter((r) => r.querySelector(".keys"))
        .map((r) => ({
          total: num(r.querySelector(".cfhead .amt").textContent),
          parts: [...r.querySelectorAll(".keys span")].map((s) => num(s.textContent)),
          widths: [...r.querySelectorAll(".bar div")]
            .map((d) => parseFloat(d.style.width) || 0)
        }));
    });

    expect(rows.length).toBe(2);
    for (const r of rows) {
      const sum = r.parts.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - r.total), "parts " + sum + " vs total " + r.total)
        .toBeLessThanOrEqual(r.parts.length);
      const width = r.widths.reduce((a, b) => a + b, 0);
      expect(width).toBeGreaterThan(99);
      expect(width).toBeLessThan(101);
    }
  });

  test("print summary stays populated with the current field values", async ({ page }) => {
    await page.goto("/brick-by-brick/advanced/");
    await page.locator("#i_landCost").fill("55000000");
    await page.locator("#i_landCost").dispatchEvent("input");

    await expect(page.locator("#printSummary")).toContainText("USh55,000,000");
  });

  test("the AI prompt carries the whole spec plus the visitor's current scenario", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are only reliably grantable in Chromium");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/brick-by-brick/advanced/?sqm=95&h=30");

    await page.locator("details.aihelp > summary").click();
    const btn = page.locator("#copyPrompt");
    await btn.click();
    await expect(btn).toHaveText("Copied");

    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt).toContain(page.url());

    const shortNames = await page.evaluate(() => Object.values(Brick.PARAM_MAP));
    for (const name of shortNames) expect(prompt).toContain("`" + name + "`");

    await expect(btn).toHaveText("Copy prompt");
  });

  test("the AI prompt never passes off tracking junk as the visitor's assumptions", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are only reliably grantable in Chromium");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const read = () => page.evaluate(() => navigator.clipboard.readText());
    const copy = async () => {
      await page.locator("details.aihelp > summary").click();
      await page.locator("#copyPrompt").click();
      await expect(page.locator("#copyPrompt")).toHaveText("Copied");
      return read();
    };

    // Arriving on tracking junk with nothing saved is not a scenario, and the
    // prompt must not tell a chatbot it is.
    await page.goto("/brick-by-brick/advanced/?utm_source=twitter&fbclid=abc123");
    let prompt = await copy();
    expect(prompt).not.toContain("I've already set some of it up");

    // Assert on the *values*, not the key: the generated spec quotes
    // `utm_source=x` in its own prose as the example of a parameter the
    // calculator ignores, so searching for "utm_source" always matches.
    expect(prompt).not.toMatch(/twitter|fbclid|abc123/);

    // With something saved, the same arrival restores it — and the prompt may
    // now claim a scenario, but only the normalised one, still carrying no junk.
    await page.locator("#i_sqm").fill("310");
    await page.locator("#i_sqm").dispatchEvent("input");
    await page.goto("/brick-by-brick/advanced/?utm_source=twitter&fbclid=abc123");
    await expect(page.locator("#i_sqm")).toHaveValue("310");

    prompt = await copy();
    expect(prompt).toContain("I've already set some of it up");
    expect(prompt).toContain("sqm=310");
    expect(prompt).not.toMatch(/twitter|fbclid|abc123/);
  });

  test("llms.txt is served as plain text and linked from the page body", async ({ page, request }) => {
    const res = await request.get("/brick-by-brick/llms.txt");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/plain");

    await page.goto("/brick-by-brick/advanced/");
    await expect(page.locator('.aihelp a[href="../llms.txt"]')).toHaveCount(1);
  });

  test("a worked example copied out of llms.txt opens the scenario it claims", async ({ page, request }) => {
    const doc = await (await request.get("/brick-by-brick/llms.txt")).text();
    const example = doc.match(/https:\/\/vibes\.obel\.dev\/brick-by-brick\/\?\S+/);
    expect(example, "llms.txt should publish at least one worked example").not.toBeNull();

    await page.goto("/brick-by-brick/advanced/" + new URL(example[0]).search);

    await expect(page.locator("#i_sqm")).toHaveValue("90");
    await expect(page.locator("#headline")).not.toBeEmpty();
  });

  test("accessibility: inputs have labels, mode buttons expose aria-pressed, chart has an aria-label", async ({ page }) => {
    await page.goto("/brick-by-brick/advanced/");

    await expect(page.locator('label[for="i_sqm"]')).toBeVisible();
    await expect(page.locator("#i_sqm")).toHaveId("i_sqm");

    await expect(page.locator("#mAsYouGo")).toHaveAttribute("aria-pressed", /true|false/);
    await expect(page.locator("#mSaveFirst")).toHaveAttribute("aria-pressed", /true|false/);

    const chart = page.locator("#chart");
    await expect(chart).toHaveAttribute("role", "img");
    const ariaLabel = await chart.getAttribute("aria-label");
    expect(ariaLabel?.length).toBeGreaterThan(0);
  });
});
