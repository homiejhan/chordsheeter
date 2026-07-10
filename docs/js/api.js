/* Unified API client — works in two modes, auto-detected at load:
 *
 *   SERVER MODE  — the FastAPI backend is reachable (local dev or a cloud
 *                  deploy). All calls go to /api/... endpoints.
 *   STATIC MODE  — no backend (GitHub Pages). The song library is fetched
 *                  from data/songs.json, online search calls the iTunes
 *                  Search API directly, and transposition runs in JS.
 *
 * Every other module just calls API.* and never knows the difference.
 */

/* ---------- Mode detection (runs once) ---------- */
const _modePromise = (async () => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch("api/health", { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok ? "server" : "static";
  } catch {
    return "static";
  }
})();

/* ================= STATIC-MODE IMPLEMENTATION ================= */

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

/* ---------- Transposition engine (JS port of transpose_service.py) ---------- */
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

async function _staticSearch(title, artist) {
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
  const have = new Set(local.map((s) => s.title.toLowerCase() + "|" + s.artist.toLowerCase()));
  return local.concat(online.filter((s) => !have.has(s.title.toLowerCase() + "|" + s.artist.toLowerCase())));
}

async function _staticGet(id) {
  const songs = await _loadSongs();
  const song = songs.find((s) => s.id === id);
  if (!song) throw new Error("Song not found");
  return song;
}

async function _staticTranspose({ text, toKey = null, semitones = null }) {
  const fromKey = _extractKey(text);
  if (toKey) {
    if (!fromKey)
      throw new Error("No {key: ...} directive found — add one, or use the +/− buttons instead.");
    const semis = _semitonesBetween(fromKey, toKey);
    if (semis === null) throw new Error("Unrecognized key name.");
    return { text: _transposeText(text, semis, toKey), from_key: fromKey, to_key: toKey, semitones: semis };
  }
  if (semitones !== null) {
    const semis = ((semitones % 12) + 12) % 12;
    const newText = _transposeText(text, semis);
    return { text: newText, from_key: fromKey, to_key: _extractKey(newText), semitones: semis };
  }
  throw new Error("Provide either toKey or semitones.");
}

/* ================= PUBLIC API (mode-aware) ================= */

const API = {
  async searchSongs(title, artist) {
    if ((await _modePromise) === "server") {
      try {
        const params = new URLSearchParams();
        if (title) params.set("title", title);
        if (artist) params.set("artist", artist);
        const res = await fetch(`api/songs/search?${params}`);
        if (res.ok) return res.json();
      } catch { /* fall through to static */ }
    }
    return _staticSearch(title, artist);
  },

  async getSong(id) {
    if ((await _modePromise) === "server") {
      try {
        const res = await fetch(`api/songs/${encodeURIComponent(id)}`);
        if (res.ok) return res.json();
      } catch { /* fall through to static */ }
    }
    return _staticGet(id);
  },

  async transpose({ text, toKey = null, semitones = null }) {
    if ((await _modePromise) === "server") {
      try {
        const res = await fetch("api/transpose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, to_key: toKey, semitones }),
        });
        if (res.ok) return res.json();
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Transpose failed");
      } catch (e) {
        if (e.message && e.message !== "Failed to fetch") throw e; // real validation error
        /* network failure — fall through to static */
      }
    }
    return _staticTranspose({ text, toKey, semitones });
  },
};
