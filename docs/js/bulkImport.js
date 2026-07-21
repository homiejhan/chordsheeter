/* Bulk Import — converts a pasted multi-song chart export (Planning Center /
 * CCLI SongSelect style: chords on their own line above lyrics, sections
 * like "Verse 1" / "Chorus", a "Title [Key, tempo bpm, time]" header per
 * song) into the ChordPro-bracket text this app already understands.
 *
 * Runs entirely client-side — nothing you paste here is sent anywhere.
 * It's a best-effort formatter, not a perfect one: hand-charted songs vary
 * a lot, so always review the result in the editor before saving. Anything
 * it can't confidently classify is left as plain text rather than guessed.
 *
 * Handles a common PDF-export quirk where every space in the chord/lyric
 * body has been flattened to a literal "." (e.g. "I.have.never.walked");
 * those are restored to spaces column-for-column before parsing.
 */

/* ---------- chord / token recognition ---------- */

const BI_CHORD_RE =
  /^[A-G](?:#|b)?(?:maj7|maj9|maj|min7|min9|min|dim7|dim|aug|sus4|sus2|sus7|sus|add\d+|m7b5|m7|m9|m6|m|6|7|9|11|13)*(?:\/[A-G](?:#|b)?)?$/;

const BI_FILLER_RE = /^(?:\/+|[xX×]\d+|\(\d+[xX]\)|%|NOCHORDMARK)$/;

const BI_SECTION_WORDS = new Set([
  "verse", "chorus", "pre chorus", "prechorus", "post chorus", "postchorus",
  "bridge", "intro", "outro", "tag", "interlude", "instrumental", "refrain",
  "ending", "vamp", "turnaround", "link", "breakdown",
]);

/* Song header, e.g. "Here In My Life [G, 73 bpm, 4/4]" — tempo and time
 * are optional ("Tis So Sweet [B]" has neither), and the title itself may
 * contain its own bracketed note ("... (Moment) [Live] [D, 60 bpm, 4/4]").
 * Stray page numbers or blank lines that PDF extraction glues onto the
 * front of a title are handled positionally in biSplitSongs, not here. */
const BI_HEADER_RE =
  /([A-Z][A-Za-z0-9'’\/,.()&\-\[\] ]*?)\s*\[\s*([A-G](?:#|b)?)\s*(?:,\s*([\d.]+)\s*bpm)?\s*(?:,\s*(\d\/\d))?\s*\]/g;

/* Artist line right after the header, e.g. "[Hillsong Worship] by Mia
 * Fieldes" or just "[Worship Initiative]". */
const BI_ARTIST_RE = /^\[([^\]]+)\](?:\s*by\s+(.+))?$/i;

const BI_COPYRIGHT_RE = /^\s*©|CCLI\s+(Song|License)\s*#/i;
const BI_PAGENUM_RE = /^\d{1,3}$/;

/* ---------- helpers ---------- */

/* Every "." in body text stands in for a space in this export format,
 * EXCEPT inside "N.C." (no chord). Protect that first. */
function biDotsToSpaces(line) {
  return line
    .replace(/N\.C\.?/gi, "NOCHORDMARK")
    .replace(/\./g, " ")
    .replace(/NOCHORDMARK/g, "N.C.");
}

function biIsChordToken(tok) {
  return BI_CHORD_RE.test(tok);
}

function biIsFillerToken(tok) {
  return BI_FILLER_RE.test(tok.replace(/N\.C\.?/gi, "NOCHORDMARK"));
}

/* True only if EVERY token on the line is a chord or a rhythm/repeat
 * marker (///,  x2, N.C., ...) — mixed lines fall through as lyrics. */
function biIsChordOnlyLine(line) {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  let chordCount = 0;
  for (const tok of toks) {
    if (biIsChordToken(tok)) chordCount++;
    else if (biIsFillerToken(tok)) continue;
    else return false;
  }
  return chordCount > 0;
}

/* Normalizes a candidate section line to the "Name Ndigits xN (note)" shape
 * parser.js's own SECTION_RE expects, or returns null if it isn't one. */
function biNormalizeSection(line) {
  let t = line.trim();
  if (!t) return null;

  const parenMatch = t.match(/\(([^)]*)\)/);
  let core = t.replace(/\([^)]*\)/g, " ");
  const repeatMatch = core.match(/[×xX]\s*(\d+)/);
  const withoutRepeat = core.replace(/[×xX]\s*\d+/g, " "); // strip "x2"/"X4" before hunting for a verse/tag number
  core = withoutRepeat.replace(/\b\d+\b/g, " ");
  const wordCore = core.replace(/[.,:!\-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

  if (!BI_SECTION_WORDS.has(wordCore)) return null;

  // Rebuild a clean display label, preserving verse/tag numbers if present.
  const numMatch = withoutRepeat.match(/\b(\d+)\b/);
  let label = wordCore.replace(/\b\w/g, (c) => c.toUpperCase());
  if (numMatch) label += " " + numMatch[1];
  if (repeatMatch) label += ` x${repeatMatch[1]}`;
  else if (parenMatch) label += ` (${parenMatch[1].trim()})`;
  return label;
}

function biLooksLikeRoadmap(line) {
  const t = line.trim();
  if (!t.includes(",")) return false;
  const toks = t.split(",").map((s) => s.trim()).filter(Boolean);
  if (toks.length < 3) return false;
  return toks.every((tok) => /^[A-Za-z]{1,3}\d*(?:[×xX]\d+)?$/.test(tok));
}

/* ---------- chord + lyric column merge ---------- */

function biMergeChordLyric(chordLine, lyricLine) {
  const tokens = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(chordLine))) tokens.push({ text: m[0], col: m.index });

  let result = "";
  let pos = 0;
  for (const tok of tokens) {
    const isChord = biIsChordToken(tok.text);
    const insert = isChord ? `[${tok.text}]` : tok.text + " ";
    const col = Math.min(tok.col, lyricLine.length);
    if (col > pos) { result += lyricLine.slice(pos, col); pos = col; }
    result += insert;
  }
  result += lyricLine.slice(pos);
  return result;
}

function biInstrumentalLine(chordLine) {
  const toks = chordLine.trim().split(/\s+/).filter(Boolean);
  return toks.map((t) => (biIsChordToken(t) ? `[${t}]` : t)).join(" ");
}

/* ---------- per-song body conversion ---------- */

function biConvertBody(rawBodyLines) {
  const out = [];
  const lines = rawBodyLines.map((l) => (l.trim() ? biDotsToSpaces(l) : ""));
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { out.push(""); i++; continue; }
    if (BI_COPYRIGHT_RE.test(line) || BI_PAGENUM_RE.test(line.trim())) { i++; continue; }

    const section = biNormalizeSection(line);
    if (section) { out.push(section); i++; continue; }

    if (biIsChordOnlyLine(line)) {
      const next = lines[i + 1];
      const nextIsLyric =
        next !== undefined && next.trim() &&
        !biIsChordOnlyLine(next) && !biNormalizeSection(next) &&
        !BI_COPYRIGHT_RE.test(next);
      if (nextIsLyric) {
        out.push(biMergeChordLyric(line, next));
        i += 2;
      } else {
        out.push(biInstrumentalLine(line));
        i++;
      }
      continue;
    }

    // Plain text we didn't confidently classify — keep as-is (best effort).
    out.push(line.trim());
    i++;
  }
  // trim leading/trailing blank lines
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join("\n");
}

/* ---------- splitting + header extraction ---------- */

/* Splits on character position (not line search), using the offset of the
 * TITLE TEXT itself within each match — so stray page numbers, blank
 * lines, or form-feeds that PDF extraction glues onto the front of a
 * title never leak into either song's chunk. */
function biSplitSongs(raw) {
  const text = raw.replace(/\r\n/g, "\n");
  const matches = [...text.matchAll(BI_HEADER_RE)];
  if (!matches.length) return [];

  const starts = matches.map((m) => m.index + m[0].indexOf(m[1]));
  const blocks = [];
  for (let i = 0; i < matches.length; i++) {
    const start = starts[i];
    const end = i + 1 < matches.length ? starts[i + 1] : text.length;
    // Long titles sometimes wrap the "[Key, tempo bpm, time]" bracket
    // across two physical lines — skip past the header by character
    // offset (end of the regex match), not by counting lines.
    const headerEnd = matches[i].index + matches[i][0].length;
    blocks.push({ match: matches[i], afterHeader: text.slice(headerEnd, end) });
  }
  return blocks;
}

function biParseSongBlock(block) {
  const m = block.match;
  const title = m[1].trim().replace(/\s+/g, " ");
  const key = m[2];
  const tempo = m[3] || "";
  const time = m[4] || "";

  const lines = block.afterHeader.split("\n");

  let artist = "";
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines.length) {
    const am = lines[0].trim().match(BI_ARTIST_RE);
    if (am) {
      const bracket = am[1].trim();
      const byPart = am[2] ? am[2].trim().replace(/\s+/g, " ") : "";
      // "[Default Arrangement]" etc. isn't an artist name — prefer the
      // "by ..." writer credit when the bracket is just a placeholder.
      artist = /^default arrangement$/i.test(bracket) && byPart ? byPart : bracket || byPart;
      lines.shift();
    }
  }
  // Optional roadmap line right after the artist line.
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines.length && biLooksLikeRoadmap(lines[0])) lines.shift();

  const body = biConvertBody(lines);
  return { title, artist: artist || "Unknown", key, tempo, time, body };
}

function biSlugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "untitled";
}

/* Public entry point: raw pasted text -> array of songs.json-shaped entries. */
function bulkImportText(raw) {
  const blocks = biSplitSongs(raw);
  return blocks.map((b) => {
    const song = biParseSongBlock(b);
    const entry = { id: biSlugify(song.title), title: song.title, artist: song.artist, key: song.key };
    if (song.tempo) entry.tempo = song.tempo;
    if (song.time) entry.time = song.time;
    entry.body = song.body;
    return entry;
  });
}

if (typeof module !== "undefined") module.exports = { bulkImportText };
