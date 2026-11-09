// Progress (schools step 3): students' progress actions on lesson steps, the class gradebook (/class/:id/progress),
// one lesson's progress with written answers and feedback (/class/:cid/progress/:clid), and a CSV download.
// Permissions come from services/progress.js (students: only their own steps) and services/schools.js (teachers).
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { avatar, emptyState, jumpNav, nameFilter } from '../views/components.js';
import { requireUser } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as L from '../services/lessons.js';
import * as P from '../services/progress.js';
import * as C from '../services/courses.js';
import * as games from '../services/games.js';
import { publish } from '../services/publish.js';
import { classHeader, classBack, studentNotYou } from './schools.js';
import { zoneNote } from './lessons.js';
import { gameLiveReady } from './live.js';
import { canHost as liveCanHost } from '../services/classlive-access.js';
import { liveOn, teamsOn as liveTeamsOn } from '../services/classlive-sessions.js';
import { classRuns as liveRuns, classSupport as liveSupport } from '../services/classlive-results.js';
import { loadClassTeams, presetsFor } from '../services/classlive-teams.js';
import { shapesSprite, teamText } from '../views/live.js';
import { jsonData } from '../views/html.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { onLocales as ttsOnLocales } from '../services/tts.js';
import { config } from '../config.js';
import { liveGameOf } from '../live/live-games.js';
import { templateHtml, templateInfo, TEMPLATE_KEYS } from '../builder/catalog.js';
import { scanVersion } from '../services/scanner.js';
import { sanitizeGameHtml } from '../services/sanitize.js';
import * as R from '../services/rubrics.js';
import { scoreFields, scoreInput, resultView } from '../views/rubrics.js';
/** The class teams editor's script (Oomba Live part 3; the page shows the saved state without it). */
const CLASS_TEAMS_JS = fs.existsSync(fileURLToPath(new URL('../../public/js/live-class-teams.js', import.meta.url)));
const liveHostOk = u => liveOn() && liveCanHost(u);

export const router = Router();
const CSS = raw(`<link rel="stylesheet" href="/css/community.css?v=${VERSION}"><link rel="stylesheet" href="/css/schools.css?v=${VERSION}">`);
const b = req => req.body || {};
const nameOf = r => r.roster_name || r.display_name;
const KIND_ICON = { game: '🎮', build: '🛠️', text: '📖', question: '✍️', quiz: '🧩' };
/** Official games a class plays only when the teacher hosts them live (the Oomba Live built-in modes, Would You Rather
 *  Live among them): a lesson step on one of them shows "Your teacher hosts this live" instead of Play and "I played it",
 *  and the server refuses the student's own progress calls on it: the live run writes that cell (CS Quest P5;
 *  services/progress.js hostedLive, also used by /play in routes/games.js). */
export const HOSTED_LIVE = P.HOSTED_LIVE;
const hostedLive = P.hostedLive;
/** A game step's Play link: the lesson context for the gradebook, then the step's lesson parameters (lesson_steps.options,
 *  services/play-params.js) so the game opens at the right chapter. */
const playHref = (s, cl) => `/play/${s.game_slug}${cl ? `?lesson=${cl.id}&step=${s.id}${s.options ? `&${s.options}` : ''}` : s.options ? `?${s.options}` : ''}`;
/** QUIZ_STEPS (default on): quiz steps (exit tickets) on the student lesson page and their APIs; off answers 404. */
export const quizStepsOn = (req, res, next) => (config.quizSteps ? next() : res.status(404).json({ error: req.t('progress.errors.notFound'), code: 'quizStepsOff' }));
/** Rubric marks ('23-1') shown as "2 · 3 · – · 1". */
const marksText = marks => [...String(marks || '')].map(ch => (ch === '-' ? '–' : ch)).join(' · ');
const err = (req, res, code, status = 400, field) => res.status(status).json({ error: req.t(`progress.errors.${code}`), ...(field ? { field } : {}) });
const send = (req, res, r, extra = {}) => (r.ok ? res.json({ ok: true, ...extra }) : err(req, res, r.code, r.code === 'notFound' ? 404 : 400, r.code === 'answerEmpty' ? 'answer' : undefined));
const no = (req, res) => (req.path.startsWith('/api/') ? res.status(404).json({ error: req.t('progress.errors.notFound') }) : notFound(req, res, req.t('progress.errors.notFound')));

// ================================================================ student actions
router.post('/api/progress/:clid/:sid/done', requireUser, rateLimit('progress', 240, 60e3), (req, res) => send(req, res, P.markDone(req.user, req.params.clid, req.params.sid, b(req).done !== false && b(req).done !== '0')));
router.post('/api/progress/:clid/:sid/answer', requireUser, rateLimit('progress', 240, 60e3), (req, res) => send(req, res, P.answer(req.user, req.params.clid, req.params.sid, b(req).answer)));
/** From the play page: { event: 'start' | 'time' | 'score' | 'end', seconds, score, label }. Never for a hosted-live
 *  step (Quest Race, Would You Rather Live…): only the teacher's live run writes that cell (services/progress.js). */
router.post('/api/progress/:clid/:sid/game', requireUser, rateLimit('progress', 240, 60e3), (req, res) => {
  const { event, seconds, score, label } = b(req);
  const u = req.user, { clid, sid } = req.params;
  const c = P.context(u, clid, sid);
  if (!c.ok || hostedLive(c.step)) return no(req, res);
  const r = event === 'start' ? P.gameStarted(u, clid, sid) : event === 'time' ? P.gameTime(u, clid, sid, seconds)
    : event === 'score' ? P.gameScore(u, clid, sid, score, label) : event === 'end' ? P.gameScore(u, clid, sid, Number.isFinite(+score) && score !== null ? score : null) : { ok: false, code: 'notFound' };
  send(req, res, r);
});
/** Hand in a build step: the game is shared with the lesson's class (so the teacher and the class can play it) and the
 *  step is done. A game the class can already open (school, public, or a class game live in this class) is left as it
 *  is; a class game gets this class added to its list. It never widens a game beyond the class. */
router.post('/api/progress/:clid/:sid/hand-in', requireUser, rateLimit('progress', 60, 60e3), async (req, res) => {
  const c = P.context(req.user, req.params.clid, req.params.sid);
  if (!c.ok || c.step.kind !== 'build') return no(req, res);
  const row = P.get(req.params.clid, req.params.sid, req.user.id);
  const g = row && row.game_id && games.getGame(row.game_id);
  if (!g || g.owner_id !== req.user.id || g.status === 'deleted') return err(req, res, 'noGame');
  if (!g.current_version_id) return err(req, res, 'emptyGame');
  const classId = c.cl.class_id;
  const reaches = g.status === 'published' && (['school', 'public'].includes(g.visibility) || (g.visibility === 'class' && games.gameLiveInClass(g.id, classId)));
  if (!reaches) {
    const mine = new Set(S.shareableClasses(req.user.id).map(x => x.id));
    const keep = g.visibility === 'class' ? S.gameClassIds(g.id).filter(id => mine.has(id)) : [];
    const r = await publish(req.user, g.id, 'class', { t: req.t, classIds: [...keep, classId] });
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
const SHORT = { month: 'short', day: 'numeric' };
/** An assigned lesson's dates as chips: '🔒 Opens {date}' before it opens, '📅 Due today' (amber) on the due day, else
 *  '📅 Due {date}' ('📅 {date}' when short, for gradebook columns), and '⏰ Late' when late is set. Stored dates are
 *  calendar days, so always f.day (the same date whatever zone the server runs in). */
function dateChips(t, f, cl, { late = false, short = false } = {}) {
  const open = L.isOpen(cl), due = L.dueState(cl);
  return [
    !open ? html`<span class="chip-s">🔒 ${t('lessons.class.opensOn', { date: f.day(cl.opens_at, SHORT) })}</span>` : '',
    open && due === 'today' ? html`<span class="chip-s warn">📅 ${t('lessons.class.dueToday')}</span>`
      : cl.due_at ? html`<span class="nw">📅 ${short ? f.day(cl.due_at, SHORT) : t('lessons.class.dueOn', { date: f.day(cl.due_at) })}</span>` : '',
    late ? html`<span class="chip-s bad">⏰ ${t('lessons.class.late')}</span>` : '',
  ].filter(Boolean);
}
/** Overall for a gradebook row: '–' while none of the class's lessons has opened (nothing to count yet). */
const overallOf = p => (p.cells.some(x => !x.locked && x.total) ? `${p.overall}%` : null);

/** The gradebook: students down the side, assigned lessons across the top. Lessons that haven't opened are greyed out
 *  and left out of Overall; cells with answers to review go straight to the student's first one. */
router.get('/class/:id/progress', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const t = req.t, f = req.fmt;
  const gb = P.classProgress(c.id);
  const firstNew = P.firstNewAnswers(c.id);
  const col = new Map(gb.lessons.map((l, i) => [l.id, i]));
  const toReview = P.toReadByLesson(c.id).filter(r => col.has(r.cl)).sort((a, b) => col.get(a.cl) - col.get(b.cl));
  const anyLate = gb.lessons.map((l, i) => gb.students.some(p => p.cells[i].late));
  const table = html`<div class="gbwrap" tabindex="0" role="region" aria-label="${t('progress.gradebook.title')}"><table class="tbl gradebook" id="gb-lessons">
    <thead><tr><th scope="col" class="gb-name">${t('school.people.name')}</th>
      ${gb.lessons.map((l, i) => { const chips = dateChips(t, f, l, { late: anyLate[i], short: true });
        return html`<th scope="col" class="${l.locked ? 'gb-locked' : ''}"><a href="/class/${c.id}/progress/${l.id}" dir="auto">${l.title}</a>${chips.length ? html`<span class="gb-dates">${chips}</span>` : ''}</th>`; })}
      <th scope="col">${t('progress.gradebook.overall')}</th></tr></thead>
    <tbody>${gb.students.map(p => {
      const all = overallOf(p);
      return html`<tr><th scope="row" class="gb-name"><span class="pp">${avatar(p, 28)}<b>${nameOf(p)}</b></span></th>
        ${p.cells.map((x, i) => {
          const l = gb.lessons[i];
          if (x.locked) return html`<td class="gb-locked"><span aria-hidden="true">–</span><span class="sr-only">${t('lessons.class.opensOn', { date: f.day(l.opens_at, SHORT) })}</span></td>`;
          const full = x.total && x.done >= x.total;
          const first = x.toRead ? firstNew[`${p.id}:${l.id}`] : null;
          return html`<td class="${full ? 'gb-done' : x.late ? 'gb-late' : ''}"><a class="gb-cell" href="/class/${c.id}/progress/${l.id}#${first ? `a-${first}-${p.id}` : `s-${p.id}`}">
          <span class="gb-num">${full ? '✅' : `${x.done}/${x.total}`}</span>${bar(x.done, x.total)}
          ${x.toRead ? html`<span class="chip-s warn">✍️ ${x.toRead}</span>` : ''}${x.late ? html`<span class="sr-only">${t('lessons.class.late')}</span>` : ''}
          ${x.maxPoints > 0 ? html`<span class="gb-pts" title="${t('rubrics.gradebook.cellTitle', { points: R.pointsText(x.points, x.maxPoints), pct: R.percent(x.points, x.maxPoints) })}">📏 ${R.pointsText(x.points, x.maxPoints)} <span class="muted">${R.percent(x.points, x.maxPoints)}%</span></span>` : ''}</a></td>`;
        })}
        <td class="gb-all">${all ? html`<b>${all}</b>` : html`<span class="muted">–</span>`}${p.rubric ? html`<span class="gb-pts">📏 ${p.rubric.pct}%</span>` : ''}</td></tr>`;
    })}</tbody></table></div>`;
  const body = html`
  ${gb.lessons.length && gb.students.length ? html`<div class="row gb-tools" id="gb"><details class="gbhelp" data-open-wide><summary>ⓘ ${t('cs.standards.legend.h')}</summary><p class="small muted">${t('progress.gradebook.text')} ${zoneNote(t, c.school_id)}</p></details><a class="btn btn-sm" href="/class/${c.id}/progress.csv" download>⬇️ ${t('progress.gradebook.csv')}</a></div>` : ''}
  ${toReview.length ? html`<p class="notice gb-review" id="to-review">✍️ <b>${t('progress.gradebook.toReviewList')}</b> ${toReview.map((r, i) => html`${i ? ' · ' : ''}<a href="/class/${c.id}/progress/${r.cl}#answers" dir="auto">${t('progress.gradebook.reviewLink', { title: r.title, count: r.n })}</a>`)}</p>` : ''}
  ${!gb.lessons.length ? html`<section class="panel">${emptyState({ emoji: '📚', title: t('progress.gradebook.noLessons'), text: t('progress.gradebook.noLessonsText') })}</section>`
    : !gb.students.length ? html`<section class="panel">${emptyState({ emoji: '👩‍🎓', title: t('progress.gradebook.noStudents'), text: t('progress.gradebook.noStudentsText') })}</section>`
    : html`<section class="panel">${gb.students.length > 8 ? nameFilter(t, 'gb-lessons') : ''}${table}<p class="small muted gb-key"><span>✅ ${t('progress.key.done')}</span><span><span class="pbar"><span style="width:60%"></span></span> ${t('progress.key.steps')}</span><span class="gb-late-key">⏰ ${t('progress.key.late')}</span><span>✍️ ${t('progress.key.toRead')}</span>${gb.anyRubric ? html`<span>📏 ${t('rubrics.gradebook.key')}</span>` : ''}</p></section>`}`;
  // Courses: per-student completion status, step progress and recorded check scores for every registered
  // course, for this class's students only (the same roster the gradebook above is built from, and the
  // route's own class gate decides who may look). One panel per course in the shared registry, so a
  // course that joins it later (Number Quest) appears here with no extra plumbing.
  const coursePanels = gb.students.length ? C.COURSES.map(course => {
    const rows = C.classCourseProgress(gb.students, C.getCourse(course.slug));
    const dot = s => (s.complete ? '✅' : s.row ? '🟡' : '⚪');
    const started = rows.filter(r => r.status !== 'not-started').length;
    const statusChip = r => (r.status === 'completed' ? html`<span class="chip-s">✅ ${t('progress.courses.completed')}</span>` : r.status === 'in-progress' ? html`<span class="chip-s warn">${t('progress.courses.inProgress')}</span>` : html`<span class="muted">${t('progress.status.none')}</span>`);
    return html`<details class="panel coursepanel" id="course-${course.slug}" ${started ? raw('open') : ''}><summary><h2>${course.emoji} ${t(`${course.key}.title`)}</h2><span class="small muted">${t('progress.courses.started', { started, total: rows.length })}</span></summary>
    <div class="gbwrap" tabindex="0" role="region" aria-label="${t(`${course.key}.title`)}"><table class="tbl gradebook cptable">
      <thead><tr><th scope="col" class="gb-name">${t('school.people.name')}</th><th scope="col">${t('progress.courses.status')}</th><th scope="col">${t('progress.courses.steps')}</th><th scope="col">${t('progress.courses.checks')}</th><th scope="col">${t('progress.courses.perStep')}</th></tr></thead>
      <tbody>${rows.map(r => html`<tr><th scope="row" class="gb-name"><span class="pp">${avatar(r.user, 28)}<b>${nameOf(r.user)}</b></span></th>
        <td data-label="${t('progress.courses.status')}">${statusChip(r)}</td>
        <td data-label="${t('progress.courses.steps')}"><span class="gb-num">${r.done}/${r.total}</span>${bar(r.done, r.total)}</td>
        <td data-label="${t('progress.courses.checks')}">${r.maxScore ? html`<span class="gb-num">${r.score}/${r.maxScore}</span>` : html`<span class="muted">–</span>`}</td>
        <td class="cp-steps" data-label="${t('progress.courses.perStep')}">${r.list.length ? html`<span>${r.list.map(s => html`<span title="${s.step.n} ${s.step.title} — ${s.complete ? t('progress.courses.stepDone') : s.row ? t('progress.courses.stepStarted') : t('progress.status.none')}">${dot(s)}</span>`)}</span>` : html`<span class="muted">–</span>`}</td></tr>`)}</tbody></table></div>
    <p class="small muted">${t('progress.courses.note')}</p></details>`;
  }) : '';
  // Oomba Live: the class's recent live games (results open from here; students' scores are in the saved run).
  // Part 3: a team row for team runs, "Teams for live games" (the class teams editor: live-class-teams.js) and, with
  // LIVE_SAVE_SUPPORT, how many students have saved support (counts only here) with Clear.
  const runs = liveOn() ? liveRuns(c.id, 8) : [];
  const teamsHere = liveOn() && liveTeamsOn() && S.teaches(req.user, c.id);
  const presets = teamsHere || runs.some(r => r.teams) ? presetsFor(t) : [];
  const runTeams = r => { try { const x = r.teams ? JSON.parse(r.teams) : null; return x && Array.isArray(x.list) ? x.list : []; } catch { return []; } };
  const saved = teamsHere ? loadClassTeams(c.id) : null;
  // Saved student data stays visible and deletable after a flag is turned off (or the class is archived): support rows
  // whatever LIVE_SAVE_SUPPORT says now, and saved teams when the teams editor is off.
  const teacher = S.teaches(req.user, c.id);
  const sup = teacher ? liveSupport(c.id) : [];
  const savedOff = teacher && !teamsHere ? loadClassTeams(c.id) : null;
  const livePanel = runs.length || teamsHere || sup.length || savedOff ? html`<section class="panel" id="live-games" aria-labelledby="live-games-h"><h2 id="live-games-h">📡 ${t('live.panel.title')}</h2>
    ${runs.length ? html`<ul class="plain">${runs.map(r => html`<li><a href="/live/results/${r.id}" dir="auto">${r.title || t('live.results.title')}</a> <span class="small muted">${f.day(r.ended_at)} · ${t('live.results.playersCount', { count: r.players })}</span>${runTeams(r).length ? html` <span class="lv-run-teams" aria-label="${t('live.team.heading')}">${runTeams(r).sort((a, b) => (a.rank || 99) - (b.rank || 99)).map(x => presets[x.p] ? html`<span class="lv-team-chip lv-team-chip-sm" style="--team:${presets[x.p].color};--team-ink:${presets[x.p].ink}" title="${presets[x.p].name}"><span aria-hidden="true">${presets[x.p].icon}</span><span class="sr-only">${presets[x.p].name}</span></span>` : '')}</span>` : ''}</li>`)}</ul>` : ''}
    ${teamsHere ? html`<section class="lv-class-teams" id="lv-class-teams" aria-labelledby="lv-class-teams-h" data-api="/api/live/classes/${c.id}/teams">
      <h3 id="lv-class-teams-h">${t('live.team.editor')}</h3>
      <p class="small muted">${t('live.team.editorHint')}</p>
      <p class="small" id="lv-class-teams-state">${saved ? t('live.team.savedCount', { count: saved.plan.size }) : t('live.team.notSaved')}</p>
      <button class="btn btn-sm" type="button" id="lv-class-teams-open">${t('live.team.edit')}</button>
      <div class="lv-class-teams-board" id="lv-class-teams-board" hidden></div>
      ${shapesSprite()}
      ${jsonData('lv-class-teams-data', { classId: c.id, api: `/api/live/classes/${c.id}/teams`, presets, text: { ...teamText(t), save: t('live.settings.save'), cancel: t('live.play.cancel') } })}
    </section>` : ''}
    ${savedOff ? html`<section class="lv-class-teams" id="lv-class-teams-off"><h3>${t('live.team.heading')}</h3><p class="small">${t('live.team.savedCount', { count: savedOff.plan.size })}</p>
      <form class="lv-inline" data-api="/api/live/classes/${c.id}/teams" data-method="DELETE" data-reload data-confirm="${t('live.team.forgetConfirm')}"><button class="btn btn-sm" type="submit">${t('live.team.forgetLast')}</button><p class="err form-err" aria-live="polite"></p></form></section>` : ''}
    ${sup.length ? html`<section class="lv-class-support" id="lv-class-support"><h3>${t('live.dash.support')}</h3><p class="small">${t('live.support.count', { count: sup.length })}</p>
      <form class="lv-inline" data-api="/api/live/classes/${c.id}/support" data-method="DELETE" data-reload data-confirm="${t('live.support.clearConfirm')}"><button class="btn btn-sm" type="submit">${t('live.support.clear')}</button><p class="err form-err" aria-live="polite"></p></form></section>` : ''}
  </section>` : '';
  // Jump chips to the sections below the gradebook (only the ones on this page).
  const nav = gb.students.length ? jumpNav(t, [gb.lessons.length ? ['gb', `📚 ${t('school.classTabs.lessons')}`] : null, ...C.COURSES.map(course => [`course-${course.slug}`, `${course.emoji} ${t(`${course.key}.title`)}`]), livePanel ? ['live-games', `📡 ${t('live.panel.title')}`] : null]) : '';
  page(req, res, { title: `${t('progress.gradebook.title')} · ${c.name}`, active: 'classes', body: html`${classHeader(req, c, 'progress')}${nav}${body}${coursePanels}${livePanel}`, head: CSS, ...classBack(req, c), scripts: ['/js/schools.js', ...(teamsHere && CLASS_TEAMS_JS ? ['/js/live-class-teams.js'] : [])] });
});

/** CSV: one row per student, one column per lesson (steps done of total, '–' before it opens), then Overall (the same
 *  figure as the page: lessons that haven't opened are left out). */
router.get('/class/:id/progress.csv', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const t = req.t;
  const gb = P.classProgress(c.id);
  const cell = v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
  // Rubric points (services/rubrics.js): for each lesson with a rubric, "points/most" and the percentage; then the total.
  const rb = gb.lessons.map(l => !!l.hasRubric || gb.students.some(p => p.cells[gb.lessons.indexOf(l)].maxPoints > 0));
  const anyRb = rb.some(Boolean);
  const head = gb.lessons.flatMap((l, i) => [l.title, ...(rb[i] ? [t('rubrics.csv.points', { title: l.title }), t('rubrics.csv.percent', { title: l.title })] : [])]);
  const lines = [[t('school.people.name'), t('school.people.username'), ...head, t('progress.gradebook.overall'), ...(anyRb ? [t('rubrics.csv.totalPoints'), t('rubrics.csv.totalPercent')] : [])].map(cell).join(',')];
  for (const p of gb.students) {
    const cols = p.cells.flatMap((x, i) => [x.locked ? '–' : `${x.done}/${x.total}`, ...(rb[i] ? (x.maxPoints > 0 ? [R.pointsText(x.points, x.maxPoints), `${R.percent(x.points, x.maxPoints)}%`] : ['', '']) : [])]);
    lines.push([nameOf(p), p.username, ...cols, overallOf(p) || '', ...(anyRb ? (p.rubric ? [R.pointsText(p.rubric.points, p.rubric.max), `${p.rubric.pct}%`] : ['', '']) : [])].map(cell).join(','));
  }
  const file = `${c.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'class'}-progress.csv`;
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="progress.csv"; filename*=UTF-8''${encodeURIComponent(file)}`).send(`﻿${lines.join('\r\n')}\r\n`);
});

/** One lesson, under the class tabs: every student × every step, then the written answers with feedback forms. */
router.get('/class/:cid/progress/:clid', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const lp = P.lessonProgress(req.params.clid);
  if (!lp || lp.cl.class_id !== c.id) return no(req, res);
  const t = req.t, f = req.fmt;
  const l = L.getLesson(lp.cl.lesson_id);
  const doneN = lp.students.filter(p => p.total && p.done >= p.total).length;
  const toRead = lp.students.reduce((n, p) => n + p.toRead, 0);
  const lateFor = L.isOpen(lp.cl) && L.dueState(lp.cl) === 'late' ? p => p.done < p.total : () => false;
  // Rubric marks (CS Quest P11): question and build steps may carry a rubric (lesson_steps.rubric); the teacher gives 0-3
  // per line, kept one character per line in step_progress.marks.
  const rubricOf = s => (L.RUBRIC_KINDS.includes(s.kind) ? L.rubricOf(s) : []);
  // Library rubrics (services/rubrics.js): on a question or build step (rubric_id) and on the whole lesson (lessons.rubric_id).
  const libCache = new Map();
  const libRubric = id => { if (!id) return null; if (!libCache.has(id)) libCache.set(id, R.getRubric(id)); return libCache.get(id); };
  const stepRubric = s => (R.STEP_KINDS.includes(s.kind) ? libRubric(s.rubric_id) : null);
  const scores = R.scoresIn(lp.cl.id);
  const scoreOf = (p, stepId) => scores.get(`${p.id}:${stepId}`) || null;
  const pointsChip = sc => (sc ? html`<span class="chip-s st-pts" dir="ltr">📏 ${R.pointsText(sc.points, sc.max_points)}</span>` : '');
  const marksChip = x => html`<span class="chip-s st-marks" title="${t('cs.review.marksTitle', { marks: marksText(x.marks) })}" dir="ltr">📏 ${marksText(x.marks)}</span>`;
  const icon = (s, x) => {
    if (!x) return html`<span class="st-none" title="${t('progress.status.none')}">–</span><span class="sr-only">${t('progress.status.none')}</span>`;
    const isDone = x.status === 'done';
    const reviewed = x.reviewed_at ? t('progress.lesson.read') : t('progress.lesson.new');
    const extra = s.kind === 'game' && x.score !== null ? html`<span class="st-score" dir="ltr">${f.int(x.score)}${x.label ? ` ${x.label}` : ''}</span>`
      : s.kind === 'question' && x.answer ? html`<span class="${x.reviewed_at ? 'st-read' : 'chip-s warn'}" title="${reviewed}"><span aria-hidden="true">${x.reviewed_at ? '✔️' : '✍️'}</span><span class="sr-only">${reviewed}</span></span>` : '';
    const marks = x.marks && rubricOf(s).length ? html`<span class="st-marks" title="${t('cs.review.marksTitle', { marks: marksText(x.marks) })}" dir="ltr">${marksText(x.marks)}</span>` : '';
    // A game step ticked "I've played it" with no play recorded here (no time, no score): ☑️ "marked done", never the
    // same ✅ as real play. Real play shows how long ("4 min").
    const selfMarked = isDone && s.kind === 'game' && !P.hostedLive(s) && x.score === null && !(x.seconds > 0);
    const played = s.kind === 'game' && x.seconds >= 60 ? html`<span class="st-time small muted">${t('progress.lesson.minutes', { count: Math.round(x.seconds / 60) })}</span>` : '';
    if (selfMarked) return html`<span class="st-done st-self" title="${t('progress.lesson.selfMarked')}">☑️</span><span class="sr-only">${t('progress.lesson.selfMarked')}</span>${marks}`;
    const sc = stepRubric(s) ? scoreOf({ id: x.user_id }, s.id) : null;
    return html`<span class="${isDone ? 'st-done' : 'st-started'}" title="${isDone ? t('progress.status.done') : t('progress.status.started')}">${isDone ? '✅' : '◐'}</span><span class="sr-only">${isDone ? t('progress.status.done') : t('progress.status.started')}</span>${extra}${played}${marks}${sc ? html`<span class="st-marks" dir="ltr">${R.pointsText(sc.points, sc.max_points)}</span>` : ''}`;
  };
  const hasGame = lp.steps.some(s => s.kind === 'game' && !P.hostedLive(s));
  const games_ = new Map(lp.steps.filter(s => s.kind === 'build').flatMap(s => lp.students.map(p => p.cells[lp.steps.indexOf(s)])).filter(x => x && x.game_id).map(x => [x.game_id, games.getGame(x.game_id)]));
  const questions = lp.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'question');
  const fullSteps = L.steps(l.id);
  const byReview = (a, b) => (!!a.x.reviewed_at - !!b.x.reviewed_at) || (b.x.updated_at - a.x.updated_at);
  // The rubric's radios (one row per line, '–' = not marked) and "Also mark these teammates" (the other students of the class).
  const rubricFields = (s, x, p) => {
    const rub = rubricOf(s); if (!rub.length) return '';
    const mates = lp.students.filter(o => o.id !== p.id);
    return html`<div class="rubric" role="group" aria-label="${t('cs.review.rubric')}">
      ${rub.map((line, i) => { const cur = (x && x.marks && x.marks[i]) || '-'; return html`<fieldset class="rubric-line"><legend><b dir="auto">${line.line}</b>${line.ids && line.ids.length ? html` <span class="small muted" lang="en" dir="ltr">${line.ids.join(', ')}</span>` : ''}</legend>
        <div class="rubric-opts">${['-', '0', '1', '2', '3'].map(v => html`<label class="${cur === v ? 'on' : ''}" title="${v === '-' ? t('cs.review.notMarked') : (line.levels && line.levels[+v]) || v}"><input type="radio" name="mark-${i}" value="${v}" ${cur === v ? raw('checked') : ''}><span>${v === '-' ? '–' : v}</span></label>`)}</div>
        ${line.levels && line.levels.length ? html`<p class="small muted rubric-levels" dir="auto">${line.levels.map((d, k) => html`${k ? ' · ' : ''}<b>${k}</b> ${d}`)}</p>` : ''}</fieldset>`; })}
      ${mates.length ? html`<details class="rubric-also"><summary class="small">👥 ${t('cs.review.alsoMark')}</summary><p class="small muted">${t('cs.review.alsoMarkHint')}</p>
        <div class="rubric-mates">${mates.map(o => html`<label class="chk"><input type="checkbox" name="alsoMark" value="${o.id}"> ${nameOf(o)}</label>`)}</div></details>` : ''}</div>`;
  };
  const reviewForm = (s, x, p) => html`<form class="ac-form" data-api="/api/progress/${lp.cl.id}/${s.id}/${p.id}/review" data-reload novalidate>
    ${rubricFields(s, x, p)}
    ${stepRubric(s) ? scoreFields(t, stepRubric(s), scoreOf(p, s.id), `rs-${s.id}-${p.id}`) : ''}
    <label class="sr-only" for="fb-${s.id}-${p.id}">${t('progress.lesson.feedback')}</label>
    <textarea class="input" id="fb-${s.id}-${p.id}" name="feedback" rows="2" maxlength="2000" placeholder="${t('progress.lesson.feedbackPlaceholder')}">${x.feedback}</textarea>
    <div class="row"><button class="btn btn-primary btn-sm" type="submit">${x.reviewed_at ? `💬 ${t('progress.lesson.update')}` : `✔️ ${t('progress.lesson.send')}`}</button></div>
  </form>`;
  const answers = questions.map(({ s, i }) => {
    const list = lp.students.map(p => ({ p, x: p.cells[i] })).filter(({ x }) => x && x.answer).sort(byReview);
    const q = fullSteps.find(x => x.id === s.id);
    return html`<section class="panel answers" aria-labelledby="q-${s.id}"><h2 id="q-${s.id}">✍️ ${t('progress.lesson.question', { n: i + 1 })}</h2>
      <p class="q-text" dir="auto">${q ? q.body : ''}</p>
      ${list.length ? html`<ul class="plain answerlist">${list.map(({ p, x }) => html`<li class="answercard ${x.reviewed_at ? 'is-read' : ''}" id="a-${s.id}-${p.id}">
        <div class="ac-head"><span class="pp">${avatar(p, 28)}<b>${nameOf(p)}</b></span><span class="small muted">${f.ago(x.updated_at)}</span>${x.reviewed_at ? html`<span class="chip-s">✔️ ${t('progress.lesson.read')}</span>` : html`<span class="chip-s warn">✍️ ${t('progress.lesson.new')}</span>`}${x.marks && rubricOf(s).length ? marksChip(x) : ''}${pointsChip(stepRubric(s) && scoreOf(p, s.id))}</div>
        <p class="ac-answer" dir="auto">${x.answer}</p>
        ${reviewForm(s, x, p)}</li>`)}</ul>` : html`<p class="muted">${t('progress.lesson.noAnswers')}</p>`}
    </section>`;
  });
  // Build steps with a rubric (the capstone): every student with a row (started, handed in, or marked as a teammate).
  const builds = lp.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'build' && (rubricOf(s).length || stepRubric(s))).map(({ s, i }) => {
    const list = lp.students.map(p => ({ p, x: p.cells[i] })).filter(({ x }) => x).sort(byReview);
    return html`<section class="panel answers" aria-labelledby="b-${s.id}"><h2 id="b-${s.id}">🛠️ ${s.title || t('lessons.kinds.build')}</h2>
      ${list.length ? html`<ul class="plain answerlist">${list.map(({ p, x }) => { const g = x.game_id ? games_.get(x.game_id) : null; return html`<li class="answercard ${x.reviewed_at ? 'is-read' : ''}" id="a-${s.id}-${p.id}">
        <div class="ac-head"><span class="pp">${avatar(p, 28)}<b>${nameOf(p)}</b></span><span class="small muted">${f.ago(x.updated_at)}</span>${x.status === 'done' ? html`<span class="chip-s">📤 ${t('progress.student.handedInText')}</span>` : ''}${x.marks ? marksChip(x) : ''}${pointsChip(stepRubric(s) && scoreOf(p, s.id))}</div>
        ${g && g.status === 'published' && games.canView(req.user, g) ? html`<p><a href="/g/${g.slug}">🎮 ${t('progress.lesson.openGame')}</a></p>` : ''}
        ${reviewForm(s, x, p)}</li>`; })}</ul>` : html`<p class="muted">${t('cs.review.noHandIns')}</p>`}
    </section>`;
  });
  // The whole lesson's rubric: one card per student, scored with the levels, a comment per criterion and feedback.
  const lessonRb = libRubric(l.rubric_id);
  const whole = lessonRb && lp.students.length ? html`<section class="panel answers" id="lesson-rubric" aria-labelledby="lr-h"><h2 id="lr-h">📏 ${t('rubrics.attach.lessonTitle')}</h2>
    <p class="small muted">${t('rubrics.score.lessonHint')}</p>
    <ul class="plain answerlist">${lp.students.map(p => { const sc = scoreOf(p, ''); return html`<li class="answercard ${sc ? 'is-read' : ''}" id="lr-${p.id}"><details class="lr-det">
      <summary class="ac-head"><span class="pp">${avatar(p, 28)}<b>${nameOf(p)}</b></span><span class="small muted">${t('progress.student.doneOf', { done: p.done, total: p.total })}</span>${sc ? html`<span class="chip-s">✔️ ${t('rubrics.score.scored')}</span>` : ''}${pointsChip(sc)}</summary>
      <form class="ac-form" data-api="/api/rubric-scores/${lp.cl.id}/${p.id}" data-reload novalidate>
        ${scoreFields(t, lessonRb, sc, `lr-${p.id}`)}
        <label class="sr-only" for="lrf-${p.id}">${t('progress.lesson.feedback')}</label>
        <textarea class="input" id="lrf-${p.id}" name="feedback" rows="2" maxlength="${R.LIMITS.feedback}" placeholder="${t('progress.lesson.feedbackPlaceholder')}" dir="auto">${sc ? sc.feedback : ''}</textarea>
        <div class="row"><button class="btn btn-primary btn-sm" type="submit">${sc ? `💬 ${t('progress.lesson.update')}` : `✔️ ${t('progress.lesson.send')}`}</button></div>
      </form></details></li>`; })}</ul></section>` : '';
  const lateN = lp.students.filter(lateFor).length;
  const body = html`${classHeader(req, c, 'progress')}
  <div class="lphead"><div><h2 dir="auto">${l.title}</h2>
    <p class="muted lp-meta"><span>${t('progress.lesson.finished', { done: doneN, total: lp.students.length })}</span>${dateChips(t, f, lp.cl, { late: lateN > 0 })}</p></div>
    <div class="row"><a class="btn" href="/class/${c.id}/lessons/${lp.cl.id}">👀 ${t('progress.lesson.studentView')}</a>${L.canEditLesson(req.user, l) ? html`<a class="btn" href="/teach/lessons/${l.id}?from=${c.id}">✏️ ${t('lessons.class.editLesson')}</a>` : ''}</div></div>
  ${toRead ? html`<p class="notice" id="to-review">✍️ ${t('progress.gradebook.toRead', { count: toRead })} · <a href="#answers">${t('progress.lesson.jump')}</a></p>` : ''}
  ${!lp.students.length ? html`<section class="panel">${emptyState({ emoji: '👩‍🎓', title: t('progress.gradebook.noStudents'), text: t('progress.gradebook.noStudentsText') })}</section>`
    : !lp.steps.length ? html`<section class="panel"><p class="muted">${t('lessons.lesson.noSteps')}</p></section>`
    : html`<section class="panel">${lp.students.length > 3 ? html`<div class="row gb-sort" hidden><button class="chip" type="button" aria-pressed="false" data-sort="lp-steps">⚠️ ${t('progress.lesson.attention')}</button></div>` : ''}<p class="small muted gb-swipe" aria-hidden="true">${t('progress.lesson.swipe')} →</p><div class="gbwrap" tabindex="0" role="region" aria-label="${l.title}"><table class="tbl gradebook steps" id="lp-steps">
      <thead><tr><th scope="col" class="gb-name">${t('school.people.name')}</th>${lp.steps.map((s, i) => html`<th scope="col" title="${s.title || t(`lessons.kinds.${s.kind}`)}"><span aria-hidden="true">${KIND_ICON[s.kind]}</span> ${i + 1}<span class="gb-step">${s.title || t(`lessons.kinds.${s.kind}`)}</span></th>`)}<th scope="col">${t('progress.lesson.lastActive')}</th></tr></thead>
      <tbody>${lp.students.map(p => html`<tr id="s-${p.id}" data-attn="${(p.toRead ? 4 : 0) + (lateFor(p) ? 2 : 0) + (p.done && p.done < p.total ? 1 : 0)}"><th scope="row" class="gb-name"><span class="pp">${avatar(p, 28)}<b>${nameOf(p)}</b></span><span class="small muted gb-sub"><span>${p.done}/${p.total}</span>${lateFor(p) ? html`<span class="gb-late-mark" title="${t('lessons.class.late')}"><span aria-hidden="true">⏰</span><span class="sr-only">${t('lessons.class.late')}</span></span>` : ''}${p.toRead && p.firstNew ? html`<a class="chip-s warn" href="#a-${p.firstNew}-${p.id}" title="${t('progress.gradebook.toRead', { count: p.toRead })}">✍️ ${p.toRead}<span class="sr-only"> ${t('progress.gradebook.toRead', { count: p.toRead })}</span></a>` : ''}</span></th>
        ${lp.steps.map((s, i) => { const x = p.cells[i]; const g = s.kind === 'build' && x && x.game_id ? games_.get(x.game_id) : null;
          return html`<td><span class="st">${icon(s, x)}</span>${g && g.status === 'published' && games.canView(req.user, g) ? html`<a class="small" href="/g/${g.slug}">${t('progress.lesson.openGame')}</a>` : ''}${s.kind === 'question' && x && x.answer ? html`<a class="small" href="#a-${s.id}-${p.id}">${t('progress.lesson.readAnswer')}</a>` : ''}</td>`; })}
        <td class="small muted">${p.last ? f.ago(p.last) : '–'}</td></tr>`)}</tbody></table></div>
      <p class="small muted gb-key"><span>✅ ${t('progress.key.done')}</span><span>◐ ${t('progress.status.started')}</span>${hasGame ? html`<span id="key-self">☑️ ${t('progress.lesson.selfMarked')}</span>` : ''}</p></section>`}
  ${questions.length || builds.length ? html`<div id="answers">${answers}${builds}</div>` : ''}
  ${whole}`;
  page(req, res, { title: `${l.title} · ${c.name}`, active: 'classes', body, head: CSS, scripts: ['/js/schools.js'], back: `/class/${c.id}/progress`, backLabel: t('progress.gradebook.title') });
});

/** Feedback and, on question / build steps with a rubric, marks: { feedback?, marks?: [2, 3, '-', 1] | '23-1' } or the
 *  form's mark-<i> fields; alsoMark?: classmates who get the same marks (CS Quest P11). A field left out is left as it
 *  is: no feedback key keeps the feedback, a line with no mark keeps its mark; '-' un-marks a line, '' clears the feedback
 *  (the form always sends both, so the page behaves as it always did). See services/progress.js review(). */
router.post('/api/progress/:clid/:sid/:uid/review', requireUser, (req, res) => {
  const body = b(req);
  let marks = body.marks;
  if (marks === undefined) {
    const idx = Object.keys(body).map(k => /^mark-(\d{1,2})$/.exec(k)).filter(Boolean).map(m => +m[1]);
    if (idx.length) { marks = []; for (let i = 0; i <= Math.max(...idx); i++) marks.push(body[`mark-${i}`] === undefined ? undefined : String(body[`mark-${i}`])); }
  }
  const alsoMark = body.alsoMark === undefined ? [] : [].concat(body.alsoMark).map(String);
  // A library rubric on the step (services/rubrics.js): lvl-<i> / cmt-<i> (or picks / comments), checked before anything is saved.
  const sc = scoreInput(body);
  if (sc) {
    const x = R.scoreContext(req.user, req.params.clid, req.params.sid, req.params.uid);
    if (!x.ok) return no(req, res);
    if (!R.cleanScore(x.rubric, sc, R.getScore(req.params.clid, req.params.sid, req.params.uid)).ok) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: 'badScore' });
  }
  const r = P.review(req.user, req.params.clid, req.params.sid, req.params.uid, body.feedback, { marks, alsoMark });
  if (!r.ok && r.code === 'badMarks') return res.status(400).json({ error: req.t('errors.api.badRequest'), code: r.code });
  if (!r.ok) return send(req, res, r);
  const saved = sc ? R.saveScore(req.user, req.params.clid, req.params.sid, req.params.uid, sc) : null;
  send(req, res, r, { marks: r.marks, alsoMarked: r.alsoMarked, ...(saved && saved.ok ? { points: saved.score ? saved.score.points : null } : {}) });
});
/** The whole lesson's rubric for one student: { lvl-<i> | picks, cmt-<i> | comments, feedback } (teachers of the class). */
router.post('/api/rubric-scores/:clid/:uid', requireUser, (req, res) => {
  const body = b(req), sc = scoreInput(body) || {};
  const r = R.saveScore(req.user, req.params.clid, R.LESSON, req.params.uid, { ...sc, feedback: body.feedback });
  if (!r.ok) return r.code === 'badScore' ? res.status(400).json({ error: req.t('errors.api.badRequest'), code: r.code }) : no(req, res);
  res.json({ ok: true, points: r.score ? r.score.points : null });
});

// ================================================================ the lesson as the class sees it (with each student's progress)
const paras = text => String(text || '').split(/\n{2,}/).filter(Boolean).map(p => html`<p dir="auto">${p.split('\n').map((line, i) => html`${i ? raw('<br>') : ''}${line}`)}</p>`);
router.get('/class/:cid/lessons/:clid', requireUser, (req, res) => {
  const t = req.t, f = req.fmt, u = req.user;
  const cl = L.getClassLesson(req.params.clid);
  if (!cl || cl.class_id !== req.params.cid || !L.canViewClassLesson(u, cl)) return no(req, res);
  // QUIZ_STEPS off: quiz steps are left off the page (an emergency switch; the gradebook still counts them).
  const c = S.getClass(cl.class_id), l = L.getLesson(cl.lesson_id), st = L.steps(l.id).filter(s => config.quizSteps || s.kind !== 'quiz');
  const teacher = S.canManageClass(u, c);
  const student = !teacher && S.classMember(c.id, u.id)?.role === 'student';
  const mine = student ? P.forStudent(cl.id, u.id) : {};
  // Rubric results (services/rubrics.js): this student's own, never anyone else's.
  const myScores = student ? R.scoresFor(cl.id, u.id) : {};
  /** "From your teacher": the written feedback and, when the work was scored with a rubric, the result. */
  const fromTeacher = (s, x, { feedback, none = '' }) => {
    const sc = myScores[s.id] || null;
    if (!sc) return feedback;
    return html`<div class="feedback fromteacher"><b>💬 ${t('progress.student.feedback')}</b>${x && x.reviewed_at && x.feedback ? html`<p dir="auto">${x.feedback}</p>` : none}${resultView(t, sc)}</div>`;
  };
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
      if (!L.playableBy(s, c.school_id, c.id)) return html`<p class="notice warn">${t('lessons.view.notReady')}</p>`;
      // A live-only game (Quest Race, Would You Rather Live…): the teacher hosts it; the live run writes the score here.
      if (hostedLive(s)) return html`<p class="notice sc-hosted">📡 ${t('cs.step.hostedLive')}</p>
        ${x && x.score !== null ? html`<p class="sc-score">🏆 ${t('progress.student.best', { score: f.int(x.score) })}</p>` : ''}`;
      return html`<div class="row"><a class="btn btn-primary btn-big" href="${playHref(s, cl)}">▶ ${t('lessons.view.play', { title: s.game_title })}</a></div>
        ${x && x.score !== null ? html`<p class="sc-score">🏆 ${t('progress.student.best', { score: f.int(x.score) })}</p>` : ''}
        ${isDone ? '' : html`<p class="small muted">${t('progress.student.gameHint')}</p><form data-api="${api(s)}/done" data-reload><input type="hidden" name="done" value="1"><button class="btn btn-sm" type="submit">✅ ${t('progress.student.played')}</button></form>`}`;
    }
    if (s.kind === 'build') {
      const g = x && x.game_id ? games.getGame(x.game_id) : null;
      if (!g || g.status === 'deleted') return html`<form data-api="${api(s)}/build"><button class="btn btn-primary btn-big" type="submit">🛠️ ${t('lessons.view.build')}</button></form>`;
      // The teacher's written feedback on the build (the rubric marks themselves stay with the teacher).
      const fb = fromTeacher(s, x, { feedback: x.reviewed_at && x.feedback ? html`<div class="feedback"><b>💬 ${t('progress.student.feedback')}</b><p dir="auto">${x.feedback}</p></div>` : '' });
      if (isDone) return html`<p class="sc-score">📤 ${t('progress.student.handedInText')}</p><div class="row">${g.status === 'published' ? html`<a class="btn" href="/g/${g.slug}">🎮 ${t('progress.student.seeGame')}</a>` : ''}<a class="btn" href="/studio/${g.id}">🛠️ ${t('progress.student.keepBuilding')}</a></div>${fb}`;
      return html`<div class="row"><a class="btn btn-primary" href="/studio/${g.id}">🛠️ ${t('progress.student.keepBuilding')}</a>
        <form data-api="${api(s)}/hand-in" data-reload data-confirm="${t('progress.student.handInConfirm')}"><button class="btn" type="submit">📤 ${t('progress.student.handIn')}</button></form></div>
        <p class="small muted">${t('progress.student.handInHint')}</p>${fb}`;
    }
    // A quiz step (an exit ticket, or homework from a live question set): one question at a time, big buttons with
    // shapes, Read aloud, no timer; the server checks each answer once (public/js/live-quiz-step.js; QUIZ_STEPS).
    if (s.kind === 'quiz') return html`<section class="lv-qstep" data-api="/api/progress/${cl.id}/${s.id}/quiz" data-cl="${cl.id}" data-step="${s.id}" data-lang="${req.locale}" data-tts="${ttsOnLocales().join(',')}" aria-live="polite">
      ${isDone ? html`<p class="sc-score">🏆 ${t('lessons.quiz.done', { score: x.score ?? 0 })}</p>` : html`<button class="btn btn-primary btn-big lv-qstep-go" type="button">▶ ${t('lessons.quiz.start')}</button>`}
      ${jsonData(`lv-qstep-${s.id}`, { right: t('lessons.quiz.right'), wrong: t('lessons.quiz.wrong'), next: t('lessons.quiz.next'), of: t('lessons.quiz.of'), done: t('lessons.quiz.done'), read: t('live.play.read'), aiVoice: t('live.play.aiVoice', { provider: 'OpenAI' }) })}
    </section>`;
    if (s.kind === 'question') return html`
      <form class="answerform" data-api="${api(s)}/answer" data-reload novalidate>
        <label class="sr-only" for="ans-${s.id}">${t('progress.student.yourAnswer')}</label>
        <textarea class="input" id="ans-${s.id}" name="answer" rows="4" maxlength="3000" placeholder="${t('progress.student.answerPlaceholder')}" required>${x ? x.answer : ''}</textarea><span class="err" id="ans-${s.id}-err"></span>
        <div class="row"><button class="btn btn-primary" type="submit">${x && x.answer ? `✏️ ${t('progress.student.updateAnswer')}` : `📨 ${t('progress.student.sendAnswer')}`}</button>${x && x.answer ? html`<span class="small muted">${t('progress.student.sentAgo', { when: f.ago(x.updated_at) })}</span>` : ''}</div>
      </form>
      ${fromTeacher(s, x, { feedback: x && x.answer && x.reviewed_at ? html`<div class="feedback"><b>💬 ${t('progress.student.feedback')}</b>${x.feedback ? html`<p dir="auto">${x.feedback}</p>` : html`<p class="muted">${t('progress.student.readNoFeedback')}</p>`}</div>` : '' })}`;
    return '';
  };
  // Teachers see the lesson as students do, with nothing that saves work; a game step gets a plain Play link (no lesson
  // tracking), so they can try the game.
  // A live-ready game step can also be hosted live for the class (Oomba Live): its scores count for this step.
  // A built-in live mode (Quest Race, Would You Rather Live…) has no game card on /live: its link picks the mode instead
  // (server/live/live-games.js), and the run still binds to this step (classlive-sessions resolves the mode's game).
  const hostLive = s => {
    if (!s.game_id || !liveHostOk(u)) return '';
    const g = games.getGame(s.game_id), lg = liveGameOf(g);
    if (!lg && !gameLiveReady(g)) return '';
    return html`<a class="btn" href="/live?cl=${cl.id}&step=${s.id}&${lg ? `mode=${lg.mode}` : `game=${s.game_id}`}">📡 ${t('live.entry.hostLive')}</a>`;
  };
  const preview = s => (s.kind !== 'game' ? '' : !L.playableBy(s, c.school_id, c.id) ? html`<p class="notice warn">${t('lessons.view.notReady')}</p>`
    : s.game_slug ? html`<div class="row"><a class="btn" href="${playHref(s, null)}">▶ ${t('lessons.view.play', { title: s.game_title })}</a>${hostLive(s)}</div>` : '');
  const quizLive = teacher && liveHostOk(u) && st.some(s => s.kind === 'question')
    ? html`<form data-api="/api/live/sets/from-lesson/${l.id}"><button class="btn" type="submit">📡 ${t('live.entry.quizLesson')}</button></form>` : '';
  const late = student && L.isOpen(cl) && L.dueState(cl) === 'late' && doneN < st.length;
  const body = html`
  <div class="pagehead"><div><h1 dir="auto">${l.title}</h1>
    <p class="muted lp-meta"><span>${t('lessons.stepsN', { count: st.length })}</span>${dateChips(t, f, cl, { late })}</p></div>
    ${student ? studentNotYou(req, true) : ''}
    ${teacher ? html`<div class="row">${quizLive}<a class="btn" href="/class/${c.id}/progress/${cl.id}">📊 ${t('progress.lesson.seeProgress')}</a>${L.canEditLesson(u, l) ? html`<a class="btn" href="/teach/lessons/${l.id}?from=${c.id}">✏️ ${t('lessons.class.editLesson')}</a>` : ''}</div>` : ''}</div>
  ${teacher ? html`<p class="notice">👀 ${t('lessons.view.teacherPreview')}</p>` : ''}
  ${student && st.length ? html`<div class="lessonprogress ${doneN >= st.length ? 'all' : ''}" role="status"><span>${doneN >= st.length ? `🎉 ${t('progress.student.allDone')}` : t('progress.student.doneOf', { done: doneN, total: st.length })}</span>${bar(doneN, st.length)}</div>` : ''}
  ${l.summary ? html`<div class="panel">${student ? html`<h2 class="lp-about">📝 ${t('progress.student.about')}</h2>` : ''}${paras(l.summary)}</div>` : ''}
  <ol class="plain steplist">${st.map((s, i) => { const x = mine[s.id]; return html`<li class="panel stepcard ${x && x.status === 'done' ? 'is-done' : ''}" id="step-${s.id}">
    <div class="sc-head"><span class="sc-num">${x && x.status === 'done' ? '✓' : i + 1}</span><span class="sc-kind" aria-hidden="true">${KIND_ICON[s.kind]}</span>
      <div class="sc-title"><b dir="auto">${s.title || t(`lessons.kinds.${s.kind}`)}</b>${s.minutes ? html`<span class="small muted">${t('lessons.minutesN', { count: s.minutes })}</span>` : ''}</div>${status(x)}
      ${student && s.body ? html`<button class="btn btn-sm sc-read" type="button" data-read-step="step-${s.id}" hidden>🔊 ${t('progress.student.readToMe')}</button>` : ''}</div>
    ${s.kind === 'build' ? html`<p class="sc-build" dir="auto">💬 “${s.body}”</p>` : s.kind === 'question' ? html`<div class="sc-body q-text">${paras(s.body)}</div>` : s.body ? html`<div class="sc-body">${paras(s.body)}</div>` : ''}
    ${student ? actions(s, x) : teacher ? preview(s) : s.kind === 'game' && !L.playableBy(s, c.school_id, c.id) ? html`<p class="notice warn">${t('lessons.view.notReady')}</p>` : ''}
  </li>`; })}</ol>
  ${myScores[R.LESSON] ? html`<section class="panel" id="from-teacher"><h2>💬 ${t('rubrics.student.fromTeacherLesson')}</h2>${myScores[R.LESSON].feedback ? html`<div class="feedback"><p dir="auto">${myScores[R.LESSON].feedback}</p></div>` : ''}${resultView(t, myScores[R.LESSON])}</section>` : ''}`;
  page(req, res, { title: l.title, active: 'classes', mid: true, body, head: CSS, back: `/class/${c.id}`, backLabel: c.name, ...(student ? { scripts: ['/js/lesson-read.js', ...(st.some(s => s.kind === 'quiz') ? ['/js/live-quiz-step.js'] : [])] } : {}) });
});
/** A quiz step's questions for the student (never the answers) and their marks so far; one answer at a time, checked
 *  here once (public/js/live-quiz-step.js). QUIZ_STEPS gates both. */
router.get('/api/progress/:clid/:sid/quiz', requireUser, quizStepsOn, (req, res) => {
  const r = P.quizFor(req.user, req.params.clid, req.params.sid);
  if (!r.ok) return no(req, res);
  res.set('Cache-Control', 'no-store');
  res.json({ items: r.items, marks: r.marks });
});
/** A whole number as the quiz script sends it (a number or a digit string); anything else is NaN, which quizAnswer refuses. */
const whole = v => (typeof v === 'number' || (typeof v === 'string' && /^\d{1,6}$/.test(v)) ? +v : NaN);
router.post('/api/progress/:clid/:sid/quiz', requireUser, quizStepsOn, rateLimit('progress', 240, 60e3), (req, res) => {
  const r = P.quizAnswer(req.user, req.params.clid, req.params.sid, whole(b(req).i), whole(b(req).c));
  if (!r.ok) return r.code === 'notFound' ? no(req, res) : res.status(400).json({ error: req.t('errors.api.badRequest'), code: r.code });
  res.json({ ok: r.right, answer: r.answer, next: r.next, score: r.score });
});
/** A build step: the student's own Studio game for it (made the first time, reopened after), with the teacher's idea in
 *  the Builder box. A step with a Studio template (lesson_steps.template, e.g. the capstone's Quiz Show) starts from that
 *  template's game, exactly as "Start from" in the Studio does (routes/studio.js). */
router.post('/api/progress/:clid/:sid/build', requireUser, rateLimit('studio-new', 30, 3600e3, 'studio.api.tooManyGames'), async (req, res) => {
  const c = P.context(req.user, req.params.clid, req.params.sid);
  if (!c.ok || c.step.kind !== 'build') return no(req, res);
  if (req.user.is_guest) return no(req, res);
  const row = P.get(c.cl.id, c.step.id, req.user.id);
  const old = row && row.game_id && games.getGame(row.game_id);
  if (old && old.owner_id === req.user.id && old.status !== 'deleted') return res.json({ ok: true, redirect: `/studio/${old.id}` });
  if (!req.user.builder_enabled) return res.status(403).json({ error: req.t('studio.api.buildingOff') });
  const l = L.getLesson(c.cl.lesson_id);
  const key = TEMPLATE_KEYS.includes(c.step.template) ? c.step.template : '';
  const info = key ? await templateInfo(key) : null;
  const g = games.createGame(req.user.id, { title: (c.step.title || l.title).slice(0, 60), icon: '🎓', category: 'learning', ...(info ? { cover: info.cover, players_max: info.players || 1, tags: key } : {}) });
  if (key) {
    const { html: tpl } = await templateHtml(key);
    const { html: clean } = sanitizeGameHtml(tpl);
    const report = scanVersion(clean);
    games.addVersion(g.id, clean, { notes: req.t('studio.startedFrom', { title: info.title }), createdBy: req.user.id, safetyStatus: report.status, safetyReport: report });
  }
  P.buildGame(req.user, c.cl.id, c.step.id, g.id);
  res.json({ ok: true, redirect: `/studio/${g.id}?ask=${encodeURIComponent(c.step.body.slice(0, 300))}` });
});
