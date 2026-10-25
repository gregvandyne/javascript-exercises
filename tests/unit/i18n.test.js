// i18n: message format, t() fallback, plurals, locale negotiation, cookie precedence (HTTP), the locale-file guard
// for translators, Intl formatting, and the Builder's language block.
import './_setup.js';
process.env.BRB_ALL_LOCALES = '1';   // these tests negotiate every locale; the readiness rule has its own test below
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { format, parse, placeholders, placeholderInfo } = await import('../../public/js/i18n-format.js');
const i18n = await import('../../server/i18n/index.js');
const { checkAll, checkLocale, loadLocale } = await import('../../server/i18n/check.js');
const { createApp } = await import('../../server/app.js');
const auth = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const { languageBlock, SYSTEM_PROMPT } = await import('../../server/builder/prompt.js');
const { refusal } = await import('../../server/builder/screen.js');

/** A temporary locales folder: the real en.json plus the given stub files. Call i18n.reload() afterwards. */
function withStubs(stubs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-i18n-'));
  fs.copyFileSync(path.join(i18n.LOCALES_DIR, 'en.json'), path.join(dir, 'en.json'));
  for (const [code, obj] of Object.entries(stubs)) fs.writeFileSync(path.join(dir, `${code}.json`), JSON.stringify(obj));
  i18n.reload(dir);
  return dir;
}

test('format: placeholders, missing values, numbers in the locale', () => {
  assert.equal(format('Hi {name}!', { name: 'Zip' }), 'Hi Zip!');
  assert.equal(format('Hi {name}!', {}), 'Hi {name}!', 'a missing value stays visible');
  assert.equal(format('{n} plays', { n: 12345 }, 'en-US'), '12,345 plays');
  assert.equal(format('{n} plays', { n: 12345 }, 'de'), '12.345 plays');
  assert.equal(format('{n}', { n: 7 }, 'ar-u-nu-latn'), '7', 'Arabic keeps Western digits');
  assert.equal(format('plain text, no braces'), 'plain text, no braces');
});

test('format: ICU plurals per language, exact matches, # and select', () => {
  const msg = '{count, plural, =0 {no games} one {# game} other {# games}}';
  assert.equal(format(msg, { count: 0 }), 'no games');
  assert.equal(format(msg, { count: 1 }), '1 game');
  assert.equal(format(msg, { count: 1200 }), '1,200 games');
  const ru = '{count, plural, one {# игра} few {# игры} many {# игр} other {# игры}}';
  assert.equal(format(ru, { count: 1 }, 'ru'), '1 игра');
  assert.equal(format(ru, { count: 3 }, 'ru'), '3 игры');
  assert.equal(format(ru, { count: 5 }, 'ru'), '5 игр');
  const ar = '{count, plural, zero {لا شيء} one {واحد} two {اثنان} few {# قليل} many {# كثير} other {# آخر}}';
  assert.equal(format(ar, { count: 2 }, 'ar-u-nu-latn'), 'اثنان');
  assert.equal(format(ar, { count: 4 }, 'ar-u-nu-latn'), '4 قليل');
  assert.equal(format(ar, { count: 11 }, 'ar-u-nu-latn'), '11 كثير');
  assert.equal(format('{count, plural, other {#本}}', { count: 3 }, 'ja'), '3本');
  assert.equal(format('{kind, select, game {a game} other {a thing}}', { kind: 'game' }), 'a game');
  assert.equal(format('{count, plural, one {{n} play} other {{n} plays}}', { count: 1500, n: '1.5K' }), '1.5K plays', 'nested placeholder inside a form');
});

test('parse rejects broken messages; placeholderInfo knows what a translation must keep', () => {
  assert.throws(() => parse('Hi {name'));
  assert.throws(() => parse('Hi name}'));
  assert.throws(() => parse('{count, plural, one {x}}'), /other/);
  assert.deepEqual(placeholders('{a} and {count, plural, one {# {b}} other {# {b}s}}'), ['a', 'b', 'count']);
  assert.deepEqual(placeholderInfo('{count, plural, one {# game} other {# games}}'), { required: ['count'], optional: [] });
  assert.deepEqual(placeholderInfo('{count, plural, one {play} other {plays}}'), { required: [], optional: ['count'] }, 'a plural-only selector may be dropped');
});

test('t(): locale value, English fallback for missing keys and locales, key for unknown keys', () => {
  withStubs({ fr: { home: { hero: { play: 'Jouer' } }, layout: { titleWith: '{title} · Magic Cups' } }, 'en-GB': {} });
  try {
    const fr = i18n.makeT('fr');
    assert.equal(fr('home.hero.play'), 'Jouer');
    assert.equal(fr('home.hero.more'), 'More info', 'missing in fr -> English');
    assert.equal(fr('layout.titleWith', { title: 'Shark Plank' }), 'Shark Plank · Magic Cups');
    assert.equal(fr('no.such.key'), 'no.such.key');
    assert.equal(i18n.makeT('en-GB')('nav.home'), 'Home', 'en-GB falls back to en');
    assert.equal(i18n.makeT('xx')('nav.home'), 'Home', 'unknown locale -> English');
    assert.equal(fr.locale, 'fr'); assert.equal(i18n.makeT('ar').dir, 'rtl'); assert.equal(i18n.makeT('he').dir, 'rtl'); assert.equal(fr.dir, 'ltr');
    assert.equal(fr.has('home.hero.play'), true); assert.equal(fr.has('no.such.key'), false);
    const strings = i18n.clientStrings('fr', ['home.hero']);
    assert.equal(strings['home.hero.play'], 'Jouer'); assert.equal(strings['home.hero.more'], 'More info');
    assert.ok(!('nav.home' in strings), 'only the asked-for prefixes are embedded');
  } finally { i18n.reload(); }
});

test('LOCALES: the 13 site languages in picker order, native names, rtl for he and ar', () => {
  assert.deepEqual(i18n.CODES, ['en', 'en-GB', 'pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']);
  assert.deepEqual(i18n.LOCALES.filter(l => l.dir === 'rtl').map(l => l.code), ['he', 'ar']);
  assert.equal(i18n.localeInfo('ja').name, '日本語'); assert.equal(i18n.localeInfo('zh-Hant').name, '繁體中文');
  assert.equal(i18n.normalizeCode('ZH-hant'), 'zh-Hant'); assert.equal(i18n.normalizeCode('en-gb'), 'en-GB'); assert.equal(i18n.normalizeCode('klingon'), null);
});

test('Accept-Language negotiation', () => {
  const n = i18n.negotiate;
  assert.equal(n('fr-CA,fr;q=0.9,en;q=0.8'), 'fr');
  assert.equal(n('de;q=0.5, it;q=0.9'), 'it', 'highest q wins');
  assert.equal(n('en-US,en;q=0.9'), 'en');
  assert.equal(n('en-AU'), 'en-GB'); assert.equal(n('en-GB'), 'en-GB'); assert.equal(n('en-IN'), 'en-GB');
  assert.equal(n('zh-TW'), 'zh-Hant'); assert.equal(n('zh-Hant-HK'), 'zh-Hant');
  assert.equal(n('zh-CN,ja;q=0.5'), 'ja', 'Simplified Chinese is not offered: the next language is used');
  assert.equal(n('pt-PT'), 'pt'); assert.equal(n('iw'), 'he'); assert.equal(n('ar-EG'), 'ar');
  assert.equal(n('*'), null); assert.equal(n('xx-YY'), null); assert.equal(n(''), null); assert.equal(n('fr;q=0'), null);
});

test('pickLocale: ?lang= then cookie then saved choice then Accept-Language then English', () => {
  const p = i18n.pickLocale;
  const all = { query: 'ja', cookie: 'fr', user: { lang: 'de' }, acceptLanguage: 'es' };
  assert.deepEqual(p(all), { locale: 'ja', source: 'query' });
  assert.deepEqual(p({ ...all, query: null }), { locale: 'fr', source: 'cookie' });
  assert.deepEqual(p({ ...all, query: 'nope', cookie: null }), { locale: 'de', source: 'user' });
  assert.deepEqual(p({ ...all, query: null, cookie: 'bad', user: { lang: '' } }), { locale: 'es', source: 'header' });
  assert.deepEqual(p({}), { locale: 'en', source: 'default' });
});

async function server() {
  const app = createApp();
  const srv = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, close: () => new Promise(r => srv.close(r)), get: (p, headers = {}) => fetch(base + p, { headers, redirect: 'manual' }) };
}
const htmlTag = async res => (await res.text()).match(/<html[^>]*>/)[0];

test('HTTP: <html lang dir>, cookie beats Accept-Language, ?lang= stores the choice and redirects', async () => {
  const s = await server();
  try {
    assert.equal(await htmlTag(await s.get('/')), '<html lang="en" dir="ltr">');
    assert.equal(await htmlTag(await s.get('/', { 'Accept-Language': 'ar,en;q=0.5' })), '<html lang="ar" dir="rtl">');
    assert.equal(await htmlTag(await s.get('/', { 'Accept-Language': 'ar', Cookie: 'lang=ja' })), '<html lang="ja" dir="ltr">', 'cookie beats the header');
    const r = await s.get('/search?q=shark&lang=he');
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), '/search?q=shark', 'redirects to the same page without ?lang');
    assert.match(r.headers.get('set-cookie'), /lang=he; Path=\/; Max-Age=31536000; SameSite=Lax/);
    const page = await s.get('/', { Cookie: 'lang=he' });
    assert.match(page.headers.get('vary'), /Accept-Language/); assert.match(page.headers.get('vary'), /Cookie/);
    assert.equal(page.headers.get('content-language'), 'he');
    const body = await page.text();
    assert.match(body, /<script type="application\/json" id="i18n">\{"lang":"he","dir":"rtl"/, 'client strings embedded as JSON, not as a script');
    assert.match(body, /class="langpick"/); assert.match(body, /hreflang="ar"/); assert.match(body, /aria-current="true"><span class="lang-check" aria-hidden="true">✓<\/span><span class="lang-name" lang="he" dir="rtl">עברית/);
    // API calls are never redirected, and get errors in the reader's language (English fallback here)
    const api = await s.get('/api/nope?lang=fr');
    assert.equal(api.status, 404);
  } finally { await s.close(); }
});

test('HTTP: a signed-in player\'s saved language is used, and choosing one saves it to the account', async () => {
  const s = await server();
  try {
    const u = auth.createUser({ username: 'LangKid' + Math.floor(Math.random() * 1e4), password: 'secret123' });
    const res = await fetch(s.base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u.username, password: 'secret123' }) });
    const session = res.headers.get('set-cookie').split(';')[0];
    assert.equal(await htmlTag(await s.get('/', { Cookie: session, 'Accept-Language': 'de' })), '<html lang="de" dir="ltr">', 'no choice yet: header');
    const pick = await s.get('/me?lang=ar', { Cookie: session });
    assert.equal(pick.status, 303); assert.equal(pick.headers.get('location'), '/me');
    assert.equal(q.get('SELECT lang FROM users WHERE id=?', u.id).lang, 'ar', 'saved on the account');
    assert.equal(await htmlTag(await s.get('/', { Cookie: session, 'Accept-Language': 'de' })), '<html lang="ar" dir="rtl">', 'saved choice beats the header on another device');
    assert.equal(await htmlTag(await s.get('/', { Cookie: `${session}; lang=fr` })), '<html lang="fr" dir="ltr">', 'the cookie beats the saved choice');
    const me = await (await s.get('/me', { Cookie: session })).text();
    assert.match(me, /<select class="input langselect" id="lang-select" name="lang">/, 'the Me page has the same choice');
  } finally { await s.close(); }
});

test('locale files: every key exists in en.json, placeholders match, notes and code keys are valid', () => {
  const r = checkAll();
  assert.ok(Object.keys(r.en).length > 500, 'en.json has the site strings');
  assert.deepEqual(r.enErrors, [], 'en.json messages parse');
  for (const l of r.locales) {
    assert.deepEqual(l.extra, [], `${l.code}.json has keys that en.json does not`);
    assert.deepEqual(l.parseErrors, [], `${l.code}.json has broken messages`);
    assert.deepEqual(l.placeholderErrors, [], `${l.code}.json placeholders differ from English`);
  }
  assert.deepEqual(r.unknownInCode, [], 'code uses keys missing from en.json');
  assert.deepEqual(r.clientScope, [], 'browser modules only use keys their page embeds');
  assert.deepEqual(r.badNotes, [], 'notes.json only has notes for real keys');
});

test('the locale-file guard catches what translators can get wrong', () => {
  const en = loadLocale('en');
  const r = checkLocale('fr', en, {
    'nav.home': 'Accueil',
    'nav.nope': 'x',
    'layout.meLabel': 'Moi : {nom}',
    'cards.plays': '{count, plural, one {{n} partie} other {{n} parties}}',
    'game.stats.plays': 'parties',
    'search.gameCount': 'jeux',
    'home.hero.about': 'À propos de {title',
  });
  assert.deepEqual(r.extra, ['nav.nope']);
  assert.equal(r.parseErrors.length, 1);
  assert.ok(r.placeholderErrors.some(e => e.startsWith('layout.meLabel: unknown placeholder {nom}')));
  assert.ok(r.placeholderErrors.some(e => e.startsWith('layout.meLabel: missing placeholder {name}')));
  assert.ok(r.placeholderErrors.some(e => e.startsWith('search.gameCount: missing placeholder {count}')), 'the number a reader sees must stay');
  assert.ok(!r.placeholderErrors.some(e => e.startsWith('game.stats.plays')), 'a plural-only selector may be dropped');
  assert.ok(!r.placeholderErrors.some(e => e.startsWith('cards.plays')));
});

test('fmt: Intl numbers, money, dates and time-ago per locale', () => {
  assert.equal(i18n.fmt('de').int(1234), '1.234');
  assert.equal(i18n.fmt('en').int(1234), '1,234');
  assert.equal(i18n.fmt('en').num(1234), '1.2K');
  assert.equal(i18n.fmt('ar').int(1234), '1,234', 'Western digits for Arabic');
  assert.match(i18n.fmt('fr').money(1250), /12,50\s?\$/);
  assert.equal(i18n.fmt('en').money(1250), '$12.50');
  assert.equal(i18n.fmt('en').ago(Date.now() - 5000), 'just now');
  assert.equal(i18n.fmt('en').ago(Date.now() - 5 * 60e3), '5 minutes ago');
  assert.match(i18n.fmt('es').ago(Date.now() - 2 * 3600e3), /hace 2 horas/);
  assert.match(i18n.fmt('ja').date(Date.UTC(2026, 9, 24)), /2026/);
  // stored calendar days (00:00 UTC) print as that date whatever zone the server runs in
  assert.equal(i18n.fmt('en').day(Date.UTC(2026, 0, 10)), 'Jan 10, 2026');
  assert.equal(i18n.fmt('en').day(Date.UTC(2026, 0, 10, 23, 59, 59)), 'Jan 10, 2026');
  assert.equal(i18n.fmt('en').day(Date.UTC(2026, 0, 10), { month: 'short', day: 'numeric' }), 'Jan 10');
  assert.equal(i18n.fmt('de').day(Date.UTC(2026, 0, 10)), '10. Jan. 2026');
});

test('Builder: the system prompt asks for the builder\'s language; refusals come from the locale files', () => {
  assert.match(SYSTEM_PROMPT, /# Language/);
  assert.match(SYSTEM_PROMPT, /plain,\s+everyday words a 7-year-old can read/);
  assert.match(SYSTEM_PROMPT, /Words inside the game/);
  assert.match(languageBlock('fr'), /LANGUAGE: French \[fr\]/);
  assert.match(languageBlock('ar'), /Arabic.*\[ar\]\. It is written right to left/);
  assert.match(languageBlock('pt'), /Brazilian Portuguese/);
  assert.match(languageBlock('nope'), /\[en\]/);
  withStubs({ fr: { builder: { refusals: { scary: { message: 'Pas de peur ici.' }, chips: { scary: { a: '👻 Un fantôme gentil' } } } } } });
  try {
    const r = refusal('scary', 'prefilter', i18n.makeT('fr'));
    assert.equal(r.message, 'Pas de peur ici.');
    assert.equal(r.suggestion, 'How about a silly, friendly ghost who collects candy?', 'untranslated parts fall back to English');
    assert.deepEqual(r.chips, ['👻 Un fantôme gentil', '🎃 A pumpkin catch game', '🦇 A sleepy bat']);
    assert.deepEqual(refusal('selfharm', 'x').chips, [], 'no game chips after a self-harm message');
  } finally { i18n.reload(); }
});

test('only finished translations are offered (picker and Accept-Language)', () => {
  const saved = process.env.BRB_ALL_LOCALES;
  try {
    delete process.env.BRB_ALL_LOCALES;
    const en = i18n.dictionary('en'); const total = Object.keys(en).length;
    for (const code of i18n.availableCodes()) {
      if (code === 'en') continue;
      const n = Object.keys(i18n.dictionary(code)).length;
      assert.ok(code === 'en-GB' ? n > 0 : n / total >= i18n.READY_SHARE, `${code} offered with ${n}/${total} keys`);
    }
    assert.ok(i18n.availableCodes().includes('en'));
    for (const code of i18n.CODES.filter(c => !i18n.availableCodes().includes(c)))
      assert.equal(i18n.pickLocale({ acceptLanguage: code }).locale, 'en', `${code} is not ready, so the browser language falls back to English`);
    process.env.BRB_ALL_LOCALES = '1';
    assert.equal(i18n.availableCodes().length, i18n.CODES.length);
  } finally { if (saved === undefined) delete process.env.BRB_ALL_LOCALES; else process.env.BRB_ALL_LOCALES = saved; }
});
