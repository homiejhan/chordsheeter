/* API client — STATIC VERSION for GitHub Pages.
 *
 * Same interface as the server version (searchSongs, getSong, transpose),
 * but everything runs in the browser: the song library is fetched from
 * data/songs.json and transposition is done in JS (a port of
 * backend/app/services/transpose_service.py). No other frontend module
 * knows the difference.
 */

/* ---------- Song library ---------- */
let _songsPromise = null;

function _loadSongs() {
  if (!_songsPromise) {
    _songsPromise = fetch("data/songs.json").then((r) => {
      if (!r.ok) throw new Error("Could not load song library");
      return r.json();
    });
  }
  return _songsPromise;
}

/* ---------- Transposition engine (JS port) ---------- */
const _NOTE_TO_PC = {
  C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3,
  E: 4, Fb: 4, F: 5, "E#": 5, "F#": 6, Gb: 6, G: 7,
  "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11,
};
const _SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const _FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const _FLAT_KEYS = new Set([
  "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb",
  "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm",
]);
const _CHORD_RE = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/;
const _KEY_RE = /^([A-G][#b]?)(m?)$/i;

function _normKey(k) {
  const m = _KEY_RE.exec(k.trim());
  if (!m) return k.trim();
  return m[1][0].toUpperCase() + m[1].slice(1) + m[2].toLowerCase();
}
function _usesFlats(key) {
  if (!key) return false;
  const k = _normKey(key);
  return _FLAT_KEYS.has(k) || k.slice(1).includes("b");
}
function _shiftNote(note, semis, useFlats) {
  const pc = _NOTE_TO_PC[note[0].toUpperCase() + note.slice(1)];
  if (pc === undefined) return null;
  const npc = ((pc + semis) % 12 + 12) % 12;
  return (useFlats ? _FLAT : _SHARP)[npc];
}
function _transposeChord(chord, semis, useFlats) {
  const m = _CHORD_RE.exec(chord.trim());
  if (!m) return chord;
  const [, root, quality, bass] = m;
  const newRoot = _shiftNote(root, semis, useFlats);
  if (!newRoot) return chord;
  let out = newRoot + quality;
  if (bass) {
    const nb = _shiftNote(bass, semis, useFlats);
    out += "/" + (nb || bass);
  }
  return out;
}
function _semitonesBetween(fromKey, toKey) {
  const fm = _KEY_RE.exec(fromKey.trim()), tm = _KEY_RE.exec(toKey.trim());
  if (!fm || !tm) return null;
  const f = _NOTE_TO_PC[fm[1][0].toUpperCase() + fm[1].slice(1)];
  const t = _NOTE_TO_PC[tm[1][0].toUpperCase() + tm[1].slice(1)];
  if (f === undefined || t === undefined) return null;
  return ((t - f) % 12 + 12) % 12;
}
function _extractKey(text) {
  const m = /\{\s*key\s*:\s*([^}]+)\}/i.exec(text);
  return m ? m[1].trim() : null;
}
function _transposeText(text, semis, targetKey = null) {
  const useFlats = _usesFlats(targetKey);
  let out = text.replace(/\[([^\]]*)\]/g, (full, inner) =>
    inner.trim() ? "[" + _transposeChord(inner, semis, useFlats) + "]" : full
  );
  let replaced = false;
  out = out.replace(/\{\s*key\s*:\s*([^}]+)\}/i, (full, old) => {
    if (replaced) return full;
    replaced = true;
    if (targetKey) return "{key: " + targetKey + "}";
    const km = _KEY_RE.exec(old.trim());
    if (km) {
      const nr = _shiftNote(km[1][0].toUpperCase() + km[1].slice(1), semis, useFlats);
      if (nr) return "{key: " + nr + km[2] + "}";
    }
    return full;
  });
  return out;
}

/* ---------- Public API (same surface as the server version) ---------- */
/* ---------- Online metadata search (iTunes Search API — free, no key) ---------- */
async function _searchOnline(title, artist) {
  const term = [title, artist].filter(Boolean).join(" ").trim();
  if (!term) return [];
  const url =
    "https://itunes.apple.com/search?" +
    new URLSearchParams({ term, entity: "song", media: "music", limit: "8" });
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const aq = (artist || "").trim().toLowerCase();
    const seen = new Set();
    const out = [];
    for (const item of data.results || []) {
      const name = (item.trackName || "").trim();
      const art = (item.artistName || "").trim();
      if (!name || !art) continue;
      if (aq && !art.toLowerCase().includes(aq)) continue;
      const k = name.toLowerCase() + "|" + art.toLowerCase();
      if (seen.has(k)) continue; // same song on multiple albums
      seen.add(k);
      out.push({
        id: "online-" + (item.trackId ?? out.length),
        title: name, artist: art, key: "",
        source: "online", artwork: item.artworkUrl60 || null,
      });
    }
    return out;
  } catch {
    return []; // offline or blocked — degrade to library-only
  }
}

const API = {
  async searchSongs(title, artist) {
    const songs = await _loadSongs();
    const tq = (title || "").trim().toLowerCase();
    const aq = (artist || "").trim().toLowerCase();
    if (!tq && !aq) return [];
    const local = songs
      .filter(
        (s) =>
          (!tq || s.title.toLowerCase().includes(tq)) &&
          (!aq || s.artist.toLowerCase().includes(aq))
      )
      .map(({ id, title, artist, key }) => ({ id, title, artist, key, source: "library" }));
    local.sort((a, b) => {
      if (tq) {
        const ap = a.title.toLowerCase().startsWith(tq) ? 0 : 1;
        const bp = b.title.toLowerCase().startsWith(tq) ? 0 : 1;
        if (ap !== bp) return ap - bp;
      }
      return a.title.localeCompare(b.title);
    });

    const online = await _searchOnline(title, artist);
    // Library wins on duplicates (it has the full chart; online is metadata only)
    const have = new Set(local.map((s) => s.title.toLowerCase() + "|" + s.artist.toLowerCase()));
    return local.concat(online.filter((s) => !have.has(s.title.toLowerCase() + "|" + s.artist.toLowerCase())));
  },

  async getSong(id) {
    const songs = await _loadSongs();
    const song = songs.find((s) => s.id === id);
    if (!song) throw new Error("Song not found");
    return song;
  },

  async transpose({ text, toKey = null, semitones = null }) {
    const fromKey = _extractKey(text);

    if (toKey) {
      if (!fromKey)
        throw new Error("No {key: ...} directive found — add one, or use the +/− buttons instead.");
      const semis = _semitonesBetween(fromKey, toKey);
      if (semis === null) throw new Error("Unrecognized key name.");
      return {
        text: _transposeText(text, semis, toKey),
        from_key: fromKey, to_key: toKey, semitones: semis,
      };
    }

    if (semitones !== null) {
      const semis = ((semitones % 12) + 12) % 12;
      const newText = _transposeText(text, semis);
      return {
        text: newText, from_key: fromKey,
        to_key: _extractKey(newText), semitones: semis,
      };
    }

    throw new Error("Provide either toKey or semitones.");
  },
};
