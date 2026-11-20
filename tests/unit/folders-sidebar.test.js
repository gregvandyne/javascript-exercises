// The folder sidebar on Build and the class page's Games tab (docs/decisions.md "Folders in a sidebar, on Build and the
// class page"): the same left column on both pages for a teacher, the picked item in the address, the right side alone
// for public/js/shelf.js (X-Shelf), the old folder page redirecting, colleagues' folders read-only, "Assign all", and
// for students and kids only their own folders (no Assign, sharing or colleagues' folders). The browser side is tests/unit/folders-sidebar-browser.test.js.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const F = await import('../../server/services/game-folders.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');
const { deicon } = await import('../support/deicon.js');  // icons read back as the emoji they stand for

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (path, { method = 'GET', body, headers = {} } = {}) => {
  const h = { cookie: cookieFor(who.id), ...headers }; if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const raw = await r.text(), text = deicon(raw); let json = null; try { json = JSON.parse(raw, (k, v) => typeof v === 'string' ? deicon(v) : v); } catch { /* html */ }
  return { status: r.status, text, json, location: r.headers.get('location'), vary: r.headers.get('vary') || '' };
};
const shelfOnly = { 'X-Shelf': '1' };

const boss = createUser({ username: 'ShelfHttpBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oak Shelf' }).school;
const head = S.createSchoolAccount(boss, oak.id, { rosterName: 'Head', role: 'admin' }).user;
const ana = S.createSchoolAccount(head, oak.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(head, oak.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
const cls = S.createClass(ana, oak.id, { name: 'Ana 5C' }).class;
const kid = S.createSchoolAccount(ana, oak.id, { rosterName: 'Kid' }).user; S.addToClass(ana, cls.id, kid.id);
const homeKid = createUser({ username: 'ShelfHomeKid', password: 'secret123' });
function made(owner, { title = 'G', seed = false } = {}) {
  const g = games.createGame(owner.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
  if (seed) q.run("UPDATE games SET source='seed' WHERE id=?", g.id);
  return games.getGame(g.id);
}
const o1 = made(boss, { title: 'Sum Sprint', seed: true }), o2 = made(boss, { title: 'Map Hop', seed: true }), o3 = made(boss, { title: 'Word Owl', seed: true });
const anaGame = made(ana, { title: 'Ana Maze' });
const fun = F.createFolder(ana, 'Fun Games').folder; F.addGame(ana, fun.id, o1.id); F.addGame(ana, fun.id, o2.id);
const spare = F.createFolder(ana, 'Spare').folder;
const benF = F.createFolder(ben, 'Grade 4 math').folder; F.addGame(ben, benF.id, o3.id); F.addGame(ben, benF.id, o1.id);
const benPrivate = F.createFolder(ben, 'Ben private').folder; F.addGame(ben, benPrivate.id, o2.id);
F.shareFolder(ben, benF.id, oak.id);

test('the sidebar renders for a teacher on Build and on the class page, the same items in the same markup', async () => {
  const build = await as(ana)('/build');
  assert.equal(build.status, 200); assert.match(build.vary, /X-Shelf/i);
  assert.match(build.text, /<div class="shelf" data-shelf>/);
  assert.match(build.text, /<a class="btn btn-primary shelf-go" href="\/build\/new" id="newgame">/, 'New game');
  assert.match(build.text, /data-shelf-key="all" aria-current="true">[^]*?All my games<\/span><span class="n" aria-hidden="true">1<\/span>/, 'All my games, picked, with its count');
  assert.match(build.text, new RegExp(`href="/build\\?folder=${fun.id}" data-shelf-key="f-${fun.id}"`));
  assert.match(build.text, /Shared by colleagues/); assert.match(build.text, new RegExp(`href="/build\\?folder=${benF.id}"`));
  assert.doesNotMatch(build.text, /Ben private/, "a colleague's folder that isn't shared");
  assert.match(build.text, /Make your own game by chatting!/, 'the Builder line, compact');
  assert.match(build.text, /data-reorder="\/api\/game-folders\/order"/, 'folders can be dragged into order');
  assert.match(build.text, /<script type="module" src="\/js\/shelf\.js/);
  // All my games: one's own game with Edit, Play, Assign and ⋯ (Save to folder, Rename, Delete).
  assert.match(build.text, new RegExp(`data-id="${anaGame.id}"`)); assert.match(build.text, /data-rename/); assert.match(build.text, /data-delete/);
  const klass = await as(ana)(`/class/${cls.id}`);
  assert.equal(klass.status, 200);
  assert.match(klass.text, /<div class="shelf shelf-class" data-shelf id="lessons">/);
  assert.match(klass.text, /id="cl-newgame">[^]*?Build new game/);
  for (const w of ['Assigned to Ana 5C', 'Find Oomba games', 'My folders', 'New folder', 'Shared by colleagues', 'Games students shared']) assert.ok(klass.text.includes(w), w);
  assert.match(klass.text, new RegExp(`href="/class/${cls.id}\\?folder=${fun.id}"`)); assert.match(klass.text, new RegExp(`href="/class/${cls.id}\\?view=students"`));
  // Nothing assigned yet: the first folder is picked, with Assign to the class and Assign all.
  assert.match(klass.text, new RegExp(`data-shelf-key="f-${fun.id}" aria-current="true"`));
  assert.match(klass.text, /Assign to Ana 5C/); assert.match(klass.text, /Assign all 2/);
  // The other tabs are unchanged.
  for (const tab of ['students', 'settings']) assert.doesNotMatch((await as(ana)(`/class/${cls.id}?tab=${tab}`)).text, /data-shelf/, tab);
});

test('picking: ?folder= and ?view= in the address; X-Shelf answers the right side alone as JSON', async () => {
  const r = await as(ana)(`/build?folder=${fun.id}`, { headers: shelfOnly });
  assert.equal(r.status, 200); assert.equal(r.json.key, `f-${fun.id}`); assert.equal(r.json.href, `/build?folder=${fun.id}`);
  assert.match(r.json.html, /<h2 id="shelf-h" tabindex="-1" dir="auto">Fun Games<\/h2>/); assert.match(r.json.html, /Sum Sprint/); assert.match(r.json.html, /Map Hop/);
  assert.doesNotMatch(r.json.html, /shelf-side|<html/, 'only the right side');
  const all = await as(ana)('/build?view=all', { headers: shelfOnly });
  assert.equal(all.json.key, 'all'); assert.equal(all.json.href, '/build'); assert.match(all.json.html, /Ana Maze/);
  const students = await as(ana)(`/class/${cls.id}?view=students`, { headers: shelfOnly });
  assert.equal(students.json.key, 'students'); assert.match(students.json.html, /Games students shared/);
  // A folder that is not yours and not shared with you: never shown (the default instead).
  const theirs = await as(ana)(`/build?folder=${benPrivate.id}`, { headers: shelfOnly });
  assert.equal(theirs.json.key, 'all'); assert.doesNotMatch(theirs.json.html, /Ben private/);
});

test('the old folder page redirects to Build with the folder picked; one you cannot open is still not found', async () => {
  const r = await as(ana)(`/build/folders/${fun.id}`);
  assert.equal(r.status, 302); assert.equal(r.location, `/build?folder=${fun.id}`);
  assert.equal((await as(ana)(`/build/folders/${benF.id}`)).location, `/build?folder=${benF.id}`, 'shared with you');
  assert.equal((await as(ana)(`/build/folders/${benPrivate.id}`)).status, 404);
  assert.equal((await as(ana)('/build/folders/nope')).status, 404);
  // New folders and copies open in the sidebar of the page they were made on.
  const made1 = await as(ana)('/api/game-folders', { method: 'POST', body: { name: 'From Build' } });
  assert.match(made1.json.redirect, /^\/build\?folder=/);
  const made2 = await as(ana)('/api/game-folders', { method: 'POST', body: { name: 'From the class', classId: cls.id } });
  assert.match(made2.json.redirect, new RegExp(`^/class/${cls.id}\\?folder=`));
  const sneaky = await as(ben)('/api/game-folders', { method: 'POST', body: { name: 'Not his class', classId: cls.id } });
  assert.match(sneaky.json.redirect, /^\/build\?folder=/, 'only back to a class you manage');
  const gone = await as(ana)(`/api/game-folders/${F.foldersOf(ana.id).find(f => f.name === 'From the class').id}/delete`, { method: 'POST', body: { classId: cls.id } });
  assert.equal(gone.json.redirect, `/class/${cls.id}`);
});

test("a colleague's shared folder is read-only: no menu, no Remove, no reorder; every change refused", async () => {
  const r = await as(ana)(`/build?folder=${benF.id}`, { headers: shelfOnly });
  assert.equal(r.json.key, `f-${benF.id}`);
  assert.match(r.json.html, /Copy to my folders/); assert.match(r.json.html, /by Ben Teacher · Shared with Oak Shelf/);
  assert.match(r.json.html, /Word Owl/);
  assert.doesNotMatch(r.json.html, /Remove from folder|data-reorder|data-grip|Rename|Stop sharing|Delete folder|\/api\/game-folders\/[^/"]+\/(delete|up|down|share|order)"/);
  assert.match(r.json.html, new RegExp(`href="/build/save\\?id=${o3.id}">📁 Save to folder`), 'save a game to your own folder');
  for (const [path, body] of [[`/api/game-folders/${benF.id}`, { name: 'Mine now' }], [`/api/game-folders/${benF.id}/delete`, {}], [`/api/game-folders/${benF.id}/games`, { gameId: o2.id }],
    [`/api/game-folders/${benF.id}/games/${o3.id}/delete`, {}], [`/api/game-folders/${benF.id}/order`, { ids: [o1.id, o3.id] }], [`/api/game-folders/${benF.id}/share`, { schoolId: '' }], [`/api/game-folders/${benF.id}/up`, {}]]) {
    assert.equal((await as(ana)(path, { method: 'POST', body })).status, 404, path);
  }
  assert.equal(F.getFolder(benF.id).name, 'Grade 4 math'); assert.equal(F.gamesIn(ben, benF.id).length, 2);
  // On the class page: Assign to the class from it, and Copy comes back to the class.
  const k = await as(ana)(`/class/${cls.id}?folder=${benF.id}`, { headers: shelfOnly });
  assert.match(k.json.html, /Assign to Ana 5C/); assert.match(k.json.html, /name="classId" value="[^"]+"><button class="btn btn-primary" type="submit">📁 Copy to my folders/);
});

test('Assign all: each game the class can play, once; skips what it has; back on Assigned', async () => {
  assert.ok(F.assignGame(ana, cls.id, o1.id).ok);
  const r = await as(ana)('/api/teach/assign-folder', { method: 'POST', body: { folderId: fun.id, classId: cls.id, dueAt: '2030-02-01' } });
  assert.equal(r.status, 200); assert.equal(r.json.toast, '1 game assigned to Ana 5C · 1 skipped'); assert.equal(r.json.redirect, `/class/${cls.id}?view=assigned`);
  assert.ok(F.assignmentOf(cls.id, o2.id));
  const again = await as(ana)('/api/teach/assign-folder', { method: 'POST', body: { folderId: fun.id, classId: cls.id } });
  assert.equal(again.status, 400); assert.match(again.json.error, /Nothing new to assign/);
  assert.equal((await as(ana)('/api/teach/assign-folder', { method: 'POST', body: { folderId: benPrivate.id, classId: cls.id } })).status, 404, "not a folder you can open");
  assert.equal((await as(ben)('/api/teach/assign-folder', { method: 'POST', body: { folderId: benF.id, classId: cls.id } })).status, 404, "not a class you manage");
  assert.equal((await as(kid)('/api/teach/assign-folder', { method: 'POST', body: { folderId: fun.id, classId: cls.id } })).status, 404, 'never a student');
  // Assigning one from a folder comes back to that folder.
  const one = await as(ana)('/api/teach/assign-game', { method: 'POST', body: { gameId: o3.id, classId: cls.id, folder: benF.id } });
  assert.equal(one.json.redirect, `/class/${cls.id}?folder=${benF.id}`);
  // With assignments, the class page opens on them, with their due dates and existing actions.
  const page = await as(ana)(`/class/${cls.id}`);
  assert.match(page.text, /data-shelf-key="assigned" aria-current="true"/);
  assert.match(page.text, /<h2 id="shelf-h" tabindex="-1" dir="auto">Assigned to Ana 5C<\/h2><p class="small muted">3 games<\/p>/);
  assert.match(page.text, /Due /); assert.match(page.text, /Remove from class/); assert.match(page.text, /📊 Scores/);
  // In a folder, a game already in the class says so.
  assert.match((await as(ana)(`/class/${cls.id}?folder=${fun.id}`)).text, /✅ Assigned/);
});

test("students and kids: never a teacher's folders or Assign; on Build their own folders as before, with no assign, share or colleagues", async () => {
  // The class page: the student view, whatever is asked for.
  const page = await as(kid)(`/class/${cls.id}?folder=${fun.id}`, { headers: shelfOnly });
  assert.equal(page.status, 200); assert.equal(page.json, null, 'the student page, not a shelf answer');
  assert.doesNotMatch(page.text, /data-shelf|Fun Games|My folders|Assign to|assign-folder|game-folders/);
  for (const who of [kid, homeKid]) {
    const own = F.createFolder(who, `${who.username} picks`).folder, other = F.createFolder(who, `${who.username} more`).folder;
    const mineGame = made(who, { title: `${who.username} game` });
    assert.ok(F.addGame(who, own.id, o1.id).ok); assert.ok(F.addGame(who, own.id, mineGame.id).ok);
    const b = await as(who)('/build');
    assert.equal(b.status, 200); assert.match(b.text, /id="newgame"/);
    assert.match(b.text, /All my games/); assert.match(b.text, /My folders/); assert.match(b.text, /New folder/);
    assert.match(b.text, new RegExp(`href="/build\\?folder=${own.id}"`)); assert.match(b.text, /data-reorder="\/api\/game-folders\/order"/, 'drag to reorder');
    assert.match(b.text, new RegExp(`href="/build/save\\?id=${mineGame.id}">📁 Save to folder`));
    assert.doesNotMatch(b.text, /Fun Games|Shared by colleagues|Grade 4 math|\/teach\/assign|Find Oomba games/, "no teacher's folders, no colleagues, no Assign, no Find Oomba games on All");
    // Their own folder: its games, Remove from folder, Save to another folder, drag; still no assign or share.
    const f = await as(who)(`/build?folder=${own.id}`, { headers: shelfOnly });
    assert.equal(f.json.key, `f-${own.id}`); assert.match(f.json.html, /Sum Sprint/);
    assert.match(f.json.html, new RegExp(`/api/game-folders/${own.id}/games/${o1.id}/delete`)); assert.match(f.json.html, /Save to another folder/);
    assert.match(f.json.html, new RegExp(`data-reorder="/api/game-folders/${own.id}/order"`)); assert.match(f.json.html, /Find Oomba games/, 'as on the old folder page');
    assert.doesNotMatch(f.json.html, /\/teach\/assign|assign-folder|Assign|\/share"|Share with|Stop sharing/);
    assert.equal((await as(who)(`/build/folders/${own.id}`)).location, `/build?folder=${own.id}`);
    // A teacher's folder stays out of reach, by address or API.
    assert.doesNotMatch((await as(who)(`/build?folder=${fun.id}`)).text, /Fun Games/);
    assert.equal((await as(who)(`/build/folders/${fun.id}`)).status, 404);
    assert.equal((await as(who)(`/build/folders/${benF.id}`)).status, 404, "a colleague's shared folder is staff only");
    assert.equal((await as(who)(`/api/game-folders/${own.id}/share`, { method: 'POST', body: { schoolId: oak.id } })).status, 404, 'no school to share with');
    assert.equal((await as(who)('/api/teach/assign-folder', { method: 'POST', body: { folderId: own.id, classId: cls.id } })).status, 404);
    assert.ok((await as(who)(`/api/game-folders/order`, { method: 'POST', body: { ids: [other.id, own.id] } })).json.ok);
    assert.deepEqual(F.foldersOf(who.id).map(x => x.id), [other.id, own.id]);
  }
});

test('Find Oomba games opens on the right of the class page: the side item, one strip of filters, and the games', async () => {
  // Two official Learn games (owned by Oomba Academy, on the learn shelf, with a subject and grades in learn.js).
  const off = q.get("SELECT * FROM users WHERE username='OombaAcademy'") || createUser({ username: 'OombaAcademy', password: 'secret123', role: 'admin' });
  const official = (slug, title) => { const g = made(off, { title, seed: true }); q.run("UPDATE games SET slug=?, shelf='learn', status='published', visibility='public' WHERE id=?", slug, g.id); return games.getGame(g.id); };
  const sum = official('sum-racer', 'Sum Racer'), trail = official('word-trail', 'Word Trail');
  const page = (await as(ana)(`/class/${cls.id}?view=oomba`)).text;
  assert.match(page, new RegExp(`<a class="shelf-item is-on" href="/class/${cls.id}\\?view=oomba" data-shelf-key="oomba" aria-current="true">`), 'the side item, picked');
  assert.match(page, /<h2 id="shelf-h" tabindex="-1">🦉 Oomba games<\/h2>/);
  assert.match(page, /<form class="oomba-bar" method="get"/); assert.match(page, /placeholder="Search Oomba games"/); assert.match(page, /data-oomba-grade/);
  assert.doesNotMatch(page.slice(page.indexOf('id="shelf-main"')), /e\.g\. 3\.OA|How you play/, 'no standard box or "How you play" row');
  assert.match(page, new RegExp(`data-id="${sum.id}"`)); assert.match(page, new RegExp(`data-id="${trail.id}"`));
  // The shelf's own reply (what public/js/shelf.js swaps in), filtered by subject, grade and search.
  const part = async qs => (await as(ana)(`/class/${cls.id}?view=oomba${qs}`, { headers: shelfOnly })).json;
  let r = await part('&subject=math');
  assert.equal(r.key, 'oomba'); assert.equal(r.href, `/class/${cls.id}?view=oomba&subject=math`);
  assert.match(r.html, new RegExp(`data-id="${sum.id}"`)); assert.doesNotMatch(r.html, new RegExp(`data-id="${trail.id}"`));
  r = await part('&grade=7'); assert.doesNotMatch(r.html, new RegExp(`data-id="${sum.id}"`), 'Sum Racer is grades 1–5');
  r = await part('&q=trail'); assert.match(r.html, new RegExp(`data-id="${trail.id}"`)); assert.doesNotMatch(r.html, new RegExp(`data-id="${sum.id}"`));
  assert.match(r.html, /Assign to Ana 5C/); assert.match(r.html, new RegExp(`/build/save\\?id=${trail.id}`));
  // Not for students or another teacher's class page.
  assert.doesNotMatch((await as(kid)(`/class/${cls.id}?view=oomba`)).text, /class="oomba-bar"/);
  assert.notEqual((await as(ben)(`/class/${cls.id}?view=oomba`, { headers: shelfOnly })).json?.key, 'oomba');
});
