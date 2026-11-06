// The lesson pictures' guided tours, every one of them, on a phone (390x844) and a laptop (1280x800): for each
// slide with focus steps in all three courses (CS Quest and Cyber Defenders in both bands, Number Quest), each
// step's words must never cover what the step points at, and a drawn diagram's boxes and badges must never sit on
// its text (views/courses.js gfLayer, public/js/course.js gfLayout):
//   - a screenshot's cue chip, when it rides on the picture, never overlaps its step's focus box or ring;
//   - a diagram never carries a cue on the picture at all (its cues are the caption strip under it);
//   - a diagram's badge never sits on any of the diagram's text;
//   - no edge of a diagram's focus box (or of its ring) crosses a text: every label is wholly inside or outside.
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

/** In the page: every problem of one figure's tour, as laid out now (all steps are laid out at once; the
 *  inactive ones are only transparent). */
function figureProblems(fig) {
  const out = [];
  const R = el => el.getBoundingClientRect();
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
  const holds = (a, b) => b.left >= a.left - 0.5 && b.right <= a.right + 0.5 && b.top >= a.top - 0.5 && b.bottom <= a.bottom + 0.5;
  const shown = el => el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  const vf = fig.classList.contains('vf');
  const strip = fig.classList.contains('gf--strip');
  const texts = vf ? [...fig.querySelectorAll('.vf-svg text')].map(t => ({ r: R(t), s: t.textContent })).filter(t => t.r.width > 0) : [];
  fig.querySelectorAll('.gf-step').forEach((st, i) => {
    const n = `step ${i + 1}`;
    const box = st.querySelector('.gf-box'), b = R(box);
    const ring0 = getComputedStyle(box, '::after');
    const o = Math.abs(parseFloat(ring0.top) || 0); // the ring's outer edge (its border is drawn inside the outset)
    const ring = { left: b.left - o, top: b.top - o, right: b.right + o, bottom: b.bottom + o };
    const cue = st.querySelector('.gf-cue');
    if (vf && cue) out.push(`${n}: a diagram's cue is drawn on the picture`);
    if (cue && !strip && shown(cue) && hit(R(cue), ring)) out.push(`${n}: the cue chip overlaps its focus box`);
    if (!vf) return;
    const badge = st.querySelector('.gf-badge');
    if (shown(badge)) for (const t of texts) if (hit(R(badge), t.r)) out.push(`${n}: the badge sits on "${t.s}"`);
    for (const t of texts) {
      if (hit(b, t.r) && !holds(b, t.r)) out.push(`${n}: the box edge crosses "${t.s}"`);
      else if (hit(ring, t.r) && !holds(ring, t.r)) out.push(`${n}: the ring crosses "${t.s}"`);
    }
  });
  return out;
}

const RUNS = [['cs-quest', '1b'], ['cs-quest', '2'], ['cyber-defenders', '1b'], ['cyber-defenders', '2'], ['number-quest', 'explorer']];
for (const [W, H] of [[390, 844], [1280, 800]]) {
  for (const [course, band] of RUNS) {
    test(`${course} ${band} at ${W}x${H}: tour words and boxes stay off what they point at`, async ({ browser }) => {
      test.setTimeout(600_000);
      const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: W, height: H }, isMobile: W < 800, hasTouch: W < 800, locale: 'en-US' });
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
          for (const p of await page.locator(`#slide-${i} .smedia.gf`).first().evaluate(figureProblems)) problems.push(`${key} slide ${i}: ${p}`);
        }
      }
      await ctx.close();
      expect(errors).toEqual([]);
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
}
