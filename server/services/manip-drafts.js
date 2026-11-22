// The manipulatives' AI drafts as server jobs (docs/decisions.md "Virtual math manipulatives: saving and AI drafts"),
// in the Builder's pattern (server/builder/runner.js, turns.js): the manip_drafts row is the job, the work runs in this
// process apart from any HTTP request, so a refresh, a closed tab or a lost connection changes nothing; the page asks
// how it is going (GET /api/manipulatives/draft) and shows the same progress again. One unfinished draft per teacher
// (the unique index manip_drafts_one_live): asking again while one runs gives back the one that runs.
// SINGLE INSTANCE, like the Builder: the jobs map lives in memory. At shutdown a running draft is marked interrupted
// (handOff); at the next boot recover() runs it again (once more, if it is still recent) or ends it as failed.
// A draft: queued -> running (steps: check, ai, build, save) -> done (saved as a recent board in My boards) | failed.
// What is stored: the teacher's words after the checks (names of their students are refused before anything is
// stored or sent; services/manipulatives.js draftRequest), the result's summary and the board. Never student work.
// Rows go KEEP_DAYS after they end; the board stays in My boards (its own 60 days).
import { q, uid, now } from '../db.js';
import { getUser } from '../auth.js';
import { log } from './log.js';
import * as M from './manipulatives.js';

/** The progress card's rows, in order (the page words them). */
export const STEPS = ['check', 'ai', 'build', 'save'];
export const DRAFTS = {
  RESUME_WITHIN_MS: 10 * 60e3,   // an unfinished draft older than this is not run again at boot (the teacher moved on)
  MAX_ATTEMPTS: 2,               // runs of one draft, restarts included
  KEEP_DAYS: 7,                  // finished rows (the board itself stays in My boards)
  ETA_SAMPLE: 40, ETA_MIN: 10, ETA_WINDOW_DAYS: 30,
  ETA_DEFAULT: { p50: 25e3, p75: 40e3 },   // first guesses until there are ETA_MIN timed drafts ("About ...")
};
const LIVE_SQL = "('queued','running','interrupted')";
const DAY = 86400e3;
const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

/** This process's running drafts: id -> promise. */
const jobs = new Map();
export const busy = () => jobs.size;
/** A draft's promise while it runs here (tests wait on it), else a resolved one. */
export const settled = id => jobs.get(id) || Promise.resolve();

export const get = id => q.get('SELECT * FROM manip_drafts WHERE id=?', String(id || '')) || null;
export const liveFor = ownerId => q.get(`SELECT * FROM manip_drafts WHERE owner_id=? AND status IN ${LIVE_SQL}`, ownerId) || null;

/** What the page gets: no owner, the teacher's own words, numbers only for the steps and times. */
export function view(r) {
  if (!r) return null;
  const req = parse(r.request, {}), res = parse(r.result || 'null', null);
  return {
    id: r.id, tool: r.tool, status: r.status === 'interrupted' ? 'running' : r.status, step: r.step, steps: parse(r.steps, []),
    brief: req.brief || '', grade: req.grade || '', task: req.task || '',
    createdAt: r.created_at, startedAt: r.started_at, endedAt: r.ended_at, now: now(),
    error: r.error || null, boardId: r.board_id || null, result: res, seen: !!r.seen_at,
  };
}

/** How long drafts take here: the newest timed ones (p50, p75 in ms), or first guesses (src 'default'). */
export function eta(t = now()) {
  const rows = q.all(`SELECT ended_at - started_at ms FROM manip_drafts WHERE status='done' AND started_at IS NOT NULL AND ended_at>? AND attempt=1
    ORDER BY ended_at DESC LIMIT ${DRAFTS.ETA_SAMPLE}`, t - DRAFTS.ETA_WINDOW_DAYS * DAY).map(r => r.ms).filter(x => x >= 0).sort((a, b) => a - b);
  if (rows.length < DRAFTS.ETA_MIN) return { src: 'default', ...DRAFTS.ETA_DEFAULT };
  const at = p => rows[Math.min(rows.length - 1, Math.max(0, Math.ceil(p * rows.length) - 1))];
  return { src: 'data', p50: at(0.5), p75: at(0.75) };
}

/** The draft the page shows: the unfinished one, else the newest finished one the teacher hasn't seen end. */
export function current(u) {
  if (!u) return null;
  return view(liveFor(u.id) || q.get(`SELECT * FROM manip_drafts WHERE owner_id=? AND status IN ('done','failed') AND seen_at IS NULL AND ended_at>?
    ORDER BY ended_at DESC, rowid DESC LIMIT 1`, u.id, now() - DRAFTS.KEEP_DAYS * DAY));
}

/**
 * A host asks for a draft: checked first (nothing is stored or sent when the checks fail), then stored and started.
 * While one of theirs is unfinished, that one comes back (already: true) and nothing new starts.
 * -> { ok, job, already? } | fail
 */
export function start(u, body = {}) {
  const r = M.draftRequest(u, body); if (!r.ok) return r;
  prune();
  const live = liveFor(u.id);
  if (live) return ok({ job: view(live), already: true });
  const id = uid(16), t = now();
  try {
    q.run("INSERT INTO manip_drafts(id, owner_id, tool, request, status, created_at) VALUES (?,?,?,?,'queued',?)", id, u.id, r.tool,
      JSON.stringify({ brief: r.brief, grade: r.grade, task: r.task }), t);
  } catch {   // the unique index: another request of theirs got there first
    const other = liveFor(u.id); if (other) return ok({ job: view(other), already: true });
    return fail('aiFailed');
  }
  // A new draft takes over from any earlier one whose end they haven't seen.
  q.run("UPDATE manip_drafts SET seen_at=? WHERE owner_id=? AND status IN ('done','failed') AND seen_at IS NULL", t, u.id);
  run(id);
  return ok({ job: view(get(id)) });
}

/** The teacher saw how a draft ended (it was put on their board, or the notice was shown). */
export function seen(u, id) {
  const r = get(id); if (!r || !u || r.owner_id !== u.id) return fail('notFound');
  if (!r.seen_at && (r.status === 'done' || r.status === 'failed')) q.run('UPDATE manip_drafts SET seen_at=? WHERE id=?', now(), r.id);
  return ok();
}

/** Each move of a running draft is written only while it is still running in this attempt. */
function setStep(id, attempt, step, t0) {
  const r = get(id); if (!r || r.status !== 'running' || r.attempt !== attempt) return false;
  const steps = parse(r.steps, []).slice(0, step); steps[step] = Math.max(0, now() - t0);
  q.run("UPDATE manip_drafts SET step=?, steps=? WHERE id=? AND status='running' AND attempt=?", step, JSON.stringify(steps), id, attempt);
  return true;
}
function finish(id, attempt, fields) {
  const cols = Object.keys(fields);
  return q.run(`UPDATE manip_drafts SET ${cols.map(c => `${c}=?`).join(', ')}, ended_at=? WHERE id=? AND status='running' AND attempt=?`, ...cols.map(c => fields[c]), now(), id, attempt).changes > 0;
}

/** Runs a draft here (once per id at a time). -> its promise (never rejects). */
export function run(id) {
  if (jobs.has(id)) return jobs.get(id);
  const p = (async () => {
    const r0 = get(id);
    if (!r0 || !['queued', 'interrupted', 'running'].includes(r0.status)) return;
    const attempt = r0.attempt + 1, t0 = now();
    const begun = q.run(`UPDATE manip_drafts SET status='running', attempt=?, step=0, steps='[0]', started_at=COALESCE(started_at, ?) WHERE id=? AND status IN ${LIVE_SQL}`, attempt, t0, id).changes;
    if (!begun) return;
    const owner = getUser(r0.owner_id);
    // 1. check: the words again (a student may have joined the class since), and that they may still draft.
    const req = owner ? M.draftRequest(owner, { ...parse(r0.request, {}), tool: r0.tool }) : { ok: false, code: 'notFound' };
    if (!req.ok) { finish(id, attempt, { status: 'failed', error: req.code }); return; }
    // 2. ai: the model chooses what goes on the board (or the tool's usual board without the AI).
    if (!setStep(id, attempt, 1, t0)) return;
    const res = await M.runDraft(owner, req);
    if (!res.ok) { finish(id, attempt, { status: 'failed', error: res.code }); return; }
    // 3. build: the app checked every problem and laid the board out (sanitizeDraft); 4. save: a recent board.
    if (!setStep(id, attempt, 2, t0)) return;
    const d = res.draft;
    const state = { ...d.board, __steps: (d.steps || []).map((text, i) => ({ id: `s${id.slice(0, 6)}${i}`, text })) };
    const c = M.cleanState(state, null, req.tool);
    if (!c.ok) { finish(id, attempt, { status: 'failed', error: c.code }); return; }
    if (!setStep(id, attempt, 3, t0)) return;
    const cur = get(id); if (!cur || cur.status !== 'running' || cur.attempt !== attempt) return;
    const b = M.addRecent(owner, req.tool, d.title, c.state, { opened: 0 });
    const summary = { title: d.title, n: d.n, steps: (d.steps || []).length, capped: !!d.capped, ai: !!res.ai };
    if (!finish(id, attempt, { status: 'done', board_id: b.id, result: JSON.stringify(summary) })) q.run('DELETE FROM manip_boards WHERE id=?', b.id);
  })().catch(e => {
    log('error', 'manipulatives draft failed', { draft: id, error: e.message });
    try { q.run("UPDATE manip_drafts SET status='failed', error='aiFailed', ended_at=? WHERE id=? AND status='running'", now(), id); } catch { /* closed */ }
  }).finally(() => { jobs.delete(id); });
  jobs.set(id, p);
  return p;
}

/** Shutdown: drafts still running here are marked interrupted, for recover() at the next boot. -> how many. */
export function handOff() {
  let n = 0;
  for (const id of jobs.keys()) n += q.run("UPDATE manip_drafts SET status='interrupted' WHERE id=? AND status='running'", id).changes;
  return n;
}

/** Boot, before any request: every unfinished draft belongs to the process that stopped. A recent one that may run
 *  again does (from the start: a draft is short); any other ends as failed ('restart'), and the page offers Try again. */
export function recover(t = now()) {
  const out = { resumed: 0, stopped: 0 };
  for (const r of q.all(`SELECT * FROM manip_drafts WHERE status IN ${LIVE_SQL} ORDER BY created_at`)) {
    if (r.created_at > t - DRAFTS.RESUME_WITHIN_MS && r.attempt < DRAFTS.MAX_ATTEMPTS) { q.run("UPDATE manip_drafts SET status='interrupted' WHERE id=?", r.id); run(r.id); out.resumed++; }
    else { q.run("UPDATE manip_drafts SET status='failed', error='restart', ended_at=? WHERE id=?", t, r.id); out.stopped++; }
  }
  if (out.resumed + out.stopped) log('info', 'recovered manipulatives drafts', out);
  return out;
}

/** Finished drafts go after KEEP_DAYS (their boards stay in My boards). */
export function prune(t = now()) {
  q.run(`DELETE FROM manip_drafts WHERE status NOT IN ${LIVE_SQL} AND ended_at<?`, t - DRAFTS.KEEP_DAYS * DAY);
}

/** Tests: forget the in-memory jobs. */
export function _reset() { jobs.clear(); }
