// The 3D bridge (kit 1.1.0, pack bridge-3d) in Node with the real three.js the site serves (no WebGL: the scene graph,
// materials and shader sources): Oomba.three exists only with the pack; themes become 3D worlds; toon materials share
// one program and inkify converts a game's own; Ink hulls (instanced too) and their low-tier rule; rigs are baked to a
// few meshes and animate; sprites face the camera; Bold in 3D; reduced motion; the frame governor; the Builder side.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeWin } from '../support/kit-fake.js';
import { createKit } from '../../kit/src/index.js';
import { loadTemplate } from '../../server/builder/templates/index.js';
import { lintGame } from '../../server/services/stylelint.js';
import { THREE_D_RULES, KIT_RULES, KIT_3D_BRIDGE_RULES, usesKit3d } from '../../server/builder/prompt.js';
import { kitPackTag } from '../../server/services/kit.js';

const THREE = await import('../../public/vendor/three/0.185.1/three.module.min.js');
const PACKS = ['dress', 'art-animals', 'art-biomes', 'art-biomes-2', 'art-props', 'style-bold', 'bridge-3d'];
const mods = {}; for (const n of PACKS) mods[n] = await import(`../../kit/packs/${n}.js`);

/** A kit in a fake window with the packs loaded (bridge-3d last, like a page's tags) and a mock renderer. */
function kit({ search = '', packs = PACKS, dark = false, reduced = false } = {}) {
  const win = fakeWin({ search, brb: dark ? { theme: 'dark' } : null });
  if (reduced) win.matchMedia = q => ({ matches: /reduced-motion/.test(q), addEventListener() {} });
  const O = createKit(win); win.Oomba = O; O.style('playful');   // the art style is page state (one module per page; shared here)
  for (const n of packs) O.__pk({ name: n, version: O.version }, mods[n].define);
  if (reduced) O.settings.set({ motion: 'reduce' });
  return { O, win };
}
const renderer = (w = 960, h = 540) => {
  const r = { pr: 1, size: [w, h], shadowMap: { enabled: false }, capabilities: { maxTextureSize: 16384 }, domElement: { clientWidth: w, clientHeight: h },
    getSize: v => v.set(w, h), getPixelRatio() { return this.pr; }, setPixelRatio(p) { this.pr = p; }, setSize() {}, setAnimationLoop(fn) { this.loop = fn; }, render() { this.frames = (this.frames || 0) + 1; } };
  return r;
};
const camera = () => { const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 300); c.position.set(0, 4, 10); c.lookAt(0, 1, 0); c.updateMatrixWorld(); return c; };
const meshes = root => { const out = []; root.traverse(o => { if (o.isMesh) out.push(o); }); return out; };

test('Oomba.three comes with the bridge-3d pack only, takes THREE from the game, and is listed by Oomba.pack', () => {
  assert.equal(kit({ packs: ['dress'] }).O.three, undefined, '2D games never pay for it');
  const { O, win } = kit();
  assert.equal(typeof O.three, 'function'); assert.ok(O.pack('bridge-3d'));
  assert.equal(O.three(null, {}), null); assert.ok(win.__warns.some(w => /pass the three\.js module first/.test(w)));
});

test('a theme becomes a 3D world: its sky, fog, light, land, hills and props; a dark site is night', () => {
  const { O } = kit(), scene = new THREE.Scene();
  const B = O.three(THREE, { renderer: renderer(), scene, camera: camera(), theme: 'castle' });
  assert.equal(B.look.name, 'castle'); assert.equal(B.look.biome, 'castle'); assert.equal(B.tod, 0.22); assert.equal(B.style, 'playful');
  assert.deepEqual(B.look.props, ['tower', 'banner', 'shield', 'torch', 'chest', 'flag'], 'the theme props this page has');
  const W = B.world({ size: 30, seed: 3 });
  assert.ok(scene.background && scene.background.isTexture, 'a sky'); assert.ok(scene.fog && scene.fog.color.equals(new THREE.Color(B.look.fog)), 'fog in the horizon colour');
  assert.ok(scene.children.includes(B.hemi) && scene.children.includes(B.sun));
  assert.ok(W.props.length >= 6 && W.props.every(p => p.userData.okCard), 'props are billboards of the 2D art');
  assert.ok(W.group.getObjectByName('ground'), 'land'); assert.equal(meshes(W.group).filter(m => m.isInstancedMesh && !m.userData.okInk).length, 4, 'three rings of hills and the clouds');
  assert.equal(typeof W.heightAt(3, 4), 'number'); assert.ok(W.clouds && !W.stars, 'clouds by day');
  for (const k of ['grass', 'grassDark', 'rock', 'sand']) assert.match(B.look.land[k], /^#[0-9A-F]{6}$/i, k);
  const night = kit({ dark: true }).O.three(THREE, { scene: new THREE.Scene(), camera: camera(), theme: 'castle' });
  assert.equal(night.tod, 1, 'a dark site is night (as in 2D)');
  const ws = night.world({ size: 20 }); assert.ok(ws.stars && !ws.clouds, 'stars at night');
  // every theme builds, each with its own sky
  const skies = new Set();
  for (const name of kit().O.theme.names) { const b = kit().O.three(THREE, { scene: new THREE.Scene(), camera: camera(), theme: name }); b.world({ size: 20 }); skies.add(b.look.sky.join()); assert.equal(b.look.name, name); }
  assert.ok(skies.size >= 10, `${skies.size} different skies`);
});

test('toon materials: one shader program, cached per colour, rim; inkify turns a game\'s own materials into them', () => {
  const { O } = kit(), B = O.three(THREE, { scene: new THREE.Scene(), camera: camera() });
  const a = B.toon('mint'), b = B.toon('mint'), c = B.toon('player'), d = B.toon('#FF6B5B', { glow: true });
  assert.equal(a, b); assert.notEqual(a, d); assert.ok(a.isMeshToonMaterial && a.gradientMap);
  assert.equal(a.customProgramCacheKey(), c.customProgramCacheKey(), 'one program for all of them');
  assert.ok(c.color.equals(new THREE.Color(O.color('player'))), 'roles are the kit\'s colours');
  assert.ok(d.emissiveIntensity > 0);
  const sh = { uniforms: {}, fragmentShader: 'void main() {\n#include <opaque_fragment>\n}', vertexShader: '' }; a.onBeforeCompile(sh);
  assert.match(sh.fragmentShader, /okRim \* okRimK[\s\S]*#include <opaque_fragment>/); assert.ok(sh.uniforms.okRim && sh.uniforms.okRimK);
  assert.equal(B.toon(null, { rim: 0 }).userData.rimK.value, 0, 'the ground gets no rim');
  // a game's own scene
  const g = new THREE.Group(), geo = new THREE.BoxGeometry(1, 1, 1);
  g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x3fae49, flatShading: true })), new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0xffc21f })),
    new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x8b5a2b, transparent: true, opacity: 0.5 })), new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0 })));
  B.inkify(g, { outline: true });
  const [m1, m2, m3, m4] = g.children;
  assert.ok(m1.material.isMeshToonMaterial && !m1.geometry.index, 'faceted: face normals in the geometry (toon has no flatShading)');
  assert.ok(m2.material.emissiveIntensity > 0, 'glow kept'); assert.ok(m3.material.transparent && m3.material.opacity === 0.5);
  assert.ok(m4.material.isMeshBasicMaterial, 'unlit stays unlit');
  assert.ok(m1.children.some(h => h.userData.okInk), 'and Ink');
});

test('Ink: an inverted hull in screen space on the same geometry (instanced too); slow devices keep only important Ink', () => {
  const { O } = kit(), B = O.three(THREE, { scene: new THREE.Scene(), camera: camera() });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), B.toon('sky'));
  B.outline(m);
  const h = m.children.find(x => x.userData.okInk);
  assert.equal(h.geometry, m.geometry, 'shares the geometry'); assert.equal(h.material.side, THREE.BackSide);
  assert.ok(h.material.color.equals(B.ink)); assert.ok(m.geometry.attributes.okN, 'smoothed normals for the push');
  const sh = { uniforms: {}, vertexShader: 'void main() {\n#include <project_vertex>\n}' }; h.material.onBeforeCompile(sh);
  assert.match(sh.vertexShader, /attribute vec3 okN;[\s\S]*#include <project_vertex>[\s\S]*instanceMatrix[\s\S]*gl_Position\.xy \+=/);
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), B.toon('mint'), 40); im.count = 30; B.outline(im);
  const ih = im.children[0]; assert.ok(ih.isInstancedMesh && ih.instanceMatrix === im.instanceMatrix && ih.count === 30, 'one draw call for a whole forest');
  const low = kit({ search: '?okTier=low' }).O.three(THREE, { scene: new THREE.Scene(), camera: camera() });
  assert.equal(low.tier, 'low'); assert.equal(low.dprCap, 1);
  const a = new THREE.Mesh(new THREE.BoxGeometry(), low.toon('mint')), b = new THREE.Mesh(new THREE.BoxGeometry(), low.toon('mint'));
  low.outline(a); low.outline(b, { important: true });
  assert.equal(a.children.length, 0); assert.equal(b.children.length, 1);
  const neon = O.three(THREE, { scene: new THREE.Scene(), camera: camera(), style: 'bold' }), n = new THREE.Mesh(new THREE.BoxGeometry(), neon.toon('mint'));
  neon.outline(n, { color: neon.accent }); assert.ok(n.children[0].material.color.equals(neon.accent), 'a neon edge in Bold');
});

test('characters: a rig is a few baked meshes with Ink and moves; a sprite is the 2D art facing the camera', () => {
  const { O } = kit(), scene = new THREE.Scene(), cam = camera(), B = O.three(THREE, { renderer: renderer(), scene, camera: cam });
  for (const sp of ['oomba', 'kid', 'fox', 'bunny', 'frog', 'bee', 'cat', 'dog', 'owl', 'penguin']) {
    const r = B.rig({ species: sp }); scene.add(r);
    const solid = meshes(r).filter(x => !x.userData.okInk);
    assert.ok(solid.length <= 11, `${sp}: ${solid.length} meshes after baking`);
    assert.ok(meshes(r).filter(x => x.userData.okInk).length >= 6, `${sp}: Ink on the body, limbs and eyes`);
    const box = new THREE.Box3().setFromObject(r); assert.ok(box.max.y > 1.3 && box.max.y < 2.2, `${sp}: 1.6 to the top of the head, ears above (${box.max.y.toFixed(2)})`);
  }
  const kidA = B.rig({ species: 'kid', skin: 6, outfit: { top: 'tee', color: 'coral' } }), kidB = B.rig({ species: 'kid', skin: 0, outfit: { top: 'tee', color: 'mint' } });
  const cols = r => { const s = new Set(); for (const m of meshes(r)) { const c = m.geometry.attributes.color; if (c) for (let i = 0; i < c.count; i += 7) s.add(c.getX(i).toFixed(2) + c.getY(i).toFixed(2)); } return s; };
  assert.notDeepEqual([...cols(kidA)].sort(), [...cols(kidB)].sort(), 'the spec\'s skin and outfit colours');
  const hero = B.rig({ species: 'fox' }); scene.add(hero); hero.speed = 1;
  for (let i = 0; i < 12; i++) B.update(1 / 60);
  assert.equal(hero.clip, 'run'); assert.ok(Math.abs(hero.legsP[0].rotation.x) > 0.05, 'legs swing');
  hero.air = true; B.update(1 / 60); assert.equal(hero.clip, 'jump');
  hero.play('cheer'); B.update(1 / 60); assert.equal(hero.clip, 'cheer');
  const s = B.sprite({ species: 'bunny' }, { size: 1.6 }); s.position.set(5, 0, 0); scene.add(s); scene.updateMatrixWorld(true);
  B.update(1 / 60);
  const card = s.userData.okCard.mesh, want = Math.atan2(cam.position.x - 5, cam.position.z - 0);
  assert.ok(Math.abs(card.rotation.y - want) < 1e-6, 'turned toward the camera');
  assert.ok(card.material.map && card.material.alphaTest > 0, 'the 2D art, cut out');
  const before = card.material; s.mood('cheer'); assert.notEqual(card.material, before, 'a face per mood');
  const sp = B.spark(); assert.ok(sp.children[0].material.emissiveIntensity > 0 && meshes(sp).some(m => m.userData.okInk), 'the reward spark glows, with Ink');
  const p = B.prop('tower', { size: 4 }); assert.ok(p.userData.okCard); const pb = new THREE.Box3().setFromObject(p); assert.ok(Math.abs(pb.min.y) < 1e-6 && Math.abs(pb.max.y - 4) < 0.01, 'stands on its origin');
});

test('Bold in 3D: dusk or later, hard cel steps, a neon rim, thinner Ink, 0.75x motion, the Bold UI; reduced motion stops decoration', () => {
  const { O } = kit(), B = O.three(THREE, { scene: new THREE.Scene(), camera: camera(), renderer: renderer(), theme: 'meadow', style: 'bold' });
  assert.equal(B.style, 'bold'); assert.ok(B.tod >= 0.5); assert.equal(B.motion, 0.75); assert.equal(O.style(), 'bold');
  assert.equal(B.toon('mint').gradientMap.image.width, 2, 'two hard steps');
  const P = kit().O.three(THREE, { scene: new THREE.Scene(), camera: camera(), theme: 'meadow' });
  assert.equal(P.toon('mint').gradientMap.image.width, 3); assert.equal(P.motion, 1);
  const sh = { uniforms: {}, fragmentShader: '#include <opaque_fragment>' }; B.toon('mint').onBeforeCompile(sh);
  assert.ok(sh.uniforms.okRimK.value > 0.4 && sh.uniforms.okRim.value.equals(new THREE.Color('#2ED8FF')), 'neon cyan rim');
  assert.ok(B.accent.equals(B.neon('cyan')) || B.accent.equals(B.neon('mint')), 'neon accent');
  assert.equal(kit().O.three(THREE, { scene: new THREE.Scene(), camera: camera(), theme: 'cyber' }).style, 'bold', 'the cyber theme is Bold');
  const W = B.world({ size: 20 }); assert.ok(W.group.children.some(c => c.isInstancedMesh && c.children.some(h => h.userData.okInk && h.material.color.equals(B.accent))), 'a neon ridge line');
  const cy = kit().O.three(THREE, { scene: new THREE.Scene(), camera: camera(), theme: 'cyber' }); const g = cy.world({ size: 20 }).group.getObjectByName('ground');
  assert.ok(g.material.emissiveMap, 'a neon grid on the tech worlds');
  // reduced motion: no prop sway, no bob
  const R = kit({ reduced: true }).O.three(THREE, { scene: new THREE.Scene(), camera: camera(), renderer: renderer(), theme: 'meadow' });
  assert.equal(R.motion, 0); const s = R.sprite({ species: 'fox' }); R.scene.add(s); s.speed = 0.5;
  for (let i = 0; i < 20; i++) R.update(1 / 60);
  assert.equal(s.userData.okCard.mesh.position.y, 0); assert.equal(s.userData.okCard.mesh.rotation.z, 0);
});

test('performance: tier caps, the governor steps quality down on slow frames and back up, governor:false leaves it', () => {
  const r = renderer(), { O } = kit({ search: '?okTier=high' }), B = O.three(THREE, { scene: new THREE.Scene(), camera: camera(), renderer: r });
  assert.equal(B.tier, 'high'); assert.equal(B.dprCap, 1.5); assert.equal(B.quality, 2);
  B.world({ size: 20 });
  for (let i = 0; i < 50; i++) B.update(0.06);   // about 16 fps for 3 s
  assert.ok(B.quality < 2, `stepped down to ${B.quality}`); assert.equal(r.shadowMap.enabled, B.quality > 0);
  const q = B.quality; for (let i = 0; i < 700; i++) B.update(0.012);
  assert.ok(B.quality > q, 'and back up when frames are fast');
  const own = kit({ search: '?okTier=high' }).O.three(THREE, { scene: new THREE.Scene(), camera: camera(), renderer: renderer(), governor: false });
  for (let i = 0; i < 80; i++) own.update(0.06); assert.equal(own.quality, 2);
  const low = renderer(); const L = kit({ search: '?okTier=low' }).O.three(THREE, { scene: new THREE.Scene(), camera: camera(), renderer: low });
  L.run(() => {}); low.loop(0); low.loop(16); low.loop(32); low.loop(50); low.loop(68);
  assert.ok(low.frames <= 3, `30 fps on a low tier (${low.frames} renders in 4 frames)`);
});

test('Star Island is on the bridge; the bridge reference goes only with older bridge games; the lint asks for the pack', () => {
  const html = loadTemplate('island');
  assert.ok(html.includes(kitPackTag('bridge-3d')) && html.includes(kitPackTag('dress')));
  assert.match(html, /Oomba\.three\(THREE, \{ renderer, scene, camera, theme: CONFIG\.theme/);
  for (const re of [/B\.inkify\(scene\)/, /B\.bake\(hero\.body\)/, /B\.outline\(hero\.group, \{ important: true \}\)/, /B\.update\(dt\)/, /governor: false/, /^ {2}theme: 'meadow',/m, /^ {2}style: '',/m]) assert.match(html, re);
  assert.deepEqual(lintGame(html), [], 'lint-clean');
  const noPack = html.replace(kitPackTag('bridge-3d'), '');
  assert.ok(lintGame(noPack).some(x => x.code === 'pack_missing'));
  const plain = html.replace(/Oomba\.three\(/g, 'makeWorld(');
  assert.ok(!lintGame(plain).some(x => x.code === 'three_bridge'), 'a 3D world of its own is never pointed at the bridge');
  for (const s of ['Oomba.three(THREE', 'B.rig(', 'B.sprite(', 'B.inkify(', 'B.bake(', 'B.motion', kitPackTag('bridge-3d')]) assert.ok(KIT_3D_BRIDGE_RULES.includes(s), s);
  assert.ok(!THREE_D_RULES.includes('Oomba.three(THREE') && !THREE_D_RULES.includes(kitPackTag('bridge-3d')), 'new 3D games are not taught the bridge');
  assert.ok(usesKit3d(html) && !usesKit3d(loadTemplate('world3d')));
  assert.ok(!KIT_RULES.includes('B.rig('), '2D builds do not carry the 3D bridge\'s rules');
});

test('walking a 3D map (kit 1.1.2): on the ground, up gentle slopes and steps, never up cliffs or walls, jumps land, bounds hold', () => {
  const { O } = kit({ search: '?okDebug=1' }), scene = new THREE.Scene(), cam = camera();
  const B = O.three(THREE, { renderer: renderer(), scene, camera: cam, theme: 'meadow' });
  // a ramp east (rise 0.5 per metre), a 3 m cliff north, flat elsewhere
  const W = B.world({ size: 30, props: [], height: (x, z) => (z < -10 ? 3 : 0) + (x > 5 ? (x - 5) * 0.5 : 0) });
  const hero = B.rig({ species: 'fox' }); scene.add(hero); hero.position.set(0, 4, 0);
  const P = B.walker(hero, { input: false });
  const walk = (x, z, s) => { P.move = { x, z }; for (let i = 0; i < s * 60; i++) B.update(1 / 60); P.move = null; for (let i = 0; i < 30; i++) B.update(1 / 60); };
  const onGround = () => Math.abs(hero.position.y - W.groundAt(hero.position.x, hero.position.z, hero.position.y + 0.5)) < 0.03;
  for (let i = 0; i < 60; i++) B.update(1 / 60); assert.ok(P.grounded && hero.position.y === 0, `dropped onto the ground (${hero.position.y})`);
  // forward into the cliff: stops at its foot, stays on the ground
  walk(0, -1, 4);
  assert.ok(hero.position.z > -10.1 && hero.position.z < -9, `stopped at the cliff (${hero.position.z.toFixed(2)})`);
  assert.equal(+hero.position.y.toFixed(2), 0, 'never climbs the cliff'); assert.ok(P.grounded && onGround());
  // up the gentle ramp: follows the slope exactly
  P.teleport(0, 0); walk(1, 0, 2);
  assert.ok(hero.position.x > 8 && onGround(), `walked up the ramp on the ground (${hero.position.x.toFixed(2)}, ${hero.position.y.toFixed(2)})`);
  // a crate 1 m high: a wall (slides along it), jumping lands on it; a 0.4 m step is walked up
  const crate = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2)); crate.position.set(0, 0.5, 4); scene.add(crate); B.solid(crate);
  const step = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 2)); step.position.set(-4, 0.2, 4); scene.add(step); B.solid(step);
  P.teleport(0, 0); walk(0, 1, 2);
  assert.ok(hero.position.z < 2.7 && hero.position.y === 0, `the crate is a wall (${hero.position.z.toFixed(2)}, ${hero.position.y})`);
  walk(1, 1, 0.6); assert.ok(hero.position.x > 1 && hero.position.y === 0, 'slides along it, still on the ground');
  P.teleport(0, 2.2); P.move = { x: 0, z: 1 }; P.jump(); for (let i = 0; i < 30; i++) B.update(1 / 60); P.move = null; for (let i = 0; i < 60; i++) B.update(1 / 60);
  assert.ok(P.grounded && Math.abs(hero.position.y - 1) < 0.01, `jumped onto the crate (${hero.position.y.toFixed(2)})`);
  P.teleport(-4, 1); walk(0, 1, 0.8); assert.ok(Math.abs(hero.position.y - 0.4) < 0.01, `walked up the step (${hero.position.y.toFixed(2)})`);
  walk(0, 1, 1.5); assert.equal(+hero.position.y.toFixed(2), 0, 'and down off it');
  // a jump on flat ground comes back to the ground
  P.teleport(-6, -4); P.jump(); let top = 0; for (let i = 0; i < 90; i++) { B.update(1 / 60); top = Math.max(top, hero.position.y); }
  assert.ok(top > 1 && P.grounded && hero.position.y === 0, `up ${top.toFixed(2)} m and down again`);
  // the edge of the map holds; falling out of the world brings it back to the start
  walk(-1, 0, 8); assert.ok(Math.hypot(hero.position.x, hero.position.z) <= 30 * 0.9 + 0.01, 'inside the bounds');
  P.teleport(0, 0, -40); B.update(1 / 60); assert.ok(hero.position.y >= 0 && P.grounded, 'back on the map after a fall');
  // moving with the camera's view: forward is where it looks on the ground, its pitch never lifts the walker
  cam.position.set(-3, 20, -1.99); cam.lookAt(-3, 0, -2); cam.updateMatrixWorld();
  P.teleport(-3, -2); const a = hero.position.clone(); P.opt.input = true;
  const I = O.debug.kit.input; I.srcDown('KeyW'); for (let i = 0; i < 30; i++) { I.update(); B.update(1 / 60); } I.srcUp('KeyW'); I.update();
  assert.ok(hero.position.z < a.z - 0.5 && Math.abs(hero.position.x - a.x) < 0.05 && hero.position.y === 0, `up walks where the camera looks, on the ground (${hero.position.x.toFixed(2)}, ${hero.position.y}, ${hero.position.z.toFixed(2)})`);
  P.opt.input = false;
  // the follow camera stays above the ground and out of the crate
  const F = B.follow(P); F.yaw = Math.PI; for (let i = 0; i < 60; i++) B.update(1 / 60);
  assert.ok(cam.position.y > W.heightAt(cam.position.x, cam.position.z) + 0.4, 'the camera is never under the ground');
});

test('in a 3D world up and W walk forward and never jump (jump: Space, Z, the pad\'s A, the button)', () => {
  const { O } = kit({ search: '?okDebug=1' });
  O.three(THREE, { scene: new THREE.Scene(), camera: camera() });
  const I = O.debug.kit.input;
  const on = src => { I.srcDown(src); I.update(); const p = I.pressed('jump'); I.srcUp(src); I.update(); return p; };
  assert.equal(on('KeyW'), false, 'W walks'); assert.equal(on('ArrowUp'), false, 'up walks'); assert.equal(on('Space'), true, 'Space jumps');
});

test('cartoon (kit 1.1.5): opt-in only; one hard cel band from a screen-fixed key light, a Cream rim, no shadow maps, the Ink palette', () => {
  const mk = (o, search = '') => kit({ search }).O.three(THREE, { scene: new THREE.Scene(), camera: camera(), renderer: renderer(), theme: 'castle', ...o });
  // the default and Bold are untouched; the page alone cannot switch a game that did not offer the style
  const P = mk({}), Q = mk({}, '?okStyle=cartoon'), Bd = mk({ style: 'bold' }, '?okStyle=cartoon');
  assert.equal(P.style, 'playful'); assert.equal(P.cartoon, false); assert.equal(Q.style, 'playful', 'a game that lists no styles ignores ?okStyle'); assert.equal(Bd.style, 'bold');
  assert.equal(P.toon('mint').customProgramCacheKey(), 'okToon');
  // a game asks for it, or offers it (styles) and the page picks it
  const C = mk({ style: 'cartoon' }), D = mk({ styles: ['cartoon'] }, '?okStyle=cartoon'), E = mk({ styles: ['cartoon'] }, '?okStyle=pixel');
  assert.equal(C.style, 'cartoon'); assert.equal(C.cartoon, true); assert.equal(D.style, 'cartoon'); assert.equal(E.style, 'playful', 'only a style the game offers');
  assert.equal(mk({ style: 'cartoon', theme: 'cyber' }).style, 'cartoon', 'a Bold theme does not override it');
  const m = C.toon('mint'); assert.ok(m.isMeshToonMaterial); assert.equal(m.customProgramCacheKey(), 'okCel'); assert.equal(C.toon('coral').customProgramCacheKey(), 'okCel', 'one program');
  const sh = { uniforms: {}, fragmentShader: 'void main() {\n#include <opaque_fragment>\n}', vertexShader: '' }; m.onBeforeCompile(sh);
  assert.match(sh.fragmentShader, /okLit = smoothstep\( okEdge - okW, okEdge \+ okW, okNd \)[\s\S]*outgoingLight = diffuseColor\.rgb \* mix\([\s\S]*#include <opaque_fragment>/, 'the colour is the fill, one band of shade');
  for (const u of ['okKey', 'okShade', 'okEdge', 'okTint', 'okRim', 'okRimK', 'okSoft', 'okDepth']) assert.ok(sh.uniforms[u], u);
  assert.ok(sh.uniforms.okRim.value.equals(new THREE.Color('#FFFDF2')) && sh.uniforms.okRimK.value > 0 && sh.uniforms.okRimK.value < 0.2, 'a faint Cream rim');
  assert.ok(sh.uniforms.okKey.value.x < 0 && sh.uniforms.okKey.value.y > 0, 'the key light is at the top-left of the screen (view space)');
  assert.equal(sh.uniforms.okTint.value, C.light.tint, 'the game tints the mood through B.light');
  const land = C.toon(null, { vertexColors: true, soft: 0.1, depth: 0.6 }), sh2 = { uniforms: {}, fragmentShader: '#include <opaque_fragment>' }; land.onBeforeCompile(sh2);
  assert.equal(sh2.uniforms.okSoft.value, 0.1); assert.equal(sh2.uniforms.okDepth.value, 0.6); assert.notEqual(land, C.toon(null, { vertexColors: true }));
  // no shadow maps (contact blobs instead); Playful keeps its shadows
  const r = renderer(), S = kit().O.three(THREE, { scene: new THREE.Scene(), camera: camera(), renderer: r, style: 'cartoon' }); S.sky({ size: 20 });
  assert.equal(r.shadowMap.enabled, false); assert.equal(S.sun.castShadow, false); S.setQuality(2); assert.equal(r.shadowMap.enabled, false);
  const r2 = renderer(), Pl = kit().O.three(THREE, { scene: new THREE.Scene(), camera: camera(), renderer: r2 }); Pl.sky({ size: 20 }); assert.equal(r2.shadowMap.enabled, true);
  // the Ink palette: any colour -> the nearest kit colour; k < 1 moves part of the way
  const { O } = kit(), all = new Set([O.color('ink'), O.color('cream'), ...['mint', 'spark', 'coral', 'sky', 'grape', 'peach', 'cocoa', 'stone', 'snow'].flatMap(h => [0, 1, 2, 3].map(i => O.color(h, i)))].map(c => c.toUpperCase()));
  for (const c of ['#7ccf4f', '#d9534a', '#4f7fd9', '#f7ecd6', '#9a6a3f', '#ffc83d', '#2b2b2b', '#ffffff']) assert.ok(all.has(C.palette(c).toUpperCase()), `${c} -> ${C.palette(c)}`);
  assert.ok(['coral'].some(h => [0, 1, 2, 3].some(i => O.color(h, i).toUpperCase() === C.palette('#d9534a').toUpperCase())), 'a red roof is coral');
  assert.equal(C.palette('#141414').toUpperCase(), '#141414');
  assert.ok(!all.has(C.palette('#7ccf4f', 0.5).toUpperCase()), 'half way');
});
