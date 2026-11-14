// FBX packs to raw GLB, one folder per pack: node kit2/pipeline/fbx-to-glb.mjs <packs-dir> <raw-dir> [pack …]
// <packs-dir>/<pack>/ holds the pack as uploaded (FBX files and pictures anywhere inside it; branch asset-packs).
// Needs FBX2glTF 0.9.7 (npm fbx2gltf, or FBX2GLTF=/path/to/FBX2glTF): like build-theme.mjs, copy the pipeline folder to
// where its tools are installed and run it there. Pack files are data: nothing in them is run, and the converter works in
// a scratch folder of links, never inside the pack.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';

const [packsDir, rawDir, ...only] = process.argv.slice(2);
const bin = process.env.FBX2GLTF || path.join(path.dirname(createRequire(import.meta.url).resolve('fbx2gltf')), 'bin', os.type(), 'FBX2glTF');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const run = (cwd, args) => new Promise(res => execFile(bin, args, { cwd, timeout: 300000 }, (err, so, se) => res({ err, log: so + se })));

for (const pack of fs.readdirSync(packsDir).filter(p => fs.statSync(path.join(packsDir, p)).isDirectory() && (!only.length || only.includes(p))).sort()) {
  const files = walk(path.join(packsDir, pack));
  const fbx = files.filter(f => /\.fbx$/i.test(f)).sort();
  if (!fbx.length) continue;
  const links = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-')), out = path.join(rawDir, pack);
  fs.mkdirSync(out, { recursive: true });
  for (const f of files.filter(f => /\.(fbx|png|jpe?g)$/i.test(f))) fs.symlinkSync(path.resolve(f), path.join(links, path.basename(f)));
  let bad = 0; const queue = [...fbx];
  await Promise.all(Array.from({ length: Math.max(2, os.cpus().length) }, async () => {
    for (let f; (f = queue.shift());) {
      const name = path.basename(f).replace(/\.fbx$/i, '');
      const r = await run(links, ['--binary', '--pbr-metallic-roughness', '--input', path.basename(f), '--output', path.join(path.resolve(out), name)]);
      fs.writeFileSync(path.join(out, name + '.log'), r.log);
      if (r.err || !fs.existsSync(path.join(out, name + '.glb'))) { bad++; console.log('FAILED', pack, name); }
    }
  }));
  fs.rmSync(links, { recursive: true });
  console.log(`${pack}: ${fbx.length - bad} of ${fbx.length} converted`);
}
