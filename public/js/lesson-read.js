// A student's lesson page: "🔊 Read to me" on each step reads the step's title and the teacher's words aloud with this
// device's own voice (nothing is sent anywhere). The buttons show only where the device can speak.
import { readAloud, stopReading } from '/js/tts.js';

const lang = document.documentElement.lang || 'en';
if (window.speechSynthesis) {
  for (const b of document.querySelectorAll('[data-read-step]')) b.hidden = false;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-read-step]'); if (!b) return;
    const card = document.getElementById(b.dataset.readStep); if (!card) return;
    if (b.getAttribute('aria-pressed') === 'true') { stopReading(); b.setAttribute('aria-pressed', 'false'); return; }
    for (const o of document.querySelectorAll('[data-read-step][aria-pressed="true"]')) o.setAttribute('aria-pressed', 'false');
    const part = sel => { const el = card.querySelector(sel); return el ? el.textContent.trim() : ''; };
    const text = [part('.sc-title b'), part('.sc-body') || part('.sc-build')].filter(Boolean).join('. ');
    if (!text) return;
    b.setAttribute('aria-pressed', 'true');
    readAloud({ text, lang });
    const u = window.speechSynthesis;
    const done = setInterval(() => { if (!u.speaking) { b.setAttribute('aria-pressed', 'false'); clearInterval(done); } }, 500);
  });
}
