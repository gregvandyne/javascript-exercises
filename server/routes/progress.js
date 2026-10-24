// Progress (schools step 3): students' progress actions on lesson steps, the class gradebook (/class/:id/progress),
// one lesson's progress with written answers and feedback (/class/:cid/progress/:clid), and a CSV download.
// Permissions come from services/progress.js (students: only their own steps) and services/schools.js (teachers).
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { avatar, emptyState } from '../views/components.js';
import { requireUser } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as L from '../services/lessons.js';
import * as P from '../services/progress.js';
import * as games from '../services/games.js';
import { publish } from '../services/publish.js';
import { classHeader } from './schools.js';

export const router = Router();
const CSS = raw('<link rel="stylesheet" href="/css/community.css"><link rel="stylesheet" href="/css/schools.css">');
const b = req => req.body || {};
const nameOf = r => r.roster_name || r.display_name;
const KIND_ICON = { game: '🎮', build: '🛠️', text: '📖', question: '✍️' };
const err = (req, res, code, status = 400, field) => res.status(status).json({ error: req.t(`progress.errors.${code}`), ...(field ? { field } : {}) });
const send = (req, res, r, extra = {}) => (r.ok ? res.json({ ok: true, ...extra }) : err(req, res, r.code, r.code === 'notFound' ? 404 : 400, r.code === 'answerEmpty' ? 'answer' : undefined));
const no = (req, res) => (req.path.startsWith('/api/') ? res.status(404).json({ error: req.t('progress.errors.notFound') }) : notFound(req, res, req.t('progress.errors.notFound')));

// ================================================================ student actions
router.post('/api/progress/:clid/:sid/done', requireUser, rateLimit('progress', 240, 60e3), (req, res) => send(req, res, P.markDone(req.user, req.params.clid, req.params.sid, b(req).done !== false && b(req).done !== '0')));
router.post('/api/progress/:clid/:sid/answer', requireUser, rateLimit('progress', 240, 60e3), (req, res) => send(req, res, P.answer(req.user, req.params.clid, req.params.sid, b(req).answer)));
/** From the play page: { event: 'start' | 'time' | 'score' | 'end', seconds, score, label }. */
router.post('/api/progress/:clid/:sid/game', requireUser, rateLimit('progress', 240, 60e3), (req, res) => {
  const { event, seconds, score, label } = b(req);
  const u = req.user, { clid, sid } = req.params;
  const r = event === 'start' ? P.gameStarted(u, clid, sid) : event === 'time' ? P.gameTime(u, clid, sid, seconds)
    : event === 'score' ? P.gameScore(u, clid, sid, score, label) : event === 'end' ? P.gameScore(u, clid, sid, Number.isFinite(+score) && score !== null ? score : null) : { ok: false, code: 'notFound' };
  send(req, res, r);
});
/** Hand in a build step: the game is shared with the school (so the teacher can play it) and the step is done. */
router.post('/api/progress/:clid/:sid/hand-in', requireUser, rateLimit('progress', 60, 60e3), async (req, res) => {
  const c = P.context(req.user, req.params.clid, req.params.sid);
  if (!c.ok || c.step.kind !== 'build') return no(req, res);
  const row = P.get(req.params.clid, req.params.sid, req.user.id);
  const g = row && row.game_id && games.getGame(row.game_id);
  if (!g || g.owner_id !== req.user.id || g.status === 'deleted') return err(req, res, 'noGame');
  if (!g.current_version_id) return err(req, res, 'emptyGame');
  if (g.status !== 'published' || !['school', 'public'].includes(g.visibility)) {
    const r = await publish(req.user, g.id, 'school', { t: req.t });
    if (!r.ok) return res.status(400).json({ error: r.message });
  }
  send(req, res, P.markDone(req.user, req.params.clid, req.params.sid, true));
});

// ================================================================ teachers
const loadClass = (req, res) => { const c = S.getClass(req.params.id || req.params.cid); if (!c || !S.canManageClass(req.user, c)) { no(req, res); return null; } return c; };
const pct = (d, t) => (t ? Math.round((100 * d) / t) : 0);
function bar(d, t) {
  const p = pct(d, t);
  return html`<span class="pbar" aria-hidden="true"><span style="width:${p}%"></span></span>`;
}

/** The gradebook: students down the side, assigned lessons across the top. */
router.get('/class/:id/progress', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const t = req.t, f = req.fmt;
  const gb = P.classProgress(c.id);
  const allSteps = gb.lessons.reduce((n, l) => n + l.steps, 0);
  const table = html`<div class="gbwrap" tabindex="0" role="region" aria-label="${t('progress.gradebook.title')}"><table class="tbl gradebook">
    <thead><tr><th scope="col" class="gb-name">${t('school.people.name')}</th>
      ${gb.lessons.map(l => html`<th scope="col"><a href="/class/${c.id}/progress/${l.id}" dir="auto">${l.title}</a>${l.due_at ? html`<span class="gb-due">📅 ${f.date(l.due_at, { month: 'short', day: 'numeric' })}</span>` : ''}</th>`)}
      <th scope="col">${t('progress.gradebook.overall')}</th></tr></thead>
    <tbody>${gb.students.map(p => {
      const done = p.cells.reduce((n, x) => n + Math.min(x.done, x.total), 0);
      return html`<tr><th scope="row" class="gb-name"><span class="pp">${avatar(p, 28)}<b>${nameOf(p)}</b></span></th>
        ${p.cells.map((x, i) => html`<td class="${x.total && x.done >= x.total ? 'gb-done' : x.overdue ? 'gb-late' : ''}"><a class="gb-cell" href="/class/${c.id}/progress/${gb.lessons[i].id}#s-${p.id}">
          <span class="gb-num">${x.total && x.done >= x.total ? '✅' : `${Math.min(x.done, x.total)}/${x.total}`}</span>${bar(Math.min(x.done, x.total), x.total)}
          ${x.toRead ? html`<span class="chip-s warn">✍️ ${x.toRead}</span>` : ''}${x.overdue ? html`<span class="sr-only">${t('progress.gradebook.late')}</span>` : ''}</a></td>`)}
        <td class="gb-all"><b>${pct(done, allSteps)}%</b></td></tr>`;
    })}</tbody></table></div>`;
  const body = html`${classHeader(req, c, 'progress')}
  ${gb.lessons.length && gb.students.length ? html`<div class="row gb-tools"><p class="muted grow">${t('progress.gradebook.text')}</p><a class="btn btn-sm" href="/class/${c.id}/progress.csv" download>⬇️ ${t('progress.gradebook.csv')}</a></div>` : ''}
  ${gb.toRead ? html`<p class="notice">✍️ ${t('progress.gradebook.toRead', { count: gb.toRead })}</p>` : ''}
  ${!gb.lessons.length ? html`<section class="panel">${emptyState({ emoji: '📚', title: t('progress.gradebook.noLessons'), text: t('progress.gradebook.noLessonsText') })}</section>`
    : !gb.students.length ? html`<section class="panel">${emptyState({ emoji: '👩‍🎓', title: t('progress.gradebook.noStudents'), text: t('progress.gradebook.noStudentsText') })}</section>`
    : html`<section class="panel">${table}<p class="small muted gb-key"><span>✅ ${t('progress.key.done')}</span><span><span class="pbar"><span style="width:60%"></span></span> ${t('progress.key.steps')}</span><span class="gb-late-key">⏰ ${t('progress.key.late')}</span><span>✍️ ${t('progress.key.toRead')}</span></p></section>`}`;
  page(req, res, { title: `${t('progress.gradebook.title')} · ${c.name}`, active: 'classes', body, head: CSS, back: '/teach', backLabel: t('school.teach.title') });
});

/** CSV: one row per student, one column per lesson (steps done of total), then the overall percentage. */
router.get('/class/:id/progress.csv', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const t = req.t;
  const gb = P.classProgress(c.id);
  const cell = v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
  const allSteps = gb.lessons.reduce((n, l) => n + l.steps, 0);
  const lines = [[t('school.people.name'), t('school.people.username'), ...gb.lessons.map(l => l.title), t('progress.gradebook.overall')].map(cell).join(',')];
  for (const p of gb.students) {
    const done = p.cells.reduce((n, x) => n + Math.min(x.done, x.total), 0);
    lines.push([nameOf(p), p.username, ...p.cells.map(x => `${Math.min(x.done, x.total)}/${x.total}`), `${pct(done, allSteps)}%`].map(cell).join(','));
  }
  const file = `${c.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'class'}-progress.csv`;
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="progress.csv"; filename*=UTF-8''${encodeURIComponent(file)}`).send(`﻿${lines.join('\r\n')}\r\n`);
});

/** One lesson: every student × every step, then the written answers with feedback forms. */
router.get('/class/:cid/progress/:clid', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const lp = P.lessonProgress(req.params.clid);
  if (!lp || lp.cl.class_id !== c.id) return no(req, res);
  const t = req.t, f = req.fmt;
  const l = L.getLesson(lp.cl.lesson_id);
  const finished = lp.students.filter(p => p.total && p.done >= p.total).length;
  const toRead = lp.students.reduce((n, p) => n + p.toRead, 0);
  const icon = (s, x) => {
    if (!x) return html`<span class="st-none" title="${t('progress.status.none')}">–</span><span class="sr-only">${t('progress.status.none')}</span>`;
    const isDone = x.status === 'done';
    const extra = s.kind === 'game' && x.score !== null ? html`<span class="st-score" dir="ltr">${f.int(x.score)}${x.label ? ` ${x.label}` : ''}</span>`
      : s.kind === 'question' && x.answer ? html`<span class="${x.reviewed_at ? 'st-read' : 'chip-s warn'}">${x.reviewed_at ? '💬' : '✍️'}</span>` : '';
    return html`<span class="${isDone ? 'st-done' : 'st-started'}" title="${isDone ? t('progress.status.done') : t('progress.status.started')}">${isDone ? '✅' : '◐'}</span><span class="sr-only">${isDone ? t('progress.status.done') : t('progress.status.started')}</span>${extra}`;
  };
  const games_ = new Map(lp.steps.filter(s => s.kind === 'build').flatMap(s => lp.students.map(p => p.cells[lp.steps.indexOf(s)])).filter(x => x && x.game_id).map(x => [x.game_id, games.getGame(x.game_id)]));
  const questions = lp.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'question');
  const fullSteps = L.steps(l.id);
  const answers = questions.map(({ s, i }) => {
    const list = lp.students.map(p => ({ p, x: p.cells[i] })).filter(({ x }) => x && x.answer).sort((a, b) => (!!a.x.reviewed_at - !!b.x.reviewed_at) || (b.x.updated_at - a.x.updated_at));
    const q = fullSteps.find(x => x.id === s.id);
    return html`<section class="panel answers" aria-labelledby="q-${s.id}"><h2 id="q-${s.id}">✍️ ${t('progress.lesson.question', { n: i + 1 })}</h2>
      <p class="q-text" dir="auto">${q ? q.body : ''}</p>
      ${list.length ? html`<ul class="plain answerlist">${list.map(({ p, x }) => html`<li class="answercard ${x.reviewed_at ? 'is-read' : ''}" id="a-${s.id}-${p.id}">
        <div class="ac-head"><span class="pp">${avatar(p, 28)}<b>${nameOf(p)}</b></span><span class="small muted">${f.ago(x.updated_at)}</span>${x.reviewed_at ? html`<span class="chip-s">💬 ${t('progress.lesson.read')}</span>` : html`<span class="chip-s warn">✍️ ${t('progress.lesson.new')}</span>`}</div>
        <p class="ac-answer" dir="auto">${x.answer}</p>
        <form class="ac-form" data-api="/api/progress/${lp.cl.id}/${s.id}/${p.id}/review" data-reload novalidate>
          <label class="sr-only" for="fb-${s.id}-${p.id}">${t('progress.lesson.feedback')}</label>
          <textarea class="input" id="fb-${s.id}-${p.id}" name="feedback" rows="2" maxlength="2000" placeholder="${t('progress.lesson.feedbackPlaceholder')}">${x.feedback}</textarea>
          <div class="row"><button class="btn btn-primary btn-sm" type="submit">${x.reviewed_at ? `💬 ${t('progress.lesson.update')}` : `✔️ ${t('progress.lesson.send')}`}</button></div>
        </form></li>`)}</ul>` : html`<p class="muted">${t('progress.lesson.noAnswers')}</p>`}
    </section>`;
  });
  const body = html`
  <div class="pagehead"><div><span class="small muted">${c.name}</span><h1 dir="auto">${l.title}</h1>
    <p class="muted">${[t('progress.lesson.finished', { done: finished, total: lp.students.length }), lp.cl.due_at ? t('lessons.class.dueOn', { date: f.date(lp.cl.due_at) }) : ''].filter(Boolean).join(' · ')}</p></div>
    <div class="row"><a class="btn" href="/class/${c.id}/lessons/${lp.cl.id}">👀 ${t('progress.lesson.studentView')}</a>${L.canEditLesson(req.user, l) ? html`<a class="btn" href="/teach/lessons/${l.id}">✏️ ${t('lessons.class.editLesson')}</a>` : ''}</div></div>
  ${toRead ? html`<p class="notice">✍️ ${t('progress.gradebook.toRead', { count: toRead })} <a href="#answers">${t('progress.lesson.jump')}</a></p>` : ''}
  ${!lp.students.length ? html`<section class="panel">${emptyState({ emoji: '👩‍🎓', title: t('progress.gradebook.noStudents'), text: t('progress.gradebook.noStudentsText') })}</section>`
    : !lp.steps.length ? html`<section class="panel"><p class="muted">${t('lessons.lesson.noSteps')}</p></section>`
    : html`<section class="panel"><div class="gbwrap" tabindex="0" role="region" aria-label="${l.title}"><table class="tbl gradebook steps">
      <thead><tr><th scope="col" class="gb-name">${t('school.people.name')}</th>${lp.steps.map((s, i) => html`<th scope="col" title="${s.title || t(`lessons.kinds.${s.kind}`)}"><span aria-hidden="true">${KIND_ICON[s.kind]}</span> ${i + 1}<span class="gb-step">${s.title || t(`lessons.kinds.${s.kind}`)}</span></th>`)}<th scope="col">${t('progress.lesson.lastActive')}</th></tr></thead>
      <tbody>${lp.students.map(p => html`<tr id="s-${p.id}"><th scope="row" class="gb-name"><span class="pp">${avatar(p, 28)}<b>${nameOf(p)}</b></span><span class="small muted">${p.done}/${p.total}</span></th>
        ${lp.steps.map((s, i) => { const x = p.cells[i]; const g = s.kind === 'build' && x && x.game_id ? games_.get(x.game_id) : null;
          return html`<td><span class="st">${icon(s, x)}</span>${g && g.status === 'published' && ['school', 'public'].includes(g.visibility) ? html`<a class="small" href="/g/${g.slug}">${t('progress.lesson.openGame')}</a>` : ''}${s.kind === 'question' && x && x.answer ? html`<a class="small" href="#a-${s.id}-${p.id}">${t('progress.lesson.readAnswer')}</a>` : ''}</td>`; })}
        <td class="small muted">${p.last ? f.ago(p.last) : '–'}</td></tr>`)}</tbody></table></div></section>`}
  ${questions.length ? html`<div id="answers">${answers}</div>` : ''}`;
  page(req, res, { title: `${l.title} · ${c.name}`, active: 'classes', body, head: CSS, back: `/class/${c.id}/progress`, backLabel: t('progress.gradebook.title') });
});

router.post('/api/progress/:clid/:sid/:uid/review', requireUser, (req, res) => send(req, res, P.review(req.user, req.params.clid, req.params.sid, req.params.uid, b(req).feedback)));

// ================================================================ the lesson as the class sees it (with each student's progress)
const paras = text => String(text || '').split(/\n{2,}/).filter(Boolean).map(p => html`<p dir="auto">${p.split('\n').map((line, i) => html`${i ? raw('<br>') : ''}${line}`)}</p>`);
router.get('/class/:cid/lessons/:clid', requireUser, (req, res) => {
  const t = req.t, f = req.fmt, u = req.user;
  const cl = L.getClassLesson(req.params.clid);
  if (!cl || cl.class_id !== req.params.cid || !L.canViewClassLesson(u, cl)) return no(req, res);
  const c = S.getClass(cl.class_id), l = L.getLesson(cl.lesson_id), st = L.steps(l.id);
  const teacher = S.canManageClass(u, c);
  const student = !teacher && S.classMember(c.id, u.id)?.role === 'student';
  const mine = student ? P.forStudent(cl.id, u.id) : {};
  const doneN = st.filter(s => mine[s.id] && mine[s.id].status === 'done').length;
  const api = s => `/api/progress/${cl.id}/${s.id}`;
  const status = x => (!x ? '' : x.status === 'done' ? html`<span class="stepstate is-done">✅ ${t('progress.status.done')}</span>` : html`<span class="stepstate">◐ ${t('progress.status.started')}</span>`);
  const actions = (s, x) => {
    if (!student) return '';
    const isDone = x && x.status === 'done';
    if (s.kind === 'text') return isDone
      ? html`<form data-api="${api(s)}/done" data-reload><input type="hidden" name="done" value="0"><button class="btn btn-sm btn-ghost" type="submit">↩️ ${t('progress.student.undo')}</button></form>`
      : html`<form data-api="${api(s)}/done" data-reload><input type="hidden" name="done" value="1"><button class="btn btn-primary" type="submit">✅ ${t('progress.student.markDone')}</button></form>`;
    if (s.kind === 'game') {
      if (!L.playableBy(s, c.school_id)) return html`<p class="notice warn">${t('lessons.view.notReady')}</p>`;
      return html`<div class="row"><a class="btn btn-primary btn-big" href="/play/${s.game_slug}?lesson=${cl.id}&step=${s.id}">▶ ${t('lessons.view.play', { title: s.game_title })}</a></div>
        ${x && x.score !== null ? html`<p class="sc-score">🏆 ${t('progress.student.best', { score: f.int(x.score) })}</p>` : ''}
        ${isDone ? '' : html`<p class="small muted">${t('progress.student.gameHint')}</p><form data-api="${api(s)}/done" data-reload><input type="hidden" name="done" value="1"><button class="btn btn-sm" type="submit">✅ ${t('progress.student.played')}</button></form>`}`;
    }
    if (s.kind === 'build') {
      const g = x && x.game_id ? games.getGame(x.game_id) : null;
      if (!g || g.status === 'deleted') return html`<form data-api="${api(s)}/build"><button class="btn btn-primary btn-big" type="submit">🛠️ ${t('lessons.view.build')}</button></form>`;
      if (isDone) return html`<p class="sc-score">📤 ${t('progress.student.handedInText')}</p><div class="row">${g.status === 'published' ? html`<a class="btn" href="/g/${g.slug}">🎮 ${t('progress.student.seeGame')}</a>` : ''}<a class="btn" href="/studio/${g.id}">🛠️ ${t('progress.student.keepBuilding')}</a></div>`;
      return html`<div class="row"><a class="btn btn-primary" href="/studio/${g.id}">🛠️ ${t('progress.student.keepBuilding')}</a>
        <form data-api="${api(s)}/hand-in" data-reload data-confirm="${t('progress.student.handInConfirm')}"><button class="btn" type="submit">📤 ${t('progress.student.handIn')}</button></form></div>
        <p class="small muted">${t('progress.student.handInHint')}</p>`;
    }
    if (s.kind === 'question') return html`
      <form class="answerform" data-api="${api(s)}/answer" data-reload novalidate>
        <label class="sr-only" for="ans-${s.id}">${t('progress.student.yourAnswer')}</label>
        <textarea class="input" id="ans-${s.id}" name="answer" rows="4" maxlength="3000" placeholder="${t('progress.student.answerPlaceholder')}" required>${x ? x.answer : ''}</textarea><span class="err" id="ans-${s.id}-err"></span>
        <div class="row"><button class="btn btn-primary" type="submit">${x && x.answer ? `✏️ ${t('progress.student.updateAnswer')}` : `📨 ${t('progress.student.sendAnswer')}`}</button>${x && x.answer ? html`<span class="small muted">${t('progress.student.sentAgo', { when: f.ago(x.updated_at) })}</span>` : ''}</div>
      </form>
      ${x && x.reviewed_at ? html`<div class="feedback"><b>💬 ${t('progress.student.feedback')}</b>${x.feedback ? html`<p dir="auto">${x.feedback}</p>` : html`<p class="muted">${t('progress.student.readNoFeedback')}</p>`}</div>` : ''}`;
    return '';
  };
  const body = html`
  <div class="pagehead"><div><h1 dir="auto">${l.title}</h1>
    <p class="muted">${[t('lessons.stepsN', { count: st.length }), cl.due_at ? t('lessons.class.dueOn', { date: f.date(cl.due_at) }) : ''].filter(Boolean).join(' · ')}</p></div>
    ${teacher ? html`<div class="row"><a class="btn" href="/class/${c.id}/progress/${cl.id}">📊 ${t('progress.lesson.seeProgress')}</a>${L.canEditLesson(u, l) ? html`<a class="btn" href="/teach/lessons/${l.id}">✏️ ${t('lessons.class.editLesson')}</a>` : ''}</div>` : ''}</div>
  ${teacher ? html`<p class="notice">👀 ${t('lessons.view.teacherPreview')}</p>` : ''}
  ${student && st.length ? html`<div class="lessonprogress ${doneN >= st.length ? 'all' : ''}" role="status"><span>${doneN >= st.length ? `🎉 ${t('progress.student.allDone')}` : t('progress.student.doneOf', { done: doneN, total: st.length })}</span>${bar(doneN, st.length)}</div>` : ''}
  ${l.summary ? html`<div class="panel">${paras(l.summary)}</div>` : ''}
  <ol class="plain steplist">${st.map((s, i) => { const x = mine[s.id]; return html`<li class="panel stepcard ${x && x.status === 'done' ? 'is-done' : ''}" id="step-${s.id}">
    <div class="sc-head"><span class="sc-num">${x && x.status === 'done' ? '✓' : i + 1}</span><span class="sc-kind" aria-hidden="true">${KIND_ICON[s.kind]}</span>
      <div class="sc-title"><b dir="auto">${s.title || t(`lessons.kinds.${s.kind}`)}</b>${s.minutes ? html`<span class="small muted">${t('lessons.minutesN', { count: s.minutes })}</span>` : ''}</div>${status(x)}</div>
    ${s.kind === 'build' ? html`<p class="sc-build" dir="auto">💬 “${s.body}”</p>` : s.kind === 'question' ? html`<div class="sc-body q-text">${paras(s.body)}</div>` : s.body ? html`<div class="sc-body">${paras(s.body)}</div>` : ''}
    ${student ? actions(s, x) : s.kind === 'game' && !L.playableBy(s, c.school_id) ? html`<p class="notice warn">${t('lessons.view.notReady')}</p>` : ''}
  </li>`; })}</ol>`;
  page(req, res, { title: l.title, active: 'classes', mid: true, body, head: CSS, back: `/class/${c.id}`, backLabel: c.name });
});
/** A build step: the student's own Studio game for it (made the first time, reopened after), with the teacher's idea in the Builder box. */
router.post('/api/progress/:clid/:sid/build', requireUser, rateLimit('studio-new', 30, 3600e3, 'studio.api.tooManyGames'), (req, res) => {
  const c = P.context(req.user, req.params.clid, req.params.sid);
  if (!c.ok || c.step.kind !== 'build') return no(req, res);
  if (req.user.is_guest) return no(req, res);
  const row = P.get(c.cl.id, c.step.id, req.user.id);
  const old = row && row.game_id && games.getGame(row.game_id);
  if (old && old.owner_id === req.user.id && old.status !== 'deleted') return res.json({ ok: true, redirect: `/studio/${old.id}` });
  if (!req.user.builder_enabled) return res.status(403).json({ error: req.t('studio.api.buildingOff') });
  const l = L.getLesson(c.cl.lesson_id);
  const g = games.createGame(req.user.id, { title: (c.step.title || l.title).slice(0, 60), icon: '🎓', category: 'learning' });
  P.buildGame(req.user, c.cl.id, c.step.id, g.id);
  res.json({ ok: true, redirect: `/studio/${g.id}?ask=${encodeURIComponent(c.step.body.slice(0, 300))}` });
});
