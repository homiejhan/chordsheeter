"""Song search layer.

Currently backed by a local JSON library (backend/app/data/songs.json).
The provider interface is deliberately thin so a licensed catalog
(e.g. CCLI SongSelect, which is what Planning Center integrates with)
can be dropped in later without touching the routes or frontend:
implement `search()` and `get()` on a new provider class and swap it
in `get_provider()`.
"""
import json
from pathlib import Path
from ..models.song import Song, SongSummary

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "songs.json"


class LocalLibraryProvider:
    def __init__(self):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        self._songs = {s["id"]: Song(**s) for s in raw}

    def search(self, title: str = "", artist: str = "") -> list[SongSummary]:
        title_q = title.strip().lower()
        artist_q = artist.strip().lower()
        results = []
        for song in self._songs.values():
            if title_q and title_q not in song.title.lower():
                continue
            if artist_q and artist_q not in song.artist.lower():
                continue
            results.append(SongSummary(
                id=song.id, title=song.title, artist=song.artist, key=song.key
            ))
        # Exact-prefix matches first, then alphabetical
        results.sort(key=lambda s: (
            not s.title.lower().startswith(title_q) if title_q else False,
            s.title.lower(),
        ))
        return results

    def get(self, song_id: str) -> Song | None:
        return self._songs.get(song_id)


_provider: LocalLibraryProvider | None = None


def get_provider() -> LocalLibraryProvider:
    global _provider
    if _provider is None:
        _provider = LocalLibraryProvider()
    return _provider
