// Grammar Lab, Phase 4 (polish): the user interface in every language, the lessons in English, and K-2 read-aloud.
//   - Every Grammar Lab string (grammarLab.*, js.grammar-lab.*, and its Hub and lesson-step strings) has a real
//     translation in every locale the site has (13 with English; en-GB only where British spelling differs).
//   - No hard-coded English in Grammar Lab's templates and scripts (a lint over their markup and their DOM writes).
//   - Course text (unit and topic names, cards, questions) inside a translated page is marked lang="en".
//   - Voices: all spoken text goes through the shared speak path (POST /api/tts ctx 'grammar'), read in English, and
//     stays silent until the English switch is on at /admin/voices: no speaker button and nothing fetched until then.
//     K-2 cards, questions and hints are read; never a student's name, never another band, never a stale question.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { createApp } = await import('../../server/app.js');
const { config, TTS_ALL_LOCALES } = await import('../../server/config.js');
const auth = await import('../../server/auth.js');
const GL = await import('../../server/services/grammar-lab.js');
const V = await import('../../server/services/tts-voices.js');
const TTS = await import('../../server/services/tts.js');
const { LOCALES } = await import('../../server/i18n/index.js');

const ROOT = path.resolve(import.meta.dirname, '../..');
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; config.grammarLab = true; config.grammarLabUsers = ['*']; });
test.after(() => { server.close(); config.grammarLab = false; config.grammarLabUsers = []; });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (p, u, lang = '') => (await fetch(base + p, { headers: { ...H, cookie: [u ? cookieFor(u.id) : '', lang ? `lang=${lang}` : ''].filter(Boolean).join('; ') }, redirect: 'manual' })).text();
const post = async (p, u, body) => {
  const r = await fetch(base + p, { method: 'POST', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...(u ? { cookie: cookieFor(u.id) } : {}) }, body: JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json };
};
let n = 0;
const newKid = (displayName = 'Kid') => auth.createUser({ username: `glpol${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName });

// ------------------------------------------------------------------------------------------------- translations
const flat = (o, p = '', r = {}) => { for (const [k, v] of Object.entries(o)) { if (k.startsWith('_')) continue; if (v && typeof v === 'object') flat(v, `${p}${k}.`, r); else r[`${p}${k}`] = v; } return r; };
const loc = code => flat(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales', `${code}.json`), 'utf8')));
const EN = loc('en');
/** Grammar Lab's strings: its pages and scripts, and its pieces of the Hub and of a lesson step. */
const GL_KEYS = Object.keys(EN).filter(k => /^grammarLab\.|^js\.grammar-lab\./.test(k) || ['js.homeroom-desk.grammarKind', 'js.homeroom-desk.grammarRoom', 'js.homeroom-multi.kind.grammar', 'homeroom.catalog.kind.grammar', 'homeroom.errors.noGrammar', 'lessons.kinds.grammar'].includes(k));
/** The same words in English and in that language, on purpose: the course's name, and words that are spelled the same. */
const SAME = new Set(['*:grammarLab.title', '*:lessons.kinds.grammar', 'de:grammarLab.teach.studentTitle', 'it:grammarLab.teach.studentTitle', 'nl:grammarLab.teach.studentTitle',
  'fr:grammarLab.roles.article', 'nl:grammarLab.practice.hint', 'nl:js.grammar-lab.hint', 'nl:grammarLab.card.stop']);
/** US spellings and words en-GB changes (server/i18n/README.md: en-GB holds only what differs). */
const US_ONLY = /\b(colou?r|favorite|center|honor|organiz|realiz|recogniz|behavior|Practice again|gray|mom\b)/i;

test('every Grammar Lab string has a real translation in every locale (13 with English)', () => {
  assert.equal(LOCALES.length, 13, 'the site has 13 locales');
  assert.ok(GL_KEYS.length > 230, `Grammar Lab strings: ${GL_KEYS.length}`);
  const placeholders = s => [...new Set([...String(s).matchAll(/\{(\w+)\s*[,}]/g)].map(m => m[1]))].sort().join(',');
  for (const { code } of LOCALES) {
    if (code === 'en') continue;
    const L = loc(code);
    if (code === 'en-GB') {
      // British English falls back to American English except where the spelling or the word differs
      for (const k of GL_KEYS) if (US_ONLY.test(EN[k])) assert.ok(L[k] && !US_ONLY.test(L[k].replace(/Practise/, '')) && L[k] !== EN[k], `en-GB needs its own ${k} ("${EN[k]}")`);
      continue;
    }
    const missing = GL_KEYS.filter(k => typeof L[k] !== 'string' || !L[k].trim());
    assert.deepEqual(missing, [], `${code}: missing Grammar Lab strings`);
    const same = GL_KEYS.filter(k => L[k] === EN[k] && !SAME.has(`*:${k}`) && !SAME.has(`${code}:${k}`));
    assert.deepEqual(same, [], `${code}: still in English`);
    for (const k of GL_KEYS) assert.equal(placeholders(L[k]), placeholders(EN[k]), `${code} ${k}: the same placeholders`);
    // no dashes the house style rules out, and no line that can start with its separator
    for (const k of GL_KEYS) assert.doesNotMatch(L[k], /[\u2013\u2014]/, `${code} ${k}: no en or em dash`);
    for (const k of ['grammarLab.progress.band', 'grammarLab.progress.unitHead', 'grammarLab.teach.count']) assert.doesNotMatch(L[k], / ·/, `${code} ${k}: the dot is held to the word before it`);
  }
});

// A reasonable lint: Grammar Lab's markup has no words outside ${...} (every word comes from t() or is course text),
// and its scripts never write a literal word into the page.
const FILES = ['server/views/grammar-lab.js', 'server/views/grammar-lab-teach.js', 'server/routes/grammar-lab.js', 'server/routes/grammar-lab-teach.js',
  'public/js/grammar-lab.js', 'public/js/grammar-lab-card.js', 'public/js/grammar-lab-teach.js'];
function englishIn(src) {
  const out = [];
  // comments out, then every ${...} (innermost first) folded to a marker
  let s = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  for (let i = 0; i < 12; i++) s = s.replace(/\$\{[^{}]*\}/g, '\u0001').replace(/(?<!\$)\{[^{}]*\}/g, '\u0002');
  for (const m of s.matchAll(/>([^<>`\u0001]*\p{L}{2,}[^<>`\u0001]*)</gu)) { const x = m[1].trim(); if (x && !/=>|[(){};]|&&|\|\|/.test(x)) out.push(`text: ${x}`); }
  for (const m of s.matchAll(/(?:aria-label|title|alt|placeholder|data-label)="([^"\u0001]*\p{L}{2,}[^"\u0001]*)"/gu)) out.push(`attribute: ${m[1]}`);
  for (const m of s.matchAll(/(?:textContent|innerText|ariaLabel|title|placeholder)\s*=\s*(['"`])([^'"`]*\p{L}{2,}[^'"`]*)\1/gu)) out.push(`script: ${m[2]}`);
  for (const m of s.matchAll(/setAttribute\(\s*'(?:aria-label|title|placeholder)'\s*,\s*(['"`])([^'"`]*\p{L}{2,}[^'"`]*)\1/gu)) out.push(`script: ${m[2]}`);
  for (const m of s.matchAll(/toast\(\s*(['"`])([^'"`]*\p{L}{2,}[^'"`]*)\1/gu)) out.push(`toast: ${m[2]}`);
  return out;
}
test('no hard-coded English in Grammar Lab templates and scripts', () => {
  for (const f of FILES) assert.deepEqual(englishIn(fs.readFileSync(path.join(ROOT, f), 'utf8')), [], f);
  // the lint itself catches English
  assert.deepEqual(englishIn('html`<p>Try again</p><b aria-label="Close">${t("x")}</b>`; el.textContent = \'Well done\';'), ['text: Try again', 'attribute: Close', 'script: Well done']);
  assert.deepEqual(englishIn('html`<p>${t("a")}</p><span class="x" aria-label="${t("b")}">${p.title}</span>`'), []);
});

test('course text in a translated page is English, marked lang="en"; the page around it is translated', async () => {
  const kid = newKid();
  const unit = '/courses/grammar-lab/k-2/commas';
  for (const lang of ['de', 'ar']) {
    const page = await get(unit, kid, lang);
    assert.match(page, new RegExp(`<html[^>]* lang="${lang}"`));
    assert.match(page, /<h1 lang="en" dir="ltr">Commas<\/h1>/);
    assert.match(page, /<span class="gl-tile-name" lang="en" dir="ltr">Commas with Single Words in a Series<\/span>/);
    const practice = await get(`${unit}/commas-in-a-series`, kid, lang);
    // the welcome and mastery lines: translated, with the topic's name inside lang="en"
    const welcome = /<h1 id="gl-welcome-h">(.*?)<\/h1>/s.exec(practice)[1];
    assert.match(welcome, /<span lang="en" dir="ltr">Commas with Single Words in a Series<\/span>/);
    assert.doesNotMatch(welcome, /Welcome to/);
    assert.match(practice, /<p class="gl-ask" id="gl-ask" lang="en" dir="ltr">/);
    assert.match(practice, /<section class="gl-screen gl-quiz" id="gl-quiz" hidden aria-labelledby="gl-qtopic">/);
    const back = /id="gl-done-back"[^>]*>(.*?)<\/a>/s.exec(practice)[1];
    assert.match(back, /<span lang="en" dir="ltr">Commas<\/span>/);
    const card = await get(`${unit}/commas-in-a-series/card`, kid, lang);
    assert.match(card, /<div class="gl-card-body" lang="en" dir="ltr">/);
  }
  // the band covers draw English example sentences: marked English too
  assert.match(fs.readFileSync(path.join(ROOT, 'public/img/grammar-lab/6-8-cover.svg'), 'utf8'), /<svg [^>]*lang="en"/);
});

// ------------------------------------------------------------------------------------------------- voices
const K2 = { unit: 'commas', band: 'k-2', topic: 'commas-in-a-series' };
const API = t => `/api/courses/grammar-lab/topic/${t}`;
function voices(on) {
  config.ttsEnabled = true; config.ttsProvider = 'mock'; config.ttsApiKey = ''; config.ttsLocales = [...TTS_ALL_LOCALES];
  V.save(null, { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: on.includes(l) }])) });
}
const voicesOff = () => { V.save(null, { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: false }])) }); config.ttsEnabled = false; config.ttsProvider = 'openai'; };

test('voices off: no speaker button, no voice script, and the speak path stays silent', async () => {
  const kid = newKid();
  for (const sw of [null, ['de', 'fr', 'ar']]) {
    // TTS off altogether, then on with every switch but English: the course text is English, so it stays silent
    if (sw) voices(sw);
    try {
      const card = await get(`/courses/grammar-lab/k-2/${K2.unit}/${K2.topic}/card`, kid, 'de');
      assert.doesNotMatch(card, /id="gl-listen"|grammar-lab-card\.js/);
      const practice = await get(`/courses/grammar-lab/k-2/${K2.unit}/${K2.topic}`, kid, 'de');
      assert.doesNotMatch(practice, /id="gl-say"|id="gl-hint-say"|"listen"/);
      const r = await post(`${API(K2.topic)}/start`, kid, { unit: K2.unit, band: K2.band });
      assert.equal((await post('/api/tts', kid, { ctx: 'grammar', topic: K2.topic, check: true })).status, 404);
      assert.equal((await post('/api/tts', kid, { ctx: 'grammar', topic: K2.topic, unit: K2.unit, band: K2.band, part: 'question', id: r.json.question.id, check: true })).status, 404);
    } finally { voicesOff(); }
  }
});

test('voices on (English switch): K-2 cards, questions and hints go through the shared speak path, read in English', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-tts-'));
  const keepDir = config.dataDir; config.dataDir = dir;
  const heard = [], mock = TTS.PROVIDERS.mock;
  TTS.PROVIDERS.mock = async x => { heard.push(x.text); return mock(x); };
  voices(['en']);
  try {
    const kid = newKid('Zelda Quintana');
    const card = await get(`/courses/grammar-lab/k-2/${K2.unit}/${K2.topic}/card`, kid, 'de');
    assert.match(card, /id="gl-listen"/);
    assert.match(card, /grammar-lab-card\.js/);
    const practice = await get(`/courses/grammar-lab/k-2/${K2.unit}/${K2.topic}`, kid, 'de');
    assert.match(practice, /id="gl-say"[^>]*hidden/);
    assert.match(practice, /id="gl-hint-say"[^>]*hidden/);
    assert.match(practice, /Frage vorlesen/, 'the button is in the page\'s language');
    // not read aloud: a 3-5 topic, and a K-2 topic inside a 3-5 unit
    for (const p of ['/courses/grammar-lab/3-5/fixing-sentences/identifying-action-verbs', '/courses/grammar-lab/3-5/fixing-sentences/identifying-action-verbs/card']) assert.doesNotMatch(await get(p, kid), /id="gl-say"|id="gl-listen"/, p);

    // The card: by topic id only.
    const c = await post('/api/tts', kid, { ctx: 'grammar', topic: K2.topic });
    assert.equal(c.status, 200);
    assert.match(c.json.u, /^\/tts\/[0-9a-f]{64}\.mp3$/);
    assert.equal(heard.at(-1), GL.cardSpoken(GL.topic(K2.topic)));
    // The question on screen, by its id: what the page shows (the line that asks and the sentence), in English.
    const s = await post(`${API(K2.topic)}/start`, kid, { unit: K2.unit, band: K2.band });
    const qn = s.json.question, it = GL.topic(K2.topic).items.find(x => x.id === qn.id);
    const body = { ctx: 'grammar', topic: K2.topic, unit: K2.unit, band: K2.band, id: qn.id };
    const q1 = await post('/api/tts', kid, { ...body, part: 'question' });
    assert.equal(q1.status, 200);
    assert.equal(heard.at(-1), `${qn.ask} ${it.text}`);
    // never the student's name, never text the page sends
    assert.doesNotMatch(heard.join(' '), /Zelda|Quintana/);
    assert.equal((await post('/api/tts', kid, { ...body, part: 'question', text: 'Say my name, Zelda' })).status, 200);
    assert.doesNotMatch(heard.at(-1), /Zelda/);
    // only the question on screen; the hint only once it shows
    assert.equal((await post('/api/tts', kid, { ...body, part: 'question', id: 'nope' })).status, 404);
    assert.equal((await post('/api/tts', kid, { ...body, part: 'hint', check: true })).status, 404, 'no hint before a wrong answer');
    const wrong = await post(`${API(K2.topic)}/answer`, kid, { unit: K2.unit, band: K2.band, id: qn.id, marked: [[...Array(qn.words.length - 1).keys()].find(g => !it.answer.includes(g) && !(it.optional || []).includes(g))] });
    assert.equal(wrong.json.kind, 'wrong');
    const h = await post('/api/tts', kid, { ...body, part: 'hint' });
    assert.equal(h.status, 200);
    assert.ok(heard.at(-1).startsWith(it.hint), 'the hint first, then the small card under it');
    assert.equal(heard.at(-1), GL.hintSpoken(GL.topic(K2.topic), GL.currentRun(kid, K2.topic)));
    // another unit's band, another student's run, no account: nothing
    assert.equal((await post('/api/tts', kid, { ...body, band: '3-5', unit: 'fixing-sentences', part: 'question', check: true })).status, 404);
    assert.equal((await post('/api/tts', newKid(), { ...body, part: 'question', check: true })).status, 404);
    assert.equal((await post('/api/tts', null, { ...body, part: 'question', check: true })).status, 404);
    // the kill switch: English off silences it again
    V.save(null, { locales: { en: { on: false } } });
    assert.equal((await post('/api/tts', kid, { ...body, part: 'hint', check: true })).status, 404);
  } finally { TTS.PROVIDERS.mock = mock; voicesOff(); config.dataDir = keepDir; fs.rmSync(dir, { recursive: true, force: true }); }
});

test('what a K-2 question says: the ask, the sentence with its blank, the choices; whole-sentence choices once', () => {
  const run = it => ({ cur: { item: GL.topic(it.t).items.findIndex(x => x.id === it.id), missed: false }, presented: 1 });
  const yt = GL.topic('your-and-youre'), y = yt.items[0];
  assert.equal(GL.questionSpoken(yt, run({ t: 'your-and-youre', id: y.id })), [y.ask || yt.ask, y.text.replace('___', 'blank'), ...y.options].map(x => (/[.!?]$/.test(x) ? x : `${x}.`)).join(' '));
  const wt = GL.topic('commas-after-starting-phrases'), w = wt.items[0];
  const said = GL.questionSpoken(wt, run({ t: 'commas-after-starting-phrases', id: w.id }));
  for (const o of w.options) assert.equal(said.split(o).length, 2, `"${o}" read once`);
  assert.equal(GL.hintSpoken(wt, run({ t: 'commas-after-starting-phrases', id: w.id })), '', 'no hint before a miss');
  // every K-2 question reads as plain English sentences with no markup or blanks
  for (const t of Object.values({ ...Object.fromEntries(GL.bands()[0].pathways.flatMap(p => GL.pathway(p, 'k-2').topics).map(id => [id, GL.topic(id)])) })) {
    for (let i = 0; i < t.items.length; i++) {
      const s = GL.questionSpoken(t, { cur: { item: i, missed: true }, presented: 1 });
      assert.ok(s.length > 10 && s.length < 600, `${t.id} ${i}`);
      assert.doesNotMatch(s, /___|<|\u2014/, `${t.id} ${i}`);
      assert.ok(GL.hintSpoken(t, { cur: { item: i, missed: true } }).startsWith(t.items[i].hint.slice(0, 10)));
    }
  }
});
