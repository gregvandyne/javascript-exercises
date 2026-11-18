// The folder sidebar on Build and the class page's Games tab (docs/decisions.md "Folders in a sidebar, on Build and the
// class page"): the same left column on both pages for a teacher, the picked item in the address, the right side alone
// for public/js/shelf.js (X-Shelf), the old folder page redirecting, colleagues' folders read-only, "Assign all", and
// nothing of it for students or kids. The browser side is tests/unit/folders-sidebar-browser.test.js.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const F = await import('../../server/services/game-folders.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (path, { method = 'GET', body, headers = {} } = {}) => {
  const h = { cookie: cookieFor(who.id), ...headers }; if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
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
  assert.match(klass.text, /<div class="shelf" data-shelf id="lessons">/);
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

test('students and kids see none of it: no shelf, no folders, no Assign; X-Shelf gets them nothing more', async () => {
  const page = await as(kid)(`/class/${cls.id}?folder=${fun.id}`, { headers: shelfOnly });
  assert.equal(page.status, 200); assert.equal(page.json, null, 'the student page, not a shelf answer');
  assert.doesNotMatch(page.text, /data-shelf|Fun Games|My folders|Assign to|assign-folder|game-folders/);
  for (const who of [kid, homeKid]) {
    const b = await as(who)(`/build?folder=${fun.id}`, { headers: shelfOnly });
    assert.equal(b.status, 200); assert.equal(b.json, null, 'Build without a shelf');
    assert.doesNotMatch(b.text, /data-shelf|My folders|Save to folder|\/build\/save|\/teach\/assign|Fun Games/);
    assert.match(b.text, /id="newgame"/);
    assert.equal((await as(who)(`/build/folders/${fun.id}`)).status, 404);
  }
});
