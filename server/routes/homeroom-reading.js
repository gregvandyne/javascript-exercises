// A Reading handout's results page (docs/decisions.md "Homeroom: reading from the desk"; services/homeroom-reading.js):
// the class's Progress page for that class lesson (the Classroom view's column header links here). Every student it
// went to, alphabetical and never ranked: the book they read, where they are in the routine (Reading p. 12, Quiz,
// Notes, Done) and the quiz's first-try result. Their 3 notes are a page in their notebook, which the class's teachers
// read from the student's desk menu in Homeroom. Registered with services/lessons.js onStoryResults, so routes/progress.js
// names nothing of Homeroom.
import { html, raw } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, VERSION } from '../views/layout.js';
import { emptyState } from '../views/components.js';
import * as L from '../services/lessons.js';
import * as S from '../services/schools.js';
import * as HR from '../services/homeroom-reading.js';
import { classHeader } from './schools.js';
import { dueChip } from './lessons.js';

const STEP_ICON = { choose: '📚', read: '📖', quiz: '🧩', notes: '📝', done: '✅' };
/** "Reading p. 12" / "Quiz" / "Notes" / "Done" (and "Picking a book" for their own choice not made yet). */
export const stepText = (t, x) => (x.step === 'read' ? (x.page ? t('homeroom.reading.step.readingPage', { page: x.page, pages: x.pages }) : t('homeroom.reading.step.notStarted')) : t(`homeroom.reading.step.${x.step}`));

export function readingResultsPage(req, res, c, cl) {
  if (!HR.isReading(cl.id) || !S.canManageClass(req.user, c)) return false;
  const t = req.t, f = req.fmt, list = HR.resultsOf(c, cl.id) || [], l = L.getLesson(cl.lesson_id);
  const done = list.filter(x => x.step === 'done').length, started = list.filter(x => x.step !== 'choose' && (x.step !== 'read' || x.page)).length;
  const body = html`${classHeader(req, c, 'progress')}
  <div class="lphead"><div><h2 dir="auto">${ico('📖', { size: 28 })} ${l.title}</h2>
    <p class="muted lp-meta"><span>${t('homeroom.reading.results.summary', { started, done, total: list.length })}</span>${dueChip(t, f, cl, { done: list.length > 0 && done >= list.length })}</p>
    <p class="small muted">${t('homeroom.reading.results.lead')}</p></div></div>
  ${!list.length ? html`<section class="panel">${emptyState({ emoji: '👩‍🎓', title: t('progress.gradebook.noStudents'), text: t('progress.gradebook.noStudentsText') })}</section>`
    : html`<section class="panel"><div class="gbwrap" tabindex="0" role="region" aria-label="${l.title}"><table class="tbl lr-table" id="rd-results">
      <thead><tr><th scope="col">${t('school.people.name')}</th><th scope="col">${t('homeroom.reading.results.book')}</th><th scope="col">${t('homeroom.reading.results.step')}</th><th scope="col">${t('homeroom.reading.results.quiz')}</th></tr></thead>
      <tbody>${list.map(x => html`<tr data-step="${x.step}"><th scope="row" class="gb-name"><bdi>${x.name}</bdi></th>
        <td>${x.book ? html`<span dir="auto">${x.book.title}</span>` : html`<span class="muted">${t('homeroom.reading.results.noBook')}</span>`}</td>
        <td><span class="lr-read${x.step === 'done' ? ' is-done' : ''}">${ico(STEP_ICON[x.step], { size: 18 })} ${stepText(t, x)}</span></td>
        <td>${x.total ? html`<b dir="ltr">${t('library.results.rightOf', { right: x.right, total: x.total })}</b>` : html`<span class="muted">–</span>`}</td></tr>`)}</tbody></table></div>
      <p class="small muted gb-key">${t('homeroom.reading.results.notes')}</p></section>`}`;
  page(req, res, { title: `${l.title} · ${c.name}`, active: 'classes', body, head: raw(`<link rel="stylesheet" href="/css/community.css?v=${VERSION}"><link rel="stylesheet" href="/css/schools.css?v=${VERSION}"><link rel="stylesheet" href="/css/library.css?v=${VERSION}">`), scripts: ['/js/schools.js'], back: `/class/${c.id}/progress`, backLabel: t('progress.gradebook.title') });
  return true;
}
L.onStoryResults(readingResultsPage);
