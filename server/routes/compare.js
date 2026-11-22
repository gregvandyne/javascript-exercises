// /compare: "How Oomba compares", a public page for teachers that sets Oomba Academy beside three other classroom
// products, by classroom need (docs/decisions.md "Comparison page: the one page that names other products").
//
// The site's rule is that we never name other products. The owner made one exception, for this page only: Kahoot!,
// Classroomscreen and Brainingcamp. Their names live in COMPETITORS below and nowhere else in the app (not in the locale
// files either: the sentences that name them get the names as a placeholder). tests/unit/compare.test.js checks that
// the names appear in no other file the site serves, prompts or tests.
//
// Rules for the other products' cells (CELLS):
// - Only what their own public website clearly states, with the page's address, the day we read it and the exact words
//   that support the cell (docs/compare-sources.md has every cell). Never a guess, never a price, never an opinion.
// - Not stated: we have not confirmed it from their public website. A cell stays Not stated until someone has read the
//   supporting words on their site; every other cell must carry a source, which the page shows as a numbered footnote.
// Oomba's cells say only what is live: the Manipulatives, their live rooms, Figures, the AI drafting and Oomba, the
// teaching companion, follow services/teacher-tools.js toolAccess, worded like the "See it in action" note
// (views/see-it.js): "Teacher plan" while paid plans are on for everyone, "In testing" while only testers have them.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page } from '../views/layout.js';
import { ico } from '../views/icon.js';
import { tHtml, availableLocales, fmt, DEFAULT_LOCALE } from '../i18n/index.js';
import * as seo from '../seo.js';
import { el, fb, lp, contactEmail } from './teachers.js';
import { familiesOn } from '../services/family.js';
import { plansOn } from '../services/teacher-tools.js';
import { liveOn } from '../services/classlive-sessions.js';
import { readyVideos } from '../views/see-it.js';

export const router = Router();
export const PATH = '/compare';

/** The day the other products' websites were last checked for this page (the "Last checked" line, the notice, the
 *  sitemap). Change it whenever CELLS is checked again. */
export const COMPARE_CHECKED = '2026-11-22';

/** The three products this page may name (the owner's one-page exception), with their own public websites. Product
 *  names are never translated. */
export const COMPETITORS = [
  { id: 'kahoot', name: 'Kahoot!', site: 'https://kahoot.com/' },
  { id: 'classroomscreen', name: 'Classroomscreen', site: 'https://classroomscreen.com/' },
  { id: 'brainingcamp', name: 'Brainingcamp', site: 'https://www.brainingcamp.com/' },
];

/** The cell statuses, in the order of the legend. Each has its mark (a Fluent icon) and always a text label. */
export const STATUSES = { yes: '✅', partial: '🟡', no: '➖', notStated: '' };

/** The rows, by classroom need, in order. gated: an Oomba teaching tool behind toolAccess (Teacher plan / In testing). */
export const ROWS = [
  { id: 'games' }, { id: 'build' }, { id: 'dashboard' }, { id: 'routines' }, { id: 'eyes' },
  { id: 'manip', gated: true }, { id: 'room', gated: true }, { id: 'regroup', gated: true }, { id: 'figures', gated: true },
  { id: 'aiDraft', gated: true }, { id: 'companion', gated: true }, { id: 'videos' },
  { id: 'grades' }, { id: 'languages' }, { id: 'devices' }, { id: 'privacy' }, { id: 'free' },
];

/**
 * The other products' cells: CELLS[rowId][competitorId] = { s: 'notStated' } or
 * { s: 'yes' | 'partial' | 'no', src: { url, checked: 'YYYY-MM-DD', quote: 'the exact words on that page' } }.
 * A row or product left out here is Not stated.
 *
 * On 2026-11-22 none of the three websites could be reached from the network this page was built on, so every cell is
 * Not stated until someone reads their pages (docs/compare-sources.md lists what to check). Not stated is never a
 * claim about the product: the legend says it means we have not confirmed it.
 */
export const CELLS = {};

/** The cell for one row and product. */
export const cellOf = (rowId, compId, cells = CELLS) => (cells[rowId] && cells[rowId][compId]) || { s: 'notStated' };

/** The numbered footnotes: one per distinct source address, in table order. -> { list: [{ n, url, comp, checked,
 *  quote }], numOf(rowId, compId) -> n | 0 } */
export function footnotes(cells = CELLS, rows = ROWS) {
  const list = []; const byUrl = new Map();
  for (const r of rows) for (const c of COMPETITORS) {
    const cell = cellOf(r.id, c.id, cells);
    if (cell.s === 'notStated' || !cell.src) continue;
    if (!byUrl.has(cell.src.url)) { byUrl.set(cell.src.url, list.length + 1); list.push({ n: list.length + 1, url: cell.src.url, comp: c, checked: cell.src.checked, quote: cell.src.quote }); }
  }
  return { list, numOf: (rowId, compId) => { const cell = cellOf(rowId, compId, cells); return cell.src ? byUrl.get(cell.src.url) || 0 : 0; } };
}

/** "Kahoot!, Classroomscreen and Brainingcamp" in the page's language. */
// English as the owner wrote the notice ("A, B and C"); other languages join the names their own way.
const namesList = req => { const names = COMPETITORS.map(c => c.name); if (/^en/.test(req.locale || DEFAULT_LOCALE)) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`; try { return new Intl.ListFormat(req.t.intl || req.locale || 'en', { type: 'conjunction' }).format(names); } catch { return names.join(', '); } };
const day = req => fmt(req.locale || DEFAULT_LOCALE).day(Date.parse(`${COMPARE_CHECKED}T00:00:00Z`), { year: 'numeric', month: 'long', day: 'numeric' });
const dateTag = req => html`<time datetime="${COMPARE_CHECKED}">${day(req)}</time>`;

/** A status mark and its words (the words are always there: never color or an icon alone). */
function mark(t, s) {
  const key = `compare.status.${s}`;
  return html`<span class="cmp-mark cmp-${s}">${STATUSES[s] ? ico(STATUSES[s], { size: 18 }) : ''}<b${fb(t, key)}>${t(key)}</b></span>`;
}

/** The page's own CSS. Colors are the site's tokens (light and dark). The table scrolls inside its own box on narrow
 *  screens with the need column kept in view; the page itself never scrolls sideways. */
const CSS = raw(`<style>
.cmp-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:var(--r);border:1px solid var(--line);background:var(--card);max-width:100%}
.cmp-scroll:focus-visible{outline:3px solid var(--current);outline-offset:2px}
.cmp-table{border-collapse:separate;border-spacing:0;width:100%;min-width:760px;font-size:.95rem}
.cmp-table caption{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cmp-cap{margin:0 0 8px;color:var(--muted);font-size:.9rem}
.cmp-table th,.cmp-table td{padding:10px 12px;text-align:start;vertical-align:top;border-top:1px solid var(--line)}
.cmp-table thead th{background:var(--card-2);font-weight:800;white-space:nowrap}
.cmp-table thead th.cmp-us{background:var(--current);color:var(--on-current)}
.cmp-table th[scope=row]{position:sticky;inset-inline-start:0;z-index:1;background:var(--card);font-weight:700;min-width:150px;max-width:190px;box-shadow:1px 0 0 var(--line)}
.cmp-table thead th:first-child{position:sticky;inset-inline-start:0;z-index:2}
.cmp-table td.cmp-us{background:color-mix(in srgb,var(--ok-bg) 45%,var(--card));min-width:230px}
.cmp-table td{min-width:120px}
.cmp-mark{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.cmp-mark .fx{flex:none}
.cmp-notStated b{font-weight:600;color:var(--muted)}
.cmp-detail{display:block;margin-top:4px;color:var(--text-2);font-size:.9rem;line-height:1.4}
.cmp-tag{display:inline-block;margin-top:6px;padding:1px 8px;border-radius:999px;background:var(--warn-bg);color:var(--warn-ink);font-size:.8rem;font-weight:700}
.cmp-fn{font-size:.75rem;margin-inline-start:2px}
.cmp-legend{margin:12px 0 0;color:var(--muted);font-size:.9rem}
.cmp-hint{display:none;margin:0 0 8px;color:var(--muted);font-size:.85rem}
@media (max-width:820px){.cmp-hint{display:block}.cmp-table th[scope=row]{min-width:120px;max-width:140px;font-size:.9rem}}
.cmp-why{display:grid;gap:var(--gap,16px);grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));list-style:none;padding:0;margin:0}
.cmp-why>li{margin:0}
.cmp-why h3{margin:0 0 6px;font-size:1.05rem;display:flex;gap:8px;align-items:center}
.cmp-why p{margin:0}
.cmp-sources{padding-inline-start:1.2em;overflow-wrap:anywhere}
.cmp-sources li{margin-block:.4em}
.cmp-notice{font-size:.9rem;color:var(--muted)}
.cmp-checked{font-weight:700}
</style>`);

router.get(PATH, (req, res) => {
  const t = req.t;
  const gate = plansOn() ? 'compare.gate.plan' : 'compare.gate.testing';
  const plans = familiesOn(req);
  const vars = { count: availableLocales().length, plans: '/plans' };
  const rows = ROWS.filter(r => r.id !== 'videos' || readyVideos().length);
  const notes = footnotes(CELLS, rows);
  // Oomba's own cell: always Yes (only what is live is a row), its detail, and the gate's tag for the teaching tools.
  const oombaKey = r => {
    if (r.id === 'games' && !liveOn()) return 'compare.rows.games.oombaNoLive';
    if (r.id === 'free' && plans) return 'compare.rows.free.oombaPlans';
    return `compare.rows.${r.id}.oomba`;
  };
  const usCell = r => html`<td class="cmp-us">${mark(t, 'yes')}${el(t, 'span', oombaKey(r), vars, ' class="cmp-detail"')}${r.gated ? el(t, 'span', gate, {}, ' class="cmp-tag"') : ''}</td>`;
  const theirCell = (r, c) => {
    const cell = cellOf(r.id, c.id); const n = notes.numOf(r.id, c.id);
    return html`<td>${mark(t, cell.s)}${n ? html`<sup class="cmp-fn"><a href="#fn-${n}" aria-label="${t('compare.sources.fnLabel', { n })}">[${n}]</a></sup>` : ''}</td>`;
  };
  // The caption is read with the table; the same words show above the scroll box, where a phone keeps them in view.
  const table = html`<p class="cmp-cap" aria-hidden="true"${fb(t, 'compare.table.caption')}>${t('compare.table.caption')}</p>
    <p class="cmp-hint" aria-hidden="true"${fb(t, 'compare.table.hint')}>${t('compare.table.hint')}</p>
    <div class="cmp-scroll" role="region" aria-labelledby="table-h" tabindex="0">
    <table class="cmp-table">
      <caption${fb(t, 'compare.table.caption')}>${t('compare.table.caption')}</caption>
      <thead><tr>
        <th scope="col"${fb(t, 'compare.table.need')}>${t('compare.table.need')}</th>
        <th scope="col" class="cmp-us">Oomba</th>
        ${COMPETITORS.map(c => html`<th scope="col" lang="en" dir="ltr">${c.name}</th>`)}
      </tr></thead>
      <tbody>${rows.map(r => html`<tr id="row-${r.id}">
        <th scope="row"${fb(t, `compare.rows.${r.id}.need`)}>${t(`compare.rows.${r.id}.need`)}</th>
        ${usCell(r)}${COMPETITORS.map(c => theirCell(r, c))}
      </tr>`)}</tbody>
    </table></div>
    ${el(t, 'p', 'compare.table.legend', {}, ' class="cmp-legend"')}`;
  const why = ['one', 'make', 'safe'];
  const whyIco = { one: '🧮', make: '🎨', safe: '🛡️' };
  const cta = plans ? html`<a class="btn btn-primary btn-big" href="/trial">${t('plans.teacher.start')}</a>` : html`<a class="btn btn-primary btn-big" href="${lp(req, '/teachers')}#start">${t('teachers.cta.start')}</a>`;
  const email = contactEmail();
  const crumbs = [[t('nav.home'), '/'], [t('nav.teachers'), '/teachers'], [t('compare.name'), PATH]];
  const body = html`${CSS}<div class="lp">
    <nav class="crumbs small" aria-label="${t('learn.crumbs')}"><ol>${crumbs.map(([name, p], i) => html`<li>${i < crumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>
    <section class="lp-hero lp-hero-sm" aria-labelledby="lp-h1">
      ${el(t, 'p', 'compare.kicker', {}, ' class="lp-kicker"')}
      ${el(t, 'h1', 'compare.h1', {}, ' id="lp-h1"')}
      ${el(t, 'p', 'compare.lead', {}, ' class="lead"')}
      <p class="muted small lp-updated cmp-checked"${fb(t, 'compare.checked')}>${tHtml(t, 'compare.checked', { date: dateTag(req) })}</p>
    </section>
    <section class="lp-sec" id="table" aria-labelledby="table-h">
      ${el(t, 'h2', 'compare.table.h', {}, ' id="table-h"')}
      ${table}
    </section>
    <section class="lp-sec" id="why" aria-labelledby="why-h">
      ${el(t, 'h2', 'compare.why.h', {}, ' id="why-h"')}
      <ul class="cmp-why">${why.map(k => html`<li class="panel"><h3${fb(t, `compare.why.${k}.h`)}>${ico(whyIco[k], { size: 22 })} ${t(`compare.why.${k}.h`)}</h3>${el(t, 'p', `compare.why.${k}.p`, vars)}</li>`)}</ul>
      <div class="row lp-cta">${cta}</div>
    </section>
    <section class="panel" id="sources" aria-labelledby="sources-h">
      ${el(t, 'h2', 'compare.sources.h', {}, ' id="sources-h"')}
      ${el(t, 'p', 'compare.sources.p')}
      ${notes.list.length ? html`<ol class="cmp-sources">${notes.list.map(f => html`<li id="fn-${f.n}"><span lang="en" dir="ltr">${f.comp.name}</span>: <a href="${f.url}" rel="noopener nofollow" dir="ltr">${f.url}</a> <span class="muted small">(${t('compare.sources.read', { date: fmt(req.locale || DEFAULT_LOCALE).day(Date.parse(`${f.checked}T00:00:00Z`), { year: 'numeric', month: 'long', day: 'numeric' }) })})</span></li>`)}</ol>` : ''}
      ${el(t, 'p', 'compare.sources.sites')}
      <ul class="cmp-sources">${COMPETITORS.map(c => html`<li><span lang="en" dir="ltr">${c.name}</span>: <a href="${c.site}" rel="noopener nofollow" dir="ltr">${c.site}</a></li>`)}</ul>
      <p class="cmp-notice" id="notice"${fb(t, 'compare.notice')}>${tHtml(t, 'compare.notice', { names: namesList(req), date: dateTag(req), href: `mailto:${email}` })}</p>
    </section>
    <ul class="chips lp-more">
      <li><a class="chip" href="${lp(req, '/teachers')}">${ico('🍎', { size: 18 })}${t('research.links.teachers')}</a></li>
      <li><a class="chip" href="${lp(req, '/research')}">${ico('📚', { size: 18 })}${t('research.name')}</a></li>
      <li><a class="chip" href="${lp(req, '/compliance')}">${ico('🔒', { size: 18 })}${t('compliance.name')}</a></li>
    </ul>
  </div>`;
  page(req, res, {
    title: t('compare.title'), description: t('compare.description'), body, bodyClass: 'lp-page',
    seo: {
      index: true, path: PATH, langs: seo.langsWithKey('compare.h1'), image: '/og/teachers.jpg', imageAlt: t('compare.h1'),
      jsonld: [seo.graph([
        { '@type': 'WebPage', '@id': seo.abs(req, PATH), url: seo.abs(req, PATH), name: t('compare.title'), description: t('compare.description'), dateModified: COMPARE_CHECKED,
          isPartOf: { '@id': seo.abs(req, '/#website') }, publisher: { '@id': seo.orgId(req) }, audience: { '@type': 'EducationalAudience', educationalRole: 'teacher' } },
        seo.breadcrumbLd(req, crumbs), seo.organizationLd(req),
      ])],
    },
  });
});
