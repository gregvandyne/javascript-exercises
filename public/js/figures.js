// Figures, the menu (routes/figures.js GET /figures): the subject tabs, the grade-band chips and the search filter the
// cards the server drew. Without this script every card shows. #math (and the other subjects) opens on that tab.
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
