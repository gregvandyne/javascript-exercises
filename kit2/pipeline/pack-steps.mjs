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
//   shift: [0, 0.05, 0]            the model moved by this much before it is scaled (a kit whose models all sit a little
//                                  below their own floor: the Kenney Nature Kit)
//   colours: { '^grass$': '#5fbf4a' }  the plain colour of every material whose name matches, as an sRGB hex colour (FBX
//                                  files here carry their colours in a way the converter reads too pale or too dark)
//   inkNormals: true               for flat-shaded low-poly models: give every corner one shared, averaged normal and mark
//                                  the materials extras.flat = true. An ink outline (a copy pushed out along the normals)
//                                  then stays in one piece instead of cracking at every hard edge; whoever draws the model
//                                  sets flatShading on a material marked flat, so the faces still look flat.
import fs from 'node:fs';
import path from 'node:path';

let sharp = null;
const picture = async () => sharp || (sharp = (await import('sharp')).default);

export async function packSteps(doc, item, recipe, recipeDir) {
  const root = doc.getRoot();
  if (item.dropMeshes) for (const n of root.listNodes()) if (n.getMesh() && item.dropMeshes.some(k => new RegExp(k).test(n.getName()) || new RegExp(k).test(n.getMesh().getName()))) n.setMesh(null).setSkin(null);
  if (item.stretch) {
    const done = new Set();
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
      const acc = p.getAttribute('POSITION'); if (!acc || done.has(acc)) continue; done.add(acc);
      const a = new Float32Array(acc.getArray()); for (let i = 0; i < a.length; i++) a[i] *= item.stretch[i % 3]; acc.setArray(a);
    }
  }
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
