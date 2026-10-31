// Atlas Quest (seed-games/atlas-quest.html): the country data, the map, the flags and the translations, read from the game file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';

const html = fs.readFileSync('seed-games/atlas-quest.html', 'utf8');
const ctx = vm.createContext({ window: {} });
for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
const { C, MAP, FLAG, EASY, T } = ctx.window.AtlasData;
const game = html.slice(html.indexOf('<script type="module">'));
// The other languages are data packs under public/vendor/data/atlas-quest/<version>/, named in the game with their checksums.
const PACK_VER = game.match(/const PACK_VER = '([^']+)'/)[1], PACK_SRI = JSON.parse(game.match(/PACK_SRI = (\{[^;]*\});/)[1]);
const PACK_DIR = path.join('public/vendor/data/atlas-quest', PACK_VER);
const I = {};
for (const [lang, sri] of Object.entries(PACK_SRI)) {
  const body = fs.readFileSync(path.join(PACK_DIR, lang + '.js'));
  I[lang] = { sri, ok: 'sha384-' + crypto.createHash('sha384').update(body).digest('base64') === sri };
  const w = { window: {} }; vm.runInNewContext(body.toString(), w); Object.assign(I[lang], w.window.AtlasPacks[lang]);
}

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
    assert.ok(I[lang] && I[lang].ok, `${lang}: the pack's checksum matches the game`);
    const T = I[lang].strings;
    for (const k of keys) assert.ok(T[k], `${lang} is missing: ${k}`);
    for (const c of C) for (const p of ['name.', 'cap.', 'fam.', 'fact.']) assert.ok(T[p + c[0]], `${lang}: ${p}${c[0]}`);
    for (const k of keys) for (const v of typeof T[k] === 'object' ? Object.values(T[k]) : [T[k]]) assert.equal(slots(v), slots(k), `${lang}: slots in ${k}`);
  }
});

test('six culture questions for every country, with one right answer among four and a why', () => {
  assert.equal(Object.keys(T).length, 195);
  const cats = ['food', 'party', 'arts', 'words', 'nature', 'life'];
  for (const c of C) {
    const list = T[c[0]]; assert.equal(list.length, 6, c[0]);
    list.forEach((t, i) => {
      assert.equal(t[0], cats[i], `${c[0]} ${i}: category`);
      const opts = t.slice(2, 6); assert.equal(new Set(opts.map(o => o.toLowerCase())).size, 4, `${c[0]} ${i}: four different answers`);
      assert.ok(t[1].length > 10 && t[6].length > 20, `${c[0]} ${i}: question and why`);
    });
    for (const [lang, p] of Object.entries(I)) {
      const tl = p.trivia[c[0]]; assert.ok(tl && tl.length === 6, `${lang}: culture for ${c[0]}`);
      tl.forEach((x, i) => assert.ok(x.length === 6 && x.every(v => typeof v === 'string' && v.trim()), `${lang}: ${c[0]} question ${i}`));
    }
  }
});
