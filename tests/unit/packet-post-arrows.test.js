// Packet Post (seed-games/packet-post.html): the roads and arrows on the board agree with where the packets go. For every
// route level, in both bands, on a phone and a laptop, the solver's route is played hop by hop in real Chromium: each
// packet leaves the sender, every hop it takes is a lit road from the office it is waiting at, it arrives at the receiver;
// and every arrow drawn on a lit road points (on the screen, within a few degrees) from the packet's stop along that road
// to its far end, the way the packet would ride it. Skipped when there is no Chromium on the machine.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/packet-post.html'), 'utf8');
const { loadData } = await import('../../scripts/packet-post-strings.mjs');
const { D } = loadData(HTML);
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });

async function open(size) {
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); }
  const ctx = await browser.newContext({ viewport: size, hasTouch: true });
  const doc = frameDocument(HTML, { user: { displayName: 'P', avatar: 'x', lang: 'en', dir: 'ltr' }, game: { id: 'g', title: 'Packet Post' }, save: {}, canSave: false, preview: true, deviceText: { title: 'x', text: 'y' } });
  const host = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const errors = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const m = /^http:\/\/game\.invalid\/(vendor\/(?:oomba-kit|data)\/[\w./-]+)$/.exec(u);
    if (m && fs.existsSync(path.join(ROOT, 'public', m[1]))) return route.fulfill({ status: 200, headers: { 'content-type': m[1].endsWith('.js') ? 'text/javascript' : 'font/woff2', 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(ROOT, 'public', m[1])) });
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(HOST + '/', { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 200 && !frame; i++) { frame = page.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await page.waitForTimeout(25); }
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 60_000 });
  return { ctx, page, frame, errors };
}
const T = (frame, fn, ...a) => frame.evaluate(([f, a]) => window.__brbTest[f](...a), [fn, a]);

// the arrow glyph's own direction (in its viewBox, before the turn): from the middle of its two ends to its tip
const glyphDir = frame => frame.evaluate(() => {
  const svg = document.querySelector('.pp-link[data-aim] svg'); if (!svg) return null;
  const p = [...svg.querySelectorAll('path, polyline')].find(x => x.getTotalLength() > 0); const len = p.getTotalLength();
  const a = p.getPointAtLength(0), m = p.getPointAtLength(len / 2), e = p.getPointAtLength(len);
  return Math.atan2(m.y - (a.y + e.y) / 2, m.x - (a.x + e.x) / 2) * 180 / Math.PI;
});
const angleGap = (a, b) => { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; };

test('packet-post: in Chromium every packet rides lit roads from the sender to the receiver, and every road arrow points from the packet\'s stop along its road', { skip, timeout: 600_000 }, async () => {
  const routeLevels = D.LEVELS.filter(l => (l.type || 'route') === 'route');
  assert.ok(routeLevels.length >= 10, 'the route levels');
  const bad = []; let arrows = 0, hops = 0, packets = 0;
  for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const { ctx, page, frame, errors } = await open(size);
    try {
      for (const l of routeLevels) for (const band of l.bands) for (const seed of [1, 2]) {
        const idx = D.LEVELS.filter(x => x.ch === l.ch && x.bands.includes(band)).indexOf(l) + 1;
        await T(frame, 'start', { chapter: l.ch, band, level: idx, seed, lesson: false }); await page.waitForTimeout(80);
        await T(frame, 'closeCards'); await T(frame, 'skipAnimations'); await page.waitForTimeout(60);
        const where = `${size.width} ${l.id}/${band} seed ${seed}`;
        let path = null, guard = 0;
        while (guard++ < 200) {
          const R = await T(frame, 'roads'); if (!R || R.phase !== 'play') break;
          if (!path || R.at === R.from && path.length > 1) { if (path) packets++; path = [R.at]; }
          if (path.length === 1 && R.at !== R.from) bad.push(`${where}: a packet starts at ${R.at}, not the sender ${R.from}`);
          // every arrow on the board: on a lit road out of the packet's stop, pointing at the road's far end
          const g = await glyphDir(frame);
          for (const k of R.links) {
            if (!k.arrow || k.sealed) { if (k.aim) bad.push(`${where}: road ${k.id} has an aim but no arrow`); continue; }   // a sealed road shows its lock, not an arrow
            arrows++;
            if (!k.lit || (k.a !== R.at && k.b !== R.at)) { bad.push(`${where}: an arrow on road ${k.id} that does not leave ${R.at}`); continue; }
            const far = k.a === R.at ? k.b : k.a;
            if (k.aim !== far) bad.push(`${where}: road ${k.id} aims at ${k.aim}, not its far end ${far}`);
            const [x0, y0] = R.nodes[R.at], [x1, y1] = R.nodes[far];
            const want = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI, drawn = (g == null ? 0 : g) + (k.deg || 0);
            if (angleGap(want, drawn) > 6) bad.push(`${where}: road ${k.id} ${R.at}->${far}: arrow drawn at ${drawn.toFixed(0)} deg, the road runs at ${want.toFixed(0)} deg`);
          }
          const a = await T(frame, 'advice'); if (!a || a.t !== 'hop') break;
          const link = R.links.find(k => k.id === a.id);
          if (!link || !link.lit) { bad.push(`${where}: the solved route takes road ${a.id}, which is not lit from ${R.at}`); break; }
          const next = link.a === R.at ? link.b : link.a;
          await T(frame, 'act', a); hops++;
          const s = await T(frame, 'run');
          if (s.at !== next && s.at !== R.from) bad.push(`${where}: rode ${a.id} from ${R.at} but is at ${s.at}, not ${next}`);
          path.push(next);
          if (next === R.to) {
            if (new Set(path).size !== path.length) bad.push(`${where}: a packet went round in a loop: ${path.join(' > ')}`);
            packets++; path = null;
          }
        }
        if (path && path.length > 1) bad.push(`${where}: a packet stopped at ${path.at(-1)} on the way (${path.join(' > ')}), not at the receiver`);
        const done = await T(frame, 'solve'); if (!done || done.phase !== 'done') bad.push(`${where}: the level is not solved (${done && done.phase})`);
        await T(frame, 'closeCards');
      }
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
  assert.deepEqual(bad, []);
  assert.ok(arrows > 200 && hops > 200 && packets > 50, `checked ${arrows} arrows, ${hops} hops, ${packets} packets`);
});
