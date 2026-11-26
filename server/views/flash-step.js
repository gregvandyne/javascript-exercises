// A Flashcards set on a lesson's progress page (services/flash-progress.js summary; routes/progress.js): how far each
// student is (cards mastered, learning, missed last time, not studied yet, in roster order, never ranked) and the cards
// the class missed most, so the teacher knows what to reteach. Every word is escaped.
import { html, raw } from './html.js';
import { ico } from './icon.js';

/** One student's cards as a small stacked bar (mastered, learning, missed, not studied), with the same words for a
 *  screen reader. */
function bar(t, r, n) {
  const w = k => `width:${n ? (100 * r[k]) / n : 0}%`;
  const label = t('flash.results.barLabel', { mastered: r.mastered, learning: r.learning, missed: r.missed, fresh: r.fresh });
  return html`<div class="fc-bar" role="img" aria-label="${label}"><span class="fc-b3" style="${raw(w('mastered'))}"></span><span class="fc-b1" style="${raw(w('learning'))}"></span><span class="fc-b0" style="${raw(w('missed'))}"></span></div>`;
}

export function flashResultsHtml(t, { step, sum, rows, studentsN, nameOf }) {
  const top = sum.cards.slice(0, 10);
  return html`<section class="panel answers fc-results" id="fc-${step.id}" aria-labelledby="fc-h-${step.id}"><h2 id="fc-h-${step.id}">${ico('🗂️', { size: 28 })} ${step.title || t('flash.results.title')}</h2>
    <p class="small muted">${t('flash.results.note')}</p>
    <p><b>${t('flash.results.studied', { done: sum.studied, total: studentsN })}</b></p>
    ${top.length ? html`<h3>${t('flash.results.missedTitle')}</h3><p class="small muted">${t('flash.results.missedHint')}</p>
      <ol class="plain fc-missed">${top.map(c => html`<li><span class="fc-term" dir="auto">${c.pic ? html`<span aria-hidden="true">${c.pic}</span> ` : ''}<b>${c.term}</b></span><span class="small muted fc-def" dir="auto">${c.def}</span><span class="small fc-n">${t('flash.results.missedBy', { misses: c.misses, students: c.students })}</span></li>`)}</ol>`
      : html`<p class="muted">${t('flash.results.missedNone')}</p>`}
    <div class="gbwrap" tabindex="0" role="region" aria-label="${t('flash.results.table')}"><table class="tbl gradebook fc-table"><thead><tr><th scope="col" class="gb-name">${t('school.people.name')}</th><th scope="col">${t('flash.results.mastered')}</th><th scope="col">${t('flash.results.learning')}</th><th scope="col">${t('flash.results.missed')}</th><th scope="col">${t('flash.results.fresh')}</th><th scope="col"><span class="sr-only">${t('flash.results.progress')}</span></th></tr></thead>
      <tbody>${rows.map(({ p, r }) => html`<tr><th scope="row" class="gb-name">${nameOf(p)}</th>${r.started && r.fresh < sum.n ? html`<td dir="ltr">${r.mastered}/${sum.n}</td><td dir="ltr">${r.learning}</td><td dir="ltr">${r.missed}</td><td dir="ltr">${r.fresh}</td><td>${bar(t, r, sum.n)}</td>` : html`<td colspan="5" class="muted">${t('flash.results.notYet')}</td>`}</tr>`)}</tbody></table></div>
    <p class="small muted fc-key"><span><i class="fc-dot fc-b3"></i> ${t('flash.results.mastered')}</span> <span><i class="fc-dot fc-b1"></i> ${t('flash.results.learning')}</span> <span><i class="fc-dot fc-b0"></i> ${t('flash.results.missed')}</span></p>
  </section>`;
}
