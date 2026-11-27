// A Grammar Lab teaching card (server/views/grammar-lab.js cardPage): K-2 cards are read aloud through the shared speak
// path (POST /api/tts ctx 'grammar': the server reads the card itself). The button shows only when the AI voice would
// speak (the English switch on at /admin/voices); otherwise the card stays silent. No device voice, no autoplay.
import { pageData, $ } from '/js/app.js';
import { ttsBlob, voiceMode } from '/js/tts.js';

const d = pageData();
const btn = $('#gl-listen');
let audio = null, url = null;
function stop() {
  if (audio) { audio.pause(); audio = null; }
  if (url) { URL.revokeObjectURL(url); url = null; }
  if (btn) { btn.setAttribute('aria-pressed', 'false'); btn.querySelector('.lbl').textContent = d.listenLabel; }
}
if (btn && d.listen && voiceMode() === 'ai') {
  fetch('/api/tts', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ctx: 'grammar', topic: d.topic, check: true }) })
    .then(r => { if (r.ok) btn.hidden = false; }, () => { /* stays silent */ });
  btn.addEventListener('click', async () => {
    if (audio) return stop();
    btn.setAttribute('aria-pressed', 'true'); btn.querySelector('.lbl').textContent = d.stop;
    try {
      const blob = await ttsBlob({ ctx: 'grammar', topic: d.topic });
      url = URL.createObjectURL(blob);
      audio = new Audio(url);
      audio.onended = stop;
      await audio.play();
    } catch { stop(); }
  });
}
