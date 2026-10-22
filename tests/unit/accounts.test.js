// New accounts are stored durably and securely. Runs the real server as a child process on a
// temp data dir, signs up over HTTP, restarts the server, and signs in again.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-accounts-'));
const PORT = 4500 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, BRB_DATA_DIR: DATA, BRB_DB: '', PORT: String(PORT), BRB_SILENT: '1', LOG_REQUESTS: '0' };

async function boot() {
  const child = spawn(process.execPath, ['server/index.js'], { env, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + '/health')).ok) return child; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
  child.kill(); throw new Error('server did not start');
}
const stop = child => new Promise(r => { child.once('exit', r); child.kill('SIGTERM'); });
const post = (url, body, cookie) => fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = res => (res.headers.getSetCookie().filter(c => c.startsWith('brb_session=') && !c.startsWith('brb_session=;')).pop() || '').split(';')[0];

test('sign up, restart the server, sign in again; password stored only as a bcrypt hash', async () => {
  let server = await boot();
  try {
    const name = 'Persisty' + 'abcdefgh'[Math.floor(Math.random() * 8)] + 'xyz';
    let r = await post('/api/auth/signup', { username: name, password: 'blue-otter-42' });
    assert.equal(r.status, 200, await r.clone().text());
    const setCookie = r.headers.getSetCookie().join('\n');
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Lax/);
    const c1 = cookieOf(r);
    assert.equal((await (await fetch(BASE + '/api/me', { headers: { Cookie: c1 } })).json()).user.username, name);

    await stop(server); server = await boot();

    // the old session still works after a restart (sessions are stored too)
    assert.equal((await (await fetch(BASE + '/api/me', { headers: { Cookie: c1 } })).json()).user.username, name);
    r = await post('/api/auth/login', { username: name.toLowerCase(), password: 'blue-otter-42' });
    assert.equal(r.status, 200, 'login is case-insensitive on the name');
    r = await post('/api/auth/login', { username: name, password: 'wrong-password' });
    assert.equal(r.status, 400);
    r = await post('/api/auth/login', { username: 'NoSuchUser', password: 'wrong-password' });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, "That name and password don't match.", 'same message for unknown names');

    const db = new Database(path.join(DATA, 'brb.db'), { readonly: true });
    const row = db.prepare('SELECT * FROM users WHERE username=?').get(name);
    db.close();
    assert.ok(row, 'user row stored on disk');
    assert.match(row.password_hash, /^\$2[aby]\$11\$/, 'bcrypt, cost 11');
    assert.ok(!JSON.stringify(row).includes('blue-otter-42'), 'no plaintext password anywhere in the row');
    assert.equal(row.is_guest, 0);
  } finally { await stop(server); }
});

test('signup rules: weak or name-based passwords, taken and unsafe names, cross-site posts', async () => {
  const server = await boot();
  try {
    const bad = async (body, field) => { const r = await post('/api/auth/signup', body); assert.equal(r.status, 400, JSON.stringify(body)); assert.equal((await r.json()).field, field); };
    await bad({ username: 'GoodNameOk', password: '123' }, 'password');
    await bad({ username: 'GoodNameOk', password: 'password' }, 'password');
    await bad({ username: 'GoodNameOk', password: 'aaaaaaaa' }, 'password');
    await bad({ username: 'GoodNameOk', password: 'goodnameok1' }, 'password');
    await bad({ username: 'x', password: 'blue-otter-42' }, 'username');
    await bad({ username: 'Phone5551234', password: 'blue-otter-42' }, 'username');
    assert.equal((await post('/api/auth/signup', { username: 'TakenName', password: 'blue-otter-42' })).status, 200);
    await bad({ username: 'takenname', password: 'blue-otter-42' }, 'username');
    const xs = await fetch(BASE + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, body: JSON.stringify({ username: 'CrossSite', password: 'blue-otter-42' }) });
    assert.equal(xs.status, 403, 'cross-site sign-up blocked');
  } finally { await stop(server); }
});

test('guest upgrade keeps the account but issues a new session id', async () => {
  const server = await boot();
  try {
    const g = await post('/api/auth/guest', {}); const gc = cookieOf(g);
    const r = await post('/api/auth/signup', { username: 'UpgradedKid', password: 'blue-otter-42' }, gc);
    assert.equal(r.status, 200);
    const nc = cookieOf(r);
    assert.ok(nc && nc !== gc, 'session rotated');
    assert.equal((await (await fetch(BASE + '/api/me', { headers: { Cookie: gc } })).json()).user, null, 'old guest session no longer works');
    const me = (await (await fetch(BASE + '/api/me', { headers: { Cookie: nc } })).json()).user;
    assert.equal(me.username, 'UpgradedKid'); assert.equal(me.isGuest, false);
  } finally { await stop(server); fs.rmSync(DATA, { recursive: true, force: true }); }
});
