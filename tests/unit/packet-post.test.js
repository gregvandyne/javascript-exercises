// Packet Post (seed-games/packet-post.html): Netville's postal network for CS Quest unit 4. The engine and every level
// are read from the game file itself (the classic scripts run in a vm): every level is solved by its sol for several
// seeds within par, the empty run never passes, the chapters match the contract per band, every CSTA id exists, the
// progress label and the class quest number follow their grammar, the ciphers round-trip, and every English string is
// listed for the language packs.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { loadData, collect, screenWords, EN } = await import('../../scripts/packet-post-strings.mjs');
const { kitTag, kitPackTag } = await import('../../server/services/kit.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/packet-post.html'), 'utf8');
const { E, D } = loadData(HTML);
const { LEVELS, CHAPTERS, THEN, WORDS } = D;
const CSTA = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/csta-2017.json'), 'utf8')).standards.map(s => s.id));
const SEEDS = [1, 2, 3, 4, 5, 6];
const J = v => JSON.parse(JSON.stringify(v));   // values from the vm realm: compare by structure, not prototype
const levelsFor = (ch, band) => LEVELS.filter(l => l.ch === ch && l.bands.includes(band));
// the contract: levels per chapter and band
const CONTRACT = { packets: { '1b': 5, '2': 5 }, routes: { '1b': 4, '2': 6 }, protocols: { '1b': 2, '2': 6 }, locks: { '1b': 6, '2': 7 }, tricks: { '1b': 6, '2': 10 }, ciphers: { '1b': 3, '2': 7 } };
// the standards each chapter claims per band (the contract); a level's csta (Explorer) / csta2 (Pro) stay inside them
const CHAPTER_CSTA = { packets: { '1b': ['1B-NI-04'], '2': ['2-NI-04'] }, routes: { '1b': ['1B-NI-04'], '2': ['2-NI-04'] }, protocols: { '1b': ['1B-NI-04'], '2': ['2-NI-04'] }, locks: { '1b': ['1B-NI-05'], '2': ['2-NI-05', '2-IC-23'] }, tricks: { '1b': ['1B-NI-05'], '2': ['2-NI-05', '2-IC-23'] }, ciphers: { '1b': [], '2': ['2-NI-06'] } };
const cstaFor = (l, band) => (band === '2' ? (l.csta2 || l.csta) : l.csta) || [];

test('packet-post: the exact kit 1.1.2 tag and its four packs, the metadata, and a clean scan', () => {
  assert.ok(HTML.startsWith('<title>Packet Post</title>'));
  assert.ok(HTML.includes(kitTag()), 'the byte-exact kit tag');
  for (const p of ['art-props', 'art-animals', 'art-school', 'style-bold']) assert.ok(HTML.includes(kitPackTag(p)), `${p} pack tag`);
  assert.ok(HTML.indexOf('<div id="game">') < HTML.indexOf(kitTag()), 'the game div comes before the kit');
  assert.ok(Buffer.byteLength(HTML) < 2 * 1024 * 1024);
  assert.equal(scanVersion(HTML).status, 'pass', JSON.stringify(scanVersion(HTML).issues));
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/packet-post.json'), 'utf8'));
  assert.equal(meta.slug, 'packet-post'); assert.equal(meta.title, 'Packet Post'); assert.equal(meta.cover, 'gold'); assert.equal(meta.category, 'learning');
  assert.equal(meta.featured, true); assert.equal(meta.orientation, 'any'); assert.equal(meta.players_max, 1); assert.equal(meta.age_rating, 'everyone');
  assert.ok(meta.description.length <= 600 && meta.description.length > 100);
  for (const l of ['pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) { const v = meta.l10n[l]; assert.ok(v && v.description && v.description.length > 60 && v.description.length <= 600, `l10n ${l} description`); assert.ok(v.tags && v.tags.length <= 200, `l10n ${l} tags`); assert.doesNotMatch(v.description + v.tags, /\d{7,}|@|https?:/, `l10n ${l} clean`); }
  assert.doesNotMatch(HTML, /\bsetTimeout\s*\(|\bsetInterval\s*\(|\bDate\.now\b|\brequestAnimationFrame\s*\(/, 'the game clock only');
  assert.doesNotMatch(HTML, /<input|<textarea|contenteditable/i, 'tap-only: no text inputs');
});

test('packet-post: chapters and levels match the contract, every CSTA id exists, every level has its texts', () => {
  assert.deepEqual(J(CHAPTERS.map(c => c.id)), ['packets', 'routes', 'protocols', 'locks', 'tricks', 'ciphers']);
  CHAPTERS.forEach((c, i) => assert.equal(c.index, i + 1));
  for (const [ch, bands] of Object.entries(CONTRACT)) for (const [band, n] of Object.entries(bands)) assert.equal(levelsFor(ch, band).length, n, `${ch} ${band}`);
  const ids = new Set();
  for (const l of LEVELS) {
    assert.ok(!ids.has(l.id), `${l.id} unique`); ids.add(l.id);
    assert.ok(CHAPTERS.some(c => c.id === l.ch), `${l.id}: chapter`);
    assert.ok(l.bands.length && l.bands.every(b => b === '1b' || b === '2'), `${l.id}: bands`);
    for (const id of [].concat(l.csta || [], l.csta2 || [])) assert.ok(CSTA.has(id), `${l.id}: CSTA ${id}`);
    assert.ok(Array.isArray(l.csta), `${l.id}: csta`);
    for (const band of l.bands) { const ids = cstaFor(l, band), allowed = CHAPTER_CSTA[l.ch][band]; if (allowed.length) assert.ok(ids.length, `${l.id} ${band}: claims a standard`); for (const id of ids) assert.ok(allowed.includes(id), `${l.id} ${band}: ${id} is one of the chapter's standards`); }
    if (l.bands.includes('1b') && l.bands.includes('2')) assert.ok(l.csta2 && l.csta2.length, `${l.id}: a shared level names its level 2 standard too`);
    assert.ok(Array.isArray(l.hints) && l.hints.length === 3 && l.hints.every(h => typeof h === 'string' && h.length > 10), `${l.id}: 3 hint tiers`);
    assert.ok(l.check && l.check.q && l.check.tiles.length === 3 && l.check.answer >= 0 && l.check.answer < 3, `${l.id}: Case-closed check`);
    assert.ok(l.intro && l.par > 0 && l.sol != null, `${l.id}: intro, par, sol`);
    assert.doesNotMatch(JSON.stringify(l), /\bcodes?\b|password|https?:|@|\d{7,}/i, `${l.id}: scanner-safe wording`);
  }
  // level 1 of every chapter (per band) opens a learn card
  for (const c of CHAPTERS) for (const band of ['1b', '2']) { const ls = levelsFor(c.id, band); if (ls.length) assert.ok(ls[0].learn && ls[0].learn.title && ls[0].learn.text, `${c.id} ${band}: learn card on level 1`); }
  // every chapter's standards are claimed by at least one of its levels in the band
  for (const [ch, bands] of Object.entries(CHAPTER_CSTA)) for (const [band, ids] of Object.entries(bands)) for (const id of ids) assert.ok(levelsFor(ch, band).some(l => cstaFor(l, band).includes(id)), `${ch} ${band}: a level claims ${id}`);
  // chains: every then names a chapter that exists for the band, its levels exist, and (CI clause f') the lessons' standards sit inside the chapter and its chain
  assert.deepEqual(J(THEN), { '1b': { packets: { ch: 'routes' }, tricks: { ch: 'ciphers', levels: [1, 3] } }, '2': { protocols: { ch: 'routes', levels: [5, 6] }, ciphers: { ch: 'tricks', levels: [7, 10] } } });
  for (const [band, map] of Object.entries(THEN)) for (const [from, t] of Object.entries(map)) { assert.ok(CHAPTERS.some(c => c.id === from) && CHAPTERS.some(c => c.id === t.ch), `${band} ${from} -> ${t.ch}`); if (t.levels) assert.ok(levelsFor(t.ch, band).length >= t.levels[1], `${band} ${from} -> ${t.ch} ${t.levels}`); }
  for (const [band, ch, standards] of [['1b', 'packets', ['1B-NI-04']], ['2', 'protocols', ['2-NI-04']], ['1b', 'locks', ['1B-NI-05']], ['2', 'locks', ['2-NI-05', '2-IC-23']], ['1b', 'tricks', ['1B-NI-05']], ['2', 'ciphers', ['2-NI-06']]]) { const union = new Set(CHAPTER_CSTA[ch][band].concat(THEN[band][ch] ? CHAPTER_CSTA[THEN[band][ch].ch][band] : [])); for (const id of standards) assert.ok(union.has(id), `lesson ${band} ${ch}: ${id}`); }
  // the tricks chapter counts cards; the Explorer cipher levels are enrichment (no 1B id claimed)
  assert.equal(CHAPTERS.find(c => c.id === 'tricks').noun, 'cards'); assert.deepEqual(J(CHAPTERS.find(c => c.id === 'ciphers').enrichment), ['1b']);
  for (const l of levelsFor('ciphers', '1b')) assert.deepEqual(J(l.csta), []);
  // the special levels the plan names: Share or Shield (six facts with a good side, a risk and a reason), the twelve measures, the sealed street, the two-key lockbox
  const sos = LEVELS.find(l => l.id === 'lk-11'); assert.equal(sos.items.length, 6); for (const t of sos.items) assert.ok(t.benefit && t.risk && t.reasons.length === 3 && ['public', 'private'].includes(t.bin), t.id);
  assert.equal(LEVELS.find(l => l.id === 'lk-7').items.length, 12); assert.ok(LEVELS.find(l => l.id === 'lk-8').secret); assert.ok(LEVELS.find(l => l.id === 'ci-7').items.some(t => /lockbox/.test(t.text)));
  for (const l of LEVELS.filter(l => l.type === 'inbox')) { assert.ok(l.cues.length >= 3 && l.cues.length <= 4 && ['safe', 'trick'].includes(l.verdict), l.id); if (l.verdict === 'trick') assert.ok(l.cues.filter(c => c.trick).length >= 2 && l.cues.some(c => !c.trick), `${l.id}: trick cues and one honest one`); else assert.ok(l.cues.every(c => !c.trick), `${l.id}: a friendly letter has no trick cue`); }
  assert.ok(levelsFor('tricks', '1b').some(l => l.verdict === 'safe'), 'a friendly-but-odd letter guards against false positives');
});

test('packet-post: every level is solved by its sol for several seeds, well made and within par; the empty run never passes', () => {
  for (const l of LEVELS) for (const seed of SEEDS) {
    const actions = E.solve(l, seed), run = E.play(l, actions, seed);
    assert.ok(run.done, `${l.id} seed ${seed}: solved (${run.s.phase} ${run.s.fails})`);
    assert.ok(run.quality(), `${l.id} seed ${seed}: well made`);
    assert.equal(run.stars(), 3, `${l.id} seed ${seed}: three stars without a tier-3 hint`);
    assert.equal(run.stars(false), 2, `${l.id} seed ${seed}: a tier-3 hint costs the third star`);
    assert.ok(E.Run.cost(run) <= l.par, `${l.id} seed ${seed}: par ${l.par} >= cost ${E.Run.cost(run)}`);
    const empty = E.play(l, [], seed); assert.ok(!empty.done, `${l.id}: nothing done is not a solution`);
    assert.equal(empty.stars(), 0);
    const st = E.starter(l); if (st) { const run2 = E.play(l, st, seed); assert.ok(!run2.done, `${l.id} seed ${seed}: the starter does not solve it`); }
  }
  assert.ok(LEVELS.filter(l => l.starter != null).length >= 12, 'starters where the plan has a tempting wrong first try');
});

test('packet-post: a wasted hop, a wrong placement or an extra rule costs the second star; a budget or a snoop fails the run', () => {
  const pk3 = LEVELS.find(l => l.id === 'pk-3'), rt5 = LEVELS.find(l => l.id === 'rt-5'), rt6 = LEVELS.find(l => l.id === 'rt-6'), pr7 = LEVELS.find(l => l.id === 'pr-7'), pr5 = LEVELS.find(l => l.id === 'pr-5');
  // the detour: three hops instead of two for the first packet
  let run = E.play(pk3, [{ t: 'hop', id: 'S-B' }, { t: 'hop', id: 'B-C' }, { t: 'hop', id: 'C-D' }].concat(E.solve(pk3, 1).slice(2)), 1);
  assert.ok(run.done && !run.quality() && run.stars() === 2, 'the long way round is solved with two stars');
  // placing out of order
  run = new E.Run(pk3, 1); for (const a of E.solve(pk3, 1)) { if (a.t === 'place' && a.n === 1) { assert.ok(run.place(2).wrong); } run.act(a); }
  assert.ok(run.done && run.s.wrong === 1 && !run.quality());
  // a closed road bounces the packet
  const rt1 = LEVELS.find(l => l.id === 'rt-1'); run = new E.Run(rt1, 1); let tried = false;
  for (const a of E.solve(rt1, 1)) { if (run.s.i === 3 && run.s.at === 'S' && !tried) { tried = true; assert.ok(run.hop('S-A').moved); assert.ok(run.hop('A-D').bounced, 'the hill road is closed after two packets'); assert.ok(run.hop('S-A').moved, 'back to the post office'); } run.act(a); }
  assert.ok(tried && run.done && run.s.bounced === 1 && !run.quality() && run.stars() === 2, 'a bounce and the wasted hops cost the second star');
  // the hop budget
  run = new E.Run(rt5, 1); let guard = 0; while (!run.failed && !run.done && guard++ < 50) { const l = run.linksAt(run.s.at).find(x => !run.closed(x)); run.hop(l.id); }
  assert.ok(run.failed && run.s.fails.includes('hops'), 'wandering runs out of hops');
  // the snoopy cat on an open road
  run = new E.Run(rt6, 1); run.hop('S-B'); run.hop('B-D');
  assert.ok(run.failed && run.s.fails.includes('peeked'), 'a secret on an open road is read');
  // one rule too many
  run = E.play(pr7, [{ t: 'toggle', id: 'number' }, { t: 'toggle', id: 'ack' }, { t: 'toggle', id: 'resend' }, { t: 'toggle', id: 'discard' }, { t: 'toggle', id: 'wait' }, { t: 'submit' }], 1);
  assert.ok(run.failed && run.s.fails.includes('budget'));
  assert.ok(run.retry() && run.toggle('wait').chosen.length === 4 && run.submit().done, 'drop the extra rule and the set works');
  // a missed damaged packet
  run = new E.Run(pr5, 2); const r = run.submit(); assert.ok(r.failed && r.missed.length === 2, 'two damaged packets were not flagged');
  assert.ok(run.retry()); for (const n of run.inst.damaged) run.flag(n); assert.ok(run.submit().done);
});

test('packet-post: random levels change with the seed and the routing solver proves every layout deliverable', () => {
  const randoms = LEVELS.filter(l => l.random);
  assert.ok(randoms.length >= 5, 'several random layouts');
  for (const l of randoms) {
    const insts = SEEDS.map(s => E.instance(l, s));
    const keys = new Set(insts.map(i => JSON.stringify([Object.values(i.nodes).map(n => [n.x, n.y, n.busy]), Object.values(i.links).map(x => x.closedAfter), i.picture, i.damaged, i.shown])));
    assert.ok(keys.size >= 2, `${l.id}: different seeds deal different maps`);
    assert.deepEqual(J(E.instance(l, 3).nodes), J(E.instance(l, 3).nodes), `${l.id}: the same seed deals the same map`);
    for (const seed of SEEDS) { const run = new E.Run(l, seed); if (run.type === 'route') { assert.ok(run.bestPath(run.inst.from, run.inst.to), `${l.id} seed ${seed}: a path exists`); } }
  }
});

test('packet-post: the progress label grammar, the class quest number and the params', () => {
  const RE = /^\d{1,2}\/\d{1,2} (levels|cases|tickets|cards), \d{1,3} stars(, \d{1,2}\/\d{1,2} checks)?$/;
  for (const [args, want] of [[[0, 5, 'levels', 0, null], '0/5 levels, 0 stars'], [[5, 7, 'levels', 12, { ok: 4, n: 5 }], '5/7 levels, 12 stars, 4/5 checks'], [[10, 10, 'cards', 30, { ok: 0, n: 0 }], '10/10 cards, 30 stars']]) {
    const s = E.label(...args); assert.equal(s, want); assert.match(s, RE); assert.ok(s.length <= 40 && /^[\x20-\x7e]+$/.test(s));
  }
  assert.deepEqual(J(E.questCode('1100', CHAPTERS)), { chapter: 'packets', band: '1b', mode: 'play', level: 0 });
  assert.deepEqual(J(E.questCode('3200', CHAPTERS)), { chapter: 'protocols', band: '2', mode: 'play', level: 0 });
  assert.deepEqual(J(E.questCode('0230', CHAPTERS)), { chapter: null, band: '2', mode: 'projector', level: 0 });
  assert.deepEqual(J(E.questCode('6225', CHAPTERS)), { chapter: 'ciphers', band: '2', mode: 'wheel', level: 5 });
  for (const bad of ['7100', '1300', '1190', '1150', '1110', '110', '11000', 'abcd', '']) assert.equal(E.questCode(bad, CHAPTERS), null, bad);
  // the quest number round-trips through its digits (chapter, band, mode, level), and the lessons' numbers point where the contract says
  for (const q of [{ chapter: 'packets', band: '1b', mode: 'play', level: 0 }, { chapter: 'protocols', band: '2', mode: 'play', level: 0 }, { chapter: 'locks', band: '1b', mode: 'play', level: 0 }, { chapter: 'locks', band: '2', mode: 'play', level: 0 }, { chapter: 'tricks', band: '1b', mode: 'play', level: 0 }, { chapter: 'ciphers', band: '2', mode: 'play', level: 0 }, { chapter: null, band: '2', mode: 'projector', level: 0 }, { chapter: 'ciphers', band: '2', mode: 'wheel', level: 5 }]) { const d = E.questDigits(q, CHAPTERS); assert.match(d, /^\d{4}$/); assert.deepEqual(J(E.questCode(d, CHAPTERS)), q); }
  assert.deepEqual([['packets', '1b'], ['protocols', '2'], ['locks', '1b'], ['locks', '2'], ['tricks', '1b'], ['ciphers', '2']].map(([c, b]) => E.questDigits({ chapter: c, band: b }, CHAPTERS)), ['1100', '3200', '4100', '4200', '5100', '6200']);
  // the Daily Crew Challenge: the same level and seed for everyone on one day, a different one on most other days, always a random level of the band
  for (const band of ['1b', '2']) { const a = E.daily(LEVELS, band, 20760), b = E.daily(LEVELS, band, 20760); assert.equal(a.level.id, b.level.id); assert.equal(a.seed, b.seed); assert.ok(a.level.random && a.level.bands.includes(band)); const ids = new Set([20760, 20761, 20762, 20763, 20764, 20765, 20766].map(d => E.daily(LEVELS, band, d).level.id)); assert.ok(ids.size >= 3, `${band}: the daily moves around (${[...ids]})`); }
  assert.deepEqual(J(E.cleanParams({ chapter: 'packets', band: '1b', lock: 1 }, CHAPTERS)), { chapter: 'packets', band: '1b', lock: 1, present: true });
  assert.deepEqual(J(E.cleanParams({ chapter: 'protocols', band: '2', level: 3, lock: '0', mode: 'projector' }, CHAPTERS)), { chapter: 'protocols', band: '2', level: 3, mode: 'projector', lock: 0, present: true });
  assert.deepEqual(J(E.cleanParams({ chapter: 'nope', band: '9', level: 99, mode: 'fly' }, CHAPTERS)), { lock: 0, present: false });   // nothing valid: no lesson mode
  assert.equal(E.cleanParams({ level: '31' }, CHAPTERS).present, false);
  assert.deepEqual(J(E.cleanParams(undefined, CHAPTERS)), { lock: 0, present: false });
  assert.match(HTML, /\(window\.BRB && BRB\.params\) \|\| \{\}/, 'reads BRB.params defensively');
  assert.match(HTML, /BRB\.score\.submit\(score, lab\)/); assert.match(HTML, /w\.win\(\{/);
});

test('packet-post: the ciphers round-trip and the shift can be cracked by counting E', () => {
  assert.equal(E.caesar('HELLO', 3), 'KHOOR'); assert.equal(E.caesar('KHOOR', -3), 'HELLO'); assert.equal(E.caesar('xyz', 2), 'ZAB');
  const key = 'QWERTYUIOPASDFGHJKLZXCVBNM';
  for (const w of ['APPLE', 'NETVILLE', 'PACKET POST']) { assert.equal(E.substitute(E.substitute(w, key), key, true), w); assert.equal(E.caesar(E.caesar(w, 11), 15), w); }
  assert.equal(E.guessShift(E.caesar('THE EAGLE SEES THE SEA EVERY EVENING', 7)), 7);
  assert.deepEqual(E.readBits(E.hideBits([200, 201, 202, 203, 10], [1, 0, 1, 1]), 4), [1, 0, 1, 1]);
  assert.deepEqual(E.hideBits([200, 201, 202, 203, 10], [1, 0, 1, 1]).slice(4), [10]);
  // every cipher level round-trips: its cipher text decodes back to its plain text with its own shift or key, for every seed
  for (const l of LEVELS.filter(l => l.type === 'cipher')) for (const seed of SEEDS) { const I = E.instance(l, seed); assert.equal(I.kind === 'keyed' ? E.substitute(I.cipher, I.key, true) : E.caesar(I.cipher, -I.shift), I.plain, `${l.id} seed ${seed}`); assert.ok(I.plain.length >= 4 && /^[A-Z ]+$/.test(I.plain), `${l.id}: a plain word from the list`); if (I.mode === 'crack') assert.equal(E.guessShift(I.cipher), I.shift, `${l.id} seed ${seed}: E is the most common letter`); if (I.choices) { assert.equal(new Set(I.choices).size, 3); assert.equal(I.choices[I.answer], I.mode === 'encode' ? I.cipher : I.plain); } if (I.mode !== 'encode' && !I.choices) assert.notEqual(I.startShift, I.shift, `${l.id} seed ${seed}: the wheel does not start on the answer`); }
  for (const l of LEVELS.filter(l => l.type === 'pixel')) for (const seed of SEEDS) { const I = E.instance(l, seed); assert.equal(I.target.length, I.w * I.h); assert.deepEqual(E.readBits(E.hideBits(I.values, I.target), I.target.length), I.target, `${l.id}: the picture hides in the last bits`); }
});

test('packet-post: the cipher word list is screened by all 25 shifts against the profanity lists of every language', () => {
  assert.ok(WORDS.length >= 10 && WORDS.every(w => /^[A-Z ]+$/.test(w)), 'capital letters and spaces only');
  const bad = screenWords(HTML);
  assert.deepEqual(bad, [], 'no shift of any cipher word hits a blocklist');
  // the screening itself works: a word whose shift is a blocked word is caught (shift 1 of ONQM)
  const { profanityMatch } = require('../../server/services/textfilter.js');
  assert.ok(profanityMatch(E.caesar('ONQM', 1)), 'the screening catches a shifted bad word');
});

test('packet-post: every English string is listed in en.json, inside the budget', () => {
  const c = collect(HTML), all = c.chrome.concat(c.prose);
  assert.ok(c.chrome.length <= 450, `chrome strings ${c.chrome.length} <= 450`);
  assert.ok(all.length <= 1450, `all strings ${all.length} <= 1450`);
  const en = JSON.parse(fs.readFileSync(EN, 'utf8')).strings;
  const have = new Set(en);
  for (const s of all) assert.ok(have.has(s), `en.json lists: ${s}`);
  assert.equal(en.length, new Set(en).size, 'no duplicates');
  assert.deepEqual(en, all, 'en.json is current (node scripts/packet-post-strings.mjs)');
  for (const s of all) { assert.doesNotMatch(s, /\d{7,}|@|https?:|\/\/\w+\./, s); assert.doesNotMatch(s, /\bcodes?\b|password/i, `never the word code or password: ${s}`); assert.doesNotMatch(s, /(enter|type|what's|tell us) (your|ur) (real name|full name|address|phone|email|school|age|birthday|password)/i, `no personal prompt: ${s}`); }
  assert.ok(c.prose.length <= 1000, `level text ${c.prose.length} <= 1000`);
  // every key with {slots} is used with those slots in the game
  for (const s of c.chrome) for (const slot of s.match(/\{\w+\}/g) || []) assert.ok(/^\{[a-z]+\}$/.test(slot), `${s}: simple slots`);
});

// The engine's other level types (the Lock It, Spot the Trick and Secret Messages chapters land in the next stage): a
// share-or-keep sort with reason tiles, the passphrase builder and its meter, an inbox letter with cue chips, the
// Caesar wheel (decode, encode, crack) and a keyed card, the pixel grid (hide and read).
const FIX = {
  sort: { id: 'fx-sort', type: 'sort', par: 5, random: true, bins: [{ id: 'share', label: 'Share' }, { id: 'keep', label: 'Keep' }],
    items: [{ id: 'color', text: 'favorite color', bin: 'share' }, { id: 'addr', text: 'home address', bin: 'keep' }, { id: 'pet', text: 'a drawing of your pet', bin: 'share', reasons: ['It tells nobody where you live', 'It is a secret', 'Drawings are boring'], answer: 0 }] },
  pass: { id: 'fx-pass', type: 'pass', par: 5, need: 4, words: [{ id: 'a', text: 'purple' }, { id: 'b', text: 'volcano' }, { id: 'c', text: 'teapot' }, { id: 'd', text: 'giraffe' }, { id: 'e', text: 'my birthday', weak: true }, { id: 'f', text: 'the name of my pet', weak: true }, { id: 'g', text: 'ok' }, { id: 'h', text: 'bicycle' }] },
  inbox: { id: 'fx-inbox', type: 'inbox', par: 3, from: 'Prize Team', subject: 'You won!', body: 'Reply with your mailbox key in the next ten minutes to claim your prize.', button: 'Claim now', verdict: 'trick',
    cues: [{ id: 'hurry', text: 'Hurry! Only ten minutes', trick: true }, { id: 'key', text: 'Asks for the mailbox key', trick: true }, { id: 'hello', text: 'Says hello', trick: false }] },
  friendly: { id: 'fx-friendly', type: 'inbox', par: 1, from: 'Your teacher', subject: 'Field trip', body: 'Bring a packed lunch on Friday.', verdict: 'safe', cues: [{ id: 'lunch', text: 'Mentions lunch', trick: false }] },
  decode: { id: 'fx-decode', type: 'cipher', par: 2, kind: 'caesar', mode: 'decode', plain: 'APPLE', shift: 4 },
  encode: { id: 'fx-encode', type: 'cipher', par: 1, kind: 'caesar', mode: 'encode', plain: 'MOON', shift: 2 },
  crack: { id: 'fx-crack', type: 'cipher', par: 3, kind: 'caesar', mode: 'crack', plain: 'THE EAGLE SEES THE SEA EVERY EVENING', random: true },
  keyed: { id: 'fx-keyed', type: 'cipher', par: 1, kind: 'keyed', mode: 'decode', plain: 'TOWER', key: 'QWERTYUIOPASDFGHJKLZXCVBNM' },
  hide: { id: 'fx-hide', type: 'pixel', par: 40, w: 4, h: 3, mode: 'hide', random: true, target: [1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1] },
  read: { id: 'fx-read', type: 'pixel', par: 8, w: 4, h: 3, mode: 'read', target: [0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0] },
};

test('packet-post: the sort, passphrase, inbox, cipher and pixel run types solve, score and fail the way the chapters need', () => {
  for (const [name, fx] of Object.entries(FIX)) for (const seed of SEEDS) {
    const run = E.play(fx, E.solve(fx, seed), seed);
    assert.ok(run.done, `${name} seed ${seed}: solved (${run.s.phase} ${run.s.fails})`);
    assert.ok(run.quality(), `${name} seed ${seed}: well made`);
    assert.ok(E.Run.cost(run) <= fx.par, `${name}: par ${fx.par} >= cost ${E.Run.cost(run)}`);
    assert.ok(!E.play(fx, [], seed).done, `${name}: nothing done is not a solution`);
  }
  // sort: a wrong bin and a wrong reason cost the second star, the item waits
  let run = new E.Run(FIX.sort, 1);
  assert.ok(run.bin('addr', 'share').wrong && run.s.assigned.addr == null); assert.ok(run.bin('addr', 'keep').binned);
  assert.ok(run.bin('pet', 'share').why, 'a Share or Shield item asks why'); assert.ok(run.why('pet', 2).wrong); assert.ok(run.why('pet', 0).why); assert.ok(run.bin('color', 'share').done);
  assert.ok(run.done && !run.quality() && run.stars() === 2);
  // pass: the meter grows with letters, a weak word spoils it, four strong words lock in
  run = new E.Run(FIX.pass, 1);
  assert.equal(run.strength().tier, 0); run.pick('g'); assert.equal(run.strength().tier, 0); run.pick('a'); assert.equal(run.strength().tier, 2, 'ok + purple: 8 letters, a few days');
  run.pick('e'); assert.ok(run.strength().weak && run.strength().tier === 0, 'my birthday makes it weak');
  run.pick('b'); assert.ok(run.submit().failed && run.s.fails.includes('weak')); assert.ok(run.retry());
  run.pick('e'); run.pick('c'); assert.equal(run.strength().count, 4); assert.ok(run.strength().tier >= 3); assert.ok(run.submit().done);
  assert.ok(run.done && !run.quality(), 'a failed lock-in costs the second star');
  assert.ok(new E.Run(FIX.pass, 1).pick('zz').err, 'unknown words are refused');
  run = new E.Run(FIX.pass, 2); for (const id of ['a', 'b', 'c', 'd']) run.pick(id); assert.ok(run.pick('h').full, 'four is enough'); assert.ok(run.submit().done && run.quality());
  // inbox: all cues then the verdict; a false positive or a missed cue costs the star; the wrong verdict fails
  run = new E.Run(FIX.inbox, 1); run.cue('hurry'); run.cue('key'); run.cue('hello');
  assert.ok(run.verdict('trick').done && !run.quality(), 'a cue that is no cue costs the second star');
  run = new E.Run(FIX.inbox, 1); run.cue('hurry'); const v = run.verdict('ask'); assert.ok(v.done && v.missed.includes('key') && !run.quality(), 'ask a grown-up is right for a trick, the missed cue costs the star');
  run = new E.Run(FIX.inbox, 1); assert.ok(run.verdict('safe').failed && run.retry()); run.cue('hurry'); run.cue('key'); assert.ok(run.verdict('trick').done);
  run = new E.Run(FIX.friendly, 1); assert.ok(run.verdict('trick').failed, 'a friendly letter is not a trick'); assert.ok(run.retry() && run.verdict('safe').done);
  // cipher: the wheel reading changes with the shift; a wrong shift fails and can be retried; a wrong choice is just wrong
  run = new E.Run(FIX.decode, 1); assert.equal(run.inst.cipher, 'ETTPI'); assert.equal(run.shiftTo(3).reading, 'BQQMF'); assert.ok(run.submit().failed && run.retry()); assert.equal(run.shiftTo(4).reading, 'APPLE'); assert.ok(run.submit().done && !run.quality());
  run = new E.Run(FIX.encode, 1); assert.equal(run.inst.choices[run.inst.answer], 'OQQP'); assert.equal(new Set(run.inst.choices).size, 3); assert.ok(run.choose((run.inst.answer + 1) % 3).wrong); assert.ok(run.choose(run.inst.answer).done && !run.quality());
  run = new E.Run(FIX.crack, 3); const c = run.count(); assert.equal(c.guess, run.inst.shift, 'counting E finds the shift'); assert.ok(run.inst.shift >= 1 && run.inst.shift <= 25);
  run = new E.Run(FIX.keyed, 1); assert.equal(run.inst.cipher, E.substitute('TOWER', FIX.keyed.key)); assert.equal(run.inst.choices[run.inst.answer], 'TOWER');
  // pixel: hide flips the last bit only; read marks the odd pixels
  run = new E.Run(FIX.hide, 1); const v0 = run.s.values[0]; run.px(0); assert.equal(Math.abs(run.s.values[0] - v0), 1); assert.equal(run.s.values[0] >> 1, v0 >> 1, 'only the last bit changes');
  run = new E.Run(FIX.read, 1); run.inst.target.forEach((b, k) => { assert.equal(run.inst.values[k] & 1, b, 'read mode hides the picture in the values'); });
  run.px(1); assert.ok(run.submit().failed && run.retry()); for (let k = 0; k < 12; k++) if (run.inst.target[k] && k !== 1) run.px(k); assert.ok(run.submit().done && !run.quality());
});

// Real Chromium inside the production frame wrapper (the gulp-city pattern): level 1 of two chapters plays through
// __brbTest, the score label follows the grammar, and the game renders at a phone and a desktop size in English and
// Arabic with no page errors and no kit warnings. Skipped when there is no Chromium on the machine.
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
async function open({ size = { width: 390, height: 844 }, lang = 'en' } = {}) {
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); }
  const ctx = await browser.newContext({ viewport: size, hasTouch: true });
  const doc = frameDocument(HTML, { user: { displayName: 'P', avatar: 'x', lang, dir: lang === 'ar' || lang === 'he' ? 'rtl' : 'ltr' }, game: { id: 'g', title: 'Packet Post' }, save: {}, canSave: false, preview: true, deviceText: { title: 'x', text: 'y' } });
  const host = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const errors = [], warnings = [], msgs = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const m = /^http:\/\/game\.invalid\/(vendor\/(?:oomba-kit|data)\/[\w./-]+)$/.exec(u);   // the kit and the game's language packs, from disk
    if (m && fs.existsSync(path.join(ROOT, 'public', m[1]))) return route.fulfill({ status: 200, headers: { 'content-type': m[1].endsWith('.js') ? 'text/javascript' : 'font/woff2', 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(ROOT, 'public', m[1])) });
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error' || /\[oomba\]/.test(m.text())) warnings.push(m.type() + ': ' + m.text().slice(0, 200)); });
  await page.exposeFunction('__ppMsg', d => msgs.push(d));
  await page.goto(HOST + '/', { waitUntil: 'load' });
  await page.evaluate(() => window.addEventListener('message', e => { if (e.data && typeof e.data.type === 'string') window.__ppMsg({ type: e.data.type, score: e.data.score, label: e.data.label, won: e.data.won }); }));
  let frame = null;
  for (let i = 0; i < 200 && !frame; i++) { frame = page.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await page.waitForTimeout(25); }
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 60_000 });
  return { ctx, page, frame, errors, warnings, msgs };
}
const T = (frame, fn, ...a) => frame.evaluate(([f, a]) => window.__brbTest[f](...a), [fn, a]);

test('packet-post: in Chromium, level 1 of two chapters plays through the hooks, the label follows the grammar, phone and desktop, English, French and Arabic', { skip, timeout: 240_000 }, async () => {
  const LABEL = /^\d{1,2}\/\d{1,2} (levels|cases|tickets|cards), \d{1,3} stars(, \d{1,2}\/\d{1,2} checks)?$/;
  for (const [size, lang, chapter, band] of [[{ width: 390, height: 844 }, 'en', 'packets', '1b'], [{ width: 390, height: 844 }, 'fr', 'protocols', '1b'], [{ width: 1280, height: 800 }, 'ar', 'protocols', '2']]) {
    const { ctx, page, frame, errors, warnings, msgs } = await open({ size, lang });
    try {
      const s0 = await T(frame, 'state');
      assert.equal(s0.scene, 'title'); assert.equal(s0.lang, lang); assert.equal(s0.dir, lang === 'ar' ? 'rtl' : 'ltr');
      assert.ok(await frame.$('.ok-title-screen .ok-hot'), 'the kit title screen with its Play button (the fit audit presses it)');
      const s1 = await T(frame, 'start', { chapter, band, level: 1, seed: 3, lesson: false });
      assert.equal(s1.screen, 'level'); assert.equal(s1.chapter, chapter); assert.equal(s1.level, 1); assert.equal(s1.band, band); assert.equal(s1.cards, 1, 'level 1 opens the learn card');
      await page.waitForTimeout(300); await T(frame, 'closeCards'); await T(frame, 'skipAnimations');
      const dir = await frame.evaluate(() => document.querySelector('.pp').getAttribute('dir')); assert.equal(dir, lang === 'ar' ? 'rtl' : 'ltr', 'the game mirrors its menus');
      // the language pack: Pim's intro line is the translation from scripts/data/cs-quest/packet-post/<lang>.json
      const level = levelsFor(chapter, band)[0], TR = lang === 'en' ? null : JSON.parse(fs.readFileSync(path.join(ROOT, `scripts/data/cs-quest/packet-post/${lang}.json`), 'utf8')).strings;
      const said = await frame.evaluate(() => document.querySelector('.pp-say p').textContent);
      assert.equal(said, TR ? TR[level.intro] : level.intro, `${lang}: the intro comes from the pack`);
      assert.ok(TR ? said !== level.intro : true, 'the pack really loaded');
      assert.equal(await frame.evaluate(() => [...document.querySelectorAll('.pp button')].filter(b => { const r = b.getBoundingClientRect(); return b.offsetParent !== null && !b.closest('[data-fit-dense]') && (r.width < 40 || r.height < 40); }).length), 0, 'every control at least 40 px');
      const snap = await T(frame, 'solve');
      assert.equal(snap.phase, 'done', `${chapter} level 1 solved by the solver`);
      await page.waitForTimeout(1200);
      const s2 = await T(frame, 'state');
      assert.equal(s2.levelStars, 3); assert.match(s2.label, LABEL); assert.ok(s2.label.length <= 40);
      const score = msgs.find(m => m.type === 'brb:score'); assert.ok(score && score.score === 3 && LABEL.test(score.label), `the page got the score ${JSON.stringify(score)}`);
      assert.ok(await frame.$('.ok-win'), 'the kit results card after the level');
      assert.deepEqual(errors, []); assert.deepEqual(warnings, []);
    } finally { await ctx.close(); }
  }
});

test('packet-post fix round 1: asking a grown-up never fails an inbox level, tk-5 needs one, resend stays in range, no joke distractors', () => {
  for (const l of LEVELS.filter(l => l.type === 'inbox')) for (const seed of [1, 2, 3]) { const r = E.play(l, [{ t: 'verdict', v: 'ask' }], seed); assert.ok(r.done && !r.failed, `${l.id}: ask a grown-up solves it`); }
  const tk5 = LEVELS.find(l => l.id === 'tk-5'); assert.ok(E.play(tk5, [{ t: 'verdict', v: 'trick' }], 1).failed, 'tk-5: a meet-up request needs a grown-up, Trick alone is not enough');
  for (const id of ['tk-3', 'tk-6']) { const l = LEVELS.find(x => x.id === id); const r = E.play(l, [{ t: 'verdict', v: 'ask' }], 1); assert.ok(r.done && !r.quality(), `${id}: ask solves the safe letter without the second star`); }
  for (const l of LEVELS.filter(l => l.type === 'ack')) { const r = new E.Run(l, 1); assert.equal(r.resend(0).err, 'noslot'); assert.equal(r.resend(r.inst.n + 1).err, 'noslot'); }
  for (const l of LEVELS) if (l.check) assert.ok(!l.check.tiles.some(x => /company|fresh air|Dragons|waste time|prettier/.test(x)), `${l.id}: no joke distractors`);
});

test('packet-post: in Chromium, an ack level started for real lets its packets ride in, and a locked chapter ends with labelled scores only', { skip, timeout: 240_000 }, async () => {
  const LABEL = /^\d{1,2}\/\d{1,2} (levels|cases|tickets|cards), \d{1,3} stars(, \d{1,2}\/\d{1,2} checks)?$/;
  let { ctx, page, frame, errors, msgs } = await open();
  try {
    // the real level flow (no act, no skipAnimations): a real tap on Let's go, then the packets ride into the Inbox
    await T(frame, 'start', { chapter: 'protocols', band: '1b', level: 1, seed: 1, lesson: false });
    await page.waitForTimeout(400); await frame.tap('.pp-card .ok-hot');
    for (let i = 0; i < 60 && !(await frame.$('[data-card]')); i++) await page.waitForTimeout(250);
    assert.ok(await frame.$('[data-card]'), 'packets in the Inbox');
    assert.ok(await frame.evaluate(() => document.querySelector('.pp-say p').textContent.length > 0), 'Pim says the intro after the learn card');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
  ({ ctx, page, frame, errors, msgs } = await open());
  try {
    await T(frame, 'start', { chapter: 'protocols', band: '1b', lock: 1, seed: 1 });
    const over = () => msgs.find(m => m.type === 'brb:gameover' || m.type === 'brb:over');
    for (let i = 0; i < 60 && !over(); i++) {
      await page.waitForTimeout(300); await T(frame, 'closeCards'); await T(frame, 'skipAnimations');
      const st = await T(frame, 'state');
      if (st.screen === 'level' && st.phase === 'play' && !st.busy) { await T(frame, 'solve'); continue; }
      // the kit's cards in turn: the Case-closed check, How sure were you, the results card (its main button goes on)
      await frame.evaluate(() => { const cs = [...document.querySelectorAll('.ok-card')].filter(c => c.offsetParent !== null); const c = cs[cs.length - 1]; if (!c) return; const b = c.querySelector('.ok-hot') || c.querySelector('button'); if (b) b.click(); });
    }
    const scores = msgs.filter(m => m.type === 'brb:score'), end = over();
    assert.ok(scores.length >= 2, `scores ${JSON.stringify(msgs)}`);
    for (const s of scores) assert.match(String(s.label), LABEL, `every score carries a progress label: ${JSON.stringify(s)}`);
    for (let k = 1; k < scores.length; k++) assert.ok(scores[k].score >= scores[k - 1].score, 'the chained score never goes down');
    assert.ok(end && end.won === true && end.score === null, `gameOver ${JSON.stringify(end)}: won, and no second unlabelled score`);
    assert.ok(msgs.indexOf(end) > msgs.indexOf(scores.at(-1)) && !msgs.slice(msgs.indexOf(end)).some(m => m.type === 'brb:score'), 'the labelled score comes first and nothing follows the game over');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
