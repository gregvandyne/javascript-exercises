// Number Quest slide-picture manifest check, the twin of scripts/csq-manifest-check.js for the nq/
// namespace: the mission screenshots are photographs of a real build. This script keeps the evidence
// honest, so the pictures the decks carry cannot quietly drift away from the games they claim to show:
//
//   node scripts/nq-manifest-check.js          (also: npm run nq:check)
//
// It proves, for every Number Quest Explorer deck slide that carries an img:
//   - the manifest (public/img/nq/manifest.json) names that exact key, with an alt identical to the
//     deck's own alt (one source of truth, checked both ways);
//   - the .webp file exists on disk and stays under the size the CSQ discipline set (warn >120 KB,
//     fail >200 KB);
//   - the entry's game matches the key's game segment.
// And in the other direction: every manifest entry is carried by some deck, so a stale entry cannot
// linger after its slide is gone, and every deck with a game has its mission slide pictured.
//
// One named exception, kept loud on purpose: the Phase 2 decks (Units 5-7 + the Vault of Measures
// finale, PR #202) were authored just before this imagery platform landed, so their mission slides
// carry no captures yet. MISSION_CAPTURES_OWED below names each deck and the exact capture the
// follow-up sweep owes it. An owed deck's missing mission picture is reported as an OWED note on
// every run instead of a failure; every other deck (and every other check for the owed decks) still
// fails hard. When the sweep lands a deck's capture, delete its line here — the stale-entry note at
// the bottom will say so. 6.1 is not owed anything: it has no game (the Builder's Yard is unbuilt),
// so the mission-picture rule does not apply to it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG_DIR = path.join(ROOT, 'public', 'img');
const problems = [];
const notes = [];

// Mission captures owed by the follow-up sweep for the Phase 2 decks (see the header note).
// Key: deck file. Value: the capture owed, in the mode the deck's mission assigns.
const MISSION_CAPTURES_OWED = new Map([
  ['5.1.json', 'nq/brain-board: Practice Board in mode nq-5-1 (the Measures board)'],
  ['5.2.json', 'nq/quest-race: Practice Race in mode nq-5-2 (timetable questions)'],
  ['5.3.json', 'nq/brain-board: Practice Board in mode nq-5-3 (the Money board)'],
  ['6.2.json', 'nq/brain-board: Practice Board in mode nq-6-2 (the Around & Inside board)'],
  ['6.3.json', 'nq/brain-board: Practice Board in mode nq-6-3 (the Lines & Grids board)'],
  ['7.1.json', 'nq/data-detective: the Chart It chapter (chapter=chart, band=1b) — a new game folder in the manifest'],
  ['7.2.json', 'nq/data-detective: the My Data chapter (chapter=my-data, band=1b) — a new game folder in the manifest'],
  ['7.3.json', 'nq/would-you-rather: the Numbers topic — a new game folder in the manifest'],
  ['7.4.json', 'nq/quest-race: Practice Race (the Vault Run) in mode nq-7-4'],
]);
const owedStillMissing = new Set();

const manifest = JSON.parse(fs.readFileSync(path.join(IMG_DIR, 'nq', 'manifest.json'), 'utf8'));
const byKey = new Map();
for (const e of manifest.images || []) {
  if (byKey.has(e.key)) problems.push(`manifest: duplicate key ${e.key}`);
  byKey.set(e.key, e);
  const file = path.join(IMG_DIR, `${e.key}.webp`);
  if (!fs.existsSync(file)) { problems.push(`manifest: ${e.key} has no file at public/img/${e.key}.webp`); continue; }
  const kb = fs.statSync(file).size / 1024;
  if (kb > 200) problems.push(`manifest: ${e.key}.webp is ${kb.toFixed(0)} KB (over the 200 KB ceiling)`);
  else if (kb > 120) notes.push(`${e.key}.webp is ${kb.toFixed(0)} KB (over the 120 KB warn line)`);
  if (!e.key.startsWith(`nq/${e.game}/`)) problems.push(`manifest: ${e.key} sits outside its game's folder nq/${e.game}/`);
  if (!e.alt || e.alt.length < 10 || e.alt.length > 160) problems.push(`manifest: ${e.key} alt must be 10-160 chars`);
  if (!e.state || !e.concept) problems.push(`manifest: ${e.key} needs a state and a concept line`);
}

const deckDir = path.join(ROOT, 'seed-lessons', 'number-quest', 'course', 'explorer');
const used = new Set();
for (const name of fs.readdirSync(deckDir).filter(n => n.endsWith('.json')).sort()) {
  const deck = JSON.parse(fs.readFileSync(path.join(deckDir, name), 'utf8'));
  deck.slides.forEach((s, i) => {
    if (!s.img) return;
    used.add(s.img);
    const e = byKey.get(s.img);
    if (!e) { problems.push(`${name} slide ${i + 1}: img ${s.img} is not in the nq manifest`); return; }
    if (e.alt !== s.alt) problems.push(`${name} slide ${i + 1}: alt differs from the manifest's for ${s.img}`);
    if (deck.game && e.game !== deck.game.slug) problems.push(`${name} slide ${i + 1}: ${s.img} is a ${e.game} picture on a ${deck.game.slug} step`);
  });
  const mi = deck.slides.findIndex(s => s.kind === 'mission');
  if (deck.game && mi >= 0 && !deck.slides[mi].img) {
    if (MISSION_CAPTURES_OWED.has(name)) { owedStillMissing.add(name); notes.push(`OWED ${name}: mission capture not yet taken — ${MISSION_CAPTURES_OWED.get(name)}`); }
    else problems.push(`${name}: the mission slide carries no img, though the step has a game`);
  }
}
for (const name of MISSION_CAPTURES_OWED.keys()) if (!owedStillMissing.has(name)) notes.push(`OWED list: ${name} no longer misses its mission picture (or is gone) — remove it from MISSION_CAPTURES_OWED in scripts/nq-manifest-check.js`);
for (const key of byKey.keys()) if (!used.has(key)) problems.push(`manifest: ${key} is not carried by any deck slide`);

console.log(`nq manifest: ${byKey.size} pictures, ${used.size} carried by decks`);
for (const n of notes) console.log(`  note: ${n}`);
if (problems.length) { console.error(`\n${problems.length} problem(s):`); for (const p of problems) console.error(`  ✗ ${p}`); process.exit(1); }
console.log('✓ every Number Quest slide picture has a manifest entry, a file and one alt');
