/* Export the current editor content as a songs.json library entry.
 *
 * Downloads a single JSON object matching the songs.json schema. To add it
 * to your library, paste the object into the array in docs/data/songs.json
 * (both the backend and the Pages build read that one file).
 */
function exportSongJson() {
  const editorText = document.getElementById("editor").value;
  if (!editorText.trim()) { showToast("Nothing to save yet."); return; }

  const song = parseSong(editorText);
  if (!song.title) { showToast("Add a {title: ...} directive first."); return; }

  const id = slugify(song.title);
  const entry = {
    id,
    title: song.title,
    artist: song.subtitle || "Unknown",
    key: song.key || "",
  };
  if (song.tempo) entry.tempo = song.tempo;
  if (song.time) entry.time = song.time;
  entry.body = stripHeaderDirectives(editorText);

  const json = JSON.stringify(entry, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = id + ".json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Saved — paste the object into docs/data/songs.json");
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "untitled";
}

/* Remove directives already captured as JSON fields, so the body holds only
 * sections, lyrics, and chords — same shape as the seed library entries. */
function stripHeaderDirectives(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept = lines.filter(
    (ln) => !/^\{\s*(title|t|artist|author|subtitle|st|key|tempo|time)\s*:/i.test(ln.trim())
  );
  // Trim leading/trailing blank lines left behind
  while (kept.length && !kept[0].trim()) kept.shift();
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  return kept.join("\n");
}
