/* ChordPro parser — turns editor text into a structured song object. */
const SECTION_RE = /^(verse|chorus|pre[- ]?chorus|bridge|intro|outro|tag|interlude|instrumental|refrain|ending|vamp|turnaround)(\s*\d+)?\s*:?\s*$/i;

function parseSong(text) {
  const song = { title: "", subtitle: "", key: "", tempo: "", time: "", lines: [] };
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");

  for (const raw of rawLines) {
    const line = raw.replace(/\s+$/, "");

    const dm = line.match(/^\{\s*([\w-]+)\s*:?\s*(.*?)\s*\}$/);
    if (dm) {
      const name = dm[1].toLowerCase(), val = dm[2];
      if (name === "title" || name === "t") song.title = val;
      else if (["subtitle", "st", "artist", "author"].includes(name)) song.subtitle = val;
      else if (name === "key") song.key = val;
      else if (name === "tempo") song.tempo = val;
      else if (name === "time") song.time = val;
      else if (name === "comment" || name === "c") song.lines.push({ type: "comment", text: val });
      else if (name.startsWith("start_of_"))
        song.lines.push({ type: "section", text: prettySection(name.slice(9)) });
      continue;
    }

    if (line.trim() === "") { song.lines.push({ type: "blank" }); continue; }

    if (SECTION_RE.test(line.trim())) {
      song.lines.push({ type: "section", text: line.trim().replace(/:$/, "") });
      continue;
    }

    if (line.includes("[")) song.lines.push({ type: "pair", segs: parseChordLine(line) });
    else song.lines.push({ type: "lyric", text: line });
  }
  return song;
}

function prettySection(s) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* Splits "[G]Amazing [C]grace" into segments {chord, lyric} */
function parseChordLine(line) {
  const segs = [];
  const re = /\[([^\]]*)\]/g;
  let last = 0, m, pending = null;

  while ((m = re.exec(line)) !== null) {
    const before = line.slice(last, m.index);
    if (pending === null) {
      if (before) segs.push({ chord: "", lyric: before });
    } else {
      segs.push({ chord: pending, lyric: before });
    }
    pending = m[1];
    last = re.lastIndex;
  }
  const tail = line.slice(last);
  if (pending !== null) segs.push({ chord: pending, lyric: tail });
  else if (tail) segs.push({ chord: "", lyric: tail });
  return segs;
}
