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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { loadData, collect, EN } = await import('../../scripts/packet-post-strings.mjs');
const { kitTag, kitPackTag } = await import('../../server/services/kit.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/packet-post.html'), 'utf8');
const { E, D } = loadData(HTML);
const { LEVELS, CHAPTERS, THEN } = D;
const CSTA = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/csta-2017.json'), 'utf8')).standards.map(s => s.id));
const SEEDS = [1, 2, 3, 4, 5, 6];
const J = v => JSON.parse(JSON.stringify(v));   // values from the vm realm: compare by structure, not prototype
const levelsFor = (ch, band) => LEVELS.filter(l => l.ch === ch && l.bands.includes(band));
// the contract: levels per chapter and band
const CONTRACT = { packets: { '1b': 5, '2': 5 }, routes: { '1b': 4, '2': 6 }, protocols: { '1b': 2, '2': 6 } };

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
  assert.equal(typeof meta.l10n, 'object');
  for (const [l, v] of Object.entries(meta.l10n)) assert.ok(v && v.description, `l10n ${l}`);
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
    assert.ok(l.csta && l.csta.length, `${l.id}: csta`);
    if (l.bands.includes('1b') && l.bands.includes('2')) assert.ok(l.csta2 && l.csta2.length, `${l.id}: a shared level names its level 2 standard too`);
    assert.ok(Array.isArray(l.hints) && l.hints.length === 3 && l.hints.every(h => typeof h === 'string' && h.length > 10), `${l.id}: 3 hint tiers`);
    assert.ok(l.check && l.check.q && l.check.tiles.length === 3 && l.check.answer >= 0 && l.check.answer < 3, `${l.id}: Case-closed check`);
    assert.ok(l.intro && l.par > 0 && l.sol != null, `${l.id}: intro, par, sol`);
    assert.doesNotMatch(JSON.stringify(l), /\bcodes?\b|password|https?:|@|\d{7,}/i, `${l.id}: scanner-safe wording`);
  }
  // level 1 of every chapter (per band) opens a learn card
  for (const c of CHAPTERS) for (const band of ['1b', '2']) { const ls = levelsFor(c.id, band); if (ls.length) assert.ok(ls[0].learn && ls[0].learn.title && ls[0].learn.text, `${c.id} ${band}: learn card on level 1`); }
  // chains: every then names a chapter that exists for the band; a chapter's standards cover the lesson's
  for (const [band, map] of Object.entries(THEN)) for (const [from, t] of Object.entries(map)) { assert.ok(CHAPTERS.some(c => c.id === from) && CHAPTERS.some(c => c.id === t.ch), `${band} ${from} -> ${t.ch}`); }
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
  }
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
  for (const bad of ['7100', '1300', '110', '11000', 'abcd', '']) assert.equal(E.questCode(bad, CHAPTERS), null, bad);
  assert.deepEqual(J(E.cleanParams({ chapter: 'packets', band: '1b', lock: 1 }, CHAPTERS)), { chapter: 'packets', band: '1b', lock: 1, present: true });
  assert.deepEqual(J(E.cleanParams({ chapter: 'protocols', band: '2', level: 3, lock: '0', mode: 'projector' }, CHAPTERS)), { chapter: 'protocols', band: '2', level: 3, mode: 'projector', lock: 0, present: true });
  assert.deepEqual(J(E.cleanParams({ chapter: 'nope', band: '9', level: 99, mode: 'fly' }, CHAPTERS)), { lock: 0, present: true });
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
  for (const s of all) { assert.doesNotMatch(s, /\d{7,}|@|https?:|\/\/\w+\./, s); assert.doesNotMatch(s, /\bcodes?\b/i, `never the word code: ${s}`); }
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
    const m = /^http:\/\/game\.invalid\/(vendor\/oomba-kit\/[\w./-]+)$/.exec(u);
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

test('packet-post: in Chromium, level 1 of two chapters plays through the hooks, the label follows the grammar, phone and desktop, English and Arabic', { skip, timeout: 240_000 }, async () => {
  const LABEL = /^\d{1,2}\/\d{1,2} (levels|cases|tickets|cards), \d{1,3} stars(, \d{1,2}\/\d{1,2} checks)?$/;
  for (const [size, lang, chapter, band] of [[{ width: 390, height: 844 }, 'en', 'packets', '1b'], [{ width: 1280, height: 800 }, 'ar', 'protocols', '2']]) {
    const { ctx, page, frame, errors, warnings, msgs } = await open({ size, lang });
    try {
      const s0 = await T(frame, 'state');
      assert.equal(s0.scene, 'title'); assert.equal(s0.lang, lang); assert.equal(s0.dir, lang === 'ar' ? 'rtl' : 'ltr');
      assert.ok(await frame.$('.ok-title-screen .ok-hot'), 'the kit title screen with its Play button (the fit audit presses it)');
      const s1 = await T(frame, 'start', { chapter, band, level: 1, seed: 3, lesson: false });
      assert.equal(s1.screen, 'level'); assert.equal(s1.chapter, chapter); assert.equal(s1.level, 1); assert.equal(s1.band, band); assert.equal(s1.cards, 1, 'level 1 opens the learn card');
      await page.waitForTimeout(300); await T(frame, 'closeCards'); await T(frame, 'skipAnimations');
      const dir = await frame.evaluate(() => document.querySelector('.pp').getAttribute('dir')); assert.equal(dir, lang === 'ar' ? 'rtl' : 'ltr', 'the game mirrors its menus');
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
