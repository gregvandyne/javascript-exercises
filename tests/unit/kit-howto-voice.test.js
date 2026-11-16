// The how-to card (kit 1.1.6; docs/decisions.md "How-to cards: read aloud only on a tap, with the AI voice"), in the
// production frame (frameDocument, the frame's CSP, the sandbox) on a stand-in for the play page:
//   - it never speaks by itself: nothing reaches the AI voice or the device's voice when it opens;
//   - its speaker button shows only when the platform says the AI voice reads every line (BRB.aiVoiceCheck), reads the
//     title and the cards through the AI path when tapped (tap again: stop), and hides when a line is refused, never
//     falling back to the device's voice;
//   - games pinned to older kits (which read the cards by themselves) are kept quiet by the SDK;
//   - the six official games with how-to cards show them in the player's language (es, ja, ar).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const { silentMp3 } = await import('../../server/services/tts.js');
const K = await import('../../server/services/kit.js');
const { chromeStrings } = await import('../../kit/src/strings.js');
const KIT = chromeStrings();

const HOST = 'http://game.invalid';
const MP3 = silentMp3(48).toString('base64');
// Every frame: what reaches the device's speech (the SDK's own speak and its wrapper both end in the prototype's).
const DEVICE_SPY = '(() => { try { const P = window.SpeechSynthesis && SpeechSynthesis.prototype; if (!P) return; const o = P.speak; window.__device = []; P.speak = function (u) { if (u && String(u.text).trim()) window.__device.push(u.text); return o.call(this, u); }; } catch (e) {} })();';
let browser;
test.after(async () => { if (browser) await browser.close(); });

/** A game in the frame. reply: 'none' (the page never answers), 'ok' (yes to checks, a silent MP3 for reads) or 'no';
 *  denySpeak: lines refused when read (the check still says yes). */
async function open(html, { lang = 'en', tts = null, reply = 'none', denySpeak = [] } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript(DEVICE_SPY);
  const doc = frameDocument(html, { user: { displayName: 'T', avatar: 'x', lang, dir: ['ar', 'he'].includes(lang) ? 'rtl' : 'ltr' }, game: { id: 'g', title: 'G' }, save: {}, canSave: false, ...(tts ? { tts } : {}) });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>window.__tts = []; const REPLY = ${JSON.stringify(reply)}, DENY = ${JSON.stringify(denySpeak)}, MP3 = Uint8Array.from(atob('${MP3}'), c => c.charCodeAt(0));
addEventListener('message', e => { const m = e.data; if (!m || m.brb !== 1 || m.type !== 'brb:tts') return;
  window.__tts.push({ text: m.text, lang: m.lang, check: !!m.check, pre: !!m.pre }); if (REPLY === 'none' || m.pre) return;
  const ok = REPLY === 'ok' && !(m.check ? [] : DENY).includes(m.text);
  if (m.check) return e.source.postMessage({ brb: 1, type: 'brb:tts', id: m.id, ok, check: true }, '*');
  if (ok) { const buf = MP3.slice().buffer; e.source.postMessage({ brb: 1, type: 'brb:tts', id: m.id, ok: true, buf }, '*', [buf]); }
  else e.source.postMessage({ brb: 1, type: 'brb:tts', id: m.id, ok: false }, '*'); });</script>`;
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    return route.abort();
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  // through the title to the how-to card
  await frame.waitForFunction(() => document.querySelector('.ok-title-screen .ok-hot'), null, { timeout: 60_000 });
  await frame.click('.ok-title-screen .ok-hot');
  await frame.waitForFunction(() => document.querySelector('.ok-howto'), null, { timeout: 20_000 });
  const card = () => frame.evaluate(() => { const m = document.querySelector('.ok-howto'), b = m && m.querySelector('.ok-speak'); return m && { title: m.querySelector('h2').textContent, cards: [...m.querySelectorAll('.ok-howcard')].map(x => x.textContent), button: !!b, shown: !!b && !b.hidden && !b.disabled && b.offsetWidth > 0, label: b && b.getAttribute('aria-label'), pressed: b && b.getAttribute('aria-pressed') }; });
  const asked = () => p.evaluate(() => window.__tts);
  const device = () => frame.evaluate(() => window.__device || []);
  return { ctx, p, frame, card, asked, device, errors, wait: ms => p.waitForTimeout(ms) };
}
const GAME = (v = K.KIT_LATEST) => `<title>Old</title><div id="game"></div>\n${K.kitTag(v)}\n<script>
Oomba.game({ api: 1, title: 'How-to test', controls: 'none', strings: { en: { a: 'Tap the thing', b: 'Jump up high' }, es: { a: 'Toca la cosa', b: 'Salta muy alto' } },
  howTo: [{ icon: 'tap', text: 'a' }, { icon: 'jump', text: 'b' }], level: Oomba.level.grid(['          ', '  P    G  ', '##########']) });
</script>`;
const ES = ['Cómo se juega', 'Toca la cosa', 'Salta muy alto'];

test('the how-to card never speaks by itself, and its speaker button shows only with an AI voice for every line', { skip, timeout: 120_000 }, async () => {
  for (const [name, o, shown] of [
    ['no AI voices for this game (no INIT.tts)', { reply: 'ok' }, false],
    ['AI voices, but not for this language', { tts: { langs: ['en'] }, reply: 'ok' }, false],
    ['the server refuses the lines', { tts: { langs: ['en', 'es'] }, reply: 'no' }, false],
    ['the play page never answers', { tts: { langs: ['en', 'es'] }, reply: 'none' }, false],
    ['every line gets the AI voice', { tts: { langs: ['en', 'es'] }, reply: 'ok' }, true],
  ]) {
    const g = await open(GAME(), { lang: 'es', ...o });
    try {
      await g.wait(4600);   // past the SDK's 4 s wait for an answer
      const c = await g.card();
      assert.deepEqual([c.title, ...c.cards], ES, name);
      assert.equal(c.button, true, name); assert.equal(c.shown, shown, `${name}: the button ${shown ? 'shows' : 'stays hidden'}`);
      assert.equal(c.label, 'Léemelo'); assert.equal(c.pressed, 'false');
      const asked = await g.asked();
      assert.deepEqual(asked.filter(x => !x.check), [], `${name}: nothing is read when the card opens`);
      assert.deepEqual(asked.filter(x => x.check).map(x => x.text), o.tts && o.tts.langs.includes('es') ? ES : [], `${name}: only the checks`);
      assert.deepEqual(await g.device(), [], `${name}: never the device's voice`);
      assert.deepEqual(g.errors, []);
    } finally { await g.ctx.close(); }
  }
});

test('a tap reads the title and the cards with the AI voice only; a second tap stops; a refused line hides the button', { skip, timeout: 120_000 }, async () => {
  const g = await open(GAME(), { lang: 'es', tts: { langs: ['en', 'es'] }, reply: 'ok' });
  try {
    await g.frame.waitForFunction(() => { const b = document.querySelector('.ok-speak'); return b && !b.hidden; });
    await g.frame.click('.ok-speak');
    let c = await g.card();
    assert.deepEqual([c.pressed, c.label], ['true', 'Dejar de leer'], 'reading: pressed, and the label says how to stop');
    await g.frame.waitForFunction(() => document.querySelector('.ok-speak').getAttribute('aria-pressed') === 'false', null, { timeout: 15_000 });
    assert.deepEqual((await g.asked()).filter(x => !x.check).map(x => [x.text, x.lang]), ES.map(t => [t, 'es']), 'each line through the AI path, in order');
    assert.equal((await g.card()).shown, true, 'still there for another listen');
    // tap, tap: stopped at once
    await g.frame.click('.ok-speak'); await g.frame.click('.ok-speak');
    c = await g.card(); assert.deepEqual([c.pressed, c.label, c.shown], ['false', 'Léemelo', true]);
    // closing the card stops the reading too
    await g.frame.click('.ok-speak'); await g.frame.click('.ok-howto .ok-hot');
    assert.equal(await g.frame.evaluate(() => !!document.querySelector('.ok-howto')), false);
    assert.deepEqual(await g.device(), [], 'never the device\'s voice');
  } finally { await g.ctx.close(); }
  // the check said yes, but a line is refused when it is read: the reading stops and the button goes, with no device voice
  const r = await open(GAME(), { lang: 'es', tts: { langs: ['en', 'es'] }, reply: 'ok', denySpeak: ['Salta muy alto'] });
  try {
    await r.frame.waitForFunction(() => { const b = document.querySelector('.ok-speak'); return b && !b.hidden; });
    await r.frame.click('.ok-speak');
    await r.frame.waitForFunction(() => document.querySelector('.ok-speak').hidden, null, { timeout: 15_000 });
    assert.equal((await r.card()).shown, false);
    assert.deepEqual(await r.device(), []);
  } finally { await r.ctx.close(); }
});

test('games pinned to older kits: the SDK drops their automatic how-to read (AI voice and device voice alike)', { skip, timeout: 120_000 }, async () => {
  for (const v of ['1.0.0', '1.1.2']) {
    assert.ok(!K.KIT_PATCHES[v] || !K.KIT_PATCHES[v].startsWith('1.1.6'), `${v} is not served on 1.1.6`);
    for (const reply of ['ok', 'no']) {
      const g = await open(GAME(v), { lang: 'es', tts: { langs: ['en', 'es'] }, reply });
      try {
        await g.wait(5000);
        const c = await g.card();
        assert.deepEqual(c.cards, ES.slice(1)); assert.equal(c.button, false, 'no speaker button before 1.1.6');
        assert.deepEqual(await g.asked(), [], `${v}: nothing asked of the AI voice`);
        assert.deepEqual(await g.device(), [], `${v}: nothing for the device's voice`);
      } finally { await g.ctx.close(); }
    }
  }
  // 1.1.3, 1.1.4 and 1.1.5 are served on 1.1.6 (KIT_PATCHES), so their games get the button
  for (const v of ['1.1.3', '1.1.4', '1.1.5']) assert.equal(K.KIT_PATCHES[v], '1.1.6');
});

// ---- the six official games with how-to cards, in the player's language ----
const block = (html, a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const i18nOf = slug => { const html = fs.readFileSync(path.join(ROOT, 'seed-games', slug + '.html'), 'utf8'); const box = {}; vm.runInNewContext(block(html, '// ==== I18N START ====', '// ==== I18N END ====') + '\nthis.I18N = I18N;', box); return box.I18N; };
const EXPECT = {
  'fraction-factory': l => ['how.cut', 'how.fill', 'how.serve'].map(k => i18nOf('fraction-factory')[l][k]),
  'escape-the-post-office': l => ['how.locks', 'how.stamps', 'how.retry'].map(k => i18nOf('escape-the-post-office')[l][k]),
  'trick-inbox': l => ['how.clues', 'how.choose', 'how.adult'].map(k => i18nOf('trick-inbox')[l][k]),
  sudoku: l => ['how1', 'how2', 'how3'].map(k => i18nOf('sudoku')[l][k]),
  'sum-spotter': l => ['how1', 'how2', 'how3'].map(k => i18nOf('sum-spotter')[l][k]),
  'packet-post': l => { const s = JSON.parse(fs.readFileSync(path.join(ROOT, `scripts/data/cs-quest/packet-post/${l}.json`), 'utf8')).strings; return ['Tap a road for each packet', 'Rebuild the picture by number', 'Keep secrets sealed'].map(k => s[k]); },
};
for (const slug of Object.keys(EXPECT)) {
  test(`${slug}: the how-to cards come up in Spanish, Japanese and Arabic`, { skip, timeout: 180_000 }, async () => {
    const html = fs.readFileSync(path.join(ROOT, 'seed-games', slug + '.html'), 'utf8');
    assert.equal(K.kitVersion(html), K.KIT_LATEST);
    for (const lang of ['es', 'ja', 'ar']) {
      const want = EXPECT[slug](lang);
      assert.equal(want.length, 3); for (const w of want) assert.ok(typeof w === 'string' && w.trim(), `${lang}: a translation`);
      const g = await open(html, { lang });
      try {
        await g.wait(400);
        const c = await g.card();
        assert.equal(c.title, KIT[lang].howTo, `${lang}: the kit's title`);
        assert.deepEqual(c.cards, want, `${lang}: the game's own cards in ${lang}`);
        const en = slug === 'packet-post' ? ['Tap a road for each packet', 'Rebuild the picture by number', 'Keep secrets sealed'] : EXPECT[slug]('en');
        c.cards.forEach((t, i) => assert.notEqual(t, en[i], `${lang}: card ${i + 1} is not the English`));
        assert.deepEqual((await g.asked()).filter(x => !x.check), [], 'nothing read by itself');
      } finally { await g.ctx.close(); }
    }
  });
}

test('kit source: the game flow never says the how-to cards; the button asks aiCheck and reads with aiRead (ai: only)', () => {
  const game = fs.readFileSync(path.join(ROOT, 'kit/src/game.js'), 'utf8'), screens = fs.readFileSync(path.join(ROOT, 'kit/src/screens.js'), 'utf8'), audio = fs.readFileSync(path.join(ROOT, 'kit/src/audio.js'), 'utf8');
  const flow = game.slice(game.indexOf('async _title('), game.indexOf('async _play('));
  assert.ok(flow.includes('kit.screens.howTo(cards)')); assert.doesNotMatch(flow, /kit\.say\(/, 'no automatic say around the how-to card');
  const how = screens.slice(screens.indexOf('    howTo(cards = [])'), screens.indexOf('    countdown(n = 3)'));
  assert.doesNotMatch(how, /\bsay\(|announce\(/, 'the card itself says nothing');
  assert.match(screens, /A\.aiCheck\(lines, lang\)/); assert.match(screens, /A\.aiRead\(lines, \{/);
  assert.match(audio, /ai: 'only'/); assert.doesNotMatch(audio.slice(audio.indexOf('  aiRead(')), /speechSynthesis/);
});

test('Fraction Factory, Escape the Post Office and Trick Inbox: how-to keys in every site language, voiced in each', async () => {
  const lines = await import('../../server/services/tts-lines.js');
  const { LANGS } = await import('../../kit/src/strings.js');
  const KEYS = { 'fraction-factory': ['how.cut', 'how.fill', 'how.serve'], 'escape-the-post-office': ['how.locks', 'how.stamps', 'how.retry'], 'trick-inbox': ['how.clues', 'how.choose', 'how.adult'] };
  for (const [slug, keys] of Object.entries(KEYS)) {
    const html = fs.readFileSync(path.join(ROOT, 'seed-games', slug + '.html'), 'utf8'), I = i18nOf(slug);
    for (const k of keys) assert.ok(html.includes(`text: '${k}' }`), `${slug}: the card ${k} is a key`);
    assert.match(html, /\n {2}strings: window\.\w+I18n,/, `${slug}: the table is the game's strings`);
    for (const l of LANGS.filter(x => x !== 'en-GB')) {
      for (const k of keys) {
        const t = I[l] && I[l][k];
        assert.ok(typeof t === 'string' && t.trim(), `${slug} ${l}.${k}`);
        assert.doesNotMatch(t, /[–—]/, `${slug} ${l}.${k}: no dashes`);
        if (l !== 'en') assert.notEqual(t, I.en[k], `${slug} ${l}.${k}: translated`);
        assert.ok(lines.allowedLine(slug, l, t), `${slug} ${l}.${k}: an AI-voice line in ${l}`);
      }
    }
    assert.match(I.ar[keys[0]], /[؀-ۿ]/); assert.match(I.he[keys[0]], /[֐-׿]/); assert.match(I.ja[keys[0]], /[぀-ヿ一-鿿]/); assert.match(I.ru[keys[0]], /[Ѐ-ӿ]/);
  }
});
