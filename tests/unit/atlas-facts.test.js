// Atlas Quest's fact-check of November 2026 (docs/decisions.md "Atlas Quest fact-check"): the key corrections in the
// game's data (seed-games/atlas-quest.html window.AtlasData and the library's AtlasFacts), the capital rules shared by
// the game, Atlas Quest Live and the teacher's quizzes, and the 1.0.1 language packs (every key of 1.0.0, which stays
// byte for byte as published).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as ATL from '../../server/live/atlas.js';
import { cleanAtlasItems } from '../../server/services/game-sets.js';
import { cleanAtlasPrintDoc, atlasPrintHtml } from '../../server/services/atlas-print.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/atlas-quest.html'), 'utf8');
const LIVE = fs.readFileSync(path.join(ROOT, 'seed-games/atlas-quest-live.html'), 'utf8');
const ctx = vm.createContext({ window: {} });
for (const m of HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
// plain objects of this realm (deepEqual compares prototypes)
const D = JSON.parse(JSON.stringify(ctx.window.AtlasData)), FACTS = JSON.parse(JSON.stringify(ctx.window.AtlasFacts));
const GAME = HTML.slice(HTML.indexOf('<script type="module">'));
const BY = Object.fromEntries(D.C.map(c => [c[0], c]));
const borders = cc => (BY[cc][11] ? BY[cc][11].split(',') : []);
const english = JSON.stringify([D.C.map(c => c.slice(0, 9)), D.T, FACTS, D.CAPNOTE]);

const DIR = path.join(ROOT, 'public/vendor/data/atlas-quest');
const OLD = '1.0.0-b244a5ca';
const OLD_SRI = { pt: 'sha384-Ksz/rw/mYsiw6N9XsWoI+x9vr/LezMBsUORfm6YuWyyXbhUduZO2qD0Lznbn9q+H', fr: 'sha384-WcbKOTYFh4o20haEfqhb2suEXXvsAJYFkzK3daDAq0/+SUqlGI2xx/BN8q1Oq+23', es: 'sha384-6uFOwKJ/SIl6+ZEta6PQpIx7JE26kYOOaAHZdrZYNybABCxMxgYQ2MIHl8ZZC6jO', de: 'sha384-sdQrxcqc81bv9D76BhG42A19xzVmfOthRLYhlU93IhlUhjN+OO0HOwWik9tKHAHj', he: 'sha384-MCnq6aQYat6bFfiYEVj3PBmHr4TmtXV+hkkfJX0gIrYFYxkj8FIFRhHqCj3vJv1p', ja: 'sha384-NWILqArFPExMIPBUEMTjg62WmBaA2QiuZyHMeOd6bmPXYImVLdmSnpwFBjI/pRYs', ar: 'sha384-mRQv6W9RaKMcgpWpDwr7mGQc4EofGjxUZVn7IYHftqrFZWYirYUNlAIPkNrsB092', ru: 'sha384-Y9VL7xv7FUsjwn4mR1RockqpFKrMqE4tDVsYOZKmqXNwxzd498FiMN8LHBjH7UaN', it: 'sha384-1qsbKaOzXZ4XHFgzT39j2CBkoGM2mngopCN5rkB3jOVuSxRhnfSd4a3cnqg4dI+V', 'zh-Hant': 'sha384-vgaWhYYz+D6CzYvCbhI4BDldWLsf0zfral1fPiR8jlODrFOFZkdrF/f4uWn8YjYR', nl: 'sha384-oqduqot8blmZMker2dvsq18CsfvoFFMinWp+8lYafEP/5mIPD2FNteWAK7pe20dC' };
const PACK_VER = GAME.match(/const PACK_VER = '([^']+)'/)[1];
const packOf = (ver, l) => { const w = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(DIR, ver, `${l}.js`), 'utf8'), w); return w.window.AtlasPacks[l]; };

test('the corrected facts: languages, borders, capitals, numbers', () => {
  assert.ok(BY.SG[6].split('|').includes('Tamil'), 'Singapore: four official languages');
  assert.ok(BY.CH[6].split('|').includes('Romansh'));
  for (const [a, b] of [['FR', 'BR'], ['FR', 'SR'], ['NL', 'FR'], ['GB', 'ES'], ['ES', 'MA']]) {
    assert.ok(borders(a).includes(b) && borders(b).includes(a), `${a} and ${b} share a land border`);
  }
  assert.ok(!borders('CD').includes('TZ') && !borders('TZ').includes('CD'), 'DR Congo and Tanzania meet only in Lake Tanganyika');
  assert.ok(D.C.every(c => !/\b(EH|XK)\b/.test(c[11])), 'only countries in the game are neighbours');
  const cap = { BJ: ['Porto-Novo', 6.5, 2.6], BO: ['Sucre', -19.04, -65.26], LK: ['Sri Jayawardenepura Kotte', 6.89, 79.92], GQ: ['Ciudad de la Paz', 1.59, 10.82], NL: ['Amsterdam'], NR: ['Yaren (seat of government)'], IL: ['Jerusalem'], PS: ['Ramallah'], YE: ["Sana'a"] };
  for (const [cc, [name, lat, lng]] of Object.entries(cap)) {
    assert.equal(BY[cc][2], name, `${cc}: capital`);
    if (lat !== undefined) assert.deepEqual([BY[cc][3], BY[cc][4]], [lat, lng], `${cc}: capital's spot`);
    assert.ok(D.CAPNOTE[cc] && D.CAPNOTE[cc].length > 15, `${cc}: a note with the capital`);
  }
  assert.deepEqual(D.CAPALT, { BJ: 'Cotonou', BO: 'La Paz', LK: 'Colombo', NL: 'The Hague', GQ: 'Malabo' });
  assert.deepEqual(new Set(D.FAR.split(',')), new Set(['FR-BR', 'FR-SR', 'NL-FR', 'GB-ES', 'ES-MA']));
  assert.deepEqual([BY.PK[10], BY.IN[10], BY.RS[10], BY.PH[10], BY.US[10]], [796.1, 3287.6, 88.4, 300, 9833.5], 'one rule for areas: the UN / CIA total');
  // tiny countries: the stored area (thousand km2) within 5% of the CIA total area (km2)
  const km2 = { MC: 2, VA: 0.44, NR: 21, TV: 26, SM: 61, LI: 160, MV: 298, AD: 468, MT: 316, KN: 261, PW: 459, MH: 181, SC: 455, LC: 616, VC: 389, GD: 344, BB: 430, AG: 443, DM: 751, TO: 747, KI: 811, FM: 702, BH: 760, ST: 964 };
  for (const [cc, a] of Object.entries(km2)) assert.ok(Math.abs(BY[cc][10] * 1000 - a) <= a * 0.05, `${cc}: ${BY[cc][10] * 1000} km2, not ${a}`);
  assert.ok(D.C.every(c => c[10] > 0), 'no country has an area of 0');
  assert.deepEqual([BY.AE[5], BY.QA[5], BY.OM[5], BY.AL[5], BY.BO[5]], [12000000, 3200000, 5300000, 2400000, 11400000]);
  assert.match(BY.PK[8], /K2, the world's second-highest mountain, stands on Pakistan's border with China/);
  assert.match(BY.GQ[8], /In 2026 it moved its capital from Malabo/);
});

test('the myths and weak claims are gone, in English and in every new pack', () => {
  for (const re of [/seven emirates/i, /Planet of the Apes/i, /no mosquitoes at all/i, /more than 1,000 bright wall paintings/i, /\b\d+ ?(%|percent) of the world's false teeth/i,
    /Halloween began in Ireland/, /leprechauns/i, /inventing Skype/, /first New Year's sunrise/, /tiniest island nation/, /silent lightning/i, /Big Ben clock tower/,
    /a hard stone/, /six-sided stone columns/, /carves Europe's deepest canyon/, /60 percent of the world's Atlantic puffins/, /flows through more countries than any other/,
    /It is shared by Malawi, Mozambique and Tanzania/, /about as big as the United States/]) assert.doesNotMatch(english, re);
  assert.match(D.T.BG[5][6], /hundreds of bright wall paintings/);
  assert.ok(!fs.readFileSync(path.join(ROOT, 'scripts/data/atlas-quest/pack-1.0.1.json'), 'utf8').includes('\u2014'), 'no em dashes in the corrected translations');
  assert.deepEqual(D.T.NZ[0].slice(2, 6), ['Hāngī', 'Lovo', 'Imu', 'Tandoor'], 'umu is a Māori word for the earth oven too: never a wrong answer');
  assert.ok(!D.T.AU[0].includes('Marmite'));
  for (const l of Object.keys(OLD_SRI)) {
    const p = packOf(PACK_VER, l), o = packOf(OLD, l);
    for (const [cc, i] of [['DJ', 5], ['AE', 1], ['BG', 5], ['NZ', 0], ['AU', 0]]) assert.notDeepEqual(p.trivia[cc][i], o.trivia[cc][i], `${l}: ${cc} ${i} corrected`);
    for (const k of ['fact.IS', 'fact.IE', 'fact.PK', 'fact.GQ', 'fam.EE', 'fam.KI', 'cap.BJ', 'cap.BO', 'cap.LK', 'cap.GQ', 'cap.NR']) assert.notEqual(p.strings[k], o.strings[k], `${l}: ${k} corrected`);
    assert.doesNotMatch(JSON.stringify(p.trivia.DJ), /1968/, `${l}: no film`);
  }
});

test('capital questions: never about Israel, Palestine, Yemen, Nauru or the District of Columbia, in the game, live and the teacher\'s quizzes', () => {
  const game = new Set(JSON.parse(GAME.match(/const NO_CAP_Q = new Set\((\[[^\]]*\])\)/)[1].replace(/'/g, '"')));
  assert.deepEqual(game, new Set(['IL', 'PS', 'YE', 'NR', 'US-DC']));
  assert.deepEqual(ATL.NO_CAP_Q, game, 'server/live/atlas.js has the same list');
  for (const cc of game) for (const k of ['cap', 'capc']) assert.equal(cleanAtlasItems([{ t: '', r: cc.startsWith('US-') ? 'us' : 'world', q: [[k, cc]] }]), null, `${k} ${cc}`);
  for (let n = 0; n < 20; n++) {
    for (const it of ATL.atlasItems('atlas:world:hard:capital:20:20', 'en')) assert.ok(it.atlas.k !== 'capital' || !game.has(ATL.codes()[it.answer]));
  }
  // the seat of government (or the former capital) is no country's capital and no wrong answer anywhere
  const caps = new Set(D.C.map(c => c[2]));
  for (const city of Object.values(D.CAPALT)) {
    assert.ok(!caps.has(city), `${city} is no capital in the game`);
    for (const list of Object.values(D.T)) for (const t of list) assert.ok(!t.slice(3, 6).includes(city), `${city} as a wrong answer`);
  }
  assert.match(GAME, /function sameAnswer\(v, a\)/); assert.match(GAME, /const ok = sameAnswer\(v, q\.a\);/);
});

test('a typed answer may give the official capital or the seat of government', () => {
  const src = GAME.match(/const fold = s => [^\n]*\n/)[0] + GAME.match(/function sameAnswer\(v, a\) \{[\s\S]*?\n\}/)[0];
  const box = { BY: { BJ: { capital: 'Porto-Novo', capEn: 'Porto-Novo' }, BO: { capital: 'Sucre', capEn: 'Sucre' }, NL: { capital: 'Amsterdam', capEn: 'Amsterdam' } }, CAPALT: { BJ: 'Cotonou', BO: 'La Paz', NL: 'The Hague' }, tk: (k, en) => en };
  vm.runInNewContext(src + '\nthis.sameAnswer = sameAnswer;', box);
  assert.ok(box.sameAnswer('Cotonou', 'Porto-Novo') && box.sameAnswer('porto novo', 'Cotonou'));
  assert.ok(box.sameAnswer('La Paz', 'Sucre') && box.sameAnswer('the hague', 'Amsterdam'));
  assert.ok(!box.sameAnswer('Sucre', 'Porto-Novo') && !box.sameAnswer('Lima', 'La Paz'));
  assert.ok(box.sameAnswer('Rivers', 'river'), 'the old rules still hold');
});

test('borders: far ones are listed but never a hint, a clue or a near-miss; no question counts neighbours', () => {
  const fr = ATL.codes().indexOf('FR'), br = ATL.codes().indexOf('BR'), gy = ATL.codes().indexOf('GY');
  assert.equal(ATL.closePoints(fr, br), 0, 'France is no near miss for Brazil');
  assert.ok(ATL.closePoints(gy, br) >= 150, 'Guyana is');
  assert.match(GAME, /const nb = nearBorders\(c\), pairs = \[\];/, 'daily clues: near neighbours, a pair only this country touches');
  assert.match(GAME, /const nbs = nearBorders\(c\)\.map/, 'hints');
  for (const s of [GAME, LIVE, fs.readFileSync(path.join(ROOT, 'server/services/atlas-print.js'), 'utf8')]) {
    assert.doesNotMatch(s, /how many (neighbou?rs|countries (border|touch))/i, 'Mauritania, Morocco, Algeria, Albania, North Macedonia and Montenegro border places not in the game');
  }
  // Atlas Quest Live carries the same borders
  const al = JSON.parse(LIVE.match(/var AL = (\{.*\});\n/)[1]);
  for (const c of al.C) assert.equal(c[7], BY[c[0]][11], `${c[0]}: live borders`);
  assert.equal(LIVE.match(/var AL_PACK_VER = "([^"]+)"/)[1], PACK_VER, 'live pins the same packs');
});

test('the capital note is shown with the capital: country file, library and the printed key', () => {
  assert.match(GAME, /c\.capNote = D\.CAPNOTE && D\.CAPNOTE\[c\.cc\] \? tk\('capnote\.' \+ c\.cc, D\.CAPNOTE\[c\.cc\]\) : '';/);
  assert.match(GAME, /<dd dir="auto">\$\{esc\(c\.capital\)\}\$\{c\.capNote \?/, 'factsDl (the country file and the library)');
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales/en.json'), 'utf8'));
  const t = (k, v) => { let s = k.split('.').reduce((o, p) => o && o[p], en); if (typeof s !== 'string') s = k; return v ? s.replace(/\{(\w+)\}/g, (m, x) => (x in v ? v[x] : m)) : s; };
  const doc = cleanAtlasPrintDoc({ t: 'Capitals', r: 'world', q: [['cap', 'BJ'], ['cap', 'BO'], ['cap', 'FR']], key: true }).doc;
  const key = atlasPrintHtml(doc, { t, lang: 'en' }).split('cwp-page atp-page atp-key')[1];
  assert.match(key, /Porto-Novo \(The government sits in Cotonou\.\)/); assert.match(key, /Sucre \(The government sits in La Paz\.\)/); assert.match(key, />Paris</);
  const de = atlasPrintHtml(doc, { t, lang: 'de' }).split('cwp-page atp-page atp-key')[1];
  assert.match(de, /Porto-Novo \(Die Regierung sitzt in Cotonou\.\)/);
});

test('the 1.0.1 packs: every key of 1.0.0 and the new ones; 1.0.0 stays byte for byte', () => {
  assert.notEqual(PACK_VER, OLD);
  for (const [l, sri] of Object.entries(OLD_SRI)) {
    assert.equal('sha384-' + crypto.createHash('sha384').update(fs.readFileSync(path.join(DIR, OLD, `${l}.js`))).digest('base64'), sri, `${OLD}/${l}.js unchanged`);
    const p = packOf(PACK_VER, l), o = packOf(OLD, l);
    for (const k of Object.keys(o.strings)) assert.ok(p.strings[k], `${l}: ${k}`);
    assert.deepEqual(Object.keys(p.trivia).sort(), Object.keys(o.trivia).sort(), `${l}: culture questions`);
    for (const cc of Object.keys(o.trivia)) p.trivia[cc].forEach((x, i) => assert.ok(x.length === 6 && x.every(v => typeof v === 'string' && v.trim()), `${l}: ${cc} ${i}`));
    for (const cc of Object.keys(D.CAPNOTE)) assert.ok(p.strings[`capnote.${cc}`], `${l}: capnote.${cc}`);
    for (const cc of Object.keys(D.CAPALT)) assert.ok(p.strings[`capalt.${cc}`], `${l}: capalt.${cc}`);
    assert.ok(p.strings.Romansh, `${l}: Romansh`);
  }
  assert.deepEqual(fs.readdirSync(path.join(DIR, OLD)).sort(), Object.keys(OLD_SRI).map(l => `${l}.js`).sort());
});
