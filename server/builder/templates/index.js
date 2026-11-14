// "Start from" game templates for the Studio. Each template is a finished mini-game following the
// Game Contract (docs/sdk.md): one HTML document, no doctype/head (the platform wraps it). They are built on the Oomba
// Kit (docs/kit-api.md): the files hold <!--KIT--> and <!--PACK:name--> where the pinned tags go, and loadTemplate()
// puts in exactly kitTag() and kitPackTag(name), so a game started from a template pins the kit version of that day.
// The things a builder is most likely to change live in a `const CONFIG = { ... }` block near the top of each file,
// one key per line (so a Builder edit is a one-line find/replace); the words players read are in a WORDS table
// (Oomba.strings) in the 13 site languages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitTag, kitPackTag } from '../../services/kit.js';
import { kit2Starter } from '../kit2.js';
import { art2dTags, art2dConfig } from '../art2d.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));

export const TEMPLATES = [
  { key: 'quiz', title: 'Quiz Show', icon: '🦉', cover: 'sunset', category: 'learning', players: 1,
    description: 'Ten quick multiple-choice questions with a timer bar, streak bonuses and a cheering owl.' },
  { key: 'runner', title: 'Endless Runner', icon: '🏃', cover: 'forest', category: 'arcade', players: 1,
    description: 'Jump over bumps, grab coins and race to the rainbow flag as the speed ramps up.' },
  { key: 'catch', title: 'Catch the Falling Things', icon: '🧺', cover: 'candy', category: 'arcade', players: 1,
    description: 'Slide the basket to catch yummy fruit, dodge the stinky stuff and build big combos.' },
  { key: 'memory', title: 'Memory Match', icon: '🃏', cover: 'ocean', category: 'puzzle', players: 1,
    description: 'Flip cards to find the emoji pairs across three levels, beat the clock and earn stars.' },
  { key: 'word', title: 'Word Builder', icon: '🔤', cover: 'mint', category: 'words', players: 1,
    description: 'An early-reader word game: fill the missing letter, then unscramble words with picture hints.' },
  { key: 'duel', title: 'Two-Player Duel', icon: '⚡', cover: 'lava', category: 'silly', players: 2,
    description: 'Two players, one screen: wait for the green light and tap first to grab the snack. Best of five.' },
  { key: 'board', title: 'Race Board Game', icon: '🎲', cover: 'gold', category: 'board', players: 2,
    description: 'Roll the die and race along a winding path with rocket boosts and slides. Play a friend or the bot.' },
  // 3D: uses the self-hosted Three.js (see server/services/vendor.js); the platform checks the device can run it.
  { key: 'island', title: 'Star Island', icon: '🏝️', cover: 'ocean', category: 'adventure', players: 1, threeD: true,
    description: 'A 3D island to explore: run, jump up floating rocks and find every shiny star before time runs out.' },
  // The Builder's own 3D starter (no Oomba Kit): a renderer, a walking player, a follow camera, controls and screens, with
  // an EXAMPLE world the Builder replaces with the world the builder asked for. Not a "Start from" card (builderOnly).
  { key: 'world3d', title: 'My 3D World', icon: '🌍', cover: 'ocean', category: 'adventure', players: 1, threeD: true, builderOnly: true,
    description: 'A 3D world of your own to explore.' },
  // The Builder's Kit 2 starter (no Oomba Kit): a 3D game in one of the ready-made worlds with an animated hero, on
  // Oomba3D (docs/kit2-api.md). loadTemplate('oomba3d', { world, hero }) fills in the world, its newest shipped version,
  // its starter layout and the hero (../kit2.js). The /build page offers one card per world (builderOnly: not in the
  // classic "Start from" row).
  { key: 'oomba3d', title: 'My 3D World', icon: '🏰', cover: 'ocean', category: 'adventure', players: 1, threeD: true, builderOnly: true, kit2: true,
    description: 'A ready-made 3D world with a hero who runs, jumps, collects and answers.' },
];

const cache = new Map();

/** Returns the template's HTML. Throws on an unknown key. opts: { world, hero, title } for oomba3d; { world, hero } for a
 *  2D template that takes the 2D art (runner, catch): a 2D world and a hero or animal (../art2d.js). */
export function loadTemplate(key, opts = {}) {
  if (!TEMPLATES.some(t => t.key === key)) throw new Error(`Unknown template: ${key}`);
  if (key === 'oomba3d') { const h = kit2Starter(opts || {}); if (!h) throw new Error(`Unknown world: ${opts && opts.world}`); return h; }
  if (!cache.has(key)) cache.set(key, withKitTags(fs.readFileSync(path.join(DIR, `${key}.html`), 'utf8')));
  // A 2D world or a sprite hero (opts.world, opts.hero): the 2D art tags go in at <!--ART2D--> and the two CONFIG lines
  // are filled in (../art2d.js). With neither, the marker goes and the game is the template as it always was.
  return art2dConfig(cache.get(key), opts || {});
}
/** The template source with the kit's pinned tags in place of <!--KIT--> and <!--PACK:name-->. */
export const withKitTags = src => String(src).replace('<!--KIT-->', () => kitTag()).replace(/<!--PACK:([a-z0-9-]+)-->/g, (m, n) => kitPackTag(n));
export { art2dTags };
