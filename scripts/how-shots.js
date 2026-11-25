// Screenshots for the "How it works" steps on /parents and /teachers: public/img/how/<slug>-p-390.webp, -p-780.webp
// (phone, captured at 390x844 CSS px, 2x) and <slug>-d-1024.webp, -d-2048.webp (desktop, 1024x640 CSS px, 2x: the page
// shows them about 680px wide, so text stays readable). Phone and desktop capture the same screen for each step.
// Steps 1-5 come from a server with paid-plan pages off (as the live site is today: no Plans in the menu); only the
// family step, which the page shows only while they are on, comes from a second run with them on (against a fake Stripe).
// Real captures of the running app, from made-up demo people in a throwaway database (never a real DB or a real child):
// Pixel Panda, Rocket Otter, Ms. Rivera's Class at Sunny Hill Demo School... Each step in the light theme, and with --theme dark in the dark one
// (<slug>-dark-p-390.webp ...; views/how.js shows those when the page is dark).
//
// Usage: npm run how-shots [-- --only parents|teachers|live|dash|tools] [-- --theme dark] [-- --keep]     (--keep leaves the temp data and PNGs)
//        HOW_PORT=5990 (the server; the fake Stripe for the family step uses HOW_PORT + 1)
//        HOW_REAL_BUILDER=1 with ANTHROPIC_API_KEY set: the Builder step from Claude (not deterministic: check it by eye).
// The tools group (the landing and /teachers): a live math room with every student's square, and a Figures worksheet
// drafted in Oomba's chat. Ms. Rivera is on the tester list for it (MANIPULATIVES_USERS), and Oomba's AI is the stand-in
// in scripts/how-ai-standin.mjs (no AI call, no key).
// Needs ImageMagick `convert` with WebP (else Chromium encodes) and the Playwright Chromium (BRB_CHROMIUM or /opt/pw-browsers).
// Every shot is checked for prices and for names outside the demo list before it is saved: a bad shot throws.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromiumPath } from './chromium.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'img', 'how');
const args = process.argv.slice(2);
const PASS = 'how-demo-pass-1';
/** light (the default) or dark: the theme every shot is taken in. Dark files get -dark after the slug. */
const THEME = args.includes('--theme') && args[args.indexOf('--theme') + 1] === 'dark' ? 'dark' : 'light';
const SUFFIX = THEME === 'dark' ? '-dark' : '';
// The demo people. Every name a roster or friends shot shows must be one of these.
const NAMES = ['Pixel Panda', 'Rocket Otter', 'Comet Fox', 'Maple Koala', 'Nova Newt', 'Star Gecko', 'Ms. Rivera', 'PandaGrownup', 'Oomba Academy', 'Coding Club', 'Reading Rockets', "Ms. Rivera's Class"];
// Not names: the demo lessons' titles (scripts/seed.js seedDemoLessons), which class cards show in a <bdi> too.
const TITLES = ['Adding fractions with the same denominator', 'Word detectives: spelling patterns'];
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
  // Every school account can sign in (the live group joins a class room as each of them).
  for (const id of Object.values(kids)) setPassword(id, PASS);
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
    const exe = chromiumPath({ headless: true });
    browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const shooter = makeShooter({ browser, BASE, PNG });
    const made = [];
    if (!only || only === 'parents') made.push(...await parentShots(shooter, ids));
    if (!only || only === 'teachers') made.push(...await teacherShots(shooter, ids));
    if (!only || only === 'live') made.push(...await liveShots(shooter, ids));
    if (!only || only === 'dash') {
      // A school morning on the dashboard's clock and schedule: the same database, the server's clock moved to 9:20 in
      // the school's time zone on the next weekday (scripts/how-clock.mjs; the page takes its time from the server).
      await stop(app);
      const morning = nextSchoolMorning();
      app = await startApp({ ...env, HOW_CLOCK: morning, NODE_OPTIONS: `--import ${path.join(ROOT, 'scripts', 'how-clock.mjs')}` });
      made.push(...await dashShots(shooter, ids, morning));
    }
    if (!only || only === 'tools') {
      await stop(app);
      app = await startApp({ ...env, MANIPULATIVES_USERS: 'msrivera', NODE_OPTIONS: `--import ${path.join(ROOT, 'scripts', 'how-ai-standin.mjs')}` });
      made.push(...await toolShots(shooter, ids));
    }
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
  // A whole dashboard layout (8 rows) on one screen: 1600 × 1000 CSS px, saved 2048 wide like the desktop shots.
  const WIDE = { viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.28 };
  /** A signed-in (or signed-out) page for one person on one device. */
  async function person(kind, username, { timezoneId } = {}) {
    const ctx = await browser.newContext({ ...(kind === 'phone' ? PHONE : kind === 'wide' ? WIDE : DESK), baseURL: BASE, colorScheme: THEME, locale: 'en-US', reducedMotion: 'reduce', ...(timezoneId ? { timezoneId } : {}) });
    await ctx.setExtraHTTPHeaders({ 'X-Forwarded-For': randomIp() });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20_000);
    await page.goto(`/?theme=${THEME}`);
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
      const odd = shown.filter(n => !NAMES.includes(n) && !TITLES.includes(n) && !STUDENTS.some(([, u]) => u === n) && !/^@?(PixelPanda|RocketOtter|StarGecko|MsRivera|PandaGrownup)$/.test(n));
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
    await desk.click('#newgame'); await desk.locator('.su-kind', { hasText: 'Arcade game' }).click();   // New game, an arcade game (not a classroom lesson)
    await Promise.all([desk.waitForURL(/\/studio\//), desk.click('#su-direct')]);   // then "I'll just describe it"
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
    // Left out: the plan panel and the getting-started list (it talks about plans), and the team's welcome message link.
    made.push({ slug: 'parents-family', kind, png: await shot(p, `parents-family-${kind}`, { hide: ['#plan', '#famcheck', '.teamlink'], plans: true }) });
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
    // "How to read it" opens by itself on a wide screen: closed here, so the table shows.
    await p.evaluate(() => { for (const d of document.querySelectorAll('details.gbhelp')) d.open = false; });
    // From the tab bar down: the gradebook table and its Download (CSV) button.
    const f = await shot(p, `teachers-gradebook-${kind}`, { names: true, focus: 'main .tabs, main .gb-tools', offset: 12 }); await p.context().close(); return f;
  });
  return made;
}

// ---------------------------------------------------------------- Oomba Live (/teachers/live)
// Ms. Rivera hosts a Question Battle for her class; the five demo students join with their own school accounts (a class
// room shows account names). live-pick: her /live landing; live-lobby: the projector page with the code, QR and the
// class joined; live-join: a student's /join with the code typed; live-play: a student's question card; live-results:
// the results page after the last question.
const LIVE_ITEMS = [
  { q: 'Which planet is closest to the Sun?', choices: ['Mercury', 'Venus', 'Earth', 'Mars'], answer: 0, secs: 30 },
  { q: 'What do plants need to make food?', choices: ['Sunlight', 'Sand', 'Salt', 'Snow'], answer: 0, secs: 30 },
  { q: 'How many legs does a spider have?', choices: ['8', '6', '10', '4'], answer: 0, secs: 30 },
];
async function liveShots({ person, shot }, ids) {
  const made = [];
  const liveFrame = async (page, ready) => {
    for (let i = 0; i < 300; i++) {
      const f = page.frames().find(x => /\/live\/frame\//.test(x.url()));
      if (f) { try { const st = await f.evaluate(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state()); if (st && (!ready || ready(st))) return f; } catch { /* loading */ } }
      await page.waitForTimeout(150);
    }
    throw new Error('live: no game frame');
  };
  const state = f => f.evaluate(() => window.__brbTest.state());
  const until = async (fn, what, ms = 30_000) => { const t0 = Date.now(); for (;;) { if (await fn()) return; if (Date.now() - t0 > ms) throw new Error(`live: ${what}`); await new Promise(r => setTimeout(r, 200)); } };
  const act = (host, a) => host.locator(`[data-lv-act="${a}"]:not([hidden])`).click();

  // 1. The landing: pick a game, the questions, who can join (her class).
  for (const kind of ['phone', 'desk']) {
    const p = await person(kind, 'MsRivera');
    // Her own question set (a teacher's sets come first in the picker, before the starters).
    await p.goto('/live');
    if (kind === 'phone') {
      const made = await p.request.post('/api/live/sets', { data: { title: 'Year 6 Science: Forces', subject: 'Science', grade: 'Year 6', items: [
        { q: 'Which force pulls objects towards the Earth?', choices: ['Gravity', 'Friction', 'Magnetism', 'Air resistance'], answer: 0, secs: 20 },
        { q: 'Friction always slows a moving object down.', choices: ['True', 'False'], answer: 0, secs: 15 },
        { q: 'Which unit do we measure force in?', choices: ['Newtons', 'Kilograms', 'Metres', 'Seconds'], answer: 0, secs: 20 },
      ] }, headers: { Origin: new URL(p.url()).origin } });
      if (!made.ok()) throw new Error(`live: question set ${made.status()}`);
    }
    await p.goto('/live');
    // Question Battle, so the question-set picker shows too.
    await p.locator('input[name="pick"][value="mode:battle"]').check({ force: true }).catch(() => {});
    await p.locator('#lv-new').dispatchEvent('change');
    const cls = p.locator('input[name="audience"][value="class"]');
    if (await cls.count()) await cls.check().catch(() => {});
    await p.locator('#lv-class').selectOption({ label: "Ms. Rivera's Class" }).catch(() => {});
    // A new teacher's empty "My games" and "Shared with my classes" groups are left out: the games, then who can join.
    await p.evaluate(() => { for (const f of document.querySelectorAll('#lv-new fieldset.lv-group')) if (!f.querySelector('.lv-pick') && !f.querySelector('input,select')) f.style.display = 'none'; });
    made.push({ slug: 'live-pick', kind, png: await shot(p, `live-pick-${kind}`, { names: true, focus: '#lv-new', offset: 12 }) });
    await p.context().close();
  }

  // 2. The room, opened as the landing form does, for her class.
  const host = await person('desk', 'MsRivera');
  host.on('dialog', d => d.accept());
  const origin = new URL(host.url()).origin;
  const r = await host.request.post('/api/live/sessions', { data: { pick: 'mode:battle', items: LIVE_ITEMS, audience: 'class', classId: ids.classId, replace: true }, headers: { Origin: origin } });
  if (r.status() !== 200) throw new Error(`live: session ${r.status()} ${await r.text()}`);
  const hostUrl = (await r.json()).redirect;
  await host.goto(hostUrl);
  const code = (await host.locator('#lv-code').textContent()).replace(/\s/g, '');

  // 3. The join page with the code typed (before joining), on a phone and a wide screen.
  for (const kind of ['phone', 'desk']) {
    const p = await person(kind, 'BrightFox57');
    await p.goto('/join');
    await p.fill('#jc', code);
    made.push({ slug: 'live-join', kind, png: await shot(p, `live-join-${kind}`, { names: true }) });
    await p.context().close();
  }

  // The class joins: four on phones, Nova Newt on a laptop (so the question card has a wide-screen picture too).
  const students = [];
  for (const [rosterName, username] of STUDENTS) {
    const p = await person(rosterName === 'Nova Newt' ? 'desk' : 'phone', username);
    await p.goto(`/join#${code}`);
    await p.click('#lv-join button[type=submit]');
    await p.locator('#lv-as-me').click();
    await p.waitForURL(/\/live\/play\//);
    students.push({ rosterName, p });
  }
  await until(async () => (await host.locator('#lv-roster li').count()) >= STUDENTS.length, 'everyone in the roster');
  await liveFrame(host);
  await host.waitForTimeout(1200);
  made.push({ slug: 'live-lobby', kind: 'desk', png: await shot(host, 'live-lobby-desk', { names: true }) });
  {
    // The same projector page on a phone (it takes over the host's line; the laptop page reloads after).
    const p = await person('phone', 'MsRivera');
    await p.goto(hostUrl); await liveFrame(p); await p.waitForTimeout(1200);
    made.push({ slug: 'live-lobby', kind: 'phone', png: await shot(p, 'live-lobby-phone', { names: true }) });
    await p.context().close();
    await host.goto(hostUrl); await liveFrame(host); await host.waitForTimeout(800);
  }

  // 4. The first question on Pixel Panda's phone and Nova Newt's laptop, before answering.
  const frames = [];
  for (const s of students) frames.push({ ...s, f: await liveFrame(s.p) });
  await act(host, 'start');
  for (let i = 0; i < LIVE_ITEMS.length; i++) {
    for (const s of frames) await until(async () => { const st = await state(s.f); return st.phase === 'playing' && st.question && st.question.i === i; }, `question ${i}`);
    if (i === 0) {
      for (const [name, kind] of [['Nova Newt', 'desk'], ['Pixel Panda', 'phone']]) {
        const s = frames.find(x => x.rosterName === name);
        await s.p.waitForTimeout(900);
        made.push({ slug: 'live-play', kind, png: await shot(s.p, `live-play-${kind}`, { names: true }) });
      }
    }
    // Most are right; a couple miss one, so the results have something to show.
    for (const [k, s] of frames.entries()) {
      const q = (await state(s.f)).question, right = q.choices.indexOf(LIVE_ITEMS[i].choices[0]);
      const pick = (k + i) % 4 === 3 ? (right + 1) % q.choices.length : right;
      await s.f.locator('.qb-a').nth(pick).click();
      await s.p.waitForTimeout(150 + k * 120);
    }
    for (const s of frames) await until(async () => (await state(s.f)).phase !== 'playing', `reveal ${i}`);
    await host.waitForTimeout(600);
    await act(host, 'next');
  }
  await host.waitForURL(/\/live\/results\//, { timeout: 30_000 });
  const results = host.url();

  // 5. The results page, on the laptop and on a phone.
  // The student table (in "Details", closed by default so it isn't shown on the projector by accident).
  const details = async p => { await p.locator('#lv-details summary').click(); await p.locator('#lv-student-table').waitFor(); };
  await details(host);
  made.push({ slug: 'live-results', kind: 'desk', png: await shot(host, 'live-results-desk', { names: true, focus: '#lv-details', offset: 12 }) });
  {
    const p = await person('phone', 'MsRivera');
    await p.goto(results); await details(p);
    made.push({ slug: 'live-results', kind: 'phone', png: await shot(p, 'live-results-phone', { names: true, focus: '#lv-details', offset: 12 }) });
    await p.context().close();
  }
  for (const s of students) await s.p.context().close();
  await host.context().close();
  return made;
}

/** The video widget's stand-in (its host is never reached from here): plain and unbranded, as scripts/dash-video.js. */
const VIDEO_STAND_IN = `<!doctype html><html><head><style>html,body{margin:0;height:100%;overflow:hidden;font-family:system-ui,sans-serif}
body{display:grid;place-items:center;background:linear-gradient(135deg,#2f6bff,#8b5cf6 55%,#ec4899);color:#fff}
.eq{display:flex;gap:10px;align-items:flex-end;height:90px;justify-content:center}.eq i{width:16px;border-radius:8px;background:rgba(255,255,255,.9)}
p{margin:18px 0 0;font-size:26px;font-weight:800;text-align:center}</style></head><body><div><div class="eq"><i style="height:40px"></i><i style="height:80px"></i><i style="height:60px"></i><i style="height:90px"></i><i style="height:50px"></i></div><p>Move-and-groove brain break</p></div></body></html>`;

/** 9:20 in New York (the dashboard's time zone for a school without one) on the next weekday still ahead, as ISO. */
function nextSchoolMorning() {
  const TZ = 'America/New_York';
  const parts = d => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(d).map(p => [p.type, p.value]));
  for (let day = 0; day < 8; day++) {
    const p = parts(new Date(Date.now() + day * 864e5));
    if (p.weekday === 'Sat' || p.weekday === 'Sun') continue;
    // 9:20 that day: guess with a 5-hour offset, then correct by what New York's clock says at the guess.
    let t = Date.UTC(+p.year, +p.month - 1, +p.day, 14, 20);
    const q = parts(new Date(t)); t -= ((+q.hour * 60 + +q.minute) - (9 * 60 + 20)) * 60e3;
    if (t > Date.now() + 60e3) return new Date(t).toISOString();
  }
  throw new Error('dash: no school morning ahead');
}

// ---------------------------------------------------------------- Class dashboards (the landing's #dashboards)
// Ms. Rivera's class on the "Morning start" ready-made layout (services/dash.js LAYOUT_TEMPLATES): dash-teacher is her
// screen (desktop); dash-student is Pixel Panda's own screen on a phone, with the widgets she pinned (today's
// goal, the mood check-in, class jobs) beside their own clock. Three students check in a mood first, so her mood widget
// shows totals (never who picked which: that is behind a tap, and not shot).
async function dashShots({ person, shot }, ids, morning) {
  const made = [];
  const teacher = await person('desk', 'MsRivera');
  const origin = new URL(teacher.url()).origin;
  const api = async (p, url, data) => { const r = await p.request.post(url, { data, headers: { Origin: origin } }); if (!r.ok()) throw new Error(`dash: ${url} ${r.status()} ${await r.text()}`); return r.json(); };
  // Opening the dashboard once makes her starter layout. Then every ready-made layout in turn, each used by the class
  // (dash-layout-<id>, the landing's layout tour), and last the morning one again for the shots after.
  await teacher.goto(`/class/${ids.classId}/dashboard`);
  for (const [username, mood] of [['SwiftOtter34', 0], ['BrightFox57', 1], ['CozyKoala18', 0], ['ShinyNewt62', 0]]) {   // MOODS: 0 great, 1 good
    const s = await person('desk', username);
    await api(s, `/api/dash/${ids.classId}/mood`, { mood }).catch(() => {});   // only once a mood widget is pinned: below
    await s.context().close();
  }
  // A first visit makes the six ready-made layouts (services/dash.js DEFAULT_SET, in LAYOUT_TEMPLATES order); the page
  // lists them with their widgets.
  const made0 = await teacher.evaluate(() => JSON.parse(document.getElementById('page-data').textContent).layouts);
  const TPLS = ['morning', 'lesson', 'math', 'group', 'quiet', 'fun'];
  if (made0.length !== TPLS.length) throw new Error(`dash: a first visit made ${made0.length} layouts, not ${TPLS.length}`);
  const layouts = Object.fromEntries(TPLS.map((id, i) => [id, made0[i]]));
  // Fun break's video widget with a link, as a teacher would paste one (its host answers with a stand-in below).
  const fun = layouts.fun;
  await api(teacher, `/api/dash/${ids.classId}/layouts/${fun.id}`, { widgets: fun.widgets.map(w => (w.type === 'video' ? { ...w, s: { ...w.s, video: { p: 'youtube', id: 'aqz-KE-bpKQ' }, mute: true } } : w)) });
  const students = [];
  for (const [, username] of STUDENTS) students.push(await person('desk', username));
  const use = id => api(teacher, `/api/dash/${ids.classId}/layouts/${id}/use`, {});
  const W = (p, type) => p.locator(`.dash-w[data-id^="${type}"]`).first();
  const tour = {
    async morning() {
      await use(layouts.morning.id);
      for (const [i, s] of students.entries()) await api(s, `/api/dash/${ids.classId}/mood`, { mood: [0, 1, 0, 2, 0][i] });
    },
    async lesson(p) {
      const ch = await api(teacher, `/api/dash/${ids.classId}/checks`, { kind: 'thumbs', question: 'Can you compare 3/8 and 3/5?' });
      const cid = ch.check;   // createCheck answers { check: id }
      for (const [i, s] of students.entries()) {
        if (cid) await api(s, `/api/dash/${ids.classId}/checks/${cid}/answer`, { value: [0, 0, 1, 0, 2][i] });
        if (i < 2) await api(s, `/api/dash/${ids.classId}/help`, { kind: i === 0 ? 'help' : 'done' });
      }
      return async () => {
        await W(p, 'timer').getByRole('button', { name: /^Start$/ }).click();
        await W(p, 'numline').getByRole('button', { name: /Point$/ }).click();
        const b = await W(p, 'numline').locator('svg').first().boundingBox();
        if (b) await p.mouse.click(b.x + b.width * 0.62, b.y + b.height * 0.5);
      };
    },
    async math(p) {
      return async () => {
        await W(p, 'timer').getByRole('button', { name: /^Start$/ }).click();
        for (const i of [1, 4]) await api(students[i], `/api/dash/${ids.classId}/help`, { kind: 'help' });
      };
    },
    async group(p) {
      return async () => {
        await W(p, 'groups').getByRole('button', { name: /Make groups/ }).click();
        await W(p, 'timer').getByRole('button', { name: /^Start$/ }).click();
        for (const [team, n] of [[0, 2], [1, 3], [2, 1]]) for (let k = 0; k < n; k++) await W(p, 'score').getByRole('button', { name: /One point for/ }).nth(team).click();
      };
    },
    async quiet(p) {
      return async () => {
        await W(p, 'timer').getByRole('button', { name: /^Start$/ }).click();
        await W(p, 'breathe').getByRole('button', { name: /^Start$/ }).click();
      };
    },
    async fun(p) {
      return async () => {
        await W(p, 'picker').getByRole('button', { name: /Spin/ }).click();
        await W(p, 'dice').getByRole('button', { name: /Roll$/ }).click();
        await p.waitForTimeout(5500);   // the wheel stops
      };
    },
  };
  for (const tpl of TPLS) {
    if (tpl !== 'morning') await use(layouts[tpl].id);
    const p = await person('wide', 'MsRivera', { timezoneId: 'America/New_York' });
    await p.clock.setFixedTime(new Date(morning));
    await p.route(/^https:\/\/(www\.youtube\.com|www\.youtube-nocookie\.com|player\.vimeo\.com)\//, r => r.fulfill({ contentType: 'text/html', body: VIDEO_STAND_IN }));
    const after = await tour[tpl](p);
    await p.goto(`/class/${ids.classId}/dashboard`);
    await p.locator('.dash-w').first().waitFor(); await p.waitForTimeout(1200);
    if (after) await after();
    await p.waitForTimeout(1500);
    made.push({ slug: `dash-layout-${tpl}`, kind: 'wide', png: await shot(p, `dash-layout-${tpl}`, { names: true }) });
    await p.context().close();
  }
  // The lesson's quick check is over, and the class follows the morning layout again, for the shots below.
  const live = await teacher.request.get(`/api/dash/${ids.classId}/live`).then(r => r.json()).catch(() => ({}));
  for (const c of live.checks || []) if (c.open) await api(teacher, `/api/dash/${ids.classId}/checks/${c.id}/end`, {});
  await use(layouts.morning.id);
  for (const s of students) await s.context().close();
  await teacher.context().close();
  // The browser's clock too (the clock and schedule widgets read it), fixed at the same morning.
  const ready = async p => { await p.locator('.dash-w').first().waitFor(); await p.waitForTimeout(1200); };
  const open = async (kind, who) => { const p = await person(kind, who, { timezoneId: 'America/New_York' }); await p.clock.setFixedTime(new Date(morning)); await p.goto(`/class/${ids.classId}/dashboard`); await ready(p); return p; };
  {
    const kind = 'desk', p = await open(kind, 'MsRivera');
    made.push({ slug: 'dash-teacher', kind, png: await shot(p, `dash-teacher-${kind}`, { names: true }) });
    await p.context().close();
  }
  {
    const p = await open('phone', ids.pandaSchool);
    made.push({ slug: 'dash-student', kind: 'phone', png: await shot(p, 'dash-student-phone', { names: true }) });
    await p.context().close();
  }
  return made;
}

// 7. The teaching tools. A live math room (Base Ten Blocks): four students join from their phones and build numbers in
// their own squares; the picture is the teacher's screen with every square, and a student's phone with their own. Then a
// Figures worksheet that Oomba drafted in the chat (the stand-in AI), with the chat open beside it.
async function toolShots({ person, shot }) {
  const made = [];
  const teacher = await person('desk', 'MsRivera');
  await teacher.goto('/manipulatives');
  // Her class (the list says "class · school"), not the first one in it.
  const classSel = teacher.locator('select').filter({ has: teacher.locator('option', { hasText: "Ms. Rivera's Class" }) }).first();
  const classVal = await classSel.evaluate(sel => Array.from(sel.options).find(o => o.textContent.startsWith("Ms. Rivera's Class")).value);
  await classSel.selectOption(classVal);
  await teacher.locator('select').filter({ has: teacher.locator('option', { hasText: 'Base Ten Blocks' }) }).first().selectOption({ label: 'Base Ten Blocks' });
  await Promise.all([teacher.waitForURL(/#live\//), teacher.getByRole('button', { name: 'Start the session' }).click()]);
  await teacher.waitForTimeout(1500);
  // Each student shows a number: [flats, rods] in the chart the room gives every square.
  const plan = [['CosmicPanda21', 1, 3], ['SwiftOtter34', 2, 0], ['BrightFox57', 1, 2], ['CozyKoala18', 0, 4]];
  const kids = [];
  for (const [user, flats, rods] of plan) {
    const k = await person('phone', user);
    await k.goto('/manipulatives');
    await Promise.all([k.waitForURL(/#live\//), k.locator('main a', { hasText: /^Join$/ }).first().click()]);
    await k.waitForTimeout(1200);
    for (const [name, n] of [['Flat', flats], ['Rod', rods]]) for (let i = 0; i < n; i++) { await k.locator('#rm-pal button', { hasText: new RegExp(`${name}$`) }).first().click(); await k.waitForTimeout(250); }
    await k.waitForTimeout(800);
    kids.push(k);
  }
  await kids[0].getByRole('button', { name: /My square/ }).click().catch(() => {});
  await kids[0].waitForTimeout(600);
  made.push({ slug: 'tools-room', kind: 'phone', png: await shot(kids[0], 'tools-room-phone') });
  // The teacher's screen: zoomed (the wheel, as a person would) until the first row of squares (the four who joined) fills it.
  await teacher.waitForTimeout(2000);
  await teacher.getByRole('button', { name: /Fit/ }).click(); await teacher.waitForTimeout(400);
  for (let i = 0; i < 40; i++) {
    const bb = await teacher.evaluate(() => { const all = Array.from(document.querySelectorAll('#rm .rm-area:not(.teach)')).map(e => e.getBoundingClientRect()); const top = Math.min(...all.map(r => r.top)); const rs = all.filter(r => r.top < top + 10); return rs.length ? { x: Math.min(...rs.map(r => r.left)), y: Math.min(...rs.map(r => r.top)), r: Math.max(...rs.map(r => r.right)), b: Math.max(...rs.map(r => r.bottom)) } : null; });
    if (!bb) throw new Error('tools: no student squares in the room');
    if (bb.r - bb.x > 800 || bb.b - bb.y > 360) break;
    await teacher.mouse.move((bb.x + bb.r) / 2, bb.y + 20); await teacher.mouse.wheel(0, -40); await teacher.waitForTimeout(200);
  }
  await teacher.mouse.move(1, 1);
  made.push({ slug: 'tools-room', kind: 'desk', png: await shot(teacher, 'tools-room-desk') });
  for (const k of kids) await k.context().close();
  await teacher.context().close();

  for (const kind of ['phone', 'desk']) {
    const p = await person(kind, 'MsRivera');
    await p.goto('/figures/worksheets/new?ai=1');
    await p.locator('#oc-in').fill('Grade 6, area and volume: rectangles, boxes and a cylinder. 5 questions.');
    await p.click('#oc-send');
    await p.waitForSelector('.fg-item:nth-child(5)', { timeout: 30_000 });
    await p.waitForSelector('.oc-change');
    await p.waitForTimeout(1200);
    made.push({ slug: 'tools-figures', kind, png: await shot(p, `tools-figures-${kind}`) });
    await p.context().close();
  }
  return made;
}

// ---------------------------------------------------------------- encode
const SIZES = { phone: [['p', 390], ['p', 780]], desk: [['d', 1024], ['d', 2048]], wide: [['d', 1024], ['d', 2048]] };
function hasMagick() { try { return /WEBP/i.test(execFileSync('convert', ['-list', 'format'], { encoding: 'utf8' })) ? 'convert' : null; } catch { return null; } }
async function encodeAll(made, PNG) {
  fs.mkdirSync(OUT, { recursive: true });
  const magick = hasMagick();
  const files = [];
  let page = null, browser = null;
  for (const m of made) for (const [tag, w] of SIZES[m.kind]) {
    const out = path.join(OUT, `${m.slug}${SUFFIX}-${tag}-${w}.webp`);
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
  for (const pg of ['parents', 'teachers', 'live', 'dash', 'tools']) {
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
