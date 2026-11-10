// The teaching loop, Plan → Play → Check → Feedback (docs/decisions.md "The teaching loop"): the Classroom home's card
// that ticks each step off from real data, Hide / Show again, /teach/loop, who may see and change any of it (staff only,
// each teacher only their own), the section on the teacher landing at "/" and on /teachers, the four screenshots and the
// words in every language.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.LANDING_AT_ROOT = '1';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const SC = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const F = await import('../../server/services/family.js');
const TL = await import('../../server/services/teach-loop.js');
const V = await import('../../server/views/teacher-loop.js');
const { setting } = await import('../../server/db.js');
const { CODES } = await import('../../server/i18n/index.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => resetLimits());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (p, u) => { const r = await fetch(base + p, { headers: { ...H, ...(u ? { cookie: cookieFor(u.id) } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const post = async (p, u, body = {}) => {
  const r = await fetch(base + p, { method: 'POST', redirect: 'manual', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...(u ? { cookie: cookieFor(u.id) } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const PRICE = /[$€£]\s?\d|\d\s?(?:€|USD|EUR|GBP)\b/;
const card = s => { const i = s.indexOf('id="teach-loop"'); return i < 0 ? '' : s.slice(i, s.indexOf('</section>', i)); };

const boss = auth.createUser({ username: 'LoopBoss', password: 'boss-password-1', role: 'admin' });
const school = SC.createSchool(boss, { name: 'Loop School' }).school;
const head = SC.createSchoolAccount(boss, school.id, { rosterName: 'Mrs Loophead', role: 'admin' }).user;
const teacher = SC.createSchoolAccount(head, school.id, { rosterName: 'Ms Lia Loop', role: 'teacher' }).user;
const other = SC.createSchoolAccount(head, school.id, { rosterName: 'Mr Otto Other', role: 'teacher' }).user;
const pupil = SC.createSchoolAccount(head, school.id, { rosterName: 'Pip Pupil' }).user;
const cls = SC.createClass(teacher, school.id, { name: 'Loop 4C' }).class;
assert.ok(SC.addToClass(teacher, cls.id, pupil.id).ok);
const kid = auth.createUser({ username: 'LoopKid', password: 'rainbow-77' });
const grownup = (() => { const u = auth.createUser({ username: 'LoopParent', password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(u); return auth.getUser(u.id); })();
const guest = auth.createGuest();

test('a new teacher: the card near the top of /teach, nothing ticked, links to the real tools for their first class', async () => {
  const r = await get('/teach', teacher); assert.equal(r.status, 200);
  const c = card(r.text);
  assert.ok(c, 'the card is there');
  assert.ok(r.text.indexOf('id="teach-loop"') < r.text.indexOf('id="my-classes"'), 'above My classes');
  assert.match(c, /Your teaching loop/);
  assert.match(c, /0 of 4 done/);
  assert.match(c, /Try each step once with Loop 4C\./);
  assert.equal((c.match(/class="tl-mstep(?: is-next)?"/g) || []).length, 4, 'four steps, none done');
  assert.equal((c.match(/class="tl-mstep is-next"/g) || []).length, 1, 'one next step (the only one open on a phone)');
  assert.match(c, /class="tl-mstep is-next"><span class="tl-tick"[^]*?Plan/, 'Plan is next');
  assert.doesNotMatch(c, /teach\.loop\.home\.makeClass|Make your first class/, 'they have a class');
  for (const href of [`/teach/lessons?school=${school.id}`, `/teach/lessons?school=${school.id}&amp;class=${cls.id}&amp;open=ai`, `/teach/lessons?school=${school.id}&amp;class=${cls.id}&amp;open=new`,
    `/class/${cls.id}/progress`, `/class/${cls.id}/standards`, `/class/${cls.id}/progress#to-review`]) assert.ok(c.includes(`href="${href}"`), href);
  assert.match(c, /data-api="\/api\/teach\/loop\/hide"/);
  assert.match(c, /href="\/teach\/loop"/);
  assert.doesNotMatch(r.text, /id="teach-loop-link"/, 'no small link while the card shows');
  assert.doesNotMatch(r.text, PRICE);
});

test('each step ticks itself off from real data: a lesson, assigning it, opening the gradebook, reviewing an answer', async () => {
  const st = () => TL.loopState(auth.getUser(teacher.id)).done;
  assert.deepEqual(st(), { plan: false, play: false, check: false, feedback: false });
  const lesson = L.createLesson(teacher, school.id, { title: 'Loop lesson' }).lesson;
  const q = L.addStep(teacher, lesson.id, { kind: 'question', title: 'Exit ticket', body: 'Why?' }).step;
  assert.equal(st().plan, true, 'Plan: a lesson in their library');
  assert.equal(TL.loopLinks(auth.getUser(teacher.id)).builder, `/teach/lessons/${lesson.id}#new-game`, 'Turn a lesson into a game: the lesson\'s own New game');
  const cl = L.assign(teacher, cls.id, lesson.id, {}).classLesson;
  assert.equal(st().play, true, 'Play: assigned to a class');
  // Check: only the teacher's own class pages count; another teacher's 404 doesn't tick theirs.
  assert.equal((await get(`/class/${cls.id}/progress`, other)).status, 404);
  assert.equal(TL.loopState(auth.getUser(other.id)).done.check, false);
  assert.equal((await get(`/class/${cls.id}/progress`, teacher)).status, 200);
  assert.equal(st().check, true, 'Check: the gradebook');
  P.answer(pupil, cl.id, q.id, 'Because.');
  assert.equal(st().feedback, false);
  P.review(teacher, cl.id, q.id, pupil.id, 'Good thinking!');
  assert.equal(st().feedback, true, 'Feedback: an answer reviewed');
  // All four done: the card goes, the small "How Oomba fits your week" link stays among the tools.
  const r = await get('/teach', teacher);
  assert.equal(card(r.text), '');
  assert.match(r.text, /<p class="tl-week"><a href="\/teach\/loop" id="teach-loop-link">🗓️ How Oomba fits your week<\/a><\/p>/);
});

test('Check from the Standards tab, the CSV and one lesson\'s progress too (and "Needs attention first" lands sorted)', async () => {
  for (const [i, p] of [`/class/${cls.id}/standards`, `/class/${cls.id}/progress.csv`].entries()) {
    const t = SC.createSchoolAccount(head, school.id, { rosterName: `Co Teacher ${'AB'[i]}`, role: 'teacher' }).user;
    assert.ok(SC.addToClass(head, cls.id, t.id, 'teacher').ok);
    assert.equal(TL.loopState(auth.getUser(t.id)).done.check, false);
    assert.equal((await get(p, t)).status, 200, p);
    assert.equal(TL.loopState(auth.getUser(t.id)).done.check, true, p);
  }
  const cl = L.classLessons(cls.id)[0];
  const r = await get(`/class/${cls.id}/progress/${cl.id}`, teacher);
  assert.equal(r.status, 200);
  assert.ok(TL.loopLinks(auth.getUser(teacher.id)).attention.endsWith(`/progress/${cl.id}#needs-attention`));
  // The link's anchor and sort chip are there for any class size (this class has one student).
  assert.match(r.text, /id="needs-attention" hidden><button class="chip" type="button" aria-pressed="false" data-sort="lp-steps">/);
});

test('Hide and Show again: per teacher, staff only; the card stays hidden until shown', async () => {
  const fresh = SC.createSchoolAccount(head, school.id, { rosterName: 'Nia New', role: 'teacher' }).user;
  assert.ok(card((await get('/teach', fresh)).text));
  assert.equal((await post('/api/teach/loop/hide', fresh)).status, 200);
  const r = await get('/teach', fresh);
  assert.equal(card(r.text), '');
  assert.match(r.text, /id="teach-loop-link"/);
  assert.ok(card((await get('/teach', teacher)).text) === '', 'another teacher (all done) is unaffected either way');
  const lp = await get('/teach/loop', fresh);
  assert.match(lp.text, /data-api="\/api\/teach\/loop\/show"/);
  assert.equal((await post('/api/teach/loop/show', fresh)).status, 200);
  assert.ok(card((await get('/teach', fresh)).text));
  assert.equal(JSON.parse(setting(`teach.loop:${fresh.id}`)).hidden, undefined);
});

test('who may see and change it: staff only; students, kids, grown-ups and guests get 404, signed out goes to sign in', async () => {
  const ok = await get('/teach/loop', teacher);
  assert.equal(ok.status, 200);
  assert.match(ok.text, /<h1>🗓️ How Oomba fits your week<\/h1>/);
  assert.match(ok.text, new RegExp(`href="/class/${cls.id}/progress.csv" download`));
  assert.equal((ok.text.match(/class="panel tl-step is-done"/g) || []).length, 4);
  assert.equal((await get('/teach/loop', head)).status, 200, 'a school admin is staff too');
  for (const [who, u] of [['student', pupil], ['kid', kid], ['grown-up', grownup], ['guest', guest]]) {
    assert.equal((await get('/teach/loop', u)).status, 404, who);
    for (const a of ['hide', 'show']) assert.equal((await post(`/api/teach/loop/${a}`, u)).status, 404, `${who} ${a}`);
    assert.equal(setting(`teach.loop:${u.id}`), null, `${who}: nothing stored`);
    assert.doesNotMatch((await get('/classes', u)).text, /id="teach-loop"/, `${who}: no card`);
  }
  assert.match((await get('/teach/loop')).location || '', /\/login/);
  assert.equal((await post('/api/teach/loop/hide')).status, 401);
  // Opening a student's own lesson never counts as a teacher's Check.
  TL.markCheck(pupil); assert.equal(setting(`teach.loop:${pupil.id}`), null);
});

test('the landing at "/": one teaching-loop section right after how it works, with the four screens, alt text and no prices', async () => {
  const s = (await get('/')).text;
  assert.match(s, /<h1 id="lp-h1" class="lp-h1"/);
  const at = s.indexOf('<section class="lp-sec lp-loop" id="loop"');
  assert.ok(at > s.indexOf('id="how"') && at < s.indexOf('id="builder"'), 'after how it works, before the Builder');
  assert.equal(s.split('class="lp-sec lp-loop"').length, 2, 'once');
  const sec = s.slice(at, s.indexOf('</section>', at));
  assert.match(sec, /<h2 id="loop-h">Plan → Play → Check → Feedback<\/h2>/);
  assert.equal((sec.match(/class="lp-card lp-step lp-loop-step rv"/g) || []).length, 4);
  for (const w of ['Lesson library', 'Draft with AI', 'Turn a lesson into a game', 'Assign to a class', 'Gradebook with CSV download', 'Needs attention first', 'Standards tab', 'Answers to review', 'Written feedback students see']) assert.ok(sec.includes(w), w);
  assert.doesNotMatch(sec, /href="\/(?:class|teach)\//, 'no links into teacher-only pages for signed-out visitors');
  assert.match(sec, /href="\/trial" data-cta="trial"/);
  for (const [name] of V.SHOTS) {
    const img = new RegExp(`<img src="/img/teach-loop/${name}\\.webp\\?v=\\d+" width="1280" height="800" [^>]*alt="([^"]{30,})" loading="lazy"`).exec(sec);
    assert.ok(img, name);
    const file = path.resolve('public/img/teach-loop', `${name}.webp`);
    assert.ok(fs.existsSync(file), file);
    assert.ok(fs.statSync(file).size < 80 * 1024, `${name} under 80 KB`);
    assert.equal(fs.readFileSync(file).subarray(8, 12).toString(), 'WEBP');
  }
  assert.doesNotMatch(s, /\$\d|€\d|£\d|\d+\s*(?:USD|dollars)/i);
  assert.doesNotMatch(sec, /rubric|Common Core|Google Classroom|weekly (?:summary|email)|coming soon/i, 'no promises of tools not built');
  const he = (await get('/he')).text;
  assert.match(he, /<h2 id="loop-h">תכנון ← משחק ← בדיקה ← משוב<\/h2>/);
});

test('/teachers: the same section; plain words for visitors, real links for staff', async () => {
  const out = (await get('/teachers')).text;
  const sec = out.slice(out.indexOf('id="teach-loop"'), out.indexOf('</section>', out.indexOf('id="teach-loop"')));
  assert.match(out, /<section class="tl tl-page lp-sec" id="teach-loop"/);
  assert.match(sec, /Gradebook with CSV download/);
  assert.doesNotMatch(sec, /href=/);
  assert.match(out, /\/css\/teach-loop\.css/);
  const staff = (await get('/teachers', teacher)).text;
  assert.match(staff.slice(staff.indexOf('id="teach-loop"')), new RegExp(`href="/class/${cls.id}/standards"`));
  const kidView = (await get('/teachers', kid)).text;
  assert.doesNotMatch(kidView.slice(kidView.indexOf('id="teach-loop"'), kidView.indexOf('</section>', kidView.indexOf('id="teach-loop"'))), /href=/, 'a kid gets words, no class links');
});

test('words: teach.loop in every language, the same placeholders, tool names the same as the app\'s buttons', () => {
  const read = c => JSON.parse(fs.readFileSync(path.resolve('server/i18n/locales', `${c}.json`), 'utf8'));
  const en = read('en').teach.loop;
  const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
  const enFlat = flat(en);
  for (const c of CODES.filter(x => x !== 'en-GB')) {
    const d = read(c), loop = d.teach && d.teach.loop;
    assert.ok(loop, c);
    const m = new Map(flat(loop));
    for (const [k, v] of enFlat) {
      assert.ok(m.has(k) && m.get(k).trim(), `${c}: ${k}`);
      assert.deepEqual((m.get(k).match(/\{\w+\}/g) || []).sort(), (v.match(/\{\w+\}/g) || []).sort(), `${c}: ${k} placeholders`);
      if (c !== 'en' && !/^tools\.(csv|live)$/.test(k) && v.length > 12) assert.notEqual(m.get(k), v, `${c}: ${k} is translated`);
    }
    assert.equal(loop.tools.library, d.lessons.library.title, `${c}: the library's own name`);
    assert.equal(loop.tools.attention, d.progress.lesson.attention, `${c}: the button's own name`);
  }
});

test('no class yet: the class tools are plain words and one "Make your first class" button, not links that all go to /teach', async () => {
  const solo = SC.createSchoolAccount(head, school.id, { rosterName: 'Nell Noclass', role: 'teacher' }).user;
  const links = TL.loopLinks(auth.getUser(solo.id));
  assert.equal(links.class, null);
  assert.equal(links.makeClass, '/teach?new=class');
  for (const k of ['assign', 'gradebook', 'csv', 'attention', 'standards', 'review', 'written']) assert.equal(links[k], null, k);
  for (const p of ['/teach', '/teach/loop']) {
    const r = await get(p, solo); assert.equal(r.status, 200, p);
    const c = p === '/teach' ? card(r.text) : r.text.slice(r.text.indexOf('id="teach-loop"'));
    assert.equal((c.match(/href="\/teach\?new=class"/g) || []).length, 1, `${p}: one Make your first class button`);
    assert.match(c, /class="btn btn-primary" href="\/teach\?new=class">🍎 Make your first class<\/a>/, p);
    assert.doesNotMatch(c, /href="\/class\//, `${p}: no class links`);
    if (p === '/teach/loop') for (const w of ['Assign to a class', 'Gradebook with CSV download', 'Needs attention first', 'Standards tab', 'Answers to review', 'Written feedback students see']) assert.ok(c.includes(`<span>${w}</span></li>`), `${w}: plain words`);
  }
});

test('deleting an account removes its teaching-loop row', async () => {
  const { deleteAccount } = await import('../../server/services/account-delete.js');
  const u = auth.createUser({ username: 'LoopLeaver', password: 'leaver-pass-123', accountType: 'grownup' });
  setting(`teach.loop:${u.id}`, JSON.stringify({ check: Date.now() }));
  assert.ok(setting(`teach.loop:${u.id}`));
  assert.equal(deleteAccount(u.id, null, { by: 'admin', parentMade: false }).ok, true);
  assert.equal(setting(`teach.loop:${u.id}`), null);
});
