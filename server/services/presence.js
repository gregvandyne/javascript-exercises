// Who is playing right now. In-memory, per process (reused from the starter, plus user ids so
// the Friends page can show what friends are playing). A heartbeat every 30s keeps a player "present" for 75s.
const TTL = 75e3;
const rooms = new Map(); // gameId -> Map(key -> { ts, userId })

export function touch(gameId, key, userId = null) {
  let m = rooms.get(gameId); if (!m) { m = new Map(); rooms.set(gameId, m); }
  m.set(key, { ts: Date.now(), userId });
}
export function leave(gameId, key) { const m = rooms.get(gameId); if (m) { m.delete(key); if (!m.size) rooms.delete(gameId); } }
function sweep(m) { const t = Date.now() - TTL; for (const [k, v] of m) if (v.ts < t) m.delete(k); }
export function count(gameId) { const m = rooms.get(gameId); if (!m) return 0; sweep(m); return m.size; }
export function counts(gameIds) { const out = {}; for (const id of gameIds) out[id] = count(id); return out; }
export function top(n = 12) {
  const rows = [];
  for (const [id, m] of rooms) { sweep(m); if (m.size) rows.push([id, m.size]); }
  return rows.sort((a, b) => b[1] - a[1]).slice(0, n);
}
export function totalOnline() {
  const keys = new Set();
  for (const [, m] of rooms) { sweep(m); for (const k of m.keys()) keys.add(k); }
  return keys.size;
}
/** { userId: gameId } for the given users who are playing something right now (most recent heartbeat wins). */
export function playingByUser(userIds) {
  const want = new Set(userIds); const out = {}; const best = {};
  for (const [gameId, m] of rooms) { sweep(m); for (const v of m.values()) if (v.userId && want.has(v.userId) && (!best[v.userId] || v.ts > best[v.userId])) { best[v.userId] = v.ts; out[v.userId] = gameId; } }
  return out;
}
export const _reset = () => rooms.clear();
