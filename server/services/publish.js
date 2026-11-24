// Publishing and updating games. This is the one place that moves a version live.
//
// Rules:
//  - current_version_id is what the Studio edits; published_version_id is what players get.
//  - Every version must pass the static scan before it can go live at any level.
//  - ...and the Builder's playthrough (services/playthrough.js): it was played all the way to its end. A version with no
//    result yet is played now; a failure is refused with what happened and the words for "Ask the Builder to fix it".
//    Only a platform admin may publish anyway (opts.override, after a confirm on the page), and that is audited.
//  - Private / Friends: static scan is enough; goes live at once (a grown-up's friends are other grown-ups only).
//  - Family / Class / School (a group of children who didn't opt in): a clean ('pass') or already-approved version goes
//    live at once; a flagged one waits for a human, like public. 'family' is a grown-up builder's linked children;
//    'class' also needs the chosen classes (schools.validateClassPick).
//  - A grown-up's games go through exactly this pipeline too: nothing here depends on who the owner is.
//  - Public: needs a person on the Oomba team (a platform admin) to approve it (docs/decisions.md "Admin approval before a
//    game goes public"). The model review (services/review.js) still runs first when it is set up: it sends a game back
//    at once when it finds a problem, and its "allowed" is only a hint for the admin; the version always waits in the
//    admin review queue (pending_version_id). A game that isn't live yet goes live for the builder's friends at once while
//    it waits (friends sharing is instant anyway). Only a team approval (or a grandfathered or seed one) covers public.
//  - PUBLIC_GAMES off (the default; services/games.js openToAll): 'public' and 'school' are refused, except an official
//    game and a player's game already live at that level from before (now its maker's connections and classes), which updates like a
//    'class' game.
//  - games.pending_visibility records what a waiting review is for; approval applies exactly that audience.
//  - UPDATING a game that is already live: the old published version keeps playing for everyone
//    while the new one is reviewed; when approved it replaces it. Builders can update forever.
import { q, now, tx, audit } from '../db.js';
import { getGame, getVersion, VISIBILITIES, liveClasses } from './games.js';
import { config } from '../config.js';
import { scanVersion } from './scanner.js';
import { reviewVersion } from './review.js';
import { tEn } from '../i18n/index.js';
import { queueShot } from './shots.js';
import { sharingOptions, validateClassPick, setGameClasses, gameClassIds, shareableClasses, removedClassIds } from './schools.js';
import { getUser, isGrownup } from '../auth.js';
import * as team from './team.js';
import { REVIEW_REASONS } from './chat.js';
import { alert as adminAlert } from './admin-alerts.js';
import * as playthrough from './playthrough.js';

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
/** Does this version have the team's approval for everyone? (Studio, tests.) */
export const approvedForPublic = version => { const s = approvalScope(version); return !!s && s.vis === 'public'; };
/** The class list waiting for a person (games.pending_classes), or null. */
export function pendingClasses(game) {
  if (!game || !game.pending_classes) return null;
  try { const v = JSON.parse(game.pending_classes); return Array.isArray(v) && v.every(x => typeof x === 'string') ? v : null; } catch { return null; }
}
function approvalScope(version) {
  if (!version || version.review_status !== 'approved') return null;
  let r = {}; try { r = JSON.parse(version.review_report || '{}') || {}; } catch { r = {}; }
  if (r.by === 'admin' && WIDTH[r.for]) return { vis: r.for, classes: Array.isArray(r.classes) ? r.classes : [] };
  if (r.by === 'admin' || r.by === 'seed-import') return { vis: 'public', classes: [] };
  // A model approval (from before the team approved every public game): it still covers every group, never public.
  return { vis: 'school', classes: [] };
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
 * Returns { ok, state: 'live'|'in_review'|'rejected'|'blocked'|'unplayed', message, game }. message is in the language of
 * opts.t. 'unplayed' (the playthrough did not reach the end) also has code ('playthrough', or 'playBusy' when no browser
 * was free), ask (the chat message that asks the Builder to fix it) and canOverride (an admin).
 * override: an admin publishes a version that was not played all the way through (never a teacher or a kid).
 */
export async function publish(user, gameId, visibility, { versionId = null, t = tEn, classIds, override = false } = {}) {
  let game = getGame(gameId);
  if (!game) return { ok: false, state: 'blocked', message: t('game.api.notFound') };
  if (!VISIBILITIES.includes(visibility)) return { ok: false, state: 'blocked', message: t('studio.api.pickWho') };
  // School accounts follow their school's rules (e.g. games stay inside the school); 'class' needs a class to be in.
  const owner = getUser(game.owner_id);
  // PUBLIC_GAMES off (services/games.js openToAll): nobody shares a game with everyone. Two exceptions keep 'public': an
  // official game, and a player's game already live at 'public' from before (now its maker's connections and classes),
  // so its maker can still update it without choosing again. It is then a group of people who didn't opt in, like 'class'.
  // 'school' (My school) is not offered either while PUBLIC_GAMES is off, with the same exception for a game live at it.
  const asGroup = visibility === 'public' && !config.publicGames && game.source !== 'seed';
  const wide = (visibility === 'public' || visibility === 'school') && !config.publicGames;
  const keepsLevel = wide && ((visibility === 'public' && game.source === 'seed') || (game.visibility === visibility && game.status === 'published' && !!game.published_version_id));
  if (!sharingOptions(owner, game).includes(visibility) && !keepsLevel) {
    if (wide) return { ok: false, state: 'blocked', code: visibility === 'public' ? 'noPublic' : 'noSchool', message: t('publish.noPublic') };
    return { ok: false, state: 'blocked', message: t(visibility === 'public' ? 'publish.schoolOnly' : visibility === 'class' ? 'studio.api.classGone' : 'studio.api.pickWho') };
  }
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
  // Played all the way through: this exact version reached the game's end (played now if it never was).
  const admin = !!user && user.role === 'admin';
  if (override && admin && playthrough.resultOf(version).status !== 'pass') {
    audit(user.id, 'game.playthrough_override', game.id, { version: version.number, was: playthrough.resultOf(version).status || 'none' });
  } else {
    const played = await playthrough.ensure(version, game);
    if (!played.ok) {
      const w = playthrough.blockedWords(played, t);
      return { ok: false, state: 'unplayed', code: played.code === 'busy' ? 'playBusy' : 'playthrough', message: w.message, ask: w.ask, canOverride: admin };
    }
    game = getGame(gameId) || game;   // the playthrough took a while: what the game looks like now
  }
  const wasLive = game.status === 'published' && !!game.published_version_id;

  // 'family', 'school' and 'class' are groups of children who didn't opt in (a class page lists the game for everyone in
  // it; a grown-up's game reaches their linked children's home pages), so a flagged (or not-yet-approved) version needs
  // a human look first, the same as public. Private and friends stay instant (both sides chose them); a clean or
  // already-approved family, school or class version is instant too.
  const group = visibility === 'school' || visibility === 'class' || visibility === 'family' || asGroup;
  const scope = approvalScope(version);
  const covered = approvalCovers(scope, visibility, visibility === 'class' ? (pick || gameClassIds(game.id)) : []);
  const instant = visibility === 'private' || visibility === 'friends' || (group && (version.safety_status === 'pass' || covered));
  const classesLine = visibility === 'class' ? { classes: pick || undefined } : {};
  if ((visibility !== 'public' || asGroup) && instant) {
    tx(() => {
      if (pick) setGameClasses(game.id, pick, user.id);
      q.run("UPDATE games SET visibility=?, status='published', published_version_id=?, pending_version_id=NULL, pending_visibility='', pending_classes='', review_note='', review_reason='', published_at=COALESCE(published_at, ?), updated_at=? WHERE id=?", visibility, version.id, now(), now(), game.id);
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
    // Public waits for the team even when the model says "allowed" (kept on the version as a hint for the admin).
    if (verdict.verdict === 'allowed' && (visibility !== 'public' || asGroup)) {
      q.run("UPDATE game_versions SET review_status='approved', review_report=? WHERE id=?", JSON.stringify(verdict), version.id);
      approved = true;
    } else if (verdict.verdict === 'needs_changes' || verdict.verdict === 'blocked') {
      q.run("UPDATE game_versions SET review_status='rejected', review_report=? WHERE id=?", JSON.stringify(verdict), version.id);
      q.run("UPDATE games SET review_note=?, review_reason='', updated_at=? WHERE id=?", (verdict.reasons || []).join(' ').slice(0, 500), now(), game.id);
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
      q.run("UPDATE games SET visibility=?, status='published', published_version_id=?, pending_version_id=NULL, pending_visibility='', pending_classes='', review_note='', review_reason='', published_at=COALESCE(published_at, ?), updated_at=? WHERE id=?", visibility, version.id, now(), now(), game.id);
    });
    audit(user.id, wasLive ? 'game.update' : 'game.publish', game.id, { visibility, version: version.number, reviewed: 'model', ...classesLine });
    queueShot(version.id);
    return { ok: true, state: 'live', message: visibility !== 'public' || asGroup ? liveMessage(visibility, game, t) : wasLive ? t('publish.updateLive') : t('publish.public'), game: getGame(game.id) };
  }
  // Waiting for a human. If it was already live, it stays live (at its old visibility) on the old version.
  // pending_visibility says what the review is for. A new class list for a game already live at 'class' waits in
  // pending_classes until a person approves it (its approval may cover fewer classes); otherwise links don't count yet
  // (they only count while games.visibility='class'), so the list is written at once.
  const liveForClasses = wasLive && game.visibility === 'class';
  // A public request for a game that isn't live yet: friends can play it at once while it waits (sharing with friends is
  // instant at any time; this saves the builder a second step and keeps the public request).
  const friendsNow = !wasLive && visibility === 'public' && sharingOptions(owner, game).includes('friends');
  tx(() => {
    if (pick && !liveForClasses) setGameClasses(game.id, pick, user.id);
    q.run('UPDATE games SET pending_classes=? WHERE id=?', pick && liveForClasses ? JSON.stringify(pick) : '', game.id);
    if (wasLive) q.run("UPDATE games SET pending_version_id=?, pending_visibility=?, review_note='', review_reason='', updated_at=? WHERE id=?", version.id, visibility, now(), game.id);
    else if (friendsNow) q.run("UPDATE games SET status='published', visibility='friends', published_version_id=?, pending_version_id=?, pending_visibility=?, review_note='', review_reason='', published_at=COALESCE(published_at, ?), updated_at=? WHERE id=?", version.id, version.id, visibility, now(), now(), game.id);
    else q.run("UPDATE games SET status='in_review', pending_version_id=?, pending_visibility=?, review_note='', review_reason='', updated_at=? WHERE id=?", version.id, visibility, now(), game.id);
    if (!scope) q.run("UPDATE game_versions SET review_status='queued' WHERE id=?", version.id);
  });
  if (friendsNow) queueShot(version.id);
  audit(user.id, 'game.submit_review', game.id, { version: version.number, update: wasLive, visibility, ...(friendsNow ? { friendsNow: true } : {}), ...classesLine });
  adminAlert('review', { ref: game.id, summary: wasLive ? 'update' : 'new' });   // never throws (services/admin-alerts.js)
  const waitMsg = friendsNow ? t(isGrownup(owner) ? 'publish.waitingTeamGrownup' : 'publish.waitingTeam') : wasLive ? t('publish.updateWaiting') : t('publish.waiting');
  return { ok: true, state: 'in_review', message: waitMsg, game: getGame(game.id) };
}
/** "Live for 5B!" / "Live for your classes!" / "Live for your school!" … after a level went live without a review. */
function liveMessage(visibility, game, t) {
  const gameId = game.id;
  if (visibility === 'private') return t('publish.private');
  // A grown-up's 'friends' are their grown-up connections (other grown-ups only), and their Studio says so.
  if (visibility === 'friends') return t(isGrownup(getUser(game.owner_id)) ? 'publish.liveConnections' : 'publish.friends');
  if (visibility === 'family') return t('publish.liveFamily');
  if (visibility === 'school') return t(config.publicGames ? 'publish.school' : 'publish.liveConnectionsClasses');
  if (visibility === 'class') {
    // The classes it reaches now (none: every chosen class was left or taken off, so in effect only the owner can play it).
    const names = liveClasses(gameId).map(c => c.name);
    return names.length ? t('publish.class', { count: names.length, name: names[0] }) : t('publish.private');
  }
  // A player's game left at 'public' from before, while PUBLIC_GAMES is off: its maker's connections and classes.
  if (!config.publicGames && game.source !== 'seed') return t('publish.liveConnectionsClasses');
  return t('publish.public');
}

/** The audience an approval may apply: what the review was for ('public' for reviews from before pending_visibility),
 *  narrowed if the owner may no longer share that widely (e.g. their school now keeps games inside the school). */
function approvedAudience(game) {
  const want = game.pending_visibility || 'public';
  const opts = sharingOptions(getUser(game.owner_id), game);
  if (opts.includes(want)) return want;
  // PUBLIC_GAMES off: a request for everyone or the school (sent before) never widens a game. A game already live at
  // 'public' or 'school' keeps it (now its maker's connections and classes); any other keeps the level it is live at, else friends.
  if ((want === 'public' || want === 'school') && !config.publicGames) {
    const live = game.status === 'published' && !!game.published_version_id;
    if (live && (game.visibility === 'public' || game.visibility === 'school' || opts.includes(game.visibility))) return game.visibility;
    return opts.includes('friends') ? 'friends' : 'private';
  }
  if (want === 'public' && opts.includes('school')) return 'school';
  return 'private';
}
/** Admin approves the pending version: it goes live for the audience the builder asked for (pending_visibility). The
 *  builder gets a notice in their Oomba team inbox. */
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
    q.run("UPDATE games SET visibility=?, status='published', published_version_id=pending_version_id, pending_version_id=NULL, pending_visibility='', pending_classes='', review_note=?, review_reason='', published_at=COALESCE(published_at, ?), updated_at=? WHERE id=?", vis, String(note).slice(0, 500), now(), now(), game.id);
  });
  audit(admin.id, 'admin.approve', game.id, { note, visibility: vis });
  queueShot(game.pending_version_id);
  team.notify(game.owner_id, { k: 'approved', game: game.id, title: game.title, slug: game.slug, visibility: vis });
  return getGame(game.id);
}
/** Admin sends it back: the builder sees the reason (a preset, chat.js REVIEW_REASONS, in their language) and the note,
 *  in the Studio and as a notice in their Oomba team inbox. A live game keeps its old version. */
export function reject(admin, gameId, note = '', reason = '') {
  const game = getGame(gameId); if (!game) return null;
  const why = REVIEW_REASONS.includes(reason) ? reason : '';
  const text = String(note || '').slice(0, 500);
  tx(() => {
    if (game.pending_version_id) q.run("UPDATE game_versions SET review_status='rejected', review_report=? WHERE id=?", JSON.stringify({ verdict: 'needs_changes', by: 'admin', reasons: [text || tEn(`review.reasons.${why || 'other'}`)], reason: why || undefined }), game.pending_version_id);
    const live = game.status === 'published' && game.published_version_id;
    q.run(`UPDATE games SET pending_version_id=NULL, pending_visibility='', pending_classes='', review_note=?, review_reason=?, status=?, updated_at=? WHERE id=?`, text || (why ? '' : 'Needs changes.'), why, live ? 'published' : 'rejected', now(), game.id);
  });
  audit(admin.id, 'admin.reject', game.id, { note: text, reason: why || undefined });
  if (game.pending_version_id) team.notify(game.owner_id, { k: 'sentBack', game: game.id, title: game.title, slug: game.slug, reason: why, note: text });
  return getGame(game.id);
}
/** Change who can see a live game without changing its version (and, for 'class', which classes). Moving to public
 *  re-reviews an unreviewed version. */
export async function setVisibility(user, gameId, visibility, t = tEn, classIds, { override = false } = {}) {
  const game = getGame(gameId); if (!game) return { ok: false, message: t('game.api.notFound') };
  if (!game.published_version_id || game.status !== 'published') return publish(user, gameId, visibility, { t, classIds, override });
  return publish(user, gameId, visibility, { versionId: game.published_version_id, t, classIds, override });
}
