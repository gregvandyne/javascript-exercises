// Number Quest Pro (grades 6-8, The Towers): the tier's foundations, with the data exactly as it ships
// (units.json tiers.pro.status "building", 2026-11-14). The plan is the owner's, approved the same day. Pinned here:
//   - PLANNED UNITS: the seven Pro units and their 22 steps are reserved in the catalogue (`planned: true`) so they
//     can be built side by side. For the engine a planned unit is not in the tier: no steps, no doors, no start
//     node, no test-out, no standards tag, for anyone. Deleting the flag is what puts a unit on the street;
//   - a tier with a planned unit is never open, whatever its status line says;
//   - NOBODY BUT THE PLATFORM ADMIN sees Pro: not a visitor, a learner, a parent or school staff; not as a band, a
//     street, a step, an API, a start node, a test-out, a teacher-page row or a word on a public page;
//   - the admin previews a sensible street: the welcome step opens, the seven planned units are listed as planned
//     (no doors), the teacher page shows them in their own section, and nothing reads "undefined";
//   - PLACEMENT IS UNCHANGED while Pro is building: every one of the 88,434 possible sets of placed rungs starts
//     exactly where it starts on main (a hash), the recorded Pro profiles and starting line are inert, and "Just
//     Play" for grades 6-8 still starts at Explorer Unit 7;
//   - with Pro FORCED OPEN (the test hooks: the planned flags lifted, the status read as open) the walk follows the
//     seven profiles, a learner enters only with every strand at rung 5.5 or over, and a strong fourth grader with
//     any strand under it still starts at the Explorer finale door;
//   - EXISTING LEARNERS ARE NEVER MOVED, building or open: nothing stored about them changes;
//   - the teacher page's placement copy is made from the data: unchanged today, and it names the third street
//     the moment it is open.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const C = await import('../../server/services/courses.js');
const T = await import('../../server/services/number-quest-tiers.js');
const P = await import('../../server/services/number-quest-placement.js');
const NQ = await import('../../server/services/number-quest-progress.js');
const tags = await import('../../server/standards/official-tags.js');
const { nqFacts } = await import('../../server/routes/number-quest.js');
const { placementMatrix, placementSection, proPlacementWords } = await import('../../server/views/number-quest-teacher.js');
const { TEMPLATES, generateItem } = await import('../../seed-lessons/number-quest/placement/generator.js');
const { crosswalkHash } = await import('../support/nq-sub6-pin.js');
seed({ quiet: true });

const UNITS = JSON.parse(fs.readFileSync(new URL('../../seed-lessons/number-quest/units.json', import.meta.url), 'utf8'));
const PLACE = JSON.parse(fs.readFileSync(new URL('../../seed-lessons/number-quest/placement.json', import.meta.url), 'utf8'));
const course = C.getCourse('number-quest');
let n = 0;
const newKid = () => auth.createUser({ username: `nqf${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const parent = auth.createUser({ username: `nqfpar${Date.now() % 1e6}`, password: 'correct-horse-12', displayName: 'Parent', accountType: 'grownup' });
const admin = auth.createUser({ username: `nqfadm${Date.now() % 1e6}`, password: 'correct-horse-12', displayName: 'Admin', role: 'admin' });

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
// Every test leaves the tiers as units.json and placement.json declare them.
const restore = () => { T.setTierStatus('pro', null); T.setTierStatus('launchpad', null); T.setCatalogueForTests(null); P.setEntryProfilesForTests(null); C.reload(); };
test.afterEach(restore);
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (path, cookie) => { const r = await fetch(base + path, { headers: { ...H, ...(cookie ? { cookie } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const post = async (path, cookie, body, type = 'application/json') => {
  const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': type, ...(cookie ? { cookie } : {}) }, body: type === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body).toString() });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text, location: r.headers.get('location') };
};
const rungs = (number, algebra, shape, data) => ({ number, algebra, 'shape-measure': shape, 'data-chance': data });
const all = r => rungs(r, r, r, r);
const PRO_KEYS = ['0.1', '1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '6.1', '6.2', '6.3', '7.1', '7.2', '7.3', '7.4'].map(k => `pro-${k}`);
/** FOR THIS FILE: Pro as it will be once its units are built and it opens. The planned flags are lifted in a copy of
 *  the catalogue (the steps then load with the placeholder deck a step without a deck file gets) and the tier's
 *  status is read as open. Nothing in the app can do either: a unit is built by a change to units.json. */
function forceProOpen() {
  const cat = structuredClone(T.catalogue());
  for (const u of cat.units) if (u.tier === 'pro') delete u.planned;
  T.setCatalogueForTests(cat); T.setTierStatus('pro', 'open'); C.reload();
}
/** Everything the platform stores about one learner's Number Quest, as rows: what "not moved" is compared on. */
const snapshot = kid => JSON.stringify({
  progress: q.all('SELECT * FROM course_progress WHERE user_id=? AND course=? ORDER BY step', kid.id, 'number-quest'),
  band: q.all('SELECT * FROM course_bands WHERE user_id=? AND course=?', kid.id, 'number-quest'),
  placement: q.all('SELECT * FROM nq_placement WHERE user_id=?', kid.id),
  laps: q.all('SELECT * FROM nq_laps WHERE user_id=? ORDER BY tier, unit, lap', kid.id),
  testout: q.all('SELECT * FROM nq_testout WHERE user_id=? ORDER BY tier, unit', kid.id),
  marks: NQ.totalMarks(kid, course),
});
const finish = (kid, key) => {
  const step = C.getStep(course, key);
  C.markRead(kid, course, step); C.recordCheck(kid, course, step, { score: 3, passed: true }); NQ.awardCheckPassed(kid, course, key);
  if (step.game) { C.markPlayed(kid, course, step); C.markCompleted(kid, course, step); NQ.awardMissionCompleted(kid, course, key); }
};
// What main dealt (9edb96e7 and 1d0f1763), from tests/support/nq-sub6-pin.js crosswalkHash run on that checkout.
const MAIN = Object.freeze({ sets: 88434, hash: '4e1e9f9978a499ee70c269aae79b7d46708d9be9a4317732ea11b59f93e23676',
  nodes: ['explorer-0.1', 'explorer-2.1', 'explorer-3.1', 'explorer-4.1', 'explorer-5.1', 'explorer-6.1', 'explorer-7.1', 'explorer-7.4', 'launchpad-0.1', 'launchpad-2.1', 'launchpad-3.1', 'launchpad-4.1', 'launchpad-5.1', 'launchpad-6.1', 'launchpad-7.1'],
  begin: ['launchpad-0.1', 'launchpad-0.1', 'launchpad-0.1', 'explorer-1.1', 'explorer-1.1', 'explorer-1.1', 'explorer-7.1', 'explorer-7.1', 'explorer-7.1'],
  startNodes: ['launchpad-0.1', 'launchpad-1.1', 'launchpad-2.1', 'launchpad-3.1', 'launchpad-4.1', 'launchpad-5.1', 'launchpad-6.1', 'launchpad-7.1', 'launchpad-7.4', 'explorer-0.1', 'explorer-1.1', 'explorer-2.1', 'explorer-3.1', 'explorer-4.1', 'explorer-5.1', 'explorer-6.1', 'explorer-7.1', 'explorer-7.4'] });

// ------------------------------------------------------------------------------------------------- planned units
test('planned units: reserved in the catalogue, absent from the engine; the tier is its welcome step', () => {
  assert.equal(T.statusOf('pro'), 'building'); assert.equal(T.exists('pro'), true); assert.equal(T.isOpen('pro'), false);
  assert.deepEqual(T.unitsOf('pro').map(u => [u.n, u.title]), [[0, 'Welcome to the Towers']]);
  assert.deepEqual(T.plannedUnitsOf('pro').map(u => [u.n, u.title, u.stamp]), [[1, 'The Mixing Tower', 'Ratio Gear'], [2, 'The Cold Store', 'Zero Gear'], [3, 'The Machine Hall', 'Variable Gear'], [4, 'The Map Room', 'Scale Gear'],
    [5, 'The Sky Wires', 'Slope Gear'], [6, 'The Drafting Keep', 'Angle Gear'], [7, 'The Test Range', 'Chance Gear']]);
  for (const tier of ['launchpad', 'explorer']) assert.deepEqual(T.plannedUnitsOf(tier), [], `${tier} has nothing planned: every unit is built`);
  assert.deepEqual(T.plannedUnitsOf('nowhere'), []); assert.equal(T.isPlanned(null), false); assert.equal(T.isPlanned({ planned: 'yes' }), false, 'only the literal true plans a unit');
  // The engine's view of the tier: one step, one door, a first key; the finale the line names is not there yet.
  assert.deepEqual(T.stepsOf('pro').map(s => s.key), ['pro-0.1']);
  assert.equal(T.firstKey('pro'), 'pro-0.1'); assert.equal(T.tierInfo('pro').finale, '7.4');
  assert.deepEqual(C.steps(course, 'pro').map(s => [s.key, s.title, s.deck, s.game, s.index]), [['pro-0.1', 'Welcome to the Towers', true, null, 0]]);
  assert.deepEqual(C.groupsFor(course, 'pro').map(g => g.id), ['unit-0']);
  for (const key of PRO_KEYS.slice(1)) {
    assert.equal(C.getStep(course, key), null, `${key}: planned, so no step`);
    assert.equal(C.stepFor(admin, course, key), null, `${key}: not even for the admin`);
    assert.equal(C.stateOf(admin, course, key), null);
  }
  // What a planned unit does carry: its reserved steps, in final order, with their titles and codes.
  const planned = T.plannedUnitsOf('pro').flatMap(u => T.plannedStepsOf(u));
  assert.deepEqual(planned.map(s => s.key), PRO_KEYS.slice(1));
  assert.deepEqual(planned.map(s => s.order), PRO_KEYS.slice(1).map((_, i) => i + 2), 'order 2..23: the welcome is 1');
  assert.deepEqual(planned.slice(0, 3).map(s => [s.n, s.title, s.standards.primary]), [['1.1', 'Ratios and equal mixes', ['6.RP.A.1', '6.RP.A.3a']], ['1.2', 'Unit rates', ['6.RP.A.2', '6.RP.A.3b']], ['1.3', 'Percent and changing units', ['6.RP.A.3c', '6.RP.A.3d']]]);
  assert.equal(planned.at(-1).title, 'The Great Clock');
  assert.deepEqual(T.plannedStepsOf(null), []);
  // No play can be credited to a planned step, and none is a start node or a test-out, even for the admin.
  assert.deepEqual([...tags.numberQuestSteps().keys()].filter(k => k.startsWith('pro-')), []);
  assert.ok(!P.startNodes().some(x => x.tier === 'pro'));
  for (const u of [1, 2, 3, 4, 5, 6, 7]) { assert.equal(P.entryProfile('pro', u), null, `Pro Unit ${u}'s profile is on file and inert`); assert.deepEqual(P.testOutItems(u, 'seed', 'pro'), []); }
  assert.ok(PLACE.crosswalk.entryProfiles['pro-1.1'], 'though placement.json does record it');
  assert.equal(P.proEntry(), null, 'Pro is nobody\'s start while it is building');
  assert.equal(P.overrideStartNode(newKid(), 'pro-0.1'), null); assert.equal(P.overrideStartNode(newKid(), 'pro-1.1'), null);
  assert.equal(P.nodeInfo('pro-0.1').node, 'explorer-0.1', 'a Pro node names no workshop: it reads as the Explorer welcome');
  // Laps and progress have nothing to hold for a street nobody walks.
  assert.equal(C.overview(admin, course, 'pro').total, 1);
});

test('a tier with a planned unit is never open, whatever its status line says; lifting the flag is what builds a unit', () => {
  // The status line edited to "open" while units are still planned: the engine refuses to read the tier as open.
  let cat = structuredClone(T.catalogue());
  cat.tiers.pro.status = 'open';
  T.setCatalogueForTests(cat); C.reload();
  assert.equal(T.statusOf('pro'), 'building', 'seven units are still to build');
  assert.deepEqual(T.openTiers(), ['launchpad', 'explorer']); assert.deepEqual(C.bandsFor(course, newKid()), ['launchpad', 'explorer']);
  assert.equal(C.stepFor(newKid(), course, 'pro-0.1'), null);
  // One planned unit left is enough.
  cat = structuredClone(T.catalogue());
  for (const u of cat.units) if (u.tier === 'pro' && u.n !== 7) delete u.planned;
  T.setCatalogueForTests(cat); C.reload();
  assert.equal(T.statusOf('pro'), 'building'); assert.deepEqual(T.plannedUnitsOf('pro').map(u => u.n), [7]);
  assert.deepEqual(T.unitsOf('pro').map(u => u.n), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(C.steps(course, 'pro').map(s => s.key), PRO_KEYS.slice(0, 19), 'a unit whose flag is lifted joins the street, in its reserved order');
  assert.deepEqual(C.steps(course, 'pro').map(s => s.index), PRO_KEYS.slice(0, 19).map((_, i) => i));
  assert.equal(C.getStep(course, 'pro-1.1').title, 'Ratios and equal mixes'); assert.equal(C.getStep(course, 'pro-1.1').deck, false, 'with no deck file it gets the placeholder, and the checker says so');
  assert.ok(C.deckProblems('pro', 'number-quest').includes('pro-1.1: no deck at course/pro/1.1.json'), 'which is why a unit lifts its flag only in the change that brings its decks');
  assert.equal(C.getStep(course, 'pro-7.1'), null);
  // All seven lifted and the line open: the tier is open.
  cat = structuredClone(T.catalogue());
  for (const u of cat.units) if (u.tier === 'pro') delete u.planned;
  T.setCatalogueForTests(cat); C.reload();
  assert.equal(T.statusOf('pro'), 'open'); assert.deepEqual(T.openTiers(), ['launchpad', 'explorer', 'pro']);
  assert.deepEqual(C.steps(course, 'pro').map(s => s.key), PRO_KEYS);
  // And back: the file is what it was.
  restore();
  assert.equal(T.statusOf('pro'), 'building'); assert.deepEqual(C.steps(course, 'pro').map(s => s.key), ['pro-0.1']);
  // The data never does this by accident: an open tier has no planned unit.
  for (const [tier, line] of Object.entries(UNITS.tiers)) if (line.status === 'open') assert.deepEqual(UNITS.units.filter(u => u.tier === tier && u.planned), [], `${tier} is open, so nothing in it is planned`);
});

// ------------------------------------------------------------------------------------------------- who sees Pro
test('nobody but the platform admin sees Pro: no band, street, step, API, start node, test-out or word on a public page', async () => {
  const kid = newKid(), cookie = cookieFor(kid.id), pc = cookieFor(parent.id);
  for (const who of [null, kid, parent]) {
    assert.deepEqual(C.bandsFor(course, who), ['launchpad', 'explorer']);
    assert.equal(C.bandVisible(who, course, 'pro'), false);
    assert.equal(C.stepFor(who, course, 'pro-0.1'), null); assert.equal(C.stateOf(who, course, 'pro-0.1'), null);
    const cat = C.numberQuestCatalogue(who);
    assert.deepEqual(cat.tiers.map(t => t.key), ['launchpad', 'explorer']);
    assert.ok(cat.units.every(u => u.tier !== 'pro')); assert.deepEqual(cat.planned, [], 'the planned units are not in a non-admin\'s catalogue at all');
    assert.deepEqual(nqFacts(cat).grades, 'K–5');
  }
  assert.equal(C.setBand(kid, course, 'pro'), false); assert.equal(C.getBand(kid, course), null);
  // Pages: the path (also asked for by name), the step, the planned steps.
  const TOWERS = /The Towers|Welcome to the Towers|Great Clock|Ratio Gear|Mixing Tower|street-pro|band-pro|nqp-planned|Planned units|pro-0\.1|grades K–8, mapped|6–8<\/span>/;
  for (const [path, c] of [['/courses/number-quest', null], ['/courses/number-quest', cookie], ['/courses/number-quest?street=pro', null], ['/courses/number-quest?street=pro', cookie], ['/courses/number-quest?street=pro', pc],
    ['/teachers/number-quest', null], ['/teachers/number-quest', cookie], ['/teachers/number-quest?print=1', null], ['/number-quest/sorting-game', cookie]]) {
    const r = await get(path, c);
    assert.equal(r.status, 200, path);
    assert.doesNotMatch(r.text.replace(/<script[\s\S]*?<\/script>/g, ''), TOWERS, `${path}: nothing of the Pro street`);
  }
  assert.match((await get('/courses/number-quest?street=pro', cookie)).text, /aria-label="The Numberworks street, Explorer"/, 'asking for the Pro street shows the street the learner would see anyway');
  for (const key of ['pro-0.1', 'pro-1.1', 'pro-7.4']) {
    assert.equal((await get(`/courses/number-quest/${key}`, cookie)).status, 404, `${key}: a learner`);
    assert.equal((await get(`/courses/number-quest/${key}`)).status, 404, `${key}: a visitor`);
    assert.equal((await get(`/courses/number-quest/${key}`, pc)).status, 404, `${key}: a parent`);
    for (const api of ['read', 'check', 'answer', 'complete']) assert.equal((await post(`/api/courses/number-quest/${key}/${api}`, cookie, {})).status, 404, `${key} ${api}`);
  }
  assert.doesNotMatch((await get('/courses/number-quest/pro-0.1', cookie)).text, /Welcome to the Towers|Great Clock/);
  assert.equal((await post('/courses/number-quest/band', cookie, { band: 'pro' }, 'application/x-www-form-urlencoded')).status, 303);
  assert.equal(q.get('SELECT band FROM course_bands WHERE user_id=? AND course=?', kid.id, 'number-quest'), undefined, 'the band post stored nothing');
  assert.equal(q.get('SELECT COUNT(*) n FROM course_progress WHERE user_id=? AND step LIKE ?', kid.id, 'pro-%').n, 0);
  // The voice reads nothing of a Pro slide to a learner.
  assert.equal((await post('/api/tts', cookie, { ctx: 'course', course: 'number-quest', step: 'pro-0.1', i: 0 })).status, 404);
  // Placement: no Pro start, no Pro override, no Pro test-out; the placement API names no Pro street.
  assert.equal((await post('/api/number-quest/testout/start', cookie, { unit: 1, tier: 'pro' })).status, 400);
  assert.equal((await post('/api/number-quest/testout/start', cookie, { unit: 0, tier: 'pro' })).status, 400);
  const api = await get('/api/number-quest/placement', cookie);
  assert.deepEqual(Object.keys(JSON.parse(api.text).testedOutByTier), ['launchpad', 'explorer']);
  // Nothing learner-facing says "Pro" about Number Quest: the course strings still describe two streets, K to 5.
  const en = JSON.parse(fs.readFileSync(new URL('../../server/i18n/locales/en.json', import.meta.url), 'utf8'));
  const nqStrings = JSON.stringify([en.teachers.nq, en.courses.numberQuest]);
  assert.doesNotMatch(nqStrings, /The Towers|Great Clock|Gear\b|grade 8|K–8|three streets|Welcome to the Towers/);
  // The one sentence that has always named the tier (the map's lock note, on the teacher page since the Launchpad opening) is still the only one.
  assert.deepEqual(nqStrings.match(/[^.]*\bPro\b[^.]*\./g).map(x => x.trim()), ['The Pro tier (grades 6–8) is specced but not built yet, and its codes are not cited here until its own lock lands.']);
});

test('the platform admin previews a sensible Pro street: the welcome opens, the seven units are listed as planned, nothing is broken', async () => {
  const cookie = cookieFor(admin.id);
  assert.deepEqual(C.bandsFor(course, admin), ['launchpad', 'explorer', 'pro']);
  const clean = text => text.replace(/<script[\s\S]*?<\/script>/g, '');
  // The path home still opens on the Explorer street, with Pro in the switcher, marked as being built.
  const home = await get('/courses/number-quest', cookie);
  assert.equal(home.status, 200);
  assert.match(home.text, /aria-label="The Numberworks street, Explorer"/);
  assert.match(home.text, /id="street-pro"[^>]*>[\s\S]*?<b>Pro<\/b> <span class="nqp-street-g">Grades 6–8<\/span> <span class="nqp-street-b">being built<\/span>/);
  assert.doesNotMatch(home.text, /id="nqp-planned"/, 'the Explorer street has nothing planned');
  // The Pro street.
  const street = await get('/courses/number-quest?street=pro', cookie);
  assert.equal(street.status, 200);
  assert.doesNotMatch(clean(street.text), /undefined|NaN|\[object Object\]/);
  assert.match(street.text, /aria-label="The Numberworks street, Pro"/);
  assert.match(street.text, /Welcome to the Towers/); assert.match(street.text, /Start here: meet Tally in The Towers\./);
  assert.match(street.text, /href="\/courses\/number-quest\/pro-0\.1"/, 'the welcome is a door');
  assert.doesNotMatch(street.text, /id="step-explorer-|id="step-launchpad-/, 'a street renders only its own units');
  assert.match(street.text, /id="nqp-planned"/);
  assert.match(street.text, /Planned for Pro: 7 units not built yet/);
  assert.match(street.text, /Admin preview\. These units are reserved in the catalogue/);
  for (const [u, title, gear] of [[1, 'The Mixing Tower', 'Ratio Gear'], [2, 'The Cold Store', 'Zero Gear'], [3, 'The Machine Hall', 'Variable Gear'], [4, 'The Map Room', 'Scale Gear'], [5, 'The Sky Wires', 'Slope Gear'], [6, 'The Drafting Keep', 'Angle Gear'], [7, 'The Test Range', 'Chance Gear']]) {
    assert.match(street.text, new RegExp(`id="planned-unit-${u}"[\\s\\S]*?Unit ${u} · ${title}[\\s\\S]*?${gear}`), `Unit ${u}`);
  }
  assert.equal((street.text.match(/class="nqp-step nqp-step-planned"/g) || []).length, 22, 'all 22 planned steps are listed');
  assert.match(street.text, /id="planned-pro-7\.4"[\s\S]*?The Great Clock/);
  for (const key of PRO_KEYS.slice(1)) assert.doesNotMatch(street.text, new RegExp(`href="/courses/number-quest/${key.replace('.', '\\.')}"`), `${key} is not a door`);
  assert.match(street.text, /1 steps? done|0 of 1|of 1/, 'the street counts its one built step');
  // The welcome step: the deck, its two diagrams, its check, read-aloud lines in words.
  const step = await get('/courses/number-quest/pro-0.1', cookie);
  assert.equal(step.status, 200);
  assert.doesNotMatch(clean(step.text), /undefined|NaN|\[object Object\]/);
  for (const re of [/Welcome to the Towers/, /Above the Workshops/, /The clock has stopped/, /Numbers that move together/, /Numbers below zero/, /How a tower works/, /Words to know/, /Your mission/, /Oats and milk in one mix/, /A sample warming from below zero/]) assert.match(step.text, re);
  assert.match(step.text, /The Cold Store keeps a sample at −5°C\./, 'printed with the true minus sign');
  assert.match(step.text, /data-say="[^"]*a sample at negative 5 degrees Celsius\. Warm it by 8 degrees[^"]*"/, 'and handed to the voice in words');
  assert.equal((step.text.match(/class="slide slide--/g) || []).length, 7);
  assert.equal((step.text.match(/<svg[^>]*class="vf-svg/g) || []).length, 2, 'two drawn diagrams');
  // A planned step is a 404 for the admin too: there is nothing to open.
  for (const key of ['pro-1.1', 'pro-7.4']) assert.equal((await get(`/courses/number-quest/${key}`, cookie)).status, 404, key);
  // The admin can walk the welcome like any step: the check passes and is recorded under the Pro band.
  const s = C.getStep(course, 'pro-0.1');
  const chk = await post('/api/courses/number-quest/pro-0.1/check', cookie, { answers: Object.fromEntries(s.check.map(id => [id, C.item(id).answer])) });
  assert.equal(chk.status, 200); assert.equal(chk.json.passed, true); assert.equal(chk.json.score, 3);
  assert.deepEqual(q.get('SELECT step, band FROM course_progress WHERE user_id=? AND course=? AND step=?', admin.id, 'number-quest', 'pro-0.1'), { step: 'pro-0.1', band: 'pro' });
  // The teacher page, for the admin: the Pro welcome among the units, and the planned units in their own section.
  const teach = await get('/teachers/number-quest', cookie);
  assert.equal(teach.status, 200);
  assert.doesNotMatch(clean(teach.text), /undefined|NaN|\[object Object\]/);
  assert.match(teach.text, /Pro · Welcome to the Towers/);
  assert.match(teach.text, /id="planned"[\s\S]*?Planned units \(admin preview\)[\s\S]*?These 7 units are reserved in the catalogue and not built yet/);
  const plannedHtml = teach.text.slice(teach.text.indexOf('id="planned"'), teach.text.indexOf('id="notes"'));
  assert.match(plannedHtml, /Pro · Unit 1 · The Mixing Tower — Ratio Gear/); assert.match(plannedHtml, /Pro · Unit 7 · The Test Range — Chance Gear/);
  assert.match(plannedHtml, /title="Understand the concept of a ratio[^"]*"[^>]*>6\.RP\.A\.1</, 'a planned step shows its locked codes, with the published statement');
  assert.match(plannedHtml, /8\.F\.B\.4/); assert.match(plannedHtml, /The Great Clock/);
  assert.equal((plannedHtml.match(/class="csq-map-unit"/g) || []).length, 7);
  const mapHtml = teach.text.slice(teach.text.indexOf('id="map"'), teach.text.indexOf('id="planned"'));
  assert.doesNotMatch(mapHtml, /The Mixing Tower|6\.RP\.A\.1/, 'the published map holds built steps only');
  assert.equal((await get('/teachers/number-quest?print=1', cookie)).status, 200);
  const cat = C.numberQuestCatalogue(admin);
  assert.deepEqual(cat.planned.map(u => u.n), [1, 2, 3, 4, 5, 6, 7]); assert.equal(cat.units.filter(u => u.tier === 'pro').length, 1);
});

// ------------------------------------------------------------------------------------------------- placement
test('placement is unchanged while Pro is building: all 88,434 possible sets of rungs start where they start on main', () => {
  assert.deepEqual(crosswalkHash(P), MAIN);
  // Said out loud for the learners the Pro line is about: strong today means the Explorer finale door, today.
  for (const r of [all(4), all(5.5), all(6), all(8), rungs(8, 8, 8, 5), rungs(7, 8, 7.5, 7.5)]) {
    assert.deepEqual(P.crosswalk(r), { node: 'explorer-7.4', tier: 'explorer', launchpadGap: false, finaleDoor: true }, JSON.stringify(r));
  }
  assert.equal(P.beginningNode(6), 'explorer-7.1'); assert.equal(P.beginningNode(8), 'explorer-7.1');
  // A whole game for an eighth grader who gets everything right, with the rebuilt rung 6-8 bank: the Vault door.
  const state = P.createRunState({ grade: 8, seed: 'strong-today' });
  let served = 0;
  for (let g = 0; g < 40 && !P.runFinished(state); g++) { const it = P.serveNext(state); if (!it) break; served++; assert.ok(TEMPLATES.find(t => t.id === it.templateId).rung >= 7, 'the run is dealt from the rebuilt rungs'); P.recordAnswer(state, it.strand, true); }
  const fin = P.finishRun(state);
  assert.ok(served >= 8);
  assert.deepEqual(fin.rungs, all(8)); assert.equal(fin.startNode, 'explorer-7.4'); assert.equal(fin.tier, 'explorer'); assert.equal(fin.finaleDoor, true);
  assert.match(fin.note.placedUnit, /^Past Unit 7: every strand pointed beyond the Explorer street's workshops\./);
  // The constants are the lock's.
  assert.equal(P.PRO_LINE, 5.5); assert.equal(P.PRO_LINE, PLACE.crosswalk.proLine); assert.ok(P.PRO_LINE > P.EXPLORER_LINE);
});

test('Pro forced open: the walk follows the seven profiles, and a learner enters only with every strand at rung 5.5 or over', () => {
  forceProOpen();
  assert.deepEqual(P.proEntry(), { name: 'Pro', line: 5.5, units: 7, welcome: 'Welcome to the Towers', finale: 'The Great Clock' });
  const at = (node, extra = {}) => ({ node, tier: 'pro', launchpadGap: false, finaleDoor: false, ...extra });
  const vault = { node: 'explorer-7.4', tier: 'explorer', launchpadGap: false, finaleDoor: true };
  // The profiles, as placement.json records them (Number / Algebra / Shape / Data).
  assert.deepEqual(P.crosswalk(all(5.5)), at('pro-0.1'), 'on the line everywhere, under the first profile (Algebra 6.0): the Pro welcome');
  assert.deepEqual(P.crosswalk(rungs(5.5, 6, 5.5, 5.5)), at('pro-2.1'), 'Unit 1 met (5.5 / 6 / 5.5 / 5.5): Unit 2 asks Number 7');
  assert.deepEqual(P.crosswalk(rungs(6.5, 8, 8, 8)), at('pro-2.1'), 'a near-miss on one strand resolves to the lower unit');
  assert.deepEqual(P.crosswalk(rungs(7, 6, 5.5, 5.5)), at('pro-3.1'), 'Unit 3 asks Algebra 6.5');
  assert.deepEqual(P.crosswalk(rungs(7, 6.5, 5.5, 5.5)), at('pro-4.1'), 'Unit 4 asks Algebra 7');
  assert.deepEqual(P.crosswalk(rungs(7, 7, 5.5, 5.5)), at('pro-5.1'), 'Unit 5 asks Algebra 8');
  assert.deepEqual(P.crosswalk(rungs(7, 7.5, 8, 8)), at('pro-5.1'));
  assert.deepEqual(P.crosswalk(rungs(7, 8, 5.5, 5.5)), at('pro-6.1'), 'Unit 6 asks Shape & Measure 7.5');
  assert.deepEqual(P.crosswalk(rungs(8, 8, 7, 8)), at('pro-6.1'));
  assert.deepEqual(P.crosswalk(rungs(7, 8, 7.5, 5.5)), at('pro-7.1'), 'Unit 7 asks Data & Chance 7.5');
  assert.deepEqual(P.crosswalk(rungs(7, 8, 7.5, 7.5)), at('pro-7.4', { finaleDoor: true }), 'every profile met: the Great Clock door');
  assert.deepEqual(P.crosswalk(all(8)), at('pro-7.4', { finaleDoor: true }));
  // The Pro starting line: ANY strand under 5.5 keeps the learner on the Explorer finale door, as today.
  assert.deepEqual(P.crosswalk(all(4)), vault, 'a strong fourth grader: every Explorer profile met, nothing near 5.5');
  assert.deepEqual(P.crosswalk(all(5)), vault);
  for (const weak of ['number', 'algebra', 'shape-measure', 'data-chance']) {
    assert.deepEqual(P.crosswalk({ ...all(8), [weak]: 5 }), vault, `${weak} at 5.0 with everything else at 8.0: not walked into Pro`);
    assert.deepEqual(P.crosswalk({ ...all(8), [weak]: 4 }), vault);
    assert.equal(P.crosswalk({ ...all(8), [weak]: 5.5 }).tier, 'pro', `${weak} on the line with everything else at 8.0: Pro`);
  }
  // Under Explorer's own profiles nothing changes at all, and the gardens are untouched.
  assert.deepEqual(P.crosswalk(all(3)), { node: 'explorer-2.1', tier: 'explorer', launchpadGap: false, finaleDoor: false });
  assert.deepEqual(P.crosswalk(rungs(8, 8, 8, 2.5)), { node: 'explorer-4.1', tier: 'explorer', launchpadGap: false, finaleDoor: false }, 'an unmet Explorer profile wins over three strands at 8.0');
  assert.deepEqual(P.crosswalk(rungs(8, 8, 8, 3)), { node: 'explorer-7.1', tier: 'explorer', launchpadGap: false, finaleDoor: false });
  assert.equal(P.crosswalk(rungs(0.5, 3, 3, 3)).tier, 'launchpad');
  // Every set of rungs: Pro is entered exactly when all four strands are at 5.5 or over (and then only Pro nodes).
  const R = Array.from({ length: 17 }, (_, i) => i / 2);
  let inPro = 0;
  for (const nn of R) for (const a of R) for (const s of R) for (const d of R) {
    const c = P.crosswalk(rungs(nn, a, s, d)), over = Math.min(nn, a, s, d) >= 5.5;
    if ((c.tier === 'pro') !== over) assert.fail(`${nn}/${a}/${s}/${d} -> ${c.node}`);
    if (over) inPro++;
  }
  assert.equal(inPro, 6 ** 4, 'six rungs from 5.5 to 8.0 in each of four strands');
  // The short K-2 form (no Algebra staircase; Number stands in) is read the same way.
  assert.deepEqual(P.crosswalk({ number: 5.5, 'shape-measure': 5.5, 'data-chance': 5.5 }), at('pro-0.1'));
  assert.deepEqual(P.crosswalk({ number: 5.5, 'shape-measure': 5, 'data-chance': 8 }), vault);
  // Just Play, the nameable nodes, the words.
  assert.deepEqual([5, 6, 7, 8].map(g => P.beginningNode(g)), ['explorer-1.1', 'pro-0.1', 'pro-0.1', 'pro-0.1']);
  assert.deepEqual(P.startNodes().filter(x => x.tier === 'pro').map(x => x.node), ['pro-0.1', 'pro-1.1', 'pro-2.1', 'pro-3.1', 'pro-4.1', 'pro-5.1', 'pro-6.1', 'pro-7.1', 'pro-7.4']);
  assert.equal(P.placedUnitWords('pro-2.1'), 'Pro · Unit 2: The Cold Store'); assert.equal(P.placedUnitWords('pro-0.1'), 'Pro · Welcome to the Towers');
  assert.match(P.finaleWords('pro-7.4'), /every strand pointed beyond the Pro street's workshops\. The start is The Great Clock/);
  // A whole game for an eighth grader who gets everything right now lands on the Great Clock; one who is right only to rung 5.0 on the Vault.
  const play = (grade, ability) => { const st = P.createRunState({ grade, seed: `open-${grade}-${ability}` }); for (let g = 0; g < 40 && !P.runFinished(st); g++) { const it = P.serveNext(st); if (!it) break; P.recordAnswer(st, it.strand, TEMPLATES.find(t => t.id === it.templateId).rung <= ability); } return P.finishRun(st); };
  const top = play(8, 8);
  assert.equal(top.startNode, 'pro-7.4'); assert.equal(top.tier, 'pro'); assert.equal(top.workshop, 'The Great Clock'); assert.equal(top.finaleDoor, true);
  assert.equal(play(6, 5).tier, 'explorer');
  // Test-outs deal at the unit's own profile rungs, from the rebuilt bank.
  const items = P.testOutItems(5, 'fixed', 'pro');
  assert.equal(items.length, 5);
  assert.deepEqual(items.map(i => [i.strand, TEMPLATES.find(t => t.id === i.templateId).rung]), [['algebra', 8], ['data-chance', 5.5], ['number', 7], ['shape-measure', 5.5], ['number', 7]], 'one item a strand at Unit 5\'s profile (7 / 8 / 5.5 / 5.5), and a second Number item');
  assert.deepEqual(P.testOutItems(0, 'fixed', 'pro'), [], 'the welcome has no profile and no test-out');
  for (const i of items) { const full = generateItem(TEMPLATES.find(t => t.id === i.templateId), i.itemSeed); assert.equal(P.gradeServed(i.templateId, i.itemSeed, full.responseType === 'pick' ? { choice: full.answerIndex } : { value: String(full.answer) }).correct, true); }
});

test('existing learners are never moved: not by Pro being declared, and not by Pro opening', async () => {
  // Three learners as they are today: a strong one on the Vault door with every rung at 8.0, one mid-street, one in the gardens.
  const strong = newKid(), mid = newKid(), small = newKid();
  q.run('INSERT INTO nq_placement(user_id, course, grade, grade_declared_at, rungs, start_node, source, start_fails, soft_land_node, updated_at) VALUES (?,?,?,?,?,?,?,0,NULL,?)', strong.id, 'number-quest', 8, 1700000000000, JSON.stringify(all(8)), 'explorer-7.4', 'sorting-game', 1700000000000);
  C.setBand(strong, course, 'explorer'); finish(strong, 'explorer-0.1'); finish(strong, 'explorer-7.4'); NQ.completeLap(strong, course, 'explorer', 7, 1);
  P.overrideStartNode(mid, 'explorer-3.1'); C.setBand(mid, course, 'explorer'); finish(mid, 'explorer-3.1');
  P.placeAtBeginning(small, 1); C.setBand(small, course, 'launchpad'); finish(small, 'launchpad-0.1');
  const kids = [strong, mid, small], before = kids.map(snapshot);
  const readEverything = async () => { for (const k of kids) { const c = cookieFor(k.id); await get('/courses/number-quest', c); await get('/api/number-quest/placement', c); await get('/number-quest/sorting-game', c); P.getPlacement(k); C.overview(k, course); } };
  // 1. With the data as it ships (Pro building): reading every page changes nothing.
  await readEverything();
  assert.deepEqual(kids.map(snapshot), before, 'Pro being declared wrote nothing');
  assert.equal(P.getPlacement(strong).startNode, 'explorer-7.4');
  assert.match((await get('/courses/number-quest', cookieFor(strong.id))).text, /aria-label="The Numberworks street, Explorer"/);
  // 2. With Pro open: the same rungs would now start a NEW learner on the Great Clock door, and this one is left alone.
  forceProOpen();
  assert.equal(P.crosswalk(all(8)).node, 'pro-7.4', 'a new run with these rungs would land in Pro');
  await readEverything();
  assert.deepEqual(kids.map(snapshot), before, 'Pro opening wrote nothing: no migration, no backfill, no move');
  assert.equal(P.getPlacement(strong).startNode, 'explorer-7.4'); assert.equal(C.getBand(strong, course), 'explorer');
  assert.equal(P.getPlacement(mid).startNode, 'explorer-3.1'); assert.equal(P.getPlacement(small).startNode, 'launchpad-0.1'); assert.equal(C.getBand(small, course), 'launchpad');
  const home = await get('/courses/number-quest', cookieFor(strong.id));
  assert.match(home.text, /aria-label="The Numberworks street, Explorer"/, 'their street is still their street');
  assert.match(home.text, /Tally placed your start at <b lang="en" dir="ltr">The Vault of Measures<\/b>/);
  assert.match(home.text, /id="street-pro"/, 'the new street is offered in the switcher, and walking on to it is the learner\'s choice');
  assert.equal(C.overview(strong, course, 'explorer').done, 2);
  // Only the learner's own choice (the band), a retake they confirm, or a grown-up's override moves them.
  assert.equal(C.setBand(strong, course, 'pro'), true);
  assert.equal(P.getPlacement(strong).startNode, 'explorer-7.4', 'choosing the street does not rewrite the start');
  assert.equal(P.overrideStartNode(mid, 'pro-2.1').startNode, 'pro-2.1', 'a grown-up may place a learner on any open door');
  restore();
  // 3. And closed again (as it ships): the learner who chose Pro reads as having no band; their rows are still there.
  assert.equal(C.getBand(strong, course), null);
  assert.equal(q.get('SELECT band FROM course_bands WHERE user_id=? AND course=?', strong.id, 'number-quest').band, 'pro', 'nothing is deleted');
  assert.equal(P.getPlacement(strong).startNode, 'explorer-7.4');
});

// ------------------------------------------------------------------------------------------------- copy from data
test('the teacher page\'s placement copy is made from the data: two streets today, the third the moment it opens', async () => {
  // Today: not a word about a third street, in the function, the matrix, the explainer or the page.
  assert.deepEqual(proPlacementWords(), { landing: '', walk: '', justPlay: '', finaleIf: '' });
  const today = String(placementSection()); // the explainer, with the matrix inside it
  assert.ok(today.includes(String(placementMatrix())));
  assert.doesNotMatch(today, /Pro street|Pro welcome|Pro starting line|Great Clock|rung 5\.5 or over/);
  assert.match(today, /or the Vault of Measures door \(the finale\) when all seven are met\. A rung that lands under the Explorer starting line starts in the Launchpad gardens instead<\/td>/);
  assert.match(today, /and with grade 3 to 5 at Explorer Unit 1\. If every strand points past Explorer Unit 7, the start is the Vault of Measures/);
  const page = await get('/teachers/number-quest');
  assert.doesNotMatch(page.text, /Pro street|Pro starting line|Great Clock/);
  // Open: the same functions name the street, its line, its welcome, its finale and its unit count, all from the catalogue.
  forceProOpen();
  const w = proPlacementWords();
  assert.equal(w.landing, '. With every strand at rung 5.5 or over and all seven Explorer profiles met, the start is on the Pro street instead: Welcome to the Towers when its first entry profile is not met, else the first Pro unit (1–7) whose entry profile is not fully met, or The Great Clock (its finale door) when all 7 are met');
  assert.equal(w.justPlay, ', and with grade 6 to 8 at the Pro welcome'); assert.equal(w.finaleIf, ' with any strand under rung 5.5');
  const open = String(placementSection());
  assert.equal((open.match(/the start is on the Pro street instead/g) || []).length, 6, 'the six rows of grades 3 to 8');
  assert.match(open, /and with grade 3 to 5 at Explorer Unit 1, and with grade 6 to 8 at the Pro welcome\. A learner who meets every Explorer profile and has every strand at rung 5\.5 or over \(the Pro starting line\) starts on the Pro street the same way/);
  assert.match(open, /If every strand points past Explorer Unit 7 with any strand under rung 5\.5, the start is the Vault of Measures/);
  // The counts follow too (they always did): three streets, K to 8.
  const facts = nqFacts(C.numberQuestCatalogue());
  assert.deepEqual({ streets: facts.streets, units: facts.units, steps: facts.steps, grades: facts.grades }, { streets: 3, units: 21, steps: 69, grades: 'K–8' });
  const opened = await get('/teachers/number-quest');
  assert.equal(opened.status, 200); assert.match(opened.text, />3 streets · 21 units</); assert.match(opened.text, /Pro · Unit 1 · The Mixing Tower/);
  assert.doesNotMatch(opened.text, /Planned units \(admin preview\)/, 'nothing is planned once every unit is built');
  // A learner on the open street sees a path, not an error (the decks are placeholders in this test).
  const kid = newKid();
  const street = await get('/courses/number-quest?street=pro', cookieFor(kid.id));
  assert.equal(street.status, 200); assert.match(street.text, /aria-label="The Numberworks street, Pro"/); assert.match(street.text, /id="step-pro-7\.4"/);
  assert.doesNotMatch(street.text.replace(/<script[\s\S]*?<\/script>/g, ''), /undefined|NaN|nqp-planned/);
});

test('for everyone who is not the admin, every Number Quest page is byte for byte the page of a course with no Pro tier in it', async () => {
  const kid = newKid(), kc = cookieFor(kid.id), pc = cookieFor(parent.id);
  C.setBand(kid, course, 'explorer');
  const PAGES = [['/courses/number-quest', null], ['/courses/number-quest?street=launchpad', null], ['/courses/number-quest?street=pro', null], ['/courses/number-quest', kc], ['/courses/number-quest?street=launchpad', kc],
    ['/courses/number-quest?street=pro', kc], ['/courses/number-quest?street=launchpad', pc], ['/teachers/number-quest', null], ['/teachers/number-quest', kc], ['/teachers/number-quest?print=1', null],
    ['/number-quest/sorting-game', kc], ['/courses/number-quest/explorer-0.1', kc], ['/courses/number-quest/launchpad-0.1', kc], ['/courses/number-quest/explorer-1.1', kc], ['/courses/number-quest/pro-0.1', kc], ['/courses/number-quest/pro-0.1', null], ['/teachers', null]];
  // What differs between any two requests for one page (a per-request nonce) is set aside; nothing else is.
  const norm = t => t.replace(/nonce="[^"]*"/g, 'nonce=""');
  // The quick check shuffles its choices for each request, so a step page is compared without its check form.
  const stable = (path, t) => (/\/(explorer|launchpad)-\d\.\d$/.test(path) ? norm(t).replace(/<form class="qcheck"[\s\S]*?<\/form>/, '').replace(/<script[^>]*type="application\/json"[\s\S]*?<\/script>/g, '') : norm(t));
  const grab = async () => { const out = []; for (const [path, c] of PAGES) { const r = await get(path, c); out.push([path, r.status, stable(path, r.text)]); } return out; };
  const withPro = await grab();
  for (const [i, x] of (await grab()).entries()) assert.ok(x[2] === withPro[i][2], `${x[0]}: the page is stable from one request to the next`);
  // The same course with the Pro tier taken out of the catalogue altogether: its line and all eight of its units.
  const cat = structuredClone(T.catalogue());
  delete cat.tiers.pro; cat.units = cat.units.filter(u => u.tier !== 'pro');
  T.setCatalogueForTests(cat); C.reload();
  assert.deepEqual(T.existingTiers(), ['launchpad', 'explorer']); assert.equal(T.exists('pro'), false);
  const without = await grab();
  restore();
  for (const [i, [path, status, text]] of withPro.entries()) {
    assert.equal(status, without[i][1], `${path}: the same status`);
    assert.ok(text === without[i][2], `${path}: the page is identical with and without the Pro tier in the catalogue (${text.length} and ${without[i][2].length} characters)`);
  }
  assert.deepEqual(withPro.map(x => x[1]), [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 302, 404, 404, 200], 'the pages open (a locked step redirects to the map), and the Pro welcome is a 404');
  // The one piece of copy this build rewired to read the tiers from the data is, today, exactly the text main rendered.
  const { createHash } = await import('node:crypto');
  assert.equal(createHash('sha256').update(String(placementSection())).digest('hex'), '20324454343ee4e778f39d914495e9374bd3bf3cc8a677e92a61f2225bc92e53', 'the placement explainer and its K-8 matrix are character for character what main rendered (9edb96e7); re-pin only when that copy is changed on purpose');
});

// ------------------------------------------------------------------------------------------------- the written record
test('the README\'s Pro section says what the data says: units, steps, codes, gaps, bank cells, profiles, and what a unit PR touches', () => {
  const readme = fs.readFileSync(new URL('../../seed-lessons/number-quest/README.md', import.meta.url), 'utf8');
  const at = readme.indexOf('## Pro tier (The Towers)');
  assert.ok(at > 0, 'the README has its Pro tier section');
  const sec = readme.slice(at);
  const reg = JSON.parse(fs.readFileSync(new URL('../../seed-lessons/number-quest/standards.json', import.meta.url), 'utf8'));
  const pro = UNITS.units.filter(u => u.tier === 'pro');
  for (const u of pro.filter(x => x.planned)) {
    assert.ok(sec.includes(`| ${u.n} | ${u.title} | ${u.stamp} | \`${u.reserved.game}\` | ${u.reserved.world} |`), `Unit ${u.n}'s row`);
  }
  for (const u of pro) for (const s of u.steps) {
    const st = s.standards.pro;
    assert.ok(sec.includes(`| ${s.n} | ${s.titles.pro} | ${s.order} | ${st.primary.join(', ') || '(framing)'} | ${st.also.join(', ') || '—'} | ${s.mp} |`), `step ${s.n}'s row is the catalogue's`);
  }
  for (const g of reg.proCoverage.notCovered) { assert.ok(sec.includes(g.topic), g.topic); for (const code of Object.keys(g.codes)) assert.ok(sec.includes(code), `the gap ${code} is listed`); }
  assert.match(sec, /cite 62\. The other 19 are recorded/);
  // The bank's cells and counts.
  const proBank = TEMPLATES.filter(t => t.rung >= 6), cells = s => [6, 6.5, 7, 7.5, 8].map(r => proBank.filter(t => t.strand === s && t.rung === r).length).join('/');
  assert.ok(sec.includes(`Number ${cells('number')}, Algebra ${cells('algebra')}, Shape ${cells('shape-measure')},\n  Data ${cells('data-chance')} at rungs 6.0/6.5/7.0/7.5/8.0`), 'the templates a cell are the bank\'s');
  assert.match(sec, /63 were \*\*retired\*\*/); assert.match(sec, /9 sound ones \*\*stay\*\*/); assert.match(sec, /77 are \*\*new\*\*: 76 from the 73 archetypes/);
  assert.match(readme, /266 item templates/); assert.equal(TEMPLATES.length, 266);
  // The profiles and the line.
  const prof = n => { const p = PLACE.crosswalk.entryProfiles[`pro-${n}.1`]; return `Unit ${n} ${[p.Number, p['Algebra & Patterns'], p['Shape & Measure'], p['Data & Chance']].join(' / ')}`; };
  for (const u of [1, 2, 3, 4, 5, 6, 7]) assert.ok(sec.replace(/\n/g, ' ').includes(prof(u)), prof(u));
  assert.match(sec, /every strand at rung \*\*5\.5\*\* or above/);
  // The rules and the contract are written down.
  for (const re of [/### What a unit PR touches \(the exact list\)/, /delete `"planned": true` and `"reserved"`/, /Do \*\*not\*\* touch: `tiers\.pro`, another unit, any `n`, `order`, `titles`, `shorts`, `mp` or `standards`/,
    /\*\*\{1, 2, 3\}\*\*, then \*\*\{4, 5\}\*\*, then \*\*\{6, 7\}\*\*/, /Percent contexts \(owner decision 3\)/, /No interest and no commission/, /Read-aloud is ON by default in Pro games \(owner decision 6/,
    /Nothing below rung 6 changed/, /Existing learners are never moved/, /### Opening the tier/]) assert.match(sec.replace(/\s*\n\s*/g, ' '), re);
  // Every file the contract names as shared exists.
  for (const f of ['scripts/seed.js', 'server/db.js', 'server/learn.js', 'server/services/course-catalog.js', 'server/standards/official-tags.js', 'server/services/tts-lines.js', 'scripts/nq-shots.js', 'public/img/nq/manifest.json',
    'tests/unit/course-mission-truth.test.js', 'tests/unit/number-quest-guided-focus.test.js', 'tests/unit/number-quest-standards-lock.test.js', 'tests/unit/number-quest-tiers.test.js', 'tests/unit/shelves.test.js', 'tests/unit/scanner.test.js',
    'tests/unit/vendor.test.js', 'tests/unit/tts-lines.test.js', 'tests/unit/number-quest-parity-repair.test.js']) {
    assert.ok(fs.existsSync(new URL(`../../${f}`, import.meta.url)), `${f} exists`);
    assert.ok(sec.includes(f.split('/').pop().replace('.test.js', '')), `the contract names ${f}`);
  }
  // The decisions log records the approval and the seven decisions.
  const dec = fs.readFileSync(new URL('../../docs/decisions.md', import.meta.url), 'utf8');
  const entry = dec.slice(dec.indexOf('## Number Quest Pro: foundations (14 Nov 2026)'));
  assert.ok(entry.length > 500, 'docs/decisions.md has the entry');
  assert.match(entry, /The owner approved the plan for the Pro tier \(grades 6 to 8\) today/);
  for (const k of [1, 2, 3, 4, 5, 6, 7]) assert.match(entry, new RegExp(`^${k}\\. \\*\\*`, 'm'), `decision ${k}`);
  for (const re of [/The Towers/, /The Great Clock/, /the major work of grades 6-8/, /No interest or commission anywhere/, /rung 5\.5 or above in every strand/, /8\.F\.B\.4, with 8\.F\.A\.1 and 8\.F\.A\.3/, /Read-aloud is on by default in Pro games/, /fourth chapter of the Unit 7 game/]) assert.match(entry, re);
});
