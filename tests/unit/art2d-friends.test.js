// Many characters in a 2D game (Oomba2D 1.1.0, CONFIG.friends2d): the first character picked is the player, the others
// are friends who are IN the game. The helper is driven here with a small stand-in for the kit's stage (no browser), so
// time and the camera are exact: who stands where, at most four at once, everyone gets a turn, they hop on the spot
// and never move towards the player, never solid; then the tags, the templates, the template tool, the lint and the
// locks; and one real frame of each game in Chromium (skipped when there is none).
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-friends-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { config } = await import('../../server/config.js');
config.arcade = true;   // the arcade Builder (the 2D art); the classroom focus (ARCADE off): builder-focus.test.js
const S = await import('../../server/services/art2d.js');
const A = await import('../../server/builder/art2d.js');
const T = await import('../../server/builder/templates/index.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { toolbox } = await import('../../server/builder/tools.js');
const { createUser } = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const LOCK = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit2/ART2D.json'), 'utf8'));
const sri = buf => 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
const HELPER = fs.readFileSync(path.join(ROOT, 'public/vendor/art2d/oomba2d/1.1.0/oomba2d.js'), 'utf8');

// ---------------------------------------------------------------- a stand-in for the page and the kit's stage
/** Oomba2D 1.1.0 in a sandbox with the real pack manifests loaded. reduced: the player asked for less motion. */
function world({ reduced = false, failing = [] } = {}) {
  const defined = {}, loads = [];
  class Image { set src(v) { loads.push(v); const bad = failing.some(f => v.includes(f)); setTimeout(() => (bad ? this.onerror && this.onerror() : this.onload && this.onload()), 0); } }
  const ctx2d = { drawImage() {}, fillRect() {}, createLinearGradient: () => ({ addColorStop() {} }) };
  const document = { currentScript: null, createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {}, setAttribute() {} }), querySelectorAll: () => [], documentElement: {} };
  const window = { Oomba: { art: { define: (n, d) => { defined[n] = d; } }, settings: { reduced } } };
  const sandbox = { window, document, Image, setTimeout, Promise, console };
  vm.createContext(sandbox); vm.runInContext(HELPER, sandbox);
  for (const id of ['castle-quest', 'animals', 'heroes']) { document.currentScript = { src: `http://x.invalid/vendor/art2d/${id}/${S.ART2D_PACKS[id]}/pack.js` }; window.Oomba2D.pack(JSON.parse(JSON.stringify(S.art2dManifest(id)))); }
  return { O2: window.Oomba2D, defined, loads };
}
/** A flat level `cols` wide (cell 48), the hero at column 2, with the kit's ground tiles; items: [{ c, spec }]. */
function stage({ cols = 80, items = [], vw = 480, noGround = false } = {}) {
  const cell = 48, floorY = 480, entities = [], updates = [];
  if (!noGround) for (let c = 0; c < cols; c++) entities.push({ sprite: 'ground:grass', variant: '14', x: (c + 0.5) * cell, y: floorY + cell / 2 });
  const st = { entities, view: { vw, vh: 600, scale: 1 }, camera: { x: 2.5 * cell, y: 300, zoom: 1 }, gov: null, add(name, a) { const e = { sprite: name, ...a }; entities.push(e); return e; }, update(fn) { updates.push(fn); } };
  const w = { stage: st, cell, level: { h: floorY + 2 * cell, cols, w: cols * cell, items }, hero: { x: 2.5 * cell, y: floorY }, ents: [], body: { grounded: true, vy: 0 } };
  const tick = (dt = 1 / 30) => { for (const f of updates) f(dt); };
  /** Run the hero (and the camera with it) to column c at `speed` cells a second. */
  const runTo = (c, each = () => {}, speed = 6) => { while (w.hero.x < c * cell) { w.hero.x += speed * cell / 30; st.camera.x = w.hero.x; tick(); each(); } };
  return { w, st, tick, runTo, cell, floorY, friends: () => entities.filter(e => e.a2dFriend) };
}
const settle = () => new Promise(r => setTimeout(r, 30));
const PICKS = ['fox', 'zebra', 'knight', 'cow', 'stegosaurus', 'pig', 'mage', 'llama', 'triceratops'];

// ---------------------------------------------------------------- the helper
test('the runner: friends stand along the way, at most four at once, and everyone picked gets a turn', async () => {
  const { O2, defined, loads } = world();
  assert.equal(O2.version, '1.1.0'); assert.equal(O2.friendsShown, 4);
  const art = await O2.use({ world: 'castle-quest', hero: 'pug', friends: [...PICKS, 'pug', 'fox', 'no-such-animal'] });
  assert.deepEqual([...art.friends], PICKS, 'the player is not a friend of itself; a name twice or unknown is left out');
  const early = loads.filter(u => /animals|heroes/.test(u)).length;
  assert.ok(early >= 1 + 4 && early <= 1 + 5, `the hero and the first four friends are waited for; the rest are not (${early} asked for so far)`);
  await settle(); await settle();
  assert.equal(loads.filter(u => /animals|heroes/.test(u)).length, 1 + PICKS.length, 'the others load while the game plays, one by one');
  for (const id of PICKS) assert.ok(defined[`a2d:friend:${id}`], `${id} is a kit sprite`);
  const g = stage({ cols: 80, items: [{ c: 9, spec: 'coin' }, { c: 13, spec: 'spikes' }, { c: 76, spec: 'goal' }] });
  assert.equal(art.dress(g.w), true);
  const places = g.friends();
  assert.ok(places.length >= 12 && places.length <= 24, `${places.length} places along an 80-column level`);
  const colOf = e => Math.floor(e.x / g.cell);
  for (const e of places) {
    assert.equal(e.y, g.floorY, 'feet on the floor line'); assert.equal(e.shadow, false); assert.ok(!e.parts && !e.body, 'a picture: no hazard, no collectible, no body');
    assert.ok(![12, 13, 14, 75, 76, 77].includes(colOf(e)), 'never where there is something to jump over or the goal');
    assert.ok(colOf(e) >= 5, 'not on top of the player at the start');
  }
  assert.ok(places.some(e => colOf(e) === 9) || places.some(e => [8, 9, 10].includes(colOf(e))), 'a coin can float over a friend');
  const x0 = places.map(e => e.x), seen = new Set(); let most = 0;
  g.runTo(74, () => {
    const now = O2.friendsNow; most = Math.max(most, now.length);
    for (const f of now) { seen.add(f.id); assert.equal(f.solid, false); }
    assert.ok(new Set(now.map(f => f.id)).size === now.length, 'nobody stands in two places at once');
  });
  assert.ok(most >= 2 && most <= 4, `${most} friends at once at most (the cap is 4)`);
  assert.deepEqual([...seen].sort(), [...PICKS].sort(), 'every one of the nine picked showed up along the way');
  assert.deepEqual(places.map(e => e.x), x0, 'a friend never leaves its place: none moves towards (or away from) the player');
});

test('friends look at the player and hop on the spot as the player runs by; with reduced motion they stand still', async () => {
  for (const reduced of [false, true]) {
    const { O2 } = world({ reduced });
    const art = await O2.use({ world: 'castle-quest', hero: 'fox', friends: ['zebra', 'cow'] }); await settle();
    const g = stage({ cols: 40 }); art.dress(g.w);
    const first = g.friends()[0]; let hopped = false, top = g.floorY; const frames = new Set();
    g.tick(); assert.equal(first.visible, true); assert.equal(first.flip, true, 'the player is to its left: it looks left');
    g.runTo(Math.floor(first.x / g.cell) + 4, () => { if (first.y < g.floorY - 1) hopped = true; top = Math.min(top, first.y); frames.add(first.variant); });
    assert.equal(first.flip, false, 'the player ran past: it looks right');
    assert.equal(first.y, g.floorY, 'back on the floor');
    if (reduced) { assert.equal(hopped, false, 'no hop'); assert.equal(frames.size, 1, 'one standing frame'); }
    else { assert.equal(hopped, true); assert.ok(g.floorY - top <= g.cell * 0.6 && g.floorY - top > g.cell * 0.2, 'a small hop'); assert.ok(frames.size > 2, 'idle and jump frames'); }
  }
});

test('the catching game: friends watch from the two sides of the view and take turns; a round later the turn goes on', async () => {
  const { O2 } = world();
  const art = await O2.use({ world: 'castle-quest', hero: 'pug', friends: PICKS }); await settle(); await settle();
  const g = stage({ cols: 24, vw: 480, noGround: true }); g.w.hero.x = g.st.camera.x = 12 * g.cell;
  art.dress(g.w, { friends: 'sides' });
  assert.equal(g.friends().length, 4);
  const seen = new Set(); let most = 0;
  const watch = seconds => { for (let i = 0; i < seconds * 30; i++) { g.tick(); const now = O2.friendsNow; most = Math.max(most, now.length); for (const f of now) { seen.add(f.id); assert.equal(f.solid, false); const off = (f.x - g.st.camera.x) / 480; assert.ok(Math.abs(Math.abs(off) - 0.39) < 0.02, `at an edge of the view (${off})`); } } };
  watch(2);
  assert.equal(most, 2, 'a phone-wide view: one at each side');
  g.w.hero.x = g.st.camera.x = 6 * g.cell; watch(1);   // the view moves: they keep their place on the screen
  watch(60);
  assert.deepEqual([...seen].sort(), [...PICKS].sort(), 'with two places and nine friends, every one had a turn within a minute');
  // a wide view has a second pair further in; a new round starts with the next friends, not the same first ones
  const wide = stage({ cols: 24, vw: 960, noGround: true }); wide.w.hero.x = wide.st.camera.x = 12 * wide.cell;
  art.dress(wide.w, { friends: 'sides' }); wide.tick(); wide.tick();
  assert.equal(O2.friendsNow.length, 4, 'four at once is the most');
  for (let i = 0; i < 30 * 40; i++) { wide.tick(); assert.ok(O2.friendsNow.length <= 4); }
});

test('friends are optional and safe to fail: none asked, none drawn; a picture that will not load is left out', async () => {
  const a = world(); const plain = await a.O2.use({ world: 'castle-quest', hero: 'fox' });
  assert.deepEqual([...plain.friends], []); assert.ok(!Object.keys(a.defined).some(n => n.startsWith('a2d:friend:')), 'a game with no friends is exactly a 1.0.0 game');
  const g = stage({ cols: 30 }); plain.dress(g.w); assert.equal(g.friends().length, 0);
  const b = world({ failing: ['zebra.webp'] }); const art = await b.O2.use({ world: 'castle-quest', hero: 'fox', friends: ['zebra', 'cow'] }); await settle();
  const g2 = stage({ cols: 60 }); art.dress(g2.w); const seen = new Set(); g2.runTo(50, () => { for (const f of b.O2.friendsNow) seen.add(f.id); });
  assert.deepEqual([...seen], ['cow']);
  const c = world(); const off = await c.O2.use({ world: 'castle-quest', hero: 'fox', friends: ['cow'] }); await settle();
  const g3 = stage({ cols: 30 }); off.dress(g3.w, { friends: false }); assert.equal(g3.friends().length, 0);
  // friends with no world and no sprite hero: still a game with friends (the kit's own look and hero)
  const d = world(); const only = await d.O2.use({ friends: ['cow', 'pig'] }); assert.ok(only); assert.equal(only.world, ''); assert.equal(only.hero, '');
  assert.equal(await world().O2.use({ friends: ['no-such-animal'] }), null);
  assert.equal(world().O2.friendsMax, A.ART2D_FRIENDS_MAX);
});

// ---------------------------------------------------------------- locks, tags, templates, tool, lint
test('Oomba2D 1.1.0 ships as a new locked version; 1.0.0 and every pack keep their bytes', () => {
  assert.equal(LOCK.helper['1.0.0'], 'sha384-3a+B7hjO2aSmf1AzhbsdaKqZT+u2mlBDN5iZMMy2Vi5pu9baiX61g7WfpdKvEbRl', 'the 1.0.0 lock line is untouched');
  assert.equal(sri(fs.readFileSync(path.join(ROOT, 'public/vendor/art2d/oomba2d/1.0.0/oomba2d.js'))), LOCK.helper['1.0.0']);
  assert.equal(sri(Buffer.from(HELPER)), LOCK.helper['1.1.0']); assert.equal(S.OOMBA2D_VERSION, '1.1.0');
  assert.equal(sri(fs.readFileSync(path.join(ROOT, 'kit2/src2d/oomba2d.js'))), LOCK.helper['1.1.0']);
  assert.ok(S.oomba2dTag('1.0.0').includes('/oomba2d/1.0.0/') && S.oomba2dTag().includes('/oomba2d/1.1.0/'), 'a saved game keeps its 1.0.0 tag; new games get 1.1.0');
  // a game saved with the 1.0.0 helper still passes the scan
  const old = T.loadTemplate('runner', { world: 'pirate-cove', hero: 'fox' }).replace(S.oomba2dTag(), S.oomba2dTag('1.0.0'));
  assert.equal(scanVersion(old).status, 'pass');
  assert.doesNotMatch(HELPER, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|document\.cookie|<input|\$\d|price/i);
});

test('tags and templates: friends2d beside hero2d, each friend\'s pack loaded once, the player never among the friends', () => {
  assert.equal(A.art2dTags({ world: 'toy-town', hero: 'fox', friends: ['zebra', 'cow'] }), [S.oomba2dTag(), S.art2dPackTag('toy-town'), S.art2dPackTag('animals')].join('\n'));
  assert.equal(A.art2dTags({ hero: 'fox', friends: ['knight'] }), [S.oomba2dTag(), S.art2dPackTag('animals'), S.art2dPackTag('heroes')].join('\n'));
  assert.equal(A.art2dTags({ friends: ['knight'] }), [S.oomba2dTag(), S.art2dPackTag('heroes')].join('\n'));
  assert.deepEqual(A.art2dFriends(['fox', 'fox', 'nope', 'knight', 'zebra'], 'fox').map(c => c.id), ['knight', 'zebra']);
  // Everyone once, up to the most a game takes (40: Oomba2D 1.1.0's own friendsMax, a locked file). Since the 23 sea
  // animals joined (animals 1.1.0) there are more sprite characters than that: "Select all" keeps the first 40.
  assert.ok(A.ART2D_CHARACTER_IDS.length > A.ART2D_FRIENDS_MAX, 'more characters than one game takes');
  assert.equal(A.art2dFriends(A.ART2D_CHARACTER_IDS.concat(A.ART2D_CHARACTER_IDS)).length, Math.min(A.ART2D_CHARACTER_IDS.length, A.ART2D_FRIENDS_MAX));
  assert.equal(new Set(A.art2dFriends(A.ART2D_CHARACTER_IDS.concat(A.ART2D_CHARACTER_IDS)).map(c => c.id)).size, A.ART2D_FRIENDS_MAX, 'nobody twice');
  for (const key of A.ART2D_TEMPLATES) {
    const plain = T.loadTemplate(key);
    assert.match(plain, /\n  hero2d: '',\n  friends2d: \[\],\n/); assert.ok(!plain.includes('art2d/'), 'no friends, no art: the game as it always was');
    assert.equal(T.loadTemplate(key, { world: 'toy-town', hero: 'pig' }).includes("friends2d: [],"), true);
    const all = A.ART2D_CHARACTER_IDS.filter(id => id !== 'pig').slice(0, A.ART2D_FRIENDS_MAX), g = T.loadTemplate(key, { world: 'toy-town', hero: 'pig', friends: A.ART2D_CHARACTER_IDS });
    assert.ok(g.includes(`\n  hero2d: 'pig',\n  friends2d: [${all.map(id => `'${id}'`).join(', ')}],\n`), `${key}: everyone picked is in the game, up to the 40 a game takes`);
    assert.ok(g.includes('friends: CONFIG.friends2d'));
    assert.equal(scanVersion(g).status, 'pass', `${key} with every character passes the safety scan`);
    assert.equal((g.match(/\/vendor\/art2d\/[a-z0-9-]+\/\d+\.\d+\.\d+\/(pack|oomba2d)\.js/g) || []).length, 2 + new Set(['pig', ...all].map(id => A.art2dCharacter(id).pack)).size, 'Oomba2D, the world, and the pack of everyone in the game: each once');
  }
  assert.match(T.loadTemplate('catch', { hero: 'pig', friends: ['fox'] }), /art\.dress\(w, \{ every: 4, friends: 'sides' \}\)/);
});

test('the template tool takes friends, refuses an invented one, and remembers them', async () => {
  const u = createUser({ username: 'FriendsTool', password: 'secret12' }), g = games.createGame(u.id, { title: 'New game' });
  const state = {}, tb = toolbox({ user: u, gameId: g.id, emit: () => {}, state, locale: 'en', requests: [] });
  let r = await tb.exec('start_from_template', { template: 'runner', world: 'wild-woods', sprite: 'fox', friends: ['zebra', 'unicorn'], notes: 'x' });
  assert.equal(r.ok, false); assert.match(r.forModel, /no sprite hero or animal called "unicorn"/);
  r = await tb.exec('start_from_template', { template: 'runner', world: 'wild-woods', sprite: 'fox', friends: ['zebra', 'knight', 'fox'], notes: 'A woods run with friends' });
  assert.equal(r.ok, true, r.forModel); assert.match(r.forModel, /with the sprite fox as the hero and 2 friends in the game too \(CONFIG\.friends2d: zebra, knight\)/);
  assert.match(tb.current().html, /\n  hero2d: 'fox',\n  friends2d: \['zebra', 'knight'\],\n/);
  // the choice kept from the setup steps (state.art2d) is used when the model leaves the names out
  const st2 = { art2d: { world: 'toy-town', hero: 'pig', friends: ['cow', 'sheep'] } }, g2 = games.createGame(u.id, { title: 'New game' });
  const tb2 = toolbox({ user: u, gameId: g2.id, emit: () => {}, state: st2, locale: 'en', requests: [] });
  r = await tb2.exec('start_from_template', { template: 'catch', notes: 'x' });
  assert.equal(r.ok, true); assert.match(tb2.current().html, /\n  world: 'toy-town',\n  hero2d: 'pig',\n  friends2d: \['cow', 'sheep'\],\n/);
  assert.match(A.ART2D_RULES, /up to four at\s+once and the others take turns/);
});

// ---------------------------------------------------------------- one real frame of each game
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
let browser = null;
test.after(async () => { if (browser) await browser.close(); });
const HOST = 'http://game.invalid';
for (const [key, size] of [['runner', [960, 600]], ['catch', [390, 844]]]) {
  test(`in the frame: a ${key} game with a player and six friends plays, draws friends and nothing is refused`, { skip, timeout: 180_000 }, async () => {
    if (!browser) browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const friends = ['zebra', 'knight', 'cow', 'stegosaurus', 'pig', 'mage'], html = T.loadTemplate(key, { world: 'castle-quest', hero: 'fox', friends });
    const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] } });
    const doc = frameDocument(html, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'K' }, save: {}, canSave: false });
    const outer = `<!doctype html><meta charset=utf-8><body style="margin:0"><iframe id=f sandbox="${SANDBOX}" src="${HOST}/frame?okGov=off&okBackend=paper" style="border:0;width:100vw;height:100vh;display:block"></iframe>`;
    const seen = [], errors = [];
    await ctx.route('**/*', route => {
      const u = route.request().url(); seen.push(u);
      if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: outer });
      if (u.startsWith(HOST + '/frame')) return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
      const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
      if (f) return route.fulfill({ status: 200, headers: { 'content-type': { js: 'text/javascript', webp: 'image/webp', woff2: 'font/woff2' }[f.split('.').pop()] || 'application/octet-stream', 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' }, body: fs.readFileSync(f) });
      return route.fulfill({ status: 404, body: '' });
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error' || /\[oomba\]/.test(m.text())) errors.push(m.text()); });
    await p.goto(HOST + '/', { waitUntil: 'load' });
    const frame = p.frames().find(f => f.url().startsWith(HOST + '/frame'));
    await frame.waitForFunction(() => { const X = window.__brbTest; if (!X || !X.state) return false; const s = X.state().scene; if (s !== 'play' && X.start) X.start(); return s === 'play'; }, null, { timeout: 90_000, polling: 400 });
    await frame.waitForFunction(() => window.Oomba2D.friendsNow.length >= 1, null, { timeout: 60_000, polling: 300 });
    const now = await frame.evaluate(() => ({ list: window.Oomba2D.friendsNow, v: window.Oomba2D.version, score: window.__brbTest.state().score || 0 }));
    assert.deepEqual(errors, [], 'no errors, no unknown sprite, nothing refused by the CSP');
    assert.equal(now.v, '1.1.0');
    assert.ok(now.list.length >= 1 && now.list.length <= 4, `${now.list.length} friends drawn`);
    for (const f of now.list) { assert.ok(friends.includes(f.id)); assert.equal(f.solid, false); }
    const art = seen.filter(u => u.includes('/vendor/art2d/')).map(u => u.replace(HOST + '/vendor/art2d/', ''));
    assert.ok(art.includes('oomba2d/1.1.0/oomba2d.js') && art.includes(`animals/${S.ART2D_PACKS.animals}/fox.webp`) && art.some(u => /^(animals|heroes)\/1\.\d\.0\/(zebra|knight|cow|stegosaurus)\.webp$/.test(u)), 'the friends\' own pictures, from the locked packs');
    assert.ok(art.every(u => /^(oomba2d\/1\.1\.0\/oomba2d\.js|(castle-quest|heroes)\/1\.0\.0\/[a-z0-9-]+\.(webp|js)|animals\/1\.1\.0\/[a-z0-9-]+\.(webp|js))$/.test(u)), 'nothing else is fetched (the animals pack is 1.1.0 since the sea animals joined)');
    await ctx.close();
  });
}
