// Share pictures (Open Graph / Twitter cards, 1200x630) for the home page, /teachers, the parent pages and each launch
// game: public/og/site.jpg, teachers.jpg, parents.jpg, parents-<guide>.jpg, ages-<min>-<max>.jpg and <slug>.jpg. Built from the brand (server/views/brand.js, the
// Bricolage font, the brand colours) and the launch games' cover screenshots (public/covers, `npm run covers`).
// Never made for a game a child built: those pages are not indexed and show no share picture.
//
// Usage: node scripts/og-images.js            (run again after `npm run covers` or a brand change)
//        node scripts/og-images.js parents.jpg  (only the named pictures)
// Needs the Playwright Chromium (pre-installed at /opt/pw-browsers in our cloud sandboxes, or `npx playwright install chromium`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { appMark, wordmark } from '../server/views/brand.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'og');
const COVERS = path.join(ROOT, 'public', 'covers');
const EXE = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
const INK = '#141414', CREAM = '#FFFDF2', MINT = '#66C792', SPARK = '#FFD23F', LEAF = '#1F9D63';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const font = dataUrl(path.join(ROOT, 'public/fonts/bricolage-grotesque-latin-opsz-normal.woff2'), 'font/woff2');
const cover = slug => dataUrl(path.join(COVERS, `${slug}.jpg`), 'image/jpeg');
const seed = slug => JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games', `${slug}.json`), 'utf8'));

const CSS = `@font-face{font-family:B;src:url(${font}) format('woff2');font-weight:200 800}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;font-family:B,system-ui,sans-serif;color:${INK};background:${CREAM}}
.card{position:relative;width:1200px;height:630px;display:grid;grid-template-columns:1fr 470px;align-items:center;padding:56px 64px;gap:32px;
  background:radial-gradient(circle at 92% 8%, ${SPARK} 0 120px, transparent 121px), radial-gradient(circle at 105% 105%, ${MINT} 0 260px, transparent 261px), ${CREAM}}
.brand{display:flex;align-items:center;gap:16px;margin-bottom:28px}
.brand .appmark{width:76px;height:76px}
.appmark .am-bg{fill:${MINT}} .appmark .am-eyes{fill:none;stroke:${INK}} .appmark .am-pupils{fill:${INK}} .appmark .am-spark{fill:${SPARK};stroke:${INK}}
.brand .wordmark{height:46px;color:${INK}} .wordmark .spark{fill:${SPARK};stroke:${INK}}
.brand b{font-size:34px;font-weight:700;letter-spacing:-.01em;margin-top:6px}
h1{font-size:68px;line-height:1.02;font-weight:800;letter-spacing:-.03em}
.kicker{display:inline-block;margin-bottom:18px;padding:8px 18px;border-radius:999px;background:${INK};color:${CREAM};font-size:24px;font-weight:700}
.sub{margin-top:22px;font-size:28px;font-weight:600;color:#333}
.pills{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
.pills span{padding:8px 16px;border-radius:999px;background:#fff;border:3px solid ${INK};font-size:22px;font-weight:700}
.stack{position:relative;height:520px}
.stack img{position:absolute;width:250px;height:333px;object-fit:cover;object-position:top;border-radius:22px;border:6px solid #fff;box-shadow:0 18px 40px rgba(20,20,20,.28)}
.stack img:nth-child(1){left:0;top:120px;transform:rotate(-8deg)}
.stack img:nth-child(2){left:110px;top:30px;transform:rotate(2deg);z-index:2}
.stack img:nth-child(3){left:215px;top:150px;transform:rotate(9deg);z-index:3}
.one{display:flex;justify-content:center}
.one img{width:330px;height:440px;object-fit:cover;object-position:top;border-radius:26px;border:8px solid #fff;box-shadow:0 22px 50px rgba(20,20,20,.3);transform:rotate(3deg)}
.url{position:absolute;left:64px;bottom:40px;font-size:24px;font-weight:700;color:${LEAF}}`;

const brand = () => `<div class="brand">${appMark()}${wordmark()}<b>Academy</b></div>`;
const page = inner => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${inner}</body></html>`;

const CARDS = [
  { file: 'site.jpg', html: page(`<div class="card"><div>${brand()}<h1>Fun learning games for kids</h1><p class="sub">Play free in the browser, and build your own games with AI.</p><div class="pills"><span>Ages 8–14</span><span>No ads</span><span>Free</span></div></div>
    <div class="stack"><img src="${cover('castle-clash')}"><img src="${cover('sum-racer')}"><img src="${cover('word-hunt')}"></div><p class="url">oomba.ai</p></div>`) },
  { file: 'teachers.jpg', html: page(`<div class="card"><div>${brand()}<span class="kicker">For teachers</span><h1 style="font-size:58px">Fun, interactive learning games for the classroom</h1><div class="pills"><span>Free to start</span><span>No ads</span><span>Ages 8–14</span></div></div>
    <div class="stack"><img src="${cover('loop-lab')}"><img src="${cover('sum-racer')}"><img src="${cover('word-peek')}"></div><p class="url">oomba.ai/teachers</p></div>`) },
  ...[
    { file: 'parents.jpg', kicker: 'For parents', h1: 'Fun learning games for kids 8–14, safe by design', pills: ['Free', 'No ads', 'No stranger chat'], covers: ['word-hunt', 'sum-racer', 'castle-clash'], url: 'oomba.ai/parents' },
    { file: 'parents-ai-builder-safety.jpg', kicker: 'For parents', h1: 'Is the AI Builder safe for my child?', pills: ['What it sees', 'The rules it follows'], covers: ['hero-of-sunvale', 'loop-lab', 'munch-maze'], url: 'oomba.ai/parents' },
    { file: 'parents-safety-and-screen-time.jpg', kicker: 'A parent’s guide', h1: 'Good screen time for kids 8–14', pills: ['No ads', 'Nothing to buy', 'A checklist'], covers: ['shark-plank', 'word-peek', 'beat-lanes'], url: 'oomba.ai/parents' },
    { file: 'ages-8-9.jpg', kicker: 'Ages 8 and 9', h1: 'Free learning games for 8 and 9 year olds', pills: ['Times tables', 'Spelling', 'Chess'], covers: ['shark-plank', 'sum-racer', 'word-hunt'], url: 'oomba.ai' },
    { file: 'ages-10-11.jpg', kicker: 'Ages 10 and 11', h1: 'Free learning games for 10 and 11 year olds', pills: ['Division', 'Word puzzles', 'Make a game'], covers: ['word-peek', 'castle-clash', 'brick-drop'], url: 'oomba.ai' },
    { file: 'ages-12-14.jpg', kicker: 'Ages 12 to 14', h1: 'Games for 12 to 14 year olds that aren’t babyish', pills: ['Strategy', 'Music', 'Make a game'], covers: ['loop-lab', 'hero-of-sunvale', 'castle-clash'], url: 'oomba.ai' },
  ].map(c => ({ file: c.file, html: page(`<div class="card"><div>${brand()}<span class="kicker">${esc(c.kicker)}</span><h1 style="font-size:58px">${esc(c.h1)}</h1><div class="pills">${c.pills.map(p => `<span>${esc(p)}</span>`).join('')}</div></div>
    <div class="stack">${c.covers.map(s => `<img src="${cover(s)}">`).join('')}</div><p class="url">${esc(c.url)}</p></div>`) })),
];
const KICKER = { learning: 'Free learning game', words: 'Free word game', board: 'Free board game', music: 'Free music game', puzzle: 'Free puzzle game', arcade: 'Free arcade game', sports: 'Free sports game', adventure: 'Free adventure game', silly: 'Free silly game' };
for (const f of fs.readdirSync(COVERS).filter(f => f.endsWith('.jpg'))) {
  const slug = f.slice(0, -4); let g; try { g = seed(slug); } catch { continue; }
  CARDS.push({ file: `${slug}.jpg`, html: page(`<div class="card"><div>${brand()}<span class="kicker">${esc(KICKER[g.category] || 'Free game')}</span><h1>${esc(g.title)}</h1><p class="sub">Free in any browser · Ages 8–14</p></div>
    <div class="one"><img src="${cover(slug)}"></div><p class="url">oomba.ai</p></div>`) });
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const tab = await ctx.newPage();
const only = process.argv.slice(2);
for (const c of CARDS.filter(c => !only.length || only.includes(c.file))) {
  await tab.setContent(c.html, { waitUntil: 'load' });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: path.join(OUT, c.file), type: 'jpeg', quality: 84 });
  console.log(`  ✓ public/og/${c.file}`);
}
await browser.close();
