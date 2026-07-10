"""App entry point. Run from backend/ with:  uvicorn app.main:app --reload"""
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from .routes.songs import router as songs_router

app = FastAPI(title="ChordSheet Studio API", version="0.2.0")
app.include_router(songs_router)

# Serve the frontend from the same server (no CORS needed)
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
