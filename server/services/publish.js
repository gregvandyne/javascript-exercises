// Publishing and updating games. This is the one place that moves a version live.
//
// Rules:
//  - current_version_id is what the Studio edits; published_version_id is what players get.
//  - Every version must pass the static scan before it can go live at any level.
//  - Private / Friends: static scan is enough; goes live at once.
//  - Public: also needs a model review (services/review.js). If the model is unavailable the
//    version waits in the admin review queue (pending_version_id).
//  - UPDATING a game that is already live: the old published version keeps playing for everyone
//    while the new one is reviewed; when approved it replaces it. Builders can update forever.
import { q, now, tx, audit } from '../db.js';
import { getGame, getVersion } from './games.js';
import { scanVersion } from './scanner.js';
import { reviewVersion } from './review.js';
import { tEn } from '../i18n/index.js';
import { queueShot } from './shots.js';
import { sharingOptions } from './schools.js';
import { getUser } from '../auth.js';

export function ensureScanned(version) {
  if (version.safety_status !== 'unchecked') return version;
  const report = scanVersion(version.html);
  q.run('UPDATE game_versions SET safety_status=?, safety_report=? WHERE id=?', report.status, JSON.stringify(report), version.id);
  return getVersion(version.id);
}

/**
 * Publish the game's current version at a sharing level.
 * Returns { ok, state: 'live'|'in_review'|'rejected'|'blocked', message, game }. message is in the language of opts.t.
 */
export async function publish(user, gameId, visibility, { versionId = null, t = tEn } = {}) {
  let game = getGame(gameId);
  if (!game) return { ok: false, state: 'blocked', message: t('game.api.notFound') };
  if (!['private', 'friends', 'school', 'public'].includes(visibility)) return { ok: false, state: 'blocked', message: t('studio.api.pickWho') };
  // School accounts follow their school's rules (e.g. games stay inside the school).
  if (!sharingOptions(getUser(game.owner_id)).includes(visibility)) return { ok: false, state: 'blocked', message: t(visibility === 'public' ? 'publish.schoolOnly' : 'studio.api.pickWho') };
  let version = getVersion(versionId || game.current_version_id);
  if (!version || version.game_id !== game.id) return { ok: false, state: 'blocked', message: t('publish.buildFirst') };
  version = ensureScanned(version);
  if (version.safety_status === 'fail') {
    return { ok: false, state: 'blocked', message: t('publish.failedScan'), report: JSON.parse(version.safety_report || '{}') };
  }
  const wasLive = game.status === 'published' && !!game.published_version_id;

  if (visibility !== 'public') {
    tx(() => {
      q.run("UPDATE games SET visibility=?, status='published', published_version_id=?, pending_version_id=NULL, review_note='', published_at=COALESCE(published_at, ?), updated_at=? WHERE id=?", visibility, version.id, now(), now(), game.id);
    });
    audit(user.id, wasLive ? 'game.update' : 'game.publish', game.id, { visibility, version: version.number });
    queueShot(version.id);
    return { ok: true, state: 'live', message: visibility === 'private' ? t('publish.private') : visibility === 'school' ? t('publish.school') : t('publish.friends'), game: getGame(game.id) };
  }

  // Public: reuse an earlier approval of this exact version, otherwise review.
  if (version.review_status !== 'approved') {
    const verdict = await reviewVersion(game, version);
    q.run('UPDATE game_versions SET review_status=?, review_report=? WHERE id=?',
      verdict.verdict === 'allowed' ? 'approved' : verdict.verdict === 'unavailable' ? 'queued' : 'rejected', JSON.stringify(verdict), version.id);
    version = getVersion(version.id);
    if (verdict.verdict === 'needs_changes' || verdict.verdict === 'blocked') {
      q.run('UPDATE games SET review_note=?, updated_at=? WHERE id=?', (verdict.reasons || []).join(' ').slice(0, 500), now(), game.id);
      audit(user.id, 'game.review_rejected', game.id, verdict);
      return { ok: false, state: 'rejected', message: t('publish.rejected'), reasons: verdict.reasons || [], game: getGame(game.id) };
    }
  }
  if (version.review_status === 'approved') {
    tx(() => {
      q.run("UPDATE games SET visibility='public', status='published', published_version_id=?, pending_version_id=NULL, review_note='', published_at=COALESCE(published_at, ?), updated_at=? WHERE id=?", version.id, now(), now(), game.id);
    });
    audit(user.id, wasLive ? 'game.update' : 'game.publish', game.id, { visibility: 'public', version: version.number, reviewed: 'model' });
    queueShot(version.id);
    return { ok: true, state: 'live', message: wasLive ? t('publish.updateLive') : t('publish.public'), game: getGame(game.id) };
  }
  // Waiting for a human. If it was already live, it stays live (at its old visibility) on the old version.
  tx(() => {
    if (wasLive) q.run("UPDATE games SET pending_version_id=?, review_note='', updated_at=? WHERE id=?", version.id, now(), game.id);
    else q.run("UPDATE games SET status='in_review', pending_version_id=?, review_note='', updated_at=? WHERE id=?", version.id, now(), game.id);
    q.run("UPDATE game_versions SET review_status='queued' WHERE id=?", version.id);
  });
  audit(user.id, 'game.submit_review', game.id, { version: version.number, update: wasLive });
  return { ok: true, state: 'in_review', message: wasLive ? t('publish.updateWaiting') : t('publish.waiting'), game: getGame(game.id) };
}

/** Admin approves the pending version: it becomes the public published version. */
export function approve(admin, gameId, note = '') {
  const game = getGame(gameId); if (!game || !game.pending_version_id) return null;
  tx(() => {
    q.run("UPDATE game_versions SET review_status='approved', review_report=? WHERE id=?", JSON.stringify({ verdict: 'allowed', by: 'admin', note }), game.pending_version_id);
    q.run("UPDATE games SET visibility='public', status='published', published_version_id=pending_version_id, pending_version_id=NULL, review_note=?, published_at=COALESCE(published_at, ?), updated_at=? WHERE id=?", String(note).slice(0, 500), now(), now(), game.id);
  });
  audit(admin.id, 'admin.approve', game.id, { note });
  queueShot(game.pending_version_id);
  return getGame(game.id);
}
/** Admin rejects: the builder sees the note. A live game keeps its old version. */
export function reject(admin, gameId, note = '') {
  const game = getGame(gameId); if (!game) return null;
  tx(() => {
    if (game.pending_version_id) q.run("UPDATE game_versions SET review_status='rejected', review_report=? WHERE id=?", JSON.stringify({ verdict: 'needs_changes', by: 'admin', reasons: [note] }), game.pending_version_id);
    const live = game.status === 'published' && game.published_version_id;
    q.run(`UPDATE games SET pending_version_id=NULL, review_note=?, status=?, updated_at=? WHERE id=?`, String(note || 'Needs changes.').slice(0, 500), live ? 'published' : 'rejected', now(), game.id);
  });
  audit(admin.id, 'admin.reject', game.id, { note });
  return getGame(game.id);
}
/** Change who can see a live game without changing its version. Moving to public re-reviews an unreviewed version. */
export async function setVisibility(user, gameId, visibility, t = tEn) {
  const game = getGame(gameId); if (!game) return { ok: false, message: t('game.api.notFound') };
  if (!game.published_version_id || game.status !== 'published') return publish(user, gameId, visibility, { t });
  return publish(user, gameId, visibility, { versionId: game.published_version_id, t });
}
