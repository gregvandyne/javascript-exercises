// Oomba Live: who may host, which games each audience may run, who may join, and how names show
// (docs/decisions.md "Oomba Live", docs/safety.md §12). Every rule is a small function with no side effects, so the
// whole matrix is unit-tested (tests/unit/live-access.test.js).
//
// Audiences, chosen when a session is made:
//   class   a teacher's own class: only signed-in active students of that class join. No guests.
//   family  a grown-up's family: only the family's linked children (and the host) join.
//   open    anyone with the code. Guests play without an account; everyone, signed in or not, shows as a nickname.
import { isGrownup, OFFICIAL, getUser } from '../auth.js';
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
    // The family is the creator's (session.owner), whoever runs the game now (part 4: a co-host may be the host).
    const owner = ownerOf(session);
    const fam = familyOfOwner(owner);
    const linked = fam && q.get("SELECT 1 FROM family_children WHERE family_id=? AND child_id=? AND status='linked' AND unlinked_at IS NULL", fam.id, u.id);
    if (!linked && u.id !== owner) return { ok: false, code: 'notMember' };
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

// ---------------------------------------------------------------- part 4: co-hosts (docs/decisions.md "Oomba Live, part 4")
/** The most co-hosts a session may have (pending invites count). */
export const COHOST_MAX = 3;
/** The session's creator: never changes (a handoff moves s.host, not s.owner). */
export const ownerOf = s => (s && (s.owner || (s.host && s.host.userId))) || null;
/** The seam for a future "second grown-up in a family" feature: today a family has exactly one grown-up, its owner
 *  (families.owner_id is unique), so no one else can co-host a family room. Tests stub it. */
export const hooks = { familyGrownups: fam => (fam ? [fam.owner_id] : []) };

/**
 * The tier a person would have as a controller of this session: 'full' (sees student details: the same rule that gives
 * the host account names, saved runs and support), 'limited' (controls only), or null (may not control it).
 *   class:  active staff (teacher or admin) of the class's school, never a student of the class; 'full' when they
 *           teach the class or are an admin of its school (the owner's call, docs/decisions.md). A platform admin's all-access does not count: school membership only.
 *   family: the owner ('full'), or another grown-up of the owner's family ('limited'; nobody today, see hooks).
 *   open:   the owner only. Guests, banned accounts and kids never control a session.
 */
export function controlTier(s, u) {
  if (!s || !u || u.is_guest || u.banned) return null;
  const owner = ownerOf(s);
  if (s.audience === 'class') {
    const c = S.getClass(s.classId);
    if (!c || c.archived_at) return null;
    const cm = S.classMember(c.id, u.id);
    if (cm && cm.role === 'student') return null;
    const m = S.membership(c.school_id, u.id);
    if (!m || (m.role !== 'teacher' && m.role !== 'admin')) return null;
    return S.teaches(u, c.id) || m.role === 'admin' ? 'full' : 'limited';
  }
  if (s.audience === 'family') {
    if (u.id === owner) return 'full';
    const fam = familyOfOwner(owner);
    if (!isGrownup(u) || !fam || !hooks.familyGrownups(fam).includes(u.id)) return null;
    return 'limited';
  }
  return u.id === owner ? 'full' : null;
}

/** Why u can't be invited as a co-host now: null, or 'cohostRoom' (open rooms have none), 'self', 'already',
 *  'notEligible' or 'full' (COHOST_MAX, pending invites included). */
export function cohostRefusal(s, u) {
  if (!s || s.audience === 'open') return 'cohostRoom';
  if (!u) return 'notEligible';
  if (u.id === s.host.userId) return 'self';
  if ((s.cohosts && s.cohosts.has(u.id)) || (s.invites && s.invites.has(u.id))) return 'already';
  if (!controlTier(s, u)) return 'notEligible';
  if (((s.cohosts && s.cohosts.size) || 0) + ((s.invites && s.invites.size) || 0) >= COHOST_MAX) return 'full';
  return null;
}

/** An adult's name as other adults of this room know it: the school roster name in class rooms, else the display name. */
export function adultName(s, u) {
  if (!u) return '';
  if (s && s.audience === 'class') {
    const c = S.getClass(s.classId);
    const m = c && S.membership(c.school_id, u.id);
    if (m && m.roster_name) return String(m.roster_name).slice(0, 60);
  }
  return String(u.display_name || u.username || '').slice(0, 60);
}

/** The people the host may invite: [{ id, name, tier }]. Class rooms: the school's staff list a class teacher already
 *  sees under "Add a teacher" (no search, no free text); family rooms: the family's other grown-ups. Minus the host,
 *  current co-hosts, pending invites, and anyone not eligible. */
export function cohostCandidates(s) {
  if (!s || s.audience === 'open') return [];
  let ids = [];
  if (s.audience === 'class') {
    const c = S.getClass(s.classId);
    if (!c) return [];
    ids = S.members(c.school_id, 'staff').filter(m => !m.banned).map(m => m.id);
  } else if (s.audience === 'family') {
    const fam = familyOfOwner(ownerOf(s));
    ids = fam ? hooks.familyGrownups(fam) : [];
  }
  const out = [];
  for (const id of ids) {
    if (id === s.host.userId || (s.cohosts && s.cohosts.has(id)) || (s.invites && s.invites.has(id))) continue;
    const u = getUser(id);
    const tier = controlTier(s, u);
    if (tier) out.push({ id, name: adultName(s, u), tier });
  }
  return out;
}
