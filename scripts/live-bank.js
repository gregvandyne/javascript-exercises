#!/usr/bin/env node
// Builds the question-bank packs the live games load for solo practice: public/vendor/data/live-bank/<version>/<lang>.js,
// one per site language, each holding that language's questions (server/live/bank/<lang>/*.json, or the fallback in
// server/live/bank/index.js), the words the engine needs, and the engine itself (server/live/bank/engine.js, with
// `export` removed). The version is a hash of every pack, so a change makes a new folder (/vendor is cached for a
// year). Then it writes the version and each file's sha384 into the three games, between their
// `/* live-bank:begin */` and `/* live-bank:end */` markers (docs/decisions.md "The live question bank").
//
//   node scripts/live-bank.js          (then node scripts/seed.js to load the games)
process.env.BRB_DB = process.env.BRB_DB || ':memory:';
process.env.BRB_SILENT = '1';
const fs = await import('node:fs');
const path = await import('node:path');
const crypto = await import('node:crypto');
const { fileURLToPath } = await import('node:url');
const { availableLocales, tFor } = await import('../server/i18n/index.js');
const { dataFor, stringsFor } = await import('../server/live/bank/index.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GAMES = ['quest-race', 'question-battle', 'brain-board'];
const OUT = path.join(ROOT, 'public/vendor/data/live-bank');
const engine = fs.readFileSync(path.join(ROOT, 'server/live/bank/engine.js'), 'utf8').replace(/^export (const|function) /gm, '$1 ');

const packs = {};
for (const { code } of availableLocales()) {
  const t = tFor(code);
  const strings = { ...stringsFor(code), solo: Object.fromEntries(['title', 'subject', 'level', 'count', 'start', 'boardSubjects'].map(k => [k, t(`live.bank.solo.${k}`)])) };
  strings.solo.mixed = strings.subject.mixed;
  const body = `/* Oomba Live question bank (${code}): built by scripts/live-bank.js from server/live/bank. Do not edit. */\n`
    + '(function () {\n"use strict";\n' + engine
    + `\nvar B = window.OombaBank = window.OombaBank || {};\nB[${JSON.stringify(code)}] = { data: ${JSON.stringify(dataFor(code))}, strings: ${JSON.stringify(strings)}, makeBank: makeBank, setupCard: setupCard, SUBJECTS: SUBJECTS, LEVELS: LEVELS, COUNTS: COUNTS };\n})();\n`;
  packs[code] = body;
}
const hash = crypto.createHash('sha256').update(Object.keys(packs).sort().map(k => k + packs[k]).join('\n')).digest('hex').slice(0, 8);
// letters only: a run of digits in a version could read like a phone number to the content scanner
const ver = `v1-${hash.replace(/[0-9]/g, d => 'ghijklmnop'[+d])}`;
fs.mkdirSync(OUT, { recursive: true });
for (const d of fs.readdirSync(OUT)) if (d !== ver) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, ver), { recursive: true });
const sri = {};
for (const [code, body] of Object.entries(packs)) {
  fs.writeFileSync(path.join(OUT, ver, `${code}.js`), body);
  sri[code] = 'sha384-' + crypto.createHash('sha384').update(body).digest('base64');
}
const line = `/* live-bank:begin */var BANK_VER = '${ver}', BANK_SRI = ${JSON.stringify(sri)};/* live-bank:end */`;
for (const g of GAMES) {
  const f = path.join(ROOT, 'seed-games', `${g}.html`);
  const s = fs.readFileSync(f, 'utf8');
  if (!/\/\* live-bank:begin \*\/[\s\S]*?\/\* live-bank:end \*\//.test(s)) { console.error(`${g}: no live-bank markers`); process.exitCode = 1; continue; }
  fs.writeFileSync(f, s.replace(/\/\* live-bank:begin \*\/[\s\S]*?\/\* live-bank:end \*\//, line));
}
console.log(`live-bank ${ver}: ${Object.keys(packs).length} packs (${Object.entries(packs).map(([c, b]) => `${c} ${Math.round(b.length / 1024)} KB`).join(', ')})`);
