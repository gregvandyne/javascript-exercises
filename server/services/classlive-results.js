// Oomba Live results (docs/decisions.md "Oomba Live", docs/safety.md §12). At the end of a session the host sees every
// player's result from memory for 10 minutes. What is saved is small and has no guest in it:
// - live_runs: counts and the host-written question texts (accuracy per question). No code, nickname, name or nonce.
// - live_run_scores: one row per active student of the run's class, only in a class room hosted by one of the class's
//   teachers; a linked lesson game step also gets the score in the gradebook (progress.gameScore, best kept).
// Nothing else is written. Guests and signed-in players outside a class run exist only in the summary in memory.
// Part 3: the run's teams (preset numbers and scores, never names) and settings; a class student's team, bonus points
// (outside the gradebook score) and per-question marks; the questions as asked (host-written text, choices, the
// answer and the counts) for the question review and "play the missed questions again"; CSV for every run.
import { q, tx, uid } from '../db.js';
import * as T from './classlive-teams.js';
import { needsHelp } from './classlive-dash.js';
import { getUser } from '../auth.js';
import * as S from './schools.js';
import * as progress from './progress.js';
import { rankSeats } from './classlive-quiz.js';
import { register } from './jobs.js';

const DAY = 86400e3;
export const KEEP = { classless: 90 * DAY, reports: 365 * DAY };
export const REPORT_REASONS = ['scary', 'mean', 'personal', 'other'];

/** Seats in rank order (players still seated). */
export const ranked = s => rankSeats(s);

/**
 * The results in memory: players { seat, name (as shown in the session: a nickname index or, in a class room, the
 * account name), avatar, score, correct, answered, rank, progress?, scoredBy, left?, kind } and items
 * { i, q?, right, answered, topWrong? }.
 */
/** How many questions (or game items) the marks cover: the questions asked, or the items the game reported. */
export function markCount(s) {
  if (s.quiz) return s.qz ? Math.min(200, s.qz.i + 1) : 0;
  let n = 0; for (const i of s.itemStats.keys()) n = Math.max(n, i + 1);
  return Math.min(200, n);
}
/** One character per question: '1' right, '0' wrong, '-' none. */
export const marksOf = (seat, n) => Array.from({ length: n }, (_, i) => (seat.items.has(i) ? (seat.items.get(i) ? '1' : '0') : '-')).join('');

export function summary(s) {
  const seats = [...s.seats.values(), ...(s.gone || [])];
  const race = s.race;
  const n = markCount(s);
  const rows = seats.map(seat => ({
    seat: seat.no, name: s.nameMode === 'accounts' && seat.name ? seat.name : seat.nick, avatar: seat.avatar, kind: seat.kind,
    score: seat.score, bonus: seat.bonus || 0, total: seat.score + (seat.bonus || 0), team: seat.team || 0, marks: marksOf(seat, n),
    correct: seat.correct, answered: seat.answered, scoredBy: seat.scoredBy, help: needsHelp({ ...seat, conn: null }, { quiz: !!s.quiz }),
    ...(race ? { progress: Math.min(1000, Math.round((race.get(seat.no) || { prog: 0 }).prog)), gems: (race.get(seat.no) || { gems: 0 }).gems } : {}),
    ...(s.seats.has(seat.no) ? {} : { left: true }),
  }));
  // The leaderboard's order: progress (Quest Race), then score + bonus.
  rows.sort((a, b) => ((b.progress || 0) - (a.progress || 0)) || (b.total - a.total) || (a.seat - b.seat));
  let rank = 0, prev = null;
  rows.forEach((r, i) => { const k = `${r.progress || 0}:${r.total}`; if (k !== prev) { rank = i + 1; prev = k; } r.rank = rank; });
  const items = [...s.itemStats].sort((a, b) => a[0] - b[0]).map(([i, st]) => ({
    i, ...(st.q ? { q: st.q } : {}), right: st.right, answered: st.answered, ...(st.topWrong ? { topWrong: st.topWrong } : {}),
    ...(st.choices ? { choices: st.choices, answer: st.answer, secs: st.secs, counts: st.counts } : {}),
  }));
  // Teams that ever had a member (E11), in rank order; preset numbers only (each page names them in its language).
  const teams = T.isOn(s) ? T.ranked(s).filter(r => r.ever).map(r => ({ k: r.k, p: r.p, score: r.score, sum: r.sum, avg: r.avg, bonus: r.bonus, size: r.size || seats.filter(x => x.team === r.k).length, rank: r.rank })) : [];
  const out = {
    id: s.id, title: s.title, mode: s.mode, audience: s.audience, nameMode: s.nameMode, startedAt: s.startedAt, endedAt: s.endedAt,
    scoredBy: s.quiz ? 'server' : 'game', players: rows, items, teams, scoring: T.isOn(s) ? s.teams.scoring : null,
    settings: settingsOf(s), guests: seats.filter(x => x.kind === 'guest').length,
  };
  // Which account sat in which seat: for save() only, never sent anywhere (not enumerable, so not in any JSON).
  Object.defineProperty(out, 'userOf', { value: new Map(seats.filter(x => x.userId).map(x => [x.no, x.userId])), enumerable: false });
  return out;
}

/** The run's settings worth keeping (no maxPlayers or lock state). */
const settingsOf = s => {
  const st = s.settings || {};
  return { secs: st.secs, count: st.count, shuffleQ: st.shuffleQ, shuffleA: st.shuffleA, points: st.points, board: st.board, late: !st.autoLock, names: st.names, sound: st.sound, emotes: st.emotes };
};
/** A saved item: the host-written text and choices, the answer, the time and the counts (never anything a player sent). */
const itemRow = it => ({ ...(it.q ? { q: it.q } : { i: it.i }), right: it.right, answered: it.answered, ...(it.topWrong ? { top_wrong: it.topWrong } : {}),
  ...(it.choices ? { choices: it.choices, answer: it.answer, secs: it.secs, counts: it.counts } : {}) });

/** Save an ended session (one transaction). Class runs: scores for the class's active students. */
export function save(s, sum = summary(s)) {
  const id = s.id;
  const host = getUser(s.host.userId);
  const classRun = s.audience === 'class' && s.classId && host && S.teaches(host, s.classId);
  tx(() => {
    q.run(`INSERT OR REPLACE INTO live_runs(id, host_id, class_id, class_lesson_id, step_id, audience, mode, game_id, version_id, set_id, title,
      started_at, ended_at, players, guests, items, scored_by, teams, settings) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, s.host.userId, classRun ? s.classId : null, classRun ? s.clId : null, classRun ? s.stepId : null, s.audience, s.mode,
    s.gameId, s.versionId, s.setId, s.title, s.startedAt || s.createdAt, s.endedAt || Date.now(), sum.players.length, sum.guests,
    // The question texts the host wrote (or a starter set's): never anything a player sent.
    JSON.stringify(sum.items.map(itemRow)),
    sum.scoredBy,
    // n and presets: the whole setup (a team nobody played on is not in list), so "Play again with these teams" rebuilds it
    sum.teams.length ? JSON.stringify({ scoring: sum.scoring, ...(T.setupOf(s) ? { n: T.setupOf(s).n, presets: T.setupOf(s).presets } : {}), list: sum.teams.map(t => ({ k: t.k, p: t.p, sum: t.sum, avg: t.avg, bonus: t.bonus, rank: t.rank, size: t.size })) }) : '',
    JSON.stringify(sum.settings));
    if (!classRun) return;
    // Rank order: a student who somehow held two seats (rows are best first) keeps the better one.
    const done = new Set();
    for (const p of sum.players) {
      const userId = sum.userOf.get(p.seat);
      if (!userId || done.has(userId)) continue;
      done.add(userId);
      const m = S.classMember(s.classId, userId);
      if (!m || m.role !== 'student') continue;
      q.run('INSERT OR REPLACE INTO live_run_scores(run_id, user_id, score, rank, correct, answered, team, bonus, marks) VALUES (?,?,?,?,?,?,?,?,?)', id, userId, p.score, p.rank, p.correct, p.answered, p.team || 0, p.bonus || 0, p.marks || '');
      if (s.clId && s.stepId) { const u = getUser(userId); if (u) progress.gameScore(u, s.clId, s.stepId, p.score, 'live'); }
    }
  });
}

/** A persisted run, for its host or a teacher of its class. -> { run, items, scores } | null */
export function persisted(u, runId) {
  const run = q.get('SELECT * FROM live_runs WHERE id=?', String(runId || ''));
  if (!run || !u) return null;
  const mayView = run.host_id === u.id || (run.class_id && S.teaches(u, run.class_id)) || S.isPlatformAdmin(u);
  if (!mayView) return null;
  let items = [], teams = null, settings = null;
  try { items = JSON.parse(run.items); } catch { /* none */ }
  try { teams = run.teams ? JSON.parse(run.teams) : null; } catch { /* none */ }
  try { settings = run.settings ? JSON.parse(run.settings) : null; } catch { /* none */ }
  const scores = run.class_id ? q.all(`SELECT r.user_id, r.score, r.rank, r.correct, r.answered, r.team, r.bonus, r.marks, u.display_name, u.username FROM live_run_scores r
    JOIN users u ON u.id=r.user_id WHERE r.run_id=? ORDER BY r.rank, u.display_name COLLATE NOCASE`, run.id) : [];
  return { run, items, scores, teams, settings };
}

/** Questions as asked, from a saved item or a summary item: { q, choices, answer, secs } or null (older runs kept no
 *  choices). */
export const asItem = it => (it && it.q && Array.isArray(it.choices) && Number.isInteger(it.answer) ? { q: it.q, choices: it.choices, answer: it.answer, secs: it.secs || 20 } : null);
/** The hardest questions first: accuracy below 100 %, lowest first, at most `max`. -> { ok, items } | { ok: false, code:
 *  'notFound' (no saved choices) | 'noMissed' (everyone got everything) }. list: summary or saved items. */
export function missedOf(list, max = 20) {
  const rich = (list || []).filter(it => asItem(it));
  if (!rich.length) return { ok: false, code: 'notFound' };
  const missed = rich.filter(it => it.answered && it.right < it.answered).sort((a, b) => (a.right / a.answered) - (b.right / b.answered));
  if (!missed.length) return { ok: false, code: 'noMissed' };
  return { ok: true, items: missed.slice(0, max).map(asItem) };
}
/** The 3 hardest questions (lowest accuracy, answered by someone). */
export const hardest = (list, n = 3) => (list || []).filter(it => it.answered).sort((a, b) => (a.right / a.answered) - (b.right / b.answered) || (a.i ?? 0) - (b.i ?? 0)).slice(0, n);

// ---------------------------------------------------------------- CSV
const cell = v => { const s = String(v ?? ''); return /^[=+\-@\t\r]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/**
 * The results as CSV: rank, student, team, score, bonus, correct, answered, q1..qN (marks: 1 right, 0 wrong, - none),
 * then a blank line and one row per question: question, right, answered, choice_a..d (counts). Cells that a spreadsheet
 * would read as a formula are quoted with a leading apostrophe.
 * x: { players: [{ rank, name, team (a name), score, bonus, correct, answered, marks }], items }
 */
export function csv({ players = [], items = [] }) {
  const n = Math.max(0, ...players.map(p => (p.marks || '').length));
  const qs = Array.from({ length: n }, (_, i) => `q${i + 1}`);
  const rows = [['rank', 'student', 'team', 'score', 'bonus', 'correct', 'answered', ...qs],
    ...players.map(p => [p.rank, p.name, p.team || '', p.score, p.bonus || 0, p.correct, p.answered, ...Array.from({ length: n }, (_, i) => (p.marks || '')[i] || '-')])];
  if (items.length) {
    rows.push([]);
    rows.push(['question', 'right', 'answered', 'choice_a', 'choice_b', 'choice_c', 'choice_d']);
    for (const it of items) rows.push([it.q || `#${(it.i ?? 0) + 1}`, it.right, it.answered, ...[0, 1, 2, 3].map(i => (it.counts && it.counts[i] !== undefined ? it.counts[i] : ''))]);
  }
  return rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
/** A class's recent runs (the class progress page's "Live games" panel); teams: the run's team list or ''. */
export const classRuns = (classId, limit = 10) => q.all('SELECT id, title, mode, started_at, ended_at, players, guests, teams FROM live_runs WHERE class_id=? ORDER BY ended_at DESC LIMIT ?', classId, limit);
export const hostRuns = (hostId, limit = 20) => q.all('SELECT id, title, mode, audience, class_id, started_at, ended_at, players, guests FROM live_runs WHERE host_id=? ORDER BY ended_at DESC LIMIT ?', hostId, limit);

// ---------------------------------------------------------------- reports (fixed reasons; never who reported)
/** A player's report: the host, game and version, set, and the question texts. -> the report id. */
export function report(s, reason) {
  const id = uid(12);
  const items = s.items ? JSON.stringify(s.items.map(it => it.q)).slice(0, 20000) : '';
  q.run('INSERT INTO live_reports(id, host_id, game_id, version_id, set_id, reason, items, created_at) VALUES (?,?,?,?,?,?,?,?)',
    id, s.host.userId, s.gameId, s.versionId, s.setId, REPORT_REASONS.includes(reason) ? reason : 'other', items, Date.now());
  return id;
}
export const openReports = (limit = 100) => q.all(`SELECT r.*, g.title game_title, g.slug game_slug, h.username host_name FROM live_reports r LEFT JOIN games g ON g.id=r.game_id
  LEFT JOIN users h ON h.id=r.host_id WHERE r.resolved_at IS NULL ORDER BY r.created_at DESC LIMIT ?`, limit);
export const resolveReport = (by, id) => q.run('UPDATE live_reports SET resolved_at=?, resolved_by=? WHERE id=? AND resolved_at IS NULL', Date.now(), by.id, String(id)).changes > 0;

// ---------------------------------------------------------------- retention
/** Runs with no class after 90 days (class runs follow their class), resolved reports after a year. */
export function retention(t = Date.now()) {
  const old = q.all('SELECT id FROM live_runs WHERE class_id IS NULL AND ended_at<?', t - KEEP.classless).map(r => r.id);
  tx(() => {
    for (const id of old) { q.run('DELETE FROM live_run_scores WHERE run_id=?', id); q.run('DELETE FROM live_runs WHERE id=?', id); }
    q.run('DELETE FROM live_reports WHERE resolved_at IS NOT NULL AND resolved_at<?', t - KEEP.reports);
  });
  return old.length;
}
register('live-retention', DAY, () => retention(), { firstAfterMs: 13 * 60e3 });

/** Account deletion (services/account-delete.js): a player's scores; a host's sets, runs and their scores. Reports keep
 *  only 'deleted' as their host. */
export function forgetUser(userId) {
  q.run('DELETE FROM live_run_scores WHERE user_id=?', userId);
  // Part 3: saved teams and support of that student; the host's own remembered settings; their name off what they set.
  q.run('DELETE FROM live_class_teams WHERE user_id=?', userId);
  q.run('DELETE FROM live_support WHERE user_id=?', userId);
  q.run('DELETE FROM live_prefs WHERE user_id=?', userId);
  q.run('UPDATE live_class_team_cfg SET saved_by=NULL WHERE saved_by=?', userId);
  q.run('UPDATE live_support SET set_by=NULL WHERE set_by=?', userId);
  for (const r of q.all('SELECT id FROM live_runs WHERE host_id=?', userId)) q.run('DELETE FROM live_run_scores WHERE run_id=?', r.id);
  q.run('DELETE FROM live_runs WHERE host_id=?', userId);
  q.run('DELETE FROM live_sets WHERE owner_id=?', userId);
  q.run("UPDATE live_reports SET host_id='deleted' WHERE host_id=?", userId);
}

/** A class's saved live data for one student (left the class or the school) or the whole class (deleted): its saved
 *  teams and support (registered with schools.js, so it needs no import of this module). */
export function forgetClassData({ classId, userId = null }) {
  if (!classId) return;
  if (userId) { q.run('DELETE FROM live_class_teams WHERE class_id=? AND user_id=?', classId, userId); q.run('DELETE FROM live_support WHERE class_id=? AND user_id=?', classId, userId); return; }
  q.run('DELETE FROM live_class_teams WHERE class_id=?', classId); q.run('DELETE FROM live_class_team_cfg WHERE class_id=?', classId);
  q.run('DELETE FROM live_support WHERE class_id=?', classId);
}
S.onClassLeave(forgetClassData);

/** A school account merged into the student's own account (schools.mergeSchoolAccount): its live scores, saved teams
 *  and saved support move with the class membership; where both accounts have a row, the school account's (the class
 *  membership that is kept) wins for teams and support and the own account's wins for run scores; nothing is left on the
 *  switched-off account. */
export function mergeLiveData({ from, into }) {
  if (!from || !into || from === into) return;
  for (const t of ['live_class_teams', 'live_support']) {
    q.run(`DELETE FROM ${t} WHERE user_id=? AND class_id IN (SELECT class_id FROM ${t} WHERE user_id=?)`, into, from);
    q.run(`UPDATE ${t} SET user_id=? WHERE user_id=?`, into, from);
  }
  q.run('UPDATE OR IGNORE live_run_scores SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM live_run_scores WHERE user_id=?', from);
}
S.onAccountMerge(mergeLiveData);

// ---------------------------------------------------------------- saved support (class teachers; LIVE_SAVE_SUPPORT)
/** A class's saved support: [{ user_id, extra_time, read_aloud, simple, display_name, username }] (active students). */
export const classSupport = classId => q.all(`SELECT s.user_id, s.extra_time, s.read_aloud, s.simple, u.display_name, u.username FROM live_support s
  JOIN class_members m ON m.class_id=s.class_id AND m.user_id=s.user_id AND m.status='active' JOIN users u ON u.id=s.user_id WHERE s.class_id=? ORDER BY u.display_name COLLATE NOCASE`, classId);
/** One student's saved support row, or null. */
export const supportRow = (classId, userId) => q.get('SELECT extra_time, read_aloud, simple FROM live_support WHERE class_id=? AND user_id=?', classId, userId) || null;
/** Save one student's support for a class ({ time, read, simple }); all off deletes the row. -> saved (bool). */
export function saveSupport(classId, userId, { time = 100, read = false, simple = false }, by = null) {
  const any = time > 100 || read || simple;
  if (any) q.run(`INSERT INTO live_support(class_id, user_id, extra_time, read_aloud, simple, set_by, updated_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(class_id, user_id) DO UPDATE SET extra_time=excluded.extra_time, read_aloud=excluded.read_aloud, simple=excluded.simple, set_by=excluded.set_by, updated_at=excluded.updated_at`,
  classId, userId, time, read ? 1 : 0, simple ? 1 : 0, by, Date.now());
  else q.run('DELETE FROM live_support WHERE class_id=? AND user_id=?', classId, userId);
  return any;
}
/** "Clear support": every saved row of the class. -> how many. */
export const clearClassSupport = classId => q.run('DELETE FROM live_support WHERE class_id=?', classId).changes;
