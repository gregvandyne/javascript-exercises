// A student's lesson page: "🔊 Read to me" on each step reads the step's title and the teacher's words aloud with this
// device's own voice (nothing is sent anywhere). The buttons show only where the device can speak.
import { readAloud, stopReading } from '/js/tts.js';

const pageLang = document.documentElement.lang || 'en';
// The teacher's words may be in another language than the site's (an English lesson on an Arabic page): when the text's
// writing system says so, read it with a voice for that language, never an Arabic voice spelling out English.
const SCRIPTS = [['ar', /[\u0600-\u06FF]/g], ['he', /[\u0590-\u05FF]/g], ['ru', /[\u0400-\u04FF]/g], ['ja', /[\u3040-\u30FF]/g], ['zh-Hant', /[\u4E00-\u9FFF]/g], ['en', /[A-Za-z]/g]];
const SCRIPT_OF = { ar: 'ar', he: 'he', ru: 'ru', ja: 'ja', 'zh-Hant': 'zh-Hant' };
export function langFor(text, page = pageLang) {
  const n = re => (String(text).match(re) || []).length;
  const counts = SCRIPTS.map(([l, re]) => [l, n(re)]);
  const own = SCRIPT_OF[page] || SCRIPT_OF[page.split('-')[0]] || 'en';
  // Japanese is kana and kanji: its kanji count for it too.
  const ownN = counts.filter(([l]) => l === own || (own === 'ja' && l === 'zh-Hant')).reduce((a, [, c]) => a + c, 0);
  const [top, topN] = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (!topN || topN <= ownN) return page;
  return top === 'zh-Hant' && own === 'ja' ? page : top;
}
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
    readAloud({ text, lang: langFor(text) });
    const u = window.speechSynthesis;
    const done = setInterval(() => { if (!u.speaking) { b.setAttribute('aria-pressed', 'false'); clearInterval(done); } }, 500);
  });
}
