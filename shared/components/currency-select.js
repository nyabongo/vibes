"use strict";

/* The <select> both tools use to re-price the page in a different currency.
   Renders into light DOM (not a shadow root) so the shared `select.currency`
   rule in tool.css still applies with no extra wiring. */
class CurrencySelect extends HTMLElement {
  static CURRENCIES = [
    ["KES", "KSh",  1,      "Kenyan shilling"],
    ["UGX", "USh",  28.7,   "Ugandan shilling"],
    ["USD", "$",    0.0077, "US dollar"],
    ["GBP", "£",    0.0061, "pound"],
    ["EUR", "€",    0.0071, "euro"],
    ["ZAR", "R",    0.14,   "rand"],
    ["NGN", "₦",    11.6,   "naira"],
    ["INR", "₹",    0.65,   "rupee"],
    ["AED", "AED ", 0.028,  "dirham"]
  ];

  connectedCallback() {
    if (this._select) return;
    const select = document.createElement("select");
    select.className = "currency";
    select.setAttribute("aria-label", "Currency");
    for (const [code, sym, rate, name] of CurrencySelect.CURRENCIES) {
      const opt = document.createElement("option");
      opt.value = code + "|" + sym + "|" + rate;
      opt.textContent = code + " — " + name;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      this.dispatchEvent(new CustomEvent("currencychange", {
        detail: { code: select.value.split("|")[0] },
        bubbles: true
      }));
    });
    this.appendChild(select);
    this._select = select;
  }

  /* Reflects an externally-applied currency (e.g. loaded from a shared link
     or localStorage) back into the visible selection. A no-op if called
     before connectedCallback has run (or after disconnection). */
  setCode(code) {
    const select = this._select;
    if (!select) return;
    for (const opt of select.options) {
      if (opt.value.split("|")[0] === code) { select.value = opt.value; return; }
    }
  }
}
customElements.define("currency-select", CurrencySelect);
