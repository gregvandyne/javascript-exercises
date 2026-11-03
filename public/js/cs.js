// CS Quest teacher pages (server/views/cs-quest.js, cs-quest-sheets.js): small conveniences on top of markup that works
// without JavaScript. Strings come from js.cs.* (embedded by the layout for this module).
//  - the program page remembers the grade band a teacher last looked at (localStorage) and opens on it next time;
//  - the plan page's live buttons follow the one class picker, so every form posts the class chosen there;
//  - the projector questions show one item per screen with Previous / Next (keyboard: arrows, Space reveals), and mark
//    the right choice only once the answer is revealed. Without JavaScript every item shows in a column, answer folded.
const S = (() => { try { return JSON.parse(document.getElementById('i18n').textContent).strings || {}; } catch { return {}; } })();
const t = (k, vars = {}) => String(S[k] || k).replace(/\{(\w+)\}/g, (m, v) => (v in vars ? vars[v] : m));
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } } };

// ---- the band toggle, remembered
const toggle = document.querySelector('[data-band-toggle]');
if (toggle) {
  const url = new URL(location.href);
  const cur = toggle.querySelector('[aria-current="page"]');
  if (!url.searchParams.has('band')) {
    const want = store.get('csq-band');
    const link = want && toggle.querySelector(`[data-band="${want}"]`);
    if (link && link !== cur) location.replace(link.href);
  } else if (cur) store.set('csq-band', cur.dataset.band);
  for (const a of toggle.querySelectorAll('[data-band]')) a.addEventListener('click', () => store.set('csq-band', a.dataset.band));
}

// ---- one class picker drives the live forms on the plan page
const pick = document.querySelector('[data-class-pick]');
if (pick) {
  const apply = () => { for (const i of document.querySelectorAll('[data-class-follow]')) i.value = pick.value; for (const s of document.querySelectorAll('select[name="classId"]')) s.value = pick.value; };
  pick.addEventListener('change', apply); apply();
}

// ---- the projector: one question per screen
const proj = document.querySelector('[data-projector]');
if (proj) {
  const slides = [...proj.querySelectorAll('.csq-slide')];
  const count = proj.querySelector('[data-count]');
  let i = Math.max(0, slides.findIndex(s => s.classList.contains('is-current')));
  const show = n => {
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((s, k) => s.classList.toggle('is-current', k === i));
    if (count) count.textContent = t('js.cs.of', { n: i + 1, count: slides.length });
    proj.querySelector('[data-prev]').disabled = i === 0;
    proj.querySelector('[data-next]').disabled = i === slides.length - 1;
    window.scrollTo(0, 0);
  };
  proj.classList.add('is-js');
  proj.querySelector('[data-prev]').addEventListener('click', () => show(i - 1));
  proj.querySelector('[data-next]').addEventListener('click', () => show(i + 1));
  for (const s of slides) {
    const d = s.querySelector('[data-reveal]');
    const mark = () => { const right = s.querySelector(`.csq-choices li[data-i="${s.dataset.right}"]`); if (right) right.classList.toggle('is-right', d.open); d.querySelector('summary').textContent = d.open ? `🙈 ${t('js.cs.hide')}` : `👁️ ${t('js.cs.reveal')}`; };
    d.addEventListener('toggle', mark); mark();
  }
  document.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea,select')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); show(i + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(i - 1); }
    else if (e.key === ' ' || e.key === 'Enter') { const d = slides[i].querySelector('[data-reveal]'); if (d && !e.target.closest('summary,button,a')) { e.preventDefault(); d.open = !d.open; } }
  });
  show(i);
}

// ---- the plan page's Assign buttons open their form (a <details> at the foot of the page) and focus its first field
const openDetails = id => {
  const d = id && document.getElementById(id);
  if (!d || d.tagName !== 'DETAILS') return;
  d.open = true;
  const f = d.querySelector('select, input:not([type="hidden"])');
  if (f) setTimeout(() => f.focus({ preventScroll: true }), 0);
};
for (const a of document.querySelectorAll('a[data-open-details]')) a.addEventListener('click', () => openDetails(a.getAttribute('href').slice(1)));
addEventListener('hashchange', () => openDetails(location.hash.slice(1)));
if (location.hash) openDetails(location.hash.slice(1));
