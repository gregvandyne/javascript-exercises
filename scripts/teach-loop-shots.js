// Screenshots for the teaching loop (server/views/teacher-loop.js, docs/decisions.md "The teaching loop"):
// public/img/teach-loop/{gradebook,attention,feedback,standards}.webp, 1280x800, each under 80 KB: captured at 2x from a
// 960x600 desktop window (1920x1200) and scaled down, so text stays sharp where the pages show them about 540-640 px wide.
// Real captures of the running app from a throwaway database with the seeded demo school (DemoTeacher, "Demo Class" and
// its made-up demo students), plus one CS Quest lesson with some work so the Standards tab has something to show.
// Light theme only (the landing and /teachers frame them). Every shot is checked for prices and for names outside the
// demo list before it is saved: a bad shot throws.
//
// Usage: node scripts/teach-loop-shots.js [--keep]      TL_SHOTS_PORT=8040 (the server)
// Needs ImageMagick `convert` with WebP and the Playwright Chromium (BRB_CHROMIUM or /opt/pw-browsers).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'img', 'teach-loop');
const PASS = crypto.randomBytes(9).toString('hex');
const MAX_BYTES = 80 * 1024;
/** Every name a shot may show: the demo school's made-up people (scripts/seed.js seedDemoTeacher). */
const NAMES = ['Demo Teacher', 'Demo Student', 'Ava Lopez', 'Noah Kim', 'Mia Patel', 'Leo Chen', 'Demo Class', 'Oomba Academy Demo School'];
const PRICE = /[$€£¥₹]\s?\d|\d+[.,]\d{2}\s*(USD|EUR|GBP)|\/(month|year|mo|yr)\b|per (month|year)/i;
const HIDE_CSS = '*{caret-color:transparent!important} #toasts,.toast,.tabbar{display:none!important} .topbar,.foot,footer{display:none!important} main{padding-bottom:600px!important}';

// ---------------------------------------------------------------- seed (a child process, with the temp env set)
async function seedMode() {
  const { getUserByName } = await import('../server/auth.js');
  const S = await import('../server/services/schools.js');
  const L = await import('../server/services/lessons.js');
  const P = await import('../server/services/progress.js');
  const T = await import('../server/services/lesson-templates.js');
  const teacher = getUserByName('DemoTeacher');
  const cls = S.classesOf(teacher.id, 'teacher')[0];
  const must = (r, what) => { if (!r || r.ok === false) throw new Error(`seed: ${what} failed: ${JSON.stringify(r)}`); return r; };
  // A CS Quest lesson (the first of unit 1, grades 3-5), assigned, with work from four of the five students.
  const made = must(T.materialise(teacher, cls.school_id, 'csq-1b-1.1'), 'CS Quest lesson');
  const cl = must(L.assign(teacher, cls.id, made.lesson.id, {}), 'assign').classLesson;
  const kids = S.roster(cls.id).filter(p => p.role === 'student' && p.username !== 'DemoStudent');
  const steps = L.steps(made.lesson.id);
  kids.forEach((k, ki) => steps.slice(0, [steps.length, steps.length - 1, 3, 1][ki % 4]).forEach(s => {
    if (s.kind === 'game') { P.gameStarted(k, cl.id, s.id); P.gameScore(k, cl.id, s.id, 40 + ki * 3); P.markDone(k, cl.id, s.id); }
    else if (s.kind === 'question') P.answer(k, cl.id, s.id, ['A computer has parts inside and outside that work together.', 'The keyboard is an input and the screen is an output.', 'The mouse sends clicks to the computer.', 'Parts inside work with parts outside.'][ki % 4]);
    else if (s.kind === 'text') P.markDone(k, cl.id, s.id);
  }));
  // The fractions lesson (scripts/seed.js): the lesson whose answers and "Needs attention first" the shots show.
  const fr = L.classLessons(cls.id).find(x => x.title.startsWith('Adding fractions'));
  // The Standards shot shows the same fractions lesson as the others, so tag it with its Common Core standards.
  const CC = await import('../server/services/standards-ccss.js');
  for (const code of ['4.NF.A.1', '4.NF.B.3']) must(CC.addTag(teacher, fr.lesson_id, { framework: 'ccss-math', code }), `tag ${code}`);
  process.stdout.write(JSON.stringify({ classId: cls.id, fractions: fr.id }));
}

// ---------------------------------------------------------------- main
async function main() {
  const keep = process.argv.includes('--keep');
  const PORT = +(process.env.TL_SHOTS_PORT || 8040), BASE = `http://localhost:${PORT}`;
  const DATA = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'oomba-tl-'));
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR || os.tmpdir(), BRB_DATA_DIR: DATA, PORT: String(PORT),
    ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: crypto.randomBytes(12).toString('hex'), DEMO_TEACHER_PASSWORD: PASS,
    ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_SNAPSHOTS: '0', STRIPE_API_KEY: '', STRIPE_WEBHOOK_SECRET: '', BILLING_PUBLIC: '', LANDING_AT_ROOT: '0',
  };
  let app = null, browser = null;
  try {
    execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env, stdio: 'ignore' });
    const ids = JSON.parse(execFileSync(process.execPath, ['scripts/teach-loop-shots.js', '--seed'], { cwd: ROOT, env, encoding: 'utf8' }));
    app = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] });
    for (const t0 = Date.now(); ;) { try { if ((await fetch(`${BASE}/health`)).ok) break; } catch { /* starting */ } if (Date.now() - t0 > 60e3) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 200)); }
    const { chromium } = await import('@playwright/test');
    const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
    browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 2, baseURL: BASE, colorScheme: 'light', locale: 'en-US', reducedMotion: 'reduce' });
    await ctx.setExtraHTTPHeaders({ 'X-Forwarded-For': `10.77.${crypto.randomInt(250)}.${1 + crypto.randomInt(250)}` });
    const page = await ctx.newPage();
    await page.goto('/login'); await page.fill('#username', 'DemoTeacher'); await page.fill('#password', PASS);
    await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
    await page.goto('/?theme=light');
    const PNG = path.join(DATA, 'png'); fs.mkdirSync(PNG);
    const shot = async (name, url, focus, before, offset = 16) => {
      await page.goto(url); await page.waitForLoadState('networkidle').catch(() => {});
      await page.addStyleTag({ content: HIDE_CSS });
      await page.evaluate(() => document.fonts.ready);
      if (before) await before();
      const text = await page.evaluate(() => document.body.innerText);
      if (PRICE.test(text)) throw new Error(`${name}: the page shows a price`);
      const shown = await page.evaluate(() => [...document.querySelectorAll('.pp b')].map(e => e.textContent.trim()));
      const odd = shown.filter(n => !NAMES.includes(n));
      if (odd.length) throw new Error(`${name}: names outside the demo list: ${odd.join(', ')}`);
      await page.locator(focus).first().evaluate((el, off) => {
        scrollTo(0, Math.max(0, el.getBoundingClientRect().top + scrollY - off));
        if (document.activeElement) document.activeElement.blur();
      }, offset);
      await page.waitForTimeout(250);
      await page.mouse.move(1, 1);   // no hover highlight where the pointer happens to be
      const file = path.join(PNG, `${name}.png`); await page.screenshot({ path: file }); return file;
    };
    const lesson = `/class/${ids.classId}/progress/${ids.fractions}`;
    const pngs = {
      gradebook: await shot('gradebook', `/class/${ids.classId}/progress`, '.gb-review'),
      attention: await shot('attention', `${lesson}#needs-attention`, '#needs-attention', async () => {
        await page.waitForFunction(() => document.querySelector('#needs-attention [aria-pressed="true"]'));
      }),
      feedback: await shot('feedback', lesson, '#answers .answers h2'),
      // Common Core Math (the subject of the other three shots): the first standard the class has worked on, with its
      // group's heading and the table's column names above it.
      standards: await shot('standards', `/class/${ids.classId}/standards?fw=ccss-math`, '.csq-std-id', null, 150),
    };
    await browser.close(); browser = null;
    fs.mkdirSync(OUT, { recursive: true });
    for (const [name, png] of Object.entries(pngs)) {
      const out = path.join(OUT, `${name}.webp`);
      for (const quality of [74, 66, 58, 50]) {
        execFileSync('convert', [png, '-resize', '1280x800', '-strip', '-define', 'webp:method=6', '-quality', String(quality), out]);
        if (fs.statSync(out).size <= MAX_BYTES) break;
      }
      const kb = fs.statSync(out).size / 1024;
      console.log(`${path.relative(ROOT, out)}  ${kb.toFixed(0)} KB`);
      if (kb * 1024 > MAX_BYTES) throw new Error(`${name}: over 80 KB`);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (app) { app.kill('SIGTERM'); await new Promise(r => app.once('exit', r)); }
    if (!keep) fs.rmSync(DATA, { recursive: true, force: true }); else console.log(`Kept ${DATA}`);
  }
}

if (process.argv.includes('--seed')) await seedMode(); else await main();
