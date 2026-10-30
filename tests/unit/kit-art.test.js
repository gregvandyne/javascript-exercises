// Oomba Kit art library without a browser: every character (species x moods x outfits), every prop and variant, the
// icons, the biomes and auto-tiled ground draw deterministically through the "Oomba Ink" grammar (Ink outline, Cream
// rim, unlit/emissive mask, no blur); the colour-role rules hold (spark only on rewards, hazards coral + spiky); the
// rig's clips pose every part with finite numbers and volume-preserving squash; blinking and closed-eye moods hide pupils.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Atlas } from '../../kit/src/atlas.js';
import { PALETTE, INK, CREAM } from '../../kit/src/tokens.js';

class FakePath { constructor() { this.ops = []; } }
for (const m of ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'closePath']) FakePath.prototype[m] = function (...a) {
  for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error(`non-finite ${m}`);
  this.ops.push([m, ...a.map(v => (typeof v === 'number' ? +v.toFixed(3) : v))]);
};
globalThis.Path2D = FakePath;
function fakeDoc(log = []) {
  const ctxFor = c => new Proxy({ canvas: c, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), measureText: s => ({ width: String(s).length * 10 }), createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }) }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error(`non-finite ${String(k)}`); log.push([k, ...a.map(v => (v instanceof FakePath ? v.ops : typeof v === 'number' ? +v.toFixed(3) : typeof v === 'object' ? 'obj' : v))]); }; },
    set(t, k, v) { log.push(['set', k, v]); t[k] = v; return true; },
  });
  return { createElement: () => { const c = { width: 1, height: 1 }; const ctx = ctxFor(c); c.getContext = () => ctx; return c; } };
}
const { defineChar, charSpec, charRig, clipPose, CLIPS, FACES } = await import('../../kit/src/chars.js');
const { defineProps, PROP_GROUPS, PROP_NAMES, PROP_VARIANTS, REWARD_PROPS } = await import('../../kit/src/props.js');
const { BIOMES, BIOME_NAMES, RECIPES, biomeBands, autotile, defineGround } = await import('../../kit/src/biomes.js');
const { STYLE } = await import('../../kit/src/chars.js');
const { ICONS, ICON_NAMES, icon } = await import('../../kit/src/icons.js');
const { SPECIES, HAIR_STYLES, TOPS, WEAR } = await import('../../kit/src/validate.js');
// The art packs (kit/packs/) join the library first, so every check below covers their species, props and biomes too.
const { installPacks } = await import('../../kit/src/packs.js');
const packKit = { artPacks: [], stages: [], version: '1.0.0', warn: m => { throw new Error(m); }, doc: { createElement: () => ({}), head: { appendChild() {} } }, attachStage() {} }; installPacks(packKit);
for (const name of ['art-animals', 'art-school', 'art-biomes', 'dress', 'style-bold']) { const m = await import(`../../kit/packs/${name}.js`); packKit.definePack({ name: m.PACK.name, version: '1.0.0' }, m.define); }
const ALL_PROPS = [].concat(...Object.values(PROP_GROUPS));
const withPacks = A => { defineProps(A); for (const fn of packKit.artPacks) fn(A); };

/** Bake one sprite (name, variant) into a fresh atlas and return the drawing log as a string. */
function bake(setup, name, v = '', px = 120) { const log = []; const A = new Atlas({ doc: fakeDoc(log), pageSize: 2048 }); setup(A); A.sprite(name, px, v); return JSON.stringify(log); }
const hasInk = s => /"(strokeStyle|fillStyle)","#141414"/.test(s);
const hasRim = s => /"strokeStyle","#FFFDF2"/.test(s);
const hasUnlit = s => /"#00FF00"/.test(s);

test('characters: all 13 species (core + art-animals) bake every part deterministically, inked, rimmed and masked, with no blur', () => {
  assert.ok(SPECIES.length >= 13, SPECIES.join());
  for (const sp of SPECIES) {
    const spec = charSpec({ species: sp, wear: sp === 'kid' ? ['scarf', 'glasses', 'backpack'] : [] });
    let b = null; const setup = A => { b = defineChar(A, spec); };
    bake(setup, spec.id);
    assert.ok(b.parts.includes('head') && b.parts.includes('face') && b.parts.includes('pupilL'), `${sp} has head, face, pupils`);
    for (const part of b.parts.filter(p => !p.startsWith('pupil')).concat([''])) {
      const name = part ? spec.id + ':' + part : spec.id;
      const a = bake(setup, name, part === 'face' ? 'happy' : ''), a2 = bake(setup, name, part === 'face' ? 'happy' : '');
      assert.equal(a, a2, `${sp}/${part || 'portrait'} draws the same every time`);
      assert.ok(hasInk(a) && hasUnlit(a), `${sp}/${part || 'portrait'} has Ink and an unlit mask`);
      assert.doesNotMatch(a, /shadowBlur|"filter"/);
      if (['head', 'body', ''].includes(part)) assert.ok(hasRim(a), `${sp}/${part || 'portrait'} has the Cream sticker rim`);
    }
  }
  assert.match(bake(A => defineChar(A, charSpec('oomba')), charSpec('oomba').id + ':ears'), /"#FF0000"/, "the mascot's spark antenna glows");
});

test('characters: kids in every skin tone, hair style, outfit and wear; every face variant differs', () => {
  const seen = new Set();
  for (let skin = 0; skin < 8; skin++) for (const style of HAIR_STYLES) {
    const spec = charSpec({ species: 'kid', skin, hair: { style, color: ['cocoa', 'black', 'blonde', 'copper'][skin % 4] }, outfit: { top: TOPS[skin % 4], color: ['sky', 'grape', 'coral', 'mint'][skin % 4] }, wear: [WEAR[skin % WEAR.length]] });
    assert.ok(!seen.has(spec.id), 'distinct specs get distinct ids'); seen.add(spec.id);
    const s = bake(A => defineChar(A, spec), spec.id + ':head');
    assert.ok(s.includes(PALETTE.ink[0]) && hasRim(s));
  }
  assert.equal(charSpec({ species: 'kid', skin: 3 }).id, charSpec({ species: 'kid', skin: 3 }).id, 'same spec, same id');
  const kid = charSpec({ species: 'kid' }), faces = new Set();
  for (const f of FACES.concat(FACES.map(x => x + '.b'))) faces.add(bake(A => defineChar(A, kid), kid.id + ':face', f));
  assert.ok(faces.size >= FACES.length + 3, `face variants draw differently (${faces.size})`);
  // validation snaps instead of failing
  assert.equal(charSpec({ species: 'foxx' }).species, 'fox');
  assert.equal(charSpec({ species: 'dragon' }).species, 'oomba');
  assert.equal(charSpec({ species: 'frog', colors: { base: '#FF6B5A' } }).colors.base, 'coral');
  assert.ok(Object.isFrozen(charSpec('bee')));
});

test('rig: every clip poses every part with finite numbers; squash keeps volume; closed eyes hide pupils', () => {
  for (const sp of SPECIES) {
    const A = new Atlas({ doc: fakeDoc(), pageSize: 2048 });
    const b = defineChar(A, charSpec(sp));
    const e = { charB: b, stage: { atlas: A, reduced: false }, clip: 'idle', moodName: 'happy', lookX: 0.5, lookY: -0.5, vx: 0, blinkAt: 99, id: 1, rng: () => 0.5, state(c) { this.clip = c; return this; } };
    const out = Array.from({ length: 16 }, () => ({ c: {} }));
    for (const clip of CLIPS) {
      e.state(clip);
      for (let t = 0; t < 1.2; t += 0.07) {
        const n = charRig(e, 10 + t + CLIPS.indexOf(clip) * 2, out);
        assert.ok(n >= 5 && n <= 16, `${sp}/${clip}: ${n} parts`);
        for (let i = 0; i < n; i++) for (const k of ['x', 'y', 'w', 'h', 'r']) assert.ok(isFinite(out[i][k]), `${sp}/${clip} slot ${out[i].name}.${k}`);
        assert.ok(Math.abs(e.csx * e.csx * e.csy - 1) < 1e-6, 'volume-preserving squash (sx = 1/sqrt(sy))');
        const names = out.slice(0, n).map(o => o.name);
        if (clip === 'cheer' && t > 0.2) assert.ok(!names.includes(b.pupil), `${sp}: cheer closes the eyes`);
        if (clip === 'idle' && t > 0.2) assert.equal(names.filter(x => x === b.pupil).length, 2, `${sp}: idle shows both pupils`);
      }
    }
    // one-shot clips return to idle; walking is automatic from velocity
    e.state('land'); charRig(e, 50, out); charRig(e, 50.5, out); assert.equal(e.clip, 'idle');
    e.vx = 120; const n = charRig(e, 60, out); assert.ok(n > 0); e.vx = 0;
    // blinking hides pupils
    e.blinkAt = 70; const nb = charRig(e, 70.05, out); assert.ok(!out.slice(0, nb).some(o => o.name === b.pupil), 'blink');
  }
  const o = new Float32Array(14);
  clipPose('jump', 0, 0, o); assert.ok(o[13] > 1.1, 'jump stretches'); clipPose('land', 0, 0, o); assert.ok(o[13] < 0.85, 'land squashes');
});

test('props: every prop and variant (core + art-school) bakes deterministically with Ink, rim and mask', () => {
  assert.ok(PROP_NAMES.length >= 28, `${PROP_NAMES.length} core props`);   // the vehicles, shell, cactus, snowman and log are in the dress pack assert.ok(ALL_PROPS.length >= 60, `${ALL_PROPS.length} props with packs`);
  const setup = withPacks;
  const A0 = new Atlas({ doc: fakeDoc(), pageSize: 512 }); setup(A0);
  for (const name of ALL_PROPS) {
    if (['spark', 'heart', 'lantern', 'flower', 'cloud'].includes(name)) continue;   // core art (kit-render.test.js)
    assert.ok(A0.has(name), `${name} is defined`);
    for (const v of PROP_VARIANTS[name] || ['']) {
      const a = bake(setup, name, v), b = bake(setup, name, v);
      assert.equal(a, b, `${name}/${v} is deterministic`);
      assert.ok(hasInk(a), `${name}/${v} is inked`);
      assert.ok(hasUnlit(a), `${name}/${v} marks its ink unlit`);
      if (!['grass'].includes(name)) assert.ok(hasRim(a), `${name}/${v} has the sticker rim`);
    }
  }
  assert.notEqual(bake(setup, 'tile', 'A'), bake(setup, 'tile', 'B'), 'tiles show their glyph');
  assert.notEqual(bake(setup, 'pie', '1/4'), bake(setup, 'pie', '3/4'), 'fractions differ');
  assert.notEqual(bake(setup, 'clock', '3:00'), bake(setup, 'clock', '9:45'), 'clocks show the time');
});

test('colour roles: spark yellow only on rewards; hazards are coral and pointed', () => {
  const setup = withPacks;
  for (const name of ALL_PROPS) {
    if (['spark', 'heart', 'lantern', 'flower', 'cloud'].includes(name)) continue;
    const all = (PROP_VARIANTS[name] || ['']).map(v => bake(setup, name, v)).join('');
    if (!REWARD_PROPS.includes(name)) assert.ok(!all.includes(PALETTE.spark[2]), `${name} must not use spark yellow (rewards only)`);
  }
  // creatures never wear spark yellow (the bee is honey amber with Ink stripes); only the mascot's antenna spark,
  // the logo's own reward glyph, may use it
  const SPARK_RAMP = PALETTE.spark.map(h => h.toUpperCase());
  for (const sp of SPECIES) {
    const spec = charSpec({ species: sp }); let b = null; const setup2 = A => { b = defineChar(A, spec); };
    bake(setup2, spec.id);
    for (const part of b.parts.filter(p => !p.startsWith('pupil') && !(sp === 'oomba' && p === 'ears'))) {
      const fills = [...bake(setup2, spec.id + ':' + part, part === 'face' ? 'happy' : '').matchAll(/"(?:fillStyle|strokeStyle)","(#[0-9A-Fa-f]{6})"/g)].map(m => m[1].toUpperCase());
      for (const f of fills) assert.ok(!SPARK_RAMP.includes(f), `${sp}/${part} uses spark yellow ${f}: rewards only`);
    }
  }
  for (const name of PROP_GROUPS.hazards) {
    const s = bake(setup, name);
    assert.ok(s.includes(PALETTE.coral[2]) || s.includes(PALETTE.coral[3]), `${name} is coral`);
    assert.match(s, /"lineTo"|"arcTo"/, `${name} has corners (spiky), not only curves`);
  }
});

test('icons: 40+ glyphs on a 24 grid in the art\'s language: Ink lines (currentColor), role-filled stickers, pairs', () => {
  assert.ok(ICON_NAMES.length >= 40, `${ICON_NAMES.length} icons`);
  for (const n of ['play', 'pause', 'sound', 'music', 'settings', 'restart', 'home', 'check', 'cross', 'hint', 'lock', 'left', 'right', 'up', 'down', 'heart', 'spark', 'timer', 'move', 'jump', 'tap', 'drag', 'spark-off', 'heart-off', 'star', 'star-off', 'flag', 'flag-off']) assert.ok(ICONS[n], n);
  for (const n of ICON_NAMES) {
    const s = icon(n);
    assert.match(s, /^<svg class="ok-i" viewBox="0 0 24 24"[^>]*stroke="currentColor"[^>]*stroke-linecap="round"[^>]*aria-hidden="true">(<path( class="ok-i-(reward|danger|success|card)")? d="[^"<>]+"( fill="(currentColor|var\(--ok-(fill|icon-card),#[0-9A-F]{6}\))")?\/>)+<\/svg>$/, n);
    // colour only by role: rewards Spark, danger Coral, success Mint (never an arbitrary hue)
    for (const [, role, hex] of s.matchAll(/class="ok-i-(\w+)"[^>]*fill="var\(--ok-[a-z-]+,(#[0-9A-F]{6})\)"/g)) assert.equal(hex, { reward: PALETTE.spark[2], danger: PALETTE.coral[2], success: PALETTE.mint[2], card: CREAM }[role], `${n}: ${role}`);
    for (const d of ICONS[n]) for (const num of d.replace(/^\*/, '').match(/-?\d*\.?\d+/g) || []) assert.ok(Math.abs(+num) <= 24, `${n}: ${num} on the grid`);
    assert.doesNotMatch(s, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  }
  assert.match(icon('pause', { label: 'Pause "x"' }), /role="img" aria-label="Pause x"/);
  assert.match(icon('heart'), /ok-i-danger/, 'the HUD heart is the coral sticker heart (same as the prop)');
  assert.doesNotMatch(icon('heart-off'), /fill="var/, 'its pair is the outline');
  assert.match(icon('spark'), /ok-i-reward/); assert.doesNotMatch(icon('pause'), /ok-i-/, 'UI glyphs are plain Ink lines');
});

test('biomes: every biome bakes 2-4 parallax bands (ink on the top edge only) deterministically', () => {
  assert.ok(BIOME_NAMES.length >= 11, 'core + art-biomes');
  for (const biome of BIOME_NAMES) {
    for (const count of [2, 3, 4]) {
      const run = () => { const log = []; const bands = biomeBands(fakeDoc(log), { biome, vw: 960, vh: 540, pxk: 1, seed: 3, count }); return { bands, log: JSON.stringify(log) }; };
      const a = run(), b = run();
      assert.equal(a.bands.length, count); assert.equal(a.log, b.log, `${biome} is deterministic`);
      assert.ok(a.bands.every((x, i) => i === 0 || x.par > a.bands[i - 1].par), 'far to near');
      assert.match(a.log, /"strokeStyle","#141414"/);
    }
    assert.equal(BIOMES[biome].bands.length, 4);
  }
});

test('auto-dressing: tall bands (the far top at 34% less headroom), dense props by default, sparse with dress off', () => {
  const bake1 = dress => { const log = []; const bands = biomeBands(fakeDoc(log), { biome: 'meadow', vw: 960, vh: 540, pxk: 1, seed: 3, count: 4, dress }); return { bands, n: log.length }; };
  const auto = bake1('auto'), off = bake1('off'), dense = bake1(2);
  assert.ok(Math.abs(auto.bands[0].top - (0.34 * 540 - Math.round(540 * 0.2))) < 1, 'the far band starts at 34% (with 20% headroom for tall props)');
  assert.ok(auto.n > off.n * 1.5, `dressing draws much more (${auto.n} vs ${off.n})`);
  assert.ok(dense.n > auto.n, 'a higher density draws more');
  for (const b of ['meadow', 'forest', 'beach', 'snow', 'desert', 'candy']) assert.ok(RECIPES[b] && RECIPES[b].fg && RECIPES[b].bands, `the dress pack dresses ${b}`);
  assert.deepEqual(['car', 'bus', 'rocket', 'boat', 'plane'].filter(n => !PROP_GROUPS.vehicles.includes(n)), [], 'vehicles come from the dress pack');
});

test('bold style: the pack adds wear and biomes; bold faces have no blush and default to determined; proportions only in bold', () => {
  for (const n of ['hood', 'visor', 'headset', 'helmet', 'cap-back', 'jersey', 'bomber', 'techvest']) assert.ok(WEAR.includes(n), n);
  for (const n of ['cyber', 'skate', 'station', 'haunted']) assert.ok(BIOMES[n], n);
  assert.ok(STYLE.legs > 1 && STYLE.head < 1, 'the pack sets the proportions');
  const playful = charSpec({ species: 'kid' }), playfulHood = charSpec({ species: 'kid', wear: ['hood', 'jersey'] });
  STYLE.name = 'bold';
  try {
    const bold = charSpec({ species: 'kid', wear: ['hood', 'jersey'] });
    assert.equal(bold.mood, 'determined'); assert.notEqual(bold.id, playfulHood.id, 'bold art bakes apart');
    assert.equal(charSpec({ species: 'kid', mood: 'happy' }).mood, 'happy', 'an explicit mood stays');
    const face = bake(A => defineChar(A, bold), bold.id + ':head');
    assert.doesNotMatch(face, /rgba\(255,156,143/, 'no blush in bold');
  } finally { STYLE.name = 'playful'; }
  assert.match(bake(A => defineChar(A, playful), playful.id + ':head'), /rgba\(255,156,143/, 'playful keeps its blush');
});

test('ground: 16-case auto-tiling with depth; ink on every exposed edge (tops and step sides), strata and seeded looks', () => {
  const t = autotile(['  ##  ', '######', '##  ##']);
  const at = (x, y) => t.find(c => c.x === x && c.y === y).mask;
  assert.equal(t.length, 12);
  assert.equal(at(2, 0), 4 | 2, 'top-left of the bump: right and down neighbours');
  assert.equal(at(0, 1), 2 | 4, 'left edge');
  assert.equal(at(2, 1), 1 | 2 | 8, 'under the bump, nothing below');
  assert.equal(at(5, 2), 1 | 8, 'bottom right: up and left');
  const setup = A => defineGround(A);
  assert.deepEqual(autotile(['  #', '###']).map(c => c.depth), [0, 0, 0, 1], 'depth counts the solid tiles above');
  for (const biome of BIOME_NAMES) for (let mask = 0; mask < 16; mask++) {
    const s = bake(setup, 'ground:' + biome, String(mask), 64);
    const inked = /"strokeStyle","#141414"/.test(s);
    assert.equal(inked, (mask & 11) !== 11, `${biome}/${mask}: ink exactly when the top or a side is open`);
    assert.equal(s, bake(setup, 'ground:' + biome, String(mask), 64));
  }
  assert.notEqual(bake(setup, 'ground:meadow', '15.0.0', 64), bake(setup, 'ground:meadow', '15.3.0', 64), 'deeper soil is a darker stratum');
  assert.notEqual(bake(setup, 'ground:meadow', '15.1.0', 64), bake(setup, 'ground:meadow', '15.1.2', 64), 'three seeded looks, so tiling never shows');
});

test('the bundle exposes the library: chars, props, icons, biomes, screens', async () => {
  const idx = await import('../../kit/src/index.js');
  assert.equal(typeof idx.createKit, 'function');
  assert.ok(INK && CREAM);
  for (const sp of SPECIES) assert.ok(charSpec(sp).id.startsWith('ch'));
});
