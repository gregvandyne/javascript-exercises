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
export const ROLES = Object.freeze(['adjective', 'noun', 'verb', 'adverb', 'pronoun', 'subject', 'article', 'conjunction', 'preposition']);
export const GLOSSARY = Object.freeze(['adjective', 'noun']);
const base = '/courses/grammar-lab';
export const unitHref = p => `${base}/${p.band}/${p.id}`;
export const topicHref = (p, id, what = '') => `${unitHref(p)}/${id}${what ? `/${what}` : ''}`;
const bandClass = b => `gl-band-${b}`;

/** A sentence with some of its words color-coded by job (the worked example and tips). */
function marked(text, marks, t) {
  const by = new Map(marks.map(m => [m.i, m.role]));
  return tokenize(text).map((w, i) => {
    const role = by.get(i);
    const word = role ? html`<span class="gl-mk gl-mk-${role}">${w.t}<span class="gl-mk-tag">${t(`grammarLab.roles.${role}`)}</span></span>` : w.t;
    return html`${i ? ' ' : ''}${w.pre}${word}${w.post}`;
  });
}
/** The teaching card's body (the card page and the hint's small card share it). small: the hint's short form. */
export function cardBody(t, tp, { small = false } = {}) {
  const c = tp.card;
  return html`<div class="gl-card-body${small ? ' gl-card-small' : ''}"${en}>
    <p class="gl-def">${c.definition}</p>
    ${c.example ? html`<div class="gl-example"><p class="gl-label">${t('grammarLab.card.example')}</p>
      <p class="gl-ex-text">${marked(c.example.text, c.example.marks, t)}</p><p class="gl-ex-note">${c.example.note}</p></div>` : ''}
    <p class="gl-how"><b>${t('grammarLab.card.how')}</b> ${c.how}</p>
    ${small ? '' : html`<div class="gl-tips"><p class="gl-label">${t('grammarLab.card.tips')}</p><ul>${c.tips.map(x => html`<li><span class="gl-ex-text">${marked(x.text, x.marks, t)}</span> <span class="gl-ex-note">${x.note}</span></li>`)}</ul></div>`}
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

/** The course page: each band with its cover and its units (rings from live topic states). */
export function coursePage({ t, list, guest, pending }) {
  return html`<div class="gl">
    <header class="gl-top"><h1>${t('grammarLab.title')}</h1><p class="muted">${t('grammarLab.sub')}</p></header>
    ${guest && pending ? guestBox(t, base, { won: true }) : ''}
    ${list.map(({ band, units }) => html`<section class="gl-bandsec ${bandClass(band.id)}" aria-labelledby="gl-band-${band.id}">
      <div class="gl-cover gla">${raw(art.cover(band.id))}</div>
      <h2 id="gl-band-${band.id}">${t('grammarLab.band', { grades: band.grades })}</h2>
      <ul class="gl-units">${units.map(({ p, prog }) => html`<li><a class="gl-unit" href="${unitHref(p)}" id="gl-unit-${p.id}">
        ${ring(t, prog)}
        <span class="gl-unit-t"><span class="gl-unit-name"${en}>${p.title}</span><span class="muted">${t('grammarLab.topicsN', { count: prog.total })}</span></span>
        <span class="gl-go flip" aria-hidden="true">→</span></a></li>`)}</ul>
    </section>`)}
  </div>`;
}
function ring(t, { done, total }) {
  const pct = total ? Math.round(done / total * 100) : 0;
  return html`<span class="gl-ring" role="img" aria-label="${t('grammarLab.ringLabel', { done, total })}" style="--p:${pct}"><span>${done}/${total}</span></span>`;
}

/** A unit: its topic tiles in order, each with its state and its options menu. */
export function unitPage({ t, p, states, guest }) {
  const prog = { done: states.filter(s => s.mastered).length, total: states.length };
  const pending = states.some(s => s.pending);
  return html`<div class="gl ${bandClass(p.band)}">
    <p class="gl-crumb"><a href="${base}">${t('grammarLab.allUnits')}</a></p>
    <header class="gl-unithead">${ring(t, prog)}<div><h1${en}>${p.title}</h1><p class="muted">${t('grammarLab.band', { grades: (GL.band(p.band) || {}).grades || '' })} · ${t('grammarLab.topicsN', { count: states.length })}</p></div></header>
    ${guest && pending ? guestBox(t, unitHref(p), { won: true }) : ''}
    <ol class="gl-topics">${states.map((s, i) => tile(t, p, s, i))}</ol>
  </div>`;
}
function tile(t, p, s, i) {
  const tp = s.topic, id = tp.id;
  const state = s.mastered ? 'mastered' : s.pending ? 'pending' : !s.open ? 'locked' : s.started ? 'started' : 'new';
  const after = !s.mastered;
  const item = (href, label, off) => (off ? html`<span class="gl-mi" role="menuitem" aria-disabled="true">${label}<small>${t('grammarLab.topic.afterMastery')}</small></span>` : html`<a class="gl-mi" role="menuitem" href="${href}">${label}</a>`);
  return html`<li class="gl-tile gl-${state}" id="gl-topic-${id}">
    ${s.open ? html`<a class="gl-tile-main" href="${topicHref(p, id)}">` : html`<span class="gl-tile-main" aria-disabled="true">`}
      <span class="gl-tile-n" aria-hidden="true">${s.mastered ? '✓' : i + 1}</span>
      <span class="gl-tile-t"><span class="gl-tile-name"${en}>${tp.title}</span>
        <span class="gl-tile-state">${t(`grammarLab.topic.${state}`)}</span></span>
    ${s.open ? raw('</a>') : raw('</span>')}
    <details class="gl-menu"><summary aria-label="${t('grammarLab.topic.options', { topic: tp.title })}"><span aria-hidden="true">⋯</span></summary>
      <div class="gl-menu-list" role="menu">
        ${item(topicHref(p, id, 'card'), t('grammarLab.topic.card'), false)}
        ${item(`${topicHref(p, id)}?again=1`, t('grammarLab.topic.again'), after)}
        ${item(topicHref(p, id, 'review'), t('grammarLab.topic.review'), after)}
      </div></details>
  </li>`;
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
      <p class="gl-sentence" id="gl-sentence"${en}></p>
      <div class="gl-notice" id="gl-notice" role="status" aria-live="polite" hidden></div>
      <div class="gl-actions">
        <button type="button" class="btn gl-hint-btn" id="gl-hint-btn" aria-expanded="false" aria-controls="gl-hint" hidden>${t('grammarLab.practice.hint')}</button>
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
        <a class="btn" id="gl-done-next" href="#" hidden></a></p>
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

/** Look back at the questions of the last mastered run. */
export function reviewPage({ t, p, tp, list }) {
  return html`<div class="gl gl-reviewpage ${bandClass(p.band)}">
    <p class="gl-crumb"><a href="${unitHref(p)}"${en}>${p.title}</a></p>
    <h1>${t('grammarLab.review.heading')}</h1><p class="muted"${en}>${tp.title}</p>
    ${list.length ? html`<ol class="gl-review">${list.map(r => html`<li class="${r.ok ? 'gl-ok' : 'gl-fixed'}">
      <p class="gl-ex-text"${en}>${marked(r.text, r.answer.map(i => ({ i, role: tp.card.example && tp.card.example.marks[0] ? tp.card.example.marks[0].role : 'adjective' })), t)}</p>
      <p class="gl-review-s">${t(r.ok ? 'grammarLab.review.firstTry' : 'grammarLab.review.fixed')}</p></li>`)}</ol>`
      : html`<p>${t('grammarLab.review.none')}</p>`}
  </div>`;
}
