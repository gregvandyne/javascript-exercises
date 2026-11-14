// Number Quest standards lock (seed-lessons/number-quest): the registry (standards.json), the Explorer
// Units 1-7 + finale catalogue slice (units.json) and the placement strand lock (placement.json). Checked here: every
// statement code cited in units.json is in the locked registry and well formed; buildsToward never masquerades
// as extra primary coverage beyond the declared set; the catalogue is exactly intro + Units 1-7 + the finale
// (23 steps, Units 1-4 locked in Phase 0, Units 5-7 and the finale in Phase 2) in
// order with stones and MP spotlights; every cluster named by a placement rung exists in the verified cluster
// registry, at the right grades (K-5 clusters at rungs K.0-5.5, grade 6-8 clusters at rungs 6.0-8.0, locked with
// the Pro lock of 2026-11-14); the crosswalk entry profiles are complete and monotone (a later unit never asks
// less of a strand than an earlier one). The Launchpad and Pro tiers have the equivalent lock rules of their own
// at the end of this file; Pro's also pins what the tier does NOT cover.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NQ = path.join(ROOT, 'seed-lessons/number-quest');
const reg = JSON.parse(fs.readFileSync(path.join(NQ, 'standards.json'), 'utf8'));
const cat = JSON.parse(fs.readFileSync(path.join(NQ, 'units.json'), 'utf8'));
const plc = JSON.parse(fs.readFileSync(path.join(NQ, 'placement.json'), 'utf8'));

const CODE = /^([3-5])\.(OA|NBT|NF|MD|G)\.([A-D])\.(\d)$/;
const CLUSTER = /^(K|[1-8])\.(CC|OA|NBT|NF|MD|G|RP|NS|EE|SP|F)\.([A-D])$/;
// Every unit names its tier; the Explorer assertions below run on the Explorer tier's units only, and the
// Launchpad tier (kindergarten to grade 2) has the equivalent lock rules of its own at the end of this file.
const tierUnits = tier => cat.units.filter(u => u.tier === tier);
const tierSteps = tier => tierUnits(tier).flatMap(u => u.steps.map(s => ({ ...s, unit: u.n })));
const UNITS = tierUnits('explorer');
const STEPS = tierSteps('explorer');
const locked = new Set(Object.keys(reg.explorerCodes.codes));
const clusterSet = new Set(Object.values(reg.clusters).flatMap(g => Object.keys(g)));
const ccss = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/ccss-math.json'), 'utf8'));
const published = new Map(ccss.standards.map(st => [st.id, st]));

test('the catalogue: intro + Explorer units 1-7 + the finale, 23 steps in order, stones and teacher notes', () => {
  for (const u of cat.units) assert.ok(['launchpad', 'explorer', 'pro'].includes(u.tier), `unit ${u.n} "${u.title}" names its tier`);
  assert.deepEqual(UNITS.map(u => u.n), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(STEPS.map(s => s.n), ['0.1', '1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '6.1', '6.2', '6.3', '7.1', '7.2', '7.3', '7.4']);
  assert.deepEqual(STEPS.map(s => s.order), [...Array(23).keys()].map(i => i + 1));
  assert.deepEqual(UNITS.slice(1).map(u => u.stamp), ['Counting Stone', 'Joining Stone', 'Grouping Stone', 'Sharing Stone', 'Ruler Stone', 'Compass Stone', 'Scales Stone']);
  for (const u of UNITS) assert.ok(Array.isArray(u.teacherNotes) && u.teacherNotes.length >= 1, `unit ${u.n} carries teacher notes`);
});

test('the registry: locked Explorer codes are well formed, real clusters, grades 3-5 only', () => {
  assert.ok(locked.size >= 50, `registry holds the Units 1-7 + finale code set (got ${locked.size})`);
  for (const code of locked) {
    const m = CODE.exec(code);
    assert.ok(m, `${code} is a well-formed grade 3-5 CCSS-M statement code`);
    assert.ok(clusterSet.has(`${m[1]}.${m[2]}.${m[3]}`), `${code}: its cluster exists in the verified registry`);
    assert.ok(typeof reg.explorerCodes.codes[code] === 'string' && reg.explorerCodes.codes[code].length >= 30, `${code}: carries a plain-language short title`);
  }
  for (const g of ['3', '4', '5']) for (const c of Object.keys(reg.clusters[g])) assert.match(`${g}.${c.split('.')[1]}.${c.split('.')[2]}`, CLUSTER);
});

test('units cite only locked codes; the intro cites none; every step has an MP spotlight', () => {
  for (const s of STEPS) {
    const st = s.standards.explorer;
    assert.match(s.mp, /^MP[1-8]$/, `${s.n}: MP spotlight`);
    for (const k of ['primary', 'also', 'buildsToward']) {
      assert.ok(Array.isArray(st[k]), `${s.n}: ${k} is a list`);
      for (const code of st[k]) {
        if (CLUSTER.test(code) && !CODE.test(code)) {
          assert.equal(k, 'buildsToward', `${s.n}: cluster-level citation ${code} is only ever buildsToward`);
          assert.ok(clusterSet.has(code), `${s.n}: ${code} is a real cluster`);
        } else {
          assert.ok(locked.has(code), `${s.n}: ${code} is in the locked registry`);
        }
      }
    }
    if (s.n === '0.1') assert.deepEqual([...st.primary, ...st.also, ...st.buildsToward], [], 'intro is framing: no content codes');
    else if (st.flag === 'enrichment') assert.deepEqual([...st.primary, ...st.also, ...st.buildsToward], [], `${s.n}: enrichment cites no code in any position`);
    else assert.ok(st.primary.length >= 1, `${s.n}: at least one primary locked code`);
  }
  // The known shorthand traps stay shut (standards.json correctionsToSpec):
  const byN = Object.fromEntries(STEPS.map(s => [s.n, s.standards.explorer]));
  assert.ok(!byN['1.3'].primary.some(c => c.startsWith('3.OA.C')), '1.3 patterns are OA.D/OA.C.5, never 3.OA.C');
  assert.ok(byN['2.1'].primary.includes('3.NBT.A.2'), '2.1 cites grade 3 addition where it actually lives');
  assert.ok(!byN['4.3'].primary.includes('4.NF.B.4'), '4.3 never cites the multiplication statement for addition');
  assert.ok(!byN['4.3'].primary.some(c => c.startsWith('3.')), '4.3 claims no grade 3 code (none exists)');
  // The Phase 2 shorthand traps (standards.json correctionsToSpec, 2026-11-05):
  assert.ok(byN['5.3'].primary.includes('4.MD.A.2'), '5.3 money work cites 4.MD.A.2 (word problems with measurement), never a grade 3-5 money code (none exists)');
  assert.ok(byN['6.2'].primary.includes('3.MD.D.8'), '6.2 perimeter cites 3.MD.D.8, where perimeter actually lives (not the MD.C volume cluster)');
  assert.ok(byN['6.2'].primary.includes('3.MD.C.7'), '6.2 area multiplication cites 3.MD.C.7');
  assert.equal(byN['7.3'].flag, 'enrichment', '7.3 is flagged enrichment');
  assert.ok(byN['7.4'].primary.includes('5.MD.A.1'), 'the finale converts units under 5.MD.A.1');
});

test('placement: four strands, all 17 rungs locked on real clusters: K-5 clusters to rung 5.5, grade 6-8 clusters from 6.0', () => {
  const names = Object.keys(plc.strands);
  assert.deepEqual(names.sort(), ['Algebra & Patterns', 'Data & Chance', 'Number', 'Shape & Measure']);
  const LOWER_RUNGS = ['K.0', 'K.5', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0', '5.5'];
  const PRO_RUNGS = ['6.0', '6.5', '7.0', '7.5', '8.0']; // locked 2026-11-14 with the Pro lock (they were deferred until then)
  for (const name of names) {
    const strand = plc.strands[name];
    assert.deepEqual(Object.keys(strand.lockedRungs).sort(), [...LOWER_RUNGS, ...PRO_RUNGS].sort(), `${name}: exactly the 17 rungs, every one locked`);
    assert.equal(strand.deferredRungs, undefined, `${name}: no rung is deferred any more`);
    for (const [rung, cell] of Object.entries(strand.lockedRungs)) {
      assert.ok(Array.isArray(cell.clusters) && cell.clusters.length >= 1, `${name} ${rung}: names clusters`);
      const pro = PRO_RUNGS.includes(rung);
      for (const c of cell.clusters) {
        assert.match(c, CLUSTER, `${name} ${rung}: ${c} is a cluster code`);
        assert.ok(clusterSet.has(c), `${name} ${rung}: ${c} exists in the verified registry`);
        // A rung samples its own grades: no grade 6-8 cluster under rung 6.0, no K-5 cluster from 6.0 up.
        assert.equal(/^[678]\./.test(c), pro, `${name} ${rung}: ${c} is ${pro ? 'a grade 6-8' : 'a K-5'} cluster`);
        // Rung X.0 samples the start of grade X, X.5 grade X: a cluster of grade X or X-1 at X.0, and of grade X at X.5.
        if (pro) assert.ok(Math.floor(+rung) === +c[0], `${name} ${rung}: ${c} is a grade ${Math.floor(+rung)} cluster`);
      }
      assert.ok(typeof cell.focus === 'string' && cell.focus.length >= 25, `${name} ${rung}: a real focus line`);
      assert.doesNotMatch(cell.focus, /^DEFERRED/, `${name} ${rung}: not deferred`);
    }
  }
  // Chance before grade 6 is enrichment only: no SP cluster may appear in any rung under 6.0.
  for (const strand of Object.values(plc.strands)) for (const [rung, cell] of Object.entries(strand.lockedRungs)) {
    if (LOWER_RUNGS.includes(rung)) for (const c of cell.clusters) assert.ok(!c.includes('.SP.'), 'no probability/statistics code below grade 6');
  }
  // Probability's first coded rung is Data & Chance 7.5 (7.SP.C); grade 6 statistics carry no probability cluster.
  assert.deepEqual(plc.strands['Data & Chance'].lockedRungs['7.5'].clusters, ['7.SP.C']);
  for (const r of ['6.0', '6.5', '7.0']) assert.ok(!plc.strands['Data & Chance'].lockedRungs[r].clusters.includes('7.SP.C'));
  // The registry itself: grades 6, 7 and 8 are citable clusters now, with the published headings; nothing is deferred.
  assert.deepEqual(Object.keys(reg.deferredClusters), ['about'], 'no cluster heading waits in deferredClusters any more');
  for (const g of ['6', '7', '8']) for (const [c, heading] of Object.entries(reg.clusters[g])) {
    assert.match(c, CLUSTER); assert.equal(c[0], g);
    assert.equal(heading, ccss.clusters[c], `${c}: the heading is the published one`);
  }
  assert.deepEqual(['6', '7', '8'].map(g => Object.keys(reg.clusters[g]).length), [10, 9, 10], '29 grade 6-8 clusters');
});

test('crosswalk: an entry profile per unit door, monotone across units, ties resolve lower', () => {
  const profiles = plc.crosswalk.entryProfiles;
  assert.deepEqual(Object.keys(profiles).filter(k => k.startsWith('explorer-')).sort(), ['explorer-1.1', 'explorer-2.1', 'explorer-3.1', 'explorer-4.1', 'explorer-5.1', 'explorer-6.1', 'explorer-7.1']);
  const strands = ['Number', 'Algebra & Patterns', 'Shape & Measure', 'Data & Chance'];
  // Another tier's profiles are keyed the same way, "<tier>-<unit>.1", each naming a unit that tier has;
  // within a tier they are monotone too, and a Launchpad door never asks more than Explorer's first.
  for (const tier of ['launchpad', 'pro']) {
    const keys = Object.keys(profiles).filter(k => k.startsWith(`${tier}-`));
    const units = tierUnits(tier).map(u => u.n);
    for (const k of keys) {
      const m = /^[a-z]+-(\d)\.1$/.exec(k);
      assert.ok(m && units.includes(+m[1]), `${k} names the door of a ${tier} unit`);
      for (const [label, rung] of Object.entries(profiles[k])) {
        assert.ok(strands.includes(label), `${k}: ${label} is a strand`);
        assert.ok(typeof rung === 'number' && rung >= 0 && rung <= 8 && (rung * 2) % 1 === 0, `${k}: ${label} names a rung`);
        if (tier === 'launchpad') assert.ok(rung <= profiles['explorer-1.1'][label], `${k}: ${label} asks no more than Explorer's first door`);
        // A Pro door never asks less than Explorer's last, and never less than the Pro starting line.
        if (tier === 'pro') { assert.ok(rung >= profiles['explorer-7.1'][label], `${k}: ${label} asks no less than Explorer's last door`); assert.ok(rung >= plc.crosswalk.proLine, `${k}: ${label} is at or over the Pro starting line`); }
      }
      assert.deepEqual(Object.keys(profiles[k]).sort(), [...strands].sort(), `${k}: names all four strands`);
    }
    const inOrder = units.map(n => profiles[`${tier}-${n}.1`]).filter(Boolean);
    for (let i = 1; i < inOrder.length; i++) for (const [label, rung] of Object.entries(inOrder[i])) {
      if (typeof inOrder[i - 1][label] === 'number') assert.ok(rung >= inOrder[i - 1][label], `${tier} ${label}: a later unit never asks less`);
    }
  }
  for (const k of Object.keys(profiles)) assert.match(k, /^(launchpad|explorer|pro)-\d\.1$/, `${k} is a unit door`);
  // Pro: one profile a unit, exactly as the owner-approved plan recorded them (2026-11-14), and the starting line.
  assert.deepEqual(Object.keys(profiles).filter(k => k.startsWith('pro-')).sort(), [1, 2, 3, 4, 5, 6, 7].map(n => `pro-${n}.1`));
  const P = (n, a, s, d) => ({ Number: n, 'Algebra & Patterns': a, 'Shape & Measure': s, 'Data & Chance': d });
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(n => profiles[`pro-${n}.1`]), [P(5.5, 6, 5.5, 5.5), P(7, 6, 5.5, 5.5), P(7, 6.5, 5.5, 5.5), P(7, 7, 5.5, 5.5), P(7, 8, 5.5, 5.5), P(7, 8, 7.5, 5.5), P(7, 8, 7.5, 7.5)]);
  assert.equal(plc.crosswalk.proLine, 5.5, 'the Pro starting line: every strand at rung 5.5 or above (owner decision 4)');
  assert.match(plc.crosswalk.proProfiles, /INERT while tiers\.pro\.status is "building"/);
  assert.match(plc.crosswalk.rule, /every strand at rung 5\.5 or above/);
  const seq = ['explorer-1.1', 'explorer-2.1', 'explorer-3.1', 'explorer-4.1', 'explorer-5.1', 'explorer-6.1', 'explorer-7.1'].map(k => profiles[k]);
  for (const p of seq) for (const s of strands) assert.ok(typeof p[s] === 'number' && p[s] >= 0 && p[s] <= 8, `profile names ${s} as a rung`);
  for (let i = 1; i < seq.length; i++) for (const s of strands) assert.ok(seq[i][s] >= seq[i - 1][s], `${s}: unit ${i + 1} never asks less than unit ${i}`);
  assert.match(plc.crosswalk.rule, /LOWER|lower/, 'the tie rule is written down');
});

// ------------------------------------------------------------------------------------------------- Launchpad
// The Launchpad tier's lock (kindergarten to grade 2): the same rules as Explorer's, against its own code set
// (standards.json launchpadCodes). A Launchpad step may cite only codes locked there, every locked code is a
// well-formed K-2 statement code in a real cluster, and step order starts at 1 in the tier.
// A statement number may have two digits (2.MD.D.10, the graphs standard of Launchpad Unit 7).
const LP_CODE = /^(K|[12])\.(CC|OA|NBT|MD|G)\.([A-D])\.(\d{1,2})[a-z]?$/;
const lpLocked = new Set(Object.keys(reg.launchpadCodes.codes));

test('Launchpad registry: locked codes are well-formed K-2 statement codes in real clusters', () => {
  assert.equal(typeof reg.launchpadCodes.about, 'string');
  for (const code of lpLocked) {
    const m = LP_CODE.exec(code);
    assert.ok(m, `${code} is a well-formed grade K-2 CCSS-M statement code`);
    assert.ok(clusterSet.has(`${m[1]}.${m[2]}.${m[3]}`), `${code}: its cluster exists in the verified registry`);
    assert.ok(typeof reg.launchpadCodes.codes[code] === 'string' && reg.launchpadCodes.codes[code].length >= 30, `${code}: carries a plain-language short title`);
    assert.ok(!locked.has(code), `${code}: locked for one tier only`);
  }
});

test('Launchpad units cite only codes in launchpadCodes; the welcome cites none; order starts at 1', () => {
  const units = tierUnits('launchpad'), steps = tierSteps('launchpad');
  assert.ok(units.length >= 1 && units[0].n === 0, 'the Launchpad tier opens with its welcome unit');
  assert.equal(new Set(units.map(u => u.n)).size, units.length, 'unit numbers are unique within the tier');
  assert.deepEqual(steps.map(s => s.order).sort((a, b) => a - b), steps.map((_, i) => i + 1), 'step order is 1..n within the tier');
  assert.equal(new Set(steps.map(s => s.n)).size, steps.length, 'step numbers are unique within the tier');
  for (const u of units) {
    assert.ok(Array.isArray(u.teacherNotes) && u.teacherNotes.length >= 1, `launchpad unit ${u.n} carries teacher notes`);
    for (const s of u.steps) assert.equal(s.n.split('.')[0], String(u.n), `launchpad ${s.n} sits in unit ${u.n}`);
  }
  for (const s of steps) {
    const st = s.standards.launchpad;
    assert.ok(st, `launchpad ${s.n}: standards are keyed by the unit's own tier`);
    assert.equal(s.standards.explorer, undefined, `launchpad ${s.n}: carries no Explorer standards`);
    assert.equal(typeof s.titles.launchpad, 'string', `launchpad ${s.n}: a title under its tier`);
    assert.match(s.mp, /^MP[1-8]$/, `launchpad ${s.n}: MP spotlight`);
    for (const k of ['primary', 'also', 'buildsToward']) {
      assert.ok(Array.isArray(st[k]), `launchpad ${s.n}: ${k} is a list`);
      for (const code of st[k]) {
        if (CLUSTER.test(code) && !LP_CODE.test(code)) {
          assert.equal(k, 'buildsToward', `launchpad ${s.n}: cluster-level citation ${code} is only ever buildsToward`);
          assert.ok(clusterSet.has(code), `launchpad ${s.n}: ${code} is a real cluster`);
        } else if (k === 'buildsToward' && locked.has(code)) {
          // Preparation may point up the path at a locked Explorer statement; it is never coverage.
        } else {
          assert.match(code, LP_CODE, `launchpad ${s.n}: ${code} is a K-2 statement code`);
          assert.ok(lpLocked.has(code), `launchpad ${s.n}: ${code} is in launchpadCodes`);
        }
      }
    }
    const cited = [...st.primary, ...st.also, ...st.buildsToward];
    if (st.flag === 'framing' || st.flag === 'enrichment') assert.deepEqual(cited, [], `launchpad ${s.n}: ${st.flag} cites no code in any position`);
    else assert.ok(st.primary.length >= 1, `launchpad ${s.n}: at least one primary locked code`);
  }
  assert.equal(steps[0].n, '0.1'); assert.equal(steps[0].standards.launchpad.flag, 'framing', 'the welcome is framing');
});

test('tiers: Launchpad, Explorer and Pro are declared, each with a status; Pro is building', () => {
  assert.deepEqual(Object.keys(cat.tiers).sort(), ['explorer', 'launchpad', 'pro']);
  assert.equal(cat.tiers.explorer.status, 'open');
  assert.ok(['open', 'building'].includes(cat.tiers.launchpad.status));
  assert.equal(cat.tiers.launchpad.district, 'The Gardens'); assert.equal(cat.tiers.launchpad.grades, 'K-2'); assert.equal(cat.tiers.launchpad.inGame, 'Launchpad');
  assert.ok(Array.isArray(cat.tiers.launchpad.stones));
  // Pro (the owner's decisions of 2026-11-14): The Towers, grades 6-8, seven Gears, the Great Clock at 7.4.
  assert.deepEqual(cat.tiers.pro, { district: 'The Towers', finale: '7.4', grades: '6-8', inGame: 'Pro', status: 'building',
    stones: ['Ratio Gear', 'Zero Gear', 'Variable Gear', 'Scale Gear', 'Slope Gear', 'Angle Gear', 'Chance Gear'] });
  assert.equal(typeof reg.proCodes.about, 'string');
});

// ------------------------------------------------------------------------------------------------- Pro
// The Pro tier's lock (grades 6 to 8), locked 2026-11-14 with the owner-approved plan: the same rules as the other
// two tiers, against its own code set (standards.json proCodes). Two things are Pro's own:
//   - the whole tier is RESERVED up front. Its welcome is built; Units 1-7 (22 steps) are declared with
//     `planned: true` and their final numbers, titles, stones, step order and codes, so the seven units can be
//     built side by side. The lock rules below hold for planned units exactly as for built ones;
//   - the tier claims "the major work of grades 6-8", so what it does NOT cover is recorded and pinned too.
// A grade 6-8 statement: cluster letters A-C only, statement numbers 1-9, lettered parts a-d (6.RP.A.3a).
const PRO_CODE = /^([6-8])\.(RP|NS|EE|G|SP|F)\.([A-C])\.(\d)[a-d]?$/;
const proLocked = new Set(Object.keys(reg.proCodes.codes));

test('Pro registry: 69 locked codes, each a well-formed grade 6-8 statement in a real cluster, with the published text', () => {
  assert.equal(proLocked.size, 69);
  const perDomain = {};
  for (const code of proLocked) {
    const m = PRO_CODE.exec(code);
    assert.ok(m, `${code} is a well-formed grade 6-8 CCSS-M statement code`);
    assert.ok(clusterSet.has(`${m[1]}.${m[2]}.${m[3]}`), `${code}: its cluster exists in the verified registry`);
    assert.ok(reg.clusters[m[1]][`${m[1]}.${m[2]}.${m[3]}`], `${code}: its cluster is a grade ${m[1]} cluster`);
    const st = published.get(code);
    assert.ok(st, `${code} exists in server/standards/ccss-math.json`);
    assert.equal(st.cluster, `${m[1]}.${m[2]}.${m[3]}`, `${code}: the published file files it under the same cluster`);
    assert.equal(reg.proCodes.codes[code], st.statement, `${code}: carries the published statement, word for word`);
    assert.ok(reg.proCodes.codes[code].length >= 30, `${code}: a real statement`);
    assert.ok(!locked.has(code) && !lpLocked.has(code), `${code}: locked for one tier only`);
    assert.ok(!CODE.test(code) && !LP_CODE.test(code), `${code}: fits no other tier's pattern`);
    perDomain[m[2]] = (perDomain[m[2]] || 0) + 1;
  }
  assert.deepEqual(perDomain, { RP: 12, NS: 9, EE: 19, F: 3, G: 13, SP: 13 });
  // And the other way round: no Explorer or Launchpad code fits the Pro pattern.
  for (const code of [...locked, ...lpLocked]) assert.ok(!PRO_CODE.test(code), `${code} is not a Pro code`);
  // Functions (owner decision 5): exactly three statements, and the registry no longer says "never claims it".
  assert.deepEqual([...proLocked].filter(c => c.includes('.F.')).sort(), ['8.F.A.1', '8.F.A.3', '8.F.B.4']);
  assert.doesNotMatch(reg.domains.F, /bridges it, never claims it/, 'the old rule is gone'); assert.match(reg.domains.F, /replaces the earlier rule/);
  assert.match(reg.domains.F, /8\.F\.B\.4 \(primary\), 8\.F\.A\.1 and 8\.F\.A\.3 \(also covers\)/);
  assert.ok(reg.correctionsToSpec.some(x => /Owner decision 5 of 2026-11-14/.test(x) && /8\.F\.B\.4/.test(x)), 'the change to spec note 10 is written down');
});

test('Pro units cite only codes in proCodes; the welcome cites none; all 23 steps are reserved in order', () => {
  const units = tierUnits('pro'), steps = tierSteps('pro');
  assert.deepEqual(units.map(u => [u.n, u.title, u.stamp, u.planned === true]), [[0, 'Welcome to the Towers', null, false], [1, 'The Mixing Tower', 'Ratio Gear', true], [2, 'The Cold Store', 'Zero Gear', true],
    [3, 'The Machine Hall', 'Variable Gear', true], [4, 'The Map Room', 'Scale Gear', true], [5, 'The Sky Wires', 'Slope Gear', true], [6, 'The Drafting Keep', 'Angle Gear', true], [7, 'The Test Range', 'Chance Gear', true]]);
  assert.deepEqual(units.slice(1).map(u => u.stamp), cat.tiers.pro.stones, 'the unit stones are the tier line\'s gears, in order');
  assert.deepEqual(steps.map(s => s.n), ['0.1', '1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '6.1', '6.2', '6.3', '7.1', '7.2', '7.3', '7.4']);
  assert.deepEqual(steps.map(s => s.order), [...Array(23).keys()].map(i => i + 1), 'step order is 1..23 within the tier, fixed before any unit is built');
  assert.equal(new Set(units.map(u => u.group)).size, units.length, 'each unit has its own anchor');
  assert.equal(steps.find(s => s.n === cat.tiers.pro.finale).unit, 7, 'the finale is a fourth step of Unit 7 (owner decision 7)');
  for (const u of units) {
    assert.ok(Array.isArray(u.teacherNotes), `pro unit ${u.n} carries a teacher-notes list`);
    if (!u.planned) assert.ok(u.teacherNotes.length >= 1, `pro unit ${u.n} is built, so it carries teacher notes`);
    for (const s of u.steps) assert.equal(s.n.split('.')[0], String(u.n), `pro ${s.n} sits in unit ${u.n}`);
    // A planned unit has no game yet: its steps say so honestly (game null), and only name what is reserved.
    if (u.planned) {
      assert.equal(u.tool, null, `pro unit ${u.n}: no game is registered for a planned unit`);
      assert.match(u.reserved.game, /^[a-z]+(-[a-z]+)+$/); assert.equal(typeof u.reserved.world, 'string');
      assert.ok(!fs.existsSync(path.join(ROOT, 'seed-games', `${u.reserved.game}.html`)), `pro unit ${u.n}: ${u.reserved.game} is not built yet (delete "planned" in the unit's own PR)`);
      for (const s of u.steps) { assert.equal(s.game.pro, null, `pro ${s.n}: planned, so no game`); assert.match(s.reserved.params, /^chapter=[a-z]+&lock=1$/); }
      for (const s of u.steps) assert.ok(!fs.existsSync(path.join(NQ, 'course/pro', `${s.n}.json`)), `pro ${s.n}: a planned step has no deck`);
    }
  }
  assert.equal(new Set(units.filter(u => u.planned).map(u => u.reserved.game)).size, 7, 'seven reserved games, one a unit');
  for (const s of steps) {
    const st = s.standards.pro;
    assert.ok(st, `pro ${s.n}: standards are keyed by the unit's own tier`);
    assert.equal(s.standards.explorer, undefined); assert.equal(s.standards.launchpad, undefined);
    assert.ok(typeof s.titles.pro === 'string' && s.titles.pro.length >= 5 && s.titles.pro.length <= 60, `pro ${s.n}: a title under its tier`);
    assert.ok(typeof s.shorts.pro === 'string' && s.shorts.pro.length >= 3 && s.shorts.pro.length <= 40, `pro ${s.n}: a short topic under its tier`);
    assert.match(s.mp, /^MP[1-8]$/, `pro ${s.n}: MP spotlight`);
    for (const k of ['primary', 'also', 'buildsToward']) {
      assert.ok(Array.isArray(st[k]), `pro ${s.n}: ${k} is a list`);
      for (const code of st[k]) {
        if (CLUSTER.test(code) && !PRO_CODE.test(code)) {
          assert.equal(k, 'buildsToward', `pro ${s.n}: cluster-level citation ${code} is only ever buildsToward`);
          assert.ok(clusterSet.has(code), `pro ${s.n}: ${code} is a real cluster`);
        } else {
          assert.match(code, PRO_CODE, `pro ${s.n}: ${code} is a grade 6-8 statement code`);
          assert.ok(proLocked.has(code), `pro ${s.n}: ${code} is in proCodes`);
        }
      }
    }
    const cited = [...st.primary, ...st.also, ...st.buildsToward];
    if (st.flag === 'framing' || st.flag === 'enrichment') assert.deepEqual(cited, [], `pro ${s.n}: ${st.flag} cites no code in any position`);
    else { assert.equal(st.flag, 'coverage'); assert.ok(st.primary.length >= 1 && st.primary.length <= 3, `pro ${s.n}: one to three primary locked codes`); }
    assert.equal(new Set([...st.primary, ...st.also]).size, st.primary.length + st.also.length, `pro ${s.n}: no code is both primary and also`);
  }
  assert.equal(steps[0].n, '0.1'); assert.equal(steps[0].standards.pro.flag, 'framing', 'the welcome is framing');
  // Every locked code is cited by a step, and every cited code is locked: the set is exactly the plan's.
  const citedAll = new Set(steps.flatMap(s => [...s.standards.pro.primary, ...s.standards.pro.also]));
  assert.deepEqual([...citedAll].sort(), [...proLocked].sort());
  // The steps the decisions name.
  const byN = Object.fromEntries(steps.map(s => [s.n, s.standards.pro]));
  assert.deepEqual([byN['5.2'].primary, byN['5.2'].also], [['8.F.B.4'], ['8.F.A.1', '8.F.A.3', '6.EE.C.9']], '5.2 claims 8.F.B.4, with 8.F.A.1 and 8.F.A.3 as also-covers (decision 5)');
  assert.match(byN['5.2'].primaryNote, /owner decision 5/);
  assert.deepEqual(byN['4.3'].primary, ['7.RP.A.3']);
  assert.match(byN['4.3'].primaryNote, /neutral contexts only/); assert.match(byN['4.3'].primaryNote, /No interest and no commission/);
  assert.deepEqual(byN['6.3'].buildsToward, ['8.NS.A'], '6.3 points at irrational numbers as preparation only');
  assert.deepEqual(byN['7.4'].primary, ['7.EE.B.3']);
  assert.equal(byN['7.4'].also.length, 7, 'the finale reviews one code from each unit');
  for (const [i, code] of byN['7.4'].also.entries()) assert.ok(tierUnits('pro')[i + 1].steps.some(s => [...s.standards.pro.primary, ...s.standards.pro.also].includes(code)), `the finale's ${code} is Unit ${i + 1}'s`);
});

test('Pro coverage is claimed honestly: "the major work of grades 6-8", with the 19 statements it does not cover written down', () => {
  const cov = reg.proCoverage;
  assert.equal(cov.claim, 'the major work of grades 6-8');
  // Worked out here from the published file, not read from the registry: every grade 6-8 statement (lettered parts
  // folded into their parent), less the ones a Pro step cites.
  const all = [...new Set(ccss.standards.filter(st => /^[678]$/.test(String(st.grade))).map(st => st.id.replace(/[a-d]$/, '')))];
  const cited = new Set([...proLocked].map(c => c.replace(/[a-d]$/, '')));
  const missing = all.filter(c => !cited.has(c)).sort();
  assert.deepEqual(cov.statements, { total: all.length, cited: all.length - missing.length, notCited: missing.length });
  assert.deepEqual(cov.statements, { total: 81, cited: 62, notCited: 19 });
  const listed = cov.notCovered.flatMap(g => Object.keys(g.codes));
  assert.deepEqual([...listed].sort(), missing, 'the gap list is exactly the uncited statements: none hidden, none invented');
  assert.equal(new Set(listed).size, listed.length);
  for (const g of cov.notCovered) {
    assert.ok(typeof g.topic === 'string' && g.topic.length >= 10 && !/\d\.[A-Z]/.test(g.topic), `"${g.topic}": a plain-words topic for the teacher page`);
    for (const [code, text] of Object.entries(g.codes)) {
      assert.ok(!proLocked.has(code), `${code} is not claimed`);
      const st = published.get(code) || ccss.standards.find(x => x.id.startsWith(code));
      assert.equal(text, st.statement, `${code}: the published statement`);
    }
  }
  // The four a teacher looks for first are named as such (owner decision 2).
  assert.deepEqual(cov.notCovered.filter(g => g.headline).map(g => Object.keys(g.codes)), [['7.G.B.4'], ['8.G.C.9'], ['8.EE.A.1', '8.EE.A.3', '8.EE.A.4'], ['8.NS.A.1', '8.NS.A.2']]);
  // No step cites a gap, in any position.
  const everywhere = new Set(tierSteps('pro').flatMap(s => [...s.standards.pro.primary, ...s.standards.pro.also, ...s.standards.pro.buildsToward]));
  for (const code of listed) assert.ok(!everywhere.has(code), `${code} is cited nowhere`);
  assert.deepEqual(Object.keys(cov.partial).sort(), ['8.EE.A', '8.F', '8.NS.A', '8.SP.A']);
});
