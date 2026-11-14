// Opt-in steps build-theme.mjs runs on a model before it is compressed, for packs that arrive as FBX (kit2/packs/,
// converted by fbx-to-glb.mjs). A recipe item that names none of these fields is left exactly as it was.
//   scale: 0.5                     the whole model, about its origin (skeletons and their clips too)
//   anims: { walk: 'Armature|Walk' }  keep only these clips, under these names (kid-safe: no attack, hit or death clips)
//   textures: { '^colormap$': 'Textures/colormap.png' }  a colour picture for every material whose name matches (FBX
//                                  files here name no picture file), read from recipe.texturesDir
//   keepColour: ['MI_Vine']        materials whose own colour still tints their picture (a grey leaf picture, a green material)
//   textureSize: 512               the longest side any picture may have (needs sharp; JPEG, or PNG when it has see-through parts)
//   colourOnly: true               drop normal, roughness, metal and glow pictures (the Oomba look is flat colour and ink)
//   matte: true                    no metal, roughness at least 0.6 (FBX converters guess shiny values from old Phong numbers)
//   cutout: ['Leaves', 'Flowers']  materials (name starts with) drawn as cut-outs (alphaMode MASK, both sides) instead of blended
//   dropMeshes: ['^Gun']           remove every mesh node whose name matches (held items)
//   dropVertexColours: true        ignore COLOR_0
//   stretch: [1, 6, 1]             the model stretched along x, y and z about its origin, before anything else (a thin
//                                  sand patch made into an island thick enough to stand in the sea); for still models
//   taper: 0.5                     the model made narrower towards its top (x and z times 1 at its base and this at its
//                                  top, more and more the higher up), after any stretch: a round stone made into an
//                                  egg; for still models
//   shift: [0, 0.05, 0]            the model moved by this much before it is scaled (a kit whose models all sit a little
//                                  below their own floor: the Kenney Nature Kit)
//   colours: { '^grass$': '#5fbf4a' }  the plain colour of every material whose name matches, as an sRGB hex colour (FBX
//                                  files here carry their colours in a way the converter reads too pale or too dark)
//   inkNormals: true               for flat-shaded low-poly models: give every corner one shared, averaged normal and mark
//                                  the materials extras.flat = true. An ink outline (a copy pushed out along the normals)
//                                  then stays in one piece instead of cracking at every hard edge; whoever draws the model
//                                  sets flatShading on a material marked flat, so the faces still look flat.
//   floor: true                    the model moved so its lowest point is at y 0 and it is centred in x and z, measured in
//                                  its rest pose with its skeleton applied (sea animals, whose packs put the origin in the
//                                  middle of the body: every animal then stands on its y like the land animals do)
//   dropMaterials: ['teeth$']      remove every part drawn with a material whose name matches
//   swimRig: { length: 2.6, turn: 90, stretch: [1.5, 1, 1], bones: 5, amp: 0.5, idle: 2.4, swim: 0.9, flap: { from: 0.45, amp: 0.5 } }
//                                  for a fish that arrives still (no clips; a skeleton it has is baked in and dropped): the
//                                  model is turned `turn` degrees so its head points along +z, made `length` long, stood on
//                                  y 0, and given a spine of `bones` joints with two clips made here, "idle" (a slow sway) and
//                                  "swim" (a wave that runs to the tail; amp is the tail's swing in radians, idle and swim are
//                                  the seconds one beat takes). flap adds two side joints for flippers that beat up and down
//                                  (a turtle): from is where they start, as a part of the half width.
//   brighten: { gamma: 0.8, gain: 1.1, saturate: 1.15, floor: 0.02 }  lift flat material colours (packs whose FBX colours
//                                  draw darker than their store pictures): in sRGB, colour^gamma * gain, then more or less
//                                  colourful; materials darker than floor (eyes, noses, hooves) stay as they are
import fs from 'node:fs';
import path from 'node:path';

let sharp = null;
const picture = async () => sharp || (sharp = (await import('sharp')).default);

// 4x4 matrices as glTF stores them (column-major arrays of 16).
const mul4 = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** Every mesh part's corner points where they really are in the rest pose: with the skeleton applied for a rigged model
 *  (whatever the converter put into the mesh's own node), with the node's place for a still one. -> [{ node, prim, pos, nor }] */
function restPose(root) {
  const out = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(), skin = node.getSkin(); if (!mesh) continue;
    const ibm = skin && skin.getInverseBindMatrices();
    const mats = skin ? skin.listJoints().map((j, i) => mul4(j.getWorldMatrix(), ibm ? ibm.getElement(i, []) : IDENTITY)) : null, own = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), J = prim.getAttribute('JOINTS_0'), Wt = prim.getAttribute('WEIGHTS_0'); if (!P) continue;
      const n = P.getCount(), pos = new Float32Array(n * 3), nor = N ? new Float32Array(n * 3) : null;
      for (let i = 0; i < n; i++) {
        let m = own;
        if (mats && J && Wt) {
          const j = J.getElement(i, []), w = Wt.getElement(i, []), sum = w.reduce((a, b) => a + b, 0) || 1; m = new Array(16).fill(0);
          for (let k = 0; k < 4; k++) if (w[k]) { const jm = mats[j[k]]; for (let e = 0; e < 16; e++) m[e] += jm[e] * w[k] / sum; }
        }
        const v = P.getElement(i, []);
        pos.set([m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]], i * 3);
        if (nor) { const q = N.getElement(i, []), x = m[0] * q[0] + m[4] * q[1] + m[8] * q[2], y = m[1] * q[0] + m[5] * q[1] + m[9] * q[2], z = m[2] * q[0] + m[6] * q[1] + m[10] * q[2], l = Math.hypot(x, y, z) || 1; nor.set([x / l, y / l, z / l], i * 3); }
      }
      out.push({ node, prim, pos, nor });
    }
  }
  return out;
}
const boundsOf = parts => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const { pos } of parts) for (let i = 0; i < pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], pos[i]); hi[i % 3] = Math.max(hi[i % 3], pos[i]); } return { lo, hi }; };

/** swimRig: see the top of this file. The model becomes one still shape in the scene's own space, then gets its spine. */
function swimRig(doc, o) {
  const root = doc.getRoot(), scene = root.getDefaultScene() || root.listScenes()[0], buffer = root.listBuffers()[0];
  const parts = restPose(root), turn = (o.turn || 0) * Math.PI / 180, ct = Math.cos(turn), st = Math.sin(turn);
  for (const p of parts) for (const a of [p.pos, p.nor]) if (a && turn) for (let i = 0; i < a.length; i += 3) { const x = a[i], z = a[i + 2]; a[i] = x * ct + z * st; a[i + 2] = -x * st + z * ct; }
  if (o.stretch) for (const p of parts) for (let i = 0; i < p.pos.length; i++) p.pos[i] *= o.stretch[i % 3];   // along x, y and z, once its head points along +z
  let { lo, hi } = boundsOf(parts);
  const k = o.length ? o.length / (hi[2] - lo[2]) : 1, move = [-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2];
  for (const p of parts) for (let i = 0; i < p.pos.length; i++) p.pos[i] = (p.pos[i] + move[i % 3]) * k;
  ({ lo, hi } = boundsOf(parts));
  // The old skeleton and node places go: every mesh node sits in the scene, unmoved, with its points where they are.
  for (const sk of root.listSkins()) sk.dispose();
  for (const an of root.listAnimations()) { const bits = [...an.listSamplers(), ...an.listChannels()]; an.dispose(); bits.forEach(b => b.dispose()); }
  const meshNodes = [...new Set(parts.map(p => p.node))];
  for (const n of meshNodes) { scene.addChild(n); n.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]); }
  for (const n of root.listNodes()) if (!meshNodes.includes(n)) n.dispose();
  // The spine: joints from the head (+z) to the tail, each the child of the one before.
  const L = hi[2] - lo[2], cy = (lo[1] + hi[1]) / 2, hw = (hi[0] - lo[0]) / 2, count = Math.max(3, o.bones || 5);
  const at = Array.from({ length: count }, (_, i) => (i ? 0.3 + 0.56 * (i - 1) / Math.max(1, count - 2) : 0));   // parts of the length, from the head
  const place = at.map(f => [0, cy, hi[2] - f * L]), joints = place.map((_, i) => doc.createNode(`spine${i}`));
  joints.forEach((j, i) => { if (i) { j.setTranslation([0, 0, place[i][2] - place[i - 1][2]]); joints[i - 1].addChild(j); } else { j.setTranslation(place[0]); scene.addChild(j); } });
  const flap = o.flap ? [1, -1].map(side => { const j = doc.createNode(side > 0 ? 'flipperL' : 'flipperR'), x = side * hw * o.flap.from; j.setTranslation([x, 0, place[0][2] - L * (o.flap.at ?? 0.4) - place[1][2]]); joints[1].addChild(j); return { j, x, side }; }) : [];
  const all = [...joints, ...flap.map(f => f.j)], spots = [...place, ...flap.map(f => [f.x, cy, place[0][2] - L * (o.flap.at ?? 0.4)])];
  const ibm = new Float32Array(all.length * 16); spots.forEach((p, i) => ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1], i * 16));
  const skin = doc.createSkin('swim').setSkeleton(joints[0]).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer));
  for (const j of all) skin.addJoint(j);
  for (const p of parts) {
    const n = p.pos.length / 3, J = new Uint8Array(n * 4), Wt = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const f = (hi[2] - p.pos[i * 3 + 2]) / L; let a = count - 1, b = count - 1, t = 0;
      for (let s = 0; s + 1 < count; s++) if (f < at[s + 1]) { a = s; b = s + 1; t = Math.max(0, (f - at[s]) / (at[s + 1] - at[s])); t = t * t * (3 - 2 * t); break; }
      let w = [[a, 1 - t], [b, t]];
      if (flap.length) { const x = p.pos[i * 3], out = Math.min(1, Math.max(0, (Math.abs(x) - hw * o.flap.from) / (hw * 0.2))); if (out > 0) w = [...w.map(([j, v]) => [j, v * (1 - out)]), [count + (x > 0 ? 0 : 1), out]]; }
      w = w.filter(([, v]) => v > 0.001); const sum = w.reduce((s0, [, v]) => s0 + v, 0);
      w.forEach(([j, v], q) => { J[i * 4 + q] = j; Wt[i * 4 + q] = v / sum; });
    }
    p.prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(p.pos).setBuffer(buffer));
    if (p.nor) p.prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(p.nor).setBuffer(buffer));
    p.prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J).setBuffer(buffer)).setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(Wt).setBuffer(buffer));
    for (const sem of p.prim.listSemantics()) if (/^(JOINTS|WEIGHTS)_[1-9]/.test(sem)) p.prim.setAttribute(sem, null);
  }
  for (const n of meshNodes) n.setSkin(skin);
  // Two clips: the head sways a little one way while the wave grows towards the tail, each joint a beat behind the last.
  const amp = o.amp ?? 0.5, steps = 16;
  for (const [name, beat, much] of [['idle', o.idle ?? 2.4, 0.4], ['swim', o.swim ?? 0.9, 1]]) {
    const an = doc.createAnimation(name), times = doc.createAccessor().setType('SCALAR').setArray(Float32Array.from({ length: steps + 1 }, (_, i) => beat * i / steps)).setBuffer(buffer);
    const turnOf = (node, axis, swing, lag) => {
      const q = new Float32Array((steps + 1) * 4);
      for (let i = 0; i <= steps; i++) { const h = swing * Math.sin(2 * Math.PI * i / steps - lag) / 2; q[i * 4 + axis] = Math.sin(h); q[i * 4 + 3] = Math.cos(h); }
      const s = doc.createAnimationSampler().setInput(times).setOutput(doc.createAccessor().setType('VEC4').setArray(q).setBuffer(buffer)).setInterpolation('LINEAR');
      an.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('rotation').setSampler(s));
    };
    joints.forEach((j, i) => turnOf(j, 1, amp * much * (i ? 0.22 + 0.5 * i / (count - 1) : -0.2), i * 0.7));
    for (const f of flap) turnOf(f.j, 2, f.side * o.flap.amp * (much < 1 ? 0.6 : 1), 0);
  }
}

export async function packSteps(doc, item, recipe, recipeDir) {
  const root = doc.getRoot();
  if (item.dropMaterials) for (const m of root.listMeshes()) for (const p of m.listPrimitives()) if (p.getMaterial() && item.dropMaterials.some(k => new RegExp(k).test(p.getMaterial().getName()))) { m.removePrimitive(p); p.dispose(); }
  if (item.dropMeshes) for (const n of root.listNodes()) if (n.getMesh() && item.dropMeshes.some(k => new RegExp(k).test(n.getName()) || new RegExp(k).test(n.getMesh().getName()))) n.setMesh(null).setSkin(null);
  if (item.swimRig) swimRig(doc, item.swimRig);
  if (item.stretch) {
    const done = new Set();
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
      const acc = p.getAttribute('POSITION'); if (!acc || done.has(acc)) continue; done.add(acc);
      const a = new Float32Array(acc.getArray()); for (let i = 0; i < a.length; i++) a[i] *= item.stretch[i % 3]; acc.setArray(a);
    }
  }
  if (item.taper) {
    const accs = new Set(); for (const m of root.listMeshes()) for (const p of m.listPrimitives()) if (p.getAttribute('POSITION')) accs.add(p.getAttribute('POSITION'));
    let lo = Infinity, hi = -Infinity; for (const acc of accs) { const a = acc.getArray(); for (let i = 1; i < a.length; i += 3) { lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); } }
    for (const acc of accs) { const a = new Float32Array(acc.getArray()); for (let i = 0; i < a.length; i += 3) { const t = (a[i + 1] - lo) / (hi - lo || 1), k = 1 + (item.taper - 1) * t * t; a[i] *= k; a[i + 2] *= k; } acc.setArray(a); }
  }
  if (item.floor) { const { lo, hi } = boundsOf(restPose(root)), by = [-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2]; for (const sc of root.listScenes()) for (const n of sc.listChildren()) n.setTranslation(n.getTranslation().map((v, i) => v + by[i])); }
  if (item.shift) for (const sc of root.listScenes()) for (const n of sc.listChildren()) n.setTranslation(n.getTranslation().map((v, i) => v + item.shift[i]));
  if (item.colours) {
    const linear = hex => [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    for (const m of root.listMaterials()) {
      const hit = Object.entries(item.colours).find(([k]) => new RegExp(k).test(m.getName()));
      if (hit) m.setBaseColorFactor([...linear(hit[1]), m.getBaseColorFactor()[3]]);
    }
  }
  if (item.anims) {
    const first = new Map(); for (const a of root.listAnimations()) if (!first.has(a.getName())) first.set(a.getName(), a);
    const keep = new Map();
    for (const [to, from] of Object.entries(item.anims)) { const a = first.get(from); if (!a) throw new Error(`${item.from}: no clip "${from}" for ${to}`); keep.set(a, to); }
    for (const a of root.listAnimations()) {
      if (keep.has(a)) { a.setName(keep.get(a)); continue; }
      const parts = [...a.listSamplers(), ...a.listChannels()]; a.dispose(); parts.forEach(p => p.dispose());
    }
  }
  if (item.inkNormals) {
    for (const mesh of root.listMeshes()) {
      const sum = new Map(), key = (a, i) => { const e = a.getElement(i, []); return `${Math.round(e[0] * 1e4)},${Math.round(e[1] * 1e4)},${Math.round(e[2] * 1e4)}`; };
      const prims = mesh.listPrimitives().filter(p => p.getMode() === 4 && p.getAttribute('POSITION'));
      for (const p of prims) {
        const pos = p.getAttribute('POSITION'), idx = p.getIndices(), n = idx ? idx.getCount() : pos.getCount();
        for (let t = 0; t + 2 < n; t += 3) {
          const [a, b, c] = [0, 1, 2].map(j => idx ? idx.getScalar(t + j) : t + j), A = pos.getElement(a, []), B = pos.getElement(b, []), C = pos.getElement(c, []);
          const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
          const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];   // its length is twice the area: big faces count more
          for (const i of [a, b, c]) { const k = key(pos, i), s0 = sum.get(k) || [0, 0, 0]; sum.set(k, [s0[0] + f[0], s0[1] + f[1], s0[2] + f[2]]); }
        }
      }
      for (const p of prims) {
        const pos = p.getAttribute('POSITION'), out = new Float32Array(pos.getCount() * 3);
        for (let i = 0; i < pos.getCount(); i++) { const s0 = sum.get(key(pos, i)) || [0, 1, 0], l = Math.hypot(...s0) || 1; out.set([s0[0] / l, s0[1] / l, s0[2] / l], i * 3); }
        p.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(out).setBuffer(root.listBuffers()[0]));
        if (p.getMaterial()) p.getMaterial().setExtras({ ...p.getMaterial().getExtras(), flat: true });
      }
    }
  }
  if (item.brighten) {
    const { gamma = 1, gain = 1, saturate = 1, floor = 0.02 } = item.brighten;
    const toS = v => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055, toL = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    for (const m of root.listMaterials()) {
      const [r, g, b, a] = m.getBaseColorFactor();
      if (Math.max(r, g, b) < floor) continue;
      let c = [r, g, b].map(v => Math.min(1, Math.pow(toS(v), gamma) * gain));
      const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      c = c.map(v => Math.min(1, Math.max(0, y + (v - y) * saturate)));
      m.setBaseColorFactor([...c.map(v => +toL(v).toFixed(4)), a]);
    }
  }
  if (item.dropVertexColours) for (const m of root.listMeshes()) for (const p of m.listPrimitives()) if (p.getAttribute('COLOR_0')) p.setAttribute('COLOR_0', null);
  if (item.textures) {
    const dir = path.resolve(recipeDir, recipe.texturesDir || '.');
    const made = new Map();
    for (const m of root.listMaterials()) {
      const hit = Object.entries(item.textures).find(([k]) => new RegExp(k).test(m.getName()));
      if (!hit) continue;
      if (!made.has(hit[1])) made.set(hit[1], doc.createTexture(path.basename(hit[1])).setImage(fs.readFileSync(path.join(dir, hit[1]))).setMimeType(/\.jpe?g$/i.test(hit[1]) ? 'image/jpeg' : 'image/png'));
      m.setBaseColorTexture(made.get(hit[1]));
      if (!(item.keepColour || []).includes(m.getName())) m.setBaseColorFactor([1, 1, 1, m.getBaseColorFactor()[3]]);
    }
  }
  for (const m of root.listMaterials()) {
    if (item.colourOnly) m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    if (item.matte) m.setMetallicFactor(0).setRoughnessFactor(Math.max(0.6, m.getRoughnessFactor()));
    if (item.cutout && item.cutout.some(k => m.getName().startsWith(k))) m.setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(true);
  }
  if (item.textureSize) {
    const sh = await picture();
    const seeThrough = new Set(root.listMaterials().filter(m => m.getAlphaMode() !== 'OPAQUE').map(m => m.getBaseColorTexture()).filter(Boolean));
    // A texture no material uses any more (a dropped normal map) is not worth shrinking: prune() removes it.
    const used = new Set(root.listMaterials().flatMap(m => [m.getBaseColorTexture(), m.getNormalTexture(), m.getMetallicRoughnessTexture(), m.getOcclusionTexture(), m.getEmissiveTexture()]).filter(Boolean));
    for (const t of root.listTextures()) {
      if (!used.has(t)) { t.dispose(); continue; }
      const size = t.getSize(); if (!size || !t.getImage()) continue;
      const big = Math.max(...size) > item.textureSize;
      if (!big && !(item.textureSize && t.getImage().byteLength > 200000)) continue;
      const img = sh(Buffer.from(t.getImage())).resize(item.textureSize, item.textureSize, { fit: 'inside', withoutEnlargement: true });
      if (seeThrough.has(t)) t.setImage(new Uint8Array(await img.png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toBuffer())).setMimeType('image/png');
      else t.setImage(new Uint8Array(await img.flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer())).setMimeType('image/jpeg');
    }
  }
  if (item.scale && item.scale !== 1) {
    // Baked in, not a scale on a node: every position, every node's place, every joint's bind place and every clip's
    // moves are multiplied, so the model is simply that much bigger or smaller (and an ink outline keeps its width).
    const k = item.scale, done = new Set();
    const mul = (acc, stride, pick) => { if (!acc || done.has(acc)) return; done.add(acc); const a = acc.getArray().slice(); const out = a instanceof Float32Array ? a : new Float32Array(a); for (let i = 0; i < out.length; i++) if (pick(i % stride)) out[i] *= k; acc.setArray(out); };
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { mul(p.getAttribute('POSITION'), 3, () => true); for (const t of p.listTargets()) mul(t.getAttribute('POSITION'), 3, () => true); }
    for (const n of root.listNodes()) n.setTranslation(n.getTranslation().map(v => v * k));
    for (const sk of root.listSkins()) mul(sk.getInverseBindMatrices(), 16, i => i >= 12 && i <= 14);
    for (const an of root.listAnimations()) for (const ch of an.listChannels()) if (ch.getTargetPath() === 'translation') mul(ch.getSampler().getOutput(), 3, () => true);
  }
}
