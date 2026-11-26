// Homeroom: Needs a look (docs/homeroom.md build order step 5; docs/decisions.md "Homeroom: onboarding, Needs a look,
// Oomba follow-ups"). A calm list for the teacher of students who may need help right now or this week, each with the
// reason in plain words and a suggested action. Rules first, computed here on the server from data Homeroom already has;
// nothing new is collected about students. The owner's first idea was "AI oversight to help flag students that are
// struggling": the flags are rules, and Oomba may only sum the list up with the names taken out (forAi: "Student A").
//
// The rules (LOOK; one reason each, a student can have several):
//   stuck    live class: Stuck on the same handout (no step forward) for STUCK_MS, 3 minutes (homeroom-live.js statusOf),
//            times their extra time when they have that support (2x: 6 minutes);
//   hand     live class: a hand up (a question or help) for handMs, 4 minutes;
//   ask      a question sent from home still waiting after askMs, an hour;
//   tries    a lesson plan graded by Score opened triesPlays times (2) or more in the last 7 days, the best result still
//            under triesPct (50 %) right ("several wrong tries in a row": a game reports one result per try, the best is
//            kept, so this is the try count and the best try);
//   reading  a Reading handout's quiz, first try, under readingPct (60 %) right with at least readingMin (3) questions;
//   overdue  overdue (3) or more handouts after due on their desk (homeroom-handouts.js boardView's calm "after due",
//            which never counts work given while they were marked absent: Missed while away is never late by itself).
// Students marked Absent today are never on the list. At home: their live status and their questions from home count,
// no hand (they can't raise one). Supports: extra time stretches Stuck; a reading reason suggests Read aloud.
// The list is alphabetical (never ranked), the teacher's and their aides' (a sub sees only stuck and hand, with first
// names: homeroom-sub.js), never on the projector, never sent to a student or a parent.
// Seen (one reason, by its key: back when the reason changes, like a new handout or one more after due) and Snooze
// today (the student, until the class's next school day) are the class's teachers' (homeroom_look, migration 0140).
import { q, now, audit } from '../db.js';
import * as S from './schools.js';
import * as H from './homeroom.js';
import * as HO from './homeroom-handouts.js';
import * as HV from './homeroom-live.js';
import * as AT from './homeroom-attendance.js';
import * as SUP from './homeroom-supports.js';
import { scrub, studentNames } from '../builder/lesson.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
export const LOOK = Object.freeze({ stuckMs: HV.STUCK_MS, handMs: 4 * 60e3, askMs: 60 * 60e3, triesPlays: 2, triesPct: 50, readingPct: 60, readingMin: 3, overdue: 3, weekMs: 7 * 86400e3 });
export const RULES = Object.freeze(['stuck', 'hand', 'ask', 'tries', 'reading', 'overdue']);
/** The reasons that are about right now (a sub sees only these). */
export const LIVE_RULES = Object.freeze(['stuck', 'hand']);
/** What the list suggests for each reason (the page words it and makes it a button). */
export const ACTS = Object.freeze({ stuck: 'look', hand: 'hands', ask: 'hands', tries: 'sit', reading: 'readWith', overdue: 'checkIn' });
const KEEP_DAYS = 30;
const isoDay = (c, at) => new Date(AT.localDay(AT.zoneFor(c), at)).toISOString().slice(0, 10);

/** Score lesson plans with several tries this week: Map 'userId:classLessonId' -> { plays, right, total }. */
function triesOf(c, at) {
  const out = new Map();
  for (const r of q.all(`SELECT p.user_id u, p.class_lesson_id cl, p.score, p.plays, h.problems n, g.slug FROM step_progress p
      JOIN class_lessons cl ON cl.id=p.class_lesson_id AND cl.removed_at IS NULL
      JOIN homeroom_handouts h ON h.class_lesson_id=cl.id AND h.hr_lesson IS NOT NULL AND h.grade='score' AND h.problems>0
      JOIN lesson_steps s ON s.id=p.step_id AND s.lesson_id=cl.lesson_id AND s.kind='game' JOIN games g ON g.id=s.game_id
      WHERE cl.class_id=? AND p.updated_at>=? AND p.plays>=?`, c.id, at - LOOK.weekMs, LOOK.triesPlays)) {
    // (Arithmetic Lab reports how many were right; a lesson that only ends when everything is right has no such number)
    if (r.slug !== 'arithmetic-lab' || r.score === null || r.score === undefined) continue;
    const right = Math.min(r.score, r.n);
    if ((100 * right) / r.n < LOOK.triesPct) out.set(`${r.u}:${r.cl}`, { plays: r.plays, right, total: r.n });
  }
  return out;
}

/**
 * Every reason of every present student, before Seen and Snooze: [{ id, name, sup, home, reasons: [{ rule, key, live,
 * on?, title?, minutes?, right?, total?, count?, kind? }] }], alphabetical. board / live: HO.boardView and HV.liveView
 * when the caller has them already (the board's poll).
 */
export function compute(c, { board = null, live = null, at = now(), lang = 'en' } = {}) {
  const b = board || HO.boardView(c, lang), lv = live || HV.liveView(c, b, at);
  const att = b.att || AT.marksToday(c.id, at), sups = SUP.supportsOf(c.id);
  const titles = new Map(b.handouts.map(h => [h.id, h.title]));
  const tries = triesOf(c, at), asks = AT.openAsks(c.id), hands = new Map((lv.hands || []).map(h => [h.id, h]));
  const coll = new Intl.Collator(lang, { sensitivity: 'base', numeric: true });
  const out = [];
  for (const s of H.studentsOf(c.id)) {
    if (att[s.id] === 'absent') continue;
    const reasons = [], cards = b.desks[s.id] || [], sup = sups[s.id] || null;
    const d = lv.live ? lv.desks[s.id] : null;
    if (d && d.st === 'stuck') {
      const from = HV.stuckFrom(c.id, s.id), mins = from ? at - from : LOOK.stuckMs;
      const need = LOOK.stuckMs * (sup && sup.time > 100 ? sup.time / 100 : 1);
      if (mins >= need) reasons.push({ rule: 'stuck', key: d.on || '-', live: true, on: d.on || '', title: titles.get(d.on) || '', minutes: Math.max(1, Math.floor(mins / 60e3)) });
    }
    const h = hands.get(s.id);
    if (lv.live && h && h.kind !== 'bathroom' && at - (h.at || at) >= LOOK.handMs) reasons.push({ rule: 'hand', key: String(h.at), live: true, kind: h.kind, minutes: Math.floor((at - h.at) / 60e3) });
    const ask = asks.find(x => x.sid === s.id && at - x.at >= LOOK.askMs);
    if (ask) reasons.push({ rule: 'ask', key: ask.id, live: false, kind: ask.kind, minutes: Math.floor((at - ask.at) / 60e3) });
    for (const card of cards) {
      const t = tries.get(`${s.id}:${card.id}`);
      if (t) reasons.push({ rule: 'tries', key: card.id, live: false, on: card.id, title: titles.get(card.id) || '', right: t.right, total: t.total, count: t.plays });
      const rd = card.rd;
      if (rd && rd.total >= LOOK.readingMin && (100 * rd.right) / rd.total < LOOK.readingPct) reasons.push({ rule: 'reading', key: card.id, live: false, on: card.id, title: titles.get(card.id) || '', right: rd.right, total: rd.total, read: !!(sup && sup.read) });
    }
    const late = cards.filter(x => x.late);
    if (late.length >= LOOK.overdue) reasons.push({ rule: 'overdue', key: `n${late.length}`, live: false, count: late.length });
    if (reasons.length) out.push({ id: s.id, name: s.name, sup: SUP.anySup(sup), home: att[s.id] === 'home', reasons });
  }
  return out.sort((x, y) => coll.compare(x.name, y.name));
}

// ---------------------------------------------------------------- Seen and Snooze today
const marksOf = (c, at) => {
  const today = isoDay(c, at), rows = q.all('SELECT user_id, rule, key, state, day FROM homeroom_look WHERE class_id=?', c.id);
  return { snoozed: new Set(rows.filter(r => r.state === 'snooze' && r.day === today).map(r => r.user_id)), seen: new Set(rows.filter(r => r.state === 'seen').map(r => `${r.user_id}:${r.rule}:${r.key}`)) };
};
/** The list as it shows: Seen reasons and Snoozed students left out. -> { items, hidden } */
export function shown(c, items, at = now()) {
  const m = marksOf(c, at);
  let hidden = 0;
  const left = [];
  for (const x of items) {
    if (m.snoozed.has(x.id)) { hidden++; continue; }
    const reasons = x.reasons.filter(r => !m.seen.has(`${x.id}:${r.rule}:${r.key}`));
    if (!reasons.length) { hidden++; continue; }
    left.push({ ...x, reasons });
  }
  return { items: left, hidden };
}

/**
 * What a viewer gets: the class's teachers and aides the whole list (aides read only), a sub only the live reasons
 * (stuck, hand) with first names (names: Map id -> first name), anyone else nothing. -> { ok, items, hidden, may }
 */
export function listFor(u, c, { role = null, board = null, live = null, names = null, at = now(), lang = 'en' } = {}) {
  const r = role || (H.canUseClass(u, c) ? 'teacher' : H.helperRole(u, c));
  if (!['teacher', 'aide', 'sub'].includes(r)) return fail('notFound');
  const all = compute(c, { board, live, at, lang });
  const sub = r === 'sub';
  const list = sub ? all.map(x => ({ ...x, reasons: x.reasons.filter(y => LIVE_RULES.includes(y.rule)) })).filter(x => x.reasons.length) : all;
  const v = shown(c, list, at);
  const items = v.items.map(x => (sub ? { id: x.id, name: (names && names.get(x.id)) || '', reasons: x.reasons.map(y => ({ rule: y.rule, key: y.key, minutes: y.minutes, ...(y.kind ? { kind: y.kind } : {}) })) } : x));
  return ok({ items, hidden: sub ? 0 : v.hidden, may: r === 'teacher' });
}

/** Seen / Snooze today / back on the list: { studentId, state: seen | snooze | '' , rule, key } by the class's teachers
 *  only (an aide reads the list; a sub never changes it). -> { ok } */
export function mark(u, c, { studentId = '', state = '', rule = '', key = '' } = {}, at = now()) {
  if (!H.canUseClass(u, c)) return fail(H.helperRole(u, c) ? 'forbidden' : 'notFound');
  const sid = String(studentId || '');
  if (!H.studentsOf(c.id).some(s => s.id === sid)) return fail('notInClass');
  const day = isoDay(c, at);
  q.run('DELETE FROM homeroom_look WHERE class_id=? AND at<?', c.id, at - KEEP_DAYS * 86400e3);
  if (state === 'snooze') {
    q.run(`INSERT INTO homeroom_look(class_id, user_id, rule, key, state, day, set_by, at) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(class_id, user_id, rule, key) DO UPDATE SET state=excluded.state, day=excluded.day, set_by=excluded.set_by, at=excluded.at`, c.id, sid, '*', '*', 'snooze', day, u.id, at);
  } else if (state === 'seen') {
    if (!RULES.includes(rule) || typeof key !== 'string' || !/^[A-Za-z0-9_:.-]{1,60}$/.test(key)) return fail('badAction');
    q.run(`INSERT INTO homeroom_look(class_id, user_id, rule, key, state, day, set_by, at) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(class_id, user_id, rule, key) DO UPDATE SET state=excluded.state, day=excluded.day, set_by=excluded.set_by, at=excluded.at`, c.id, sid, rule, key, 'seen', day, u.id, at);
  } else if (state === '') {
    q.run('DELETE FROM homeroom_look WHERE class_id=? AND user_id=?', c.id, sid);
  } else return fail('badAction');
  audit(u.id, 'homeroom.look', c.id, { state: state || 'back', rule: state === 'seen' ? rule : '' });
  return ok();
}

// ---------------------------------------------------------------- for Oomba: names taken out
/** "Student A", "Student B" ... "Student Z", then "Student A2"... (letters in the list's alphabetical order). */
export const placeholder = i => `Student ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) + 1 : ''}`;
/**
 * What Oomba may see of the list (services/companion.js needsLook): each student as a placeholder, the reasons as
 * codes and counts, the handouts' titles with every student's name taken out (titles are the teacher's). Never a name,
 * a username or an id; the page maps the placeholders back to names in the browser (who: placeholder -> student id,
 * kept with the chat turn, never sent to the AI). -> { students, who }
 */
export function forAi(u, items) {
  const names = studentNames(u), who = {};
  const students = items.map((x, i) => {
    const p = placeholder(i); who[p] = x.id;
    return { student: p, hasSupports: !!x.sup, atHome: !!x.home, reasons: x.reasons.map(r => ({ reason: r.rule, ...(r.title ? { handout: scrub(String(r.title).slice(0, 80), names).text } : {}),
      ...(r.minutes !== undefined ? { minutes: r.minutes } : {}), ...(r.total ? { right: r.right, outOf: r.total } : {}), ...(r.rule === 'overdue' ? { handoutsAfterDue: r.count } : r.rule === 'tries' ? { tries: r.count } : {}) })) };
  });
  return { students, who };
}

// ---------------------------------------------------------------- cleaning up
S.onClassLeave(({ classId, userId = null } = {}) => {
  if (!classId) return;
  if (userId) q.run('DELETE FROM homeroom_look WHERE class_id=? AND user_id=?', classId, userId);
  else q.run('DELETE FROM homeroom_look WHERE class_id=?', classId);
});
S.onAccountMerge(({ from } = {}) => { if (from) { q.run('DELETE FROM homeroom_look WHERE user_id=?', from); q.run('DELETE FROM homeroom_seen WHERE user_id=?', from); } });
