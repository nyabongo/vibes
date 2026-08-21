import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import docs from "./llms-txt.js";
import Calc from "../rent-or-buy/calc.js";
import Model from "../build-or-invest/model.js";
import Brick from "../brick-by-brick/model.js";

const { SPECS, render, ROOT, SITE } = docs;

/* core.autocrlf is on for most contributors, so the committed files arrive as
   CRLF on a fresh clone while the generator always writes LF. .gitattributes
   pins these files to LF; normalising here too means a misconfigured checkout
   reports the real problem instead of a phantom staleness failure. */
const norm = (s) => s.replace(/\r\n/g, "\n");
const read = (p) => norm(readFileSync(join(ROOT, p), "utf8"));

const TOOL_BY_PATH = {
  "rent-or-buy": Calc,
  "build-or-invest": Model,
  "brick-by-brick": Brick
};

describe("the committed llms.txt files are current", () => {
  SPECS.forEach((spec) => {
    it(spec.out + " matches the generator — run `npm run docs` if this fails", () => {
      expect(read(spec.out)).toBe(norm(render(spec)));
    });
  });
});

describe("every calculator link published anywhere actually works", () => {
  // Harvests from the generated docs and from the hand-written pages, so a URL
  // someone pasted into HTML by hand is checked on the same terms.
  const SOURCES = [
    "llms.txt",
    "rent-or-buy/llms.txt",
    "build-or-invest/llms.txt",
    "brick-by-brick/llms.txt",
    "index.html",
    "rent-or-buy/index.html",
    "build-or-invest/index.html",
    "brick-by-brick/index.html"
  ];

  const links = [];
  SOURCES.forEach((src) => {
    const text = read(src);
    const re = /https:\/\/vibes\.obel\.dev\/(rent-or-buy|build-or-invest|brick-by-brick)\/\?[^\s"'<>)]+/g;
    [...text.matchAll(re)].forEach((m) => links.push({ src, url: m[0], tool: m[1] }));
  });

  it("finds the worked examples, so the assertions below aren't vacuous", () => {
    const expected = Calc.EXAMPLES.length + Model.EXAMPLES.length + Brick.EXAMPLES.length;
    expect(links.length).toBeGreaterThanOrEqual(expected);
  });

  it("uses only parameter names the target calculator recognises", () => {
    links.forEach(({ src, url, tool }) => {
      const calc = TOOL_BY_PATH[tool];
      new URL(url).searchParams.forEach((_val, key) => {
        const known = key === "m" || key === "c" || Boolean(calc.paramKey(key));
        expect(known, `${key} in ${url} (${src})`).toBe(true);
      });
    });
  });

  it("carries values that survive the round-trip unclamped", () => {
    links.forEach(({ src, url, tool }) => {
      const calc = TOOL_BY_PATH[tool];
      const search = new URL(url).search;
      calc.resetToDefaults();
      calc.loadFromURL(search);

      const sort = (p) => [...p].sort((a, b) => a[0].localeCompare(b[0]));
      expect(sort(new URLSearchParams(calc.buildQueryString())), `${url} (${src})`)
        .toEqual(sort(new URLSearchParams(search)));
      calc.resetToDefaults();
    });
  });

  it("passes a mode and currency the calculator will accept", () => {
    links.forEach(({ src, url, tool }) => {
      const calc = TOOL_BY_PATH[tool];
      const params = new URL(url).searchParams;
      const where = `${url} (${src})`;

      if (params.has("m")) {
        const modes = calc.MODE_META.values.map((v) => v.value);
        expect(modes, where).toContain(params.get("m"));
      }
      if (params.has("c")) {
        const codes = calc.CURRENCIES.map((x) => x.code);
        expect(codes, where).toContain(params.get("c"));
      }
    });
  });
});

describe("the docs are discoverable", () => {
  it("robots.txt points a reader at the index", () => {
    expect(read("robots.txt")).toContain(SITE + "/llms.txt");
  });

  it("sitemap.xml lists every generated file", () => {
    const sitemap = read("sitemap.xml");
    SPECS.forEach((spec) => {
      expect(sitemap).toContain("<loc>" + SITE + "/" + spec.out + "</loc>");
    });
  });

  it("has no lastmod, which would make the golden check non-deterministic", () => {
    expect(read("sitemap.xml")).not.toContain("lastmod");
  });

  it("links llms.txt visibly from each calculator, not just from <head>", () => {
    ["rent-or-buy/index.html", "build-or-invest/index.html", "brick-by-brick/index.html"].forEach((page) => {
      const html = read(page);
      expect(html, page).toContain('<a href="llms.txt"');
      expect(html, page).toContain('rel="alternate"');
    });
  });

  it("links the index from the landing page", () => {
    expect(read("index.html")).toContain('href="llms.txt"');
  });

  it("resolves every vibes.obel.dev path named in the root index to a real file", () => {
    const text = read("llms.txt");
    const paths = [...text.matchAll(/https:\/\/vibes\.obel\.dev(\/[^\s"'<>)]*)/g)]
      .map((m) => m[1])
      .map((p) => (p.endsWith("/") ? p + "index.html" : p));

    [...new Set(paths)].forEach((p) => {
      expect(existsSync(join(ROOT, p.slice(1))), p).toBe(true);
    });
  });
});

describe("generated output is reproducible", () => {
  it("contains no date, timestamp or commit sha", () => {
    SPECS.forEach((spec) => {
      const text = render(spec);
      expect(text, spec.out).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
      expect(text, spec.out).not.toMatch(/\bgenerated (on|at)\b/i);
    });
  });

  it("renders identically on a second call", () => {
    SPECS.forEach((spec) => expect(render(spec)).toBe(render(spec)));
  });
});
