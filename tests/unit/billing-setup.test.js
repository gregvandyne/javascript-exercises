// Paid plans, chunk 2: settings and guards around Stripe (docs/decisions.md "Paid plans", BP-11), the async-safe job
// runner, and the scan that keeps real-looking Stripe keys out of the repository. Keys here are short fakes: a real
// key has 20+ characters after its prefix, and the scan below would refuse this very file otherwise.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { parseStripe, STRIPE_API_VERSION } = await import('../../server/config.js');
const { startServer, lines, ROOT } = await import('./_proc.js');

const P = (env, nodeEnv) => parseStripe(env, nodeEnv);
const has = (list, re) => list.some(m => re.test(m));

test('STRIPE_API_KEY: unset is off; a restricted test key is test; sk_test_ warns; sk_live_ is refused; rk_live_ needs STRIPE_LIVE_OK', () => {
  assert.equal(P({}).mode, 'off'); assert.deepEqual(P({}).errors, []); assert.deepEqual(P({}).warnings, []);
  assert.equal(P({ STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake' }).mode, 'test');
  const skTest = P({ STRIPE_API_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake' });
  assert.equal(skTest.mode, 'test'); assert.ok(has(skTest.warnings, /restricted key/));
  const skLive = P({ STRIPE_API_KEY: 'sk_live_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake', STRIPE_LIVE_OK: '1' });
  assert.equal(skLive.mode, 'off'); assert.ok(has(skLive.errors, /sk_live_.*restricted key/), 'never a live secret key, even with STRIPE_LIVE_OK');
  const rkLive = P({ STRIPE_API_KEY: 'rk_live_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake' });
  assert.equal(rkLive.mode, 'off'); assert.ok(has(rkLive.errors, /STRIPE_LIVE_OK=1/));
  assert.equal(P({ STRIPE_API_KEY: 'rk_live_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake', STRIPE_LIVE_OK: '1' }).mode, 'live');
  assert.ok(has(P({ STRIPE_API_KEY: 'pk_test_fake' }).errors, /restricted key/), 'a publishable key is not an API key');
  assert.ok(has(P({ STRIPE_API_KEY: 'rk_test_fa ke' }).errors, /space/));
});

test('half-set: a key without the webhook secret (or the reverse) keeps billing off with a warning, not an error', () => {
  const a = P({ STRIPE_API_KEY: 'rk_test_fake' });
  assert.equal(a.mode, 'off'); assert.deepEqual(a.errors, []); assert.ok(has(a.warnings, /STRIPE_WEBHOOK_SECRET is not/));
  const b = P({ STRIPE_WEBHOOK_SECRET: 'whsec_fake' });
  assert.equal(b.mode, 'off'); assert.ok(has(b.warnings, /STRIPE_API_KEY is not/));
  assert.ok(has(P({ STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'nope' }).errors, /whsec_/));
  assert.ok(has(P({ STRIPE_WEBHOOK_SECRET_OLD: 'nope' }).errors, /STRIPE_WEBHOOK_SECRET_OLD/));
});

test('STRIPE_API_VERSION: defaults to the pinned version; must be basil or later; STRIPE_API_BASE is test-only', () => {
  assert.equal(P({}).apiVersion, STRIPE_API_VERSION);
  assert.equal(P({ STRIPE_API_VERSION: '2026-03-25.dahlia' }).errors.length, 0);
  assert.ok(has(P({ STRIPE_API_VERSION: '2024-06-20' }).errors, /look like/));
  assert.ok(has(P({ STRIPE_API_VERSION: '2025-02-24.acacia' }).errors, /basil or later/));
  assert.equal(P({ STRIPE_API_BASE: 'http://127.0.0.1:5962' }).apiBase, 'http://127.0.0.1:5962');
  assert.ok(has(P({ STRIPE_API_BASE: 'http://127.0.0.1:5962' }, 'production').errors, /can't be used in production/));
  assert.ok(has(P({ STRIPE_TAX: 'maybe' }).errors, /STRIPE_TAX must be 1 or 0/));
  assert.equal(P({ STRIPE_TAX: '1' }).tax, true);
});

test('no message ever contains the key or the secret', () => {
  const key = 'sk_live_' + 'abc'; const secret = 'whsec_' + 'zz y';
  const r = P({ STRIPE_API_KEY: key, STRIPE_WEBHOOK_SECRET: secret, STRIPE_WEBHOOK_SECRET_OLD: secret, STRIPE_LIVE_OK: 'perhaps' });
  const all = [...r.errors, ...r.warnings].join('\n');
  assert.ok(r.errors.length >= 3);
  assert.ok(!all.includes(key) && !all.includes(secret) && !all.includes('perhaps'));
});

test('start-up: an sk_live_ key stops the server with a message that never shows it; billing is logged off|test', async () => {
  const bad = await startServer({ STRIPE_API_KEY: 'sk_live_fakekey', STRIPE_WEBHOOK_SECRET: 'whsec_fakesecret' }, { wait: false });
  assert.equal(await bad.exited, 1);
  assert.match(bad.out(), /restricted key/);
  assert.doesNotMatch(bad.out(), /sk_live_fakekey|whsec_fakesecret/);
  fs.rmSync(bad.dataDir, { recursive: true, force: true });

  const off = await startServer({});
  try { assert.equal(lines(off.out()).find(l => l.msg === 'listening').billing, 'off'); } finally { off.child.kill(); await off.exited; fs.rmSync(off.dataDir, { recursive: true, force: true }); }

  const half = await startServer({ STRIPE_API_KEY: 'sk_test_fakekey' });
  try {
    const ls = lines(half.out());
    assert.equal(ls.find(l => l.msg === 'listening').billing, 'off');
    assert.ok(ls.some(l => l.level === 'warn' && /use a restricted key/.test(l.msg)));
    assert.ok(ls.some(l => l.level === 'warn' && /Billing stays off/.test(l.msg)));
    assert.doesNotMatch(half.out(), /sk_test_fakekey/);
  } finally { half.child.kill(); await half.exited; fs.rmSync(half.dataDir, { recursive: true, force: true }); }

  const on = await startServer({ STRIPE_API_KEY: 'rk_test_fakekey', STRIPE_WEBHOOK_SECRET: 'whsec_fakesecret', STRIPE_API_BASE: 'http://127.0.0.1:9' });
  try {
    assert.equal(lines(on.out()).find(l => l.msg === 'listening').billing, 'test');
    const r = await fetch(`http://127.0.0.1:${on.port}/api/billing/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=00' }, body: '{}' });
    assert.equal(r.status, 400, 'the webhook answers, and refuses a bad signature');
    assert.doesNotMatch(on.out(), /rk_test_fakekey|whsec_fakesecret/);
  } finally { on.child.kill(); await on.exited; fs.rmSync(on.dataDir, { recursive: true, force: true }); }
});

test('jobs: a job that rejects or throws is logged and the process stays up; a slow run never overlaps the next', async () => {
  const { register, runJob, job, startJobs } = await import('../../server/services/jobs.js');
  let runs = 0; let release; let concurrent = 0; let maxConcurrent = 0;
  register('t-reject', 5, async () => { throw new Error('async boom'); });
  register('t-throw', 5, () => { throw new Error('sync boom'); });
  register('t-slow', 5, async () => { runs++; concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent); await new Promise(r => { release = r; }); concurrent--; });
  let unhandled = 0; const onU = () => { unhandled++; }; process.on('unhandledRejection', onU);
  const silent = process.env.BRB_SILENT;
  const errs = []; const ew = process.stderr.write;
  process.stderr.write = function (c, ...r) { const s = String(c); if (s.startsWith('{"t":')) { errs.push(JSON.parse(s)); return true; } return ew.call(this, c, ...r); };
  const stop = startJobs();
  try {
    await new Promise(r => setTimeout(r, 80));
    assert.equal(unhandled, 0, 'no unhandled rejection (it would stop Node 22)');
    assert.ok(errs.some(e => e.msg === 'job failed' && e.job === 't-reject' && e.error === 'async boom'));
    assert.ok(errs.some(e => e.msg === 'job failed' && e.job === 't-throw'));
    assert.equal(runs, 1, 'the slow job is still on its first run: later turns were skipped');
    assert.equal(await runJob(job('t-slow')), false, 'running now is refused too');
    release(); await new Promise(r => setTimeout(r, 30));
    assert.ok(runs >= 2, 'once finished, the next turn runs'); assert.equal(maxConcurrent, 1);
  } finally { stop(); process.stderr.write = ew; process.env.BRB_SILENT = silent; process.off('unhandledRejection', onU); release?.(); }
});

test('key scan: real-looking keys and webhook secrets are found; short dummies pass; the repository is clean', async () => {
  const { findKeys, scan, KEY_RE } = await import('../../scripts/check-keys.js');
  const fakeLong = n => 'x'.repeat(n).replace(/x/g, (_, i) => 'aB3'[i % 3]);
  for (const prefix of ['sk_live_', 'rk_live_', 'sk_test_', 'rk_test_', 'whsec_']) {
    const hits = findKeys(`const k = "${prefix}${fakeLong(24)}";`);
    assert.equal(hits.length, 1, prefix); assert.equal(hits[0].line, 1);
    assert.ok(!JSON.stringify(hits).includes(fakeLong(24)), 'the key itself is never reported');
  }
  assert.deepEqual(findKeys('rk_test_fake sk_live_abc whsec_fake_now pk_live_' + fakeLong(30)), []);
  assert.ok(KEY_RE.flags.includes('g'));
  // The whole repository (every tracked file) has none.
  const prev = process.cwd(); process.chdir(ROOT);
  try { assert.deepEqual(scan(), []); } finally { process.chdir(prev); }
  // A file with one is refused by the CLI (the pre-commit hook runs it on staged files).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-'));
  const f = path.join(dir, 'leak.js'); fs.writeFileSync(f, `x\nconst key = 'rk_live_${fakeLong(30)}';\n`);
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-keys.js'), f], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /leak\.js:2: looks like a Stripe key/);
  assert.ok(!r.stderr.includes(fakeLong(30)));
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(fs.statSync(path.join(ROOT, 'scripts/hooks/pre-commit')).mode & 0o100, 'the hook is executable');
});
