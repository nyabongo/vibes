"use strict";

/* The "net worth over time, two paths" SVG line chart both tools draw.
   Consumes a generic {y, a, b} series — the host page maps its own field
   names (buy/rent, build/invest) onto a/b before calling draw(). */
class CrossoverChart extends HTMLElement {
  /* role/aria-label belong on this element, not the inner <svg> — the host
     is what's semantically the image (set them as plain attributes in the
     markup, same as any other element's accessible name). */
  connectedCallback() {
    if (this._svg) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 760 340");
    this.appendChild(svg);
    this._svg = svg;
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
  draw({ series: pts, colorA, colorB, formatY, zeroFloor, breakEven, band, bandMarker }) {
    const W = 760, H = 340, L = 64, R = 16, T = 18, B = 34;

    let maxY = zeroFloor ? 0 : pts[0].a;
    let minY = zeroFloor ? 0 : pts[0].a;
    pts.forEach((p) => { maxY = Math.max(maxY, p.a, p.b); minY = Math.min(minY, p.a, p.b); });
    if (maxY === minY) maxY = minY + 1;
    const pad = (maxY - minY) * 0.08; maxY += pad; minY -= pad;
    const xmax = pts[pts.length - 1].y || 1;
    const X = (y) => L + (y / xmax) * (W - L - R);
    const Y = (v) => T + (1 - (v - minY) / (maxY - minY)) * (H - T - B);

    const o = [];

    if (band && band.to > 0) {
      const bw = X(Math.min(band.to, xmax)) - L;
      if (bw > 0) o.push(`<rect x="${L}" y="${T}" width="${bw.toFixed(1)}" height="${H - T - B}" fill="var(--muted)" opacity="0.08"/>`);
    }

    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const v = minY + (maxY - minY) * i / ticks, y = Y(v);
      o.push(`<line class="${Math.abs(v) < (maxY - minY) / 200 ? "zeroline" : "gridline"}" x1="${L}" y1="${y.toFixed(1)}" x2="${W - R}" y2="${y.toFixed(1)}"/>`);
      o.push(`<text class="axis" x="${L - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${formatY(v)}</text>`);
    }
    const step = xmax <= 10 ? 1 : (xmax <= 20 ? 2 : 5);
    for (let yv = 0; yv <= xmax; yv += step) {
      o.push(`<text class="axis" x="${X(yv).toFixed(1)}" y="${H - B + 18}" text-anchor="middle">${yv}</text>`);
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

    if (bandMarker && bandMarker.at > 0 && bandMarker.at < xmax) {
      const cx = X(bandMarker.at);
      const anchor = cx > W * 0.72 ? "end" : "start";
      o.push(`<g class="marker">`);
      o.push(`<line x1="${cx.toFixed(1)}" y1="${T}" x2="${cx.toFixed(1)}" y2="${H - B}" stroke="var(--line)" stroke-width="1.25" stroke-dasharray="2 4"/>`);
      o.push(`<text class="soft" x="${(cx + (anchor === "end" ? -7 : 7)).toFixed(1)}" y="${H - B - 8}" text-anchor="${anchor}">${bandMarker.label}</text>`);
      o.push(`</g>`);
    }

    if (breakEven) {
      const bx = X(breakEven);
      const anchor = bx > W * 0.72 ? "end" : "start";
      const dx = anchor === "end" ? -7 : 7;
      o.push(`<g class="marker">`);
      o.push(`<line x1="${bx.toFixed(1)}" y1="${T}" x2="${bx.toFixed(1)}" y2="${H - B}" stroke="var(--muted)" stroke-width="1.25" stroke-dasharray="4 4"/>`);
      o.push(`<text x="${(bx + dx).toFixed(1)}" y="${T + 12}" text-anchor="${anchor}">CROSSOVER · YEAR ${breakEven}</text>`);
      o.push(`</g>`);
    }

    o.push(`<circle cx="${X(lastP.y).toFixed(1)}" cy="${Y(lastP.a).toFixed(1)}" r="4" fill="${colorA}"/>`);
    o.push(`<circle cx="${X(lastP.y).toFixed(1)}" cy="${Y(lastP.b).toFixed(1)}" r="4" fill="${colorB}"/>`);

    this._svg.innerHTML = o.join("");
  }
}
customElements.define("crossover-chart", CrossoverChart);
