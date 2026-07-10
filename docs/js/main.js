/* App bootstrap — wires modules to the DOM. */
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 2600);
}

document.addEventListener("DOMContentLoaded", () => {
  const editor = document.getElementById("editor");

  editor.addEventListener("input", () => { renderPreview(); syncKeySelect(); });
  document.getElementById("pdfBtn").addEventListener("click", downloadPdf);
  document.getElementById("jsonBtn").addEventListener("click", exportSongJson);

  initSearch();
  initTranspose();

  // Body text size controls (title/artist/key stay fixed)
  const fontVal = document.getElementById("fontVal");
  function applyFontSize(delta) {
    fontVal.textContent = setBodySize(getBodySize() + delta);
    renderPreview();
  }
  document.getElementById("fontUp").addEventListener("click", () => applyFontSize(1));
  document.getElementById("fontDown").addEventListener("click", () => applyFontSize(-1));
  fontVal.textContent = getBodySize();

  // Re-scale pages when the pane resizes
  let rt = null;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(renderPreview, 150);
  });

  // Mobile tabs
  const tabE = document.getElementById("tabEditor"), tabP = document.getElementById("tabPreview");
  const paneE = document.getElementById("editorPane"), paneP = document.getElementById("previewPane");
  tabE.addEventListener("click", () => {
    tabE.classList.add("on"); tabP.classList.remove("on");
    paneE.classList.add("active"); paneP.classList.remove("active");
  });
  tabP.addEventListener("click", () => {
    tabP.classList.add("on"); tabE.classList.remove("on");
    paneP.classList.add("active"); paneE.classList.remove("active");
  });
  if (window.matchMedia("(min-width: 861px)").matches) paneP.classList.add("active");

  renderPreview();
});
