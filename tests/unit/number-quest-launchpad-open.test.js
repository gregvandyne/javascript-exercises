// Number Quest: the Launchpad tier (grades K-2) is open to everyone (2026-11-13). The tier's own mechanics are in
// tests/unit/number-quest-tiers.test.js (which asks for the open or building state by its test hook); this file
// pins what the opening means with the data exactly as it ships (units.json, placement.json), no hooks:
//   - a learner who is not the admin sees Launchpad (band, street switcher, steps, teacher page); Pro (declared
//     as "building" on 2026-11-14) exists for the platform admin alone and for nobody else;
//   - where a brand-new K-2 learner starts (the Just Play door and the Sorting Game's short form);
//   - the locked Launchpad entry profiles: each garden is a landing, and a learner who meets all seven starts
//     at the Explorer welcome, never at the Launchpad finale;
//   - a learner who was already on the Explorer street is not moved: band, progress, stones (laps), marks and
//     the stored start are byte for byte what they were, even when their stored rungs would now point into
//     the gardens, and only a confirmed retake or a grown-up's override changes a start;
//   - the grown-up note says so in plain words, and no page says Launchpad is "still being built";
//   - a street walked to its end leads on to the next one.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { q, now } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const C = await import('../../server/services/courses.js');
const T = await import('../../server/services/number-quest-tiers.js');
const P = await import('../../server/services/number-quest-placement.js');
const NQ = await import('../../server/services/number-quest-progress.js');
const { nqFacts } = await import('../../server/routes/number-quest.js');
const { TEMPLATES, generateItem } = await import('../../seed-lessons/number-quest/placement/generator.js');
seed({ quiet: true });

const UNITS = JSON.parse(fs.readFileSync(new URL('../../seed-lessons/number-quest/units.json', import.meta.url), 'utf8'));
const PLACE = JSON.parse(fs.readFileSync(new URL('../../seed-lessons/number-quest/placement.json', import.meta.url), 'utf8'));
const course = C.getCourse('number-quest');
let n = 0;
const newKid = () => auth.createUser({ username: `nqo${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const parent = auth.createUser({ username: `nqopar${Date.now() % 1e6}`, password: 'correct-horse-12', displayName: 'Parent', accountType: 'grownup' });
const admin = auth.createUser({ username: `nqoadm${Date.now() % 1e6}`, password: 'correct-horse-12', displayName: 'Admin', role: 'admin' });

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (path, cookie) => { const r = await fetch(base + path, { headers: { ...H, ...(cookie ? { cookie } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const post = async (path, cookie, body, type = 'application/json') => {
  const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': type, ...(cookie ? { cookie } : {}) }, body: type === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body).toString() });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text, location: r.headers.get('location') };
};
const all = r => ({ number: r, algebra: r, 'shape-measure': r, 'data-chance': r });
const short = r => ({ number: r, 'shape-measure': r, 'data-chance': r }); // the K-2 form: no Algebra staircase
/** Finish a step the way the step APIs do (read, check passed, mission played and won). */
const finish = (kid, key) => {
  const step = C.getStep(course, key);
  C.markRead(kid, course, step); C.recordCheck(kid, course, step, { score: 3, passed: true }); NQ.awardCheckPassed(kid, course, key);
  if (step.game) { C.markPlayed(kid, course, step); C.markCompleted(kid, course, step); NQ.awardMissionCompleted(kid, course, key); }
};
/** Everything the platform stores about one learner's Number Quest, as rows: what "untouched" is compared on. */
const snapshot = kid => JSON.stringify({
  progress: q.all('SELECT * FROM course_progress WHERE user_id=? AND course=? ORDER BY step', kid.id, 'number-quest'),
  band: q.all('SELECT * FROM course_bands WHERE user_id=? AND course=?', kid.id, 'number-quest'),
  placement: q.all('SELECT * FROM nq_placement WHERE user_id=?', kid.id),
  laps: q.all('SELECT * FROM nq_laps WHERE user_id=? ORDER BY tier, unit, lap', kid.id),
  testout: q.all('SELECT * FROM nq_testout WHERE user_id=? ORDER BY tier, unit', kid.id),
  marks: NQ.totalMarks(kid, course),
});

test('the data: Launchpad is open, Pro is building and only the admin’s, and nothing in the app says Launchpad is being built', () => {
  assert.equal(UNITS.tiers.launchpad.status, 'open'); assert.equal(UNITS.tiers.explorer.status, 'open');
  assert.equal(UNITS.tiers.pro.status, 'building', 'Pro has its line since 2026-11-14, and it is not open');
  assert.deepEqual(T.openTiers(), ['launchpad', 'explorer'], 'the open streets are the two they were');
  assert.equal(T.statusOf('pro'), 'building'); assert.equal(T.exists('pro'), true); assert.equal(T.isOpen('pro'), false);
  for (const who of [null, newKid(), parent]) assert.equal(T.visibleTo(who, 'pro'), false, 'Pro is hidden from everyone who is not the platform admin: a visitor, a learner, a parent');
  assert.equal(T.visibleTo(admin, 'pro'), true, 'the platform admin previews the street while it is built');
  assert.deepEqual(T.visibleTiers(newKid()), ['launchpad', 'explorer']); assert.deepEqual(T.visibleTiers(parent), ['launchpad', 'explorer']); assert.deepEqual(T.visibleTiers(null), ['launchpad', 'explorer']);
  assert.deepEqual(T.visibleTiers(admin), ['launchpad', 'explorer', 'pro']);
  // The copy that said the gardens were unbuilt is gone from the code that wrote it.
  for (const f of ['server/services/number-quest-placement.js', 'server/routes/number-quest.js', 'server/views/number-quest-teacher.js', 'server/views/number-quest-path.js']) {
    const src = fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /gardens[^'`\n]{0,60}(are|is) still being built|tier is still being built|More streets are being built|opens with the Explorer street, for grades 3/, f);
    assert.doesNotMatch(src, /educationalLevel: 'Grades 3-5'/, f);
  }
  assert.doesNotMatch(PLACE.crosswalk.rule, /content deferred|until Launchpad ships/);
});

test('a learner who is not the admin sees Launchpad: the band, the street, its steps and the teacher page; Pro stays hidden', async () => {
  const kid = newKid(), cookie = cookieFor(kid.id);
  assert.deepEqual(C.bandsFor(course, kid), ['launchpad', 'explorer']);
  assert.deepEqual(C.bandsFor(course), ['launchpad', 'explorer'], 'a signed-out visitor too');
  assert.equal(C.stepFor(kid, course, 'launchpad-0.1').key, 'launchpad-0.1');
  assert.equal(C.stepFor(kid, course, 'pro-1.1'), null); assert.equal(C.stepFor(kid, course, 'pro-0.1'), null, 'the Pro welcome exists, and reads to a learner as a step that does not');
  // A brand-new learner: both street cards, the Sorting Game invitation, the switcher, and the Explorer street
  // drawn until they choose (it is the course's default street).
  const home = await get('/courses/number-quest', cookie);
  assert.equal(home.status, 200);
  assert.match(home.text, /id="band-launchpad"/); assert.match(home.text, /id="band-explorer"/);
  assert.doesNotMatch(home.text, /id="band-pro"|street-pro/);
  assert.match(home.text, /Grades K–2/); assert.match(home.text, /Grades 3–5/);
  assert.match(home.text, /Pick your street\./); assert.match(home.text, /Sorting Game/);
  assert.match(home.text, /id="nqp-streets"/);
  assert.doesNotMatch(home.text, /being built<\/span>|· being built/, 'no street is marked as being built');
  assert.doesNotMatch(home.text, /More streets are being built/);
  assert.match(home.text, /aria-label="The Numberworks street, Explorer"/);
  // Picking Launchpad makes it the learner's street, and its first step opens.
  const pick = await post('/courses/number-quest/band', cookie, { band: 'launchpad' }, 'application/x-www-form-urlencoded');
  assert.equal(pick.status, 303); assert.equal(C.getBand(kid, course), 'launchpad');
  const street = await get('/courses/number-quest', cookie);
  assert.match(street.text, /aria-label="The Numberworks street, Launchpad"/);
  assert.match(street.text, /href="\/courses\/number-quest\/launchpad-0\.1"/);
  assert.match(street.text, /The Counting Patch/); assert.match(street.text, /The Garden Gate/);
  assert.doesNotMatch(street.text, /id="step-explorer-/, 'a street renders only its own units');
  const step = await get('/courses/number-quest/launchpad-0.1', cookie);
  assert.equal(step.status, 200); assert.match(step.text, /Meet Tally in the Gardens/);
  assert.equal((await get('/courses/number-quest/pro-1.1', cookie)).status, 404);
  assert.equal((await get('/courses/number-quest/pro-0.1', cookie)).status, 404, 'the built Pro welcome is a 404 for a learner');
  assert.equal((await get('/courses/number-quest/pro-0.1')).status, 404, 'and for a signed-out visitor');
  assert.doesNotMatch((await get('/courses/number-quest?street=pro', cookie)).text, /The Towers|Welcome to the Towers|street-pro|nqp-planned|Ratio Gear/, 'asking for the Pro street by name shows nothing of it');
  assert.equal((await post('/courses/number-quest/band', cookie, { band: 'pro' }, 'application/x-www-form-urlencoded')).status, 303);
  assert.equal(C.getBand(kid, course), 'launchpad', 'the Pro band cannot be picked');
  // Signed out: the same two streets, and the Launchpad welcome is a real page.
  const out = await get('/courses/number-quest');
  assert.match(out.text, /id="band-launchpad"/); assert.match(out.text, /id="street-launchpad"/);
  assert.equal((await get('/courses/number-quest/launchpad-0.1')).status, 200);
  // A parent reading the course looks at either street by link, and is given no doors and no band to move.
  const pc = cookieFor(parent.id);
  const grown = await get('/courses/number-quest?street=launchpad', pc);
  assert.match(grown.text, /aria-label="The Numberworks street, Launchpad"/);
  assert.match(grown.text, /href="\/courses\/number-quest\?street=explorer"/);
  assert.doesNotMatch(grown.text, /href="\/courses\/number-quest\/launchpad-0\.1"/);
  assert.equal(C.getBand(parent, course), null);
});

test('the teacher page publishes both streets, with every count worked out from the catalogue, and no price', async () => {
  const cat = C.numberQuestCatalogue();
  const facts = nqFacts(cat);
  // The public counts are the OPEN streets' (Pro is declared in the file since 2026-11-14, building, and counted nowhere public).
  const OPEN = UNITS.units.filter(u => ['launchpad', 'explorer'].includes(u.tier));
  const steps = OPEN.reduce((k, u) => k + u.steps.length, 0);
  assert.deepEqual({ streets: facts.streets, units: facts.units, steps: facts.steps, grades: facts.grades, gradesPlain: facts.gradesPlain }, { streets: 2, units: 14, steps, grades: 'K–5', gradesPlain: 'K-5' });
  assert.equal(steps, 46);
  assert.deepEqual(facts.games.map(g => g.slug), ['garden-count', 'lily-hop', 'crate-stacker', 'balance-bridge', 'rocket-supply', 'shape-hunt', 'kitchen-rush', 'brain-board', 'sum-racer', 'quest-race', 'fraction-factory', 'data-detective']);
  // Every game a step plays is on the list, and nothing else is.
  const played = new Set(OPEN.flatMap(u => u.steps.map(s => (s.game[u.tier] || {}).slug).filter(Boolean)));
  assert.deepEqual([...played].sort(), facts.games.map(g => g.slug).sort());
  const page = await get('/teachers/number-quest');
  assert.equal(page.status, 200);
  assert.match(page.text, /<title>[^<]*grades K–5/);
  assert.match(page.text, /For teachers · grades K–5/);
  assert.match(page.text, />46 steps</); assert.match(page.text, />2 streets · 14 units</); assert.match(page.text, />12 games</);
  assert.match(page.text, /12 games carry the course/);
  for (const title of ['Garden Count', 'Lily Hop', 'Crate Stacker', 'Balance Bridge', 'Rocket Supply', 'Shape Hunt', 'Kitchen Rush', 'Brain Board', 'Sum Racer', 'Quest Race', 'Fraction Factory', 'Data Detective']) assert.match(page.text, new RegExp(`<h3 lang="en" dir="ltr">${title}</h3>`), title);
  assert.match(page.text, /Launchpad · Welcome to the Gardens/); assert.match(page.text, /Launchpad · Unit 7 · The Measuring Meadow/);
  assert.match(page.text, /Explorer · Unit 1 · The Counting House/);
  assert.match(page.text, /"educationalLevel":"Grades K-5"/);
  assert.match(page.text, /K\.CC\.A\.1/, 'the Launchpad codes are on the map');
  assert.doesNotMatch(page.text, /grades 3–5, mapped|23 short steps|Twenty-three steps|Six games|Five games|not built yet, and their codes/);
  assert.doesNotMatch(page.text, /The Towers|Welcome to the Towers|Pro ·|Ratio Gear|Planned units|6\.RP\.A\.1|grades K–8, mapped/, 'nothing of the Pro street is on the public teacher page');
  assert.doesNotMatch(page.text, /gardens[^<]{0,80}still being built|tier is still being built/);
  assert.match(page.text, /A rung under the Explorer starting line starts in the Launchpad gardens/, 'the placement matrix says where K-2 lands');
  // Kids are never sold to: no price on the public Number Quest pages.
  // (The one money amount on the teacher page is a lesson's own example, Unit 5's "$2.05" at the till: it is set aside by name.)
  for (const text of [page.text, (await get('/courses/number-quest')).text, (await get('/courses/number-quest?street=launchpad')).text]) {
    const seen = text.replace(/<script[\s\S]*?<\/script>/g, '').replace(/reads \$2\.05 as two dollars and five cents/g, '');
    assert.doesNotMatch(seen, /[$€£]\s?\d|\bper month\b|\/month|\bpricing\b|\bsubscribe\b|href="\/(plans|pricing|upgrade)\b/i);
  }
  // With the gardens closed again the same page counts Explorer alone: the numbers are the catalogue's, not typed.
  T.setTierStatus('launchpad', 'building');
  try {
    const alone = nqFacts(C.numberQuestCatalogue());
    assert.deepEqual({ streets: alone.streets, units: alone.units, steps: alone.steps, grades: alone.grades, games: alone.games.length }, { streets: 1, units: 7, steps: 23, grades: '3–5', games: 5 });
    const closed = await get('/teachers/number-quest');
    assert.match(closed.text, />23 steps</); assert.match(closed.text, />One street · 7 units</); assert.doesNotMatch(closed.text, /Garden Count<\/h3>/);
  } finally { T.setTierStatus('launchpad', null); }
});

test('the locked Launchpad entry profiles: one per unit door, evidenced, and every garden is a landing', () => {
  const prof = PLACE.crosswalk.entryProfiles;
  assert.deepEqual(Object.keys(prof).filter(k => k.startsWith('launchpad-')).sort(), [1, 2, 3, 4, 5, 6, 7].map(u => `launchpad-${u}.1`));
  const row = k => [prof[k].Number, prof[k]['Algebra & Patterns'], prof[k]['Shape & Measure'], prof[k]['Data & Chance']];
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(u => row(`launchpad-${u}.1`)), [
    [0.5, 0, 0, 0],     // The Counting Patch: K.CC, K.NBT.A (Number K.5)
    [0.5, 1, 0, 0],     // The Joining Pond: K.OA.A, facts to 20 (Algebra 1.0)
    [1.5, 1, 0, 0],     // The Tens Trellis: 1.NBT (Number 1.5)
    [1.5, 2, 0, 0],     // The Balance Bridge: 1.OA.D, 1.OA.A, 2.OA.A (Algebra 2.0)
    [2.5, 2, 0, 0],     // The Hundreds Hedge: 2.NBT (Number 2.5)
    [2.5, 2, 2, 0],     // The Shape Shed: K.G, 1.G.A, 2.G.A (Shape & Measure 2.0)
    [2.5, 2, 2.5, 2],   // The Measuring Meadow: 2.MD.A/C (Shape & Measure 2.5), 2.MD.D (Data & Chance 2.0)
  ]);
  assert.match(PLACE.crosswalk.launchpadProfiles, /Unit 7 The Measuring Meadow/, 'the evidence is written beside the profiles');
  // Each rung a profile asks is a locked rung whose clusters the unit really teaches (the unit's own codes).
  const rungKey = r => (r === 0 ? 'K.0' : r === 0.5 ? 'K.5' : r % 1 ? String(r) : `${r}.0`);
  const cluster = code => code.split('.').slice(0, 3).join('.');
  const taught = u => new Set(UNITS.units.find(x => x.tier === 'launchpad' && x.n === u).steps.flatMap(s => [...s.standards.launchpad.primary, ...s.standards.launchpad.also]).map(cluster));
  const asks = { 1: ['Number'], 2: ['Algebra & Patterns'], 3: ['Number'], 4: ['Algebra & Patterns'], 5: ['Number'], 6: ['Shape & Measure'], 7: ['Shape & Measure', 'Data & Chance'] };
  for (const [u, strands] of Object.entries(asks)) for (const strand of strands) {
    const rung = prof[`launchpad-${u}.1`][strand];
    // The rung itself, or (Unit 2 only: the facts to 20 it ends on are sampled by rung 1.0's 1.OA.A/B items) the same grade's clusters.
    const cell = PLACE.strands[strand].lockedRungs[rungKey(rung)];
    assert.ok(cell, `Unit ${u}: ${strand} ${rung} is a locked rung`);
    const unit = taught(+u);
    const hit = cell.clusters.some(c => unit.has(c)) || (+u === 2 && cell.clusters.includes('1.OA.B'));
    assert.ok(hit, `Unit ${u}: rung ${rungKey(rung)} of ${strand} (${cell.clusters}) samples what the unit teaches (${[...unit]})`);
  }
  // The walk, on the short K-2 form (Number speaks for Algebra): every half rung has its own landing.
  assert.deepEqual([0, 0.5, 1, 1.5, 2].map(r => P.crosswalk(short(r)).node), ['launchpad-0.1', 'launchpad-2.1', 'launchpad-3.1', 'launchpad-4.1', 'launchpad-5.1']);
  assert.equal(P.crosswalk({ number: 2.5, 'shape-measure': 1.5, 'data-chance': 2.5 }).node, 'launchpad-6.1', 'numbers secure, shapes not yet: the Shape Shed');
  assert.equal(P.crosswalk({ number: 2.5, 'shape-measure': 2, 'data-chance': 2.5 }).node, 'launchpad-7.1', 'the Measuring Meadow');
  assert.equal(P.crosswalk({ number: 2.5, 'shape-measure': 2.5, 'data-chance': 1.5 }).node, 'launchpad-7.1', 'graphs not yet: still the Measuring Meadow');
  // The standard form (four staircases) walks the same doors; a near-miss resolves to the lower unit.
  assert.equal(P.crosswalk({ number: 3, algebra: 1.5, 'shape-measure': 3, 'data-chance': 3 }).node, 'launchpad-4.1');
  assert.equal(P.crosswalk({ number: 1, algebra: 3, 'shape-measure': 3, 'data-chance': 3 }).node, 'launchpad-3.1');
  for (const r of [0, 0.5, 1, 1.5, 2]) { const cw = P.crosswalk(all(r)); assert.equal(cw.tier, 'launchpad'); assert.equal(cw.launchpadGap, false); assert.equal(cw.finaleDoor, false); }
  // At or over the line nothing changed for Explorer.
  assert.equal(P.crosswalk(all(2.5)).node, 'explorer-2.1'); assert.equal(P.crosswalk(all(8)).node, 'explorer-7.4');
  // Start nodes a grown-up can choose: every Launchpad door, then every Explorer door; the finale doors last on each street.
  assert.deepEqual(P.startNodes().map(x => x.node), ['launchpad-0.1', 'launchpad-1.1', 'launchpad-2.1', 'launchpad-3.1', 'launchpad-4.1', 'launchpad-5.1', 'launchpad-6.1', 'launchpad-7.1', 'launchpad-7.4',
    'explorer-0.1', 'explorer-1.1', 'explorer-2.1', 'explorer-3.1', 'explorer-4.1', 'explorer-5.1', 'explorer-6.1', 'explorer-7.1', 'explorer-7.4']);
  // Test-out reads the same profiles, per street.
  assert.equal(P.testOutItems(3, 'fixed', 'launchpad').length, 5);
  assert.notDeepEqual(P.testOutItems(3, 'fixed', 'launchpad').map(i => i.templateId), P.testOutItems(3, 'fixed').map(i => i.templateId));
});

test('a learner who meets every Launchpad profile starts at the Explorer welcome, never at the Launchpad finale', () => {
  // Every garden's profile met, one strand still under the Explorer line (Data & Chance 2.0, Algebra 2.0).
  const met = { number: 2.5, algebra: 2, 'shape-measure': 2.5, 'data-chance': 2 };
  assert.deepEqual(P.crosswalk(met), { node: 'explorer-0.1', tier: 'explorer', launchpadGap: false, finaleDoor: false });
  assert.deepEqual(P.crosswalk({ number: 2.5, 'shape-measure': 2.5, 'data-chance': 2 }), { node: 'explorer-0.1', tier: 'explorer', launchpadGap: false, finaleDoor: false }, 'the short form too');
  assert.notEqual(P.crosswalk(met).node, 'launchpad-7.4');
  // The same learner through a whole run: the child hears the Explorer welcome, the note says why, plainly.
  const state = P.createRunState({ grade: 2, seed: 'all-met' });
  state.strands.number.correct = { '2.5': 2 }; state.strands['shape-measure'].correct = { '2.5': 2 }; state.strands['data-chance'].correct = { '2': 2 };
  for (const k of Object.keys(state.strands)) state.strands[k].done = true;
  const fin = P.finishRun(state);
  assert.equal(fin.startNode, 'explorer-0.1'); assert.equal(fin.tier, 'explorer'); assert.equal(fin.workshop, 'Welcome to the Numberworks');
  assert.equal(fin.finaleDoor, false); assert.equal(fin.finaleLine, null);
  assert.equal(fin.note.launchpadGap, false);
  assert.match(fin.note.launchpadLine, /every Launchpad garden's entry profile was met, so the start is Welcome to the Numberworks on the Explorer street/);
  // Such a learner has the whole Launchpad street open behind them (the streets are sequential).
  const kid = newKid();
  assert.equal(P.overrideStartNode(kid, 'explorer-0.1').startNode, 'explorer-0.1');
  assert.ok(C.states(kid, course, 'launchpad').every(s => s.open), 'every garden stays open for games and review');
});

test('a brand-new K-2 learner: Just Play starts at the Launchpad welcome; the short Sorting Game lands in a garden', () => {
  // The Just Play door: the first step of the tier matching the grade.
  for (const g of ['K', 1, 2]) {
    const kid = newKid();
    const p = P.placeAtBeginning(kid, g);
    assert.equal(p.startNode, 'launchpad-0.1', `grade ${g}`); assert.equal(p.source, 'beginning');
    assert.equal(P.nodeInfo(p.startNode).workshop, 'Welcome to the Gardens');
  }
  assert.equal(P.beginningNode(3), 'explorer-1.1'); assert.equal(P.beginningNode(5), 'explorer-1.1'); assert.equal(P.beginningNode(8), 'explorer-7.1', 'grades 3 to 8 begin where they did');
  // The Sorting Game for a named grade of K, 1 or 2 is the short audio-first form: three strands, four questions each.
  for (const g of ['K', 1, 2]) {
    const state = P.createRunState({ grade: g, seed: `k2-${g}` });
    assert.equal(state.form, 'launchpad'); assert.deepEqual(Object.keys(state.strands), ['number', 'shape-measure', 'data-chance']);
    let served = 0;
    while (!P.runFinished(state) && served < 40) { const it = P.serveNext(state); if (!it) break; served++; assert.equal(it.audioFirst, true); P.recordAnswer(state, it.strand, false); }
    assert.ok(served <= 12, 'at most twelve questions');
    // Nothing right: the start is the very first step of the gardens, said as a place, with no gap to flag.
    const fin = P.finishRun(state);
    assert.equal(fin.startNode, 'launchpad-0.1', `grade ${g}, nothing right`); assert.equal(fin.tier, 'launchpad');
    assert.equal(fin.workshop, 'Welcome to the Gardens'); assert.equal(fin.note.placedUnit, 'Launchpad · Welcome to the Gardens');
    assert.equal(fin.note.launchpadGap, false); assert.equal(fin.note.launchpadLine, null);
    // What the child's page prints from the result: a place and a picture of the tour, never a score or a rung.
    assert.ok(!JSON.stringify([fin.workshop, fin.finaleLine, fin.picture]).match(/score|percent|rung|\d\.\d/i), 'the child is shown a place, never a score');
  }
  // A whole stored run, answered through the service as the page does: a grade 1 learner who gets everything
  // right climbs out of the gardens or lands high in them; one who gets everything wrong starts at the welcome.
  const answer = (kid, runId, right) => {
    const cur = JSON.parse(q.get('SELECT current_item FROM nq_sort_runs WHERE id=?', runId).current_item);
    const full = generateItem(TEMPLATES.find(t => t.id === cur.templateId), cur.itemSeed);
    const a = full.responseType === 'pick' ? { choice: right ? full.answerIndex : (full.answerIndex + 1) % full.choices.length } : { value: right ? String(full.answer) : 'zzz' };
    return P.answerRun(kid, runId, a);
  };
  const play = (grade, right) => { const kid = newKid(); const out = P.startRun(kid, { grade }); let res = null, guard = 0; while (guard++ < 40 && !res) res = answer(kid, out.runId, right).result; return { kid, res }; };
  const lo = play(1, false);
  assert.equal(lo.res.startNode, 'launchpad-0.1'); assert.equal(P.getPlacement(lo.kid).startNode, 'launchpad-0.1');
  assert.equal(P.getPlacement(lo.kid).source, 'sorting-game');
  const hi = play(1, true);
  assert.equal(hi.res.tier, 'launchpad', 'a grade 1 run cannot climb past rung 2.5 in four questions a strand');
  assert.ok(['launchpad-4.1', 'launchpad-5.1', 'launchpad-6.1', 'launchpad-7.1'].includes(hi.res.startNode), hi.res.startNode);
  assert.equal(P.getPlacement(hi.kid).startNode, hi.res.startNode);
  // No column was added for any of this: placement stores what it always stored.
  assert.deepEqual(q.all("SELECT name FROM pragma_table_info('nq_placement')").map(r => r.name).sort(),
    ['course', 'disabled', 'grade', 'grade_declared_at', 'rungs', 'soft_land_node', 'source', 'start_fails', 'start_node', 'updated_at', 'user_id']);
});

test('a new K-2 learner’s path: the placed garden is their street, with no band chosen', async () => {
  const kid = newKid(), cookie = cookieFor(kid.id);
  P.placeAtBeginning(kid, 'K');
  const home = await get('/courses/number-quest', cookie);
  assert.match(home.text, /aria-label="The Numberworks street, Launchpad"/, 'the street Tally placed them on');
  assert.match(home.text, /Tally placed your start at <b lang="en" dir="ltr">Welcome to the Gardens<\/b>/);
  assert.match(home.text, /href="\/courses\/number-quest\/launchpad-0\.1" id="cmap-go"/);
  assert.match(home.text, /href="\/courses\/number-quest\/launchpad-0\.1"/);
  assert.doesNotMatch(home.text, /id="bandpick-h"/, 'a placed learner is not asked to pick again');
  assert.match(home.text, /id="street-explorer"/, 'Explorer is one tap away');
  assert.equal(C.getBand(kid, course), null);
});

test('an existing Explorer learner is not moved: band, progress, stones, marks and start are untouched', async () => {
  // A learner as they stood before the opening: on the Explorer street, the welcome and Unit 1 done (its
  // stone planted, Lap 1 recorded), a test-out passed, placed by the game at Unit 2.
  const kid = newKid(), cookie = cookieFor(kid.id);
  C.setBand(kid, course, 'explorer');
  ['explorer-0.1', 'explorer-1.1', 'explorer-1.2', 'explorer-1.3'].forEach(k => finish(kid, k));
  NQ.completeLap(kid, course, 'explorer', 1, 1);
  q.run(`INSERT INTO nq_placement(user_id, course, grade, grade_declared_at, rungs, start_node, source, start_fails, soft_land_node, updated_at) VALUES (?,?,?,?,?,?,?,0,NULL,?)`,
    kid.id, 'number-quest', 3, now(), JSON.stringify(all(2.5)), 'explorer-2.1', 'sorting-game', now());
  q.run('INSERT INTO nq_testout(user_id, course, tier, unit, passed_at) VALUES (?,?,?,?,?)', kid.id, 'number-quest', 'explorer', 2, now());
  const before = snapshot(kid);
  // Reading every surface a learner and their grown-ups open changes nothing.
  const home = await get('/courses/number-quest', cookie);
  assert.match(home.text, /aria-label="The Numberworks street, Explorer"/, 'still on the Explorer street');
  assert.match(home.text, /Counting Stone planted/); assert.match(home.text, /Lap 1 done/);
  assert.match(home.text, /Tally placed your start at <b lang="en" dir="ltr">Joining &amp; Splitting<\/b>/);
  assert.match(home.text, /href="\/courses\/number-quest\/explorer-2\.1" id="cmap-go"/, 'the way forward is where it was');
  assert.doesNotMatch(home.text, /id="bandpick-h"/);
  assert.match(home.text, /id="street-launchpad"/, 'the new street is offered, not imposed');
  await get('/courses/number-quest?street=launchpad', cookie);
  await get('/courses/number-quest/explorer-2.1', cookie);
  await get('/api/number-quest/placement', cookie);
  assert.equal(snapshot(kid), before, 'nothing stored about the learner changed');
  assert.equal(C.getBand(kid, course), 'explorer');
  assert.equal(C.overview(kid, course).done, 4); assert.equal(NQ.lapState(kid, course, 'explorer', 1).rings, 1);
  assert.deepEqual(P.testedOutUnits(kid), [2]);
  // The gardens are open behind them, all of it, and looking in costs nothing.
  assert.ok(C.states(kid, course, 'launchpad').every(s => s.open));
  // Visiting Launchpad and coming back: the band moves by the learner's own tap, and Explorer's rows are as they were.
  await post('/courses/number-quest/band', cookie, { band: 'launchpad' }, 'application/x-www-form-urlencoded');
  assert.equal(C.getBand(kid, course), 'launchpad');
  await post('/courses/number-quest/band', cookie, { band: 'explorer' }, 'application/x-www-form-urlencoded');
  const after = JSON.parse(snapshot(kid)), was = JSON.parse(before);
  assert.deepEqual(after.progress, was.progress); assert.deepEqual(after.placement, was.placement); assert.deepEqual(after.laps, was.laps);
  assert.deepEqual(after.testout, was.testout); assert.equal(after.marks, was.marks); assert.equal(after.band[0].band, 'explorer');
});

test('a learner placed at the Explorer welcome before the gardens opened stays there; only a confirmed retake or an override moves them', async () => {
  // Before 2026-11-13 a run with a strand under the Explorer line started at explorer-0.1 with the gap flagged.
  const kid = newKid(), cookie = cookieFor(kid.id);
  const rungs = { number: 1, algebra: 1, 'shape-measure': 1.5, 'data-chance': 1 };
  q.run(`INSERT INTO nq_placement(user_id, course, grade, grade_declared_at, rungs, start_node, source, start_fails, soft_land_node, updated_at) VALUES (?,?,?,?,?,?,?,0,NULL,?)`,
    kid.id, 'number-quest', 3, now(), JSON.stringify(rungs), 'explorer-0.1', 'sorting-game', now());
  finish(kid, 'explorer-0.1'); finish(kid, 'explorer-1.1');
  const before = snapshot(kid);
  assert.equal(P.crosswalk(rungs).node, 'launchpad-3.1', 'the same answers would start in the gardens today');
  const home = await get('/courses/number-quest', cookie);
  assert.match(home.text, /aria-label="The Numberworks street, Explorer"/, 'their street is still Explorer');
  assert.match(home.text, /href="\/courses\/number-quest\/explorer-1\.2" id="cmap-go"/, 'and their next step is the one after their progress');
  assert.equal(P.getPlacement(kid).startNode, 'explorer-0.1');
  assert.equal(snapshot(kid), before);
  // The grown-up note says what happened and what they can do, and moves nothing.
  const adminCookie = cookieFor(admin.id);
  const note = await get(`/number-quest/starting-point?child=${kid.id}`, adminCookie);
  assert.equal(note.status, 200);
  assert.match(note.text, /Placed start:<\/b> Unit 0: Welcome to the Numberworks/);
  assert.match(note.text, /This start point was set before the Launchpad gardens \(kindergarten to grade 2\) opened; on the same answers the Sorting Game would now start this learner at Launchpad · Unit 3: The Tens Trellis\. Nothing has been moved and no progress has changed/);
  assert.doesNotMatch(note.text, /still being built/);
  assert.match(note.text, /<option value="launchpad-3\.1"/, 'the override offers the gardens');
  assert.equal(snapshot(kid), before, 'reading the note moved nothing');
  // A retake places only when the learner confirms it.
  const run = P.startRun(kid, { grade: 1 });
  const fin = P.finishEarly(kid, run.runId);
  assert.equal(fin.pendingRetake, true);
  assert.equal(P.getPlacement(kid).startNode, 'explorer-0.1', 'an unconfirmed retake changes nothing');
  assert.equal(P.keepOriginal(kid).startNode, 'explorer-0.1');
  // A grown-up's override is absolute, and progress on the Explorer street stays whatever they choose.
  const moved = await post('/api/number-quest/placement/override', adminCookie, { child: kid.id, node: 'launchpad-3.1' });
  assert.equal(moved.status, 200); assert.equal(moved.json.placement.startNode, 'launchpad-3.1'); assert.equal(moved.json.placement.source, 'override');
  assert.deepEqual(JSON.parse(snapshot(kid)).progress, JSON.parse(before).progress);
  const after = await get(`/number-quest/starting-point?child=${kid.id}`, adminCookie);
  assert.match(after.text, /Placed start:<\/b> Launchpad · Unit 3: The Tens Trellis/);
  assert.doesNotMatch(after.text, /This start point was set before/);
});

test('the Garden Gate leads on: a Launchpad street walked to its end offers Explorer, and Explorer opens at its welcome', async () => {
  const kid = newKid(), cookie = cookieFor(kid.id);
  C.setBand(kid, course, 'launchpad');
  const keys = C.steps(course, 'launchpad').map(s => s.key);
  assert.equal(keys.at(-1), 'launchpad-7.4'); assert.equal(C.getStep(course, 'launchpad-7.4').title, 'The Garden Gate');
  keys.slice(0, -1).forEach(k => finish(kid, k));
  let home = await get('/courses/number-quest', cookie);
  assert.doesNotMatch(home.text, /id="nqp-onward"/, 'not before the finale is done');
  assert.match(home.text, /href="\/courses\/number-quest\/launchpad-7\.4" id="cmap-go"/);
  finish(kid, 'launchpad-7.4');
  home = await get('/courses/number-quest', cookie);
  assert.match(home.text, /id="nqp-onward"/);
  assert.match(home.text, /You walked the whole Launchpad street!/);
  assert.match(home.text, /The next street is Explorer, for grades 3–5\./);
  assert.match(home.text, /<button[^>]*name="band" value="explorer" id="nqp-onward-go"/);
  assert.match(home.text, /Measuring Seed planted/, 'the seeds stay planted');
  // Walking on: Explorer becomes their street and opens at its own welcome; the gardens keep every step done.
  await post('/courses/number-quest/band', cookie, { band: 'explorer' }, 'application/x-www-form-urlencoded');
  home = await get('/courses/number-quest', cookie);
  assert.match(home.text, /aria-label="The Numberworks street, Explorer"/);
  assert.match(home.text, /href="\/courses\/number-quest\/explorer-0\.1" id="cmap-go"/);
  assert.doesNotMatch(home.text, /id="nqp-onward"/);
  assert.equal(C.overview(kid, course, 'launchpad').done, 23);
  // The end of the last open street offers nothing further (Pro is being built: it is not a street a learner can walk on to).
  const top = newKid(); C.setBand(top, course, 'explorer');
  C.steps(course, 'explorer').forEach(s => finish(top, s.key));
  assert.doesNotMatch((await get('/courses/number-quest', cookieFor(top.id))).text, /id="nqp-onward"/);
});
