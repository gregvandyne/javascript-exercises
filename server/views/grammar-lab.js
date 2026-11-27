// Grammar Lab's pages (routes/grammar-lab.js; services/grammar-lab.js): the course page (bands and their units), a unit
// (its topic tiles, each with an options menu), a topic's practice (welcome, the double-tap tip, the quiz, the level and
// mastery screens, all driven by public/js/grammar-lab.js), its teaching card and its look-back list.
// The course text (titles, cards, questions, hints) is English for now and marked lang="en"; everything around it is
// grammarLab.* strings. Pictures are Grammar Lab's own art (public/js/grammar-lab-art.js), drawn inline so they follow
// the theme.
import { html, raw, jsonData } from './html.js';
import { VERSION } from './layout.js';
import { art } from '../../public/js/grammar-lab-art.js';
import { tokenize } from '../services/grammar-lab-text.js';
import * as GL from '../services/grammar-lab.js';

export const HEAD = raw(`<link rel="stylesheet" href="/css/grammar-lab-art.css?v=${VERSION}"><link rel="stylesheet" href="/css/grammar-lab.css?v=${VERSION}">`);
/** The practice page also fetches its scripts at once, side by side (public/js/grammar-lab.js imports app.js and the art
 *  module by these plain URLs): without this they came one after another, after the page's own script, while the lesson
 *  area waited. */
export const PRACTICE_HEAD = raw(`${HEAD}<link rel="modulepreload" href="/js/grammar-lab.js?v=${VERSION}"><link rel="modulepreload" href="/js/app.js"><link rel="modulepreload" href="/js/grammar-lab-art.js">`);
const en = raw(' lang="en" dir="ltr"');
/** A translated line with one English piece of course text in it (a topic or unit name): the piece is marked lang="en"
 *  (and isolated, so it reads the right way round inside a right-to-left line), the rest is the page's language. */
export function tIn(t, key, vars, name) {
  const [a, b = ''] = t(key, { ...vars, [name]: '\u0001' }).split('\u0001');
  // (one piece: inside a flex button the parts would otherwise be spaced apart by its gap)
  return html`<span>${a}<span lang="en" dir="ltr">${vars[name]}</span>${b}</span>`;
}
export const ROLES = Object.freeze(['adjective', 'noun', 'verb', 'adverb', 'pronoun', 'subject', 'article', 'conjunction', 'preposition', 'capital', 'lower', 'small', 'comma']);
export const GLOSSARY = Object.freeze(['adjective', 'noun']);
const base = '/courses/grammar-lab';
export const unitHref = p => `${base}/${p.band}/${p.id}`;
export const topicHref = (p, id, what = '') => `${unitHref(p)}/${id}${what ? `/${what}` : ''}`;
const bandClass = b => `gl-band-${b}`;

/** A sentence with some of its words color-coded by job (the worked example and tips). A 'comma' mark highlights the
 *  comma after its word; a 'key' mark highlights the word with no label. A mark is the highlighted word (.gl-mk-w) over
 *  its label (.gl-mk-tag), both in the line's flow: the mark is as wide as the wider of the two, so a label never runs
 *  into the next word's label or the next line (public/css/grammar-lab.css). */
function marked(text, marks, t) {
  const by = new Map((marks || []).map(m => [m.i, m.role]));
  return tokenize(text).map((w, i) => {
    const role = by.get(i);
    if (role === 'comma') {
      const [c, ...rest] = w.post;
      return html`${i ? ' ' : ''}<span class="gl-tok">${w.pre}${w.t}<span class="gl-mk gl-mk-comma"><span class="gl-mk-w">${c}</span><span class="gl-mk-tag">${t('grammarLab.roles.comma')}</span></span>${rest.join('')}</span>`;
    }
    const word = role === 'key' ? html`<span class="gl-mk gl-mk-key"><span class="gl-mk-w">${w.t}</span></span>`
      : role ? html`<span class="gl-mk gl-mk-${role}"><span class="gl-mk-w">${w.t}</span><span class="gl-mk-tag">${t(`grammarLab.roles.${role}`)}</span></span>` : w.t;
    // (a word and its marks as one piece: a line never starts with a mark)
    return html`${i ? ' ' : ''}<span class="gl-tok">${w.pre}${word}${w.post}</span>`;
  });
}
/** One example as written: its lead-in, the example sentence, its note and (a pair's) the second sentence. Titles are
 *  shown in italics, never in quotes. A fix (u.fix: a sentence as written, then fixed; scripts/grammar-lab-build.js
 *  beforeAfter) shows the two apart: the before plain and quiet after a small cross, the after on its own line after a
 *  check, with all the marks; a screen reader hears "Before:" and "After:". */
function exampleUnit(t, u, { italic = false, tag = 'p' } = {}) {
  const sent = (x, m) => (italic ? html`<i class="gl-title">${marked(x, m, t)}</i>` : marked(x, m, t));
  const lead = u.lead ? html`<span class="gl-ex-lead">${u.lead}</span> ` : '';
  const thenNote = u.then && u.then.note ? html` <span class="gl-ex-note">${u.then.note}</span>` : '';
  const inner = u.fix && u.then
    ? html`${lead}<span class="gl-ba gl-ba-before"><span class="gl-ba-sign" aria-hidden="true">✗</span><span class="sr-only">${t('grammarLab.card.before')}</span> <span class="gl-ba-text">${u.text}</span></span>${u.note ? html` <span class="gl-ex-note">${u.note}</span>` : ''}<span class="gl-ba gl-ba-after"><span class="gl-ba-sign" aria-hidden="true">✓</span><span class="sr-only">${t('grammarLab.card.after')}</span> <span class="gl-ex-text">${sent(u.then.text, u.then.marks)}</span></span>${thenNote}`
    : html`${lead}<span class="gl-ex-text">${sent(u.text, u.marks)}</span>${u.note ? html` <span class="gl-ex-note">${u.note}</span>` : ''}${u.then ? html` <span class="gl-ex-text gl-ex-then">${sent(u.then.text, u.then.marks)}</span>${thenNote}` : ''}`;
  const cls = u.fix && u.then ? 'gl-ex gl-ex-fix' : 'gl-ex';
  return tag === 'li' ? html`<li class="${cls}">${inner}</li>` : html`<p class="${cls}">${inner}</p>`;
}
/** A writing topic's card (grades 3-5 up): three sections, each with its guiding question, a worked passage with the
 *  sentence that does the job highlighted, and a note on how it works. small: the hint's short form (questions and notes). */
function sectionsBody(t, c, small) {
  return html`<div class="gl-card-body gl-sections${small ? ' gl-card-small' : ''}"${en}>
    ${c.sections.map((x, i) => html`<section class="gl-section" aria-labelledby="gl-sec-${small ? 'h' : 'c'}${i}">
      <h2 class="gl-section-h" id="gl-sec-${small ? 'h' : 'c'}${i}"><span class="gl-section-n" aria-hidden="true">${i + 1}</span> ${x.title}</h2>
      <p class="gl-guide"><span class="gl-label">${t('grammarLab.card.question')}</span> ${x.question}</p>
      ${x.body && !small ? html`<p class="gl-section-body">${x.body}</p>` : ''}
      ${small ? '' : html`<p class="gl-passage">${x.passage.map((y, k) => html`${k ? ' ' : ''}${y.label ? html`<span class="gl-ex-lead">${y.label}:</span> ` : ''}${y.hl ? html`<mark class="gl-hl">${y.text}</mark>` : y.text}`)}</p>`}
      <p class="gl-how">${x.note}</p>
    </section>`)}
  </div>`;
}
/** The teaching card's body (the card page and the hint's small card share it). small: the hint's short form. */
export function cardBody(t, tp, { small = false } = {}) {
  const c = tp.card, italic = !!tp.italic;
  if (c.sections) return sectionsBody(t, c, small);
  return html`<div class="gl-card-body${small ? ' gl-card-small' : ''}"${en}>
    <p class="gl-def">${c.definition}</p>
    ${c.example ? html`<div class="gl-example"><p class="gl-label">${t('grammarLab.card.example')}</p>
      ${[c.example, ...(c.example.more || [])].map(u => exampleUnit(t, u, { italic }))}</div>` : ''}
    <p class="gl-how"><b>${t('grammarLab.card.how')}</b> ${c.how}</p>
    ${small ? '' : html`<div class="gl-tips"><p class="gl-label">${t('grammarLab.card.tips')}</p><ul>${c.tips.map(x => exampleUnit(t, x, { italic, tag: 'li' }))}</ul></div>`}
  </div>`;
}

/** The sign-in prompt for a guest: friendly, and the win waits for them. */
export function guestBox(t, next, { id = '', hidden = false, won = false } = {}) {
  return html`<div class="gl-guest"${id ? raw(` id="${id}"`) : ''}${hidden ? raw(' hidden') : ''}>
    <p class="gl-guest-h">${t(won ? 'grammarLab.guest.wonTitle' : 'grammarLab.guest.title')}</p>
    <p>${t(won ? 'grammarLab.guest.wonText' : 'grammarLab.guest.text')}</p>
    <p class="gl-guest-go"><a class="btn btn-primary" href="/signup?next=${encodeURIComponent(next)}">${t('grammarLab.guest.signup')}</a>
      <a class="btn btn-ghost" href="/login?next=${encodeURIComponent(next)}">${t('grammarLab.guest.login')}</a></p>
  </div>`;
}

/** The grade question on a first visit (nothing known yet): an account's answer is kept (a declared grade); a guest's
 *  only opens that band for this visit. */
function gradeAsk(t, guest) {
  const opts = ['K', ...Array.from({ length: 12 }, (_, i) => String(i + 1))];
  const sel = html`<label class="gl-label" for="gl-grade">${t('grammarLab.place.ask')}</label>
    <select class="input gl-grade" id="gl-grade" name="grade" required><option value="">${t('grammarLab.place.choose')}</option>${opts.map(g => html`<option value="${g}">${g === 'K' ? t('learn.tab.gradeK') : t('learn.tab.gradeN', { n: g })}</option>`)}</select>`;
  return html`<section class="gl-ask-grade" aria-labelledby="gl-ask-h"><h2 id="gl-ask-h">${t('grammarLab.place.askTitle')}</h2><p class="muted">${t('grammarLab.place.askText')}</p>
    ${guest ? html`<form method="get" action="${base}" class="gl-ask-form">${sel}<button class="btn btn-primary" type="submit">${t('grammarLab.place.go')}</button></form>`
      : html`<form data-api="/api/courses/grammar-lab/grade" class="gl-ask-form" novalidate>${sel}<button class="btn btn-primary" type="submit">${t('grammarLab.place.go')}</button><p class="form-err err" aria-live="polite"></p></form>`}</section>`;
}
function bandSection(t, { band, units, counts }, { yours = false, folded = false } = {}) {
  const line = counts ? t('grammarLab.progress.band', { mastered: counts.mastered, started: counts.started }) : '';
  const inner = html`<div class="gl-cover gla">${raw(art.cover(band.id))}</div>
      <h2 id="gl-band-${band.id}">${t('grammarLab.band', { grades: band.grades })}${yours ? html` <span class="gl-badge gl-badge-yours">${t('grammarLab.place.yours')}</span>` : ''}</h2>
      ${counts ? html`<p class="gl-bandprog muted" id="gl-bandprog-${band.id}">${line}</p>` : ''}
      <ul class="gl-units">${units.map(({ p, prog, assigned }) => html`<li><a class="gl-unit" href="${unitHref(p)}" id="gl-unit-${p.id}">
        ${ring(t, prog)}
        <span class="gl-unit-t"><span class="gl-unit-name"${en}>${p.title}</span><span class="muted">${t('grammarLab.topicsN', { count: prog.total })}${prog.started ? html`&nbsp;· <span class="gl-unit-going">${t('grammarLab.progress.unit', { started: prog.started })}</span>` : ''}${assigned ? html`&nbsp;· ${t('grammarLab.assigned.badge')}` : ''}</span></span>
        <span class="gl-go flip" aria-hidden="true">→</span></a></li>`)}</ul>`;
  return folded ? html`<details class="gl-bandsec gl-bandfold ${bandClass(band.id)}" id="gl-sec-${band.id}"><summary><span class="gl-fold-h">${t('grammarLab.band', { grades: band.grades })}</span><span class="muted">${t('grammarLab.unitsN', { count: units.length })}${counts && (counts.mastered || counts.started) ? html`&nbsp;· ${line}` : ''}</span></summary>${inner}</details>`
    : html`<section class="gl-bandsec ${bandClass(band.id)}" id="gl-sec-${band.id}" aria-labelledby="gl-band-${band.id}">${inner}</section>`;
}
/** The course page: each band with its cover and its units (rings from live topic states). The student's band (a
 *  teacher's choice, else their grade's; or the one this visit asked for) comes first and open, the others folded under
 *  "Other grades"; with no band known the grade question comes first. A student who reaches only assigned work sees
 *  those units. */
export function coursePage({ t, list, guest, pending, open = null, place = {}, all = true, askGrade = false }) {
  const mine = open ? list.find(x => x.band.id === open) : null;
  const rest = list.filter(x => x !== mine);
  return html`<div class="gl">
    <header class="gl-top"><h1>${t('grammarLab.title')}</h1><p class="muted">${all ? t('grammarLab.sub') : t('grammarLab.assigned.lead')}</p></header>
    ${guest && pending ? guestBox(t, base, { won: true }) : ''}
    ${askGrade ? gradeAsk(t, guest) : ''}
    ${!all ? list.map(x => bandSection(t, x)) : html`${mine ? bandSection(t, mine, { yours: place.band === mine.band.id }) : ''}
      ${mine && rest.length ? html`<h2 class="gl-other-h">${t('grammarLab.place.other')}</h2>` : ''}
      ${rest.map(x => bandSection(t, x, { folded: !!mine }))}`}
  </div>`;
}
function ring(t, { done, total }) {
  const pct = total ? Math.round(done / total * 100) : 0;
  return html`<span class="gl-ring" role="img" aria-label="${t('grammarLab.ringLabel', { done, total })}" style="--p:${pct}"><span>${done}/${total}</span></span>`;
}

/** A unit: its topic tiles in order (under their part titles), each with its state, its marks and its options menu. */
export function unitPage({ t, p, states, guest }) {
  const prog = { done: states.filter(s => s.mastered).length, total: states.length };
  const started = states.filter(s => !s.mastered && s.level).length;
  const pending = states.some(s => s.pending);
  return html`<div class="gl ${bandClass(p.band)}">
    <p class="gl-crumb"><a href="${base}">${t('grammarLab.allUnits')}</a></p>
    <header class="gl-unithead">${ring(t, prog)}<div><h1${en}>${p.title}</h1><p class="muted">${t('grammarLab.band', { grades: (GL.band(p.band) || {}).grades || '' })}&nbsp;· ${t('grammarLab.topicsN', { count: states.length })}</p>
      <p class="muted gl-unitprog" id="gl-unitprog">${t('grammarLab.progress.unitHead', { mastered: prog.done, total: prog.total, started })}</p></div></header>
    ${guest && pending ? guestBox(t, unitHref(p), { won: true }) : ''}
    <ol class="gl-topics">${states.map((s, i) => html`${s.part ? html`<li class="gl-part"><h2 class="gl-part-h"${en}>${s.part}</h2></li>` : ''}${tile(t, p, s, i)}`)}</ol>
  </div>`;
}
function tile(t, p, s, i) {
  const tp = s.topic, id = tp.id;
  // (a student who reaches only assigned work: a topic that is not theirs reads "Not assigned", never a lock to work at)
  const state = s.mastered ? 'mastered' : s.pending ? 'pending' : !s.open ? (s.assigned === false ? 'off' : 'locked') : s.started ? 'started' : 'new';
  const after = !s.mastered;
  const item = (href, label, off, note = 'grammarLab.topic.afterMastery') => (off ? html`<span class="gl-mi" role="menuitem" aria-disabled="true">${label}<small>${t(note)}</small></span>` : html`<a class="gl-mi" role="menuitem" href="${href}">${label}</a>`);
  return html`<li class="gl-tile gl-${state}" id="gl-topic-${id}">
    ${s.open ? html`<a class="gl-tile-main" href="${topicHref(p, id)}">` : html`<span class="gl-tile-main" aria-disabled="true">`}
      <span class="gl-tile-n" aria-hidden="true">${s.mastered ? '✓' : i + 1}</span>
      <span class="gl-tile-t"><span class="gl-tile-name"${en}>${tp.title}</span>
        <span class="gl-tile-state">${state === 'started' && s.level ? t('grammarLab.topic.levelOf', { level: s.level.level, levels: s.level.levels }) : t(`grammarLab.topic.${state}`)}</span>
        ${s.also && s.also.length ? html`<span class="gl-tile-also">${tIn(t, 'grammarLab.topic.also', { units: s.also.map(x => x.title).join(', ') }, 'units')}</span>` : ''}
        ${s.mark || (s.room && s.room.passed) || s.assigned ? html`<span class="gl-tile-marks">${s.assigned ? html`<span class="gl-badge gl-badge-yours">${t('grammarLab.assigned.badge')}</span>` : ''}${s.mark ? html`<span class="gl-badge gl-badge-${s.mark}">${t(`grammarLab.mark.${s.mark}`)}</span>` : ''}${s.room && s.room.passed ? html`<span class="gl-badge gl-badge-room">${t('grammarLab.room.passed')}</span>` : ''}</span>` : ''}</span>
    ${s.open ? raw('</a>') : raw('</span>')}
    <details class="gl-menu"><summary aria-label="${t('grammarLab.topic.options', { topic: tp.title })}"><span aria-hidden="true">⋯</span></summary>
      <div class="gl-menu-list" role="menu">
        ${item(topicHref(p, id, 'card'), t('grammarLab.topic.card'), false)}
        ${item(`${topicHref(p, id)}?again=1`, t('grammarLab.topic.again'), after)}
        ${item(topicHref(p, id, 'review'), t('grammarLab.topic.review'), after)}
        ${s.room ? item(GL.roomHref(p.id, id, p.band), t('grammarLab.room.open'), !s.room.open, 'grammarLab.room.locked') : ''}
      </div></details>
  </li>`;
}

/** The Learn tab's Grammar Lab card (routes/teachers.js), in the course cards' own markup (views/courses.js courseRow)
 *  with the course's cover: a student's progress line and Start / Keep going; for staff, Assign to a class (the
 *  teacher page) and the course itself. Shown only to whoever Grammar Lab lets in. */
export function learnCard({ t, staff = false, done = 0, total = 0, begun = false, meta = '' }) {
  return html`<section class="rail courses gl-learn" aria-labelledby="gl-learn-h"><div class="course-rail"><div class="rail-track course-track">
    <article class="course-card gl-learncard">
      <a class="course-head" href="${base}"><img class="gl-learncover" src="/covers/grammar-lab.jpg" alt="" width="72" height="96" loading="lazy">
        <div class="course-ht"><h3 id="gl-learn-h">${t('grammarLab.title')}</h3><p>${t('grammarLab.sub')}</p>${meta ? html`<p class="gmeta course-meta">${meta}</p>` : ''}</div>
        <span class="course-go flip" aria-hidden="true">›</span></a>
      ${!staff && total ? html`<div class="course-progline"><div class="cprog" aria-hidden="true"><span style="width:${Math.round(done / Math.max(1, total) * 100)}%"></span></div><span class="muted course-prog">${t('grammarLab.ringLabel', { done, total })}</span></div>` : ''}
      <div class="course-foot">${staff ? html`<a class="btn btn-primary" href="/teach/grammar-lab" id="gl-learn-assign">📌 ${t('learn.tab.assignCourse')}</a><a class="btn btn-ghost" href="${base}">${t('grammarLab.learn.see')}</a>`
        : html`<a class="btn btn-primary" href="${base}" id="gl-learn-go">▶ ${begun ? t('courses.continue') : t('courses.start')}</a>`}</div>
    </article></div></div></section>`;
}

/** A topic's practice: every screen of the flow, shown one at a time by public/js/grammar-lab.js: the welcome, the
 *  teaching card (a step of the lesson, with "Start the questions"), the questions and the mastery screen. During the
 *  questions the header's "Teaching card" opens the same card in a sheet over the lesson (its link still goes to the
 *  card page without the script). */
export function practicePage({ t, p, tp, data, guest, listen = false }) {
  // K-2 read-aloud (only when the English voice is on: routes/grammar-lab.js voiceOn): a listen button for the question
  // and one in the hint, shown by public/js/grammar-lab.js when this device uses the AI voice
  const say = (id, label) => (listen ? html`<button type="button" class="btn btn-sm gl-say" id="${id}" hidden aria-pressed="false"><span aria-hidden="true">🔊</span> <span class="lbl">${label}</span></button>` : '');
  const tipWord = t('grammarLab.glossaryWord.adjective');
  // the counts the intro, the header and the mastery screen all say the same way: N questions, plus one for each miss
  const per = tp.levels.every(n => n === tp.levels[0]) ? tp.levels[0] : null;
  const total = tp.levels.reduce((a, b) => a + b, 0);
  const also = GL.alsoIn(tp.id, p).map(x => x.title);
  return html`<div class="gl gl-practice ${bandClass(p.band)}" data-band="${p.band}">
    <header class="gl-qhead">
      <a class="gl-qback" href="${unitHref(p)}" aria-label="${t('grammarLab.backTo', { unit: p.title })}"><span class="flip" aria-hidden="true">←</span></a>
      <div class="gl-qtitle"><span class="gl-qunit"${en}>${p.title}</span><span class="gl-qtopic" id="gl-qtopic"${en}>${tp.title}</span></div>
      <span class="gl-dots" id="gl-dots" role="img" aria-label="" hidden><i></i><i></i><i></i></span>
      <button type="button" class="btn btn-sm gl-hbtn" id="gl-levels-btn" aria-haspopup="dialog" hidden></button>
      <button type="button" class="btn btn-sm gl-hbtn gl-ibtn" id="gl-tip-btn" aria-label="${t('grammarLab.practice.tip')}" title="${t('grammarLab.practice.tip')}"><span aria-hidden="true">?</span></button>
      <a class="btn btn-sm gl-hbtn" id="gl-card-btn" href="${topicHref(p, tp.id, 'card')}" aria-haspopup="dialog" aria-controls="gl-cardsheet">${t('grammarLab.practice.card')}</a>
    </header>
    <div class="gl-meter" id="gl-meter" hidden><p class="gl-counter"><span id="gl-counter"></span> <span class="gl-added" id="gl-added" hidden></span></p><ol class="gl-bar" id="gl-bar" aria-hidden="true"></ol></div>
    <noscript><p class="notice warn">${t('grammarLab.noscript')}</p></noscript>
    <section class="gl-screen gl-loading" id="gl-loading" aria-busy="true" aria-labelledby="gl-loading-t">
      <p class="gl-loading-t" id="gl-loading-t" role="status">${t('grammarLab.loading')}</p>
      <div class="gl-skel" aria-hidden="true"><i class="gl-skel-ask"></i><i class="gl-skel-line"></i><i class="gl-skel-line gl-skel-short"></i><i class="gl-skel-btn"></i></div>
    </section>

    <section class="gl-screen gl-welcome" id="gl-welcome" hidden aria-labelledby="gl-welcome-h">
      <button type="button" class="btn btn-ghost btn-sm gl-skip" id="gl-skip">${t('grammarLab.welcome.skip')}</button>
      <div class="gl-welcome-art"><div class="gl-stage gl-stage-door" id="gl-door"></div><div class="gl-stage gl-stage-greet" id="gl-greet"></div></div>
      <h1 id="gl-welcome-h">${tIn(t, 'grammarLab.welcome.heading', { topic: tp.title }, 'topic')}</h1>
      <p class="gl-lead gl-rule" id="gl-rule">${per ? t('grammarLab.welcome.rule', { per }) : t('grammarLab.levels.rule')}</p>
      <p class="gl-count" id="gl-count">${t('grammarLab.welcome.count', { total })}</p>
      <button type="button" class="btn btn-primary btn-big" id="gl-go">${t('grammarLab.welcome.go')}</button>
    </section>

    <section class="gl-screen gl-cardstep" id="gl-cardstep" hidden aria-labelledby="gl-cardstep-h">
      <div class="gl-cardstep-top"><p class="gl-label" id="gl-cardstep-h">${t('grammarLab.card.heading')}</p>
        <button type="button" class="btn btn-ghost btn-sm" id="gl-card-skip" hidden>${t('grammarLab.card.skip')}</button></div>
      <p class="gl-cardstep-lead">${t('grammarLab.card.lead')}</p>
      <div class="gl-cardstep-slot" id="gl-cardstep-slot">${cardArticle(t, tp, listen)}</div>
      <p class="gl-card-go"><button type="button" class="btn btn-primary btn-big" id="gl-card-go">${t('grammarLab.card.start')}</button></p>
    </section>

    <section class="gl-screen gl-quiz" id="gl-quiz" hidden aria-labelledby="gl-qtopic">
      <p class="gl-again" id="gl-again" hidden></p>
      <div class="gl-qtop"><p class="gl-ask" id="gl-ask"${en}></p>
        <p class="gl-streak" id="gl-streak"><span class="gl-pips" aria-hidden="true"><i></i><i></i></span><span class="gl-streak-t" id="gl-streak-t"></span></p></div>
      ${say('gl-say', t('grammarLab.practice.listen'))}
      <p class="gl-prompt" id="gl-prompt" hidden${en}></p>
      <div class="gl-chips" id="gl-chips" role="radiogroup" aria-label="${t('grammarLab.practice.chips')}" hidden></div>
      <p class="gl-sentence" id="gl-sentence"${en}></p>
      <div class="gl-fixbox" id="gl-fixbox" hidden><label class="gl-label" for="gl-fix">${t('grammarLab.practice.fixLabel')}</label>
        <textarea class="gl-fix" id="gl-fix" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"${en}></textarea></div>
      <div class="gl-options" id="gl-options" role="radiogroup" aria-labelledby="gl-ask" hidden${en}></div>
      <div class="gl-notice" id="gl-notice" role="status" aria-live="polite" hidden></div>
      <aside class="gl-hint" id="gl-hint" hidden aria-labelledby="gl-hint-h">
        <p class="gl-hint-h" id="gl-hint-h">${t('grammarLab.practice.hintTitle')}</p>
        <p class="gl-hint-text" id="gl-hint-text"${en}></p>
        ${say('gl-hint-say', t('grammarLab.practice.listenHint'))}
        ${cardBody(t, tp, { small: true })}
      </aside>
      <div class="gl-actions">
        <button type="button" class="btn gl-hint-btn" id="gl-hint-btn" aria-expanded="false" aria-controls="gl-hint" hidden>${t('grammarLab.practice.hint')}</button>
        <button type="button" class="btn gl-asis" id="gl-asis" aria-pressed="false" hidden>${t('grammarLab.practice.asIs')}</button>
        <button type="button" class="btn btn-primary btn-big gl-submit" id="gl-submit" disabled>${t('grammarLab.practice.submit')}</button>
      </div>
      <p class="gl-flag"><button type="button" class="linkish" id="gl-flag">${t('grammarLab.practice.flag')}</button></p>
    </section>

    <div class="gl-flash" id="gl-correct" hidden role="status"><div><span class="gl-check" aria-hidden="true">✓</span><p id="gl-correct-t">${t('grammarLab.practice.correct')}</p><p class="gl-flash-note" id="gl-correct-note" hidden></p></div></div>

    <div class="gl-overlay" id="gl-level" hidden role="dialog" aria-modal="true" aria-labelledby="gl-level-h">
      <div class="gl-overlay-card">
        <p class="gl-stars" id="gl-level-stars" aria-hidden="true"><i></i><i></i><i></i></p>
        <div class="gl-stage gl-stage-greet" id="gl-level-greet"></div>
        <h2 id="gl-level-h"></h2>
        <p id="gl-level-text"></p>
        <p class="gl-level-more" id="gl-level-more" hidden></p>
        <button type="button" class="btn btn-primary btn-big" id="gl-level-next">${t('grammarLab.practice.levelNext')}</button>
      </div>
    </div>

    <section class="gl-screen gl-done" id="gl-done" hidden aria-labelledby="gl-done-h">
      <div class="gl-stage gl-stage-mastery" id="gl-mastery"></div>
      <p class="gl-done-where"${en}>${p.title}&nbsp;· ${tp.title}</p>
      <h1 id="gl-done-h">${tIn(t, 'grammarLab.done.heading', { topic: tp.title }, 'topic')}</h1>
      <p class="gl-lead" id="gl-done-n"></p>
      <p class="gl-done-acc" id="gl-done-acc" hidden></p>
      <p class="gl-done-also muted" id="gl-done-also"${also.length ? '' : raw(' hidden')}>${also.length ? tIn(t, 'grammarLab.topic.also', { units: also.join(', ') }, 'units') : ''}</p>
      ${guest ? guestBox(t, topicHref(p, tp.id), { id: 'gl-done-guest', hidden: true, won: true }) : ''}
      <p class="gl-done-go"><a class="btn btn-primary btn-big" id="gl-done-back" href="${unitHref(p)}">${tIn(t, 'grammarLab.done.back', { unit: p.title }, 'unit')}</a>
        <a class="btn gl-done-next" id="gl-done-next" href="#" hidden><span class="gl-next-k">${t('grammarLab.done.nextLabel')}</span><span class="gl-next-t"${en}></span></a>
        <a class="btn" id="gl-done-room" href="#" hidden>${t('grammarLab.room.open')}</a></p>
    </section>

    <dialog class="gl-dialog" id="gl-tip" aria-labelledby="gl-tip-h">
      <h2 id="gl-tip-h">${t('grammarLab.tip.heading')}</h2>
      <p>${t('grammarLab.tip.text', { word: tipWord })}</p>
      <div class="gl-stage gl-stage-tip" id="gl-tip-stage"></div>
      <p class="gl-dialog-go"><button type="button" class="btn btn-primary" id="gl-tip-ok">${t('grammarLab.tip.ok')}</button></p>
    </dialog>
    <dialog class="gl-dialog" id="gl-levels" aria-labelledby="gl-levels-h">
      <h2 id="gl-levels-h">${t('grammarLab.levels.heading')}</h2>
      <p id="gl-levels-now"></p>
      <p>${t('grammarLab.levels.rule')}</p>
      <p>${t('grammarLab.levels.mastery', { total: tp.levels.length })}</p>
      <p class="gl-dialog-go"><button type="button" class="btn btn-primary" id="gl-levels-ok">${t('grammarLab.levels.close')}</button></p>
    </dialog>
    <dialog class="gl-dialog" id="gl-flagbox" aria-labelledby="gl-flag-h">
      <h2 id="gl-flag-h">${t('grammarLab.flag.heading')}</h2>
      <p>${t('grammarLab.flag.text')}</p>
      <p class="gl-dialog-go"><button type="button" class="btn" id="gl-flag-no">${t('grammarLab.flag.cancel')}</button>
        <button type="button" class="btn btn-primary" id="gl-flag-yes">${t('grammarLab.flag.send')}</button></p>
    </dialog>
    <dialog class="gl-sheet" id="gl-cardsheet" aria-labelledby="gl-card-h">
      <div class="gl-sheet-bar"><button type="button" class="btn btn-sm gl-sheet-x" id="gl-sheet-x">${t('grammarLab.card.close')}</button></div>
      <div class="gl-sheet-body" id="gl-sheet-body"></div>
    </dialog>
    <div class="gl-bubble" id="gl-bubble" role="tooltip" hidden></div>
    ${jsonData('page-data', data)}
  </div>`;
}

/** The teaching card itself: its title, the read-aloud button (when the voice is on) and its body. The practice page
 *  shows it as the lesson's step before the questions, then moves it into the sheet over the questions
 *  (public/js/grammar-lab.js); the card page shows it on its own. */
function cardArticle(t, tp, listen, { h = 'h2' } = {}) {
  return html`<article class="gl-card" id="gl-card" aria-labelledby="gl-card-h">
      ${h === 'h1' ? html`<p class="gl-label">${t('grammarLab.card.heading')}</p><h1 id="gl-card-h"${en}>${tp.title}</h1>` : html`<h2 class="gl-card-h" id="gl-card-h"${en}>${tp.title}</h2>`}
      ${listen ? html`<p><button type="button" class="btn gl-listen" id="gl-listen" hidden aria-pressed="false"><span aria-hidden="true">🔊</span> <span class="lbl">${t('grammarLab.card.listen')}</span></button></p>` : ''}
      ${cardBody(t, tp)}
    </article>`;
}
/** The teaching card on its own (from the topic's menu, or a direct link). */
export function cardPage({ t, p, tp, listen }) {
  return html`<div class="gl gl-cardpage ${bandClass(p.band)}">
    <p class="gl-crumb"><a href="${unitHref(p)}"${en}>${p.title}</a></p>
    ${cardArticle(t, tp, listen, { h: 'h1' })}
    <p class="gl-card-go"><a class="btn btn-primary btn-big" href="${topicHref(p, tp.id)}">${t('grammarLab.card.practice')}</a></p>
    ${jsonData('page-data', { topic: tp.id, listen: !!listen, stop: t('grammarLab.card.stop'), listenLabel: t('grammarLab.card.listen') })}
  </div>`;
}

/** A sentence with its title in italics. */
function italicIn(text, title) {
  const at = text.indexOf(title);
  return at < 0 ? text : html`${text.slice(0, at)}<i class="gl-title">${title}</i>${text.slice(at + title.length)}`;
}
/** Look back at the questions of the last mastered run. */
export function reviewPage({ t, p, tp, list }) {
  return html`<div class="gl gl-reviewpage ${bandClass(p.band)}">
    <p class="gl-crumb"><a href="${unitHref(p)}"${en}>${p.title}</a></p>
    <h1>${t('grammarLab.review.heading')}</h1><p class="muted"${en}>${tp.title}</p>
    ${list.length ? html`<ol class="gl-review">${list.map(r => html`<li class="${r.ok ? 'gl-ok' : 'gl-fixed'}">
      <p class="gl-ex-text"${en}>${r.italic ? italicIn(r.text, r.italic) : marked(r.text, r.marks, t)}${r.note ? html` <span class="gl-badge"${en}>${r.note}</span>` : ''}</p>
      <p class="gl-review-s">${t(r.ok ? 'grammarLab.review.firstTry' : 'grammarLab.review.fixed')}</p></li>`)}</ol>`
      : html`<p>${t('grammarLab.review.none')}</p>`}
  </div>`;
}
