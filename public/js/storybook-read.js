// The reader for a teacher's own book (/library/made/:id/read; server/routes/storybook.js, docs/storybook-builder.md),
// in the Story Library's reader: one page at a time, the picture on top, then the title, the words, and below them the
// choices (a choose-your-own-adventure) or Back and Next. Back goes to the page the reader came from (the trail), an
// ending says "The End" with Start over, and the place is remembered (signed in: on the server, like other library
// books). The server draws the first page and every page works without JavaScript (each button is a small GET form);
// this script turns pages in place. On the print page it only runs Print.
import { api, t, esc, pageData } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { numbering } from '/js/storybook-core.js';

const go = document.getElementById('sb-print-go');
if (go) go.addEventListener('click', () => window.print());

const D = pageData();
const box = document.getElementById('sb-read');
if (box && D.book) start();

function start() {
  const bk = D.book, cyoa = bk.kind === 'cyoa', num = numbering(bk);
  let at = D.at, trail = [...(D.trail || [])];
  const pageOf = id => bk.pages.find(p => p.id === id);
  const form = (to, tt, label, cls) => `<form method="get" class="sb-go"><input type="hidden" name="p" value="${esc(to)}"><input type="hidden" name="t" value="${esc(tt)}"><button class="btn ${cls}" type="submit">${label}</button></form>`;
  function draw({ focus = false } = {}) {
    const pg = pageOf(at), i = bk.pages.indexOf(pg), last = cyoa ? pg.end : i === bk.pages.length - 1;
    const prev = cyoa ? trail[trail.length - 1] : i > 0 ? bk.pages[i - 1].id : null;
    const n = cyoa ? num.get(pg.id) : i + 1;
    const startId = cyoa ? bk.start : bk.pages[0].id;
    box.innerHTML = `<article class="sb-page-r" aria-labelledby="sb-rt">
      <figure class="rd-pic sb-rpic">${pg.art || ''}</figure>
      ${pg.title ? `<h2 class="sb-rt" id="sb-rt" dir="auto" tabindex="-1">${esc(pg.title)}</h2>` : `<h2 class="sr-only" id="sb-rt" tabindex="-1">${esc(t('js.storybook-read.pageN', { n }))}</h2>`}
      <p class="rd-text sb-rtext" dir="auto">${esc(pg.text)}</p>
      ${last ? `<p class="sb-theend">${iconHtml('⭐', { size: 28 })} ${esc(t('js.storybook-read.theEnd'))}</p>` : ''}
      ${cyoa && !last ? `<div class="sb-choices" role="group" aria-label="${esc(t('js.storybook-read.choices'))}">${pg.choices.filter(c => c.to && pageOf(c.to)).map(c => form(c.to, [...trail, pg.id].join('.'), esc(c.text), 'btn-primary sb-choice')).join('')}</div>` : ''}
      <nav class="sb-rnav" aria-label="${esc(t('js.storybook-read.pages'))}">
        ${prev ? form(prev, trail.slice(0, -1).join('.'), `<span class="flip" aria-hidden="true">◀</span> ${esc(t('js.storybook-read.back'))}`, '') : ''}
        ${!cyoa && !last ? form(bk.pages[i + 1].id, trail.join('.'), `${esc(t('js.storybook-read.next'))} <span class="flip" aria-hidden="true">▶</span>`, 'btn-primary') : ''}
        ${last ? form(startId, '', `${iconHtml('🔁', { size: 18 })} ${esc(t('js.storybook-read.startOver'))}`, 'btn-primary') : ''}
      </nav></article>`;
    if (focus) { document.getElementById('sb-rt').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }
  function turn(to, tt) {
    if (!pageOf(to)) return;
    at = to; trail = tt ? tt.split('.').filter(x => pageOf(x)) : [];
    draw({ focus: true });
    history.replaceState(null, '', `?p=${encodeURIComponent(at)}${trail.length ? `&t=${encodeURIComponent(trail.join('.'))}` : ''}`);
    api(`/api/library/made/${D.id}/progress`, { method: 'POST', body: { page: at, trail }, background: true }).catch(() => {});
    const next = pageOf(at);
    for (const c of next.choices || []) { const p = pageOf(c.to); if (p) { const m = /<img[^>]+src="([^"]+)"/.exec(p.art || ''); if (m) { const im = new Image(); im.src = m[1]; } } }
  }
  box.addEventListener('submit', e => {
    const f = e.target.closest('form.sb-go'); if (!f) return;
    e.preventDefault();
    turn(f.elements.p.value, f.elements.t.value);
  });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select') || e.altKey || e.ctrlKey || e.metaKey || cyoa) return;
    const rtl = document.documentElement.dir === 'rtl', i = bk.pages.findIndex(p => p.id === at);
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') && i < bk.pages.length - 1) turn(bk.pages[i + 1].id, '');
    if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') && i > 0) turn(bk.pages[i - 1].id, '');
  });
  draw();
  api(`/api/library/made/${D.id}/progress`, { method: 'POST', body: { page: at, trail }, background: true }).catch(() => {});
}
