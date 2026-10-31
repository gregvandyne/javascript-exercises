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
import { THREE_D_RULES, KIT_RULES } from '../../server/builder/prompt.js';
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

test('Builder: Star Island is on the bridge; the 3D rules teach it; the lint asks for the pack', () => {
  const html = loadTemplate('island');
  assert.ok(html.includes(kitPackTag('bridge-3d')) && html.includes(kitPackTag('dress')));
  assert.match(html, /Oomba\.three\(THREE, \{ renderer, scene, camera, theme: CONFIG\.theme/);
  for (const re of [/B\.inkify\(scene\)/, /B\.bake\(hero\.body\)/, /B\.outline\(hero\.group, \{ important: true \}\)/, /B\.update\(dt\)/, /governor: false/, /^ {2}theme: 'meadow',/m, /^ {2}style: '',/m]) assert.match(html, re);
  assert.deepEqual(lintGame(html), [], 'lint-clean');
  const noPack = html.replace(kitPackTag('bridge-3d'), '');
  assert.ok(lintGame(noPack).some(x => x.code === 'pack_missing'));
  const plain = html.replace(/Oomba\.three\(/g, 'makeWorld(');
  assert.ok(lintGame(plain).some(x => x.code === 'three_bridge'), 'a 3D kit game without the bridge is told about it');
  for (const s of ['Oomba.three(THREE', 'B.rig(', 'B.sprite(', 'B.inkify(', 'B.bake(', 'B.motion', kitPackTag('bridge-3d')]) assert.ok(THREE_D_RULES.includes(s), s);
  assert.ok(!KIT_RULES.includes('B.rig('), '2D builds do not carry the 3D bridge\'s rules');
});
