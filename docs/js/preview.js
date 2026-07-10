/* Renders the parsed song into the paper preview. */
function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderPreview() {
  const editor = document.getElementById("editor");
  const paper = document.getElementById("paper");
  const song = parseSong(editor.value);

  if (!editor.value.trim()) {
    paper.innerHTML =
      '<div class="empty-state">Search for a song above, or start typing.<br>Use <b>{title: …}</b> and <b>[G]</b> chord brackets.</div>';
    return;
  }

  let html = "";
  if (song.title) html += `<div class="song-title">${escHtml(song.title)}</div>`;
  if (song.subtitle) html += `<div class="song-sub">${escHtml(song.subtitle)}</div>`;

  const chips = [];
  if (song.key) chips.push(`<span class="meta-chip"><span class="lbl">Key</span>${escHtml(song.key)}</span>`);
  if (song.tempo) chips.push(`<span class="meta-chip"><span class="lbl">Tempo</span>${escHtml(song.tempo)}</span>`);
  if (song.time) chips.push(`<span class="meta-chip"><span class="lbl">Time</span>${escHtml(song.time)}</span>`);
  if (chips.length) html += `<div class="song-meta">${chips.join("")}</div>`;

  html += '<div class="song-body">';
  for (const ln of song.lines) {
    if (ln.type === "blank") html += '<div class="blank-line"></div>';
    else if (ln.type === "section") html += `<div class="section-label">${escHtml(ln.text)}</div>`;
    else if (ln.type === "comment") html += `<div class="comment-line">${escHtml(ln.text)}</div>`;
    else if (ln.type === "lyric")
      html += `<div class="lyric-line"><span class="seg"><span class="lyr">${escHtml(ln.text)}</span></span></div>`;
    else if (ln.type === "pair") {
      const segHtml = ln.segs
        .map((s) => `<span class="seg"><span class="chord">${escHtml(s.chord)}</span><span class="lyr">${escHtml(s.lyric)}</span></span>`)
        .join("");
      html += `<div class="lyric-line">${segHtml}</div>`;
    }
  }
  html += "</div>";
  paper.innerHTML = html;
}
