// Homeroom: live games inside Homeroom, a simpler Find lessons (docs/decisions.md), on the server:
//   - the class's live game for the board (title, players, who of the class is in it, how many are in Homeroom, who has
//     not joined yet, its host), the projector (its host screen's address for its host only) and a desk (nothing taken
//     by its poll; Join: a seat as themselves, no code); End from the pill (its host only);
//     nobody else (another class's student, another teacher, an aide for End);
//   - the live pages framed by Homeroom (?in=hr in a frame, then the cookie in the same frame): no site menu or footer,
//     framed by this site only; the same pages on their own exactly as before (no framing, the chrome);
//   - Find lessons: Games, Live games, Teaching tools, then lessons; typing games under Typing (not Coding);
//   - QA round 2: a closing page's last pulse clears the desk at once (N8); a practice set opened with nothing checked
//     reads as opened (Today's Started).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.manipulatives = true;
config.liveClassroom = true;
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HV = await import('../../server/services/homeroom-live.js');
const LS = await import('../../server/services/classlive-sessions.js');
const LG = await import('../../server/services/homeroom-livegame.js');
const OP = await import('../../server/services/homeroom-opened.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { for (const s of LS.openSessions()) LS.endSession(s.id); server.close(); });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(p, { body, cookie = '', headers = {} } = {}) {
  const h = { ...headers, ...(cookie ? { cookie } : {}) };
  if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
}
const as = who => (p, o = {}) => call(p, { ...o, cookie: `${cookieFor(who.id)}${o.cookie ? `; ${o.cookie}` : ''}` });

const boss = createUser({ username: 'HlgsBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Live Oak' }).school;
const staff = n => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n, role: 'teacher' }).user.id);
const reyes = staff('Ms Reyes'), other = staff('Mr Other');
TOOLS.givePlan(reyes.id);
const cls = S.createClass(boss, oak.id, { name: 'Room 9', teacherId: reyes.id }).class;
const cls2 = S.createClass(boss, oak.id, { name: 'Room 10', teacherId: other.id }).class;
const kid = (n, c = cls) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const [ada, ben] = ['Ada', 'Ben'].map(n => kid(n));
const zed = kid('Zed', cls2);
Object.assign(config, { homeroom: true, homeroomUsers: [reyes.username.toLowerCase()], manipulativesUsers: [reyes.username.toLowerCase()] });
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon, htmlText) {
  const g = games.createGame(official.id, { title });
  const v = games.addVersion(g.id, htmlText, { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, icon=? WHERE id=?", v.id, slug, icon, g.id);
  return games.getGame(g.id);
}
made('Brain Board', 'brain-board', '🌟', fs.readFileSync('seed-games/brain-board.html', 'utf8'));
made('Typing Zoo', 'typing-zoo', '⌨️', '<title>Typing Zoo</title><h1>Typing Zoo</h1>');
made('Sum Racer', 'sum-racer', '🏎️', '<title>Sum Racer</title><h1>Sum Racer</h1>');
const C = `/api/homeroom/${cls.id}`;
const FRAMED = { 'sec-fetch-dest': 'iframe' };

test('Find lessons: Games, Live games, Teaching tools, then lessons; a live game hosts in Homeroom; Typing, not Coding', async () => {
  const pg = await as(reyes)(`/class/${cls.id}/hub`);
  assert.equal(pg.status, 200);
  const at = k => pg.text.indexOf(`data-csec="${k}"`);
  assert.ok(at('games') > 0 && at('games') < at('live') && at('live') < at('tools') && at('tools') < at('lessons'), 'Games, Live games, Teaching tools, then lessons');
  assert.match(pg.text, /<h2 class="hr-cap">Games<\/h2>/);
  assert.match(pg.text, /data-hrlive="\/live\?mode=board&amp;class=/, 'Brain Board hosts in the layer');
  assert.match(pg.text, /data-csubj="typing"/); assert.doesNotMatch(pg.text, /data-csubj="code"/);
  assert.match(pg.text, /data-cgroup="s-typing"/);
  assert.doesNotMatch(pg.text, /Lessons you build show here|Oomba lessons and tools/);
  assert.match(pg.text, /data-cselect/);
});

test('the class\'s live game: the board, the projector, a desk joins as themselves, End by its host only', async () => {
  assert.equal((await as(reyes)(`${C}/livegame`)).json.game, null);
  const r = LS.createSession(reyes, { mode: 'board', audience: 'class', classId: cls.id, starter: 'bank:board:a8:math+science' });
  assert.ok(r.ok, r.code);
  const s = r.session;
  let g = (await as(reyes)(`${C}/livegame`)).json.game;
  assert.equal(g.sid, s.id); assert.equal(g.host, true); assert.equal(g.icon, '🌟'); assert.deepEqual(g.in, []);
  // a desk: the game to join, then a seat as themselves (no code)
  const st = (await as(ada)(`/api/desk/${cls.id}/state`)).json;
  assert.equal(st.livegame.sid, s.id); assert.equal(st.livegame.seated, false); assert.equal(st.livegame.lobby, true);
  // (nobody is seated by the desk's poll: the student taps Join; the board counts them as in Homeroom, not joined yet)
  assert.equal(s.byUser.has(ada.id), false);
  g = (await as(reyes)(`${C}/livegame`)).json.game;
  assert.equal(g.here, 1); assert.deepEqual(g.waiting, [ada.id]); assert.equal(g.players, 0);
  const j = await as(ada)(`/api/desk/${cls.id}/livegame`, { body: {} });
  assert.equal(j.status, 200, j.text);
  assert.equal(j.json.play, `/live/play/${s.id}`); assert.ok(j.json.tok);
  assert.equal(s.byUser.has(ada.id), true);
  // (connected seats count as in it: the board's "In Brain Board")
  const seat = s.seats.get(s.byUser.get(ada.id)); seat.conn = { readyState: 1, send() {}, close() {} };
  g = (await as(reyes)(`${C}/livegame`)).json.game;
  assert.deepEqual(g.in, [ada.id]); assert.equal(g.players, 1); assert.equal(g.here, 1); assert.deepEqual(g.waiting, []);
  seat.conn = null;
  // the projector: the host screen's address for its host
  const pj = (await as(reyes)(`${C}/state`)).json.livegame;
  assert.equal(pj.host, `/live/host/${s.id}`);
  // not for anyone else: another class's student, another teacher
  assert.equal((await as(zed)(`/api/desk/${cls.id}/livegame`, { body: {} })).status, 404);
  assert.equal((await as(zed)(`/api/desk/${cls2.id}/livegame`, { body: {} })).status, 404, 'no game in Room 10');
  assert.equal((await as(other)(`${C}/livegame`)).status, 404);
  assert.equal((await as(other)(`${C}/livegame/end`, { body: {} })).status, 404);
  // End from the pill
  const e = await as(reyes)(`${C}/livegame/end`, { body: {} });
  assert.equal(e.status, 200, e.text); assert.match(e.json.toast, /ended/);
  assert.equal(LS.openForClass(cls.id), null);
  assert.equal((await as(ada)(`/api/desk/${cls.id}/state`)).json.livegame, null);
  assert.equal((await as(ada)(`/api/desk/${cls.id}/livegame`, { body: {} })).status, 404);
  assert.equal(LG.end(cls, reyes).ok, false);
});

test('the live pages in Homeroom\'s frame: no chrome, framed by this site only; on their own as before', async () => {
  const r = LS.createSession(reyes, { mode: 'board', audience: 'class', classId: cls.id, starter: 'bank:board:a8:math+science', replace: true });
  assert.ok(r.ok, r.code);
  const s = r.session;
  // the landing, framed with ?in=hr: bare, frame-ancestors 'self', the cookie for the next pages in the frame
  const land = await as(reyes)(`/live?mode=board&class=${cls.id}&in=hr`, { headers: FRAMED });
  assert.equal(land.status, 200);
  assert.match(land.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal(land.headers.get('x-frame-options'), null);
  assert.match(land.headers.get('set-cookie') || '', /hr_lv=1; Path=\/live;.*SameSite=Strict/);
  assert.match(land.text, /class="[^"]*lv-inhr/); assert.doesNotMatch(land.text, /<footer class="foot"|class="backlink"/);
  // the host page next in the same frame (no ?in=hr): still framed by Homeroom, by the cookie
  const host = await as(reyes)(`/live/host/${s.id}`, { headers: FRAMED, cookie: 'hr_lv=1' });
  assert.equal(host.status, 200);
  assert.match(host.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  // on their own (a tab, not a frame): exactly as before, the cookie or not
  for (const [p, o] of [[`/live?mode=board&class=${cls.id}`, {}], [`/live?mode=board&class=${cls.id}&in=hr`, {}], [`/live/host/${s.id}`, { cookie: 'hr_lv=1' }]]) {
    const x = await as(reyes)(p, o);
    assert.match(x.headers.get('content-security-policy'), /frame-ancestors 'none'/, p); assert.equal(x.headers.get('x-frame-options'), 'DENY', p);
  }
  assert.match((await as(reyes)(`/live?mode=board&class=${cls.id}`)).text, /<footer class="foot"/);
  // a framed page that is not a live page is not opened up
  const other = await as(reyes)('/join?in=hr', { headers: FRAMED });
  assert.equal(other.headers.get('x-frame-options'), 'DENY');
  LS.endSession(s.id);
});

test('QA round 2: a closing page\'s last pulse clears the desk at once (N8); a set opened reads as opened (Started)', async () => {
  H.setLive(reyes, cls, 'start');
  const g = games.getGameBySlug('sum-racer');
  const h = HO.handOut(reyes, cls, { gameId: g.id, to: { kind: 'desk', id: ben.id } });
  assert.ok(h.ok, h.code);
  const cl = h.classLesson.id;
  const p1 = await as(ben)(`/api/desk/${cls.id}/pulse`, { body: { where: 'game', on: cl, idle: 0 } });
  assert.equal(p1.status, 200);
  const status = () => HV.statusOf(HV.beatOf(cls.id, ben.id), []).st;
  assert.notEqual(status(), 'away');
  const p2 = await as(ben)(`/api/desk/${cls.id}/pulse`, { body: { where: 'game', gone: true } });
  assert.equal(p2.status, 200);
  assert.equal(status(), 'away', 'gone at once');
  // a practice set opened in the player (the desk's pulse: a tool, that set): opened, until class ends
  OP.mark(cls.id, ada.id, 'clX');
  assert.ok(OP.has(cls.id, ada.id, 'clX'));
  H.setLive(reyes, cls, 'end');
  assert.equal(OP.has(cls.id, ada.id, 'clX'), false);
});
