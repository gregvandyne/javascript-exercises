// Oomba's action cards for a class and its roster (registry: ./index.js; helpers: ./shared.js; strings:
// js.companion.act.classes.*). Each action calls the same service as the class page's route (routes/schools.js), never a
// copy of it. Students are only "[student N]" placeholders; a pending join request is only "request 1 of N" for the AI;
// a join code and a new password are only on the teacher's own page (the change card, the one-time login cards page).
//
// Removing, moving a student and a new password run hooks outside the database (other modules forget a student's live
// state when they leave a class; a new password ends their sessions' live streams and clears a sign-in lock), so those
// three are not tried in a dry run before the card: dry: false with check(), the route's own checks, instead.
import * as S from '../schools.js';
import { getUser, verifyPassword } from '../../auth.js';
import { no, fold, clean, whichClass, managed, className, classLink, idsOfToken, studentIn, studentName, isoDay, classesOf, CLASS_REF, STUDENT, P } from './shared.js';

export const MAX_NEW_STUDENTS = 40;

export default [
  // POST /api/classes/:id/students: S.createSchoolAccount + S.addToClass for each typed name, then the one-time login
  // cards (routes/schools.js keepCards via S.loginCards). The names are typed on the card (input 'list') and sent with
  // the tap only: never to the AI, never kept in the chat. The new passwords are only on the login cards page.
  {
    id: 'addStudents', area: 'classes', risk: 'child', warn: 'accounts', input: 'list', undoable: false,
    label: 'Add new students to a class and make their login cards. Never pass or ask for names: the teacher types them on the card.',
    params: { classRef: CLASS_REF },
    plan(u, ctx, p) {
      const w = whichClass(u, ctx, p.classRef); if (!w.c) return w;
      return { data: { classId: w.c.id }, ai: `Add new students to ${clean(ctx, w.c.name)}: the teacher types the names on the card (one per line), then taps Do it. Never ask for the names in the chat.` };
    },
    // The dry run before the card is shown: one stand-in name (the tap is checked again with the real names).
    sample: 'Sample Student',
    view: (u, d, t) => ({ title: t('js.companion.act.classes.add.ask', { class: className(d.classId) }), lines: [t('js.companion.act.classes.add.where')] }),
    run(u, d, value, { dry = false } = {}) {
      const c = managed(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const typed = String(value || '').split(/[\n;,]+/).filter(x => x.trim());
      const names = S.parseNames(value);
      if (!names.length) return { ok: false, code: 'needText' };
      if (typed.length > MAX_NEW_STUDENTS) return { ok: false, code: 'tooMany' };
      const same = S.sameNames(c.school_id, names);
      if (same.length) return { ok: false, code: 'sameNames', count: same.length };
      const made = [];
      for (const n of names) {
        const r = S.createSchoolAccount(u, c.school_id, { rosterName: n, grade: c.grade || '' });
        if (!r.ok) continue;
        S.addToClass(u, c.id, r.user.id, 'student');
        made.push({ id: r.user.id, name: r.rosterName, username: r.username, password: r.password, role: null });
      }
      // Read back: every new account is a student of the class now.
      const ids = new Set(S.roster(c.id).filter(x => x.role === 'student').map(x => x.id));
      const landed = made.length === names.length && made.every(m => ids.has(m.id));
      const cards = !dry && made.length && S.loginCards.keep ? S.loginCards.keep(u, made.map(({ id, ...x }) => x), { schoolId: c.school_id, classId: c.id }) : '';
      return { ok: true, landed, done: { classId: c.id, n: made.length, cards } };
    },
    doneView: (u, d, t) => ({
      lines: [t('js.companion.act.classes.add.done', { count: d.n, class: className(d.classId) }), t('js.companion.act.classes.add.cardsOnce')],
      links: [...(d.cards ? [{ href: `/cards/${d.cards}`, label: t('js.companion.act.classes.add.printCards'), primary: true }] : []), classLink(d.classId, t, '?tab=students')],
    }),
  },

  // POST /api/classes/:id: S.updateClass (name, grade, subject). Undo puts the old ones back.
  {
    id: 'renameClass', area: 'classes', risk: 'normal', undoable: true,
    label: 'Rename a class, or change its grade or subject.',
    params: { classRef: CLASS_REF, name: P('The new name, only when renaming (never a student\'s name).'), grade: P('K or 1 to 12, only when changing it.'), subject: P('The subject, only when changing it.') },
    plan(u, ctx, p) {
      const w = whichClass(u, ctx, p.classRef); if (!w.c) return w;
      const next = {};
      if (typeof p.name === 'string' && p.name.trim()) { const n = clean(ctx, p.name, 60); if (/\[student/.test(n)) return no('A class name cannot be a student\'s name.'); next.name = n; }
      if (typeof p.grade === 'string' && p.grade.trim()) next.grade = String(p.grade).trim().slice(0, 12);
      if (typeof p.subject === 'string' && p.subject.trim()) next.subject = clean(ctx, p.subject, 40);
      if (!Object.keys(next).length) return no('Say what to change: the name, the grade or the subject.');
      return { data: { classId: w.c.id, from: w.c.name, ...next }, ai: `Change ${clean(ctx, w.c.name)}: ${Object.entries(next).map(([k, v]) => `${k} "${v}"`).join(', ')}.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.classes.rename.ask', { class: d.from }), lines: detailLines(d, t) }),
    run(u, d) {
      const c = managed(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      const fields = {}; for (const k of ['name', 'grade', 'subject']) if (k in d) fields[k] = d[k];
      const r = S.updateClass(u, c.id, fields); if (!r.ok) return r;
      const back = S.getClass(c.id);
      return { ok: true, landed: Object.entries(fields).every(([k, v]) => back[k] === v), done: { classId: c.id, ...fields }, undo: { classId: c.id, name: c.name, grade: c.grade || '', subject: c.subject || '' } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.classes.rename.done', { class: className(d.classId) }), ...detailLines(d, t)], links: [classLink(d.classId, t)] }),
    undo(u, d) {
      if (!managed(u, d.classId)) return { ok: false, code: 'notFound' };
      const r = S.updateClass(u, d.classId, { name: d.name, grade: d.grade, subject: d.subject });
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },
  // POST /api/classes/:id/code: S.newCode. The new code is only on the change card (read from the class, never kept in
  // the chat, never to the AI). No Undo: the old code is gone.
  {
    id: 'newJoinCode', area: 'classes', risk: 'normal', undoable: false,
    label: 'Make a new join code for a class (the old one stops working). The code is shown on the card only.',
    params: { classRef: CLASS_REF },
    plan(u, ctx, p) {
      const w = whichClass(u, ctx, p.classRef); if (!w.c) return w;
      return { data: { classId: w.c.id }, ai: `Make a new join code for ${clean(ctx, w.c.name)}. The code is shown on the card only: never say or guess it.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.classes.code.ask', { class: className(d.classId) }), lines: [t('js.companion.act.classes.code.old')] }),
    run(u, d) {
      const c = managed(u, d.classId); if (!c || c.archived_at) return { ok: false, code: 'notFound' };
      const r = S.newCode(u, c.id); if (!r.ok) return r;
      const back = S.getClass(c.id);
      return { ok: true, landed: !!back.join_code && back.join_code !== c.join_code, done: { classId: c.id } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.classes.code.done', { class: className(d.classId), code: (S.getClass(d.classId) || {}).join_code || '' })], links: [classLink(d.classId, t)] }),
  },

  // POST /api/classes/:id/archive: S.archiveClass(true). Everything is kept; Undo restores it.
  {
    id: 'archiveClass', area: 'classes', risk: 'delete', warn: 'archive', undoable: true,
    label: 'Archive a class (everything is kept; Undo or restoreClass brings it back).',
    params: { classRef: CLASS_REF },
    plan(u, ctx, p) {
      const w = whichClass(u, ctx, p.classRef); if (!w.c) return w;
      return { data: { classId: w.c.id }, ai: `Archive ${clean(ctx, w.c.name)}.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.classes.archive.ask', { class: className(d.classId) }), lines: [] }),
    run(u, d) {
      const c = managed(u, d.classId); if (!c || c.archived_at) return { ok: false, code: 'notFound' };
      const r = S.archiveClass(u, c.id, true); if (!r.ok) return r;
      return { ok: true, landed: !!S.getClass(c.id).archived_at, done: { classId: c.id }, undo: { classId: c.id } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.classes.archive.done', { class: className(d.classId) })], links: [] }),
    undo(u, d) {
      const c = managed(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      if (!c.archived_at) return { ok: true, skipped: 1 };
      const r = S.archiveClass(u, c.id, false);
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/classes/:id/restore: S.archiveClass(false). Only an archived class the teacher manages; Undo archives it again.
  {
    id: 'restoreClass', area: 'classes', risk: 'normal', undoable: true,
    label: 'Restore an archived class.',
    params: { classRef: CLASS_REF },
    plan(u, ctx, p) {
      const w = archivedClass(u, ctx, p.classRef); if (!w.c) return w;
      return { data: { classId: w.c.id }, ai: `Restore ${clean(ctx, w.c.name)}.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.classes.restore.ask', { class: className(d.classId) }), lines: [] }),
    run(u, d) {
      const c = managed(u, d.classId); if (!c || !c.archived_at) return { ok: false, code: 'notFound' };
      const r = S.archiveClass(u, c.id, false); if (!r.ok) return r;
      return { ok: true, landed: !S.getClass(c.id).archived_at, done: { classId: c.id }, undo: { classId: c.id } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.classes.restore.done', { class: className(d.classId) })], links: [classLink(d.classId, t)] }),
    undo(u, d) {
      const c = managed(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      if (c.archived_at) return { ok: true, skipped: 1 };
      const r = S.archiveClass(u, c.id, true);
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/classes/:id/students/:uid/password: S.resetSchoolPassword, then the one-time login card (S.loginCards.keep).
  // The password is only on that page: never in the chat, the AI's result or the stored turn. No Undo.
  {
    id: 'resetPassword', area: 'classes', risk: 'child', warn: 'password', undoable: false, dry: false,
    label: 'Make a new password for one student with a school account. The password is only on a login card for the teacher, never in the chat.',
    params: { student: STUDENT, classRef: CLASS_REF },
    plan(u, ctx, p) {
      const w = classOfStudent(u, ctx, p); if (!w.c) return w;
      const s = studentIn(ctx, w.c, p.student); if (s.error) return s;
      const d = { classId: w.c.id, userId: s.id };
      const why = pwWhy(u, d); if (why) return no(why);
      return { data: d, ai: `Make a new password for ${token(p.student)} in ${clean(ctx, w.c.name)}. The password is only on a login card for the teacher: never say or guess one.` };
    },
    check: (u, d) => pwWhy(u, d),
    view: (u, d, t) => ({ title: t('js.companion.act.classes.pw.ask', { name: studentName(d.classId, d.userId) }), lines: [] }),
    run(u, d) {
      if (pwWhy(u, d)) return { ok: false, code: 'notFound' };
      const c = S.getClass(d.classId), sm = S.membership(c.school_id, d.userId);
      const r = S.resetSchoolPassword(u, c.school_id, d.userId); if (!r.ok) return { ok: false, code: 'notFound' };
      const cards = S.loginCards.keep ? S.loginCards.keep(u, [{ name: (sm && sm.roster_name) || r.user.display_name, username: r.username, password: r.password, role: null }], { schoolId: c.school_id, classId: c.id }) : '';
      // Read back: the new password is the one saved (and its login card was kept).
      return { ok: true, landed: verifyPassword(getUser(d.userId), r.password) && !!cards, done: { classId: c.id, userId: d.userId, cards } };
    },
    doneView: (u, d, t) => ({
      lines: [t('js.companion.act.classes.pw.done', { name: studentName(d.classId, d.userId) }), t('js.companion.act.classes.pw.cardOnce')],
      links: [...(d.cards ? [{ href: `/cards/${d.cards}`, label: t('js.companion.act.classes.pw.printCard'), primary: true }] : []), classLink(d.classId, t, '?tab=students')],
    }),
  },

  // POST /api/classes/:id/students/:uid/remove: S.removeFromClass (a student; their account and work are kept). Undo adds
  // them back (S.addToClass, as the page's Add existing students does).
  {
    id: 'removeStudent', area: 'classes', risk: 'delete', warn: 'remove', undoable: true, dry: false,
    label: 'Take one student out of a class (their account and work are kept; Undo puts them back).',
    params: { student: STUDENT, classRef: CLASS_REF },
    plan(u, ctx, p) {
      const w = classOfStudent(u, ctx, p); if (!w.c) return w;
      const s = studentIn(ctx, w.c, p.student); if (s.error) return s;
      const d = { classId: w.c.id, userId: s.id };
      const why = removeWhy(u, d); if (why) return no(why);
      return { data: d, ai: `Take ${token(p.student)} out of ${clean(ctx, w.c.name)}. Their account and work are kept.` };
    },
    check: (u, d) => removeWhy(u, d),
    view: (u, d, t) => ({ title: t('js.companion.act.classes.remove.ask', { name: studentName(d.classId, d.userId), class: className(d.classId) }), lines: [] }),
    run(u, d) {
      if (removeWhy(u, d)) return { ok: false, code: 'notFound' };
      const r = S.removeFromClass(u, d.classId, d.userId); if (!r.ok) return r;
      return { ok: true, landed: !S.classMember(d.classId, d.userId), done: { classId: d.classId, userId: d.userId }, undo: { classId: d.classId, userId: d.userId } };
    },
    // The name from the school's list (studentName: the student is not on the class's list now): the page only.
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.classes.remove.done', { name: studentName(d.classId, d.userId), class: className(d.classId) })], links: [classLink(d.classId, t, '?tab=students')] }),
    undo(u, d) {
      const c = managed(u, d.classId); if (!c || c.archived_at) return { ok: false, code: 'notFound' };
      if (S.classMember(c.id, d.userId)) return { ok: true, skipped: 1 };
      const m = S.membership(c.school_id, d.userId); if (!m || m.role !== 'student') return { ok: false, code: 'notFound' };
      const r = S.addToClass(u, c.id, d.userId, 'student');
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/classes/:id/students/:uid/move: S.moveStudent, to another of the teacher's own classes in the same school.
  // Undo moves them back while they are still in the class they were moved to.
  {
    id: 'moveStudent', area: 'classes', risk: 'delete', warn: 'move', undoable: true, dry: false,
    label: 'Move one student to another of the teacher\'s classes in the same school (they leave the first class; Undo moves them back).',
    params: { student: STUDENT, classRef: P('The class the student is in now (its id or name). Leave out to find it from the student.'), to: P('The class to move the student to: its id or its name as the teacher wrote it.') },
    plan(u, ctx, p) {
      const w = classOfStudent(u, ctx, p); if (!w.c) return w;
      const s = studentIn(ctx, w.c, p.student); if (s.error) return s;
      const opts = classesOf(u).filter(c => c.school_id === w.c.school_id && c.id !== w.c.id);
      if (!opts.length) return no('The teacher has no other class in this school to move the student to.');
      const r = String(p.to || '').trim();
      const list = () => opts.slice(0, 8).map(c => `"${clean(ctx, c.name, 60)}"`).join(', ');
      if (!r) return no(`Say which class to move the student to: ${list()}.`);
      let to = opts.find(c => c.id === r) || opts.find(c => fold(c.name) === fold(r));
      if (!to) { const near = opts.filter(c => fold(c.name).includes(fold(r))); if (near.length === 1) [to] = near; else if (near.length > 1) return no(`More than one class fits: ${near.slice(0, 8).map(c => `"${clean(ctx, c.name, 60)}"`).join(', ')}. Ask the teacher which one.`); }
      if (!to) return no(`That is not another of the teacher's classes in this school. They have: ${list()}.`);
      const d = { classId: w.c.id, toId: to.id, userId: s.id };
      const why = moveWhy(u, d); if (why) return no(why);
      return { data: d, ai: `Move ${token(p.student)} from ${clean(ctx, w.c.name)} to ${clean(ctx, to.name)}.` };
    },
    check: (u, d) => moveWhy(u, d),
    view: (u, d, t) => ({ title: t('js.companion.act.classes.move.ask', { name: studentName(d.classId, d.userId), from: className(d.classId), to: className(d.toId) }), lines: [] }),
    run(u, d) {
      if (moveWhy(u, d)) return { ok: false, code: 'notFound' };
      const r = S.moveStudent(u, d.classId, d.toId, d.userId); if (!r.ok) return r;
      const landed = !S.classMember(d.classId, d.userId) && (S.classMember(d.toId, d.userId) || {}).role === 'student';
      return { ok: true, landed, done: { classId: d.toId, fromId: d.classId, userId: d.userId }, undo: { classId: d.classId, toId: d.toId, userId: d.userId } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.classes.move.done', { name: studentName(d.classId, d.userId), to: className(d.classId) })], links: [classLink(d.classId, t, '?tab=students')] }),
    // Back to the first class, only while they are still in the class Oomba moved them to.
    undo(u, d) {
      if (!S.classMember(d.toId, d.userId)) return { ok: true, skipped: 1 };
      if (S.classMember(d.classId, d.userId)) return { ok: true, skipped: 1 };
      const from = managed(u, d.toId), back = managed(u, d.classId);
      if (!from || !back || back.archived_at) return { ok: false, code: 'notFound' };
      const r = S.moveStudent(u, d.toId, d.classId, d.userId);
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/classes/:id/teachers: S.addToClass as 'teacher', for a staff member of the class's school named by the
  // teacher (staff names are not students' names). Undo takes them off again (S.removeFromClass) while the class still
  // has another teacher.
  {
    id: 'addCoTeacher', area: 'classes', risk: 'normal', undoable: true,
    label: 'Add a staff member of the school as another teacher of a class (their name as the teacher wrote it).',
    params: { classRef: CLASS_REF, staff: P('The staff member\'s name as the teacher wrote it (a teacher or school admin of the same school, never a student).') },
    plan(u, ctx, p) {
      const w = whichClass(u, ctx, p.classRef); if (!w.c) return w;
      const r = String(p.staff || '').trim();
      if (!r) return no('Say which staff member to add.');
      if (/\[student/i.test(r)) return no('Only a teacher or school admin of the school can teach a class, never a student.');
      const staff = S.members(w.c.school_id, 'staff').filter(m => !m.banned);
      const names = m => [m.roster_name, m.display_name, m.username].filter(Boolean).map(fold);
      let hit = staff.filter(m => names(m).includes(fold(r)));
      if (!hit.length) hit = staff.filter(m => names(m).some(n => n.includes(fold(r))));
      const nameOf = m => clean(ctx, m.roster_name || m.display_name, 60);
      if (!hit.length) return no('No teacher or school admin of the class\'s school has that name. Ask the teacher for the name as it is on the school\'s People page.');
      if (hit.length > 1) return no(`More than one staff member fits: ${hit.slice(0, 6).map(m => `"${nameOf(m)}"`).join(', ')}. Ask the teacher which one.`);
      const m = hit[0];
      if (S.teaches({ id: m.id }, w.c.id)) return no(`${nameOf(m)} already teaches ${clean(ctx, w.c.name)}.`);
      return { data: { classId: w.c.id, userId: m.id }, ai: `Add ${nameOf(m)} as another teacher of ${clean(ctx, w.c.name)}.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.classes.coteach.ask', { name: staffName(d.classId, d.userId), class: className(d.classId) }), lines: [] }),
    run(u, d) {
      const c = managed(u, d.classId); if (!c || c.archived_at) return { ok: false, code: 'notFound' };
      const m = S.membership(c.school_id, d.userId);
      if (!m || m.role === 'student' || S.teaches({ id: d.userId }, c.id)) return { ok: false, code: 'notFound' };
      const r = S.addToClass(u, c.id, d.userId, 'teacher'); if (!r.ok) return r;
      return { ok: true, landed: S.teaches({ id: d.userId }, c.id), done: { classId: c.id, userId: d.userId }, undo: { classId: c.id, userId: d.userId } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.classes.coteach.done', { name: staffName(d.classId, d.userId), class: className(d.classId) })], links: [classLink(d.classId, t, '?tab=students')] }),
    undo(u, d) {
      const c = managed(u, d.classId); if (!c) return { ok: false, code: 'notFound' };
      if (!S.teaches({ id: d.userId }, c.id)) return { ok: true, skipped: 1 };
      // The route's own rule: never the class's last teacher.
      if (S.roster(c.id).filter(x => x.role === 'teacher').length < 2) return { ok: false, code: 'notFound' };
      const r = S.removeFromClass(u, c.id, d.userId);
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/join-requests/:rid/approve: S.approveRequest with the name for the class list, typed (or checked) on the
  // card. The AI only knows "request 1 of N"; the card shows the name to the teacher. No Undo from the chat.
  {
    id: 'approveJoin', area: 'classes', risk: 'normal', input: 'one', undoable: false,
    label: 'Let in a student who asked to join a class, by the number of their request ("request 1"). The teacher checks the name for the class list on the card.',
    params: { classRef: CLASS_REF, request: { type: 'integer', description: 'Which request to join: 1 for the first. Leave out when the class has only one.' } },
    plan: (u, ctx, p) => requestPlan(u, ctx, p, 'approve'),
    // The dry run before the card: the name the student gave (the tap is checked again with what the teacher typed).
    sample: '',
    view(u, d, t) { const r = requestOf(d); return { title: t('js.companion.act.classes.join.ask', { name: r ? r.display_name : '', class: className(d.classId) }), lines: [t('js.companion.act.classes.join.nameHint')], value: r ? r.display_name : '' }; },
    run(u, d, value) {
      const c = S.requestClass(d.requestId); if (!c || c.id !== d.classId || !S.canManageClass(u, c)) return { ok: false, code: 'notFound' };
      const r0 = requestOf(d); if (!r0) return { ok: false, code: 'notFound' };
      const rosterName = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 60) || r0.display_name;
      const r = S.approveRequest(u, d.requestId, { rosterName }); if (!r.ok) return { ok: false, code: 'notFound' };
      return { ok: true, landed: (S.classMember(c.id, r0.user_id) || {}).role === 'student' && !requestOf(d), done: { classId: c.id, userId: r0.user_id } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.classes.join.done', { name: studentName(d.classId, d.userId), class: className(d.classId) })], links: [classLink(d.classId, t, '?tab=students')] }),
  },

  // POST /api/join-requests/:rid/decline: S.declineRequest. No Undo (the student can ask again with the code).
  {
    id: 'declineJoin', area: 'classes', risk: 'normal', undoable: false,
    label: 'Say no to a request to join a class, by the number of the request ("request 1").',
    params: { classRef: CLASS_REF, request: { type: 'integer', description: 'Which request to join: 1 for the first. Leave out when the class has only one.' } },
    plan: (u, ctx, p) => requestPlan(u, ctx, p, 'decline'),
    view(u, d, t) { const r = requestOf(d); return { title: t('js.companion.act.classes.decline.ask', { name: r ? r.display_name : '', class: className(d.classId) }), lines: [] }; },
    run(u, d) {
      const c = S.requestClass(d.requestId); if (!c || c.id !== d.classId || !S.canManageClass(u, c)) return { ok: false, code: 'notFound' };
      const r0 = requestOf(d); if (!r0) return { ok: false, code: 'notFound' };
      const r = S.declineRequest(u, d.requestId); if (!r.ok) return r;
      return { ok: true, landed: !requestOf(d) && !S.classMember(c.id, r0.user_id), done: { classId: c.id } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.classes.decline.done', { class: className(d.classId) })], links: [classLink(d.classId, t, '?tab=students')] }),
  },
];

const detailLines = (d, t) => [
  ...('name' in d ? [t('js.companion.act.classes.rename.name', { name: d.name })] : []),
  ...('grade' in d ? [t('js.companion.act.classes.rename.grade', { grade: d.grade })] : []),
  ...('subject' in d ? [t('js.companion.act.classes.rename.subject', { subject: d.subject })] : []),
];

/** The placeholder as the teacher's message has it ("[student 1]"), for the AI's words. */
const token = tok => `[student ${(/(\d{1,3})/.exec(String(tok || '')) || [])[1] || ''}]`;
/** The class a student placeholder is in: the one named, the page's, or the only one of the teacher's with that student. */
function classOfStudent(u, ctx, p) {
  const ids = idsOfToken(ctx, p.student);
  if (!ids) return no('That is not a student placeholder from the teacher\'s message (like [student 1]). If they wrote a name, it is not one of their students.');
  return whichClass(u, ctx, p.classRef, { fit: c => S.roster(c.id).some(x => x.role === 'student' && ids.includes(x.id)) });
}
/** An archived class the teacher manages (their own, and every class of a school they run). -> { c } | { error } */
function archivedClass(u, ctx, ref) {
  const all = [...S.classesOf(u.id, 'teacher', { archived: true }), ...S.adminSchools(u).flatMap(s => S.classesOfSchool(s.id, { archived: true }))];
  const mine = all.filter((c, i) => all.findIndex(x => x.id === c.id) === i && S.canManageClass(u, c));
  if (!mine.length) return no('The teacher has no archived class.');
  const r = String(ref || '').trim();
  let c = null;
  if (r) c = mine.find(x => x.id === r) || mine.find(x => fold(x.name) === fold(r)) || null;
  if (!c && r) { const near = mine.filter(x => fold(x.name).includes(fold(r))); if (near.length === 1) [c] = near; }
  if (!c && !r && ctx.page && ctx.page.classId) c = mine.find(x => x.id === ctx.page.classId) || null;
  if (!c && !r && mine.length === 1) [c] = mine;
  if (c) return { c };
  const list = mine.slice(0, 8).map(x => `"${clean(ctx, x.name, 60)}"`).join(', ');
  return no(r ? `That is not one of the teacher's archived classes. Archived: ${list}.` : `Say which archived class: ${list}.`);
}
// The route's own checks (routes/schools.js), for the plan, the tap and the run.
/** New password: a student of a class the teacher manages, with a school account of this school (students only). */
function pwWhy(u, d) {
  const c = managed(u, d.classId); if (!c) return 'That is not one of the teacher\'s classes.';
  const m = S.classMember(c.id, d.userId), sm = S.membership(c.school_id, d.userId), su = getUser(d.userId);
  if (!m || m.role !== 'student' || !sm || sm.role !== 'student') return 'That student is not in this class.';
  if (!su || su.managed_school !== c.school_id) return 'That student signs in with their own account (or Google), not a school account: only they can change its password.';
  return '';
}
/** Take out: a student of a class the teacher manages. */
function removeWhy(u, d) {
  const c = managed(u, d.classId); if (!c) return 'That is not one of the teacher\'s classes.';
  const m = S.classMember(c.id, d.userId);
  return m && m.role === 'student' ? '' : 'That student is not in this class.';
}
/** Move: a student of a class the teacher manages, to another of their classes in the same school, not archived. */
function moveWhy(u, d) {
  const why = removeWhy(u, d); if (why) return why;
  const a = S.getClass(d.classId), b = managed(u, d.toId);
  if (!b || b.archived_at || b.id === a.id || b.school_id !== a.school_id) return 'That is not another of the teacher\'s classes in this school.';
  if (S.classMember(b.id, d.userId)) return 'That student is in that class already.';
  return '';
}
/** A staff member's name as the school knows it (the teacher's own page only). */
const staffName = (classId, userId) => { const c = S.getClass(classId), m = c && S.membership(c.school_id, userId), su = getUser(userId); return (m && m.roster_name) || (su && su.display_name) || ''; };
/** Join requests: the AI only ever gets "request 1 of N" (and the day it was asked), never a name. */
function requestPlan(u, ctx, p, kind) {
  const w = whichClass(u, ctx, p.classRef, { fit: c => S.pendingRequests(c.id).length > 0 });
  if (w.error) return no('No class of the teacher\'s has a request to join waiting.');
  if (!w.c) return w;
  const list = S.pendingRequests(w.c.id);
  const raw = p.request;
  const n = raw === undefined || raw === null || raw === '' ? (list.length === 1 ? 1 : 0) : Math.floor(Number(String(raw).replace(/\D+/g, '')));
  if (!n) return no(`${clean(ctx, w.c.name)} has ${list.length} requests to join waiting: ${list.map((r, k) => `request ${k + 1} of ${list.length} (asked ${isoDay(r.created_at)})`).join(', ')}. Ask the teacher which one (they see the names on the class page).`);
  if (!(n >= 1 && n <= list.length)) return no(`${clean(ctx, w.c.name)} has only ${list.length} ${list.length === 1 ? 'request' : 'requests'} to join waiting.`);
  return { data: { classId: w.c.id, requestId: list[n - 1].id }, ai: `${kind === 'approve' ? 'Let in' : 'Say no to'} request ${n} of ${list.length} to join ${clean(ctx, w.c.name)}. The card shows the student's name to the teacher: never say or guess it.` };
}
/** The request while it is still waiting, or null. */
const requestOf = d => S.pendingRequests(d.classId).find(r => r.id === d.requestId) || null;
