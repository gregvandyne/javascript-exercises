// Parent-made child accounts (docs/decisions.md "Parent-made child accounts"; services/family.js createChildAccount,
// routes/family.js): the gate (PARENT_MADE_CHILDREN and families), the fence for every other role, POST and same-origin
// only, the step-up, the kid name and password rules, both boxes, every creation limit, the transaction, the audits and
// the notice record, and the identity matrix: a parent-made child is treated exactly like a self-signed-up kid.
import { config, auth, F, RL, LEGAL_UPDATED, q, uid, PW, KID_PW, call, as, cookieFor, kid, grownup, famOf, make, linkByCode, audits, next, fresh } from './_made.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const S = await import('../../server/services/schools.js');
const B = await import('../../server/services/billing.js');
const { grownupMay } = await import('../../server/routes/family.js');
const { withoutKeys } = await import('../support/i18n-gaps.js');

const DAY = 86400e3;
const body = (over = {}) => ({ username: `Pippa${fresh()}`, newPassword: KID_PW, newConfirm: KID_PW, ack: '1', guardian: '1', password: PW, ...over });
const post = (u, path, b) => (u ? as(u) : (p, o) => call(null, p, o))(path, { method: 'POST', body: b });
const MADE_GET = ['/family/children/new', '/family/children/abc/data'];
const MADE_POST = ['/api/family/children/new', '/api/family/children/abc/switch', '/api/family/children/abc/password', '/api/family/children/abc/delete', '/api/family/reauth'];

test('the gate: with PARENT_MADE_CHILDREN off, or families off, every page and API is a 404 and nothing shows', async () => {
  const g = grownup();
  for (const off of [() => { config.parentMadeChildren = false; }, () => { config.stripeApiKey = ''; }]) {
    off();
    for (const p of MADE_GET) assert.equal((await as(g)(p)).status, 404, p);
    for (const p of MADE_POST) assert.equal((await post(g, p, body())).status, 404, p);
    assert.equal((await post(g, '/api/family/children/new', body())).status, 404);
    config.parentMadeChildren = true; config.stripeApiKey = 'rk_test_fake';
  }
  config.parentMadeChildren = false;
  const fam = await as(g)('/family');
  assert.equal(fam.status, 200);
  assert.doesNotMatch(fam.text, /children\/new|Make their account|Add your child/);
  assert.match(fam.text, /Link your child/, 'the checklist keeps its Week 2 step');
  for (const p of ['/privacy', '/parents', '/privacy?for=grownups']) assert.doesNotMatch((await call(null, p)).text, /id="made"|Accounts a grown-up makes|If you make your child/, p);
  assert.equal(q.get("SELECT COUNT(*) n FROM users WHERE made_by IS NOT NULL AND username LIKE 'Pip%'").n, 0);
  // On: the doors appear.
  config.parentMadeChildren = true;
  const on = await as(g)('/family');
  assert.match(on.text, /<a class="btn btn-primary" href="\/family\/add">➕ Add a child<\/a>/, 'the Children panel opens "Add your kids"');
  assert.match(on.text, /<a href="\/family\/children\/new">Make their account<\/a> · <a href="\/family\/link">/, 'the checklist\'s step 2 has both ways');
  assert.match(on.text, /Add your child/);
  assert.match((await call(null, '/privacy')).text, /<section class="panel" id="made"><h2>Accounts a grown-up makes for a child<\/h2>/);
  assert.match((await call(null, '/parents')).text, /id="made"><details class="lp-fold"><summary><h3>If you make your child&#39;s account|id="made"><details class="lp-fold"><summary><h3>If you make your child's account/);
});

test('the fence: kids, students, teachers, school admins, the platform admin and guests get a 404; signed out -> grown-up sign-in (pages) or 404 (APIs)', async () => {
  const boss = auth.createUser({ username: `MadeBoss${next()}`, password: 'boss-password-1', role: 'admin' });
  const s = S.createSchool(boss, { name: `Made School ${next()}` }).school;
  const head = S.createSchoolAccount(boss, s.id, { rosterName: 'Head', role: 'admin' }).user;
  const teach = S.createSchoolAccount(head, s.id, { rosterName: 'Teach', role: 'teacher' }).user;
  const pupil = S.createSchoolAccount(head, s.id, { rosterName: 'Pupil' }).user;
  for (const u of [kid(), pupil, teach, head, boss, auth.createGuest()]) {
    for (const p of MADE_POST) assert.equal((await post(u, p, body())).status, 404, `${u.username} ${p}`);
    if (!u.is_guest) for (const p of MADE_GET) assert.equal((await as(u)(p)).status, 404, `${u.username} ${p}`);
  }
  const out = await call(null, '/family/children/new');
  assert.equal(out.status, 302); assert.equal(out.location, '/grown-ups/login?next=%2Ffamily%2Fchildren%2Fnew');
  for (const p of MADE_POST) assert.equal((await post(null, p, body())).status, 404, p);
  // POST only (a GET to an API is not there), and same-origin only.
  const g = grownup();
  assert.equal((await as(g)('/api/family/children/new')).status, 404);
  const cross = await as(g)('/api/family/children/new', { method: 'POST', body: body(), headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(cross.status, 403);
  const other = await as(g)('/api/family/children/new', { method: 'POST', body: body(), headers: { origin: 'https://evil.example' } });
  assert.equal(other.status, 403);
  // The fence's allow-lists.
  for (const p of MADE_GET) assert.equal(grownupMay('GET', p), true, p);
  for (const p of MADE_POST) assert.equal(grownupMay('POST', p), true, p);
  assert.equal(grownupMay('POST', '/api/family/children/abc/other'), false);
  assert.equal(grownupMay('POST', '/api/me/family/made-seen'), false, 'the child\'s card is not a grown-up route');
});

test('the step-up: the grown-up\'s password within 10 minutes; wrong tries count toward their sign-in lock', async () => {
  const g = grownup();
  const need = await post(g, '/api/family/children/new', body({ password: undefined }));
  assert.equal(need.status, 403); assert.equal(need.json.needPassword, true); assert.equal(need.json.field, 'password');
  const wrong = await post(g, '/api/family/children/new', body({ password: 'not-my-password' }));
  assert.equal(wrong.status, 403);
  assert.equal(RL.count(RL.loginLockKey(g.username)), 1, 'counts toward the sign-in lock');
  for (let i = 0; i < 4; i++) await post(g, '/api/family/children/new', body({ password: 'nope-nope-nope' }));
  assert.equal((await post(g, '/api/family/children/new', body())).status, 429, '5 wrong tries: locked, even with the right password');
  // Fresh within 10 minutes on the same session: no password needed.
  RL._reset();
  const c = cookieFor(g.id);
  assert.equal((await call(c, '/api/family/children/new', { method: 'POST', body: body() })).status, 200);
  // The page asks for the password only when the step-up isn't fresh.
  assert.match((await call(cookieFor(g.id), '/family/children/new')).text, /<div class="field" data-reauth ><label for="pw-made">/);
  assert.match((await call(c, '/family/children/new')).text, /<div class="field" data-reauth hidden><label for="pw-made">/);
  assert.equal((await call(c, '/api/family/children/new', { method: 'POST', body: body({ password: undefined }) })).status, 200);
});

test('the name follows kid rules on this route (no real names, birth years, link codes, or the grown-up\'s own name)', async () => {
  const g = grownup('SarahJones');
  const refused = async (username, re) => { const r = await post(g, '/api/family/children/new', body({ username })); assert.equal(r.status, 400, `${username}: ${r.text}`); assert.equal(r.json.field, 'username'); if (re) assert.match(r.json.error, re); };
  await refused('EmmaSmith', /real name/i);
  await refused('Alex2015', /birth|year/i);
  await refused('K7Q4MZ9');
  await refused('JonesKid', /your own name/);
  await refused('SARAH_77', /your own name/);
  await refused('ab');
  const taken = kid(); await refused(taken.username, /taken/i);
  await refused('MagicCups', /taken/i);
  assert.equal(F.nameLikeGrownup('Starfish', 'SarahJones'), false);
  assert.equal(F.nameLikeGrownup('Jone5Kid', 'SarahJones'), true, 'digits ignored');
  assert.equal(F.nameLikeGrownup('BobbyRocket', 'Bob'), true);
  // The page never asks for age, birthday, real name, school, photo, email or phone.
  const page = await as(g)('/family/children/new');
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.text, /type="email"|type="tel"|type="date"|type="file"|name="(age|birthday|email|phone|school|realName|displayName)"/);
});

test('the password follows kid rules, typed twice, and is not the grown-up\'s own; it is never echoed or audited', async () => {
  const g = grownup();
  const bad = async (over, field) => { const r = await post(g, '/api/family/children/new', body(over)); assert.equal(r.status, 400, r.text); assert.equal(r.json.field, field); return r; };
  await bad({ newPassword: 'abc', newConfirm: 'abc' }, 'newPassword');
  await bad({ newPassword: 'password', newConfirm: 'password' }, 'newPassword');
  await bad({ username: 'Moonbeam', newPassword: 'moonbeam1', newConfirm: 'moonbeam1' }, 'newPassword');
  await bad({ newConfirm: 'something-else' }, 'newConfirm');
  const same = await bad({ newPassword: PW, newConfirm: PW }, 'newPassword');
  assert.match(same.json.error, /different password from yours/);
  const { child, res } = await make(g);
  assert.doesNotMatch(res.text, new RegExp(KID_PW));
  assert.ok(auth.verifyPassword(child, KID_PW));
  for (const a of q.all('SELECT * FROM audit_log WHERE target IN (?,?)', child.id, famOf(g).id)) assert.doesNotMatch(a.details, new RegExp(`${KID_PW}|${child.username}`), a.action);
});

test('both boxes are required, each with its own field error', async () => {
  const g = grownup();
  let r = await post(g, '/api/family/children/new', body({ ack: undefined }));
  assert.equal(r.status, 400); assert.equal(r.json.field, 'ack');
  r = await post(g, '/api/family/children/new', body({ guardian: undefined }));
  assert.equal(r.status, 400); assert.equal(r.json.field, 'guardian');
  r = await post(g, '/api/family/children/new', body({ ack: 'no', guardian: '1' }));
  assert.equal(r.json.field, 'ack');
});

test('one transaction: an ordinary kid account, linked, the notice record, three audits with ids only, the funnel count', async () => {
  const g = grownup();
  const before = q.get("SELECT COALESCE(SUM(n), 0) n FROM funnel_counts WHERE step='parent.child'").n;
  const { child, token, res } = await make(g);
  assert.equal(res.json.redirect, `/family?made=${encodeURIComponent(token)}`);
  assert.equal(child.account_type, 'kid'); assert.equal(child.role, 'player'); assert.equal(child.is_guest, 0);
  assert.ok(child.friend_code); assert.equal(child.display_name, child.username); assert.equal(child.chat_enabled, 1);
  assert.equal(child.made_by, g.id); assert.equal(child.made_by_family, famOf(g).id); assert.ok(child.made_at);
  assert.equal(F.linkOf(child.id).family_id, famOf(g).id);
  const ack = q.get('SELECT * FROM family_notice_acks WHERE child_id=?', child.id);
  assert.equal(ack.notice_version, LEGAL_UPDATED); assert.equal(ack.method, 'notice-ack'); assert.equal(ack.guardian_statement, 1);
  assert.equal(ack.grownup_id, g.id); assert.equal(ack.family_id, famOf(g).id);
  assert.deepEqual(JSON.parse(audits('user.signup', child.id)[0].details), { by_grownup: g.id, family: famOf(g).id, parentMade: true });
  assert.deepEqual(JSON.parse(audits('family.child.create', famOf(g).id).at(-1).details), { child: child.id });
  assert.deepEqual(JSON.parse(audits('family.link', famOf(g).id).at(-1).details), { child: child.id, by: 'create' });
  assert.equal(q.get("SELECT COALESCE(SUM(n), 0) n FROM funnel_counts WHERE step='parent.child'").n, before + 1);
  // /family: the row says the grown-up made it, with Switch open and "ready"; no Remove (Delete instead).
  const page = await call(cookieFor(g.id), `/family?made=${encodeURIComponent(token)}`);
  assert.match(page.text, /You made this account/);
  assert.match(page.text, /Account ready\. .*can sign in/);
  assert.match(page.text, /<details class="famkid-act" id="made-switch" open><summary class="btn btn-primary">Switch to /);
  assert.doesNotMatch(page.text, new RegExp(`children/${token}/remove`));
  assert.match(page.text, new RegExp(`children/${token}/data#delete`));
  assert.equal((await post(g, `/api/family/children/${token}/remove`, {})).status, 404, 'no Remove for a made child');
});

test('a clash inside the transaction rolls everything back: no orphan account, link or record', async () => {
  const g = grownup();
  const name = `Clash${fresh()}`;
  q.run("CREATE TEMP TRIGGER made_clash BEFORE INSERT ON family_notice_acks BEGIN SELECT RAISE(ABORT, 'UNIQUE constraint failed: test'); END;");
  try {
    const r = await post(g, '/api/family/children/new', body({ username: name }));
    assert.equal(r.status, 400); assert.equal(r.json.field, 'username');
  } finally { q.run('DROP TRIGGER made_clash'); }
  assert.equal(auth.getUserByName(name), null);
  assert.equal(F.childrenOf(famOf(g).id).length, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM users WHERE made_by_family=?', famOf(g).id).n, 0);
});

test('limits: 2 a day; FAMILY_MAX_CHILDREN a rolling year, counting unlinked and deleted accounts; the live cap (Basic = 1)', async () => {
  const g = grownup(), fam = famOf(g);
  await make(g); await make(g);
  let r = await post(g, '/api/family/children/new', body());
  assert.equal(r.status, 409); assert.match(r.json.error, /2 accounts today/);
  // Yesterday's accounts don't count toward today's 2, but do count toward the year.
  q.run('UPDATE users SET made_at=? WHERE made_by_family=?', Date.now() - 2 * DAY, fam.id);
  const { child: c3 } = await make(g);
  // Unlink one and tombstone another: both still count.
  q.run('UPDATE family_children SET unlinked_at=? WHERE child_id=?', Date.now(), c3.id);
  q.run('UPDATE users SET made_at=? WHERE made_by_family=?', Date.now() - 2 * DAY, fam.id);
  await make(g);
  assert.equal(q.get('SELECT COUNT(*) n FROM users WHERE made_by_family=?', fam.id).n, config.familyMaxChildren);
  q.run('UPDATE users SET made_at=? WHERE made_by_family=?', Date.now() - 2 * DAY, fam.id);
  r = await post(g, '/api/family/children/new', body());
  assert.equal(r.status, 409); assert.match(r.json.error, /made 4 accounts in the last 12 months/);
  assert.match((await as(g)('/family/children/new')).text, /made 4 accounts in the last 12 months/, 'the page says so instead of the form');
  // A year later the slots come back.
  q.run('UPDATE users SET made_at=? WHERE made_by_family=?', Date.now() - 366 * DAY, fam.id);
  assert.equal(F.madeLimit(fam), null, '3 still linked, under the live cap of 4');
  // The live cap counts code-linked children too: a 4th child (by code) fills the family.
  await linkByCode(g, kid());
  assert.equal(F.madeLimit(fam), 'full');
  r = await post(g, '/api/family/children/new', body());
  assert.equal(r.status, 409); assert.match(r.json.error, /up to 4 children/);
  // The live cap: a Basic plan covers 1 child, and code-linked children count too.
  const g2 = grownup(), fam2 = famOf(g2);
  q.run("INSERT INTO billing_grants(id, owner_kind, owner_id, plan, until, created_at) VALUES (?,'family',?,'basic',?,?)", uid(10), fam2.id, Date.now() + DAY, Date.now());
  assert.equal(F.maxChildrenFor(fam2.id), 1);
  await linkByCode(g2, kid());
  r = await post(g2, '/api/family/children/new', body());
  assert.equal(r.status, 409); assert.match(r.json.error, /Basic plan covers 1 child/);
});

test('limits: the kid sign-up\'s per-address buckets are shared (counted only for accounts made); refused with an open link report', async () => {
  const g = grownup(), ip = `10.9.${next()}.1`;
  const tryMake = () => F.createChildAccount(g, { username: `Ipq${fresh()}`, password: KID_PW, confirm: KID_PW, ack: true, guardian: true }, { ip });
  for (let i = 0; i < 30; i++) RL.allow(`signup:${ip}`, 30, 3600e3);
  assert.equal(tryMake().code, 'tooManySignups');
  const ip2 = `10.8.${next()}.1`;
  for (let i = 0; i < 2000; i++) RL.allow(`signup-try:${ip2}`, 2000, 3600e3);
  assert.equal(F.createChildAccount(g, { username: 'Whatever1' }, { ip: ip2 }).code, 'slowDown');
  // A refused try (a bad name) doesn't spend the made-accounts bucket; a made account does.
  const ip3 = `10.7.${next()}.1`;
  F.createChildAccount(g, { username: 'EmmaSmith', password: KID_PW, confirm: KID_PW, ack: true, guardian: true }, { ip: ip3 });
  assert.equal(RL.count(`signup:${ip3}`), 0);
  assert.equal(F.createChildAccount(g, { username: `Ipr${fresh()}`, password: KID_PW, confirm: KID_PW, ack: true, guardian: true }, { ip: ip3 }).ok, true);
  assert.equal(RL.count(`signup:${ip3}`), 1);
  // The flood guard on the route: 10 an hour per grown-up.
  const g2 = grownup();
  for (let i = 0; i < 10; i++) await post(g2, '/api/family/children/new', body({ ack: undefined }));
  assert.equal((await post(g2, '/api/family/children/new', body())).status, 429);
  // An open report against the family: a neutral refusal.
  const g3 = grownup();
  q.run("INSERT INTO link_reports(id, child_id, family_id, created_at) VALUES (?,?,?,?)", uid(), kid().id, famOf(g3).id, Date.now());
  const r = await post(g3, '/api/family/children/new', body());
  assert.equal(r.status, 409); assert.equal(r.json.error, "We can't make a new account right now.");
  q.run("UPDATE link_reports SET status='resolved', resolved_at=? WHERE family_id=?", Date.now(), famOf(g3).id);
  assert.equal((await post(g3, '/api/family/children/new', body())).status, 200);
});

test('the identity matrix: a parent-made child is treated exactly like a self-signed-up kid', async () => {
  const g = grownup();
  const { child: made } = await make(g);
  const self = kid();
  const kinds = u => ({
    accountKind: auth.accountKind(u), isChildAccount: F.isChildAccount(u), isGrownup: auth.isGrownup(u), canChangePassword: auth.canChangePassword(u),
    longPasswordKind: auth.longPasswordKind(u), planLimits: JSON.stringify(B.planLimits('free')), pendingCount: F.pendingCount(u),
    publicKeys: Object.keys(auth.publicUser(u)).sort().join(','),
  });
  assert.deepEqual(kinds(made), kinds(self));
  for (const k of Object.keys(auth.publicUser(made))) assert.doesNotMatch(k, /made/);
  assert.equal(JSON.stringify(auth.publicUser(made)).includes(g.id), false);
  // Sessions: the kid rule (60 days), no reauth.
  const life = u => { const c = cookieFor(u.id); const s = q.get('SELECT * FROM sessions WHERE id=?', decodeURIComponent(c.split('=')[1]).split('.')[0]); return s.expires_at - s.created_at; };
  assert.equal(life(made), life(self));
  assert.equal(life(made), auth.SESSION_RULES.standard.max);
  // The same pages and APIs answer the same way.
  for (const p of ['/', '/build', '/friends', '/chat', '/me', '/family', '/family/link', '/grown-ups/signup', `/u/${made.username}`]) {
    const a = await as(made)(p), b = await as(self)(p.replace(made.username, self.username));
    assert.equal(a.status, b.status, p);
  }
  // No badge or marker anywhere a child or the public looks.
  for (const p of [`/u/${made.username}`, '/me', '/']) assert.doesNotMatch((await as(self)(p)).text, /made by|family-verified|parent-made/i, p);
  assert.doesNotMatch((await call(null, `/u/${made.username}`)).text, /made by|family-verified|parent-made/i);
});

test('no page uses "verified", "COPPA-compliant", "consent given" or the like in the parent-made texts', async () => {
  const en = (await import('../../server/i18n/index.js')).dictionary('en');
  const keys = Object.keys(en).filter(k => /^(family\.made\.|family\.switch\.|family\.kept\.|family\.childPw\.|me\.family\.made|info\.(privacy|parents)\.made\.)/.test(k));
  assert.ok(keys.length > 40, `${keys.length} keys`);
  for (const k of keys) assert.doesNotMatch(en[k], /verified|verify|coppa|compliant|consent (given|granted|obtained)|you consent|gives? consent|approved/i, k);
  // The no-consent sentence is on the page, in full, above the button.
  const page = await as(grownup())('/family/children/new');
  assert.match(page.text, /is not a parental consent check under children&#39;s privacy laws, and we don&#39;t treat it as one\.<\/p>|is not a parental consent check under children's privacy laws, and we don't treat it as one\.<\/p>/);
  assert.ok(page.text.indexOf('parental consent check') < page.text.indexOf('Make the account</button>'));
  assert.match(page.text, /href="\/privacy#made"/);
  for (const k of ['keep', 'ai', 'who', 'howLong', 'rights']) assert.ok(page.text.includes(en[`family.made.notice.${k}`].slice(0, 20).replace(/'/g, '&#39;')) || page.text.includes(en[`family.made.notice.${k}`].slice(0, 20)), k);
});

test('translated: the made texts on a German page are German, and marked as English (lang="en" dir="ltr") only until a language has them', async () => {
  const g = grownup();
  q.run("UPDATE users SET lang='de' WHERE id=?", g.id);
  const main = s => (s.match(/<main[\s\S]*<\/main>/) || [''])[0];
  const de = (await import('../../server/i18n/index.js')).dictionary('de');
  const page = await as(auth.getUser(g.id))('/family/children/new');
  assert.match(page.text, /<html lang="de"/);
  assert.match(main(page.text), /<h1>Konto für Ihr Kind erstellen<\/h1>/);
  assert.match(main(page.text), /<li>Was dieses Konto speichert:/);
  assert.match(main(page.text), /<p class="small made-noconsent">Das Erstellen dieses Kontos/);
  assert.doesNotMatch(main(page.text), /lang="en"|Make your child|What this account keeps/);
  const fam = await as(auth.getUser(g.id))('/family');
  assert.ok(main(fam.text).includes(`href="/family/children/new">${de['family.made.add']}</a>`));
  assert.ok(main(fam.text).includes(`href="/family/add">➕ ${de['family.add.cta']}</a>`));
  assert.doesNotMatch(main(fam.text), /lang="en"|Make their account/);
  // The made texts taken out of German (simulated): those are English, marked so.
  await withoutKeys('de', ['family.made'], async () => {
    const gap = await as(auth.getUser(g.id))('/family/children/new');
    assert.match(gap.text, /<html lang="de"/);
    assert.match(gap.text, /<h1 lang="en" dir="ltr">Make your child&#39;s account<\/h1>|<h1 lang="en" dir="ltr">Make your child's account<\/h1>/);
    assert.match(gap.text, /<li lang="en" dir="ltr">What this account keeps:/);
    assert.match(gap.text, /<p class="small made-noconsent" lang="en" dir="ltr">/);
    const gapFam = await as(auth.getUser(g.id))('/family');
    assert.match(gapFam.text, /href="\/family\/children\/new" lang="en" dir="ltr">Make their account/);
  });
});
