#!/usr/bin/env node
// npm run i18n:check  — lists, per locale, missing and extra keys and placeholder problems (see server/i18n/README.md).
//   --strict   also fail when a locale is missing keys (use once translations are meant to be complete)
//   --keys     print every missing key, not just the count
// Exit code 1 when there is an error: extra keys, bad placeholders, unparsable messages, keys the code uses that en.json
// lacks, or notes for keys that do not exist. Missing translations alone are not an error (they fall back to English).
process.env.BRB_DB = process.env.BRB_DB || ':memory:';
process.env.BRB_SILENT = '1';
const { checkAll } = await import('../server/i18n/check.js');
const args = new Set(process.argv.slice(2));
const r = checkAll();
let errors = 0;
const line = s => process.stdout.write(s + '\n');

line(`en.json: ${Object.keys(r.en).length} keys`);
for (const e of r.enErrors) { line(`  ✗ en ${e}`); errors++; }
for (const [k, f] of r.unknownInCode) { line(`  ✗ used in ${f} but missing from en.json: ${k}`); errors++; }
for (const [k, f] of r.clientScope) { line(`  ✗ ${f} uses ${k}, but that page only gets js.app.* and its own js.<name>.* strings`); errors++; }
for (const k of r.badNotes) { line(`  ✗ notes.json has a note for an unknown key: ${k}`); errors++; }
if (r.unused.length) line(`  · ${r.unused.length} en keys not found in code (dynamic keys are matched by prefix): ${r.unused.slice(0, 12).join(', ')}${r.unused.length > 12 ? ', …' : ''}`);
line('');
for (const l of r.locales) {
  const pct = Math.round(l.translated / Math.max(1, l.total) * 100);
  const bad = l.extra.length + l.placeholderErrors.length + l.parseErrors.length;
  line(`${bad ? '✗' : l.missing.length ? '·' : '✓'} ${l.code.padEnd(8)} ${String(l.translated).padStart(4)}/${l.total} translated (${pct}%)  missing ${l.missing.length}  extra ${l.extra.length}  placeholder errors ${l.placeholderErrors.length}`);
  for (const k of l.extra) line(`    extra key (not in en.json): ${k}`);
  for (const e of [...l.parseErrors, ...l.placeholderErrors]) line(`    ${e}`);
  if (args.has('--keys')) for (const k of l.missing) line(`    missing: ${k}`);
  errors += bad;
  if (args.has('--strict')) errors += l.missing.length;
}
line('');
line(errors ? `${errors} problem(s) found.` : 'No problems found.');
process.exit(errors ? 1 : 0);
