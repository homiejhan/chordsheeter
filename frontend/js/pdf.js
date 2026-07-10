/* PDF generation — mirrors the preview layout on US Letter. */
function downloadPdf() {
  const song = parseSong(document.getElementById("editor").value);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792

  const M = 54;
  const W = 612 - M * 2;
  const BOTTOM = 792 - M;
  let y = M;

  const CHORD_SIZE = 10.5, LYRIC_SIZE = 11.5;
  const CHORD_H = 13, LYRIC_H = 15, PAIR_GAP = 5;

  function pageBreak(needed) {
    if (y + needed > BOTTOM) { doc.addPage(); y = M; }
  }

  /* ---- Header ---- */
  if (song.title) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(22, 34, 47);
    doc.text(song.title, M, y + 16);
    y += 24;
  }
  if (song.subtitle) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(93, 104, 117);
    doc.text(song.subtitle, M, y + 10);
    y += 16;
  }
  const meta = [];
  if (song.key) meta.push("Key: " + song.key);
  if (song.tempo) meta.push("Tempo: " + song.tempo);
  if (song.time) meta.push("Time: " + song.time);
  if (meta.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(22, 34, 47);
    doc.text(meta.join("      "), M, y + 11);
    y += 18;
  }
  if (song.title || song.subtitle || meta.length) {
    y += 6;
    doc.setDrawColor(210, 216, 224); doc.setLineWidth(0.8);
    doc.line(M, y, 612 - M, y);
    y += 16;
  }

  /* ---- Measurement helpers ---- */
  function lyricWidth(s) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(LYRIC_SIZE);
    return doc.getTextWidth(s);
  }
  function chordWidth(s) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(CHORD_SIZE);
    return doc.getTextWidth(s);
  }

  function wrapSegs(segs) {
    const rows = [[]];
    let x = 0;
    for (const seg of segs) {
      const w = Math.max(lyricWidth(seg.lyric), seg.chord ? chordWidth(seg.chord) + 6 : 0);
      if (x + w > W && rows[rows.length - 1].length) { rows.push([]); x = 0; }
      rows[rows.length - 1].push(seg);
      x += w;
    }
    return rows;
  }

  function drawPairRow(segs) {
    const hasChord = segs.some((s) => s.chord);
    const rowH = (hasChord ? CHORD_H : 0) + LYRIC_H + PAIR_GAP;
    pageBreak(rowH);

    let x = M;
    const chordY = y + CHORD_H - 3;
    const lyricY = y + (hasChord ? CHORD_H : 0) + LYRIC_H - 4;
    let minChordX = M;

    for (const seg of segs) {
      const lw = lyricWidth(seg.lyric);
      if (seg.chord) {
        const cx = Math.max(x, minChordX);
        doc.setFont("helvetica", "bold"); doc.setFontSize(CHORD_SIZE); doc.setTextColor(22, 80, 200);
        doc.text(seg.chord, cx, chordY);
        minChordX = cx + chordWidth(seg.chord) + 6;
      }
      if (seg.lyric) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(LYRIC_SIZE); doc.setTextColor(22, 34, 47);
        doc.text(seg.lyric, x, lyricY);
      }
      x += Math.max(lw, seg.chord && !seg.lyric.trim() ? chordWidth(seg.chord) + 6 : lw);
    }
    y += rowH;
  }

  /* ---- Body ---- */
  for (const ln of song.lines) {
    if (ln.type === "blank") { y += 10; }
    else if (ln.type === "section") {
      pageBreak(30);
      y += 8;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(138, 63, 252);
      doc.text(ln.text.toUpperCase(), M, y + 10, { charSpace: 0.8 });
      y += 20;
    }
    else if (ln.type === "comment") {
      pageBreak(16);
      doc.setFont("helvetica", "italic"); doc.setFontSize(9.5); doc.setTextColor(93, 104, 117);
      doc.text(ln.text, M, y + 10);
      y += 16;
    }
    else if (ln.type === "lyric") {
      doc.setFont("helvetica", "normal"); doc.setFontSize(LYRIC_SIZE);
      const wrapped = doc.splitTextToSize(ln.text, W);
      for (const w of wrapped) {
        pageBreak(LYRIC_H + PAIR_GAP);
        doc.setTextColor(22, 34, 47);
        doc.text(w, M, y + LYRIC_H - 4);
        y += LYRIC_H + PAIR_GAP;
      }
    }
    else if (ln.type === "pair") {
      for (const row of wrapSegs(ln.segs)) drawPairRow(row);
    }
  }

  const base = song.title
    ? song.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-")
    : "chord-sheet";
  const keyTag = song.key ? "-" + song.key.replace(/[^\w#b]/g, "") : "";
  doc.save(base + keyTag + ".pdf");
}
