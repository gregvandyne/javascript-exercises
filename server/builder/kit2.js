// Kit 2 in the Builder (docs/kit2-themes-plan.md, stage 5): the 3D worlds and characters on Oomba3D.
//   - what exists: worlds, heroes and creatures, read from the generated catalogue (kit2-catalog.js: the shipped theme
//     manifests), never typed here;
//   - the engine choice: when a build uses Kit 2 and when it stays on the old kit (pickKit2, wantsKit2);
//   - the starter layouts: for each world, which of its pieces the starter game (templates/oomba3d.html) stands on,
//     hops along and decorates with (STARTERS; tests check every name against the catalogue);
//   - the rules block the model reads (KIT2_RULES): the exact import map, the Oomba3D reference and the catalogue.
// Pure module (no database).
import fs from 'node:fs';
import path from 'node:path';
import { KIT2_WORLDS, KIT2_VERSIONS, KIT2_API_SOURCE } from './kit2-catalog.js';
import { kit2ImportMap, OOMBA3D_VERSION, OOMBA3D_MODULE, KIT2_LOCK, oomba3dVersionOf } from '../services/vendor.js';
import { fileURLToPath } from 'node:url';
import { LOCALES_DIR, CODES } from '../i18n/index.js';

export { KIT2_WORLDS, KIT2_VERSIONS };
export const WORLD_IDS = KIT2_WORLDS.map(w => w.id);
export const worldById = id => KIT2_WORLDS.find(w => w.id === id) || null;
/** Every hero and creature of the newest worlds, once each, in the order they first appear: [{ id, name, kind, worlds }]. */
export const KIT2_CHARACTERS = (() => {
  const out = new Map();
  for (const w of KIT2_WORLDS) for (const [kind, list] of [['hero', w.heroes], ['creature', w.creatures]]) for (const h of list) {
    if (!out.has(h.id)) out.set(h.id, { id: h.id, name: h.name, kind, worlds: [], ...(kind === 'creature' ? { playable: !!h.playable, moves: h.moves || [] } : {}) });
    out.get(h.id).worlds.push(w.id);
  }
  return [...out.values()];
})();
export const CHARACTER_IDS = KIT2_CHARACTERS.map(c => c.id);
/** The animals of every world, once each. */
export const CREATURE_IDS = KIT2_CHARACTERS.filter(c => c.kind === 'creature').map(c => c.id);
export const characterById = id => KIT2_CHARACTERS.find(c => c.id === id) || null;
/** The characters one world has (heroes, then creatures). */
export const charactersOf = world => { const w = worldById(world); return w ? [...w.heroes, ...w.creatures] : []; };
/** Who can be the HERO in one world: its heroes, then the animals marked playable (a pig or a sheep cannot: no walk). */
export const heroesOf = world => { const w = worldById(world); return w ? [...w.heroes, ...w.creatures.filter(c => c.playable)] : []; };
/** The animals one world has. */
export const creaturesOf = world => { const w = worldById(world); return w ? w.creatures : []; };
/** An animal this world has ('' when it has no such animal). */
export const creatureFor = (world, id) => (creaturesOf(world).find(c => c.id === id) || { id: '' }).id;
/** The world a new Kit 2 game gets when none was named. */
export const DEFAULT_WORLD = 'sky-islands';
/** A character this world has: the one asked for, or the world's first. */
export const heroFor = (world, hero) => { const list = heroesOf(world); return (list.find(h => h.id === hero) || list[0] || { id: '' }).id; };
/** An emoji and a cover colour for each world: a new game's icon and card until its own picture is taken. */
const LOOKS = { 'sky-islands': ['🏝️', 'ocean'], 'castle-quest': ['🏰', 'gold'], 'spooky-hollow': ['🎃', 'sunset'], 'space-base': ['🚀', 'night'], 'toy-town': ['🏙️', 'mint'], 'medieval-village': ['🏡', 'forest'], 'cosy-home': ['🛋️', 'candy'], 'busy-kitchen': ['🍔', 'lava'], 'pirate-cove': ['⛵', 'ocean'] };
export const worldLook = id => LOOKS[id] || ['🌍', 'ocean'];
/** Is this exact theme version shipped (kit2/SHIPPED.json)? */
export const isShipped = (world, version) => !!KIT2_LOCK.themes[`${world}/${version}`];

/** Is this game a Kit 2 game (it imports Oomba3D through the Kit 2 import map)? */
export const isKit2Game = html => { const s = String(html || ''); return s.includes(OOMBA3D_MODULE.replace(/\d+\.\d+\.\d+\/oomba3d\.js$/, '')) && /\bfrom\s*["']oomba3d["']/.test(s); };
/** The world, version and hero a Kit 2 game names (the starter's CONFIG lines, or start({ theme, version })). */
export function kit2Of(html) {
  const s = String(html || ''); if (!isKit2Game(s)) return null;
  const pick = re => (re.exec(s) || [])[2] || '';
  const world = pick(/\b(world|theme)\s*:\s*['"]([a-z0-9-]{2,40})['"]/), version = pick(/\b(version)\s*:\s*['"](\d+\.\d+\.\d+)['"]/);
  const hero = pick(/\b(hero)\s*:\s*['"]([a-z0-9-]{2,40})['"]/) || (/\.hero\(\s*['"]([a-z0-9-]{2,40})['"]/.exec(s) || [])[1] || '';
  const companion = pick(/\b(companion)\s*:\s*['"]([a-z0-9-]{2,40})['"]/);
  return { world, version, hero, ...(companion ? { companion } : {}) };
}
/** Can this saved game have animals as it is? It must be on Oomba3D 1.2.0 or later and name a world version that has them. */
export function hasAnimals(html) {
  const k = kit2Of(html); if (!k) return false;
  const [a, b] = oomba3dVersionOf(html).split('.').map(Number), w = worldById(k.world);
  return (a > 1 || (a === 1 && b >= 2)) && !!w && w.version === k.version && w.creatures.length > 0;
}

// ---- The starter layouts -----------------------------------------------------------------------------------------
// What the starter game is made of in each world: [piece, scale] pairs from that world's own catalogue. ground: the
// tiles of the start and goal places; side: the small ground a piece of scenery stands on beside the way; step: the stones to hop along; pad: what an answer floats over; goal: what
// marks the finish; landmark: the big thing behind the goal; scenery: what stands beside the way. hex: the ground is
// hexagon tiles (laid as a honeycomb). sea: the colour of the water far below ('' for none). time: the sky.
// seaY: the water's height when the world stands IN the sea (default: far below, at -5). afloat: ships and boats put
// out on that sea, [piece, scale] each.
const L = (ground, step, pad, goal, landmark, scenery, o = {}) => ({ ground, step, pad, goal, landmark, scenery, side: ground, hex: false, sea: '', time: 'day', plaza: 3, ...o });
export const STARTERS = {
  'sky-islands': L(['island-round', 3], ['platform-medium', 1.3], ['island-round', 0.9], ['flag', 3], ['cloud', 5],
    [['grass', 3.5], ['grass-small', 3.5], ['coin-block', 1.4], ['brick', 1.4]], { sea: '#3fa7d6', plaza: 1, side: ['island-round', 1] }),
  'castle-quest': L(['floor-stone', 1], ['block', 1.3], ['floor-wood', 0.8], ['chest-gold', 1.2], ['castle-building', 3],
    [['torch', 1.6], ['banner-blue', 1], ['tree', 3], ['barrel', 0.8], ['banner-red', 1], ['trees', 2.4], ['crates', 0.8], ['pillar', 1]]),
  'spooky-hollow': L(['ground', 1], ['ground-small', 1.3], ['ground-small', 1.5], ['chest', 1.2], ['arch', 1.3],
    [['pumpkin-lantern', 1.1], ['tree-pine-orange-small', 1], ['lantern', 1.6], ['tree-bare-medium', 1], ['pumpkin-yellow-lantern', 1.1], ['tree-pine-yellow', 0.9], ['fence', 0.9], ['pumpkin', 1.2]], { time: 'sunset' }),
  'space-base': L(['ground', 2], ['landing-pad-small', 1.4], ['landing-pad', 1.2], ['rocket-lander', 2.2], ['base-dome', 3.4],
    [['solar-panel', 2.6], ['rover', 2.4], ['lights', 1.8], ['cargo-stack', 1.5], ['wind-turbine', 1.6], ['rocks', 1.8], ['base-tower', 2.4], ['drill', 1.6]], { time: 'night' }),
  'toy-town': L(['ground', 2], ['road-crossing', 1.6], ['road', 1.6], ['water-tower', 3], ['building-c', 2.6],
    [['tree', 3.2], ['building-a', 2.2], ['streetlight', 3], ['car-taxi', 2.6], ['building-e', 2.2], ['traffic-light', 3.4], ['car-police', 2.6], ['trees', 2.4]]),
  'medieval-village': L(['ground', 2], ['road', 1.6], ['river-crossing', 1.5], ['chest', 1.1], ['castle', 3],
    [['cottage', 2.6], ['tree', 3], ['windmill', 2.8], ['well', 2.2], ['house-red', 2.8], ['trees', 2.4], ['market', 2.2], ['flag-blue', 4]], { hex: true, sea: '#4aa3c7' }),
  'cosy-home': L(['floor', 1], ['table-low', 1.4], ['floor-small', 1.5], ['chest', 1.2], ['bookshelf', 2.4],
    [['lamp', 1.2], ['armchair', 1.2], ['cactus', 1.6], ['couch', 1.1], ['lamp-table', 1.4], ['bed-small', 1], ['books', 2], ['chair', 1.3]]),
  'busy-kitchen': L(['floor', 1], ['counter', 1.4], ['floor-small', 1.5], ['burger', 2.2], ['fridge', 1.6],
    [['crate-carrots', 1], ['stool', 1.4], ['tomato', 1.8], ['oven', 1.1], ['crate-tomatoes', 1], ['cheese', 1.8], ['stove', 1.1], ['carrot', 1.8]]),
  'pirate-cove': L(['island-sand', 0.8], ['dock', 1.3], ['island-grass', 0.7], ['chest', 1.4], ['tower', 1],
    [['palm-tall', 1], ['barrel', 1.1], ['palm-bend', 1], ['hut-roof', 0.9], ['flag-high', 1], ['rocks-sand-small', 0.8], ['palm', 1], ['crate', 1.1]],
    { sea: '#0077c8', seaY: -1.5, plaza: 1, side: ['island-grass', 0.9], afloat: [['ship-large', 1], ['rowing-boat', 1], ['ship-small', 1], ['shipwreck', 1], ['rowing-boat-small', 1], ['ship', 1]] }),
};
/** The starter layout for a world: its own, or one made from its catalogue tags (a world shipped after this file). */
export function starterFor(world) {
  if (STARTERS[world]) return STARTERS[world];
  const w = worldById(world); if (!w) return null;
  const by = (...tags) => w.pieces.find(p => p.kind !== 'effect' && tags.some(t => p.tags.includes(t)));
  const ground = by('ground', 'floor', 'island') || w.pieces[0], step = by('step', 'platform') || ground, goal = by('goal', 'treasure') || by('coin') || ground;
  const fit = (p, want) => [p.id, Math.round(want / Math.max(p.size[0], p.size[2], 0.1) * 10) / 10];
  const scenery = w.pieces.filter(p => ['decor', 'prop'].includes(p.kind) && !p.tags.includes('coin') && p !== goal).slice(0, 8).map(p => [p.id, Math.round(1.5 / Math.max(...p.size, 0.1) * 10) / 10]);
  return L(fit(ground, 4), fit(step, 3), fit(step, 3), [goal.id, Math.round(1.6 / Math.max(...goal.size, 0.1) * 10) / 10], scenery[0] || [ground.id, 1], scenery);
}

// ---- The starter game --------------------------------------------------------------------------------------------
const TEMPLATE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates/oomba3d.html');
let templateSrc = null;
const js = v => JSON.stringify(v).replace(/</g, '\\u003c');
/**
 * The Kit 2 starter game for one world and character: templates/oomba3d.html (the Sky Islands starter, a whole game
 * by itself) with the literal Kit 2 import map, this world's newest shipped version, its starter layout and sky, and
 * the character (the world's first when it has no such character) put into its own lines.
 * -> the game document, or null for a world that has not shipped.
 */
export function kit2Starter({ world = DEFAULT_WORLD, hero = '', title = '', companion = '' } = {}) {
  const w = worldById(world), lay = starterFor(world); if (!w || !lay) return null;
  if (templateSrc === null) templateSrc = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  const one = pair => `{ piece: ${js(pair[0])}, scale: ${pair[1]} }`;
  const layout = [
    `  ground: ${one(lay.ground)},`, `  side: ${one(lay.side)},`, `  step: ${one(lay.step)},`, `  pad: ${one(lay.pad)},`, `  goal: ${one(lay.goal)},`, `  landmark: ${one(lay.landmark)},`,
    `  scenery: [${lay.scenery.map(one).join(', ')}],`, `  plaza: ${lay.plaza},`, `  hex: ${lay.hex},`, `  sea: ${js(lay.sea)},`,
    ...(lay.seaY == null ? [] : [`  seaY: ${lay.seaY},`]), ...(lay.afloat ? [`  afloat: [${lay.afloat.map(one).join(', ')}],`] : []),
  ].join('\n');
  const name = title || w.name;
  const setLine = (src, key, value) => src.replace(new RegExp(`\\n(  ${key}: )[^\\n]*,\\n`), (m, a) => `\n${a}${value},\n`);
  let out = templateSrc
    .replace(/<script type="importmap">[\s\S]*?<\/script>/, () => kit2ImportMap())
    .replace(/<title>[^<]*<\/title>/, () => `<title>${name.replace(/[<>&]/g, '')}</title>`)
    .replace(/\nconst LAYOUT = \{\n[\s\S]*?\n\};\n/, () => `\nconst LAYOUT = {\n${layout}\n};\n`);
  for (const [key, value] of [['title', `'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[<>\n\r]/g, '')}'`], ['world', `'${w.id}'`], ['version', `'${w.version}'`], ['hero', `'${heroFor(w.id, hero)}'`], ['time', `'${lay.time}'`], ...(creatureFor(w.id, companion) ? [['companion', `'${creatureFor(w.id, companion)}'`]] : [])]) out = setLine(out, key, value);
  return out;
}

// ---- The engine choice -------------------------------------------------------------------------------------------
// A build uses Kit 2 when (in this order):
//   1. the game is already a Kit 2 game;
//   2. the builder picked or named a Kit 2 world or character: a 3D world or hero chip in the Studio (its sentence, in
//      any site language), a world's name in any site language ("Castle Quest", "Château Aventure"), or its id;
//   3. there is no game yet and the message describes a place that is one of the worlds ("on the moon", "in a castle",
//      "a spooky forest", "in the kitchen"), unless it asks for a kind of game Kit 2 does not make (cards, a board, a
//      word game, two players on one screen, catching falling things), says 2D, or picks an old-kit theme chip.
// Otherwise the build stays on the old kit (the Oomba Kit for 2D, its own Three.js world for a 3D request that fits no
// world). A character named in words counts only together with a world, a 3D word ("a 3D game with a knight") or a
// Kit 2 game: "a wizard quiz"
// alone is an old-kit game, as before. The model can also choose Kit 2 itself (start_from_template "oomba3d") for
// requests in other languages; this module is the part that does not depend on the model.
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, '\'');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
const at = (o, dotted) => dotted.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);

/** Every site language's names for the worlds and characters, and its chip sentences (read from the locale files). */
const NAMES = (() => {
  const worlds = new Map(), heroes = new Map(), animals = new Map(), chips = { world: [], hero: [], classic: [] };
  const mapOf = id => ((KIT2_CHARACTERS.find(c => c.id === id) || {}).kind === 'creature' ? animals : heroes);
  const add = (map, name, id) => { const n = norm(name).trim(); if (n.length >= 2 && !map.has(n)) map.set(n, id); };
  for (const w of KIT2_WORLDS) { add(worlds, w.name, w.id); add(worlds, w.id, w.id); add(worlds, w.id.replace(/-/g, ' '), w.id); }
  for (const c of KIT2_CHARACTERS) { add(mapOf(c.id), c.name, c.id); add(mapOf(c.id), c.id, c.id); add(mapOf(c.id), c.id.replace(/-/g, ' '), c.id); }
  for (const code of CODES) {
    const d = readJson(path.join(LOCALES_DIR, `${code}.json`));
    for (const [id, name] of Object.entries(at(d, 'studio.worlds.names') || {})) if (WORLD_IDS.includes(id)) add(worlds, name, id);
    for (const [id, name] of Object.entries(at(d, 'studio.heroes.names') || {})) if (CHARACTER_IDS.includes(id)) add(mapOf(id), name, id);
    for (const [kind, key] of [['world', 'js.studio.worldUse'], ['hero', 'js.studio.heroUse'], ['classic', 'js.studio.themeUse']]) {
      const s = at(d, key); if (typeof s !== 'string' || !s.includes('{name}')) continue;
      const [a, b] = norm(s).split('{name}');
      chips[kind].push(new RegExp(`${esc(a.trim())}\\s*(.{2,60}?)\\s*${esc(b.trim())}`));
    }
  }
  const sorted = map => [...map.entries()].sort((x, y) => y[0].length - x[0].length);
  return { worlds: sorted(worlds), heroes: sorted(heroes), animals: sorted(animals), chips };
})();
const BOUND = '(?:^|[^\\p{L}\\p{N}])', END = '(?=$|[^\\p{L}\\p{N}])', NO_SPACES = /[\u3040-\u30ff\u3400-\u9fff]/;
/** The name (of a sorted [name, id] list) that appears LAST in the text, as a whole word -> id or ''. */
function lastNamed(list, t) {
  let best = '', bestAt = -1;
  for (const [name, id] of list) {
    // Japanese and Chinese are written without spaces: a name there is matched wherever it stands.
    const re = new RegExp(NO_SPACES.test(name) ? esc(name) : `${BOUND}${esc(name)}${END}`, 'gu'); let m;
    // the list is longest first, so of two names ending at the same place ("Hooded Ranger", "Ranger") the longer wins
    while ((m = re.exec(t))) { const end = m.index + m[0].length; if (end > bestAt) { bestAt = end; best = id; } }
  }
  return best;
}
// Places a child may describe (English; other languages use the chips or the world's name) -> world.
const PLACE_WORDS = [
  ['sky-islands', /\b(sky|floating|flying|cloud) islands?\b|\bislands? in the (sky|clouds)\b|\b(in|above|over|on) the clouds\b/],
  ['space-base', /\b(on|to) (the moon|mars|a planet|another planet)\b|\bmoon ?base\b|\bspace ?(base|station|ship)\b|\bouter space\b|\b(in|into) space\b|\bred planet\b|\bastronauts?\b|\brovers?\b|\brocket ?ship\b|\bthe moon\b/],
  // Before the castle: "a pirate treasure chest" is a cove, not a dungeon. (A space ship is already Space Base above.)
  ['pirate-cove', /\bpirates?\b|\btreasure (islands?|maps?|hunts?|coves?)\b|\b(desert|tropical|sandy) islands?\b|\bisland[- ]hopping\b|\b(on|aboard|sailing) (a|the|my) (sailing |big |wooden )?(ship|boat)s?\b|\bsailing ships?\b|\b(at|on|by|in) the (docks?|harbou?r)\b|\bcoves?\b|\bshipwrecks?\b/],
  ['castle-quest', /\bcastles?\b|\bdungeons?\b|\btreasure chests?\b/],
  ['spooky-hollow', /\bspooky\b|\bhaunted\b|\bhalloween\b|\bpumpkins?\b/],
  ['medieval-village', /\bvillages?\b|\bwindmills?\b|\bmedieval\b|\bwatermills?\b/],
  ['toy-town', /\btoy town\b|\b(in|around|through) (a|the|my) (town|city)\b|\bcity streets?\b|\btraffic\b|\btaxis?\b/],
  ['busy-kitchen', /\bkitchens?\b|\brestaurants?\b|\bburgers?\b|\bchef\b/],
  ['cosy-home', /\b(cosy|cozy) (home|house)\b|\b(in|around|inside) (a|the|my) (house|home|bedroom|living room)\b|\btidy[- ]up\b/],
];
// Characters a child may describe (English) -> hero id (only ever used inside a Kit 2 build).
const HERO_WORDS = [
  ['knight', /\bknights?\b/], ['mage', /\bwizards?\b|\bmages?\b|\bwitch(es)?\b|\bmagicians?\b/], ['barbarian', /\bexplorers?\b|\badventurers?\b|\bbarbarians?\b/],
  ['rogue-hooded', /\bhooded\b|\bninjas?\b/], ['rogue', /\brangers?\b|\barchers?\b|\brogues?\b/],
  ['captain-clank', /\bcaptains?\b|\bpirates?\b/], ['skelly', /\bskeletons?\b|\bskelly\b/], ['rattles', /\brattles\b/], ['bonzo', /\bbonzo\b/],
];
// Animals a child may ask for (English; other languages use the chips or the animal's name) -> the creatures that are
// one, kept only while a shipped world has them. "A dog" is the husky in the village and the shiba at the castle.
const ANIMAL_WORDS = [
  [['horse'], /\bhorses?\b|\bpon(y|ies)\b|\bstallions?\b/], [['donkey'], /\bdonkeys?\b/], [['cow'], /\bcows?\b|\bcattle\b/], [['pig'], /\bpig(s|gy|gies|let|lets)?\b/],
  [['sheep'], /\bsheep\b|\blambs?\b/], [['husky', 'shiba'], /\bdogs?\b|\bpupp(y|ies)\b/], [['husky'], /\bhusk(y|ies)\b/], [['shiba'], /\bshibas?\b/],
  [['fox'], /\bfox(es)?\b/], [['stag'], /\bstags?\b|\breindeers?\b/], [['deer'], /\bdeer\b/],
].map(([ids, re]) => [ids.filter(id => (KIT2_CHARACTERS.find(c => c.id === id) || {}).kind === 'creature'), re]).filter(([ids]) => ids.length);
// "With my dog", "a pet fox", "followed by a horse": the animal comes along. Otherwise an animal that can be the hero is the hero.
const COMPANION_WORDS = /\b(pet|companion|friend|buddy|sidekick|helper)\b|\bfollow(s|ed|ing)?\b|\b(with|and|has|have|bring|add) (a|an|my|his|her|their|the) /;
// Animals and dinosaurs in general: when the one asked for is not in any shipped world (a dinosaur, a cat, a fish
// today) the Builder says so kindly instead of pretending.
const CREATURE_WORDS = /\bdino(saur)?s?\b|\bt-?rex\b|\braptors?\b|\btriceratops\b|\banimals?\b|\bdogs?\b|\bpupp(y|ies)\b|\bcats?\b|\bkittens?\b|\bhorses?\b|\bpon(y|ies)\b|\bcows?\b|\bpigs?\b|\bsheep\b|\bchickens?\b|\bfox(es)?\b|\bbears?\b|\bwol(f|ves)\b|\bdeer\b|\brabbits?\b|\bbunn(y|ies)\b|\bfish\b|\bsharks?\b|\bdragons?\b|\bbirds?\b|\bfrogs?\b|\bmonkeys?\b|\blions?\b|\btigers?\b|\belephants?\b|\bpenguins?\b|\bunicorns?\b/;
const TWO_D_ONLY = /\b2 ?-?d\b|\bmemory\b|\bmatching\b|\bpairs\b|\bflip\b|\bcards?\b|\bboard ?games?\b|\bdice\b|\bword (game|search|puzzle)s?\b|\bspell(ing)?\b|\bhangman\b|\b(two|2)[ -]?players?\b|\bduel\b|\bversus\b|\bcatch(ing)?\b|\bfalling\b|\bbasket\b|\bclassic (kit|look|theme)\b|\bold (kit|look)\b/;
const THREE_D = /(^|[^a-z0-9])(3\s?-?d|three[- ]?d)([^a-z0-9]|$)/;

/**
 * What a message picks -> { world, hero, by, wantsCreature } (world/hero '' when not named).
 * by: 'chip' (a Studio 3D chip), 'name' (a world named), 'place' (a place described: new games only), or '' (nothing
 * that means Kit 2). classic: true when it picks an old-kit theme chip or says 2D.
 */
export function pickKit2(text) {
  const t = norm(text);
  const chipOf = kind => { for (const re of NAMES.chips[kind]) { const m = re.exec(t); if (m) return m[1]; } return null; };
  const worldChip = chipOf('world'), heroChip = chipOf('hero');
  const chipWorld = worldChip ? lastNamed(NAMES.worlds, worldChip) : '', chipAnimal = heroChip ? lastNamed(NAMES.animals, heroChip) : '', chipHero = (heroChip ? lastNamed(NAMES.heroes, heroChip) : '') || chipAnimal;
  const named = lastNamed(NAMES.worlds, t);
  const classicChip = chipOf('classic'), classic = (!!classicChip && !chipWorld && !chipHero && !named) || /(^|[^a-z0-9])2 ?-?d\b|\bclassic (kit|look|theme)\b|\bold (kit|look)\b/.test(t);
  let place = ''; for (const [id, re] of PLACE_WORDS) if (re.test(t)) { place = id; break; }
  const heroWord = (HERO_WORDS.find(([, re]) => re.test(t)) || [''])[0], namedHero = (chipAnimal ? '' : chipHero) || lastNamed(NAMES.heroes, t), person = namedHero || heroWord;
  // "pirate" alone is a place as much as a character (Pirate Cove has no Captain Clank): the hero it suggests is a soft
  // pick, kept only in a world that has him ("a pirate game in Castle Quest"), never reported as missing.
  const soft = !namedHero && heroWord === 'captain-clank' && !/\bcaptains?\b/.test(t);
  // An animal a shipped world has: its chip, its name (any site language) or an everyday word for it.
  const animals = chipAnimal ? [chipAnimal] : lastNamed(NAMES.animals, t) ? [lastNamed(NAMES.animals, t)] : (ANIMAL_WORDS.find(([, re]) => re.test(t)) || [[]])[0];
  const playable = id => !!(characterById(id) || {}).playable;
  // It is the hero when it can be one and nobody else is; it comes along as a companion when a hero is named too, when
  // the words say so ("with my dog", "a pet fox"), or when it cannot be the hero (a pig, a sheep).
  const along = animals.length > 0 && (!!person || COMPANION_WORDS.test(t) || !animals.some(playable));
  const heroName = person || (animals.length && !along ? animals.find(playable) : '');
  const threeD = THREE_D.test(t);
  // "a 3D game with a knight": a 3D request that names one of the characters is a pick of that character.
  const by = chipWorld || chipHero ? 'chip' : named || (threeD && heroName && !classic) ? 'name' : place && !classic && !TWO_D_ONLY.test(t) ? 'place' : '';
  // animals: the creature(s) the words can mean (one per world at most); along: it comes along instead of being the hero.
  // wantsCreature: an animal was asked for that no shipped world has (a dinosaur today).
  return { world: chipWorld || named || (by ? place : ''), hero: heroName, soft, animals, along, by, classic, threeD, wantsCreature: CREATURE_WORDS.test(t) && !animals.length };
}

/**
 * The engine for this turn. state: the Builder's saved state for the game (state.kit2 remembers the choice:
 * { world, hero }); version: the current version (or null). -> { world, hero, by, wantsCreature } when this build is a
 * Kit 2 build, else null. by: 'game' (already Kit 2), 'chip', 'name', 'place', or 'kept' (chosen in an earlier turn).
 */
export function wantsKit2(state, text, version) {
  const cur = version ? kit2Of(version.html) : null, p = pickKit2(text);
  const explicit = p.by === 'chip' || p.by === 'name';
  if (p.classic && !explicit && !cur) { if (state) delete state.kit2; return null; }
  let by = '';
  // A pick the current game already is (the same world, and the hero if one was picked) is no longer a pick to act on:
  // the build's later steps, and the next turns, see "this game is in ...".
  const done = cur && explicit && (!p.world || p.world === cur.world) && (!p.hero || heroFor(cur.world, p.hero) === cur.hero) && !(p.along && (p.animals || []).some(id => creatureFor(cur.world, id) && id !== cur.companion));
  if (explicit && !done) by = p.by;
  else if (cur) by = 'game';
  else if (p.by === 'place' && !version) by = 'place';
  else if (state && state.kit2 && !version) by = 'kept';
  if (!by) return null;
  const before = (state && state.kit2) || {};
  // With no world named: the game's own, the one picked before, or the first world that has the character asked for.
  const animals = p.animals || [], asked = characterById(p.hero) || characterById(animals[0]), home = asked && !asked.worlds.includes(DEFAULT_WORLD) ? asked.worlds[0] : DEFAULT_WORLD;
  const world = p.world || (cur && WORLD_IDS.includes(cur.world) ? cur.world : '') || before.world || home;
  if (p.soft && heroFor(world, p.hero) !== p.hero) p.hero = '';
  // The animal meant: the one this world has ("a dog" is the husky in the village, the shiba at the castle).
  const animal = animals.find(id => creatureFor(world, id)) || animals[0] || '';
  const wantHero = p.hero && animals.includes(p.hero) ? animal : p.hero;
  // A character named in words counts here, inside a Kit 2 build; it must be one this world has.
  const hero = heroFor(world, wantHero || (cur && cur.hero) || before.hero || '');
  // The companion: the animal asked to come along, else the one the game (or an earlier turn in this world) has.
  const companion = creatureFor(world, p.along ? animal : '') || (animal && !p.along ? '' : creatureFor(world, (cur && cur.world === world && cur.companion) || (before.world === world && before.companion) || ''));
  if (state) state.kit2 = { world, hero, ...(companion ? { companion } : {}) };
  // missing: a character or animal they asked for that this world does not have (the world's first hero plays instead).
  const missing = wantHero && heroFor(world, wantHero) !== wantHero ? wantHero : p.along && animal && !creatureFor(world, animal) ? animal : '';
  // upgrade: this saved game is on an older Oomba3D or an older version of its world, which has no animals: the animal
  // asked for needs the game moved to a fresh starter (start_from_template again), with everything carried over.
  const wantsAnimal = !!animal && !missing, upgrade = wantsAnimal && !!cur && cur.world === world && !!version && !hasAnimals(version.html);
  return { world, hero, ...(companion ? { companion } : {}), by, wantsCreature: p.wantsCreature, ...(missing ? { missing } : {}), ...(upgrade ? { upgrade: true } : {}),
    changed: !!cur && ((!!p.world && p.world !== cur.world) || (!!wantHero && hero !== cur.hero) || (companion || '') !== (cur.companion || '')) };
}

// ---- What the model is told --------------------------------------------------------------------------------------
const size = p => p.size.join('x');
const worldText = w => [
  `## ${w.id} ${w.version} ("${w.name}"): ${w.description} Good for: ${w.goodFor.join(', ')}.`,
  `Heroes: ${w.heroes.map(h => `${h.id} (${h.name})`).join(', ')}.`,
  w.creatures.length ? `Creatures (animals for g.creature and g.school: id (name) widthxheightxlength, its moves, and whether it can be the hero): ${w.creatures.map(h => `${h.id} (${h.name}) ${h.size.join('x')} moves ${h.moves.join('/')}${h.playable ? ' playable' : ' not playable (no walk: it hops)'}`).join('; ')}.` : 'Creatures: none in this world.',
  `Pieces (id widthxheightxdepth in metres at scale 1, tags): ${w.pieces.map(p => `${p.id} ${size(p)} ${p.tags.join('/')}${p.note ? ` [${p.note}]` : ''}`).join('; ')}.`,
  `Sounds: ${w.sounds.join(', ')}, cheer, wrong. Moves: ${w.moves.join(', ')}.`,
  STARTERS[w.id] ? `Starter layout: ground ${STARTERS[w.id].ground.join(' x')}, step ${STARTERS[w.id].step.join(' x')}, pad ${STARTERS[w.id].pad.join(' x')}, goal ${STARTERS[w.id].goal.join(' x')}, landmark ${STARTERS[w.id].landmark.join(' x')}.` : '',
  STARTERS[w.id] && STARTERS[w.id].seaY != null ? `This world stands in the sea: water at y ${STARTERS[w.id].seaY} (LAYOUT.seaY), tops of islands and docks at 0, pieces tagged afloat out on the water (LAYOUT.afloat).` : '',
].filter(Boolean).join('\n');
export const KIT2_CATALOG_TEXT = KIT2_WORLDS.map(worldText).join('\n\n');
const ANIMALS = KIT2_CHARACTERS.filter(c => c.kind === 'creature');
const NO_CREATURES = ANIMALS.length
  ? `\n- Animals: the only animals are the creatures listed for a world below (${ANIMALS.map(c => c.id).join(', ')}). Never invent a creature name, and never use one in a world that does not list it: g.creature() stops the game with an error. If the builder asks for an animal that is not listed (a dinosaur, a cat, a fish: not yet), say so kindly in one short sentence, offer the animals there are, and make the WORLD about their idea (its name, its questions, what there is to collect). Never pretend a hero is an animal, and never draw one from shapes in a Kit 2 game.
- An animal in a game: CONFIG.companion (the starter's line: a creature id of this world, or '') makes it trail the hero; CONFIG.hero may be a creature marked playable (the player IS the horse); more animals with g.creature(id, { x, y, z }) and then wander(), follow(path), walkTo(), onMeet(fn) (the hero came close: a toast, a question, a count; never a penalty). Use only the moves listed for that creature: one that is "not playable" has no walk, so it hops, and it can be a companion or scenery but never the hero. Animals are never enemies or obstacles: nothing an animal does may cost points, lives or time, there is no chasing, biting or hitting, and no game is about hurting, hunting, catching or selling one. Keep it light: at most 8 animals in a game.`
  : '\n- There are no animal or dinosaur characters yet. If the builder asks for one, say so kindly in one short sentence, pick the closest hero (an outfit colour helps: a green cape for a dinosaur fan) and make the WORLD about their idea (its name, its questions, what there is to collect). Never pretend a hero is an animal, and never draw one from shapes in a Kit 2 game.';

/** The short list for the main prompt: what worlds and characters exist, so the model can offer and choose them. */
export const KIT2_SHORT = `# 3D worlds with real characters (Kit 2)
Oomba Academy has ready-made 3D worlds with animated characters. Each is a whole look (ground, buildings, props, sky):
${KIT2_WORLDS.map(w => `- ${w.id} ("${w.name}"): ${w.description}`).join('\n')}
Characters: ${KIT2_CHARACTERS.map(c => `${c.id} (${c.name})`).join(', ')}.${ANIMALS.length ? ` The animals (${ANIMALS.map(c => `${c.id}: ${c.worlds.join(' and ')}`).join('; ')}) live only in the worlds named; the playable ones can be the hero, any of them can be a companion that follows the hero. No dinosaurs, fish or other animals yet.` : ' No animals or dinosaurs yet.'}
- Use one when the builder picks or names a world or character from this list, or describes a place that is one of them
  (a castle, the moon, a spooky wood, a village, a town, a kitchen, a house, islands in the sky, a pirate cove or
  treasure island) for a game where a hero
  walks, jumps, collects and answers. Then call start_from_template with template "oomba3d", the world and the hero
  (and companion: an animal of that world that follows the hero, when they ask for one):
  the KIT 2 RULES arrive with the starter. These games are NOT on the Oomba Kit and NOT on the world3d starter.
- Stay on the Oomba Kit (2D) for card, board, word, catching and two-player games and for anything the builder wants in
  2D, and on "world3d" for a 3D world that is none of these places. Never mix: one game, one engine.
- Never invent a world, character or piece name: only the names in this list and in the KIT 2 RULES exist.`;

/** The Kit 2 rules: a fixed block (same bytes for everyone, cached), sent only for Kit 2 builds and Kit 2 games. */
export const KIT2_RULES = `KIT 2 RULES (this build is a 3D game in one of the ready-made worlds, on Oomba3D ${OOMBA3D_VERSION}). Every rule above still applies,
except that a Kit 2 game is NOT built on the Oomba Kit and NOT on the world3d starter: no kit tag, no packs, no
Oomba.game, no Oomba.three, no Three.js shapes for characters. The 3D RULES do not apply to it.

# How a Kit 2 game is built
- For a new game call start_from_template with template "oomba3d", world (one of: ${WORLD_IDS.join(', ')}), hero (one
  of that world's heroes, or one of its playable creatures) and, when they want an animal friend, companion (one of
  that world's creatures). You get a finished starter: the world's sky and light, a start place, stones to hop along
  with coins, a question with answers to jump to, a goal, the title and results screens, touch and keyboard controls,
  the words in 13 languages and the test hook. In the SAME turn make it theirs with edit_game: CONFIG (title, hero, companion,
  outfit, time, weather, steps, coinValue, bonus), QUESTIONS (their questions, in the builder's language), the WORDS table (every
  language you change), and LAYOUT or buildWorld() for a different place (more scenery, another landmark, a longer way).
- To move a Kit 2 game to another world, call start_from_template again with the new world and carry over their title,
  hero, questions and words with edit_game: every world has its own pieces, so LAYOUT must be that world's.
- If they already have an old-kit game and ask for a 3D world or character, tell them it becomes a new 3D game and their
  old game stays in Versions, and ask with ask_user before you call start_from_template. Carry their idea over.
- The document: <title>, then EXACTLY this import map (copy it byte for byte, integrity lines included; the starter
  already has it), then your <style>, your own elements and one <script type="module"> that imports from 'oomba3d':
${kit2ImportMap()}
- A game names ONE world and its exact version in start({ theme, version }): use the version listed below for that
  world, written out as text (never built from pieces, never another number). A saved game keeps its version for good.
- A saved game also keeps the Oomba3D its own import map names. A game whose map names an Oomba3D older than
  ${OOMBA3D_VERSION}, or an older version of its world, has no animals: do not call g.creature, g.school or
  g.world.ground in it and do not just swap its import map. To give such a game an animal, call start_from_template
  again (same world, their hero) and carry their title, questions and words over with edit_game.
- Asset names: use ONLY the hero, creature, piece, sound and move names listed for that world below. A name from
  another world, or one you made up, stops the game with an error. Do not load anything by URL: no fetch, no model
  files, no textures, no fonts, no other add-ons (Oomba3D loads the world's art itself).${NO_CREATURES}
- g.askQuestion() makes its answer islands from the piece "island-round", which only sky-islands has. In every other
  world use the starter's answer pads (answerPad(): made from that world's own pad piece), never g.askQuestion().
- Pieces have very different sizes: check each piece's size below and scale it against the hero (about 2.4 m tall). The
  starter's put() stands a piece on the ground whatever its own base is; stand() makes something to walk on with its
  top at a height you choose. A jump reaches about 1.8 m up and 5 m forward: keep gaps under 3 m and steps under 1.5 m.
- Keep it light for school Chromebooks: at most about 120 pieces in view, outline: true only up to a few hundred pieces,
  no per-frame allocations in g.onUpdate.
- Keep window.__brbTest (state, start), BRB.gameOver({ won, score }) at the end of every round, BRB.score.submit, the
  title screen with its big Play button and the results screen with Play again. Words the player reads live in WORDS.
- No text boxes, no names, no chat: the kid rules are the same in 3D.
- Live class games (Oomba Live) are not made in these 3D worlds yet: if the builder asks for one, say so kindly in one
  short sentence and offer to keep building their world. Do not add the live pack to a Kit 2 game.

# The Oomba3D reference (exact signatures)
${KIT2_API_SOURCE}

# The worlds (the newest shipped version of each): every name a game may use
${KIT2_CATALOG_TEXT}`;

/** This turn's choice, as a short block after the rules (not cached: it changes with the builder's pick). */
export function kit2Note(pick) {
  if (!pick) return '';
  const w = worldById(pick.world), h = characterById(pick.hero);
  const how = { chip: 'The builder picked', name: 'The builder named', place: 'The builder described a place that is', kept: 'Earlier the builder picked', game: 'This game is in' }[pick.by] || 'This build uses';
  return `KIT 2 CHOICE: ${how} the 3D world ${w ? `${w.id} ("${w.name}") ${w.version}` : pick.world}${h ? `, with the hero ${h.id} (${h.name})` : ''}. `
    + (pick.by === 'game' && !pick.changed ? 'Keep it a Kit 2 game in this world unless they ask for another.' : pick.by === 'place' ? 'Build it as a Kit 2 game (start_from_template "oomba3d" with this world) unless they clearly want a flat 2D game.' : 'Build it as a Kit 2 game: start_from_template "oomba3d" with this world and hero, then make it theirs.')
    + (pick.companion && characterById(pick.companion) ? ` The animal that comes along: ${pick.companion} (${characterById(pick.companion).name}), as CONFIG.companion (start_from_template takes it as companion).` : '')
    + (pick.upgrade ? ' This saved game is on an older Oomba3D or an older version of its world, which has no animals: to add the animal, call start_from_template again with this world, hero and companion, then carry their title, questions and words over with edit_game.' : '')
    + (pick.wantsCreature ? (ANIMALS.length ? ` They asked for an animal that is not in any world yet: say that kindly in one short sentence, and offer the animals there are (${ANIMALS.map(c => c.name).join(', ')}).` : ' They asked for an animal or dinosaur: there is none yet, so say that kindly and pick the closest hero.') : '')
    + (pick.missing && characterById(pick.missing) ? ` ${w ? w.name : 'This world'} has no ${characterById(pick.missing).name}: say so kindly and use one of this world's heroes.` : '');
}
