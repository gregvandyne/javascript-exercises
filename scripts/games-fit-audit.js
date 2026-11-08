// Every official game fits every screen, tablets first: opens each launch game's /play page as a guest on a phone
// (portrait and landscape), a tablet (portrait and landscape) and a desktop, with touch on phones and tablets, on the
// title screen and again after pressing Play, and checks inside the game frame that nothing is off screen, cut off, on
// top of something else or squashed (tests/e2e/frame-fit.js), and that the page never scrolls sideways. Saves a
// screenshot of every check. Tablets in both orientations are a required check for every game (docs/decisions.md).
//
//   BASE=http://localhost:3000 OUT=/tmp/games-fit [GAMES=atlas-quest,castle-clash] node scripts/games-fit-audit.js
//   (npm run layout:games; tests/e2e/games-fit.spec.js runs it). Exit code 1 when anything is wrong.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { frameProblems, pageScrollsSideways } from '../tests/e2e/frame-fit.js';

const B = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, ''), OUT = process.env.OUT || '/tmp/games-fit';
// The live quiz modes are checked in a real live session by scripts/live-layout-audit.js; here only their solo practice.
// The launch games, read from scripts/seed.js without importing it (importing would open the database).
const SEED_GAMES = JSON.parse(fs.readFileSync(new URL('./seed.js', import.meta.url), 'utf8').match(/export const SEED_GAMES = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
const GAMES = (process.env.GAMES || SEED_GAMES.join(',')).split(',').filter(Boolean);
export const SIZES = {
  'phone-portrait': { viewport: { width: 390, height: 844 }, touch: true, mobile: true },
  'phone-landscape': { viewport: { width: 844, height: 390 }, touch: true, mobile: true },
  'tablet-portrait': { viewport: { width: 820, height: 1180 }, touch: true },
  'tablet-landscape': { viewport: { width: 1180, height: 820 }, touch: true },
  desktop: { viewport: { width: 1280, height: 800 } },
};
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gameFrame = page => page.frames().find(f => /\/frame\//.test(f.url()));

async function check(page, slug, size, stage, report) {
  const f = gameFrame(page);
  const probs = f ? await frameProblems(f).catch(e => [{ kind: 'error', what: String(e.message).slice(0, 120) }]) : [{ kind: 'noframe' }];
  if (await pageScrollsSideways(page)) probs.push({ kind: 'page-scrolls-sideways' });
  await page.screenshot({ path: `${OUT}/${slug}-${stage}-${size}.png` });
  report.push({ slug, size, stage, probs });
  if (probs.length) console.log(`${slug} ${stage} ${size}: ${JSON.stringify(probs).slice(0, 500)}`);
}

(async () => {
  // BRB_CHROMIUM, else the repo's pinned browser (playwright.config.js) where it is installed, else Playwright's own.
  const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const report = [];
  for (const slug of GAMES) {
    for (const [size, s] of Object.entries(SIZES)) {
      const ctx = await browser.newContext({ viewport: s.viewport, hasTouch: !!s.touch, isMobile: !!s.mobile, deviceScaleFactor: 1, reducedMotion: 'reduce', extraHTTPHeaders: { 'x-forwarded-for': `10.9.${GAMES.indexOf(slug)}.${Object.keys(SIZES).indexOf(size) + 2}` } });
      const page = await ctx.newPage();
      try {
        await page.goto(`${B}/play/${slug}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#gameframe', { timeout: 20000 });
        // Fonts, the kit and 3D scenes take a moment; a game is judged once it has settled.
        for (let i = 0; i < 40 && !(gameFrame(page) && await gameFrame(page).evaluate(() => document.readyState === 'complete').catch(() => false)); i++) await sleep(250);
        await sleep(3500);
        await check(page, slug, size, 'title', report);
        // Press Play: the kit's title button, or a game's own start button.
        const f = gameFrame(page);
        const pressed = f && await f.evaluate(() => {
          const b = document.querySelector('.ok-title-screen .ok-hot, .ok-title-screen .ok-cta button, [data-start], #play, #playBtn, #start, #startBtn');
          if (!b || b.offsetParent === null) return false;
          b.click(); return true;
        }).catch(() => false);
        if (pressed) { await sleep(2500); await check(page, slug, size, 'play', report); }
      } catch (e) { report.push({ slug, size, stage: 'load', probs: [{ kind: 'error', what: String(e.message).slice(0, 160) }] }); console.log(`${slug} ${size}: ${e.message}`); }
      await ctx.close();
    }
  }
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
  const bad = report.filter(r => r.probs.length);
  console.log(`${report.length} checks over ${GAMES.length} games, ${bad.length} with problems. Screenshots and report.json in ${OUT}`);
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
