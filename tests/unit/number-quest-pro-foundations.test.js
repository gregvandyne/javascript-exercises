// Number Quest Pro (grades 6-8, The Towers): the tier's foundations. The plan is the owner's, approved on 2026-11-14,
// when the tier was declared "building"; it OPENED on 2026-11-15 (units.json tiers.pro.status "open"). What the
// building state meant is still pinned, through the test hook that reads the tier as "building"
// (T.setTierStatus('pro', 'building')) and through copies of the catalogue with a unit or the finale planned again;
// the open state is pinned with the data exactly as it ships (and in number-quest-pro-open.test.js). Pinned here:
//   - PLANNED UNITS: the seven Pro units and their 22 steps are reserved in the catalogue (`planned: true`) so they
//     can be built side by side. For the engine a planned unit is not in the tier: no steps, no doors, no start
//     node, no test-out, no standards tag, for anyone. Deleting the flag is what puts a unit on the street;
//     A built unit may also hold a reserved step (`planned` on the step), as Pro's finale, 7.4, was inside built Unit 7
//     until it was built. Every Pro unit and step is built now, so the planned-unit behaviour is pinned through a copy
//     with Unit 7 planned again, and the planned-step behaviour through a copy with the finale planned again;
//   - a tier with a planned unit is never open, whatever its status line says;
//   - while Pro is building (the hook), NOBODY BUT THE PLATFORM ADMIN sees it: not a visitor, a learner, a parent or
//     school staff; not as a band, a street, a step, an API, a start node, a test-out or a teacher-page row;
//   - the admin previews a sensible street: the welcome step opens, the seven planned units are listed as planned
//     (no doors), the teacher page shows them in their own section, and nothing reads "undefined";
//   - PLACEMENT IS UNCHANGED while Pro is building: every one of the 88,434 possible sets of placed rungs starts
//     exactly where it starts on main (a hash), the recorded Pro profiles and starting line are inert, and "Just
//     Play" for grades 6-8 still starts at Explorer Unit 7;
//   - with Pro OPEN (as it ships since 2026-11-15) the walk follows the
//     seven profiles, a learner enters only with every strand at rung 5.5 or over, and a strong fourth grader with
//     any strand under it still starts at the Explorer finale door;
//   - EXISTING LEARNERS ARE NEVER MOVED, building or open: nothing stored about them changes;
//   - the teacher page's placement copy is made from the data: unchanged while Pro is building, and it names the
//     third street now that it is open.
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
// Built so far: the welcome, Unit 1 (The Mixing Tower), Unit 2 (The Cold Store) and Unit 3 (The Machine Hall), 2026-11-14, and Unit 4
// (The Map Room), Unit 5 (The Sky Wires) and Unit 6 (The Drafting Keep), 2026-11-15, and Unit 7 (The Test Range) the same day,
// and its finale step, 7.4 The Great Clock, after it. No Pro unit and no Pro step is planned in the file now. REAL_*: the
// catalogue as the file holds it. The planned-unit behaviour is still exercised below, through a copy of the catalogue with
// Unit 7 put back to planned, as it was before its build (withUnit7Planned): FIX_* and BUILT_* are the tier seen through
// that copy. The planned-step behaviour (a reserved step inside a built unit) is exercised through a copy with the finale
// put back to planned, as it was between Unit 7 and the finale (withFinalePlanned).
const REAL_BUILT_KEYS = PRO_KEYS;
const FINALE_BUILT_KEYS = PRO_KEYS.filter(k => k !== 'pro-7.4');
const FIX_PLANNED = [7];
const BUILT_UNITS = [0, 1, 2, 3, 4, 5, 6];
const BUILT_KEYS = PRO_KEYS.filter(k => BUILT_UNITS.includes(+k[4])), PLANNED_KEYS = PRO_KEYS.filter(k => !BUILT_KEYS.includes(k));
/** FOR THIS FILE: the catalogue with Unit 7 planned again (its finale step's own flag folded into the unit's), loaded
 *  through the test hook; `then` lifts or plans other units in the same copy. restore() puts the file back. */
function withUnit7Planned(then) {
  const cat = structuredClone(UNITS);
  for (const u of cat.units) if (u.tier === 'pro' && u.n === 7) { u.planned = true; for (const s of u.steps) delete s.planned; }
  if (then) then(cat);
  T.setCatalogueForTests(cat); C.reload();
}
/** FOR THIS FILE: the catalogue with the finale step, 7.4, planned again inside built Unit 7 (its `planned`, its
 *  `reserved` params and no game, as it was before it was built), loaded through the test hook; `then` changes the copy
 *  further. restore() puts the file back. */
function withFinalePlanned(then) {
  const cat = structuredClone(UNITS);
  for (const u of cat.units) if (u.tier === 'pro' && u.n === 7) for (const st of u.steps) if (st.n === '7.4') { st.planned = true; st.reserved = { params: 'chapter=clock&lock=1' }; st.game = { pro: null }; }
  if (then) then(cat);
  T.setCatalogueForTests(cat); C.reload();
}
const UNIT_NAMES = [[6, 'The Drafting Keep', 'Angle Gear'], [7, 'The Test Range', 'Chance Gear']];
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
test('planned units: reserved in the catalogue, absent from the engine; the tier is its welcome step and its built units (Unit 7 planned again in a copy)', () => {
  withUnit7Planned();
  assert.equal(T.statusOf('pro'), 'building'); assert.equal(T.exists('pro'), true); assert.equal(T.isOpen('pro'), false);
  assert.deepEqual(T.unitsOf('pro').map(u => [u.n, u.title]), [[0, 'Welcome to the Towers'], [1, 'The Mixing Tower'], [2, 'The Cold Store'], [3, 'The Machine Hall'], [4, 'The Map Room'], [5, 'The Sky Wires'], [6, 'The Drafting Keep']]);
  assert.deepEqual(T.plannedUnitsOf('pro').map(u => [u.n, u.title, u.stamp]), [[7, 'The Test Range', 'Chance Gear']]);
  for (const tier of ['launchpad', 'explorer']) assert.deepEqual(T.plannedUnitsOf(tier), [], `${tier} has nothing planned: every unit is built`);
  assert.deepEqual(T.plannedUnitsOf('nowhere'), []); assert.equal(T.isPlanned(null), false); assert.equal(T.isPlanned({ planned: 'yes' }), false, 'only the literal true plans a unit');
  // The engine's view of the tier: the welcome and Unit 1's three steps, a first key; the finale the line names is not there yet.
  assert.deepEqual(T.stepsOf('pro').map(s => s.key), BUILT_KEYS);
  assert.equal(T.firstKey('pro'), 'pro-0.1'); assert.equal(T.tierInfo('pro').finale, '7.4');
  assert.deepEqual(C.steps(course, 'pro').map(s => [s.key, s.title, s.deck, s.game && `${s.game.slug} ${s.game.params}`, s.index]), [['pro-0.1', 'Welcome to the Towers', true, null, 0],
    ['pro-1.1', 'Ratios and equal mixes', true, 'lantern-mix chapter=mix&lock=1', 1], ['pro-1.2', 'Unit rates', true, 'lantern-mix chapter=rate&lock=1', 2], ['pro-1.3', 'Percent and changing units', true, 'lantern-mix chapter=percent&lock=1', 3],
    ['pro-2.1', 'Divide by a fraction', true, 'sub-zero chapter=pour&lock=1', 4], ['pro-2.2', 'Below zero: opposites and absolute value', true, 'sub-zero chapter=below&lock=1', 5], ['pro-2.3', 'Add, subtract, multiply and divide with negatives', true, 'sub-zero chapter=change&lock=1', 6],
    ['pro-3.1', 'Write and work out expressions', true, 'machine-line chapter=build&lock=1', 7], ['pro-3.2', 'Expressions that are equal', true, 'machine-line chapter=same&lock=1', 8], ['pro-3.3', 'Solve equations and inequalities', true, 'machine-line chapter=undo&lock=1', 9],
    ['pro-4.1', 'Is it proportional? Find the constant', true, 'scale-scout chapter=constant&lock=1', 10], ['pro-4.2', 'Scale drawings and maps', true, 'scale-scout chapter=scale&lock=1', 11], ['pro-4.3', 'Percent problems', true, 'scale-scout chapter=percent&lock=1', 12],
    ['pro-5.1', 'Slope: the steepness of a line', true, 'sky-lines chapter=slope&lock=1', 13], ['pro-5.2', 'y = mx + b: a line as a rule', true, 'sky-lines chapter=rule&lock=1', 14], ['pro-5.3', 'Solve linear equations and find where two lines meet', true, 'sky-lines chapter=meet&lock=1', 15],
    ['pro-6.1', 'Area, surface area and volume', true, 'keep-builder chapter=build&lock=1', 16], ['pro-6.2', 'Angles and moves: slide, flip, turn, resize', true, 'keep-builder chapter=move&lock=1', 17], ['pro-6.3', 'The Pythagorean theorem', true, 'keep-builder chapter=span&lock=1', 18]]);
  assert.deepEqual(C.groupsFor(course, 'pro').map(g => g.id), ['unit-0', 'unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5', 'unit-6']);
  for (const key of PLANNED_KEYS) {
    assert.equal(C.getStep(course, key), null, `${key}: planned, so no step`);
    assert.equal(C.stepFor(admin, course, key), null, `${key}: not even for the admin`);
    assert.equal(C.stateOf(admin, course, key), null);
  }
  // What a planned unit does carry: its reserved steps, in final order, with their titles and codes.
  const planned = T.plannedUnitsOf('pro').flatMap(u => T.plannedStepsOf(u));
  assert.deepEqual(planned.map(s => s.key), PLANNED_KEYS);
  assert.deepEqual(planned.map(s => s.order), PLANNED_KEYS.map(k => PRO_KEYS.indexOf(k) + 1), 'a planned step keeps its place among all 23: the welcome is 1, Unit 1 is 2 to 4, and so on to 23');
  assert.deepEqual(UNITS.units.filter(u => u.tier === 'pro' && !u.planned).flatMap(u => u.steps.filter(s => !s.planned).map(s => s.order)), REAL_BUILT_KEYS.map(k => PRO_KEYS.indexOf(k) + 1), 'a built unit keeps the order numbers reserved for it (in the file)');
  assert.deepEqual(UNITS.units.find(u => u.tier === 'pro' && u.n === 5).steps.map(s => s.order), [14, 15, 16], 'Unit 5 is 14 to 16, whether or not Unit 4 is built before it');
  assert.deepEqual(UNITS.units.find(u => u.tier === 'pro' && u.n === 6).steps.map(s => s.order), [17, 18, 19], 'Unit 6 is 17 to 19');
  assert.deepEqual(planned.filter(s => s.n.startsWith('7.')).map(s => [s.n, s.title, s.standards.primary]), [['7.1', 'Center and spread', ['6.SP.A.3', '6.SP.B.4', '6.SP.B.5']], ['7.2', 'Chance: experiments and models', ['7.SP.C.5', '7.SP.C.6', '7.SP.C.7']], ['7.3', 'Compare two data sets and spot a trend', ['7.SP.B.4', '8.SP.A.1']], ['7.4', 'The Great Clock', ['7.EE.B.3']]]);
  assert.equal(planned.at(-1).title, 'The Great Clock');
  assert.deepEqual(T.plannedStepsOf(null), []);
  // No play can be credited to a planned step, and none is a start node or a test-out, even for the admin. A built
  // unit's steps are credited (to the admin, the only one who can reach them while the tier is building).
  assert.deepEqual([...tags.numberQuestSteps().keys()].filter(k => k.startsWith('pro-')), REAL_BUILT_KEYS.slice(1), 'the standards tags read the file: its built steps, and never the reserved finale');
  assert.ok(!P.startNodes().some(x => x.tier === 'pro'));
  const stillPlanned = T.plannedUnitsOf('pro').map(u => u.n); assert.deepEqual(stillPlanned, FIX_PLANNED);
  for (const u of stillPlanned) { assert.equal(P.entryProfile('pro', u), null, `Pro Unit ${u}'s profile is on file and inert`); assert.deepEqual(P.testOutItems(u, 'seed', 'pro'), []); }
  assert.ok(PLACE.crosswalk.entryProfiles['pro-1.1'], 'though placement.json does record it');
  assert.equal(P.proEntry(), null, 'Pro is nobody\'s start while it is building');
  assert.equal(P.overrideStartNode(newKid(), 'pro-0.1'), null); assert.equal(P.overrideStartNode(newKid(), 'pro-1.1'), null);
  assert.equal(P.nodeInfo('pro-0.1').node, 'explorer-0.1', 'a Pro node names no workshop: it reads as the Explorer welcome');
  // Laps and progress have nothing to hold for a street nobody walks.
  assert.equal(C.overview(admin, course, 'pro').total, BUILT_KEYS.length);
  restore();
  // A built unit's reserved step (the finale planned again in a copy): left out of the unit exactly as a planned unit's steps.
  withFinalePlanned();
  assert.deepEqual(T.stepsOf('pro').map(s => s.key), FINALE_BUILT_KEYS);
  assert.deepEqual(T.plannedUnitsOf('pro').map(u => [u.n, u.partial === true, u.steps.map(s => s.n)]), [[7, true, ['7.4']]]);
  assert.deepEqual(T.plannedUnitsOf('pro').flatMap(u => T.plannedStepsOf(u)).map(s => [s.key, s.order, s.title]), [['pro-7.4', 23, 'The Great Clock']]);
  assert.equal(C.getStep(course, 'pro-7.1').game.slug, 'launch-lab'); assert.equal(C.getStep(course, 'pro-7.4'), null, 'a planned step is no step');
  assert.equal(C.stepFor(admin, course, 'pro-7.4'), null, 'not even for the admin');
  assert.equal(T.statusOf('pro'), 'building');
  restore();
  // The file itself: every Pro unit and step is built, the finale too; the tier is open by its status line (2026-11-15).
  assert.deepEqual(T.stepsOf('pro').map(s => s.key), REAL_BUILT_KEYS);
  assert.deepEqual(T.plannedUnitsOf('pro'), []);
  assert.equal(C.getStep(course, 'pro-7.1').game.slug, 'launch-lab'); assert.equal(C.getStep(course, 'pro-7.4').game.slug, 'launch-lab', 'the finale is built: Launch Lab\'s fourth chapter');
  assert.equal(C.getStep(course, 'pro-7.4').game.params, 'chapter=clock&lock=1'); assert.equal(C.getStep(course, 'pro-7.4').deck, true);
  assert.deepEqual(P.entryProfile('pro', 7), PLACE.crosswalk.entryProfiles['pro-7.1'], 'Unit 7 is built: its profile can be asked for'); assert.equal(P.testOutItems(7, 'seed', 'pro').length, 5, 'and it has its test-out items');
  assert.deepEqual(P.startNodes().filter(x => x.tier === 'pro').map(x => x.node), ['pro-0.1', 'pro-1.1', 'pro-2.1', 'pro-3.1', 'pro-4.1', 'pro-5.1', 'pro-6.1', 'pro-7.1', 'pro-7.4'], 'the street is open: its doors are start nodes');
  // Read as building again (the hook), the same built tier has no start node.
  T.setTierStatus('pro', 'building');
  assert.ok(!P.startNodes().some(x => x.tier === 'pro'));
});

test('all seven Pro units and the finale are built; no step is planned or reserved in Pro; the tier is open by its status line', () => {
  const pro = UNITS.units.filter(u => u.tier === 'pro' && u.n >= 1);
  assert.deepEqual(pro.map(u => u.n), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(UNITS.units.filter(u => u.planned === true), [], 'no unit of any tier is planned: all seven Pro units are built');
  for (const u of pro) { assert.ok(u.tool && u.steps.every(s => s.game.pro && s.game.pro.slug === u.tool), `Unit ${u.n}: its game on every step`); assert.equal(u.reserved, undefined); assert.equal(u.teacherNotes.length >= 3, true); }
  assert.deepEqual(UNITS.units.flatMap(u => u.steps.filter(s => s.planned !== undefined || s.reserved !== undefined).map(s => `${u.tier}-${s.n}`)), [], 'no step of any tier is planned or reserved');
  assert.equal(pro.find(u => u.n === 7).steps.find(s => s.n === '7.4').game.pro.params, 'chapter=clock&lock=1', 'the finale is Launch Lab\'s fourth chapter');
  assert.deepEqual(T.unitsOf('pro').map(u => u.n), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(T.plannedUnitsOf('pro'), []);
  assert.deepEqual(T.stepsOf('pro').map(s => s.key), REAL_BUILT_KEYS); assert.equal(REAL_BUILT_KEYS.length, 23);
  // Nothing is planned, and the status line is "open" (2026-11-15): the tier is open.
  assert.equal(UNITS.tiers.pro.status, 'open'); assert.equal(T.statusOf('pro'), 'open'); assert.equal(T.isOpen('pro'), true);
  assert.deepEqual(T.openTiers(), ['launchpad', 'explorer', 'pro']);
  // The status line still governs: read as "building" (the hook), the same built tier is closed.
  T.setTierStatus('pro', 'building');
  assert.equal(T.statusOf('pro'), 'building'); assert.deepEqual(T.openTiers(), ['launchpad', 'explorer']);
});

test('a tier with a planned unit is never open, whatever its status line says; lifting the flag is what builds a unit', () => {
  // The status line edited to "open" while a step is still planned: the engine refuses to read the tier as open.
  withFinalePlanned(c => { c.tiers.pro.status = 'open'; });
  assert.equal(T.statusOf('pro'), 'building', 'the finale is still to build');
  assert.deepEqual(T.openTiers(), ['launchpad', 'explorer']); assert.deepEqual(C.bandsFor(course, newKid()), ['launchpad', 'explorer']);
  assert.equal(C.stepFor(newKid(), course, 'pro-0.1'), null);
  // One planned unit left is enough (a copy with Unit 7 planned again and every other unit lifted).
  withUnit7Planned(c => { for (const u of c.units) if (u.tier === 'pro' && u.n !== 7) delete u.planned; });
  assert.equal(T.statusOf('pro'), 'building'); assert.deepEqual(T.plannedUnitsOf('pro').map(u => u.n), [7]);
  assert.deepEqual(T.unitsOf('pro').map(u => u.n), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(C.steps(course, 'pro').map(s => s.key), PRO_KEYS.slice(0, 19), 'a unit whose flag is lifted joins the street, in its reserved order');
  assert.deepEqual(C.steps(course, 'pro').map(s => s.index), PRO_KEYS.slice(0, 19).map((_, i) => i));
  assert.equal(C.getStep(course, 'pro-6.1').title, 'Area, surface area and volume'); assert.equal(C.getStep(course, 'pro-6.1').deck, true, 'a built unit brings its decks');
  assert.equal(C.getStep(course, 'pro-7.1'), null);
  // So is one reserved step: every unit lifted, the finale step still planned (a copy), the line open: still building.
  withFinalePlanned(c => { c.tiers.pro.status = 'open'; });
  assert.equal(T.statusOf('pro'), 'building', 'the finale is still reserved'); assert.deepEqual(T.plannedUnitsOf('pro').map(u => [u.n, u.partial]), [[7, true]]);
  assert.equal(C.getStep(course, 'pro-7.4'), null); assert.equal(C.getStep(course, 'pro-7.3').title, 'Compare two data sets and spot a trend');
  // A step whose flag is lifted with no deck file gets the placeholder, and the checker says so: which is why a unit (or
  // the finale) lifts its flag only in the change that brings its decks. (Every Pro step has its deck now, so the copy
  // reserves one more step, 7.5, and then lifts it.)
  withFinalePlanned(c => { const u = c.units.find(x => x.tier === 'pro' && x.n === 7), st = structuredClone(u.steps.find(x => x.n === '7.4')); st.n = '7.5'; st.order = 24; st.titles = { pro: 'A step with no deck' }; delete st.planned; u.steps.push(st); });
  assert.equal(C.getStep(course, 'pro-7.5').title, 'A step with no deck'); assert.equal(C.getStep(course, 'pro-7.5').deck, false, 'with no deck file it gets the placeholder');
  assert.ok(C.deckProblems('pro', 'number-quest').includes('pro-7.5: no deck at course/pro/7.5.json'));
  // Every unit and step built and the line open: the tier is open.
  const cat = structuredClone(UNITS); cat.tiers.pro.status = 'open';
  T.setCatalogueForTests(cat); C.reload();
  assert.equal(T.statusOf('pro'), 'open'); assert.deepEqual(T.openTiers(), ['launchpad', 'explorer', 'pro']);
  assert.deepEqual(C.steps(course, 'pro').map(s => s.key), PRO_KEYS);
  assert.equal(C.getStep(course, 'pro-7.1').title, 'Center and spread'); assert.equal(C.getStep(course, 'pro-7.1').deck, true, 'Unit 7 brought its decks');
  assert.equal(C.getStep(course, 'pro-7.4').deck, true, 'and the finale its deck');
  assert.deepEqual(C.deckProblems('pro', 'number-quest'), [], 'every Pro step has its deck');
  // And back: the file is what it was, and open by its status line.
  restore();
  assert.equal(T.statusOf('pro'), 'open'); assert.deepEqual(C.steps(course, 'pro').map(s => s.key), REAL_BUILT_KEYS);
  // The data never does this by accident: an open tier has no planned unit and no planned step.
  for (const [tier, line] of Object.entries(UNITS.tiers)) if (line.status === 'open') assert.deepEqual(UNITS.units.filter(u => u.tier === tier && (u.planned || u.steps.some(s => s.planned))), [], `${tier} is open, so nothing in it is planned`);
});

// ------------------------------------------------------------------------------------------------- who sees Pro
// The course's fixed copy (courses.nq.about and courses.nq.teachers, en.json) names the three streets since the opening, whatever
// the test hook says: set aside by its exact text when a page is read for what the DATA put on it.
const EN = JSON.parse(fs.readFileSync(new URL('../../server/i18n/locales/en.json', import.meta.url), 'utf8'));
const escHtml = x => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const staticCopyOut = text => [EN.courses.nq.about, EN.courses.nq.teachers].reduce((t, x) => t.split(escHtml(x)).join('').split(x).join(''), text);
test('while Pro is building, nobody but the platform admin sees it: no band, street, step, API, start node or test-out', async () => {
  // The building state, as it was from 2026-11-14 to the opening on 2026-11-15 (the hook; restore() puts the file back).
  T.setTierStatus('pro', 'building');
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
    ['/number-quest/sorting-game', cookie]]) {
    const r = await get(path, c);
    assert.equal(r.status, 200, path);
    assert.doesNotMatch(staticCopyOut(r.text.replace(/<script[\s\S]*?<\/script>/g, '')), TOWERS, `${path}: nothing of the Pro street`);
  }
  // The teacher page: no Pro row, unit, code, game card, gap list or count for a non-admin. (Its fixed course copy in the
  // locale files names the three streets since the opening, whatever the hook says, so the page is read by its data parts.)
  for (const [path, c] of [['/teachers/number-quest', null], ['/teachers/number-quest', cookie], ['/teachers/number-quest?print=1', null]]) {
    const r = await get(path, c);
    assert.equal(r.status, 200, path);
    assert.doesNotMatch(r.text.replace(/<script[\s\S]*?<\/script>/g, ''), /Welcome to the Towers|Ratio Gear|Mixing Tower|Pro · |Planned units|6\.RP\.A\.1|id="pro-gaps"|Lantern Mix<\/h3>|grades K–8, mapped|3 streets/, `${path}: nothing of the Pro street`);
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
  assert.equal((await post('/api/number-quest/testout/start', cookie, { unit: 7, tier: 'pro' })).status, 400, 'Unit 7, built, is no test-out either');
  const api = await get('/api/number-quest/placement', cookie);
  assert.deepEqual(Object.keys(JSON.parse(api.text).testedOutByTier), ['launchpad', 'explorer']);
  // (The course copy in the locale files describes the three streets since the opening: pinned in number-quest-pro-open.test.js.)
});

test('the platform admin previews a sensible Pro street: the welcome and the built units open, the other units are listed as planned, nothing is broken', async () => {
  const cookie = cookieFor(admin.id);
  withUnit7Planned();   // a planned unit to preview (Unit 7 as it was before its build), whatever else the file holds
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
  assert.match(street.text, /Planned for Pro: 1 unit not built yet/);
  assert.match(street.text, /Admin preview\. These units are reserved in the catalogue/);
  for (const [u, title, gear] of [[7, 'The Test Range', 'Chance Gear']]) {
    assert.match(street.text, new RegExp(`id="planned-unit-${u}"[\\s\\S]*?Unit ${u} · ${title}[\\s\\S]*?${gear}`), `Unit ${u}`);
  }
  assert.equal((street.text.match(/class="nqp-step nqp-step-planned"/g) || []).length, PLANNED_KEYS.length, `all ${PLANNED_KEYS.length} planned steps are listed`);
  assert.equal(PLANNED_KEYS.length, 4, 'four steps are planned in the copy, all in Unit 7');
  assert.doesNotMatch(street.text, /id="planned-unit-6"/, 'Unit 6 is built: it is on the street, not in the planned list');
  assert.match(street.text, /id="step-pro-6\.1"/); assert.match(street.text, /The Drafting Keep/); assert.match(street.text, /The Pythagorean theorem/);
  assert.doesNotMatch(street.text, /id="planned-unit-5"/, 'Unit 5 is built: it is on the street, not in the planned list');
  assert.match(street.text, /id="step-pro-5\.1"/); assert.match(street.text, /The Sky Wires/); assert.match(street.text, /Slope: the steepness of a line/);
  assert.doesNotMatch(street.text, /id="planned-unit-4"/, 'Unit 4 is built: it is on the street, not in the planned list');
  assert.match(street.text, /id="step-pro-4\.1"/); assert.match(street.text, /The Map Room/); assert.match(street.text, /Scale drawings and maps/);
  assert.doesNotMatch(street.text, /id="planned-unit-3"/, 'Unit 3 is built: it is on the street, not in the planned list');
  assert.match(street.text, /id="step-pro-3\.1"/); assert.match(street.text, /The Machine Hall/); assert.match(street.text, /Write and work out expressions/);
  assert.doesNotMatch(street.text, /id="planned-unit-2"/, 'Unit 2 is built: it is on the street, not in the planned list');
  assert.match(street.text, /id="step-pro-2\.1"/); assert.match(street.text, /The Cold Store/); assert.match(street.text, /Divide by a fraction/);
  assert.doesNotMatch(street.text, /id="planned-unit-1"|id="planned-pro-1\.1"/, 'Unit 1 is built: it is on the street, not in the planned list');
  assert.match(street.text, /The Mixing Tower/); assert.match(street.text, /Ratios and equal mixes/);
  assert.match(street.text, /id="planned-pro-7\.4"[\s\S]*?The Great Clock/);
  for (const key of PLANNED_KEYS) assert.doesNotMatch(street.text, new RegExp(`href="/courses/number-quest/${key.replace('.', '\\.')}"`), `${key} is not a door`);
  assert.match(street.text, /of 19/, 'the street counts its nineteen built steps');
  // The welcome step: the deck, its two diagrams, its check, read-aloud lines in words.
  const step = await get('/courses/number-quest/pro-0.1', cookie);
  assert.equal(step.status, 200);
  assert.doesNotMatch(clean(step.text), /undefined|NaN|\[object Object\]/);
  for (const re of [/Welcome to the Towers/, /Welcome to Netville/, /The clock has stopped/, /Numbers that move together/, /Numbers below zero/, /Your quest/, /Words to know/, /Your mission/, /Oats and milk in one mix/, /A sample warming from below zero/]) assert.match(step.text, re);
  assert.match(step.text, /The Cold Store keeps a sample at −5°C\./, 'printed with the true minus sign');
  assert.match(step.text, /data-say="[^"]*a sample at negative 5 degrees Celsius\. Warm it by 8 degrees[^"]*"/, 'and handed to the voice in words');
  assert.equal((step.text.match(/class="slide slide--/g) || []).length, 7);
  assert.equal((step.text.match(/<svg[^>]*class="vf-svg/g) || []).length, 2, 'two drawn diagrams');
  // A planned step is a 404 for the admin too: there is nothing to open.
  for (const key of ['pro-7.1', 'pro-7.4']) assert.equal((await get(`/courses/number-quest/${key}`, cookie)).status, 404, key);
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
  assert.match(teach.text, /id="planned"[\s\S]*?Planned units \(admin preview\)[\s\S]*?These 1 units? are reserved in the catalogue and not built yet/);
  const plannedHtml = teach.text.slice(teach.text.indexOf('id="planned"'), teach.text.indexOf('id="notes"'));
  assert.match(plannedHtml, /Pro · Unit 7 · The Test Range — Chance Gear/);
  assert.match(plannedHtml, /title="[^"]{20,}"[^>]*>6\.SP\.A\.3</, 'a planned step shows its locked codes, with the published statement');
  assert.match(plannedHtml, /8\.SP\.A\.1/); assert.match(plannedHtml, /The Great Clock/);
  assert.equal((plannedHtml.match(/class="csq-map-unit"/g) || []).length, 1);
  const mapHtml = teach.text.slice(teach.text.indexOf('id="map"'), teach.text.indexOf('id="planned"'));
  assert.doesNotMatch(mapHtml, /The Test Range|6\.SP\.A\.3/, 'the published map holds built steps only');
  assert.match(mapHtml, /The Mixing Tower/); assert.match(mapHtml, /6\.RP\.A\.1/, 'and Unit 1, built, is in it for the admin');
  assert.doesNotMatch(plannedHtml, /The Mixing Tower|The Cold Store|The Machine Hall|The Map Room|The Sky Wires|The Drafting Keep/); assert.match(mapHtml, /The Drafting Keep/); assert.match(mapHtml, /8\.G\.B\.7/); assert.match(mapHtml, /The Map Room/); assert.match(mapHtml, /7\.RP\.A\.2a/); assert.match(mapHtml, /The Sky Wires/); assert.match(mapHtml, /8\.F\.B\.4/); assert.match(mapHtml, /The Cold Store/); assert.match(mapHtml, /6\.NS\.A\.1/); assert.match(mapHtml, /The Machine Hall/); assert.match(mapHtml, /6\.EE\.A\.2/);
  assert.equal((await get('/teachers/number-quest?print=1', cookie)).status, 200);
  const cat = C.numberQuestCatalogue(admin);
  assert.deepEqual(cat.planned.map(u => u.n), FIX_PLANNED); assert.equal(cat.units.filter(u => u.tier === 'pro').length, BUILT_UNITS.length);
  restore();
  // A built unit's reserved step (the finale planned again in a copy), for the admin: the unit's built steps are doors, and the step is listed as reserved.
  withFinalePlanned();
  const part = await get('/courses/number-quest?street=pro', cookie);
  assert.doesNotMatch(clean(part.text), /undefined|NaN|\[object Object\]/);
  assert.match(part.text, /id="step-pro-7\.1"/); assert.match(part.text, /href="\/courses\/number-quest\/pro-7\.3"/); assert.doesNotMatch(part.text, /href="\/courses\/number-quest\/pro-7\.4"/);
  assert.match(part.text, /id="planned-unit-7"[\s\S]*?Planned: the unit is built, and this step of it is not yet\.[\s\S]*?id="planned-pro-7\.4"[\s\S]*?The Great Clock/);
  assert.match(part.text, /Planned for Pro: 1 step of a built unit not built yet/);
  assert.equal((part.text.match(/class="nqp-step nqp-step-planned"/g) || []).length, 1);
  assert.match(part.text, /of 22\b/, 'the street counts its twenty-two built steps');
  assert.equal((await get('/courses/number-quest/pro-7.4', cookie)).status, 404, 'a planned step is no door, even for the admin');
  restore();
  // The file itself, for the admin: Unit 7 is on the street with its four doors, the finale among them, and nothing is planned.
  const real = await get('/courses/number-quest?street=pro', cookie);
  assert.doesNotMatch(clean(real.text), /undefined|NaN|\[object Object\]/);
  assert.match(real.text, /id="step-pro-7\.1"/); assert.match(real.text, /href="\/courses\/number-quest\/pro-7\.3"/); assert.match(real.text, /href="\/courses\/number-quest\/pro-7\.4"/);
  assert.doesNotMatch(real.text, /id="nqp-planned"/, 'nothing is planned on the Pro street');
  assert.equal((real.text.match(/class="nqp-step nqp-step-planned"/g) || []).length, 0);
  assert.match(real.text, /of 23\b/, 'the street counts its twenty-three built steps');
  const fin = await get('/courses/number-quest/pro-7.4', cookie);
  assert.equal(fin.status, 200, 'the finale is a door for the admin'); assert.match(fin.text, /The Great Clock/); assert.match(fin.text, /Launch Lab/);
  assert.doesNotMatch(clean(fin.text), /undefined|NaN|\[object Object\]/);
  assert.equal((await get('/courses/number-quest/pro-7.1', cookie)).status, 200);
});

// ------------------------------------------------------------------------------------------------- placement
test('placement is unchanged while Pro is building: all 88,434 possible sets of rungs start where they start on main', () => {
  // Building, as it was until 2026-11-15 (the hook). The same sets with Pro open: number-quest-pro-open.test.js.
  T.setTierStatus('pro', 'building');
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

test('Pro open (as it ships): the walk follows the seven profiles, and a learner enters only with every strand at rung 5.5 or over', () => {
  assert.equal(T.isOpen('pro'), true, 'the file itself, no hook');
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
  // 1. With Pro building, as it was until 2026-11-15 (the hook): reading every page changes nothing.
  T.setTierStatus('pro', 'building');
  await readEverything();
  assert.deepEqual(kids.map(snapshot), before, 'Pro being declared wrote nothing');
  assert.equal(P.getPlacement(strong).startNode, 'explorer-7.4');
  assert.match((await get('/courses/number-quest', cookieFor(strong.id))).text, /aria-label="The Numberworks street, Explorer"/);
  // 2. With Pro open (the file as it ships): the same rungs would now start a NEW learner on the Great Clock door, and this one is left alone.
  T.setTierStatus('pro', null);
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
  // 3. And were it ever closed again (the hook): the learner who chose Pro reads as having no band; their rows are still there.
  T.setTierStatus('pro', 'building');
  assert.equal(C.getBand(strong, course), null);
  assert.equal(q.get('SELECT band FROM course_bands WHERE user_id=? AND course=?', strong.id, 'number-quest').band, 'pro', 'nothing is deleted');
  assert.equal(P.getPlacement(strong).startNode, 'explorer-7.4');
});

// ------------------------------------------------------------------------------------------------- copy from data
test('the teacher page\'s placement copy is made from the data: two streets while Pro is building, the third now that it is open', async () => {
  // Building (the hook, as until 2026-11-15): not a word about a third street, in the function, the matrix, the explainer or the page.
  T.setTierStatus('pro', 'building');
  assert.deepEqual(proPlacementWords(), { landing: '', walk: '', justPlay: '', finaleIf: '' });
  const today = String(placementSection()); // the explainer, with the matrix inside it
  assert.ok(today.includes(String(placementMatrix())));
  assert.doesNotMatch(today, /Pro street|Pro welcome|Pro starting line|Great Clock|rung 5\.5 or over/);
  assert.match(today, /or the Vault of Measures door \(the finale\) when all seven are met\. A rung that lands under the Explorer starting line starts in the Launchpad gardens instead<\/td>/);
  assert.match(today, /and with grade 3 to 5 at Explorer Unit 1\. If every strand points past Explorer Unit 7, the start is the Vault of Measures/);
  const page = await get('/teachers/number-quest');
  assert.doesNotMatch(page.text, /the start is on the Pro street|Pro starting line|What the Pro street does not cover|id="pro-gaps"/);
  // Open (the file as it ships): the same functions name the street, its line, its welcome, its finale and its unit count, all from the catalogue.
  T.setTierStatus('pro', null);
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
  // A learner on the open street sees a path, not an error.
  const kid = newKid();
  const street = await get('/courses/number-quest?street=pro', cookieFor(kid.id));
  assert.equal(street.status, 200); assert.match(street.text, /aria-label="The Numberworks street, Pro"/); assert.match(street.text, /id="step-pro-7\.4"/);
  assert.doesNotMatch(street.text.replace(/<script[\s\S]*?<\/script>/g, ''), /undefined|NaN|nqp-planned/);
});

test('while Pro is building, for everyone who is not the admin, every Number Quest page is byte for byte the page of a course with no Pro tier in it', async () => {
  // Building (the hook): what the tier's declaration promised until the opening on 2026-11-15.
  T.setTierStatus('pro', 'building');
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
  // The one piece of copy this build rewired to read the tiers from the data is, with Pro building, exactly the text main rendered.
  T.setTierStatus('pro', 'building');
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
