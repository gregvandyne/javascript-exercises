// Oomba Live part 4: co-hosts (docs/decisions.md "Oomba Live, part 4"; docs/live-protocol.md "Part 4"; legal-review item
// 43). Eligibility (who may co-host, and which tier), invites over HTTP, co-host tokens, the powers and what each tier
// sees, no adult names reaching a player or a frame, serialized actions with "already" and the conflict window, removal
// mid-game, the projector slot, the handoff, the audit trail and its retention, the protocol additions and the flag.
import { reset, call, socket, open, hostSocket, player, sleep, cookieFor, LS, q, S, auth, config, boss, school, teacher, teacher2, cls, mia, leo, kid, mum } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const A = await import('../../server/services/classlive-access.js');
const CH = await import('../../server/services/classlive-cohost.js');
const R = await import('../../server/services/classlive-results.js');
const P = await import('../../server/services/classlive-protocol.js');
const ST = await import('../../server/services/classlive-settings.js');

// teacher teaches cls; teacher2 (Tom) is staff of the same school, not on cls; ann teaches cls too; ada is a school
// admin who doesn't teach it; far teaches at another school; boss is the platform admin (no school membership).
const ann = S.createSchoolAccount(boss, school.id, { rosterName: 'Ann Teacher', role: 'teacher' }).user;
S.addToClass(boss, cls.id, ann.id, 'teacher');
const ada = S.createSchoolAccount(boss, school.id, { rosterName: 'Ada Admin', role: 'admin' }).user;
const school2 = S.createSchool(boss, { name: 'Far Oak' }).school;
const far = S.createSchoolAccount(boss, school2.id, { rosterName: 'Far Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(boss, school.id, { rosterName: 'Ben Banned', role: 'teacher' }).user;
q.run('UPDATE users SET banned=1 WHERE id=?', ben.id);
const banned = auth.getUser(ben.id);
const mum2 = auth.createUser({ username: 'LiveMumTwo', password: 'a-long-password-2', accountType: 'grownup' });
const pal = auth.createUser({ username: 'LivePalGrownup', password: 'a-long-password-3', accountType: 'grownup' });

test.beforeEach(() => { reset(); config.liveCohost = true; LS.hooks.handoffMs = 120e3; LS.hooks.conflictMs = 1000; LS.hooks.inviteMs = 15 * 60e3; });
const items = n => Array.from({ length: n }, (_, i) => ({ q: `Q${i + 1}: pick yes`, choices: ['yes', 'no', 'maybe'], answer: 0, secs: 10 }));
const classRoom = (host = teacher, extra = {}) => open(host, { mode: 'battle', items: items(3), audience: 'class', classId: cls.id, ...extra });
/** A controller's Teacher view on the socket. */
async function dashOf(s, u) {
  const d = socket({ cookie: cookieFor(u.id) });
  await d.opened; d.send({ t: 'hello', v: 1, tok: LS.ctlToken(s, u.id), view: 'dash' });
  d.wel = await d.next('wel');
  return d;
}
/** Invite and accept through the HTTP API. */
async function makeCohost(s, u, host = teacher) {
  const inv = await call(`/api/live/cohost/${s.id}`, { method: 'POST', user: host, body: { a: 'invite', userId: u.id } });
  assert.equal(inv.status, 200, inv.text);
  const ans = await call(`/api/live/cohost/${s.id}/answer`, { method: 'POST', user: u, body: { yes: true } });
  assert.equal(ans.status, 200, ans.text);
  return ans.json;
}
const close = (...cs) => { for (const c of cs) c.ws.close(); };
async function toPlaying(s, h, ...players) {
  h.send({ t: 'h', a: 'start' });
  for (const p of players) p.send({ t: 'rdy' });
  await players[0].next('ph', m => m.phase === 'playing', 6000);
}

test('eligibility: class staff of the school only (full when they teach the class), never a student, kid, guest, banned account, other-school teacher or a platform admin outside the school; families through the seam; open rooms none', () => {
  const s = classRoom();
  const tier = u => A.controlTier(s, u);
  assert.equal(tier(teacher), 'full', 'the host teaches the class');
  assert.equal(tier(ann), 'full', 'another teacher of the class');
  assert.equal(tier(teacher2), 'limited', 'same-school teacher, not on the class: controls only');
  assert.equal(tier(ada), 'limited', 'a school admin who does not teach the class');
  assert.equal(tier(mia), null, 'a student of the class');
  assert.equal(tier(kid), null, 'a kid account');
  assert.equal(tier({ ...teacher2, is_guest: 1 }), null, 'a guest');
  assert.equal(tier(banned), null, 'a banned account');
  assert.equal(tier(far), null, 'a teacher at another school');
  assert.equal(tier(boss), null, 'the platform admin is not a member of the school');
  assert.equal(tier(mum), null, 'a grown-up outside the school');
  // refusals
  assert.equal(A.cohostRefusal(s, teacher), 'self');
  assert.equal(A.cohostRefusal(s, mia), 'notEligible');
  assert.equal(A.cohostRefusal(s, far), 'notEligible');
  assert.equal(A.cohostRefusal(s, teacher2), null);
  // the candidates: staff of the school (no students, the host, banned, other schools), with their tier
  const cands = A.cohostCandidates(s);
  const ids = cands.map(c => c.id);
  assert.ok(ids.includes(teacher2.id) && ids.includes(ann.id) && ids.includes(ada.id));
  for (const no of [teacher.id, mia.id, leo.id, far.id, ben.id, boss.id, kid.id]) assert.ok(!ids.includes(no), `not offered: ${no}`);
  assert.equal(cands.find(c => c.id === teacher2.id).name, 'Tom Teacher', 'the roster name');
  assert.equal(cands.find(c => c.id === ann.id).tier, 'full');
  // open rooms: nobody
  const o = open(mum, { mode: 'battle', items: items(1), audience: 'open' });
  assert.equal(A.cohostRefusal(o, teacher2), 'cohostRoom');
  assert.equal(A.controlTier(o, teacher2), null);
  assert.equal(A.controlTier(o, mum), 'full');
  assert.deepEqual(A.cohostCandidates(o), []);
  // family rooms: the owner's family; today nobody else (one grown-up per family); the seam lets a second grown-up in
  q.run("INSERT OR IGNORE INTO families(id, owner_id, created_at) VALUES ('famC', ?, ?)", mum.id, Date.now());
  const f = { audience: 'family', owner: mum.id, host: { userId: mum.id }, cohosts: new Map(), invites: new Map() };
  assert.equal(A.controlTier(f, mum), 'full');
  assert.equal(A.controlTier(f, mum2), null, 'no second grown-up yet');
  assert.equal(A.controlTier(f, pal), null);
  assert.deepEqual(A.cohostCandidates(f), []);
  const was = A.hooks.familyGrownups;
  A.hooks.familyGrownups = fam => [fam.owner_id, mum2.id];
  try {
    assert.equal(A.controlTier(f, mum2), 'limited', 'a family grown-up: controls only');
    assert.equal(A.controlTier(f, pal), null, 'a grown-up connection (friend code) is not family');
    assert.equal(A.controlTier(f, kid), null, 'a child of the family never co-hosts');
    assert.deepEqual(A.cohostCandidates(f).map(c => c.id), [mum2.id]);
  } finally { A.hooks.familyGrownups = was; }
  // the cap counts pending invites
  s.invites.set('x1', { tier: 'limited', until: Infinity }); s.invites.set('x2', { tier: 'limited', until: Infinity }); s.invites.set('x3', { tier: 'limited', until: Infinity });
  assert.equal(A.cohostRefusal(s, teacher2), 'full');
});

test('invites over HTTP: only the host sees the panel; invite, the invitee sees it on /live and /api/live/mine, the invite page is 404 for anyone else; accept, decline, expiry; audit rows at once', async () => {
  const s = classRoom();
  const panel = await call(`/api/live/cohost/${s.id}`, { user: teacher });
  assert.equal(panel.status, 200);
  assert.ok(panel.json.candidates.some(c => c.id === teacher2.id));
  assert.equal(panel.json.max, 3);
  assert.equal((await call(`/api/live/cohost/${s.id}`, { user: teacher2 })).status, 404, 'not the host');
  assert.equal((await call(`/api/live/cohost/${s.id}`, { method: 'POST', user: teacher2, body: { a: 'invite', userId: ann.id } })).status, 404);
  // refused: a student, another school
  for (const u of [mia, far]) {
    const r = await call(`/api/live/cohost/${s.id}`, { method: 'POST', user: teacher, body: { a: 'invite', userId: u.id } });
    assert.equal(r.status, 400); assert.equal(r.json.code, 'notEligible');
  }
  const inv = await call(`/api/live/cohost/${s.id}`, { method: 'POST', user: teacher, body: { a: 'invite', userId: teacher2.id } });
  assert.equal(inv.status, 200); assert.ok(inv.json.toast);
  assert.equal(inv.json.list[0].state, 'invited');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='live.cohost.invite' AND target=?", s.id));
  // the invitee: /live shows it, /api/live/mine lists it; the invite page
  const landing = await call('/live', { user: teacher2 });
  assert.match(landing.text, new RegExp(`data-lv-cohost-invite="${s.id}"`));
  assert.match(landing.text, /Tia Teacher/);
  const mine = await call('/api/live/mine', { user: teacher2 });
  assert.equal(mine.json.invites[0].sid, s.id);
  const pg = await call(`/live/cohost/${s.id}`, { user: teacher2 });
  assert.equal(pg.status, 200); assert.match(pg.text, /id="lv-cohost-accept"/);
  // anyone else: the same 404 as an unknown session (no oracle)
  const other = await call(`/live/cohost/${s.id}`, { user: ann }), unknown = await call('/live/cohost/nope', { user: ann });
  assert.equal(other.status, 404); assert.equal(unknown.status, 404);
  assert.ok(!other.text.includes(s.title) || !unknown.text.includes(s.title));
  assert.equal((await call(`/live/cohost/${s.id}`, { user: mia })).status, 404);
  // the Teacher view's address sends a pending invitee to the invite
  assert.equal((await call(`/live/host/${s.id}/dash`, { user: teacher2 })).headers.get('location'), `/live/cohost/${s.id}`);
  // someone not invited can't answer
  assert.equal((await call(`/api/live/cohost/${s.id}/answer`, { method: 'POST', user: ann, body: { yes: true } })).status, 410);
  // accept
  const ok = await call(`/api/live/cohost/${s.id}/answer`, { method: 'POST', user: teacher2, body: { yes: '1' } });
  assert.equal(ok.status, 200); assert.equal(ok.json.redirect, `/live/host/${s.id}/dash`);
  assert.equal(LS.roleOf(s, teacher2.id), 'cohost');
  assert.equal(s.cohosts.get(teacher2.id).tier, 'limited');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='live.cohost.accept' AND target=?", s.id));
  assert.equal((await call(`/live/host/${s.id}/dash`, { user: teacher2 })).status, 200);
  assert.equal((await call(`/live/cohost/${s.id}`, { user: teacher2 })).headers.get('location'), `/live/host/${s.id}/dash`);
  assert.equal((await call('/api/live/mine', { user: teacher2 })).json.cohosting[0].sid, s.id);
  // decline
  await call(`/api/live/cohost/${s.id}`, { method: 'POST', user: teacher, body: { a: 'invite', userId: ann.id } });
  const no = await call(`/api/live/cohost/${s.id}/answer`, { method: 'POST', user: ann, body: { yes: '0' } });
  assert.equal(no.status, 200); assert.equal(no.json.redirect, '/live');
  assert.equal(s.invites.size, 0); assert.equal(LS.roleOf(s, ann.id), null);
  // expiry
  await call(`/api/live/cohost/${s.id}`, { method: 'POST', user: teacher, body: { a: 'invite', userId: ada.id } });
  s.invites.get(ada.id).until = Date.now() - 1;
  assert.equal((await call(`/api/live/cohost/${s.id}/answer`, { method: 'POST', user: ada, body: { yes: true } })).status, 410);
  assert.equal((await call(`/live/cohost/${s.id}`, { user: ada })).status, 404);
  // open rooms have no co-hosts
  const o = open(teacher2, { mode: 'battle', items: items(1), audience: 'open' });
  const r = await call(`/api/live/cohost/${o.id}`, { user: teacher2 });
  assert.equal(r.status, 400); assert.equal(r.json.code, 'cohostRoom');
});

test('tokens: a co-host token needs its own account; after removal the old page is told cohostOff (4403); a re-invite gets a new nonce', async () => {
  const s = classRoom();
  await makeCohost(s, teacher2);
  const tok = LS.ctlToken(s, teacher2.id);
  // another account's sign-in with this token: 4401
  const wrong = socket({ cookie: cookieFor(ann.id) });
  await wrong.opened; wrong.send({ t: 'hello', v: 1, tok, view: 'dash' });
  assert.equal(await wrong.closed, 4401);
  const d = await dashOf(s, teacher2);
  assert.equal(d.wel.ctl.role, 'cohost'); assert.equal(d.wel.ctl.tier, 'limited');
  const rm = await call(`/api/live/cohost/${s.id}`, { method: 'POST', user: teacher, body: { a: 'remove', userId: teacher2.id } });
  assert.equal(rm.status, 200);
  assert.equal((await d.next('bye')).why, 'cohostOff');
  assert.equal(await d.closed, 4403);
  // the old token again
  const again = socket({ cookie: cookieFor(teacher2.id) });
  await again.opened; again.send({ t: 'hello', v: 1, tok, view: 'dash' });
  assert.equal((await again.next('bye')).why, 'cohostOff');
  assert.equal(await again.closed, 4403);
  // re-invited: a new nonce, the old token stays dead
  await makeCohost(s, teacher2);
  assert.notEqual(LS.ctlToken(s, teacher2.id), tok);
  const old = socket({ cookie: cookieFor(teacher2.id) });
  await old.opened; old.send({ t: 'hello', v: 1, tok, view: 'dash' });
  assert.equal(await old.closed, 4403);
});

test('powers: a co-host pauses, resumes, kicks, raises eyes, gives a bonus, moves a team member, mutes emotes; end needs sure; a co-host start saves no remembered settings; host-only actions refused', async () => {
  const s = classRoom(teacher, { teams: { n: 2 } });
  await makeCohost(s, ann);
  const h = await hostSocket(s, teacher), d = await dashOf(s, ann);
  const a = await player(s, mia), b = await player(s, leo);
  ST.resetPrefs(teacher.id); ST.resetPrefs(ann.id);
  // the co-host starts: no prefs saved for anyone
  d.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' }); b.send({ t: 'rdy' });
  await a.next('ph', m => m.phase === 'playing', 6000);
  assert.equal(ST.loadPrefs(ann.id), null); assert.equal(ST.loadPrefs(teacher.id), null);
  d.send({ t: 'h', a: 'pause' }); await a.next('ph', m => m.phase === 'paused');
  const act = await h.next('act', m => m.a === 'pause');
  assert.equal(act.by, d.wel.ctl.me);
  await sleep(1100);   // past the conflict window: the host may resume (a different controller)
  d.send({ t: 'h', a: 'resume' }); await a.next('ph', m => m.phase === 'playing');
  d.send({ t: 'h', a: 'eyes', on: true }); await a.next('eyes', m => m.on);
  await sleep(1100);
  d.send({ t: 'h', a: 'eyes', on: false }); await a.next('eyes', m => !m.on);
  d.send({ t: 'h', a: 'bonus', n: a.join.seat, r: 0 }); await a.next('bn');
  const k = s.seats.get(a.join.seat).team === 1 ? 2 : 1;
  d.send({ t: 'tm', a: 'move', s: a.join.seat, k }); await a.next('tms', m => m.m.some(([n, t]) => n === a.join.seat && t === k));
  d.send({ t: 'cf', d: { emotes: false } }); await h.next('cf', m => m.d.emotes === false);
  d.send({ t: 'h', a: 'kick', n: b.join.seat }); assert.equal((await b.next('bye')).why, 'removed');
  // end without sure: ignored; with sure: ends
  d.send({ t: 'h', a: 'end' }); await sleep(120);
  assert.equal(s.phase, 'playing');
  d.send({ t: 'h', a: 'end', sure: 1 }); await a.next('ph', m => m.phase === 'ended');
  close(h, d, a);
  // the host's own start saves their defaults
  const s2 = classRoom();
  const h2 = await hostSocket(s2, teacher);
  h2.send({ t: 'h', a: 'start' }); await h2.next('ph', m => m.phase === 'loading');
  assert.ok(ST.loadPrefs(teacher.id));
  close(h2);
});

test('private data per tier: a full co-host gets dp, sup and who answered; a limited one none of it, players by the players\' names, no support changes (nak notAllowed), no account-names setting; results without student details or CSV', async () => {
  const s = classRoom();
  await makeCohost(s, ann); await makeCohost(s, teacher2);
  const h = await hostSocket(s, teacher);
  const a = await player(s, mia);
  s.settings.names = 'nicknames'; LS.broadcastRoster(s);
  const full = await dashOf(s, ann), lim = await dashOf(s, teacher2);
  assert.ok(Array.isArray(full.wel.dp) && Array.isArray(full.wel.sup));
  assert.equal(lim.wel.dp, undefined); assert.equal(lim.wel.sup, undefined);
  const miaName = s.seats.get(a.join.seat).name;
  assert.equal(full.wel.players[0][1], miaName, 'the dashboard view: account names');
  assert.equal(typeof lim.wel.players[0][1], 'number', 'the players\' view: a nickname');
  assert.equal(lim.wel.nameMode, 'nicknames');
  await toPlaying(s, h, a);
  const fdq = await full.next('dq'), ldq = await lim.next('dq');
  assert.ok('answered' in fdq && 'extra' in fdq);
  assert.ok(!('answered' in ldq) && !('extra' in ldq)); assert.ok(Array.isArray(ldq.counts));
  a.send({ t: 'an', i: 0, c: 0, e: 500 });
  await full.next('dp');
  await sleep(100);
  assert.ok(!lim.msgs.some(m => m.t === 'dp' || m.t === 'sup'), 'no progress or support to a limited co-host');
  // support: refused for the limited co-host, told why; the full co-host may
  lim.send({ t: 'h', a: 'acc', n: a.join.seat, x: 150, ra: 0, sv: 0 });
  assert.equal((await lim.next('nak')).why, 'notAllowed');
  assert.equal(s.seats.get(a.join.seat).acc, null);
  full.send({ t: 'h', a: 'acc', n: a.join.seat, x: 150, ra: 0, sv: 0 });
  await full.next('sup');
  assert.equal(s.seats.get(a.join.seat).acc.time, 150);
  await full.next('act', m => m.a === 'acc');
  await sleep(80);
  assert.ok(!lim.msgs.some(m => m.t === 'act' && m.a === 'acc'), 'support changes are student detail');
  // the account-names setting is not the limited co-host's to switch on
  lim.send({ t: 'cf', d: { names: 'names' } }); await sleep(80);
  assert.equal(s.settings.names, 'nicknames');
  full.send({ t: 'h', a: 'end', sure: 1 }); await a.next('ph', m => m.phase === 'ended');
  // results: the class-safe part for the limited co-host; details and CSV for the full one
  const lr = await call(`/live/results/${s.id}`, { user: teacher2 });
  assert.equal(lr.status, 200);
  assert.ok(!lr.text.includes('id="lv-details"')); assert.ok(lr.text.includes('id="lv-limited-note"'));
  assert.ok(!lr.text.includes(miaName));
  assert.equal((await call(`/live/results/${s.id}.csv`, { user: teacher2 })).status, 404);
  const fr = await call(`/live/results/${s.id}`, { user: ann });
  assert.ok(fr.text.includes('id="lv-details"'));
  assert.equal((await call(`/live/results/${s.id}.csv`, { user: ann })).status, 200);
  close(h, a, full, lim);
});

test('no adult names reach a player or a frame: players never get ch, act or nak; the page never relays them into the game frame', async () => {
  const s = classRoom();
  await makeCohost(s, teacher2);
  const h = await hostSocket(s, teacher), d = await dashOf(s, teacher2);
  const a = await player(s, mia);
  assert.ok(h.wel.ch && h.wel.ch.list.some(r => r[1] === 'Tom Teacher'), 'the host page has the adults');
  await toPlaying(s, h, a);
  d.send({ t: 'h', a: 'pause' }); await h.next('act', m => m.a === 'pause');
  d.send({ t: 'h', a: 'pause' }); await d.next('nak');
  await sleep(100);
  for (const m of a.msgs) assert.ok(!['ch', 'act', 'nak'].includes(m.t), `a player got ${m.t}`);
  assert.ok(!JSON.stringify(a.msgs).includes('Tom Teacher'));
  assert.ok(!('ctl' in a.wel) && !('ch' in a.wel));
  const src = fs.readFileSync(new URL('../../public/js/live-common.js', import.meta.url), 'utf8');
  const priv = /PRIVATE = new Set\(\[([^\]]*)\]\)/.exec(src)[1];
  for (const t of ['ch', 'act', 'nak']) assert.ok(priv.includes(`'${t}'`), `${t} is PRIVATE`);
  assert.match(src, /const \{ frame, lobbyFrame, code, dp, sup, dq, ctl, ch, acts, \.\.\.rest \} = m;/, 'wel is stripped of ctl, ch and acts');
  close(h, d, a);
});

test('serialized actions: two co-hosts pause at once -> one act, the other told "already" with who; a different controller can\'t undo within the conflict window; the same one can; act.i rises', async () => {
  const s = classRoom();
  await makeCohost(s, teacher2); await makeCohost(s, ann);
  const h = await hostSocket(s, teacher), d1 = await dashOf(s, teacher2), d2 = await dashOf(s, ann);
  const a = await player(s, mia);
  await toPlaying(s, h, a);
  d1.send({ t: 'h', a: 'pause' }); d2.send({ t: 'h', a: 'pause' });
  const nak = await d2.next('nak');
  assert.equal(nak.why, 'already'); assert.equal(nak.by, d1.wel.ctl.me);
  await sleep(80);
  assert.equal(h.msgs.filter(m => m.t === 'act' && m.a === 'pause').length, 1);
  // ann resumes within the window: conflict
  d2.send({ t: 'h', a: 'resume' });
  const c = await d2.next('nak', m => m.why === 'conflict');
  assert.equal(c.by, d1.wel.ctl.me);
  assert.equal(s.phase, 'paused');
  // Tom undoes his own at once
  d1.send({ t: 'h', a: 'resume' }); await a.next('ph', m => m.phase === 'playing');
  // next from two surfaces with the same seq: one step
  const at = s.seq;
  h.send({ t: 'h', a: 'next', at }); d1.send({ t: 'h', a: 'next', at });
  await a.next('rv');
  await sleep(120);
  assert.equal(h.msgs.filter(m => m.t === 'act' && m.a === 'next').length, 1);
  const is = h.msgs.filter(m => m.t === 'act').map(m => m.i);
  assert.deepEqual(is, [...is].sort((x, y) => x - y)); assert.equal(new Set(is).size, is.length);
  close(h, d1, d2, a);
});

test('removal mid-game: the co-host\'s sockets close (4403), the game goes on, the others see "removed", the projector slot frees', async () => {
  const s = classRoom();
  await makeCohost(s, teacher2);
  const d = await dashOf(s, teacher2);
  // the projector slot is free: the co-host takes it
  const proj = socket({ cookie: cookieFor(teacher2.id) });
  proj.wel = await proj.hello(LS.ctlToken(s, teacher2.id));
  assert.equal(s.projBy, teacher2.id);
  const hd = await dashOf(s, teacher);
  const a = await player(s, mia);
  await toPlaying(s, hd, a);
  const r = await call(`/api/live/cohost/${s.id}`, { method: 'POST', user: teacher, body: { a: 'remove', userId: teacher2.id } });
  assert.equal(r.status, 200);
  assert.equal(await d.closed, 4403); assert.equal(await proj.closed, 4403);
  assert.equal(s.host.conn, null); assert.equal(s.projBy, null);
  const act = await hd.next('act', m => m.a === 'removed');
  assert.equal(act.by, hd.wel.ctl.me);
  assert.equal(s.phase, 'playing', 'the game goes on');
  hd.send({ t: 'h', a: 'pause' }); await a.next('ph', m => m.phase === 'paused');
  close(hd, a);
});

test('the projector slot: a co-host is refused while the host\'s projector is on (projectorBusy), takes it when free, and the host takes it back; frame tokens follow the holder', async () => {
  const s = classRoom();
  await makeCohost(s, teacher2);
  const h = await hostSocket(s, teacher);
  const busy = socket({ cookie: cookieFor(teacher2.id) });
  await busy.opened; busy.send({ t: 'hello', v: 1, tok: LS.ctlToken(s, teacher2.id) });
  assert.equal((await busy.next('bye')).why, 'projectorBusy');
  assert.equal(await busy.closed, 4409);
  assert.equal(s.projBy, teacher.id);
  h.ws.close(); await h.closed; await sleep(30);
  const c = socket({ cookie: cookieFor(teacher2.id) });
  c.wel = await c.hello(LS.ctlToken(s, teacher2.id));
  assert.equal(s.projBy, teacher2.id);
  // its frame token is the co-host's, and loads for that account only
  const tok = c.wel.frame;
  assert.equal((await call(`/live/frame/${tok}`, { user: teacher2 })).status, 200);
  assert.equal((await call(`/live/frame/${tok}`, { user: teacher })).status, 403);
  // the host comes back: the co-host's projector is replaced
  const h2 = await hostSocket(s, teacher);
  assert.equal((await c.next('bye')).why, 'replaced');
  assert.equal(s.projBy, teacher.id);
  assert.equal((await call(`/live/frame/${h2.wel.frame}`, { user: teacher })).status, 200);
  close(h2);
});

test('handoff: the host gone past the grace -> the longest-standing connected co-host is host (and may manage co-hosts); the old host\'s page comes back as a co-host; Make host swaps back; with no co-hosts the session ends as before', async () => {
  LS.hooks.handoffMs = 150;
  const s = classRoom();
  await makeCohost(s, teacher2); await sleep(5); await makeCohost(s, ann);
  const h = await hostSocket(s, teacher);
  const d1 = await dashOf(s, teacher2), d2 = await dashOf(s, ann);
  const a = await player(s, mia);
  await toPlaying(s, h, a);
  const oldTok = LS.hostToken(s);
  h.ws.close();
  await d1.next('act', m => m.a === 'away');
  const w = await d1.next('wel', m => m.ctl && m.ctl.role === 'host', 3000);
  assert.equal(w.ctl.tier, 'limited', 'the tier stays with the person');
  assert.equal(s.host.userId, teacher2.id); assert.equal(s.owner, teacher.id);
  assert.equal(LS.hostSession(teacher2.id), s);
  await d2.next('act', m => m.a === 'host');
  assert.equal(LS.roleOf(s, teacher.id), 'cohost');
  // the new host manages co-hosts; the old one can't
  assert.equal((await call(`/api/live/cohost/${s.id}`, { user: teacher2 })).status, 200);
  assert.equal((await call(`/api/live/cohost/${s.id}`, { user: teacher })).status, 404);
  // the old host's page reconnects with its old token, as a co-host
  const back = socket({ cookie: cookieFor(teacher.id) });
  await back.opened; back.send({ t: 'hello', v: 1, tok: oldTok, view: 'dash' });
  const bw = await back.next('wel');
  assert.equal(bw.ctl.role, 'cohost'); assert.equal(bw.ctl.tier, 'full');
  assert.ok(bw.dp, 'still a teacher of the class: student details');
  // Make host: back to the class's teacher
  const mk = await call(`/api/live/cohost/${s.id}`, { method: 'POST', user: teacher2, body: { a: 'host', userId: teacher.id } });
  assert.equal(mk.status, 200);
  assert.equal(s.host.userId, teacher.id); assert.equal(LS.roleOf(s, teacher2.id), 'cohost');
  assert.equal(s.cohosts.size + s.invites.size, 2, 'the cap is unchanged');
  // the run is saved for the owner, as a class run with scores
  back.send({ t: 'h', a: 'end' }); await a.next('ph', m => m.phase === 'ended');
  const run = q.get('SELECT * FROM live_runs WHERE id=?', s.id);
  assert.equal(run.host_id, teacher.id); assert.equal(run.class_id, cls.id);
  assert.ok(q.get('SELECT 1 FROM live_run_scores WHERE run_id=? AND user_id=?', s.id, mia.id));
  close(d1, d2, a, back);
});

test('handoff edge cases: a co-host hosting another open game is skipped; no connected co-host -> nobody; the session doesn\'t end while a co-host is connected, and ends after the last controller leaves', async () => {
  LS.hooks.handoffMs = 100;
  const s = classRoom();
  await makeCohost(s, teacher2); await sleep(5); await makeCohost(s, ann);
  const mine = open(teacher2, { mode: 'battle', items: items(1), audience: 'open' });
  const h = await hostSocket(s, teacher);
  const d1 = await dashOf(s, teacher2), d2 = await dashOf(s, ann);
  h.ws.close();
  await d2.next('wel', m => m.ctl && m.ctl.role === 'host', 3000);
  assert.equal(s.host.userId, ann.id, 'Tom hosts another open game: skipped');
  LS.endSession(mine.id);
  // everyone away: the session runs on hostGoneMs after the last controller leaves
  d1.ws.close(); d2.ws.close(); await d1.closed; await d2.closed; await sleep(30);
  assert.ok(s.ctlGoneAt > 0);
  const was = LS.hooks.hostGoneMs; LS.hooks.hostGoneMs = 0;
  try { await sleep(5); LS.sweep(); } finally { LS.hooks.hostGoneMs = was; }
  assert.equal(s.phase, 'ended');
  // no co-hosts at all: today's behaviour (no handoff, no act)
  const s2 = classRoom();
  const h2 = await hostSocket(s2, teacher);
  h2.ws.close(); await h2.closed; await sleep(150);
  assert.equal(s2.host.userId, teacher.id);
  assert.equal(s2.acts.length, 0);
  assert.ok(LS.hostGone(s2));
});

test('a co-host who leaves the school mid-game stops at the next sweep; a co-host may leave; a family room join still works after a handoff (the owner\'s family)', async () => {
  const s = classRoom();
  await makeCohost(s, ada);
  const d = await dashOf(s, ada);
  q.run("UPDATE school_members SET status='left' WHERE school_id=? AND user_id=?", school.id, ada.id);
  LS.sweep();
  assert.equal(await d.closed, 4403);
  assert.equal(LS.roleOf(s, ada.id), null);
  q.run("UPDATE school_members SET status='active' WHERE school_id=? AND user_id=?", school.id, ada.id);
  // leaving
  await makeCohost(s, teacher2);
  const lv = await call(`/api/live/cohost/${s.id}/leave`, { method: 'POST', user: teacher2, body: {} });
  assert.equal(lv.status, 200); assert.equal(LS.roleOf(s, teacher2.id), null);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='live.cohost.leave' AND target=?", s.id));
  // the family check uses the owner, whoever hosts now
  const f = { audience: 'family', owner: mum.id, host: { userId: mum2.id } };
  q.run("INSERT OR IGNORE INTO families(id, owner_id, created_at) VALUES ('famD', ?, ?)", mum.id, Date.now());
  const fam = q.get('SELECT id FROM families WHERE owner_id=?', mum.id);
  q.run("INSERT OR IGNORE INTO family_children(family_id, child_id, status, requested_at, linked_at) VALUES (?, ?, 'linked', ?, 1)", fam.id, kid.id, Date.now());
  assert.deepEqual(A.joinCheck(f, kid), { ok: true, kind: 'member' });
});

test('audit: the run\'s log is saved only for runs that had a co-host, with class students as targets; deletion, retention, leaving the class and account merges follow live_runs', async () => {
  const s = classRoom();
  await makeCohost(s, teacher2);
  const h = await hostSocket(s, teacher), d = await dashOf(s, teacher2);
  const a = await player(s, mia), b = await player(s, leo);
  await toPlaying(s, h, a, b);
  d.send({ t: 'h', a: 'pause' }); await a.next('ph', m => m.phase === 'paused');
  d.send({ t: 'h', a: 'kick', n: b.join.seat }); await b.next('bye');
  d.send({ t: 'h', a: 'end', sure: 1 }); await a.next('ph', m => m.phase === 'ended');
  const rows = q.all('SELECT * FROM live_run_log WHERE run_id=? ORDER BY i', s.id);
  const acts = rows.map(r => r.action);
  for (const x of ['invited', 'joined', 'pause', 'kick', 'end']) assert.ok(acts.includes(x), `logged ${x}`);
  const kick = rows.find(r => r.action === 'kick');
  assert.equal(kick.actor_id, teacher2.id); assert.equal(kick.target_user, leo.id);
  assert.equal(rows.find(r => r.action === 'invited').other_id, teacher2.id);
  // the saved run shows "Who ran this game"
  const page = await call(`/live/results/nope-${s.id}`, { user: teacher });
  assert.equal(page.status, 404);
  LS._all().delete(s.id);
  const saved = await call(`/live/results/${s.id}`, { user: teacher });
  assert.match(saved.text, /id="lv-run-log"/);
  assert.match(saved.text, /Tom Teacher removed Leo Pupil/);
  // a run with no co-host: nothing logged
  const s2 = classRoom();
  const h2 = await hostSocket(s2, teacher), a2 = await player(s2, mia);
  await toPlaying(s2, h2, a2);
  h2.send({ t: 'h', a: 'end' }); await a2.next('ph', m => m.phase === 'ended');
  assert.equal(q.get('SELECT COUNT(*) n FROM live_run_log WHERE run_id=?', s2.id).n, 0);
  // a student leaves the class: their name comes off the log
  R.forgetClassData({ classId: cls.id, userId: leo.id });
  assert.equal(q.get("SELECT target_user FROM live_run_log WHERE run_id=? AND action='kick'", s.id).target_user, null);
  // a school account merged into the student's own account: the log moves with it
  q.run("INSERT INTO live_run_log(run_id, i, at, actor_id, action, target_user, other_id, detail) VALUES (?, 999, 1, ?, 'rename', ?, NULL, '')", s.id, teacher2.id, mia.id);
  R.mergeLiveData({ from: mia.id, into: kid.id });
  assert.equal(q.get('SELECT target_user FROM live_run_log WHERE run_id=? AND i=999', s.id).target_user, kid.id);
  q.run('DELETE FROM live_run_log WHERE run_id=? AND i=999', s.id);
  // a co-host's account deleted: "A former co-host"
  R.forgetUser(teacher2.id);
  assert.equal(q.get("SELECT COUNT(*) n FROM live_run_log WHERE actor_id=? OR other_id=?", teacher2.id, teacher2.id).n, 0);
  LS._all().delete(s.id);
  assert.match((await call(`/live/results/${s.id}`, { user: teacher })).text, /A former co-host paused the game/);
  // retention: a classless run's log goes with it
  q.run('UPDATE live_runs SET class_id=NULL, ended_at=0 WHERE id=?', s.id);
  R.retention();
  assert.equal(q.get('SELECT COUNT(*) n FROM live_run_log WHERE run_id=?', s.id).n, 0);
  assert.ok(q.get("SELECT 1 FROM migrations WHERE name='0041_live_cohost'"));
  close(h, d, a, h2, a2);
});

test('the protocol: end carries sure: 1 only; the new bye reasons', () => {
  assert.deepEqual(P.parse(JSON.stringify({ t: 'h', a: 'end', sure: 1 }), 'host'), { t: 'h', a: 'end', sure: 1 });
  assert.deepEqual(P.parse(JSON.stringify({ t: 'h', a: 'end', sure: 'yes' }), 'host'), { t: 'h', a: 'end' });
  assert.deepEqual(P.parse(JSON.stringify({ t: 'h', a: 'pause', sure: 1 }), 'host'), { t: 'h', a: 'pause' });
  assert.ok(P.BYE.includes('cohostOff') && P.BYE.includes('projectorBusy'));
});

test('LIVE_COHOST=0: the APIs and the invite page answer 404, no ch or act, a co-host token is refused (4401)', async () => {
  const s = classRoom();
  await makeCohost(s, teacher2);
  const tok = LS.ctlToken(s, teacher2.id);
  config.liveCohost = false;
  try {
    assert.equal((await call(`/api/live/cohost/${s.id}`, { user: teacher })).status, 404);
    assert.equal((await call(`/api/live/cohost/${s.id}`, { method: 'POST', user: teacher, body: { a: 'invite', userId: ann.id } })).status, 404);
    assert.equal((await call(`/live/cohost/${s.id}`, { user: teacher2 })).status, 404);
    const h = await hostSocket(s, teacher);
    assert.equal(h.wel.ctl, undefined); assert.equal(h.wel.ch, undefined);
    const c = socket({ cookie: cookieFor(teacher2.id) });
    await c.opened; c.send({ t: 'hello', v: 1, tok, view: 'dash' });
    assert.equal(await c.closed, 4401);
    const host = await call(`/live/host/${s.id}`, { user: teacher });
    assert.ok(!host.text.includes('data-lv-act="cohosts"'));
    close(h);
  } finally { config.liveCohost = true; }
});

// ---------------------------------------------------------------- review fixes (regressions)
const offClass = u => q.run("UPDATE class_members SET status='left' WHERE class_id=? AND user_id=?", cls.id, u.id);
const onClass = u => q.run("UPDATE class_members SET status='active' WHERE class_id=? AND user_id=?", cls.id, u.id);

test('the tier follows access now: a class teacher taken off the class mid-game drops to limited at the sweep (fresh wel without dp/sup), on reconnect, at a support change, a handoff and the results', async () => {
  const s = classRoom();
  await makeCohost(s, ann);
  const d = await dashOf(s, ann);
  assert.equal(d.wel.ctl.tier, 'full'); assert.ok(d.wel.dp && d.wel.sup);
  const a = await player(s, mia);
  offClass(ann);
  try {
    assert.equal(A.controlTier(s, ann), 'limited', 'still staff of the school');
    LS.sweep();
    assert.equal(s.cohosts.get(ann.id).tier, 'limited', 'the stored tier fell');
    const w = await d.next('wel', m => m.ctl && m.ctl.tier === 'limited');
    assert.equal(w.dp, undefined); assert.equal(w.sup, undefined);
    // a support change is refused at once (the live tier), even before a sweep
    onClass(ann); LS.sweep(); assert.equal(s.cohosts.get(ann.id).tier, 'full');
    offClass(ann);
    d.send({ t: 'h', a: 'acc', n: a.join.seat, x: 150, ra: 0, sv: 0 });
    assert.equal((await d.next('nak', m => m.a === 'acc')).why, 'notAllowed');
    assert.equal(s.cohosts.get(ann.id).tier, 'limited');
    // reconnecting: a limited wel
    onClass(ann); LS.sweep(); offClass(ann);
    const d2 = await dashOf(s, ann);
    assert.equal(d2.wel.ctl.tier, 'limited'); assert.equal(d2.wel.dp, undefined);
    // a handoff: the new host takes their access as it is now
    onClass(ann); LS.sweep(); offClass(ann);
    assert.equal(s.cohosts.get(ann.id).tier, 'full', 'stored full again (no sweep since)');
    assert.ok(LS.promote(s, ann.id, 'made'));
    assert.equal(s.host.tier, 'limited');
    // the end: results by the access now
    onClass(ann); LS.sweep(); offClass(ann);
    LS.endSession(s.id);
    assert.equal(s.endCtl.get(ann.id), 'limited');
    close(d, d2, a);
  } finally { onClass(ann); }
});

test('the projector page\'s wel never carries support changes (acc acts), even with the host\'s full tier; dashboards of full tier do', async () => {
  const s = classRoom();
  await makeCohost(s, ann);
  const d = await dashOf(s, ann);
  const a = await player(s, mia);
  d.send({ t: 'h', a: 'acc', n: a.join.seat, x: 150, ra: 0, sv: 0 });
  await d.next('act', m => m.a === 'acc');
  const h = await hostSocket(s, teacher);
  assert.ok(Array.isArray(h.wel.acts));
  assert.ok(!h.wel.acts.some(x => x.a === 'acc'), 'not on the class\'s screen');
  const hd = await dashOf(s, teacher);
  assert.ok(hd.wel.acts.some(x => x.a === 'acc'), 'the host\'s Teacher view has it');
  close(d, a, h, hd);
});

test('eyes up and resume move each other: a co-host\'s resume right after the host\'s eyes up is a conflict; "already" never names a stale adult', async () => {
  const s = classRoom();
  await makeCohost(s, teacher2); await makeCohost(s, ann);
  const h = await dashOf(s, teacher), d1 = await dashOf(s, teacher2), d2 = await dashOf(s, ann);
  const a = await player(s, mia);
  s.settings.autoLock = true;   // the room locks itself at start (no adult did it)
  await toPlaying(s, h, a);
  h.send({ t: 'h', a: 'eyes', on: true }); await a.next('ph', m => m.phase === 'paused');
  d1.send({ t: 'h', a: 'resume' });
  const c = await d1.next('nak', m => m.a === 'resume');
  assert.equal(c.why, 'conflict'); assert.equal(c.by, h.wel.ctl.me);
  assert.equal(s.phase, 'paused'); assert.equal(s.eyes, true, 'the host\'s eyes up stays');
  // Tom presses Pause: "already", and it names the host (whose eyes up paused it), not someone earlier
  d1.send({ t: 'h', a: 'pause' });
  const al = await d1.next('nak', m => m.a === 'pause');
  assert.equal(al.why, 'already'); assert.equal(al.by, h.wel.ctl.me);
  // the automatic lock at start: "already" names nobody
  d2.send({ t: 'h', a: 'lock' });
  const lk = await d2.next('nak', m => m.a === 'lock');
  assert.equal(lk.why, 'already'); assert.equal(lk.by, undefined);
  close(h, d1, d2, a);
});

test('a second adult\'s bonus or message within the session\'s gap is told who just did it (nak tooSoon); their own repeat gets wait', async () => {
  const s = classRoom();
  await makeCohost(s, ann);
  const h = await dashOf(s, teacher), d = await dashOf(s, ann);
  const a = await player(s, mia);
  h.send({ t: 'h', a: 'bonus', n: a.join.seat, r: 0 }); await a.next('bn');
  d.send({ t: 'h', a: 'bonus', n: a.join.seat, r: 0 });
  const n = await d.next('nak', m => m.a === 'bonus');
  assert.equal(n.why, 'tooSoon'); assert.equal(n.by, h.wel.ctl.me);
  h.send({ t: 'h', a: 'say', m: 0 }); await a.next('say');
  h.send({ t: 'h', a: 'say', m: 1 });
  const w = await h.next('nak', m => m.a === 'say');
  assert.equal(w.why, 'wait'); assert.equal(w.by, undefined);
  assert.ok(P.NAK.includes('tooSoon') && P.NAK.includes('wait'));
  close(h, d, a);
});

test('+time from two adults on the same question adds once; the second is told who already did', async () => {
  const s = classRoom();
  await makeCohost(s, ann);
  const h = await dashOf(s, teacher), d = await dashOf(s, ann);
  const a = await player(s, mia);
  await toPlaying(s, h, a);
  const secs = s.qz.cur.secs, add = P.ADD_SECS[0];
  h.send({ t: 'h', a: 'time', s: add }); d.send({ t: 'h', a: 'time', s: add });
  const n = await d.next('nak', m => m.a === 'time');
  assert.equal(n.why, 'already'); assert.equal(n.by, h.wel.ctl.me);
  assert.equal(s.qz.cur.secs, secs + add, 'added once');
  // the same adult may add more
  h.send({ t: 'h', a: 'time', s: add }); await h.next('act', m => m.a === 'time' && m.i > 0);
  await sleep(80);
  assert.equal(s.qz.cur.secs, secs + 2 * add);
  close(h, d, a);
});

test('an account deleted while the game is open is never written back into the run\'s log', async () => {
  const s = classRoom();
  await makeCohost(s, teacher2);
  const h = await hostSocket(s, teacher), d = await dashOf(s, teacher2);
  const a = await player(s, mia);
  await toPlaying(s, h, a);
  d.send({ t: 'h', a: 'pause' }); await a.next('ph', m => m.phase === 'paused');
  // the deletion's tombstone, and forgetUser (account-delete.js does both)
  const was = q.get('SELECT username FROM users WHERE id=?', teacher2.id).username;
  q.run('UPDATE users SET username=? WHERE id=?', `deleted_${teacher2.id}`, teacher2.id);
  try {
    R.forgetUser(teacher2.id);
    h.send({ t: 'h', a: 'end' }); await a.next('ph', m => m.phase === 'ended');
    assert.equal(q.get('SELECT COUNT(*) n FROM live_run_log WHERE actor_id=? OR other_id=? OR target_user=?', teacher2.id, teacher2.id, teacher2.id).n, 0);
    assert.ok(q.get("SELECT 1 FROM live_run_log WHERE run_id=? AND action='pause' AND actor_id IS NULL", s.id), 'the action stays, nameless');
  } finally { q.run('UPDATE users SET username=? WHERE id=?', was, teacher2.id); }
  close(h, d, a);
});

test('ch.past keeps a removed co-host\'s and a cancelled invitee\'s names for the activity line (also in a fresh wel)', async () => {
  const s = classRoom();
  await makeCohost(s, teacher2);
  const inv = await call(`/api/live/cohost/${s.id}`, { method: 'POST', user: teacher, body: { a: 'invite', userId: ann.id } });
  assert.equal(inv.status, 200);
  assert.equal((await call(`/api/live/cohost/${s.id}`, { method: 'POST', user: teacher, body: { a: 'cancel', userId: ann.id } })).status, 200);
  assert.equal((await call(`/api/live/cohost/${s.id}`, { method: 'POST', user: teacher, body: { a: 'remove', userId: teacher2.id } })).status, 200);
  const hd = await dashOf(s, teacher);
  const past = new Map(hd.wel.ch.past || []);
  assert.equal(past.get(LS.refOf(s, teacher2.id)), 'Tom Teacher');
  assert.equal(past.get(LS.refOf(s, ann.id)), 'Ann Teacher');
  assert.ok(!hd.wel.ch.list.some(r => r[1] === 'Tom Teacher'));
  close(hd);
});
