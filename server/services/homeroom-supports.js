// Homeroom, step 3c: per-student supports (docs/homeroom.md "The student desk"; docs/decisions.md "Homeroom: supports,
// aides and sub links"). On a student's desk menu the teacher sets their supports for this class:
//   - Extra time: 1.5x or 2x on any timed part (the plan's countdown on that desk, and a game that reads BRB.support /
//     BRB.timeFor in its frame);
//   - Read aloud: a speaker button that reads the teacher's instructions (the desk's cards, the note over a game) with
//     the device's own voice;
//   - Simpler wording: the handout's instructions in simpler words when the teacher wrote them (homeroom_handouts.
//     simple_body: typed on the desk's sheet, or written by Oomba in the teacher's chat, never seeing a name);
//   - Bigger text: the desk and the note over a game in larger type.
// They are kept in live_support (0039, the table Oomba Live already uses for the same student's extra time, read aloud
// and simple view; 0132 adds big_text), one row per class and student, so one setting covers both. They apply to every
// handout on that desk at once. Who sees them: the class's teachers and aides (the desk's small support icon, the
// desk menu), the student themselves as helpful tools (never a label), a sub only "has supports" with what they need to
// act on (for example "Reads aloud"). Classmates never do: See the room carries names and seats only.
import { q, now, audit } from '../db.js';
import * as H from './homeroom.js';
import { textProblem } from './manipulatives.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
/** Extra time as a percent of the planned time (the same steps as Oomba Live's). */
export const TIMES = Object.freeze([100, 150, 200]);
export const KEYS = Object.freeze(['time', 'read', 'simple', 'big']);
export const NONE = Object.freeze({ time: 100, read: false, simple: false, big: false });
export const SIMPLE_MAX = 300;
const rowSup = r => (r ? { time: TIMES.includes(r.extra_time) ? r.extra_time : 100, read: !!r.read_aloud, simple: !!r.simple, big: !!r.big_text } : { ...NONE });
export const anySup = s => !!s && (s.time > 100 || s.read || s.simple || s.big);

/** One student's supports in a class ({ time, read, simple, big }; all off when none). */
export const supportOf = (classId, userId) => rowSup(q.get('SELECT extra_time, read_aloud, simple, big_text FROM live_support WHERE class_id=? AND user_id=?', classId, String(userId || '')));
/** The class's students with any support: { studentId: { time, read, simple, big } } (current students only). */
export function supportsOf(classId) {
  const ids = new Set(H.studentsOf(classId).map(s => s.id)), out = {};
  for (const r of q.all('SELECT user_id, extra_time, read_aloud, simple, big_text FROM live_support WHERE class_id=?', classId)) {
    const s = rowSup(r); if (ids.has(r.user_id) && anySup(s)) out[r.user_id] = s;
  }
  return out;
}
/** What a sub is told: only the supports they need to act on, as keys ('time', 'read', 'simple', 'big'). */
export const subLabels = s => (anySup(s) ? KEYS.filter(k => (k === 'time' ? s.time > 100 : s[k])) : []);

/**
 * The teacher sets a student's supports: { time: 100 | 150 | 200, read, simple, big }; all off removes them. The class's
 * own teachers only (an aide and a sub may see them, never change them). -> { ok, support }
 */
export function setSupport(u, c, studentId, x = {}) {
  if (!H.canUseClass(u, c)) return fail(H.helperRole(u, c) ? 'forbidden' : 'notFound');
  const sid = String(studentId || '');
  if (!H.studentsOf(c.id).some(s => s.id === sid)) return fail('notInClass');
  const time = Number(x.time ?? 100);
  if (!TIMES.includes(time)) return fail('badSupport');
  const s = { time, read: !!x.read, simple: !!x.simple, big: !!x.big };
  if (anySup(s)) {
    q.run(`INSERT INTO live_support(class_id, user_id, extra_time, read_aloud, simple, big_text, set_by, updated_at) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(class_id, user_id) DO UPDATE SET extra_time=excluded.extra_time, read_aloud=excluded.read_aloud, simple=excluded.simple, big_text=excluded.big_text, set_by=excluded.set_by, updated_at=excluded.updated_at`,
    c.id, sid, s.time, s.read ? 1 : 0, s.simple ? 1 : 0, s.big ? 1 : 0, u.id, now());
  } else q.run('DELETE FROM live_support WHERE class_id=? AND user_id=?', c.id, sid);
  // (which supports, never why: no note or reason is kept)
  audit(u.id, 'homeroom.support', c.id, { student: sid, time: s.time, read: s.read, simple: s.simple, big: s.big });
  return ok({ support: s });
}

// ---------------------------------------------------------------- simpler wording, per handout
/** A handout's instructions in simpler words ('' when none). */
export const simpleOf = clId => (q.get('SELECT simple_body FROM homeroom_handouts WHERE class_lesson_id=?', String(clId || '')) || {}).simple_body || '';
/** The class's handouts that have simpler wording: Map clId -> text. */
export const simplesOf = classId => new Map(q.all("SELECT class_lesson_id id, simple_body s FROM homeroom_handouts WHERE class_id=? AND simple_body!=''", classId).map(r => [r.id, r.s]));
/** Plain text as instructions are kept (services/homeroom-handouts.js cleanInstructions' rules: 4 short lines). */
export function cleanSimple(s) {
  return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f‪-‮⁦-⁩]/g, '')
    .replace(/[ \t]+/g, ' ').split('\n').map(x => x.trim()).filter((x, i, a) => x || (i && a[i - 1])).slice(0, 4).join('\n').trim().slice(0, SIMPLE_MAX);
}
/** Write (or clear, with '') a handout's simpler wording. The class's teachers only; the site's word rules. by: 'teacher'
 *  (typed) or 'oomba' (the chat). -> { ok, text } */
export function setSimple(u, c, clId, text, { by = 'teacher' } = {}) {
  if (!H.canUseClass(u, c)) return fail(H.helperRole(u, c) ? 'forbidden' : 'notFound');
  const h = q.get('SELECT h.class_lesson_id id FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL WHERE h.class_lesson_id=? AND h.class_id=?', String(clId || ''), c.id);
  if (!h) return fail('notFound');
  if (typeof text !== 'string' || text.trim().length > SIMPLE_MAX) return fail('tooLong');
  const clean = cleanSimple(text);
  const bad = textProblem(clean); if (bad) return fail(bad);
  q.run('UPDATE homeroom_handouts SET simple_body=? WHERE class_lesson_id=?', clean, h.id);
  audit(u.id, 'homeroom.simpler', c.id, { classLesson: h.id, by, length: clean.length });
  return ok({ text: clean });
}

// ---------------------------------------------------------------- what a desk gets
/** The supports as a student's own desk and game page use them (their own only). */
export const forDesk = (c, u) => supportOf(c.id, u.id);
/** A student's own cards with their supports applied: simpler wording in place of the instructions. */
export function applyToCards(c, sup, cards) {
  if (!sup || !sup.simple || !cards.length) return cards;
  const simple = simplesOf(c.id);
  return cards.map(x => (simple.get(x.id) ? { ...x, instructions: simple.get(x.id), simpler: true } : x));
}
