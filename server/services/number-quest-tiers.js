// Number Quest's tiers (math course spec §1): three sequential streets on one path — Launchpad (K-2),
// Explorer (3-5), Pro (6-8) — each with ITS OWN units and steps. This small module is the one place the
// rest of the course asks "which tiers are there, which are open, and what is in them": the course loader
// (services/courses.js), the placement service and the views all read it, so none of them hard-wires a
// tier name. It reads only the catalogue (seed-lessons/number-quest/units.json) and imports no other
// service, so anything may import it without a cycle.
//
// The rules, in one place:
// - A tier's key is the band value stored in course_progress.band / course_bands and the prefix of its
//   step keys: "<tier>-<unit>.<step>" (launchpad-1.1, explorer-3.2, pro-2.1).
// - A unit belongs to the tier its `tier` field names (a unit without one is Explorer: the tier that
//   existed first). Unit numbers repeat across tiers: a unit's identity is tier + n.
// - A tier with no units does not exist: it has no steps, no band and no start node.
// - A tier's `status` (units.json tiers.<tier>.status) is "open" or "building". A building tier is
//   visible to the platform admin only (who walks the courses with every step open); for everyone else
//   it does not exist. A tier with units and no status is treated as building, except Explorer.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../../seed-lessons/number-quest/units.json', import.meta.url));
/** The tiers, bottom to top: the order of the streets on the path. */
export const TIERS = Object.freeze(['launchpad', 'explorer', 'pro']);
/** The tier a unit without a `tier` field belongs to, and the street a learner with no band or placement walks. */
export const DEFAULT_TIER = 'explorer';
export const STATUSES = Object.freeze(['open', 'building']);
/** A step key of any tier: [, tier, "u.s", unit, step]. */
export const STEP_KEY = /^(launchpad|explorer|pro)-((\d)\.(\d))$/;

let reg = null;
const overrides = new Map();
const registry = () => (reg || (reg = JSON.parse(fs.readFileSync(FILE, 'utf8'))));
/** Forget the loaded catalogue (tests that rewrite it). Status overrides are kept: clear them with setTierStatus. */
export const reload = () => { reg = null; };
/** The catalogue file as read: { about, program, tiers, units }. */
export const catalogue = () => registry();

export const tierOfUnit = u => (u && TIERS.includes(u.tier) ? u.tier : DEFAULT_TIER);
/** A tier's units, in the catalogue's order. */
export const unitsOf = tier => (TIERS.includes(tier) ? (registry().units || []).filter(u => tierOfUnit(u) === tier) : []);
/** A tier's own line in the catalogue (district, grades, inGame, stones, status, finale), or null. */
export const tierInfo = tier => (TIERS.includes(tier) && (registry().tiers || {})[tier]) || null;
/** Does the tier have any unit? A tier without units behaves as not existing. */
export const exists = tier => unitsOf(tier).length > 0;
/** "open" or "building" (see the rules above), or null for a tier that does not exist. */
export function statusOf(tier) {
  if (!exists(tier)) return null;
  if (overrides.has(tier)) return overrides.get(tier);
  const s = (tierInfo(tier) || {}).status;
  return STATUSES.includes(s) ? s : (tier === DEFAULT_TIER ? 'open' : 'building');
}
export const isOpen = tier => statusOf(tier) === 'open';
const isAdmin = user => !!user && user.role === 'admin';
/** May this viewer see the tier at all? An open tier: everyone. A building tier: the platform admin only. */
export const visibleTo = (user, tier) => isOpen(tier) || (isAdmin(user) && exists(tier));
/** The tiers that exist, in path order. */
export const existingTiers = () => TIERS.filter(exists);
/** The open tiers, in path order: what any learner may walk. */
export const openTiers = () => TIERS.filter(isOpen);
/** The tiers this viewer may see, in path order. */
export const visibleTiers = user => TIERS.filter(t => visibleTo(user, t));
/** FOR TESTS ONLY: read a tier as "open" or "building" whatever units.json says (null restores the file's
 *  word). Nothing in the app calls this: a tier opens for real by editing its status in units.json. */
export function setTierStatus(tier, status) {
  if (!TIERS.includes(tier)) return false;
  if (status === null || status === undefined) overrides.delete(tier);
  else if (STATUSES.includes(status)) overrides.set(tier, status);
  else return false;
  return true;
}

/** A step key taken apart: { tier, n ("u.s"), unit, step }, or null when it is not a step key's shape. */
export function parseKey(key) {
  const m = STEP_KEY.exec(String(key || ''));
  return m ? { tier: m[1], n: m[2], unit: +m[3], step: +m[4] } : null;
}
/** A tier's steps as the catalogue lists them, in path order: [{ key, n, unit (the unit object), s (the step) }]. */
export function stepsOf(tier) {
  return unitsOf(tier).flatMap(u => (u.steps || []).map(s => ({ u, s })))
    .sort((a, b) => a.s.order - b.s.order)
    .map(({ u, s }) => ({ key: `${tier}-${s.n}`, n: s.n, unit: u, s }));
}
/** The key of a unit's first step (its door), or null for a unit with no steps. */
export function doorOf(tier, unit) {
  const first = [...((unit && unit.steps) || [])].sort((a, b) => a.order - b.order)[0];
  return first ? `${tier}-${first.n}` : null;
}
/** The very first step of a tier (its welcome), or null. */
export const firstKey = tier => { const all = stepsOf(tier); return all.length ? all[0].key : null; };
/** A step's own title in its tier (its unit's tier keys the step's fields). */
export const stepTitle = (tier, s) => ((s && s.titles) || {})[tier] || (s && s.n) || '';
/** How a tier is named to a reader: its in-game name ("Launchpad"), capitalised key as the fallback. */
export const tierName = tier => (tierInfo(tier) || {}).inGame || (tier ? tier[0].toUpperCase() + tier.slice(1) : '');
