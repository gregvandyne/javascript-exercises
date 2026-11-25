// Quick tutorial videos for the Manipulatives tools (/manipulatives#<tool>): one short video per tool for teachers, made
// by playing the REAL page with real clicks, drags and typing. Each action is followed by a check that the page changed
// the way it should, and the run stops with an error naming the step when one does not (so recording a video is also a
// play-through test of the tool's controls).
//
// How: the real app on a throwaway in-memory database with a made-up teacher (Ms. Rivera at Maple Grove Demo School, let
// in as a Manipulatives tester), Playwright driving Chromium at 1280 x 720, Chromium's screencast for the frames, ffmpeg
// (libx264) for the video. A cursor, a click ripple, a caption bar and the title and end cards are drawn into the page
// itself (the screencast has no pointer of its own). Oomba's chat button is turned off for the recording so it never
// covers the board.
//
// Usage: node scripts/manip-tutorials.mjs [slug ...] [--out dir] [--peek dir] [--keep]
//   slug    tools to record (public/js/manip-data.js TOOLS); default: every tool that has a scene below
//   --out   where the files go (default: ./manip-tutorials). Per tool: manip-<slug>.mp4 (H.264, yuv420p, faststart),
//           manip-<slug>-poster.jpg, manip-<slug>.en.vtt (the captions) and manip-<slug>-sheet.jpg (a 4 x 4 contact
//           sheet to review the whole video as one picture)
//   --peek  also save a screenshot after every step to dir (to check a scene without watching it)
//   --keep  keep the raw frames (in dir/.frames-*, printed at the end)
// Needs ffmpeg with libx264 and a Chromium (scripts/chromium.js: BRB_CHROMIUM, else /opt/pw-browsers, else Playwright's).
//
// Adding a tool: one entry in SCENES, keyed by its slug. A scene is
//   { title, sub, end: [title, sub], top: selector scrolled to the top of the screen first, setup?(page),
//     steps: [{ say: 'caption', poster?: true, do: [action, ...] }] }
// and an action is one of
//   { move: target }                          glide the cursor there (no click)
//   { click: target, expect }                 glide, ripple, click
//   { drag: target, to: target, expect }      press, glide, release (pieces, sliders, hands)
//   { type: target, text, enter?, expect }    click a field, replace what is in it, type (Enter when enter: true)
//   { scroll: target, center? }               smooth-scroll the page so target is in view above the caption bar
//   { spot: target, ms?, expect? }            a soft yellow outline around an element for a moment
//   { wait: ms }                              hold (the caption stays)
//   { expect }                                a check on its own
// A target is a CSS selector (its first match), a function (page) => Locator, or a function (page) => { x, y } for a
// spot that is not an element (a value on a number line). An expect is a function (page) => true | string, polled for up
// to 4 s: anything but true fails the run with the step's caption and that string. Every click, drag and type must have
// one. Helpers below (sel, txt, count, attr, all) build the common ones; beside(css) is a spot next to an element. Captions are for teachers: short, calm, plain, no em
// dashes, US spelling.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const OUT = path.resolve(opt('--out') || 'manip-tutorials');
const PEEK = opt('--peek') ? path.resolve(opt('--peek')) : null;
const KEEP = args.includes('--keep');
const SLUGS = args.filter((a, i) => !a.startsWith('--') && !['--out', '--peek'].includes(args[i - 1]));
const W = 1280, H = 720, CAP_H = 84;   // the caption bar takes the bottom CAP_H px: targets are kept above it

// ---------------------------------------------------------------- expect helpers
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
/** The first match of css has text matching re (or equal to a string). */
const txt = (css, want) => async page => {
  const el = page.locator(css).first();
  if (!(await el.count())) return `no ${css}`;
  const got = norm(await el.textContent());
  return (want instanceof RegExp ? want.test(got) : got === want) || `${css} reads "${got}", wanted ${want}`;
};
/** css matches exactly n elements (n may be a function of the count). */
const count = (css, n) => async page => { const c = await page.locator(css).count(); return (typeof n === 'function' ? n(c) : c === n) || `${css}: ${c} found, wanted ${n}`; };
/** css matches at least one visible element. */
const sel = css => async page => (await page.locator(css).first().isVisible().catch(() => false)) || `${css} is not on screen`;
/** css's attribute name equals value. */
const attr = (css, name, value) => async page => { const v = await page.locator(css).first().getAttribute(name).catch(() => null); return v === String(value) || `${css} [${name}] is "${v}", wanted "${value}"`; };
/** A spot dx px to the right of an element's middle (the cursor points at it without covering it). */
const beside = (css, dx = 40) => async page => { const b = await page.locator(css).first().boundingBox(); return { x: b.x + b.width + dx, y: b.y + b.height / 2 }; };
const all = (...fs) => async page => { for (const f of fs) { const r = await f(page); if (r !== true) return r; } return true; };

// ---------------------------------------------------------------- number line helpers
/** The spot on the (first) number line at value v: the inverse of manip.js nlValue (x = 30 + (v - min) / (max - min) * 800
 *  of 860), on the line (y 110 in a viewBox that starts at -50 while jumps are shown, else at 0). */
const nlAt = v => async page => {
  const svg = page.locator('#mp-content svg.mp-nl').first();
  const [r, min, max, vb] = await svg.evaluate(s => [s.getBoundingClientRect().toJSON(), +s.dataset.min, +s.dataset.max, s.getAttribute('viewBox').split(' ').map(Number)]);
  return { x: r.left + ((30 + ((v - min) / (max - min)) * 800) / 860) * r.width, y: r.top + ((110 - vb[1]) / vb[3]) * r.height };
};
const nlPoints = async page => page.locator('#mp-content .mp-nl-pt').evaluateAll(els => els.map(e => +/point (-?[\d.]+)/.exec(e.getAttribute('aria-label'))[1]));
const hasPoints = want => async page => { const got = (await nlPoints(page)).sort((a, b) => a - b); return JSON.stringify(got) === JSON.stringify([...want].sort((a, b) => a - b)) || `dots at [${got}], wanted [${want}]`; };
const sentence = want => txt('#mp-content .mp-nl-sum', want.replace(/-(?=\d)/g, '−'));
const tickLabels = async page => page.locator('#mp-content svg.mp-nl text[y="142"]').count();

// ---------------------------------------------------------------- the scenes
// A real task from public/js/manip-tasks.js for each tool, so the video shows what a class would do with it.
const SCENES = {
  'number-lines': {
    title: 'Number lines: a quick tour',
    sub: 'Oomba Manipulatives',
    end: ['Number lines', 'Find it in Teaching tools, Manipulatives.'],
    top: '#mp-board',
    steps: [
      { say: 'In Points, tap the line to put a dot on it.', do: [
        { click: nlAt(-6), expect: hasPoints([3, -6]) },
        { click: nlAt(6), expect: hasPoints([3, -6, 6]) },
      ] },
      { say: 'Tap a dot to select it, then press Delete.', do: [
        { click: '#mp-content .mp-nl-pt[aria-label="Select the point 6"]', expect: txt('#mp-content .mp-nl-del', '🗑 Delete the dot at 6') },
        { wait: 300 },
        { click: '#mp-content .mp-nl-del', expect: all(hasPoints([3, -6]), count('#mp-content .mp-nl-del', 0)) },
      ] },
      { say: 'Clear dots takes them all away.', do: [
        { click: page => page.locator('#mp-content .mp-chips button', { hasText: 'Clear dots' }), expect: hasPoints([]) },
      ] },
      { say: 'Today’s task: start at 48, then add 25 in three jumps.', do: [
        { move: '#mp-settings input[data-set="max"]' },
        { wait: 900 },
      ] },
      { say: 'First set From and To so the line fits the task.', do: [
        { type: '#mp-settings input[data-set="max"]', text: '80', enter: true, expect: attr('#mp-content svg.mp-nl', 'data-max', 80) },
        { type: '#mp-settings input[data-set="min"]', text: '40', enter: true, expect: all(attr('#mp-content svg.mp-nl', 'data-min', 40), count('#mp-content svg.mp-nl text[y="142"]', 41)) },
      ] },
      { say: 'Switch to Jumps. The first tap picks the start.', do: [
        { click: '#mp-content [data-act="nlmode"][data-m="jumps"]', expect: all(attr('#mp-content [data-m="jumps"]', 'aria-pressed', 'true'), txt('#mp-content .mp-nl-help', 'Tap the line where the jumps start.')) },
        { click: nlAt(48), expect: txt('#mp-content .mp-nl-help', 'Jumping from 48. Tap where the next jump lands.') },
      ] },
      { say: 'Each next tap lands a jump: 20, then 2 to the ten, then 3.', do: [
        { click: nlAt(68), expect: sentence('48 + 20 = 68') },
        { click: nlAt(70), expect: sentence('48 + 20 + 2 = 70') },
        { click: nlAt(73), expect: all(sentence('48 + 20 + 2 + 3 = 73'), count('#mp-content .mp-nl-jump', 3)) },
      ] },
      { say: 'The number sentence is written under the line.', poster: true, do: [
        { move: beside('#mp-content .mp-nl-sum') },
        { wait: 1300 },
      ] },
      { say: 'Undo jump takes back the last jump.', do: [
        { click: page => page.locator('#mp-content .mp-chips button', { hasText: 'Undo jump' }), expect: all(sentence('48 + 20 + 2 = 70'), count('#mp-content .mp-nl-jump', 2), txt('#mp-content .mp-nl-help', /^Jumping from 70\./)) },
        { wait: 400 },
        { click: nlAt(73), expect: sentence('48 + 20 + 2 + 3 = 73') },
      ] },
      { say: 'Hide labels to make it an open number line.', do: [
        { click: '#mp-settings [data-toggle="hide"]', expect: all(async p => (await tickLabels(p)) === 0 || 'tick labels still shown', txt('#mp-settings [data-toggle="hide"]', 'Show labels')) },
        { move: beside('#mp-content .mp-nl-sum') },   // off the line itself, so no tap preview is drawn
        { wait: 1100 },
      ] },
      { say: 'Every task has its prompt and a teacher note, below the board.', do: [
        { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 17) },
        { scroll: page => page.locator('#mp-tasks .mp-task', { hasText: 'Jump strategy 48 + 25' }), center: true },
        { spot: page => page.locator('#mp-tasks .mp-task', { hasText: 'Jump strategy 48 + 25' }),
          expect: txt('#mp-tasks .mp-task:has-text("Jump strategy 48 + 25") p.muted', /^Teacher note: 48 \+ 20 = 68, \+2 = 70, \+3 = 73\./) },
        { move: page => page.locator('#mp-tasks .mp-task', { hasText: 'Jump strategy 48 + 25' }).locator('p').nth(1) },
        { wait: 900 },
        { move: page => page.locator('#mp-tasks .mp-task', { hasText: 'Jump strategy 48 + 25' }).locator('p.muted') },
        { wait: 1800 },
      ] },
    ],
  },
};

// ---------------------------------------------------------------- what is drawn into the page
const OVERLAY_CSS = `
#tut-ptr{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:30px;height:36px;transform:translate(-100px,-100px);filter:drop-shadow(0 3px 4px rgba(0,0,0,.3));opacity:0;transition:opacity .3s}
#tut-ptr.on{opacity:1}
.tut-ring{position:fixed;z-index:2147483646;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:4px solid #FFD23F;box-shadow:0 0 0 2px rgba(20,20,20,.15);animation:tutring .55s ease-out forwards}
@keyframes tutring{from{transform:scale(.35);opacity:1}to{transform:scale(1.35);opacity:0}}

.tut-spot{position:fixed;z-index:2147483644;pointer-events:none;border:3px solid #FFD23F;border-radius:16px;box-shadow:0 0 0 6px rgba(255,210,63,.25);transition:opacity .45s;animation:tutspot .45s ease-out}
@keyframes tutspot{from{opacity:0;transform:scale(1.02)}to{opacity:1;transform:none}}
#tut-cap{position:fixed;left:50%;bottom:14px;z-index:2147483645;pointer-events:none;transform:translateX(-50%);max-width:${W - 80}px;min-height:56px;box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:12px 24px 12px 14px;border-radius:999px;background:#FFFDF2;border:1.5px solid #E2DDCB;box-shadow:0 12px 32px rgba(20,20,20,.16);font:600 22px/1.25 "Bricolage Grotesque",system-ui,sans-serif;letter-spacing:-.01em;color:#141414;white-space:nowrap;transition:opacity .35s,transform .35s}
#tut-cap.out{opacity:0;transform:translate(-50%,8px)}
#tut-cap .tut-dot{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#66C792;color:#141414;font-size:15px;font-weight:800}
#tut-card{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;text-align:center;background:radial-gradient(900px 520px at 50% 40%,#2b3a30 0%,#161814 72%);color:#FFFDF2;font-family:"Bricolage Grotesque",system-ui,sans-serif;transition:opacity .6s}
#tut-card.out{opacity:0;pointer-events:none}
#tut-card .logo{width:84px;height:84px;margin:0 auto 26px;border-radius:22px;box-shadow:0 0 70px rgba(102,199,146,.45)}
#tut-card .logo svg{width:84px;height:84px;display:block}
#tut-card .appmark .am-bg{fill:#66c792}#tut-card .appmark .am-eyes{fill:none;stroke:#141414}#tut-card .appmark .am-pupils{fill:#141414}#tut-card .appmark .am-spark{fill:#ffd23f;stroke:#141414}
#tut-card h1{margin:0;font-size:64px;line-height:1.05;letter-spacing:-.03em;font-weight:800}
#tut-card p{margin:18px 0 0;font-size:28px;color:#cfe9d9;font-weight:500}
`;
const POINTER_SVG = '<svg viewBox="0 0 34 40" width="30" height="36"><path d="M3 2 L3 32 L11 25 L17 38 L23 35 L17 23 L28 23 Z" fill="#141414" stroke="#FFFDF2" stroke-width="2.5" stroke-linejoin="round"/></svg>';

/** Runs in the page before its own scripts: the overlay's style and elements, kept on top of whatever the page draws. */
function overlayInit([css, ptr]) {
  const put = () => {
    if (document.getElementById('tut-ptr') || !document.body) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const p = document.createElement('div'); p.id = 'tut-ptr'; p.innerHTML = ptr; document.body.appendChild(p);
    const c = document.createElement('div'); c.id = 'tut-cap'; c.className = 'out'; document.body.appendChild(c);
  };
  if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
}

// ---------------------------------------------------------------- the stage: cursor, captions, cards, checks
function stage(page, { slug, peekDir, rec }) {
  let cur = { x: W * 0.62, y: H * 0.55 }, peekN = 0, stepName = '';
  const fail = msg => { const e = new Error(`[${slug}] "${stepName}": ${msg}`); e.tut = true; throw e; };
  const resolve = async target => {
    const t = typeof target === 'string' ? page.locator(target).first() : await target(page);
    if (t && typeof t.x === 'number') return { pt: t };
    const loc = t.first ? t.first() : t;
    if (!(await loc.count())) fail(`nothing matches ${typeof target === 'string' ? target : target.toString().slice(0, 120)}`);
    return { loc };
  };
  const box = async loc => { const b = await loc.boundingBox(); if (!b) fail('target is not on screen'); return b; };
  /** Smooth-scroll the page so the box sits between the top and the caption bar. */
  const inView = async (b, center = false) => {
    const top = 76, bottom = H - CAP_H - 16;
    let d = 0;
    if (center) d = b.y + b.height / 2 - (top + bottom) / 2;
    else if (b.y < top) d = b.y - top; else if (b.y + b.height > bottom) d = Math.min(b.y - top, b.y + b.height - bottom);
    if (Math.abs(d) < 2) return false;
    await page.evaluate(d => window.scrollBy({ top: d, behavior: 'smooth' }), d);
    await page.waitForTimeout(750);
    return true;
  };
  const pointOf = async target => {
    const r = await resolve(target);
    if (r.pt) { if (r.pt.y > H - CAP_H - 10 || r.pt.y < 0) fail(`spot (${Math.round(r.pt.x)}, ${Math.round(r.pt.y)}) is under the caption bar or off screen`); return { ...r.pt, loc: null }; }
    let b = await box(r.loc);
    if (await inView(b)) b = await box(r.loc);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, loc: r.loc };
  };
  /** The drawn cursor and the real mouse glide together (so hover previews show). */
  const glide = async (x, y, ms = 650) => {
    const from = cur; cur = { x, y };
    const dist = Math.hypot(x - from.x, y - from.y); ms = Math.round(Math.max(280, Math.min(ms, 260 + dist * 0.9)));
    const anim = page.evaluate(([fx, fy, x, y, ms]) => new Promise(res => {
      const p = document.getElementById('tut-ptr'); p.classList.add('on');
      const t0 = performance.now();
      const f = now => { const k = Math.min(1, (now - t0) / ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        p.style.transform = `translate(${fx + (x - fx) * e - 3}px,${fy + (y - fy) * e - 2}px)`; if (k < 1) requestAnimationFrame(f); else res(); };
      requestAnimationFrame(f);
    }), [from.x, from.y, x, y, ms]);
    await page.mouse.move(x, y, { steps: Math.max(4, Math.round(ms / 40)) });
    await anim;
  };
  const ripple = (x, y) => page.evaluate(([x, y]) => { const r = document.createElement('div'); r.className = 'tut-ring'; r.style.left = `${x}px`; r.style.top = `${y}px`; document.body.appendChild(r); setTimeout(() => r.remove(), 650); }, [x, y]);
  const check = async (expect, what) => {
    if (!expect) return;
    let last = '';
    for (let t0 = Date.now(); Date.now() - t0 < 4000;) {
      const r = await expect(page).catch(e => e.message);
      if (r === true) return;
      last = r; await page.waitForTimeout(120);
    }
    fail(`after ${what}: ${last}`);
  };
  const unfocus = () => page.evaluate(() => { const a = document.activeElement; if (a && a !== document.body && !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) a.blur(); });
  const caps = [];
  return {
    caps,
    async step(name) { stepName = name; },
    async caption(text) {
      caps.push({ at: rec.now(), text });
      await page.evaluate(text => {
        const c = document.getElementById('tut-cap');
        c.classList.add('out');
        setTimeout(() => { c.innerHTML = '<span class="tut-dot">▶</span><span></span>'; c.lastChild.textContent = text; c.classList.remove('out'); }, c.textContent ? 300 : 0);
      }, text);
      await page.waitForTimeout(600);
    },
    async hideCaption() { caps.push({ at: rec.now(), text: null }); await page.evaluate(() => document.getElementById('tut-cap').classList.add('out')); },
    async card(title, sub, mark) {
      await page.evaluate(([title, sub, mark]) => {
        let c = document.getElementById('tut-card');
        if (!c) { c = document.createElement('div'); c.id = 'tut-card'; c.className = 'out'; document.body.appendChild(c); }
        c.innerHTML = `<div><div class="logo">${mark}</div><h1></h1><p></p></div>`;
        c.querySelector('h1').textContent = title; c.querySelector('p').textContent = sub;
        document.getElementById('tut-ptr').classList.remove('on');
        c.getBoundingClientRect(); c.classList.remove('out');
      }, [title, sub, mark]);
    },
    async cardOut() { await page.evaluate(() => document.getElementById('tut-card').classList.add('out')); },
    async peek(name) { if (peekDir) await page.screenshot({ path: path.join(peekDir, `${slug}-${String(++peekN).padStart(2, '0')}-${name}.png`) }); },
    async run(a) {
      if (a.wait) return page.waitForTimeout(a.wait);
      if (a.scroll) { const r = await resolve(a.scroll); if (r.loc) await inView(await box(r.loc), a.center); return; }
      if (a.spot) {   // a soft outline around an element for a moment (the part of the page a caption talks about)
        const r = await resolve(a.spot); if (!r.loc) fail('spot needs an element');
        let b = await box(r.loc); if (await inView(b, true)) b = await box(r.loc);
        await page.evaluate(([b, ms]) => { const d = document.createElement('div'); d.className = 'tut-spot'; Object.assign(d.style, { left: `${b.x - 8}px`, top: `${b.y - 6}px`, width: `${b.width + 16}px`, height: `${b.height + 12}px` }); document.body.appendChild(d); setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 500); }, ms); }, [b, a.ms || 3800]);
        await check(a.expect, 'the outline'); await page.waitForTimeout(300); return;
      }
      if (a.move) { const p = await pointOf(a.move); await glide(p.x, p.y); await check(a.expect, 'moving'); return; }
      if (a.click) {
        if (!a.expect) fail('a click needs an expect');
        const p = await pointOf(a.click); await glide(p.x, p.y);
        await page.waitForTimeout(120); await ripple(p.x, p.y);
        await page.mouse.click(p.x, p.y);
        await check(a.expect, 'the click'); await unfocus(); await page.waitForTimeout(380); return;
      }
      if (a.type) {
        if (!a.expect) fail('typing needs an expect');
        const p = await pointOf(a.type); await glide(p.x, p.y); await ripple(p.x, p.y);
        await page.mouse.click(p.x, p.y, { clickCount: 3 });
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type(String(a.text), { delay: 90 });
        if (a.enter) await page.keyboard.press('Enter');
        await check(a.expect, `typing "${a.text}"`); await page.waitForTimeout(350); return;
      }
      if (a.drag) {
        if (!a.expect) fail('a drag needs an expect');
        const p = await pointOf(a.drag); await glide(p.x, p.y); await ripple(p.x, p.y);
        await page.mouse.down();
        const q = await pointOf(a.to); await glide(q.x, q.y, 900);
        await page.mouse.up();
        await check(a.expect, 'the drag'); await page.waitForTimeout(380); return;
      }
      if (a.expect) return check(a.expect, 'the step');
      fail(`unknown action ${JSON.stringify(a)}`);
    },
  };
}

// ---------------------------------------------------------------- recording and the files
/** Chromium's screencast of the page: JPEG frames with their times. now() is the video's clock (seconds from the first frame). */
async function recorder(page, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let firstAt = null;
  cdp.on('Page.screencastFrame', async f => {
    const file = path.join(dir, `${String(frames.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    if (firstAt === null) firstAt = performance.now();
    frames.push({ file, t: f.metadata.timestamp, at: performance.now() });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1, maxWidth: W, maxHeight: H });
  // a first frame straight away (the page may be still)
  await page.evaluate(() => { document.body.style.outline = '0px solid transparent'; });
  for (let i = 0; i < 50 && firstAt === null; i++) await new Promise(r => setTimeout(r, 40));
  return {
    now: () => (firstAt === null ? 0 : (performance.now() - firstAt) / 1000),
    async stop() {
      const last = frames.at(-1), end = last.t + (performance.now() - last.at) / 1000;
      await cdp.send('Page.stopScreencast');
      await new Promise(r => setTimeout(r, 200));
      return { frames, end };
    },
  };
}
function encode({ frames, end }, out) {
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, ((frames[i + 1]?.t ?? end) - f.t)).toFixed(4)}`).join('\n') + `\nfile '${frames.at(-1).file}'\n`;
  const lf = path.join(path.dirname(frames[0].file), 'list.txt'); fs.writeFileSync(lf, list);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lf, '-vf', `fps=30,scale=${W}:${H}:flags=lanczos,setsar=1,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }));
}
const vttTime = s => { const ms = Math.max(0, Math.round(s * 1000)); const h = Math.floor(ms / 3600e3), m = Math.floor(ms / 60e3) % 60, x = (ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x.toFixed(3).padStart(6, '0')}`; };
function vtt(caps, dur) {
  const cues = [];
  caps.forEach((c, i) => { if (c.text) cues.push(`${vttTime(c.at + 0.3)} --> ${vttTime(Math.min(dur, caps[i + 1] ? caps[i + 1].at + 0.3 : dur))}\n${c.text}`); });
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${c}`).join('\n\n')}\n`;
}

// ---------------------------------------------------------------- the teacher and the run
async function main() {
  const { config } = await import('../server/config.js');
  config.anthropicKey = '';
  config.companion = false;   // Oomba's round chat button sits over the board's right edge at 1280 x 720
  const { q } = await import('../server/db.js');
  const { createUser, getUser, startSession } = await import('../server/auth.js');
  const S = await import('../server/services/schools.js');
  const { TOOL_SLUGS } = await import('../public/js/manip-data.js');
  const { appMark } = await import('../server/views/brand.js');
  const MARK = String(appMark('appmark'));
  const slugs = SLUGS.length ? SLUGS : Object.keys(SCENES);
  for (const s of slugs) {
    if (!TOOL_SLUGS.includes(s)) throw new Error(`${s} is not a tool (public/js/manip-data.js TOOLS)`);
    if (!SCENES[s]) throw new Error(`${s} has no scene yet in SCENES`);
  }
  // A made-up teacher, let in as a Manipulatives tester (config.manipulativesUsers).
  const boss = createUser({ username: 'TutorialBoss', password: 'tutorial-secret-1', role: 'admin' });
  const school = S.createSchool(boss, { name: 'Maple Grove Demo School' }).school;
  const T = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Ms. Rivera', role: 'teacher' }).user.id);
  q.run("UPDATE users SET display_name='Ms. Rivera', avatar='🦦', color='#1F9D63' WHERE id=?", T.id);
  config.manipulativesUsers.push(String(T.username).toLowerCase());

  const { createApp } = await import('../server/app.js');
  const server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  let cookie = ''; startSession({ append: (k, v) => { cookie = v.split(';')[0]; } }, T.id);
  const [cn, cv] = cookie.split('=');

  fs.mkdirSync(OUT, { recursive: true });
  const WORK = fs.mkdtempSync(path.join(OUT, '.frames-'));   // next to the output (a long TMPDIR breaks Chromium's socket path)
  if (PEEK) fs.mkdirSync(PEEK, { recursive: true });
  const { chromium } = await import('playwright');
  const { launchOptions } = await import('./chromium.js');
  const browser = await chromium.launch(launchOptions({ args: ['--no-sandbox', '--hide-scrollbars'] }));
  const made = [];
  try {
    for (const slug of slugs) {
      const sc = SCENES[slug];
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'en-US', colorScheme: 'light', reducedMotion: 'no-preference' });
      await ctx.addCookies([{ name: cn, value: cv, url: BASE }, { name: 'theme', value: 'light', url: BASE }]);
      await ctx.addInitScript(overlayInit, [OVERLAY_CSS, POINTER_SVG]);
      const page = await ctx.newPage();
      page.setDefaultTimeout(15_000);
      const errors = [];
      page.on('pageerror', e => errors.push(`page error: ${e.message}`));
      page.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_ABORTED/.test(m.text())) errors.push(`console error: ${m.text()}`); });
      page.on('response', r => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });

      await page.goto(`${BASE}/manipulatives#${slug}`);
      await page.locator('#mp-board').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const rec = await recorder(page, path.join(WORK, slug));
      const St = stage(page, { slug, peekDir: PEEK, rec });
      // Title card over the page while it settles, then the board at the top of the screen.
      await St.card(sc.title, sc.sub, MARK);
      if (sc.setup) await sc.setup(page);
      if (sc.top) await page.locator(sc.top).first().evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 72));
      await page.waitForTimeout(2000);
      await St.peek('title');
      await St.cardOut();
      await page.waitForTimeout(700);
      let posterAt = null;
      for (const step of sc.steps) {
        await St.step(step.say);
        await St.caption(step.say);
        for (const a of step.do) await St.run(a);
        if (step.poster) posterAt = rec.now();
        await page.waitForTimeout(350);
        await St.peek(step.say.replace(/[^a-z0-9]+/gi, '-').slice(0, 40).toLowerCase());
      }
      if (errors.length) throw new Error(`[${slug}] the page reported errors:\n  ${errors.join('\n  ')}`);
      await St.hideCaption();
      await St.card(sc.end[0], sc.end[1], MARK);
      await page.waitForTimeout(2300);
      await St.peek('end');
      const frames = await rec.stop();
      await ctx.close();

      const base = path.join(OUT, `manip-${slug}`);
      const dur = encode(frames, `${base}.mp4`);
      fs.writeFileSync(`${base}.en.vtt`, vtt(St.caps, dur));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String((posterAt ?? dur / 2).toFixed(2)), '-i', `${base}.mp4`, '-frames:v', '1', '-q:v', '3', `${base}-poster.jpg`]);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${base}.mp4`, '-vf', `fps=${(16 / dur).toFixed(5)},scale=400:-2,tile=4x4:padding=6:margin=6:color=white`, '-frames:v', '1', '-q:v', '3', `${base}-sheet.jpg`]);
      made.push({ slug, dur, files: [`${base}.mp4`, `${base}-poster.jpg`, `${base}.en.vtt`, `${base}-sheet.jpg`] });
    }
  } finally {
    await browser.close().catch(() => {});
    server.close();
    if (KEEP) console.log('Frames kept in', WORK); else fs.rmSync(WORK, { recursive: true, force: true });
  }
  for (const m of made) {
    console.log(`${m.slug}: ${m.dur.toFixed(1)} s`);
    for (const f of m.files) console.log(`  ${f}  ${(fs.statSync(f).size / 1024).toFixed(0)} KB`);
  }
  process.exit(0);
}

// Run in a child process with a throwaway in-memory database (config is read when the server's modules load).
if (!process.env.MANIP_TUT_CHILD) {
  fs.mkdirSync(OUT, { recursive: true });
  const DATA = fs.mkdtempSync(path.join(OUT, '.data-'));
  const env = { ...process.env, MANIP_TUT_CHILD: '1', BRB_DB: ':memory:', BRB_DATA_DIR: DATA, BRB_SILENT: '1', LOG_REQUESTS: '0', BRB_SNAPSHOTS: '0',
    ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', STRIPE_API_KEY: '', BILLING_PUBLIC: '', MANIPULATIVES: '1' };
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], { cwd: ROOT, env, stdio: 'inherit' });
  child.on('exit', code => { fs.rmSync(DATA, { recursive: true, force: true }); process.exit(code ?? 1); });
} else {
  main().catch(e => { console.error(e.tut ? `PLAY-THROUGH FAILED ${e.message}` : e); process.exit(1); });
}
