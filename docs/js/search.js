/* Search UI — two bars (title + artist), merged library + online results.
 *
 * Library results carry a full chart (key, sections, lyrics, chords) and
 * load directly. Online results are metadata only (free APIs don't license
 * lyrics/chords), so picking one builds a ChordPro template to fill in.
 */
function initSearch() {
  const titleInput = document.getElementById("searchTitle");
  const artistInput = document.getElementById("searchArtist");
  const searchBtn = document.getElementById("searchBtn");
  const resultsBox = document.getElementById("searchResults");
  const srInner = document.getElementById("srInner");

  let searchSeq = 0; // ignore out-of-order responses

  async function runSearch() {
    const title = titleInput.value.trim();
    const artist = artistInput.value.trim();
    if (!title && !artist) { hideResults(); return; }

    const seq = ++searchSeq;
    srInner.innerHTML = '<div class="sr-empty">Searching…</div>';
    resultsBox.hidden = false;

    try {
      const results = await API.searchSongs(title, artist);
      if (seq !== searchSeq) return; // a newer search superseded this one
      renderResults(results);
    } catch (e) {
      if (seq !== searchSeq) return;
      srInner.innerHTML = '<div class="sr-empty">Search failed — check your connection.</div>';
    }
  }

  function renderResults(results) {
    if (!results.length) {
      srInner.innerHTML = '<div class="sr-empty">No songs found. Try fewer letters, or check the spelling.</div>';
      resultsBox.hidden = false;
      return;
    }
    srInner.innerHTML = results.map((s) => {
      const isLib = s.source !== "online";
      const badge = isLib
        ? '<span class="sr-badge lib">Full chart</span>'
        : '<span class="sr-badge online">Online</span>';
      const keyChip = s.key ? `<span class="sr-key">${escHtml(s.key)}</span>` : "";
      const art = s.artwork
        ? `<img class="sr-art" src="${escHtml(s.artwork)}" alt="" loading="lazy">`
        : '<span class="sr-art sr-art-ph">♪</span>';
      return `
        <button class="sr-item" data-id="${escHtml(s.id)}" data-source="${escHtml(s.source || "library")}"
                data-title="${escHtml(s.title)}" data-artist="${escHtml(s.artist)}">
          ${art}
          <span class="sr-text">
            <span class="sr-title">${escHtml(s.title)}</span><br>
            <span class="sr-artist">${escHtml(s.artist)}</span>
          </span>
          <span class="sr-right">${badge}${keyChip}</span>
        </button>`;
    }).join("");
    resultsBox.hidden = false;
  }

  function hideResults() { resultsBox.hidden = true; }

  srInner.addEventListener("click", async (e) => {
    const item = e.target.closest(".sr-item");
    if (!item) return;
    const { id, source, title, artist } = item.dataset;

    if (source === "online") {
      loadOnlineTemplate(title, artist);
      hideResults();
      showToast(`"${title}" loaded — add the key and chords`);
      return;
    }

    try {
      const song = await API.getSong(id);
      loadSongIntoEditor(song);
      hideResults();
      showToast(`Loaded "${song.title}" — original key ${song.key}`);
    } catch {
      showToast("Could not load that song.");
    }
  });

  // Live search with debounce (online API in the loop, so slightly longer)
  let timer = null;
  const debounced = () => { clearTimeout(timer); timer = setTimeout(runSearch, 350); };
  titleInput.addEventListener("input", debounced);
  artistInput.addEventListener("input", debounced);
  searchBtn.addEventListener("click", runSearch);
  [titleInput, artistInput].forEach((el) =>
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); })
  );

  document.addEventListener("click", (e) => {
    if (!resultsBox.contains(e.target) && !e.target.closest(".search-group")) hideResults();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideResults(); });
}

function loadSongIntoEditor(song) {
  const directives = [`{title: ${song.title}}`, `{artist: ${song.artist}}`, `{key: ${song.key}}`];
  if (song.tempo) directives.push(`{tempo: ${song.tempo}}`);
  if (song.time) directives.push(`{time: ${song.time}}`);

  const editor = document.getElementById("editor");
  editor.value = directives.join("\n") + "\n\n" + song.body;
  renderPreview();
  syncKeySelect();
}

/* Online results have no licensed chart — scaffold one to fill in. */
function loadOnlineTemplate(title, artist) {
  const editor = document.getElementById("editor");
  editor.value = [
    `{title: ${title}}`,
    `{artist: ${artist}}`,
    `{key: }`,
    ``,
    `{comment: Found online (metadata only). Set the key above, then add chords in [brackets].}`,
    ``,
    `Verse 1`,
    `[]`,
    ``,
    `Chorus`,
    `[]`,
  ].join("\n");
  renderPreview();
  syncKeySelect();
  editor.focus();
}
