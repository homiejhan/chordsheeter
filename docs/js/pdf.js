/* PDF generation — renders the SAME layout the preview shows.
 * No layout logic here: computeLayout() decides everything. */
function downloadPdf() {
  const song = parseSong(document.getElementById("editor").value);
  const layout = computeLayout(song, getBodySize());
  const m = layout.metrics;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  layout.pages.forEach((pg, idx) => {
    if (idx > 0) doc.addPage();

    /* Header on page 1 (fixed sizes, matches preview) */
    if (idx === 0 && layout.header.height > 0) {
      const h = layout.header;
      let y = PAGE.M;
      if (h.title) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(22, 34, 47);
        doc.text(h.title, PAGE.M, y + 16);
        y += 24;
      }
      if (h.subtitle) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(93, 104, 117);
        doc.text(h.subtitle, PAGE.M, y + 10);
        y += 16;
      }
      if (h.meta.length) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(22, 34, 47);
        doc.text(h.meta.join("      "), PAGE.M, y + 11);
        y += 18;
      }
      y += 6;
      doc.setDrawColor(210, 216, 224); doc.setLineWidth(0.8);
      doc.line(PAGE.M, y, PAGE.W - PAGE.M, y);
    }

    /* Columns */
    for (const col of pg.cols) {
      let y = col.top;
      for (const b of col.blocks) {
        if (b.type === "section") {
          doc.setFont("helvetica", "bold"); doc.setFontSize(m.sectionSize); doc.setTextColor(138, 63, 252);
          doc.text(b.text.toUpperCase(), col.x, y + m.sectionPre + m.sectionSize, { charSpace: 0.8 });
        } else if (b.type === "comment") {
          doc.setFont("helvetica", "italic"); doc.setFontSize(m.commentSize); doc.setTextColor(93, 104, 117);
          doc.text(b.text, col.x, y + m.commentSize + 2);
        } else if (b.type === "lyricrow") {
          doc.setFont("helvetica", "normal"); doc.setFontSize(m.lyricSize); doc.setTextColor(22, 34, 47);
          doc.text(b.text, col.x, y + m.lyricH - 3);
        } else if (b.type === "row") {
          const lyricTop = b.hasChord ? m.chordH : 0;
          for (const s of b.segs) {
            if (s.chord) {
              doc.setFont("helvetica", "bold"); doc.setFontSize(m.chordSize); doc.setTextColor(22, 80, 200);
              doc.text(s.chord, col.x + s.x, y + m.chordH - 2.5);
            }
            if (s.lyric) {
              doc.setFont("helvetica", "normal"); doc.setFontSize(m.lyricSize); doc.setTextColor(22, 34, 47);
              doc.text(s.lyric, col.x + s.x, y + lyricTop + m.lyricH - 3);
            }
          }
        }
        y += b.h;
      }
    }
  });

  const base = song.title
    ? song.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-")
    : "chord-sheet";
  const keyTag = song.key ? "-" + song.key.replace(/[^\w#b]/g, "") : "";
  doc.save(base + keyTag + ".pdf");
}
