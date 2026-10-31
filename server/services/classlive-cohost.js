// Oomba Live part 4: co-hosts (docs/decisions.md "Oomba Live, part 4"; protocol: docs/live-protocol.md "Part 4";
// legal-review item 43). Invites, answers, leaving, removal and "Make host": what the HTTP routes call. Synchronous from
// start to end (no await), like every controller message, so they are serialized with the game's actions.
//
// Who may co-host: classlive-access.js controlTier (class rooms: staff of the class's school, never a student or a
// guest; family rooms: another grown-up of the family, nobody today; open rooms: nobody). At most COHOST_MAX, pending
// invites included. Invites last 15 minutes and reach the invitee only inside Oomba (the /live page, /api/live/mine,
// the /live/cohost/:sid link): no email, no push, no message anyone types. Only the current host manages co-hosts.
// Lifecycle events go to audit_log at once (a game that never started is still on record) and to the run's log.
import crypto from 'node:crypto';
import { getUser } from '../auth.js';
import { audit } from '../db.js';
import * as A from './classlive-access.js';
import * as LS from './classlive-sessions.js';

const now = () => LS.hooks.now();
const open = s => !!s && s.phase !== 'ended';
const record = (actorId, action, sid, other) => { try { audit(actorId, `live.cohost.${action}`, sid, other ? { other } : ''); } catch { /* a record, not a gate */ } };

/** Invites past their time go. */
export function prune(s) {
  let gone = false;
  for (const [id, inv] of s.invites) if (inv.until <= now()) { s.invites.delete(id); gone = true; }
  if (gone) LS.sendCh(s);
}
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = code => ({ ok: false, code });
/** The host's check: -> null or a refusal code ('off', 'notFound', 'cohostRoom'). */
function hostCheck(s, by) {
  if (!LS.cohostOn()) return 'off';
  if (!open(s) || !by || s.host.userId !== by.id) return 'notFound';
  if (s.audience === 'open') return 'cohostRoom';
  return null;
}

/** The host's Co-hosts panel: who runs the game, who may be invited, the link. */
export function view(s) {
  prune(s);
  const list = [];
  for (const c of [...s.cohosts.values()].sort((a, b) => a.since - b.since)) list.push({ ref: LS.refOf(s, c.userId), id: c.userId, name: s.names.get(c.userId) || '', tier: c.tier, state: LS.connected(s, c.userId) ? 'on' : 'away', since: c.since });
  for (const [id, inv] of s.invites) list.push({ ref: LS.refOf(s, id), id, name: s.names.get(id) || '', tier: inv.tier, state: 'invited', since: inv.at });
  return { list, candidates: A.cohostCandidates(s), max: A.COHOST_MAX, link: `/live/cohost/${s.id}`, room: s.audience };
}

/** Invite one person from the candidates. -> { ok } | { ok: false, code } */
export function invite(s, by, userId) {
  const no = hostCheck(s, by); if (no) return fail(no);
  prune(s);
  const u = getUser(String(userId || ''));
  const why = A.cohostRefusal(s, u);
  if (why) return fail(why);
  const tier = A.controlTier(s, u);
  s.names.set(u.id, A.adultName(s, u));
  s.invites.set(u.id, { at: now(), until: now() + LS.hooks.inviteMs, by: by.id, tier });
  s.cohostEver = true;
  LS.recordAct(s, by.id, 'invited', { other: u.id });
  record(by.id, 'invite', s.id, u.id);
  LS.sendCh(s);
  return ok();
}
/** Cancel a pending invite. */
export function cancel(s, by, userId) {
  const no = hostCheck(s, by); if (no) return fail(no);
  if (!s.invites.delete(String(userId || ''))) return fail('notCohost');
  LS.recordAct(s, by.id, 'cancelled', { other: String(userId) });
  record(by.id, 'cancel', s.id, String(userId));
  LS.sendCh(s);
  return ok();
}
/** Remove a co-host (any time, mid-game too): their controls stop at once (bye cohostOff); the game goes on. */
export function remove(s, by, userId) {
  const no = hostCheck(s, by); if (no) return fail(no);
  const id = String(userId || '');
  if (s.invites.has(id)) return cancel(s, by, id);
  if (!LS.dropCohost(s, id)) return fail('notCohost');
  LS.recordAct(s, by.id, 'removed', { other: id });
  record(by.id, 'remove', s.id, id);
  LS.sendCh(s);
  return ok();
}
/** "Make host": hand the game to a co-host (who must still be eligible and not host another open game); the host
 *  becomes a co-host. */
export function makeHost(s, by, userId) {
  const no = hostCheck(s, by); if (no) return fail(no);
  const id = String(userId || '');
  if (!s.cohosts.has(id)) return fail('notCohost');
  if (!A.controlTier(s, getUser(id))) return fail('notEligible');
  const other = LS.hostSession(id);
  if (other && other !== s && open(other)) return fail('hasOpen');
  return LS.promote(s, id, 'made') ? ok() : fail('notCohost');
}

/** The invitee's answer. yes: become a co-host (a new nonce every time); no: the invite goes. -> { ok } | { ok: false,
 *  code: 'gone' } (expired, the session ended, the cap reached, no longer eligible). */
export function answer(s, u, yes) {
  if (!LS.cohostOn() || !open(s) || !u) return fail('gone');
  prune(s);
  const inv = s.invites.get(u.id);
  if (!inv) return fail('gone');
  s.invites.delete(u.id);
  if (!yes) { LS.recordAct(s, u.id, 'declined', { other: u.id }); record(u.id, 'decline', s.id); LS.sendCh(s); return ok(); }
  const tier = A.controlTier(s, u);
  if (!tier || s.cohosts.size >= A.COHOST_MAX || s.host.userId === u.id) { LS.sendCh(s); return fail('gone'); }
  s.names.set(u.id, A.adultName(s, u));
  s.cohosts.set(u.id, { userId: u.id, nonce: crypto.randomBytes(12).toString('base64url'), tier, since: now(), dash: null, goneAt: now(), lang: s.host.lang });
  s.cohostEver = true;
  LS.recordAct(s, u.id, 'joined');
  record(u.id, 'accept', s.id, inv.by);
  LS.sendCh(s);
  // the host away and nobody had taken over: a new co-host may (the handoff waits for them to connect)
  return ok({ tier });
}
/** A co-host stops co-hosting. */
export function leave(s, u) {
  if (!LS.cohostOn() || !open(s) || !u || !s.cohosts.has(u.id)) return fail('notCohost');
  LS.dropCohost(s, u.id);
  LS.recordAct(s, u.id, 'left');
  record(u.id, 'leave', s.id);
  LS.sendCh(s);
  return ok();
}

/** The open sessions inviting u (for /live and /api/live/mine): [{ s, inv, from }]. */
export function invitesFor(u) {
  if (!LS.cohostOn() || !u) return [];
  const out = [];
  for (const s of LS.openSessions()) { prune(s); const inv = s.invites.get(u.id); if (inv) out.push({ s, inv, from: s.names.get(inv.by) || s.names.get(s.host.userId) || '' }); }
  return out;
}
/** The open sessions u co-hosts. */
export const cohostingFor = u => (LS.cohostOn() && u ? LS.openSessions().filter(s => s.cohosts.has(u.id)) : []);
