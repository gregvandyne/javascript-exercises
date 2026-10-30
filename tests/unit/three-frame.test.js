// 3D games in real Chromium, inside the production wrapper (frameDocument + the frame CSP with the site's
// /vendor/three/ path + the sandbox attribute), with the vendor files answered from disk:
//   - Star Island draws real 3D pictures, with the pixel ratio capped;
//   - the SDK's device check shows its friendly message when import maps or WebGL 2 are missing, or the 3D picture is
//     lost and not restored, and hides it again when it comes back;
//   - BRB.fx.fit never creates a 2D context (so a canvas can still get WebGL), and fit3d sizes a renderer in the right order.
// Needs a local Chromium; skipped when there is none.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { loadTemplate } = await import('../../server/builder/templates/index.js');
const HOST = 'http://game.invalid';
const DEVICE = { title: 'Needs a newer device', text: 'Try another one.' };

let browser;
test.after(async () => { if (browser) await browser.close(); });
// A 2x screen for every frame: Playwright's deviceScaleFactor does not reach the sandboxed (out-of-process) game frame.
async function open(gameHtml, { init = null, size = { width: 390, height: 700 } } = {}) {
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=2'] }); }
  const ctx = await browser.newContext({ viewport: size });
  if (init) await ctx.addInitScript(init);
  const doc = frameDocument(gameHtml, { user: { displayName: 'P', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'T' }, save: {}, canSave: false, preview: true, deviceText: DEVICE });
  const host = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const errors = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const m = /^http:\/\/game\.invalid\/vendor\/three\/([\d.]+)\/([\w.]+)$/.exec(u);
    if (m) return route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(ROOT, 'public/vendor/three', m[1], m[2])) });
    // the Oomba Kit (Star Island's screens and HUD) and its font, from disk like the site serves them
    const k = /^http:\/\/game\.invalid\/vendor\/oomba-kit\/([\d.]+)\/([\w./-]+)$/.exec(u);
    if (k && !k[2].includes('..')) return route.fulfill({ status: 200, headers: { 'content-type': k[2].endsWith('.woff2') ? 'font/woff2' : 'text/javascript', 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-kit', k[1], k[2])) });
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(HOST + '/', { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 50 && !frame; i++) { frame = page.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await page.waitForTimeout(100); }
  return { ctx, page, frame, errors };
}
const ready = frame => frame.waitForFunction(() => window.__brbTest && window.__brbTest.state().ready && window.__brbTest.state().frames > 10, null, { timeout: 20_000 });
/** How varied a screenshot is: distinct colours and the spread of brightness (a blank or one-colour frame scores ~0). */
async function pixelStats(page, png) {
  const p2 = await page.context().newPage();
  const r = await p2.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; const seen = new Set(); let sum = 0, sum2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) { const y = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; sum += y; sum2 += y * y; n++; seen.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3)); }
    return { colours: seen.size, spread: Math.sqrt(sum2 / n - (sum / n) ** 2) };
  }, png.toString('base64'));
  await p2.close(); return r;
}

test('Star Island draws real 3D pictures in the production wrapper, pixel ratio capped at 1.5', { skip, timeout: 90_000 }, async () => {
  const { ctx, page, frame, errors } = await open(loadTemplate('island'));
  try {
    await ready(frame);
    await frame.evaluate(() => window.__brbTest.start());
    await page.waitForTimeout(800);
    const st = await frame.evaluate(() => window.__brbTest.state());
    assert.equal(st.screen, 'play'); assert.equal(st.total, 12); assert.equal(st.platforms, 4);
    assert.equal(await frame.evaluate(() => devicePixelRatio), 2);
    assert.ok(st.pixelRatio <= 1.5, `pixel ratio ${st.pixelRatio} on a 2x screen`);
    assert.ok(st.drawCalls > 10 && st.drawCalls <= 100, `draw calls ${st.drawCalls}`);
    assert.ok(st.triangles < 150_000, `triangles ${st.triangles}`);
    const s = await pixelStats(page, await page.screenshot({ type: 'png' }));
    assert.ok(s.colours > 150 && s.spread > 15, `a real picture, not blank: ${JSON.stringify(s)}`);
    assert.equal(await frame.evaluate(() => !!document.getElementById('brb-device')), false, 'no device message on a capable browser');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('no import maps: a friendly device message instead of a blank game', { skip, timeout: 60_000 }, async () => {
  const { ctx, page, frame } = await open(loadTemplate('island'), {
    init: () => { const orig = HTMLScriptElement.supports; HTMLScriptElement.supports = t => (t === 'importmap' ? false : orig.call(HTMLScriptElement, t)); },
  });
  try {
    await frame.waitForSelector('#brb-device', { timeout: 10_000 });
    const box = await frame.evaluate(() => { const d = document.getElementById('brb-device'); const r = d.getBoundingClientRect(); return { why: d.dataset.why, text: d.innerText, role: d.getAttribute('role'), w: r.width, h: r.height }; });
    assert.equal(box.why, 'importmap'); assert.equal(box.role, 'alert');
    assert.match(box.text, /Needs a newer device/); assert.match(box.text, /Try another one\./);
    assert.ok(box.w >= 380 && box.h >= 690, 'covers the whole game');
    await page.waitForTimeout(300);
  } finally { await ctx.close(); }
});

test('no WebGL 2: the same message (English fallback when no text was given)', { skip, timeout: 60_000 }, async () => {
  const html = loadTemplate('island');
  const { ctx, frame } = await open(html, {
    init: () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k) { return k === 'webgl2' ? null : g.apply(this, arguments); }; },
  });
  try {
    await frame.waitForSelector('#brb-device', { timeout: 10_000 });
    assert.equal(await frame.evaluate(() => document.getElementById('brb-device').dataset.why), 'webgl2');
  } finally { await ctx.close(); }
  // Without deviceText (e.g. the screenshot worker) the SDK says it in English.
  const doc = frameDocument(html, { user: { lang: 'en' }, game: { id: 'g', title: 'T' }, save: {}, canSave: false });
  assert.match(doc, /"device":\{"webgl2":true,"importmap":true\}/);
  assert.match(fs.readFileSync(path.join(ROOT, 'public/sdk/brb-sdk.js'), 'utf8'), /This game needs a newer device or browser/);
});

test('a lost 3D picture that does not come back shows the message; it goes away when the picture returns', { skip, timeout: 90_000 }, async () => {
  const { ctx, page, frame } = await open(loadTemplate('island'));
  try {
    await ready(frame);
    await frame.evaluate(() => { const gl = document.getElementById('view').getContext('webgl2'); window.__lose = gl.getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
    await page.waitForTimeout(1500);
    assert.equal(await frame.evaluate(() => !!document.getElementById('brb-device')), false, 'waits a moment: the game asked for it back');
    await frame.waitForSelector('#brb-device[data-why="lost"]', { timeout: 6_000 });
    await frame.evaluate(() => window.__lose.restoreContext());
    await frame.waitForFunction(() => !document.getElementById('brb-device'), null, { timeout: 5_000 });
  } finally { await ctx.close(); }
});

test('fit() never makes a 2D context (a canvas can still get WebGL); 2D games keep their scale; fit3d sizes renderers in order', { skip, timeout: 60_000 }, async () => {
  const game = `<title>Fit</title><script>
    var R = {};
    var a = document.createElement('canvas'); BRB.fx.fit(a, 100, 50); R.webglAfterFit = !!a.getContext('webgl2');
    var b = document.createElement('canvas'); BRB.fx.fit(b, 100, 50); R.scaleLater = b.getContext('2d').getTransform().a;
    var c = document.createElement('canvas'); var cx = c.getContext('2d'); BRB.fx.fit(c, 100, 50); R.scaleBefore = cx.getTransform().a;
    var calls = []; var fake = { setPixelRatio: function (r) { calls.push('dpr ' + r); }, setSize: function (w, h) { calls.push('size ' + w + 'x' + h); } };
    var cam = { aspect: 0, updateProjectionMatrix: function () { calls.push('camera'); } };
    var f = BRB.fx.fit3d(fake, cam, { maxDpr: 1.5 }); R.calls = calls; R.cam = cam; window.__fit = f;
    window.__R = R;
  </script>`;
  const { ctx, frame } = await open(game);
  try {
    await frame.waitForFunction(() => window.__R && innerWidth > 0);
    await frame.waitForTimeout(300);   // the frame may get its size a moment after the script ran
    const R = await frame.evaluate(() => ({ ...window.__R, first: window.__R.calls.slice(0, 1), last: window.__R.calls.slice(-3), aspect: window.__R.cam.aspect }));
    R.after = await frame.evaluate(() => { window.__fit.maxDpr(1.25); return window.__R.calls.slice(-3); });
    assert.equal(R.webglAfterFit, true, 'fit() left the canvas free for WebGL');
    assert.equal(R.scaleLater, 2, 'a 2D context made after fit() starts at the fitted scale');
    assert.equal(R.scaleBefore, 2, 'an existing 2D context is scaled as before');
    assert.deepEqual(R.first, ['dpr 1.5'], 'the pixel ratio (capped) comes first');
    assert.deepEqual(R.last, ['dpr 1.5', 'size 390x700', 'camera'], 'pixel ratio, then size, then camera');
    assert.ok(Math.abs(R.aspect - 390 / 700) < 1e-9);
    assert.deepEqual(R.after, ['dpr 1.25', 'size 390x700', 'camera'], 'maxDpr(n) refits');
  } finally { await ctx.close(); }
});
