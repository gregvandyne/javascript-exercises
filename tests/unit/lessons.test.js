// Lesson plans: library folders and ordering, steps, sharing and copying, assigning to classes in units with dates,
// what students see (only open lessons, playable games), build steps, the AI draft fallback, and who can do what.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const games = await import('../../server/services/games.js');
const { templateDraft, draftLesson } = await import('../../server/services/lesson-ai.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (path, { method = 'GET', body } = {}) => {
  const headers = { cookie: cookieFor(who.id) }; if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};

const boss = createUser({ username: 'LessonBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oak Lessons' }).school, elm = S.createSchool(boss, { name: 'Elm Lessons' }).school;
const head = S.createSchoolAccount(boss, oak.id, { rosterName: 'Head', role: 'admin' }).user;
const ana = S.createSchoolAccount(head, oak.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(head, oak.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
const elmT = S.createSchoolAccount(boss, elm.id, { rosterName: 'Elm T', role: 'teacher' }).user;
const cls = S.createClass(ana, oak.id, { name: 'Ana 4B' }).class;
const kid = S.createSchoolAccount(ana, oak.id, { rosterName: 'Kid' }).user; S.addToClass(ana, cls.id, kid.id);
const outsider = createUser({ username: 'LessonOutsider', password: 'secret123' });
function liveGame(owner, visibility, title = 'G') {
  const g = games.createGame(owner.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility=?, published_version_id=? WHERE id=?", visibility, v.id, g.id);
  return games.getGame(g.id);
}
const publicGame = liveGame(boss, 'public', 'Planet Quiz');

test('library: folders inside folders, order, moving, deleting a folder keeps its lessons', () => {
  const unit1 = L.createFolder(ana, oak.id, { name: 'Term 1' }).folder;
  const sub = L.createFolder(ana, oak.id, { name: 'Fractions', parentId: unit1.id }).folder;
  assert.deepEqual(L.folderTree(ana.id, oak.id).map(f => [f.name, f.depth]), [['Term 1', 0], ['Fractions', 1]]);
  assert.equal(L.moveFolder(ana, unit1.id, sub.id).code, 'folderLoop', 'never inside itself');
  const a = L.createLesson(ana, oak.id, { title: 'A', folderId: sub.id }).lesson, b2 = L.createLesson(ana, oak.id, { title: 'B', folderId: sub.id }).lesson;
  assert.deepEqual(L.lessonsIn(ana.id, oak.id, sub.id).map(l => l.title), ['A', 'B']);
  L.reorderLesson(ana, b2.id, -1); assert.deepEqual(L.lessonsIn(ana.id, oak.id, sub.id).map(l => l.title), ['B', 'A']);
  assert.ok(L.deleteFolder(ana, sub.id).ok);
  assert.deepEqual(L.lessonsIn(ana.id, oak.id, unit1.id).map(l => l.title).sort(), ['A', 'B'], 'lessons move up a level');
  assert.equal(L.createFolder(ana, elm.id, { name: 'x' }).code, 'notFound', 'only in your own schools');
  assert.equal(L.renameFolder(ben, unit1.id, 'mine now').code, 'notFound', 'folders are private');
});

test('steps: kinds, validation, order; games must be ones the teacher may use', () => {
  const l = L.createLesson(ana, oak.id, { title: 'Planets' }).lesson;
  assert.equal(L.addStep(ana, l.id, { kind: 'game' }).code, 'pickGame');
  const privateGame = liveGame(ben, 'private', 'Ben secret');
  assert.equal(L.addStep(ana, l.id, { kind: 'game', gameId: privateGame.id }).code, 'pickGame', "not someone else's private game");
  assert.equal(L.addStep(ana, l.id, { kind: 'build', body: '' }).code, 'buildPrompt');
  assert.ok(L.addStep(ana, l.id, { kind: 'text', title: 'Warm-up', body: 'Talk about planets', minutes: 5 }).ok);
  assert.ok(L.addStep(ana, l.id, { kind: 'game', gameId: publicGame.id, minutes: 10 }).ok);
  assert.ok(L.addStep(ana, l.id, { kind: 'build', body: 'a quiz about planets', minutes: 15 }).ok);
  let st = L.steps(l.id); assert.deepEqual(st.map(s => s.kind), ['text', 'game', 'build']);
  L.reorderStep(ana, st[2].id, -1); st = L.steps(l.id); assert.deepEqual(st.map(s => s.kind), ['text', 'build', 'game']);
  assert.equal(L.updateStep(ben, st[0].id, { title: 'hacked' }).code, 'notFound', 'only the owner edits');
  assert.ok(L.updateStep(head, st[0].id, { title: 'Edited by the school admin' }).ok, 'school admins can edit');
  assert.equal(st[2].game_title, 'Planet Quiz');
});

test('sharing and copying inside the school only', () => {
  const l = L.createLesson(ana, oak.id, { title: 'Shared one' }).lesson;
  L.addStep(ana, l.id, { kind: 'text', body: 'Read this' });
  assert.equal(L.copyLesson(ben, l.id).code, 'notFound', 'not shared yet');
  L.updateLesson(ana, l.id, { shared: true });
  assert.ok(L.sharedLessons(ben, oak.id).some(x => x.id === l.id)); assert.ok(!L.sharedLessons(ana, oak.id).some(x => x.id === l.id), 'not your own');
  assert.equal(L.copyLesson(elmT, l.id).code, 'notFound', 'other schools cannot');
  const c = L.copyLesson(ben, l.id); assert.ok(c.ok);
  assert.equal(c.lesson.owner_id, ben.id); assert.equal(L.steps(c.lesson.id).length, 1); assert.equal(c.lesson.copied_from, l.id);
  assert.equal(L.updateLesson(ben, l.id, { title: 'x' }).code, 'notFound', 'copying does not give edit rights');
});

test('assigning to a class: units, order, dates; students see open lessons only; games must be playable', () => {
  const l1 = L.createLesson(ana, oak.id, { title: 'Week 1' }).lesson, l2 = L.createLesson(ana, oak.id, { title: 'Week 2' }).lesson;
  const ownGame = games.createGame(ana.id, { title: 'Ana draft game' });
  games.addVersion(ownGame.id, '<title>x</title><p>x</p>', { createdBy: ana.id, safetyStatus: 'pass' });
  L.addStep(ana, l1.id, { kind: 'game', gameId: ownGame.id });
  const unit = L.createUnit(ana, cls.id, 'Fractions').unit;
  assert.equal(L.createUnit(ben, cls.id, 'Nope').code, 'notFound', "not Ben's class");
  assert.ok(L.assign(ana, cls.id, l1.id, { unitId: unit.id }).ok);
  const tomorrow = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
  assert.ok(L.assign(ana, cls.id, l2.id, { unitId: unit.id, opensAt: tomorrow, dueAt: tomorrow }).ok);
  assert.equal(L.assign(ana, cls.id, l1.id, { opensAt: 'not a date' }).code, 'badDate');
  assert.equal(L.assign(elmT, cls.id, l1.id).code, 'notFound');
  const plan = L.classPlan(cls.id);
  assert.deepEqual(plan.map(g => g.unit && g.unit.name), [null, 'Fractions']);
  assert.deepEqual(plan[1].lessons.map(x => x.title), ['Week 1', 'Week 2']);
  const studentPlan = L.classPlan(cls.id, { openOnly: true });
  assert.deepEqual(studentPlan.flatMap(g => g.lessons.map(x => x.title)), ['Week 1'], 'Week 2 opens tomorrow');
  const week2 = plan[1].lessons[1];
  assert.equal(L.canViewClassLesson(kid, week2), false); assert.ok(L.canViewClassLesson(ana, week2), 'teachers preview anything');
  assert.equal(L.canViewClassLesson(outsider, plan[1].lessons[0]), false);
  // the teacher's own unpublished game is not playable until shared with the school
  const step = L.steps(l1.id)[0];
  assert.equal(L.playableBy(step, oak.id), false);
  q.run("UPDATE games SET status='published', visibility='school', published_version_id=current_version_id WHERE id=?", ownGame.id);
  assert.ok(L.playableBy(L.steps(l1.id)[0], oak.id)); assert.equal(L.playableBy(L.steps(l1.id)[0], elm.id), false);
  // deleting a unit keeps its lessons; deleting a lesson removes its assignments
  L.deleteUnit(ana, unit.id); assert.equal(L.classPlan(cls.id)[0].lessons.length, 2);
  L.deleteLesson(ana, l2.id); assert.equal(L.classLessons(cls.id).length, 1);
});

test('AI draft without a key: a template in the teacher’s language with a matching game', async () => {
  const d = templateDraft({ topic: 'planets' }, [{ id: publicGame.id, title: 'Planet Quiz', description: '', tags: '' }]);
  assert.deepEqual(d.steps.map(s => s.kind), ['text', 'game', 'build', 'question'], 'no separate wrap-up: the exit ticket ends it');
  assert.equal(d.steps[1].gameId, publicGame.id);
  assert.equal(d.steps.reduce((n, s) => n + s.minutes, 0), 40, 'fills the default 40 minutes');
  // plurals match the singular in a game's title or tags (shapes → Shape Sorter, rhymes → rhyme)
  const pick = (topic, g) => (templateDraft({ topic }, [{ id: 'x', description: '', tags: '', ...g }]).steps.find(st => st.kind === 'game') || {}).gameId;
  assert.equal(pick('Shapes', { title: 'Shape Sorter' }), 'x');
  assert.equal(pick('Rhymes', { title: 'Word fun', tags: 'rhyme' }), 'x');
  assert.equal(pick('glass', { title: 'Glass maze' }), 'x');
  assert.equal(pick('oceans', { title: 'Shape Sorter' }), undefined);
  const r = await draftLesson({ topic: 'oceans', minutes: 20 }, []);
  assert.equal(r.ai, false); assert.equal(r.draft.steps.length, 3, 'no game step when nothing matches');
  assert.equal(r.draft.steps.reduce((n, s) => n + s.minutes, 0), 20, 'minutes scaled to the length asked for');
  // small words and descriptions never pick a game; tags win over titles; subject words count after topic words
  const catalog = [{ id: 'h', title: 'Hangman', description: 'guess the letters and words', tags: 'spelling' },
    { id: 't', title: 'Fraction Pizza', description: '', tags: '' }, { id: 'g', title: 'Slice Race', description: '', tags: 'fractions, maths' }];
  assert.equal(templateDraft({ topic: 'cats and dogs' }, catalog).steps.some(s => s.kind === 'game'), false, "'and' matched a description before");
  assert.equal(templateDraft({ topic: 'letters' }, catalog).steps.some(s => s.kind === 'game'), false, 'never on the description alone');
  assert.equal(templateDraft({ topic: 'Fractions' }, catalog).steps[1].gameId, 'g', 'tags first');
  assert.equal(templateDraft({ topic: 'pizza day' }, catalog).steps[1].gameId, 't', 'then titles');
  assert.equal(templateDraft({ topic: 'halves', subject: 'Maths' }, catalog).steps[1].gameId, 'g', 'subject words too');
  assert.equal(templateDraft({ topic: 'x', minutes: 10 }, catalog).steps.reduce((n, s) => n + s.minutes, 0), 10);
});

test('pages and APIs: library, editor, draft, class lessons, student lesson page, build step, 404s', async () => {
  let r = await as(ana)('/teach/lessons'); assert.equal(r.status, 200); assert.match(r.text, /Lesson library/);
  assert.equal((await as(kid)('/teach/lessons')).status, 404);
  r = await as(ana)('/api/lessons/draft', { method: 'POST', body: { schoolId: oak.id, topic: 'Planets', grade: '4' } });
  assert.equal(r.status, 200); const id = r.json.redirect.match(/lessons\/([^?]+)/)[1];
  assert.ok(L.steps(id).length >= 3, 'the draft has steps');
  r = await as(ana)(`/teach/lessons/${id}`); assert.equal(r.status, 200); assert.match(r.text, /Assign to a class/);
  assert.equal((await as(ben)(`/teach/lessons/${id}`)).status, 404, 'not shared');
  r = await as(ana)(`/api/lessons/${id}/assign`, { method: 'POST', body: { classId: cls.id } }); assert.equal(r.status, 200);
  const cl = L.classLessons(cls.id).find(x => x.lesson_id === id);
  r = await as(ana)(`/class/${cls.id}`); assert.match(r.text, /id="lessons"/); assert.match(r.text, /Planets/);
  r = await as(kid)(`/class/${cls.id}`); assert.match(r.text, new RegExp(`/class/${cls.id}/lessons/${cl.id}`));
  r = await as(kid)(`/class/${cls.id}/lessons/${cl.id}`); assert.equal(r.status, 200); assert.match(r.text, /Start building/);
  assert.equal((await as(outsider)(`/class/${cls.id}/lessons/${cl.id}`)).status, 404);
  const build = L.steps(id).find(s => s.kind === 'build');
  r = await as(kid)(`/api/progress/${cl.id}/${build.id}/build`, { method: 'POST', body: {} });
  assert.equal(r.status, 200); assert.match(r.json.redirect, /^\/studio\/[^?]+\?ask=/);
  const gid = r.json.redirect.match(/studio\/([^?]+)/)[1]; assert.equal(games.getGame(gid).owner_id, kid.id);
  // new game from the lesson editor -> a game step + the Studio with the idea ready
  r = await as(ana)(`/api/lessons/${id}/new-game`, { method: 'POST', body: { idea: 'a fractions quiz' } });
  assert.match(r.json.redirect, /ask=a%20fractions%20quiz/);
  assert.ok(L.steps(id).some(s => s.kind === 'game' && games.getGame(s.game_id).owner_id === ana.id));
  // share the new game with the school from the lesson
  const gstep = L.steps(id).find(s => s.kind === 'game' && games.getGame(s.game_id).owner_id === ana.id);
  r = await as(ana)(`/api/lesson-steps/${gstep.id}/share-game`, { method: 'POST', body: {} });
  assert.equal(r.status, 400, 'an empty game cannot be shared yet');
});

test('class Lessons tab and editor: one assignment per class, rows open progress, copy-first, copies open, work counted', async () => {
  const P = await import('../../server/services/progress.js');
  const folder = L.createFolder(ana, oak.id, { name: 'Copies here' }).folder;
  const l = L.createLesson(ana, oak.id, { title: 'Tab lesson', folderId: folder.id }).lesson;
  const step = L.addStep(ana, l.id, { kind: 'text', body: 'Read this' }).step;
  const c5 = S.createClass(ana, oak.id, { name: 'Ana 5C' }).class;
  const benClass = S.createClass(ben, oak.id, { name: 'Ben 6A' }).class;
  const benLesson = L.createLesson(ben, oak.id, { title: 'Ben shared lesson' }).lesson; L.updateLesson(ben, benLesson.id, { shared: true });
  // a new class: the empty state leads to a new lesson / an AI draft that come back with the class
  let r = await as(ana)(`/class/${c5.id}`);
  assert.match(r.text, new RegExp(`/teach/lessons\\?school=${oak.id}&class=${c5.id}&open=new`));
  assert.match(r.text, new RegExp(`<option value="${l.id}">`));
  assert.doesNotMatch(r.text, new RegExp(`<option value="${benLesson.id}"`), "a colleague's lesson is copied first, not assigned");
  assert.match(r.text, /tab=shared/, 'with a hint pointing at Shared by colleagues');
  assert.equal((await as(ana)(`/api/classes/${c5.id}/lessons`, { method: 'POST', body: { lessonId: benLesson.id } })).status, 404);
  r = await as(ana)(`/teach/lessons?school=${oak.id}&class=${c5.id}&open=ai`);
  assert.match(r.text, new RegExp(`name="classId" value="${c5.id}"`)); assert.match(r.text, /class="libdrop aidraft" open/);
  r = await as(ana)('/api/lessons', { method: 'POST', body: { schoolId: oak.id, title: 'From the class', classId: c5.id } });
  assert.match(r.json.redirect, new RegExp(`\\?class=${c5.id}$`));
  r = await as(ana)('/api/lessons', { method: 'POST', body: { schoolId: oak.id, title: 'Not my class', classId: benClass.id } });
  assert.doesNotMatch(r.json.redirect, /class=/, "only a class you teach comes along");
  // assign from the class tab, then the same lesson again from the editor: refused, naming the class
  r = await as(ana)(`/api/classes/${c5.id}/lessons`, { method: 'POST', body: { lessonId: l.id } });
  assert.equal(r.status, 200); assert.match(r.json.toast, /Ana 5C/);
  r = await as(ana)(`/api/lessons/${l.id}/assign`, { method: 'POST', body: { classId: c5.id } });
  assert.equal(r.status, 400); assert.match(r.json.error, /already in Ana 5C/);
  const cl = L.classLessons(c5.id).find(x => x.lesson_id === l.id);
  r = await as(ana)(`/class/${c5.id}`);
  assert.match(r.text, new RegExp(`<li class="cl-row" id="cl-${cl.id}">`));
  assert.match(r.text, new RegExp(`<a class="cl-main" href="/class/${c5.id}/progress/${cl.id}">`), 'the row opens its progress');
  assert.match(r.text, new RegExp(`href="/class/${c5.id}/lessons/${cl.id}"`), 'student view in the ⋯ menu');
  assert.match(r.text, new RegExp(`href="/teach/lessons/${l.id}\\?from=${c5.id}"`));
  assert.doesNotMatch(r.text, new RegExp(`<option value="${l.id}">`), 'not offered twice');
  assert.match(r.text, /<h2 id="ls-h" class="sr-only">/, 'the tab heading is for screen readers only');
  // the editor: one line per class (linking to the row), live notice, class not offered again, back to the class
  r = await as(ana)(`/teach/lessons/${l.id}?from=${c5.id}`);
  assert.match(r.text, new RegExp(`href="/class/${c5.id}#cl-${cl.id}"`));
  assert.match(r.text, new RegExp(`href="/class/${c5.id}/progress/${cl.id}"`));
  assert.doesNotMatch(r.text, new RegExp(`<option value="${c5.id}"`));
  assert.match(r.text, new RegExp(`class="backlink" href="/class/${c5.id}"`));
  assert.match(r.text, /<section class="panel" id="assign">/);
  assert.match((await as(ana)(`/teach/lessons/${l.id}?class=${cls.id}`)).text, new RegExp(`<option value="${cls.id}" selected>`), '?class= preselects');
  assert.doesNotMatch((await as(ana)(`/teach/lessons/${l.id}?from=${benClass.id}`)).text, new RegExp(`class="backlink" href="/class/${benClass.id}"`), "?from= only for your own classes");
  assert.match(r.text, /data-kind="text"/, 'a new step starts as Read or do');
  assert.match(r.text, /\/js\/schools\.js/);
  // student work is counted in the delete confirms; removing from the class keeps it, assigning again brings it back
  S.addToClass(ana, c5.id, kid.id);
  assert.ok(P.markDone(kid, cl.id, step.id).ok);
  r = await as(ana)(`/teach/lessons/${l.id}`);
  assert.match(r.text, /1 student&#39;s work on it will be deleted/);
  assert.match(r.text, /It is in 1 class, and 1 student&#39;s work in it will be deleted/);
  assert.match(r.text, /1 student has started/);
  assert.ok(L.unassign(ana, cl.id).ok);
  r = await as(ana)(`/api/lessons/${l.id}/assign`, { method: 'POST', body: { classId: c5.id } });
  assert.equal(r.status, 200); assert.match(r.json.toast, /again/);
  assert.equal(L.lessonWork(l.id), 1);
  // Make a copy: next to the original, and it opens
  r = await as(ana)(`/api/lessons/${l.id}/copy`, { method: 'POST', body: {} });
  const copyId = r.json.id; assert.equal(r.json.redirect, `/teach/lessons/${copyId}?copied=1`);
  assert.equal(L.getLesson(copyId).folder_id, folder.id);
  assert.match((await as(ana)(r.json.redirect)).text, /This is your copy/);
  // sharing is one button; the Shared by colleagues tab says what it lists
  r = await as(ana)(`/teach/lessons?school=${oak.id}&folder=${folder.id}`);
  assert.match(r.text, new RegExp(`data-api="/api/lessons/${l.id}" data-reload[^>]*><input type="hidden" name="shared" value="1">`));
  r = await as(head)(`/teach/lessons?school=${oak.id}&tab=shared`); assert.match(r.text, /Shared by colleagues/);
});
