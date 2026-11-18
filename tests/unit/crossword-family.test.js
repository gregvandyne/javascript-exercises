// Crossword for a family grown-up (docs/decisions.md "Crossword: a parent sees only what works for them"): the fence
// (routes/family.js) keeps AI clues, reading a PDF or Word file, saving a set and looking up a class code to school
// accounts, so the frame says so (routes/games.js: no `clues`, `setSave: false`, `setFind: false`, from the same
// allowlist through fenceLets) and the game hides those buttons. A teacher keeps every one of them. Typing or pasting
// words, a .txt or .csv list, playing and printing the puzzle stay for the parent.
// The browser part needs a local Chromium; it is skipped when there is none. CW_SHOTS=<dir> saves screenshots.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, publish, official, teacher, kid, mum, auth, config } from './_live.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f) && fs.statSync(f).isFile());
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const { frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { grownupMay, fenceLets } = await import('../../server/routes/family.js');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/crossword.html'), 'utf8');
const cw = publish(official, HTML, { source: 'seed', slug: 'crossword', title: 'Crossword' });

/** The frame document a viewer gets for the Crossword, and its init. */
async function frameFor(u) {
  const page = await call('/play/crossword', { user: u });
  assert.equal(page.status, 200, page.text.slice(0, 200));
  const src = /data-src="(\/frame\/[^"]+?)"/.exec(page.text)[1].replace(/&amp;/g, '&');
  const fr = await call(src, { user: u });
  assert.equal(fr.status, 200);
  return { doc: fr.text, init: JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(fr.text)[1]) };
}
const withAi = async fn => { const was = config.anthropicKey; config.anthropicKey = 'test-key'; try { return await fn(); } finally { config.anthropicKey = was; } };

test('the fence decides: a grown-up may print and save their game, not ask for AI clues, read a document, save a set or look up a code', () => {
  assert.equal(grownupMay('POST', `/api/games/${cw.id}/print`), true);
  assert.equal(grownupMay('POST', `/api/games/${cw.id}/save`), true);
  for (const [m, p] of [['POST', 'clues'], ['POST', 'words-from-doc'], ['POST', 'sets'], ['GET', 'sets/ABCDE12345']]) assert.equal(grownupMay(m, `/api/games/${cw.id}/${p}`), false, `${m} ${p}`);
  assert.equal(fenceLets(auth.getUser(mum.id), 'POST', `/api/games/${cw.id}/clues`), false);
  for (const u of [teacher, kid, null]) assert.equal(fenceLets(u && auth.getUser(u.id), 'POST', `/api/games/${cw.id}/clues`), true, 'the fence is for grown-ups only');
});

test('the frame: a family grown-up gets Print but no AI clues, no set saving and no class code lookup; a teacher gets them all', async () => withAi(async () => {
  const p = (await frameFor(mum)).init;
  assert.equal(p.clues, undefined); assert.equal(p.setSave, false); assert.equal(p.setFind, false); assert.equal(p.print, true); assert.equal(p.canAssign, undefined);
  const t = (await frameFor(teacher)).init;
  assert.equal(t.clues, true); assert.equal(t.setSave, undefined); assert.equal(t.setFind, undefined); assert.equal(t.print, true); assert.equal(t.canAssign, true);
  // A kid: no AI (not a host), but the fence is not theirs, so nothing else changes.
  const k = (await frameFor(kid)).init;
  assert.equal(k.clues, undefined); assert.equal(k.setSave, undefined); assert.equal(k.setFind, undefined);
  // What the server answers matches: the grown-up's calls are refused by the fence, which is why they are hidden.
  assert.equal((await call(`/api/games/${cw.id}/clues`, { method: 'POST', body: { words: ['cat'] }, user: mum })).status, 404);
  assert.equal((await call(`/api/games/${cw.id}/sets`, { method: 'POST', body: { items: [] }, user: mum })).status, 404);
}));

test('the SDK: canSaveSet and canFindSet are false only when the frame says so', () => {
  const sdk = fs.readFileSync(path.join(ROOT, 'public/sdk/brb-sdk.js'), 'utf8');
  assert.match(sdk, /canSaveSet: INIT\.setSave !== false/); assert.match(sdk, /canFindSet: INIT\.setFind !== false/);
  assert.match(sdk, /canWriteClues: INIT\.clues === true/);
});

test('the words: a Step 1 note and a Step 2 hint without AI, in every language, no em dashes in English', () => {
  const lines = HTML.split('\n').filter(l => /^\s*"[A-Za-z-]+": \{"title"/.test(l));
  assert.equal(lines.length, 13);
  for (const l of lines) {
    const lang = /"([A-Za-z-]+)"/.exec(l)[1], d = JSON.parse(l.trim().replace(/^"[A-Za-z-]+": /, '').replace(/,$/, ''));
    for (const k of ['addPNoAi', 'typeClues']) { assert.ok(typeof d[k] === 'string' && d[k].length > 5, `${lang} ${k}`); assert.doesNotMatch(d[k], /AI|IA|KI|ИИ|الذكاء/, `${lang} ${k}: no AI`); }
    if (lang.startsWith('en')) for (const k of ['addPNoAi', 'typeClues']) assert.doesNotMatch(d[k], /—/, `${lang} ${k}: no em dash`);
  }
});

// ---------------------------------------------------------------- in Chromium, with the frame the server sends
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
async function open(doc) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1300 } });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>addEventListener('message', e => { const d = e.data; if (d && d.brb === 1 && d.type === 'brb:tts' && !d.pre) e.source.postMessage({ brb: 1, type: 'brb:tts', id: d.id, ok: false, why: 'off' }, '*'); });</script>`;
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return process.env.CW_SHOTS ? route.continue() : route.abort();
    return route.abort();
  });
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.cwState && window.__brbTest.cwState().screen === 'home', null, { timeout: 60_000 });
  return { ctx, p, frame, errors };
}
const ids = (frame, list) => frame.evaluate(l => l.filter(id => document.getElementById(id)), list);
const TOOLS = ['cw-level', 'cw-ai', 'cw-doclimits', 'cw-typeclues'];

test('in the game: a parent sees no AI, document upload, set saving or class code; a teacher does; both type words, play and print', { skip, timeout: 240_000 }, async () => withAi(async () => {
  for (const who of ['parent', 'teacher']) {
    const { doc } = await frameFor(who === 'parent' ? mum : teacher);
    const g = await open(doc);
    try {
      assert.deepEqual(await ids(g.frame, ['cw-codein', 'cw-make', 'cw-sample']), who === 'parent' ? ['cw-make', 'cw-sample'] : ['cw-codein', 'cw-make', 'cw-sample']);
      await g.frame.click('#cw-make');
      await g.frame.waitForFunction(() => window.__brbTest.cwState().screen === 'build');
      await g.frame.fill('#cw-title', 'Habitats');
      await g.frame.fill('#cw-paste', 'habitat - where an animal lives\npredator: an animal that hunts others\nerosion\tthe wearing away of land\nprey');
      await g.frame.click('#cw-addgo');
      const up = (await g.frame.textContent('label.cw-file')).trim(), accept = await g.frame.getAttribute('#cw-file', 'accept');
      const note = await g.frame.textContent('.cw-sec .cw-note');
      if (who === 'parent') {
        assert.deepEqual(await ids(g.frame, TOOLS), ['cw-typeclues']);
        assert.equal(up, '📄 Upload a list (.txt or .csv)'); assert.doesNotMatch(accept, /pdf|docx|msword/); assert.match(accept, /\.txt,\.csv/);
        assert.doesNotMatch(note, /AI/); assert.match(await g.frame.textContent('#cw-typeclues'), /Type a clue for each word/);
        assert.doesNotMatch(await g.frame.textContent('#cw-listsec'), /AI/);
      } else {
        assert.deepEqual(await ids(g.frame, TOOLS), ['cw-level', 'cw-ai', 'cw-doclimits']);
        assert.equal(up, '📄 Upload a word list (PDF or Word)'); assert.match(accept, /\.pdf/); assert.match(note, /AI/);
      }
      if (process.env.CW_SHOTS) await g.p.screenshot({ path: path.join(process.env.CW_SHOTS, `crossword-editor-${who}.png`) });
      await g.frame.fill('#cw-c3', 'An animal that is hunted');
      await g.frame.click('#cw-makego');
      await g.frame.waitForFunction(() => window.__brbTest.cwState().screen === 'preview');
      assert.deepEqual(await ids(g.frame, ['cw-shuffle', 'cw-playit', 'cw-print', 'cw-save']), who === 'parent' ? ['cw-shuffle', 'cw-playit', 'cw-print'] : ['cw-shuffle', 'cw-playit', 'cw-print', 'cw-save']);
      if (process.env.CW_SHOTS) await g.p.screenshot({ path: path.join(process.env.CW_SHOTS, `crossword-preview-${who}.png`) });
      // Your crosswords on the home screen: Edit, Play and Delete for both; Share (which saves a set) for the teacher only.
      await g.frame.click('#cw-edit'); await g.frame.click('#cw-home');
      await g.frame.waitForFunction(() => window.__brbTest.cwState().screen === 'home');
      const acts = await g.frame.evaluate(() => [...document.querySelectorAll('#cw-mine li .cw-acts2 button')].map(b => Object.keys(b.dataset)[0]));
      assert.deepEqual(acts, who === 'parent' ? ['edit', 'play', 'del'] : ['edit', 'play', 'share', 'del']);
      // Play works for both.
      await g.frame.click('#cw-mine [data-play]');
      await g.frame.waitForFunction(() => window.__brbTest.cwState().screen === 'play');
      assert.ok(await g.frame.$('#cw-printit'), 'Print on the play screen');
      assert.deepEqual(g.errors, []);
    } finally { await g.ctx.close(); }
  }
}));
