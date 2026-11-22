// Figures, the standalone product (services/figures.js; docs/decisions.md "Figures, the standalone product" and "Figures
// opens to all teachers"). Every address here answers only someone services/figures.js roleOf lets in (the platform
// admin and every school staff member); signed out, a page goes to the sign-in page and an API answers 401 (as the /teach
// pages do); everyone else signed in falls through to the site's normal 404. FIGURES=0 is the normal 404 for everyone.
// The "Teaching tools" menu entry (views/layout.js) links here; never in the sitemap or search, and never indexed
// (X-Robots-Tag and the layout's noindex).
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
//   POST /api/figures/prefs                        whether Oomba's chat opens by itself on a new worksheet ({ ai })
//   POST /api/figures/worksheets                   a new worksheet ({ title, grade, items })
//   GET  /api/figures/worksheets/:id               a worksheet with its figures and its print preview
//   POST /api/figures/worksheets/:id               title and grade;  POST .../delete
//   POST /api/figures/worksheets/:id/items         add a question ({ item } or { kind } for a starter)
//   POST /api/figures/worksheets/:id/items/:item   change a question; .../delete, .../move ({ dir }), .../regen
//   POST /api/figures/start                        "Describe what you need" on the menu ({ text, purpose, grade }): a new
//                                                  worksheet or test with Oomba's first turn running (services/figures-chat.js)
//   GET  /api/figures/worksheets/:id/chat          Oomba's chat on this worksheet (turns, the turn running and its progress)
//   POST /api/figures/worksheets/:id/chat          a message to Oomba ({ text, quote?, retry? }): checked, stored, answered
//                                                  in the background (one at a time per teacher); -> the chat
//   POST /api/figures/worksheets/:id/chat/undo     undo the change a turn made ({ turnId }); -> the chat and the worksheet
//   POST /api/figures/worksheets/:id/chat/starter  "Add a starter set instead" after a first draft Oomba couldn't make
//   POST /api/figures/worksheets/:id/chat/dismiss  the menu's "finished while you were away" notice, dismissed
//   POST /api/figures/worksheets/:id/draft         the old one-shot draft ({ brief, grade, count }), kept for one release
//   POST /api/figures/worksheets/:id/draft-test    the old one-shot test draft ({ topic, grade, subject, count }), kept for one release
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
import * as FC from '../services/figures-chat.js';
import { canHost as manipHost } from '../services/manipulatives.js';
import { trialUsed } from '../services/teacher-plan.js';
import { requireUser } from '../auth.js';
import { config } from '../config.js';
import { ico } from '../views/icon.js';
import { decodeData, SOON } from '../../public/js/figures-catalog.js';

export const router = Router();
const STATUS = { notFound: 404, tooMany: 409, fullSheet: 409, tooBig: 413 };
/** Assign's own refusals (figures.assign.errors.*): which question has no answer, a class that isn't theirs, dates. */
const ASSIGN_ERRORS = ['empty', 'noAnswer', 'noClass', 'badDate', 'dueBeforeOpen', 'needsDue', 'started'];
const fail = (req, res, r) => res.status(STATUS[r.code] || 400).json({ error: req.t(`figures.errors.${r.code}`), code: r.code, ...(r.problems ? { problems: r.problems } : {}) });
const body = req => (req.body && typeof req.body === 'object' ? req.body : {});

// The gate: signed out (Figures on), the sign-in page or a 401, like a /teach page; anyone else goes on to the next
// router, and so to the site's 404 (the page's, or the API's JSON one).
router.use(['/figures', '/api/figures'], (req, res, next) => {
  const role = F.roleOf(req.user);
  if (!role && !req.user && F.on()) { res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' }); return requireUser(req, res, next); }
  if (!role) return next('router');
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  // School staff without the Teacher plan (while paid plans are on): every page is the calm plan page, every API says so.
  if (role === 'plan') return planReply(req, res, 'figures');
  req.figRole = role;
  next();
});

/** A teaching tool for school staff without the Teacher plan (services/teacher-tools.js 'plan'): a page that says it is
 *  part of the Teacher plan, with the free trial (/trial) and the plans (/plans); no price here (prices are on /plans
 *  only). An API answers 403 with the same words. Only school staff ever get here: never a student, kid or grown-up. */
export function planReply(req, res, tool) {
  const t = req.t;
  if (req.originalUrl.startsWith('/api/')) return res.status(403).json({ error: t('figures.plan.api'), code: 'teacherPlan' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return next404(req, res);
  // A teacher whose free trial is used gets the plan itself (/trial sends them to Checkout), not a trial offer.
  let used = false; try { used = !!(req.user && trialUsed({ userId: req.user.id })); } catch { used = false; }
  return page(req, res, {
    title: t(tool === 'manip' ? 'figures.plan.titleManip' : 'figures.plan.titleFigures'), active: 'tools', head: CSS, bodyClass: 'fg-page',
    body: html`<section class="panel fg-plan" aria-labelledby="fg-plan-h">
      <h1 id="fg-plan-h">${ico(tool === 'manip' ? '🧮' : '📐', { size: 32 })} ${t(tool === 'manip' ? 'figures.plan.headingManip' : 'figures.plan.headingFigures')}</h1>
      <p class="lead">${t(tool === 'manip' ? 'figures.plan.leadManip' : 'figures.plan.leadFigures')}</p>
      <p>${used ? t('figures.plan.trialUsed') : t('figures.plan.trial', { days: config.teacherTrialDays })}</p>
      <p class="muted">${t('figures.plan.kept')}</p>
      <div class="row"><a class="btn btn-primary" href="/trial">${t(used ? 'figures.plan.get' : 'figures.plan.start')}</a><a class="btn" href="/plans">${t('figures.plan.plans')}</a></div>
    </section>`,
  });
}
const next404 = (req, res) => res.status(404).json({ error: req.t('errors.api.notFound') });

const CSS = raw(`<link rel="stylesheet" href="/css/figures.css?v=${VERSION}">`);
const CHAT_CSS = raw(`<link rel="stylesheet" href="/css/figures.css?v=${VERSION}"><link rel="stylesheet" href="/css/oomba-chat.css?v=${VERSION}">`);
const kindName = (t, id) => t(`figures.kinds.${id}.name`);
const subjName = (t, s) => t(`figures.subjects.${s}`);
/** "Teaching tools: Manipulatives · Figures", only for someone who can open both (Manipulatives keeps its tester list). */
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
  // "Finished while you were away": Oomba's answers on a worksheet the teacher hasn't opened since.
  const readyNotes = FC.ready(u).map(r => html`<div class="fgd-away${r.status === 'failed' ? ' bad' : ''}" role="status" data-ready="${r.id}"><span aria-hidden="true">${ico(r.status === 'failed' ? '💬' : '✨', { size: 20 })}</span><div>
      <p><b>${t(r.status === 'failed' ? 'figures.menu.readyFailed' : 'figures.menu.readyTitle', { title: r.title })}</b> ${r.status === 'failed' ? '' : t('figures.menu.readyText', { count: r.n })}</p>
      <div class="row"><a class="btn btn-primary btn-sm" href="/figures/worksheets/${r.id}">${t('figures.menu.readyOpen')}</a><button class="btn btn-sm" type="button" data-dismiss="${r.id}">${t('figures.menu.readyDismiss')}</button></div></div></div>`);
  page(req, res, {
    title: t('figures.title'), active: 'tools', head: CSS, scripts: ['/js/figures.js'], bodyClass: 'fg-page',
    body: html`${teachingTools(req, 'figures')}
      <header class="fg-hero"><span class="fg-logo" aria-hidden="true"><svg viewBox="0 0 40 40" width="40" height="40"><path d="M8 32 L32 8 L32 32 Z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><path d="M25 32 v-7 h7" fill="none" stroke="currentColor" stroke-width="3"/></svg></span>
        <h1>${t('figures.title')}</h1></header>
      <p class="fg-lead">${t('figures.menu.pitch')}</p>
      <div class="fg-top">
        <section class="fg-build" aria-labelledby="fgd-h"><h2 id="fgd-h">${t('figures.menu.describeTitle')}</h2><p>${t('figures.menu.describeText')}</p>
          <form id="fgd-form" class="fgd-form" novalidate>
            <label class="sr-only" for="fgd-in">${t('figures.menu.describeLabel')}</label>
            <textarea class="fgd-in" id="fgd-in" name="text" rows="3" maxlength="1000" dir="auto" placeholder="${t('figures.menu.describeHint')}"></textarea>
            <div class="fgd-row"><div class="fgd-seg" role="radiogroup" aria-label="${t('figures.menu.makeA')}">
                <label><input type="radio" name="purpose" value="worksheet" checked><span>${t('figures.menu.worksheet')}</span></label>
                <label><input type="radio" name="purpose" value="test"><span>${t('figures.menu.test')}</span></label></div>
              <label class="fgd-grade"><span>${t('figures.menu.grade')}</span><select class="input input-sm" name="grade" id="fgd-grade"><option value="">${t('figures.menu.anyGrade')}</option>${['K', ...Array.from({ length: 12 }, (_, i) => String(i + 1))].map(g => html`<option value="${g}">${t('figures.menu.gradeN', { grade: g })}</option>`)}</select></label>
              <button class="btn btn-hot fgd-go" type="submit" id="fgd-go">${ico('✨', { size: 18 })} ${t('figures.menu.draftIt')}</button></div>
            <p class="fgd-err" id="fgd-err" role="alert" hidden></p>
            <p class="fgd-priv">${ico('🔒', { size: 16 })} ${t('figures.menu.privacy')}</p>
          </form>
          <p class="fgd-scratch"><a href="/figures/worksheets/new">${t('figures.menu.scratch')}</a> · <a href="/figures/tests/new">${t('figures.menu.blankTest')}</a></p></section>
        <section class="panel fg-minebox"><h2>${t('figures.menu.mine')}</h2>${readyNotes}${mine}</section>
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
    title: t('figures.terms.title'), active: 'tools', head: CSS, bodyClass: 'fg-page',
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
    title: w ? w.title : t(test ? 'figures.sheet.newTest' : 'figures.sheet.newTitle'), active: 'tools', head: CHAT_CSS, scripts: ['/js/figures-sheet.js'], i18n: ['js.oomba-chat'], bodyClass: 'fg-page',
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
    title: key ? t('figures.print.keyTitle', { title: w.title }) : w.title, active: 'tools', head: CSS, scripts: ['/js/figures-print.js'], bodyClass: 'fg-page fg-printpage',
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
    title: kindName(t, K.id), active: 'tools', bodyClass: 'fg-page', scripts: ['/js/figures-editor.js'],
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
  // The words: the language of the worksheet the editor was opened from (ws), else the page's.
  const ws = typeof b.ws === 'string' ? F.ownWorksheet(req.user, b.ws) : null, lang = ws ? ws.lang : F.genLang(req.locale);
  // A saved question's figure ({ gen, seed, data }, the editor opened from a worksheet): what its generator dealt for it,
  // an earlier definition (PAST_GENS) included, the same lookup the server uses when it saves (F.dealtFor).
  const saved = b.gen === gid && b.data && typeof b.data === 'object' && !Array.isArray(b.data) ? b.data : undefined;
  const g = saved ? F.dealtFor(gid, seed, saved, undefined, lang) : F.generate(gid, seed, undefined, null, lang);
  return g ? res.json({ ok: true, gen: gid, seed, ...g }) : fail(req, res, { code: 'noGen' });
});
router.get('/api/figures/presets/:kind', (req, res) => res.json({ ok: true, presets: F.listPresets(req.user, req.params.kind) }));
router.post('/api/figures/presets', rateLimit('figures-preset', 120, 3600e3), (req, res) => { const r = F.savePreset(req.user, body(req)); return r.ok ? res.json(r) : fail(req, res, r); });
router.post('/api/figures/presets/:id/delete', (req, res) => { const r = F.deletePreset(req.user, req.params.id); return r.ok ? res.json(r) : fail(req, res, r); });
router.post('/api/figures/prefs', (req, res) => { const r = F.setAiPref(req.user, !!body(req).ai); return r.ok ? res.json(r) : fail(req, res, r); });

// The browser makes a worksheet or a test; a lesson set is made only from its lesson's step form (routes/lessons.js).
router.post('/api/figures/worksheets', rateLimit('figures-save', 300, 3600e3), (req, res) => { const b = body(req); sendSheet(req, res, F.createWorksheet(req.user, { title: b.title, grade: b.grade, items: b.items, purpose: b.purpose === 'test' ? 'test' : 'worksheet', lang: F.genLang(req.locale) })); });
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
// ---------------------------------------------------------------- Oomba's chat (services/figures-chat.js, oomba-chat.js)
const CHAT_STATUS = { notFound: 404, chatBusy: 409, otherBusy: 409, notEmpty: 409 };
const CHAT_CODES = ['names', 'words', 'personal', 'brief', 'chatBusy', 'otherBusy', 'notFound', 'notEmpty', 'tooMany'];
const chatFail = (req, res, r) => res.status(CHAT_STATUS[r.code] || 400).json({ error: req.t(`js.oomba-chat.err.${CHAT_CODES.includes(r.code) ? r.code : 'other'}`), code: r.code, ...(r.key ? { key: r.key } : {}) });
router.post('/api/figures/start', rateLimit('figures-ai', 30, 3600e3), (req, res) => {
  const b = body(req);
  const r = FC.start(req.user, { text: b.text, purpose: b.purpose === 'test' ? 'test' : 'worksheet', grade: b.grade, lang: F.genLang(req.locale) });
  return r.ok ? res.json({ ok: true, id: r.id, redirect: `/figures/worksheets/${r.id}` }) : chatFail(req, res, r);
});
router.get('/api/figures/worksheets/:id/chat', (req, res) => { const r = FC.current(req.user, req.params.id); return r.ok ? res.json(r) : chatFail(req, res, r); });
router.post('/api/figures/worksheets/:id/chat', rateLimit('figures-ai', 30, 3600e3), (req, res) => {
  const b = body(req);
  const r = FC.send(req.user, req.params.id, { text: b.text, quote: typeof b.quote === 'string' ? b.quote : null, retry: typeof b.retry === 'string' ? b.retry : null });
  return r.ok ? res.json({ ok: true, chat: r.chat }) : chatFail(req, res, r);
});
router.post('/api/figures/worksheets/:id/chat/undo', rateLimit('figures-save', 300, 3600e3), (req, res) => {
  const r = FC.undo(req.user, req.params.id, body(req).turnId);
  return r.ok ? res.json({ ok: true, chat: r.chat, kept: r.kept, worksheet: view(req, req.params.id) }) : chatFail(req, res, r);
});
router.post('/api/figures/worksheets/:id/chat/starter', rateLimit('figures-save', 300, 3600e3), (req, res) => {
  const r = FC.starter(req.user, req.params.id, body(req).turnId);
  return r.ok ? res.json({ ok: true, chat: r.chat, worksheet: view(req, req.params.id) }) : chatFail(req, res, r);
});
router.post('/api/figures/worksheets/:id/chat/dismiss', (req, res) => { const r = FC.dismiss(req.user, req.params.id); return r.ok ? res.json(r) : chatFail(req, res, r); });
// The old one-shot drafts (before Oomba's chat), kept for one release for pages still open; the page no longer calls them.
router.post('/api/figures/worksheets/:id/draft', rateLimit('figures-ai', 30, 3600e3), async (req, res) => {
  const { brief, grade, count } = body(req);
  const r = await F.draftWorksheet(req.user, req.params.id, { brief, grade, count });
  return r.ok ? res.json({ ...r, worksheet: view(req, req.params.id) }) : fail(req, res, r);
});

