// Number Quest standards lock (seed-lessons/number-quest): the registry (standards.json), the Explorer
// Units 1-7 + finale catalogue slice (units.json) and the placement strand lock (placement.json). Checked here: every
// statement code cited in units.json is in the locked registry and well formed; buildsToward never masquerades
// as extra primary coverage beyond the declared set; the catalogue is exactly intro + Units 1-7 + the finale
// (23 steps, Units 1-4 locked in Phase 0, Units 5-7 and the finale in Phase 2) in
// order with stones and MP spotlights; every cluster named by a LOCKED placement rung exists in the verified
// K-5 cluster registry; deferred rungs (6.0-8.0) carry no taggable clusters; the crosswalk entry profiles are
// complete and monotone (a later unit never asks less of a strand than an earlier one).
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
const UNITS = cat.units;
const STEPS = UNITS.flatMap(u => u.steps.map(s => ({ ...s, unit: u.n })));
const locked = new Set(Object.keys(reg.explorerCodes.codes));
const clusterSet = new Set(Object.values(reg.clusters).flatMap(g => Object.keys(g)));
const deferredSet = new Set(Object.values(reg.deferredClusters).filter(v => typeof v === 'object').flatMap(g => Object.keys(g)));

test('the catalogue: intro + Explorer units 1-7 + the finale, 23 steps in order, stones and teacher notes', () => {
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

test('placement: four strands, rungs K.0-5.5 locked on real clusters, 6.0-8.0 deferred and untaggable', () => {
  const names = Object.keys(plc.strands);
  assert.deepEqual(names.sort(), ['Algebra & Patterns', 'Data & Chance', 'Number', 'Shape & Measure']);
  const LOCKED_RUNGS = ['K.0', 'K.5', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0', '5.5'];
  for (const name of names) {
    const strand = plc.strands[name];
    assert.deepEqual(Object.keys(strand.lockedRungs).sort(), [...LOCKED_RUNGS].sort(), `${name}: exactly the locked rung set`);
    for (const [rung, cell] of Object.entries(strand.lockedRungs)) {
      assert.ok(Array.isArray(cell.clusters) && cell.clusters.length >= 1, `${name} ${rung}: names clusters`);
      for (const c of cell.clusters) {
        assert.ok(clusterSet.has(c), `${name} ${rung}: ${c} exists in the verified K-5 registry`);
        assert.ok(!deferredSet.has(c), `${name} ${rung}: ${c} is not a deferred grade 6-8 cluster`);
      }
      assert.ok(typeof cell.focus === 'string' && cell.focus.length >= 25, `${name} ${rung}: a real focus line`);
    }
    assert.deepEqual(Object.keys(strand.deferredRungs).sort(), ['6.0', '6.5', '7.0', '7.5', '8.0'], `${name}: deferred rung set`);
    for (const note of Object.values(strand.deferredRungs)) assert.match(note, /^DEFERRED/, 'deferred rungs say so');
  }
  // Chance before grade 6 is enrichment only: no SP cluster may appear in any locked rung.
  for (const strand of Object.values(plc.strands)) for (const cell of Object.values(strand.lockedRungs)) {
    for (const c of cell.clusters) assert.ok(!c.includes('.SP.'), 'no probability/statistics code below grade 6');
  }
});

test('crosswalk: an entry profile per unit door, monotone across units, ties resolve lower', () => {
  const profiles = plc.crosswalk.entryProfiles;
  assert.deepEqual(Object.keys(profiles).sort(), ['explorer-1.1', 'explorer-2.1', 'explorer-3.1', 'explorer-4.1', 'explorer-5.1', 'explorer-6.1', 'explorer-7.1']);
  const strands = ['Number', 'Algebra & Patterns', 'Shape & Measure', 'Data & Chance'];
  const seq = ['explorer-1.1', 'explorer-2.1', 'explorer-3.1', 'explorer-4.1', 'explorer-5.1', 'explorer-6.1', 'explorer-7.1'].map(k => profiles[k]);
  for (const p of seq) for (const s of strands) assert.ok(typeof p[s] === 'number' && p[s] >= 0 && p[s] <= 8, `profile names ${s} as a rung`);
  for (let i = 1; i < seq.length; i++) for (const s of strands) assert.ok(seq[i][s] >= seq[i - 1][s], `${s}: unit ${i + 1} never asks less than unit ${i}`);
  assert.match(plc.crosswalk.rule, /LOWER|lower/, 'the tie rule is written down');
});
