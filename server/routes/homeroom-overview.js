// The Classroom tab's overview at the top of Progress (Homeroom, step 2c; services/homeroom-overview.js), for Homeroom
// teachers of the class only (services/homeroom.js canUseClass); everyone else's Progress page is unchanged.
//   - a column per handout of the last 4 weeks: its name, kind and how it is graded. A teacher of the class taps the
//     header's grade chip to change it (POST /api/homeroom/:id/handouts/:clid/grade, public/js/homeroom-overview.js);
//     the name opens the lesson's results page (/class/:id/progress/:clid), as in the gradebook;
//   - when each handout is due under its name, and a calm "after due" (muted, never red) in a cell not finished past it;
//   - a row per student, alphabetical, never ranked; their name opens the student report;
//   - the trend, the three numbers, and the Google Classroom status line (linked course, roster last synced, grades last
//     sent, the link to the class's Google Classroom page).
// The full gradebook, CSV, standards, rubrics and Google Classroom page stay below and one tap away, unchanged.
import { html, jsonData } from '../views/html.js';
import { ico } from '../views/icon.js';
import { q } from '../db.js';
import * as H from '../services/homeroom.js';
import * as OV from '../services/homeroom-overview.js';
import * as GC from '../services/gclassroom.js';
import { studentHref } from './student-report.js';

const GRADE_ICON = { score: '🎯', completion: '✅', none: '🌱' };
const KIND_ICON = { lesson: '📄', game: '🎮', mine: '🛠️', reading: '📖' };

/** The Google Classroom status line (school staff while Classroom is on): linked course, roster last synced, grades last
 *  sent, and the class's Google Classroom page. '' when Classroom is off for this teacher. */
function gcLine(req, c) {
  if (!GC.enabled() || !GC.mayConnect(req.user)) return '';
  const t = req.t, f = req.fmt, lk = GC.linkOf(c.id), href = `/class/${c.id}/google-classroom`;
  if (!lk) return html`<p class="hv-gc off" id="hv-gc"><b>${ico('🎓', { size: 18 })} ${t('gclassroom.title')}</b> <span>${t('homeroom.overview.gcNotLinked')}</span> <a href="${href}">${t('homeroom.overview.gcLink')}</a></p>`;
  const sent = (q.get("SELECT MAX(grades_at) at FROM gc_posts WHERE class_id=? AND course_id=? AND kind='assignment'", c.id, lk.course_id) || {}).at || null;
  const bits = [t('homeroom.overview.gcLinked', { course: lk.course_name || '' }),
    lk.roster_at ? t('homeroom.overview.gcRoster', { when: f.ago(lk.roster_at) }) : t('homeroom.overview.gcRosterNever'),
    sent ? t('homeroom.overview.gcGrades', { when: f.ago(sent) }) : t('homeroom.overview.gcGradesNever')];
  return html`<p class="hv-gc" id="hv-gc"><b>${ico('🎓', { size: 18 })} ${t('gclassroom.title')}</b> ${bits.map((b, i) => html`${i ? html`<span aria-hidden="true"> · </span>` : ''}<span dir="auto">${b}</span>`)} <a href="${href}">${t('homeroom.overview.gcOpen')}</a></p>`;
}

function cellHtml(t, x) {
  switch (x.state) {
    case 'score': return html`<span class="hv-cell ${x.band}" dir="ltr">${x.pct}%</span>`;
    case 'done': return html`<span class="hv-cell ok">✓ ${t('homeroom.overview.done')}</span>`;
    case 'notDone': return html`<span class="hv-cell low">${t('homeroom.overview.notDone')}</span>`;
    case 'practice': return html`<span class="hv-cell na">${t('homeroom.overview.practice')}</span>`;
    case 'practiced': return html`<span class="hv-cell na">✓ ${t('homeroom.overview.practice')}</span>`;
    case 'locked': return html`<span class="hv-cell na" aria-hidden="true">🔒</span><span class="sr-only">${t('homeroom.overview.locked')}</span>`;
    case 'none': return html`<span class="hv-cell na" aria-hidden="true">–</span><span class="sr-only">${t('homeroom.overview.notStarted')}</span>`;
    default: return html`<span class="hv-cell na" aria-hidden="true">·</span><span class="sr-only">${t('gradebook.notAssigned')}</span>`;
  }
}
/** "Nov 28" or "Nov 28, 3:00 PM": when a handout is due (a stored day, and Homeroom's due time). */
export function dueText(f, due, dueMin) {
  const day = f.day(due, { weekday: 'short', month: 'short', day: 'numeric' });
  if (!Number.isInteger(dueMin)) return day;
  return `${day}, ${new Date(Date.UTC(2000, 0, 1, 0, dueMin)).toLocaleTimeString(f.intl, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })}`;
}
const TREND = { up: ['↗', 'improving'], steady: ['→', 'steady'], support: ['↘', 'support'] };

/** The overview panel for the Progress page, or '' for anyone Homeroom does not let into this class. */
export function classroomOverview(req, c) {
  if (!H.canUseClass(req.user, c)) return '';
  const t = req.t, ov = OV.overview(c, { locale: req.locale });
  const s = ov.summary;
  const gradeLabel = g => t(g === 'none' ? 'homeroom.overview.notGraded' : `homeroom.overview.gradedBy.${g}`);
  const head = col => html`<th scope="col" class="hv-col" data-clid="${col.id}">
      <a class="hv-title" href="/class/${c.id}/progress/${col.id}" dir="auto">${col.title}</a>
      <span class="hv-sub">${ico(KIND_ICON[col.kind], { size: 14 })} ${t(`homeroom.overview.kind.${col.kind}`)}${col.versions > 1 ? html` · ${t('homeroom.overview.versions', { count: col.versions })}` : ''}</span>
      ${col.due ? html`<span class="hv-due">${ico('📅', { size: 14 })} ${t('homeroom.overview.due', { when: dueText(req.fmt, col.due, col.dueMin) })}</span>` : ''}
      <button type="button" class="hv-grade" data-hvgrade="${col.id}" data-grade="${col.grade}" aria-haspopup="true" aria-label="${t('homeroom.overview.changeGrade', { title: col.title, grade: gradeLabel(col.grade) })}">${ico(GRADE_ICON[col.grade], { size: 14 })} ${gradeLabel(col.grade)}</button></th>`;
  const table = ov.columns.length && ov.students.length ? html`<div class="hv-wrap" tabindex="0" role="region" aria-label="${t('homeroom.overview.tableLabel')}"><table class="hv-table" id="hv-table">
    <thead><tr><th scope="col" class="hv-name">${t('homeroom.overview.student')}</th>${ov.columns.map(head)}<th scope="col" class="hv-trendh">${t('homeroom.overview.trend')}</th></tr></thead>
    <tbody>${ov.students.map(p => html`<tr><th scope="row" class="hv-name"><a href="${studentHref(c, p)}" dir="auto">${p.name}</a></th>
      ${p.cells.map(x => html`<td>${cellHtml(t, x)}${x.quiz ? html` <span class="hv-quiz small muted" dir="ltr">${t('homeroom.overview.quiz', { right: x.quiz.right, total: x.quiz.total })}</span>` : ''}${x.afterDue ? html` <span class="hv-after">${t('homeroom.overview.afterDue')}</span>` : ''}</td>`)}
      <td class="hv-trend${p.trend ? ` ${p.trend}` : ''}">${p.trend ? html`<span aria-hidden="true">${TREND[p.trend][0]}</span> ${t(`homeroom.overview.trends.${TREND[p.trend][1]}`)}` : html`<span class="muted">${t('homeroom.overview.trends.none')}</span>`}</td></tr>`)}</tbody></table></div>`
    : html`<p class="muted hv-empty">${ov.students.length ? t('homeroom.overview.noHandouts', { weeks: ov.weeks }) : t('progress.gradebook.noStudents')}</p>`;
  return html`<section class="panel hv" id="hr-overview" aria-labelledby="hv-h">
    ${jsonData('hv-data', { classId: c.id })}
    <div class="hv-top"><div class="hv-lead"><h2 id="hv-h">${ico('🌤️', { size: 28 })} ${t('homeroom.overview.title')}</h2>
      <p class="small muted">${t('homeroom.overview.lead', { weeks: ov.weeks })}</p>${gcLine(req, c)}</div>
      <div class="hv-sum">
        <div><b dir="ltr">${s.finishedPct === null ? '–' : `${s.finishedPct}%`}</b><span>${t('homeroom.overview.finished')}</span></div>
        <div><b>${s.support}</b><span>${t('homeroom.overview.support', { count: s.support })}</span></div>
        <div><b>${s.month}</b><span>${t('homeroom.overview.month', { count: s.month })}</span></div></div></div>
    ${table}
    ${ov.columns.length ? html`<p class="hv-key small"><span><b>${t('homeroom.overview.keyNames.score')}</b> ${t('homeroom.overview.keyScore')}</span><span><b>${t('homeroom.overview.keyNames.completion')}</b> ${t('homeroom.overview.keyCompletion')}</span><span><b>${t('homeroom.overview.keyNames.none')}</b> ${t('homeroom.overview.keyNone')}</span></p>
    <p class="hv-key small"><span>${t('homeroom.overview.keyTrend')}</span></p>` : ''}
    <p class="small muted hv-more">${t('homeroom.overview.more')} <a href="#gb">${t('homeroom.overview.fullGradebook')}</a> · <a href="/class/${c.id}/progress.csv" download>${t('progress.gradebook.csv')}</a></p>
  </section>`;
}
