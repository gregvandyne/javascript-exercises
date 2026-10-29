// Game voices: BRB.voice / BRB.speak in public/sdk/brb-sdk.js pick the most natural voice: on-device natural voices first,
// then the browser's online voices (the text goes to Google / Microsoft; owner accepted, 29 Oct 2026), then plain on-device ones.
// The voice lists below are modelled on what real browsers report (names, lang spellings, localService).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SDK = fs.readFileSync('public/sdk/brb-sdk.js', 'utf8');
const between = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i >= 0 && j > i, `markers ${a} .. ${b}`); return src.slice(i, j); };
const sdkPick = new Function(between(SDK, '// voice-pick:start', '// voice-pick:end') + '\nreturn pickVoice;')();

// ---- Voice lists ----------------------------------------------------------------------------
const V = (name, lang, o = {}) => ({ name, lang, voiceURI: o.uri || name, localService: o.local !== false, default: !!o.def });
const G = (name, lang) => V(name, lang, { local: false });   // an online voice (the text goes to Google / Microsoft)
const GOOGLE_NET = [G('Google Deutsch', 'de-DE'), G('Google US English', 'en-US'), G('Google UK English Female', 'en-GB'), G('Google UK English Male', 'en-GB'),
  G('Google español', 'es-ES'), G('Google español de Estados Unidos', 'es-US'), G('Google français', 'fr-FR'), G('Google italiano', 'it-IT'), G('Google 日本語', 'ja-JP'),
  G('Google Nederlands', 'nl-NL'), G('Google português do Brasil', 'pt-BR'), G('Google русский', 'ru-RU'), G('Google 普通话（中国大陆）', 'zh-CN'),
  G('Google 粤語（香港）', 'zh-HK'), G('Google 國語（臺灣）', 'zh-TW')];
const apple = (name, lang, kind = 'compact', o = {}) => V(name, lang, { uri: kind === 'novelty' ? 'com.apple.speech.synthesis.voice.' + name.replace(/ /g, '')
  : kind === 'eloquence' ? 'com.apple.eloquence.' + lang + '.' + name.split(' ')[0] : `com.apple.voice.${kind}.${lang}.${name.split(' ')[0]}`, ...o });
const NOVELTY = ['Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Fred', 'Good News', 'Jester', 'Junior', 'Kathy', 'Organ', 'Ralph',
  'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox'].map(n => apple(n, 'en-US', 'novelty'));

const LISTS = {
  // Chrome on Windows with only the English language pack: three local Microsoft voices, the rest are Google server voices.
  chromeWindows: [V('Microsoft David - English (United States)', 'en-US', { def: true }), V('Microsoft Mark - English (United States)', 'en-US'),
    V('Microsoft Zira - English (United States)', 'en-US'), ...GOOGLE_NET],
  // Edge on Windows: local OneCore voices plus the "Online (Natural)" server voices.
  edgeWindows: [V('Microsoft David - English (United States)', 'en-US', { def: true }), V('Microsoft Hazel - English (United Kingdom)', 'en-GB'),
    V('Microsoft Mark - English (United States)', 'en-US'), V('Microsoft Zira - English (United States)', 'en-US'),
    ...[['Aria', 'English (United States)', 'en-US'], ['Sonia', 'English (United Kingdom)', 'en-GB'], ['Elvira', 'Spanish (Spain)', 'es-ES'],
      ['Denise', 'French (France)', 'fr-FR'], ['Katja', 'German (Germany)', 'de-DE'], ['Nanami', 'Japanese (Japan)', 'ja-JP'], ['Hila', 'Hebrew (Israel)', 'he-IL'],
      ['HsiaoChen', 'Chinese (Taiwan)', 'zh-TW'], ['Francisca', 'Portuguese (Brazil)', 'pt-BR']]
      .map(([n, l, t]) => G(`Microsoft ${n} Online (Natural) - ${l}`, t))],
  // Windows 11 with natural voices installed on the device.
  windowsNaturalLocal: [V('Microsoft David - English (United States)', 'en-US', { def: true }), V('Microsoft Jenny (Natural) - English (United States)', 'en-US'),
    V('Microsoft Libby (Natural) - English (United Kingdom)', 'en-GB'), V('Microsoft Hazel - English (United Kingdom)', 'en-GB')],
  // Firefox on Windows: the old SAPI 5 "Desktop" voices, in several languages, plus one OneCore voice.
  firefoxWindows: [V('Microsoft David Desktop - English (United States)', 'en-US', { def: true }), V('Microsoft Zira Desktop - English (United States)', 'en-US'),
    V('Microsoft Hazel Desktop - English (Great Britain)', 'en-GB'), V('Microsoft Mark - English (United States)', 'en-US'),
    V('Microsoft Helena Desktop - Spanish (Spain)', 'es-ES'), V('Microsoft Hortense Desktop - French', 'fr-FR'), V('Microsoft Hedda Desktop - German', 'de-DE'),
    V('Microsoft Haruka Desktop - Japanese', 'ja-JP'), V('Microsoft Asaf Desktop - Hebrew', 'he-IL'), V('Microsoft Hanhan Desktop - Chinese (Taiwan)', 'zh-TW'),
    V('Microsoft Maria Desktop - Portuguese(Brazil)', 'pt-BR')],
  // Safari on macOS: alphabetical, so the novelty voices come first (the old first-match code picked "Albert").
  macSafari: [...NOVELTY.slice(0, 2), apple('Alice', 'it-IT'), apple('Amélie', 'fr-CA'), apple('Anna', 'de-DE'), ...NOVELTY.slice(2),
    apple('Carmit', 'he-IL'), apple('Daniel', 'en-GB'), apple('Eddy (English (US))', 'en-US', 'eloquence'), apple('Eddy (Deutsch (Deutschland))', 'de-DE', 'eloquence'),
    apple('Flo (English (UK))', 'en-GB', 'eloquence'), apple('Grandma (Français (France))', 'fr-FR', 'eloquence'), apple('Joana', 'pt-PT'), apple('Karen', 'en-AU'),
    apple('Kyoko', 'ja-JP'), apple('Luciana', 'pt-BR'), apple('Mei-Jia', 'zh-TW'), apple('Moira', 'en-IE'), apple('Mónica', 'es-ES'), apple('Paulina', 'es-MX'),
    apple('Rocko (Español (España))', 'es-ES', 'eloquence'), apple('Samantha', 'en-US', 'compact', { def: true }), apple('Sin-ji', 'zh-HK'), apple('Thomas', 'fr-FR'),
    apple('Ting-Ting', 'zh-CN'), apple('Xander', 'nl-NL'), apple('Ava (Premium)', 'en-US', 'premium')],
  // Safari on iPhone / iPad (iOS 17): compact voices, a downloaded "Enhanced" voice, novelty and Eloquence voices.
  iosSafari: [apple('Albert', 'en-US', 'novelty'), apple('Arthur', 'en-GB'), apple('Carmit', 'he-IL'), apple('Daniel (Enhanced)', 'en-GB', 'enhanced'),
    apple('Fred', 'en-US', 'novelty'), apple('Kyoko', 'ja-JP'), apple('Luciana', 'pt-BR'), apple('Mei-Jia', 'zh-TW'), apple('Mónica', 'es-ES'),
    apple('Reed (English (UK))', 'en-GB', 'eloquence'), apple('Samantha', 'en-US', 'compact', { def: true }), apple('Samantha (Enhanced)', 'en-US', 'enhanced'),
    apple('Sin-ji', 'zh-HK'), apple('Thomas', 'fr-FR'), apple('Anna', 'de-DE')],
  // A Chromebook: older "Chrome OS" voices and the newer on-device natural voices, plus Google server voices.
  chromeOS: [V('Chrome OS US English 1', 'en-US', { def: true }), V('Chrome OS UK English 1', 'en-GB'), V('Google US English 1 (Natural)', 'en-US'),
    V('Google UK English 2 (Natural)', 'en-GB'), V('Google español de España 1 (Natural)', 'es-ES'), V('Google français 1 (Natural)', 'fr-FR'),
    V('Google Deutsch 1 (Natural)', 'de-DE'), V('Google 日本語 1 (Natural)', 'ja-JP'), V('Google עברית 1 (Natural)', 'he-IL'),
    V('Google 國語（臺灣） 1 (Natural)', 'zh-TW'), V('Google português do Brasil 1 (Natural)', 'pt-BR'), ...GOOGLE_NET],
  // Chrome on Android: underscores, the old "iw" code for Hebrew, Cantonese as yue, and a "-network" voice.
  android: [V('en-us-x-iol-network', 'en-US'), V('English United States', 'en_US', { def: true }), V('English United Kingdom', 'en_GB'),
    V('Spanish United States', 'es_US'), V('Spanish Spain', 'es_ES'), V('French France', 'fr_FR'), V('German Germany', 'de_DE'), V('Japanese Japan', 'ja_JP'),
    V('Hebrew Israel', 'iw_IL'), V('Chinese China', 'cmn_CN'), V('Chinese Hong Kong', 'yue_HK'), V('Chinese Taiwan', 'cmn_TW'),
    V('Portuguese Portugal', 'pt_PT'), V('Portuguese Brazil', 'pt_BR')],
  // Chromium on Linux with speech-dispatcher: eSpeak voices and one Piper voice, plus Google server voices.
  linux: [V('English (America) espeak-ng', 'en-US', { def: true }), V('English (Great Britain) espeak-ng', 'en-GB'), V('Spanish espeak-ng', 'es'),
    V('en_US-amy-medium piper', 'en-US'), ...GOOGLE_NET],
};

const LANGS = ['en-US', 'en-GB', 'es', 'fr', 'de', 'ja', 'he', 'zh-Hant', 'pt'];
const EXPECT = {
  // Online natural voices beat the plain local Microsoft voices.
  chromeWindows: { 'en-US': 'Google US English', 'en-GB': 'Google UK English Female', es: 'Google español', fr: 'Google français',
    de: 'Google Deutsch', ja: 'Google 日本語', he: null, 'zh-Hant': 'Google 國語（臺灣）', pt: 'Google português do Brasil' },
  edgeWindows: { 'en-US': 'Microsoft Aria Online (Natural) - English (United States)', 'en-GB': 'Microsoft Sonia Online (Natural) - English (United Kingdom)',
    es: 'Microsoft Elvira Online (Natural) - Spanish (Spain)', fr: 'Microsoft Denise Online (Natural) - French (France)',
    de: 'Microsoft Katja Online (Natural) - German (Germany)', ja: 'Microsoft Nanami Online (Natural) - Japanese (Japan)',
    he: 'Microsoft Hila Online (Natural) - Hebrew (Israel)', 'zh-Hant': 'Microsoft HsiaoChen Online (Natural) - Chinese (Taiwan)',
    pt: 'Microsoft Francisca Online (Natural) - Portuguese (Brazil)' },
  windowsNaturalLocal: { 'en-US': 'Microsoft Jenny (Natural) - English (United States)', 'en-GB': 'Microsoft Libby (Natural) - English (United Kingdom)',
    es: null, fr: null, de: null, ja: null, he: null, 'zh-Hant': null, pt: null },
  firefoxWindows: { 'en-US': 'Microsoft Mark - English (United States)', 'en-GB': 'Microsoft Hazel Desktop - English (Great Britain)',
    es: 'Microsoft Helena Desktop - Spanish (Spain)', fr: 'Microsoft Hortense Desktop - French', de: 'Microsoft Hedda Desktop - German',
    ja: 'Microsoft Haruka Desktop - Japanese', he: 'Microsoft Asaf Desktop - Hebrew', 'zh-Hant': 'Microsoft Hanhan Desktop - Chinese (Taiwan)',
    pt: 'Microsoft Maria Desktop - Portuguese(Brazil)' },
  macSafari: { 'en-US': 'Ava (Premium)', 'en-GB': 'Daniel', es: 'Mónica', fr: 'Thomas', de: 'Anna', ja: 'Kyoko', he: 'Carmit', 'zh-Hant': 'Mei-Jia', pt: 'Luciana' },
  iosSafari: { 'en-US': 'Samantha (Enhanced)', 'en-GB': 'Daniel (Enhanced)', es: 'Mónica', fr: 'Thomas', de: 'Anna', ja: 'Kyoko', he: 'Carmit',
    'zh-Hant': 'Mei-Jia', pt: 'Luciana' },
  chromeOS: { 'en-US': 'Google US English 1 (Natural)', 'en-GB': 'Google UK English 2 (Natural)', es: 'Google español de España 1 (Natural)',
    fr: 'Google français 1 (Natural)', de: 'Google Deutsch 1 (Natural)', ja: 'Google 日本語 1 (Natural)', he: 'Google עברית 1 (Natural)',
    'zh-Hant': 'Google 國語（臺灣） 1 (Natural)', pt: 'Google português do Brasil 1 (Natural)' },
  android: { 'en-US': 'en-us-x-iol-network', 'en-GB': 'English United Kingdom', es: 'Spanish Spain', fr: 'French France', de: 'German Germany',
    ja: 'Japanese Japan', he: 'Hebrew Israel', 'zh-Hant': 'Chinese Taiwan', pt: 'Portuguese Brazil' },
  linux: { 'en-US': 'Google US English', 'en-GB': 'Google UK English Female', es: 'Google español', fr: 'Google français',
    de: 'Google Deutsch', ja: 'Google 日本語', he: null, 'zh-Hant': 'Google 國語（臺灣）', pt: 'Google português do Brasil' },
};

for (const [platform, list] of Object.entries(LISTS)) {
  test(`picks the most natural voice: ${platform}`, () => {
    for (const lang of LANGS) {
      const v = sdkPick(list, lang);
      assert.equal(v ? v.name : null, EXPECT[platform][lang], `${platform} ${lang}`);
    }
  });
}

test('language tags: exact region first, he = iw, zh-Hant = zh-TW then zh-CN then zh-HK, pt = pt-BR then pt-PT', () => {
  const names = (list, lang) => { const v = sdkPick(list, lang); return v && v.name; };
  assert.equal(names([V('US', 'en-US'), V('UK', 'en-GB')], 'en-GB'), 'UK');
  assert.equal(names([V('UK', 'en-GB'), V('US', 'en-US')], 'en'), 'US');
  assert.equal(names([V('UK', 'en-GB')], 'en-US'), 'UK');   // another region of the language beats nothing
  assert.equal(names([V('Old', 'iw-IL')], 'he'), 'Old');
  assert.equal(names([V('New', 'he-IL')], 'iw'), 'New');
  // zh-Hant is spoken as Mandarin: a mainland Mandarin voice beats a Hong Kong (Cantonese) one.
  assert.equal(names([V('Sinji', 'zh-HK'), V('Tingting', 'zh-CN')], 'zh-Hant'), 'Tingting');
  assert.equal(names([V('Cantonese', 'yue_HK'), V('Mandarin', 'cmn_CN')], 'zh-Hant'), 'Mandarin');
  assert.equal(names([V('HK', 'zh-HK')], 'zh-Hant'), 'HK');   // still better than silence
  // A region tag with no entry of its own (en-US, the games' word language) falls back to the language's order.
  assert.equal(names([V('Microsoft Heera - English (India)', 'en-IN', { def: true }), V('Microsoft Hazel - English (United Kingdom)', 'en-GB')], 'en-US'),
    'Microsoft Hazel - English (United Kingdom)');
  assert.equal(names([V('AU', 'en-AU'), V('CA', 'en-CA')], 'en-US'), 'CA');
  assert.equal(names([V('US', 'es-US'), V('ES', 'es-ES')], 'es-MX'), 'ES');
  assert.equal(names([V('TW', 'zh-TW'), V('CN', 'zh-CN')], 'zh-HK'), 'CN');   // hk, then zh's own order (cn, tw)
  assert.equal(names([V('HK', 'zh-HK'), V('TW', 'zh-TW')], 'zh-Hant'), 'TW');
  assert.equal(names([V('CN', 'zh-CN')], 'zh-Hant'), 'CN');
  assert.equal(names([V('Hant', 'cmn-Hant-TW'), V('CN', 'zh-CN')], 'zh-Hant'), 'Hant');
  assert.equal(names([V('PT', 'pt-PT'), V('BR', 'pt-BR')], 'pt'), 'BR');
  assert.equal(names([V('PT', 'pt-PT')], 'pt'), 'PT');
  assert.equal(names([V('FR', 'fr-FR')], 'de'), null);
  assert.equal(names([], 'en'), null);
  assert.equal(sdkPick(null, 'en'), null);
});

test('novelty, Eloquence, eSpeak and Desktop voices lose to a standard voice; Premium/Enhanced/Natural win', () => {
  const pick = list => sdkPick(list, 'en-US').name;
  for (const n of ['Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Good News', 'Jester', 'Organ', 'Superstar', 'Trinoids', 'Whisper',
    'Wobble', 'Zarvox', 'Fred', 'Junior', 'Kathy', 'Ralph', 'Grandma (English (US))', 'Grandpa (English (US))', 'Rocko (English (US))', 'Shelley (English (US))',
    'Flo (English (US))', 'Eddy (English (US))', 'Reed (English (US))', 'Sandy (English (US))', 'eSpeak English']) {
    assert.equal(pick([V(n, 'en-US'), V('Samantha', 'en-US')]), 'Samantha', n);
  }
  assert.equal(pick([V('Microsoft David Desktop - English (United States)', 'en-US'), V('Microsoft Zira - English (United States)', 'en-US')]), 'Microsoft Zira - English (United States)');
  assert.equal(pick([V('Samantha', 'en-US', { def: true }), V('Zoe (Premium)', 'en-US')]), 'Zoe (Premium)');
  assert.equal(pick([V('Samantha', 'en-US'), V('Siri Voice 2', 'en-US')]), 'Siri Voice 2');
  // A novelty voice in the right region still loses to a normal voice from another region.
  assert.equal(pick([V('Albert', 'en-US'), V('Daniel', 'en-GB')]), 'Daniel');
  // ...but when it is the only voice for the language, it is better than silence.
  assert.equal(pick([V('Albert', 'en-US')]), 'Albert');
});

test('online voices: after on-device natural voices, before plain on-device ones, never in the wrong language', () => {
  const pick = (list, lang = 'en-US') => { const v = sdkPick(list, lang); return v && v.name; };
  const david = V('Microsoft David - English (United States)', 'en-US', { def: true });
  const aria = G('Microsoft Aria Online (Natural) - English (United States)', 'en-US');
  // Windows Chrome: Google US English beats David (also David Desktop).
  assert.equal(pick([david, G('Google US English', 'en-US')]), 'Google US English');
  assert.equal(pick([V('Microsoft David Desktop - English (United States)', 'en-US', { def: true }), G('Google US English', 'en-US')]), 'Google US English');
  // Edge: Aria Online (Natural) beats David.
  assert.equal(pick([david, aria]), aria.name);
  // Windows 11 with a local Natural voice: it beats the online Natural one, wherever it is in the list.
  assert.equal(pick([aria, V('Microsoft Jenny (Natural) - English (United States)', 'en-US')]), 'Microsoft Jenny (Natural) - English (United States)');
  assert.equal(pick([V('Microsoft Jenny (Natural) - English (United States)', 'en-US'), aria]), 'Microsoft Jenny (Natural) - English (United States)');
  // Mac / iPhone: Premium, Enhanced and Siri voices beat Google US English; a compact Samantha does not.
  assert.equal(pick([G('Google US English', 'en-US'), V('Ava (Premium)', 'en-US', { uri: 'com.apple.voice.premium.en-US.Ava' })]), 'Ava (Premium)');
  assert.equal(pick([G('Google US English', 'en-US'), V('Samantha (Enhanced)', 'en-US')]), 'Samantha (Enhanced)');
  assert.equal(pick([G('Google US English', 'en-US'), V('Siri Voice 2', 'en-US')]), 'Siri Voice 2');
  assert.equal(pick([V('Samantha', 'en-US', { uri: 'com.apple.voice.compact.en-US.Samantha', def: true }), G('Google US English', 'en-US')]), 'Google US English');
  // A local Google voice (Android, ChromeOS), even the default one, still comes after an online voice.
  assert.equal(pick([V('Google US English local', 'en-US', { def: true }), V('en-us-x-sfg-network', 'en-US')]), 'en-us-x-sfg-network');
  // Penalised local voices come after online voices; an online voice alone is better than silence.
  assert.equal(pick([V('Fred', 'en-US'), aria]), aria.name);
  assert.equal(pick([V('English (America) espeak-ng', 'en-US'), G('Google US English', 'en-US')]), 'Google US English');
  assert.equal(pick([G('Google US English', 'en-US')]), 'Google US English');
  assert.equal(pick([V('en-us-x-sfg-network', 'en-US')]), 'en-us-x-sfg-network');
  // Non-English on Windows Chrome: the Google network voice instead of nothing.
  assert.equal(pick([david, G('Google français', 'fr-FR')], 'fr'), 'Google français');
  // Language still decides: an online voice never speaks another language.
  assert.equal(pick([G('Google US English', 'en-US')], 'fr'), null);
  assert.equal(pick([V('Daniel', 'en-GB'), G('Google français', 'fr-FR')], 'en-US'), 'Daniel');
});

// ---- The games' standalone copies agree with the SDK --------------------------------------------
const GAMES = ['seed-games/word-peek.html', 'seed-games/shark-plank.html'];
for (const file of GAMES) {
  test(`${file}: its standalone voice pick agrees with BRB.voice`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const pick = new Function(between(src, '/* voice-pick:start', '/* voice-pick:end */') + '\nreturn pickVoice;')();
    for (const list of Object.values(LISTS)) {
      for (const lang of [...LANGS, 'en', 'ar', 'ru', 'it', 'nl', 'zh-TW', 'zh-HK', 'es-MX', 'en-IN', 'iw']) assert.equal(pick(list, lang), sdkPick(list, lang), `${file} ${lang}`);
    }
  });
}

const SPEAKERS = ['seed-games/word-hunt.html', 'seed-games/word-peek.html', 'seed-games/shark-plank.html', 'server/builder/templates/word.html'];
test('games speak through BRB.speak at the normal pitch', () => {
  for (const file of SPEAKERS) {
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /BRB\.speak\(/, `${file} uses BRB.speak`);
    for (const m of src.matchAll(/\.pitch\s*=\s*([^;,)\s]+)|\bpitch\s*:\s*([^,}\s]+)/g)) assert.equal(m[1] || m[2], '1', `${file}: pitch ${m[0]}`);
    assert.doesNotMatch(src, /getVoices\(\)[^;]*\.find\(/, `${file}: no first-match voice pick`);
    const rates = [...src.matchAll(/\b(?:speechRate|talkRate|wordRate|talk|word)\s*:\s*(\.?\d[\d.]*)/g)].map(m => +m[1]);
    for (const r of rates) assert.ok(r >= 0.8 && r <= 1, `${file}: rate ${r}`);
  }
});

// ---- BRB.speak: run the SDK's speech code against a fake speechSynthesis ---------------------------
const SPEECH = between(SDK, '  // ---- Speech: the most natural voice', '  var BRB = {');
function fakeSpeech({ voices = [], paused = false, synth = true, user = { lang: 'fr' }, win: reuse } = {}) {
  const log = [], listeners = {}, timers = [];
  const ss = {
    paused, list: voices,
    getVoices() { return this.list; },
    speak(u) { log.push(['speak', u]); },
    cancel() { log.push(['cancel']); },
    resume() { log.push(['resume']); this.paused = false; },
    addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); },
  };
  class Utter { constructor(text) { this.text = text; this.lang = ''; this.voice = null; this.pitch = 1; this.rate = 1; this.volume = 1; } }
  const win = reuse || { addEventListener() {}, removeEventListener() {} };
  if (synth && !reuse) { win.speechSynthesis = ss; win.SpeechSynthesisUtterance = Utter; }
  const api = new Function('window', 'INIT', 'setTimeout', SPEECH + '\nreturn { speak: speak, stopSpeaking: stopSpeaking, voiceFor: voiceFor, chunks: speechChunks };')(
    win, { user }, (f, ms) => timers.push([f, ms]));
  const spoken = () => log.filter(l => l[0] === 'speak').map(l => l[1]);
  return { api, ss, win, Utter: win.SpeechSynthesisUtterance, log, spoken, fire: n => (listeners[n] || []).forEach(f => f()), runTimers: () => timers.splice(0).forEach(([f]) => f()) };
}

test('BRB.speak uses the best voice at rate 1 and pitch 1, cancelling the line before unless queue', () => {
  const f = fakeSpeech({ voices: LISTS.macSafari });
  assert.equal(f.api.speak('Bonjour !'), true);   // default language: BRB.user.lang (fr)
  let [u] = f.spoken();
  assert.equal(u.voice.name, 'Thomas'); assert.equal(u.lang, 'fr-FR'); assert.equal(u.rate, 1); assert.equal(u.pitch, 1); assert.equal(u.volume, 1);
  assert.deepEqual(f.log[0], ['cancel']);
  f.log.length = 0;
  assert.equal(f.api.speak('cat', { lang: 'en-US', rate: 0.9, queue: true }), true);
  assert.equal(f.log.some(l => l[0] === 'cancel'), false);
  [u] = f.spoken();
  assert.equal(u.voice.name, 'Ava (Premium)'); assert.equal(u.rate, 0.9);
  assert.equal(f.api.speak('x', { lang: 'en-US', rate: 99, pitch: -3 }), true);
  u = f.spoken().at(-1); assert.equal(u.rate, 2); assert.equal(u.pitch, 0);   // clamped
});

test('BRB.speak returns false gracefully: no speech, no text, no voice for the language', () => {
  assert.equal(fakeSpeech({ synth: false }).api.speak('hi'), false);
  assert.equal(fakeSpeech({ synth: false }).api.voiceFor('en'), null);
  const f = fakeSpeech({ voices: LISTS.windowsNaturalLocal });
  assert.equal(f.api.speak(''), false);
  assert.equal(f.api.speak('   '), false);
  assert.equal(f.api.speak('Bonjour'), false);   // no French voice at all: say nothing
  assert.equal(f.spoken().length, 0);
  const g = fakeSpeech({ voices: LISTS.chromeWindows });
  assert.equal(g.api.speak('Bonjour'), true);   // only Google's online French voice: use it
  assert.equal(g.spoken()[0].voice.name, 'Google français');
});

test('BRB.speak waits for a voice list that arrives late, and gives up when none comes', () => {
  const f = fakeSpeech({ voices: [] });
  assert.equal(f.api.speak('hello', { lang: 'en-US' }), true);   // waiting for voiceschanged
  assert.equal(f.spoken().length, 0);
  f.ss.list = LISTS.iosSafari; f.fire('voiceschanged');
  assert.equal(f.spoken()[0].voice.name, 'Samantha (Enhanced)');
  const g = fakeSpeech({ voices: [] });
  g.api.speak('hello', { lang: 'en-US' });
  g.runTimers();   // 1.5 s later, still no voices (headless browsers)
  assert.equal(g.spoken().length, 0);
  assert.equal(g.api.speak('hello', { lang: 'en-US' }), false);
});

test('the voice cache is refreshed when the voice list changes', () => {
  const f = fakeSpeech({ voices: [V('Fred', 'en-US', { uri: 'com.apple.speech.synthesis.voice.Fred' })] });
  assert.equal(f.api.voiceFor('en-US').name, 'Fred');
  f.ss.list = [...f.ss.list, V('Samantha (Enhanced)', 'en-US')]; f.fire('voiceschanged');
  assert.equal(f.api.voiceFor('en-US').name, 'Samantha (Enhanced)');
});

test('long text is spoken a sentence at a time, onend once at the end; a paused engine is resumed', () => {
  const f = fakeSpeech({ voices: LISTS.chromeOS, paused: true });
  const long = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i + 1}, and it is here to make the text long.`).join(' ');
  let ended = 0;
  assert.equal(f.api.speak(long, { lang: 'en-US', onend: () => ended++ }), true);
  assert.ok(f.log.some(l => l[0] === 'resume'));
  const parts = f.spoken();
  assert.ok(parts.length > 3, 'chunked');
  for (const p of parts) assert.ok(p.text.length <= 180, p.text.length);
  assert.equal(parts.map(p => p.text).join(' '), long);
  parts.forEach(p => p.onend());
  assert.equal(ended, 1);
  // A sentence with no punctuation or spaces (Chinese, Japanese) is cut into pieces too.
  assert.ok(f.api.chunks('字'.repeat(400)).every(c => c.length <= 180));
  f.api.stopSpeaking(); assert.deepEqual(f.log.at(-1), ['cancel']);
});

// ---- The games' standalone fallback (no SDK): the best voice, always set explicitly -------------------
for (const file of GAMES) {
  test(`${file}: standalone speech never lets the browser choose the voice`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const code = between(src, '/* voice-pick:start', '\nfunction say(');
    const run = voices => {
      const log = [], listeners = {}, timers = [];
      const ss = { list: voices, getVoices() { return this.list; }, speak(u) { log.push(u); }, cancel() {},
        addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); } };
      class Utter { constructor(text) { this.text = text; } }
      const win = { speechSynthesis: ss, SpeechSynthesisUtterance: Utter };
      const speakWith = new Function('window', 'SpeechSynthesisUtterance', 'setTimeout', code + '\nreturn speakWith;')(win, Utter, f => timers.push(f));
      return { speakWith, ss, log, fire: n => (listeners[n] || []).forEach(f => f()), runTimers: () => timers.splice(0).forEach(f => f()) };
    };
    // Voices listed: the best one (Google's online voices beat David on Windows Chrome).
    let f = run(LISTS.chromeWindows);
    assert.equal(f.speakWith('cat', 'en-US', 0.9, false), true);
    assert.equal(f.log[0].voice.name, 'Google US English'); assert.equal(f.log[0].rate, 0.9);
    assert.equal(f.speakWith('Bonjour', 'fr', 1, false), true);
    assert.equal(f.log[1].voice.name, 'Google français');
    assert.equal(f.speakWith('Shalom', 'he', 1, false), false);   // no Hebrew voice at all
    assert.equal(f.log.length, 2);
    // Voices not listed yet (Chrome on first load): wait for them, then speak with an explicit voice.
    f = run([]);
    assert.equal(f.speakWith('cat', 'en-US', 1, false), true);
    assert.equal(f.log.length, 0, 'no lang-only utterance');
    f.ss.list = LISTS.iosSafari; f.fire('voiceschanged'); f.runTimers();
    assert.equal(f.log.length, 1); assert.equal(f.log[0].voice.name, 'Samantha (Enhanced)');
    // The list arrives with no voice for the language, or never: say nothing.
    f = run([]); f.speakWith('Shalom', 'he', 1, false); f.ss.list = GOOGLE_NET; f.fire('voiceschanged');
    assert.equal(f.log.length, 0);
    f = run([]); f.speakWith('cat', 'en-US', 1, false); f.runTimers();
    assert.equal(f.log.length, 0);
  });
}

// ---- Old games that call speechSynthesis.speak themselves get the better voices too (owner, 29 Oct 2026) -------------
// The SDK wraps window.speechSynthesis.speak: a missing voice gets the best one, a robotic voice the game picked is
// upgraded when a clearly better voice exists for the same language, and a mild pitch shift goes back to 1.
const say = (f, text, set = {}) => { const u = new f.Utter(text); Object.assign(u, set); f.win.speechSynthesis.speak(u); return f.spoken().at(-1); };
const byName = (list, name) => { const v = list.find(x => x.name === name); assert.ok(v, name); return v; };

test('raw speechSynthesis.speak: an utterance with no voice gets the best voice for its language (or the game\'s)', () => {
  const f = fakeSpeech({ voices: LISTS.macSafari, user: { lang: 'en' } });
  let u = say(f, 'cat', { lang: 'en-US' });
  assert.equal(u.voice.name, 'Ava (Premium)'); assert.equal(u.lang, 'en-US');
  u = say(f, 'Bonjour', { lang: 'fr-FR' });
  assert.equal(u.voice.name, 'Thomas');
  u = say(f, 'hello');   // no lang: the game's language (BRB.user.lang)
  assert.equal(u.voice.name, 'Ava (Premium)'); assert.equal(u.lang, 'en-US');
  const g = fakeSpeech({ voices: LISTS.chromeWindows, user: { lang: 'fr' } });
  assert.equal(say(g, 'Bonjour').voice.name, 'Google français');
  // No voice for the language: left alone (the browser does what it always did).
  u = say(g, 'Shalom', { lang: 'he-IL' });
  assert.equal(u.voice, null); assert.equal(u.lang, 'he-IL');
  assert.equal(g.spoken().length, 2);
});

test('raw speechSynthesis.speak: robotic voices the game picked are upgraded only when a clearly better same-language voice exists', () => {
  // Firefox-style "Desktop" voice with Google US English (online) available: upgraded.
  const david = V('Microsoft David Desktop - English (United States)', 'en-US', { def: true });
  let f = fakeSpeech({ voices: [david, V('Microsoft Mark - English (United States)', 'en-US'), G('Google US English', 'en-US')] });
  assert.equal(say(f, 'cat', { voice: david, lang: 'en-US' }).voice.name, 'Google US English');
  // ...but only a plain local voice better than it: kept (not clearly better).
  f = fakeSpeech({ voices: LISTS.firefoxWindows });
  assert.equal(say(f, 'cat', { voice: LISTS.firefoxWindows[0], lang: 'en-US' }).voice.name, LISTS.firefoxWindows[0].name);
  // ...and no better voice at all for French: the Desktop voice stays.
  const hortense = byName(LISTS.firefoxWindows, 'Microsoft Hortense Desktop - French');
  assert.equal(say(f, 'chat', { voice: hortense, lang: 'fr-FR' }).voice, hortense);
  // Apple's Albert (the old first-match pick) with Samantha / Ava available.
  const albert = LISTS.macSafari[0];
  f = fakeSpeech({ voices: LISTS.macSafari });
  assert.equal(say(f, 'cat', { voice: albert }).voice.name, 'Ava (Premium)');
  f = fakeSpeech({ voices: [albert, apple('Samantha', 'en-US', 'compact', { def: true })] });
  assert.equal(say(f, 'cat', { voice: albert, lang: 'en-US' }).voice.name, 'Samantha');
  // eSpeak on Linux: Google's online voice instead.
  f = fakeSpeech({ voices: LISTS.linux });
  assert.equal(say(f, 'cat', { voice: LISTS.linux[0], lang: 'en-US' }).voice.name, 'Google US English');
  // eSpeak Spanish with no other Spanish voice than eSpeak: kept.
  const espEs = V('Spanish espeak-ng', 'es');
  f = fakeSpeech({ voices: [espEs, G('Google US English', 'en-US')] });
  assert.equal(say(f, 'gato', { voice: espEs }).voice, espEs);
  // Only robotic voices for the language: kept.
  f = fakeSpeech({ voices: [albert, LISTS.macSafari[1]] });
  assert.equal(say(f, 'cat', { voice: albert }).voice, albert);
});

test('raw speechSynthesis.speak: good voices and other-language voices the game picked are kept', () => {
  const f = fakeSpeech({ voices: LISTS.macSafari });
  const samantha = byName(LISTS.macSafari, 'Samantha'), daniel = byName(LISTS.macSafari, 'Daniel'), thomas = byName(LISTS.macSafari, 'Thomas');
  assert.equal(say(f, 'cat', { voice: daniel, lang: 'en-GB' }).voice, daniel);   // compact, but already the best British voice
  assert.equal(say(f, 'cat', { voice: samantha }).voice.name, 'Ava (Premium)');   // compact, and a Premium voice is there
  assert.equal(say(f, 'cat', { voice: thomas, lang: 'en-US' }).voice, thomas);   // a French voice for English text: deliberate
  // A novelty voice in another language than the utterance: never touched.
  const albert = LISTS.macSafari[0];
  assert.equal(say(f, 'Bonjour', { voice: albert, lang: 'fr-FR' }).voice, albert);
  const g = fakeSpeech({ voices: LISTS.edgeWindows });
  const aria = byName(LISTS.edgeWindows, 'Microsoft Aria Online (Natural) - English (United States)');
  assert.equal(say(g, 'cat', { voice: aria }).voice, aria);
  // A plain on-device voice is not penalised: the game's choice, even with a better online voice there.
  const zira = byName(LISTS.edgeWindows, 'Microsoft Zira - English (United States)');
  assert.equal(say(g, 'cat', { voice: zira, lang: 'en-US' }).voice, zira);
});

test('raw speechSynthesis.speak: mild pitch shifts go back to 1, strong ones and the rate are kept', () => {
  const f = fakeSpeech({ voices: LISTS.iosSafari });
  for (const [p, want] of [[1.1, 1], [1.15, 1], [0.9, 1], [0.85, 1], [1.25, 1], [1, 1], [1.6, 1.6], [0.5, 0.5], [2, 2], [0.8, 0.8], [1.3, 1.3]]) {
    const u = say(f, 'hi', { lang: 'en-US', pitch: p, rate: 0.7, volume: 0.4 });
    assert.equal(u.pitch, want, `pitch ${p}`); assert.equal(u.rate, 0.7); assert.equal(u.volume, 0.4);
  }
});

test('raw speechSynthesis.speak: no voices listed yet means it is spoken as it is, at once', () => {
  const f = fakeSpeech({ voices: [] });
  const u = say(f, 'hi', { lang: 'en-US' });
  assert.equal(f.spoken().length, 1); assert.equal(u.voice, null); assert.equal(u.lang, 'en-US');
  f.ss.list = LISTS.iosSafari; f.fire('voiceschanged');
  assert.equal(say(f, 'hi', { lang: 'en-US' }).voice.name, 'Samantha (Enhanced)');
});

test('BRB.speak utterances pass through the wrapper untouched; the wrapper is installed once; no speech = no errors', () => {
  const f = fakeSpeech({ voices: LISTS.macSafari });
  const before = f.win.speechSynthesis.speak;
  assert.equal(before.__brbUpgrade, true);
  // BRB.speak chose Thomas at pitch 1.1 for French text: the wrapper must not change it.
  assert.equal(f.api.speak('Bonjour', { pitch: 1.1 }), true);
  let u = f.spoken().at(-1); assert.equal(u.voice.name, 'Thomas'); assert.equal(u.pitch, 1.1);
  // An explicit lang voice from BRB.speak with a penalised-only language list is kept as well.
  const g = fakeSpeech({ voices: [LISTS.macSafari[0], LISTS.macSafari[1]] });
  g.api.speak('cat', { lang: 'en-US', pitch: 0.9 }); u = g.spoken().at(-1); assert.equal(u.voice.name, 'Albert'); assert.equal(u.pitch, 0.9);
  // The SDK running a second time on the same window does not wrap again.
  fakeSpeech({ voices: LISTS.macSafari, win: f.win });
  assert.equal(f.win.speechSynthesis.speak, before);
  const n = f.spoken().length; say(f, 'once', { lang: 'en-US' }); assert.equal(f.spoken().length, n + 1);
  // The browser's speak still gets the right `this` and its return value.
  assert.equal(f.log.at(-1)[1].text, 'once');
  // No speechSynthesis at all: nothing is created, nothing throws.
  const h = fakeSpeech({ synth: false });
  assert.equal('speechSynthesis' in h.win, false);
  assert.equal(h.api.speak('hi'), false);
  // A non-utterance is handed to the browser unchanged (it throws its own TypeError, as before).
  const k = fakeSpeech({ voices: LISTS.macSafari }); const odd = { text: 'x', pitch: 1.1 };
  k.win.speechSynthesis.speak(odd); assert.equal(odd.pitch, 1.1); assert.equal('voice' in odd, false);
});
