// The parents video's safety scenes, frame by frame (virtual clock):
//   signup  - "Who's this for?" -> My child -> a made-up name and a password (no email, no age)
//   friends - the friend code card; typing a friend's code
//   publish - the Studio's share sheet: Only me / Friends (no Everyone while PUBLIC_GAMES is off)
// node scripts/demo-video/rec-safety.mjs land|port [only]
// Wide: recorded in a window shaped like the band under the caption (1152 x 558 at 5/3, shown at 1920 x 930), so the
// page is shown at a readable size with nothing shrunk.
import { chromium } from 'playwright';
import { launchOptions } from '../chromium.js';
import { Capture, cursorInit, glide, setCursor } from './vc.mjs';
import { B, login, sleep } from './lib.mjs';
const orient = process.argv[2] || 'land', only = process.argv[3];
const L = orient === 'land';
const V = L ? { viewport: { width: 1152, height: 558 }, deviceScaleFactor: 5 / 3, out: [1920, 930] } : { viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, out: [1080, 1920] };
const C = process.env.DEMO_CLIPS || '/tmp/claude-0/demo2/clips';
const STUDIO = process.env.DEMO_STUDIO;   // a studio MayaMakes built (rec-builder.mjs makes a Category Board)
if (!STUDIO && (!only || only === 'publish')) { console.error('Set DEMO_STUDIO to one of MayaMakes\'s studio ids.'); process.exit(1); }
const br = await chromium.launch(launchOptions({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] }, { headless: true }));
const mk = async (signedIn) => {
  const ctx = await br.newContext({ viewport: V.viewport, deviceScaleFactor: V.deviceScaleFactor, isMobile: !!V.isMobile, hasTouch: !!V.hasTouch, extraHTTPHeaders: { 'x-forwarded-for': '10.7.8.' + (L ? 1 : 2) } });
  const p = await ctx.newPage(); p.__name = 'g';
  if (signedIn) await login(p, 'MayaMakes', 'secret123');
  await Capture.install(ctx);
  return p;
};
const out = (cap, name) => { const r = cap.encode(`${name}-${orient}`, { g: V.out }); console.log('ok', r.g); };
const run = async (name, fn) => { if (only && only !== name) return; await fn(); };
const typeIn = async (cap, p, sel, text, perChar = 3) => {
  await p.focus(sel);
  for (const ch of text) { await p.keyboard.type(ch); await cap.frames(perChar); }
};

await run('signup', async () => {
  const p = await mk(false);
  await p.goto(B + '/signup'); await p.waitForLoadState('networkidle').catch(() => {});
  const cap = new Capture([p], `${C}/tmp-signup-${orient}`);
  await cap.advance(600); await cursorInit(p);
  await cap.frames(12);
  const kid = p.locator('a.door-kid').first();
  await glide(cap, p, kid, { sec: 0.7, click: false });
  await Promise.all([p.waitForURL(u => /kid/.test(String(u))), kid.click()]);
  await p.waitForLoadState('networkidle').catch(() => {}); await sleep(200);
  // the form opens at its fields (in the short window the page would scroll there anyway; the scroll happens before
  // the first frame of this page)
  await p.evaluate(() => { const f = document.querySelector('#username').closest('.field, label, div'); window.scrollTo({ top: Math.max(0, (f || document.querySelector('#username')).getBoundingClientRect().top + scrollY - 90), behavior: 'instant' }); });
  await cap.advance(400); await cursorInit(p);
  await cap.frames(8);
  await glide(cap, p, p.locator('#username'), { sec: 0.5, click: true });
  await typeIn(cap, p, '#username', 'PixelPanda', 3);
  await glide(cap, p, p.locator('#password'), { sec: 0.4, click: true });
  await typeIn(cap, p, '#password', 'rocket-otter', 2);
  await cap.frames(20);
  out(cap, 'safe-signup');
});

await run('friends', async () => {
  const p = await mk(true);
  await p.goto(B + '/friends'); await p.waitForLoadState('networkidle').catch(() => {});
  const cap = new Capture([p], `${C}/tmp-friends-${orient}`);
  await cap.advance(600); await cursorInit(p);
  await cap.frames(10);
  await glide(cap, p, p.locator('#code'), { sec: 0.7, click: true });
  await typeIn(cap, p, '#code', 'R7K2QZ', 4);
  await glide(cap, p, p.locator('button', { hasText: /Add friend/i }).first(), { sec: 0.5, click: false });
  await cap.frames(24);
  out(cap, 'safe-friends');
});

await run('publish', async () => {
  const p = await mk(true);
  await p.goto(B + '/studio/' + STUDIO); await p.waitForLoadState('networkidle').catch(() => {});
  const cap = new Capture([p], `${C}/tmp-publish-${orient}`);
  await cap.advance(1500); await cursorInit(p);
  // This local build was made by the offline building blocks (no AI key here): hide that summary row rather than show it.
  await p.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const hide = [];
    for (let n; (n = w.nextNode());) if (/building blocks did this/i.test(n.nodeValue)) hide.push(n.parentElement.closest('details') || n.parentElement.closest('div') || n.parentElement);
    for (const e of hide) e.style.setProperty('display', 'none', 'important');
    // and its arcade next steps: the chips the AI Builder suggests for a board (as rec-builder.mjs shows them)
    const NEXT = { 'Make it harder': 'Use our spelling words', 'Add a second level': 'Add a fourth team', 'Change the hero to a dragon': 'Make it harder' };
    for (const b of document.querySelectorAll('button')) { const t = b.textContent.trim(); if (NEXT[t]) b.textContent = NEXT[t]; }
  });
  await cap.frames(8);
  await glide(cap, p, p.locator('#st-publish'), { sec: 0.7, click: true });
  await cap.advance(200); await cap.frames(18);
  const opts = p.locator('.vischoice button, .vischoice label, .vischoice [role=radio]');
  const n = await opts.count();
  if (n) await glide(cap, p, opts.nth(Math.min(1, n - 1)), { sec: 0.6, click: true });
  await cap.frames(36);
  await setCursor(p, -200, -200);
  out(cap, 'safe-publish');
});
await br.close();
