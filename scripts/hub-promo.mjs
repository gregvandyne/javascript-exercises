#!/usr/bin/env node
// The Hub promo: a punchy, about 60 s homepage video of the Hub (/class/:id/hub) that opens on the payoff (a full class,
// every student's named cursor moving live on their desk) and then builds: hand out a game and every cursor swoops to it,
// a raised hand, the day plan's Now bar, a live game everyone joins from their desk, Ask Oomba, and the end card.
//
// Built like scripts/hub-video.mjs: the real app on a throwaway in-memory database, the live sockets attached as
// server/index.js does (attachUpgrades), the teacher's board driven by Playwright. The class is made up: Ms. Okafor at
// Juniper Hill Demo School and 24 students who appear only by their Oomba names. Every student is a real browser page on
// their own desk (not filmed) whose mouse moves on eased random paths, so the board's cursors (public/js/homeroom-live.js
// paintCursors, from the samples public/js/homeroom-pulse.js sends) look like a room of kids; when something new lands on
// their desk, each student's mouse heads for it after a short, different reaction time. The Oomba chat answers with a
// stand-in AI that calls the real tools (as scripts/hub-video.mjs does). No API key is used.
//
// The stills are shot big (1920 x 1080 CSS px at deviceScaleFactor 2, so 3840 x 2160 pictures), the video with Chromium's
// screencast at 1920 x 1080 (about 10 frames a second with 24 desks running), and a virtual camera
// (a crop of that picture, eased between framings) zooms into each moment and pulls back out for the whole room. The
// headlines are big, short and in the brand's type (Bricolage Grotesque, cream on the dark ink pill, a mint accent);
// there is no caption bar. The same lines go to a .en.vtt for captions.
//
// --stills dir writes the key frames as they will look in the video (1920 x 1080, the camera's crop and the headline
// drawn in) and a shots.json with each frame's camera rectangle: the storyboard the owner approved.
// --video dir records the run (dir/rec: the frames and the marks of each moment), then cuts it: every shot is a stretch
// of the recording (sped up where the app waits), cut on the music's bars (cutList), drawn frame by frame through a
// page with the camera, the headlines and the end card (playerHtml), and encoded with the track. It writes
// oomba-hub-promo.mp4 (1080p, about 60 s, two-pass H.264 under 8 MB), -poster.jpg and .en.vtt; copy them to
// public/video. --render-only cuts an existing recording again (to change the edit without filming again).
// The music is the site owner's AtlasAudio track (docs/media-credits.md), not in the repo: --music file.
//
// Usage: node scripts/hub-promo.mjs --stills dir [--raw]   (--raw also keeps the full 3840 x 2160 board pictures)
//        node scripts/hub-promo.mjs --video dir [--render-only] [--kbps 880] [--music atlasaudio-background-594872.mp3]
// Needs ffmpeg and a Chromium (scripts/chromium.js). Rules for the words: made-up names only, no em dashes, US spelling.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const STILLS = opt('--stills') ? path.resolve(opt('--stills')) : null;
const RAW = args.includes('--raw');
const VIDEO = opt('--video') ? path.resolve(opt('--video')) : null;
const RENDER_ONLY = args.includes('--render-only');
const NAME = 'oomba-hub-promo';
const KBPS = Number(opt('--kbps') || 880);
const MUSIC = path.resolve(opt('--music') || path.join(ROOT, '..', 'promo/music/atlasaudio-594872.mp3'));
const VW = 1920, VH = 1080, DPR = 2;

// ---------------------------------------------------------------- the class (made up: Oomba names only)
const STUDENTS = [
  ['CosmicPanda', '🐼'], ['SwiftOtter', '🦦'], ['BrightFox', '🦊'], ['CozyKoala', '🐨'], ['MightyMaple', '🦌'], ['ZippyLynx', '🐱'],
  ['SunnyHeron', '🐦'], ['PixelPuffin', '🐧'], ['JollyNarwhal', '🐳'], ['TurboTurtle', '🐢'], ['MangoMoose', '🫎'], ['RocketRaccoon', '🦝'],
  ['BreezyBee', '🐝'], ['NovaOwl', '🦉'], ['DizzyDolphin', '🐬'], ['MapleMarmot', '🐿️'], ['PeppyPenguin', '🐧'], ['LuckyLlama', '🦙'],
  ['QuirkyQuokka', '🐨'], ['StarryStork', '🦩'], ['FuzzyFerret', '🦡'], ['GigglyGecko', '🦎'], ['HappyHippo', '🦛'], ['WittyWalrus', '🦭'],
];
const KID_COLORS = ['#2f6bff', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#0ea5e9', '#ef4444', '#14b8a6'];
/** Three groups with clear colors (the board's cursors take their group's color). */
const GROUPS = [{ id: 'g1', key: 'stretch', name: 'Stretch', color: '#8C6BD1' }, { id: 'g2', key: 'onTrack', name: 'On track', color: '#1F9D63' }, { id: 'g3', key: 'building', name: 'Builders', color: '#E8833A' }];

async function seed(R) {
  const { config } = await import(R + 'server/config.js');
  config.anthropicKey = '';
  const { q } = await import(R + 'server/db.js');
  const { createUser, getUser } = await import(R + 'server/auth.js');
  const S = await import(R + 'server/services/schools.js');
  const G = await import(R + 'server/services/games.js');
  const H = await import(R + 'server/services/homeroom.js');
  const TOOLS = await import(R + 'tests/unit/_tools-plan.js');
  const { importGame } = await import(R + 'scripts/import-game.js');
  const { seedOfficial } = await import(R + 'scripts/seed.js');
  const official = seedOfficial();
  for (const s of ['crossword', 'word-hunt', 'sudoku', 'typing-zoo', 'mistake-hunt', 'atlas-quest', 'brain-board'])
    if (!G.getGameBySlug(s) && fs.existsSync(`${R}seed-games/${s}.html`)) importGame(`${R}seed-games/${s}.html`, `${R}seed-games/${s}.json`, official.id);
  TOOLS.plansOn();
  const boss = createUser({ username: 'HubPromoBoss', password: 'hub-promo-secret-1', role: 'admin' });
  const school = S.createSchool(boss, { name: 'Juniper Hill Demo School' }).school;
  const T = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Ms. Okafor', role: 'teacher' }).user.id);
  q.run("UPDATE users SET display_name='Ms. Okafor', avatar='🦉', color='#1F9D63' WHERE id=?", T.id);
  TOOLS.givePlan(T.id);
  Object.assign(config, { homeroom: true, homeroomOnboarding: false, liveClassroom: true, manipulatives: true });
  config.homeroomUsers = [T.username.toLowerCase()];
  const cls = S.createClass(boss, school.id, { name: 'Room 7 · Grade 4', grade: '4', teacherId: T.id }).class;
  const kids = STUDENTS.map(([n, a], i) => {
    const u = getUser(S.createSchoolAccount(boss, school.id, { rosterName: n, grade: '4' }).user.id);
    S.addToClass(boss, cls.id, u.id);
    q.run('UPDATE users SET display_name=?, avatar=?, color=? WHERE id=?', n, a, KID_COLORS[i % KID_COLORS.length], u.id);
    return getUser(u.id);
  });
  // Tables of 4: six tables, two rows of three (a full room that fits a 16:9 frame).
  H.saveSeats(T, cls, { preset: 'pods', seats: {} });
  const L = await import(R + 'public/js/homeroom-seats.js');
  const at = L.layout('pods', kids.length);
  H.saveSeats(T, cls, { preset: 'pods', seats: Object.fromEntries(kids.map((k, i) => [k.id, at[i]])) });
  const room = H.roomOf(cls.id);
  const groups = room.groups.map((g, i) => ({ ...g, ...(GROUPS[i] ? { name: GROUPS[i].name, color: GROUPS[i].color } : {}) }));
  // a table's four desks share a group, so the colors read as tables
  H.saveGroups(T, cls, { groups, members: Object.fromEntries(kids.map((k, i) => [k.id, groups[Math.floor(i / 4) % groups.length].id])) });
  H.saveArea(T, cls, { __ann: { notes: [{ id: 'n1', text: 'Warm-up: what is 3/4 of 12?', x: 0.06, y: 0.42, by: 't' }, { id: 'n2', text: 'Today: fractions on a number line', x: 0.3, y: 0.42, by: 't' }], texts: [], strokes: [] }, shapes: [] });
  const gid = s => G.getGameBySlug(s).id;
  return { config, q, T, cls, kids, gid };
}

// ---------------------------------------------------------------- a student's mouse: eased random paths on their desk
/**
 * Drives one student's page. The loop moves the real mouse (so the desk's pulse samples it) along eased paths with small
 * overshoot-free curves and pauses, like a kid reading, wiggling, then going somewhere. mode:
 *   'wander'            random spots over the desk (mostly the cards and the pad)
 *   { go: css, then }   head for an element (after a reaction delay), then hover on it with a little jitter; then:
 *                       'hover' (stay) or 'click' (click it once there)
 */
function mouseOf(page, seed) {
  let rnd = seed >>> 0;
  const rand = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
  const M = { x: 200 + rand() * 600, y: 200 + rand() * 300, mode: 'wander', stopped: false, done: null, busy: false };
  const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  async function glide(x, y, ms) {
    const fx = M.x, fy = M.y;
    // a gentle bow to the path (people never move in straight lines)
    const nx = -(y - fy), ny = x - fx, len = Math.hypot(nx, ny) || 1, bow = (rand() - 0.5) * 0.35 * len;
    const steps = Math.max(4, Math.round(ms / 45));
    for (let i = 1; i <= steps && !M.stopped; i++) {
      const k = ease(i / steps), b = Math.sin(Math.PI * k) * bow;
      M.x = fx + (x - fx) * k + (nx / len) * b; M.y = fy + (y - fy) * k + (ny / len) * b;
      await page.mouse.move(M.x, M.y).catch(() => {});
      await page.waitForTimeout(ms / steps).catch(() => {});
    }
  }
  const deskBox = () => page.locator('.hd-desk').first().boundingBox().catch(() => null);
  async function loop() {
    while (!M.stopped) {
      const mode = M.mode;
      if (mode === 'wander' || mode === 'idle') {
        const b = await deskBox();
        if (!b || mode === 'idle') { await page.waitForTimeout(300).catch(() => {}); continue; }
        // a spot: anywhere on the desk, a bit more often on its upper half (the cards)
        const tx = b.x + b.width * (0.06 + rand() * 0.88), ty = b.y + b.height * (rand() < 0.55 ? 0.08 + rand() * 0.4 : 0.45 + rand() * 0.5);
        await glide(tx, ty, 650 + rand() * 1300);
        // sometimes a small wiggle in place, sometimes a pause
        if (rand() < 0.35) for (let j = 0; j < 3; j++) await glide(M.x + (rand() - 0.5) * 50, M.y + (rand() - 0.5) * 40, 200 + rand() * 200);
        else await page.waitForTimeout(150 + rand() * 700).catch(() => {});
      } else if (mode.go) {
        const l = page.locator(mode.go).first();
        await l.waitFor({ state: 'visible', timeout: 40000 }).catch(() => {});
        await page.waitForTimeout(mode.delay ?? 200 + rand() * 900).catch(() => {});
        const b = await l.boundingBox().catch(() => null);
        if (!b) { M.mode = 'wander'; M.done?.(); M.done = null; continue; }
        let tx = b.x + b.width * (0.3 + rand() * 0.4), ty = b.y + b.height * (0.35 + rand() * 0.3);
        // (a target outside the desk, like the live game's Join bar above it: the board only sees the desk, so the
        // cursor first heads to the desk's edge nearest it and waits there a moment, which is what the board shows)
        const d = mode.edge ? await deskBox() : null;
        if (d) {
          const ex = Math.min(d.x + d.width - 12, Math.max(d.x + 12, tx + (rand() - 0.5) * 40)), ey = d.y + 6 + rand() * 10;
          await glide(ex, ey, 700 + rand() * 500);
          if (mode.then !== 'click') { M.mode = { hover: true, x: ex, y: ey }; M.done?.(); M.done = null; continue; }
          await page.waitForTimeout(400 + rand() * 400).catch(() => {});
          await glide(tx, ty, 250 + rand() * 150);
        } else await glide(tx, ty, 700 + rand() * 500);
        if (mode.then === 'click') { await page.waitForTimeout(250 + rand() * 300).catch(() => {}); await page.mouse.click(M.x, M.y).catch(() => {}); M.mode = 'idle'; }
        else { M.mode = { hover: true, x: tx, y: ty }; }
        M.done?.(); M.done = null;
      } else if (mode.hover) {
        await glide(mode.x + (rand() - 0.5) * 24, mode.y + (rand() - 0.2) * 12, 300 + rand() * 400);
        await page.waitForTimeout(100 + rand() * 300).catch(() => {});
      } else await page.waitForTimeout(200).catch(() => {});
    }
  }
  M.run = loop();
  /** Head for css; resolves once the mouse is there. */
  M.go = (css, then = 'hover', delay, edge = false) => new Promise(res => { M.done = res; M.mode = { go: css, then, delay, edge }; });
  M.wander = () => { M.mode = 'wander'; };
  M.idle = () => { M.mode = 'idle'; };
  M.stop = () => { M.stopped = true; return M.run; };
  return M;
}

// ---------------------------------------------------------------- the look: the headline and the end card
const FONT = `@font-face{font-family:Brico;src:url(/fonts/bricolage-grotesque-latin-opsz-normal.woff2) format('woff2');font-weight:200 800}`;
const BRAND = {};
/** A frame of the video: the board picture under the camera (cam: { x, y, w } in CSS px of the 1920 x 1080 board, h
 *  follows 16:9), a soft vignette, and the headline (the dark ink pill, cream words, the mint word). */
const frameHtml = (img, cam, line, { mint = '', place = 'bl', sub = '' } = {}) => {
  const z = VW / cam.w;
  const words = line && mint ? line.replace(mint, `<em>${mint}</em>`) : line || '';
  const pos = { bl: 'left:72px;bottom:72px', tl: 'left:72px;top:64px', br: 'right:72px;bottom:72px', tr: 'right:72px;top:64px' }[place];
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONT}
html,body{margin:0;width:${VW}px;height:${VH}px;overflow:hidden;background:#161814}
.cam{position:absolute;left:0;top:0;width:${VW}px;height:${VH}px;transform-origin:0 0;transform:scale(${z}) translate(${-cam.x}px,${-cam.y}px)}
.cam img{width:${VW}px;height:${VH}px;display:block}
.vig{position:absolute;inset:0;background:radial-gradient(120% 95% at 50% 46%,transparent 58%,rgba(20,22,18,.32) 100%)}
.h{position:absolute;${pos};display:flex;flex-direction:column;align-items:flex-start;gap:14px;font-family:Brico,system-ui,sans-serif}
.pill{background:#141414;color:#FFFDF2;font-weight:800;font-size:92px;line-height:1;letter-spacing:-.035em;padding:24px 44px 30px;border-radius:999px;box-shadow:0 18px 50px rgba(0,0,0,.35),0 0 0 3px rgba(255,253,242,.08)}
.pill em{font-style:normal;color:#66C792}
.sub{background:#FFFDF2;color:#141414;font-weight:700;font-size:34px;letter-spacing:-.01em;padding:12px 26px 14px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.2);margin-left:18px}
.mark{position:absolute;right:56px;bottom:50px;display:flex;align-items:center;gap:12px;opacity:.92;background:rgba(255,253,242,.9);border-radius:999px;padding:10px 20px 10px 12px}
.mark .appmark{width:40px;height:40px}.mark .wordmark{height:22px;width:auto;color:#1f1f1b}
.appmark .am-bg{fill:#66c792}.appmark .am-eyes{fill:none;stroke:#141414}.appmark .am-pupils{fill:#141414}.appmark .am-spark{fill:#ffd23f;stroke:#141414}.wordmark .spark{fill:#ffd23f;stroke:transparent}
</style></head><body><div class="cam"><img src="${img}"></div><div class="vig"></div>
${line ? `<div class="h"><span class="pill">${words}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>` : ''}
</body></html>`;
};
const endHtml = () => `<!doctype html><html><head><meta charset="utf-8"><style>${FONT}
html,body{margin:0;width:${VW}px;height:${VH}px;overflow:hidden}
body{display:grid;place-items:center;text-align:center;font-family:Brico,system-ui,sans-serif;background:radial-gradient(1300px 780px at 50% 42%,#2b3a30 0%,#161814 72%);color:#FFFDF2}
.logo{width:150px;height:150px;margin:0 auto 46px;border-radius:40px;box-shadow:0 0 120px rgba(102,199,146,.5)}.logo svg{width:150px;height:150px;display:block}
.appmark .am-bg{fill:#66c792}.appmark .am-eyes{fill:none;stroke:#141414}.appmark .am-pupils{fill:#141414}.appmark .am-spark{fill:#ffd23f;stroke:#141414}.wordmark .spark{fill:#ffd23f;stroke:transparent}
h1{margin:0;font-size:112px;line-height:1.02;letter-spacing:-.04em;font-weight:800;max-width:1500px}
h1 em{font-style:normal;color:#66C792}
.pill{display:inline-flex;align-items:center;gap:18px;margin-top:54px;background:#FFFDF2;color:#141414;border-radius:999px;padding:18px 40px 20px;font-size:40px;font-weight:700;letter-spacing:-.015em}
.pill b{font-weight:800}
.word{display:block;margin:44px auto 0;height:40px;width:auto;color:#a8a596}
</style></head><body><div><div class="logo">${BRAND.mark}</div><h1>The one classroom tool <em>for everything.</em></h1>
<span class="pill"><b>The Hub.</b> Available with the Teacher plan.</span>${BRAND.word.replace('class="wordmark"', 'class="wordmark word"')}</div></body></html>`;

// ---------------------------------------------------------------- the run
async function main() {
  const R = ROOT + '/';
  const { appMark, wordmark } = await import(R + 'server/views/brand.js');
  Object.assign(BRAND, { mark: String(appMark('appmark')), word: String(wordmark('wordmark')) });
  const W0 = await seed(R);
  const { T } = W0;
  const { startSession } = await import(R + 'server/auth.js');
  const { createApp } = await import(R + 'server/app.js');
  const { attachUpgrades } = await import(R + 'server/services/upgrade.js');
  const classLive = await import(R + 'server/services/classlive-socket.js');
  const manipSocket = await import(R + 'server/services/manip-socket.js');
  const server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  attachUpgrades(server, [classLive.route, manipSocket.route]);
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c.split('='); };
  const { chromium } = await import('playwright');
  const { launchOptions } = await import(R + 'scripts/chromium.js');
  const browser = await chromium.launch(launchOptions({ args: ['--no-sandbox', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'] }));
  const errors = [];
  const open = async (who, url, { w = VW, h = VH, dpr = 1, label = '', overlay = false } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, locale: 'en-US', colorScheme: 'light', timezoneId: 'America/New_York' });
    if (overlay) await ctx.addInitScript(overlayInit, [OVERLAY_CSS, POINTER_SVG]);
    const [n, v] = cookieOf(who.id);
    await ctx.addCookies([{ name: n, value: v, url: BASE }, { name: 'theme', value: 'light', url: BASE }]);
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', e => errors.push(`${label}: page error: ${e.message}`));
    page.on('response', r => { if (r.status() >= 500) errors.push(`${label}: HTTP ${r.status()} ${r.url()}`); });
    if (url) await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    return { ctx, page };
  };
  const ctxs = [];
  try {
    if (!RENDER_ONLY) await film({ open, ctxs, errors, W0, BASE, T });
    if (VIDEO) await renderVideo({ open, ctxs, BASE, T });
  } finally {
    for (const c of ctxs) await c.close().catch(() => {});
    await browser.close().catch(() => {});
    server.closeAllConnections(); server.close();
  }
}

// ---------------------------------------------------------------- the teacher's pointer (drawn into the filmed page)
const OVERLAY_CSS = `
#tut-ptr{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:30px;height:36px;transform:translate(-100px,-100px);filter:drop-shadow(0 3px 4px rgba(0,0,0,.3));opacity:0;transition:opacity .3s}
#tut-ptr.on{opacity:1}
.tut-ring{position:fixed;z-index:2147483646;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:4px solid #FFD23F;box-shadow:0 0 0 2px rgba(20,20,20,.15);animation:tutring .55s ease-out forwards}
@keyframes tutring{from{transform:scale(.35);opacity:1}to{transform:scale(1.35);opacity:0}}`;
const POINTER_SVG = '<svg viewBox="0 0 34 40" width="30" height="36"><path d="M3 2 L3 32 L11 25 L17 38 L23 35 L17 23 L28 23 Z" fill="#141414" stroke="#FFFDF2" stroke-width="2.5" stroke-linejoin="round"/></svg>';
function overlayInit([css, ptr]) {
  if (window.top !== window) return;
  const put = () => {
    if (document.getElementById('tut-ptr') || !document.body) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const p = document.createElement('div'); p.id = 'tut-ptr'; p.innerHTML = ptr; document.body.appendChild(p);
  };
  if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
}
/** The teacher's hand: a pointer that glides (eased) to what it clicks, a ring on each click. In the stills mode it is
 *  never shown and clicks are plain. */
function hand(page, on) {
  let cur = { x: VW * 0.62, y: VH * 0.55 };
  const glide = async (x, y, ms = 650) => {
    const from = cur; cur = { x, y };
    const dist = Math.hypot(x - from.x, y - from.y); ms = Math.round(Math.max(260, Math.min(ms, 240 + dist * 0.7)));
    const anim = page.evaluate(([fx, fy, x, y, ms]) => new Promise(res => {
      const p = document.getElementById('tut-ptr'); if (!p) return res(); p.classList.add('on');
      const t0 = performance.now();
      const f = now => { const k = Math.min(1, (now - t0) / ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        p.style.transform = `translate(${fx + (x - fx) * e - 3}px,${fy + (y - fy) * e - 2}px)`; if (k < 1) requestAnimationFrame(f); else res(); };
      requestAnimationFrame(f);
    }), [from.x, from.y, x, y, ms]);
    await page.mouse.move(x, y, { steps: Math.max(4, Math.round(ms / 40)) });
    await anim;
  };
  const at = async css => { const l = page.locator(css).first(); await l.waitFor({ state: 'visible', timeout: 20000 }); const b = await l.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  return {
    async click(css) {
      if (!on) return page.click(css);
      const p = await at(css); await glide(p.x, p.y); await page.waitForTimeout(120);
      await page.evaluate(([x, y]) => { const r = document.createElement('div'); r.className = 'tut-ring'; r.style.left = `${x}px`; r.style.top = `${y}px`; document.body.appendChild(r); setTimeout(() => r.remove(), 650); }, [p.x, p.y]);
      // (the real click on the element itself, wherever it is now: a bar can still be settling)
      const box = await page.locator(css).first().boundingBox().catch(() => null);
      if (box && Math.abs(box.x + box.width / 2 - p.x) + Math.abs(box.y + box.height / 2 - p.y) > 4) await glide(box.x + box.width / 2, box.y + box.height / 2, 200);
      await page.locator(css).first().click(); await page.waitForTimeout(200);
    },
    async type(css, text) {
      if (!on) return page.fill(css, text);
      await this.click(css); await page.keyboard.type(text, { delay: 45 });
    },
    async park(x, y) { if (on) await glide(x, y, 500); },
    hide: () => (on ? page.evaluate(() => document.getElementById('tut-ptr')?.classList.remove('on')) : null),
  };
}

// ---------------------------------------------------------------- recording (the video mode)
/** Chromium's screencast of the board at full size: every frame a JPEG with the time it came in. */
async function screencast(page, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async f => {
    const file = `${String(frames.length).padStart(6, '0')}.jpg`;
    frames.push({ file, t: Date.now() / 1000 });
    fs.writeFileSync(path.join(dir, file), Buffer.from(f.data, 'base64'));
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1, maxWidth: VW, maxHeight: VH });
  return { frames, async stop() { await cdp.send('Page.stopScreencast'); await new Promise(r => setTimeout(r, 300)); return frames; } };
}

async function film({ open, ctxs, errors, W0, BASE }) {
  const R = ROOT + '/';
  const { T, cls, kids, gid } = W0;
  const HP = await import(R + 'server/services/homeroom-plan.js');
  const LS = await import(R + 'server/services/classlive-sessions.js');
  const CO = await import(R + 'server/services/companion.js');
  const OUT = STILLS || VIDEO;
  if (STILLS) fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true });
  else { fs.rmSync(path.join(OUT, 'rec'), { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'rec'), { recursive: true }); }

  const today = HP.cleanPlan(T, cls, { name: 'Fractions day', topic: 'fractions', parts: [
    { kind: 'slides', minutes: 8, title: 'Number lines' },
    { kind: 'work', minutes: 20, title: 'Pair practice' },
    { kind: 'break', minutes: 3, title: 'Wiggle break' },
    { kind: 'exit', minutes: 5, title: 'Exit ticket' }] }).plan;
  if (!HP.usePlan(T, cls, today).ok) throw new Error('the day plan');
  const lastWords = p => { for (let i = p.messages.length - 1; i >= 0; i--) { const m = p.messages[i]; if (m.role !== 'user') continue; if (typeof m.content === 'string') return m.content; const t = m.content.find(c => c.type === 'text'); if (t) return t.text; } return ''; };
  CO.hooks.create = async p => {
    const last = p.messages.at(-1), after = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    const base = { model: p.model, usage: { input_tokens: 1, output_tokens: 1 } };
    if (/point/i.test(lastWords(p))) return after ? { ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done. The whole class got a point for teamwork.' }] }
      : { ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${Date.now()}`, name: 'givePoint', input: { target: 'class', reason: 'teamwork' } }] };
    return { ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Happy to help.' }] };
  };

  // ---- the students: real desks, each with its own moving mouse
  const desk = `/class/${cls.id}/desk`;
  const kp = [], mice = [];
  for (const [i, k] of kids.entries()) { const s = await open(k, desk, { w: 1024, h: 700, label: k.display_name }); ctxs.push(s.ctx); kp[i] = s.page; }
  const kidDo = async (i, f) => { try { await f(kp[i]); } catch (e) { errors.push(`${kids[i].display_name}: ${e.message.split('\n')[0]}`); } };

  // ---- the teacher's board, big
  // (the video mode films with Chromium's screencast, which sends frames at the page's CSS size whatever the device
  // scale, so the board renders at 1x there and the camera never zooms in past about 2x)
  const { ctx: tctx, page } = await open(T, `/class/${cls.id}/hub`, { dpr: VIDEO ? 1 : DPR, label: 'teacher', overlay: !!VIDEO });
  ctxs.push(tctx);
  const me = hand(page, !!VIDEO);
  await page.waitForSelector('.hr-desk[data-sid]');
  await page.waitForTimeout(1200);
  await page.click('[data-hr="golive"]'); await page.waitForSelector('#hr-live:not([hidden])');
  await page.click('[data-hr="fit"]').catch(() => {});
  await page.waitForTimeout(400);
  // closer: 100 %, the desks in the middle of the free part of the screen (dragging the empty floor pans the board)
  for (let i = 0; i < 4 && !/^(9\d|1\d\d)%$/.test((await page.textContent('#hr-zoom .rm-pct')).trim()); i++) { await page.click('[data-hr="zin"]'); await page.waitForTimeout(350); }
  for (let tries = 0; tries < 3; tries++) {
    const r = await page.evaluate(() => {
      const rs = [...document.querySelectorAll('.hr-desk[data-sid]')].map(e => e.getBoundingClientRect());
      const box = { x: Math.min(...rs.map(r => r.left)), y: Math.min(...rs.map(r => r.top)) - 24, x2: Math.max(...rs.map(r => r.right)), y2: Math.max(...rs.map(r => r.bottom)) };
      const panel = document.getElementById('hr-panel').getBoundingClientRect();
      const free = { x: panel.right + 20, y: document.querySelector('.hr-stage').getBoundingClientRect().top + 10 };
      const want = { x: free.x + (innerWidth - free.x) / 2, y: free.y + (innerHeight - free.y) / 2 };
      // an empty spot of floor to drag
      let spot = null;
      for (let y = 160; y < innerHeight - 80 && !spot; y += 23) for (let x = innerWidth - 40; x > free.x && !spot; x -= 37) {
        const el = document.elementFromPoint(x, y);
        if (el && !el.closest('.hr-desk, .hr-area, .hr-tdesk, #hr-tdesk, #hr-panel, button, a, input, .hr-mini, #hr-mini, #oc, #oc-bubble, .rm-zoom, .hr-curs, [data-hrtd], .hr-note, .hr-fl')) spot = { x, y };
      }
      return { dx: want.x - (box.x + box.x2) / 2, dy: want.y - (box.y + box.y2) / 2, spot };
    });
    if (!r.spot || (Math.abs(r.dx) < 6 && Math.abs(r.dy) < 6)) break;
    const { x, y } = r.spot;
    await page.mouse.move(x, y); await page.mouse.down();
    for (let k = 1; k <= 12; k++) await page.mouse.move(x + (r.dx * k) / 12, y + (r.dy * k) / 12);
    await page.mouse.up(); await page.waitForTimeout(300);
  }
  await page.mouse.move(VW - 30, VH - 30);
  for (const [i, p] of kp.entries()) { await p.waitForTimeout(40); mice[i] = mouseOf(p, 1000 + i * 7919); }
  // the desks start sending once their poll hears class is live: give the cursors a few seconds
  await page.waitForFunction(n => document.querySelectorAll('.hr-curs .hr-cur').length >= n, kids.length - 2, { timeout: 30000 });
  await page.waitForTimeout(4000);
  // (the toasts of going live are gone by now)

  const shots = [], marks = {};
  /** A box on the board's page (CSS px) of css, or the union of all matches. */
  const boxOf = async (css, all = false) => page.evaluate(([css, all]) => {
    const els = all ? [...document.querySelectorAll(css)] : [document.querySelector(css)].filter(Boolean);
    if (!els.length) return null;
    const rs = els.map(e => e.getBoundingClientRect());
    const x = Math.min(...rs.map(r => r.left)), y = Math.min(...rs.map(r => r.top)), x2 = Math.max(...rs.map(r => r.right)), y2 = Math.max(...rs.map(r => r.bottom));
    return { x, y, w: x2 - x, h: y2 - y };
  }, [css, all]);
  const union = (...bs) => { bs = bs.filter(Boolean); const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y)); return { x, y, w: Math.max(...bs.map(b => b.x + b.w)) - x, h: Math.max(...bs.map(b => b.y + b.h)) - y }; };
  const frameOn = (b, pad = 1.25, minW = 520) => camFor(b, pad, minW);
  /** stills: a picture of the board now; video: a mark on the recording's clock (with a framing for the edit). */
  const mark = (name, cam) => { marks[name] = { t: Date.now() / 1000, cam: cam || null }; if (VIDEO) console.log('mark', name); };
  const shoot = async (name, cam, line, o = {}) => {
    if (VIDEO) return mark(name, cam);
    const raw = path.join(OUT, 'raw', `${name}.png`);
    await page.screenshot({ path: raw });
    shots.push({ name, cam, line, ...o, raw });
    console.log('shot', name, JSON.stringify(cam));
  };
  const deskSel = i => `.hr-desk[data-sid="${kids[i].id}"]`;
  const room = await boxOf('.hr-desk[data-sid]', true);
  const wide = frameOn(room, 1.08, 900);
  const cams = {
    wide, full: { x: 0, y: 0, w: VW },
    table: frameOn(await boxOf([0, 1, 2, 3].map(deskSel).join(','), true), 1.2, 700),
    pod: frameOn(await boxOf([0, 1, 2, 3, 4, 5, 6, 7].map(deskSel).join(','), true), 1.12),
    mid: frameOn(await boxOf([8, 9, 10, 11, 12, 13, 14, 15].map(deskSel).join(','), true), 1.12),
    panel: frameOn(union(await boxOf('#hr-panel'), await boxOf('#hr-cq')), 1.05, 900),
  };
  const rec = VIDEO ? await screencast(page, path.join(OUT, 'rec')) : null;
  if (VIDEO) await page.waitForTimeout(500);

  // 1. Cold open: the whole room, every cursor moving
  mark('open');
  if (VIDEO) await page.waitForTimeout(11000);
  await shoot('01-cold-open', wide, 'Every desk. Live.', { mint: 'Live.', t: 0 });

  // 2. Hand out a game to the whole class: the cards land, every cursor swoops to it
  const hunt = `#hr-panel [data-hritem="${gid('word-hunt')}"]:visible`;
  mark('panel');
  await me.type('#hr-cq', 'word hunt'); mark('typed'); await page.waitForSelector(hunt);
  await me.click(hunt); await page.waitForSelector('#hr-givebar:not([hidden])'); mark('picked');
  await me.click('#hr-groupchips [data-hrto="all"]'); await page.waitForSelector('.hr-giveform');
  // every student heads for the new card as soon as it lands on their desk
  const swoop = mice.map(m => m.go('.hd-card:has-text("Word Hunt")', 'hover'));
  mark('giveform', frameOn(union(await boxOf('#hr-panel'), await boxOf('.hr-giveform')), 1.05, 900));
  await me.click('.hr-giveok');
  mark('give');
  await page.waitForFunction(n => document.querySelectorAll('.hr-desk[data-sid] .hr-card').length >= n, kids.length, { timeout: 15000 });
  mark('cards');
  if (VIDEO) await me.park(VW * 0.17, VH * 0.93);
  // the board hears the cursors a beat later (samples go every 2 s): catch them on the way
  // (about 4 s after the give, the board is mid-swoop: the samples go every 2 s and the board polls every 2 s)
  await page.waitForTimeout(3800);
  await shoot('02-swoop', cams.pod, 'Hand out anything.', { mint: 'anything.' });
  await Promise.all(swoop); await page.waitForTimeout(3200);
  await shoot('03-swooped', wide, 'Hand out anything.', { mint: 'anything.' });
  if (!VIDEO) await page.fill('#hr-cq', '');

  // ...and they open it: every desk switches to the game, live
  mark('open-game');
  await Promise.all(mice.map((m, i) => m.go('.hd-card:has-text("Word Hunt")', 'click', 100 + (i % 6) * 120)));
  await Promise.all(kids.map((k, i) => kidDo(i, async p => {
    const g = p.frameLocator('.hr-playframe').frameLocator('iframe').first();
    const b = g.getByText(/Daily puzzle/).first(); await b.waitFor({ timeout: 30000 }); await p.waitForTimeout(i * 90); await b.click();
  })));
  await page.waitForTimeout(6000);
  await page.waitForFunction(n => document.querySelectorAll('.hr-desk[data-sid] .hr-screen img.hr-simg').length >= n, kids.length - 4, { timeout: 90000 }).catch(e => errors.push(`live pictures: ${e.message.split('\n')[0]}`));
  await page.waitForTimeout(2500);
  await shoot('04-switched', wide, 'Hand out anything.', { mint: 'anything.' });
  if (VIDEO) await page.fill('#hr-cq', '');

  // back to their desks (off camera), wandering again
  await Promise.all(kids.map((k, i) => kidDo(i, async p => { if (await p.locator('.hr-playback').isVisible().catch(() => false)) { await p.click('.hr-playback'); await p.waitForSelector('.hr-player', { state: 'detached', timeout: 20000 }); } })));
  mice.forEach(m => m.wander());
  await page.waitForTimeout(4500);

  // 3. A raised hand, then the help queue
  const H = 13;
  mice[H].idle();
  await kidDo(H, async p => { await p.click('.hd-handbtn'); await p.click('.hd-hmi:has-text("I have a question")'); await p.waitForSelector('.hd-note.up'); });
  mice[H].wander();
  await page.waitForSelector(`${deskSel(H)} .hr-lvhand`, { timeout: 15000 });
  mark('hand', frameOn(await boxOf(deskSel(H)), 3.2, 800));
  await page.waitForTimeout(1200);
  await shoot('05a-hand', frameOn(await boxOf(deskSel(H)), 3.2, 800), 'Hands up, sorted.', { mint: 'sorted.', place: 'tl' });
  mark('queue-go');
  await me.click('.hr-handsbtn'); await page.waitForSelector('.hr-hrow');
  mark('queue', frameOn(union(await boxOf('#hr-flpanel'), await boxOf('.hr-handsbtn')), 1.25, 900));
  await page.waitForTimeout(900);
  await shoot('05b-queue', frameOn(await boxOf('#hr-flpanel'), 1.5, 900), 'Hands up, sorted.', { mint: 'sorted.', place: 'bl' });
  await me.click('[data-hrhand^="answer:"]'); mark('answered'); await page.waitForTimeout(700);
  await me.click('.hr-handsbtn').catch(() => {});

  // 4. The day plan's Now bar
  const startBox = await boxOf('#hr-plan');
  mark('plan-go');
  await me.click('#hr-plan [data-hrplan="start"]');
  await page.waitForFunction(() => /Now/.test(document.querySelector('#hr-plan')?.textContent || ''), null, { timeout: 10000 });
  mark('plan', frameOn(union(startBox, await boxOf('#hr-plan .hr-pp-run, #hr-plan .hr-pp-act', true)), 1.5, 900));
  await page.waitForTimeout(1200);
  await shoot('06-now', frameOn(await boxOf('#hr-plan .hr-pp-run, #hr-plan .hr-pp-act', true), 1.5, 900), 'Your day, on track.', { mint: 'on track.', place: 'bl' });
  if (VIDEO) { await me.click('#hr-plan [data-hrplan="next"]'); mark('next'); await page.waitForTimeout(1800); }

  // 5. A live game: everyone taps Join on their desk, the cursors converge again
  mark('live-go');
  await me.click('#hr-panel [data-csubj="live"]'); await me.click('#hr-panel [data-hrlive*="mode=board"]');
  mark('host');
  const LF = page.frameLocator('.hr-liveframe');
  const framePath = () => page.evaluate(() => { const f = document.querySelector('.hr-liveframe'); try { return f.contentWindow.location.pathname; } catch { return ''; } });
  await LF.locator('#lv-new').waitFor({ timeout: 20000 });
  if (VIDEO) await page.waitForTimeout(900);
  mark('host-shown');
  for (let i = 0; i < 8 && !(await framePath()).startsWith('/live/host/'); i++) {
    const next = LF.locator('#lv-nav [data-go="next"]');
    const go = (await next.isVisible().catch(() => false)) ? next : LF.locator('#lv-new [type="submit"]:visible').first();
    await go.click(); await page.waitForTimeout(500);
  }
  if (!LS.openForClass(cls.id)) throw new Error('no live game');
  await page.click('.hr-liveplayer [data-lg="min"]'); await page.waitForSelector('#hr-lgpill');
  if (VIDEO) await me.park(VW * 0.5, VH * 0.08);
  await Promise.all(kp.map(p => p.waitForSelector('#hd-lgbar [data-lgjoin]', { timeout: 40000 }).catch(() => {})));
  mark('lgbar');
  const join = mice.map(m => m.go('#hd-lgbar [data-lgjoin]', 'hover', undefined, true));
  await Promise.all(join); await page.waitForTimeout(3500);
  await shoot('07-join', cams.mid, 'Games in one tap.', { mint: 'one tap.' });
  mark('join');
  await Promise.all(mice.map((m, i) => m.go('#hd-lgbar [data-lgjoin]', 'click', 60 + (i % 5) * 140, true)));
  await page.waitForFunction(() => /\b(2[0-4]) joined/.test(document.querySelector('#hr-lgpill')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
  mark('joined', frameOn(await boxOf('#hr-lgpill'), 1.8, 900));
  await page.waitForTimeout(4000);
  await shoot('07b-joined', frameOn(await boxOf('#hr-lgpill'), 1.8, 900), 'Games in one tap.', { mint: 'one tap.' });

  // 6. Ask Oomba
  mark('oomba-go');
  await me.click('#oc-bubble'); await page.waitForSelector('#oc-in');
  await me.type('#oc-in', 'Give the whole class a point for teamwork');
  await me.click('#oc-send');
  mark('sent');
  await page.waitForFunction(() => /teamwork/i.test(document.querySelector('#oc .oc-point')?.textContent || ''), null, { timeout: 30000 });
  mark('card', frameOn(await boxOf('#oc .oc-point, #oc .oc-msg, #oc [class*="oc-me"], #oc [class*="user"]', true), 1.3, 900));
  await page.waitForTimeout(1500);
  await shoot('08-oomba', frameOn(await boxOf('#oc .oc-point, #oc .oc-msg, #oc [class*="oc-me"], #oc [class*="user"]', true), 1.3, 900), 'Just ask Oomba.', { mint: 'Oomba.', place: 'bl' });
  if (VIDEO) await page.waitForTimeout(1500);

  // 7. Pull back: the whole room (the end card follows)
  await page.click('#oc [data-c="min"]').catch(() => {});
  if (VIDEO) {
    // the game ends (off camera) and everyone is back at their desk, moving again
    await me.hide();
    await page.click('#hr-lgpill [data-lg="end"]').catch(() => {}); await page.click('dialog[open] [data-ob="ok"]').catch(() => {});
    await page.waitForSelector('#hr-lgpill', { state: 'detached', timeout: 15000 }).catch(() => {});
    await Promise.all(kids.map((k, i) => kidDo(i, async p => { await p.waitForSelector('.hr-player', { state: 'detached', timeout: 15000 }).catch(() => {}); })));
    mice.forEach(m => m.wander());
    await page.waitForFunction(n => document.querySelectorAll('.hr-curs .hr-cur').length >= n, kids.length - 4, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);
    mark('room');
    await page.waitForTimeout(7000);
  } else await page.waitForTimeout(1500);
  await shoot('09-pullback', { x: 0, y: 0, w: VW }, '', {});

  for (const m of mice) m.stop();
  if (errors.length) console.warn('page errors:\n  ' + errors.join('\n  '));

  if (VIDEO) {
    const frames = await rec.stop();
    fs.writeFileSync(path.join(OUT, 'rec', 'rec.json'), JSON.stringify({ frames, marks, cams }, null, 1));
    const span = frames.at(-1).t - frames[0].t;
    console.log(`recorded ${frames.length} frames in ${span.toFixed(1)} s (${(frames.length / span).toFixed(1)} fps)`);
    return;
  }

  // ---- the stills, as they will look
  const { ctx: cctx, page: cp } = await open(T, null, { label: 'cards' }); ctxs.push(cctx);
  const render = async (html, file) => { await cp.route(`${BASE}/__f`, r => r.fulfill({ contentType: 'text/html', body: html })); await cp.goto(`${BASE}/__f`); await cp.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode().catch(() => {}))])); await cp.screenshot({ path: file }); await cp.unroute(`${BASE}/__f`); };
  await cp.route(`${BASE}/__raw/**`, r => r.fulfill({ path: path.join(OUT, 'raw', decodeURIComponent(r.request().url().split('/__raw/')[1])), contentType: 'image/png' }));
  const finals = [];
  for (const s of shots) {
    const file = path.join(OUT, `${s.name}.png`);
    await render(frameHtml(`/__raw/${encodeURIComponent(path.basename(s.raw))}`, s.cam, s.line, s), file);
    finals.push(file);
  }
  const endFile = path.join(OUT, '10-end.png'); await render(endHtml(), endFile); finals.push(endFile);
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(shots.map(({ raw, ...s }) => s), null, 2));
  if (!RAW) fs.rmSync(path.join(OUT, 'raw'), { recursive: true, force: true });
  console.log(finals.join('\n'));
}

/** A camera framing a box with some room around it (16:9, inside the 1920 x 1080 page). */
function camFor(b, pad = 1.25, minW = 520) {
  let w = Math.max(minW, b.w * pad, b.h * pad * 16 / 9); w = Math.min(VW, w); const h = w * 9 / 16;
  const x = Math.min(VW - w, Math.max(0, b.x + b.w / 2 - w / 2)), y = Math.min(VH - h, Math.max(0, b.y + b.h / 2 - h / 2));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w) };
}

// ---------------------------------------------------------------- the edit (video mode, after the recording)
// The cut is on the music's bars: 115 BPM, a bar is 2.087 s, and the end card's first frame is bar 24 (the track's
// bright-section downbeat at 101.16 s, so the track starts at 51.07 s, a phrase start).
const BPM = 115, BAR = (60 / BPM) * 4, TRACK_START = 101.16 - 24 * BAR, LEN = 28.5 * BAR, FPS = 30;
const bars = n => n * BAR;
/** The headlines (and the captions): [line, mint word, from bar, to bar, place]. */
const LINES = [
  ['Every desk. Live.', 'Live.', 1, 4, 'bl'],
  ['Hand out anything.', 'anything.', 6, 9, 'bl'],
  ['Hands up, sorted.', 'sorted.', 9, 12, 'tl'],
  ['Your day, on track.', 'on track.', 12, 14, 'bl'],
  ['Games in one tap.', 'one tap.', 15, 18, 'bl'],
  ['Just ask Oomba.', 'Oomba.', 18, 22, 'bl'],
];
const END_LINE = 'The one classroom tool for everything. The Hub. Available with the Teacher plan.';

/** The edit list from the recording's marks: segments of source time and the camera's moves, in output seconds. */
function cutList({ marks, cams }) {
  const m = k => { if (!marks[k]) throw new Error(`no mark ${k}`); return marks[k].t; };
  const c = k => marks[k].cam;
  const segs = [], moves = [];
  /** out [a, b) plays source from s0 to s1 (speed = their ratio, at least 1 unless slow is allowed). */
  const seg = (a, b, s0, s1) => { const d = bars(b) - bars(a); if (s1 == null) s1 = s0 + d; segs.push({ a: bars(a), b: bars(b), s0, s1 }); };
  const MINW = 900;   // (the recording is 1920 x 1080: at most about 2x in)
  const widen = c => { if (c.w >= MINW) return c; const cx = c.x + c.w / 2, cy = c.y + (c.w * 9) / 32, w = MINW, h = (w * 9) / 16; return { x: Math.min(VW - w, Math.max(0, cx - w / 2)), y: Math.min(VH - h, Math.max(0, cy - h / 2)), w }; };
  const move = (t, cam, dur = 1) => moves.push({ t, cam: widen(cam), dur });
  const fit = (s0, s1, d, max = 3) => { const n = (s1 - s0) / d; return n > max ? s0 + d * max : s1; };   // (never faster than max)
  // 1. cold open: tight on a table, a slow pull back to the room
  seg(0, 4, m('open') + 0.4);
  move(0, cams.table, 0); move(bars(1), cams.wide, bars(2));
  // 2a. the teacher hands Word Hunt to the whole class, in three quick jump cuts: typing, picking it, Give
  const typed = marks.typed ? m('typed') : m('panel') + 4.3, picked = marks.picked ? m('picked') : m('panel') + 11.3;
  seg(4, 4.5, typed - 2.5, typed);
  seg(4.5, 5.25, picked - 3, picked);
  seg(5.25, 6, m('giveform') - 0.1, m('give') + 0.3);
  move(bars(4), c('giveform'), 0.35);
  // 2b. the cards land, every cursor swoops to them
  seg(6, 8, m('cards') - 0.3, fit(m('cards') - 0.3, m('cards') + 6.2, bars(2), 1.6));
  move(bars(6), cams.wide, 0.35); move(bars(6) + 0.5, cams.pod, 1.8); move(bars(7) + 0.5, cams.wide, 1.4);
  // 2c. they open it: every desk flips to the game, live (a quick ripple)
  seg(8, 9, m('04-switched') - 12, m('04-switched'));
  move(bars(8), cams.wide, 0.3);
  // 3. a raised hand, then the queue
  seg(9, 10, m('hand') - 0.1);
  move(bars(9), c('hand'), 0.45);
  seg(10, 12, m('queue-go') - 0.3, fit(m('queue-go') - 0.3, m('answered') + 1.0, bars(2), 2));
  move(bars(10), c('queue'), 0.7);
  // 4. the day plan's Now bar
  seg(12, 14, m('plan-go') - 0.3, fit(m('plan-go') - 0.3, m('next') + 1.3, bars(2), 2.5));
  move(bars(12), c('06-now'), 0.5);
  // 5. a live game: the teacher starts it, the bar lands on every desk, the cursors go up, they join, the count
  seg(14, 15, m('live-go') - 0.2, fit(m('live-go') - 0.2, m('host-shown') + 0.2, bars(1), 2.5));
  move(bars(14), cams.panel, 0.45);
  seg(15, 16, m('join') - 5, m('join'));
  move(bars(15), cams.wide, 0.35); move(bars(15) + 0.4, cams.mid, 1.6);
  seg(16, 17, Math.max(m('join'), m('joined') - 8.5), m('joined') + 0.2);
  seg(17, 18, m('joined') - 0.6);
  move(bars(17), c('joined'), 0.4);
  // 6. Ask Oomba
  seg(18, 20, m('oomba-go') - 0.2, m('sent') + 0.5);
  seg(20, 22, m('card') - 1.0);
  move(bars(18), { x: 700, y: 393, w: 1220 }, 0.45); move(bars(19), c('card'), 1.2);
  // 7. pull back to the whole room
  seg(22, 24, m('room'));
  move(bars(22), cams.full, 2.8);
  return { segs, moves };
}
const easeIO = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
/** The camera at time t: the latest move eases from where the camera was when it began (zoom in log space). */
function camAt(moves, t) {
  const lerp = (from, to, k) => {
    const fw = from.w, tw = to.w, w = Math.exp(Math.log(fw) + (Math.log(tw) - Math.log(fw)) * k);
    const fc = { x: from.x + fw / 2, y: from.y + (fw * 9) / 32 }, tc = { x: to.x + tw / 2, y: to.y + (tw * 9) / 32 };
    const cx = fc.x + (tc.x - fc.x) * k, cy = fc.y + (tc.y - fc.y) * k, h = (w * 9) / 16;
    return { x: Math.min(VW - w, Math.max(0, cx - w / 2)), y: Math.min(VH - h, Math.max(0, cy - h / 2)), w };
  };
  const at = (mv, base, t) => lerp(base, mv.cam, mv.dur ? easeIO(Math.max(0, Math.min(1, (t - mv.t) / mv.dur))) : 1);
  let base = moves[0].cam, cur = moves[0].cam;
  for (let i = 1; i < moves.length && moves[i].t <= t; i++) {
    base = i === 1 ? moves[0].cam : at(moves[i - 1], base, moves[i].t);
    cur = at(moves[i], base, t);
  }
  return cur;
}
const playerHtml = () => `<!doctype html><html><head><meta charset="utf-8"><style>${FONT}
html,body{margin:0;width:${VW}px;height:${VH}px;overflow:hidden;background:#161814}
.cam{position:absolute;left:0;top:0;width:${VW}px;height:${VH}px;transform-origin:0 0}
.cam img{width:${VW}px;height:${VH}px;display:block}
.vig{position:absolute;inset:0;background:radial-gradient(120% 95% at 50% 46%,transparent 58%,rgba(20,22,18,.32) 100%)}
.h{position:absolute;display:flex;font-family:Brico,system-ui,sans-serif;opacity:0;transform-origin:0 100%}
.h.bl{left:72px;bottom:72px}.h.tl{left:72px;top:64px;transform-origin:0 0}
.pill{background:#141414;color:#FFFDF2;font-weight:800;font-size:92px;line-height:1;letter-spacing:-.035em;padding:24px 44px 30px;border-radius:999px;box-shadow:0 18px 50px rgba(0,0,0,.35),0 0 0 3px rgba(255,253,242,.08);white-space:nowrap}
.pill em{font-style:normal;color:#66C792}
#end{position:absolute;inset:0;display:grid;place-items:center;text-align:center;font-family:Brico,system-ui,sans-serif;background:radial-gradient(1300px 780px at 50% 42%,#2b3a30 0%,#161814 72%);color:#FFFDF2;opacity:0}
#end .in{transform-origin:50% 50%}
.logo{width:150px;height:150px;margin:0 auto 46px;border-radius:40px;box-shadow:0 0 120px rgba(102,199,146,.5)}.logo svg{width:150px;height:150px;display:block}
.appmark .am-bg{fill:#66c792}.appmark .am-eyes{fill:none;stroke:#141414}.appmark .am-pupils{fill:#141414}.appmark .am-spark{fill:#ffd23f;stroke:#141414}.wordmark .spark{fill:#ffd23f;stroke:transparent}
h1{margin:0;font-size:112px;line-height:1.02;letter-spacing:-.04em;font-weight:800;max-width:1500px}
h1 em{font-style:normal;color:#66C792}
.epill{display:inline-flex;align-items:center;gap:18px;margin-top:54px;background:#FFFDF2;color:#141414;border-radius:999px;padding:18px 40px 20px;font-size:40px;font-weight:700;letter-spacing:-.015em}
.epill b{font-weight:800}
.word{display:block;margin:44px auto 0;height:40px;width:auto;color:#a8a596}
#black{position:absolute;inset:0;background:#000;opacity:0}
</style></head><body><div class="cam" id="cam"><img id="img"></div><div class="vig"></div>
${LINES.map(([l, mint, , , place], i) => `<div class="h ${place}" id="h${i}"><span class="pill">${l.replace(mint, `<em>${mint}</em>`)}</span></div>`).join('')}
<div id="end"><div class="in"><div class="logo" id="elogo">${BRAND.mark}</div><h1 id="eh1">The one classroom tool <em>for everything.</em></h1>
<span class="epill" id="epill"><b>The Hub.</b> Available with the Teacher plan.</span><span id="eword">${BRAND.word.replace('class="wordmark"', 'class="wordmark word"')}</span></div></div><div id="black"></div>
<script>
const $ = id => document.getElementById(id);
const clamp = v => Math.max(0, Math.min(1, v)), out = k => 1 - Math.pow(1 - k, 3), back = k => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
let shown = '';
window.frame = async s => {
  if (s.src && s.src !== shown) { const im = $('img'); im.src = s.src; await im.decode().catch(() => {}); shown = s.src; }
  const z = ${VW} / s.cam.w; $('cam').style.transform = 'scale(' + z + ') translate(' + (-s.cam.x) + 'px,' + (-s.cam.y) + 'px)';
  s.lines.forEach((L, i) => { const e = $('h' + i); const a = clamp((s.t - L[0]) / 0.28), b = clamp((L[1] - s.t) / 0.3);
    e.style.opacity = Math.min(a, b); e.style.transform = 'scale(' + (0.9 + 0.1 * back(a)) + ')'; });
  const E = s.end; // end card: fade in over 0.3 s before its bar, then its parts
  $('end').style.opacity = clamp((s.t - (E - 0.3)) / 0.3);
  const k = s.t - E;
  $('elogo').style.transform = 'scale(' + (k < 0 ? 0.6 : 0.6 + 0.4 * back(clamp(k / 0.45))) + ')'; $('elogo').style.opacity = clamp(k / 0.2);
  $('eh1').style.opacity = clamp((k - 0.15) / 0.4); $('eh1').style.transform = 'translateY(' + (30 * (1 - out(clamp((k - 0.15) / 0.5)))) + 'px)';
  const p = k - ${BAR.toFixed(4)};
  $('epill').style.opacity = clamp(p / 0.3); $('epill').style.transform = 'scale(' + (p < 0 ? 0.9 : 0.9 + 0.1 * back(clamp(p / 0.35))) + ')';
  $('eword').style.opacity = clamp((p - 0.3) / 0.4);
  document.querySelector('#end .in').style.transform = 'scale(' + (1 + 0.02 * clamp(k / 9)) + ')';
  $('black').style.opacity = clamp((s.t - (s.len - 1.5)) / 1.5);
};
</script></body></html>`;

async function renderVideo({ open, ctxs, BASE, T }) {
  const OUT = VIDEO, recDir = path.join(OUT, 'rec');
  const R = JSON.parse(fs.readFileSync(path.join(recDir, 'rec.json'), 'utf8'));
  const { segs, moves } = cutList(R);
  const frames = R.frames, ts = frames.map(f => f.t);
  const frameAt = t => { let lo = 0, hi = ts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid - 1; } return frames[lo].file; };
  const outDir = path.join(OUT, 'frames'); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const { ctx, page } = await open(T, null, { label: 'player' }); ctxs.push(ctx);
  await page.route(`${BASE}/__src/**`, r => r.fulfill({ path: path.join(recDir, path.basename(new URL(r.request().url()).pathname)), contentType: 'image/jpeg' }));
  await page.route(`${BASE}/__player`, r => r.fulfill({ contentType: 'text/html', body: playerHtml() }));
  await page.goto(`${BASE}/__player`); await page.evaluate(() => document.fonts.ready);
  const lines = LINES.map(([, , a, b]) => [bars(a), bars(b) - 0.25]);
  const N = Math.round(LEN * FPS), t0 = Date.now();
  for (let n = 0; n < N; n++) {
    const t = n / FPS, sg = segs.find(s => t >= s.a && t < s.b) || segs.at(-1);
    const src = t < bars(24) + 0.05 ? frameAt(sg.s0 + ((t - sg.a) / (sg.b - sg.a)) * (sg.s1 - sg.s0)) : null;
    await page.evaluate(s => window.frame(s), { t, src: src ? `/__src/${src}` : null, cam: camAt(moves, t), lines, end: bars(24), len: LEN });
    await page.screenshot({ path: path.join(outDir, `${String(n).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
    if (n % 150 === 0) console.log(`frame ${n}/${N} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  // ---- the files: the music (the track from 51.07 s, its 101.16 s downbeat on the end card), the mp4, poster, captions
  const music = path.join(OUT, 'music.wav');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', TRACK_START.toFixed(3), '-t', LEN.toFixed(3), '-i', MUSIC, '-af', `aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:st=0:d=0.3,afade=t=out:st=${(LEN - 1.5).toFixed(3)}:d=1.5,loudnorm=I=-16:TP=-1.5:LRA=11`, '-ar', '48000', music]);
  const mp4 = path.join(OUT, `${NAME}.mp4`), log = path.join(OUT, 'x264');
  const vin = ['-framerate', String(FPS), '-i', path.join(outDir, '%05d.jpg')];
  const venc = ['-c:v', 'libx264', '-preset', 'slower', '-b:v', `${KBPS}k`, '-maxrate', `${Math.round(KBPS * 1.8)}k`, '-bufsize', `${KBPS * 3}k`, '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-g', '60', '-passlogfile', log];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...vin, ...venc, '-pass', '1', '-an', '-f', 'mp4', '/dev/null']);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...vin, '-i', music, ...venc, '-pass', '2', '-c:a', 'aac', '-b:a', '112k', '-shortest', '-movflags', '+faststart', mp4]);
  // the poster: the room right after the swoop, every cursor on the new card
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(outDir, `${String(Math.round((bars(7) + 1.6) * FPS)).padStart(5, '0')}.jpg`), '-vf', 'scale=1280:-2', '-q:v', '3', path.join(OUT, `${NAME}-poster.jpg`)]);
  const vtt = s => { const ms = Math.round(s * 1000); return `${String(Math.floor(ms / 3600e3)).padStart(2, '0')}:${String(Math.floor(ms / 60e3) % 60).padStart(2, '0')}:${((ms / 1000) % 60).toFixed(3).padStart(6, '0')}`; };
  const cues = [...LINES.map(([l, , a, b]) => [bars(a), bars(b) - 0.25, l]), [bars(24), LEN, END_LINE]];
  fs.writeFileSync(path.join(OUT, `${NAME}.en.vtt`), `WEBVTT\n\n${cues.map(([a, b, l], i) => `${i + 1}\n${vtt(a)} --> ${vtt(b)}\n${l}`).join('\n\n')}\n`);
  for (const f of fs.readdirSync(OUT)) if (f.startsWith('x264')) fs.rmSync(path.join(OUT, f));
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' }));
  console.log(`${mp4}  ${dur.toFixed(2)} s  ${(fs.statSync(mp4).size / 1048576).toFixed(2)} MB`);
}

if (!process.env.HUB_PROMO_CHILD) {
  if (!STILLS && !VIDEO) { console.error('Usage: node scripts/hub-promo.mjs --stills dir [--raw] | --video dir [--render-only] [--kbps N] [--music file]'); process.exit(1); }
  if (VIDEO && !fs.existsSync(MUSIC)) { console.error(`No music file at ${MUSIC} (give --music).`); process.exit(1); }
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-promo-'));
  const env = { ...process.env, HUB_PROMO_CHILD: '1', BRB_DB: ':memory:', BRB_DATA_DIR: DATA, BRB_SILENT: '1', LOG_REQUESTS: '0', BRB_SNAPSHOTS: '0',
    ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', STRIPE_API_KEY: '', BILLING_PUBLIC: '', HOMEROOM: '1', HOMEROOM_ONBOARDING: '0', MANIPULATIVES: '1', COMPANION: '1', LIVE_CLASSROOM: '1' };
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], { cwd: ROOT, env, stdio: 'inherit' });
  child.on('exit', code => { fs.rmSync(DATA, { recursive: true, force: true }); process.exit(code ?? 1); });
} else {
  main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
}
