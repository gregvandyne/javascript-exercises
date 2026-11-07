// The lesson pictures' guided tours, every one of them, on a phone (390x844) and a laptop (1280x800): for each
// slide with focus steps in all three courses (CS Quest and Cyber Defenders in both bands, Number Quest), each
// step's words must never cover what the step points at, and a drawn diagram's boxes and badges must never sit on
// its text (views/courses.js gfLayer, public/js/course.js gfLayout):
//   - a screenshot's cue chip, when it rides on the picture, never overlaps its step's focus box or ring, and
//     never hides the game's own text next to it: the text boxes recorded when the picture was captured
//     (scripts/cyber-shots-rects.json, the leaf rects; scripts/csq-route-geometry.json, the ui rects) where the
//     picture has them, else lettering found in its pixels (strong contrast, strokes crossing both ways);
//   - a screenshot's numbered badge never hides the game's text either (the same detection as for the chip),
//     unless every spot touching its box does (then it must wear its dark rim);
//   - a diagram never carries a cue on the picture at all (its cues are the caption strip under it);
//   - a diagram's badge never sits on any of the diagram's text;
//   - no edge of a diagram's focus box (or of its ring) crosses a text: every label is wholly inside or outside.
//   - while each tour step plays, its words are wholly on screen (inside the viewport and the figure; a chip inside
//     the picture) and at least 200 px wide, or their whole one-line width: never a sliver past the picture's edge.
// Every size runs twice: the tour's layout, and the still view a reduced-motion setting shows (every step's box and
// badge at once), where in addition no two badges may stack.
// The main e2e server reads CS Quest's decks from the test fixtures (BRB_COURSE_DIR), so this spec runs a server
// of its own on the real decks (E2E_PORT + 7, its own data folder; or COURSE_PICTURES_URL, an already running
// server with the admin account admin / admin-pass-123, e.g. a local dev server).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NO_STRIPE_ENV } from '../support/no-stripe-env.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = +(process.env.E2E_PORT || 4310) + 7;
const BASE = process.env.COURSE_PICTURES_URL || `http://localhost:${PORT}`;
let proc = null;

test.use({ baseURL: BASE });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  if (process.env.COURSE_PICTURES_URL) return;
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-pictures-'));
  const env = { ...process.env, ...NO_STRIPE_ENV, PORT: String(PORT), BRB_DATA_DIR: DATA, BRB_COURSE_DIR: '', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'admin-pass-123',
    ANTHROPIC_API_KEY: '', BRB_SILENT: '1', BRB_SNAPSHOTS: '0', TTS_ENABLED: '' };
  delete env.BRB_COURSE_DIR;
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env, stdio: 'ignore' });
  proc = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: 'ignore' });
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('the pictures server did not start');
});
test.afterAll(() => { if (proc) proc.kill('SIGTERM'); });

/** Every step key of a course band that has a deck with at least one focus figure. */
function stepsWithFocus(course, band) {
  const dir = path.join(ROOT, 'seed-lessons', course, 'course', band);
  return fs.readdirSync(dir).filter(f => /^\d\.\d\.json$/.test(f)).sort((a, b) => parseFloat(a) - parseFloat(b))
    .filter(f => { const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return [...(d.slides || []), ...(d.slides_first_time || [])].some(s => s && s.focus); })
    .map(f => `${band}-${f.replace('.json', '')}`);
}

/** The text boxes recorded for each screenshot, [x, y, w, h] in % of the 1280x720 picture: Cyber Defenders'
 *  named rects that hold words and no other rect (a card's lines, not the card's grid), CS Quest's ui rects. */
function recordedText() {
  const out = {};
  const cyber = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/cyber-shots-rects.json'), 'utf8'));
  for (const [key, named] of Object.entries(cyber)) {
    const rs = Object.values(named).filter(r => Array.isArray(r) && String(r[4] || '').trim());
    const holdsOther = a => rs.some(b => b !== a && b[0] >= a[0] - 0.2 && b[1] >= a[1] - 0.2 && b[0] + b[2] <= a[0] + a[2] + 0.2 && b[1] + b[3] <= a[1] + a[3] + 0.2 && b[2] * b[3] < a[2] * a[3] * 0.95);
    out[key] = rs.filter(r => !holdsOther(r)).map(r => r.slice(0, 4));
  }
  const geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/csq-route-geometry.json'), 'utf8'));
  for (const [key, g] of Object.entries(geo)) out[key] = (g.ui || []).filter(u => String(u.t || '').trim()).map(u => u.r);
  return out;
}
const TEXT_RECTS = recordedText();

/** In the page: every problem of one figure's tour, as laid out now (all steps are laid out at once; the
 *  inactive ones are only transparent). `rects`: the picture's recorded text boxes, or null. */
function figureProblems(fig, arg) {
  const { rects, still, only } = arg;
  const out = [];
  const R = el => el.getBoundingClientRect();
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
  const holds = (a, b) => b.left >= a.left - 0.5 && b.right <= a.right + 0.5 && b.top >= a.top - 0.5 && b.bottom <= a.bottom + 0.5;
  const shown = el => el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  const vf = fig.classList.contains('vf');
  const strip = fig.classList.contains('gf--strip');
  const texts = vf ? [...fig.querySelectorAll('.vf-svg text')].map(t => ({ r: R(t), s: t.textContent })).filter(t => t.r.width > 0) : [];
  // A screenshot's own words, on screen: the 16 px cells of the picture that read as lettering (strong
  // contrast, a fair share of ink, strokes crossing both ways: a panel's edge or a flat fill crosses one way),
  // kept, where the picture has recorded text boxes, only inside them (a recorded box spans its whole line,
  // its padding and the empty end of a short line too, so the pixels say where in it the words are).
  const img = fig.querySelector('.simg'), frame = R(fig.querySelector('.sframe'));
  let words = [], lettering = [];
  if (!vf && img) {
    const ir = R(img), sx = ir.width / 100, sy = ir.height / 100;
    const boxes = rects && rects.map(([x, y, w, h]) => ({ left: ir.left + x * sx, right: ir.left + (x + w) * sx, top: ir.top + y * sy, bottom: ir.top + (y + h) * sy }));
    const W = 640, H = 360, C = 8;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, W, H);
    const px = cx.getImageData(0, 0, W, H).data, lum = i => (px[4 * i] * 299 + px[4 * i + 1] * 587 + px[4 * i + 2] * 114) / 1000;
    for (let gy = 0; gy < H / C; gy++) for (let gx = 0; gx < W / C; gx++) {
      const v = []; for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) v.push(lum((gy * C + y) * W + gx * C + x));
      const lo = Math.min(...v), hi = Math.max(...v);
      if (hi - lo < 90) continue;
      const b = v.map(q => q > (lo + hi) / 2);
      const on = b.filter(Boolean).length; if (Math.min(on, C * C - on) / (C * C) < 0.06) continue;
      let rows = 0, cols = 0;
      for (let y = 0; y < C; y++) { let n = 0; for (let x = 1; x < C; x++) n += b[y * C + x] !== b[y * C + x - 1]; rows += n >= 2; }
      for (let x = 0; x < C; x++) { let n = 0; for (let y = 1; y < C; y++) n += b[y * C + x] !== b[(y - 1) * C + x]; cols += n >= 2; }
      if (rows < 2 || cols < 2) continue;
      const cw = ir.width / (W / C), ch = ir.height / (H / C);
      const cell = { left: ir.left + gx * cw, right: ir.left + (gx + 1) * cw, top: ir.top + gy * ch, bottom: ir.top + (gy + 1) * ch };
      lettering.push(cell);
      if (!boxes || boxes.some(r => hit(r, cell))) words.push(cell);
    }
    const inFrame = cells => cells.map(w => ({ left: Math.max(w.left, frame.left), right: Math.min(w.right, frame.right), top: Math.max(w.top, frame.top), bottom: Math.min(w.bottom, frame.bottom) }))
      .filter(w => w.right > w.left && w.bottom > w.top);
    words = inFrame(words); lettering = inFrame(lettering);
  }
  const over = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  // The still view (reduced motion): every step's box and badge shows at once, so no two badges may stack.
  const badges = [];
  fig.querySelectorAll('.gf-step').forEach((st, i) => {
    if (only != null && i !== only) return; // a zoomed step (zoom-to-cue): only its own box is laid out on this zoom
    const n = `step ${i + 1}`;
    if (still) { const bg = st.querySelector('.gf-badge'); if (shown(bg)) { const g = R(bg); for (const [j, h] of badges) if (hit(g, h)) out.push(`${n}: its badge stacks on step ${j + 1}'s badge`); badges.push([i, g]); } }
    const box = st.querySelector('.gf-box'), b = R(box);
    const ring0 = getComputedStyle(box, '::after');
    const o = Math.abs(parseFloat(ring0.top) || 0); // the ring's outer edge (its border is drawn inside the outset)
    const ring = { left: b.left - o, top: b.top - o, right: b.right + o, bottom: b.bottom + o };
    const cue = st.querySelector('.gf-cue');
    if (vf && cue) out.push(`${n}: a diagram's cue is drawn on the picture`);
    if (cue && !strip && shown(cue) && hit(R(cue), ring)) out.push(`${n}: the cue chip overlaps its focus box`);
    if (cue && !strip && shown(cue) && words.length) {
      const c = R(cue), share = words.reduce((a, w) => a + over(c, w), 0) / (c.width * c.height);
      if (share > 0.07) out.push(`${n}: the cue chip hides the picture's text (${Math.round(share * 100)}% of the chip${rects ? ', in its recorded text boxes' : ''})`);
    }
    const badge = st.querySelector('.gf-badge');
    if (!vf && shown(badge) && words.length) {
      const g = R(badge), d = g.width, on = cells => r => cells.reduce((a, w) => a + over(r, w), 0) / (d * d);
      const share = on(words)(g);
      if (share > 0.07) {
        // Some boxes have words on every side (a line of a letter, a grid of cards that fills the picture): the
        // badge may sit on text only when no spot touching its box does better — outside the ring along each
        // side, or just inside the box's edge, clear of every bit of lettering in the picture (recorded text
        // box or not: the script cannot tell them apart) — and then it wears its dark rim so its number reads.
        const zs = fig.querySelector('.szoom span'), zr = zs && R(zs), oo = o + 2;
        const at = (x, y) => ({ left: b.left + x, top: b.top + y, right: b.left + x + d, bottom: b.top + y + d });
        const spots = [];
        for (let k = 0; k <= 16; k++) {
          const fx = -oo - d + (b.width + 2 * oo + d) * k / 16, fy = -oo - d + (b.height + 2 * oo + d) * k / 16;
          spots.push(at(fx, -oo - d), at(fx, b.height + oo), at(-oo - d, fy), at(b.width + oo, fy));
          const ix = 2 + (b.width - d - 4) * k / 16, iy = 2 + (b.height - d - 4) * k / 16;
          if (b.width > 2 * d + 4 && b.height > d + 4) spots.push(at(ix, 2), at(ix, b.height - d - 2), at(2, iy), at(b.width - d - 2, iy));
        }
        const better = spots.filter(r => r.left >= frame.left + 1 && r.top >= frame.top + 1 && r.right <= frame.right - 1 && r.bottom <= frame.bottom - 1)
          .filter(r => !(zr && hit(r, zr))).map(on(lettering)).filter(v => v <= 0.07 || v < share - 0.1);
        if (better.length) out.push(`${n}: the badge hides the picture's text (${Math.round(share * 100)}% of the badge${rects ? ', in its recorded text boxes' : ''}) where a spot by its box has ${Math.round(Math.min(...better) * 100)}%`);
        else if (!badge.classList.contains('gf-badge--ink')) out.push(`${n}: the badge sits on the picture's text without its dark rim`);
      }
    }
    if (!vf) return;
    if (shown(badge)) for (const t of texts) if (hit(R(badge), t.r)) out.push(`${n}: the badge sits on "${t.s}"`);
    for (const t of texts) {
      if (hit(b, t.r) && !holds(b, t.r)) out.push(`${n}: the box edge crosses "${t.s}"`);
      else if (hit(ring, t.r) && !holds(ring, t.r)) out.push(`${n}: the ring crosses "${t.s}"`);
    }
  });
  return out;
}

/** In the page: the words of one tour step as the child sees them while the step plays (data-gf-step), wherever
 *  they are — the chip on the picture, the caption strip under it, or (the still view) the cue list — must be on
 *  screen: wholly inside the viewport and the figure (a chip inside the picture's frame), and never squeezed: at
 *  least CUE_MIN px wide, or the words' whole one-line width when that is less. A chip pushed past the picture's
 *  edge once showed the ring and badge with a 73-110 px sliver of words beyond the frame. */
const CUE_MIN = 200;
function cueProblem(fig, { s, min }) {
  const R = e => e.getBoundingClientRect();
  const shown = e => e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > 0 && R(e).width > 0;
  const chip = fig.querySelector(`.gf-step[data-i="${s}"] .gf-cue`), cell = fig.querySelector(`.gf-sc[data-i="${s}"]`), li = fig.querySelectorAll('.gf-cues li')[s];
  const el = [chip, cell, li].find(shown);
  if (!el) return 'its words are nowhere on screen';
  const r = R(el), f = R(fig), fr = R(fig.querySelector('.sframe'));
  const c = el.cloneNode(true);
  c.style.cssText = 'position:fixed;left:0;top:0;display:flex;width:auto;max-width:none;white-space:nowrap;visibility:hidden';
  document.body.append(c);
  const one = c.getBoundingClientRect().width; c.remove();
  const box = el === chip ? fr : f, where = el === chip ? 'chip' : el === cell ? 'caption strip' : 'cue list';
  if (r.left < Math.max(0, box.left) - 1 || r.right > Math.min(innerWidth, box.right) + 1) return `the ${where} runs off the ${el === chip ? 'picture' : 'figure'} (${Math.round(r.left)}..${Math.round(r.right)} px of ${Math.round(box.left)}..${Math.round(Math.min(innerWidth, box.right))})`;
  if (el === chip && (r.top < fr.top - 1 || r.bottom > fr.bottom + 1)) return 'the chip runs off the picture';
  if (r.width < Math.min(min, one - 2)) return `the ${where} is squeezed to ${Math.round(r.width)} px (its words need ${Math.round(Math.min(min, one))})`;
  return null;
}

const RUNS = [['cs-quest', '1b'], ['cs-quest', '2'], ['cyber-defenders', '1b'], ['cyber-defenders', '2'], ['number-quest', 'explorer']];
// Each size twice: the tour's own layout, and the still view a reduced-motion setting shows (every box and badge at once).
for (const [W, H, still] of [[390, 844, false], [1280, 800, false], [390, 844, true], [1280, 800, true]]) {
  for (const [course, band] of RUNS) {
    test(`${course} ${band} at ${W}x${H}${still ? ', reduced motion' : ''}: tour words and boxes stay off what they point at`, async ({ browser }) => {
      test.setTimeout(600_000);
      const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: W, height: H }, isMobile: W < 800, hasTouch: W < 800, locale: 'en-US', reducedMotion: still ? 'reduce' : 'no-preference' });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto('/login');
      await page.fill('input[name=username]', 'admin'); await page.fill('input[name=password]', 'admin-pass-123');
      await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.locator('form button[type=submit]').first().click()]);
      const problems = [];
      for (const key of stepsWithFocus(course, band)) {
        await page.goto(`/courses/${course}/${key}`);
        await page.evaluate(() => document.fonts.ready);
        const n = await page.locator('.slide').count();
        for (let i = 1; i <= n; i++) {
          if (!(await page.locator(`#slide-${i} .smedia.gf`).count())) continue;
          await page.locator(`#deck-dots .dot[data-i="${i - 1}"]`).click();
          await expect(page.locator(`#slide-${i}`)).toBeVisible();
          const fig = page.locator(`#slide-${i} .smedia.gf`).first();
          // The still view is laid out again as the picture and fonts come in: let it settle before measuring.
          if (still) await page.waitForTimeout(400);
          // A screenshot is laid out again once its picture is in and read (its text map: data-gf-ink).
          if (!(await fig.evaluate(f => f.classList.contains('vf')))) await expect(fig).toHaveAttribute('data-gf-ink', /[01]/);
          const src = await fig.evaluate(f => { const im = f.querySelector('.simg'); return im ? new URL(im.src).pathname : ''; });
          const rects = TEXT_RECTS[src.replace(/^\/img\//, '').replace(/\.webp$/, '')] || null;
          // A zooming picture (zoom-to-cue) is checked at rest first: pin it there whatever its tour is doing.
          if (await fig.evaluate(f => !!f.gfz)) { await fig.evaluate(f => f.setAttribute('data-gfz-pin', 'rest')); await page.waitForTimeout(150); }
          for (const p of await fig.evaluate(figureProblems, { rects, still })) problems.push(`${key} slide ${i}: ${p}`);
          // Zoom-to-cue (public/js/course-zoom.js): a picture whose game words read under 11 px at rest zooms to each
          // step. Each zoomed step is checked as shown: its own chip, badge and ring by the same rules, the zoom holds
          // the step's box, and no line of the game's text is cut at the frame's edge (the zoom's own record).
          const zoomed = await fig.evaluate(f => (f.gfz && !f.matches('.vf') ? f.gfz.zooms.map((z, s) => (z ? s : -1)).filter(s => s >= 0) : []));
          for (const s of still ? [] : zoomed) {
            await fig.evaluate((f, s) => { f.setAttribute('data-gfz-pin', String(s)); }, s);
            await page.waitForTimeout(1100);
            for (const p of await fig.evaluate(figureProblems, { rects, still, only: s })) problems.push(`${key} slide ${i} zoomed step ${s + 1}: ${p}`);
            const z = await fig.evaluate((f, s) => {
              const fr = f.querySelector('.sframe').getBoundingClientRect(), b = f.querySelectorAll('.gf-box')[s].getBoundingClientRect(), zz = f.gfz.zooms[s];
              return { cut: zz.cut.length, inside: b.left >= fr.left - 1 && b.right <= fr.right + 1 && b.top >= fr.top - 1 && b.bottom <= fr.bottom + 1, px: zz.px };
            }, s);
            if (z.cut) problems.push(`${key} slide ${i} zoomed step ${s + 1}: the zoom cuts ${z.cut} line(s) of text`);
            if (!z.inside) problems.push(`${key} slide ${i} zoomed step ${s + 1}: the step's box leaves the zoomed frame`);
            if (z.px < 5) problems.push(`${key} slide ${i} zoomed step ${s + 1}: the words read at ${z.px.toFixed(1)} px`);
          }
          if (zoomed.length && !still) { await fig.evaluate(f => f.removeAttribute('data-gfz-pin')); await page.waitForTimeout(300); }
          // Each tour step played as the child sees it: its words fully on screen and readable (cueProblem).
          const nSteps = await fig.locator('.gf-step').count();
          for (let s = 0; s < nSteps; s++) {
            if (!(await page.evaluate(() => !!window.__cueProblem))) await page.evaluate(`window.__cueProblem = ${cueProblem.toString()}`);
            const p = await fig.evaluate(async (f, a) => {
              // the tour's own timers may move the step on (or end the tour): hold it at this one until it has
              // shown for a moment unchanged, then measure at once
              for (let k = 0; k < 8; k++) {
                f.setAttribute('data-gf-step', String(a.s));
                await new Promise(r => setTimeout(r, 450));
                if (f.getAttribute('data-gf-step') === String(a.s)) return window.__cueProblem(f, a);
              }
              return 'the tour never held the step';
            }, { s, min: CUE_MIN });
            if (p) problems.push(`${key} slide ${i} step ${s + 1}: ${p}`);
          }
          await fig.evaluate(f => f.removeAttribute('data-gf-step'));
        }
      }
      await ctx.close();
      expect(errors).toEqual([]);
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
}
