import { test, expect } from "@playwright/test";

/* Every other spec runs at Playwright's default 1280x720 with pointer:fine, so
   none of the mobile CSS was exercised at all — which is how a horizontal
   scrollbar shipped on every page at 320px and 360px, and how the chart came to
   render its axis labels at 5px.

   hasTouch, not isMobile: isMobile is Chromium-only, and hasTouch is what makes
   the browser report pointer:coarse, which is what the 44px target rules key
   off. Without it every touch-target assertion below passes vacuously. */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const TOOLS = ["rent-or-buy", "build-or-invest", "brick-by-brick"];

async function ready(page, path) {
  await page.goto(path);
  await page.waitForFunction(() => document.getElementById("headline").textContent.length > 0);
}

test.describe("mobile", () => {
  for (const tool of TOOLS) {
    test(`${tool}: the inputs come before the results, so a change is one scroll away`, async ({ page }) => {
      await ready(page, `/${tool}/`);
      const controls = await page.locator(".controls").boundingBox();
      const results = await page.locator(".results").boundingBox();
      expect(controls.y, "the input panel should sit above the results").toBeLessThan(results.y);

      // The verdict still comes first — that is the thing the reorder protects.
      const verdict = await page.locator(".verdict").boundingBox();
      expect(verdict.y).toBeLessThan(controls.y);
    });
  }

  /* The regression that was live: 320px and 360px both scrolled sideways, from
     three unrelated causes — the currency select forcing the masthead to 358px,
     an unbreakable mono amount in .flip .target, and a money token wider than a
     two-up tile. The worst-case query strings are the ones that produce the
     longest strings the site can render. */
  const OVERFLOW_CASES = [
    ["rent-or-buy", ""],
    ["build-or-invest", ""],
    ["brick-by-brick", ""],
    ["rent-or-buy", "?p=900000000&m=let&h=40&c=UGX"],
    ["build-or-invest", "?cap=900000000&cpu=90000000&u=200&c=UGX"],
    ["brick-by-brick", "?sv=900000000&sm=90000000&h=40"]
  ];
  for (const width of [320, 390]) {
    for (const [tool, qs] of OVERFLOW_CASES) {
      test(`${tool} at ${width}px${qs ? " with large figures" : ""}: the page never scrolls sideways`, async ({ page }) => {
        await page.setViewportSize({ width, height: 780 });
        await ready(page, `/${tool}/${qs}`);
        const { scrollW, clientW } = await page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth
        }));
        expect(scrollW, "document scrollWidth should not exceed the viewport").toBe(clientW);
      });
    }
  }

  test("every control is big enough to hit with a thumb", async ({ page }) => {
    await ready(page, "/build-or-invest/");
    const small = await page.evaluate(() => {
      const out = [];
      [".linkbtn", "select.currency", ".mode button", "input[type=range]", ".aihelp summary", ".backlink"]
        .forEach((sel) => document.querySelectorAll(sel).forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.height > 0 && r.height < 44) out.push(sel + " is " + Math.round(r.height) + "px");
        }));
      return [...new Set(out)];
    });
    expect(small, "44px is the WCAG 2.5.5 / Apple HIG target size").toEqual([]);
  });

  /* The whole border box of a range input is draggable, which is what makes
     height:44px a real target rather than decoration — the native thumb stays
     ~16-21px whatever we do to the box. Verified rather than assumed, because
     if it were false the fix would have to be appearance:none, which would cost
     us accent-color and the filled portion of the track. */
  test("a slider drags from the top edge of its box, not just from the thumb", async ({ page }) => {
    await ready(page, "/build-or-invest/");
    const slider = page.locator("#i_units");
    const box = await slider.boundingBox();
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);

    const before = await slider.inputValue();
    await slider.hover({ position: { x: box.width * 0.2, y: 3 } }); // 3px from the top edge
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + 3, { steps: 5 });
    await page.mouse.up();
    expect(await slider.inputValue()).not.toBe(before);
  });

  test("the chart is drawn at its own size, so its labels are real pixels", async ({ page }) => {
    await ready(page, "/build-or-invest/");
    const chart = await page.evaluate(() => {
      const host = document.getElementById("chart");
      const svg = host.querySelector("svg");
      const box = host.getBoundingClientRect();
      const label = svg.querySelector("text.axis").getBoundingClientRect();
      return {
        w: Math.round(box.width), h: Math.round(box.height),
        viewBox: svg.getAttribute("viewBox"),
        labelHeight: label.height
      };
    });
    // 1:1 — the viewBox tracks the measured box, so nothing is scaled.
    expect(chart.viewBox).toBe(`0 0 ${chart.w} ${chart.h}`);
    // It used to be a 145px stripe with 5px type.
    expect(chart.h).toBeGreaterThan(200);
    expect(chart.labelHeight).toBeGreaterThan(10);
  });

  test("chart markers stay inside the plot, and the crossover label survives", async ({ page }) => {
    await ready(page, "/build-or-invest/");
    await expect(page.locator("#chart")).toContainText("CROSSOVER");
    const escaped = await page.evaluate(() => {
      const host = document.getElementById("chart").getBoundingClientRect();
      return [...document.querySelectorAll("#chart .marker text")]
        .filter((n) => {
          const r = n.getBoundingClientRect();
          return r.left < host.left - 1 || r.right > host.right + 1;
        })
        .map((n) => n.textContent);
    });
    expect(escaped, "a marker label ran outside the chart box").toEqual([]);
  });

  /* The tick ladder only earns its keep at the narrow end, so drive the horizon
     across its whole range and check the labels never crowd. */
  test("year ticks thin out instead of colliding as the horizon grows", async ({ page }) => {
    for (const h of [1, 10, 20, 40]) {
      await ready(page, `/build-or-invest/?h=${h}`);
      const gap = await page.evaluate(() => {
        const xs = [...document.querySelectorAll("#chart text.axis")]
          .filter((n) => /^\d+$/.test(n.textContent))
          .map((n) => n.getBoundingClientRect())
          .sort((a, b) => a.left - b.left);
        let min = Infinity;
        for (let i = 1; i < xs.length; i++) min = Math.min(min, xs[i].left - xs[i - 1].right);
        return xs.length < 2 ? Infinity : min;
      });
      expect(gap, `year labels collide at a ${h}-year horizon`).toBeGreaterThan(0);
    }
  });

  test("the chart redraws when the phone is rotated", async ({ page }) => {
    await ready(page, "/build-or-invest/");
    const viewBox = () => page.evaluate(() => document.querySelector("#chart svg").getAttribute("viewBox"));
    const portrait = await viewBox();

    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(viewBox, { message: "landscape should redraw wider" }).not.toBe(portrait);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(viewBox, { message: "rotating back should restore the portrait geometry" }).toBe(portrait);
  });

  /* Redrawing changes the viewBox aspect, which changes the element's own
     height, which re-notifies the ResizeObserver. The width gate in
     crossover-chart.js is what stops that becoming a loop; this is how we find
     out if it ever stops working. */
  test("resizing the chart does not start a ResizeObserver loop", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await ready(page, "/build-or-invest/");
    for (const w of [320, 500, 390, 700, 390]) {
      await page.setViewportSize({ width: w, height: 780 });
      await page.waitForTimeout(120);
    }
    expect(errors).toEqual([]);
  });
});
