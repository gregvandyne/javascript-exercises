// Shared harness for the Oomba Live tests (live-*.test.js): an in-memory database, one app server with the live socket
// on the shared upgrade listener, a school with a teacher, a class and students, the official account with the two
// built-in mode games (live-ready fixtures: the live pack's hash is a test value until the pack ships), fast timers,
// and helpers for HTTP calls and WebSocket clients.
import './_setup.js';
import test from 'node:test';
import WebSocket from 'ws';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

export const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-live-'));
process.env.BRB_DATA_DIR = DATA;
export const { config } = await import('../../server/config.js');
config.anthropicKey = '';
export const db = await import('../../server/db.js');
export const { q } = db;
export const auth = await import('../../server/auth.js');
export const S = await import('../../server/services/schools.js');
export const L = await import('../../server/services/lessons.js');
export const games = await import('../../server/services/games.js');
export const RL = await import('../../server/services/ratelimit.js');
export const LS = await import('../../server/services/classlive-sessions.js');
export const LSock = await import('../../server/services/classlive-socket.js');
export const C = await import('../../server/services/classlive-check.js');
export const UP = await import('../../server/services/upgrade.js');
const stt = await import('../../server/services/stt-live.js');
const { KIT_VERSIONS } = await import('../../server/services/kit.js');
const { createApp } = await import('../../server/app.js');

export const PACK_HASH = 'sha384-live-pack-test-hash';
C.hooks.packHash = v => (v === '1.1.0' ? PACK_HASH : undefined);
LS.hooks.countdownMs = 40; LS.hooks.loadingMs = 400;
export const logs = [];
const keep = (level, msg, fields) => logs.push({ level, msg, fields });
LS.hooks.log = keep; LSock.hooks.log = keep; UP.hooks.log = keep;

/** A live-ready game page (kit 1.1.0 + the live pack, ready/start/report), plus extra code. */
export const liveHtml = (extra = '', { quiz = false, lobby = true } = {}) => `<!doctype html><title>t</title>
<script src="/vendor/oomba-kit/1.1.0/oomba-kit.js" integrity="${KIT_VERSIONS['1.1.0']}" crossorigin="anonymous"></script>
<script src="/vendor/oomba-kit/1.1.0/packs/live.js" integrity="${PACK_HASH}" crossorigin="anonymous"></script>
<script>const live = Oomba.live; live.ready({ lobby: ${lobby}, quiz: ${quiz}, words: ['pick', 'red-gem', 'item', 'say', 'add_me_on_snap'] }); live.on('start', () => {}); live.score(1); ${extra}</script>`;

export const boss = auth.createUser({ username: 'LiveBoss', password: 'secret123', role: 'admin' });
export const school = S.createSchool(boss, { name: 'Live Oak' }).school;
export const teacher = S.createSchoolAccount(boss, school.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user;
export const teacher2 = S.createSchoolAccount(boss, school.id, { rosterName: 'Tom Teacher', role: 'teacher' }).user;
export const cls = S.createClass(teacher, school.id, { name: 'Tia 6A' }).class;
export const cls2 = S.createClass(teacher2, school.id, { name: 'Tom 6B' }).class;
export const mia = S.createSchoolAccount(teacher, school.id, { rosterName: 'Mia Pupil' }).user; S.addToClass(teacher, cls.id, mia.id);
export const leo = S.createSchoolAccount(teacher, school.id, { rosterName: 'Leo Pupil' }).user; S.addToClass(teacher, cls.id, leo.id);
export const zed = S.createSchoolAccount(teacher2, school.id, { rosterName: 'Zed Pupil' }).user; S.addToClass(teacher2, cls2.id, zed.id);
export const kid = auth.createUser({ username: 'LiveKid', password: 'secret123' });
export const mum = auth.createUser({ username: 'LiveMum', password: 'a-long-password-1', accountType: 'grownup' });
export const official = auth.createUser({ username: 'OombaAcademy', password: 'secret123' });

/** A published game with this HTML. */
export function publish(owner, html, { visibility = 'public', source = 'studio', slug = null, title = 'G' } = {}) {
  const g = games.createGame(owner.id, { title, source, slug });
  const v = games.addVersion(g.id, html, { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility=?, published_version_id=?, current_version_id=? WHERE id=?", visibility, v.id, v.id, g.id);
  return games.getGame(g.id);
}
export const questRace = publish(official, liveHtml("live.on('question', q => live.quiz.answer(0));", { quiz: true }), { source: 'seed', slug: 'quest-race', title: 'Quest Race' });
export const battle = publish(official, liveHtml("live.quiz.answer(0);", { quiz: true }), { source: 'seed', slug: 'question-battle', title: 'Question Battle' });

let server;
export const ctx = { base: '', port: 0 };
test.before(async () => {
  server = createApp().listen(0);
  server.keepAliveTimeout = 0;
  await new Promise(r => server.once('listening', r));
  UP.attachUpgrades(server, [stt.route, LSock.route]);
  ctx.port = server.address().port; ctx.base = `http://127.0.0.1:${ctx.port}`;
});
const clients = [];
test.after(async () => { for (const c of clients) { try { c.terminate(); } catch { /* gone */ } } LSock.drainLive(); LS._reset(); server.closeAllConnections(); server.close(); fs.rmSync(DATA, { recursive: true, force: true }); });

export const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
/** fetch with an optional user (signed in) and JSON. -> { status, text, json, headers, ms } */
export async function call(path, { method = 'GET', body, user = null, cookie = null, headers = {} } = {}) {
  const h = { ...headers };
  if (user) h.cookie = cookieFor(user.id); else if (cookie) h.cookie = cookie;
  if (body !== undefined) h['content-type'] = 'application/json';
  const t0 = Date.now();
  const r = await fetch(ctx.base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers, ms: Date.now() - t0 };
}

/** A WebSocket client on /api/live/ws. -> { ws, msgs, status, closed: Promise<code>, next(type, pred), send(obj) } */
export function socket({ cookie = null, origin = 'own', path = '/api/live/ws' } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin === 'own' ? ctx.base : origin;
  const ws = new WebSocket(`ws://127.0.0.1:${ctx.port}${path}`, { headers });
  clients.push(ws);
  const c = { ws, msgs: [], status: null, waiters: [] };
  c.closed = new Promise(r => { ws.on('close', code => r(code)); ws.on('unexpected-response', (req, res) => { c.status = res.statusCode; r(null); }); ws.on('error', () => r(null)); });
  ws.on('message', d => {
    const m = JSON.parse(String(d)); c.msgs.push(m);
    c.waiters = c.waiters.filter(w => (w.type === m.t && (!w.pred || w.pred(m)) ? (w.r(m), false) : true));
  });
  c.opened = new Promise(r => ws.on('open', r));
  c.next = (type, pred = null, ms = 4000) => {
    const had = c.msgs.find(m => m.t === type && !m.seen && (!pred || pred(m)));
    if (had) { had.seen = true; return Promise.resolve(had); }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${type} within ${ms} ms; got ${c.msgs.map(m => m.t).join(',')}`)), ms);
      c.waiters.push({ type, pred, r: m => { clearTimeout(timer); m.seen = true; resolve(m); } });
    });
  };
  c.send = obj => ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  c.hello = async tok => { await c.opened; c.send({ t: 'hello', v: 1, tok }); return c.next('wel'); };
  return c;
}

/** A session made by host (through the service). */
export function open(host, opts) {
  const r = LS.createSession(host, opts);
  if (!r.ok) throw new Error(`session refused: ${r.code}`);
  return r.session;
}
/** The host connected: -> socket client with its wel. */
export async function hostSocket(s, host) {
  const c = socket({ cookie: cookieFor(host.id) });
  c.wel = await c.hello(LS.hostToken(s));
  return c;
}
/** A guest or signed-in player through POST /api/live/join, then connected. -> { join, c } */
export async function player(s, user = null, body = {}) {
  const join = await call('/api/live/join', { method: 'POST', body: { code: s.code, ...body }, user });
  if (join.status !== 200) throw new Error(`join ${join.status} ${join.text}`);
  const c = socket({ cookie: user ? cookieFor(user.id) : null });
  c.wel = await c.hello(join.json.tok);
  c.join = join.json;
  return c;
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const reset = () => { LS._reset(); RL._reset(); logs.length = 0; config.liveClassroom = true; };
