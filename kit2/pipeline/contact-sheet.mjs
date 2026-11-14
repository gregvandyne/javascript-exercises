// A contact sheet of models, drawn with the Oomba look (ink outlines, a theme's daytime light), names under each:
//   node kit2/pipeline/contact-sheet.mjs <models-dir> <out.png> [--title "Pirate kit"] [--only a,b] [--sub excluded]
//   node kit2/pipeline/contact-sheet.mjs <models-dir> <out.png> --creatures [--hero knight] [--moves idle,walk,swim]
//   node kit2/pipeline/contact-sheet.mjs <models-dir> <out.png> --heads --only t-rex,wolf   (faces close up)
// The first form shows every .glb in the folder (and its creatures/ folder). The second shows each animated model twice,
// standing (idle, or swim) and in the middle of a step (walk, or swim half a beat later), beside a hero for scale.
// "Look at every model before it joins a theme" (kit2/README.md) is done on these sheets. Also writes <out>.json: each
// model's real size (skinned models measured in their pose), triangles and clips.
// Needs the Playwright Chromium (BRB_CHROMIUM, or the one Playwright installed); draws with software WebGL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : args[i + 1]; };
const flag = name => args.includes('--' + name);
const [dir, outFile] = args.filter((a, i) => !a.startsWith('--') && !(i && args[i - 1].startsWith('--') && !['--creatures'].includes(args[i - 1])));
const sub = opt('sub', '');
const creatures = flag('creatures') || flag('heads');
const heads = flag('heads');   // close-ups of each animated model's front end, to judge whether a face reads as friendly
const LOOK_THEME = path.join(ROOT, 'public/vendor/themes/medieval-village/1.0.0');
const look = JSON.parse(fs.readFileSync(path.join(LOOK_THEME, 'theme.json'), 'utf8'));
const heroId = opt('hero', 'knight');

const base = sub ? path.join(dir, sub) : dir;
const list = d => fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.glb')).sort().map(f => path.join(d, f)) : [];
let files = creatures ? list(path.join(dir, 'creatures')).concat(list(dir).filter(() => flag('flat'))) : [...list(base), ...(sub ? [] : list(path.join(dir, 'creatures')))];
if (flag('flat') && creatures) files = list(dir);
const only = opt('only', ''); if (only) files = files.filter(f => only.split(',').includes(path.basename(f, '.glb')));
const slice = opt('slice', ''); if (slice) files = files.slice(...slice.split(':').map(Number));   // --slice 0:90, for a pack too big for one sheet
if (!files.length) { console.error('no models in', base); process.exit(1); }

const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
const HOST = 'http://sheet.invalid';
const TYPES = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.html': 'text/html' };
const served = {
  '/three/': path.join(ROOT, 'public/vendor/three/0.185.1'),
  '/addons/': path.join(ROOT, 'public/vendor/kit2/three-addons/0.185.1'),
  '/hero/': path.join(LOOK_THEME, 'heroes'),
};
await page.route(HOST + '/**', route => {
  const u = new URL(route.request().url());
  if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>sheet</title><script type="importmap">{"imports":{"three":"/three/three.module.min.js","three/addons/":"/addons/"}}</script><body style="margin:0">` });
  if (u.pathname.startsWith('/m/')) { const f = files[+u.pathname.slice(3)]; return route.fulfill({ contentType: TYPES['.glb'], body: fs.readFileSync(f) }); }
  for (const [prefix, d] of Object.entries(served)) if (u.pathname.startsWith(prefix)) {
    const f = path.join(d, path.normalize(u.pathname.slice(prefix.length)));
    if (f.startsWith(d) && fs.existsSync(f)) return route.fulfill({ contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  }
  return route.fulfill({ status: 404, body: '' });
});
page.on('console', m => { if (m.type() === 'error') console.error('page:', m.text()); });
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(HOST + '/');

const items = files.map((f, i) => ({ i, name: path.basename(f, '.glb'), kb: Math.round(fs.statSync(f).size / 1024) }));
const result = await page.evaluate(async ({ items, look, creatures, heads, heroId, title, moves, clipsOfHero, maxSide }) => {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
  const SkeletonUtils = await import('three/addons/utils/SkeletonUtils.js');
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

  const perItem = creatures ? 2 : 1, n = items.length * perItem;
  const cols = creatures ? Math.min(6, Math.max(2, 2 * Math.ceil(Math.sqrt(items.length / 2)))) : Math.max(1, Math.ceil(Math.sqrt(n * 1.25)));
  const rows = Math.ceil(n / cols);
  const cell = Math.min(creatures ? 440 : 280, Math.floor((maxSide - 20) / Math.max(cols, 1)));
  const labelH = creatures ? 46 : 40, head = title ? 44 : 0;
  const cellH = Math.min(cell, Math.floor((maxSide - head) / rows) - labelH) + labelH, picH = cellH - labelH;
  const sheet = document.createElement('canvas'); sheet.width = cols * cell; sheet.height = head + rows * cellH;
  const x2 = sheet.getContext('2d');
  x2.fillStyle = look.look.hud.cream; x2.fillRect(0, 0, sheet.width, sheet.height);
  if (title) { x2.fillStyle = look.look.hud.ink; x2.font = '700 24px system-ui, sans-serif'; x2.textBaseline = 'middle'; x2.fillText(title, 12, head / 2); }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(cell * 2, picH * 2);   // drawn at twice the size, scaled down: smoother ink lines
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = look.look.exposure;
  const scene = new THREE.Scene();
  const L = look.look;
  scene.add(new THREE.HemisphereLight(L.hemisphere.sky, L.hemisphere.ground, L.hemisphere.intensity));
  const sun = new THREE.DirectionalLight(L.sun.color, L.sun.intensity); sun.position.set(7, 12, 8); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(28, cell / picH, 0.01, 5000);

  // The Oomba3D ink outline (public/vendor/kit2/oomba3d/1.1.0): a slightly bigger, back-facing ink copy of each mesh.
  // Cut-out and see-through materials (leaf cards) get none here: an ink copy of a flat card is a black rectangle.
  const inkMat = new THREE.MeshBasicMaterial({ color: '#141414', side: THREE.BackSide });
  inkMat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * 0.025;'); };
  const ink = o => {
    const meshes = []; o.traverse(c => { if (c.isMesh && !c.userData.ink) meshes.push(c); });
    for (const m of meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (mats.some(t => t.transparent || t.alphaTest > 0)) continue;
      const hull = m.isSkinnedMesh ? m.clone() : new THREE.Mesh(m.geometry, inkMat);
      hull.material = inkMat; hull.userData.ink = true;
      if (m.isSkinnedMesh) { hull.position.copy(m.position); hull.quaternion.copy(m.quaternion); hull.scale.copy(m.scale); m.parent.add(hull); } else m.add(hull);
    }
    return o;
  };
  const boxOf = o => { o.updateMatrixWorld(true); const b = new THREE.Box3(); o.traverse(c => { if (c.isMesh && !c.userData.ink) { if (c.isSkinnedMesh) c.computeBoundingBox(); b.expandByObject(c, true); } }); return b; };
  const tris = o => { let t = 0; o.traverse(c => { if (c.isMesh && !c.userData.ink) t += (c.geometry.index ? c.geometry.index.count : c.geometry.attributes.position.count) / 3; }); return Math.round(t); };

  let hero = null, heroMoves = null;
  if (creatures) {
    const g = await loader.loadAsync('/hero/' + heroId + '.glb'); heroMoves = (await loader.loadAsync('/hero/moves.glb')).animations;
    hero = ink(SkeletonUtils.clone(g.scene));
    const mixer = new THREE.AnimationMixer(hero); const clip = THREE.AnimationClip.findByName(heroMoves, clipsOfHero.idle); if (clip) { mixer.clipAction(clip).play(); mixer.setTime(0.4); }
    hero.userData.height = boxOf(hero).getSize(new THREE.Vector3()).y;
  }

  const out = [];
  const label = (k, lines) => {
    const cx = (k % cols) * cell, cy = head + Math.floor(k / cols) * cellH;
    x2.fillStyle = look.look.hud.ink; x2.textBaseline = 'top'; x2.textAlign = 'center';
    lines.forEach(([text, font], j) => { x2.font = font; let t = text; while (x2.measureText(t).width > cell - 8 && t.length > 4) t = t.slice(0, -2); x2.fillText(t === text ? t : t + '…', cx + cell / 2, cy + picH + 3 + j * 14); });
  };
  const shoot = (k, group, box, dir) => {
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.length() / 2, 0.05);
    const d = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.04;
    camera.position.copy(centre).addScaledVector(dir.clone().normalize(), d); camera.near = d / 100; camera.far = d * 10; camera.lookAt(centre); camera.updateProjectionMatrix();
    renderer.setClearColor(0x000000, 0); renderer.render(scene, camera);
    const cx = (k % cols) * cell, cy = head + Math.floor(k / cols) * cellH;
    const sky = x2.createLinearGradient(0, cy, 0, cy + picH); sky.addColorStop(0, L.sky.top); sky.addColorStop(0.6, L.sky.middle); sky.addColorStop(1, L.sky.bottom);
    x2.fillStyle = sky; x2.fillRect(cx + 2, cy + 2, cell - 4, picH - 2);
    x2.imageSmoothingQuality = 'high'; x2.drawImage(renderer.domElement, cx + 2, cy + 2, cell - 4, picH - 2);
  };
  const fmt = v => v >= 10 ? v.toFixed(0) : v.toFixed(1);

  for (const it of items) {
    let g;
    try { g = await loader.loadAsync('/m/' + it.i); } catch (e) { out.push({ name: it.name, error: String(e.message || e) }); label(it.i * perItem, [[it.name + ' (failed to load)', '600 12px system-ui, sans-serif']]); continue; }
    // A material the pipeline marked flat (pack-steps.mjs inkNormals) has smooth normals for the ink and is drawn faceted.
    g.scene.traverse(c => { if (c.isMesh) for (const m of (Array.isArray(c.material) ? c.material : [c.material])) if (m.userData.flat && !m.flatShading) { m.flatShading = true; m.needsUpdate = true; } });
    const root = ink(SkeletonUtils.clone(g.scene)); scene.add(root);
    const clips = g.animations.map(a => a.name);
    const mixer = g.animations.length ? new THREE.AnimationMixer(root) : null;
    const pose = (name, at) => { if (!mixer) return null; const clip = THREE.AnimationClip.findByName(g.animations, name); if (!clip) return null; mixer.stopAllAction(); mixer.clipAction(clip).play(); mixer.setTime(clip.duration * at); return clip; };
    const info = { name: it.name, kb: it.kb, tris: tris(root), clips, materials: [] };
    root.traverse(c => { if (c.isMesh && !c.userData.ink) for (const m of (Array.isArray(c.material) ? c.material : [c.material])) if (!info.materials.includes(m.name)) info.materials.push(m.name); });
    if (!creatures) {
      const first = clips.includes('idle') ? 'idle' : clips.includes('swim') ? 'swim' : clips.includes('fly') ? 'fly' : null; if (first) pose(first, 0.3);
      const box = boxOf(root), s = box.getSize(new THREE.Vector3());
      info.size = [s.x, s.y, s.z].map(v => +v.toFixed(2)); info.minY = +box.min.y.toFixed(2);
      shoot(it.i, root, box, new THREE.Vector3(0.9, 0.55, 1.2));
      label(it.i, [[it.name, '600 12px system-ui, sans-serif'], [`${info.size.map(fmt).join(' × ')}  ·  ${it.kb} KB${clips.length ? '  ·  ' + clips.length + ' clips' : ''}`, '11px system-ui, sans-serif']]);
    } else {
      const still = moves.find(m => clips.includes(m)) || clips[0];
      const going = ['walk', 'swim', 'fly', 'run'].find(m => clips.includes(m) && m !== still) || still;
      [[still, 0.3], [going, going === still ? 0.8 : 0.4]].forEach(([name, at], j) => {
        pose(name, at);
        const box = boxOf(root), s = box.getSize(new THREE.Vector3());
        if (heads) {
          const front = box.clone(); front.min.z = box.max.z - s.z * 0.32;
          shoot(it.i * 2 + j, root, front, j ? new THREE.Vector3(0.25, 0.1, 1) : new THREE.Vector3(1, 0.12, 0.45));
          label(it.i * 2 + j, [[`${it.name}: ${name || 'no clips'}, ${j ? 'from the front' : 'from the side'}`, '600 13px system-ui, sans-serif']]);
          return;
        }
        if (!j) { info.size = [s.x, s.y, s.z].map(v => +v.toFixed(2)); info.minY = +box.min.y.toFixed(2); }
        // The hero stands beside the creature, a step behind its head, feet on the same ground.
        hero.position.set(box.min.x - 0.5, Math.min(0, box.min.y), box.max.z + 1.1); scene.add(hero);
        const both = box.clone().union(boxOf(hero));
        shoot(it.i * 2 + j, root, both, new THREE.Vector3(1.25, 0.3, 1.0));
        label(it.i * 2 + j, [[`${it.name}: ${name}${going === still && j ? ' (later in the clip)' : ''}`, '600 13px system-ui, sans-serif'], [j ? `clips: ${clips.join(', ')}` : `${info.size.map(fmt).join(' × ')} (hero is ${fmt(hero.userData.height)} tall)  ·  ${it.kb} KB  ·  ${info.tris} triangles`, '11px system-ui, sans-serif']]);
      });
      scene.remove(hero);
    }
    out.push(info);
    scene.remove(root);
    root.traverse(c => { if (c.isMesh) { c.geometry.dispose(); for (const m of (Array.isArray(c.material) ? c.material : [c.material])) { if (m.map) m.map.dispose(); m.dispose(); } } });
  }
  return { png: sheet.toDataURL('image/png'), out, w: sheet.width, h: sheet.height };
}, { items, look, creatures, heads, heroId, title: opt('title', ''), moves: opt('moves', 'idle,swim,fly').split(','), clipsOfHero: look.moves.clips, maxSide: +opt('max', 2900) });

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, Buffer.from(result.png.split(',')[1], 'base64'));
fs.writeFileSync(outFile.replace(/\.png$/, '.json'), JSON.stringify(result.out, null, 1) + '\n');
console.log(outFile, `${result.w}x${result.h}`, `${result.out.length} models`, result.out.filter(o => o.error).map(o => o.name + ': ' + o.error).join('; '));
await browser.close();
