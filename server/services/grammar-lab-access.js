// Who may see Grammar Lab (server/config.js GRAMMAR_LAB, GRAMMAR_LAB_USERS). Decided at read time, like every flag:
//   - GRAMMAR_LAB off (the default) is the kill switch: every Grammar Lab page, API and read-aloud answers the normal
//     404 for everyone, the platform admin included, and nothing on the site links to it.
//   - GRAMMAR_LAB on: the platform admin, and the accounts whose username is on GRAMMAR_LAB_USERS. '*' on the list
//     opens it to every visitor, guests included (guests play, but nothing they earn is stored: services/grammar-lab.js).
//   - and a student of a class where an allowed teacher (the admin, or one on the list) assigned Grammar Lab work
//     (services/grammar-lab-assign.js: a lesson step of kind 'grammar'): that student reaches what was assigned, and
//     only that (reachOf: the units, topics and proofread rooms of their open assignments), never the whole course.
// Grammar Lab sits under /courses/grammar-lab, so the COURSES gate in app.js lets it through for whoever this allows.
import { config } from '../config.js';
import { q } from '../db.js';
import * as L from './lessons.js';

/** Is the Grammar Lab flag on? */
export const grammarLabOn = () => !!config.grammarLab;
/** Is this account on GRAMMAR_LAB_USERS (by username; never a guest, whose made-up name is not theirs)? */
export const onGrammarList = u => !!u && !u.is_guest && config.grammarLabUsers.includes(String(u.username || '').toLowerCase());
/** Does GRAMMAR_LAB_USERS open it to everyone ('*')? */
export const openToAll = () => config.grammarLabUsers.includes('*');
/** May this visitor open the whole course (the flag on, and the admin, a listed account, or everyone with '*')? */
export function fullAccess(u) {
  if (!grammarLabOn()) return false;
  if (u && u.banned) return false;
  if (openToAll()) return true;
  return !!u && !u.is_guest && (u.role === 'admin' || onGrammarList(u));
}
/** May this account assign Grammar Lab (a teacher the flag lets in: the admin, a listed account, or anyone with '*')? */
export const mayAssignGrammarLab = u => !!u && !u.is_guest && fullAccess(u);
const NONE = Object.freeze({ all: false, units: new Set(), topics: new Set(), rooms: new Set(), any: false });
/** The open Grammar Lab assignments of this student, from allowed teachers: [{ cl (the class lesson), items }]. */
export function assignmentsOf(u) {
  if (!u || u.is_guest || !grammarLabOn()) return [];
  const rows = q.all(`SELECT cl.id, s.items, u.role trole, u.username tname FROM class_members m
      JOIN classrooms c ON c.id=m.class_id AND c.archived_at IS NULL
      JOIN class_lessons cl ON cl.class_id=c.id AND cl.removed_at IS NULL
      JOIN lessons l ON l.id=cl.lesson_id AND l.kind='grammar'
      JOIN lesson_steps s ON s.lesson_id=l.id AND s.kind='grammar'
      JOIN users u ON u.id=cl.assigned_by
    WHERE m.user_id=? AND m.role='student' AND m.status='active' AND ${L.assignedSql('cl.id', 'm.user_id')}`, u.id);
  const out = [];
  for (const r of rows) {
    // the teacher who assigned it is still let in now (the list is read at read time, like the flag)
    if (!(openToAll() || r.trole === 'admin' || config.grammarLabUsers.includes(String(r.tname || '').toLowerCase()))) continue;
    const cl = L.getClassLesson(r.id);
    if (!cl || !L.isOpen(cl)) continue;
    let items = null; try { items = JSON.parse(r.items || 'null'); } catch { items = null; }
    if (items && typeof items.unit === 'string') out.push({ cl, items });
  }
  return out;
}
/**
 * What of Grammar Lab this visitor reaches: { all: true } for full access; otherwise the units (a whole unit
 * assigned: its topics open in the unit's order), the topics (one topic assigned: open at once) and the rooms (a
 * proofread room assigned: open at once) of their open assignments, unitsOf (every unit those name: the unit pages they
 * may open) and any: whether there is anything at all.
 */
export function reachOf(u) {
  if (!grammarLabOn() || (u && u.banned)) return NONE;
  if (fullAccess(u)) return { all: true, units: new Set(), topics: new Set(), rooms: new Set(), any: true };
  const list = assignmentsOf(u);
  if (!list.length) return NONE;
  const r = { all: false, units: new Set(), topics: new Set(), rooms: new Set(), any: true, unitsOf: new Set() };
  for (const { items: x } of list) {
    r.unitsOf.add(x.unit);
    if (x.what === 'unit') r.units.add(x.unit);
    else if (x.what === 'topic' && x.topic) r.topics.add(x.topic);
    else if (x.what === 'room' && x.topic) r.rooms.add(x.topic);
  }
  return r;
}
/** May this visitor see Grammar Lab at all (the whole course, or work assigned to them)? */
export function mayOpenGrammarLab(u) {
  if (!grammarLabOn()) return false;
  if (u && u.banned) return false;
  return fullAccess(u) || reachOf(u).any;
}
/** Is a unit (by id) one this reach shows: the whole course, or a unit holding something assigned? */
export const unitInReach = (reach, unitId) => !!reach && (reach.all || (!!reach.unitsOf && reach.unitsOf.has(unitId)));
/** The Grammar Lab pages and APIs (the course page, its units and topics, and their APIs). */
export const GRAMMAR_LAB_PATH = /^\/(courses\/grammar-lab|api\/courses\/grammar-lab)(\/|$)/;
