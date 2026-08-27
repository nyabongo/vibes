"use strict";

/* The "net worth over time, two paths" SVG line chart both tools draw.
   Consumes a generic {y, a, b} series — the host page maps its own field
   names (buy/rent, build/invest) onto a/b before calling draw().

   One SVG user unit is one CSS pixel. draw() sets the viewBox to the element's
   measured width, so `font:500 11px` in tool.css renders at 11px in a 324px
   phone column and in an 828px desktop one alike.

   It used to be a fixed "0 0 760 340" scaled to fit, which on a phone meant a
   0.426x scale — and since a font-size inside a viewBox is in user units, the
   10px axis type rendered at 5px. Not "small": unreadable. Picking a smaller
   fixed viewBox would only move the problem, because the scale is boxWidth/W
   and boxWidth runs 254px to 364px across real phones. At 1:1 there is no
   scale factor to tune against, on any device. */
class CrossoverChart extends HTMLElement {
  /* role/aria-label belong on this element, not the inner <svg> — the host
     is what's semantically the image (set them as plain attributes in the
     markup, same as any other element's accessible name). */
  connectedCallback() {
    if (!this._svg) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 760 340"); // placeholder until the first draw()
      this.appendChild(svg);
      this._svg = svg;
    }
    /* Geometry follows the box, not the device. The same page is a 324px column
       on a phone, ~828px beside the controls on a desktop, something narrower
       just past the 900px column flip, and something else again after a
       rotation. One observer covers all of them, with no media-query arithmetic
       duplicated in JS to rot the next time .wrap or .chartbox padding moves. */
    if (!this._ro && typeof ResizeObserver === "function") {
      this._ro = new ResizeObserver((entries) => {
        const w = Math.round(entries[0].contentRect.width) || 760;
        /* Redrawing changes the viewBox aspect, which changes our own height,
           which re-notifies this observer. Gating on the width makes that
           second notification a no-op instead of a feedback loop. */
        if (w === this._w) return;
        this._w = w;
        if (this._last) this.draw(this._last);
      });
      this._ro.observe(this);
    }
  }

  disconnectedCallback() {
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
  }

  /**
   * @param {object} o
   * @param {Array<{y:number,a:number,b:number}>} o.series
   * @param {string} o.colorA - CSS color for the "a" path (drawn on top)
   * @param {string} o.colorB - CSS color for the "b" path
   * @param {(v:number)=>string} o.formatY - compact axis label formatter
   * @param {boolean} [o.zeroFloor] - force the y-axis to include 0
   * @param {number|null} [o.breakEven] - year the two paths cross, if any
   * @param {{to:number}} [o.band] - shaded region from year 0 to `to`
   * @param {{at:number,label:string}} [o.bandMarker] - dashed line + label at a year
   */
  draw(o_) {
    /* Kept so the observer can re-run the last draw at a new width. The host
       calls draw() on every render, so this is replaced every render too and
       can never describe a stale scenario. */
    this._last = o_;
    const { series: pts, colorA, colorB, formatY, zeroFloor, breakEven, band, bandMarker } = o_;

    /* Read from the observer, not measured here: a getBoundingClientRect() in
       draw() would force a synchronous reflow on every slider frame, on a page
       thousands of pixels tall, against a render budget of about one frame. The
       fallback runs once, before the observer's first delivery. */
    const W = this._w || (this._w = Math.round(this.getBoundingClientRect().width) || 760);

    /* Keep FS in step with `.axis` / `.marker text` in shared/tool.css — every
       gutter and gap below is sized off the type. CH is the IBM Plex Mono
       advance width, 0.6em. */
    const FS = 11, CH = FS * 0.6;

    /* Wide boxes keep the original 340/760 proportion. Narrow ones get taller —
       0.447 of 324px is a 145px stripe, not a chart — but never past 230px. The
       two clauses cross at W≈515, so the height is continuous across a resize
       rather than jumping at a breakpoint. */
    const H = Math.max(Math.round(W * 0.447), Math.min(230, Math.round(W * 0.71)));

    /* Under 480px a 64px y-gutter is a fifth of the chart, and 11px type no
       longer fits it anyway — "KSh112.1M" is 9 characters, 59.4px, into 56px of
       room. Below that the y labels move inside the plot, above their own
       gridline, which buys a quarter more plot at every phone width. Above it,
       76 is what 11px type needs: 68px of room is 10.3 characters, enough for
       "KSh112.1M" and "AED 999.9M". */
    const inside = W < 480;
    const L = inside ? 10 : 76;
    const R = inside ? 10 : 16;
    const T = FS + 7;        // headroom for the top label above the top gridline
    const B = FS * 2 + 15;   // the tick row plus the "YEARS HELD" title

    let maxY = zeroFloor ? 0 : pts[0].a;
    let minY = zeroFloor ? 0 : pts[0].a;
    pts.forEach((p) => { maxY = Math.max(maxY, p.a, p.b); minY = Math.min(minY, p.a, p.b); });
    if (maxY === minY) maxY = minY + 1;
    const pad = (maxY - minY) * 0.08; maxY += pad; minY -= pad;
    const xmax = pts[pts.length - 1].y || 1;
    const X = (y) => L + (y / xmax) * (W - L - R);
    const Y = (v) => T + (1 - (v - minY) / (maxY - minY)) * (H - T - B);

    const o = [];

    /* Stays the first <rect> in the SVG: build-or-invest.spec.js reads
       `#chart rect` .first() to check the construction band tracks the build
       time. Do not add a plot background above it. */
    if (band && band.to > 0) {
      const bw = X(Math.min(band.to, xmax)) - L;
      if (bw > 0) o.push(`<rect x="${L}" y="${T}" width="${bw.toFixed(1)}" height="${H - T - B}" fill="var(--muted)" opacity="0.08"/>`);
    }

    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const v = minY + (maxY - minY) * i / ticks, y = Y(v);
      o.push(`<line class="${Math.abs(v) < (maxY - minY) / 200 ? "zeroline" : "gridline"}" x1="${L}" y1="${y.toFixed(1)}" x2="${W - R}" y2="${y.toFixed(1)}"/>`);
      /* Inside, the floor label is dropped: it lands in the same strip as the
         band marker's COMPLETE / MOVE IN, and it is the one value that five
         evenly spaced gridlines above it already imply. */
      if (inside && i === 0) continue;
      o.push(inside
        ? `<text class="axis" x="${L + 2}" y="${(y - 4).toFixed(1)}">${formatY(v)}</text>`
        : `<text class="axis" x="${L - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${formatY(v)}</text>`);
    }

    /* Start from the spacing these pages have always used, then coarsen only
       until the labels stop overlapping — which happens on a narrow box and not
       on a wide one. A rule driven purely by width would have made a 40-year
       desktop axis denser than it is today, which nobody asked for. */
    const maxTicks = Math.max(2, Math.floor((W - L - R) / (CH * 2 + 12)));
    const LADDER = [1, 2, 5, 10, 20];
    let step = xmax <= 10 ? 1 : (xmax <= 20 ? 2 : 5);
    while (xmax / step > maxTicks && step < 20) step = LADDER[LADDER.indexOf(step) + 1];
    for (let yv = 0; yv <= xmax; yv += step) {
      o.push(`<text class="axis" x="${X(yv).toFixed(1)}" y="${H - B + FS + 7}" text-anchor="middle">${yv}</text>`);
    }
    o.push(`<text class="axis" x="${X(xmax / 2).toFixed(1)}" y="${H - 2}" text-anchor="middle" style="letter-spacing:.12em">YEARS HELD</text>`);

    const top = [], bot = [];
    pts.forEach((p) => { top.push(X(p.y).toFixed(1) + "," + Y(p.a).toFixed(1)); });
    for (let j = pts.length - 1; j >= 0; j--) bot.push(X(pts[j].y).toFixed(1) + "," + Y(pts[j].b).toFixed(1));
    const lastP = pts[pts.length - 1];
    const ahead = lastP.a >= lastP.b ? colorA : colorB;
    o.push(`<polygon points="${top.concat(bot).join(" ")}" fill="${ahead}" opacity="0.10"/>`);

    const line = (key, color) => {
      const d = pts.map((p, i) => (i ? "L" : "M") + X(p.y).toFixed(1) + " " + Y(p[key]).toFixed(1)).join(" ");
      return `<path class="pathline" d="${d}" stroke="${color}"/>`;
    };
    o.push(line("b", colorB));
    o.push(line("a", colorA));

    /* Anchor on whether the label actually fits, not on a fixed fraction of the
       width. At 324px the old `cx > W * 0.72` rule left "CROSSOVER · YEAR 8"
       start-anchored at x=232 and ran it 34px off the right edge. */
    const anchorFor = (cx, chars) => {
      const w = chars * CH + 7;
      if (cx + w <= W - R) return "start";
      if (cx - w >= L) return "end";
      return (W - cx) > cx ? "start" : "end"; // neither fits: clip the shorter side
    };

    if (bandMarker && bandMarker.at > 0 && bandMarker.at < xmax) {
      const cx = X(bandMarker.at);
      const anchor = anchorFor(cx, bandMarker.label.length);
      o.push(`<g class="marker">`);
      o.push(`<line x1="${cx.toFixed(1)}" y1="${T}" x2="${cx.toFixed(1)}" y2="${H - B}" stroke="var(--line)" stroke-width="1.25" stroke-dasharray="2 4"/>`);
      o.push(`<text class="soft" x="${(cx + (anchor === "end" ? -7 : 7)).toFixed(1)}" y="${H - B - 8}" text-anchor="${anchor}">${bandMarker.label}</text>`);
      o.push(`</g>`);
    }

    if (breakEven) {
      const bx = X(breakEven);
      /* "CROSSOVER · YEAR 8" is 18 monospace characters — 119px, or 39% of a
         324px plot. Two lines rather than a truncation, because truncating
         drops either the word or the year. Both forms keep the literal
         "CROSSOVER" that build-or-invest.spec.js asserts on. */
      const head = "CROSSOVER", tail = "YEAR " + breakEven;
      const oneLine = !inside;
      const chars = oneLine ? head.length + 3 + tail.length : Math.max(head.length, tail.length);
      const anchor = anchorFor(bx, chars);
      const x = (bx + (anchor === "end" ? -7 : 7)).toFixed(1);
      o.push(`<g class="marker">`);
      o.push(`<line x1="${bx.toFixed(1)}" y1="${T}" x2="${bx.toFixed(1)}" y2="${H - B}" stroke="var(--muted)" stroke-width="1.25" stroke-dasharray="4 4"/>`);
      o.push(oneLine
        ? `<text x="${x}" y="${T + 12}" text-anchor="${anchor}">${head} · ${tail}</text>`
        : `<text x="${x}" y="${T + 12}" text-anchor="${anchor}">${head}<tspan x="${x}" dy="${FS + 2}">${tail}</tspan></text>`);
      o.push(`</g>`);
    }

    o.push(`<circle cx="${X(lastP.y).toFixed(1)}" cy="${Y(lastP.a).toFixed(1)}" r="4" fill="${colorA}"/>`);
    o.push(`<circle cx="${X(lastP.y).toFixed(1)}" cy="${Y(lastP.b).toFixed(1)}" r="4" fill="${colorB}"/>`);

    this._svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    this._svg.innerHTML = o.join("");
  }
}
customElements.define("crossover-chart", CrossoverChart);
