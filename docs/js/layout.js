/* Shared layout engine — the single source of truth for pagination.
 *
 * Turns a parsed song into pages -> two columns -> positioned blocks,
 * using real text measurements. Both the preview (HTML) and the PDF
 * (jsPDF) render THIS structure, so the preview shows exactly where
 * page breaks and column breaks land. Planning Center style: fill the
 * left column, then the right column, then start a new page.
 *
 * All units are points (US Letter = 612 x 792). The preview renders
 * 1pt = 1px and scales the whole page to fit.
 */

const PAGE = { W: 612, H: 792, M: 54, GUTTER: 26 };

/* Body text size (lyrics/chords/sections/comments). Title, artist, and
 * key metadata stay fixed. Changed via setBodySize() from the UI. */
let BODY_SIZE = 11;
function setBodySize(v) {
  BODY_SIZE = Math.min(16, Math.max(8, v));
  return BODY_SIZE;
}
function getBodySize() { return BODY_SIZE; }

/* ---------- Metrics: every dimension derives from the body size ---------- */
function layoutMetrics(bodySize) {
  const f = bodySize / 11.5;
  return {
    lyricSize: bodySize,
    chordSize: Math.max(7, Math.round(bodySize * 0.91 * 10) / 10),
    sectionSize: Math.max(7.5, Math.round(bodySize * 0.85 * 10) / 10),
    commentSize: Math.max(7.5, Math.round(bodySize * 0.85 * 10) / 10),
    lyricH: bodySize * 1.3,
    chordH: bodySize * 1.15,
    pairGap: 5 * f,
    blankH: 10 * f,
    sectionPre: 8 * f,
    sectionH: 20 * f,
    commentH: 16 * f,
    chordPad: 6,
  };
}

/* ---------- Text measurement (jsPDF Helvetica; canvas fallback) ---------- */
let _mdoc = null;
function _measurer() {
  if (typeof window !== "undefined" && window.jspdf) {
    if (!_mdoc) _mdoc = new window.jspdf.jsPDF({ unit: "pt", format: "letter" });
    const d = _mdoc;
    return {
      lyric(s, size) { d.setFont("helvetica", "normal"); d.setFontSize(size); return d.getTextWidth(s); },
      chord(s, size) { d.setFont("helvetica", "bold"); d.setFontSize(size); return d.getTextWidth(s); },
    };
  }
  const ctx = document.createElement("canvas").getContext("2d");
  return {
    lyric(s, size) { ctx.font = size + "px Helvetica, Arial, sans-serif"; return ctx.measureText(s).width; },
    chord(s, size) { ctx.font = "bold " + size + "px Helvetica, Arial, sans-serif"; return ctx.measureText(s).width; },
  };
}

/* ---------- Wrapping ---------- */

/* Chord/lyric segments -> rows. The lyric is ONE continuous string (never
 * stretched or chopped), and chords float above it: each chord anchors at
 * its syllable's x position, pushed right only as needed to clear the
 * previous chord. */
function _wrapSegRows(segs, colW, meas, m) {
  const CHORD_GAP = m.chordPad;
  const rows = [];
  let cur = { lyric: "", chords: [], chordEnd: -CHORD_GAP };

  const pushRow = () => {
    cur.lyric = cur.lyric.replace(/\s+$/, "");
    rows.push(cur);
    cur = { lyric: "", chords: [], chordEnd: -CHORD_GAP };
  };

  for (const seg of segs) {
    /* Place the chord, anchored where its lyric will start; wrap first if
     * the chord itself can't fit on this row. */
    if (seg.chord) {
      const cw = meas.chord(seg.chord, m.chordSize);
      let chordX = Math.max(meas.lyric(cur.lyric, m.lyricSize), cur.chordEnd + CHORD_GAP);
      if (chordX + cw > colW && (cur.lyric.trim() || cur.chords.length)) {
        pushRow();
        chordX = 0;
      }
      cur.chords.push({ text: seg.chord, x: chordX });
      cur.chordEnd = chordX + cw;
    }

    /* Append the lyric word by word, wrapping whenever the next word
     * would exceed the column. The lyric string itself is never altered —
     * only split at whitespace between rows. */
    for (const tok of seg.lyric.split(/(\s+)/)) {
      if (!tok) continue;
      if (meas.lyric(cur.lyric + tok, m.lyricSize) > colW && cur.lyric.trim()) {
        pushRow();
        if (!tok.trim()) continue; // never start a row with whitespace
      }
      cur.lyric += tok;
    }
  }
  if (cur.lyric.trim() || cur.chords.length) pushRow();

  return rows.map((r) => {
    const hasChord = r.chords.length > 0;
    const hasLyric = r.lyric.trim().length > 0;
    return {
      type: "row", lyric: r.lyric, chords: r.chords, hasChord, hasLyric,
      h: (hasChord ? m.chordH : 0) + (hasLyric ? m.lyricH : 0) + m.pairGap,
    };
  });
}

/* Plain lyric line -> greedy word wrap. */
function _wrapPlain(text, colW, meas, m) {
  const words = text.split(/(\s+)/);
  const out = [];
  let cur = "";
  for (const w of words) {
    if (meas.lyric(cur + w, m.lyricSize) > colW && cur.trim()) {
      out.push(cur.replace(/\s+$/, ""));
      cur = w.replace(/^\s+/, "");
    } else cur += w;
  }
  if (cur.trim() || out.length === 0) out.push(cur.replace(/\s+$/, ""));
  return out;
}

/* ---------- The layout ---------- */
function computeLayout(song, bodySize) {
  const m = layoutMetrics(bodySize);
  const meas = _measurer();
  const colW = (PAGE.W - 2 * PAGE.M - PAGE.GUTTER) / 2;
  const colX = [PAGE.M, PAGE.M + colW + PAGE.GUTTER];

  /* Header (page 1, full width, FIXED sizes — not affected by bodySize) */
  const header = { title: song.title, subtitle: song.subtitle, meta: [] };
  if (song.key) header.meta.push("Key: " + song.key);
  if (song.tempo) header.meta.push("Tempo: " + song.tempo);
  if (song.time) header.meta.push("Time: " + song.time);
  let hy = 0;
  if (header.title) hy += 24;
  if (header.subtitle) hy += 16;
  if (header.meta.length) hy += 18;
  if (hy > 0) hy += 22; // divider rule + spacing
  header.height = hy;

  const bottom = PAGE.H - PAGE.M;

  /* Song lines -> flat block list (already wrapped to column width) */
  const blocks = [];
  for (const ln of song.lines) {
    if (ln.type === "blank") blocks.push({ type: "blank", h: m.blankH });
    else if (ln.type === "section")
      blocks.push({ type: "section", text: ln.text, note: ln.note || "", h: m.sectionPre + m.sectionH });
    else if (ln.type === "comment")
      blocks.push({ type: "comment", text: ln.text, h: m.commentH });
    else if (ln.type === "lyric")
      for (const t of _wrapPlain(ln.text, colW, meas, m))
        blocks.push({ type: "lyricrow", text: t, h: m.lyricH + m.pairGap });
    else if (ln.type === "pair")
      for (const row of _wrapSegRows(ln.segs, colW, meas, m)) blocks.push(row);
  }

  /* Flow blocks: left column -> right column -> new page */
  const pages = [];
  let page = null, colIdx = 0, y = 0;

  function newPage() {
    const top = pages.length === 0 ? PAGE.M + header.height : PAGE.M;
    page = { cols: [{ x: colX[0], top, blocks: [] }, { x: colX[1], top, blocks: [] }] };
    pages.push(page);
    colIdx = 0;
    y = top;
  }
  function advanceColumn() {
    if (colIdx === 0) { colIdx = 1; y = page.cols[1].top; }
    else newPage();
  }

  newPage();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const col = () => page.cols[colIdx];
    if (b.type === "blank" && col().blocks.length === 0) continue; // never start a column with a gap

    /* Keep a section label attached to its first line (no orphan headers) */
    let need = b.h;
    if (b.type === "section" && blocks[i + 1] && blocks[i + 1].h) need += blocks[i + 1].h;

    if (y + need > bottom && col().blocks.length > 0) {
      advanceColumn();
      if (b.type === "blank") continue;
    }
    page.cols[colIdx].blocks.push(b);
    y += b.h;
  }

  return { metrics: m, header, colW, pages };
}
