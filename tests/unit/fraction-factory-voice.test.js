// Fraction Factory voice-readiness (Greg's standing rule, 2026-11-05: every game uses the OpenAI AI
// voice). Pins the two branch-side conditions: (1) speech goes through the shared BRB.speak path,
// never a game's own speechSynthesis; (2) every spoken line lives in the FractionFactoryI18n block
// under a stable key, identical to the line the game displays, so registering the game in
// server/services/tts-lines.js is a single entry with one spoken-key regex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'seed-games', 'fraction-factory.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
function loadWith(script) {
  const ctx = {}; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(script, ctx);
  return ctx;
}
const { LEVELS } = loadWith(scripts.find(s => s.includes('FractionFactoryLevels'))).FractionFactoryLevels;
const i18nScript = scripts.find(s => s.includes('FractionFactoryI18n'));
const en = loadWith(i18nScript).FractionFactoryI18n.en;

test('fraction factory never calls speechSynthesis and speaks only via BRB.speak', () => {
  assert.ok(!/speechSynthesis\.(speak|cancel|pause|resume|getVoices)|window\.speechSynthesis|SpeechSynthesisUtterance/.test(html), 'game must not use its own speechSynthesis');
  assert.ok(html.includes('B.speak(text, { lang: FF_LANG'), 'speech must route through the shared BRB.speak path');
  assert.ok(html.includes('B.aiVoice(FF_LANG)'), 'speech must be gated on the platform AI-voice switch');
  assert.ok(html.includes('VOICE.say(S.sayText, S.sayKey)'), 'the say bubble must speak what it displays');
});

test('the I18N block carries every spoken line, identical to the displayed line', () => {
  assert.ok(i18nScript.includes('// ==== I18N START ====') && i18nScript.includes('// ==== I18N END ===='), 'warm-up markers present');
  assert.ok(en && typeof en === 'object', 'English source pack present');
  for (const l of LEVELS) {
    assert.equal(en[`intro.${l.id}`], l.intro, `intro.${l.id}`);
    l.hints.forEach((h, i) => assert.equal(en[`hint.${l.id}.${i + 1}`], h, `hint.${l.id}.${i + 1}`));
  }
  const why = Object.fromEntries([...html.matchAll(/'(no-cut|cut-size|reslice|too-few|too-many|value|line|compare|pick-first)': '([^']+)'/g)].map(m => [m[1], m[2]]));
  assert.equal(Object.keys(why).length, 9, 'all nine WHY feedback lines found in the game');
  for (const [k, v] of Object.entries(why)) assert.equal(en[`why.${k}`], v, `why.${k}`);
  assert.equal(en['why.default'], 'A mistake is a clue about how your brain is thinking. Try again!');
  assert.equal(en['say.welcome'], 'I am Tally the cat. Pick a counter and let us get slicing!');
});

test('every I18N key fits one spoken-key regex, so tts-lines registration is a single entry', () => {
  const keys = Object.keys(en);
  assert.ok(keys.length >= 90, `expected the full spoken set, got ${keys.length}`);
  for (const k of keys) assert.match(k, /^(say|intro|hint|why)\.[a-z0-9.-]+$/, `key ${k} would escape a one-line registration`);
});
