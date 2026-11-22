// A figures step on the lesson page (services/figures-steps.js viewFor; routes/progress.js): each figure drawn on the
// server (the hidden parts left out), its question, and a blank with the unit (any sign) or its options to pick one. A student saves as they go and hands in
// once; then each question says right or not right and the score shows. The answer and worked lines show only when
// viewFor sent them (the teacher; a student once "Show answers after the due date" lets them). Every word is escaped.
import { html, raw } from './html.js';
import { ico } from './icon.js';

/** A currency unit goes before the blank ($ ___), every other unit after it (___ cm). */
const money = u => /^[$€£¥₹]$/.test(String(u || ''));
/** v: viewFor's result. student: { api } to answer (a student of the class), or null (the teacher's preview). */
export function figuresStepHtml(t, v, { student = null, stepId, showAnswers = false, dueSet = false, dueOver = false } = {}) {
  const locked = !student || v.handedIn;
  const mark = it => (it.right === true ? html`<span class="chip-s fs-mark ok">${ico('✅', { size: 18 })} ${t('figures.step.right')}</span>` : it.right === false ? html`<span class="chip-s fs-mark bad">${ico('❌', { size: 18 })} ${t('figures.step.notRight')}</span>` : '');
  // A number blank takes any sign: phones' decimal keypads often have no minus key, so a ± button flips the sign
  // (public/js/lesson-read.js). Every number question has it, so it never says whether an answer is negative.
  const numberBlank = it => html`<div class="fs-blank">${money(it.unit) ? html`<span class="fs-unit" dir="ltr">${it.unit}</span>` : ''}<label class="sr-only" for="fa-${stepId}-${it.n}">${t('figures.step.answerLabel', { n: it.n })}</label>
        <input class="input fs-in" id="fa-${stepId}-${it.n}" name="a${it.n - 1}" value="${it.typed}" maxlength="40" inputmode="decimal" autocomplete="off" spellcheck="false" dir="ltr" ${locked ? raw('readonly') : ''}>
        ${locked ? '' : html`<button class="btn btn-sm fs-sign" type="button" data-fs-sign="fa-${stepId}-${it.n}" aria-label="${t('figures.step.signLabel', { n: it.n })}" title="${t('figures.step.sign')}">±</button>`}
        ${it.unit && !money(it.unit) ? html`<span class="fs-unit" dir="ltr">${it.unit}</span>` : ''}
        ${mark(it)}</div>`;
  // A choice question: its options as radio buttons in a fieldset whose legend is the question (the arrow keys move
  // between them). The right one is marked only when viewFor sent it (correct).
  const choiceBlank = it => html`<fieldset class="fs-choices"${locked ? raw(' disabled') : ''}>
        <legend class="fs-text" dir="auto">${it.question || t('figures.print.noQuestion')}</legend>
        ${it.choices.map((c, k) => { const right = it.correct === k; return html`<label class="fs-opt${right ? ' fs-right' : ''}"><input type="radio" name="a${it.n - 1}" value="${String(k)}" ${it.typed === String(k) ? raw('checked') : ''}>
          <b class="fs-letter" aria-hidden="true">${String.fromCharCode(65 + k)}</b><span dir="auto">${c}</span>${right ? html` <span class="chip-s fs-mark ok">${ico('🔑', { size: 18 })} ${t('figures.step.rightOption')}</span>` : ''}</label>`; })}
        ${mark(it)}</fieldset>`;
  const q1 = it => html`<li class="fs-q" id="fq-${stepId}-${it.n}">
    <span class="fs-n" aria-hidden="true">${it.n}</span>
    <div class="fs-fig">${raw(it.svg)}</div>
    <div class="fs-body">
      ${it.type === 'choice' ? choiceBlank(it) : html`<p class="fs-text" dir="auto">${it.question || t('figures.print.noQuestion')}</p>${numberBlank(it)}`}
      ${it.answer !== undefined ? html`<div class="fs-key"><p><b>${student ? t('figures.step.answer') : t('figures.step.teacherAnswer')}</b> <span dir="auto">${it.answer}</span></p>
        ${it.work && it.work.length ? html`<ul class="fs-work">${it.work.map(w => html`<li dir="auto">${w}</li>`)}</ul>` : ''}</div>` : ''}
    </div></li>`;
  const list = html`<ol class="plain fs-list">${v.items.map(q1)}</ol>`;
  const pct = v.total ? Math.round((100 * v.right) / v.total) : 0;
  const after = student && v.handedIn ? html`<p class="sc-score fs-score">${ico('🏆', { size: 18 })} ${t('figures.step.score', { right: v.right, total: v.total, pct })}</p>
    ${!v.revealed ? html`<p class="small muted">${showAnswers && dueSet ? t('figures.step.answersLater') : t('figures.step.noAnswers')}</p>` : ''}` : '';
  if (!student) return html`<section class="fs-step" aria-label="${t('lessons.kinds.figures')}"><p class="notice small">${ico('👀', { size: 18 })} ${t('figures.step.teacherNote')} ${showAnswers ? t('figures.step.showOnNote') : t('figures.step.showOffNote')}</p>${list}</section>`;
  if (v.handedIn) return html`<section class="fs-step" aria-label="${t('lessons.kinds.figures')}">${after}${list}</section>`;
  return html`<section class="fs-step" aria-label="${t('lessons.kinds.figures')}">
    <form class="fs-form" data-api="${student.api}" data-reload novalidate>
      ${list}
      <p class="small muted">${t('figures.step.handInHint')}</p>
      ${showAnswers && dueOver ? html`<p class="notice small">${ico('🔑', { size: 18 })} ${t('figures.step.answersReady')}</p>` : ''}
      <p class="err form-err" aria-live="polite"></p>
      <div class="row"><button class="btn" type="submit" name="hand" value="0">${ico('💾', { size: 18 })} ${t('figures.step.save')}</button>
        <button class="btn btn-primary" type="submit" name="hand" value="1" data-confirm="${t('figures.step.handInConfirm')}">${ico('📤', { size: 18 })} ${t('figures.step.handIn')}</button></div>
    </form></section>`;
}
