// Hosting readiness: /health, graceful shutdown, PUBLIC_URL (login cards, same-origin checks), the TRUST_PROXY warning,
// SESSION_SECRET rules, BRB_JOURNAL_MODE, compressed bodies, maintenance and moved modes.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-deploy-test-'));
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = path.join(TMP, 'data');
delete process.env.TRUST_PROXY;
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '../..');
const { config } = await import('../../server/config.js');
const { createApp, _proxyWarning } = await import('../../server/app.js');
const health = await import('../../server/services/health.js');
const { makeShutdown } = await import('../../server/shutdown.js');
const { createUser, startSession } = await import('../../server/auth.js');
const { sameOrigin } = await import('../../server/i18n/index.js');
const S = await import('../../server/services/schools.js');
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** Raw HTTP so the test can set Host (fetch can't). */
function request(port, { method = 'GET', path: p = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', d => { text += d; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* html */ } resolve({ status: res.statusCode, headers: res.headers, text, json }); });
    });
    r.on('error', reject); if (body) r.write(body); r.end();
  });
}
async function withApp(fn) {
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  try { return await fn(server.address().port); } finally { server.close(); }
}
/** Collect log lines written while fn runs (log() is silent under BRB_SILENT). */
async function captureLogs(fn) {
  const lines = []; const write = process.stdout.write; const silent = process.env.BRB_SILENT;
  delete process.env.BRB_SILENT;
  process.stdout.write = (chunk, ...rest) => { const s = String(chunk); if (s.startsWith('{"t":')) { lines.push(JSON.parse(s)); return true; } return write.call(process.stdout, chunk, ...rest); };
  try { await fn(); } finally { process.stdout.write = write; process.env.BRB_SILENT = silent; }
  return lines;
}
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

// ---------------------------------------------------------------------------------------------------- /health
const leftovers = dir => fs.readdirSync(dir).filter(f => f.startsWith('.health-check'));
test('/health: database and disk answer -> 200; a broken disk -> 503; draining -> 503', async () => {
  await withApp(async port => {
    let r = await request(port, { path: '/health' });
    assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.equal(r.json.db, 'ok'); assert.equal(r.json.disk, 'ok');
    assert.equal(r.headers['cache-control'], 'no-store'); assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.deepEqual(leftovers(config.dataDir), [], 'the test file is deleted again');

    const dir = config.dataDir;
    config.dataDir = path.join(TMP, 'no-such-folder');
    r = await request(port, { path: '/health' });
    assert.equal(r.status, 503); assert.equal(r.json.disk, 'error'); assert.equal(r.json.db, 'ok');
    config.dataDir = dir;
    assert.equal((await request(port, { path: '/health' })).status, 200, 'back to healthy');

    health.lifecycle.draining = true;
    try {
      r = await request(port, { path: '/health' });
      assert.equal(r.status, 503); assert.equal(r.json.draining, true);
      assert.equal(r.headers.connection, 'close', 'while draining, connections close after the response');
    } finally { health.lifecycle.draining = false; }
  });
});

test('/health: a full disk -> 503, seen both by free space and by a new file that cannot be written', async () => {
  const io = { ...health._io };
  try {
    // Free space below the floor (statfs).
    health._io.statfs = async () => ({ bsize: 4096, blocks: 262144, bavail: 10 });   // 1 GB disk, 40 KB free
    let r = await health.check({ cacheMs: 0 });
    assert.equal(r.ok, false); assert.equal(r.disk, 'error');
    health._io.statfs = io.statfs;
    // statfs looks fine but the write fails (quota, reserved blocks): each probe writes a NEW file, then deletes it.
    const names = [];
    health._io.writeFile = async f => { names.push(path.basename(f)); await io.writeFile(f, ''); throw Object.assign(new Error('no space'), { code: 'ENOSPC' }); };
    r = await health.check({ cacheMs: 0 });
    assert.equal(r.disk, 'error');
    await health.check({ cacheMs: 0 });
    assert.equal(names.length, 2); assert.notEqual(names[0], names[1], 'a different file every time');
    assert.deepEqual(leftovers(config.dataDir), [], 'a half-written test file is deleted too');
  } finally { Object.assign(health._io, io); }
  assert.equal((await health.check({ cacheMs: 0 })).ok, true);
  assert.equal(health.minFreeBytes(1e12), 100 * 1048576, '100 MB on a big disk');
  assert.equal(health.minFreeBytes(1e9), 2e7, '2 % on a small one');
});

test('/health: the database file deleted or replaced under the running app -> 503', async () => {
  const saved = { ...health._dbFile }; const f = path.join(TMP, 'fake.db');
  fs.writeFileSync(f, 'x');
  Object.assign(health._dbFile, { path: f, ino: fs.statSync(f).ino });
  try {
    assert.equal((await health.check({ cacheMs: 0 })).ok, true);
    fs.writeFileSync(path.join(TMP, 'other.db'), 'y'); fs.renameSync(path.join(TMP, 'other.db'), f);   // a new file in its place
    let r = await health.check({ cacheMs: 0 });
    assert.equal(r.ok, false); assert.equal(r.db, 'error');
    fs.rmSync(f);
    r = await health.check({ cacheMs: 0 });
    assert.equal(r.db, 'error');
  } finally { Object.assign(health._dbFile, saved); }
});

test('/health: one file-system check at a time, cached for 2 s, with a time limit for a disk that hangs', async () => {
  const io = { ...health._io }; let writes = 0;
  health._io.writeFile = async (f, d) => { writes++; return io.writeFile(f, d); };
  try {
    const dir = config.dataDir; config.dataDir = fs.mkdtempSync(path.join(TMP, 'cache-'));   // a new folder: nothing cached
    try {
      await Promise.all([health.check(), health.check(), health.check()]);
      await health.check(); await health.check();
      assert.equal(writes, 1, 'five probes in a row, one write');
    } finally { config.dataDir = dir; }
    let release;
    health._io.writeFile = () => new Promise(r => { release = r; });                         // a disk that doesn't answer
    config.dataDir = fs.mkdtempSync(path.join(TMP, 'hung-'));
    try {
      const t0 = Date.now();
      const [a, b] = await Promise.all([health.check({ limitMs: 300 }), health.check({ limitMs: 300 })]);
      assert.equal(a.disk, 'timeout'); assert.equal(a.ok, false); assert.equal(b.disk, 'timeout');
      assert.ok(Date.now() - t0 < 2000, 'answers within the limit');
      assert.equal((await health.check({ limitMs: 100 })).disk, 'timeout', 'still stuck: no second write is started');
    } finally { release(); await new Promise(r => setTimeout(r, 20)); config.dataDir = dir; }
  } finally { Object.assign(health._io, io); }
});

test('/health is not written to the request log; other requests are', async () => {
  config.logRequests = true;
  const lines = await captureLogs(() => withApp(async port => { await request(port, { path: '/health' }); await request(port, { path: '/about' }); await new Promise(r => setTimeout(r, 50)); }));
  config.logRequests = false;
  const paths = lines.filter(l => l.msg === 'request').map(l => l.path);
  assert.ok(!paths.includes('/health'), JSON.stringify(paths)); assert.ok(paths.includes('/about'));
});

// ---------------------------------------------------------------------------------------------------- TRUST_PROXY
test('TRUST_PROXY off + X-Forwarded-For arriving: one warning per process; TRUST_PROXY set: none', async () => {
  _proxyWarning.xff = false;
  let lines = await captureLogs(() => withApp(async port => {
    await request(port, { path: '/health', headers: { 'x-forwarded-for': '1.2.3.4' } });   // health is before the check
    await request(port, { path: '/about' });
    await request(port, { path: '/about', headers: { 'x-forwarded-for': '1.2.3.4' } });
    await request(port, { path: '/about', headers: { 'x-forwarded-for': '5.6.7.8' } });
  }));
  assert.equal(lines.filter(l => /TRUST_PROXY is off/.test(l.msg)).length, 1);
  _proxyWarning.xff = false; process.env.TRUST_PROXY = '1';
  lines = await captureLogs(() => withApp(port => request(port, { path: '/about', headers: { 'x-forwarded-for': '1.2.3.4' } })));
  delete process.env.TRUST_PROXY;
  assert.equal(lines.filter(l => /TRUST_PROXY/.test(l.msg)).length, 0);
});

// ---------------------------------------------------------------------------------------------------- PUBLIC_URL
test('same-origin checks: PUBLIC_URL behind a Host-rewriting proxy; unset keeps the Host comparison', async () => {
  const internal = { host: 'app.internal:3000' };
  const post = (port, origin) => request(port, { method: 'POST', path: '/api/auth/login', headers: { ...internal, origin, 'content-type': 'application/json' }, body: '{"username":"nobody","password":"x"}' });
  await withApp(async port => {
    // Unset: an Origin that differs from Host is cross-site (today's behaviour).
    assert.equal((await post(port, 'https://play.example.com')).status, 403);
    assert.notEqual((await post(port, 'http://app.internal:3000')).status, 403);
    config.publicUrl = 'https://play.example.com';
    try {
      assert.notEqual((await post(port, 'https://play.example.com')).status, 403, 'the public origin is ours');
      assert.equal((await post(port, 'https://evil.example')).status, 403);
      assert.equal((await post(port, 'http://play.example.com')).status, 403, 'scheme matters for PUBLIC_URL');
      assert.notEqual((await post(port, 'http://app.internal:3000')).status, 403, 'the Host comparison still works');
    } finally { config.publicUrl = ''; }
  });
  // The ?lang= / ?theme= helper uses the same rule.
  const req = origin => ({ headers: { ...internal, origin } });
  assert.equal(sameOrigin(req('https://play.example.com')), false);
  config.publicUrl = 'https://play.example.com';
  try { assert.equal(sameOrigin(req('https://play.example.com')), true); assert.equal(sameOrigin(req('https://evil.example')), false); } finally { config.publicUrl = ''; }
});

test('login cards print PUBLIC_URL\'s host (www. dropped); unset, the Host header', async () => {
  const boss = createUser({ username: 'DeployBoss', password: 'secret123', role: 'admin' });
  const school = S.createSchool(boss, { name: 'Deploy Test School' }).school;
  const teacher = S.createSchoolAccount(boss, school.id, { rosterName: 'Ms Deploy', role: 'teacher' }).user;
  const cls = S.createClass(teacher, school.id, { name: 'Deploy Class', grade: '4' }).class;
  const cookie = cookieFor(teacher.id);
  const cards = async (port, name) => {
    const r = await request(port, { method: 'POST', path: `/api/classes/${cls.id}/students`, headers: { cookie, host: 'app.internal:3000', 'content-type': 'application/json' }, body: JSON.stringify({ names: name, grade: '4' }) });
    assert.equal(r.status, 200, r.text);
    const page = await request(port, { path: r.json.redirect, headers: { cookie, host: 'app.internal:3000' } });
    return (page.text.match(/<dd dir="ltr">([^<]*\/login)<\/dd>/) || [])[1];
  };
  await withApp(async port => {
    assert.equal(await cards(port, 'Card Kid'), 'app.internal:3000/login');
    config.publicUrl = 'https://www.play.example.com';
    try { assert.equal(await cards(port, 'Card Kidtwo'), 'play.example.com/login'); } finally { config.publicUrl = ''; }
  });
});

test('PUBLIC_URL / MOVED_TO_URL parsing: origins only, junk is an error that never echoes credentials', async () => {
  const { parsePublicUrl } = await import('../../server/config.js');
  assert.deepEqual(parsePublicUrl(''), { url: '' });
  assert.equal(parsePublicUrl('https://play.example.com/').url, 'https://play.example.com');
  assert.equal(parsePublicUrl('http://localhost:3000').url, 'http://localhost:3000');
  for (const bad of ['play.example.com', 'ftp://x.example', 'https://x.example/sub/path', 'https://u:p@x.example']) assert.ok(parsePublicUrl(bad).error, bad);
  assert.match(parsePublicUrl('nope', 'MOVED_TO_URL').error, /MOVED_TO_URL/);
  const e = parsePublicUrl('https://deploy:hunter2@play.example.com/x?token=abc').error;
  assert.ok(!/deploy|hunter2|token|abc/.test(e), e); assert.match(e, /play\.example\.com/);
  assert.ok(!/s3cr3t/.test(parsePublicUrl('s3cr3t not a url').error), 'junk is not echoed');
});

test('on/off settings: 1/true/yes/on and 0/false/no/off; anything else is an error (value not echoed)', async () => {
  const { parseFlag } = await import('../../server/config.js');
  for (const v of ['1', 'true', 'TRUE', 'yes', 'on', ' On ']) assert.deepEqual(parseFlag(v, 'X'), { on: true }, v);
  for (const v of ['0', 'false', 'no', 'off']) assert.deepEqual(parseFlag(v, 'X', true), { on: false }, v);
  assert.deepEqual(parseFlag(undefined, 'X'), { on: false }); assert.deepEqual(parseFlag('', 'X', true), { on: true });
  const bad = parseFlag('sekrit-value', 'REQUIRE_SESSION_SECRET');
  assert.equal(bad.on, false); assert.match(bad.error, /REQUIRE_SESSION_SECRET/); assert.ok(!bad.error.includes('sekrit'));
});

// ---------------------------------------------------------------------------------------------------- bodies, moving day
test('compressed request bodies are refused (415), plain ones work', async () => {
  await withApp(async port => {
    const body = zlib.gzipSync('{"username":"nobody","password":"x"}');
    const r = await request(port, { method: 'POST', path: '/api/auth/login', headers: { 'content-type': 'application/json', 'content-encoding': 'gzip', 'content-length': body.length }, body });
    assert.equal(r.status, 415);
    assert.notEqual((await request(port, { method: 'POST', path: '/api/auth/login', headers: { 'content-type': 'application/json' }, body: '{"username":"nobody","password":"x"}' })).status, 415);
  });
});

test('MAINTENANCE_MODE answers 503 "back soon" (health still 200); MOVED_TO_URL redirects every page', async () => {
  config.maintenance = true;
  try {
    await withApp(async port => {
      let r = await request(port, { path: '/' });
      assert.equal(r.status, 503); assert.equal(r.headers['retry-after'], '300'); assert.match(r.text, /moving to a new home/);
      r = await request(port, { method: 'POST', path: '/api/auth/login', headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.equal(r.status, 503); assert.ok(r.json.error);
      assert.equal((await request(port, { path: '/health' })).status, 200);
    });
  } finally { config.maintenance = false; }
  config.movedTo = 'https://play.example.com';
  const old = { host: 'magic-cup.onrender.com' };
  try {
    await withApp(async port => {
      let r = await request(port, { path: '/g/shark-plank?x=1', headers: old });
      assert.equal(r.status, 302, 'temporary at first'); assert.equal(r.headers.location, 'https://play.example.com/g/shark-plank?x=1');
      r = await request(port, { path: '//evil.example/x', headers: old });
      assert.equal(r.headers.location, 'https://play.example.com//evil.example/x', 'always the new host');
      for (const raw of ['http://evil.example/a', '*']) {
        r = await request(port, { path: raw, headers: old });
        assert.equal(r.headers.location, 'https://play.example.com/', `${raw}: not a path, so the home page`);
      }
      assert.equal((await request(port, { method: 'POST', path: '/api/x', headers: old })).status, 307);
      assert.equal((await request(port, { path: '/health', headers: old })).status, 200);
      // DNS for the new name still pointing at the old host: the "moving" page, never a redirect to itself.
      for (const host of ['play.example.com', 'PLAY.example.com:443', 'play.example.com.']) {
        r = await request(port, { path: '/g/shark-plank', headers: { host } });
        assert.equal(r.status, 503, host); assert.equal(r.headers.location, undefined); assert.match(r.text, /moving to a new home/);
      }
      config.movedPermanently = true;
      assert.equal((await request(port, { path: '/', headers: old })).status, 301, 'MOVED_PERMANENTLY=1');
      assert.equal((await request(port, { method: 'POST', path: '/api/x', headers: old })).status, 308);
    });
  } finally { config.movedTo = ''; config.movedPermanently = false; }
});

// ---------------------------------------------------------------------------------------------------- shutdown (unit)
function fakeServer() {
  const s = { closed: false, idleClosed: 0, allClosed: false, cb: null };
  s.close = cb => { s.closed = true; s.cb = cb; };
  s.closeIdleConnections = () => { s.idleClosed++; };
  s.closeAllConnections = () => { s.allClosed = true; };
  return s;
}
test('shutdown waits for open requests and Builder turns, then closes and exits 0', async () => {
  const server = fakeServer(); let turns = 1; const events = [];
  const done = new Promise(resolve => {
    const shutdown = makeShutdown({ server, graceMs: 5000, tickMs: 10, busy: () => turns, log: () => {}, stop: () => events.push('stop'), close: () => events.push('close'), exit: code => { events.push(`exit ${code}`); resolve(); } });
    shutdown('SIGTERM'); shutdown('SIGTERM');   // a repeat is ignored
  });
  assert.equal(health.lifecycle.draining, true); assert.equal(server.closed, true);
  await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(events, ['stop'], 'still waiting: requests open, a turn running');
  server.cb();                                   // the last request finished
  await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(events, ['stop'], 'still waiting for the Builder turn');
  turns = 0;
  await done;
  assert.deepEqual(events, ['stop', 'close', 'exit 0']);
  assert.ok(server.idleClosed > 0, 'idle keep-alive connections were closed');
  health.lifecycle.draining = false;
});
test('shutdown gives up after the grace period (exit 1); a second Ctrl+C exits at once', async () => {
  let server = fakeServer(); const logs = [];
  const code = await new Promise(resolve => makeShutdown({ server, graceMs: 120, tickMs: 10, busy: () => 1, log: (l, m) => logs.push(m), exit: resolve })('SIGTERM'));
  assert.equal(code, 1); assert.ok(server.allClosed); assert.ok(logs.some(m => /grace period over/.test(m)));
  server = fakeServer(); const codes = [];
  const shutdown = makeShutdown({ server, graceMs: 60_000, tickMs: 10_000, log: () => {}, exit: c => codes.push(c) });
  shutdown('SIGINT'); shutdown('SIGINT');
  assert.deepEqual(codes, [1]);
  health.lifecycle.draining = false;
});

// ---------------------------------------------------------------------------------------------------- real processes
/** Start node server/index.js with env; resolves { child, port, out(), exited } once it listens (or exits). */
async function startServer(env = {}, { wait = true } = {}) {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(TMP, 'srv-'));
  const childEnv = { PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(port), BRB_DATA_DIR: dataDir, BRB_SNAPSHOTS: '0', LOG_REQUESTS: '0', BRB_MOCK_DELAY_MS: '0', ...env };
  const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  const exited = new Promise(r => child.on('exit', code => r(code)));
  if (wait) {
    const t0 = Date.now();
    while (!/"listening"/.test(out)) {
      if (child.exitCode !== null || Date.now() - t0 > 15000) break;
      await new Promise(r => setTimeout(r, 50));
    }
  }
  return { child, port, dataDir, out: () => out, exited };
}
const lines = text => text.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));

test('index.js: SIGTERM lets a running Builder turn finish its stream, refuses new connections, then exits 0', async () => {
  const s = await startServer({ BRB_MOCK_DELAY_MS: '700' });
  const base = `http://127.0.0.1:${s.port}`;
  const h = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
  let r = await fetch(base + '/api/auth/signup', { method: 'POST', headers: h, body: JSON.stringify({ username: 'ShutdownKid', password: 'secret12' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  assert.match(r.headers.get('keep-alive') || '', /timeout=65/, 'keep-alive outlasts a load balancer\'s 60 s idle timeout');
  const { id } = await (await fetch(base + '/api/studio/new', { method: 'POST', headers: { ...h, cookie }, body: '{}' })).json();
  const res = await fetch(base + `/api/studio/${id}/chat`, { method: 'POST', headers: { ...h, cookie }, body: JSON.stringify({ text: 'make a racing game' }) });
  assert.equal(res.headers.get('x-accel-buffering'), 'no');
  const reader = res.body.getReader(); const dec = new TextDecoder(); let text = '';
  text += dec.decode((await reader.read()).value);           // the turn has started
  s.child.kill('SIGTERM');
  await new Promise(r2 => setTimeout(r2, 300));
  await assert.rejects(fetch(base + '/health'), 'no new connections while draining');
  for (;;) { const { value, done } = await reader.read(); if (done) break; text += dec.decode(value); }
  assert.match(text, /event: done/, 'the stream finished');
  assert.equal(await s.exited, 0);
  const log = lines(s.out());
  const sd = log.find(l => l.msg === 'shutdown'); assert.equal(sd.builderTurns, 1);
  assert.equal(log.find(l => l.msg === 'stopped').code, 0);
});

test('index.js: SESSION_SECRET warning in production, REQUIRE_SESSION_SECRET refuses to start, bad settings stop the start', async () => {
  let s = await startServer({ NODE_ENV: 'production' });
  assert.ok(lines(s.out()).some(l => l.level === 'warn' && /SESSION_SECRET is not set/.test(l.msg)));
  s.child.kill('SIGTERM'); await s.exited;

  s = await startServer({ NODE_ENV: 'production', SESSION_SECRET: 'a-test-secret' });
  assert.ok(!/SESSION_SECRET is not set/.test(s.out()));
  assert.equal(lines(s.out()).find(l => l.msg === 'listening').sessionSecret, 'env');
  s.child.kill('SIGTERM'); await s.exited;

  s = await startServer({ REQUIRE_SESSION_SECRET: 'true' }, { wait: false });
  assert.equal(await s.exited, 1, '"true" counts as on');
  assert.match(s.out(), /REQUIRE_SESSION_SECRET=1: refusing to start/);
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(path.join(s.dataDir, 'brb.db'), { readonly: true });
  assert.equal(db.prepare("SELECT value FROM settings WHERE key='session_secret'").get(), undefined, 'no fallback secret was made');
  db.close();

  for (const [k, v] of [['PUBLIC_URL', 'play.example.com'], ['BRB_JOURNAL_MODE', 'off'], ['REQUIRE_SESSION_SECRET', 'maybe'], ['MAINTENANCE_MODE', 'please']]) {
    s = await startServer({ [k]: v }, { wait: false });
    assert.equal(await s.exited, 1, k); assert.match(s.out(), new RegExp(k));
  }
  s = await startServer({ REQUIRE_SESSION_SECRET: '1', SESSION_SECRET: 'changeme' }, { wait: false });
  assert.equal(await s.exited, 1, 'a short secret is refused when required'); assert.match(s.out(), /shorter than 32/); assert.ok(!s.out().includes('changeme'));
  s = await startServer({ NODE_ENV: 'production', SESSION_SECRET: 'changeme' });
  assert.ok(lines(s.out()).some(l => l.level === 'warn' && /shorter than 32/.test(l.msg)), 'not required: a warning only');
  s.child.kill('SIGTERM'); await s.exited;
});

test('BRB_JOURNAL_MODE: WAL by default, DELETE for network file systems', async () => {
  for (const [mode, want] of [[undefined, 'wal'], ['DELETE', 'delete'], ['delete', 'delete']]) {
    const s = await startServer(mode ? { BRB_JOURNAL_MODE: mode } : {});
    assert.equal(lines(s.out()).find(l => l.msg === 'listening').journalMode, want);
    s.child.kill('SIGTERM'); await s.exited;
    assert.equal(fs.existsSync(path.join(s.dataDir, 'brb.db-wal')), false, 'the WAL is checkpointed away on a clean stop');
  }
});

test('scripts/export-session-secret.js: writes the secret to a 600 file and never prints it', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'secret-'));
  const s = await startServer({ BRB_DATA_DIR: dir });   // the first start stores a secret in the database
  s.child.kill('SIGTERM'); await s.exited;
  const run = (args, env = {}) => { try { return { code: 0, out: execFileSync(process.execPath, ['scripts/export-session-secret.js', ...args], { cwd: ROOT, env: { PATH: process.env.PATH, BRB_DATA_DIR: dir, ...env }, encoding: 'utf8', stdio: 'pipe' }) }; } catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; } };
  const file = path.join(dir, 'out', 'secret.txt'); fs.mkdirSync(path.dirname(file));
  let r = run([file]);
  assert.equal(r.code, 0, r.out);
  const secret = fs.readFileSync(file, 'utf8').trim();
  assert.match(secret, /^[0-9a-f]{64}$/);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.ok(!r.out.includes(secret), 'not printed');
  assert.equal(run([file]).code, 1, 'an existing file is not overwritten');
  const envFile = path.join(dir, 'out', 'env.txt');
  r = run([envFile], { SESSION_SECRET: 'from-the-environment' });
  assert.equal(fs.readFileSync(envFile, 'utf8').trim(), 'from-the-environment'); assert.ok(!r.out.includes('from-the-environment'));
});

test('scripts/export-data.js: one 600 archive with a consistent database copy and the picture folders', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'export-'));
  const s = await startServer({ BRB_DATA_DIR: dir }); s.child.kill('SIGTERM'); await s.exited;
  fs.mkdirSync(path.join(dir, 'shots')); fs.writeFileSync(path.join(dir, 'shots', 'v1.jpg'), 'jpg');
  const out = path.join(TMP, 'export-out', 'data.tgz');
  const said = execFileSync(process.execPath, ['scripts/export-data.js', out], { cwd: ROOT, env: { PATH: process.env.PATH, BRB_DATA_DIR: dir, BRB_SILENT: '1' }, encoding: 'utf8' });
  assert.match(said, /sha256: [0-9a-f]{64}/);
  assert.equal(fs.statSync(out).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(out)).mode & 0o777, 0o700, 'the folder it made is private too');
  const list = execFileSync('tar', ['-tzf', out], { encoding: 'utf8' }).split('\n');
  assert.ok(list.includes('brb.db')); assert.ok(list.includes('shots/v1.jpg'));
  assert.ok(!fs.readdirSync(path.dirname(out)).some(f => f.startsWith('.stage-')), 'the staging folder is cleaned up');
});

test('scripts/upload-file.js: without the link on the command line it reads it from stdin', () => {
  const file = path.join(TMP, 'upload-me.txt'); fs.writeFileSync(file, 'x');
  let r;
  try { execFileSync(process.execPath, ['scripts/upload-file.js', file], { cwd: ROOT, input: 'http://not-https.example/x\n', encoding: 'utf8', stdio: 'pipe' }); r = { code: 0 }; }
  catch (e) { r = { code: e.status, err: String(e.stderr) }; }
  assert.equal(r.code, 2); assert.match(r.err, /must be an https:\/\/ URL/);
});

// ---------------------------------------------------------------------------------------------------- container start
// Needs what the image has: root, a "node" user (uid 1000) and setpriv. Elsewhere it is skipped (docs/status.md has the
// Docker run of the same check).
const canRunEntrypoint = (() => {
  if (process.getuid?.() !== 0) return false;
  try { return execFileSync('id', ['-u', 'node'], { encoding: 'utf8' }).trim() === '1000' && !!execFileSync('sh', ['-c', 'command -v setpriv'], { encoding: 'utf8' }); } catch { return false; }
})();
test('entrypoint.sh as root: fixes the data folder\'s owner but never follows a symbolic link', { skip: !canRunEntrypoint && 'needs root, a node user (uid 1000) and setpriv' }, () => {
  const base = fs.mkdtempSync(path.join(TMP, 'entry-')); fs.chmodSync(base, 0o755);
  const data = path.join(base, 'data'); fs.mkdirSync(path.join(data, 'uploads'), { recursive: true });
  const victim = path.join(base, 'victim'); fs.writeFileSync(victim, 'root only');
  fs.symlinkSync(victim, path.join(data, 'zz-link')); fs.symlinkSync(victim, path.join(data, '.zz-hidden'));
  // REQUIRE_SESSION_SECRET without a secret: the script stops right after switching user, before running anything.
  try { execFileSync('sh', [path.join(ROOT, 'scripts/entrypoint.sh')], { env: { PATH: process.env.PATH, BRB_DATA_DIR: data, REQUIRE_SESSION_SECRET: '1' }, stdio: 'pipe' }); } catch { /* exits 1 */ }
  assert.equal(fs.statSync(data).uid, 1000); assert.equal(fs.statSync(path.join(data, 'uploads')).uid, 1000);
  assert.equal(fs.statSync(victim).uid, 0, 'the link target keeps its owner');
});

test('tini runs as the app user, not root: the image starts with the entrypoint, which execs tini after the privilege drop', () => {
  // A root tini can't signal uid 1000 in a container without CAP_KILL (Render): it dies instead of passing SIGTERM on.
  const df = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  assert.match(df, /^ENTRYPOINT \["\/app\/scripts\/entrypoint\.sh"\]$/m);
  const ep = fs.readFileSync(path.join(ROOT, 'scripts/entrypoint.sh'), 'utf8');
  const drop = ep.indexOf('exec setpriv'), tini = ep.indexOf('exec /usr/bin/tini');
  assert.ok(drop > 0 && tini > drop, 'tini is exec\'d after setpriv drops to node');
  assert.match(ep, /if \[ "\$\$" = 1 \] && \[ -x \/usr\/bin\/tini \]; then exec \/usr\/bin\/tini -- "\$0" "\$@"; fi/);
});
