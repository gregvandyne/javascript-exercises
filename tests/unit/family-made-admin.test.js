// The platform admin and parent-made accounts (docs/decisions.md "Parent-made child accounts" B9; routes/admin.js): the
// user lookup's "Made by grown-up" and "Accounts this family made" lines, the link reports' "made account" flag and
// counts, and "Pause all accounts this grown-up made" after a ban.
import { config, auth, F, q, PW, KID_PW, call, as, cookieFor, kid, grownup, famOf, make, linkByCode, audits, fresh } from './_made.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../../server/services/moderation.js');

const admin = auth.createUser({ username: `MadeAdmin${fresh()}`, password: 'admin-password-1', role: 'admin' });
const lookup = name => as(admin)(`/admin?tab=users&username=${encodeURIComponent(name)}`);

test('the user lookup: "Made by grown-up" on the child; on the grown-up, the accounts the family made with their status, and linked by code', async () => {
  const g = grownup();
  const { child: a } = await make(g);
  const { child: b, token: bt } = await make(g);
  await linkByCode(g, kid());
  let r = await lookup(a.username);
  assert.match(r.text, new RegExp(`Made by grown-up <a href="/admin\\?tab=users&amp;username=${g.username}">@${g.username}</a> \\(#${g.id}\\) on \\d{4}-\\d\\d-\\d\\d`));
  // Deleted: the lookup by the child's old id still shows who made it, via the grown-up's list.
  q.run('UPDATE users SET made_at=? WHERE id IN (?,?)', Date.now() - 3 * 86400e3, a.id, b.id);
  assert.equal((await as(g)(`/api/family/children/${bt}/delete`, { method: 'POST', body: { confirmName: b.username, password: PW } })).status, 200);
  r = await lookup(g.username);
  assert.match(r.text, /Accounts this family made: 2 \(in the last 365 days: 2\)/);
  assert.match(r.text, new RegExp(`@${a.username}</a> · linked`));
  assert.match(r.text, new RegExp(`deleted account \\(#${b.id}\\) · deleted`));
  assert.match(r.text, /Linked by code: 1\./);
  r = await lookup(`deleted_${b.id}`);
  assert.match(r.text, new RegExp(`Made by grown-up <a [^>]*>@${g.username}</a>`), 'still shown after the deletion');
  // A self-signed-up kid: no such line.
  assert.doesNotMatch((await lookup(kid().username)).text, /Made by grown-up/);
  // The page is the admin's only: a grown-up or kid gets a 404.
  assert.equal((await as(g)(`/admin?tab=users&username=${a.username}`)).status, 404);
});

test('link reports: a report on a made account is marked "made account", with the family\'s made and code-linked counts', async () => {
  const g = grownup(); const { child } = await make(g); await make(g);
  assert.equal((await as(child)('/api/me/family/report', { method: 'POST', body: { newPassword: 'sunflower-42', newConfirm: 'sunflower-42' } })).status, 200);
  const rep = F.openReports().find(r => r.child_id === child.id);
  assert.equal(rep.parent_made, 1); assert.equal(rep.made_count, 2); assert.equal(rep.code_linked_count, 0);
  const page = await as(admin)('/admin?tab=links');
  assert.match(page.text, /<span class="chip-s warn">made account<\/span>/);
  assert.match(page.text, /2 accounts made, 0 linked by code/);
  // A code-linked child's report: no flag.
  const g2 = grownup(); const coded = kid(); await linkByCode(g2, coded);
  await as(coded)('/api/me/family/report', { method: 'POST', body: {} });
  assert.equal(F.openReports().find(r => r.child_id === coded.id).parent_made, 0);
});

test('a banned grown-up\'s made children: unchanged by the ban; "Pause all accounts this grown-up made" bans each for review', async () => {
  const g = grownup(); const { child: a } = await make(g); const { child: b } = await make(g);
  const other = kid(); await linkByCode(g, other);
  assert.equal(mod.banUser(admin, g.id, 'test').ok, true);
  assert.equal(auth.getUser(a.id).banned, 0, 'a ban leaves the made accounts as they are');
  assert.equal(F.linkOf(a.id), null, 'the ban ended the links');
  const page = await lookup(g.username);
  assert.match(page.text, /data-act="pausemade" data-id="[^"]+"[^>]*>⛔ Pause all accounts this grown-up made/);
  // Only the admin may.
  assert.equal((await as(kid())(`/api/admin/users/${g.id}/pause-made`, { method: 'POST', body: {} })).status, 404);
  const r = await as(admin)(`/api/admin/users/${g.id}/pause-made`, { method: 'POST', body: {} });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.paused, 2);
  assert.equal(auth.getUser(a.id).banned, 1); assert.equal(auth.getUser(b.id).banned, 1);
  assert.equal(auth.getUser(other.id).banned, 0, 'a code-linked child is not touched');
  assert.equal(JSON.parse(q.get("SELECT details FROM audit_log WHERE action='admin.ban' AND target=?", a.id).details).reason, 'made-by-banned');
  assert.deepEqual(JSON.parse(audits('admin.family.pause_made', g.id).at(-1).details).children.sort(), [a.id, b.id].sort());
  const after = await lookup(g.username);
  assert.match(after.text, /· paused/);
  assert.doesNotMatch(after.text, /data-act="pausemade"/, 'nothing left to pause');
  // Only for grown-ups.
  assert.equal((await as(admin)(`/api/admin/users/${a.id}/pause-made`, { method: 'POST', body: {} })).status, 404);
});
