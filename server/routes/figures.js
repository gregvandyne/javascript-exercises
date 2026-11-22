// Figures, the standalone product (services/figures.js; docs/decisions.md "Figures, the standalone product"). Hidden
// while it is tested: every address here answers only someone services/figures.js roleOf lets in (the platform admin and
// the school staff on the manipulatives' tester list); everyone else falls through to the site's normal 404. Never
// linked from any menu, the sitemap or search, and never indexed (X-Robots-Tag and the layout's noindex).
//   GET  /figures                                  the menu: every kind as a card, the teacher's worksheets
//   GET  /figures/thumb/<kind>.svg                 a card's picture (the kind's example, drawn on the server, cached)
//   GET  /figures/terms                            what teachers may do with the figures they export (plain words)
//   GET  /figures/:kind                            one kind's editor (?d= a figure's data, ?ws=&item= a worksheet question)
//   GET  /figures/worksheets/new, /figures/worksheets/:id   the worksheet builder (also a test's and a lesson step's)
//   GET  /figures/tests/new                        "Build a test": the same builder for a test (purpose 'test')
//   GET  /figures/worksheets/:id/print?key=0|1     the printable student sheet (and the answer key: its owner only)
//   GET  /api/figures/state                        the teacher's worksheets
//   POST /api/figures/gen                          a generator's question for a seed ({ gen, seed } or { kind }; with
//                                                  data, the definition that dealt that figure, PAST_GENS included)
//   GET  /api/figures/presets/:kind, POST /api/figures/presets, POST /api/figures/presets/:id/delete
//   POST /api/figures/prefs                        "Power with AI" on or off ({ ai })
//   POST /api/figures/worksheets                   a new worksheet ({ title, grade, items })
//   GET  /api/figures/worksheets/:id               a worksheet with its figures and its print preview
//   POST /api/figures/worksheets/:id               title and grade;  POST .../delete
//   POST /api/figures/worksheets/:id/items         add a question ({ item } or { kind } for a starter)
//   POST /api/figures/worksheets/:id/items/:item   change a question; .../delete, .../move ({ dir }), .../regen
//   POST /api/figures/worksheets/:id/draft         "Power with AI" ({ brief, grade, count })
//   POST /api/figures/worksheets/:id/draft-test    "Build a test with AI" ({ topic, grade, subject, count }): a test
//   POST /api/figures/worksheets/:id/items/:item/swap   "Swap figure" ({ kind })
//   POST /api/figures/worksheets/:id/save-to-lesson     a lesson set's questions become its lesson's Figure step
//   POST /api/figures/worksheets/:id/assign        Assign to class ({ classId, opensAt, dueAt, showAnswers }): a lesson with
//                                                  one figures step (services/figures-steps.js)
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { page, VERSION } from '../views/layout.js';
import { rateLimit } from '../services/ratelimit.js';
import { localeInfo } from '../i18n/index.js';
import { figTag } from '../services/figlibs.js';
import * as F from '../services/figures.js';
import * as FS from '../services/figures-steps.js';
import { canHost as manipHost } from '../services/manipulatives.js';
import { decodeData, SOON } from '../../public/js/figures-catalog.js';

export const router = Router();
const STATUS = { notFound: 404, tooMany: 409, fullSheet: 409, tooBig: 413 };
/** Assign's own refusals (figures.assign.errors.*): which question has no answer, a class that isn't theirs, dates. */
const ASSIGN_ERRORS = ['empty', 'noAnswer', 'noClass', 'badDate', 'dueBeforeOpen', 'needsDue', 'started'];
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
  const card = (K, s = K.subject) => html`<a class="fg-card" href="/figures/${K.id}" data-subject="${s}"${s !== K.subject ? html` data-also` : ''} data-grades="${K.grades.join(' ')}" data-search="${`${kindName(t, K.id)} ${t(`figures.kinds.${K.id}.desc`)} ${K.id}`.toLowerCase()}">
    <span class="fg-thumb"><img src="/figures/thumb/${K.id}.svg?v=${F.OF_VERSION}&amp;l=${req.locale || 'en'}" alt="" loading="lazy" decoding="async"></span>
    <span class="fg-card-t">${kindName(t, K.id)}</span>
    <span class="fg-card-g">${K.grades.map(g => t(`figures.grades.${g}`)).join(' · ')}</span>
    <span class="fg-card-d">${t(`figures.kinds.${K.id}.desc`)}</span></a>`;
  const sections = F.SUBJECTS.map(s => {
    const list = F.KINDS.filter(K => K.subject === s || (K.also || []).includes(s));
    return html`<section class="fg-sec" data-subject="${s}" aria-labelledby="fg-h-${s}"><h2 id="fg-h-${s}">${subjName(t, s)} <span class="fg-count" data-count>${t('figures.menu.count', { count: list.length })}</span></h2>
      <div class="fg-grid">${list.map(K => card(K, s))}</div></section>`;
  });
  const tab = (s, label, soon = false) => (soon
    ? html`<span class="chip fg-soon" aria-disabled="true">${label} <span class="fg-soontag">${t('figures.menu.soon')}</span></span>`
    : html`<button class="chip${s === 'all' ? ' on' : ''}" type="button" data-tab="${s}" aria-pressed="${s === 'all' ? 'true' : 'false'}">${label}</button>`);
  const mine = sheets.length
    ? html`<ul class="fg-mine">${sheets.slice(0, 6).map(w => html`<li><span class="fg-qs">${t('figures.menu.questions', { count: w.n })}</span><span><a href="/figures/worksheets/${w.id}">${w.title}</a>
        <small>${[w.purpose === 'test' ? t('figures.menu.isTest') : '', w.grade ? t('figures.menu.gradeOf', { grade: w.grade }) : '', t('figures.menu.edited', { date: dateOf(req, w.updated_at) })].filter(Boolean).join(' · ')}</small></span></li>`)}</ul>`
    : html`<p class="muted">${t('figures.menu.noSheets')}</p>`;
  page(req, res, {
    title: t('figures.title'), active: null, head: CSS, scripts: ['/js/figures.js'], bodyClass: 'fg-page',
    body: html`${teachingTools(req, 'figures')}
      <header class="fg-hero"><span class="fg-logo" aria-hidden="true"><svg viewBox="0 0 40 40" width="40" height="40"><path d="M8 32 L32 8 L32 32 Z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><path d="M25 32 v-7 h7" fill="none" stroke="currentColor" stroke-width="3"/></svg></span>
        <h1>${t('figures.title')}</h1><span class="fg-testing">${t('figures.menu.testing')}</span></header>
      <p class="fg-lead">${t('figures.menu.pitch')}</p>
      <div class="fg-top">
        <section class="fg-build"><h2>${t('figures.menu.buildTitle')}</h2><p>${t('figures.menu.buildText')}</p>
          <div class="row"><a class="btn btn-hot" href="/figures/worksheets/new?ai=1">✨ ${t('figures.menu.draftAi')}</a><a class="btn fg-ghost" href="/figures/worksheets/new">${t('figures.menu.scratch')}</a></div>
          <p class="fg-testline"><a class="btn fg-ghost" href="/figures/tests/new">📝 ${t('figures.menu.buildTest')}</a> <span>${t('figures.menu.buildTestText')}</span></p></section>
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

// ---------------------------------------------------------------- the reuse terms (plan rule 3, in plain teacher words)
// What a teacher may do with an exported figure, what the note in the file is (Oomba Figures' own words, OF.notice, the
// same text figures-export.js stamps into a PNG), and what CC0 1.0 means. Behind the same gate as every Figures page
// while the product is tested; it opens with it.
router.get('/figures/terms', (req, res) => {
  const t = req.t, notice = F.kitFor().notice, CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
  const li = keys => html`<ul class="fg-terms-list">${keys.map(k => html`<li>${t(`figures.terms.${k}`)}</li>`)}</ul>`;
  page(req, res, {
    title: t('figures.terms.title'), active: null, head: CSS, bodyClass: 'fg-page',
    body: html`${teachingTools(req, 'figures')}
      ${crumbs(t, [['/figures', t('figures.title')], [null, t('figures.terms.crumb')]])}
      <article class="fg-terms">
        <header class="fg-terms-hero"><h1>${t('figures.terms.title')}</h1><p class="fg-lead">${t('figures.terms.lead')}</p></header>
        <section class="panel fg-terms-can" aria-labelledby="fg-t-can"><h2 id="fg-t-can">✓ ${t('figures.terms.canTitle')}</h2>${li(['can1', 'can2', 'can3', 'can4', 'can5'])}</section>
        <section class="panel" aria-labelledby="fg-t-note"><h2 id="fg-t-note">${t('figures.terms.noticeTitle')}</h2><p>${t('figures.terms.noticeText')}</p>
          <blockquote class="fg-terms-notice" lang="en" dir="ltr" id="fg-notice">${notice}</blockquote><p>${t('figures.terms.noticeMeans')}</p></section>
        <section class="panel" aria-labelledby="fg-t-cc0"><h2 id="fg-t-cc0">${t('figures.terms.cc0Title')}</h2><p>${t('figures.terms.cc0Text')}</p>
          <p><a href="${CC0}" rel="noopener" target="_blank">${t('figures.terms.cc0Link')}</a></p></section>
        <section class="panel" aria-labelledby="fg-t-yours"><h2 id="fg-t-yours">${t('figures.terms.yoursTitle')}</h2><p>${t('figures.terms.yoursText')}</p></section>
        <section class="panel" aria-labelledby="fg-t-care"><h2 id="fg-t-care">${t('figures.terms.careTitle')}</h2>${li(['care1', 'care2'])}<p>${t('figures.terms.care3')} <a href="/terms">${t('figures.terms.siteTerms')}</a></p></section>
        <p><a class="btn btn-primary" href="/figures">${t('figures.terms.back')}</a></p>
      </article>`,
  });
});

// ---------------------------------------------------------------- the worksheet builder and its print page
function builder(req, res, w, { purpose = w ? w.purpose : 'worksheet' } = {}) {
  const t = req.t, u = req.user;
  const kinds = F.KINDS.map(K => ({ id: K.id, name: kindName(t, K.id), subject: K.subject, gen: K.gens.length > 0 }));
  // A lesson set goes back to its lesson (Save to lesson); a test and a worksheet assign to a class.
  const lesson = FS.lessonOfSet(u, w);
  const test = purpose === 'test';
  const crumb = lesson ? [[`/teach/lessons/${lesson.id}`, lesson.title], [null, t('figures.sheet.crumbLesson')]] : [['/figures', t('figures.title')], [null, t(test ? 'figures.sheet.crumbTest' : 'figures.sheet.crumb')]];
  page(req, res, {
    title: w ? w.title : t(test ? 'figures.sheet.newTest' : 'figures.sheet.newTitle'), active: null, head: CSS, scripts: ['/js/figures-sheet.js'], bodyClass: 'fg-page',
    body: html`${teachingTools(req, 'figures')}
      ${crumbs(t, crumb)}
      ${jsonData('fg-sheet', { id: w ? w.id : null, purpose, lesson, ai: F.aiPref(u), startAi: req.query.ai === '1', kinds, subjects: Object.fromEntries(F.SUBJECTS.map(s => [s, subjName(t, s)])), untitled: t(test ? 'figures.sheet.untitledTest' : 'figures.sheet.untitled'),
        classes: lesson ? [] : FS.classesFor(u).map(c => ({ id: c.id, name: c.name, school: c.school_name || '' })) })}
      <div id="fg-sheet-app" class="fg-sheet"><p class="muted">${t('figures.loading')}</p></div>`,
  });
}
router.get('/figures/worksheets/new', (req, res) => builder(req, res, null));
router.get('/figures/tests/new', (req, res) => builder(req, res, null, { purpose: 'test' }));
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
  if (it) start = { data: it.data, hide: it.hide, question: it.question, answerKey: it.answerKey, gen: it.gen, seed: it.seed, ws: w.id, item: it.id, wsTitle: w.title, answerType: it.answerType, choices: it.choices, correct: it.correct };
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
  // A saved question's figure ({ gen, seed, data }, the editor opened from a worksheet): what its generator dealt for it,
  // an earlier definition (PAST_GENS) included, the same lookup the server uses when it saves (F.dealtFor).
  const saved = b.gen === gid && b.data && typeof b.data === 'object' && !Array.isArray(b.data) ? b.data : undefined;
  const g = saved ? F.dealtFor(gid, seed, saved) : F.generate(gid, seed);
  return g ? res.json({ ok: true, gen: gid, seed, ...g }) : fail(req, res, { code: 'noGen' });
});
router.get('/api/figures/presets/:kind', (req, res) => res.json({ ok: true, presets: F.listPresets(req.user, req.params.kind) }));
router.post('/api/figures/presets', rateLimit('figures-preset', 120, 3600e3), (req, res) => { const r = F.savePreset(req.user, body(req)); return r.ok ? res.json(r) : fail(req, res, r); });
router.post('/api/figures/presets/:id/delete', (req, res) => { const r = F.deletePreset(req.user, req.params.id); return r.ok ? res.json(r) : fail(req, res, r); });
router.post('/api/figures/prefs', (req, res) => { const r = F.setAiPref(req.user, !!body(req).ai); return r.ok ? res.json(r) : fail(req, res, r); });

// The browser makes a worksheet or a test; a lesson set is made only from its lesson's step form (routes/lessons.js).
router.post('/api/figures/worksheets', rateLimit('figures-save', 300, 3600e3), (req, res) => { const b = body(req); sendSheet(req, res, F.createWorksheet(req.user, { title: b.title, grade: b.grade, items: b.items, purpose: b.purpose === 'test' ? 'test' : 'worksheet' })); });
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
router.post('/api/figures/worksheets/:id/items/:item/swap', rateLimit('figures-gen', 900, 3600e3), (req, res) => sendSheet(req, res, F.swapItem(req.user, req.params.id, req.params.item, body(req).kind)));
router.post('/api/figures/worksheets/:id/save-to-lesson', rateLimit('figures-assign', 60, 3600e3), (req, res) => {
  const r = FS.saveToLesson(req.user, req.params.id);
  if (!r.ok) {
    if (ASSIGN_ERRORS.includes(r.code)) return res.status(400).json({ error: req.t(`figures.assign.errors.${r.code}`, { list: (r.questions || []).join(', ') }), code: r.code, ...(r.questions ? { questions: r.questions } : {}) });
    return fail(req, res, { code: 'notFound' });
  }
  res.json({ ok: true, lessonId: r.lesson.id, stepId: r.step.id, redirect: `/teach/lessons/${r.lesson.id}?figures=saved#steps` });
});
router.post('/api/figures/worksheets/:id/draft-test', rateLimit('figures-ai', 30, 3600e3), async (req, res) => {
  const { topic, grade, subject, count } = body(req);
  const r = await F.draftTest(req.user, req.params.id, { topic, grade, subject, count });
  return r.ok ? res.json({ ...r, worksheet: view(req, req.params.id) }) : fail(req, res, r);
});
router.post('/api/figures/worksheets/:id/items/:item/regen', rateLimit('figures-gen', 900, 3600e3), (req, res) => sendSheet(req, res, F.regenItem(req.user, req.params.id, req.params.item)));
router.post('/api/figures/worksheets/:id/assign', rateLimit('figures-assign', 60, 3600e3), (req, res) => {
  const b = body(req);
  const r = FS.assignWorksheet(req.user, req.params.id, b.classId, { opensAt: b.opensAt || null, dueAt: b.dueAt || null, showAnswers: b.showAnswers === true || b.showAnswers === 'on' || b.showAnswers === '1' });
  if (!r.ok) {
    if (ASSIGN_ERRORS.includes(r.code)) return res.status(400).json({ error: req.t(`figures.assign.errors.${r.code}`, { list: (r.questions || []).join(', ') }), code: r.code, ...(r.questions ? { questions: r.questions } : {}) });
    return fail(req, res, r.code === 'notFound' ? r : { code: 'notFound' });
  }
  const cl = r.classLesson;
  res.json({ ok: true, lessonId: r.lesson.id, classLessonId: cl.id, classId: cl.class_id, view: `/class/${cl.class_id}/lessons/${cl.id}`, progress: `/class/${cl.class_id}/progress/${cl.id}` });
});
router.post('/api/figures/worksheets/:id/draft', rateLimit('figures-ai', 30, 3600e3), async (req, res) => {
  const { brief, grade, count } = body(req);
  const r = await F.draftWorksheet(req.user, req.params.id, { brief, grade, count });
  return r.ok ? res.json({ ...r, worksheet: view(req, req.params.id) }) : fail(req, res, r);
});

