# ChordSheet Studio

A Planning Center-style chord sheet app: search for songs, edit them in ChordPro
format, transpose to any key, and export clean PDF chord sheets.

## Architecture

```
chordsheetworkshop/
├── backend/                      Python + FastAPI (optional — see modes below)
│   ├── requirements.txt
│   └── app/
│       ├── main.py               Entry point; serves API + frontend
│       ├── routes/songs.py       HTTP layer (search, get, transpose)
│       ├── services/
│       │   ├── song_service.py   Library search, hot-reloads songs.json
│       │   ├── online_search.py  iTunes Search API (metadata)
│       │   └── transpose_service.py  Music theory: keys, semitones, flats/sharps
│       └── models/song.py        Pydantic data contracts
└── docs/                         The frontend — served by GitHub Pages AND the backend
    ├── index.html
    ├── data/songs.json           THE song library (single source of truth)
    ├── css/styles.css
    └── js/
        ├── api.js                Mode-aware client (server mode / static mode)
        ├── parser.js             ChordPro → structured song
        ├── layout.js             Shared layout engine: pages, 2 columns, breaks
        ├── preview.js            True-size paginated preview (renders the layout)
        ├── pdf.js                jsPDF export (renders the same layout)
        ├── search.js             Title + artist search, library + online results
        ├── transpose.js          Key dropdown and half-step +/- controls
        ├── export.js             Save current song as a songs.json entry
        └── main.js               Bootstrap and wiring
```

One frontend, two modes — `js/api.js` auto-detects at load by pinging
`/api/health`:

- **Static mode (GitHub Pages):** no backend. Library search reads
  `data/songs.json`, online search calls the iTunes API from the browser,
  and transposition runs in JS. Full functionality, zero servers.
- **Server mode (local dev / cloud deploy):** the FastAPI backend serves
  `docs/` and handles all `/api` calls. This is the mode that matters once
  a licensed song catalog (e.g. CCLI SongSelect) is plugged in, since API
  credentials can't live in static JS.

## Deploy to GitHub Pages

Push the repo, then once: **Settings → Pages → Deploy from a branch →**
`main` **/** `docs` **→ Save**. The site goes live at
`https://<username>.github.io/<repo>/` with full functionality.

## Run locally (server mode)

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
   The preview shows true US Letter pages: content fills the left column,
   then the right column, then a new page — page breaks appear exactly where
   the PDF will break, because preview and PDF render the same layout.
5. **Text size** — use the A− / A+ control above the preview to resize all
   body text (lyrics, chords, section labels, comments) from 8–16pt. The
   title, artist, and key stay fixed. Pagination updates live and the PDF
   uses the same size.
6. **PDF** — click *Download PDF*. The filename includes the current key
   (e.g. `Amazing-Grace-Bb.pdf`), so you can export the same song in several
   keys for different vocalists.

API can also be tested directly at http://localhost:8000/docs (FastAPI's
interactive docs).

## Songs in the seed library

Amazing Grace · Be Thou My Vision · Come Thou Fount · Holy Holy Holy ·
It Is Well With My Soul · What a Friend We Have in Jesus · Doxology

All public domain. To add a song: write or edit it in the app, click
**Save JSON**, and paste the downloaded object into the array in
`docs/data/songs.json`. It's searchable immediately (backend hot-reloads;
on Pages it appears after you push).

## Plugging in a real song catalog later

Most modern worship songs are copyrighted, so a production search feature needs
a licensed source — Planning Center itself pulls from CCLI SongSelect. The
search layer was built for this: implement `search()` and `get()` in a new
provider class in `song_service.py` and swap it in `get_provider()`. Routes and
frontend won't need to change.
