// Atlas Quest (seed-games/atlas-quest.html): the country data, the map, the flags and the translations, read from the game file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('seed-games/atlas-quest.html', 'utf8');
const ctx = vm.createContext({ window: {} });
for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
const { C, MAP, FLAG, EASY } = ctx.window.AtlasData;
const I = ctx.window.AtlasI18n || {};
const game = html.slice(html.indexOf('<script type="module">'));

test('195 countries, each with its facts', () => {
  assert.equal(C.length, 195);
  const ids = new Set(C.map(c => c[0]));
  assert.equal(ids.size, 195);
  for (const c of C) {
    const [cc, name, cap, lat, lng, pop, langs, fam, fact, reg] = c;
    assert.ok(name && cap && langs && fam && fact, cc);
    assert.ok(Math.abs(lat) <= 90 && Math.abs(lng) <= 180, `${cc}: capital spot`);
    assert.ok(pop > 500 && pop < 2e9, `${cc}: people`);
    assert.ok(['af', 'as', 'eu', 'na', 'sa', 'oc'].includes(reg), `${cc}: continent`);
    assert.ok(fact.length >= 40 && fact.length <= 200, `${cc}: fact length`);
    for (const b of c[11] ? c[11].split(',') : []) assert.ok(ids.has(b), `${cc}: neighbour ${b}`);
  }
  for (const e of EASY.split(',')) assert.ok(ids.has(e), `easy ${e}`);
});

test('every country has a flag, and nearly all have a shape on the map (tiny ones get a dot)', () => {
  for (const c of C) assert.ok(FLAG[c[0]] && (FLAG[c[0]].startsWith('<svg') || FLAG[c[0]].startsWith('data:image/webp;base64,')), `${c[0]}: flag`);
  const missing = C.filter(c => !MAP[c[0]]).map(c => c[0]);
  assert.ok(missing.length <= 6, `no shape: ${missing}`);
});

test('neighbours go both ways', () => {
  const by = Object.fromEntries(C.map(c => [c[0], new Set(c[11] ? c[11].split(',') : [])]));
  for (const [cc, n] of Object.entries(by)) for (const b of n) assert.ok(by[b].has(cc), `${cc} borders ${b} but not back`);
});

test('the game is translated into the kit\'s languages, keeping the {slots}', () => {
  const langs = ['pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl'];
  const keys = [...new Set([...game.matchAll(/\btr\('((?:\\.|[^'\\])*)'/g)].map(m => m[1].replace(/\\'/g, "'")))];
  const slots = s => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const lang of langs) {
    const T = I[lang]; assert.ok(T, lang);
    for (const k of keys) assert.ok(T[k], `${lang} is missing: ${k}`);
    for (const c of C) for (const p of ['name.', 'cap.', 'fam.', 'fact.']) assert.ok(T[p + c[0]], `${lang}: ${p}${c[0]}`);
    for (const k of keys) for (const v of typeof T[k] === 'object' ? Object.values(T[k]) : [T[k]]) assert.equal(slots(v), slots(k), `${lang}: slots in ${k}`);
  }
});
