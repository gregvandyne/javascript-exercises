// The screenshot worker (server/shots-worker.js): the HTTP contract the migration team deploys against.
// Health and auth are always checked; the real render needs a local Chromium and is otherwise skipped.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const noChromium = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH;

const PORT = 4700 + Math.floor(Math.random() * 180);
const TOKEN = 'worker-test-token-' + Math.random().toString(36).slice(2);
let child;

test.before(async () => {
  child = spawn(process.execPath, ['server/shots-worker.js'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, SHOTS_TOKEN: TOKEN, SHOTS_PORT: String(PORT), BRB_SILENT: '1', ...(exe ? { BRB_CHROMIUM: exe } : {}) },
  });
  // wait for /health
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('worker did not start');
});
test.after(() => { if (child) child.kill('SIGKILL'); });

const base = () => `http://127.0.0.1:${PORT}`;
const run = (body, token = TOKEN, headers = {}) => fetch(base() + '/run', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body });

test('health is public', async () => { const r = await fetch(base() + '/health'); assert.equal(r.status, 200); assert.equal((await r.text()), 'ok'); });
test('needs a correct bearer token', async () => {
  assert.equal((await run('{}', null)).status, 401);
  assert.equal((await run('{}', 'nope')).status, 401);
});
test('unknown routes 404', async () => { assert.equal((await fetch(base() + '/')).status, 404); });
test('rejects an oversize body', async () => {
  const big = '{"html":"' + 'x'.repeat(5 * 1024 * 1024) + '"}';
  assert.equal((await run(big)).status, 413);
});
test('rejects bad json and missing html', async () => {
  assert.equal((await run('not json')).status, 400);
  assert.equal((await run('{"opts":{}}')).status, 400);
});

test('renders a game and returns base64 pictures', { skip: noChromium ? 'no Chromium' : false, timeout: 90_000 }, async () => {
  const r = await run(JSON.stringify({ html: '<title>T</title><canvas></canvas><div style="background:#2a6;color:#fff;padding:40px;font-size:30px">Hello</div>', opts: { size: 'cover', playMs: 0 } }));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(typeof j.title, 'string');
  const buf = Buffer.from(j.title, 'base64');
  assert.ok(buf.length > 2000, 'a real JPEG came back');
  assert.equal(buf.toString('latin1', 0, 2), '\xff\xd8', 'JPEG magic bytes');
});

test('renders a 3D game too: the self-hosted Three.js is answered from the worker\'s own files', { skip: noChromium ? 'no Chromium' : false, timeout: 120_000 }, async () => {
  const html = fs.readFileSync(path.join(ROOT, 'server/builder/templates/island.html'), 'utf8');
  const r = await run(JSON.stringify({ html, opts: { size: 'cover', titleMs: 1500, playMs: 1500 } }));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual(j.errors, []);
  const st = JSON.parse(j.after.state);
  assert.equal(st.ready, true, 'Three.js loaded and the island was built'); assert.equal(st.screen, 'play');
  assert.ok(Buffer.from(j.play, 'base64').length > 8000, 'a real picture of the 3D world');
});
