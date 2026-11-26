// Live games in the new look (docs/decisions.md "Live games: the new look"), in real Chromium on a real server (the live
// socket on the shared upgrade listener, as server/index.js): the projector page and a player's page use the site's
// tokens in light and dark (Bricolage Grotesque, the page and card colors, chunky pill buttons with a bottom edge, the
// join code card with its Ink edge); a player on a 390 px phone and on a Chromebook never scrolls sideways and every
// button on the page is a 44 px target; Question Battle's and Brain Board's answers on a phone are 44 px targets too
// (the games themselves through tests/unit/_live-frame-harness.js). Skipped without Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ctx, call, teacher, cookieFor } from './_live.js';
import { skip, exe, openLive, closeBrowser } from './_live-frame-harness.js';

const ITEMS = [{ q: 'Which planet is closest to the sun?', choices: ['Mercury', 'Venus', 'Earth', 'Mars'], answer: 0, secs: 60 }, { q: 'The sun is a star.', choices: ['True', 'False'], answer: 0, secs: 60 }];
const COLORS = {
  light: { bg: 'rgb(244, 241, 230)', card: 'rgb(255, 253, 242)', text: 'rgb(20, 20, 20)', line: 'rgb(226, 221, 203)', press: 'rgb(31, 157, 99)' },
  dark: { bg: 'rgb(20, 20, 20)', card: 'rgb(30, 30, 27)', text: 'rgb(255, 253, 242)', line: 'rgb(54, 53, 47)', press: 'rgb(31, 157, 99)' },
};
let browser = null;
async function getBrowser() {
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); }
  return browser;
}
test.after(async () => { if (browser) await browser.close(); await closeBrowser(); });

/** The look of the page: computed styles of the body, a card and the buttons. */
const lookOf = (page, card) => page.evaluate(sel => {
  const cs = el => (el ? getComputedStyle(el) : null);
  const b = cs(document.body), c = cs(document.querySelector(sel));
  const plain = [...document.querySelectorAll('.lv .btn:not(.btn-primary):not(.btn-danger):not([aria-pressed="true"]):not([hidden])')].find(x => x.offsetParent);
  const primary = [...document.querySelectorAll('.lv .btn-primary')].find(x => x.offsetParent);
  return { font: b.fontFamily, bg: b.backgroundColor, color: b.color, card: c && { bg: c.backgroundColor, radius: c.borderTopLeftRadius, border: c.borderTopWidth, borderColor: c.borderTopColor, shadow: c.boxShadow },
    plain: plain && { radius: cs(plain).borderTopLeftRadius, shadow: cs(plain).boxShadow, weight: cs(plain).fontWeight, font: cs(plain).fontFamily },
    primary: primary && { radius: cs(primary).borderTopLeftRadius, shadow: cs(primary).boxShadow } };
}, card);

async function openRoom() {
  const r = await call('/api/live/sessions', { method: 'POST', user: teacher, body: { pick: 'mode:battle', items: ITEMS, audience: 'open', replace: true } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const code = (await call(r.json.redirect, { user: teacher })).text.match(/id="lv-code"[^>]*>([\d ]+)</)[1].replace(/\s/g, '');
  return { sid: r.json.sid, path: r.json.redirect, code };
}
const cookie = (id, base) => { const [name, value] = cookieFor(id).split('='); return { name, value, url: base }; };

test('the projector and the player page use the shared tokens, light and dark; a phone and a Chromebook player never scroll sideways and every button is 44 px', { skip, timeout: 240_000 }, async () => {
  const br = await getBrowser();
  const room = await openRoom();
  for (const theme of ['light', 'dark']) {
    const C = COLORS[theme];
    // the projector (a Chromebook)
    const hc = await br.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: theme, reducedMotion: 'reduce' });
    await hc.addCookies([cookie(teacher.id, ctx.base)]);
    const host = await hc.newPage();
    await host.goto(ctx.base + room.path);
    const h = await lookOf(host, '.lv-host > .lv-joinbox');
    assert.match(h.font, /^"Bricolage Grotesque"/, `${theme}: the projector is in Bricolage Grotesque`);
    assert.deepEqual([h.bg, h.color], [C.bg, C.text], `${theme}: the page and text colors`);
    assert.deepEqual([h.card.bg, h.card.radius, h.card.border, h.card.borderColor], [C.card, '24px', '3px', C.text], `${theme}: the join code card, cream with an Ink edge`);
    assert.equal(h.plain.radius, '999px', 'a pill button'); assert.match(h.plain.shadow, /0px 3px 0px 0px/, 'with its bottom edge');
    assert.ok(h.plain.shadow.includes(C.line), `${theme}: the edge in --line`); assert.equal(h.plain.weight, '800');
    assert.equal(h.primary.radius, '999px'); assert.ok(h.primary.shadow.includes(C.press) && /0px 4px 0px/.test(h.primary.shadow), 'Start: Mint on the Leaf pressed edge');
    const bar = await host.evaluate(() => { const b = getComputedStyle(document.querySelector('.lv-host > header.lv-bar')); return { bg: b.backgroundColor, radius: b.borderTopLeftRadius, live: !!document.querySelector('header.lv-bar .lv-livedot'), mark: !!document.querySelector('header.lv-bar .lv-markhome svg') }; });
    assert.deepEqual(bar, { bg: C.card, radius: '20px', live: true, mark: true }, `${theme}: the header is a card with the app mark and the Live dot`);
    const stage = await host.evaluate(() => getComputedStyle(document.getElementById('lv-stage')).borderTopLeftRadius);
    assert.equal(stage, '20px');

    // a player on a phone, then on a Chromebook
    for (const [w, hgt] of [[390, 844], [1366, 768]]) {
      const pc = await br.newContext({ viewport: { width: w, height: hgt }, colorScheme: theme, reducedMotion: 'reduce', hasTouch: w < 500, extraHTTPHeaders: { 'x-forwarded-for': `10.9.${w % 250}.${theme === 'dark' ? 7 : 8}` } });
      const p = await pc.newPage();
      await p.goto(`${ctx.base}/join#${room.code}`);
      const j = await lookOf(p, '#lv-code-step');
      assert.match(j.font, /^"Bricolage Grotesque"/); assert.deepEqual([j.bg, j.card.bg, j.card.radius, j.card.border], [C.bg, C.card, '20px', '0px'], `${theme} ${w}: the join card`);
      const field = await p.evaluate(() => { const s = getComputedStyle(document.getElementById('jc')); return { h: document.getElementById('jc').getBoundingClientRect().height, border: s.borderTopWidth, font: s.fontFamily }; });
      assert.ok(field.h >= 64, 'a big code field'); assert.equal(field.border, '3px'); assert.match(field.font, /^"Bricolage Grotesque"/);
      await p.click('#lv-join button[type=submit]'); await p.click('#lv-go'); await p.waitForURL(/\/live\/play\//);
      await p.waitForFunction(() => document.querySelector('#lv-stage iframe'), null, { timeout: 20_000 });
      const pl = await lookOf(p, 'header.lv-bar');
      assert.match(pl.font, /^"Bricolage Grotesque"/); assert.deepEqual([pl.bg, pl.card.bg, pl.card.radius], [C.bg, C.card, '20px'], `${theme} ${w}: the player's header card`);
      assert.equal(pl.plain.radius, '999px'); assert.match(pl.plain.shadow, /0px 3px 0px 0px/);
      const fit = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        small: [...document.querySelectorAll('.lv button, .lv a.btn')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 44).map(b => b.id || b.textContent.trim()) }));
      assert.ok(fit.sw <= fit.cw, `${theme} ${w}: no sideways scroll (${fit.sw} > ${fit.cw})`);
      assert.deepEqual(fit.small, [], `${theme} ${w}: every button is a 44 px target`);
      await pc.close();
    }
    await hc.close();
  }
});

test('answers on a phone are 44 px targets with a shape beside the color (Question Battle and Brain Board), light and dark', { skip, timeout: 180_000 }, async () => {
  const PL = [1, 2, 3].map(n => [n, n - 1, null, 0, 0, 1, 1, 0]);
  for (const theme of ['light', 'dark']) {
    for (const [file, mode, sel] of [['question-battle.html', 'battle', '#pad .qb-a'], ['brain-board.html', 'board', '#pad .bb-a']]) {
      const L = await openLive(file, { role: 'player', mode, theme, viewport: { width: 390, height: 844 }, touch: true });
      try {
        await L.send({ t: 'wel', role: 'player', seat: 2, phase: 'lobby', seq: 1, round: 0, at: 0, players: PL, state: {}, mode, me: { seat: 2, name: 1, avatar: null, team: 0, score: 0 } });
        const now = await L.now();
        await L.send({ t: 'ph', phase: 'playing', seq: 3, at: now }, { t: 'q', i: 0, n: 3, q: 'Which planet is closest to the sun?', choices: ['Mercury', 'Venus', 'Earth', 'Mars'], secs: 20, at: now });
        await L.page.waitForTimeout(200);
        const a = await L.frame.evaluate(s => [...document.querySelectorAll(s)].map(x => { const r = x.getBoundingClientRect(); return { h: r.height, w: r.width, shape: !!x.querySelector('.sh, svg, [class*="shape"]') || /[▲◆●■]/.test(x.textContent) }; }), sel);
        assert.equal(a.length, 4, `${file}: four answers`);
        assert.ok(a.every(x => x.h >= 44 && x.w >= 44), `${file} ${theme}: 44 px answer targets ${JSON.stringify(a)}`);
        assert.ok(a.every(x => x.shape), `${file} ${theme}: a shape on every answer, never color alone`);
        const sw = await L.frame.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
        assert.ok(sw, `${file} ${theme}: nothing sideways on a phone`);
      } finally { await L.ctx.close(); }
    }
  }
});
