// Flashcards: a student shares one of their own sets with their class (docs/decisions.md "Flashcards: students share
// with their class"). A student's own sets are private (routes/games.js privateSet); sharing opens one, per set and per
// class, to that class only:
//   - who shares: the set's owner, a student of the class (an active member as 'student', the class and school not
//     archived). Off by default (no row). A child on a family account is in no class, so has nothing to share with.
//   - who sees it: the class's teachers (S.canManageClass: its own teachers and the school's admins) and its aides
//     (services/homeroom-aides.js isAide) open, study, print and copy it; the class's other students open, study and
//     copy it. Nobody else: no code, no public link; anyone else gets the same answer as a set that isn't there.
//   - a teacher of the class (S.canManageClass, never an aide) hides it from that class (hidden_at): it stays the
//     student's, it is only off that class's list. The student sees that it was taken off the list.
//   - what is shown: the set's cards through cleanFlashItems again (the site's text filter on every word) with every
//     picture left off and no links, on sharing and on every read. Names: the teacher sees the roster name (else the
//     display name), as class views do; classmates see the display name, as the class page and the Hub show classmates.
//   - every read checks the membership again (a student who left, an archived class: nothing); rows also go when the
//     student leaves the class (onClassLeave), the class is deleted, the set is deleted or the account goes
//     (game-sets.js remove and forgetUser). Nothing here goes to any AI.
import { q, now, audit } from '../db.js';
import { getUser } from '../auth.js';
import * as S from './schools.js';
import { isAide } from './homeroom-aides.js';
import { get as getSet, cleanFlashItems, FLASH_IMG } from './game-sets.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
/** The most shared sets one list shows (newest first). */
export const LIST_MAX = 200;
const LINK = /\b(?:https?:\/\/|www\.)\S|\b[a-z0-9-]+\.(?:com|org|net|io|ly|gg|co|me|app|xyz)\b/i;

/** Is this person an active student of this class (the class and the school live, still in the school)? */
export function studentOf(c, userId) {
  if (!c || c.archived_at || !userId) return false;
  const m = S.classMember(c.id, userId);
  if (!m || m.role !== 'student' || !S.membership(c.school_id, userId)) return false;
  const s = S.getSchool(c.school_id);
  return !!s && !s.archived_at;
}
/** May this grown-up see the class's shared sets (its teachers, the school's admins, its aides)? */
export const teacherOf = (u, c) => !!u && !!c && !c.archived_at && !u.is_guest && (S.canManageClass(u, c) || isAide(u, c));
/** May this grown-up hide a set from the class (its teachers and the school's admins; never an aide)? */
export const canHide = (u, c) => !!u && !!c && !c.archived_at && !u.is_guest && S.canManageClass(u, c);

/** The classes a student may share with: [{ id, name }]. */
export const shareClasses = u => (u && !u.is_guest && !u.banned ? S.classesOf(u.id, 'student').filter(c => studentOf(c, u.id)).map(c => ({ id: c.id, name: c.name })) : []);
/** The classes whose shared sets this grown-up sees in their list: the ones they teach and the ones they are an aide in. */
export function teacherClasses(u) {
  if (!u || u.is_guest || u.banned) return [];
  const out = new Map();
  for (const c of S.classesOf(u.id, 'teacher')) if (teacherOf(u, c)) out.set(c.id, { id: c.id, name: c.name });
  for (const r of q.all("SELECT c.id FROM homeroom_aides a JOIN classrooms c ON c.id=a.class_id WHERE a.user_id=? AND a.status='active' AND c.archived_at IS NULL", u.id)) {
    const c = S.getClass(r.id);
    if (c && !out.has(c.id) && teacherOf(u, c)) out.set(c.id, { id: c.id, name: c.name });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The cards as they may be shown to others: every picture left off, through the site's text filter again, no links.
 *  null when the set no longer passes. */
export function sharedItems(items) {
  const a = Array.isArray(items) && items[0];
  if (!a || !Array.isArray(a.c)) return null;
  const pic = v => (typeof v === 'string' && FLASH_IMG.test(v) ? '' : v);
  const plain = [{ t: a.t || '', c: a.c.map(x => [x[0], x[1], pic(x[2] || '')]), a: a.a === 'd' ? 'd' : 't' }];
  const clean = cleanFlashItems(plain);
  if (!clean) return null;
  const words = [clean[0].t, ...clean[0].c.flatMap(x => [x[0], x[1]])];
  if (words.some(w => LINK.test(String(w || '')))) return null;
  return clean;
}

const nameFor = (c, userId) => {
  const u = getUser(userId) || {};
  const sm = S.membership(c.school_id, userId);
  return { roster: (sm && sm.roster_name) || u.display_name || u.username || '', display: u.display_name || u.username || '' };
};
const rowsOf = setId => q.all('SELECT * FROM flash_shares WHERE set_id=?', setId);

/** The share switch for one of the student's own sets: [{ id, name, on, hidden }] per class they may share with. */
export function stateFor(u, setId) {
  const rows = new Map(rowsOf(setId).filter(r => r.owner_id === u.id).map(r => [r.class_id, r]));
  return shareClasses(u).map(c => { const r = rows.get(c.id); return { id: c.id, name: c.name, on: !!r && !r.hidden_at, hidden: !!(r && r.hidden_at) }; });
}
/** Every one of the student's own sets that is shared or hidden somewhere: { setId: [{ id, on, hidden }] }. */
export function mineFor(u, gameId) {
  const live = new Set(shareClasses(u).map(c => c.id)), out = {};
  for (const r of q.all('SELECT f.* FROM flash_shares f JOIN game_sets g ON g.id=f.set_id WHERE f.owner_id=? AND g.game_id=?', u.id, gameId)) {
    if (!live.has(r.class_id)) continue;
    (out[r.set_id] ||= []).push({ id: r.class_id, on: !r.hidden_at, hidden: !!r.hidden_at });
  }
  return out;
}

/** Turn sharing on or off for one class. The set must be the student's own and the class one they are a student of.
 *  On: the cards are checked again (sharedItems). A set the teacher hid from that class stays hidden ('hidden').
 *  -> { ok, classes } | { ok: false, code: 'notFound'|'noClass'|'bad'|'hidden' } */
export function setShare(u, gameId, setId, classId, on) {
  const s = getSet(gameId, setId);
  if (!s || !u || s.ownerId !== u.id) return fail('notFound');
  const c = S.getClass(String(classId || ''));
  if (!c || !studentOf(c, u.id)) return fail('noClass');
  const row = q.get('SELECT * FROM flash_shares WHERE set_id=? AND class_id=?', setId, c.id);
  if (on) {
    if (row && row.hidden_at) return fail('hidden');
    if (!sharedItems(s.items)) return fail('bad');
    if (!row) q.run('INSERT INTO flash_shares(set_id, class_id, owner_id, shared_at) VALUES (?,?,?,?)', setId, c.id, u.id, now());
  } else if (row && !row.hidden_at) q.run('DELETE FROM flash_shares WHERE set_id=? AND class_id=?', setId, c.id);
  audit(u.id, on ? 'flash.share' : 'flash.unshare', setId, { class: c.id });
  return ok({ classes: stateFor(u, setId) });
}

/** A live share row: the set still there, its owner still a student of the class. */
function liveRow(gameId, r) {
  const c = S.getClass(r.class_id);
  if (!c || !studentOf(c, r.owner_id)) return null;
  const s = getSet(gameId, r.set_id);
  if (!s || s.ownerId !== r.owner_id) return null;
  const items = sharedItems(s.items);
  return items ? { c, s, items } : null;
}
const view = (x, r, by, extra = {}) => ({ id: x.s.id, title: x.items[0].t || x.s.title || '', n: x.items[0].c.length, items: x.items, by, classId: x.c.id, className: x.c.name, at: r.shared_at, ...extra });

/** "Shared by my class": the sets classmates shared with the student's classes (not hidden, not their own). */
export function listForStudent(u, gameId) {
  const classes = shareClasses(u);
  if (!classes.length) return [];
  const rows = q.all(`SELECT f.* FROM flash_shares f JOIN game_sets g ON g.id=f.set_id WHERE g.game_id=? AND f.hidden_at IS NULL AND f.owner_id!=?
    AND f.class_id IN (${classes.map(() => '?').join(',')}) ORDER BY f.shared_at DESC LIMIT ?`, gameId, u.id, ...classes.map(c => c.id), LIST_MAX);
  const seen = new Set(), out = [];
  for (const r of rows) {
    if (seen.has(r.set_id)) continue;
    const x = liveRow(gameId, r); if (!x) continue;
    seen.add(r.set_id); out.push(view(x, r, nameFor(x.c, r.owner_id).display));
  }
  return out;
}
/** "Shared by students": every set shared with the classes this grown-up teaches or helps in, hidden ones marked. */
export function listForTeacher(u, gameId) {
  const classes = teacherClasses(u);
  if (!classes.length) return [];
  const rows = q.all(`SELECT f.* FROM flash_shares f JOIN game_sets g ON g.id=f.set_id WHERE g.game_id=?
    AND f.class_id IN (${classes.map(() => '?').join(',')}) ORDER BY f.shared_at DESC LIMIT ?`, gameId, ...classes.map(c => c.id), LIST_MAX);
  const out = [];
  for (const r of rows) {
    const x = liveRow(gameId, r); if (!x) continue;
    out.push(view(x, r, nameFor(x.c, r.owner_id).roster, { hidden: !!r.hidden_at, canHide: canHide(u, x.c) }));
  }
  return out;
}
/** One student's sets shared with a class, for the student's page (its teachers): [{ id, title, n, hidden }]. */
export function sharedByStudent(c, studentId, gameId) {
  return q.all('SELECT f.* FROM flash_shares f JOIN game_sets g ON g.id=f.set_id WHERE g.game_id=? AND f.class_id=? AND f.owner_id=? ORDER BY f.shared_at DESC LIMIT ?', gameId, c.id, studentId, LIST_MAX)
    .map(r => { const x = liveRow(gameId, r); return x ? { id: x.s.id, title: x.items[0].t || x.s.title || '', n: x.items[0].c.length, hidden: !!r.hidden_at } : null; }).filter(Boolean);
}

/** May this viewer open this set because it is shared with a class of theirs? -> { items, by, className, teacher } | null.
 *  A teacher (or aide) of the class sees hidden ones too; a classmate never does. */
export function openFor(u, gameId, setId) {
  if (!u || u.is_guest || u.banned) return null;
  for (const r of rowsOf(setId)) {
    if (r.owner_id === u.id) continue;
    const c = S.getClass(r.class_id);
    const teach = teacherOf(u, c);
    if (!teach && (r.hidden_at || !studentOf(c, u.id))) continue;
    const x = liveRow(gameId, r); if (!x) continue;
    const n = nameFor(x.c, r.owner_id);
    return { items: x.items, by: teach ? n.roster : n.display, className: x.c.name, teacher: teach };
  }
  return null;
}

/** A teacher hides a shared set from their class (or shows it again). -> { ok, hidden } | { ok: false, code } */
export function hide(u, gameId, setId, classId, hidden) {
  const c = S.getClass(String(classId || ''));
  if (!c || !teacherOf(u, c)) return fail('notFound');
  if (!canHide(u, c)) return fail('forbidden');
  const r = q.get('SELECT * FROM flash_shares WHERE set_id=? AND class_id=?', setId, c.id);
  if (!r || !liveRow(gameId, r)) return fail('notFound');
  q.run('UPDATE flash_shares SET hidden_at=?, hidden_by=? WHERE set_id=? AND class_id=?', hidden ? now() : null, hidden ? u.id : null, setId, c.id);
  audit(u.id, hidden ? 'flash.share_hide' : 'flash.share_show', setId, { class: c.id });
  return ok({ hidden: !!hidden });
}

// A student who leaves a class loses their shares there; a deleted class takes its rows.
S.onClassLeave(({ classId, userId = null } = {}) => {
  if (classId && userId) q.run('DELETE FROM flash_shares WHERE class_id=? AND owner_id=?', classId, userId);
  else if (classId) q.run('DELETE FROM flash_shares WHERE class_id=?', classId);
});
