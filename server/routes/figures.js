// Figures, the standalone product (services/figures.js; docs/decisions.md "Figures, the standalone product"). Hidden
// while it is tested: every address here answers only someone services/figures.js roleOf lets in (the platform admin and
// the school staff on the manipulatives' tester list); everyone else falls through to the site's normal 404. Never
// linked from any menu, the sitemap or search, and never indexed (X-Robots-Tag and the layout's noindex).
//   GET  /figures                                  the menu: every kind as a card, the teacher's worksheets
//   GET  /figures/thumb/<kind>.svg                 a card's picture (the kind's example, drawn on the server, cached)
//   GET  /figures/:kind                            one kind's editor (?d= a figure's data, ?ws=&item= a worksheet question)
//   GET  /figures/worksheets/new, /figures/worksheets/:id   the worksheet builder
//   GET  /figures/worksheets/:id/print?key=0|1     the printable student sheet (and the answer key: its owner only)
//   GET  /api/figures/state                        the teacher's worksheets
//   POST /api/figures/gen                          a generator's question for a seed ({ gen, seed } or { kind })
//   GET  /api/figures/presets/:kind, POST /api/figures/presets, POST /api/figures/presets/:id/delete
//   POST /api/figures/prefs                        "Power with AI" on or off ({ ai })
//   POST /api/figures/worksheets                   a new worksheet ({ title, grade, items })
//   GET  /api/figures/worksheets/:id               a worksheet with its figures and its print preview
//   POST /api/figures/worksheets/:id               title and grade;  POST .../delete
//   POST /api/figures/worksheets/:id/items         add a question ({ item } or { kind } for a starter)
//   POST /api/figures/worksheets/:id/items/:item   change a question; .../delete, .../move ({ dir }), .../regen
//   POST /api/figures/worksheets/:id/draft         "Power with AI" ({ brief, grade, count })
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { page, VERSION } from '../views/layout.js';
import { rateLimit } from '../services/ratelimit.js';
import { localeInfo } from '../i18n/index.js';
import { figTag } from '../services/figlibs.js';
import * as F from '../services/figures.js';
import { canHost as manipHost } from '../services/manipulatives.js';
import { decodeData, SOON } from '../../public/js/figures-catalog.js';

export const router = Router();
const STATUS = { notFound: 404, tooMany: 409, fullSheet: 409, tooBig: 413 };
const fail = (req, res, r) => res.status(STATUS[r.code] || 400).json({ error: req.t(`figures.errors.${r.code}`), code: r.code, ...(r.problems ? { problems: r.problems } : {}) });
const body = req => (req.body && typeof req.body === 'object' ? req.body : {});

// The gate: anyone else goes on to the next router, and so to the site's 404 (the page's, or the API's JSON one).
router.use(['/figures', '/api/figures'], (req, res, next) => {
  const role = F.roleOf(req.user);
  if (!role) return next('router');
  req.figRole = role;
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  next();
});

const CSS = raw(`<link rel="stylesheet" href="/css/figures.css?v=${VERSION}">`);
const kindName = (t, id) => t(`figures.kinds.${id}.name`);
const subjName = (t, s) => t(`figures.subjects.${s}`);
/** "Teaching tools: Manipulatives · Figures", for someone who can open both (both are hidden while they are tested). */
export function teachingTools(req, current) {
  const u = req.user;
  if (!(manipHost(u) && F.canMake(u))) return '';
  const t = req.t, a = (href, k, label) => html`<a class="fg-tool${current === k ? ' on' : ''}" href="${href}"${current === k ? raw(' aria-current="page"') : ''}>${label}</a>`;
  return html`<nav class="fg-tools" aria-label="${t('figures.tools.label')}"><span class="fg-tools-l">${t('figures.tools.label')}</span>${a('/manipulatives', 'manip', t('figures.tools.manipulatives'))}${a('/figures', 'figures', t('figures.tools.figures'))}</nav>`;
}
const dateOf = (req, ms) => new Intl.DateTimeFormat(localeInfo(req.locale).intl || 'en-US', { month: 'short', day: 'numeric' }).format(new Date(ms));
const crumbs = (t, list) => html`<nav class="fg-crumbs" aria-label="${t('figures.crumbs')}">${list.map(([href, label], i) => (href ? html`<a href="${href}">${label}</a>` : html`<b>${label}</b>`)).map((x, i) => (i ? html` <span aria-hidden="true">/</span> ${x}` : x))}</nav>`;

// ---------------------------------------------------------------- the menu
router.get('/figures', (req, res) => {
  const t = req.t, u = req.user, sheets = F.listWorksheets(u);
  const card = K => html`<a class="fg-card" href="/figures/${K.id}" data-subject="${K.subject}" data-grades="${K.grades.join(' ')}" data-search="${`${kindName(t, K.id)} ${t(`figures.kinds.${K.id}.desc`)} ${K.id}`.toLowerCase()}">
    <span class="fg-thumb"><img src="/figures/thumb/${K.id}.svg?v=${F.OF_VERSION}&amp;l=${req.locale || 'en'}" alt="" loading="lazy" decoding="async"></span>
    <span class="fg-card-t">${kindName(t, K.id)}</span>
    <span class="fg-card-g">${K.grades.map(g => t(`figures.grades.${g}`)).join(' · ')}</span>
    <span class="fg-card-d">${t(`figures.kinds.${K.id}.desc`)}</span></a>`;
  const sections = F.SUBJECTS.map(s => {
    const list = F.KINDS.filter(K => K.subject === s);
    return html`<section class="fg-sec" data-subject="${s}" aria-labelledby="fg-h-${s}"><h2 id="fg-h-${s}">${subjName(t, s)} <span class="fg-count" data-count>${t('figures.menu.count', { count: list.length })}</span></h2>
      <div class="fg-grid">${list.map(card)}</div></section>`;
  });
  const tab = (s, label, soon = false) => (soon
    ? html`<span class="chip fg-soon" aria-disabled="true">${label} <span class="fg-soontag">${t('figures.menu.soon')}</span></span>`
    : html`<button class="chip${s === 'all' ? ' on' : ''}" type="button" data-tab="${s}" aria-pressed="${s === 'all' ? 'true' : 'false'}">${label}</button>`);
  const mine = sheets.length
    ? html`<ul class="fg-mine">${sheets.slice(0, 6).map(w => html`<li><span class="fg-qs">${t('figures.menu.questions', { count: w.n })}</span><span><a href="/figures/worksheets/${w.id}">${w.title}</a>
        <small>${[w.grade ? t('figures.menu.gradeOf', { grade: w.grade }) : '', t('figures.menu.edited', { date: dateOf(req, w.updated_at) })].filter(Boolean).join(' · ')}</small></span></li>`)}</ul>`
    : html`<p class="muted">${t('figures.menu.noSheets')}</p>`;
  page(req, res, {
    title: t('figures.title'), active: null, head: CSS, scripts: ['/js/figures.js'], bodyClass: 'fg-page',
    body: html`${teachingTools(req, 'figures')}
      <header class="fg-hero"><span class="fg-logo" aria-hidden="true"><svg viewBox="0 0 40 40" width="40" height="40"><path d="M8 32 L32 8 L32 32 Z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><path d="M25 32 v-7 h7" fill="none" stroke="currentColor" stroke-width="3"/></svg></span>
        <h1>${t('figures.title')}</h1><span class="fg-testing">${t('figures.menu.testing')}</span></header>
      <p class="fg-lead">${t('figures.menu.pitch')}</p>
      <div class="fg-top">
        <section class="fg-build"><h2>${t('figures.menu.buildTitle')}</h2><p>${t('figures.menu.buildText')}</p>
          <div class="row"><a class="btn btn-hot" href="/figures/worksheets/new?ai=1">✨ ${t('figures.menu.draftAi')}</a><a class="btn fg-ghost" href="/figures/worksheets/new">${t('figures.menu.scratch')}</a></div></section>
        <section class="panel fg-minebox"><h2>${t('figures.menu.mine')}</h2>${mine}</section>
      </div>
      <div class="fg-filters">
        <div class="chips fg-tabs" role="group" aria-label="${t('figures.menu.subjects')}">${tab('all', t('figures.menu.all'))}${F.SUBJECTS.map(s => tab(s, subjName(t, s)))}${SOON.map(s => tab(s, subjName(t, s), true))}</div>
        <div class="fg-row2"><div class="chips fg-grades" role="group" aria-label="${t('figures.menu.grades')}"><span class="fg-glabel">${t('figures.menu.grades')}</span>${F.GRADE_BANDS.map(g => html`<button class="chip" type="button" data-grade="${g}" aria-pressed="false">${t(`figures.grades.${g}`)}</button>`)}</div>
          <label class="fg-search"><span class="sr-only">${t('figures.menu.search')}</span><input class="input" type="search" id="fg-q" placeholder="${t('figures.menu.searchHint')}" autocomplete="off"></label></div>
      </div>
      ${sections}
      <p class="muted fg-none" id="fg-none" hidden>${t('figures.menu.nothing')}</p>`,
  });
});

router.get('/figures/thumb/:file', (req, res, next) => {
  const m = /^([A-Za-z]+)\.svg$/.exec(req.params.file || '');
  const lang = /^[a-zA-Z-]{2,8}$/.test(String(req.query.l || '')) ? String(req.query.l) : 'en';
  const svg = m && F.thumbnail(m[1], lang);
  if (!svg) return next();
  res.set({ 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'private, max-age=86400' }).send(svg);
});

// ---------------------------------------------------------------- the worksheet builder and its print page
function builder(req, res, w) {
  const t = req.t, u = req.user;
  const kinds = F.KINDS.map(K => ({ id: K.id, name: kindName(t, K.id), subject: K.subject, gen: K.gens.length > 0 }));
  page(req, res, {
    title: w ? w.title : t('figures.sheet.newTitle'), active: null, head: CSS, scripts: ['/js/figures-sheet.js'], bodyClass: 'fg-page',
    body: html`${teachingTools(req, 'figures')}
      ${crumbs(t, [['/figures', t('figures.title')], [null, t('figures.sheet.crumb')]])}
      ${jsonData('fg-sheet', { id: w ? w.id : null, ai: F.aiPref(u), startAi: req.query.ai === '1', kinds, subjects: Object.fromEntries(F.SUBJECTS.map(s => [s, subjName(t, s)])), untitled: t('figures.sheet.untitled') })}
      <div id="fg-sheet-app" class="fg-sheet"><p class="muted">${t('figures.loading')}</p></div>`,
  });
}
router.get('/figures/worksheets/new', (req, res) => builder(req, res, null));
router.get('/figures/worksheets/:id', (req, res, next) => { const w = F.ownWorksheet(req.user, req.params.id); return w ? builder(req, res, w) : next(); });
router.get('/figures/worksheets/:id/print', (req, res, next) => {
  const w = F.ownWorksheet(req.user, req.params.id); if (!w) return next();
  const t = req.t, key = req.query.key === '1', info = localeInfo(req.locale);
  const frag = F.printHtml(w, F.itemsOf(w.id), { t, lang: req.locale || 'en', dir: info.dir, key });
  page(req, res, {
    title: key ? t('figures.print.keyTitle', { title: w.title }) : w.title, active: null, head: CSS, scripts: ['/js/figures-print.js'], bodyClass: 'fg-page fg-printpage',
    body: html`<div class="fg-printbar noprint">${crumbs(t, [['/figures', t('figures.title')], [`/figures/worksheets/${w.id}`, w.title], [null, t('figures.print.crumb')]])}
      <div class="row"><a class="chip${key ? '' : ' on'}" href="?key=0">${t('figures.print.sheetOnly')}</a><a class="chip${key ? ' on' : ''}" href="?key=1">${t('figures.print.withKey')}</a>
      <button class="btn btn-primary" type="button" data-print>🖨️ ${t('figures.print.print')}</button></div></div>${raw(frag)}`,
  });
});

// ---------------------------------------------------------------- the editor (one page for every kind)
router.get('/figures/:kind', (req, res, next) => {
  const K = F.kindOf(req.params.kind); if (!K) return next();
  const t = req.t, u = req.user;
  let start = null;
  const w = req.query.ws ? F.ownWorksheet(u, req.query.ws) : null;
  const it = w ? F.itemsOf(w.id).find(x => x.id === req.query.item && x.kind === K.id) : null;
  if (it) start = { data: it.data, hide: it.hide, question: it.question, answerKey: it.answerKey, gen: it.gen, seed: it.seed, ws: w.id, item: it.id, wsTitle: w.title };
  else if (req.query.d) { const d = decodeData(req.query.d); const c = d ? F.cleanData(d) : null; if (c && c.data) start = { data: c.data }; }
  const presets = K.presets.map((d, i) => ({ name: t('figures.editor.example', { n: i + 1 }), data: d }));
  page(req, res, {
    title: kindName(t, K.id), active: null, bodyClass: 'fg-page', scripts: ['/js/figures-editor.js'],
    head: raw(`${CSS}\n${figTag('oomba-figures', F.OF_VERSION, { kinds: [K.id] })}`),
    body: html`${teachingTools(req, 'figures')}
      ${crumbs(t, [['/figures', t('figures.title')], [`/figures#${K.subject}`, subjName(t, K.subject)], [null, kindName(t, K.id)]])}
      ${jsonData('fg-editor', { kind: K, name: kindName(t, K.id), presets, mine: F.listPresets(u, K.id), sheets: F.listWorksheets(u).map(x => ({ id: x.id, title: x.title, n: x.n })), start, version: F.OF_VERSION, untitled: t('figures.sheet.untitled') })}
      <div id="fg-editor-app" class="fg-editor" data-kind="${K.id}"><h1>${kindName(t, K.id)}</h1><p class="muted">${t('figures.loading')}</p></div>`,
  });
});

// ---------------------------------------------------------------- APIs
const view = (req, id) => {
  const w = F.worksheetView(req.user, id, { lang: req.locale || 'en' }); if (!w) return null;
  const row = F.ownWorksheet(req.user, id), items = F.itemsOf(id), info = localeInfo(req.locale);
  const opts = { t: req.t, lang: req.locale || 'en', dir: info.dir };
  return { ...w, preview: { sheet: F.printHtml(row, items, opts), key: F.printHtml(row, items, { ...opts, sheet: false, key: true }) } };
};
const sendSheet = (req, res, r) => (r.ok ? res.json({ ok: true, worksheet: view(req, r.id) }) : fail(req, res, r));
router.get('/api/figures/state', (req, res) => res.json({ role: req.figRole, worksheets: F.listWorksheets(req.user), ai: F.aiPref(req.user) }));
router.post('/api/figures/gen', rateLimit('figures-gen', 900, 3600e3), (req, res) => {
  const b = body(req), K = F.kindOf(b.kind);
  const gid = typeof b.gen === 'string' && F.genOf(b.gen) ? b.gen : K && K.gens.length ? K.gens[Math.floor(Math.random() * K.gens.length)].id : null;
  if (!gid) return fail(req, res, { code: 'noGen' });
  const seed = Number.isInteger(b.seed) && b.seed > 0 && b.seed < 1e9 ? b.seed : F.newSeed();
  const g = F.generate(gid, seed);
  return g ? res.json({ ok: true, gen: gid, seed, ...g }) : fail(req, res, { code: 'noGen' });
});
router.get('/api/figures/presets/:kind', (req, res) => res.json({ ok: true, presets: F.listPresets(req.user, req.params.kind) }));
router.post('/api/figures/presets', rateLimit('figures-preset', 120, 3600e3), (req, res) => { const r = F.savePreset(req.user, body(req)); return r.ok ? res.json(r) : fail(req, res, r); });
router.post('/api/figures/presets/:id/delete', (req, res) => { const r = F.deletePreset(req.user, req.params.id); return r.ok ? res.json(r) : fail(req, res, r); });
router.post('/api/figures/prefs', (req, res) => { const r = F.setAiPref(req.user, !!body(req).ai); return r.ok ? res.json(r) : fail(req, res, r); });

router.post('/api/figures/worksheets', rateLimit('figures-save', 300, 3600e3), (req, res) => { const b = body(req); sendSheet(req, res, F.createWorksheet(req.user, { title: b.title, grade: b.grade, items: b.items })); });
router.get('/api/figures/worksheets/:id', (req, res) => { const w = view(req, req.params.id); return w ? res.json({ ok: true, worksheet: w }) : fail(req, res, { code: 'notFound' }); });
router.post('/api/figures/worksheets/:id', rateLimit('figures-save', 300, 3600e3), (req, res) => sendSheet(req, res, F.updateWorksheet(req.user, req.params.id, body(req))));
router.post('/api/figures/worksheets/:id/delete', (req, res) => { const r = F.deleteWorksheet(req.user, req.params.id); return r.ok ? res.json(r) : fail(req, res, r); });
router.post('/api/figures/worksheets/:id/items', rateLimit('figures-save', 300, 3600e3), (req, res) => {
  const b = body(req), raw0 = b.item && typeof b.item === 'object' ? b.item : F.starterItem(b.kind);
  if (!raw0) return fail(req, res, { code: 'badKind' });
  sendSheet(req, res, F.addItem(req.user, req.params.id, raw0));
});
router.post('/api/figures/worksheets/:id/items/:item', rateLimit('figures-save', 300, 3600e3), (req, res) => sendSheet(req, res, F.updateItem(req.user, req.params.id, req.params.item, body(req))));
router.post('/api/figures/worksheets/:id/items/:item/delete', (req, res) => sendSheet(req, res, F.deleteItem(req.user, req.params.id, req.params.item)));
router.post('/api/figures/worksheets/:id/items/:item/move', (req, res) => sendSheet(req, res, F.moveItem(req.user, req.params.id, req.params.item, body(req).dir === 'up' ? 'up' : 'down')));
router.post('/api/figures/worksheets/:id/items/:item/regen', rateLimit('figures-gen', 900, 3600e3), (req, res) => sendSheet(req, res, F.regenItem(req.user, req.params.id, req.params.item)));
router.post('/api/figures/worksheets/:id/draft', rateLimit('figures-ai', 30, 3600e3), async (req, res) => {
  const { brief, grade, count } = body(req);
  const r = await F.draftWorksheet(req.user, req.params.id, { brief, grade, count });
  return r.ok ? res.json({ ...r, worksheet: view(req, req.params.id) }) : fail(req, res, r);
});

