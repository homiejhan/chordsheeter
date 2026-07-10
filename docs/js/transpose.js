/* Transpose UI — key dropdown plus half-step +/- buttons. Calls the backend. */
const ALL_KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

function initTranspose() {
  const keySelect = document.getElementById("keySelect");

  // Populate dropdown
  for (const k of ALL_KEYS) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    keySelect.appendChild(opt);
  }

  keySelect.addEventListener("change", async () => {
    const toKey = keySelect.value;
    if (!toKey) return;
    await doTranspose({ toKey });
  });

  document.getElementById("stepUp").addEventListener("click", () => doTranspose({ semitones: 1 }));
  document.getElementById("stepDown").addEventListener("click", () => doTranspose({ semitones: -1 }));
}

async function doTranspose({ toKey = null, semitones = null }) {
  const editor = document.getElementById("editor");
  if (!editor.value.trim()) { showToast("Nothing to transpose yet."); return; }

  try {
    const res = await API.transpose({ text: editor.value, toKey, semitones });
    editor.value = res.text;
    renderPreview();
    syncKeySelect();
    if (res.from_key && res.to_key) showToast(`Transposed ${res.from_key} → ${res.to_key}`);
    else showToast(`Transposed ${semitones > 0 ? "up" : "down"} a half step`);
  } catch (e) {
    showToast(e.message);
  }
}

/* Keep the dropdown in sync with the {key:} directive in the editor. */
function syncKeySelect() {
  const keySelect = document.getElementById("keySelect");
  const m = document.getElementById("editor").value.match(/\{\s*key\s*:\s*([^}]+)\}/i);
  if (!m) { keySelect.value = ""; return; }
  const root = m[1].trim().match(/^[A-G][#b]?/);
  keySelect.value = root && ALL_KEYS.includes(root[0]) ? root[0] : "";
}
