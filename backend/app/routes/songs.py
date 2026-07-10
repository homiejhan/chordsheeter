"""HTTP routes — thin layer that delegates to services."""
from fastapi import APIRouter, HTTPException, Query
from ..models.song import Song, SongSummary, TransposeRequest, TransposeResponse
from ..services.song_service import get_provider
from ..services.online_search import search_online
from ..services import transpose_service as tsvc

router = APIRouter(prefix="/api")


@router.get("/songs/search", response_model=list[SongSummary])
def search_songs(
    title: str = Query("", description="Match against song title"),
    artist: str = Query("", description="Match against artist name"),
    include_online: bool = Query(True, description="Also search online metadata (iTunes)"),
):
    if not title.strip() and not artist.strip():
        return []

    local = get_provider().search(title=title, artist=artist)
    if not include_online:
        return local

    online = search_online(title=title, artist=artist)

    # Library wins on duplicates (it has the full chart; online is metadata only)
    have = {(s.title.lower(), s.artist.lower()) for s in local}
    merged = local + [s for s in online if (s.title.lower(), s.artist.lower()) not in have]
    return merged


@router.get("/songs/{song_id}", response_model=Song)
def get_song(song_id: str):
    song = get_provider().get(song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    return song


@router.post("/transpose", response_model=TransposeResponse)
def transpose(req: TransposeRequest):
    from_key = tsvc.extract_key(req.text)

    if req.to_key:
        if not from_key:
            raise HTTPException(
                status_code=400,
                detail="No {key: ...} directive found — add one, or transpose by semitones instead.",
            )
        semis = tsvc.semitones_between(from_key, req.to_key)
        if semis is None:
            raise HTTPException(status_code=400, detail="Unrecognized key name.")
        new_text = tsvc.transpose_text(req.text, semis, target_key=req.to_key)
        return TransposeResponse(
            text=new_text, from_key=from_key, to_key=req.to_key, semitones=semis
        )

    if req.semitones is not None:
        semis = req.semitones % 12
        new_text = tsvc.transpose_text(req.text, semis)
        return TransposeResponse(
            text=new_text,
            from_key=from_key,
            to_key=tsvc.extract_key(new_text),
            semitones=semis,
        )

    raise HTTPException(status_code=400, detail="Provide either to_key or semitones.")
