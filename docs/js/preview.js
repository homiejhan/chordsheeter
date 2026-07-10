/* Preview renderer — draws the SAME layout the PDF uses, as true-size
 * pages (612x792pt, 1pt = 1px) scaled to fit the pane. Page breaks and
 * column breaks in the preview are exactly where they land in the PDF. */

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderPreview() {
  const editor = document.getElementById("editor");
  const container = document.getElementById("pages");
  const pageCount = document.getElementById("pageCount");

  if (!editor.value.trim()) {
    container.innerHTML =
      '<div class="empty-state">Search for a song above, or start typing.<br>Use <b>{title: …}</b> and <b>[G]</b> chord brackets.</div>';
    if (pageCount) pageCount.textContent = "";
    return;
  }

  const song = parseSong(editor.value);
  const layout = computeLayout(song, getBodySize());
  const m = layout.metrics;

  /* Scale pages to fit the pane width */
  const paneW = container.parentElement.clientWidth - 40;
  const scale = Math.min(1, paneW / PAGE.W);

  let html = "";
  layout.pages.forEach((pg, idx) => {
    let inner = "";

    /* Header on page 1 (fixed sizes: title 20pt, artist 10.5pt, meta 9.5pt) */
    if (idx === 0 && layout.header.height > 0) {
      const h = layout.header;
      let hh = "";
      if (h.title) hh += `<div class="pv-title">${escHtml(h.title)}</div>`;
      if (h.subtitle) hh += `<div class="pv-sub">${escHtml(h.subtitle)}</div>`;
      if (h.meta.length) hh += `<div class="pv-meta">${escHtml(h.meta.join("      "))}</div>`;
      inner += `<div class="pv-header" style="left:${PAGE.M}px;top:${PAGE.M}px;width:${PAGE.W - 2 * PAGE.M}px;height:${h.height}px">${hh}</div>`;
    }

    /* Columns */
    for (const col of pg.cols) {
      let ch = "";
      for (const b of col.blocks) {
        if (b.type === "blank") {
          ch += `<div style="height:${b.h}px"></div>`;
        } else if (b.type === "section") {
          ch += `<div class="pv-section" style="height:${b.h}px;padding-top:${m.sectionPre}px;font-size:${m.sectionSize}px">${escHtml(b.text)}</div>`;
        } else if (b.type === "comment") {
          ch += `<div class="pv-comment" style="height:${b.h}px;font-size:${m.commentSize}px">${escHtml(b.text)}</div>`;
        } else if (b.type === "lyricrow") {
          ch += `<div class="pv-lyricrow" style="height:${b.h}px;font-size:${m.lyricSize}px;line-height:${m.lyricH}px">${escHtml(b.text)}</div>`;
        } else if (b.type === "row") {
          const chordTop = 0, lyricTop = b.hasChord ? m.chordH : 0;
          let segs = "";
          for (const s of b.segs) {
            segs += `<span class="pv-seg" style="left:${s.x}px;width:${s.w}px">`;
            if (b.hasChord)
              segs += `<span class="pv-chord" style="top:${chordTop}px;height:${m.chordH}px;font-size:${m.chordSize}px;line-height:${m.chordH}px">${escHtml(s.chord)}</span>`;
            segs += `<span class="pv-lyr" style="top:${lyricTop}px;font-size:${m.lyricSize}px;line-height:${m.lyricH}px">${escHtml(s.lyric)}</span></span>`;
          }
          ch += `<div class="pv-row" style="height:${b.h}px">${segs}</div>`;
        }
      }
      inner += `<div class="pv-col" style="left:${col.x}px;top:${col.top}px;width:${layout.colW}px">${ch}</div>`;
    }

    html += `
      <div class="page-scale" style="width:${PAGE.W * scale}px;height:${PAGE.H * scale}px">
        <div class="page" style="transform:scale(${scale})">${inner}</div>
      </div>
      <div class="page-num">Page ${idx + 1} of ${layout.pages.length}</div>`;
  });

  container.innerHTML = html;
  if (pageCount) pageCount.textContent =
    "· " + layout.pages.length + (layout.pages.length === 1 ? " page" : " pages");
}
