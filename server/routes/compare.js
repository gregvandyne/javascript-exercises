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
//   supporting words on their site; every other cell must carry a source, shown in its row's detail (the row opens: the
//   quote, the day and a link to their page) and in the Sources list (collapsed at the end of the page).
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
import { mayOpenGrammarLab } from '../services/grammar-lab-access.js';
import * as GLAB from '../services/grammar-lab.js';

export const router = Router();
export const PATH = '/compare';
/** The page's script: the rows that open (public/js/compare-rows.js). */
export const SCRIPT = '/js/compare-rows.js';

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
 * Read on 2026-11-22 from each product's own public pages (docs/compare-sources.md has every cell, what was read and
 * what could not be checked). Not stated is never a claim about the product: the legend says it means we have not
 * confirmed it from their public website.
 */
export const CELLS = {
  games: {
    kahoot: { s: 'yes', src: { url: 'https://kahoot.com/home/mobile-app/', checked: '2026-11-22', quote: 'You can create quiz games, host live sessions, and access millions of ready-made kahoots at no cost.' } },
    classroomscreen: { s: 'yes', src: { url: 'https://classroomscreen.com/product/games-for-learners', checked: '2026-11-22', quote: 'Play and learn with Classroomscreen’s ready-made games and templates.' } },
  },
  build: {
    kahoot: { s: 'yes', src: { url: 'https://kahoot.com/schools/interactive-lessons/', checked: '2026-11-22', quote: 'Encourage students to create their own kahoots.' } },
  },
  dashboard: {
    classroomscreen: { s: 'yes', src: { url: 'https://classroomscreen.com/', checked: '2026-11-22', quote: 'Keep students focused on the one screen they should be focused on with our engaging widgets.' } },
  },
  routines: {
    classroomscreen: { s: 'partial', src: { url: 'https://classroomscreen.com/', checked: '2026-11-22', quote: 'Help students manage their time effectively with a range of timer widgets.' } },
  },
  eyes: {
    brainingcamp: { s: 'partial', src: { url: 'https://www.brainingcamp.com/', checked: '2026-11-22', quote: 'Share Codes make collaboration easy by allowing you to instantly share customized lessons, activities, or tasks.' } },
  },
  manip: {
    brainingcamp: { s: 'yes', src: { url: 'https://www.brainingcamp.com/', checked: '2026-11-22', quote: 'With Brainingcamp, you get 18 of the most popular classroom manipulatives.' } },
  },
  room: {
    brainingcamp: { s: 'yes', src: { url: 'https://www.brainingcamp.com/live', checked: '2026-11-22', quote: 'See all your students\' screens, monitor their progress, and provide instant feedback.' } },
  },
  regroup: {
    brainingcamp: { s: 'yes', src: { url: 'https://www.brainingcamp.com/base-ten-blocks', checked: '2026-11-22', quote: 'Regroup animations' } },
  },
  aiDraft: {
    kahoot: { s: 'yes', src: { url: 'https://kahoot.com/schools/', checked: '2026-11-22', quote: 'Create quick quizzes, exit tickets, and generate content with AI.' } },
  },
  grades: {
    kahoot: { s: 'yes', src: { url: 'https://kahoot.com/schools/', checked: '2026-11-22', quote: 'Kahoot! for K12 teachers and schools' } },
    classroomscreen: { s: 'yes', src: { url: 'https://classroomscreen.com/', checked: '2026-11-22', quote: 'These brain breaks are suitable for a variety of ages from elementary to high school.' } },
    brainingcamp: { s: 'yes', src: { url: 'https://www.brainingcamp.com/', checked: '2026-11-22', quote: 'Access 300+ high-quality K-8 Tasks, complete with Teacher Notes and Share Codes for students to launch.' } },
  },
  languages: {
    kahoot: { s: 'yes', src: { url: 'https://kahoot.com/schools/plans/', checked: '2026-11-22', quote: 'You can also play, create and host kahoots, view reports and more in Spanish, Brazilian Portuguese, French, German, Italian, Japanese, Dutch, Polish, Turkish, Norwegian, Swedish, Danish, Arabic, Ukrainian, Korean, Indonesian, Simplified Chinese, Traditional Chinese, Thai and Vietnamese.' } },
    classroomscreen: { s: 'partial', src: { url: 'https://classroomscreen.com/helpcenter/how-do-i-change-the-language', checked: '2026-11-22', quote: 'Although we currently only support English for the rest of the application, it is on our backlog to offer the application in more languages in the future.' } },
  },
  devices: {
    kahoot: { s: 'yes', src: { url: 'https://kahoot.com/home/mobile-app/', checked: '2026-11-22', quote: 'Players join from any device.' } },
    classroomscreen: { s: 'yes', src: { url: 'https://classroomscreen.com/schools-districts', checked: '2026-11-22', quote: 'Classroomscreen works on any device with an internet connection.' } },
    brainingcamp: { s: 'yes', src: { url: 'https://www.brainingcamp.com/', checked: '2026-11-22', quote: 'Yes, Brainingcamp can be used on any web-enabled device without any installation.' } },
  },
  privacy: {
    kahoot: { s: 'yes', src: { url: 'https://kahoot.com/safety-center/child-safety-online/', checked: '2026-11-22', quote: 'We do not knowingly seek or collect personal information for users under the age of 13 (for U.S. users) or 16 (for non-U.S. users).' } },
    classroomscreen: { s: 'yes', src: { url: 'https://classroomscreen.com/legal/privacy-policy', checked: '2026-11-22', quote: 'We never sell your personal information.' } },
    brainingcamp: { s: 'yes', src: { url: 'https://www.brainingcamp.com/', checked: '2026-11-22', quote: 'Students share generic accounts that contain no personally identifiable data.' } },
  },
  free: {
    kahoot: { s: 'yes', src: { url: 'https://kahoot.com/schools/plans/', checked: '2026-11-22', quote: 'Yes, we offer Kahoot! Go, a free plan for teachers.' } },
    classroomscreen: { s: 'yes', src: { url: 'https://classroomscreen.com/helpcenter/what-is-classroomscreen', checked: '2026-11-22', quote: 'Classroomscreen is free to use for everyone, with a few additional features like saving or sharing screens available in our Pro subscription.' } },
    brainingcamp: { s: 'partial', src: { url: 'https://www.brainingcamp.com/', checked: '2026-11-22', quote: 'No commitment, credit card, or cancellation required. It\'s a 100% free trial.' } },
  },
};

// ------------------------------------------------------------------------------------------------- grammar practice
// Grammar Lab beside NoRedInk (docs/decisions.md "Grammar Lab beside NoRedInk"). The owner's third name, shown only while
// Grammar Lab is open to every visitor (grammarCompareOn): with the flag off, or open to testers only, neither /compare
// nor "/" names NoRedInk or mentions Grammar Lab, so nothing advertises a page a visitor would get a 404 on.

/** The one condition for every NoRedInk and Grammar Lab mention on /compare and "/" (routes/landing.js): Grammar Lab is
 *  open to every visitor (GRAMMAR_LAB on with '*' on GRAMMAR_LAB_USERS), i.e. a visitor with no session may open it. */
export const grammarCompareOn = () => mayOpenGrammarLab(null);

/** The product the grammar section sets beside Grammar Lab, with its own public website. Never translated. */
export const GRAMMAR_RIVAL = { id: 'noredink', name: 'NoRedInk', site: 'https://www.noredink.com/' };
/** The day NoRedInk's pages were read for the grammar section (docs/compare-sources.md "NoRedInk"). */
export const GRAMMAR_CHECKED = '2026-11-27';

/** The grammar section's rows, by classroom need, with Grammar Lab's own status (from its code: services/grammar-lab*.js,
 *  seed-lessons/grammar-lab/topics.json). Grammar Lab's No rows say what it does not do, by design or not yet. */
export const GRAMMAR_ROWS = [
  { id: 'practice', us: 'yes' }, { id: 'mastery', us: 'yes' }, { id: 'grades', us: 'yes' }, { id: 'readAloud', us: 'yes' },
  { id: 'proofread', us: 'yes' }, { id: 'essays', us: 'no' }, { id: 'feedback', us: 'no' }, { id: 'classes', us: 'no' },
  { id: 'free', us: 'yes' },
];

/** NoRedInk's cells, in the same shape as CELLS (a row left out is Not stated). */
export const GRAMMAR_CELLS = (() => {
  const premium = { url: 'https://www.noredink.com/premium', checked: GRAMMAR_CHECKED, quote: 'Premium gives schools full access to NoRedInk\'s 1,000s of skills exercises and writing prompts, guided composition tools, reporting features, originality detection, and AI-powered feedback tool.' };
  return {
    practice: { noredink: { s: 'yes', src: premium } },
    grades: { noredink: { s: 'yes', src: { url: 'https://www.noredink.com/', checked: GRAMMAR_CHECKED, quote: 'building strong writers and critical thinkers in Grades 3–12' } } },
    essays: { noredink: { s: 'yes', src: { url: 'https://www.noredink.com/about/product', checked: GRAMMAR_CHECKED, quote: 'Meet students where they are with adaptive exercises and scaffolded writing activities that deliver differentiated support when students get stuck at various points of the writing cycle.' } } },
    feedback: { noredink: { s: 'yes', src: premium } },
    classes: { noredink: { s: 'yes', src: premium } },
    free: { noredink: { s: 'yes', src: { url: 'https://www.noredink.com/product/elementary-grades-3-5/', checked: GRAMMAR_CHECKED, quote: 'a new version of our free online writing curriculum that\'s designed specifically for elementary learners' } } },
  };
})();

/** Grammar Lab's numbers, from its data: { topics, units, rooms (topics with a Mistake Hunt room), bands: ['K-2', '3-5', '6-8'] }. */
export function grammarFacts() {
  const bands = GLAB.bands();
  const units = [...new Set(bands.flatMap(b => b.pathways))].map(id => GLAB.pathway(id)).filter(Boolean);
  const topics = [...new Set(units.flatMap(p => p.topics))];
  return { topics: topics.length, units: units.length, rooms: topics.filter(id => GLAB.room(id)).length, bands: bands.map(b => b.grades) };
}

/** The cell for one row and product. */
export const cellOf = (rowId, compId, cells = CELLS) => (cells[rowId] && cells[rowId][compId]) || { s: 'notStated' };

/** The sources: one per distinct source (address and words), in table order (the collapsed Sources list). -> { list: [{ n, url, comp, checked,
 *  quote }], numOf(rowId, compId) -> n | 0 } */
export function footnotes(cells = CELLS, rows = ROWS, comps = COMPETITORS) {
  const list = []; const byKey = new Map(); const key = src => `${src.url}\n${src.quote}`;
  for (const r of rows) for (const c of comps) {
    const cell = cellOf(r.id, c.id, cells);
    if (cell.s === 'notStated' || !cell.src) continue;
    if (!byKey.has(key(cell.src))) { byKey.set(key(cell.src), list.length + 1); list.push({ n: list.length + 1, url: cell.src.url, comp: c, checked: cell.src.checked, quote: cell.src.quote }); }
  }
  return { list, numOf: (rowId, compId) => { const cell = cellOf(rowId, compId, cells); return cell.src ? byKey.get(key(cell.src)) || 0 : 0; } };
}

/** "Kahoot!, Classroomscreen and Brainingcamp" in the page's language. */
// English as the owner wrote the notice ("A, B and C"); other languages join the names their own way.
// With the grammar section on, NoRedInk joins the notice.
const namesList = req => { const names = [...COMPETITORS, ...(grammarCompareOn() ? [GRAMMAR_RIVAL] : [])].map(c => c.name); if (/^en/.test(req.locale || DEFAULT_LOCALE)) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`; try { return new Intl.ListFormat(req.t.intl || req.locale || 'en', { type: 'conjunction' }).format(names); } catch { return names.join(', '); } };

/** A list in the page's language ("K-2, 3-5 and 6-8"). */
const listOf = (req, items) => { if (/^en/.test(req.locale || DEFAULT_LOCALE)) return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`; try { return new Intl.ListFormat(req.t.intl || req.locale || 'en', { type: 'conjunction' }).format(items); } catch { return items.join(', '); } };

/** A status mark and its one word (the word is always there: never color or an icon alone). */
function mark(t, s) {
  const key = `compare.status.${s}`;
  return html`<span class="cmp-mark cmp-${s}">${STATUSES[s] ? ico(STATUSES[s], { size: 18 }) : ''}<b${fb(t, key)}>${t(key)}</b></span>`;
}
/** The page's own CSS. Colors are the site's tokens (light and dark). The table scrolls inside its own box on narrow
 *  screens with the need column kept in view; the page itself never scrolls sideways. */
const CSS = raw(`<style>
.cmp-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:var(--r);border:1px solid var(--line);background:var(--card);max-width:100%}
.cmp-scroll:focus-visible{outline:3px solid var(--current);outline-offset:2px}
.cmp-table{border-collapse:separate;border-spacing:0;width:100%;min-width:620px;font-size:.95rem}
.cmp-table caption{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cmp-table th,.cmp-table td{padding:10px 12px;text-align:start;vertical-align:middle;border-top:1px solid var(--line)}
.cmp-table thead th{background:var(--card-2);font-weight:800;white-space:nowrap}
.cmp-table thead th.cmp-us{background:var(--current);color:var(--on-current)}
.cmp-table th[scope=row]{position:sticky;inset-inline-start:0;z-index:1;background:var(--card);font-weight:700;min-width:150px;max-width:220px;box-shadow:1px 0 0 var(--line)}
.cmp-table thead th:first-child{position:sticky;inset-inline-start:0;z-index:2}
.cmp-table td.cmp-us{background:color-mix(in srgb,var(--ok-bg) 45%,var(--card))}
.cmp-cell{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;white-space:nowrap}
.cmp-mark{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.cmp-mark .fx{flex:none}
.cmp-notStated b{font-weight:600;color:var(--muted)}
.cmp-tag{display:inline-block;padding:0 7px;border-radius:999px;background:var(--warn-bg);color:var(--warn-ink);font-size:.75rem;font-weight:700;white-space:nowrap}
.cmp-table th.cmp-need{padding:0}
.cmp-tog{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;padding:10px 12px;border:0;background:transparent;color:inherit;font:inherit;font-weight:700;text-align:start;cursor:pointer}
.cmp-tog:hover{background:var(--hover)}
.cmp-tog:focus-visible{outline:3px solid var(--current);outline-offset:-3px}
.cmp-tog .fx{flex:none;transition:transform .15s;transform:rotate(-90deg)}
[dir=rtl] .cmp-tog .fx{transform:rotate(90deg)}
.cmp-tog[aria-expanded=true] .fx{transform:none}
@media (prefers-reduced-motion:reduce){.cmp-tog .fx{transition:none}}
.cmp-row.cmp-open>*{background-image:linear-gradient(var(--hover),var(--hover))}
.cmp-table tr.cmp-det>td{padding:0;border-top:0;background:var(--card-2)}
.cmp-det-in{position:sticky;inset-inline-start:0;box-sizing:border-box;max-width:calc(100vw - 34px);padding:10px 14px 14px;white-space:normal;font-size:.9rem;line-height:1.45}
.cmp-det-in ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.cmp-det-in li{margin:0}
.cmp-det-in q{color:var(--text-2)}
.cmp-det-in a{white-space:nowrap}
.cmp-det-ns{color:var(--muted)}
.cmp-legend,.cmp-line{margin:10px 0 0;color:var(--muted);font-size:.85rem}
.cmp-open-hint{margin:0 0 8px;color:var(--muted);font-size:.85rem}
.cmp-hint{display:none}
@media (max-width:820px){.cmp-hint{display:inline}.cmp-table th[scope=row]{min-width:132px;max-width:160px;font-size:.9rem}}
.cmp-why{list-style:none;padding:0;margin:0 0 16px;display:grid;gap:10px}
.cmp-why li{display:flex;gap:10px;align-items:center;margin:0;font-weight:600}
.cmp-why .fx{flex:none}
.cmp-src{margin-top:var(--s5,24px)}
.cmp-src>summary{cursor:pointer;font-weight:700}
.cmp-src[open]>summary{margin-bottom:10px}
.cmp-src>summary:focus-visible{outline:3px solid var(--current);outline-offset:2px}
.cmp-sources{padding-inline-start:1.2em;overflow-wrap:anywhere}
.cmp-sources li{margin-block:.5em}
.cmp-quote{color:var(--text-2);font-size:.9rem}
.cmp-table.cmp-narrow{min-width:0}
.cmp-narrow .cmp-cell,.cmp-narrow .cmp-mark{white-space:normal}
.cmp-narrow th[scope=row]{min-width:0}
.cmp-try{margin-top:12px}
</style>`);

router.get(PATH, (req, res) => {
  const t = req.t;
  const gate = plansOn() ? 'compare.gate.plan' : 'compare.gate.testing';
  const plans = familiesOn(req);
  const vars = { count: availableLocales().length, plans: '/plans' };
  const rows = ROWS.filter(r => r.id !== 'videos' || readyVideos().length);
  const notes = footnotes(CELLS, rows);
  const dayOf = d => fmt(req.locale || DEFAULT_LOCALE).day(Date.parse(`${d}T00:00:00Z`), { year: 'numeric', month: 'long', day: 'numeric' });
  const need = r => t(`compare.rows.${r.id}.need`);
  // Oomba's detail for a need (the cell itself is Yes, with the gate's tag on the teaching tools).
  const oombaKey = r => {
    if (r.id === 'games' && !liveOn()) return 'compare.rows.games.oombaNoLive';
    if (r.id === 'free' && plans) return 'compare.rows.free.oombaPlans';
    return `compare.rows.${r.id}.oomba`;
  };
  const usCell = r => html`<td class="cmp-us"><span class="cmp-cell">${mark(t, 'yes')}${r.gated ? el(t, 'span', gate, {}, ' class="cmp-tag"') : ''}</span></td>`;
  const theirCell = (r, c) => html`<td><span class="cmp-cell">${mark(t, cellOf(r.id, c.id).s)}</span></td>`;
  // The row's detail, under it when opened: Oomba's detail, then each product's words from their page with the day and
  // a link, or "Not stated on their site".
  const detail = r => html`<tr class="cmp-det" id="det-${r.id}" hidden><td colspan="${COMPETITORS.length + 2}"><div class="cmp-det-in"><ul>
    <li><b>Oomba</b>: ${tHtml(t, oombaKey(r), vars)}</li>
    ${COMPETITORS.map(c => {
      const cell = cellOf(r.id, c.id); const src = cell.s !== 'notStated' && cell.src;
      return src ? html`<li><b lang="en" dir="ltr">${c.name}</b> (${t(`compare.status.${cell.s}`)}): <q lang="en" dir="ltr">${src.quote}</q> <span class="muted">(${t('compare.sources.read', { date: dayOf(src.checked) })})</span> <a href="${src.url}" rel="noopener nofollow" target="_blank"${fb(t, 'compare.detail.link')}>${t('compare.detail.link')}</a></li>`
        : html`<li class="cmp-det-ns"><b lang="en" dir="ltr">${c.name}</b>: ${el(t, 'span', 'compare.detail.notStated')}</li>`;
    })}
  </ul></div></td></tr>`;
  const table = html`<p class="cmp-open-hint">${el(t, 'span', 'compare.table.open')} <span class="cmp-hint"${fb(t, 'compare.table.hint')}>${t('compare.table.hint')}</span></p>
    <div class="cmp-scroll" role="region" aria-labelledby="table-h" tabindex="0">
    <table class="cmp-table">
      <caption${fb(t, 'compare.table.caption')}>${t('compare.table.caption')}</caption>
      <thead><tr>
        <th scope="col"${fb(t, 'compare.table.need')}>${t('compare.table.need')}</th>
        <th scope="col" class="cmp-us">Oomba</th>
        ${COMPETITORS.map(c => html`<th scope="col" lang="en" dir="ltr">${c.name}</th>`)}
      </tr></thead>
      <tbody>${rows.map(r => html`<tr id="row-${r.id}" class="cmp-row">
        <th scope="row" class="cmp-need"><button type="button" class="cmp-tog" aria-expanded="false" aria-controls="det-${r.id}">${ico('⬇️', { size: 16 })}<span${fb(t, `compare.rows.${r.id}.need`)}>${need(r)}</span></button></th>
        ${usCell(r)}${COMPETITORS.map(c => theirCell(r, c))}
      </tr>${detail(r)}`)}</tbody>
    </table></div>
    ${el(t, 'p', 'compare.table.legend', {}, ' class="cmp-legend"')}
    <p class="cmp-line" id="notice"${fb(t, 'compare.line')}>${tHtml(t, 'compare.line', { date: html`<time datetime="${COMPARE_CHECKED}">${dayOf(COMPARE_CHECKED)}</time>`, names: namesList(req), href: `mailto:${contactEmail()}` })}</p>`;
  // The grammar section (only while Grammar Lab is open to every visitor): Grammar Lab beside NoRedInk, the same marks,
  // the same rows that open, each NoRedInk cell with its quote, day and link.
  const glOn = grammarCompareOn();
  const glFacts = glOn ? grammarFacts() : null;
  const glVars = glOn ? { ...glFacts, bands: listOf(req, glFacts.bands) } : {};
  const glNotes = glOn ? footnotes(GRAMMAR_CELLS, GRAMMAR_ROWS, [GRAMMAR_RIVAL]) : { list: [] };
  const glCell = r => cellOf(r.id, GRAMMAR_RIVAL.id, GRAMMAR_CELLS);
  const grammar = glOn ? html`<section class="lp-sec" id="grammar" aria-labelledby="grammar-h">
      ${el(t, 'h2', 'compare.grammar.h', {}, ' id="grammar-h"')}
      ${el(t, 'p', 'compare.grammar.lead', glVars)}
      <p class="cmp-open-hint">${el(t, 'span', 'compare.table.open')}</p>
      <div class="cmp-scroll" role="region" aria-labelledby="grammar-h" tabindex="0">
      <table class="cmp-table cmp-narrow">
        <caption${fb(t, 'compare.grammar.caption')}>${t('compare.grammar.caption', { name: GRAMMAR_RIVAL.name })}</caption>
        <thead><tr>
          <th scope="col"${fb(t, 'compare.table.need')}>${t('compare.table.need')}</th>
          <th scope="col" class="cmp-us">${t('grammarLab.title')}</th>
          <th scope="col" lang="en" dir="ltr">${GRAMMAR_RIVAL.name}</th>
        </tr></thead>
        <tbody>${GRAMMAR_ROWS.map(r => {
          const cell = glCell(r); const src = cell.s !== 'notStated' && cell.src;
          return html`<tr id="row-gl-${r.id}" class="cmp-row">
          <th scope="row" class="cmp-need"><button type="button" class="cmp-tog" aria-expanded="false" aria-controls="det-gl-${r.id}">${ico('⬇️', { size: 16 })}<span${fb(t, `compare.grammar.rows.${r.id}.need`)}>${t(`compare.grammar.rows.${r.id}.need`)}</span></button></th>
          <td class="cmp-us"><span class="cmp-cell">${mark(t, r.us)}</span></td>
          <td><span class="cmp-cell">${mark(t, cell.s)}</span></td>
        </tr><tr class="cmp-det" id="det-gl-${r.id}" hidden><td colspan="3"><div class="cmp-det-in"><ul>
          <li><b>Oomba</b>: ${tHtml(t, `compare.grammar.rows.${r.id}.oomba`, glVars)}</li>
          ${src ? html`<li><b lang="en" dir="ltr">${GRAMMAR_RIVAL.name}</b> (${t(`compare.status.${cell.s}`)}): <q lang="en" dir="ltr">${src.quote}</q> <span class="muted">(${t('compare.sources.read', { date: dayOf(src.checked) })})</span> <a href="${src.url}" rel="noopener nofollow" target="_blank"${fb(t, 'compare.detail.link')}>${t('compare.detail.link')}</a></li>`
            : html`<li class="cmp-det-ns"><b lang="en" dir="ltr">${GRAMMAR_RIVAL.name}</b>: ${el(t, 'span', 'compare.detail.notStated')}</li>`}
        </ul></div></td></tr>`;
        })}</tbody>
      </table></div>
      ${el(t, 'p', 'compare.table.legend', {}, ' class="cmp-legend"')}
      <p class="cmp-line"${fb(t, 'compare.grammar.checked')}>${t('compare.grammar.checked', { name: GRAMMAR_RIVAL.name, date: dayOf(GRAMMAR_CHECKED) })}</p>
      <p class="cmp-try"><a class="btn btn-ghost" href="/courses/grammar-lab"${fb(t, 'compare.grammar.try')}>${t('compare.grammar.try')}</a></p>
    </section>` : '';
  const srcCount = notes.list.length + glNotes.list.length;
  const why = [['🧮', 'l1'], ['🎨', 'l2'], ['🛡️', 'l3']];
  const cta = plans ? html`<a class="btn btn-primary btn-big" href="/trial">${t('plans.teacher.start')}</a>` : html`<a class="btn btn-primary btn-big" href="${lp(req, '/teachers')}#start">${t('teachers.cta.start')}</a>`;
  const crumbs = [[t('nav.home'), '/'], [t('nav.teachers'), '/teachers'], [t('compare.name'), PATH]];
  const body = html`${CSS}<div class="lp">
    <nav class="crumbs small" aria-label="${t('learn.crumbs')}"><ol>${crumbs.map(([name, p], i) => html`<li>${i < crumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>
    <section class="lp-hero lp-hero-sm" aria-labelledby="lp-h1">
      ${el(t, 'p', 'compare.kicker', {}, ' class="lp-kicker"')}
      ${el(t, 'h1', 'compare.h1', {}, ' id="lp-h1"')}
      ${el(t, 'p', 'compare.lead', {}, ' class="lead"')}
    </section>
    <section class="lp-sec" id="table" aria-labelledby="table-h">
      ${el(t, 'h2', 'compare.table.h', {}, ' id="table-h"')}
      ${table}
    </section>
    ${grammar}
    <section class="lp-sec" id="why" aria-labelledby="why-h">
      ${el(t, 'h2', 'compare.why.h', {}, ' id="why-h"')}
      <ul class="cmp-why">${why.map(([e, k]) => html`<li${fb(t, `compare.why.${k}`)}>${ico(e, { size: 22 })}<span>${t(`compare.why.${k}`, vars)}</span></li>`)}</ul>
      <div class="row lp-cta">${cta}</div>
    </section>
    <details class="panel cmp-src" id="sources">
      <summary${fb(t, 'compare.sources.summary')}>${t('compare.sources.summary', { count: srcCount })}</summary>
      ${el(t, 'p', 'compare.sources.how', { date: dayOf(COMPARE_CHECKED) })}
      <ol class="cmp-sources">${notes.list.map(f => html`<li id="src-${f.n}"><span lang="en" dir="ltr">${f.comp.name}</span>: <a href="${f.url}" rel="noopener nofollow" dir="ltr">${f.url}</a> <span class="muted small">(${t('compare.sources.read', { date: dayOf(f.checked) })})</span><br><q class="cmp-quote" lang="en" dir="ltr">${f.quote}</q></li>`)}${glNotes.list.map(f => html`<li id="src-gl-${f.n}"><span lang="en" dir="ltr">${f.comp.name}</span>: <a href="${f.url}" rel="noopener nofollow" dir="ltr">${f.url}</a> <span class="muted small">(${t('compare.sources.read', { date: dayOf(f.checked) })})</span><br><q class="cmp-quote" lang="en" dir="ltr">${f.quote}</q></li>`)}</ol>
      ${el(t, 'p', 'compare.sources.sites')}
      <ul class="cmp-sources">${[...COMPETITORS, ...(glOn ? [GRAMMAR_RIVAL] : [])].map(c => html`<li><span lang="en" dir="ltr">${c.name}</span>: <a href="${c.site}" rel="noopener nofollow" dir="ltr">${c.site}</a></li>`)}</ul>
    </details>
    <ul class="chips lp-more">
      <li><a class="chip" href="${lp(req, '/teachers')}">${ico('🍎', { size: 18 })}${t('research.links.teachers')}</a></li>
      <li><a class="chip" href="${lp(req, '/research')}">${ico('📚', { size: 18 })}${t('research.name')}</a></li>
      <li><a class="chip" href="${lp(req, '/compliance')}">${ico('🔒', { size: 18 })}${t('compliance.name')}</a></li>
    </ul>
  </div>`;
  page(req, res, {
    title: t('compare.title'), description: t('compare.description'), body, bodyClass: 'lp-page', scripts: [SCRIPT],
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
