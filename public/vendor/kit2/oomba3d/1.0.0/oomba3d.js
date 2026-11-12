// Oomba3D 1.0.0: the small, friendly 3D game library for Kit 2 themes (docs/kit2-api.md). An ES module loaded through
// the Kit 2 import map as 'oomba3d'. It loads one theme's art from /vendor/themes/<theme>/<version>/ (the only folder
// the game frame may fetch) and gives a game heroes, floating islands, a follow camera, keyboard and touch controls,
// coins, questions on answer islands, sounds and a celebration. Chromebook first: a low-power mode (no glow, no
// shadows, fewer clouds, pixel ratio 1) switches on for small devices or when the frame rate drops below 30, and
// prefers-reduced-motion stops drifting, bobbing and confetti. Shipped versions never change (kit2/SHIPPED.json).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const VERSION = '1.0.0';
/** Everything a game may call on the object start() returns (docs/kit2-api.md lists exactly these). */
export const API = ['hero', 'world.island', 'world.piece', 'followCamera', 'controls', 'coins', 'askQuestion', 'sound', 'celebrate', 'toast', 'score', 'onUpdate'];
export { THREE };

const CSS = `.o3-hud{position:fixed;inset:0;pointer-events:none;font-family:"Bricolage Grotesque",system-ui,sans-serif;color:#141414}
.o3-top{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));left:0;right:0;display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;padding:0 12px}
.o3-pill{background:#FFFDF2;border:3px solid #141414;border-radius:999px;padding:8px 16px;font-weight:800;font-size:18px;box-shadow:0 4px 0 #141414}
.o3-q{background:#FFD23F;font-size:22px}.o3-q:empty,.o3-score[hidden]{display:none}
.o3-toast{position:absolute;top:62%;left:50%;transform:translate(-50%,-50%) scale(.6);opacity:0;transition:.25s;white-space:nowrap;font-weight:900;font-size:clamp(28px,7vw,48px);color:#FFFDF2;-webkit-text-stroke:3px #141414;paint-order:stroke}
.o3-toast.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.o3-pad{position:absolute;bottom:calc(14px + env(safe-area-inset-bottom,0px));left:max(16px,env(safe-area-inset-left,0px));right:max(16px,env(safe-area-inset-right,0px));display:flex;justify-content:space-between;align-items:flex-end}
.o3-dpad{display:grid;grid-template-columns:repeat(3,56px);grid-template-rows:repeat(2,56px);gap:6px}
.o3-pad button{pointer-events:auto;touch-action:none;width:56px;height:56px;border-radius:16px;border:3px solid #141414;background:#FFFDF2;color:#141414;font:900 22px system-ui,sans-serif;box-shadow:0 4px 0 #141414}
.o3-pad .o3-jump{width:92px;height:92px;border-radius:50%;background:#FFD23F;font-size:18px}
.o3-pad button:active{transform:translateY(3px);box-shadow:0 1px 0 #141414}
@media (hover:hover) and (pointer:fine){.o3-pad{display:none}}
@media (prefers-reduced-motion:reduce){.o3-toast{transition:none}}`;

// A small seeded random, so a scene looks the same every time (and in screenshots).
const seeded = (s = 7) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

/**
 * start({ theme, version, lowPower?, reducedMotion?, parent? }) -> Promise<game>
 * theme/version name a shipped theme (/vendor/themes/<theme>/<version>/). lowPower: true | false | 'auto' (default).
 */
export async function start({ theme, version, lowPower = 'auto', reducedMotion, parent = document.body } = {}) {
  if (!/^[a-z0-9-]+$/.test(String(theme)) || !/^\d+\.\d+\.\d+$/.test(String(version))) throw new Error('Oomba3D: start() needs a theme and a version, like { theme: "sky-islands", version: "1.0.1" }');
  const base = `/vendor/themes/${theme}/${version}/`;
  const manifest = await new THREE.FileLoader().setResponseType('json').loadAsync(base + 'theme.json');
  const look = manifest.look || {};
  const motionOff = reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  let low = lowPower === 'auto' ? ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4) : !!lowPower;
  const rand = seeded();

  // ---- renderer, sky, light, glow
  const renderer = new THREE.WebGLRenderer({ antialias: !low });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = look.exposure ?? 1;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  parent.prepend(renderer.domElement);
  renderer.domElement.style.display = 'block';
  const scene = new THREE.Scene();
  const sky = look.sky || { top: '#5fb8ff', middle: '#bfe6ff', bottom: '#fff4d6' };
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(sky.top) }, mid: { value: new THREE.Color(sky.middle) }, bottom: { value: new THREE.Color(sky.bottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix*vec4(position,1.)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vP,1.); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0. ? mix(mid, top, pow(h, .6)) : mix(mid, bottom, pow(-h, .5)); gl_FragColor = vec4(c, 1.); }',
  })));
  if (look.fog) scene.fog = new THREE.Fog(look.fog.color, look.fog.near, look.fog.far);
  const hemi = look.hemisphere || { sky: '#dff3ff', ground: '#7a8f5a', intensity: 1.1 };
  scene.add(new THREE.HemisphereLight(hemi.sky, hemi.ground, hemi.intensity));
  const sun = new THREE.DirectionalLight(look.sun?.color || '#fff1d6', look.sun?.intensity ?? 2.6);
  sun.position.set(18, 30, 12);
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const glow = look.glow || {};
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), glow.strength ?? 0.12, glow.radius ?? 0.4, glow.threshold ?? 0.98);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const clouds = [];
  function applyPower() {
    renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !low; sun.castShadow = !low;
    bloom.enabled = !low && !!look.glow;
    clouds.forEach((c, i) => { c.visible = !low || i % 3 === 0; });
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    resize();
  }
  function resize() {
    const w = parent === document.body ? innerWidth : parent.clientWidth, h = parent === document.body ? innerHeight : parent.clientHeight;
    camera.aspect = w / Math.max(h, 1);
    camera.fov = camera.aspect < 1 ? Math.min(78, 50 / Math.max(camera.aspect, 0.45) * 0.8) : 50;   // tall phones see more ground
    camera.updateProjectionMatrix();
    renderer.setSize(w, h); composer.setSize(w, h);
  }
  addEventListener('resize', resize);

  // ---- soft clouds: a sea below and a few above
  const cloudMat = new THREE.MeshStandardMaterial({ color: look.clouds?.color || '#ffffff', roughness: 1, emissive: look.clouds?.emissive || '#e8f4ff', emissiveIntensity: look.clouds?.emissiveIntensity ?? 0.15 });
  const puff = new THREE.IcosahedronGeometry(1, 3);
  const cloudAt = (x, y, z, s) => {
    const c = new THREE.Group(), n = 5 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) { const m = new THREE.Mesh(puff, cloudMat), r = 0.7 + rand() * 0.8; m.scale.set(r * 1.3, r * 0.8, r); m.position.set((k - n / 2) * 0.9 + rand() * 0.4, rand() * 0.5, (rand() - 0.5) * 1.2); c.add(m); }
    c.scale.setScalar(s); c.position.set(x, y, z); scene.add(c); clouds.push(c);
  };
  for (let i = 0; i < 60; i++) cloudAt((rand() - 0.5) * 160, -9 - rand() * 5, 30 - rand() * 140, 3 + rand() * 3);
  for (let i = 0; i < 8; i++) cloudAt(-45 + i * 13, 14 + rand() * 8, -30 - rand() * 50, 1.6 + rand());

  // ---- HUD
  const hud = document.createElement('div'); hud.className = 'o3-hud';
  hud.innerHTML = '<style>' + CSS + '</style><div class="o3-top"><span class="o3-pill o3-q" role="status"></span><span class="o3-pill o3-score" hidden>0</span></div><div class="o3-toast" role="status" aria-live="polite"></div>';
  parent.append(hud);
  const $ = s => hud.querySelector(s);

  // ---- loading (one cache per file; heroes get their own skeleton copy)
  const loader = new GLTFLoader();
  const cache = new Map();
  const loadModel = file => { if (!manifest.files[file]) throw new Error(`Oomba3D: ${file} is not in ${theme} ${version}`); if (!cache.has(file)) cache.set(file, loader.loadAsync(base + file)); return cache.get(file); };
  const findPiece = id => { const p = (manifest.pieces || []).find(p => p.id === id); if (!p) throw new Error(`Oomba3D: no piece "${id}" in ${theme}. Pieces: ${(manifest.pieces || []).map(p => p.id).join(', ')}`); return p; };
  const shade = o => { o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; };
  const moves = manifest.moves ? await loadModel(manifest.moves.file) : null;
  const clipName = n => (manifest.moves?.clips || {})[n] || n;

  // ---- sound: theme files through Web Audio, plus a made-in-code cheer and "wrong"; nothing plays before a tap or key
  let ctx = null; const buffers = new Map();
  const unlock = () => { if (!ctx) { try { ctx = new AudioContext(); } catch { ctx = null; } } if (ctx && ctx.state === 'suspended') ctx.resume(); };
  addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
  const fileFor = name => (manifest.sounds || []).find(s => s.id === name)?.file;
  const tone = (notes, type) => { const t0 = ctx.currentTime; notes.forEach(([f, at, len], i) => { const o = ctx.createOscillator(), gn = ctx.createGain(); o.type = type; o.frequency.value = f; gn.gain.setValueAtTime(0.0001, t0 + at); gn.gain.exponentialRampToValueAtTime(0.18, t0 + at + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len); o.connect(gn).connect(ctx.destination); o.start(t0 + at); o.stop(t0 + at + len + 0.05); }); };
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
  let points = 0, follow = null, player = null;
  const camGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3();

  function toast(text, ms = 1400) { const t = $('.o3-toast'); t.textContent = String(text); t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms); }
  function score(add) { if (typeof add === 'number') { points += add; const s = $('.o3-score'); s.hidden = false; s.textContent = points; } return points; }
  function onUpdate(fn) { updaters.push(fn); }

  async function hero(id, { x = 0, y = 0, z = 0, face = 0 } = {}) {
    const h = (manifest.heroes || []).find(h => h.id === id);
    if (!h) throw new Error(`Oomba3D: no hero "${id}" in ${theme}. Heroes: ${(manifest.heroes || []).map(h => h.id).join(', ')}`);
    const g = await loadModel(h.file);
    const root = shade(SkeletonUtils.clone(g.scene));
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

  function followCamera(target, { distance = 10, height = 5.5 } = {}) { follow = { target, distance, height }; }

  // Keyboard (arrows / WASD / Space) and, on touch screens, an on-screen pad: the same simple, kind physics as the
  // prototype (wide landings, quick respawn).
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
    if (motionOff || low || !h) return;
    const bits = new THREE.Group(); const colors = ['#FFD23F', '#66C792', '#FFFDF2', '#1F9D63'];
    const geo = new THREE.BoxGeometry(0.18, 0.18, 0.05);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % 4] })); m.position.copy(h.position).add(new THREE.Vector3(0, 2.5, 0)); m.userData.v = new THREE.Vector3((rand() - 0.5) * 6, 5 + rand() * 4, (rand() - 0.5) * 6); bits.add(m); }
    scene.add(bits); let life = 1.6;
    const fn = dt => { life -= dt; for (const m of bits.children) { m.userData.v.y -= 12 * dt; m.position.addScaledVector(m.userData.v, dt); m.rotation.x += dt * 8; } if (life <= 0) { scene.remove(bits); updaters.splice(updaters.indexOf(fn), 1); } };
    updaters.push(fn);
  }

  // ---- the loop, with the frame-rate watch that turns on low-power mode
  const clock = new THREE.Clock(); let slow = 0, frames = 0, watchFrom = performance.now();
  applyPower();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 30);
    for (const fn of updaters.slice()) fn(dt);
    if (!motionOff) clouds.forEach((c, i) => { c.position.x += Math.sin(i) * dt * 0.3; });
    if (follow) {
      const p = follow.target.position;
      camGoal.set(p.x * 0.5, p.y + follow.height, p.z + follow.distance); lookGoal.set(p.x * 0.6, p.y + 1.6, p.z - 8);
      sun.position.set(p.x + 18, p.y + 30, p.z + 12); sun.target.position.copy(p);
      camera.position.lerp(camGoal, 0.08); camera.lookAt(lookGoal);
    }
    composer.render();
    // Two slow 3-second windows in a row (under 30 frames a second) switch low-power mode on for good.
    frames++; const now = performance.now();
    if (now - watchFrom > 3000) { if (!low && document.visibilityState === 'visible') { slow = frames * 1000 / (now - watchFrom) < 30 ? slow + 1 : 0; if (slow >= 2) { low = true; applyPower(); } } frames = 0; watchFrom = now; }
  });

  return {
    THREE, scene, camera, renderer, theme: manifest,
    get lowPower() { return low; }, reducedMotion: motionOff,
    hero, world: { island, piece }, followCamera, controls, coins, askQuestion, sound, celebrate, toast, score, onUpdate,
  };
}
