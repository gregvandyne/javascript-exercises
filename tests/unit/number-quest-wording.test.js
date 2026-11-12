// Number Quest wording, fix round A2 (a fresh-student read of the course): the words a child reads say
// what they mean, in the signs the games use, and the counts and names they state are true.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
// The pinned sentences below are the Explorer street's (deck(n) reads course/explorer); the whole-course
// sweeps (allText) read every tier that has a deck folder, and every bank.
const COURSE = 'seed-lessons/number-quest/course';
const DIR = `${COURSE}/explorer`;
const deck = n => JSON.parse(read(`${DIR}/${n}.json`));
const tierDirs = () => fs.readdirSync(path.join(ROOT, COURSE)).filter(t => fs.statSync(path.join(ROOT, COURSE, t)).isDirectory()).sort();
const allText = () => tierDirs().flatMap(t => fs.readdirSync(path.join(ROOT, COURSE, t)).map(f => read(`${COURSE}/${t}/${f}`))).join('\n') + '\n'
  + fs.readdirSync(path.join(ROOT, 'seed-lessons/number-quest/sets')).map(f => read(`seed-lessons/number-quest/sets/${f}`)).join('\n');

test('times and shares are written × and ÷, the way the games write them', () => {
  const t = allText();
  assert.doesNotMatch(t, /\d ?x ?\d/, 'no letter x between numbers');
  assert.doesNotMatch(t, /\d+\/\d+=\d+/, 'no slash for a share (45/9=5)');
  assert.match(deck('3.3').slides.map(s => JSON.stringify(s.visual || {})).join(), /45÷9=5/);
});

test('the words say what they mean', () => {
  assert.match(deck('5.2').slides[0].text, /a time tells when, but a duration tells how long/);
  assert.match(deck('0.1').slides[0].text, /town of Netville/, 'Netville is introduced where it is first named');
  assert.doesNotMatch(allText() + read('seed-games/quest-race.html'), /ledger/i, 'no "ledger": the course never teaches the word');
});

test('7.4 states the race it plays: seven locks and a last chance lock, eight questions, on the Vault Run', () => {
  const qr = read('seed-games/quest-race.html');
  const body = qr.slice(qr.indexOf('function nqVaultItems'), qr.indexOf('// Playing alone'));
  assert.equal((body.match(/mkS\(/g) || []).length, 8, 'the Vault Run asks eight questions');
  const m = deck('7.4').slides.at(-1).text;
  assert.match(m, /eight questions/);
  assert.doesNotMatch(m, /seven locks, one question per workshop, with/, 'no longer promises seven questions');
  assert.doesNotMatch(m + qr, /Honest Wheel/, 'never names a wheel the course never introduces');
  assert.equal(deck('7.4').game.chapter, 'Vault Run', 'the play button names the Vault Run');
});

test('the Rounding Run writes four-digit numbers with their comma (Round 5,322)', () => {
  const html = read('seed-games/sum-racer.html');
  const pure = html.slice(html.indexOf('const CONFIG'), html.indexOf('/* @@PURE-END */'));
  const ctx = vm.createContext({});
  vm.runInContext(`${pure}\n;globalThis.__sr = { roundQ, ansText };`, ctx);
  assert.equal(ctx.__sr.roundQ(5322, 100).text, 'Round 5,322 to the nearest hundred');
  assert.equal(ctx.__sr.ansText(ctx.__sr.roundQ(5322, 100), 5300), '5,300');
  assert.equal(ctx.__sr.roundQ(268, 10).text, 'Round 268 to the nearest ten');
});

test('3.1 races every times table it teaches (6 × 7, 7 × 8), not just 2, 5 and 10', () => {
  const d = deck('3.1');
  assert.equal(d.game.params, 'level=5&lock=1');
  assert.match(d.slides.at(-1).text, /Jungle Jam track, every times table up to 12 × 12/);
});

test('the course page teacher note maps every built unit', () => {
  const en = JSON.parse(read('server/i18n/locales/en.json'));
  const find = o => (o && typeof o === 'object' ? (o.nq && o.nq.teachers) || Object.values(o).map(find).find(Boolean) : null);
  assert.match(find(en), /Units 1–7 and the Vault of Measures finale/);
});
