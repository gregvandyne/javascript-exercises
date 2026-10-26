// Real server processes: a deploy (SIGTERM) or a crash (SIGKILL) in the middle of a Builder build loses nothing, and
// the build carries on by itself after the restart (once). PROC-5, a build that finishes inside the grace, is in
// deploy.test.js. Each test stops its servers.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
const { startServer, lines } = await import('./_proc.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-restart-test-'));
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const ENV = { BRB_MOCK_DELAY_MS: '300', SHUTDOWN_GRACE_SECONDS: '2' };
const FOX = 'Make a catch game about a fox. Just build it.';
const DAILY = 60;
const H = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function boot(dataDir = null) {
  const s = await startServer(ENV, { tmp: TMP, dataDir });
  assert.match(s.out(), /"listening"/, s.out());
  return s;
}
async function stop(s) { if (s.child.exitCode === null && s.child.signalCode === null) { s.child.kill('SIGTERM'); await s.exited; } }
async function setup(s, name) {
  const base = `http://127.0.0.1:${s.port}`;
  const r = await fetch(base + '/api/auth/signup', { method: 'POST', headers: H, body: JSON.stringify({ username: name, password: 'secret12' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const { id } = await (await fetch(base + '/api/studio/new', { method: 'POST', headers: { ...H, cookie }, body: '{}' })).json();
  return { cookie, id };
}
/** The streamed POST, read in the background: { text, done } (done resolves with all of it). */
function chat(s, cookie, id, body) {
  const st = { text: '', status: 0 };
  st.done = (async () => {
    const res = await fetch(`http://127.0.0.1:${s.port}/api/studio/${id}/chat`, { method: 'POST', headers: { ...H, cookie }, body: JSON.stringify(body) });
    st.status = res.status;
    const reader = res.body.getReader(); const dec = new TextDecoder();
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; st.text += dec.decode(value); } } catch { /* the server went away */ }
    return st.text;
  })();
  return st;
}
async function untilText(st, re, ms = 10000) {
  const t0 = Date.now();
  while (!re.test(st.text)) { if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${re} in ${st.text}`); await sleep(20); }
}
const state = async (s, cookie, id) => (await fetch(`http://127.0.0.1:${s.port}/api/studio/${id}`, { headers: { cookie } })).json();
async function untilIdle(s, cookie, id, ms = 20000) {
  const t0 = Date.now();
  for (;;) {
    const st = await state(s, cookie, id);
    if (!st.busy) return st;
    if (Date.now() - t0 > ms) throw new Error('still building');
    await sleep(200);
  }
}
/** Read the database file the server writes (read-only). */
function dbRead(dataDir, fn) {
  const db = new Database(path.join(dataDir, 'brb.db'), { readonly: true, fileMustExist: true });
  try { return fn(db); } finally { db.close(); }
}
const turnRow = dataDir => dbRead(dataDir, db => db.prepare('SELECT id, status, end_reason, attempt, refunded, can_continue FROM builder_turns ORDER BY created_at').all());
/** Start a build and wait until it is about 1 s in: past screening (charged and saved), before version 1. */
async function midBuild(s, cookie, id) {
  const st = chat(s, cookie, id, { text: FOX });
  await untilText(st, /"key":"blocks"/);
  await sleep(700);
  return st;
}

test('PROC-1 SIGTERM mid-build: handed off, exit 0, and after the restart the build carries on and finishes (one version, one turn)', { timeout: 60_000 }, async () => {
  let s = await boot(); const { dataDir } = s;
  try {
    const { cookie, id } = await setup(s, 'RestartKid1');
    const st = await midBuild(s, cookie, id);
    const t0 = Date.now(); s.child.kill('SIGTERM');
    assert.equal(await s.exited, 0);
    assert.ok(Date.now() - t0 < 4000, `exit took ${Date.now() - t0} ms`);
    await st.done;
    assert.match(st.text, /event: restart\ndata: \{"retryMs":5000,"resume":true\}/, 'the open stream is told the build will carry on');
    assert.doesNotMatch(st.text, /event: (done|error)/);
    assert.equal(lines(s.out()).find(l => l.msg === 'handed off Builder turns').turns, 1);
    assert.deepEqual(turnRow(dataDir).map(r => [r.status, r.attempt]), [['interrupted', 1]]);

    s = await boot(dataDir);
    assert.ok(lines(s.out()).some(l => l.msg === 'recovered Builder turns' && l.resumed === 1));
    const after = await untilIdle(s, cookie, id);
    const kinds = after.chat.map(m => (m.role === 'user' ? 'user' : m.interrupted ? 'interrupted' : m.resumed ? 'resumed' : 'other'));
    assert.deepEqual(kinds.filter(k => k !== 'interrupted'), ['user', 'resumed']);
    assert.equal(after.chat[0].text, FOX, 'the message was kept');
    assert.equal(after.chat.at(-1).events[0][0], 'resumed');
    assert.equal(after.versions.length, 1, 'exactly one version');
    assert.equal(after.turnsLeft, DAILY - 1, 'charged once');
    assert.deepEqual(turnRow(dataDir).map(r => [r.status, r.end_reason, r.attempt]), [['done', 'ok', 2]]);
  } finally { await stop(s); }
});

test('PROC-2 SIGKILL mid-build: carried on at the next boot and finished, charged once', { timeout: 60_000 }, async () => {
  let s = await boot(); const { dataDir } = s;
  try {
    const { cookie, id } = await setup(s, 'RestartKid2');
    const st = await midBuild(s, cookie, id);
    s.child.kill('SIGKILL'); await s.exited; await st.done;
    s = await boot(dataDir);
    const after = await untilIdle(s, cookie, id);
    assert.deepEqual(after.chat.map(m => [m.role, !!m.resumed]), [['user', false], ['assistant', true]], 'no interrupted reply after a crash');
    assert.equal(after.versions.length, 1); assert.equal(after.turnsLeft, DAILY - 1);
    assert.deepEqual(turnRow(dataDir).map(r => [r.status, r.attempt]), [['done', 2]]);
  } finally { await stop(s); }
});

test('PROC-3 interrupted twice: stopped with the turn given back and a stopped note; Continue then builds it', { timeout: 90_000 }, async () => {
  let s = await boot(); const { dataDir } = s;
  try {
    const { cookie, id } = await setup(s, 'RestartKid3');
    const st = await midBuild(s, cookie, id);
    s.child.kill('SIGTERM'); assert.equal(await s.exited, 0); await st.done;
    s = await boot(dataDir);
    await sleep(1000);                                   // about 1 s into the resumed attempt
    assert.equal((await state(s, cookie, id)).busy, true);
    s.child.kill('SIGTERM'); assert.equal(await s.exited, 0);
    assert.equal(lines(s.out()).find(l => l.msg === 'handed off Builder turns').turns, 1);
    s = await boot(dataDir);
    const after = await state(s, cookie, id);           // decided at boot, before the server listened
    assert.equal(after.busy, false);
    assert.deepEqual(after.chat.at(-1).events, [['stopped', { why: 'restart' }]]);
    assert.equal(after.turnsLeft, DAILY, 'nothing was saved, so the turn came back');
    const [row] = turnRow(dataDir);
    assert.deepEqual([row.status, row.end_reason, row.attempt, row.refunded, row.can_continue], ['failed', 'restart', 2, 1, 1]);

    const c = chat(s, cookie, id, { text: 'Please carry on with my last message.', continueOf: row.id });
    const text = await c.done;
    assert.equal(c.status, 200); assert.match(text, /event: version/); assert.match(text, /event: done/);
    const fin = await state(s, cookie, id);
    assert.equal(fin.versions.length, 1); assert.equal(fin.turnsLeft, DAILY - 1);
    assert.equal(turnRow(dataDir).at(-1).status, 'done');
  } finally { await stop(s); }
});

test('PROC-4 a message that arrives while the server drains gets 503 restarting, and nothing is stored', { timeout: 30_000 }, async () => {
  const s = await boot();
  try {
    const { cookie, id } = await setup(s, 'RestartKid4');
    const body = JSON.stringify({ text: FOX });
    const res = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: s.port, method: 'POST', path: `/api/studio/${id}/chat`, headers: { ...H, cookie, 'content-length': Buffer.byteLength(body) } }, r => {
        let t = ''; r.on('data', d => { t += d; }); r.on('end', () => resolve({ status: r.statusCode, text: t }));
      });
      req.on('error', reject);
      req.write(body.slice(0, 5));                       // the request has started, so the server waits for it
      setTimeout(() => { s.child.kill('SIGTERM'); setTimeout(() => req.end(body.slice(5)), 400); }, 200);
    });
    assert.equal(res.status, 503); assert.equal(JSON.parse(res.text).error, 'Our server is restarting. Try again in a moment.');
    assert.equal(await s.exited, 0);
    assert.deepEqual(turnRow(s.dataDir), [], 'no build was stored');
  } finally { await stop(s); }
});
