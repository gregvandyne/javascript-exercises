// The game plan: what a builder chose in the step-by-step setup (/build/new, routes/build-setup.js) before the Builder.
// It reaches the Builder as STRUCTURED DATA beside the first message, never only as words:
//   { v: 1, type, look, world, characters: [...], learn: [...], notes }
//   type, world and each character are a choice: { from: 'pack', id } (one of ours: a game type the Builder has a
//   starter for, a shipped 3D world, a character of the catalogue) or { from: 'custom', text } (typed under "Something
//   else": OUTSIDE the packs, so the Builder makes that part from scratch). null / [] / '' means "the Builder decides".
//   look: '3d' | '2d' | 'auto' | null.   learn: [{ id }] from LEARN, or { text } typed.
//   play: how it will be played (the "How will it be played?" step): 'live' (with a class or group on Oomba Live: everyone
//   on their own device, a teacher or grown-up hosts it from the big screen), 'screen' (on one screen: the board, or one
//   device passed around) or 'solo' (on my own); left out when not answered (an older page): the Builder decides.
//   kind: 'activity' (a classroom activity on Oomba Canvas: the "What are you making?" card) or 'arcade' (or left out:
//   an arcade game, everything above). An activity's plan is { v, kind: 'activity', topic, tool, support, played, grade }
//   (and the arcade fields empty): topic { id } (a chip of CANVAS_TOPICS) or { text } (typed, screened like any message),
//   tool the kit tool the chip means ('' for typed words: the Builder picks), support 'watch' | 'count' | 'guided' |
//   'own', played 'devices' | 'board' | 'both', grade the class's grade ('K', '1'...'8' or ''). Only the topic and the
//   grade reach the model: never the class, never a student.
// This module: what the steps offer (from the Builder's own catalogue, never typed twice), the check of a plan that
// came from a page (normalisePlan: unknown ids are dropped, typed text is trimmed), the sentence the builder reads and
// sends (planSentence, their language), the engine the plan means (planEngine, engineFor) and the block the model reads
// (planNote). Pure (no database). The typed parts are screened as part of the message, like any typed message
// (builder/agent.js): nothing here skips or adds a check.
import { KIT2_WORLDS, KIT2_CHARACTERS, KIT2_CREATURE_GROUPS, KIT2_GROUP_LIST, WORLD_IDS, DEFAULT_WORLD, worldById, characterById, heroesOf, heroFor, kit2Of, wantsKit2 } from './kit2.js';
import { ART2D_CHARACTERS, ART2D_WORLD_IDS, ART2D_TEMPLATES, art2dCharacter, art2dFriends, isArt2dGame, wantsArt2d } from './art2d.js';
import { BUILDER_TEMPLATE_KEYS } from './catalog.js';
import { tEn } from '../i18n/index.js';

export const PLAN_VERSION = 1;
// characters: as many as they like ("Select all" on every group picks everyone there is), with room to grow.
export const LIMITS = { idea: 80, notes: 300, characters: 80, learn: 5 };
/** The game types the steps offer. template: the Builder's ready-made starter for it (builder/catalog.js), when it has
 *  one; flat: a kind that is only made in 2D (cards, a board, words, two players, catching).
 *  class: in the "For your class" group (classroom activities; quiz, memory and word are classroom-friendly games too).
 *  starter: a classroom starter (builder/catalog.js CLASSROOM_TEMPLATE_KEYS: plain HTML for the board, not on the kit):
 *  no 3D world, no world and no characters, so those steps are skipped (skip), and "teaches" too where it makes no sense.
 *  teacher: offered to staff accounts only (a class survey, an exit ticket); every other classroom type is for kids too. */
const SKIP_SCENE = ['look', 'world', 'chars'], SKIP_ALL = [...SKIP_SCENE, 'learn'];
const TYPES = [
  { id: 'adventure' }, { id: 'runner', template: 'runner' }, { id: 'catch', template: 'catch', flat: true },
  { id: 'quiz', template: 'quiz', flat: true, class: true }, { id: 'memory', template: 'memory', flat: true, class: true },
  { id: 'word', template: 'word', flat: true, class: true }, { id: 'duel', template: 'duel', flat: true }, { id: 'board', template: 'board', flat: true },
  // the classroom starters
  { id: 'quiet', template: 'quiet', starter: true, skip: SKIP_ALL },
  { id: 'categories', template: 'categories', starter: true, skip: SKIP_SCENE },
  { id: 'survey', template: 'survey', starter: true, skip: SKIP_ALL, teacher: true },
  { id: 'bingo', template: 'bingo', starter: true, skip: SKIP_SCENE },
  { id: 'flashcards', template: 'flashcards', starter: true, skip: SKIP_SCENE },
  { id: 'exitticket', template: 'exitticket', starter: true, skip: SKIP_SCENE, teacher: true },
  { id: 'spinner', template: 'spinner', starter: true, skip: SKIP_ALL },
  { id: 'scoreboard', template: 'scoreboard', starter: true, skip: SKIP_ALL },
];
export const GAME_TYPES = TYPES.map(x => ({
  id: x.id, template: BUILDER_TEMPLATE_KEYS.includes(x.template) ? x.template : '', flat: !!(x.flat || x.starter),
  class: !!(x.class || x.starter), starter: !!x.starter, teacher: !!x.teacher, skip: x.skip || [],
}));
export const TYPE_IDS = GAME_TYPES.map(t => t.id);
export const typeById = id => GAME_TYPES.find(x => x.id === id) || null;
/**
 * The game-type step's groups, in order, for this viewer: [{ id: 'class' | 'games', items: [type] }].
 *   A teacher (school staff or the platform admin): "For your class" first (and the group shown at first), every
 *   classroom type and then quiz, word and memory; then the other games.
 *   Everyone else (kids, families): the games in today's order, then the classroom types that suit kids.
 */
export function typeGroups({ teacher = false } = {}) {
  const starters = GAME_TYPES.filter(x => x.starter), games = GAME_TYPES.filter(x => !x.starter);
  if (teacher) {
    const classGames = ['quiz', 'word', 'memory'].map(typeById);
    return [{ id: 'class', items: [...starters, ...classGames] }, { id: 'games', items: games.filter(x => !classGames.includes(x)) }];
  }
  return [{ id: 'games', items: games }, { id: 'class', items: starters.filter(x => !x.teacher) }];
}
/** Words typed under "Something else" (or anywhere a kind of game is matched) that mean one of the classroom types.
 *  "Jeopardy" is a trademark: the word may be typed and is matched here, but the product only ever says Category Board. */
export const CLASSROOM_WORDS = [
  ['categories', /\bjeopardy\b|\bcategor(y|ies) (board|game|quiz)\b|\bpoints board\b|\bquiz board\b/i],
  ['quiet', /\bquiet (game|time|timer|meter)\b|\bnoise (meter|monitor|level)\b|\bvolume meter\b|\bvoice level\b|\bsound meter\b/i],
  ['survey', /\b(class )?surveys?\b|\b(class )?polls?\b|\bquestionnaires?\b/i],
  ['exitticket', /\bexit (ticket|slip|pass)s?\b/i],
  ['bingo', /\bbingo\b|\blotto\b/i],
  ['flashcards', /\bflash ?cards?\b/i],
  ['spinner', /\bspinner\b|\bspin(ning)? (the )?wheel\b|\brandom (picker|chooser|team|topic|question)\b|\bpicker wheel\b/i],
  ['scoreboard', /\bscore ?board\b|\bscore ?keeper\b|\bteam (points|scores?)\b|\bpoints tally\b/i],
];
/** The classroom type some typed words ask for, or ''. forKid: a kid's or family's plan (teacher-only types are left out). */
export function classroomTypeFor(text, { forKid = false } = {}) {
  const s = String(text || '');
  for (const [id, re] of CLASSROOM_WORDS) if (re.test(s) && !(forKid && typeById(id).teacher)) return id;
  return '';
}
export const LOOKS = ['3d', '2d', 'auto'];

// ---- How it will be played -----------------------------------------------------------------------------------------
/** The answers of "How will it be played?", in the order the step shows them. */
export const PLAYS = ['live', 'screen', 'solo'];
/** Why a kind of game cannot be played live (yet), by type: a one-line reason the step shows on the greyed-out Live
 *  card (buildSetup.play.why.<code>) and the Studio's "Make it live" says. A type that is not listed can be live.
 *    board: a tool for the board that the whole room shares (the quiet game, the spinner, the scoreboard)
 *    survey: answers are only counted on this device and never sent anywhere (docs/decisions.md, the class survey)
 *    exitticket: stores nothing per student; each student's answers belong in a class lesson's question step */
export const LIVE_NOT = { quiet: 'board', spinner: 'board', scoreboard: 'board', survey: 'survey', exitticket: 'exitticket' };
/** And by engine: the ready-made 3D worlds (Kit 2, Oomba3D) have no live play yet (kit2.js KIT2_RULES say so too), nor
 *  do classroom activities (Oomba Canvas: live canvas runs are a later phase). */
export const LIVE_NOT_ENGINE = { kit2: 'kit2', canvas: 'canvas' };
/** The default answer by type for a teacher (staff) and for everyone else. A teacher's classroom types that work live
 *  start on Live; the tools for the board start on one screen; everyone else starts on their own, except the types that
 *  are one screen by nature (the board tools, two players on one keyboard). */
const PLAY_TEACHER = { quiz: 'live', word: 'live', memory: 'live', categories: 'live', bingo: 'live', adventure: 'live', runner: 'live', catch: 'live',
  flashcards: 'screen', quiet: 'screen', spinner: 'screen', scoreboard: 'screen', survey: 'screen', duel: 'screen', board: 'screen', exitticket: 'solo' };
const PLAY_KID = { quiet: 'screen', spinner: 'screen', scoreboard: 'screen', duel: 'screen' };
/** Why this plan cannot be played live, or '' when it can: its type's reason, else its engine's. */
export function liveNot(plan) {
  const t = plan && plan.type && plan.type.from === 'pack' ? plan.type.id : '';
  if (t && LIVE_NOT[t]) return LIVE_NOT[t];
  return plan ? LIVE_NOT_ENGINE[planEngine(plan).engine] || '' : '';
}
/** The answers this plan may have: [{ id, ok, why }] in step order (a Live that cannot be is listed, not ok, with why). */
export const playOptions = plan => { const why = liveNot(plan); return PLAYS.map(id => ({ id, ok: id !== 'live' || !why, why: id === 'live' ? why : '' })); };
/** The answer the step starts on, for this plan and viewer. forKid: a kid's or family's plan. */
export function playDefault(plan, { forKid = false } = {}) {
  const t = plan && plan.type && plan.type.from === 'pack' ? plan.type.id : '';
  const want = forKid ? PLAY_KID[t] || 'solo' : t ? PLAY_TEACHER[t] || 'solo' : 'live';
  return want === 'live' && liveNot(plan) ? (t && LIVE_NOT[t] ? 'screen' : 'solo') : want;
}
export const LEARN = ['math', 'reading', 'science', 'geography', 'fun'];

// ---- Classroom activities (Oomba Canvas, docs/canvas-api.md) -------------------------------------------------------
/** The first question of /build/new, "What are you making?": a classroom activity or an arcade game. */
export const KINDS = ['activity', 'arcade'];
/** The card that starts selected (one tap switches): Classroom activity for every teacher and whenever the page was
 *  opened from a class or a lesson (?for=class); Arcade game for kids and families. */
export const startKind = ({ teacher = false, forClass = false } = {}) => (teacher || forClass ? 'activity' : 'arcade');
/** "How much help?": the Big Divide's support modes. */
export const SUPPORTS = ['watch', 'count', 'guided', 'own'];
/** "How will it be played?" for an activity: on their own devices (results to Progress), on the board together (the
 *  teacher drives, no score), or both. Live comes later (phase 3). */
export const CANVAS_PLAYS = ['devices', 'board', 'both'];
export const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8'];
/** The class's grade as the steps use it: 'K', '1'...'8', or '' (a grade of another shape, or none). */
export const gradeOf = g => { const v = String(g ?? '').trim().toUpperCase().replace(/^GRADE\s*/, '').replace(/^0+(?=\d)/, ''); return GRADES.includes(v) ? v : ''; };
/** The topic chips: each is a kit tool and a generator for a fresh set per student (canvas/src/logic.js), for these
 *  grades. Their names are buildSetup.canvas.topics.<id>. */
export const CANVAS_TOPICS = [
  { id: 'evenOdd', grades: ['K', '1', '2', '3'], gen: { tool: 'tiles.sort', rule: 'evenodd', lo: 1, hi: 50, tiles: 6 } },
  { id: 'orderNumbers', grades: ['K', '1', '2', '3'], gen: { tool: 'tiles.order', lo: 1, hi: 100, tiles: 5 } },
  { id: 'numberLineJumps', grades: ['K', '1', '2'], gen: { tool: 'numberline.jump', lo: 0, hi: 20, subs: [1] } },
  { id: 'addColumns', grades: ['1', '2', '3', '4'], gen: { tool: 'digits.add', digits: 2 } },
  { id: 'subColumns', grades: ['2', '3', '4'], gen: { tool: 'digits.sub', digits: 3 } },
  { id: 'shadeFractions', grades: ['2', '3'], gen: { tool: 'fractions.shade', dens: [2, 3, 4, 6, 8] } },
  { id: 'equivFractions', grades: ['3', '4', '5'], gen: { tool: 'fractions.equiv', dens: [2, 3, 4], mult: [2, 3] } },
  { id: 'fractionsLine', grades: ['3', '4', '5'], gen: { tool: 'numberline.point', lo: 0, hi: 1, subs: [2, 3, 4, 6, 8] } },
  { id: 'compareFractions', grades: ['3', '4', '5'], gen: { tool: 'fractions.compare', dens: [2, 3, 4, 6, 8, 12] } },
  { id: 'multiplyOne', grades: ['3', '4', '5'], gen: { tool: 'digits.mul', digits: 2 } },
  { id: 'multiples', grades: ['3', '4', '5', '6'], gen: { tool: 'tiles.sort', rule: 'mult', n: 3, lo: 1, hi: 60, tiles: 8 } },
  { id: 'orderFractions', grades: ['4', '5', '6'], gen: { tool: 'tiles.order', fractions: true, dens: [2, 3, 4, 5, 6, 8, 10, 12], tiles: 4 } },
  { id: 'bigAdd', grades: ['4', '5', '6', '7', '8'], gen: { tool: 'digits.add', digits: 4 } },
];
export const topicById = id => CANVAS_TOPICS.find(x => x.id === id) || null;
/** The chips for a grade, in order (no grade, or one with no chips: the middle grades' chips). */
export function topicsFor(grade) {
  const g = gradeOf(grade), list = g ? CANVAS_TOPICS.filter(x => x.grades.includes(g)) : [];
  return list.length ? list : CANVAS_TOPICS.filter(x => x.grades.includes('3') || x.grades.includes('4')).slice(0, 8);
}
/** Words that name a classroom activity (the start card follows them when typed elsewhere: CLASSROOM_WORDS' sibling). */
export const CLASSROOM_ACTIVITY_WORDS = /\b(practi[cs]e|worksheet|activity|manipulatives?|fractions?|place value|number line|times tables?|for my class)\b/i;
/** The sections of "Who is in it?": the heroes, then every animal group of the catalogue (kit2/creature-groups.json). */
export const CHARACTER_GROUPS = ['heroes', ...KIT2_CREATURE_GROUPS];
/** A 2D sprite's group: the list's (kit2/creature-groups.json), else its pack's ('dinosaur'), else wild. */
const group2d = c => (c.kind === 'hero' ? 'heroes' : KIT2_GROUP_LIST[c.id] || { dinosaur: 'dinosaurs', sea: 'sea', fish: 'sea' }[c.group] || 'wild');
/**
 * Everyone the steps can offer, from BOTH catalogues, once each: the 3D worlds' heroes and animals (kit2.js) and the
 * 2D sprites (art2d.js). [{ id, name, kind: 'hero' | 'creature', group, worlds (the 3D worlds that have it: [] when it
 * is only a 2D sprite), in3d, in2d }]. A character of both keeps its 3D name and group.
 */
export function setupCharacters(k2 = KIT2_CHARACTERS, a2 = ART2D_CHARACTERS) {
  const out = new Map();
  for (const c of k2) out.set(c.id, { id: c.id, name: c.name, kind: c.kind, group: c.group, worlds: c.worlds, in3d: true, in2d: false });
  for (const c of a2) {
    if (out.has(c.id)) out.get(c.id).in2d = true;
    else out.set(c.id, { id: c.id, name: c.name, kind: c.kind === 'hero' ? 'hero' : 'creature', group: group2d(c), worlds: [], in3d: false, in2d: true });
  }
  return [...out.values()];
}
export const SETUP_CHARACTERS = setupCharacters();
export const CHARACTER_IDS = SETUP_CHARACTERS.map(c => c.id);
export const setupCharacter = id => SETUP_CHARACTERS.find(c => c.id === id) || null;
/** [{ id, items: [character], soon, only2d }]: soon = nothing of this group is in either catalogue (listed, never
 *  pickable); only2d = it has sprites for 2D games and nothing in a 3D world yet ("Coming soon in 3D" unless the game
 *  is 2D). A group lights up by itself when a theme or a 2D pack ships one: this reads the catalogues only. */
export const characterGroups = (characters = SETUP_CHARACTERS, groups = CHARACTER_GROUPS) => groups.map(id => {
  const items = characters.filter(c => c.group === id);
  return { id, items, soon: !items.length, only2d: items.length > 0 && !items.some(c => c.in3d) };
});
/** The kinds of game that draw a 2D world and a sprite character today (the 2D art's templates; an adventure, or no
 *  kind picked, is made as a running game). */
export const art2dTemplateFor = type => (!type ? 'runner' : type.from !== 'pack' ? '' : type.id === 'adventure' ? 'runner' : ART2D_TEMPLATES.includes(type.id) ? type.id : '');

const clean = (s, max) => String(s ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const choice = (v, ids) => {
  if (!v || typeof v !== 'object') return null;
  if (v.from === 'pack') return typeof v.id === 'string' && ids.includes(v.id) ? { from: 'pack', id: v.id } : null;
  if (v.from === 'custom') { const text = clean(v.text, LIMITS.idea); return text ? { from: 'custom', text } : null; }
  return null;
};
/**
 * A plan as the Builder may use it, from anything a page sent: only known ids, typed text trimmed and cut to length, at
 * most one custom character line, no duplicates. -> the plan, or null when nothing was chosen at all.
 * A classroom starter (a survey, a category board...) has no look, world or characters (and some have nothing to
 * teach): what the skipped steps carried is dropped. Typed words that clearly name a classroom type ("jeopardy",
 * "exit ticket") become that type. forKid: a kid's or family's plan, where the teacher-only types are not offered.
 */
export function normalisePlan(raw, { forKid = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.kind === 'activity') return activityPlan(raw);
  const ids = forKid ? TYPE_IDS.filter(id => !typeById(id).teacher) : TYPE_IDS;
  let type = choice(raw.type, ids);
  if (type && type.from === 'custom') { const id = classroomTypeFor(type.text, { forKid }); if (id) type = { from: 'pack', id }; }
  const skip = type && type.from === 'pack' ? typeById(type.id).skip : [];
  if (skip.length) raw = { ...raw, look: null, world: null, characters: [], ...(skip.includes('learn') ? { learn: [] } : {}) };
  const characters = [], seen = new Set();
  for (const c of Array.isArray(raw.characters) ? raw.characters.slice(0, 200) : []) {
    const v = choice(c, CHARACTER_IDS); if (!v) continue;
    const key = v.from === 'pack' ? v.id : '*custom'; if (seen.has(key) || characters.length >= LIMITS.characters) continue;
    seen.add(key); characters.push(v);
  }
  const learn = [], had = new Set();
  for (const l of Array.isArray(raw.learn) ? raw.learn.slice(0, 20) : []) {
    if (!l || typeof l !== 'object') continue;
    const v = typeof l.id === 'string' && LEARN.includes(l.id) ? { id: l.id } : clean(l.text, LIMITS.idea) ? { text: clean(l.text, LIMITS.idea) } : null;
    const key = v && (v.id || '*text'); if (!v || had.has(key) || learn.length >= LIMITS.learn) continue;
    had.add(key); learn.push(v);
  }
  const plan = {
    v: PLAN_VERSION, type, look: LOOKS.includes(raw.look) ? raw.look : null, world: choice(raw.world, WORLD_IDS),
    characters, learn, notes: clean(raw.notes, LIMITS.notes),
  };
  // Made from a class (?for=class): only that it was, never which class (the Studio offers "Make it a classroom activity").
  if (raw.forClass === true) plan.forClass = true;
  // How it is played: a known answer this plan allows; Live where it cannot be (a ready-made 3D world, a tool for the
  // board) becomes this viewer's default for it. Not answered: no play at all (the Builder decides, as before the step).
  if (PLAYS.includes(raw.play)) plan.play = raw.play === 'live' && liveNot(plan) ? playDefault(plan, { forKid }) : raw.play;
  return plan.type || plan.look || plan.world || characters.length || learn.length || plan.notes || plan.play ? plan : null;
}
/** A classroom activity's plan (normalisePlan, kind 'activity'): a known topic chip (and its tool) or typed words, a
 *  known support and way of playing (Guided and their own devices when left out), the grade if it is one. Kids may make
 *  one too: nothing in it depends on who builds it. The arcade fields are there and empty. */
function activityPlan(raw) {
  const t = raw.topic && typeof raw.topic === 'object' ? raw.topic : null, chip = t && typeof t.id === 'string' ? topicById(t.id) : null;
  const text = t && !chip ? clean(t.text, LIMITS.idea) : '';
  return {
    v: PLAN_VERSION, kind: 'activity', topic: chip ? { id: chip.id } : text ? { text } : null, tool: chip ? chip.gen.tool : '',
    support: SUPPORTS.includes(raw.support) ? raw.support : 'guided', played: CANVAS_PLAYS.includes(raw.played) ? raw.played : 'devices', grade: gradeOf(raw.grade),
    type: null, look: null, world: null, characters: [], learn: [], notes: clean(raw.notes, LIMITS.notes), ...(raw.forClass === true ? { forClass: true } : {}),
  };
}
export const isActivity = plan => !!plan && plan.kind === 'activity';
/** The parts of a plan that are outside the packs: ['type', 'world', 'character'] (each at most once). */
export const customParts = plan => [plan.type && plan.type.from === 'custom' && 'type', plan.world && plan.world.from === 'custom' && 'world', plan.characters.some(c => c.from === 'custom') && 'character'].filter(Boolean);

// ---- The sentence the builder reads on the summary and sends as their first message ------------------------------
const listOf = (items, locale) => { try { return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items); } catch { return items.join(', '); } };
/** A choice in the reader's words: our own name for a pack choice, their own words for a custom one. */
export const characterName = (id, t = tEn) => t(characterById(id) ? `studio.heroes.names.${id}` : `studio.animals.names.${id}`);
export const choiceLabel = (kind, c, t = tEn) => (c.from === 'custom' ? c.text : kind === 'type' ? t(`buildSetup.types.${c.id}.title`) : kind === 'world' ? t(`studio.worlds.names.${c.id}`) : characterName(c.id, t));
export const learnLabel = (l, t = tEn) => (l.id ? t(`buildSetup.learn.${l.id}.title`) : l.text);
/**
 * The plan as short plain sentences in the builder's language ("Here is my game plan. Kind of game: Adventure. Make it
 * 3D. World: Castle Quest. In it: Knight and Fox. It teaches: Math."). files: how many files they added.
 */
/** A topic in the reader's words: our chip's name, or their own words. */
export const topicLabel = (topic, t = tEn) => (!topic ? '' : topic.id ? t(`buildSetup.canvas.topics.${topic.id}`) : topic.text);
export function planSentence(plan, t = tEn, { files = 0 } = {}) {
  const loc = t.locale || 'en', out = [t('buildSetup.say.start')];
  if (isActivity(plan)) {
    out[0] = t('buildSetup.say.activity');   // "Here is my plan: a classroom activity."
    if (plan.grade) out.push(plan.grade === 'K' ? t('buildSetup.say.gradeK') : t('buildSetup.say.grade', { grade: plan.grade }));
    if (plan.topic) out.push(t('buildSetup.say.practise', { topic: topicLabel(plan.topic, t) }));
    out.push(t('buildSetup.say.help', { help: t(`buildSetup.canvas.help.${plan.support}.title`) }));
    out.push(t(`buildSetup.say.played.${plan.played}`));
    if (files > 0) out.push(t('buildSetup.say.file'));
    if (plan.notes) out.push(/[.!?。！？]$/.test(plan.notes) ? plan.notes : `${plan.notes}.`);
    return out.join(' ');
  }
  if (plan.type) out.push(t('buildSetup.say.type', { value: choiceLabel('type', plan.type, t) }));
  if (plan.look === '3d' || plan.look === '2d') out.push(t(`buildSetup.say.look${plan.look}`));
  if (plan.world) out.push(t('buildSetup.say.world', { value: choiceLabel('world', plan.world, t) }));
  if (plan.characters.length) out.push(t('buildSetup.say.characters', { list: listOf(plan.characters.map(c => choiceLabel('character', c, t)), loc) }));
  if (plan.learn.length) out.push(t('buildSetup.say.learn', { list: listOf(plan.learn.map(l => learnLabel(l, t)), loc) }));
  if (plan.play) out.push(t(`buildSetup.say.play${plan.play}`));
  if (files > 0) out.push(t('buildSetup.say.file'));
  if (plan.notes) out.push(/[.!?。！？]$/.test(plan.notes) ? plan.notes : `${plan.notes}.`);
  return out.join(' ');
}

// ---- The engine a plan means ---------------------------------------------------------------------------------------
/** The world that has the most of these characters (the first such world; the default world when it has them all or
 *  none were picked). */
function homeOf(chars) {
  if (!chars.length) return DEFAULT_WORLD;
  let best = DEFAULT_WORLD, n = chars.filter(c => c.worlds.includes(DEFAULT_WORLD)).length;
  for (const w of KIT2_WORLDS) { const k = chars.filter(c => c.worlds.includes(w.id)).length; if (k > n) { n = k; best = w.id; } }
  return best;
}
/**
 * What kind of build a plan is. ->
 *   { engine: 'kit2', world, chosenWorld, customWorld, hero, companion, more, friends, missing }  a ready-made 3D world
 *       (Oomba3D): world + 3D always is one; so is a 3D or "you pick" plan with a pack character (they only exist
 *       there). customWorld: the place is their own idea, built from scratch inside that engine. hero: who the player
 *       is; companion: the animal that follows; more: other animals of this world; friends: other heroes of this world
 *       who stand in it; missing: pack characters this world does not have.
 *   { engine: 'world3d' }   a 3D world of their own with no pack character: the Builder's own 3D starter
 *   { engine: '2d', template, art, extra, plain }   the Oomba Kit (2D picked, a kind only made in 2D, or a character
 *       that is only a 2D sprite, and no 3D picked). art: { world, sprite } when the kind of game draws the 2D art (a
 *       running or catching game: template): the world in 2D, the sprite the player is (the first picked) and the
 *       friends who are in the game too (the other sprites picked); extra: pack characters that have no sprite; plain: a world or character was picked but this kind of game does not draw them yet
 *   { engine: 'classroom', template }   a classroom starter (a survey, a category board, a quiet game...): plain HTML for
 *       the board and phones, never a 3D world, the kit's worlds or sprites (the plan has none: normalisePlan)
 *   { engine: 'scratch' }   "you pick" with a world of their own: the Builder decides 2D or its own 3D, never a pack world
 *   { engine: 'open' }      nothing here decides: the message is read as any typed message is today
 *   { engine: 'canvas', tool, topic, support, played, grade }   a classroom activity on Oomba Canvas (kind 'activity')
 */
export function planEngine(plan) {
  if (isActivity(plan)) return { engine: 'canvas', tool: plan.tool || '', topic: plan.topic, support: plan.support, played: plan.played, grade: plan.grade };
  const picked = plan.characters.filter(c => c.from === 'pack').map(c => c.id);
  const chars = picked.map(characterById).filter(Boolean), only2d = picked.filter(id => !characterById(id));
  const type = plan.type && plan.type.from === 'pack' ? GAME_TYPES.find(x => x.id === plan.type.id) : null;
  if (type && type.starter) return { engine: 'classroom', template: type.template };
  const packWorld = plan.world && plan.world.from === 'pack' ? plan.world.id : '', customWorld = !!plan.world && plan.world.from === 'custom';
  // 2D: the world's own 2D art and the sprite characters, in the kinds of game that draw them (running, catching):
  // the first one picked is the player, the others are friends who are in the game too.
  const flatGame = () => {
    const template = art2dTemplateFor(plan.type), sprites = picked.filter(id => art2dCharacter(id));
    const world = template && ART2D_WORLD_IDS.includes(packWorld) ? packWorld : '', sprite = template ? sprites[0] || '' : '';
    const friends = template ? sprites.slice(1) : [];
    return { engine: '2d', template, art: world || sprite ? { world, sprite, friends } : null, extra: picked.filter(id => id !== sprite && !friends.includes(id)), plain: !template && (!!packWorld || picked.length > 0) };
  };
  if (plan.look === '2d') return flatGame();
  if (plan.look !== '3d') {
    if ((type && type.flat) || only2d.length) return flatGame();
    if (!packWorld && !chars.length) return { engine: customWorld ? 'scratch' : 'open' };
  }
  if (customWorld && !chars.length) return { engine: 'world3d' };
  const world = packWorld || homeOf(chars), here = c => c.worlds.includes(world);
  const canPlay = new Set(heroesOf(world).map(h => h.id));
  const lead = chars.find(c => c.kind === 'hero' && here(c)) || chars.find(c => here(c) && canPlay.has(c.id)) || null;
  const hero = lead ? lead.id : heroFor(world, '');
  const animals = chars.filter(c => c.kind === 'creature' && here(c) && c.id !== hero).map(c => c.id);
  return {
    engine: 'kit2', world, chosenWorld: !!packWorld, customWorld, hero, heroChosen: !!lead,
    companion: animals[0] || '', more: animals.slice(1), friends: chars.filter(c => c.kind === 'hero' && here(c) && c.id !== hero).map(c => c.id),
    missing: [...chars.filter(c => !here(c)).map(c => c.id), ...only2d],
  };
}
/**
 * The engine for this round of a build (the same answer wantsKit2 gives for a typed message): a Kit 2 pick
 * { world, hero, companion?, by } or null. With a plan, the plan decides; without one, the words do, as before.
 * state: the Builder's saved state (state.kit2 remembers a pick; state.wants3d a 3D world of their own).
 */
export function engineFor(state, plan, text, version) {
  if (!plan) return wantsKit2(state, text, version);
  playFor(state, plan);
  const e = planEngine(plan), cur = version ? kit2Of(version.html) : null;
  // A classroom activity: Oomba Canvas, never a ready-made world (prompt.js wantsCanvas reads state.canvas).
  if (e.engine === 'canvas') { if (state) { state.canvas = true; delete state.kit2; delete state.art2d; delete state.wants3d; } return null; }
  if (e.engine === 'open') return wantsKit2(state, text, version);
  if (e.engine === 'kit2') {
    const pick = { world: e.world, hero: e.hero, ...(e.companion ? { companion: e.companion } : {}) };
    if (state) state.kit2 = { ...pick };
    return { ...pick, by: cur && cur.world === e.world ? 'game' : e.chosenWorld ? 'plan' : 'home', changed: false, wantsCreature: false };
  }
  // 2D, their own 3D world, or their own place: never a ready-made world in this build.
  if (cur) return wantsKit2(state, '', version);
  if (state) { delete state.kit2; if (e.engine === 'world3d') state.wants3d = true; }
  return null;
}

/**
 * What the plan's "How will it be played?" means for the Builder's saved state: Live sets state.wantsLive (the LIVE
 * RULES go with every turn of this game, prompt.js wantsLive), one screen or on my own clears it (a later typed "make it
 * live" sets it again). state.play remembers the answer and the kind of game for the Studio's live line.
 */
export function playFor(state, plan) {
  if (state && plan && plan.forClass) state.fromClass = true;
  if (state && isActivity(plan)) { delete state.wantsLive; state.canvas = true; state.play = { how: plan.played === 'board' ? 'screen' : 'solo', type: '' }; return; }
  if (!state || !plan || !plan.play) return;
  if (plan.play === 'live') state.wantsLive = true; else delete state.wantsLive;
  state.play = { how: plan.play, type: plan.type && plan.type.from === 'pack' ? plan.type.id : '' };
}

/**
 * The 2D art for this round of a plan's build (the same answer wantsArt2d gives for a typed message):
 * { world, hero, friends?, by } or null. The plan's 2D world, the sprite the player is and the friends who are in the
 * game too, for a running or catching game.
 */
export function art2dFor(state, plan, version) {
  if (version) return isArt2dGame(version.html) ? wantsArt2d(state, '', version, {}) : null;
  const e = planEngine(plan);
  if (e.engine !== '2d' || !e.art) { if (state) delete state.art2d; return null; }
  const friends = e.art.friends.length ? { friends: e.art.friends } : {};
  if (state) state.art2d = { world: e.art.world, hero: e.art.sprite, ...friends };
  return { world: e.art.world, hero: e.art.sprite, ...friends, by: 'plan', missing: false, force2d: false, soft: false, changed: false };
}

/**
 * The 2D art a plan's build must draw, whatever the model does: { template, world, hero, friends } (template: 'runner' or
 * 'catch', the one the plan means; friends: the sprites picked
 * after the first, as many as a game may name, art2d.js ART2D_FRIENDS_MAX), or null when the plan does not draw the 2D
 * art (3D, a kind of game that does not draw it, nothing picked). builder/tools.js starts the template with exactly
 * these and refuses any version of that build that leaves one out, so a picked animal is never swapped for the kit's
 * own characters.
 */
export function planArt2d(plan) {
  if (!plan) return null;
  const e = planEngine(plan);
  if (e.engine !== '2d' || !e.art || !e.template) return null;
  return { template: e.template, world: e.art.world, hero: e.art.sprite, friends: art2dFriends(e.art.friends, e.art.sprite).map(c => c.id) };
}

// ---- What the model reads ------------------------------------------------------------------------------------------
/** How to build each classroom starter (planNote, and the Builder's CLASSROOM RULES in prompt.js say the same). */
export const CLASSROOM_NOTES = {
  quiet: 'A QUIET GAME: a classroom noise meter. The scene (a night sky that fills with stars) stays calm and rewards the class while the room is quiet. It uses BRB.loudness exactly as the official noise meters do: the setup card says "only listens for how loud it is. Nothing is recorded or saved." and the microphone starts only from the "Start listening" tap. If the microphone is refused, missing or busy (or the player presses "Use it as a quiet timer"), it keeps working as a calm quiet timer with no microphone. Change the scene, the goal minutes (CONFIG.goals), how touchy it is (CONFIG.loudBy) and the words; never call getUserMedia and never remove the timer fallback.',
  categories: 'A CATEGORY BOARD: a classroom quiz board shown on the board. Teams take turns to pick a category and a points value, the question opens big, the teacher shows the answer and gives the points to a team (or nobody). Put their categories and questions in the CATEGORIES list (each { name, clues: [{ q, a }] }, the clues from easy to hard; CONFIG.points are their values) and the number of teams in CONFIG.teams. It is an original game: never call it "Jeopardy" (a trademark, even if they typed that word), never copy that show\'s look (blue board, gold numbers), music, money signs or "answer in the form of a question". Call it Category Board or a name of its own.',
  survey: 'A CLASS SURVEY: fixed-choice questions written by the teacher (the QUESTIONS list, each { q, choices: [2 to 4 short choices] }). Answers are only counted, on this device, in memory: "Count hands" (the teacher taps the number of raised hands) or "Pass the device" (each student taps a choice in private and the screen hides it). Results are counts and bars only; in "Pass the device" they show only once CONFIG.minShown answers are in, so nobody in a small group can be picked out. Never add free text answers, names, saving (BRB.storage, localStorage), BRB.poll or anything that sends the answers anywhere.',
  bingo: 'CLASS BINGO: the board calls an item (the ITEMS list, each { call, mark }: the call is read out and shown, like "3 × 4" or a definition; the mark is what is on the cards, like "12" or the word), and each player marks it on a card on their own device ("Play a card"). Put their items in ITEMS (at least CONFIG.size × CONFIG.size of them). Cards are dealt at random on each device; nothing is sent between devices and nobody is named.',
  flashcards: 'FLASHCARDS: one big card at a time; tap or Space flips it, the arrows go to the next and back, "Got it" and "Again" sort the cards, and the round ends with how many they got. Put their cards in the CARDS list (each { front, back }).',
  exitticket: 'AN EXIT TICKET: a short fixed-choice check at the end of a lesson (the QUESTIONS list, 3 to 5, each { q, choices, answer: the index of the right choice, or null for a how-do-you-feel question }). One question at a time, no timer, then "Thank you" and how many were right, on this device only. It submits no score (BRB.gameOver with score null) and stores nothing per student; a teacher who wants each student\'s answers uses a question step or question set in a class lesson instead: say so in one short sentence if they ask.',
  spinner: 'A SPINNER (random picker): a big wheel the teacher spins (Space or tap) to pick a team, a question number or a topic. CONFIG.teams makes "Team 1, Team 2...", CONFIG.numbers makes 1 to N, CONFIG.topics lists their own topics; CONFIG.noRepeat takes each pick out until all are picked. It never uses students\' names: if they ask for names, use numbers (like seat or register numbers) and say kindly in one short sentence why.',
  scoreboard: 'A TEAM SCOREBOARD for the board: one big column per team (CONFIG.teams, labelled Team 1, Team 2... or CONFIG.labels such as colours or animals, never students\' names), + and - buttons and number keys (1 to 6 add, Shift with a number takes away), Undo and a reset that asks first.',
};
const q = s => JSON.stringify(String(s));
const HELP_BRIEF = { watch: 'WATCH (the kit shows each worked answer first, then the student tries)', count: 'COUNT UP (step answers with ▲ ▼ buttons)', guided: 'GUIDED (the Steps panel open, step answers typed with the keypad)', own: 'ON MY OWN (the Steps panel closed until they open it)' };
const PLAYED_BRIEF = {
  devices: 'ON THEIR OWN DEVICES: each student their own copy; the end result goes to Progress (config.board false)',
  board: 'ON THE BOARD TOGETHER: the teacher drives on the big screen, big type, no score sent (config.board true)',
  both: 'BOTH: on their own devices (config.board false); the teacher may also show it on the board',
};
/** The SETUP CHOICES block of a classroom activity's first build (planNote). */
function canvasNote(plan) {
  const chip = plan.topic && plan.topic.id ? topicById(plan.topic.id) : null, lines = [];
  lines.push('- Kind: a CLASSROOM ACTIVITY on Oomba Canvas (the builder chose "Classroom activity", not "Arcade game").');
  lines.push(chip ? `- Practise: PACK topic ${q(chip.id)} (${tEn(`buildSetup.canvas.topics.${chip.id}`)}): tool ${q(chip.gen.tool)}, generator ${JSON.stringify(chip.gen)}.`
    : plan.topic ? `- Practise: CUSTOM ${q(plan.topic.text)} (typed by the builder): pick the kit tool that fits best and make problems or a generator for it.`
      : '- Practise: not chosen (you decide a good first activity for the grade).');
  lines.push(plan.grade ? `- Grade: ${plan.grade === 'K' ? 'kindergarten' : `grade ${plan.grade}`} (the class's grade: the only thing known about the class; never ask about the students).` : '- Grade: not known (keep it middle-of-primary unless their words say otherwise).');
  lines.push(`- Help: ${HELP_BRIEF[plan.support]} -> config.support ${q(plan.support)}.`);
  lines.push(`- How it is played: ${PLAYED_BRIEF[plan.played]}. Not live.`);
  if (plan.notes) lines.push(`- Their note: ${q(plan.notes)}`);
  const how = [
    'Build it as a classroom activity on Oomba Canvas (the CANVAS RULES): start_from_template "canvas", then edit_game its oc-activity JSON block only (config, task, problems or gen) and the <title>. It is not an Oomba Kit game: never add the kit, lives, timers, enemies or a title screen.',
    chip ? `Use the generator for a fresh set per student: "gen": ${JSON.stringify(chip.gen)}, config.count 5, config.fresh true (tune its numbers to the grade if needed), and "problems": [] or a few fixed ones of the same tool.` : 'Choose problems (or a generator) that the kit can check: never write a checker of your own.',
    'Every version must pass the kit\'s self-test (each problem solvable by its worked answer, never right when empty): a version that fails is not saved, and the reply names the problem to fix.',
    'Write task.title and task.say in the builder\'s language (config.lang too). Leave steps and hints empty: the kit writes them in every language.',
  ];
  return `SETUP CHOICES (the builder picked these in the setup steps before this chat; their first message says the same in words).
${lines.join('\n')}
How to use them:
- Do not ask the setup questions again (what it is, the topic, the help, how it is played): say your plan in two short sentences and build now.
${how.map(x => `- ${x}`).join('\n')}`;
}
/** The activity a classroom activity plan starts from (the mock Builder's build, and tools.js planFallback): the starter's
 *  data with the topic's generator, the help and the way of playing. t: the builder's words (the title). */
export function canvasActivity(plan, t = tEn) {
  const chip = plan && plan.topic && plan.topic.id ? topicById(plan.topic.id) : null, gen = chip ? chip.gen : CANVAS_TOPICS.find(x => x.id === 'equivFractions').gen;
  const title = (plan && plan.topic ? topicLabel(plan.topic, t) : '') || t('buildSetup.canvas.topics.equivFractions');
  return { config: { lang: t.locale || 'en', support: plan && SUPPORTS.includes(plan.support) ? plan.support : 'guided', count: 5, fresh: true, board: !!plan && plan.played === 'board' }, task: { title: title.slice(0, 60), say: title.slice(0, 120) }, problems: [], gen: { ...gen }, steps: {}, hints: {} };
}
const picked = plan => plan.characters.filter(c => c.from === 'pack').map(c => c.id);
const who = id => { const c = setupCharacter(id); return c ? `${c.id} (${c.name})` : id; };
const PLAY_BRIEF = { live: 'LIVE (Oomba Live, a teacher or grown-up hosts)', screen: 'on one screen (not live)', solo: 'on my own (not live)' };
/** One line for the transcript of later turns (builder/claude.js historyToMessages): what was pack and what was custom. */
export function planBrief(plan) {
  if (!plan) return '';
  if (isActivity(plan)) return `[Setup choices: a CLASSROOM ACTIVITY on Oomba Canvas (not an arcade game); topic ${plan.topic ? (plan.topic.id ? `pack ${plan.topic.id} (tool ${plan.tool})` : `custom ${q(plan.topic.text)}`) : 'not chosen'}; ${plan.grade ? `grade ${plan.grade}; ` : ''}help ${plan.support}; played ${plan.played}. The CANVAS RULES apply; do not ask the setup questions again.]`;
  const part = (name, c) => (c ? `${name} ${c.from === 'pack' ? `pack ${c.id}` : `custom ${q(c.text)}`}` : '');
  const bits = [part('type', plan.type), plan.look && plan.look !== 'auto' ? `look ${plan.look.toUpperCase()}` : '', part('world', plan.world), ...plan.characters.map(c => part('character', c)), plan.play ? `played ${PLAY_BRIEF[plan.play]}` : ''].filter(Boolean);
  return bits.length ? `[Setup choices: ${bits.join('; ')}. Pack parts are used as given; custom parts are outside the packs and built from scratch.${plan.play ? ' How it is played was answered: do not ask whether it should be live or closed.' : ''}]` : '';
}
/**
 * The block the model reads with a plan's first message (not cached: it is this build's own). Pack choices are named
 * with their ids and are used as given; custom ones are marked CUSTOM and built from scratch.
 */
export function planNote(plan) {
  if (!plan) return '';
  if (isActivity(plan)) return canvasNote(plan);
  const e = planEngine(plan), lines = [];
  const t = plan.type, w = plan.world, type = t && t.from === 'pack' ? GAME_TYPES.find(x => x.id === t.id) : null;
  lines.push(!t ? (e.engine === '2d' && e.art ? '- Game type: not chosen: a running game ("runner") or a catching game ("catch"), you decide which. Only those two draw the 2D art and the characters they picked.' : '- Game type: not chosen (you decide).')
    : t.from === 'custom' ? `- Game type: CUSTOM ${q(t.text)}. It is outside the packs: there is no ready-made starter for it, so design and build this kind of game from scratch.`
      : `- Game type: PACK ${q(t.id)}${type && type.template ? ` (the ready-made starter: start_from_template ${q(type.template)})` : ' (explore, collect things and reach the goal)'}.`);
  if (e.engine === 'classroom') lines.push('- Look, world and characters: none (a classroom starter has no 3D world, no ready-made world and no pack characters; those steps were skipped).');
  else lines.push(`- Look: ${plan.look === '3d' ? '3D' : plan.look === '2d' ? '2D' : 'not chosen (you decide)'}.`);
  if (e.engine === 'classroom') { /* said above */ } else lines.push(!w ? '- World: not chosen (you decide).'
    : w.from === 'custom' ? `- World: CUSTOM ${q(w.text)}. It is outside the packs: no ready-made world is this place, so build the place from scratch.`
      : `- World: PACK ${q(w.id)} ("${worldById(w.id).name}"): ${worldById(w.id).description}`);
  if (!plan.characters.length && e.engine !== 'classroom') lines.push('- Characters: not chosen (you decide).');
  for (const c of plan.characters) {
    lines.push(c.from === 'custom' ? `- Character: CUSTOM ${q(c.text)}. Outside the packs: build it from scratch.`
      : `- Character: PACK ${who(c.id)}, ${setupCharacter(c.id).kind === 'creature' ? 'an animal' : 'a hero'}${setupCharacter(c.id).in3d ? ` of the 3D worlds ${setupCharacter(c.id).worlds.join(', ')}` : ''}${setupCharacter(c.id).in2d ? `${setupCharacter(c.id).in3d ? ', and' : ','} a 2D sprite` : ''}.`);
  }
  const learn = plan.learn.filter(l => l.id !== 'fun').map(l => (l.id ? l.id : q(l.text)));
  lines.push(plan.learn.some(l => l.id === 'fun') && !learn.length ? '- Teaches: nothing, it is just for fun (no quiz unless the game type needs questions).'
    : learn.length ? `- Teaches: ${learn.join(', ')}${plan.learn.some(l => l.id === 'fun') ? ' (kept light: they also said just for fun)' : ''}.`
      : type && type.skip.includes('learn') ? '- Teaches: not asked (a classroom tool; use their note for its content).' : '- Teaches: not chosen (you decide; a learning twist is welcome, never forced).');
  lines.push(plan.play === 'live' ? '- How it is played: LIVE with their class or group on Oomba Live (everyone on their own device; a teacher or grown-up hosts it from the big screen).'
    : plan.play === 'screen' ? '- How it is played: ON ONE SCREEN (the class together on the board, or one device passed around). Not a live game.'
      : plan.play === 'solo' ? '- How it is played: ON MY OWN (one player on one device). Not a live game.' : '- How it is played: not chosen (you decide; a game is live only when they ask for it).');
  if (plan.notes) lines.push(`- Their note: ${q(plan.notes)}`);
  const how = [];
  if (e.engine === 'kit2') {
    const wd = worldById(e.world);
    how.push(`Build it as a Kit 2 game on Oomba3D: start_from_template "oomba3d" with world ${q(e.world)}, hero ${q(e.hero)}${e.companion ? ` and companion ${q(e.companion)}` : ''}, then make it theirs.`
      + (e.heroChosen ? '' : ` They picked no hero for the player, so ${who(e.hero)} (this world's first) plays.`));
    if (e.more.length) how.push(`More animals to add with g.creature(): ${e.more.map(who).join(', ')}.`);
    if (e.friends.length) how.push(`More pack heroes who stand in the world as friends (g.hero() at a place of their own, not controlled, a wave or idle move): ${e.friends.map(who).join(', ')}.`);
    if (e.missing.length) how.push(`${wd.name} does not have ${e.missing.map(who).join(', ')}: say so kindly in one short sentence and name where each lives; never fake one.`);
    if (e.customWorld) how.push(`The PLACE is their own idea (${q(w.text)}), not ${wd.name}: Oomba3D and the theme ${q(e.world)} are used only so the pack characters can be in it. Do not present the game as ${wd.name} and do not keep its buildings and landmark. Rebuild LAYOUT and buildWorld() as their place from scratch: ground from g.world.ground({ color, hills }), scenery from simple g.THREE shapes added to g.scene, a sky, time and weather that fit. Keep the starter's stones, answer pads, coins and goal working so the game still plays.`);
    else if (!e.chosenWorld) how.push(`They picked no world: ${wd.name} is used because it has their characters.`);
    if (plan.characters.some(c => c.from === 'custom')) how.push('A CUSTOM character in this 3D world is the one exception to "never draw a character from shapes": build it from scratch as a simple, friendly figure of g.THREE shapes about as tall as the hero, standing near the start as a friend (it may bob or turn; it is never the player, never solid, never an enemy). Do not pass it off as a pack character.');
    if (t && !(t.from === 'pack' && ['adventure', 'runner'].includes(t.id))) how.push('A game in a ready-made 3D world is a walk, jump, collect and answer game: shape its goal and questions like the game type they chose as far as that fits, and say in one short sentence what is different.');
  } else if (e.engine === 'world3d') {
    how.push('Build it as a 3D world of their own: start_from_template "world3d" and build the place from scratch (the 3D RULES). It is not one of the ready-made worlds: never start from "oomba3d" for it.');
  } else if (e.engine === '2d') {
    if (e.art) {
      how.push(`Build it in 2D on the Oomba Kit with the 2D art: start_from_template ${q(e.template)}${e.art.world ? ` with world ${q(e.art.world)}` : ''}${e.art.sprite ? `${e.art.world ? ' and' : ' with'} sprite ${q(e.art.sprite)}` : ''}${e.art.friends.length ? ` and friends ${JSON.stringify(e.art.friends)}` : ''} (the 2D ART RULES), then make it theirs with edit_game. Never start from "oomba3d" or "world3d" in this build, never write it from scratch with write_game, and never use the kit's own characters in their place: every version of this build must keep them (a version that leaves one out is not saved).`);
      if (e.art.friends.length) how.push(`They picked ${e.art.friends.length + 1} characters for a 2D game: ${who(e.art.sprite)} (the first one picked) is the player, and the others are friends who are IN the game too (CONFIG.friends2d: in a running game they stand along the way and hop as the player runs by, in a catching game they watch from the sides; up to four are drawn at once and the rest take turns). Keep every one of them in friends2d; they are never obstacles or enemies. Tell the builder in one short sentence who they play as and that the others are in the game as friends.`);
      if (!e.art.world && w && w.from === 'pack') how.push(`There is no 2D art of ${q(w.id)} yet: keep the kit's own look and say so in one short sentence.`);
      if (e.extra.length) how.push(`${e.extra.map(who).join(', ')} ${e.extra.length > 1 ? 'have' : 'has'} no 2D sprite yet and cannot be drawn in a 2D game: say so kindly in one short sentence; never draw one from shapes or emoji.`);
    } else {
      how.push(`Build it in 2D on the Oomba Kit, exactly as a 2D game is built today${type && type.template ? ` (start_from_template ${q(type.template)})` : ''}. Never start from "oomba3d" or "world3d" in this build.`);
      if (e.plain) how.push(`Only running and catching games draw the ready-made worlds and sprite characters in 2D so far: this kind of game keeps the kit's own look. Use ${w && w.from === 'pack' ? `the world ${q(w.id)} ` : ''}${w && w.from === 'pack' && picked(plan).length ? 'and ' : ''}${picked(plan).length ? 'the characters ' : ''}as the game's idea (its name, questions and words), keep ${w && w.from === 'pack' ? `the id ${q(w.id)}` : 'their ids'} in the game's tags (set_game), and say in one short, kind sentence that this kind of game does not draw them yet.`);
    }
  } else if (e.engine === 'classroom') {
    how.push(`Build it from the classroom starter: start_from_template ${q(e.template)}. It is plain HTML made for the classroom board and for phones (not on the Oomba Kit, never a 3D world): keep its big type (readable from the back of the room), its keyboard and clicker keys (arrows, Page Up / Page Down, Space, Enter, number keys), its Sound and Full screen buttons and its WORDS table in every language. Make it theirs with edit_game on its CONFIG block (teams, numbers, CONFIG.lang set to the builder's language), its content list (QUESTIONS, CATEGORIES, ITEMS or CARDS, written in the builder's language) and its <title>.`);
    how.push(CLASSROOM_NOTES[e.template]);
    how.push('Classroom rules: never students\' names (teams and numbers only), no free text or typing by students, no chat, nothing about a student stored or sent anywhere. Read-aloud only speaks the fixed lines of the game (BRB.speak with a CONFIG string exactly as written, never a line put together from pieces).');
  } else if (e.engine === 'scratch') {
    how.push('The place is their own idea: decide between 2D on the Oomba Kit and a 3D world of their own ("world3d"), and build the place from scratch. Never use a ready-made 3D world ("oomba3d") for it.');
  }
  if (plan.play === 'live') {
    how.push(`They chose to play it LIVE: build the game, then make it live-ready in this same build with the LIVE RULES (the live pack's tag, Oomba.live.ready once, on('start') and on('end'), results with score / item / quiz.answer), so a teacher or grown-up can host it with Oomba Live. It must still work for one player alone.${e.engine === 'classroom' ? ' This classroom starter is plain HTML, not on the kit: add the kit tag and the live pack ONLY for the live connection (no other packs, no kit screens), keep its own look and keys, and let each player do their part on their own device (their own card, their own answers) while the board shows the round.' : ''}${e.engine === 'world3d' || e.engine === 'scratch' || e.engine === 'open' ? ' If it is a 3D world of their own, it is a live world: do not ask "Live or closed world?".' : ''} Never add free text, typing or chat between players, and never show a player's name except from Oomba.live.players(). Tell them in one short sentence that a teacher or grown-up hosts it live once it is published.`);
  } else if (plan.play === 'screen' || plan.play === 'solo') {
    how.push(`They chose ${plan.play === 'screen' ? 'ON ONE SCREEN' : 'ON MY OWN'}: it is NOT a live game. Do NOT add the live pack or Oomba.live${e.engine === 'world3d' || e.engine === 'scratch' || e.engine === 'open' ? '; a 3D world of their own is a closed world: do not ask "Live or closed world?"' : ''}.${plan.play === 'screen' ? ' Make it work for a room watching one screen: big, readable from the back, simple keys or taps.' : ''} If they ask for a live class game later, make it live then.`);
  }
  const custom = customParts(plan);
  return `SETUP CHOICES (the builder picked these in the setup steps before this chat; their first message says the same in words).
${lines.join('\n')}
How to use them:
- A PACK choice is used exactly as given, by its id: never swap it for something else, never rebuild it from scratch.
- A CUSTOM choice is OUTSIDE the builder packs: no ready-made world, character or starter is it. Build only that part from scratch, as well as the engine allows.${custom.length ? ' Tell the builder in one short, kind sentence which part you made from scratch and that it may look simpler.' : ''}
- Everything "not chosen" is yours to decide. Do not ask the setup questions again (kind of game, look, world, characters, what it teaches, how it is played or live or closed): say your short plan and build now.
${how.map(x => `- ${x}`).join('\n')}`;
}
