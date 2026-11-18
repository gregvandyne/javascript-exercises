// A walkthrough video of Class dashboards (docs/decisions.md "Class dashboards walkthrough video"): the real app on a
// throwaway in-memory database, driven by Playwright and recorded with Chromium's screencast, then put together with
// ffmpeg (1920 × 1080, H.264).
//
// The class is made up: Ms. Haberle's Class at Maple Grove Demo School, 22 students who appear only by their Oomba names
// (as dashboards always show them). The video opens on her everyday screen, opens New layout to show all five
// ready-made layouts (services/dash.js LAYOUT_TEMPLATES), then makes each one in turn with the class using it: moods
// checked in, a quick check answered, the help queue, groups, team points, the voice meter, the timers, the wheel and
// the dice. Then a student's own screen on a phone, a game sent to every screen, and an end card.
//
// So the clock and "now and next" show a school morning on any day it is run, this script starts itself again with its
// clock moved to 8:50 in New York on the next weekday (scripts/how-clock.mjs), and the browser's clock follows it.
//
// Usage: node scripts/dash-video.js [--out path.mp4] [--peek dir] [--keep]
//   --out   where the video goes (default: dash-walkthrough.mp4 in the current directory)
//   --peek  also save a still of every step to dir (to check a scene without watching the whole video)
//   --keep  keep the frames and the parts (printed at the end)
// Needs ffmpeg with libx264 and a Chromium (BRB_CHROMIUM, else /opt/pw-browsers/chromium, else Playwright's own).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d = null) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = path.resolve(arg('--out', 'dash-walkthrough.mp4'));
const PEEK = arg('--peek') ? path.resolve(arg('--peek')) : null;
const KEEP = args.includes('--keep');
const TZ = 'America/New_York';

/** hh:mm in New York on the next weekday still ahead, as ISO. */
function nextSchoolDay(h, m) {
  const parts = d => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(d).map(p => [p.type, p.value]));
  for (let day = 0; day < 8; day++) {
    const p = parts(new Date(Date.now() + day * 864e5));
    if (p.weekday === 'Sat' || p.weekday === 'Sun') continue;
    let t = Date.UTC(+p.year, +p.month - 1, +p.day, h + 5, m);
    const q = parts(new Date(t)); t -= ((+q.hour * 60 + +q.minute) - (h * 60 + m)) * 60e3;
    if (t > Date.now() + 60e3) return new Date(t).toISOString();
  }
  throw new Error('no school day ahead');
}

// ---------------------------------------------------------------- 2. the class
async function seedClass() {
  const { config } = await import('../server/config.js');
  config.anthropicKey = '';
  const { q } = await import('../server/db.js');
  const { createUser, getUser } = await import('../server/auth.js');
  const S = await import('../server/services/schools.js');
  const games = await import('../server/services/games.js');
  const boss = createUser({ username: 'VideoBoss', password: 'video-secret-1', role: 'admin' });
  const school = S.createSchool(boss, { name: 'Maple Grove Demo School' }).school;
  const T = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Ms. Haberle', role: 'teacher' }).user.id);
  q.run("UPDATE users SET display_name='Ms. Haberle', avatar='🍎', color='#ec4899' WHERE id=?", T.id);
  const C = S.createClass(T, school.id, { name: "Ms. Haberle's Class", grade: '4' }).class;
  // Oomba names only: a dashboard never shows a student's real name (the roster names here are placeholders).
  const NAMES = ['CosmicPanda21', 'SwiftOtter34', 'BrightFox57', 'CozyKoala18', 'ShinyNewt62', 'MightyMaple45', 'ZippyLynx12', 'SunnyHeron73',
    'BraveBadger29', 'PixelPuffin66', 'JollyJaguar38', 'MistyMoose51', 'RocketRaven14', 'GentleGecko87', 'TurboTurtle25', 'LuckyLemur93',
    'CleverCrane40', 'NovaNarwhal16', 'HappyHedgehog72', 'StarrySeal58', 'QuickQuokka31', 'BouncyBison84'];
  const AVATARS = ['🐼', '🦦', '🦊', '🐨', '🦎', '🦌', '🐱', '🐦', '🦡', '🐧', '🐆', '🫎', '🐦‍⬛', '🦎', '🐢', '🐒', '🕊️', '🐳', '🦔', '🦭', '🐨', '🦬'];
  const COLORS = ['#2f6bff', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#0ea5e9', '#ef4444', '#14b8a6'];
  const kids = NAMES.map((n, i) => {
    const u = S.createSchoolAccount(T, school.id, { rosterName: `Student ${i + 1}`, grade: '4' }).user;
    S.addToClass(T, C.id, u.id);
    q.run('UPDATE users SET username=?, display_name=?, avatar=?, color=? WHERE id=?', n, n, AVATARS[i], COLORS[i % COLORS.length], u.id);
    return getUser(u.id);
  });
  // A game to send to the class (public and published, so every student can open it).
  const g = games.createGame(T.id, { title: 'Fraction Factory', icon: '🍕' });
  const v = games.addVersion(g.id, '<title>Fraction Factory</title><canvas></canvas>');
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id || v, g.id);
  return { T, C, kids, game: g };
}

// ---------------------------------------------------------------- 3. the stage: the dashboard inside a branded frame
// 1920 × 1080: the dashboard's screen (an iframe of the real page, 1600 × 900 CSS px) with a caption band under it, and
// title cards over everything. The pointer is drawn by the stage (the iframe's own pointer is never seen in a screencast).
const STAGE_CSS = `
@font-face{font-family:Brico;src:url(/fonts/bricolage-grotesque-latin-opsz-normal.woff2) format('woff2');font-weight:200 800}
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden}
body{font-family:Brico,system-ui,sans-serif;background:radial-gradient(1200px 700px at 15% 0%,#dff4e8 0%,transparent 60%),radial-gradient(900px 600px at 100% 100%,#fff1c2 0%,transparent 55%),#f7f3e8;color:#1f1f1b}
.screen{position:absolute;left:160px;top:28px;width:1600px;height:900px;border-radius:22px;overflow:hidden;box-shadow:0 30px 80px rgba(31,31,27,.22),0 0 0 1px rgba(31,31,27,.08);background:#fff}
.screen iframe{width:1600px;height:900px;border:0;display:block}
.band{position:absolute;left:160px;right:160px;top:946px;height:112px;display:flex;align-items:center;gap:28px}
.mark{flex:none;display:flex;align-items:center;gap:12px;font-weight:800;font-size:26px;letter-spacing:-.01em}
.mark .appmark{width:48px;height:48px}.mark .wordmark{height:26px;width:auto;color:#1f1f1b}
.appmark .am-bg{fill:#66c792}.appmark .am-eyes{fill:none;stroke:#141414}.appmark .am-pupils{fill:#141414}.appmark .am-spark{fill:#ffd23f;stroke:#141414}.wordmark .spark{fill:#ffd23f;stroke:transparent}
.cap{position:relative;flex:1;height:100%}
.cap>div{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;transition:opacity .5s,transform .5s}
.cap>div.out{opacity:0;transform:translateY(10px)}
.cap b{display:block;font-size:30px;font-weight:750;letter-spacing:-.015em;line-height:1.15}
.cap span{display:block;font-size:22px;color:#5b5a52;margin-top:6px;line-height:1.3}
.chip{flex:none;font-size:18px;font-weight:700;color:#237a4f;background:#e3f5ea;border-radius:999px;padding:10px 18px}
.card{position:absolute;inset:0;z-index:20;display:grid;place-items:center;text-align:center;background:radial-gradient(1000px 600px at 50% 40%,#2b3a30 0%,#161814 70%);color:#fdf9ee;transition:opacity .9s}
.card.out{opacity:0;pointer-events:none}
.card .in{transform:translateY(0);transition:transform 1.2s cubic-bezier(.2,.8,.2,1)}
.card.out .in{transform:translateY(-14px)}
.card .logo{display:inline-block;width:112px;height:112px;margin-bottom:34px;border-radius:30px;box-shadow:0 0 90px rgba(102,199,146,.5)}.card .logo .appmark{width:112px;height:112px;display:block}
.card .word{display:block;margin:46px auto 0;height:34px;width:auto;color:#a8a596}
.card h1{font-size:104px;line-height:1;margin:0;letter-spacing:-.035em;font-weight:800}
.card p{font-size:38px;margin:26px 0 0;color:#cfe9d9;font-weight:500}
.card small{display:block;margin-top:46px;font-size:24px;color:#a8a596;font-weight:600;letter-spacing:.02em}
.card .cta{display:inline-block;margin-top:40px;font-size:30px;font-weight:750;background:#66c792;color:#11140f;border-radius:999px;padding:18px 40px}
#ptr{position:absolute;z-index:30;left:0;top:0;width:34px;height:34px;pointer-events:none;transition:transform .7s cubic-bezier(.3,.7,.2,1),opacity .4s;filter:drop-shadow(0 3px 5px rgba(0,0,0,.35));opacity:0}
#ptr.on{opacity:1}
.ring{position:absolute;z-index:29;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:4px solid #66c792;pointer-events:none;animation:ring .6s ease-out forwards}
@keyframes ring{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
.phone{position:absolute;right:250px;top:60px;width:430px;height:900px;border-radius:58px;background:#1b1b18;padding:18px;box-shadow:0 40px 90px rgba(31,31,27,.3)}
.phone .glass{width:394px;height:864px;border-radius:42px;overflow:hidden;background:#fff}
.phone iframe{width:390px;height:844px;border:0;transform:scale(1.0103);transform-origin:0 0;display:block}
.side{position:absolute;left:220px;top:300px;width:900px}
.side .chip{display:inline-block;margin-bottom:26px}
.side h2{font-size:68px;line-height:1.05;margin:0;letter-spacing:-.03em;font-weight:800}
.side p{font-size:30px;line-height:1.4;color:#5b5a52;margin:26px 0 0}
`;
/** The brand marks (server/views/brand.js), set in main(). */
const BRAND = { mark: '', word: '', wordCard: '' };
const POINTER = `<svg id="ptr" viewBox="0 0 24 24"><path d="M4 2.5l15.5 9.2-6.9 1.4 3.9 7.4-3 1.5-3.9-7.4-5.6 4.4z" fill="#1f1f1b" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const stageHtml = ({ src, title, sub }) => `<!doctype html><html><head><meta charset="utf-8"><title>stage</title><style>${STAGE_CSS}</style></head><body>
<div class="screen"><iframe id="scr" src="${src}" allow="microphone; camera; autoplay; fullscreen"></iframe></div>
<div class="band"><div class="mark">${BRAND.mark}${BRAND.word}</div><div class="cap" id="cap"></div><div class="chip" id="chip" hidden></div></div>
<div class="card" id="card"><div class="in"><div class="logo">${BRAND.mark}</div><h1>${title}</h1><p>${sub}</p>${BRAND.wordCard}</div></div>
${POINTER}</body></html>`;
const phoneHtml = ({ src }) => `<!doctype html><html><head><meta charset="utf-8"><title>stage</title><style>${STAGE_CSS}</style></head><body>
<div class="side"><div class="chip" id="chip">A student's screen</div><h2 id="sh"></h2><p id="sp"></p></div>
<div class="phone"><div class="glass"><iframe id="scr" src="${src}"></iframe></div></div>
<div class="card out" id="card"><div class="in"></div></div>
${POINTER}</body></html>`;

/** What the video widget shows here: a plain, unbranded stand-in for a class's brain-break video. */
const VIDEO_STAND_IN = `<!doctype html><html><head><style>
html,body{margin:0;height:100%;overflow:hidden;font-family:system-ui,sans-serif}
body{display:grid;place-items:center;background:linear-gradient(135deg,#2f6bff,#8b5cf6 55%,#ec4899);background-size:200% 200%;animation:bg 6s ease-in-out infinite alternate;color:#fff}
@keyframes bg{to{background-position:100% 100%}}
.eq{display:flex;gap:10px;align-items:flex-end;height:90px;justify-content:center}
.eq i{width:16px;border-radius:8px;background:rgba(255,255,255,.9);animation:b 1s ease-in-out infinite alternate}
.eq i:nth-child(2){animation-delay:-.3s}.eq i:nth-child(3){animation-delay:-.6s}.eq i:nth-child(4){animation-delay:-.15s}.eq i:nth-child(5){animation-delay:-.45s}
@keyframes b{from{height:18px}to{height:90px}}
p{margin:18px 0 0;font-size:26px;font-weight:800;text-align:center;letter-spacing:-.01em}
</style></head><body><div><div class="eq"><i></i><i></i><i></i><i></i><i></i></div><p>Move-and-groove brain break</p></div></body></html>`;

// ---------------------------------------------------------------- 4. recording
/** Chromium's screencast of one page: JPEG frames with their times, written as they come. */
async function recorder(page, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async f => {
    const file = path.join(dir, `${String(frames.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp, at: performance.now() });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1, maxWidth: 1920, maxHeight: 1080 });
  return {
    async stop() {
      // The last frame holds for as long as it was on screen. Frame times are Chromium's real clock; this process's
      // Date is moved to a school morning (how-clock.mjs), so the end is measured with performance.now() instead.
      const last = frames.at(-1), end = last.t + (performance.now() - last.at) / 1000;
      await cdp.send('Page.stopScreencast');
      await new Promise(r => setTimeout(r, 300));
      return { frames, end };
    },
  };
}
/** One part's frames as a constant 30 fps H.264 file. */
function encodePart({ frames, end }, out) {
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, ((frames[i + 1]?.t ?? end) - f.t)).toFixed(4)}`).join('\n') + `\nfile '${frames.at(-1).file}'\n`;
  const lf = out + '.txt'; fs.writeFileSync(lf, list);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lf, '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', out]);
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }));
}
/** The parts, joined with short cross-fades. */
function joinParts(parts, out) {
  const FADE = 0.6;
  const inputs = parts.flatMap(p => ['-i', p.file]);
  let chain = '', last = '[0:v]', offset = 0;
  for (let i = 1; i < parts.length; i++) {
    offset += parts[i - 1].dur - FADE;
    const tag = i === parts.length - 1 ? '[v]' : `[x${i}]`;
    chain += `${last}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}${tag};`;
    last = tag;
  }
  const filter = parts.length > 1 ? chain.replace(/;$/, '') : '[0:v]null[v]';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[v]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
}

// ---------------------------------------------------------------- 5. the walkthrough
async function main() {
  const { createApp } = await import('../server/app.js');
  const { startSession } = await import('../server/auth.js');
  const D = await import('../server/services/dash.js');
  const { tFor } = await import('../server/i18n/index.js');
  const { appMark, wordmark } = await import('../server/views/brand.js');
  Object.assign(BRAND, { mark: String(appMark('appmark')), word: String(wordmark('wordmark')), wordCard: String(wordmark('wordmark word')) });
  const { T, C, kids, game } = await seedClass();
  const t = tFor('en');
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
  // Her everyday screen: the starter layout with the day's plan and goal filled in, the one the class follows.
  const every = D.ensureLayouts(T, C, 'Everyday')[0];
  D.updateLayout(T, C, every.id, { widgets: every.widgets.map(w => w.type === 'text' ? { ...w, s: { ...w.s, title: 'Today', body: 'Spelling check\nFractions: comparing\nLibrary at 1:15\nReading logs due Friday' } }
    : w.type === 'ican' ? { ...w, s: { ...w.s, goal: 'compare fractions with the same numerator.' } } : w) });

  const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'oomba-video-frames-'));
  if (PEEK) fs.mkdirSync(PEEK, { recursive: true });
  const { chromium } = await import('@playwright/test');
  const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium'].find(p => p && fs.existsSync(p));
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const parts = [];
  let peekN = 0;
  try {
    // ---------- the teacher
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, timezoneId: TZ, locale: 'en-US', colorScheme: 'light', permissions: ['microphone'] });
    const [cn, cv] = cookieFor(T.id).split('=');
    await ctx.addCookies([{ name: cn, value: cv, url: BASE }, { name: 'theme', value: 'light', url: BASE }]);
    await frameable(ctx, BASE);
    // Fun break's video widget, as if she had pasted a link: the template's answer gets one, and the video host (never
    // reached from here) answers with a plain stand-in, as scripts/dash-fit-check.js does.
    await ctx.route(u => /\/api\/dash\/[^/]+\/templates\/fun$/.test(u.pathname), async r => {
      const res = await r.fetch(); const j = await res.json();
      for (const w of j.layout?.widgets || []) if (w.type === 'video') w.s = { ...w.s, video: { p: 'youtube', id: 'aqz-KE-bpKQ' }, mute: true };
      await r.fulfill({ response: res, json: j });
    });
    await ctx.route(/^https:\/\/(www\.youtube\.com|www\.youtube-nocookie\.com|player\.vimeo\.com)\//, r => r.fulfill({ contentType: 'text/html', body: VIDEO_STAND_IN }));
    const page = await ctx.newPage();
    page.setDefaultTimeout(20_000);
    await page.clock.setSystemTime(new Date());   // this process's clock: the school morning
    await page.route(`${BASE}/__stage`, r => r.fulfill({ contentType: 'text/html', body: stageHtml({ src: `/class/${C.id}/dashboard`, title: 'Class dashboards', sub: 'One screen for the whole school day' }) }));
    await page.goto(`${BASE}/__stage`);
    const F = page.frameLocator('#scr');
    await F.locator('.dash-w').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);

    const S = stageKit(page, () => (PEEK ? path.join(PEEK, `${String(++peekN).padStart(2, '0')}`) : null));
    const rec = await recorder(page, path.join(WORK, 'teacher'));
    await S.wait(3200);
    await S.card(false);
    await S.wait(900);
    await S.caption("Ms. Haberle's Class", 'Every class has a dashboard for the projector, open all day.', 'Everyday');
    await S.pointer(980, 520);
    await S.wait(4200, 'everyday');

    const LAYOUTS = [
      { id: 'morning', name: 'Morning start', cap: ['Morning start', 'The clock, now and next, today’s goal, class jobs and a mood check-in.'], run: morning },
      { id: 'lesson', name: 'Lesson', cap: ['Lesson', 'A timer, a quick check, the help queue, a number line and a traffic light.'], run: lesson },
      { id: 'group', name: 'Group work', cap: ['Group work', 'Random groups, a timer, team points and a voice meter.'], run: group },
      { id: 'quiet', name: 'Quiet work', cap: ['Quiet work', 'A big timer, a red light, work symbols and a breathing circle.'], run: quiet },
      { id: 'fun', name: 'Fun break', cap: ['Fun break', 'Spin the wheel, roll the dice, play a video, then breathe.'], run: fun },
    ];
    // New layout: the five ready-made layouts, each one looked at, then the first one made.
    for (const [i, L] of LAYOUTS.entries()) {
      await S.click(F.locator('#dash-layout-new'));
      const sheet = F.locator('.sheet').filter({ has: F.locator('#dash-name-form') });
      await sheet.waitFor();
      await S.wait(500);
      if (i === 0) {
        await S.caption('Five ready-made layouts', 'Pick one to start from, or build your own.', 'New layout');
        for (const x of LAYOUTS) { await S.hover(sheet.locator(`input[value="${x.id}"]`).locator('xpath=..')); await S.wait(900); }
        await S.wait(600, 'templates');
      }
      await S.click(sheet.locator(`input[value="${L.id}"]`).locator('xpath=..'));
      await S.wait(500);
      await S.click(sheet.locator('button[type=submit]'));
      await sheet.waitFor({ state: 'detached' });
      await F.locator(`.dash-w[data-id^="${LAYOUTS[i].id === 'morning' ? 'mood' : LAYOUTS[i].id === 'lesson' ? 'check' : LAYOUTS[i].id === 'group' ? 'groups' : LAYOUTS[i].id === 'quiet' ? 'breathe' : 'picker'}"]`).waitFor();
      await S.caption(L.cap[0], L.cap[1], 'Ready-made layout');
      await S.wait(1200);
      await L.run();
    }
    // Back to the morning: every layout is one tap away, and students follow the one on screen.
    await S.caption('One tap to switch', 'Students’ screens follow the layout on the projector.', 'Layouts');
    await S.click(F.locator('#dash-layouts button, #dash-layouts a').filter({ hasText: 'Morning start' }).first());
    await S.wait(3500, 'switch');
    await S.pointer(null);
    await S.wait(400);
    parts.push(await rec.stop());

    // ---------- the layout's helpers (closures over the stage and the class)
    async function morning() {
      // The class checks in as they arrive.
      const moods = [0, 1, 0, 0, 2, 1, 0, 1, 0, 3, 0, 1, 1, 0, 2, 0];
      await S.pointer(1500, 600);
      for (const [i, m] of moods.entries()) { D.setMood(kids[i], C, m); if (i % 4 === 3) await S.wait(1100); }
      await S.wait(4200, 'morning');
      await S.click(widget('jobs').getByRole('button', { name: /Next week/ }));
      await S.wait(2600, 'jobs');
    }
    async function lesson() {
      await S.click(widget('timer').getByRole('button', { name: /^Start$/ }));
      await S.wait(1200);
      // A quick check: thumbs, sent to every student.
      await S.click(widget('check').getByRole('button', { name: /New check/ }));
      const sh = F.locator('.sheet').last(); await sh.waitFor();
      const q = sh.locator('input:not([type=radio]):not([type=checkbox]), textarea').first();
      if (await q.count()) { await S.click(q, { blur: false }); await q.pressSequentially('Can you compare 3/8 and 3/5?', { delay: 45 }); }
      await S.wait(500, 'check-form');
      await S.click(sh.getByRole('button', { name: /Send/ }).last());
      await sh.waitFor({ state: 'detached' }).catch(() => {});
      const open = await openCheck();
      const answers = [0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 0, 1, 0, 0, 2, 0, 0, 1];
      for (const [i, a] of answers.entries()) { if (open) D.answerCheck(kids[i], C, open, a); if (i % 5 === 4) await S.wait(900); }
      // Hands up.
      for (const i of [3, 9, 14]) D.helpAsk(kids[i], C, 'help');
      for (const i of [1, 6]) D.helpAsk(kids[i], C, 'done');
      await S.wait(4500, 'lesson');
      await S.click(widget('help').getByRole('button', { name: /Next$/ }));
      await S.wait(1500);
      // A point on the number line.
      await S.click(widget('numline').getByRole('button', { name: /Point$/ }));
      const line = widget('numline').locator('svg').first();
      if (await line.count()) { const b = await line.boundingBox(); if (b) { await S.clickAt(b.x + b.width * 0.62, b.y + b.height * 0.5); await S.wait(1600, 'numline'); } }
    }
    async function group() {
      await S.click(widget('groups').getByRole('button', { name: /Make groups/ }));
      await S.wait(2400, 'groups');
      await S.click(widget('timer').getByRole('button', { name: /^Start$/ }));
      for (const [team, n] of [[0, 2], [2, 1], [1, 3]]) {
        const plus = widget('score').getByRole('button', { name: /One point for/ }).nth(team);
        for (let k = 0; k < n; k++) await S.click(plus, { glide: k === 0 });
      }
      await S.wait(1200);
      await S.click(widget('noise').getByRole('button', { name: /Turn the mic on/ }));
      await S.wait(4500, 'group');
    }
    async function quiet() {
      await S.click(widget('timer').getByRole('button', { name: /^Start$/ }));
      await S.wait(800);
      await S.click(widget('breathe').getByRole('button', { name: /^Start$/ }));
      await S.pointer(null);
      await S.wait(7000, 'quiet');
    }
    async function fun() {
      await S.click(widget('picker').getByRole('button', { name: /Spin/ }));
      await S.wait(5200, 'wheel');
      await S.click(widget('dice').getByRole('button', { name: /Roll$/ }));
      await S.wait(2600, 'fun');
    }
    function widget(type) { return F.locator(`.dash-w[data-id^="${type}"]`).first(); }
    async function openCheck() {
      const { q } = await import('../server/db.js');
      return (q.get("SELECT id FROM dash_checks WHERE class_id=? ORDER BY created_at DESC LIMIT 1", C.id) || {}).id || null;
    }
    await ctx.close();
    // The lesson's quick check is over before the phone scene (else it sits on top of the student's screen).
    { const id = await openCheck(); if (id) D.endCheck(T, C, id); }

    // ---------- a student's own screen
    const sctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, timezoneId: TZ, locale: 'en-US', colorScheme: 'light' });
    const kid = kids[0];
    const [sn, sv] = cookieFor(kid.id).split('=');
    await sctx.addCookies([{ name: sn, value: sv, url: BASE }, { name: 'theme', value: 'light', url: BASE }]);
    await frameable(sctx, BASE);
    const sp = await sctx.newPage();
    await sp.clock.setSystemTime(new Date());
    await sp.route(`${BASE}/__stage`, r => r.fulfill({ contentType: 'text/html', body: phoneHtml({ src: `/class/${C.id}/dashboard` }) }));
    await sp.goto(`${BASE}/__stage`);
    const SF = sp.frameLocator('#scr');
    await SF.locator('.dash-w').first().waitFor();
    await sp.evaluate(() => document.fonts.ready);
    await sp.waitForTimeout(1500);
    const P = stageKit(sp, () => (PEEK ? path.join(PEEK, `${String(++peekN).padStart(2, '0')}`) : null));
    const srec = await recorder(sp, path.join(WORK, 'student'));
    await P.side('Their own screen', `${kid.display_name} sees what Ms. Haberle pins (today’s goal, the mood check-in and class jobs) beside their own clock.`);
    await P.wait(3400, 'student');
    const face = SF.locator('.dash-w[data-id^="mood"] button:visible').first();
    await P.scrollTo(SF.locator('.dash-w[data-id^="mood"]'));
    await P.wait(900);
    await P.click(face);
    await P.wait(1800, 'student-mood');
    await P.scrollTo(SF.locator('.dash-w[data-id^="jobs"]'));
    await P.wait(2200, 'student-jobs');
    await P.scrollTop();
    await P.wait(900);
    await P.pointer(null);
    await P.side('Send it to every screen', 'A game, a lesson or a link arrives on every student’s screen at once.');
    await P.wait(1200);
    D.push(T, C, { kind: 'game', ref: game.id });
    await SF.locator('#dash-banner:not([hidden])').waitFor({ timeout: 15_000 }).catch(() => {});
    await P.wait(4200, 'push');
    await P.endCard('Class dashboards', 'Free for every teacher in Oomba Academy.');
    await P.wait(5000, 'end');
    parts.push(await srec.stop());
    await sctx.close();

    // ---------- the video
    const files = [];
    for (const [i, p] of parts.entries()) { const file = path.join(WORK, `part${i}.mp4`); files.push({ file, dur: encodePart(p, file) }); }
    joinParts(files, OUT);
    const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', OUT], { encoding: 'utf8' }));
    console.log(`${path.relative(process.cwd(), OUT)}  ${dur.toFixed(1)} s  ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB`);
  } finally {
    await browser.close().catch(() => {});
    server.close();
    if (KEEP) console.log('Frames kept in', WORK); else fs.rmSync(WORK, { recursive: true, force: true });
  }
  process.exit(0);
}

/** In the recording browser only: the dashboard may be framed by the stage (same origin). The app sends DENY. */
async function frameable(ctx, BASE) {
  await ctx.route(u => u.origin === new URL(BASE).origin && /^\/class\/[^/]+\/dashboard$/.test(u.pathname), async r => {
    const res = await r.fetch();
    const headers = { ...res.headers() }; delete headers['x-frame-options'];
    if (headers['content-security-policy']) headers['content-security-policy'] = headers['content-security-policy'].replace(/frame-ancestors [^;]*/, "frame-ancestors 'self'");
    await r.fulfill({ response: res, headers });
  });
}

/** What a scene does on the stage: captions, the pointer (glides to an element, then clicks it), cards, waits. */
function stageKit(page, peekFile) {
  const peek = async name => { const f = peekFile(); if (f) await page.screenshot({ path: `${f}-${name}.png` }); };
  const at = async (x, y) => {
    await page.evaluate(([x, y]) => { const p = document.getElementById('ptr'); if (x === null) { p.classList.remove('on'); return; } p.classList.add('on'); p.style.transform = `translate(${x - 6}px,${y - 4}px)`; }, [x, y]);
  };
  const glideTo = async (x, y) => { await at(x, y); await page.mouse.move(x, y, { steps: 12 }); await page.waitForTimeout(760); };
  const ring = (x, y) => page.evaluate(([x, y]) => { const r = document.createElement('div'); r.className = 'ring'; r.style.left = `${x}px`; r.style.top = `${y}px`; document.body.appendChild(r); setTimeout(() => r.remove(), 700); }, [x, y]);
  const unfocus = () => Promise.all(page.frames().map(f => f.evaluate(() => { const a = document.activeElement; if (a && a !== document.body && !a.closest('dialog, .sheet')) a.blur(); }).catch(() => {})));
  const centre = async loc => { await loc.scrollIntoViewIfNeeded().catch(() => {}); const b = await loc.boundingBox(); if (!b) throw new Error('not on screen'); return [b.x + b.width / 2, b.y + b.height / 2]; };
  return {
    async wait(ms, name) { await page.waitForTimeout(ms); if (name) await peek(name); },
    async scrollTo(loc) { await loc.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' })); await page.waitForTimeout(1100); },
    async scrollTop() { await page.frames().at(-1).evaluate(() => scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {}); await page.waitForTimeout(1100); },
    async pointer(x, y) { if (x === null) await at(null); else await glideTo(x, y); },
    async hover(loc) { const [x, y] = await centre(loc); await glideTo(x, y); },
    async click(loc, { glide = true, blur = true } = {}) {
      const [x, y] = await centre(loc); if (glide) await glideTo(x, y); await ring(x, y); await loc.click();
      if (blur) await unfocus();   // no focus ring left on what was clicked (a mouse user sees none either)
      await page.waitForTimeout(glide ? 350 : 280);
    },
    async clickAt(x, y) { await glideTo(x, y); await ring(x, y); await page.mouse.click(x, y); await unfocus(); await page.waitForTimeout(350); },
    async caption(title, text, chip) {
      await page.evaluate(([title, text, chip]) => {
        const cap = document.getElementById('cap');
        for (const old of cap.children) { old.classList.add('out'); setTimeout(() => old.remove(), 600); }
        const d = document.createElement('div'); d.className = 'out';
        const b = document.createElement('b'); b.textContent = title; const s = document.createElement('span'); s.textContent = text; d.append(b, s);
        cap.appendChild(d); requestAnimationFrame(() => requestAnimationFrame(() => d.classList.remove('out')));
        const c = document.getElementById('chip'); c.hidden = !chip; c.textContent = chip || '';
      }, [title, text, chip]);
    },
    async side(title, text) {
      await page.evaluate(([title, text]) => {
        const h = document.getElementById('sh'), p = document.getElementById('sp');
        for (const e of [h, p]) { e.style.transition = 'opacity .45s'; e.style.opacity = 0; }
        setTimeout(() => { h.textContent = title; p.textContent = text; for (const e of [h, p]) e.style.opacity = 1; }, 450);
      }, [title, text]);
      await page.waitForTimeout(500);
    },
    async card(show) { await page.evaluate(show => document.getElementById('card').classList.toggle('out', !show), show); },
    async endCard(title, sub) {
      await page.evaluate(([title, sub, mark]) => {
        const c = document.getElementById('card');
        c.querySelector('.in').innerHTML = `<div class="logo">${mark}</div><h1></h1><p></p><span class="cta">oomba.ai</span>`;
        c.querySelector('h1').textContent = title; c.querySelector('p').textContent = sub;
        document.getElementById('ptr').classList.remove('on');
        c.classList.remove('out');
      }, [title, sub, BRAND.mark]);
    },
  };
}

// Last, so every constant above is set before it runs.
// ---------------------------------------------------------------- 1. start again on a school morning (runs first)
if (!process.env.HOW_CLOCK) {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'oomba-video-'));
  const env = { ...process.env, HOW_CLOCK: nextSchoolDay(8, 50), BRB_DB: ':memory:', BRB_DATA_DIR: DATA, BRB_SILENT: '1', LOG_REQUESTS: '0',
    ANTHROPIC_API_KEY: '', STRIPE_API_KEY: '', BILLING_PUBLIC: '', NODE_OPTIONS: `--import ${path.join(ROOT, 'scripts', 'how-clock.mjs')}` };
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], { cwd: ROOT, env, stdio: 'inherit' });
  child.on('exit', code => { fs.rmSync(DATA, { recursive: true, force: true }); process.exit(code ?? 1); });
} else {
  await main();
}

