#!/usr/bin/env node
// "The Hub in 2 minutes": the teacher-facing overview video of the Hub (/class/:id/hub), for the homepage's hero and the
// video strip (server/routes/landing.js HERO_VIDEO, server/views/see-it.js VIDEOS). Written to public/video/
// oomba-hub.mp4, oomba-hub-poster.jpg and oomba-hub.en.vtt.
//
// Built like scripts/dash-video.js and scripts/manip-tutorials.mjs: the real app on a throwaway in-memory database, with
// the live sockets attached as server/index.js does (attachUpgrades), driven by Playwright and recorded with Chromium's
// screencast, then put together with ffmpeg. The people are made up: Ms. Okafor at Juniper Hill Demo School and eight
// students who appear only by their Oomba names. The students are real browser pages too (not recorded): they open what
// is handed out, raise a hand and join the live game from their desks, so what the teacher's board shows is what the app
// does. The Oomba chat answers with a stand-in AI that calls the real tools (as scripts/landing-shots.mjs and the tests
// do): the cards in the chat are the app's own. No API key is used.
//
// Every step is checked against the page (an expect polled for a few seconds); a step that does not happen stops the
// run with the step's caption and what was wrong, so recording the video is also a play-through of the Hub's flows.
//
// The picture: the Hub at 1440 x 716 scaled to 1280 x 636, with the captions burned in below it in a calm cream bar
// (1280 x 84, so a caption never covers the app), a title card and an end card. H.264, yuv420p, faststart, no sound.
// The captions also go to the .en.vtt. Captions are for teachers: short, plain, no em dashes, US spelling.
//
// Usage: node scripts/hub-video.mjs [--out dir] [--peek dir] [--keep]
//   --out   where the three files go (default public/video)
//   --sheet also write a contact sheet (oomba-hub-sheet.jpg, one frame every 6 s) beside them, to review the whole video
//   --peek  also save a screenshot after every step to dir
//   --keep  keep the frames and the parts (printed at the end)
// Needs ffmpeg with libx264 and a Chromium (scripts/chromium.js).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const OUT = path.resolve(opt('--out') || path.join(ROOT, 'public/video'));
const PEEK = opt('--peek') ? path.resolve(opt('--peek')) : null;
const KEEP = args.includes('--keep');
const SHEET = args.includes('--sheet');
const NAME = 'oomba-hub';
// The page is 1440 x 716 CSS px, recorded at 1280 x 636; the caption bar adds 84 px under it (1280 x 720 in all).
const VW = 1440, VH = 716, W = 1280, H = 720, PH = 636, CAP = H - PH;

// ---------------------------------------------------------------- checks
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
/** css (in page or a frame) is on screen. */
const seen = css => async page => (await page.locator(css).first().isVisible().catch(() => false)) || `${css} is not on screen`;
/** css has text matching re. */
const says = (css, re) => async page => { const el = page.locator(css).first(); if (!(await el.count())) return `no ${css}`; const t = norm(await el.textContent()); return re.test(t) || `${css} reads "${t.slice(0, 160)}", wanted ${re}`; };
const atLeast = (css, n) => async page => { const c = await page.locator(css).count(); return c >= n || `${css}: ${c} found, wanted at least ${n}`; };
const none = css => async page => { const c = await page.locator(css).count(); return c === 0 || `${css}: ${c} still there`; };
const both = (...fs) => async page => { for (const f of fs) { const r = await f(page); if (r !== true) return r; } return true; };
const fn = (f, what) => async page => ((await f(page)) ? true : what);

// ---------------------------------------------------------------- what is drawn into the page: the cursor and a click ring
const OVERLAY_CSS = `
#tut-ptr{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:30px;height:36px;transform:translate(-100px,-100px);filter:drop-shadow(0 3px 4px rgba(0,0,0,.3));opacity:0;transition:opacity .3s}
#tut-ptr.on{opacity:1}
.tut-ring{position:fixed;z-index:2147483646;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:4px solid #FFD23F;box-shadow:0 0 0 2px rgba(20,20,20,.15);animation:tutring .55s ease-out forwards}
@keyframes tutring{from{transform:scale(.35);opacity:1}to{transform:scale(1.35);opacity:0}}
.tut-spot{position:fixed;z-index:2147483644;pointer-events:none;border:3px solid #FFD23F;border-radius:16px;box-shadow:0 0 0 6px rgba(255,210,63,.25);transition:opacity .45s;animation:tutspot .45s ease-out}
@keyframes tutspot{from{opacity:0;transform:scale(1.02)}to{opacity:1;transform:none}}
`;
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

// ---------------------------------------------------------------- the cards and the caption bar (drawn as pictures)
const FONT = `@font-face{font-family:Brico;src:url(/fonts/bricolage-grotesque-latin-opsz-normal.woff2) format('woff2');font-weight:200 800}`;
const BRAND = { mark: '', word: '' };
const cardHtml = (title, sub, end) => `<!doctype html><html><head><meta charset="utf-8"><style>${FONT}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
body{display:grid;place-items:center;text-align:center;font-family:Brico,system-ui,sans-serif;background:radial-gradient(900px 520px at 50% 40%,#2b3a30 0%,#161814 72%);color:#FFFDF2}
.logo{width:96px;height:96px;margin:0 auto 30px;border-radius:26px;box-shadow:0 0 80px rgba(102,199,146,.45)}.logo svg{width:96px;height:96px;display:block}
.appmark .am-bg{fill:#66c792}.appmark .am-eyes{fill:none;stroke:#141414}.appmark .am-pupils{fill:#141414}.appmark .am-spark{fill:#ffd23f;stroke:#141414}.wordmark .spark{fill:#ffd23f;stroke:transparent}
h1{margin:0;font-size:76px;line-height:1.04;letter-spacing:-.035em;font-weight:800}
p{margin:22px 0 0;font-size:31px;color:#cfe9d9;font-weight:500}
.word{display:block;margin:40px auto 0;height:28px;width:auto;color:#a8a596}
.cta{display:inline-block;margin-top:34px;font-size:26px;font-weight:750;background:#66c792;color:#11140f;border-radius:999px;padding:14px 34px}
</style></head><body><div><div class="logo">${BRAND.mark}</div><h1>${title}</h1><p>${sub}</p>${end ? '<span class="cta">oomba.ai/plans</span>' : BRAND.word}</div></body></html>`;
const capHtml = text => `<!doctype html><html><head><meta charset="utf-8"><style>${FONT}
html,body{margin:0;width:${W}px;height:${CAP}px;overflow:hidden;background:#FBF6E6}
body{display:flex;align-items:center;gap:16px;padding:0 34px;box-sizing:border-box;border-top:1.5px solid #E6DFC8;font-family:Brico,system-ui,sans-serif}
.dot{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#66C792;color:#141414;font-size:15px;font-weight:800}
.t{font-size:27px;font-weight:600;letter-spacing:-.012em;color:#1f1f1b;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m{margin-left:auto;flex:none;display:flex;align-items:center;gap:8px;opacity:.75}.m .appmark{width:30px;height:30px}.m .wordmark{height:17px;width:auto;color:#1f1f1b}
.appmark .am-bg{fill:#66c792}.appmark .am-eyes{fill:none;stroke:#141414}.appmark .am-pupils{fill:#141414}.appmark .am-spark{fill:#ffd23f;stroke:#141414}.wordmark .spark{fill:#ffd23f;stroke:transparent}
</style></head><body>${text ? `<span class="dot">▶</span><span class="t">${text}</span>` : ''}<span class="m">${BRAND.small}${BRAND.wordSmall}</span></body></html>`;

// ---------------------------------------------------------------- the stage: cursor, captions, checks
function stage(page, { peek, rec, name }) {
  let cur = { x: VW * 0.6, y: VH * 0.5 }, step = '', said = null;
  const fail = msg => { const e = new Error(`[${name}] "${step}": ${msg}`); e.tut = true; throw e; };
  const loc = t => (typeof t === 'string' ? page.locator(t).first() : t(page));
  const box = async l => { await l.waitFor({ state: 'visible', timeout: 15000 }).catch(() => fail(`not on screen: ${l}`)); await l.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {}); const b = await l.boundingBox(); if (!b) fail(`no box: ${l}`); return b; };
  const glide = async (x, y, ms = 650) => {
    const from = cur; cur = { x, y };
    const dist = Math.hypot(x - from.x, y - from.y); ms = Math.round(Math.max(280, Math.min(ms, 260 + dist * 0.8)));
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
  const ripple = (x, y) => page.evaluate(([x, y]) => { const r = document.createElement('div'); r.className = 'tut-ring'; r.style.left = `${x}px`; r.style.top = `${y}px`; document.body.appendChild(r); setTimeout(() => r.remove(), 650); }, [x, y]);
  const check = async (expect, what, ms = 6000) => {
    if (!expect) return;
    let last = '';
    for (let t0 = Date.now(); Date.now() - t0 < ms;) {
      const r = await Promise.resolve().then(() => expect(page)).catch(e => e.message);
      if (r === true) return;
      last = r; await page.waitForTimeout(150);
    }
    if (peek) await page.screenshot({ path: path.join(peek, `${name}-FAILED.png`) }).catch(() => {});
    fail(`after ${what}: ${last}`);
  };
  const unfocus = () => page.evaluate(() => { const a = document.activeElement; if (a && a !== document.body && !/^(INPUT|TEXTAREA|SELECT|IFRAME)$/.test(a.tagName)) a.blur(); }).catch(() => {});
  const at = async (t, dx = 0.5, dy = 0.5) => { const b = await box(loc(t)); return { x: b.x + b.width * dx, y: b.y + b.height * dy }; };
  let peekN = 0;
  const S = {
    /** Go on filming into another recorder (after a cut: the pointer stays where it was). */
    setRec(r) { rec = r; if (said) rec.caps.push({ at: 0, text: said }); },
    say(text) { step = text; said = text; if (rec) rec.caps.push({ at: rec.now(), text }); },
    quiet() { said = null; if (rec) rec.caps.push({ at: rec.now(), text: null }); },
    wait: ms => page.waitForTimeout(ms),
    async peek(n) { if (peek) await page.screenshot({ path: path.join(peek, `${name}-${String(++peekN).padStart(2, '0')}-${n}.png`) }); },
    check, fail,
    async move(t, { dx, dy } = {}) { const p = await at(t, dx, dy); await glide(p.x, p.y); },
    async moveTo(x, y) { await glide(x, y); },
    hide: () => page.evaluate(() => document.getElementById('tut-ptr')?.classList.remove('on')),
    async click(t, expect, { dx, dy, ms } = {}) {
      if (!expect) fail('a click needs an expect');
      const p = await at(t, dx, dy); await glide(p.x, p.y);
      await page.waitForTimeout(140); await ripple(p.x, p.y);
      await page.mouse.click(p.x, p.y);
      await check(expect, `clicking ${typeof t === 'string' ? t : 'it'}`, ms); await unfocus(); await page.waitForTimeout(380);
    },
    async drag(from, to, expect) {
      if (!expect) fail('a drag needs an expect');
      const p = await at(from, 0.35, 0.5); await glide(p.x, p.y); await ripple(p.x, p.y);
      await page.mouse.down();
      const q = await at(to);
      // (a few small moves first: the board starts a drag once the pointer has moved a little)
      await page.mouse.move(p.x + 8, p.y + 4, { steps: 3 }); await page.mouse.move(p.x + 18, p.y + 10, { steps: 3 });
      cur = { x: p.x + 18, y: p.y + 10 };
      await glide(q.x, q.y, 1100);
      await page.waitForTimeout(250);
      await page.mouse.up();
      await check(expect, 'the drag'); await page.waitForTimeout(380);
    },
    async type(t, text, expect) {
      const p = await at(t); await glide(p.x, p.y); await ripple(p.x, p.y);
      await page.mouse.click(p.x, p.y);
      await page.keyboard.type(text, { delay: 38 });
      await check(expect, `typing "${text}"`);
    },
    async spot(t, ms = 2600) {
      const b = await box(loc(t));
      await page.evaluate(([b, ms]) => { const d = document.createElement('div'); d.className = 'tut-spot'; Object.assign(d.style, { left: `${b.x - 8}px`, top: `${b.y - 6}px`, width: `${b.width + 16}px`, height: `${b.height + 12}px` }); document.body.appendChild(d); setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 500); }, ms); }, [b, ms]);
    },
  };
  return S;
}

// ---------------------------------------------------------------- recording
async function recorder(page, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [], caps = [];
  let firstAt = null;
  cdp.on('Page.screencastFrame', async f => {
    const file = path.join(dir, `${String(frames.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    if (firstAt === null) firstAt = performance.now();
    frames.push({ file, t: f.metadata.timestamp, at: performance.now() });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1, maxWidth: W, maxHeight: PH });
  // a first frame straight away (the page may be still)
  await page.evaluate(() => { document.body.style.outline = '0px solid transparent'; }).catch(() => {});
  for (let i = 0; i < 60 && firstAt === null; i++) await new Promise(r => setTimeout(r, 40));
  return {
    caps,
    now: () => (firstAt === null ? 0 : (performance.now() - firstAt) / 1000),
    async stop() {
      const last = frames.at(-1), end = last.t + (performance.now() - last.at) / 1000;
      await cdp.send('Page.stopScreencast');
      await new Promise(r => setTimeout(r, 250));
      return { frames, end, caps, dir };
    },
  };
}
const probe = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }));
const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-r', '30'];
/** One recorded part: its frames at 30 fps, 1280 x 636, with the caption bar's pictures under it. -> seconds */
function encodePart({ frames, end, caps, dir }, out, capPng) {
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, ((frames[i + 1]?.t ?? end) - f.t)).toFixed(4)}`).join('\n') + `\nfile '${frames.at(-1).file}'\n`;
  const lf = path.join(dir, 'list.txt'); fs.writeFileSync(lf, list);
  const dur = end - frames[0].t;
  // the caption bar: the empty bar under everything, each caption's picture faded in and out at its time
  const cues = caps.map((c, i) => ({ ...c, end: caps[i + 1] ? caps[i + 1].at : dur })).filter(c => c.text && c.end - c.at > 0.2);
  const inputs = ['-f', 'concat', '-safe', '0', '-i', lf, '-loop', '1', '-t', dur.toFixed(3), '-i', capPng('')];
  let g = `[0:v]fps=30,scale=${W}:${PH}:flags=lanczos,setsar=1[top];[1:v]fps=30,format=rgba[bar0];`, last = 'bar0';
  cues.forEach((c, i) => {
    inputs.push('-loop', '1', '-t', dur.toFixed(3), '-i', capPng(c.text));
    const a = Math.max(0, c.at), b = Math.min(dur, c.end), F = 0.3;
    g += `[${i + 2}:v]fps=30,format=rgba,fade=t=in:st=${a.toFixed(2)}:d=${F}:alpha=1,fade=t=out:st=${Math.max(a + F, b - F).toFixed(2)}:d=${F}:alpha=1[c${i}];[${last}][c${i}]overlay=0:0:format=auto[b${i}];`;
    last = `b${i}`;
  });
  g += `[top][${last}]vstack=inputs=2,format=yuv420p[v]`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', g, '-map', '[v]', '-t', dur.toFixed(3), ...enc, out]);
  return probe(out);
}
/** A card: a still picture for some seconds. */
function cardPart(png, secs, out) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-t', String(secs), '-i', png, '-vf', `fps=30,scale=${W}:${H},setsar=1,format=yuv420p`, ...enc, out]);
  return probe(out);
}
/** The parts joined with short cross-fades; the first fades in from black, the last out to black. */
function joinParts(parts, out) {
  const FADE = 0.5;
  const inputs = parts.flatMap(p => ['-i', p.file]);
  let chain = '', last = '[0:v]', offset = 0;
  for (let i = 1; i < parts.length; i++) {
    offset += parts[i - 1].dur - FADE;
    chain += `${last}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[x${i}];`;
    last = `[x${i}]`;
  }
  const total = offset + parts.at(-1).dur;
  chain += `${last}fade=t=in:st=0:d=0.5,fade=t=out:st=${(total - 0.7).toFixed(2)}:d=0.7,format=yuv420p[v]`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', chain, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-tune', 'animation',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.0', '-movflags', '+faststart', '-an', out]);
  // where each part starts in the joined video (for the captions)
  const starts = []; let s = 0; for (const p of parts) { starts.push(s); s += p.dur - FADE; }
  return starts;
}
const vttTime = s => { const ms = Math.max(0, Math.round(s * 1000)); const h = Math.floor(ms / 3600e3), m = Math.floor(ms / 60e3) % 60, x = (ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x.toFixed(3).padStart(6, '0')}`; };

// ---------------------------------------------------------------- the class (made up)
const STUDENTS = [['CosmicPanda', '🐼'], ['SwiftOtter', '🦦'], ['BrightFox', '🦊'], ['CozyKoala', '🐨'], ['MightyMaple', '🦌'], ['ZippyLynx', '🐱'], ['SunnyHeron', '🐦'], ['PixelPuffin', '🐧']];
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
  // The Hub: HOMEROOM on, this teacher in HOMEROOM_USERS and on the Teacher plan (as tests/unit/homeroom*.test.js do).
  TOOLS.plansOn();
  const boss = createUser({ username: 'HubVideoBoss', password: 'hub-video-secret-1', role: 'admin' });
  const school = S.createSchool(boss, { name: 'Juniper Hill Demo School' }).school;
  const T = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Ms. Okafor', role: 'teacher' }).user.id);
  q.run("UPDATE users SET display_name='Ms. Okafor', avatar='🦉', color='#1F9D63' WHERE id=?", T.id);
  TOOLS.givePlan(T.id);
  Object.assign(config, { homeroom: true, homeroomOnboarding: false, liveClassroom: true, manipulatives: true });
  config.homeroomUsers = [T.username.toLowerCase()];
  config.manipulativesUsers = [...(config.manipulativesUsers || []), T.username.toLowerCase()];
  const cls = S.createClass(boss, school.id, { name: 'Room 7 · Grade 4', grade: '4', teacherId: T.id }).class;
  // Oomba names only, as the roster name too: nothing on screen is anyone's real name.
  const kids = STUDENTS.map(([n, a], i) => {
    const u = getUser(S.createSchoolAccount(boss, school.id, { rosterName: n, grade: '4' }).user.id);
    S.addToClass(boss, cls.id, u.id);
    q.run('UPDATE users SET display_name=?, avatar=?, color=? WHERE id=?', n, a, ['#2f6bff', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#0ea5e9', '#ef4444', '#14b8a6'][i], u.id);
    return getUser(u.id);
  });
  H.saveSeats(T, cls, { preset: 'pods', seats: {} });
  const groups = H.roomOf(cls.id).groups;
  H.saveGroups(T, cls, { groups, members: Object.fromEntries(kids.map((k, i) => [k.id, groups[i % 2].id])) });
  H.saveArea(T, cls, { __ann: { notes: [{ id: 'n1', text: 'Warm-up: what is 3/4 of 12?', x: 0.06, y: 0.42, by: 't' }, { id: 'n2', text: 'Today: fractions on a number line', x: 0.3, y: 0.42, by: 't' }], texts: [], strokes: [] }, shapes: [] });
  const gid = s => G.getGameBySlug(s).id;
  return { config, q, T, cls, kids, groups, gid };
}

// ---------------------------------------------------------------- the run
async function main() {
  const R = ROOT + '/';
  const { appMark, wordmark } = await import(R + 'server/views/brand.js');
  Object.assign(BRAND, { mark: String(appMark('appmark')), word: String(wordmark('wordmark word')), small: String(appMark('appmark')), wordSmall: String(wordmark('wordmark')) });
  const W0 = await seed(R);
  const { T, cls, kids, gid } = W0;
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
  const open = async (who, url, { w = VW, h = VH, touch = false, overlay = false, label = '' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch && w < 600, locale: 'en-US', colorScheme: 'light', timezoneId: 'America/New_York' });
    const [n, v] = cookieOf(who.id);
    await ctx.addCookies([{ name: n, value: v, url: BASE }, { name: 'theme', value: 'light', url: BASE }]);
    if (overlay) await ctx.addInitScript(overlayInit, [OVERLAY_CSS, POINTER_SVG]);
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', e => errors.push(`${label}: page error: ${e.message}`));
    page.on('response', r => { if (r.status() >= 500) errors.push(`${label}: HTTP ${r.status()} ${r.url()}`); });
    if (url) await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    return { ctx, page };
  };
  const ctxs = [];
  try {
    await film({ open, ctxs, errors, W0, BASE });
  } finally {
    for (const c of ctxs) await c.close().catch(() => {});
    await browser.close().catch(() => {});
    server.closeAllConnections(); server.close();
  }
  process.exit(0);
}

// ---------------------------------------------------------------- the film
/** The phone stage: a student's own desk in a phone, beside a short heading. */
const phoneHtml = src => `<!doctype html><html><head><meta charset="utf-8"><title>stage</title><style>${FONT}
html,body{margin:0;height:100%;overflow:hidden}
body{font-family:Brico,system-ui,sans-serif;background:radial-gradient(900px 600px at 10% 0%,#dff4e8 0%,transparent 60%),radial-gradient(800px 500px at 100% 100%,#fff1c2 0%,transparent 55%),#f7f3e8;color:#1f1f1b}
.side{position:absolute;left:150px;top:220px;width:640px}
.chip{display:inline-block;font-size:20px;font-weight:700;color:#237a4f;background:#e3f5ea;border-radius:999px;padding:10px 20px;margin-bottom:24px}
h2{font-size:58px;line-height:1.05;margin:0;letter-spacing:-.03em;font-weight:800}
p{font-size:27px;line-height:1.4;color:#5b5a52;margin:22px 0 0}
.phone{position:absolute;right:190px;top:12px;width:414px;height:692px;border-radius:52px;background:#1b1b18;padding:12px;box-sizing:border-box;box-shadow:0 30px 80px rgba(31,31,27,.3)}
.glass{width:390px;height:668px;border-radius:40px;overflow:hidden;background:#fff}
iframe{width:390px;height:668px;border:0;display:block}
</style></head><body>
<div class="side"><span class="chip">A student's view</span><h2>Their own desk</h2><p>What you hand out, in order, with your notes. A big button to raise a hand.</p></div>
<div class="phone"><div class="glass"><iframe id="scr" src="${src}"></iframe></div></div></body></html>`;

async function film({ open, ctxs, errors, W0, BASE }) {
  const R = ROOT + '/';
  const { config, q, T, cls, kids, groups, gid } = W0;
  const HP = await import(R + 'server/services/homeroom-plan.js');
  const HV = await import(R + 'server/services/homeroom-live.js');
  const HO = await import(R + 'server/services/homeroom-handouts.js');
  const LS = await import(R + 'server/services/classlive-sessions.js');
  const CO = await import(R + 'server/services/companion.js');
  const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-video-frames-'));
  if (PEEK) fs.mkdirSync(PEEK, { recursive: true });

  // Today's plan, ready to start (what Use this plan on an Oomba card does: services/homeroom-plan.js usePlan).
  const today = HP.cleanPlan(T, cls, { name: 'Fractions day', topic: 'fractions', parts: [
    { kind: 'slides', minutes: 8, title: 'Fractions on a number line' },
    { kind: 'work', minutes: 20, title: 'Practice in pairs' },
    { kind: 'break', minutes: 3, title: 'Stretch and wiggle' },
    { kind: 'exit', minutes: 5, title: 'One thing I learned' }] }).plan;
  const used = HP.usePlan(T, cls, today);
  if (!used.ok) throw new Error(`the day plan: ${used.code}`);

  // A stand-in for the AI behind Ask Oomba: the real tools, called with fixed inputs (no key, no AI).
  const tomorrow = { name: 'Fractions, day 2', topic: 'fractions', parts: [
    { kind: 'slides', minutes: 6, title: 'Compare fractions' },
    { kind: 'work', minutes: 20, title: 'Practice', groups: [{ group: 'Stretch', gameId: gid('sudoku') }, { group: 'On track', gameId: gid('mistake-hunt') }], instructions: 'Two rounds, then check with a partner.' },
    { kind: 'break', minutes: 3, title: 'Brain break' },
    { kind: 'exit', minutes: 5, title: 'Exit check', pick: { gameId: gid('word-hunt') } }] };
  const lastWords = p => { for (let i = p.messages.length - 1; i >= 0; i--) { const m = p.messages[i]; if (m.role !== 'user') continue; if (typeof m.content === 'string') return m.content; const t = m.content.find(c => c.type === 'text'); if (t) return t.text; } return ''; };
  CO.hooks.create = async p => {
    const last = p.messages.at(-1), after = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    const w = lastWords(p);
    const base = { model: p.model, usage: { input_tokens: 1, output_tokens: 1 } };
    const tool = (name, input) => ({ ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${name}_${Date.now()}`, name, input }] });
    const text = t => ({ ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
    if (/point/i.test(w)) return after ? text('Done. The whole class got a point for teamwork.') : tool('givePoint', { target: 'class', reason: 'teamwork' });
    if (/plan/i.test(w)) return after ? text('Here is a plan for tomorrow: slides, work time by group, a brain break and an exit check. Ask for changes, or tap Use this plan.') : tool('draftDayPlan', tomorrow);
    return text('Happy to help.');
  };

  // ---- the students: real pages on their desks (not filmed)
  const desk = `/class/${cls.id}/desk`;
  const kidsP = [];
  for (const [i, k] of kids.entries()) { const s = await open(k, desk, { w: 1024, h: 700, label: k.display_name }); ctxs.push(s.ctx); kidsP[i] = s.page; }
  const kidDo = async (i, f) => { try { await f(kidsP[i]); } catch (e) { errors.push(`${kids[i].display_name}: ${e.message.split('\n')[0]}`); } };
  const openCard = (i, title) => kidDo(i, async p => {
    const c = p.locator(`.hd-card:has-text("${title}")`).first();
    await c.waitFor({ timeout: 20000 });
    await c.click();
    await p.waitForSelector('.hr-player .hr-playframe', { timeout: 20000 });
  });

  // ---- the teacher's board (filmed)
  const { ctx: tctx, page } = await open(T, `/class/${cls.id}/hub`, { overlay: true, label: 'teacher' });
  ctxs.push(tctx);
  await page.waitForSelector('.hr-desk[data-sid]');
  await page.waitForTimeout(1500);
  // a little closer, the desks in the middle of the screen (the board pans when its empty floor is dragged)
  await page.click('[data-hr="zin"]'); await page.waitForTimeout(500);
  await page.mouse.move(1290, 520); await page.mouse.down(); await page.mouse.move(1290, 480, { steps: 5 }); await page.mouse.move(1290, 450, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(500);
  const parts = [];
  const desk$ = i => `.hr-desk[data-sid="${kids[i].id}"]`;

  let rec = await recorder(page, path.join(WORK, 'board'));
  let S = stage(page, { peek: PEEK, rec, name: 'board' });
  /** A cut: the time something takes off camera (students opening work, Oomba thinking) is left out of the video. */
  let cuts = 0;
  const cut = async during => {
    parts.push({ kind: 'rec', ...(await rec.stop()) });
    await during();
    rec = await recorder(page, path.join(WORK, `cut${++cuts}`)); S.setRec(rec);
  };
  // 1. the board
  S.say('This is the Hub: your whole class on one board.');
  await S.moveTo(VW * 0.55, VH * 0.45); await S.wait(2600); await S.peek('board');
  S.say('Your area is at the top. Everyone can see it.');
  await S.spot('.hr-area'); await S.move('.hr-area', { dx: 0.7, dy: 0.5 }); await S.wait(2400);
  S.say('Below it, every student has a desk.');
  await S.spot(page => page.locator('.hr-desk[data-sid]').nth(2)); await S.move(desk$(3)); await S.wait(2200); await S.peek('desks');
  S.say('Start class, and everyone comes to the Hub.');
  await S.click('[data-hr="golive"]', seen('#hr-live:not([hidden])'));
  await S.wait(1400); await S.peek('live');

  // 2. handing out
  S.say('Tap a lesson, then a desk.');
  const lab = `#hr-panel [data-hritem="${gid('sudoku')}"]:visible`;
  await S.type('#hr-cq', 'sudoku', seen(lab));
  await S.click(lab, seen('#hr-givebar:not([hidden])'));
  await S.click(desk$(0), seen('.hr-giveform'), { dx: 0.5, dy: 0.45 });
  await S.type('#hr-ins', 'Try a Medium puzzle today.', fn(async p => /Medium puzzle/.test(await p.inputValue('#hr-ins')), 'the note is not typed'));
  await S.click('.hr-giveok', both(none('.hr-giveform'), seen(`${desk$(0)} .hr-card`)));
  await S.wait(900); await S.peek('tap');
  S.say('Or drag a game onto a desk.');
  const cross = `#hr-panel [data-hritem="${gid('crossword')}"]:visible`;
  await page.fill('#hr-cq', '');
  await S.type('#hr-cq', 'crossword', seen(cross));
  await S.drag(cross, desk$(1), seen('.hr-giveform'));
  await S.click('.hr-giveok', both(none('.hr-giveform'), seen(`${desk$(1)} .hr-card`)));
  await S.wait(700); await S.peek('drag');
  S.say('Or hand it to the whole class at once.');
  const hunt = `#hr-panel [data-hritem="${gid('word-hunt')}"]:visible`;
  await page.fill('#hr-cq', '');
  await S.type('#hr-cq', 'word hunt', seen(hunt));
  await S.click(hunt, seen('#hr-givebar:not([hidden])'));
  await S.click('#hr-groupchips [data-hrto="all"]', seen('.hr-giveform'));
  await S.click('.hr-giveok', both(none('.hr-giveform'), fn(async p => (await p.locator('.hr-desk[data-sid] .hr-card').count()) >= kids.length + 2, 'not every desk shows Word Hunt')));
  await S.wait(1200); await S.peek('all');
  await page.fill('#hr-cq', '');
  // the students open their work
  await cut(async () => {
    await Promise.all([openCard(0, 'Sudoku'), openCard(1, 'Crossword'), ...[2, 3, 4, 5, 6].map(i => openCard(i, 'Word Hunt'))]);
    await S.check(atLeast('.hr-desk[data-sid] .hr-screen img.hr-simg', 6), 'the desks\' live pictures', 60000);
    await page.waitForTimeout(1500);
  });

  // 3. watching
  S.say('Each desk shows what the student has open, live.');
  await S.moveTo(VW * 0.62, VH * 0.6);
  await S.wait(3000); await S.peek('watch');
  S.say('Tap a desk to look closer.');
  await S.click(desk$(0), seen('.hr-lkscreen'), { dx: 0.3, dy: 0.3 });
  await S.check(seen('.hr-lkscreen img.hr-simg'), 'the large picture', 30000);
  await S.wait(2600); await S.peek('look');
  await page.keyboard.press('Escape'); await S.check(none('.hr-lkscreen'), 'closing look');
  await S.wait(500);

  // 4. a raised hand
  await kidDo(7, async p => { await p.click('.hd-handbtn'); await p.click('.hd-hmi:has-text("I have a question")'); await p.waitForSelector('.hd-note.up'); });
  S.say('A raised hand goes in the help queue.');
  await S.check(both(seen(`${desk$(7)} .hr-lvhand`), says('.hr-handsbtn .hr-count', /^1$/)), 'the hand on the board', 15000);
  await S.move(`${desk$(7)} .hr-lvhand`); await S.wait(900);
  await S.click('.hr-handsbtn', seen('.hr-hrow'));
  await S.check(says('.hr-hrow', new RegExp(kids[7].display_name)), 'the queue');
  await S.wait(1400); await S.peek('hands');
  S.say('Tap Answered when you have helped.');
  await S.click('[data-hrhand^="answer:"]', none('.hr-hrow'));
  await kidDo(7, p => p.waitForSelector('.hd-note.up', { state: 'detached', timeout: 10000 }));
  await S.wait(1400);
  await S.click('.hr-handsbtn', seen('.hr-handsbtn[aria-expanded="false"]'));

  // 5. the day plan
  S.say('Today\'s plan is ready. Start it when class begins.');
  await S.click('#hr-plan [data-hrplan="start"]', says('#hr-plan', /Now[\s\S]*Fractions on a number line[\s\S]*\d:\d\d/));
  await S.wait(1200); await S.peek('plan');
  S.say('The Now bar shows the part you are on and the time left.');
  await S.spot('#hr-plan'); await S.wait(2000);
  await S.click('#hr-plan [data-hrplan="next"]', says('#hr-plan', /Now[\s\S]*Practice in pairs/));
  await kidDo(7, async p => { await p.waitForSelector('#hd-now:not([hidden])', { timeout: 10000 }); if (!/Practice in pairs/.test(await p.textContent('#hd-now'))) throw new Error('the desk\'s Now is not the second part'); });
  await S.wait(1300); await S.peek('next');

  // 6. points
  S.say('Give a point for teamwork. Students see their own points, never a ranking.');
  await S.click('#oc-bubble', seen('#oc-in'));
  await S.type('#oc-in', 'Give the whole class a point for teamwork', fn(async p => /teamwork/.test(await p.inputValue('#oc-in')), 'not typed'));
  await S.click('#oc-send', fn(async p => (await p.inputValue('#oc-in')) === '', 'the message was not sent'));
  await S.wait(1200);
  await cut(() => S.check(says('#oc .oc-point', /teamwork/i), 'the point card', 30000));
  await S.wait(2200); await S.peek('point');
  await S.click('#oc [data-c="min"]', fn(async p => !(await p.locator('#oc-in').isVisible()), 'the chat is still open'));

  // 7. a live game
  S.say('Start a live game without leaving the Hub.');
  await S.click('#hr-panel [data-csubj="live"]', seen('#hr-panel [data-hrlive*="mode=board"]'));
  await S.click('#hr-panel [data-hrlive*="mode=board"]', seen('.hr-liveplayer:not([hidden]) .hr-liveframe'));
  const LF = page.frameLocator('.hr-liveframe');
  const framePath = () => page.evaluate(() => { const f = document.querySelector('.hr-liveframe'); try { return f.contentWindow.location.pathname; } catch { return ''; } });
  await LF.locator('#lv-new').waitFor({ timeout: 20000 });
  await S.wait(1500); await S.peek('host');
  // the live setup's steps (the class is already chosen), off camera: Next until the game is made
  await cut(async () => {
    for (let i = 0; i < 8 && !(await framePath()).startsWith('/live/host/'); i++) {
      const next = LF.locator('#lv-nav [data-go="next"]');
      const go = (await next.isVisible().catch(() => false)) ? next : LF.locator('#lv-new [type="submit"]:visible').first();
      await go.click(); await page.waitForTimeout(500);
    }
    await S.check(async () => (await framePath()).startsWith('/live/host/') || 'the game did not start', 'starting the game', 20000);
    await page.waitForTimeout(1200);
  });
  const live = LS.openForClass(cls.id);
  if (!live) S.fail('no live game for the class');
  S.say('Students tap Join on their desks. No codes to type.');
  const joiners = [0, 1, 2, 3, 4, 5, 6, 7];
  await Promise.all(joiners.map(i => kidDo(i, async p => { await p.waitForSelector('#hd-lgbar [data-lgjoin]', { timeout: 20000 }); await p.waitForTimeout(300 + i * 220); await p.click('#hd-lgbar [data-lgjoin]'); })));
  await S.check(() => ([...live.seats.values()].filter(x => x.conn).length >= 6 ? true : `${[...live.seats.values()].filter(x => x.conn).length} joined`), 'students joining', 30000);
  await S.wait(1600); await S.peek('joined');
  await S.click('.hr-liveplayer [data-lg="min"]', seen('#hr-lgpill'));
  await S.check(both(says('#hr-lgpill', /[6-8] joined/), atLeast('.hr-desk[data-sid] .hr-lgin:not(.hr-lgwait)', 6)), 'the pill and the desks', 15000);
  await S.wait(2000); await S.peek('pill');
  await cut(async () => {
    await page.click('#hr-lgpill [data-lg="end"]'); await page.click('dialog[open] [data-ob="ok"]');
    await S.check(none('#hr-lgpill'), 'ending the live game');
    await page.waitForTimeout(800);
  });

  // 8. a manipulative
  S.say('Hand out a manipulative too.');
  await page.locator('#hr-panel [data-csubj=""]').evaluate(b => b.click());   // back to every subject (the Live games chip is still on)
  await S.type('#hr-cq', 'base ten', seen('[data-hritem="T:manip:base-ten-blocks"]'));
  await S.click('[data-hritem="T:manip:base-ten-blocks"]', seen('#hr-givebar:not([hidden])'));
  await S.click('#hr-groupchips [data-hrto="all"]', seen('.hr-giveform'));
    await S.click('.hr-giveok', none('.hr-giveform'));
  await page.fill('#hr-cq', '');
  // three students build 46: they open it off camera, and put the pieces down on camera
  const builders = [0, 2, 5];
  const pal = i => kidsP[i].frameLocator('.hr-playframe').locator('#rm-pal [data-pal]');
  await cut(() => Promise.all(builders.map(i => kidDo(i, async p => {
    if (await p.locator('.hr-playback').isVisible().catch(() => false)) { await p.click('.hr-playback'); await p.waitForSelector('.hr-player', { state: 'detached', timeout: 20000 }); }
    const c = p.locator('.hd-card:has-text("Base Ten Blocks")').first(); await c.waitFor({ timeout: 20000 }); await c.click();
    await pal(i).first().waitFor({ timeout: 25000 });
    await p.frameLocator('.hr-playframe').locator('#rm-pal [data-pal][aria-label="Add Rod, 10"]').click();
  }))));
  if (errors.length) S.fail(`the students' pages: ${errors.join('; ')}`);
  const building = Promise.all(builders.map((i, j) => kidDo(i, async p => {
    await p.waitForTimeout(j * 300);
    for (const [label, n] of [['Add Rod, 10', 2], ['Add Unit, 1', 3]]) for (let k = 0; k < n; k++) { await p.frameLocator('.hr-playframe').locator(`#rm-pal [data-pal][aria-label="${label}"]`).click(); await p.waitForTimeout(380); }
  })));
  S.say('Watch each student build it, piece by piece.');
  await S.check(atLeast('.hr-desk[data-sid] .hr-screen[data-kind="tool"] .mp-piece', 9), 'pieces on the desks', 40000);
  await S.move(desk$(2)); await building; await S.wait(1000); await S.peek('manip');
  await S.click(desk$(2), seen('.hr-lkscreen[data-kind="tool"] .mp-piece'), { dx: 0.3, dy: 0.3, ms: 20000 });
  await S.wait(1800); await S.peek('manip-look');
  await page.keyboard.press('Escape'); await S.check(none('.hr-lkscreen'), 'closing look');
  S.quiet(); await S.hide(); await S.wait(500);
  parts.push({ kind: 'rec', ...(await rec.stop()) });

  // 9. a student's own desk on a phone
  {
    const k = kids[3];
    const { ctx, page: sp } = await open(k, null, { overlay: true, label: 'phone' });
    ctxs.push(ctx);
    await ctx.route(u => /^\/class\/[^/]+\/desk$/.test(u.pathname), async r => {
      const res = await r.fetch(); const headers = { ...res.headers() }; delete headers['x-frame-options'];
      if (headers['content-security-policy']) headers['content-security-policy'] = headers['content-security-policy'].replace(/frame-ancestors [^;]*/, "frame-ancestors 'self'");
      await r.fulfill({ response: res, headers });
    });
    await sp.route(`${BASE}/__phone`, r => r.fulfill({ contentType: 'text/html', body: phoneHtml(desk) }));
    await sp.goto(`${BASE}/__phone`);
    const F = sp.frameLocator('#scr');
    await F.locator('.hd-card').first().waitFor();
    await sp.evaluate(() => document.fonts.ready); await sp.waitForTimeout(1500);
    const prec = await recorder(sp, path.join(WORK, 'phone'));
    const P = stage(sp, { peek: PEEK, rec: prec, name: 'phone' });
    P.say('Students see only their own desk, on any device.');
    await P.check(async () => { const n = await F.locator('.hd-card').count(); return n >= 2 || `${n} cards`; }, 'the cards on the phone');
    await P.moveTo(1000, 300); await P.wait(2000); await P.peek('desk');
    await P.click(() => F.locator('.hd-handbtn'), async () => (await F.locator('.hd-handmenu').isVisible().catch(() => false)) || 'no hand menu');
    await P.wait(1700); await P.peek('handmenu');
    await P.click(() => F.locator('.hd-handbtn'), async () => !(await F.locator('.hd-handmenu').isVisible().catch(() => false)) || 'the hand menu is still open');
    await P.wait(800); P.quiet(); await P.hide(); await P.wait(400);
    parts.push({ kind: 'rec', ...(await prec.stop()) });
    await ctx.close();
  }

  // 10. Ask Oomba drafts a day plan
  rec = await recorder(page, path.join(WORK, 'oomba'));
  S = stage(page, { peek: PEEK, rec, name: 'oomba' });
  S.say('Ask Oomba to draft a day plan.');
  await S.click('#oc-bubble', seen('#oc-in'));
  await S.type('#oc-in', 'Plan tomorrow: comparing fractions, about 35 minutes', fn(async p => /35 minutes/.test(await p.inputValue('#oc-in')), 'not typed'));
  await S.click('#oc-send', fn(async p => (await p.inputValue('#oc-in')) === '', 'the message was not sent'));
  await S.wait(1200);
  await cut(() => S.check(seen('#oc .oc-plan'), 'the plan card', 30000));
  await S.check(says('#oc .oc-plan', /Fractions, day 2[\s\S]*34 min[\s\S]*Slides[\s\S]*Work time[\s\S]*Stretch[\s\S]*Sudoku[\s\S]*Exit check/), 'the plan card');
  await page.locator('#oc .oc-plan').last().evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  await S.wait(2400); await S.peek('plan-card');
  S.say('It uses your groups and games. Nothing goes on desks until you say so.');
  await S.spot(page => page.locator('#oc .oc-plan').last().locator('.oc-planh, h4, header').first(), 2400); await S.wait(3400);
  // (another plan is running today: the card offers Save plan, and says why it cannot be used yet)
  await S.check(says('#oc .oc-plan', /Another plan is running in this class/), 'the card\'s note');
  S.say('Save it for tomorrow, and ask for it again any day.');
  const save = page => page.locator('#oc .oc-plan').last().locator('button', { hasText: 'Save plan' });
  await S.click(save, seen('dialog[open] [data-ob="ok"]'));
  await S.wait(700);
  await S.click('dialog[open] [data-ob="ok"]', says('#toasts', /Saved as .Fractions, day 2.\. Ask for it again any day\./));
  // (the card itself keeps showing Save plan until the chat is opened again: public/js/oomba-chat.js took() leaves a
  // card's savedAs out of what it compares, so a draft card that was saved is not drawn again)
  await S.wait(2200); await S.peek('saved');
  S.quiet(); await S.hide(); await S.wait(600);
  parts.push({ kind: 'rec', ...(await rec.stop()) });

  if (errors.length) throw new Error(`the pages reported errors:\n  ${errors.join('\n  ')}`);

  // ---- the files
  const capDir = path.join(WORK, 'caps'); fs.mkdirSync(capDir);
  const { ctx: cctx, page: cp } = await open(T, null, { w: W, h: H, label: 'cards' }); ctxs.push(cctx);
  const picture = async (html, file, h) => { await cp.setViewportSize({ width: W, height: h }); await cp.route(`${BASE}/__card`, r => r.fulfill({ contentType: 'text/html', body: html })); await cp.goto(`${BASE}/__card`); await cp.evaluate(() => document.fonts.ready); await cp.screenshot({ path: file }); await cp.unroute(`${BASE}/__card`); return file; };
  const capFiles = new Map();
  const capList = [...new Set(parts.flatMap(p => p.caps.map(c => c.text || '')))];
  for (const [i, text] of capList.entries()) capFiles.set(text, await picture(capHtml(text), path.join(capDir, `cap${i}.png`), CAP));
  const title = await picture(cardHtml('The Hub in 2 minutes', 'Run your whole class from one board.', false), path.join(WORK, 'title.png'), H);
  const endCard = await picture(cardHtml('The Hub.', 'Available with the Teacher plan.', true), path.join(WORK, 'end.png'), H);
  const files = [{ file: path.join(WORK, 'p-title.mp4'), caps: [] }];
  files[0].dur = cardPart(title, 3.2, files[0].file);
  for (const [i, p] of parts.entries()) { const file = path.join(WORK, `p${i}.mp4`); files.push({ file, caps: p.caps, dur: encodePart(p, file, t => capFiles.get(t)) }); }
  const ef = path.join(WORK, 'p-end.mp4'); files.push({ file: ef, caps: [], dur: cardPart(endCard, 4.0, ef) });
  fs.mkdirSync(OUT, { recursive: true });
  const mp4 = path.join(OUT, `${NAME}.mp4`);
  const starts = joinParts(files, mp4);
  const dur = probe(mp4);
  // the captions, at their times in the joined video
  const cues = [];
  files.forEach((f, i) => f.caps.forEach((c, j) => { if (!c.text) return; const a = starts[i] + c.at, b = starts[i] + (f.caps[j + 1] ? f.caps[j + 1].at : f.dur - 0.5); if (b - a > 0.2) cues.push([a + 0.1, Math.min(dur, b), c.text]); }));
  for (let i = cues.length - 1; i > 0; i--) if (cues[i][2] === cues[i - 1][2]) { cues[i - 1][1] = cues[i][1]; cues.splice(i, 1); }
  for (let i = 1; i < cues.length; i++) cues[i][0] = Math.max(cues[i][0], cues[i - 1][1] + 0.05);
  cues.push([starts.at(-1) + 0.3, dur, 'The Hub. Available with the Teacher plan.']);
  fs.writeFileSync(path.join(OUT, `${NAME}.en.vtt`), `WEBVTT\n\n${cues.map(([a, b, t], i) => `${i + 1}\n${vttTime(a)} --> ${vttTime(b)}\n${t}`).join('\n\n')}\n`);
  // the poster: the board with every desk live (the first part, a little after the pictures arrive)
  const pi = files.findIndex(f => f.caps.some(c => /open, live\.$/.test(c.text || '')));
  const posterAt = pi < 0 ? dur / 3 : starts[pi] + files[pi].caps.find(c => /open, live\.$/.test(c.text || '')).at + 2.5;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', posterAt.toFixed(2), '-i', mp4, '-frames:v', '1', '-q:v', '3', path.join(OUT, `${NAME}-poster.jpg`)]);
  if (SHEET) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'fps=1/6,scale=480:-1,tile=4x5', '-frames:v', '1', '-q:v', '3', path.join(OUT, `${NAME}-sheet.jpg`)]);
  console.log(`${path.relative(process.cwd(), mp4)}  ${dur.toFixed(1)} s  ${(fs.statSync(mp4).size / 1048576).toFixed(2)} MB`);
  for (const [a, b, t] of cues) console.log(`  ${vttTime(a)} ${vttTime(b)}  ${t}`);
  if (KEEP) console.log('Frames kept in', WORK); else fs.rmSync(WORK, { recursive: true, force: true });
}

// Run in a child process with a throwaway in-memory database (config is read when the server's modules load).
if (!process.env.HUB_VIDEO_CHILD) {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-video-'));
  const env = { ...process.env, HUB_VIDEO_CHILD: '1', BRB_DB: ':memory:', BRB_DATA_DIR: DATA, BRB_SILENT: '1', LOG_REQUESTS: '0', BRB_SNAPSHOTS: '0',
    ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', STRIPE_API_KEY: '', BILLING_PUBLIC: '', HOMEROOM: '1', HOMEROOM_ONBOARDING: '0', MANIPULATIVES: '1', COMPANION: '1', LIVE_CLASSROOM: '1' };
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], { cwd: ROOT, env, stdio: 'inherit' });
  child.on('exit', code => { fs.rmSync(DATA, { recursive: true, force: true }); process.exit(code ?? 1); });
} else {
  main().then(() => process.exit(0), e => { console.error(e.tut ? `PLAY-THROUGH FAILED ${e.message}` : e); process.exit(1); });
}
