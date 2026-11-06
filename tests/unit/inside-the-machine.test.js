// Inside the Machine (seed-games/inside-the-machine.html): the CS Quest systems game (parts, hardware and software,
// the Fix-It desk, bits, gadgets, the Design Lab) with Gizmo. Part one reads the level data straight from the game
// file with vm: every level is solved by its sol, the author's par is honest, every standard id exists, the quest
// codes round-trip and the English word list is exactly what the game says. Part two runs the real game in Chromium
// inside the production frame wrapper (gulp-city pattern): level 1 of two chapters through __brbTest, the progress
// label grammar, two screen sizes, English and Arabic, no page errors. Skipped when there is no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/inside-the-machine.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/inside-the-machine.json'), 'utf8'));
const CSTA = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/csta-2017.json'), 'utf8')).standards.map(s => s.id));
const LABEL = /^\d{1,2}\/\d{1,2} (levels|cases|tickets|cards), \d{1,3} stars(, \d{1,2}\/\d{1,2} checks)?$/;
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { kitTag, kitPackTag } = await import('../../server/services/kit.js');
const { frameProblems } = await import('../e2e/frame-fit.js');

const ctx = vm.createContext({ window: {} });
for (const m of HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
const L = ctx.window.InsideTheMachineLevels;
const MODULE = HTML.slice(HTML.indexOf('<script type="module">'));
// chapters and level counts per band from the contract
const PLAN = [
  { id: 'parts', '1b': 6, '2': 6, csta: { '1b': ['1B-CS-01'], '2': ['1B-CS-01'] } },
  { id: 'hw-sw', '1b': 5, '2': 5, csta: { '1b': ['1B-CS-02'], '2': ['1B-CS-02'] } },
  { id: 'fixit', '1b': 7, '2': 7, csta: { '1b': ['1B-CS-03'], '2': ['2-CS-03'] } },
  { id: 'bits', '1b': 5, '2': 7, csta: { '1b': ['1B-CS-02'], '2': ['2-DA-07'] } },
  { id: 'gadget', '1b': 0, '2': 5, csta: { '2': ['2-CS-02', '2-CS-01'] } },
  { id: 'design-lab', '1b': 3, '2': 5, csta: { '1b': ['1B-IC-19'], '2': ['2-CS-01', '2-IC-21'] } },
];
const KINDS = ['tap', 'pick', 'wire', 'sort', 'order', 'ticket', 'flow', 'switches', 'pixels', 'rgb', 'bin', 'persona'];

test('inside-the-machine: the file is a kit 1.1.4 game that passes the scanner, with its metadata', () => {
  assert.ok(HTML.startsWith('<title>Inside the Machine</title>'));
  assert.ok(HTML.includes(kitTag()), 'the exact kit tag');
  for (const p of ['art-school', 'art-props', 'art-animals', 'dress', 'style-bold']) assert.ok(HTML.includes(kitPackTag(p)), `the exact ${p} pack tag`);
  assert.ok(HTML.indexOf('<div id="game">') < HTML.indexOf(kitTag()), 'the game div comes before the kit tag');
  assert.ok(Buffer.byteLength(HTML) < 2 * 1024 * 1024);
  const r = scanVersion(HTML); assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.doesNotMatch(MODULE, /\b(setTimeout|setInterval|requestAnimationFrame|Date\.now)\s*\(/, 'play runs on the kit clock');
  assert.doesNotMatch(HTML, /<input|<textarea|contenteditable/i, 'tap-only: no text inputs');
  assert.match(HTML, /PACK_VER = '[\w.-]+'/); assert.match(HTML, /PACK_SRI = \{[^;]*\};/); assert.ok(HTML.includes('CsqPacks'));
  assert.equal(META.slug, 'inside-the-machine'); assert.equal(META.category, 'learning'); assert.equal(META.featured, true);
  assert.equal(META.cover, 'night'); assert.equal(META.players_max, 1); assert.equal(META.orientation, 'any'); assert.equal(META.age_rating, 'everyone');
  assert.ok(META.description.length <= 600 && META.title.length <= 60);
});

test('inside-the-machine: JSON l10n has every non-English description', () => {
  for (const l of ['pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) assert.ok(META.l10n[l] && META.l10n[l].description, `description in ${l}`);
});

test('inside-the-machine: the chapter table matches the contract and every chapter has every level in both bands', () => {
  for (const p of PLAN) {
    const ch = L.chapter(p.id); assert.ok(ch, p.id);
    assert.equal(ch.index, PLAN.indexOf(p) + 1, `${p.id} index`);
    for (const band of ['1b', '2']) {
      if (p[band]) assert.equal(JSON.stringify(ch.csta[band]), JSON.stringify(p.csta[band]), `${p.id} ${band} standards`); else assert.ok(!ch.bands.includes(band), `${p.id} has no ${band} band`);
      assert.equal(L.levelsFor(p.id, band).length, p[band], `${p.id} ${band} level count`);
      // a level's standards sit inside its chapter's standards for one of its bands (CI clause f')
      for (const l of L.levelsFor(p.id, band)) { assert.ok(L.cstaOf(l, band).length, `${l.id} has standards for ${band}`); for (const id of L.cstaOf(l, band)) assert.ok(Object.values(ch.csta).some(list => list.includes(id)), `${l.id}: ${id} belongs to ${p.id}`); }
    }
  }
  assert.equal(L.LEVELS.length, 48, 'six chapters, forty-eight level records');
  for (const k of KINDS) assert.ok(L.LEVELS.some(l => l.kind === k), `a level of kind ${k}`);
  assert.equal(L.levelsFor('design-lab', '2').map(l => l.id).join(' '), 'design-1 design-2 design-2-3 design-2-4 design-2-5', 'Pro briefs 3-5 follow the two shared personas');
  assert.ok(L.levelsFor('fixit', '2').every(l => l.kind === 'flow'), 'Pro Fix-It builds the flowchart first');
  assert.equal(JSON.stringify(L.chapter('parts').then['1b']), JSON.stringify({ ch: 'hw-sw', from: 1, to: 3 }), 'Explorer 5.1 continues into Hardware or Software 1-3');
  assert.equal(L.MODES[0], 'play'); assert.equal(L.MODES[3], 'projector');
});

test('inside-the-machine: every level is solved by its sol with the second star, pars are honest, text is complete', () => {
  const ids = new Set();
  for (const l of L.LEVELS) {
    assert.ok(!ids.has(l.id), `${l.id} unique`); ids.add(l.id);
    assert.ok(L.chapter(l.ch) && l.bands.length && l.bands.every(b => L.chapter(l.ch).bands.includes(b)), `${l.id} chapter/bands`);
    // csta is one list, or a list per band when a shared level evidences different standards in each band
    const allCsta = Array.isArray(l.csta) ? l.csta : Object.values(l.csta || {}).flat();
    for (const id of [...allCsta, ...(l.csta2 || [])]) assert.ok(CSTA.has(id), `${l.id}: ${id} is a CSTA 2017 id`);
    assert.ok(allCsta.length, `${l.id} has standards`);
    if (!Array.isArray(l.csta)) assert.equal(Object.keys(l.csta).sort().join(), l.bands.slice().sort().join(), `${l.id}: standards for exactly its bands`);
    const v = L.judge(l, l.sol);
    assert.ok(v.ok, `${l.id} solved by sol: ${v.fails.join(', ')}`);
    assert.ok(v.good, `${l.id} sol earns the second star`);
    if (l.wrong) assert.ok(!L.judge(l, l.wrong).ok, `${l.id}: the wrong fixture does not pass`);
    if (l.kind === 'ticket' || l.kind === 'flow') { assert.equal(l.par, L.parCost(l), `${l.id}: par is the cheapest-first cost`); assert.ok(v.cost <= l.par, `${l.id}: sol within par`); }
    else assert.ok(l.par >= L.moves(l, l.sol), `${l.id}: par >= moves(sol)`);
    if (l.kind === 'pixels') assert.equal(l.par, l.target.join('').split('').reduce((n, d) => n + +d, 0), `${l.id}: par is the number of taps the picture needs`);
    if (l.kind === 'bin') {
      assert.equal(l.par, L.moves(l, l.sol), `${l.id}: par is the cost of the sol`);
      // no cheaper build meets the brief: every subset of the bin that is cheaper fails a need or the budget
      const ids = l.parts.map(p => p.id); let cheaper = 0;
      for (let mask = 1; mask < (1 << ids.length); mask++) { const picked = ids.filter((_, i) => mask & (1 << i)); const v = L.judge(l, { picked, imps: l.sol.imps }); if (v.built && v.totals.cost < l.par) cheaper++; }
      assert.equal(cheaper, 0, `${l.id}: no build cheaper than par meets the brief`);
      assert.ok(L.judge(l, { picked: [] }).met === 0 && L.judge(l, { picked: l.sol.picked.slice(0, 2) }).met < L.judge(l, l.sol).met, `${l.id}: the score is monotone in the needs met`);
      assert.ok(l.sim.length >= 3 && l.quotes.length === 3 && l.improvements.length === 6 && l.best.length >= 2 && l.best.every(id => l.improvements.some(c => c.id === id)), `${l.id}: a sim, three quotes, six improvements, the best among them`);
      for (const c of l.improvements) assert.ok(c.text && c.why, `${l.id}: improvement ${c.id} has its trade-off line`);
      const built = L.judge(l, { picked: l.sol.picked, imps: [] }); assert.ok(built.built && !built.ok, `${l.id}: a good build still needs two improvements`);
      const worst = l.improvements.filter(c => !l.best.includes(c.id)).slice(0, 2).map(c => c.id); assert.ok(!L.judge(l, { picked: l.sol.picked, imps: worst }).ok, `${l.id}: two poor improvements fail`);
      const one = [l.best[0], worst[0]]; const v1 = L.judge(l, { picked: l.sol.picked, imps: one }); assert.ok(v1.ok && !v1.good, `${l.id}: one good improvement passes without the star`);
    }
    if (l.kind === 'persona') { assert.equal(l.changes.length, 9, `${l.id}: nine changes`); assert.ok((l.beats.length === 3 || l.beats.length === 4) && l.struggle >= 0 && l.struggle < l.beats.length, `${l.id}: three or four beats`); for (const c of l.changes) assert.ok(c.text && c.helps, `${l.id}: change ${c.id} says who else it helps`); assert.ok(!L.judge(l, { beat: (l.struggle + 1) % l.beats.length, changes: l.best.slice(0, 2) }).ok, `${l.id}: the wrong moment fails`); assert.ok(!L.judge(l, { beat: l.struggle, changes: l.changes.filter(c => !l.best.includes(c.id)).slice(0, 2).map(c => c.id) }).ok, `${l.id}: two useless changes fail`); }
    if (l.kind === 'pick') for (const r of l.rounds) { assert.equal(r.tiles.length, 3, `${l.id}: three tiles a round`); if (r.show && r.show.bits) assert.ok(r.show.on >= 0 && r.show.on < (1 << r.show.bits), `${l.id}: the bit picture fits its cards`); if (r.show && r.show.rgb) assert.ok(r.show.rgb.length === 3 && r.show.rgb.every(x => x >= 0 && x <= 255)); }
    if (l.kind === 'switches') for (const r of l.rounds) assert.ok(r.target >= 0 && r.target < (1 << (l.bits || 5)), `${l.id}: ${r.target} fits ${l.bits || 5} bits`);
    if (l.kind === 'rgb') assert.ok(l.sol.rgb.every((v, i) => Math.abs(v - l.target[i]) <= l.tol && (v - l.start[i]) % l.step === 0), `${l.id}: the sol is reachable with the stepper and within tolerance`);
    assert.equal(l.hints.length, 3, `${l.id}: three hint tiers`); l.hints.forEach(h => assert.ok(h && typeof h === 'string'));
    assert.ok(l.check && l.check.q && l.check.tiles.length === 3 && l.check.answer >= 0 && l.check.answer < 3, `${l.id}: a 3-tile check`);
    if (l.kind === 'ticket' || l.kind === 'flow') {
      assert.ok(l.checks.length <= 8, `${l.id}: at most 8 checks on the tray`);
      for (const c of l.checks) assert.ok(c.label && c.ok && c.cost > 0, `${l.id}: check ${c.id} text and cost`);
      for (const f of l.faults) assert.ok(l.checks.some(c => c.id === f && c.fix) || (l.swaps || []).some(s => s.id === f && s.fix), `${l.id}: fault ${f} has a fix line`);
      // honesty: a check or swap that does not clear a fault never says the device works again
      const clears = c => l.faults.includes(c.id) || (c.fixes && l.faults.includes(c.fixes));
      for (const c of l.checks) if (!clears(c) && !c.help) assert.doesNotMatch(c.ok, /\b(it works|works again|fixed|prints:|goes online|charges fine|prints fine|turns on)\b/i, `${l.id}: check ${c.id} does not claim success`);
      for (const c of l.swaps || []) if (!clears(c)) assert.doesNotMatch(c.fix, /\b(it works|works again|fixed|prints:|goes online|charges fine|prints fine|was the problem)\b/i, `${l.id}: swap ${c.id} does not claim success`);
      if (l.kind === 'flow') { const v0 = L.judge(l, l.sol), vs = L.judge(l, Object.assign({}, l.sol, { spent: 16 })); assert.ok(vs.ok && !vs.good && vs.cost === v0.cost + 16, `${l.id}: earlier runs stay on the clock`); }
      const bad = L.judge(l, l.kind === 'flow' ? { flow: [], swaps: [] } : { checks: [] }); assert.ok(!bad.ok, `${l.id}: doing nothing does not fix it`);
    }
  }
  for (const ch of L.CHAPTERS) for (const band of ch.bands) { const first = L.levelsFor(ch.id, band)[0]; assert.ok(first && first.learn && first.learn.title && first.learn.text, `${ch.id} ${band}: level 1 has a learn card`); }
  assert.ok(L.LEVELS.filter(l => l.wrong).length >= 7, 'wrong fixtures exist on the wire, order and gadget levels');
});

test('inside-the-machine: a wrong answer is marked wrong and an expensive path loses the second star', () => {
  const g = L.level('gadget-3');
  assert.ok(!L.judge(g, { picked: ['door', 'buzzer', 'button', 'smallbatt', 'cpu'], imps: g.sol.imps }).ok, 'a buzzer is not loud enough for the door alarm');
  assert.ok(!L.judge(g, { picked: ['door', 'siren', 'button', 'bigbatt', 'cpu'], imps: g.sol.imps }).ok, 'the big battery does not fit a pocket');
  const d = L.level('design-2-4'); assert.ok(L.judge(d, { beat: d.struggle, changes: ['testgroup', 'camera'], wrong: 0 }).ok && !L.judge(d, { beat: d.struggle, changes: ['testgroup', 'camera'], wrong: 0 }).good, 'one best change passes without the star');
  // the key is the moment the user actually fails (what the prompt asks), and it is not the same slot on every level
  for (const p of L.LEVELS.filter(l => l.kind === 'persona')) assert.match(p.beats[p.struggle], /squints|drops|cries|loses|does not recognize|cannot reach/, `${p.id}: the struggle beat is where the user fails`);
  assert.ok(new Set(L.LEVELS.filter(l => l.kind === 'persona').map(l => l.struggle)).size >= 2, 'the struggle is not always the same tile');
  assert.equal(L.judge(L.level('design-2-4'), { beat: 2, changes: ['testgroup', 'passcode'] }).fails.join(), 'moment');
  // shared Design Lab personas evidence a different standard per band; the Pro desk only builds toward 2-AP-10
  assert.equal(L.cstaOf(L.level('design-1'), '1b').join(), '1B-IC-19'); assert.equal(L.cstaOf(L.level('design-1'), '2').join(), '2-CS-01,2-IC-21');
  assert.equal(L.cstaOf(L.level('fixit-2-1'), '2').join(), '2-CS-03'); assert.equal(L.level('fixit-2-1').csta2.join(), '2-AP-10');
  // Design a Gadget evidences 2-CS-01 (the user quotes and the Improve phase), not just builds toward it
  for (const l of L.LEVELS.filter(x => x.ch === 'gadget')) { assert.equal(L.cstaOf(l, '2').join(), '2-CS-02,2-CS-01'); assert.ok(!l.csta2, `${l.id}: no toward`); }
  // every persona names the beat that causes the trouble (a near miss in play), and it is never the struggle itself
  for (const p of L.LEVELS.filter(l => l.kind === 'persona')) assert.ok(Number.isInteger(p.cause) && p.cause !== p.struggle && p.cause < p.beats.length, `${p.id}: a cause beat`);
  // memory and storage never share a role (hint 2 glows a role group)
  assert.notEqual(L.PARTS.memory.role, L.PARTS.storage.role);
  // the second star never rewards dear checks first: most expensive first is never good, on any ticket
  for (const l of L.LEVELS.filter(x => x.kind === 'ticket' || x.kind === 'flow')) {
    const rel = l.checks.filter(c => c.rel && !c.help), costs = new Set(rel.map(c => c.cost)); if (costs.size < 2) continue;
    const dear = rel.slice().sort((a, b) => b.cost - a.cost).map(c => c.id);
    const v = L.judge(l, l.kind === 'flow' ? { flow: dear, swaps: (l.swaps || []).map(s => s.id) } : { checks: dear });
    assert.ok(!v.good, `${l.id}: most expensive first does not earn the second star`);
  }
  assert.equal(L.judge(L.level('fixit-1b-6'), { checks: ['brick', 'cable', 'restart', 'fluff', 'wall', 'plugged'] }).good, false);
  // an rgb par is at least the taps to the nearest reachable value on each light (being exact never costs the star)
  for (const l of L.LEVELS.filter(x => x.kind === 'rgb')) {
    const taps = l.target.reduce((n, t, i) => { let best = 0, bd = Infinity; for (let k = -20; k <= 20; k++) { const v = l.start[i] + k * l.step; if (v < 0 || v > 255) continue; const d = Math.abs(v - t); if (d < bd || (d === bd && Math.abs(k) < Math.abs(best))) { bd = d; best = k; } } return n + Math.abs(best); }, 0);
    assert.ok(l.par >= taps, `${l.id}: par ${l.par} >= ${taps} taps to the nearest values`);
  }
  // the frozen app: a restart is a bigger fix that also works (it costs the star, not the ticket)
  const fr = L.judge(L.level('fixit-1b-4'), { checks: ['restart'] }); assert.ok(fr.ok && !fr.good && fr.cost === 4 && fr.path[0].hit, JSON.stringify(fr));
  // the noise meter sends its log to the laptop through the cable port (2-CS-02: collect and exchange)
  assert.ok(L.level('gadget-4').needs.some(n => n.cat === 'connection') && L.level('gadget-4').sol.picked.includes('port'));
  const px = L.level('bits-2-4'); assert.ok(!L.judge(px, { grid: ['0120', '1331', '1331', '0110'], toggles: 21 }).ok, 'a gray level off by one fails');
  const wire = L.level('parts-3');
  assert.ok(!L.judge(wire, { wires: [['touch', 'processor']], edits: 0 }).ok);
  assert.ok(!L.judge(wire, { wires: [['touch', 'processor'], ['processor', 'screen'], ['speaker', 'camera']], edits: 0 }).ok, 'an extra wire fails');
  assert.ok(!L.judge(wire, { wires: [['processor', 'touch'], ['screen', 'processor']], edits: 1 }).good, 'a removed wire costs the second star (direction does not matter)');
  const order = L.level('hwsw-2'); const r = L.judge(order, { order: ['finger', 'cpu', 'touch', 'app', 'screen'], moves: 5 }); assert.ok(!r.ok && r.firstBad === 1);
  const sort = L.level('hwsw-1'); const s = L.judge(sort, Object.assign({}, sort.sol, { placed: Object.assign({}, sort.sol.placed, { c1: 'sw' }) })); assert.ok(!s.ok && s.wrongCards.includes('c1'));
  const t = L.level('fixit-1b-1');
  const slow = L.judge(t, { checks: ['charge', 'plug'] }); assert.ok(slow.ok && !slow.good && slow.cost === 11, 'expensive first: fixed, no star');
  const help = L.judge(t, { checks: ['help'] }); assert.ok(help.ok && help.helped && !help.good, 'asking the teacher ends the ticket without the star');
  const f = L.level('fixit-2-3');
  const noSwap = L.judge(f, { flow: f.sol.flow, swaps: [] }); assert.ok(!noSwap.ok, 'the flowchart alone cannot find the user\'s cable');
  const lucky = L.judge(f, { flow: ['dockpower'], swaps: ['cable'] }); assert.ok(lucky.ok && lucky.good && lucky.cost === 3);
  const two = L.level('fixit-2-7'); assert.ok(!L.judge(two, { flow: two.sol.flow, swaps: [] }).ok && L.judge(two, two.sol).ok, 'two faults need the check and the swap');
});

test('inside-the-machine: quest codes are four digits and round-trip for every chapter, band, mode and level', () => {
  for (const ch of L.CHAPTERS) for (const band of ch.bands) for (const mode of ['play', 'projector']) for (let level = 0; level <= 9; level++) {
    const code = L.codeFor({ chapter: ch.id, band, mode, level });
    assert.match(code, /^\d{4}$/);
    assert.equal(JSON.stringify(L.parseCode(code)), JSON.stringify({ chapter: ch.id, band, mode, level }));
  }
  assert.equal(JSON.stringify(L.parseCode('0100')), JSON.stringify({ chapter: null, band: '1b', mode: 'play', level: 0 }), '0 = the map');
  assert.equal(L.parseCode('12'), null); assert.equal(L.parseCode('9100').chapter, null);
  assert.equal(L.parseCode('3110'), null, 'mode 1 (debug) belongs to another game'); assert.equal(L.parseCode('3120'), null, 'mode 2 (maker) too');
  assert.equal(L.codeFor({ chapter: 'fixit', band: '2', mode: 'play', level: 0 }), '3200');
  assert.equal(L.codeFor({ chapter: 'gadget', band: '2', mode: 'play', level: 0 }), '5200');
});

test('inside-the-machine: en.json is exactly the English the game shows (level text plus every tr() literal), within budget', () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/cs-quest/inside-the-machine/en.json'), 'utf8')).strings;
  const lits = new Set();
  for (const m of MODULE.matchAll(/\btr\((['"])((?:\\.|(?!\1)[^\\\n])+)\1/g)) lits.add(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
  // plural(n, 'one form', 'other form') and the RULES table are translated texts too
  for (const m of MODULE.matchAll(/\bplural\([^,]+,\s*'([^'\n]+)',\s*'([^'\n]+)'\)/g)) { lits.add(m[1]); lits.add(m[2]); }
  const rules = /const RULES = \{([\s\S]*?)\};/.exec(MODULE); for (const m of rules[1].matchAll(/: '([^'\n]+)'/g)) lits.add(m[1]);
  const want = new Set([...L.strings(), ...lits]);
  const have = new Set(en);
  assert.equal(en.length, have.size, 'no duplicates');
  assert.deepEqual([...want].filter(s => !have.has(s)), [], 'strings the game shows that en.json lacks');
  assert.deepEqual([...have].filter(s => !want.has(s)), [], 'strings in en.json the game no longer shows');
  assert.ok(lits.size <= 450, `chrome strings ${lits.size} <= 450`);
  assert.ok(en.length <= 1450, `strings ${en.length} <= 1450`);
  for (const s of en) { assert.doesNotMatch(s, /\d{7,}|@|https?:/); assert.doesNotMatch(s, /\b(colour|colours|grey|favourite|labelled|practis(e|ed|ing)|organis(e|ed|ing)|recognis(e|ed|ing)|centre|maths)\b/i); }
});

/* ---------- part two: the real game in Chromium, inside the production frame wrapper ---------- */
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const HOST = 'http://game.invalid';
const SHOTS = process.env.IM_SHOTS || '';
let browser;
test.after(async () => { if (browser) await browser.close(); });
async function open({ size = { width: 390, height: 844 }, lang = 'en', params = null } = {}) {
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); }
  const ctx = await browser.newContext({ viewport: size, hasTouch: true, reducedMotion: 'reduce' });
  const init = { user: { displayName: 'P', avatar: 'x', lang, dir: lang === 'ar' || lang === 'he' ? 'rtl' : 'ltr' }, game: { id: 'g', title: 'Inside the Machine' }, save: {}, canSave: false, preview: true, deviceText: { title: 'x', text: 'y' } };
  if (params) init.params = params;
  const shim = params ? `<script>if (window.BRB && !('params' in BRB)) Object.defineProperty(BRB, 'params', { value: Object.freeze(${JSON.stringify(params)}) });</script>` : '';
  const doc = frameDocument(shim + HTML, init);
  const host = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const errors = [], messages = [], consoleErrors = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const m = /^http:\/\/game\.invalid\/(vendor\/[\w./-]+\.(js|woff2?))$/.exec(u);
    if (m && fs.existsSync(path.join(ROOT, 'public', m[1]))) return route.fulfill({ status: 200, headers: { 'content-type': m[2] === 'js' ? 'text/javascript' : 'font/woff2', 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(ROOT, 'public', m[1])) });
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); else if (msg.type() === 'warning') messages.push(msg.text()); });
  await page.goto(HOST + '/', { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 200 && !frame; i++) { frame = page.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await page.waitForTimeout(25); }
  frame.on('pageerror', e => errors.push(String(e.message)));
  await frame.waitForFunction(() => window.__brbTest && typeof window.__brbTest.start === 'function' && window.__brbTest.state().ready, null, { timeout: 60_000 });
  const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.waitForTimeout(150); await page.screenshot({ path: path.join(SHOTS, `${name}-${size.width}x${size.height}-${lang}.png`) }); } };
  return { ctx, page, frame, errors, messages, consoleErrors, shot };
}
const PACK_VER = HTML.match(/const PACK_VER = '([^']+)'/)[1];
const PACKS = {};
const packOf = l => PACKS[l] || (PACKS[l] = (() => { const w = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/vendor/data/inside-the-machine', PACK_VER, l + '.js'), 'utf8'), w); return w.window.CsqPacks['inside-the-machine'][l].strings; })());
const word = (lang, k) => lang === 'en' ? k : (packOf(lang)[k] || k);
const T = (frame, fn, ...a) => frame.evaluate(([f, a]) => window.__brbTest[f](...a), [fn, a]);
const solOf = id => L.level(id).sol;

test('inside-the-machine: Chromium plays level 1 of Parts & Jobs and the Fix-It desk, reports progress in the label grammar, renders on a phone and a desktop, in English and Arabic', { skip, timeout: 300_000 }, async () => {
  const PHONE = { width: 390, height: 844 }, DESK = { width: 1280, height: 800 };
  for (const [size, lang, full] of [[PHONE, 'en', true], [DESK, 'ar', true], [PHONE, 'ar', false], [DESK, 'en', false]]) {
    const { ctx, frame, errors, messages, consoleErrors, shot } = await open({ size, lang });
    // nothing clipped, overlapping, squashed or outside the frame; on a phone at 150% text a tray of six long tiles is
    // a list that scrolls under the pinned action row, which the audit's small-scroller rule would otherwise flag
    const fit = async (what, { scrolls = false } = {}) => { const p = (await frameProblems(frame)).filter(x => !(scrolls && /needs scrolling/.test(x.what))); assert.deepEqual(p, [], `${what} fits at ${size.width}x${size.height} ${lang}`); };
    try {
      let s = await T(frame, 'state');
      assert.equal(s.screen, 'title'); assert.equal(s.ready, true);
      await shot('title');
      // free play: the chapter map after Play
      await frame.click('.ok-title-screen .ok-hot');
      await frame.waitForFunction(() => window.__brbTest.state().screen === 'map');
      await shot('map');
      assert.ok(await frame.$('.im-seg'), 'the band toggle shows in free play');
      // lesson mode: Parts & Jobs level 1, solved with its sol
      s = await T(frame, 'start', { chapter: 'parts', band: '1b', level: 1, seed: 11, lesson: true, lock: true });
      assert.equal(s.screen, 'play'); assert.equal(s.levelId, 'parts-1'); assert.equal(s.lock, true); assert.ok(!s.hasParams);
      assert.ok(await frame.$('.im-pill'), 'the class quest pill');
      await shot('parts-1');
      await T(frame, 'answer', solOf('parts-1'));
      s = await T(frame, 'state'); assert.equal(s.done, true); assert.equal(s.modal, true, 'the Case-closed card opens in lesson mode');
      await shot('case-closed');
      s = await T(frame, 'check', 0);
      await frame.waitForFunction(() => window.__brbTest.state().modal === false);
      s = await T(frame, 'state');
      assert.match(s.label, LABEL, s.label); assert.ok(s.label.length <= 40 && /^[\x20-\x7e]+$/.test(s.label));
      assert.equal(s.stars, 3, 'three stars: solved, no wrong tap, no third hint');
      assert.equal(s.checks.n, 1);
      const scores = await T(frame, 'scores'); assert.equal(scores.length, 1); assert.equal(scores[0].score, 3);
      assert.ok(await frame.$('.ok-win'), 'the kit results card');
      await shot('win');
      await T(frame, 'next');
      await frame.waitForFunction(() => window.__brbTest.state().levelId === 'parts-2');
      // the Fix-It desk, level 1 (Explorer): the cheapest-first path earns the star
      s = await T(frame, 'start', { chapter: 'fixit', band: '1b', level: 1, seed: 5, lesson: true });
      assert.equal(s.levelId, 'fixit-1b-1'); assert.equal(s.kind, 'ticket');
      await shot('fixit-1');
      await T(frame, 'answer', solOf('fixit-1b-1'));
      s = await T(frame, 'state'); assert.equal(s.done, true);
      const v = await T(frame, 'verdict'); assert.ok(v.ok && v.good && v.cost <= 3, JSON.stringify(v));
      await shot('case-file');
      await T(frame, 'closeDialog');   // the case file
      await frame.waitForFunction(() => document.querySelector('.im-modal .im-check-tiles'));
      await T(frame, 'check', 1);
      await frame.waitForFunction(() => window.__brbTest.state().modal === false);
      s = await T(frame, 'state'); assert.match(s.label, /^1\/7 tickets, 3 stars, \d\/1 checks$/, s.label);
      await fit('the results card');
      if (lang === 'ar') assert.equal(await frame.evaluate(() => document.getElementById('im').dir), 'rtl');
      if (!full) { assert.deepEqual(errors, [], 'no page errors'); assert.deepEqual(consoleErrors, [], 'no console errors'); continue; }
      // Pro Fix-It: the flowchart first, then the swap test (the user's cable)
      await T(frame, 'closeDialog');
      s = await T(frame, 'start', { chapter: 'fixit', band: '2', level: 3, seed: 2 });
      assert.equal(s.levelId, 'fixit-2-3'); assert.equal(s.kind, 'flow'); assert.equal(s.lesson, false);
      await T(frame, 'answer', solOf('fixit-2-3'));
      s = await T(frame, 'state'); assert.equal(s.done, true);
      const v2 = await T(frame, 'verdict'); assert.ok(v2.ok && v2.good && v2.path.some(p => p.kind === 'swap' && p.hit), JSON.stringify(v2));
      // keyboard: the arrows walk a tray (mirrored in Arabic) and Enter picks; a chosen tile carries a check badge as
      // well as its color; the left-handed setting moves the action row to the start side
      for (let i = 0; i < 6; i++) { s = await T(frame, 'state'); if (!s.modal && !s.kitOpen) break; await T(frame, 'closeDialog'); await frame.waitForTimeout(60); }
      s = await T(frame, 'start', { chapter: 'hw-sw', band: '1b', level: 2, seed: 4 }); assert.equal(s.kind, 'order');
      const focused = () => frame.evaluate(() => [...document.querySelectorAll('.im-tray button')].indexOf(document.activeElement));
      await frame.focus('.im-tray button'); assert.equal(await focused(), 0);
      await frame.press('.im-tray button', lang === 'ar' ? 'ArrowLeft' : 'ArrowRight'); assert.equal(await focused(), 1, 'the forward arrow moves to the next tile');
      await frame.press('.im-tray button:nth-child(2)', 'ArrowDown'); assert.ok(await focused() > 1, 'down moves a row');
      await frame.press('.im-tray button:focus', 'Enter');
      assert.deepEqual(await frame.evaluate(() => { const b = document.querySelector('.im-tray button[aria-pressed="true"]'); return [!!b, b && b.querySelector('.im-num') !== null, b && getComputedStyle(b, '::before').content]; }), [true, true, 'none'], 'Enter picks the step; a chosen step shows its number badge (and no second badge)');
      // Start over takes every step out in one tap, and is not a try (no fail)
      const fails0 = (await T(frame, 'state')).fails;
      assert.ok(await frame.evaluate(() => { const b = [...document.querySelectorAll('.im-actions .ok-btn')].find(x => /Start over|ابدأ من جديد/.test(x.textContent)); if (b) b.click(); return !!b; }), 'a Start over button once a step is in');
      assert.equal(await frame.evaluate(() => document.querySelectorAll('.im-tray button[aria-pressed="true"]').length), 0, 'every step is out again');
      assert.equal((await T(frame, 'state')).fails, fails0, 'starting over is not a failed try');
      s = await T(frame, 'start', { chapter: 'gadget', band: '2', level: 1, seed: 4 }); await T(frame, 'tap', solOf('gadget-1').picked[0]);
      assert.equal(await frame.evaluate(() => { const b = document.querySelector('.im-tray button[aria-pressed="true"]'); return b && getComputedStyle(b, '::before').content; }), '""', 'a chosen part shows a check badge, not only a color');
      await frame.evaluate(() => { Oomba.settings.leftHanded = true; });
      assert.equal(await frame.evaluate(() => document.getElementById('im').classList.contains('im-lefty') && getComputedStyle(document.querySelector('.im-actions')).justifyContent), 'flex-start', 'left-handed: the action row sits at the start side');
      await fit('the parts bin, left-handed'); await shot('lefty');
      await frame.evaluate(() => { Oomba.settings.leftHanded = false; });
      // one level of every other kind: the switch board, the pixel grid, the RGB panel, the parts bin, the Design Lab
      const played = size.width > 1000 ? [['bits', '1b', 1, 'bits-1b-1'], ['bits', '1b', 2, 'bits-1b-2'], ['bits', '1b', 3, 'bits-1b-3'], ['bits', '1b', 5, 'bits-1b-5'], ['bits', '2', 2, 'bits-2-2'], ['bits', '2', 4, 'bits-2-4'], ['bits', '2', 6, 'bits-2-6'], ['gadget', '2', 1, 'gadget-1'], ['gadget', '2', 4, 'gadget-4'], ['design-lab', '1b', 1, 'design-1'], ['design-lab', '2', 4, 'design-2-4']]
        : [['bits', '1b', 4, 'bits-1b-4'], ['bits', '2', 3, 'bits-2-3'], ['bits', '2', 5, 'bits-2-5'], ['bits', '2', 7, 'bits-2-7'], ['gadget', '2', 2, 'gadget-2'], ['design-lab', '1b', 3, 'design-1b-3'], ['design-lab', '2', 5, 'design-2-5']];
      for (const [chapter, band, level, id] of played) {
        for (let i = 0; i < 6; i++) { s = await T(frame, 'state'); if (!s.modal && !s.kitOpen) break; await T(frame, 'closeDialog'); await frame.waitForTimeout(60); }
        s = await T(frame, 'start', { chapter, band, level, seed: 4 }); assert.equal(s.levelId, id);
        await shot(id);
        if (id === 'gadget-2') {
          // the gadget: build, a ten-second test run, three users, two improvements
          for (const pid of solOf(id).picked) await T(frame, 'tap', pid);
          await frame.evaluate(() => { document.querySelector('.im-actions .ok-hot').click(); });
          await frame.waitForFunction(() => window.__brbTest.state().viewPhase === 'quotes');
          assert.equal((await frame.$$('.im-fv')).length, 3, 'three user quotes on the board');
          await shot('gadget-quotes');
          for (const iid of solOf(id).imps) await T(frame, 'tap', iid);
          await frame.evaluate(() => { document.querySelector('.im-actions .ok-hot').click(); });
        } else await T(frame, 'answer', solOf(id));
        s = await T(frame, 'state'); assert.equal(s.done, true, `${id} solved by its sol in the browser`);
        const vk = await T(frame, 'verdict'); assert.ok(vk.ok && vk.good, `${id}: ${JSON.stringify(vk)}`);
        if (id === 'gadget-4' || id === 'design-2-4') { assert.ok(s.modal, `${id}: the verdict card`); assert.equal((await frame.$$('.im-modal .im-fv')).length, 2, `${id}: both choices explained`); await shot(id + '-verdict'); }
      }
      await T(frame, 'closeDialog');
      // text at 150%: the densest screens still fit (the audit rules of tests/e2e/frame-fit.js)
      for (let i = 0; i < 6; i++) { s = await T(frame, 'state'); if (!s.modal && !s.kitOpen) break; await T(frame, 'closeDialog'); await frame.waitForTimeout(60); }
      await frame.evaluate(() => { Oomba.settings.textSize = 1.5; });
      s = await T(frame, 'start', { chapter: 'fixit', band: '1b', level: 3, seed: 4 }); await T(frame, 'hint'); await T(frame, 'hint'); await frame.waitForTimeout(80); await fit('the Fix-It tray with two hints at 150%', { scrolls: size.width < 600 }); await shot('ticket-150');
      s = await T(frame, 'start', { chapter: 'gadget', band: '2', level: 2, seed: 4 }); for (const pid of solOf('gadget-2').picked) await T(frame, 'tap', pid); await frame.evaluate(() => { document.querySelector('.im-actions .ok-hot').click(); }); await frame.waitForFunction(() => window.__brbTest.state().viewPhase === 'quotes'); await frame.waitForTimeout(80); await fit('the gadget quotes at 150%', { scrolls: size.width < 600 });
      s = await T(frame, 'start', { chapter: 'design-lab', band: '2', level: 5, seed: 4 }); await T(frame, 'tap', L.level('design-2-5').struggle); await frame.waitForTimeout(600); await fit('the Design Lab changes at 150%', { scrolls: size.width < 600 }); await shot('persona-150');
      s = await T(frame, 'start', { chapter: 'parts', band: '1b', level: 1, seed: 4 }); await T(frame, 'questCard'); await frame.waitForTimeout(80); await fit('the Quest Card at 150%'); await T(frame, 'closeDialog');
      await frame.evaluate(() => { Oomba.settings.textSize = 1; });
      // the Daily Crew Challenge: the same level all day, its own card, no lesson progress
      for (let i = 0; i < 6; i++) { s = await T(frame, 'state'); if (!s.modal && !s.kitOpen) break; await T(frame, 'closeDialog'); await frame.waitForTimeout(60); }
      const pick = await T(frame, 'dailyPick', '2'); assert.ok(L.level(pick.id) && L.level(pick.id).bands.includes('2'), JSON.stringify(pick));
      assert.deepEqual(await T(frame, 'dailyPick', '2'), pick, 'deterministic for the day');
      const before = (await T(frame, 'scores')).length, starsBefore = JSON.stringify((await T(frame, 'save')).stars);
      assert.ok(L.levelsFor(L.level(pick.id).ch, '2').indexOf(L.level(pick.id)) === 0 || (await T(frame, 'save')).stars['2:' + L.levelsFor(L.level(pick.id).ch, '2')[0].id] || L.level(pick.id).ch === 'parts', 'the daily comes from a started chapter, or the first chapter');
      s = await T(frame, 'daily'); assert.equal(s.daily, pick.day); assert.equal(s.lesson, false);
      assert.ok(L.level(s.levelId).bands.includes(s.band));
      await T(frame, 'answer', solOf(s.levelId));
      s = await T(frame, 'state'); assert.equal(s.done, true, 'the daily level solved');
      if (['ticket', 'flow', 'persona', 'bin'].includes(L.level(s.levelId).kind)) { await T(frame, 'closeDialog'); await frame.waitForTimeout(80); }
      assert.ok(await frame.$('.im-modal'), 'the daily card');
      assert.ok((await frame.textContent('.im-modal h2')).length > 0);
      await shot('daily');
      assert.equal((await T(frame, 'scores')).length, before, 'a daily level is not lesson progress');
      assert.equal((await T(frame, 'save')).daily.day, pick.day);
      assert.equal(JSON.stringify((await T(frame, 'save')).stars), starsBefore, 'a daily keeps its stars to itself: no chapter level is filled in');
      await T(frame, 'closeDialog');
      await frame.waitForFunction(() => window.__brbTest.state().screen === 'map');
      assert.ok(await frame.$('.im-daily'), 'the daily tile on the map');
      // a full-star chapter crowns Gizmo
      s = await T(frame, 'state'); assert.deepEqual(s.wear, ['glasses']);
      assert.equal(await T(frame, 'grant', L.levelsFor('hw-sw', '1b').map(l => l.id), '1b'), true, 'a new crown changes the look');
      s = await T(frame, 'state'); assert.equal(s.crowns, 1); assert.deepEqual(s.wear, ['glasses', 'crown']);
      await T(frame, 'start', { band: '1b' }); assert.ok(await frame.$('.im-chap .im-crown'), 'the crown on the Explorer chapter tile');
      await shot('crown');
      // the quest keypad: 1 1 0 0 opens Parts & Jobs, Explorer; a map code goes to the map
      await T(frame, 'closeDialog'); await frame.waitForFunction(() => window.__brbTest.state().modal === false);
      assert.equal(await T(frame, 'code', '1100'), true);
      s = await T(frame, 'state'); assert.equal(s.chapter, 'parts'); assert.equal(s.band, '1b'); assert.equal(s.lesson, true); assert.equal(s.lock, false);
      assert.equal(await T(frame, 'code', '7777'), false, 'no seventh chapter');
      assert.equal(await T(frame, 'code', '3110'), false, 'a debug-mode code belongs to another game');
      // an unlocked class quest follows the chapter the kid picks on the map: the pill, the label noun and the gradebook agree
      await T(frame, 'map'); await frame.waitForFunction(() => window.__brbTest.state().screen === 'map');
      await frame.evaluate(() => { document.querySelector('.im-chap[data-ch="fixit"]').click(); });
      await frame.evaluate(play => { [...document.querySelectorAll('.ok-btn')].find(b => b.textContent.trim() === play).click(); }, word(lang, 'Play'));
      await frame.waitForFunction(() => window.__brbTest.state().screen === 'play');
      s = await T(frame, 'state'); assert.equal(s.chapter, 'fixit'); assert.deepEqual(s.quest, { ch: 'fixit', band: '1b' }); assert.equal(s.lesson, true);
      { const pill = await frame.evaluate(() => document.querySelector('.im-play .im-pill').getAttribute('aria-label')); if (lang === 'en') assert.match(pill, /^Level \d · Class quest: Fix-It Desk · Explorer$/); else assert.ok(pill.includes(word(lang, 'Fix-It Desk')), pill); }
      if (s.modal) await T(frame, 'closeDialog');
      await T(frame, 'answer', solOf(s.levelId)); await T(frame, 'closeDialog'); await frame.waitForFunction(() => document.querySelector('.im-modal .im-check-tiles')); await T(frame, 'check', 0);
      await frame.waitForFunction(() => window.__brbTest.state().modal === false);
      s = await T(frame, 'state'); assert.match(s.label, /^\d\/7 tickets, \d+ stars, 1\/1 checks$/, 'the label names the chapter being played: ' + s.label);
      await T(frame, 'closeDialog');
      // the third hint costs a star, the kid is warned after the second, and the stars card says what was missed
      for (let i = 0; i < 6; i++) { s = await T(frame, 'state'); if (!s.modal && !s.kitOpen) break; await T(frame, 'closeDialog'); await frame.waitForTimeout(60); }
      s = await T(frame, 'start', { chapter: 'parts', band: '1b', level: 3, seed: 4 });
      assert.equal(await frame.evaluate(() => document.querySelector('.im-rule').textContent), word(lang, 'Second star: {rule}.').replace('{rule}', word(lang, 'no wire taken out')));
      await T(frame, 'hint'); await T(frame, 'hint');
      if (lang === 'en') assert.match(await frame.evaluate(() => document.querySelector('.im-panel [role=status]').textContent), /One more hint will cost a star\.$/);
      if (lang === 'en') assert.match(await frame.evaluate(() => document.querySelector('.im-hintbtn').textContent), /costs a star/);
      await T(frame, 'hint');
      if (lang === 'en') assert.match(await frame.evaluate(() => document.querySelector('.im-panel [role=status]').textContent.trim()), /^One missing wire is drawn for you\./, 'hint 3 says what it did');
      await T(frame, 'tap', 'processor'); await T(frame, 'tap', 'screen'); await frame.evaluate(() => { document.querySelector('.im-actions .ok-hot').click(); });   // the hint drew the first wire; the kid adds the second
      await frame.waitForFunction(() => document.querySelector('.ok-win .im-why'));
      assert.equal(await frame.evaluate(() => document.querySelector('.ok-win .im-why').textContent), word(lang, 'Third star next time: no third hint.'));
      s = await T(frame, 'state'); assert.equal(s.hint, 3);
      // the Design Lab: the key is the moment Tao is locked out (the fourth beat), and a restart also un-freezes the app
      await T(frame, 'next'); for (let i = 0; i < 6; i++) { s = await T(frame, 'state'); if (!s.modal && !s.kitOpen) break; await T(frame, 'closeDialog'); await frame.waitForTimeout(60); }
      s = await T(frame, 'start', { chapter: 'design-lab', band: '2', level: 4, seed: 4 }); await T(frame, 'tap', 1); s = await T(frame, 'state'); assert.equal(s.fails, 0, 'the design-flaw narration (the cause) is a near miss, not a wrong tap');
      if (lang === 'en') assert.match(await frame.evaluate(() => document.querySelector('.im-panel').textContent), /That is what causes it/);
      await T(frame, 'tap', 2); s = await T(frame, 'state'); assert.equal(s.fails, 1, 'a scenery beat is not the moment');
      await T(frame, 'tap', 3); await T(frame, 'tap', 'testgroup'); await T(frame, 'tap', 'passcode'); await frame.evaluate(() => { document.querySelector('.im-actions .ok-hot').click(); });
      s = await T(frame, 'state'); assert.equal(s.done, true, 'the locked-out moment plus the two best changes solve it');
      for (let i = 0; i < 6; i++) { s = await T(frame, 'state'); if (!s.modal && !s.kitOpen) break; await T(frame, 'closeDialog'); await frame.waitForTimeout(60); }
      s = await T(frame, 'start', { chapter: 'fixit', band: '1b', level: 4, seed: 4 }); await T(frame, 'tap', 'restart');
      s = await T(frame, 'state'); const vr = await T(frame, 'verdict'); assert.ok(s.done && vr.ok && !vr.good && vr.cost === 4, 'fixit-1b-4: a restart fixes the frozen app without the star');
      for (let i = 0; i < 6; i++) { s = await T(frame, 'state'); if (!s.modal && !s.kitOpen) break; await T(frame, 'closeDialog'); await frame.waitForTimeout(60); }
      if (lang === 'ar') { assert.equal(await frame.evaluate(() => document.getElementById('im').dir), 'rtl'); assert.equal(await frame.evaluate(() => document.querySelector('.im-slots') === null), true); }
      assert.deepEqual(errors, [], 'no page errors'); assert.deepEqual(consoleErrors, [], 'no console errors');
      assert.deepEqual(messages.filter(m => /Uncaught|TypeError|ReferenceError/.test(m)), [], 'no warnings that are really errors');
    } finally { await ctx.close(); }
  }
});

test('inside-the-machine: BRB.params lock a lesson (chapter, band, lock) and the map never shows; the Explorer chain continues into Hardware or Software', { skip, timeout: 180_000 }, async () => {
  const { ctx, frame, errors } = await open({ size: { width: 844, height: 390 }, lang: 'en', params: { chapter: 'parts', band: '1b', lock: 1 } });
  try {
    let s = await T(frame, 'state'); assert.equal(s.screen, 'title');
    await frame.click('.ok-title-screen .ok-hot');
    await frame.waitForFunction(() => window.__brbTest.state().screen === 'play');
    s = await T(frame, 'state');
    assert.equal(s.chapter, 'parts'); assert.equal(s.lesson, true); assert.equal(s.lock, true); assert.equal(s.hasParams, true);
    assert.equal(await frame.$('.im-play .ok-btn[aria-label="Chapter map"]'), null, 'no way to the map under lock');
    await T(frame, 'skipAnimations');
    // play the chapter through: six levels, each with its Case-closed card
    for (let i = 1; i <= 6; i++) {
      s = await T(frame, 'state'); assert.equal(s.level, i, `level ${i}`);
      if (s.modal) { await T(frame, 'closeDialog'); await frame.waitForFunction(() => !window.__brbTest.state().modal); }
      await T(frame, 'answer', solOf(s.levelId));
      await frame.waitForFunction(() => document.querySelector('.im-modal .im-check-tiles'));
      await T(frame, 'check', 0);
      await frame.waitForFunction(() => document.querySelector('.ok-win'));
      s = await T(frame, 'state'); assert.match(s.label, LABEL, s.label);
      if (i === 1) { const w = await frame.evaluate(() => { const c = document.querySelector('.ok-win .ok-card'), n = document.querySelector('.ok-win .ok-hot'); return { fits: c.scrollHeight <= c.clientHeight, nextBottom: n.getBoundingClientRect().bottom, portrait: !!c.querySelector('canvas') }; }); assert.ok(w.fits && w.nextBottom <= 390 && !w.portrait, 'landscape phone: the stars card fits with Next on screen ' + JSON.stringify(w)); }
      await T(frame, 'next');
      await frame.waitForFunction(() => !document.querySelector('.ok-win'));
    }
    s = await T(frame, 'state');
    assert.equal(s.label, '6/6 levels, 18 stars, 6/6 checks');
    assert.ok(s.modal, 'the bonus quest card');
    await T(frame, 'closeDialog');
    await frame.waitForFunction(() => window.__brbTest.state().chapter === 'hw-sw');
    s = await T(frame, 'state'); assert.equal(s.levelId, 'hwsw-1'); assert.deepEqual(s.chain, { ch: 'hw-sw', from: 1, to: 3 });
    if (s.modal) { await T(frame, 'closeDialog'); await frame.waitForFunction(() => !window.__brbTest.state().modal); }
    await T(frame, 'answer', solOf('hwsw-1'));
    await frame.waitForFunction(() => document.querySelector('.im-modal .im-check-tiles'));
    await T(frame, 'check', 0);
    await frame.waitForFunction(() => document.querySelector('.ok-win'));
    s = await T(frame, 'state');
    assert.equal(s.label, '6/6 levels, 21 stars, 7/7 checks', 'the chain adds stars; the label keeps the locked chapter');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
  // a Pro lesson boots in the bold style straight into the Pro Fix-It desk, band locked
  const pro = await open({ size: { width: 1180, height: 820 }, lang: 'en', params: { chapter: 'fixit', band: '2', lock: 1 } });
  try {
    await pro.frame.click('.ok-title-screen .ok-hot');
    await pro.frame.waitForFunction(() => window.__brbTest.state().screen === 'play');
    const s = await T(pro.frame, 'state');
    assert.equal(s.levelId, 'fixit-2-1'); assert.equal(s.band, '2'); assert.equal(s.kind, 'flow'); assert.equal(s.lock, true);
    assert.ok(s.modal, 'the learn card opens on level 1');
    assert.equal(await pro.frame.$('.im-seg'), null, 'no band toggle under lock');
    assert.deepEqual(pro.errors, []);
  } finally { await pro.ctx.close(); }
});

test('inside-the-machine: review round fixes in Chromium (Pro flowchart, stale timers, daily skip, switch row, phone pill, sim hints, keypad keys)', { skip, timeout: 180_000 }, async () => {
  const g = await open();
  const { frame, page } = g;
  const clear = async () => { for (let i = 0; i < 8; i++) { const s = await T(frame, 'state'); if (!s.modal && !s.kitOpen) return; await T(frame, 'closeDialog'); await frame.waitForTimeout(60); } };
  const panel = () => frame.evaluate(() => document.querySelector('.im-panel').textContent);
  try {
    // a too-short Pro flowchart goes back to the flowchart; no swap test runs before the cheap questions are all in
    await T(frame, 'start', { chapter: 'fixit', band: '2', level: 1, seed: 1 }); await clear();
    await T(frame, 'tap', 'power'); await frame.evaluate(() => document.querySelector('.im-actions .ok-hot').click());
    await frame.waitForFunction(() => window.__brbTest.state().fails === 1, null, { timeout: 5000 });
    assert.doesNotMatch(await panel(), /Swap one part/, 'no swap phase with questions missing');
    assert.match(await panel(), /Tap the questions in the order/);
    // a run left behind never touches the next level
    await T(frame, 'start', { chapter: 'fixit', band: '2', level: 1, seed: 1 }); await clear();
    await T(frame, 'realTime'); await T(frame, 'tap', 'queue'); await frame.evaluate(() => document.querySelector('.im-actions .ok-hot').click());
    await T(frame, 'map'); await T(frame, 'start', { chapter: 'parts', band: '2', level: 1, seed: 1 }); await clear();
    await frame.waitForTimeout(1500);
    let s = await T(frame, 'state'); assert.equal(s.fails, 0, 'no stale failRun on the new level'); assert.equal(s.levelId, 'parts-1');
    // the phone pill shows the level number only
    assert.equal(await frame.evaluate(() => getComputedStyle(document.querySelector('.im-top .im-pill > span')).display), 'none');
    // five switches sit on one row, each at least 44px tall
    await T(frame, 'start', { chapter: 'bits', band: '2', level: 1, seed: 1 }); await clear();
    const sw = await frame.evaluate(() => [...document.querySelectorAll('.im-sw')].map(w => ({ top: Math.round(w.getBoundingClientRect().top), h: w.querySelector('.ok-switch').getBoundingClientRect().height })));
    assert.equal(sw.length, 5); assert.equal(new Set(sw.map(x => x.top)).size, 1, 'one row'); for (const x of sw) assert.ok(x.h >= 44, 'a 44px switch');
    // the gadget test run takes no hint
    await T(frame, 'start', { chapter: 'gadget', band: '2', level: 1, seed: 1 }); await clear();
    await T(frame, 'realTime');
    for (const id of L.level('gadget-1').sol.picked) await T(frame, 'tap', id);
    await frame.evaluate(() => document.querySelector('.im-actions .ok-hot').click());
    s = await T(frame, 'state'); assert.equal(s.viewPhase, 'sim'); assert.equal(await T(frame, 'hint'), 0, 'no hint spent in the sim');
    // a skip during the daily never marks a chapter level done
    await T(frame, 'map'); await T(frame, 'daily'); await clear(); await T(frame, 'skip');
    assert.deepEqual((await T(frame, 'save')).skipped, {});
    // the quest-code keypad answers the keyboard
    await T(frame, 'map'); await T(frame, 'questCard'); await frame.waitForTimeout(100);
    for (const k of ['4', '1', '0']) await page.keyboard.press(k);
    assert.equal(await frame.evaluate(() => [...document.querySelectorAll('.im-slot')].map(x => x.textContent).join('')), '410·');
    await page.keyboard.press('Backspace');
    assert.equal(await frame.evaluate(() => [...document.querySelectorAll('.im-slot')].map(x => x.textContent).join('')), '41··');
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('inside-the-machine: the language packs load in Chromium (French and Arabic words appear, Arabic mirrors, numbers and bits stay left to right) and English runs without one', { skip, timeout: 180_000 }, async () => {
  const VER = PACK_VER, SRI = JSON.parse(HTML.match(/PACK_SRI = (\{[^;]*\});/)[1]);
  for (const l of ['pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) {
    const body = fs.readFileSync(path.join(ROOT, 'public/vendor/data/inside-the-machine', VER, l + '.js'));
    assert.equal('sha384-' + (await import('node:crypto')).createHash('sha384').update(body).digest('base64'), SRI[l], `${l}: the pack's checksum matches the game`);
  }
  for (const lang of ['fr', 'ar', 'en']) {
    const { ctx, frame, errors } = await open({ size: { width: 1180, height: 820 }, lang });
    try {
      await T(frame, 'start', {});
      const chaps = await frame.evaluate(() => [...document.querySelectorAll('.im-chap')].map(t => t.textContent));
      const want = lang === 'en' ? 'Fix-It Desk' : packOf(lang)['Fix-It Desk'];
      assert.ok(want && chaps.some(t => t.includes(want)), `${lang}: the map shows ${want} (${chaps.join(' | ')})`);
      assert.equal(await frame.evaluate(() => document.getElementById('im').dir), lang === 'ar' ? 'rtl' : 'ltr');
      await T(frame, 'start', { chapter: 'bits', band: '1b', level: 1 });
      const ltr = await frame.evaluate(() => [...document.querySelectorAll('.im-lv, .im-stars, .im-bitcard, [dir="ltr"]')].length);
      if (lang === 'ar') assert.ok(ltr > 0 && await frame.evaluate(() => [...document.querySelectorAll('[dir="ltr"]')].every(e => getComputedStyle(e).direction === 'ltr')), 'numbers and bits stay left to right');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});
