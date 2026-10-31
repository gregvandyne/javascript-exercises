// Oomba Live pages (routes/live.js, views/live.js): one /join for live codes and class codes, nothing sold on player
// pages, no profile links in the host's roster, the landing for hosts only, traffic never counted, the flag.
import { reset, call, open, config, teacher, mum, kid, mia, LS } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const traffic = await import('../../server/services/traffic.js');
const { q } = await import('../../server/db.js');
const SOLD = /plans|price|€|\$|upgrade|checkout|subscribe/i;
const visible = html => html.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, '');

test.beforeEach(() => reset());

test('/join: one code box (live 7 digits, class codes go on); live codes move to the #fragment; bare page, nothing sold', async () => {
  const r = await call('/join');
  assert.equal(r.status, 200);
  assert.match(r.text, /id="jc" name="code"/); assert.match(r.text, /inputmode="numeric"/);
  assert.match(r.text, /data-lv-join/); assert.match(r.text, /id="lv-card-step" hidden/);
  assert.doesNotMatch(r.text, /class="topbar"|class="foot"/, 'no menus, no footer');
  assert.doesNotMatch(visible(r.text), SOLD);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.getSetCookie().length, 0, 'no cookie for a visitor');
  const data = JSON.parse(r.text.match(/id="lv-join-data">(.*?)<\/script>/)[1]);
  assert.equal(data.nicks.length, 144); assert.ok(data.msgs.notFound);
  const fwd = await call('/join?code=482%209137');
  assert.equal(fwd.status, 302); assert.equal(fwd.headers.get('location'), '/join#4829137');
  assert.equal((await call('/join/4829137')).headers.get('location'), '/join#4829137');
  // Google sign-in off: a class code has nowhere to go, so the page says the code looks wrong.
  const cls = await call('/join?code=ABC234');
  assert.equal(cls.status, 200); assert.match(cls.text, /7 numbers/);
});

test('flag off: /join is the class flow only (404 without Google), live pages and APIs 404, no section on /parents', async () => {
  config.liveClassroom = false;
  assert.equal((await call('/join')).status, 404);
  assert.equal((await call('/live', { user: teacher })).status, 404);
  assert.equal((await call('/api/live/join', { method: 'POST', body: { code: '1234567' } })).status, 404);
  assert.doesNotMatch((await call('/parents')).text, /id="live"/);
  assert.doesNotMatch((await call('/teachers')).text, /id="live"/);
  config.liveClassroom = true;
  assert.match((await call('/parents')).text, /id="live"/);
  assert.match((await call('/teachers')).text, /id="live"/);
});

test('/live: hosts only (others go to /join); the landing posts to /api/live/sessions and opens the host page', async () => {
  assert.equal((await call('/live', { user: kid })).headers.get('location'), '/join');
  assert.equal((await call('/live', { user: mia })).headers.get('location'), '/join');
  const page = await call('/live', { user: teacher });
  assert.equal(page.status, 200); assert.match(page.text, /data-api="\/api\/live\/sessions"/); assert.match(page.text, /value="mode:quest-race"/);
  assert.match(page.text, /value="starter:math-8"/);
  const r = await call('/api/live/sessions', { method: 'POST', user: teacher, body: { pick: 'mode:quest-race', set: 'starter:science', audience: 'open', maxPlayers: '20' } });
  assert.equal(r.status, 200, r.text); assert.match(r.json.redirect, /^\/live\/host\//);
  const again = await call('/api/live/sessions', { method: 'POST', user: teacher, body: { pick: 'mode:battle', set: 'starter:geo', audience: 'open' } });
  assert.equal(again.status, 409); assert.equal(again.json.code, 'hasOpen'); assert.ok(again.json.error);
  assert.equal((await call('/api/live/sessions', { method: 'POST', user: kid, body: { pick: 'mode:battle' } })).status, 404);
  const s = LS.get(r.json.sid);
  assert.equal(s.settings.maxPlayers, 20);
  // The host page: code (left to right, grouped), QR, roster without links, controls with keyboard shortcuts.
  const host = await call(r.json.redirect, { user: teacher });
  assert.equal(host.status, 200);
  assert.match(host.text, new RegExp(`<p class="lv-bigcode" id="lv-code" dir="ltr" translate="no">${s.code.slice(0, 3)} ${s.code.slice(3)}</p>`));
  assert.match(host.text, /<svg[^>]+shape-rendering="crispEdges"/);
  assert.match(host.text, /data-lv-act="start" aria-keyshortcuts="S"/);
  const roster = host.text.match(/<section class="lv-rosterbox"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(roster, /<a\b/, 'no links in the roster');
  assert.equal((await call(r.json.redirect, { user: mum })).status, 404, 'only the host');
});

test('/live/play: bare, nothing sold, fixed report reasons, emotes are buttons', async () => {
  const s = open(teacher, { mode: 'battle', starter: 'geo', audience: 'open' });
  const r = await call(`/live/play/${s.id}`);
  assert.equal(r.status, 200);
  assert.doesNotMatch(visible(r.text), SOLD);
  assert.doesNotMatch(r.text, /class="topbar"|class="foot"/);
  assert.equal((r.text.match(/data-report="/g) || []).length, 4);
  assert.equal((r.text.match(/data-emote="/g) || []).length, 6);
  assert.doesNotMatch(r.text, /<textarea|type="text"/, 'nothing to type');
  assert.equal((await call('/live/play/nope')).status, 404);
});

test('reports: fixed reasons, never who sent them; the host hears about it', async () => {
  const s = open(teacher, { mode: 'battle', starter: 'geo', audience: 'open' });
  const j = await call('/api/live/join', { method: 'POST', body: { code: s.code } });
  assert.equal((await call('/api/live/report', { method: 'POST', body: { tok: j.json.tok, reason: 'rude words here' } })).status, 400);
  const r = await call('/api/live/report', { method: 'POST', body: { tok: j.json.tok, reason: 'scary' } });
  assert.equal(r.status, 200);
  const row = q.get('SELECT * FROM live_reports ORDER BY created_at DESC LIMIT 1');
  assert.equal(row.reason, 'scary'); assert.equal(row.host_id, teacher.id);
  assert.ok(!JSON.stringify(row).includes(j.json.tok.slice(0, 16)));
  assert.deepEqual(Object.keys(row).sort(), ['created_at', 'game_id', 'host_id', 'id', 'items', 'reason', 'resolved_at', 'resolved_by', 'set_id', 'version_id']);
  for (let i = 0; i < 2; i++) await call('/api/live/report', { method: 'POST', body: { tok: j.json.tok, reason: 'other' } });
  assert.equal((await call('/api/live/report', { method: 'POST', body: { tok: j.json.tok, reason: 'other' } })).status, 429);
});

test('visits to /join and /live are never counted', () => {
  for (const p of ['/join', '/live', '/live/play/x', '/live/host/x']) {
    let counted = true;
    traffic.countVisits({ method: 'GET', path: p, headers: { accept: 'text/html' } }, {}, () => { counted = false; });
    assert.equal(counted, false, p);
  }
});

test('question sets: hosts make, list and archive them; rude or personal text is refused; drafts from a lesson can\'t be hosted', async () => {
  const bad = await call('/api/live/sets', { method: 'POST', user: teacher, body: { title: 'Mine', items: [{ q: 'Call me on 555 123 4567', choices: ['a', 'b'], answer: 0, secs: 20 }] } });
  assert.equal(bad.status, 400); assert.equal(bad.json.code, 'question'); assert.match(bad.json.error, /1/);
  const same = await call('/api/live/sets', { method: 'POST', user: teacher, body: { title: 'Mine', items: [{ q: 'Pick', choices: ['a', 'A'], answer: 0, secs: 20 }] } });
  assert.equal(same.json.code, 'sameChoice');
  const ok = await call('/api/live/sets', { method: 'POST', user: teacher, body: { title: 'Fractions', items: [{ q: 'Half of 8?', choices: ['4', '2', '6'], answer: 0, secs: 20 }] } });
  assert.equal(ok.status, 200);
  const list = await call('/api/live/sets', { user: teacher });
  assert.equal(list.json.mine[0].title, 'Fractions'); assert.equal(list.json.mine[0].ready, true);
  assert.equal((await call(`/api/live/sets/${ok.json.id}`, { user: mum })).status, 404, 'not someone else\'s');
  const s = LS.createSession(teacher, { mode: 'battle', setId: ok.json.id, audience: 'open' });
  assert.ok(s.ok); assert.equal(s.session.items[0].q, 'Half of 8?');
  assert.equal((await call(`/api/live/sets/${ok.json.id}/archive`, { method: 'POST', user: teacher })).status, 200);
});
