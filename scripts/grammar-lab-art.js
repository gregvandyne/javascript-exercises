// Grammar Lab's picture files, from the code that draws them (public/js/grammar-lab-art.js):
//   public/img/grammar-lab/<name>.svg   the four band covers (k-2, 3-5, 6-8, 9-12), mascot, doorway, mastery-stars,
//                                       double-tap-tip and card (light palette; inline markup follows the theme);
//   public/covers/grammar-lab.jpg       the course card cover (3:4, 540 x 720, like the game covers), rendered from card.svg.
// The share picture (public/og/grammar-lab.jpg) is a card in scripts/og-images.js: run `node scripts/og-images.js
// grammar-lab.jpg` after this.
//
// Usage: node scripts/grammar-lab-art.js          (svg files and the card cover)
//        node scripts/grammar-lab-art.js --svg    (svg files only, no browser needed)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, standalone } from '../public/js/grammar-lab-art.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'img', 'grammar-lab');
fs.mkdirSync(OUT, { recursive: true });
for (const [name, f] of Object.entries(FILES)) {
  const file = path.join(OUT, `${name}.svg`);
  fs.writeFileSync(file, standalone(f()));
  console.log(`  ✓ ${path.relative(ROOT, file)} (${(fs.statSync(file).size / 1024).toFixed(1)} KB)`);
}

if (!process.argv.includes('--svg')) {
  const { chromium } = await import('@playwright/test');
  const { chromiumPath } = await import('./chromium.js');
  const EXE = chromiumPath();
  const font = fs.readFileSync(path.join(ROOT, 'public/fonts/bricolage-grotesque-latin-opsz-normal.woff2')).toString('base64');
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const page = await (await browser.newContext({ viewport: { width: 360, height: 480 }, deviceScaleFactor: 1.5 })).newPage();
  await page.setContent(`<!doctype html><style>@font-face{font-family:"Bricolage Grotesque";src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:200 800}
html,body{margin:0;width:360px;height:480px;overflow:hidden}svg{display:block;width:360px;height:480px}</style>${FILES.card()}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(ROOT, 'public', 'covers', 'grammar-lab.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
  console.log(`  ✓ ${path.relative(ROOT, file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
  await browser.close();
}
