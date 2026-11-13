// Writes tests/fixtures/course/diagram-baseline.json: every drawn diagram in the seed decks (its data, its focus
// boxes) with the SHA-256 of the SVG the lesson viewer draws for it. tests/unit/course-diagrams.test.js draws each
// one again and compares, so a change to the drawing code cannot move a pixel of a diagram that already ships
// without the change showing up in review. Run it again (node scripts/nq-diagram-baseline.js) only when a drawing
// is changed on purpose, and say so in the pull request.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cleanSlide } from '../server/services/courses.js';
import { visualSvg, frameOf } from '../server/views/courses.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.json') ? [path.join(d, e.name)] : []));
export const shaOf = slide => { const s = cleanSlide(slide); return s.visual ? crypto.createHash('sha256').update(String(visualSvg(s.visual, frameOf(s)))).digest('hex').slice(0, 32) : null; };
const out = [], seen = new Set();
for (const file of walk(path.join(ROOT, 'seed-lessons')).sort()) {
  let deck; try { deck = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
  if (!deck || !Array.isArray(deck.slides)) continue;
  deck.slides.forEach((sl, i) => {
    if (!sl || !sl.visual) return;
    const slide = { title: 'T', visual: sl.visual, ...(sl.focus ? { focus: sl.focus } : {}) }, key = JSON.stringify(slide);
    if (seen.has(key)) return; seen.add(key);
    const sha = shaOf(slide);
    if (sha) out.push({ from: `${path.relative(path.join(ROOT, 'seed-lessons'), file)} slide ${i + 1}`, slide, sha });
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(ROOT, 'tests/fixtures/course/diagram-baseline.json'), JSON.stringify(out) + '\n');
  console.log(`${out.length} diagrams written`);
}
