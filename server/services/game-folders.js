// Games in folders, assigned to classes (owner, 17 Nov 2026: "get rid of lessons and instead just have the builder here
// with games that teachers can put in folders and assign", and "the ability to save oomba games to a folder").
//
// A folder belongs to one person (game_folders.owner_id) and holds any game they can see: their own Builder games and
// Oomba's own games. Folders are one level deep and only sort a person's games; putting a game in a folder never
// changes who can play it. Assigning a game to a class is a one-game assignment underneath (a lesson of kind 'game'
// with one game step, assigned with services/lessons.js), so students' scores, due dates, the gradebook and Google
// Classroom all work as they did for lessons.
import { q, uid, now, tx, audit } from '../db.js';
import * as S from './schools.js';
import * as games from './games.js';
import * as L from './lessons.js';

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = code => ({ ok: false, code });
export const MAX_FOLDERS = 100;
export const MAX_IN_FOLDER = 200;
const clean = name => String(name || '').replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

export const getFolder = id => (id ? q.get('SELECT * FROM game_folders WHERE id=?', String(id)) : null) || null;
const owns = (u, f) => !!u && !!f && f.owner_id === u.id;
/** A person's folders, in order, each with how many games it holds (deleted games are not counted). */
export const foldersOf = userId => (userId ? q.all(`SELECT f.*, (SELECT COUNT(*) FROM game_folder_items i JOIN games g ON g.id=i.game_id
  WHERE i.folder_id=f.id AND g.status!='deleted') games FROM game_folders f WHERE f.owner_id=? ORDER BY f.position, f.created_at`, userId) : []);
/** The folders of this person that hold this game (ids). */
export const foldersWith = (userId, gameId) => new Set(q.all('SELECT i.folder_id FROM game_folder_items i JOIN game_folders f ON f.id=i.folder_id WHERE f.owner_id=? AND i.game_id=?', userId, gameId).map(r => r.folder_id));

export function createFolder(u, name) {
  if (!u) return fail('notFound');
  const n = clean(name); if (!n) return fail('folderName');
  if (foldersOf(u.id).length >= MAX_FOLDERS) return fail('tooManyFolders');
  const id = uid(12), t = now();
  const pos = (q.get('SELECT COALESCE(MAX(position),-1) m FROM game_folders WHERE owner_id=?', u.id).m) + 1;
  q.run('INSERT INTO game_folders(id, owner_id, name, position, created_at, updated_at) VALUES (?,?,?,?,?,?)', id, u.id, n, pos, t, t);
  audit(u.id, 'gameFolder.create', id);
  return ok({ folder: getFolder(id) });
}
export function renameFolder(u, id, name) {
  const f = getFolder(id); if (!owns(u, f)) return fail('notFound');
  const n = clean(name); if (!n) return fail('folderName');
  q.run('UPDATE game_folders SET name=?, updated_at=? WHERE id=?', n, now(), f.id);
  return ok({ folder: getFolder(f.id) });
}
/** Deletes the folder only: its games stay where they are (in My games, on Oomba, in other folders). */
export function deleteFolder(u, id) {
  const f = getFolder(id); if (!owns(u, f)) return fail('notFound');
  tx(() => { q.run('DELETE FROM game_folder_items WHERE folder_id=?', f.id); q.run('DELETE FROM game_folders WHERE id=?', f.id); });
  audit(u.id, 'gameFolder.delete', f.id);
  return ok();
}
export function moveFolder(u, id, dir) {
  const f = getFolder(id); if (!owns(u, f)) return fail('notFound');
  const list = foldersOf(u.id), i = list.findIndex(x => x.id === f.id), j = i + (dir < 0 ? -1 : 1);
  if (j < 0 || j >= list.length) return ok();
  [list[i], list[j]] = [list[j], list[i]];
  tx(() => list.forEach((x, k) => q.run('UPDATE game_folders SET position=? WHERE id=?', k, x.id)));
  return ok();
}

/** A game a person may put in a folder: one they can see that is not deleted (their own drafts included). */
const saveable = (u, g) => !!g && g.status !== 'deleted' && games.canView(u, g);
export function addGame(u, folderId, gameId) {
  const f = getFolder(folderId); if (!owns(u, f)) return fail('notFound');
  const g = games.getGame(String(gameId || '')); if (!saveable(u, g)) return fail('pickGame');
  if (q.get('SELECT 1 FROM game_folder_items WHERE folder_id=? AND game_id=?', f.id, g.id)) return ok({ already: true, folder: f, game: g });
  const n = q.get('SELECT COUNT(*) n FROM game_folder_items WHERE folder_id=?', f.id).n;
  if (n >= MAX_IN_FOLDER) return fail('folderFull');
  q.run('INSERT INTO game_folder_items(folder_id, game_id, position, added_at) VALUES (?,?,?,?)', f.id, g.id, n, now());
  q.run('UPDATE game_folders SET updated_at=? WHERE id=?', now(), f.id);
  return ok({ folder: f, game: g });
}
export function removeGame(u, folderId, gameId) {
  const f = getFolder(folderId); if (!owns(u, f)) return fail('notFound');
  q.run('DELETE FROM game_folder_items WHERE folder_id=? AND game_id=?', f.id, String(gameId || ''));
  return ok({ folder: f });
}
/** The games in a folder, in the order they were added, that this person can still see. */
export function gamesIn(u, folderId) {
  const f = getFolder(folderId); if (!owns(u, f)) return [];
  return q.all(`SELECT g.* FROM game_folder_items i JOIN games g ON g.id=i.game_id WHERE i.folder_id=? AND g.status!='deleted' ORDER BY i.position, i.added_at`, f.id)
    .filter(g => games.canView(u, g));
}

// ---------------------------------------------------------------- assigning a game to a class
/** The classes this person may assign to: the ones they teach, then the classes of schools they run. */
export function assignClasses(u) {
  const mine = S.classesOf(u.id, 'teacher');
  const more = S.adminSchools(u).flatMap(s => S.classesOfSchool(s.id)).filter(c => !mine.some(m => m.id === c.id));
  return [...mine, ...more].filter(c => !c.archived_at && S.canManageClass(u, c));
}
/** Can this class play this game? An Oomba game (published, public, not course-only), or the teacher's own Builder game
 *  once it is published: public, school-wide, or for classes (then this class is added to its list). A draft, or one
 *  kept private, must be published first. -> { ok, game, share? } | { ok: false, code } */
export function assignable(u, g, c) {
  if (!g || g.status === 'deleted' || !games.canView(u, g)) return fail('pickGame');
  if (g.source === 'seed') return g.status === 'published' && g.visibility === 'public' && !g.course_only ? ok({ game: g }) : fail('pickGame');
  if (g.status !== 'published' || !g.published_version_id || g.hidden_reason) return fail('publishFirst');
  if (g.visibility === 'public') return ok({ game: g });
  if (g.visibility === 'school') return S.membership(c.school_id, g.owner_id) ? ok({ game: g }) : fail('publishFirst');
  if (g.visibility === 'class') return g.owner_id === u.id || games.gameLiveInClass(g.id, c.id) ? ok({ game: g, share: !games.gameLiveInClass(g.id, c.id) }) : fail('publishFirst');
  return fail('publishFirst');
}
/** The open assignment of this game in this class, if there is one. */
export const assignmentOf = (classId, gameId) => q.get(`SELECT cl.* FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id JOIN lesson_steps s ON s.lesson_id=l.id
  WHERE cl.class_id=? AND cl.removed_at IS NULL AND l.kind='game' AND s.kind='game' AND s.game_id=? LIMIT 1`, classId, gameId) || null;
/** Assign one game to a class (optionally due on a day): a 'game' lesson with the game as its one step. Assigning the same
 *  game to the same class again is refused (alreadyAssigned), so a class never has it twice.
 *  -> { ok, classLesson, game } | { ok: false, code, className? } */
export function assignGame(u, classId, gameId, { dueAt = null, opensAt = null, options = '' } = {}) {
  const c = S.getClass(String(classId || ''));
  if (!c || c.archived_at || !S.canManageClass(u, c)) return fail('notFound');
  const g = games.getGame(String(gameId || ''));
  const a = assignable(u, g, c); if (!a.ok) return a;
  if (assignmentOf(c.id, g.id)) return { ok: false, code: 'alreadyAssigned', className: c.name };
  const title = g.title;
  const made = L.createLesson(u, c.school_id, { title, kind: 'game' });
  if (!made.ok) return made;
  const step = L.addStep(u, made.lesson.id, { kind: 'game', gameId: g.id, title, options });
  if (!step.ok) { L.deleteLesson(u, made.lesson.id); return step; }
  const r = L.assign(u, c.id, made.lesson.id, { dueAt, opensAt });
  if (!r.ok) { L.deleteLesson(u, made.lesson.id); return r; }
  if (a.share) S.setGameClasses(g.id, [...new Set([...q.all('SELECT class_id FROM game_classes WHERE game_id=? AND removed_at IS NULL', g.id).map(x => x.class_id), c.id])], u.id);
  audit(u.id, 'lesson.assignGame', made.lesson.id, { game: g.slug || g.id, class: c.id });
  return ok({ classLesson: r.classLesson, game: g, class: c });
}
