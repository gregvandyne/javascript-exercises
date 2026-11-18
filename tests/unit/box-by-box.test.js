// The Big Divide (slug box-by-box; seed-games/box-by-box.html, built from tools/box-by-box): long division and multiplication worked box by
// box. Its activities are shared as question sets (services/game-sets.js): one activity per set, only numbers and
// fixed settings (no title or other free text leaves the teacher's save). This file: the set cleaner, what the Assign
// page and the lesson call an activity, and saving one through the route and opening it in the frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reset, call, publish, official, kid, teacher, games } from './_live.js';
import * as gameSets from '../../server/services/game-sets.js';
import { parseParams } from '../../server/services/play-params.js';

const DIV = { k: 'divide', p: [[92, 4], [612, 6], [1000, 3]], l: 'guided' };
const MUL = { k: 'multiply', p: [[24, 13], [4096, 908]], l: 'countUp' };

test('box-by-box sets: one activity of problems the game can work, a known level, flags only for a custom mix', () => {
  const clean = gameSets.SET_GAMES.get('box-by-box');
  assert.deepEqual(clean([DIV]), [DIV]);
  assert.deepEqual(clean([MUL]), [MUL]);
  assert.deepEqual(clean([{ ...DIV, p: [['92', '4']] }]), [{ ...DIV, p: [[92, 4]] }], 'numbers written as text are read');
  assert.deepEqual(clean([{ ...DIV, l: 'custom', c: '0100001' }]), [{ ...DIV, l: 'custom', c: '0100001' }]);
  const plan = { count: 16, dividends: [100, 999], divisors: [2, 9], remainders: false };
  assert.deepEqual(clean([{ k: 'divide', p: [], l: 'guided', d: 1, g: plan }]), [{ k: 'divide', p: [], l: 'guided', d: 1, g: plan }], 'a fresh set per student');
  const bad = [
    [], [DIV, MUL], 'x', [null],
    [{ ...DIV, k: 'add' }], [{ ...DIV, l: 'expert' }], [{ ...DIV, p: [] }], [{ ...DIV, p: Array(101).fill([92, 4]) }],
    [{ ...DIV, p: [[92, 1]] }], [{ ...DIV, p: [[3, 4]] }], [{ ...DIV, p: [[1234567, 4]] }], [{ ...DIV, p: [[92.5, 4]] }],
    [{ ...MUL, p: [[24, 1]] }], [{ ...MUL, p: [[24, 130]] }], [{ ...MUL, p: [[24]] }],
    [{ ...DIV, l: 'custom' }], [{ ...DIV, l: 'custom', c: '01' }],
    [{ k: 'divide', p: [], l: 'guided', d: 1 }], [{ k: 'divide', p: [], l: 'guided', d: 1, g: { ...plan, count: 0 } }],
    [{ k: 'multiply', p: [], l: 'guided', d: 1, g: { count: 12, tops: [10, 99], bottoms: [1, 99] } }],
  ];
  for (const b of bad) assert.equal(clean(b), null, JSON.stringify(b).slice(0, 80));
  // Nothing else rides along: no title, no other keys.
  assert.deepEqual(clean([{ ...DIV, n: 'Ms Smith’s class', note: 'hi' }]), [DIV]);
});

test('box-by-box sets: the method is one of the kind’s own (never free text); a set without one is the standard algorithm', () => {
  const clean = gameSets.SET_GAMES.get('box-by-box');
  assert.deepEqual(gameSets.BB_METHODS, { divide: ['standard', 'ladder', 'area'], multiply: ['standard', 'area', 'partial'] });
  for (const m of ['ladder', 'area']) assert.deepEqual(clean([{ ...DIV, m }]), [{ ...DIV, m }]);
  for (const m of ['area', 'partial']) assert.deepEqual(clean([{ ...MUL, m }]), [{ ...MUL, m }]);
  assert.deepEqual(clean([{ ...DIV, m: 'standard' }]), [DIV], 'the standard algorithm is kept as a set without a method, as before');
  assert.deepEqual(clean([DIV]), [DIV], 'an old set, unchanged');
  const plan = { count: 16, dividends: [100, 999], divisors: [2, 9], remainders: true };
  assert.deepEqual(clean([{ k: 'divide', p: [], l: 'countUp', d: 1, g: plan, m: 'ladder' }]), [{ k: 'divide', p: [], l: 'countUp', d: 1, g: plan, m: 'ladder' }]);
  for (const bad of [{ ...DIV, m: 'partial' }, { ...MUL, m: 'ladder' }, { ...DIV, m: 'Ladder' }, { ...DIV, m: 'ladder method' }, { ...DIV, m: '' }, { ...DIV, m: 1 }, { ...DIV, m: ['ladder'] }, { ...DIV, m: { x: 1 } }])
    assert.equal(clean([bad]), null, JSON.stringify(bad.m));
});

test('box-by-box: a teacher saves an activity, its link opens it, the Assign page and the lesson name it', async () => {
  reset();
  const g = publish(official, '<!doctype html><title>t</title><p>bb</p>', { source: 'seed', slug: 'box-by-box', title: 'The Big Divide' });
  const r = await call(`/api/games/${g.id}/sets`, { method: 'POST', body: { items: [DIV] }, user: teacher });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.id, gameSets.SET_ID);
  assert.equal((await call(`/api/games/${g.id}/sets`, { method: 'POST', body: { items: [{ ...DIV, p: [[3, 4]] }] }, user: teacher })).status, 400);
  assert.equal((await call(`/api/games/${g.id}/sets`, { method: 'POST', body: { items: [{ a: 'solve', p: '2x=4' }] }, user: teacher })).status, 400, "another game's shape");
  const page = await call(`/play/box-by-box?chapter=${r.json.id}&lock=1`, { user: kid });
  const fr = await call(/data-src="(\/frame\/[^"]+?)"/.exec(page.text)[1].replace(/&amp;/g, '&'), { user: kid });
  const init = JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(fr.text)[1]);
  assert.deepEqual(init.set, { id: r.json.id, items: [DIV], mine: false });
  assert.deepEqual(gameSets.describe(g.id, parseParams(`chapter=${r.json.id}&lock=1`), 'box-by-box'), { kind: 'one', label: 'Long division, 3 problems, Guided' });
  const per = gameSets.save(g.id, teacher.id, [{ k: 'multiply', p: [[24, 13], [57, 16]], l: 'onMyOwn', d: 1, g: { count: 12, tops: [10, 99], bottoms: [10, 99] } }], null, 'box-by-box');
  assert.equal(gameSets.describe(g.id, { chapter: per.id }, 'box-by-box').label, 'Multiplication, 2 problems (different for each student), On my own');
  assert.equal(gameSets.describe(g.id, { mode: 'solve', chapter: '2xp3q7' }, 'box-by-box'), null, 'only its own sets');
  const pg = await call(`/teach/assign?game=box-by-box&opts=${encodeURIComponent(`chapter=${r.json.id}&lock=1`)}`, { user: teacher });
  assert.match(pg.text, /Students open: Long division, 3 problems, Guided/);
  assert.match((await call('/teach/assign?game=box-by-box', { user: teacher })).text, /in the game first/);
});

// ---------------------------------------------------------------- the game file
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanVersion } from '../../server/services/scanner.js';
import { sanitizeGameHtml } from '../../server/services/sanitize.js';
import { kitTag } from '../../server/services/kit.js';
import { SEED_GAMES } from '../../scripts/seed.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(ROOT, 'seed-games/box-by-box.html'), 'utf8');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/box-by-box.json'), 'utf8'));

test('box-by-box: a registered Play game that passes the safety scan, with the pinned Oomba Kit tag and no outside address', () => {
  assert.ok(SEED_GAMES.includes('box-by-box'));
  assert.equal(meta.slug, 'box-by-box'); assert.equal(meta.shelf, 'play'); assert.equal(meta.title, 'The Big Divide');
  for (const l of ['en-GB', 'pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) { assert.ok(meta.l10n[l]?.description.length > 80, l); assert.ok(meta.l10n[l].title, `${l}: its title`); }
  assert.equal(meta.l10n['en-GB'].title, meta.title);
  assert.ok(fs.existsSync(path.join(ROOT, 'public/covers/box-by-box.jpg')), 'its cover');
  const r = scanVersion(sanitizeGameHtml(html).html);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(html.includes(kitTag()));
  const urls = (html.match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)<>]*/gi) || []).filter(u => !/^http:\/\/www\.w3\.org\//.test(u));
  assert.deepEqual(urls, []);
  assert.doesNotMatch(html, /mailto:|googletagmanager|\bgtag\(|posthog|beacon/i);
});

test('box-by-box: nothing in the game, its sources, its metadata or its docs points back to the app it was rebuilt from', () => {
  // The words are kept out of this file too: spelled by character code.
  const w = codes => String.fromCharCode(...codes);
  const KEPT = [w([100, 105, 103, 105, 116]) + '\\s*-?\\s*' + w([100, 114, 105, 108, 108, 115]), w([116, 101, 97, 99, 104, 101, 114, 46, 100, 101, 118]),
    w([116, 101, 97, 99, 104, 101, 114, 100, 111, 116, 100, 101, 118]), w([109, 100, 112, 114, 97, 99, 116, 105, 99, 101]), w([109, 97, 116, 104, 102, 114, 111, 103]),
    w([109, 117, 108, 116, 105, 112, 108, 105, 99, 97, 116, 105, 111, 110, 45, 100, 105, 118, 105, 115, 105, 111, 110, 45, 112, 114, 97, 99, 116, 105, 99, 101])];
  const re = new RegExp(KEPT.join('|'), 'i');
  const files = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.name === 'node_modules' || e.name === 'dist' ? [] : e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of [path.join(ROOT, 'seed-games/box-by-box.html'), path.join(ROOT, 'seed-games/box-by-box.json'), path.join(ROOT, 'scripts/covers/box-by-box.recipe.js'),
    path.join(ROOT, 'tests/unit/box-by-box.test.js'), path.join(ROOT, 'server/services/game-sets.js'), path.join(ROOT, 'docs/sdk.md'),
    ...files(path.join(ROOT, 'tools/box-by-box'))]) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), re, path.relative(ROOT, f));
  }
  // The decision log: the game's own entry, headed by its first name, Box by Box (other entries credit other games' sources, as their licenses ask).
  const log = fs.readFileSync(path.join(ROOT, 'docs/decisions.md'), 'utf8');
  const entry = log.slice(log.indexOf('## Box by Box'));
  assert.ok(entry.length > 200);
  assert.doesNotMatch(entry.slice(0, entry.indexOf('\n## ', 5) > 0 ? entry.indexOf('\n## ', 5) : undefined), re, 'docs/decisions.md: the Box by Box entry');
});

test('box-by-box: a student types a saved activity’s class code and gets it to play', async () => {
  reset();
  const g = games.getGameBySlug('box-by-box') || publish(official, '<!doctype html><title>t</title><p>bb</p>', { source: 'seed', slug: 'box-by-box', title: 'The Big Divide' });
  const r = await call(`/api/games/${g.id}/sets`, { method: 'POST', body: { items: [MUL] }, user: teacher });
  const code = r.json.id.slice(2).toUpperCase();
  const got = await call(`/api/games/${g.id}/sets/${code.slice(0, 5)}%20${code.slice(5)}`, { user: kid });
  assert.equal(got.status, 200); assert.deepEqual(got.json, { id: r.json.id, items: [MUL] });
});

test('box-by-box: the activity’s label names its method (Ladder, Area model, Partial products), and not the standard one', async () => {
  reset();
  const g = games.getGameBySlug('box-by-box') || publish(official, '<!doctype html><title>t</title><p>bb</p>', { source: 'seed', slug: 'box-by-box', title: 'The Big Divide' });
  const label = items => gameSets.describe(g.id, { chapter: gameSets.save(g.id, teacher.id, items, null, 'box-by-box').id }, 'box-by-box').label;
  assert.equal(label([{ ...DIV, m: 'ladder' }]), 'Long division, 3 problems, Ladder, Guided');
  assert.equal(label([{ ...DIV, m: 'area', l: 'onMyOwn' }]), 'Long division, 3 problems, Area model, On my own');
  assert.equal(label([{ ...MUL, m: 'partial' }]), 'Multiplication, 2 problems, Partial products, Count up');
  assert.equal(label([{ ...MUL, m: 'area', l: 'watch' }]), 'Multiplication, 2 problems, Area model, Watch');
  assert.equal(label([DIV]), 'Long division, 3 problems, Guided', 'an old set: as before');
  assert.equal(label([{ ...DIV, m: 'standard' }]), 'Long division, 3 problems, Guided');
});

test('box-by-box sets: remainders as a fraction or a decimal ride in r (division only, one of two words); old sets stay exactly as they were', () => {
  const clean = gameSets.SET_GAMES.get('box-by-box');
  assert.deepEqual(gameSets.BB_FORMS, ['fraction', 'decimal']);
  for (const r of ['fraction', 'decimal']) assert.deepEqual(clean([{ ...DIV, r }]), [{ ...DIV, r }]);
  const plan = { count: 16, dividends: [100, 999], divisors: [2, 9], remainders: true };
  assert.deepEqual(clean([{ k: 'divide', p: [], l: 'guided', d: 1, g: plan, r: 'fraction' }]), [{ k: 'divide', p: [], l: 'guided', d: 1, g: plan, r: 'fraction' }]);
  for (const bad of [{ ...DIV, r: 'R' }, { ...DIV, r: 'Fraction' }, { ...DIV, r: '2/3' }, { ...DIV, r: 1 }, { ...DIV, r: ['fraction'] }, { ...MUL, r: 'fraction' }])
    assert.equal(clean([bad]), null, JSON.stringify(bad.r));
  // byte for byte: a set saved before is cleaned to the very same JSON
  for (const old of [DIV, MUL, { ...DIV, m: 'ladder' }, { k: 'divide', p: [], l: 'guided', d: 1, g: { ...plan, remainders: false } }])
    assert.equal(JSON.stringify(clean([JSON.parse(JSON.stringify(old))])), JSON.stringify([old]));
});

test('box-by-box: the label says how remainders are written when they are a fraction or a decimal', async () => {
  reset();
  const g = games.getGameBySlug('box-by-box') || publish(official, '<!doctype html><title>t</title><p>bb</p>', { source: 'seed', slug: 'box-by-box', title: 'The Big Divide' });
  const label = items => gameSets.describe(g.id, { chapter: gameSets.save(g.id, teacher.id, items, null, 'box-by-box').id }, 'box-by-box').label;
  assert.equal(label([{ ...DIV, r: 'fraction' }]), 'Long division, 3 problems, remainders as fractions, Guided');
  assert.equal(label([{ ...DIV, r: 'decimal', l: 'onMyOwn' }]), 'Long division, 3 problems, answers as decimals, On my own');
  assert.equal(label([{ ...DIV, r: 'fraction', m: 'ladder' }]), 'Long division, 3 problems, remainders as fractions, Ladder, Guided');
});
