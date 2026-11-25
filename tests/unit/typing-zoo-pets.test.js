// Typing Zoo's pets that walk (seed-games/typing-zoo.html, docs/decisions.md "Typing Zoo: pets that walk"):
//   - the pictures: every pet in PETS has its Noto picture in the pinned /vendor/data pack, animated loops pinned too;
//   - the save: an old save (no `out`, no `walkOff`) loads as before, its pets and lessons kept, and the latest pet walks;
//     a pet picked in the collection ("Walk with me") is kept, and the teacher's summary reads the new save the same;
//   - reduced motion: the pet stands still (no walking, no following), whatever the pointer does;
//   - the lane: at 390 and 1280 px wide, following a pointer and while typing, the pet never overlaps the typing line,
//     the keyboard or any button, and it never takes a click.
// The browser tests run in real Chromium inside the production game frame; they are skipped when there is none.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const PP = await import('../../server/services/play-params.js');
const TY = await import('../../server/services/typing.js');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/typing-zoo.html'), 'utf8');
const PET_IDS = [...HTML.match(/const PETS = \[([\s\S]*?)\n\];/)[1].matchAll(/\['([a-z]+)', '/g)].map(m => m[1]);

test('every pet is a full-body Noto animal, vendored and pinned, with its animated loop where Google made one', () => {
  assert.ok(PET_IDS.length >= 41 && PET_IDS[PET_IDS.length - 1] === 'alpaca', 'new pets go at the end (old saves keep theirs)');
  assert.equal(PET_IDS[0], 'bunny'); assert.equal(new Set(PET_IDS).size, PET_IDS.length);
  assert.doesNotMatch(HTML, /PET ART START|<svg class="pa/, 'no hand-drawn art left');
  const ver = /const ART_VER = '([^']+)', ART_SRI = '([^']+)'/.exec(HTML), anim = JSON.parse(/const ANIM_SRI = (\{[^;]*\});/.exec(HTML)[1]);
  const root = path.join(ROOT, 'public/vendor/data/typing-zoo-art'), dir = path.join(root, ver[1]);
  assert.deepEqual(fs.readdirSync(root), [ver[1]], 'one version folder, the pinned one');
  const sri = f => 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(path.join(dir, f))).digest('base64');
  assert.equal(sri('art.js'), ver[2], 'art.js matches its pin');
  const win = {}; vm.runInNewContext(fs.readFileSync(path.join(dir, 'art.js'), 'utf8'), { window: win });
  assert.deepEqual(Object.keys(win.__tzArt).sort(), [...PET_IDS].sort(), 'a picture for every pet, and none extra');
  for (const [id, u] of Object.entries(win.__tzArt)) {
    const b = Buffer.from(u.replace(/^data:image\/webp;base64,/, ''), 'base64');
    assert.ok(u.startsWith('data:image/webp;base64,') && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP', `${id}: a WebP`);
    assert.ok(b.length < 16000, `${id}: small (${b.length} bytes)`);
  }
  assert.ok(Object.keys(anim).length >= 25, 'animated loops for most pets');
  for (const [id, pin] of Object.entries(anim)) {
    assert.ok(PET_IDS.includes(id), id);
    assert.equal(sri(`a-${id}.js`), pin, `a-${id}.js matches its pin`);
    const w = {}; vm.runInNewContext(fs.readFileSync(path.join(dir, `a-${id}.js`), 'utf8'), { window: w });
    assert.match(w.__tzAnim[id], /^data:image\/webp;base64,UklGR/, id);
    assert.ok(fs.statSync(path.join(dir, `a-${id}.js`)).size < 300_000, `${id}: the loop stays small`);
  }
  assert.deepEqual(fs.readdirSync(dir).filter(f => !/^(art\.js|a-[a-z]+\.js|LICENSE\.txt|NOTICE\.md)$/.test(f)), [], 'nothing else in the folder');
  const lic = fs.readFileSync(path.join(dir, 'LICENSE.txt'), 'utf8'), notice = fs.readFileSync(path.join(dir, 'NOTICE.md'), 'utf8');
  assert.match(lic, /Apache License, Version 2\.0/); assert.match(lic, /Creative Commons Attribution 4\.0/);
  for (const id of PET_IDS) assert.match(notice, new RegExp(`\\| ${id} \\|`), `NOTICE.md: ${id}`);
  assert.match(fs.readFileSync(path.join(ROOT, 'docs/media-credits.md'), 'utf8'), /typing-zoo-art/);
  assert.match(HTML, /"artCredit":"Animal art: Noto Emoji by Google, CC BY 4\.0"/, 'the credit in the game');
  // The pets that became other animals map to pets that exist; the pictures that face right or at us are real pets.
  const renamed = JSON.parse(/const PET_RENAMED = (\{[^}]*\});/.exec(HTML)[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
  for (const [was, now] of Object.entries(renamed)) { assert.ok(PET_IDS.includes(now), now); assert.ok(!PET_IDS.includes(was), was); }
  const face = JSON.parse(/const ART_FACE = (\{[^}]*\});/.exec(HTML)[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
  for (const id of Object.keys(face)) assert.ok(PET_IDS.includes(id), id);
});

test('the teacher\'s summary reads a save with the walking pet the same as before', () => {
  const old = { v: 1, done: { l01: { s: 3, w: 14, a: 96, n: 1, t: 1 } }, pets: { fox: { s: 0, n: 1, t: 5 } }, keys: {}, secs: 60, last: 5 };
  assert.deepEqual(TY.summarize({ ...old, out: 'fox', walkOff: 1 }), TY.summarize(old));
});

// ---------------------------------------------------------------------------------------------- in the browser
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
async function open({ width = 1280, height = 800, save = null, reducedMotion = 'no-preference', touch = false } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Typing Zoo' }, save: save ? { [TY.SAVE_KEY]: JSON.stringify(save) } : {}, canSave: false, params: PP.parseParams(''), tts: { langs: [] } });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>` });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);   // the pinned pictures, from disk as the site serves them
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    return route.abort();
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__brbTest && document.querySelector('.tile'), null, { timeout: 30_000 });
  return { ctx, p, frame, errors, walk: () => frame.evaluate(() => window.__brbTest.walk()) };
}
const OLD_SAVE = { v: 1, done: { l01: { s: 3, w: 12, a: 97, n: 1, t: 1000 }, l02: { s: 2, w: 15, a: 90, n: 2, t: 2000 } },
  pets: { bunny: { s: 0, n: 1, t: 1000 }, tiger: { s: 1, n: 1, t: 3000 }, owl: { s: 0, n: 1, t: 2000 }, fox: { s: 0, n: 2, t: 1500 } }, keys: { f: [20, 1] }, tests: {}, practice: { n: 0, t: 0 }, custom: {}, days: {}, secs: 120, last: 3000, pack: '' };
/** Boxes that overlap (with a little air between them counted as touching). */
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('an old save loads as before; the latest pet walks; "Walk with me" picks another and is kept', { skip, timeout: 120_000 }, async () => {
  const { ctx, frame, errors, walk } = await open({ save: OLD_SAVE });
  const s = await frame.evaluate(() => window.__brbTest.save());
  assert.deepEqual(Object.keys(s.pets).sort(), ['bunny', 'giraffe', 'owl', 'tiger'], 'the fox is the giraffe now');
  assert.deepEqual(s.pets.giraffe, OLD_SAVE.pets.fox);
  assert.deepEqual(s.done.l02, OLD_SAVE.done.l02);
  assert.equal(s.out, ''); assert.equal(s.walkOff, 0);
  assert.equal((await walk()).id, 'tiger', 'the latest hatched pet is out');
  await frame.waitForFunction(() => document.querySelector('#walker .pa.ready img[src^="data:image/webp"]'), null, { timeout: 15_000 });
  assert.match(await frame.evaluate(() => document.querySelector('#walker .pa').className), /shiny/, 'shiny, as it hatched');
  await frame.waitForFunction(() => document.querySelector('#walker .pa.anim'), null, { timeout: 15_000 });   // the tiger's animated loop
  await frame.evaluate(() => window.__brbTest.pets());
  assert.equal(await frame.locator('.petcard.locked').count(), PET_IDS.length - 4, 'locked pets are silhouettes');
  await frame.locator('[data-walk="owl"]').click();
  assert.equal((await walk()).id, 'owl');
  assert.equal(await frame.evaluate(() => window.__brbTest.save().out), 'owl', 'kept in the save');
  assert.equal(await frame.locator('[data-walk="owl"]').getAttribute('aria-pressed'), 'true');
  await frame.locator('[data-go="walkToggle"]').click();
  assert.equal((await walk()).hidden, true, 'the walking pet can be turned off');
  assert.equal(await frame.evaluate(() => window.__brbTest.save().walkOff), 1);
  const fresh = await open({});
  assert.equal((await fresh.walk()).hidden, true, 'no pet yet: no lane');
  assert.deepEqual([...errors, ...fresh.errors], []);
  await ctx.close(); await fresh.ctx.close();
});

test('reduced motion: the pet stands still, whatever the pointer does', { skip, timeout: 120_000 }, async () => {
  const { ctx, p, frame, errors, walk } = await open({ save: OLD_SAVE, reducedMotion: 'reduce' });
  const before = await walk();
  assert.equal(before.calm, true); assert.equal(before.running, false);
  for (const x of [1200, 600, 40, 900]) { await p.mouse.move(x, 60, { steps: 4 }); await p.waitForTimeout(250); }
  const after = await walk();
  assert.equal(after.x, before.x, 'it did not follow'); assert.equal(after.moving, false);
  await frame.waitForFunction(() => document.querySelector('#walker .pa.ready'), null, { timeout: 15_000 });
  assert.equal(await frame.evaluate(() => getComputedStyle(document.querySelector('#walker .pa-in')).animationName), 'none', 'no breathing or bobbing');
  assert.equal(await frame.evaluate(() => document.querySelector('#walker .pa').classList.contains('anim')), false, 'the still picture, not the animated loop');
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const [width, height] of [[390, 844], [1280, 800]]) {
  test(`${width} px: following the pointer and while typing, the pet never covers the line, the keyboard or a button`, { skip, timeout: 180_000 }, async () => {
    const { ctx, p, frame, errors, walk } = await open({ save: OLD_SAVE, width, height, touch: width < 500 });
    const rects = () => frame.evaluate(() => {
      const r = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
      const pet = document.querySelector('#walker');
      return { pet: r(pet), pe: getComputedStyle(pet).pointerEvents, line: document.querySelector('#line') && r(document.querySelector('#line')),
        kb: document.querySelector('.kb') && r(document.querySelector('.kb')), buttons: [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(r) };
    });
    const check = async what => {
      const R = await rects();
      assert.equal(R.pe, 'none', 'never takes a click');
      for (const [name, box] of [['the line', R.line], ['the keyboard', R.kb]]) if (box) assert.ok(!overlap(R.pet, box), `${what}: over ${name}`);
      for (const b of R.buttons) assert.ok(!overlap(R.pet, b), `${what}: over a button at ${Math.round(b.x)},${Math.round(b.y)}`);
    };
    // A tap lands on the lane's own strip (a tap elsewhere would press a button); a mouse goes anywhere.
    const laneY = await frame.evaluate(() => { const b = document.querySelector('#petLane').getBoundingClientRect(); return b.y + b.height / 2; });
    const tap = async (x, y) => { if (width < 500) await p.touchscreen.tap(x, laneY); else await p.mouse.move(x, y, { steps: 6 }); };
    // The map, then a lesson being typed: the pointer swept across the whole screen, the pet checked as it walks.
    const sweep = async what => {
      const pts = [[width - 10, 30], [10, height / 2], [width / 2, height - 20], [width - 30, height * 0.7], [20, 100]];
      for (const [x, y] of pts) {
        await tap(x, y);
        for (let i = 0; i < 6; i++) { await p.waitForTimeout(180); await check(`${what} (${x},${y})`); }
      }
    };
    await sweep('map');
    await frame.evaluate(() => window.__brbTest.type('l03'));
    await sweep('lesson');
    // It follows: the pointer far to one side, the pet walks there (left and right only).
    const y0 = (await rects()).pet.y, petW = (await rects()).pet.width, laneW = await frame.evaluate(() => document.querySelector('#petLane').clientWidth);
    await tap(width - 5, 200);
    await frame.waitForFunction(w => { const s = window.__brbTest.walk(); return !s.moving && s.x > w - 84 - 30; }, laneW, { timeout: 30_000 });
    const right = await walk();
    assert.equal(right.dir, 1, 'facing its way');
    await tap(5, 300);
    await frame.waitForFunction(() => { const s = window.__brbTest.walk(); return !s.moving && s.x < 30; }, null, { timeout: 30_000 });
    const left = await walk();
    assert.equal(left.dir, -1, 'facing its way');
    assert.equal((await rects()).pet.y, y0, 'never up or down the screen');
    // Typing: it settles at the end of the lane and cheers, still clear of everything.
    for (let i = 0; i < 90 && (await walk()).x <= laneW - petW - 4; i++) {
      await frame.evaluate(() => { const c = document.querySelector('#line .cur'); const all = [...document.querySelectorAll('#line span')]; const ch = all.map(s => s.classList.contains('sp') ? ' ' : s.textContent).join('')[all.indexOf(c)]; document.dispatchEvent(new KeyboardEvent('keydown', { key: ch === '·' ? ' ' : ch })); });
      await p.waitForTimeout(150); await check(`typing ${i}`);
    }
    const settled = await walk();
    assert.ok(settled.x > laneW - petW - 4, `settled beside the line's end (${settled.x} of ${laneW})`);
    await frame.evaluate(() => window.__brbTest.typeAll());
    await check('lesson done');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
