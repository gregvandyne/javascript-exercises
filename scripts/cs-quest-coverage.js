#!/usr/bin/env node
// CS Quest coverage map (plan section 3, docs/cs-quest.md "Curriculum"): the 44 CSTA ids against the catalogue data in
// seed-lessons/cs-quest/ (lessons, steps, game chapters, bank items, rubric lines) and the practices table (P1-P7 by unit),
// computed by server/services/lesson-templates.js coverage(), the same function the /teach/cs-quest/coverage page renders.
//   node scripts/cs-quest-coverage.js            Markdown (the matrix, the practices table, what is missing)
//   node scripts/cs-quest-coverage.js --json     the raw map
//   node scripts/cs-quest-coverage.js --level 2  one level only (1B or 2)
// Exit code 1 when the catalogue is incomplete or an id has no primary lesson outside unit 7 (so CI can print the map and
// still fail honestly); --no-fail prints without that check.
process.env.BRB_DB = process.env.BRB_DB || ':memory:';
process.env.BRB_SILENT = '1';
const T = await import('../server/services/lesson-templates.js');

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const level = args.includes('--level') ? String(args[args.indexOf('--level') + 1] || '').toUpperCase() : null;
const map = T.coverage();
const rows = map.ids.filter(s => !level || s.level === level);
const out = s => process.stdout.write(s + '\n');

if (flag('--json')) {
  out(JSON.stringify({ ...map, ids: rows }, null, 1));
} else {
  const cat = T.catalogue();
  const bold = n => `**${n}**`;
  const lessonsCell = s => [...s.primary.map(bold), ...s.also, ...s.buildsToward.map(n => `_${n}_`)].join(', ') || '—';
  const activityCell = s => {
    const seen = new Set();
    const parts = s.activities.map(a => `${a.game} · ${a.chapterTitle}${a.levels ? ` (${a.levels})` : ''}${a.then ? ` → ${a.then.chapter} ${a.then.levels}` : ''}`).filter(x => !seen.has(x) && seen.add(x));
    const other = s.steps.filter(x => x.kind !== 'game').map(x => `${x.lesson} ${x.step}`);
    return [...parts, ...other].join('; ') || '—';
  };
  const itemsCell = s => (map.banks ? `${s.items.exit} exit · ${s.items.review} review · ${s.items.opener} opener${s.items.byLesson.length ? ` (${s.items.byLesson.join(', ')})` : ''}` : 'banks not present');
  const rubricCell = s => [...new Set(s.rubric.map(r => `${r.lesson} ${r.line}`))].join('; ') || '—';
  out(`# CS Quest coverage map`);
  out('');
  out(`${map.lessons} of 46 lesson files, ${map.banks} of 14 banks${map.missing.length ? `; missing: ${map.missing.join(', ')}` : ''}.`);
  out('Bold = primary (taught, exit items tagged, a rubric line); plain = practiced again; _italic_ = builds toward (never counted as evidence).');
  out('');
  for (const lv of ['1B', '2'].filter(x => !level || x === level)) {
    out(`## Level ${lv} (grades ${T.GRADES[lv]})`);
    out('');
    out('| Id | Concept · subconcept | Practices | Lessons | Practicing activity (steps carrying the id) | Bank items | Rubric lines (Applied) |');
    out('|---|---|---|---|---|---|---|');
    for (const s of rows.filter(x => x.level === lv)) {
      out(`| ${s.id} | ${s.concept} · ${s.subconcept} | ${s.practiceCodes.join(', ')} | ${lessonsCell(s)} | ${activityCell(s)} | ${itemsCell(s)} | ${rubricCell(s)} |`);
    }
    out('');
  }
  out('## Practices by unit (from the primary ids)');
  out('');
  out(`| Practice | ${map.units.map(n => `U${n}`).join(' | ')} | Units |`);
  out(`|---|${map.units.map(() => '---').join('|')}|---|`);
  const NAMES = { 1: 'Fostering an inclusive computing culture', 2: 'Collaborating around computing', 3: 'Recognizing and defining computational problems', 4: 'Developing and using abstractions', 5: 'Creating computational artifacts', 6: 'Testing and refining computational artifacts', 7: 'Communicating about computing' };
  for (let p = 1; p <= 7; p++) {
    const cells = map.units.map(n => (map.practices[p][n] || []).join(', ') || '');
    out(`| P${p} ${NAMES[p]} | ${cells.join(' | ')} | ${cells.filter(Boolean).length} |`);
  }
  out('');
  const noPrimary = rows.filter(s => !s.primaryOutsideUnit7).map(s => s.id);
  if (noPrimary.length) out(`Ids with no primary lesson outside unit 7 yet: ${noPrimary.join(', ')}.`);
  const thin = [1, 2, 3, 4, 5, 6, 7].filter(p => map.units.filter(n => (map.practices[p][n] || []).length).length < 3);
  if (thin.length) out(`Practices in fewer than three units yet: ${thin.map(p => `P${p}`).join(', ')}.`);
  if (!cat.missing.length && !noPrimary.length && !thin.length) out('Every id has a primary lesson outside unit 7 and every practice appears in at least three units.');
}
if (!flag('--no-fail') && (map.missing.length || map.ids.some(s => !s.primaryOutsideUnit7))) process.exitCode = 1;
