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
// The classroom starters (plain HTML for the classroom board and phones, not on the kit; docs/decisions.md "Classroom
// activities in the Builder"): the Builder starts from them for the "For your class" types of /build/new (plan.js).
// classquiz, classmemory and classword are the plain classroom formats of quiz, memory and word (no kit): the "For your
// class" quiz, memory and word types use them whenever the arcade side is off (config.arcade, docs/decisions.md
// "Classroom focus: the Builder without the kit").
export const CLASSROOM_TEMPLATE_KEYS = ['quiet', 'categories', 'survey', 'bingo', 'flashcards', 'exitticket', 'spinner', 'scoreboard', 'classquiz', 'classmemory', 'classword'];
/** The Oomba Kit templates (v1 kit 2D games, and the 3D starters world3d and oomba3d): arcade builds only. */
export const KIT_TEMPLATE_KEYS = ['quiz', 'runner', 'catch', 'memory', 'word', 'duel', 'board', 'world3d', 'oomba3d'];
// The classroom activity starter (Oomba Canvas, docs/canvas-api.md; docs/decisions.md "Classroom activity vs Arcade
// game"): only for canvas builds. Kept out of BUILDER_TEMPLATE_KEYS on purpose: that list is in the cached tool
// definitions (prompt.js TOOLS), which stay byte-identical for every arcade build; the CANVAS RULES name this one.
export const CANVAS_TEMPLATE_KEYS = ['canvas'];
/** The plain classroom formats of quiz, memory and word (the arcade side keeps the kit's own quiz, memory and word). */
export const PLAIN_GAME_KEYS = ['classquiz', 'classmemory', 'classword'];
// The arcade Builder's list (in the cached tool definitions, prompt.js TOOLS): exactly as it was before the plain games.
export const BUILDER_TEMPLATE_KEYS = [...KIT_TEMPLATE_KEYS, ...CLASSROOM_TEMPLATE_KEYS.filter(k => !PLAIN_GAME_KEYS.includes(k))];
/** What the Builder may start from when the arcade side is off: the classroom starters only (never a kit template). */
export const FOCUS_TEMPLATE_KEYS = [...CLASSROOM_TEMPLATE_KEYS];
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
  quiet: { title: 'Quiet Stars', icon: '🌙', cover: 'night', category: 'learning', players: 1, description: 'A classroom noise meter: the night sky fills with stars while the room is quiet.' },
  categories: { title: 'Category Board', icon: '🗂️', cover: 'mint', category: 'learning', players: 2, description: 'Teams pick a category and points, then answer the question on the board.' },
  survey: { title: 'Class Survey', icon: '📊', cover: 'sunset', category: 'learning', players: 1, description: 'Fixed-choice questions; only the counts are shown, on this device.' },
  bingo: { title: 'Class Bingo', icon: '🔢', cover: 'gold', category: 'learning', players: 1, description: 'The board calls, everyone marks their own card.' },
  flashcards: { title: 'Flashcards', icon: '🃏', cover: 'ocean', category: 'learning', players: 1, description: 'Flip, sort and practise one big card at a time.' },
  exitticket: { title: 'Exit Ticket', icon: '🎟️', cover: 'forest', category: 'learning', players: 1, description: 'A short check at the end of a lesson.' },
  spinner: { title: 'Team Spinner', icon: '🎡', cover: 'candy', category: 'learning', players: 2, description: 'Spin to pick a team, a number or a topic.' },
  scoreboard: { title: 'Team Scoreboard', icon: '🏆', cover: 'lava', category: 'learning', players: 2, description: 'Big team scores for the classroom board.' },
  classquiz: { title: 'Class Quiz', icon: '❓', cover: 'mint', category: 'learning', players: 1, description: 'Multiple-choice questions with an optional timer, a score and a review of every answer.' },
  classmemory: { title: 'Memory Match', icon: '🃏', cover: 'ocean', category: 'learning', players: 1, description: 'Flip two cards to find the pairs: a term and its meaning, or a picture and its word.' },
  classword: { title: 'Word Lab', icon: '🔤', cover: 'gold', category: 'words', players: 1, description: 'Practice a word list: unscramble it, fill the gap, or spell it from a clue.' },
  canvas: { title: 'Classroom activity', icon: '🧮', cover: 'mint', category: 'learning', players: 1, description: 'A hands-on canvas: students drag, build and check, one step at a time, with hints.' },
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
