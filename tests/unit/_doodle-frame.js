// Doodle Hoot in the production game frame (frameDocument + the frame CSP + the sandbox attribute) on a stand-in for
// the play page, in real Chromium: for tests/unit/doodle-hoot-look.test.js. Kit files come from /vendor; Google Fonts
// (the look's Bricolage Grotesque) load only when DOODLE_SHOTS is set (else they are turned away, as offline).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium'];
export const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f) && fs.statSync(f).isFile());
export const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
export const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/doodle-hoot.html'), 'utf8');
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const HOST = 'http://game.invalid';
let browser = null;
export async function closeBrowser() { if (browser) await browser.close(); browser = null; }

/** The game in its frame: { p, frame, ctx, errors, outside, shot(name) }. theme: 'light' | 'dark'. */
export async function openDoodle({ width = 1280, height = 800, theme = 'light', lang = 'en', save = {}, touch = width < 700, scale = 1 } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, deviceScaleFactor: scale, colorScheme: theme });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang, dir: ['ar', 'he'].includes(lang) ? 'rtl' : 'ltr' }, game: { id: 'g', title: 'Doodle Hoot', url: `${HOST}/play/doodle-hoot` }, save, canSave: true, theme, tts: { langs: [] } });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>window.__msgs = []; addEventListener('message', e => { const d = e.data; if (!d || d.brb !== 1) return; window.__msgs.push(d);
  const back = m => e.source.postMessage(Object.assign({ brb: 1 }, m), '*');
  if (d.type === 'brb:tts' && !d.pre) back({ type: 'brb:tts', id: d.id, ok: false, why: 'off' });
});</script>`;
  const outside = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return process.env.DOODLE_SHOTS ? route.continue() : route.abort();
    outside.push(u); return route.abort();
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.setup, null, { timeout: 60_000 });
  const shot = async name => { if (process.env.DOODLE_SHOTS) { await p.waitForTimeout(250); await p.screenshot({ path: path.join(process.env.DOODLE_SHOTS, `${name}.png`) }); } };
  return { p, frame, ctx, errors, outside, shot };
}
