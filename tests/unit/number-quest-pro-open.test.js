// Number Quest: the Pro tier (grades 6-8, The Towers) is open to everyone (2026-11-15). All seven units and the finale
// (7.4, The Great Clock) were built first; units.json tiers.pro.status went from "building" to "open", and that is the
// only switch. Pinned here, with the data exactly as it ships (no hooks, except where a test compares the open state with
// the building one it replaced, by the test-only status hook):
//   - the data: three open streets, nothing planned, the program line names grades K-8;
//   - THE LEARNER STREET: a learner who is not the admin sees three street cards, picks Pro and walks it from its
//     welcome; a signed-out visitor sees it too; test-outs are offered for every built Pro unit (the rebuilt rung
//     6.0-8.0 bank deals them); nothing on a kid page is priced, and no Pro game's title, description or tags names
//     the tier;
//   - THE CATALOGUE AND THE TEACHER PAGE: counts, the seven Pro games in the game list with their own descriptions,
//     the Pro map, what Pro does not cover (generated from standards.json proCoverage, headline gaps first), the
//     placement matrix and explainer naming the Pro street, the Learn tab's K-8 line, and no price;
//   - THE CROSSING RULE: every possible set of placed rungs, and a whole Sorting Game for every named grade and
//     ability, starts where it started while Pro was building, except exactly the sets with every strand at rung 5.5
//     or over (the Pro starting line), which start on the Pro street; "Just Play" with grade 6-8 starts at the Pro
//     welcome;
//   - NOBODY IS MOVED: a learner placed at the Vault of Measures before the opening stays there, and the grown-up
//     note says where the same answers would start today;
//   - THE COPY: every locale's course lines say grade 8 (or the local equivalent), and the English course copy
//     names three streets.
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
const { nqFacts } = await import('../../server/routes/number-quest.js');
const { proCoverageSection, placementSection } = await import('../../server/views/number-quest-teacher.js');
const { TEMPLATES } = await import('../../seed-lessons/number-quest/placement/generator.js');
seed({ quiet: true });

const read = f => JSON.parse(fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const UNITS = read('seed-lessons/number-quest/units.json');
const REG = read('seed-lessons/number-quest/standards.json');
const course = C.getCourse('number-quest');
let n = 0;
const newKid = () => auth.createUser({ username: `nqpo${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const parent = auth.createUser({ username: `nqpopar${Date.now() % 1e6}`, password: 'correct-horse-12', displayName: 'Parent', accountType: 'grownup' });
const admin = auth.createUser({ username: `nqpoadm${Date.now() % 1e6}`, password: 'correct-horse-12', displayName: 'Admin', role: 'admin' });

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.afterEach(() => { T.setTierStatus('pro', null); });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (path, cookie) => { const r = await fetch(base + path, { headers: { ...H, ...(cookie ? { cookie } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const post = async (path, cookie, body, type = 'application/json') => {
  const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': type, ...(cookie ? { cookie } : {}) }, body: type === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body).toString() });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text, location: r.headers.get('location') };
};
const noScripts = t => t.replace(/<script[\s\S]*?<\/script>/g, '');
const PRICE = /[$€£]\s?\d|\bper month\b|\/month|\bpricing\b|\bsubscribe\b|href="\/(plans|pricing|upgrade)\b/i;
const rungs = (number, algebra, shape, data) => ({ number, algebra, 'shape-measure': shape, 'data-chance': data });
const all = r => rungs(r, r, r, r);
const PRO_GAMES = ['lantern-mix', 'sub-zero', 'machine-line', 'scale-scout', 'sky-lines', 'keep-builder', 'launch-lab'];
const PRO_TITLES = ['Lantern Mix', 'Sub Zero', 'Machine Line', 'Scale Scout', 'Sky Lines', 'Keep Builder', 'Launch Lab'];

// ------------------------------------------------------------------------------------------------- the data
test('the data: Pro is open, nothing in it is planned, three streets are open to everyone', () => {
  assert.equal(UNITS.tiers.pro.status, 'open');
  assert.deepEqual(UNITS.units.filter(u => u.tier === 'pro' && (u.planned || u.reserved || u.steps.some(s => s.planned || s.reserved))), []);
  assert.deepEqual(T.openTiers(), ['launchpad', 'explorer', 'pro']);
  for (const who of [null, newKid(), parent, admin]) { assert.deepEqual(T.visibleTiers(who), ['launchpad', 'explorer', 'pro']); assert.deepEqual(C.bandsFor(course, who), ['launchpad', 'explorer', 'pro']); }
  assert.equal(C.defaultBand(course, newKid()), 'explorer', 'a viewer with no band and no placement is still shown the Explorer street');
  assert.match(UNITS.program.standards, /grades K-8: Launchpad \(K-2\), Explorer \(3-5\) and Pro \(6-8, the major work of the grades\)/);
  assert.doesNotMatch(UNITS.program.standards, /Explorer tier grades 3-5/);
  assert.match(UNITS.about, /PRO OPEN \(2026-11-15\)/);
  assert.deepEqual(C.deckProblems('pro', 'number-quest'), []);
  assert.equal(C.steps(course, 'pro').length, 23);
});

// ------------------------------------------------------------------------------------------------- the learner street
test('the learner street: three street cards, a learner picks Pro and walks it from the welcome; a visitor sees it too; no price', async () => {
  const kid = newKid(), cookie = cookieFor(kid.id);
  const home = await get('/courses/number-quest', cookie);
  assert.equal(home.status, 200);
  for (const k of ['launchpad', 'explorer', 'pro']) { assert.match(home.text, new RegExp(`id="band-${k}"`)); assert.match(home.text, new RegExp(`id="street-${k}"`)); }
  assert.match(home.text, /Grades K–2/); assert.match(home.text, /Grades 3–5/); assert.match(home.text, /Grades 6–8/);
  assert.doesNotMatch(home.text, /being built<\/span>|· being built/, 'no street is marked as being built');
  const pick = await post('/courses/number-quest/band', cookie, { band: 'pro' }, 'application/x-www-form-urlencoded');
  assert.equal(pick.status, 303); assert.equal(C.getBand(kid, course), 'pro');
  const street = await get('/courses/number-quest', cookie);
  assert.match(street.text, /aria-label="The Numberworks street, Pro"/);
  assert.match(street.text, /href="\/courses\/number-quest\/pro-0\.1" id="cmap-go"/, 'the way forward is the Pro welcome');
  for (const title of ['Welcome to the Towers', 'The Mixing Tower', 'The Cold Store', 'The Machine Hall', 'The Map Room', 'The Sky Wires', 'The Drafting Keep', 'The Test Range', 'The Great Clock']) assert.match(street.text, new RegExp(title), title);
  assert.doesNotMatch(street.text, /id="step-explorer-|id="step-launchpad-/, 'a street renders only its own units');
  assert.doesNotMatch(noScripts(street.text), /nqp-planned|Planned for Pro|undefined|NaN/);
  const welcome = await get('/courses/number-quest/pro-0.1', cookie);
  assert.equal(welcome.status, 200); assert.match(welcome.text, /Welcome to the Towers/);
  assert.equal((await get('/courses/number-quest/pro-1.1', cookie)).status, 302, 'a step past the next one is locked, as on every street: a redirect to the map');
  const vis = await get('/courses/number-quest?street=pro');
  assert.equal(vis.status, 200); assert.match(vis.text, /aria-label="The Numberworks street, Pro"/);
  assert.equal((await get('/courses/number-quest/pro-0.1')).status, 200, 'a signed-out visitor reads the welcome');
  // Kids are never sold to: nothing on a learner page is priced.
  for (const text of [home.text, street.text, welcome.text, vis.text, (await get('/number-quest/sorting-game', cookie)).text]) assert.doesNotMatch(noScripts(text), PRICE);
  // A parent reads the Pro street by link, with no doors and no band to move.
  const grown = await get('/courses/number-quest?street=pro', cookieFor(parent.id));
  assert.match(grown.text, /aria-label="The Numberworks street, Pro"/); assert.doesNotMatch(grown.text, /href="\/courses\/number-quest\/pro-0\.1"/);
});

test('test-out is offered for every built Pro unit, from the rebuilt rung 6.0-8.0 bank; never for the welcome', async () => {
  const kid = newKid(), cookie = cookieFor(kid.id);
  for (const unit of [1, 2, 3, 4, 5, 6, 7]) {
    const r = await post('/api/number-quest/testout/start', cookie, { unit, tier: 'pro' });
    assert.equal(r.status, 200, `Pro Unit ${unit}`); assert.ok(r.json.runId && r.json.current, `Pro Unit ${unit} deals a first item`);
    const items = P.testOutItems(unit, `u${unit}`, 'pro');
    assert.equal(items.length, 5);
    const prof = P.entryProfile('pro', unit);
    const want = { number: prof.Number, algebra: prof['Algebra & Patterns'], 'shape-measure': prof['Shape & Measure'], 'data-chance': prof['Data & Chance'] };
    for (const it of items) { const t = TEMPLATES.find(x => x.id === it.templateId); assert.equal(t.rung, want[it.strand], `Unit ${unit}: an item at its profile's ${it.strand} rung`); }
  }
  assert.equal((await post('/api/number-quest/testout/start', cookie, { unit: 0, tier: 'pro' })).status, 400, 'the welcome has no test-out');
  const api = await get('/api/number-quest/placement', cookie);
  assert.deepEqual(Object.keys(JSON.parse(api.text).testedOutByTier), ['launchpad', 'explorer', 'pro']);
});

test('no Pro game\'s title, description or tags names the tier; read-aloud stays on by default in each', () => {
  for (const slug of PRO_GAMES) {
    const meta = read(`seed-games/${slug}.json`);
    const tags = Array.isArray(meta.tags) ? meta.tags.join(',') : String(meta.tags || '');
    for (const [what, text] of [['title', meta.title], ['description', meta.description], ['tags', tags]]) assert.doesNotMatch(String(text || ''), /\bPro\b|\bpro\b|The Towers|Number Quest Pro/, `${slug} ${what}`);
    const html = fs.readFileSync(new URL(`../../seed-games/${slug}.html`, import.meta.url), 'utf8');
    assert.match(html, /on\s+by default/i, `${slug}: the read-aloud is on by default, as the unit built it`);
  }
});

// ------------------------------------------------------------------------------------------------- catalogue and teacher page
test('the catalogue: three streets for everyone, every count from the data, the seven Pro games on the game list', () => {
  for (const who of [null, newKid(), parent]) {
    const cat = C.numberQuestCatalogue(who);
    assert.deepEqual(cat.tiers.map(x => [x.key, x.status]), [['launchpad', 'open'], ['explorer', 'open'], ['pro', 'open']]);
    assert.equal(cat.units.length, 24); assert.deepEqual(cat.planned, []);
    const f = nqFacts(cat);
    assert.deepEqual({ streets: f.streets, units: f.units, steps: f.steps, grades: f.grades, gradesPlain: f.gradesPlain }, { streets: 3, units: 21, steps: 69, grades: 'K–8', gradesPlain: 'K-8' });
    assert.deepEqual(f.games.slice(-7).map(g => [g.slug, g.title]), PRO_GAMES.map((s, i) => [s, PRO_TITLES[i]]), 'the Pro games, in street order, after the others');
  }
  // Every Pro step's game is on the list.
  const played = new Set(UNITS.units.filter(u => u.tier === 'pro').flatMap(u => u.steps.map(s => (s.game.pro || {}).slug).filter(Boolean)));
  assert.deepEqual([...played].sort(), [...PRO_GAMES].sort());
});

test('the teacher page: the Pro street, its games, its map, what it does not cover, the placement copy, and no price', async () => {
  const page = await get('/teachers/number-quest');
  assert.equal(page.status, 200);
  const text = noScripts(page.text);
  assert.match(page.text, /<title>Number Quest: math lessons for grades K–8, mapped to CCSS-M/);
  assert.match(text, /For teachers · grades K–8/); assert.match(text, />69 steps</); assert.match(text, />3 streets · 21 units</); assert.match(text, />19 games</);
  assert.match(text, /on three streets\./); assert.match(text, /The Pro towers, for grades 6 to 8/);
  assert.match(page.text, /"educationalLevel":"Grades K-8"/);
  // The seven Pro games, each with its own card and description.
  for (const [i, title] of PRO_TITLES.entries()) {
    assert.match(text, new RegExp(`<h3 lang="en" dir="ltr">${title}</h3>\\s*<p class="small"[^>]*>Pro Unit ${i + 1}, `), title);
  }
  assert.match(text, /Seven more were built for the Pro towers, one for each unit, from Lantern Mix to Launch Lab/);
  // The map and the notes: every Pro unit, the finale, the Pro codes with their published statements.
  assert.match(text, /Pro · Welcome to the Towers/); assert.match(text, /Pro · Unit 7 · The Test Range/); assert.match(text, /The Great Clock/);
  for (const code of ['6.RP.A.1', '7.NS.A.3', '8.EE.B.5', '8.G.B.7', '8.F.B.4', '7.EE.B.3']) assert.match(text, new RegExp(`title="[^"]{20,}">${code.replace(/\./g, '\\.')}<`), code);
  assert.match(text, /the Pro lock \(2026-11-14\), the Pro Units 1–7 and finale statement codes/);
  assert.doesNotMatch(text, /specced but not built yet|not cited here until its own lock lands|Planned units/);
  assert.match(text, /the Great Clock on Pro/);
  // What Pro does not cover: the headline gaps named in a sentence, then every uncited statement with its published text.
  const gaps = text.slice(text.indexOf('id="pro-gaps"'), text.indexOf('id="notes"'));
  assert.ok(gaps.length > 200, 'the gap section is on the page');
  assert.match(gaps, /What the Pro street does not cover/);
  assert.match(gaps, /Pro teaches the major work of grades 6–8, not every grade 6–8 statement\. It does not teach circles \(area and circumference\); volume of cylinders, cones and spheres; exponent rules and scientific notation; and irrational numbers\. In all, 19 grade 6–8 statements/);
  const notCovered = REG.proCoverage.notCovered;
  const codes = notCovered.flatMap(g => Object.entries(g.codes));
  assert.equal(codes.length, 19);
  for (const [code] of codes) assert.match(gaps, new RegExp(`title="[^"]{30,}">${code.replace(/\./g, '\\.')}<`), code);
  for (const g of notCovered) assert.ok(gaps.includes(g.topic), g.topic);
  // Headline topics come first, in bold.
  const order = notCovered.map(g => [gaps.indexOf(g.topic), !!g.headline]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(order.map(x => x[1]), [true, true, true, true, false, false, false, false, false, false, false]);
  assert.equal((gaps.match(/<b>[^<]+<\/b>/g) || []).length, 4);
  // No cited Pro code is listed as a gap, and no gap is cited by a Pro step.
  const cited = new Set(UNITS.units.filter(u => u.tier === 'pro').flatMap(u => u.steps.flatMap(s => [...s.standards.pro.primary, ...s.standards.pro.also])));
  for (const [code] of codes) assert.ok(!cited.has(code), `${code} is not cited`);
  // The FAQ and the start lines.
  assert.match(text, /kindergarten to grade 8: the Launchpad street covers kindergarten to grade 2, the Explorer street grades 3 to 5, and the Pro street the major work of grades 6 to 8/);
  assert.match(text, /grades 6 to 8 on the Pro street; Tally's Sorting Game can choose/);
  // The placement explainer and the K-8 matrix name the Pro street and its starting line.
  assert.match(text, /the start is on the Pro street instead: Welcome to the Towers when its first entry profile is not met/);
  assert.match(text, /and with grade 6 to 8 at the Pro welcome/);
  assert.match(text, /If every strand points past Explorer Unit 7 with any strand under rung 5\.5, the start is the Vault of Measures/);
  // The print pack carries the gap list too.
  const print = await get('/teachers/number-quest?print=1');
  assert.equal(print.status, 200); assert.match(print.text, /id="pro-gaps"/); assert.match(print.text, /grades K-8: Launchpad \(K-2\), Explorer \(3-5\) and Pro \(6-8/);
  // No price (the lesson's own "$2.05" and the standard 6.RP.A.3b's own "unit pricing" are set aside by name).
  assert.doesNotMatch(text.replace(/reads \$2\.05 as two dollars and five cents/g, '').replace(/including those involving unit pricing and constant speed/g, ''), PRICE);
  // The section is data: with Pro closed (the hook) it is not on a reader's page, and the function returns nothing.
  T.setTierStatus('pro', 'building');
  assert.equal(proCoverageSection(C.numberQuestCatalogue()), '');
  assert.doesNotMatch((await get('/teachers/number-quest')).text, /id="pro-gaps"/);
  assert.doesNotMatch(String(placementSection()), /Pro street|Pro starting line/);
});

test('the Learn tab and the teachers\' course list: Number Quest is grades K-8', async () => {
  const learn = await get('/learn?subject=math');
  assert.equal(learn.status, 200);
  assert.match(learn.text, /Number Quest<\/h3>[\s\S]{0,200}Math · Grades K–8/);
  const en = read('server/i18n/locales/en.json');
  assert.equal(en.lessons.library.numberQuest, 'Number Quest (math, grades K–8)');
  assert.equal(en.landing.courses.nq.tag, 'Math · grades K–8');
  assert.equal(en.courses.nq.sub, 'Math through the Numberworks · grades K–8');
});

// ------------------------------------------------------------------------------------------------- the crossing rule
test('the crossing rule, every set of rungs: the open street changes exactly the sets with every strand at rung 5.5 or over', () => {
  const R = Array.from({ length: 17 }, (_, i) => i / 2);
  const sets = [];
  for (const a of R) for (const b of R) for (const c of R) for (const d of R) sets.push(rungs(a, b, c, d));
  for (const a of R) for (const c of R) for (const d of R) sets.push({ number: a, 'shape-measure': c, 'data-chance': d }); // the short K-2 form
  assert.equal(sets.length, 88434);
  T.setTierStatus('pro', 'building');
  const before = sets.map(r => P.crosswalk(r));
  T.setTierStatus('pro', null);
  let crossed = 0;
  for (const [i, r] of sets.entries()) {
    const after = P.crosswalk(r);
    const eff = { algebra: r.number, ...r };
    const over = ['number', 'algebra', 'shape-measure', 'data-chance'].every(k => eff[k] >= P.PRO_LINE);
    if (!over) { if (JSON.stringify(after) !== JSON.stringify(before[i])) assert.fail(`${JSON.stringify(r)}: ${before[i].node} -> ${after.node}`); continue; }
    crossed++;
    if (before[i].node !== 'explorer-7.4' || after.tier !== 'pro') assert.fail(`${JSON.stringify(r)}: was ${before[i].node}, now ${after.node}`);
  }
  assert.equal(crossed, 6 ** 4 + 6 ** 3, 'six rungs from 5.5 to 8.0 in each strand, on both forms');
  // The line and the doors, said out loud.
  assert.equal(P.PRO_LINE, 5.5);
  assert.deepEqual(P.crosswalk(all(4)), { node: 'explorer-7.4', tier: 'explorer', launchpadGap: false, finaleDoor: true }, 'a strong fourth grader under the line: the Vault');
  assert.deepEqual(P.crosswalk({ ...all(8), 'data-chance': 5 }), { node: 'explorer-7.4', tier: 'explorer', launchpadGap: false, finaleDoor: true }, 'one strand under the line: the Vault');
  assert.deepEqual(P.crosswalk(all(5.5)), { node: 'pro-0.1', tier: 'pro', launchpadGap: false, finaleDoor: false }, 'on the line, under the first Pro profile: the Pro welcome');
  assert.deepEqual(P.crosswalk(all(8)), { node: 'pro-7.4', tier: 'pro', launchpadGap: false, finaleDoor: true }, 'every Pro profile met: the Great Clock door');
  // Just Play.
  assert.deepEqual(['K', 1, 2, 3, 4, 5, 6, 7, 8].map(g => P.beginningNode(g)), ['launchpad-0.1', 'launchpad-0.1', 'launchpad-0.1', 'explorer-1.1', 'explorer-1.1', 'explorer-1.1', 'pro-0.1', 'pro-0.1', 'pro-0.1']);
  for (const g of [6, 7, 8]) assert.equal(P.placeAtBeginning(newKid(), g).startNode, 'pro-0.1', `Just Play, grade ${g}`);
});

test('the crossing rule, whole games: every named grade and ability ends where it did while Pro was building, unless every strand reaches 5.5', () => {
  const play = (grade, ability, seed) => {
    const st = P.createRunState({ grade, seed: `${seed}:${grade}:${ability}` });
    for (let g = 0; g < 60 && !P.runFinished(st); g++) { const it = P.serveNext(st); if (!it) break; P.recordAnswer(st, it.strand, TEMPLATES.find(t => t.id === it.templateId).rung <= ability); }
    return P.finishRun(st);
  };
  const runs = [];
  for (const grade of ['K', 1, 2, 3, 4, 5, 6, 7, 8]) for (let ability = 0; ability <= 8; ability += 0.5) for (const seed of ['x', 'y']) runs.push([grade, ability, seed]);
  T.setTierStatus('pro', 'building');
  const before = runs.map(r => play(...r));
  T.setTierStatus('pro', null);
  let crossed = 0, vaultLines = 0;
  for (const [i, r] of runs.entries()) {
    const was = before[i], now_ = play(...r);
    assert.deepEqual(now_.rungs, was.rungs, `${r}: the same game, the same rungs (the bank and the staircase do not know about streets)`);
    const eff = { algebra: now_.rungs.number, ...now_.rungs };
    const over = Object.values(eff).every(v => v >= P.PRO_LINE);
    const { proLine, ...noteNow } = now_.note;
    if (!over) {
      assert.equal(now_.startNode, was.startNode, `${r}`); assert.deepEqual(noteNow, was.note, `${r}: the same note`);
      // The one line the opening adds: a Vault landing says why it is not the Pro street.
      if (now_.startNode === 'explorer-7.4') { vaultLines++; assert.match(proLine, /under the Pro starting line/); } else assert.equal(proLine, undefined, `${r}`);
    } else {
      crossed++;
      assert.equal(was.startNode, 'explorer-7.4', `${r}: was the Vault`); assert.equal(now_.tier, 'pro', `${r}: now the Pro street`);
      assert.equal(proLine, undefined, 'a fresh Pro start needs no extra line');
      assert.ok(!JSON.stringify([now_.workshop, now_.finaleLine, now_.picture]).match(/score|percent|rung|\d\.\d/i), 'the child is shown a place, never a score');
    }
  }
  assert.ok(crossed > 20, `runs that cross into Pro (${crossed})`); assert.ok(vaultLines > 10, `Vault landings that say why (${vaultLines})`);
});

// ------------------------------------------------------------------------------------------------- nobody is moved
test('nobody is moved: a learner placed at the Vault before the opening stays there, and the note says where the same answers would start today', async () => {
  const kid = newKid(), cookie = cookieFor(kid.id);
  q.run('INSERT INTO nq_placement(user_id, course, grade, grade_declared_at, rungs, start_node, source, start_fails, soft_land_node, updated_at) VALUES (?,?,?,?,?,?,?,0,NULL,?)',
    kid.id, 'number-quest', 7, now(), JSON.stringify(all(7)), 'explorer-7.4', 'sorting-game', now());
  C.setBand(kid, course, 'explorer');
  const before = JSON.stringify([q.all('SELECT * FROM nq_placement WHERE user_id=?', kid.id), q.all('SELECT * FROM course_bands WHERE user_id=?', kid.id), q.all('SELECT * FROM course_progress WHERE user_id=?', kid.id)]);
  assert.equal(P.crosswalk(all(7)).node, 'pro-5.1', 'the same answers would start a new run at Pro Unit 5');
  const home = await get('/courses/number-quest', cookie);
  assert.match(home.text, /aria-label="The Numberworks street, Explorer"/); assert.match(home.text, /Tally placed your start at <b lang="en" dir="ltr">The Vault of Measures<\/b>/);
  const note = await get(`/number-quest/starting-point?child=${kid.id}`, cookieFor(admin.id));
  assert.equal(note.status, 200);
  assert.match(note.text, /Placed start:<\/b> Past Unit 7: every strand pointed beyond the Explorer street/, 'the stored start still reads as the finale door it is');
  assert.match(note.text, /<p id="nq-pro-line">Every strand is at or over the Pro starting line \(rung 5\.5\)\. This start point was set before the Pro street \(grades 6 to 8\) opened; on the same answers the Sorting Game would now start this learner at Pro · Unit 5: The Sky Wires\. Nothing has been moved/);
  assert.match(note.text, /<option value="pro-5\.1"/, 'the override offers the Pro doors');
  assert.equal(JSON.stringify([q.all('SELECT * FROM nq_placement WHERE user_id=?', kid.id), q.all('SELECT * FROM course_bands WHERE user_id=?', kid.id), q.all('SELECT * FROM course_progress WHERE user_id=?', kid.id)]), before, 'reading every page moved nothing');
  // A grown-up's override is absolute, and then the note has nothing more to say.
  const moved = await post('/api/number-quest/placement/override', cookieFor(admin.id), { child: kid.id, node: 'pro-5.1' });
  assert.equal(moved.status, 200); assert.equal(moved.json.placement.startNode, 'pro-5.1');
  const after = await get(`/number-quest/starting-point?child=${kid.id}`, cookieFor(admin.id));
  assert.match(after.text, /Placed start:<\/b> Pro · Unit 5: The Sky Wires/); assert.doesNotMatch(after.text, /This start point was set before/);
  // A fresh run on the same answers lands on the Pro street and its note needs no extra line.
  const st = P.createRunState({ grade: 7, seed: 'fresh' });
  for (const k of Object.keys(st.strands)) { st.strands[k].correct = { 7: 2 }; st.strands[k].done = true; }
  const fin = P.finishRun(st);
  assert.equal(fin.tier, 'pro'); assert.equal(fin.note.proLine, undefined);
});

// ------------------------------------------------------------------------------------------------- the copy
test('the copy: every locale\'s course lines say grade 8, and the English course copy names three streets', () => {
  const EIGHT = { en: /K–8|grade 8/, 'en-GB': /K–8|age 14|ages 5 to 14/, ar: /الثامن/, de: /Klasse 8/, es: /8\.º/, fr: /4e/, he: /ח׳/, it: /terza media/, ja: /中2|中学2年/, nl: /tweede klas|klas 2/, pt: /8º/, ru: /8 класса/, 'zh-Hant': /八年級|8 年級/ };
  const files = fs.readdirSync(new URL('../../server/i18n/locales/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort();
  assert.deepEqual(files, Object.keys(EIGHT).sort(), 'all 13 locales');
  for (const loc of files) {
    const d = read(`server/i18n/locales/${loc}.json`);
    const lines = [d.lessons.library.numberQuest, d.courses.nq.sub, d.landing.courses.nq.tag, d.landing.courses.nq.p, d.teachers.faq.a5].filter(x => typeof x === 'string');
    assert.ok(lines.length >= 4, `${loc}: the course lines are there`);
    for (const line of lines) assert.match(line, EIGHT[loc], `${loc}: "${line}"`);
  }
  const en = read('server/i18n/locales/en.json');
  const nq = JSON.stringify([en.teachers.nq, en.courses.nq]);
  assert.doesNotMatch(nq, /on two streets|kindergarten to grade 5|grades K–5|specced but not built yet|for both welcomes/);
  for (const re of [/on three streets/, /The Pro towers, for grades 6 to 8/, /the Great Clock on Pro/, /grades 6 to 8 on the Pro street/, /Pro Units 1–7 and the Great Clock finale \(grades 6–8\)/]) assert.match(nq, re);
  for (const key of ['lanternMix', 'subZero', 'machineLine', 'scaleScout', 'skyLines', 'keepBuilder', 'launchLab']) {
    assert.match(en.teachers.nq.crew[key], /^Pro Unit [1-7], The /, key);
    assert.doesNotMatch(en.teachers.nq.crew[key], PRICE, `${key}: no price`);
  }
});
