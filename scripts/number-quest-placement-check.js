// Number Quest placement bank validation (spec §4.3, Phase 0).
// Proves every template in seed-lessons/number-quest/placement/templates.json
// generates solvable items with correct, unique keys: for each template it
// generates SAMPLES items across different seeds and checks the prompt renders
// fully, the key is present and unique among the choices (pick), distractors
// carry misconception tags, numeric keys are finite, and text keys are
// non-empty. It also independently re-derives the key for the core arithmetic
// archetypes from the rendered prompt numbers, so a wrong generator formula
// cannot validate itself. Reports counts per strand/rung and thin cells.
// Usage: node scripts/number-quest-placement-check.js. Exit 1 on any error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'seed-lessons/number-quest/placement');
const { TEMPLATES, generateItem, ARCHETYPES } = await import(path.join(DIR, 'generator.js'));
const SAMPLES = 120;
const errors = [], warnings = [];
const fail = m => errors.push(m);

const STRANDS = ['number', 'algebra', 'shape-measure', 'data-chance'];
const RUNGS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];
const RESPONSE_TYPES = ['pick', 'numeric', 'count-out', 'drag', 'build'];
const READING_LOADS = ['none', 'low', 'standard'];
const REQUIRED = ['id', 'strand', 'strandLabel', 'rung', 'rungLabel', 'grade', 'ccss', 'ccssDomain', 'ccssCluster', 'ccssClusterCode', 'lockStatus', 'misconception', 'responseType', 'readingLoad', 'audioFirst', 'launchpadSafe', 'archetype', 'gen'];
// Standards-lock alignment: every rung, K.0-8.0, is locked (rungs 6.0-8.0 since the Pro lock of 2026-11-14), so
// every template must cite a cluster its strand's lock names for its rung, with the registry's own heading.
const PLACE = JSON.parse(fs.readFileSync(path.join(DIR, '..', 'placement.json'), 'utf8'));
const STD = JSON.parse(fs.readFileSync(path.join(DIR, '..', 'standards.json'), 'utf8'));

const ids = new Set();
for (const t of TEMPLATES) {
  for (const f of REQUIRED) if (t[f] === undefined) fail(`${t.id || '?'}: missing field ${f}`);
  if (ids.has(t.id)) fail(`${t.id}: duplicate id`); ids.add(t.id);
  if (!STRANDS.includes(t.strand)) fail(`${t.id}: bad strand ${t.strand}`);
  if (!RUNGS.includes(t.rung)) fail(`${t.id}: bad rung ${t.rung}`);
  if (!RESPONSE_TYPES.includes(t.responseType)) fail(`${t.id}: bad responseType ${t.responseType}`);
  if (!READING_LOADS.includes(t.readingLoad)) fail(`${t.id}: bad readingLoad ${t.readingLoad}`);
  if (!ARCHETYPES[t.archetype]) fail(`${t.id}: unknown archetype ${t.archetype}`);
  if (t.rung <= 2.5 && t.audioFirst !== true) fail(`${t.id}: low-rung template must be audioFirst (spec §9)`);
  if (t.rung < 3 && t.launchpadSafe !== true) fail(`${t.id}: rung < 3 template must be launchpadSafe`);
  if (t.rung < 1 && t.readingLoad !== 'none') fail(`${t.id}: kindergarten template readingLoad must be "none"`);
  const locked = PLACE.strands[t.strandLabel]?.lockedRungs?.[t.rungLabel];
  if (t.lockStatus !== 'locked') fail(`${t.id}: every template must be lockStatus "locked"`);
  if (!locked || !locked.clusters.includes(t.ccssClusterCode)) fail(`${t.id}: cluster ${t.ccssClusterCode} not in the strand lock for ${t.rungLabel}`);
  else if (STD.clusters[t.grade]?.[t.ccssClusterCode] !== t.ccssCluster) fail(`${t.id}: cluster heading does not match standards.json`);
  // A template's own grade and domain are its cluster's (15 templates once named pairs CCSS-M does not have).
  if (t.ccssClusterCode && (t.ccss !== t.ccssClusterCode.split('.').slice(0, 2).join('.') && t.rung >= 6)) fail(`${t.id}: ccss ${t.ccss} is not the grade and domain of ${t.ccssClusterCode}`);
}

// Independent key re-derivation for core arithmetic archetypes, from prompt text.
function independentCheck(t, item) {
  const nums = (item.prompt.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const a = item.answer;
  switch (t.archetype) {
    case 'add': { const m = item.prompt.match(/(\d+(?:\.\d+)?) \+ (\d+(?:\.\d+)?)/) || item.prompt.match(/are (\d+) .*add (\d+)/) || item.prompt.match(/(\d+).*add (\d+)/); if (m && Number(m[1]) + Number(m[2]) !== a) return `add key ${a} != ${m[1]}+${m[2]}`; break; }
    case 'multiply': { const m = item.prompt.match(/(\d+) × (\d+)/) || item.prompt.match(/(\d+) groups of (\d+)/); if (m && Number(m[1]) * Number(m[2]) !== a) return `multiply key ${a} != ${m[1]}x${m[2]}`; break; }
    case 'area': { const m = item.prompt.match(/(\d+) units long and (\d+) units wide/); if (m && Number(m[1]) * Number(m[2]) !== a) return `area key ${a}`; break; }
    case 'perimeter': { const m = item.prompt.match(/(\d+) metres long and (\d+) metres wide/); if (m && 2 * (Number(m[1]) + Number(m[2])) !== a) return `perimeter key ${a}`; break; }
    case 'volume': { const m = item.prompt.match(/(\d+) by (\d+) by (\d+)/); if (m && Number(m[1]) * Number(m[2]) * Number(m[3]) !== a) return `volume key ${a}`; break; }
    case 'missingAdd': { const m = item.prompt.match(/(\d+) \+ ___ = (\d+)/); if (m && Number(m[1]) + a !== Number(m[2])) return `missingAdd key ${a}`; break; }
    case 'count': { if (typeof a !== 'number' || a < 0) return 'count key not a non-negative number'; break; }
    default: break;
  }
  return null;
}

let generated = 0;
for (const t of TEMPLATES) {
  const distinctPrompts = new Set(), distinctAnswers = new Set();
  for (let s = 1; s <= SAMPLES; s++) {
    let item;
    try { item = generateItem(t, s); } catch (e) { fail(`${t.id} seed ${s}: ${e.message}`); break; }
    generated++;
    distinctPrompts.add(`${item.prompt} => ${item.answer}`); distinctAnswers.add(String(item.answer)); // prompt and key: what the game's no-repeat rule compares
    if (!item.prompt || /\{|\}|___.*___.*___/.test(item.prompt.replace('___', '')) && item.prompt.includes('{')) fail(`${t.id} seed ${s}: prompt has unrendered placeholder`);
    if (item.prompt.includes('{') || item.prompt.includes('}')) fail(`${t.id} seed ${s}: prompt has braces: ${item.prompt}`);
    if (item.answer === undefined || item.answer === null || item.answer === '') fail(`${t.id} seed ${s}: empty key`);
    if (typeof item.answer === 'number' && !Number.isFinite(item.answer)) fail(`${t.id} seed ${s}: non-finite key`);
    if (t.responseType === 'pick') {
      // 4 choices, or 2 for a two-way question (even or odd): never a nudged "odd (other)" filler
      if (!Array.isArray(item.choices) || item.choices.length < 2 || item.choices.length > 4 || (item.choices.length < 4 && new Set(item.choices.map(c => String(c.value))).size > 2)) fail(`${t.id} seed ${s}: pick needs 4 choices (2 for a two-way question)`);
      else {
        const vals = item.choices.map(c => String(c.value));
        if (vals.some(v => / \(other\)$/.test(v))) fail(`${t.id} seed ${s}: nudged filler ${vals.join(',')}`);
        if (new Set(vals).size !== vals.length) fail(`${t.id} seed ${s}: duplicate choices ${vals.join(',')}`);
        if (item.choices[item.answerIndex]?.value !== item.answer) fail(`${t.id} seed ${s}: answerIndex does not point at the key`);
        for (const c of item.choices) if (c.value !== item.answer && !c.misconception) fail(`${t.id} seed ${s}: distractor without misconception tag`);
      }
    } else if (item.servedAsPick) {
      // a word, fraction or long-number answer served as buttons (no young child types "pentagon" or "480")
      const vals = item.choices.map(c => String(c.value));
      if (item.choices.length < 2 || new Set(vals).size !== vals.length) fail(`${t.id} seed ${s}: buttons need 2-4 distinct choices ${vals.join(',')}`);
      if (item.choices[item.answerIndex]?.value !== item.answer) fail(`${t.id} seed ${s}: answerIndex does not point at the key`);
      for (const c of item.choices) if (c.value !== item.answer && !c.misconception) fail(`${t.id} seed ${s}: distractor without misconception tag`);
    } else if (!Array.isArray(item.distractorMisconceptions) || item.distractorMisconceptions.length !== 3) {
      fail(`${t.id} seed ${s}: non-pick item needs 3 distractor misconceptions`);
    }
    const bad = independentCheck(t, item);
    if (bad) fail(`${t.id} seed ${s}: ${bad} (prompt: ${item.prompt})`);
    // Tag honesty: a template tagged with a hands-on response type (count-out / build / drag) must
    // actually serve a manipulation element, and one tagged anything else must not — the placement
    // engine spends its every-third-item hands-on preference on the tag, so a lying tag serves a
    // plain typed question in a hands-on slot (evaluator note, parity attempt 4).
    if (s <= 5) {
      const taggedHandsOn = ['count-out', 'build', 'drag'].includes(t.responseType);
      if (taggedHandsOn !== !!item.manip) fail(`${t.id} seed ${s}: responseType ${t.responseType} but generated item ${item.manip ? 'carries' : 'has no'} manipulation element`);
    }
  }
  if (distinctPrompts.size < 5) warnings.push(`${t.id}: only ${distinctPrompts.size} distinct prompts in ${SAMPLES} samples (low variation)`);
}

// Coverage report
const cells = new Map();
for (const t of TEMPLATES) { const k = `${t.strand}@${t.rungLabel}`; cells.set(k, (cells.get(k) || 0) + 1); }
const thin = [];
for (const s of STRANDS) for (const r of RUNGS) {
  const lbl = r < 1 ? `K.${r === 0 ? '0' : '5'}` : `${Math.floor(r)}.${r % 1 ? '5' : '0'}`;
  const n = cells.get(`${s}@${lbl}`) || 0;
  if (n < 3) thin.push(`${s}@${lbl}=${n}`);
}
const perStrand = {};
for (const t of TEMPLATES) perStrand[t.strand] = (perStrand[t.strand] || 0) + 1;
const audioFirst = TEMPLATES.filter(t => t.audioFirst).length;

for (const w of warnings) console.log(`! ${w}`);
for (const e of errors.slice(0, 40)) console.log(`✗ ${e}`);
if (errors.length > 40) console.log(`✗ …and ${errors.length - 40} more`);
console.log(`placement bank: ${TEMPLATES.length} template(s), ${generated} generated item(s) validated, per-strand ${JSON.stringify(perStrand)}, audioFirst ${audioFirst}, thin cells (<3): ${thin.length ? thin.join(', ') : 'none'}, ${warnings.length} warning(s), ${errors.length} error(s)`);
process.exit(errors.length ? 1 : 0);
