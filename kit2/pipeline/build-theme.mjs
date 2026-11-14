// Builds one Kit 2 theme from its downloaded packs: node kit2/pipeline/build-theme.mjs <recipe.json> <packs-dir> <out-dir>
// Needs @gltf-transform/{core,extensions,functions}@4.2.1 and meshoptimizer@0.22.0: copy this file into a folder where
// they are installed and run it there (they are not app dependencies:
// they only run here, on a developer machine). Output is deterministic for the same inputs, so a rebuild of a shipped
// version must give the same bytes (tests/unit/kit2-themes.test.js checks the lock).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, weld, reorder, unpartition, getBounds, palette, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { packSteps } from './pack-steps.mjs';

const [recipeFile, packsDir, outDir, sizesFile] = process.argv.slice(2);   // sizesFile: optional, gets each model's measured size
const measured = {};
const recipe = JSON.parse(fs.readFileSync(recipeFile, 'utf8'));
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
fs.mkdirSync(outDir, { recursive: true });

// recipe.meshopt: true adds EXT_meshopt_compression (smaller files, but its decoder needs WebAssembly, which the game frame
// does not allow: docs/safety.md). Without it the models are quantized only (KHR_mesh_quantization, decoded by Three.js
// itself) and the server sends them brotli-compressed.
// An item's own "meshopt": true does the same for that one model (creatures: their many clips shrink to less than half).
// An item's "oneDraw": true (flat-coloured models with many materials: the animals) puts every material's colour into
// one tiny palette picture and joins the parts, so the model is one draw call instead of one per colour.
async function compress(doc, item = {}) {
  if (item.oneDraw) {
    const flat = doc.getRoot().listMaterials().some(m => m.getExtras().flat);
    // one roughness, no glow: the palette then needs a single picture (colour)
    for (const m of doc.getRoot().listMaterials()) m.setRoughnessFactor(0.9).setMetallicFactor(0).setEmissiveFactor([0, 0, 0]);
    await doc.transform(palette({ min: 1, blockSize: 4 }), weld());
    for (const mesh of doc.getRoot().listMeshes()) {
      const prims = mesh.listPrimitives(); if (prims.length < 2 || new Set(prims.map(q => q.getMaterial())).size > 1) continue;
      const one = joinPrimitives(prims); for (const q of prims) { mesh.removePrimitive(q); q.dispose(); } mesh.addPrimitive(one);
    }
    if (flat) for (const m of doc.getRoot().listMaterials()) m.setExtras({ ...m.getExtras(), flat: true });
  }
  await doc.transform(dedup(), weld(), resample(), prune({ keepAttributes: false }), reorder({ encoder: MeshoptEncoder }), quantize(), unpartition());
  if (recipe.meshopt || item.meshopt) doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  return doc;
}

const out = [];
// "theme:<theme>/<version>/<file>" is a file from an already built theme (its own licence travels with it).
const source = from => from.startsWith('theme:') ? path.resolve(path.dirname(recipeFile), '../../../public/vendor/themes', from.slice(6)) : path.join(packsDir, from);
for (const item of recipe.models) {
  const doc = await io.read(source(item.from));
  const root = doc.getRoot();
  // Kid-safe: drop every mesh the recipe does not keep (held weapons, mugs), and every animation it does not keep.
  if (item.keepMeshes) for (const n of root.listNodes()) if (n.getMesh() && !item.keepMeshes.some(k => new RegExp(`^${k}$`).test(n.getName()))) { n.setMesh(null); }
  // An animation's samplers and channels go with it, or prune() keeps their keyframe data.
  for (const a of root.listAnimations()) if (!(item.keepAnims || []).includes(a.getName())) { const parts = [...a.listSamplers(), ...a.listChannels()]; a.dispose(); parts.forEach(p => p.dispose()); }
  if (item.animsOnly) for (const n of root.listNodes()) if (n.getMesh()) n.setMesh(null).setSkin(null);
  // Textures stay as they are: every pack here uses one small shared colour map. Packs converted from FBX (the staged
  // asset packs: kit2/packs/) ask for more with opt-in fields (scale, clip names, textures by material name, …), which do
  // nothing for a recipe that does not name them, so a shipped theme rebuilds to the same bytes.
  await packSteps(doc, item, recipe, path.dirname(recipeFile));
  await compress(doc, item);
  const file = path.join(outDir, item.to);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, await io.writeBinary(doc));
  out.push(item.to);
  if (!item.animsOnly) { const b = getBounds(doc.getRoot().getDefaultScene()); measured[item.to] = { size: b.max.map((v, i) => +(v - b.min[i]).toFixed(2)), minY: +b.min[1].toFixed(2) }; }
}
for (const item of recipe.copy || []) {
  const file = path.join(outDir, item.to); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(source(item.from), file); out.push(item.to);
}
if (sizesFile) fs.writeFileSync(sizesFile, JSON.stringify(measured, null, 1));
const sizes = Object.fromEntries(out.map(f => [f, fs.statSync(path.join(outDir, f)).size]));
console.log(JSON.stringify(sizes, null, 1), '\ntotal', Object.values(sizes).reduce((a, b) => a + b, 0));
