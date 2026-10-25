// Admin moderation: approve/reject via publish.js, reports, chat reports, bans, audit, and 404 for non-admins.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const { createUser, createGuest, startSession } = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const friends = await import('../../server/services/friends.js');
const chat = await import('../../server/services/chat.js');
const mod = await import('../../server/services/moderation.js');
const S = await import('../../server/services/schools.js');
const { createApp } = await import('../../server/app.js');

let n = 0;
const mk = (p = 'User', role) => createUser({ username: `${p}${++n}`, password: 'secret123', role });
const admin = mk('Boss', 'admin');
function cookieFor(userId) { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, userId); return c; }
const audits = action => q.all('SELECT * FROM audit_log WHERE action=?', action);
/** A game waiting in the queue. live=true: v1 is already public and v2 is the pending update. */
function queued(owner, { live = false } = {}) {
  const g = games.createGame(owner.id, { title: `Queue ${++n}` });
  const v1 = games.addVersion(g.id, '<div>v1</div>', { createdBy: owner.id, safetyStatus: 'pass' });
  if (!live) { q.run("UPDATE games SET status='in_review', pending_version_id=? WHERE id=?", v1.id, g.id); return { g: games.getGame(g.id), v1 }; }
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v1.id, g.id);
  const v2 = games.addVersion(g.id, '<div>v2</div>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET pending_version_id=? WHERE id=?", v2.id, g.id);
  return { g: games.getGame(g.id), v1, v2 };
}

let server, base;
before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());

test('approve publishes the pending version and makes it public', () => {
  const owner = mk('Maker'), stranger = mk('Viewer');
  const { g, v1 } = queued(owner);
  assert.equal(games.canView(stranger, g), false);
  assert.equal(mod.reviewQueue().some(x => x.game.id === g.id), true);
  const after = mod.approve(admin, g.id, 'Great game!');
  assert.equal(after.status, 'published'); assert.equal(after.visibility, 'public');
  assert.equal(after.published_version_id, v1.id); assert.equal(after.pending_version_id, null);
  assert.equal(after.review_note, 'Great game!');
  assert.equal(games.getVersion(v1.id).review_status, 'approved');
  assert.equal(games.canView(stranger, after), true);
  assert.equal(mod.reviewQueue().some(x => x.game.id === g.id), false);
  assert.ok(audits('admin.approve').some(a => a.target === g.id));
});

test('reject keeps a live game on its old version, with the note for the builder', () => {
  const owner = mk('Maker'), stranger = mk('Viewer');
  const { g, v1, v2 } = queued(owner, { live: true });
  const item = mod.reviewQueue().find(x => x.game.id === g.id);
  assert.equal(item.isUpdate, true); assert.equal(item.liveNumber, 1); assert.equal(item.version.number, 2);
  const after = mod.reject(admin, g.id, 'Please remove the flashing.');
  assert.equal(after.status, 'published'); assert.equal(after.published_version_id, v1.id);
  assert.equal(after.pending_version_id, null); assert.equal(after.review_note, 'Please remove the flashing.');
  assert.equal(games.getVersion(v2.id).review_status, 'rejected');
  assert.equal(games.canView(stranger, after), true, 'old version still playable');
  // a brand-new game that is rejected is not live
  const { g: g2 } = queued(owner);
  assert.equal(mod.reject(admin, g2.id, 'Needs work').status, 'rejected');
  assert.ok(audits('admin.reject').length >= 2);
});

test('reports: suspend and unsuspend are audited', () => {
  const owner = mk('Maker');
  const { g } = queued(owner); mod.approve(admin, g.id);
  q.run("INSERT INTO reports(id, game_id, user_id, reason, created_at) VALUES ('r1', ?, ?, 'scary', 1)", g.id, owner.id);
  const list = mod.reportedGames(); const row = list.find(x => x.id === g.id);
  assert.equal(row.open_reports, 1); assert.deepEqual(row.reasons, [{ reason: 'scary', n: 1 }]);
  assert.equal(mod.suspendGame(admin, g.id).status, 'suspended');
  assert.equal(games.canView(mk('V'), games.getGame(g.id)), false);
  assert.equal(q.get("SELECT status FROM reports WHERE id='r1'").status, 'actioned');
  assert.equal(mod.unsuspendGame(admin, g.id).status, 'published');
  for (const a of ['admin.suspend_game', 'admin.unsuspend_game']) assert.equal(audits(a).length, 1, a);
});

test('chat reports: context, hide, dismiss, ban sender (ends sessions)', () => {
  const a = mk('Kid'), b = mk('Kid');
  friends.addByCode(a, b.friend_code); friends.accept(b, a.id);
  for (let i = 0; i < 7; i++) { chat.send(i % 2 ? b : a, i % 2 ? a : b, { body: `line ${i}` }); q.run('UPDATE chat_messages SET created_at=created_at-? WHERE from_id IN (?,?)', 30000, a.id, b.id); }
  const target = q.get("SELECT * FROM chat_messages WHERE body='line 4'");
  chat.report(b, target.id, 'mean');
  const [rep] = mod.chatReports();
  assert.equal(rep.message.id, target.id); assert.equal(rep.sender.id, a.id); assert.equal(rep.reporter.id, b.id);
  assert.deepEqual(rep.context.map(m => m.body), ['line 0', 'line 1', 'line 2', 'line 3', 'line 4', 'line 5', 'line 6']);
  assert.equal(mod.hideMessage(admin, rep.report.id), true);
  assert.equal(q.get('SELECT status FROM chat_messages WHERE id=?', target.id).status, 'hidden');
  assert.equal(chat.thread(a, b).some(m => m.id === target.id), false, 'hidden for everyone');
  assert.equal(mod.chatReports().length, 0);
  const other = q.get("SELECT * FROM chat_messages WHERE body='line 2'");
  chat.report(b, other.id, 'spam'); const [r2] = mod.chatReports();
  assert.equal(mod.dismissChatReport(admin, r2.report.id), true);
  assert.equal(q.get('SELECT status FROM chat_reports WHERE id=?', r2.report.id).status, 'dismissed');
  const third = q.get("SELECT * FROM chat_messages WHERE body='line 6'");
  chat.report(b, third.id, 'scary'); const [r3] = mod.chatReports();
  cookieFor(a.id);
  assert.equal(mod.banSender(admin, r3.report.id).ok, true);
  assert.equal(q.get('SELECT banned FROM users WHERE id=?', a.id).banned, 1);
  assert.equal(q.get('SELECT COUNT(*) n FROM sessions WHERE user_id=?', a.id).n, 0);
  assert.equal(mod.banUser(admin, admin.id).ok, false, 'admins cannot be banned');
  assert.equal(mod.unbanUser(admin, a.id).ok, true);
  for (const act of ['admin.hide_message', 'admin.dismiss_chat_report', 'admin.ban', 'admin.unban']) assert.ok(audits(act).length >= 1, act);
  assert.ok(mod.auditLog(200).length > 0);
});

test('admin pages and APIs are 404 for visitors, guests and players; 200 for admins', async () => {
  const player = mk('Player'), guest = createGuest();
  const { g } = queued(player);
  const pages = ['/admin', '/admin?tab=reports', '/admin?tab=chat', '/admin?tab=users&username=Player1', '/admin?tab=audit', '/api/admin/audit', '/api/admin/users?username=x'];
  const posts = [`/api/admin/games/${g.id}/approve`, `/api/admin/games/${g.id}/reject`, `/api/admin/games/${g.id}/suspend`, `/api/admin/users/${player.id}/ban`, '/api/admin/chat-reports/x/hide'];
  for (const ck of [null, cookieFor(guest.id), cookieFor(player.id)]) {
    const headers = ck ? { cookie: ck } : {};
    for (const p of pages) assert.equal((await fetch(base + p, { headers })).status, 404, `GET ${p}`);
    for (const p of posts) assert.equal((await fetch(base + p, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}' })).status, 404, `POST ${p}`);
  }
  assert.equal(games.getGame(g.id).status, 'in_review', 'nothing changed');
  const ck = cookieFor(admin.id);
  for (const tab of ['queue', 'reports', 'chat', 'users', 'audit']) {
    const r = await fetch(`${base}/admin?tab=${tab}`, { headers: { cookie: ck } });
    assert.equal(r.status, 200, tab);
  }
  const html = await (await fetch(`${base}/admin`, { headers: { cookie: ck } })).text();
  assert.ok(html.includes(g.title) && html.includes('/frame/'), 'queue shows the game with a sandboxed preview');
  assert.match(html, /sandbox="allow-scripts allow-pointer-lock allow-orientation-lock"/);
  const r = await fetch(`${base}/api/admin/games/${g.id}/approve`, { method: 'POST', headers: { cookie: ck, 'content-type': 'application/json' }, body: JSON.stringify({ note: 'Lovely' }) });
  assert.equal(r.status, 200);
  assert.equal(games.getGame(g.id).visibility, 'public');
});

test('audit log names schools and classes, shows user ids in details as @username, and batches the lookups', () => {
  const school = S.createSchool(admin, { name: 'Audit <Academy>' }).school;
  const cls = S.createClass(admin, school.id, { name: 'Class 1A', teacherId: 'none' }).class;
  const kid = S.createSchoolAccount(admin, school.id, { rosterName: 'Secret Realname' }).user;
  S.addToClass(admin, cls.id, kid.id);
  const log = mod.auditLog(200);
  const row = (action, target) => log.find(r => r.action === action && r.target === target);
  assert.equal(row('school.create', school.id).targetLabel, '🏫 Audit <Academy>');
  assert.equal(row('school.create', school.id).detailsLabel, 'name: Audit <Academy>');
  const cc = row('class.create', cls.id);
  assert.equal(cc.targetLabel, '🧑‍🏫 Class 1A (Audit <Academy>)');
  assert.equal(cc.detailsLabel, 'school: Audit <Academy> · name: Class 1A', 'school id in details becomes its name');
  const acc = row('school.account_create', school.id);
  assert.equal(acc.targetLabel, '🏫 Audit <Academy>');
  assert.equal(acc.detailsLabel, `user: @${kid.username} · role: student`, 'user id in details becomes @username');
  assert.equal(row('class.member_add', cls.id).detailsLabel, `user: @${kid.username} · role: student`);
  assert.ok(log.every(r => typeof r.detailsLabel === 'string' && typeof r.targetLabel === 'string'), 'same shape for every row');
  assert.ok(!log.some(r => r.detailsLabel.includes(kid.id) || r.targetLabel.includes(school.id) || r.targetLabel.includes(cls.id)), 'no raw ids where a name is known');
  // non-object details stay raw, long values are clipped, unknown targets stay as they are
  q.run("INSERT INTO audit_log(id, actor_id, action, target, details, created_at) VALUES ('aud-raw', ?, 'test.raw', 'no-such-id-xyz', 'plain text', ?)", admin.id, Date.now() + 5);
  q.run("INSERT INTO audit_log(id, actor_id, action, target, details, created_at) VALUES ('aud-long', ?, 'test.long', '', ?, ?)", admin.id, JSON.stringify({ note: 'x'.repeat(500), n: 3, nested: { a: 1 } }), Date.now() + 6);
  const fresh = mod.auditLog(5);
  const rawRow = fresh.find(r => r.id === 'aud-raw'), longRow = fresh.find(r => r.id === 'aud-long');
  assert.equal(rawRow.targetLabel, 'no-such-id-xyz'); assert.equal(rawRow.detailsLabel, 'plain text');
  assert.ok(longRow.detailsLabel.length <= 240 && longRow.detailsLabel.includes('…') && longRow.detailsLabel.includes('n: 3') && longRow.detailsLabel.includes('nested: {"a":1}'), longRow.detailsLabel);
  // batching: the page costs a handful of queries, not one per row
  let n = 0; const orig = q.all; q.all = (...a) => { n++; return orig(...a); };
  try { mod.auditLog(200); } finally { q.all = orig; }
  assert.ok(n <= 5, `${n} queries for a 200-row page`);
});

test('users tab: Site role, Schools row with memberships and links; School account of; none', async () => {
  const school = S.createSchool(admin, { name: 'Oak & Elm' }).school;
  const headmaster = mk('Head');
  S.addMember(admin, school.id, headmaster.id, 'admin', { rosterName: 'Real Head Name' });
  const pupil = S.createSchoolAccount(admin, school.id, { rosterName: 'Pupil Realname' }).user;
  const loner = mk('Loner');
  const ck = cookieFor(admin.id);
  const pageFor = async name => { const r = await fetch(`${base}/admin?tab=users&username=${name}`, { headers: { cookie: ck } }); assert.equal(r.status, 200); return r.text(); };
  let h = await pageFor(headmaster.username);
  assert.match(h, /<th scope="row">Site role<\/th><td>player<\/td>/);
  assert.match(h, /<th scope="row">Schools<\/th>/);
  assert.ok(h.includes(`<a href="/school/${school.slug}?tab=people">Oak &amp; Elm</a> · School admin`), 'membership with role, linked to the People tab');
  assert.ok(!h.includes('School account of'), 'own account');
  assert.ok(!h.includes('Real Head Name'), 'roster names stay on the school pages');
  h = await pageFor(pupil.username);
  assert.ok(h.includes(`School account of <a href="/school/${school.slug}?tab=people">Oak &amp; Elm</a>`), (h.match(/Schools<\/th>.{0,300}/s) || [h.slice(0, 300)])[0]);
  assert.ok(h.includes(`?tab=people">Oak &amp; Elm</a> · Student`));
  assert.ok(!h.includes('Pupil Realname'));
  h = await pageFor(loner.username);
  assert.match(h, /<th scope="row">Schools<\/th><td>none<\/td>/);
  // the audit tab prints the readable labels
  const audit = await (await fetch(`${base}/admin?tab=audit`, { headers: { cookie: ck } })).text();
  assert.ok(audit.includes('🏫 Oak &amp; Elm') && audit.includes(`user: @${pupil.username}`), 'audit tab shows names and @usernames');
  assert.ok(!audit.includes(pupil.id) && !audit.includes(school.id), 'no raw ids in the audit tab');
  const api = await (await fetch(`${base}/api/admin/audit`, { headers: { cookie: ck } })).json();
  assert.ok(api.rows.some(r => r.targetLabel === '🏫 Oak & Elm' && typeof r.detailsLabel === 'string'));
});
