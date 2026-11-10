// One student's page for the class's staff: /class/:id/student/:uid (docs/decisions.md "Real scores in the gradebook").
// Work done, Score (and what it is made of), late work, a standards summary, recent answers with feedback, live results.
// Who: someone who manages the class (its teachers, the school's admins: S.canManageClass, the gradebook's own rule) and
// only for an active student of that class; everyone else (other teachers, students, the student themself, kids, guests,
// grown-ups) gets the 404 page, signed-out visitors the sign-in page. Printable: the first name only unless the teacher
// ticks "Print the full name"; the name used in games is never printed; no prices, no other student on the page.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { avatar } from '../views/components.js';
import { requireUser } from '../auth.js';
import * as S from '../services/schools.js';
import * as SC from '../services/scores.js';
import { studentReport } from '../services/student-report.js';
import { classHeader } from './schools.js';
import { fwName } from '../views/standards.js';
import { liveOn } from '../services/classlive-sessions.js';

export const router = Router();
const CSS = raw(`<link rel="stylesheet" href="/css/community.css?v=${VERSION}"><link rel="stylesheet" href="/css/schools.css?v=${VERSION}">`);
export const studentHref = (c, p) => `/class/${c.id}/student/${p.id}`;
const SHORT = { month: 'short', day: 'numeric' };
const KIND_ICON = { quiz: '🧩', live: '📡', rubric: '📏', marks: '📏' };

router.get('/class/:id/student/:uid', requireUser, (req, res) => {
  const t = req.t, f = req.fmt;
  const c = S.getClass(String(req.params.id));
  if (!c || !S.canManageClass(req.user, c)) return notFound(req, res, t('progress.errors.notFound'));
  const rep = studentReport(c.id, String(req.params.uid));
  if (!rep) return notFound(req, res, t('progress.errors.notFound'));
  const p = rep.student, here = studentHref(c, p);
  // The roster name in two parts, so a print shows the first name alone unless the box is ticked. A student with no
  // roster name has only the name they use in games (never a real name), shown as it is.
  const real = (p.roster_name || '').trim(), gen = p.display_name || p.username;
  const [first, ...rest] = real.split(/\s+/);
  const name = real ? html`<span class="sp-first" dir="auto">${first}</span>${rest.length ? html`<span class="sp-rest" dir="auto"> ${rest.join(' ')}</span>` : ''}` : html`<span dir="auto">${gen}</span>`;
  const pts = sc => (sc ? html`<b dir="ltr">${sc.pct}%</b> <span class="small muted" dir="ltr">${SC.pointsText(sc.earned, sc.possible)}</span>` : html`<span class="muted" aria-hidden="true">–</span><span class="sr-only">${t('gradebook.noScore')}</span>`);
  const lateChip = x => (x.late ? html`<span class="chip-s bad">⏰ ${t('gradebook.student.late')}</span>` : x.lateDone ? html`<span class="chip-s bad">⏰ ${t('gradebook.doneLate')}</span>` : '');
  const stat = (label, value, sub = '') => html`<li class="sp-stat"><span class="sp-stat-v">${value}</span><span class="sp-stat-l">${label}</span>${sub ? html`<span class="small muted">${sub}</span>` : ''}</li>`;
  const itemTitle = it => (it.stepId ? it.title || t(`lessons.kinds.${it.stepKind === 'question' ? 'question' : it.stepKind || 'text'}`) : t('rubrics.attach.lessonTitle'));
  const scored = rep.lessons.filter(({ cell }) => !cell.locked && cell.items.length);
  const stepName = a => a.title || t(`lessons.kinds.${a.kind}`);
  const body = html`<div class="noprint">${classHeader(req, c, 'progress')}</div>
  <article class="printdoc sp-page" id="student-report">
    <div class="row printbar sp-tools"><a class="btn btn-sm" href="/class/${c.id}/progress">← ${t('gradebook.student.back')}</a>
      <label class="chk sp-fullname"><input type="checkbox" id="sp-full"> ${t('gradebook.student.printFull')}</label>
      <button class="btn btn-primary btn-sm" type="button" data-print>🖨️ ${t('gradebook.student.print')}</button></div>
    <p class="small muted noprint sp-printhint">${t('gradebook.student.printHint')}</p>
    <header class="sp-head"><span class="noprint">${avatar(p, 56)}</span><div><h2 class="sp-name">${name}</h2>
      <p class="muted sp-sub">${real && gen && gen !== real ? html`<span class="noprint">${t('gradebook.names.inGames')}: <bdi>${gen}</bdi> · </span>` : ''}<span dir="auto">${c.name}</span> · <span>${f.date(Date.now())}</span></p></div></header>
    <ul class="plain sp-stats">
      ${stat(t('gradebook.workDone'), rep.workDone === null ? '–' : html`<span dir="ltr">${rep.workDone}%</span>`)}
      ${stat(t('gradebook.score'), rep.score ? html`<span dir="ltr">${rep.score.pct}%</span>` : '–', rep.score ? html`<span dir="ltr">${SC.pointsText(rep.score.earned, rep.score.possible)}</span>` : t('gradebook.noScore'))}
      ${stat(t('gradebook.student.lateLessons'), f.int(rep.lateCount))}
      ${rep.toRead ? html`<li class="sp-stat noprint"><span class="sp-stat-v">${f.int(rep.toRead)}</span><span class="sp-stat-l">${t('progress.key.toRead')}</span></li>` : ''}
    </ul>
    <section class="panel" aria-labelledby="sp-lessons-h"><h2 id="sp-lessons-h">📚 ${t('school.classTabs.lessons')}</h2>
      ${rep.lessons.length ? html`<div class="gbwrap" tabindex="0" role="region" aria-labelledby="sp-lessons-h"><table class="tbl sp-table">
        <thead><tr><th scope="col">${t('gradebook.student.lesson')}</th><th scope="col">${t('gradebook.workDone')}</th><th scope="col">${t('gradebook.score')}</th><th scope="col">${t('gradebook.student.due')}</th></tr></thead>
        <tbody>${rep.lessons.map(({ cl, cell: x }) => html`<tr><th scope="row"><a href="/class/${c.id}/progress/${cl.id}#s-${p.id}" dir="auto">${cl.title}</a></th>
          <td data-label="${t('gradebook.workDone')}">${x.locked ? html`<span class="chip-s">🔒 ${t('lessons.class.opensOn', { date: f.day(cl.opens_at, SHORT) })}</span>` : html`<span class="gb-num" dir="ltr">${x.done}/${x.total}</span>`}</td>
          <td data-label="${t('gradebook.score')}">${x.locked ? html`<span class="muted">–</span>` : pts(x.score)}</td>
          <td data-label="${t('gradebook.student.due')}">${cl.due_at ? html`<span class="nw">${f.day(cl.due_at, SHORT)}</span> ` : html`<span class="muted">–</span>`}${lateChip(x)}</td></tr>`)}</tbody></table></div>`
        : html`<p class="muted">${t('progress.gradebook.noLessons')}</p>`}</section>
    <section class="panel" id="score" aria-labelledby="sp-score-h"><h2 id="sp-score-h">🎯 ${t('gradebook.student.scoreH')}</h2>
      <p class="small muted">${t('gradebook.help.score')}</p>
      ${scored.length ? html`<div class="gbwrap" tabindex="0" role="region" aria-labelledby="sp-score-h"><table class="tbl sp-table sp-items">
        <thead><tr><th scope="col">${t('gradebook.student.work')}</th><th scope="col">${t('gradebook.student.type')}</th><th scope="col">${t('gradebook.student.points')}</th></tr></thead>
        ${scored.map(({ cl, cell }) => html`<tbody><tr class="sp-lessonrow"><th scope="colgroup" colspan="2" dir="auto">${cl.title}</th><td>${pts(cell.score)}</td></tr>
          ${cell.items.map(it => html`<tr><th scope="row" dir="auto">${itemTitle(it)}</th><td data-label="${t('gradebook.student.type')}"><span aria-hidden="true">${KIND_ICON[it.kind]}</span> ${t(`gradebook.kind.${it.kind}`)}</td><td data-label="${t('gradebook.student.points')}"><span class="gb-num" dir="ltr">${SC.pointsText(it.earned, it.possible)}</span></td></tr>`)}</tbody>`)}
        <tfoot><tr><th scope="row" colspan="2">${t('gradebook.score')}</th><td>${pts(rep.score)}</td></tr></tfoot></table></div>`
        : html`<p class="notice">${t('gradebook.student.none')}</p>`}</section>
    <section class="panel" aria-labelledby="sp-std-h"><h2 id="sp-std-h">🧭 ${t('school.classTabs.standards')}</h2>
      ${rep.standards.length ? html`<ul class="plain sp-std">${rep.standards.map(s => html`<li><b>${fwName(t, s.fw)}</b> <span>${t('gradebook.student.standardsLine', { meets: s.meets, developing: s.developing, practiced: s.practiced })}</span>
        <a class="noprint" href="/class/${c.id}/standards?fw=${s.fw}&student=${p.id}">${t('gradebook.student.standardsOpen')}</a></li>`)}</ul>`
        : html`<p class="muted">${t('gradebook.student.noStandards')}</p>`}</section>
    <section class="panel" aria-labelledby="sp-ans-h"><h2 id="sp-ans-h">✍️ ${t('gradebook.student.answers')}</h2>
      ${rep.answers.length || rep.notes.length ? html`<ul class="plain answerlist">
        ${rep.answers.map(a => html`<li class="answercard ${a.reviewed_at ? 'is-read' : ''}"><div class="ac-head"><b dir="auto">${a.lesson}</b><span class="small muted" dir="auto">${stepName(a)}</span><span class="small muted">${f.ago(a.updated_at)}</span>${a.kind === 'question' ? (a.reviewed_at ? html`<span class="chip-s">✔️ ${t('progress.lesson.read')}</span>` : html`<a class="chip-s warn noprint" href="/class/${c.id}/progress/${a.cl}#a-${a.sid}-${p.id}">✍️ ${t('progress.lesson.new')}</a>`) : ''}</div>
          ${a.kind === 'question' ? html`<p class="small muted q-text" dir="auto">${a.body}</p><p class="ac-answer" dir="auto">${a.answer}</p>` : ''}
          ${a.feedback ? html`<div class="feedback"><b>💬 ${t('gradebook.student.feedback')}</b><p dir="auto">${a.feedback}</p></div>` : ''}</li>`)}
        ${rep.notes.map(n => html`<li class="answercard is-read"><div class="ac-head"><b dir="auto">${n.lesson}</b><span class="small muted" dir="auto">${n.sid ? n.title || t('rubrics.gradebook.key') : t('rubrics.attach.lessonTitle')}</span><span class="small muted">${f.ago(n.scored_at)}</span></div>
          <div class="feedback"><b>💬 ${t('gradebook.student.feedback')}</b><p dir="auto">${n.feedback}</p></div></li>`)}</ul>`
        : html`<p class="muted">${t('gradebook.student.noAnswers')}</p>`}</section>
    ${liveOn() || rep.live.length ? html`<section class="panel" aria-labelledby="sp-live-h"><h2 id="sp-live-h">📡 ${t('live.panel.title')}</h2>
      ${rep.live.length ? html`<ul class="plain sp-live">${rep.live.map(({ run, result }) => html`<li><a href="/live/results/${run.id}" dir="auto">${run.title || t('live.results.title')}</a> <span class="small muted">${f.day(run.ended_at, SHORT)}</span>
        ${result ? html`<b class="gb-num" dir="ltr">${result.right}/${result.total}</b>` : html`<span>✓ ${t('gradebook.live.keyPlayed')}</span>`}${run.linked ? html` <span class="chip-s" title="${t('gradebook.live.linked')}">📚<span class="sr-only"> ${t('gradebook.live.linked')}</span></span>` : ''}</li>`)}</ul>`
        : html`<p class="muted">${t('gradebook.student.noLive')}</p>`}</section>` : ''}
  </article>`;
  res.set('Cache-Control', 'no-store');
  page(req, res, { title: `${real ? first : gen} · ${c.name}`, active: 'classes', body, head: CSS, scripts: ['/js/schools.js', '/js/print.js'], back: `/class/${c.id}/progress`, backLabel: t('progress.gradebook.title') });
});
