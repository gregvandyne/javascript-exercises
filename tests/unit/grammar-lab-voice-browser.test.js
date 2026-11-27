// Grammar Lab, Phase 4: K-2 read-aloud in a real browser. With the English voice off at /admin/voices, a K-2 card and
// question show no speaker button and the page never calls the voice. With it on (the test-only mock voice), the card's
// "Read it to me", the question's and the hint's listen buttons show (in the page's language) and each plays audio from
// the shared speak path (POST /api/tts ctx 'grammar', the server reading the course text), never the device's voice. A
// device set to device voices shows none. Screenshots with GL_SHOTS=<dir>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as H from './_grammar-lab-play.js';
const { config, TTS_ALL_LOCALES } = await import('../../server/config.js');
const V = await import('../../server/services/tts-voices.js');

const env = {};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-voice-'));
const keepDir = config.dataDir;
test.before(async () => { await H.startAll(env); config.dataDir = dir; });
test.after(async () => { await H.stopAll(env); voices(null); config.dataDir = keepDir; fs.rmSync(dir, { recursive: true, force: true }); });
function voices(on) {
  if (!on) { V.save(null, { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: false }])) }); config.ttsEnabled = false; config.ttsProvider = 'openai'; return; }
  config.ttsEnabled = true; config.ttsProvider = 'mock'; config.ttsApiKey = ''; config.ttsLocales = [...TTS_ALL_LOCALES];
  V.save(null, { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: on.includes(l) }])) });
}
const UNIT = '/courses/grammar-lab/k-2/commas', TOPIC = 'commas-in-a-series';

async function open(lang, { device = false } = {}) {
  const ctx = await env.browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const kid = H.newKid('glvoice');
  await ctx.addCookies([H.sessionCookie(kid.id, env.base), { name: 'lang', value: lang, url: env.base }]);
  if (device) await ctx.addInitScript(() => localStorage.setItem('oomba:voices', 'device'));
  const page = await ctx.newPage();
  const calls = [], errors = [];
  page.on('request', r => { if (r.url().endsWith('/api/tts')) calls.push(JSON.parse(r.postData() || '{}')); });
  page.on('pageerror', e => errors.push(e.message));
  // the device's own voice never says anything: count every word handed to it (public/js/tts.js unlocks sound on a
  // page's first tap with a silent, empty utterance; that says nothing)
  await page.addInitScript(() => { window.__said = 0; if (window.speechSynthesis) window.speechSynthesis.speak = u => { if (u && String(u.text || '').trim()) window.__said++; }; });
  return { ctx, page, calls, errors, box: H.watch(page) };
}
async function toQuestion(page) {
  await page.goto(`${env.base}${UNIT}/${TOPIC}`);
  await page.waitForSelector('#gl-welcome:not([hidden])');
  await page.click('#gl-go');
  await page.waitForSelector('#gl-quiz:not([hidden])');
  await H.closeTip(page);
}

test('the English switch off: no speaker buttons, no call to the voice', { timeout: 60_000 }, async t => {
  if (env.skip) return t.skip(env.skip);
  voices(['de', 'ar', 'fr']);
  const { ctx, page, calls, errors } = await open('de');
  try {
    await page.goto(`${env.base}${UNIT}/${TOPIC}/card`);
    assert.equal(await page.$('#gl-listen'), null);
    await toQuestion(page);
    assert.equal(await page.$('#gl-say'), null);
    await page.waitForTimeout(500);
    assert.deepEqual(calls, [], 'nothing asked of the voice');
    assert.equal(await page.evaluate(() => window.__said), 0);
  } finally { await ctx.close(); }
  assert.deepEqual(errors, []);
});

test('the English switch on: the card, the question and the hint are read through the shared speak path', { timeout: 90_000 }, async t => {
  if (env.skip) return t.skip(env.skip);
  voices(['en']);
  const { ctx, page, calls, errors, box } = await open('de');
  try {
    await page.goto(`${env.base}${UNIT}/${TOPIC}/card`);
    await page.waitForSelector('#gl-listen:not([hidden])');
    assert.equal((await page.textContent('#gl-listen .lbl')).trim(), 'Vorlesen');
    await page.click('#gl-listen');
    await page.waitForFunction(() => document.querySelector('#gl-listen .lbl').textContent !== 'Vorlesen');
    assert.deepEqual(calls.at(-1), { ctx: 'grammar', topic: TOPIC });
    await page.waitForSelector('#gl-listen[aria-pressed="false"]', { timeout: 10_000 });
    await H.shot(page, 'k-2-390-light-de-voice-card');

    await toQuestion(page);
    await page.waitForSelector('#gl-say:not([hidden])');
    assert.equal((await page.textContent('#gl-say .lbl')).trim(), 'Frage vorlesen');
    // the hint's button waits inside the hint, which shows only after a wrong answer
    assert.ok(await page.isHidden('#gl-hint-say'));
    await H.shot(page, 'k-2-390-light-de-voice-question');
    assert.deepEqual(await H.layoutProblems(page, { keys: ['#gl-say'] }), []);
    await H.syncBox(page, box);
    await page.click('#gl-say');
    await page.waitForFunction(() => document.querySelector('#gl-say').getAttribute('aria-pressed') === 'true');
    await page.waitForFunction(n => window.performance.getEntriesByType('resource').filter(e => e.name.includes('/tts/')).length >= n, 1);
    assert.deepEqual(calls.at(-1), { ctx: 'grammar', topic: TOPIC, unit: 'commas', band: 'k-2', part: 'question', id: box.q.id });
    // pressed again: it stops
    await page.click('#gl-say');
    assert.equal(await page.getAttribute('#gl-say', 'aria-pressed'), 'false');
    // a wrong answer: the hint's listen button reads the hint
    await H.answer(page, box, TOPIC, { wrong: true });
    await page.waitForSelector('#gl-notice.gl-notice-wrong:not([hidden])');
    await page.click('#gl-hint-btn');
    await page.waitForSelector('#gl-hint-say:not([hidden])');
    assert.equal((await page.textContent('#gl-hint-say .lbl')).trim(), 'Tipp vorlesen');
    await page.click('#gl-hint-say');
    await page.waitForFunction(() => document.querySelector('#gl-hint-say').getAttribute('aria-pressed') === 'true');
    assert.equal(calls.at(-1).part, 'hint');
    await H.shot(page, 'k-2-390-light-de-voice-hint');
    assert.deepEqual(await H.layoutProblems(page, { keys: ['#gl-hint-say'] }), []);
    assert.equal(await page.evaluate(() => window.__said), 0, 'never the device voice');
    // every call was the shared speak path, by ids only: no text from the page
    for (const c of calls) { assert.equal(c.ctx, 'grammar'); assert.equal(c.text, undefined); }
    // a 3-5 lesson is not read aloud
    await page.goto(`${env.base}/courses/grammar-lab/3-5/fixing-sentences/identifying-action-verbs`);
    assert.equal(await page.$('#gl-say'), null);
  } finally { await ctx.close(); }
  assert.deepEqual(errors, []);
});

test('a device set to its own voices shows no speaker button (no device voice instead)', { timeout: 60_000 }, async t => {
  if (env.skip) return t.skip(env.skip);
  voices(['en']);
  const { ctx, page, calls } = await open('en', { device: true });
  try {
    await page.goto(`${env.base}${UNIT}/${TOPIC}/card`);
    assert.ok(await page.isHidden('#gl-listen'));
    await toQuestion(page);
    assert.ok(await page.isHidden('#gl-say'));
    assert.deepEqual(calls, []);
  } finally { await ctx.close(); }
});
