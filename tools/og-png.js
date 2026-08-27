/* Rasterises each calculator's og.svg to the og.png the social platforms want.
 *
 *   npm run og
 *
 * Facebook, X, LinkedIn, Slack and WhatsApp all refuse SVG for og:image and
 * twitter:image — PNG, JPEG, GIF and WEBP only — so a link to a page whose
 * preview image is an SVG unfurls with no image at all. The og.svg files stay
 * the source of truth; this script produces the raster the crawlers will
 * actually fetch, and both files are committed side by side.
 *
 * Like tools/llms-txt.js, this runs at author time and its output is
 * committed. The deployed site stays a plain static file tree with no build
 * step. Re-run it whenever an og.svg changes.
 *
 * Chromium does the rendering because it is already a devDependency (the
 * Playwright e2e suite uses it) and because it is the same engine that draws
 * the SVG everywhere else. The SVG is inlined into a bare page rather than
 * loaded through <img> so that the webfonts below apply to it: an SVG
 * referenced as an image is rendered in an isolated context that loads no
 * external resources.
 *
 * The fonts come from the same Google Fonts families shared/tool.css imports,
 * so the preview card is set in the site's own type rather than in whatever
 * monospace the machine running this happened to have. That needs network
 * access at author time; without it the script stops rather than quietly
 * committing a PNG in fallback fonts.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var chromium = require("@playwright/test").chromium;

var ROOT = path.resolve(__dirname, "..");

/* The size every platform's large-summary card is cropped to. */
var WIDTH = 1200;
var HEIGHT = 630;

var DIRS = ["rent-or-buy", "build-or-invest", "brick-by-brick"];

/* Only the families og.svg actually names, at the weights shared/tool.css
 * imports. Fraunces is in that stylesheet too, for the site's headings, but the
 * cards set their headline in Georgia — a font already on the machines that
 * matter — so it is not needed here. */
var FONT_CSS =
  "https://fonts.googleapis.com/css2" +
  "?family=IBM+Plex+Mono:wght@400;500" +
  "&family=IBM+Plex+Sans:wght@400;500;600" +
  "&display=block";

/* The prefix whose absence means the render fell back to a system font. */
var WEBFONT_PREFIX = "IBM Plex";

/* Forces the root <svg> to the card size. Any viewBox aspect other than
 * 1200:630 is letterboxed by the default preserveAspectRatio ("xMidYMid meet")
 * rather than stretched — the artwork is never distorted or cropped. The
 * aspect is checked below so a mismatch is reported instead of silently
 * padded. */
function sizeToCard(svg) {
  var open = svg.match(/<svg\b[^>]*>/);
  if (!open) throw new Error("no <svg> element found");
  var tag = open[0]
    .replace(/\s+width\s*=\s*"[^"]*"/g, "")
    .replace(/\s+height\s*=\s*"[^"]*"/g, "")
    .replace(/^<svg\b/, '<svg width="' + WIDTH + '" height="' + HEIGHT + '"');
  return svg.slice(0, open.index) + tag + svg.slice(open.index + open[0].length);
}

function aspectWarning(svg, name) {
  var box = svg.match(/viewBox\s*=\s*"([^"]*)"/);
  if (!box) return name + ": no viewBox — the card size is applied as-is.";
  var nums = box[1].trim().split(/[\s,]+/).map(Number);
  if (nums.length !== 4 || nums.some(isNaN)) return name + ": unreadable viewBox " + box[1];
  var ratio = nums[2] / nums[3];
  if (Math.abs(ratio - WIDTH / HEIGHT) < 0.001) return null;
  return (
    name + ": viewBox is " + nums[2] + "×" + nums[3] + ", not " + WIDTH + "×" +
    HEIGHT + " — the PNG will be letterboxed. Fix the SVG rather than the render."
  );
}

function page(svg) {
  return (
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
    "<link rel=\"stylesheet\" href=\"" + FONT_CSS + "\">" +
    "<style>html,body{margin:0;padding:0;background:#fff}svg{display:block}</style>" +
    "</head><body>" + sizeToCard(svg) + "</body></html>"
  );
}

async function main() {
  var browser = await chromium.launch();
  try {
    var tab = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1
    });

    for (var i = 0; i < DIRS.length; i++) {
      var dir = DIRS[i];
      var src = path.join(ROOT, dir, "og.svg");
      var out = path.join(ROOT, dir, "og.png");
      var svg = fs.readFileSync(src, "utf8");

      var warn = aspectWarning(svg, dir + "/og.svg");
      if (warn) console.warn("warning: " + warn);

      await tab.setContent(page(svg), { waitUntil: "load" });
      await tab.evaluate(function () { return document.fonts.ready; });

      /* Asking the rendered document which faces it needs, rather than
       * hardcoding a list, keeps this honest when an og.svg starts using a new
       * weight or family. Google Fonts splits each family across unicode-range
       * subsets, so the element's own text is passed to check() — otherwise it
       * only answers for the subset covering a space. */
      var missing = await tab.evaluate(function (prefix) {
        var out = [];
        var nodes = document.querySelectorAll("svg text, svg tspan");
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          var cs = getComputedStyle(el);
          var family = cs.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
          if (family.indexOf(prefix) !== 0) continue;
          var face = cs.fontWeight + " " + cs.fontSize + " '" + family + "'";
          if (!document.fonts.check(face, el.textContent) && out.indexOf(face) < 0) {
            out.push(face);
          }
        }
        return out;
      }, WEBFONT_PREFIX);
      if (missing.length) {
        throw new Error(
          dir + ": webfonts did not load (" + missing.join(", ") + "). This " +
          "script needs network access to fonts.googleapis.com; committing a " +
          "PNG set in fallback fonts would not match the site."
        );
      }

      await tab.screenshot({ path: out, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
      console.log(
        dir + "/og.png  " + WIDTH + "×" + HEIGHT + "  " +
        fs.statSync(out).size + " bytes"
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch(function (err) {
  console.error(err.message || err);
  process.exit(1);
});
