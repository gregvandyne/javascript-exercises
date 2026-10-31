// Oomba Live results (docs/decisions.md "Oomba Live", docs/safety.md §12). At the end of a session the host sees every
// player's result from memory for 10 minutes. What is saved is small and has no guest in it:
// - live_runs: counts and the host-written question texts (accuracy per question). No code, nickname, name or nonce.
// - live_run_scores: one row per active student of the run's class, only in a class room hosted by one of the class's
//   teachers; a linked lesson game step also gets the score in the gradebook (progress.gameScore, best kept).
// Nothing else is written. Guests and signed-in players outside a class run exist only in the summary in memory.
import { q, tx, uid } from '../db.js';
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
export function summary(s) {
  const seats = [...s.seats.values(), ...(s.gone || [])];
  const race = s.race;
  const rows = seats.map(seat => ({
    seat: seat.no, name: s.nameMode === 'accounts' && seat.name ? seat.name : seat.nick, avatar: seat.avatar, kind: seat.kind,
    score: seat.score, correct: seat.correct, answered: seat.answered, scoredBy: seat.scoredBy,
    ...(race ? { progress: Math.min(1000, Math.round((race.get(seat.no) || { prog: 0 }).prog)), gems: (race.get(seat.no) || { gems: 0 }).gems } : {}),
    ...(s.seats.has(seat.no) ? {} : { left: true }),
  }));
  rows.sort((a, b) => ((b.progress || 0) - (a.progress || 0)) || (b.score - a.score) || (a.seat - b.seat));
  let rank = 0, prev = null;
  rows.forEach((r, i) => { const k = `${r.progress || 0}:${r.score}`; if (k !== prev) { rank = i + 1; prev = k; } r.rank = rank; });
  const items = [...s.itemStats].sort((a, b) => a[0] - b[0]).map(([i, st]) => ({ i, ...(st.q ? { q: st.q } : {}), right: st.right, answered: st.answered, ...(st.topWrong ? { topWrong: st.topWrong } : {}) }));
  const out = {
    id: s.id, title: s.title, mode: s.mode, audience: s.audience, nameMode: s.nameMode, startedAt: s.startedAt, endedAt: s.endedAt,
    scoredBy: s.quiz ? 'server' : 'game', players: rows, items,
    guests: seats.filter(x => x.kind === 'guest').length,
  };
  // Which account sat in which seat: for save() only, never sent anywhere (not enumerable, so not in any JSON).
  Object.defineProperty(out, 'userOf', { value: new Map(seats.filter(x => x.userId).map(x => [x.no, x.userId])), enumerable: false });
  return out;
}

/** Save an ended session (one transaction). Class runs: scores for the class's active students. */
export function save(s, sum = summary(s)) {
  const id = s.id;
  const host = getUser(s.host.userId);
  const classRun = s.audience === 'class' && s.classId && host && S.teaches(host, s.classId);
  tx(() => {
    q.run(`INSERT OR REPLACE INTO live_runs(id, host_id, class_id, class_lesson_id, step_id, audience, mode, game_id, version_id, set_id, title,
      started_at, ended_at, players, guests, items, scored_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, s.host.userId, classRun ? s.classId : null, classRun ? s.clId : null, classRun ? s.stepId : null, s.audience, s.mode,
    s.gameId, s.versionId, s.setId, s.title, s.startedAt || s.createdAt, s.endedAt || Date.now(), sum.players.length, sum.guests,
    // The question texts the host wrote (or a starter set's): never anything a player sent.
    JSON.stringify(sum.items.map(it => ({ ...(it.q ? { q: it.q } : { i: it.i }), right: it.right, answered: it.answered, ...(it.topWrong ? { top_wrong: it.topWrong } : {}) }))),
    sum.scoredBy);
    if (!classRun) return;
    for (const p of sum.players) {
      const userId = sum.userOf.get(p.seat);
      if (!userId) continue;
      const m = S.classMember(s.classId, userId);
      if (!m || m.role !== 'student') continue;
      q.run('INSERT OR REPLACE INTO live_run_scores(run_id, user_id, score, rank, correct, answered) VALUES (?,?,?,?,?,?)', id, userId, p.score, p.rank, p.correct, p.answered);
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
  let items = []; try { items = JSON.parse(run.items); } catch { /* none */ }
  const scores = run.class_id ? q.all(`SELECT r.user_id, r.score, r.rank, r.correct, r.answered, u.display_name, u.username FROM live_run_scores r
    JOIN users u ON u.id=r.user_id WHERE r.run_id=? ORDER BY r.rank, u.display_name COLLATE NOCASE`, run.id) : [];
  return { run, items, scores };
}
/** A class's recent runs (the class progress page's "Live games" panel). */
export const classRuns = (classId, limit = 10) => q.all('SELECT id, title, mode, started_at, ended_at, players, guests FROM live_runs WHERE class_id=? ORDER BY ended_at DESC LIMIT ?', classId, limit);
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
  for (const r of q.all('SELECT id FROM live_runs WHERE host_id=?', userId)) q.run('DELETE FROM live_run_scores WHERE run_id=?', r.id);
  q.run('DELETE FROM live_runs WHERE host_id=?', userId);
  q.run('DELETE FROM live_sets WHERE owner_id=?', userId);
  q.run("UPDATE live_reports SET host_id='deleted' WHERE host_id=?", userId);
}
