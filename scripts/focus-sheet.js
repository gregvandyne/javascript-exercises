// Guided-focus verification sheets: draw every focus box (and path) onto the actual slide picture it will be
// shown over, at the renderer's own geometry (box % = image %; the slide figure is 16:9 and the captures are
// 1280x720, so there is no crop to model), and print the result as PNGs a human can judge. A box that matches
// its authored coordinates is NOT proof it frames the right element — these sheets exist so a person looks at
// the picture. Born from the 2026-11-04 live report (a ring framing blank panel in Cyber Defenders 1.1) and
// the re-audit that followed: boxes had been authored from coarse region templates, and several sat on empty
// panel or the wrong element entirely while every schema test passed.
//
// Usage: node scripts/focus-sheet.js [--out <dir>] [course ...]
//   course: cs-quest | cyber-defenders (default: both). PNGs go to --out (default scripts/focus-sheets),
//   one per pictured focus slide, named <course>-<band>-<step>-s<slide>.png, boxes drawn in step order
//   (red, blue, green, orange) with a numbered tab, plus the step's dotted path where one is authored.
//   Steps whose box is >90% one flat colour are also listed as REVIEW suspects on stdout: a ring around
//   mostly-blank panel is the failure this tool hunts (thin roads on cream can false-positive — judge the PNG).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const args = process.argv.slice(2);
const outDir = path.resolve(ROOT, args.includes('--out') ? args[args.indexOf('--out') + 1] : 'scripts/focus-sheets');
const wanted = args.filter(a => ['cs-quest', 'cyber-defenders'].includes(a));
const COURSES = wanted.length ? wanted : ['cs-quest', 'cyber-defenders'];
const COLOURS = ['#e53935', '#1e6fe8', '#1f9d63', '#ef7d00'];

const jobs = [];
for (const course of COURSES) {
  const dir = path.join(ROOT, 'seed-lessons', course, 'course');
  for (const band of fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory()).sort()) {
    for (const f of fs.readdirSync(path.join(dir, band)).filter(f => f.endsWith('.json')).sort()) {
      const deck = JSON.parse(fs.readFileSync(path.join(dir, band, f), 'utf8'));
      (deck.slides || []).forEach((s, i) => {
        if (s.focus && s.img) jobs.push({ course, band, step: f.replace('.json', ''), i, img: s.img, focus: s.focus });
      });
    }
  }
  const extras = path.join(dir, 'extras.json');
  if (fs.existsSync(extras)) {
    const ex = JSON.parse(fs.readFileSync(extras, 'utf8'));
    for (const [band, list] of Object.entries(ex)) (list || []).forEach((s, i) => {
      if (s.focus && s.img) jobs.push({ course, band, step: '0.1-6.4', i, img: s.img, focus: s.focus });
    });
  }
}

fs.mkdirSync(outDir, { recursive: true });
// The slide pictures are served over a local port: a setContent page cannot load file:// subresources,
// and the canvas blank-check below needs the real pixels decoded either way.
const pubRoot = path.join(ROOT, 'public');
const server = http.createServer((req, res) => {
  const p = path.join(pubRoot, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(pubRoot) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'image/webp', 'access-control-allow-origin': '*' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const suspects = [];
for (const job of jobs) {
  const src = `${origin}/img/${job.img}.webp`;
  const boxes = job.focus.map((f, j) => {
    const [x, y, w, h] = f.box;
    const c = COLOURS[j % COLOURS.length];
    const pathSvg = f.path ? `<svg viewBox="0 0 100 56.25" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">
      <polyline points="${f.path.map(p => `${p[0]},${p[1] * 0.5625}`).join(' ')}" fill="none" stroke="#ffd23f" stroke-width="0.7" stroke-dasharray="1.6 1.2"/>
      ${f.path.map(p => `<circle cx="${p[0]}" cy="${p[1] * 0.5625}" r="0.9" fill="#ffd23f" stroke="#141414" stroke-width="0.25"/>`).join('')}</svg>` : '';
    return `<div style="position:absolute;left:${x}%;top:${y}%;width:${w}%;height:${h}%;border:3px solid ${c};box-sizing:border-box">
      <span style="position:absolute;left:-3px;top:-24px;background:${c};color:#fff;font:bold 15px sans-serif;padding:1px 6px">${j + 1}</span></div>${pathSvg}`;
  }).join('');
  await page.setContent(`<body style="margin:0"><div style="position:relative;width:1280px;height:720px">
    <img src="${src}" crossorigin="anonymous" style="width:1280px;height:720px;display:block">${boxes}</div></body>`);
  await page.waitForFunction(() => { const i = document.querySelector('img'); return i && i.complete && i.naturalWidth > 0; });
  const name = `${job.course}-${job.band}-${job.step}-s${job.i}.png`;
  await page.screenshot({ path: path.join(outDir, name) });
  const blanks = await page.evaluate(boxes => {
    const img = document.querySelector('img');
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
    return boxes.map(([x, y, w, h]) => {
      const px = cx.getImageData(Math.round(x / 100 * cv.width), Math.round(y / 100 * cv.height),
        Math.max(1, Math.round(w / 100 * cv.width)), Math.max(1, Math.round(h / 100 * cv.height))).data;
      const counts = new Map(); let total = 0;
      for (let k = 0; k < px.length; k += 16) { const key = `${px[k] >> 4},${px[k + 1] >> 4},${px[k + 2] >> 4}`; counts.set(key, (counts.get(key) || 0) + 1); total++; }
      return Math.max(...counts.values()) / total;
    });
  }, job.focus.map(f => f.box));
  blanks.forEach((b, j) => { if (b > 0.9) suspects.push(`${name} step ${j + 1}: ${(b * 100).toFixed(0)}% one flat colour — "${job.focus[j].cue}"`); });
}
await browser.close();
server.close();
console.log(`wrote ${jobs.length} annotated slides to ${path.relative(ROOT, outDir)}`);
if (suspects.length) { console.log('REVIEW suspects (box mostly one flat colour — check the PNG against the cue):'); for (const s of suspects) console.log('  ' + s); }
else console.log('no blank-box suspects');
