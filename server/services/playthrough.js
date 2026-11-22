// "Played all the way through" (docs/decisions.md "Played all the way through before it is published"). A version can go
// live (Publish, Update live game, a new audience, a review request) only when the Builder's playthrough of that exact
// version reached the game's end: BRB.gameOver or the results card, with no uncaught errors, no stuck screen, and a
// score where the game sends one. The playthrough itself runs in the browser (snapshot.js playthroughGame ->
// playthrough-play.js); this module picks how to play a version, judges what happened, and keeps the result on the
// version (game_versions.playthrough_status / playthrough_report, migration 0101), so publishing checks it cheaply.
//   - The Builder plays every new version after a build (builder/tools.js autoPlaytest): a failure goes back to the
//     model as fix-it feedback (autotest.js), like the other playtest problems.
//   - Publishing (services/publish.js) needs a pass. A version with no result yet (made before this, or when the build
//     had no time left) is played right then; a stored failure is played again (it may have been a slow moment).
//   - A server without a browser (BRB_SNAPSHOTS off: development and the unit tests) cannot play anything: the check
//     is skipped there, never faked. Production always has one.
import { q } from '../db.js';
import * as snapshot from './snapshot.js';
import { canvasVersion, activityData } from './canvaskit.js';
import { usesKit } from '../builder/layer.js';
import { tEn } from '../i18n/index.js';

/** Tests: run(html, opts) replaces the browser (it returns what snapshot.playthroughGame would). */
export const hooks = { run: null };

/** Can this server play games? */
export const available = () => !!hooks.run || snapshot.enabled();

/** How to play this version: { kind: 'canvas'|'kit'|'free'|'endless', data?, scoring, speed? }. */
export function planFor(html) {
  const s = String(html || '');
  const scoring = /\bBRB\s*\.\s*score\b/.test(s);
  if (canvasVersion(s)) { const d = activityData(s); return { kind: 'canvas', data: d && d.data ? d.data : null, scoring: false }; }
  const over = /\bgameOver\b/.test(s), slow = /\bfrom\s*["']oomba3d["']|\/vendor\/three\//.test(s);
  if (usesKit(s)) return { kind: 'kit', scoring, over };
  // A page that never ends a round (a spinner or a scoreboard for the board) has nothing to finish: it is played for a
  // few seconds and must not break. Anything else must say when it is over.
  if (!over) return { kind: 'endless', scoring, slow };
  return { kind: 'free', scoring, speed: slow ? 1 : 3, slow };   // 3D games keep their own clock (physics steps)
}

const clean = (x, n = 160) => String(x == null ? '' : x).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * What happened -> { ok, code, text (plain English: logs and the model), level?, n?, error?, secs?, kind, how, ms,
 * score, sizes?, endless? }. raw: the browser's facts, or { failed: message } when the run itself broke.
 */
export function judge(raw, plan = {}) {
  const kind = (raw && raw.kind) || plan.kind || 'free';
  if (!raw || raw.failed) {
    const why = clean(raw && raw.failed, 120) || 'unknown';
    return { ok: false, code: 'failed', text: `the playthrough could not finish (${why}): the game may freeze or loop forever`, kind, ms: null };
  }
  const base = { kind, ms: typeof raw.ms === 'number' ? raw.ms : null, score: typeof raw.score === 'number' ? raw.score : null };
  if (raw.sizes) base.sizes = raw.sizes;
  if (raw.levels) base.levels = raw.levels.length;
  const errors = (raw.errors || []).map(e => clean(e)).filter(Boolean);
  const level = raw.why && Number.isInteger(raw.why.level) ? raw.why.level : null;
  const said = errors.length ? errors[0] : raw.why && raw.why.code === 'error' ? clean(raw.why.text) : '';
  if (said) return { ...base, ok: false, code: 'error', error: said, ...(level ? { level } : {}), text: `it hit an error${level ? ` on level ${level}` : ''}: "${said.replace(/"/g, '\'')}"` };
  if (!raw.end) {
    const w = raw.why || {};
    const code = ['stuck', 'noend', 'nogameover', 'noscore', 'hint', 'answer', 'start', 'error'].includes(w.code) ? w.code : w.code === 'slow' ? 'noend' : 'stuck';
    return { ...base, ok: false, code, text: clean(w.text, 200) || 'it did not reach the end', ...(level ? { level } : {}), ...(Number.isInteger(w.n) ? { n: w.n } : {}), ...(code === 'error' ? { error: clean(w.text) } : {}), secs: Math.round((raw.playMs || raw.ms || 0) / 1000) };
  }
  const how = kind === 'canvas' ? 'answered' : kind === 'kit' ? 'levels' : raw.endless ? 'endless' : raw.endHow || 'played';
  return { ...base, ok: true, code: 'pass', how, ...(raw.endless ? { endless: true } : {}), text: raw.endless ? 'it has no end by design and ran with no errors' : `it reached the end${kind === 'kit' && raw.levels ? ` (${raw.levels.length} level${raw.levels.length > 1 ? 's' : ''})` : ''}${base.score !== null ? ` with a score of ${base.score}` : ''}` };
}

/** Play this game to its end now. -> judge() result, or { ok: false, code: 'busy' } when no browser could take it. */
export async function play(html, { orientation = 'landscape', lang = 'en', dir = 'ltr', title = 'Game', budgetMs } = {}) {
  const plan = planFor(html);
  const t0 = Date.now();
  let raw;
  try {
    raw = hooks.run ? await hooks.run(html, { ...plan, orientation, lang, dir })
      : await snapshot.playthroughGame(html, { ...plan, orientation: orientation === 'portrait' ? 'portrait' : 'landscape', lang, dir, title, ...(budgetMs ? { budgetMs } : {}) });
  } catch (e) {
    if (e && e.workerDown) return { ok: false, code: 'busy', text: 'no browser was free to play it', kind: plan.kind };
    raw = { failed: String((e && e.message) || e).split('\n')[0] };
  }
  const r = judge(raw, plan);
  return { ...r, wallMs: Date.now() - t0 };
}

/** Keep a result on its version (a 'busy' one is not a result). */
export function record(versionId, r) {
  if (!versionId || !r || r.code === 'busy') return;
  const keep = { ok: !!r.ok, code: r.code, text: r.text, kind: r.kind, how: r.how, level: r.level, n: r.n, error: r.error, secs: r.secs, score: r.score, ms: r.ms, endless: r.endless, at: Date.now() };
  q.run('UPDATE game_versions SET playthrough_status=?, playthrough_report=? WHERE id=?', r.ok ? 'pass' : 'fail', JSON.stringify(keep), versionId);
}
/** The stored result of a version: { status: ''|'pass'|'fail', report }. */
export function resultOf(version) {
  if (!version) return { status: '', report: null };
  let report = null; try { report = JSON.parse(version.playthrough_report || 'null'); } catch { report = null; }
  return { status: version.playthrough_status || '', report };
}

/**
 * The result publishing goes by, for this exact version: a stored pass (or a pass of the same code in another version of
 * this game: Save version and Restore copy it), else the playthrough is run now and stored.
 * -> { ok, skipped?, ran?, ...result }
 */
export async function ensure(version, game = null, opts = {}) {
  if (!version) return { ok: false, code: 'failed', text: 'no version' };
  const mine = resultOf(version);
  if (mine.status === 'pass') return { ok: true, ...(mine.report || {}), stored: true };
  const twin = q.get("SELECT playthrough_report FROM game_versions WHERE game_id=? AND id<>? AND playthrough_status='pass' AND html=? LIMIT 1", version.game_id, version.id, version.html);
  if (twin) { let rep = {}; try { rep = JSON.parse(twin.playthrough_report || '{}') || {}; } catch { rep = {}; } record(version.id, { ...rep, ok: true }); return { ok: true, ...rep, stored: true }; }
  if (!available()) return { ok: true, skipped: true };
  const r = await play(version.html, { orientation: game && game.orientation, title: game && game.title, ...opts });
  record(version.id, r);
  return { ...r, ran: true };
}

// ---- words for people (the Studio, publishing) ----------------------------------------------------------------------
/** What went wrong, as a short phrase in the reader's language ("it got stuck on level 2"). */
export function reasonText(r, t = tEn) {
  const v = { level: r.level || 0, n: r.n || 0, secs: r.secs || 60, error: clean(r.error, 90) };
  switch (r.code) {
    case 'error': return t(r.level ? 'publish.play.why.errorAt' : 'publish.play.why.error', v);
    case 'stuck': return t(r.level ? 'publish.play.why.stuckAt' : r.n ? 'publish.play.why.stuckProblem' : 'publish.play.why.stuck', v);
    case 'noend': return t('publish.play.why.noend', v);
    case 'nogameover': return t('publish.play.why.noGameOver', v);
    case 'noscore': return t('publish.play.why.noScore', v);
    case 'hint': return t('publish.play.why.hint', v);
    case 'answer': return t('publish.play.why.answer', v);
    case 'start': return t('publish.play.why.start', v);
    default: return t('publish.play.why.failed', v);
  }
}
/** The publish refusal: { message, ask (the chat message "Ask the Builder to fix it" sends) }. */
export function blockedWords(r, t = tEn) {
  if (r.code === 'busy') return { message: t('publish.play.busy'), ask: '' };
  const why = reasonText(r, t);
  return { message: t('publish.play.blocked', { why }), ask: t('publish.play.ask', { why }) };
}
