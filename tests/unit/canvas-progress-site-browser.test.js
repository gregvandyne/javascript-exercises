// A Builder classroom activity (Oomba Canvas 1.6.1) as a lesson step, on the real site in Chromium: the owner's fifth
// audit (docs/decisions.md "Oomba Canvas 1.6.1: audit 5"). Jamie answered all 8 problems of "Barnyard Add-Up" and left
// with "Back to the lesson" without pressing "See my stars"; the step stayed "Started" and the teacher's Progress read
// 0/1 with no score. Now the kit calls BRB.setProgress as each problem is settled: the step is started at the first and
// done, with its score, at the last, end card or not. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const games = await import('../../server/services/games.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const { q } = await import('../../server/db.js');
const { canvasTag, CANVAS_LATEST } = await import('../../server/services/canvaskit.js');

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;

const boss = createUser({ username: 'BarnBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Barnyard Primary' }).school;
const teacher = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Mr Field', role: 'teacher' }).user.id);
const cls = S.createClass(boss, school.id, { name: '3c maths', teacherId: teacher.id }).class;
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

// "Barnyard Add-Up": column addition, Guided, fixed problems (the tens carry into the hundreds in two of them)
const PROBLEMS = [[64, 58], [93, 19], [27, 15], [46, 38]].map(([a, b]) => ({ tool: 'digits.add', a, b, story: 'The barn has {a} hens and {b} ducks. How many birds?' }));
const DATA = {
  config: { lang: 'en', support: 'guided', supports: ['guided'], count: PROBLEMS.length, fresh: false },
  task: { title: 'Barnyard Add-Up', say: 'Add the animals in the barn.', theme: { icon: '🐄', cheers: ['Moo-velous!'], end: 'Every animal is counted.' } },
  problems: PROBLEMS, gen: null, steps: {}, hints: {},
};
const PAGE = `<title>Barnyard Add-Up</title>\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(DATA)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
const game = games.createGame(teacher.id, { title: 'Barnyard Add-Up', icon: '🐄', cover: 'mint', category: 'learning' });
const ver = games.addVersion(game.id, PAGE, { notes: 'Builder: made', createdBy: teacher.id, safetyStatus: 'pass' });
q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", ver.id, game.id);

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

test('a student who answers every problem and leaves before the end card is done, with the score; the teacher sees it', { skip, timeout: 180e3 }, async () => {
  assert.equal(CANVAS_LATEST, '1.6.1');
  const lesson = L.createLesson(teacher, school.id, { title: 'Barnyard Add-Up' }).lesson;
  const step = L.addStep(teacher, lesson.id, { kind: 'game', gameId: game.id, body: 'Play it' }).step;
  const cl = L.assign(teacher, cls.id, lesson.id, {}).classLesson;
  const kid = S.createSchoolAccount(teacher, school.id, { rosterName: 'Jamie Lee' }).user; S.addToClass(teacher, cls.id, kid.id);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const [name, value] = cookieOf(kid.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/play/${games.getGame(game.id).slug}?lesson=${cl.id}&step=${step.id}`);
  const f = page.frameLocator('#gameframe');
  await f.locator('.oc-dbox').first().waitFor({ timeout: 60e3 });
  const row = () => P.get(cl.id, step.id, kid.id) || {};
  const waitFor = async ok => { for (let i = 0; i < 50 && !ok(row()); i++) await page.waitForTimeout(100); return row(); };
  for (const [n, p] of PROBLEMS.entries()) {
    // the keyboard only: the ones box, then the digits (the kit moves to the tens, then the hundreds)
    await f.locator('.oc-dbox[data-col="0"]').click();
    for (const d of String(p.a + p.b).split('').reverse()) await page.keyboard.press(d);
    await f.locator('.oc-band .oc-primary').click();
    assert.match(await f.locator('.oc-fb').textContent(), /^Right!/, `problem ${n + 1}`);
    if (n === 0) {
      const r = await waitFor(x => x.label);
      assert.deepEqual([r.status, r.score, r.label], ['started', 1, `part:1/${PROBLEMS.length}`], 'started with the first, with its score');
    }
    if (n < PROBLEMS.length - 1) await f.locator('.oc-band .oc-primary').click();   // Next
  }
  // the last one is right; Jamie leaves without Next (no end card, no "See my stars")
  const r = await waitFor(x => x.status === 'done');
  assert.equal(await f.locator('.oc-end').isVisible(), false, 'the end card was never shown');
  await page.goto(`${BASE}/`);
  assert.deepEqual([r.status, r.score], ['done', PROBLEMS.length], 'done, with the score');
  assert.deepEqual(errors, []);
  await ctx.close();
  // the teacher's Progress page: done, with the score (never 0/1 and "–")
  const t = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const [tn, tv] = cookieOf(teacher.id).split('='); await t.addCookies([{ name: tn, value: tv, url: BASE }]);
  const tp = await t.newPage();
  await tp.goto(`${BASE}/class/${cls.id}/progress/${cl.id}`);
  const tr = tp.locator('tr', { hasText: 'Jamie Lee' }).first();
  assert.match(await tr.innerHTML(), /st-done/);
  assert.match(await tr.locator('.st-score').innerText(), new RegExp(`^${PROBLEMS.length}`));
  await t.close();
});
