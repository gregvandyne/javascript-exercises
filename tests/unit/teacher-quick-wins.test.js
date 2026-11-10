// Teacher quick wins (docs/decisions.md "Teacher quick wins", 10 Nov 2026), one test per fix from the teacher audit:
// quiz scores for the teacher (lesson table, gradebook, CSV), rubric scores on the Standards tab, "Last active" from
// the student's own actions only, "Students will see it from…" for a lesson that opens later, a solo teacher's landing
// page, the school time zone from the browser at /trial, the username hint, roster names in the teacher-only live
// results, the Standards tab's framework, the game picker's groups, the course cards' words, the welcome's greeting,
// "Make your first class", the login cards' next step, the contrast and label fixes, and the password reset by email
// for staff and grown-ups (never for a kid or a student).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const fake = await startFakeStripe({ webhookSecret: 'whsec_fake_qw', apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_qw';
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const R = await import('../../server/services/rubrics.js');
const CC = await import('../../server/services/standards-ccss.js');
const E = await import('../../server/services/email.js');
const F = await import('../../server/services/family.js');
const games = await import('../../server/services/games.js');
const LR = await import('../../server/services/classlive-results.js');
const TEAM = await import('../../server/services/team.js');
const { rubricEvidence } = await import('../../server/services/rubric-standards.js');
const { frameworkFor } = await import('../../server/routes/standards.js');
const { siteGroups } = await import('../../server/routes/lessons.js');
const { homeFor } = await import('../../server/routes/auth.js');
const { landingFor, shellFor } = await import('../../server/views/layout.js');
const PR = await import('../../server/routes/password-reset.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const { tFor, CODES } = await import('../../server/i18n/index.js');
const { createApp } = await import('../../server/app.js');

const sent = [];
E._hooks({ fetch: (url, init) => { sent.push(JSON.parse(init.body)); return Promise.resolve({ status: 200, json: async () => ({ id: `re_qw_${sent.length}` }) }); }, wait: () => Promise.resolve() });
const EMAIL_ON = { resendApiKey: 're_test_key', emailEnabled: true, publicUrl: 'https://oomba.example' };

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); E._hooks({ fetch: null, wait: null }); });
test.beforeEach(() => { resetLimits(); sent.length = 0; Object.assign(config, { resendApiKey: '', emailEnabled: true }); });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const req = async (who, path, { method = 'GET', body, cookie = null } = {}) => {
  const headers = { ...(who ? { cookie: cookieFor(who.id) } : cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), origin: base };
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* a page */ }
  return { status: r.status, text, json, location: r.headers.get('location') || '', headers: r.headers };
};
const tick = () => new Promise(r => setTimeout(r, 20));
const DAY = 864e5;
const en = tFor('en');

// ---------------------------------------------------------------- people and places
const boss = auth.createUser({ username: 'QwBoss', password: 'boss-password-12', role: 'admin' });
const official = auth.createUser({ username: 'OombaAcademy', password: 'secret123456' });
const elm = S.createSchool(boss, { name: 'Quick Elm School' }).school;
const ana = S.createSchoolAccount(boss, elm.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(boss, elm.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
const cls = S.createClass(ana, elm.id, { name: 'Ana 3A' }).class;
const pupil = name => { const u = S.createSchoolAccount(ana, elm.id, { rosterName: name }).user; S.addToClass(ana, cls.id, u.id); return u; };
const mia = pupil('Mia Realname'), leo = pupil('Leo Realname'), kim = pupil('Kim Realname');
const kid = auth.createUser({ username: 'QwKid', password: 'rainbow-77' });
const seed = (slug, title, extra = '') => {
  const g = games.createGame(official.id, { title, slug, source: 'seed', category: 'learning' });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run(`UPDATE games SET status='published', visibility='public', published_version_id=? ${extra} WHERE id=?`, v.id, g.id);
  return games.getGame(g.id);
};
const sumRacer = seed('sum-racer', 'Sum Racer');
const fractions = seed('fraction-factory', 'Fraction Factory');
const atlas = seed('atlas-quest', 'Atlas Quest');
const rumble = seed('ring-rumble', 'Ring Rumble');
const questRace = seed('quest-race', 'Quest Race');

const lesson = L.createLesson(ana, elm.id, { title: 'Times tables', grade: 'Grade 3' }).lesson;
const ask = L.addStep(ana, lesson.id, { kind: 'question', title: 'Explain', body: 'How do you know 6 x 7?' }).step;
const quiz = L.addQuizStep(ana, lesson.id, { title: 'Exit ticket', items: [
  { q: '6 x 7?', choices: ['42', '36'], answer: 0 }, { q: '8 x 4?', choices: ['32', '24'], answer: 0 }, { q: '56 / 8?', choices: ['7', '6'], answer: 0 },
  { q: '9 x 9?', choices: ['81', '72'], answer: 0 }, { q: '7 x 7?', choices: ['49', '42'], answer: 0 }] }).step;
const cl = L.assign(ana, cls.id, lesson.id).classLesson;

// ---------------------------------------------------------------- b. quiz scores reach the teacher
test('b. a quiz score shows in the lesson table, the gradebook cell and the CSV (it was only a tick)', async () => {
  for (const [i, c] of [[0, 0], [1, 0], [2, 0], [3, 0], [4, 1]]) assert.ok(P.quizAnswer(mia, cl.id, quiz.id, i, c).ok);   // 4 of 5
  for (const [i, c] of [[0, 1], [1, 1]]) assert.ok(P.quizAnswer(leo, cl.id, quiz.id, i, c).ok);                              // not finished
  assert.deepEqual(P.quizResult(P.forStudent(cl.id, mia.id)[quiz.id]), { right: 4, total: 5, pct: 80 });
  assert.equal(P.quizResult(P.forStudent(cl.id, leo.id)[quiz.id]), null, 'a quiz still open has no score yet');
  const gb = P.classProgress(cls.id);
  const cell = id => gb.students.find(p => p.id === id).cells[0];
  assert.deepEqual([cell(mia.id).quiz, cell(mia.id).quizzes], [80, 1]);
  assert.equal(cell(leo.id).quiz, null); assert.equal(cell(kim.id).quiz, null);
  assert.equal(gb.students.find(p => p.id === mia.id).quiz, 80); assert.equal(gb.lessons[0].hasQuiz, true); assert.equal(gb.anyQuiz, true);
  // The lesson's table: "4/5 · 80%" beside the tick, with words for a screen reader.
  const page = await req(ana, `/class/${cls.id}/progress/${cl.id}`);
  assert.equal(page.status, 200);
  const row = new RegExp(`<tr id="s-${mia.id}"[\\s\\S]*?</tr>`).exec(page.text)[0];
  assert.match(row, /<span class="st-score st-quiz" title="4 of 5 right \(80%\)"><span dir="ltr" aria-hidden="true">4\/5 · 80%<\/span><span class="sr-only">4 of 5 right \(80%\)<\/span><\/span>/);
  assert.doesNotMatch(new RegExp(`<tr id="s-${leo.id}"[\\s\\S]*?</tr>`).exec(page.text)[0], /st-quiz/, 'no score until the quiz is finished');
  // The gradebook cell.
  const book = await req(ana, `/class/${cls.id}/progress`);
  assert.match(book.text, /<span class="gb-pts gb-quiz" title="Quiz score: 80% right">🧩 <span dir="ltr">80%<\/span>/);
  assert.equal((book.text.match(/class="gb-pts gb-quiz" title="Quiz score: /g) || []).length, 1, 'only for the student who finished it');
  // The CSV: a quiz column after the lesson, and the mean of all.
  const csv = (await req(ana, `/class/${cls.id}/progress.csv`)).text.replace(/^﻿/, '').split('\r\n');
  assert.equal(csv[0], 'Name,Oomba Academy name,Times tables,Times tables (quiz %),Work done,Quiz %,Score,Score (points),Late lessons,Times tables (score %)');
  const line = name => csv.find(l => l.startsWith(`${name},`)).split(',');
  assert.deepEqual(line('Mia Realname').slice(2), ['1/2', '80%', '50%', '80%', '80%', '4/5', '0', '80%']);
  assert.deepEqual(line('Leo Realname').slice(2), ['0/2', '', '0%', '', '–', '', '0', '']);
  // A student never gets the teacher's page.
  assert.equal((await req(mia, `/class/${cls.id}/progress/${cl.id}`)).status, 404);
});

// ---------------------------------------------------------------- g. Last active
test('g. "Last active" is the student\'s own last action: a teacher\'s review, marks or a row made for a teammate never move it', async () => {
  assert.ok(P.answer(kim, cl.id, ask.id, 'Because 6 x 7 is 42.').ok);
  const long = Date.now() - 3 * DAY;
  q.run('UPDATE step_progress SET updated_at=? WHERE class_lesson_id=? AND user_id=?', long, cl.id, kim.id);
  assert.ok(P.review(ana, cl.id, ask.id, kim.id, 'Nice thinking').ok);
  const row = q.get('SELECT * FROM step_progress WHERE class_lesson_id=? AND step_id=? AND user_id=?', cl.id, ask.id, kim.id);
  assert.equal(row.updated_at, long, 'the review left the student\'s time alone');
  assert.ok(row.reviewed_at > long && row.feedback === 'Nice thinking', 'the teacher\'s time is reviewed_at');
  assert.equal(P.lessonProgress(cl.id).students.find(p => p.id === kim.id).last, long);
  assert.equal(P.classProgress(cls.id).students.find(p => p.id === kim.id).cells[0].last, long);
  const page = await req(ana, `/class/${cls.id}/progress/${cl.id}`);
  assert.match(new RegExp(`<tr id="s-${kim.id}"[\\s\\S]*?</tr>`).exec(page.text)[0], /<td class="small muted">3 days ago<\/td>/);
  // The student's next action moves it again.
  assert.ok(P.answer(kim, cl.id, ask.id, 'Because 7 groups of 6 make 42.').ok);
  assert.ok(P.lessonProgress(cl.id).students.find(p => p.id === kim.id).last > long);
  // A row a teacher makes for a student who did nothing (marks for a teammate) is "never active".
  const l2 = L.createLesson(ana, elm.id, { title: 'Team build' }).lesson;
  const build = L.addStep(ana, l2.id, { kind: 'build', body: 'A quiz game', rubric: [{ line: 'Plan', ids: ['1B-AP-13'] }] }).step;
  const cl2 = L.assign(ana, cls.id, l2.id).classLesson;
  assert.ok(P.buildGame(mia, cl2.id, build.id, sumRacer.id).ok);
  assert.ok(P.review(ana, cl2.id, build.id, mia.id, 'Good', { marks: [2], alsoMark: [leo.id] }).ok);
  assert.equal(P.lessonProgress(cl2.id).students.find(p => p.id === leo.id).last, null);
  assert.match(new RegExp(`<tr id="s-${leo.id}"[\\s\\S]*?</tr>`).exec((await req(ana, `/class/${cls.id}/progress/${cl2.id}`)).text)[0], /<td class="small muted">–<\/td>/);
  L.unassign ? L.unassign(ana, cl2.id) : null;
});

// ---------------------------------------------------------------- h. assigned for later
test('h. a lesson that opens later says when students will see it, never "Students see it now"', async () => {
  const c2 = S.createClass(ana, elm.id, { name: 'Ana 3B' }).class, c3 = S.createClass(ana, elm.id, { name: 'Ana 3C' }).class;
  const day = new Date(Date.now() + 7 * DAY); const iso = day.toISOString().slice(0, 10);
  const later = await req(ana, `/api/lessons/${lesson.id}/assign`, { method: 'POST', body: { classId: c2.id, opensAt: iso, from: 'lesson' } });
  assert.equal(later.status, 200, later.text);
  const date = /Students will see it from (.+)\.$/.exec(later.json.toast);
  assert.ok(date && later.json.toast.startsWith('Assigned to Ana 3B. '), later.json.toast);
  const page = await req(ana, later.json.redirect.replace(/#.*$/, ''));
  const note = /<p class="notice good" id="assigned-now"[^>]*>[\s\S]*?<\/p>/.exec(page.text)[0];
  assert.match(note, /data-opens-later/); assert.ok(note.includes(`Students will see it from ${date[1]}.`), note);
  assert.doesNotMatch(note, /Students see it now|See who&#39;s started/);
  // Opens today (no date): the old words, with "See who's started".
  const now = await req(ana, `/api/lessons/${lesson.id}/assign`, { method: 'POST', body: { classId: c3.id, from: 'lesson' } });
  assert.equal(now.json.toast, 'Assigned to Ana 3C');
  const note2 = /<p class="notice good" id="assigned-now"[^>]*>[\s\S]*?<\/p>/.exec((await req(ana, now.json.redirect.replace(/#.*$/, ''))).text)[0];
  assert.match(note2, /Assigned to Ana 3C\. Students see it now\./); assert.match(note2, /See who&#39;s started/);
});

// ---------------------------------------------------------------- c. rubric scores on the Standards tab
test('c. rubric scores are evidence on the Standards tab (the rubric source is registered and reads what the gradebook counts)', async () => {
  const levels = [{ label: 'Not yet', points: 0 }, { label: 'Getting there', points: 1 }, { label: 'Secure', points: 2 }, { label: 'Beyond', points: 3 }];
  const rub = R.createRubric(ana, elm.id, { title: 'Explaining', levels, criteria: [{ name: 'Strategy' }, { name: 'Words' }] }).rubric;
  assert.ok(L.updateStep(ana, ask.id, { rubricId: rub.id }).ok);
  assert.ok(CC.addTag(ana, lesson.id, { framework: 'ccss-math', code: '3.OA.C.7', stepId: ask.id }).ok);
  assert.ok(CC.addTag(ana, lesson.id, { framework: 'ccss-math', code: '3.OA.A.1' }).ok);              // the whole lesson
  const before = CC.classView(cls.id, 'ccss-math').rows.find(r => r.id === '3.OA.C.7');
  assert.equal(before.rubricN, 0);
  assert.ok(P.answer(mia, cl.id, ask.id, 'I split 7 into 5 and 2.').ok); assert.ok(P.answer(leo, cl.id, ask.id, 'I guessed.').ok);
  assert.ok(R.saveScore(ana, cl.id, ask.id, mia.id, { picks: [3, 2] }).ok);    // 5 of 6: meets (>= 2/3)
  assert.ok(R.saveScore(ana, cl.id, ask.id, leo.id, { picks: [1, null] }).ok); // 1 of 3 (one criterion scored)
  const sid = new Set([mia.id, leo.id, kim.id]);
  const ev = rubricEvidence({ classId: cls.id, framework: 'ccss-math', studentIds: sid });
  assert.deepEqual(ev.map(x => [x.userId, x.code, x.score, x.max]).sort(), [[leo.id, '3.OA.C.7', 1, 3], [mia.id, '3.OA.C.7', 5, 6]].sort(), 'a step\'s score goes to the step\'s own codes');
  assert.deepEqual(rubricEvidence({ classId: cls.id, framework: 'ccss-ela', studentIds: sid }), []);
  const v = CC.classView(cls.id, 'ccss-math'), r = v.rows.find(x => x.id === '3.OA.C.7');
  assert.deepEqual(r.by.get(mia.id).rubric, { best: 5 / 6, n: 1 }); assert.equal(r.by.get(mia.id).level, 'meets');
  assert.deepEqual(r.by.get(leo.id).rubric, { best: 1 / 3, n: 1 }); assert.equal(r.by.get(leo.id).level, 'developing');
  assert.equal(r.by.get(kim.id).rubric, null);
  assert.equal(r.rubricN, 2); assert.equal(r.rubricMean, 0.58); assert.equal(r.status, 'checked');
  assert.equal(v.rows.find(x => x.id === '3.OA.A.1').rubricN, 0, 'the lesson\'s code is not credited by a step with codes of its own');
  // The page's Rubric column and the JSON carry it.
  const page = await req(ana, `/class/${cls.id}/standards?fw=ccss-math`);
  assert.equal(page.status, 200);
  const tr = /<tr class="">(?:(?!<\/tr>)[\s\S])*?3\.OA\.C\.7[\s\S]*?<\/tr>/.exec(page.text)[0];
  assert.match(tr, /data-label="Rubric">\s*58%/, tr);
  const api = await req(ana, `/api/classes/${cls.id}/standards?fw=ccss-math`);
  assert.equal(api.json.rows.find(x => x.code === '3.OA.C.7').rubric, 0.58);
  // A score that no longer counts (the step switched to another rubric) is no evidence, as in the gradebook.
  const other = R.createRubric(ana, elm.id, { title: 'Other', levels, criteria: [{ name: 'One' }] }).rubric;
  assert.ok(L.updateStep(ana, ask.id, { rubricId: other.id }).ok);
  assert.equal(CC.classView(cls.id, 'ccss-math').rows.find(x => x.id === '3.OA.C.7').rubricN, 0);
  assert.ok(L.updateStep(ana, ask.id, { rubricId: rub.id }).ok);
  // A whole-lesson score goes to the lesson's codes; a step without codes of its own falls back to them.
  assert.ok(L.updateLesson(ana, lesson.id, { rubricId: rub.id }).ok);
  assert.ok(R.saveScore(ana, cl.id, '', kim.id, { picks: [2, 2] }).ok);
  const ev2 = rubricEvidence({ classId: cls.id, framework: 'ccss-math', studentIds: sid });
  assert.deepEqual(ev2.filter(x => x.userId === kim.id).map(x => [x.code, x.score, x.max]), [['3.OA.A.1', 4, 6]]);
  assert.equal(CC.classView(cls.id, 'ccss-math').rows.find(x => x.id === '3.OA.A.1').by.get(kim.id).level, 'meets');
  // Another class's teacher still gets nothing.
  assert.equal((await req(ben, `/class/${cls.id}/standards?fw=ccss-math`)).status, 404);
});

// ---------------------------------------------------------------- m. the tab's framework
test('m. the Standards tab opens on the framework the class has work in; every chip names its framework', async () => {
  assert.equal(frameworkFor(cls.id), 'ccss-math', 'this class has only Common Core Math work');
  const bare = await req(ana, `/class/${cls.id}/standards`);
  assert.equal(bare.status, 302); assert.equal(bare.location, `/class/${cls.id}/standards?fw=ccss-math`);
  // Asked for by name, computer science still opens (and stays the page for a class with nothing yet).
  const csta = await req(ana, `/class/${cls.id}/standards?fw=csta`);
  assert.equal(csta.status, 200);
  for (const fw of ['csta', 'ccss-math', 'ccss-ela']) assert.ok(csta.text.includes(`href="/class/${cls.id}/standards?fw=${fw}"`), fw);
  assert.match(csta.text, new RegExp(`<a class="chip on" href="/class/${cls.id}/standards\\?fw=csta" aria-current="page">`));
  const empty = S.createClass(ana, elm.id, { name: 'Ana Empty' }).class;
  assert.equal(frameworkFor(empty.id), 'csta');
  assert.equal((await req(ana, `/class/${empty.id}/standards`)).status, 200);
  // A class with computer-science work stays on computer science.
  const csClass = S.createClass(ana, elm.id, { name: 'Ana CS' }).class;
  const csLesson = L.createLesson(ana, elm.id, { title: 'Loops' }).lesson;
  L.addStep(ana, csLesson.id, { kind: 'question', body: 'What repeats?', standards: '1B-AP-10' });
  L.assign(ana, csClass.id, csLesson.id);
  assert.equal(frameworkFor(csClass.id), 'csta');
  // Someone who may not see the class gets the 404, not a redirect.
  assert.equal((await req(ben, `/class/${cls.id}/standards`)).status, 404);
  assert.equal((await req(mia, `/class/${cls.id}/standards`)).status, 404);
});

// ---------------------------------------------------------------- n. the game picker
test('n. the lesson game picker lists Learn-shelf games under their subject first; "More games" is only the rest', async () => {
  const groups = siteGroups(en, [rumble, fractions, sumRacer, atlas, questRace].map(g => ({ id: g.id, title: g.title, icon: g.icon, slug: g.slug, source: 'seed' })));
  assert.deepEqual(groups.map(g => [g.label, g.games.map(x => x.title)]), [
    ['Math games', ['Fraction Factory', 'Sum Racer']], ['Maps', ['Atlas Quest']], ['Live class games (you host them)', ['Quest Race']], ['More games', ['Ring Rumble']]]);
  // A player's own public game is never mistaken for an official one with the same slug.
  assert.deepEqual(siteGroups(en, [{ id: 'x', title: 'Mine', slug: 'fraction-factory', source: 'builder' }]).map(g => g.label), ['More games']);
  const page = await req(ana, `/teach/lessons/${lesson.id}`);
  const select = /<select class="input" id="ns-g" name="gameId">[\s\S]*?<\/select>/.exec(page.text)[0];
  const math = /<optgroup label="Math games">([\s\S]*?)<\/optgroup>/.exec(select)[1];
  assert.ok(math.includes('Fraction Factory') && math.includes('Sum Racer'));
  assert.ok(select.indexOf('label="Math games"') < select.indexOf('label="More games"'));
  assert.doesNotMatch(/<optgroup label="More games">([\s\S]*?)<\/optgroup>/.exec(select)[1], /Fraction Factory/);
});

// ---------------------------------------------------------------- a. the "Make a new game" form
test('a. "Turn a lesson into a game" lands on a form that shows: the hide rule spares a targeted or open form, and the script opens and focuses it', async () => {
  const css = fs.readFileSync('public/css/schools.css', 'utf8');
  const rule = css.split('\n').find(l => l.includes('~ .newgame'));
  assert.match(rule, /~ \.newgame:not\(\[open\]\):not\(:target\):not\(:has\(:target\)\)\{display:none\}/, 'never hidden when it is the link\'s target, holds it, or is open');
  const js = fs.readFileSync('public/js/schools.js', 'utf8');
  assert.match(js, /d\.classList\.contains\('newgame'\)[\s\S]{0,160}focusSoon\(f\)/, 'the first field gets the cursor');
  assert.match(js, /const focusSoon = f => \{[\s\S]{0,200}f\.focus\(\{ preventScroll: true \}\)/, 'after the browser has gone to the fragment');
  assert.match(js, /addEventListener\('hashchange', openHash\)/, 'also for the link on the page itself');
  const page = await req(ana, `/teach/lessons/${lesson.id}`);
  assert.match(page.text, /<details class="newgame" id="new-game">/); assert.match(page.text, /<input class="input" id="ng-i" name="idea"/);
  assert.match(page.text, /<a class="small f-glink" href="#ng-i">/);
});

// ---------------------------------------------------------------- j. a solo teacher's first page
test('j. a teacher alone in the school they made lands on the Classroom home at every sign-in; the School tab keeps the checklist; an appointed head does not', async () => {
  const solo = auth.createUser({ username: 'SoloTeach', password: 'a-long-password-1', displayName: 'Ms Solo' });
  const school = S.createSchool(solo, { name: 'Solo Elementary' }).school;
  S.addMember(solo, school.id, solo.id, 'admin', { rosterName: 'Ms Solo' });
  const u = auth.getUser(solo.id);
  assert.equal(S.soloSchoolAdmin(u), true);
  assert.equal(S.schoolToSetUp(u), school.slug, 'the school is still to set up…');
  assert.equal(homeFor(u), '/teach', '…but sign-in goes to the Classroom home');
  assert.equal(landingFor(u), '/teach');
  const login = await req(null, '/api/auth/login', { method: 'POST', body: { username: 'SoloTeach', password: 'a-long-password-1' } });
  assert.equal(login.json.redirect, '/teach');
  assert.equal((await req(u, '/')).location, '/teach');
  // Classroom first, then School: the setup checklist is one tap away.
  const shell = shellFor(u, { headers: {} });
  assert.deepEqual(shell.tabs.slice(0, 2).map(x => x[1]), ['/teach', '/school']);
  const sp = await req(u, '/school'); assert.equal(sp.location, `/school/${school.slug}`);
  assert.equal((await req(u, sp.location)).status, 200);
  // With a class, still the Classroom home.
  S.createClass(u, school.id, { name: 'Solo 3A' });
  assert.equal(homeFor(auth.getUser(solo.id)), '/teach');
  // A second staff member: the school admin lands on the School again (a school to run, not a classroom of one).
  const two = S.createSchoolAccount(u, school.id, { rosterName: 'Mr Second', role: 'teacher' }).user;
  assert.equal(S.soloSchoolAdmin(auth.getUser(solo.id)), false);
  assert.equal(landingFor(auth.getUser(solo.id)), '/school');
  assert.deepEqual(shellFor(auth.getUser(solo.id), { headers: {} }).tabs.slice(0, 2).map(x => x[1]), ['/school', '/teach']);
  assert.equal(S.soloSchoolAdmin(two), false, 'a teacher who runs no school');
  assert.equal(S.soloSchoolAdmin(mia), false); assert.equal(S.soloSchoolAdmin(null), false);
  // An admin of a new, empty school with other staff still signs in to its setup page.
  const big = S.createSchool(boss, { name: 'Big Oak School' }).school;
  const head = S.createSchoolAccount(boss, big.id, { rosterName: 'Hana Head', role: 'admin' }).user;
  // Also while they are its only staff member: a head the platform admin appointed has a school to set up (the rule
  // is for a teacher who made their own school at /trial).
  assert.equal(S.soloSchoolAdmin(auth.getUser(head.id)), false, 'an appointed head, alone in the school');
  assert.equal(homeFor(auth.getUser(head.id)), `/school/${big.slug}`);
  assert.equal(landingFor(auth.getUser(head.id)), '/school');
  assert.deepEqual(shellFor(auth.getUser(head.id), { headers: {} }).tabs.slice(0, 2).map(x => x[1]), ['/school', '/teach']);
  S.createSchoolAccount(head, big.id, { rosterName: 'Tom Teacher', role: 'teacher' });
  assert.equal(homeFor(auth.getUser(head.id)), `/school/${big.slug}`);
});

// ---------------------------------------------------------------- d + k. /trial
let trialN = 0;
const trialName = () => `TrialTeach${++trialN}`;
const signup = (over = {}) => req(null, '/api/trial/signup', { method: 'POST', body: { name: 'Ms Rivera', school: 'Rivera Room', email: 'rivera@school.example', username: trialName(), password: 'a-long-password-1', adult: '1', ...over } });
test('k. the school\'s time zone comes from the browser at the trial sign-up, only when it is a zone the server knows', async () => {
  const page = await req(null, '/trial');
  assert.equal(page.status, 200);
  assert.match(page.text, /<input type="hidden" name="tz" data-browser-tz>/);
  assert.match(fs.readFileSync('public/js/app.js', 'utf8'), /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone;[^\n]*input\[data-browser-tz\]/);
  const zoneAfter = async over => { const name = trialName(); const r = await signup({ username: name, ...over }); assert.equal(r.status, 200, r.text);
    const u = auth.getUserByName(name); return S.zoneOf(S.getSchool(S.adminSchools(u)[0].id)); };
  assert.equal(await zoneAfter({ tz: 'America/Chicago' }), 'America/Chicago');
  resetLimits();
  for (const bad of [undefined, '', 'Mars/Olympus', 'America/Chicago\'; DROP TABLE schools', 42, { a: 1 }, 'x'.repeat(500)]) { resetLimits(); assert.equal(await zoneAfter({ tz: bad }), null, String(bad)); }
  // With the zone, a lesson due today is not late until midnight there (it was midnight UTC).
  assert.equal(S.isZone('America/Chicago'), true);
});
test('d. /trial on a phone: the big button wraps inside the screen, and the username rules are shown up front like the password\'s', async () => {
  const page = await req(null, '/trial');
  assert.match(page.text, /\.trial form \.btn-big\{width:100%;max-width:100%;white-space:normal;/);
  // Room between the wrapped button (and its drop shadow) and the small print under it.
  assert.match(page.text, /\.trial form \.btn-big\+\.small\{margin-top:16px\}/);
  assert.match(page.text, /<button class="btn btn-primary btn-big" type="submit">[^<]+<\/button>\s*<p class="small muted"/);
  // The small print says what the work email is used for (a password reset needs the kept address).
  assert.match(page.text, /We use your work email for your plan \(it goes to Stripe\), for emails about your trial and to reset a lost password\. <a href="\/privacy\?for=grownups">Privacy Policy<\/a>/);
  assert.doesNotMatch(page.text, /keep your work email/);
  assert.match(page.text, /<input class="input" id="su-username" name="username" required minlength="3" maxlength="16"[^>]*aria-describedby="su-username-hint">\s*<span class="hint" id="su-username-hint">3 to 16 letters or numbers, no spaces\. You sign in with it\.<\/span>/);
  assert.match(page.text, /<span class="hint" id="su-password-hint">At least 12 characters\.<\/span>/);
  // The hint tells the truth: what it allows is accepted, what it rules out is refused with the field's own message.
  assert.equal((await signup({ username: 'ab' })).json.field, 'username');
  resetLimits(); assert.equal((await signup({ username: 'has space' })).json.field, 'username');
  resetLimits(); assert.equal((await signup({ username: 'a'.repeat(17) })).json.field, 'username');
  resetLimits(); assert.equal((await signup({ username: 'Riv3ra_Room' })).status, 200);
});

// ---------------------------------------------------------------- l. roster names in the teacher-only live results
test('l. the live results CSV carries roster names beside the names shown in the game, only when the route gives them', () => {
  const players = [{ rank: 1, name: 'BraveOtter', roster: 'Mia Realname', team: '', score: 900, bonus: 0, correct: 3, answered: 3, marks: '111' },
    { rank: 2, name: 'SunnyFox', roster: '', team: '', score: 300, bonus: 0, correct: 1, answered: 3, marks: '100' }];
  const withNames = LR.csv({ players, items: [] }).split('\r\n');
  assert.equal(withNames[0], 'rank,student,roster_name,team,score,bonus,correct,answered,q1,q2,q3');
  assert.equal(withNames[1], '1,BraveOtter,Mia Realname,,900,0,3,3,1,1,1'); assert.equal(withNames[2], '2,SunnyFox,,,300,0,1,3,1,0,0');
  // Nobody with a roster name (a host who does not manage the class, an open room): the CSV is as it always was.
  assert.equal(LR.csv({ players: players.map(({ roster, ...p }) => p), items: [] }).split('\r\n')[0], 'rank,student,team,score,bonus,correct,answered,q1,q2,q3');
  // A formula-like name is still quoted.
  assert.match(LR.csv({ players: [{ ...players[0], roster: '=SUM(A1)' }], items: [] }), /"'=SUM\(A1\)"/);
});
test('l. a saved class run: the class\'s teacher sees roster names in Student details and the CSV; the host who does not teach the class, and students, never do', async () => {
  const run = 'qwrun000001';
  q.run(`INSERT INTO live_runs(id, host_id, class_id, title, mode, audience, started_at, ended_at, players, guests, items, scored_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    run, ben.id, cls.id, 'Friday quiz', 'quiz', 'class', Date.now() - 6e5, Date.now() - 3e5, 2, 0, '[]', 'server');
  q.run('INSERT INTO live_run_scores(run_id, user_id, score, rank, correct, answered, team, bonus, marks) VALUES (?,?,?,?,?,?,?,?,?)', run, mia.id, 900, 1, 3, 3, 0, 0, '111');
  q.run('INSERT INTO live_run_scores(run_id, user_id, score, rank, correct, answered, team, bonus, marks) VALUES (?,?,?,?,?,?,?,?,?)', run, leo.id, 300, 2, 1, 3, 0, 0, '100');
  const shown = auth.getUser(mia.id).display_name;
  assert.notEqual(shown, 'Mia Realname', 'a school account plays under its generated name');
  // The class's teacher.
  const page = await req(ana, `/live/results/${run}`);
  assert.equal(page.status, 200);
  const details = /<details class="lv-group lv-details" id="lv-details">[\s\S]*?<\/details>/.exec(page.text)[0];
  assert.ok(details.includes(`${shown} <span class="lv-roster small muted" dir="auto">(Mia Realname)</span>`), 'in the closed, teacher-only details');
  assert.ok(!page.text.replace(details, '').includes('Mia Realname'), 'nowhere in the part shown to the class');
  assert.doesNotMatch(details, /<details[^>]*\sopen/, 'the details start closed');
  const csv = (await req(ana, `/live/results/${run}.csv`)).text.split('\r\n');
  assert.equal(csv[0], 'rank,student,roster_name,team,score,bonus,correct,answered,q1,q2,q3');
  assert.equal(csv[1], `1,${shown},Mia Realname,,900,0,3,3,1,1,1`);
  // The host of the run who is not a teacher of this class: the results, without real names.
  const host = await req(ben, `/live/results/${run}`);
  assert.equal(host.status, 200); assert.ok(host.text.includes(shown)); assert.ok(!host.text.includes('Mia Realname'));
  const hostCsv = (await req(ben, `/live/results/${run}.csv`)).text;
  assert.equal(hostCsv.split('\r\n')[0], 'rank,student,team,score,bonus,correct,answered,q1,q2,q3'); assert.ok(!hostCsv.includes('Realname'));
  // Students and other kids get nothing at all.
  for (const who of [mia, kid]) { assert.equal((await req(who, `/live/results/${run}`)).status, 404); assert.equal((await req(who, `/live/results/${run}.csv`)).status, 404); }
});

// ---------------------------------------------------------------- q, r, s, o
test('q. course cards say "See the N games" over a list of games; Cyber Defenders shows one grade range', async () => {
  for (const code of CODES) { const t = tFor(code); assert.ok(t.own('courses.gamesN') || code.startsWith('en'), code); assert.notEqual(t('courses.gamesN', { count: 4 }), t('courses.unitsN', { count: 4 }), code); }
  assert.equal(en('courses.gamesN', { count: 1 }), 'See the 1 game'); assert.equal(en('courses.gamesN', { count: 5 }), 'See the 5 games');
  assert.match(fs.readFileSync('server/views/courses.js', 'utf8'), /<summary>\$\{t\('courses\.gamesN', \{ count: games\.length \}\)\}<\/summary>/);
  assert.match(en('courses.cd.sub'), /grades 3–8$/);
  assert.match(fs.readFileSync('server/routes/teachers.js', 'utf8'), /'cyber-defenders': \{ subject: 'code', from: 3, to: 8 \}/, 'the card\'s grades line says 3–8 too');
});
test('s. the welcome greets "Ms Rivera", never "Hi Ms!"; a name that is only a title is greeted as "there"', () => {
  assert.equal(TEAM.greetName('Ms Rivera'), 'Ms Rivera'); assert.equal(TEAM.greetName('Mr. Chen Wei'), 'Mr. Chen');
  assert.equal(TEAM.greetName('Ms'), 'there'); assert.equal(TEAM.greetName('Dr.'), 'there'); assert.equal(TEAM.greetName('  '), 'there'); assert.equal(TEAM.greetName(null), 'there');
  assert.equal(TEAM.greetName('Ana Teacher'), 'Ana'); assert.equal(TEAM.greetName('RocketPanda7'), 'RocketPanda7'); assert.equal(TEAM.greetName('Missy Elm'), 'Missy');
  // The teachers' welcome itself.
  const t1 = auth.createUser({ username: 'WelcomeMs', password: 'a-long-password-1', displayName: 'Ms' });
  S.addMember(boss, elm.id, t1.id, 'teacher', { rosterName: 'Ms' });
  TEAM.sendWelcome(auth.getUser(t1.id), 'teacher');
  const body = (q.get("SELECT body FROM chat_messages WHERE to_id=? AND kind='team' ORDER BY created_at DESC", t1.id) || {}).body;
  assert.ok(body, 'the welcome was sent'); assert.match(body, /^Hi there! 👋/); assert.doesNotMatch(body, /Hi Ms!/);
});
test('r. "Make your first class" opens the New class form with the cursor in it; the login cards point to the next step', async () => {
  const solo = S.createSchoolAccount(boss, elm.id, { rosterName: 'Nell Noclass', role: 'admin' }).user;
  const plain = await req(solo, '/teach');
  assert.match(plain.text, /href="\/teach\?new=class">🍎 Make your first class<\/a>/);
  assert.match(plain.text, /<details class="libdrop" id="new-class" data-hash-open >/, 'folded until asked for (a school admin\'s page)');
  const open = await req(solo, '/teach?new=class');
  assert.match(open.text, /<details class="libdrop" id="new-class" data-hash-open open>/);
  assert.match(open.text, /<input class="input" id="nc-n" name="name" maxlength="60" required placeholder="[^"]*" autofocus>/);
  assert.match(fs.readFileSync('public/js/app.js', 'utf8'), /details\[data-hash-open\]/, 'and a #new-class link opens it without a reload');
  // New accounts for a class with nothing assigned: "Next: assign a first game" under the cards (not on the print-out).
  const c = S.createClass(ana, elm.id, { name: 'Ana New' }).class;
  const made = await req(ana, `/api/classes/${c.id}/students`, { method: 'POST', body: { names: 'Zed Newkid' } });
  assert.equal(made.status, 200, made.text);
  const cards = await req(ana, made.json.redirect);
  assert.match(cards.text, /<p class="notice good noprint" id="cards-next"><a href="\/learn"><b>Next: assign a first game<\/b>/);
  // Once something is assigned the hint is gone.
  L.assign(ana, c.id, lesson.id);
  const again = await req(ana, `/api/classes/${c.id}/students`, { method: 'POST', body: { names: 'Yan Newkid' } });
  assert.doesNotMatch((await req(ana, again.json.redirect)).text, /id="cards-next"/);
});
test('o. contrast and labels: dark ink on the yellow "Just Play", a name for the phone header\'s trial link, no faded rows in the Standards table', async () => {
  const lp = fs.readFileSync('public/css/landing.css', 'utf8');
  const at = lp.indexOf('.lp-foot .lp-btn{color:var(--text)}'), fix = lp.indexOf('.lp-foot .lp-btn-spark,.lp-foot .lp-btn-spark:hover{color:#141414');
  assert.ok(at > 0 && fix > at, 'the footer band\'s own rule for the yellow button comes after the one it corrects');
  // #141414 on the button's yellow (--spark) is far above 4.5:1; the cream it had was about 1.3:1.
  const lum = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const spark = /--spark:(#[0-9A-Fa-f]{6})/.exec(lp)[1];
  assert.ok(ratio('#141414', spark) >= 4.5, `ink on ${spark}`); assert.ok(ratio('#FFFDF2', spark) < 4.5, 'the old cream text failed');
  // The Standards table: rows are never faded; their ink meets 4.5:1 on the card in both themes.
  const cs = fs.readFileSync('public/css/cs-quest.css', 'utf8');
  assert.doesNotMatch(cs, /\.csq-std-quiet[^{]*\{[^}]*opacity/);
  assert.match(cs, /\.csq-std-quiet td,\.csq-std-quiet th\{color:var\(--text-2\)\}/);
  const app = fs.readFileSync('public/css/app.css', 'utf8');
  const themes = [...app.matchAll(/--bg:#[0-9A-Fa-f]{6}; --card:(#[0-9A-Fa-f]{6});[^\n]*\n\s*--text:#[0-9A-Fa-f]{6}; --text-2:(#[0-9A-Fa-f]{6}); --muted:(#[0-9A-Fa-f]{6});/g)];
  assert.ok(themes.length >= 2, 'light and dark');
  for (const [, card, text2, muted] of themes) { assert.ok(ratio(text2, card) >= 4.5, `${text2} on ${card}`); assert.ok(ratio(muted, card) >= 4.5, `${muted} on ${card}`); }
  // The landing's header link has a name when only its short, aria-hidden words show.
  const prev = process.env.LANDING_AT_ROOT; process.env.LANDING_AT_ROOT = '1';
  try {
    const home = await req(null, '/');
    assert.match(home.text, /<a class="lp-btn lp-btn-primary lp-btn-sm" href="\/trial" data-cta="trial" aria-label="Start free trial"><span class="lp-long">Start free trial<\/span><span class="lp-short" aria-hidden="true">/);
    assert.doesNotMatch(home.text.replace(/<script[\s\S]*?<\/script>/g, ''), /\$\d/, 'and still no price on "/"');
  } finally { process.env.LANDING_AT_ROOT = prev; }
});

// ---------------------------------------------------------------- i. the password reset
const linkOf = m => /https:\/\/oomba\.example\/reset\?t=([A-Za-z0-9._%-]+)/.exec(m.text);
test('i. a teacher with an email on file resets a lost password by a signed, single-use, 30-minute link; sessions end; it is audited', async () => {
  Object.assign(config, EMAIL_ON);
  const t1 = auth.createUser({ username: 'LostTeach', password: 'the-old-password-1', displayName: 'Ms Lost' });
  const school = S.createSchool(t1, { name: 'Lost Room' }).school; S.addMember(t1, school.id, t1.id, 'admin', { rosterName: 'Ms Lost' });
  assert.equal(E.rememberAddress(t1.id, 'lost@school.example', 'checkout'), true);
  const old = cookieFor(t1.id);
  assert.equal((await req(null, '/teach', { cookie: old })).status, 200, 'signed in before');
  // The sign-in page offers it; the form asks only for the username.
  const login = await req(null, '/login');
  assert.match(login.text, /<p id="forgot-staff">[\s\S]*?<a href="\/forgot">Reset your password by email<\/a>/);
  const form = await req(null, '/forgot');
  assert.equal(form.status, 200); assert.match(form.text, /<form data-api="\/api\/auth\/forgot" novalidate>/);
  assert.equal(form.headers.get('cache-control'), 'no-store'); assert.equal(form.headers.get('referrer-policy'), 'no-referrer'); assert.match(form.text, /<meta name="robots" content="noindex/);
  const asked = await req(null, '/api/auth/forgot', { method: 'POST', body: { username: 'lostteach' } });
  assert.deepEqual(asked.json, { ok: true, redirect: '/forgot?sent=1' });
  await tick();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['lost@school.example']); assert.equal(sent[0].subject, 'Reset your Oomba Academy password');
  assert.ok(sent[0].tags.some(x => x.name === 'category' && x.value === 'transactional'));
  assert.equal(sent[0].headers, undefined, 'no List-Unsubscribe on a password email: it is not a mailing');
  const m = linkOf(sent[0]); assert.ok(m, sent[0].text);
  assert.ok(sent[0].html.includes(`https://oomba.example/reset?t=${m[1]}`) || sent[0].html.includes('/reset?t='), 'the button carries the link');
  assert.match(sent[0].text, /works once, for 30 minutes/); assert.ok(sent[0].text.includes('LostTeach'));
  const log = q.get("SELECT * FROM email_log WHERE user_id=? AND template='password_reset'", t1.id);
  assert.equal(log.status, 'sent'); assert.equal(log.category, 'transactional'); assert.ok(!JSON.stringify(log).includes(decodeURIComponent(m[1])), 'the log never holds the link');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='user.password_reset_request' AND target=?", t1.id));
  const token = decodeURIComponent(m[1]);
  // Opening the link changes nothing (mail scanners open links): the old password still works.
  const page = await req(null, `/reset?t=${encodeURIComponent(token)}`);
  assert.equal(page.status, 200); assert.match(page.text, /<h1 class="center">Choose a new password<\/h1>/); assert.match(page.text, /For the account <b dir="ltr">LostTeach<\/b>/);
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer'); assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(auth.verifyPassword(auth.getUser(t1.id), 'the-old-password-1'), true);
  // A weak or short password is refused and the link stays good.
  assert.equal((await req(null, '/api/auth/reset', { method: 'POST', body: { token, password: 'short' } })).json.field, 'password');
  assert.equal((await req(null, '/api/auth/reset', { method: 'POST', body: { token, password: 'lostteach-12345' } })).json.field, 'password', 'not their own username');
  // Locked out by wrong guesses too: the reset clears the lock.
  for (let i = 0; i < 10; i++) await req(null, '/api/auth/login', { method: 'POST', body: { username: 'LostTeach', password: 'wrong-guess-123' } });
  assert.equal((await req(null, '/api/auth/login', { method: 'POST', body: { username: 'LostTeach', password: 'the-old-password-1' } })).status, 429);
  const done = await req(null, '/api/auth/reset', { method: 'POST', body: { token, password: 'a-brand-new-password-9' } });
  assert.deepEqual(done.json, { ok: true, redirect: '/login?reset=1' });
  assert.equal(auth.verifyPassword(auth.getUser(t1.id), 'a-brand-new-password-9'), true); assert.equal(auth.verifyPassword(auth.getUser(t1.id), 'the-old-password-1'), false);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='user.password_reset' AND target=?", t1.id));
  // The account's owner is told, at the same address: no link, the contact address, and not a mailing.
  await tick();
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1].to, ['lost@school.example']); assert.equal(sent[1].subject, 'Your Oomba Academy password was changed');
  assert.match(sent[1].text, /^The password of the Oomba Academy account LostTeach was just changed with a reset link sent to this address\.\n\nIf that was not you, write to \S+@\S+ right away\.\n\nOomba Academy\n$/);
  assert.doesNotMatch(sent[1].text + sent[1].html, /https?:\/\/|reset\?t=|a-brand-new-password-9/, 'no link and never the password');
  assert.equal(sent[1].headers, undefined); assert.ok(sent[1].tags.some(x => x.name === 'category' && x.value === 'transactional'));
  const doneLog = q.get("SELECT * FROM email_log WHERE user_id=? AND template='password_changed'", t1.id);
  assert.equal(doneLog.status, 'sent'); assert.equal(doneLog.category, 'transactional');
  // Every session of the account ended.
  assert.notEqual((await req(null, '/teach', { cookie: old })).status, 200);
  assert.match((await req(null, '/login?reset=1')).text, /<p class="notice good" role="status" id="reset-done">Your password is changed\./);
  const inNow = await req(null, '/api/auth/login', { method: 'POST', body: { username: 'LostTeach', password: 'a-brand-new-password-9' } });
  assert.equal(inNow.status, 200, 'the sign-in lock is cleared and the new password works');
  // Single use: the same link is dead now, as a page and as a request.
  const again = await req(null, '/api/auth/reset', { method: 'POST', body: { token, password: 'another-password-123' } });
  assert.equal(again.status, 400); assert.equal(again.json.code, 'badLink');
  const dead = await req(null, `/reset?t=${encodeURIComponent(token)}`);
  assert.equal(dead.status, 400); assert.match(dead.text, /id="reset-bad"/); assert.match(dead.text, /href="\/forgot">Send a new link<\/a>/);
  assert.equal(auth.verifyPassword(auth.getUser(t1.id), 'a-brand-new-password-9'), true);
});
test('i. the link: 30 minutes, signed, bound to the account and the password it was made for', async () => {
  Object.assign(config, EMAIL_ON);
  const t2 = auth.createUser({ username: 'TokenTeach', password: 'the-old-password-1' });
  S.addMember(boss, elm.id, t2.id, 'teacher', { rosterName: 'Tok Teach' });
  E.rememberAddress(t2.id, 'tok@school.example');
  const u = () => auth.getUser(t2.id);
  const tok = PR.resetToken(u());
  assert.equal(PR.readResetToken(tok).id, t2.id);
  assert.equal(PR.RESET_MINUTES, 30);
  const payload = JSON.parse(Buffer.from(tok.split('.')[0], 'base64url').toString());
  assert.ok(Math.abs(payload.exp - Date.now() - 30 * 60e3) < 5000, 'expires in 30 minutes'); assert.equal(payload.password_hash, undefined);
  assert.ok(!tok.includes(u().password_hash) && !Buffer.from(tok.split('.')[0], 'base64url').toString().includes(u().password_hash.slice(7, 30)), 'no hash in the token');
  // Tampered, cut short, another kind of signed token, an expired one: all refused.
  assert.equal(PR.readResetToken(`${tok.slice(0, -2)}xx`), null); assert.equal(PR.readResetToken(tok.split('.')[0]), null);
  assert.equal(PR.readResetToken(auth.signToken({ u: t2.id })), null, 'a frame token is not a reset link');
  assert.equal(PR.readResetToken(auth.signToken({ k: 'pwreset', u: t2.id, f: 'guess' })), null, 'the fingerprint cannot be guessed');
  const expired = auth.signToken({ ...payload, exp: undefined }, -1);
  assert.equal(PR.readResetToken(expired), null, 'expired');
  for (const junk of [null, undefined, '', 42, {}, 'x'.repeat(5000)]) assert.equal(PR.readResetToken(junk), null);
  // Changing the password any other way (Me, a school admin's reset) retires the link.
  auth.setPassword(t2.id, 'changed-elsewhere-12');
  assert.equal(PR.readResetToken(tok), null);
  // No longer staff: the link stops working.
  const tok2 = PR.resetToken(u()); assert.ok(PR.readResetToken(tok2));
  q.run("UPDATE school_members SET status='removed' WHERE user_id=?", t2.id);
  assert.equal(PR.readResetToken(tok2), null);
});
test('i. never for a kid or a student, and the answer is the same whether or not the account exists or has an address', async () => {
  Object.assign(config, EMAIL_ON);
  const noMail = auth.createUser({ username: 'NoMailTeach', password: 'the-old-password-1' });
  S.addMember(boss, elm.id, noMail.id, 'teacher', { rosterName: 'No Mail' });
  const parent = auth.createUser({ username: 'ResetParent', password: 'the-old-password-1', accountType: 'grownup' }); F.ensureFamily(parent);
  E.rememberAddress(parent.id, 'parent@home.example');
  // A kid's row in email_prefs (it cannot be made through the app: rememberAddress refuses) still sends nothing.
  assert.equal(E.rememberAddress(kid.id, 'kid@home.example'), false); assert.equal(E.rememberAddress(mia.id, 'mia@home.example'), false);
  q.run('INSERT INTO email_prefs(user_id, email, email_source, updated_at) VALUES (?,?,?,?)', kid.id, 'kid@home.example', 'checkout', Date.now());
  q.run('INSERT INTO email_prefs(user_id, email, email_source, updated_at) VALUES (?,?,?,?)', mia.id, 'mia@home.example', 'checkout', Date.now());
  for (const u of [kid, mia, auth.createGuest(), boss, null]) assert.equal(PR.mayReset(u && auth.getUser(u.id)), false);
  assert.equal(PR.mayReset(auth.getUser(parent.id)), true); assert.equal(PR.mayReset(auth.getUser(ana.id)), true);
  const banned = auth.createUser({ username: 'BannedTeach', password: 'the-old-password-1' }); S.addMember(boss, elm.id, banned.id, 'teacher', { rosterName: 'B' });
  q.run('UPDATE users SET banned=1 WHERE id=?', banned.id); assert.equal(PR.mayReset(auth.getUser(banned.id)), false);
  const answers = [];
  for (const name of ['QwKid', mia.username, 'NoMailTeach', 'NobodyAtAll', 'QwBoss', 'BannedTeach']) {
    resetLimits();
    const r = await req(null, '/api/auth/forgot', { method: 'POST', body: { username: name } });
    answers.push(`${r.status} ${r.text}`);
  }
  await tick();
  assert.equal(sent.length, 0, 'nothing is sent for a kid, a student, an account with no address, an unknown name, the platform admin or a banned account');
  resetLimits();
  const real = await req(null, '/api/auth/forgot', { method: 'POST', body: { username: 'ResetParent' } });
  await tick();
  assert.equal(sent.length, 1, 'a grown-up account with an address gets its link'); assert.deepEqual(sent[0].to, ['parent@home.example']);
  assert.equal(new Set([...answers, `${real.status} ${real.text}`]).size, 1, 'one answer for every username');
  // A reset link made for a kid (it cannot be: mayReset) would be refused anyway.
  assert.equal(PR.readResetToken(auth.signToken({ k: 'pwreset', u: kid.id, f: 'x' })), null);
  // The kids' sign-in help is unchanged: ask your teacher, or a grown-up.
  const login = await req(null, '/login');
  const esc = x => x.replace(/&/g, '&amp;').replace(/'/g, '&#39;');
  assert.ok(login.text.includes(esc(en('auth.page.forgotSchool'))) && login.text.includes(esc(en('auth.page.forgotOwn'))));
  assert.match((await req(null, '/forgot')).text, /Ask your teacher or a grown-up\. Kids&#39; accounts have no email\./);
  // The grown-ups' sign-in page offers it too.
  assert.match((await req(null, '/grown-ups/login')).text, /id="forgot-grownup">[\s\S]*?href="\/forgot"/);
});
test('i. the whole path: a teacher who signs up at /trial and finishes the checkout can reset a lost password at the email they typed; one who never finished it has no address', async () => {
  Object.assign(config, EMAIL_ON);
  const B = await import('../../server/services/billing.js');
  fake.webhookUrl = base + B.WEBHOOK_PATH;
  const r = await signup({ username: 'PathTeach', email: 'path.teach@school.example' });
  assert.equal(r.status, 200, r.text);
  // Stripe is in test mode here, where only a billing tester may check out: the sign-up lands on /trial and its
  // "Start my free trial" button starts the same Checkout the sign-up starts by itself in live mode.
  assert.equal(r.json.redirect, '/trial');
  let u = auth.getUserByName('PathTeach');
  q.run('UPDATE users SET billing_tester=1 WHERE id=?', u.id); u = auth.getUser(u.id);
  const start = await req(u, '/api/trial/start', { method: 'POST', body: { email: 'path.teach@school.example', trial: '1' } });
  assert.equal(start.status, 200, start.text);
  assert.ok(start.json.redirect.startsWith(`${fake.url}/pay/cs_test_`), start.json.redirect);
  assert.equal(E.addressOf(u.id), null, 'nothing is kept before the trial starts');
  const paid = await fetch(start.json.redirect, { redirect: 'manual' });   // the (fake) Checkout: the trial starts, the webhook arrives
  assert.equal(paid.status, 302, await paid.text());
  assert.deepEqual(E.addressOf(u.id), { email: 'path.teach@school.example', source: 'checkout' });
  await tick(); sent.length = 0;
  assert.deepEqual((await req(null, '/api/auth/forgot', { method: 'POST', body: { username: 'PathTeach' } })).json, { ok: true, redirect: '/forgot?sent=1' });
  await tick();
  const mail = sent.filter(m => m.subject === 'Reset your Oomba Academy password');
  assert.equal(mail.length, 1); assert.deepEqual(mail[0].to, ['path.teach@school.example']);
  const token = decodeURIComponent(linkOf(mail[0])[1]);
  assert.deepEqual((await req(null, '/api/auth/reset', { method: 'POST', body: { token, password: 'a-brand-new-password-7' } })).json, { ok: true, redirect: '/login?reset=1' });
  assert.equal(auth.verifyPassword(auth.getUser(u.id), 'a-brand-new-password-7'), true);
  // A sign-up whose checkout was never finished: no address on file, so the same answer and no email (the page's
  // "Nothing in your inbox?" line gives the contact address).
  resetLimits();
  const r2 = await signup({ username: 'HalfTeach', email: 'half.teach@school.example' });
  assert.equal(r2.status, 200, r2.text);
  const half = auth.getUserByName('HalfTeach');
  assert.equal(E.addressOf(half.id), null);
  await tick(); sent.length = 0;
  assert.deepEqual((await req(null, '/api/auth/forgot', { method: 'POST', body: { username: 'HalfTeach' } })).json, { ok: true, redirect: '/forgot?sent=1' });
  await tick();
  assert.equal(sent.length, 0);
  assert.match((await req(null, '/forgot?sent=1')).text, /Nothing in your inbox\? The account may have no email address on file\. Write to <a href="mailto:/);
});
test('i. limits: 30 requests an hour from one address (a school shares one), 3 emails an hour to one account (silently), and an empty username is asked for', async () => {
  Object.assign(config, EMAIL_ON);
  const t3 = auth.createUser({ username: 'LimitTeach', password: 'the-old-password-1' });
  S.addMember(boss, elm.id, t3.id, 'teacher', { rosterName: 'Lim Teach' }); E.rememberAddress(t3.id, 'lim@school.example');
  assert.equal((await req(null, '/api/auth/forgot', { method: 'POST', body: { username: '  ' } })).json.field, 'username');
  resetLimits();
  const codes = [];
  for (let i = 0; i < 31; i++) codes.push((await req(null, '/api/auth/forgot', { method: 'POST', body: { username: 'LimitTeach' } })).status);
  assert.deepEqual(codes, [...Array(30).fill(200), 429], 'the thirty-first from one address waits');
  await tick();
  assert.equal(sent.length, 3, 'three emails to the account, then the same answer with nothing sent');
  assert.deepEqual(PR.FORGOT_LIMITS.perIpHour, 30); assert.deepEqual(PR.FORGOT_LIMITS.perUserHour, 3);
});
test('i. while email sending is off: no form and no promise, the contact address instead (and the sign-in pages do not offer the link)', async () => {
  config.resendApiKey = '';
  const t4 = auth.createUser({ username: 'OffTeach', password: 'the-old-password-1' });
  S.addMember(boss, elm.id, t4.id, 'teacher', { rosterName: 'Off Teach' }); E.rememberAddress(t4.id, 'off@school.example');
  const page = await req(null, '/forgot');
  assert.equal(page.status, 200); assert.doesNotMatch(page.text, /data-api="\/api\/auth\/forgot"/);
  assert.match(page.text, /We can't email reset links right now\. Write to <a href="mailto:[^"]+" dir="ltr">[^<]+<\/a> and we will help\./);
  assert.equal((await req(null, '/api/auth/forgot', { method: 'POST', body: { username: 'OffTeach' } })).status, 404);
  await tick(); assert.equal(sent.length, 0);
  const login = await req(null, '/login');
  assert.doesNotMatch(login.text, /id="forgot-staff"/); assert.ok(login.text.includes(en('auth.page.forgotSchool').replace(/'/g, '&#39;')), 'the existing contact route stays');
  assert.doesNotMatch((await req(null, '/grown-ups/login')).text, /id="forgot-grownup"/);
  // Signed in, /forgot is the account's own password page.
  assert.equal((await req(ana, '/forgot')).location, '/me#password');
});
test('i. the words of the reset are in all 13 languages, with their placeholders', () => {
  const keys = Object.keys(JSON.parse(fs.readFileSync('scripts/quick-wins-strings/words.json', 'utf8')).en);
  assert.ok(keys.filter(k => k.startsWith('auth.reset.')).length >= 20);
  for (const code of CODES) {
    const t = tFor(code);
    for (const k of keys) {
      assert.ok(t.own(k) || code.startsWith('en'), `${code} ${k}`);
      const raw = k2 => JSON.stringify(k2.split('.').reduce((o, p) => (o == null ? o : o[p]), JSON.parse(fs.readFileSync(`server/i18n/locales/${code === 'en-GB' ? 'en' : code}.json`, 'utf8'))));
      assert.deepEqual((raw(k).match(/\{[a-z]+\}/g) || []).sort(), (JSON.stringify(k.split('.').reduce((o, p) => o[p], JSON.parse(fs.readFileSync('server/i18n/locales/en.json', 'utf8')))).match(/\{[a-z]+\}/g) || []).sort(), `${code} ${k}`);
    }
  }
});
