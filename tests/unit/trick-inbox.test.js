// Trick Inbox (Cyber Defenders Phase 2): the engine and every message are read from the game file itself (the
// classic script runs in a vm): the sets match the Phase 2 contract per band, every trick hides at least one clue
// and names a Unit 4 motive (the forwarder included), safe messages hide none, judging and stars follow the
// brief (a wrong Deliver on a trick is the star-costing move, and only that), the boss round matches the
// escape room's Lock 4 sizes, and the file itself passes the safety scanner on the pinned kit.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { kitTag, kitPackTag } = await import('../../server/services/kit.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/trick-inbox.html'), 'utf8');
const ctx = vm.createContext({});
for (const m of HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
const E = ctx.TrickInbox;
const J = v => JSON.parse(JSON.stringify(v));

test('trick-inbox: the exact kit 1.1.5 tag and its four packs, the metadata, and a clean scan', () => {
  assert.ok(HTML.startsWith('<title>Trick Inbox</title>'));
  assert.ok(HTML.includes(kitTag()), 'the byte-exact kit tag');
  for (const p of ['art-props', 'art-animals', 'art-school', 'style-bold']) assert.ok(HTML.includes(kitPackTag(p)), `${p} pack tag`);
  assert.ok(HTML.indexOf('<div id="game">') < HTML.indexOf(kitTag()), 'the game div comes before the kit');
  assert.ok(Buffer.byteLength(HTML) < 2 * 1024 * 1024);
  assert.equal(scanVersion(HTML).status, 'pass', JSON.stringify(scanVersion(HTML).issues));
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/trick-inbox.json'), 'utf8'));
  assert.equal(meta.slug, 'trick-inbox'); assert.equal(meta.title, 'Trick Inbox'); assert.equal(meta.cover, 'mint'); assert.equal(meta.category, 'learning');
  assert.equal(meta.featured, true); assert.equal(meta.orientation, 'any'); assert.equal(meta.players_max, 1); assert.equal(meta.age_rating, 'everyone');
  assert.ok(meta.description.length <= 600 && meta.description.length > 100);
  for (const l of ['pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) { const v = meta.l10n[l]; assert.ok(v && v.description && v.description.length > 60 && v.description.length <= 600, `l10n ${l} description`); assert.ok(v.tags && v.tags.length <= 200, `l10n ${l} tags`); assert.doesNotMatch(v.description + v.tags, /\d{7,}|@|https?:/, `l10n ${l} clean`); }
  assert.doesNotMatch(HTML, /\bsetTimeout\s*\(|\bsetInterval\s*\(|\bDate\.now\b|\brequestAnimationFrame\s*\(/, 'the game clock only');
  assert.doesNotMatch(HTML, /<input|<textarea|contenteditable/i, 'tap-only: no text inputs');
});

test('trick-inbox: the eleven sets and their band contract', () => {
  assert.deepEqual(J(E.SETS.map(s => s.id)), ['letters', 'chat', 'mix', 'senders', 'pressure', 'media', 'keys', 'private', 'ask-first', 'rules', 'boss']);
  E.SETS.forEach((s, i) => assert.equal(s.index, i + 1));
  for (const s of E.SETS) for (const band of s.bands) assert.ok(E.round(s.id, band, 1).length >= 6, `${s.id} ${band} has a full round`);
  // Explorer never sees the Pro-only sets; Pro sees everything
  assert.deepEqual(J(E.SETS.filter(s => s.bands.includes('1b')).map(s => s.id)), ['letters', 'chat', 'mix', 'keys', 'private', 'ask-first', 'rules', 'boss']);
  // the boss round is Lock 4's shape: Explorer 6, Pro 8 with a faked sender among them
  assert.equal(E.round('boss', '1b', 1).length, 6);
  const bossPro = E.round('boss', '2', 1);
  assert.equal(bossPro.length, 8);
  assert.ok(bossPro.some(m => m.set === 'senders'), 'the Pro boss includes a faked sender');
  // a round is deterministic per seed and a true shuffle of the set's band messages
  assert.deepEqual(J(E.round('letters', '1b', 3).map(m => m.id)), J(E.round('letters', '1b', 3).map(m => m.id)));
  assert.deepEqual(J(E.round('letters', '1b', 3).map(m => m.id).sort()), J(E.MESSAGES.filter(m => m.set === 'letters' && m.bands.includes('1b')).map(m => m.id).sort()));
});

test('trick-inbox: every message is well-formed, fictional and fairly judged', () => {
  const ids = new Set();
  for (const m of E.MESSAGES) {
    assert.ok(!ids.has(m.id), `${m.id} unique`); ids.add(m.id);
    assert.ok(E.SET_BY_ID[m.set], `${m.id}: set exists`);
    assert.ok(m.bands.length && m.bands.every(b => b === '1b' || b === '2'), `${m.id}: bands`);
    assert.ok(m.bands.every(b => E.SET_BY_ID[m.set].bands.includes(b)), `${m.id}: inside its set's bands`);
    assert.ok(E.ACTION_IDS.includes(m.action), `${m.id}: action`);
    for (const a of m.accept || []) { assert.ok(E.ACTION_IDS.includes(a) && a !== m.action, `${m.id}: accept ${a}`); }
    assert.ok(m.why && m.why.length > 40, `${m.id}: a kind explanation`);
    assert.doesNotMatch(JSON.stringify(m), /https?:|www\.|\.com\b|\.co\.uk\b/i, `${m.id}: no real addresses or links`);
    const clues = E.cluesOf(m);
    if (m.action === 'deliver') {
      assert.equal(m.motive, null, `${m.id}: a safe message has no motive`);
      assert.equal(clues.length, 0, `${m.id}: a safe message hides no clues`);
    } else {
      assert.ok(clues.length >= 1, `${m.id}: a trick hides at least one clue`);
      assert.ok(E.MOTIVES[m.motive], `${m.id}: motive ${m.motive} is one of Unit 4's four`);
      for (const c of clues) assert.ok(E.CLUES[c.kind], `${m.id}: clue kind ${c.kind} is named`);
    }
  }
  // every set and band mixes safe and trick, so Deliver is a real decision everywhere
  for (const s of E.SETS) for (const band of s.bands) {
    const ms = E.round(s.id, band, 1);
    assert.ok(ms.some(m => m.action === 'deliver'), `${s.id} ${band}: has a safe message`);
    assert.ok(ms.some(m => m.action !== 'deliver'), `${s.id} ${band}: has a trick`);
  }
  // all four Unit 4 motives appear in each band's playable content, the forwarder included
  for (const band of ['1b', '2']) {
    const motives = new Set(E.MESSAGES.filter(m => m.bands.includes(band) && m.motive).map(m => m.motive));
    assert.deepEqual([...motives].sort(), ['forwarder', 'giggler', 'key-hunter', 'prize-faker'], `${band} motives`);
  }
  // the response moves are all winnable somewhere: each of bin / show / report is a best move in both bands
  for (const band of ['1b', '2']) for (const a of ['bin', 'show', 'report']) assert.ok(E.MESSAGES.some(m => m.bands.includes(band) && m.action === a), `${band}: ${a} wins somewhere`);
});

test('trick-inbox: judging, the stamp-star rule, stars and the label', () => {
  const trick = E.BY_ID['lt-1'], safe = E.BY_ID['lt-2'];
  const all = E.cluesOf(trick).map(c => c.id);
  const perfect = E.judge(trick, all, 'bin');
  assert.deepEqual([perfect.right, perfect.best, perfect.deliveredTrick, perfect.points, perfect.max, perfect.missed.length], [true, true, false, perfect.max, 2 + all.length, 0]);
  const accepted = E.judge(trick, [], 'report');
  assert.deepEqual([accepted.right, accepted.best, accepted.points, accepted.missed.length], [true, false, 2, all.length], 'an accepted move is right but not best, and the missed clues are named');
  const delivered = E.judge(trick, all, 'deliver');
  assert.deepEqual([delivered.right, delivered.deliveredTrick], [false, true], 'delivering a trick is the star-costing move');
  const binned = E.judge(safe, [], 'bin');
  assert.deepEqual([binned.right, binned.deliveredTrick], [false, false], 'binning a safe message is wrong but costs no star');
  assert.equal(E.judge(safe, [], 'deliver').points, 2);
  // stars: score fraction, capped by the stamp-stars a wrong Deliver left standing, never below 1
  assert.equal(E.starsFor(20, 20, 3), 3);
  assert.equal(E.starsFor(20, 20, 1), 1, 'a lost stamp-star caps a perfect score');
  assert.equal(E.starsFor(12, 20, 3), 2);
  assert.equal(E.starsFor(0, 20, 3), 1, 'finishing a set always earns its star (no fail state)');
  assert.match(E.label(6, 6, 'messages', 3), E.LABEL_RE);
  assert.equal(E.label(6, 6, 'messages', 3), '6/6 messages, 3 stars');
});

test('trick-inbox: lesson params clean like Packet Post', () => {
  assert.deepEqual(J(E.cleanParams({ chapter: 'boss', band: '2', lock: '1' }, E.SETS)), { chapter: 'boss', band: '2', lock: 1, present: true });
  assert.deepEqual(J(E.cleanParams({ chapter: 'nope', band: '9', lock: 'x' }, E.SETS)), { lock: 0, present: false });
  assert.equal(E.cleanParams({}, E.SETS).present, false);
});
