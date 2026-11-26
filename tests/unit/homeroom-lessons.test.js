// Homeroom, step 2b (docs/decisions.md "Homeroom, step 2b"; services/homeroom-lessons.js, public/js/homeroom-lesson-make.js):
//   - the builder's settings: Arithmetic Lab, Algebra Builder and Crossword problems made from a seed pass the games'
//     own set cleaners; a version per group is a suggested easier / harder copy; the paper crossword's layout prints;
//   - a lesson is real question sets (one per version) linked by homeroom_lessons: create, edit (a set an assignment
//     opens is never changed under it), duplicate, delete (sets in use stay), only the owner (everyone else 404);
//   - handing out: each student gets their group's version (?chapter=s-...&lock=1 in the step's options), the base for
//     anyone without a group or version; Whole class with one version stays the whole class; refused twice; Score by
//     default; removing every desk takes all the versions handed out together;
//   - the desk card says Lesson and how many problems; scores flow into the Score (Arithmetic Lab: right of N;
//     Crossword: won); the preview and Print (owner only); an In order handout waits on the lesson page, the To do link
//     and the play page; the account's lessons go with it.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HL = await import('../../server/services/homeroom-lessons.js');
const G = await import('../../server/services/game-sets.js');
const M = await import('../../public/js/homeroom-lesson-make.js');
const { PRINTERS } = await import('../../server/services/game-print.js');
const games = await import('../../server/services/games.js');
const AD = await import('../../server/services/account-delete.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};

const boss = createUser({ username: 'HlBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Lesson Oak' }).school;
const staff = name => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff('Ms Rivera'), other = staff('Mr Other'), noPlan = staff('Ms Noplan');
for (const u of [rivera, other]) TOOLS.givePlan(u.id);
const cls = S.createClass(boss, oak.id, { name: 'Room 5', teacherId: rivera.id }).class;
const cls2 = S.createClass(boss, oak.id, { name: 'Room 6', teacherId: rivera.id }).class;
const otherCls = S.createClass(boss, oak.id, { name: 'Room 9', teacherId: other.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const kids = ['Ava', 'Ben', 'Cleo', 'Dev', 'Eli'].map(n => kidIn(cls, n));
const kids2 = ['Fay', 'Gus'].map(n => kidIn(cls2, n));
config.homeroom = true; config.homeroomUsers = [rivera, other, noPlan].map(u => u.username.toLowerCase());

const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug) {
  const g = games.createGame(official.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=? WHERE id=?", v.id, slug, g.id);
  return games.getGame(g.id);
}
const LAB = made('Arithmetic Lab', 'arithmetic-lab'), AB = made('Algebra Builder', 'algebra-builder'), CW = made('Crossword', 'crossword');
// Groups in Room 5: Stretch (Ava, Ben), On track (Cleo), Building (Dev); Eli in none.
const room = H.roomOf(cls.id), [stretch, onTrack, building] = room.groups;
assert.ok(H.saveGroups(rivera, cls, { groups: room.groups, members: { [kids[0].id]: stretch.id, [kids[1].id]: stretch.id, [kids[2].id]: onTrack.id, [kids[3].id]: building.id } }).ok);
const api = (c = cls) => `/api/homeroom/${c.id}`;
const WORDS = [['habitat', 'Where an animal lives'], ['predator', 'An animal that hunts'], ['prey', 'An animal that is hunted'], ['forest', 'Lots of trees together']];
const ident = g => M.groupIdent(g);
const versionsFor = (slug, b) => room.groups.map((g, i) => ({ key: ident(g), label: g.key, s: M.suggest(slug, b, M.leanOf(i, room.groups.length), 100 + i) }));

test('the builder\'s settings: made from a seed, the games\' own cleaners keep them, versions lean easier and harder', () => {
  for (const op of M.ARITH.ops) for (const [size] of M.ARITH.sizes[op]) for (const method of M.ARITH.methods[op]) {
    const s = M.fill('arithmetic-lab', { op, size, method, count: 20, level: 'guided', seed: 11 });
    assert.equal(s.problems.length, 20, `${op} ${size}`);
    assert.ok(HL.cleanSettings('arithmetic-lab', s).ok, `${op} ${size} ${method}`);
  }
  for (const mode of M.ALGEBRA.modes) for (const level of M.ALGEBRA.levels) {
    const s = M.fill('algebra-builder', { mode, level, count: 10, seed: 5 });
    assert.equal(s.problems.length, 10); assert.ok(HL.cleanSettings('algebra-builder', s).ok, `${mode} ${level}`);
  }
  // The same seed, the same problems (the preview and the saved set agree); a changed count makes them again.
  assert.deepEqual(M.fill('arithmetic-lab', { op: 'divide', size: '3/1', count: 10, seed: 3 }).problems, M.fill('arithmetic-lab', { op: 'divide', size: '3/1', count: 10, seed: 3 }).problems);
  const b = M.defaults('arithmetic-lab', 9);
  assert.equal(b.size, '3/1'); assert.equal(b.level, 'guided');
  const harder = M.suggest('arithmetic-lab', b, 1, 2), easier = M.suggest('arithmetic-lab', b, -1, 3);
  assert.equal(harder.size, '4/1'); assert.equal(harder.level, 'onMyOwn');
  assert.equal(easier.size, '2/1'); assert.equal(easier.level, 'countUp');
  assert.deepEqual([M.leanOf(0, 3), M.leanOf(1, 3), M.leanOf(2, 3), M.leanOf(0, 1)], [1, 0, -1, 0]);
  assert.equal(M.suggest('algebra-builder', M.defaults('algebra-builder', 4), 1, 5).level, 'medium');
  assert.equal(M.suggest('crossword', { words: WORDS, bank: true, hints: true, seed: 2 }, 1).bank, false);
  // The paper crossword: every word down, and the game's own printer takes the layout.
  const lay = M.crossLayout(WORDS.map(w => w[0]), 4);
  assert.equal(lay.e.length, WORDS.length);
  assert.ok(PRINTERS.get('crossword').clean({ t: 'Habitats', w: WORDS, g: lay }).ok);
  // A group's identity: its name, or an unnamed default group's key.
  assert.equal(ident(stretch), 'k:stretch'); assert.equal(ident({ name: ' Tigers ' }), 'n:tigers');
  assert.equal(M.algebraText('x^2-3x-18'), 'x² − 3x − 18');
  // Crossword: a word without a clue, too few words, unkind words: refused.
  assert.equal(HL.cleanSettings('crossword', { words: WORDS.slice(0, 2) }).code, 'fewWords');
  assert.equal(HL.cleanSettings('crossword', { words: [...WORDS.slice(0, 3), ['ocean', '']] }).code, 'missingClue');
  assert.equal(HL.cleanSettings('crossword', { words: [...WORDS.slice(0, 3), ['ocean', 'Call 555-123-4567 now']] }).code, 'words');
});

let labLesson, cwLesson;
test('create, list and edit a lesson: real question sets, one per version; only the owner', async () => {
  const baseS = M.defaults('arithmetic-lab', 21);
  const r = await as(rivera)(`${api()}/lessons`, { body: { slug: 'arithmetic-lab', title: 'Long division practice', instructions: 'Show every step.', base: baseS, versions: versionsFor('arithmetic-lab', baseS) } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.toast, /Saved to My lesson plans/);
  labLesson = HL.getMine(rivera, r.json.id);
  assert.equal(labLesson.versions.length, 3);
  const sets = [labLesson.base.set, ...labLesson.versions.map(v => v.set)];
  assert.equal(new Set(sets).size, 4, 'four sets');
  for (const s of sets) { const set = G.get(LAB.id, s); assert.equal(set.ownerId, rivera.id); assert.equal(set.items[0].k, 'divide'); }
  assert.deepEqual(G.get(LAB.id, labLesson.base.set).items[0].p, baseS.problems, 'the exact problems of the preview');
  assert.equal(G.get(LAB.id, labLesson.versions[0].set).items[0].l, 'onMyOwn', 'Stretch: less help');
  assert.match(G.get(LAB.id, labLesson.versions[0].set).title, /Long division practice · stretch/);
  const list = r.json.lessons;
  assert.equal(list.length, 1); assert.equal(list[0].n, 10); assert.equal(list[0].versions.length, 3);
  // The board's page carries My lessons and the lesson games.
  const page = await as(rivera)(`/class/${cls.id}/hub`);
  assert.match(page.text, /id="hr-lessons"/); assert.match(page.text, /Long division practice/); assert.match(page.text, /"lessonGames":\[\{"slug":"arithmetic-lab"/);
  // Edit: a new name and an easier base; the sets stay the same (nothing opens them yet).
  const easier = M.fill('arithmetic-lab', { ...baseS, size: '2/1', problems: null });
  const e = await as(rivera)(`${api()}/lessons`, { body: { id: labLesson.id, slug: 'arithmetic-lab', title: 'Division practice', instructions: 'Show every step.', base: easier, versions: labLesson.versions.map(v => ({ key: v.key, label: v.label, s: v.s })) } });
  assert.equal(e.status, 200, e.text);
  const ed = HL.getMine(rivera, labLesson.id);
  assert.equal(ed.base.set, labLesson.base.set); assert.equal(ed.title, 'Division practice');
  assert.deepEqual(G.get(LAB.id, ed.base.set).items[0].p, easier.problems);
  labLesson = ed;
  // Refusals: no name, a bad word, another game, someone else's lesson, a student, no plan.
  assert.equal((await as(rivera)(`${api()}/lessons`, { body: { slug: 'arithmetic-lab', title: ' ', base: baseS } })).json.code, 'needTitle');
  assert.equal((await as(rivera)(`${api()}/lessons`, { body: { slug: 'arithmetic-lab', title: 'Call 555-123-4567', base: baseS } })).json.code, 'words');
  assert.equal((await as(rivera)(`${api()}/lessons`, { body: { slug: 'sudoku', title: 'X', base: baseS } })).json.code, 'badGame');
  assert.equal((await as(rivera)(`${api()}/lessons`, { body: { slug: 'arithmetic-lab', title: 'X', base: baseS, versions: [{ key: 'bad', label: 'x', s: baseS }] } })).json.code, 'settings');
  assert.equal((await as(other)(`${api(otherCls)}/lessons`, { body: { id: labLesson.id, slug: 'arithmetic-lab', title: 'Mine now', base: baseS } })).status, 404);
  assert.deepEqual((await as(other)(`${api(otherCls)}/lessons`)).json.lessons, [], 'nobody else\'s lessons');
  for (const who of [kids[0], noPlan, null]) assert.equal((await as(who)(`${api()}/lessons`)).status, 404);
  // The same lessons from another of the teacher's classes.
  assert.equal((await as(rivera)(`${api(cls2)}/lessons`)).json.lessons.length, 1);
});

test('Crossword and Algebra Builder lessons; the preview; duplicate and delete', async () => {
  const cw = await as(rivera)(`${api()}/lessons`, { body: { slug: 'crossword', title: 'Habitats', base: { words: WORDS, bank: true, hints: true, seed: 3 } } });
  assert.equal(cw.status, 200, cw.text);
  cwLesson = HL.getMine(rivera, cw.json.id);
  assert.equal(G.get(CW.id, cwLesson.base.set).items[0].t, 'Habitats', 'the puzzle\'s own title is the lesson\'s name');
  const ab = await as(rivera)(`${api()}/lessons`, { body: { slug: 'algebra-builder', title: 'Solve it', base: M.defaults('algebra-builder', 8) } });
  assert.equal(ab.status, 200, ab.text);
  const abl = HL.getMine(rivera, ab.json.id);
  assert.equal(G.get(AB.id, abl.base.set).items.length, 5);
  // The preview: the game's own printer (Arithmetic Lab's), the lesson's name on top.
  const pv = await as(rivera)(`${api()}/lessons/preview`, { body: { slug: 'arithmetic-lab', title: 'Draft', instructions: 'Go!', settings: M.defaults('arithmetic-lab', 4) } });
  assert.equal(pv.status, 200, pv.text); assert.match(pv.json.html, /class="cwp bbp"/); assert.match(pv.json.html, /<h1>Draft<\/h1>/); assert.match(pv.json.html, /Go!/);
  const pa = await as(rivera)(`${api()}/lessons/preview`, { body: { slug: 'algebra-builder', title: 'A', settings: M.defaults('algebra-builder', 4) } });
  assert.match(pa.json.html, /abp-list/); assert.match(pa.json.html, /Solve for x/);
  const pc = await as(rivera)(`${api()}/lessons/preview`, { body: { slug: 'crossword', title: 'Habitats', settings: { words: WORDS, seed: 2 } } });
  assert.match(pc.json.html, /cwp-grid/); assert.match(pc.json.html, /Where an animal lives/);
  assert.equal((await as(kids[0])(`${api()}/lessons/preview`, { body: { slug: 'crossword', settings: {} } })).status, 404);
  // Duplicate: new sets; delete: the sets go too.
  const d = await as(rivera)(`${api()}/lessons/${abl.id}/duplicate`, { body: {} });
  assert.equal(d.status, 200, d.text);
  const copy = HL.getMine(rivera, d.json.id);
  assert.equal(copy.title, 'Copy of Solve it'); assert.notEqual(copy.base.set, abl.base.set);
  assert.equal((await as(other)(`${api(otherCls)}/lessons/${abl.id}/delete`, { body: {} })).status, 404);
  const del = await as(rivera)(`${api()}/lessons/${copy.id}/delete`, { body: {} });
  assert.equal(del.status, 200); assert.equal(HL.getMine(rivera, copy.id), null); assert.equal(G.get(AB.id, copy.base.set), null);
});

test('handing a lesson out: each student gets their group\'s version; Score by default; a desk card; never twice', async () => {
  const give = body => as(rivera)(`${api()}/handouts`, { body });
  const r = await give({ lessonId: labLesson.id, to: { kind: 'all' } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.toast, /Division practice is on 5 desks, with a version for each group/);
  const hs = r.json.handouts.filter(h => h.lesson);
  assert.equal(hs.length, 4, 'three groups and the base (Eli has no group)');
  assert.ok(hs.every(h => h.grade === 'score' && h.title === 'Division practice' && h.batch === hs[0].batch));
  const setOf = kid => { const c = HO.deskView(cls, kid)[0]; return /chapter=(s-[a-z0-9]{10})&lock=1/.exec(c.href)[1]; };
  const v = k => labLesson.versions.find(x => x.key === k).set;
  assert.equal(setOf(kids[0]), v('k:stretch')); assert.equal(setOf(kids[1]), v('k:stretch'));
  assert.equal(setOf(kids[2]), v('k:onTrack')); assert.equal(setOf(kids[3]), v('k:building'));
  assert.equal(setOf(kids[4]), labLesson.base.set, 'no group: the lesson as built');
  const card = HO.deskView(cls, kids[0])[0];
  assert.equal(card.lesson, true); assert.equal(card.n, 10); assert.equal(card.unit, 'problems'); assert.equal(card.title, 'Division practice');
  assert.equal(card.instructions, 'Show every step.');
  assert.match(card.href, /^\/play\/arithmetic-lab\?lesson=.+&step=.+&chapter=s-[a-z0-9]{10}&lock=1$/);
  // The student's own desk never shows a group name or another version.
  const st = await as(kids[3])(`/api/desk/${cls.id}/state`);
  assert.doesNotMatch(st.text, /stretch|onTrack|building|Stretch|Building/);
  // Twice for anyone: refused. Free play of the same game is still its own thing.
  const again = await give({ lessonId: labLesson.id, to: { kind: 'desk', id: kids[2].id } });
  assert.equal(again.json.code, 'lessonOnDesk'); assert.match(again.json.error, /already has this lesson/);
  assert.equal((await give({ gameId: LAB.id, to: { kind: 'desk', id: kids[2].id } })).status, 200);
  // Someone else's lesson, a bad grade: refused.
  assert.equal((await as(other)(`${api(otherCls)}/handouts`, { body: { lessonId: labLesson.id, to: { kind: 'all' } } })).json.code, 'noLesson');
  assert.equal((await give({ lessonId: cwLesson.id, to: { kind: 'all' }, grade: 'stars' })).json.code, 'badGrade');
  // Whole class with one version for everyone stays the whole class; Completion when picked.
  const cwr = await give({ lessonId: cwLesson.id, to: { kind: 'all' }, order: 'any', grade: 'completion' });
  assert.equal(cwr.status, 200, cwr.text);
  const cwh = cwr.json.handouts.find(h => h.title === 'Habitats');
  assert.deepEqual(L.studentsOfLesson(cwh.id), []); assert.equal(cwh.grade, 'completion'); assert.equal(cwh.unit, 'words'); assert.equal(cwh.n, 4);
  // Another class: the same versions by the groups' identities (its default groups).
  const room2 = H.roomOf(cls2.id);
  assert.ok(H.saveGroups(rivera, cls2, { groups: room2.groups, members: { [kids2[0].id]: room2.groups[2].id } }).ok);
  assert.equal((await as(rivera)(`${api(cls2)}/handouts`, { body: { lessonId: labLesson.id, to: { kind: 'all' } } })).status, 200);
  assert.equal(/chapter=(s-[a-z0-9]{10})/.exec(HO.deskView(cls2, kids2[0])[0].href)[1], v('k:building'));
  assert.equal(/chapter=(s-[a-z0-9]{10})/.exec(HO.deskView(cls2, kids2[1])[0].href)[1], labLesson.base.set);
});

test('editing a lesson that is on desks never changes their sets; deleting keeps the sets in use', async () => {
  const was = HL.getMine(rivera, labLesson.id);
  const s = M.fill('arithmetic-lab', { ...was.base.s, count: 5, problems: null });
  const r = await as(rivera)(`${api()}/lessons`, { body: { id: was.id, slug: 'arithmetic-lab', title: was.title, instructions: was.instructions, base: s, versions: [] } });
  assert.equal(r.status, 200, r.text);
  const now2 = HL.getMine(rivera, was.id);
  assert.notEqual(now2.base.set, was.base.set, 'a new set; the old one stays for the desks');
  assert.equal(G.get(LAB.id, was.base.set).items[0].p.length, 10);
  for (const v of was.versions) assert.ok(G.get(LAB.id, v.set), 'versions on desks stay');
  // Deleting the Crossword lesson: its set is on desks, so it stays.
  assert.equal((await as(rivera)(`${api()}/lessons/${cwLesson.id}/delete`, { body: {} })).status, 200);
  assert.ok(G.get(CW.id, cwLesson.base.set));
  assert.equal(HO.deskView(cls, kids[0]).find(x => x.title === 'Habitats').ready, true);
});

test('scores flow: Arithmetic Lab right of N, Crossword won, played without finishing is not scored', async () => {
  const gb = () => P.classProgress(cls.id);
  const lab = HO.deskView(cls, kids[0])[0], step = L.steps(L.getClassLesson(lab.id).lesson_id)[0];
  assert.ok(P.gameScore(kids[0], lab.id, step.id, 7).ok);
  let g = gb(); const col = g.lessons.findIndex(l => l.id === lab.id);
  const ava = g.students.find(p => p.id === kids[0].id);
  assert.deepEqual([ava.cells[col].score.earned, ava.cells[col].score.possible, ava.cells[col].score.pct], [7, 10, 70]);
  // the play page's end with won (Crossword finishes only when every word is right): all of it
  const cw = HO.deskView(cls, kids[1]).find(x => x.title === 'Habitats'), cstep = L.steps(L.getClassLesson(cw.id).lesson_id)[0];
  const end = await as(kids[1])(`/api/progress/${cw.id}/${cstep.id}/game`, { body: { event: 'end', score: null, won: true } });
  assert.equal(end.status, 200, end.text);
  // (Completion-graded: no Score item; make a score-graded copy to check the rule)
  q.run("UPDATE homeroom_handouts SET grade='score' WHERE class_lesson_id=?", cw.id);
  g = gb();
  const ben = g.students.find(p => p.id === kids[1].id), ccol = g.lessons.findIndex(l => l.id === cw.id);
  assert.equal(ben.cells[ccol].score.pct, 100);
  // two minutes of play, no result: done, not scored
  assert.ok(P.gameTime(kids[2], cw.id, cstep.id, 60).ok); assert.ok(P.gameTime(kids[2], cw.id, cstep.id, 60).ok);
  g = gb();
  const cleo = g.students.find(p => p.id === kids[2].id);
  assert.equal(cleo.cells[ccol].done, 1); assert.equal(cleo.cells[ccol].score, null);
});

test('Print worksheet: each version, the owner only; the answer key for Arithmetic Lab', async () => {
  const l = HL.getMine(rivera, labLesson.id);
  const r = await as(rivera)(`${api()}/lessons/${l.id}/print`, { body: { version: '', key: true } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.html, /<h1>Division practice<\/h1>/); assert.match(r.json.html, /cwp-key/);
  assert.match(r.json.html, new RegExp(G.codeOf(l.base.set)));
  assert.doesNotMatch(r.json.html, /stretch|Stretch/, 'no group name on paper');
  assert.equal((await as(rivera)(`${api()}/lessons/${l.id}/print`, { body: { version: 'k:nope' } })).status, 404);
  assert.equal((await as(other)(`${api(otherCls)}/lessons/${l.id}/print`, { body: {} })).status, 404);
  assert.equal((await as(kids[0])(`${api()}/lessons/${l.id}/print`, { body: {} })).status, 404);
  assert.equal((await as(null)(`${api()}/lessons/${l.id}/print`, { body: {} })).status, 404);
});

test('an In order handout waits: the To do link and the play link show "Finish the one before it first"', async () => {
  // Eli: the base lesson (in order, not done) then the crossword (any order) then a new In order lesson.
  const ab = HL.listMine(rivera).find(x => x.slug === 'algebra-builder');
  const r = await as(rivera)(`${api()}/handouts`, { body: { lessonId: ab.id, to: { kind: 'desk', id: kids[4].id } } });
  assert.equal(r.status, 200, r.text);
  const desk = HO.deskView(cls, kids[4]), waiting = desk.find(x => x.title === 'Solve it');
  assert.equal(waiting.locked, true);
  assert.ok(P.toDoFor(cls.id, kids[4].id).some(x => x.id === waiting.id), 'it is on the To do list');
  const page = await as(kids[4])(`/class/${cls.id}/lessons/${waiting.id}`);
  assert.equal(page.status, 200); assert.match(page.text, /Finish the one before it on your desk first/); assert.match(page.text, new RegExp(`href="/class/${cls.id}/desk"`));
  assert.doesNotMatch(page.text, /\/play\/algebra-builder/);
  const step = L.steps(L.getClassLesson(waiting.id).lesson_id)[0];
  const play = await as(kids[4])(`/play/algebra-builder?lesson=${waiting.id}&step=${step.id}`);
  assert.match(play.text, /Finish the one before it on your desk first/); assert.doesNotMatch(play.text, /class="playbar"/);
  // The ones before it done: it opens.
  for (const c of desk.slice(0, desk.indexOf(waiting))) assert.ok(P.markDone(kids[4], c.id, L.steps(L.getClassLesson(c.id).lesson_id)[0].id).ok);
  const open = await as(kids[4])(`/class/${cls.id}/lessons/${waiting.id}`);
  assert.doesNotMatch(open.text, /Finish the one before it on your desk first/); assert.match(open.text, /\/play\/algebra-builder/);
  // The teacher opening the lesson page is never stopped.
  assert.doesNotMatch((await as(rivera)(`/class/${cls.id}/lessons/${waiting.id}`)).text, /Finish the one before it/);
});

test('Remove from every desk takes all the versions handed out together; the account\'s lessons go with it', async () => {
  const lab = HO.boardView(cls).handouts.find(h => h.lesson && h.title === 'Division practice');
  const r = await as(rivera)(`${api()}/handouts/${lab.id}/remove`, { body: {} });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.handouts.filter(h => h.batch === lab.batch).length, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id WHERE h.batch=? AND cl.removed_at IS NULL', lab.batch).n, 0);
  // The account goes: its lessons and their sets.
  const t = staff('Ms Gone'); TOOLS.givePlan(t.id); config.homeroomUsers.push(t.username.toLowerCase());
  assert.ok(HL.saveLesson(t, { slug: 'algebra-builder', title: 'Mine', base: M.defaults('algebra-builder', 2) }).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_lessons WHERE owner_id=?', t.id).n, 1);
  const res = AD.deleteAccount(t.id, boss, { by: 'admin', parentMade: false, leaveSchools: true });
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_lessons WHERE owner_id=?', t.id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM game_sets WHERE owner_id=?', t.id).n, 0);
});
