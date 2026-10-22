// Game queries: visibility rules, rails for the home page, search, ratings, versions.
import { db, q, uid, now } from '../db.js';
import * as presence from './presence.js';

export const CATEGORIES = [
  ['arcade', '🕹️', 'Arcade'], ['sports', '⚽', 'Sports'], ['puzzle', '🧩', 'Puzzle'], ['words', '🔤', 'Words'],
  ['board', '🎲', 'Board'], ['adventure', '🗺️', 'Adventure'], ['learning', '📚', 'Learning'], ['music', '🎵', 'Music'], ['silly', '🤪', 'Silly']
];
export const COVERS = ['sunset', 'ocean', 'forest', 'candy', 'night', 'lava', 'mint', 'gold'];
export const VISIBILITIES = ['private', 'friends', 'public'];

export const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'game';
export function uniqueSlug(title) {
  let base = slugify(title), s = base, i = 2;
  while (q.get('SELECT 1 FROM games WHERE slug=?', s)) s = `${base}-${i++}`;
  return s;
}

export const getGame = id => q.get('SELECT * FROM games WHERE id=?', id) || null;
export const getGameBySlug = slug => q.get('SELECT * FROM games WHERE slug=?', slug) || null;
export const getVersion = id => (id ? q.get('SELECT * FROM game_versions WHERE id=?', id) : null) || null;
export const getOwner = game => q.get('SELECT id, username, display_name, avatar, color FROM users WHERE id=?', game.owner_id) || null;

export function areFriends(a, b) {
  if (!a || !b) return false;
  return !!q.get("SELECT 1 FROM friends WHERE user_id=? AND friend_id=? AND status='accepted'", a, b);
}
/** Can this user open/play this game's published version? */
export function canView(user, game) {
  if (!game) return false;
  if (user && (user.id === game.owner_id || user.role === 'admin')) return true;
  if (game.status !== 'published' || !game.published_version_id) return false;
  if (game.visibility === 'public') return true;
  if (game.visibility === 'friends') return !!user && areFriends(game.owner_id, user.id);
  return false;
}
export const canEdit = (user, game) => !!user && !!game && (user.id === game.owner_id || user.role === 'admin');

/** SQL fragment + params restricting to games this viewer may see in listings. */
function visibleWhere(user) {
  if (user && user.role === 'admin') return { sql: "g.status='published'", params: [] };
  if (!user) return { sql: "g.status='published' AND g.visibility='public'", params: [] };
  return {
    sql: `g.status='published' AND (g.visibility='public' OR g.owner_id=? OR (g.visibility='friends' AND g.owner_id IN (SELECT friend_id FROM friends WHERE user_id=? AND status='accepted')))`,
    params: [user.id, user.id]
  };
}
const SELECT = `SELECT g.*, u.username AS owner_name, u.display_name AS owner_display, u.avatar AS owner_avatar, u.color AS owner_color FROM games g JOIN users u ON u.id=g.owner_id`;

export function decorate(rows) {
  const ids = rows.map(r => r.id); const pc = presence.counts(ids);
  return rows.map(r => ({ ...r, playing: pc[r.id] || 0, rating: r.rating_count ? r.rating_sum / r.rating_count : 0, tagList: r.tags ? r.tags.split(',').filter(Boolean) : [] }));
}
export function listVisible(user, { order = 'plays', limit = 24, category = null, ownerId = null, featured = false, offset = 0 } = {}) {
  const v = visibleWhere(user); const params = [...v.params]; let where = v.sql;
  if (category) { where += ' AND g.category=?'; params.push(category); }
  if (ownerId) { where += ' AND g.owner_id=?'; params.push(ownerId); }
  if (featured) where += ' AND g.featured=1';
  const ORDER = { plays: 'g.plays DESC, g.published_at DESC', new: 'g.published_at DESC', rated: 'CASE WHEN g.rating_count>0 THEN g.rating_sum*1.0/g.rating_count ELSE 0 END DESC, g.rating_count DESC, g.plays DESC', likes: 'g.likes DESC', title: 'g.title ASC' }[order] || 'g.plays DESC';
  return decorate(q.all(`${SELECT} WHERE ${where} ORDER BY ${ORDER} LIMIT ? OFFSET ?`, ...params, limit, offset));
}
export function playingNow(user, limit = 12) {
  const top = presence.top(40); if (!top.length) return [];
  const ids = top.map(t => t[0]); const v = visibleWhere(user);
  const rows = q.all(`${SELECT} WHERE ${v.sql} AND g.id IN (${ids.map(() => '?').join(',')})`, ...v.params, ...ids);
  const order = new Map(top); return decorate(rows).sort((a, b) => (order.get(b.id) || 0) - (order.get(a.id) || 0)).slice(0, limit);
}
export function fromFriends(user, limit = 12) {
  if (!user) return [];
  return decorate(q.all(`${SELECT} WHERE g.status='published' AND g.visibility IN ('public','friends') AND g.owner_id IN (SELECT friend_id FROM friends WHERE user_id=? AND status='accepted') ORDER BY g.published_at DESC LIMIT ?`, user.id, limit));
}
export function search(user, { text = '', category = null, order = 'relevance', limit = 40 } = {}) {
  const v = visibleWhere(user); const params = [...v.params]; let where = v.sql;
  const t = String(text || '').trim().slice(0, 60);
  if (t) {
    const like = `%${t.replace(/[%_]/g, '')}%`;
    where += ' AND (g.title LIKE ? OR g.description LIKE ? OR g.tags LIKE ? OR u.username LIKE ? OR u.display_name LIKE ? OR g.category LIKE ?)';
    params.push(like, like, like, like, like, like);
  }
  if (category) { where += ' AND g.category=?'; params.push(category); }
  let orderSql = 'g.plays DESC';
  if (order === 'new') orderSql = 'g.published_at DESC';
  else if (order === 'rated') orderSql = 'CASE WHEN g.rating_count>0 THEN g.rating_sum*1.0/g.rating_count ELSE 0 END DESC, g.rating_count DESC';
  else if (t) { orderSql = `CASE WHEN g.title LIKE ? THEN 0 WHEN u.username LIKE ? THEN 1 ELSE 2 END, g.plays DESC`; params.push(`${t.replace(/[%_]/g, '')}%`, `${t.replace(/[%_]/g, '')}%`); }
  return decorate(q.all(`${SELECT} WHERE ${where} ORDER BY ${orderSql} LIMIT ?`, ...params, limit));
}
export function similar(user, game, limit = 6) {
  const rows = listVisible(user, { category: game.category, limit: limit + 1 }).filter(g => g.id !== game.id);
  if (rows.length < limit) listVisible(user, { limit: limit * 2 }).forEach(g => { if (g.id !== game.id && !rows.find(r => r.id === g.id) && rows.length < limit) rows.push(g); });
  return rows.slice(0, limit);
}

export function rate(gameId, userId, stars) {
  stars = Math.max(1, Math.min(5, Math.round(+stars || 0)));
  db.transaction(() => {
    q.run('INSERT INTO ratings(game_id,user_id,stars,created_at) VALUES(?,?,?,?) ON CONFLICT(game_id,user_id) DO UPDATE SET stars=excluded.stars, created_at=excluded.created_at', gameId, userId, stars, now());
    const agg = q.get('SELECT COALESCE(SUM(stars),0) s, COUNT(*) c FROM ratings WHERE game_id=?', gameId);
    q.run('UPDATE games SET rating_sum=?, rating_count=? WHERE id=?', agg.s, agg.c, gameId);
  })();
  return q.get('SELECT rating_sum, rating_count FROM games WHERE id=?', gameId);
}
export function toggleLike(gameId, userId) {
  const had = q.get('SELECT 1 FROM likes WHERE game_id=? AND user_id=?', gameId, userId);
  db.transaction(() => {
    if (had) q.run('DELETE FROM likes WHERE game_id=? AND user_id=?', gameId, userId); else q.run('INSERT INTO likes(game_id,user_id,created_at) VALUES(?,?,?)', gameId, userId, now());
    q.run('UPDATE games SET likes=(SELECT COUNT(*) FROM likes WHERE game_id=?) WHERE id=?', gameId, gameId);
  })();
  return !had;
}
export function userRating(gameId, userId) { const r = userId ? q.get('SELECT stars FROM ratings WHERE game_id=? AND user_id=?', gameId, userId) : null; return r ? r.stars : 0; }
export function userLiked(gameId, userId) { return !!(userId && q.get('SELECT 1 FROM likes WHERE game_id=? AND user_id=?', gameId, userId)); }
export function recordPlay(gameId, userId) {
  const id = uid();
  db.transaction(() => {
    q.run('INSERT INTO plays(id, game_id, user_id, started_at) VALUES (?,?,?,?)', id, gameId, userId || null, now());
    q.run('UPDATE games SET plays=plays+1 WHERE id=?', gameId);
  })();
  return id;
}
export function leaderboard(gameId, limit = 10) {
  return q.all(`SELECT s.score, s.label, s.created_at, u.username, u.display_name, u.avatar, u.color FROM scores s JOIN users u ON u.id=s.user_id WHERE s.game_id=? ORDER BY s.score DESC, s.created_at ASC LIMIT ?`, gameId, limit);
}
export function submitScore(gameId, userId, score, label = '') {
  score = Math.max(0, Math.min(1e9, Math.floor(+score || 0)));
  const best = q.get('SELECT score FROM scores WHERE game_id=? AND user_id=? ORDER BY score DESC LIMIT 1', gameId, userId);
  if (best && best.score >= score) return { best: best.score, improved: false };
  q.run('DELETE FROM scores WHERE game_id=? AND user_id=?', gameId, userId);
  q.run('INSERT INTO scores(id, game_id, user_id, score, label, created_at) VALUES (?,?,?,?,?,?)', uid(), gameId, userId, score, String(label || '').slice(0, 40), now());
  return { best: score, improved: true };
}
export function getSave(gameId, userId) { const r = userId ? q.get('SELECT data FROM saves WHERE game_id=? AND user_id=?', gameId, userId) : null; try { return r ? JSON.parse(r.data) : {}; } catch { return {}; } }
export function putSave(gameId, userId, data) {
  const s = JSON.stringify(data || {}); if (s.length > 200_000) throw new Error('save too large');
  q.run('INSERT INTO saves(game_id,user_id,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(game_id,user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at', gameId, userId, s, now());
}

/** Create a game shell owned by a user (no version yet). */
export function createGame(ownerId, { title = 'Untitled game', icon = '🎮', cover = 'sunset', category = 'arcade', description = '', source = 'studio' } = {}) {
  const id = uid(10); const t = now();
  q.run('INSERT INTO games(id, slug, owner_id, title, description, icon, cover, category, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', id, uniqueSlug(title), ownerId, title, description, icon, cover, category, source, t, t);
  return getGame(id);
}
export function addVersion(gameId, html, { notes = '', createdBy = null, safetyStatus = 'unchecked', safetyReport = {} } = {}) {
  const last = q.get('SELECT MAX(number) n FROM game_versions WHERE game_id=?', gameId);
  const id = uid(10); const number = (last && last.n ? last.n : 0) + 1;
  db.transaction(() => {
    q.run('INSERT INTO game_versions(id, game_id, number, html, notes, safety_status, safety_report, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)', id, gameId, number, html, notes, safetyStatus, JSON.stringify(safetyReport), createdBy, now());
    q.run('UPDATE games SET current_version_id=?, updated_at=? WHERE id=?', id, now(), gameId);
  })();
  return getVersion(id);
}
export const listVersions = gameId => q.all('SELECT id, game_id, number, notes, safety_status, created_by, created_at, length(html) AS size FROM game_versions WHERE game_id=? ORDER BY number DESC', gameId);
