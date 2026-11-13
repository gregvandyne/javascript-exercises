// "Start from" templates, read through one guarded door.
// server/builder/templates/ is owned by the Templates node; this module works whether or not it exists yet:
// any key whose template cannot load falls back to a small built-in game (fallback-game.html).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_HTML = fs.readFileSync(path.join(DIR, 'fallback-game.html'), 'utf8');

// The Studio's "Start from" cards (a kid may pick Star Island, a finished 3D game on the kit's 3D bridge).
export const TEMPLATE_KEYS = ['quiz', 'runner', 'catch', 'memory', 'word', 'duel', 'board', 'island'];
// What the AI Builder may start from: the 2D kit templates, and for every 3D game its own starter (world3d, no Oomba
// Kit), whose example world it replaces with the world the builder asked for. The Builder never starts from Star Island.
// 'oomba3d' is the Kit 2 starter: a 3D game in one of the ready-made worlds with an animated hero (kit2.js), started
// with a world and a hero.
export const BUILDER_TEMPLATE_KEYS = ['quiz', 'runner', 'catch', 'memory', 'word', 'duel', 'board', 'world3d', 'oomba3d'];
const DEFAULTS = {
  quiz: { title: 'Quiz Show', icon: '❓', cover: 'sunset', category: 'learning', players: 1, description: 'Quick questions with a timer and a cheering crowd.' },
  runner: { title: 'Runner', icon: '🏃', cover: 'forest', category: 'arcade', players: 1, description: 'Jump over bumps and grab coins as the speed ramps up.' },
  catch: { title: 'Catch the Falling Things', icon: '🧺', cover: 'candy', category: 'arcade', players: 1, description: 'Slide to catch the good stuff and dodge the rocks.' },
  memory: { title: 'Memory Match', icon: '🃏', cover: 'ocean', category: 'puzzle', players: 1, description: 'Flip cards and find the pairs.' },
  word: { title: 'Word Game', icon: '🔤', cover: 'mint', category: 'words', players: 1, description: 'Spell, guess and build words.' },
  duel: { title: 'Two-Player Duel', icon: '⚔️', cover: 'lava', category: 'silly', players: 2, description: 'Two players, one screen. Who is fastest?' },
  board: { title: 'Board Game', icon: '🎲', cover: 'gold', category: 'board', players: 2, description: 'Roll the dice and race to the end.' },
  island: { title: 'Star Island', icon: '🏝️', cover: 'ocean', category: 'adventure', players: 1, description: 'A 3D island to explore and find the stars.' },
  world3d: { title: 'My 3D World', icon: '🌍', cover: 'ocean', category: 'adventure', players: 1, description: 'A 3D world of your own to explore.' },
  oomba3d: { title: 'My 3D World', icon: '🏰', cover: 'ocean', category: 'adventure', players: 1, description: 'A ready-made 3D world with a hero who runs, jumps, collects and answers.' },
};

let modPromise = null;
async function mod() {
  if (!modPromise) modPromise = import('./templates/index.js').catch(() => null);
  return modPromise;
}

/** [{ key, title, icon, cover, category, description, players }] for the "Start from" cards. */
export async function listTemplates() {
  const m = await mod();
  const fromMod = m && Array.isArray(m.TEMPLATES) ? m.TEMPLATES : [];
  return TEMPLATE_KEYS.map(key => ({ key, ...DEFAULTS[key], ...(fromMod.find(t => t && t.key === key) || {}) }));
}
export async function templateInfo(key) {
  const m = await mod(), fromMod = m && Array.isArray(m.TEMPLATES) ? m.TEMPLATES : [];
  return DEFAULTS[key] ? { key, ...DEFAULTS[key], ...(fromMod.find(t => t && t.key === key) || {}) } : null;
}

/** The template's game HTML, or the built-in fallback game if the template is missing or broken.
 *  opts: for 'oomba3d' only, { world, hero, title } (kit2.js kit2Starter). */
export async function templateHtml(key, opts = undefined) {
  const m = await mod();
  if (m && typeof m.loadTemplate === 'function') {
    try { const h = await m.loadTemplate(key, opts); if (typeof h === 'string' && h.length > 50) return { html: h, fallback: false }; } catch { /* fall through */ }
  }
  return { html: FALLBACK_HTML, fallback: true };
}
export const fallbackHtml = () => FALLBACK_HTML;
