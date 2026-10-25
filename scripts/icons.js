// The site's icons in public/icons, drawn from the logo board's artwork in server/views/brand.js:
//   icon.svg               favicon (Spark square, Ink eyes)
//   icon-192.png, -512     the Mint app icon, rounded corners (web manifest, <link rel="icon">)
//   icon-maskable-512.png  Mint, full bleed, the art inside the safe circle (Android shapes it)
//   apple-touch-icon.png   180px Mint, full bleed (iOS rounds the corners itself)
//   ../favicon.ico         the favicon at 16, 32 and 48px (PNGs inside an .ico), for browsers without SVG icons
// Usage: node scripts/icons.js   (PNGs are rendered by headless Chromium, like scripts/covers.js)
// After changing the icons, bump ICONS_V in server/views/brand.js (and the ?v= in public/manifest.webmanifest) so browsers refetch them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { iconSvg } from '../server/views/brand.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'icons');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PNGS = [
  ['icon-192.png', 192, iconSvg('mint')],
  ['icon-512.png', 512, iconSvg('mint')],
  ['icon-maskable-512.png', 512, iconSvg('mint', { maskable: true })],
  ['apple-touch-icon.png', 180, iconSvg('mint', { square: true })],
];

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon.svg'), iconSvg('favicon') + '\n');
const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function png(size, svg) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
for (const [file, size, svg] of PNGS) {
  fs.writeFileSync(path.join(OUT, file), await png(size, svg));
  console.log(`  ✓ public/icons/${file}`);
}
// favicon.ico: a 6-byte header, a 16-byte entry per size, then the PNGs.
const sizes = [16, 32, 48], images = [];
for (const size of sizes) images.push(await png(size, iconSvg('favicon')));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let at = head.length;
sizes.forEach((size, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(size, e); head.writeUInt8(size, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(images[i].length, e + 8); head.writeUInt32LE(at, e + 12); at += images[i].length;
});
fs.writeFileSync(path.join(ROOT, 'public', 'favicon.ico'), Buffer.concat([head, ...images]));
console.log('  ✓ public/favicon.ico');
await browser.close();
console.log('  ✓ public/icons/icon.svg');
