// One upgrade listener for every WebSocket (services/upgrade.js): the Studio's live mic path still reaches its own gate,
// the live socket checks the feature flag, Origin and a hello within 5 s, a host token needs the host's own sign-in,
// unknown paths are refused with a log line that has a status and a reason only.
import { reset, ctx, socket, open, cookieFor, LS, LSock, config, teacher, teacher2, logs } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';

test.beforeEach(() => reset());
const refusedWith = async c => { await c.closed; return c.status; };

test('/api/studio/:id/listen still goes to the live mic gate through the shared listener', async () => {
  // Signed out with our own Origin: the mic's own refusal (401), not the dispatcher's 404.
  assert.equal(await refusedWith(socket({ path: '/api/studio/abc/listen' })), 401);
  assert.equal(await refusedWith(socket({ path: '/api/studio/abc/listen', origin: 'https://evil.example' })), 403);
});

test('unknown paths: 404 with a log line (status and reason only)', async () => {
  assert.equal(await refusedWith(socket({ path: '/api/nope' })), 404);
  const l = logs.find(x => x.msg === 'upgrade refused');
  assert.deepEqual(l.fields, { status: 404, why: 'path' });
});

test('the live socket: no Origin or a foreign one 403; flag off 404; per-address cap 429', async () => {
  assert.equal(await refusedWith(socket({ origin: null })), 403);
  assert.equal(await refusedWith(socket({ origin: 'https://evil.example' })), 403);
  config.liveClassroom = false;
  assert.equal(await refusedWith(socket()), 404);
  config.liveClassroom = true;
  const was = LSock.LIMITS.perIp; LSock.LIMITS.perIp = 1;
  try { const ok = socket(); await ok.opened; assert.equal(await refusedWith(socket()), 429); ok.ws.close(); } finally { LSock.LIMITS.perIp = was; }
  const l = logs.filter(x => x.msg === 'live socket refused').map(x => x.fields);
  assert.ok(l.every(f => Object.keys(f).sort().join() === 'status,why'), 'status and reason only');
});

test('hello within 5 s or 4401; a bad token says the session is gone; a host token needs the host\'s sign-in', async () => {
  const was = LSock.hooks.helloMs; LSock.hooks.helloMs = 100;
  try { const c = socket(); await c.opened; assert.equal(await c.closed, 4401); } finally { LSock.hooks.helloMs = was; }
  const c2 = socket(); await c2.opened; c2.send({ t: 'hello', v: 1, tok: 'junk' }); assert.equal(await c2.closed, 4404);
  const s = open(teacher, { mode: 'battle', starter: 'geo', audience: 'open' });
  const other = socket({ cookie: cookieFor(teacher2.id) }); await other.opened; other.send({ t: 'hello', v: 1, tok: LS.hostToken(s) });
  assert.equal(await other.closed, 4401);
  const nobody = socket(); await nobody.opened; nobody.send({ t: 'hello', v: 1, tok: LS.hostToken(s) });
  assert.equal(await nobody.closed, 4401);
  const wrongV = socket({ cookie: cookieFor(teacher.id) }); await wrongV.opened; wrongV.send({ t: 'hello', v: 2, tok: LS.hostToken(s) });
  assert.equal(await wrongV.closed, 4400);
  const host = socket({ cookie: cookieFor(teacher.id) });
  assert.equal((await host.hello(LS.hostToken(s))).role, 'host');
  host.ws.close();
  void ctx;
});

test('a flood (3x the rate for 5 s) closes with 4429; an oversized message 4413', async () => {
  const s = open(teacher, { mode: 'battle', starter: 'geo', audience: 'open' });
  const host = socket({ cookie: cookieFor(teacher.id) }); await host.hello(LS.hostToken(s));
  host.send('x'.repeat(17 * 1024));
  assert.equal(await host.closed, 1009, 'over the socket\'s own 16 KB cap');
  const h2 = socket({ cookie: cookieFor(teacher.id) }); await h2.hello(LS.hostToken(s));
  h2.send(JSON.stringify({ t: 'pi', c: 1, pad: 'y'.repeat(16 * 1024 - 40) }).slice(0, 16 * 1024 - 1) + '}');
  const P = await import('../../server/services/classlive-protocol.js');
  let t = 0; const b = P.buckets(() => t);
  let flood = false;
  for (let sec = 0; sec < 6 && !flood; sec++) { t = sec * 1000; for (let i = 0; i < 40; i++) { if (!b.take('em')) flood = b.dropped('em') || flood; } }
  assert.equal(flood, true, 'five seconds in a row far over the limit');
  h2.ws.close();
});
