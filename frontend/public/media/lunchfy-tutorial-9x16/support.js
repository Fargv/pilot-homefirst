// Minimal local runtime shim for compatibility with the original .dc.html export.
// The production animation in this package uses index.html + css/tutorial.css + js/tutorial.js.
(() => {
  class DcRoot extends HTMLElement {}
  class DcImport extends HTMLElement {}
  if (!customElements.get("x-dc")) customElements.define("x-dc", DcRoot);
  if (!customElements.get("x-import")) customElements.define("x-import", DcImport);
})();
