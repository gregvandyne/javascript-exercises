// Game queries: visibility rules, rails for the home page, search, ratings, saves, scores, versions.
// Reused from the starter. Changes: canView is the single visibility gate (also respects report auto-hide),
// search also returns builders, and versions carry review status for updates to published games.
import { q, uid, now, tx } from '../db.js';
import * as presence from './presence.js';
import { current } from '../i18n/index.js';
import { queueShot } from './shots.js';

export const CATEGORIES = [
  ['arcade', '🕹️', 'Arcade'], ['sports', '⚽', 'Sports'], ['puzzle', '🧩', 'Puzzle'], ['words', '🔤', 'Words'],
  ['board', '🎲', 'Board'], ['adventure', '🗺️', 'Adventure'], ['learning', '📚', 'Learning'], ['music', '🎵', 'Music'], ['silly', '🤪', 'Silly']
];
export const CATEGORY_KEYS = CATEGORIES.map(c => c[0]);
export const categoryInfo = k => { const c = CATEGORIES.find(x => x[0] === k) || CATEGORIES[0]; return { key: c[0], icon: c[1], label: c[2] }; };
export const COVERS = ['sunset', 'ocean', 'forest', 'candy', 'night', 'lava', 'mint', 'gold'];
/** Sharing levels, narrow to wide (the Studio's share dialog lists them in this order). */
export const VISIBILITIES = ['private', 'friends', 'class', 'school', 'public'];
export const ORIENTATIONS = ['any', 'portrait', 'landscape'];

export const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'game';
export function uniqueSlug(title, exceptId = null) {
  const base = slugify(title); let s = base, i = 2;
  while (q.get('SELECT 1 FROM games WHERE slug=? AND id IS NOT ?', s, exceptId)) s = `${base}-${i++}`;
  return s;
}

export const getGame = id => (id ? q.get('SELECT * FROM games WHERE id=?', id) : null) || null;
export const getGameBySlug = slug => q.get('SELECT * FROM games WHERE slug=?', String(slug || '')) || null;
export const getVersion = id => (id ? q.get('SELECT * FROM game_versions WHERE id=?', id) : null) || null;
export const getOwner = game => q.get('SELECT id, username, display_name, avatar, color, photo_at FROM users WHERE id=?', game.owner_id) || null;

/** Same school (both active members)? Games shared with 'My school' are for schoolmates. */
export const sameSchool = (a, b) => !!(a && b && q.get("SELECT 1 FROM school_members x JOIN school_members y ON y.school_id=x.school_id WHERE x.user_id=? AND y.user_id=? AND x.status='active' AND y.status='active'", a, b));
export function areFriends(a, b) {
  if (!a || !b) return false;
  return !!q.get("SELECT 1 FROM friends WHERE user_id=? AND friend_id=? AND status='accepted'", a, b);
}

// ---------------------------------------------------------------- "Share with my classes" (visibility 'class')
// The one place that knows the class rule. canView and visibleWhere both use CLASS_SQL, so they can't disagree
// (tests/unit/class-sharing.test.js compares them across a matrix of viewers and games).

/** "Classroom c is live for person <who>": an active member of the class (student or teacher) who is still an active
 *  member of its school. (c must already be joined as a non-archived classroom of a non-archived school.) */
const LIVE_IN_CLASS = who => `EXISTS (SELECT 1 FROM class_members m JOIN school_members sm ON sm.school_id=c.school_id
    AND sm.user_id=m.user_id AND sm.status='active' WHERE m.class_id=c.id AND m.user_id=${who} AND m.status='active')`;
/** The live classes of game g: chosen by the owner, not taken off by a teacher, class and school not archived, and the
 *  owner still a live member of the class. A JOIN fragment on game_classes gc / classrooms c / schools s. */
const LINK_JOINS = `JOIN classrooms c ON c.id=gc.class_id AND c.archived_at IS NULL
    JOIN schools s ON s.id=c.school_id AND s.archived_at IS NULL`;
const LIVE_LINK_WHERE = `gc.removed_at IS NULL AND ${LIVE_IN_CLASS('g.owner_id')}`;
/** Is the viewer (param) an active school admin of class c's school? */
const SCHOOL_ADMIN_OF_C = "EXISTS (SELECT 1 FROM school_members a WHERE a.school_id=c.school_id AND a.user_id=? AND a.role='admin' AND a.status='active')";
/** The classes a viewer (param) can see class games in: the ones they are a live member of, and every class of a school
 *  they are an active admin of. Not correlated with the outer query, so SQLite builds it once per query. Params: 2× viewer. */
const VIEWER_CLASSES = `SELECT vm.class_id FROM class_members vm JOIN classrooms vc ON vc.id=vm.class_id
      JOIN school_members vsm ON vsm.school_id=vc.school_id AND vsm.user_id=vm.user_id AND vsm.status='active'
      WHERE vm.user_id=? AND vm.status='active'
    UNION SELECT ac.id FROM school_members a JOIN classrooms ac ON ac.school_id=a.school_id
      WHERE a.user_id=? AND a.role='admin' AND a.status='active'`;
/** The class branch of THE rule (used by canView AND visibleWhere). Params: viewerId, viewerId.
 *  A 'class' game reaches a viewer through any of its live classes (chosen by the owner, not taken off, class and
 *  school not archived, owner still a live member) when the viewer is a live member of that class or a school admin of
 *  its school (they moderate what is shared inside their classes). Driven from the viewer's own classes, so its cost
 *  follows the viewer's classes, not the number of class games on the site. */
export const CLASS_SQL = `(g.visibility='class' AND g.id IN (SELECT gc.game_id FROM game_classes gc ${LINK_JOINS}
    JOIN games og ON og.id=gc.game_id
    JOIN class_members om ON om.class_id=c.id AND om.user_id=og.owner_id AND om.status='active'
    JOIN school_members osm ON osm.school_id=c.school_id AND osm.user_id=og.owner_id AND osm.status='active'
    WHERE gc.removed_at IS NULL AND gc.class_id IN (${VIEWER_CLASSES})))`;
/** Does this game reach this viewer through one of its classes? (The same SQL as listings use.) */
const classReach = (userId, gameId) => !!q.get(`SELECT 1 FROM games g WHERE g.id=? AND ${CLASS_SQL}`, gameId, userId, userId);

/** THE visibility rule. Can this user open/play this game's published version?
 *  Private: owner and admins. Friends: owner, admins, accepted friends. School: schoolmates. Class: the members (and
 *  school admins) of the classes the owner chose, while the owner is still in them (CLASS_SQL). Public: everyone.
 *  Everything except owner/admin only while published and not hidden. */
export function canView(user, game) {
  if (!game) return false;
  if (user && user.role === 'admin') return true;
  if (game.status === 'deleted') return false;
  if (user && user.id === game.owner_id) return true;
  if (game.status !== 'published' || !game.published_version_id || game.hidden_reason) return false;
  if (game.visibility === 'public') return true;
  if (game.visibility === 'friends') return !!user && areFriends(game.owner_id, user.id);
  if (game.visibility === 'school') return !!user && sameSchool(game.owner_id, user.id);
  if (game.visibility === 'class') return !!user && classReach(user.id, game.id);
  return false;
}
export const canEdit = (user, game) => !!user && !!game && game.status !== 'deleted' && (user.id === game.owner_id || user.role === 'admin');

/** A builder deletes their game. Kept in the database (reports and the audit trail still point at it) but gone
 *  for everyone: off every list, out of the review queue, and the Studio and play page say not found. Starter games can't be deleted. */
export function deleteGame(gameId) {
  tx(() => {
    q.run("UPDATE games SET status='deleted', visibility='private', pending_version_id=NULL, pending_visibility='', pending_classes='', featured=0, updated_at=? WHERE id=?", now(), gameId);
    q.run('DELETE FROM game_classes WHERE game_id=?', gameId);
  });
}

/** SQL fragment + params restricting listings to games this viewer may see (mirrors canView exactly for everyone but
 *  platform admins, whose listings follow the normal rule; listings never show other people's private games).
 *  Signed out: public only. Any future sitemap, feed or embed list must use visibleWhere(null). */
export function visibleWhere(user) {
  const base = "g.status='published' AND g.published_version_id IS NOT NULL AND g.hidden_reason=''";
  if (!user) return { sql: `${base} AND g.visibility='public'`, params: [] };
  return {
    sql: `${base} AND (g.visibility='public' OR g.owner_id=? OR (g.visibility='friends' AND g.owner_id IN (SELECT friend_id FROM friends WHERE user_id=? AND status='accepted'))
      OR (g.visibility='school' AND g.owner_id IN (SELECT a.user_id FROM school_members a JOIN school_members b ON b.school_id=a.school_id WHERE b.user_id=? AND a.status='active' AND b.status='active'))
      OR ${CLASS_SQL})`,
    params: [user.id, user.id, user.id, user.id, user.id]
  };
}
const COLS = `g.id, g.slug, g.owner_id, g.title, g.description, g.icon, g.cover, g.category, g.tags, g.visibility, g.status, g.plays, g.likes, g.rating_sum, g.rating_count, g.featured, g.players_max, g.orientation, g.source, g.published_at, g.updated_at, g.created_at, g.current_version_id, g.published_version_id, g.pending_version_id, g.review_note, g.hidden_reason, g.l10n,
  u.username AS owner_name, u.display_name AS owner_display, u.avatar AS owner_avatar, u.color AS owner_color, u.photo_at AS owner_photo_at`;
export const SELECT = `SELECT ${COLS} FROM games g JOIN users u ON u.id=g.owner_id`;

export const avgRating = g => (g.rating_count ? g.rating_sum / g.rating_count : 0);
/** Launch games carry translated descriptions (seed JSON "l10n"): show the one for the page's language.
 *  Read-only view helper: never save its result back (the stored title/description stay the originals). */
export function localizeGame(g, locale = current().locale) {
  if (!g || !g.l10n || !locale || locale === 'en') return g;
  let m; try { m = JSON.parse(g.l10n); } catch { return g; }
  const e = (m && (m[locale] || m[locale.split('-')[0]])) || null;
  if (!e) return g;
  return { ...g, title: e.title || g.title, description: e.description || g.description, tags: e.tags || g.tags };
}
export function decorate(rows) {
  const pc = presence.counts(rows.map(r => r.id));
  return rows.map(r => localizeGame(r)).map(r => ({ ...r, playing: pc[r.id] || 0, rating: avgRating(r), tagList: r.tags ? r.tags.split(',').map(s => s.trim()).filter(Boolean) : [] }));
}
const ORDERS = {
  plays: 'g.featured DESC, g.plays DESC, g.published_at DESC',
  popular: 'g.plays DESC, g.likes DESC, g.published_at DESC',
  new: 'g.published_at DESC',
  rated: 'CASE WHEN g.rating_count>0 THEN (g.rating_sum*1.0+3*2)/(g.rating_count+2) ELSE 0 END DESC, g.rating_count DESC, g.plays DESC',
  likes: 'g.likes DESC', title: 'g.title ASC'
};
export function listVisible(user, { order = 'popular', limit = 24, category = null, ownerId = null, featured = false, offset = 0 } = {}) {
  const v = visibleWhere(user); const params = [...v.params]; let where = v.sql;
  if (category) { where += ' AND g.category=?'; params.push(category); }
  if (ownerId) { where += ' AND g.owner_id=?'; params.push(ownerId); }
  if (featured) where += ' AND g.featured>0';   // 1 = featured, 2 = also the home-page hero (seed JSON "hero": true)
  return decorate(q.all(`${SELECT} WHERE ${where} ORDER BY ${ORDERS[order] || ORDERS.popular} LIMIT ? OFFSET ?`, ...params, limit, offset));
}
export function playingNow(user, limit = 12) {
  const top = presence.top(60); if (!top.length) return [];
  const ids = top.map(t => t[0]); const v = visibleWhere(user);
  const rows = q.all(`${SELECT} WHERE ${v.sql} AND g.id IN (${ids.map(() => '?').join(',')})`, ...v.params, ...ids);
  const order = new Map(top); return decorate(rows).sort((a, b) => (order.get(b.id) || 0) - (order.get(a.id) || 0)).slice(0, limit);
}
export function fromFriends(user, limit = 12) {
  if (!user) return [];
  return decorate(q.all(`${SELECT} WHERE g.status='published' AND g.published_version_id IS NOT NULL AND g.hidden_reason='' AND g.visibility IN ('public','friends') AND g.owner_id IN (SELECT friend_id FROM friends WHERE user_id=? AND status='accepted') ORDER BY g.published_at DESC LIMIT ?`, user.id, limit));
}
/** A player's favorites (the games they tapped ❤️ on), newest first. Only games this viewer may still see. */
export function favorites(viewer, userId, limit = 24, offset = 0) {
  const v = visibleWhere(viewer);
  return decorate(q.all(`${SELECT} JOIN likes l ON l.game_id=g.id AND l.user_id=? WHERE ${v.sql} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`, userId, ...v.params, limit, offset));
}
/** All of a builder's own games (any status) for "My games". */
export function myGames(userId, limit = 50) {
  return decorate(q.all(`${SELECT} WHERE g.owner_id=? AND g.status!='deleted' ORDER BY g.updated_at DESC LIMIT ?`, userId, limit));
}
const likeEsc = t => `%${t.replace(/[\\%_]/g, '')}%`;
export function search(user, { text = '', category = null, order = 'relevance', limit = 40 } = {}) {
  const v = visibleWhere(user); const params = [...v.params]; let where = v.sql;
  const t = String(text || '').trim().slice(0, 60);
  if (t) {
    const like = likeEsc(t);
    where += ' AND (g.title LIKE ? OR g.description LIKE ? OR g.tags LIKE ? OR u.username LIKE ? OR u.display_name LIKE ? OR g.category LIKE ? OR g.l10n LIKE ?)';
    params.push(like, like, like, like, like, like, like);
  }
  if (category) { where += ' AND g.category=?'; params.push(category); }
  let orderSql = ORDERS.popular;
  if (order === 'new') orderSql = ORDERS.new;
  else if (order === 'rated') orderSql = ORDERS.rated;
  else if (order === 'popular') orderSql = ORDERS.popular;
  else if (t && order !== 'playing') { const pre = `${t.replace(/[\\%_]/g, '')}%`; orderSql = `CASE WHEN g.title LIKE ? THEN 0 WHEN u.username LIKE ? OR u.display_name LIKE ? THEN 1 WHEN g.title LIKE ? THEN 2 ELSE 3 END, g.plays DESC`; params.push(pre, pre, pre, likeEsc(t)); }
  let rows = decorate(q.all(`${SELECT} WHERE ${where} ORDER BY ${orderSql} LIMIT ?`, ...params, limit));
  if (order === 'playing') rows = rows.sort((a, b) => b.playing - a.playing || b.plays - a.plays);
  return rows;
}
/** Builders whose username or display name match (only builders with at least one game the viewer can see). */
export function searchBuilders(user, text, limit = 8) {
  const t = String(text || '').trim().slice(0, 40); if (t.length < 2) return [];
  const v = visibleWhere(user); const like = likeEsc(t);
  return q.all(`SELECT u.id, u.username, u.display_name, u.avatar, u.color, u.photo_at, COUNT(g.id) AS games, COALESCE(SUM(g.plays),0) AS plays
    FROM users u JOIN games g ON g.owner_id=u.id WHERE ${v.sql} AND u.account_type!='grownup' AND (u.username LIKE ? OR u.display_name LIKE ?) GROUP BY u.id ORDER BY plays DESC LIMIT ?`, ...v.params, like, like, limit);
}
export function similar(user, game, limit = 6) {
  const rows = listVisible(user, { category: game.category, limit: limit + 1 }).filter(g => g.id !== game.id);
  if (rows.length < limit) listVisible(user, { limit: limit * 2 }).forEach(g => { if (g.id !== game.id && !rows.find(r => r.id === g.id) && rows.length < limit) rows.push(g); });
  return rows.slice(0, limit);
}

// ---------------------------------------------------------------- class pages and "Shared with"
const LIVE_CLASS_GAME = "g.status='published' AND g.published_version_id IS NOT NULL AND g.hidden_reason='' AND g.visibility='class'";
/** Games live in this class right now (live, shared 'class' with it, owner still in it, link not taken off), newest share
 *  first. Callers gate the class page (canViewClass / canManageClass): every viewer who passes that gate can open every
 *  game listed (a live member of the class, or a school admin of its school). */
export function classGames(classId, { limit = 48 } = {}) {
  return decorate(q.all(`SELECT ${COLS}, gc.added_at AS shared_at FROM games g JOIN users u ON u.id=g.owner_id
    JOIN game_classes gc ON gc.game_id=g.id AND gc.class_id=? ${LINK_JOINS}
    WHERE ${LIVE_CLASS_GAME} AND ${LIVE_LINK_WHERE} ORDER BY gc.added_at DESC LIMIT ?`, classId, limit));
}
/** Games a teacher took off this class (the teacher's "Put back" list), newest first. Titles only: no covers or links. */
/** Games a teacher took off this class (newest first). Callers must only show a title/icon the viewer canView now. */
export const removedClassGames = classId => q.all(`SELECT g.*, gc.removed_at, gc.removed_by,
    u.username AS owner_name, u.display_name AS owner_display FROM game_classes gc JOIN games g ON g.id=gc.game_id JOIN users u ON u.id=g.owner_id
  WHERE gc.class_id=? AND gc.removed_at IS NOT NULL AND g.status!='deleted' ORDER BY gc.removed_at DESC LIMIT 100`, classId);
/** Is this game live in this class right now? (Lessons: can the class play this game step?) */
export const gameLiveInClass = (gameId, classId) => !!(gameId && classId && q.get(`SELECT 1 FROM games g JOIN game_classes gc ON gc.game_id=g.id AND gc.class_id=? ${LINK_JOINS}
  WHERE g.id=? AND ${LIVE_CLASS_GAME} AND ${LIVE_LINK_WHERE}`, classId, gameId));
/** Live class games shared with a class this person teaches in this school (not their own): the lesson editor's
 *  "Shared with my classes" group. Never sent to the AI lesson-draft catalog. */
export const classGamesForTeacher = (userId, schoolId, limit = 100) => q.all(`SELECT DISTINCT g.id, g.title, g.icon, g.slug, g.status, g.visibility, g.source, g.published_at
  FROM games g JOIN game_classes gc ON gc.game_id=g.id ${LINK_JOINS}
  WHERE ${LIVE_CLASS_GAME} AND ${LIVE_LINK_WHERE} AND c.school_id=? AND g.owner_id!=?
    AND EXISTS (SELECT 1 FROM class_members t WHERE t.class_id=c.id AND t.user_id=? AND t.role='teacher' AND t.status='active')
  ORDER BY g.published_at DESC LIMIT ?`, schoolId, userId, userId, limit);
/** The classes a game reaches through its list right now (whatever its status: the Studio shows the owner where a live
 *  'class' game is shared): [{ id, name, school_id, school_name, mine }] ordered by school and name. mine: the viewer
 *  (viewerId) is a live member of the class or a school admin of its school. */
export function liveClasses(gameId, viewerId = null) {
  return q.all(`SELECT c.id, c.name, c.school_id, s.name AS school_name, (${LIVE_IN_CLASS('?')} OR ${SCHOOL_ADMIN_OF_C}) AS mine
    FROM games g JOIN game_classes gc ON gc.game_id=g.id ${LINK_JOINS} WHERE g.id=? AND ${LIVE_LINK_WHERE}
    ORDER BY s.name COLLATE NOCASE, c.name COLLATE NOCASE`, viewerId, viewerId, gameId).map(r => ({ ...r, mine: !!r.mine }));
}
/** "Shared with: 5B, Art Club" for a 'class' game, for a viewer who can already see it: the owner and platform admins
 *  get every class name; anyone else gets the names of the classes they are in (or run as a school admin) and a count
 *  of the others, so a child's other classes and clubs aren't shown to everyone. -> { names, others } or null. */
export function classNamesFor(game, viewer) {
  if (!game || game.visibility !== 'class') return null;
  const list = liveClasses(game.id, viewer ? viewer.id : null);
  const all = !!viewer && (viewer.id === game.owner_id || viewer.role === 'admin');
  const shown = all ? list : list.filter(c => c.mine);
  return { names: shown.map(c => c.name), others: list.length - shown.length };
}

export function rate(gameId, userId, stars) {
  stars = Math.max(1, Math.min(5, Math.round(+stars || 0)));
  tx(() => {
    q.run('INSERT INTO ratings(game_id,user_id,stars,created_at) VALUES(?,?,?,?) ON CONFLICT(game_id,user_id) DO UPDATE SET stars=excluded.stars, created_at=excluded.created_at', gameId, userId, stars, now());
    const agg = q.get('SELECT COALESCE(SUM(stars),0) s, COUNT(*) c FROM ratings WHERE game_id=?', gameId);
    q.run('UPDATE games SET rating_sum=?, rating_count=? WHERE id=?', agg.s, agg.c, gameId);
  });
  const g = q.get('SELECT rating_sum, rating_count FROM games WHERE id=?', gameId);
  return { stars, sum: g.rating_sum, count: g.rating_count, average: g.rating_count ? g.rating_sum / g.rating_count : 0 };
}
export function toggleLike(gameId, userId) {
  const had = q.get('SELECT 1 FROM likes WHERE game_id=? AND user_id=?', gameId, userId);
  tx(() => {
    if (had) q.run('DELETE FROM likes WHERE game_id=? AND user_id=?', gameId, userId); else q.run('INSERT INTO likes(game_id,user_id,created_at) VALUES(?,?,?)', gameId, userId, now());
    q.run('UPDATE games SET likes=(SELECT COUNT(*) FROM likes WHERE game_id=?) WHERE id=?', gameId, gameId);
  });
  return { liked: !had, likes: q.get('SELECT likes FROM games WHERE id=?', gameId).likes };
}
export function userRating(gameId, userId) { const r = userId ? q.get('SELECT stars FROM ratings WHERE game_id=? AND user_id=?', gameId, userId) : null; return r ? r.stars : 0; }
export function userLiked(gameId, userId) { return !!(userId && q.get('SELECT 1 FROM likes WHERE game_id=? AND user_id=?', gameId, userId)); }
/** True if this user opened this game recently (a recorded play in the window): a cheap gate before accepting a score. */
export const hasRecentPlay = (gameId, userId, windowMs = 24 * 3600e3) => !!userId && !!q.get('SELECT 1 FROM plays WHERE game_id=? AND user_id=? AND started_at > ?', gameId, userId, now() - windowMs);
export function recordPlay(gameId, userId) {
  const id = uid();
  tx(() => {
    q.run('INSERT INTO plays(id, game_id, user_id, started_at) VALUES (?,?,?,?)', id, gameId, userId || null, now());
    q.run('UPDATE games SET plays=plays+1 WHERE id=?', gameId);
  });
  return id;
}
export function endPlay(playId, userId) {
  const p = q.get('SELECT * FROM plays WHERE id=? AND user_id IS ?', playId, userId || null); if (!p) return;
  const t = now(); q.run('UPDATE plays SET ended_at=?, seconds=? WHERE id=?', t, Math.min(6 * 3600, Math.round((t - p.started_at) / 1000)), playId);
}
export function leaderboard(gameId, limit = 10) {
  return q.all(`SELECT s.score, s.label, s.created_at, u.id, u.username, u.display_name, u.avatar, u.color, u.photo_at FROM scores s JOIN users u ON u.id=s.user_id WHERE s.game_id=? AND u.banned=0 AND u.account_type!='grownup' ORDER BY s.score DESC, s.created_at ASC LIMIT ?`, gameId, limit);
}
export function submitScore(gameId, userId, score, label = '') {
  score = Math.max(0, Math.min(1e9, Math.floor(+score || 0)));
  const best = q.get('SELECT score FROM scores WHERE game_id=? AND user_id=? ORDER BY score DESC LIMIT 1', gameId, userId);
  if (best && best.score >= score) return { best: best.score, improved: false };
  tx(() => {
    q.run('DELETE FROM scores WHERE game_id=? AND user_id=?', gameId, userId);
    q.run('INSERT INTO scores(id, game_id, user_id, score, label, created_at) VALUES (?,?,?,?,?,?)', uid(), gameId, userId, score, String(label || '').slice(0, 40), now());
  });
  return { best: score, improved: true };
}
export function getSave(gameId, userId) { const r = userId ? q.get('SELECT data FROM saves WHERE game_id=? AND user_id=?', gameId, userId) : null; try { return r ? JSON.parse(r.data) : {}; } catch { return {}; } }
export const SAVE_MAX = 500_000;
export function putSave(gameId, userId, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('save must be an object');
  for (const [k, v] of Object.entries(data)) if (typeof v !== 'string' || k.length > 200) throw new Error('save values must be strings');
  const s = JSON.stringify(data); if (s.length > SAVE_MAX) throw new Error('save too large');
  q.run('INSERT INTO saves(game_id,user_id,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(game_id,user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at', gameId, userId, s, now());
}

/** Create a game shell owned by a user (no version yet). */
export function createGame(ownerId, { title = 'Untitled game', icon = '🎮', cover = 'sunset', category = 'arcade', description = '', tags = '', source = 'studio', orientation = 'any', players_max = 1, slug = null } = {}) {
  const id = uid(10); const t = now();
  q.run('INSERT INTO games(id, slug, owner_id, title, description, icon, cover, category, tags, source, orientation, players_max, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, slug && !getGameBySlug(slug) ? slug : uniqueSlug(title), ownerId, title, description, icon, COVERS.includes(cover) ? cover : 'sunset', CATEGORY_KEYS.includes(category) ? category : 'arcade', tags, source, orientation, players_max, t, t);
  return getGame(id);
}
const META_FIELDS = { title: 60, description: 600, icon: 8, cover: 12, category: 12, tags: 200, orientation: 10, players_max: 2 };
export function updateMeta(gameId, fields) {
  const sets = [], params = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!(k in META_FIELDS) || v === undefined || v === null) continue;
    let val = k === 'players_max' ? Math.max(1, Math.min(8, Math.round(+v || 1))) : String(v).slice(0, META_FIELDS[k]);
    if (k === 'category' && !CATEGORY_KEYS.includes(val)) continue;
    if (k === 'cover' && !COVERS.includes(val)) continue;
    if (k === 'orientation' && !ORIENTATIONS.includes(val)) continue;
    if (k === 'title' && !val.trim()) continue;
    sets.push(`${k}=?`); params.push(val);
  }
  if (!sets.length) return getGame(gameId);
  q.run(`UPDATE games SET ${sets.join(', ')}, updated_at=? WHERE id=?`, ...params, now(), gameId);
  return getGame(gameId);
}
export function addVersion(gameId, html, { notes = '', createdBy = null, safetyStatus = 'unchecked', safetyReport = {} } = {}) {
  const id = uid(10);
  tx(() => {
    const last = q.get('SELECT MAX(number) n FROM game_versions WHERE game_id=?', gameId);
    const number = (last && last.n ? last.n : 0) + 1;
    q.run('INSERT INTO game_versions(id, game_id, number, html, notes, safety_status, safety_report, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)', id, gameId, number, html, String(notes).slice(0, 500), safetyStatus, JSON.stringify(safetyReport), createdBy, now());
    q.run('UPDATE games SET current_version_id=?, updated_at=? WHERE id=?', id, now(), gameId);
  });
  if (safetyStatus !== 'fail') queueShot(id);   // its cover picture, in the background (skips launch games)
  return getVersion(id);
}
/** Restore = copy an old version forward as a new version (history is never rewritten). */
export function restoreVersion(gameId, versionId, userId) {
  const v = getVersion(versionId); if (!v || v.game_id !== gameId) return null;
  return addVersion(gameId, v.html, { notes: `Restored version ${v.number}`, createdBy: userId, safetyStatus: v.safety_status, safetyReport: JSON.parse(v.safety_report || '{}') });
}
export const listVersions = gameId => q.all('SELECT id, game_id, number, notes, safety_status, review_status, created_by, created_at, length(html) AS size FROM game_versions WHERE game_id=? ORDER BY number DESC', gameId);
