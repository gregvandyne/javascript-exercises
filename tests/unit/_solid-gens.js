// The figure question generators for the 1.1.0 solids, nets, mapping diagram and ruler, read straight from
// docs/figures-api.md (so the page's examples are the ones tested): kind -> gen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function docGens() {
  const md = fs.readFileSync(path.join(ROOT, 'docs/figures-api.md'), 'utf8'), out = {};
  for (const m of md.matchAll(/```json\n([\s\S]*?)\n```/g)) for (const line of m[1].split('\n')) {
    let g; try { g = JSON.parse(line); } catch { continue; }
    if (!g || !g.fig) continue;
    const k = g.fig.kind === 'reading' && g.fig.type === 'ruler' ? 'ruler' : g.fig.kind;
    if (['prism', 'cylinder', 'pyramid', 'cone', 'sphere', 'net', 'mappingDiagram', 'ruler'].includes(k)) out[k] = g;
  }
  return out;
}
