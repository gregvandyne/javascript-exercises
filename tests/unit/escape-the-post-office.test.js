// Escape the Post Office (seed-games/escape-the-post-office.html): the Cyber Defenders finale (step 6.4, both
// bands). The pure engine is read from the game file itself (the classic script runs in a vm): every lock is
// solved by its advice() solver in both bands for several seeds, the empty run never opens a lock, wrong tries
// wobble but can never reach a fail state (the engine has no failed flag at all), locks open only in stamp
// order, the three hint feathers are capped and counted honestly on the shield, per-lock progress saves and
// restores, the shield's lock-to-standard mapping uses only codes in the course registry, kid text follows the
// course rules (Explorer carries no cyberbullying term or drill; Pro spells "defense"), and BRB.gameOver is
// called from exactly one place — the shield, after all six locks are open (win-gated completion).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/escape-the-post-office.html'), 'utf8');
const { kitTag, kitPackTag } = await import('../../server/services/kit.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const ctx = vm.createContext({});
for (const m of HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
const E = ctx.EscapePostOffice;
const J = v => JSON.parse(JSON.stringify(v));
const REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/cyber-defenders/standards.json'), 'utf8'));
const SEEDS = [1, 2, 3];

test('escape: the exact kit 1.1.3 tag and its four packs, the metadata, and a clean scan', () => {
  assert.ok(HTML.startsWith('<title>Escape the Post Office</title>'));
  assert.ok(HTML.includes(kitTag()), 'the byte-exact kit tag');
  for (const p of ['art-props', 'art-animals', 'art-school', 'style-bold']) assert.ok(HTML.includes(kitPackTag(p)), `${p} pack tag`);
  assert.ok(HTML.indexOf('<div id="game">') < HTML.indexOf(kitTag()), 'the game div comes before the kit');
  assert.ok(Buffer.byteLength(HTML) < 2 * 1024 * 1024);
  assert.equal(scanVersion(HTML).status, 'pass', JSON.stringify(scanVersion(HTML).issues));
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/escape-the-post-office.json'), 'utf8'));
  assert.equal(meta.slug, 'escape-the-post-office'); assert.equal(meta.title, 'Escape the Post Office'); assert.equal(meta.cover, 'gold');
  assert.equal(meta.category, 'learning'); assert.equal(meta.orientation, 'any'); assert.equal(meta.players_max, 1); assert.equal(meta.age_rating, 'everyone');
  assert.ok(meta.description.length <= 600 && meta.description.length > 100);
  assert.doesNotMatch(HTML, /\bsetTimeout\s*\(|\bsetInterval\s*\(|\bDate\.now\b|\brequestAnimationFrame\s*\(/, 'no clock anywhere: no timer can change the outcome');
  assert.doesNotMatch(HTML, /<input|<textarea|contenteditable/i, 'tap-only: no text inputs');
});

test('escape: six locks in stamp order, one per unit, with the brief mapping', () => {
  assert.deepEqual(J(E.LOCKS.map(l => [l.n, l.id, l.unit, l.stamp])), [
    [1, 'sorting-gate', 1, 'Roadwise'], [2, 'sealed-note', 2, 'Keykeeper'], [3, 'which-pim', 3, 'Private'],
    [4, 'trick-inbox', 4, 'Trickspotter'], [5, 'five-moves', 5, 'Kind Screen'], [6, 'layers', 6, 'Shield'],
  ]);
  for (const l of E.LOCKS) for (const band of ['1b', '2']) {
    assert.ok(l.intro[band] && l.hint[band] && l.skill && l.topic, `${l.id} ${band}: intro, hint, skill, topic`);
    for (const code of l.standards[band]) assert.ok(REGISTRY.cyberorgCodes[band].includes(code), `${l.id} ${band}: ${code} is in the course registry`);
  }
  // Lock 4 sizes per the brief: Explorer 6 items, Pro 8 including a faked sender.
  assert.equal(E.DATA['1b'].inbox.length, 6);
  assert.equal(E.DATA['2'].inbox.length, 8);
  assert.ok(E.DATA['2'].inbox.some(i => i.badge && /faked|hand stamp/i.test(i.badge + i.missed)), 'Pro carries a spoofed sender');
  // Explorer gentler clueing: the cipher's first letter is given, and there are fewer layers pairs.
  assert.equal(E.DATA['1b'].cipher.given, 1); assert.equal(E.DATA['2'].cipher.given, 0);
  assert.ok(E.DATA['1b'].layers.pairs.length < E.DATA['2'].layers.pairs.length);
});

test('escape: every lock is solvable by its solver in both bands; the empty run opens nothing', () => {
  for (const band of ['1b', '2']) for (const lock of E.LOCKS) for (const seed of SEEDS) {
    const r = E.solveRun(lock, band, seed);
    assert.ok(r.done, `${lock.id} ${band} seed ${seed}: solved`);
    const empty = new E.Run(lock, band, seed);
    assert.ok(!empty.done && empty.advice(), `${lock.id} ${band}: nothing done is not a solution, and advice exists`);
  }
  // the cipher round-trips at the authored shift, and only there
  for (const band of ['1b', '2']) { const c = E.DATA[band].cipher; const sealed = E.caesar(c.plain, c.shift); assert.equal(E.caesar(sealed, -c.shift), c.plain); for (let s = 0; s < 26; s++) if (s !== c.shift) assert.notEqual(E.caesar(sealed, -s), c.plain); }
});

test('escape: wrong tries wobble and can never fail or open a lock', () => {
  const wrong = { 'sorting-gate': { t: 'hop', id: 'S-D' }, 'sealed-note': { t: 'submit' }, 'which-pim': { t: 'submit' },
    'trick-inbox': { t: 'act', id: 'deliver' }, 'five-moves': null, 'layers': { t: 'match', id: 'vault' } };
  for (const band of ['1b', '2']) for (const lock of E.LOCKS) {
    const r = new E.Run(lock, band, 1);
    let a = wrong[lock.id];
    if (lock.id === 'trick-inbox' && band === '2') a = { t: 'act', id: 'deliver' }; // item 1 IS deliverable in both bands: use the debrief path below instead
    if (lock.id === 'five-moves') { const bad = E.DATA[band].moves.order[E.DATA[band].moves.order.length - 1]; a = { t: 'tap', id: bad }; }
    if (lock.id === 'layers') { const p = E.DATA[band].layers.pairs[0]; a = { t: 'match', id: E.DATA[band].layers.layers.find(l => l.id !== p.layer).id }; }
    if (lock.id === 'trick-inbox') { // first item's right answer is deliver in both bands; move to item 2 whose answer is not
      r.act({ t: 'act', id: E.DATA[band].inbox[0].action }); a = { t: 'act', id: 'deliver' };
    }
    const out = r.act(a);
    assert.equal(out.wobbled, true, `${lock.id} ${band}: a wrong try wobbles`);
    assert.ok(!r.done, `${lock.id} ${band}: a wrong try opens nothing`);
    assert.ok(!('failed' in r.s) && !JSON.stringify(r.snapshot()).includes('"failed":true'), `${lock.id} ${band}: no fail state exists`);
    // and the lock still solves afterwards (persistence is the skill)
    let guard = 0; while (!r.done && guard++ < 200) { const adv = r.advice(); if (!adv) break; r.act(adv); }
    assert.ok(r.done, `${lock.id} ${band}: still solvable after a wrong try`);
  }
  // a wrong inbox call shows the missed clue (the Trick Inbox debrief idiom)
  const r = new E.Run(E.LOCKS[3], '1b', 1); r.act({ t: 'act', id: 'deliver' }); const out = r.act({ t: 'act', id: 'deliver' });
  assert.ok(out.note.includes(E.DATA['1b'].inbox[1].missed.slice(0, 20)), 'the debrief names the missed clue');
});

test('escape: the room opens locks only in stamp order, saves per lock, and resumes', () => {
  for (const band of ['1b', '2']) {
    const esc = new E.Escape(band, 1);
    assert.equal(esc.act('sealed-note', { t: 'submit' }).ok, false, 'lock 2 waits for lock 1');
    let guard = 0;
    while (!esc.escaped && guard++ < 12) { const cur = esc.current(); const run = esc.run(cur.id); let g2 = 0; while (!run.done && g2++ < 200) { const a = run.advice(); if (!a) break; esc.act(cur.id, a); } assert.ok(run.done, `${band}: ${cur.id} opened`); }
    assert.ok(esc.escaped, `${band}: the whole room solves end to end`);
    // resume: a saved half-open room restores its open locks and hint count
    const half = new E.Escape(band, 1); const first = half.current(); const run = half.run(first.id); let g = 0; while (!run.done && g++ < 200) half.act(first.id, run.advice());
    half.useHint('sealed-note');
    const back = new E.Escape(band, 1).restore(JSON.parse(JSON.stringify(half.save())));
    assert.deepEqual(J(back.open), ['sorting-gate'], `${band}: per-lock progress restored`);
    assert.equal(back.hintsUsed, 1); assert.equal(back.current().id, 'sealed-note');
  }
});

test('escape: three hint feathers for the whole room, one per lock, counted honestly on the shield', () => {
  const esc = new E.Escape('1b', 1);
  assert.equal(esc.hintLine(), 'Escaped with no hints');
  assert.ok(esc.useHint('sorting-gate').ok); assert.equal(esc.useHint('sorting-gate').ok, false, 'one feather per lock');
  assert.ok(esc.useHint('sealed-note').ok); assert.ok(esc.useHint('which-pim').ok);
  assert.equal(esc.feathersLeft, 0);
  assert.equal(esc.useHint('trick-inbox').ok, false, 'the fourth feather does not exist');
  assert.equal(esc.hintsUsed, 3); assert.equal(esc.hintLine(), 'Escaped with 3 hints');
  const one = new E.Escape('2', 1); one.useHint('layers'); assert.equal(one.hintLine(), 'Escaped with 1 hint');
  const shield = esc.shield();
  assert.equal(shield.length, 6); assert.ok(shield.every(r => r.lock && r.stamp && r.skill && r.standards.length && r.topic), 'the shield maps every lock to its skill and standards');
});

test('escape: kid text follows the course rules in both bands', () => {
  const all = JSON.stringify(E.LOCKS) + JSON.stringify(E.DATA);
  assert.doesNotMatch(all, /password|https?:|@|\d{7,}|grown-up/i, 'no real-key wording, no links, no addresses');
  const explorer = JSON.stringify(E.LOCKS.map(l => [l.intro['1b'], l.hint['1b']])) + JSON.stringify(E.DATA['1b']);
  assert.doesNotMatch(explorer, /cyberbullying/i, 'Explorer stays slim: kindness and tell-an-adult, never the term or the drill');
  assert.match(JSON.stringify(E.LOCKS[5].intro['2']), /Defense in depth/, 'Pro spells defense the US way');
  assert.doesNotMatch(all, /defence/i, 'no British spelling anywhere in the game data');
});

test('escape: completion is win-gated — BRB.gameOver is called once, from the shield', () => {
  const mod = HTML.slice(HTML.indexOf('<script type="module">'));
  assert.equal((mod.match(/BRB\.gameOver\(\{/g) || []).length, 1, 'exactly one gameOver call site');
  assert.ok(mod.indexOf('BRB.gameOver({') > mod.indexOf('function showShield'), 'the only call sits in the shield, which needs all six locks');
  assert.ok(mod.includes("storeKey: 'escape-the-post-office-v1'"), 'per-lock progress saves under its own key');
  assert.ok(mod.includes("species: 'owl'") && mod.includes("wear: ['backpack']") && mod.includes("base: 'cocoa'"), "Pim keeps Packet Post's own look: extracted, never redrawn");
});
