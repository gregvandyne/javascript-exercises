// Jungle Cup (seed-games/jungle-cup.html, built from tools/jungle-cup/src): the committed game file is what the sources
// build, it passes the safety scan, every English word the code asks for exists, and every sport file follows the
// module interface (docs/jungle-cup-plan.md "Sport module interface").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build, sources, OUT } from '../../tools/jungle-cup/build.mjs';
import { scanVersion } from '../../server/services/scanner.js';
import { sanitizeGameHtml } from '../../server/services/sanitize.js';
import { SEED_GAMES } from '../../scripts/seed.js';
import * as lines from '../../server/services/tts-lines.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'tools/jungle-cup/src');
const html = fs.readFileSync(OUT, 'utf8');
const LOCALES = ['en', 'en-GB', 'pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl'];
const SPORTS = ['paddle', 'vine', 'seed', 'rapids', 'frog', 'kick', 'leaf', 'dash'];
const CHAMPS = ['jada', 'sloane', 'tico', 'otters', 'rana', 'mico', 'kiki', 'pecca'];
const i18n = () => {
  const a = html.indexOf('// ==== I18N START ===='), b = html.indexOf('// ==== I18N END ====');
  return vm.runInNewContext(html.slice(a, b) + '\n;I18N', Object.create(null), { timeout: 2000 });
};
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const allSource = () => { const s = sources(); return [...s.core, ...s.sports, ...s.boot].map(f => stripComments(fs.readFileSync(path.join(SRC, f), 'utf8'))).join('\n'); };

test('the committed game file is up to date with tools/jungle-cup/src (npm run build:jungle)', () => {
  assert.equal(html, build(), 'seed-games/jungle-cup.html is out of date: run npm run build:jungle');
});

test('it passes the safety scan, stays under 2 MB, and is a registered seed game', () => {
  const r = scanVersion(sanitizeGameHtml(html).html);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(Buffer.byteLength(html) < 1.5 * 1024 * 1024);
  assert.ok(html.startsWith('<title>Jungle Cup</title>\n<style>'), 'starts with <title> then <style> (the game contract)');
  assert.ok(SEED_GAMES.includes('jungle-cup'));
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/jungle-cup.json'), 'utf8'));
  assert.equal(meta.slug, 'jungle-cup');
  assert.ok(fs.existsSync(path.join(ROOT, 'public/covers/jungle-cup.jpg')), 'has a cover');
  assert.ok(lines.TTS_GAMES.has('jungle-cup') && lines.gameLines('jungle-cup', 'en').length > 40, 'its lines can be read aloud');
});

test('no network, no storage outside the platform, no recording', () => {
  const src = allSource();
  for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /localStorage/, /sessionStorage/, /getUserMedia/, /MediaRecorder/, /speechSynthesis/, /\beval\s*\(/]) assert.ok(!bad.test(src), String(bad));
  assert.match(src, /BRB\.storage\.set/); assert.match(src, /BRB\.gameOver/); assert.match(src, /BRB\.sfx\.muted/);
});

test('every English word the code asks for exists (static keys and the key families)', () => {
  const en = i18n().en;
  const src = allSource();
  const keys = new Set();
  // whole keys only: t('a.b'), label('a.b', n), { key: 'a.b' } (a key built with + is a family, listed below)
  for (const m of src.matchAll(/\b(?:t|label)\(\s*'([a-zA-Z0-9_.-]+)'\s*[,)]/g)) keys.add(m[1]);
  for (const m of src.matchAll(/\bkey:\s*'([a-zA-Z0-9_-]+\.[a-zA-Z0-9_.-]+)'/g)) keys.add(m[1]);
  for (const id of SPORTS) keys.add('sport.' + id);
  for (const c of CHAMPS) { keys.add('vs.' + c); keys.add('name.' + c); for (const k of ['pre', 'won', 'soon']) keys.add(`d.${c}.${k}`); }
  for (const w of ['cappy', 'mango', 'coco', 'pip', 'tapir', 'ants', 'elder', 'zuzu', 'marm']) keys.add('name.' + w);
  for (let i = 1; i <= 8; i++) { keys.add('d.tapir.tip' + i); keys.add('credits.' + i); }
  for (let i = 0; i <= 3; i++) keys.add('d.mango.hint' + i);
  for (const k of ['controls.touch.body', 'controls.keys.body', 'controls.pad.body', 'band.green', 'band.sky', 'band.sunset', 'hat.straw', 'hat.explorer', 'flag.leaf']) keys.add(k);
  // the people's lines that talkLines builds from parts
  for (const m of src.matchAll(/L\('([a-z]+)',\s*([^)]*)\)/g)) for (const k of m[2].matchAll(/'([a-z0-9]+)'(?!\s*\+)/g)) keys.add(`d.${m[1]}.${k[1]}`);
  for (const id of Object.keys({ leaf: 1, specs: 1, letter: 1, mango: 1 })) keys.add('quest.got.' + id);
  for (const k of ['bandana', 'hat', 'flag']) keys.add('quest.reward.' + k);
  const missing = [...keys].filter(k => en[k] === undefined && !/^d\.[a-z]+\.$/.test(k));
  assert.deepEqual(missing, []);
  // each sport that is built has its intro card words
  for (const f of sources().sports) {
    const id = /^sport-([a-z0-9-]+)\.js$/.exec(f)[1];
    for (const k of ['goal', 'touch', 'keys']) assert.ok(en[`sport.${id}.${k}`], `sport.${id}.${k}`);
  }
});

test('the words are a data table for the 13 site locales (English complete; others may be partial)', () => {
  const t = i18n();
  for (const l of Object.keys(t)) assert.ok(LOCALES.includes(l), `unknown locale ${l}`);
  for (const l of Object.keys(t)) for (const [k, v] of Object.entries(t[l])) {
    assert.ok(t.en[k] !== undefined, `${l}.${k} has no English key`);
    assert.equal(typeof v, typeof t.en[k], `${l}.${k}`);
    const ph = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
    if (typeof v === 'string') assert.equal(ph(v), ph(t.en[k]), `${l}.${k} keeps the {placeholders}`);
  }
});

test('every sport file follows the module interface', () => {
  for (const f of sources().sports) {
    const id = /^sport-([a-z0-9-]+)\.js$/.exec(f)[1];
    assert.ok(SPORTS.includes(id), `${f}: the sport id must be one of ${SPORTS}`);
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    assert.match(src, /^\(function \(\) \{/m, `${f}: wrapped in its own (function () { ... })()`);
    assert.match(src, new RegExp(`JC\\.register\\(\\{\\s*id: '${id}'`), `${f}: JC.register({ id: '${id}', ... })`);
    for (const fn of ['start', 'update', 'draw', 'onInput', 'testState', 'cheat']) assert.match(src, new RegExp(`\\b${fn}\\s*[(:]`), `${f}: ${fn}`);
    assert.match(src, /ctx\.finish\(\{/, `${f}: ends the round with ctx.finish({ score, stars, won })`);
    assert.ok(!/\bI18N\b/.test(src), `${f}: words go in src/i18n/${id}.<lang>.js, not in the sport file`);
    assert.ok(fs.existsSync(path.join(SRC, 'i18n', `${id}.en.js`)), `${f}: has i18n/${id}.en.js`);
  }
  // the reference sport is there
  assert.ok(sources().sports.includes('sport-paddle.js'));
});

test('i18n source files only add words: I18N.<locale> = Object.assign(I18N.<locale> || {}, { ... })', () => {
  for (const f of sources().i18n) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8'), m = /^([a-z0-9-]+)\.([a-zA-Z-]+)\.js$/.exec(path.basename(f));
    assert.ok(m, `${f}: named <area>.<locale>.js`);
    assert.ok(LOCALES.includes(m[2]), `${f}: a site locale`);
    const loc = m[2].includes('-') ? `I18N\\['${m[2]}'\\]` : `I18N\\.${m[2]}`;
    assert.match(src, new RegExp(`^${loc} = Object\\.assign\\(${loc} \\|\\| \\{\\}, \\{`, 'm'), f);
  }
});
