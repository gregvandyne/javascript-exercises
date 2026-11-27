#!/usr/bin/env node
// The screenshots on the teacher landing at "/" (server/routes/landing.js): public/img/landing/<name>-<w>.webp, each at
// 1x and 2x (LANDING_SHOTS below lists the names and widths). Run it again after the app changes (for example once
// Homeroom is renamed the Hub in the app): `node scripts/landing-shots.mjs`, or only some: `node scripts/landing-shots.mjs hub,tour`.
//
// The real app on an in-memory database with made-up people only (a demo school, "Ms. Lark" and 16 students with
// made-up first names), a stand-in AI for the Oomba chat (no API key is used), and Chromium at 2x. Nothing on a page is
// edited before a capture: what the app says is what the picture shows.
//
// Needs Chromium (scripts/chromium.js) and ImageMagick with WebP (`convert`); the PNGs go to a temporary folder
// (or --png <dir> to keep them).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/img/landing');
const args = process.argv.slice(2);
const pngAt = args.indexOf('--png');
const PNG = pngAt >= 0 ? path.resolve(args[pngAt + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), 'landing-shots-'));
const ONLY = (args.find((a, i) => !a.startsWith('--') && i !== pngAt + 1) || '').split(',').filter(Boolean);
const want = k => !ONLY.length || ONLY.some(o => k === o || k.startsWith(`${o}-`));

/** name -> [1x width, 2x width] of the WebP files (the captures are 2x, so the 2x file is the full capture). */
export const LANDING_SHOTS = {
  'hub-light': [1200, 2400], 'hub-dark': [1200, 2400],
  'tour-seats': [1100, 2200], 'tour-handout': [1100, 2200], 'tour-watch': [1100, 2200], 'tour-hands': [1100, 2200], 'tour-oomba': [1100, 2200], 'tour-finish': [1100, 2200],
  'chat-plan': [440, 880], 'chat-point': [440, 880],
  'tool-manip': [640, 1280], 'tool-figures': [640, 1280], 'tool-crossword': [640, 1280], 'tool-mistake-hunt': [640, 1280], 'tool-library': [640, 1280],
  'tool-brain-board': [640, 1280], 'tool-build': [640, 1280], 'tool-dash': [640, 1280], 'tool-typing-zoo': [640, 1280], 'tool-atlas-quest': [640, 1280],
};

if (!process.env.LANDING_SHOTS_CHILD) {
  const env = { ...process.env, LANDING_SHOTS_CHILD: '1', BRB_DB: ':memory:', BRB_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'landing-data-')), BRB_SILENT: '1', LOG_REQUESTS: '0', BRB_SNAPSHOTS: '0',
    ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', STRIPE_API_KEY: '', BILLING_PUBLIC: '', HOMEROOM: '1', HOMEROOM_ONBOARDING: '0', MANIPULATIVES: '1', FIGURES: '1', COMPANION: '1', LANDING_AT_ROOT: '1' };
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], { cwd: ROOT, env, stdio: 'inherit' });
  child.on('exit', code => process.exit(code ?? 1));
} else {
  main().catch(e => { console.error(e); process.exit(1); });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const R = ROOT + '/';
  const { config } = await import(R + 'server/config.js');
  config.anthropicKey = '';
  const { q } = await import(R + 'server/db.js');
  const { createUser, getUser, startSession } = await import(R + 'server/auth.js');
  const S = await import(R + 'server/services/schools.js');
  const G = await import(R + 'server/services/games.js');
  const H = await import(R + 'server/services/homeroom.js');
  const HO = await import(R + 'server/services/homeroom-handouts.js');
  const HV = await import(R + 'server/services/homeroom-live.js');
  const HP = await import(R + 'server/services/homeroom-plan.js');
  const F = await import(R + 'server/services/figures.js');
  const CO = await import(R + 'server/services/companion.js');
  const TOOLS = await import(R + 'tests/unit/_tools-plan.js');
  TOOLS.plansOn();

  const { importGame } = await import(R + 'scripts/import-game.js');
  const { seedOfficial } = await import(R + 'scripts/seed.js');
  const official = seedOfficial();
  const SLUGS = ['brain-board', 'crossword', 'typing-zoo', 'atlas-quest', 'atlas-quest-live', 'mistake-hunt', 'word-hunt', 'doodle-hoot', 'sudoku', 'arithmetic-lab', 'algebra-builder', 'would-you-rather-live', 'popcorn-hush', 'castle-clash', 'word-peek'];
  for (const s of SLUGS) if (!G.getGameBySlug(s) && fs.existsSync(`${R}seed-games/${s}.html`)) importGame(`${R}seed-games/${s}.html`, `${R}seed-games/${s}.json`, official.id);
  const gid = s => G.getGameBySlug(s).id;

  // Made-up people only.
  const boss = createUser({ username: 'DemoAdmin', password: 'demo-secret-123', role: 'admin' });
  const school = S.createSchool(boss, { name: 'Willow Creek Demo School' }).school;
  const T = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Ms. Lark', role: 'teacher' }).user.id);
  q.run("UPDATE users SET display_name='Ms. Lark', avatar='🦉', color='#1F9D63' WHERE id=?", T.id);
  TOOLS.givePlan(T.id);
  config.homeroomUsers = [T.username.toLowerCase()];
  config.manipulativesUsers.push(T.username.toLowerCase());
  const cls = S.createClass(boss, school.id, { name: 'Room 12 · Grade 3', grade: '3', teacherId: T.id }).class;
  const NAMES = ['Ada M.', 'Ben T.', 'Cleo R.', 'Dev P.', 'Eli S.', 'Fay W.', 'Gus L.', 'Hana K.', 'Ivo N.', 'Juno B.', 'Kai F.', 'Lena O.', 'Milo D.', 'Nia G.', 'Omar V.', 'Pia H.'];
  const kids = NAMES.map(n => { const u = getUser(S.createSchoolAccount(boss, school.id, { rosterName: n, grade: '3' }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });

  // ---- the class's board: tables of four, groups, notes in the teacher's area, live class, two handouts, a day plan,
  // students at work and two hands up.
  H.saveSeats(T, cls, { preset: 'pods', seats: {} });
  const groups = H.roomOf(cls.id).groups;
  const members = {}; kids.forEach((k, i) => { members[k.id] = groups[i % groups.length].id || `g${(i % 3) + 1}`; });
  H.saveGroups(T, cls, { groups, members });
  H.saveArea(T, cls, { __ann: { notes: [{ id: 'n1', text: 'Warm-up: what is 3/4 of 12?', x: 0.04, y: 0.12, by: 't' }, { id: 'n2', text: 'Today: fractions on a number line', x: 0.3, y: 0.12, by: 't' }], texts: [], strokes: [] }, shapes: [] });
  H.setLive(T, cls, 'start');
  const ho1 = HO.handOut(T, cls, { gameId: gid('arithmetic-lab'), to: { kind: 'all' }, instructions: 'Work the first three problems, then check with a partner.' });
  HO.handOut(T, cls, { gameId: gid('crossword'), to: { kind: 'all' } });
  const raw = { name: 'Fractions day', topic: 'fractions', parts: [
    { kind: 'slides', minutes: 8, title: 'Fractions on a number line' },
    { kind: 'work', minutes: 20, title: 'Practice', pick: { gameId: gid('arithmetic-lab') } },
    { kind: 'break', minutes: 3, title: 'Stretch and wiggle' },
    { kind: 'exit', minutes: 5, title: 'Exit check' }] };
  try {
    const cp = HP.cleanPlan(T, cls, raw);
    HP.usePlan(T, cls, cp.plan || cp);
    HP.runAction(T, cls, 'start');
  } catch (e) { console.log('  (the day plan was not set up:', e.message, ')'); }
  kids.forEach((k, i) => {
    if (i === 3 || i === 9) return;   // two students not here yet
    try { HV.pulse(k, cls, { where: i % 4 === 0 ? 'desk' : 'game', on: ho1.classLesson && ho1.classLesson.id, idle: (i * 7) % 40 }); } catch { /* a pulse the service refuses is just not shown */ }
  });
  try { HV.raiseHand(kids[2], cls, 'question'); HV.raiseHand(kids[6], cls, 'help'); } catch { /* no hands */ }

  // A second class for the chat (its own board, so the first one's live state stays as it is).
  const cls2 = S.createClass(boss, school.id, { name: 'Room 14 · Grade 4', grade: '4', teacherId: T.id }).class;
  kids.forEach(k => S.addToClass(boss, cls2.id, k.id));
  H.saveSeats(T, cls2, { preset: 'pods', seats: {} });
  H.saveGroups(T, cls2, { groups, members });

  const ws = F.createWorksheet(T, { title: 'Area and angles', grade: '4', items: [
    { kind: 'rectangle', gen: 'rectangle', seed: 41 }, { kind: 'compositeShape', gen: 'compositeShape', seed: 7 },
    { kind: 'protractor', gen: 'protractor', seed: 12 }, { kind: 'barGraph', gen: 'barGraph', seed: 5 }] });

  // ---- a stand-in AI for the Oomba chat: the real tools, called with fixed inputs.
  const lastUser = p => { for (let i = p.messages.length - 1; i >= 0; i--) { const m = p.messages[i]; if (m.role === 'user' && typeof m.content === 'string') return m.content; if (m.role === 'user' && Array.isArray(m.content) && m.content.some(c => c.type === 'text')) return m.content.find(c => c.type === 'text').text; } return ''; };
  const asked = p => { let i = p.messages.length - 1; while (i >= 0 && !(p.messages[i].role === 'user' && (typeof p.messages[i].content === 'string' || p.messages[i].content.some(c => c.type === 'text')))) i--; return p.messages.slice(i + 1).filter(m => m.role === 'assistant').length; };
  const tool = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${name}_${Math.random().toString(36).slice(2, 7)}`, name, input }] });
  const text = s => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: s }] });
  CO.hooks.create = async p => {
    const w = lastUser(p), n = asked(p);
    let r;
    if (/plan/i.test(w)) r = n === 0 ? tool('draftDayPlan', raw) : text('Here is a 36 minute fractions day: a short slide intro, practice in Arithmetic Lab, a stretch break and an exit check. Nothing goes on desks until you tap Use this plan.');
    else if (/point/i.test(w)) r = n === 0 ? tool('givePoint', { target: 'class', reason: 'teamwork' }) : text('Done. The whole class earned a point for teamwork.');
    else r = text('Happy to help.');
    return { model: p.model, usage: { input_tokens: 5, output_tokens: 5 }, ...r };
  };

  const { createApp } = await import(R + 'server/app.js');
  const { attachUpgrades } = await import(R + 'server/services/upgrade.js');
  const classLive = await import(R + 'server/services/classlive-socket.js');
  const manipSocket = await import(R + 'server/services/manip-socket.js');
  const server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  attachUpgrades(server, [classLive.route, manipSocket.route]);
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
  const [cn, cv] = cookieOf(T.id).split('=');

  const { chromium } = await import('playwright');
  const { launchOptions } = await import(R + 'scripts/chromium.js');
  const browser = await chromium.launch(launchOptions({ args: ['--no-sandbox', '--hide-scrollbars'] }));
  const open = async (url, { theme = 'light', who = [cn, cv], w = 1440, h = 900, time = null } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: 'en-US', colorScheme: theme, reducedMotion: 'reduce' });
    if (who) await ctx.addCookies([{ name: who[0], value: who[1], url: BASE }, { name: 'theme', value: theme, url: BASE }]);
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    if (time) await page.clock.setFixedTime(time);   // a school morning, so clocks and schedules look like class time
    page.on('pageerror', e => console.log('  pageerror', url, e.message.slice(0, 160)));
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    return { ctx, page };
  };
  // 9:40 on a school morning (the browser's clock only; the server keeps its own).
  const MORNING = (() => { const d = new Date(); d.setHours(9, 40, 0, 0); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1); return d; })();
  const made = [];
  const snap = async (target, name) => { const f = path.join(PNG, `${name}.png`); await target.screenshot({ path: f }); made.push(name); console.log('  captured', name); };
  const run = async (k, fn) => { if (!want(k)) return; try { await fn(); } catch (e) { console.log('FAILED', k, e.message.slice(0, 300)); } };
  const clickText = (page, re) => page.locator('button, a, [role="button"], [role="tab"], summary').filter({ hasText: re }).first().click();
  const hubUrl = id => `/class/${id}/hub`;

  const menu = async (page, re) => { await page.locator('.hr-chunk', { hasText: '⋯' }).first().click(); await page.waitForTimeout(500); await page.locator('.rm-mi').filter({ hasText: re }).first().click(); };

  // ---- the Hub board (the tour's "Watch every desk", and the Hub section in both themes)
  await run('hub', async () => {
    for (const theme of ['light', 'dark']) {
      const { ctx, page } = await open(hubUrl(cls.id), { theme });
      await page.waitForTimeout(3500);
      await snap(page, `hub-${theme}`);
      await ctx.close();
    }
  });
  // ---- the Hub tour, six steps
  await run('tour', async () => {
    const { ctx, page } = await open(hubUrl(cls.id));
    await page.waitForTimeout(3500);
    await snap(page, 'tour-watch');
    await menu(page, /Arrange seats/); await page.waitForTimeout(1200);
    await snap(page, 'tour-seats');
    await page.keyboard.press('Escape'); await ctx.close();
  });
  await run('tour', async () => {
    const { ctx, page } = await open(hubUrl(cls.id));
    await page.waitForTimeout(3500);
    await page.locator('.hr-give.hr-ccard').filter({ hasText: 'Mistake Hunt' }).first().click(); await page.waitForTimeout(900);
    await snap(page, 'tour-handout');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.locator('.hr-handsbtn').click(); await page.waitForTimeout(900);
    await snap(page, 'tour-hands');
    await ctx.close();
  });
  // ---- Ask Oomba: a day plan, then a point for the whole class (the stand-in AI above calls the real tools)
  await run('chat', async () => {
    const { ctx, page } = await open(hubUrl(cls2.id));
    await page.waitForTimeout(2500);
    await page.click('#oc-bubble');
    await page.fill('#oc-in', 'Plan today: fractions on a number line, about 35 minutes');
    await page.click('#oc-send');
    await page.waitForTimeout(5000);
    await page.evaluate(() => { const m = [...document.querySelectorAll('.oc-turn.me')].pop(); if (m) m.scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(400);
    await snap(page, 'tour-oomba');
    const panel = page.locator('#oc');
    await snap(panel, 'chat-plan');
    await page.fill('#oc-in', 'Give the whole class a point for teamwork');
    await page.click('#oc-send');
    await page.waitForTimeout(5000);
    await snap(panel, 'chat-point');
    await ctx.close();
  });
  await run('tour', async () => {
    const { ctx, page } = await open(hubUrl(cls.id));
    await page.waitForTimeout(3500);
    await menu(page, /End class/); await page.waitForTimeout(1500);
    await snap(page, 'tour-finish');
    await ctx.close();
  });

  // ---- the tools
  await run('tool-manip', async () => {
    const { ctx, page } = await open('/manipulatives#fraction-tiles');
    await page.locator('#mp-board').waitFor();
    await page.waitForTimeout(1500);
    const pcs = page.locator('.mp-pal.piece');
    for (const i of [0, 1, 1, 3, 3, 3, 3, 2, 2, 2]) { await pcs.nth(i).click().catch(() => {}); await page.waitForTimeout(250); }
    await page.mouse.click(1300, 860);
    await page.waitForTimeout(800);
    await snap(page, 'tool-manip');
    await ctx.close();
  });
  await run('tool-figures', async () => { const { ctx, page } = await open(`/figures/worksheets/${ws.id}`); await page.waitForTimeout(3000); await snap(page, 'tool-figures'); await ctx.close(); });
  await run('tool-dash', async () => { const { ctx, page } = await open(`/class/${cls.id}/dashboard`, { time: MORNING }); await page.waitForTimeout(3000); await snap(page, 'tool-dash'); await ctx.close(); });
  await run('tool-library', async () => { const { ctx, page } = await open('/library'); await page.waitForTimeout(2500); await snap(page, 'tool-library'); await ctx.close(); });
  await run('tool-build', async () => { const { ctx, page } = await open('/build'); await page.waitForTimeout(1500); await page.locator('text=New lesson').first().click().catch(() => {}); await page.waitForTimeout(3000); await snap(page, 'tool-build'); await ctx.close(); });
  for (const s of ['atlas-quest', 'typing-zoo', 'mistake-hunt', 'crossword', 'brain-board']) {
    await run('tool-' + s, async () => {
      const { ctx, page } = await open(`/g/${s}`);
      await page.waitForTimeout(1500);
      if (s !== 'brain-board') await page.locator('a:has-text("Play"), button:has-text("Play")').first().click().catch(() => {});
      await page.waitForTimeout(6000);
      const fr = page.frames().find(f => f !== page.mainFrame() && /\/(play|g)\b|game/.test(f.url())) || page.frames()[1];
      if (fr && s === 'crossword') { await fr.locator('text=Try a sample puzzle').click().catch(() => {}); await page.waitForTimeout(2500); }
      if (fr && s === 'atlas-quest') {
        await fr.locator('text=Play').first().click().catch(() => {}); await page.waitForTimeout(800);
        for (let i = 0; i < 3; i++) { await fr.locator('text=Next').first().click().catch(() => {}); await page.waitForTimeout(400); }
        await fr.locator("text=Let's fly").first().click().catch(() => {}); await page.waitForTimeout(1500);
      }
      await snap(page, 'tool-' + s);
      await ctx.close();
    });
  }

  await browser.close();
  server.closeAllConnections(); server.close();
  encode(made);
  process.exit(0);
}

/** The PNGs (2x captures) to WebP at each size in LANDING_SHOTS. */
function encode(names) {
  let total = 0;
  for (const name of names) {
    const sizes = LANDING_SHOTS[name]; if (!sizes) continue;
    for (const w of sizes) {
      const out = path.join(OUT, `${name}-${w}.webp`);
      execFileSync('convert', [path.join(PNG, `${name}.png`), '-resize', `${w}x`, '-strip', '-define', 'webp:method=6', '-quality', w > 1000 ? '68' : '74', out]);
      const n = fs.statSync(out).size; total += n;
      console.log(`  ${path.relative(ROOT, out).padEnd(52)} ${(n / 1024).toFixed(0).padStart(5)} KB`);
    }
  }
  console.log(`  ${names.length} pictures, ${(total / 1024).toFixed(0)} KB in all`);
  // shots.json: each picture's widths and its height at the 1x width, so the page sizes every <img> before it loads.
  const file = path.join(OUT, 'shots.json');
  const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  for (const name of names) {
    const sizes = LANDING_SHOTS[name]; if (!sizes) continue;
    const [w, h] = execFileSync('identify', ['-format', '%w %h', path.join(OUT, `${name}-${sizes[0]}.webp`)], { encoding: 'utf8' }).trim().split(' ').map(Number);
    all[name] = { w: sizes, h: Math.round(h * sizes[0] / w) };
  }
  fs.writeFileSync(file, `${JSON.stringify(Object.fromEntries(Object.entries(all).sort()), null, 1)}\n`);
}
