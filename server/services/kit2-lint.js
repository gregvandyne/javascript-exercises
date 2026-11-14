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
import { KIT2_LOCK, oomba3dVersionOf } from './vendor.js';

const LINT_MAX = 300000;
const THEMES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/vendor/themes');
const OOMBA3D = /\bfrom\s*["']oomba3d["']/;
const cache = new Map();
/** The names one shipped world version has -> { heroes (who can be the hero), creatures, pieces, sounds } (Sets), or
 *  null when it has not shipped. */
export function namesOf(world, version) {
  const key = `${world}/${version}`;
  if (!KIT2_LOCK.themes[key]) return null;
  if (cache.has(key)) return cache.get(key);
  let m = KIT2_WORLDS.find(w => w.id === world && w.version === version);
  if (m) m = { heroes: [...m.heroes, ...m.creatures.filter(c => c.playable)].map(h => h.id), creatures: m.creatures.map(c => c.id), pieces: m.pieces.map(p => p.id), sounds: m.sounds };
  else {
    try { const t = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, world, version, 'theme.json'), 'utf8')); m = { heroes: [...(t.heroes || []), ...(t.creatures || []).filter(c => c.playable)].map(h => h.id), creatures: (t.creatures || []).map(c => c.id), pieces: (t.pieces || []).map(p => p.id), sounds: (t.sounds || []).map(s => s.id) }; } catch { return null; }
  }
  const out = { heroes: new Set(m.heroes), creatures: new Set(m.creatures), pieces: new Set(m.pieces), sounds: new Set([...m.sounds, 'cheer', 'wrong']) };
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
  const cannot = heroes.filter(n => names.creatures.has(n)), unknown = heroes.filter(n => !names.creatures.has(n));
  if (unknown.length) add('kit2_hero', `${world} ${version} has no hero called ${[...new Set(unknown)].slice(0, 3).map(n => `"${n}"`).join(', ')}: the game stops with an error when it asks for one. Its heroes: ${list(names.heroes)}.`);
  if (cannot.length) add('kit2_hero', `In ${world} ${version} the ${[...new Set(cannot)].slice(0, 3).join(', ')} cannot be the hero (no walk: it only hops): the game stops with an error. Make it a companion or scenery (g.creature) and pick a hero from: ${list(names.heroes)}.`);
  // Animals: only this world version's own creatures exist (g.creature, g.school, the starter's companion line).
  const animals = [...all(src, new RegExp(`\\.(?:creature|school)\\(\\s*['"]${NAME}['"]`, 'g')), ...all(src, new RegExp(`\\bcompanion\\s*:\\s*['"]${NAME}['"]`, 'g'))].filter(n => !names.creatures.has(n));
  if (animals.length) add('kit2_creature', `${world} ${version} has no animal called ${[...new Set(animals)].slice(0, 3).map(n => `"${n}"`).join(', ')}: the game stops with an error when it asks for one. ${names.creatures.size ? `Its animals: ${list(names.creatures)}. There are no others` : 'This world has no animals yet'}: never invent one.`);
  // Animals, the made ground and swimming came with Oomba3D 1.2.0: a game whose import map pins an older one has none of them.
  const lib = oomba3dVersionOf(src), [la, lb] = lib.split('.').map(Number);
  if (lib && (la < 1 || (la === 1 && lb < 2)) && (/\.(?:creature|school)\s*\(|\.world\.ground\s*\(|\bswim\s*:\s*true/.test(src) || /\bcompanion\s*:\s*['"][a-z]/.test(src))) add('kit2_engine', `This game's import map pins Oomba3D ${lib}, which has no animals, g.world.ground or swimming (they came with 1.2.0): the game stops with an error. Start it again from the oomba3d starter to get the newest Oomba3D, or leave them out.`);
  const pieces = [...all(src, new RegExp(`\\.piece\\(\\s*['"]${NAME}['"]`, 'g')), ...all(src, new RegExp(`\\bpiece\\s*:\\s*['"]${NAME}['"]`, 'g'))].filter(n => !names.pieces.has(n));
  if (pieces.length) add('kit2_piece', `${world} ${version} has no piece called ${[...new Set(pieces)].slice(0, 4).map(n => `"${n}"`).join(', ')}: the game stops with an error when it asks for one. Use only this world's pieces: ${list(names.pieces)}.`);
  const sounds = all(src, new RegExp(`\\.sound\\(\\s*['"]${NAME}['"]`, 'g')).filter(n => !names.sounds.has(n));
  if (sounds.length) add('kit2_sound', `${world} ${version} has no sound called ${sounds.slice(0, 3).map(n => `"${n}"`).join(', ')} (nothing plays). Its sounds: ${list(names.sounds)}.`);
  if (/\.askQuestion\s*\(/.test(src) && !names.pieces.has('island-round')) add('kit2_ask', `g.askQuestion() builds its answer islands from the piece "island-round", which ${world} does not have: the question never appears. Make the answers from this world's own pieces (the starter's answer pads).`);
  return out;
}
