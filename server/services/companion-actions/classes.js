// Oomba's action cards for a class itself (registry: ./index.js; helpers: ./shared.js; strings: js.companion.act.classes.*).
// Each action calls the same service as the class page's route (routes/schools.js), never a copy of it.
import * as S from '../schools.js';
import { no, clean, whichClass, managed, className, classLink, CLASS_REF, P } from './shared.js';

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
];

const detailLines = (d, t) => [
  ...('name' in d ? [t('js.companion.act.classes.rename.name', { name: d.name })] : []),
  ...('grade' in d ? [t('js.companion.act.classes.rename.grade', { grade: d.grade })] : []),
  ...('subject' in d ? [t('js.companion.act.classes.rename.subject', { subject: d.subject })] : []),
];
