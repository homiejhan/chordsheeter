"""Pydantic models — the data contract between all layers."""
from pydantic import BaseModel
from typing import Optional


class SongSummary(BaseModel):
    """Lightweight result returned by search."""
    id: str
    title: str
    artist: str
    key: str = ""              # blank for online results (key isn't in metadata APIs)
    source: str = "library"    # "library" | "online"
    artwork: Optional[str] = None


class Song(SongSummary):
    """Full song, including the ChordPro body."""
    tempo: Optional[str] = None
    time: Optional[str] = None
    body: str  # ChordPro text (sections, lyrics, [chords])


class TransposeRequest(BaseModel):
    text: str                      # full ChordPro text
    to_key: Optional[str] = None   # e.g. "Bb" — preferred
    semitones: Optional[int] = None  # alternative: raw shift


class TransposeResponse(BaseModel):
    text: str
    from_key: Optional[str]
    to_key: Optional[str]
    semitones: int
