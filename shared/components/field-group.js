"use strict";

/* Renders one fieldset's worth of inputs from a field schema (the FIELDS
   arrays in calc.js / model.js), and keeps them synced to the underlying
   state after each render. Doesn't know anything about Calc/Model — the
   host page wires reads/writes through configure(). */
class FieldGroup extends HTMLElement {
  static formatPct(v) { return (Math.round(v * 10) / 10) + "%"; }
  static formatNum(v, unit) { return v + (unit || ""); }

  configure({ fields, get, set, onInput }) {
    this._fields = fields;
    this._get = get;
    this._set = set;
    this._onInput = onInput || function () {};
    this._rate = 1;
    this._build();
  }

  _build() {
    this.innerHTML = "";
    this._fields.forEach((f) => {
      const row = document.createElement("div");
      row.className = "f";

      const label = document.createElement("label");
      label.setAttribute("for", "i_" + f.k);
      const name = document.createElement("span");
      name.textContent = f.label;
      label.appendChild(name);

      let valSpan = null;
      if (f.type !== "money") {
        valSpan = document.createElement("span");
        valSpan.className = "val";
        valSpan.id = "v_" + f.k;
        label.appendChild(valSpan);
      }
      row.appendChild(label);

      const input = document.createElement("input");
      input.id = "i_" + f.k;
      if (f.type === "money") {
        input.type = "number"; input.step = "any"; input.inputMode = "decimal";
      } else {
        input.type = "range"; input.min = f.min; input.max = f.max; input.step = f.step;
      }
      input.addEventListener("input", () => {
        const raw = parseFloat(input.value);
        if (isNaN(raw)) return;
        this._set(f.k, f.type === "money" ? raw / this._rate : raw);
        this._onInput(f.k);
      });
      row.appendChild(input);

      if (f.note) {
        const note = document.createElement("div");
        note.className = "note";
        note.textContent = f.note;
        row.appendChild(note);
      }
      this.appendChild(row);
    });
    this.refresh(this._rate);
  }

  /* Call after every render — pushes current values into the inputs and
     percentage/unit displays, at the given currency rate (1 if unused). */
  refresh(rate) {
    if (!this._fields) return;
    this._rate = rate;
    this._fields.forEach((f) => {
      const input = this.querySelector("#i_" + f.k);
      if (!input) return;
      const raw = this._get(f.k);
      if (f.type === "money") {
        const shown = Math.round(raw * this._rate);
        if (document.activeElement !== input) input.value = shown;
      } else {
        input.value = raw;
        const valSpan = this.querySelector("#v_" + f.k);
        if (valSpan) {
          valSpan.textContent = f.type === "pct"
            ? FieldGroup.formatPct(raw)
            : FieldGroup.formatNum(raw, f.unit);
        }
      }
    });
  }
}
customElements.define("field-group", FieldGroup);
