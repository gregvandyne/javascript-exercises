// Algebra Builder (seed-games/algebra-builder.html, built from tools/algebra-builder by its build.mjs; adapted from Algebra
// Tiles by teacher.dev, Apache-2.0): the committed page is a registered Play game that passes the safety scan with the
// pinned Oomba Kit tag, carries no outside address or kept-out name, credits the original, and its problem links fit
// Oomba's lesson parameters. The frame tells a game its own Oomba address (BRB.gameUrl), and the play page copies for a
// game only that game's own link or a small PNG (BRB.copy).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reset, call, publish, official, kid, teacher, auth, q } from './_live.js';
import * as gameSets from '../../server/services/game-sets.js';
import { deleteAccount } from '../../server/services/account-delete.js';
import { createGuest } from '../../server/auth.js';
import { scanVersion } from '../../server/services/scanner.js';
import { sanitizeGameHtml } from '../../server/services/sanitize.js';
import { kitTag } from '../../server/services/kit.js';
import { parseParams } from '../../server/services/play-params.js';
import { SEED_GAMES } from '../../scripts/seed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = path.join(ROOT, 'tools/algebra-builder');
const html = fs.readFileSync(path.join(ROOT, 'seed-games/algebra-builder.html'), 'utf8');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/algebra-builder.json'), 'utf8'));
const KEPT_OUT = String.fromCharCode(99, 97, 114, 101, 116);

test('a registered Play game that passes the safety scan, with the pinned Oomba Kit tag', () => {
  assert.ok(SEED_GAMES.includes('algebra-builder'));
  assert.equal(meta.slug, 'algebra-builder'); assert.equal(meta.shelf, 'play'); assert.equal(meta.title, 'Algebra Builder');
  assert.ok(fs.existsSync(path.join(ROOT, 'public/covers/algebra-builder.jpg')), 'its cover');
  const r = scanVersion(sanitizeGameHtml(html).html);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(html.includes(kitTag()), 'the exact pinned kit tag');
  assert.ok(Buffer.byteLength(html) < 600 * 1024);
  for (const l of ['en-GB', 'pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) assert.ok(meta.l10n[l] && meta.l10n[l].description.length > 80, l);
});

test('it credits the original under its license, and carries no outside address or kept-out name', () => {
  assert.match(html, /Adapted from Algebra Tiles by teacher\.dev .*Apache License 2\.0/);
  assert.match(fs.readFileSync(path.join(TOOL, 'LICENSE'), 'utf8'), /Apache License\s+Version 2\.0/);
  assert.match(fs.readFileSync(path.join(TOOL, 'NOTICE'), 'utf8'), /teacher\.dev/);
  const urls = (html.match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)<>]*/gi) || []).filter(u => !/^http:\/\/www\.w3\.org\//.test(u));
  assert.deepEqual(urls, []);
  assert.doesNotMatch(html, /mailto:|plausible|googletagmanager|\bgtag\(|posthog/i);
  // The name is kept out of the game and of its sources (the CSS text-cursor colour property aside).
  const files = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' || e.name === 'dist' ? [] : e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]);
  const kept = new RegExp(KEPT_OUT, 'i');
  for (const f of [path.join(ROOT, 'seed-games/algebra-builder.html'), path.join(ROOT, 'seed-games/algebra-builder.json'), ...files(TOOL)]) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8').replaceAll(`${KEPT_OUT}-color`, ''), kept, path.relative(ROOT, f));
  }
});

test('a problem link is in Oomba lesson parameters, which keep it whole', async () => {
  const O = await import(path.join(TOOL, 'src/lib/oomba.ts'));
  for (const [text, code] of [['2x+3=7', '2xp3q7'], ['3x - 4 = x + 6', '3x-4qxp6'], ['(x+2)(x+1)', 'oxp2coxp1c'], ['x^2+3x+2', 'xe2p3xp2'], ['−2x = 6', '-2xq6']]) {
    assert.equal(O.encodeProblem(text), code, text);
    assert.equal(O.decodeProblem(code), text.replace(/\s+/g, '').replace('−', '-'));
  }
  for (const bad of ['2y+3=7', 'x/2=3', '12x^2+34x+56=78x+9', '']) assert.equal(O.encodeProblem(bad), null, bad);
  // the game's link, and what the play page hands back to the game from it
  globalThis.window = { BRB: { gameUrl: 'https://oomba.example/play/algebra-builder' } };
  try {
    const link = O.shareLink('solve', '2x+3=7', 'all', false);
    assert.equal(link, 'https://oomba.example/play/algebra-builder?mode=solve&chapter=2xp3q7&level=2&lock=1');
    const params = parseParams(new URL(link).search);
    assert.deepEqual(params, { chapter: '2xp3q7', mode: 'solve', level: 2, lock: 1 });
    window.BRB.params = params;
    assert.deepEqual(O.openedWith(), { type: 'solve', p: '2x+3=7', start: 'all', live: false });
    window.BRB.params = parseParams('mode=factor&chapter=xe2p3xp2&level=2&lock=1');
    assert.deepEqual(O.openedWith(), { type: 'factor', p: 'x^2+3x+2', start: 'none', live: true });
    window.BRB.params = {};
    assert.equal(O.openedWith(), null, 'no params: the gallery');
    window.BRB.gameUrl = null;
    assert.equal(O.shareLink('solve', '2x+3=7', 'all', true), '', 'a preview has no link');
    assert.match(O.noLinkReason('2x+3=7'), /published game/);
  } finally { delete globalThis.window; }
});

test('the frame tells a game its own Oomba address (BRB.gameUrl)', async () => {
  reset();
  const g = publish(official, '<!doctype html><title>t</title><p>hi</p>', { source: 'seed', slug: 'game-url-test', title: 'Game Url' });
  const page = await call(`/play/${g.slug}`);
  assert.equal(page.status, 200);
  const frame = await call(/data-src="(\/frame\/[^"?]+)/.exec(page.text)[1]);
  const init = JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(frame.text)[1]);
  assert.match(init.game.url, /^https?:\/\/[^/]+\/play\/game-url-test$/);
  const sdk = fs.readFileSync(path.join(ROOT, 'public/sdk/brb-sdk.js'), 'utf8');
  assert.match(sdk, /gameUrl/); assert.match(sdk, /'brb:copy'/);
});

test('the play page copies for a game only its own link or a small PNG, after a tap', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public/js/play.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function copyForGame'), src.indexOf('const toFrame'));
  assert.match(fn, /const own = `\$\{location\.origin\}\/play\/\$\{d\.slug\}`/);
  assert.match(fn, /m\.text === own \|\| m\.text\.startsWith\(own \+ '\?'\)/);
  assert.match(fn, /m\.png\.type === 'image\/png' && m\.png\.size <= 300 \* 1024/);
  assert.match(fn, /tappedJustNow\('brb-copy-at', 1000\)/);
});

// ---------------------------------------------------------------- question sets
const SET_GAME = publish(official, '<!doctype html><title>t</title><p>sets</p>', { source: 'seed', slug: 'algebra-builder', title: 'Algebra Builder' });
const ITEMS = [{ a: 'solve', p: '2x+3=7', s: 'all', l: true }, { a: 'factor', p: 'x^2+3x+2', s: 'none', l: true }, { a: 'multiply', p: '(x+2)(x+1)', s: 'all', l: false }];
const frameInit = async (query, user = null) => {
  const page = await call(`/play/algebra-builder${query}`, { user });
  assert.equal(page.status, 200);
  const frame = await call(/data-src="(\/frame\/[^"]+?)"/.exec(page.text)[1].replace(/&amp;/g, '&'), { user });
  return JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(frame.text)[1]);
};

test('question sets: only clean questions (an activity, a short problem in the math alphabet, two settings), 1 to 10', () => {
  assert.deepEqual(gameSets.cleanItems(ITEMS), ITEMS);
  assert.deepEqual(gameSets.cleanItems([{ a: 'solve', p: ' 2X + 3 = 7 ', s: 'odd', l: 'yes' }]), [{ a: 'solve', p: '2x + 3 = 7', s: 'all', l: true }]);
  for (const bad of [[], 'x', null, Array(11).fill(ITEMS[0]), [{ a: 'divide', p: '2x=4' }], [{ a: 'solve', p: 'call me 555' }], [{ a: 'solve', p: '<b>' }], [{ a: 'solve', p: '2x+3=7'.repeat(8) }], [{ a: 'solve', p: '()+=' }]]) {
    assert.equal(gameSets.cleanItems(bad), null, JSON.stringify(bad));
  }
});

test('question sets: a teacher saves a set, its link opens it in the frame, and only its owner changes it', async () => {
  reset();
  const none = await call(`/api/games/${SET_GAME.id}/sets`, { method: 'POST', body: { items: ITEMS } });
  assert.equal(none.status, 401, 'signed out');
  const guest = createGuest();
  const g = await call(`/api/games/${SET_GAME.id}/sets`, { method: 'POST', body: { items: ITEMS }, user: guest });
  assert.equal(g.status, 403); assert.equal(g.json.code, 'guest');
  const bad = await call(`/api/games/${SET_GAME.id}/sets`, { method: 'POST', body: { items: [{ a: 'solve', p: 'hello' }] }, user: teacher });
  assert.equal(bad.status, 400);

  const r = await call(`/api/games/${SET_GAME.id}/sets`, { method: 'POST', body: { items: ITEMS }, user: teacher });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const id = r.json.id;
  assert.match(id, gameSets.SET_ID);
  assert.deepEqual(parseParams(`chapter=${id}&lock=1`), { chapter: id, lock: 1 }, 'the code fits a lesson parameter');

  // the link opens the set: for its owner (mine), for anyone else (not mine); a wrong code is "missing"
  assert.deepEqual((await frameInit(`?chapter=${id}&lock=1`, teacher)).set, { id, items: ITEMS, mine: true });
  assert.deepEqual((await frameInit(`?chapter=${id}&lock=1`, kid)).set, { id, items: ITEMS, mine: false });
  assert.deepEqual((await frameInit('?chapter=s-0000000000&lock=1', kid)).set, { id: 's-0000000000', missing: true });
  assert.equal((await frameInit('?mode=solve&chapter=2xp3q7&lock=1', kid)).set, undefined, 'a one-problem link has no set');
  const other = publish(official, '<!doctype html><title>t</title><p>x</p>', { source: 'seed', slug: 'not-a-set-game', title: 'X' });
  const page = await call(`/play/${other.slug}?chapter=${id}`, { user: teacher });
  const frame = await call(/data-src="(\/frame\/[^"]+?)"/.exec(page.text)[1].replace(/&amp;/g, '&'), { user: teacher });
  assert.doesNotMatch(frame.text, /"set":/, 'another game never gets a set');
  assert.equal((await call(`/api/games/${other.id}/sets`, { method: 'POST', body: { items: ITEMS }, user: teacher })).status, 404);

  // changed under the same code by its owner; someone else can't
  const two = ITEMS.slice(0, 1);
  assert.equal((await call(`/api/games/${SET_GAME.id}/sets`, { method: 'POST', body: { items: two, id }, user: kid })).status, 404);
  const u = await call(`/api/games/${SET_GAME.id}/sets`, { method: 'POST', body: { items: two, id }, user: teacher });
  assert.equal(u.status, 200); assert.equal(u.json.id, id);
  assert.deepEqual(gameSets.get(SET_GAME.id, id).items, two);

  // a set goes with its owner's account
  const owner = auth.createUser({ username: 'SetOwner', password: 'secret123' });
  const mine = gameSets.save(SET_GAME.id, owner.id, ITEMS).id;
  assert.ok(gameSets.get(SET_GAME.id, mine));
  assert.equal(deleteAccount(owner.id, null, { by: 'self', parentMade: false }).ok, true);
  assert.equal(gameSets.get(SET_GAME.id, mine), null);
  assert.equal(q.get('SELECT COUNT(*) n FROM game_sets WHERE owner_id=?', owner.id).n, 0);
  assert.ok(gameSets.get(SET_GAME.id, id), "another teacher's set stays");
});

test('question sets: the SDK hands the game its set and saves through the page', () => {
  const sdk = fs.readFileSync(path.join(ROOT, 'public/sdk/brb-sdk.js'), 'utf8');
  assert.match(sdk, /questionSet: questionSet,/); assert.match(sdk, /saveQuestionSet: saveQuestionSet/);
  assert.match(sdk, /send\('brb:set-save'/);
  const play = fs.readFileSync(path.join(ROOT, 'public/js/play.js'), 'utf8');
  assert.match(play, /case 'brb:set-save': saveSetForGame\(m\)/);
  assert.match(play, /api\(`\/api\/games\/\$\{d\.gameId\}\/sets`/);
});

test('the play page takes the set games\' messages (BRB.copy, BRB.saveQuestionSet, BRB.assign) and nothing else of that kind', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public/js/play.js'), 'utf8');
  const start = src.indexOf('const TYPES = {'), end = src.indexOf('let saveTimer');
  const validMessage = new Function(src.slice(start, end).replace('export function', 'function') + '\nreturn validMessage;')();
  const frame = {};
  const ev = data => ({ source: frame, origin: 'null', data: { brb: 1, ...data } });
  assert.ok(validMessage(ev({ type: 'brb:copy', id: 1, text: 'https://x/play/algebra-builder?chapter=s-0123456789&lock=1' }), frame));
  assert.ok(validMessage(ev({ type: 'brb:copy', id: 2, png: new Blob(['x'], { type: 'image/png' }) }), frame));
  assert.equal(validMessage(ev({ type: 'brb:copy', id: 0, text: 'x' }), frame), null);
  assert.equal(validMessage(ev({ type: 'brb:copy', id: 3, text: 7 }), frame), null);
  assert.ok(validMessage(ev({ type: 'brb:set-save', id: 1, items: [{ a: 'solve', p: '2x=4' }], set: null }), frame));
  assert.equal(validMessage(ev({ type: 'brb:set-save', id: 1, items: Array(11).fill({}) }), frame), null);
  assert.ok(validMessage(ev({ type: 'brb:assign', opts: 'chapter=s-0123456789&lock=1' }), frame));
  assert.equal(validMessage(ev({ type: 'brb:assign', opts: 5 }), frame), null);
});
