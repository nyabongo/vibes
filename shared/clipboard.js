"use strict";

/* Copies `text`, then reports the outcome on the button itself for a moment
   before restoring its label. navigator.clipboard needs a secure context, so
   the textarea + execCommand path is what keeps this working over plain http
   and from a file:// URL. */
function copyWithFeedback(btn, text, restore) {
  function fallback() {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      done(ok);
    } catch (e) {
      done(false);
    }
  }

  function done(ok) {
    btn.textContent = ok ? "Copied" : "Copy failed";
    setTimeout(function () { btn.textContent = restore; }, 1500);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
  } else {
    fallback();
  }
}
