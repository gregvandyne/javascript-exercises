// Atlas Quest's maps of the US states and of Canada's provinces and territories (docs/decisions.md "Atlas Quest: US
// states and Canada"):
//   - the data (window.AtlasPlaces): 51 US entries (50 states and DC) and 13 Canadian, each with its capital (DC none),
//     postal abbreviation, region and facts; valid shapes on their flat maps, each label inside its own shape;
//   - the 1.1.0 packs: every place's name and capital in all 11 languages; 1.0.0 and 1.0.1 untouched;
//   - the map code: the 'us' and 'ca' frames, only their places drawn, the small ones on an arrow, the insets;
//   - the game's questions (find, name, capital, abbreviation) and its words in every language;
//   - the teacher's quizzes (cleanAtlasItems): one map per quiz, a state's kinds only;
//   - print: the blank map with its numbers and arrows, the lines carried on, the key on its own page;
//   - Atlas Quest Live: the 'us' and 'ca' regions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { reset, open, hostSocket, player, publish, official, liveHtml, teacher } from './_live.js';
import { cleanAtlasItems } from '../../server/services/game-sets.js';
import { cleanAtlasPrintDoc, atlasPrintHtml } from '../../server/services/atlas-print.js';
import * as ATL from '../../server/live/atlas.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/atlas-quest.html'), 'utf8');
const LIVE = fs.readFileSync(path.join(ROOT, 'seed-games/atlas-quest-live.html'), 'utf8');
const line = k => JSON.parse(HTML.split('\n').find(l => l.startsWith(k)).slice(k.length).replace(/;\s*$/, ''));
const D = line('window.AtlasData = '), P = line('window.AtlasPlaces = ');
const SRC = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/atlas-quest/places.json'), 'utf8'));
const box = { window: {} };
vm.runInNewContext(/\/\* atlas-map:begin \*\/([\s\S]*?)\/\* atlas-map:end \*\//.exec(HTML)[1], box);
const M = box.window.AtlasMap.make(D, P);
const US = P.P.filter(r => r[0].startsWith('US-')), CA = P.P.filter(r => r[0].startsWith('CA-'));
const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales/en.json'), 'utf8'));
const t = (k, v) => { let s = k.split('.').reduce((o, p) => o && o[p], en); if (typeof s !== 'string') s = k; return v ? s.replace(/\{(\w+)\}/g, (m, x) => (x in v ? v[x] : m)) : s; };
const LANGS = ['ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant'];
const decode = a => { const out = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push([x / 10, y / 10]); } return out; };
const inside = (rings, x, y) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

test('the data: 51 US entries (50 states and DC), 13 Canadian, every capital, abbreviation and region', () => {
  assert.equal(US.length, 51); assert.equal(CA.length, 13); assert.equal(P.P.length, SRC.places.length);
  assert.equal(US.filter(r => r[0] !== 'US-DC').length, 50);
  const postal = new Set(); for (const r of P.P) { assert.match(r[3], /^[A-Z]{2}$/, r[0]); assert.equal(r[0].slice(3), r[3], `${r[0]}: its postal abbreviation`); postal.add(r[0]); }
  assert.equal(postal.size, 64, 'no place twice');
  for (const r of P.P) {
    if (r[0] === 'US-DC') { assert.equal(r[2], '', 'DC has no capital of its own'); continue; }
    assert.ok(r[2], `${r[0]} has a capital`);
    assert.ok(r[9] && r[10], `${r[0]}: its capital's position`);
    assert.ok(r[12], `${r[0]}: its largest city`);
  }
  const reg = { 'US-': ['usne', 'usmw', 'uss', 'usw'], 'CA-': ['caat', 'cace', 'capr', 'cawc', 'cano'] };
  for (const r of P.P) assert.ok(reg[r[0].slice(0, 3)].includes(r[4]), `${r[0]}: a region`);
  // the US Census Bureau's regions: 9 Northeast, 12 Midwest, 17 South (with DC), 13 West
  assert.deepEqual(['usne', 'usmw', 'uss', 'usw'].map(k => US.filter(r => r[4] === k).length), [9, 12, 17, 13]);
  // a few facts that are easy to get wrong
  const by = Object.fromEntries(P.P.map(r => [r[0], r]));
  for (const [cc, cap, big] of [['US-CA', 'Sacramento', 'Los Angeles'], ['US-NY', 'Albany', 'New York City'], ['US-IL', 'Springfield', 'Chicago'], ['US-AL', 'Montgomery', 'Huntsville'],
    ['US-SC', 'Columbia', 'Charleston'], ['US-MN', 'Saint Paul', 'Minneapolis'], ['US-PA', 'Harrisburg', 'Philadelphia'], ['CA-ON', 'Toronto', 'Toronto'], ['CA-BC', 'Victoria', 'Vancouver'],
    ['CA-NB', 'Fredericton', 'Moncton'], ['CA-QC', 'Quebec City', 'Montreal'], ['CA-NU', 'Iqaluit', 'Iqaluit'], ['CA-SK', 'Regina', 'Saskatoon']]) {
    assert.equal(by[cc][2], cap, `${cc} capital`); assert.equal(by[cc][12], big, `${cc} largest city`);
  }
  assert.ok(!/—/.test(JSON.stringify(SRC)), 'no em dashes');
});

test('the geometry: every place has rings on its own map, inside its frame, with its label inside its shape', () => {
  for (const m of ['us', 'ca']) {
    const f = P.MAPS[m].frame;
    assert.ok(f[0] >= -180 && f[2] <= 360 && f[1] >= -90 && f[3] <= 90, `${m}: the frame fits a saved arrow's range`);
    for (const r of P.P.filter(x => x[0].toLowerCase().startsWith(m))) {
      const rings = P.MAP[r[0]].map(decode);
      assert.ok(rings.length && rings.every(x => x.length >= 3), `${r[0]}: rings`);
      for (const ring of rings) for (const [x, y] of ring) assert.ok(x >= f[0] && x <= f[2] && y >= f[1] && y <= f[3], `${r[0]} inside its frame`);
      assert.ok(inside(rings, r[5], r[6]), `${r[0]}: its label point is inside its shape`);
    }
  }
  // Alaska and Hawaii sit in their insets, clear of the lower 48
  const ins = P.MAPS.us.insets; assert.equal(ins.length, 2);
  for (const r of US.filter(x => !x[13])) for (const ring of P.MAP[r[0]].map(decode)) for (const [x, y] of ring) for (const b of ins) assert.ok(!(x > b[0] && x < b[2] && y > b[1] && y < b[3]), `${r[0]} clear of an inset`);
  assert.ok(Buffer.byteLength(HTML) < 2 * 1024 * 1024, 'the game stays under 2 MB');
});

test('the 1.1.0 packs: every place\'s name and capital in 11 languages; the older packs stay byte for byte', () => {
  const ver = /const PACK_VER = '([^']+)', PACK_SRI = (\{[^}]*\})/.exec(HTML), sri = JSON.parse(ver[2]);
  assert.match(ver[1], /^1\.1\.0-[0-9a-f]{8}$/);
  assert.match(LIVE, new RegExp(`AL_PACK_VER = "${ver[1].replace(/\./g, '\\.')}"`), 'Atlas Quest Live pins the same packs');
  for (const lang of LANGS) {
    const src = fs.readFileSync(path.join(ROOT, 'public/vendor/data/atlas-quest', ver[1], `${lang}.js`), 'utf8');
    assert.equal(sri[lang], 'sha384-' + crypto.createHash('sha384').update(src).digest('base64'), `${lang}: its checksum`);
    const b = { window: {} }; vm.runInNewContext(src, b); const s = b.window.AtlasPacks[lang].strings;
    const old = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/vendor/data/atlas-quest/1.0.1-9c114c30', `${lang}.js`), 'utf8'), old);
    for (const k of Object.keys(old.window.AtlasPacks[lang].strings)) assert.ok(k in s, `${lang}: keeps ${k}`);
    for (const r of P.P) {
      assert.ok(s[`name.${r[0]}`], `${lang}: name.${r[0]}`);
      if (r[2]) assert.ok(s[`cap.${r[0]}`], `${lang}: cap.${r[0]}`);
    }
    assert.ok(!P.P.some(r => /—/.test(s[`name.${r[0]}`] + (s[`cap.${r[0]}`] || ''))), `${lang}: no em dashes`);
  }
  // the frozen folders keep their names (their hash is their bytes)
  for (const v of ['1.0.0-b244a5ca', '1.0.1-9c114c30']) {
    const order = LANGS.slice().sort((a, b) => Object.keys(sri).indexOf(a) - Object.keys(sri).indexOf(b));
    const h = crypto.createHash('sha256').update(order.map(l => fs.readFileSync(path.join(ROOT, 'public/vendor/data/atlas-quest', v, `${l}.js`), 'utf8')).join('\n')).digest('hex').slice(0, 8);
    assert.equal(h, v.split('-')[1], `${v} unchanged`);
  }
});

test('the map code: the us and ca frames draw only their places, the small ones on an arrow, the insets framed', () => {
  assert.deepEqual([...M.SUBS], ['us', 'ca']);
  assert.equal(M.members('us').length, 51); assert.equal(M.members('ca').length, 13);
  assert.ok(!M.geo('na').near.some(cc => cc.includes('-')), 'the world\'s maps never draw a state');
  assert.ok(M.geo('us').near.every(cc => cc.startsWith('US-')));
  assert.equal(M.frameFor(['US-RI', 'US-OH']), 'us'); assert.equal(M.frameFor(['CA-PE']), 'ca'); assert.equal(M.frameFor(['FR', 'DE']), 'eu');
  for (const cc of ['US-RI', 'US-DE', 'US-CT', 'US-NJ', 'US-MD', 'US-MA', 'US-VT', 'US-NH', 'US-DC', 'CA-PE']) assert.ok(M.small(cc.slice(0, 2).toLowerCase(), cc), `${cc} gets an arrow`);
  assert.ok(!M.small('us', 'US-TX') && !M.small('ca', 'CA-ON'));
  for (const id of ['us', 'ca']) {
    const ccs = M.members(id), nums = Object.fromEntries(ccs.map((cc, i) => [cc, i + 1])), small = ccs.filter(cc => M.small(id, cc));
    const co = M.autoPlace(id, small, {}, ccs);
    assert.deepEqual([...Object.keys(co)].sort(), [...small].sort(), `${id}: every small place placed`);
    const L = M.layout(id, co).items;
    const all = Object.keys(L);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = L[all[i]], b = L[all[j]];
      assert.ok(!M.segsCross(a.p[0], a.p[1], a.a[0], a.a[1], [b.p[0], b.p[1], b.a[0], b.a[1]]), `${id}: ${all[i]} and ${all[j]} leaders don't cross`);
    }
    const svg = M.svg(id, { nums, co });
    for (const cc of small) assert.match(svg, new RegExp(`data-co="${cc}"`));
    assert.equal((svg.match(/class="atm-inset"/g) || []).length, id === 'us' ? 2 : 0);
    // the game's map to tap: a box with a hit area for every small place, no numbers
    const play = M.svg(id, { nums: Object.fromEntries(small.map(cc => [cc, ''])), co, play: true });
    assert.equal((play.match(/class="atm-hit"/g) || []).length, small.length);
    assert.equal((play.match(/class="atm-tagbox"/g) || []).length, small.length);
  }
});

test('the game: its questions, the map choice, its words in every language, no browser dialogs', () => {
  const mod = HTML.slice(HTML.indexOf('<script type="module">'));
  for (const k of ['sfind', 'sname', 'scap', 'scapc', 'sabbr', 'sabbrc']) assert.match(mod, new RegExp(`kind === '${k}'`), k);
  assert.match(mod, /AtlasMap\.make\(D, PD\)/);
  assert.match(mod, /const NO_CAP_Q = new Set\(\['IL', 'PS', 'YE', 'NR', 'US-DC'\]\)/);
  assert.ok(!/confirm\(|alert\(|prompt\(/.test(mod), 'no browser dialogs');
  assert.ok(!HTML.includes('—'), 'no em dashes');
  // the page's own words: every new key in every table
  const src = HTML.split('\n'), i = src.findIndex(l => l.startsWith('var ATQ_I18N = {'));
  const T = new Function(src.slice(i, src.indexOf('};', i) + 1).join('\n') + '; return ATQ_I18N;')();
  const keys = ['mapL', 'map_us', 'map_ca', 'reg_usne', 'reg_cano', 'm_sfind', 'm_sabbr', 'sFind', 'qName', 'sCap', 'sCapcUs', 'sCapcCa', 'sAbbr', 'sAbbrc', 'sThat', 'sWas', 'postal', 'nick', 'largest', 'k_abbr', 'mixMaps', 'lib_places', 'mapOf_us', 'mapOf_ca'];
  for (const lang of ['en', ...LANGS]) for (const k of keys) {
    assert.ok(T[lang][k], `${lang}: ${k}`);
    assert.deepEqual((T[lang][k].match(/\{\w+\}/g) || []).sort(), (T.en[k].match(/\{\w+\}/g) || []).sort(), `${lang}: ${k} slots`);
  }
  // the blank maps of states are a teacher's tool, as every blank map (#650)
  assert.match(mod, /function showBlank\(reg, numbered, key\) \{\n {2}if \(!CAN_MAKE\) \{ goHome\(\); return; \}/);
});

test('teachers\' quizzes: one map a quiz, a state\'s own question types, DC never asked its capital', () => {
  const ok = cleanAtlasItems([{ t: 'New England', r: 'us', q: [['map', 'US-RI'], ['cap', 'US-MA'], ['capc', 'US-VT'], ['abbr', 'US-ME'], ['own', 'Which ocean is east of Maine?', 'The Atlantic', 'US-ME']], a: [['US-RI', 1100, 300]] }]);
  assert.ok(ok, 'a quiz of states');
  assert.equal(ok[0].r, 'us');
  assert.equal(cleanAtlasItems([{ r: 'ca', q: [['map', 'CA-PE'], ['cap', 'CA-NU'], ['abbr', 'CA-QC']] }])[0].q.length, 3);
  assert.equal(cleanAtlasItems([{ r: 'us', q: [['map', 'FR']] }]), null, 'no country on a map of states');
  assert.equal(cleanAtlasItems([{ r: 'eu', q: [['map', 'US-OH']] }]), null, 'no state on a world map');
  assert.equal(cleanAtlasItems([{ r: 'us', q: [['map', 'CA-ON']] }]), null, 'no province on the US map');
  assert.equal(cleanAtlasItems([{ r: 'us', q: [['flag', 'US-TX']] }]), null, 'a state has no flag question');
  assert.equal(cleanAtlasItems([{ r: 'eu', q: [['abbr', 'FR']] }]), null, 'a country has no postal abbreviation');
  assert.equal(cleanAtlasItems([{ r: 'us', q: [['cap', 'US-DC']] }]), null, 'DC has no capital to ask');
  assert.equal(cleanAtlasItems([{ r: 'us', q: [['own', 'Q?', 'A', 'FR']] }]), null);
});

test('print: the US blank map with its key (numbers, arrows for the small states, lines carried on, the key\'s page)', () => {
  const ccs = M.members('us'), co = M.autoPlace('us', ccs.filter(cc => M.small('us', cc)), {}, ccs);
  const raw = { t: '', r: 'us', q: ccs.map(cc => ['map', cc]), a: Object.keys(co).map(cc => [cc, Math.round(co[cc][0] * 10), Math.round(co[cc][1] * 10)]), blank: true, key: true };
  const r = cleanAtlasPrintDoc(raw); assert.ok(r.ok);
  const html = atlasPrintHtml(r.doc, { t, lang: 'en' });
  const [sheet, key] = html.split('cwp-page atp-page atp-key');
  assert.match(sheet, /<h1 dir="auto">Map of the United States<\/h1>/);
  assert.match(sheet, /Write the name of each numbered state\. Small ones have an arrow to their own line\./);
  assert.match(sheet, /atp-mapsec atp-many/, 'a whole map: four columns of lines that carry on over the next page');
  for (const cc of ['US-RI', 'US-DE', 'US-DC']) assert.match(sheet, new RegExp(`data-co="${cc}"`), `${cc}: its arrow`);
  assert.doesNotMatch(sheet, /Rhode Island|Texas/, 'no names on the sheet');
  assert.ok(key); assert.match(key, /Map of the United States: Answer key/); assert.match(key, />District of Columbia</); assert.match(key, />Wyoming</);
  // Canada, and its questions in French
  const fr = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales/fr.json'), 'utf8'));
  const tf = (k, v) => { let s = k.split('.').reduce((o, p) => o && o[p], fr); if (typeof s !== 'string') s = t(k); return v ? s.replace(/\{(\w+)\}/g, (m, x) => (x in v ? v[x] : m)) : s; };
  const q = cleanAtlasPrintDoc({ t: 'Canada', r: 'ca', q: [['map', 'CA-PE'], ['cap', 'CA-NU'], ['capc', 'CA-AB'], ['abbr', 'CA-QC']], key: true });
  const frHtml = atlasPrintHtml(q.doc, { t: tf, lang: 'fr' });
  assert.match(frHtml, /Nunavut : quelle est sa capitale \?/); assert.match(frHtml, /Edmonton est la capitale de quelle province ou de quel territoire \?/);
  assert.match(frHtml, /Québec : quelle est son abréviation postale \?/); assert.match(frHtml, />QC</); assert.match(frHtml, />Iqaluit</); assert.match(frHtml, /Île-du-Prince-Édouard/);
});

test('Atlas Quest Live: the us and ca regions ask about their own places, with their own near misses', () => {
  assert.ok(ATL.REGIONS.includes('us') && ATL.REGIONS.includes('ca'));
  assert.equal(ATL.parseId('atlas:us:easy:find+capital:10:20').region, 'us');
  const codes = ATL.placeCodes('us');
  assert.equal(codes.length, 51); assert.equal(ATL.placeCodes('ca').length, 13);
  for (let n = 0; n < 10; n++) {
    const items = ATL.atlasItems('atlas:us:easy:find+capital+flag:10:20', 'en');
    assert.equal(items.length, 10);
    for (const it of items) {
      assert.deepEqual(it.choices, codes); assert.equal(it.atlas.reg, 'us'); assert.ok(['find', 'capital'].includes(it.atlas.k));
      if (it.atlas.k === 'capital') { assert.notEqual(codes[it.answer], 'US-DC'); assert.match(it.q, /^Find the state whose capital is /); } else assert.match(it.q, /^Find /);
    }
  }
  assert.equal(ATL.atlasItems('atlas:ca:hard:find:20:20', 'fr').length, 13, 'all of Canada, no more');
  assert.ok(ATL.closePoints(codes.indexOf('US-IN'), codes.indexOf('US-OH'), 'us') > 0, 'a neighbour is a near miss');
  assert.equal(ATL.closePoints(codes.indexOf('US-AK'), codes.indexOf('US-WA'), 'us'), 0, 'never from an inset');
  assert.equal(ATL.closePoints(codes.indexOf('US-ME'), codes.indexOf('US-CA'), 'us'), 0);
  assert.equal(ATL.countryName('US-NY', 'es'), 'Nueva York');
  // the live page has the same places, in the same order, and swaps to their map
  const al = JSON.parse(/var AL = (\{.*\});\n/.exec(LIVE)[1]);
  assert.deepEqual(al.P.filter(r => r[4] === 'us').map(r => r[0]), codes);
  assert.match(LIVE, /function useMap\(reg\)/);
});

test('Atlas Quest Live, a US round with 3 players: the right state, a neighbour (a near miss) and a far one, scored by the server', async () => {
  reset();
  publish(official, liveHtml("live.on('question', () => {});", { quiz: true }), { source: 'seed', slug: 'atlas-quest-live', title: 'Atlas Quest Live' });
  const s = open(teacher, { mode: 'atlas', starter: 'atlas:us:easy:find:5:30', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const ps = [await player(s), await player(s), await player(s)];
  h.send({ t: 'h', a: 'start' });
  await Promise.all(ps.map(p => p.next('ph', m => m.phase === 'loading')));
  for (const p of ps) p.send({ t: 'rdy', view: '2d' });
  const [qm] = await Promise.all(ps.map(p => p.next('q')));
  assert.equal(qm.choices.length, 51, 'the choices are the US map\'s places');
  assert.equal(s.state.atl.reg, 'us');
  const codes = ATL.placeCodes('us'), answer = s.qz.cur.answer, cc = codes[answer];
  // the nearest other lower-48 state (by the map's own distances) is a near miss; the farthest one is not
  const P2 = ATL.data().P.filter(r => r[0].startsWith('US-')), me = P2[answer];
  const others = P2.map((r, i) => [i, Math.hypot(r[5] - me[5], r[6] - me[6]), r[13]]).filter(x => x[0] !== answer && !x[2]).sort((a, b) => a[1] - b[1]);
  const near = others[0][0], far = others[others.length - 1][0];
  ps.forEach((p, k) => p.send({ t: 'an', i: qm.i, c: [answer, near, far][k], e: 400 }));
  const rv = await h.next('rv');
  assert.equal(rv.answer, answer); assert.equal(rv.counts.length, 51);
  const ys = await Promise.all(ps.map(p => p.next('you')));
  assert.equal(ys[0].ok, true); assert.ok(ys[0].points >= 500, `right: ${ys[0].points}`);
  if (!me[13]) assert.ok(ys[1].points > 0 && ys[1].points <= 200, `${cc}'s neighbour ${codes[near]}: ${ys[1].points}`);
  assert.equal(ys[2].points, 0, 'far away: nothing');
  for (const c of [h, ...ps]) c.ws.close();
});
