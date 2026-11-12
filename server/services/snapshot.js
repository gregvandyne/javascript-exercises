// Runs a game in a headless Chromium, the same way players get it (frameDocument + the frame CSP inside a sandboxed iframe),
// and takes pictures: one of the title screen and one after tapping Play. Used for
//   - cover pictures of Studio games (services/shots.js), and
//   - the Builder's playtest_game tool, which shows the model what its game really looks like.
// One browser, one game at a time, closed again when idle (the server is small).
//
// Two modes:
//   - Local (default; what Render runs): launch Chromium here, from a scrubbed environment and an empty
//     temp working directory. On in production, or with BRB_SNAPSHOTS=1.
//   - Remote (what deploy/docker-compose.yml runs): when SNAPSHOT_URL is set, send each job to a separate screenshot
//     worker (server/shots-worker.js) over HTTP, so the browser runs in its own container with no database and no
//     secrets. The worker runs the exact same code via runLocal().
//   BRB_SNAPSHOTS=0 turns both off.
// The game page can reach nothing but Google Fonts, cdnjs and the self-hosted /vendor/three/, /vendor/oomba-kit/, Kit 2's /vendor/kit2/ and /vendor/themes/
// files (the same sources its CSP allows); the vendor files are answered from disk, so 3D and kit games work the same
// locally and in the worker.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameDocument, frameCsp, SANDBOX } from './frame.js';
import { VENDOR_PATH, DATA_PATH, THREE_MODULE, THREE_CORE, KIT2_PATH, THEMES_PATH } from './vendor.js';
import { KIT_PATH } from './kit.js';
import { config } from '../config.js';

const HOST = 'http://game.invalid';
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
/** A /vendor/three/<v>/<file>, /vendor/oomba-kit/<v>/[fonts/ | packs/]<file> or /vendor/data/<game>/<v>/<file> request ->
 *  the file on disk, or null (plain names only, never outside those folders). */
function vendorFile(url) {
  const p = new URL(url).pathname;
  const d = /^\/vendor\/data\/([a-z0-9][a-z0-9-]{0,40})\/([0-9][0-9a-z.-]{0,30})\/([a-z0-9][a-z0-9.-]{0,60})$/i.exec(p);
  if (d) {
    if ([d[1], d[2], d[3]].some(x => x.includes('..'))) return null;
    const dir = path.join(PUBLIC_DIR, 'vendor', 'data'), f = path.join(dir, d[1], d[2], d[3]);
    return f.startsWith(dir + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
  }
  // Kit 2: /vendor/kit2/<engine>/<v>/<path> and /vendor/themes/<theme>/<v>/<path> (up to three folders deep, plain names).
  const k = /^\/vendor\/(kit2|themes)\/((?:[a-z0-9][a-z0-9._-]{0,40}\/){2,5}[a-z0-9][a-z0-9._-]{0,60})$/i.exec(p);
  if (k) {
    if (k[2].split('/').some(x => x === '..' || x.startsWith('.'))) return null;
    const dir = path.join(PUBLIC_DIR, 'vendor', k[1]), f = path.join(dir, k[2]);
    return f.startsWith(dir + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
  }
  const m = /^\/vendor\/(three|oomba-kit)\/([0-9][0-9a-z.-]{0,30})\/((?:fonts\/|packs\/)?[a-z0-9][a-z0-9.-]{0,60})$/i.exec(p);
  if (!m || m[2].includes('..') || m[3].includes('..') || (m[1] === 'three' && m[3].includes('/'))) return null;
  const dir = path.join(PUBLIC_DIR, 'vendor', m[1]);
  const f = path.join(dir, m[2], m[3]);
  return f.startsWith(dir + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
}
export { vendorFile };
const VENDOR_TYPES = { js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', woff2: 'font/woff2', json: 'application/json; charset=utf-8', glb: 'model/gltf-binary', ogg: 'audio/ogg', webp: 'image/webp', png: 'image/png' };
/** Are the pinned Three.js files on this disk? (The worker checks at start: without them 3D covers fail.) */
export const threeReady = () => [THREE_MODULE, THREE_CORE].every(p => !!vendorFile(`${HOST}${p}`));
const ALLOWED = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)\//;
const IDLE_MS = 45_000;
export const JOB_MS = 55_000;   // a playtest with every device size takes about 15 s more than a cover
export const SIZES = {
  cover: { portrait: { width: 360, height: 480 }, landscape: { width: 640, height: 480 } },
  phone: { portrait: { width: 390, height: 700 }, landscape: { width: 844, height: 390 } },
};
/** The devices a Builder playtest checks (docs/sdk.md "How the Builder edits games"): the game is shown at each size by
 *  resizing the window, as turning a tablet does, so a game has to lay itself out again on a resize. */
export const VIEWS = [
  { key: 'phone-portrait', label: 'Phone portrait', width: 390, height: 844 },
  { key: 'tablet-portrait', label: 'Tablet portrait', width: 820, height: 1180 },
  { key: 'phone-landscape', label: 'Phone landscape', width: 844, height: 390 },
  { key: 'tablet-landscape', label: 'Tablet landscape', width: 1180, height: 820 },
  { key: 'desktop', label: 'Desktop', width: 1280, height: 800 },
];
// Words on a start button, in the site's languages (lower case).
const PLAY_WORDS = /\b(play|start|go|begin|let'?s go|tap to (play|start))\b|jouer|commencer|jugar|empezar|comenzar|spielen|starten|los geht|jogar|começar|iniciar|gioca|inizia|spelen|begin|играть|начать|старт|スタート|あそぶ|はじめる|開始|遊戲|שחק|התחל|العب|ابدأ|▶|►/i;

let browserP = null, idleTimer = null, chain = Promise.resolve(), launches = 0, workDir = null;

// Screenshots are possible if a remote worker is configured, or local Chromium is turned on. BRB_SNAPSHOTS=0 wins.
export const enabled = () => !config.snapshotsOff && (!!config.snapshotUrl || !!config.snapshots);
const remote = () => !!config.snapshotUrl;

async function browser() {
  if (browserP) { const b = await browserP.catch(() => null); if (b && b.isConnected()) return b; browserP = null; }
  browserP = (async () => {
    const { chromium } = await import('playwright-core');
    launches++;
    // An empty temp directory for the browser's profile, downloads and working directory, so Chromium
    // never reads or writes the server's own folder (where the database and backups live).
    if (!workDir || !fs.existsSync(workDir)) workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-chromium-'));
    return chromium.launch({
      ...(config.chromiumPath ? { executablePath: config.chromiumPath } : {}),
      cwd: workDir,
      downloadsPath: workDir,
      // A bare environment: the browser never sees the server's secrets (API key, session secret).
      env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: workDir, TMPDIR: workDir, ...(process.env.FONTCONFIG_PATH ? { FONTCONFIG_PATH: process.env.FONTCONFIG_PATH } : {}) },
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
  if (workDir) { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ } workDir = null; }
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
  try { hook = !!(window.__brbTest && typeof window.__brbTest.state === 'function'); if (hook) state = JSON.stringify(window.__brbTest.state()).slice(0, 1200); } catch (e) { state = 'state() threw: ' + e.message; }
  const canvases = [...document.querySelectorAll('canvas')].filter(vis).length;
  return {
    sideways: de.scrollWidth > W + 2 || innerWidth > W + 2,   // a phone zooms out to fit wide pages, which shrinks the game
    smallButtons: small.slice(0, 6), offscreenText: offscreen, wide, testHook: hook, state, canvases,
    textCount: (document.body.innerText || '').trim().length,
  };
}

/** Layout problems at the current window size, in the game frame (short sentences for the model, at most 6): sideways
 *  scrolling, text or buttons cut off at an edge, text cut off inside its box, things on top of each other, buttons too
 *  small to tap or squashed thin. Only visible things on top count (not a board under a question card, not floating
 *  layers that ignore the pointer, such as banners and confetti). */
function layoutProblems() {
  const W = innerWidth, H = innerHeight, out = [];
  const say = s => { if (out.length < 6 && !out.includes(s)) out.push(s); };
  const de = document.documentElement;
  if (de.scrollWidth > W + 2 || (document.body && document.body.scrollWidth > W + 2)) say('the page is wider than the screen and scrolls sideways');
  const shown = el => {
    if (el.closest('[aria-hidden="true"],[hidden]')) return false;
    for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.2) return false; }
    const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2;
  };
  const floating = el => { for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).pointerEvents === 'none') return true; return false; };
  const txt = el => `"${(el.innerText || el.value || el.getAttribute('aria-label') || el.tagName.toLowerCase()).trim().replace(/\s+/g, ' ').slice(0, 28)}"`;
  const ownText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const scrollerOf = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowY; if (o === 'auto' || o === 'scroll') return e; } return null; };
  const items = [];
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    if (/^(SCRIPT|STYLE|CANVAS|TEMPLATE|NOSCRIPT|svg|path|g)$/i.test(el.tagName)) continue;
    const control = el.matches('button,[role="button"],a[href],input,select,textarea');
    if (!control && !ownText(el)) continue;
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    const cx = Math.min(W - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(H - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(cx, cy);
    if (hit && !el.contains(hit) && !hit.contains(el) && !floating(hit) && cy === r.top + r.height / 2) continue;   // covered by another layer
    items.push({ el, control, r, float: floating(el), scroller: scrollerOf(el) });
    if (items.length > 400) break;
  }
  for (const it of items) {
    const r = it.r;
    if (!it.float && !it.scroller && (r.left < -2 || r.top < -2 || r.right > W + 2 || r.bottom > H + 2)) say(`cut off at the screen edge: ${txt(it.el)}`);
    const cs = getComputedStyle(it.el);
    if (!it.control && /hidden|clip/.test(cs.overflowX + cs.overflowY) && cs.textOverflow !== 'ellipsis' && (it.el.scrollWidth > it.el.clientWidth + 2 || it.el.scrollHeight > it.el.clientHeight + 3)) say(`text cut off inside its box: ${txt(it.el)}`);
    if (it.control && !it.float) {
      const w = Math.round(r.width), h = Math.round(r.height);
      if (Math.min(w, h) < 44) say(`too small to tap (${w}x${h}px, needs 44): ${txt(it.el)}`);
      else if (h / w > 1.5) say(`squashed tall and thin (${w}x${h}px): ${txt(it.el)}`);
    }
  }
  const flat = items.filter(it => !it.float);
  for (let i = 0; i < flat.length && out.length < 6; i++) for (let j = i + 1; j < flat.length; j++) {
    const a = flat[i], b = flat[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (a.control !== b.control && (a.el.closest('button,[role="button"]') || b.el.closest('button,[role="button"]'))) continue;
    const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (x > 4 && y > 4 && x * y > Math.min(a.r.width * a.r.height, b.r.width * b.r.height) * 0.2) { say(`on top of each other: ${txt(a.el)} and ${txt(b.el)}`); break; }
  }
  return out;
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
 * Run a game and photograph it (remote worker when SNAPSHOT_URL is set, else local Chromium).
 * opts: { size: 'cover'|'phone', orientation: 'portrait'|'landscape'|'any', lang, dir, title, titleMs, playMs, scale, quality,
 *   probe, views }. views: true also shows the game at every VIEWS size (the Builder's playtest): one contact sheet of the
 *   title screen and one after starting, with the layout problems found at each size.
 * Returns { title: Buffer, play: Buffer|null, started, errors: [], before: inspect(), after: inspect(), probe,
 *   views: [{ key, label, width, height, title: [problems], play: [problems] }] | null, sheetTitle, sheetPlay }.
 */
export function runGame(gameHtml, opts = {}) {
  if (!enabled()) return Promise.reject(new Error('Screenshots are off on this server'));
  if (remote()) return runRemote(gameHtml, opts);
  return runLocal(gameHtml, opts);
}

/** The automatic playtest of a game (see autoplay()): opts { orientation, lang, dir, title, autoplayMs?, budgetMs? }. */
export function autoplayGame(gameHtml, opts = {}) {
  return runGame(gameHtml, { scale: 1, ...opts, mode: 'autoplay', size: 'phone' });
}

/** Always run locally in this process (one game at a time, time-limited). The worker calls this. */
export function runLocal(gameHtml, opts = {}) {
  return serial(() => capture(gameHtml, opts));
}

// ---- Remote worker client / wire format ---------------------------------------------
// The result travels as JSON, so the JPEG buffers go as base64.
const PICS = ['title', 'play', 'sheetTitle', 'sheetPlay'];
export function resultToJson(r) {
  const o = { ...r }; for (const k of PICS) o[k] = r[k] ? r[k].toString('base64') : null; return o;
}
function jsonToResult(j) {
  const o = { ...j }; for (const k of PICS) o[k] = j[k] ? Buffer.from(j[k], 'base64') : null; return o;
}
// The worker is down, busy (or too slow to answer) or refuses our token: not the game's fault, so callers retry later
// (err.workerDown).
const workerDown = msg => Object.assign(new Error(msg), { workerDown: true });
async function runRemote(gameHtml, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), JOB_MS + 15_000);
  try {
    let res;
    try {
      res = await fetch(`${config.snapshotUrl}/run`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.shotsToken}` },
        body: JSON.stringify({ html: String(gameHtml || ''), opts: opts || {} }),
      });
    } catch (e) {
      // A job is cut off at JOB_MS inside the worker (a game that freezes gets its own error), so running past that
      // means it waited behind other jobs in the worker's queue: busy, not the game's fault.
      if (ctrl.signal.aborted) throw workerDown('screenshot worker timed out (busy)');
      throw workerDown(`screenshot worker unreachable (${(e.cause && e.cause.code) || e.message})`);
    }
    if (res.status === 401 || res.status === 403) throw workerDown(`screenshot worker refused SHOTS_TOKEN (${res.status}): it must be the same on the app and the worker`);
    if (res.status === 502 || res.status === 503 || res.status === 504) throw workerDown(`screenshot worker busy or unavailable (${res.status})`);
    if (!res.ok) throw new Error(`screenshot worker ${res.status}`);
    const j = await res.json().catch(e => { throw ctrl.signal.aborted ? workerDown('screenshot worker timed out (busy)') : e; });
    if (!j || !j.title) throw new Error('screenshot worker returned no picture');
    return jsonToResult(j);
  } finally { clearTimeout(timer); }
}

async function capture(gameHtml, opts) {
  const o = { size: 'cover', orientation: 'portrait', lang: 'en', dir: 'ltr', title: 'Game', titleMs: 1400, playMs: 2200, scale: 1.5, quality: 72, ...opts };
  const shape = SIZES[o.size][o.orientation === 'landscape' ? 'landscape' : 'portrait'];
  const doc = frameDocument(gameHtml, { user: { displayName: 'Player', avatar: '🦊', isGuest: false, lang: o.lang, dir: o.dir }, game: { id: 'preview', title: o.title }, save: {}, canSave: false, preview: true });
  // The automatic playtest also logs what the game tells the platform through the SDK (score, game over, saves): the
  // SDK posts those to the page around the frame, which is this host page here.
  const listen = o.mode === 'autoplay' ? `<script>${HOST_LOG}</script>` : '';
  const host = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{width:100%;height:100%;border:0;display:block}</style>${listen}<iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const b = await browser();
  const ctx = await b.newContext({ viewport: shape, deviceScaleFactor: o.scale, hasTouch: true, isMobile: false, reducedMotion: 'no-preference', serviceWorkers: 'block', locale: o.lang });
  const errors = [], kitWarnings = [];
  try {
    // Screenshots never need WebRTC, and it is the one outbound path ctx.route cannot abort (it is not HTTP).
    // Remove its constructors from every frame (top and any nested one), so a hostile game cannot open a
    // UDP/WebRTC channel out of the rendering container. Runs before the game's code in each frame.
    await ctx.addInitScript(() => {
      try {
        for (const k of Object.getOwnPropertyNames(window)) {
          if (/^(?:webkit|moz)?RTC/.test(k)) {
            try { Object.defineProperty(window, k, { value: undefined, writable: false, configurable: false }); }
            catch (e) { try { window[k] = undefined; } catch (e2) { /* ignore */ } }
          }
        }
      } catch (e) { /* ignore */ }
    });
    await ctx.route('**/*', route => {
      const u = route.request().url();
      if (u === `${HOST}/`) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
      if (u === `${HOST}/frame`) return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
      if (u.startsWith(`${HOST}${VENDOR_PATH}`) || u.startsWith(`${HOST}${KIT_PATH}`) || u.startsWith(`${HOST}${DATA_PATH}`) || u.startsWith(`${HOST}${KIT2_PATH}`) || u.startsWith(`${HOST}${THEMES_PATH}`)) {
        const f = vendorFile(u);
        if (!f) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ status: 200, headers: { 'content-type': VENDOR_TYPES[f.split('.').pop()] || 'text/plain; charset=utf-8', 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' }, body: fs.readFileSync(f) });
      }
      if (ALLOWED.test(u)) return route.continue();
      return route.abort();
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e.message || e).split('\n')[0].slice(0, 200)));
    page.on('console', m => {
      if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/i.test(m.text())) errors.push(m.text().slice(0, 200));
      // the kit's own warnings (unknown art, a pack not loaded, a gate with no question, a bake that failed): the model
      // never sees the console, so the playtest reports them
      else if (m.type() === 'warning' && /^\[oomba\]/.test(m.text())) kitWarnings.push(m.text().replace(/^\[oomba\]\s*/, '').slice(0, 220));
    });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.goto(`${HOST}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const frame = await waitFrame(page);
    if (o.mode === 'autoplay') return await autoplay({ ctx, page, frame, errors, kitWarnings, o, shape });
    await wait(o.titleMs);
    const before = await frame.evaluate(inspect, shape.width).catch(e => ({ error: e.message }));
    const title = await page.screenshot({ type: 'jpeg', quality: o.quality });
    // Every device size in turn (the window is resized, as turning a tablet does), then back to the phone.
    const views = o.views ? VIEWS.map(v => ({ ...v, title: [], play: [] })) : null;
    const shotsOf = { title: [], play: [] };
    const sweep = async stage => {
      for (const v of views) {
        await page.setViewportSize({ width: v.width, height: v.height });
        await wait(450);
        v[stage] = await frame.evaluate(layoutProblems).catch(e => [`the layout check failed (${String(e.message || e).split('\n')[0].slice(0, 80)})`]);
        shotsOf[stage].push(await page.screenshot({ type: 'jpeg', quality: 50 }));
      }
      await page.setViewportSize(shape); await wait(350);
    };
    if (views) await sweep('title');
    let play = null, started = null;
    if (o.playMs > 0) {
      const target = await frame.evaluate(startTarget, PLAY_WORDS.source).catch(() => null);
      started = target ? (target.hook ? 'started it with __brbTest.start()' : `tapped ${target.label ? `"${target.label}"` : 'the middle'}`) : null;
      if (target && !target.hook) await page.touchscreen.tap(target.x, target.y).catch(() => page.mouse.click(target.x, target.y));
      await wait(o.playMs);
      play = await page.screenshot({ type: 'jpeg', quality: o.quality });
    }
    const after = await frame.evaluate(inspect, shape.width).catch(e => ({ error: e.message }));
    if (views && o.playMs > 0) await sweep('play');
    // One picture per stage with every size side by side, labelled, so the model sees them all at once.
    let sheetTitle = null, sheetPlay = null;
    if (views) {
      sheetTitle = await contactSheet(ctx, views, shotsOf.title, 'title', 'Title screen');
      if (shotsOf.play.length) sheetPlay = await contactSheet(ctx, views, shotsOf.play, 'play', 'After starting');
    }
    // the playtest's probe: about 25 s of game time stepped deterministically, holding right, jumping and answering
    let probe = null;
    if (o.probe) probe = await frame.evaluate(probeGame, { secs: o.probeSecs || 25 }).catch(e => ({ error: String(e.message || e).split('\n')[0].slice(0, 160) }));
    return { title, play, started, errors: [...new Set(errors)].slice(0, 8), kitWarnings: [...new Set(kitWarnings)].slice(0, 10), before, after, probe, launches,
      views: views ? views.map(({ key, label, width, height, title: t, play: p }) => ({ key, label, width, height, title: t, play: p })) : null, sheetTitle, sheetPlay };
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ---- The automatic playtest (the Builder runs it after every build: builder/autotest.js) -------------------------------
// About 18 s of real play with simulated input (keys, taps, swipes, the game's own buttons, mouse movement), sampling the
// screen to tell a moving game from a frozen or blank one, reading what the game reports (the SDK's score / game over /
// saves, the kit's or game's __brbTest.state(), numbers shown on screen), then the layout at phone landscape and tablet
// portrait (and desktop when there is time). Raw facts only: builder/autotest.js turns them into a report.
export const AUTOPLAY_MS = 18_000;
/** In the host page (the frame's parent): keep what the SDK posts (brb:score, brb:gameover, brb:save, brb:ready). */
const HOST_LOG = "window.__ap=[];window.__ap0=Date.now();addEventListener('message',function(e){var d=e.data;if(!d||d.brb!==1||typeof d.type!=='string'||window.__ap.length>200)return;window.__ap.push({type:d.type.slice(0,20),score:typeof d.score==='number'?d.score:null,won:!!d.won,t:Date.now()-window.__ap0});});";
// Buttons the playtest never presses while playing: they pause, open settings or leave (in the site's languages).
const AVOID_WORDS = /pause|setting|menu|quit|exit|home|sound|mute|music|full ?screen|help|how to|close|back|share|language|leave|pausa|paus|réglage|ajust|einstell|impost|instell|настрой|пауза|выйти|設定|ポーズ|設定|暫停|הגדרות|השהה|إعداد|إيقاف|⚙|⏸|✕|×|🔊|🔇|❚❚|☰|^ii$/i;

/** In the game frame: what is on screen and what the game says about itself. */
function apRead() {
  let state = null, hook = false;
  try { hook = !!(window.__brbTest && typeof window.__brbTest.state === 'function'); if (hook) { const s = window.__brbTest.state(); state = s && typeof s === 'object' ? JSON.parse(JSON.stringify(s, (k, v) => (typeof v === 'string' ? v.slice(0, 40) : v))) : null; } } catch (e) { state = { error: String(e && e.message || e).slice(0, 80) }; }
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.1 && r.bottom > 0 && r.top < innerHeight; };
  // Numbers on screen (a score, a timer, a counter) in reading order: a change means the game is counting something.
  const nums = [];
  const walk = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n && nums.length < 30; n = walk.nextNode()) {
    const m = (n.textContent || '').match(/\d+/g); if (!m || !n.parentElement || !vis(n.parentElement)) continue;
    nums.push(...m.slice(0, 3));
  }
  const text = ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').trim();
  return { hook, state, nums: nums.join(','), scoreWord: /score|points|punkte|points|puntos|pontos|punti|punten|очки|счёт|スコア|得分|分數|ניקוד|نقاط/i.test(text), textLen: text.length,
    canvases: [...document.querySelectorAll('canvas')].filter(vis).length, raf: window.__apRaf || 0 };
}
/** In the game frame: count animation frames from now (the fps estimate). */
function apRaf() { if (window.__apRafOn) return; window.__apRafOn = 1; window.__apRaf = 0; const f = () => { window.__apRaf++; requestAnimationFrame(f); }; requestAnimationFrame(f); }
/** In the game frame: the visible buttons the playtest may press while playing (answers, moves, not pause/settings). */
function apButtons(avoid) {
  const re = new RegExp(avoid, 'i');
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 8 && r.height > 8 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.2 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && !el.disabled; };
  return [...document.querySelectorAll('button,[role=button],.btn,[onclick]')].filter(vis)
    .filter(el => !el.closest('.ok-corner, .ok-hud, .ok-modal .ok-close, [data-ap-skip]'))
    .filter(el => !re.test(((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.textContent || '')).trim()))
    .slice(0, 12).map(el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
}

/** The automatic playtest, in an open game (capture() with mode 'autoplay'). Returns raw facts (no pictures but one). */
async function autoplay({ page, frame, errors, kitWarnings, o, shape }) {
  const t0 = Date.now(), budget = o.budgetMs || 40_000, left = () => budget - (Date.now() - t0);
  const W = shape.width, H = shape.height;
  const shots = [];   // { t, at: 'title'|'start'|'idle'|'play', buf }
  const shot = async at => { try { shots.push({ at, t: Date.now() - t0, buf: await page.screenshot({ type: 'jpeg', quality: 45 }) }); } catch { /* the page is gone */ } };
  const read = () => frame.evaluate(apRead).catch(e => ({ error: String(e.message || e).split('\n')[0].slice(0, 120) }));
  const hostLog = () => page.evaluate(() => (window.__ap || []).slice(0, 200)).catch(() => []);
  await wait(o.titleMs || 1500);
  const s0 = await read(); await shot('title');
  // Start the game: the test hook, a Play-ish button, the biggest button, or the middle of the screen; then Enter.
  const target = await frame.evaluate(startTarget, PLAY_WORDS.source).catch(() => null);
  const started = target ? (target.hook ? 'hook' : target.label ? `tap:${target.label}` : 'tap') : 'none';
  if (target && !target.hook) await page.touchscreen.tap(target.x, target.y).catch(() => page.mouse.click(target.x, target.y).catch(() => {}));
  const startedAt = Date.now() - t0;
  // Keys go to the focused frame: after a hook start (no tap) the focus is still on the page around the game.
  await page.focus('iframe').catch(() => {});
  await wait(1200);
  await frame.evaluate(apRaf).catch(() => {});
  const s1 = await read(); await shot('start');
  // A moment with no input: how much the screen moves on its own (an animated title or game).
  await wait(700); await shot('idle');
  // Play: a cycle of inputs, each a few hundred ms, with a picture and a reading every other step.
  const keyHold = async (k, ms) => { await page.keyboard.down(k).catch(() => {}); await wait(ms); await page.keyboard.up(k).catch(() => {}); };
  const keyTap = async k => { await page.keyboard.press(k).catch(() => {}); await wait(120); };
  const tap = async (x, y) => { await page.touchscreen.tap(x, y).catch(() => page.mouse.click(x, y).catch(() => {})); await wait(150); };
  const drag = async (x1, y1, x2, y2) => { await page.mouse.move(x1, y1).catch(() => {}); await page.mouse.down().catch(() => {}); for (let i = 1; i <= 6; i++) { await page.mouse.move(x1 + (x2 - x1) * i / 6, y1 + (y2 - y1) * i / 6).catch(() => {}); await wait(60); } await wait(150); await page.mouse.up().catch(() => {}); };
  const pressButton = async i => { const list = await frame.evaluate(apButtons, AVOID_WORDS.source).catch(() => []); if (list.length) { const b = list[i % list.length]; await tap(b.x, b.y); return 1; } return 0; };
  const actions = [
    () => keyHold('ArrowRight', 700), () => keyTap('Space'), () => keyHold('ArrowUp', 450), () => tap(W * 0.5, H * 0.55),
    () => pressButton(0), () => keyHold('ArrowLeft', 550), () => drag(W * 0.18, H * 0.78, W * 0.32, H * 0.6),
    () => keyHold('KeyD', 500), () => keyTap('Enter'), () => tap(W * 0.25, H * 0.4), () => pressButton(1), () => keyHold('KeyW', 400),
    () => keyHold('ArrowDown', 400), () => tap(W * 0.75, H * 0.65), () => drag(W * 0.7, H * 0.5, W * 0.3, H * 0.5), () => keyTap('Digit1'),
    () => keyHold('KeyA', 450), () => pressButton(2), () => page.mouse.move(W * 0.8, H * 0.3, { steps: 6 }).catch(() => {}), () => keyTap('Space'),
  ];
  const readings = [];
  const playMs = Math.min(o.autoplayMs || AUTOPLAY_MS, Math.max(4000, left() - 14_000));
  const playFrom = Date.now(); let pressed = 0, i = 0;
  while (Date.now() - playFrom < playMs) {
    pressed += (await actions[i % actions.length]()) || 0;
    if (i % 2 === 1) { await shot('play'); readings.push({ t: Date.now() - t0, ...(await read()) }); }
    i++;
  }
  const rafSecs = (Date.now() - playFrom) / 1000 + 0.7 + 1.2;   // counting began right after the start tap
  const s2 = await read(); await shot('play');
  const events = await hostLog();
  // Layout at the sizes most kids play on (resized, as turning a tablet does); desktop too when there is time.
  const layout = [];
  for (const v of VIEWS.filter(x => x.key === 'phone-landscape' || x.key === 'tablet-portrait' || (x.key === 'desktop'))) {
    if (v.key === 'desktop' && left() < 6000) break;
    if (left() < 2500) break;
    await page.setViewportSize({ width: v.width, height: v.height }).catch(() => {});
    await wait(450);
    layout.push({ key: v.key, label: v.label, width: v.width, height: v.height, problems: await frame.evaluate(layoutProblems).catch(e => [`the layout check failed (${String(e.message || e).split('\n')[0].slice(0, 80)})`]) });
  }
  await page.setViewportSize(shape).catch(() => {});
  const diffs = await picDiffs(page.context(), shots.map(s => s.buf)).catch(() => null);
  const title = shots.length ? shots[shots.length - 1].buf : await page.screenshot({ type: 'jpeg', quality: 45 });
  return {
    mode: 'autoplay', title, launches, started, startedAt, inputs: i, pressed, playMs: Date.now() - playFrom, ms: Date.now() - t0,
    errors: [...new Set(errors)].slice(0, 12), kitWarnings: [...new Set(kitWarnings)].slice(0, 6),
    s0, s1, s2, readings, events, layout, fps: s2 && s2.raf ? Math.round(s2.raf / rafSecs) : null,
    shots: shots.map((s, k) => ({ at: s.at, t: s.t, ...(diffs ? diffs[k] : {}) })),
  };
}

/** For each picture: how much of it is one colour (blank) and how much changed since the picture before (0..1). Drawn in a
 *  blank page of the same context (data: pictures, so the canvas can be read). */
async function picDiffs(ctx, bufs) {
  if (!bufs.length) return [];
  const page = await ctx.newPage();
  try {
    await page.setContent('<!doctype html><body></body>', { timeout: 5000 });
    return await page.evaluate(async srcs => {
      const load = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
      const w = 96, h = 64, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true });
      let prev = null; const out = [];
      for (const src of srcs) {
        const im = await load(src); g.drawImage(im, 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data;
        const counts = new Map(); let changed = 0;
        for (let p = 0; p < d.length; p += 4) {
          const key = (d[p] >> 4) << 8 | (d[p + 1] >> 4) << 4 | (d[p + 2] >> 4); counts.set(key, (counts.get(key) || 0) + 1);
          if (prev && Math.abs(d[p] - prev[p]) + Math.abs(d[p + 1] - prev[p + 1]) + Math.abs(d[p + 2] - prev[p + 2]) > 48) changed++;
        }
        out.push({ same: Math.round(Math.max(...counts.values()) / (w * h) * 1000) / 1000, moved: prev ? Math.round(changed / (w * h) * 1000) / 1000 : null });
        prev = d;
      }
      return out;
    }, bufs.map(b => 'data:image/jpeg;base64,' + b.toString('base64')));
  } finally { await page.close().catch(() => {}); }
}

/** The device pictures of one stage in one JPEG: two rows (phone portrait, tablet portrait, phone landscape; tablet
 *  landscape, desktop), each picture scaled to the row's height and labelled with its size and how many problems it has. */
async function contactSheet(ctx, views, pics, stage, heading) {
  const H = 420, GAP = 14, rows = [views.slice(0, 3).map((v, i) => [v, pics[i]]), views.slice(3).map((v, i) => [v, pics[i + 3]])];
  const tile = ([v, pic]) => {
    const w = Math.round(v.width * H / v.height), n = v[stage].length;
    return `<figure style="margin:0;width:${w}px"><figcaption style="font:700 15px/1.25 system-ui,sans-serif;color:#fff;padding:4px 0;white-space:nowrap">${v.label}<br>`
      + `<span style="font-weight:600;color:#ccc">${v.width}×${v.height}</span> · <span style="color:${n ? '#ff8a80' : '#9be89b'}">${n ? `${n} problem${n > 1 ? 's' : ''}` : 'OK'}</span></figcaption>`
      + `<img src="data:image/jpeg;base64,${pic.toString('base64')}" style="display:block;width:${w}px;height:${H}px;border:2px solid #fff;border-radius:6px"></figure>`;
  };
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#222;padding:10px"><div style="font:800 17px system-ui,sans-serif;color:#ffd24a;margin-bottom:6px">${heading} on every device</div>`
    + rows.map(r => `<div style="display:flex;gap:${GAP}px;margin-bottom:${GAP}px;align-items:flex-end">${r.map(tile).join('')}</div>`).join('') + '</body>';
  const page = await ctx.newPage();
  try {
    await page.setViewportSize({ width: 1300, height: 900 });
    await page.setContent(html, { waitUntil: 'load', timeout: 8000 });
    const box = await page.evaluate(() => ({ w: Math.ceil(document.body.scrollWidth), h: Math.ceil(document.body.scrollHeight) }));
    await page.setViewportSize({ width: Math.min(1568, box.w), height: Math.min(1200, box.h) });   // the model's largest size
    return await page.screenshot({ type: 'jpeg', quality: 60, fullPage: true });
  } finally { await page.close().catch(() => {}); }
}

/** In the game frame: drive a kit game (Oomba.game: __brbTest.step) for `secs` of game time: hold right, jump now and
 *  then, answer every question (first tile left; the game's own buttons and 1-4 in turn), tap speech bubbles away. Returns the states before and after, the
 *  scenes seen, how far the hero moved, and whether the game's own DOM covers the hero. Null for other games. */
async function probeGame({ secs }) {
  const T = window.__brbTest; if (!T || typeof T.step !== 'function' || typeof T.state !== 'function') return null;
  const s0 = T.state(); if (!s0 || !s0.game || !('got' in s0)) return null;
  const key = (type, code, k) => { try { window.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true })); } catch (e) { /* ignore */ } };
  const covering = st => {
    const b = st && st.heroBox; if (!b) return null;
    const x = b.x, ys = [b.y, b.y - b.h * 0.25, b.y + b.h * 0.25]; let hits = 0, by = null;
    for (const y of ys) {
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const el = document.elementFromPoint(x, y); if (!el || el.tagName === 'CANVAS' || el === document.body || el === document.documentElement) continue;
      if (el.closest('.ok-hud, .ok-touch, .ok-modal, .ok-bubble, .ok-banner, .ok-toast, .ok-caption')) continue;
      hits++; by = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    }
    return hits >= 2 ? by : null;
  };
  const cover0 = covering(s0), scenes = new Set([s0.scene]);
  let minX = s0.hero ? s0.hero.x : 0, maxX = minX, asked = 0;
  key('keydown', 'ArrowRight', 'ArrowRight');
  for (let i = 0; i < secs * 2; i++) {
    const jump = i % 3 === 0; if (jump) key('keydown', 'Space', ' ');
    T.step(30);
    if (jump) key('keyup', 'Space', ' ');
    const tile = document.querySelector('.ok-ask .ok-tile:not([disabled]):not([aria-disabled="true"])'); if (tile) { tile.click(); asked++; }
    const bub = document.querySelector('.ok-bubble'); if (bub) { bub.click(); bub.click(); }
    // the game's own answer buttons and 1-4 keys, in turn (quiz cards, answer-to-move races)
    if (!tile && i % 2 === 1) {
      const own = [...document.querySelectorAll('button:not([disabled])')].filter(x => !x.closest('.ok-hud, .ok-modal, .ok-touch, .ok-corner, .ok-bubble') && x.offsetParent);
      if (own.length) { own[(i >> 1) % own.length].click(); asked++; }
      const d = 'Digit' + (1 + ((i >> 1) % 4)); key('keydown', d, d.slice(5)); key('keyup', d, d.slice(5));
    }
    await new Promise(r => setTimeout(r, 40));
    const s = T.state(); scenes.add(s.scene); if (s.hero) { minX = Math.min(minX, s.hero.x); maxX = Math.max(maxX, s.hero.x); }
    if (/^(win|lose|goal)$/.test(s.scene)) break;
  }
  key('keyup', 'ArrowRight', 'ArrowRight');
  // a story beat that is still running when the time is up gets a few more seconds (tapping bubbles and answers) before
  // it counts as stuck: a talk scene in progress at the last instant is not a hang
  let s1 = T.state();
  for (let j = 0; j < 10 && s1.scene === 'talk'; j++) {
    T.step(500);
    const tile = document.querySelector('.ok-ask .ok-tile:not([disabled]):not([aria-disabled="true"])'); if (tile) tile.click();
    const bub = document.querySelector('.ok-bubble'); if (bub) { bub.click(); bub.click(); }
    await new Promise(r => setTimeout(r, 300));   // real time too: a quiz card shows the answer for a moment before it closes
    s1 = T.state();
  }
  return { s0, s1, scenes: [...scenes], moved: Math.round(maxX - minX), asked, covered: cover0 };
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
