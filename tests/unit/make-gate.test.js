// "Make your own" is for teachers and grown-ups (docs/decisions.md "Make your own: grown-ups who may host only"): the
// frame's `make` (BRB.canMake) in Crossword, Word Hunt and Atlas Quest is true for grown-ups who may host (school staff,
// the platform admin, a family grown-up), with AI on or off, and absent for a student, a child, a guest, a signed-out
// player and any preview. Without it the game hides Make, every way into the builder and the drafts list (drafts already
// in the save stay there, unshown), and POST /api/games/:id/sets refuses (as clues and words-from-doc already do); a
// student with a link or a class code still plays. The browser part needs a local Chromium; it is skipped without one.
// MAKE_SHOTS=<dir> saves screenshots of Crossword's home for a teacher and a student.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reset, call, publish, official, teacher, kid, mia, mum, boss, auth, config, games, q } from './_live.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f) && fs.statSync(f).isFile());
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const { frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const G = await import('../../server/services/game-sets.js');

const html = slug => fs.readFileSync(path.join(ROOT, `seed-games/${slug}.html`), 'utf8');
const SLUGS = ['crossword', 'word-hunt', 'atlas-quest'];
const GAME = Object.fromEntries(SLUGS.map(s => [s, publish(official, html(s), { source: 'seed', slug: s, title: s })]));
const MH = publish(official, '<!doctype html><title>t</title><p>mh</p>', { source: 'seed', slug: 'mistake-hunt', title: 'Mistake Hunt' });
const guest = auth.createGuest();
const fresh = u => (u ? auth.getUser(u.id) : null);

/** The frame document a viewer gets for a game page (with its query), and its init. */
async function frameFor(slug, u, query = '') {
  const page = await call(`/play/${slug}${query}`, { user: u });
  assert.equal(page.status, 200, page.text.slice(0, 200));
  const src = /data-src="(\/frame\/[^"]+?)"/.exec(page.text)[1].replace(/&amp;/g, '&');
  const fr = await call(src, { user: u });
  assert.equal(fr.status, 200);
  return { doc: fr.text, init: JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(fr.text)[1]) };
}
const withKey = async (key, fn) => { const was = config.anthropicKey; config.anthropicKey = key; try { return await fn(); } finally { config.anthropicKey = was; } };
const WHO = [['teacher', teacher, true], ['admin', boss, true], ['family grown-up', mum, true], ['student', mia, false], ['child', kid, false], ['guest', guest, false], ['signed out', null, false]];

test('the frame: make (BRB.canMake) for grown-ups who may host, AI on or off; never a student, a child, a guest or signed out', async () => {
  reset();
  for (const key of ['', 'test-key']) await withKey(key, async () => {
    for (const slug of SLUGS) for (const [who, u, yes] of WHO) {
      const { init } = await frameFor(slug, fresh(u));
      assert.equal(init.make, yes ? true : undefined, `${slug} ${who} (AI ${key ? 'on' : 'off'})`);
      // Saving a set follows it in these games (a family grown-up was already kept from sets by the fence).
      if (!yes || who === 'family grown-up') assert.equal(init.setSave, false, `${slug} ${who}: no set saving`);
      else assert.equal(init.setSave, undefined, `${slug} ${who}: may save a set`);
    }
  });
  // Only these three games: another set game has no make, and a child's set rights there are as they were.
  const mh = (await frameFor('mistake-hunt', fresh(kid))).init;
  assert.equal(mh.make, undefined); assert.equal(mh.setSave, undefined);
  assert.equal((await frameFor('mistake-hunt', fresh(teacher))).init.make, undefined);
  // A preview (owner/admin only) gets none, as with clues and My worksheets.
  for (const slug of SLUGS) {
    const g = GAME[slug];
    const fr = await call(`/frame/${auth.signToken({ v: g.published_version_id, g: g.id, u: boss.id, p: 1 }, 600)}`, { user: boss });
    assert.equal(fr.status, 200);
    assert.equal(JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(fr.text)[1]).make, undefined, `${slug} preview`);
  }
});

test('the SDK: BRB.canMake is INIT.make, true only when the frame says so', () => {
  const sdk = fs.readFileSync(path.join(ROOT, 'public/sdk/brb-sdk.js'), 'utf8');
  assert.match(sdk, /canMake: INIT\.make === true/);
  const doc = fs.readFileSync(path.join(ROOT, 'docs/sdk.md'), 'utf8');
  assert.match(doc, /`BRB\.canMake`/);
  for (const slug of SLUGS) assert.match(html(slug), /CAN_MAKE = B\.canMake === true/, slug);
});

const ITEMS = {
  crossword: [{ t: 'Habitats', w: [['habitat', 'Where an animal lives'], ['predator', 'An animal that hunts'], ['prey', 'An animal that is hunted'], ['erosion', 'Wearing away of land']], r: 4, b: true, h: true }],
  'word-hunt': [{ t: 'Habitats', w: ['habitat', 'predator', 'prey', 'erosion', 'ecosystem', 'food chain'], s: 0, d: 'medium', r: 4, b: true }],
  'atlas-quest': [{ t: 'Western Europe', r: 'eu', q: [['map', 'FR'], ['cap', 'DE'], ['flag', 'IT']], a: [], h: true }],
};
test('the server: a student, a child, a guest and a family grown-up may not save a set or read a document in these games; a teacher may', async () => withKey('test-key', async () => {
  reset(); q.run('DELETE FROM game_sets');
  for (const slug of SLUGS) {
    const g = GAME[slug], base = `/api/games/${g.id}/sets`;
    assert.ok(G.SET_GAMES.get(slug)(ITEMS[slug]), `${slug}: the items are good`);
    const ok = await call(base, { method: 'POST', body: { items: ITEMS[slug] }, user: teacher });
    assert.equal(ok.status, 200, `${slug} teacher: ${ok.text}`);
    for (const [who, u, status, code] of [['student', mia, 403, 'notAllowed'], ['child', kid, 403, 'notAllowed'], ['guest', guest, 403, 'guest'], ['family grown-up', mum, 404, null], ['signed out', null, 401, null]]) {
      const r = await call(base, { method: 'POST', body: { items: ITEMS[slug] }, user: u });
      assert.equal(r.status, status, `${slug} ${who}: ${r.text}`);
      if (code) assert.equal(r.json.code, code, `${slug} ${who}`);
      // and not change a teacher's set by its id either
      assert.equal((await call(base, { method: 'POST', body: { items: ITEMS[slug], id: ok.json.id }, user: u })).status, status, `${slug} ${who} by id`);
    }
    // A student still opens the teacher's set by its class code.
    assert.equal((await call(`${base}/${ok.json.id.slice(2)}`, { user: mia })).status, 200, `${slug}: the code works for a student`);
    // Reading a document (Crossword's word list, Word Hunt's words, Atlas Quest's lesson): refused before any file is read.
    const doc = { kind: 'docx', data: Buffer.from('not a real file').toString('base64') };
    for (const [who, u, status] of [['student', mia, 403], ['child', kid, 403], ['guest', guest, 403], ['family grown-up', mum, 404], ['signed out', null, 401]]) {
      assert.equal((await call(`/api/games/${g.id}/words-from-doc`, { method: 'POST', body: doc, user: u })).status, status, `${slug} ${who} words-from-doc`);
    }
  }
  // Crossword's AI clues: the same.
  for (const [who, u, status] of [['student', mia, 403], ['child', kid, 403], ['guest', guest, 403], ['family grown-up', mum, 404]]) {
    assert.equal((await call(`/api/games/${GAME.crossword.id}/clues`, { method: 'POST', body: { words: ['cat'] }, user: u })).status, status, `clues ${who}`);
  }
  // Mistake Hunt is not a "Make your own" game: its set rules are as they were (anyone signed in but a guest).
  assert.notEqual((await call(`/api/games/${MH.id}/sets`, { method: 'POST', body: { items: [] }, user: kid })).json.code, 'notAllowed');
}));

// ---------------------------------------------------------------- in Chromium, with the frame the server sends
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
async function open(doc) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>addEventListener('message', e => { const d = e.data; if (d && d.brb === 1 && d.type === 'brb:tts' && !d.pre) e.source.postMessage({ brb: 1, type: 'brb:tts', id: d.id, ok: false, why: 'off' }, '*'); });</script>`;
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return process.env.MAKE_SHOTS ? route.continue() : route.abort();
    return route.abort();
  });
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  return { ctx, p, frame, errors };
}
const ids = (frame, list) => frame.evaluate(l => l.filter(id => document.getElementById(id)), list);

// Each game: its save key, a draft in its own shape, the home screen's ready check, and Make and the drafts list's ids.
const GAMES = {
  crossword: { key: 'crossword-v1', save: { mine: [{ id: 'cold1', t: 'Old draft', w: [['cat', 'A pet'], ['dog', 'Another pet']], r: 1, at: Date.UTC(2026, 10, 20) }] },
    ready: () => window.__brbTest && window.__brbTest.cwState && window.__brbTest.cwState().screen === 'home', make: ['cw-make', 'cw-mine'] },
  'word-hunt': { key: 'word-hunt-v1', save: { mine: [{ id: 'hold1', t: 'Old draft', w: ['cat', 'dog', 'fish'], s: 0, d: 'easy', r: 1, at: Date.UTC(2026, 10, 20) }] },
    ready: () => window.__brbTest && window.__brbTest.whState && window.__brbTest.whState().screen === 'home' && !!document.querySelector('.wh-home'), make: ['wh-make', 'wh-mine'] },
  'atlas-quest': { key: 'atlas-quest-v1', save: { intro: 1, mine: [{ id: 'qold1', t: 'Old draft', r: 'eu', q: [['map', 'FR'], ['cap', 'DE']], a: [], h: true, at: Date.UTC(2026, 10, 20) }] },
    ready: () => !!document.querySelector('.aq-teach') && !!document.getElementById('aq-lib'), make: ['aq-make', 'aq-mine'] },
};

for (const slug of SLUGS) {
  test(`${slug} in the game: a teacher gets Make and their drafts; a student and a child get neither, their old drafts kept`, { skip, timeout: 240_000 }, async () => {
    const cfg = GAMES[slug], g = GAME[slug];
    for (const [who, u, yes] of [['teacher', teacher, true], ['family grown-up', mum, true], ['student', mia, false], ['child', kid, false]]) {
      games.putSave(g.id, u.id, { [cfg.key]: JSON.stringify(cfg.save) });
      const { doc, init } = await frameFor(slug, fresh(u));
      assert.equal(init.make, yes ? true : undefined, `${slug} ${who}`);
      const o = await open(doc);
      try {
        await o.frame.waitForFunction(cfg.ready, null, { timeout: 90_000 });
        assert.deepEqual(await ids(o.frame, cfg.make), yes ? cfg.make : [], `${slug} ${who}: Make and the drafts list`);
        if (slug === 'atlas-quest') {
          // The other ways into the quiz maker: "Make a quiz" in the library.
          await o.frame.evaluate(() => window.__brbTest.library());
          await o.frame.waitForFunction(() => !!document.querySelector('.aq-libc'));
          await o.frame.evaluate(() => { const d = document.querySelector('.aq-libc'); d.open = true; d.dispatchEvent(new Event('toggle')); });
          await o.frame.waitForFunction(() => !!document.querySelector('.aq-libbody'));
          const quiz = await o.frame.evaluate(() => document.querySelector('.aq-libbody').textContent.includes('Make a quiz'));
          assert.equal(quiz, yes, `${slug} ${who}: Make a quiz in the library`);
        }
        if (process.env.MAKE_SHOTS && slug === 'crossword' && (who === 'teacher' || who === 'student')) {
          fs.mkdirSync(process.env.MAKE_SHOTS, { recursive: true });
          await o.p.screenshot({ path: path.join(process.env.MAKE_SHOTS, `crossword-home-${who}.png`) });
        }
        assert.deepEqual(o.errors, [], `${slug} ${who}: no page errors`);
      } finally { await o.ctx.close(); }
      // The draft is left alone in the save.
      assert.deepEqual(JSON.parse(games.getSave(g.id, u.id)[cfg.key]).mine.map(m => m.id), cfg.save.mine.map(m => m.id), `${slug} ${who}: the draft is kept`);
    }
  });
}

test('a student with a class code or a link still plays the teacher\'s crossword and word hunt', { skip, timeout: 240_000 }, async () => {
  q.run('DELETE FROM game_sets');
  for (const slug of ['crossword', 'word-hunt']) {
    const g = GAME[slug];
    const r = await call(`/api/games/${g.id}/sets`, { method: 'POST', body: { items: ITEMS[slug] }, user: teacher });
    assert.equal(r.status, 200, r.text);
    const { doc, init } = await frameFor(slug, fresh(mia), `?chapter=${r.json.id}`);
    assert.equal(init.make, undefined); assert.equal(init.set.id, r.json.id);
    const o = await open(doc);
    try {
      if (slug === 'crossword') {
        await o.frame.waitForFunction(() => window.__brbTest && window.__brbTest.cwState && window.__brbTest.cwState().screen === 'play', null, { timeout: 90_000 });
        assert.equal(await o.frame.locator('#cw-back').count(), 0, 'no way into the builder from the puzzle');
      } else {
        await o.frame.waitForFunction(() => window.__brbTest && window.__brbTest.whState && window.__brbTest.whState().screen === 'play', null, { timeout: 90_000 });
        assert.doesNotMatch(await o.frame.textContent('#wh-back'), /Change|Edit/);
      }
      assert.deepEqual(o.errors, []);
    } finally { await o.ctx.close(); }
  }
});
