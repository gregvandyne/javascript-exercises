// The Spot-the-Trick printable pack as a PDF: renders the teacher page's own print view
// (/teachers/cyber-defenders?print=tricks — cards + answer key, data from the Trick Inbox game via
// seed-lessons/cyber-defenders/trick-pack.json) with headless Chromium, the same browser the repo's
// shot scripts use, and writes public/teachers/spot-the-trick-pack.pdf, which the teacher page links.
// Usage: node scripts/cyber-trick-pack-pdf.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'; // the repo's pinned browser; absent on some machines, where Playwright's own build is used
const OUT = path.join(ROOT, 'public/teachers/spot-the-trick-pack.pdf');

process.env.BRB_DB = process.env.BRB_DB || ':memory:';
process.env.BRB_SILENT = '1';
const { createApp } = await import('../server/app.js');
const server = createApp().listen(0);
await new Promise(r => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}/teachers/cyber-defenders?print=tricks`;
try {
  const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  const cards = await page.locator('.cdt-card').count();
  if (cards < 1) throw new Error('the print view rendered no cards');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.pdf({ path: OUT, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
  await browser.close();
  console.log(`wrote ${path.relative(ROOT, OUT)} (${cards} cards, ${fs.statSync(OUT).size} bytes)`);
} finally { server.close(); }
