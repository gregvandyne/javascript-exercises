// Figures, the menu (routes/figures.js GET /figures): the subject tabs, the grade-band chips and the search filter the
// cards the server drew. Without this script every card shows. #math (and the other subjects) opens on that tab. The
// "Describe what you need" box starts a worksheet or test with Oomba (below).
import { api, t } from '/js/app.js';

const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const state = { tab: 'all', grades: new Set(), q: '' };
function apply() {
  let shown = 0;
  for (const sec of $$('.fg-sec')) {
    let n = 0;
    for (const c of sec.querySelectorAll('.fg-card')) {
      // A kind listed under a second tab (data-also) shows there only, not twice under All.
      const ok = (state.tab === 'all' ? !('also' in c.dataset) : c.dataset.subject === state.tab)
        && (!state.grades.size || c.dataset.grades.split(' ').some(g => state.grades.has(g)))
        && (!state.q || state.q.split(/\s+/).every(w => c.dataset.search.includes(w)));
      c.hidden = !ok; if (ok) n++;
    }
    sec.hidden = n === 0; shown += n;
  }
  $('#fg-none').hidden = shown > 0;
  for (const b of $$('[data-tab]')) { const on = b.dataset.tab === state.tab; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  for (const b of $$('[data-grade]')) { const on = state.grades.has(b.dataset.grade); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
}
for (const b of $$('[data-tab]')) b.addEventListener('click', () => { state.tab = b.dataset.tab; history.replaceState(null, '', state.tab === 'all' ? location.pathname : `#${state.tab}`); apply(); });
for (const b of $$('[data-grade]')) b.addEventListener('click', () => { const g = b.dataset.grade; if (state.grades.has(g)) state.grades.delete(g); else state.grades.add(g); apply(); });
const q = $('#fg-q');
if (q) q.addEventListener('input', () => { state.q = q.value.trim().toLowerCase(); apply(); });
const h = location.hash.slice(1);
if (h && $(`[data-tab="${CSS.escape(h)}"]`)) state.tab = h;
apply();

// "Describe what you need" (services/figures-chat.js start): the words make a new worksheet or test with Oomba's first
// turn already running, then the builder opens with the chat. Refused words stay in the box with the reason.
const form = $('#fgd-form');
if (form) {
  const err = $('#fgd-err'), go = $('#fgd-go'), box = $('#fgd-in');
  const say = msg => { err.textContent = msg; err.hidden = !msg; };
  form.addEventListener('submit', async e => {
    e.preventDefault(); say('');
    const text = box.value.trim();
    if (text.length < 2) { say(t('js.figures.needText')); box.focus(); return; }
    go.disabled = true;
    try {
      const purpose = (form.querySelector('[name="purpose"]:checked') || {}).value || 'worksheet';
      const r = await api('/api/figures/start', { method: 'POST', body: { text, purpose, grade: $('#fgd-grade').value } });
      location.href = `${r.redirect}?ai=1`;
    } catch (x) {
      say(x.status === 429 ? t('js.figures.slow') : x.message || t('js.figures.other'));
      go.disabled = false; box.focus();
    }
  });
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit(); });
}
// "Finished while you were away": Dismiss hides the notice (until another answer ends while they are away).
for (const b of $$('[data-dismiss]')) {
  b.addEventListener('click', async () => {
    const card = b.closest('[data-ready]');
    try { await api(`/api/figures/worksheets/${encodeURIComponent(b.dataset.dismiss)}/chat/dismiss`, { method: 'POST', body: {} }); } catch { /* it shows again next time */ }
    if (card) card.hidden = true;
  });
}
