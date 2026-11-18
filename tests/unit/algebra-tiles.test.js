// Algebra Tiles (seed-games/algebra-tiles.html, built from tools/algebra-tiles by its build.mjs; adapted from Algebra
// Tiles by teacher.dev, Apache-2.0): the committed page is a registered Play game that passes the safety scan with the
// pinned Oomba Kit tag, carries no outside address or kept-out name, credits the original, and its problem links fit
// Oomba's lesson parameters. The frame tells a game its own Oomba address (BRB.gameUrl), and the play page copies for a
// game only that game's own link or a small PNG (BRB.copy).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reset, call, publish, official } from './_live.js';
import { scanVersion } from '../../server/services/scanner.js';
import { sanitizeGameHtml } from '../../server/services/sanitize.js';
import { kitTag } from '../../server/services/kit.js';
import { parseParams } from '../../server/services/play-params.js';
import { SEED_GAMES } from '../../scripts/seed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = path.join(ROOT, 'tools/algebra-tiles');
const html = fs.readFileSync(path.join(ROOT, 'seed-games/algebra-tiles.html'), 'utf8');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/algebra-tiles.json'), 'utf8'));
const KEPT_OUT = String.fromCharCode(99, 97, 114, 101, 116);

test('a registered Play game that passes the safety scan, with the pinned Oomba Kit tag', () => {
  assert.ok(SEED_GAMES.includes('algebra-tiles'));
  assert.equal(meta.slug, 'algebra-tiles'); assert.equal(meta.shelf, 'play'); assert.equal(meta.title, 'Algebra Tiles');
  assert.ok(fs.existsSync(path.join(ROOT, 'public/covers/algebra-tiles.jpg')), 'its cover');
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
  for (const f of [path.join(ROOT, 'seed-games/algebra-tiles.html'), path.join(ROOT, 'seed-games/algebra-tiles.json'), ...files(TOOL)]) {
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
  globalThis.window = { BRB: { gameUrl: 'https://oomba.example/play/algebra-tiles' } };
  try {
    const link = O.shareLink('solve', '2x+3=7', 'all', false);
    assert.equal(link, 'https://oomba.example/play/algebra-tiles?mode=solve&chapter=2xp3q7&level=2&lock=1');
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
