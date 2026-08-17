"use strict";

/* The 4-up "key figures" grid. Takes the same {k,v,s} tile shape both
   tools already compute (label, formatted value, sub-label). */
class KeyTiles extends HTMLElement {
  render(tiles) {
    this.innerHTML = tiles.map((t) =>
      `<div class="tile"><div class="k">${t.k}</div><div class="v">${t.v}</div><div class="s">${t.s}</div></div>`
    ).join("");
  }
}
customElements.define("key-tiles", KeyTiles);
