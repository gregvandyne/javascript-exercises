// Number Quest's tiers (server/services/number-quest-tiers.js): three sequential streets on one path —
// Launchpad (K-2), Explorer (3-5), Pro (6-8) — each with its own units and steps, keyed "<tier>-<unit>.<step>".
// Pinned here:
//   - the catalogue declares Launchpad and Explorer; Explorer's 23 steps and keys are exactly what they were;
//     Launchpad's welcome (launchpad-0.1), its Unit 1, The Counting Patch (1.1-1.3, played in Garden Count) and its
//     Unit 2, The Joining Pond (2.1-2.3, played in Lily Hop), and its Unit 3, The Tens Trellis (3.1-3.3, played in
//     Crate Stacker), its Unit 4, The Balance Bridge (4.1-4.3, played in Balance Bridge), and its Unit 5, The Hundreds
//     Hedge (5.1-5.3, played in Rocket Supply), its Unit 6, The Shape Shed (6.1-6.3, played in Shape Hunt), and its Unit 7,
//     The Measuring Meadow (7.1-7.3, played in Kitchen Rush) with the tier's finale, The Garden Gate (7.4, Kitchen Rush's
//     fourth chapter), load with no deck problems; Pro has no units, so it does not exist;
//   - while Launchpad is "building", a learner sees Explorer alone (path page, band picker, placement,
//     teacher page), cannot open launchpad-0.1 (it reads as a step that does not exist) nor pick the band;
//     the platform admin can;
//   - with Launchpad read as "open" (the test-only status hook), the street switcher renders, a learner can
//     pick the band and walk the street, placement lands a rung under 2.5 on a Launchpad node once entry
//     profiles exist, and test-outs and laps are stored per tier, never colliding with Explorer's unit numbers.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const C = await import('../../server/services/courses.js');
const T = await import('../../server/services/number-quest-tiers.js');
const P = await import('../../server/services/number-quest-placement.js');
const NQ = await import('../../server/services/number-quest-progress.js');
const tags = await import('../../server/standards/official-tags.js');
const { parseParams } = await import('../../server/services/play-params.js');
const { generateItem, TEMPLATES } = await import('../../seed-lessons/number-quest/placement/generator.js');
seed({ quiet: true });

const course = C.getCourse('number-quest');
let n = 0;
const newKid = () => auth.createUser({ username: `nqt${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const admin = auth.createUser({ username: `nqtadm${Date.now() % 1e6}`, password: 'correct-horse-12', displayName: 'Admin', role: 'admin' });

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
// Every test leaves the tiers as units.json and placement.json declare them.
const restore = () => { T.setTierStatus('launchpad', null); T.setTierStatus('pro', null); T.setCatalogueForTests(null); P.setEntryProfilesForTests(null); C.reload(); };
test.afterEach(restore);
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (path, cookie) => { const r = await fetch(base + path, { headers: { ...H, ...(cookie ? { cookie } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const post = async (path, cookie, body, type = 'application/json') => {
  const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': type, ...(cookie ? { cookie } : {}) }, body: type === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body).toString() });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text, location: r.headers.get('location') };
};
const allRight = step => Object.fromEntries(step.check.map(id => [id, C.item(id).answer]));

const EXPLORER_KEYS = ['0.1', '1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '6.1', '6.2', '6.3', '7.1', '7.2', '7.3', '7.4'].map(k => `explorer-${k}`);
/** Entry profiles for the Launchpad doors a test invents (the real ones are locked in placement.json later). */
const profile = r => ({ Number: r, 'Algebra & Patterns': r, 'Shape & Measure': r, 'Data & Chance': r });
/** The catalogue with a three-unit Launchpad of one step a unit: the welcome and two test units (1 and 2, unit numbers
 *  Explorer has too). The real Unit 1 (three steps) is set aside, so the walk below stays one door a unit. */
function withLaunchpadUnits() {
  const cat = structuredClone(T.catalogue());
  cat.units = cat.units.filter(u => !(u.tier === 'launchpad' && u.n > 0));
  for (const u of [1, 2]) cat.units.push({ tier: 'launchpad', n: u, title: `Test Garden ${u}`, group: `unit-${u}`, emoji: '🌼', stamp: null, tool: null, teacherNotes: ['A test unit.'],
    steps: [{ n: `${u}.1`, order: u + 1, mp: 'MP1', game: { launchpad: null }, titles: { launchpad: `Garden ${u}` }, shorts: { launchpad: `Garden ${u}` }, standards: { launchpad: { primary: [], also: [], buildsToward: [], flag: 'framing' } } }] });
  T.setCatalogueForTests(cat);
  C.reload();
}

// ------------------------------------------------------------------------------------------------- the catalogue
test('the catalogue: Launchpad and Explorer are declared; Explorer is exactly its 23 steps; Launchpad opens with its welcome', () => {
  assert.deepEqual(T.TIERS, ['launchpad', 'explorer', 'pro']);
  assert.deepEqual(T.existingTiers(), ['launchpad', 'explorer']);
  assert.equal(T.statusOf('explorer'), 'open');
  assert.equal(T.statusOf('launchpad'), 'building');
  assert.equal(T.statusOf('pro'), null, 'a tier with no units has no status: it does not exist');
  assert.deepEqual({ district: T.tierInfo('launchpad').district, grades: T.tierInfo('launchpad').grades, inGame: T.tierInfo('launchpad').inGame, stones: T.tierInfo('launchpad').stones },
    { district: 'The Gardens', grades: 'K-2', inGame: 'Launchpad', stones: ['Counting Seed', 'Joining Seed', 'Tens Seed', 'Balance Seed', 'Hundreds Seed', 'Shape Seed', 'Measuring Seed'] });
  assert.equal(T.tierInfo('launchpad').finale, '7.4', 'the tier ends on a finale door, as Explorer does');
  // Explorer: unchanged, key for key, in order.
  const ex = C.steps(course, 'explorer');
  assert.deepEqual(ex.map(s => s.key), EXPLORER_KEYS);
  assert.deepEqual(ex.map(s => s.index), EXPLORER_KEYS.map((_, i) => i));
  assert.ok(ex.every(s => s.band === 'explorer' && s.deck));
  assert.deepEqual(C.deckProblems('explorer', 'number-quest'), []);
  assert.equal(C.getStep(course, 'explorer-1.1').game.params, 'mode=nq-1-1&lock=1');
  assert.deepEqual(T.unitsOf('explorer').map(u => u.n), [0, 1, 2, 3, 4, 5, 6, 7]);
  // Launchpad: its own units and steps, its own deck and bank.
  const lp = C.steps(course, 'launchpad');
  assert.deepEqual(lp.map(s => s.key), ['launchpad-0.1', 'launchpad-1.1', 'launchpad-1.2', 'launchpad-1.3', 'launchpad-2.1', 'launchpad-2.2', 'launchpad-2.3', 'launchpad-3.1', 'launchpad-3.2', 'launchpad-3.3', 'launchpad-4.1', 'launchpad-4.2', 'launchpad-4.3', 'launchpad-5.1', 'launchpad-5.2', 'launchpad-5.3', 'launchpad-6.1', 'launchpad-6.2', 'launchpad-6.3', 'launchpad-7.1', 'launchpad-7.2', 'launchpad-7.3', 'launchpad-7.4']);
  assert.deepEqual(lp.map(s => s.index), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
  assert.deepEqual(C.deckProblems('launchpad', 'number-quest'), [], 'the Launchpad decks have no problems');
  assert.deepEqual(T.unitsOf('launchpad').map(u => [u.n, u.title, u.stamp]), [[0, 'Welcome to the Gardens', null], [1, 'The Counting Patch', 'Counting Seed'], [2, 'The Joining Pond', 'Joining Seed'], [3, 'The Tens Trellis', 'Tens Seed'], [4, 'The Balance Bridge', 'Balance Seed'], [5, 'The Hundreds Hedge', 'Hundreds Seed'], [6, 'The Shape Shed', 'Shape Seed'], [7, 'The Measuring Meadow', 'Measuring Seed']]);
  // Unit 1's steps play Garden Count, each locked to its own chapter.
  assert.deepEqual(lp.slice(1, 4).map(s => [s.title, s.unit, s.game.slug, s.game.params, s.mp]), [['Count to 20', 1, 'garden-count', 'chapter=count&lock=1', 'MP6'],
    ['More, fewer, the same', 1, 'garden-count', 'chapter=compare&lock=1', 'MP2'], ['Teen numbers', 1, 'garden-count', 'chapter=teens&lock=1', 'MP7']]);
  // Unit 2's steps play Lily Hop, each locked to its own chapter.
  assert.deepEqual(lp.slice(4, 7).map(s => [s.title, s.unit, s.game.slug, s.game.params, s.mp]), [['Put together to 10', 2, 'lily-hop', 'chapter=join&lock=1', 'MP4'],
    ['Take apart and make 10', 2, 'lily-hop', 'chapter=apart&lock=1', 'MP7'], ['Add and take away to 20', 2, 'lily-hop', 'chapter=twenty&lock=1', 'MP8']]);
  // Unit 3's steps play Crate Stacker, each locked to its own chapter.
  assert.deepEqual(lp.slice(7, 10).map(s => [s.title, s.unit, s.game.slug, s.game.params, s.mp]), [['Tens and ones', 3, 'crate-stacker', 'chapter=build&lock=1', 'MP7'],
    ['Which is greater?', 3, 'crate-stacker', 'chapter=greater&lock=1', 'MP2'], ['Add tens, add ones', 3, 'crate-stacker', 'chapter=add&lock=1', 'MP8']]);
  // Unit 4's steps play Balance Bridge, each locked to its own chapter.
  assert.deepEqual(lp.slice(10, 13).map(s => [s.title, s.unit, s.game.slug, s.game.params, s.mp]), [['Equals means the same as', 4, 'balance-bridge', 'chapter=equal&lock=1', 'MP6'],
    ['Story problems', 4, 'balance-bridge', 'chapter=story&lock=1', 'MP1'], ['Equal groups, odd and even', 4, 'balance-bridge', 'chapter=groups&lock=1', 'MP7']]);
  // Unit 5's steps play Rocket Supply, each locked to its own chapter.
  assert.deepEqual(lp.slice(13, 16).map(s => [s.title, s.unit, s.game.slug, s.game.params, s.mp]), [['Hundreds, tens and ones', 5, 'rocket-supply', 'chapter=build&lock=1', 'MP7'],
    ['Skip counting and comparing', 5, 'rocket-supply', 'chapter=count&lock=1', 'MP8'], ['Add and subtract to 100', 5, 'rocket-supply', 'chapter=fuel&lock=1', 'MP2']]);
  // Unit 6's steps play Shape Hunt, each locked to its own chapter.
  assert.deepEqual(lp.slice(16, 19).map(s => [s.title, s.unit, s.game.slug, s.game.params, s.mp]), [['Name that shape', 6, 'shape-hunt', 'chapter=find&lock=1', 'MP6'],
    ['Build with shapes', 6, 'shape-hunt', 'chapter=build&lock=1', 'MP7'], ['Halves and fourths', 6, 'shape-hunt', 'chapter=share&lock=1', 'MP3']]);
  // Unit 7's steps play Kitchen Rush, each locked to its own chapter; the fourth is the tier's finale, The Garden Gate, in
  // the game's own fourth chapter (never one of the shared quiz games).
  assert.deepEqual(lp.slice(19).map(s => [s.title, s.unit, s.game.slug, s.game.params, s.mp]), [['How long is it?', 7, 'kitchen-rush', 'chapter=measure&lock=1', 'MP5'],
    ['Clocks and coins', 7, 'kitchen-rush', 'chapter=clock&lock=1', 'MP6'], ['Sort it and chart it', 7, 'kitchen-rush', 'chapter=chart&lock=1', 'MP4'], ['The Garden Gate', 7, 'kitchen-rush', 'chapter=gate&lock=1', 'MP1']]);
  assert.ok(!['quest-race', 'brain-board'].includes(lp[22].game.slug), 'the finale is not one of the generic quiz games');
  assert.notEqual(C.getStep(course, 'explorer-1.1').title, C.getStep(course, 'launchpad-1.1').title, 'two tiers, two different steps numbered 1.1');
  const w = C.getStep(course, 'launchpad-0.1');
  assert.equal(w.band, 'launchpad'); assert.equal(w.unit, 0); assert.equal(w.index, 0); assert.equal(w.deck, true);
  assert.equal(w.title, 'Meet Tally in the Gardens'); assert.equal(w.game, null); assert.ok(w.talk);
  assert.deepEqual(w.check, ['nq-launchpad-0.1-e1', 'nq-launchpad-0.1-e2', 'nq-launchpad-0.1-e3']);
  assert.equal(w.standards.flag, 'framing'); assert.equal(w.mp, 'MP1');
  assert.notEqual(C.getStep(course, 'explorer-0.1').title, w.title, 'two tiers, two different steps numbered 0.1');
  // Pro: no units, so nothing.
  assert.equal(C.getStep(course, 'pro-1.1'), null);
  assert.deepEqual(C.steps(course, 'pro'), []);
  assert.equal(T.firstKey('pro'), null);
  // The other courses know nothing of tier keys, and Number Quest nothing of theirs.
  assert.equal(C.getStep(C.getCourse('cs-quest'), 'launchpad-0.1'), null);
  assert.equal(C.getStep(course, '1b-1.1'), null);
  assert.deepEqual(C.bandsFor(C.getCourse('cs-quest'), admin), ['1b', '2']);
});

test('band labels: Number Quest\u2019s literal tier keys render beside the other courses\u2019 bands, which keep theirs', async () => {
  const { bandName, bandEmoji, bandLine } = await import('../../server/views/courses.js');
  const { current } = await import('../../server/i18n/index.js');
  const { t } = current();
  assert.equal(bandLine(t, 'launchpad'), 'Launchpad · Grades K–2'); assert.equal(bandEmoji('launchpad'), '🌱');
  assert.equal(bandLine(t, 'explorer'), 'Explorer · Grades 3–5'); assert.equal(bandEmoji('explorer'), '🧭');
  assert.equal(bandLine(t, 'pro'), 'Pro · Grades 6–8'); assert.equal(bandEmoji('pro'), '🚀');
  // CS Quest and Cyber Defenders: band '1b' is still labelled Explorer and band '2' Pro.
  assert.equal(bandName(t, '1b'), 'Explorer'); assert.equal(bandLine(t, 2), 'Pro · Grades 6–8'); assert.equal(bandEmoji('1b'), '🧭'); assert.equal(bandEmoji(2), '🚀');
  assert.equal(bandEmoji('nowhere'), '');
});

test('standards tags read every tier, keyed by full step key', () => {
  const steps = tags.numberQuestSteps();
  assert.deepEqual(steps.get('explorer-1.1'), ['4.NBT.A.1', '4.NBT.A.2']);
  assert.equal(steps.has('launchpad-0.1'), false, 'a framing step cites no code');
  assert.ok([...steps.keys()].every(k => /^(launchpad|explorer|pro)-\d\.\d$/.test(k)));
  assert.equal([...steps.keys()].filter(k => k.startsWith('explorer-')).length, 21, 'Explorer: 23 steps less the intro and the enrichment step');
});

test('game modes: nq- stays Explorer, nql- and nqp- are allowed through the play params', () => {
  assert.deepEqual(parseParams('mode=nq-1-1&lock=1'), { mode: 'nq-1-1', lock: 1 });
  assert.deepEqual(parseParams('mode=nql-1-1&lock=1'), { mode: 'nql-1-1', lock: 1 });
  assert.deepEqual(parseParams('mode=nqp-2-3&lock=1'), { mode: 'nqp-2-3', lock: 1 });
});

test('Brain Board and Quest Race decode the lesson mode per tier, and an unknown step is no lesson at all', async () => {
  const fs = await import('node:fs'); const vm = await import('node:vm');
  for (const [file, known, unknown] of [['seed-games/brain-board.html', 'nq-1-1', 'nq-1-2'], ['seed-games/quest-race.html', 'nq-1-3', 'nq-1-1']]) {
    const html = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    const at = html.indexOf('var NQ_STEP = '), stmt = html.slice(at, html.indexOf('\n  var nqPads', at));
    const stepFor = (mode, src = stmt) => { const BRB = { params: mode === null ? {} : { mode } }; const ctx = vm.createContext({ BRB, window: { BRB } }); vm.runInContext(src, ctx); return ctx.NQ_STEP; };
    assert.equal(stepFor(known), `explorer-${known.slice(3).replace('-', '.')}`, `${file}: ${known} is still the Explorer step`);
    // A step the game has no lesson content for, in any tier: the game's normal mode.
    for (const mode of [unknown, 'nq-9-9', known.replace('nq-', 'nql-'), known.replace('nq-', 'nqp-'), 'nqx-1-1', 'practice', null]) assert.equal(stepFor(mode), '', `${file}: ${mode} opens the normal game`);
    // Once a Launchpad or Pro step is given content (its key joins the known list), its mode decodes to it.
    const widened = stmt.replace(/\}\)\(\[/, "})(['launchpad-1.1', 'pro-2.3', ");
    assert.notEqual(widened, stmt);
    assert.equal(stepFor('nql-1-1', widened), 'launchpad-1.1');
    assert.equal(stepFor('nqp-2-3', widened), 'pro-2.3');
    assert.equal(stepFor('nq-1-1', widened), file.includes('brain-board') ? 'explorer-1.1' : '', 'nq- never reads as another tier');
  }
});

// ------------------------------------------------------------------------------------------------- building
test('Launchpad building: a learner sees Explorer alone and cannot reach launchpad-0.1 or its band', async () => {
  const kid = newKid(), cookie = cookieFor(kid.id);
  assert.deepEqual(C.bandsFor(course), ['explorer']);
  assert.deepEqual(C.bandsFor(course, kid), ['explorer']);
  assert.equal(C.defaultBand(course, kid), 'explorer');
  assert.equal(C.stepFor(kid, course, 'launchpad-0.1'), null);
  assert.equal(C.stateOf(kid, course, 'launchpad-0.1'), null);
  assert.equal(C.setBand(kid, course, 'launchpad'), false);
  assert.equal(C.setBand(kid, course, 'pro'), false);
  assert.equal(C.getBand(kid, course), null);
  // The path page: the Explorer street, one band card, no switcher, nothing of Launchpad.
  const home = await get('/courses/number-quest', cookie);
  assert.equal(home.status, 200);
  assert.match(home.text, /id="band-explorer"/);
  assert.doesNotMatch(home.text, /id="band-launchpad"|nqp-streets|launchpad-0\.1|Welcome to the Gardens/);
  assert.match(home.text, /aria-label="The Numberworks street, Explorer"/);
  assert.match(home.text, /id="step-explorer-0\.1"/);
  // Asking for the street by name changes nothing.
  const asked = await get('/courses/number-quest?street=launchpad', cookie);
  assert.doesNotMatch(asked.text, /launchpad-0\.1|Welcome to the Gardens/);
  assert.match(asked.text, /id="step-explorer-0\.1"/);
  // The step page and its APIs answer exactly as for a step that does not exist.
  const unknown = await get('/courses/number-quest/explorer-9.9', cookie);
  const hidden = await get('/courses/number-quest/launchpad-0.1', cookie);
  assert.equal(unknown.status, 404); assert.equal(hidden.status, 404);
  assert.doesNotMatch(hidden.text, /Meet Tally in the Gardens/);
  for (const api of ['read', 'check', 'answer', 'complete']) {
    const a = await post(`/api/courses/number-quest/launchpad-0.1/${api}`, cookie, {});
    const b = await post(`/api/courses/number-quest/explorer-9.9/${api}`, cookie, {});
    assert.equal(a.status, 404, `${api}: hidden`); assert.equal(b.status, a.status);
  }
  assert.equal((await post('/courses/number-quest/launchpad-0.1/check', cookie, {}, 'application/x-www-form-urlencoded')).status, 404);
  assert.equal(q.get('SELECT COUNT(*) n FROM course_progress WHERE user_id=? AND step LIKE ?', kid.id, 'launchpad-%').n, 0);
  // Posting the band is refused quietly.
  const band = await post('/courses/number-quest/band', cookie, { band: 'launchpad' }, 'application/x-www-form-urlencoded');
  assert.equal(band.status, 303);
  assert.equal(q.get('SELECT band FROM course_bands WHERE user_id=? AND course=?', kid.id, 'number-quest'), undefined);
  // A signed-out visitor is in the same place (and no guest is made for a hidden step).
  assert.equal((await get('/courses/number-quest/launchpad-0.1')).status, 404);
  // The teacher page publishes Explorer alone.
  const teach = await get('/teachers/number-quest');
  assert.equal(teach.status, 200);
  assert.doesNotMatch(teach.text, /Welcome to the Gardens|Meet Tally in the Gardens|Launchpad ·/);
  assert.equal(C.numberQuestCatalogue().units.length, 8);
  assert.deepEqual(C.numberQuestCatalogue(kid).tiers.map(t => t.key), ['explorer']);
});

test('Launchpad building: placement behaves exactly as with Explorer alone, even if profiles existed', () => {
  P.setEntryProfilesForTests({ 'launchpad-0.1': profile(1) });
  assert.deepEqual(P.crosswalk({ number: 1, algebra: 3, 'shape-measure': 3, 'data-chance': 3 }), { node: 'explorer-0.1', tier: 'explorer', launchpadGap: true, finaleDoor: false });
  assert.deepEqual(P.startNodes().map(x => x.node), ['explorer-0.1', 'explorer-1.1', 'explorer-2.1', 'explorer-3.1', 'explorer-4.1', 'explorer-5.1', 'explorer-6.1', 'explorer-7.1', 'explorer-7.4']);
  assert.deepEqual([...P.START_NODES].map(x => x.node), P.startNodes().map(x => x.node), 'START_NODES is the same list, read live');
  assert.equal(P.START_NODES.length, 9);
  assert.equal(P.beginningNode('K'), 'explorer-0.1');
  assert.equal(P.beginningNode(2), 'explorer-0.1');
  assert.equal(P.beginningNode(4), 'explorer-1.1');
  assert.equal(P.beginningNode(7), 'explorer-7.1');
  const kid = newKid();
  assert.equal(P.overrideStartNode(kid, 'launchpad-0.1'), null, 'a building tier names no start node');
  assert.equal(P.overrideStartNode(kid, 'pro-1.1'), null);
  assert.equal(P.nodeInfo('launchpad-0.1').node, 'explorer-0.1', 'an unnameable node reads as the Explorer welcome');
  assert.deepEqual(P.testOutItems(1, 'fixed', 'pro'), []);
  assert.equal(P.placedUnitWords('explorer-3.1'), 'Unit 3: Groups & Shares');
});

test('Launchpad building: the platform admin sees the tier and can open its welcome', async () => {
  const cookie = cookieFor(admin.id);
  assert.deepEqual(C.bandsFor(course, admin), ['launchpad', 'explorer']);
  assert.equal(C.stepFor(admin, course, 'launchpad-0.1').key, 'launchpad-0.1');
  assert.equal(C.stateOf(admin, course, 'launchpad-0.1').open, true);
  const page = await get('/courses/number-quest/launchpad-0.1', cookie);
  assert.equal(page.status, 200);
  assert.match(page.text, /Meet Tally in the Gardens/);
  assert.match(page.text, /This is Tally the cat\./);
  const home = await get('/courses/number-quest', cookie);
  assert.match(home.text, /id="nqp-streets"/);
  assert.match(home.text, /id="street-launchpad"[^>]*>[\s\S]*?being built/);
  assert.match(home.text, /aria-label="The Numberworks street, Explorer"/, 'the admin still starts on the Explorer street');
  const street = await get('/courses/number-quest?street=launchpad', cookie);
  assert.match(street.text, /aria-label="The Numberworks street, Launchpad"/);
  assert.match(street.text, /id="step-launchpad-0\.1"/);
  assert.match(street.text, /Welcome to the Gardens/);
  assert.doesNotMatch(street.text, /id="step-explorer-/, 'a street renders only its own units');
  assert.match(street.text, /id="step-launchpad-1\.1"/); assert.match(street.text, /The Counting Patch/);
  assert.match(street.text, /id="step-launchpad-2\.3"/); assert.match(street.text, /The Joining Pond/);
  assert.match(street.text, /id="step-launchpad-3\.3"/); assert.match(street.text, /The Tens Trellis/);
  assert.match(street.text, /id="step-launchpad-4\.3"/); assert.match(street.text, /The Balance Bridge/);
  assert.match(street.text, /id="step-launchpad-5\.3"/); assert.match(street.text, /The Hundreds Hedge/);
  assert.match(street.text, /id="step-launchpad-6\.3"/); assert.match(street.text, /The Shape Shed/);
  assert.match(street.text, /id="step-launchpad-7\.3"/); assert.match(street.text, /The Measuring Meadow/);
  assert.match(street.text, /id="step-launchpad-7\.4"/, 'the finale door is on the street');
  assert.equal(C.numberQuestCatalogue(admin).units.length, 16);
  // Unit 1's first step opens for the admin, with its mission in Garden Count.
  const one = await get('/courses/number-quest/launchpad-1.1', cookie);
  assert.equal(one.status, 200);
  assert.match(one.text, /Count to 20/); assert.match(one.text, /Open Garden Count at Pick and Count\./);
  // Unit 2's last step opens too, with its mission in Lily Hop.
  const pond = await get('/courses/number-quest/launchpad-2.3', cookie);
  assert.equal(pond.status, 200);
  assert.match(pond.text, /Add and take away to 20/); assert.match(pond.text, /Open Lily Hop at Hop to 20\./);
  // Unit 3's last step opens too, with its mission in Crate Stacker.
  const yard = await get('/courses/number-quest/launchpad-3.3', cookie);
  assert.equal(yard.status, 200);
  assert.match(yard.text, /Add tens, add ones/); assert.match(yard.text, /Open Crate Stacker at Add More Crates\./);
  // Unit 4's last step opens too, with its mission in Balance Bridge.
  const bridge = await get('/courses/number-quest/launchpad-4.3', cookie);
  assert.equal(bridge.status, 200);
  assert.match(bridge.text, /Equal groups, odd and even/); assert.match(bridge.text, /Open Balance Bridge at Pairs and Rows\./);
  // Unit 5's last step opens too, with its mission in Rocket Supply.
  const pad = await get('/courses/number-quest/launchpad-5.3', cookie);
  assert.equal(pad.status, 200);
  assert.match(pad.text, /Add and subtract to 100/); assert.match(pad.text, /Open Rocket Supply at Fuel Up\./);
  // Unit 6's last step opens too, with its mission in Shape Hunt.
  const shed = await get('/courses/number-quest/launchpad-6.3', cookie);
  assert.equal(shed.status, 200);
  assert.match(shed.text, /Halves and fourths/); assert.match(shed.text, /Open Shape Hunt at Equal Shares\./);
  // Unit 7's last teaching step opens too, with its mission in Kitchen Rush; and the finale, in the game's fourth chapter.
  const meadow = await get('/courses/number-quest/launchpad-7.3', cookie);
  assert.equal(meadow.status, 200);
  assert.match(meadow.text, /Sort it and chart it/); assert.match(meadow.text, /Open Kitchen Rush at Sort and Chart\./);
  const gate = await get('/courses/number-quest/launchpad-7.4', cookie);
  assert.equal(gate.status, 200);
  assert.match(gate.text, /The Garden Gate/); assert.match(gate.text, /Open Kitchen Rush at The Garden Gate\./);
  assert.equal(C.playHref(course, C.getStep(course, 'launchpad-7.4')), '/play/kitchen-rush?course=number-quest&cstep=launchpad-7.4&chapter=gate&lock=1');
  const teach = await get('/teachers/number-quest', cookie);
  assert.match(teach.text, /Launchpad · Welcome to the Gardens/);
  assert.match(teach.text, /Meet Tally in the Gardens/);
});

// ------------------------------------------------------------------------------------------------- open
test('Launchpad open: the switcher renders, a learner picks the band and walks the street', async () => {
  assert.equal(T.setTierStatus('launchpad', 'open'), true);
  assert.equal(T.setTierStatus('launchpad', 'closed'), false, 'only open or building');
  assert.equal(T.setTierStatus('nowhere', 'open'), false);
  const kid = newKid(), cookie = cookieFor(kid.id);
  assert.deepEqual(C.bandsFor(course, kid), ['launchpad', 'explorer']);
  assert.equal(C.defaultBand(course, kid), 'explorer', 'with no band and no placement the street is Explorer');
  let home = await get('/courses/number-quest', cookie);
  assert.match(home.text, /id="band-launchpad"/); assert.match(home.text, /id="band-explorer"/);
  assert.match(home.text, /id="nqp-streets"/);
  assert.match(home.text, /id="street-explorer"[^>]*aria-current="page"|aria-current="page" id="street-explorer"/);
  assert.match(home.text, /<button class="nqp-street" type="submit" name="band" value="launchpad" id="street-launchpad">/);
  assert.doesNotMatch(home.text, /being built<\/span>/, 'an open street is not marked as being built');
  assert.match(home.text, /id="step-explorer-0\.1"/); assert.doesNotMatch(home.text, /id="step-launchpad-/);
  // Pick Launchpad: the band is stored and the street is the learner's own.
  const band = await post('/courses/number-quest/band', cookie, { band: 'launchpad' }, 'application/x-www-form-urlencoded');
  assert.equal(band.status, 303);
  assert.equal(C.getBand(kid, course), 'launchpad');
  home = await get('/courses/number-quest', cookie);
  assert.match(home.text, /aria-label="The Numberworks street, Launchpad"/);
  assert.match(home.text, /id="step-launchpad-0\.1"/); assert.doesNotMatch(home.text, /id="step-explorer-/);
  assert.match(home.text, /Start here: meet Tally in The Gardens\./);
  // Walk the welcome: read, check, done (it has no game), recorded under its own tier.
  const step = C.getStep(course, 'launchpad-0.1');
  const page = await get('/courses/number-quest/launchpad-0.1', cookie);
  assert.equal(page.status, 200); assert.match(page.text, /Meet Tally in the Gardens/);
  const chk = await post('/api/courses/number-quest/launchpad-0.1/check', cookie, { answers: allRight(step) });
  assert.equal(chk.status, 200); assert.equal(chk.json.passed, true); assert.equal(chk.json.score, 3);
  assert.deepEqual(q.get('SELECT step, band FROM course_progress WHERE user_id=? AND course=?', kid.id, 'number-quest'), { step: 'launchpad-0.1', band: 'launchpad' });
  assert.equal(C.stateOf(kid, course, 'launchpad-0.1').complete, true);
  assert.equal(C.stateOf(kid, course, 'explorer-0.1').complete, false, 'Explorer 0.1 is another step entirely');
  assert.equal(C.overview(kid, course).done, 1); assert.equal(C.overview(kid, course).total, 23, 'the welcome, the three steps each of Units 1 to 7, and the finale');
  assert.equal(C.overview(kid, course, 'explorer').done, 0);
  // Switch back: Explorer is its own street with its own progress.
  assert.equal(C.setBand(kid, course, 'explorer'), true);
  home = await get('/courses/number-quest', cookie);
  assert.match(home.text, /aria-label="The Numberworks street, Explorer"/);
  // The teacher page now publishes both streets.
  const teach = await get('/teachers/number-quest');
  assert.match(teach.text, /Launchpad · Welcome to the Gardens/); assert.match(teach.text, /Explorer · Unit 1 · The Counting House/);
  // Still no Pro.
  assert.equal(C.setBand(kid, course, 'pro'), false); assert.equal(C.getStep(course, 'pro-1.1'), null);
});

test('Launchpad open: placement lands a rung under 2.5 on a Launchpad node once entry profiles exist', () => {
  T.setTierStatus('launchpad', 'open');
  const low = { number: 0.5, algebra: 3, 'shape-measure': 3, 'data-chance': 3 };
  // Open but no profiles locked yet: today's answer, gap flagged.
  assert.deepEqual(P.crosswalk(low), { node: 'explorer-0.1', tier: 'explorer', launchpadGap: true, finaleDoor: false });
  // With the real tier (the welcome and Units 1 to 3) and a profile on its first door.
  P.setEntryProfilesForTests({ 'launchpad-0.1': profile(1) });
  assert.deepEqual(P.crosswalk(low), { node: 'launchpad-0.1', tier: 'launchpad', launchpadGap: false, finaleDoor: false });
  // Three Launchpad units (0, 1, 2), profiles on the doors of 1 and 2.
  withLaunchpadUnits();
  P.setEntryProfilesForTests({ 'launchpad-1.1': profile(0.5), 'launchpad-2.1': profile(1.5) });
  const all = r => ({ number: r, algebra: r, 'shape-measure': r, 'data-chance': r });
  assert.equal(P.crosswalk(all(0)).node, 'launchpad-0.1', 'under the first profile: the tier’s very first step');
  assert.equal(P.crosswalk(all(1)).node, 'launchpad-2.1', 'the first unit whose profile is not met');
  assert.equal(P.crosswalk({ ...all(2), number: 1 }).node, 'launchpad-2.1', 'a near-miss resolves to the lower unit');
  assert.deepEqual(P.crosswalk(all(2)), { node: 'explorer-0.1', tier: 'explorer', launchpadGap: false, finaleDoor: false }, 'every Launchpad profile met: on to the Explorer welcome, no gap');
  assert.equal(P.crosswalk({ number: 1, 'shape-measure': 1, 'data-chance': 1 }).node, 'launchpad-2.1', 'the Launchpad form folds Algebra into Number and still walks');
  // At or over the line nothing changes: Explorer's walk and its finale.
  assert.equal(P.crosswalk(all(2.5)).node, 'explorer-2.1');
  assert.deepEqual(P.crosswalk(all(8)), { node: 'explorer-7.4', tier: 'explorer', launchpadGap: false, finaleDoor: true });
  // The nameable nodes now include the Launchpad doors, first on the path.
  assert.deepEqual(P.startNodes().map(x => x.node), ['launchpad-0.1', 'launchpad-1.1', 'launchpad-2.1', 'explorer-0.1', 'explorer-1.1', 'explorer-2.1', 'explorer-3.1', 'explorer-4.1', 'explorer-5.1', 'explorer-6.1', 'explorer-7.1', 'explorer-7.4']);
  assert.equal(P.nodeInfo('launchpad-1.1').workshop, 'Test Garden 1');
  assert.equal(P.nodeInfo('nowhere').node, 'explorer-0.1', 'the fallback is still the Explorer welcome');
  assert.equal(P.placedUnitWords('launchpad-2.1'), 'Launchpad · Unit 2: Test Garden 2');
  assert.equal(P.placedUnitWords('launchpad-0.1'), 'Launchpad · Welcome to the Gardens');
  assert.equal(P.beginningNode('K'), 'launchpad-0.1'); assert.equal(P.beginningNode(2), 'launchpad-0.1');
  assert.equal(P.beginningNode(3), 'explorer-1.1'); assert.equal(P.beginningNode(8), 'explorer-7.1');
  // A whole run for a kindergartner that misses everything lands in the Gardens, and the note says where.
  const state = P.createRunState({ grade: 'K', seed: 'tiers' });
  let guard = 0;
  while (!P.runFinished(state) && guard++ < 40) { const it = P.serveNext(state); if (!it) break; P.recordAnswer(state, it.strand, false); }
  const fin = P.finishRun(state);
  assert.equal(fin.startNode, 'launchpad-0.1'); assert.equal(fin.tier, 'launchpad');
  assert.equal(fin.workshop, 'Welcome to the Gardens');
  assert.equal(fin.note.launchpadGap, false); assert.equal(fin.note.launchpadLine, null);
  assert.equal(fin.note.placedUnit, 'Launchpad · Welcome to the Gardens');
  // Stored placements, overrides and the Just Play door name Launchpad nodes.
  const kid = newKid();
  assert.equal(P.placeAtBeginning(kid, 1).startNode, 'launchpad-0.1');
  assert.equal(P.overrideStartNode(kid, 'launchpad-2.1').startNode, 'launchpad-2.1');
  assert.equal(P.overrideStartNode(kid, 'launchpad-9.1'), null);
});

test('Launchpad open: the placed street is the learner’s default, earlier streets stay open, soft landing stays on its street', async () => {
  T.setTierStatus('launchpad', 'open');
  withLaunchpadUnits();
  const kid = newKid(), cookie = cookieFor(kid.id);
  P.overrideStartNode(kid, 'launchpad-2.1');
  // No band chosen: the path shows the street Tally (here, a grown-up) placed them on.
  const home = await get('/courses/number-quest', cookie);
  assert.match(home.text, /aria-label="The Numberworks street, Launchpad"/);
  assert.match(home.text, /Tally placed your start at <b lang="en" dir="ltr">Test Garden 2<\/b>/);
  // Everything at and before the start is open on its own street; Explorer opens step by step.
  assert.deepEqual(C.states(kid, course, 'launchpad').map(s => s.open), [true, true, true]);
  assert.deepEqual(C.states(kid, course, 'explorer').map(s => s.open).slice(0, 3), [true, false, false]);
  // A learner placed on a later street has the whole earlier street behind them.
  const older = newKid();
  P.overrideStartNode(older, 'explorer-3.1');
  assert.ok(C.states(older, course, 'launchpad').every(s => s.open));
  assert.equal(C.states(older, course, 'explorer').filter(s => s.open).length, 8, 'Explorer: open up to and including 3.1');
  // Soft landing: two missed checks in the start's own unit suggest the unit before it, on the same street.
  assert.equal(P.recordStartCheck(kid, 'explorer-2.1', false).startFails, 0, 'Explorer Unit 2 is not Launchpad Unit 2');
  assert.equal(P.recordStartCheck(kid, 'launchpad-2.1', false).softLandNode, null);
  assert.equal(P.recordStartCheck(kid, 'launchpad-2.1', false).softLandNode, 'launchpad-1.1');
  assert.equal(P.recordStartCheck(kid, 'launchpad-2.1', true).softLandNode, null);
  // Explorer's soft landing is what it was.
  P.recordStartCheck(older, 'explorer-3.2', false);
  assert.equal(P.recordStartCheck(older, 'explorer-3.1', false).softLandNode, 'explorer-2.1');
});

test('Launchpad open: test-outs and laps are stored per tier and never collide with Explorer’s unit numbers', async () => {
  T.setTierStatus('launchpad', 'open');
  withLaunchpadUnits();
  P.setEntryProfilesForTests({ 'launchpad-1.1': profile(0.5), 'launchpad-2.1': profile(1) });
  // Two tiers, one unit number, different items from different profiles.
  const lpItems = P.testOutItems(2, 'fixed', 'launchpad'), exItems = P.testOutItems(2, 'fixed');
  assert.equal(lpItems.length, 5); assert.equal(exItems.length, 5);
  assert.deepEqual(P.testOutItems(2, 'fixed', 'explorer'), exItems, 'Explorer is the default tier, dealt as before');
  assert.notDeepEqual(lpItems.map(i => i.itemSeed), exItems.map(i => i.itemSeed));
  assert.ok(lpItems.every(i => TEMPLATES.find(t => t.id === i.templateId).rung <= 1), 'Launchpad Unit 2 deals at its own profile’s rungs');
  assert.deepEqual(P.testOutItems(0, 'fixed', 'launchpad'), [], 'a unit without a profile has no test-out');
  // Pass Launchpad Unit 2's test-out over the API.
  const kid = newKid(), cookie = cookieFor(kid.id);
  const start = await post('/api/number-quest/testout/start', cookie, { unit: 2, tier: 'launchpad' });
  assert.equal(start.status, 200);
  let res = null, guard = 0;
  while (guard++ < 8) {
    const c = JSON.parse(q.get('SELECT current_item FROM nq_sort_runs WHERE id=? AND user_id=?', start.json.runId, kid.id).current_item);
    const full = generateItem(TEMPLATES.find(x => x.id === c.templateId), c.itemSeed);
    const r = await post('/api/number-quest/testout/answer', cookie, { runId: start.json.runId, answer: full.responseType === 'pick' ? { choice: full.answerIndex } : { value: String(full.answer) } });
    assert.equal(r.status, 200);
    if (r.json.result) { res = r.json.result; break; }
  }
  assert.ok(res); assert.equal(res.passed, true); assert.equal(res.tier, 'launchpad'); assert.equal(res.unit, 2); assert.equal(res.marks.awarded, true);
  assert.deepEqual(P.testedOutUnits(kid, 'launchpad'), [2]);
  assert.deepEqual(P.testedOutUnits(kid), [], 'Explorer Unit 2 is not tested out');
  assert.deepEqual(P.testedOutUnits(kid, 'explorer'), []);
  assert.deepEqual(q.all('SELECT tier, unit FROM nq_testout WHERE user_id=?', kid.id), [{ tier: 'launchpad', unit: 2 }]);
  // Explorer Unit 2 is its own test-out, its own row and its own marks.
  const ex = P.startRun(kid, { kind: 'testout', unit: 2 });
  guard = 0; res = null;
  while (guard++ < 8) {
    const c = JSON.parse(q.get('SELECT current_item FROM nq_sort_runs WHERE id=?', ex.runId).current_item);
    const full = generateItem(TEMPLATES.find(x => x.id === c.templateId), c.itemSeed);
    const r = P.answerRun(kid, ex.runId, full.responseType === 'pick' ? { choice: full.answerIndex } : { value: String(full.answer) });
    if (r.result) { res = r.result; break; }
  }
  assert.equal(res.tier, 'explorer'); assert.equal(res.marks.awarded, true, 'a second award: another tier’s unit is another thing done');
  assert.deepEqual(P.testedOutUnits(kid), [2]); assert.deepEqual(P.testedOutUnits(kid, 'launchpad'), [2]);
  assert.equal(q.get('SELECT COUNT(*) n FROM nq_testout WHERE user_id=?', kid.id).n, 2);
  const placement = await get('/api/number-quest/placement', cookie);
  assert.deepEqual(JSON.parse(placement.text).testedOutByTier, { launchpad: [2], explorer: [2] });
  assert.deepEqual(JSON.parse(placement.text).testedOut, [2]);
  // The route refuses a tier that does not exist and a unit without a profile; Explorer's own rule stands.
  assert.equal((await post('/api/number-quest/testout/start', cookie, { unit: 1, tier: 'pro' })).status, 400);
  assert.equal((await post('/api/number-quest/testout/start', cookie, { unit: 0, tier: 'launchpad' })).status, 400);
  assert.equal((await post('/api/number-quest/testout/start', cookie, { unit: 9 })).status, 400);
  // Laps: Launchpad Unit 1 and Explorer Unit 1 are different units.
  assert.equal(NQ.completeLap(kid, course, 'launchpad', 1, 1).recorded, true);
  assert.equal(NQ.lapState(kid, course, 'launchpad', 1).rings, 1);
  assert.equal(NQ.lapState(kid, course, 'explorer', 1).rings, 0);
  assert.equal(NQ.completeLap(kid, course, 'explorer', 1, 1).recorded, true);
  assert.deepEqual(q.all('SELECT tier, unit, lap FROM nq_laps WHERE user_id=? ORDER BY tier', kid.id), [{ tier: 'explorer', unit: 1, lap: 1 }, { tier: 'launchpad', unit: 1, lap: 1 }]);
  assert.deepEqual(NQ.lapsForTier(kid, course, 'launchpad').map(l => l.rings), [1, 0, 0, 0, 0, 0, 0]);
});

test('Launchpad open, then building again: the tier disappears for the learner, their rows stay', () => {
  T.setTierStatus('launchpad', 'open');
  const kid = newKid();
  assert.equal(C.setBand(kid, course, 'launchpad'), true);
  assert.equal(C.getBand(kid, course), 'launchpad');
  T.setTierStatus('launchpad', 'building');
  assert.equal(C.getBand(kid, course), null, 'a band the learner may not see reads as no band');
  assert.equal(C.stepFor(kid, course, 'launchpad-0.1'), null);
  assert.equal(q.get('SELECT band FROM course_bands WHERE user_id=? AND course=?', kid.id, 'number-quest').band, 'launchpad', 'nothing is deleted');
});
