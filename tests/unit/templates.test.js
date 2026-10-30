import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, loadTemplate } from '../../server/builder/templates/index.js';
import { scanVersion } from '../../server/services/scanner.js';
import { threeImportMap, isThreeGame } from '../../server/services/vendor.js';
import { CODES } from '../../server/i18n/index.js';
import { guessHero, shownTitle } from '../../server/builder/layer.js';
import { readConfig, configEdits } from '../../server/builder/mock.js';
import { kitTag, kitPackTag, kitPacks } from '../../server/services/kit.js';
import { fakeWin } from '../support/kit-fake.js';
import { createKit } from '../../kit/src/index.js';
import * as animals from '../../kit/packs/art-animals.js';
import * as school from '../../kit/packs/art-school.js';
import * as biomes from '../../kit/packs/art-biomes.js';
import * as dress from '../../kit/packs/dress.js';

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
  test(`template ${key} loads and passes the safety scan and the kit's style lint`, () => {
    const html = loadTemplate(key);
    assert.equal(typeof html, 'string');
    assert.equal(loadTemplate(key), html, 'cached');
    const scan = scanVersion(html);
    assert.equal(scan.status, 'pass', JSON.stringify(scan.issues));
    assert.deepEqual(scan.lint, [], 'no style notes: a template is what the Builder copies');
    assert.ok(Buffer.byteLength(html) < 150 * 1024, 'under 150 KB');
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /const CONFIG\s*=/);
    assert.doesNotMatch(html, /<!doctype/i);
    assert.doesNotMatch(html, /<html|<head|<body/i);
    // On the Oomba Kit: exactly the pinned tag (put in for <!--KIT-->), after a body element, packs right after it.
    assert.ok(html.includes(kitTag()), 'the pinned kit tag');
    const body = html.search(/<(div|canvas|main)\b/); assert.ok(body >= 0 && body < html.indexOf(kitTag()), 'a body element before the kit (it needs the page body)');
    assert.doesNotMatch(html, /<!--KIT-->|<!--PACK:/);
    for (const p of kitPacks()) if (html.includes(`/packs/${p}.js`)) assert.ok(html.includes(kitPackTag(p)), `${key}: the pinned ${p} tag`);
  });
}

// The 2D templates: small, one CONFIG key per line, every word in the site's languages, the whole game in Oomba.game.
const TWO_D = KEYS.filter(k => k !== 'island');
const scriptOf = html => html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
const tableKeys = (src, name, code) => { const m = src.match(new RegExp(`^ {2}(?:'${code}'|${code}): \\{ (.*) \\},$`, 'm')); return m ? [...m[1].matchAll(/(?:^|, )(\w+): '/g)].map(x => x[1]).sort() : null; };
for (const key of TWO_D) {
  test(`template ${key}: a small Oomba.game game, CONFIG one key per line, WORDS in every site language`, () => {
    const html = loadTemplate(key), src = scriptOf(html);
    const kb = Buffer.byteLength(html) / 1024, max = key === 'quiz' ? 18 : 15;   // the quiz carries its questions in three languages
    assert.ok(kb >= 3 && kb <= max, `${key} is ${kb.toFixed(1)} KB (3-${max})`);
    assert.match(src, /\bO\.game\(\{|Oomba\.game\(\{/);
    const config = src.match(/const CONFIG = \{\n([\s\S]*?)\n\};/)[1].split('\n');
    for (const line of config) assert.match(line, /^ {2}\w+: .+,$/, `${key}: CONFIG line "${line}" is one key on one line`);
    const en = tableKeys(src, 'WORDS', 'en'); assert.ok(en && en.length >= 3, `${key}: an English WORDS table`);
    for (const c of CODES.filter(c => c !== 'en' && c !== 'en-GB')) assert.deepEqual(tableKeys(src, 'WORDS', c), en, `${key}: WORDS.${c} has every key`);
    assert.doesNotMatch(src, /\p{Extended_Pictographic}/u, 'no emoji pictures');
    assert.doesNotMatch(src, /#[0-9a-f]{3,8}\b/i, 'no colour codes');
  });
}

/** Run a template's game in a fake browser (the real kit and packs), straight into play. */
function runTemplate(key) {
  const reported = [];
  const win = fakeWin({ search: '?okDebug=1&okBackend=paper', brb: { version: 3, gameOver: r => reported.push(r), speak: () => true, sfx: { muted: false, mute() {}, play() {} }, user: { lang: 'en' } } });
  // the fake DOM, a little closer to a browser for whole games: append() takes text, and querySelector finds a stand-in
  const doc = win.document, make = doc.createElement;
  doc.createElement = tag => { const e = make(tag); e.querySelector = () => make('span'); e.append = (...cs) => cs.forEach(c => e.appendChild(typeof c === 'string' ? make('#text') : c)); return e; };
  const O = createKit(win);
  O.__pk({ name: 'art-animals', version: '1.0.0' }, animals.define); O.__pk({ name: 'art-school', version: '1.0.0' }, school.define); O.__pk({ name: 'art-biomes', version: '1.0.0' }, biomes.define); O.__pk({ name: 'dress', version: '1.0.0' }, dress.define);
  win.Oomba = O; win.BRB = win.BRB || {};
  new Function('window', 'document', 'Oomba', 'BRB', 'innerWidth', 'innerHeight', 'addEventListener', scriptOf(loadTemplate(key)))(win, doc, O, win.BRB, 390, 700, () => {});
  const T = win.__brbTest;
  return { O, kit: O.debug.kit, T, win, reported };
}
for (const key of TWO_D) {
  test(`template ${key} plays headless: start() goes straight into play, steps run with no kit warnings`, async () => {
    const { T, win, kit } = runTemplate(key);
    assert.equal(typeof T.start, 'function', 'Oomba.game registered start()');
    T.start();
    for (let i = 0; i < 6; i++) { T.step(60); await new Promise(r => setImmediate(r)); }
    const st = T.state();
    assert.equal(st.game, true); assert.ok(['play', 'talk', 'win', 'lose', 'goal'].includes(st.scene), `${key}: ${st.scene}`);
    assert.deepEqual(win.__warns.filter(w => !/fonts|font/i.test(w)), [], `${key}: no kit warnings`);
    assert.ok(kit.game && kit.game.world && kit.game.world.hero, 'a hero in the world');
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
  // The kit's screens over the 3D world: title, how-to, HUD (stars, clock, pause, sound), pause, results.
  for (const re of [/Oomba\.ui\.title\(/, /Oomba\.ui\.howTo\(/, /Oomba\.ui\.hud\(\['count:star', 'timer'\]/, /Oomba\.ui\.win\(/, /Oomba\.ui\.tryAgain\(/, /Oomba\.time\.paused/]) assert.match(html, re);
  assert.doesNotMatch(html, /id="(titleScreen|pauseScreen|endScreen|hud|pauseBtn|muteBtn)"/, 'no hand-built screens left');
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

test('template play, headless: the catcher drops things that the kit catches; the runner runs by itself to the right', async () => {
  const c = runTemplate('catch'); c.T.start();
  const w = c.kit.game.world, before = w.points;
  let seen = 0;
  for (let i = 0; i < 40; i++) { c.T.step(15); seen = Math.max(seen, w.all('drop').length); for (const e of w.all('drop')) { e.x = w.hero.x; } }   // everything falls onto the hero
  assert.ok(seen >= 1, 'things fall');
  assert.ok(w.points > before || w.lives < 3, 'falling things are caught (points) or bump the hero (a heart)');
  const r = runTemplate('runner'); r.T.start();
  const x0 = r.T.state().hero.x; r.T.step(60); await new Promise(res => setImmediate(res)); r.T.step(30);
  assert.ok(r.T.state().hero.x > x0 + 48, `the hero runs right on its own (${x0} -> ${r.T.state().hero.x})`);
});
