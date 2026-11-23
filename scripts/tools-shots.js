// Screenshots of the new teaching tools for /teachers (docs/decisions.md "Teachers and Parents pages: lead with the new
// tools, no 'always free'"): public/img/how/<slug>-d-1024/-d-2048.webp (a 1280 x 800 laptop screen, 2x) and, for a
// student's own screen, <slug>-p-390/-p-780.webp (an iPhone-sized 390 x 844 screen, 2x), the same names and sizes as
// scripts/how-shots.js, so server/views/how.js and the landing can show them the same way.
//   tools-board    the Manipulatives board with Oomba, the companion chat, docked beside it (a clock board it drafted)
//   tools-room     the teacher's live room: the board pushed to the class, every student's square on one screen
//   tools-student  a student's phone in the same room: their own square, with the board their teacher pushed
// The Classroom Dashboard shots are scripts/how-shots.js --only dash (dash-teacher, dash-student).
//
// Real captures of the running app (server/app.js, in this process) from a throwaway in-memory database with made-up
// demo people (Ms. Rivera at Sunny Hill Demo School, students Pixel Panda, Rocket Otter...). Oomba's answer comes from a
// stand-in for the AI (services/companion.js hooks.create, as tests/unit/manip-chat-browser.test.js does): the words are
// fixed, the board it changes and the chat that shows it are the real ones. Never a real child, never a price.
//
// Usage: node scripts/tools-shots.js [--keep]      Needs ImageMagick `convert` with WebP and the Playwright Chromium.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'img', 'how');
const keep = process.argv.includes('--keep');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'oomba-tools-'));
Object.assign(process.env, {
  BRB_DB: ':memory:', BRB_DATA_DIR: TMP, BRB_SILENT: '1', LOG_REQUESTS: '0', LANDING_AT_ROOT: '0', MANIPULATIVES: '1', FIGURES: '1',
  MANIPULATIVES_USERS: 'msrivera', ANTHROPIC_API_KEY: '', STRIPE_API_KEY: '', BILLING_PUBLIC: '', CONTACT_EMAIL: 'help@example.com',
});

const { createApp } = await import('../server/app.js');
const { createUser, startSession, getUser } = await import('../server/auth.js');
const S = await import('../server/services/schools.js');
const M = await import('../server/services/manipulatives.js');
const CO = await import('../server/services/companion.js');
const { chromium } = await import('playwright-core');

const PRICE = /[$€£¥₹]\s?\d|\/(month|year|mo|yr)\b|per (month|year)/i;
const STUDENTS = ['Pixel Panda', 'Rocket Otter', 'Comet Fox', 'Maple Koala', 'Nova Newt', 'Star Gecko'];
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

// ------------------------------------------------------------------ the demo school
const admin = createUser({ username: 'DemoAdmin', password: 'demo-pass-123', role: 'admin' });
const school = S.createSchool(admin, { name: 'Sunny Hill Demo School' }).school;
const teacher = createUser({ username: 'MsRivera', password: 'demo-pass-123', displayName: 'Ms. Rivera', avatar: '🍎', color: '#ec4899' });
S.addMember(admin, school.id, teacher.id, 'teacher', { rosterName: 'Ms. Rivera' });
const cls = S.createClass(admin, school.id, { name: "Ms. Rivera's Class", grade: '2', teacherId: teacher.id }).class;
const kids = STUDENTS.map(n => { const u = getUser(S.createSchoolAccount(admin, school.id, { rosterName: n }).user.id); S.addToClass(admin, cls.id, u.id); return u; });

// The clock board Oomba drafts on the board shot, saved for the room too: four clocks at half past, each with an answer box.
const TIMES = ['3:30', '7:30', '11:30', '5:30'];
const DRAFT = { title: 'Half hours', steps: ['Read each clock.', 'Write the time under it.'], items: TIMES.map(time => ({ time, box: 'answer' })) };

const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
const LAPTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const HIDE_CSS = '*{caret-color:transparent!important} #toasts,.toast{display:none!important}';
const PNG = path.join(TMP, 'png'); fs.mkdirSync(PNG);
const made = [];

async function open(who, hash, opts) {
  const ctx = await browser.newContext({ ...opts, colorScheme: 'light', locale: 'en-US', reducedMotion: 'reduce' });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); page.setDefaultTimeout(20_000);
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/manipulatives?theme=light${hash}`);
  return { ctx, page, errors };
}
async function shot(page, slug, kind) {
  await page.addStyleTag({ content: HIDE_CSS });
  await page.evaluate(() => { document.activeElement?.blur?.(); return document.fonts.ready; });
  await page.waitForTimeout(400);
  const text = await page.evaluate(() => document.body.innerText);
  if (PRICE.test(text)) throw new Error(`${slug}: the page shows a price: ${text.match(PRICE)[0]}`);
  const file = path.join(PNG, `${slug}-${kind}.png`);
  await page.screenshot({ path: file });
  made.push({ slug, kind, png: file });
  console.log(`  shot ${slug} (${kind})`);
}

let boardId = null;
try {
  // 1. The board with Oomba: "Draft with AI", one request, the drafted board beside the chat.
  CO.hooks.create = async params => {
    const last = params.messages.at(-1), after = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    const base = { model: params.model, usage: { input_tokens: 5, output_tokens: 5 } };
    if (!after) return { ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: 'changeBoard', input: DRAFT }] };
    return { ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here are four clocks at half past, each with an answer box, in two steps. Push it to your class when you are ready.' }] };
  };
  {
    const { ctx, page, errors } = await open(teacher, '#clock', LAPTOP);
    await page.waitForSelector('#mp-board');
    await page.click('#mp-toolsrow [data-tool="draft"]');
    await page.waitForSelector('#oc:not([hidden])');
    await page.fill('#oc-in', 'Four clocks at half past for grade 2, with answer boxes');
    await page.click('#oc-send');
    await page.waitForSelector('.oc-change [data-act="mundo"]', { timeout: 15000 });
    await page.waitForTimeout(800);
    await shot(page, 'tools-board', 'desk');
    // The board saves itself a moment after a change (its address becomes #board/<id>): that board goes to the room.
    await page.waitForFunction(() => /^#board\//.test(location.hash), null, { timeout: 15000 });
    boardId = new URL(page.url()).hash.slice('#board/'.length);
    if (errors.length) throw new Error(`board: ${errors.join('; ')}`);
    await ctx.close();
  }
  CO.hooks.create = null;

  // 2. The live room: the same board (the one the board shot saved), pushed to the class, everyone joined.
  const s = M.createSession(teacher, { classId: cls.id, boardId }).session;
  for (const k of kids) M.join(k, { code: s.code });
  M.push(teacher, s.id, boardId);
  // Each student loads the pushed board into their own square on their phone (the page's own button), then most of
  // them answer: all four right, one with a slip, one still working.
  for (const [i, k] of kids.entries()) {
    const { ctx, page, errors } = await open(k, `#live/${s.id}`, PHONE);
    await page.waitForSelector('.rm-area.mine'); await page.waitForTimeout(600);
    await page.locator('[data-rtool="loadpush"]').first().tap();
    await page.waitForTimeout(1200);
    // The first student's phone, their square just loaded: the student's view of the room.
    if (i === 0) await shot(page, 'tools-student', 'phone');
    if (errors.length) throw new Error(`load: ${errors.join('; ')}`);
    await ctx.close();
    const st = JSON.parse(M.studentView(k, s.id).mine || '{}');
    const answers = (st.objects || []).filter(o => o.k === 'answer');
    if (!answers.length) throw new Error(`${STUDENTS[i]}: the pushed board did not load`);
    answers.forEach((o, j) => { if (j < (i === 3 ? 2 : 4)) o.st = { ...o.st, ans: i === 4 && j === 1 ? '6:30' : TIMES[j] }; });
    const r = M.saveArea(k, s.id, k.id, st); if (!r.ok) throw new Error(`${STUDENTS[i]}: ${JSON.stringify(r)}`);
  }
  {
    const { ctx, page, errors } = await open(teacher, `#live/${s.id}`, LAPTOP);
    await page.waitForSelector('.rm-area[data-key]'); await page.waitForTimeout(900);
    if (await page.locator('[data-rtool="fit"]').count()) { await page.locator('[data-rtool="fit"]').first().click(); await page.waitForTimeout(500); }
    await shot(page, 'tools-room', 'desk');
    if (errors.length) throw new Error(`room: ${errors.join('; ')}`);
    await ctx.close();
  }

  // Encode: the laptop shots 1024 and 2048 wide, the phone 390 and 780 (WebP, quality 72, like scripts/how-shots.js).
  const SIZES = { phone: [['p', 390], ['p', 780]], desk: [['d', 1024], ['d', 2048]] };
  for (const m of made) for (const [tag, w] of SIZES[m.kind]) {
    const out = path.join(OUT, `${m.slug}-${tag}-${w}.webp`);
    execFileSync('convert', [m.png, '-resize', `${w}x`, '-strip', '-define', 'webp:method=6', '-quality', '72', out]);
    console.log(`${path.relative(ROOT, out).padEnd(44)} ${(fs.statSync(out).size / 1024).toFixed(0).padStart(5)} KB`);
  }
} finally {
  await browser.close();
  server.closeAllConnections(); server.close();
  if (keep) console.log(`Kept ${TMP}`); else fs.rmSync(TMP, { recursive: true, force: true });
}
process.exit(0);
