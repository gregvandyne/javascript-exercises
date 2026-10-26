// Studio over HTTP: access rules, the SSE chat, the live stream (builds run on their own: sign-out, expiry and closed
// pages never stop them), lists and notes, uploads, publishing and updating a live game.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-http-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const games = await import('../../server/services/games.js');
const { loadChat } = await import('../../server/builder/chat.js');
const { q } = await import('../../server/db.js');

const server = createApp().listen(0);
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.closeAllConnections(); server.close(); });

function client() {
  let cookie = '';
  const c = async (path, { method = 'GET', body, headers = {}, raw = false } = {}) => {
    const h = { ...headers }; if (cookie) h.cookie = cookie;
    let payload = body;
    if (body !== undefined && !Buffer.isBuffer(body) && typeof body !== 'string') { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of sc) { const kv = c.split(';')[0]; if (kv.startsWith('brb_session=')) cookie = kv; }
    if (raw) return res;
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, headers: res.headers, text, json };
  };
  c.cookie = () => cookie;
  return c;
}
async function signup(name) { const c = client(); const r = await c('/api/auth/signup', { method: 'POST', body: { username: name, password: 'secret12' } }); assert.equal(r.status, 200, r.text); return c; }
function sse(text) { return text.split('\n\n').filter(Boolean).map(b => { const ev = (b.match(/^event: (.*)$/m) || [])[1]; const d = (b.match(/^data: (.*)$/m) || [])[1]; return ev && d ? [ev, JSON.parse(d)] : null; }).filter(Boolean); }
function png() {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('tEXt', Buffer.from('GPS\0lat=48.85837')), chunk('IDAT', zlib.deflateSync(Buffer.alloc(14, 90))), chunk('IEND', Buffer.alloc(0))]);
}

const owner = await signup('HttpOwner');
const stranger = await signup('HttpStranger');

// ---- Live streams and held builds.
const agent = await import('../../server/builder/agent.js');
const runner = await import('../../server/builder/runner.js');
const live = await import('../../server/builder/live.js');
const mock = await import('../../server/builder/mock.js');
const turns = await import('../../server/builder/turns.js');
const { tEn } = await import('../../server/i18n/index.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 4000, what = 'the condition') {
  const t0 = Date.now();
  while (!(await fn())) { if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(5); }
}
/** An SSE request read as it arrives: { status, json (when not a stream), events, of(name), names(), until(fn), ended, close() }. */
function stream(c, path, { method = 'GET', body } = {}) {
  const ac = new AbortController();
  const st = { status: 0, json: null, events: [], ended: false, of: n => st.events.filter(e => e[0] === n).map(e => e[1]), names: () => st.events.map(e => e[0]) };
  st.opened = (async () => {
    const headers = { cookie: c.cookie(), accept: 'text/event-stream', ...(body ? { 'content-type': 'application/json' } : {}) };
    let res; try { res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ac.signal }); } catch { st.ended = true; return; }
    st.status = res.status;
    if (!/event-stream/.test(res.headers.get('content-type') || '')) { st.json = await res.json().catch(() => null); st.ended = true; return; }
    st.done = (async () => {
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i; while ((i = buf.indexOf('\n\n')) >= 0) {
            const b = buf.slice(0, i); buf = buf.slice(i + 2);
            const ev = (b.match(/^event: (.*)$/m) || [])[1]; const d = (b.match(/^data: (.*)$/m) || [])[1];
            if (ev && d) st.events.push([ev, JSON.parse(d)]);
          }
        }
      } catch { /* aborted */ }
      st.ended = true;
    })();
  })();
  st.until = (fn, ms = 4000, what) => until(() => fn(st), ms, what || 'a stream event');
  st.close = () => ac.abort();
  return st;
}
const liveOf = (c, id) => stream(c, `/api/studio/${id}/live`);
/** Hold the Builder (the building blocks) mid-build: it says hello, then waits for open() or its stop, then (save)
 *  writes a version. -> { open, started, ctx } (restore() puts the real building blocks back). */
function holdBuilder({ save = true } = {}) {
  const g = { open: null, started: null, ctx: null };
  let openIt, startIt; g.open = new Promise(r => { openIt = r; }); g.open.resolve = openIt; g.started = new Promise(r => { startIt = r; });
  agent.registerProvider('mock', { run: async ctx => {
    g.ctx = ctx; ctx.steps.start('blocks'); ctx.emit('text', { text: 'Working on it. ' }); startIt();
    await Promise.race([g.open, new Promise(r => ctx.signal.addEventListener('abort', r, { once: true }))]);
    if (save && !ctx.signal.aborted) ctx.tools.exec('write_game', { html: '<title>T</title><canvas></canvas><script>let s = 1;</script>', notes: 'First version' });
    return { model: 'mock' };
  } });
  return g;
}
const realBuilder = () => agent.registerProvider('mock', mock);
const newGameFor = async c => (await c('/api/studio/new', { method: 'POST', body: {} })).json.id;
const build = (c, id, text = 'Make a catch game about a fox. Just build it.', extra = {}) => c(`/api/studio/${id}/chat`, { method: 'POST', body: { text, detach: true, ...extra } });
const idleGame = id => until(() => !runner.isBusy(id), 6000, 'the build to end');
async function login(c, username, password = 'secret12') { const r = await c('/api/auth/login', { method: 'POST', body: { username, password } }); assert.equal(r.status, 200, r.text); }
const pageData = html => JSON.parse(html.match(/<script type="application\/json" id="page-data">([\s\S]*?)<\/script>/)[1]);

test('/build needs a real account; guests and visitors go to sign up', async () => {
  const anon = client();
  let r = await anon('/build'); assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/signup?next=%2Fbuild');
  await anon('/api/auth/guest', { method: 'POST', body: {} });
  r = await anon('/build'); assert.equal(r.status, 302, 'guest redirected too');
  r = await anon('/api/studio/new', { method: 'POST', body: {} }); assert.equal(r.status, 403);
  r = await owner('/build'); assert.equal(r.status, 200); assert.match(r.text, /Start from/); assert.match(r.text, /data-template="quiz"/);
  assert.match(r.text, /aria-current="page"[^>]*>|navlink" href="\/build" aria-current/);
});

let gameId;
test('Start from a template: version 1 is the template; the Studio uses the player sandbox', async () => {
  const r = await owner('/api/studio/new', { method: 'POST', body: { template: 'catch' } });
  assert.equal(r.status, 200); gameId = r.json.id;
  const vs = games.listVersions(gameId); assert.equal(vs.length, 1); assert.equal(vs[0].safety_status, 'pass');
  const page = await owner(`/studio/${gameId}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /sandbox="allow-scripts allow-pointer-lock allow-orientation-lock"/);
  assert.doesNotMatch(page.text, /allow-same-origin/);
  assert.match(page.text, /<p class="sr-only" id="st-steps-live" aria-live="polite" aria-atomic="true"><\/p>/, 'the build steps announcer sits outside the chat log');
  const src = page.text.match(/src="(\/frame\/[^"]+)"/)[1];
  const frame = await owner(src);
  assert.equal(frame.status, 200); assert.match(frame.headers.get('content-security-policy'), /connect-src 'none'/);
  assert.match(frame.text, /"preview":true/); assert.match(frame.text, /"canSave":false/);
  const list = await owner('/build'); assert.match(list.text, /📝 Draft/);
});

test('strangers get 404 for every Studio page and API', async () => {
  for (const [m, p] of [['GET', `/studio/${gameId}`], ['GET', `/api/studio/${gameId}`], ['POST', `/api/studio/${gameId}/chat`], ['POST', `/api/studio/${gameId}/meta`], ['POST', `/api/studio/${gameId}/publish`], ['POST', `/api/studio/${gameId}/restore`]]) {
    const r = await stranger(p, { method: m, body: m === 'POST' ? { text: 'hi', visibility: 'public' } : undefined });
    assert.equal(r.status, 404, `${m} ${p}`);
  }
});

test('the Builder chat streams Server-Sent Events and makes a new version', async () => {
  const res = await owner(`/api/studio/${gameId}/chat`, { method: 'POST', body: { text: 'Make it harder' }, raw: true });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const events = sse(await res.text());
  const names = events.map(e => e[0]);
  assert.ok(names.includes('text') && names.includes('version') && names.includes('notes') && names.includes('ask'));
  assert.equal(names[names.length - 1], 'done');
  const v = events.find(e => e[0] === 'version')[1]; assert.equal(v.number, 2); assert.match(v.preview, /^\/frame\//);
  // Live build steps: real steps first, each before its card; no old progress events; done carries the record.
  assert.deepEqual(events[0], ['step', { i: 1, key: 'screen' }]);
  assert.deepEqual(events.filter(e => e[0] === 'step').map(e => e[1].key), ['screen', 'blocks', 'check', 'notes', 'ask']);
  assert.ok(names.indexOf('step') < names.indexOf('text'));
  assert.ok(!names.includes('progress'));
  const done = events.at(-1)[1];
  assert.equal(done.steps.p, 'blocks'); assert.deepEqual(done.steps.s.map(r => r[0]), ['screen', 'blocks', 'check', 'notes', 'ask']);
  const state = await owner(`/api/studio/${gameId}`);
  assert.deepEqual(state.json.chat.at(-1).events.at(-1), ['steps', done.steps], 'a reload gets the same record');
  const refused = sse(await (await owner(`/api/studio/${gameId}/chat`, { method: 'POST', body: { text: 'add a slot machine and loot boxes' }, raw: true })).text());
  assert.deepEqual(refused.map(e => e[0]), ['step', 'refused', 'done']);
  assert.equal(refused[0][1].key, 'screen'); assert.match(refused[1][1].message, /loot boxes/);
  assert.equal('steps' in refused[2][1], false, 'a refusal has no steps record');
});

test('HTTP-9/11: Restore and Save version wait while the Builder works (409); deleting the game stops its build; 503 while restarting', async () => {
  const agent = await import('../../server/builder/agent.js');
  const runner = await import('../../server/builder/runner.js');
  const r0 = await owner('/api/studio/new', { method: 'POST', body: { template: 'catch' } }); const id = r0.json.id;
  const v1 = (await owner(`/api/studio/${id}`)).json.versions[0];
  let release; const slow = new Promise(r => { release = r; }); const real = agent.hooks.screen;
  agent.hooks.screen = async (text, o) => { await slow; return real(text, o); };   // the build waits in screening
  try {
    const res = await owner(`/api/studio/${id}/chat`, { method: 'POST', body: { text: 'Make it harder' }, raw: true });
    assert.equal((await owner(`/api/studio/${id}`)).json.busy, true);
    let r = await owner(`/api/studio/${id}/restore`, { method: 'POST', body: { versionId: v1.id } });
    assert.equal(r.status, 409); assert.equal(r.json.error, 'The Builder is working on this game right now. Try again when it’s done.');
    r = await owner(`/api/studio/${id}/save`, { method: 'POST', body: { note: 'mine' } }); assert.equal(r.status, 409);
    r = await owner(`/api/studio/${id}/delete`, { method: 'POST', body: {} }); assert.equal(r.status, 200);
    release();
    const events = sse(await res.text()); const names = events.map(e => e[0]);
    assert.equal(names.at(-1), 'done'); assert.ok(names.includes('gone'), 'the stream hears the game is gone');
    for (const x of ['hello', 'caughtup', 'turn']) assert.ok(!names.includes(x), `the streamed POST has no ${x}`);
    const row = q.get('SELECT status, end_reason, charged_day FROM builder_turns WHERE game_id=?', id);
    assert.deepEqual([row.status, row.end_reason, row.charged_day], ['cancelled', 'deleted', null]);
    assert.equal(games.listVersions(id).length, 1, 'nothing more was built');
  } finally { agent.hooks.screen = real; }
  runner.life.draining = true;
  try {
    const r = await owner(`/api/studio/${gameId}/chat`, { method: 'POST', body: { text: 'Make it harder' } });
    assert.equal(r.status, 503); assert.equal(r.json.error, 'Our server is restarting. Try again in a moment.');
  } finally { runner.life.draining = false; }
});

test('HTTP-1 a detached POST starts the build at once (202); the live stream says hello, replays and streams it; previews load for the viewer', async () => {
  const id = await newGameFor(owner);
  const a = liveOf(owner, id); await a.opened;
  assert.equal(a.status, 200);
  await a.until(s => s.names().includes('caughtup'));
  assert.deepEqual(a.names(), ['hello', 'caughtup']); assert.equal(a.of('hello')[0].turn, null, 'nothing running yet');
  const gate = holdBuilder();
  try {
    const r = await build(owner, id, undefined, { cid: 'cid-http-0001' });
    assert.equal(r.status, 202, r.text); assert.equal(r.json.ok, true); assert.equal(r.json.turn.status, 'queued');
    const turnId = r.json.turn.id;
    await gate.started;
    // The same message sent again (its answer was lost) is the same build, not a second one.
    const again = await build(owner, id, undefined, { cid: 'cid-http-0001' });
    assert.equal(again.status, 202); assert.equal(again.json.turn.id, turnId);
    // A second tab joins mid-build: hello with the build (its saved message), the replay of what it did, caughtup.
    const b = liveOf(owner, id); await b.opened;
    await b.until(s => s.names().includes('caughtup'));
    const hello = b.of('hello')[0];
    assert.equal(hello.turn.id, turnId); assert.equal(hello.turn.mine, true); assert.equal(hello.turn.cid, 'cid-http-0001');
    assert.equal(hello.turn.entries[0].role, 'user'); assert.match(hello.turn.entries[0].text, /catch game about a fox/);
    assert.deepEqual(b.names().slice(0, 2), ['hello', 'step'], 'the replay comes right after hello');
    assert.ok(b.of('step').some(x => x.key === 'blocks' && typeof x.at === 'number'), 'replayed steps carry their times');
    assert.match(b.of('text').map(x => x.text).join(''), /Working on it/);
    gate.open.resolve();
    await a.until(s => s.names().includes('done')); await b.until(s => s.names().includes('done'));
    const names = a.names();
    assert.equal(names[2], 'turn'); assert.ok(names.indexOf('version') < names.indexOf('done'));
    const v = a.of('version')[0]; assert.match(v.preview, /^\/frame\//);
    assert.equal((await owner(v.preview)).status, 200, 'the preview loads for the owner');
    assert.equal(a.of('done')[0].end, 'ok'); assert.equal(typeof a.of('done')[0].turnsLeft, 'number');
    assert.equal(a.ended, false, 'the stream stays open between builds');
    b.close();
  } finally { realBuilder(); a.close(); }
  // Without detach the POST is still the old stream (pages loaded before the deploy).
  const res = await owner(`/api/studio/${id}/chat`, { method: 'POST', body: { text: 'Make it harder' }, raw: true });
  assert.match(res.headers.get('content-type'), /event-stream/);
  const names = sse(await res.text()).map(e => e[0]);
  assert.equal(names.at(-1), 'done'); for (const x of ['hello', 'caughtup', 'turn']) assert.ok(!names.includes(x));
});

test('HTTP-2 who may watch: a stranger gets 404, a guest 403, signed out 401; an admin watches with previews minted for the admin', async () => {
  const id = await newGameFor(owner);
  const st = liveOf(stranger, id); await st.opened; assert.equal(st.status, 404);
  const guest = client(); await guest('/api/auth/guest', { method: 'POST', body: {} });
  const gs = liveOf(guest, id); await gs.opened; assert.equal(gs.status, 403);
  const anon = liveOf(client(), id); await anon.opened; assert.equal(anon.status, 401);
  const admin = await signup('HttpAdmin2');
  q.run("UPDATE users SET role='admin' WHERE username='HttpAdmin2'");
  const w = liveOf(admin, id); await w.opened; assert.equal(w.status, 200);
  try {
    await build(owner, id);
    await w.until(s => s.names().includes('done'), 6000);
    assert.equal(w.of('turn')[0].mine, false, 'the admin did not start it');
    const v = w.of('version')[0];
    assert.equal((await admin(v.preview)).status, 200, 'the admin\'s preview loads for the admin');
    assert.equal((await owner(v.preview)).status, 403, 'and for nobody else');
  } finally { w.close(); }
  await idleGame(id);
});

test('HTTP-3 nobody watching (a closed tab, a locked phone): a detached build still finishes and is saved', async () => {
  const kid = await signup('HttpNoView');
  const id = await newGameFor(kid);
  const before = (await kid(`/api/studio/${id}`)).json.turnsLeft;
  const r = await build(kid, id); assert.equal(r.status, 202);
  await idleGame(id);
  const row = turns.lastEnded(id);
  assert.deepEqual([row.status, row.end_reason, row.versions], ['done', 'ok', 1]);
  const st = (await kid(`/api/studio/${id}`)).json;
  assert.deepEqual(st.chat.map(m => m.role), ['user', 'assistant']); assert.equal(st.versions.length, 1);
  assert.equal(st.turnsLeft, before - 1); assert.equal(st.turn, null); assert.equal(st.busy, false);
  assert.equal(st.lastTurn.id, row.id); assert.equal(st.lastTurn.end, 'ok');
});

test('HTTP-4 signing out mid-build closes that session\'s streams at once (live and the old streamed POST); the build finishes', async () => {
  const kid = await signup('HttpSignOut');
  const id = await newGameFor(kid), id2 = await newGameFor(kid);
  const gate = holdBuilder();
  const w = liveOf(kid, id); await w.opened;
  try {
    await build(kid, id); await gate.started;
    await w.until(s => s.names().includes('turn'));
    // The old streamed POST, in another game, from the same session.
    const gate2 = holdBuilder();
    const compat = stream(kid, `/api/studio/${id2}/chat`, { method: 'POST', body: { text: 'Make a robot runner game. Just build it.' } });
    await compat.opened; await compat.until(s => s.names().includes('step'));
    const t0 = Date.now();
    assert.equal((await kid('/api/auth/logout', { method: 'POST', body: {} })).status, 200);
    await w.until(s => s.ended, 500, 'the live stream to close'); await compat.until(s => s.ended, 500, 'the streamed POST to close');
    assert.ok(Date.now() - t0 < 500);
    assert.equal(w.names().at(-1), 'signedout'); assert.equal(compat.names().at(-1), 'signedout');
    assert.ok(!compat.names().includes('done'));
    gate.open.resolve(); gate2.open.resolve();
    await idleGame(id); await idleGame(id2);
  } finally { realBuilder(); w.close(); }
  assert.equal(turns.lastEnded(id).end_reason, 'ok'); assert.equal(turns.lastEnded(id2).end_reason, 'ok');
  assert.equal((await kid(`/api/studio/${id}`)).status, 401);
  await login(kid, 'HttpSignOut');
  const st = (await kid(`/api/studio/${id}`)).json;
  assert.equal(st.versions.length, 1); assert.equal(st.chat.at(-1).role, 'assistant');
  const again = liveOf(kid, id); await again.opened; await again.until(s => s.names().includes('caughtup'));
  assert.equal(again.of('hello')[0].turn, null); again.close();
});

test('HTTP-5 "sign out everywhere" from another device closes this device\'s stream; the build finishes', async () => {
  const one = await signup('HttpEvery');
  const two = client(); await login(two, 'HttpEvery');
  const id = await newGameFor(one);
  const gate = holdBuilder();
  const w = liveOf(one, id); await w.opened;
  try {
    await build(one, id); await gate.started;
    assert.equal((await two('/api/auth/logout-everywhere', { method: 'POST', body: {} })).status, 200);
    await w.until(s => s.ended, 500, 'the stream to close');
    assert.equal(w.names().at(-1), 'signedout');
    gate.open.resolve(); await idleGame(id);
  } finally { realBuilder(); w.close(); }
  await login(one, 'HttpEvery');
  assert.equal((await one(`/api/studio/${id}`)).json.versions.length, 1);
});

test('HTTP-6 a sign-in that ends on its own (expired, a school student idle for an hour, a ban) closes the stream at the next check', async () => {
  // Expired: the session row is gone.
  const a = await signup('HttpExpire');
  const ida = await newGameFor(a);
  const wa = liveOf(a, ida); await wa.opened; await wa.until(s => s.names().includes('caughtup'));
  q.run('DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE username=?)', 'HttpExpire');
  live._tick();
  await wa.until(s => s.ended, 500); assert.equal(wa.names().at(-1), 'signedout');
  // A school student idle for two hours (students: one hour), mid-build: the build still finishes.
  const b = await signup('HttpStudent');
  const idb = await newGameFor(b);
  const gate = holdBuilder();
  const wb = liveOf(b, idb); await wb.opened;
  try {
    await build(b, idb); await gate.started;
    q.run("UPDATE users SET managed_school='sch-test' WHERE username='HttpStudent'");
    live._tick(); assert.equal(wb.ended, false, 'still within the hour');
    q.run('UPDATE sessions SET last_active=? WHERE user_id=(SELECT id FROM users WHERE username=?)', Date.now() - 2 * 3600e3, 'HttpStudent');
    live._tick();
    await wb.until(s => s.ended, 500); assert.equal(wb.names().at(-1), 'signedout');
    gate.open.resolve(); await idleGame(idb);
    assert.equal(turns.lastEnded(idb).end_reason, 'ok');
  } finally { realBuilder(); wb.close(); }
  // A ban (moderation deletes the sessions with its own SQL): the stream ends at the next check, the build stops.
  const c = await signup('HttpBanned');
  const idc = await newGameFor(c);
  const gate3 = holdBuilder();
  const wc = liveOf(c, idc); await wc.opened;
  try {
    await build(c, idc); await gate3.started;
    const { banUser } = await import('../../server/services/moderation.js');
    banUser({ id: 'admin' }, q.get('SELECT id FROM users WHERE username=?', 'HttpBanned').id);
    live._tick();
    await wc.until(s => s.ended, 500); assert.equal(wc.names().at(-1), 'signedout');
    await gate3.ctx.between(2);   // the next round: the ban stops the build
    await idleGame(idc);
    assert.deepEqual([turns.lastEnded(idc).status, turns.lastEnded(idc).end_reason], ['cancelled', 'banned']);
  } finally { realBuilder(); wc.close(); }
});

test('HTTP-8 limits: at most 8 streams per game (liveBusy), and 40 connects a minute per builder', async () => {
  const kid = await signup('HttpLimits');
  const kidId = q.get('SELECT id FROM users WHERE username=?', 'HttpLimits').id;
  const id = await newGameFor(kid);
  const open = [];
  for (let i = 0; i < 8; i++) { const w = liveOf(kid, id); await w.opened; assert.equal(w.status, 200); open.push(w); }
  const ninth = liveOf(kid, id); await ninth.opened;
  assert.equal(ninth.status, 429); assert.equal(ninth.json.error, 'This game is open in too many tabs. Close some and try again.');
  for (const w of open) w.close();
  await until(() => live.counts(id, kidId).game === 0, 2000, 'the streams to close');
  let n = 9, last;
  for (;;) {
    last = liveOf(kid, id); await last.opened; n++;
    if (last.status !== 200) break;
    last.close(); await until(() => live.counts(id, kidId).game === 0, 2000);
    assert.ok(n < 60, 'never limited');
  }
  assert.equal(n, 41); assert.equal(last.status, 429);
});

test('HTTP-10 lists and the one-time note: Building… while it runs, then Ready and one note on the next page; opening the Studio clears it', async () => {
  const kid = await signup('HttpLists');
  const id = await newGameFor(kid);
  await kid(`/api/studio/${id}/meta`, { method: 'POST', body: { title: 'Fox Hop' } });
  const gate = holdBuilder();
  try {
    await build(kid, id); await gate.started;
    let r = await kid('/build'); assert.match(r.text, /🛠️ Building…/);
    r = await kid('/me'); assert.match(r.text, /<span class="metile-sub">1 game building<\/span>/);
    gate.open.resolve(); await idleGame(id);
  } finally { realBuilder(); }
  let r = await kid('/build');
  assert.match(r.text, /✨ Ready/); assert.doesNotMatch(r.text, /Building…/);
  assert.match(r.text, /class="notice good pagenote" role="status">✨ Your game “⁨Fox Hop⁩” is ready! <a href="\/studio\/[^"]+">Open it<\/a>/);
  r = await kid('/build'); assert.match(r.text, /✨ Ready/); assert.doesNotMatch(r.text, /is ready!/, 'the note shows once');
  r = await kid('/me'); assert.match(r.text, /1 game ready/);
  await kid(`/studio/${id}`);   // the owner opens the Studio: seen
  r = await kid('/build'); assert.doesNotMatch(r.text, /✨ Ready/);
  // An admin's build in the child's game: no note for the child.
  const admin = await signup('HttpAdmin10');
  q.run("UPDATE users SET role='admin' WHERE username='HttpAdmin10'");
  assert.equal((await build(admin, id, 'Make it harder')).status, 202);
  await idleGame(id);
  r = await kid('/me'); assert.doesNotMatch(r.text, /is ready!|has news/);
});

test('HTTP-11 deleting a game mid-build stops the build and tells its live streams', async () => {
  const kid = await signup('HttpDelete');
  const id = await newGameFor(kid);
  const gate = holdBuilder();
  const w = liveOf(kid, id); await w.opened;
  try {
    await build(kid, id); await gate.started;
    assert.equal((await kid(`/api/studio/${id}/delete`, { method: 'POST', body: {} })).status, 200);
    await w.until(s => s.ended, 1000); assert.equal(w.names().at(-1), 'gone');
    await idleGame(id);
    assert.deepEqual([turns.lastEnded(id).status, turns.lastEnded(id).end_reason], ['cancelled', 'deleted']);
    const again = liveOf(kid, id); await again.opened; assert.equal(again.status, 404);
  } finally { realBuilder(); w.close(); }
});

test('HTTP-12 the state mid-build (the page and the API) has the running build with the builder\'s message', async () => {
  const kid = await signup('HttpState');
  const id = await newGameFor(kid);
  const gate = holdBuilder();
  try {
    await build(kid, id, 'Make a jumping frog game. Just build it.'); await gate.started;
    const st = (await kid(`/api/studio/${id}`)).json;
    assert.equal(st.busy, true); assert.equal(st.turn.entries[0].text, 'Make a jumping frog game. Just build it.');
    assert.equal(st.turn.mine, true); assert.equal(st.turn.attempt, 1); assert.equal(st.turn.provider, 'blocks'); assert.ok(st.turn.elapsed >= 0);
    const pd = pageData((await kid(`/studio/${id}`)).text);
    assert.equal(pd.busy, true); assert.equal(pd.turn.entries[0].text, 'Make a jumping frog game. Just build it.');
    // A second message while it builds is a follow-up (HTTP-13 has the details).
    const r = await build(kid, id, 'make it harder');
    assert.equal(r.status, 200); assert.equal(r.json.followUp.status, 'waiting');
    gate.open.resolve(); await idleGame(id);
  } finally { realBuilder(); }
  const st = (await kid(`/api/studio/${id}`)).json;
  assert.equal(st.turn, null); assert.equal(st.busy, false); assert.equal(st.lastTurn.end, 'ok');
});

test('HTTP-13 follow-ups over HTTP: 200 with the follow-up, the live stream hears it, the transcript has it after a part; uploads, an admin and a 4th are refused; the old streamed POST still says busy', async () => {
  const kid = await signup('HttpFollow');
  const id = await newGameFor(kid);
  const gate = holdBuilder({ save: false });
  const w = liveOf(kid, id); await w.opened;
  try {
    await build(kid, id); await gate.started;
    const r = await build(kid, id, 'make it harder', { cid: 'http-fu-0001' });
    assert.equal(r.status, 200, r.text); assert.equal(r.json.followUp.status, 'waiting'); assert.equal(r.json.followUp.cid, 'http-fu-0001');
    assert.equal(r.json.left, 2); assert.equal(typeof r.json.turnsLeft, 'number');
    await w.until(s => s.of('inbox').length >= 1);
    const inbox = w.of('inbox')[0];
    assert.deepEqual([inbox.status, inbox.entry.text, inbox.entry.id, inbox.left], ['waiting', 'make it harder', r.json.followUp.id, 2]);
    const chat = (await kid(`/api/studio/${id}`)).json.chat;
    assert.deepEqual(chat.map(m => (m.followUp ? `fu:${m.status}` : m.part ? 'part' : m.role)), ['user', 'part', 'fu:waiting']);
    assert.equal(chat[1].text, 'Working on it.');
    const up = (await kid(`/api/studio/${id}/uploads?name=notes.txt`, { method: 'POST', body: Buffer.from('a fox who hops'), headers: { 'content-type': 'application/octet-stream' } })).json.upload;
    const withUp = await build(kid, id, 'use my notes', { uploads: [up.id] });
    assert.deepEqual([withUp.status, withUp.json.code], [409, 'uploads']);
    assert.equal(q.get('SELECT used_at FROM builder_uploads WHERE id=?', up.id).used_at, null, 'the upload stays unused');
    const admin = await signup('HttpFuAdmin'); q.run("UPDATE users SET role='admin' WHERE username='HttpFuAdmin'");
    const a = await build(admin, id, 'make it blue');
    assert.deepEqual([a.status, a.json.code], [409, 'notYours']);
    for (const text of ['make it red', 'add a second level']) assert.equal((await build(kid, id, text)).status, 200);
    const cap = await build(kid, id, 'one more');
    assert.deepEqual([cap.status, cap.json.code], [429, 'cap']);
    const old = stream(kid, `/api/studio/${id}/chat`, { method: 'POST', body: { text: 'make it purple' } });
    await old.opened; await old.done;
    assert.deepEqual(old.names(), ['error', 'done']); assert.equal(old.of('error')[0].message, tEn('builder.errors.busy'));
    assert.equal((await kid(`/api/studio/${id}`)).json.chat.filter(m => m.followUp).length, 3, 'nothing stored by the old POST');
    gate.open.resolve(); await idleGame(id);
  } finally { w.close(); realBuilder(); }
});

test('HTTP-15 list rules: a build stopped by the time cap after saving is "Stopped", never "Ready"; an admin\'s build shows Building… but tells the child nothing', async () => {
  const { config } = await import('../../server/config.js');
  const kid = await signup('HttpCap');
  const id = await newGameFor(kid);
  const cap = config.builderTurnMaxMs; config.builderTurnMaxMs = 300;
  agent.registerProvider('mock', { run: async ctx => {
    ctx.steps.start('blocks');
    ctx.tools.exec('write_game', { html: '<title>T</title><canvas></canvas><script>let s = 1;</script>', notes: 'First version' });
    await new Promise(r => ctx.signal.addEventListener('abort', r, { once: true }));
    return { model: 'mock' };
  } });
  try { await build(kid, id); await idleGame(id); } finally { config.builderTurnMaxMs = cap; realBuilder(); }
  const row = turns.lastEnded(id);
  assert.deepEqual([row.status, row.end_reason, row.versions, row.can_continue], ['failed', 'timeout', 1, 1]);
  let r = await kid('/build'); assert.match(r.text, /⚠️ Stopped/); assert.doesNotMatch(r.text, /✨ Ready/);
  assert.match(r.text, /class="notice warn pagenote" role="status">⚠️ “⁨[^⁩]+⁩” stopped before it was finished\./);
  const st = (await kid(`/api/studio/${id}`)).json; assert.equal(st.lastTurn.cont, true);
  // An admin builds in the child's game.
  const admin = await signup('HttpAdmin15');
  q.run("UPDATE users SET role='admin' WHERE username='HttpAdmin15'");
  const gate = holdBuilder();
  try {
    await build(admin, id, 'Make it harder'); await gate.started;
    r = await kid('/build'); assert.match(r.text, /🛠️ Building…/);
    gate.open.resolve(); await idleGame(id);
  } finally { realBuilder(); }
  r = await kid('/build'); assert.doesNotMatch(r.text, /is ready!|has news/);
});

test('HTTP-14 the estimate on the wire: after the screening row and before the next one (streamed POST and live replay); none for a refusal', async () => {
  const id = await newGameFor(owner);
  const text = await (await owner(`/api/studio/${id}/chat`, { method: 'POST', body: { text: 'Make a catch game about a fox. Just build it.' }, raw: true })).text();
  assert.match(text, /event: eta\ndata: \{[^\n]*"phase":"start"/);
  const events = sse(text); const names = events.map(e => e[0]);
  assert.deepEqual(names.slice(0, 3), ['step', 'eta', 'step']);
  assert.deepEqual([events[0][1].key, events[2][1].key], ['screen', 'blocks']);
  assert.ok(Number.isInteger(events[1][1].el) && !/claude|sonnet|opus|haiku/i.test(JSON.stringify(events[1][1])));
  const refused = sse(await (await owner(`/api/studio/${id}/chat`, { method: 'POST', body: { text: 'make a pokemon game' }, raw: true })).text());
  assert.ok(!refused.some(e => e[0] === 'eta'));
  // A page that comes back mid-build gets the estimate in the replay, with the screening row before it.
  const g = holdBuilder();
  try {
    assert.equal((await build(owner, id, 'Make it harder')).status, 202);
    await g.started;
    const l = liveOf(owner, id); await l.opened;
    await l.until(s => s.names().includes('caughtup'));
    const replay = l.names().slice(0, l.names().indexOf('caughtup'));
    assert.deepEqual(replay.slice(1, 4), ['step', 'eta', 'step']);
    assert.equal(l.of('eta')[0].phase, 'start');
    l.close(); g.open.resolve(); await idleGame(id);
  } finally { realBuilder(); }
});

test('detached POST errors are JSON with a code: empty, no turns left, 2 builds at once', async () => {
  const kid = await signup('HttpErrors');
  const id = await newGameFor(kid);
  let r = await build(kid, id, '   ');
  assert.equal(r.status, 400); assert.equal(r.json.code, 'empty');
  const kidId = q.get('SELECT id FROM users WHERE username=?', 'HttpErrors').id;
  const { today } = await import('../../server/db.js');
  q.run('INSERT INTO builder_usage(user_id, day, turns) VALUES (?,?,999) ON CONFLICT(user_id, day) DO UPDATE SET turns=999', kidId, today());
  r = await build(kid, id);
  assert.equal(r.status, 429); assert.equal(r.json.code, 'limit'); assert.match(r.json.error, /Builder turns for today/);
  assert.equal(q.get('SELECT COUNT(*) n FROM builder_turns WHERE game_id=?', id).n, 0, 'nothing stored');
  q.run('DELETE FROM builder_usage WHERE user_id=?', kidId);
  const gate = holdBuilder();
  try {
    const a = await newGameFor(kid), b = await newGameFor(kid);
    await build(kid, a); await build(kid, b);
    r = await build(kid, id); assert.equal(r.status, 429); assert.equal(r.json.code, 'tooMany');
    gate.open.resolve(); await idleGame(a); await idleGame(b);
  } finally { realBuilder(); }
});

test('meta: text is cleaned; icon must come from the picker', async () => {
  let r = await owner(`/api/studio/${gameId}/meta`, { method: 'POST', body: { title: 'fuck this' } }); assert.equal(r.status, 400); assert.equal(r.json.field, 'title');
  r = await owner(`/api/studio/${gameId}/meta`, { method: 'POST', body: { description: 'email me at kid@example.com' } }); assert.equal(r.status, 400);
  r = await owner(`/api/studio/${gameId}/meta`, { method: 'POST', body: { icon: '<b>' } }); assert.equal(r.status, 400);
  r = await owner(`/api/studio/${gameId}/meta`, { method: 'POST', body: { title: 'Fruit Frenzy', icon: '🍕', category: 'silly', tags: '#fruit, Fast', orientation: 'portrait', players_max: 2, cover: 'mint' } });
  assert.equal(r.status, 200); const g = games.getGame(gameId);
  assert.deepEqual([g.title, g.icon, g.category, g.tags, g.orientation, g.players_max, g.cover], ['Fruit Frenzy', '🍕', 'silly', 'fruit,fast', 'portrait', 2, 'mint']);
});

test('uploads: owner-only, signature-checked, metadata stripped, never in versions or the transcript', async () => {
  const bytes = png();
  let r = await owner(`/api/studio/${gameId}/uploads?name=dragon.png`, { method: 'POST', body: bytes, headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(r.status, 200, r.text); const up = r.json.upload; assert.equal(up.kind, 'image');
  r = await owner(`/api/studio/${gameId}/uploads?name=fake.png`, { method: 'POST', body: Buffer.from('<svg onload=alert(1)>'), headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(r.status, 415);
  r = await stranger(`/api/studio/${gameId}/uploads?name=x.png`, { method: 'POST', body: bytes, headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(r.status, 404);
  const got = await owner(up.url, { raw: true }); assert.equal(got.status, 200);
  assert.equal(got.headers.get('x-content-type-options'), 'nosniff'); assert.match(got.headers.get('content-disposition'), /^inline/);
  assert.equal(got.headers.get('content-security-policy'), "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  assert.equal(got.headers.get('content-type'), 'image/png');
  const served = Buffer.from(await got.arrayBuffer()); assert.ok(!served.toString('latin1').includes('48.85837'), 'GPS text removed');
  assert.equal((await stranger(up.url)).status, 404, 'stranger cannot see it');
  assert.equal((await client()(up.url)).status, 401);

  const res = await owner(`/api/studio/${gameId}/chat`, { method: 'POST', body: { text: 'here is my idea', uploads: [up.id] }, raw: true });
  const events = sse(await res.text());
  assert.match(events.filter(e => e[0] === 'text').map(e => e[1].text).join(''), /I love your picture "dragon.png"/);
  const chat = loadChat(gameId); const json = JSON.stringify(chat.messages);
  assert.match(json, /"name":"dragon.png"/);
  const b64 = served.toString('base64');
  assert.ok(!json.includes(b64) && !json.includes(b64.slice(0, 40)), 'no bytes in the transcript');
  for (const v of games.listVersions(gameId)) assert.ok(!games.getVersion(v.id).html.includes(b64.slice(0, 40)), 'never copied into a game');
  r = await owner(`/api/studio/${gameId}/uploads/${up.id}`, { method: 'DELETE' }); assert.equal(r.status, 400, 'already sent');
  const r2 = await owner(`/api/studio/${gameId}/uploads?name=tmp.png`, { method: 'POST', body: bytes, headers: { 'content-type': 'application/octet-stream' } });
  r = await owner(`/api/studio/${gameId}/uploads/${r2.json.upload.id}`, { method: 'DELETE' }); assert.equal(r.status, 200);
  assert.equal((await owner(r2.json.upload.url)).status, 404);
});

test('publish, share and update a live game; public updates wait for review while the old version stays live', async () => {
  const st = (await owner(`/api/studio/${gameId}`)).json;
  const v2 = st.versions.find(v => v.number === 2);
  let r = await owner(`/api/studio/${gameId}/restore`, { method: 'POST', body: { versionId: st.versions.find(v => v.number === 1).id } });
  assert.equal(r.status, 200); assert.match(r.json.message, /Brought back as version 3/); assert.equal(r.json.state.current.number, 3);
  r = await owner(`/api/studio/${gameId}/publish`, { method: 'POST', body: { visibility: 'friends' } });
  assert.equal(r.status, 200); assert.equal(r.json.state.live.number, 3);
  let g = games.getGame(gameId); assert.equal(g.visibility, 'friends'); const liveV = g.published_version_id;
  r = await owner(`/api/studio/${gameId}/update`, { method: 'POST', body: {} }); assert.equal(r.status, 200, 'update with nothing new is harmless');
  r = await owner(`/api/studio/${gameId}/restore`, { method: 'POST', body: { versionId: v2.id } });
  assert.notEqual(r.json.state.current.id, r.json.state.live.id, 'editing a newer version than the live one');
  r = await owner(`/api/studio/${gameId}/update`, { method: 'POST', body: {} });
  g = games.getGame(gameId); assert.equal(r.json.state.live.number, r.json.state.current.number, 'friends update goes live at once'); assert.notEqual(g.published_version_id, liveV);
  // go public: waits for review (no API key) while friends keep playing
  r = await owner(`/api/studio/${gameId}/visibility`, { method: 'POST', body: { visibility: 'public' } });
  assert.equal(r.json.state.pending.number, r.json.state.live.number); assert.equal(games.getGame(gameId).visibility, 'friends');
  // edit again, then Update live game: friends get it now AND the public request moves to the new version
  await (await owner(`/api/studio/${gameId}/chat`, { method: 'POST', body: { text: 'make it easier' }, raw: true })).text();
  const before = games.getGame(gameId);
  r = await owner(`/api/studio/${gameId}/update`, { method: 'POST', body: {} });
  assert.equal(r.status, 200); const after = games.getGame(gameId);
  assert.equal(after.published_version_id, before.current_version_id); assert.equal(after.pending_version_id, before.current_version_id);
  assert.match(r.json.message, /waiting for its check/);
  const list = await owner('/build'); assert.match(list.text, /Update waiting for review/); assert.match(list.text, /Live: 👫 Friends/);
  // admin approves -> public; then another update goes to review while the old version stays live
  const { approve } = await import('../../server/services/publish.js');
  approve({ id: 'admin' }, gameId, 'Nice!');
  assert.equal(games.getGame(gameId).visibility, 'public');
  await (await owner(`/api/studio/${gameId}/chat`, { method: 'POST', body: { text: 'make it harder' }, raw: true })).text();
  const live = games.getGame(gameId).published_version_id;
  r = await owner(`/api/studio/${gameId}/update`, { method: 'POST', body: {} });
  assert.equal(r.json.state.live.id, live, 'players keep the old version'); assert.ok(r.json.state.pending, 'update waits for review');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='game.submit_review' AND target=?", gameId));
});

test('My games: rename and delete from /build; a deleted live game is gone for everyone', async () => {
  // a draft
  let r = await owner('/api/studio/new', { method: 'POST', body: {} }); const draft = r.json.id;
  r = await owner('/build'); assert.match(r.text, new RegExp(`data-id="${draft}"`)); assert.match(r.text, /data-delete/); assert.match(r.text, /data-rename/);
  r = await owner(`/api/studio/${draft}/meta`, { method: 'POST', body: { title: 'Space Cats' } }); assert.equal(r.json.state.game.title, 'Space Cats');
  r = await stranger(`/api/studio/${draft}/delete`, { method: 'POST', body: {} }); assert.equal(r.status, 404, 'not yours');
  r = await owner(`/api/studio/${draft}/delete`, { method: 'POST', body: {} }); assert.equal(r.status, 200, r.text);
  r = await owner('/build'); assert.doesNotMatch(r.text, new RegExp(`data-id="${draft}"`));
  assert.equal((await owner(`/studio/${draft}`)).status, 404); assert.equal((await owner(`/api/studio/${draft}`)).status, 404);
  assert.equal((await owner(`/api/studio/${draft}/delete`, { method: 'POST', body: {} })).status, 404, 'only once');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='game.delete' AND target=?", draft));

  // the public game from the test above, with an update waiting for review
  const g = games.getGame(gameId); assert.equal(g.visibility, 'public'); assert.ok(g.pending_version_id);
  assert.equal((await stranger(`/g/${g.slug}`)).status, 200);
  r = await owner(`/api/studio/${gameId}/delete`, { method: 'POST', body: {} }); assert.equal(r.status, 200);
  const d = games.getGame(gameId); assert.equal(d.status, 'deleted'); assert.equal(d.pending_version_id, null, 'out of the review queue');
  assert.equal((await stranger(`/g/${g.slug}`)).status, 404); assert.equal((await owner(`/g/${g.slug}`)).status, 404);
  assert.ok(!games.listVisible(null, { limit: 500 }).some(x => x.id === gameId), 'off every list');
});

test('starter (seed) games cannot be deleted, even by an admin', async () => {
  const seed = games.createGame('admin', { title: 'Seedy', source: 'seed' });
  q.run("UPDATE users SET role='admin' WHERE username=?", 'HttpStranger');
  try {
    const r = await stranger(`/api/studio/${seed.id}/delete`, { method: 'POST', body: {} });
    assert.equal(r.status, 400); assert.match(r.json.error, /Starter games/);
    assert.notEqual(games.getGame(seed.id).status, 'deleted');
  } finally { q.run("UPDATE users SET role='player' WHERE username=?", 'HttpStranger'); }
});
