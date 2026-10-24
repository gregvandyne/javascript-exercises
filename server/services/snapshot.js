// Runs a game in a headless Chromium, the same way players get it (frameDocument + FRAME_CSP inside a sandboxed iframe),
// and takes pictures: one of the title screen and one after tapping Play. Used for
//   - cover pictures of Studio games (services/shots.js), and
//   - the Builder's playtest_game tool, which shows the model what its game really looks like.
// One browser, one game at a time, closed again when idle (the server is small). Off unless config.snapshots.
// The game page can reach nothing but Google Fonts and cdnjs (the same hosts its CSP allows); everything else is aborted.
import { frameDocument, FRAME_CSP, SANDBOX } from './frame.js';
import { config } from '../config.js';

const HOST = 'http://game.invalid';
const ALLOWED = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)\//;
const IDLE_MS = 45_000;
const JOB_MS = 40_000;
export const SIZES = {
  cover: { portrait: { width: 360, height: 480 }, landscape: { width: 640, height: 480 } },
  phone: { portrait: { width: 390, height: 700 }, landscape: { width: 844, height: 390 } },
};
// Words on a start button, in the site's languages (lower case).
const PLAY_WORDS = /\b(play|start|go|begin|let'?s go|tap to (play|start))\b|jouer|commencer|jugar|empezar|comenzar|spielen|starten|los geht|jogar|começar|iniciar|gioca|inizia|spelen|begin|играть|начать|старт|スタート|あそぶ|はじめる|開始|遊戲|שחק|התחל|العب|ابدأ|▶|►/i;

let browserP = null, idleTimer = null, chain = Promise.resolve(), launches = 0;

export const enabled = () => !!config.snapshots;

async function browser() {
  if (browserP) { const b = await browserP.catch(() => null); if (b && b.isConnected()) return b; browserP = null; }
  browserP = (async () => {
    const { chromium } = await import('playwright-core');
    launches++;
    return chromium.launch({
      ...(config.chromiumPath ? { executablePath: config.chromiumPath } : {}),
      // A bare environment: the browser never sees the server's secrets (API key, session secret).
      env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: process.env.HOME || '/tmp', ...(process.env.FONTCONFIG_PATH ? { FONTCONFIG_PATH: process.env.FONTCONFIG_PATH } : {}) },
      // The container has no user namespaces for Chromium's own sandbox; the game is still inside the iframe sandbox + CSP.
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--mute-audio', '--no-first-run', '--disable-extensions',
        '--disable-background-networking', '--renderer-process-limit=2', '--js-flags=--max-old-space-size=128'],
    });
  })();
  return browserP;
}
export async function closeBrowser() {
  clearTimeout(idleTimer);
  const p = browserP; browserP = null;
  if (p) { try { const b = await p; await b.close(); } catch { /* already gone */ } }
}
const idle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { closeBrowser(); }, IDLE_MS); idleTimer.unref?.(); };

/** One job at a time, each with a hard time limit. */
function serial(fn) {
  const run = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('Screenshot timed out')); closeBrowser(); }, JOB_MS);
    fn().then(resolve, reject).finally(() => { clearTimeout(timer); idle(); });
  });
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

/** Things a picky player would notice, measured inside the game frame. */
function inspect(W) {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < W; };
  const buttons = [...document.querySelectorAll('button,[role=button],a[href]')].filter(vis);
  const small = buttons.filter(b => { const r = b.getBoundingClientRect(); return r.width < 40 || r.height < 40; })
    .map(b => (b.getAttribute('aria-label') || b.textContent || b.tagName).trim().replace(/\s+/g, ' ').slice(0, 24));
  const de = document.documentElement;
  const offscreen = [...document.querySelectorAll('body *')].filter(el => el.children.length === 0 && (el.textContent || '').trim() && vis(el))
    .filter(el => { const r = el.getBoundingClientRect(); return r.right > W + 2 || r.left < -2; })
    .slice(0, 4).map(el => el.textContent.trim().slice(0, 30));
  // The outermost elements that stick out past the screen edge, so the model knows what to fix.
  const out = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.right > W + 2 || r.left < -2); };
  const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '');
  const wide = [...document.querySelectorAll('body *')].filter(el => out(el) && !(el.parentElement && el.parentElement !== document.body && out(el.parentElement)))
    .slice(0, 3).map(el => { const r = el.getBoundingClientRect(); return `<${name(el)}> from x=${Math.round(r.left)} to x=${Math.round(r.right)}`; });
  let state = null, hook = false;
  try { hook = !!(window.__brbTest && typeof window.__brbTest.state === 'function'); if (hook) state = JSON.stringify(window.__brbTest.state()).slice(0, 600); } catch (e) { state = 'state() threw: ' + e.message; }
  const canvases = [...document.querySelectorAll('canvas')].filter(vis).length;
  return {
    sideways: de.scrollWidth > W + 2 || innerWidth > W + 2,   // a phone zooms out to fit wide pages, which shrinks the game
    smallButtons: small.slice(0, 6), offscreenText: offscreen, wide, testHook: hook, state, canvases,
    textCount: (document.body.innerText || '').trim().length,
  };
}

/** Find what to tap to start: the test hook's start(), a Play-ish button, the biggest button, or the middle of the screen. */
function startTarget(words) {
  const re = new RegExp(words, 'i');
  if (window.__brbTest && typeof window.__brbTest.start === 'function') { try { window.__brbTest.start(); return { hook: true }; } catch { /* fall through */ } }
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 8 && r.height > 8 && s.visibility !== 'hidden' && s.display !== 'none' && r.top < innerHeight && r.bottom > 0; };
  const all = [...document.querySelectorAll('button,[role=button],.btn,[onclick]')].filter(vis);
  const area = el => { const r = el.getBoundingClientRect(); return r.width * r.height; };
  const play = all.filter(el => re.test((el.getAttribute('aria-label') || '') + ' ' + el.textContent)).sort((a, b) => area(b) - area(a))[0];
  const pick = play || all.sort((a, b) => area(b) - area(a))[0];
  if (pick) { const r = pick.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: (pick.textContent || '').trim().slice(0, 24) }; }
  return { x: innerWidth / 2, y: innerHeight / 2, label: '' };
}

/**
 * Run a game and photograph it.
 * opts: { size: 'cover'|'phone', orientation: 'portrait'|'landscape'|'any', lang, dir, title, titleMs, playMs, scale, quality }
 * Returns { title: Buffer, play: Buffer|null, started, errors: [], before: inspect(), after: inspect() }.
 */
export function runGame(gameHtml, opts = {}) {
  if (!enabled()) return Promise.reject(new Error('Screenshots are off on this server'));
  return serial(() => capture(gameHtml, opts));
}

async function capture(gameHtml, opts) {
  const o = { size: 'cover', orientation: 'portrait', lang: 'en', dir: 'ltr', title: 'Game', titleMs: 1400, playMs: 2200, scale: 1.5, quality: 72, ...opts };
  const shape = SIZES[o.size][o.orientation === 'landscape' ? 'landscape' : 'portrait'];
  const doc = frameDocument(gameHtml, { user: { displayName: 'Player', avatar: '🦊', isGuest: false, lang: o.lang, dir: o.dir }, game: { id: 'preview', title: o.title }, save: {}, canSave: false, preview: true });
  const host = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{width:100%;height:100%;border:0;display:block}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const b = await browser();
  const ctx = await b.newContext({ viewport: shape, deviceScaleFactor: o.scale, hasTouch: true, isMobile: false, reducedMotion: 'no-preference', serviceWorkers: 'block', locale: o.lang });
  const errors = [];
  try {
    await ctx.route('**/*', route => {
      const u = route.request().url();
      if (u === `${HOST}/`) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
      if (u === `${HOST}/frame`) return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': FRAME_CSP }, body: doc });
      if (ALLOWED.test(u)) return route.continue();
      return route.abort();
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e.message || e).split('\n')[0].slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.goto(`${HOST}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const frame = await waitFrame(page);
    await wait(o.titleMs);
    const before = await frame.evaluate(inspect, shape.width).catch(e => ({ error: e.message }));
    const title = await page.screenshot({ type: 'jpeg', quality: o.quality });
    let play = null, started = null;
    if (o.playMs > 0) {
      const target = await frame.evaluate(startTarget, PLAY_WORDS.source).catch(() => null);
      started = target ? (target.hook ? 'started it with __brbTest.start()' : `tapped ${target.label ? `"${target.label}"` : 'the middle'}`) : null;
      if (target && !target.hook) await page.touchscreen.tap(target.x, target.y).catch(() => page.mouse.click(target.x, target.y));
      await wait(o.playMs);
      play = await page.screenshot({ type: 'jpeg', quality: o.quality });
    }
    const after = await frame.evaluate(inspect, shape.width).catch(e => ({ error: e.message }));
    return { title, play, started, errors: [...new Set(errors)].slice(0, 8), before, after, launches };
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function waitFrame(page) {
  for (let i = 0; i < 50; i++) {
    const f = page.frames().find(x => x.url() === `${HOST}/frame`);
    if (f) { await f.waitForLoadState('domcontentloaded').catch(() => {}); return f; }
    await wait(100);
  }
  throw new Error('The game frame did not load');
}

/** The better cover of the two pictures: gameplay, unless it came out much plainer (blank, a loading screen) than the title. */
export function pickCover(r) {
  if (!r.play) return r.title;
  return r.play.length >= r.title.length * 0.6 ? r.play : r.title;
}

process.once('exit', () => { closeBrowser(); });
