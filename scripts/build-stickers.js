#!/usr/bin/env node
// The Class Board's sticker library, made ready to serve (docs/decisions.md "Class Board: stickers widget back").
//   node scripts/build-stickers.js <unzipped-folder>
// <unzipped-folder> holds docs/class-board/sticker-library/*.zip unzipped (illustrated-individual/ and greetings/).
// Writes public/img/stickers/:
//   ill/<name>.webp    each illustrated PNG as a transparent WebP, at most 512 px on its longer side (alpha kept as is)
//   ill/t/<name>.webp  the same at most 192 px, for the sticker panel's grid
//   gr/<file>.svg      each greeting SVG, byte for byte
//   index.json         docs/class-board/sticker-library/search-index.json with each file pointed at its served path, plus
//                      each sticker's width and height (read from the file). Nothing else is changed or added: no
//                      keyword is typed or invented here.
// Needs ImageMagick 6 or 7 (`convert` or `magick`) with WebP. Run it again after the library changes.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LIB = path.join(ROOT, 'docs/class-board/sticker-library');
const OUT = path.join(ROOT, 'public/img/stickers');
const src = process.argv[2];
if (!src || !fs.existsSync(path.join(src, 'illustrated-individual')) || !fs.existsSync(path.join(src, 'greetings'))) {
  console.error('usage: node scripts/build-stickers.js <folder with illustrated-individual/ and greetings/ unzipped>');
  process.exit(1);
}
const im = (() => { for (const bin of ['magick', 'convert']) { try { execFileSync(bin, ['-version'], { stdio: 'ignore' }); return bin; } catch { /* next */ } } return null; })();
if (!im) { console.error('ImageMagick (magick or convert) is needed'); process.exit(1); }

const index = JSON.parse(fs.readFileSync(path.join(LIB, 'search-index.json'), 'utf8'));
const entries = index.entries;
if (entries.length !== index.total) { console.error(`search-index.json says ${index.total} but has ${entries.length}`); process.exit(1); }
const missing = entries.filter(e => !fs.existsSync(path.join(src, e.file))).map(e => e.file);
if (missing.length) { console.error(`missing after unzipping (${missing.length}):\n${missing.join('\n')}`); process.exit(1); }

for (const d of ['ill/t', 'gr']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const webp = (from, to, side, q) => execFileSync(im, [from, '-resize', `${side}x${side}>`, '-quality', String(q), '-define', 'webp:alpha-quality=100', '-define', 'webp:method=6', to]);
const sizeOf = f => {
  const out = execFileSync(im === 'magick' ? 'magick' : 'identify', [...(im === 'magick' ? ['identify'] : []), '-format', '%w %h', f]).toString().trim().split(' ').map(Number);
  return out;
};
const svgSize = f => {
  const s = fs.readFileSync(f, 'utf8').slice(0, 400);
  const w = /\bwidth="(\d+(?:\.\d+)?)"/.exec(s), h = /\bheight="(\d+(?:\.\d+)?)"/.exec(s);
  return [Math.round(+(w && w[1]) || 600), Math.round(+(h && h[1]) || 400)];
};

let before = 0, after = 0, n = 0;
const out = [];
for (const e of entries) {
  const from = path.join(src, e.file), base = path.basename(e.file);
  before += fs.statSync(from).size;
  let file, thumb, w, h;
  if (e.file.startsWith('illustrated-individual/')) {
    const name = base.replace(/\.png$/i, '');
    file = `ill/${name}.webp`; thumb = `ill/t/${name}.webp`;
    webp(from, path.join(OUT, file), 512, 86);
    webp(from, path.join(OUT, thumb), 192, 82);
    [w, h] = sizeOf(path.join(OUT, file));
    after += fs.statSync(path.join(OUT, file)).size + fs.statSync(path.join(OUT, thumb)).size;
  } else {
    file = `gr/${base}`; thumb = '';
    fs.copyFileSync(from, path.join(OUT, file));
    [w, h] = svgSize(from);
    after += fs.statSync(path.join(OUT, file)).size;
  }
  // The supplied entry as it is (id, sheet, theme, name, text, language, keywords, and a greeting's palette and shape),
  // with only the file pointed at the served copy.
  out.push({ ...e, file, ...(thumb ? { thumb } : {}), w, h });
  if (++n % 250 === 0) process.stdout.write(`${n}/${entries.length}\r`);
}
const json = { total: out.length, fields: [...index.fields, 'thumb', 'w', 'h'], base: '/img/stickers/', entries: out };
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(json));
after += fs.statSync(path.join(OUT, 'index.json')).size;
const mb = x => `${(x / 1048576).toFixed(1)} MB`;
console.log(`${out.length} stickers: source ${mb(before)}, served ${mb(after)} (index.json included)`);
