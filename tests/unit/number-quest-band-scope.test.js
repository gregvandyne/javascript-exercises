// Number Quest: each level (band) is its own street, on screen and in every progress count (owner report, 2026-11-17:
// "I am not seeing the difference between Pro and Explorer. It also says I have completed both Pro and Explorer even
// though I have only completed the Explorer.").
//   1. THE LEVEL ON SCREEN IS UNMISTAKABLE: the course page names the level it shows in a banner right under the
//      course title (name, grades, district, its units and its own finale) with the level switcher beside it, so
//      Explorer and Pro differ above the fold, not only far down the street.
//   2. COMPLETION IS PER LEVEL, AND SAYS SO: progress was always stored per step key ("explorer-1.1", "pro-1.1"), but
//      every count was printed as "23 of 23 steps done" under a "grades K–8" course title, so finishing Explorer read
//      as finishing the whole course. Every count now names its level ("Explorer: 23 of 23 steps done"), and the Pro
//      and Launchpad streets of a learner who finished Explorer only show nothing done, planted or completed. The
//      teacher's class view lists each level a student has worked in.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const C = await import('../../server/services/courses.js');
const NQ = await import('../../server/services/number-quest-progress.js');
seed({ quiet: true });

const course = C.getCourse('number-quest');
let n = 0;
const newKid = () => auth.createUser({ username: `nqbs${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const grownup = auth.createUser({ username: `nqbsgu${Date.now() % 1e6}`, password: 'correct-horse-12', displayName: 'Grown-up', accountType: 'grownup' });

/** A learner who walked the whole Explorer street the real way (read, check passed, mission won), and nothing else. */
function finishExplorer(u) {
  C.setBand(u, course, 'explorer');
  for (const s of C.steps(course, 'explorer')) {
    C.markRead(u, course, s);
    C.recordCheck(u, course, s, { score: 3, passed: true });
    if (s.game) { C.markPlayed(u, course, s); C.markCompleted(u, course, s); }
    NQ.awardCheckPassed(u, course, s.key);
  }
  for (let unit = 1; unit <= 7; unit++) NQ.completeLap(u, course, 'explorer', unit, 1);
  return u;
}

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (path, cookie) => { const r = await fetch(base + path, { headers: { ...H, ...(cookie ? { cookie } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
const pick = async (cookie, band) => {
  const r = await fetch(`${base}/courses/number-quest/band`, { method: 'POST', redirect: 'manual', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded', cookie }, body: `band=${band}` });
  assert.equal(r.status, 303);
};
const body = t => t.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
/** The level banner's own words (its heading block, without the level switcher under it). */
const banner = t => { const m = /<section class="[^"]*\bnqp-band\b[^"]*"[^>]*id="nqp-band"[\s\S]*?<nav class="nqp-streets"/.exec(t); return m ? m[0] : ''; };
const words = h => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const EXPLORER_UNITS = ['The Counting House', 'Joining &amp; Splitting', 'Groups &amp; Shares', 'The Bakery', 'The Measure Shop', 'The Building Yard', 'The Fairground'];
const PRO_UNITS = ['The Mixing Tower', 'The Cold Store', 'The Machine Hall', 'The Map Room', 'The Sky Wires', 'The Drafting Keep', 'The Test Range'];

// ------------------------------------------------------------------------------------------------- 1. the level on screen
test('the level on screen: a banner under the title names it (grades, units, its finale), above the progress panel, and switching to Pro changes it', async () => {
  const kid = finishExplorer(newKid()); const ck = cookieFor(kid.id);
  const ex = body((await get('/courses/number-quest', ck)).text);
  const exB = words(banner(ex));
  assert.ok(exB, 'the Explorer street has a level banner');
  assert.match(exB, /Your level/);
  assert.match(exB, /Explorer/); assert.match(exB, /Grades 3–5/); assert.match(exB, /The Workshops/);
  assert.match(exB, /Units 1–7, then the finale: The Vault of Measures/);
  assert.doesNotMatch(exB, /Grades 6–8|Great Clock/);
  assert.ok(ex.indexOf('id="nqp-band"') < ex.indexOf('id="nqp-hud-h"'), 'the banner comes before the progress panel: it is above the fold');
  assert.ok(ex.indexOf('id="nqp-streets"') < ex.indexOf('id="nqp-hud-h"'), 'and so does the level switcher');
  assert.match(ex, /class="[^"]*nqp-band-explorer/);

  await pick(ck, 'pro');
  assert.equal(C.getBand(kid, course), 'pro', 'the choice is saved for a signed-in learner');
  const pro = body((await get('/courses/number-quest', ck)).text);
  const proB = words(banner(pro));
  assert.match(proB, /Pro/); assert.match(proB, /Grades 6–8/); assert.match(proB, /The Towers/);
  assert.match(proB, /Units 1–7, then the finale: The Great Clock/);
  assert.doesNotMatch(proB, /Explorer|Grades 3–5|Vault of Measures/);
  assert.match(pro, /class="[^"]*nqp-band-pro/);
  assert.match(pro, /aria-current="page" id="street-pro"/);
  // Pro's own units and finale on the street, none of Explorer's.
  for (const u of PRO_UNITS) assert.match(pro, new RegExp(`Unit \\d · ${u}`), u);
  assert.match(pro, /id="step-pro-7\.4"[\s\S]*?The Great Clock/);
  for (const u of EXPLORER_UNITS) assert.doesNotMatch(pro, new RegExp(`Unit \\d · ${u}`), u);
  assert.doesNotMatch(pro, /id="step-explorer-/);

  // A grown-up has no level of their own: the banner says what is shown, and their street links still switch it.
  const gu = body((await get('/courses/number-quest?street=pro', cookieFor(grownup.id))).text);
  const guB = words(banner(gu));
  assert.match(guB, /Now showing/); assert.match(guB, /Pro/); assert.match(guB, /Grades 6–8/);
  assert.match(gu, /href="\/courses\/number-quest\?street=explorer" id="street-explorer"/);
});

// ------------------------------------------------------------------------------------------------- 2. completion per level
test('completion is per level: finishing Explorer shows Explorer done, and Pro and Launchpad not started, on every count that names it', async () => {
  const kid = finishExplorer(newKid()); const ck = cookieFor(kid.id);
  // The records themselves were always per level: the Explorer steps only, under their own keys.
  const stored = q.all('SELECT step, band FROM course_progress WHERE user_id=? AND course=?', kid.id, 'number-quest');
  assert.equal(stored.length, 23); assert.ok(stored.every(r => r.band === 'explorer' && r.step.startsWith('explorer-')));
  assert.equal(C.overview(kid, course, 'explorer').done, 23);
  assert.equal(C.overview(kid, course, 'pro').done, 0);
  assert.equal(C.overview(kid, course, 'launchpad').done, 0);

  const ex = body((await get('/courses/number-quest', ck)).text);
  assert.match(ex, /Explorer: 23 of 23 steps done/);
  assert.match(ex, /You walked the whole Explorer street!/);
  assert.doesNotMatch(ex, /New here\?/, 'a learner who finished a street is not greeted as new');

  for (const band of ['pro', 'launchpad']) {
    const t = body((await get(`/courses/number-quest?street=${band}`, ck)).text);
    const name = band === 'pro' ? 'Pro' : 'Launchpad';
    assert.match(t, new RegExp(`${name}: 0 of 23 steps done`), band);
    assert.doesNotMatch(t, /(?<![A-Za-z]: )\b23 of 23 steps done/, `${band}: no bare "23 of 23" anywhere`);
    assert.doesNotMatch(t, /nqp-node-done|is-planted| planted<|Lap 1 done|walked the whole/, `${band}: nothing done, planted or walked`);
    assert.doesNotMatch(t, /New here\?/);
  }

  // The Learn tab's course card names the level its count belongs to.
  let learn = body((await get('/learn', ck)).text);
  assert.match(learn, /Explorer: 23 of 23 steps done/);
  await pick(ck, 'pro');
  learn = body((await get('/learn', ck)).text);
  assert.match(learn, /Pro: 0 of 23 steps done/);
  assert.doesNotMatch(learn, /(?<![A-Za-z]: )\b23 of 23 steps done/);

  // The teacher's class view: the row is the student's level now, and every level they worked in is listed with
  // its own count and status, so Explorer stays "completed" and Pro is not.
  const [row] = C.classCourseProgress([kid], course);
  assert.equal(row.band, 'pro'); assert.equal(row.status, 'not-started'); assert.equal(row.done, 0);
  const by = Object.fromEntries(row.bands.map(b => [b.band, b]));
  assert.deepEqual(Object.keys(by), ['explorer', 'pro']);
  assert.equal(by.explorer.status, 'completed'); assert.equal(by.explorer.done, 23);
  assert.equal(by.pro.status, 'not-started'); assert.equal(by.pro.done, 0);
});

test('the class progress page names the level of each count, and keeps a finished level completed after a switch', async () => {
  const S = await import('../../server/services/schools.js');
  const boss = auth.createUser({ username: `nqbsboss${Date.now() % 1e6}`, password: 'correct-horse-12', role: 'admin' });
  const school = S.createSchool(boss, { name: 'Band Scope School' }).school;
  const teacher = S.createSchoolAccount(boss, school.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user;
  const cls = S.createClass(teacher, school.id, { name: 'Tia 6A' }).class;
  const pupil = S.createSchoolAccount(teacher, school.id, { rosterName: 'Pia Pupil' }).user; S.addToClass(teacher, cls.id, pupil.id);
  finishExplorer(pupil);
  C.setBand(pupil, course, 'pro');
  const t = body((await get(`/class/${cls.id}/progress`, cookieFor(teacher.id))).text);
  const panel = (/<details class="panel coursepanel" id="course-number-quest"[\s\S]*?<\/details>/.exec(t) || [''])[0];
  assert.ok(panel, 'the Number Quest panel is on the class progress page');
  assert.match(panel, /Explorer: 23 of 23 steps done/);
  assert.match(panel, /Pro: 0 of 23 steps done/);
  assert.match(words(panel), /Completed · Explorer/);
});
