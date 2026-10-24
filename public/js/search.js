import { api, $, $$, refreshLive, t, esc } from '/js/app.js';
const form = $('#searchform'), q = $('#q'), results = $('#results');
const state = { q: q.value, cat: form.cat.value, sort: form.sort.value };
let timer = null, ctrl = null;
async function run(push = true) {
  const params = new URLSearchParams(); if (state.q) params.set('q', state.q); if (state.cat) params.set('cat', state.cat); if (state.sort) params.set('sort', state.sort);
  if (push) history.replaceState(null, '', '/search' + (params.toString() ? '?' + params : ''));
  if (ctrl) ctrl.abort(); ctrl = new AbortController();
  results.setAttribute('aria-busy', 'true');
  try { const r = await api('/api/search?' + params, { signal: ctrl.signal }); results.innerHTML = r.html; refreshLive(); }
  catch (e) { if (e.name !== 'AbortError') results.innerHTML = `<p class="notice bad">${esc(t('js.search.failed'))}</p>`; }
  finally { results.removeAttribute('aria-busy'); }
}
q.addEventListener('input', () => { state.q = q.value.trim(); if (!state.q && state.sort === 'relevance') state.sort = 'popular'; clearTimeout(timer); timer = setTimeout(run, 220); });
form.addEventListener('submit', e => { e.preventDefault(); clearTimeout(timer); run(); });
document.addEventListener('click', e => {
  const c = e.target.closest('[data-cat]'); if (c) { state.cat = c.dataset.cat; $$('[data-cat]').forEach(x => x.setAttribute('aria-pressed', String(x === c))); run(); }
  const s = e.target.closest('[data-sort]'); if (s) { state.sort = s.dataset.sort; $$('[data-sort]').forEach(x => x.setAttribute('aria-pressed', String(x === s))); run(); }
});
