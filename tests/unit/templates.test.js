import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, loadTemplate } from '../../server/builder/templates/index.js';
import { scanVersion } from '../../server/services/scanner.js';
import { threeImportMap, isThreeGame } from '../../server/services/vendor.js';
import { CODES } from '../../server/i18n/index.js';
import { guessHero, shownTitle } from '../../server/builder/layer.js';
import { readConfig, configEdits } from '../../server/builder/mock.js';

const KEYS = ['quiz', 'runner', 'catch', 'memory', 'word', 'duel', 'board', 'island'];
const COVERS = ['sunset', 'ocean', 'forest', 'candy', 'night', 'lava', 'mint', 'gold'];
const CATEGORIES = ['arcade', 'sports', 'puzzle', 'words', 'board', 'adventure', 'learning', 'music', 'silly'];

test('TEMPLATES lists every template with valid metadata', () => {
  assert.deepEqual(TEMPLATES.map(t => t.key), KEYS);
  for (const t of TEMPLATES) {
    assert.ok(t.title && t.icon && t.description, `${t.key} has title/icon/description`);
    assert.ok(COVERS.includes(t.cover), `${t.key} cover`);
    assert.ok(CATEGORIES.includes(t.category), `${t.key} category`);
    assert.ok(t.players === 1 || t.players === 2, `${t.key} players`);
  }
});

test('loadTemplate throws on an unknown key', () => {
  assert.throws(() => loadTemplate('nope'));
  assert.throws(() => loadTemplate('../index'));
});

for (const key of KEYS) {
  test(`template ${key} loads and passes the safety scan`, () => {
    const html = loadTemplate(key);
    assert.equal(typeof html, 'string');
    assert.equal(loadTemplate(key), html, 'cached');
    const scan = scanVersion(html);
    assert.equal(scan.status, 'pass', JSON.stringify(scan.issues));
    assert.ok(Buffer.byteLength(html) < 150 * 1024, 'under 150 KB');
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /\bBRB\./);
    assert.match(html, /const CONFIG\s*=/);
    assert.doesNotMatch(html, /<!doctype/i);
    assert.doesNotMatch(html, /<html|<head|<body/i);
  });
}

test('Star Island is the 3D template: pinned import map, comfort, performance, device and language rules', () => {
  const html = loadTemplate('island');
  assert.ok(isThreeGame(html)); assert.ok(TEMPLATES.find(t => t.key === 'island').threeD);
  for (const k of ['quiz', 'runner', 'catch', 'memory', 'word', 'duel', 'board']) assert.equal(isThreeGame(loadTemplate(k)), false, k);
  assert.ok(html.includes(threeImportMap()), 'exactly the pinned import map');
  assert.match(html, /import \* as THREE from 'three'/);
  assert.match(html, /BRB\.fx\.fit3d\(renderer, camera, \{ maxDpr: 1\.5/, 'fits the renderer with a 1.5 pixel-ratio cap');
  assert.doesNotMatch(html, /BRB\.fx\.fit\(/, 'never the 2D fit on the 3D canvas');
  assert.match(html, /camera\.fov = tall \? 70 : 60/, 'field of view 60-75');
  assert.match(html, /const LEVELS = \[/); assert.match(html, /fps < 45/, 'an automatic quality ladder');
  assert.match(html, /webglcontextlost[\s\S]*preventDefault/); assert.match(html, /webglcontextrestored/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /BRB\.sfx\.play\('coin'\)/); assert.match(html, /BRB\.score\.submit/); assert.match(html, /BRB\.storage\.set/);
  assert.match(html, /addEventListener\('keydown'/); assert.match(html, /id="stickBase"/); assert.match(html, /id="jumpBtn"/);
  assert.match(html, /window\.__brbTest = \{/);
  // Every site language has a table with the same words as English (en-GB may lean on en).
  const tables = {}; for (const m of html.matchAll(/^ {2}(?:'([\w-]+)'|(\w+)): \{/gm)) tables[m[1] || m[2]] = true;
  for (const c of CODES) assert.ok(tables[c], `I18N has ${c}`);
  const keysOf = code => { const m = html.match(new RegExp(`^ {2}(?:'${code}'|${code}): \\{([\\s\\S]*?)^ {2}\\},`, 'm')); return m ? [...m[1].matchAll(/(\w+): ['"]/g)].map(x => x[1]).sort() : []; };
  const en = keysOf('en'); assert.ok(en.length >= 20);
  for (const c of CODES.filter(c => c !== 'en' && c !== 'en-GB')) assert.deepEqual(keysOf(c), en, `${c} has every word`);
  // Builder tunables: the mock and the real Builder find the hero and edit CONFIG lines.
  assert.equal(guessHero(html, '🏝️'), '🐣'); assert.equal(shownTitle(html), 'Star Island');
  assert.equal(readConfig(html, 'stars'), 12); assert.equal(readConfig(html, 'platforms'), 4); assert.equal(readConfig(html, 'sky'), 'day');
  const edits = configEdits(html, { stars: 20, platforms: 6, sky: 'sunset' });
  assert.equal(edits.length, 3);
  const changed = edits.reduce((h, e) => h.replace(e.find, e.replace), html);
  assert.equal(readConfig(changed, 'stars'), 20); assert.equal(readConfig(changed, 'sky'), 'sunset');
  assert.equal(scanVersion(changed).status, 'pass');
  assert.match(html, /BRB_TUNE\.hero/, 'reads the tune-up hero swap');
});
