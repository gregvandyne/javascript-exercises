// CS Quest teacher pages (plan section 10.1; docs/cs-quest.md "Curriculum"): the signed-in program page /teach/cs-quest,
// the plan page /teach/cs-quest/:key with its print view and printables, the projector-questions page, the coverage map
// /teach/cs-quest/coverage, the public program page /teachers/cs-quest and the class Standards tab /class/:id/standards.
// This file is the skeleton the pages stage fills in: the JSON the pages are built from is checked here already
// (server/routes/cs-quest.js), the pages themselves are todo until they land, so the list of what the stage owes is
// visible in every test run.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const T = await import('../../server/services/lesson-templates.js');
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
const boss = createUser({ username: 'CsqPageBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oak Pages' }).school;
const ana = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const PAGES_STAGE = 'the pages stage (stage 4+) builds this page';

test('the JSON the pages are built from: catalog (units, paths, library status, flags, Builder), one lesson, coverage, builder-status', async () => {
  const api = as(ana);
  const cat = await api('/api/cs-quest/catalog');
  assert.equal(cat.status, 200);
  assert.deepEqual(cat.json.units.map(u => u.n), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(cat.json.paths[0].title, 'Core 10 (no Builder)');
  assert.ok(cat.json.units[6].needsSchoolPlan && cat.json.units[6].optional, 'unit 7 is optional and needs a school plan');
  assert.deepEqual(Object.keys(cat.json.builder).sort(), ['on', 'pools', 'resetsAt', 'state', 'teamsPerPeriod', 'why']);
  assert.ok(!/\$\s?\d|per month|per seat/.test(JSON.stringify(cat.json)), 'no prices anywhere');
  const first = T.templates()[0];
  const one = await api(`/api/cs-quest/lessons/${first.key}`);
  assert.equal(one.status, 200); assert.equal(one.json.lesson.key, first.key); assert.equal(one.json.status.inLibrary, false);
  for (const k of ['plan', 'explore', 'play', 'discuss', 'exit', 'differentiation', 'unpluggedTwin', 'subPlan', 'shortPeriod40', 'steps']) assert.ok(k in one.json.lesson, `the plan page has ${k}`);
  const cov = await api('/api/cs-quest/coverage');
  assert.equal(cov.status, 200); assert.equal(cov.json.ids.length, 44);
  const bs = await api('/api/cs-quest/builder-status');
  assert.equal(bs.status, 200); assert.equal(bs.json.state, 'resting'); assert.equal(bs.json.teamsPerPeriod, 8);
});

test('/teach/cs-quest: band toggle, units with lesson rows, Add to my library / Add unit / the four paths, Before you start, Builder status line', { todo: PAGES_STAGE }, () => {});
test('/teach/cs-quest/:key: the plan page with the buttons (Start warm-up (live), Show questions on the projector, Open game at this chapter, Assign to class, Assign unit..., Host exit ticket live, Print, Printables, Reset to the CS Quest version, band switch), the 40-minute and block rows', { todo: PAGES_STAGE }, () => {});
test('/teach/cs-quest/:key?print=1: the printed plan (two pages, quest code large, sub plan boxed, answer key teacher-only)', { todo: PAGES_STAGE }, () => {});
test('/teach/cs-quest/:key?sheet=<name>: printables named by the lesson (grid-mat, loop-cards, planning-sheet, rubric, ...)', { todo: PAGES_STAGE }, () => {});
test('/teach/cs-quest/:key?projector=1: the warm-up questions one per screen, tap to reveal, no login, no room', { todo: PAGES_STAGE }, () => {});
test('/teach/cs-quest/coverage (+ ?print=1): the coverage map from coverage()', { todo: PAGES_STAGE }, () => {});
test('/teachers/cs-quest (public, indexed): the promise, the Byte Crew try-it buttons, units, paths with Core 10 (no Builder) first, FAQ, JSON-LD educationalAlignment, no prices, no child names', { todo: PAGES_STAGE }, () => {});
test('/class/:id/standards (+ .csv, ?report=1): Practiced / Checked / Applied per id, teacher-only, school.classTabs.standards in 13 languages', { todo: PAGES_STAGE }, () => {});
test('/teach/lessons/:id: the editor banner "From CS Quest x.y (vN) · Open the plan page" on a materialised copy', { todo: PAGES_STAGE }, () => {});
