// The owner's admin requests (docs/decisions.md "Admin approval before a game goes public", "Admin messages: the Oomba
// team inbox", "Admin: New users"): every public game waits for a person on the team, the team inbox (direct messages,
// copies for a child's grown-up, announcements with a confirm step and limits), the New users list, and that every new
// admin page and API is admin-only.
import './_setup.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.BRB_SNAPSHOTS = '0';
const { q, db, now, GRANDFATHER_SQL, MIGRATIONS } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const pub = await import('../../server/services/publish.js');
const mod = await import('../../server/services/moderation.js');
const chat = await import('../../server/services/chat.js');
const team = await import('../../server/services/team.js');
const AU = await import('../../server/services/admin-users.js');
const AA = await import('../../server/services/admin-analytics.js');
/** The old New users filters ({ range, type, search, page }) on the All users list. */
const asFilters = f => AA.cleanFilters({ joined: f.range, type: f.type, q: f.search, page: f.page, sort: 'joined' });
const listNew = (f, o) => AA.listUsers(asFilters(f), o);
const newCsv = f => AA.usersCsv(asFilters(f));
const F = await import('../../server/services/family.js');
const S = await import('../../server/services/schools.js');
const { config } = await import('../../server/config.js');
const { anthropic } = await import('../../server/builder/anthropic.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const { createApp } = await import('../../server/app.js');

const GOOD = '<title>G</title><canvas></canvas><script>BRB.sfx.play("win")</script>';
let n = 0;
const mk = (p = 'Rev', o = {}) => auth.createUser({ username: `${p}${++n}`, password: 'secret123', ...o });
const admin = mk('Boss', { role: 'admin' });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const friendsWith = (a, b) => { q.run("INSERT OR REPLACE INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'accepted',?)", a.id, b.id, now()); q.run("INSERT OR REPLACE INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'accepted',?)", b.id, a.id, now()); };
/** Link child to a new grown-up's family (a confirmed link, as services/family.js leaves it). */
function linkParent(child) {
  const parent = mk('Parent', { accountType: 'grownup' });
  const fam = F.ensureFamily(parent);
  q.run("INSERT INTO family_children(family_id, child_id, status, requested_at, linked_at) VALUES (?,?, 'linked', ?, ?)", fam.id, child.id, now(), now());
  return parent;
}
const teamMsgs = userId => q.all('SELECT m.* FROM chat_messages m JOIN users u ON u.id=m.from_id WHERE m.to_id=? AND u.username=? ORDER BY m.created_at, m.rowid', userId, auth.OFFICIAL);

let server, base;
before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());
const req = (path, { user, method = 'GET', body } = {}) => fetch(base + path, { method, redirect: 'manual', headers: { ...(user ? { cookie: cookieFor(user.id) } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });

// ---------------------------------------------------------------- the publish state machine
test('publish → waiting for review (friends can already play) → approved: strangers only see it once approved', async () => {
  const kid = mk('Maker'), pal = mk('Pal'), stranger = mk('Stranger');
  friendsWith(kid, pal);
  const g = games.createGame(kid.id, { title: 'Waiting Game' });
  const v1 = games.addVersion(g.id, GOOD);
  const r = await pub.publish(kid, g.id, 'public');
  assert.equal(r.state, 'in_review');
  let cur = games.getGame(g.id);
  assert.equal(cur.status, 'published'); assert.equal(cur.visibility, 'friends', 'friends can play while it waits');
  assert.equal(cur.pending_version_id, v1.id); assert.equal(cur.pending_visibility, 'public');
  assert.equal(games.canView(kid, cur), true, 'the creator can still play it');
  assert.equal(games.canView(pal, cur), true, 'friends sharing is unaffected');
  assert.equal(games.canView(stranger, cur), false); assert.equal(games.canView(null, cur), false);
  // Not on any public surface while it waits: listings, search, the signed-out lists the sitemap uses.
  assert.ok(!games.listVisible(null, { limit: 500 }).some(x => x.id === g.id));
  assert.ok(!games.search(null, { text: 'Waiting Game' }).some(x => x.id === g.id));
  assert.ok(!games.search(stranger, { text: 'Waiting Game' }).some(x => x.id === g.id));
  assert.ok(games.listVisible(pal, { limit: 500 }).some(x => x.id === g.id), 'friends see it in their lists');
  // The review queue and the admin's Me badge show it.
  assert.ok(mod.reviewQueue().some(x => x.game.id === g.id && x.audience === 'public' && !x.isUpdate));
  const a = pub.approve(admin, g.id, 'Lovely!');
  assert.equal(a.visibility, 'public'); assert.equal(a.pending_version_id, null);
  assert.equal(games.canView(stranger, a), true);
  assert.ok(games.listVisible(null, { limit: 500 }).some(x => x.id === g.id));
  // The creator got a notice in their Oomba team inbox, in their language.
  const notes = teamMsgs(kid.id);
  assert.equal(notes.length, 1); assert.equal(notes[0].kind, 'notice');
  assert.match(chat.present(notes[0], kid).body, /Waiting Game.*passed the Oomba team's check/);
});

test('sent back with a preset reason: stays friends-only, the creator is told why in their own language', async () => {
  const kid = mk('Maker'), stranger = mk('Stranger');
  const g = games.createGame(kid.id, { title: 'Too Spooky' });
  games.addVersion(g.id, GOOD);
  await pub.publish(kid, g.id, 'public');
  const res = await req(`/api/admin/games/${g.id}/reject`, { user: admin, method: 'POST', body: { reason: 'scary', note: '' } });
  assert.equal(res.status, 200);
  const cur = games.getGame(g.id);
  assert.equal(cur.visibility, 'friends'); assert.equal(cur.pending_version_id, null); assert.equal(cur.review_reason, 'scary');
  assert.equal(games.canView(stranger, cur), false);
  const [m] = teamMsgs(kid.id);
  assert.equal(m.kind, 'notice');
  const fr = (await import('../../server/i18n/index.js')).makeT('fr');
  assert.match(chat.present(m, kid, fr).body, /Too Spooky.*effrayant/s, 'the preset reason is shown in French');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='admin.reject' AND target=?", g.id));
});

test('the model saying "allowed" is only a hint: public still waits for a person', async () => {
  const kid = mk('Maker'), stranger = mk('Stranger');
  const g = games.createGame(kid.id, { title: 'Model Likes It' });
  const v = games.addVersion(g.id, GOOD);
  const old = config.anthropicKey; config.anthropicKey = 'sk-test-not-used';
  const client = anthropic();
  const orig = client.messages.create;
  client.messages.create = async () => ({ model: 'test-model', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify({ verdict: 'allowed', reasons: [] }) }] });
  try {
    const r = await pub.publish(kid, g.id, 'public');
    assert.equal(r.state, 'in_review');
    const cur = games.getGame(g.id);
    assert.notEqual(cur.visibility, 'public'); assert.equal(games.canView(stranger, cur), false);
    assert.equal(games.getVersion(v.id).review_status, 'queued');
    assert.equal(JSON.parse(games.getVersion(v.id).review_report).verdict, 'allowed', 'kept as a hint for the admin');
    // A model "needs changes" still sends it back at once (no person needed to say no).
    const g2 = games.createGame(kid.id, { title: 'Model Says Fix' }); games.addVersion(g2.id, GOOD);
    client.messages.create = async () => ({ model: 'test-model', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify({ verdict: 'needs_changes', reasons: ['Change the hero.'] }) }] });
    assert.equal((await pub.publish(kid, g2.id, 'public')).state, 'rejected');
  } finally { client.messages.create = orig; config.anthropicKey = old; }
});

test('editing after approval: the approved version stays live until the new one is approved', async () => {
  const kid = mk('Maker'), stranger = mk('Stranger');
  const g = games.createGame(kid.id, { title: 'Keep Editing' });
  const v1 = games.addVersion(g.id, GOOD);
  await pub.publish(kid, g.id, 'public'); pub.approve(admin, g.id);
  const v2 = games.addVersion(g.id, GOOD.replace('win', 'coin'));
  const r = await pub.publish(kid, g.id, 'public');
  assert.equal(r.state, 'in_review');
  const cur = games.getGame(g.id);
  assert.equal(cur.visibility, 'public'); assert.equal(cur.published_version_id, v1.id); assert.equal(cur.pending_version_id, v2.id);
  assert.equal(games.canView(stranger, cur), true, 'strangers keep playing the approved version');
  assert.ok(mod.reviewQueue().find(x => x.game.id === g.id).isUpdate);
  // Taking an approved version off public and back needs no new review (same bytes, same verdict).
  pub.reject(admin, g.id, 'Not this one');
  await pub.setVisibility(kid, g.id, 'friends');
  assert.equal((await pub.setVisibility(kid, g.id, 'public')).state, 'live');
});

test('a model approval from before (no person) no longer covers public, but still covers groups', async () => {
  const kid = mk('Maker');
  const g = games.createGame(kid.id, { title: 'Old Model Approval' });
  const v = games.addVersion(g.id, GOOD);
  q.run("UPDATE game_versions SET review_status='approved', review_report=? WHERE id=?", JSON.stringify({ verdict: 'allowed', by: 'some-model' }), v.id);
  assert.equal(pub.approvedForPublic(games.getVersion(v.id)), false);
  assert.equal((await pub.publish(kid, g.id, 'public')).state, 'in_review');
  q.run("UPDATE game_versions SET review_report=? WHERE id=?", JSON.stringify({ verdict: 'allowed', by: 'seed-import' }), v.id);
  assert.equal(pub.approvedForPublic(games.getVersion(v.id)), true, 'seed (official) games count as approved');
});

test('grandfathering: games public before the change stay public and count as approved; drafts and friends games do not', () => {
  const kid = mk('Old');
  const mkGame = (title, vis, status = 'published') => {
    const g = games.createGame(kid.id, { title }); const v = games.addVersion(g.id, GOOD);
    q.run("UPDATE game_versions SET review_status='approved', review_report=? WHERE id=?", JSON.stringify({ verdict: 'allowed', by: 'old-model' }), v.id);
    q.run('UPDATE games SET visibility=?, status=?, published_version_id=? WHERE id=?', vis, status, v.id, g.id);
    return { g, v };
  };
  const pubOld = mkGame('Old Public', 'public'), friendsOld = mkGame('Old Friends', 'friends'), suspended = mkGame('Old Suspended', 'public', 'suspended');
  assert.ok(MIGRATIONS.some(([name, sql]) => name === '0055_admin_review' && sql.includes(GRANDFATHER_SQL)), 'the migration runs it');
  db.exec(GRANDFATHER_SQL); db.exec(GRANDFATHER_SQL);   // safe to run twice
  const report = id => JSON.parse(games.getVersion(id).review_report);
  assert.equal(pub.approvedForPublic(games.getVersion(pubOld.v.id)), true);
  assert.equal(report(pubOld.v.id).grandfathered, 1); assert.equal(report(pubOld.v.id).was, 'old-model');
  assert.equal(games.getGame(pubOld.g.id).visibility, 'public', 'nothing is unpublished');
  assert.equal(pub.approvedForPublic(games.getVersion(suspended.v.id)), true);
  assert.equal(pub.approvedForPublic(games.getVersion(friendsOld.v.id)), false, 'only what was public is grandfathered');
});

test('a grown-up builder: public waits too, and their connections can play meanwhile', async () => {
  const g0 = mk('GrownMaker', { accountType: 'grownup' });
  const g = games.createGame(g0.id, { title: 'Grown Game' }); games.addVersion(g.id, GOOD);
  const r = await pub.publish(g0, g.id, 'public');
  assert.equal(r.state, 'in_review'); assert.match(r.message, /grown-up connections/);
  assert.equal(games.getGame(g.id).visibility, 'friends');
});

test('a school account whose school keeps games inside never reaches the public queue', async () => {
  const boss = mk('SchoolBoss', { role: 'admin' });
  const school = S.createSchool(boss, { name: 'Inside School' }).school;
  const kid = S.createSchoolAccount(boss, school.id, { rosterName: 'In Kid' }).user;
  const g = games.createGame(kid.id, { title: 'Inside Game' }); games.addVersion(g.id, GOOD);
  const r = await pub.publish(kid, g.id, 'public');
  assert.equal(r.ok, false); assert.equal(games.getGame(g.id).pending_version_id, null);
});

// ---------------------------------------------------------------- the Oomba team inbox
test('direct messages: a grown-up gets one; a child only with a grown-up who gets a copy; all audited', () => {
  const grown = mk('Mum', { accountType: 'grownup' });
  let r = team.sendDirect(admin, grown, 'Hello from the team!');
  assert.equal(r.ok, true);
  assert.equal(teamMsgs(grown.id)[0].body, 'Hello from the team!'); assert.equal(teamMsgs(grown.id)[0].sent_by, admin.id);
  // A child with nobody to copy (the owner's decision: the team may message any kid): sent, copied to no one, audited with the text.
  const lone = mk('Lone');
  r = team.sendDirect(admin, lone, 'Hi'); assert.equal(r.ok, true, JSON.stringify(r)); assert.deepEqual(r.copiedTo, []);
  assert.equal(teamMsgs(lone.id).length, 1);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='admin.message' AND target=? AND details LIKE '%Hi%'", lone.id));
  // A child with a linked grown-up: sent, copied to the grown-up, audited with the text.
  const kid = mk('Kiddo'); const parent = linkParent(kid);
  r = team.sendDirect(admin, kid, 'Your game is great!');
  assert.equal(r.ok, true); assert.deepEqual(r.copiedTo.map(g => g.id), [parent.id]);
  const copy = teamMsgs(parent.id).find(m => m.kind === 'copy');
  assert.ok(copy); assert.match(chat.present(copy, parent).body, new RegExp(`we wrote to ${kid.display_name}: Your game is great!`));
  const a = q.get("SELECT * FROM audit_log WHERE action='admin.message' AND target=?", kid.id);
  assert.ok(a); assert.equal(JSON.parse(a.details).text, 'Your game is great!');
  // Not for non-admins, guests or the team account itself.
  assert.equal(team.sendDirect(mk('NotAdmin'), grown, 'x').ok, false);
  assert.equal(team.sendDirect(admin, team.teamUser(), 'x').ok, false);
});

test('school students: their school admins get the copy', () => {
  const boss = mk('Principal', { role: 'admin' });
  const school = S.createSchool(boss, { name: 'Copy School' }).school;
  const head = mk('HeadTeacher');
  q.run("INSERT INTO school_members(school_id, user_id, role, status, joined_at) VALUES (?,?,'admin','active',?)", school.id, head.id, now());
  const kid = S.createSchoolAccount(boss, school.id, { rosterName: 'Copy Kid' }).user;
  assert.ok(team.guardiansOf(kid).some(g => g.id === head.id));
  assert.equal(team.sendDirect(admin, kid, 'Hello class star').ok, true);
  assert.ok(teamMsgs(head.id).some(m => m.kind === 'copy'));
});

test("replies: a child's go through the chat filters and are copied to their grown-up; a child with nobody can't reply", () => {
  const kid = mk('Replier'); const parent = linkParent(kid);
  assert.equal(team.canReply(kid).code, 'notYet', 'only once the team wrote');
  team.sendDirect(admin, kid, 'How do you like the new games?');
  assert.equal(team.canReply(kid).ok, true);
  let r = team.reply(kid, { kind: 'text', body: 'call me 555 123 4567' });
  assert.equal(r.ok, false, 'phone numbers are refused like in friends chat');
  r = team.reply(kid, { kind: 'text', body: 'I love them!' });
  assert.equal(r.ok, true);
  assert.ok(teamMsgs(parent.id).some(m => m.kind === 'copy' && JSON.parse(m.body).dir === 'from' && JSON.parse(m.body).text === 'I love them!'));
  assert.equal(team.reply(kid, { kind: 'quick', body: 'thanks' }).ok, true);
  // A child with nobody to copy can write back once the team has written; the reply is filtered and audited with its text.
  const lone = mk('LoneReader'); team.notify(lone.id, { k: 'approved', title: 'X' });
  assert.equal(team.canReply(lone).ok, true);
  assert.equal(team.reply(lone, { kind: 'text', body: 'hi thanks' }).ok, true);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='team.reply.child' AND actor_id=? AND details LIKE '%hi thanks%'", lone.id));
  // Rate limit: the same burst limit as friends chat.
  const kid2 = mk('Burst'); linkParent(kid2); team.sendDirect(admin, kid2, 'Hi!');
  let last;
  for (let i = 0; i <= chat.RATE_MAX; i++) last = team.reply(kid2, { kind: 'quick', body: 'hi' });
  assert.equal(last.code, 'rate');
});

test('the team thread in the inbox and on /chat/OombaAcademy: kids, and grown-ups (who have no other chat)', async () => {
  const kid = mk('Inboxer'); linkParent(kid);
  team.sendDirect(admin, kid, 'Welcome!');
  let res = await req('/api/chat', { user: kid });
  const body = await res.json();
  assert.equal(body.threads[0].team, true); assert.equal(body.threads[0].displayName, 'Oomba team'); assert.ok(body.unread >= 1);
  res = await req(`/chat/${auth.OFFICIAL}`, { user: kid });
  assert.equal(res.status, 200); const page = await res.text();
  assert.match(page, /Your grown-up can see them too/); assert.match(page, /Welcome!/);
  // A grown-up: the team thread (linked from /family) is their only chat; /chat itself stays closed to them.
  const grown = mk('Dad', { accountType: 'grownup' });
  team.sendDirect(admin, grown, 'Thanks for joining');
  assert.equal((await req('/chat', { user: grown })).status, 404);
  res = await req('/family', { user: grown }); assert.match(await res.text(), /new message from the Oomba team/);
  res = await req(`/chat/${auth.OFFICIAL}`, { user: grown }); assert.equal(res.status, 200);
  res = await req(`/api/chat/${auth.OFFICIAL}`, { user: grown, method: 'POST', body: { kind: 'text', body: 'You are welcome' } });
  assert.equal(res.status, 200);
  assert.ok(team.adminThreads().some(t => t.id === grown.id && t.unread === 1));
  // Friends' chat stays closed to grown-ups.
  assert.equal((await req(`/chat/${kid.username}`, { user: grown })).status, 404);
  // Nobody blocks the team.
  assert.equal((await req(`/api/chat/${auth.OFFICIAL}/block`, { user: kid, method: 'POST', body: {} })).status, 400);
});

test('announcements: preview, then send with the confirm code; audiences; limits', () => {
  q.run('DELETE FROM announcements');
  const kid = mk('AnnKid'), grown = mk('AnnGrown', { accountType: 'grownup' }), banned = mk('AnnBanned'), guest = auth.createGuest();
  q.run('UPDATE users SET banned=1 WHERE id=?', banned.id);
  const p = team.previewAnnouncement(admin, { audience: 'grownups', text: 'New parent guide is out!' });
  assert.equal(p.ok, true);
  const grownCount = q.get("SELECT COUNT(*) n FROM users WHERE account_type='grownup' AND is_guest=0 AND banned=0").n;
  assert.equal(p.count, grownCount);
  // Wrong confirm, or the words changed since the preview: refused.
  assert.equal(team.sendAnnouncement(admin, { audience: 'grownups', text: 'New parent guide is out!', confirm: 'nope' }).code, 'confirm');
  assert.equal(team.sendAnnouncement(admin, { audience: 'grownups', text: 'Different words', confirm: p.confirm }).code, 'confirm');
  const s = team.sendAnnouncement(admin, { audience: 'grownups', text: 'New parent guide is out!', confirm: p.confirm });
  assert.equal(s.ok, true); assert.equal(s.count, grownCount);
  assert.equal(teamMsgs(grown.id).filter(m => m.kind === 'announce').length, 1);
  assert.equal(teamMsgs(kid.id).filter(m => m.kind === 'announce').length, 0, 'kids were not in that audience');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='admin.announce' AND target=?", s.id));
  // A second one within 10 minutes is refused (whole site).
  const p2 = team.previewAnnouncement(admin, { audience: 'all', text: 'Hello everyone' });
  assert.equal(team.sendAnnouncement(admin, { audience: 'all', text: 'Hello everyone', confirm: p2.confirm }).code, 'rate');
  // Later: everyone with an account, never guests, banned accounts or the team account.
  q.run('UPDATE announcements SET created_at=created_at-?', 11 * 60e3);
  const s2 = team.sendAnnouncement(admin, { audience: 'all', text: 'Hello everyone', confirm: p2.confirm });
  assert.equal(s2.ok, true);
  assert.equal(teamMsgs(kid.id).filter(m => m.kind === 'announce').length, 1);
  assert.match(chat.present(teamMsgs(kid.id).at(-1), kid).body, /^📣 Hello everyone$/);
  assert.equal(teamMsgs(banned.id).length, 0); assert.equal(teamMsgs(guest.id).length, 0);
  // At most ANNOUNCE_DAILY a day.
  for (let i = 0; i < team.ANNOUNCE_DAILY; i++) q.run("INSERT INTO announcements(id, sent_by, audience, body, recipients, created_at) VALUES (?,?,'all','x',0,?)", `fake${i}`, admin.id, now() - 60 * 60e3);
  q.run('UPDATE announcements SET created_at=? WHERE id=?', now() - 30 * 60e3, s2.id);
  const p3 = team.previewAnnouncement(admin, { audience: 'kids', text: 'Third' });
  assert.equal(team.sendAnnouncement(admin, { audience: 'kids', text: 'Third', confirm: p3.confirm }).code, 'daily');
  // A school audience needs a real school.
  assert.equal(team.previewAnnouncement(admin, { audience: 'school', schoolId: 'nope', text: 'x' }).code, 'school');
});

// ---------------------------------------------------------------- New users
test('new users: newest first, filters, search, paging; guests and the team account are left out', () => {
  const t0 = now();
  const a = mk('NuKid'); const b = mk('NuGrown', { accountType: 'grownup' }); const c = mk('NuOld');
  const guest = auth.createGuest();
  q.run('UPDATE users SET created_at=? WHERE id=?', t0 - 20 * 86400e3, c.id);
  let r = listNew({ range: '7d' }, { perPage: 500 });
  const ids = r.rows.map(x => x.id);
  assert.ok(ids.includes(a.id) && ids.includes(b.id)); assert.ok(!ids.includes(c.id), 'older than 7 days');
  assert.ok(!ids.includes(guest.id)); assert.ok(!r.rows.some(x => x.username === auth.OFFICIAL));
  assert.ok(r.rows.every((x, i) => i === 0 || r.rows[i - 1].created_at >= x.created_at), 'newest first');
  assert.ok(listNew({ range: '30d' }, { perPage: 500 }).rows.some(x => x.id === c.id));
  r = listNew({ range: 'all', type: 'grownup' }, { perPage: 500 });
  assert.ok(r.rows.every(x => x.type === 'grownup')); assert.ok(r.rows.some(x => x.id === b.id));
  r = listNew({ range: 'all', search: 'NuKid' });
  assert.ok(r.rows.some(x => x.id === a.id)); assert.ok(r.rows.every(x => /nukid/i.test(x.username + x.display_name)));
  assert.equal(listNew({ range: 'all', search: '%' }).total, 0, 'LIKE wildcards are literal');
  // Paging.
  const p1 = listNew({ range: 'all' }, { perPage: 2 }); const p2 = listNew({ range: 'all', page: 2 }, { perPage: 2 });
  assert.equal(p1.rows.length, 2); assert.ok(p1.pages >= 2); assert.notEqual(p1.rows[0].id, p2.rows[0].id);
  // No secrets ever: rows carry no password hash, friend code or session.
  for (const row of p1.rows) for (const k of ['password_hash', 'friend_code', 'lang']) assert.equal(k in row, false);
  // Kid linked to a parent shows the parent; a banned account is "suspended".
  const parent = linkParent(a); q.run('UPDATE users SET banned=1 WHERE id=?', c.id);
  r = listNew({ range: 'all' }, { perPage: 1000 });
  assert.equal(r.rows.find(x => x.id === a.id).parent, parent.username);
  assert.equal(r.rows.find(x => x.id === c.id).status, 'suspended');
  // Sign-ups per day: 30 days, zeros included, today counted.
  const days = AU.signupsByDay(30);
  assert.equal(days.length, 30); assert.ok(days.at(-1).n >= 2);
});

test('new users: counts of games, public games and plays; CSV is spreadsheet-safe and has no secrets', async () => {
  const maker = mk('CsvMaker');
  q.run("UPDATE users SET display_name='=HYPERLINK(\"x\")' WHERE id=?", maker.id);
  const g = games.createGame(maker.id, { title: 'Counted' }); const v = games.addVersion(g.id, GOOD);
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, plays=7 WHERE id=?", v.id, g.id);
  const row = listNew({ range: 'all', search: maker.username }).rows[0];
  assert.equal(row.games_made, 1); assert.equal(row.games_public, 1); assert.equal(row.plays_of_games, 7);
  const csv = newCsv({ range: 'all', search: maker.username });
  assert.match(csv, /'=HYPERLINK/, 'a formula is never run by a spreadsheet');
  assert.doesNotMatch(csv, /\$2[aby]\$/, 'no password hashes');
  const res = await req(`/admin/new-users.csv?range=all&q=${maker.username}`, { user: admin });
  assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='admin.export_users'"));
});

// ---------------------------------------------------------------- admin-only, every new page and API
test('every new admin page and API is 404 for kids, grown-ups, teachers and signed-out visitors', async () => {
  resetLimits();
  const kid = mk('Nosy'), grown = mk('NosyGrown', { accountType: 'grownup' });
  const boss = mk('NosyBoss', { role: 'admin' }); const school = S.createSchool(boss, { name: 'Nosy School' }).school;
  const teacher = S.createSchoolAccount(boss, school.id, { rosterName: 'Nosy Teacher', role: 'teacher' }).user;
  const target = mk('Target');
  const routes = [
    ['GET', '/admin?tab=newusers'], ['GET', '/admin?tab=messages'], ['GET', '/admin/new-users.csv'], ['GET', `/admin/messages/${target.username}`],
    ['POST', `/api/admin/users/${target.id}/message`, { text: 'hi' }], ['POST', '/api/admin/announcements/preview', { audience: 'all', text: 'x' }],
    ['POST', '/api/admin/announcements', { audience: 'all', text: 'x', confirm: 'x' }], ['POST', '/api/admin/games/x/reject', { reason: 'scary' }],
  ];
  for (const user of [kid, grown, teacher, null]) {
    for (const [method, path, body] of routes) {
      const res = await req(path, { user, method, body });
      assert.equal(res.status, 404, `${method} ${path} as ${user ? user.username : 'nobody'}`);
    }
  }
  // And they work for the admin.
  for (const path of ['/admin?tab=newusers', '/admin?tab=messages', `/admin/messages/${target.username}`, '/admin?tab=queue']) {
    const res = await req(path, { user: admin }); assert.equal(res.status, 200, path);
  }
  const page = await (await req('/admin?tab=newusers&range=all', { user: admin })).text();
  assert.match(page, /Sign-ups per day/); assert.match(page, new RegExp(`@${target.username}`));
  assert.doesNotMatch(page, /\$2[aby]\$/);
});

test('admin DM API: works, says who got the copy, and is rate limited', async () => {
  resetLimits();
  const kid = mk('DmKid'); const parent = linkParent(kid);
  let res = await req(`/api/admin/users/${kid.id}/message`, { user: admin, method: 'POST', body: { text: 'Hi there!' } });
  assert.equal(res.status, 200); assert.deepEqual((await res.json()).copiedTo, [parent.username]);
  const lone = mk('DmLone');
  res = await req(`/api/admin/users/${lone.id}/message`, { user: admin, method: 'POST', body: { text: 'Hi' } });
  assert.equal(res.status, 200); assert.deepEqual((await res.json()).copiedTo, []);
  const grown = mk('DmGrown', { accountType: 'grownup' });
  let last;
  for (let i = 0; i < 31; i++) last = await req(`/api/admin/users/${grown.id}/message`, { user: admin, method: 'POST', body: { text: `n${i}` } });
  assert.equal(last.status, 429);
  resetLimits();
});

test("the admin's Me badge counts the review queue; the admin header shows it", async () => {
  const kid = mk('BadgeMaker');
  const g = games.createGame(kid.id, { title: 'Badge Game' }); games.addVersion(g.id, GOOD);
  await pub.publish(kid, g.id, 'public');
  const { navBadges } = await import('../../server/services/badges.js');
  assert.ok(navBadges(admin).review >= 1);
  assert.equal(navBadges(kid).review, 0);
  const page = await (await req('/admin?tab=queue', { user: admin })).text();
  assert.match(page, /Review queue: \d+ games? waiting/);
  assert.match(page, /Send back/); assert.match(page, /Please use your own characters/);
});

test('unsend: an admin takes back a team message (and the grown-up copies) or a whole announcement; audited; admins only', async () => {
  const kid = mk('Oops'); const parent = linkParent(kid);
  const r = team.sendDirect(admin, kid, 'Hi [first name], welcome!');
  assert.equal(r.ok, true);
  const copy = q.get("SELECT * FROM chat_messages WHERE to_id=? AND kind='copy' ORDER BY created_at DESC", parent.id);
  assert.equal(copy.status, 'ok');
  // Not an admin: 404 (the admin API is admin only).
  assert.equal((await req(`/api/admin/team/messages/${r.id}/unsend`, { user: kid, method: 'POST', body: {} })).status, 404);
  const res = await req(`/api/admin/team/messages/${r.id}/unsend`, { user: admin, method: 'POST', body: {} });
  assert.equal(res.status, 200, await res.clone().text()); assert.equal((await res.json()).copies, 1);
  assert.equal(q.get('SELECT status FROM chat_messages WHERE id=?', r.id).status, 'unsent');
  assert.equal(q.get('SELECT status FROM chat_messages WHERE id=?', copy.id).status, 'unsent');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='admin.message.unsend' AND target=? AND details LIKE '%first name%'", kid.id));
  // The kid's team thread no longer shows it; the admin's thread marks it unsent.
  const kt = await (await req(`/chat/${auth.OFFICIAL}`, { user: kid })).text();
  assert.ok(!kt.includes('[first name]'), 'gone from the kid\'s inbox');
  assert.match(await (await req(`/admin/messages/${kid.username}`, { user: admin })).text(), /unsent \(they no longer see it\)/);
  // A reply or a missing id can't be unsent.
  assert.equal(team.unsendDirect(admin, 'nope').code, 'missing');
  // An announcement: every delivery disappears; the list says unsent.
  const a1 = mk('AnnA'); const a2 = mk('AnnB');
  q.run('DELETE FROM announcements');
  const pv = team.previewAnnouncement(admin, { audience: 'kids', text: 'Hello [name]!' });
  const sent = team.sendAnnouncement(admin, { audience: 'kids', text: 'Hello [name]!', confirm: pv.confirm });
  assert.equal(sent.ok, true, JSON.stringify(sent));
  assert.ok(q.get("SELECT COUNT(*) n FROM chat_messages WHERE kind='announce' AND status='ok' AND to_id IN (?,?)", a1.id, a2.id).n === 2);
  const ur = await req(`/api/admin/announcements/${sent.id}/unsend`, { user: admin, method: 'POST', body: {} });
  assert.equal(ur.status, 200);
  assert.equal(q.get("SELECT COUNT(*) n FROM chat_messages WHERE kind='announce' AND status='ok' AND body LIKE ?", `{"id":"${sent.id}"%`).n, 0);
  assert.equal(team.recentAnnouncements(5).find(x => x.id === sent.id).unsent, 1);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='admin.announce.unsend' AND target=?", sent.id));
});

test('team messages keep their line breaks (paragraphs and bullet lines), at most one blank line in a row', () => {
  const kid = mk('Lines');
  const r = team.sendDirect(admin, kid, 'Hi Sam,\r\n\r\n\r\n\r\nA few things:\n• Play\n•   Build   games\n\nBest, Greg');
  assert.equal(r.ok, true);
  assert.equal(q.get('SELECT body FROM chat_messages WHERE id=?', r.id).body, 'Hi Sam,\n\nA few things:\n• Play\n• Build games\n\nBest, Greg');
  assert.equal(team.cleanBody('one‮two\nthree'), 'one two\nthree');
});

test('welcome: every new kid gets the team welcome at their first sign-in ({name}, line breaks), once; grown-ups and old accounts don\'t; the admin can edit or switch it off', async () => {
  const res = { setHeader() {}, getHeader() { return undefined; }, append() {} };
  const fresh = mk('Aaron', { displayName: 'Aaron Smith' });
  auth.startSession(res, fresh.id, 'test', { method: 'signup' });
  const w = teamMsgs(fresh.id).filter(m => m.kind === 'team');
  assert.equal(w.length, 1);
  assert.match(w[0].body, /^Hi Aaron! /); assert.match(w[0].body, /\n\nWelcome to Oomba Academy!/);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='team.welcome' AND target=?", fresh.id));
  // A second sign-in: no second welcome. The kid may reply.
  auth.startSession(res, fresh.id, 'test');
  assert.equal(teamMsgs(fresh.id).filter(m => m.kind === 'team').length, 1);
  assert.equal(team.canReply(auth.getUser(fresh.id)).ok, true);
  // A grown-up: nothing. An old account (made 40 days ago) signing in for the first time: nothing.
  const grown = mk('NewMum', { accountType: 'grownup' });
  auth.startSession(res, grown.id, 'test', { method: 'signup' });
  assert.equal(teamMsgs(grown.id).length, 0);
  const old = mk('OldKid'); q.run('UPDATE users SET created_at=? WHERE id=?', Date.now() - 40 * 86400e3, old.id);
  auth.startSession(res, old.id, 'test');
  assert.equal(teamMsgs(old.id).length, 0);
  // The admin edits it and switches it off.
  const saved = await req('/api/admin/team/welcome', { user: admin, method: 'POST', body: { on: '1', text: 'Hey {name}!\nWelcome.' } });
  assert.equal(saved.status, 200);
  const k2 = mk('Bea'); auth.startSession(res, k2.id, 'test');
  assert.equal(teamMsgs(k2.id).find(m => m.kind === 'team').body, `Hey ${auth.getUser(k2.id).display_name.split(' ')[0]}!\nWelcome.`);
  assert.equal((await req('/api/admin/team/welcome', { user: admin, method: 'POST', body: { text: 'Off now' } })).status, 200);
  assert.equal(team.welcomeSettings().on, false);
  const k3 = mk('Cy'); auth.startSession(res, k3.id, 'test');
  assert.equal(teamMsgs(k3.id).length, 0);
  assert.equal((await req('/api/admin/team/welcome', { user: fresh, method: 'POST', body: { on: '1', text: 'x' } })).status, 404);
  assert.match(await (await req('/admin?tab=messages', { user: admin })).text(), /Welcome message for new kids/);
  q.run("DELETE FROM settings WHERE key='team.welcome'");
});
