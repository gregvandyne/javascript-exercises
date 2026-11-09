#!/usr/bin/env node
// Builds server/standards/ccss-math.json and ccss-ela.json (K-8) from a copy of the Common Core State Standards data.
//   node scripts/build-ccss.js <dir>
// <dir> is the unpacked npm package @weo-edu/standards@0.1.6 (MIT; its JSON is the official corestandards.org text with
// the codes in the short form "3.OA.7"): subjects/mathematics/grade-*.json and subjects/english-language-arts-and-literacy/
// grade-*.json. Run once by hand; the output is committed and checked by tests/unit/standards-ccss.test.js. The
// statements are the official text, never edited here (CCSS public license: attribution notice kept in the files).
//
// Codes. Mathematics gets its cluster letter back ("3.OA.7" -> "3.OA.C.7"), the form Number Quest already cites, from the
// cluster headings in seed-lessons/number-quest/standards.json (clusters + deferredClusters, K-8), falling back to the
// order the clusters appear in. Sub-standards are written with a lower-case letter ("3.MD.C.7a", "RF.K.1d"). ELA keeps
// the strands Reading Literature (RL), Reading Informational Text (RI), Reading Foundational Skills (RF, K-5), Writing
// (W), Speaking & Listening (SL) and Language (L); anchor (CCR) and 6-12 literacy (RH/RST/WHST) standards are left out.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2];
if (!SRC || !fs.existsSync(path.join(SRC, 'subjects'))) { console.error('usage: node scripts/build-ccss.js <unpacked @weo-edu/standards dir>'); process.exit(1); }
const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8'];
const NOTICE = '© Copyright 2010. National Governors Association Center for Best Practices and Council of Chief State School Officers. All rights reserved.';
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/—/g, '—').trim();
const norm = s => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

// ---------------------------------------------------------------- mathematics
const nq = read(path.join(ROOT, 'seed-lessons/number-quest/standards.json'));
const clusterNames = {};
for (const group of [nq.clusters, nq.deferredClusters]) for (const [g, list] of Object.entries(group)) if (typeof list === 'object') Object.assign(clusterNames, list);
const MATH_DOMAINS = { CC: 'Counting and Cardinality', OA: 'Operations and Algebraic Thinking', NBT: 'Number and Operations in Base Ten', NF: 'Number and Operations—Fractions',
  MD: 'Measurement and Data', G: 'Geometry', RP: 'Ratios and Proportional Relationships', NS: 'The Number System', EE: 'Expressions and Equations', F: 'Functions', SP: 'Statistics and Probability' };
const MATH_ORDER = Object.keys(MATH_DOMAINS);
const mathOut = [];
const problems = [];
for (const g of GRADES) {
  const file = path.join(SRC, 'subjects/mathematics', `grade-${g.toLowerCase()}.json`);
  const seen = new Map();
  for (const list of Object.values(read(file))) for (const s of list) if (!seen.has(s.displayName)) seen.set(s.displayName, s);
  const top = [], subs = [];
  for (const [code, s] of seen) {
    const m = /^(K|\d)\.([A-Z]+)\.(\d+)(?:\.?([a-z]))?$/.exec(code);
    if (!m || m[1] !== g || !MATH_DOMAINS[m[2]]) { problems.push(`math ${g}: skipped ${code}`); continue; }
    (m[4] ? subs : top).push({ dom: m[2], n: +m[3], sub: m[4] || '', s });
  }
  const letters = new Map(); // dom.n -> letter
  for (const dom of MATH_ORDER) {
    const own = top.filter(x => x.dom === dom).sort((a, b) => a.n - b.n);
    if (!own.length) continue;
    const known = Object.entries(clusterNames).filter(([k]) => k.startsWith(`${g}.${dom}.`)).map(([k, v]) => ({ letter: k.split('.')[2], name: norm(v) }));
    let order = [], fallback = 0;
    for (const x of own) {
      const head = x.s.meta && x.s.meta.length > 1 ? x.s.meta[0] : '';
      const hit = known.find(c => c.name === norm(head)) || known.find(c => norm(head).startsWith(c.name.slice(0, 40)) || c.name.startsWith(norm(head).slice(0, 40)));
      let letter = hit ? hit.letter : null;
      if (!letter) { if (!order.includes(head)) order.push(head); letter = String.fromCharCode(65 + order.indexOf(head) + fallback); problems.push(`math ${g}.${dom}.${x.n}: cluster "${head}" matched by order -> ${letter}`); }
      letters.set(`${dom}.${x.n}`, { letter, cluster: clean(head) || (clusterNames[`${g}.${dom}.${letter}`] || '') });
    }
  }
  for (const x of [...top, ...subs].sort((a, b) => MATH_ORDER.indexOf(a.dom) - MATH_ORDER.indexOf(b.dom) || a.n - b.n || a.sub.localeCompare(b.sub))) {
    const c = letters.get(`${x.dom}.${x.n}`);
    if (!c) { problems.push(`math ${g}.${x.dom}.${x.n}${x.sub}: no parent`); continue; }
    const id = `${g}.${x.dom}.${c.letter}.${x.n}${x.sub}`;
    mathOut.push({ id, grade: g, domain: x.dom, cluster: `${g}.${x.dom}.${c.letter}`, clusterName: c.cluster, ...(x.sub ? { parent: `${g}.${x.dom}.${c.letter}.${x.n}` } : {}), statement: clean(x.s.content) });
  }
}
const mathFile = {
  framework: 'ccss-math', name: 'Common Core State Standards for Mathematics', short: 'CCSS Math', grades: GRADES, notice: NOTICE,
  source: 'Common Core State Standards for Mathematics (2010), grades K-8: codes and official statements (corestandards.org), via the npm package @weo-edu/standards 0.1.6 (MIT); cluster letters from the Number Quest cluster registry. Built by scripts/build-ccss.js.',
  domains: MATH_DOMAINS, clusters: Object.fromEntries(mathOut.filter(s => !s.parent).map(s => [s.cluster, s.clusterName])),
  standards: mathOut.map(({ clusterName, ...s }) => s),
};

// ---------------------------------------------------------------- English Language Arts
const ELA_DOMAINS = { RL: 'Reading: Literature', RI: 'Reading: Informational Text', RF: 'Reading: Foundational Skills', W: 'Writing', SL: 'Speaking and Listening', L: 'Language' };
const ELA_ORDER = Object.keys(ELA_DOMAINS);
// Grade 2 has no W.2.4 or W.2.10 ("Begins in grade 3"): the source fills both with grade 3's text, so they are dropped.
const ELA_NOT = new Set(['W.2.4', 'W.2.10']);
const elaOut = [], elaGroups = {};
for (const g of GRADES) {
  const file = path.join(SRC, 'subjects/english-language-arts-and-literacy', `grade-${g.toLowerCase()}.json`);
  const seen = new Map();
  for (const list of Object.values(read(file))) for (const s of list) if (!seen.has(s.displayName)) seen.set(s.displayName, s);
  const rows = [];
  for (const [code, s] of seen) {
    const m = /^([A-Z]+)\.(K|\d)\.(\d+)(?:\.?([a-z]))?$/.exec(code);
    if (!m || !ELA_DOMAINS[m[1]] || ELA_NOT.has(`${m[1]}.${m[2]}.${m[3]}`)) continue;
    if (m[2] !== g) { problems.push(`ela ${g}: skipped ${code}`); continue; }
    rows.push({ dom: m[1], n: +m[3], sub: m[4] || '', s });
  }
  for (const x of rows.sort((a, b) => ELA_ORDER.indexOf(a.dom) - ELA_ORDER.indexOf(b.dom) || a.n - b.n || a.sub.localeCompare(b.sub))) {
    const parent = `${x.dom}.${g}.${x.n}`;
    if (x.sub && !rows.some(y => y.dom === x.dom && y.n === x.n && !y.sub)) { problems.push(`ela ${parent}${x.sub}: no parent`); continue; }
    const group = x.s.meta && x.s.meta.length > 1 && !x.sub ? clean(x.s.meta[0]) : '';
    if (group && !/Standards/.test(group)) elaGroups[`${x.dom}.${x.n}`] = elaGroups[`${x.dom}.${x.n}`] || group;
    elaOut.push({ id: `${parent}${x.sub}`, grade: g, domain: x.dom, ...(x.sub ? { parent } : {}), statement: clean(x.s.content) });
  }
}
const elaFile = {
  framework: 'ccss-ela', name: 'Common Core State Standards for English Language Arts', short: 'CCSS ELA', grades: GRADES, notice: NOTICE,
  source: 'Common Core State Standards for English Language Arts & Literacy (2010), grades K-8, strands RL, RI, RF, W, SL and L: codes and official statements (corestandards.org), via the npm package @weo-edu/standards 0.1.6 (MIT). Built by scripts/build-ccss.js.',
  domains: ELA_DOMAINS, standards: elaOut,
};
fs.writeFileSync(path.join(ROOT, 'server/standards/ccss-math.json'), `${JSON.stringify(mathFile, null, 1)}\n`);
fs.writeFileSync(path.join(ROOT, 'server/standards/ccss-ela.json'), `${JSON.stringify(elaFile, null, 1)}\n`);
for (const p of problems) console.log(`· ${p}`);
console.log(`math ${mathOut.length} (${mathOut.filter(s => !s.parent).length} top-level), ela ${elaOut.length} (${elaOut.filter(s => !s.parent).length} top-level)`);
