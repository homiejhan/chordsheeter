"""Transposition engine.

Handles chord roots, qualities, slash bass notes, and picks sharps vs.
flats based on the *target* key's conventional spelling.
"""
import re

# Pitch classes 0-11, accepting both spellings on input
NOTE_TO_PC = {
    "C": 0, "B#": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3,
    "E": 4, "Fb": 4, "F": 5, "E#": 5, "F#": 6, "Gb": 6, "G": 7,
    "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11, "Cb": 11,
}

SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

# Keys conventionally spelled with flats (majors and their relative minors)
FLAT_KEYS = {"F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb",
             "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm"}

CHORD_RE = re.compile(r"^([A-G][#b]?)(.*?)(?:/([A-G][#b]?))?$")
KEY_RE = re.compile(r"^([A-G][#b]?)(m?)$", re.IGNORECASE)


def _uses_flats(key: str | None) -> bool:
    if not key:
        return False
    k = key.strip()
    # Normalize e.g. "bb" -> "Bb", "f#m" -> "F#m"
    m = KEY_RE.match(k)
    if m:
        k = m.group(1)[0].upper() + m.group(1)[1:] + m.group(2).lower()
    return k in FLAT_KEYS or "b" in k[1:]


def _shift_note(note: str, semitones: int, use_flats: bool) -> str | None:
    pc = NOTE_TO_PC.get(note[0].upper() + note[1:])
    if pc is None:
        return None
    new_pc = (pc + semitones) % 12
    return (FLAT_NAMES if use_flats else SHARP_NAMES)[new_pc]


def transpose_chord(chord: str, semitones: int, use_flats: bool) -> str:
    """Transpose one chord symbol, e.g. 'C#m7/G#' -> 'Dm7/A' (+1)."""
    m = CHORD_RE.match(chord.strip())
    if not m:
        return chord
    root, quality, bass = m.groups()
    new_root = _shift_note(root, semitones, use_flats)
    if new_root is None:
        return chord
    out = new_root + quality
    if bass:
        new_bass = _shift_note(bass, semitones, use_flats)
        out += "/" + (new_bass if new_bass else bass)
    return out


def semitones_between(from_key: str, to_key: str) -> int | None:
    """Distance in semitones between two key roots (ignores maj/min)."""
    fm, tm = KEY_RE.match(from_key.strip()), KEY_RE.match(to_key.strip())
    if not fm or not tm:
        return None
    f = NOTE_TO_PC.get(fm.group(1)[0].upper() + fm.group(1)[1:])
    t = NOTE_TO_PC.get(tm.group(1)[0].upper() + tm.group(1)[1:])
    if f is None or t is None:
        return None
    return (t - f) % 12


def extract_key(text: str) -> str | None:
    m = re.search(r"\{\s*key\s*:\s*([^}]+)\}", text, re.IGNORECASE)
    return m.group(1).strip() if m else None


def transpose_text(text: str, semitones: int, target_key: str | None = None) -> str:
    """Transpose every [chord] and the {key:} directive in a ChordPro doc."""
    use_flats = _uses_flats(target_key)

    def repl_chord(m: re.Match) -> str:
        inner = m.group(1)
        if not inner.strip():
            return m.group(0)
        return "[" + transpose_chord(inner, semitones, use_flats) + "]"

    out = re.sub(r"\[([^\]]*)\]", repl_chord, text)

    def repl_key(m: re.Match) -> str:
        old = m.group(1).strip()
        if target_key:
            return "{key: " + target_key + "}"
        km = KEY_RE.match(old)
        if km:
            new_root = _shift_note(
                km.group(1)[0].upper() + km.group(1)[1:], semitones, use_flats
            )
            if new_root:
                return "{key: " + new_root + km.group(2) + "}"
        return m.group(0)

    out = re.sub(r"\{\s*key\s*:\s*([^}]+)\}", repl_key, out, count=1)
    return out
