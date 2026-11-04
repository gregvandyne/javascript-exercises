// CS Quest story sprites: extract the four course characters from their own games, exactly as the games render
// them. Dot / Pim / Gizmo are kit characters (kit/src/chars.js): each game builds its spec with Oomba.char and
// draws it with Oomba.ui.portrait — this script calls those same functions inside the game's own frame, at
// 512px, mood 'happy', no crowns (the look a new player meets). Bolt predates the kit cast in Robo Route: he is
// a hand-written inline SVG (BOLT_SVG in seed-games/robo-route.html) coloured by CSS variables; this script
// reads the computed variable values out of the live game and bakes them into the SVG before rasterising.
//
// Usage: node scripts/csq-sprites.js [--out <dir>]   (default out: scripts/csq-masters/chars, PNG masters)
// The build then converts the masters to public/img/csq/chars/<name>.webp (WebP with alpha).
// Needs the Playwright Chromium (`npx playwright install chromium`).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { frameDocument, frameCsp, SANDBOX } from '../server/services/frame.js';
import { vendorFile } from '../server/services/snapshot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const outIdx = process.argv.indexOf('--out');
const OUT = outIdx >= 0 ? path.resolve(process.argv[outIdx + 1]) : path.join(ROOT, 'scripts/csq-masters/chars');
const wait = ms => new Promise(r => setTimeout(r, ms));

// The character specs, copied verbatim from each game's own source (file + symbol in the build report):
//   Dot   — seed-games/data-detective.html dotSpec(false): fox, peach/cream/spark, glasses (no crown).
//   Pim   — seed-games/packet-post.html CONFIG.pim via pimLook() with no crowns: owl, backpack, cocoa/spark.
//   Gizmo — seed-games/inside-the-machine.html CONFIG.crew via gizmoSpec() with no crowns: mouse, glasses,
//           stone/snow/sky, seed 5.
const KIT_CHARS = [
  { slug: 'data-detective', name: 'dot', spec: { species: 'fox', colors: { base: 'peach', belly: 'cream', accent: 'spark' }, wear: ['glasses'], mood: 'happy' } },
  { slug: 'packet-post', name: 'pim', spec: { species: 'owl', wear: ['backpack'], colors: { base: 'cocoa', accent: 'spark' }, mood: 'happy' } },
  { slug: 'inside-the-machine', name: 'gizmo', spec: { species: 'mouse', wear: ['glasses'], colors: { base: 'stone', belly: 'snow', accent: 'sky' }, mood: 'happy', seed: 5 } },
];

async function serveGame(browser, slug, fn) {
  const doc = frameDocument(fs.readFileSync(path.join(ROOT, 'seed-games', `${slug}.html`), 'utf8'), { user: { displayName: 'Player', avatar: '🦊', isGuest: false }, game: { id: slug, title: slug }, save: {}, canSave: false, preview: true });
  const srv = http.createServer((q, r) => {
    const origin = `http://127.0.0.1:${srv.address().port}`;
    if (q.url.startsWith('/g')) { r.setHeader('Content-Security-Policy', frameCsp(origin)); r.setHeader('Content-Type', 'text/html; charset=utf-8'); return r.end(doc); }
    if (q.url.startsWith('/vendor/')) {
      const f = vendorFile(origin + q.url.split('?')[0]);
      if (!f) { r.statusCode = 404; return r.end(); }
      r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript; charset=utf-8' : f.endsWith('.woff2') ? 'font/woff2' : 'text/plain; charset=utf-8');
      r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      return r.end(fs.readFileSync(f));
    }
    r.setHeader('Content-Type', 'text/html; charset=utf-8');
    r.end(`<!doctype html><style>html,body{margin:0;height:100%;background:transparent}iframe{width:100%;height:100%;border:0;display:block}</style><iframe sandbox="${SANDBOX}" src="/g"></iframe>`);
  });
  await new Promise(r => srv.listen(0, r));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => {
    try {
      const body = execFileSync('curl', ['-s', '-L', '-A', 'Mozilla/5.0 Chrome/140', route.request().url()], { maxBuffer: 8e6 });
      route.fulfill({ status: 200, body, headers: { 'content-type': /gstatic/.test(route.request().url()) ? 'font/woff2' : 'text/css', 'access-control-allow-origin': '*' } });
    } catch { route.abort(); }
  });
  await page.goto(`http://127.0.0.1:${srv.address().port}/`);
  await page.waitForTimeout(800);
  const f = page.frames().find(x => x.url().includes('/g'));
  // Robo Route's state() has a `ready` flag; the kit games' does not — wait for what the extraction needs.
  await f.waitForFunction(() => window.__brbTest && window.Oomba && window.Oomba.ui && typeof window.Oomba.ui.portrait === 'function' && typeof window.Oomba.char === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  try { return await fn(f, page); } finally { await ctx.close(); srv.close(); }
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
const results = [];

// Kit characters: Oomba.char(spec) + Oomba.ui.portrait(spec, { size: 512, mood: 'happy' }) inside the game frame.
for (const c of KIT_CHARS) {
  const dataUrl = await serveGame(browser, c.slug, async f => {
    return await f.evaluate(spec => {
      const el = window.Oomba.ui.portrait(window.Oomba.char(spec), { size: 512, mood: 'happy' });
      const cv = el.tagName === 'CANVAS' ? el : el.querySelector('canvas');
      if (!cv) return { error: 'portrait element is not a canvas: ' + el.tagName };
      // Verify the canvas is not blank/transparent-only before trusting it.
      const g = cv.getContext('2d'), px = g.getImageData(0, 0, cv.width, cv.height).data;
      let opaque = 0; for (let i = 3; i < px.length; i += 16) if (px[i] > 0) opaque++;
      return { url: cv.toDataURL('image/png'), w: cv.width, h: cv.height, opaqueSamples: opaque };
    }, c.spec);
  });
  if (dataUrl.error || !dataUrl.opaqueSamples) { results.push(`${c.name}: FAILED (${dataUrl.error || 'blank canvas'})`); continue; }
  fs.writeFileSync(path.join(OUT, `${c.name}.png`), Buffer.from(dataUrl.url.split(',')[1], 'base64'));
  results.push(`${c.name}: ok — ${dataUrl.w}x${dataUrl.h} portrait canvas from ${c.slug}`);
}

// Bolt: the game's own BOLT_SVG markup with its CSS variables resolved from the live frame.
{
  const bolt = await serveGame(browser, 'robo-route', async (f, page) => {
    const vars = await f.evaluate(() => {
      // The kit defines its tokens on the mounted UI subtree, not on <html>: read them where they resolve.
      const el = document.querySelector('#titleBolt') || document.body;
      const cs = getComputedStyle(el);
      const out = {}; for (const v of ['--rr-bolt', '--rr-visor', '--rr-paintjob', '--ok-edge', '--ok-card']) out[v] = cs.getPropertyValue(v).trim();
      return out;
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512"><style>
      .rr-b1{fill:${vars['--rr-bolt']};stroke:${vars['--ok-edge']};stroke-width:2.5;stroke-linejoin:round}
      .rr-b2{fill:${vars['--rr-visor']};stroke:${vars['--ok-edge']};stroke-width:2}
      .rr-b3{fill:${vars['--rr-paintjob']};stroke:${vars['--ok-edge']};stroke-width:1.5}
      .rr-eye{fill:${vars['--ok-card']}}</style>
      <g class="rr-b1"><rect x="13" y="20" width="38" height="34" rx="9"/><rect x="23" y="7" width="18" height="15" rx="5"/><line x1="32" y1="7" x2="32" y2="2"/><circle cx="32" cy="2" r="2.4"/></g><g class="rr-b2"><rect x="18" y="27" width="28" height="13" rx="5"/><rect x="6" y="30" width="7" height="18" rx="3"/><rect x="51" y="30" width="7" height="18" rx="3"/></g><circle class="rr-eye" cx="26" cy="33.5" r="3"/><circle class="rr-eye" cx="38" cy="33.5" r="3"/><g class="rr-b3"><rect x="22" y="43" width="20" height="6" rx="3"/><rect x="28" y="10" width="8" height="4" rx="2"/></g></svg>`;
    await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${svg}</body>`);
    const el = await page.$('svg');
    await el.screenshot({ path: path.join(OUT, 'bolt.png'), omitBackground: true });
    return vars;
  });
  results.push(`bolt: ok — BOLT_SVG rasterised at 512x512, vars ${JSON.stringify(bolt)}`);
}
await browser.close();
console.log(results.join('\n'));
