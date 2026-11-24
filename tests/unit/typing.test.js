// Typing Pets (seed-games/typing-pets.html) and the teacher's typing panel on the class progress page
// (services/typing.js, routes/progress.js): the game passes the scanner and its lessons match the server's list; a save is
// read back as clean numbers whatever the browser wrote into it; the panel shows only the class's own students, only to
// the people who may see the class's progress.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { createUser, startSession } = await import('../../server/auth.js');
const G = await import('../../server/services/games.js');
const S = await import('../../server/services/schools.js');
const TY = await import('../../server/services/typing.js');
const { scanVersion } = await import('../../server/services/scanner.js');

seed({ quiet: true });
const html = fs.readFileSync('seed-games/typing-pets.html', 'utf8');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const get = async (who, path) => { const r = await fetch(base + path, { headers: { cookie: cookieFor(who.id) }, redirect: 'manual' }); return { status: r.status, text: await r.text() }; };

test('the game passes the scanner, starts the way seed games must, and its lessons are the server\'s', () => {
  assert.equal(scanVersion(html).status, 'pass');
  assert.match(html, /^<title>Typing Pets<\/title>\n<style>/);
  const ids = [...html.matchAll(/\{ id: '(l\d\d)'/g)].map(m => m[1]);
  assert.deepEqual(ids, TY.LESSONS, 'LESSONS in the game and in services/typing.js agree');
  const names = [...html.matchAll(/\{ id: 'l\d\d', unit: \d, name: (['"])(.*?)\1/g)].map(m => m[2]);
  assert.deepEqual(names, TY.LESSON_NAMES, 'and their names (the Assign picker)');
  assert.match(html, /const TESTS = \[\{ id: 't1', min: 1 \}, \{ id: 't3', min: 3 \}, \{ id: 't5', min: 5 \}\]/);
  assert.match(html, new RegExp(`SAVE_KEY = '${TY.SAVE_KEY}'`));
  const meta = JSON.parse(fs.readFileSync('seed-games/typing-pets.json', 'utf8'));
  assert.equal(meta.shelf, 'learn');
  assert.equal(G.getGameBySlug('typing-pets').shelf, 'learn');
});

test('a save reads back as clean numbers; a tampered one is clamped, never trusted', () => {
  assert.equal(TY.summarize(null), null);
  assert.equal(TY.summarize('not json'), null);
  assert.equal(TY.summarize({ done: {} }), null, 'no lesson finished yet');
  const ok = TY.summarize(JSON.stringify({ v: 1, done: { l01: { s: 3, w: 18, a: 97, n: 2, t: 1000 }, l02: { s: 2, w: 22, a: 89, n: 1, t: 2000 } },
    pets: { cat: { s: 1 }, dog: { s: 0 } }, keys: { f: [40, 1], d: [20, 6], k: [30, 4], j: [3, 2] }, secs: 600, last: 2500 }));
  assert.equal(ok.done, 2); assert.equal(ok.next, 3); assert.equal(ok.stars, 5);
  assert.equal(ok.bestWpm, 22); assert.equal(ok.acc, 93); assert.equal(ok.pets, 2); assert.equal(ok.minutes, 10); assert.equal(ok.last, 2500);
  assert.deepEqual(ok.tricky, [{ key: 'd', pct: 23 }, { key: 'k', pct: 12 }], 'f is fine; j has too few tries to judge');

  const bad = TY.summarize({ done: { l01: { s: 99, w: 1e9, a: -5, n: 'x', t: 'y' }, l99: { s: 3 }, '__proto__': { s: 3 } },
    pets: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`p${i}`, 1])),
    keys: { '<script>': [1e9, 1e9], f: ['a', 'b'], k: 'nope' }, secs: -1, last: 'soon' });
  assert.equal(bad.done, 1, 'only the game\'s own lesson ids');
  assert.equal(bad.stars, 3); assert.equal(bad.bestWpm, 200); assert.equal(bad.acc, 0); assert.equal(bad.pets, 40); assert.equal(bad.minutes, 0);
  assert.deepEqual(bad.tricky, [], 'unknown keys are dropped');
  const all = TY.summarize({ done: Object.fromEntries(TY.LESSONS.map(id => [id, { s: 1, w: 10, a: 80 }])) });
  assert.equal(all.next, null, 'every lesson done');

  // Timed tests: the best run of each length; a test alone (no lesson yet) still counts as having typed.
  const tested = TY.summarize({ tests: { t1: { w: 22, a: 94, n: 3, t: 5000 }, t3: { w: 19, a: 97, n: 1 }, t9: { w: 99, a: 99 }, log: [[1, 22, 94, 5000]] },
    keys: { 7: [10, 4], '/': [9, 1], '<': [50, 50] } });
  assert.equal(tested.done, 0); assert.deepEqual(tested.tests.map(x => x.min), [1, 3], 'only the game\'s own tests');
  assert.deepEqual(tested.bestTest, { min: 1, wpm: 22, acc: 94, runs: 3 }); assert.equal(tested.last, 5000);
  assert.deepEqual(tested.tricky.map(x => x.key), ['7', '/'], 'number and symbol keys count; unknown ones are dropped');
  assert.equal(TY.summarize({ tests: { t1: { w: 9e9, a: 400 } } }).bestTest.wpm, 200);
  const goal = { wpm: 19, acc: 95 };
  assert.equal(TY.meetsGoal(tested, goal), true, 'the 3-minute test meets it');
  assert.equal(TY.meetsGoal(tested, { wpm: 21, acc: 95 }), false);
  assert.equal(TY.meetsGoal(ok, goal), null, 'no test yet');
  assert.equal(TY.meetsGoal(tested, null), null, 'no goal');
});

// A school, a class with two students (one has typed) and a teacher of another class.
const boss = createUser({ username: 'TypeBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Keys Primary' }).school;
const head = S.createSchoolAccount(boss, school.id, { rosterName: 'Mrs Keys', role: 'admin' }).user;
const teacher = S.createSchoolAccount(head, school.id, { rosterName: 'Mr Home Row', role: 'teacher' }).user;
const other = S.createSchoolAccount(head, school.id, { rosterName: 'Ms Elsewhere', role: 'teacher' }).user;
const klass = S.createClass(teacher, school.id, { name: 'Typing 3A' }).class;
S.createClass(other, school.id, { name: 'Other 3B' });
const ada = S.createSchoolAccount(head, school.id, { rosterName: 'Ada Typer' }).user;
const ben = S.createSchoolAccount(head, school.id, { rosterName: 'Ben Later' }).user;
const outsider = S.createSchoolAccount(head, school.id, { rosterName: 'Olly Outside' }).user;
for (const p of [ada, ben]) assert.ok(S.addToClass(teacher, klass.id, p.id).ok);
const game = G.getGameBySlug('typing-pets');
const putTyping = (u, save) => G.putSave(game.id, u.id, { [TY.SAVE_KEY]: JSON.stringify(save) });

test('no typing yet: no typing panel on the class progress page', async () => {
  const r = await get(teacher, `/class/${klass.id}/progress`);
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.text, /id="typing"/);
});

test('the class\'s teacher sees each student\'s typing, including practice outside class; others do not', async () => {
  putTyping(ada, { v: 1, done: { l01: { s: 3, w: 14, a: 96, n: 1, t: Date.now() } }, pets: { cat: { s: 1 } }, keys: { f: [30, 0], j: [20, 5] }, secs: 240, last: Date.now() });
  putTyping(outsider, { v: 1, done: { l01: { s: 3, w: 99, a: 99 } } });   // not in the class
  const r = await get(teacher, `/class/${klass.id}/progress`);
  assert.equal(r.status, 200);
  const panel = r.text.slice(r.text.indexOf('id="typing"'), r.text.indexOf('</details>', r.text.indexOf('id="typing"')));
  assert.ok(panel.length > 100, 'the typing panel is there');
  assert.match(panel, /1 of 2 students have typed/);
  assert.match(panel, /Ada Typer[\s\S]*1\/28[\s\S]*Lesson 2[\s\S]*No timed test yet[\s\S]*96%[\s\S]*<kbd[^>]*>j<\/kbd>[\s\S]*4 min/);
  assert.match(panel, /Ben Later[\s\S]*Not started yet/);
  assert.doesNotMatch(panel, /Olly Outside|99 wpm/, 'only this class\'s students');
  assert.match(panel, new RegExp(`/teach/assign\\?id=${game.id}&amp;class=${klass.id}`));
  assert.match(r.text, /href="#typing"/, 'a jump chip to the panel');

  assert.notEqual((await get(other, `/class/${klass.id}/progress`)).status, 200, 'a teacher of another class');
  assert.notEqual((await get(ada, `/class/${klass.id}/progress`)).status, 200, 'a student');
});

test("a class goal: set by the class's teacher only, measured against each student's best timed test", async () => {
  const post = async (who, body) => { const r = await fetch(`${base}/api/class/${klass.id}/typing-goal`, { method: 'POST', headers: { cookie: cookieFor(who.id), 'content-type': 'application/json', origin: base }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
  assert.equal((await post(other, { wpm: 10 })).status, 404, 'a teacher of another class');
  assert.equal((await post(ada, { wpm: 10 })).status, 404, 'a student');
  assert.equal(TY.getGoal(klass.id), null);
  const r = await post(teacher, { wpm: '20', acc: '90' });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.deepEqual(TY.getGoal(klass.id), { wpm: 20, acc: 90, mins: 0 });
  assert.deepEqual((await post(teacher, { wpm: 9999, acc: -3 })).json.goal, { wpm: 120, acc: 50, mins: 0 }, 'clamped');
  await post(teacher, { wpm: 20, acc: 90 });
  putTyping(ben, { v: 1, done: {}, tests: { t1: { w: 24, a: 93, n: 1, t: Date.now() } } });
  const page = (await get(teacher, `/class/${klass.id}/progress`)).text;
  const panel = page.slice(page.indexOf('id="typing"'), page.indexOf('</details>', page.indexOf('id="typing"')));
  assert.match(panel, /2 of 2 students have typed · goal 20 wpm at 90%: 1 of 2 met/);
  assert.match(panel, /Ben Later[\s\S]*24 wpm[\s\S]*93% · 1 min[\s\S]*Goal met/);
  assert.match(panel, new RegExp(`data-api="/api/class/${klass.id}/typing-goal"`), 'the goal form for the teacher');
  assert.doesNotMatch((await get(head, `/class/${klass.id}/progress`)).text, /^$/);
  assert.equal((await post(teacher, { wpm: '' })).json.goal, null, 'an empty speed clears it');
  assert.equal(TY.getGoal(klass.id), null);
});

test('Assign: pick one lesson or test (checked against the list), or the whole game', async () => {
  const page = (await get(teacher, `/teach/assign?id=${game.id}&class=${klass.id}`)).text;
  assert.match(page, /<select class="input" id="ag-o" name="opts"><option value="">Any lesson \(students pick\)<\/option><option value="chapter=l01&amp;lock=1">Lesson 1: F and J<\/option>/);
  assert.match(page, /<option value="chapter=t3&amp;lock=1">3-minute test<\/option>/);
  const assign = async opts => { const r = await fetch(`${base}/api/teach/assign-game`, { method: 'POST', headers: { cookie: cookieFor(teacher.id), 'content-type': 'application/json', origin: base }, body: JSON.stringify({ gameId: game.id, classId: klass.id, opts }) }); return { status: r.status, json: await r.json() }; };
  { const r = await assign('chapter=evil&lock=1'); assert.equal(r.status, 200, JSON.stringify(r.json)); }   // not on the list: the whole game
  { const r = await assign('chapter=l07&lock=1'); assert.equal(r.status, 200, JSON.stringify(r.json)); }
  { const r = await assign('chapter=t1&lock=1'); assert.equal(r.status, 200, JSON.stringify(r.json)); }
  assert.equal((await assign('chapter=l07&lock=1')).status, 400, 'the same lesson twice');
  const { q } = await import('../../server/db.js');
  const steps = q.all("SELECT s.title, s.options FROM lesson_steps s JOIN lessons l ON l.id=s.lesson_id WHERE s.game_id=? ORDER BY l.created_at", game.id);
  assert.deepEqual(steps.map(x => [x.title, x.options]), [['Typing Pets', ''], ['Typing Pets: Lesson 7: E and I', 'chapter=l07&lock=1'], ['Typing Pets: 1-minute test', 'chapter=t1&lock=1']]);
});

// ---------------------------------------------------------------- part 3: teachers' own lessons, pass marks, daily goal
const SETS = await import('../../server/services/game-sets.js');
const post = async (who, path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { cookie: cookieFor(who.id), 'content-type': 'application/json', origin: base }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };

test('a teacher\'s own lesson: only what the keyboard can type, through the site\'s filter', () => {
  assert.deepEqual(SETS.cleanTypingItems([{ t: 'Week 3', x: 'It’s “fun” to type—really…\r\n\r\n   Two   lines ', k: 'test', n: 3 }]),
    [{ t: 'Week 3', x: 'It\'s "fun" to type-really...\nTwo lines', k: 'test', n: 3 }], 'curly marks made plain, spaces tidied');
  assert.deepEqual(SETS.cleanTypingItems([{ x: 'hello there class', k: 'other' }]), [{ t: '', x: 'hello there class', k: 'lesson' }]);
  assert.equal(SETS.cleanTypingItems([{ x: 'a test', k: 'test', n: 7 }]), null, 'too short');
  assert.equal(SETS.cleanTypingItems([{ x: 'a fine test here', k: 'test', n: 7 }])[0].n, 1, 'an odd length is a minute');
  for (const x of ['café au lait please', 'price is 5€ today', '<b>bold</b> words', 'x'.repeat(1501)]) assert.equal(SETS.cleanTypingItems([{ x }]), null, x.slice(0, 20));
  assert.equal(SETS.cleanTypingItems([{ x: 'call me on 555 123 4567 now' }]), null, 'nothing personal');
  assert.equal(SETS.cleanTypingItems([{ x: 'one' }, { x: 'two' }]), null, 'one lesson a set');
  assert.ok(SETS.SET_GAMES.has('typing-pets') && SETS.OPEN_SET_GAMES.has('typing-pets'));
});

test('saving a lesson: teachers only; a student opens it by its code; Assign opens it', async () => {
  const items = [{ t: 'Our poem', x: 'Roses are red, violets are blue.', k: 'lesson' }];
  assert.equal((await post(ada, `/api/games/${game.id}/sets`, { items })).status, 403, 'not a student');
  const r = await post(teacher, `/api/games/${game.id}/sets`, { items, title: 'Our poem' });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.match(r.json.id, SETS.SET_ID);
  assert.equal((await post(teacher, `/api/games/${game.id}/sets`, { items: [{ x: 'naïve café' }] })).status, 400);
  const play = (await get(ada, `/play/typing-pets?chapter=${r.json.id}&lock=1`)).status;
  assert.equal(play, 200);
  const page = (await get(teacher, `/teach/assign?id=${game.id}&class=${klass.id}&opts=chapter%3D${r.json.id}%26lock%3D1`)).text;
  assert.match(page, /Our poem: typing lesson, 32 characters/);
  assert.doesNotMatch(page, /id="ag-o"/, 'no built-in lesson picker beside a teacher\'s lesson');
  assert.match(page, /name="passAcc"/);
  const a = await post(teacher, '/api/teach/assign-game', { gameId: game.id, classId: klass.id, opts: `chapter=${r.json.id}&lock=1`, passAcc: '90', passWpm: '' });
  assert.equal(a.status, 200, JSON.stringify(a.json));
  const { q } = await import('../../server/db.js');
  const step = q.get("SELECT s.title, s.options FROM lesson_steps s WHERE s.game_id=? AND s.options LIKE ?", game.id, `chapter=${r.json.id}%`);
  assert.deepEqual(step, { title: 'Typing Pets: Our poem: typing lesson, 32 characters (pass 90%)', options: `chapter=${r.json.id}&mode=a90&lock=1` });
});

test('pass marks: clamped, either part optional, carried in mode', async () => {
  assert.equal(TY.passMode('', ''), null);
  assert.equal(TY.passMode('abc', undefined), null);
  assert.deepEqual(TY.passMode('90', '20'), { acc: 90, wpm: 20, mode: 'a90-w20' });
  assert.deepEqual(TY.passMode('5', '999'), { acc: 50, wpm: 120, mode: 'a50-w120' });
  assert.deepEqual(TY.passMode('', '15'), { acc: null, wpm: 15, mode: 'w15' });
  const a = await post(teacher, '/api/teach/assign-game', { gameId: game.id, classId: klass.id, opts: 'chapter=l03&lock=1', passAcc: '95', passWpm: '12' });
  assert.equal(a.status, 200, JSON.stringify(a.json));
  const { q } = await import('../../server/db.js');
  assert.equal(q.get("SELECT options FROM lesson_steps WHERE game_id=? AND options LIKE 'chapter=l03%'", game.id).options, 'chapter=l03&mode=a95-w12&lock=1');
  assert.match(html, /function readPass\(\)/, 'the game reads it');
  assert.match(html, /if \(passed && BRBx && BRBx\.score\)/, 'and only reports a run that passed');
});

test('a daily practice goal: minutes a day, days met in the last week', async () => {
  const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const sum = TY.summarize({ done: { l01: { s: 3, w: 10, a: 95 } }, days: { [day(0)]: 700, [day(1)]: 300, [day(2)]: 650, [day(20)]: 9999, bogus: 5, [day(3)]: 1e9 } });
  assert.deepEqual(sum.days.map(d => d.day), [day(3), day(2), day(1), day(0)], 'only the last week, real dates');
  assert.equal(sum.week, Math.round((700 + 300 + 650 + 86400) / 60), 'a day is at most 24 hours');
  assert.equal(TY.daysMet(sum, { mins: 10 }), 3);
  assert.equal(TY.daysMet(sum, { mins: 0, wpm: 20 }), null, 'no daily goal');
  const r = await post(teacher, `/api/class/${klass.id}/typing-goal`, { wpm: '', mins: '10' });
  assert.deepEqual(r.json.goal, { wpm: 0, acc: 90, mins: 10 }, 'a daily goal alone');
  putTyping(ada, { v: 1, done: { l01: { s: 3, w: 14, a: 96 } }, days: { [day(0)]: 900, [day(1)]: 120 } });
  const page = (await get(teacher, `/class/${klass.id}/progress`)).text;
  const panel = page.slice(page.indexOf('id="typing"'), page.indexOf('</details>', page.indexOf('id="typing"')));
  assert.match(panel, /daily goal 10 min/);
  assert.doesNotMatch(panel, /goal 0 wpm/, 'no speed goal shown');
  assert.match(panel, /Ada Typer[\s\S]*17 min this week[\s\S]*1 of 7 days/);
  assert.equal((await post(teacher, `/api/class/${klass.id}/typing-goal`, { wpm: '', mins: '' })).json.goal, null);
});

test('the game: every locked link opens from the map (a lesson, a test, tricky keys or a teacher\'s lesson)', () => {
  assert.match(html, /\nshowMap\(\);/);
  assert.doesNotMatch(html, /if \(locked\) showIntro\(LESSONS\.find/);
  assert.doesNotMatch(html, /window\.confirm/, 'the frame has no confirm box');
  for (const c of ['!', '?', '"', ':', '(', ')']) assert.ok(html.includes(`'${c}':`) || html.includes(`"${c}":`), `Shift for ${c}`);
});
