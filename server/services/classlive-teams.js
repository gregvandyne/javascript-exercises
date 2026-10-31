// Oomba Live teams (docs/decisions.md "Oomba Live, part 3"; protocol: docs/live-protocol.md `tm`, `pt`, `tms`, `ts`).
// The platform owns teams and team scores, so team mode works with every live game. Pure apart from the saved class
// teams at the end (live_class_teams, live_class_team_cfg).
//
// - A team is one of 8 presets: colour (Okabe-Ito colour-blind-safe set plus a dark indigo), a text colour on it (ink,
//   at least 4.5:1), a shape and an animal icon, and a name translated whole in every language (live.team.preset.<p>).
//   Nobody types a team name. Colour is never the only cue: pages and games draw the shape and the name too.
// - Team numbers k = 1..n (n = 2..6); seat.team is k, or 0 (no team).
// - Banked scoring: every team keeps sum, avg and bonus. Moves keep banked points with the old team. In quiz modes the
//   team a seat counts for is taken when a question opens (teamAt), so a move counts from the next question.
// - The host ranks by the average per player (default: fair for uneven teams) or the total.
import crypto from 'node:crypto';
import { q, tx } from '../db.js';

export const TEAM_MAX = 6, TEAM_MIN = 2;
/** The 8 presets. The single source of truth: pages get it in their JSON data, frames in INIT.live.teamPresets. */
export const PRESETS = [
  { id: 'whales', color: '#0072B2', ink: '#FFFFFF', shape: 'circle', icon: '🐳' },
  { id: 'tigers', color: '#E69F00', ink: '#121528', shape: 'triangle', icon: '🐯' },
  { id: 'frogs', color: '#009E73', ink: '#121528', shape: 'square', icon: '🐸' },
  { id: 'flamingos', color: '#CC79A7', ink: '#121528', shape: 'heart', icon: '🦩' },
  { id: 'bees', color: '#F0E442', ink: '#121528', shape: 'star', icon: '🐝' },
  { id: 'eagles', color: '#56B4E9', ink: '#121528', shape: 'hexagon', icon: '🦅' },
  { id: 'foxes', color: '#D55E00', ink: '#121528', shape: 'diamond', icon: '🦊' },
  { id: 'owls', color: '#3F4A8A', ink: '#FFFFFF', shape: 'moon', icon: '🦉' },
];
export const PRESET_COUNT = PRESETS.length;
/** Presets a new team setup uses, in order (team 1 = Blue Whales ...). */
export const DEFAULT_ORDER = [0, 1, 2, 3, 4, 5];
export const SCORING = ['avg', 'sum'];
/** The presets with their names in one language (t: a translator), for pages and frames. */
export const presetsFor = t => PRESETS.map((p, i) => ({ ...p, name: t(`live.team.preset.${i}`), shapeName: t(`live.team.shape.${p.shape}`) }));

const rand = n => crypto.randomInt(n);
const shuffled = (list, rnd = rand) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const newTeam = k => ({ k, sum: 0, avg: 0, bonus: 0, ever: false });

/** A session's team state (teams off). */
export const initial = () => ({ on: false, n: 2, presets: DEFAULT_ORDER.slice(0, 2), scoring: 'avg', choose: false, locked: false, list: [], plan: null, byUser: new Map() });
const T = s => s.teams || (s.teams = initial());
export const isOn = s => !!(s.teams && s.teams.on);
const team = (s, k) => T(s).list[k - 1] || null;
/** The seats that count as on a team now: still in the session (seated). */
const seats = s => [...s.seats.values()];
/** Present: connected, or joined and not yet connected for the first time (a device on its way). */
const present = seat => !!seat.conn || !seat.everConnected;
export const members = (s, k) => seats(s).filter(seat => seat.team === k);
export const size = (s, k) => members(s, k).length;
const connectedCount = (s, k) => members(s, k).filter(present).length;

/** Put a seat on team k (0 = none). Signed-in seats are remembered for a rejoin. */
export function assign(s, seat, k) {
  const ts = T(s);
  seat.team = k;
  if (k) { const t = team(s, k); if (t) t.ever = true; }
  if (seat.userId) { if (k) ts.byUser.set(seat.userId, k); else ts.byUser.delete(seat.userId); }
}

/** The team a new or returning seat goes to: its own team (a signed-in rejoin) -> the plan (saved class teams or a
 *  rematch) -> the smallest team by present members (teams with nobody first); ties: the lower banked score of the
 *  ranking kind, then random. */
export function pickFor(s, seat, rnd = rand) {
  const ts = T(s);
  if (!ts.on) return 0;
  const valid = k => Number.isInteger(k) && k >= 1 && k <= ts.n;
  if (seat.userId && valid(ts.byUser.get(seat.userId))) return ts.byUser.get(seat.userId);
  if (seat.userId && ts.plan && valid(ts.plan.get(seat.userId))) return ts.plan.get(seat.userId);
  return smallest(s, rnd, seat);
}
function smallest(s, rnd = rand, except = null) {
  const ts = T(s);
  const rows = ts.list.map(t => {
    const m = members(s, t.k).filter(x => x !== except);
    return { k: t.k, empty: m.length ? 1 : 0, n: m.filter(present).length, all: m.length, score: Math.round(ts.scoring === 'sum' ? t.sum : t.avg), r: rnd(1e6) };
  });
  rows.sort((a, b) => (a.empty - b.empty) || (a.n - b.n) || (a.all - b.all) || (a.score - b.score) || (a.r - b.r));
  return rows.length ? rows[0].k : 0;
}
/** Place a seat (join, rejoin, late join, start). -> its team. */
export function place(s, seat, rnd = rand) {
  if (!isOn(s)) return 0;
  const k = pickFor(s, seat, rnd);
  assign(s, seat, k);
  return k;
}

/** Turn teams on with n teams (default: 2 for up to 12 seats, else 4) and balance everyone at once (random). */
export function setup(s, n = null, rnd = rand) {
  const ts = T(s);
  const count = Number.isInteger(n) && n >= TEAM_MIN && n <= TEAM_MAX ? n : (s.seats.size <= 12 ? 2 : 4);
  ts.on = true; ts.n = count; ts.presets = DEFAULT_ORDER.slice(0, count);
  ts.list = Array.from({ length: count }, (_, i) => newTeam(i + 1));
  ts.choose = false; ts.locked = false;
  for (const seat of seats(s)) seat.team = 0;
  ts.byUser = new Map();
  balance(s, rnd);
  return true;
}
/** Use a plan (saved class teams): its setup, then everyone seated is placed by it (planned seats first); anyone not in
 *  it goes to the smallest team. Not evened out: the host sees uneven() and may Balance. */
export function usePlan(s, cfg, plan, rnd = rand) {
  if (!fromSetup(s, cfg, plan)) return false;
  const ts = T(s);
  ts.byUser = new Map(); ts.choose = false; ts.locked = false;
  for (const seat of seats(s)) seat.team = 0;
  const all = shuffled(seats(s), rnd);
  for (const seat of all.filter(x => x.userId && ts.plan && ts.plan.has(x.userId))) place(s, seat, rnd);
  for (const seat of all.filter(x => !x.team)) place(s, seat, rnd);
  return true;
}
/** Teams off: every seat on 0, nothing remembered. */
export function off(s) {
  const ts = T(s);
  ts.on = false; ts.list = []; ts.plan = null; ts.byUser = new Map(); ts.choose = false; ts.locked = false;
  for (const seat of seats(s)) seat.team = 0;
  return true;
}
/** A new team count: seats of removed teams go to the smallest remaining teams; new teams get the next unused presets;
 *  then the teams are balanced (fewest moves). */
export function setCount(s, n, rnd = rand) {
  const ts = T(s);
  if (!ts.on || !Number.isInteger(n) || n < TEAM_MIN || n > TEAM_MAX || n === ts.n) return false;
  if (n < ts.n) {
    ts.list = ts.list.slice(0, n); ts.presets = ts.presets.slice(0, n); ts.n = n;
    for (const seat of seats(s)) if (seat.team > n) assign(s, seat, 0);
    for (const [u, k] of ts.byUser) if (k > n) ts.byUser.delete(u);
  } else {
    for (let k = ts.n + 1; k <= n; k++) {
      ts.list.push(newTeam(k));
      ts.presets.push([...DEFAULT_ORDER, 6, 7].find(p => !ts.presets.includes(p)));
    }
    ts.n = n;
  }
  balance(s, rnd);
  return true;
}
/** Team k takes preset p; a team that had p takes k's old one (all different). */
export function setPreset(s, k, p) {
  const ts = T(s);
  if (!ts.on || !Number.isInteger(k) || k < 1 || k > ts.n || !Number.isInteger(p) || p < 0 || p >= PRESET_COUNT) return false;
  const old = ts.presets[k - 1];
  if (old === p) return false;
  const other = ts.presets.indexOf(p);
  if (other >= 0) ts.presets[other] = old;
  ts.presets[k - 1] = p;
  return true;
}
export function setScoring(s, v) {
  const ts = T(s);
  if (!ts.on || !SCORING.includes(v) || ts.scoring === v) return false;
  ts.scoring = v;
  return true;
}

/** Balance with the fewest moves: seats with no team go to the smallest team first, then players move from the
 *  largest teams (most recently joined first) until sizes differ by at most one. -> how many seats changed team. */
export function balance(s, rnd = rand) {
  const ts = T(s);
  if (!ts.on) return 0;
  let moved = 0;
  for (const seat of shuffled(seats(s).filter(x => !x.team || x.team > ts.n), rnd)) { assign(s, seat, smallest(s, rnd, seat)); moved++; }
  for (let guard = 0; guard < 2000; guard++) {
    const sizes = ts.list.map(t => ({ k: t.k, n: size(s, t.k) }));
    sizes.sort((a, b) => a.n - b.n);
    const lo = sizes[0], hi = sizes[sizes.length - 1];
    if (!lo || hi.n - lo.n <= 1) break;
    const from = members(s, hi.k).sort((a, b) => b.no - a.no)[0];
    assign(s, from, lo.k); moved++;
  }
  return moved;
}
/** Random equal sizes (a crypto shuffle; the team that gets the odd ones out is random too). */
export function shuffle(s, rnd = rand) {
  const ts = T(s);
  if (!ts.on) return false;
  const order = shuffled(ts.list.map(t => t.k), rnd);
  shuffled(seats(s), rnd).forEach((seat, i) => assign(s, seat, order[i % order.length]));
  return true;
}
/** The host moves a seat to team k (0: no team, lobby only; the caller checks the phase). */
export function move(s, seat, k) {
  const ts = T(s);
  if (!ts.on || !seat || !Number.isInteger(k) || k < 0 || k > ts.n || seat.team === k) return false;
  assign(s, seat, k);
  return true;
}
/** The most a team may have when players choose: ceil(players / n) + 1 (a player's own seat not counted twice). */
export const chooseCap = s => Math.ceil(s.seats.size / T(s).n) + 1;
/** A player picks team k (lobby only, players may choose, teams not locked, the team not full). -> true when moved. */
export function choose(s, seat, k) {
  const ts = T(s);
  if (!ts.on || !ts.choose || ts.locked || s.phase !== 'lobby' || !Number.isInteger(k) || k < 1 || k > ts.n || seat.team === k) return false;
  if (size(s, k) >= chooseCap(s)) return false;
  assign(s, seat, k);
  return true;
}

// ---------------------------------------------------------------- scores
/** The team each seat counts for this question (taken when it opens). */
export const snapshot = s => new Map(isOn(s) ? seats(s).filter(x => x.team).map(x => [x.no, x.team]) : []);
/**
 * A quiz reveal: pointsBySeat Map(seat -> points this question). Every point goes to the team the seat had when the
 * question opened. avg += (points of that team's seats) / participants, where participants are the team's seats at the
 * open that answered or are connected now (at least 1).
 */
export function bankQuiz(s, teamAt, pointsBySeat, answered = new Set()) {
  if (!isOn(s) || !teamAt) return;
  const per = new Map();
  for (const [no, k] of teamAt) {
    const t = team(s, k); if (!t) continue;
    const row = per.get(k) || { pts: 0, n: 0 };
    const seat = s.seats.get(no) || (s.gone || []).find(x => x.no === no);
    if (answered.has(no) || (seat && seat.conn)) row.n++;
    row.pts += pointsBySeat.get(no) || 0;
    per.set(k, row);
  }
  for (const [k, row] of per) { const t = team(s, k); t.sum += row.pts; t.avg += row.pts / Math.max(1, row.n); }
}
/** A game-reported score rise for a seat: to its team now. avg += rise / connected members (at least 1). */
export function bankRise(s, seat, rise) {
  if (!isOn(s) || !seat.team || !(rise > 0)) return;
  const t = team(s, seat.team); if (!t) return;
  t.sum += rise; t.avg += rise / Math.max(1, connectedCount(s, seat.team));
}
/** A game-reported score change for a seat (seat.score already set): the team totals follow the seat's score, never
 *  more. A rise above what the seat already has counted is banked to its team now; a drop takes back what this seat
 *  banked to its current team (sum and the same share of avg). Points banked to a team the seat has left stay there,
 *  and only a score above everything still counted is banked again, so nothing is ever counted twice.
 *  seat.banked: the seat's points counted in team totals; seat.tb: Map(k -> { sum, avg }) of them per team. */
export function bankScore(s, seat) {
  if (!isOn(s) || !seat.team) return;
  const t = team(s, seat.team); if (!t) return;
  const banked = seat.banked || 0, tb = seat.tb || (seat.tb = new Map());
  const mine = tb.get(seat.team) || { sum: 0, avg: 0 };
  if (seat.score > banked) {
    const rise = seat.score - banked, avg = rise / Math.max(1, connectedCount(s, seat.team));
    t.sum += rise; t.avg += avg; mine.sum += rise; mine.avg += avg;
    seat.banked = seat.score;
  } else if (seat.score < banked && mine.sum > 0) {
    const back = Math.min(banked - seat.score, mine.sum), share = back / mine.sum, avg = mine.avg * share;
    t.sum = Math.max(0, t.sum - back); t.avg = Math.max(0, t.avg - avg); mine.sum -= back; mine.avg -= avg;
    seat.banked = banked - back;
  }
  tb.set(seat.team, mine);
}
export const BONUS_POINTS = 100;
/** A bonus to a seat: banked to its team like a score rise (the seat's own bonus is kept apart from its score). */
export function bonusSeat(s, seat) {
  seat.bonus = (seat.bonus || 0) + BONUS_POINTS;
  bankRise(s, seat, BONUS_POINTS);
}
/** A bonus to team k: its bonus, sum and average all get the points. */
export function bonusTeam(s, k) {
  const t = isOn(s) && team(s, k);
  if (!t) return false;
  t.bonus += BONUS_POINTS; t.sum += BONUS_POINTS; t.avg += BONUS_POINTS;
  return true;
}

/** Teams in rank order of the ranking kind: [{ k, p, score, sum, avg, bonus, size, rank, ever }]. A team with no
 *  members is unranked (rank 0), and so is every team while nothing can be ranked yet (the lobby before any points).
 *  Ties share a rank. */
export function ranked(s) {
  const ts = T(s);
  if (!ts.on) return [];
  const rows = ts.list.map(t => ({ k: t.k, p: ts.presets[t.k - 1], sum: Math.round(t.sum), avg: Math.round(t.avg), bonus: t.bonus, size: size(s, t.k), ever: t.ever || size(s, t.k) > 0 }));
  for (const r of rows) r.score = ts.scoring === 'sum' ? r.sum : r.avg;
  const live = rows.filter(r => r.size > 0).sort((a, b) => (b.score - a.score) || (a.k - b.k));
  let rank = 0, prev = null;
  // nothing to rank yet (the lobby, nobody has scored): every rank 0, shown as '–' rather than a row of 1s
  const scored = rows.some(r => r.sum || r.bonus);
  const ranking = scored || (s.phase && s.phase !== 'lobby');
  live.forEach((r, i) => { if (r.score !== prev) { rank = i + 1; prev = r.score; } r.rank = ranking ? rank : 0; });
  for (const r of rows) if (!r.size) r.rank = 0;
  return rows.sort((a, b) => ((a.rank || 99) - (b.rank || 99)) || (a.k - b.k));
}

/** tms: the whole setup and membership (one message for a shuffle of 30). */
export function tmsMsg(s) {
  const ts = T(s);
  return {
    t: 'tms', on: ts.on, n: ts.on ? ts.n : 0, teams: ts.on ? ts.list.map(t => [t.k, ts.presets[t.k - 1], size(s, t.k)]) : [],
    m: ts.on ? seats(s).filter(x => x.team).map(x => [x.no, x.team]) : [], scoring: ts.scoring, choose: ts.choose, locked: ts.locked,
  };
}
/** ts: team scores [[k, score, rank, sum, avg]] by team number. ranks: false -> every rank 0 (leaderboard off). */
export function tsMsg(s, { ranks = true, fin = false } = {}) {
  const rows = ranked(s).sort((a, b) => a.k - b.k).map(r => [r.k, r.score, ranks ? r.rank : 0, r.sum, r.avg]);
  return { t: 'ts', s: rows, ...(fin ? { fin: 1 } : {}) };
}
/** The setup to carry into another session (play again, remembered defaults). */
export const setupOf = s => (isOn(s) ? { n: T(s).n, presets: [...T(s).presets], scoring: T(s).scoring } : null);
/** Start a session's teams from a carried setup (n, presets, scoring) and an optional plan (Map userId -> k). */
export function fromSetup(s, cfg, plan = null) {
  if (!cfg) return false;
  const ts = T(s);
  const n = Number.isInteger(cfg.n) && cfg.n >= TEAM_MIN && cfg.n <= TEAM_MAX ? cfg.n : 2;
  ts.on = true; ts.n = n;
  const p = Array.isArray(cfg.presets) ? cfg.presets.filter(x => Number.isInteger(x) && x >= 0 && x < PRESET_COUNT) : [];
  ts.presets = [...new Set(p)].slice(0, n);
  for (const x of [...DEFAULT_ORDER, 6, 7]) if (ts.presets.length < n && !ts.presets.includes(x)) ts.presets.push(x);
  ts.scoring = SCORING.includes(cfg.scoring) ? cfg.scoring : 'avg';
  ts.list = Array.from({ length: n }, (_, i) => newTeam(i + 1));
  ts.plan = plan && plan.size ? plan : null;
  return true;
}
/** Uneven after a plan: sizes differ by more than one. -> the sizes, or null. */
export function uneven(s) {
  if (!isOn(s)) return null;
  const sizes = T(s).list.map(t => size(s, t.k));
  return Math.max(...sizes) - Math.min(...sizes) > 1 ? sizes : null;
}

// ---------------------------------------------------------------- saved class teams (inside the school)
/** A class's saved teams: { cfg: { n, presets, scoring }, plan: Map(userId -> k) } with active students only, or null. */
export function loadClassTeams(classId) {
  const cfg = q.get('SELECT * FROM live_class_team_cfg WHERE class_id=?', String(classId || ''));
  if (!cfg) return null;
  let presets = []; try { presets = JSON.parse(cfg.presets); } catch { /* none */ }
  const rows = q.all(`SELECT t.user_id, t.team FROM live_class_teams t JOIN class_members m ON m.class_id=t.class_id AND m.user_id=t.user_id
    WHERE t.class_id=? AND m.status='active' AND m.role='student'`, cfg.class_id);
  return { cfg: { n: cfg.n, presets, scoring: cfg.scoring }, plan: new Map(rows.filter(r => r.team >= 1 && r.team <= cfg.n).map(r => [r.user_id, r.team])), savedAt: cfg.saved_at };
}
/** Save a class's teams (the class teams editor, or the end of a class run): replaces the old ones. plan: Map or
 *  [[userId, k]]; only active students of the class are kept. merge: keep saved students who are not in plan. */
export function saveClassPlan(classId, cfg, plan, by = null, { merge = false } = {}) {
  const n = Number.isInteger(cfg.n) && cfg.n >= TEAM_MIN && cfg.n <= TEAM_MAX ? cfg.n : null;
  if (!n) return false;
  const presets = [...new Set((cfg.presets || []).filter(x => Number.isInteger(x) && x >= 0 && x < PRESET_COUNT))].slice(0, n);
  for (const x of [...DEFAULT_ORDER, 6, 7]) if (presets.length < n && !presets.includes(x)) presets.push(x);
  const students = new Set(q.all("SELECT user_id FROM class_members WHERE class_id=? AND status='active' AND role='student'", classId).map(r => r.user_id));
  tx(() => {
    // merge (the end of a run): students who did not play keep their saved team
    if (merge) q.run('DELETE FROM live_class_teams WHERE class_id=? AND team>?', classId, n);
    else q.run('DELETE FROM live_class_teams WHERE class_id=?', classId);
    for (const [userId, k] of plan) if (students.has(userId) && Number.isInteger(k) && k >= 1 && k <= n) q.run('INSERT OR REPLACE INTO live_class_teams(class_id, user_id, team) VALUES (?,?,?)', classId, userId, k);
    q.run(`INSERT INTO live_class_team_cfg(class_id, n, presets, scoring, saved_by, saved_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(class_id) DO UPDATE SET n=excluded.n, presets=excluded.presets, scoring=excluded.scoring, saved_by=excluded.saved_by, saved_at=excluded.saved_at`,
    classId, n, JSON.stringify(presets), SCORING.includes(cfg.scoring) ? cfg.scoring : 'avg', by, Date.now());
  });
  return true;
}
/** The end of a class run with teams on: the students who played keep the team they ended on; students who did not
 *  play keep their saved team (a small-group run never wipes the whole class's teams). A run with a different team
 *  count replaces the saved teams only when it had at least as many students as the saved teams; otherwise the saved
 *  teams are left alone. */
export function saveClassTeams(s) {
  if (!isOn(s) || s.audience !== 'class' || !s.classId) return false;
  const plan = new Map();
  for (const seat of [...(s.gone || []), ...seats(s)]) if (seat.userId && seat.team) plan.set(seat.userId, seat.team);
  if (!plan.size) return false;
  const cfg = setupOf(s), had = loadClassTeams(s.classId);
  if (had && had.cfg.n !== cfg.n && had.plan.size > plan.size) return false;
  return saveClassPlan(s.classId, cfg, plan, s.host.userId, { merge: !!had && had.cfg.n === cfg.n });
}
export function forgetClassTeams(classId) {
  tx(() => { q.run('DELETE FROM live_class_teams WHERE class_id=?', classId); q.run('DELETE FROM live_class_team_cfg WHERE class_id=?', classId); });
  return true;
}
