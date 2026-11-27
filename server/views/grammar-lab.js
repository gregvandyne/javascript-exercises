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
const en = raw(' lang="en" dir="ltr"');
export const ROLES = Object.freeze(['adjective', 'noun', 'verb', 'adverb', 'pronoun', 'subject', 'article', 'conjunction', 'preposition', 'capital', 'comma']);
export const GLOSSARY = Object.freeze(['adjective', 'noun']);
const base = '/courses/grammar-lab';
export const unitHref = p => `${base}/${p.band}/${p.id}`;
export const topicHref = (p, id, what = '') => `${unitHref(p)}/${id}${what ? `/${what}` : ''}`;
const bandClass = b => `gl-band-${b}`;

/** A sentence with some of its words color-coded by job (the worked example and tips). A 'comma' mark highlights the
 *  comma after its word; a 'key' mark highlights the word with no label. */
function marked(text, marks, t) {
  const by = new Map((marks || []).map(m => [m.i, m.role]));
  return tokenize(text).map((w, i) => {
    const role = by.get(i);
    if (role === 'comma') {
      const [c, ...rest] = w.post;
      return html`${i ? ' ' : ''}<span class="gl-tok">${w.pre}${w.t}<span class="gl-mk gl-mk-comma">${c}<span class="gl-mk-tag">${t('grammarLab.roles.comma')}</span></span>${rest.join('')}</span>`;
    }
    const word = role === 'key' ? html`<span class="gl-mk gl-mk-key">${w.t}</span>`
      : role ? html`<span class="gl-mk gl-mk-${role}">${w.t}<span class="gl-mk-tag">${t(`grammarLab.roles.${role}`)}</span></span>` : w.t;
    // (a word and its marks as one piece: a line never starts with a mark)
    return html`${i ? ' ' : ''}<span class="gl-tok">${w.pre}${word}${w.post}</span>`;
  });
}
/** One example as written: its lead-in, the example sentence, its note and (a fix's) the sentence after. Titles are
 *  shown in italics, never in quotes. */
function exampleUnit(t, u, { italic = false, tag = 'p' } = {}) {
  const sent = (x, m) => (italic ? html`<i class="gl-title">${marked(x, m, t)}</i>` : marked(x, m, t));
  const inner = html`${u.lead ? html`<span class="gl-ex-lead">${u.lead}</span> ` : ''}<span class="gl-ex-text">${sent(u.text, u.marks)}</span>${u.note ? html` <span class="gl-ex-note">${u.note}</span>` : ''}${u.then ? html` <span class="gl-ex-text gl-ex-then">${sent(u.then.text, u.then.marks)}</span>${u.then.note ? html` <span class="gl-ex-note">${u.then.note}</span>` : ''}` : ''}`;
  return tag === 'li' ? html`<li class="gl-ex">${inner}</li>` : html`<p class="gl-ex">${inner}</p>`;
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
function bandSection(t, { band, units }, { yours = false, folded = false } = {}) {
  const inner = html`<div class="gl-cover gla">${raw(art.cover(band.id))}</div>
      <h2 id="gl-band-${band.id}">${t('grammarLab.band', { grades: band.grades })}${yours ? html` <span class="gl-badge gl-badge-yours">${t('grammarLab.place.yours')}</span>` : ''}</h2>
      <ul class="gl-units">${units.map(({ p, prog, assigned }) => html`<li><a class="gl-unit" href="${unitHref(p)}" id="gl-unit-${p.id}">
        ${ring(t, prog)}
        <span class="gl-unit-t"><span class="gl-unit-name"${en}>${p.title}</span><span class="muted">${t('grammarLab.topicsN', { count: prog.total })}${assigned ? html` · ${t('grammarLab.assigned.badge')}` : ''}</span></span>
        <span class="gl-go flip" aria-hidden="true">→</span></a></li>`)}</ul>`;
  return folded ? html`<details class="gl-bandsec gl-bandfold ${bandClass(band.id)}" id="gl-sec-${band.id}"><summary><span class="gl-fold-h">${t('grammarLab.band', { grades: band.grades })}</span><span class="muted">${t('grammarLab.unitsN', { count: units.length })}</span></summary>${inner}</details>`
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
  const pending = states.some(s => s.pending);
  return html`<div class="gl ${bandClass(p.band)}">
    <p class="gl-crumb"><a href="${base}">${t('grammarLab.allUnits')}</a></p>
    <header class="gl-unithead">${ring(t, prog)}<div><h1${en}>${p.title}</h1><p class="muted">${t('grammarLab.band', { grades: (GL.band(p.band) || {}).grades || '' })} · ${t('grammarLab.topicsN', { count: states.length })}</p></div></header>
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
        <span class="gl-tile-state">${t(`grammarLab.topic.${state}`)}</span>
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

/** A topic's practice: every screen of the flow, shown one at a time by public/js/grammar-lab.js. */
export function practicePage({ t, p, tp, data, guest }) {
  const tipWord = t('grammarLab.glossaryWord.adjective');
  return html`<div class="gl gl-practice ${bandClass(p.band)}" data-band="${p.band}">
    <header class="gl-qhead">
      <a class="gl-qback" href="${unitHref(p)}" aria-label="${t('grammarLab.backTo', { unit: p.title })}"><span class="flip" aria-hidden="true">←</span></a>
      <div class="gl-qtitle"><span class="gl-qunit"${en}>${p.title}</span><span class="gl-qtopic"${en}>${tp.title}</span></div>
      <span class="gl-dots" id="gl-dots" role="img" aria-label="" hidden><i></i><i></i><i></i></span>
      <button type="button" class="btn btn-sm gl-hbtn" id="gl-levels-btn" aria-haspopup="dialog" hidden></button>
      <button type="button" class="btn btn-sm gl-hbtn gl-ibtn" id="gl-tip-btn" aria-label="${t('grammarLab.practice.tip')}" title="${t('grammarLab.practice.tip')}"><span aria-hidden="true">?</span></button>
      <a class="btn btn-sm gl-hbtn" href="${topicHref(p, tp.id, 'card')}">${t('grammarLab.practice.card')}</a>
    </header>
    <div class="gl-meter" id="gl-meter" hidden><p class="gl-counter" id="gl-counter"></p><ol class="gl-bar" id="gl-bar" aria-hidden="true"></ol></div>
    <noscript><p class="notice warn">${t('grammarLab.noscript')}</p></noscript>

    <section class="gl-screen gl-welcome" id="gl-welcome" hidden aria-labelledby="gl-welcome-h">
      <button type="button" class="btn btn-ghost btn-sm gl-skip" id="gl-skip">${t('grammarLab.welcome.skip')}</button>
      <div class="gl-welcome-art"><div class="gl-stage gl-stage-door" id="gl-door"></div><div class="gl-stage gl-stage-greet" id="gl-greet"></div></div>
      <h1 id="gl-welcome-h">${t('grammarLab.welcome.heading', { topic: tp.title })}</h1>
      <p class="gl-lead">${t('grammarLab.welcome.text')}</p>
      <button type="button" class="btn btn-primary btn-big" id="gl-go">${t('grammarLab.welcome.go')}</button>
    </section>

    <section class="gl-screen gl-quiz" id="gl-quiz" hidden aria-label="${tp.title}">
      <div class="gl-qtop"><p class="gl-ask" id="gl-ask"${en}></p>
        <p class="gl-streak" id="gl-streak"><span class="gl-pips" aria-hidden="true"><i></i><i></i></span><span class="gl-streak-t" id="gl-streak-t"></span></p></div>
      <p class="gl-prompt" id="gl-prompt" hidden${en}></p>
      <div class="gl-chips" id="gl-chips" role="radiogroup" aria-label="${t('grammarLab.practice.chips')}" hidden></div>
      <p class="gl-sentence" id="gl-sentence"${en}></p>
      <div class="gl-fixbox" id="gl-fixbox" hidden><label class="gl-label" for="gl-fix">${t('grammarLab.practice.fixLabel')}</label>
        <textarea class="gl-fix" id="gl-fix" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"${en}></textarea></div>
      <div class="gl-options" id="gl-options" role="radiogroup" aria-labelledby="gl-ask" hidden${en}></div>
      <div class="gl-notice" id="gl-notice" role="status" aria-live="polite" hidden></div>
      <div class="gl-actions">
        <button type="button" class="btn gl-hint-btn" id="gl-hint-btn" aria-expanded="false" aria-controls="gl-hint" hidden>${t('grammarLab.practice.hint')}</button>
        <button type="button" class="btn gl-asis" id="gl-asis" aria-pressed="false" hidden>${t('grammarLab.practice.asIs')}</button>
        <button type="button" class="btn btn-primary btn-big gl-submit" id="gl-submit" disabled>${t('grammarLab.practice.submit')}</button>
      </div>
      <aside class="gl-hint" id="gl-hint" hidden aria-labelledby="gl-hint-h">
        <p class="gl-hint-h" id="gl-hint-h">${t('grammarLab.practice.hintTitle')}</p>
        <p class="gl-hint-text" id="gl-hint-text"${en}></p>
        ${cardBody(t, tp, { small: true })}
      </aside>
      <p class="gl-flag"><button type="button" class="linkish" id="gl-flag">${t('grammarLab.practice.flag')}</button></p>
    </section>

    <div class="gl-flash" id="gl-correct" hidden role="status"><div><span class="gl-check" aria-hidden="true">✓</span><p>${t('grammarLab.practice.correct')}</p></div></div>

    <div class="gl-overlay" id="gl-level" hidden role="dialog" aria-modal="true" aria-labelledby="gl-level-h">
      <div class="gl-overlay-card">
        <p class="gl-stars" id="gl-level-stars" aria-hidden="true"><i></i><i></i><i></i></p>
        <div class="gl-stage gl-stage-greet" id="gl-level-greet"></div>
        <h2 id="gl-level-h"></h2>
        <p id="gl-level-text"></p>
        <button type="button" class="btn btn-primary btn-big" id="gl-level-next">${t('grammarLab.practice.levelNext')}</button>
      </div>
    </div>

    <section class="gl-screen gl-done" id="gl-done" hidden aria-labelledby="gl-done-h">
      <div class="gl-stage gl-stage-mastery" id="gl-mastery"></div>
      <p class="gl-done-where"${en}>${p.title} · ${tp.title}</p>
      <h1 id="gl-done-h">${t('grammarLab.done.heading', { topic: tp.title })}</h1>
      <p class="gl-lead" id="gl-done-n"></p>
      ${guest ? guestBox(t, topicHref(p, tp.id), { id: 'gl-done-guest', hidden: true, won: true }) : ''}
      <p class="gl-done-go"><a class="btn btn-primary btn-big" id="gl-done-back" href="${unitHref(p)}">${t('grammarLab.done.back', { unit: p.title })}</a>
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
    <div class="gl-bubble" id="gl-bubble" role="tooltip" hidden></div>
    ${jsonData('page-data', data)}
  </div>`;
}

/** The teaching card on its own (from the topic's menu, or the practice header). */
export function cardPage({ t, p, tp, listen }) {
  return html`<div class="gl gl-cardpage ${bandClass(p.band)}">
    <p class="gl-crumb"><a href="${unitHref(p)}"${en}>${p.title}</a></p>
    <article class="gl-card" aria-labelledby="gl-card-h">
      <p class="gl-label">${t('grammarLab.card.heading')}</p>
      <h1 id="gl-card-h"${en}>${tp.title}</h1>
      ${listen ? html`<p><button type="button" class="btn gl-listen" id="gl-listen" hidden aria-pressed="false"><span aria-hidden="true">🔊</span> <span class="lbl">${t('grammarLab.card.listen')}</span></button></p>` : ''}
      ${cardBody(t, tp)}
    </article>
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
