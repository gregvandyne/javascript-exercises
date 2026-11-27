// Oomba's action cards for a class's Hub (it used to be called Homeroom; registry: ./index.js; helpers: ./shared.js;
// strings: js.companion.act.homeroom.*). Each calls the same service as the Hub's own route (routes/homeroom.js), never a
// copy of it, and only on a class the teacher may run the Hub for (services/homeroom.js canUseClass: the Hub on, the
// teacher on its list with the Teacher plan, one of the class's own teachers, not archived).
//
// Privacy: students are only "[student N]" placeholders (or everyone), Needs a look's students only its "Student A"
// placeholders (homeroom-look.js forAi). The AI is told counts and what was asked, never a name, never a student's work,
// their supports as they are now, why they are on Needs a look or who is absent; names are on the card only (view()).
import { q } from '../../db.js';
import * as S from '../schools.js';
import * as L from '../lessons.js';
import * as G from '../games.js';
import * as VC from '../verify-change.js';
import * as H from '../homeroom.js';
import * as AT from '../homeroom-attendance.js';
import * as SUP from '../homeroom-supports.js';
import * as HO from '../homeroom-handouts.js';
import * as HL from '../homeroom-lessons.js';
import * as NL from '../homeroom-look.js';
import * as PV from '../homeroom-parents.js';
import { gameHidden } from '../game-focus.js';
import { GROUPS_MAX, GROUP_COLORS } from '../../../public/js/homeroom-seats.js';
import { tFor } from '../../i18n/index.js';
import { no, clean, fold, whichClass, idsOfToken, studentIn, studentName, className, dayParam, fmtDay, CLASS_REF, STUDENT, P } from './shared.js';

const AREA = 'homeroom';
const ARR = (description, items = { type: 'string' }) => ({ type: 'array', items, description });
const STUDENTS = ARR('Student placeholders exactly as in the teacher\'s message, like ["[student 1]", "[student 2]"].');
const NEEDS_STUDENT = P('The student as Needs a look gave them (needsLook), like "Student A". Never a name.');

/** The class, only one the teacher may run the Hub for; the Hub off for them: the reason. -> { c } | { ask } | { error } */
function hubClass(u, ctx, ref) {
  if (!H.on()) return no('The Hub is turned off on this site, so this can\'t be done.');
  if (!H.canUse(u)) return no('The Hub is not turned on for this teacher\'s account (it needs the Hub for their account and the Teacher plan), so this can\'t be done from the chat.');
  return whichClass(u, ctx, ref, { fit: c => H.canUseClass(u, c) });
}
/** The class again at the tap (still one the teacher may run the Hub for), or null. */
const hub = (u, id) => { const c = S.getClass(id); return c && H.canUseClass(u, c) ? c : null; };
const hubLink = (classId, t) => ({ href: `/class/${encodeURIComponent(classId)}/hub`, label: t('js.companion.act.homeroom.openHub') });
const names = (classId, ids) => ids.map(id => studentName(classId, id)).filter(Boolean).join(', ');
const list = v => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : []);
const yes = v => v === true || /^(yes|true|on|1)$/i.test(String(v ?? ''));
const isOff = v => v === false || /^(no|false|off|0)$/i.test(String(v ?? ''));
/** Placeholders of the class's students (a group's members, a list). -> { ids } | { error } */
function placeholders(ctx, c, toks) {
  const out = [];
  for (const tok of list(toks).slice(0, 40)) { const s = studentIn(ctx, c, tok); if (s.error) return s; if (!out.includes(s.id)) out.push(s.id); }
  return { ids: out };
}
const roomStudents = classId => H.studentsOf(classId).map(s => s.id);

// ---------------------------------------------------------------- attendance (AT.mark)
const STATUS = { here: '', present: '', absent: 'absent', away: 'absent', home: 'home', 'at home': 'home', remote: 'home' };
const statusKey = st => (st === 'absent' ? 'absent' : st === 'home' ? 'home' : 'here');
function readMarks(classId, ids) { const m = AT.marksToday(classId); return Object.fromEntries(ids.map(id => [id, m[id] || ''])); }

// ---------------------------------------------------------------- supports (SUP.setSupport)
const TIME_OF = v => { const s = String(v ?? '').trim().toLowerCase().replace(/\s+/g, ''); if (!s) return undefined; if (/^(no|none|off|normal|1x?|100%?)$/.test(s)) return 100; if (/^(1\.5x?|150%?|half|1,5x?)$/.test(s)) return 150; if (/^(2x?|200%?|double)$/.test(s)) return 200; return false; };
function supportLines(s, t) {
  const out = [s.time > 100 ? t(`js.companion.act.homeroom.sup.time${s.time}`) : t('js.companion.act.homeroom.sup.timeOff')];
  for (const k of ['read', 'simple', 'big']) if (s[k]) out.push(t(`js.companion.act.homeroom.sup.${k}`));
  if (!SUP.anySup(s)) return [t('js.companion.act.homeroom.sup.none')];
  return out;
}

// ---------------------------------------------------------------- handouts (HO / HL)
/** An official Oomba game the teacher may put on a desk (not hidden), by id, slug or words of its title. -> { g } | { error } */
function officialGame(u, ctx, ref) {
  const r = String(ref || '').trim();
  if (!r) return no('Say which lesson to hand out (searchGames finds Oomba lessons).');
  const ok = g => !!g && g.source === 'seed' && !gameHidden(g) && HO.handable(u, g);
  const direct = G.getGame(r) || G.getGameBySlug(r);
  if (direct) return ok(direct) ? { g: direct } : no('That lesson can\'t go on a desk from the Hub (only Oomba lessons that play on a desk).');
  const all = G.listVisible(u, { official: true, order: 'plays', limit: 300 }).filter(ok);
  const title = g => fold(G.localizeGame(g, ctx.lang || 'en').title), en = g => fold(g.title);
  let hit = all.filter(g => title(g) === fold(r) || en(g) === fold(r));
  if (!hit.length) hit = all.filter(g => title(g).includes(fold(r)) || en(g).includes(fold(r)));
  if (hit.length === 1) return { g: hit[0] };
  if (!hit.length) return no('No Oomba lesson that plays on a desk has that name: find it with searchGames first.');
  return no(`More than one Oomba lesson fits: ${hit.slice(0, 6).map(g => `"${G.localizeGame(g, ctx.lang || 'en').title}"`).join(', ')}. Ask the teacher which one.`);
}
/** One of the teacher's own Hub lessons by its id or words of its title. -> { l } | { error } */
function ownLesson(u, ctx, ref) {
  const mine = HL.listMine(u, ctx.lang || 'en'), r = String(ref || '').trim();
  if (!mine.length) return no('The teacher has no lesson plans of their own in the Hub yet.');
  const names = xs => xs.slice(0, 10).map(x => `"${clean(ctx, x.title, 60)}"`).join(', ');
  let hit = mine.filter(x => x.id === r);
  if (!hit.length) hit = mine.filter(x => fold(x.title) === fold(r));
  if (!hit.length) hit = mine.filter(x => fold(x.title).includes(fold(r)));
  if (hit.length === 1) return { l: hit[0] };
  if (!hit.length) return no(`None of the teacher's lesson plans has that name. They have: ${names(mine)}.`);
  return no(`More than one lesson plan fits: ${names(hit)}. Ask the teacher which one.`);
}
/** Who a handout goes to: "everyone", a group's name or a student placeholder. -> { to } | { error } */
function targetOf(ctx, c, to) {
  const r = String(to || '').trim();
  if (!r || /^(everyone|all|every desk|whole class|the class|class)$/i.test(r)) return { to: { kind: 'all' } };
  if (idsOfToken(ctx, r)) { const s = studentIn(ctx, c, r); return s.error ? s : { to: { kind: 'desk', id: s.id } }; }
  const room = H.roomOf(c.id), t = tFor(ctx.lang || 'en');
  const label = g => g.name || (g.key ? t(`js.homeroom.groups.${g.key}`) : '');
  const g = room.groups.find(x => fold(label(x)) === fold(r) || fold(x.name) === fold(r) || x.id === r) || room.groups.find(x => label(x) && fold(label(x)).includes(fold(r.replace(/\bgroup\b/i, ''))));
  if (g) return { to: { kind: 'group', id: g.id } };
  return no(`That is not one of the class's groups or a student placeholder. Its groups: ${room.groups.map(x => `"${clean(ctx, label(x), 30)}"`).join(', ')}, or "everyone".`);
}
const groupLabel = (c, id, t) => { const g = H.roomOf(c.id).groups.find(x => x.id === id); return g ? g.name || (g.key ? t(`js.homeroom.groups.${g.key}`) : '') : ''; };
const whoLine = (classId, to, t) => {
  const c = S.getClass(classId);
  if (!to || to.kind === 'all' || !c) return t('js.companion.act.homeroom.hand.everyone');
  if (to.kind === 'desk') return studentName(classId, to.id);
  return t('js.companion.act.homeroom.hand.group', { group: groupLabel(c, to.id, t) });
};
const HAND_WHY = { alreadyOnDesk: 'A student it is for already has it on their desk.', lessonOnDesk: 'A student it is for already has this lesson plan on their desk.', tooManyHandouts: 'The class has too many handouts open: take one back first.', emptyGroup: 'That group has nobody in it yet.', pickGame: 'That can\'t go on a desk.', badDate: 'That due day is not a date.', lessonGone: 'That lesson plan\'s questions are gone: open it in the lesson builder first.' };
/** The class's own handouts (not Classroom assignments), a lesson's versions as one. */
function handoutsOf(c, lang) {
  const seen = new Set();
  return HO.boardView(c, lang).handouts.filter(h => !h.cls).filter(h => { if (!h.batch) return true; if (seen.has(h.batch)) return false; seen.add(h.batch); return true; });
}
/** One handout of the class by its id or words of its title. -> { h } | { error } */
function handoutIn(ctx, c, ref) {
  const all = handoutsOf(c, ctx.lang || 'en');
  if (!all.length) return no('Nothing is handed out in this class\'s Hub.');
  const xs = ys => ys.slice(0, 12).map(x => `"${clean(ctx, x.title, 60)}"`).join(', ');
  const r = String(ref || '').trim();
  if (!r) return no(`Say which handout. On desks now: ${xs(all)}.`);
  let hit = all.filter(x => x.id === r);
  if (!hit.length) hit = all.filter(x => fold(x.title) === fold(r));
  if (!hit.length) hit = all.filter(x => fold(x.title).includes(fold(r)));
  if (hit.length === 1) return { h: hit[0] };
  if (!hit.length) return no(`Nothing handed out has that name. On desks now: ${xs(all)}.`);
  return no(`More than one handout fits: ${xs(hit)}. Ask the teacher which one.`);
}
/** The class lessons a handout is (a lesson's versions handed out together), each with who it is for now. */
function partsOf(c, clId) {
  const h = HO.handoutOf(c, clId); if (!h) return [];
  const ids = h.batch ? q.all('SELECT h.class_lesson_id id FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL WHERE h.class_id=? AND h.batch=?', c.id, h.batch).map(x => x.id) : [h.class_lesson_id];
  return ids.map(id => { const cl = L.getClassLesson(id); return { clId: id, lessonId: cl.lesson_id, students: L.studentsOfLesson(id) }; });
}
const openNow = id => !!q.get('SELECT 1 FROM class_lessons WHERE id=? AND removed_at IS NULL', String(id || ''));

// ---------------------------------------------------------------- Needs a look (NL.mark)
/** "Student A" -> its place in the list (homeroom-look.js placeholder, the other way round), or -1. */
function needsIndex(p) {
  const m = /^\s*(?:student\s+)?([A-Z])(\d{1,2})?\s*$/i.exec(String(p || ''));
  if (!m) return -1;
  const i = m[1].toUpperCase().charCodeAt(0) - 65, k = m[2] ? Number(m[2]) : 0;
  if (k === 1) return -1;
  return i + (k ? (k - 1) * 26 : 0);
}
/** The student a Needs a look placeholder stands for, in the list as it shows now. -> { item } | { error } */
function needsItem(u, ctx, c, p) {
  const items = NL.shown(c, NL.compute(c, { lang: ctx.lang || 'en' })).items;
  if (!items.length) return no('Nobody is on Needs a look right now.');
  const i = needsIndex(p);
  if (i < 0) return no('Say the student as Needs a look gave them, like "Student A" (call needsLook first). Never a name.');
  if (!items[i]) return no('That student is not on Needs a look now (the list may have changed): call needsLook again.');
  return { item: items[i] };
}
/** What homeroom_look holds for a student now (to put back with Undo). */
const lookRows = (classId, sid) => q.all('SELECT rule, key, state, day FROM homeroom_look WHERE class_id=? AND user_id=?', classId, sid);
const todayOf = c => new Date(AT.localDay(AT.zoneFor(c), Date.now())).toISOString().slice(0, 10);
function putBackLook(u, c, sid, rows) {
  NL.mark(u, c, { studentId: sid, state: '' });
  const today = todayOf(c);
  for (const r of rows) {
    if (r.state === 'seen') NL.mark(u, c, { studentId: sid, state: 'seen', rule: r.rule, key: r.key });
    else if (r.state === 'snooze' && r.day === today) NL.mark(u, c, { studentId: sid, state: 'snooze' });
  }
}
const ruleLines = (rules, t) => rules.map(r => t(`js.companion.act.homeroom.needs.rule.${r}`));

export default [
  // POST /api/homeroom/:id/attendance: AT.mark for each student (here, absent, at home), today. Undo: the marks before.
  {
    id: 'takeAttendance', area: AREA, risk: 'normal', undoable: true,
    label: 'Take today\'s attendance on the Hub: mark students (placeholders) here, absent or at home, or mark everyone here.',
    params: { classRef: CLASS_REF, students: STUDENTS, status: P('here, absent or home (learning at home). There is no "late".'), everyone: P('"present" to mark the whole class here (no students then).') },
    plan(u, ctx, p) {
      const w = hubClass(u, ctx, p.classRef); if (!w.c) return w;
      const all = /^(present|here|yes|true)$/i.test(String(p.everyone ?? ''));
      const raw = String(p.status ?? (all ? 'here' : '')).trim().toLowerCase();
      if (/^late|tardy/.test(raw)) return no('The Hub has no Late mark: only here, absent or at home.');
      if (!all && !Object.hasOwn(STATUS, raw)) return no('Say here, absent or home for the students.');
      const status = all ? '' : STATUS[raw];
      let ids;
      if (all) ids = roomStudents(w.c.id);
      else { const s = placeholders(ctx, w.c, p.students); if (s.error) return s; ids = s.ids; }
      if (!ids.length) return no(all ? 'The class has no students yet.' : 'Say which students (placeholders like [student 1]), or "everyone present".');
      return { data: { classId: w.c.id, ids, status, all }, ai: all ? `Mark everyone in ${clean(ctx, w.c.name)} here today.` : `Mark ${ids.length} student${ids.length === 1 ? '' : 's'} ${status || 'here'} today in ${clean(ctx, w.c.name)}.` };
    },
    view: (u, d, t) => ({ title: d.all ? t('js.companion.act.homeroom.att.everyone', { class: className(d.classId) }) : t(`js.companion.act.homeroom.att.${statusKey(d.status)}`, { count: d.ids.length, class: className(d.classId) }), lines: d.all ? [] : [t('js.companion.act.homeroom.who', { names: names(d.classId, d.ids) })] }),
    run(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const ids = d.ids.filter(id => roomStudents(c.id).includes(id)); if (!ids.length) return { ok: false, code: 'notFound' };
      const before = readMarks(c.id, ids);
      for (const id of ids) { const r = AT.mark(u, c, id, d.status); if (!r.ok) return r; }
      const after = readMarks(c.id, ids);
      return { ok: true, landed: ids.every(id => after[id] === d.status), done: { classId: c.id, n: ids.length, status: d.status, all: d.all }, undo: { classId: c.id, marks: before } };
    },
    doneView: (u, d, t) => ({ lines: [d.all ? t('js.companion.act.homeroom.att.doneEveryone', { class: className(d.classId) }) : t(`js.companion.act.homeroom.att.done${statusKey(d.status)[0].toUpperCase()}${statusKey(d.status).slice(1)}`, { count: d.n })], links: [hubLink(d.classId, t)] }),
    undo(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      let skipped = 0;
      for (const [id, st] of Object.entries(d.marks || {})) { const r = AT.mark(u, c, id, st); if (!r.ok) skipped++; }
      return { ok: true, skipped };
    },
  },

  // POST /api/homeroom/:id/supports: SUP.setSupport (extra time, read aloud, simpler wording, bigger text). Only what the
  // teacher asked changes; the AI is never told what the student had. Undo: the supports before.
  {
    id: 'setSupport', area: AREA, risk: 'normal', undoable: true,
    label: 'Set a student\'s Hub supports: extra time (none, 1.5x, 2x), read aloud, simpler wording, bigger text (each on or off). Only what the teacher asked.',
    params: { classRef: CLASS_REF, student: STUDENT, extraTime: P('none, 1.5x or 2x, only when changing it.'), readAloud: P('on or off, only when changing it.'), simpler: P('Simpler wording: on or off, only when changing it.'), bigText: P('Bigger text: on or off, only when changing it.') },
    plan(u, ctx, p) {
      const w = hubClass(u, ctx, p.classRef); if (!w.c) return w;
      const s = studentIn(ctx, w.c, p.student); if (s.error) return s;
      const change = {};
      const time = TIME_OF(p.extraTime);
      if (time === false) return no('Extra time is none, 1.5x or 2x.');
      if (time !== undefined) change.time = time;
      for (const [k, v] of [['read', p.readAloud], ['simple', p.simpler], ['big', p.bigText]]) if (v !== undefined && v !== null && v !== '') { if (yes(v)) change[k] = true; else if (isOff(v)) change[k] = false; else return no('Each support is on or off.'); }
      if (!Object.keys(change).length) return no('Say which support to change: extra time, read aloud, simpler wording or bigger text.');
      const words = [...('time' in change ? [`extra time ${change.time === 100 ? 'none' : `${change.time / 100}x`}`] : []), ...['read', 'simple', 'big'].filter(k => k in change).map(k => `${{ read: 'read aloud', simple: 'simpler wording', big: 'bigger text' }[k]} ${change[k] ? 'on' : 'off'}`)];
      return { data: { classId: w.c.id, sid: s.id, change }, ai: `Change supports for ${clean(ctx, p.student, 20)} in ${clean(ctx, w.c.name)}: ${words.join(', ')}.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.homeroom.sup.ask', { name: studentName(d.classId, d.sid), class: className(d.classId) }), lines: supportLines({ ...SUP.supportOf(d.classId, d.sid), ...d.change }, t) }),
    run(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const before = SUP.supportOf(c.id, d.sid), next = { ...before, ...d.change };
      const r = SUP.setSupport(u, c, d.sid, next); if (!r.ok) return r;
      const back = SUP.supportOf(c.id, d.sid);
      return { ok: true, landed: ['time', 'read', 'simple', 'big'].every(k => back[k] === next[k]), done: { classId: c.id, sid: d.sid, now: back }, undo: { classId: c.id, sid: d.sid, was: before } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.homeroom.sup.done', { name: studentName(d.classId, d.sid) }), ...supportLines(d.now || SUP.NONE, t)], links: [hubLink(d.classId, t)] }),
    undo(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const r = SUP.setSupport(u, c, d.sid, d.was || SUP.NONE);
      return r.ok ? { ok: true, skipped: 0 } : r.code === 'notInClass' ? { ok: true, skipped: 1 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/homeroom/:id/groups: H.saveGroups. Groups from placeholders, or "N groups, mixed" (the class's students
  // shuffled into N groups). Undo: the groups and members before.
  {
    id: 'makeGroups', area: AREA, risk: 'normal', undoable: true,
    label: 'Make the class\'s Hub groups: from student placeholders, or a number of mixed groups (students shuffled). Replaces the groups the class has.',
    params: { classRef: CLASS_REF, groups: ARR('The groups, only when the teacher said who is in which: [{ "name": "Group name (optional)", "students": ["[student 1]", ...] }].', { type: 'object', properties: { name: { type: 'string' }, students: { type: 'array', items: { type: 'string' } } } }), count: P('How many mixed groups (2 to 8), when the teacher asked for a number of groups.') },
    plan(u, ctx, p) {
      const w = hubClass(u, ctx, p.classRef); if (!w.c) return w;
      const t = tFor(ctx.lang || 'en'), out = [];
      const members = {};
      if (Array.isArray(p.groups) && p.groups.length) {
        if (p.groups.length > GROUPS_MAX) return no(`At most ${GROUPS_MAX} groups.`);
        for (const [i, g] of p.groups.entries()) {
          const nm = g && typeof g.name === 'string' && g.name.trim() ? clean(ctx, g.name, 30) : t('js.companion.act.homeroom.groups.name', { n: i + 1 });
          if (/\[student/.test(nm)) return no('A group\'s name cannot be a student\'s name.');
          const s = placeholders(ctx, w.c, g && g.students); if (s.error) return s;
          const id = `o${i + 1}`;
          out.push({ id, name: nm, color: GROUP_COLORS[i % GROUP_COLORS.length] });
          for (const sid of s.ids) { if (members[sid]) return no('A student can be in one group only.'); members[sid] = id; }
        }
      } else {
        const n = Math.floor(Number(String(p.count ?? '').replace(/[^\d]/g, '')));
        if (!n) return no('Say how many groups, or who is in which group (placeholders).');
        if (n < 2 || n > GROUPS_MAX) return no(`Groups are 2 to ${GROUPS_MAX}.`);
        const ids = roomStudents(w.c.id);
        if (ids.length < n) return no('The class has fewer students than groups.');
        for (let i = 0; i < n; i++) out.push({ id: `o${i + 1}`, name: t('js.companion.act.homeroom.groups.name', { n: i + 1 }), color: GROUP_COLORS[i % GROUP_COLORS.length] });
        const mixed = [...ids];
        for (let i = mixed.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [mixed[i], mixed[j]] = [mixed[j], mixed[i]]; }
        mixed.forEach((sid, i) => { members[sid] = out[i % n].id; });
      }
      const placed = Object.keys(members).length;
      return { data: { classId: w.c.id, groups: out, members }, ai: `Make ${out.length} groups in ${clean(ctx, w.c.name)} (${placed} student${placed === 1 ? '' : 's'} placed): ${out.map(g => `"${g.name}"`).join(', ')}.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.homeroom.groups.ask', { count: d.groups.length, class: className(d.classId) }), lines: groupLines(d, t) }),
    run(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const room = H.roomOf(c.id);
      const r = H.saveGroups(u, c, { groups: d.groups, members: d.members }); if (!r.ok) return r;
      const back = H.roomOf(c.id);
      const landed = back.groups.length === d.groups.length && Object.entries(d.members).filter(([sid]) => back.students.some(s => s.id === sid)).every(([sid, g]) => back.members[sid] === g);
      return { ok: true, landed, done: { classId: c.id, groups: back.groups, members: back.members }, undo: { classId: c.id, groups: room.groups, members: room.members } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.homeroom.groups.done', { count: (d.groups || []).length, class: className(d.classId) }), ...groupLines(d, t)], links: [hubLink(d.classId, t)] }),
    undo(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const r = H.saveGroups(u, c, { groups: d.groups, members: d.members });
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/homeroom/:id/handouts: HO.handOut (an Oomba lesson, official and not hidden) or HL.handOutLesson (one of
  // the teacher's own lesson plans) to every desk, a group or one desk. Undo: HO.removeHandout (take it back; work kept).
  {
    id: 'handOut', area: AREA, risk: 'students', warn: 'screens', undoable: true,
    label: 'Hand out an Oomba lesson (find it with searchGames) or one of the teacher\'s own Hub lesson plans to every desk, a group or one student (placeholder), with an optional due day.',
    params: { classRef: CLASS_REF, game: P('The Oomba lesson: its id from searchGames, or its name.'), lesson: P('Instead of game: one of the teacher\'s own Hub lesson plans, by its name.'), to: P('"everyone", a group\'s name, or a student placeholder like "[student 1]".'), due: P('The due day as YYYY-MM-DD, only when the teacher asked.') },
    plan(u, ctx, p) {
      const w = hubClass(u, ctx, p.classRef); if (!w.c) return w;
      const due = dayParam(p.due);
      if (due === false) return no('A day must be YYYY-MM-DD.');
      const tg = targetOf(ctx, w.c, p.to); if (!tg.to) return tg;
      let data;
      if (p.lesson && !p.game) {
        const l = ownLesson(u, ctx, p.lesson); if (!l.l) return l;
        data = { classId: w.c.id, lessonId: l.l.id, title: l.l.title, to: tg.to, ...(due ? { due } : {}) };
      } else {
        const g = officialGame(u, ctx, p.game); if (!g.g) return g;
        data = { classId: w.c.id, gameId: g.g.id, title: G.localizeGame(g.g, ctx.lang || 'en').title, to: tg.to, ...(due ? { due } : {}) };
      }
      const tried = VC.dryRun(() => giveOut(u, S.getClass(w.c.id), data));
      if (!tried || !tried.ok) return no(HAND_WHY[tried && tried.code] || 'It could not be handed out.');
      const who = tg.to.kind === 'all' ? 'every desk' : tg.to.kind === 'group' ? 'a group' : clean(ctx, p.to, 20);
      return { data, ai: `Hand out "${clean(ctx, data.title)}" to ${who} in ${clean(ctx, w.c.name)}${due ? `, due ${due}` : ''}.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.homeroom.hand.ask', { title: d.title, who: whoLine(d.classId, d.to, t), class: className(d.classId) }), lines: d.due ? [t('js.companion.asg.due', { day: fmtDay(d.due, t) })] : [] }),
    run(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const r = giveOut(u, c, d); if (!r.ok) return r;
      const cls = (r.classLessons || [r.classLesson]).filter(Boolean).map(x => x.id);
      return { ok: true, landed: cls.length > 0 && cls.every(id => !!HO.handoutOf(c, id)), done: { classId: c.id, title: d.title, to: d.to }, undo: { classId: c.id, clId: cls[0] } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.homeroom.hand.done', { title: d.title, who: whoLine(d.classId, d.to, t) })], links: [hubLink(d.classId, t)] }),
    undo(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      if (!HO.handoutOf(c, d.clId)) return { ok: true, skipped: 1 };
      const r = HO.removeHandout(u, c, d.clId);
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/homeroom/:id/handouts/:clid/remove: HO.removeHandout from one desk (a placeholder) or every desk (students'
  // work is kept). Undo hands it out again: L.assign brings the same assignment back with its work and its students
  // (a lesson's versions each), or L.setStudents puts the one desk back.
  {
    id: 'takeBack', area: AREA, risk: 'delete', warn: 'takeBack', undoable: true,
    label: 'Take a handout back off every desk, or off one student\'s desk (placeholder). Students\' work is kept.',
    params: { classRef: CLASS_REF, handout: P('The handout: words of its title as the teacher wrote them.'), student: P('Only to take it off one desk: the student placeholder like "[student 1]".') },
    plan(u, ctx, p) {
      const w = hubClass(u, ctx, p.classRef); if (!w.c) return w;
      const h = handoutIn(ctx, w.c, p.handout); if (!h.h) return h;
      let sid = null;
      if (p.student) {
        const s = studentIn(ctx, w.c, p.student); if (s.error) return s; sid = s.id;
        const on = (HO.boardView(w.c, ctx.lang || 'en').desks[sid] || []).some(x => x.id === h.h.id);
        if (!on) return no('That handout is not on that student\'s desk.');
      }
      return { data: { classId: w.c.id, clId: h.h.id, title: h.h.title, sid }, ai: `Take "${clean(ctx, h.h.title)}" off ${sid ? `the desk of ${clean(ctx, p.student, 20)}` : 'every desk'} in ${clean(ctx, w.c.name)}.` };
    },
    view: (u, d, t) => ({ title: d.sid ? t('js.companion.act.homeroom.back.askOne', { title: d.title, name: studentName(d.classId, d.sid) }) : t('js.companion.act.homeroom.back.askAll', { title: d.title, class: className(d.classId) }), lines: [] }),
    run(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const parts = d.sid ? partsOf(c, d.clId).filter(x => x.clId === d.clId) : partsOf(c, d.clId);
      if (!parts.length) return { ok: false, code: 'notFound' };
      const r = HO.removeHandout(u, c, d.clId, d.sid); if (!r.ok) return r;
      const landed = d.sid ? !openNow(d.clId) || !(HO.boardView(c).desks[d.sid] || []).some(x => x.id === d.clId) : parts.every(x => !openNow(x.clId));
      return { ok: true, landed, done: { classId: c.id, title: d.title, sid: d.sid }, undo: { classId: c.id, parts, sid: d.sid } };
    },
    doneView: (u, d, t) => ({ lines: [d.sid ? t('js.companion.act.homeroom.back.doneOne', { title: d.title, name: studentName(d.classId, d.sid) }) : t('js.companion.act.homeroom.back.doneAll', { title: d.title })], links: [hubLink(d.classId, t)] }),
    undo(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      let skipped = 0;
      for (const x of d.parts || []) {
        const r = openNow(x.clId) ? L.setStudents(u, x.clId, x.students) : L.assign(u, c.id, x.lessonId, { students: x.students });
        if (!r.ok) { if (r.code === 'alreadyAssigned') skipped++; else return { ok: false, code: 'notFound' }; }
      }
      return { ok: true, skipped };
    },
  },

  // POST /api/homeroom/:id/needs { state: seen }: NL.mark for each reason of one student on Needs a look (or one reason).
  // Undo: what homeroom_look held for them before.
  needsAction('needsSeen', 'seen', 'Mark a student on Needs a look as seen ("Student A" from needsLook; one reason, or all of theirs).'),
  // POST /api/homeroom/:id/needs { state: snooze }: off the list until the class's next school day. Undo as above.
  needsAction('needsSnooze', 'snooze', 'Snooze a student on Needs a look until the next school day ("Student A" from needsLook).'),

  // POST /api/homeroom/:id/live { action: start }: H.setLive (Everyone to the Hub). Live class is in the database, but
  // starting or ending it also clears what live class keeps in memory (homeroom-live.js, homeroom-watch.js onLive), so
  // no dry run: check() instead. Undo ends it.
  liveAction('startClass', 'start'),
  // POST /api/homeroom/:id/live { action: end }: H.setLive (End class). Ending also closes the class sign-in and signs out
  // its shared devices, which Undo can't bring back: no Undo.
  liveAction('endClass', 'end'),

  // POST /api/homeroom/:id/parents: PV.setParents. Undo: the setting before.
  {
    id: 'parentsView', area: AREA, risk: 'students', warn: 'parents', undoable: true,
    label: 'Turn the parents\' view of a class on or off (what linked parents see of their child\'s Hub).',
    params: { classRef: CLASS_REF, on: P('on or off.') },
    plan(u, ctx, p) {
      const w = hubClass(u, ctx, p.classRef); if (!w.c) return w;
      const on = yes(p.on) ? true : isOff(p.on) ? false : null;
      if (on === null) return no('Say on or off.');
      return { data: { classId: w.c.id, on }, ai: `Turn the parents' view of ${clean(ctx, w.c.name)} ${on ? 'on' : 'off'}${PV.parentsOn(w.c) === on ? ' (it is already ' + (on ? 'on' : 'off') + ')' : ''}.` };
    },
    view: (u, d, t) => ({ title: t((d.on ? 'js.companion.act.homeroom.parents.on' : 'js.companion.act.homeroom.parents.off'), { class: className(d.classId) }), lines: [] }),
    run(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const was = PV.parentsOn(c);
      const r = PV.setParents(u, c, d.on); if (!r.ok) return r;
      return { ok: true, landed: PV.parentsOn(S.getClass(c.id)) === d.on, done: { classId: c.id, on: d.on }, undo: { classId: c.id, on: was } };
    },
    doneView: (u, d, t) => ({ lines: [t((d.on ? 'js.companion.act.homeroom.parents.onDone' : 'js.companion.act.homeroom.parents.offDone'), { class: className(d.classId) })], links: [hubLink(d.classId, t)] }),
    undo(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const r = PV.setParents(u, c, !!d.on);
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },
];

/** What a handout card does: HL.handOutLesson for a lesson plan, else HO.handOut (the route's own defaults). */
function giveOut(u, c, d) {
  if (d.lessonId) return HL.handOutLesson(u, c, { lessonId: d.lessonId, to: d.to, dueAt: d.due || null });
  return HO.handOut(u, c, { gameId: d.gameId, to: d.to, dueAt: d.due || null });
}

function groupLines(d, t) {
  const by = new Map((d.groups || []).map(g => [g.id, []]));
  for (const [sid, g] of Object.entries(d.members || {})) if (by.has(g)) by.get(g).push(sid);
  const lines = (d.groups || []).map(g => (by.get(g.id).length ? t('js.companion.act.homeroom.groups.line', { group: g.name, names: names(d.classId, by.get(g.id)) }) : t('js.companion.act.homeroom.groups.empty', { group: g.name })));
  const rest = roomStudents(d.classId).filter(id => !(d.members || {})[id]).length;
  return rest ? [...lines, t('js.companion.act.homeroom.groups.rest', { count: rest })] : lines;
}

function needsAction(id, state, label) {
  return {
    id, area: AREA, risk: 'normal', undoable: true, label,
    params: { classRef: CLASS_REF, student: NEEDS_STUDENT, ...(state === 'seen' ? { reason: P('Only one reason: stuck, hand, ask, tries, reading or overdue (as needsLook gave it).') } : {}) },
    plan(u, ctx, p) {
      const w = hubClass(u, ctx, p.classRef); if (!w.c) return w;
      const n = needsItem(u, ctx, w.c, p.student); if (!n.item) return n;
      let reasons = n.item.reasons;
      if (state === 'seen' && p.reason) {
        reasons = reasons.filter(r => r.rule === String(p.reason).trim().toLowerCase());
        if (!reasons.length) return no(`That student is not on the list for that reason: ${n.item.reasons.map(r => r.rule).join(', ')}.`);
      }
      const who = clean(ctx, p.student, 20);
      return { data: { classId: w.c.id, sid: n.item.id, marks: reasons.map(r => ({ rule: r.rule, key: r.key })) }, ai: state === 'seen' ? `Mark ${who} as seen on Needs a look (${reasons.length} reason${reasons.length === 1 ? '' : 's'}).` : `Snooze ${who} on Needs a look until the next school day.` };
    },
    view: (u, d, t) => ({ title: t(`js.companion.act.homeroom.needs.${state}`, { name: studentName(d.classId, d.sid) }), lines: state === 'seen' ? ruleLines([...new Set(d.marks.map(m => m.rule))], t) : [] }),
    run(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const before = lookRows(c.id, d.sid);
      if (state === 'snooze') { const r = NL.mark(u, c, { studentId: d.sid, state: 'snooze' }); if (!r.ok) return r; }
      else for (const m of d.marks) { const r = NL.mark(u, c, { studentId: d.sid, state: 'seen', rule: m.rule, key: m.key }); if (!r.ok) return r; }
      const rows = lookRows(c.id, d.sid), today = todayOf(c);
      const landed = state === 'snooze' ? rows.some(r => r.state === 'snooze' && r.day === today) : d.marks.every(m => rows.some(r => r.state === 'seen' && r.rule === m.rule && r.key === m.key));
      return { ok: true, landed, done: { classId: c.id, sid: d.sid }, undo: { classId: c.id, sid: d.sid, rows: before } };
    },
    doneView: (u, d, t) => ({ lines: [t(`js.companion.act.homeroom.needs.${state}Done`, { name: studentName(d.classId, d.sid) })], links: [hubLink(d.classId, t)] }),
    undo(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      if (!roomStudents(c.id).includes(d.sid)) return { ok: true, skipped: 1 };
      putBackLook(u, c, d.sid, d.rows || []);
      return { ok: true, skipped: 0 };
    },
  };
}

function liveAction(id, action) {
  const start = action === 'start';
  const why = (u, d) => {
    const c = hub(u, d.classId);
    if (!c) return 'The teacher can\'t run the Hub for that class.';
    const live = !!H.liveOf(c.id);
    if (start && live) return 'Live class is already on in that class.';
    if (!start && !live) return 'That class is not live now.';
    return '';
  };
  return {
    id, area: AREA, risk: 'students', warn: 'live', undoable: start, dry: false,
    label: start ? 'Start live class on the Hub (Everyone to the Hub): students\' desks are asked to come to the Hub.' : 'End live class on the Hub (End class): the class sign-in closes and shared devices are signed out.',
    params: { classRef: CLASS_REF },
    plan(u, ctx, p) {
      const w = hubClass(u, ctx, p.classRef); if (!w.c) return w;
      const d = { classId: w.c.id };
      const bad = why(u, d); if (bad) return no(bad);
      return { data: d, ai: `${start ? 'Start' : 'End'} live class in ${clean(ctx, w.c.name)}.` };
    },
    check: why,
    view: (u, d, t) => ({ title: t(`js.companion.act.homeroom.live.${action}`, { class: className(d.classId) }), lines: [t(`js.companion.act.homeroom.live.${action}Line`)] }),
    run(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const r = H.setLive(u, c, action); if (!r.ok) return r;
      return { ok: true, landed: start ? !!H.liveOf(c.id) : !H.liveOf(c.id), done: { classId: c.id }, ...(start ? { undo: { classId: c.id } } : {}) };
    },
    doneView: (u, d, t) => ({ lines: [t((start ? 'js.companion.act.homeroom.live.started' : 'js.companion.act.homeroom.live.ended'), { class: className(d.classId) })], links: [hubLink(d.classId, t)] }),
    ...(start ? { undo(u, d) {
      const c = hub(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      if (!H.liveOf(c.id)) return { ok: true, skipped: 1 };
      const r = H.setLive(u, c, 'end');
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    } } : {}),
  };
}
