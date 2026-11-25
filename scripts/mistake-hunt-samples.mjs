// Mistake Hunt's sample library (docs/decisions.md "Mistake Hunt: a library of sample passages"): writes the passages in
// seed-games/mistake-hunt-samples/grade-<g>.json into seed-games/mistake-hunt.html (between samples:begin and
// samples:end), so the game stays one file. Each passage is { id, g, topic, t, x }: correct US English; the game plants
// its grade's kinds of mistake into it when it is opened, as it does a teacher's text.
// Usage: node scripts/mistake-hunt-samples.mjs [--check]   (--check: exit 1 when the game is out of date)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIR = path.join(ROOT, 'seed-games', 'mistake-hunt-samples');
const GAME = path.join(ROOT, 'seed-games', 'mistake-hunt.html');
const A = '/* samples:begin */', B = '/* samples:end */';

export function readSamples() {
  return fs.readdirSync(DIR).filter(f => /^grade-[1-8]\.json$/.test(f)).sort()
    .flatMap(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')))
    .map(({ id, g, topic, t, x }) => ({ id, g, topic, t, x }));
}
export function build(src, samples = readSamples()) {
  const i = src.indexOf(A), j = src.indexOf(B);
  if (i < 0 || j < i) throw new Error('samples markers not found');
  const body = `\n  var SAMPLES = [\n${samples.map(s => `    ${JSON.stringify(s)}`).join(',\n')}\n  ];\n  `;
  return src.slice(0, i + A.length) + body + src.slice(j);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = fs.readFileSync(GAME, 'utf8'), out = build(src);
  if (process.argv.includes('--check')) { if (out !== src) { console.error('mistake-hunt.html is out of date: run node scripts/mistake-hunt-samples.mjs'); process.exit(1); } console.log('up to date'); }
  else { fs.writeFileSync(GAME, out); console.log(`wrote ${path.relative(ROOT, GAME)} (${readSamples().length} passages)`); }
}
