// Number Quest slide-picture manifest check, the twin of scripts/csq-manifest-check.js for the nq/
// namespace: the mission screenshots are photographs of a real build. This script keeps the evidence
// honest, so the pictures the decks carry cannot quietly drift away from the games they claim to show:
//
//   node scripts/nq-manifest-check.js          (also: npm run nq:check)
//
// It proves, for every Number Quest deck slide that carries an img (every tier that has decks):
//   - the manifest (public/img/nq/manifest.json) names that exact key, with an alt identical to the
//     deck's own alt (one source of truth, checked both ways);
//   - the .webp file exists on disk and stays under the size the CSQ discipline set (warn >120 KB,
//     fail >200 KB);
//   - the entry's game matches the key's game segment.
// And in the other direction: every manifest entry is carried by some deck, so a stale entry cannot
// linger after its slide is gone, and every deck with a game has its mission slide pictured.
//
// One named exception mechanism, kept loud on purpose: a deck authored before its capture could be
// taken can be named in MISSION_CAPTURES_OWED below, with the exact capture owed it; its missing
// mission picture is then reported as an OWED note on every run instead of a failure, while every
// other deck (and every other check for the owed deck) still fails hard. When a sweep lands a deck's
// capture, delete its line — the stale-entry note at the bottom will say so. The register stands
// EMPTY: the Phase 2 decks (Units 5-7 + the Vault of Measures finale, PR #202) were authored just
// before this imagery platform landed, and the follow-up sweep has since taken all nine captures
// they owed (5.1, 5.2, 5.3, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4). 6.1 never owed anything: it has no game
// (the Builder's Yard is unbuilt), so the mission-picture rule does not apply to it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG_DIR = path.join(ROOT, 'public', 'img');
const problems = [];
const notes = [];

// Mission captures owed to decks named here (see the header note). Key: deck file. Value: the
// capture owed, in the mode the deck's mission assigns. Empty since the Phase 2 sweep landed.
const MISSION_CAPTURES_OWED = new Map([]);
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

// Every tier that has a deck folder (course/<tier>/). Explorer's decks are named by their file alone, as
// they always were (the OWED list keys on "5.1.json"); another tier's carry the tier ("launchpad/1.1.json").
const courseDir = path.join(ROOT, 'seed-lessons', 'number-quest', 'course');
const deckFiles = fs.readdirSync(courseDir).filter(t => fs.statSync(path.join(courseDir, t)).isDirectory()).sort()
  .flatMap(tier => fs.readdirSync(path.join(courseDir, tier)).filter(n => n.endsWith('.json')).sort()
    .map(n => ({ name: tier === 'explorer' ? n : `${tier}/${n}`, file: path.join(courseDir, tier, n) })));
const used = new Set();
for (const { name, file } of deckFiles) {
  const deck = JSON.parse(fs.readFileSync(file, 'utf8'));
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
