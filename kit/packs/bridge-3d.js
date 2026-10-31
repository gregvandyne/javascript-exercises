// Pack "bridge-3d" (public/vendor/oomba-kit/<version>/packs/bridge-3d.js): the 3D bridge. A three.js game gets the
// "Oomba Ink" look with Oomba.three(THREE, { renderer, scene, camera, theme }) and draws nothing of its own style:
// - materials: toon (cel) shading from a 3-step gradient map (Bold: 2 hard steps) with a soft rim light, and Ink
//   outlines as an inverted hull pushed out in screen space (the same line weight at any distance, a far LOD drops it);
// - colours: the kit's palette and roles (B.color('player')), Bold's neon accents (B.neon('cyan'));
// - the world: a theme from the dress pack (step 1's table) as a 3D environment: the sky gradient at the theme's time
//   of day, fog in the horizon colour, the sun and sky light, terrain tinted with the biome's ground, rings of hills in
//   its band colours, the theme's props standing as billboards of the 2D art, clouds or stars;
// - characters: any kit character spec as a billboard of its 2D art (exactly the 2D look) or as a low-poly toon rig
//   built from the same spec (species, colours, ears, ring eyes, hair, outfit), both with idle / walk / run / jump /
//   cheer / hurt motion from the kit's motion language;
// - performance: a device tier (pixel ratio cap 1 / 1.25 / 1.5), a frame governor that steps quality down (pixel ratio,
//   shadows, outline distance, prop count) and a 30 fps cap on low tier; reduced motion stops decorative motion;
// - Bold (12-14): dusk light, deeper surfaces, hard cel steps, a neon rim, thinner Ink and 0.75x motion (the UI's Bold
//   look is the style-bold pack's).
// THREE is passed in, never imported: the game loads three.js from /vendor/three/ with its import map as before.
export const PACK = { name: 'bridge-3d' };
export function define(K) {
  const kit = K.kit, P = K.P, m = K.mix, INK = K.INK, CREAM = K.CREAM, STYLE = K.style, TAU = Math.PI * 2;
  const NEON = { mint: '#2EF2A0', cyan: '#2ED8FF', mag: '#FF3DA8', volt: '#FFE14D' }, DEEP = '#121826', BOLD_INK = '#0A0D14';
  const NEON_OF = { mint: 'mint', sky: 'cyan', coral: 'mag', grape: 'mag', peach: 'volt', spark: 'volt', cocoa: 'volt', stone: 'cyan', snow: 'cyan' };
  // the time-of-day sky (the core's model, src/sky.js): [tod, top, bottom, ambient]
  const SKY = [[0, '#4FB4F7', '#BFE8FF', 1], [0.22, '#5AAEEC', '#FFE6B8', 0.98], [0.42, '#FF9F5A', '#FFE08A', 0.92], [0.68, '#7A55C9', '#FF9C8F', 0.66], [1, '#0E2A2E', '#163B3A', 0.55]];
  const ONE = ['oomba', 'bee', 'owl', 'penguin', 'duck'];
  const STEP = { tint: 0, light: 1, base: 2, shade: 3 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const api = () => kit.win.Oomba || kit.win.OK || null;

  function tierOf(renderer) {
    const q = kit.query && kit.query.okTier; if (q === 'low' || q === 'mid' || q === 'high') return q;
    // school Chromebooks: 2-4 cores, 4 GB (deviceMemory is often hidden in a sandboxed frame: unknown counts as 8)
    const n = kit.win.navigator || {}, cores = n.hardwareConcurrency || 4, mem = n.deviceMemory || 8;
    let max = 8192; try { max = renderer.capabilities.maxTextureSize; } catch (e) { /* no renderer */ }
    if (cores <= 2 || mem <= 2 || max < 8192 || (cores <= 4 && mem <= 4)) return 'low';
    return cores >= 8 && mem >= 8 ? 'high' : 'mid';
  }

  function bridge(T, o = {}) {
    if (!T || !T.Mesh || !T.MeshToonMaterial) { kit.warn('Oomba.three(THREE, { renderer, scene, camera }): pass the three.js module first (import * as THREE from \'three\')'); return null; }
    const renderer = o.renderer || null, scene = o.scene || new T.Scene(), camera = o.camera || null;
    const rr = K.rand(o.seed || 9);   // phases and blinks (seeded, never Math.random)
    // ---- theme, style, time of day ----
    let look = null, biome = o.biome || 'meadow', style = o.style;
    if (o.theme) {
      if (kit.useTheme) { const sp = { look: o.theme }; kit.useTheme(sp); look = kit.theme.look; if (!o.biome) biome = sp.biome; if (!style && sp.style) style = sp.style; }
      else kit.warn(`Oomba.three: theme '${o.theme.name || o.theme}' needs the dress pack: add its pinned tag right after the kit tag`);
    }
    if (style || STYLE.name === 'bold') style = kit.setStyle(style || STYLE.name);
    const bold = style === 'bold', BI = K.biomes[biome] || K.biomes.meadow;
    kit.theme.biome = biome;
    let tod = o.tod != null ? clamp(+o.tod || 0, 0, 1) : kit.theme.dark ? 1 : look ? look.tod || 0 : 0;
    if (bold && o.tod == null && tod < 0.5) tod = 0.5;
    const tier = tierOf(renderer), dprCap = { low: 1, mid: 1.25, high: 1.5 }[tier];
    const motion = () => (kit.settings.reduced ? 0 : bold ? 0.75 : 1);
    // ---- colours ----
    const Col = c => (c && c.isColor ? c.clone() : new T.Color(c));
    function hex(c, step) {
      if (typeof c === 'number') return '#' + c.toString(16).padStart(6, '0');
      if (/^#[0-9a-f]{6}$/i.test(c)) return c;
      const s = typeof step === 'number' ? step : STEP[step] != null ? STEP[step] : 2;
      if (P[c]) return P[c][s];
      const O = api(); return O && O.color ? O.color(c, s) : INK;
    }
    const color = (c, step) => (c && c.isColor ? c.clone() : Col(hex(c, step)));
    const neon = n => Col(NEON[n] || NEON[NEON_OF[n]] || NEON.cyan);
    let i = 0; while (i < SKY.length - 2 && tod > SKY[i + 1][0]) i++;
    const A = SKY[i], Bk = SKY[i + 1], tt = sm(0, 1, (tod - A[0]) / (Bk[0] - A[0]));
    let top = m(A[1], Bk[1], tt), bottom = m(A[2], Bk[2], tt); const amb = A[3] + (Bk[3] - A[3]) * tt;
    if (BI.sky) { const k = (BI.sky[2] || 0.5) * (1 - sm(0.5, 1, tod)); top = m(top, BI.sky[0], k); bottom = m(bottom, BI.sky[1], k); }
    if (bold) { top = m(top, DEEP, 0.3); bottom = m(bottom, DEEP, 0.18); }
    const night = sm(0.55, 1, tod), deepen = c => (bold ? m(c, DEEP, 0.16) : c);
    const accent = (look && look.accent) || 'mint';
    const B = {
      THREE: T, scene, camera, renderer, tier, dprCap, style: bold ? 'bold' : 'playful', tod, quality: tier === 'high' ? 2 : tier === 'mid' ? 1 : 0,
      get reduced() { return !!kit.settings.reduced; }, get motion() { return motion(); },
      look: { name: look ? look.name : null, biome, tod, accent, music: look ? look.music : 'bright', bed: look ? look.bed : 'meadow', sky: [top, bottom], fog: bottom,
        ground: BI.ground.slice(), hills: BI.bands.map(b => b[0]), props: [],
        // land colours for a game's own terrain: grass (the near band), darker grass, rock, sand
        land: { grass: deepen(BI.bands[3][0]), grassDark: deepen(m(BI.bands[3][0], BI.bands[3][1], 0.7)), rock: deepen(m(P.stone[1], BI.bands[2][1], 0.25)), sand: /beach|desert|reef/.test(biome) ? BI.ground[0] : '#F4DCA0' } },
      color, neon, ink: Col(bold ? BOLD_INK : INK), accent: bold ? neon(accent) : color(accent),
    };
    { const A2 = kit.helperAtlas(); B.look.props = (look ? (kit.theme.names && kit.useTheme ? look.props : []) : []).filter(n => A2.defs.get(n)); }
    // ---- toon materials with a rim ----
    const U = { rim: { value: Col(bold ? NEON.cyan : CREAM) }, rimK: { value: bold ? 0.5 : 0.22 }, px: { value: new T.Vector2(0.002, 0.003) }, ink: { value: 2.5 }, near: { value: 12 } };
    const own = [];   // what B made (dispose)
    const gradient = steps => { const t = new T.DataTexture(new Uint8Array(steps.map(v => Math.round(v * 255))), steps.length, 1, T.RedFormat); t.minFilter = t.magFilter = T.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; own.push(t); return t; };
    const GRAD = gradient(bold ? [0.4, 1] : [0.56, 0.8, 1]);
    const rimify = mat => {
      mat.onBeforeCompile = s => {
        s.uniforms.okRim = U.rim; s.uniforms.okRimK = mat.userData.rimK || U.rimK;
        s.fragmentShader = ' uniform vec3 okRim;\nuniform float okRimK;\n' + s.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight += okRim * okRimK * smoothstep(0.58, 0.95, 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0));\n#include <opaque_fragment>');
      };
      mat.customProgramCacheKey = () => 'okToon'; return mat;
    };
    const mats = new Map();
    function toon(c, opt = {}) {
      const base = c == null ? new T.Color(1, 1, 1) : color(c, opt.step), glow = opt.glow ? (opt.glow === true ? base : color(opt.glow)) : null;
      const key = [base.getHexString(), glow ? glow.getHexString() : '', opt.vertexColors ? 1 : 0, opt.map ? opt.map.uuid : '', opt.opacity == null ? 1 : opt.opacity, opt.side || 0, opt.fog === false ? 0 : 1, opt.rim == null ? '' : opt.rim, opt.flat ? 1 : 0].join('|');
      if (mats.has(key)) return mats.get(key);
      const mat = new T.MeshToonMaterial({ color: base, gradientMap: GRAD, vertexColors: !!opt.vertexColors, map: opt.map || null, side: opt.side || T.FrontSide, fog: opt.fog !== false });
      if (opt.flat) mat.flatShading = true;   // faceted low-poly look (toon has no facet normals of its own)
      if (opt.rim != null) mat.userData.rimK = { value: U.rimK.value * opt.rim };   // the land gets less rim (none on the ground)
      rimify(mat);
      if (glow) { mat.emissive = glow; mat.emissiveIntensity = opt.glowK || (bold ? 1.1 : 0.75); }
      if (opt.opacity != null && opt.opacity < 1) { mat.transparent = true; mat.opacity = opt.opacity; }
      mats.set(key, mat); own.push(mat); return mat;
    }
    // facets: toon materials have no flatShading, so a faceted (low-poly) mesh gets face normals in its geometry
    const flats = new Map();
    function flat(g) {
      if (flats.has(g.uuid)) return flats.get(g.uuid);
      const n = g.index ? g.toNonIndexed() : g.clone(); n.deleteAttribute('normal'); n.computeVertexNormals(); flats.set(g.uuid, n); flats.set(n.uuid, n); own.push(n); return n;
    }
    /** inkify(object, {outline}): every Lambert / Phong / Standard material under it becomes the kit's toon material. */
    function inkify(root, opt = {}) {
      root.traverse(ob => {
        if (!ob.isMesh || ob.userData.okInk) return;
        if (!Array.isArray(ob.material) && ob.material && ob.material.flatShading && !ob.isSkinnedMesh) ob.geometry = flat(ob.geometry);
        const one = mt => {
          if (!mt || !/Lambert|Phong|Standard|Physical/.test(mt.type)) return mt;
          const em = mt.emissive && (mt.emissive.r + mt.emissive.g + mt.emissive.b) > 0.05 ? mt.emissive : null;
          return toon(mt.color, { flat: mt.flatShading, vertexColors: mt.vertexColors, map: mt.map, opacity: mt.transparent ? mt.opacity : 1, side: mt.side, glow: em, glowK: em ? Math.min(1.2, mt.emissiveIntensity || 1) : 0, fog: mt.fog });
        };
        ob.material = Array.isArray(ob.material) ? ob.material.map(one) : one(ob.material);
      });
      if (opt.outline) outline(root, typeof opt.outline === 'object' ? opt.outline : {});
      return root;
    }
    // ---- Ink outlines: an inverted hull, pushed out along a smoothed normal in screen space ----
    const GL = `vec3 okn = okN;
#ifdef USE_INSTANCING
okn = mat3( instanceMatrix ) * okn;
#endif
vec4 okc = projectionMatrix * vec4( normalize( normalMatrix * okn ), 0.0 );
float okl = length( okc.xy );
if ( okl > 1e-5 ) gl_Position.xy += okc.xy / okl * okW * okG * clamp( okD / gl_Position.w, 0.4, 1.0 ) * okPx * gl_Position.w;`;
    const inkMats = new Map(), inks = [];
    function inkMat(w, c) {
      const k = Math.round(w * 20) / 20 + (c ? ':' + color(c).getHexString() : ''); if (inkMats.has(k)) return inkMats.get(k);
      const mat = new T.MeshBasicMaterial({ color: c ? color(c) : B.ink, side: T.BackSide, fog: !c });
      const W = { value: Math.round(w * 20) / 20 };
      mat.onBeforeCompile = s => { s.uniforms.okW = W; s.uniforms.okG = U.ink; s.uniforms.okPx = U.px; s.uniforms.okD = U.near; s.vertexShader = 'attribute vec3 okN;\nuniform float okW;\nuniform float okG;\nuniform float okD;\nuniform vec2 okPx;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + GL); };
      mat.customProgramCacheKey = () => 'okInk'; inkMats.set(k, mat); own.push(mat); return mat;
    }
    function smoothN(g) {
      if (g.attributes.okN) return;
      if (!g.attributes.normal) g.computeVertexNormals();
      const p = g.attributes.position, n = g.attributes.normal, acc = new Map(), out = new Float32Array(p.count * 3), keys = [];
      for (let j = 0; j < p.count; j++) {
        const key = Math.round(p.getX(j) * 1e3) + ',' + Math.round(p.getY(j) * 1e3) + ',' + Math.round(p.getZ(j) * 1e3); keys.push(key);
        const a = acc.get(key) || [0, 0, 0]; a[0] += n.getX(j); a[1] += n.getY(j); a[2] += n.getZ(j); acc.set(key, a);
      }
      for (let j = 0; j < p.count; j++) { const a = acc.get(keys[j]), l = Math.hypot(a[0], a[1], a[2]) || 1; out[j * 3] = a[0] / l; out[j * 3 + 1] = a[1] / l; out[j * 3 + 2] = a[2] / l; }
      g.setAttribute('okN', new T.BufferAttribute(out, 3));
    }
    /** outline(object, {width, important, lod, color}): Ink around every mesh under it (width: 1 is the kit's line;
     *  color: a neon edge instead of Ink, Bold's accent). */
    function outline(root, opt = {}) {
      if (tier === 'low' && !opt.important) return root;
      const list = []; root.traverse(ob => { if (ob.isMesh && !ob.isSprite && !ob.userData.okInk && !ob.userData.noInk && ob.geometry && ob.geometry.attributes.position) list.push(ob); });
      for (const ob of list) {
        smoothN(ob.geometry);
        const mat = inkMat(opt.width || 1, opt.color), h = ob.isInstancedMesh ? new T.InstancedMesh(ob.geometry, mat, ob.instanceMatrix.count) : new T.Mesh(ob.geometry, mat);
        if (ob.isInstancedMesh) { h.instanceMatrix = ob.instanceMatrix; h.count = ob.count; h.frustumCulled = false; }
        h.userData.okInk = true; h.castShadow = h.receiveShadow = false; h.raycast = () => {}; h.renderOrder = ob.renderOrder;
        ob.add(h); inks.push({ h, ob, lod: opt.lod || 1, important: !!opt.important });
      }
      return root;
    }
    // ---- sky, fog, light ----
    let skyTex = null;
    const bg = (() => {
      const c = kit.doc.createElement('canvas'); c.width = 2; c.height = 128; const g = c.getContext('2d');
      if (g.createLinearGradient) { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, top); gr.addColorStop(0.62, m(top, bottom, 0.7)); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, 2, 128); }
      skyTex = new T.CanvasTexture(c); skyTex.colorSpace = T.SRGBColorSpace; own.push(skyTex); return skyTex;
    })();
    const hemi = new T.HemisphereLight(Col(m(top, '#FFFFFF', 0.35)), Col(deepen(BI.ground[2] || BI.ground[1])), (bold ? 1.2 : 1.5) * amb);
    const sun = new T.DirectionalLight(Col(night > 0.5 ? '#BCD0FF' : m('#FFF4DC', '#FFB070', sm(0.15, 0.6, tod))), (night > 0.5 ? 0.9 : bold ? 2.1 : 2.6) * (0.6 + 0.4 * amb));
    sun.position.set(0.55, 1, 0.42).multiplyScalar(30);
    B.sun = sun; B.hemi = hemi;
    function sky(opt = {}) {
      scene.background = bg;
      const size = opt.size || o.size || 30;
      scene.fog = new T.Fog(Col(B.look.fog), size * (bold ? 0.9 : 1.2) * (night > 0.5 ? 0.8 : 1), size * 3.6);
      if (!hemi.parent) scene.add(hemi, sun, sun.target);
      if (opt.shadows !== false && tier !== 'low' && renderer) {
        renderer.shadowMap.enabled = true; sun.castShadow = true; const s = tier === 'high' ? 1024 : 512; sun.shadow.mapSize.set(s, s);
        Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 90 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
      }
      return B;
    }
    // ---- billboards of the kit's 2D art (props and characters) ----
    const tex = new Map(), cards = [], tint = Col(m('#FFFFFF', '#8C9BC8', night * 0.75));
    function cardMat(key, make) {
      if (tex.has(key)) return tex.get(key);
      const c = make(), t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 2;
      const mat = new T.MeshBasicMaterial({ map: t, alphaTest: 0.45, side: T.DoubleSide, color: tint });
      const v = { mat, w: c.width || 1, h: c.height || 1 }; tex.set(key, v); own.push(t, mat); return v;
    }
    function card(v, h, ax, ay) {
      const w = h * v.w / v.h, g = new T.PlaneGeometry(w, h); g.translate((0.5 - ax) * w, ay * h - h / 2, 0);   // the anchor (feet) at the origin
      const mesh = new T.Mesh(g, v.mat); mesh.userData.noInk = true; own.push(g); return mesh;
    }
    const px = () => (tier === 'low' ? 128 : tier === 'mid' ? 192 : 256);
    /** prop(name, {size, variant}) -> a billboard of the 2D prop (a Group; its origin is where the prop stands). */
    function prop(name, opt = {}) {
      const A2 = kit.helperAtlas(), def = A2.defs.get(name), O = api();
      if (!def) kit.warn(`Oomba.three prop('${name}'): no such prop here (load its pack, or see Oomba.art.props)`);
      const v = cardMat('p:' + name + ':' + (opt.variant || ''), () => (O ? O.art.toCanvas(name, px(), opt.variant || '') : kit.doc.createElement('canvas')));
      const g = new T.Group(), mesh = card(v, opt.size || 1.4, def && def.ax != null ? def.ax : 0.5, def && def.ay != null ? def.ay : 1);
      g.add(mesh); g.userData.okCard = { mesh, kind: 'prop', ph: rr() * TAU }; cards.push(g); return g;
    }
    // characters: shared motion (speed 0..1 picks idle / walk / run, air picks jump / fall; play(clip) for one-shots)
    function actor(g, kind) {
      Object.assign(g, { speed: 0, air: false, heading: 0, clip: 'idle', t: 0, once: null, squashV: 0,
        play(c, ms) { this.once = c; this.onceT = (ms || ({ cheer: 900, hurt: 500, land: 260, wave: 1200 }[c] || 600)) / 1000; if (c === 'land') this.squashV = 1; return this; } });
      g.userData.okActor = kind; actors.push(g); return g;
    }
    const actors = [];
    /** sprite(spec, {size, mood}) -> a character billboard: its 2D art, turned toward the camera. */
    function sprite(spec, opt = {}) {
      const O = api(), S = O ? O.char(spec) : spec, size = opt.size || 1.6, mk = mood => cardMat('c:' + (S.id || JSON.stringify(S)) + ':' + (mood || ''), () => (O ? O.art.toCanvas(S, px() * 1.5, mood || '') : kit.doc.createElement('canvas')));
      const H = size * 202 / 150, g = new T.Group(), mesh = card(mk(opt.mood), H, 0.5, 192 / 202);
      g.add(mesh, blob(size * 0.42)); g.userData.okCard = { mesh, kind: 'char', ph: 0 };
      g.mood = mood => { mesh.material = mk(mood).mat; return g; };
      cards.push(g); return actor(g, 'sprite');
    }
    let blobTex = null;
    function blob(r) {
      if (!blobTex) { const c = kit.doc.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); if (x.createRadialGradient) { const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(20,20,20,.38)'); gr.addColorStop(1, 'rgba(20,20,20,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); } blobTex = new T.CanvasTexture(c); own.push(blobTex); }
      const s = new T.Mesh(new T.CircleGeometry(r, 20), new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })); s.rotation.x = -Math.PI / 2; s.position.y = 0.02; s.userData.noInk = true; own.push(s.geometry, s.material); return s;
    }
    // ---- the low-poly rig: the same spec as the 2D character, built from toon shapes with Ink ----
    const G = { s: new T.SphereGeometry(1, 16, 12), c: new T.CylinderGeometry(1, 1, 1, 10), k: new T.ConeGeometry(1, 1, 10), cap: new T.CapsuleGeometry(1, 1, 4, 10), t: new T.TorusGeometry(1, 0.22, 6, 18) };
    own.push(...Object.values(G));
    function rig(spec, opt = {}) {
      const O = api(), S = O ? O.char(spec) : Object.assign({ species: 'oomba', colors: { base: 'mint' } }, spec), sp = S.species, cs = S.colors || {};
      const R = P[cs.base] || P.mint, belly = cs.belly && P[cs.belly] ? P[cs.belly][0] : CREAM;
      const skin = sp === 'kid' ? (O ? O.tokens.skin[S.skin || 0] : '#F5CBA7') : R[2];
      const hairC = S.hair ? ((O && O.tokens.hair[S.hair.color]) || (P[S.hair.color] || P.cocoa)[2]) : R[3];
      const top = S.outfit ? P[S.outfit.color] || P.sky : R;
      const one = ONE.includes(sp), legs = one ? 0.12 : 0.22 * (bold ? STYLE.legs || 1 : 1), headR = (one ? 0.4 : 0.26) * (bold && !one ? STYLE.head || 1 : 1);
      const g = new T.Group(), inner = new T.Group(), body = new T.Group(); g.add(inner); inner.add(body);
      const add = (geo, c, x, y, z, sx, sy, sz, par, o2) => { const me = new T.Mesh(geo, c && c.isMaterial ? c : toon(c, o2)); me.position.set(x, y, z); me.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); me.castShadow = true; if (o2 && (o2.glow || o2.opacity)) me.userData.keep = true; (par || body).add(me); return me; };
      const limb = (x, y, len, r, c, par) => { const piv = new T.Group(); piv.position.set(x, y, 0); piv.userData.pivot = true; add(G.cap, c, 0, -len / 2, 0, r, len / 2, r, piv); (par || inner).add(piv); return piv; };
      // legs and arms on pivots (hips and shoulders)
      const L = [limb(-0.09, legs, legs, 0.07, sp === 'kid' ? (S.outfit && S.outfit.top === 'dress' ? skin : P.sky[3]) : R[3]), limb(0.09, legs, legs, 0.07, sp === 'kid' ? (S.outfit && S.outfit.top === 'dress' ? skin : P.sky[3]) : R[3])];
      for (const l of L) add(G.s, sp === 'kid' ? INK : R[3], 0, -legs + 0.03, 0.04, 0.085, 0.06, 0.12, l);
      const torsoY = one ? legs + 0.36 : legs + 0.16, bodyC = sp === 'kid' ? top[2] : R[2];
      let headY;
      if (one) {
        add(G.s, R[2], 0, torsoY, 0, 0.42, 0.46, 0.4); add(G.s, belly, 0, torsoY - 0.08, 0.2, 0.28, 0.3, 0.22); headY = torsoY + 0.06;
      } else {
        add(G.cap, bodyC, 0, torsoY, 0, 0.17, 0.12 * (bold ? 1.2 : 1), 0.15);
        if (sp !== 'kid') add(G.s, belly, 0, torsoY - 0.01, 0.1, 0.11, 0.13, 0.08);
        if (S.outfit && S.outfit.top === 'dress') add(G.k, top[2], 0, torsoY - 0.12, 0, 0.24, 0.26, 0.24);
        if (S.outfit && S.outfit.top === 'hoodie') add(G.t, top[3], 0, torsoY + 0.17, -0.02, 0.13, 0.13, 0.2).rotation.x = Math.PI / 2;
        headY = torsoY + 0.17 + headR * 0.95;
      }
      const shY = one ? torsoY : torsoY + 0.1, armC = sp === 'kid' ? skin : one ? R[3] : R[2];
      const AR = [limb(-(one ? 0.43 : 0.21), shY, one ? 0.16 : 0.2, 0.055, armC, body), limb(one ? 0.43 : 0.21, shY, one ? 0.16 : 0.2, 0.055, armC, body)];
      if (sp === 'kid' && S.outfit) for (const a of AR) add(G.s, top[2], 0, -0.02, 0, 0.07, 0.07, 0.07, a);
      const head = new T.Group(); head.position.y = one ? 0 : headY; body.add(head);
      const hY = one ? headY : 0;
      if (!one) add(G.s, sp === 'kid' ? skin : R[2], 0, 0, 0, headR * (sp === 'frog' ? 1.25 : 1), headR * (sp === 'frog' ? 0.8 : 0.95), headR * 0.95, head);
      // ring eyes: a white disc with an Ink pupil (the outline draws the ring)
      const eyeR = one ? 0.1 : sp === 'frog' ? 0.08 : 0.065, eyeY = hY + (sp === 'frog' ? headR * 0.75 : one ? 0.06 : 0.02), eyeZ = (one ? 0.36 : headR * 0.88), eyes = [];
      for (const sx of [-1, 1]) {
        const e = new T.Group(); e.position.set(sx * (one ? 0.15 : headR * 0.38), eyeY, eyeZ * 0.92); e.userData.pivot = true; head.add(e);
        add(G.s, '#FFFFFF', 0, 0, 0, eyeR, eyeR * (bold ? 0.78 : 1), eyeR * 0.42, e); add(G.s, INK, 0, 0, eyeR * 0.3, eyeR * 0.55, eyeR * 0.6 * (bold ? 0.78 : 1), eyeR * 0.22, e); eyes.push(e);
        if (!bold && sp !== 'kid' && !one) add(G.s, P.coral[1], sx * headR * 0.66, hY - headR * 0.25, headR * 0.72, 0.045, 0.03, 0.02, head).userData.noInk = true;
      }
      // the species' own shapes
      const ear = (sx, geo, c, x, y, z, a, b, cc, rz) => { const e = add(geo, c, sx * x, hY + y, z, a, b, cc, head); e.rotation.z = -sx * (rz || 0); return e; };
      for (const sx of [-1, 1]) {
        if (sp === 'fox' || sp === 'cat') ear(sx, G.k, R[2], headR * 0.62, headR * 0.95, 0, 0.09, 0.18, 0.06, 0.3);
        else if (sp === 'bunny') ear(sx, G.s, R[2], headR * 0.35, headR * 1.55, -0.02, 0.06, 0.2, 0.04, 0.12);
        else if (sp === 'bear' || sp === 'mouse') ear(sx, G.s, R[3], headR * (sp === 'mouse' ? 0.8 : 0.72), headR * 0.78, 0, sp === 'mouse' ? 0.12 : 0.08, sp === 'mouse' ? 0.12 : 0.08, 0.04);
        else if (sp === 'dog') ear(sx, G.s, R[3], headR * 0.95, headR * 0.1, 0, 0.07, 0.16, 0.05, -0.3);
        else if (sp === 'owl') ear(sx, G.k, R[3], 0.22, 0.42, 0, 0.07, 0.14, 0.05, 0.5);
        else if (sp === 'bee') { const w = ear(sx, G.s, '#FFFFFF', 0.3, 0.42, -0.2, 0.2, 0.12, 0.03, -0.5); w.material = toon('#FFFFFF', { opacity: 0.75 }); w.userData.keep = true; }
      }
      if (sp === 'oomba' || sp === 'bee') { add(G.c, INK, 0, hY + 0.5, 0, 0.012, 0.16, 0.012, head).userData.noInk = true; add(G.s, P.spark[2], 0, hY + 0.6, 0, 0.06, 0.06, 0.06, head, { glow: true }); }
      if (sp === 'bee') for (const y of [-0.08, 0.1]) add(G.c, INK, 0, torsoY + y, 0, 0.405, 0.05, 0.385).userData.noInk = true;
      if (sp === 'fox' || sp === 'dog' || sp === 'cat' || sp === 'bear' || sp === 'mouse') add(G.s, belly, 0, hY - headR * 0.35, headR * 0.72, headR * 0.42, headR * 0.3, headR * 0.3, head);
      if (/owl|penguin|duck/.test(sp)) add(G.k, P.peach[2], 0, hY - 0.06, 0.4, 0.05, 0.12, 0.05, head).rotation.x = Math.PI / 2;
      if (sp === 'fox' || sp === 'bunny' || sp === 'cat' || sp === 'dog' || sp === 'mouse' || sp === 'bear') {
        const tail = add(sp === 'bunny' || sp === 'bear' ? G.s : G.cap, sp === 'bunny' ? '#FFFFFF' : R[2], 0, legs + 0.06, -0.18, sp === 'fox' ? 0.08 : 0.06, sp === 'fox' ? 0.16 : 0.06, 0.06, inner); tail.rotation.x = -0.9;
      }
      if (sp === 'kid' && S.hair) {
        const st = S.hair.style;
        add(G.s, hairC, 0, headR * 0.25, -headR * 0.18, headR * 1.05, headR * (st === 'buzz' ? 0.78 : 0.85), headR * 0.95, head);   // a cap of hair: the face stays in front of it
        if (st === 'puffs' || st === 'braids') for (const sx of [-1, 1]) add(G.s, hairC, sx * headR * 0.95, headR * 0.45, -headR * 0.1, headR * 0.38, headR * 0.38, headR * 0.38, head);
        if (st === 'long' || st === 'bob') add(G.s, hairC, 0, -headR * 0.35, -headR * 0.35, headR * 0.98, headR * (st === 'long' ? 1.1 : 0.7), headR * 0.6, head);
        if (st === 'spiky') for (let k = 0; k < 5; k++) { const a = (k / 4 - 0.5) * 1.6; ear(1, G.k, hairC, Math.sin(a) * headR * 0.7, headR * (0.85 + 0.15 * Math.cos(a)), -0.02, 0.06, 0.14, 0.06, -a * 0.8); }
        if (st === 'cap') { add(G.s, top[3], 0, headR * 0.45, 0, headR * 1.05, headR * 0.6, headR * 1.05, head); add(G.c, top[3], 0, headR * 0.35, headR * 0.85, headR * 0.6, 0.02, headR * 0.5, head); }
      }
      body.position.y = 0; inner.add(blob(one ? 0.38 : 0.3));
      const size = opt.size || 1.6, totalH = one ? torsoY + 0.5 : headY + headR;
      g.scale.setScalar(size / totalH);
      // one mesh per moving part (vertex colours): about 17 draw calls a character with its Ink, not 50
      bake(body); for (const pv of [...L, ...AR, ...eyes]) bake(pv);
      outline(inner, { important: true, width: opt.ink || 1 });
      Object.assign(g, { legsP: L, armsP: AR, eyes, body, inner, headG: head, blinkIn: 2 + rr() * 3 });
      g.mood = () => g;
      return actor(g, 'rig');
    }
    /** spark({size}) -> the kit's 4-point reward spark as a glowing toon solid with Ink (pickups). */
    let sparkGeo = null;
    function spark(opt = {}) {
      if (!sparkGeo) {
        const sh = new T.Shape();
        for (let j = 0; j < 8; j++) { const a = Math.PI / 2 + j * Math.PI / 4, r = j % 2 ? 0.2 : 0.5; j ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
        sparkGeo = new T.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 1 }); sparkGeo.center(); own.push(sparkGeo);
      }
      const me = new T.Mesh(sparkGeo, toon(P.spark[2], { glow: P.spark[1], glowK: bold ? 0.9 : 0.55 })), g = new T.Group(); me.scale.setScalar(opt.size || 1); g.add(me);
      outline(g, { important: true, width: 0.9 }); g.userData.okSpark = me; sparks.push(g); return g;
    }
    const sparks = [];
    /** bake(group): its meshes (not through a moving pivot (userData.pivot), not glowing, textured or see-through ones)
     *  become one vertex-coloured toon mesh: one draw call (and one Ink hull) for a whole model. */
    function bake(root) {
      const solid = me => { const mt = me.material; return mt && !Array.isArray(mt) && !mt.transparent && !mt.map && !(mt.emissive && mt.emissive.getHex() && mt.emissiveIntensity > 0.05) && !me.isInstancedMesh && !me.isSkinnedMesh; };
      const list = [], walk = o => { for (const c of o.children) { if (c.userData.pivot) continue; if (c.isMesh && !c.userData.keep && !c.userData.okInk && solid(c)) list.push(c); walk(c); } };
      walk(root); if (list.length < 2) return;
      root.updateMatrixWorld(true);
      const inv = new T.Matrix4().copy(root.matrixWorld).invert(), M = new T.Matrix4(), N = new T.Matrix3(), v = new T.Vector3(), pos = [], nor = [], col = [], idx = [];
      let base = 0;
      for (const me of list) {
        const g = me.geometry, p = g.attributes.position, n = g.attributes.normal, c = me.material.color;
        M.multiplyMatrices(inv, me.matrixWorld); N.getNormalMatrix(M);
        for (let j = 0; j < p.count; j++) { v.fromBufferAttribute(p, j).applyMatrix4(M); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(n, j).applyMatrix3(N).normalize(); nor.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); }
        if (g.index) for (let j = 0; j < g.index.count; j++) idx.push(g.index.getX(j) + base); else for (let j = 0; j < p.count; j++) idx.push(base + j);
        base += p.count;
      }
      for (const me of list) me.parent.remove(me);
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); geo.setIndex(idx); own.push(geo);
      const mm = new T.Mesh(geo, toon(null, { vertexColors: true })); mm.castShadow = true; root.add(mm); return mm;
    }
    // ---- terrain, hills, props, clouds or stars ----
    function world(opt = {}) {
      const size = opt.size || o.size || 30, seed = opt.seed || 7, rnd = K.rand(seed), grp = new T.Group(); grp.name = 'oomba-world';
      sky({ size, shadows: opt.shadows }); U.near.value = size * 0.45;
      const amp = opt.flat ? 0 : (opt.hilly == null ? 1 : opt.hilly) * size * 0.035, ph = rnd() * 6;
      const heightAt = opt.height || ((x, z) => { const r = Math.hypot(x, z) / size; return amp * (Math.sin(x * 0.16 + ph) * Math.cos(z * 0.14 - ph) + 0.5 * Math.sin(x * 0.31 + z * 0.23)) * sm(0.12, 0.45, r) + sm(0.8, 1.6, r) * size * 0.06; });
      // the land is the biome's near band (its grass, sand or snow); the play area in the middle is its ground top
      const gc = BI.ground.map(deepen), Gtop = Col(gc[0]), Glip = Col(gc[1]), Gland = Col(deepen(BI.bands[3][0])), Gfar = Col(deepen(BI.bands[2][0])), cc = new T.Color();
      if (opt.ground !== false) {
        const n = tier === 'low' ? 40 : 64, geo = new T.PlaneGeometry(size * 3.4, size * 3.4, n, n); geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
        for (let j = 0; j < pos.count; j++) {
          const x = pos.getX(j), z = pos.getZ(j), y = heightAt(x, z), r = Math.hypot(x, z) / size; pos.setY(j, y);
          cc.copy(Gtop).lerp(Glip, 0.4 + 0.2 * Math.sin(x * 0.9 + z * 0.7)).lerp(Gland, sm(opt.plaza || 0.22, (opt.plaza || 0.22) + 0.14, r)).lerp(Gfar, sm(1, 1.6, r)); cols.set([cc.r, cc.g, cc.b], j * 3);
        }
        geo.setAttribute('color', new T.BufferAttribute(cols, 3));
        // Bold's tech worlds (cyber, station, skate, space) get a glowing neon grid on the ground
        let grid = null;
        if (bold && /cyber|station|skate|space/.test(biome)) {
          const c = kit.doc.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); if (x.fillRect) { x.fillStyle = '#000'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 3); x.fillRect(0, 0, 3, 64); }
          grid = new T.CanvasTexture(c); grid.wrapS = grid.wrapT = T.RepeatWrapping; grid.repeat.set(size * 1.7, size * 1.7); grid.anisotropy = 4; own.push(grid);
        }
        const gm = grid ? rimify(new T.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD, emissive: B.accent, emissiveMap: grid, emissiveIntensity: 0.55 })) : toon(null, { vertexColors: true, rim: 0 });
        if (grid) { gm.userData.rimK = { value: 0 }; own.push(gm); }
        const ground = new T.Mesh(flat(geo), gm); ground.receiveShadow = true; ground.userData.noInk = true; ground.name = 'ground'; grp.add(ground); own.push(geo);
      }
      // hills: three rings in the biome's band colours (near to far), the far one peaked when the biome is
      if (opt.hills !== false) {
        const ico = flat(new T.IcosahedronGeometry(1, 1)), cone = flat(new T.ConeGeometry(1, 1, 6));
        const M4 = new T.Matrix4(), Q = new T.Quaternion(), V = new T.Vector3(), Sx = new T.Vector3();
        [[3, 1.2, 15, 0.16], [2, 1.65, 18, 0.26], [1, 2.15, 22, 0.38]].forEach(([band, rr, n, hk], ri) => {
          const b = BI.bands[band], peaks = b[2] === 'peaks' || (ri === 2 && BI.bands[0][2] === 'peaks'), im = new T.InstancedMesh(peaks ? cone : ico, toon(deepen(b[0]), { rim: 0.35 }), n);
          for (let j = 0; j < n; j++) {
            const a = (j + rnd() * 0.6) / n * TAU, d = size * (rr + rnd() * 0.15), h = size * hk * (0.7 + rnd() * 0.6), w = size * (0.26 + 0.1 * ri) * (0.8 + rnd() * 0.5);
            Q.setFromAxisAngle(V.set(0, 1, 0), rnd() * TAU); im.setMatrixAt(j, M4.compose(V.set(Math.cos(a) * d, peaks ? h * 0.42 : -h * 0.15, Math.sin(a) * d), Q, Sx.set(w, peaks ? h : h * 0.8, w)));
          }
          im.userData.noInk = ri > 0; grp.add(im); if (ri === 0) outline(im, bold ? { width: 0.7, color: B.accent, important: true } : { width: 0.8 });   // Bold: a neon ridge line
        });
      }
      // the theme's props, as billboards of their 2D art, around the play area
      const props = [], names = opt.props || B.look.props, want = opt.propCount != null ? opt.propCount : { low: 6, mid: 10, high: 14 }[tier], clear = opt.clear == null ? size * 0.45 : opt.clear;
      const SIZE = { tower: 5.5, goalpost: 3.6, pyramid: 5, igloo: 3.2, sandcastle: 2.8, totem: 3.6, banner: 3.6, torch: 2.4, cauldron: 2, satellite: 2.6, ufo: 2.6, rocket: 3.8, planet: 3, bus: 3.2, car: 2.6, tree: 4.2, boat: 3, cactus: 3, snowman: 2.8, pine: 4.4, sign: 2.6, drone: 2, lantern: 2.4, ghost: 2.2, pumpkin: 1.8, goal: 3 };
      for (let j = 0; names.length && j < want; j++) {
        const nm = names[j % names.length], a = (j + rnd() * 0.7) / want * TAU, d = clear + rnd() * (size - clear), x = Math.cos(a) * d, z = Math.sin(a) * d;
        const p = prop(nm, { size: (SIZE[nm] || 2) * (opt.propScale || 1) }); p.position.set(x, heightAt(x, z), z); grp.add(p); props.push(p);
      }
      // clouds by day (one instanced mesh), stars at night or in space
      let clouds = null, stars = null;
      const spacey = /space|station|cyber/.test(biome), under = biome === 'reef';
      if (night < 0.6 && !spacey && !under && opt.clouds !== false) {
        const n = opt.clouds || 6; clouds = new T.InstancedMesh(G.s, toon(m(CREAM, top, 0.12), { fog: false }), n * 3);
        const M4 = new T.Matrix4(), Q = new T.Quaternion(), V = new T.Vector3(), Sx = new T.Vector3();
        for (let j = 0; j < n; j++) { const a = j / n * TAU + rnd(), d = size * (1.5 + rnd() * 0.6), y = size * (0.55 + rnd() * 0.25); for (let k = 0; k < 3; k++) { const s = size * (0.06 + rnd() * 0.04) * (k === 1 ? 1.4 : 1); im3(clouds, j * 3 + k, M4.compose(V.set(Math.cos(a) * d + (k - 1) * s * 1.3 * Math.sin(a), y + (k === 1 ? s * 0.3 : 0), Math.sin(a) * d - (k - 1) * s * 1.3 * Math.cos(a)), Q, Sx.set(s, s * 0.8, s))); } }
        clouds.userData.noInk = false; grp.add(clouds); outline(clouds, { width: 0.8 });
      }
      if (night >= 0.6 || spacey) {
        const n = tier === 'low' ? 160 : 320, arr = new Float32Array(n * 3);
        for (let j = 0; j < n; j++) { const a = rnd() * TAU, y = 0.2 + rnd() * 0.8, r = Math.sqrt(1 - y * y); arr.set([Math.cos(a) * r * size * 3, y * size * 3, Math.sin(a) * r * size * 3], j * 3); }
        const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(arr, 3));
        stars = new T.Points(sg, new T.PointsMaterial({ color: Col(bold ? NEON.cyan : '#FFF3C4'), size: 2.2, sizeAttenuation: false, fog: false })); grp.add(stars); own.push(sg, stars.material);
      }
      scene.add(grp);
      const W = { group: grp, heightAt, props, clouds, stars, size, sun, hemi };
      B.worldInfo = W; return W;
    }
    const im3 = (im, j, M) => im.setMatrixAt(j, M);
    // ---- per frame: billboards, characters, outlines, the governor ----
    const camPos = new T.Vector3(), wp = new T.Vector3(), right = new T.Vector3(), sz = new T.Vector2();
    let clock = 0, slow = 0, fast = 0, prLast = 0, pruned = 0;
    function update(dt = 1 / 60) {
      dt = Math.min(0.1, Math.max(0, dt)); clock += dt;
      const mo = motion();
      if (renderer) { renderer.getSize(sz); if (sz.x && sz.y) { U.px.value.set(2 / sz.x, 2 / sz.y); U.ink.value = clamp(sz.y * 0.0055, 2.2, 5) * (bold ? 0.82 : 1); } }   // the kit's 2D line: about 5% of a character's height on screen
      if (camera) { camera.getWorldPosition(camPos); right.setFromMatrixColumn(camera.matrixWorld, 0); }
      for (const g of cards) {
        const c = g.userData.okCard; if (!camera) break;
        g.getWorldPosition(wp); c.mesh.rotation.y = Math.atan2(camPos.x - wp.x, camPos.z - wp.z) - g.rotation.y;
        if (c.kind === 'prop' && mo) { c.mesh.rotation.z = Math.sin(clock * 1.3 + c.ph) * 0.025 * mo; }
      }
      for (const a of actors) animate(a, dt, mo);
      for (const g of sparks) { const me = g.userData.okSpark; me.rotation.y += dt * 1.6 * (mo || 0.35); me.position.y = Math.sin(clock * 2.2 + g.id) * 0.12 * mo; }
      if (B.worldInfo && B.worldInfo.clouds && mo) B.worldInfo.clouds.rotation.y += dt * 0.006 * mo;
      const far = (B.worldInfo ? B.worldInfo.size : 30) * [0.9, 1.6, 3][B.quality];
      if (clock - pruned > 2) { pruned = clock; for (let j = inks.length - 1; j >= 0; j--) { let r = inks[j].ob; while (r.parent) r = r.parent; if (r === scene) inks[j].seen = true; else if (inks[j].seen) inks.splice(j, 1); } }   // models taken out of the scene
      for (const k of inks) {
        if (k.ob.isInstancedMesh) { k.h.count = k.ob.count; k.h.visible = B.quality > 0 || k.important; continue; }
        if (k.important || !camera) { k.h.visible = true; continue; }
        k.ob.getWorldPosition(wp); k.h.visible = wp.distanceTo(camPos) < far * k.lod;
      }
      // the governor: below ~28 fps for 2 s steps quality down; above ~55 fps for 6 s steps it back up (to the tier's)
      if (o.governor === false) return;   // the game runs its own quality ladder
      if (dt > 1 / 28) { slow += dt; fast = 0; } else if (dt < 1 / 55) { fast += dt; slow = Math.max(0, slow - dt); } else { slow = Math.max(0, slow - dt * 0.5); fast = 0; }
      if (slow > 2 && B.quality > 0) { setQuality(B.quality - 1); slow = 0; }
      if (fast > 6 && B.quality < { low: 0, mid: 1, high: 2 }[tier]) { setQuality(B.quality + 1); fast = 0; }
      if (renderer && clock - prLast > 1) { prLast = clock; const want = Math.min(kit.win.devicePixelRatio || 1, dprCap * [0.75, 0.88, 1][B.quality]); if (renderer.getPixelRatio() > want + 0.01) applyPR(want); }
    }
    function applyPR(pr) { if (!renderer) return; renderer.setPixelRatio(pr); const c = renderer.domElement; if (c && c.clientWidth) renderer.setSize(c.clientWidth, c.clientHeight, false); }
    function setQuality(q) {
      B.quality = clamp(q, 0, 2);
      if (renderer) { renderer.shadowMap.enabled = B.quality > 0 && tier !== 'low'; sun.castShadow = renderer.shadowMap.enabled; applyPR(Math.min(kit.win.devicePixelRatio || 1, dprCap * [0.75, 0.88, 1][B.quality])); }
      if (B.worldInfo) B.worldInfo.props.forEach((p, j) => { p.visible = B.quality > 0 || j % 2 === 0; });
      return B;
    }
    function animate(a, dt, mo) {
      a.t += dt * (a.speed > 0.6 ? 1.7 : 1) * (bold ? 0.9 : 1);
      if (a.once && (a.onceT -= dt) <= 0) a.once = null;
      const clip = a.once || (a.air ? 'jump' : a.speed > 0.6 ? 'run' : a.speed > 0.05 ? 'walk' : 'idle'); a.clip = clip;
      const t = a.t, sw = clip === 'run' ? 1 : clip === 'walk' ? 0.6 : 0, f = clip === 'run' ? 13 : 9;
      a.squashV = Math.max(0, a.squashV - dt * 4);
      if (a.userData.okActor === 'sprite') {
        const c = a.userData.okCard.mesh;
        let sy = 1 + Math.sin(t * TAU * 0.4) * 0.02 * mo, y = 0, rz = 0;
        if (sw) { y = Math.abs(Math.sin(t * f * 0.5)) * 0.07 * sw * mo; rz = Math.sin(t * f * 0.5) * 0.07 * sw * mo; }
        if (clip === 'jump') sy = 1 + 0.08 * mo;
        if (clip === 'cheer') y = Math.abs(Math.sin(t * 9)) * 0.18 * mo;
        if (clip === 'hurt') rz = -0.25 * (mo || 0.4);
        sy -= a.squashV * 0.18 * mo;
        c.scale.set((2 - sy) * (dirFlip(a) ? -1 : 1), sy, 1); c.position.y = y; c.rotation.z = rz;
        return;
      }
      a.inner.rotation.y = a.heading;
      const s = Math.sin(t * f * 0.5) * sw;
      a.legsP[0].rotation.x = s * 0.8; a.legsP[1].rotation.x = -s * 0.8;
      a.armsP[0].rotation.x = -s * 0.7; a.armsP[1].rotation.x = s * 0.7;
      a.armsP[0].rotation.z = a.armsP[1].rotation.z = 0;
      if (clip === 'jump') { a.legsP[0].rotation.x = 0.5; a.legsP[1].rotation.x = -0.2; a.armsP[0].rotation.z = -2.2; a.armsP[1].rotation.z = 2.2; }
      if (clip === 'cheer' || clip === 'wave') { a.armsP[1].rotation.z = 2.6 + Math.sin(t * 12) * 0.3 * mo; if (clip === 'cheer') a.armsP[0].rotation.z = -2.6 - Math.sin(t * 12) * 0.3 * mo; }
      a.body.position.y = (Math.abs(s) * 0.05 + (clip === 'cheer' ? Math.abs(Math.sin(t * 9)) * 0.12 : 0)) * mo;
      const br = 1 + Math.sin(t * TAU * 0.4) * 0.02 * mo - a.squashV * 0.15 * mo;
      a.body.scale.set(2 - br, br, 2 - br);
      a.body.rotation.x = clip === 'hurt' ? -0.3 : sw * 0.08;
      if ((a.blinkIn -= dt) < 0) { a.blinkIn = 2 + rr() * 4; a.blinkT = 0.12; }
      const bl = (a.blinkT = Math.max(0, (a.blinkT || 0) - dt)) > 0 || clip === 'cheer' || clip === 'hurt';
      for (const e of a.eyes) e.scale.y = bl ? 0.12 : 1;
    }
    const hv = new T.Vector3();
    function dirFlip(a) { hv.set(Math.sin(a.heading), 0, Math.cos(a.heading)); return camera ? hv.dot(right) < -0.05 : false; }
    // ---- running it ----
    function run(fn) {
      if (!renderer) { kit.warn('Oomba.three: run() needs the renderer'); return B; }
      let last = 0, acc = 0;
      renderer.setAnimationLoop(ts => {
        const d = last ? (ts - last) / 1000 : 1 / 60; last = ts; acc += d;
        if ((tier === 'low' || B.quality === 0) && acc < 1 / 31) return;   // 30 fps on slow devices
        const step = Math.min(0.1, acc); acc = 0;
        if (fn) fn(step); update(step); renderer.render(scene, camera);
      });
      return B;
    }
    function fit(opt = {}) {
      if (!renderer || !camera) return B;
      const doFit = () => {
        const c = renderer.domElement, w = (c.parentNode && c.parentNode.clientWidth) || kit.win.innerWidth, h = (c.parentNode && c.parentNode.clientHeight) || kit.win.innerHeight;
        renderer.setPixelRatio(Math.min(kit.win.devicePixelRatio || 1, dprCap * [0.75, 0.88, 1][B.quality])); renderer.setSize(w, h, false);
        camera.aspect = w / h; if (opt.onResize) opt.onResize(w, h); camera.updateProjectionMatrix();
      };
      doFit(); kit.win.addEventListener('resize', doFit); return B;
    }
    const toScreen = v => { const p = (v.isVector3 ? v.clone() : v.getWorldPosition(new T.Vector3())).project(camera), c = renderer.domElement; return { x: (p.x + 1) / 2 * c.clientWidth, y: (1 - p.y) / 2 * c.clientHeight, behind: p.z > 1 }; };
    function dispose() { for (const x of own) if (x && x.dispose) x.dispose(); if (renderer) renderer.setAnimationLoop(null); }
    Object.assign(B, { toon, inkify, outline, bake, sky, world, prop, sprite, rig, spark, character: (spec, opt = {}) => (opt.as === 'sprite' ? sprite(spec, opt) : rig(spec, opt)), update, run, fit, setQuality, toScreen, dispose });
    kit.three3d = B;
    return B;
  }
  const O = api();
  if (O && !O.three) Object.defineProperty(O, 'three', { value: bridge, enumerable: true });
  kit.bridge3d = bridge;
}
