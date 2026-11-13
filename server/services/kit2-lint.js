// Notes for Kit 2 games (games that import Oomba3D): names the game uses that its world does not have. Like the style
// lint for kit games (stylelint.js), it never changes the safety result: the notes ride along in report.lint as
// { level: 'warn', code, message } and go back to the Builder after each version, so it fixes an invented hero, piece
// or sound name before a player meets Oomba3D's error. Only names written out as text are checked (a name built in
// code is checked by Oomba3D itself when the game runs). The names come from the shipped theme manifests: the newest
// version of each world from the generated catalogue, an older shipped version from its own theme.json.
// Pure function, linear patterns; games over LINT_MAX bytes are not linted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIT2_WORLDS } from '../builder/kit2-catalog.js';
import { KIT2_LOCK } from './vendor.js';

const LINT_MAX = 300000;
const THEMES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/vendor/themes');
const OOMBA3D = /\bfrom\s*["']oomba3d["']/;
const cache = new Map();
/** The names one shipped world version has -> { heroes, pieces, sounds } (Sets), or null when it has not shipped. */
export function namesOf(world, version) {
  const key = `${world}/${version}`;
  if (!KIT2_LOCK.themes[key]) return null;
  if (cache.has(key)) return cache.get(key);
  let m = KIT2_WORLDS.find(w => w.id === world && w.version === version);
  if (m) m = { heroes: [...m.heroes, ...m.creatures].map(h => h.id), pieces: m.pieces.map(p => p.id), sounds: m.sounds };
  else {
    try { const t = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, world, version, 'theme.json'), 'utf8')); m = { heroes: [...(t.heroes || []), ...(t.creatures || [])].map(h => h.id), pieces: (t.pieces || []).map(p => p.id), sounds: (t.sounds || []).map(s => s.id) }; } catch { return null; }
  }
  const out = { heroes: new Set(m.heroes), pieces: new Set(m.pieces), sounds: new Set([...m.sounds, 'cheer', 'wrong']) };
  cache.set(key, out);
  return out;
}
const NAME = '([a-z][a-z0-9-]{1,40})';
const all = (src, re) => [...new Set([...src.matchAll(re)].map(m => m[1]))];

/** -> [{ level: 'warn', code, message }] for a Kit 2 game; [] for any other game. */
export function lintKit2(html) {
  const src = String(html || '');
  if (src.length > LINT_MAX || !OOMBA3D.test(src)) return [];
  const world = (/\b(?:theme|world)\s*:\s*['"]([a-z0-9-]{2,40})['"]/.exec(src) || [])[1], version = (/\bversion\s*:\s*['"](\d+\.\d+\.\d+)['"]/.exec(src) || [])[1];
  const names = world && version ? namesOf(world, version) : null;
  if (!names) return [];
  const out = [], add = (code, message) => out.push({ level: 'warn', code, message });
  const list = set => [...set].slice(0, 60).join(', ');
  const heroes = [...all(src, new RegExp(`\\.hero\\(\\s*['"]${NAME}['"]`, 'g')), ...all(src, new RegExp(`\\bhero\\s*:\\s*['"]${NAME}['"]`, 'g'))].filter(n => !names.heroes.has(n));
  if (heroes.length) add('kit2_hero', `${world} ${version} has no hero called ${[...new Set(heroes)].slice(0, 3).map(n => `"${n}"`).join(', ')}: the game stops with an error when it asks for one. Its heroes: ${list(names.heroes)}.`);
  const pieces = [...all(src, new RegExp(`\\.piece\\(\\s*['"]${NAME}['"]`, 'g')), ...all(src, new RegExp(`\\bpiece\\s*:\\s*['"]${NAME}['"]`, 'g'))].filter(n => !names.pieces.has(n));
  if (pieces.length) add('kit2_piece', `${world} ${version} has no piece called ${[...new Set(pieces)].slice(0, 4).map(n => `"${n}"`).join(', ')}: the game stops with an error when it asks for one. Use only this world's pieces: ${list(names.pieces)}.`);
  const sounds = all(src, new RegExp(`\\.sound\\(\\s*['"]${NAME}['"]`, 'g')).filter(n => !names.sounds.has(n));
  if (sounds.length) add('kit2_sound', `${world} ${version} has no sound called ${sounds.slice(0, 3).map(n => `"${n}"`).join(', ')} (nothing plays). Its sounds: ${list(names.sounds)}.`);
  if (/\.askQuestion\s*\(/.test(src) && !names.pieces.has('island-round')) add('kit2_ask', `g.askQuestion() builds its answer islands from the piece "island-round", which ${world} does not have: the question never appears. Make the answers from this world's own pieces (the starter's answer pads).`);
  return out;
}
