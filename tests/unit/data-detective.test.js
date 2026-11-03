// Data Detective (seed-games/data-detective.html): the cases and the pure case engine read from the game file, and the
// game itself in real Chromium inside the production frame wrapper (kit served from disk). Every case of every chapter
// is solved by its own tap script with three stars, its starter (where one exists) fails, it has exactly one supported
// claim (two for a pick-two case), a learn card on level 1, three hint tiers, a Case-closed check, CSTA ids that exist,
// the quest-code codec round-trips, and every English word is in the language-pack master list. The Chromium part plays
// the chapters through __brbTest (sort, chart, models incl. Game Balance, fair incl. pick two, My Data tally with the
// class pool and the Pro percent comparison, the Daily Crew Challenge, pair mode, chapter crowns), checks the progress
// label grammar, the keypad and lock semantics, 150% text, and renders at phone and desktop sizes in English and Arabic
// with no console errors. Needs a local Chromium; those tests skip without one.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/data-detective.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/data-detective.json'), 'utf8'));
const CSTA = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/csta-2017.json'), 'utf8')).standards.map(s => s.id));
const LABEL = /^\d{1,2}\/\d{1,2} (levels|cases|tickets|cards), \d{1,3} stars(, \d{1,2}\/\d{1,2} checks)?$/;
const TALLY_LABEL = /^\d{1,2} charts made$/;
const { scanVersion } = await import('../../server/services/scanner.js');
const { kitTag, kitPackTag } = await import('../../server/services/kit.js');

const ctx = vm.createContext({ window: {} });
for (const m of HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
const LV = ctx.window.DataDetectiveLevels, E = ctx.window.DataDetectiveEngine;
const { CHAPTERS, LEVELS } = LV;
const CONTRACT = [[1, 'sort', 6], [2, 'chart', 5], [3, 'claims', 6], [4, 'cleanup', 6], [5, 'models', 5], [6, 'fair', 4], [7, 'my-data', 3]];
const isOk = r => r === true || (r && r.ok);
/** Run a script up to (not including) the claim; return the state. */
function upToClaim(l, seed) { const st = E.newCase(l, seed); for (const a of l.sol) { if (a[0] === 'claim' || a[0] === 'pick') break; E.act(l, st, a); } return st; }

test('data-detective: kit 1.1.2 byte-exact tags, the scanner passes, the metadata is right', () => {
  assert.ok(HTML.startsWith('<title>Data Detective</title>'));
  assert.ok(HTML.includes(kitTag()), 'the exact kit tag');
  for (const p of ['art-props', 'dress', 'style-bold']) assert.ok(HTML.includes(kitPackTag(p)), `the exact ${p} pack tag`);
  assert.equal(scanVersion(HTML).status, 'pass');
  assert.ok(Buffer.byteLength(HTML) < 2 * 1024 * 1024);
  assert.doesNotMatch(HTML, /<input[^>]*type=["']?(text|search|email|number|tel|url)/i, 'no text inputs anywhere');
  assert.doesNotMatch(HTML, /<textarea|contenteditable/i, 'nothing to type into');
  assert.doesNotMatch(HTML.slice(HTML.indexOf('<script type="module">')), /\bsetTimeout\s*\(|\bsetInterval\s*\(|\bDate\.now\b|\brequestAnimationFrame\b/, 'the kit clocks only');
  assert.match(HTML, /PACK_VER = '/); assert.match(HTML, /PACK_SRI = \{/); assert.match(HTML, /CsqPacks/);
  assert.equal(META.slug, 'data-detective'); assert.equal(META.category, 'learning'); assert.equal(META.featured, true);
  assert.equal(META.orientation, 'any'); assert.equal(META.age_rating, 'everyone'); assert.equal(META.players_max, 2); assert.equal(META.cover, 'ocean');
  assert.ok(META.description.length <= 600);
});

test('data-detective: the 11 non-English descriptions in the JSON l10n', { skip: !Object.keys(META.l10n || {}).length && 'l10n lands with the translation stage' }, () => {
  for (const l of ['pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) assert.ok(META.l10n[l] && META.l10n[l].description, `description in ${l}`);
});

test('data-detective: every chapter of the contract exists with every case (ids, indices, counts, bands, CSTA ids)', () => {
  assert.equal(JSON.stringify(CHAPTERS.map(c => [c.index, c.id, c.levels])), JSON.stringify(CONTRACT));
  for (const c of CHAPTERS) for (const id of [...c.csta, ...(c.csta2 || [])]) assert.ok(CSTA.has(id), `${c.id}: ${id} is a CSTA 2017 id`);
  assert.equal(JSON.stringify(CHAPTERS.find(c => c.id === 'my-data').csta2), JSON.stringify(['2-DA-08', '2-IC-22']), 'My Data carries the Pro standards too');
  assert.equal(CHAPTERS.find(c => c.id === 'my-data').mode, 'tally');
  for (const [, ch, n] of CONTRACT) {
    assert.equal(LV.levelsOf(ch).length, n, `${ch}: every case exists`);
    assert.deepEqual(LV.levelsOf(ch).map(l => l.n), LV.levelsOf(ch).map((l, i) => i + 1), `${ch}: numbered 1..n`);
  }
  assert.equal(LEVELS.length, 35, 'the 35 cases of the plan');
  for (const l of LEVELS) {
    const ch = CHAPTERS.find(c => c.id === l.ch);
    assert.ok(ch, `${l.id}: chapter`);
    assert.ok(l.bands.length && l.bands.every(b => b === '1b' || b === '2'), `${l.id}: bands`);
    if (ch.band !== 'both') assert.ok(l.bands.includes(ch.band), `${l.id}: playable in its chapter's band`);
    for (const id of [...l.csta, ...(l.csta2 || [])]) assert.ok(CSTA.has(id), `${l.id}: ${id}`);
    assert.ok(l.csta.every(id => ch.csta.includes(id) || (ch.csta2 || []).includes(id)), `${l.id}: tagged with its chapter's standard`);
    if (l.csta2) assert.ok(l.csta2.every(id => (ch.csta2 || []).includes(id)), `${l.id}: Pro tags from the chapter`);
  }
  assert.equal(new Set(LEVELS.map(l => l.id)).size, LEVELS.length, 'unique ids');
});

test('data-detective: every case is solved by its tap script with three stars, starters fail, par >= edits, the claim waits for the evidence, one supported claim', () => {
  for (const l of LEVELS) {
    for (const seed of [1, 2, 3]) {
      const st = E.newCase(l, seed);
      if (l.evidence) assert.equal(E.evidence(l, st), false, `${l.id}: the case starts without its evidence view (something to do)`);
      if (l.starter) {
        const s0 = E.newCase(l, seed);
        for (const a of l.starter) assert.ok(isOk(E.act(l, s0, a)), `${l.id}: starter step ${JSON.stringify(a)} is a real move`);
        assert.equal(E.evidence(l, s0) || s0.solved, false, `${l.id}: the starter does not pass`);
      }
      for (const a of l.sol) {
        if (a[0] === 'claim' || a[0] === 'pick') assert.equal(E.evidence(l, st), true, `${l.id}: the evidence view is on screen before the claim`);
        const r = E.act(l, st, a);
        assert.ok(isOk(r), `${l.id}: ${JSON.stringify(a)} works (${JSON.stringify(r)})`);
      }
      assert.equal(st.solved, true, `${l.id}: solved`);
      assert.equal(E.proofDone(l, st), true, `${l.id}: the evidence was shown`);
      assert.equal(E.stars(l, st), 3, `${l.id}: three stars for the clean solution`);
      if (l.par != null) assert.ok(st.edits <= l.par, `${l.id}: par ${l.par} >= edits(sol) ${st.edits}`);
    }
    // a claim before the evidence is refused and never counted as a run
    const early = E.newCase(l, 1);
    if (l.evidence) { const r = E.act(l, early, l.pick ? ['pick', l.answers] : ['claim', l.answer || 0]); assert.deepEqual([r.ok, r.why, early.runs], [false, 'show-me', 0], `${l.id}: Show me first`); }
    // exactly one supported claim (two for a pick-two case); a wrong one is counted and explained
    const ready = upToClaim(l, 1);
    const tiles = E.claimTiles(l, ready);
    assert.ok(tiles.length >= 1 && tiles.length <= 4, `${l.id}: 1-4 claim tiles`);
    assert.ok(l.shows && l.shows.length > 10, `${l.id}: Dot says what the data shows`);
    if (l.predict) {
      assert.equal(E.claimOk(l, ready, 0), true, `${l.id}: the prediction in range is accepted`);
      E.act(l, ready, ['slider', l.predict.max]); assert.equal(E.claimOk(l, ready, 0), false, `${l.id}: a wild prediction is not`);
    } else if (l.pick) {
      assert.equal(tiles.filter((t, i) => E.claimOk(l, ready, i)).length, l.pick, `${l.id}: ${l.pick} right picks`);
      const wrong = [l.answers[0], tiles.findIndex((t, i) => !l.answers.includes(i))];
      const r = E.act(l, ready, ['pick', wrong]);
      assert.deepEqual([r.ok, r.why, ready.wrong, ready.runs], [false, 'wrong', 1, 1], `${l.id}: a wrong pair is a failed run`);
      const one = E.act(l, ready, ['pick', [l.answers[0]]]);
      assert.deepEqual([one.ok, one.why], [false, 'count'], `${l.id}: one pick is not enough`);
      assert.equal(E.act(l, ready, ['pick', l.answers]).ok, true);
      for (const k of E.proofKeys(l, ready)) E.act(l, ready, ['show', k]);
      assert.equal(E.stars(l, ready), 2, `${l.id}: a wrong pick costs the second star`);
    } else {
      assert.equal(tiles.filter((t, i) => E.claimOk(l, ready, i)).length, 1, `${l.id}: one supported claim`);
      const right = tiles.findIndex((t, i) => E.claimOk(l, ready, i)), wrong = tiles.findIndex((t, i) => !E.claimOk(l, ready, i));
      if (!l.tally) assert.equal(right, l.answer, `${l.id}: the answer index`);
      const r = E.act(l, ready, ['claim', wrong]);
      assert.deepEqual([r.ok, r.why, ready.wrong, ready.runs], [false, 'wrong', 1, 1], `${l.id}: a wrong claim is a failed run`);
      const ok = E.act(l, ready, ['claim', right]);
      assert.equal(ok.ok, true);
      for (const k of E.proofKeys(l, ready)) E.act(l, ready, ['show', k]);
      assert.equal(ready.solved, true);
      assert.equal(E.stars(l, ready), 2, `${l.id}: a wrong claim costs the second star`);
    }
  }
});

test('data-detective: learn card on level 1 of every chapter, three hint tiers, a Case-closed check with 3 tiles, proof keys that exist, table sizes', () => {
  for (const [, ch] of CONTRACT) assert.ok(LV.levelsOf(ch)[0].learn && LV.levelsOf(ch)[0].learn.title && LV.levelsOf(ch)[0].learn.text, `${ch}: learn card`);
  for (const l of LEVELS) {
    assert.equal(l.hints.length, 3, `${l.id}: three hints`);
    assert.ok(l.hints.every(h => h.length >= 8), `${l.id}: hint text`);
    assert.ok(l.title && l.story, `${l.id}: title and story`);
    assert.ok(l.q || l.claim, `${l.id}: a question or a claim`);
    assert.ok(l.check && l.check.q && l.check.tiles.length === 3 && l.check.tiles[l.check.answer], `${l.id}: Case-closed check`);
    assert.ok(l.glow, `${l.id}: a tier-2 glow`);
    if (l.evidence) assert.ok(l.move, `${l.id}: a tier-3 move when there is a move to make`);
    const st = E.newCase(l, 1);
    if (l.tally) {
      const ready = upToClaim(l, 1); E.act(l, ready, ['claim', 0]);
      const cats = new Set(LV.presetOf(ready.preset).cats.flatMap(c => ['c:' + c, 'r:' + c]));
      for (const k of E.proofKeys(l, ready)) assert.ok(cats.has(k), `${l.id}: proof ${k} is a bar or row of the tally`);
    } else {
      const keys = new Set([...(l.rows || []).map((r, i) => 'r' + (i + 1)), ...E.series(l, Object.assign(st, { view: 'bar' })).map(([c]) => 'c:' + c)]);
      if (l.rows && !l.model) for (const c of l.cols) for (const [cat] of E.groupCounts(l, st, c.id)) keys.add('c:' + cat);
      for (const k of E.proofKeys(l, st)) assert.ok(keys.has(k), `${l.id}: proof ${k} is a row or bar of the case`);
    }
    if (l.rows) assert.ok(l.rows.length <= (l.bands.includes('1b') ? 10 : 12) && l.cols.length <= 4, `${l.id}: table size`);
    if (l.random) { const a = E.newCase(l, 1).order.join(), b = E.newCase(l, 2).order.join(); assert.notEqual(a, b, `${l.id}: random layout per seed`); assert.equal(E.newCase(l, 1).order.join(), a, `${l.id}: deterministic per seed`); }
    // tier 3 does the move for the player (and costs the third star), skip gives no stars
    const h = E.newCase(l, 1); E.act(l, h, ['hint', 3]);
    assert.equal(h.hint3, true);
    if (l.move && ['sort', 'group', 'view', 'pct'].includes(l.move[0]) && !l.tally) assert.ok(E.evidence(l, h), `${l.id}: the tier-3 move brings the evidence view`);
    if (l.move && l.move[0] === 'rule') assert.equal(h.rule, l.move[1], `${l.id}: the tier-3 move sets the rule`);
    const s = E.newCase(l, 1); E.act(l, s, ['skip']); assert.equal(E.stars(l, s), 0); assert.equal(s.solved, true);
  }
});

test('data-detective: models are deterministic per seed, only the true rule fits, Game Balance lands on 16 of 20 at jump 8', () => {
  for (const l of LV.levelsOf('models')) {
    const m = l.model;
    const a = E.newCase(l, 4), b = E.newCase(l, 4); E.act(l, a, ['run']); E.act(l, b, ['run']);
    assert.deepEqual(a.last, b.last, `${l.id}: the same seed gives the same trials`);
    const fits = [];
    for (let v = m.rule.min; v <= m.rule.max; v += m.rule.step) { const st = E.newCase(l, 2); E.act(l, st, ['rule', v]); E.act(l, st, ['run']); if (st.last.fit) fits.push(v); }
    assert.deepEqual(fits, [m.gaps ? 8 : m.truth], `${l.id}: exactly one rule fits`);
    const st = E.newCase(l, 3); E.act(l, st, ['rule', 99]); assert.equal(st.rule, m.rule.max, 'the rule is clamped'); E.act(l, st, ['rule', m.rule.min - 5]); assert.equal(st.rule, m.rule.min);
    if (m.gaps) { for (const seed of [1, 2, 3, 4, 5]) { const g = E.newCase(l, seed); E.act(l, g, ['rule', 8]); E.act(l, g, ['run']); assert.deepEqual([g.last.done, g.last.n, g.last.rate, g.last.fit], [16, 20, 80, true], `${l.id}: seed ${seed}`); } }
    else assert.ok(E.modelRows(l, E.newCase(l, 1)).every(r => r.actual == null), `${l.id}: no real results before a run`);
  }
});

test('data-detective: My Data composes its claims from the counts; the other class compares by percent; the open tally has every preset', () => {
  const l = LV.byId['my-2'];
  const st = E.newCase(l, 1);
  assert.equal(E.evidence(l, st), false);
  for (const [c, n] of [['Red', 2], ['Blue', 6], ['Green', 3], ['Yellow', 1]]) E.act(l, st, ['tally', c, n]);
  assert.equal(E.tallyTotal(l, st), 12);
  assert.equal(E.evidence(l, st), false, 'a table is not a chart');
  E.act(l, st, ['view', 'picto']); assert.equal(E.evidence(l, st), true);
  const tiles = E.claimTiles(l, st);
  assert.equal(JSON.stringify(tiles.map(t => t.vars)), JSON.stringify([{ top: 'Blue' }, { low: 'Purple' }, { top: 'Blue' }]), 'the fewest is the first of the two at zero');
  assert.equal(JSON.stringify(tiles.map((t, i) => E.claimOk(l, st, i))), '[true,false,false]', 'fewest is a tie at 0; half of 12 is not beaten');
  assert.equal(JSON.stringify(E.tallyShows(l, st)), JSON.stringify({ top: 'Blue', a: 6, low: 'Purple', b: 0, total: 12 }));
  // Pro: load the other class, compare shares in the table
  assert.ok(isOk(E.act(l, st, ['other']))); assert.equal(E.evidence(l, st), true, 'the other class alone keeps the chart claims');
  assert.ok(isOk(E.act(l, st, ['pct']))); assert.equal(E.evidence(l, st), false, 'the percent comparison is read in the table');
  E.act(l, st, ['view', 'table']); assert.equal(E.evidence(l, st), true);
  const rows = E.compareRows(l, st);
  assert.equal(JSON.stringify(rows[1]), JSON.stringify(['Blue', 6, 10, 50, 33]));
  const cmp = E.claimTiles(l, st);
  assert.equal(JSON.stringify(cmp.map(t => t.vars)), JSON.stringify([{ ours: 'Blue' }, { theirs: 'Purple' }, { top: 'Blue' }]));
  assert.ok(E.claimOk(l, st, 0) && E.claimOk(l, st, 1) && E.claimOk(l, st, 2));
  const r = E.act(l, st, ['claim', 0]); assert.equal(r.ok, true); assert.equal(JSON.stringify(E.proofKeys(l, st)), JSON.stringify(['r:Blue']));
  assert.equal(E.act(l, st, ['show', 'r:Blue']).why, 'solved');
  // fewer than five answers is a hunch, not a case
  const few = E.newCase(l, 1); E.act(l, few, ['tally', 'Red', 4]); E.act(l, few, ['view', 'bar']); assert.equal(E.evidence(l, few), false);
  E.act(l, few, ['tally', 'Red', 1]); assert.equal(E.evidence(l, few), true);
  const open = LV.byId['my-3'];
  assert.equal(JSON.stringify(open.tally.presets), JSON.stringify(LV.PRESETS.map(p => p.id)));
  for (const p of LV.PRESETS) { assert.ok(p.cats.length <= 8 && p.other.length === p.cats.length, `${p.id}: at most 8 categories, an other class of the same shape`); const o = E.newCase(open, 1); assert.ok(isOk(E.act(open, o, ['preset', p.id]))); assert.equal(JSON.stringify(E.tallyCats(open, o)), JSON.stringify(p.cats)); }
  assert.equal(E.act(open, E.newCase(open, 1), ['preset', 'nope']), false);
  assert.equal(E.act(LV.byId['my-1'], E.newCase(LV.byId['my-1'], 1), ['preset', 'fruit']), false, 'a guided level keeps its question');
});

test('data-detective: the quest-code codec round-trips every chapter, band, mode and level; bad codes are refused; the game uses it', () => {
  let n = 0;
  for (const chapter of ['', ...CHAPTERS.map(c => c.id)]) for (const band of ['1b', '2']) for (const mode of ['play', 'tally', 'projector']) for (let level = 0; level <= 9; level++) {
    const code = E.codeOf({ chapter, band, mode, level });
    assert.ok(Array.isArray(code) && code.length === 4 && code.every(d => Number.isInteger(d) && d >= 0 && d <= 9), `${chapter}/${band}/${mode}/${level}: four digits`);
    assert.equal(JSON.stringify(E.parseCode(code)), JSON.stringify({ chapter, band, mode, level }), `${chapter}/${band}/${mode}/${level}: round trip`);
    n++;
  }
  assert.equal(n, 8 * 2 * 3 * 10);
  const codeStr = o => E.codeOf(o).join(' ');
  assert.equal(codeStr({ chapter: 'sort', band: '1b', mode: 'play', level: 0 }), '1 1 0 0');
  assert.equal(codeStr({ chapter: 'cleanup', band: '2', mode: 'play', level: 0 }), '4 2 0 0');
  assert.equal(codeStr({ chapter: 'my-data', band: '2', mode: 'tally', level: 0 }), '7 2 2 0');
  assert.equal(codeStr({ chapter: 'my-data', band: '1b', mode: 'tally', level: 0 }), '7 1 2 0');
  assert.equal(codeStr({ chapter: 'fair', band: '2', mode: 'play', level: 0 }), '6 2 0 0');
  assert.equal(codeStr({ chapter: 'claims', band: '1b', mode: 'play', level: 0 }), '3 1 0 0');
  assert.equal(codeStr({ chapter: 'models', band: '2', mode: 'play', level: 0 }), '5 2 0 0');
  for (const bad of [[9, 9, 0, 0], [1, 3, 0, 0], [1, 1, 1, 0], [1, 1, 4, 0], [8, 1, 0, 0], [1, 1, 0], [1, 1, 0, 0, 0], ['1', 1, 0, 0]]) assert.equal(E.parseCode(bad), null, `refused: ${JSON.stringify(bad)}`);
  assert.equal(E.codeOf({ chapter: 'nope', band: '1b' }), null);
  assert.match(HTML, /E\.parseCode\(/, 'the in-game keypad goes through the codec');
  for (const m of HTML.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n]){2,400})\1/g)) assert.doesNotMatch(m[2], /\d{5,}/, `never five digits in a row in a string: ${m[2].slice(0, 60)}`);
});

test('data-detective: every English word is in the pack master list, within budget, no duplicates, US spelling', () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/cs-quest/data-detective/en.json'), 'utf8')).strings;
  assert.ok(Array.isArray(en) && en.length <= 1450, `budget: ${en.length}`);
  assert.equal(new Set(en).size, en.length, 'no duplicates');
  const mod = HTML.slice(HTML.indexOf('<script type="module">'));
  const lits = [...mod.matchAll(/\btr\(\s*'((?:\\.|[^'\\])*)'/g)].map(m => m[1].replace(/\\'/g, "'").replace(/\\u([0-9a-fA-F]{4})/g, (x, h) => String.fromCharCode(parseInt(h, 16))));
  const want = new Set([...lits, ...LV.allStrings()].filter(s => /\p{L}/u.test(s)));
  const have = new Set(en);
  for (const s of want) assert.ok(have.has(s), `en.json is missing: ${s}`);
  for (const s of en) assert.ok(want.has(s), `en.json has a string the game no longer uses: ${s}`);
  assert.ok(new Set(lits).size <= 450, `chrome strings: ${new Set(lits).size}`);
  assert.ok(LV.allStrings().length <= 1000, `level strings: ${LV.allStrings().length}`);
  const UK = /\b(colour|favourite|grey|labelled|organise|practise|neighbour|recognise|maths|centre|programme|catalogue)\b/i;
  for (const s of en) assert.doesNotMatch(s, UK, `US spelling: ${s}`);
  for (const s of en) { assert.doesNotMatch(s, /\d{7,}|@|https?:|\/\/\w+\./, `safe text: ${s}`); }
  for (const s of en) { assert.doesNotMatch(s, /\b(grown-ups?|parents?|guardians?|famil(y|ies)|mum|mom|dad)\b.{0,40}\bcodes?\b|\bcodes?\b.{0,40}\b(grown-ups?|parents?|guardians?|famil(y|ies)|mum|mom|dad)\b/i, `no family words near "code": ${s}`); }
});

/* ---------- real Chromium, inside the production frame wrapper ---------- */
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const HOST = 'http://game.invalid';
const TYPES = { js: 'text/javascript', woff2: 'font/woff2', css: 'text/css', json: 'application/json' };
let browser;
test.after(async () => { if (browser) await browser.close(); });
/** bar: the height of the play page's own bar above the frame (52 px on the site), so the frame is shorter than the viewport. */
async function open({ size = { width: 844, height: 390 }, lang = 'en', params = null, bar = 0 } = {}) {
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); }
  const ctx = await browser.newContext({ viewport: size, reducedMotion: 'reduce' });
  const init = { user: { displayName: 'P', avatar: 'x', lang, dir: lang === 'ar' || lang === 'he' ? 'rtl' : 'ltr' }, game: { id: 'g', title: 'Data Detective' }, save: {}, canSave: false, preview: true };
  if (params) init.params = params;
  const doc = frameDocument(HTML, init);
  const host = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:calc(100% - ${bar}px);display:block}.bar{height:${bar}px;background:#222}</style>${bar ? '<div class=bar></div>' : ''}<iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const errors = [], kit = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const m = /^http:\/\/game\.invalid\/vendor\/(oomba-kit\/[\w./-]+)$/.exec(u);
    if (m) {
      const f = path.join(ROOT, 'public/vendor', m[1]);
      if (!fs.existsSync(f)) return route.abort();
      kit.push(m[1]);
      return route.fulfill({ status: 200, headers: { 'content-type': TYPES[path.extname(f).slice(1)] || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(HOST + '/', { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 200 && !frame; i++) { frame = page.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await page.waitForTimeout(25); }
  await frame.waitForFunction(() => window.__brbTest && typeof window.__brbTest.start === 'function' && document.querySelector('.ok-title-screen .ok-hot'), null, { timeout: 60_000 });
  return { ctx, page, frame, errors, kit };
}
const T = (frame, fn, ...a) => frame.evaluate(([f, a]) => window.__brbTest[f](...a), [fn, a]);
const untilLevel = (frame, n) => frame.waitForFunction(n => window.__brbTest.state().level === n, n, { timeout: 10_000 });
/** Answer the Case-closed check with the right tile, then pick a confidence face. */
async function closeCard(frame, levelId) {
  const l = LEVELS.find(x => x.id === levelId);
  await frame.waitForSelector('.ok-ask .ok-tile', { timeout: 10_000 });
  // the right tile by its English key, through the game's own tr() so a language pack cannot break the test
  await frame.evaluate(txt => { const want = window.DataDetectiveT(txt); const t = [...document.querySelectorAll('.ok-ask .ok-tile')].find(x => x.textContent.includes(want)); t.click(); }, l.check.tiles[l.check.answer]);
  await frame.waitForSelector('.dd-modal .faces button', { timeout: 10_000 });
  await frame.evaluate(() => document.querySelectorAll('.dd-modal .faces button')[2].click());
}
async function fit(frame, where) {
  const { frameProblems } = await import('../e2e/frame-fit.js');
  const p = await frameProblems(frame);
  assert.deepEqual(p, [], `${where}: layout problems`);
}

test('data-detective: plays level 1 of two chapters in the frame; the label grammar; the keypad; lock; 150% text; no errors', { skip, timeout: 240_000 }, async () => {
  const { ctx, frame, errors, kit } = await open({ size: { width: 390, height: 844 } });
  try {
    assert.ok(kit.some(k => k.endsWith('/oomba-kit.js')) && kit.some(k => k.includes('/packs/dress.js')), 'the pinned kit and packs loaded from the frame');
    await fit(frame, 'title 390x844');
    await T(frame, 'skipAnimations');
    // Sort & Group, level 1, lesson mode: the Case-closed card after the case, the label carries the checks part
    await T(frame, 'start', { chapter: 'sort', band: '1b', level: 1, seed: 1, lesson: true });
    let s = await T(frame, 'state');
    assert.deepEqual([s.screen, s.chapter, s.level, s.band, s.lesson, s.evidence, s.solved, s.mode], ['play', 'sort', 1, '1b', true, false, false, 'play']);
    await fit(frame, 'sort-1 390x844');
    // the claim button refuses before the evidence view, then the sort header unlocks it
    const refused = await T(frame, 'claim', 0);
    assert.equal(refused, null, 'no claim before the evidence');
    assert.match((await T(frame, 'state')).say, /Show me first/);
    await frame.click('.hdr[aria-label*="When"]');
    s = await T(frame, 'state');
    assert.deepEqual([s.evidence, s.sortBy && s.sortBy.col, s.edits], [true, 'when', 1]);
    assert.match(s.say, /Pin your claim/);
    await T(frame, 'claim', 1);   // Jo: a wrong claim: Dot says what the data shows, the tile is marked
    s = await T(frame, 'state');
    assert.deepEqual([s.wrong, s.runs, s.picked], [1, 1, null]);
    assert.match(s.say, /Gus at 3:10/);
    await T(frame, 'claim', 0);
    assert.equal((await T(frame, 'state')).picked, 0);
    // arrow keys walk the rows; Enter taps the evidence row
    await frame.focus('tr[data-row]'); await frame.press('tr[data-row]', 'ArrowDown');
    assert.equal(await frame.evaluate(() => document.activeElement.dataset.row), (await frame.evaluate(() => document.querySelectorAll('tr[data-row]')[1].dataset.row)), 'ArrowDown moves to the next row');
    await frame.click('tr[data-row="r8"]');   // Show me: the evidence row
    s = await T(frame, 'state');
    assert.equal(s.solved, true);
    await closeCard(frame, 'sort-1');
    await untilLevel(frame, 2);
    s = await T(frame, 'state');
    assert.equal(s.scoreCalls.length, 1);
    assert.equal(s.scoreCalls[0].label, '1/6 cases, 2 stars, 1/1 checks');
    assert.match(s.label, LABEL); assert.ok(s.label.length <= 40 && /^[\x20-\x7e]+$/.test(s.label));
    assert.equal(s.scoreCalls[0].score, 2);
    // level 2 is a fresh case, the hint tiers: a question, a glow, then the move (and the third star)
    assert.deepEqual([s.level, s.evidence, s.hint], [2, false, 0]);
    await T(frame, 'hint'); await T(frame, 'hint');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.hdr.lit').length), 1, 'tier 2 glows the column');
    await T(frame, 'hint');
    s = await T(frame, 'state');
    assert.deepEqual([s.hint, s.evidence, s.sortBy && s.sortBy.col], [3, true, 'blocks']);
    assert.equal(await T(frame, 'solve'), true);
    await closeCard(frame, 'sort-2');
    await untilLevel(frame, 3);
    s = await T(frame, 'state');
    assert.equal(s.scoreCalls[1].label, '2/6 cases, 4 stars, 2/2 checks');
    assert.ok(s.scoreCalls[1].score >= s.scoreCalls[0].score, 'monotonic score');
    // Skip after two failed runs: grey, 0 stars, the next case opens
    await T(frame, 'claim', 1);   // before evidence: refused, not a run
    await T(frame, 'act', ['group', 'pet']);
    await T(frame, 'claim', 1); await T(frame, 'claim', 2);
    assert.equal(await frame.evaluate(() => !!document.getElementById('skipBtn')), true, 'Skip appears after two failed claims');
    await frame.click('#skipBtn');
    await untilLevel(frame, 4);
    s = await T(frame, 'state');
    assert.equal(s.scoreCalls[2].label, '3/6 cases, 4 stars, 2/2 checks');
    // Chart It, free play, a build-the-bars case: steppers, the empty claim card, the proof bar
    await T(frame, 'start', { chapter: 'chart', band: '1b', level: 2, seed: 3 });
    s = await T(frame, 'state');
    assert.deepEqual([s.chapter, s.level, s.lesson, s.evidence], ['chart', 2, false, false]);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.step .ibtn').length), 8, 'a - and + stepper per bar');
    await fit(frame, 'chart-2 390x844');
    for (let i = 0; i < 5; i++) await frame.click('.step:nth-child(1) .ibtn:last-child');
    assert.equal((await T(frame, 'state')).bars.Dog, 5);
    for (const [c, n] of [['Cat', 3], ['Fish', 2], ['Bird', 4]]) await T(frame, 'act', ['bar', c, n]);
    s = await T(frame, 'state');
    assert.deepEqual([s.evidence, s.edits], [true, 14], 'the bars match the table within par');
    await T(frame, 'claim', 0);
    await T(frame, 'tap', 'c:Dog');   // Show me: the tallest bar
    await untilLevel(frame, 3);
    s = await T(frame, 'state');
    assert.equal(s.scoreCalls.at(-1).label, '1/5 cases, 3 stars');
    assert.match(s.label, LABEL);
    // the quest-code keypad: C B M L; a bad code is refused; params would win over codes
    assert.equal(await T(frame, 'code', '9 9 0 0'), false);
    assert.equal(await T(frame, 'code', '4 2 0 0'), true);
    s = await T(frame, 'state');
    assert.deepEqual([s.chapter, s.band, s.mode, s.lesson, s.lock, s.level], ['cleanup', '2', 'play', true, false, 1]);
    await T(frame, 'keypad');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.dd-modal .keys button').length), 12);
    assert.equal(await frame.evaluate(() => document.querySelector('.dd-modal .code').textContent), '_ _ _ _');
    await fit(frame, 'keypad 390x844');
    await T(frame, 'closeDialog');
    assert.equal(await T(frame, 'code', '7 1 2 0'), true, 'the My Data quest code');
    s = await T(frame, 'state');
    assert.deepEqual([s.chapter, s.band, s.mode, s.lesson], ['my-data', '1b', 'tally', true]);
    // lock=1 through params: band locked, no band toggle on the map, Back goes to the title
    assert.equal(await T(frame, 'params', { chapter: 'claims', band: '1b', lock: 1 }), true);
    s = await T(frame, 'state');
    assert.deepEqual([s.chapter, s.band, s.lock, s.lesson], ['claims', '1b', true, true]);
    assert.equal(await frame.evaluate(() => document.getElementById('questPill').hidden), false, 'Class quest pill');
    assert.match(await frame.evaluate(() => document.getElementById('questPill').textContent), /Class quest: Clues & Claims · Explorer/);
    // 150% text on a chart case still fits the phone
    await T(frame, 'textSize', 1.5);
    await T(frame, 'start', { chapter: 'chart', band: '1b', level: 1, seed: 1 });
    await T(frame, 'act', ['view', 'bar']);
    await fit(frame, 'chart-1 bars at 150% 390x844');
    await T(frame, 'textSize', 1);
    await T(frame, 'params', { chapter: 'claims', band: '1b', lock: 1 });
    await frame.click('#backBtn');
    await frame.waitForSelector('.ok-title-screen .ok-hot', { timeout: 10_000 });
    assert.equal(await frame.evaluate(() => document.getElementById('game').hidden), true, 'Back under lock leaves for the title, not the map');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('data-detective: Model Makers in the frame: the rule slider, seeded trials, refine, Game Balance; Fair Data pick two', { skip, timeout: 240_000 }, async () => {
  const { ctx, frame, errors } = await open({ size: { width: 390, height: 844 } });
  try {
    await T(frame, 'skipAnimations');
    await T(frame, 'start', { chapter: 'models', band: '2', level: 1, seed: 2, lesson: true });
    let s = await T(frame, 'state');
    assert.deepEqual([s.chapter, s.level, s.band, s.rule, s.batches, s.fit, s.evidence], ['models', 1, '2', 1, 0, false, false]);
    assert.equal(await frame.evaluate(() => !!document.getElementById('runBtn') && !!document.getElementById('rule')), true, 'a Run button and a rule slider');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('tr[data-row]').length), 5, 'five trial rows');
    await fit(frame, 'models-1 390x844');
    await frame.click('#runBtn');
    s = await T(frame, 'state');
    assert.deepEqual([s.batches, s.fit, s.edits], [1, false, 1]);
    assert.match(s.say, /too little/);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('td.off.no').length), 5, 'every trial is off');
    await frame.evaluate(() => { const r = document.getElementById('rule'); r.value = '2'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    s = await T(frame, 'state');
    assert.deepEqual([s.rule, s.fit, s.evidence], [2, false, false], 'the rule moved but is untested');
    await frame.click('#runBtn');
    s = await T(frame, 'state');
    assert.deepEqual([s.batches, s.fit, s.evidence, s.edits], [2, true, true, 2]);
    assert.match(s.say, /fits/);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('td.off.ok').length), 5, 'every trial inside the tolerance');
    await fit(frame, 'models-1 fitted 390x844');
    await T(frame, 'claim', 0);
    await frame.click('tr[data-row="r1"]'); await frame.click('tr[data-row="r5"]');
    assert.equal((await T(frame, 'state')).solved, true);
    await closeCard(frame, 'models-1');
    await untilLevel(frame, 2);
    s = await T(frame, 'state');
    assert.equal(s.scoreCalls[0].label, '1/5 cases, 3 stars, 1/1 checks');
    // Game Balance: 20 seeded runs, the finish strip, the bars of finished and fell
    await T(frame, 'start', { chapter: 'models', band: '2', level: 5, seed: 1 });
    s = await T(frame, 'state');
    assert.deepEqual([s.level, s.rule], [5, 10]);
    await frame.click('#runBtn');
    s = await T(frame, 'state');
    assert.match(s.say, /20 of 20 finished\. Too easy/);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.runs span').length), 20, 'a strip of 20 test runs');
    await T(frame, 'act', ['rule', 8]);
    await frame.click('#runBtn');
    s = await T(frame, 'state');
    assert.deepEqual([s.fit, s.evidence], [true, true]);
    assert.match(s.say, /16 of 20 finished/);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.runs span.ok').length), 16);
    await fit(frame, 'game balance 390x844');
    await T(frame, 'act', ['view', 'bar']);
    assert.equal(await frame.evaluate(() => [...document.querySelectorAll('.barcol .barv')].map(b => b.textContent).join(',')), '16,4', 'Finished and Fell bars');
    await T(frame, 'claim', 0);
    await T(frame, 'tap', 'c:Finished');
    await frame.waitForFunction(() => window.__brbTest.state().phase === 'end', null, { timeout: 10_000 });
    s = await T(frame, 'state');
    assert.equal(s.scoreCalls.at(-1).label, '2/5 cases, 6 stars', 'the chapter remembers the first case (saved stars)');
    assert.match(s.scoreCalls.at(-1).label, LABEL);
    assert.deepEqual(s.endCalls, [{ won: true, score: 6 }], 'BRB.gameOver at chapter end with the chapter’s stars');
    // Fair Data: pick the two missing groups
    await T(frame, 'start', { chapter: 'fair', band: '2', level: 4, seed: 1 });
    await T(frame, 'claimCard');
    assert.equal((await T(frame, 'state')).claimsOpen, false, 'no card before the evidence');
    await T(frame, 'act', ['group', 'comes']);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.barcol').length), 1, 'one bar: everyone comes by bus');
    await T(frame, 'claimCard');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.claimtile').length), 4);
    assert.equal(await frame.evaluate(() => document.getElementById('pinBtn').disabled), true);
    await frame.click('.claimtile[data-i="0"]'); await frame.click('.claimtile[data-i="2"]');
    assert.equal(await frame.evaluate(() => document.getElementById('pinBtn').disabled), false);
    await fit(frame, 'pick two 390x844');
    await frame.click('#pinBtn');
    s = await T(frame, 'state');
    assert.deepEqual([s.wrong, s.picked], [1, null]);
    assert.match(s.say, /other grades/);
    await T(frame, 'claim', [0, 1]);
    s = await T(frame, 'state');
    assert.deepEqual([s.picked, s.picks], [0, [0, 1]]);
    await T(frame, 'tap', 'c:Bus');
    await frame.waitForFunction(() => window.__brbTest.state().phase === 'end', null, { timeout: 10_000 });
    s = await T(frame, 'state');
    assert.equal(s.scoreCalls.at(-1).label, '1/4 cases, 2 stars');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('data-detective: My Data in the frame: tally steppers, the chart, a composed claim, the pool, the Pro comparison, the charts-made label', { skip, timeout: 240_000 }, async () => {
  const { ctx, frame, errors } = await open({ size: { width: 390, height: 844 } });
  try {
    await T(frame, 'skipAnimations');
    await T(frame, 'start', { chapter: 'my-data', band: '1b', level: 1, seed: 1, lesson: true, lock: true });
    let s = await T(frame, 'state');
    assert.deepEqual([s.chapter, s.level, s.mode, s.lesson, s.lock, s.preset, s.evidence], ['my-data', 1, 'tally', true, true, 'pets', false]);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.step .ibtn').length), 12, 'a - and + stepper per category');
    assert.equal(await frame.evaluate(() => document.getElementById('questPill').hidden), false, 'Class quest pill in tally mode');
    assert.match(await frame.evaluate(() => document.getElementById('questPill').textContent), /Class quest: My Data · Explorer/);
    await fit(frame, 'my-1 390x844');
    for (let i = 0; i < 4; i++) await frame.click('.step:nth-child(1) .ibtn:last-child');
    s = await T(frame, 'state');
    assert.equal(s.counts.Dog, 4);
    await T(frame, 'act', ['view', 'bar']);
    assert.equal((await T(frame, 'state')).evidence, false, 'four answers is a hunch');
    await T(frame, 'act', ['tally', 'Cat', 3]); await T(frame, 'act', ['tally', 'None', 1]);
    s = await T(frame, 'state');
    assert.deepEqual([s.evidence, s.view], [true, 'bar']);
    await fit(frame, 'my-1 bars 390x844');
    await T(frame, 'claimCard');
    assert.match(await frame.evaluate(() => document.querySelector('.claimtile[data-i="0"]').textContent), /Most kids picked Dog/);
    await frame.click('.claimtile[data-i="2"]');   // more than half: 4 of 8 is not
    s = await T(frame, 'state');
    assert.deepEqual([s.wrong, s.picked], [1, null]);
    assert.match(s.say, /Dog has the most with 4/);
    await T(frame, 'claim', 0);
    await T(frame, 'tap', 'c:Dog');
    assert.equal((await T(frame, 'state')).solved, true);
    await closeCard(frame, 'my-1');
    await untilLevel(frame, 2);
    s = await T(frame, 'state');
    assert.deepEqual([s.charts, s.scoreCalls[0].label, s.scoreCalls[0].score], [1, '1 charts made', 1]);
    assert.match(s.label, TALLY_LABEL);
    assert.equal(await T(frame, 'solve'), true);
    await closeCard(frame, 'my-2');
    await untilLevel(frame, 3);
    s = await T(frame, 'state');
    assert.deepEqual([s.charts, s.scoreCalls[1].label], [2, '2 charts made']);
    // the open tally: pick a question, add the chart to the class pool, another chart, then finish
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.presets .chip').length), 6, 'six questions');
    await frame.click('.presets .chip:nth-child(3)');
    assert.equal((await T(frame, 'state')).preset, 'fruit');
    for (const [c, n] of [['Apple', 5], ['Grape', 4], ['Melon', 2]]) await T(frame, 'act', ['tally', c, n]);
    assert.equal(await frame.evaluate(() => !!document.getElementById('poolBtn')), true);
    await frame.click('#poolBtn');
    s = await T(frame, 'state');
    assert.deepEqual([s.pool.n, s.pool.preset, s.pool.counts.Apple, s.poolView], [1, 'fruit', 5, true]);
    await fit(frame, 'class pool 390x844');
    await T(frame, 'openChoice', 'again');
    assert.equal(await T(frame, 'solve'), true);
    await closeCard(frame, 'my-3');
    await frame.waitForFunction(() => window.__brbTest.state().charts === 3 && window.__brbTest.state().phase === 'case', null, { timeout: 10_000 });
    s = await T(frame, 'state');
    assert.deepEqual([s.level, s.scoreCalls.at(-1).label, s.pool.n], [3, '3 charts made', 1]);
    await T(frame, 'openChoice', 'next');
    assert.equal(await T(frame, 'solve'), true);
    await closeCard(frame, 'my-3');
    await frame.waitForFunction(() => window.__brbTest.state().phase === 'end', null, { timeout: 10_000 });
    s = await T(frame, 'state');
    assert.deepEqual([s.scoreCalls.at(-1).label, s.endCalls], ['4 charts made', [{ won: true, score: 4 }]]);
    assert.ok(s.scoreCalls.every((c, i) => !i || c.score >= s.scoreCalls[i - 1].score), 'monotonic');
    assert.match(await frame.evaluate(() => document.getElementById('endCard').textContent), /Your work is saved/);
    // Pro: another class, compared by percent in the table
    await T(frame, 'start', { chapter: 'my-data', band: '2', level: 2, seed: 1 });
    for (const [c, n] of [['Red', 2], ['Blue', 6], ['Green', 3], ['Yellow', 1]]) await T(frame, 'act', ['tally', c, n]);
    const chips = await frame.evaluate(() => [...document.querySelectorAll('#tools .chip')].map(c => c.textContent));
    await frame.click('#tools .chip:has-text("Another class")');
    s = await T(frame, 'state');
    assert.equal(s.other, true, `Another class loads the second set (chips: ${chips.join(', ')}; band ${s.band}, preset ${s.preset}, level ${s.levelId})`);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('thead th').length), 3, 'ours and the other class');
    await frame.click('.chip[aria-label*="percent"]');
    s = await T(frame, 'state');
    assert.deepEqual([s.pct, s.evidence, s.view], [true, true, 'table']);
    assert.equal(await frame.evaluate(() => [...document.querySelectorAll('thead th')].map(t => t.textContent).join('|')), 'Favorite color|Ours %|Other %', 'the two shares side by side');
    assert.equal(await frame.evaluate(() => document.querySelector('tr[data-row="r:Blue"]').textContent), 'Blue50%33%');
    await fit(frame, 'compare 390x844');
    await T(frame, 'claimCard');
    assert.match(await frame.evaluate(() => document.querySelector('.claimtile[data-i="0"]').textContent), /bigger share of Blue/);
    await T(frame, 'claim', 0);
    assert.equal((await T(frame, 'state')).picked, 0);
    await frame.click('tr[data-row="r:Blue"]');   // Show me: the row with the bigger share; free play moves straight on
    await untilLevel(frame, 3);
    s = await T(frame, 'state');
    assert.deepEqual([s.charts, s.scoreCalls.at(-1).label], [1, '1 charts made']);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('data-detective: desktop size, the chapter map and band toggle, a Pro cleanup case, projector mode, the daily challenge, pairs, a chapter crown', { skip, timeout: 240_000 }, async () => {
  const { ctx, frame, errors } = await open({ size: { width: 1280, height: 800 } });
  try {
    await fit(frame, 'title 1280x800');
    await T(frame, 'skipAnimations');
    await T(frame, 'map');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#tiles .tile').length), 7, 'seven chapter tiles');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#tiles .tile.soon').length), 0, 'nothing is coming soon any more');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#bandSeg button').length), 2, 'Explorer / Pro');
    assert.equal(await frame.evaluate(() => !!document.getElementById('dailyTile') && document.querySelectorAll('#pairRow .ok-switch').length), 1, 'the daily tile and the pairs switch');
    await fit(frame, 'map 1280x800');
    await frame.click('#bandSeg button:nth-child(2)');
    assert.equal((await T(frame, 'state')).band, '2');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#tiles .tile .stars.silver').length), 3, 'Explorer chapters show silver stars for a Pro player');
    await T(frame, 'start', { chapter: 'cleanup', band: '2', level: 1, seed: 5 });
    await fit(frame, 'cleanup-1 1280x800');
    await frame.click('tr[data-row="r3"]');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.rowpanel .btn').length), 6, 'Fix to x3, Merge, Remove, Keep');
    await frame.click('.rowpanel .btn:nth-child(2)');   // Fix to Dog
    let s = await T(frame, 'state');
    assert.deepEqual([s.edits, s.evidence], [1, false]);
    assert.equal(await T(frame, 'solve'), true);   // the script fixes r3 again: one edit over par costs the second star
    await untilLevel(frame, 2);
    s = await T(frame, 'state');
    assert.equal(s.scoreCalls.at(-1).label, '1/6 cases, 2 stars');
    await T(frame, 'start', { chapter: 'sort', band: '1b', level: 1, seed: 1, mode: 'projector' });
    s = await T(frame, 'state');
    assert.deepEqual([s.mode, s.chapter], ['projector', 'sort']);
    assert.equal(await frame.evaluate(() => document.getElementById('game').classList.contains('proj')), true);
    await fit(frame, 'projector 1280x800');
    // the Daily Crew Challenge: one case per day and band, its own card, nothing in the gradebook
    const dl = await T(frame, 'dailyLevel', 20400, '1b');
    assert.equal(await T(frame, 'dailyLevel', 20400, '1b'), dl, 'deterministic per day');
    assert.ok(LEVELS.find(l => l.id === dl).bands.includes('1b') && !LEVELS.find(l => l.id === dl).tally, 'an Explorer case, never the tally');
    assert.notEqual(await T(frame, 'dailyLevel', 20401, '1b'), dl, 'another day, another case (most days)');
    await T(frame, 'start', { daily: true, day: 20400, band: '1b' });
    s = await T(frame, 'state');
    assert.deepEqual([s.daily, s.levelId, s.lesson, s.mode], [20400, dl, false, 'play']);
    assert.equal(await frame.evaluate(() => document.getElementById('progT').textContent), 'Daily');
    await fit(frame, 'daily 1280x800');
    assert.equal(await T(frame, 'solve'), true);
    await frame.waitForFunction(() => window.__brbTest.state().phase === 'end', null, { timeout: 10_000 });
    s = await T(frame, 'state');
    assert.deepEqual([s.scoreCalls, s.endCalls], [[], []], 'the daily never reports progress');
    assert.match(await frame.evaluate(() => document.getElementById('endCard').textContent), /Daily Crew Challenge.*3 of 3 stars today/);
    await fit(frame, 'daily card 1280x800');
    // pair mode: whose turn in the HUD, Swap! every third case
    await T(frame, 'start', { chapter: 'sort', band: '1b', level: 1, seed: 1, pairs: true });
    s = await T(frame, 'state');
    assert.deepEqual([s.pairs, s.turn, s.daily], [true, 0, null]);
    assert.equal(await frame.evaluate(() => !document.getElementById('turnPill').hidden && document.querySelectorAll('#turnPill canvas').length), 1, 'the current player\u2019s face');
    assert.match(await frame.evaluate(() => document.getElementById('turnPill').textContent), /Player 1/);
    await fit(frame, 'pairs 1280x800');
    for (let i = 1; i <= 3; i++) { assert.equal(await T(frame, 'solve'), true); await untilLevel(frame, i + 1); }
    s = await T(frame, 'state');
    assert.deepEqual([s.level, s.turn, s.swaps], [4, 1, 1], 'the device swaps after three cases');
    assert.match(await frame.evaluate(() => document.getElementById('turnPill').textContent), /Player 2/);
    await T(frame, 'start', { chapter: 'sort', band: '1b', level: 1, seed: 1, pairs: false });
    assert.equal(await frame.evaluate(() => document.getElementById('turnPill').hidden), true);
    // a chapter crown: every star in Chart It recolors Dot's coat and marks the tile
    const coat0 = await frame.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dd-coat'));
    await T(frame, 'start', { chapter: 'chart', band: '1b', level: 1, seed: 1 });
    for (let i = 1; i <= 5; i++) { assert.equal(await T(frame, 'solve'), true); if (i < 5) await untilLevel(frame, i + 1); }
    await frame.waitForFunction(() => window.__brbTest.state().phase === 'end', null, { timeout: 10_000 });
    s = await T(frame, 'state');
    assert.deepEqual([s.stars, s.crowns], [15, ['chart']]);
    assert.notEqual(await frame.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dd-coat')), coat0, 'a new coat color');
    assert.match(await frame.evaluate(() => document.getElementById('endCard').textContent), /Chapter crown/);
    await T(frame, 'map');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#tiles .tile .crown').length), 1, 'the crown on the map tile');
    await fit(frame, 'map with a crown 1280x800');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('data-detective: Arabic reads right to left with numbers left to right, and the same play works on every kind of case', { skip, timeout: 180_000 }, async () => {
  const { ctx, frame, errors } = await open({ lang: 'ar', size: { width: 390, height: 844 } });
  try {
    assert.match(await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').textContent), /العب/);
    await T(frame, 'skipAnimations');
    await T(frame, 'start', { chapter: 'sort', band: '1b', level: 1, seed: 1 });
    const r = await frame.evaluate(() => ({ dir: document.getElementById('game').dir, lang: document.documentElement.lang, num: document.querySelector('td.num').dir, prog: document.getElementById('prog').dir }));
    assert.deepEqual(r, { dir: 'rtl', lang: 'en', num: 'ltr', prog: 'ltr' });   // no Arabic pack yet: English words, mirrored chrome
    await fit(frame, 'sort-1 ar 390x844');
    assert.equal(await T(frame, 'solve'), true);
    await T(frame, 'start', { chapter: 'models', band: '2', level: 5, seed: 1 });
    await T(frame, 'act', ['run']);
    assert.equal(await frame.evaluate(() => document.getElementById('rule').dir), 'ltr', 'the slider reads left to right');
    await fit(frame, 'game balance ar 390x844');
    assert.equal(await T(frame, 'solve'), true);
    await T(frame, 'start', { chapter: 'my-data', band: '2', level: 3, seed: 1 });
    await T(frame, 'act', ['preset', 'transport']);
    for (const [c, n] of [['Walk', 3], ['Bus', 6]]) await T(frame, 'act', ['tally', c, n]);
    await T(frame, 'act', ['view', 'picto']);
    await fit(frame, 'tally ar 390x844');
    assert.equal(await T(frame, 'solve'), true);
    await T(frame, 'keypad');
    assert.equal(await frame.evaluate(() => document.querySelector('.dd-modal .code').dir), 'ltr');
    await fit(frame, 'keypad ar 390x844');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('data-detective: the cover hook stages a half-solved case: Pet Parade grouped by Pet, three bars with printed values in view, Dot pleased, the claim card not yet open (it would hide the data on a card-sized frame)', { skip, timeout: 120_000 }, async () => {
  const { ctx, frame, errors } = await open({ size: { width: 360, height: 480 } });
  try {
    await T(frame, 'cover');
    const s = await T(frame, 'state');
    assert.deepEqual([s.chapter, s.level, s.view, s.evidence, s.claimsOpen, s.screen], ['sort', 3, 'group', true, false, 'play']);
    assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('.barcol')].map(b => b.querySelector('.barv').textContent)), ['4', '2', '2'], 'the grouped counts, printed on the bars');
    assert.ok(await frame.evaluate(() => { const r = document.querySelector('.barcol').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'the bars are inside the card-sized frame');
    assert.equal(await frame.evaluate(() => document.querySelector('.chip[aria-pressed="true"] .mark svg') !== null), true, 'the pressed Group chip');
    assert.equal(await frame.evaluate(() => document.getElementById('dotSay').textContent), 'That view answers it. Pin your claim!');
    // 360x480 is the cover tool's frame, smaller than any audit size: the work panel scrolls there, so no layout audit here (the five sizes are checked below)
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

/* ---------- the contract's frame matrix: level 1 of two chapters at a phone and a desktop size, in English and Arabic (right to left) ---------- */
for (const [w, h] of [[390, 844], [1280, 800]]) for (const lang of ['en', 'ar']) {
  test(`data-detective: ${w}x${h} ${lang}: level 1 of Sort & Group (lesson mode) and of Clues & Claims through __brbTest, the label grammar, the layout, no console errors`, { skip, timeout: 150_000 }, async () => {
    const { ctx, frame, errors, kit } = await open({ size: { width: w, height: h }, lang });
    try {
      assert.ok(kit.some(k => k.endsWith('/oomba-kit.js')) && kit.filter(k => k.includes('/packs/')).length === 3, 'the pinned kit and its three packs, served from public/vendor/oomba-kit');
      await fit(frame, `title ${w}x${h} ${lang}`);
      await T(frame, 'skipAnimations');
      await T(frame, 'start', { chapter: 'sort', band: '1b', level: 1, seed: 1, lesson: true });
      let s = await T(frame, 'state');
      assert.deepEqual([s.screen, s.chapter, s.level, s.lesson, s.dir], ['play', 'sort', 1, true, lang === 'ar' ? 'rtl' : 'ltr']);
      assert.equal(await frame.evaluate(() => document.querySelector('td.num').dir), 'ltr', 'numbers read left to right in every language');
      await fit(frame, `sort-1 ${w}x${h} ${lang}`);
      assert.equal(await T(frame, 'solve'), true);
      await closeCard(frame, 'sort-1');
      await untilLevel(frame, 2);
      s = await T(frame, 'state');
      assert.equal(s.scoreCalls.length, 1, 'one BRB.score.submit per solved case');
      assert.equal(s.scoreCalls[0].label, '1/6 cases, 3 stars, 1/1 checks');
      assert.match(s.scoreCalls[0].label, LABEL);
      assert.ok(s.label.length <= 40 && /^[\x20-\x7e]+$/.test(s.label), 'ASCII, at most 40 characters, whatever the language');
      await T(frame, 'start', { chapter: 'claims', band: '1b', level: 1, seed: 1 });
      s = await T(frame, 'state');
      assert.deepEqual([s.chapter, s.level, s.lesson, s.view], ['claims', 1, false, 'bar']);
      await fit(frame, `claims-1 ${w}x${h} ${lang}`);
      assert.equal(await T(frame, 'solve'), true);
      await untilLevel(frame, 2);
      s = await T(frame, 'state');
      assert.equal(s.scoreCalls.at(-1).label, '1/6 cases, 3 stars');
      assert.match(s.scoreCalls.at(-1).label, LABEL);
      assert.ok(s.scoreCalls.at(-1).score <= 999 && Number.isInteger(s.scoreCalls.at(-1).score));
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

/* ---------- the five audit sizes on the densest screens, at 100% and 150% text ---------- */
// The five audit sizes, plus a phone on its side under the play page's 52 px bar: the frame is then only 338 px tall, the shortest a case ever gets.
const SIZES = { 'phone-portrait': [390, 844], 'phone-landscape': [844, 390], 'phone-landscape under the play bar': [844, 390, 52], 'tablet-portrait': [820, 1180], 'tablet-landscape': [1180, 820], desktop: [1280, 800] };
test('data-detective: the densest screens fit all five audit sizes (and a phone on its side under the play bar) at 100% and 150% text: the 12-row clean-up table and its row card, the 20-run Game Balance table and bars, eight steppers, eight bars and pictographs, the percent comparison, the four-tile pick-two card, the keypad, the Quest Card', { skip, timeout: 600_000 }, async () => {
  for (const [name, [w, h, bar]] of Object.entries(SIZES)) {
    const { ctx, frame, errors } = await open({ size: { width: w, height: h }, bar });
    if (bar) assert.equal(await frame.evaluate(() => innerHeight), h - bar, 'the frame sits under the bar');
    try {
      await T(frame, 'skipAnimations');
      const dense = async tag => {
        await T(frame, 'start', { chapter: 'cleanup', band: '2', level: 1, seed: 5 });
        assert.equal(await frame.evaluate(() => document.querySelectorAll('tr[data-row]').length), 12, 'the longest table');
        await fit(frame, `cleanup-1 ${name} ${tag}`);
        await frame.click('tr[data-row="r3"]');
        await frame.waitForSelector('.dd-modal .rowpanel', { timeout: 5_000 });
        await fit(frame, `row card ${name} ${tag}`);
        await T(frame, 'closeDialog');
        await T(frame, 'start', { chapter: 'models', band: '2', level: 5, seed: 1 });
        await T(frame, 'act', ['run']); await T(frame, 'act', ['view', 'table']);
        assert.equal(await frame.evaluate(() => document.querySelectorAll('tbody tr').length), 20, 'twenty test runs');
        await fit(frame, `game balance table ${name} ${tag}`);
        await T(frame, 'act', ['view', 'bar']);
        assert.equal(await frame.evaluate(() => document.querySelectorAll('.runs span').length), 20, 'the strip of twenty runs');
        await fit(frame, `game balance bars ${name} ${tag}`);
        await T(frame, 'start', { chapter: 'my-data', band: '2', level: 3, seed: 1 });
        await T(frame, 'act', ['preset', 'options']);
        for (const [c, n] of [['Option A', 4], ['Option B', 7], ['Option C', 2], ['Option D', 5], ['Option E', 1], ['Option F', 3], ['Option G', 6], ['Option H', 2]]) await T(frame, 'act', ['tally', c, n]);
        assert.equal(await frame.evaluate(() => document.querySelectorAll('.step').length), 8, 'eight steppers (the most categories a question has)');
        await fit(frame, `eight steppers ${name} ${tag}`);
        await T(frame, 'act', ['view', 'bar']);
        assert.equal(await frame.evaluate(() => document.querySelectorAll('.barcol').length), 8);
        await fit(frame, `eight bars ${name} ${tag}`);
        await T(frame, 'act', ['view', 'picto']);
        await fit(frame, `eight pictographs ${name} ${tag}`);
        await T(frame, 'act', ['other']); await T(frame, 'act', ['pct']); await T(frame, 'act', ['view', 'table']);
        assert.equal(await frame.evaluate(() => document.querySelectorAll('thead th').length), 3);
        await fit(frame, `compare eight rows ${name} ${tag}`);
        await T(frame, 'start', { chapter: 'fair', band: '2', level: 4, seed: 1 });
        await T(frame, 'act', ['group', 'comes']); await T(frame, 'claimCard');
        assert.equal(await frame.evaluate(() => document.querySelectorAll('.claimtile').length), 4, 'the widest claim card');
        await fit(frame, `pick two card ${name} ${tag}`);
        await T(frame, 'closeDialog');
        await T(frame, 'keypad');
        await fit(frame, `keypad ${name} ${tag}`);
        await T(frame, 'closeDialog');
        await T(frame, 'questCard');
        await fit(frame, `quest card ${name} ${tag}`);
        await T(frame, 'closeDialog');
      };
      await dense('100%');
      await T(frame, 'textSize', 1.5);
      assert.equal(await frame.evaluate(() => Math.round(parseFloat(getComputedStyle(document.getElementById('game')).fontSize))), 24, 'the game text follows the kit text size (16 px at 100%, 24 px at 150%)');
      await dense('150%');
      await T(frame, 'textSize', 1);
      assert.deepEqual(errors, [], name);
    } finally { await ctx.close(); }
  }
});

/* ---------- settings parity with kit games (map-games.md section 7) ---------- */
test('data-detective: settings parity: the title cog and the HUD gear open the kit settings, left-handed mirrors the controls, proved rows and pressed chips carry a shape, the learn card is captioned and read aloud, arrow keys walk the bars and the claim tiles', { skip, timeout: 150_000 }, async () => {
  const { ctx, frame, errors } = await open({ size: { width: 844, height: 390 } });   // a phone on its side: the panels sit side by side
  try {
    // the kit title's settings cog
    await frame.click('.ok-title-screen .ok-corner button');
    await frame.waitForSelector('.ok-settings [role="switch"]', { timeout: 10_000 });
    assert.ok(await frame.evaluate(() => document.querySelectorAll('.ok-settings [role="switch"]').length >= 5), 'the kit settings panel: music, captions, read aloud, contrast, color cues, left-handed');
    await T(frame, 'closeDialog');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.ok-settings').length), 0, 'closed again');
    await T(frame, 'skipAnimations');
    await T(frame, 'start', { chapter: 'models', band: '2', level: 1, seed: 2 });
    // the HUD gear: the Quest Card, with Settings on it
    await frame.click('#gearBtn');
    await frame.waitForSelector('.dd-modal', { timeout: 5_000 });
    assert.ok(await frame.evaluate(() => [...document.querySelectorAll('.dd-modal .srow')].length >= 3), 'band, pairs, read aloud');
    await frame.click('.dd-modal .btn:has-text("Settings")');
    await frame.waitForSelector('.ok-settings [role="switch"]', { timeout: 10_000 });
    await T(frame, 'closeDialog');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.ok-settings, .dd-modal').length), 0, 'both cards closed');
    // left-handed: the HUD's buttons and the work panel move to the left (and back)
    assert.equal(await frame.evaluate(() => getComputedStyle(document.getElementById('hud')).flexDirection), 'row');
    await frame.evaluate(() => Oomba.settings.set({ leftHanded: true }));
    assert.equal(await frame.evaluate(() => document.getElementById('game').classList.contains('lefty')), true);
    assert.equal(await frame.evaluate(() => getComputedStyle(document.getElementById('hud')).flexDirection), 'row-reverse');
    assert.equal(await frame.evaluate(() => getComputedStyle(document.querySelector('.case')).flexDirection), 'row-reverse', 'side by side: the work panel on the left');
    assert.ok(await frame.evaluate(() => document.getElementById('runBtn').getBoundingClientRect().left < innerWidth / 2), 'Run is on the left half');
    await fit(frame, 'left-handed 844x390');
    await frame.evaluate(() => Oomba.settings.set({ leftHanded: false }));
    assert.equal(await frame.evaluate(() => [document.getElementById('game').classList.contains('lefty'), getComputedStyle(document.getElementById('hud')).flexDirection].join()), 'false,row');
    // shapes next to colors: a pressed chip, a trial inside the tolerance, a proved row
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.chip[aria-pressed="true"] .mark svg').length), 1, 'the pressed view chip carries a check');
    await T(frame, 'act', ['rule', 2]); await T(frame, 'act', ['run']);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('td.off.ok svg').length), 5, 'every trial inside the tolerance shows a check, not only a color');
    await T(frame, 'claim', 0); await T(frame, 'tap', 'r1');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('tr.proved[data-row="r1"] .mark svg').length), 1, 'the proved row carries a check');
    await T(frame, 'start', { chapter: 'claims', band: '1b', level: 1, seed: 1 });   // a bar chart case with two bars to prove
    await T(frame, 'claim', 0); await T(frame, 'tap', 'c:Day 2');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.barcol.proved .mark svg').length), 1, 'so does the proved bar');
    // arrow keys walk the bars (left and right) and the claim tiles (down and up)
    await frame.focus('.barbtn'); await frame.press('.barbtn', 'ArrowRight');
    assert.equal(await frame.evaluate(() => document.activeElement === document.querySelectorAll('.barbtn')[1]), true, 'ArrowRight moves to the next bar');
    await frame.press('.barcol:nth-child(2) .barbtn', 'ArrowLeft');
    assert.equal(await frame.evaluate(() => document.activeElement === document.querySelectorAll('.barbtn')[0]), true, 'ArrowLeft moves back');
    await T(frame, 'start', { chapter: 'fair', band: '2', level: 4, seed: 1 });
    await T(frame, 'act', ['group', 'comes']); await T(frame, 'claimCard');
    await frame.waitForSelector('.claimtile', { timeout: 5_000 });
    await frame.focus('.claimtile[data-i="0"]'); await frame.press('.claimtile[data-i="0"]', 'ArrowRight');
    assert.equal(await frame.evaluate(() => document.activeElement.dataset.i), '1', 'ArrowRight moves to the next tile');
    const perRow = await frame.evaluate(() => { const t = [...document.querySelectorAll('.claimtile')], y = t[0].getBoundingClientRect().top; return t.filter(x => Math.abs(x.getBoundingClientRect().top - y) < 4).length; });
    await frame.press('.claimtile[data-i="1"]', 'ArrowDown');
    assert.equal(await frame.evaluate(() => document.activeElement.dataset.i), String((1 + perRow) % 4), `ArrowDown steps a whole row (${perRow} tiles across)`);
    await frame.press(`.claimtile[data-i="${(1 + perRow) % 4}"]`, 'ArrowUp');
    assert.equal(await frame.evaluate(() => document.activeElement.dataset.i), '1', 'ArrowUp steps back up');
    await T(frame, 'closeDialog');
    // captions and read-aloud: the learn card is read while it is open (the caption strip shows its words)
    await T(frame, 'start', { chapter: 'fair', band: '2', level: 1, seed: 1 });   // level 1 of a chapter: it has a learn card
    assert.equal(await frame.evaluate(() => document.getElementById('learnBtn').hidden), false, 'the learn card button in the HUD');
    await frame.evaluate(() => Oomba.settings.set({ captions: true }));
    await frame.click('#learnBtn');
    await frame.waitForSelector('.ok-ui .ok-modal', { timeout: 5_000 });
    const learn = LEVELS.find(l => l.id === 'fair-1').learn;
    assert.notEqual(learn, undefined);
    // Dot's earlier lines are still being read (a caption holds for its reading time, one line after another), so the learn card's turn comes within a few seconds
    const shown = await frame.waitForFunction(want => { const c = document.querySelector('.ok-caption'); return c && c.classList.contains('on') && c.textContent.includes(want) && c.textContent; }, learn.text.slice(0, 24), { timeout: 30_000 });
    assert.ok(String(await shown.jsonValue()).includes(learn.title), 'the caption strip reads the learn card, its title first');
    await T(frame, 'closeDialog');
    await frame.evaluate(() => Oomba.settings.set({ captions: false }));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
