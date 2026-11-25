// The Classroom tab's overview (Homeroom, step 2c; docs/homeroom.md "A class's tabs"; the owner-approved mockup's
// Classroom view): the calm, simple picture of the last WEEKS weeks at the top of Progress, for Homeroom teachers only.
//   - one column per handout (games, the teacher's own games, lessons, Reading: docs/decisions.md "Homeroom: reading
//     from the desk", graded by Completion or the quiz's Score like any other) handed out in Homeroom in the last WEEKS weeks,
//     newest first, each with how it is graded (Score, Completion, Not graded). The versions of one lesson handed out
//     together (homeroom_handouts.batch) are one column: each student's cell is their own version's result;
//   - one row per student, in alphabetical order (never ranked);
//   - each cell by its grading: Score the % right (the gradebook's Score of that lesson: services/scores.js), Completion
//     done or not done, Not graded "Practice";
//   - a trend per student from their recent Score results (trendOf, the rule is there and in docs/decisions.md);
//   - three numbers: handouts finished (of every handout cell that is open and assigned), students needing support (the
//     trend's Needs support) and handouts this month (the calendar month so far, in UTC like the stored dates).
// Everything is read from what exists: homeroom_handouts for the columns, services/progress.js classProgress for the
// cells (the same figures as the full gradebook below it). Nothing here is stored and nothing leaves the site.
import { q, now } from '../db.js';
import * as P from './progress.js';
import * as games from './games.js';
import * as H from './homeroom.js';
import * as HR from './homeroom-reading.js';

export const WEEKS = 4;
const DAY = 86400e3;
/** Score bands for a cell's color (calm: green, yellow, rose), never a ranking. */
export const BANDS = { ok: 80, mid: 60 };
/** The trend's rule: the student's last TREND_N Score results (oldest to newest, in the window). */
export const TREND_N = 3, SUPPORT_BELOW = 60, IMPROVE_BY = 10;

/**
 * A student's trend from their Score results in time order (oldest first; numbers 0 to 100):
 *   no Score result yet            -> null (nothing shown)
 *   mean of the last 3 below 60 %  -> 'support'  (Needs support)
 *   the last minus the first of those 3 (2 or more results) is 10 points or more -> 'up' (Improving)
 *   otherwise                      -> 'steady' (Steady)
 * Needs support comes first, so a student who is improving but still under 60 % on average shows Needs support.
 */
export function trendOf(scores) {
  const list = (scores || []).filter(n => Number.isFinite(n));
  if (!list.length) return null;
  const last = list.slice(-TREND_N), mean = last.reduce((a, b) => a + b, 0) / last.length;
  if (mean < SUPPORT_BELOW) return 'support';
  if (last.length >= 2 && last[last.length - 1] - last[0] >= IMPROVE_BY) return 'up';
  return 'steady';
}
/** A Score cell's band: 'ok' (80 and up), 'mid' (60 to 79), 'low'. */
export const bandOf = pct => (pct >= BANDS.ok ? 'ok' : pct >= BANDS.mid ? 'mid' : 'low');
/** The first day of t's calendar month (UTC). */
export const monthStart = t => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };

/** The window's handouts, grouped: a lesson's versions handed out together are one column. Newest first. */
function columnsOf(classId, since) {
  const rows = q.all(`SELECT h.class_lesson_id id, h.grade, h.hr_lesson hl, h.batch, h.created_at, cl.lesson_id, s.game_id, l.kind lkind FROM homeroom_handouts h
      JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL JOIN lessons l ON l.id=cl.lesson_id
      LEFT JOIN lesson_steps s ON s.lesson_id=cl.lesson_id AND s.kind='game'
      WHERE h.class_id=? AND h.created_at>=? ORDER BY h.created_at, h.class_lesson_id`, classId, since);
  const by = new Map(), cache = new Map();
  for (const r of rows) {
    const key = r.batch || r.id;
    if (!by.has(key)) {
      if (!cache.has(r.game_id)) cache.set(r.game_id, r.game_id ? games.getGame(r.game_id) : null);
      const g = cache.get(r.game_id);
      by.set(key, { key, id: r.id, ids: [], grade: r.grade, kind: r.lkind === 'story' ? 'reading' : r.hl ? 'lesson' : g && g.source !== 'seed' ? 'mine' : 'game', at: r.created_at });
    }
    by.get(key).ids.push(r.id);
  }
  return [...by.values()].sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1));
}
/** The handouts a class got since `since` (merged as columns): how many. */
export const handoutCount = (classId, since) => new Set(q.all(`SELECT COALESCE(NULLIF(h.batch,''), h.class_lesson_id) k FROM homeroom_handouts h
  JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL WHERE h.class_id=? AND h.created_at>=?`, classId, since).map(r => r.k)).size;

/** One cell: { state: 'na' | 'locked' | 'score' | 'done' | 'notDone' | 'practice' | 'practiced' | 'none', pct?, band?, clId } */
function cellOf(col, x, clId) {
  if (!x) return { state: 'na' };
  if (x.locked) return { state: 'locked', clId };
  const full = x.total > 0 && x.done >= x.total;
  if (col.grade === 'none') return { state: full ? 'practiced' : 'practice', clId };
  if (col.grade === 'completion') return { state: full ? 'done' : 'notDone', clId };
  // Score: the % right when something is scored; finished with nothing to score (free play): done; else nothing yet.
  if (x.score) return { state: 'score', pct: x.score.pct, band: bandOf(x.score.pct), clId };
  return { state: full ? 'done' : x.done || x.last ? 'notDone' : 'none', clId };
}

/**
 * The overview for a class. -> { columns: [{ key, id, title, kind, grade, versions, at }], students: [{ id, name, cells,
 * trend }] (alphabetical), summary: { finishedPct | null, support, month }, weeks }
 */
export function overview(c, { t = now(), locale = 'en' } = {}) {
  const since = t - WEEKS * 7 * DAY, cols = columnsOf(c.id, since);
  const gb = P.classProgress(c.id, t), at = new Map(gb.lessons.map((l, i) => [l.id, i]));
  const title = new Map(gb.lessons.map(l => [l.id, l.title]));
  // Students by their roster name (else their display name: the gradebook's name), in the teacher's language's order.
  const names = new Map(H.studentsOf(c.id).map(s => [s.id, s.name]));
  const coll = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const rows = gb.students.map(p => ({ p, name: names.get(p.id) || p.display_name || p.username || '' })).sort((a, b) => coll.compare(a.name, b.name) || (a.p.id < b.p.id ? -1 : 1));
  const columns = cols.filter(col => col.ids.some(id => at.has(id))).map(col => ({ key: col.key, id: col.ids.find(id => at.has(id)), ids: col.ids, title: title.get(col.ids.find(id => at.has(id))) || '', kind: col.kind, grade: col.grade, versions: col.ids.length, at: col.at }));
  let cells = 0, finished = 0;
  // A Reading column (docs/decisions.md "Homeroom: reading from the desk"): the quiz's first try beside the cell, whatever
  // the grading, so a Completion column still shows how the quiz went.
  const rd = columns.some(col => col.kind === 'reading') ? HR.infosOf(c.id) : new Map();
  const students = rows.map(({ p, name }) => {
    const out = columns.map(col => {
      // Their own version: the one of this handout assigned to them (the others are "not assigned" for them).
      const id = col.ids.find(i => at.has(i) && !p.cells[at.get(i)].na);
      const cell = cellOf(col, id ? p.cells[at.get(id)] : null, id);
      const info = col.kind === 'reading' && id ? rd.get(`${id}:${p.id}`) : null;
      if (info && info.total && cell.state !== 'score') cell.quiz = { right: info.right, total: info.total };
      if (cell.state !== 'na' && cell.state !== 'locked') { cells++; if (['score', 'done', 'practiced'].includes(cell.state) && fullOf(p.cells[at.get(id)])) finished++; }
      return cell;
    });
    // Oldest first for the trend: columns are newest first.
    const scores = out.map(x => (x.state === 'score' ? x.pct : null)).filter(n => n !== null).reverse();
    return { id: p.id, name, username: p.username, cells: out, trend: trendOf(scores) };
  });
  return {
    columns, students, weeks: WEEKS,
    summary: { finishedPct: cells ? Math.round((100 * finished) / cells) : null, support: students.filter(s => s.trend === 'support').length, month: handoutCount(c.id, monthStart(t)) },
  };
}
const fullOf = x => !!x && x.total > 0 && x.done >= x.total;
