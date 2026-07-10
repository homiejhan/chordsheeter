/* API client — the only file that talks to the backend. */
const API = {
  async searchSongs(title, artist) {
    const params = new URLSearchParams();
    if (title) params.set("title", title);
    if (artist) params.set("artist", artist);
    const res = await fetch(`/api/songs/search?${params}`);
    if (!res.ok) throw new Error("Search failed");
    return res.json();
  },

  async getSong(id) {
    const res = await fetch(`/api/songs/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error("Song not found");
    return res.json();
  },

  async transpose({ text, toKey = null, semitones = null }) {
    const res = await fetch("/api/transpose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, to_key: toKey, semitones }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Transpose failed");
    }
    return res.json();
  },
};
