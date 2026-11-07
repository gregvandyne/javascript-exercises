// Hero of Sunvale's breeze models (?style=breeze, a mockup): the data pack the game pins (its file, hash and size), every
// asset in it (meshes that decode, triangle budgets, lighter levels of detail, painted JPEG textures, rigs and clips), and
// that only the breeze style ever loads it (the default and cartoon looks are unchanged).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/hero-of-sunvale.html'), 'utf8');
const PACK = HTML.match(/const BZ_PACK = \{ src: '([^']+)', integrity: '([^']+)' \};/);
const file = PACK && path.join(ROOT, 'public', PACK[1]);
const body = file && fs.readFileSync(file, 'utf8');
const win = {}; if (body) new Function('window', body)(win);
const A = win.__hosBreeze || {};
// triangles allowed per asset (the full model; props also carry a lighter lod1)
const BUDGET = { hero: 6000, granny: 6000, cottage: 2500, tree: 700, barrel: 600, fence: 300, villager: 9000, foes: 10000 };
const len = b64 => Buffer.from(b64, 'base64').length;

test('the game pins the pack by path and sha384, and it is small', () => {
  assert.ok(PACK, 'BZ_PACK in the game'); assert.match(PACK[1], /^\/vendor\/data\/hero-of-sunvale\/[\w.-]+\/breeze-models\.js$/);
  assert.equal(PACK[2], 'sha384-' + crypto.createHash('sha384').update(body).digest('base64'), 'the integrity is the file\'s');
  assert.ok(body.length < 1.5e6, `${body.length} bytes (stop and ask past 1.5 MB)`);
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'public/vendor/data/hero-of-sunvale')), [path.basename(path.dirname(file))], 'one pack folder');
});

test('only the breeze style loads it; the default and cartoon never do', () => {
  assert.match(HTML, /const BREEZE = !TOON && \(\(\) => \{ try \{ return new URLSearchParams\(location\.search\)\.get\('okStyle'\) === 'breeze';/);
  assert.match(HTML, /if \(BREEZE\) \{ const pack = bzLoad\(\);/);
  assert.equal((HTML.match(/= bzLoad\(\)/g) || []).length, 1, 'one call, under BREEZE');
});

test('every asset decodes, keeps to its triangle budget, has a painted texture and a lighter far copy', () => {
  for (const [name, max] of Object.entries(BUDGET)) {
    const a = A[name]; assert.ok(a, name); assert.match(a.tex, /^data:image\/jpeg;base64,/, `${name} texture`);
    assert.ok(len(a.tex.split(',')[1]) < 40000, `${name} texture is small`);
    let tris = 0;
    for (const [part, m] of Object.entries(a.meshes)) {
      for (const g of [m, m.lod1].filter(Boolean)) {
        assert.equal(len(g.pos), g.verts * 6, `${name}.${part} positions`); assert.equal(len(g.nrm), g.verts * 3); assert.equal(len(g.uv), g.verts * 4);
        assert.equal(len(g.col), g.verts * 4); assert.equal(len(g.bone), g.verts); assert.equal(len(g.idx), g.tris * 3 * (g.verts < 65536 ? 2 : 4));
      }
      if (m.lod1) assert.ok(m.lod1.tris < m.tris * 0.6, `${name}.${part} lod1 is lighter`);
      tris += m.tris;
    }
    assert.ok(tris <= max, `${name}: ${tris} triangles (budget ${max})`);
  }
});

test('the villager kit has every part the crowd and the named people use', () => {
  for (const k of ['legs', 'body', 'arm', 'head', 'eyes', 'hair_short', 'hair_bun', 'hair_long', 'hair_curls', 'beard', 'hat_straw', 'hat_top', 'hat_hood', 'helmet', 'apron']) assert.ok(A.villager.meshes[k], k);
  for (const k of ['head', 'body', 'legs']) assert.ok(A.villager.meshes[k].lod1, `${k} has a lighter crowd copy`);
});

test('the foe parts: every rig part the game draws for the blobble, grumblin, chief, puffcap and boar', () => {
  const want = { blobble: 1, grumblin: 4, chief: 4, puffcap: 2, boar: 4 };
  for (const [rig, n] of Object.entries(want)) for (let i = 0; i < n; i++) assert.ok(A.foes.meshes[`${rig}_${i}`], `${rig}_${i}`);
});

test('the characters are rigged, with clips for Granny (the hero is posed by the game)', () => {
  for (const n of ['hero', 'granny']) {
    const b = A[n].bones.map(x => x.name);
    for (const k of ['root', 'hips', 'chest', 'head', 'arm.L', 'arm.R', 'leg.L', 'leg.R']) assert.ok(b.includes(k), `${n} bone ${k}`);
  }
  assert.deepEqual(Object.keys(A.granny.clips).sort(), ['idle', 'talk']);
  for (const c of Object.values(A.granny.clips)) assert.ok(c.dur > 0.5 && c.tracks.length > 0 && c.tracks.every(t => (t.r || t.t).length === c.times.length * (t.r ? 4 : 3)));
});
