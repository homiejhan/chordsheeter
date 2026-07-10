"""Online song search via the iTunes Search API.

Free, no API key, no auth: https://itunes.apple.com/search
Returns song *metadata only* (title, artist, artwork). Lyrics, chords,
and keys are licensed content and are not available from free APIs —
the frontend turns an online pick into a ChordPro template the user
fills in. A licensed catalog (e.g. CCLI SongSelect) can replace this
provider later using the same interface.
"""
import json
import urllib.parse
import urllib.request

from ..models.song import SongSummary

ITUNES_URL = "https://itunes.apple.com/search"
TIMEOUT_SECONDS = 5


def search_online(title: str = "", artist: str = "", limit: int = 8) -> list[SongSummary]:
    """Search iTunes for song metadata. Fails soft: any error returns []."""
    term = " ".join(p for p in (title.strip(), artist.strip()) if p)
    if not term:
        return []

    params = urllib.parse.urlencode({
        "term": term,
        "entity": "song",
        "media": "music",
        "limit": limit,
    })
    url = f"{ITUNES_URL}?{params}"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ChordSheetStudio/0.3"})
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return []  # offline / rate limited / API change — degrade to library-only

    return parse_itunes_results(data, artist_filter=artist)


def parse_itunes_results(data: dict, artist_filter: str = "") -> list[SongSummary]:
    """Pure parser, separated so it can be unit-tested without network."""
    out: list[SongSummary] = []
    seen: set[tuple[str, str]] = set()
    aq = artist_filter.strip().lower()

    for item in data.get("results", []):
        name = (item.get("trackName") or "").strip()
        art = (item.get("artistName") or "").strip()
        if not name or not art:
            continue
        if aq and aq not in art.lower():
            continue
        dedupe_key = (name.lower(), art.lower())
        if dedupe_key in seen:
            continue  # same song on multiple albums
        seen.add(dedupe_key)
        out.append(SongSummary(
            id=f"online-{item.get('trackId', len(out))}",
            title=name,
            artist=art,
            key="",
            source="online",
            artwork=item.get("artworkUrl60"),
        ))
    return out
