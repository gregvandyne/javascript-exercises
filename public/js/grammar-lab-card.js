// A Grammar Lab teaching card (server/views/grammar-lab.js cardPage): K-2 cards are read aloud through the shared speak
// path (POST /api/tts ctx 'grammar': the server reads the card itself). The page has the button only when the AI voice
// would speak English (the "en" switch on at /admin/voices: routes/grammar-lab.js voiceOn), and this device shows it
// only when it uses the AI voice (not device voices, not Data Saver); otherwise the card stays silent and nothing is
// fetched. No device voice, no autoplay.
import { pageData, $ } from '/js/app.js';
import { ttsBlob, voiceMode } from '/js/tts.js';

const d = pageData();
const btn = $('#gl-listen');
const SILENT = 'data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAACAgICAgICAgICAgICAgICA';
let audio = null, url = null;
function stop() {
  if (audio) { audio.pause(); audio = null; }
  if (url) { URL.revokeObjectURL(url); url = null; }
  if (btn) { btn.setAttribute('aria-pressed', 'false'); btn.querySelector('.lbl').textContent = d.listenLabel; }
}
if (btn && d.listen && voiceMode() === 'ai') {
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    if (audio) return stop();
    // (inside the tap: an iPhone plays the audio only from an element first played in a tap)
    const a = audio = new Audio(SILENT);
    try { const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch { /* no audio */ }
    btn.setAttribute('aria-pressed', 'true'); btn.querySelector('.lbl').textContent = d.stop;
    try {
      const blob = await ttsBlob({ ctx: 'grammar', topic: d.topic });
      if (audio !== a) return;
      url = URL.createObjectURL(blob);
      a.onended = () => { if (audio === a) stop(); };
      a.src = url;
      await a.play();
    } catch { if (audio === a) stop(); }
  });
}
