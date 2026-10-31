// Oomba Live: who may host, which games each audience may run, who may join, and how names show
// (docs/decisions.md "Oomba Live", docs/safety.md §12). Every rule is a small function with no side effects, so the
// whole matrix is unit-tested (tests/unit/live-access.test.js).
//
// Audiences, chosen when a session is made:
//   class   a teacher's own class: only signed-in active students of that class join. No guests.
//   family  a grown-up's family: only the family's linked children (and the host) join.
//   open    anyone with the code. Guests play without an account; everyone, signed in or not, shows as a nickname.
import { isGrownup, OFFICIAL } from '../auth.js';
import { q } from '../db.js';
import * as S from './schools.js';
import * as games from './games.js';
import { familyOfOwner, familiesOn } from './family.js';
import { config } from '../config.js';

export const AUDIENCES = ['open', 'class', 'family'];
/** Built-in modes, and the official game each one runs as (seed-games/<slug>.html). */
export const MODES = { 'quest-race': 'quest-race', battle: 'question-battle' };
/** The most players a grown-up's open room may have, whatever LIVE_MAX_PLAYERS says (self-declared adults). */
export const GROWNUP_OPEN_MAX = 30;

/** Teachers and school admins, grown-ups and the platform admin. Kids and guests never host. */
export const canHost = u => !!u && !u.is_guest && !u.banned && (S.isStaff(u) || isGrownup(u) || S.isPlatformAdmin(u));

/** A launch game: made by the official account from seed-games/. */
export function isOfficial(game) {
  if (!game || game.source !== 'seed') return false;
  const o = q.get('SELECT username FROM users WHERE id=?', game.owner_id);
  return !!o && o.username === OFFICIAL;
}

/** The family a grown-up host owns (only while families are on), or null. */
const hostFamily = host => (isGrownup(host) && familiesOn() ? familyOfOwner(host.id) : null);

/**
 * Can host open a room for this audience? opts: { classId }. -> null when fine, or a refusal code:
 * 'audience' (unknown), 'notTeacher' (class: not a teacher of it), 'noFamily' (family: no family).
 */
export function audienceRefusal(host, audience, { classId = null } = {}) {
  if (!AUDIENCES.includes(audience)) return 'audience';
  if (audience === 'class') {
    const c = classId && S.getClass(classId);
    if (!c || c.archived_at || !S.teaches(host, c.id)) return 'notTeacher';
  }
  if (audience === 'family' && !hostFamily(host)) return 'noFamily';
  return null;
}

/**
 * May this host run this game for this audience? -> { ok: true, versionId } | { ok: false, code }.
 * Official games: any audience. Other games: their published version only, and the room must be one where its players
 * can see it: open rooms run public games only (reviewed); class rooms games that reach the class (class or school
 * sharing, or public); family rooms the host's family games (or public). The host must be able to see it too.
 */
export function hostable(host, game, audience, { classId = null } = {}) {
  if (!game || game.status === 'deleted') return { ok: false, code: 'notFound' };
  if (isOfficial(game)) return game.published_version_id ? { ok: true, versionId: game.published_version_id, official: true } : { ok: false, code: 'notFound' };
  if (!game.published_version_id || game.status !== 'published' || game.hidden_reason) return { ok: false, code: 'notPublished' };
  if (!games.canView(host, game)) return { ok: false, code: 'notFound' };
  const vis = game.visibility;
  if (vis === 'public') return { ok: true, versionId: game.published_version_id };
  if (audience === 'open') return { ok: false, code: 'notPublic' };
  if (audience === 'class') {
    if (vis === 'class' && classId && games.gameLiveInClass(game.id, classId)) return { ok: true, versionId: game.published_version_id };
    if (vis === 'school') {
      const c = classId && S.getClass(classId);
      if (c && S.membership(c.school_id, game.owner_id)) return { ok: true, versionId: game.published_version_id };
    }
    return { ok: false, code: 'notShared' };
  }
  if (audience === 'family') return vis === 'family' && game.owner_id === host.id ? { ok: true, versionId: game.published_version_id } : { ok: false, code: 'notShared' };
  return { ok: false, code: 'notShared' };
}

/** 'accounts' only in a class room hosted by a teacher of that class; everywhere else 'nicknames' (everyone). */
export const nameMode = (host, audience, classId) => (audience === 'class' && classId && S.teaches(host, classId) ? 'accounts' : 'nicknames');

/** The most players this room may have. */
export function maxPlayersFor(host, audience, asked) {
  let max = Math.min(config.liveMaxPlayers, Number.isInteger(asked) && asked >= 2 ? asked : config.liveMaxPlayers);
  if (audience === 'open' && isGrownup(host) && !S.isStaff(host)) max = Math.min(max, GROWNUP_OPEN_MAX);
  return max;
}

/**
 * May this person take a seat? user: the signed-in account, or null (a guest; a guest-cookie account counts as null).
 * -> { ok: true, kind: 'student'|'member'|'account'|'guest' } | { ok: false, code: 'signIn'|'notMember' }
 */
export function joinCheck(session, user) {
  const u = user && !user.is_guest && !user.banned ? user : null;
  if (session.audience === 'class') {
    if (!u) return { ok: false, code: 'signIn' };
    const m = S.classMember(session.classId, u.id);
    const c = S.getClass(session.classId);
    if (!m || m.role !== 'student' || !c || !S.canViewClass(u, c)) return { ok: false, code: 'notMember' };
    return { ok: true, kind: 'student' };
  }
  if (session.audience === 'family') {
    if (!u) return { ok: false, code: 'signIn' };
    const fam = familyOfOwner(session.host.userId);
    const linked = fam && q.get("SELECT 1 FROM family_children WHERE family_id=? AND child_id=? AND status='linked' AND unlinked_at IS NULL", fam.id, u.id);
    if (!linked && u.id !== session.host.userId) return { ok: false, code: 'notMember' };
    return { ok: true, kind: 'member' };
  }
  return { ok: true, kind: u ? 'account' : 'guest' };
}

/** The game must still be visible to this player (a game hidden or unshared mid-session stops reaching them).
 *  Official games and built-in modes: always. */
export function seatCanView(session, user) {
  if (!session.gameId) return true;
  const g = games.getGame(session.gameId);
  if (!g) return false;
  if (session.official) return g.status !== 'deleted';
  const u = user && !user.is_guest ? user : null;
  return games.canView(u, g) && !g.hidden_reason;
}
