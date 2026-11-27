// Oomba does it (docs/decisions.md "Oomba does it: one confirm card for any teacher action"). The owner: "ensure
// EVERYTHING can be done from the Oomba chat". One mechanism for every teacher action the chat can do, so each new one is
// an entry in an area file here, not a new tool, card and act:
//
// - The AI calls ONE tool, doAction { action, params } (services/companion.js). It never changes anything: the action's
//   plan() resolves everything (the class; students from "[student N]" placeholders), checks the same permissions as the
//   page's own route, and planAction() below runs the change in a dry run (verify-change.js dryRun: written and rolled
//   back), so a card is shown only for something that would work. A refusal is plain words that end "Nothing was changed."
// - The card (note.action) says what will happen in the teacher's language, with a one-line warning for a change that
//   makes children's accounts, deletes or takes something away, reaches students' screens or posts outside the site, and
//   Do it / Not now. Only Do it (act 'actionDo', services/companion.js actionAct) changes anything: tryAction() checks it
//   again in a dry run with what the teacher typed on the card, runAction() calls the SAME service as the page's route in
//   the engine's transaction and reads it back (verify), with Undo (undoAction) where the action has one.
// - Privacy: students' names never go to the AI. New names are typed on the card and sent with the tap only; existing
//   students are only "[student N]" placeholders. What a card or change shows (names, a join code, a login cards link) is
//   built by view()/doneView() for the teacher's own page only (services/companion.js dress), never kept in a turn's
//   words, never in a tool result. A new password is never in the chat: it goes on a one-time login cards page.
//
// The registry: each AREA file (./classes.js, ./assignments.js, ...) default-exports an array of actions and imports only
// ./shared.js; this file imports every area and registers its actions. An action:
//   { id, area,                         area: its strings live under js.companion.act.<area>.*
//     risk: 'normal'|'child'|'delete'|'students'|'external',
//     warn?: key                        the card's warning line: js.companion.act.<area>.warn.<key> (when risk isn't normal)
//     input?: 'list'|'one'              a box on the card (the teacher's typed words, sent with Do it as value)
//     undoable: bool, label (one line for the AI), params (JSON-schema properties for doAction's params),
//     dry?: false                       no dry run (state kept in memory, like a live room): check(u, data) -> why | ''
//     sample?: string                   the value its dry run before the card gets (input actions)
//     plan(u, ctx, params) -> { data, ai } | { ask } | { error }      data: kept on the card; ai: what the AI is told
//     view(u, data, t) -> { title, lines, value? }                     the open card (page only)
//     run(u, data, value, { dry }) -> { ok: true, landed, done, undo? } | { ok: false, code, count? }
//     doneView(u, done, t) -> { lines, links: [{ href, label, primary? }] }   the change card (page only)
//     undo?(u, undoData) -> { ok: true, skipped } | { ok: false, code }
//     send?(u, data) -> Promise<{ ok: true, ... } | { ok: false, code }>   a call outside the site (Google Classroom),
//                                       awaited on the tap only (never in plan() or a dry run), before run(..., { sent })
//                                       writes its change card in the transaction and reads it back }
import { uid } from '../../db.js';
import * as S from '../schools.js';
import * as VC from '../verify-change.js';
import { no } from './shared.js';
import classes from './classes.js';
import assignments from './assignments.js';
import homeroom from './homeroom.js';
import live from './live.js';
import dashboard from './dashboard.js';
import made from './made.js';

export { idsOfToken, fold } from './shared.js';
const RISKS = ['normal', 'child', 'delete', 'students', 'external'];
const registry = {};
/** Adds an area's actions to the registry (checked: one id once, a known risk, the functions a card needs). */
export function register(list) {
  for (const a of list) {
    if (!/^[a-z][A-Za-z]{2,30}$/.test(a.id || '') || registry[a.id]) throw new Error(`companion action ${a.id}: bad or repeated id`);
    if (!RISKS.includes(a.risk) || !/^[a-z][A-Za-z]*$/.test(a.area || '')) throw new Error(`companion action ${a.id}: risk or area`);
    for (const f of ['plan', 'view', 'run', 'doneView']) if (typeof a[f] !== 'function') throw new Error(`companion action ${a.id}: ${f}() is missing`);
    if (a.undoable && typeof a.undo !== 'function') throw new Error(`companion action ${a.id}: undoable without undo()`);
    registry[a.id] = Object.freeze(a);
  }
}
register(classes);
register(assignments);
register(homeroom);
register(live);
register(dashboard);
register(made);
export const ACTIONS = registry;
export const actionIds = () => Object.keys(registry);

// ---------------------------------------------------------------- the tool
/** The doAction tool's description: one line per action. */
export function toolDescription() {
  const lines = actionIds().map(id => { const a = registry[id]; return `- ${id} (${Object.keys(a.params).join(', ')}): ${a.label}`; });
  return `Do a teacher action for the teacher, after they tap Do it on a card. Nothing changes until then: the app checks it first (the same rules as the page), and the card says what will happen. One action per answer. Students are only ever placeholders like [student 1]; never pass, ask for or guess a name. Actions:\n${lines.join('\n')}`;
}
export function toolSchema() {
  const props = {};
  for (const id of actionIds()) for (const [k, v] of Object.entries(registry[id].params)) if (!props[k]) props[k] = v;
  return { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: actionIds() }, params: { type: 'object', description: 'The action\'s params (see each action).', properties: props } } };
}
const whyFor = code => ({ alreadyAssigned: 'The class already has it assigned.', badDate: 'That day is not a date.', notFound: 'That is not there any more, or the teacher may not change it.', className: 'That name cannot be used.' }[code] || 'It could not be done.');
/** What a doAction call would do, checked (permissions in plan(), then a dry run). -> { plan, ai } | { ask } | { error } */
export function planAction(u, ctx, id, params) {
  const a = Object.hasOwn(registry, String(id || '')) ? registry[id] : null;
  if (!a) return no('There is no such action.');
  if (!u || u.is_guest || !S.isSchoolStaff(u)) return no('Only school staff can do this.');
  const r = a.plan(u, ctx, params && typeof params === 'object' ? params : {});
  if (r.error || r.ask) return r;
  const plan = { id: uid(10), action: a.id, risk: a.risk, data: r.data, state: 'open', lang: ctx.lang || 'en' };
  if (a.dry === false) { const why = a.check ? a.check(u, plan.data) : ''; if (why) return no(why); }
  else {
    const tried = VC.dryRun(() => a.run(u, plan.data, a.sample === undefined ? '' : a.sample, { dry: true }));
    if (!tried || !tried.ok) return no(whyFor(tried && tried.code));
  }
  return { plan, ai: r.ai };
}

// ---------------------------------------------------------------- the card and the change, for the teacher's page
export function cardView(u, p, t) {
  const a = registry[p.action]; if (!a) return null;
  let v = { title: '', lines: [] };
  try { if (p.state === 'open') v = a.view(u, p.data, t); } catch { v = { title: '', lines: [] }; }
  return { id: p.id, action: p.action, state: p.state, risk: p.risk, title: v.title, lines: v.lines || [], ...(v.value !== undefined ? { value: v.value } : {}),
    ...(a.warn && p.risk !== 'normal' ? { warn: t(`js.companion.act.${a.area}.warn.${a.warn}`) } : {}), ...(a.input ? { input: a.input } : {}), undoable: !!a.undoable,
    ...(p.why ? { why: t(`js.companion.act.why.${p.why}`, { count: p.count || 0 }) } : {}) };
}
export function changeView(u, c, t) {
  const a = registry[c.id]; if (!a) return c;
  try { const v = a.doneView(u, c.done || {}, t); return { ...c, lines: v.lines || [], links: v.links || [] }; } catch { return { ...c, lines: [], links: [] }; }
}

// ---------------------------------------------------------------- the tap and Undo
/** Why a tap did nothing, said on the card: js.companion.act.why.<code>. */
export const WHY = Object.freeze(['needText', 'tooMany', 'sameNames', 'other']);
/** Do it, checked first in a dry run with the teacher's typed words. -> { ok } | { fail: why, count? } */
export function tryAction(u, p, value) {
  const a = registry[p.action]; if (!a) return { fail: 'other' };
  if (a.dry === false) return a.check && a.check(u, p.data) ? { fail: 'other' } : { ok: true };
  const r = VC.dryRun(() => a.run(u, p.data, value, { dry: true }));
  if (r && r.ok) return { ok: true };
  return { fail: WHY.includes(r && r.code) ? r.code : 'other', count: (r && r.count) || 0 };
}
/** The real change (inside the engine's transaction), read back. -> { verify, change, undo? } | { code, verify } */
export function runAction(u, p, value, sent) {
  const a = registry[p.action]; if (!a) return { code: 'notFound' };
  const r = a.run(u, p.data, value, { dry: false, ...(sent ? { sent } : {}) });
  if (!r || !r.ok) return { code: r && r.code === 'notFound' ? 'notFound' : 'error', verify: { ok: false, landed: 0, notLanded: [{ code: 'gone' }] } };
  if (!r.landed) return { code: 'error', verify: { ok: false, landed: 0, notLanded: [{ code: 'other' }] } };
  return { verify: { ok: true, landed: 1, notLanded: [] }, change: { kind: 'action', id: a.id, done: r.done }, ...(r.undo && a.undo ? { undo: { kind: 'action', id: a.id, ...r.undo } } : {}) };
}
/** Does this card's action reach outside the site (send())? */
export const sends = p => !!(p && registry[p.action] && registry[p.action].send);
const sending = new Set();
/** The call outside the site, on Do it only (after tryAction), once per card at a time. -> { ok: true, sent } | { fail } */
export async function sendAction(u, p) {
  const a = registry[p.action]; if (!a || !a.send) return { fail: 'other' };
  if (sending.has(p.id)) return { fail: 'other' };
  sending.add(p.id);
  try { const r = await a.send(u, p.data); return r && r.ok ? { ok: true, sent: r } : { fail: 'other', code: (r && r.code) || 'error' }; }
  catch { return { fail: 'other', code: 'error' }; }
  finally { sending.delete(p.id); }
}
export function undoAction(u, data) {
  const a = registry[data && data.id]; if (!a || !a.undo) return { ok: false, code: 'notFound' };
  return a.undo(u, data);
}
