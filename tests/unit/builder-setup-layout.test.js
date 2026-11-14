// The setup steps in a real browser (/build/new): every card on a screen is exactly the same size (width, height and
// picture) at 390, 834 and 1280 wide, nothing scrolls sideways, targets are at least 44 px, the world's close-up view
// is a proper dialog, a world limits who can be picked, the plan marks what is made from scratch, and both ways out
// (the bypass and "Open the Builder") end in the Studio. Skipped when no Chromium is installed.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-setup-layout-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.builderFullForAll = false; config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { loadChat } = await import('../../server/builder/chat.js');
const runner = await import('../../server/builder/runner.js');
const games = await import('../../server/services/games.js');
const kit2 = await import('../../server/builder/kit2.js');
const plan = await import('../../server/builder/plan.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;

let server, BASE, browser, n = 0;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
/** A signed-in page on /build/new at this width. */
async function open(width, height = 844, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, ...extra });
  const page = await ctx.newPage();
  const r = await page.request.post(`${BASE}/api/auth/signup`, { data: { username: `Layout${'ABCDEFGHIJKLMNOP'[n++]}`, password: 'secret12' } });
  assert.equal(r.status(), 200, await r.text());
  await page.goto(`${BASE}/build/new`);
  return { ctx, page };
}
const next = page => page.click('.su-screen:not([hidden]) [data-go="next"]');
const STEP_KEYS = ['type', 'look', 'world', 'chars', 'learn', 'extras'];
/** The boxes of the cards and pictures on the screen that shows now, plus the page's own measures. */
const measure = page => page.evaluate(() => {
  const scr = document.querySelector('.su-screen:not([hidden])'), box = el => { const r = el.getBoundingClientRect(); return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10, r.left, r.right]; };   // to a tenth of a pixel (thirds of a row differ in the last float digit)
  const small = [...scr.querySelectorAll('button, a[href], input:not(.sr-only)'), document.querySelector('#su-skipall')].filter(el => el && el.offsetParent !== null).map(el => ({ t: (el.textContent || el.id).trim().slice(0, 30), h: el.getBoundingClientRect().height })).filter(x => x.h < 44);
  return {
    key: scr.dataset.screen, cards: [...scr.querySelectorAll('.su-card')].map(box), pics: [...scr.querySelectorAll('.su-card .su-pic')].map(box),
    names: [...scr.querySelectorAll('.su-card .su-name')].map(box), clipped: [...scr.querySelectorAll('.su-card .su-name')].filter(el => el.scrollHeight > el.clientHeight + 1).map(el => el.textContent),
    scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, small,
    left: Math.min(...[...scr.children].filter(el => el.offsetParent !== null).map(el => el.getBoundingClientRect().left)), right: Math.max(...[...scr.children].filter(el => el.offsetParent !== null).map(el => el.getBoundingClientRect().right)),
  };
});

for (const width of [390, 834, 1280]) {
  test(`at ${width} wide every card on a screen is exactly the same size, with 16 px gutters and no sideways scroll`, { skip }, async () => {
    const { ctx, page } = await open(width);
    const start = await page.evaluate(() => [...document.querySelectorAll('.su-way')].map(el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }));
    assert.deepEqual(start[0], start[1], 'the two ways to start are equal');
    await page.click('#su-guide');
    for (const key of STEP_KEYS) {
      await page.waitForSelector(`.su-screen[data-screen="${key}"]:not([hidden])`);
      if (key === 'world') await page.evaluate(() => Promise.all([...document.querySelectorAll('.su-screen:not([hidden]) img')].map(i => { i.loading = 'eager'; return i.decode().catch(() => {}); })));
      const m = await measure(page);
      assert.equal(m.key, key);
      assert.ok(m.scrollW <= m.clientW, `${key}: no horizontal scroll (${m.scrollW} > ${m.clientW})`);
      assert.ok(m.left >= 15.5 && m.right <= width - 15.5, `${key}: 16 px side gutters (${m.left} .. ${m.right})`);
      assert.deepEqual(m.small, [], `${key}: every target is at least 44 px tall`);
      if (key === 'extras') { await next(page); continue; }
      const want = { type: 9, look: 3, world: kit2.KIT2_WORLDS.length + 1, chars: plan.SETUP_CHARACTERS.length + 1, learn: 6 }[key];
      assert.equal(m.cards.length, want, `${key}: ${want} cards`); assert.equal(m.pics.length, want);
      const sizes = list => [...new Set(list.map(b => `${b[0]}x${b[1]}`))];
      assert.equal(sizes(m.cards).length, 1, `${key}: all cards one size at ${width}, got ${sizes(m.cards).join(' / ')}`);
      assert.equal(sizes(m.pics).length, 1, `${key}: all pictures one size at ${width}, got ${sizes(m.pics).join(' / ')}`);
      assert.equal(sizes(m.names).length, 1, `${key}: all names one size`);
      assert.deepEqual(m.clipped, [], `${key}: no English name is cut off`);
      if (key === 'world') assert.ok(m.pics[0][0] >= 280, `world pictures are large (${m.pics[0][0]} px wide at ${width})`);
      if (key === 'chars') assert.equal(`${m.pics[0][0]}x${m.pics[0][1]}`, '96x96', 'character pictures at their real size');
      // "Select all" (the sections that have one) changes no card's size, fits the phone and is a full-size target
      for (const b of await page.$$('.su-screen:not([hidden]) .su-all:not([hidden])')) {
        await b.click();
        const box = await b.boundingBox(); assert.ok(box.height >= 44 && box.x >= 15.5 && box.x + box.width <= width - 15.5, `${key}: Select all is a 44 px target inside the gutters`);
        const m3 = await measure(page);
        assert.equal(sizes(m3.cards).join(), sizes(m.cards).join(), `${key}: Select all changes no card's size`);
        assert.ok(m3.scrollW <= m3.clientW, `${key}: no horizontal scroll with Select all`); assert.deepEqual(m3.small, []);
        await b.click();   // Clear all: back to nothing picked
      }
      if (key === 'chars' || key === 'learn') assert.ok((await page.$$('.su-screen:not([hidden]) .su-all:not([hidden])')).length >= 1, `${key} has Select all`);
      // a picked card and an open "Something else" box change no card's size
      await page.click(`.su-pick[data-step="${key}"]:not([data-id="else"])`);
      if (key !== 'look') { await page.click(`.su-pick[data-step="${key}"][data-id="else"]`); assert.equal(await page.isVisible(`#su-idea-${key}`), true); }
      const m2 = await measure(page);
      assert.equal(sizes(m2.cards).join(), sizes(m.cards).join(), `${key}: picking changes no size`);
      await next(page);
    }
    await page.waitForSelector('.su-screen[data-screen="plan"]:not([hidden])');
    const p = await measure(page);
    assert.ok(p.scrollW <= p.clientW && p.left >= 15.5 && p.right <= width - 15.5); assert.deepEqual(p.small, []);
    await ctx.close();
  });
}

test('the words of every language keep the cards one size (text is clamped, never grows a card)', { skip }, async () => {
  const { ctx, page } = await open(390);
  for (const lang of ['de', 'ru', 'ar', 'ja']) {
    await page.goto(`${BASE}/build/new?lang=${lang}`); await page.click('#su-guide');
    for (const key of STEP_KEYS.slice(0, 5)) {
      const m = await measure(page);
      assert.equal(new Set(m.cards.map(b => `${b[0]}x${b[1]}`)).size, 1, `${lang} ${key}`);
      assert.ok(m.scrollW <= m.clientW, `${lang} ${key}: no horizontal scroll`);
      await next(page);
    }
  }
  await ctx.close();
});

test('a world\'s Preview is a proper dialog: big picture, name, a line about it, Choose this world and Close', { skip }, async () => {
  const { ctx, page } = await open(1280, 800);
  await page.click('#su-guide'); await next(page); await next(page);
  const btn = page.locator('[data-preview="wild-woods"]');
  assert.equal(await btn.getAttribute('aria-label'), 'Preview Wild Woods');
  await btn.focus(); await page.keyboard.press('Enter');
  const dlg = page.locator('[role="dialog"][aria-modal="true"]'); await dlg.waitFor();
  assert.equal(await dlg.locator('#sheet-title').textContent(), 'Wild Woods');
  assert.equal(await dlg.getAttribute('aria-labelledby'), 'sheet-title');
  assert.match(await dlg.locator('.su-zoom-d').textContent(), /sunny forest/);
  const big = dlg.locator('.su-zoom-big');
  await big.evaluate(i => i.decode());
  const pic = await big.evaluate(i => ({ nw: i.naturalWidth, nh: i.naturalHeight, w: i.getBoundingClientRect().width, alt: i.alt, src: i.getAttribute('src') }));
  assert.deepEqual([pic.nw, pic.nh], [1280, 720], 'a real large picture, not the cover scaled up');
  assert.ok(pic.w >= 900 && pic.w <= pic.nw, `shown large and never above its real size (${pic.w})`);
  assert.equal(pic.src, '/img/kit2/worlds/wild-woods-preview.webp'); assert.match(pic.alt, /Wild Woods/);
  assert.equal(await dlg.locator('.su-zoom-cover').evaluate(i => i.getAttribute('src')), `/vendor/themes/wild-woods/${kit2.worldById('wild-woods').version}/cover.webp`);
  assert.ok(await dlg.evaluate(d => d.contains(document.activeElement)), 'focus moves into the dialog');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); assert.ok(await dlg.evaluate(d => d.contains(document.activeElement)), 'Tab stays inside'); }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[role="dialog"]').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.preview), 'wild-woods', 'focus goes back to the Preview button');
  assert.equal(await page.getAttribute('.su-pick[data-step="world"][data-id="wild-woods"]', 'aria-pressed'), 'false', 'Close picks nothing');
  await btn.click(); await page.click('[data-zclose]'); assert.equal(await page.locator('[role="dialog"]').count(), 0);
  await btn.click(); await page.click('[data-zchoose]');
  assert.equal(await page.locator('[role="dialog"]').count(), 0);
  assert.equal(await page.getAttribute('.su-pick[data-step="world"][data-id="wild-woods"]', 'aria-pressed'), 'true');
  // on a phone the close-up is as wide as the screen allows
  const phone = await open(390);
  await phone.page.click('#su-guide'); await next(phone.page); await next(phone.page);
  await phone.page.click('[data-preview="castle-quest"]');
  const w = await phone.page.locator('.su-zoom-big').evaluate(i => i.getBoundingClientRect().width);
  assert.ok(w >= 340, `the phone picture is ${w} px wide`);
  await phone.ctx.close(); await ctx.close();
});

test('a world limits who is in it (said on the card), "Coming soon" groups cannot be picked, and 2D lifts the limit honestly', { skip }, async () => {
  const { ctx, page } = await open(834);
  await page.click('#su-guide'); await next(page);
  await page.click('.su-pick[data-step="look"][data-id="3d"]'); await next(page);
  await page.click('.su-pick[data-step="world"][data-id="castle-quest"]'); await next(page);
  const card = id => page.locator(`.su-pick[data-step="chars"][data-id="${id}"]`);
  assert.equal(await card('fox').isDisabled(), false); assert.equal(await card('fox').locator('.su-desc').textContent(), 'Lives in Castle Quest');
  assert.equal(await card('cow').isDisabled(), true); assert.equal(await card('cow').locator('.su-desc').textContent(), 'Not in Castle Quest yet');
  assert.equal(await card('knight').locator('.su-desc').textContent(), 'Hero');
  assert.equal(await page.locator('.su-group[data-group="sea"] .su-pick').count(), 0);
  assert.match(await page.locator('.su-group[data-group="sea"]').textContent(), /Fish and sea animals\s*Coming soon/);
  // the dinosaurs live in Dino Valley (3D since its 1.0.0): the group is no longer "Coming soon in 3D", and at the
  // castle a dinosaur is simply an animal of another world; the zebra is still a 2D sprite only
  assert.doesNotMatch(await page.locator('.su-group[data-group="dinosaurs"] h2').textContent(), /Coming soon/);
  assert.equal(await card('triceratops').isDisabled(), true); assert.equal(await card('triceratops').locator('.su-desc').textContent(), 'Not in Castle Quest yet');
  assert.equal(await card('zebra').isDisabled(), true); assert.equal(await card('zebra').locator('.su-desc').textContent(), 'Only in 2D games so far');
  await card('fox').click(); assert.equal(await card('fox').getAttribute('aria-pressed'), 'true');
  // back to another world: the fox does not live there, so it is taken out again
  await page.click('.su-screen:not([hidden]) [data-go="back"]');
  await page.click('.su-pick[data-step="world"][data-id="medieval-village"]'); await next(page);
  assert.equal(await card('fox').getAttribute('aria-pressed'), 'false'); assert.equal(await card('fox').isDisabled(), true);
  assert.equal(await card('cow').isDisabled(), false);
  // no world picked: animals of two different worlds cannot both be promised
  await page.click('.su-screen:not([hidden]) [data-go="back"]');
  await page.click('.su-pick[data-step="world"][data-id="medieval-village"]'); await next(page);
  await card('cow').click();
  assert.equal(await card('fox').isDisabled(), true); assert.equal(await card('fox').locator('.su-desc').textContent(), 'Lives in a different world');
  // 2D: the sprite characters, dinosaurs too, in any world; one of them, because a 2D game draws one
  assert.equal(await page.isVisible('#su-chars-2d'), false);
  await page.click('.su-screen:not([hidden]) [data-go="back"]'); await page.click('.su-screen:not([hidden]) [data-go="back"]');
  await page.click('.su-pick[data-step="look"][data-id="2d"]'); await next(page);
  assert.equal(await page.isVisible('#su-world-2d'), false, 'no kind of game picked: a running game, which draws worlds'); await next(page);
  assert.equal(await card('cow').getAttribute('aria-pressed'), 'true', 'a pick that still fits is kept');
  assert.equal(await page.isVisible('.su-group[data-group="dinosaurs"] [data-soon3d]'), false);
  // 2D: as many as they like; the first one picked is who they play as, and its card says so
  assert.equal(await card('cow').locator('.su-desc').textContent(), 'You play as this one');
  for (const id of ['fox', 'triceratops', 'zebra', 'knight']) { assert.equal(await card(id).isDisabled(), false, id); await card(id).click(); assert.equal(await card(id).getAttribute('aria-pressed'), 'true', id); }
  assert.equal(await card('fox').locator('.su-desc').textContent(), ''); assert.equal(await card('cow').locator('.su-desc').textContent(), 'You play as this one');
  await card('cow').click();   // the player is taken out: the next one picked plays
  assert.equal(await card('fox').locator('.su-desc').textContent(), 'You play as this one');
  assert.equal(await page.locator('.su-pick[data-step="chars"]:disabled').count(), 0, 'nothing is blocked in 2D');
  // a quiz in 2D does not draw worlds or characters yet: the page says so on the world, the characters and the plan
  for (let i = 0; i < 3; i++) await page.click('.su-screen:not([hidden]) [data-go="back"]');
  await page.click('.su-pick[data-step="type"][data-id="quiz"]'); await next(page); await next(page);
  assert.equal(await page.isVisible('#su-world-2d'), true);
  assert.match(await page.textContent('#su-world-2d'), /Only running and catching games can use our worlds and characters in 2D so far/);
  await next(page); assert.equal(await page.isVisible('#su-chars-2d'), true);
  await next(page); await next(page); await next(page); assert.equal(await page.isVisible('#su-plan-2d'), true);
  // back to 3D: the zebra (a 2D sprite only) is taken out again
  await page.click('[data-change="look"]'); await page.click('.su-pick[data-step="look"][data-id="3d"]'); await next(page);
  assert.doesNotMatch(await page.textContent('#su-rows'), /Zebra/); assert.equal(await page.isVisible('#su-plan-2d'), false);
  await ctx.close();
});

test('"Select all" per section: picks what can be picked, reads "Clear all" when done, and in 3D keeps to one world', { skip }, async () => {
  const { ctx, page } = await open(390);
  const all = scope => page.locator(`.su-all[data-all="${scope}"]`), live = () => page.textContent('#su-live');
  const picked = group => page.locator(`.su-group[data-group="${group}"] .su-pick[aria-pressed="true"]`).count();
  const settle = () => page.waitForTimeout(80);
  await page.click('#su-guide'); await next(page);
  // 2D: everyone in the group, with the keyboard; the first is the player; Clear all clears this group only
  await page.click('.su-pick[data-step="look"][data-id="2d"]'); await next(page); await next(page);
  const farm = plan.characterGroups().find(g => g.id === 'farm').items.filter(c => c.in2d).length;
  assert.equal(await all('chars:farm').textContent(), 'Select all'); assert.equal(await all('chars:farm').getAttribute('aria-label'), 'Select all: Farm animals');
  assert.equal(await all('chars:farm').getAttribute('aria-pressed'), 'false');
  await all('chars:farm').focus(); await page.keyboard.press('Enter'); await settle();
  assert.equal(await picked('farm'), farm); assert.equal(await live(), `${farm} picked`);
  assert.equal(await all('chars:farm').textContent(), 'Clear all'); assert.equal(await all('chars:farm').getAttribute('aria-pressed'), 'true'); assert.equal(await all('chars:farm').getAttribute('aria-label'), 'Clear all: Farm animals');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.all), 'chars:farm', 'focus stays on the button');
  assert.equal(await page.locator('.su-group[data-group="farm"] .su-pick[aria-pressed="true"] .su-desc', { hasText: 'You play as this one' }).count(), 1);
  await all('chars:dinosaurs').click(); await all('chars:heroes').click(); await settle();
  assert.equal(await picked('dinosaurs'), 5); assert.ok(await picked('heroes') >= 9);
  await page.keyboard.press('Space');   // nothing: focus is on the heroes button, pressed -> clears heroes only
  await settle(); assert.equal(await picked('heroes'), 0); assert.equal(await picked('farm'), farm); assert.equal(await picked('dinosaurs'), 5); assert.equal(await live(), 'Cleared');
  // one card un-picked by hand: the button offers "Select all" again
  await page.click('.su-pick[data-step="chars"][data-id="pig"]'); assert.equal(await all('chars:farm').textContent(), 'Select all');
  await all('chars:farm').click(); await settle(); assert.equal(await picked('farm'), farm);
  assert.equal(await page.getAttribute('.su-pick[data-step="chars"][data-id="else"]', 'aria-pressed'), 'false', 'never "Something else"');
  // the plan and the Builder get every one of them
  await next(page);
  await all('learn').click(); await settle();
  assert.equal(await page.locator('.su-pick[data-step="learn"][aria-pressed="true"]').count(), 5); assert.equal(await page.getAttribute('.su-pick[data-step="learn"][data-id="else"]', 'aria-pressed'), 'false');
  assert.equal(await all('learn').textContent(), 'Clear all'); assert.equal(await all('learn').getAttribute('aria-label'), 'Clear all: It teaches');
  await all('learn').click(); await settle(); assert.equal(await page.locator('.su-pick[data-step="learn"][aria-pressed="true"]').count(), 0);
  // 3D, nothing chosen yet: the largest set of the group that shares one world, and the message names the world
  await page.click('[data-go="back"]:visible'); await page.click('[data-go="back"]:visible'); await page.click('[data-go="back"]:visible');
  await page.click('.su-pick[data-step="look"][data-id="3d"]'); await next(page); await next(page);
  // the picks made for 2D: the sprites that are in no 3D world went, and of the rest only those that share a world stay
  const kept = await page.evaluate(() => [...document.querySelectorAll('.su-pick[data-step="chars"][aria-pressed="true"]')].map(b => b.dataset.id));
  assert.ok(kept.length >= 1 && kept.every(id => plan.setupCharacter(id).in3d)); assert.ok(kit2.WORLD_IDS.some(w => kept.every(id => plan.setupCharacter(id).worlds.includes(w))), `they share a world: ${kept}`);
  assert.equal(await all('chars:farm').textContent(), 'Clear all'); await all('chars:farm').click(); await settle();
  assert.equal(await page.locator('.su-pick[data-step="chars"][aria-pressed="true"]').count(), 0);
  const village = kit2.creaturesOf('medieval-village').filter(c => plan.setupCharacter(c.id).group === 'farm').map(c => c.id).sort();
  await all('chars:farm').click(); await settle();
  const got = await page.evaluate(() => [...document.querySelectorAll('.su-group[data-group="farm"] .su-pick[aria-pressed="true"]')].map(b => b.dataset.id).sort());
  assert.deepEqual(got, village, 'the farm animals of the world that has the most of them');
  assert.equal(await live(), `${village.length} picked. They all live in Medieval Village.`);
  assert.equal(await all('chars:farm').textContent(), 'Clear all', 'everything that can be picked now is picked');
  const horse = page.locator('.su-pick[data-step="chars"][data-id="horse"]');
  assert.equal(await horse.isDisabled(), true); assert.equal(await horse.locator('.su-desc').textContent(), 'Lives in a different world', 'the other-world cards grey out as after single picks');
  // the wild animals live in another world: none can be picked now, so that group has no button
  assert.equal(await all('chars:wild').isHidden(), true); assert.equal(await all('chars:dinosaurs').isHidden(), true);
  // heroes: only those the village has
  await all('chars:heroes').click(); await settle();
  const heroes = await page.evaluate(() => [...document.querySelectorAll('.su-group[data-group="heroes"] .su-pick[aria-pressed="true"]')].map(b => b.dataset.id).sort());
  assert.deepEqual(heroes, kit2.worldById('medieval-village').heroes.map(h => h.id).sort()); assert.match(await live(), /^\d+ picked$/);
  await all('chars:farm').click(); await all('chars:heroes').click(); await settle();
  assert.equal(await page.locator('.su-pick[data-step="chars"][aria-pressed="true"]').count(), 0); assert.equal(await horse.isDisabled(), false);
  // with a world chosen: exactly that world's, and no word about a world
  await page.click('[data-go="back"]:visible'); await page.click('.su-pick[data-step="world"][data-id="castle-quest"]'); await next(page);
  await all('chars:wild').click(); await settle();
  assert.equal(await picked('wild'), kit2.creaturesOf('castle-quest').filter(c => plan.setupCharacter(c.id).group === 'wild').length); assert.match(await live(), /^\d+ picked$/);
  await ctx.close();
});

test('keyboard only: through the steps to the plan; the plan marks custom rows; "Open the Builder" starts the build', { skip }, async () => {
  const { ctx, page } = await open(1280, 800);
  await page.focus('#su-guide'); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'su-h-type', 'a new step moves focus to its heading');
  assert.equal(await page.isVisible('#su-skipall'), true);
  await page.focus('.su-pick[data-step="type"][data-id="else"]'); await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'su-idea-type', '"Something else" opens its text box');
  assert.equal(await page.getAttribute('#su-idea-type', 'aria-describedby'), 'su-note-type');
  assert.match(await page.textContent('#su-note-type'), /not in our packs, so the Builder will make it from scratch/);
  await page.keyboard.type('a maze'); await page.keyboard.press('Enter');
  await page.click('.su-pick[data-step="look"][data-id="3d"]'); await next(page);
  await page.click('.su-pick[data-step="world"][data-id="toy-town"]'); await next(page);
  await page.click('.su-pick[data-step="chars"][data-id="mage"]'); await next(page);
  await page.click('.su-screen:not([hidden]) [data-go="skip"]');                // what it teaches: left blank
  await page.fill('#su-notes', 'add a secret door');
  await page.setInputFiles('#su-file', { name: 'words.txt', mimeType: 'text/plain', buffer: Buffer.from('cat\ndog\n') });
  assert.equal(await page.locator('#su-files li').count(), 1);
  await page.setInputFiles('#su-file', { name: 'drawing.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
  assert.equal(await page.locator('#su-files li').count(), 1, 'a picture is not taken here');
  await next(page);
  await page.waitForFunction(() => /Here is my game plan/.test(document.querySelector('#su-told').textContent));
  const rows = await page.evaluate(() => [...document.querySelectorAll('.su-row')].map(r => [r.querySelector('dt').textContent, r.querySelector('.su-val').textContent, !!r.querySelector('.su-scratch'), r.querySelector('.su-change').getAttribute('aria-label')]));
  assert.deepEqual(rows, [
    ['Game type', 'a maze', true, 'Change: Game type'], ['Look', '3D world', false, 'Change: Look'], ['World', 'Toy Town', false, 'Change: World'],
    ['Characters', 'Wizard', false, 'Change: Characters'], ['It teaches', 'Builder decides', false, 'Change: It teaches'], ['Extras', '1 file · add a secret door', false, 'Change: Extras'],
  ]);
  assert.equal(await page.textContent('.su-row .su-scratch'), 'Made from scratch');
  assert.equal(await page.textContent('#su-told'), 'Here is my game plan. Kind of game: a maze. Make it 3D. World: Toy Town. In it: Wizard. Use the file I added. add a secret door.');
  // Change goes to that step and comes straight back
  await page.click('[data-change="world"]'); await page.waitForSelector('.su-screen[data-screen="world"]:not([hidden])');
  await page.click('.su-pick[data-step="world"][data-id="castle-quest"]'); await next(page);
  await page.waitForFunction(() => /Castle Quest/.test(document.querySelector('#su-told').textContent));
  await Promise.all([page.waitForURL(/\/studio\/[\w-]+$/), page.click('#su-open')]);
  const id = page.url().split('/').pop();
  await runner.idle(id);
  const chat = loadChat(id).messages, first = chat[0];
  assert.deepEqual(first.plan, { v: 1, type: { from: 'custom', text: 'a maze' }, look: '3d', world: { from: 'pack', id: 'castle-quest' }, characters: [{ from: 'pack', id: 'mage' }], learn: [], notes: 'add a secret door' });
  assert.equal(first.uploads.length, 1); assert.equal(first.uploads[0].name, 'words.txt');
  const k = kit2.kit2Of(games.getVersion(games.getGame(id).current_version_id).html);
  assert.equal(`${k.world} ${k.hero}`, 'castle-quest mage');
  await page.waitForFunction(() => /Here is my game plan/.test(document.querySelector('#st-log').textContent));
  await ctx.close();
});

test('"I know what I want" and "Skip to the Builder" go straight to an empty Studio, as "New game" always did', { skip }, async () => {
  const { ctx, page } = await open(390);
  await Promise.all([page.waitForURL(/\/studio\/[\w-]+$/), page.click('#su-direct')]);
  const id = page.url().split('/').pop();
  assert.deepEqual(loadChat(id).messages, []); assert.equal(games.getGame(id).current_version_id, null);
  assert.equal(await page.inputValue('#st-input'), '');
  await page.goto(`${BASE}/build`); await Promise.all([page.waitForURL(/\/build\/new$/), page.click('#newgame')]);
  await page.click('#su-guide'); await page.click('.su-pick[data-step="type"][data-id="quiz"]'); await next(page);
  await Promise.all([page.waitForURL(/\/studio\/[\w-]+$/), page.click('#su-skipall')]);
  assert.deepEqual(loadChat(page.url().split('/').pop()).messages, [], 'skipping sends nothing');
  // reduced motion is honoured by the site's own rule, and the page has no animation of its own
  assert.ok(!/animation|transition/.test(fs.readFileSync(new URL('../../public/css/build-setup.css', import.meta.url), 'utf8')));
  await ctx.close();
});
