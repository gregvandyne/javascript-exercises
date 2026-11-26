// Homeroom: the day plan (docs/homeroom.md "The day's plan"; docs/decisions.md "Homeroom: the day plan"). Planning runs
// through the Oomba chat only (services/companion.js: on a class's Homeroom the companion has the plan tools, and a plan
// is a card in the chat); there is no plan row on the board. This file is everything about a plan that is not the chat:
//
// - A plan: { id, name, topic, parts: [{ id, kind: slides | work | break | exit, title, minutes, note, versions }] }.
//   versions: what each part puts on desks: [{ group: '' (everyone, or everyone not in a listed group) | a group's id,
//   pick: { type: 'game', id } | { type: 'lesson', id } | { type: 'make', slug, op | mode, title } | null }]. Only work
//   time and the exit check hand anything out. 'make' is a new lesson built with the lesson builder's own data model
//   (services/homeroom-lessons.js saveLesson: Arithmetic Lab or Algebra Builder with the builder's defaults and a
//   version per group) when no lesson of the teacher's fits; otherwise a game handout with instructions.
// - cleanPlan: whatever the AI (or a saved plan) sends is checked and clamped here: known kinds, minutes inside each
//   kind's range and 120 minutes in all, at most 8 parts, only the teacher's own lessons and games they may hand out,
//   only the class's groups; titles without students' names, group names or unkind words. What changed is reported back
//   (notes), so the AI says only what landed.
// - fallbackDraft: a plan made without the AI (it is resting or not set up): a starting plan from the teacher's own
//   lessons and games, a saved plan they named, or a small change to the newest card ("make work time 20 minutes",
//   "swap the brain break").
// - usePlan: Use this plan. Each part's handouts go on desks through the existing paths (services/homeroom-handouts.js
//   handOut for a game, services/homeroom-lessons.js handOutLesson for a lesson): per group where the versions differ,
//   Whole class otherwise. The plan becomes the class's plan of today (homeroom_rooms.day_plan, migration 0131), held by
//   the server so a reload, the projector and the desks all see the same timer.
// - runAction: start, +5 min, next, finish, clear. The timer (public/js/homeroom-plan-time.js timing) never moves on by
//   itself: when a part's time is up it only says so. Finish class makes the short summary (parts done, time used against
//   planned, how many handouts were finished per part as counts; never a name, never a ranking); unfinished handouts stay
//   on desks as homework (nothing is removed).
// - Saved plans (homeroom_day_plans): named by the teacher, used again in any of their classes; groups are kept by their
//   identity (a name, or an unnamed default group's key), so the same plan finds Stretch, On track and Building in every
//   class. Copying a plan to another class works the same way.
// - Privacy: aiContext is all the AI sees of a class: the grade, how many students, the group names and how many are in
//   each, the teacher's lesson and game titles, and recent handouts' results as counts. Never a student's name, id or
//   work. The projector and desks get only part names and the timer (publicView).
import { q, uid, now, audit } from '../db.js';
import * as S from './schools.js';
import * as H from './homeroom.js';
import * as HO from './homeroom-handouts.js';
import * as HL from './homeroom-lessons.js';
import * as SUP from './homeroom-supports.js';
import * as games from './games.js';
import { textProblem } from './manipulatives.js';
import { scrub, studentNames } from '../builder/lesson.js';
import { tFor } from '../i18n/index.js';
import { timing, MORE_MS, EXTRA_MAX } from '../../public/js/homeroom-plan-time.js';
import { ARITH, ALGEBRA, fill, suggest, leanOf, groupIdent } from '../../public/js/homeroom-lesson-make.js';
import { DEFAULT_GROUPS } from '../../public/js/homeroom-seats.js';
import * as HW from './homeroom-week.js';

export const KINDS = Object.freeze(['slides', 'work', 'break', 'exit']);
/** Minutes each kind may take (clamped into this), and the starting plan's. */
export const RANGE = Object.freeze({ slides: [1, 30], work: [3, 60], break: [1, 10], exit: [2, 15] });
export const DEFAULT_MIN = Object.freeze({ slides: 8, work: 20, break: 3, exit: 5 });
export const PARTS_MAX = 8, TOTAL_MAX = 120, TITLE_MAX = 60, NAME_MAX = 60, TOPIC_MAX = 80, SAVED_MAX = 50;
/** A plan of today is kept this long after it was put on desks (a new day starts clean). */
export const KEEP_MS = 16 * 3600e3;
export const MAKE_SLUGS = Object.freeze(['arithmetic-lab', 'algebra-builder']);
/** Brain breaks the starting plan and "swap the brain break" go through (no names, no equipment). */
export const BREAKS = Object.freeze(['Stretch and wiggle', 'Simon says', 'Deep breaths: smell the flower, blow out the candle', 'Dance break', 'Rock, paper, scissors with a partner', 'Shake it out: count down from 10']);
const PICK_KINDS = new Set(['work', 'exit']);
const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, extra = {}) => ({ ok: false, code, ...extra });
const json = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const fold = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = s => fold(s).split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2);

// ---------------------------------------------------------------- groups and names
export const groupLabel = (g, lang = 'en') => (g && g.name) || (g && g.key ? tFor(lang)(`js.homeroom.groups.${g.key}`) : '') || tFor(lang)('js.homeroom.groups.unnamed');
export const roomGroups = c => H.roomOf(c.id).groups;
/** The class's group a word means: its id, its name or its default key, any case. */
function groupFor(groups, raw, lang) {
  const v = fold(clip(raw, 40));
  if (!v) return null;
  return groups.find(g => g.id === raw) || groups.find(g => fold(groupLabel(g, lang)) === v || (g.key && fold(g.key) === v) || fold(g.name) === v) || null;
}
/** Text the teacher (or the AI) wrote for a title: one line, no students' names, the site's word rules; '' when it
 *  fails (the card then shows the part's kind). With groups: a title naming a group is dropped too (titles reach the
 *  projector and desks, group names never do). */
export function cleanTitle(raw, { names = [], groups = [], lang = 'en', max = TITLE_MAX } = {}) {
  const v = clip(raw, max);
  if (!v) return '';
  const r = scrub(v, names);
  if (r.text !== v || textProblem(v)) return '';
  const f = fold(v);
  if (groups.some(g => { const l = fold(groupLabel(g, lang)); return l && new RegExp(`(^|[^\\p{L}])${l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(f); })) return '';
  return v;
}
function cleanNote(raw, names) {
  const v = HO.cleanInstructions(String(raw || '').slice(0, HO.INSTRUCTIONS_MAX));
  if (!v) return '';
  return scrub(v, names).text !== v || textProblem(v) ? '' : v;
}

// ---------------------------------------------------------------- picks: what a part hands out
/** A pick as the AI or a saved plan wrote it, checked for this teacher: their own lesson, a game they may hand out, or
 *  a new lesson the builder can make. -> a pick | null */
export function pickOf(u, raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type === 'lesson' || raw.lessonId) {
    const l = HL.getMine(u, String(raw.lessonId || raw.id || ''));
    return l && HO.handable(u, games.getGame(l.game_id)) ? { type: 'lesson', id: l.id } : null;
  }
  const mk = raw.type === 'make' ? raw : raw.make && typeof raw.make === 'object' ? raw.make : null;
  if (mk) {
    const slug = String(mk.slug || ''), g = MAKE_SLUGS.includes(slug) ? HL.lessonGame(slug) : null;
    if (!g || !HO.handable(u, g)) return null;
    const s = slug === 'arithmetic-lab' ? { op: ARITH.ops.includes(mk.op) ? mk.op : 'add' } : { mode: ALGEBRA.modes.includes(mk.mode) ? mk.mode : 'solve' };
    return { type: 'make', slug, ...s, title: cleanTitle(mk.title, { names: studentNames(u) }) };
  }
  const gid = raw.type === 'game' ? raw.id : raw.gameId ?? raw.game;
  if (gid !== undefined && gid !== null && gid !== '') {
    const g = games.getGame(String(gid)) || games.getGameBySlug(String(gid));
    return g && HO.handable(u, g) ? { type: 'game', id: g.id } : null;
  }
  return null;
}
const samePick = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
/** What a pick is called (the teacher's language for an Oomba game). */
export function pickTitle(u, p, lang = 'en') {
  if (!p) return '';
  if (p.type === 'lesson') { const l = HL.getMine(u, p.id); return l ? l.title : ''; }
  if (p.type === 'make') { const g = HL.lessonGame(p.slug); return p.title || (g ? games.localizeGame(g, lang).title : p.slug); }
  const g = games.getGame(p.id); return g ? games.localizeGame(g, lang).title : '';
}
function pickIcon(u, p) {
  if (!p) return '';
  if (p.type === 'lesson') { const l = HL.getMine(u, p.id), g = l && games.getGame(l.game_id); return (g && g.icon) || '📄'; }
  if (p.type === 'make') return '✨';
  const g = games.getGame(p.id); return (g && g.icon) || '🎮';
}

// ---------------------------------------------------------------- checking a plan
/**
 * A plan as the AI, a saved plan or the teacher's change sent it, made safe for this class. raw: { name, topic, parts:
 * [{ kind, minutes, title, instructions | note, gameId | lessonId | make | pick, groups: [{ group, gameId | lessonId |
 * make | pick }] | versions }] }. -> { plan, notes: [{ k, part?, ... }] } (notes: what was changed or left out)
 */
export function cleanPlan(u, c, raw, { lang = 'en', names = studentNames(u), id = null, totalMax = TOTAL_MAX } = {}) {
  const groups = roomGroups(c), notes = [];
  const src = raw && typeof raw === 'object' ? raw : {};
  const list = Array.isArray(src.parts) ? src.parts : [];
  const parts = [];
  let total = 0;
  for (const p0 of list) {
    if (parts.length >= PARTS_MAX) { notes.push({ k: 'parts', max: PARTS_MAX }); break; }
    const p = p0 && typeof p0 === 'object' ? p0 : {};
    const kind = KINDS.includes(p.kind) ? p.kind : { brainBreak: 'break', 'brain break': 'break', exitCheck: 'exit', 'exit check': 'exit', worktime: 'work', 'work time': 'work', slide: 'slides' }[String(p.kind || '').trim()] || null;
    if (!kind) { notes.push({ k: 'kind', kind: clip(p.kind, 20) }); continue; }
    const n = parts.length + 1, [lo, hi] = RANGE[kind];
    let minutes = Math.round(Number(p.minutes));
    if (!Number.isFinite(minutes)) minutes = DEFAULT_MIN[kind];
    const clamped = Math.max(lo, Math.min(hi, minutes));
    if (clamped !== minutes) notes.push({ k: 'minutes', part: n, from: minutes, to: clamped });
    minutes = clamped;
    if (total + minutes > totalMax) {
      const room = totalMax - total;
      if (room < lo) { notes.push({ k: 'total', max: totalMax, part: n }); break; }
      notes.push({ k: 'minutes', part: n, from: minutes, to: room }); minutes = room;
    }
    total += minutes;
    const title = cleanTitle(p.title, { names, groups, lang });
    if (p.title && !title) notes.push({ k: 'title', part: n });
    const note = PICK_KINDS.has(kind) ? cleanNote(p.instructions ?? p.note, names) : '';
    let versions = [];
    if (PICK_KINDS.has(kind)) {
      const all = pickOf(u, p.pick || p);
      if (hasPick(p.pick || p) && !all) notes.push({ k: 'pick', part: n });
      const listed = Array.isArray(p.groups) ? p.groups : Array.isArray(p.versions) ? p.versions : [];
      const seen = new Set();
      for (const v of listed.slice(0, 8)) {
        if (!v || typeof v !== 'object') continue;
        if (v.group === '' || v.group === undefined) { const pk = pickOf(u, v.pick || v); if (pk && !all) versions.push({ group: '', pick: pk }); continue; }
        const g = groupFor(groups, String(v.group), lang);
        if (!g) { notes.push({ k: 'group', part: n, group: clip(v.group, 40) }); continue; }
        if (seen.has(g.id)) continue;
        const pk = pickOf(u, v.pick || v);
        if (!pk) { if (hasPick(v.pick || v)) notes.push({ k: 'pick', part: n, group: groupLabel(g, lang) }); continue; }
        seen.add(g.id); versions.push({ group: g.id, pick: pk });
      }
      if (all) versions.unshift({ group: '', pick: all });
      // the same for every group: one handout for the whole class
      const everyGroup = groups.length && groups.every(g => versions.some(v => v.group === g.id));
      if (versions.length > 1 && versions.every(v => samePick(v.pick, versions[0].pick)) && (everyGroup || versions.some(v => v.group === ''))) versions = [{ group: '', pick: versions[0].pick }];
      // every group listed: nobody is left for "everyone else" (a student in no group gets the first version: usePlan)
      if (everyGroup && versions.length > 1) versions = versions.filter(v => v.group !== '');
    }
    // only: the listed groups get it and nobody else (an Oomba follow-up's review for one group: services/homeroom-follow.js)
    const only = PICK_KINDS.has(kind) && p.only === true && versions.length > 0 && versions.every(v => v.group);
    parts.push({ id: (typeof p.id === 'string' && /^[A-Za-z0-9_-]{4,16}$/.test(p.id)) ? p.id : uid(8), kind, title, minutes, note, versions, ...(only ? { only: true } : {}) });
  }
  const name = cleanTitle(src.name, { names, max: NAME_MAX });
  const topic = cleanTitle(src.topic, { names, max: TOPIC_MAX });
  return { plan: { id: id || uid(10), name, topic, parts }, notes };
}
const hasPick = p => !!p && typeof p === 'object' && !!(p.gameId || p.game || p.lessonId || p.make || p.type);

/** The plan as the AI is told it landed (and the card shows it): kinds, minutes, titles, what each group gets. */
export function readBack(u, c, plan, lang = 'en') {
  const groups = roomGroups(c);
  return {
    name: plan.name || '', topic: plan.topic || '', totalMinutes: plan.parts.reduce((s, p) => s + p.minutes, 0),
    parts: plan.parts.map((p, i) => ({ n: i + 1, kind: p.kind, minutes: p.minutes, title: p.title || '', ...(p.note ? { instructions: p.note } : {}),
      handouts: p.versions.map(v => ({ for: v.group ? groupLabel(groups.find(g => g.id === v.group), lang) : p.versions.length > 1 ? 'everyone else' : 'whole class', type: v.pick.type === 'make' ? 'new lesson' : v.pick.type, title: pickTitle(u, v.pick, lang) })) })),
  };
}

// ---------------------------------------------------------------- what the AI sees
/** Everything the AI is told about the class for planning: never a student's name, id or work. */
export function aiContext(u, c, { lang = 'en', draft = null } = {}) {
  const names = studentNames(u), room = H.roomOf(c.id);
  const safe = s => scrub(clip(s, 80), names).text;
  const count = gid => Object.values(room.members).filter(x => x === gid).length;
  const board = HO.boardView(c, lang), since = now() - 14 * 86400e3;
  const recent = board.handouts.filter(h => (h.at || 0) >= since).slice(-10).map(h => {
    let finished = 0, of = 0;
    for (const cards of Object.values(board.desks)) { const x = cards.find(k => k.id === h.id); if (x) { of++; if (x.done) finished++; } }
    return { title: safe(h.title), finished, of };
  });
  const oomba = games.listVisible(u, { shelf: 'learn', official: true, order: 'plays', limit: 16 }).filter(g => HO.handable(u, g)).map(g => ({ gameId: g.id, title: safe(games.localizeGame(g, lang).title) }));
  const mine = games.myGames(u.id, 12).filter(g => g.status !== 'deleted' && HO.handable(u, g)).map(g => ({ gameId: g.id, title: safe(g.title) }));
  const today = todayOf(c);
  return {
    class: { grade: clip(c.grade, 20), subject: clip(c.subject, 40), students: room.students.length },
    groups: room.groups.map(g => ({ name: groupLabel(g, lang), students: count(g.id) })),
    lessons: HL.listMine(u, lang).slice(0, 20).map(l => ({ lessonId: l.id, title: safe(l.title), game: safe(l.game), problems: l.n, groupVersions: l.versions.map(v => v.label) })),
    oombaGames: oomba, myGames: mine,
    canBuild: MAKE_SLUGS.filter(s => HL.lessonGame(s)).map(s => (s === 'arithmetic-lab' ? { slug: s, ops: ARITH.ops } : { slug: s, modes: ALGEBRA.modes })),
    recentHandouts: recent,
    // Simpler wording (step 3c): handouts with instructions, by id, for writeSimplerWording (names taken out).
    handoutsWithInstructions: board.handouts.filter(h => h.instructions).slice(-12).map(h => ({ handoutId: h.id, title: safe(h.title), instructions: scrub(clip(h.instructions, 300), names).text, ...(SUP.simpleOf(h.id) ? { simplerNow: scrub(SUP.simpleOf(h.id), names).text } : {}) })),
    savedPlans: listSaved(u).slice(0, 10).map(p => ({ name: p.name, minutes: p.minutes })),
    ...(today ? { todaysPlan: { name: today.name, state: stateOf(today) } } : {}),
    ...(draft ? { draftOnCard: readBack(u, c, draft, lang) } : {}),
    minutes: RANGE, totalMax: TOTAL_MAX, breakIdeas: BREAKS,
  };
}
/** The planning rules for the AI on a class's Homeroom (services/companion.js system: the page's own rules). */
export function workflowRules() {
  return [
    'Day plans (this page is the class\'s Homeroom): when the teacher asks for today\'s plan, a lesson plan for the class, or a change to the plan on the card, call draftDayPlan with the WHOLE plan, parts in order: slides, work time, a brain break, an exit check (minutes for each). The card in the chat shows it; nothing goes on desks until the teacher taps Use this plan.',
    'Work time: use the class\'s groups by name (getPageContext lists them) when a version per group helps; give each group a lesson of the teacher\'s (lessonId) or a game (gameId) from getPageContext or searchGames. A lesson of the teacher\'s already has its own versions per group: give it to the whole class. When no lesson fits, either build one (make: Arithmetic Lab with an op, Algebra Builder with a mode) or hand out a game with short instructions. Never invent ids.',
    'Changes ("make work time 20 minutes", "swap the brain break"): call draftDayPlan again with the whole plan changed (the draft on the card is in getPageContext). To use a plan the teacher saved ("use my Fractions day plan again"), call useSavedPlan with its name.',
    'Titles are short and never name a group or a student (they show on the projector). After drafting, say in one or two sentences what the plan is and that the teacher can ask for changes or tap Use this plan. Report only what the tool says landed.',
    'Simpler wording (supports): when the teacher asks for simpler words for a handout\'s instructions, call writeSimplerWording with its handoutId from getPageContext and the simpler text: short sentences, everyday words, the same task.',
  ].join('\n');
}

// ---------------------------------------------------------------- a plan without the AI
/** Topic words from a request ("plan today on fractions" -> "fractions"). */
export function topicOf(text) {
  const m = /\b(?:on|about|for|of)\s+([\p{L}\p{N}][\p{L}\p{N}' -]{1,60})/iu.exec(String(text || ''));
  if (!m) return '';
  const w = m[1].split(/\s+/).filter(x => !/^(today|todays|today's|tomorrow|class|the|my|our|plan|day|lesson|please|now)$/i.test(x)).join(' ').trim();
  return w.slice(0, TOPIC_MAX);
}
/** A starting plan from what the teacher already has: a lesson of theirs that fits the topic, else an Oomba game that
 *  fits, else their newest lesson, else the most played Oomba game; slides, a brain break and an exit check around it. */
export function startingPlan(u, c, { topic = '', lang = 'en' } = {}) {
  const tw = words(topic), fits = s => tw.length && words(s).some(w => tw.some(x => w.startsWith(x) || x.startsWith(w)));
  const lessons = HL.listMine(u, lang).filter(l => HO.handable(u, games.getGame(l.gameId)));
  const oomba = games.listVisible(u, { shelf: 'learn', official: true, order: 'plays', limit: 24 }).filter(g => HO.handable(u, g));
  const lesson = lessons.find(l => fits(l.title) || fits(l.game));
  const game = !lesson ? oomba.find(g => fits(games.localizeGame(g, lang).title) || fits(g.tags)) : null;
  const pick = lesson ? { lessonId: lesson.id } : game ? { gameId: game.id } : lessons[0] ? { lessonId: lessons[0].id } : oomba[0] ? { gameId: oomba[0].id } : null;
  const t = tFor(lang);
  return cleanPlan(u, c, {
    name: topic ? t('js.companion.plan.dayOf', { topic }) : '', topic,
    parts: [
      { kind: 'slides', minutes: DEFAULT_MIN.slides, title: topic || '' },
      { kind: 'work', minutes: DEFAULT_MIN.work, ...(pick || {}) },
      { kind: 'break', minutes: DEFAULT_MIN.break, title: BREAKS[0] },
      { kind: 'exit', minutes: DEFAULT_MIN.exit, title: t('js.companion.plan.exitDefault') },
    ],
  }, { lang });
}
const PART_WORDS = [['break', /brain\s*break|\bbreak\b/i], ['exit', /exit(\s*check)?|\bcheck\b/i], ['slides', /slides?|intro/i], ['work', /work(\s*time)?|practice/i]];
/** A small change to a plan in the teacher's words, without the AI: "make work time 20 minutes", "swap the brain
 *  break". -> { plan, did: 'minutes' | 'break' } | null */
export function quickEdit(u, c, plan, text, { lang = 'en' } = {}) {
  const s = String(text || '');
  if (!plan || !Array.isArray(plan.parts) || !plan.parts.length) return null;
  const parts = plan.parts.map(p => ({ ...p, versions: p.versions.map(v => ({ ...v })) }));
  const which = PART_WORDS.find(([, re]) => re.test(s));
  const mins = /(\d{1,3})\s*(?:min|minutes?|mins?)\b/i.exec(s);
  if (which && mins) {
    const p = parts.find(x => x.kind === which[0]); if (!p) return null;
    p.minutes = Number(mins[1]);
    const r = cleanPlan(u, c, { ...plan, parts }, { lang, id: plan.id });
    return { ...r, did: 'minutes' };
  }
  if (/\b(swap|change|another|different|new|other)\b/i.test(s) && /break/i.test(s)) {
    const p = parts.find(x => x.kind === 'break'); if (!p) return null;
    const i = BREAKS.indexOf(p.title);
    p.title = BREAKS[(i + 1) % BREAKS.length];
    return { ...cleanPlan(u, c, { ...plan, parts }, { lang, id: plan.id }), did: 'break' };
  }
  return null;
}
/** Without the AI: a saved plan the words name, a change to the newest draft, or a starting plan. -> { plan, notes,
 *  how: 'saved' | 'minutes' | 'break' | 'start' } */
export function fallbackDraft(u, c, text, { lang = 'en', draft = null } = {}) {
  if (/\b(again|saved|use my|reuse)\b/i.test(String(text || ''))) {
    const s = findSaved(u, text);
    if (s) { const r = fromSaved(u, c, s, { lang }); return { ...r, how: 'saved' }; }
  }
  const e = draft ? quickEdit(u, c, draft, text, { lang }) : null;
  if (e) return { plan: e.plan, notes: e.notes, how: e.did };
  return { ...startingPlan(u, c, { topic: topicOf(text), lang }), how: 'start' };
}

// ---------------------------------------------------------------- saved plans
const savedRow = (u, id) => q.get('SELECT * FROM homeroom_day_plans WHERE id=? AND owner_id=?', String(id || ''), u.id) || null;
/** Group ids -> the groups' identities (a name, or an unnamed default group's key), for another class or later. */
export function portable(c, plan) {
  const groups = roomGroups(c);
  return plan.parts.map(p => ({ ...p, versions: p.versions.map(v => ({ ...v, group: v.group ? groupIdent(groups.find(g => g.id === v.group)) || '' : '' })) }));
}
/** A group identity's name ('n:stretch' -> stretch, 'k:onTrack' -> On track in the teacher's language). */
const identLabel = (ident, lang = 'en') => (String(ident).startsWith('k:') ? groupLabel({ key: String(ident).slice(2) }, lang) : String(ident).slice(2));
/** The class's group for an identity: the same identity, else the same name (a default group renamed to its own name, or
 *  a named group called like a default one, "Stretch" either way). */
export function groupByIdent(groups, ident, lang = 'en') {
  const l = fold(identLabel(ident, lang));
  return groups.find(x => groupIdent(x) === ident) || (l ? groups.find(x => fold(groupLabel(x, lang)) === l) : null) || null;
}
/** A portable plan's parts for this class: each version's group found by its identity or name; a version whose group the
 *  class doesn't have is left out (noted), or, with everyone (copying to another class), goes to everyone else when the
 *  part has no such version yet ("no Stretch group in 5C: goes to everyone"). -> raw parts for cleanPlan */
function forClass(c, parts, notes, { everyone = false, lang = 'en', day = undefined } = {}) {
  const groups = roomGroups(c);
  return (Array.isArray(parts) ? parts : []).map((p, i) => {
    let open = everyone && !(p.versions || []).some(v => !v.group);
    const versions = [];
    for (const v0 of p.versions || []) {
      const v = { group: v0.group, pick: v0.pick };
      if (!v.group) { versions.push(v); continue; }
      const g = groupByIdent(groups, v.group, lang);
      if (g) { v.group = g.id; versions.push(v); continue; }
      const name = identLabel(v.group, lang);
      if (open) { open = false; versions.push({ group: '', pick: v.pick }); notes.push({ k: 'groupEveryone', part: i + 1, group: name, ...(day !== undefined ? { day } : {}) }); }
      else notes.push({ k: 'group', part: i + 1, group: name, ...(day !== undefined ? { day } : {}) });
    }
    return { ...p, versions };
  });
}
/** The teacher's saved plans, newest first: [{ id, name, parts, minutes, updated }]. */
export function listSaved(u) {
  return q.all('SELECT * FROM homeroom_day_plans WHERE owner_id=? ORDER BY updated_at DESC LIMIT ?', u.id, SAVED_MAX).map(r => {
    const parts = json(r.parts, []);
    return { id: r.id, name: r.name, parts: parts.length, minutes: parts.reduce((s, p) => s + (Number(p.minutes) || 0), 0), updated: r.updated_at };
  });
}
/** Save Plan: by name (the same name again replaces it). -> { ok, saved: { id, name } } */
export function savePlan(u, c, plan, name) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  const n = cleanTitle(name, { names: studentNames(u), max: NAME_MAX });
  if (!n) return fail(String(name || '').trim() ? 'planName' : 'needName');
  if (!plan || !Array.isArray(plan.parts) || !plan.parts.length) return fail('noPlan');
  const t = now(), same = q.get('SELECT id FROM homeroom_day_plans WHERE owner_id=? AND lower(name)=lower(?)', u.id, n);
  const body = JSON.stringify(portable(c, plan));
  if (same) q.run('UPDATE homeroom_day_plans SET name=?, topic=?, parts=?, updated_at=? WHERE id=?', n, plan.topic || '', body, t, same.id);
  else {
    if (q.get('SELECT COUNT(*) n FROM homeroom_day_plans WHERE owner_id=?', u.id).n >= SAVED_MAX) return fail('tooManyPlans');
    q.run('INSERT INTO homeroom_day_plans(id, owner_id, name, topic, parts, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', uid(10), u.id, n, plan.topic || '', body, t, t);
  }
  const row = q.get('SELECT id, name FROM homeroom_day_plans WHERE owner_id=? AND lower(name)=lower(?)', u.id, n);
  audit(u.id, 'homeroom.planSave', row.id, { parts: plan.parts.length });
  return ok({ saved: { id: row.id, name: row.name } });
}
/** The saved plan the words mean ("use my Fractions day plan again"): the most name words in common. */
export function findSaved(u, text) {
  const tw = new Set(words(text).filter(w => !['use', 'again', 'plan', 'day', 'saved', 'reuse', 'please', 'today', 'my'].includes(w)));
  let best = null, score = 0;
  for (const r of q.all('SELECT * FROM homeroom_day_plans WHERE owner_id=? ORDER BY updated_at DESC LIMIT ?', u.id, SAVED_MAX)) {
    const n = words(r.name).filter(w => tw.has(w) || [...tw].some(x => x.length > 3 && (w.startsWith(x) || x.startsWith(w)))).length;
    if (n > score) { best = r; score = n; }
  }
  return best;
}
export const savedById = savedRow;
/** A saved plan as a new draft for this class. -> { plan, notes } */
export function fromSaved(u, c, row, { lang = 'en' } = {}) {
  const notes = [];
  const parts = forClass(c, json(row.parts, []), notes);
  const r = cleanPlan(u, c, { name: row.name, topic: row.topic, parts }, { lang });
  return { plan: r.plan, notes: [...notes, ...r.notes], savedFrom: { id: row.id, name: row.name } };
}
/** A plan made for one class, for another class of the same teacher (a copy): the groups found there by name or
 *  default key; a group it doesn't have gets the "everyone" version. Lessons and handouts are not made here: they are
 *  made in that class when the plan is used (usePlan). -> { plan, notes } */
export function planFor(u, from, to, plan, { lang = 'en', day = undefined, totalMax = TOTAL_MAX } = {}) {
  const notes = [];
  const parts = forClass(to, portable(from, plan), notes, { everyone: true, lang, day });
  const r = cleanPlan(u, to, { name: plan.name, topic: plan.topic, parts }, { lang, totalMax });
  // a version given to everyone that the check then left out (every group there has its own): left out, said so
  for (const n of notes) if (n.k === 'groupEveryone' && !(r.plan.parts[n.part - 1] && r.plan.parts[n.part - 1].versions.some(v => !v.group))) n.k = 'group';
  return { plan: r.plan, notes: [...notes, ...r.notes] };
}
/** Copy a plan to another class of the same teacher (a section): the groups found there by name. -> { ok, plan, notes, c } */
export function copyTo(u, from, plan, toId, { lang = 'en' } = {}) {
  const to = S.getClass(String(toId || ''));
  if (!H.canUseClass(u, from) || !to || !H.canUseClass(u, to) || to.id === from.id) return fail('notFound');
  return ok({ ...planFor(u, from, to, plan, { lang }), c: to });
}
/** What a copy would do in the other class, before it is made (the copy preview): each part with what it hands out to
 *  whom there, and the groups that class doesn't have ("no Stretch group in 5C: goes to everyone"). Nothing is changed.
 *  -> { parts: [{ n, kind, title, minutes, give: [{ who, what, type }] }], missing: [{ group, to: 'everyone' | 'none' }] } */
export function previewOf(u, to, plan, notes, lang = 'en') {
  const groups = roomGroups(to), seen = new Set(), missing = [];
  for (const n of notes) {
    if ((n.k !== 'group' && n.k !== 'groupEveryone') || seen.has(`${n.group}:${n.k}`)) continue;
    seen.add(`${n.group}:${n.k}`); missing.push({ group: n.group, to: n.k === 'groupEveryone' ? 'everyone' : 'none' });
  }
  return {
    parts: plan.parts.map((p, i) => ({ n: i + 1, kind: p.kind, title: p.title || '', minutes: p.minutes,
      give: p.versions.map(v => ({ who: v.group ? groupLabel(groups.find(g => g.id === v.group), lang) : '', everyone: !v.group, others: !v.group && p.versions.length > 1, what: pickTitle(u, v.pick, lang), type: v.pick.type })) })),
    missing: missing.filter(m => m.to === 'everyone' || !seen.has(`${m.group}:groupEveryone`)),
  };
}
/** The other classes of this teacher a plan can be copied to. */
export const copyTargets = (u, c) => H.switchable(u).filter(x => x.id !== c.id && H.canUseClass(u, S.getClass(x.id)));

// ---------------------------------------------------------------- the class's plan of today
const roomRow = classId => q.get('SELECT day_plan FROM homeroom_rooms WHERE class_id=?', classId) || null;
/** Today's plan of the class, or null (none, or from an earlier day). */
export function todayOf(c, at = now()) {
  const r = roomRow(c.id), p = r ? json(r.day_plan, null) : null;
  if (!p || !Array.isArray(p.parts) || !p.usedAt || at - p.usedAt > KEEP_MS) return null;
  return p;
}
function write(classId, plan) {
  // (as the teacher's desk: updated_at is left alone, so desks and the projector don't fetch the teacher's area again)
  const t = now();
  q.run('INSERT INTO homeroom_rooms(class_id, groups, created_at, updated_at) VALUES (?,?,?,?) ON CONFLICT(class_id) DO NOTHING', classId, JSON.stringify(DEFAULT_GROUPS), t, t);
  q.run('UPDATE homeroom_rooms SET day_plan=? WHERE class_id=?', plan ? JSON.stringify(plan) : '', classId);
}
export const stateOf = p => (!p ? 'none' : p.finishedAt ? 'finished' : !p.run ? 'ready' : p.run.done ? 'done' : 'running');

/** One pick on desks for some students: a game (handOut), a lesson of the teacher's (handOutLesson), or a lesson the
 *  builder makes first (saveLesson with the builder's defaults and a version per group). -> { ok, ids } | fail */
function giveOne(u, c, pick, to, { note = '', lang = 'en', kind = 'work' } = {}) {
  if (pick.type === 'game') {
    const r = HO.handOut(u, c, { gameId: pick.id, to, instructions: note, order: 'any', grade: 'completion' });
    return r.ok ? ok({ ids: [r.classLesson.id] }) : r;
  }
  let lessonId = pick.id;
  if (pick.type === 'make') {
    const g = HL.lessonGame(pick.slug);
    if (!g) return fail('pickGame');
    const base = fill(pick.slug, pick.slug === 'arithmetic-lab' ? { op: pick.op, count: 10 } : { mode: pick.mode });
    const groups = roomGroups(c).filter(x => groupIdent(x));
    const versions = groups.length > 1 ? groups.map((x, i) => ({ key: groupIdent(x), label: groupLabel(x, lang), s: suggest(pick.slug, base, leanOf(i, groups.length)) })) : [];
    const title = pick.title || `${games.localizeGame(g, lang).title}: ${tFor(lang)(kind === 'exit' ? 'js.companion.plan.kind.exit' : 'js.companion.plan.kind.work')}`;
    const r = HL.saveLesson(u, { slug: pick.slug, title: title.slice(0, HL.TITLE_MAX), instructions: note, base, versions });
    if (!r.ok) return r;
    lessonId = r.lesson.id;
    // from now on the plan names the lesson it made (a desk after this one, a saved copy, a copy for another class)
    for (const k of Object.keys(pick)) delete pick[k];
    Object.assign(pick, { type: 'lesson', id: lessonId });
  }
  const r = HL.handOutLesson(u, c, { lessonId, to, order: 'any', grade: 'score' });
  return r.ok ? ok({ ids: r.classLessons.map(x => x.id) }) : r;
}
/**
 * Use this plan: every part's handouts on desks (per group where the versions differ, Whole class otherwise; a student
 * in no group gets the "everyone else" version, else the first), and the plan is the class's plan of today. Refused
 * while another plan is running (finish it first). -> { ok, plan, given, already, failed: [{ part, code }] }
 */
export function usePlan(u, c, plan, { lang = 'en' } = {}) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  const cur = todayOf(c);
  if (cur && ['running', 'done'].includes(stateOf(cur)) && cur.id !== plan.id) return fail('planRunning');
  if (cur && cur.id === plan.id) return fail('planUsed');
  const r0 = cleanPlan(u, c, plan, { lang, id: plan.id });
  const p = r0.plan;
  if (!p.parts.length) return fail('noPlan');
  const room = H.roomOf(c.id);
  let given = 0, already = 0;
  const failed = [];
  for (const [i, part] of p.parts.entries()) {
    part.handouts = [];
    if (!part.versions.length) continue;
    const one = part.versions.length === 1 && !part.versions[0].group;
    const jobs = one ? [{ pick: part.versions[0].pick, to: { kind: 'all' } }] : [];
    if (!one) {
      for (const v of part.versions.filter(x => x.group)) jobs.push({ pick: v.pick, to: { kind: 'group', id: v.group } });
      // students in no listed group: the "everyone else" version, else the first listed one, desk by desk
      const listed = new Set(part.versions.filter(x => x.group).map(x => x.group));
      const rest = part.versions.find(x => !x.group) || part.versions[0];
      if (!part.only) for (const s of room.students) if (!listed.has(room.members[s.id])) jobs.push({ pick: rest.pick, to: { kind: 'desk', id: s.id } });
    }
    for (const j of jobs) {
      const r = giveOne(u, c, j.pick, j.to, { note: part.note, lang, kind: part.kind });
      if (r.ok) { part.handouts.push(...r.ids); given += r.ids.length; } else if (r.code === 'alreadyOnDesk' || r.code === 'lessonOnDesk') already++;
      else if (r.code !== 'emptyGroup') failed.push({ part: i + 1, code: r.code });
    }
  }
  const today = { ...p, usedAt: now(), by: u.id, run: null };
  write(c.id, today);
  audit(u.id, 'homeroom.planUse', c.id, { plan: p.id, parts: p.parts.length, given, already, failed: failed.length });
  return ok({ plan: today, given, already, failed });
}

/** The timer, by the class's teachers only: start (part 1), more (+5 min), next (the next part; past the last one the
 *  plan is done and waits for Finish class), finish (the summary), clear (no plan of today; handouts stay). Never moves
 *  on by itself. -> { ok, plan, summary? } */
/** What a sub may do with the plan's timer (docs/decisions.md "Homeroom: supports, aides and sub links"): Start, +5 min
 *  and Next; never Finish (its summary counts finished work) or Clear. */
export const SUB_ACTIONS = Object.freeze(['start', 'more', 'next']);
export function runAction(u, c, action, at = now()) {
  if (!H.canUseClass(u, c)) {
    const role = H.helperRole(u, c);
    if (!role) return fail('notFound');
    if (role !== 'sub' || !SUB_ACTIONS.includes(action)) return fail('forbidden');
  }
  // A day of a week plan (services/homeroom-week.js) waits for the teacher: Put on desks (use) or Start (both) is theirs.
  let p = todayOf(c, at), put = null;
  if (action === 'use' || (action === 'start' && !p)) {
    const d = p ? null : HW.datedToday(c, at);
    if (action === 'use' && p) return ok({ plan: p });
    if (!d) return fail('noPlan');
    if (!H.canUseClass(u, c)) return fail('forbidden');
    put = usePlan(u, c, d);
    if (!put.ok) return put;
    if (action === 'use') return ok({ plan: put.plan, put });
    p = todayOf(c, at);
  }
  if (!p) return fail('noPlan');
  const st = stateOf(p);
  if (action === 'clear') { write(c.id, null); audit(u.id, 'homeroom.plan', c.id, { action }); return ok({ plan: null }); }
  if (action === 'start') {
    if (st === 'running' || st === 'done') return ok({ plan: p });
    p.run = { idx: 0, startedAt: at, partAt: at, extra: 0, log: [] };
    p.finishedAt = null; p.summary = null;
  } else if (action === 'more') {
    if (st !== 'running') return fail('notRunning');
    p.run.extra = Math.min(EXTRA_MAX, (p.run.extra || 0) + MORE_MS);
  } else if (action === 'next') {
    if (st !== 'running') return fail('notRunning');
    p.run.log.push({ idx: p.run.idx, start: p.run.partAt, end: at });
    p.run.idx += 1; p.run.partAt = at; p.run.extra = 0;
    if (p.run.idx >= p.parts.length) p.run.done = true;
  } else if (action === 'finish') {
    if (st === 'ready' || st === 'finished') return fail(st === 'finished' ? 'planFinished' : 'notRunning');
    if (!p.run.done) p.run.log.push({ idx: p.run.idx, start: p.run.partAt, end: at, open: true });
    p.finishedAt = at;
    p.summary = summaryOf(c, p);
  } else return fail('badAction');
  write(c.id, p);
  audit(u.id, 'homeroom.plan', c.id, { action, part: p.run ? p.run.idx : null });
  return ok({ plan: p, ...(put ? { put } : {}), ...(action === 'finish' ? { summary: p.summary } : {}) });
}
/** Finish class: each part with its planned and used minutes and, for a part that handed something out, how many of
 *  its handouts' cards are finished out of how many desks got one (counts only: no names, no order of students). */
export function summaryOf(c, p) {
  // (students marked absent today are counted on their own, never as unfinished: "2 absent")
  const board = HO.boardView(c), att = board.att || {}, absent = Object.values(att).filter(x => x === 'absent').length;
  const byLog = new Map((p.run && p.run.log || []).map(x => [x.idx, x]));
  const parts = p.parts.map((part, i) => {
    const l = byLog.get(i);
    let finished = 0, of = 0;
    for (const id of part.handouts || []) for (const [sid, cards] of Object.entries(board.desks)) { if (att[sid] === 'absent') continue; const k = cards.find(x => x.id === id); if (k) { of++; if (k.done) finished++; } }
    return { kind: part.kind, title: part.title || '', planned: part.minutes, used: l ? Math.max(0, Math.round((l.end - l.start) / 60e3)) : 0, done: !!l && !l.open, cut: !!l && !!l.open, ...(part.handouts && part.handouts.length ? { finished, of } : {}) };
  });
  const homework = parts.reduce((s, x) => s + (x.of ? x.of - x.finished : 0), 0);
  return { name: p.name || '', parts, partsDone: parts.filter(x => x.done).length, partsTotal: parts.length,
    planned: parts.reduce((s, x) => s + x.planned, 0), used: p.run ? Math.max(0, Math.round(((p.finishedAt || now()) - p.run.startedAt) / 60e3)) : 0, homework, absent };
}

// ---------------------------------------------------------------- what pages see
/** The board's plan pill: today's plan with every part and the timer. The class's teachers only (the Homeroom gate). */
export function teacherView(c, at = now()) {
  const p = todayOf(c, at), week = HW.stripOf(c, at);
  if (!p) {
    // today's day of a week plan, not on desks yet: the pill says Today with Start (week: the strip in its menu)
    const d = HW.datedToday(c, at);
    if (!d) return week ? { state: 'none', now: at, week } : null;
    return { id: d.id, name: d.name || '', state: 'planned', now: at, half: !!d.half, parts: d.parts.map(x => ({ id: x.id, kind: x.kind, title: x.title || '', minutes: x.minutes, handouts: 0 })),
      run: null, behindMin: 0, endsAt: null, timesUp: false, ...(week ? { week } : {}) };
  }
  const tm = timing(p.parts, p.finishedAt ? null : p.run, at);
  return { id: p.id, name: p.name || '', state: stateOf(p), now: at, parts: p.parts.map(x => ({ id: x.id, kind: x.kind, title: x.title || '', minutes: x.minutes, handouts: (x.handouts || []).length })),
    run: p.run && !p.finishedAt ? { idx: p.run.idx, startedAt: p.run.startedAt, partAt: p.run.partAt, extra: p.run.extra || 0, done: !!p.run.done } : null,
    behindMin: tm.behindMin, endsAt: tm.endsAt, timesUp: tm.timesUp, ...(p.summary ? { summary: p.summary } : {}), ...(week ? { week } : {}) };
}
/** The projector's and the desks' Now / Next: only part kinds, titles and the timer, while a plan runs. Never a name, a
 *  group, a hand or anyone's progress. */
export function publicView(c, at = now()) {
  const p = todayOf(c, at);
  if (!p || !p.run || p.finishedAt) return null;
  const tm = timing(p.parts, p.run, at), one = x => (x ? { kind: x.kind, title: x.title || '' } : null);
  return { now: at, done: tm.done, part: one(tm.part), next: one(tm.next), endsAt: tm.endsAt, timesUp: tm.timesUp };
}

/** A desk's Now / Next (publicView) and, for a student with extra time (services/homeroom-supports.js), their own
 *  longer clock for the part on now: mine: { endsAt, time } (the part's start plus its minutes and any +5 min, times
 *  their extra time). Their own only; nobody else's desk shows it. */
export function deskView(c, sup = null, at = now()) {
  const v = publicView(c, at);
  if (!v || v.done || !v.endsAt || !sup || !(sup.time > 100)) return v;
  const p = todayOf(c, at);
  return { ...v, mine: { endsAt: p.run.partAt + Math.round((v.endsAt - p.run.partAt) * (sup.time / 100)), time: sup.time } };
}

// ---------------------------------------------------------------- the card in the chat
/** A plan card for the chat (services/companion.js note.plan): the class it is for and the plan. */
export const newCard = (c, r, lang = 'en', extra = {}) => ({ id: uid(10), classId: c.id, plan: r.plan, notes: (r.notes || []).slice(0, 10), state: 'draft', lang, ...extra });
/** A plan's parts as a card draws them: kind, title, minutes, the note, and what each group gets (the groups' names). */
export function partsView(u, c, plan, tt, lang = 'en') {
  const groups = roomGroups(c), lab = g => (g && g.name) || (g && g.key ? tt(`js.homeroom.groups.${g.key}`) : tt('js.homeroom.groups.unnamed'));
  return plan.parts.map(p => ({ kind: p.kind, title: p.title || '', minutes: p.minutes, note: p.note || '',
    give: p.versions.map(v => ({ who: v.group ? lab(groups.find(g => g.id === v.group)) : p.versions.length > 1 ? tt('js.companion.plan.everyoneElse') : '', what: pickTitle(u, v.pick, lang), icon: pickIcon(u, v.pick), type: v.pick.type })) }));
}
/** The card as the teacher's page draws it (services/companion.js dress): names of what each part hands out, the
 *  groups' names, where the class's plan of today stands, the saved plans and the classes it can be copied to. tt: the
 *  page's own strings (req.t). Only for the card's own teacher, who teaches the class. */
export function cardView(u, card, tt) {
  const c = card && S.getClass(card.classId);
  if (!c || !H.canUseClass(u, c)) return { id: card && card.id, gone: true };
  const lang = card.lang || 'en', today = todayOf(c);
  const plan = card.plan || { parts: [] };
  const mine = today && today.id === plan.id;
  const state = mine ? stateOf(today) : card.state === 'used' ? 'past' : 'draft';
  return {
    id: card.id, classId: c.id, className: c.name, name: plan.name || '', topic: plan.topic || '', state, savedAs: card.savedAs || null, from: card.from || null, how: card.how || '',
    total: plan.parts.reduce((s, p) => s + p.minutes, 0), changed: (card.notes || []).length,
    otherRunning: !mine && !!today && ['running', 'done'].includes(stateOf(today)),
    parts: partsView(u, c, plan, tt, lang).map((x, i) => ({ ...x,
      now: mine && today.run && !today.finishedAt && !today.run.done && today.run.idx === i,
      done: mine && !!today.run && (today.run.done || today.run.idx > i) })),
    saved: listSaved(u).slice(0, 6).map(s => ({ id: s.id, name: s.name, minutes: s.minutes })),
    copy: copyTargets(u, c).slice(0, 8),
  };
}
