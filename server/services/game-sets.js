// Question sets an official game keeps for a teacher (Algebra Builder's; docs/sdk.md "Question sets", docs/decisions.md
// "Algebra Builder"). A teacher builds a list of up to 10 questions in the game and saves it; the game's link carries
// only the set's short code (?chapter=s-<10 letters and digits>&lock=1), so the link, its QR code and a lesson step stay
// short, and the teacher can change the set later under the same link. The frame hands the set to the game
// (BRB.questionSet) when a link opens it. A question is only an activity, a short math problem in a fixed alphabet and
// two settings: no free text, no names, nothing about who plays. Sets go with their owner's account.
import crypto from 'node:crypto';
import { q, now } from '../db.js';

/** Official games that may keep question sets (slugs). */
export const SET_GAMES = new Set(['algebra-builder']);
export const MAX_ITEMS = 10;
/** How many sets one account may keep in one game. */
export const MAX_PER_OWNER = 200;
/** A set's code, as it rides in the lesson parameter chapter. */
export const SET_ID = /^s-[a-z0-9]{10}$/;
const ACTIVITIES = ['solve', 'multiply', 'factor'];
/** A problem as typed: digits, x, + − = ^ ( ) and spaces (the minus sign as - or −), at most 40 characters. */
const PROBLEM = /^[0-9x+\-−=^() ]{1,40}$/;

/** The clean list of questions, or null when it isn't one: [{ a: activity, p: problem, s: 'all'|'none', l: bool }]. */
export function cleanItems(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_ITEMS) return null;
  const out = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') return null;
    const a = String(it.a || ''), p = typeof it.p === 'string' ? it.p.trim().toLowerCase() : '';
    if (!ACTIVITIES.includes(a) || !PROBLEM.test(p) || !/[0-9x]/.test(p)) return null;
    out.push({ a, p, s: it.s === 'none' ? 'none' : 'all', l: it.l !== false });
  }
  return out;
}

const newId = () => {
  const L = 'abcdefghijklmnopqrstuvwxyz0123456789', b = crypto.randomBytes(10);
  return 's-' + [...b].map(x => L[x % L.length]).join('');
};

/** A set of this game: { id, items, ownerId } or null. */
export function get(gameId, id) {
  if (!SET_ID.test(String(id || ''))) return null;
  const r = q.get('SELECT id, owner_id, items FROM game_sets WHERE id=? AND game_id=?', id, gameId);
  if (!r) return null;
  try { return { id: r.id, ownerId: r.owner_id, items: JSON.parse(r.items) }; } catch { return null; }
}

/** Save a set: a new one, or (id given) the owner's own one changed. -> { id } | { error: 'bad'|'notYours'|'full' } */
export function save(gameId, ownerId, rawItems, id = null) {
  const items = cleanItems(rawItems);
  if (!items) return { error: 'bad' };
  const t = now();
  if (id) {
    const was = get(gameId, id);
    if (!was || was.ownerId !== ownerId) return { error: 'notYours' };
    q.run('UPDATE game_sets SET items=?, updated_at=? WHERE id=?', JSON.stringify(items), t, id);
    return { id };
  }
  if (q.get('SELECT COUNT(*) n FROM game_sets WHERE game_id=? AND owner_id=?', gameId, ownerId).n >= MAX_PER_OWNER) return { error: 'full' };
  let nid = newId();
  while (q.get('SELECT 1 FROM game_sets WHERE id=?', nid)) nid = newId();
  q.run('INSERT INTO game_sets(id, game_id, owner_id, items, created_at, updated_at) VALUES (?,?,?,?,?,?)', nid, gameId, ownerId, JSON.stringify(items), t, t);
  return { id: nid };
}

/** An account's sets go with it. */
export function forgetUser(userId) { q.run('DELETE FROM game_sets WHERE owner_id=?', userId); }
