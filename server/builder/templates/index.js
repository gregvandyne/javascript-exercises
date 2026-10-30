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
];

const cache = new Map();

/** Returns the template's HTML. Throws on an unknown key. */
export function loadTemplate(key) {
  if (!TEMPLATES.some(t => t.key === key)) throw new Error(`Unknown template: ${key}`);
  if (!cache.has(key)) cache.set(key, withKitTags(fs.readFileSync(path.join(DIR, `${key}.html`), 'utf8')));
  return cache.get(key);
}
/** The template source with the kit's pinned tags in place of <!--KIT--> and <!--PACK:name-->. */
export const withKitTags = src => String(src).replace('<!--KIT-->', () => kitTag()).replace(/<!--PACK:([a-z0-9-]+)-->/g, (m, n) => kitPackTag(n));
