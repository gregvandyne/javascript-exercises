// Oomba3D 1.2.0: the small, friendly 3D game library for Kit 2 themes (docs/kit2-api.md). An ES module loaded through
// the Kit 2 import map as 'oomba3d'. It loads one theme's art from /vendor/themes/<theme>/<version>/ (the only folder
// the game frame may fetch) and gives a game heroes, floating islands, water, a follow camera, keyboard and touch
// controls, coins, questions on answer islands, sounds, a celebration, time of day, weather, ink outlines, real physics
// (Rapier, loaded only when asked for) and graphics levels a player can change in the game (the gear button).
// Chromebook first: 'auto' graphics start at Fast on small devices and step down when the frame rate drops below 30;
// prefers-reduced-motion stops drifting, bobbing, weather and confetti. Shipped versions never change (kit2/SHIPPED.json).
// 1.1.0 adds: graphics(), sky(), weather(), world.water(), physics(), outlines, meshopt models. Everything in 1.0.0 works
// the same (lowPower: true is graphics: 'low').
// 1.2.0 adds animated creatures (docs/kit2-api.md): creature() with play, walkTo, follow, wander, followHero, onMeet and
// remove; school() (many animals moving together on one shared skeleton); a playable creature as the hero; flat-shaded
// materials with whole ink outlines, no ink on cut-out leaves; world.ground(); a piece's own clips; 'bubbles' weather and
// swim controls. Everything in 1.1.0 works the same: all of this is opt-in. Creatures are kind by construction: they are
// never solid, never push, chase, bite or hurt, the library plays no attack, hit or death clip, big animals walk slowly
// and no animal walks into the hero. On small devices only the nearest few animate and draw (CREATURE_LIMITS).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const VERSION = '1.2.0';
/** Everything a game may call on the object start() returns (docs/kit2-api.md lists exactly these). */
export const API = ['hero', 'world.island', 'world.piece', 'world.water', 'followCamera', 'controls', 'coins', 'askQuestion', 'sound', 'celebrate', 'toast', 'score', 'onUpdate', 'graphics', 'sky', 'weather', 'physics', 'creature', 'school', 'world.ground'];
export const GRAPHICS = ['auto', 'low', 'medium', 'high'];
export const TIMES = ['morning', 'day', 'sunset', 'night'];
export const WEATHER = ['clear', 'snow', 'rain', 'sparkles', 'leaves', 'bubbles'];
/** Creatures per graphics level: how many animate at once (the nearest on screen), how many are drawn, how many a school shows. */
export const CREATURE_LIMITS = { low: { moving: 6, shown: 10, school: 12 }, medium: { moving: 12, shown: 20, school: 20 }, high: { moving: 20, shown: 32, school: 30 } };
/** Clip names the library refuses to play, whatever a file holds (creatures are calm). */
export const NEVER_PLAYED = /attack|death|hit|punch|kick|shoot|gun|bite/i;
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
  bubbles: { color: '#eafcff', alt: '#bfeaff', size: 0.3, fall: -1.8, drift: 0.5, count: 420 },
};
// A creature's move, when its file has no such clip: the first of these it does have (then idle).
const CREATURE_ALIAS = { run: ['walk', 'stroll', 'swim'], walk: ['stroll', 'run', 'swim'], stroll: ['walk'], swim: ['swimFast', 'walk'], swimFast: ['swim'], jumpStart: ['jump'], jumpAir: ['jump'], jumpLand: ['land', 'jump'], cheer: ['jump'], eat: ['graze'], graze: ['eat'], look: ['idle'], wave: ['look', 'idle'], ready: ['idle'] };

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
.o3-swim{display:flex;flex-direction:column;align-items:center;gap:6px}
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
 * 'sparkles' | 'leaves' | 'bubbles'. outline: false (default) | true (ink outlines on heroes and pieces). settings: true (default)
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
  const loadModel = file => { if (!manifest.files[file]) throw new Error(`Oomba3D: ${file} is not in ${theme} ${version}`); if (!cache.has(file)) cache.set(file, loader.loadAsync(base + file).then(flatten)); return cache.get(file); };
  // Models the art pipeline marked flat (inkNormals: one smooth normal per corner, so the ink outline stays whole) are
  // drawn flat-shaded, as their makers drew them. No shipped 1.1.0 file carries the mark.
  const flatten = gl => { gl.scene.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m && m.userData && m.userData.flat && !m.flatShading) { m.flatShading = true; m.needsUpdate = true; } }); return gl; };
  const isCutOut = m => [].concat(m.material).some(x => x && x.alphaTest > 0);   // leaf cards: an ink copy would be a black rectangle
  const findPiece = id => { const p = (manifest.pieces || []).find(p => p.id === id); if (!p) throw new Error(`Oomba3D: no piece "${id}" in ${theme}. Pieces: ${(manifest.pieces || []).map(p => p.id).join(', ')}`); return p; };
  // Ink outlines: a slightly bigger, back-facing ink copy of each mesh (cheap: no extra render pass).
  const inkMat = new THREE.MeshBasicMaterial({ color: '#141414', side: THREE.BackSide });
  inkMat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * 0.025;'); };
  const ink = o => {
    if (!outline) return o;
    const meshes = []; o.traverse(c => { if (c.isMesh && !c.userData.ink && !isCutOut(c)) meshes.push(c); });
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
    const asHero = !h && (manifest.creatures || []).find(c => c.id === id);
    if (asHero && !asHero.playable) throw new Error(`Oomba3D: the ${asHero.name} cannot be the hero (it has no walk). Playable animals: ${(manifest.creatures || []).filter(c => c.playable).map(c => c.id).join(', ') || 'none'}`);
    if (asHero) return creatureHero(asHero, { x, y, z, face });
    if (!h) throw new Error(`Oomba3D: no hero "${id}" in ${theme}. Heroes: ${(manifest.heroes || []).map(h => h.id).concat((manifest.creatures || []).filter(c => c.playable).map(c => c.id)).join(', ')}`);
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
    const gl = await loadModel(p.file);
    const o = shade(gl.animations.length ? SkeletonUtils.clone(gl.scene) : gl.scene.clone(true));
    o.scale.setScalar(scale); o.position.set(x, y, z); o.rotation.y = turn; scene.add(o);
    // A piece with its own clips (a chest that opens): moves lists them, play(move) plays one (once, and it stays there).
    const own = gl.animations.filter(c => !NEVER_PLAYED.test(c.name));
    let play = () => null;
    if (own.length) {
      const mixer = new THREE.AnimationMixer(o); let cur = null;
      play = (move, { once = true, fade = 0.15 } = {}) => {
        const clip = own.find(c => c.name === move); if (!clip) return null;
        const a = mixer.clipAction(clip); a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once;
        if (cur && cur !== a) cur.crossFadeTo(a, fade, false); a.play(); cur = a;
        if (motionOff && once) { a.time = clip.duration; mixer.update(0); }   // reduced motion: straight to the end pose
        return a;
      };
      updaters.push(dt => { if (o.parent && cur) mixer.update(dt); });
    }
    const extra = { moves: own.map(c => c.name), play };
    if (!solid) return { object: o, ...extra };
    o.updateMatrixWorld(true);
    const s = { object: o, box: new THREE.Box3().setFromObject(o), top: () => s.box.max.y, onLand: null, gone: false, ...extra };
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

  // Ground the library makes (the animal and nature packs have none): one big flat-coloured field to stand on. hills
  // (a height) rolls the outer part up and down; the middle third stays level. Calling it again replaces the ground.
  let field = null;
  function ground({ x = 0, y = 0, z = 0, size = 120, color, hills = 0 } = {}) {
    if (field) { scene.remove(field.object); field.object.geometry.dispose(); field.gone = true; solids.splice(solids.indexOf(field), 1); }
    const seg = hills ? 72 : 1, geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
    const level = size * 0.17, rise = size * 0.2;
    const heightAt = (px, pz) => { if (!hills) return y; const k = Math.min(1, Math.max(0, (Math.hypot(px - x, pz - z) - level) / rise)); return y + hills * k * k * (0.5 + 0.25 * (Math.sin(px * 0.11) + Math.cos(pz * 0.13))); };
    if (hills) { const a = geo.attributes.position; for (let i = 0; i < a.count; i++) a.setY(i, heightAt(a.getX(i) + x, a.getZ(i) + z) - y); geo.computeVertexNormals(); }
    const o = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(color || look.ground || '#7cc46a'), roughness: 1, flatShading: !!hills }));
    o.position.set(x, y, z); o.receiveShadow = true; scene.add(o);
    field = { object: o, box: new THREE.Box3(new THREE.Vector3(x - size / 2, y - 1, z - size / 2), new THREE.Vector3(x + size / 2, y + Math.max(hills, 0), z + size / 2)), top: () => y, heightAt, onLand: null, gone: false };
    solids.push(field);
    return field;
  }

  // ---- creatures (1.2.0): animated animals with their own clips. Kind by construction: never solid, never pushing,
  // chasing or hurting; the only thing that happens between an animal and the hero is onMeet. Big animals are slow.
  const creatures = [];      // one state per creature and school: the single step below moves, animates and culls them
  const topOf = (s, px, pz) => (s.heightAt ? s.heightAt(px, pz) : s.box.max.y);
  const findCreature = id => { const c = (manifest.creatures || []).find(c => c.id === id); if (!c) throw new Error(`Oomba3D: no creature "${id}" in ${theme} ${version}. Creatures: ${(manifest.creatures || []).map(c => c.id).join(', ') || 'none in this world'}`); return c; };
  const groundAt = (px, pz, yNow) => { let best = null; for (const s of solids) { if (s.gone) continue; const b = s.box; if (px > b.min.x && px < b.max.x && pz > b.min.z && pz < b.max.z) { const t = topOf(s, px, pz); if (t <= yNow + 1.5 && (best === null || t > best)) best = t; } } return best; };
  const point = (a, b) => (a && typeof a === 'object' ? (Array.isArray(a) ? [a[0], a[a.length - 1], a.length > 2 ? a[1] : undefined] : [a.x, a.z, a.y]) : [a, b, undefined]);
  const turnTo = (o, want, most) => { let d = want - o.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); o.rotation.y += Math.max(-most, Math.min(most, d)); };

  // One animal in the scene with its own skeleton and mixer. Geometry, materials and clips are shared by every copy.
  async function rig(spec, { x = 0, y = 0, z = 0, face = 0, scale = 1 } = {}) {
    const gl = await loadModel(spec.file);
    const root = shade(SkeletonUtils.clone(gl.scene));
    root.scale.setScalar(scale); root.position.set(x, y, z); root.rotation.y = face; scene.add(root);
    const mixer = new THREE.AnimationMixer(root);
    const clips = new Map(gl.animations.filter(c => !NEVER_PLAYED.test(c.name)).map(c => [c.name, c]));
    const find = move => [move, ...(CREATURE_ALIAS[move] || [])].find(n => clips.has(n)) || null;
    let cur = null;
    const play = (move, { once = false, fade = 0.2, speed = 1 } = {}) => {
      const name = find(move), clip = clips.get(name || 'idle');
      if (!clip) return null;
      const a = mixer.clipAction(clip); a.timeScale = speed;
      if (cur !== a) { a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once; if (cur) cur.crossFadeTo(a, fade, false); a.play(); cur = a; }
      else if (once && !a.isRunning()) { a.reset(); a.play(); }
      return name ? a : null;   // a move this animal does not have plays idle and returns null
    };
    play('idle'); mixer.update(0);
    return { root, mixer, clips, find, play, pace: move => { const v = (spec.pace || {})[find(move)]; return v ? v * scale : 0; } };
  }

  async function creature(id, { x = 0, y = 0, z = 0, face = 0, scale = 1 } = {}) {
    const spec = findCreature(id), r = await rig(spec, { x, y, z, face, scale });
    const size = (spec.size || [1, 1.5, 2]).map(v => +(v * scale).toFixed(2)), large = size[1] >= 3 || size[2] >= 4.5;
    const kind = spec.kind || 'land', walks = !!r.find('walk'), hops = !walks && !!r.find('jump');
    // Calm speeds (the hero runs at 7): a big animal strolls at 1.4 and never goes faster than 2.5 by itself.
    // A hopper (no walk) covers less ground: 0.9 by itself, at most 3 when it trails the hero.
    const top = large ? 2.5 : hops ? 3 : 5, heelTop = large ? 5 : hops ? 3 : 7.5, stroll = hops ? 0.9 : Math.min(large ? 1.6 : 2.6, r.pace('walk') * 1.15 || (large ? 1.4 : 1.8));
    const calm = Math.max(1.6, size[2] * 0.6, large ? 3 : 0);   // how near it will walk to the hero
    const pace = s => Math.min(top, Math.max(0.3, s ?? stroll));
    const st = { mode: 'idle', y, wrote: y, speed: stroll, meets: [], done: null, auto: false, awake: true, mixer: r.mixer, r: Math.max(...size), d: 0, on: true };
    const end = ok => { const d = st.done; st.done = null; if (d) d(ok); };
    const go = (mode, more) => { end(false); Object.assign(st, { mode, wait: 0, path: null }, more); };
    const c = {
      id, name: spec.name, kind, object: r.root, position: r.root.position, moves: [...r.clips.keys()], size, large, playable: !!spec.playable,
      play: (move, o) => r.play(move, o),
      stop: () => { go('idle'); return c; },
      walkTo: (a, b, o) => { const pt = point(a, b), opt = (a && typeof a === 'object' ? b : o) || {}; return new Promise(res => { go('path', { path: [pt], at: 0, loop: false, speed: pace(opt.speed) }); st.done = res; }); },
      follow: (path, { speed, loop = false } = {}) => new Promise(res => { const pts = (path || []).map(q => point(q)); if (!pts.length) return res(false); go('path', { path: pts, at: 0, loop, speed: pace(speed) }); st.done = res; }),
      wander: (area = {}) => { go('wander', { home: [area.x ?? c.position.x, area.z ?? c.position.z], radius: Math.max(1, area.radius ?? 6), speed: pace(area.speed), wait: 0.4 + rand() * 2 }); return c; },
      followHero: (hero = player, { distance } = {}) => { if (!hero || !hero.position) throw new Error('Oomba3D: followHero() needs a hero (make one with g.hero first)'); go('heel', { heel: { hero, distance: Math.max(calm, distance ?? calm + 0.6), side: c.position.x < hero.position.x ? -1 : 1 } }); return c; },
      onMeet: (fn, { distance, hero } = {}) => { st.meets.push({ fn, distance: Math.max(1.5, distance ?? calm + 1), hero, near: false }); return c; },
      remove: () => { end(false); r.mixer.stopAllAction(); scene.remove(r.root); const i = creatures.indexOf(st); if (i >= 0) creatures.splice(i, 1); },
    };
    st.centre = () => c.position;
    st.show = on => { r.root.visible = on; };
    st.step = dt => {
      const p = c.position;
      if (p.y !== st.wrote) st.y = p.y;   // the game put it somewhere itself
      let t = null, speed = st.speed, arrive = 0.1;
      if (st.mode === 'heel') {
        // A companion walks at the hero's side (not behind, where it would stand between the hero and the camera), or
        // behind when there is no ground at the side (a narrow path of stepping stones).
        const hp = st.heel.hero.position, D = st.heel.distance, beside = groundAt(hp.x + st.heel.side * D, hp.z + 0.5, hp.y + 0.5) !== null;
        const gx = beside ? hp.x + st.heel.side * D : hp.x, gz = beside ? hp.z + 0.5 : hp.z + D, d = Math.hypot(gx - p.x, gz - p.z);
        if (d > (hops ? 16 : 26)) { p.x = gx; p.z = gz; st.y = hp.y; }   // left far behind (a long jump, a respawn): it joins the hero again, not by racing after
        else if (d > (st.auto ? 0.12 : 1)) { t = [gx, gz]; speed = Math.min(heelTop, Math.max(stroll, d * 2.2)); }
      } else if (st.mode === 'path') t = st.path[st.at];
      else if (st.mode === 'wander' && !motionOff) {   // strolls to a spot nearby, stops to eat or look around, then another
        if (st.wait > 0) { st.wait -= dt; if (st.wait <= 0) { const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * st.radius; st.path = [st.home[0] + Math.cos(a) * d, st.home[1] + Math.sin(a) * d]; } }
        else t = st.path;
      }
      let moving = false, hopY = 0;
      if (t) {
        const dx = t[0] - p.x, dz = t[1] - p.z, d = Math.hypot(dx, dz);
        if (t[2] !== undefined && kind !== 'land') st.y += Math.max(-speed * dt, Math.min(speed * dt, t[2] - st.y));
        if (d <= arrive + 1e-3) {
          if (st.mode === 'path' && ++st.at >= st.path.length) { if (st.loop) st.at = 0; else { st.mode = 'idle'; end(true); } }
          else if (st.mode === 'wander') { st.path = null; st.wait = 2 + rand() * 4; r.play(rand() < 0.6 ? 'eat' : 'look'); st.auto = false; }
        } else {
          // An animal with no walk (pig, sheep: idle and jump only) hops: it travels while it is in the air and stands
          // still between hops, so its feet never slide. With reduced motion it glides in its idle pose instead.
          // Calm: an animal never walks into the hero. When its next step would bring it nearer than its calm distance, it waits.
          const who = st.mode === 'heel' ? st.heel.hero : player, probe = Math.min(d - arrive, speed * dt);
          const near = (x1, z1) => Math.hypot(who.position.x - x1, who.position.z - z1);
          const blocked = !!who && Math.abs(who.position.y - st.y) < 4 && near(p.x + dx / d * probe, p.z + dz / d * probe) < calm && near(p.x + dx / d * probe, p.z + dz / d * probe) < near(p.x, p.z);
          let gait = 1;
          if (hops && !motionOff && !blocked) {
            const a = r.play('jump', { speed: 1 }), len = a ? a.getClip().duration : 1, [a0, a1] = spec.jumpAir || [0.2, 0.8];
            // jumpAir (from the theme) is the part of the clip in which the animal is off the ground, lifted by the clip itself.
            if (a) { a.timeScale = len / 1.1; const ph = (a.time / len) % 1, air = ph > a0 && ph < a1; gait = air ? 1 / (a1 - a0) : 0; hopY = air && !spec.jumpAir ? Math.sin(Math.PI * (ph - a0) / (a1 - a0)) * Math.min(0.6, size[1] * 0.28) : 0; }
          }
          const step = Math.min(d - arrive, speed * dt * gait), nx = p.x + dx / d * step, nz = p.z + dz / d * step;
          if (!blocked) {
            p.x = nx; p.z = nz; moving = true;
            turnTo(r.root, Math.atan2(dx, dz), motionOff ? 9 : (large ? 2.5 : 6) * dt);
            if (!hops) { const run = !motionOff && speed > stroll * 1.7 && r.find('run') !== r.find('walk'), move = walks && !motionOff ? (run ? 'run' : 'walk') : 'idle', pc = r.pace(move); r.play(move, { speed: pc ? Math.min(2.5, Math.max(0.4, speed / pc)) : 1 }); }
            st.auto = true;
          }
        }
      }
      if (!moving && st.auto) { r.play('idle'); st.auto = false; }
      if (kind === 'land') { const gy = groundAt(p.x, p.z, st.y); if (gy !== null) st.y += Math.max(-12 * dt, Math.min(12 * dt, gy - st.y)); else if (st.mode === 'heel') st.y += (st.heel.hero.position.y - st.y) * Math.min(1, dt * 4); }
      p.y = st.wrote = st.y + hopY;
      for (const m of st.meets) {
        const h = m.hero || player; if (!h) continue;
        const d = Math.hypot(h.position.x - p.x, h.position.z - p.z, h.position.y - st.y);
        if (d < m.distance && !m.near) { m.near = true; m.fn(h, c); } else if (d > m.distance * 1.4) m.near = false;
      }
    };
    creatures.push(st);
    return c;
  }

  // A playable animal: g.hero('horse'). Its own clips do the hero's moves: idle, walk, run and jump are its own, the jump
  // parts and cheer are its jump, anything else is idle. Run and walk keep step with how fast it goes.
  async function creatureHero(spec, at) {
    const r = await rig(spec, at);
    const h = { id: spec.id, name: spec.name, object: r.root, position: r.root.position, creature: true, moves: [...r.clips.keys()], size: spec.size, speed: 7 };
    h.play = (move, o = {}) => {
      const pc = move === 'run' || move === 'walk' ? r.pace(move) : 0;
      const a = r.play(move, { ...o, speed: pc ? Math.min(2.2, Math.max(0.5, (move === 'walk' ? h.speed * 0.45 : h.speed) / pc)) : 1 });
      // A jump under g.controls: the clip's own crouch is skipped and its time in the air is fitted to the hero's, so it lands when the hero lands.
      if (a && h.airtime && spec.jumpAir && /^jump/.test(move) && r.find(move) === 'jump') { const len = a.getClip().duration, [a0, a1] = spec.jumpAir; a.time = a0 * len; a.timeScale = (a1 - a0) * len / h.airtime; }
      return a;
    };
    updaters.push(dt => r.mixer.update(dt));
    return h;
  }

  // Many of one animal moving together (fish in a shoal, sheep in a flock) for the price of one: they share ONE skeleton
  // and ONE animation, and each is only a mesh. Water animals circle at different depths; land animals that can walk
  // circle on the ground; ones that cannot (and everyone, with reduced motion) stand together.
  async function school(id, n = 8, { around = { x: 0, y: 0, z: 0 }, radius = 5, speed, scale = 1 } = {}) {
    const spec = findCreature(id), gl = await loadModel(spec.file);
    n = Math.max(1, Math.min(40, Math.floor(n) || 1));
    const puppet = SkeletonUtils.clone(gl.scene); scene.add(puppet);   // the skeleton lives here, at the origin, unseen
    const skins = []; puppet.traverse(o => { if (o.isSkinnedMesh) skins.push(o); });
    for (const s of skins) s.visible = false;
    const mixer = new THREE.AnimationMixer(puppet), clips = gl.animations.filter(c => !NEVER_PLAYED.test(c.name));
    const water = (spec.kind || 'land') !== 'land', gait = clips.find(c => c.name === (water ? 'swim' : 'walk')) || clips.find(c => ['swim', 'walk', 'stroll'].includes(c.name));
    const moving = !motionOff && !!gait, going = speed ?? (water ? 1.6 : 1.2), pc = gait && (spec.pace || {})[gait.name];
    const clip = (moving && gait) || clips.find(c => c.name === 'idle') || clips[0];
    if (clip) { const a = mixer.clipAction(clip); a.timeScale = moving && pc ? Math.min(2.5, Math.max(0.4, going / (pc * scale))) : 1; a.play(); mixer.update(0); }
    const centre = new THREE.Vector3(around.x || 0, around.y || 0, around.z || 0), members = [];
    for (let i = 0; i < n; i++) {
      const o = new THREE.Group();
      for (const s of skins) for (const mat of outline && !isCutOut(s) ? [s.material, inkMat] : [s.material]) {
        const m = new THREE.SkinnedMesh(s.geometry, mat); m.bindMode = 'detached'; m.bind(s.skeleton, s.bindMatrix); m.applyMatrix4(s.bindMatrix);
        if (mat === inkMat) m.userData.ink = true; else { m.castShadow = true; m.receiveShadow = true; }
        o.add(m);
      }
      o.scale.setScalar(scale * (0.85 + rand() * 0.3)); scene.add(o);
      members.push({ o, a: (i / n) * Math.PI * 2 + rand() * 0.5, r: radius * (0.35 + 0.65 * rand()), y: water ? (rand() - 0.5) * radius * 0.5 : 0, k: 0.8 + rand() * 0.4 });
    }
    const st = { t: 0, meets: [], awake: true, mixer, r: radius + Math.max(...(spec.size || [2])) * scale, d: 0, on: true, centre: () => centre };
    st.show = on => { const most = CREATURE_LIMITS[level].school; members.forEach((m, i) => { m.o.visible = on && i < most; }); };
    const place = () => {
      for (const [i, m] of members.entries()) {
        const a = m.a + (moving ? st.t * going * m.k / m.r : 0), px = centre.x + Math.cos(a) * m.r, pz = centre.z + Math.sin(a) * m.r;
        const py = water ? centre.y + m.y + (moving ? Math.sin(st.t * 0.7 + i) * 0.3 : 0) : (groundAt(px, pz, centre.y + 2) ?? centre.y);
        m.o.position.set(px, py, pz); m.o.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
      }
    };
    st.step = dt => {
      st.t += dt; if (moving || st.placed !== centre.x + centre.y * 7 + centre.z * 13) { place(); st.placed = centre.x + centre.y * 7 + centre.z * 13; }
      for (const m of st.meets) { const h = m.hero || player; if (!h) continue; const d = h.position.distanceTo(centre); if (d < m.distance && !m.near) { m.near = true; m.fn(h, sc); } else if (d > m.distance * 1.4) m.near = false; }
    };
    const sc = {
      id, name: spec.name, kind: spec.kind || 'land', count: n, objects: members.map(m => m.o), position: centre,
      onMeet: (fn, { distance, hero } = {}) => { st.meets.push({ fn, distance: distance ?? radius + 2, hero, near: false }); return sc; },
      remove: () => { mixer.stopAllAction(); scene.remove(puppet); for (const m of members) scene.remove(m.o); const i = creatures.indexOf(st); if (i >= 0) creatures.splice(i, 1); },
    };
    place(); creatures.push(st);
    return sc;
  }

  // Every frame: move each creature, then (five times a second) choose who animates and who is drawn. Only creatures on
  // screen animate, the nearest first, up to the level's limit; past the drawing limit the farthest are hidden.
  const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), ball = new THREE.Sphere(); let cullAt = 0;
  updaters.push(dt => {
    if (!creatures.length) return;
    for (const st of creatures.slice()) st.step(dt);
    if (performance.now() >= cullAt) {
      cullAt = performance.now() + 200;
      camera.updateMatrixWorld(); projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projView);
      const lim = CREATURE_LIMITS[level], seen = [];
      for (const st of creatures) { ball.center.copy(st.centre()); ball.center.y += st.r * 0.4; ball.radius = st.r; st.d = camera.position.distanceTo(ball.center); st.on = frustum.intersectsSphere(ball); if (st.on) seen.push(st); }
      seen.sort((a, b) => a.d - b.d);
      for (const st of creatures) { const i = seen.indexOf(st); st.awake = i >= 0 && i < lim.moving; st.show(i < lim.shown); }
    }
    for (const st of creatures) if (st.awake) st.mixer.update(dt);
  });

  function followCamera(target, { distance = 10, height = 5.5 } = {}) { follow = { target, distance, height }; }

  // Keyboard (arrows / WASD / Space) and, on touch screens, an on-screen pad: simple, kind platform physics
  // (wide landings, quick respawn).
  const keys = {};
  function controls(h, { speed = 7, jump = 9.5, gravity = 24, fallY = -12, spawn, tryAgain = 'Try again!', swim = false, floor, ceiling } = {}) {
    player = h; if (h.creature) { h.speed = speed; h.airtime = 2 * jump / gravity; }
    const home = (spawn ? new THREE.Vector3(spawn.x, spawn.y, spawn.z) : h.position.clone());
    addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); });
    addEventListener('keyup', e => { keys[e.code] = false; });
    const pad = document.createElement('div'); pad.className = 'o3-pad';
    pad.innerHTML = '<div class="o3-dpad"><span></span><button data-k="ArrowUp" aria-label="Forward">&#9650;</button><span></span><button data-k="ArrowLeft" aria-label="Left">&#9664;</button><button data-k="ArrowDown" aria-label="Back">&#9660;</button><button data-k="ArrowRight" aria-label="Right">&#9654;</button></div>' + (swim ? '<div class="o3-swim"><button class="o3-jump" data-k="Space" aria-label="Swim up">&#11014;</button><button data-k="KeyQ" aria-label="Swim down">&#11015;</button></div>' : '<button class="o3-jump" data-k="Space" aria-label="Jump">&#11014;</button>');
    for (const b of pad.querySelectorAll('button')) { const k = b.dataset.k, on = e => { e.preventDefault(); unlock(); keys[k] = true; }, off = () => { keys[k] = false; }; b.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off); }
    hud.append(pad);
    const vel = new THREE.Vector3(); let onGround = false;
    const under = p => { let best = null, bt = 0; for (const s of solids) { if (s.gone) continue; const b = s.box; if (p.x > b.min.x - 0.2 && p.x < b.max.x + 0.2 && p.z > b.min.z - 0.2 && p.z < b.max.z + 0.2) { const t = topOf(s, p.x, p.z); if (p.y >= t - 0.6 && (!best || t > bt)) { best = s; bt = t; } } } return best; };
    updaters.push(dt => {
      const p = h.position;
      const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), side = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      const move = new THREE.Vector3(side, 0, -fwd);
      if (move.lengthSq()) { move.normalize().multiplyScalar(speed); h.object.rotation.y = Math.atan2(move.x, move.z); }
      vel.x = move.x; vel.z = move.z;
      if (swim) {   // under water: no falling. Space (or E) swims up, Q (or Shift) down; let go and you sink very slowly
        const up = keys.Space || keys.KeyE, down = keys.KeyQ || keys.ShiftLeft || keys.ShiftRight;
        vel.y += ((up ? 4.5 : down ? -4.5 : -0.4) - vel.y) * Math.min(1, dt * 4); p.addScaledVector(vel, dt);
        const g = under(p), lo = Math.max(g ? topOf(g, p.x, p.z) : -Infinity, floor ?? -Infinity);
        if (p.y < lo) { p.y = lo; vel.y = Math.max(vel.y, 0); }
        if (ceiling !== undefined && p.y > ceiling) { p.y = ceiling; vel.y = Math.min(vel.y, 0); }
        const going = move.lengthSq() || up || down;
        if (!h.busy && !(going && h.play('swim'))) h.play(going ? 'walk' : 'idle');
        if (p.y < fallY) { p.copy(home); vel.set(0, 0, 0); if (tryAgain) toast(tryAgain); }
        return;
      }
      if (onGround && keys.Space) { vel.y = jump; onGround = false; sound('jump'); h.play('jump', { once: true, fade: 0.1 }); }
      vel.y -= gravity * dt; p.addScaledVector(vel, dt);
      const g = under(p), gt = g ? topOf(g, p.x, p.z) : 0;
      if (g && vel.y <= 0 && p.y <= gt + 0.05) { if (!onGround) { sound('land'); if (g.onLand) g.onLand(h); } p.y = gt; vel.y = 0; onGround = true; }
      else if (!g || p.y > gt + 0.05) onGround = false;
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
    hero, world: { island, piece, water: waterAt, ground }, followCamera, controls, coins, askQuestion, sound, celebrate, toast, score, onUpdate,
    graphics: graphicsLevel, sky, weather, physics, creature, school,
  };
}
