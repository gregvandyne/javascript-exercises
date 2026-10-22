// Friends-only chat rules (services/chat.js) plus the HTTP layer.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
const { q, today } = await import('../../server/db.js');
const { config } = await import('../../server/config.js');
const { createUser, createGuest, startSession } = await import('../../server/auth.js');
const friends = await import('../../server/services/friends.js');
const chat = await import('../../server/services/chat.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');

let n = 0;
const mk = (p = 'Kid') => createUser({ username: `${p}${++n}`, password: 'secret123' });
const befriend = (a, b) => { friends.addByCode(a, b.friend_code); friends.accept(b, a.id); };
const pair = () => { const a = mk('Ann'), b = mk('Bo'); befriend(a, b); return [a, b]; };
const fresh = u => q.get('SELECT * FROM users WHERE id=?', u.id);
const clearRate = u => q.run('UPDATE chat_messages SET created_at=created_at-60000 WHERE from_id=?', u.id);
function cookieFor(userId) { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, userId); return c; }
function mkGame(owner, visibility) {
  const g = games.createGame(owner.id, { title: `G ${visibility} ${++n}` });
  const v = games.addVersion(g.id, '<div>x</div>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET visibility=?, status='published', published_version_id=? WHERE id=?", visibility, v.id, g.id);
  return games.getGame(g.id);
}

let server, base;
before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());

test('friends can chat; messages arrive in the thread and inbox, read marks work', () => {
  const [a, b] = pair();
  const r = chat.send(a, b, { body: '  hi   there\u0007  ' });
  assert.equal(r.ok, true); assert.equal(r.message.body, 'hi there');
  const t = chat.thread(b, a);
  assert.equal(t.length, 1); assert.equal(t[0].mine, false);
  const ib = chat.inbox(b);
  assert.equal(ib[0].unread, 1); assert.equal(ib[0].preview, 'hi there');
  chat.markRead(b, a);
  assert.equal(chat.inbox(b)[0].unread, 0);
  // polling with after only returns newer (inclusive, de-duped by client)
  const at = t[0].at;
  chat.send(b, a, { kind: 'quick', body: 'Nice job!' });
  const newer = chat.thread(a, b, { after: at });
  assert.ok(newer.some(m => m.body === 'Nice job!'));
});

test('non-friends, pending friends, guests and self cannot message', () => {
  const a = mk(), b = mk(), c = mk();
  assert.equal(chat.send(a, b, { body: 'hello' }).code, 'not_friends');
  friends.addByCode(a, c.friend_code); // pending only
  assert.equal(chat.send(a, c, { body: 'hello' }).code, 'not_friends');
  const g = createGuest();
  assert.equal(chat.send(g, a, { body: 'hello' }).code, 'guest');
  assert.equal(chat.send(a, g, { body: 'hello' }).ok, false);
  assert.equal(chat.send(a, a, { body: 'hello' }).ok, false);
  assert.equal(q.get('SELECT COUNT(*) n FROM chat_messages WHERE from_id=?', a.id).n, 0);
});

test('blocked users cannot message either way; thread is hidden both ways; unblock restores', () => {
  const [a, b] = pair();
  chat.send(a, b, { body: 'before block' });
  chat.block(b, a.id);
  assert.equal(chat.send(a, b, { body: 'hey' }).code, 'blocked_by_other');
  assert.equal(chat.send(b, a, { body: 'hey' }).code, 'blocked_by_me');
  assert.equal(chat.send(a, b, { kind: 'quick', body: '👋' }).ok, false);
  assert.equal(chat.thread(a, b).length, 0); assert.equal(chat.thread(b, a).length, 0);
  assert.equal(chat.inbox(a).length, 0); assert.equal(chat.inbox(b).length, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM chat_messages WHERE to_id=? AND read_at IS NULL', b.id).n, 0, 'no lingering badge');
  chat.unblock(b, a.id);
  assert.equal(chat.send(a, b, { body: 'friends again' }).ok, true);
});

test('chat switched off (Me page) or banned stops chat', () => {
  const [a, b] = pair();
  q.run('UPDATE users SET chat_enabled=0 WHERE id=?', b.id);
  assert.equal(chat.send(a, b, { body: 'yo' }).code, 'chat_off_other');
  assert.equal(chat.send(fresh(b), a, { body: 'yo' }).code, 'chat_off_me');
  q.run('UPDATE users SET chat_enabled=1, banned=1 WHERE id=?', b.id);
  assert.equal(chat.send(a, b, { body: 'yo' }).code, 'missing');
  assert.equal(chat.send(fresh(b), a, { body: 'yo' }).code, 'banned');
});

test('bad words and personal info are refused, not stored, and counted', () => {
  const [a, b] = pair();
  const bad = [
    ['you are a b1tch', 'words'], ['s h i t', 'words'],
    ['call me 555-123-4567', 'phone'], ['my number is 07700 900123', 'phone'], ['five five five one two three four', 'phone'],
    ['email me kid@example.com', 'email'], ['go to www.badsite.com', 'link'], ['https://x.io', 'link'],
    ['I live at 42 Maple Street', 'address'], ['add me on snap', 'contact'], ['what school do you go to', 'contact'], ['where do you live?', 'contact'],
  ];
  for (const [text, code] of bad) {
    clearRate(a);
    q.run('UPDATE chat_usage SET paused_until=0, blocked=0 WHERE user_id=?', a.id);
    const r = chat.send(a, b, { body: text });
    assert.equal(r.ok, false, text); assert.equal(r.blocked, true, text); assert.equal(r.code, code, text);
    assert.ok(r.error.length > 10);
  }
  assert.equal(q.get('SELECT COUNT(*) n FROM chat_messages WHERE from_id=?', a.id).n, 0);
  // innocent text still works
  for (const ok of ['I scored 1200 points!', 'lets play shark plank', 'that was a class game', 'hello 👋']) assert.equal(chat.send(a, b, { body: ok }).ok, true, ok);
  assert.equal(chat.send(a, b, { body: 'x'.repeat(201) }).code, 'long');
  assert.equal(chat.send(a, b, { body: '   ' }).code, 'empty');
});

test('quick phrases are always allowed (even while paused), others are not quick', () => {
  const [a, b] = pair();
  for (const p of ['Good game! 🎉', 'Want to play?', 'Nice job!', 'Brb!', '👋', '😂', '🔥', '🏆']) { clearRate(a); assert.equal(chat.send(a, b, { kind: 'quick', body: p }).ok, true, p); }
  assert.equal(chat.send(a, b, { kind: 'quick', body: 'call me 5551234567' }).code, 'quick');
  q.run('INSERT INTO chat_usage(user_id, day, paused_until) VALUES (?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET paused_until=excluded.paused_until', a.id, today(), Date.now() + 60e3);
  clearRate(a);
  assert.equal(chat.send(a, b, { body: 'hello' }).code, 'paused');
  assert.equal(chat.send(a, b, { kind: 'quick', body: 'Brb!' }).ok, true);
});

test('5 blocked attempts in a day pause text chat for 10 minutes', () => {
  const [a, b] = pair();
  for (let i = 0; i < 4; i++) assert.equal(chat.send(a, b, { body: 'my email is a@b.com' }).paused, undefined);
  const fifth = chat.send(a, b, { body: 'my email is a@b.com' });
  assert.ok(fifth.paused); assert.match(fifth.error, /break/);
  const p = chat.pausedUntil(a.id);
  assert.ok(p > Date.now() + 9 * 60e3 && p <= Date.now() + 10 * 60e3 + 1000);
  assert.equal(chat.send(a, b, { body: 'sorry' }).code, 'paused');
  q.run('UPDATE chat_usage SET paused_until=? WHERE user_id=?', Date.now() - 1, a.id);
  assert.equal(chat.send(a, b, { body: 'sorry' }).ok, true);
  assert.equal(q.get('SELECT blocked FROM chat_usage WHERE user_id=? AND day=?', a.id, today()).blocked, 5);
});

test('rate limit: 8 messages per 20 seconds', () => {
  const [a, b] = pair();
  for (let i = 0; i < 8; i++) assert.equal(chat.send(a, b, { body: `msg ${i}` }).ok, true);
  assert.equal(chat.send(a, b, { body: 'one more' }).code, 'rate');
  assert.equal(chat.send(a, b, { kind: 'quick', body: '👋' }).code, 'rate');
  clearRate(a);
  assert.equal(chat.send(a, b, { body: 'later' }).ok, true);
});

test('daily cap from config.chatDailyLimit', () => {
  const [a, b] = pair();
  const old = config.chatDailyLimit; config.chatDailyLimit = 3;
  try {
    for (let i = 0; i < 3; i++) assert.equal(chat.send(a, b, { body: `m${i}` }).ok, true);
    assert.equal(chat.send(a, b, { body: 'm4' }).code, 'daily');
  } finally { config.chatDailyLimit = old; }
});

test('report hides the message for the reporter and queues it; only the receiver can report', () => {
  const [a, b] = pair();
  const m = chat.send(a, b, { body: 'you are silly' }).message;
  assert.equal(chat.report(a, m.id, 'mean').ok, false, 'cannot report your own message');
  assert.equal(chat.report(b, m.id, 'nope').ok, false, 'reason required');
  assert.equal(chat.report(b, m.id, 'mean').ok, true);
  assert.equal(chat.thread(b, a).length, 0, 'hidden for the reporter');
  assert.equal(chat.thread(a, b).length, 1, 'sender still sees it until an admin acts');
  assert.equal(q.get("SELECT COUNT(*) n FROM chat_reports WHERE message_id=? AND status='open'", m.id).n, 1);
  chat.report(b, m.id, 'mean');
  assert.equal(q.get('SELECT COUNT(*) n FROM chat_reports WHERE message_id=?', m.id).n, 1, 'no duplicates');
});

test('game invites only for games the friend can open', () => {
  const [a, b] = pair();
  const stranger = mk('Str');
  const pub = mkGame(stranger, 'public'), priv = mkGame(a, 'private'), fr = mkGame(a, 'friends'), strFriends = mkGame(stranger, 'friends');
  const r = chat.send(a, b, { kind: 'game', body: pub.id });
  assert.equal(r.ok, true); assert.equal(r.message.game.slug, pub.slug);
  assert.equal(chat.send(a, b, { kind: 'game', body: fr.id }).ok, true, "a's friends-only game is visible to b");
  assert.equal(chat.send(a, b, { kind: 'game', body: priv.id }).code, 'game_hidden');
  assert.equal(chat.send(a, b, { kind: 'game', body: strFriends.id }).code, 'game', 'a cannot see it either');
  assert.equal(chat.send(a, b, { kind: 'game', body: 'nope' }).code, 'game');
  const t = chat.thread(b, a).filter(m => m.kind === 'game');
  assert.equal(t.length, 2); assert.ok(t.every(m => m.game && m.game.title));
});

test('HTTP: send, poll, report, block; banned user cannot chat; non-friends 400', async () => {
  const [a, b] = pair();
  const ca = cookieFor(a.id), cb = cookieFor(b.id);
  const post = (ck, path, body = {}) => fetch(base + path, { method: 'POST', headers: { cookie: ck, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let r = await post(ca, `/api/chat/${b.username}`, { body: 'hi from http' });
  assert.equal(r.status, 200);
  const sent = (await r.json()).message;
  r = await post(ca, `/api/chat/${b.username}`, { body: 'text me 555 123 4567' });
  assert.equal(r.status, 400); assert.equal((await r.json()).blocked, true);
  let poll = await (await fetch(`${base}/api/chat/${a.username}?after=0`, { headers: { cookie: cb } })).json();
  assert.deepEqual(poll.messages.map(m => m.body), ['hi from http']); assert.equal(poll.can.ok, true);
  r = await post(cb, `/api/chat/messages/${sent.id}/report`, { reason: 'mean' });
  assert.equal(r.status, 200);
  poll = await (await fetch(`${base}/api/chat/${a.username}?after=0`, { headers: { cookie: cb } })).json();
  assert.equal(poll.messages.length, 0);
  const page = await (await fetch(`${base}/chat/${a.username}`, { headers: { cookie: cb } })).text();
  assert.match(page, /Only chat with friends you know in real life/);
  r = await post(cb, `/api/chat/${a.username}/block`); assert.equal(r.status, 200);
  r = await post(ca, `/api/chat/${b.username}`, { body: 'hello?' }); assert.equal(r.status, 400);
  r = await post(cb, `/api/chat/${a.username}/unblock`); assert.equal(r.status, 200);
  const s = mk('Solo');
  r = await post(cookieFor(s.id), `/api/chat/${a.username}`, { body: 'hi' }); assert.equal(r.status, 400);
  q.run('UPDATE users SET banned=1 WHERE id=?', a.id);
  r = await post(ca, `/api/chat/${b.username}`, { body: 'banned now' }); assert.equal(r.status, 401, 'banned sessions are not signed in');
  r = await post(cb, `/api/chat/${a.username}`, { body: 'to banned' }); assert.equal(r.status, 404);
  const g = createGuest();
  r = await post(cookieFor(g.id), `/api/chat/${b.username}`, { body: 'hi' }); assert.equal(r.status, 403);
});
