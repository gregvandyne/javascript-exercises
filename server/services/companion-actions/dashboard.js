// Oomba's action cards for a class dashboard (registry: ./index.js; helpers: ./shared.js; strings:
// js.companion.act.dashboard.*). Each calls the same service as the dashboard's own route (routes/dash.js ->
// services/dash.js), with the same rule: only the class's own teacher (D.isTeacher, the route's load({ teacher: true })).
// The dashboard's state is in the database, so every action here is checked in a dry run before its card is shown.
// Students' names never go to the AI: Pick a name tells it only that a student was picked; the name is on the
// teacher's own card (doneView), read from the student's id kept on the change.
import { q } from '../../db.js';
import * as S from '../schools.js';
import * as D from '../dash.js';
import * as games from '../games.js';
import { isOfficial } from '../classlive-access.js';
import { gameHidden } from '../game-focus.js';
import { no, clean, fold, whichClass, className, studentName, P, CLASS_REF } from './shared.js';

const dashLink = (classId, t) => ({ href: `/class/${encodeURIComponent(classId)}/dashboard`, label: t('js.companion.cls.openDash') });
/** The class, on a dashboard this teacher runs. -> { c } | { ask } | { error } */
const dashClass = (u, ctx, ref) => whichClass(u, ctx, ref, { fit: c => D.isTeacher(u, c) });
/** The class again at the tap (still the teacher's own dashboard), or null. */
const own = (u, classId) => { const c = S.getClass(String(classId || '')); return c && D.isTeacher(u, c) ? c : null; };
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

// ---------------------------------------------------------------- timers (POST /api/dash/:id/timers/:wid, D.timerAction)
const timersOn = (u, c) => { const l = D.currentLayout(u, c); return l ? l.widgets.filter(w => D.TIMER_TYPES.includes(w.type)) : []; };
const timerWord = w => (D.timerMode(w) === 'down' ? `${w.s.minutes || 5}-minute timer` : 'stopwatch');
/** Which timer of the dashboard on the teacher's screen. -> { w } | { error } */
function timerIn(c, u, n) {
  const list = timersOn(u, c);
  if (!list.length) return no('The class dashboard on the teacher\'s screen has no timer: they add a Timer widget there first.');
  if (list.length === 1 && !n) return { w: list[0] };
  const k = Math.floor(Number(n));
  if (!(k >= 1 && k <= list.length)) return no(`The dashboard has ${list.length} timers: ${list.map((w, i) => `timer ${i + 1} (${timerWord(w)})`).join(', ')}. Ask the teacher which one.`);
  return { w: list[k - 1] };
}
const timerState = (c, wid) => json(D.classState(c.id).timers, {})[wid] || null;
const TIMER_PARAMS = { classRef: CLASS_REF, timer: { type: 'integer', description: 'Which timer when the dashboard has several: 1 for the first. Leave out when it has one.' } };
function timerAction(id, action, label, extra = {}) {
  return {
    id, area: 'dashboard', risk: 'normal', undoable: false,
    label, params: { ...TIMER_PARAMS, ...extra },
    plan(u, ctx, p) {
      const w = dashClass(u, ctx, p.classRef); if (!w.c) return w;
      const tm = timerIn(w.c, u, p.timer); if (!tm.w) return tm;
      let ms = null;
      if (action === 'start' && p.minutes !== undefined && p.minutes !== null && p.minutes !== '') {
        if (D.timerMode(tm.w) !== 'down') return no('A stopwatch has no minutes: leave them out.');
        const m = Number(p.minutes);
        if (!(m > 0 && m * 60e3 <= D.MAX_TIMER_MS)) return no('The minutes must be between 1 and 180.');
        ms = Math.round(m * 60e3);
      }
      return { data: { classId: w.c.id, wid: tm.w.id, ...(ms ? { ms } : {}) }, ai: `${action[0].toUpperCase()}${action.slice(1)} the ${timerWord(tm.w)} on the ${clean(ctx, w.c.name)} dashboard${ms ? ` at ${ms / 60e3} minutes` : ''}.` };
    },
    view: (u, d, t) => ({ title: t(`js.companion.act.dashboard.timer.${action}Ask`, { class: className(d.classId) }), lines: d.ms ? [t('js.companion.act.dashboard.timer.minutes', { count: d.ms / 60e3 })] : [] }),
    run(u, d) {
      const c = own(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      if (d.ms) { const r = D.timerAction(u, c, d.wid, { action: 'set', ms: d.ms }); if (r.error) return { ok: false, code: r.error }; }
      const r = D.timerAction(u, c, d.wid, { action }); if (r.error) return { ok: false, code: r.error };
      const st = timerState(c, d.wid);
      const landed = !!st && (action === 'start' ? st.on : action === 'pause' ? !st.on : !st.on && !st.base) && (!d.ms || st.dur === d.ms);
      return { ok: true, landed, done: { classId: c.id, ...(d.ms ? { ms: d.ms } : {}) } };
    },
    doneView: (u, d, t) => ({ lines: [t(`js.companion.act.dashboard.timer.${action}Done`, { class: className(d.classId) }), ...(d.ms ? [t('js.companion.act.dashboard.timer.minutes', { count: d.ms / 60e3 })] : [])], links: [dashLink(d.classId, t)] }),
  };
}

// ---------------------------------------------------------------- quick checks (POST /api/dash/:id/checks, D.createCheck)
const openCheck = c => q.get('SELECT id, kind, question FROM dash_checks WHERE class_id=? AND ended_at IS NULL ORDER BY created_at DESC, rowid DESC', c.id) || null;
const checkLines = (d, t) => [...(d.question ? [d.question] : []), d.kind === 'choice' ? t('js.companion.act.dashboard.check.choice', { options: d.options.join(', ') }) : t(`js.companion.act.dashboard.check.${d.kind}`)];

// ---------------------------------------------------------------- pushes (POST /api/dash/:id/pushes, D.push)
/** An official game the class's students can open (not hidden: game-focus.js), by words of its title. -> { g } | { error } */
function gameFor(u, c, ctx, words) {
  const w = String(words || '').trim();
  if (!w) return no('Say which game.');
  const fits = games.search(u, { text: w.slice(0, 60), limit: 40 }).filter(g => isOfficial(g) && !gameHidden(g) && D.pushableGame(c, g));
  const exact = fits.filter(g => fold(g.title) === fold(w));
  const hit = exact.length ? exact : fits.filter(g => fold(g.title).includes(fold(w)));
  if (hit.length === 1) return { g: hit[0] };
  if (!hit.length) return no(fits.length ? `No game has that title. Close: ${fits.slice(0, 8).map(g => `"${clean(ctx, g.title, 60)}"`).join(', ')}.` : 'No official game the class can open has that name (a game that is switched off on the site cannot be sent).');
  return no(`More than one game fits: ${hit.slice(0, 8).map(g => `"${clean(ctx, g.title, 60)}"`).join(', ')}. Ask the teacher which one.`);
}
/** One of the class's approved links (the dashboard's Links), by words of its title. -> { l } | { error } */
function linkFor(c, ctx, words) {
  const all = D.linksOf(c.id);
  if (!all.length) return no('The class has no approved links: the teacher adds one on the dashboard first.');
  const list = xs => xs.slice(0, 12).map(l => `"${clean(ctx, l.title, 60)}"`).join(', ');
  const w = String(words || '').trim();
  if (!w) return no(`Say which link. The class has: ${list(all)}.`);
  let hit = all.filter(l => fold(l.title) === fold(w));
  if (!hit.length) hit = all.filter(l => fold(l.title).includes(fold(w)));
  if (hit.length === 1) return { l: hit[0] };
  return no(hit.length ? `More than one link fits: ${list(hit)}. Ask the teacher which one.` : `No link of the class has that name. The class has: ${list(all)}.`);
}
// Words of a title (pushToScreens, endPush share the param, so one description).
const TITLE = P('Words of the title as the teacher wrote them: the game or link to send, or the thing sent to take off.');
const pushOpen = (c, id) => !!q.get('SELECT 1 FROM dash_pushes WHERE id=? AND class_id=? AND ended_at IS NULL', String(id || ''), c.id);

export default [
  timerAction('startTimer', 'start', 'Start (or carry on) the timer on a class dashboard; for a countdown, optionally at a number of minutes.', { minutes: { type: 'number', description: 'For a countdown only, when the teacher said how long: 1 to 180.' } }),
  timerAction('pauseTimer', 'pause', 'Pause the running timer on a class dashboard.'),
  timerAction('resetTimer', 'reset', 'Reset the timer on a class dashboard to its start (stopped).'),

  // POST /api/dash/:id/eyes: D.setEyes. Undo puts Eyes up back as it was, while it is still as Oomba left it.
  {
    id: 'eyesUp', area: 'dashboard', risk: 'students', warn: 'screens', undoable: true,
    label: 'Turn Eyes up on (students\' screens show "Eyes up front" for 3 minutes) or off, on a class dashboard.',
    params: { classRef: CLASS_REF, on: P('"on" (the default) or "off".') },
    plan(u, ctx, p) {
      const w = dashClass(u, ctx, p.classRef); if (!w.c) return w;
      const on = !/^(off|false|no|stop|end)$/i.test(String(p.on ?? '').trim());
      if (!on && !D.eyesOf(w.c.id)) return no('Eyes up is not on for that class.');
      return { data: { classId: w.c.id, on }, ai: `Turn Eyes up ${on ? 'on' : 'off'} for ${clean(ctx, w.c.name)}.` };
    },
    view: (u, d, t) => ({ title: t(`js.companion.act.dashboard.eyes.${d.on ? 'onAsk' : 'offAsk'}`, { class: className(d.classId) }), lines: d.on ? [t('js.companion.act.dashboard.eyes.lasts')] : [] }),
    run(u, d) {
      const c = own(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const was = !!D.eyesOf(c.id);
      D.setEyes(u, c, d.on);
      return { ok: true, landed: !!D.eyesOf(c.id) === d.on, done: { classId: c.id, on: d.on }, undo: { classId: c.id, on: d.on, was } };
    },
    doneView: (u, d, t) => ({ lines: [t(`js.companion.act.dashboard.eyes.${d.on ? 'onDone' : 'offDone'}`, { class: className(d.classId) })], links: [dashLink(d.classId, t)] }),
    undo(u, d) {
      const c = own(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      if (!!D.eyesOf(c.id) !== d.on || d.was === d.on) return { ok: true, skipped: 1 };
      D.setEyes(u, c, d.was);
      return { ok: true, skipped: 0 };
    },
  },

  // POST /api/dash/:id/checks: D.createCheck (a new check ends the last open one). Undo ends it while it is open.
  {
    id: 'quickCheck', area: 'dashboard', risk: 'students', warn: 'screens', undoable: true,
    label: 'Send a quick check to the students\' screens of a class dashboard: thumbs (up, sideways, down), fist (fist to five), scale (1 to 5) or choice (2 to 6 options). Students answer with a tap.',
    params: { classRef: CLASS_REF, checkKind: { type: 'string', enum: D.CHECK_KINDS, description: 'thumbs (the default), fist, scale or choice.' }, question: P('The question, short (never a student\'s name).'), options: { type: 'array', items: { type: 'string' }, description: 'For choice only: 2 to 6 short options.' } },
    plan(u, ctx, p) {
      const w = dashClass(u, ctx, p.classRef); if (!w.c) return w;
      const kind = D.CHECK_KINDS.includes(p.checkKind) ? p.checkKind : 'thumbs';
      const question = clean(ctx, p.question, 120);
      const options = kind === 'choice' ? (Array.isArray(p.options) ? p.options : []).map(o => clean(ctx, o, 60)).filter(Boolean).slice(0, D.MAX_OPTIONS) : [];
      if (/\[student/i.test(`${question} ${options.join(' ')}`)) return no('A quick check cannot carry a student\'s name.');
      if (kind === 'choice' && options.length < 2) return no('A choice check needs 2 to 6 options.');
      return { data: { classId: w.c.id, kind, question, options }, ai: `Send a ${kind} check to ${clean(ctx, w.c.name)}${question ? `: "${question}"` : ''}${options.length ? ` (${options.join(' / ')})` : ''}.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.dashboard.check.ask', { class: className(d.classId) }), lines: checkLines(d, t) }),
    run(u, d) {
      const c = own(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const r = D.createCheck(u, c, { kind: d.kind, question: d.question, options: d.options });
      if (r.error) return { ok: false, code: r.error };
      const back = openCheck(c);
      return { ok: true, landed: !!back && back.id === r.check, done: { classId: c.id, kind: d.kind, question: d.question, options: d.options }, undo: { classId: c.id, checkId: r.check } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.dashboard.check.done', { class: className(d.classId) }), ...checkLines(d, t)], links: [dashLink(d.classId, t)] }),
    undo(u, d) {
      const c = own(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const ch = openCheck(c); if (!ch || ch.id !== d.checkId) return { ok: true, skipped: 1 };
      const r = D.endCheck(u, c, d.checkId);
      return r.error ? { ok: true, skipped: 1 } : { ok: true, skipped: 0 };
    },
  },

  // POST /api/dash/:id/checks/:cid/end: D.endCheck (the class's open check).
  {
    id: 'endCheck', area: 'dashboard', risk: 'students', warn: 'off', undoable: false,
    label: 'End the open quick check on a class dashboard (it goes from students\' screens; its answers stay for the teacher).',
    params: { classRef: CLASS_REF },
    plan(u, ctx, p) {
      const w = dashClass(u, ctx, p.classRef); if (!w.c) return w;
      const ch = openCheck(w.c); if (!ch) return no('That class has no quick check open.');
      return { data: { classId: w.c.id, checkId: ch.id }, ai: `End the open quick check of ${clean(ctx, w.c.name)}${ch.question ? ` ("${clean(ctx, ch.question, 120)}")` : ''}.` };
    },
    view(u, d, t) { const ch = q.get('SELECT question FROM dash_checks WHERE id=?', d.checkId); return { title: t('js.companion.act.dashboard.check.endAsk', { class: className(d.classId) }), lines: ch && ch.question ? [ch.question] : [] }; },
    run(u, d) {
      const c = own(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const ch = openCheck(c); if (!ch || ch.id !== d.checkId) return { ok: false, code: 'notFound' };
      const r = D.endCheck(u, c, d.checkId); if (r.error) return { ok: false, code: r.error };
      return { ok: true, landed: !openCheck(c), done: { classId: c.id } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.dashboard.check.ended', { class: className(d.classId) })], links: [dashLink(d.classId, t)] }),
  },

  // POST /api/dash/:id/picker { action: 'pick' }: D.pickerAction (not the same student twice until everyone has had a
  // turn; away students are left out). The AI is told only that a student was picked: the name is on the teacher's card.
  {
    id: 'pickName', area: 'dashboard', risk: 'normal', undoable: false,
    label: 'Pick a student at random in a class (the class dashboard\'s random picker). Only the teacher sees who: you are never told the name.',
    params: { classRef: CLASS_REF },
    plan(u, ctx, p) {
      const w = dashClass(u, ctx, p.classRef); if (!w.c) return w;
      const v = D.pickerView(w.c);
      if (!v.students.some(s => !v.away.includes(s.id))) return no('That class has no students to pick from today.');
      return { data: { classId: w.c.id }, ai: `Pick a student at random in ${clean(ctx, w.c.name)}. The card shows the name to the teacher only: you are told only that one was picked, never who.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.dashboard.pick.ask', { class: className(d.classId) }), lines: [t('js.companion.act.dashboard.pick.only')] }),
    run(u, d) {
      const c = own(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const r = D.pickerAction(u, c, { action: 'pick', norepeat: true });
      if (r.error || !r.pick) return { ok: false, code: r.error || 'nobody' };
      const st = json(D.classState(c.id).picker, {});
      return { ok: true, landed: st.last === r.pick.id, done: { classId: c.id, userId: r.pick.id } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.dashboard.pick.done', { name: studentName(d.classId, d.userId) })], links: [dashLink(d.classId, t)] }),
  },

  // POST /api/dash/:id/pushes { kind: 'game' | 'link' }: D.push (an official game the students can open, never a hidden
  // one; or one of the class's approved links). Undo ends the push (D.endPush) while it is still on.
  {
    id: 'pushToScreens', area: 'dashboard', risk: 'students', warn: 'screens', undoable: true,
    label: 'Send an official game, or one of the class\'s approved links, to the students\' screens of a class dashboard.',
    params: { classRef: CLASS_REF, send: { type: 'string', enum: ['game', 'link'], description: 'game (the default) or link.' }, title: TITLE },
    plan(u, ctx, p) {
      const w = dashClass(u, ctx, p.classRef); if (!w.c) return w;
      const kind = p.send === 'link' ? 'link' : 'game';
      const hit = kind === 'game' ? gameFor(u, w.c, ctx, p.title) : linkFor(w.c, ctx, p.title);
      if (hit.error) return hit;
      const ref = kind === 'game' ? hit.g.id : hit.l.id, title = kind === 'game' ? hit.g.title : hit.l.title;
      return { data: { classId: w.c.id, kind, ref, title }, ai: `Send the ${kind} "${clean(ctx, title, 60)}" to the screens of ${clean(ctx, w.c.name)}.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.dashboard.push.ask', { title: d.title, class: className(d.classId) }), lines: [t(`js.companion.act.dashboard.push.${d.kind}`)] }),
    run(u, d) {
      const c = own(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      if (d.kind === 'game' && gameHidden(games.getGame(d.ref))) return { ok: false, code: 'notFound' };
      const r = D.push(u, c, { kind: d.kind, ref: d.ref }); if (r.error) return { ok: false, code: r.error };
      return { ok: true, landed: pushOpen(c, r.push), done: { classId: c.id, title: d.title }, undo: { classId: c.id, pushId: r.push } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.dashboard.push.done', { title: d.title, class: className(d.classId) })], links: [dashLink(d.classId, t)] }),
    undo(u, d) {
      const c = own(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      if (!pushOpen(c, d.pushId)) return { ok: true, skipped: 1 };
      const r = D.endPush(u, c, d.pushId);
      return r.error ? { ok: true, skipped: 1 } : { ok: true, skipped: 0 };
    },
  },

  // POST /api/dash/:id/pushes/:pid/end: D.endPush (one of today's pushes still on the students' screens).
  {
    id: 'endPush', area: 'dashboard', risk: 'students', warn: 'off', undoable: false,
    label: 'Take something sent today (a game, a link, a lesson, a live game) off the students\' screens of a class dashboard.',
    params: { classRef: CLASS_REF, title: TITLE },
    plan(u, ctx, p) {
      const w = dashClass(u, ctx, p.classRef); if (!w.c) return w;
      const all = D.todaysPushes(w.c).filter(x => x.title);
      if (!all.length) return no('Nothing sent today is still on the students\' screens of that class.');
      const list = xs => xs.slice(0, 12).map(x => `"${clean(ctx, x.title, 60)}"`).join(', ');
      const words = String(p.title || '').trim();
      let hit = all;
      if (words) { hit = all.filter(x => fold(x.title) === fold(words)); if (!hit.length) hit = all.filter(x => fold(x.title).includes(fold(words))); }
      if (hit.length !== 1) return no(!hit.length ? `Nothing on the screens has that name. On now: ${list(all)}.` : `${words ? 'More than one fits' : 'Several things are on'}: ${list(hit)}. Ask the teacher which one.`);
      return { data: { classId: w.c.id, pushId: hit[0].id, title: hit[0].title }, ai: `Take "${clean(ctx, hit[0].title, 60)}" off the screens of ${clean(ctx, w.c.name)}.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.dashboard.push.endAsk', { title: d.title, class: className(d.classId) }), lines: [] }),
    run(u, d) {
      const c = own(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const r = D.endPush(u, c, d.pushId); if (r.error) return { ok: false, code: r.error };
      return { ok: true, landed: !pushOpen(c, d.pushId), done: { classId: c.id, title: d.title } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.dashboard.push.ended', { title: d.title, class: className(d.classId) })], links: [dashLink(d.classId, t)] }),
  },
];
