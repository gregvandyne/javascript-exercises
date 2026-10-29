// Oomba Kit art library and UI kit in a real browser, through the real frame wrapper (sandbox + frame CSP): the gallery
// scene shows every character, prop, icon and biome on both backends by day and night (screenshot smoke: each shot is
// attached and must be full of colour), and every standard screen works: title, how-to, countdown, pause, results,
// try-again, settings, the quiz widget, banners, speech bubbles, dialogs and the HUD, in RTL and at phone size.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { login, ADMIN } from './helpers.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

let auth = null;
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, ADMIN.username, ADMIN.password);
  auth = await ctx.storageState(); await ctx.close();
});

async function openGallery(browser, query, ctxOpts = {}) {
  const ctx = await browser.newContext({ storageState: auth, ...ctxOpts });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/kit?' + new URLSearchParams({ scene: 'gallery', ...query }));
  await expect.poll(() => page.frames().some(f => f.url().includes('/kit/frame/gallery')), { timeout: 15000 }).toBe(true);
  const frame = page.frames().find(f => f.url().includes('/kit/frame/gallery'));
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.gallery && window.__brbTest.frameStats().p50 > 0, null, { timeout: 20000 });
  await frame.evaluate(() => window.Oomba.fonts.ready);
  return { ctx, page, frame, errors, csp: () => frame.evaluate(() => window.__csp) };
}
const G = f => f.evaluate(() => window.__brbTest.gallery());
async function shot(k, name, testInfo) {
  const buf = await k.page.locator('#kitframe').screenshot();
  await testInfo.attach(name, { body: buf, contentType: 'image/png' });
  return k.page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; const seen = new Set(); let s = 0, s2 = 0, n = 0; const rgb = [0, 0, 0];
    for (let i = 0; i < d.length; i += 16) { const y = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; s += y; s2 += y * y; n++; rgb[0] += d[i]; rgb[1] += d[i + 1]; rgb[2] += d[i + 2]; seen.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3)); }
    return { colours: seen.size, spread: Math.sqrt(s2 / n - (s / n) ** 2), mean: s / n, rgb: rgb.map(v => v / n) };
  }, buf.toString('base64'));
}

for (const backend of ['paper', 'glaze']) {
  test(`${backend}: the gallery draws every character, prop, icon and biome by day and night, with no errors`, async ({ browser }, testInfo) => {
    test.setTimeout(150_000);
    const k = await openGallery(browser, { backend });
    expect((await k.frame.evaluate(() => window.__brbTest.state())).backend).toBe(backend);
    const counts = {};
    for (const mode of ['day', 'night']) {
      await k.frame.evaluate(m => window.__brbTest.night(m === 'night'), mode);
      for (const tab of ['chars', 'props', 'icons', 'screens']) {
        await k.frame.evaluate(t => window.__brbTest.tab(t), tab);
        await k.page.waitForTimeout(700);
        counts[tab] = await G(k.frame);
        const px = await shot(k, `${backend}-${tab}-${mode}`, testInfo);
        expect(px.colours, `${tab} ${mode} ${JSON.stringify(px)}`).toBeGreaterThan(100);
        expect(px.spread).toBeGreaterThan(10);
      }
      const means = [];
      for (const biome of await k.frame.evaluate(() => window.Oomba.art.biomes)) {
        await k.frame.evaluate(b => window.__brbTest.tab('biomes', b), biome);
        await k.page.waitForTimeout(600);
        expect((await G(k.frame)).biome).toBe(biome);
        const px = await shot(k, `${backend}-biome-${biome}-${mode}`, testInfo);
        expect(px.colours, `${biome} ${mode}`).toBeGreaterThan(100);
        means.push(px.rgb.map(v => Math.round(v / 2)).join('/'));
      }
      expect(new Set(means).size, `biomes look different (${means.join(' ')})`).toBeGreaterThanOrEqual(mode === 'day' ? 6 : 4);
    }
    expect(counts.chars.chars).toBe(12);
    expect(counts.props.props).toBeGreaterThanOrEqual(50);
    expect(counts.icons.icons).toBeGreaterThanOrEqual(40);
    // every clip and mood runs on every character without errors
    await k.frame.evaluate(() => window.__brbTest.tab('chars'));
    for (const clip of await k.frame.evaluate(() => window.Oomba.art.clips)) { await k.frame.evaluate(c => { window.__brbTest.clip(c); window.__brbTest.step(20); }, clip); }
    await k.page.waitForTimeout(300);
    expect(await k.csp()).toEqual([]);
    expect(k.errors).toEqual([]);
    await k.ctx.close();
  });
}

test('screens: title, how-to, countdown, pause, results, try-again, settings, dialog and HUD', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const k = await openGallery(browser, { backend: 'paper', tab: 'screens' });
  const f = k.frame;
  // title: Play is focused; pressing it resolves and calls play()
  await f.evaluate(() => { window.__played = false; window.__t = window.Oomba.ui.title({ title: 'Oomba Meadow', subtitle: 'Collect the sparks', hero: window.Oomba.me(), play: () => { window.__played = true; } }); });
  await expect(f.locator('.ok-title-screen .ok-h1')).toHaveText('Oomba Meadow');
  await expect(f.locator('.ok-title-screen canvas.ok-portrait')).toBeVisible();
  await expect.poll(() => f.evaluate(() => document.activeElement && document.activeElement.textContent)).toContain('Play');
  await shot(k, 'title', testInfo);
  await f.locator('.ok-title-screen .ok-hot').click();
  expect(await f.evaluate(async () => { await window.__t; return window.__played; })).toBe(true);
  // how-to: three cards with icons, Go! closes
  await f.evaluate(() => { window.__h = window.Oomba.ui.howTo([{ icon: 'move', text: 'Move' }, { icon: 'jump', text: 'Jump' }, { icon: 'spark', text: 'Collect' }]); });
  await expect(f.locator('.ok-howcard svg')).toHaveCount(3);
  await f.locator('.ok-howto .ok-hot').click(); await f.evaluate(() => window.__h);
  // countdown resolves
  await f.evaluate(() => window.Oomba.ui.countdown(2));
  await expect(f.locator('.ok-count')).toHaveCount(0);
  // pause: the game loop stops; Escape resumes
  await f.evaluate(() => { window.__p = window.Oomba.ui.pause(); });
  expect(await f.evaluate(() => window.Oomba.time.paused)).toBe(true);
  await shot(k, 'pause', testInfo);
  await f.locator('.ok-pause').press('Escape');
  expect(await f.evaluate(() => window.__p)).toBe('resume');
  expect(await f.evaluate(() => window.Oomba.time.paused)).toBe(false);
  // results: three sparks land, the score rolls to its value, "New best!" appears
  await f.evaluate(() => { window.__w = window.Oomba.ui.win({ stars: 3, score: 1280, best: 990 }); });
  await expect(f.locator('.ok-sparks .ok-on')).toHaveCount(3, { timeout: 10000 });
  await expect(f.locator('.ok-score')).toHaveText('1,280', { timeout: 10000 });
  await expect(f.locator('.ok-badge')).toBeVisible();
  await shot(k, 'win', testInfo);
  await f.locator('.ok-win .ok-hot').click();
  expect(await f.evaluate(() => window.__w)).toBe('next');
  // try-again: never "game over"
  await f.evaluate(() => { window.__a = window.Oomba.ui.tryAgain({ score: 420, best: 990 }); });
  await expect(f.locator('.ok-try .ok-h2')).toHaveText('So close!');
  expect(await f.locator('.ok-ui').textContent()).not.toMatch(/game over/i);
  await f.locator('.ok-try .ok-hot').click();
  expect(await f.evaluate(() => window.__a)).toBe('again');
  // settings: switches and segments change the saved settings
  await f.evaluate(() => { window.__s = window.Oomba.ui.settings(); });
  await f.getByRole('switch', { name: 'Captions' }).click();
  await f.locator('.ok-seg button', { hasText: '150%' }).click();
  expect(await f.evaluate(() => [window.Oomba.settings.captions, window.Oomba.settings.textSize])).toEqual([true, 1.5]);
  await shot(k, 'settings', testInfo);
  await f.locator('.ok-settings .ok-go').click(); await f.evaluate(() => window.__s);
  // dialog returns the pressed button's value
  await f.evaluate(() => { window.__d = window.Oomba.ui.dialog({ title: 'Gate', text: 'Open it?', buttons: [{ label: 'No', value: 'no' }, { label: 'Yes', value: 'yes' }] }); });
  await f.getByRole('button', { name: 'Yes' }).click();
  expect(await f.evaluate(() => window.__d)).toBe('yes');
  // HUD: score rolls, a heart is lost, the timer counts down, progress and combo
  const hud = await f.evaluate(async () => {
    const h = window.Oomba.ui.hud(['score', 'lives', 'timer', 'progress', 'combo', 'count'], { lives: 3, total: 12 });
    h.score.add(5); h.score.add(10); h.lives.lose(); h.timer.start(30); h.progress.set(0.5); h.combo.bump(); h.combo.bump(); h.count.add(3);
    window.__brbTest.step(60);
    return { score: h.score.value, lives: h.lives.value, left: Math.round(h.timer.left), combo: h.combo.value };
  });
  expect(hud).toEqual({ score: 15, lives: 2, left: 29, combo: 2 });
  await expect(f.locator('.ok-scorepill .ok-num')).toHaveText('15', { timeout: 5000 });
  await expect(f.locator('.ok-hearts .ok-lost')).toHaveCount(1);
  await expect(f.locator('.ok-combo')).toHaveText('×2');
  await expect(f.locator('.ok-progress')).toHaveAttribute('aria-valuenow', '50');
  for (const h of await f.$$eval('.ok-ui .ok-btn', bs => bs.filter(b => b.offsetParent).map(b => b.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
  expect(await k.csp()).toEqual([]);
  expect(k.errors).toEqual([]);
  await k.ctx.close();
});

test('quiz widget, banners and speech bubbles; RTL keeps maths left-to-right; phone size', async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const k = await openGallery(browser, { backend: 'paper', tab: 'screens', l: 'ar', mode: 'dark' }, { viewport: { width: 390, height: 844 }, hasTouch: true });
  const f = k.frame;
  expect(await f.locator('.ok-ui').getAttribute('dir')).toBe('rtl');
  // a right answer: mint tile with a check, the game is paused while it is open
  await f.evaluate(() => { window.__q = window.Oomba.ui.ask({ q: '7 × 6 = ?', choices: ['36', '42', '48', '54'], answer: '42' }); });
  expect(await f.locator('.ok-q').getAttribute('dir')).toBe('ltr');
  expect(await f.evaluate(() => window.Oomba.time.paused)).toBe(true);
  await f.locator('.ok-ask').press('2');
  await expect(f.locator('.ok-tile.ok-right')).toHaveCount(1);
  await expect(f.locator('.ok-banner.ok-correct')).toBeVisible();
  expect(await f.evaluate(() => window.__q)).toBe(true);
  // a first miss: a coral mark on the pick and the hint, the right tile NOT marked (another go); a second miss reveals it
  await f.evaluate(() => { window.__q = window.Oomba.ui.ask({ q: '3 + 4 = ?', choices: ['6', '7', '8'], a: 7, hint: 'Count on from 4' }); });
  await f.locator('.ok-tile').first().click();
  await expect(f.locator('.ok-tile.ok-bad')).toHaveCount(1);
  await expect(f.locator('.ok-hint')).toContainText('Count on from 4');
  expect(await f.locator('.ok-tile.ok-right').count()).toBe(0);
  await f.locator('.ok-tile').nth(2).click();
  await expect(f.locator('.ok-tile.ok-right')).toHaveText(/7/);
  await shot(k, 'ask-wrong-ar', testInfo);
  expect(await f.evaluate(() => window.__q)).toBe(false);
  // the value is the answer (a number is never an index): a tap on 42 is right
  await f.evaluate(() => { window.__q = window.Oomba.ui.ask({ q: '7 x 6?', a: 42, choices: [40, 42, 48, 36] }); });
  await f.locator('.ok-tile', { hasText: '42' }).click();
  expect(await f.evaluate(() => window.__q)).toBe(true);
  // a speech bubble over the fox types its text out (by word in Arabic), then a tap closes it
  await f.evaluate(() => { const fox = window.Oomba.debug.kit.stage.entities.find(e => e.kind === 'fox'); window.__b = window.Oomba.ui.bubble(fox, 'مرحباً! هل تساعدني في جمع الشرارات قبل الغروب؟', { readAloud: false }); });
  await expect(f.locator('.ok-bubble')).toBeVisible();
  expect(await f.locator('.ok-bubble .ok-txt').getAttribute('dir')).toBe('rtl');
  await expect(f.locator('.ok-bubble .ok-txt')).toHaveText('مرحباً! هل تساعدني في جمع الشرارات قبل الغروب؟');
  const fox = await f.evaluate(() => { const s = window.Oomba.debug.kit.stage, e = s.entities.find(x => x.kind === 'fox'), p = s.camera.toScreen({ x: e.x, y: e.y - e.size }); return { x: s.fit.offX + p.x * s.fit.k, y: s.fit.offY + p.y * s.fit.k }; });
  const bottom = await f.evaluate(() => document.querySelector('.ok-bubble').getBoundingClientRect().bottom);
  expect(bottom, 'the bubble sits above the speaker').toBeLessThanOrEqual(fox.y + 4);
  await shot(k, 'bubble-ar', testInfo);
  await f.locator('.ok-bubble').click();
  await expect(f.locator('.ok-bubble')).toHaveCount(0);
  await f.evaluate(() => window.__b);
  // the HUD mirrors: the score pill sits at the right edge in RTL
  const box = await f.locator('.ok-scorepill').boundingBox();
  expect(box.x).toBeGreaterThan(390 / 2);
  expect(await f.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await k.csp()).toEqual([]);
  expect(k.errors).toEqual([]);
  await k.ctx.close();
});

for (const [w, h, lang] of [[360, 740, 'ar'], [768, 1024, 'en']]) {
  test(`layout at ${w}x${h}: one tab row and one chip row that never overlap, props at least 40 px, labels at least 14 px`, async ({ browser }, testInfo) => {
    test.setTimeout(60_000);
    const k = await openGallery(browser, { backend: 'paper', tab: 'props', l: lang }, { viewport: { width: w, height: h }, hasTouch: w < 600 });
    const f = k.frame;
    const boxes = async () => f.evaluate(() => [...document.querySelectorAll('.g-bar .g-row, .g-chips .g-row, .ok-hud')].map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cls: e.className }; }));
    const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const tab of ['props', 'chars', 'icons', 'biomes']) {
      await f.evaluate(t => window.__brbTest.tab(t), tab); await k.page.waitForTimeout(400);
      const bs = (await boxes()).filter(b => !/ok-hud/.test(b.cls));
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(overlap(bs[i], bs[j]), `${tab}: ${bs[i].cls} vs ${bs[j].cls}`).toBe(false);
      for (const b of bs) expect(b.h, 'a single row').toBeLessThan(64);
      await shot(k, `layout-${w}-${tab}`, testInfo);
    }
    await f.evaluate(() => window.__brbTest.tab('props')); await k.page.waitForTimeout(300);
    const props = await f.$$eval('.g-grid .g-card', cs => cs.map(c => { const cv = c.querySelector('canvas'), r = cv.getBoundingClientRect(), l = c.querySelector('span'); return { h: r.height, w: r.width, font: parseFloat(getComputedStyle(l).fontSize) }; }));
    expect(props.length).toBeGreaterThanOrEqual(50);
    for (const p of props) { expect(Math.max(p.h, p.w), 'every prop is at least 40 px').toBeGreaterThanOrEqual(40); expect(p.font).toBeGreaterThanOrEqual(14); }
    expect(await f.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(k.errors).toEqual([]);
    await k.ctx.close();
  });
}
