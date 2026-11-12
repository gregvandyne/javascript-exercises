// Oomba3D 1.1.0: the small, friendly 3D game library for Kit 2 themes (docs/kit2-api.md). An ES module loaded through
// the Kit 2 import map as 'oomba3d'. It loads one theme's art from /vendor/themes/<theme>/<version>/ (the only folder
// the game frame may fetch) and gives a game heroes, floating islands, water, a follow camera, keyboard and touch
// controls, coins, questions on answer islands, sounds, a celebration, time of day, weather, ink outlines, real physics
// (Rapier, loaded only when asked for) and graphics levels a player can change in the game (the gear button).
// Chromebook first: 'auto' graphics start at Fast on small devices and step down when the frame rate drops below 30;
// prefers-reduced-motion stops drifting, bobbing, weather and confetti. Shipped versions never change (kit2/SHIPPED.json).
// 1.1.0 adds: graphics(), sky(), weather(), world.water(), physics(), outlines, meshopt models. Everything in 1.0.0 works
// the same (lowPower: true is graphics: 'low').
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const VERSION = '1.1.0';
/** Everything a game may call on the object start() returns (docs/kit2-api.md lists exactly these). */
export const API = ['hero', 'world.island', 'world.piece', 'world.water', 'followCamera', 'controls', 'coins', 'askQuestion', 'sound', 'celebrate', 'toast', 'score', 'onUpdate', 'graphics', 'sky', 'weather', 'physics'];
export const GRAPHICS = ['auto', 'low', 'medium', 'high'];
export const TIMES = ['morning', 'day', 'sunset', 'night'];
export const WEATHER = ['clear', 'snow', 'rain', 'sparkles', 'leaves'];
export { THREE };

// What each graphics level turns on. 'auto' picks one and steps down when the game runs slowly.
const LEVELS = {
  low: { ratio: 1, shadows: false, shadowSize: 512, glow: false, smaa: false, clouds: 3, particles: 0.35, confetti: false },
  medium: { ratio: 1.5, shadows: true, shadowSize: 1024, glow: true, smaa: false, clouds: 1, particles: 0.7, confetti: true },
  high: { ratio: 2, shadows: true, shadowSize: 2048, glow: true, smaa: true, clouds: 1, particles: 1, confetti: true },
};
// Times of day: sky gradient, sun, ambient light, fog and clouds. 'day' is the theme's own look.
const TIME = {
  morning: { sky: { top: '#7ec8ff', middle: '#ffd9b8', bottom: '#ffe9c7' }, sun: ['#ffd2a1', 2.2, [30, 14, 20]], hemi: ['#ffe8d1', '#7a8f5a', 1], fog: '#f6dcc4', clouds: ['#fff6ee', '#ffd9c0'], sea: '#4fb3e0', exposure: 1, stars: 0 },
  sunset: { sky: { top: '#3b4b8f', middle: '#ff9a6b', bottom: '#ffd27a' }, sun: ['#ffb070', 2, [-30, 9, -20]], hemi: ['#ffc59e', '#5a4a6a', 0.9], fog: '#f2b38c', clouds: ['#ffe2d0', '#ff9f7a'], sea: '#4d6fa8', exposure: 1, stars: 0.25 },
  night: { sky: { top: '#0b1033', middle: '#1d2a5c', bottom: '#2b3a6b' }, sun: ['#c4d2ff', 1.6, [-12, 30, 10]], hemi: ['#8f9fe0', '#2a3150', 1.3], fog: '#1d2a5c', clouds: ['#9aa6d6', '#2e3b72'], sea: '#183766', exposure: 1.25, stars: 1 },
};
const WEATHER_LOOK = {
  snow: { color: '#ffffff', size: 0.22, fall: 2, drift: 0.8, count: 1600 },
  rain: { color: '#9fd3ff', size: 0.12, fall: 22, drift: 0.2, count: 2400 },
  sparkles: { color: '#FFD23F', size: 0.28, fall: -0.6, drift: 0.5, count: 500, twinkle: true },
  leaves: { color: '#7fbf5f', alt: '#f2a54a', size: 0.32, fall: 1.4, drift: 1.6, count: 500 },
};

const CSS = `.o3-hud{position:fixed;inset:0;pointer-events:none;font-family:"Bricolage Grotesque",system-ui,sans-serif;color:#141414}
.o3-top{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));left:0;right:0;display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;padding:0 64px}
.o3-pill{background:#FFFDF2;border:3px solid #141414;border-radius:999px;padding:8px 16px;font-weight:800;font-size:18px;box-shadow:0 4px 0 #141414}
.o3-q{background:#FFD23F;font-size:22px}.o3-q:empty,.o3-score[hidden]{display:none}
.o3-toast{position:absolute;top:62%;left:50%;transform:translate(-50%,-50%) scale(.6);opacity:0;transition:.25s;white-space:nowrap;font-weight:900;font-size:clamp(28px,7vw,48px);color:#FFFDF2;-webkit-text-stroke:3px #141414;paint-order:stroke}
.o3-toast.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.o3-pad{position:absolute;bottom:calc(14px + env(safe-area-inset-bottom,0px));left:max(16px,env(safe-area-inset-left,0px));right:max(16px,env(safe-area-inset-right,0px));display:flex;justify-content:space-between;align-items:flex-end}
.o3-dpad{display:grid;grid-template-columns:repeat(3,56px);grid-template-rows:repeat(2,56px);gap:6px}
.o3-pad button{pointer-events:auto;touch-action:none;width:56px;height:56px;border-radius:16px;border:3px solid #141414;background:#FFFDF2;color:#141414;font:900 22px system-ui,sans-serif;box-shadow:0 4px 0 #141414}
.o3-pad .o3-jump{width:92px;height:92px;border-radius:50%;background:#FFD23F;font-size:18px}
.o3-pad button:active,.o3-gear:active{transform:translateY(3px);box-shadow:0 1px 0 #141414}
@media (hover:hover) and (pointer:fine){.o3-pad{display:none}}
.o3-gear{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:max(12px,env(safe-area-inset-right,0px));pointer-events:auto;width:48px;height:48px;border-radius:50%;border:3px solid #141414;background:#FFFDF2;box-shadow:0 4px 0 #141414;font-size:24px;line-height:1;cursor:pointer}
.o3-gear:focus-visible,.o3-set button:focus-visible{outline:3px solid #141414;outline-offset:3px}
.o3-set{position:absolute;top:calc(70px + env(safe-area-inset-top,0px));right:max(12px,env(safe-area-inset-right,0px));pointer-events:auto;background:#FFFDF2;border:3px solid #141414;border-radius:20px;box-shadow:0 6px 0 #141414;padding:14px;display:grid;gap:10px;width:min(280px,calc(100vw - 24px))}
.o3-set[hidden]{display:none}.o3-set b{font-size:15px}
.o3-set .o3-row{display:flex;flex-wrap:wrap;gap:6px}
.o3-set button{min-height:44px;padding:0 12px;border-radius:999px;border:2px solid #141414;background:#FFFDF2;font:700 15px system-ui,sans-serif;cursor:pointer;color:#141414}
.o3-set button[aria-pressed="true"]{background:#141414;color:#FFFDF2}
@media (prefers-reduced-motion:reduce){.o3-toast{transition:none}}`;

// A small seeded random, so a scene looks the same every time (and in screenshots).
const seeded = (s = 7) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

/**
 * start({ theme, version, graphics?, time?, weather?, outline?, settings?, reducedMotion?, parent? }) -> Promise<game>
 * theme/version name a shipped theme (/vendor/themes/<theme>/<version>/). graphics: 'auto' (default) | 'low' | 'medium'
 * | 'high'. time: 'day' (default) | 'morning' | 'sunset' | 'night'. weather: 'clear' (default) | 'snow' | 'rain' |
 * 'sparkles' | 'leaves'. outline: false (default) | true (ink outlines on heroes and pieces). settings: true (default)
 * shows the gear button. lowPower (1.0.0): true means graphics 'low'.
 */
export async function start({ theme, version, graphics, lowPower, time = 'day', weather: weatherKind = 'clear', outline = false, settings = true, reducedMotion, parent = document.body } = {}) {
  if (!/^[a-z0-9-]+$/.test(String(theme)) || !/^\d+\.\d+\.\d+$/.test(String(version))) throw new Error('Oomba3D: start() needs a theme and a version, like { theme: "sky-islands", version: "1.0.1" }');
  const base = `/vendor/themes/${theme}/${version}/`;
  const manifest = await new THREE.FileLoader().setResponseType('json').loadAsync(base + 'theme.json');
  const look = manifest.look || {};
  const motionOff = reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  let mode = graphics || (lowPower === true ? 'low' : lowPower === false ? 'high' : 'auto');
  if (!GRAPHICS.includes(mode)) mode = 'auto';
  let level = mode === 'auto' ? (small ? 'low' : 'high') : mode;
  const rand = seeded();

  // ---- renderer, sky, light, glow
  const renderer = new THREE.WebGLRenderer({ antialias: level !== 'low' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  parent.prepend(renderer.domElement);
  renderer.domElement.style.display = 'block';
  const scene = new THREE.Scene();
  const skyUniforms = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix*vec4(position,1.)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vP,1.); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0. ? mix(mid, top, pow(h, .6)) : mix(mid, bottom, pow(-h, .5)); gl_FragColor = vec4(c, 1.); }',
  })));
  scene.fog = new THREE.Fog('#d6eeff', look.fog?.near ?? 70, look.fog?.far ?? 230);
  const hemi = new THREE.HemisphereLight();
  scene.add(hemi);
  const sun = new THREE.DirectionalLight();
  const sunOffset = new THREE.Vector3(18, 30, 12);
  sun.position.copy(sunOffset);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const glow = look.glow || {};
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), glow.strength ?? 0.12, glow.radius ?? 0.4, glow.threshold ?? 0.98);
  composer.addPass(bloom);
  const smaa = new SMAAPass();
  composer.addPass(smaa);
  composer.addPass(new OutputPass());

  // Stars for the night (and a few at sunset).
  const starGeo = new THREE.BufferGeometry(); const starPos = [];
  for (let i = 0; i < 900; i++) { const t = rand() * Math.PI * 2, u = 0.08 + rand() * 0.9; const r = 380; starPos.push(Math.cos(t) * Math.sqrt(1 - u * u) * r, u * r, Math.sin(t) * Math.sqrt(1 - u * u) * r); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#fffbe8', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
  scene.add(stars);

  // ---- soft clouds: a sea below and a few above
  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({ roughness: 1, emissiveIntensity: look.clouds?.emissiveIntensity ?? 0.15 });
  const puff = new THREE.IcosahedronGeometry(1, 3);
  const cloudAt = (x, y, z, s) => {
    const c = new THREE.Group(), n = 5 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) { const m = new THREE.Mesh(puff, cloudMat), r = 0.7 + rand() * 0.8; m.scale.set(r * 1.3, r * 0.8, r); m.position.set((k - n / 2) * 0.9 + rand() * 0.4, rand() * 0.5, (rand() - 0.5) * 1.2); c.add(m); }
    c.scale.setScalar(s); c.position.set(x, y, z); scene.add(c); clouds.push(c);
  };
  for (let i = 0; i < 60; i++) cloudAt((rand() - 0.5) * 160, -9 - rand() * 5, 30 - rand() * 140, 3 + rand() * 3);
  for (let i = 0; i < 8; i++) cloudAt(-45 + i * 13, 14 + rand() * 8, -30 - rand() * 50, 1.6 + rand());

  function sky(name = 'day') {
    if (name !== 'day' && !TIME[name]) throw new Error(`Oomba3D: sky() takes ${TIMES.join(', ')}`);
    const d = name === 'day'
      ? { sky: look.sky || { top: '#5fb8ff', middle: '#bfe6ff', bottom: '#fff4d6' }, sun: [look.sun?.color || '#fff1d6', look.sun?.intensity ?? 2.6, [18, 30, 12]], hemi: [look.hemisphere?.sky || '#dff3ff', look.hemisphere?.ground || '#7a8f5a', look.hemisphere?.intensity ?? 1.1], fog: look.fog?.color || '#d6eeff', clouds: [look.clouds?.color || '#ffffff', look.clouds?.emissive || '#e8f4ff'], sea: null, exposure: look.exposure ?? 1, stars: 0 }
      : TIME[name];
    skyUniforms.top.value.set(d.sky.top); skyUniforms.mid.value.set(d.sky.middle); skyUniforms.bottom.value.set(d.sky.bottom);
    sun.color.set(d.sun[0]); sun.intensity = d.sun[1]; sunOffset.set(...d.sun[2]);
    hemi.color.set(d.hemi[0]); hemi.groundColor.set(d.hemi[1]); hemi.intensity = d.hemi[2];
    scene.fog.color.set(d.fog); cloudMat.color.set(d.clouds[0]); cloudMat.emissive.set(d.clouds[1]);
    renderer.toneMappingExposure = d.exposure; stars.material.opacity = d.stars;
    seaTint = d.sea; if (water) { water.material.uniforms.sky.value.set(d.sky.middle); water.material.uniforms.deep.value.set(d.sea || water.userData.color); }
    time = name;
    return name;
  }

  // ---- graphics levels: the gear button changes them during the game
  function applyLevel() {
    const L = LEVELS[level];
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, L.ratio));
    renderer.shadowMap.enabled = L.shadows; sun.castShadow = L.shadows;
    if (sun.shadow.mapSize.x !== L.shadowSize) { sun.shadow.mapSize.set(L.shadowSize, L.shadowSize); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    bloom.enabled = L.glow && !!look.glow; smaa.enabled = L.smaa;
    clouds.forEach((c, i) => { c.visible = i % L.clouds === 0; });
    scene.traverse(o => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
    if (weatherKind !== 'clear') weather(weatherKind);
    resize(); syncSettings();
  }
  function graphicsLevel(next) {
    if (next === undefined) return mode === 'auto' ? `auto (${level})` : level;
    if (!GRAPHICS.includes(next)) throw new Error(`Oomba3D: graphics() takes ${GRAPHICS.join(', ')}`);
    mode = next; level = next === 'auto' ? (small ? 'low' : 'high') : next; slow = 0; applyLevel();
    return graphicsLevel();
  }
  function resize() {
    const w = parent === document.body ? innerWidth : parent.clientWidth, h = parent === document.body ? innerHeight : parent.clientHeight;
    camera.aspect = w / Math.max(h, 1);
    camera.fov = camera.aspect < 1 ? Math.min(78, 50 / Math.max(camera.aspect, 0.45) * 0.8) : 50;   // tall phones see more ground
    camera.updateProjectionMatrix();
    renderer.setSize(w, h); composer.setSize(w, h);
  }
  addEventListener('resize', resize);

  // ---- weather: one cloud of falling (or rising) points that travels with the camera
  let rain = null, seaTint = null;
  // A soft round dot for weather particles (points are squares without one).
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  function weather(kind = 'clear') {
    if (!WEATHER.includes(kind)) throw new Error(`Oomba3D: weather() takes ${WEATHER.join(', ')}`);
    weatherKind = kind;
    if (rain) { scene.remove(rain.points); rain.points.geometry.dispose(); rain.points.material.dispose(); rain = null; }
    syncSettings();
    if (kind === 'clear' || motionOff || !effectsOn) return kind;
    const w = WEATHER_LOOK[kind], n = Math.round(w.count * LEVELS[level].particles);
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c1 = new THREE.Color(w.color), c2 = new THREE.Color(w.alt || w.color);
    for (let i = 0; i < n; i++) { pos.set([(rand() - 0.5) * 60, rand() * 30 - 8, (rand() - 0.5) * 60], i * 3); (rand() < 0.5 ? c1 : c2).toArray(col, i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: w.size, map: dot, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    points.frustumCulled = false; scene.add(points);
    rain = { points, w, n };
    return kind;
  }
  const centre = new THREE.Vector3();
  function stepWeather(dt, t) {
    if (!rain) return;
    const { points, w, n } = rain, a = points.geometry.attributes.position, p = a.array;
    centre.copy(follow ? follow.target.position : camera.position);
    points.position.set(centre.x, centre.y, centre.z);
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      p[k + 1] -= w.fall * dt; p[k] += Math.sin(t * 0.8 + i) * w.drift * dt;
      if (p[k + 1] < -8) p[k + 1] += 30; else if (p[k + 1] > 22) p[k + 1] -= 30;
    }
    a.needsUpdate = true;
    if (w.twinkle) points.material.opacity = 0.6 + Math.sin(t * 6) * 0.3;
  }

  // ---- HUD and the gear button (graphics level and weather effects, for this game only)
  let effectsOn = true;
  const hud = document.createElement('div'); hud.className = 'o3-hud';
  hud.innerHTML = '<style>' + CSS + '</style><div class="o3-top"><span class="o3-pill o3-q" role="status"></span><span class="o3-pill o3-score" hidden>0</span></div><div class="o3-toast" role="status" aria-live="polite"></div>'
    + (settings ? '<button class="o3-gear" type="button" aria-label="Settings" aria-expanded="false">&#9881;</button><div class="o3-set" hidden><b>Graphics</b><div class="o3-row" data-set="graphics"><button type="button" data-v="auto">Auto</button><button type="button" data-v="low">Fast</button><button type="button" data-v="medium">Balanced</button><button type="button" data-v="high">Beautiful</button></div><b>Weather effects</b><div class="o3-row" data-set="effects"><button type="button" data-v="on">On</button><button type="button" data-v="off">Off</button></div></div>' : '');
  parent.append(hud);
  const $ = s => hud.querySelector(s);
  function syncSettings() {
    if (!settings) return;
    for (const b of hud.querySelectorAll('[data-set="graphics"] button')) b.setAttribute('aria-pressed', String(b.dataset.v === mode));
    for (const b of hud.querySelectorAll('[data-set="effects"] button')) b.setAttribute('aria-pressed', String((b.dataset.v === 'on') === effectsOn));
  }
  if (settings) {
    const gear = $('.o3-gear'), panel = $('.o3-set');
    gear.addEventListener('click', () => { panel.hidden = !panel.hidden; gear.setAttribute('aria-expanded', String(!panel.hidden)); });
    panel.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.parentElement.dataset.set === 'graphics') graphicsLevel(b.dataset.v);
      else { effectsOn = b.dataset.v === 'on'; weather(weatherKind); }
      b.blur();   // keys go back to the game
    });
  }

  // ---- loading (one cache per file; heroes get their own skeleton copy)
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const cache = new Map();
  const loadModel = file => { if (!manifest.files[file]) throw new Error(`Oomba3D: ${file} is not in ${theme} ${version}`); if (!cache.has(file)) cache.set(file, loader.loadAsync(base + file)); return cache.get(file); };
  const findPiece = id => { const p = (manifest.pieces || []).find(p => p.id === id); if (!p) throw new Error(`Oomba3D: no piece "${id}" in ${theme}. Pieces: ${(manifest.pieces || []).map(p => p.id).join(', ')}`); return p; };
  // Ink outlines: a slightly bigger, back-facing ink copy of each mesh (cheap: no extra render pass).
  const inkMat = new THREE.MeshBasicMaterial({ color: '#141414', side: THREE.BackSide });
  inkMat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * 0.025;'); };
  const ink = o => {
    if (!outline) return o;
    const meshes = []; o.traverse(c => { if (c.isMesh && !c.userData.ink) meshes.push(c); });
    for (const m of meshes) {
      const hull = m.isSkinnedMesh ? m.clone() : new THREE.Mesh(m.geometry, inkMat);
      hull.material = inkMat; hull.userData.ink = true; hull.castShadow = false; hull.receiveShadow = false;
      if (m.isSkinnedMesh) { hull.position.copy(m.position); hull.quaternion.copy(m.quaternion); hull.scale.copy(m.scale); m.parent.add(hull); } else m.add(hull);
    }
    return o;
  };
  const shade = o => { o.traverse(c => { if (c.isMesh && !c.userData.ink) { c.castShadow = true; c.receiveShadow = true; } }); return ink(o); };
  const moves = manifest.moves ? await loadModel(manifest.moves.file) : null;
  const clipName = n => (manifest.moves?.clips || {})[n] || n;

  // ---- sound: theme files through Web Audio, plus a made-in-code cheer and "wrong"; nothing plays before a tap or key
  let ctx = null; const buffers = new Map();
  const unlock = () => { if (!ctx) { try { ctx = new AudioContext(); } catch { ctx = null; } } if (ctx && ctx.state === 'suspended') ctx.resume(); };
  addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
  const fileFor = name => (manifest.sounds || []).find(s => s.id === name)?.file;
  const tone = (notes, type) => { const t0 = ctx.currentTime; notes.forEach(([f, at, len]) => { const o = ctx.createOscillator(), gn = ctx.createGain(); o.type = type; o.frequency.value = f; gn.gain.setValueAtTime(0.0001, t0 + at); gn.gain.exponentialRampToValueAtTime(0.18, t0 + at + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len); o.connect(gn).connect(ctx.destination); o.start(t0 + at); o.stop(t0 + at + len + 0.05); }); };
  function sound(name) {
    if (!ctx || ctx.state !== 'running') return;
    if (name === 'cheer') return tone([[523, 0, 0.15], [659, 0.12, 0.15], [784, 0.24, 0.3]], 'triangle');
    if (name === 'wrong') return tone([[220, 0, 0.18], [175, 0.16, 0.3]], 'square');
    const file = fileFor(name); if (!file) return;
    const play = buf => { const s = ctx.createBufferSource(), gn = ctx.createGain(); gn.gain.value = 0.5; s.buffer = buf; s.connect(gn).connect(ctx.destination); s.start(); };
    if (buffers.has(name)) { const b = buffers.get(name); if (b) play(b); return; }
    buffers.set(name, null);
    new THREE.FileLoader().setResponseType('arraybuffer').loadAsync(base + file).then(a => ctx.decodeAudioData(a)).then(b => { buffers.set(name, b); play(b); }, () => {});
  }

  // ---- the game object
  const solids = [];          // { box, object, onLand?, gone? }
  const updaters = [];
  let points = 0, follow = null, player = null, water = null;
  const camGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3();

  function toast(text, ms = 1400) { const t = $('.o3-toast'); t.textContent = String(text); t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms); }
  function score(add) { if (typeof add === 'number') { points += add; const s = $('.o3-score'); s.hidden = false; s.textContent = points; } return points; }
  function onUpdate(fn) { updaters.push(fn); }

  // outfit: a colour for the hero's cape and wizard hat (a different look for the same hero: '#66C792', 'gold' …).
  const OUTFIT_PART = /_Cape$|^Mage_Hat$/;
  async function hero(id, { x = 0, y = 0, z = 0, face = 0, outfit } = {}) {
    const h = (manifest.heroes || []).find(h => h.id === id);
    if (!h) throw new Error(`Oomba3D: no hero "${id}" in ${theme}. Heroes: ${(manifest.heroes || []).map(h => h.id).join(', ')}`);
    const g = await loadModel(h.file);
    const root = SkeletonUtils.clone(g.scene);
    if (outfit) { const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(outfit), roughness: 0.8 }); root.traverse(o => { if (o.isMesh && OUTFIT_PART.test(o.name)) o.material = mat; }); }
    shade(root);
    root.position.set(x, y, z); root.rotation.y = face; scene.add(root);
    const mixer = new THREE.AnimationMixer(root);
    let cur = null;
    const play = (move, { once = false, fade = 0.2 } = {}) => {
      const clip = moves && THREE.AnimationClip.findByName(moves.animations, clipName(move));
      if (!clip) return null;
      const a = mixer.clipAction(clip); if (cur === a) return a;
      a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once;
      if (cur) cur.crossFadeTo(a, fade, false); a.play(); cur = a; return a;
    };
    play('idle');
    updaters.push(dt => mixer.update(dt));
    return { id, name: h.name, object: root, position: root.position, play };
  }

  async function piece(id, { x = 0, y = 0, z = 0, scale = 1, turn = 0, solid = false } = {}) {
    const p = findPiece(id);
    const o = shade((await loadModel(p.file)).scene.clone(true));
    o.scale.setScalar(scale); o.position.set(x, y, z); o.rotation.y = turn; scene.add(o);
    if (!solid) return { object: o };
    o.updateMatrixWorld(true);
    const s = { object: o, box: new THREE.Box3().setFromObject(o), top: () => s.box.max.y, onLand: null, gone: false };
    solids.push(s);
    s.sink = () => { s.gone = true; if (motionOff) { o.visible = false; return; } const t0 = performance.now(); const go = () => { const k = (performance.now() - t0) / 900; o.position.y -= 0.25; o.rotation.z += 0.03; if (k < 1) requestAnimationFrame(go); else o.visible = false; }; go(); };
    return s;
  }
  const island = (opts = {}) => piece(opts.piece || 'island-round', { scale: 3, ...opts, solid: true });

  // A sea: a big plane with gentle waves made in the shader (no texture), coloured from the sky.
  function waterAt({ y = -6, color = '#3fa7d6', size = 600 } = {}) {
    if (water) scene.remove(water);
    const geo = new THREE.PlaneGeometry(size, size, 96, 96); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      fog: true, transparent: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { t: { value: 0 }, deep: { value: new THREE.Color(color) }, sky: { value: new THREE.Color(skyUniforms.mid.value) }, moving: { value: motionOff ? 0 : 1 } }]),
      vertexShader: '#include <fog_pars_vertex>\nuniform float t; uniform float moving; varying float vH; varying vec3 vW;\nvoid main(){ vec3 p = position; float h = (sin(p.x*.08+t*1.1)+sin(p.z*.11+t*.8)*.7+sin((p.x+p.z)*.05+t*.6)*.5)*moving; p.y += h*.45; vH = h; vec4 wp = modelMatrix*vec4(p,1.); vW = wp.xyz; vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
      fragmentShader: '#include <fog_pars_fragment>\nuniform vec3 deep; uniform vec3 sky; varying float vH; varying vec3 vW;\nvoid main(){ vec3 c = mix(deep, sky, .35+.15*vH); c += vec3(.9,.97,1.)*smoothstep(1.3,1.9,vH)*.35; gl_FragColor = vec4(c,.92);\n#include <fog_fragment>\n}',
    });
    water = new THREE.Mesh(geo, mat); water.position.y = y; water.receiveShadow = false; water.userData.color = color; scene.add(water);
    if (seaTint) mat.uniforms.deep.value.set(seaTint);
    return { object: water, y };
  }

  function followCamera(target, { distance = 10, height = 5.5 } = {}) { follow = { target, distance, height }; }

  // Keyboard (arrows / WASD / Space) and, on touch screens, an on-screen pad: simple, kind platform physics
  // (wide landings, quick respawn).
  const keys = {};
  function controls(h, { speed = 7, jump = 9.5, gravity = 24, fallY = -12, spawn, tryAgain = 'Try again!' } = {}) {
    player = h;
    const home = (spawn ? new THREE.Vector3(spawn.x, spawn.y, spawn.z) : h.position.clone());
    addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); });
    addEventListener('keyup', e => { keys[e.code] = false; });
    const pad = document.createElement('div'); pad.className = 'o3-pad';
    pad.innerHTML = '<div class="o3-dpad"><span></span><button data-k="ArrowUp" aria-label="Forward">&#9650;</button><span></span><button data-k="ArrowLeft" aria-label="Left">&#9664;</button><button data-k="ArrowDown" aria-label="Back">&#9660;</button><button data-k="ArrowRight" aria-label="Right">&#9654;</button></div><button class="o3-jump" data-k="Space" aria-label="Jump">&#11014;</button>';
    for (const b of pad.querySelectorAll('button')) { const k = b.dataset.k, on = e => { e.preventDefault(); unlock(); keys[k] = true; }, off = () => { keys[k] = false; }; b.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off); }
    hud.append(pad);
    const vel = new THREE.Vector3(); let onGround = false;
    const under = p => { let best = null; for (const s of solids) { if (s.gone) continue; const b = s.box; if (p.x > b.min.x - 0.2 && p.x < b.max.x + 0.2 && p.z > b.min.z - 0.2 && p.z < b.max.z + 0.2 && p.y >= b.max.y - 0.6 && (!best || b.max.y > best.box.max.y)) best = s; } return best; };
    updaters.push(dt => {
      const p = h.position;
      const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), side = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      const move = new THREE.Vector3(side, 0, -fwd);
      if (move.lengthSq()) { move.normalize().multiplyScalar(speed); h.object.rotation.y = Math.atan2(move.x, move.z); }
      vel.x = move.x; vel.z = move.z;
      if (onGround && keys.Space) { vel.y = jump; onGround = false; sound('jump'); h.play('jump', { once: true, fade: 0.1 }); }
      vel.y -= gravity * dt; p.addScaledVector(vel, dt);
      const g = under(p);
      if (g && vel.y <= 0 && p.y <= g.box.max.y + 0.05) { if (!onGround) { sound('land'); if (g.onLand) g.onLand(h); } p.y = g.box.max.y; vel.y = 0; onGround = true; }
      else if (!g || p.y > g.box.max.y + 0.05) onGround = false;
      if (onGround && !h.busy) h.play(move.lengthSq() ? 'run' : 'idle');
      if (p.y < fallY) { sound('fall'); p.copy(home); vel.set(0, 0, 0); if (tryAgain) toast(tryAgain); }
    });
    return { keys };
  }

  function coins(spots, { piece: id = 'coin', scale = 2.6, value = 1, onCollect } = {}) {
    const list = [];
    Promise.all(spots.map(([x, y, z]) => piece(id, { x, y, z, scale }).then(c => list.push(c))));
    updaters.push(dt => {
      for (const c of list) {
        if (!c.object.visible) continue;
        if (!motionOff) c.object.rotation.y += dt * 3;
        if (player && c.object.position.distanceTo(player.position.clone().setY(player.position.y + 1)) < 1.4) { c.object.visible = false; score(value); sound('coin'); if (onCollect) onCollect(c); }
      }
    });
    return { left: () => list.filter(c => c.object.visible).length };
  }

  // A question: the answers float as big tokens over their own islands; landing on the right one cheers, a wrong one sinks.
  async function askQuestion({ question, answers, correct, at = { x: 0, y: 3, z: -38 }, spacing = 8, prompt = 'Jump to the answer:', notIt = a => `Not ${a}! Try another island`, rightText = 'Correct! +5', bonus = 5, onRight, onWrong } = {}) {
    $('.o3-q').textContent = `${prompt} ${question}`.trim();
    let done = false;
    const made = await Promise.all(answers.map(async (ans, i) => {
      const x = at.x + (i - (answers.length - 1) / 2) * spacing;
      const s = await island({ x, y: at.y + 0.45, z: at.z, scale: 1.3 });
      const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g2 = cv.getContext('2d');
      g2.fillStyle = '#FFFDF2'; g2.strokeStyle = '#141414'; g2.lineWidth = 14; g2.beginPath(); g2.arc(128, 128, 112, 0, Math.PI * 2); g2.fill(); g2.stroke();
      const label = String(ans); g2.fillStyle = '#141414'; g2.font = `900 ${label.length > 3 ? 72 : 120}px system-ui, sans-serif`; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(label, 128, 136);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, toneMapped: false, transparent: true }));
      const baseY = s.top() + 3.6; sprite.scale.set(2.4, 2.4, 1); sprite.position.set(x, baseY, at.z); scene.add(sprite);
      updaters.push(() => { if (!motionOff && !s.gone) sprite.position.y = baseY + Math.sin(clock.elapsedTime * 2 + i) * 0.25; });
      s.onLand = h => {
        if (done || s.gone) return;
        if (ans === correct) { done = true; sprite.material.color.set(look.hud?.correct || '#9df5b9'); score(bonus); sound('coin'); celebrate(h, rightText); if (onRight) onRight(); }
        else { sound('wrong'); toast(notIt(ans)); s.sink(); sprite.visible = false; if (onWrong) onWrong(ans); }
      };
      return s;
    }));
    return { islands: made, answered: () => done };
  }

  function celebrate(h, text = 'You did it!') {
    sound('cheer'); toast(text, 2200);
    if (h && h.play) { h.busy = true; h.play('cheer', { once: true }); setTimeout(() => { h.busy = false; }, 1600); }
    if (motionOff || !LEVELS[level].confetti || !h) return;
    const bits = new THREE.Group(); const colors = ['#FFD23F', '#66C792', '#FFFDF2', '#1F9D63'];
    const geo = new THREE.BoxGeometry(0.18, 0.18, 0.05);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % 4] })); m.position.copy(h.position).add(new THREE.Vector3(0, 2.5, 0)); m.userData.v = new THREE.Vector3((rand() - 0.5) * 6, 5 + rand() * 4, (rand() - 0.5) * 6); bits.add(m); }
    scene.add(bits); let life = 1.6;
    const fn = dt => { life -= dt; for (const m of bits.children) { m.userData.v.y -= 12 * dt; m.position.addScaledVector(m.userData.v, dt); m.rotation.x += dt * 8; } if (life <= 0) { scene.remove(bits); updaters.splice(updaters.indexOf(fn), 1); } };
    updaters.push(fn);
  }

  // Real physics with Rapier (WebAssembly), loaded the first time a game asks for it. physics() -> { RAPIER, world, add }.
  // add(object, { type = 'dynamic' | 'fixed', shape = 'box' | 'ball', bounce = 0.3, friction = 0.8 }) makes a body
  // around the object (from its size) and keeps the object on it every frame.
  let phys = null;
  async function physics({ gravity = -24 } = {}) {
    if (phys) return phys;
    const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
    const linked = [];
    const add = (object, { type = 'dynamic', shape = 'box', bounce = 0.3, friction = 0.8 } = {}) => {
      object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(object), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const desc = (type === 'fixed' ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic()).setTranslation(mid.x, mid.y, mid.z).setRotation(object.quaternion);
      const body = world.createRigidBody(desc);
      const col = shape === 'ball' ? RAPIER.ColliderDesc.ball(Math.max(size.x, size.y, size.z) / 2) : RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
      world.createCollider(col.setRestitution(bounce).setFriction(friction), body);
      const offset = object.position.clone().sub(mid);
      if (type !== 'fixed') linked.push({ object, body, offset });
      return body;
    };
    let acc = 0;
    updaters.push(dt => {
      acc += dt;
      while (acc >= 1 / 60) { world.step(); acc -= 1 / 60; }
      for (const l of linked) { const t = l.body.translation(), r = l.body.rotation(); l.object.quaternion.set(r.x, r.y, r.z, r.w); l.object.position.set(t.x, t.y, t.z).add(l.offset.clone().applyQuaternion(l.object.quaternion)); }
    });
    phys = { RAPIER, world, add };
    return phys;
  }

  // ---- the loop, with the frame-rate watch that steps 'auto' graphics down a level
  const clock = new THREE.Clock(); let slow = 0, frames = 0, watchFrom = performance.now();
  sky(time);
  applyLevel();
  weather(weatherKind);
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 30), t = clock.elapsedTime;
    for (const fn of updaters.slice()) fn(dt);
    if (!motionOff) clouds.forEach((c, i) => { c.position.x += Math.sin(i) * dt * 0.3; });
    if (water) water.material.uniforms.t.value = t;
    stepWeather(dt, t);
    if (follow) {
      const p = follow.target.position;
      camGoal.set(p.x * 0.5, p.y + follow.height, p.z + follow.distance); lookGoal.set(p.x * 0.6, p.y + 1.6, p.z - 8);
      sun.position.copy(p).add(sunOffset); sun.target.position.copy(p);
      camera.position.lerp(camGoal, 0.08); camera.lookAt(lookGoal);
    }
    composer.render();
    // Two slow 3-second windows in a row (under 30 frames a second) step 'auto' graphics down one level.
    frames++; const now = performance.now();
    if (now - watchFrom > 3000) {
      if (mode === 'auto' && level !== 'low' && document.visibilityState === 'visible') { slow = frames * 1000 / (now - watchFrom) < 30 ? slow + 1 : 0; if (slow >= 2) { level = level === 'high' ? 'medium' : 'low'; slow = 0; applyLevel(); } }
      frames = 0; watchFrom = now;
    }
  });

  return {
    THREE, scene, camera, renderer, theme: manifest,
    get lowPower() { return level === 'low'; }, reducedMotion: motionOff,
    hero, world: { island, piece, water: waterAt }, followCamera, controls, coins, askQuestion, sound, celebrate, toast, score, onUpdate,
    graphics: graphicsLevel, sky, weather, physics,
  };
}
