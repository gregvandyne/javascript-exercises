// Pictures of 2D games that draw the 2D art packs, played in the real game frame (frameDocument + the frame CSP + the
// sandbox) in Chromium: for looking at the art in play (seams, feet on the ground, sprite size on a phone).
//   node scripts/art2d-shots.js <out-dir> runner:pirate-cove:fox catch:castle-quest:knight ... [--sizes 960x600,390x844] [--wait 2500] [--title] [--backend glaze] [--sheet all.png] [--max 2900]
// Each game is started with its test hook (window.__brbTest.start()) unless --title; one PNG per game and size.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
process.env.BRB_SILENT = '1'; process.env.BRB_DB = process.env.BRB_DB || ':memory:';
const { frameDocument, frameCsp, SANDBOX } = await import('../server/services/frame.js');
const { vendorFile } = await import('../server/services/snapshot.js');
const { loadTemplate } = await import('../server/builder/templates/index.js');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : args[i + 1]; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i && ["--sizes", "--wait", "--backend", "--sheet", "--max"].includes(args[i - 1])));
const [outDir, ...games] = pos;
const sizes = opt('sizes', '960x600,390x844').split(',').map(s => s.split('x').map(Number));
const wait = +opt("wait", 2500), title = args.includes("--title"), backend = opt("backend", "");
const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
const HOST = 'http://game.invalid';
const TYPES = { js: 'text/javascript', webp: 'image/webp', woff2: 'font/woff2', json: 'application/json' };
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const made = [];
for (const g of games) {
  const [key, world = '', hero = ''] = g.split(':');
  const html = loadTemplate(key, { world, hero });
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1, hasTouch: w < 500, isMobile: w < 500 });
    const doc = frameDocument(html, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'K' }, save: {}, canSave: false });
    const page = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0"><iframe id=f sandbox="${SANDBOX}" src="${HOST}/frame?okGov=off${backend ? `&okBackend=${backend}` : ""}" style="border:0;width:100vw;height:100vh;display:block"></iframe>`;
    const errors = [];
    await ctx.route('**/*', route => {
      const u = route.request().url();
      if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
      if (u.startsWith(HOST + '/frame')) return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
      const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
      if (f) return route.fulfill({ status: 200, headers: { 'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream', 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' }, body: fs.readFileSync(f) });
      return route.fulfill({ status: 404, body: '' });
    });
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error' || /\[oomba\]/.test(m.text())) errors.push(m.text()); }); p.on('pageerror', e => errors.push(String(e)));
    await p.goto(HOST + '/', { waitUntil: 'load' });
    const frame = p.frames().find(f => f.url().startsWith(HOST + '/frame'));
    await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().scene, null, { timeout: 60_000 }).catch(() => errors.push('no test hook'));
    if (!title) await frame.waitForFunction(() => { const T = window.__brbTest, s = T.state().scene; if (s !== 'play' && T.start) T.start(); return s === 'play'; }, null, { timeout: 30_000, polling: 500 }).catch(() => errors.push('never reached play'));
    await p.waitForTimeout(wait);
    const stats = await frame.evaluate(() => (window.Oomba2D ? window.Oomba2D.stats : null)).catch(() => null);
    const file = path.join(outDir, `${key}-${world || 'classic'}-${hero || 'kit'}-${w}x${h}.png`);
    await p.screenshot({ path: file }); made.push({ file, w, h, label: `${key} · ${world || 'classic'} · ${hero || 'kit hero'}` });
    console.log(file, JSON.stringify(stats), errors.slice(0, 4).join(' | '));
    await ctx.close();
  }
}
// --sheet: every picture on one sheet (landscape ones at half size, phones beside them), labelled.
if (opt('sheet', '')) {
  const page = await browser.newPage(), max = +opt('max', 2900);
  const png = await page.evaluate(async ({ made, max }) => {
    const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const items = []; for (const m of made) items.push({ ...m, img: await load(m.src) });
    const H = 300, cells = items.map(m => ({ m, w: Math.round(m.w * H / m.h), h: H }));
    let x = 0, y = 0; const at = [], W = max;
    for (const c of cells) { if (x + c.w > W) { x = 0; y += H + 26; } at.push([x, y]); x += c.w + 8; }
    const total = y + H + 26, k = Math.min(1, max / total), c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(total * k);
    const g = c.getContext('2d'); g.scale(k, k); g.fillStyle = '#FFFDF2'; g.fillRect(0, 0, W, total); g.imageSmoothingQuality = 'high';
    cells.forEach((cl, i) => { g.drawImage(cl.m.img, at[i][0], at[i][1], cl.w, cl.h); g.fillStyle = '#141414'; g.font = '600 13px system-ui, sans-serif'; g.fillText(`${cl.m.label}  ${cl.m.w}x${cl.m.h}`.slice(0, Math.max(12, Math.floor(cl.w / 7))), at[i][0] + 2, at[i][1] + H + 16); });
    return c.toDataURL('image/png').split(',')[1];
  }, { made: made.map(m => ({ ...m, src: 'data:image/png;base64,' + fs.readFileSync(m.file).toString('base64') })), max });
  fs.writeFileSync(opt('sheet', ''), Buffer.from(png, 'base64')); console.log(opt('sheet', ''));
}
await browser.close();
