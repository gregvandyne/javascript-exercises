// The in-page half of art2d.mjs: draws a theme's 3D models as 2D art with the Oomba look (ink outline, the theme's own
// daytime light, the same tone mapping as Oomba3D) and packs the pictures. Everything is drawn from the side with an
// orthographic camera, twice the size and scaled down (smooth ink lines), on a see-through background.
// Runs in headless Chromium with software WebGL; nothing here is random (same input, same bytes).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const PX_PER_M = 70;            // a sprite's pixels per metre at full size: one game cell (1.37 m) is 96 px
export const CELL_PX = 96, CELL_M = CELL_PX / PX_PER_M;
const SS = 2;                          // supersampling
const INK = '#141414';
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();
const load = url => { if (!cache.has(url)) cache.set(url, loader.loadAsync(url)); return cache.get(url); };

const canvas2d = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const hex = c => '#' + new THREE.Color(c).getHexString();
const mix = (a, b, k) => hex(new THREE.Color(a).lerp(new THREE.Color(b), k));

/** One renderer and scene for a look ({ hemisphere, sun, exposure }); bright: a multiplier on the light (animals). */
export function makeStudio(look, { bright = 1, exposure = 1 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
  renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = (look.exposure || 1) * exposure;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(look.hemisphere.sky, look.hemisphere.ground, look.hemisphere.intensity * bright));
  const sun = new THREE.DirectionalLight(look.sun.color, look.sun.intensity * bright); sun.position.set(-6, 12, 9); scene.add(sun);
  // The Oomba3D ink outline: a slightly bigger, back-facing ink copy of each mesh (none for cut-out leaf cards).
  const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  let inkW = 0.03;
  inkMat.onBeforeCompile = sh => { sh.uniforms.inkW = { get value() { return inkW; } }; sh.vertexShader = 'uniform float inkW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * inkW;'); };
  const ink = o => {
    const meshes = []; o.traverse(c => { if (c.isMesh && !c.userData.ink) meshes.push(c); });
    for (const m of meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const t of mats) if (t.userData && t.userData.flat && !t.flatShading) { t.flatShading = true; t.needsUpdate = true; }
      if (mats.some(t => t.transparent || t.alphaTest > 0)) continue;
      const hull = m.isSkinnedMesh ? m.clone() : new THREE.Mesh(m.geometry, inkMat);
      hull.material = inkMat; hull.userData.ink = true;
      if (m.isSkinnedMesh) { hull.position.copy(m.position); hull.quaternion.copy(m.quaternion); hull.scale.copy(m.scale); m.parent.add(hull); } else m.add(hull);
    }
    return o;
  };
  const boxOf = o => { o.updateMatrixWorld(true); const b = new THREE.Box3(); o.traverse(c => { if (c.isMesh && !c.userData.ink) { if (c.isSkinnedMesh) c.computeBoundingBox(); b.expandByObject(c, true); } }); return b; };
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);

  /**
   * Draw `root` (already in the scene, posed) -> { canvas, ox, oy }: the picture at `s` px per metre, and where the
   * world origin lands in it. frame: a fixed frame [x0, y0, x1, y1] in screen metres (sprite sheets: every pose in the
   * same frame); otherwise the model's own box. pitch: how far the camera looks down (radians).
   */
  const shoot = (root, { s = PX_PER_M, pitch = 0.14, frame = null, inkWidth = 0.03 } = {}) => {
    inkW = inkWidth;
    const right = new THREE.Vector3(1, 0, 0), up = new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch)), dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    let f = frame;
    if (!f) {
      const b = boxOf(root); f = [Infinity, Infinity, -Infinity, -Infinity];
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        const p = new THREE.Vector3(x, y, z), u = p.dot(right), v = p.dot(up);
        f = [Math.min(f[0], u), Math.min(f[1], v), Math.max(f[2], u), Math.max(f[3], v)];
      }
      const pad = inkWidth * 2 + 2 / s; f = [f[0] - pad, f[1] - pad, f[2] + pad, f[3] + pad];
    }
    const w = Math.ceil((f[2] - f[0]) * s), h = Math.ceil((f[3] - f[1]) * s);
    renderer.setSize(w * SS, h * SS, false);
    camera.left = f[0]; camera.right = f[0] + w / s; camera.bottom = f[1]; camera.top = f[1] + h / s; camera.updateProjectionMatrix();
    camera.position.copy(dir).multiplyScalar(400); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    const c = canvas2d(w, h), g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(renderer.domElement, 0, 0, w * SS, h * SS, 0, 0, w, h);
    return { canvas: c, ox: -f[0] * s, oy: (f[1] + h / s) * s, frame: f };
  };
  const frameOf = (root, pitch, inkWidth = 0.03, s = PX_PER_M) => {
    const up = new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch)), b = boxOf(root); let f = [Infinity, Infinity, -Infinity, -Infinity];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { const p = new THREE.Vector3(x, y, z), v = p.dot(up); f = [Math.min(f[0], x), Math.min(f[1], v), Math.max(f[2], x), Math.max(f[3], v)]; }
    const pad = inkWidth * 2 + 2 / s; return [f[0] - pad, f[1] - pad, f[2] + pad, f[3] + pad];
  };
  return { THREE, scene, ink, boxOf, shoot, frameOf, renderer };
}

/** The tight box of what is drawn in a canvas -> [x0, y0, x1, y1] (exclusive), or null when it is empty. */
export function alphaBox(c, min = 8) {
  const { width: w, height: h } = c, d = c.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > min) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}
const crop = (c, [x0, y0, x1, y1]) => { const o = canvas2d(x1 - x0, y1 - y0); o.getContext('2d').drawImage(c, -x0, -y0); return o; };
/** Lighten a picture toward a colour (far scenery fades into the sky's haze); keeps its shape. */
function haze(c, color, k) {
  if (!(k > 0)) return c;
  const g = c.getContext('2d'); g.save(); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = k; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height); g.restore(); return c;
}

/** A static piece of a theme -> { canvas (trimmed), ax, ay (the ground point under its middle, in px), m: [w, h] metres }. */
export async function piece(studio, url, { scale = 1, fit = 0, fitW = 0, yaw = 0.35, pitch = 0.14, s = PX_PER_M, sink = 0, inkWidth = 0.03, tilt = 0, glow = 0 } = {}) {
  const g = await load(url), root = studio.ink(SkeletonUtils.clone(g.scene));
  if (glow) root.traverse(c => { if (c.isMesh && !c.userData.ink) { c.material = c.material.clone(); c.material.emissive = new studio.THREE.Color('#ffffff'); c.material.emissiveIntensity = glow; } });   // a cloud is lit from inside
  const holder = new studio.THREE.Group(), stand = new studio.THREE.Group(); stand.add(root); stand.rotation.x = tilt; holder.add(stand);   // tilt: a coin lying flat stands on its edge
  holder.rotation.y = yaw; studio.scene.add(holder);
  // fit: the piece's height in metres (fitW: its width instead), whatever size its kit made it
  if (fit || fitW) { const b0 = studio.boxOf(holder); scale = fitW ? fitW / Math.max(0.001, b0.max.x - b0.min.x) : fit / Math.max(0.001, b0.max.y - b0.min.y); }
  holder.scale.setScalar(scale);
  if (g.animations.length) { const mixer = new studio.THREE.AnimationMixer(root); const clip = g.animations.find(a => /idle|spin|turn/i.test(a.name)) || g.animations[0]; mixer.clipAction(clip).play(); mixer.setTime(0); }
  // stand it on the ground: its lowest point at y = -sink
  const b = studio.boxOf(holder); holder.position.y -= b.min.y + sink; holder.position.x -= (b.min.x + b.max.x) / 2;
  const shot = studio.shoot(holder, { s, pitch, inkWidth: inkWidth / scale });
  studio.scene.remove(holder);
  const box = alphaBox(shot.canvas); if (!box) throw new Error('nothing drawn for ' + url);
  const c = crop(shot.canvas, box);
  return { canvas: c, ax: shot.ox - box[0], ay: shot.oy - box[1], m: [c.width / s, c.height / s] };
}

/**
 * An animated character -> { frames: [canvas], fw, fh, ax, ay, names }. anims: [[name, clipName, [t0, t1, ...]]] with
 * times as fractions of the clip. Every frame is drawn in one fixed camera frame, so the feet stay put.
 */
export async function character(studio, url, clipsUrl, anims, { height = 2.4, yaw = 1.2, pitch = 0.1, s = PX_PER_M, inkWidth = 0.03, face = 0 } = {}) {
  const T = studio.THREE, g = await load(url), clips = clipsUrl ? (await load(clipsUrl)).animations : g.animations;
  const root = studio.ink(SkeletonUtils.clone(g.scene)), holder = new T.Group(); holder.add(root); studio.scene.add(holder);
  const mixer = new T.AnimationMixer(root);
  const pose = (name, at) => { const clip = T.AnimationClip.findByName(clips, name); if (!clip) throw new Error(`no clip ${name} in ${url}`); mixer.stopAllAction(); const a = mixer.clipAction(clip); a.play(); mixer.setTime(clip.duration * at); };
  // size: its standing height becomes `height` metres
  pose(anims[0][1], 0); holder.rotation.y = 0; holder.scale.setScalar(1);
  let b = studio.boxOf(holder); const k = height / Math.max(0.01, b.max.y - b.min.y);
  holder.scale.setScalar(k); holder.rotation.y = yaw + face;
  // the ground and the middle: from the first pose (clips are in place; the feet line is the lowest point standing)
  b = studio.boxOf(holder); holder.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, 0);
  const list = []; for (const [name, clip, times] of anims) times.forEach((t, i) => list.push([name + i, clip, t]));
  let f = null;
  for (const [, clip, t] of list) { pose(clip, t); const q = studio.frameOf(holder, pitch, inkWidth / k, s); f = f ? [Math.min(f[0], q[0]), Math.min(f[1], q[1]), Math.max(f[2], q[2]), Math.max(f[3], q[3])] : q; }
  const shots = [];
  for (const [, clip, t] of list) { pose(clip, t); shots.push(studio.shoot(holder, { s, pitch, frame: f, inkWidth: inkWidth / k })); }
  studio.scene.remove(holder);
  let u = null; for (const sh of shots) { const a = alphaBox(sh.canvas); if (a) u = u ? [Math.min(u[0], a[0]), Math.min(u[1], a[1]), Math.max(u[2], a[2]), Math.max(u[3], a[3])] : a; }
  u = [Math.max(0, u[0] - 1), Math.max(0, u[1] - 1), Math.min(shots[0].canvas.width, u[2] + 1), Math.min(shots[0].canvas.height, u[3] + 1)];
  return { frames: shots.map(sh => crop(sh.canvas, u)), fw: u[2] - u[0], fh: u[3] - u[1], ax: shots[0].ox - u[0], ay: shots[0].oy - u[1], names: list.map(l => l[0]) };
}
/** Frames side by side in rows of `cols` -> one sheet canvas. */
export function sheetOf(ch, cols) {
  const rows = Math.ceil(ch.frames.length / cols), c = canvas2d(cols * ch.fw, rows * ch.fh), g = c.getContext('2d');
  ch.frames.forEach((f, i) => g.drawImage(f, (i % cols) * ch.fw, Math.floor(i / cols) * ch.fh));
  return c;
}

/**
 * A strip of scenery that tiles sideways. items: [{ canvas, ax, ay }, x (0..1 along the strip), lift (px above the
 * base line)]. Anything that crosses an end is drawn again at the other end, so the two ends always meet.
 * base: the height of the solid band along the bottom (px), baseColor its colour, hills: a rolling skyline behind.
 */
export function strip(w, h, items, { base = 0, baseColor = '#000', hills = null, hazeColor = '#fff', hazeK = 0 } = {}) {
  const c = canvas2d(w, h), g = c.getContext('2d'), ground = h - base;
  if (hills) for (const [color, top, amp, waves, phase] of hills) {   // sums of whole waves: they repeat exactly over the strip
    g.fillStyle = color; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) { let y = 0; waves.forEach((n, i) => { y += Math.sin((x / w) * Math.PI * 2 * n + phase + i * 1.7) / (i + 1); }); g.lineTo(x, ground - top - amp * (0.5 + 0.5 * y / 1.6)); }
    g.lineTo(w, h); g.closePath(); g.fill();
  }
  if (base) { g.fillStyle = baseColor; g.fillRect(0, ground, w, base); }
  for (const [p, at, lift = 0] of items) {
    const x = Math.round(at * w - p.ax), y = Math.round(ground - lift - p.ay);
    for (const dx of [-w, 0, w]) if (x + dx < w && x + dx + p.canvas.width > 0) g.drawImage(p.canvas, x + dx, y);
  }
  if (base) { g.fillStyle = INK; g.globalAlpha = 0.9; g.fillRect(0, ground - 1, w, 2); g.globalAlpha = 1; }
  return haze(c, hazeColor, hazeK);
}

/**
 * The ground: a row of one piece, seen from the front and a little above, cut to exactly `cells` game cells wide so
 * it repeats; the hero's feet stand on the line `over` px below the picture's top (the middle of the top face shown).
 * -> { canvas (cells * 96 wide, over + 96 tall), over, fill (the colour of the earth below it) }.
 */
export async function ground(studio, url, { cells = 3, scale = 0, yaw = 0, pitch = 0.42, top = 30, fill = '', drop = 0 } = {}) {
  const T = studio.THREE, g = await load(url), period = cells * CELL_M;
  const one = SkeletonUtils.clone(g.scene); let b = studio.boxOf(one);
  const k = scale || period / (yaw ? b.max.z - b.min.z : b.max.x - b.min.x);
  const holder = new T.Group(); studio.scene.add(holder);
  const copies = [];
  for (let i = -2; i <= 2; i++) { const o = studio.ink(SkeletonUtils.clone(g.scene)), h = new T.Group(); h.add(o); h.rotation.y = yaw; h.scale.setScalar(k); h.position.x = i * period; holder.add(h); copies.push(h); }
  b = studio.boxOf(copies[2]);
  // the front top edge at the world origin: top face up to y = 0, front edge at z = 0
  holder.position.set(-(b.min.x + b.max.x) / 2, -b.max.y, -b.max.z);
  const up = [Math.cos(pitch), -Math.sin(pitch)];
  const f = [-period / 2, -2.2, period / 2, 1.2];
  const shot = studio.shoot(holder, { pitch, frame: f, inkWidth: 0.03 });
  studio.scene.remove(holder);
  const W = cells * CELL_PX, over = Math.round(top / 2), H = over + CELL_PX, c = canvas2d(W, H), x = c.getContext('2d');
  // the front edge of the top face is at oy; show `top` px of the top face above it
  const edge = Math.round(shot.oy) + drop, src = shot.canvas;
  // the earth colour: the average of the front face a little below the edge, unless given
  let earth = fill;
  if (!earth) {
    const d = src.getContext('2d').getImageData(0, Math.min(src.height - 1, edge + 6), src.width, 1).data; let r = 0, gg = 0, bb = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] + d[i + 1] + d[i + 2] > 120) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
    earth = n ? '#' + [r, gg, bb].map(v => Math.round(v / n * 0.86).toString(16).padStart(2, '0')).join('') : '#6b5b45';
  }
  x.fillStyle = earth; x.fillRect(0, 2, W, H - 2);
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, edge - top, src.width, top + (H - top), 0, 0, W, top + (H - top) * 1);
  // an ink line closes the top
  x.fillStyle = INK; x.fillRect(0, 0, W, 3);
  void up;
  return { canvas: c, over, fill: earth };
}

/** Shelf-pack pictures into one atlas -> { canvas, rects: { name: [x, y, w, h] } }. items: [[name, canvas]]. */
export function atlas(items, width = 1024, gap = 2) {
  const order = items.slice().sort((a, b) => b[1].height - a[1].height || (a[0] < b[0] ? -1 : 1));
  let x = gap, y = gap, rowH = 0; const rects = {};
  for (const [name, c] of order) {
    if (c.width + gap * 2 > width) throw new Error(`${name} is wider than the atlas`);
    if (x + c.width + gap > width) { x = gap; y += rowH + gap; rowH = 0; }
    rects[name] = [x, y, c.width, c.height]; x += c.width + gap; rowH = Math.max(rowH, c.height);
  }
  const out = canvas2d(width, y + rowH + gap), g = out.getContext('2d');
  for (const [name, c] of order) g.drawImage(c, rects[name][0], rects[name][1]);
  return { canvas: out, rects };
}

export const webp = (c, q = 0.82) => c.toDataURL('image/webp', q).split(',')[1];
export const png = c => c.toDataURL('image/png').split(',')[1];
export { mix, hex, canvas2d, haze };

// ---------------------------------------------------------------- the packs
const HERO_ANIMS = clips => [['idle', clips.idle, [0, 0.25, 0.5, 0.75]], ['run', clips.run, [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]], ['jump', clips.jumpAir, [0.1, 0.6]]];
const SHEET_COLS = 7;
const sheetEntry = (ch, image, extra = {}) => ({ image, fw: ch.fw, fh: ch.fh, ax: +(ch.ax / ch.fw).toFixed(4), ay: +(ch.ay / ch.fh).toFixed(4), cols: SHEET_COLS,
  anims: { idle: [0, 1, 2, 3], run: [4, 5, 6, 7, 8, 9, 10, 11], jump: [12, 13] }, fps: { idle: 5, run: 12 }, ...extra });

/** The heroes pack: every hero of the recipe as a sheet (idle 4, run 8, jump 2), drawn in daylight. */
export async function buildHeroes(recipe, theme, base) {
  const studio = makeStudio(theme.look, { bright: recipe.bright || 1 }), images = {}, sprites = {};
  for (const id of recipe.heroes) {
    const h = theme.heroes.find(x => x.id === id); if (!h) throw new Error('no hero ' + id);
    const ch = await character(studio, base + h.file, base + theme.moves.file, HERO_ANIMS(theme.moves.clips), { height: recipe.height || 2.4, yaw: recipe.yaw ?? 1.15, pitch: recipe.pitch ?? 0.1 });
    images[id + '.webp'] = webp(sheetOf(ch, SHEET_COLS), recipe.quality || 0.82);
    sprites[id] = sheetEntry(ch, id + '.webp', { name: h.name, kind: 'hero' });
  }
  return { images, sprites };
}

/** The animals pack: staged creatures as sheets. recipe.animals: [{ id, name, file, group, idle, run, jump, size, bright }]. */
export async function buildAnimals(recipe, look, base) {
  const images = {}, sprites = {};
  for (const a of recipe.animals) {
    const studio = makeStudio(look, { bright: a.bright ?? recipe.bright ?? 1, exposure: a.exposure ?? recipe.exposure ?? 1 });
    const anims = [['idle', a.idle, a.idleAt || [0, 0.25, 0.5, 0.75]], ['run', a.run, a.runAt || [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]], ['jump', a.jump, a.jumpAt || [0.3, 0.55]]];
    const ch = await character(studio, base + a.file, '', anims, { height: a.height, inkWidth: 0.03 * Math.min(1, a.height / 2.2) * (a.ink || 1), yaw: a.yaw ?? recipe.yaw ?? 1.15, pitch: recipe.pitch ?? 0.1 });
    images[a.id + '.webp'] = webp(sheetOf(ch, SHEET_COLS), recipe.quality || 0.82);
    sprites[a.id] = sheetEntry(ch, a.id + '.webp', { name: a.name, kind: 'animal', group: a.group, ...(a.fps ? { fps: a.fps } : {}) });
    studio.renderer.dispose(); studio.renderer.forceContextLoss();
  }
  return { images, sprites };
}

/**
 * One world's pack: the sky colours, two strips of scenery (far, mid), the ground, and an atlas of props with the
 * goal, the coin and the obstacles. Sprites are sized in game cells (1 cell = 96 px = 1.37 m).
 */
export async function buildWorld(recipe, theme, base) {
  const studio = makeStudio(theme.look, { bright: recipe.bright || 1 }), L = theme.look;
  const file = id => { const p = theme.pieces.find(x => x.id === id); if (!p) throw new Error(`${theme.id} has no piece ${id}`); return base + p.file; };
  const q = recipe.quality || 0.82, images = {}, sprites = {};
  const hazeColor = recipe.haze || L.fog.color;
  // far and mid strips
  const layers = {};
  for (const [name, w, h, s, hazeK] of [['far', 1024, 320, PX_PER_M * 0.3, 0.42], ['mid', 2048, 512, PX_PER_M * 0.72, 0.16]]) {
    const R = recipe[name]; if (!R) continue;
    const scale = R.s ? PX_PER_M * R.s : s, items = [];
    // row: pieces side by side filling the strip exactly (the walls of a room), seen straight on
    const row = R.row || []; for (const [i, id] of row.entries()) items.push([await piece(studio, file(id), { fitW: w / row.length / scale + 0.08, s: scale, yaw: 0, pitch: 0.02 }), (i + 0.5) / row.length, 0]);
    for (const [id, at, m = 3, o = {}] of R.pieces || []) items.push([await piece(studio, file(id), { glow: o.glow || 0, fit: m, s: scale, yaw: o.yaw ?? 0.35, pitch: o.pitch ?? 0.1, sink: o.sink || 0 }), at, (o.lift || 0) * scale]);
    const c = strip(w, h, items, { base: R.base ?? 0, baseColor: R.baseColor || recipe.under || L.hemisphere.ground, hills: R.hills || null, hazeColor, hazeK: R.haze ?? hazeK });
    images[name + '.webp'] = webp(c, R.quality || q);
    layers[name] = { image: name + '.webp', w, h, cells: +(h / (scale / PX_PER_M * CELL_PX)).toFixed(2), speed: name === 'far' ? 0.12 : 0.35, base: R.base ?? 0 };
  }
  // the ground
  const G = recipe.ground, gr = await ground(studio, file(G.piece), G);
  images['ground.webp'] = webp(gr.canvas, 0.9);
  // props, goal, coin, obstacles: one atlas
  const items = [], add = async (name, [id, cells = 1, o = {}], kind) => {
    const p = await piece(studio, file(id), { glow: o.glow || 0, fit: cells * CELL_M, yaw: o.yaw ?? 0.35, pitch: o.pitch ?? 0.14, sink: o.sink || 0, tilt: o.tilt || 0 });
    items.push([name, p.canvas]);
    sprites[name] = { kind, piece: id, ax: +(p.ax / p.canvas.width).toFixed(4), ay: +(p.ay / p.canvas.height).toFixed(4), size: +(p.canvas.height / CELL_PX).toFixed(2), ...(o.tags ? { tags: o.tags } : {}) };
  };
  for (const row of recipe.props) await add((row[2] && row[2].as) || row[0], row, 'prop');
  await add('goal', recipe.goal, 'goal'); await add('coin', recipe.coin, 'coin');
  for (const [i, row] of recipe.obstacles.entries()) await add('obstacle-' + (i + 1), row, 'obstacle');
  const A = atlas(items, 1024);
  images['props.webp'] = webp(A.canvas, q);
  for (const [name, r] of Object.entries(A.rects)) sprites[name].rect = r;
  studio.renderer.dispose(); studio.renderer.forceContextLoss();
  return { images, sprites, sky: recipe.sky || [L.sky.top, L.sky.middle, L.sky.bottom], under: recipe.under === null ? '' : recipe.under || gr.fill, layers,
    ground: { image: 'ground.webp', cells: G.cells || 3, over: gr.over, fill: gr.fill, ...(G.open ? { open: true } : {}) }, props: { image: 'props.webp', w: A.canvas.width, h: A.canvas.height } };
}
