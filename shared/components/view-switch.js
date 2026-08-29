"use strict";

/* The Guided / Advanced switch. Every calculator ships as two pages over one
   engine — /<tool>/ asks a question at a time, /<tool>/advanced/ puts every
   input on screen at once — and this is the control that moves between them.

   Two reasons it is an element rather than two anchors written out six times.
   The markup and its labels stay identical on both pages, which is the whole
   point of a switch; and the link has to carry the scenario across. The query
   string IS the state in these tools, so a jump that dropped it would silently
   hand the visitor the defaults back. sync() re-reads location.search, and the
   host page calls it from whatever loop already keeps the URL current.

       <view-switch current="guided" other="advanced/"></view-switch>
       <view-switch current="advanced" other="../"></view-switch> */
class ViewSwitch extends HTMLElement {
  static LABELS = { guided: "Guided", advanced: "Advanced" };

  connectedCallback() {
    if (this._link) return;
    const current = this.getAttribute("current") === "advanced" ? "advanced" : "guided";
    const otherKey = current === "guided" ? "advanced" : "guided";
    this._href = this.getAttribute("other") || "./";

    this.setAttribute("role", "group");
    this.setAttribute("aria-label", "How to fill this in");

    /* The page you are already on is not a link. Rendering it as one gives a
       screen reader a destination that goes nowhere and a keyboard user a stop
       on the way to somewhere that matters. */
    const here = document.createElement("span");
    here.textContent = ViewSwitch.LABELS[current];
    here.setAttribute("aria-current", "page");

    const link = document.createElement("a");
    link.textContent = ViewSwitch.LABELS[otherKey];

    this.append(...(current === "guided" ? [here, link] : [link, here]));
    this._link = link;
    this.sync();
  }

  /* Point the other view at whatever scenario is in the address bar now. */
  sync() {
    if (this._link) this._link.href = this._href + location.search;
  }
}
customElements.define("view-switch", ViewSwitch);
