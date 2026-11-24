// A live game frame in real Chromium, inside the production wrapper (frameDocument, the frame CSP and the sandbox), with
// a stand-in for the live page: it takes the frame's MessagePort (docs/sdk.md "Live messages"), records what the game
// sends over it and posts the server's messages (docs/live-protocol.md §2) into it. No socket and no server: the tests
// play the protocol's messages straight into the game. Used by tests/unit/live-board-battle-look.test.js.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  path.join(os.homedir(), '.cache/ms-playwright/chromium-1194/chrome-linux/chrome')];
export const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f) && fs.statSync(f).isFile());
export const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const HOST = 'http://game.invalid';
const TYPES = { js: 'text/javascript', woff2: 'font/woff2', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml' };
export const NICKS = ['Brave Otter', 'Quick Fox', 'Sunny Panda', 'Clever Owl', 'Happy Koala', 'Jolly Tiger', 'Calm Turtle', 'Bright Robin', 'Swift Hare', 'Kind Bear', 'Merry Seal', 'Bold Lynx'];
export const PRESETS = [
  { id: 'red', color: '#E5484D', ink: '#FFFFFF', shape: 'circle', icon: '🔴', name: 'Red Rockets', shapeName: 'circle' },
  { id: 'blue', color: '#3E63DD', ink: '#FFFFFF', shape: 'triangle', icon: '🔷', name: 'Blue Whales', shapeName: 'triangle' },
];

let browser = null;
export async function closeBrowser() { if (browser) await browser.close(); browser = null; }

/** Open a game as a live frame. role 'host' (the projector) or 'player' (seat 2). Returns { page, frame, send, sent, errors, ctx }. */
export async function openLive(file, { role = 'host', mode = 'board', viewport = { width: 1280, height: 720 }, theme = 'light', reduced = true, fonts = false, scale = 1, touch = false } = {}) {
  const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); }
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, reducedMotion: reduced ? 'reduce' : 'no-preference', colorScheme: theme, hasTouch: touch });
  const html = fs.readFileSync(path.join(ROOT, 'seed-games', file), 'utf8');
  const seat = role === 'host' ? 0 : 2;
  const live = { v: 1, role, seat, frame: 'game', nameMode: 'nicknames', mode, nicks: NICKS, view: '2d', me: role === 'host' ? null : { seat, name: 1, avatar: null, team: 0 }, teamPresets: PRESETS };
  const doc = frameDocument(html, { user: { displayName: NICKS[1], avatar: 'x', lang: 'en', dir: 'ltr' }, game: { id: 'g', title: file }, save: {}, canSave: false, theme, live });
  const page = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style>
<iframe id=f sandbox="${SANDBOX}" src="${HOST}/frame"></iframe><script>
  window.__P = { msgs: [], port: null };
  var f = document.getElementById('f');
  addEventListener('message', function (e) {
    if (e.source !== f.contentWindow || !e.data || e.data.type !== 'brb:ready') return;
    if (e.ports && e.ports[0] && !__P.port) { __P.port = e.ports[0]; __P.port.onmessage = function (ev) { __P.msgs.push(ev.data); }; __P.port.postMessage({ t: 'clk', s: Date.now() }); }
  });
</script>`;
  const errors = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const m = /^http:\/\/game\.invalid\/vendor\/([\w./-]+)$/.exec(u);
    if (m) {
      const f = path.join(ROOT, 'public/vendor', m[1]);
      if (!fs.existsSync(f)) return route.abort();
      return route.fulfill({ status: 200, headers: { 'content-type': TYPES[path.extname(f).slice(1)] || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    }
    if (fonts && /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) return route.continue();
    return route.abort();
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(String(e.message)));
  await p.goto(HOST + '/', { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 200 && !frame; i++) { frame = p.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await p.waitForTimeout(25); }
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state, null, { timeout: 60_000 });
  await p.waitForFunction(() => !!window.__P.port, null, { timeout: 10_000 });
  const send = async (...ms) => { for (const m of ms) await p.evaluate(x => window.__P.port.postMessage(x), m); await p.waitForTimeout(60); };
  const sent = () => p.evaluate(() => window.__P.msgs);
  return { ctx, page: p, frame, send, sent, errors, now: () => p.evaluate(() => Date.now()) };
}

/** A roster tuple: [seat, nickname index, avatar, team, score, connected, ready, late]. */
export const P = (seat, team = 0, score = 0) => [seat, seat - 1, null, team, score, 1, 1, 0];
