// Story Library (services/library.js; docs/decisions.md "Story Library"). Open-licensed picture books, read one page at
// a time with Read to me, then 3 questions written by Oomba.
//   GET  /library                  the books: US grade chips (?grade=k|1|2|3|4-5; an old ?level=1-3 link redirects to
//                                  a grade), search, Read (and Assign for school staff); ?class= keeps a teacher's
//                                  class for Assign
//   GET  /library/:id              one book: cover, credits, words to know, Read / Continue, Assign
//   GET  /library/:id/read         the reader (?p= a page; ?cl=&step= an assignment, so the class sees the progress)
//   GET  /library/:id/assign       Assign to a class (a class, a due day; Google Classroom when the class is linked)
//   POST /api/library/:id/progress { page, aloud, cl?, step? }
//   POST /api/library/:id/answer   { i, c, cl?, step? } -> { right, page (to look at, when wrong), solved, done }
//   POST /api/library/assign       { bookId, classId, dueAt }
// An assigned book's results (who read it, Read to me or on their own, the score, where they stopped, the hardest
// question) are its page under the class's Progress: storyResults(), called by routes/progress.js.
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { avatar, emptyState, staffStudentName } from '../views/components.js';
import { requireUser } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as L from '../services/lessons.js';
import * as LIB from '../services/library.js';
import { dotWindow } from '../../public/js/library-text.js';
import { onLocales as ttsOnLocales } from '../services/tts.js';
import { classHeader } from './schools.js';
import { zoneNote, dueChip } from './lessons.js';
import { gcAssignField, gcAfterAssign } from './gclassroom.js';
import { studentHref } from './student-report.js';
import { wishBox, WISH_CSS } from './library-suggest.js';

export const router = Router();
const CSS = raw(`<link rel="stylesheet" href="/css/library.css?v=${VERSION}">`);
const SCHOOL_CSS = raw(`<link rel="stylesheet" href="/css/community.css?v=${VERSION}"><link rel="stylesheet" href="/css/schools.css?v=${VERSION}">`);
const b = req => req.body || {};
const GRADE_ICON = { k: '🌱', 1: '🌿', 2: '🪴', 3: '🌳', '4-5': '🌲' };
const gradeKey = g => `library.grades.g${String(g).replace('-', '')}`;
const gradeName = (t, g) => t(gradeKey(g));
const isStaff = u => !!u && !u.is_guest && S.isSchoolStaff(u);
const gradeChip = (t, g) => html`<span class="lb-lvl lb-g${String(g).replace('-', '')}"><span aria-hidden="true">${GRADE_ICON[g]}</span> ${gradeName(t, g)}</span>`;
/** For teachers, under the grade on the book page: that it is Oomba's estimate, and the measures it comes from. */
const gradeDetails = (t, bk) => { const m = bk.measures || {}; return html`<details class="lb-measures small muted"><summary>${t('library.gradeWhy')}</summary>
  <p>${t('library.gradeNote')}</p><p>${t('library.measures', { words: bk.words, perPage: m.perPage, perSentence: m.perSentence, syllables: m.syllablesPerWord, fk: m.fk, notSight: m.notSight })}</p></details>`; };
const listOf = (t, names) => names.join(', ');
const ext = (href, text) => html`<a href="${href}" rel="noopener noreferrer" target="_blank">${text}</a>`;

/** The credits under every page: author, illustrator, translator, the publisher and where the book comes from (Pratham
 *  Books, StoryWeaver; or the publisher, Bloom Library), the license (linked to its deed) and what Oomba changed (for a
 *  CC BY-SA book, that the adapted pages are shared under the same license; for a book with corrected typos, that too). full: the book page's longer version (with
 *  the link to the original book). */
export function credits(t, bk, { full = false } = {}) {
  const c = bk.credits;
  if (bk.source === 'classics') return classicCredits(t, bk);
  const parts = [
    c.text.length ? t('library.credits.text', { names: listOf(t, c.text) }) : '',
    c.illustration.length ? t('library.credits.illustration', { names: listOf(t, c.illustration) }) : '',
    c.translation.length ? t('library.credits.translation', { names: listOf(t, c.translation) }) : '',
    c.original ? t('library.credits.from', { name: c.original }) : '',
    c.publisher && c.publisher !== c.platform ? `${c.publisher}, ${c.platform}` : c.platform,
  ].filter(Boolean);
  const lic = c.licenseUrl ? ext(c.licenseUrl, c.licenseName) : c.licenseName;
  const changes = bk.source === 'bloom' ? (c.shareAlike ? t('library.credits.changesBloomSA', { license: c.licenseName }) : t('library.credits.changesBloom')) : t('library.credits.changes');
  // A book whose typos Oomba corrected (credits.corrections, the number of fixes) says so too: the CC BY change notice.
  // A history fact Oomba corrected (credits.factCorrections, owner's decision 20 Nov 2026) says so as well.
  const note = [c.corrections ? t('library.credits.corrected') : '', c.factCorrections ? t('library.credits.factCorrected') : '', changes].filter(Boolean).join(' ');
  // Who made the book stays in view; the rest (publisher, license, what Oomba changed, the original) folds away under
  // "Author & publisher notes" (owner, 20 Nov 2026). The visible line credits the creators, as CC BY asks.
  const makers = parts.slice(0, parts.length - 1).filter(Boolean);
  return html`<div class="lb-credit small muted" dir="auto">
    <p class="lb-credit-by">${makers.length ? makers.join(' · ') : parts[parts.length - 1]}</p>
    <details class="lb-credit-more"><summary>${t('library.credits.notes')}</summary>
      <p><span>${(makers.length ? parts.slice(makers.length) : parts).join(' · ')} · ${lic}</span></p>
      <p class="lb-credit-note">${note}${full && c.sourceUrl ? html` ${ext(c.sourceUrl, bk.source === 'bloom' ? t('library.credits.originalBloom') : t('library.credits.original'))}` : ''}</p></details></div>`;
}
/** A Classics book's credits (docs/decisions.md "Story Library: a Classics shelf"): the author and illustrator with the
 *  year the book first came out, in view; folded under the notes: "Public domain", the first edition, and what Oomba
 *  changed (split into pages, resized pictures, any corrections). The digitized copy it was read from is named only in
 *  docs/story-library-classics.md, never on the site. */
function classicCredits(t, bk) {
  const c = bk.credits;
  const by = [
    c.text.length ? t('library.credits.text', { names: listOf(t, c.text) }) : '',
    c.illustration.length ? `${t('library.credits.illustration', { names: listOf(t, c.illustration) })} (${c.published})` : '',
    c.translation.length ? t('library.credits.translation', { names: listOf(t, c.translation) }) : '',
  ].filter(Boolean);
  const note = [t(c.cuts ? 'library.credits.changesClassicCut' : 'library.credits.changesClassic'), c.corrections ? t('library.credits.corrected') : ''].filter(Boolean).join(' ');
  return html`<div class="lb-credit small muted" dir="auto">
    <p class="lb-credit-by">${by.join(' · ')}</p>
    <details class="lb-credit-more"><summary>${t('library.credits.notes')}</summary>
      <p><span>${t('library.credits.publicDomain')} · ${t('library.credits.firstPublished', { year: String(c.published), edition: c.edition })}</span></p>
      <p class="lb-credit-note">${note}</p></details></div>`;
}
const meta = (t, bk) => t('library.meta', { pages: bk.pages.length, questions: bk.questions.length });
/** Where a book comes from, on its card and its page: "StoryWeaver", "Bloom Library" or "Classics" (translated: it is
 *  a shelf, not a publisher). */
const sourceName = (t, bk) => (bk.source === 'classics' ? html`<span class="lb-src">${t('library.sources.classics')}</span>` : html`<span class="lb-src" dir="ltr">${bk.credits.platform}</span>`);

/** The staff's class for Assign (?class=): one they may assign to. */
function classParam(req) {
  const id = String(req.query.class || '');
  if (!id || !isStaff(req.user)) return null;
  return LIB.assignClasses(req.user).find(c => c.id === id) || null;
}
const assignHref = (bk, c) => `/library/${bk.id}/assign${c ? `?class=${c.id}` : ''}`;

/** One book's card in the library grid (and in the suggestion box's "Books for you", routes/library-suggest.js): the
 *  cover, grade, title, pages, this reader's progress (read: their story_reads row), Read, and Assign for staff. */
export function bookCard(t, bk, { read = null, staff = false, forClass = null } = {}) {
  const status = () => {
    const s = LIB.stateOf(read, bk);
    if (s.state === 'done') return html`<span class="lb-state is-done">${ico('✅', { size: 18 })} ${t('library.state.done', { right: s.right, total: s.total })}</span>`;
    if (s.state === 'quiz') return html`<span class="lb-state">${ico('📝', { size: 18 })} ${t('library.state.quiz')}</span>`;
    if (s.state === 'reading') return html`<span class="lb-state">${ico('📖', { size: 18 })} ${t('library.state.reading', { page: s.page, pages: s.pages })}</span>`;
    return '';
  };
  return html`<li class="lb-card" data-grade="${bk.grade}">
    <a class="lb-cover" href="/library/${bk.id}" tabindex="-1" aria-hidden="true"><img src="${bk.cover.src}" alt="" width="${bk.cover.w || 440}" height="${bk.cover.h || 330}" loading="lazy" decoding="async"></a>
    <div class="lb-body">${gradeChip(t, bk.grade)}
      <h2 class="lb-title"><a href="/library/${bk.id}" dir="auto">${bk.title}</a></h2>
      <p class="lb-meta small muted">${meta(t, bk)} · ${sourceName(t, bk)}</p>${status()}
      <div class="lb-acts"><a class="btn btn-primary btn-sm" href="/library/${bk.id}/read">${ico('📖', { size: 18 })} ${t('library.read')}</a>${staff ? html`<a class="btn btn-sm" href="${assignHref(bk, forClass)}">${ico('📌', { size: 18 })} ${t('library.assign')}</a>` : ''}</div></div></li>`;
}

// ---------------------------------------------------------------- the library
router.get('/library', (req, res) => {
  const t = req.t, u = req.user;
  const grade = LIB.gradeParam(req.query.grade, req.query.level);
  // An old ?level=N link (before US grades) goes to the grade most of that level's books now have.
  if (req.query.level && !req.query.grade) {
    const p = new URLSearchParams(Object.entries({ grade: grade || '', q: String(req.query.q || ''), class: String(req.query.class || '') }).filter(([, v]) => v)).toString();
    return res.redirect(301, `/library${p ? `?${p}` : ''}`);
  }
  const words = String(req.query.q || '').slice(0, 60).trim();
  const list = LIB.search({ grade, q: words });
  const staff = isStaff(u), forClass = classParam(req);
  const reads = u ? new Map(LIB.myReads(u.id, 500).map(x => [x.book.id, x.read])) : new Map();
  const qs = over => { const p = new URLSearchParams(Object.entries({ grade: grade || '', q: words, class: forClass ? forClass.id : '', ...over }).filter(([, v]) => v)).toString(); return `/library${p ? `?${p}` : ''}`; };
  const chip = (on, href, label) => html`<a class="chip${on ? ' on' : ''}" href="${href}"${on ? raw(' aria-current="true"') : ''}>${label}</a>`;
  const card = bk => bookCard(t, bk, { read: reads.get(bk.id), staff, forClass });
  const body = html`<div class="slib">
    <div class="pagehead lb-head"><div><h1><span aria-hidden="true">📚</span> ${t('library.title')}</h1><p class="muted">${t('library.lead', { count: LIB.books().length })}</p></div></div>
    ${forClass ? html`<p class="notice lb-forclass">${ico('📌', { size: 18 })} ${t('library.forClass', { class: forClass.name })} <a href="/class/${forClass.id}">${t('library.backToClass')}</a></p>` : ''}
    ${wishBox(t, grade, forClass)}
    <form class="lb-tools" method="get" action="/library" role="search" aria-label="${t('library.searchLabel')}">
      <div class="chips scroll lb-levels" role="group" aria-label="${t('library.gradesLabel')}">
        ${chip(!grade, qs({ grade: '' }), t('library.allGrades'))}
        ${LIB.GRADES.map(g => chip(grade === g, qs({ grade: g }), html`<span aria-hidden="true">${GRADE_ICON[g]}</span> ${gradeName(t, g)}`))}
      </div>
      <div class="lb-search">${grade ? html`<input type="hidden" name="grade" value="${grade}">` : ''}${forClass ? html`<input type="hidden" name="class" value="${forClass.id}">` : ''}
        <label class="sr-only" for="lb-q">${t('library.searchLabel')}</label>
        <input class="input" id="lb-q" name="q" type="search" value="${words}" maxlength="60" placeholder="🔎 ${t('library.searchPlaceholder')}" autocomplete="off">
        <button class="btn" type="submit">${t('library.searchGo')}</button></div>
    </form>
    ${list.length ? html`<p class="sr-only" role="status">${t('library.found', { count: list.length })}</p><ul class="lb-grid" id="lb-grid">${list.map(card)}</ul>`
      : html`<section class="panel">${emptyState({ emoji: '🔎', title: t('library.none'), text: t('library.noneText'), action: html`<a class="btn" href="/library">${t('library.allGrades')}</a>` })}</section>`}
    <p class="small muted lb-foot">${t('library.footSources')} ${t('library.footClassics')} · ${t('library.footQuestions')}</p>
  </div>`;
  page(req, res, { title: t('library.title'), active: 'learn', body, head: raw(`${CSS}${WISH_CSS}`), scripts: ['/js/library-suggest.js'], description: t('library.lead', { count: LIB.books().length }) });
});

// ---------------------------------------------------------------- one book
const bookOr404 = (req, res) => { const bk = LIB.getBook(req.params.id); if (!bk) { notFound(req, res); return null; } return bk; };
router.get('/library/:id', (req, res) => {
  const bk = bookOr404(req, res); if (!bk) return;
  const t = req.t, u = req.user, forClass = classParam(req);
  const rd = u ? LIB.readOf(u.id, bk.id) : null, st = LIB.stateOf(rd, bk);
  const go = st.state === 'reading' ? t('library.continue', { page: st.page }) : t('library.read');
  const body = html`<article class="lb-book panel">
    <div class="lb-book-top">
      <img class="lb-book-cover" src="${bk.cover.src}" alt="" width="${bk.cover.w || 440}" height="${bk.cover.h || 330}">
      <div class="lb-book-info">${gradeChip(t, bk.grade)}
        <h1 dir="auto">${bk.title}</h1>
        <p class="muted">${meta(t, bk)} · ${t('library.words', { count: bk.words })} · ${sourceName(t, bk)}</p>
        <div class="row"><a class="btn btn-primary btn-big" href="/library/${bk.id}/read${st.state === 'reading' ? `?p=${st.page}` : ''}">${ico('📖', { size: 18 })} ${go}</a>${isStaff(u) ? html`<a class="btn" href="${assignHref(bk, forClass)}">${ico('📌', { size: 18 })} ${t('library.assign')}</a>` : ''}</div>
        ${gradeDetails(t, bk)}
        ${st.state === 'done' ? html`<p class="lb-state is-done">${ico('✅', { size: 18 })} ${t('library.state.done', { right: st.right, total: st.total })}</p>` : ''}
      </div></div>
    ${bk.glossary.length ? html`<section class="lb-gloss" aria-labelledby="gl-h"><h2 id="gl-h">${ico('💬', { size: 28 })} ${t('library.glossary')}</h2>
      <dl>${bk.glossary.map(g => html`<div><dt dir="auto">${g.word}</dt><dd>${g.note}</dd></div>`)}</dl><p class="small muted">${t(bk.source === 'storyweaver' ? 'library.glossaryNote' : 'library.glossaryNoteAll')}</p></section>` : ''}
    <section class="lb-about" aria-labelledby="ab-h"><h2 id="ab-h">${ico('📝', { size: 28 })} ${t('library.aboutTitle')}</h2><p class="small">${t('library.aboutQuestions')}</p>
      ${credits(t, bk, { full: true })}</section>
  </article>`;
  page(req, res, { title: bk.title, active: 'learn', body, head: CSS, back: forClass ? `/library?class=${forClass.id}` : '/library', backLabel: t('library.title') });
});

// ---------------------------------------------------------------- the reader
/** A page's text length band (s/m/l/xl): its type size, so the words and the picture fit on one screen (library.css). */
/** The page dots (a sliding window of them for a long book: dotWindow in public/js/library-text.js). */
const dotsOf = (n, p0) => {
  const w = dotWindow(n, p0);
  const cls = ['rd-dots', w.sliding ? 'sliding' : '', w.from > 0 ? 'more-l' : '', w.to < n ? 'more-r' : ''].filter(Boolean).join(' ');
  return html`<span class="${cls}" id="rd-dots" aria-hidden="true">${Array.from({ length: n }, (_, i) => html`<i class="${[i < p0 ? 'on' : '', w.sliding && i === Math.min(p0, n) - 1 ? 'cur' : ''].filter(Boolean).join(' ')}"${i < w.from || i >= w.to ? raw(' hidden') : ''}></i>`)}</span>`;
};
const lenOf = words => (words <= 20 ? 's' : words <= 50 ? 'm' : words <= 100 ? 'l' : 'xl');
/** A book with any page that has no picture: the Classics (docs/decisions.md "Story Library: a Classics shelf"). */
export const hasTextPages = bk => bk.pages.some(p => !p.image);
/** A Classics page's words with their paragraphs (a blank line) and line breaks (a poem), as public/js/library.js draws them. */
const pageText = text => String(text).split('\n\n').map((para, i) => html`${i ? raw('<span class="rd-para"></span>') : ''}${para.split('\n').map((line, k) => html`${k ? raw('<br>') : ''}${line}`)}`);
router.get('/library/:id/read', (req, res) => {
  const bk = bookOr404(req, res); if (!bk) return;
  const t = req.t, u = req.user;
  const ctx = LIB.assignmentCtx(u, bk, req.query.cl, req.query.step);
  LIB.freshForAssignment(u, bk, ctx);
  const rd = u ? LIB.readOf(u.id, bk.id) : null;
  const n = bk.pages.length;
  const p0 = Math.max(1, Math.min(n + 1, Math.floor(+req.query.p || 1)));
  const cls = ctx ? S.getClass(L.getClassLesson(ctx.clId).class_id) : null;
  const back = cls ? { href: `/class/${cls.id}`, label: cls.name } : { href: `/library/${bk.id}`, label: t('library.title') };
  const pg = bk.pages[Math.min(p0, n) - 1];
  // A book with pages that have no picture (the Classics) gets the book layout: on a wide, landscape screen two such
  // pages side by side as an open book (public/js/library.js draws the spreads); its words keep their paragraphs.
  const classic = hasTextPages(bk);
  const pic = pg.image ? html`<figure class="rd-pic"><img id="rd-img" src="${pg.image.src}" alt="${pg.image.alt}" width="${pg.image.w || 720}" height="${pg.image.h || 400}"></figure>`
    : html`<figure class="rd-pic" hidden><img id="rd-img" alt=""></figure>`;
  // The first page is drawn by the server (it works without JavaScript: Back/Next are links); public/js/library.js takes
  // over, turns pages in place and runs Read to me and the questions.
  const body = html`<div class="rd${classic ? ' rd-classic' : ''}" id="reader" data-book="${bk.id}">
    <div class="rd-top"><a class="rd-back" href="${back.href}"><span class="flip" aria-hidden="true">←</span> <span dir="auto">${back.label}</span></a>
      <h1 class="rd-title" dir="auto">${bk.title}</h1>
      <button class="btn btn-primary rd-aloud" type="button" id="rd-aloud" aria-pressed="false" hidden>${ico('🔊', { size: 18 })} <span>${t('library.readToMe')}</span></button></div>
    <div class="rd-stage${classic ? ` is-classic${pg.image ? '' : ' is-text'}` : ''}" id="rd-stage"${p0 > n ? raw(' hidden') : ''}>
      ${classic ? html`${pic}
      <div class="rd-leaf rd-leaf-l"><p class="rd-text" id="rd-text" lang="en" dir="ltr" aria-live="polite" data-len="${lenOf(pg.words)}">${pageText(pg.text)}</p><span class="rd-folio" id="rd-folio" aria-hidden="true">${Math.min(p0, n)}</span></div>
      <div class="rd-leaf rd-leaf-r" id="rd-leaf-r" hidden><p class="rd-text" id="rd-text2" lang="en" dir="ltr" aria-live="polite"></p><span class="rd-folio" id="rd-folio2" aria-hidden="true"></span></div>`
    : html`<figure class="rd-pic"><img id="rd-img" src="${pg.image.src}" alt="${pg.image.alt}" width="${pg.image.w || 720}" height="${pg.image.h || 400}"></figure>
      <p class="rd-text" id="rd-text" lang="en" dir="ltr" aria-live="polite" data-len="${lenOf(pg.words)}">${pg.text}</p>`}
      <nav class="rd-nav" aria-label="${t('library.pagesLabel')}">
        <a class="btn rd-prev" id="rd-prev" href="?p=${Math.max(1, p0 - 1)}"${p0 <= 1 ? raw(' aria-disabled="true" tabindex="-1"') : ''}><span class="flip" aria-hidden="true">◀</span> ${t('library.back')}</a>
        ${dotsOf(n, p0)}
        <span class="rd-count small muted" id="rd-count">${t('library.pageOf', { page: Math.min(p0, n), pages: n })}</span>
        <a class="btn btn-primary rd-next" id="rd-next" href="?p=${p0 + 1}">${p0 >= n ? t('library.toQuestions') : t('library.next')} <span class="flip" aria-hidden="true">▶</span></a>
      </nav></div>
    <section class="rd-end" id="rd-end"${p0 > n ? '' : raw(' hidden')} aria-labelledby="rd-end-h">
      <div class="rd-end-head"><img src="${bk.cover.src}" alt="" width="${bk.cover.w || 440}" height="${bk.cover.h || 330}">
        <h2 id="rd-end-h" tabindex="-1">${ico('⭐', { size: 28 })} ${t('library.finished', { title: bk.title })}</h2>
        <p class="muted">${t('library.questionsLead', { count: bk.questions.length })}</p></div>
      <ol class="rd-qs" id="rd-qs">${bk.questions.map((x, i) => html`<li class="rd-q" data-i="${i}"><h3 dir="auto">${i + 1}. ${x.q}</h3>
        <div class="rd-opts">${x.choices.map((c, k) => html`<button class="rd-opt" type="button" data-c="${k}" disabled>${c}</button>`)}</div>
        <p class="rd-hint" role="status"></p></li>`)}</ol>
      <div class="rd-done" id="rd-done" hidden><p class="rd-done-msg" role="status"></p>
        <div class="row"><a class="btn" href="?p=1">${ico('🔁', { size: 18 })} ${t('library.readAgain')}</a><a class="btn btn-primary" href="${cls ? back.href : '/library'}">${cls ? t('library.backTo', { name: cls.name }) : t('library.moreBooks')}</a></div></div>
      <noscript><p class="notice">${t('library.needJs')}</p></noscript>
    </section>
    ${credits(t, bk)}
  </div>
  ${jsonData('page-data', { book: LIB.forReader(bk), start: p0, ctx: ctx ? { cl: ctx.clId, step: ctx.stepId } : null, signedIn: !!u,
    read: rd ? { page: rd.page, solved: rd.solved, aloud: !!rd.aloud } : null, tts: ttsOnLocales(), backHref: back.href })}`;
  page(req, res, { title: bk.title, active: 'learn', body, head: CSS, scripts: ['/js/library.js'], mid: true });
});

const ctxOf = (req, bk) => LIB.assignmentCtx(req.user, bk, b(req).cl, b(req).step);
const whole = v => (typeof v === 'number' || (typeof v === 'string' && /^\d{1,4}$/.test(v)) ? +v : NaN);
router.post('/api/library/:id/progress', rateLimit('library', 600, 60e3), (req, res) => {
  const bk = LIB.getBook(req.params.id); if (!bk) return res.status(404).json({ error: req.t('errors.api.notFound') });
  const r = LIB.progress(req.user, bk.id, { page: whole(b(req).page), aloud: b(req).aloud === true }, ctxOf(req, bk));
  res.json({ ok: r.ok });
});
router.post('/api/library/:id/answer', rateLimit('library', 600, 60e3), (req, res) => {
  const bk = LIB.getBook(req.params.id); if (!bk) return res.status(404).json({ error: req.t('errors.api.notFound') });
  const r = LIB.answer(req.user, bk.id, whole(b(req).i), whole(b(req).c), ctxOf(req, bk));
  if (!r.ok) return res.status(400).json({ error: req.t(r.code === 'readFirst' ? 'library.errors.readFirst' : 'errors.api.badRequest'), code: r.code });
  res.json({ ok: true, right: r.right, page: r.page, solved: r.solved, done: r.done, marks: r.marks });
});

// ---------------------------------------------------------------- Assign
router.get('/library/:id/assign', requireUser, (req, res) => {
  const t = req.t, u = req.user;
  if (!isStaff(u)) return notFound(req, res);
  const bk = bookOr404(req, res); if (!bk) return;
  const classes = LIB.assignClasses(u), pre = String(req.query.class || '');
  const gc = classes.map(c => gcAssignField(req, c)).find(Boolean) || '';
  const body = html`<div class="pagehead"><h1>${ico('📌', { size: 36 })} ${t('library.assignTitle', { title: bk.title })}</h1></div>
  <section class="panel assign-game lb-assign" aria-labelledby="as-h">
    <div class="lb-assign-book"><img src="${bk.cover.src}" alt="" width="${bk.cover.w || 440}" height="${bk.cover.h || 330}"><div>${gradeChip(t, bk.grade)}<p class="small muted">${meta(t, bk)} · ${t('library.words', { count: bk.words })}</p></div></div>
    <h2 id="as-h" class="sr-only">${t('teach.assign.pickClass')}</h2>
    ${classes.length ? html`<form class="formgrid assigngrid" data-api="/api/library/assign" novalidate><input type="hidden" name="bookId" value="${bk.id}">
      <div class="field"><label for="as-c">${t('teach.assign.pickClass')}</label><select class="input" id="as-c" name="classId">${classes.map(c => html`<option value="${c.id}"${c.id === pre ? raw(' selected') : ''}>${c.name}</option>`)}</select></div>
      <div class="field"><label for="as-d">${t('lessons.assign.due')}</label><input class="input" id="as-d" name="dueAt" type="date"></div>
      ${gc}
      <div class="field end"><button class="btn btn-primary" type="submit" id="as-go">${ico('📌', { size: 18 })} ${t('teach.assign.submit')}</button></div>
      <p class="small muted wide">${t('library.assignNote')}</p>${classes[0] ? html`<p class="small muted wide">${zoneNote(t, classes[0].school_id, u)}</p>` : ''}<p class="form-err err wide" role="alert"></p></form>`
      : html`<p class="muted">${t('teach.assign.none')}</p><p><a class="btn" href="/teach">${t('nav.classroom')}</a></p>`}
    <p class="row"><a class="btn" href="/library/${bk.id}/read">${ico('📖', { size: 18 })} ${t('library.preview')}</a></p>
  </section>`;
  page(req, res, { title: t('library.assignTitle', { title: bk.title }), active: 'teach', body, head: raw(`${CSS}`), back: pre ? `/library?class=${encodeURIComponent(pre)}` : '/library', backLabel: t('library.title') });
});
router.post('/api/library/assign', requireUser, rateLimit('lesson-new', 120, 3600e3), async (req, res) => {
  const u = req.user;
  if (!isStaff(u)) return res.status(404).json({ error: req.t('lessons.errors.notFound') });
  const r = LIB.assignStory(u, b(req).classId, b(req).bookId, { dueAt: b(req).dueAt || null });
  if (!r.ok) {
    if (r.code === 'alreadyAssigned') return res.status(400).json({ error: req.t('library.errors.alreadyAssigned', { class: r.className }) });
    return res.status(r.code === 'notFound' ? 404 : 400).json({ error: req.t(r.code === 'notFound' ? 'lessons.errors.notFound' : 'library.errors.pickStory') });
  }
  const also = await gcAfterAssign(req, r.classLesson);
  const toast = req.t('lessons.assign.done', { class: r.class.name });
  res.json({ ok: true, toast: also ? `${toast} · ${also}` : toast, redirect: `/class/${r.class.id}?view=assigned` });
});

// ---------------------------------------------------------------- results (from /class/:cid/progress/:clid)
/** An assigned book's results page for the class's staff (routes/progress.js hands over when the lesson is a story). */
export function storyResults(req, res, c, cl, l) {
  const t = req.t, f = req.fmt;
  const r = LIB.results(cl);
  if (!r) return notFound(req, res);
  const bk = r.book;
  const readCell = p => {
    if (p.state === 'done') return html`<span class="lr-read is-done">${ico('✅', { size: 18 })} ${p.aloud ? t('library.results.withAloud') : t('library.results.onOwn')}</span>`;
    if (p.state === 'quiz') return html`<span class="lr-read">${ico('📝', { size: 18 })} ${t('library.results.questionsLeft')}</span>`;
    if (p.state === 'reading') return html`<span class="lr-read">${ico('📖', { size: 18 })} ${t('library.results.pageOf', { page: p.page, pages: p.pages })}</span>${p.aloud ? html` <span class="chip-s" title="${t('library.results.usedAloud')}">🔊</span>` : ''}`;
    return html`<span class="lr-read muted">${ico('⏳', { size: 18 })} ${t('library.results.notStarted')}</span>`;
  };
  const marks = p => html`<span class="lr-marks" aria-hidden="true">${[...p.marks].map((m, i) => html`<span class="${m === '1' ? 'ok' : 'no'}" title="${t('library.results.qN', { n: i + 1 })}">${m === '1' ? '✓' : '✗'}</span>`)}</span>`;
  const body = html`${classHeader(req, c, 'progress')}
  <div class="lphead"><div><h2 dir="auto">${ico('📖', { size: 28 })} ${bk.title}</h2>
    <p class="lr-grade">${gradeChip(t, bk.grade)}</p>
    <p class="muted lp-meta"><span>${t('library.results.summary', { started: r.started, finished: r.finished, total: r.students.length })}</span>${dueChip(t, f, cl, { done: r.students.length > 0 && r.finished >= r.students.length })}</p></div>
    <div class="row"><a class="btn" href="/library/${bk.id}/read">${ico('🖥️', { size: 18 })} ${t('library.results.readTogether')}</a><a class="btn btn-primary" href="/library?class=${c.id}">${ico('📌', { size: 18 })} ${t('library.results.assignAnother')}</a></div></div>
  ${!r.students.length ? html`<section class="panel">${emptyState({ emoji: '👩‍🎓', title: t('progress.gradebook.noStudents'), text: t('progress.gradebook.noStudentsText') })}</section>`
    : html`<section class="panel"><div class="gbwrap" tabindex="0" role="region" aria-label="${bk.title}"><table class="tbl lr-table" id="lr-table">
      <thead><tr><th scope="col">${t('school.people.name')}</th><th scope="col">${t('library.results.read')}</th><th scope="col">${t('library.results.questions')}</th><th scope="col">${t('progress.lesson.lastActive')}</th></tr></thead>
      <tbody>${r.students.map(p => html`<tr id="s-${p.id}" data-state="${p.state}"><th scope="row" class="gb-name"><span class="pp">${avatar(p, 28)}${staffStudentName(p, { href: studentHref(c, p) })}</span></th>
        <td>${readCell(p)}</td>
        <td>${p.right === null ? html`<span class="muted">–</span>` : html`<b dir="ltr">${t('library.results.rightOf', { right: p.right, total: p.total })}</b> ${marks(p)}<span class="sr-only">${t('library.results.firstTry')}</span>`}</td>
        <td class="small muted">${p.last ? f.ago(p.last) : '–'}</td></tr>`)}</tbody></table></div>
      <p class="small muted gb-key">${t('library.results.key')}</p></section>
    <section class="panel lr-qs" aria-labelledby="lr-qh"><h2 id="lr-qh">${ico('🧩', { size: 28 })} ${t('library.results.byQuestion')}</h2>
      ${r.hardest !== null ? html`<p class="notice">${t('library.results.hardest', { n: r.hardest + 1 })}</p>` : ''}
      <ol class="lr-qlist">${bk.questions.map((x, i) => html`<li><b dir="auto">${x.q}</b> <span class="small muted">${t('library.results.answer', { answer: x.choices[x.answer] })} · ${t('library.results.page', { page: x.page })} · ${t('library.results.missed', { count: r.misses[i] })}</span></li>`)}</ol>
      <p class="small muted">${t('library.aboutQuestions')}</p></section>`}`;
  page(req, res, { title: `${bk.title} · ${c.name}`, active: 'classes', body, head: raw(`${SCHOOL_CSS}${CSS}`), scripts: ['/js/schools.js'], back: `/class/${c.id}/progress`, backLabel: t('progress.gradebook.title') });
}
