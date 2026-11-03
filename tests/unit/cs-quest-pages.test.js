// CS Quest teacher pages (plan section 10.1; docs/cs-quest.md "Curriculum"): the signed-in program page /teach/cs-quest,
// the plan page /teach/cs-quest/:key with its print view and printables, the projector-questions page, the coverage map
// /teach/cs-quest/coverage, the public program page /teachers/cs-quest and the class Standards tab /class/:id/standards.
// The class Standards tab is todo until its stage lands.
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
const PAGES_STAGE = 'the Standards tab stage builds this page';

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

const L = await import('../../server/services/lessons.js');
const mia = S.createSchoolAccount(ana, oak.id, { rosterName: 'Mia Pupil' }).user;
const cls = S.createClass(ana, oak.id, { name: 'Ana 4B' }).class; S.addToClass(ana, cls.id, mia.id);
const KEY = T.templates({ band: '1B' })[0].key;
const noNav = text => !/<nav[^>]+class="[^"]*\b(topnav|sitenav|navbar)\b/.test(text) && !/class="site-header/.test(text);

test('/teach/cs-quest: band toggle, units with lesson rows, Add to my library / Add unit / the four paths, Before you start, Builder status line', async () => {
  const p = await as(ana)('/teach/cs-quest?band=1B');
  assert.equal(p.status, 200);
  for (const s of ['Before you start', 'Add to my library', 'Add unit', 'Core 10 (no Builder)', 'Full', 'CS Ed Week', 'Device-first', 'Coverage map', 'Builder: resting', 'teams can build this period', 'Unit 7', 'Grades 3-5', 'CS Quest · CSTA 1B/2', 'Headphones']) assert.ok(p.text.includes(s), `program page has "${s}"`);
  assert.ok(p.text.indexOf('Core 10 (no Builder)') < p.text.indexOf('CS Ed Week'), 'Core 10 first');
  for (const id of ['core10-no-builder', 'full', 'cs-ed-week', 'device-first']) assert.ok(p.text.includes(`/api/lessons/from-template/path/${id}`));
  assert.ok(!/\$\s?\d|per month|per seat/.test(p.text), 'no prices');
  assert.equal((await as(ana)('/teach/cs-quest?band=2')).status, 200);
  const kid = await as(mia)('/teach/cs-quest');
  assert.equal(kid.status, 404); assert.ok(!kid.text.includes('Before you start'));
  assert.equal((await fetch(base + '/teach/cs-quest', { redirect: 'manual' })).status, 302, 'signed out goes to sign in');
  const eva = S.createSchoolAccount(boss, oak.id, { rosterName: 'Eva Teacher', role: 'teacher' }).user;
  const es = await (await fetch(base + '/teach/cs-quest?lang=es', { headers: { cookie: cookieFor(eva.id) } })).text();
  assert.ok(es.includes('Antes de empezar') && es.includes('lang="en"'), 'chrome is translated; lesson titles stay marked English');
});

test('the four path buttons add the right lessons (Core 10 = 1.2 1.3 2.1 2.2 3.1 3.2 4.1 4.2 5.2 6.1)', async () => {
  const cat = T.catalogue();
  for (const [i, p] of cat.paths.entries()) {
    const who = S.createSchoolAccount(boss, oak.id, { rosterName: `Path Teacher ${i}`, role: 'teacher' }).user;
    const r = await as(who)(`/api/lessons/from-template/path/${p.id}`, { method: 'POST', body: { schoolId: oak.id, band: '1B' } });
    assert.equal(r.status, 200, p.id);
    const want = T.pathKeys(p.id, '1B');
    assert.deepEqual(r.json.lessons.map(x => x.key), want.keys, `${p.id}: every lesson of the path, in order`);
    assert.ok(r.json.lessons.every(x => x.templateKey === x.key));
    if (p.id === 'core10-no-builder') assert.deepEqual(want.keys.map(k => k.replace('csq-1b-', '')), ['1.2', '1.3', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.2', '6.1']);
    const page = await as(who)('/teach/cs-quest?band=1B');
    assert.ok(page.text.includes(`In your library`) || page.text.includes('Added'), 'the rows say the lessons are in the library');
  }
});

test('/teach/cs-quest/:key: the plan page with the buttons (Start warm-up (live), Show questions on the projector, Open game at this chapter, Assign to class, Assign unit..., Host exit ticket live, Print, Printables, Reset to the CS Quest version, band switch), the 40-minute and block rows', async () => {
  const p = await as(ana)(`/teach/cs-quest/${KEY}`);
  assert.equal(p.status, 200);
  for (const s of ['I can', 'CS Quest · CSTA 1B/2', 'Do Now', 'Show questions on the projector', 'Assign to class', 'Assign unit...', 'Print', 'Printables', 'Short period (40 min)', 'Block (80-90 min)', 'Explore (projector script)', 'Say this', 'Sub plan', 'Unplugged twin', 'Exit ticket', 'Switch to Grades 6-8', 'every school day', 'twice a week']) assert.ok(p.text.includes(s), `plan page has "${s}"`);
  assert.ok(p.text.includes('lang="en"'), 'lesson text is marked English');
  for (const sheet of ['planning-sheet', 'etiquette-card', 'exit-half', 'unplugged', 'sub-plan']) assert.ok(p.text.includes(`?sheet=${sheet}`), sheet);
  // add, then the Reset button appears and the editor shows the banner
  const add = await as(ana)(`/api/lessons/from-template/${KEY}`, { method: 'POST', body: { schoolId: oak.id } });
  assert.equal(add.status, 200);
  const again = await as(ana)(`/teach/cs-quest/${KEY}`);
  assert.ok(again.text.includes('Reset to the CS Quest version') && again.text.includes('In your library'));
  assert.equal((await as(ana)('/teach/cs-quest/csq-1b-9.9')).status, 404);
  assert.equal((await as(mia)(`/teach/cs-quest/${KEY}`)).status, 404, 'students never see a plan page');
});

test('/teach/cs-quest/:key?print=1: the printed plan (two pages, quest code large, sub plan boxed, answer key teacher-only)', async () => {
  const p = await as(ana)(`/teach/cs-quest/${KEY}?print=1`);
  assert.equal(p.status, 200);
  assert.ok(p.text.includes('class="printdoc'), 'a .printdoc'); assert.ok(p.text.includes('/js/print.js'));
  assert.ok(noNav(p.text) && !p.text.includes('class="topbar'), 'no site navigation');
  assert.ok((p.text.match(/class="csq-page/g) || []).length >= 2, 'two pages or more');
  assert.ok(p.text.includes('Sub plan') && p.text.includes('csq-box'));
  assert.equal((await as(mia)(`/teach/cs-quest/${KEY}?print=1`)).status, 404, 'the answer key is teacher-only');
});

test('/teach/cs-quest/:key?sheet=<name>: printables named by the lesson (grid-mat, loop-cards, planning-sheet, rubric, ...)', async () => {
  const tpl = T.getTemplate(KEY);
  for (const s of ['exit-half', 'sub-plan', 'unplugged', 'rubric', 'planning-sheet', 'etiquette-card', ...tpl.unpluggedTwin.printables]) {
    const p = await as(ana)(`/teach/cs-quest/${KEY}?sheet=${s}`);
    assert.equal(p.status, 200, s); assert.ok(p.text.includes('printdoc'), s); assert.ok(noNav(p.text), s);
  }
  assert.equal((await as(ana)(`/teach/cs-quest/${KEY}?sheet=..%2Fx`)).status, 404);
});

test('/teach/cs-quest/:key?projector=1: the warm-up questions one per screen, tap to reveal, no login, no room', async () => {
  const tpl = T.getTemplate(KEY);
  const p = await as(ana)(`/teach/cs-quest/${KEY}?projector=${tpl.warmup ? 'warmup' : 'exit'}`);
  if (!T.bankOf(tpl.exit.setId)) { assert.equal(p.status, 404); return; }
  assert.equal(p.status, 200);
  assert.ok(p.text.includes('data-projector') && p.text.includes('Show the answer'));
  assert.ok((p.text.match(/class="csq-slide/g) || []).length >= 3, 'one slide per item');
  assert.ok(/<details class="csq-reveal"/.test(p.text) && !/<details class="csq-reveal"[^>]* open/.test(p.text), 'answers folded until revealed');
  assert.ok(!p.text.includes('is-right'), 'no answer is marked before the reveal');
});

test('/teach/cs-quest/coverage (+ ?print=1): the coverage map from coverage()', async () => {
  const p = await as(ana)('/teach/cs-quest/coverage');
  assert.equal(p.status, 200);
  for (const s of ['Coverage map', 'Practiced', 'Checked', 'Applied', 'Practices by unit', '1B-AP-10', '2-AP-13']) assert.ok(p.text.includes(s), s);
  assert.equal((p.text.match(/<td class="id"/g) || []).length, 44, 'all 44 ids');
  const pr = await as(ana)('/teach/cs-quest/coverage?print=1');
  assert.equal(pr.status, 200); assert.ok(pr.text.includes('printdoc') && noNav(pr.text));
  assert.equal((await as(mia)('/teach/cs-quest/coverage')).status, 404);
});

test('/teachers/cs-quest (public, indexed): the promise, the Byte Crew try-it buttons, units, paths with Core 10 (no Builder) first, FAQ, JSON-LD educationalAlignment, no prices, no child names', async () => {
  const r = await fetch(base + '/teachers/cs-quest'); const text = await r.text();
  assert.equal(r.status, 200);
  for (const s of ['CS Quest', 'What you get', 'The four games', 'Seven units', 'Four paths', 'Core 10 (no Builder)', 'What you can honestly say', 'Do lessons need a school?', 'headphones', 'educationalAlignment', 'CSTA K-12 Computer Science Standards 2017', '1B-AP-10']) assert.ok(text.includes(s), s);
  assert.ok(text.indexOf('Core 10 (no Builder)') < text.indexOf('CS Ed Week'));
  assert.ok(!/\$\s?\d|per month|per seat|€/.test(text), 'no prices');
  assert.ok(!/noindex/.test(text), 'indexed');
  const hub = await fetch(base + '/learn/computer-science'); const ht = await hub.text();
  assert.equal(hub.status, 200); assert.ok(ht.includes('/teachers/cs-quest'));
});

test('/teach/lessons/:id: the editor banner "From CS Quest x.y (vN) · Open the plan page" on a materialised copy', async () => {
  const r = T.materialise(ana, oak.id, KEY);
  const p = await as(ana)(`/teach/lessons/${r.lesson.id}`);
  assert.equal(p.status, 200);
  assert.ok(p.text.includes(`From CS Quest ${T.getTemplate(KEY).n} (v`), 'the banner'); assert.ok(p.text.includes(`/teach/cs-quest/${KEY}`) && p.text.includes('Open the plan page'));
});

test('/class/:id/standards (+ .csv, ?report=1): Practiced / Checked / Applied per id, teacher-only, school.classTabs.standards in 13 languages', { todo: PAGES_STAGE }, () => {});
