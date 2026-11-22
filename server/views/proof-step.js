// A graded Mistake Hunt step on the lesson page and the lesson's progress page (services/proof-steps.js; routes/progress.js).
// Students open it in the game (the passages, tap to fix, Save, Hand in); here they see where they are and, once handed
// in, their score. The teacher's progress panel: how many handed in, the share found, counts per kind of mistake (found
// and missed, never a ranking), each student's result in roster order, and "Show answers after the due date". Every word
// is escaped.
import { html, raw } from './html.js';
import { ico } from './icon.js';
import { proofT } from '../services/proof-core.js';

/** The kind of mistake's name in the viewer's language (the game's own word table). */
export const kindName = (lang, k) => proofT(lang)(`ty.${k}`);

/** The student's card body. v: viewFor's result; href: the game's link with the lesson context. */
export function proofStudentHtml(t, v, { href, showAnswers = false, dueSet = false, dueOver = false }) {
  if (v.handedIn) {
    const pct = v.total ? Math.round((100 * v.found) / v.total) : 0;
    return html`<section class="pf-step" aria-label="${t('lessons.kinds.proofread')}">
      <p class="sc-score pf-score">${ico('🏆', { size: 18 })} ${t('proof.step.score', { found: v.found, total: v.total, pct })}</p>
      ${v.revealed ? html`<div class="row"><a class="btn btn-primary" href="${href}">${ico('🔑', { size: 18 })} ${t('proof.step.seeAnswers')}</a></div>`
        : html`<p class="small muted">${showAnswers && dueSet ? t('proof.step.answersLater') : t('proof.step.noAnswers')}</p><div class="row"><a class="btn" href="${href}">${ico('👀', { size: 18 })} ${t('proof.step.seeWork')}</a></div>`}
    </section>`;
  }
  const started = v.edits.some(e => e.length);
  return html`<section class="pf-step" aria-label="${t('lessons.kinds.proofread')}">
    <p class="small muted">${t('proof.step.passagesN', { count: v.passages.length })} · ${t('proof.step.handInHint')}</p>
    ${showAnswers && dueOver ? html`<p class="notice small">${ico('🔑', { size: 18 })} ${t('proof.step.answersReady')}</p>` : ''}
    <div class="row"><a class="btn btn-primary btn-big" href="${href}">▶ ${t(started ? 'proof.step.keepGoing' : 'proof.step.start')}</a></div>
  </section>`;
}

/** The teacher's preview on the class's lesson page: what the step holds, and the answers rule. */
export function proofTeacherHtml(t, v, { showAnswers = false, lang = 'en' }) {
  return html`<section class="pf-step" aria-label="${t('lessons.kinds.proofread')}">
    <p class="notice small">${ico('👀', { size: 18 })} ${t('proof.step.teacherNote')} ${showAnswers ? t('figures.step.showOnNote') : t('figures.step.showOffNote')}</p>
    <ol class="pf-plist">${(v.key || []).map((p, i) => html`<li><b dir="auto">${v.passages[i].t || t('proof.step.passageN', { n: i + 1 })}</b>
      <span class="small muted">${t('proof.step.mistakesN', { count: p.m.length })}</span>
      <span class="small muted" lang="en" dir="ltr">${[...new Set(p.m.map(m => kindName(lang, m.k)))].join(', ')}</span></li>`)}</ol>
  </section>`;
}

/**
 * The lesson progress page's panel for one proofread step.
 * totals: typeTotals(); rows: [{ p (student), result: resultOf() | null }] in roster order.
 */
export function proofResultsHtml(t, { step, cl, totals, rows, studentsN, lang = 'en', nameOf, insight = '' }) {
  const bar = x => { const all = x.found + x.missed, w = all ? Math.round((100 * x.found) / all) : 0;
    return html`<div class="pf-bar" role="img" aria-label="${t('proof.step.foundMissed', { found: x.found, missed: x.missed })}"><span style="${raw(`width:${w}%`)}"></span></div>`; };
  return html`<section class="panel answers pf-results" id="pr-${step.id}" aria-labelledby="pr-h-${step.id}"><h2 id="pr-h-${step.id}">${ico('🔎', { size: 28 })} ${step.title || t('lessons.kinds.proofread')}</h2>
    <form class="fs-show" data-api="/api/progress/${cl.id}/${step.id}/show-answers" data-reload novalidate>
      <label class="chk"><input type="checkbox" name="on" value="1" ${step.show_answers ? raw('checked') : ''} ${cl.due_at ? '' : raw('disabled')}> <b>${t('figures.step.showAnswers')}</b></label>
      <p class="small muted">${cl.due_at ? t('proof.step.showAnswersHint') : t('figures.step.showNeedsDue')}</p>
      ${cl.due_at ? html`<div class="row"><button class="btn btn-sm" type="submit">${t('school.save')}</button></div>` : ''}<p class="err form-err" aria-live="polite"></p></form>
    <div class="pf-stats"><p><b>${t('proof.step.handedInOf', { done: totals.handed, total: studentsN })}</b></p>${totals.foundPct !== null ? html`<p><b dir="ltr">${totals.foundPct}%</b> ${t('proof.step.ofFound')}</p>` : ''}</div>
    ${insight}
    ${totals.handed ? html`<h3>${t('proof.step.byKind')}</h3><p class="small muted">${t('proof.step.byKindHint')}</p>
      <ul class="plain pf-kinds">${totals.kinds.map(x => html`<li><div class="pf-kline"><span>${kindName(lang, x.k)} <span class="small muted" lang="en" dir="ltr">${x.cc}</span></span><span class="small">${t('proof.step.foundMissed', { found: x.found, missed: x.missed })}</span></div>${bar(x)}</li>`)}</ul>
      <div class="gbwrap" tabindex="0" role="region" aria-label="${t('proof.step.studentsTable')}"><table class="tbl gradebook pf-table"><thead><tr><th scope="col" class="gb-name">${t('school.people.name')}</th><th scope="col">${t('proof.step.found')}</th><th scope="col">${t('proof.step.changed')}</th><th scope="col">${t('gradebook.score')}</th></tr></thead>
      <tbody>${rows.map(({ p, result }) => html`<tr><th scope="row" class="gb-name">${nameOf(p)}</th>${result ? html`<td dir="ltr">${result.found}/${result.total}</td><td dir="ltr">${result.changed}</td><td><b dir="ltr">${result.score}%</b></td>` : html`<td colspan="3"><span class="muted">${t('proof.step.notYet')}</span></td>`}</tr>`)}</tbody></table></div>
      <p class="small muted">${t('proof.step.changedHint')}</p>`
      : html`<p class="muted">${t('figures.step.noneYet')}</p>`}
  </section>`;
}

/** The Oomba mark (public/icons/icon.svg): the yellow square with its two eyes. */
const mark = size => raw(`<svg class="pf-mark" width="${size}" height="${size}" viewBox="0 0 240 240" aria-hidden="true" focusable="false"><rect width="240" height="240" rx="56" fill="#FFD23F"/><g fill="none" stroke="#141414" stroke-width="30"><circle cx="66" cy="120" r="36"/><circle cx="178" cy="120" r="36"/></g><g fill="#141414"><circle cx="73" cy="114" r="13"/><circle cx="185" cy="114" r="13"/></g></svg>`);

/**
 * "Oomba's read" (Mistake Hunt, Phase 3; services/proof-insights.js card()): which kinds the class missed most and one or
 * two teaching ideas. c: the card's facts ({ access, facts, summary, insight, stale }); plans: paid plans on (the trial
 * link). With the plan and something handed in: Oomba's fresh read, or the read from the numbers and "Ask Oomba".
 */
export function proofInsightHtml(t, c, { cl, step, plans = false }) {
  if (!c) return '';
  const head = html`<h3 class="pf-ins-h">${mark(26)} ${t('proof.insight.title')}</h3>`;
  if (c.access === 'plan') {
    return html`<div class="pf-insight" id="pi-${step.id}">${head}<p class="small">${t('proof.insight.planNote')}</p>
      ${plans ? html`<div class="row"><a class="btn btn-sm" href="/trial">${t('proof.insight.tryPlan')}</a></div>` : ''}</div>`;
  }
  const f = c.facts;
  if (!f.handed) return html`<div class="pf-insight" id="pi-${step.id}">${head}<p class="small muted">${t('proof.insight.noneYet')}</p></div>`;
  const ai = c.insight;
  const body = ai ? html`<p>${ai.read}</p>${ai.tips.length ? html`<ul class="pf-tips">${ai.tips.map(x => html`<li>${x}</li>`)}</ul>` : ''}
      <p class="small muted">${t('proof.insight.aiNote')}</p>`
    : html`${c.summary.lines.map(x => html`<p>${x}</p>`)}${c.summary.tips.length ? html`<ul class="pf-tips">${c.summary.tips.map(x => html`<li>${x}</li>`)}</ul>` : ''}
      ${c.stale ? html`<p class="small muted">${t('proof.insight.stale')}</p>` : ''}
      <form class="pf-ask" data-api="/api/proof/insights/${cl.id}/${step.id}" data-reload novalidate>
        <button class="btn btn-sm" type="submit" id="pi-ask-${step.id}">${mark(20)} ${t('proof.insight.ask')}</button>
        <span class="small muted">${t('proof.insight.privacy')}</span><p class="err form-err" aria-live="polite"></p></form>`;
  return html`<div class="pf-insight${ai ? ' is-ai' : ''}" id="pi-${step.id}" aria-live="polite">${head}${body}</div>`;
}
