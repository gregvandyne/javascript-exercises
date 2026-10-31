// Oomba Live game settings (docs/decisions.md "Oomba Live, part 3"; protocol `cf`, `opt`). They extend the session's
// existing s.settings ({ maxPlayers, locked, autoLock }): "late join" is stored as the existing autoLock (late ===
// !autoLock), so lock, unlock, the player cap and the automatic lock at start keep one source of truth. Pure apart from
// the host's remembered defaults (live_prefs).
import { q } from '../db.js';

/** Every key, its values and when it may change ('lobby': before start only). */
export const KEYS = {
  secs: { values: [0, 10, 20, 30, 60], lobby: true },        // 0 = each question's own time
  count: { values: [0, 5, 10, 15, 20, 30], lobby: true },    // 0 = all
  shuffleQ: { bool: true, lobby: true },
  shuffleA: { bool: true, lobby: true },
  points: { values: ['speed', 'accuracy'], lobby: true },
  board: { values: ['all', 'top5', 'off'] },
  late: { bool: true },
  names: { values: ['names', 'nicknames', 'hidden'] },
  sound: { bool: true },
  emotes: { bool: true },
};
/** Settings that only quiz runs use (hidden for game-mode sessions). */
export const QUIZ_ONLY = ['secs', 'count', 'shuffleQ', 'shuffleA', 'points'];
/** What players' pages are told (opt): nothing else about the room's settings reaches a player. */
export const PUBLIC = ['board', 'emotes', 'names'];

/** The defaults for a room. nameMode: 'accounts' (a teacher's own class) or 'nicknames'. */
export function DEFAULTS(audience = 'open', nameMode = 'nicknames') {
  return {
    secs: 0, count: 0, shuffleQ: false, shuffleA: true, points: 'speed',
    board: audience === 'open' ? 'top5' : 'all', late: audience !== 'open',
    names: nameMode === 'accounts' ? 'names' : 'nicknames', sound: true, emotes: true,
  };
}

/**
 * A settings patch from the host (cf), a landing form or remembered defaults. Unknown keys and bad values are dropped;
 * lobby-only keys are dropped after start (lobby: false); 'names' is only for a room that shows account names.
 * Form values ('1', 'on', '20') are read too. -> the clean subset (may be {}).
 */
export function clean(d, { lobby = true, nameMode = 'nicknames' } = {}) {
  const out = {};
  if (!d || typeof d !== 'object' || Array.isArray(d)) return out;
  for (const [k, spec] of Object.entries(KEYS)) {
    if (!(k in d)) continue;
    if (spec.lobby && !lobby) continue;
    let v = d[k];
    if (Array.isArray(v)) v = v[v.length - 1];   // a form's hidden "0" before its checkbox "1": the last one counts
    if (spec.bool) {
      if (v === '1' || v === 'on' || v === 'true' || v === 1) v = true;
      else if (v === '0' || v === 'off' || v === 'false' || v === 0 || v === '') v = false;
      if (typeof v !== 'boolean') continue;
    } else {
      if (typeof spec.values[0] === 'number' && typeof v === 'string' && /^\d{1,3}$/.test(v)) v = Number(v);
      if (!spec.values.includes(v)) continue;
    }
    if (k === 'names' && v === 'names' && nameMode !== 'accounts') continue;
    out[k] = v;
  }
  return out;
}

/** The settings as the host sees them (s.settings with late). */
export const view = st => ({ secs: st.secs, count: st.count, shuffleQ: st.shuffleQ, shuffleA: st.shuffleA, points: st.points, board: st.board, late: !st.autoLock, names: st.names, sound: st.sound, emotes: st.emotes, maxPlayers: st.maxPlayers, locked: st.locked });
/** What players get (opt). */
export const publicPart = st => ({ board: st.board, emotes: st.emotes, names: st.names });

/**
 * Apply a clean patch to s.settings. late maps to autoLock: before start it only says whether start locks the room;
 * after start, turning late join off locks the room now and on unlocks it. -> { changed: [keys], lock: bool|null }
 * (lock: the new locked state when it changed).
 */
export function apply(s, d) {
  const st = s.settings, changed = [];
  let lock = null;
  for (const [k, v] of Object.entries(d)) {
    if (k === 'late') {
      if (!st.autoLock === v) continue;
      st.autoLock = !v; changed.push(k);
      if (s.phase !== 'lobby') {
        const want = !v;
        if (st.locked !== want) { st.locked = want; lock = want; }
      }
      continue;
    }
    if (st[k] === v) continue;
    st[k] = v; changed.push(k);
  }
  return { changed, lock };
}
/** A new session's s.settings: the room's defaults, then the host's choices (a landing form, play again). */
export function initial(base, audience, nameMode, chosen = null) {
  const d = { ...DEFAULTS(audience, nameMode), ...clean(chosen || {}, { lobby: true, nameMode }) };
  const st = { ...base };
  for (const k of Object.keys(KEYS)) if (k !== 'late') st[k] = d[k];
  st.autoLock = !d.late;
  return st;
}

// ---------------------------------------------------------------- remembered defaults (live_prefs)
/** The host's remembered defaults: { settings, teams: { on, n, scoring } } or null. */
export function loadPrefs(userId) {
  const r = q.get('SELECT prefs FROM live_prefs WHERE user_id=?', String(userId || ''));
  if (!r) return null;
  try {
    const p = JSON.parse(r.prefs);
    const settings = clean(p.settings || {}, { lobby: true, nameMode: 'accounts' });
    const t = p.teams || {};
    const teams = { on: !!t.on, n: Number.isInteger(t.n) && t.n >= 2 && t.n <= 6 ? t.n : 2, scoring: t.scoring === 'sum' ? 'sum' : 'avg' };
    return { settings, teams };
  } catch { return null; }
}
/** Save what the host started with (at start). */
export function savePrefs(userId, { settings, teams }) {
  const p = { settings: clean(settings || {}, { lobby: true, nameMode: 'accounts' }), teams: teams ? { on: !!teams.on, n: teams.n, scoring: teams.scoring } : { on: false } };
  q.run('INSERT INTO live_prefs(user_id, prefs, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET prefs=excluded.prefs, updated_at=excluded.updated_at', userId, JSON.stringify(p), Date.now());
  return p;
}
/** "Back to standard settings". */
export const resetPrefs = userId => q.run('DELETE FROM live_prefs WHERE user_id=?', userId).changes > 0;
