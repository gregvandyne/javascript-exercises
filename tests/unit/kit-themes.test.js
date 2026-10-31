// Oomba Kit 1.1.0 themes (Oomba.game({ theme })): the table covers what kids ask for, every theme's world and props
// exist in the packs it names, each looks different (its own biome, recipe and light), names are forgiving, a missing
// pack falls back with a warning, 'light' / 'dark' still mean the mode (1.0 games), and recolouring keeps contrast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeWin } from '../support/kit-fake.js';
import { createKit, VERSION } from '../../kit/src/index.js';
import { contrast, luminance } from '../../kit/src/color.js';
import { PALETTE } from '../../kit/src/tokens.js';
import * as dress from '../../kit/packs/dress.js';

const { THEMES, ALIAS } = dress;
const BIOMES_MOD = await import('../../kit/src/biomes.js');
const PACKS = {};
for (const n of ['art-animals', 'art-school', 'art-biomes', 'art-biomes-2', 'art-props', 'dress', 'style-bold']) PACKS[n] = await import(`../../kit/packs/${n}.js`);
const FLAT = ['                              ', '  P                           ', '##############################'];
/** A game with the given packs loaded (all by default), not started. */
function game(spec, packs = Object.keys(PACKS)) {
  const win = fakeWin({ brb: { version: 3, gameOver() {} } });
  const O = createKit(win), kit = O.debug.kit;
  for (const n of packs) O.__pk({ name: n, version: VERSION }, PACKS[n].define);
  const g = O.game(Object.assign({ api: 1, title: 'T', autorun: false, level: O.level.grid(FLAT, {}, { cell: 48 }) }, spec));
  return { O, kit, g, win, warns: win.__warns };
}

test('the theme table: the 12 kids ask for (and more), each its own world, with props that exist', () => {
  for (const n of ['meadow', 'beach', 'jungle', 'snow', 'desert', 'reef', 'space', 'candy', 'haunted', 'castle', 'cyber', 'stadium']) assert.ok(THEMES[n], n);
  assert.equal(new Set(Object.values(THEMES).map(t => t.biome)).size, Object.keys(THEMES).length, 'no two themes share a biome');
  const { O } = game({});
  for (const [name, t] of Object.entries(THEMES)) {
    assert.ok(O.art.biomes.includes(t.biome), `${name}: biome ${t.biome} exists with every pack loaded`);
    assert.ok(O.art.biomes.includes(t.alt) && !THEMES[name].packs.includes('dress'), `${name}: a fallback biome`);
    for (const p of t.packs) assert.ok(PACKS[p], `${name}: pack ${p}`);
    for (const p of t.props) assert.ok(Object.values(O.art.props).flat().includes(p), `${name}: prop ${p} exists`);
    assert.ok(t.props.length >= 4, `${name}: a prop set`);
    assert.ok(t.accent !== 'spark' && PALETTE[t.accent], `${name}: accent ${t.accent} (spark yellow is for rewards)`);
    assert.ok(t.tod >= 0 && t.tod <= 1);
  }
  for (const [a, n] of Object.entries(ALIAS)) assert.ok(THEMES[n], `alias ${a} -> ${n}`);
  assert.equal(O.theme.names.length, Object.keys(THEMES).length);
});

test('Oomba.game({theme}) sets the biome, light, title hue, style and the look the game can read', () => {
  const { O, kit, g, warns } = game({ theme: 'castle' });
  assert.deepEqual(warns, []);
  const L = O.theme.look;
  assert.equal(L.name, 'castle'); assert.equal(L.biome, 'castle'); assert.equal(L.accent, 'coral'); assert.equal(L.music, 'heroic'); assert.equal(L.bed, 'meadow');
  assert.equal(g.stage.biome, 'castle'); assert.equal(kit.game.spec.titleHue, 'coral');
  assert.ok(Math.abs(g.stage.timeOfDay - THEMES.castle.tod) < 1e-9, 'the theme light (late afternoon)');
  assert.ok(L.props.includes('tower') && L.props.includes('chest'), L.props.join(' '));
  assert.ok(L.packs.includes('dress') && L.packs.includes('art-biomes-2'));
  const cy = game({ theme: 'cyber' });
  assert.equal(cy.O.style(), 'bold', 'cyber city is the teen look'); assert.ok(cy.g.stage.timeOfDay >= 0.99);
  const sp = game({ theme: 'space' }); assert.equal(sp.O.theme.look.bed, 'calm');
  // an explicit biome still wins (the theme keeps its light, accent and props)
  assert.equal(game({ theme: 'castle', biome: 'snow' }).g.stage.biome, 'snow');
});

test('names are forgiving: case, spaces, aliases, typos; unknown names warn and fall back', () => {
  assert.equal(game({ theme: 'Ocean Reef' }).O.theme.look.name, 'reef');
  assert.equal(game({ theme: 'Candy Land' }).O.theme.look.name, 'candy');
  assert.equal(game({ theme: 'football' }).O.theme.look.name, 'stadium');
  assert.equal(game({ theme: 'cyber-city' }).O.theme.look.name, 'cyber');
  const t = game({ theme: 'castel' }); assert.equal(t.O.theme.look.name, 'castle'); assert.ok(t.warns.some(w => /unknown theme "castel"/.test(w)));
  const u = game({ theme: 'zzz' }); assert.equal(u.O.theme.look.name, 'meadow');
});

test('a theme without its pack warns with the pack to add and shows its fallback world; without dress the core says so', () => {
  const r = game({ theme: 'castle' }, ['dress']);
  assert.ok(r.warns.some(w => /theme 'castle' needs the art-biomes-2 pack/.test(w)), r.warns.join('\n'));
  assert.equal(r.g.stage.biome, 'meadow');
  const none = game({ theme: 'beach' }, []);
  assert.ok(none.warns.some(w => /Oomba\.game\(\{theme\}\): load the dress pack/.test(w)));
  assert.equal(none.O.theme.look, null);
});

test("kit 1.0 games keep working: theme 'light' / 'dark' is still the mode; mode: is the new spelling", () => {
  const d = game({ theme: 'dark' }); assert.equal(d.O.theme.mode, 'dark'); assert.equal(d.O.theme.look, null); assert.deepEqual(d.warns, []);
  const b = game({ theme: 'beach', mode: 'dark' }); assert.equal(b.O.theme.mode, 'dark'); assert.equal(b.O.theme.look.name, 'beach');
  assert.equal(b.g.stage.timeOfDay, 1, 'a dark site is night whatever the theme');
  const h = game({ theme: 'haunted', mode: 'light' }); assert.ok(Math.abs(h.g.stage.timeOfDay - THEMES.haunted.tod) < 1e-9);
  h.g.stage.toNight(false, 0); assert.ok(Math.abs(h.g.stage.timeOfDay - THEMES.haunted.tod) < 1e-9, 'dawn goes back to the theme light, not noon');
});

test('recolouring a theme keeps every contrast (luminance-locked), never uses spark yellow, and re-bakes a copy', () => {
  const { O, kit, g, warns } = game({ theme: { name: 'beach', accent: 'grape', palette: { hills: 'coral', ground: 'mint', sky: 'grape' } } });
  assert.deepEqual(warns, []);
  const L = O.theme.look, B = g.stage.biome; assert.ok(kit);
  assert.equal(L.accent, 'grape'); assert.notEqual(B, 'beach'); assert.ok(O.art.biomes.includes(B));
  assert.equal(kit.game.spec.titleHue, 'sky');
  // every hue on every theme biome: luminance within 2%, so contrast against the hero, Ink and pickups is unchanged
  const all = game({});
  const rc = all.kit.recolour, hero = PALETTE.mint[2], spark = PALETTE.spark[2], ink = '#141414';
  const { BIOMES } = BIOMES_MOD;
  for (const t of Object.values(THEMES)) for (const hue of ['mint', 'coral', 'sky', 'grape', 'peach', 'stone']) {
    const B0 = BIOMES[t.biome];
    for (const c of [...B0.bands.flatMap(b => [b[0], b[1]]), B0.ground[0], B0.ground[1]].filter(c => /^#[0-9a-f]{6}$/i.test(c))) {
      const n = rc(c, hue);
      assert.ok(Math.abs(luminance(n) - luminance(c)) <= 0.02 * Math.max(0.05, luminance(c)) + 0.004, `${t.biome} ${c} -> ${hue} ${n}`);
      for (const other of [hero, spark, ink]) { const a = contrast(c, other), b2 = contrast(n, other); assert.ok(Math.abs(a - b2) / a < 0.05, `${c} vs ${other}: ${a.toFixed(2)} -> ${b2.toFixed(2)}`); }
    }
  }
  const s = game({ theme: { name: 'candy', accent: 'spark' } });
  assert.equal(s.O.theme.look.accent, 'peach'); assert.ok(s.warns.some(w => /spark yellow is kept for rewards/.test(w)));
  const bad = game({ theme: { name: 'candy', palette: { hills: 'rainbow' } } });
  assert.ok(bad.warns.some(w => /'rainbow' is not a colour name/.test(w))); assert.equal(bad.g.stage.biome, 'candy');
});

test('theme critters and framing: every theme biome has a dressing recipe, and the stage reads "sprite:path" life', () => {
  const { kit } = game({});
  const R = BIOMES_MOD.RECIPES;
  for (const [name, t] of Object.entries(THEMES)) assert.ok(R[t.biome] && typeof R[t.biome].life === 'string', `${name}: a recipe for ${t.biome}`);
  assert.match(R.spooky.life, /bat:bird/); assert.match(R.space.life, /ufo:butterfly/); assert.match(R.stadium.life, /conf:leaf/);
  assert.ok(kit);
});
