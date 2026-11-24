// Oomba, the teaching companion in a real browser (docs/decisions.md "Oomba teaching companion"; public/js/companion.js
// on public/js/oomba-chat.js). On a laptop: the bubble at the bottom right of a teacher page and at the end of the class
// dashboard's layout bar; "a game for 3rd grade fractions" answers with game cards (Play, Host live, Assign); "add a 5
// minute timer and class jobs" shows a change to Apply, applies it (the timer changed, not doubled) and Undo puts it
// back; a lesson plan attached becomes a Builder hand-off that opens the Builder with the brief filled in; a web answer
// shows its sources ("Not on Oomba"); no bubble while a game plays or for a student. On an iPhone 13 (dark): the bubble
// above the tab bar, the panel a sheet, and the microphone (a fake device; the speech service a stand-in): "Listening",
// then the words in the box. No sideways scroll, no console errors. The AI is a stand-in (services/companion.js
// hooks.create); no network. COMPANION_SHOTS=<dir> also saves pictures (the built feature's screenshots).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const G = await import('../../server/services/games.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');
const STT = await import('../../server/services/stt.js');
const RL = await import('../../server/services/ratelimit.js');
const LIVE = await import('../../server/services/stt-live.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1243/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p) && fs.statSync(p).isFile());
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.COMPANION_SHOTS || '';

// The world: a demo school, a tester teacher (the Teacher plan rule with plans off), a class of grade 4 with students.
const boss = createUser({ username: 'CompBrowserBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Oomba Academy Demo School' }).school;
const teacher = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Demo Teacher', role: 'teacher' }).user.id);
q.run("UPDATE users SET display_name='Demo Teacher' WHERE id=?", teacher.id);
config.manipulativesUsers = [teacher.username.toLowerCase()];
const cls = S.createClass(boss, school.id, { name: 'Demo Class', grade: '4', teacherId: teacher.id }).class;
const kids = ['Bouncy Owl', 'Jolly Dolphin', 'Lucky Gecko', 'Sunny Robin', 'Ada Park'].map(n => { const u = getUser(S.createSchoolAccount(boss, school.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return u; });
// Two official games, imported as the seed does (a real game page for "no Oomba while a game plays").
const { importGame } = await import('../../scripts/import-game.js');
const { seedOfficial } = await import('../../scripts/seed.js');
const official = seedOfficial();
for (const slug of ['fraction-factory', 'mistake-hunt']) if (!G.getGameBySlug(slug)) importGame(`seed-games/${slug}.html`, `seed-games/${slug}.json`, official.id);
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

/** The stand-in AI: answers by the teacher's last words. */
function ai() {
  const calls = [];
  const lastUser = p => { for (let i = p.messages.length - 1; i >= 0; i--) { const m = p.messages[i]; if (m.role === 'user' && typeof m.content === 'string') return m.content; if (m.role === 'user' && Array.isArray(m.content) && m.content.some(c => c.type === 'text')) return m.content.find(c => c.type === 'text').text; } return ''; };
  // Tool rounds in this answer: the assistant turns after the teacher's newest words (earlier answers are history).
  const asked = p => { let i = p.messages.length - 1; while (i >= 0 && !(p.messages[i].role === 'user' && (typeof p.messages[i].content === 'string' || p.messages[i].content.some(c => c.type === 'text')))) i--; return p.messages.slice(i + 1).filter(m => m.role === 'assistant').length; };
  const tool = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${name}_${calls.length}`, name, input }] });
  const text = s => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: s }] });
  CO.hooks.create = async p => {
    calls.push(p);
    const w = lastUser(p), n = asked(p);
    let r;
    if (/fractions/i.test(w) && !/attached/i.test(w)) r = n === 0 ? tool('searchGames', { topic: 'fractions', grade: '3', minutes: 10 }) : text('Here are two that fit about 10 minutes. Fraction Factory is the closest match.\n[[game:fraction-factory]]\n[[game:mistake-hunt]]');
    else if (/timer/i.test(w)) {
      if (n === 0) r = tool('getPageContext', {});
      else if (n === 1) r = tool('proposeDashboardChange', { changes: [{ op: 'add', type: 'timer', settings: { minutes: 5 } }, { op: 'add', type: 'jobs' }] });
      else r = text('Quiet work already has a timer, so I will change it rather than add a second one:');
    } else if (/attached/i.test(w)) {
      const id = (/file id ([A-Za-z0-9_-]+)/.exec(w) || [])[1];
      if (n === 0) r = tool('readUpload', { fileId: id });
      else if (n === 1) r = tool('startBuild', { tool: 'builder', title: 'Fractions on a number line', grade: '3', brief: 'A classroom activity: students place halves, thirds and fourths on a number line, guided first and then on their own.', practice: 'Fractions on a number line', help: 'Guided, then On my own', length: 'About 10 minutes', fromPlan: 'Watch for counting tick marks instead of spaces' });
      else r = text('Your plan places halves, thirds and fourths on a number line. Here is what I would hand the Builder:');
    } else if (/level M reader/i.test(w)) {
      if (n === 0) r = tool('searchBooks', { words: 'animals', readingLevel: 'M' });
      else {
        const res = p.messages.at(-1).content.find(c => c.type === 'tool_result');
        const books = JSON.parse(res.content).books.slice(0, 2);
        r = text(`Oomba's library sorts books by grade, not by guided reading level. Level M is usually late grade 2 to early grade 3, so these should fit:\n${books.map(b => `[[book:${b.id}]]`).join('\n')}`);
      }
    } else if (/English learners/i.test(w)) {
      const urls = ['https://ell-teaching.example.org/vocab', 'https://education.example.edu/turn-talk', 'https://teachers.example.gov/frames'];
      r = { stop_reason: 'end_turn', content: [
        { type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'supporting English learners during read aloud' } },
        { type: 'web_search_tool_result', tool_use_id: 'srv_1', content: [
          { type: 'web_search_result', url: urls[0], title: 'Vocabulary before a read-aloud' }, { type: 'web_search_result', url: urls[1], title: 'Turn and talk in the primary grades' }, { type: 'web_search_result', url: urls[2], title: 'Sentence frames for retelling' }] },
        { type: 'text', text: 'A few that work well:\n- Before reading, show 3 to 5 key words with a picture or a gesture.', citations: [{ type: 'web_search_result_location', url: urls[0], title: 'x', cited_text: 'x' }] },
        { type: 'text', text: '\n- Stop at 2 or 3 planned places for a turn and talk. Home language is welcome.', citations: [{ type: 'web_search_result_location', url: urls[1], title: 'x', cited_text: 'x' }] },
        { type: 'text', text: '\n- Give sentence frames for retelling: "First... Then... At the end..."', citations: [{ type: 'web_search_result_location', url: urls[2], title: 'x', cited_text: 'x' }] },
        { type: 'text', text: '\n\n**On Oomba:** Story Library books have Read to me, so students can hear the book again on their own.' },
      ] };
    } else r = text('Happy to help.');
    return { model: p.model, usage: { input_tokens: 5, output_tokens: 5 }, ...r };
  };
  return calls;
}

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  LIVE.attachLive(server);   // the live mic's sockets (the studio's and the companion's)
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { CO.hooks.create = null; STT.hooks.fetch = (...a) => globalThis.fetch(...a); if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
test.beforeEach(() => RL._reset());

const LAPTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = () => ({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
async function open(who, p, ctxOpts = LAPTOP, { dark = false } = {}) {
  const ctx = await browser.newContext({ ...ctxOpts, ...(dark ? { colorScheme: 'dark' } : { colorScheme: 'light' }) });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }, { name: 'theme', value: dark ? 'dark' : 'light', url: BASE }]);
  await ctx.grantPermissions(['microphone'], { origin: BASE }).catch(() => {});
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}${p}`);
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const noSideScroll = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');
async function ask(page, words) {
  await page.fill('#oc-in', words);
  await page.click('#oc-send');
}

test('laptop: the bubble on a teacher page; game search cards; a web answer with its sources', { skip }, async () => {
  ai();
  const { ctx, page, errors } = await open(teacher, `/class/${cls.id}`);
  try {
    const bubble = page.locator('#oc-bubble');
    await bubble.waitFor();
    const box = await bubble.boundingBox();
    assert.ok(box.x + box.width > 1440 - 40 && box.y + box.height > 900 - 40, 'bottom right');
    await shot(page, 'a_desktop');
    await bubble.click();
    await page.locator('#oc').waitFor();
    assert.match(await page.locator('.oc-sub').textContent(), /Demo Class/);
    await ask(page, 'Give me a game for 3rd grade fractions, 10 minutes');
    await page.locator('.oc-card').first().waitFor({ timeout: 15000 });
    const card = page.locator('.oc-card').first();
    assert.match(await card.textContent(), /Fraction Factory/);
    assert.equal(await card.locator('a', { hasText: 'Play' }).getAttribute('href'), '/play/fraction-factory');
    assert.match(await card.locator('a', { hasText: 'Host live' }).getAttribute('href'), /^\/live\?game=.+&class=/);
    assert.match(await card.locator('a', { hasText: 'Assign' }).getAttribute('href'), /^\/teach\/assign\?id=/);
    assert.match(await page.locator('.oc-did').first().textContent(), /Searched games/);
    await noSideScroll(page);
    await shot(page, 'b_games');
    // A book for a guided reading level: the library's grade bands, said as such, with Read and Assign.
    await ask(page, 'Show me a book for a level M reader about animals');
    await page.locator('.oc-card.book').first().waitFor({ timeout: 15000 });
    assert.match(await page.locator('.oc-did').last().textContent(), /reading level M/);
    assert.match(await page.locator('.oc-card.book a', { hasText: 'Read' }).first().getAttribute('href'), /^\/library\/.+\/read$/);
    await page.evaluate(() => { const l = document.getElementById('oc-log'); l.scrollTop = l.scrollHeight; });
    await shot(page, 'c_books');
    // A web answer: numbered sources, "Not on Oomba", links that open in a new tab.
    await ask(page, 'What are good ways to support English learners during a read-aloud?');
    await page.locator('.oc-web').waitFor({ timeout: 15000 });
    assert.equal(await page.locator('.oc-web .oc-li').count(), 3);
    assert.match(await page.locator('.oc-web').textContent(), /Not on Oomba/);
    assert.equal(await page.locator('.oc-web a').first().getAttribute('target'), '_blank');
    assert.equal(await page.locator('sup.oc-c').count(), 3);
    await page.evaluate(() => { const l = document.getElementById('oc-log'); l.scrollTop = l.scrollHeight; });
    await shot(page, 'j_web');
    assert.deepEqual(errors, []);
  } finally { await C.allSettled(); CO.reset(teacher); await ctx.close(); }
});

test('laptop: the dashboard: the bubble ends the layout bar; "add a 5 minute timer and class jobs" applies after a tap, then Undo', { skip }, async () => {
  ai();
  const { ctx, page, errors } = await open(teacher, `/class/${cls.id}/dashboard`);
  try {
    const bubble = page.locator('#dash-foot #oc-bubble');
    await bubble.waitFor();
    await shot(page, 'a_dash');
    await page.click('#dash-layouts >> text=Quiet work');
    await page.waitForTimeout(400);
    const layoutId = await page.evaluate(() => { const d = JSON.parse(document.getElementById('page-data').textContent); return d.layouts.find(l => l.name === 'Quiet work').id; });
    const timer0 = D.getLayout(layoutId).widgets.find(w => w.type === 'timer');
    await bubble.click();
    await ask(page, 'Add a 5 minute timer and class jobs');
    const apply = page.locator('.oc-prop button', { hasText: 'Apply' });
    await apply.waitFor({ timeout: 15000 });
    assert.match(await page.locator('.oc-prop').textContent(), /Timer.*5 minutes/s);
    assert.equal(D.getLayout(layoutId).widgets.filter(w => w.type === 'jobs').length, 0, 'nothing before the tap');
    await apply.click();
    await page.waitForLoadState('load');
    await page.locator('.dash-w.oc-hl').first().waitFor({ timeout: 10000 });
    const after = D.getLayout(layoutId).widgets;
    assert.equal(after.find(w => w.id === timer0.id).s.minutes, 5);
    assert.equal(after.filter(w => w.type === 'timer').length, 1, 'the timer changed, not doubled');
    assert.equal(after.filter(w => w.type === 'jobs').length, 1);
    await page.locator('#oc').waitFor();
    await shot(page, 'd_dash_add');
    await page.locator('.oc-change button', { hasText: 'Undo' }).click();
    await page.waitForLoadState('load');
    await page.waitForTimeout(800);
    assert.equal(D.getLayout(layoutId).widgets.filter(w => w.type === 'jobs').length, 0, 'Undo took the jobs off');
    // Projector: no Oomba while students can see the screen.
    await page.locator('#oc button[data-c="close"]').click().catch(() => {});
    await page.click('#dash-projector');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#dash-foot #oc-bubble').isVisible(), false, 'hidden in Projector');
    await page.keyboard.press('Escape').catch(() => {});
    assert.deepEqual(errors.filter(e => !/fullscreen|Permissions check failed/i.test(e)), []);
  } finally { await C.allSettled(); CO.reset(teacher); await ctx.close(); }
});

test('laptop: a lesson plan attached becomes a Builder hand-off; the Builder opens with the brief filled in', { skip }, async () => {
  ai();
  const { ctx, page, errors } = await open(teacher, `/class/${cls.id}`);
  try {
    await page.click('#oc-bubble');
    await page.setInputFiles('#oc-file', { name: 'fractions-number-line.txt', mimeType: 'text/plain', buffer: Buffer.from('Lesson plan: fractions on a number line (3.NF.A.2).\nBouncy Owl and Ada Park start at the board.\nStudents place 1/2, 1/3 and 1/4. Watch for counting tick marks instead of spaces.') });
    await page.locator('#oc-attach .oc-chipfile', { hasText: 'fractions-number-line.txt' }).waitFor();
    assert.match(await page.locator('#oc-note').textContent(), /isn't kept/);
    await ask(page, 'Make a game from this');
    await page.locator('.oc-hand').waitFor({ timeout: 15000 });
    assert.match(await page.locator('.oc-turn.me .oc-file').last().textContent(), /fractions-number-line\.txt/);
    assert.match(await page.locator('.oc-hand').textContent(), /Watch for counting tick marks/);
    assert.match(await page.locator('.oc-did').last().textContent(), /Read your file/);
    await shot(page, 'h_upload');
    await page.locator('.oc-hand button', { hasText: 'Open the Builder' }).click();
    await page.waitForURL(/\/build\/new\?for=class/);
    await page.waitForFunction(() => (document.getElementById('su-ltext') || {}).value?.includes('number line'));
    assert.deepEqual(errors, []);
  } finally { await C.allSettled(); CO.reset(teacher); await ctx.close(); }
});

test('chat history: New chat keeps the chat; 🕘 lists it in the conversation\'s place; open it again; delete one (asked first)', { skip }, async () => {
  ai();
  q.run("DELETE FROM oomba_chats WHERE owner_id=? AND surface='companion'", teacher.id);
  for (const [label, opts] of [['laptop', LAPTOP], ['phone', PHONE()]]) {
    const { ctx, page, errors } = await open(teacher, `/class/${cls.id}`, opts);
    try {
      await page.locator('#oc-bubble').click();
      await page.locator('#oc:not([hidden])').waitFor();
      await ask(page, 'Give me a game for 3rd grade fractions, 10 minutes');
      await page.locator('.oc-card').first().waitFor({ timeout: 15000 });
      // New chat: no question, a fresh conversation.
      await page.click('#oc-new');
      await page.waitForFunction(() => !document.querySelector('#oc-log .oc-card'), null, { timeout: 10000 });
      // The history: in the conversation's place, the chat with its first message.
      await page.click('#oc-hist-btn');
      await page.locator('#oc-hist:not([hidden]) .oc-hrow').first().waitFor({ timeout: 10000 });
      assert.equal(await page.locator('#oc-log').isVisible(), false); assert.equal(await page.locator('#oc-form').isVisible(), false);
      assert.equal(await page.locator('#oc-hist-btn').getAttribute('aria-expanded'), 'true');
      assert.match(await page.locator('.oc-hrow .oc-htitle').first().textContent(), /3rd grade fractions/);
      await noSideScroll(page);
      await shot(page, `k_history_${label}`);
      // Open it again: the conversation is back with its game card.
      await page.locator('.oc-hopen').first().click();
      await page.locator('#oc-log .oc-card').first().waitFor({ timeout: 10000 });
      assert.equal(await page.locator('#oc-hist').isVisible(), false); assert.equal(await page.locator('#oc-form').isVisible(), true);
      // Delete: a second chat in the history, deleted after the question.
      await page.click('#oc-new');
      await page.click('#oc-hist-btn');
      await page.locator('#oc-hist .oc-hrow').first().waitFor();
      const n = await page.locator('#oc-hist .oc-hrow').count();
      await page.locator('.oc-hdel').first().click();
      await page.locator('dialog[open] [data-ob="ok"]').click();
      await page.waitForFunction(m => document.querySelectorAll('#oc-hist .oc-hrow').length === m - 1, n, { timeout: 10000 });
      if (n === 1) assert.match(await page.locator('.oc-hempty').textContent(), /No past chats yet/);
      await page.locator('#oc-hist [data-h="back"]').click();
      assert.equal(await page.locator('#oc-form').isVisible(), true);
      assert.deepEqual(errors, []);
    } finally { await C.allSettled(); CO.reset(teacher); q.run("DELETE FROM oomba_chats WHERE owner_id=? AND surface='companion'", teacher.id); await ctx.close(); }
  }
});

test('no bubble while a game plays, nor for a student', { skip }, async () => {
  const a = await open(teacher, '/play/fraction-factory');
  try { await a.page.waitForTimeout(3000); assert.equal(await a.page.locator('#oc-bubble').count(), 0); await shot(a.page, 'f_play'); } finally { await a.ctx.close(); }
  const ph = await open(teacher, '/play/fraction-factory', PHONE());
  try { await ph.page.waitForTimeout(3000); assert.equal(await ph.page.locator('#oc-bubble').count(), 0); await shot(ph.page, 'f_play_phone'); } finally { await ph.ctx.close(); }
  const b = await open(kids[0], `/class/${cls.id}`);
  try { assert.equal(await b.page.locator('#oc-bubble').count(), 0); assert.equal(await b.page.evaluate(() => document.body.dataset.oc || ''), ''); } finally { await b.ctx.close(); }
});

test('iPhone 13 (dark): the bubble above the tab bar, the panel a sheet with game cards, and the microphone', { skip }, async () => {
  ai();
  config.sttProvider = 'openai'; config.sttApiKey = 'sk-test-companion';
  STT.hooks.fetch = async () => new Response(JSON.stringify({ text: 'Find a short game for my second graders on telling time to the half' }), { status: 200, headers: { 'content-type': 'application/json' } });
  const { ctx, page, errors } = await open(teacher, `/class/${cls.id}`, PHONE(), { dark: true });
  try {
    const bubble = page.locator('#oc-bubble');
    await bubble.waitFor();
    const b = await bubble.boundingBox(), bar = await page.locator('.tabbar').boundingBox();
    assert.ok(b.y + b.height <= bar.y, 'above the tab bar');
    await noSideScroll(page);
    await shot(page, 'a_phone_dark');
    await bubble.click();
    const sheet = await page.locator('#oc').boundingBox();
    assert.ok(sheet.width >= 389 && sheet.y > 100, 'a sheet across the screen');
    // The tab bar steps aside while the chat is open, so the sheet reaches the bottom of the screen; it comes back on close.
    assert.equal(await page.locator('.tabbar').isVisible(), false, 'no tab bar over the chat');
    const vh = page.viewportSize().height;
    assert.ok(sheet.y + sheet.height >= vh - 40, `the sheet reaches the bottom (${sheet.y + sheet.height} of ${vh})`);
    await ask(page, 'Give me a game for 3rd grade fractions, 10 minutes');
    await page.locator('.oc-card').first().waitFor({ timeout: 15000 });
    await page.evaluate(() => { document.getElementById('oc-log').scrollTop = 0; });
    await noSideScroll(page);
    await shot(page, 'g_sheet_dark');
    // The microphone: tap, "Listening", tap stop, the words in the box to edit.
    await page.locator('#oc-new').click();   // no question: the chat goes to the history
    await page.waitForFunction(() => !document.querySelector('#oc-log .oc-card'), null, { timeout: 10000 });
    await page.locator('#oc-mic').waitFor();
    await page.locator('#oc-mic').click();
    await page.locator('#oc-listen').waitFor({ timeout: 5000 }).catch(async e => { throw new Error(`${e.message} err=${await page.locator('#oc-err').textContent()} ${errors.join('|')}`); });
    assert.match(await page.locator('#oc-listen').textContent(), /Listening.*audio isn't kept/s);
    await page.waitForTimeout(1600);
    await shot(page, 'i_mic_phone');
    await page.locator('#oc-mic').click();
    await page.waitForFunction(() => document.getElementById('oc-in').value.includes('telling time'));
    assert.equal(await page.locator('#oc-listen').isVisible(), false);
    assert.deepEqual(errors, []);
  } finally { config.sttProvider = 'openai'; config.sttApiKey = ''; await C.allSettled(); CO.reset(teacher); await ctx.close(); }
});

test('the school settings section (a school admin)', { skip }, async () => {
  const head = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Hana Head', role: 'admin' }).user.id);
  const { ctx, page, errors } = await open(head, `/school/${school.slug}?tab=settings`);
  try {
    await page.locator('#companion-settings').scrollIntoViewIfNeeded();
    await page.fill('#oc-set-steps', '15');
    await page.locator('#companion-settings button[type=submit]').click();
    await page.locator('#companion-settings .err, #companion-settings [role=alert]').first().waitFor({ timeout: 5000 }).catch(() => {});
    assert.equal(CO.limitsOf(head).steps, 8, 'out of bounds: not saved');
    await page.fill('#oc-set-steps', '6');
    await page.locator('#companion-settings button[type=submit]').click();
    await page.waitForTimeout(1200);
    assert.equal(CO.limitsOf(head).steps, 6);
    await page.locator('#companion-settings').scrollIntoViewIfNeeded();
    if (SHOTS) { await page.evaluate(() => { document.querySelector('.topbar').style.position = 'static'; document.getElementById('companion-settings').scrollIntoView(); }); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'k_school_settings.png') }); }
    assert.deepEqual(errors.filter(e => !/400/.test(e)), []);
  } finally { await ctx.close(); }
});

test('laptop: the live microphone streams words into the box as the teacher speaks (greyed), then they settle; audio is never kept', { skip }, async () => {
  ai();
  const prev = { p: config.sttProvider, l: config.sttLive, k: config.sttApiKey };
  config.sttProvider = 'mock'; config.sttLive = true; config.sttApiKey = '';   // the stand-in realtime service (stt.js mock)
  const { ctx, page, errors } = await open(teacher, `/class/${cls.id}`);
  try {
    await page.click('#oc-bubble');
    await page.locator('#oc-mic').waitFor();
    await page.fill('#oc-in', 'Find a game:');
    await page.click('#oc-mic');
    await page.locator('#oc-listen').waitFor();
    assert.match(await page.locator('#oc-listen').textContent(), /Listening.*audio isn't kept/s);
    // Words appear while the teacher speaks: greyed (not final yet), read-only, after what was typed.
    await page.waitForFunction(() => { const b = document.getElementById('oc-in'); return b.classList.contains('interim') && /Find a game: make/.test(b.value); }, null, { timeout: 15000 });
    assert.equal(await page.locator('#oc-in').getAttribute('readonly'), '');
    await page.waitForTimeout(600);
    await shot(page, 'l_mic_live');
    await page.click('#oc-mic');
    await page.waitForFunction(() => { const b = document.getElementById('oc-in'); return !b.classList.contains('interim') && /make the dragon fly faster$/.test(b.value); }, null, { timeout: 15000 });
    assert.equal(await page.locator('#oc-in').getAttribute('readonly'), null, 'editable again');
    assert.equal(await page.locator('#oc-listen').isVisible(), false);
    // Nothing kept: no live session left over, nothing uploaded (the final words came over the socket).
    assert.equal(q.get("SELECT COUNT(*) n FROM stt_live WHERE game_id='companion' AND state='open'").n, 0);
    // Closing the panel while listening stops it at once (no more words go in).
    await page.click('#oc-mic');
    await page.locator('#oc-listen').waitFor();
    await page.click('#oc button[data-c="close"]');
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#oc-mic').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(errors, []);
  } finally { Object.assign(config, { sttProvider: prev.p, sttLive: prev.l, sttApiKey: prev.k }); await C.allSettled(); CO.reset(teacher); await ctx.close(); }
});
