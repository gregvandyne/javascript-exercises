// Screenshots for the "How it works" steps on /parents and /teachers: public/img/how/<slug>-p-390.webp, -p-780.webp
// (phone, captured at 390x844 CSS px, 2x) and <slug>-d-1024.webp, -d-2048.webp (desktop, 1024x640 CSS px, 2x: the page
// shows them about 680px wide, so text stays readable). Phone and desktop capture the same screen for each step.
// Steps 1-5 come from a server with paid-plan pages off (as the live site is today: no Plans in the menu); only the
// family step, which the page shows only while they are on, comes from a second run with them on (against a fake Stripe).
// Real captures of the running app, from made-up demo people in a throwaway database (never a real DB or a real child):
// Pixel Panda, Rocket Otter, Ms. Rivera's Class at Sunny Hill Demo School... Light theme only (the page frames them).
//
// Usage: npm run how-shots [-- --only parents|teachers] [-- --keep]     (--keep leaves the temp data and PNGs)
//        HOW_PORT=5990 (the server; the fake Stripe for the family step uses HOW_PORT + 1)
//        HOW_REAL_BUILDER=1 with ANTHROPIC_API_KEY set: the Builder step from Claude (not deterministic: check it by eye).
// Needs ImageMagick `convert` with WebP (else Chromium encodes) and the Playwright Chromium (BRB_CHROMIUM or /opt/pw-browsers).
// Every shot is checked for prices and for names outside the demo list before it is saved: a bad shot throws.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'img', 'how');
const args = process.argv.slice(2);
const PASS = 'how-demo-pass-1';
// The demo people. Every name a roster or friends shot shows must be one of these.
const NAMES = ['Pixel Panda', 'Rocket Otter', 'Comet Fox', 'Maple Koala', 'Nova Newt', 'Star Gecko', 'Ms. Rivera', 'PandaGrownup', 'Oomba Academy', 'Coding Club', 'Reading Rockets', "Ms. Rivera's Class"];
const STUDENTS = [['Pixel Panda', 'CosmicPanda21'], ['Rocket Otter', 'SwiftOtter34'], ['Comet Fox', 'BrightFox57'], ['Maple Koala', 'CozyKoala18'], ['Nova Newt', 'ShinyNewt62']];

// ---------------------------------------------------------------- seed (a child process, with the temp env set)
async function seedMode() {
  const { q } = await import('../server/db.js');
  const { config } = await import('../server/config.js');
  const { createUser, getUserByName, setPassword } = await import('../server/auth.js');
  const friends = await import('../server/services/friends.js');
  const schools = await import('../server/services/schools.js');
  const lessons = await import('../server/services/lessons.js');
  const progress = await import('../server/services/progress.js');
  const { seedDemoLessons, seedDemoQuestions, seedDemoProgress } = await import('./seed.js');
  const must = (r, what) => { if (!r || r.ok === false) throw new Error(`seed: ${what} failed: ${JSON.stringify(r)}`); return r; };

  const admin = getUserByName(config.adminUsername);
  // Kids with their own accounts, friends with each other.
  const panda = createUser({ username: 'PixelPanda', password: PASS, displayName: 'Pixel Panda', avatar: '🐼', color: '#16a34a' });
  const otter = createUser({ username: 'RocketOtter', password: PASS, displayName: 'Rocket Otter', avatar: '🦦', color: '#2f6bff' });
  const gecko = createUser({ username: 'StarGecko', password: PASS, displayName: 'Star Gecko', avatar: '🦎', color: '#f59e0b' });
  must(friends.addByCode(panda, otter.friend_code), 'friend request');
  if (!friends.accept(otter, panda.id)) throw new Error('seed: friend accept failed');
  // The grown-up (linked to Pixel Panda later, in the browser, after the /me code shot).
  createUser({ username: 'PandaGrownup', password: PASS, displayName: 'PandaGrownup', avatar: '🦉', color: '#8b5cf6', accountType: 'grownup' });

  // The school, a teacher, a class with five school accounts.
  const school = must(schools.createSchool(admin, { name: 'Sunny Hill Demo School' }), 'school').school;
  const teacher = createUser({ username: 'MsRivera', password: PASS, displayName: 'Ms. Rivera', avatar: '🍎', color: '#ec4899' });
  must(schools.addMember(admin, school.id, teacher.id, 'teacher', { rosterName: 'Ms. Rivera' }), 'teacher');
  const cls = must(schools.createClass(teacher, school.id, { name: "Ms. Rivera's Class", grade: '4' }), 'class').class;
  const kids = {};
  for (const [rosterName, username] of STUDENTS) {
    const r = must(schools.createSchoolAccount(teacher, school.id, { rosterName, grade: '4' }), 'school account');
    // Fixed usernames, so the shots are the same every run.
    q.run('UPDATE users SET username=?, display_name=?, avatar=?, color=? WHERE id=?', username, username, ['🐼', '🦦', '🦊', '🐨', '🐸'][Object.keys(kids).length], '#2f6bff', r.user.id);
    must(schools.addToClass(teacher, cls.id, r.user.id), 'add to class');
    kids[rosterName] = r.user.id;
  }
  setPassword(kids['Pixel Panda'], PASS);
  // A second, smaller class, so My classes looks like a real week.
  const club = must(schools.createClass(teacher, school.id, { name: 'Coding Club', grade: '5' }), 'class 2').class;
  for (const n of ['Comet Fox', 'Maple Koala', 'Nova Newt']) must(schools.addToClass(teacher, club.id, kids[n]), 'add to club');
  const readers = must(schools.createClass(teacher, school.id, { name: 'Reading Rockets', grade: '4' }), 'class 3').class;
  for (const n of ['Pixel Panda', 'Rocket Otter', 'Maple Koala']) must(schools.addToClass(teacher, readers.id, kids[n]), 'add to readers');
  must(schools.requestJoin(gecko, cls.join_code || schools.getClass(cls.id).join_code), 'join request');

  // The sample lessons, questions and progress from scripts/seed.js.
  seedDemoLessons(teacher, school, cls);
  seedDemoQuestions(teacher, school);
  seedDemoProgress(teacher, cls);
  // Pixel Panda (school account) is part-way through lesson 1: the first two steps done and the game played (with a
  // score); the build-a-game step and the written question next.
  const plan = lessons.classPlan(cls.id).flatMap(g => g.lessons);
  const first = plan.find(cl => cl.title === 'Adding fractions with the same denominator') || plan[0];
  const pp = q.get('SELECT * FROM users WHERE id=?', kids['Pixel Panda']);
  for (const cl of plan) q.run('DELETE FROM step_progress WHERE class_lesson_id=? AND user_id=?', cl.id, pp.id);
  const st = lessons.steps(first.lesson_id);
  for (const s of st.slice(0, 2)) must(progress.markDone(pp, first.id, s.id), 'mark done');
  const gameStep = st.find(s => s.kind === 'game');
  if (!gameStep) throw new Error('seed: lesson 1 has no game step');
  must(progress.gameStarted(pp, first.id, gameStep.id), 'game started'); must(progress.gameScore(pp, first.id, gameStep.id, 47), 'game score');
  process.stdout.write(JSON.stringify({ classId: cls.id, lessonId: first.lesson_id, classLessonId: first.id, gameStepId: gameStep.id, pandaSchool: 'CosmicPanda21' }));
}

// ---------------------------------------------------------------- main
async function main() {
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const keep = args.includes('--keep');
  const PORT = +(process.env.HOW_PORT || 5990), STRIPE_PORT = PORT + 1;
  const BASE = `http://localhost:${PORT}`;
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'oomba-how-'));
  const PNG = path.join(DATA, 'png'); fs.mkdirSync(PNG);
  const realBuilder = process.env.HOW_REAL_BUILDER === '1' && !!process.env.ANTHROPIC_API_KEY;
  const base = {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR || os.tmpdir(),
    BRB_DATA_DIR: DATA, PORT: String(PORT), ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: crypto.randomBytes(12).toString('hex'),
    ANTHROPIC_API_KEY: realBuilder ? process.env.ANTHROPIC_API_KEY : '', BRB_MOCK_DELAY_MS: '0',
    BRB_SILENT: '1', TRUST_PROXY: '1', BRB_SNAPSHOTS: '0', CONTACT_EMAIL: 'help@example.com', BRB_ALL_LOCALES: '1',
    STRIPE_API_VERSION: '', STRIPE_TAX: '', STRIPE_LIVE_OK: '', STRIPE_WEBHOOK_SECRET_OLD: '', BILLING_PREVIEW_TOKEN: '',
  };
  // Paid-plan pages off: no Stripe at all (the live site today).
  const env = { ...base, STRIPE_API_KEY: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_API_BASE: '', STRIPE_PMC_FAMILY: '', BILLING_PUBLIC: '' };
  // On, against the fake Stripe, for the family step only (no payments; the plan panel is never captured).
  const paidEnv = { ...base, STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_how', STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}`, STRIPE_PMC_FAMILY: 'pmc_fakefamily', BILLING_PUBLIC: '1' };
  const procs = [];
  const stop = async p => { if (p && p.exitCode === null && p.signalCode === null) { p.kill('SIGTERM'); await Promise.race([new Promise(r => p.once('exit', r)), new Promise(r => setTimeout(r, 10_000))]); if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL'); } };
  const cleanup = async () => { for (const p of procs.reverse()) await stop(p); if (!keep) fs.rmSync(DATA, { recursive: true, force: true }); else console.log(`Kept ${DATA}`); };
  const up = async url => { const t0 = Date.now(); for (;;) { try { if ((await fetch(url)).status < 500) return; } catch { /* not up yet */ } if (Date.now() - t0 > 60_000) throw new Error(`${url} did not start`); await new Promise(r => setTimeout(r, 150)); } };
  process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

  let browser;
  try {
    console.log('Seeding a throwaway database in', DATA);
    execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env, stdio: 'ignore' });
    const ids = JSON.parse(execFileSync(process.execPath, ['scripts/how-shots.js', '--seed'], { cwd: ROOT, env, encoding: 'utf8' }));
    const startApp = async e => { const app = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: e, stdio: ['ignore', 'ignore', 'inherit'] }); procs.push(app); await up(`${BASE}/health`); return app; };
    let app = await startApp(env);

    const { chromium } = await import('@playwright/test');
    const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
    browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const shooter = makeShooter({ browser, BASE, PNG });
    const made = [];
    if (!only || only === 'parents') made.push(...await parentShots(shooter, ids));
    if (!only || only === 'teachers') made.push(...await teacherShots(shooter, ids));
    if (!only || only === 'parents') {
      // The same database, now with paid-plan pages on, for the family step.
      await stop(app);
      procs.push(spawn(process.execPath, ['tests/support/fake-stripe.js', '--port', String(STRIPE_PORT), '--secret', 'whsec_how', '--webhook', `${BASE}/api/billing/webhook`], { cwd: ROOT, stdio: 'ignore' }));
      await up(`http://127.0.0.1:${STRIPE_PORT}/v1/tax/settings`);
      app = await startApp(paidEnv);
      made.push(...await familyShots(shooter));
    }
    await browser.close(); browser = null;
    const files = await encodeAll(made, PNG);
    report(files);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await cleanup();
  }
}

// ---------------------------------------------------------------- browser helpers
const PRICE = /[$€£¥₹]\s?\d|\d+[.,]\d{2}\s*(USD|EUR|GBP)|\/(month|year|mo|yr)\b|per (month|year)/i;
// An opaque top bar, so a scrolled shot shows no blurred text behind it.
// The phone tab bar is left out, so on a phone the picture can't be taken for the page's own navigation.
const HIDE_CSS = '*{caret-color:transparent!important} #toasts,.toast,.tabbar{display:none!important} .topbar{background:var(--bar)!important;backdrop-filter:none!important}';
const randomIp = () => `10.${1 + crypto.randomInt(250)}.${crypto.randomInt(250)}.${1 + crypto.randomInt(250)}`;

function makeShooter({ browser, BASE, PNG }) {
  const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const DESK = { viewport: { width: 1024, height: 640 }, deviceScaleFactor: 2 };
  /** A signed-in (or signed-out) page for one person on one device. */
  async function person(kind, username) {
    const ctx = await browser.newContext({ ...(kind === 'phone' ? PHONE : DESK), baseURL: BASE, colorScheme: 'light', locale: 'en-US', reducedMotion: 'reduce' });
    await ctx.setExtraHTTPHeaders({ 'X-Forwarded-For': randomIp() });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20_000);
    await page.goto('/?theme=light');
    if (username) {
      await page.goto('/login');
      await page.fill('#username', username); await page.fill('#password', PASS);
      await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
    }
    return page;
  }
  /** Saves a PNG of the page: the viewport, or (focus) a viewport-sized window of the full page from an element down. */
  async function shot(page, name, { focus = null, hide = [], names = false, offset = 16, plans = false } = {}) {
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.addStyleTag({ content: HIDE_CSS + (hide.length ? `${hide.join(',')}{display:none!important}` : '') });
    await page.evaluate(() => document.fonts.ready);
    // No focus ring left from typing; the site's own address instead of this throwaway server's (/me shows it).
    await page.evaluate(host => {
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) if (n.nodeValue.includes(host)) n.nodeValue = n.nodeValue.split(host).join('oomba.ai');
    }, new URL(page.url()).host);
    const text = await page.evaluate(() => document.body.innerText);
    if (PRICE.test(text)) throw new Error(`${name}: the page shows a price: ${text.match(PRICE)[0]}`);
    // Plans is in the menu only while paid-plan pages are on: only the family step may show it.
    if (!plans && await page.locator('a[href="/plans"]:visible').count()) throw new Error(`${name}: the menu shows Plans`);
    if (names) {
      const shown = await page.evaluate(() => [...document.querySelectorAll('.pp b, bdi')].filter(e => e.offsetParent).map(e => e.textContent.trim().replace(/^@/, '')).filter(Boolean));
      const odd = shown.filter(n => !NAMES.includes(n) && !STUDENTS.some(([, u]) => u === n) && !/^@?(PixelPanda|RocketOtter|StarGecko|MsRivera|PandaGrownup)$/.test(n));
      if (odd.length) throw new Error(`${name}: names outside the demo list: ${odd.join(', ')}`);
    }
    const vp = page.viewportSize();
    const file = path.join(PNG, `${name}.png`);
    // focus: scroll so the element's top sits just under the sticky top bar, then a viewport shot (what a person sees).
    if (focus) await page.locator(focus).first().evaluate((el, off) => {
      const bar = document.querySelector('header, .topbar'); const barH = bar && getComputedStyle(bar).position.match(/sticky|fixed/) ? bar.getBoundingClientRect().height : 0;
      scrollTo(0, Math.max(0, el.getBoundingClientRect().top + scrollY - barH - off));
    }, offset);
    else await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(250);
    await page.screenshot({ path: file });
    console.log(`  shot ${name}`);
    return file;
  }
  return { person, shot };
}

const idle = async page => {
  await page.locator('.st-busy').first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
  await page.waitForFunction(() => { const b = document.querySelector('#st-send'); return b && !b.disabled && !document.querySelector('.st-busy'); }, null, { timeout: 30_000 });
};
async function say(page, text) { await page.fill('#st-input', text); await page.press('#st-input', 'Enter'); await page.waitForTimeout(300); await idle(page); }
async function previewReady(page) {
  await page.waitForFunction(() => { const f = document.querySelector('#st-frame'); return f && /\/frame\//.test(f.src || ''); }, null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
}

// ---------------------------------------------------------------- parents
async function parentShots({ person, shot }) {
  const made = [];
  const both = async (slug, fn) => { for (const kind of ['phone', 'desk']) made.push({ slug, kind, png: await fn(kind) }); };

  // 1. Sign up with a made-up name (not submitted).
  await both('parents-start', async kind => {
    const p = await person(kind);
    await p.goto('/signup?for=kid');   // the kid form (plain /signup first asks "Who's this for?")
    await p.fill('#username', 'PixelPanda'); await p.fill('#password', 'a-made-up-pass');
    await p.locator('#username').blur();
    const f = await shot(p, `parents-start-${kind}`); await p.context().close(); return f;
  });

  // 2. A learning game, signed out.
  await both('parents-play', async kind => {
    const p = await person(kind);
    await p.goto('/play/sum-racer');
    await playStart(p);
    const f = await shot(p, `parents-play-${kind}`); await p.context().close(); return f;
  });

  // 3 + 4. The Builder: idea -> chips -> version 1 -> "Make it harder" -> version 2; then the share sheet (not confirmed).
  {
    const desk = await person('desk', 'PixelPanda');
    await desk.goto('/build');
    await Promise.all([desk.waitForURL(/\/studio\//), desk.click('#newgame')]);
    const studio = desk.url();
    await idle(desk);
    await say(desk, 'a game where a panda catches falling stars');
    for (let i = 0; i < 6 && !(await desk.locator('#st-log .ev.version').count()); i++) {
      const chip = desk.locator('#st-log .qchips:not(.used) .chip').first();
      if (!(await chip.count())) break;
      await chip.click(); await desk.waitForTimeout(300); await idle(desk);
    }
    if (!(await desk.locator('#st-log .ev.version').count())) throw new Error('The Builder did not make version 1');
    await say(desk, 'Make it harder');
    await desk.waitForFunction(() => /Version 2 is ready/.test([...document.querySelectorAll('#st-log .ev.version')].pop()?.textContent || ''), null, { timeout: 30_000 });
    await logFrom(desk, 'Make it harder');
    await previewReady(desk);
    await playPreview(desk);
    made.push({ slug: 'parents-build', kind: 'desk', png: await shot(desk, 'parents-build-desk') });
    await openShare(desk);
    made.push({ slug: 'parents-share', kind: 'desk', png: await shot(desk, 'parents-share-desk') });

    const phone = await person('phone', 'PixelPanda');
    await phone.goto(studio); await idle(phone);
    await logFrom(phone, 'Make it harder');
    made.push({ slug: 'parents-build', kind: 'phone', png: await shot(phone, 'parents-build-phone', { focus: '.st-chat', offset: 8 }) });
    await phone.goto(studio); await idle(phone);
    await openShare(phone);
    made.push({ slug: 'parents-share', kind: 'phone', png: await shot(phone, 'parents-share-phone') });
    await desk.context().close(); await phone.context().close();
  }

  // 5. Friends: Pixel Panda's code and Rocket Otter.
  await both('parents-friends', async kind => {
    const p = await person(kind, 'PixelPanda');
    await p.goto('/friends');
    const f = await shot(p, `parents-friends-${kind}`, { names: true }); await p.context().close(); return f;
  });

  return made;
}

// 6. Family link (paid-plan pages on): the child gives the grown-up the code from /me, the grown-up types it, the child
// says yes. Both pictures are the grown-up's family page with Pixel Panda linked.
async function familyShots({ person, shot }) {
  const made = [];
  const kid = await person('desk', 'PixelPanda');
  await kid.goto('/me');
  await kid.locator('#grownups [data-family-code]').click();
  await kid.locator('#famcode').waitFor();
  const code = (await kid.locator('#famcode-value').textContent()).trim();
  const gp = await person('desk', 'PandaGrownup');
  await gp.goto('/family/link');
  await gp.fill('#code', code);
  await Promise.all([gp.waitForURL(/\/family$/), gp.click('button[type=submit]')]);
  await kid.goto('/me');
  await Promise.all([kid.waitForLoadState('load'), kid.locator('#grownups button', { hasText: 'Yes' }).click()]);
  await kid.locator('#grownups', { hasText: 'Linked to your grown-up' }).waitFor();
  await kid.context().close(); await gp.context().close();
  for (const kind of ['phone', 'desk']) {
    const p = await person(kind, 'PandaGrownup');
    await p.goto('/family');
    // The help panel shows this throwaway server's contact address: left out.
    await p.evaluate(() => { for (const el of document.querySelectorAll('main section')) if (el.textContent.includes('@example.com')) el.style.display = 'none'; });
    made.push({ slug: 'parents-family', kind, png: await shot(p, `parents-family-${kind}`, { hide: ['#plan'], plans: true }) });
    await p.context().close();
  }
  return made;
}

async function playStart(p) {
  const frame = await (async () => {
    for (let i = 0; i < 100; i++) { const f = p.frames().find(x => x.url().includes('/frame/')); if (f) return f; await p.waitForTimeout(150); }
    throw new Error('no game frame');
  })();
  await frame.waitForFunction(() => typeof window.BRB === 'object');
  await p.waitForTimeout(800);
  // Sum Racer opens on its track list: pick the first track, then let the race run a moment.
  await frame.locator('#playBtn').click();
  let card = null;
  for (let i = 0; i < 100 && !card; i++) {
    for (const f of p.frames()) { const c = f.locator('.tcard:visible').first(); if (await c.count().catch(() => 0)) { card = c; break; } }
    if (!card) await p.waitForTimeout(200);
  }
  if (!card) throw new Error('Sum Racer: no track to pick');
  await card.click();
  // Past the 3-2-1 countdown, so a sum and its answers show.
  await p.waitForTimeout(5500);
}
/** Scrolls the Builder's chat so the last message from the child that says `text` is at its top. */
async function logFrom(p, text) {
  await p.evaluate(text => {
    const log = document.querySelector('#st-log'); if (!log) return;
    const mine = [...log.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() === text).pop();
    if (!mine) return;
    let box = log; while (box && box.scrollHeight <= box.clientHeight + 1) box = box.parentElement;
    if (box && box !== document.documentElement && box !== document.body) box.scrollTop += mine.getBoundingClientRect().top - box.getBoundingClientRect().top - 12;
    scrollTo(0, 0);
  }, text);
}
/** Presses Play inside the preview, so the shot shows the game running. */
async function playPreview(p) {
  const f = p.frames().find(x => x.url().includes('/frame/'));
  if (!f) return;
  const btn = f.locator('button:visible, [role=button]:visible').filter({ hasText: /play/i }).first();
  if (await btn.count()) { await btn.click().catch(() => {}); await p.waitForTimeout(1500); }
}
async function openShare(p) {
  await p.click('#st-publish');
  await p.locator('.sheet').filter({ has: p.locator('#vis-go') }).waitFor();
  await p.waitForTimeout(300);
}

// ---------------------------------------------------------------- teachers
async function teacherShots({ person, shot }, ids) {
  const made = [];
  const both = async (slug, fn) => { for (const kind of ['phone', 'desk']) made.push({ slug, kind, png: await fn(kind) }); };
  await both('teachers-classes', async kind => {
    const p = await person(kind, 'MsRivera'); await p.goto('/teach');
    const f = await shot(p, `teachers-classes-${kind}`, { names: true }); await p.context().close(); return f;
  });
  await both('teachers-join', async kind => {
    const p = await person(kind, 'MsRivera'); await p.goto(`/class/${ids.classId}?tab=students`);
    // The join request (Approve / Decline) at the top of the tab, then the class list.
    const f = await shot(p, `teachers-join-${kind}`, { names: true, focus: '#requests', offset: 16 }); await p.context().close(); return f;
  });
  await both('teachers-lesson', async kind => {
    const p = await person(kind, 'MsRivera'); await p.goto(`/teach/lessons/${ids.lessonId}`);
    // From the Steps heading down, so the numbered steps fill the picture (the title, summary and objectives are above).
    const f = await shot(p, `teachers-lesson-${kind}`, { focus: 'h2.sec-h', offset: 12 }); await p.context().close(); return f;
  });
  await both('teachers-student', async kind => {
    const p = await person(kind, ids.pandaSchool); await p.goto(`/class/${ids.classId}/lessons/${ids.classLessonId}`);
    // From the game step (played, with a best score) down: the build-a-game step and the written question follow.
    const f = await shot(p, `teachers-student-${kind}`, { focus: `#step-${ids.gameStepId}`, offset: 12 }); await p.context().close(); return f;
  });
  await both('teachers-gradebook', async kind => {
    const p = await person(kind, 'MsRivera'); await p.goto(`/class/${ids.classId}/progress`);
    // From the tab bar down: the gradebook table and its Download (CSV) button.
    const f = await shot(p, `teachers-gradebook-${kind}`, { names: true, focus: 'main .tabs, main .gb-tools', offset: 12 }); await p.context().close(); return f;
  });
  return made;
}

// ---------------------------------------------------------------- encode
const SIZES = { phone: [['p', 390], ['p', 780]], desk: [['d', 1024], ['d', 2048]] };
function hasMagick() { try { return /WEBP/i.test(execFileSync('convert', ['-list', 'format'], { encoding: 'utf8' })) ? 'convert' : null; } catch { return null; } }
async function encodeAll(made, PNG) {
  fs.mkdirSync(OUT, { recursive: true });
  const magick = hasMagick();
  const files = [];
  let page = null, browser = null;
  for (const m of made) for (const [tag, w] of SIZES[m.kind]) {
    const out = path.join(OUT, `${m.slug}-${tag}-${w}.webp`);
    if (magick) execFileSync(magick, [m.png, '-resize', `${w}x`, '-strip', '-define', 'webp:method=6', '-quality', '72', out]);
    else {
      if (!page) { const { chromium } = await import('@playwright/test'); browser = await chromium.launch(); page = await browser.newPage(); }
      const b64 = await page.evaluate(async ({ src, w }) => {
        const img = new Image(); img.src = src; await img.decode();
        const c = document.createElement('canvas'); c.width = w; c.height = Math.round(img.height * w / img.width);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.72));
        return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
      }, { src: `data:image/png;base64,${fs.readFileSync(m.png).toString('base64')}`, w });
      fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    }
    files.push({ file: out, slug: m.slug, tag, w, bytes: fs.statSync(out).size });
  }
  if (browser) await browser.close();
  return files;
}
function report(files) {
  const kb = n => `${(n / 1024).toFixed(0)} KB`;
  for (const f of files) console.log(`${path.relative(ROOT, f.file).padEnd(48)} ${kb(f.bytes).padStart(7)}`);
  let over = false;
  for (const pg of ['parents', 'teachers']) {
    const mine = files.filter(f => f.slug.startsWith(pg + '-'));
    if (!mine.length) continue;
    const phone = mine.filter(f => f.tag === 'p' && f.w === 780).reduce((a, f) => a + f.bytes, 0);
    const desk = mine.filter(f => f.tag === 'd' && f.w === 2048).reduce((a, f) => a + f.bytes, 0);
    console.log(`${pg}: phone (780w) ${kb(phone)}, desktop (2048w) ${kb(desk)}`);
    if (phone > 600 * 1024) { console.log(`✗ ${pg}: phone images over 600 KB`); over = true; }
  }
  if (over) process.exitCode = 1;
}

// Last, so every constant above is set before it runs.
if (args.includes('--seed')) await seedMode();
else await main();
