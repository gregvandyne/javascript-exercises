// Writes <out-dir>/theme.json from a theme's theme.src.json, adding every file's size and sha384 and the load totals.
// node kit2/pipeline/manifest.mjs kit2/themes/<theme>/theme.src.json public/vendor/themes/<theme>/<version>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [srcFile, dir] = process.argv.slice(2);
const theme = JSON.parse(fs.readFileSync(srcFile, 'utf8'));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = {};
for (const abs of walk(dir).sort()) {
  const rel = path.relative(dir, abs).split(path.sep).join('/');
  if (rel === 'theme.json') continue;
  const buf = fs.readFileSync(abs);
  files[rel] = { bytes: buf.length, sha384: 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64') };
}
// The first load: every model, the moves and the sounds (a game may load fewer). Licences, the source log and the cover are not loaded by games.
const loaded = Object.entries(files).filter(([f]) => /\.(glb|gltf|ogg|mp3|wav|png)$/.test(f));
theme.files = files;
theme.firstLoadBytes = loaded.reduce((s, [, v]) => s + v.bytes, 0);
fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify(theme, null, 1) + '\n');
console.log(`${theme.id} ${theme.version}: ${Object.keys(files).length} files, first load ${(theme.firstLoadBytes / 1048576).toFixed(2)} MB`);
