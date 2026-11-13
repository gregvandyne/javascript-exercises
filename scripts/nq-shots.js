// Number Quest slide pictures: capture the in-game screenshots the mission slides carry. Each shot boots
// the real game inside the sandbox wrapper (the covers.js pattern) with the lesson parameters of the deck
// whose mission assigns it (BRB.params, parsed by the site's own parseParams — mode/level/chapter/lock
// exactly as the play page sends them), so the photograph shows the game the student is about to play, in
// its assigned mode: Sum Racer locked to the mission's track, Brain Board opened straight on the step's
// board, Quest Race on pattern questions, Fraction Factory inside the mission's chapter.
//
// Phone-width shots (fix round A2, the Cyber Defenders scripts/cyber-shots.js "narrow" mode): a shot with
// `narrow: { width, height, top }` lays the game out as on a phone (width CSS px wide, so its words wrap short
// and sit at the game's own size), then keeps the 16:9 slice from `top`, shot at 1280 px wide. On a 390 px
// phone the slide frame shows that slice at about 350 px, so the game's 14-18 px words read at 11 px or more,
// and the slide needs no crop (no `view`, so no expand button over the question). `top` may be a CSS
// selector instead of a number: the slice then starts just above that element; or `bottom`, a selector the
// slice ends just under. Without `top` the whole
// narrow page is shot as <state>-survey.png (a survey, to choose the slice), and no WebP is written.
//
// Usage: node scripts/nq-shots.js [--no-webp] [state ...]
//   masters (PNG, 1280x720) go to scripts/nq-masters/<game>/<state>.png (kept locally, the re-runnable
//   source); each master also converts to public/img/nq/<game>/<state>.webp (WebP q80, max 1280 wide),
//   the file the slide serves. Manifest: public/img/nq/manifest.json (check: npm run nq:check).
// Needs the Playwright Chromium (`npx playwright install chromium`).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { frameDocument, frameCsp, SANDBOX } from '../server/services/frame.js';
import { vendorFile } from '../server/services/snapshot.js';
import { parseParams } from '../server/services/play-params.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXE = process.env.CHROME_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const WEBP = !process.argv.includes('--no-webp');
const wait = ms => new Promise(r => setTimeout(r, ms));
/* Poll with evaluate rather than waitForFunction: its rAF polling starves in a frame whose render loop
   is saturated (Quest Race's 3D view never fires the hook wait, though the hook is already there). */
async function hook(f) { const t0 = Date.now(); while (Date.now() - t0 < 45000) { try { if (await f.evaluate(() => !!(window.__brbTest && window.__brbTest.state))) return; } catch { /* frame still navigating */ } await wait(250); } throw new Error('test hook never appeared'); }
/** Wait for the game's own state to match, or go on after a few seconds (the covers.js discipline). */
async function until(f, ok, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (ok(await f.evaluate(() => window.__brbTest.state()) || {})) return true; } catch { /* reloading */ } await wait(200); } return false; }
/** The kit's title screen: press Play (a lesson arrival then opens its locked content at once). */
async function play(f) { await wait(900); for (const sel of ['.ok-title-screen .ok-hot', '.ok-title-screen .ok-big', '.ok-title-screen button']) { const go = await f.$(sel); if (go) { await go.click(); await wait(1500); return; } } }

// One shot per mission slide: the deck (step), the game, the lesson parameters from that deck's own
// game.params, and how to reach the moment worth photographing — mid-play, the assigned skill on screen.
const SHOTS = [
  { step: '1.1', state: 'place-value-board', slug: 'brain-board', narrow: { width: 500, height: 900, top: '.bb-cardin', bottom: '#pad' }, params: 'mode=nq-1-1&lock=1', prep: brainBoard },
  { step: '1.2', state: 'rounding-run', slug: 'sum-racer', narrow: { width: 360, height: 900, head: '#raceBar', from: '.qpanel', to: '.answers.choices', toPad: 8 }, params: 'level=9&lock=1', prep: sumRacer },
  { step: '1.3', state: 'pattern-race', slug: 'quest-race', narrow: { width: 480, height: 1000, bottom: '#pad' }, params: 'mode=nq-1-3&lock=1', prep: questRace, cdp: true },
  { step: '2.1', state: 'addition-track', slug: 'sum-racer', narrow: { width: 360, height: 900, head: '#raceBar', from: '.qpanel', to: '.answers.choices', toPad: 8 }, params: 'level=10&mode=add&lock=1', prep: sumRacer },
  { step: '2.2', state: 'subtraction-track', slug: 'sum-racer', narrow: { width: 360, height: 900, head: '#raceBar', from: '.qpanel', to: '.answers.choices', toPad: 8 }, params: 'level=10&mode=sub&lock=1', prep: sumRacer },
  { step: '2.3', state: 'story-board', slug: 'brain-board', narrow: { width: 500, height: 900, top: '.bb-cardin', bottom: '#pad' }, params: 'mode=nq-2-3&lock=1', prep: brainBoard },
  { step: '3.1', state: 'all-tables-track', slug: 'sum-racer', narrow: { width: 360, height: 900, head: '#raceBar', from: '.qpanel', to: '.answers.choices', toPad: 8 }, params: 'level=5&lock=1', prep: sumRacer },
  { step: '3.2', state: 'sharing-track', slug: 'sum-racer', narrow: { width: 360, height: 900, head: '#raceBar', from: '.qpanel', to: '.answers.choices', toPad: 8 }, params: 'level=6&lock=1', prep: sumRacer },
  { step: '3.3', state: 'grand-prix', slug: 'sum-racer', narrow: { width: 360, height: 900, head: '#raceBar', from: '.qpanel', to: '.answers.choices', toPad: 8 }, params: 'level=7&lock=1', prep: sumRacer, want: timesFact },
  { step: '4.1', state: 'first-cuts', slug: 'fraction-factory', narrow: { width: 360, height: 1100, from: 140, to: 574 }, params: 'chapter=first-cuts&band=1b&lock=1', prep: fractionFactory },
  { step: '4.2', state: 're-slice', slug: 'fraction-factory', narrow: { width: 360, height: 1100, from: 288, to: 684 }, params: 'chapter=re-slice&band=1b&lock=1', prep: fractionFactory },
  { step: '4.3', state: 'recipe-math', slug: 'fraction-factory', narrow: { width: 360, height: 1100, from: 271, to: 546 }, params: 'chapter=recipe&band=1b&lock=1', prep: fractionFactory },
  // The Phase 2 sweep (Units 5-7 + the Vault of Measures finale): the same discipline, the decks' own
  // game.params. Data Detective and Would You Rather join the pipeline here, in the chapters and topic
  // their missions assign.
  { step: '5.1', state: 'measures-board', slug: 'brain-board', narrow: { width: 500, height: 900, top: '.bb-cardin', bottom: '#pad' }, params: 'mode=nq-5-1&lock=1', prep: brainBoard },
  { step: '5.2', state: 'timetable-race', slug: 'quest-race', narrow: { width: 480, height: 1000, bottom: '#pad' }, params: 'mode=nq-5-2&lock=1', prep: questRace, cdp: true },
  { step: '5.3', state: 'money-board', slug: 'brain-board', narrow: { width: 500, height: 900, top: '.bb-cardin', bottom: '#pad' }, params: 'mode=nq-5-3&lock=1', prep: brainBoard },
  { step: '6.1', state: 'shapes-board', slug: 'brain-board', narrow: { width: 500, height: 900, top: '.bb-cardin', bottom: '#pad' }, params: 'mode=nq-6-1&lock=1', prep: brainBoard },
  { step: '6.2', state: 'around-inside-board', slug: 'brain-board', narrow: { width: 500, height: 900, top: '.bb-cardin', bottom: '#pad' }, params: 'mode=nq-6-2&lock=1', prep: brainBoard },
  { step: '6.3', state: 'lines-grids-board', slug: 'brain-board', narrow: { width: 500, height: 900, top: '.bb-cardin', bottom: '#pad' }, params: 'mode=nq-6-3&lock=1', prep: brainBoard },
  { step: '7.1', state: 'chart-it', slug: 'data-detective', narrow: { width: 360, height: 760, from: 146, to: 546 }, params: 'chapter=chart&band=1b&lock=1', prep: dataDetective },
  { step: '7.2', state: 'my-data', slug: 'data-detective', narrow: { width: 360, height: 760, from: 146, to: 472 }, params: 'chapter=my-data&band=1b&lock=1', prep: dataDetective },
  { step: '7.3', state: 'chance-race', slug: 'quest-race', narrow: { width: 480, height: 1000, bottom: '#pad' }, params: 'mode=nq-7-3&lock=1', prep: questRace, cdp: true },
  { step: '7.4', state: 'vault-run', slug: 'quest-race', narrow: { width: 480, height: 1000, bottom: '#pad' }, params: 'mode=nq-7-4&lock=1', prep: questRace, cdp: true },
  // Launchpad Unit 1, The Counting Patch (tier: 'launchpad'): Garden Count, a 3D game, in each step's own chapter. The
  // whole phone screen is the band (the garden fills it, the words on top and the big buttons at the bottom).
  { tier: 'launchpad', step: '1.1', state: 'pick-and-count', slug: 'garden-count', narrow: { width: 390, height: 580, from: 0, to: 580 }, params: 'chapter=count&lock=1', prep: gardenCount, cdp: true },
  { tier: 'launchpad', step: '1.2', state: 'more-or-fewer', slug: 'garden-count', narrow: { width: 390, height: 580, from: 0, to: 580 }, params: 'chapter=compare&lock=1', prep: gardenCount, cdp: true },
  { tier: 'launchpad', step: '1.3', state: 'ten-and-more', slug: 'garden-count', narrow: { width: 390, height: 580, from: 0, to: 580 }, params: 'chapter=teens&lock=1', prep: gardenCount, cdp: true },
  // Launchpad Unit 2, The Joining Pond: Lily Hop, a 3D game, in each step's own chapter, the whole phone screen as the
  // band (the pond and its islands fill it, the words and the sum on top, the three number buttons at the bottom).
  { tier: 'launchpad', step: '2.1', state: 'hop-together', slug: 'lily-hop', narrow: { width: 390, height: 580, from: 0, to: 580 }, params: 'chapter=join&lock=1', prep: lilyHop, cdp: true },
  { tier: 'launchpad', step: '2.2', state: 'number-partners', slug: 'lily-hop', narrow: { width: 390, height: 580, from: 0, to: 580 }, params: 'chapter=apart&lock=1', prep: lilyHop, cdp: true },
  { tier: 'launchpad', step: '2.3', state: 'hop-to-20', slug: 'lily-hop', narrow: { width: 390, height: 580, from: 0, to: 580 }, params: 'chapter=twenty&lock=1', prep: lilyHop, cdp: true },
  // Launchpad Unit 3, The Tens Trellis: Crate Stacker, a 3D game, in each step's own chapter, the whole phone screen as
  // the band (the yard and the town fill it, the words and the number chip on top, the big buttons at the bottom).
  { tier: 'launchpad', step: '3.1', state: 'load-the-truck', slug: 'crate-stacker', narrow: { width: 390, height: 580, from: 0, to: 580 }, params: 'chapter=build&lock=1', prep: crateStacker, cdp: true },
  { tier: 'launchpad', step: '3.2', state: 'which-has-more', slug: 'crate-stacker', narrow: { width: 390, height: 580, from: 0, to: 580 }, params: 'chapter=greater&lock=1', prep: crateStacker, cdp: true },
  { tier: 'launchpad', step: '3.3', state: 'add-more-crates', slug: 'crate-stacker', narrow: { width: 390, height: 580, from: 0, to: 580 }, params: 'chapter=add&lock=1', prep: crateStacker, cdp: true },
];

async function brainBoard(f) {
  await play(f);
  await until(f, s => s.board && s.phase === 'between');
  await f.evaluate(() => window.__brbTest.pick(0, 0));   // open a tile: the step's own question on its card
  await until(f, s => s.question && s.card);
  await wait(700);
}
async function sumRacer(f, page, shot) {
  await play(f);
  await f.evaluate(() => window.__brbTest.skipAnimations && window.__brbTest.skipAnimations());
  await until(f, s => s.question && s.phase === 'racing');
  // Answer one correctly so the kart is moving and the race is under way, then let the next question land.
  await f.evaluate(() => { const t = window.__brbTest; t.answer(t.state().question.answer); t.step && t.step(1100); });
  await until(f, s => s.question && s.phase === 'racing');
  // A shot with `want` (3.3: the mixed Grand Prix, photographed for a fast-facts lesson) restarts the same locked
  // track with the hook's own seeded start until the race opens on a question of that kind, so the picture shows
  // the skill the deck teaches, as question 1 of a real race.
  for (let seed = 100; shot.want && seed < 400; seed++) {
    if (shot.want(await f.evaluate(() => window.__brbTest.state().question))) break;
    await f.evaluate(seed => { const t = window.__brbTest; t.start({ track: t.state().track, mode: 'choice', players: 1, seed }); t.skipAnimations && t.skipAnimations(); }, seed);
    await until(f, s => s.question && s.phase === 'racing');
  }
  await wait(600);
}
/** A hard times fact, the kind 3.3's tricks build (7 × 8 from double 7 × 4): both factors 6 to 9. */
function timesFact(q) { const m = /^(\d+) × (\d+)$/.exec(q && q.text || ''); return !!m && +m[1] >= 6 && +m[1] <= 9 && +m[2] >= 6 && +m[2] <= 9; }
async function questRace(f) {
  await play(f);
  // The race cycles questions in real time (its own runners answer), with interstitial banners between
  // them, and each question's timer is short; the test hook's question and the visible card are not in
  // phase, so wait INSIDE the page for the card itself (#card with its #qtext) and shoot as it lands.
  await f.evaluate(() => new Promise(res => {
    const t = setInterval(() => { const c = document.querySelector('#card'), q = document.querySelector('#qtext'); const cs = c ? getComputedStyle(c) : null; if (c && q && q.textContent.trim().length > 3 && c.getBoundingClientRect().height > 40 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0) { clearInterval(t); res(q.textContent.trim()); } }, 50);
    setTimeout(() => { clearInterval(t); res(''); }, 25000);
  }));
}
async function fractionFactory(f) {
  // Pressing Play on a lesson arrival enters the locked chapter at once, past the kit's how-to card
  // (its Go! button is the actual start); clear the chapter's opening card if one is up, then take the
  // game's own advice once so the photograph is mid-task.
  await play(f);
  await f.getByRole('button', { name: 'Go!' }).click({ timeout: 6000 }).catch(() => {});
  await until(f, s => s.chapter && s.level >= 1, 15000);
  // The chapter screen is only the doorway: start its first order so the run itself is on screen.
  await f.getByRole('button', { name: /Start order/ }).click({ timeout: 6000 }).catch(() => {});
  await until(f, s => s.denom > 0, 15000);
  await f.evaluate(() => { try { window.__brbTest.closeCards(); } catch { /* no card up */ } });
  await wait(500);
  await f.evaluate(() => { const t = window.__brbTest; const a = t.advice && t.advice(); if (a) t.act(a); });
  await wait(900);
}

async function dataDetective(f) {
  // A lesson arrival opens the locked chapter at once, on its first case. Clear the case's opening
  // card if one is up, then take evidence the way the case teaches, so the photograph is mid-case:
  // Chart It switches the fruit counts to the bar view; My Data tallies its pet survey (past the
  // five-answer minimum) and charts it, the claim still unpinned.
  // The game's fast flag (its own cover() discipline): a case then opens straight on its workspace,
  // with no story or learn dialog over the chart the photograph needs to show.
  await f.evaluate(() => { try { window.__brbTest.skipAnimations(); } catch { /* hook not ready */ } });
  await play(f);
  await until(f, s => s.screen === 'play' && s.level >= 1, 20000);
  await f.evaluate(() => { try { window.__brbTest.closeDialog(); } catch { /* no card up */ } });
  await wait(400);
  const chapter = await f.evaluate(() => window.__brbTest.state().chapter);
  if (chapter === 'my-data') {
    await f.evaluate(() => { const t = window.__brbTest; for (const a of [['tally', 'Dog', 4], ['tally', 'Cat', 3], ['tally', 'Fish', 1], ['tally', 'None', 2], ['view', 'bar']]) t.act(a); });
  } else {
    await f.evaluate(() => window.__brbTest.act(['view', 'bar']));
  }
  await until(f, s => s.view === 'bar' && s.evidence, 8000);
  await wait(700);
}
async function wouldYouRather(f) {
  // No lesson parameters: the mission sends the student to choose the Numbers topic in the game, so
  // the photograph does the same through the game's own start (play alone, the Numbers topic only),
  // then waits inside the page for the first question card to be fully dealt before shooting.
  await play(f);
  await until(f, s => s.bank > 0, 20000);
  await f.evaluate(() => window.__brbTest.start('alone', { topics: ['numbers'] }));
  await until(f, s => s.cur && /^numbers-/.test(s.cur) && s.n >= 1, 15000);
  await f.evaluate(() => new Promise(res => {
    const t = setInterval(() => { const a = document.querySelector('#optA .tx'), b = document.querySelector('#optB .tx'); if (a && b && a.textContent.trim() && b.textContent.trim()) { clearInterval(t); res(true); } }, 50);
    setTimeout(() => { clearInterval(t); res(false); }, 15000);
  }));
  await wait(500);
}

async function gardenCount(f) {
  // A lesson arrival: pick the helper, and the locked chapter opens on its first round. Then play a little through
  // the game's own buttons, so the photograph is mid-round: three apples picked and counted (Pick and Count), the two
  // beds as they are asked about (More or Fewer), a full ten-frame and the ones that make the number (Ten and More).
  await f.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await f.click('#hero-mage');
  await until(f, s => s.screen === 'play' && s.round === 1, 20000);
  const s = await f.evaluate(() => window.__brbTest.state());
  if (s.kind === 'count') for (let i = 0; i < 3; i++) { await f.click('#gc-pick'); await wait(450); }
  if (s.kind === 'make') { await f.click('#gc-fill'); await wait(500); for (let i = 10; i < s.target; i++) { await f.click('#gc-one'); await wait(450); } }
  await wait(1500);
}

async function lilyHop(f) {
  // A lesson arrival: pick the helper, and the locked chapter opens on its first round. The photograph is the round
  // as it is asked: the two groups of frogs (Hop Together), the number split onto two pads once the orange frogs have
  // hopped across (Number Partners), the helper on its starting pad of the number line (Hop to 20).
  await f.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await f.click('#hero-mage');
  await until(f, s => s.screen === 'play' && s.round === 1, 20000);
  await wait(2800);
}

async function crateStacker(f) {
  // A lesson arrival: pick the helper, and the locked chapter opens on its first round. Load the Truck is photographed
  // with the truck loaded as the round asks (through the game's own buttons); the other two as they are asked: two
  // loaded trucks (Which Has More?), a truck and the cart with the crates to add (Add More Crates).
  await f.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await f.click('#hero-mage');
  await until(f, s => s.screen === 'play' && s.round === 1, 20000);
  await wait(1800);
  const s = await f.evaluate(() => window.__brbTest.state());
  if (s.kind === 'build') { for (let i = 0; i < s.tens; i++) { await f.click('#cs-ten'); await wait(350); } for (let i = 0; i < s.ones; i++) { await f.click('#cs-one'); await wait(350); } }
  await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
  await wait(1600);
}

/** Keep the deck in step with its picture: the mission slide that shows this shot gets the band's `view` and
 *  `whole: true` (written in place, the deck's own formatting kept), so a re-run never leaves a stale crop. */
function writeView(shot) {
  const file = path.join(ROOT, 'seed-lessons', 'number-quest', 'course', shot.tier || 'explorer', `${shot.step}.json`); // a shot names its tier; Explorer when it names none
  let src = fs.readFileSync(file, 'utf8');
  const key = `"img": "nq/${shot.slug}/${shot.state}"`, at = src.indexOf(key);
  if (at < 0) return console.log(`  (deck ${shot.step} has no slide with ${key})`);
  const end = src.indexOf('\n  }', at), slide = src.slice(at, end);
  const ind = /\n(\s*)"alt"/.exec(slide)?.[1] || '   ';
  const view = `"view": [\n${shot.view.map(v => `${ind} ${v}`).join(',\n')}\n${ind}]`;
  let next = /"view": \[[^\]]*\]/.test(slide) ? slide.replace(/"view": \[[^\]]*\]/, view) : slide.replace(/("alt": "[^"]*")/, `$1,\n${ind}${view}`);
  if (!/"whole": true/.test(next)) next = next.replace(view, `${view},\n${ind}"whole": true`);
  src = src.slice(0, at) + next + src.slice(end);
  JSON.parse(src);
  fs.writeFileSync(file, src);
}

async function capture(browser, shot) {
  const htmlPath = path.join(ROOT, 'seed-games', `${shot.slug}.html`);
  const params = parseParams(Object.fromEntries(new URLSearchParams(shot.params)));
  const doc = frameDocument(fs.readFileSync(htmlPath, 'utf8'), { user: { displayName: 'Player', avatar: '🦊', isGuest: false }, game: { id: shot.slug, title: shot.slug }, save: {}, canSave: false, preview: true, params });
  const srv = http.createServer((q, r) => {
    const origin = `http://127.0.0.1:${srv.address().port}`;
    if (q.url.startsWith('/g')) { r.setHeader('Content-Security-Policy', frameCsp(origin)); r.setHeader('Content-Type', 'text/html; charset=utf-8'); return r.end(doc); }
    if (q.url.startsWith('/vendor/')) {
      const file = vendorFile(origin + q.url.split('?')[0]);
      if (!file) { r.statusCode = 404; return r.end(); }
      r.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.woff2') ? 'font/woff2' : 'text/plain; charset=utf-8');
      r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      return r.end(fs.readFileSync(file));
    }
    r.setHeader('Content-Type', 'text/html; charset=utf-8');
    r.end(`<!doctype html><style>html,body{margin:0;height:100%;background:#000}iframe{width:100%;height:100%;border:0;display:block}</style><iframe sandbox="${SANDBOX}" src="/g"></iframe>`);
  });
  await new Promise(r => srv.listen(0, r));
  const nw = shot.narrow && (process.env.NQ_SURVEY ? { ...shot.narrow, top: null, bottom: null, from: null } : shot.narrow); // NQ_SURVEY=1: survey the whole narrow page
  const ctx = await browser.newContext(nw ? { viewport: { width: nw.width, height: nw.height }, deviceScaleFactor: 1280 / nw.width } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => {
    try {
      const body = execFileSync('curl', ['-s', '-L', '-A', 'Mozilla/5.0 Chrome/140', route.request().url()], { maxBuffer: 8e6 });
      route.fulfill({ status: 200, body, headers: { 'content-type': /gstatic/.test(route.request().url()) ? 'font/woff2' : 'text/css', 'access-control-allow-origin': '*' } });
    } catch { route.abort(); }
  });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${srv.address().port}/`);
    await page.waitForTimeout(700);
    const f = page.frames().find(x => x.url().includes('/g'));
    await hook(f);
    await shot.prep(f, page, shot);
    const st = await f.evaluate(() => window.__brbTest.state());
    const survey = nw && nw.top == null && nw.bottom == null && nw.from == null;
    // A survey lists the page's lines of text (top, bottom, font size, words), to choose the slice from.
    if (survey) console.log((await f.evaluate(() => [...document.querySelectorAll('body *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && e.getBoundingClientRect().height > 4)
      .map(e => { const r = e.getBoundingClientRect(); return `  ${Math.round(r.top)}-${Math.round(r.bottom)} ${getComputedStyle(e).fontSize} ${e.className || e.tagName}: ${e.textContent.trim().slice(0, 40)}`; }))).join('\n'));
    const master = path.join(ROOT, 'scripts', 'nq-masters', shot.slug, `${shot.state}${survey ? '-survey' : ''}.png`);
    // The slice's top: a number (CSS px), or an element's top less a small margin (its card, so the question
    // and its answers are the slice), kept inside the page.
    let clip = null;
    let band = null;
    if (nw && nw.from != null) {
      // A band (Sum Racer, Fraction Factory, Data Detective at 360 px): what the mission needs is taller than a 16:9
      // slice of a phone-width page, so the band from `from` (less fromPad) to `to` (plus toPad) is shot at
      // 1280 px wide and set at the top left of a 16:9 canvas; the slide's `view` shows exactly the band, and
      // `whole: true` tells the slide that the view IS the whole picture (no expand button: there is nothing more
      // to see). `head`: a selector for the game's own title bar (Sum Racer's track name and skill), stacked over
      // the band, so the picture names the track the mission names. No empty strip above or below the game: an
      // earlier version kept a 40 px Cream strip for the expand button, which read as an empty band on a phone
      // (tests/unit/nq-picture-bands.test.js now fails on that). `from` / `to` are selectors or page y values.
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await wait(250);
      const at = (sel, k) => (typeof sel === 'number' ? sel : f.evaluate(([q, kk]) => { const el = document.querySelector(q); return el ? el.getBoundingClientRect()[kk] : 0; }, [sel, k]));
      const top = Math.max(0, (await at(nw.from, 'top')) - (nw.fromPad || 0)), bottom = Math.min(nw.height, (await at(nw.to, 'bottom')) + (nw.toPad || 0));
      clip = { x: 0, y: top, width: nw.width, height: bottom - top, scale: 1280 / nw.width };
      const headH = nw.head ? Math.round(await at(nw.head, 'bottom')) : 0;
      if (headH) band = { ...(band || {}), headClip: { x: 0, y: 0, width: nw.width, height: headH } };
      const hh = bottom - top + headH, wc = Math.max(nw.width, hh * 16 / 9);
      band = { ...(band || {}), wc, view: [0, 0, Math.round(nw.width / wc * 10000) / 100, Math.round(hh / (wc * 9 / 16) * 10000) / 100] };
      shot.sliceTop = Math.round(top * 10) / 10;
    } else if (nw && !survey) {
      // no keyboard focus ring on the first answer: the photograph shows the card as a child first sees it
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await wait(250);
      const h = nw.width * 9 / 16, edge = (sel, side) => f.evaluate(([q, k]) => { const el = document.querySelector(q); return el ? el.getBoundingClientRect()[k] : 0; }, [sel, side]);
      // `bottom`: the slice ends just under that element (Quest Race: the card's hint line, so the question,
      // and its four answers are all in, and the racers' track shows above them).
      // With both, the slice starts above `top` unless that would cut `bottom` off (a three-line Brain Board
      // question): then it ends under `bottom`, so the question and every answer are always in.
      let top = typeof nw.top === 'string' ? await edge(nw.top, 'top') - 8 : nw.top;
      if (nw.bottom) top = Math.max(top ?? -Infinity, await edge(nw.bottom, 'bottom') + 12 - h);
      top = Math.max(0, Math.min(nw.height - h, top));
      clip = { x: 0, y: top, width: nw.width, height: h, scale: 1280 / nw.width };
      shot.sliceTop = Math.round(top * 10) / 10;
    }
    fs.mkdirSync(path.dirname(master), { recursive: true });
    const frameEl = await page.$('iframe');
    const cdpShot = async () => { // Quest Race's WebGL view never looks "stable" to Playwright's
      // screenshot wait; a raw CDP capture takes the frame as it stands (the harness page is the
      // iframe, full-bleed).
      const cdp = await ctx.newCDPSession(page);
      const shot64 = await cdp.send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' });
      fs.writeFileSync(master, Buffer.from(shot64.data, 'base64'));
    };
    if (shot.cdp) await cdpShot();
    else if (clip) await page.screenshot({ path: master, clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height }, timeout: 15000 }).catch(cdpShot);
    else { try { await frameEl.screenshot({ path: master, timeout: 15000 }); } catch { await cdpShot(); } }
    if (band) {
      // the game's title bar over the band (when the shot has a `head`), then the band at the top left of its 16:9
      // canvas (outside the view, never shown on the slide), 1280 x 720
      const k = 1280 / nw.width;
      if (band.headClip) {
        await page.screenshot({ path: master + '.head.png', clip: band.headClip, timeout: 15000 });
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', master + '.head.png', '-i', master, '-filter_complex', 'vstack=inputs=2', master + '.tmp.png']);
        fs.renameSync(master + '.tmp.png', master); fs.unlinkSync(master + '.head.png');
      }
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', master, '-vf', `pad=${Math.round(band.wc * k)}:${Math.round(band.wc * k * 9 / 16)}:0:0:color=0xFFFDF2,scale=1280:720`, master + '.tmp.png']);
      fs.renameSync(master + '.tmp.png', master);
      shot.view = band.view;
      if (WEBP) writeView(shot);
    }
    let extra = '';
    if (WEBP && !survey) {
      const dest = path.join(ROOT, 'public', 'img', 'nq', shot.slug, `${shot.state}.webp`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', master, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libwebp', '-quality', '80', dest]);
      extra = ` -> public/img/nq/${shot.slug}/${shot.state}.webp (${Math.round(fs.statSync(dest).size / 1024)} KB)`;
    }
    console.log(`✓ ${shot.step} nq/${shot.slug}/${shot.state}${shot.sliceTop != null ? ` (slice from ${shot.sliceTop}px)` : ''}${shot.view ? ` view ${JSON.stringify(shot.view)}` : ''}: ${JSON.stringify(st).slice(0, 180)}${extra}${errors.length ? '  page errors: ' + [...new Set(errors)].join('; ') : ''}`);
  } catch (e) {
    console.log(`✗ ${shot.step} nq/${shot.slug}/${shot.state}: ${e.message.split('\n')[0]}`);
  } finally { await ctx.close(); srv.close(); }
}

const wanted = process.argv.slice(2).filter(a => !a.startsWith('--'));
const shots = wanted.length ? SHOTS.filter(s => wanted.includes(s.state)) : SHOTS;
// Software WebGL (SwiftShader), so the 3D games draw on a machine with no graphics card; the 2D games ignore it.
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE, args: GL } : { args: GL });
for (const shot of shots) await capture(browser, shot);
await browser.close();
