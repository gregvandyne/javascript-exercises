// Publishing and updating games. This is the one place that moves a version live.
//
// Rules:
//  - current_version_id is what the Studio edits; published_version_id is what players get.
//  - Every version must pass the static scan before it can go live at any level.
//  - Private / Friends: static scan is enough; goes live at once (a grown-up's friends are other grown-ups only).
//  - Family / Class / School (a group of children who didn't opt in): a clean ('pass') or already-approved version goes
//    live at once; a flagged one waits for a human, like public. 'family' is a grown-up builder's linked children;
//    'class' also needs the chosen classes (schools.validateClassPick).
//  - A grown-up's games go through exactly this pipeline too: nothing here depends on who the owner is.
//  - Public: also needs a model review (services/review.js). If the model is unavailable the
//    version waits in the admin review queue (pending_version_id).
//  - games.pending_visibility records what a waiting review is for; approval applies exactly that audience.
//  - UPDATING a game that is already live: the old published version keeps playing for everyone
//    while the new one is reviewed; when approved it replaces it. Builders can update forever.
import { q, now, tx, audit } from '../db.js';
import { getGame, getVersion, VISIBILITIES, liveClasses } from './games.js';
import { scanVersion } from './scanner.js';
import { reviewVersion } from './review.js';
import { tEn } from '../i18n/index.js';
import { queueShot } from './shots.js';
import { sharingOptions, validateClassPick, setGameClasses, gameClassIds, shareableClasses, removedClassIds } from './schools.js';
import { getUser, isGrownup } from '../auth.js';

const CLASS_ERRORS = { pickClass: 'studio.api.pickClass', classGone: 'studio.api.classGone', classRemoved: 'studio.api.classRemoved' };

export function ensureScanned(version) {
  if (version.safety_status !== 'unchecked') return version;
  const report = scanVersion(version.html);
  q.run('UPDATE game_versions SET safety_status=?, safety_report=? WHERE id=?', report.status, JSON.stringify(report), version.id);
  return getVersion(version.id);
}

// What an approval covers. A person approving a 'family', 'class' or 'school' request judged the game for THAT audience only (it
// may name classmates, say), so the approval is stored with it and never stretches to a wider one. Model approvals only
// come from public requests (flagged versions always go to a person), and admin approvals from before this was stored
// always made games public, so both cover everything.
const WIDTH = { family: 1, class: 2, school: 3, public: 4 };
/** The class list waiting for a person (games.pending_classes), or null. */
export function pendingClasses(game) {
  if (!game || !game.pending_classes) return null;
  try { const v = JSON.parse(game.pending_classes); return Array.isArray(v) && v.every(x => typeof x === 'string') ? v : null; } catch { return null; }
}
function approvalScope(version) {
  if (!version || version.review_status !== 'approved') return null;
  let r = {}; try { r = JSON.parse(version.review_report || '{}') || {}; } catch { r = {}; }
  if (r.by === 'admin' && WIDTH[r.for]) return { vis: r.for, classes: Array.isArray(r.classes) ? r.classes : [] };
  return { vis: 'public', classes: [] };
}
/** Does this approval cover sharing at `visibility` (with these classes, for 'class')? */
export function approvalCovers(scope, visibility, classIds = []) {
  if (!scope || !WIDTH[visibility]) return false;
  if (WIDTH[visibility] < WIDTH[scope.vis]) return true;
  if (visibility !== scope.vis) return false;
  if (visibility !== 'class') return true;
  const ok = new Set(scope.classes);
  return classIds.length > 0 && classIds.every(id => ok.has(id));
}

/**
 * Publish the game's current version at a sharing level.
 * classIds (visibility 'class' only): the classes to share with (an array of ids, checked against the owner's classes).
 * Left out, the game keeps its current list (Studio "Update", re-sending a waiting request).
 * Returns { ok, state: 'live'|'in_review'|'rejected'|'blocked', message, game }. message is in the language of opts.t.
 */
export async function publish(user, gameId, visibility, { versionId = null, t = tEn, classIds } = {}) {
  let game = getGame(gameId);
  if (!game) return { ok: false, state: 'blocked', message: t('game.api.notFound') };
  if (!VISIBILITIES.includes(visibility)) return { ok: false, state: 'blocked', message: t('studio.api.pickWho') };
  // School accounts follow their school's rules (e.g. games stay inside the school); 'class' needs a class to be in.
  const owner = getUser(game.owner_id);
  if (!sharingOptions(owner, game).includes(visibility)) return { ok: false, state: 'blocked', message: t(visibility === 'public' ? 'publish.schoolOnly' : visibility === 'class' ? 'studio.api.classGone' : 'studio.api.pickWho') };
  let pick = null;   // the new class list (null: keep the current one)
  // Re-sending a waiting class request (Studio "Update") keeps the class list that is waiting.
  if (visibility === 'class' && classIds === undefined && game.pending_visibility === 'class') classIds = pendingClasses(game) || undefined;
  if (visibility === 'class' && classIds !== undefined) {
    const c = validateClassPick(owner, game.id, classIds);
    if (!c.ok) return { ok: false, state: 'blocked', code: c.code, message: t(CLASS_ERRORS[c.code], { name: c.name || '' }) };
    pick = c.ids;
  }
  let version = getVersion(versionId || game.current_version_id);
  if (!version || version.game_id !== game.id) return { ok: false, state: 'blocked', message: t('publish.buildFirst') };
  version = ensureScanned(version);
  if (version.safety_status === 'fail') {
    return { ok: false, state: 'blocked', message: t('publish.failedScan'), report: JSON.parse(version.safety_report || '{}') };
  }
  const wasLive = game.status === 'published' && !!game.published_version_id;

  // 'family', 'school' and 'class' are groups of children who didn't opt in (a class page lists the game for everyone in
  // it; a grown-up's game reaches their linked children's home pages), so a flagged (or not-yet-approved) version needs
  // a human look first, the same as public. Private and friends stay instant (both sides chose them); a clean or
  // already-approved family, school or class version is instant too.
  const group = visibility === 'school' || visibility === 'class' || visibility === 'family';
  const scope = approvalScope(version);
  const covered = approvalCovers(scope, visibility, visibility === 'class' ? (pick || gameClassIds(game.id)) : []);
  const instant = visibility === 'private' || visibility === 'friends' || (group && (version.safety_status === 'pass' || covered));
  const classesLine = visibility === 'class' ? { classes: pick || undefined } : {};
  if (visibility !== 'public' && instant) {
    tx(() => {
      if (pick) setGameClasses(game.id, pick, user.id);
      q.run("UPDATE games SET visibility=?, status='published', published_version_id=?, pending_version_id=NULL, pending_visibility='', pending_classes='', review_note='', published_at=COALESCE(published_at, ?), updated_at=? WHERE id=?", visibility, version.id, now(), now(), game.id);
    });
    audit(user.id, wasLive ? 'game.update' : 'game.publish', game.id, { visibility, version: version.number, ...classesLine });
    queueShot(version.id);
    return { ok: true, state: 'live', message: liveMessage(visibility, game, t), game: getGame(game.id) };
  }

  // Public (or a flagged 'family', 'school' or 'class' version): reuse an earlier approval of this exact version if it covers this
  // audience, otherwise review (a flagged version is never auto-approved: services/review.js sends it to the human queue).
  let approved = covered;
  if (!covered) {
    const verdict = await reviewVersion(game, version);
    if (verdict.verdict === 'allowed') {
      q.run("UPDATE game_versions SET review_status='approved', review_report=? WHERE id=?", JSON.stringify(verdict), version.id);
      approved = true;
    } else if (verdict.verdict === 'needs_changes' || verdict.verdict === 'blocked') {
      q.run("UPDATE game_versions SET review_status='rejected', review_report=? WHERE id=?", JSON.stringify(verdict), version.id);
      q.run('UPDATE games SET review_note=?, updated_at=? WHERE id=?', (verdict.reasons || []).join(' ').slice(0, 500), now(), game.id);
      audit(user.id, 'game.review_rejected', game.id, verdict);
      return { ok: false, state: 'rejected', message: t('publish.rejected'), reasons: verdict.reasons || [], game: getGame(game.id) };
    } else if (!scope) {
      // Waiting for a person. A narrower approval this version already has is kept (it still covers that audience).
      q.run("UPDATE game_versions SET review_status='queued', review_report=? WHERE id=?", JSON.stringify(verdict), version.id);
    }
    version = getVersion(version.id);
  }
  if (approved) {
    tx(() => {
      if (pick) setGameClasses(game.id, pick, user.id);
      q.run("UPDATE games SET visibility=?, status='published', published_version_id=?, pending_version_id=NULL, pending_visibility='', pending_classes='', review_note='', published_at=COALESCE(published_at, ?), updated_at=? WHERE id=?", visibility, version.id, now(), now(), game.id);
    });
    audit(user.id, wasLive ? 'game.update' : 'game.publish', game.id, { visibility, version: version.number, reviewed: 'model', ...classesLine });
    queueShot(version.id);
    return { ok: true, state: 'live', message: visibility !== 'public' ? liveMessage(visibility, game, t) : wasLive ? t('publish.updateLive') : t('publish.public'), game: getGame(game.id) };
  }
  // Waiting for a human. If it was already live, it stays live (at its old visibility) on the old version.
  // pending_visibility says what the review is for. A new class list for a game already live at 'class' waits in
  // pending_classes until a person approves it (its approval may cover fewer classes); otherwise links don't count yet
  // (they only count while games.visibility='class'), so the list is written at once.
  const liveForClasses = wasLive && game.visibility === 'class';
  tx(() => {
    if (pick && !liveForClasses) setGameClasses(game.id, pick, user.id);
    q.run('UPDATE games SET pending_classes=? WHERE id=?', pick && liveForClasses ? JSON.stringify(pick) : '', game.id);
    if (wasLive) q.run("UPDATE games SET pending_version_id=?, pending_visibility=?, review_note='', updated_at=? WHERE id=?", version.id, visibility, now(), game.id);
    else q.run("UPDATE games SET status='in_review', pending_version_id=?, pending_visibility=?, review_note='', updated_at=? WHERE id=?", version.id, visibility, now(), game.id);
    if (!scope) q.run("UPDATE game_versions SET review_status='queued' WHERE id=?", version.id);
  });
  audit(user.id, 'game.submit_review', game.id, { version: version.number, update: wasLive, visibility, ...classesLine });
  return { ok: true, state: 'in_review', message: wasLive ? t('publish.updateWaiting') : t('publish.waiting'), game: getGame(game.id) };
}
/** "Live for 5B!" / "Live for your classes!" / "Live for your school!" … after a level went live without a review. */
function liveMessage(visibility, game, t) {
  const gameId = game.id;
  if (visibility === 'private') return t('publish.private');
  // A grown-up's 'friends' are their grown-up connections (other grown-ups only), and their Studio says so.
  if (visibility === 'friends') return t(isGrownup(getUser(game.owner_id)) ? 'publish.liveConnections' : 'publish.friends');
  if (visibility === 'family') return t('publish.liveFamily');
  if (visibility === 'school') return t('publish.school');
  if (visibility === 'class') {
    // The classes it reaches now (none: every chosen class was left or taken off, so in effect only the owner can play it).
    const names = liveClasses(gameId).map(c => c.name);
    return names.length ? t('publish.class', { count: names.length, name: names[0] }) : t('publish.private');
  }
  return t('publish.public');
}

/** The audience an approval may apply: what the review was for ('public' for reviews from before pending_visibility),
 *  narrowed if the owner may no longer share that widely (e.g. their school now keeps games inside the school). */
function approvedAudience(game) {
  const want = game.pending_visibility || 'public';
  const opts = sharingOptions(getUser(game.owner_id), game);
  if (opts.includes(want)) return want;
  if (want === 'public' && opts.includes('school')) return 'school';
  return 'private';
}
/** Admin approves the pending version: it goes live for the audience the builder asked for (pending_visibility). */
export function approve(admin, gameId, note = '') {
  const game = getGame(gameId); if (!game || !game.pending_version_id) return null;
  const vis = approvedAudience(game);
  // A waiting class list (pending_classes) is applied now, minus classes the owner left or a teacher took it off since.
  const waiting = vis === 'class' ? pendingClasses(game) : null;
  const okIds = waiting ? (() => { const mine = new Set(shareableClasses(game.owner_id).map(c => c.id)); const off = new Set(removedClassIds(game.id)); return waiting.filter(id => mine.has(id) && !off.has(id)); })() : null;
  // Record what this approval was for (see approvalScope): it never stretches to a wider audience later.
  const scope = WIDTH[vis] ? { for: vis, ...(vis === 'class' ? { classes: okIds || gameClassIds(game.id) } : {}) } : {};
  tx(() => {
    if (okIds && okIds.length) setGameClasses(game.id, okIds, admin.id);
    q.run("UPDATE game_versions SET review_status='approved', review_report=? WHERE id=?", JSON.stringify({ verdict: 'allowed', by: 'admin', note, ...scope }), game.pending_version_id);
    q.run("UPDATE games SET visibility=?, status='published', published_version_id=pending_version_id, pending_version_id=NULL, pending_visibility='', pending_classes='', review_note=?, published_at=COALESCE(published_at, ?), updated_at=? WHERE id=?", vis, String(note).slice(0, 500), now(), now(), game.id);
  });
  audit(admin.id, 'admin.approve', game.id, { note, visibility: vis });
  queueShot(game.pending_version_id);
  return getGame(game.id);
}
/** Admin rejects: the builder sees the note. A live game keeps its old version. */
export function reject(admin, gameId, note = '') {
  const game = getGame(gameId); if (!game) return null;
  tx(() => {
    if (game.pending_version_id) q.run("UPDATE game_versions SET review_status='rejected', review_report=? WHERE id=?", JSON.stringify({ verdict: 'needs_changes', by: 'admin', reasons: [note] }), game.pending_version_id);
    const live = game.status === 'published' && game.published_version_id;
    q.run(`UPDATE games SET pending_version_id=NULL, pending_visibility='', pending_classes='', review_note=?, status=?, updated_at=? WHERE id=?`, String(note || 'Needs changes.').slice(0, 500), live ? 'published' : 'rejected', now(), game.id);
  });
  audit(admin.id, 'admin.reject', game.id, { note });
  return getGame(game.id);
}
/** Change who can see a live game without changing its version (and, for 'class', which classes). Moving to public
 *  re-reviews an unreviewed version. */
export async function setVisibility(user, gameId, visibility, t = tEn, classIds) {
  const game = getGame(gameId); if (!game) return { ok: false, message: t('game.api.notFound') };
  if (!game.published_version_id || game.status !== 'published') return publish(user, gameId, visibility, { t, classIds });
  return publish(user, gameId, visibility, { versionId: game.published_version_id, t, classIds });
}
