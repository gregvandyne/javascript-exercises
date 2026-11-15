// The 2D art packs in the Builder (docs/kit2-themes-plan.md "2D versions"): the Kit 2 worlds, heroes and animals drawn
// as pictures, for 2D games on the Oomba Kit.
//   - what exists: worlds with their sprites, heroes and animals, read from the generated catalogue (art2d-catalog.js:
//     the locked pack manifests), never typed here;
//   - the tags a game loads them with and the two CONFIG lines of the templates that take them (art2dTags, art2dConfig);
//   - when a 2D build gets a world's art or an animal hero (pickArt2d, wantsArt2d); the engine choice itself stays in
//     kit2.js: a 3D build stays 3D;
//   - the rules block the model reads (ART2D_RULES) and this turn's note (art2dNote).
// Pure module (no database). It does not import kit2.js (kit2.js asks it about the 2D chips).
import fs from 'node:fs';
import path from 'node:path';
import { ART2D_WORLDS, ART2D_CHARACTERS, ART2D_VERSIONS, ART2D_HELPER } from './art2d-catalog.js';
import { oomba2dTag, art2dPackTag, art2dPacksOf, ART2D_PACKS } from '../services/art2d.js';
import { art2dOf } from '../services/art2d-lint.js';
import { LOCALES_DIR, CODES } from '../i18n/index.js';

import { KIT2_WORLDS } from './kit2-catalog.js';

export { ART2D_WORLDS, ART2D_CHARACTERS, art2dOf };
/** Does this 3D world have one of these animals itself (kit2.js then builds it in 3D, the animal as a friend)? */
const in3d = (world, animals) => { const w = KIT2_WORLDS.find(x => x.id === world); return !!w && (animals || []).some(id => (w.creatures || []).some(c => c.id === id)); };
export const ART2D_WORLD_IDS = ART2D_WORLDS.map(w => w.id);
export const ART2D_CHARACTER_IDS = ART2D_CHARACTERS.map(c => c.id);
export const ART2D_ANIMALS = ART2D_CHARACTERS.filter(c => c.kind === 'animal');
export const art2dWorld = id => ART2D_WORLDS.find(w => w.id === id) || null;
export const art2dCharacter = id => ART2D_CHARACTERS.find(c => c.id === id) || null;
/** The 2D templates that draw a world's art and a sprite hero today. */
export const ART2D_TEMPLATES = ['runner', 'catch'];
const MARK = '<!--ART2D-->';

/** How many friends a game may name (CONFIG.friends2d); Oomba2D draws a few at once and the rest take turns. */
export const ART2D_FRIENDS_MAX = 40;
/** The friends of a list that exist, once each, without the hero: [character]. */
export const art2dFriends = (friends, hero = '') => { const out = []; for (const id of Array.isArray(friends) ? friends : []) { const c = art2dCharacter(String(id)); if (c && c.id !== hero && !out.includes(c) && out.length < ART2D_FRIENDS_MAX) out.push(c); } return out; };
/** The pinned tags for a world, a hero or animal and friends: Oomba2D, then each pack once. '' when none exists. */
export function art2dTags({ world = '', hero = '', friends = [] } = {}) {
  const w = art2dWorld(world), c = art2dCharacter(hero), fr = art2dFriends(friends, c ? c.id : '');
  if (!w && !c && !fr.length) return '';
  const packs = [...new Set([...(c ? [c.pack] : []), ...fr.map(f => f.pack)])];
  return [oomba2dTag(), ...(w ? [art2dPackTag(w.id)] : []), ...packs.map(id => art2dPackTag(id))].join('\n');
}
/**
 * A template that takes the 2D art (it holds the <!--ART2D--> marker and the CONFIG lines world, hero2d and friends2d)
 * with a world, a hero or animal and friends (more heroes and animals who are in the game too) put in; names that do
 * not exist are left out. With neither, the marker just goes: the
 * game is the template as it always was. A template without the marker is returned untouched.
 */
export function art2dConfig(html, { world = '', hero = '', friends = [] } = {}) {
  const src = String(html);
  if (!src.includes(MARK)) return src;
  const w = art2dWorld(world), c = art2dCharacter(hero), fr = art2dFriends(friends, c ? c.id : ''), tags = art2dTags({ world, hero, friends });
  let out = src.replace(MARK + '\n', () => (tags ? tags + '\n' : ''));
  if (w) out = out.replace(/\n  world: '[^'\n]*',\n/, () => `\n  world: '${w.id}',\n`);
  if (c) out = out.replace(/\n  hero2d: '[^'\n]*',\n/, () => `\n  hero2d: '${c.id}',\n`);
  if (fr.length) out = out.replace(/\n  friends2d: \[[^\]\n]*\],\n/, () => `\n  friends2d: [${fr.map(f => `'${f.id}'`).join(', ')}],\n`);
  return out;
}
/** The edit_game edits that move a game that already draws with the 2D art to another world or hero: its two CONFIG
 *  lines and its pack tags. -> [{ find, replace }] ([] when nothing changes or the game has no such lines). */
export function art2dEdits(html, { world = '', hero = '' } = {}) {
  const src = String(html), w = art2dWorld(world), c = art2dCharacter(hero);
  // A game from a template that takes the art but has none yet: the tags go in after the kit's dress pack.
  if (!isArt2dGame(src)) {
    const dress = (/<script src="\/vendor\/oomba-kit\/[^"]*\/packs\/dress\.js"[^>]*><\/script>/.exec(src) || [])[0];
    if (!dress || !src.includes("\n  world: '',\n") || !src.includes("\n  hero2d: '',\n") || (!w && !c)) return [];
    return [{ find: dress, replace: dress + '\n' + art2dTags({ world, hero }) }, ...(w ? [{ find: "  world: '',", replace: `  world: '${w.id}',` }] : []), ...(c ? [{ find: "  hero2d: '',", replace: `  hero2d: '${c.id}',` }] : [])];
  }
  const cur = art2dOf(src) || {}, edits = [];
  const line = (key, from, to) => { const find = `  ${key}: '${from}',`; if (from !== to && src.includes(find)) edits.push({ find, replace: `  ${key}: '${to}',` }); };
  const tagOf = id => { const m = new RegExp(`<script src="/vendor/art2d/${id}/[^>]*></script>`).exec(src); return m ? m[0] : ''; };
  const wasChar = art2dCharacter(cur.hero);
  if (w && w.id !== cur.world) {
    line('world', cur.world, w.id);
    const old = cur.world ? tagOf(cur.world) : '';
    if (old) edits.push({ find: old, replace: art2dPackTag(w.id) }); else edits.push({ find: oomba2dTag(), replace: oomba2dTag() + '\n' + art2dPackTag(w.id) });
  }
  if (c && c.id !== cur.hero) {
    line('hero2d', cur.hero, c.id);
    if (!tagOf(c.pack)) { const old = wasChar ? tagOf(wasChar.pack) : ''; if (old) edits.push({ find: old, replace: art2dPackTag(c.pack) }); else { const last = edits.find(e => e.find === oomba2dTag()); if (last) last.replace += '\n' + art2dPackTag(c.pack); else edits.push({ find: oomba2dTag(), replace: oomba2dTag() + '\n' + art2dPackTag(c.pack) }); } }
  }
  return edits;
}
/** Does this game draw with the 2D art (it loads Oomba2D with a pinned tag)? */
export const isArt2dGame = html => /\/vendor\/art2d\/oomba2d\/\d+\.\d+\.\d+\/oomba2d\.js/.test(String(html || ''));
const FRIENDS_ARE = [/\bfriends2d\s*:\s*\[([^\]]*)\]/, /Oomba2D\s*\.\s*use\s*\(\s*\{[^}]*\bfriends\s*:\s*\[([^\]]*)\]/];
/** Who a 2D art game draws: { world, hero, friends: [ids] } (its CONFIG lines, or its own Oomba2D.use call), or null
 *  when it does not use Oomba2D at all. */
export function art2dCast(html) {
  const s = String(html || ''), base = art2dOf(s); if (!base) return null;
  const friends = [];
  for (const re of FRIENDS_ARE) { const m = re.exec(s); if (m) for (const x of m[1].matchAll(/['"]([a-z0-9-]{2,40})['"]/g)) if (!friends.includes(x[1])) friends.push(x[1]); }
  return { world: base.world, hero: base.hero, friends };
}
/**
 * What a game leaves out of the 2D art it must draw. want: { world, hero, friends } (the setup plan's: plan.js
 * planArt2d). Every character of want (the hero and each friend) must be drawn, as the hero (CONFIG.hero2d) or as a
 * friend (CONFIG.friends2d), with Oomba2D and each pack loaded with its pinned tag; want.world, when there is one, is
 * the game's world. -> [] when the game keeps all of it, else short reasons (for the model).
 */
export function art2dMissing(html, want = {}) {
  const src = String(html || ''), cast = art2dCast(src), out = [];
  const hero = art2dCharacter(want.hero), chars = [...(hero ? [hero] : []), ...art2dFriends(want.friends, hero ? hero.id : '')];
  const world = art2dWorld(want.world);
  if (!chars.length && !world) return out;
  if (!isArt2dGame(src) || !cast) return ['the game does not draw with the 2D art at all (no Oomba2D tag, no CONFIG.hero2d / CONFIG.friends2d)'];
  const drawn = new Set([cast.hero, ...cast.friends].filter(Boolean));
  const gone = chars.filter(c => !drawn.has(c.id)).map(c => c.id);
  if (gone.length) out.push(`these picked characters are not in CONFIG.hero2d or CONFIG.friends2d: ${gone.join(', ')}`);
  if (world && cast.world !== world.id) out.push(`CONFIG.world must be '${world.id}'`);
  const loaded = new Set(art2dPacksOf(src).map(p => p.id)), packs = [...new Set([...(world ? [world.id] : []), ...chars.map(c => c.pack)])];
  const unloaded = packs.filter(id => !loaded.has(id));
  if (unloaded.length) out.push(`the pack tag of ${unloaded.join(', ')} is missing`);
  return out;
}

// ---- What a message asks for --------------------------------------------------------------------------------------
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, '\'');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
const at = (o, dotted) => dotted.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);
/** Every site language's names for the 2D worlds and animals, and the Classic tab's chip sentences. */
const NAMES = (() => {
  const worlds = new Map(), animals = new Map(), chips = { world: [], animal: [] };
  const add = (map, name, id) => { const n = norm(name).trim(); if (n.length >= 2 && !map.has(n)) map.set(n, id); };
  for (const w of ART2D_WORLDS) { add(worlds, w.name, w.id); add(worlds, w.id, w.id); add(worlds, w.id.replace(/-/g, ' '), w.id); }
  for (const c of ART2D_CHARACTERS) { add(animals, c.name, c.id); add(animals, c.id, c.id); add(animals, c.id.replace(/-/g, ' '), c.id); }
  for (const code of CODES) {
    const d = readJson(path.join(LOCALES_DIR, `${code}.json`));
    for (const [id, name] of Object.entries(at(d, 'studio.worlds.names') || {})) if (ART2D_WORLD_IDS.includes(id)) add(worlds, name, id);
    for (const key of ['studio.animals.names', 'studio.heroes.names']) for (const [id, name] of Object.entries(at(d, key) || {})) if (ART2D_CHARACTER_IDS.includes(id)) add(animals, name, id);
    for (const [kind, key] of [['world', 'js.studio.world2dUse'], ['animal', 'js.studio.animal2dUse']]) {
      const s = at(d, key); if (typeof s !== 'string' || !s.includes('{name}')) continue;
      const [a, b] = norm(s).split('{name}');
      chips[kind].push(new RegExp(`${esc(a.trim())}\\s*(.{2,60}?)\\s*${esc(b.trim())}`));
    }
  }
  const sorted = map => [...map.entries()].sort((x, y) => y[0].length - x[0].length);
  return { worlds: sorted(worlds), animals: sorted(animals), chips };
})();
const BOUND = '(?:^|[^\\p{L}\\p{N}])', END = '(?=$|[^\\p{L}\\p{N}])', NO_SPACES = /[぀-ヿ㐀-鿿]/;
function lastNamed(list, t) {
  let best = '', bestAt = -1;
  for (const [name, id] of list) {
    const re = new RegExp(NO_SPACES.test(name) ? esc(name) : `${BOUND}${esc(name)}${END}`, 'gu'); let m;
    while ((m = re.exec(t))) { const end = m.index + m[0].length; if (end > bestAt) { bestAt = end; best = id; } }
  }
  return best;
}
// Animals a child may ask for in words (English; other languages use the chips or the animal's name) -> the sprite.
// Only animals that HAVE a sprite are here: any other animal is "not yet" (MORE_ANIMALS).
const ANIMAL_WORDS = [
  // Sea animals ("shark" alone is not here: the only one is the Little Shark, by its name or chip).
  ['seahorse', /\bsea ?horses?\b/], ['dolphin', /\bdolphins?\b/], ['turtle', /\b(sea )?turtles?\b/], ['goldfish', /\bgold ?fish(es)?\b/], ['swordfish', /\bsword ?fish(es)?\b/],
  ['squid', /\bsquids?\b/], ['jellyfish', /\bjelly ?fish(es)?\b/], ['pufferfish', /\bpuffer ?fish(es)?\b|\bblow ?fish(es)?\b/], ['crab', /\bcrabs?\b/], ['lionfish', /\blion ?fish(es)?\b/],
  ['koi', /\bkoi\b/], ['sardine', /\bsardines?\b/], ['blue-tang', /\bblue tangs?\b/], ['clownfish', /\bclown ?fish(es)?\b|\bfish(es|y)?\b/],
  ['fox', /\bfox(es)?\b/], ['wolf', /\bwol(f|ves)\b/], ['husky', /\bhusk(y|ies)\b/], ['shiba', /\bshibas?\b|\bdogs?\b|\bpupp(y|ies)\b/], ['pug', /\bpugs?\b/],
  ['horse-white', /\bwhite horses?\b/], ['pony', /\bpon(y|ies)\b/], ['horse', /\bhorses?\b/], ['donkey', /\bdonkeys?\b/], ['zebra', /\bzebras?\b/],
  ['cow-spotted', /\bspotted cows?\b/], ['cow', /\bcows?\b/], ['bull', /\bbulls?\b/], ['alpaca', /\balpacas?\b/], ['llama', /\bllamas?\b/],
  ['stag', /\bstags?\b|\breindeers?\b/], ['deer', /\bdeer\b/], ['pig', /\bpigs?\b|\bpiglets?\b/], ['sheep', /\bsheep\b|\blambs?\b/],
  ['triceratops', /\btriceratops\b|\bdino(saur)?s?\b/], ['stegosaurus', /\bstegosaurus(es)?\b/], ['apatosaurus', /\bapatosaurus\b|\bbrontosaurus\b|\blong[- ]necks?\b/],
  ['parasaurolophus', /\bparasaurolophus\b/], ['velociraptor', /\b(veloci)?raptors?\b/],
].filter(([id]) => ART2D_CHARACTER_IDS.includes(id));
// Animals with no sprite yet: noticed, so the Builder can say so kindly instead of pretending (the T-Rex is one).
const MORE_ANIMALS = /\bt-?rex\b|\btyrannosaurus\b|\banimals?\b|\bcats?\b|\bkittens?\b|\bchickens?\b|\bbears?\b|\brabbits?\b|\bbunn(y|ies)\b|\bfish\b|\bsharks?\b|\bdolphins?\b|\bwhales?\b|\bdragons?\b|\bbirds?\b|\bfrogs?\b|\bmonkeys?\b|\blions?\b|\btigers?\b|\belephants?\b|\bpenguins?\b|\bunicorns?\b|\bowls?\b|\bturtles?\b|\bducks?\b|\bgiraffes?\b|\bpandas?\b|\bsnakes?\b|\bmice\b|\bmouse\b/;
// Kinds of 2D game named in words (the ones the 2D templates make).
const KIND_2D = /\brun(ner|ning)?\b|\bjump(ing)?\b|\bdash\b|\bplatform(er)?\b|\bobstacles?\b|\bendless\b|\brac(e|ing)\b|\bcatch(ing)?\b|\bfalling\b|\bbasket\b/;

/**
 * What a message picks for a 2D game -> { world, hero, by, missing }.
 * world: a Classic-tab world chip, else ''. (A world named or described in words comes from kit2.js pickKit2: see
 * wantsArt2d.) hero: an animal or hero chip, or an animal named in words. by: 'chip' | 'word' | ''.
 * missing: true when they asked for an animal that has no sprite yet.
 */
export function pickArt2d(text) {
  const t = norm(text);
  const chipOf = kind => { for (const re of NAMES.chips[kind]) { const m = re.exec(t); if (m) return m[1]; } return null; };
  const wc = chipOf('world'), ac = chipOf('animal');
  const world = wc ? lastNamed(NAMES.worlds, wc) : '', chipHero = ac ? lastNamed(NAMES.animals, ac) : '';
  const named = (() => { const id = lastNamed(NAMES.animals, t); const c = art2dCharacter(id); return c && c.kind === 'animal' ? id : ''; })();
  const word = (ANIMAL_WORDS.find(([, re]) => re.test(t)) || [''])[0];
  const hero = chipHero || named || word;
  return { world, hero, by: world || chipHero ? 'chip' : hero ? 'word' : '', missing: !hero && MORE_ANIMALS.test(t), kind2d: KIND_2D.test(t) };
}
/** Is this message one of the Classic tab's 2D chips (a 2D world or an animal)? kit2.js: such a pick is never a 3D pick. */
export const isArt2dChip = text => pickArt2d(text).by === 'chip';

/**
 * The 2D art for this turn. state: the Builder's saved state (state.art2d remembers the choice while it still asks
 * questions); version: the current version (or null); p: kit2.js pickKit2(text) (its place and named world).
 * -> { world, hero, by, missing, force2d } or null. by: 'game' (the game already draws with the art), 'chip', 'word'
 * (an animal named), 'place' (a world named or described in a 2D request) or 'kept'.
 * force2d: a NEW running or catching game with an animal that exists as a sprite, in a described world whose 3D
 * version does not have that animal ("a running game with a fox on the moon"): it is built in 2D with that world's
 * art. Where the 3D world has the animal ("a fox in the castle": kit2.js p.animals), and for every other described
 * place, it stays a 3D build, as before (the caller asks kit2.js first unless force2d).
 */
export function wantsArt2d(state, text, version, p = {}) {
  const a = pickArt2d(text), cur = version && isArt2dGame(version.html) ? art2dOf(version.html) : null;
  if (p.threeD && a.by !== 'chip' && !cur) return null;   // a 3D request is never a 2D art pick
  const isAnimal = id => { const c = art2dCharacter(id); return !!c && c.kind === 'animal'; };
  // a world in words: only when kit2.js did not make it an outright 3D pick (a 3D chip, a 3D word)
  const placed = !p.threeD && p.by !== 'chip' ? (p.place || (p.by === 'name' ? p.world : '') || '') : '';
  const worldWord = ART2D_WORLD_IDS.includes(placed) ? placed : '';
  const heroWord = a.hero || (art2dCharacter(p.hero) && !p.soft ? p.hero : '');
  const before = (state && state.art2d) || {};
  let by = '';
  if (a.by === 'chip') by = 'chip';
  else if (cur) by = 'game';
  else if (!version && a.hero) by = 'word';
  else if (!version && worldWord && (p.classic || a.kind2d || p.by === '')) by = 'place';
  else if (!version && before.world !== undefined) by = 'kept';
  if (!by) return null;
  const world = a.world || (by === 'game' && !worldWord ? cur.world : '') || worldWord || (cur ? cur.world : '') || before.world || '';
  const hero = heroWord || (cur ? cur.hero : '') || before.hero || '';
  if (!world && !hero) return null;
  if (state && !version) state.art2d = { world, hero };
  const force2d = !version && !p.threeD && p.by === 'place' && a.kind2d && isAnimal(a.hero) && !in3d(p.place, p.animals);
  return { world, hero, by, missing: a.missing, force2d, soft: by === 'word' && !a.kind2d && !world, changed: !!cur && (world !== cur.world || hero !== cur.hero) };
}

// ---- What the model is told ---------------------------------------------------------------------------------------
const worldText = w => `- ${w.id} ${w.version} ("${w.name}"): sprites (name size-in-cells) ${w.sprites.filter(s => s.kind === 'prop').map(s => `${s.name} ${s.size}`).join(', ')}; plus coin, goal and ${w.sprites.filter(s => s.kind === 'obstacle').length} obstacles (art.coin(), art.goal(), art.obstacle(i)).`;
const heroes = ART2D_CHARACTERS.filter(c => c.kind === 'hero');
export const ART2D_SHORT = `# 2D art of the worlds (for Oomba Kit games)
The 3D worlds also exist as 2D art: a sky, scenery that scrolls, a ground, props, a coin, a goal and obstacles, with
the heroes and some animals as animated sprites (idle, run, jump). 2D worlds: ${ART2D_WORLD_IDS.join(', ')}.
Sprite heroes: ${heroes.map(c => c.id).join(', ')}. Sprite animals: ${ART2D_ANIMALS.map(c => c.id).join(', ')}.
- Use them for a 2D runner or catching game that names or picks one of these worlds or animals: call
  start_from_template with template "runner" or "catch", the world, and sprite (a sprite hero or animal): the 2D ART
  RULES arrive with it. A 3D request stays 3D (oomba3d).
- An animal that is not in the list has no sprite yet: say so kindly in one short sentence and use the kit's own
  characters. Never draw an animal from shapes or emoji, and never invent a world, hero, animal or sprite name.`;

export const ART2D_RULES = `2D ART RULES (this 2D game draws one of the ready-made worlds, a sprite hero or an animal, with Oomba2D ${ART2D_HELPER}). Every
KIT RULE still applies: it is an Oomba Kit game (Oomba.game does the physics, HUD, screens, sound and languages).
- Tags, after the kit's own tag and packs, copied byte for byte: first Oomba2D, then the pack of the world, then the
  pack of the hero ("heroes") or animal ("animals"). Only these tags exist:
${oomba2dTag()}
${Object.keys(ART2D_PACKS).map(id => art2dPackTag(id)).join('\n')}
- The templates "runner" and "catch" already do all of it: CONFIG.world (a 2D world id, or '' for the kit's own look)
  and CONFIG.hero2d (a sprite hero or animal id, or '' for the kit's hero). Change those two lines and the pack tags to
  change the world or the hero; keep the rest of begin(art) as it is.
- More than one character: CONFIG.friends2d is a list of more sprite heroes and animals (['fox', 'zebra', 'knight']) who
  are IN the game beside the player: in the runner they stand along the way and hop as the player runs by, in the
  catching game they watch from the two sides. start_from_template takes them as friends. Oomba2D draws up to four at
  once and the others take turns, so every one shows up; they are pictures only (never solid, never a hazard, never
  moving towards the player). Each friend's pack tag ("heroes", "animals") must be loaded. In your own code:
  Oomba2D.use({ world, hero, friends }) and art.dress(w) (or art.dress(w, { friends: 'sides' }) for a one-screen game).
- In your own code: Oomba2D.use({ world, hero }).then(art => ...) gives art (or null when it cannot load: the game
  must then still play with the kit's look). art.dress(w) in setup(w) draws the sky, scenery, ground, props and the
  sprite hero; art.level(level) swaps a level's coins, flag and hazards for the world's; art.sprite('name') is a legend
  or w.spawn entry for one of the world's props; art.coin(), art.goal(), art.obstacle(i). Pass dress: 'off' to
  Oomba.game when a world is drawn.
- Never write a picture's address, never use <img>, fetch or CSS url() for the art: Oomba2D loads it.
- Obstacles are the world's things (barrels, crates, rocks). Animals never chase, bite or hurt: an animal is the hero
  or stands in the scenery.
- Use ONLY these names (a name that is not here does not exist):
${ART2D_WORLDS.map(worldText).join('\n')}
- Sprite heroes (pack "heroes"): ${heroes.map(c => `${c.id} (${c.name})`).join(', ')}.
- Sprite animals (pack "animals"): ${ART2D_ANIMALS.map(c => `${c.id} (${c.name})`).join(', ')}. Each has idle (${(ART2D_ANIMALS[0] || { frames: {} }).frames.idle} frames), run (${(ART2D_ANIMALS[0] || { frames: {} }).frames.run}) and jump (${(ART2D_ANIMALS[0] || { frames: {} }).frames.jump}); Oomba2D plays them.
- Any other animal (a cat, a shark, a T-Rex, a bird...) has no sprite yet: say so kindly in one short sentence and keep
  the kit's own hero. Never pretend.`;

/** This turn's choice, as a short block after the rules. */
export function art2dNote(pick) {
  if (!pick) return '';
  const w = art2dWorld(pick.world), c = art2dCharacter(pick.hero);
  const how = { chip: 'The builder picked', word: 'The builder asked for', place: 'The builder described', kept: 'Earlier the builder picked', game: 'This game uses' }[pick.by] || 'This build uses';
  const fr = art2dFriends(pick.friends, c ? c.id : '');
  return `2D ART CHOICE: ${how}${w ? ` the 2D world ${w.id} ("${w.name}")` : ''}${w && c ? ' and' : ''}${c ? ` the sprite ${c.kind} ${c.id} (${c.name})` : ''}${!w && !c ? ' an animal' : ''}. `
    + (fr.length ? `Friends who are in the game too (start_from_template friends, CONFIG.friends2d): ${fr.map(f => f.id).join(', ')}. ` : '')
    + (pick.by === 'plan' && (w || c) ? `They picked ${c ? 'these characters' : 'this world'} in the setup steps, so this build MUST be a running or catching game that draws them: start_from_template with template "runner" or "catch"${w ? `, world "${w.id}"` : ''}${c ? `, sprite "${c.id}"` : ''}${fr.length ? ` and friends ${JSON.stringify(fr.map(f => f.id))}` : ''}, then make it theirs with edit_game. Every version of this build must keep CONFIG.world, CONFIG.hero2d, CONFIG.friends2d and the 2D art tags: a version that leaves out a picked character is not saved. Never write the game from scratch and never draw these characters with the kit's own characters.`
      : pick.soft ? `Only if this is a running or catching game: start_from_template "runner" or "catch" with sprite "${c ? c.id : ''}". For any other kind of game use the kit's own characters and say nothing about sprites.` : pick.by === 'game' && !pick.changed ? 'Keep them unless they ask for another.' : w || c ? `For a runner or a catching game call start_from_template with template "runner" or "catch"${w ? `, world "${w.id}"` : ''}${c ? `, sprite "${c.id}"` : ''}${fr.length ? ` and friends ${JSON.stringify(fr.map(f => f.id))}` : ''}; other kinds of 2D game do not draw the worlds yet (say so in one short sentence if they asked for one).` : '')
    + (pick.missing ? ' They asked for an animal that has no sprite yet: say that kindly in one short sentence and use the kit\'s own characters.' : '');
}
export { ART2D_VERSIONS };
