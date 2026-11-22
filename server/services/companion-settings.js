// A school's settings for Oomba, the teaching companion (docs/decisions.md "Oomba teaching companion"; the School page's
// Settings tab, routes/schools.js schoolSettings). Kept in the school's settings JSON (schools.settings.companion), so no
// table of its own. A school admin can turn Oomba off for the school's staff, turn its web search off, and set how long
// conversations are kept and how much Oomba may do, always within BOUNDS (a value outside them is refused, never
// clamped silently). Teachers in no school (the platform admin, testers) get DEFAULTS. A teacher in several schools gets
// the strictest of them: off anywhere is off, and each number is the smallest.
import { q, audit } from '../db.js';
import { config } from '../config.js';
import * as S from './schools.js';
import { toolAccess } from './teacher-tools.js';

/** [smallest, largest, default] for each number. retentionDays: a conversation left this long goes; keep: turns kept
 *  in a conversation; send: turns sent to the AI with a new message; steps: tool steps in one answer; perHour: messages
 *  a teacher may send in an hour. */
export const BOUNDS = Object.freeze({
  retentionDays: Object.freeze([7, 365, 60]),
  keep: Object.freeze([4, 40, 20]),
  send: Object.freeze([2, 16, 8]),
  steps: Object.freeze([2, 12, 8]),
  perHour: Object.freeze([5, 100, 40]),
});
export const NUMBERS = Object.freeze(Object.keys(BOUNDS));
export const DEFAULTS = Object.freeze({ on: true, web: true, ...Object.fromEntries(NUMBERS.map(k => [k, BOUNDS[k][2]])) });

const parse = s => { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const inBounds = (k, v) => Number.isInteger(v) && v >= BOUNDS[k][0] && v <= BOUNDS[k][1];

/** One school's companion settings, the defaults filled in (a stored value out of bounds reads as the default). */
export function read(school) {
  const c = parse(school && school.settings).companion || {};
  const out = { ...DEFAULTS };
  if (typeof c.on === 'boolean') out.on = c.on;
  if (typeof c.web === 'boolean') out.web = c.web;
  for (const k of NUMBERS) if (inBounds(k, c[k])) out[k] = c[k];
  return out;
}

/** The schools whose rules apply to this person: every school where they are active staff. */
const staffSchools = u => (u ? q.all("SELECT s.* FROM school_members m JOIN schools s ON s.id=m.school_id WHERE m.user_id=? AND m.status='active' AND m.role!='student' AND s.archived_at IS NULL", u.id) : []);
/** The settings for this teacher: their school's, the strictest of several, DEFAULTS with none. */
export function settingsFor(u) {
  const list = staffSchools(u).map(read);
  if (!list.length) return { ...DEFAULTS, school: false };
  const out = { on: list.every(x => x.on), web: list.every(x => x.web), school: true };
  for (const k of NUMBERS) out[k] = Math.min(...list.map(x => x[k]));
  return out;
}

/** May this account use Oomba, the teaching companion? The Teacher plan rule (services/teacher-tools.js toolAccess:
 *  'yes' only, never the plan page), the COMPANION switch, and their school's own switch. */
export const companionFor = u => !!config.companion && !!u && toolAccess(u) === 'yes' && settingsFor(u).on;

/**
 * A school admin saves the section. input: { on, web, retentionDays, keep, send, steps, perHour } (strings or numbers;
 * a missing key keeps its value). -> { ok: true, settings } | { ok: false, code: 'bounds', field, min, max } | notFound.
 */
export function save(by, schoolId, input = {}) {
  const s = S.getSchool(schoolId);
  if (!s || !S.canManageSchool(by, s.id)) return { ok: false, code: 'notFound' };
  const cur = read(s), next = { ...cur };
  const bool = v => v === true || v === '1' || v === 'true' || v === 'on';
  for (const k of ['on', 'web']) if (input[k] !== undefined) next[k] = bool(input[k]);
  for (const k of NUMBERS) {
    if (input[k] === undefined || input[k] === '') continue;
    const n = Number(input[k]);
    if (!inBounds(k, n)) return { ok: false, code: 'bounds', field: k, min: BOUNDS[k][0], max: BOUNDS[k][1] };
    next[k] = n;
  }
  // "Turns sent" can never be more than "turns kept".
  if (next.send > next.keep) return { ok: false, code: 'sendKeep', field: 'send', min: BOUNDS.send[0], max: next.keep };
  const all = parse(s.settings);
  all.companion = next;
  q.run('UPDATE schools SET settings=? WHERE id=?', JSON.stringify(all), s.id);
  audit(by.id, 'companion.settings', s.id, next);
  return { ok: true, settings: next };
}
