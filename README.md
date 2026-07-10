# ChordSheet Studio

A Planning Center-style chord sheet app: search for songs, edit them in ChordPro
format, transpose to any key, and export clean PDF chord sheets.

## Architecture

```
chordsheet-app/
├── backend/                      Python + FastAPI
│   ├── requirements.txt
│   └── app/
│       ├── main.py               Entry point; serves API + frontend
│       ├── routes/songs.py       HTTP layer (search, get, transpose)
│       ├── services/
│       │   ├── song_service.py   Search over the song library (pluggable provider)
│       │   └── transpose_service.py  Music theory: keys, semitones, flats/sharps
│       ├── models/song.py        Pydantic data contracts
│       └── data/songs.json       Seed library (public domain hymns)
└── frontend/                     Vanilla JS, modular
    ├── index.html
    ├── css/styles.css
    └── js/
        ├── api.js                The only file that talks to the backend
        ├── parser.js             ChordPro → structured song
        ├── preview.js            Live paper preview
        ├── pdf.js                jsPDF export (Letter size)
        ├── search.js             Title + artist search bars, results dropdown
        ├── transpose.js          Key dropdown and half-step +/- controls
        └── main.js               Bootstrap and wiring
```

Layers: **routes** (HTTP only) → **services** (business logic) → **models/data**.
The frontend mirrors this: one API client, one parser, and independent UI modules.

## Run it

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open http://localhost:8000

## Test checklist

1. **Search** — results merge two sources, each labeled with a badge:
   - **Full chart** (library): songs from `songs.json`. Clicking loads the key,
     section headers, lyrics, and chords. Try "amaz" in the title bar or
     "newton" in the artist bar; both filters combine.
   - **Online**: live metadata from the iTunes Search API (free, no key).
     Try any modern song, e.g. "goodness of god". Clicking pre-fills a
     ChordPro template with the title and artist for you to add the key and
     chords — lyrics/chords/keys aren't available from free APIs because that
     content is licensed. If the API is unreachable, search degrades to
     library-only instead of failing.
2. **Transpose by key** — with a song loaded, pick a key from the *Key* dropdown
   (e.g. G → Bb). Every chord updates, the `{key:}` directive updates, and flat
   keys get flat spellings (Bb, Eb) while sharp keys get sharps.
3. **Transpose by half step** — the − / + buttons shift everything one semitone.
4. **Edit** — change lyrics or chords in the editor; the preview updates live.
5. **PDF** — click *Download PDF*. The filename includes the current key
   (e.g. `Amazing-Grace-Bb.pdf`), so you can export the same song in several
   keys for different vocalists.

API can also be tested directly at http://localhost:8000/docs (FastAPI's
interactive docs).

## Songs in the seed library

Amazing Grace · Be Thou My Vision · Come Thou Fount · Holy Holy Holy ·
It Is Well With My Soul · What a Friend We Have in Jesus · Doxology

All public domain. To add songs, append entries to `backend/app/data/songs.json`
(id, title, artist, key, body in ChordPro).

## Plugging in a real song catalog later

Most modern worship songs are copyrighted, so a production search feature needs
a licensed source — Planning Center itself pulls from CCLI SongSelect. The
search layer was built for this: implement `search()` and `get()` in a new
provider class in `song_service.py` and swap it in `get_provider()`. Routes and
frontend won't need to change.
