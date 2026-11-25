// Games, not lessons (owner, 17 Nov 2026): teachers keep games in folders (their own Builder games and Oomba's) and
// assign games to classes; teacher-made lessons are retired (hidden everywhere, nothing deleted). Covers the 0085 backfill
// (a folder per lesson with games, its assignments soft-removed and listed, other kinds kept), folders, Save to folder,
// assigning (Oomba, own published, own draft, twice), the class page, the library redirect, and who may do what.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.PUBLIC_GAMES = '1';   // public games (off on the site by default: tests/unit/play-topics-private.test.js)
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, db, retireLessons, audit } = await import('../../server/db.js');
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const F = await import('../../server/services/game-folders.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (path, { method = 'GET', body } = {}) => {
  const headers = { cookie: cookieFor(who.id) }; if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, location: r.headers.get('location') };
};

const boss = createUser({ username: 'FolderBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oak Folders' }).school;
const head = S.createSchoolAccount(boss, oak.id, { rosterName: 'Head', role: 'admin' }).user;
const ana = S.createSchoolAccount(head, oak.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(head, oak.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
const cls = S.createClass(ana, oak.id, { name: 'Ana 5C' }).class;
const kid = S.createSchoolAccount(ana, oak.id, { rosterName: 'Kid' }).user; S.addToClass(ana, cls.id, kid.id);
function made(owner, { visibility = 'public', title = 'G', publish = true, seed = false } = {}) {
  const g = games.createGame(owner.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: owner.id, safetyStatus: 'pass' });
  if (publish) q.run("UPDATE games SET status='published', visibility=?, published_version_id=? WHERE id=?", visibility, v.id, g.id);
  if (seed) q.run("UPDATE games SET source='seed' WHERE id=?", g.id);
  return games.getGame(g.id);
}
const oomba = made(boss, { title: 'Fraction Fun', seed: true });
const mine = made(ana, { title: 'Ana Quiz', visibility: 'class' });
const draft = made(ana, { title: 'Ana Draft', publish: false });
const other = made(boss, { title: 'Planet Race' });

test('0085 backfill: a lesson with games becomes a folder; its assignments leave the class (listed); games, courses and homework stay', () => {
  // a teacher-made lesson: text, two games (one twice), assigned, with a student's work on it
  const lesson = L.createLesson(ana, oak.id, { title: 'Space week' }).lesson;
  L.addStep(ana, lesson.id, { kind: 'text', title: 'Read', body: 'Planets.' });
  const s1 = L.addStep(ana, lesson.id, { kind: 'game', gameId: other.id, title: 'Race' }).step;
  L.addStep(ana, lesson.id, { kind: 'game', gameId: oomba.id, title: 'Fractions' });
  L.addStep(ana, lesson.id, { kind: 'game', gameId: other.id, title: 'Race again' });
  const cl = L.assign(ana, cls.id, lesson.id).classLesson;
  assert.ok(P.gameScore(kid, cl.id, s1.id, 9).ok);
  // a text-only lesson (no folder), an assigned game made the old way (audited), and a course copy
  const textOnly = L.createLesson(ana, oak.id, { title: 'Reading' }).lesson; L.addStep(ana, textOnly.id, { kind: 'text', title: 'Read', body: 'x' });
  const game = L.createLesson(ana, oak.id, { title: other.title }).lesson; L.addStep(ana, game.id, { kind: 'game', gameId: other.id, title: other.title });
  const gameCl = L.assign(ana, cls.id, game.id).classLesson; audit(ana.id, 'lesson.assignGame', game.id, {});
  const course = L.createLesson(ana, oak.id, { title: 'CS 1.2', templateKey: 'csq-1b-1.2', templateVersion: 1 }).lesson;
  const courseCl = L.assign(ana, cls.id, course.id).classLesson;
  q.run("UPDATE lessons SET kind='lesson'");   // as before 0085
  retireLessons(db);
  const kinds = Object.fromEntries(q.all('SELECT id, kind FROM lessons').map(r => [r.id, r.kind]));
  assert.deepEqual([kinds[lesson.id], kinds[textOnly.id], kinds[game.id], kinds[course.id]], ['lesson', 'lesson', 'game', 'course']);
  const fs = F.foldersOf(ana.id);
  assert.deepEqual(fs.map(f => [f.name, f.from_lesson, f.games]), [['Space week', lesson.id, 2]], 'one folder, its two games once each');
  assert.deepEqual(F.gamesIn(ana, fs[0].id).map(g => g.title), ['Planet Race', 'Fraction Fun'], 'in step order');
  // the lesson's assignment is gone from the class, kept and listed; the game and the course stay
  assert.deepEqual(L.classLessons(cls.id).map(x => x.id).sort(), [gameCl.id, courseCl.id].sort());
  assert.ok(q.get('SELECT 1 FROM lessons_retired WHERE class_lesson_id=?', cl.id));
  assert.ok(q.get('SELECT removed_at FROM class_lessons WHERE id=?', cl.id).removed_at, 'soft-removed');
  assert.equal(q.get('SELECT score FROM step_progress WHERE class_lesson_id=? AND user_id=?', cl.id, kid.id).score, 9, "the student's work is kept");
  assert.ok(L.getLesson(lesson.id), 'the lesson itself is kept');
  retireLessons(db);
  assert.equal(F.foldersOf(ana.id).length, 1, 'running it again makes no second folder');
  // the editor of a retired lesson opens its folder
  return as(ana)(`/teach/lessons/${lesson.id}`).then(r => { assert.equal(r.status, 302); assert.equal(r.location, `/build?folder=${fs[0].id}`); });
});

test('folders: private, named, any game you can see (Oomba and your own drafts), never a game you cannot', () => {
  const f = F.createFolder(ana, '  Fractions   week ').folder;
  assert.equal(f.name, 'Fractions week');
  assert.equal(F.createFolder(ana, '   ').code, 'folderName');
  assert.ok(F.addGame(ana, f.id, oomba.id).ok);
  assert.ok(F.addGame(ana, f.id, draft.id).ok, 'your own draft');
  assert.ok(F.addGame(ana, f.id, oomba.id).already, 'once only');
  const hidden = made(boss, { title: 'Secret', visibility: 'private' });
  assert.equal(F.addGame(ana, f.id, hidden.id).code, 'pickGame');
  assert.equal(F.addGame(ben, f.id, oomba.id).code, 'notFound', "not someone else's folder");
  assert.deepEqual(F.gamesIn(ana, f.id).map(g => g.title), ['Fraction Fun', 'Ana Draft']);
  assert.deepEqual(F.gamesIn(ben, f.id), []);
  assert.ok(F.removeGame(ana, f.id, draft.id).ok);
  assert.ok(F.deleteFolder(ana, f.id).ok);
  assert.ok(games.getGame(oomba.id), 'deleting a folder never deletes its games');
});

test('assign: an Oomba game or your own published game (shared with the class); a draft must be published; never twice', () => {
  const a = F.assignGame(ana, cls.id, oomba.id, { dueAt: '2030-01-10' });
  assert.ok(a.ok);
  assert.equal(L.getLesson(L.getClassLesson(a.classLesson.id).lesson_id).kind, 'game');
  assert.equal(F.assignGame(ana, cls.id, oomba.id).code, 'alreadyAssigned');
  assert.equal(F.assignGame(ana, cls.id, draft.id).code, 'publishFirst');
  assert.ok(!games.gameLiveInClass(mine.id, cls.id));
  assert.ok(F.assignGame(ana, cls.id, mine.id).ok);
  assert.ok(games.gameLiveInClass(mine.id, cls.id), 'a class game reaches the class it is assigned to');
  assert.equal(F.assignGame(ben, cls.id, oomba.id).code, 'notFound', "not someone else's class");
  assert.equal(F.assignGame(kid, cls.id, oomba.id).code, 'notFound');
  // the student sees it, plays it, and the teacher sees the score
  const cl = L.classLessons(cls.id).find(x => x.id === a.classLesson.id), step = L.steps(cl.lesson_id)[0];
  assert.ok(P.gameScore(kid, cl.id, step.id, 7).ok);
});

test('pages: Build shows folders, a folder in its sidebar, Save to folder, the class page has games (no lessons), the library redirects', async () => {
  const f = F.createFolder(ana, 'Week 2').folder; F.addGame(ana, f.id, oomba.id);
  const build = await as(ana)('/build');
  assert.match(build.text, /My folders/); assert.match(build.text, new RegExp(`href="/build\\?folder=${f.id}"`));
  assert.match(build.text, new RegExp(`href="/build/save\\?id=${mine.id}"`)); assert.match(build.text, new RegExp(`href="/teach/assign\\?id=${mine.id}"`));
  const old = await as(ana)(`/build/folders/${f.id}`);
  assert.equal(old.status, 302); assert.equal(old.location, `/build?folder=${f.id}`, 'the old folder page opens Build with the folder picked');
  const page = await as(ana)(`/build?folder=${f.id}`);
  assert.equal(page.status, 200); assert.match(page.text, /Fraction Fun/); assert.match(page.text, new RegExp(`/teach/assign\\?id=${oomba.id}`));
  assert.equal((await as(ben)(`/build/folders/${f.id}`)).status, 404, "another teacher's folder is not found");
  assert.doesNotMatch((await as(ben)(`/build?folder=${f.id}`)).text, /Week 2/, 'nor shown on their Build');
  const save = await as(ana)(`/build/save?id=${oomba.id}`);
  assert.match(save.text, /In this folder/); assert.match(save.text, /New folder with this lesson/);
  const r = await as(ana)('/api/game-folders', { method: 'POST', body: { name: 'Quick picks', gameId: other.id } });
  assert.ok(r.json.ok); assert.match(r.json.toast, /Quick picks/);
  const klass = await as(ana)(`/class/${cls.id}`);
  assert.doesNotMatch(klass.text, /Draft with AI|New unit|Lesson library/);
  assert.match(klass.text, /href="\/build\/new"/); assert.match(klass.text, /Build new game/); assert.match(klass.text, /New folder/); assert.match(klass.text, /Find Oomba games/);
  assert.doesNotMatch(klass.text, /Ready-made courses/); assert.match(klass.text, new RegExp(`href="/class/${cls.id}\\?folder=${f.id}"`), 'the teacher\'s folders, in the class page\'s sidebar');
  assert.match(klass.text, /Fraction Fun/);
  const lib = await as(ana)('/teach/lessons?school=x'); assert.equal(lib.status, 302); assert.equal(lib.location, '/build');
  const assign = await as(ana)(`/teach/assign?id=${draft.id}&class=${cls.id}`);
  assert.match(assign.text, /Publish this game first/);
  const moon = made(boss, { title: 'Moon Maze' });
  const done = await as(ana)('/api/teach/assign-game', { method: 'POST', body: { gameId: moon.id, classId: cls.id } });
  assert.ok(done.json.ok); assert.equal(done.json.redirect, `/class/${cls.id}`);
  const again = await as(ana)('/api/teach/assign-game', { method: 'POST', body: { gameId: moon.id, classId: cls.id } });
  assert.equal(again.status, 400); assert.match(again.json.error, /Ana 5C/, 'already in that class');
  const kidPage = await as(kid)(`/class/${cls.id}`);
  assert.match(kidPage.text, /Moon Maze/); assert.match(kidPage.text, /Planet Race/); assert.doesNotMatch(kidPage.text, /Space week/, 'a retired lesson is gone for students');
});

test("sharing a folder with colleagues: shared on Build, opened read-only, copied; only the school's staff, only games they can open", async () => {
  const elm = S.createSchool(boss, { name: 'Elm Folders' }).school;
  const elmT = S.createSchoolAccount(boss, elm.id, { rosterName: 'Elm Teacher', role: 'teacher' }).user;
  const f = F.createFolder(ana, 'Shared week').folder;
  F.addGame(ana, f.id, oomba.id); F.addGame(ana, f.id, draft.id);   // a draft of Ana's: never seen by colleagues
  assert.equal(F.shareFolder(ana, f.id, elm.id).code, 'notFound', 'only a school you are staff of');
  assert.equal(F.shareFolder(ben, f.id, oak.id).code, 'notFound', 'only your own folder');
  assert.ok(F.shareFolder(ana, f.id, oak.id).ok);
  assert.deepEqual(F.sharedWith(ben).map(x => [x.name, x.owner_name, x.games]), [['Shared week', 'Ana Teacher', 1]], 'Ben sees it, with the one game he can open');
  assert.deepEqual(F.sharedWith(ana), [], 'not your own');
  assert.deepEqual(F.sharedWith(elmT), [], 'not another school');
  assert.deepEqual(F.sharedWith(kid), [], 'never students');
  assert.equal(F.addGame(ben, f.id, other.id).code, 'notFound', 'read-only for colleagues');
  // the pages: Build lists it, the folder opens read-only with Copy, and copying makes Ben's own folder
  const build = await as(ben)('/build');
  assert.match(build.text, /Shared by colleagues/); assert.match(build.text, new RegExp(`href="/build\\?folder=${f.id}"`));
  const page = await as(ben)(`/build?folder=${f.id}`);
  assert.equal(page.status, 200); assert.match(page.text, /Copy to my folders/); assert.match(page.text, /Fraction Fun/);
  assert.doesNotMatch(page.text, /Ana Draft|Remove from folder|deleteConfirm|\/api\/game-folders\/[^/]+\/delete/);
  assert.equal((await as(elmT)(`/build/folders/${f.id}`)).status, 404);
  const copy = await as(ben)(`/api/game-folders/${f.id}/copy`, { method: 'POST', body: {} });
  assert.ok(copy.json.ok);
  const mineNow = F.foldersOf(ben.id).find(x => x.name === 'Shared week');
  assert.deepEqual(F.gamesIn(ben, mineNow.id).map(g => g.title), ['Fraction Fun']);
  const own = await as(ana)(`/build?folder=${f.id}`);
  assert.match(own.text, /Shared with Oak Folders/); assert.match(own.text, /Stop sharing/);
  assert.ok(F.shareFolder(ana, f.id, '').ok);
  assert.deepEqual(F.sharedWith(ben), [], 'stopped sharing: gone for colleagues');
  assert.equal((await as(ben)(`/build/folders/${f.id}`)).status, 404);
});

test('drag to reorder and the Save to folder pop-up: a whole new order saved at once; the pop-up has the folders and its words', async () => {
  const a = F.createFolder(ana, 'Order A').folder, b = F.createFolder(ana, 'Order B').folder, c = F.createFolder(ana, 'Order C').folder;
  const mineIds = () => F.foldersOf(ana.id).map(f => f.id);
  const rest = mineIds().filter(id => ![a.id, b.id, c.id].includes(id));
  // Folders: the order as dragged; ids that are not hers are ignored; folders left out keep their order after.
  const theirs = F.createFolder(ben, 'Not hers').folder;
  let r = await as(ana)('/api/game-folders/order', { method: 'POST', body: { ids: [c.id, theirs.id, a.id] } });
  assert.ok(r.json.ok);
  assert.deepEqual(mineIds(), [c.id, a.id, ...rest, b.id], 'the two given first, then the others in their old order');
  assert.equal(F.getFolder(theirs.id).owner_id, ben.id, "another teacher's folder untouched");
  // Games in a folder.
  F.addGame(ana, a.id, oomba.id); F.addGame(ana, a.id, mine.id); F.addGame(ana, a.id, other.id);
  r = await as(ana)(`/api/game-folders/${a.id}/order`, { method: 'POST', body: { ids: [other.id, oomba.id] } });
  assert.ok(r.json.ok);
  assert.deepEqual(F.gamesIn(ana, a.id).map(g => g.id), [other.id, oomba.id, mine.id]);
  assert.equal((await as(ben)(`/api/game-folders/${a.id}/order`, { method: 'POST', body: { ids: [mine.id] } })).status, 404, 'only the owner reorders');
  // The folder in Build's sidebar: both lists can be dragged, with the words for it; Move up / Move down are in its ⋯ menu.
  const page = await as(ana)(`/build?folder=${a.id}`);
  assert.match(page.text, new RegExp(`data-api="/api/game-folders/${a.id}/(up|down)"`));
  assert.match(page.text, /data-reorder="\/api\/game-folders\/order"/); assert.match(page.text, new RegExp(`data-reorder="/api/game-folders/${a.id}/order"`));
  assert.match(page.text, /data-moved="\{name\}: \{n\} of \{total\}"/); assert.match(page.text, /class="gfo-grip"/);
  // The pop-up's data: the game, each folder (and whether it has it), and the words with {folder} left to fill in.
  const s = await as(ana)(`/api/game-folders/save?id=${oomba.id}`);
  assert.equal(s.json.game.id, oomba.id);
  assert.ok(s.json.folders.find(f => f.id === a.id).has); assert.ok(!s.json.folders.find(f => f.id === b.id).has);
  assert.equal(s.json.words.savedTo, 'Saved to {folder}'); assert.equal(s.json.words.open, 'Open {folder}'); assert.equal(s.json.words.keep, 'Keep browsing');
  // Saving answers with the folder, so the pop-up can link to it.
  r = await as(ana)(`/api/game-folders/${b.id}/games`, { method: 'POST', body: { gameId: oomba.id } });
  assert.equal(r.json.folder.id, b.id); assert.equal(r.json.already, false);
  r = await as(ana)('/api/game-folders', { method: 'POST', body: { name: 'From the pop-up', gameId: oomba.id } });
  assert.equal(r.json.folder.name, 'From the pop-up');
  assert.equal((await as(ana)('/api/game-folders/save?id=nope')).status, 404);
});
