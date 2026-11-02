// The Builder's own 3D starter (templates/world3d.html, no Oomba Kit) in real Chromium, inside the production wrapper:
// it draws, and its player walks like a 3D game should: on the ground, up gentle hills and steps, stopped (and sliding)
// at walls, never lifted into the air, jumps that land, and never past the world's edge.
// Needs a local Chromium; skipped when there is none. SHOTS=dir also saves pictures at phone, tablet and desktop sizes.
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

let browser;
test.after(async () => { if (browser) await browser.close(); });
async function open(size = { width: 844, height: 390 }) {
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-gpu'] }); }
  const ctx = await browser.newContext({ viewport: size });
  const doc = frameDocument(loadTemplate('world3d'), { user: { displayName: 'P', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'T' }, save: {}, canSave: false, preview: true, deviceText: { title: 'x', text: 'y' } });
  const host = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const errors = [], kit = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const m = /^http:\/\/game\.invalid\/vendor\/three\/([\d.]+)\/([\w.]+)$/.exec(u);
    if (m) return route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(ROOT, 'public/vendor/three', m[1], m[2])) });
    if (u.includes('/oomba-kit/')) kit.push(u);
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(HOST + '/', { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 50 && !frame; i++) { frame = page.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await page.waitForTimeout(100); }
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state().ready, null, { timeout: 20_000 });
  return { ctx, page, frame, errors, kit };
}
const T = (frame, fn, arg) => frame.evaluate(([f, a]) => window.__brbTest[f](...(a || [])), [fn, arg]);
const st = frame => T(frame, 'state');
/** Hold an input for ms, sampling the player: -> the samples. */
async function hold(page, frame, input, ms) {
  await T(frame, 'drive', [input]);
  const out = [];
  for (let t = 0; t < ms; t += 100) { await page.waitForTimeout(100); out.push(await st(frame)); }
  await T(frame, 'drive', [null]);
  return out;
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('world3d: a kit-free 3D world whose player stays on the ground, stops at walls, climbs steps and lands its jumps', { skip, timeout: 120_000 }, async () => {
  const { ctx, page, frame, errors, kit } = await open();
  try {
    await T(frame, 'start'); await page.waitForTimeout(300);
    assert.equal((await st(frame)).screen, 'play');
    assert.deepEqual(kit, [], 'loads nothing from the Oomba Kit');

    // flat ground: walking forward (up / W) moves along the ground, never up
    await T(frame, 'teleport', [3, 8]); await T(frame, 'look', [0]);
    let s = await hold(page, frame, { x: 0, z: 1 }, 800);
    assert.ok(s.at(-1).pos.z < 6, 'walked forward');
    for (const p of s) near(p.pos.y, p.ground, 0.05, 'stays on the flat ground');

    // a wall: stops in front of it, not on top of it
    await T(frame, 'teleport', [0, -12]);
    s = await hold(page, frame, { x: 0, z: 1 }, 1500);
    assert.ok(s.at(-1).pos.z > -15.7, `stopped at the wall (z ${s.at(-1).pos.z})`);
    for (const p of s) near(p.pos.y, p.ground, 0.05, 'never lifted onto the wall');
    // pushing into it at an angle slides along it
    const before = s.at(-1).pos.x;
    s = await hold(page, frame, { x: 1, z: 1 }, 800);
    assert.ok(s.at(-1).pos.x > before + 1, 'slides along the wall');
    assert.ok(s.at(-1).pos.z > -15.7, 'still in front of the wall'); near(s.at(-1).pos.y, s.at(-1).ground, 0.05, 'on the ground');

    // the house is too tall to walk or jump onto
    await T(frame, 'teleport', [8, 0]);
    s = await hold(page, frame, { x: 0, z: 1, jump: true }, 1600);
    assert.ok(s.at(-1).pos.z > -3.6, 'stopped at the house');
    assert.ok(Math.max(...s.map(p => p.pos.y)) < 2.9, 'could not jump onto a 3 m roof');
    near(s.at(-1).pos.y, 0, 0.05, 'landed again');

    // steps (0.45 m each) walk up without jumping, to the top step and no higher
    await T(frame, 'teleport', [-6, 0]);
    s = await hold(page, frame, { x: 0, z: 1 }, 1100);
    const top = Math.max(...s.map(p => p.pos.y));
    near(top, 1.8, 0.06, 'walked up the steps to the top one');
    // walking off the last step falls back down to the ground
    s = await hold(page, frame, { x: 0, z: 1 }, 1200);
    near(s.at(-1).pos.y, s.at(-1).ground, 0.05, 'dropped off the steps and landed');

    // a hill: the player follows the land up and down
    await T(frame, 'teleport', [-14, 0]);
    s = await hold(page, frame, { x: 0, z: 1 }, 1800);
    assert.ok(Math.max(...s.map(p => p.pos.y)) > 1.5, 'climbed the hill');
    for (const p of s) if (p.grounded) near(p.pos.y, p.ground, 0.06, 'on the hill, not above it');

    // a jump goes up and comes back down
    await T(frame, 'teleport', [3, 8]);
    s = await hold(page, frame, { x: 0, z: 0, jump: true }, 1500);
    assert.ok(Math.max(...s.map(p => p.pos.y)) > 0.8, 'jumped');
    assert.ok(s.at(-1).grounded && s.at(-1).pos.y < 0.05, 'landed');

    // the world's edge
    await T(frame, 'teleport', [35, 0]); await T(frame, 'look', [-Math.PI / 2]);
    s = await hold(page, frame, { x: 0, z: 1 }, 1500);
    assert.ok(Math.hypot(s.at(-1).pos.x, s.at(-1).pos.z) <= 38.05, 'stays inside the world');

    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('world3d: pictures at phone, tablet and desktop sizes (SHOTS=dir)', { skip: skip || (!process.env.SHOTS && 'set SHOTS=dir to save pictures'), timeout: 120_000 }, async () => {
  const dir = process.env.SHOTS; fs.mkdirSync(dir, { recursive: true });
  for (const [name, size] of [['phone-landscape', { width: 844, height: 390 }], ['phone-portrait', { width: 390, height: 844 }], ['tablet-portrait', { width: 820, height: 1180 }], ['tablet-landscape', { width: 1180, height: 820 }], ['desktop', { width: 1440, height: 900 }]]) {
    const { ctx, page, frame, errors } = await open(size);
    try {
      await page.waitForTimeout(600); await page.screenshot({ path: path.join(dir, `own3d-${name}-title.png`) });
      await T(frame, 'start'); await T(frame, 'teleport', [-6, 0]);
      await hold(page, frame, { x: 0, z: 1 }, 900); await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(dir, `own3d-${name}.png`) });
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});
