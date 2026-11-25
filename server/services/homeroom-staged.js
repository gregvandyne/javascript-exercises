// Homeroom: the teacher's own desk (docs/decisions.md "Homeroom: the teacher's desk"). The "Teacher's desk" on the board is
// a real desk: the teacher drops or tap-places any game, tool or lesson on it, even in a class with no students yet, to
// try it (Play / Preview opens the game, the lesson's own question set or the tool, as the teacher) and hand it out
// later (Hand out picks it, then a desk, a group or Whole class, as from the left panel; or the card is dragged there).
//
// Items on the teacher's desk are staged, not assigned: nothing here is a class assignment and nothing reaches a student.
// Stored per class in homeroom_rooms.staged (migration 0129) as [{ id, kind: 'game' | 'lesson' | 'tool', ref, by, at }]
// (ref: a game id, a Homeroom lesson id, or 'manipulatives' / 'figures'; by: the teacher who put it there). Only the
// class's own teachers (the Homeroom gate, services/homeroom.js canUseClass) read or change it; a lesson shows only to
// its owner (lessons are personal: services/homeroom-lessons.js getMine), and a game or lesson that is gone, or that this
// teacher can no longer hand out, simply isn't shown. The desk, See the room, the projector and every state endpoint
// never read this column. Gone with the class and the school (the room row); a teacher's own items go with their
// account (services/account-delete.js, step 11c2).
import { q, now, audit } from '../db.js';
import { config } from '../config.js';
import * as H from './homeroom.js';
import * as HO from './homeroom-handouts.js';
import * as HL from './homeroom-lessons.js';
import * as games from './games.js';
import { codeOf } from './game-sets.js';
import { toolAccess } from './teacher-tools.js';
import { DEFAULT_GROUPS } from '../../public/js/homeroom-seats.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
const json = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };
/** At most this many items on a teacher's desk (per class). */
export const STAGED_MAX = 24;
export const KINDS = ['game', 'lesson', 'tool'];
/** The tools a teacher can put on their desk to open (handing tools out comes next, as in the panel). */
export const TOOLS = {
  manipulatives: { icon: '🧮', href: '/manipulatives', on: () => config.manipulatives },
  figures: { icon: '📐', href: '/figures', on: () => config.figures },
};
const toolOk = (u, k) => !!TOOLS[k] && toolAccess(u, TOOLS[k].on()) === 'yes';

/** What is stored for the class (every teacher's items, unresolved). */
export function storedOf(classId) {
  const r = q.get('SELECT staged FROM homeroom_rooms WHERE class_id=?', classId);
  return (r ? json(r.staged, []) : []).filter(x => x && typeof x === 'object' && KINDS.includes(x.kind) && x.id && x.ref);
}
function write(classId, list) {
  const t = now();
  // A room row may not exist yet (a class nobody arranged): made with the defaults, as services/homeroom.js does. The
  // room's updated_at is left alone (desks and the projector use it as the teacher's area's version).
  q.run('INSERT INTO homeroom_rooms(class_id, groups, created_at, updated_at) VALUES (?,?,?,?) ON CONFLICT(class_id) DO NOTHING', classId, JSON.stringify(DEFAULT_GROUPS), t, t);
  q.run('UPDATE homeroom_rooms SET staged=? WHERE class_id=?', JSON.stringify(list.slice(0, STAGED_MAX)), classId);
}
/** One stored item as this teacher's desk shows it, or null when they can't use it (gone, another teacher's lesson). */
function viewOf(u, x, locale, t) {
  if (x.kind === 'game') {
    const g = games.getGame(String(x.ref));
    if (!HO.handable(u, g)) return null;
    const l = games.localizeGame(g, locale);
    return { id: x.id, kind: 'game', ref: g.id, pick: g.id, title: l.title, icon: g.icon || '🎮', href: g.slug ? `/play/${encodeURIComponent(g.slug)}` : null };
  }
  if (x.kind === 'lesson') {
    const l = HL.getMine(u, String(x.ref));
    if (!l) return null;
    const g = games.getGame(l.game_id);
    if (!HO.handable(u, g)) return null;
    const set = l.base && l.base.set;
    return { id: x.id, kind: 'lesson', ref: l.id, pick: `L:${l.id}`, title: l.title, icon: g.icon || '📄', lesson: true,
      href: g.slug && set ? `/play/${encodeURIComponent(g.slug)}?chapter=${encodeURIComponent(set)}&lock=1` : null, code: set ? codeOf(set) : '' };
  }
  if (!toolOk(u, x.ref)) return null;
  const tool = TOOLS[x.ref];
  return { id: x.id, kind: 'tool', ref: x.ref, pick: `T:${x.ref}`, title: t ? t(`homeroom.panel.${x.ref}`) : x.ref, icon: tool.icon, href: tool.href, tool: true };
}
/** The teacher's desk as this teacher sees it, oldest first: [{ id, kind, ref, pick, title, icon, href, lesson?, tool? }]. */
export function stagedFor(u, c, locale = 'en', t = null) {
  if (!H.canUseClass(u, c)) return [];
  return storedOf(c.id).map(x => viewOf(u, x, locale, t)).filter(Boolean);
}
/** What a pick id from the board names: a game id, 'L:<lesson id>' or 'T:<tool>'. */
export function parsePick(pick) {
  const p = String(pick || '');
  if (p.startsWith('L:')) return { kind: 'lesson', ref: p.slice(2) };
  if (p.startsWith('T:')) return { kind: 'tool', ref: p.slice(2) };
  return { kind: 'game', ref: p };
}
/**
 * Put a game, lesson or tool on the teacher's desk ({ kind, ref }, or { pick }). Works with no students in the class.
 * Already there: nothing changes (already: true). The class's teachers only. -> { ok, item, already? }
 */
export function stage(u, c, { kind, ref, pick } = {}) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  const want = pick !== undefined ? parsePick(pick) : { kind: String(kind || ''), ref: String(ref || '') };
  if (!KINDS.includes(want.kind) || !want.ref) return fail('badStage');
  const item = { id: `d${Math.random().toString(36).slice(2, 10)}`, kind: want.kind, ref: want.ref.slice(0, 64), by: u.id, at: now() };
  const view = viewOf(u, item, 'en', null);
  if (!view) return fail(want.kind === 'lesson' ? 'noLesson' : want.kind === 'tool' ? 'badStage' : 'pickGame');
  item.ref = view.ref;
  const list = storedOf(c.id);
  const have = list.find(x => x.kind === item.kind && x.ref === item.ref && (item.kind !== 'lesson' || x.by === u.id));
  if (have) return ok({ item: have, already: true });
  if (list.length >= STAGED_MAX) return fail('deskFull');
  write(c.id, [...list, item]);
  audit(u.id, 'homeroom.stage', c.id, { kind: item.kind, ref: item.ref });
  return ok({ item });
}
/** Take an item off the teacher's desk. The class's teachers only. -> { ok } */
export function unstage(u, c, id) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  const list = storedOf(c.id), it = list.find(x => x.id === String(id || ''));
  if (!it || !viewOf(u, it, 'en', null)) return fail('notStaged');
  write(c.id, list.filter(x => x !== it));
  audit(u.id, 'homeroom.unstage', c.id, { kind: it.kind, ref: it.ref });
  return ok();
}
