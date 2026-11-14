// The Studio picker's small pictures of the sprite animals (public/img/art2d/animals/<id>.webp, 96 x 64): the first
// standing frame of each animal's sheet in the newest locked "animals" 2D art pack, on a see-through background.
//   node scripts/art2d-thumbs.js
// Needs the Playwright Chromium (BRB_CHROMIUM, or the one Playwright installed). tests/unit/art2d.test.js checks that
// every animal the picker offers has its picture.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit2/ART2D.json'), 'utf8'));
const version = Object.keys(lock.packs).filter(k => k.startsWith('animals/')).map(k => k.split('/')[1]).sort().pop();
const dir = path.join(ROOT, 'public/vendor/art2d/animals', version), m = JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8'));
const out = path.join(ROOT, 'public/img/art2d/animals'); fs.mkdirSync(out, { recursive: true });
const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const [id, s] of Object.entries(m.sprites)) {
  const src = 'data:image/webp;base64,' + fs.readFileSync(path.join(dir, s.image)).toString('base64');
  const b64 = await page.evaluate(async ({ src, s }) => {
    const i = new Image(); await new Promise((res, rej) => { i.onload = res; i.onerror = rej; i.src = src; });
    const c = document.createElement('canvas'); c.width = 96; c.height = 64; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    const k = Math.min(92 / s.fw, 60 / s.fh), w = s.fw * k, h = s.fh * k;
    g.drawImage(i, 0, 0, s.fw, s.fh, (96 - w) / 2, 62 - h, w, h);
    return c.toDataURL('image/webp', 0.85).split(',')[1];
  }, { src, s });
  fs.writeFileSync(path.join(out, `${id}.webp`), Buffer.from(b64, 'base64'));
}
await browser.close();
console.log(`${Object.keys(m.sprites).length} pictures in ${path.relative(ROOT, out)}`);
