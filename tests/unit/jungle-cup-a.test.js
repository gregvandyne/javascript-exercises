// Jungle Cup sports, part A (Vine Climb and Seed Shot): their words, songs and sounds, and the rules each file keeps
// (no allocation-heavy calls in the frame loop, nothing that leaves the game, targets are fruit only).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tools/jungle-cup/src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const words = id => { const I18N = {}; vm.runInNewContext(read(`i18n/${id}.en.js`), { I18N }); return I18N.en; };
const SPORTS = { vine: { prefix: 'vc', families: { 'vc.sign': [0, 1, 2] }, music: 'vine', sfx: ['buzz'] },
  seed: { prefix: 'ss', families: { 'ss.row': [0, 1, 2, 3], 'ss.plus': [0, 1, 2, 3], 'ss.tico': [0, 1, 2, 3] }, music: 'seed', sfx: ['pop'] } };

for (const [id, o] of Object.entries(SPORTS)) {
  test(`${id}: every word it asks for is in i18n/${id}.en.js, under its own prefix`, () => {
    const src = read(`sport-${id}.js`), en = words(id);
    const keys = new Set([`sport.${id}.goal`, `sport.${id}.touch`, `sport.${id}.keys`]);
    for (const m of src.matchAll(/\b(?:t|label)\(\s*'([a-zA-Z0-9_.-]+)'\s*[,)]/g)) if (m[1].startsWith(o.prefix + '.')) keys.add(m[1]);
    for (const [fam, ns] of Object.entries(o.families)) { assert.match(src, new RegExp(`'${fam.replace('.', '\\.')}' \\+`), fam); for (const n of ns) keys.add(fam + n); }
    for (const k of keys) assert.equal(typeof en[k], 'string', k);
    for (const k of Object.keys(en)) assert.ok(k.startsWith(`sport.${id}.`) || k.startsWith(o.prefix + '.'), `${k}: keys stay in this sport's own space`);
  });
  test(`${id}: its own song and sounds, a test bot and test hooks, and the frame loop allocates no arrays or objects`, () => {
    const src = read(`sport-${id}.js`);
    assert.match(src, new RegExp(`AUDIO\\.songs\\.${o.music} = \\{`));
    assert.match(src, new RegExp(`music: '${o.music}'`));
    for (const s of o.sfx) assert.match(src, new RegExp(`AUDIO\\.addSfx\\('${s}'`));
    const song = src.slice(src.indexOf(`AUDIO.songs.${o.music} = {`));
    for (const part of ['lead', 'harm', 'bass']) { const m = new RegExp(`${part}: '([^']*)'`).exec(song); assert.equal(m[1].trim().split(/\s+/).length, 32, `${part} has 32 steps`); }
    assert.equal(/drums: '([^']*)'/.exec(song)[1].length, 32);
    assert.match(src, /test: \{\s*\n\s*auto\(ctx, on/);
    // update() and draw() bodies: no array/object literals made per frame, no closures over the frame
    for (const fn of ['function update(dt, ctx)', 'function draw(g, ctx)']) {
      const a = src.indexOf(fn); assert.ok(a > 0, fn);
      let depth = 0, i = src.indexOf('{', a), b = i;
      for (; b < src.length; b++) { if (src[b] === '{') depth++; else if (src[b] === '}' && --depth === 0) break; }
      const body = src.slice(i + 1, b).replace(/'[^'\n]*'/g, "''");
      assert.ok(!/=\s*\[|\(\s*\[|=\s*\{\s*[a-z]+:|new [A-Z]|=>/.test(body), `${id} ${fn}: allocates in the frame loop`);
    }
    for (const bad of [/localStorage/, /fetch\s*\(/, /setTimeout|setInterval/, /BRB\./, /\bI18N\b/]) assert.ok(!bad.test(src), `${id}: ${bad}`);
  });
}
test('seed: Seed Shot only ever aims at fruit', () => {
  const src = read('sport-seed.js');
  assert.match(src, /FRUIT = \['ss_star', 'ss_berry', 'ss_mango', 'ss_papaya'\]/);
  assert.ok(!/target[^\n]*(tico|cappy|SPRITES\.(?!ss_))/i.test(src.replace(/sd\.target/g, '')), 'no seed is aimed at a character');
});
