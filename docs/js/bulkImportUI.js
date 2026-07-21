/* Bulk Import modal — wires the textarea/convert/download UI to
 * bulkImportText() in bulkImport.js. Entirely client-side. */
function initBulkImport() {
  const openBtn = document.getElementById("bulkImportBtn");
  const closeBtn = document.getElementById("bulkClose");
  const modal = document.getElementById("bulkModal");
  const input = document.getElementById("bulkInput");
  const convertBtn = document.getElementById("bulkConvertBtn");
  const status = document.getElementById("bulkStatus");
  const results = document.getElementById("bulkResults");
  const downloadRow = document.getElementById("bulkDownloadRow");
  const downloadBtn = document.getElementById("bulkDownloadBtn");

  let lastEntries = [];

  function open() { modal.hidden = false; input.focus(); }
  function close() { modal.hidden = true; }

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) close(); });

  convertBtn.addEventListener("click", () => {
    const raw = input.value;
    if (!raw.trim()) { status.textContent = "Paste some chord chart text first."; return; }

    let entries = [];
    try {
      entries = bulkImportText(raw);
    } catch {
      status.textContent = "Couldn't parse that — check the format and try again.";
      return;
    }

    if (!entries.length) {
      status.textContent = "No songs recognized. Each song needs a header line like \"Title [G, 73 bpm, 4/4]\".";
      results.innerHTML = "";
      downloadRow.hidden = true;
      return;
    }

    lastEntries = entries;
    status.textContent = `${entries.length} song${entries.length === 1 ? "" : "s"} found — review below, then download.`;
    results.innerHTML = entries.map((e, i) => {
      const lineCount = e.body.split("\n").filter((l) => l.trim()).length;
      const meta = [e.key, e.tempo && `${e.tempo} bpm`, e.time].filter(Boolean).join(" · ");
      return `
        <div class="bi-card">
          <div class="bi-card-text">
            <span class="bi-card-title">${escHtml(e.title)}</span>
            <span class="bi-card-artist">${escHtml(e.artist)} ${meta ? "· " + escHtml(meta) : ""}</span>
            <span class="bi-card-lines">${lineCount} lines converted</span>
          </div>
          <button class="btn btn-ghost bi-card-btn" data-idx="${i}">Load in editor</button>
        </div>`;
    }).join("");
    downloadRow.hidden = false;
  });

  results.addEventListener("click", (e) => {
    const btn = e.target.closest(".bi-card-btn");
    if (!btn) return;
    const song = lastEntries[Number(btn.dataset.idx)];
    loadSongIntoEditor(song);
    close();
    showToast(`Loaded "${song.title}" — review it, then Save JSON.`);
  });

  downloadBtn.addEventListener("click", () => {
    if (!lastEntries.length) return;
    const json = JSON.stringify(lastEntries, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk-import.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Saved — paste these objects into the array in docs/data/songs.json");
  });
}

document.addEventListener("DOMContentLoaded", initBulkImport);
