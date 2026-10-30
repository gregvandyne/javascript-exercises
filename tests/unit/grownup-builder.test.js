// Grown-ups can build (docs/decisions.md "Grown-ups can build"): a grown-up (parent) account uses the Builder and the
// Studio, shares each game with just their family, just their grown-up connections, or everyone, and every child-safety
// fence around grown-up accounts stays: connections are adults only (in both directions), there is no /u/ profile and no
// contact action, and nothing public ever says which children belong to a grown-up. Billing is on against the fake
// Stripe (family pages are on exactly when billing is).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const fake = await startFakeStripe({ webhookSecret: 'whsec_fake_gb', apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_gb';
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { q, uid, migrate } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const F = await import('../../server/services/family.js');
const S = await import('../../server/services/schools.js');
const friends = await import('../../server/services/friends.js');
const games = await import('../../server/services/games.js');
const pub = await import('../../server/services/publish.js');
const usage = await import('../../server/builder/usage.js');
const { TEMPLATE_KEYS } = await import('../../server/builder/catalog.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const { grownupMay } = await import('../../server/routes/family.js');
const i18n = await import('../../server/i18n/index.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { config.stripeApiKey = 'rk_test_fake'; resetLimits(); });

const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(cookie, path, { method = 'GET', body, raw, headers = {} } = {}) {
  const h = { ...headers, ...(cookie ? { cookie } : {}) };
  if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, location: r.headers.get('location') };
}
const as = u => (path, opts) => call(u ? cookieFor(u.id) : null, path, opts);
let n = 0;
const kid = (name = `GbKid${++n}`, display) => auth.createUser({ username: name, displayName: display, password: 'rainbow-77' });
function grownup(name = `GbParent${++n}`) { const u = auth.createUser({ username: name, password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(u); return auth.getUser(u.id); }
const admin = auth.createUser({ username: 'GbAdmin', password: 'admin-password-1', role: 'admin' });
const GOOD = '<title>G</title><canvas></canvas><script>BRB.sfx.play("win")</script>';
/** A game with one version (scan result given), not yet shared. */
function draft(owner, title = 'Grown-up game', safetyStatus = 'pass') {
  const g = games.createGame(owner.id, { title });
  games.addVersion(g.id, GOOD, { createdBy: owner.id, safetyStatus });
  return games.getGame(g.id);
}
async function shared(owner, visibility, title) {
  const g = draft(owner, title);
  const r = await pub.publish(owner, g.id, visibility);
  assert.equal(r.state, 'live', `${visibility}: ${r.message}`);
  return games.getGame(g.id);
}
const linkUp = async (g, child) => {
  const c = await as(child)('/api/me/family/code', { method: 'POST', body: {} }); assert.equal(c.status, 200, c.text);
  assert.equal((await as(g)('/api/family/link', { method: 'POST', body: { code: c.json.code } })).status, 200);
  assert.equal((await as(child)('/api/me/family/answer', { method: 'POST', body: { answer: 'yes' } })).status, 200);
};
const famOf = g => F.familyOfOwner(g.id);
const grant = (fam, plan = 'family') => q.run('INSERT INTO billing_grants(id, owner_kind, owner_id, plan, until, created_at) VALUES (?,?,?,?,?,?)', uid(10), 'family', fam.id, plan, Date.now() + 86400e3, Date.now());
const frameOf = (g, viewer) => `/frame/${auth.signToken({ v: g.published_version_id, g: g.id, u: viewer ? viewer.id : null }, 600)}`;
const ids = list => list.map(x => x.id);
const PRICE = /[$€£¥₪]\s?\d|\d\s?(?:[$€£¥₪]|USD|EUR|GBP)\b|\/\s?(?:month|year|mo)\b/i;

// ---------------------------------------------------------------- building and sharing
test('a grown-up opens the Builder, makes a game from a template, chats, publishes and deletes an upload', async () => {
  const g = grownup();
  const go = as(g);
  const build = await go('/build');
  assert.equal(build.status, 200, build.text.slice(0, 200));
  assert.match(build.text, /id="newgame"/); assert.match(build.text, /data-template=/);
  assert.doesNotMatch(build.text, PRICE, 'no price on /build');
  const made = await go('/api/studio/new', { method: 'POST', body: { template: TEMPLATE_KEYS[0] } });
  assert.equal(made.status, 200, made.text);
  const id = made.json.id;
  const studio = await go(`/studio/${id}`);
  assert.equal(studio.status, 200);
  assert.doesNotMatch(studio.text.replace(/<script[^>]*id="page-data"[\s\S]*?<\/script>/, ''), PRICE, 'no price in the Studio');
  const st = (await go(`/api/studio/${id}`)).json;
  assert.deepEqual(st.shareOptions, ['private', 'family', 'friends', 'public']);
  assert.equal(st.shareDefault, 'family');
  assert.deepEqual(st.grownup, { name: g.display_name, seePlans: true });
  assert.equal(st.shareText.friends, i18n.tEn('studio.shareText.connections'), 'friends reads as grown-up connections');
  assert.equal(st.grownUpLink, false, 'the kid-only "a grown-up can link" hint never shows');
  // The chat endpoint is open (an empty message is refused by the route itself, not by the fence).
  const chat = await go(`/api/studio/${id}/chat`, { method: 'POST', body: { text: '', detach: true } });
  assert.equal(chat.status, 400, chat.text);
  // An upload, then DELETE (its own fence list).
  const up = await go(`/api/studio/${id}/uploads?name=notes.txt`, { method: 'POST', raw: 'Make the sky purple.', headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(up.status, 200, up.text);
  assert.equal((await go(`/api/studio/${id}/uploads/${up.json.upload.id}`)).status, 200);
  const del = await go(`/api/studio/${id}/uploads/${up.json.upload.id}`, { method: 'DELETE' });
  assert.equal(del.status, 200, del.text);
  // Publish to the family: live at once when the version scans clean, else it waits for a person (a group level).
  const safety = games.getVersion(games.getGame(id).current_version_id).safety_status;
  const p = await go(`/api/studio/${id}/publish`, { method: 'POST', body: { visibility: 'family' } });
  assert.equal(p.status, 200, p.text);
  // (shareReply sends the Studio state as `state`; the game row says where it is.)
  if (safety === 'pass') {
    assert.equal(p.json.message, i18n.tEn('publish.liveFamily'));
    assert.equal(games.getGame(id).visibility, 'family'); assert.equal(p.json.state.status.label, 'Live: 🏠 My family');
  } else {
    assert.equal(games.getGame(id).status, 'in_review'); assert.equal(games.getGame(id).pending_visibility, 'family');
  }
  // Meta, save and the other Studio calls go through the fence too.
  for (const action of ['meta', 'save', 'restore', 'update', 'visibility', 'delete']) assert.ok(grownupMay('POST', `/api/studio/${id}/${action}`), action);
  assert.ok(grownupMay('GET', `/api/studio/${id}/live`)); assert.ok(grownupMay('DELETE', `/api/studio/${id}/uploads/abc`));
  assert.ok(!grownupMay('DELETE', '/api/me'), 'DELETE has its own short list');
});

test('sharing options: grown-ups get private, family, connections, public; kids keep theirs and can never pick family', async () => {
  const g = grownup(), k = kid();
  assert.deepEqual(S.sharingOptions(g), ['private', 'family', 'friends', 'public']);
  assert.equal(S.shareDefault(g), 'family');
  assert.deepEqual(S.sharingOptions(k), ['private', 'friends', 'public']);
  assert.equal(S.shareDefault(k), 'private');
  const kg = draft(k, 'Kid family try');
  const r = await as(k)(`/api/studio/${kg.id}/publish`, { method: 'POST', body: { visibility: 'family' } });
  assert.equal(r.status, 400); assert.equal(games.getGame(kg.id).visibility, 'private'); assert.equal(games.getGame(kg.id).status, 'draft');
  // Families off: no family choice, and the default is private.
  const was = config.stripeApiKey; config.stripeApiKey = '';
  try {
    assert.deepEqual(S.sharingOptions(g), ['private', 'friends', 'public']);
    assert.equal(S.shareDefault(g), 'private');
  } finally { config.stripeApiKey = was; }
});

// ---------------------------------------------------------------- moderation and quota
test('moderation: a clean family share is live at once, a flagged one waits for a person, public is the kids\' pipeline', async () => {
  const g = grownup(), k = kid();
  const clean = draft(g, 'Clean family');
  assert.equal((await pub.publish(g, clean.id, 'family')).state, 'live');
  const flagged = draft(g, 'Flagged family', 'flag');
  const r = await pub.publish(g, flagged.id, 'family');
  assert.equal(r.state, 'in_review');
  let cur = games.getGame(flagged.id);
  assert.equal(cur.status, 'in_review'); assert.equal(cur.pending_visibility, 'family');
  const a = pub.approve(admin, flagged.id, 'fine');
  assert.equal(a.visibility, 'family'); assert.equal(a.status, 'published');
  const rep = JSON.parse(games.getVersion(a.published_version_id).review_report);
  assert.equal(rep.for, 'family', 'the approval is stored for the family only');
  assert.ok(!pub.approvalCovers({ vis: 'family', classes: [] }, 'public'), 'a family approval never covers everyone');
  assert.ok(pub.approvalCovers({ vis: 'public', classes: [] }, 'family'), 'a public approval covers the family');
  // Public: exactly what a kid's public publish does (here the model is unavailable, so both wait in the admin queue).
  const gp = draft(g, 'Grown-up public'), kp = draft(k, 'Kid public');
  const rg = await pub.publish(g, gp.id, 'public'), rk = await pub.publish(k, kp.id, 'public');
  assert.equal(rg.state, rk.state); assert.equal(rg.state, 'in_review');
  const vg = games.getVersion(games.getGame(gp.id).pending_version_id), vk = games.getVersion(games.getGame(kp.id).pending_version_id);
  assert.equal(vg.review_status, vk.review_status); assert.equal(vg.review_status, 'queued');
  assert.deepEqual(Object.keys(JSON.parse(vg.review_report)).sort(), Object.keys(JSON.parse(vk.review_report)).sort(), 'the same review ran');
  // The admin queue shows the grown-up as plain text with the tag, never a /u/ link.
  const queue = await as(admin)('/admin');
  assert.equal(queue.status, 200);
  assert.match(queue.text, /Grown-up builder/);
  assert.doesNotMatch(queue.text, new RegExp(`href="/u/${g.username}"`));
  assert.match(queue.text, new RegExp(`href="/u/${k.username}"`), 'kids keep their profile link');
  pub.approve(admin, gp.id);
  assert.equal(games.getGame(gp.id).visibility, 'public');
});

test('quota: the family plan covers its grown-up owner (outside maxChildren); without one the free daily messages apply', async () => {
  const g = grownup(), k = kid();
  await linkUp(g, k);
  const fam = famOf(g);
  assert.equal(usage.familyOf(g.id), null, 'no plan: no family pays');
  const free = usage.allowanceFor(g);
  assert.equal(free.source, 'free'); assert.equal(free.daily, usage.dailyTurns()); assert.equal(free.familyId, null);
  grant(fam, 'basic');
  assert.equal(usage.familyOf(g.id), fam.id, 'the owner is covered on Basic');
  assert.deepEqual(usage.coveredChildren(fam.id, 'basic'), [k.id], 'and does not use the one Basic child place');
  assert.equal(usage.familyOf(k.id), fam.id);
  const a = usage.allowanceFor(g);
  assert.equal(a.familyId, fam.id); assert.equal(typeof a.extraLeft, 'number');
  // The /family page: Your games, with the owner's own use and no price.
  draft(g, 'Panel game');
  const page = await as(g)('/family');
  assert.equal(page.status, 200);
  assert.match(page.text, /id="your-games"/); assert.match(page.text, /Panel game/); assert.match(page.text, /href="\/family\/connections"/);
  assert.doesNotMatch(page.text, PRICE, 'no price on /family');
  assert.deepEqual(F.ownerUsage(fam.id, g.id), { yesterday: 0, month: F.ownerUsage(fam.id, g.id).month });
  assert.deepEqual(F.ownerUsage(fam.id, k.id), { yesterday: 0, month: 0 }, 'only for the family\'s own owner');
});

// ---------------------------------------------------------------- connections and the fence
test('connections: two grown-ups connect by code; the page has no chat and no profile links; the fence still holds', async () => {
  const A = grownup(), B = grownup();
  assert.match(A.friend_code, /^[A-Z2-9]{6}$/, 'grown-ups have a friend code now');
  const add = await as(A)('/api/friends/add', { method: 'POST', body: { code: B.friend_code } });
  assert.equal(add.status, 200, add.text); assert.equal(add.json.state, 'sent');
  let pageB = await as(B)('/family/connections');
  assert.equal(pageB.status, 200); assert.match(pageB.text, new RegExp(`/api/friends/${A.id}/accept`));
  const acc = await as(B)(`/api/friends/${A.id}/accept`, { method: 'POST', body: {} });
  assert.equal(acc.status, 200, acc.text);
  assert.ok(games.areFriends(A.id, B.id) && games.areFriends(B.id, A.id));
  for (const [me, other] of [[A, B], [B, A]]) {
    const p = await as(me)('/family/connections');
    assert.equal(p.status, 200);
    assert.match(p.text, new RegExp(`@${other.username}`));
    assert.match(p.text, new RegExp(me.friend_code));
    assert.doesNotMatch(p.text, /href="\/chat|href="\/u\//, 'no chat button and no profile link');
  }
  // A connections game: the other grown-up can open it.
  const cg = await shared(A, 'friends', 'For my connections');
  assert.ok(games.canView(B, cg));
  assert.equal((await as(B)(`/g/${cg.slug}`)).status, 200);
  // Still closed: chat, the kids' friends page, profiles, chat APIs.
  for (const [method, path] of [['GET', '/chat'], ['GET', '/friends'], ['GET', `/u/${B.username}`], ['GET', '/u/x'], ['GET', '/api/chat'], ['POST', `/api/chat/${B.username}`]]) {
    const r = await as(A)(path, { method, body: method === 'POST' ? { text: 'hi' } : undefined });
    assert.equal(r.status, 404, `${method} ${path} -> ${r.status}`);
  }
  // The Family tab counts waiting connection requests.
  const C = grownup();
  await as(C)('/api/friends/add', { method: 'POST', body: { code: A.friend_code } });
  const home = await as(A)('/');
  assert.match(home.text, /class="tab" href="\/family"[^>]*>(?:(?!<\/a>)[\s\S])*class="badge"/);
});

test('migration 0034 backfills unique codes for grown-ups and deletes any mixed adult-kid friend row', () => {
  const g1 = grownup(), g2 = grownup(), k = kid(), k2 = kid();
  q.run('UPDATE users SET friend_code=NULL WHERE id IN (?,?)', g1.id, g2.id);
  const t = Date.now();
  q.run("INSERT INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'accepted',?), (?,?,'accepted',?), (?,?,'pending',?)", g1.id, k.id, t, k.id, g1.id, t, k.id, g2.id, t);
  q.run("INSERT INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'accepted',?)", k.id, k2.id, t);
  q.run("DELETE FROM migrations WHERE name='0034_grownup_builder'");
  migrate();
  const c1 = auth.getUser(g1.id).friend_code, c2 = auth.getUser(g2.id).friend_code;
  assert.match(c1, /^[A-Z2-9]{6}$/); assert.match(c2, /^[A-Z2-9]{6}$/); assert.notEqual(c1, c2);
  assert.equal(q.get('SELECT COUNT(*) n FROM users WHERE friend_code=?', c1).n, 1);
  assert.equal(q.get('SELECT COUNT(*) n FROM friends WHERE user_id IN (?,?) OR friend_id IN (?,?)', g1.id, g2.id, g1.id, g2.id).n, 0, 'mixed rows gone');
  assert.equal(q.get('SELECT COUNT(*) n FROM friends WHERE user_id=? AND friend_id=?', k.id, k2.id).n, 1, 'kid friendships kept');
  assert.ok(q.get("SELECT 1 FROM migrations WHERE name='0034_grownup_builder'"));
});

// ---------------------------------------------------------------- child safety: negative tests
test('a kid typing a grown-up\'s code, and a grown-up typing a kid\'s, both get "not found" and nothing is stored', async () => {
  const g = grownup(), k = kid();
  const notFound = i18n.tEn('friends.api.codeNotFound');
  const rows = () => q.get('SELECT COUNT(*) n FROM friends WHERE user_id IN (?,?) OR friend_id IN (?,?)', g.id, k.id, g.id, k.id).n;
  const r1 = await as(k)('/api/friends/add', { method: 'POST', body: { code: g.friend_code } });
  assert.equal(r1.status, 400); assert.equal(r1.json.error, notFound);
  const r2 = await as(g)('/api/friends/add', { method: 'POST', body: { code: k.friend_code } });
  assert.equal(r2.status, 400); assert.equal(r2.json.error, notFound);
  const r3 = await as(k)('/api/friends/add', { method: 'POST', body: { code: 'ZZZZZZ' } });
  assert.equal(r3.json.error, notFound, 'word for word the same as a code nobody has');
  assert.equal(rows(), 0);
  // Even a linked child and their own grown-up can't be friends.
  await linkUp(g, k);
  assert.equal((await as(k)('/api/friends/add', { method: 'POST', body: { code: g.friend_code } })).json.error, notFound);
  assert.equal(rows(), 0);
});

test('a forged mixed request (a row that should never exist) is refused on accept, in both directions', async () => {
  const g = grownup(), k = kid();
  const t = Date.now();
  q.run("INSERT INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'pending',?)", g.id, k.id, t);
  assert.equal(friends.accept(k, g.id), false);
  q.run("INSERT INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'pending',?)", k.id, g.id, t);
  const r = await as(g)(`/api/friends/${k.id}/accept`, { method: 'POST', body: {} });
  assert.equal(r.status, 404);
  assert.equal(q.get("SELECT COUNT(*) n FROM friends WHERE status='accepted' AND (user_id IN (?,?))", g.id, k.id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM friends WHERE user_id IN (?,?)', g.id, k.id).n, 0, 'the forged rows are dropped');
  assert.equal(games.areFriends(g.id, k.id), false);
});

test('a family game: only the owner\'s linked children (not after an unlink); never in another child\'s pages or lists', async () => {
  const g = grownup(), mine = kid(), other = kid(), pending = kid();
  const g2 = grownup(), theirs = kid();
  await linkUp(g, mine); await linkUp(g2, theirs);
  // A request the child hasn't answered yet: not a link.
  const c = await as(pending)('/api/me/family/code', { method: 'POST', body: {} });
  await as(g)('/api/family/link', { method: 'POST', body: { code: c.json.code } });
  const fg = await shared(g, 'family', 'Zebra family quest');
  q.run('INSERT INTO likes(game_id, user_id, created_at) VALUES (?,?,?)', fg.id, other.id, Date.now());   // a stale like
  assert.ok(games.canView(mine, fg)); assert.ok(games.canView(g, fg)); assert.ok(games.canView(admin, fg));
  for (const [who, u] of [['unrelated kid', other], ['pending kid', pending], ['another family\'s kid', theirs], ['another grown-up', g2], ['signed out', null]]) {
    assert.equal(games.canView(u, fg), false, who);
    const go = as(u);
    assert.equal((await go(`/g/${fg.slug}`)).status, 404, `${who}: /g/`);
    assert.equal((await go(`/play/${fg.slug}`)).status, 404, `${who}: /play/`);
    assert.equal((await go(frameOf(fg, u))).status, 404, `${who}: /frame/`);
    assert.ok(!ids(games.search(u, { text: 'Zebra family' })).includes(fg.id), `${who}: search`);
    assert.ok(!ids(games.listVisible(u, { order: 'new', limit: 500 })).includes(fg.id), `${who}: home rails`);
    assert.ok(!ids(games.similar(u, { ...fg, id: 'x' }, 50)).includes(fg.id), `${who}: similar`);
    if (u) assert.ok(!ids(games.favorites(u, u.id, 50)).includes(fg.id), `${who}: favorites`);
    if (u) assert.doesNotMatch((await go('/search?q=Zebra')).text, /Zebra family quest/, `${who}: /search page`);
  }
  // The linked child opens it everywhere, and finds it on their home page.
  const go = as(mine);
  assert.equal((await go(`/g/${fg.slug}`)).status, 200);
  assert.equal((await go(`/play/${fg.slug}`)).status, 200);
  assert.equal((await go(frameOf(fg, mine))).status, 200);
  assert.ok(ids(games.search(mine, { text: 'Zebra family' })).includes(fg.id));
  assert.match((await go('/')).text, /Zebra family quest/);
  // canView and visibleWhere agree for every viewer.
  for (const u of [mine, other, pending, theirs, g, g2]) {
    assert.equal(ids(games.listVisible(u, { order: 'new', limit: 500 })).includes(fg.id), games.canView(u, fg), u.username);
  }
  // Unlinked: gone for that child.
  F.removeChild(g, F.requestToken(famOf(g).id, mine.id));
  assert.equal(games.canView(mine, fg), false);
  assert.equal((await go(`/g/${fg.slug}`)).status, 404);
  assert.ok(!ids(games.listVisible(mine, { order: 'new', limit: 500 })).includes(fg.id));
});

test('a grown-up\'s connections game never reaches any kid, their own linked child included; a connected grown-up opens it', async () => {
  const g = grownup(), child = kid(), other = kid(), adult = grownup();
  await linkUp(g, child);
  await as(g)('/api/friends/add', { method: 'POST', body: { code: adult.friend_code } });
  await as(adult)(`/api/friends/${g.id}/accept`, { method: 'POST', body: {} });
  const cg = await shared(g, 'friends', 'Quokka connections game');
  for (const u of [child, other]) {
    assert.equal(games.canView(u, cg), false);
    assert.equal((await as(u)(`/g/${cg.slug}`)).status, 404);
    assert.ok(!ids(games.listVisible(u, { order: 'new', limit: 500 })).includes(cg.id));
    assert.ok(!ids(games.fromFriends(u, 50)).includes(cg.id));
    assert.ok(!ids(games.search(u, { text: 'Quokka' })).includes(cg.id));
  }
  assert.ok(games.canView(adult, cg));
  assert.equal((await as(adult)(`/g/${cg.slug}`)).status, 200);
  assert.ok(ids(games.fromFriends(adult, 50)).includes(cg.id));
});

test('a public grown-up game: a "Grown-up builder" tag, no profile link and no contact action; /u/ is a 404; not in builder search', async () => {
  const g = grownup('GbPublicParent'), k = kid();
  const pg = draft(g, 'Public parent game');
  await pub.publish(g, pg.id, 'public'); pub.approve(admin, pg.id);
  const live = games.getGame(pg.id);
  assert.equal(live.visibility, 'public');
  for (const [who, u] of [['kid', k], ['signed out', null], ['grown-up', grownup()]]) {
    const r = await as(u)(`/g/${live.slug}`);
    assert.equal(r.status, 200, who);
    assert.match(r.text, /ownerchip-grownup/); assert.match(r.text, /Grown-up builder/);
    assert.doesNotMatch(r.text, new RegExp(`href="/u/${g.username}"`), `${who}: no profile link`);
    assert.doesNotMatch(r.text, /href="\/chat|\/api\/friends|friend request|id="followbtn"/i, `${who}: no contact action`);
  }
  assert.equal((await as(k)(`/u/${g.username}`)).status, 404);
  assert.equal((await call(null, `/u/${g.username}`)).status, 404);
  assert.deepEqual(games.searchBuilders(k, 'GbPublicParent'), []);
  assert.ok(ids(games.search(k, { text: 'Public parent game' })).includes(live.id), 'the game itself is in search like any game');
  // "Make one like this" is there for a grown-up viewer now (the Builder is open to them).
  assert.match((await as(grownup())(`/g/${live.slug}`)).text, /id="makelike"/);
});

test('which children belong to a grown-up is never shown on a public surface', async () => {
  const g = grownup('GbQuietParent');
  const a = kid('GbSecretChildOne', 'Wilhelmina Secret'), b = kid('GbSecretChildTwo', 'Bartholomew Hidden');
  await linkUp(g, a); await linkUp(g, b);
  const pg = draft(g, 'Quiet parent game');
  await pub.publish(g, pg.id, 'public'); pub.approve(admin, pg.id);
  const live = games.getGame(pg.id);
  await shared(g, 'family', 'Quiet family only');
  const secret = /GbSecretChild|Wilhelmina|Bartholomew/;
  const viewers = [['signed out', null], ['unrelated kid', kid()], ['another grown-up', grownup()]];
  for (const [who, u] of viewers) {
    for (const path of [`/g/${live.slug}`, `/play/${live.slug}`, '/', '/search?q=Quiet', '/api/search?q=Quiet', `/search?q=${g.username}`]) {
      const r = await as(u)(path);
      assert.doesNotMatch(r.text, secret, `${who}: ${path}`);
    }
  }
  assert.doesNotMatch((await call(null, '/sitemap.xml')).text, secret);
});

const connect = async (A, B) => {
  assert.equal((await as(A)('/api/friends/add', { method: 'POST', body: { code: B.friend_code } })).status, 200);
  assert.equal((await as(B)(`/api/friends/${A.id}/accept`, { method: 'POST', body: {} })).status, 200);
};
test('a family game that widens: the owner\'s children\'s scores and likes are never shown outside that family', async () => {
  const P = grownup('GbBoardParent'), C = grownup('GbBoardContact');
  await connect(P, C);
  const k1 = kid('GbBoardChildOne', 'Ottoline Board'), k2 = kid('GbBoardChildTwo', 'Peregrine Board');
  await linkUp(P, k1); await linkUp(P, k2);
  const other = kid('GbBoardOutsider', 'Outsider Kid');
  const fg = await shared(P, 'family', 'Board family game');
  assert.ok(games.canView(k1, fg));
  games.submitScore(fg.id, k1.id, 900); games.submitScore(fg.id, k2.id, 800);
  games.toggleLike(fg.id, k1.id);
  const secret = /GbBoardChild|Ottoline|Peregrine/;
  const board = async (u, g) => (await as(u)(`/api/games/${g.id}/leaderboard`)).json.rows;
  // Inside the family: the board shows the children (to their grown-up and to each other).
  assert.match((await as(P)(`/g/${fg.slug}`)).text, /Ottoline Board/);
  assert.equal((await board(k2, fg)).length, 2);
  // Connections: the connected grown-up sees no child on the board.
  let r = await as(P)(`/api/studio/${fg.id}/visibility`, { method: 'POST', body: { visibility: 'friends' } });
  assert.equal(r.status, 200, r.text);
  let g = games.getGame(fg.id); assert.equal(g.visibility, 'friends');
  assert.ok(games.canView(C, g));
  assert.doesNotMatch((await as(C)(`/g/${g.slug}`)).text, secret, 'connection: game page');
  assert.equal((await board(C, g)).length, 0, 'connection: leaderboard API');
  // Public: no outsider (kid, grown-up, signed out) sees them; an outsider's own score still shows.
  pub.approve(admin, g.id);   // in case the widening waits for a person
  r = await pub.setVisibility(P, g.id, 'public');
  if (r.state === 'in_review') pub.approve(admin, g.id);
  g = games.getGame(fg.id); assert.equal(g.visibility, 'public', JSON.stringify(r));
  games.submitScore(g.id, other.id, 10);
  for (const [who, u] of [['other kid', other], ['connection', C], ['another grown-up', grownup()], ['signed out', null]]) {
    assert.doesNotMatch((await as(u)(`/g/${g.slug}`)).text, secret, `${who}: game page`);
    const rows = await board(u, g);
    assert.equal(rows.length, 1, `${who}: only the outsider's score`);
    assert.doesNotMatch(JSON.stringify(rows), secret);
    assert.ok(!ids(games.favorites(u, k1.id)).includes(g.id), `${who}: the child's like on their grown-up's game is not listed`);
  }
  assert.doesNotMatch((await as(other)(`/u/${k1.username}`)).text, /Board family game/, 'kid profile favourites');
  // The family still sees its own.
  assert.equal((await board(k1, g)).length, 3); assert.equal((await board(P, g)).length, 3);
  assert.ok(ids(games.favorites(k1, k1.id)).includes(g.id), 'the child sees their own like');
  assert.ok(ids(games.favorites(k2, k1.id)).includes(g.id), 'a sibling sees it');
  // A kid's like on an unrelated grown-up's public game is listed as usual.
  const U = grownup(); const ug = draft(U, 'Unrelated public'); await pub.publish(U, ug.id, 'public'); pub.approve(admin, ug.id);
  games.toggleLike(ug.id, k1.id);
  assert.ok(ids(games.favorites(other, k1.id)).includes(ug.id));
});

test('families switched off: a grown-up\'s live family game can still be updated; a waiting family review stays family', async () => {
  const P = grownup(), k = kid();
  await linkUp(P, k);
  const fg = await shared(P, 'family', 'Off family game');
  const pend = await shared(P, 'family', 'Off pending game');
  const flagged = games.addVersion(pend.id, GOOD, { createdBy: P.id, safetyStatus: 'warn' });
  await pub.publish(P, pend.id, 'family', { versionId: flagged.id });
  assert.equal(games.getGame(pend.id).pending_visibility, 'family');
  const was = config.stripeApiKey; config.stripeApiKey = '';
  try {
    assert.equal(F.familiesOn(), false);
    assert.deepEqual(S.sharingOptions(P), ['private', 'friends', 'public'], 'no new family shares');
    assert.ok(S.sharingOptions(P, games.getGame(fg.id)).includes('family'), 'a game already at family keeps it');
    games.addVersion(fg.id, GOOD.replace('win', 'coin'), { createdBy: P.id, safetyStatus: 'pass' });
    const r = await as(P)(`/api/studio/${fg.id}/update`, { method: 'POST', body: {} });
    assert.equal(r.status, 200, r.text);
    const g = games.getGame(fg.id);
    assert.equal(g.visibility, 'family'); assert.equal(g.published_version_id, g.current_version_id, 'the update is live');
    assert.ok(r.json.state.shareOptions.includes('family'), 'the share sheet can show its level');
    const a = pub.approve(admin, pend.id);
    assert.equal(a.visibility, 'family', 'the approval is not turned into private');
    // A draft still can't start at family while family pages are off.
    const d = draft(P, 'Off draft');
    assert.equal((await pub.publish(P, d.id, 'family')).state, 'blocked');
  } finally { config.stripeApiKey = was; }
});

test('a grown-up\'s connections toast names their connections; the plans link only while /plans is open and not covered', async () => {
  const P = grownup();
  const d = draft(P, 'Toast game');
  const r = await pub.publish(P, d.id, 'friends');
  assert.equal(r.message, i18n.tEn('publish.liveConnections'));
  const k = kid(); const kd = draft(k, 'Kid toast');
  assert.equal((await pub.publish(k, kd.id, 'friends')).message, i18n.tEn('publish.friends'));
  const st = async () => (await as(P)(`/api/studio/${d.id}`)).json.grownup;
  assert.equal((await st()).seePlans, true);
  const was = config.stripeApiKey; config.stripeApiKey = '';
  try { assert.equal((await st()).seePlans, false, 'families off: /plans is a 404'); } finally { config.stripeApiKey = was; }
  grant(famOf(P));
  assert.equal((await st()).seePlans, false, 'their family plan already covers them');
});

test('copy: build.grownup is gone, the new keys exist, and the legal texts say grown-ups can build', () => {
  const en = i18n.tEn;
  assert.equal(i18n.tEn('build.grownup.heading'), 'build.grownup.heading', 'the kids-only page and its words are gone');
  for (const k of ['vis.family', 'vis.connections', 'game.grownupBuilder', 'connections.heading', 'familyGames.heading', 'publish.liveFamily', 'publish.liveConnections', 'studio.shareText.family', 'js.studio.vis.family', 'js.studio.share.hint.publicGrownup', 'js.studio.limit.seePlans']) {
    assert.notEqual(en(k), k, k);
  }
  assert.match(en('info.terms.accounts.li9'), /build games/);
  assert.match(en('info.privacy.grownups.p2'), /never show publicly which children/);
  assert.equal(en('js.studio.share.hint.publicGrownup', { name: 'Sam' }).includes('Sam'), true);
});
