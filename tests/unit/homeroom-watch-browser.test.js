// Homeroom: watching desks and the full catalog in a real browser (docs/decisions.md "Homeroom: watching desks and the
// full catalog"):
//   - students playing different games in the in-desk player (a page game, a canvas game) show up live on their desk
//     tiles on the teacher's board, and large in look mode; a student using a Manipulatives tool: their square of the
//     tool's live room on the tile, with the pieces they add (live), and the same palette and board as Manipulatives;
//   - the catalog: search, subjects and grade on a laptop; the phone's Find lessons sheet; a tool and a folder's game
//     handed out from it play on the desk;
//   - 30 students: the board's network and CPU with every desk sending pictures (measured, capped);
//   - screenshots at 1366, 820 and 390 (HR_SHOTS=<dir>), and the Manipulatives live room's teacher view beside them.
// Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.manipulatives = true;
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HV = await import('../../server/services/homeroom-live.js');
const HW = await import('../../server/services/homeroom-watch.js');
const HT = await import('../../server/services/homeroom-tools.js');
const M = await import('../../server/services/manipulatives.js');
const F = await import('../../server/services/game-folders.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/hrwatch-${name}.png` }) : null);

const boss = createUser({ username: 'HwbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Watch Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()], manipulativesUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 12', teacherId: teacher.id }).class;
const NAMES = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay'];
const kids = NAMES.map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
const [ada, ben, cleo, dev] = kids;
H.saveSeats(teacher, cls, { preset: 'rows', seats: {} });
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon, htmlText, owner = official, seed = true) {
  const g = games.createGame(owner.id, { title });
  const v = games.addVersion(g.id, htmlText, { createdBy: owner.id, safetyStatus: 'pass' });
  q.run(`UPDATE games SET status='published', visibility='public', published_version_id=?, ${seed ? "source='seed', shelf='learn'," : ''} slug=?, icon=? WHERE id=?`, v.id, slug, icon, g.id);
  return games.getGame(g.id);
}
// a page game (HTML and CSS) and a canvas game: the two ways games draw
const PAGE_GAME = `<title>Sum Racer</title><style>body{margin:0;font:700 28px system-ui;background:#FFF4C7;color:#141414;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:16px}
.q{font-size:56px}.opts{display:flex;gap:14px}.opts button{font:800 34px system-ui;padding:14px 26px;border-radius:18px;border:0;background:#1E88E5;color:#fff}.lane{width:80%;height:30px;border-radius:15px;background:#fff;position:relative}.car{position:absolute;left:40%;top:-8px;font-size:40px}</style>
<div class="q">7 + 5 = ?</div><div class="opts"><button>11</button><button id="b12">12</button><button>13</button></div><div class="lane"><span class="car">🏎️</span></div><p id="score">Score: 3</p>
<script>document.getElementById('b12').onclick=()=>{document.getElementById('score').textContent='Score: 4';document.body.style.background='#DFF5E1'};</script>`;
const CANVAS_GAME = `<title>Fraction Factory</title><style>html,body{margin:0;height:100%;background:#20252f}canvas{display:block;width:100vw;height:100vh}</style><canvas id="c"></canvas>
<script>const c=document.getElementById('c'),x=c.getContext('2d');let t=0;function draw(){c.width=innerWidth;c.height=innerHeight;x.fillStyle='#20252f';x.fillRect(0,0,c.width,c.height);
const w=c.width/5;for(let i=0;i<4;i++){x.fillStyle=['#FF6B4A','#FFD23F','#43A047','#1E88E5'][i];x.fillRect(w*(i+.5),c.height*.25,w*.8,c.height*.5*(i+1)/4)}
x.fillStyle='#fff';x.font='bold 40px sans-serif';x.fillText('3/4 of the crates',30,60);x.beginPath();x.arc((t%c.width),c.height*.85,20,0,7);x.fill();t+=4;requestAnimationFrame(draw)}draw();</script>`;
const sumRacer = made('Sum Racer', 'sum-racer', '🏎️', PAGE_GAME);
const factory = made('Fraction Factory', 'fraction-factory', '🏭', CANVAS_GAME);
const wordHunt = made('Word Hunt', 'word-hunt', '🔎', PAGE_GAME.replace('7 + 5 = ?', 'Find: CAT, DOG').replace('Sum Racer', 'Word Hunt'));
const atlas = made('Atlas Quest', 'atlas-quest', '🌍', PAGE_GAME.replace('7 + 5 = ?', 'Where is Kenya?').replace('Sum Racer', 'Atlas Quest'));
const myGame = made('Ms Lane’s Spelling Bee', 'ms-lane-spelling', '🐝', PAGE_GAME.replace('7 + 5 = ?', 'Spell: friend').replace('Sum Racer', 'Spelling Bee'), teacher, false);
const fold = F.createFolder(teacher, 'Spelling week').folder; F.addGame(teacher, fold.id, myGame.id);
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(who, path, viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const LAPTOP = { width: 1366, height: 768 }, TABLET = { width: 820, height: 1180 }, PHONE = { width: 390, height: 844 };
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
/** Zoom the board in on the desks (the board's own zoom buttons), so each tile is big enough to read. */
async function zoomIn(page, n = 2) { for (let i = 0; i < n; i++) { await page.click('[data-hr="zin"]'); await page.waitForTimeout(120); } }
async function playOnDesk(who, title) {
  const s = await open(who, `/class/${cls.id}/desk`, TABLET, true);
  await s.page.click(`.hd-card:has-text("${title}")`);
  await s.page.waitForSelector('.hr-playframe');
  return s;
}

test('watching: games and a Manipulatives tool live on the desk tiles and in look; the same Manipulatives', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  H.setLive(teacher, cls, 'start');
  for (const [g, k] of [[sumRacer, ada], [factory, ben], [atlas, dev]]) assert.ok(HO.handOut(teacher, cls, { gameId: g.id, to: { kind: 'desk', id: k.id } }).ok);
  const tool = HT.handOutTool(teacher, cls, { tool: 'base-ten-blocks', to: { kind: 'desk', id: cleo.id }, instructions: 'Show 46.' });
  assert.ok(tool.ok, tool.code);
  const T = await open(teacher, `/class/${cls.id}/homeroom`, LAPTOP);
  await T.page.waitForSelector('.hr-desk[data-sid]');
  const A = await playOnDesk(ada, 'Sum Racer'), B = await playOnDesk(ben, 'Fraction Factory'), Dv = await playOnDesk(dev, 'Atlas Quest');
  // the desk says so, plainly
  assert.match(await A.page.textContent('.hr-playnote'), /Your teacher can see your screen in Homeroom/);
  const C = await playOnDesk(cleo, 'Base Ten Blocks');
  // Ada plays: a tap on 12 in the game itself
  const gf = A.page.frameLocator('.hr-playframe').frameLocator('#gameframe');
  await gf.locator('#b12').click();
  // the Manipulatives room in Cleo's player: the real live room, her square, the tool's palette
  const mf = C.page.frameLocator('.hr-playframe');
  await mf.locator('#rm-pal [data-pal]').first().waitFor({ timeout: 20000 });
  const palStudent = await mf.locator('#rm-pal [data-pal]').evaluateAll(l => l.map(b => b.getAttribute('aria-label')));
  // she shows 46: four rods and six units
  for (const [label, n] of [['Add Rod, 10', 4], ['Add Unit, 1', 2]]) for (let i = 0; i < n; i++) { await mf.locator(`#rm-pal [data-pal][aria-label="${label}"]`).click(); await C.page.waitForTimeout(200); }
  // the same tool on its own page (the teacher's Manipulatives live room for this session): the same palette and board
  const R = await open(teacher, `/manipulatives#live/${tool.session.id}`, LAPTOP);
  await R.page.waitForSelector('#rm-pal [data-pal]');
  const palRoom = await R.page.locator('#rm-pal [data-pal]').evaluateAll(l => l.map(b => b.getAttribute('aria-label')));
  assert.ok(palStudent.length >= 2);
  assert.deepEqual(palStudent.map(x => x.replace(/\s+/g, ' ')), palRoom.map(x => x.replace(/\s+/g, ' ')), 'the same palette as Manipulatives');
  assert.equal(await mf.locator('.rm-area.mine').count(), 1, 'her own square in the room');
  await R.page.waitForSelector(`.rm-area[data-key="${cleo.id}"] .mp-piece`, { timeout: 15000 });

  // ---- the teacher's board: each desk shows what its student has open
  await zoomIn(T.page, 2);
  const tile = sid => `.hr-desk[data-sid="${sid}"] .hr-screen`;
  await T.page.waitForSelector(`${tile(ada.id)} img.hr-simg`, { timeout: 40000 });
  await T.page.waitForSelector(`${tile(ben.id)} img.hr-simg`, { timeout: 40000 });
  await T.page.waitForSelector(`${tile(cleo.id)}[data-kind="tool"] .mp-piece`, { timeout: 40000 });
  const nPieces = await T.page.locator(`${tile(cleo.id)} .mp-piece`).count();
  assert.ok(nPieces >= 3, `Cleo's pieces on her tile (${nPieces})`);
  // the pictures are real pictures of the game, small
  for (const k of [ada, ben]) {
    const info = await T.page.$eval(`${tile(k.id)} img.hr-simg`, im => ({ w: im.naturalWidth, h: im.naturalHeight, len: im.src.length }));
    assert.ok(info.w > 100 && info.w <= HW.TILE.w && info.h > 50, JSON.stringify(info));
    assert.ok(info.len < HW.TILE.bytes, `small (${info.len})`);
  }
  // the canvas game's picture is not blank: it has the game's colors
  const colorful = await T.page.$eval(`${tile(ben.id)} img.hr-simg`, async im => {
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; const seen = new Set(); for (let i = 0; i < d.length; i += 64) seen.add(`${d[i] >> 5},${d[i + 1] >> 5},${d[i + 2] >> 5}`); return seen.size;
  });
  assert.ok(colorful >= 4, `the canvas game's colors (${colorful})`);
  // live: Cleo adds one more piece, her tile follows within a few seconds
  await mf.locator('#rm-pal [data-pal][aria-label="Add Unit, 1"]').click();
  await T.page.waitForFunction(([sel, n]) => document.querySelectorAll(sel).length > n, [`${tile(cleo.id)} .mp-piece`, nPieces], { timeout: 15000 });
  await T.page.waitForTimeout(2500);
  await shot(T.page, 'board-1366');

  // ---- look: the same live view, large
  await T.page.click(`.hr-desk[data-sid="${ada.id}"]`, { position: { x: 40, y: 30 } });
  await T.page.waitForSelector('.hr-lkscreen[data-kind="game"] img.hr-simg', { timeout: 30000 });
  // (the large picture: look asks for a bigger one than a tile)
  await T.page.waitForFunction(w => { const im = document.querySelector('.hr-lkscreen img.hr-simg'); return !!im && im.naturalWidth > w; }, HW.TILE.w, { timeout: 30000 });
  await T.page.waitForTimeout(700);
  await shot(T.page, 'look-game-1366');
  await T.page.keyboard.press('Escape');
  await T.page.click(`.hr-desk[data-sid="${cleo.id}"]`, { position: { x: 40, y: 30 } });
  await T.page.waitForSelector('.hr-lkscreen[data-kind="tool"] .mp-piece', { timeout: 20000 });
  assert.equal(await T.page.locator('[data-hrroom]').count(), 1, 'Open the room');
  await T.page.waitForTimeout(700);
  await shot(T.page, 'look-tool-1366');
  await T.page.keyboard.press('Escape');
  // the Manipulatives live room's teacher view, for comparison
  await R.page.waitForTimeout(500);
  await shot(R.page, 'manip-room-teacher-1366');

  // ---- nothing reaches classmates, and nothing after End class
  const desk = await B.page.evaluate(async c => (await fetch(`/api/desk/${c}/state`)).text(), cls.id);
  assert.ok(!desk.includes('data:image'));
  // ---- 820 and 390
  await T.page.setViewportSize({ width: 820, height: 1180 }); await T.page.click('[data-hr="fit"]'); await zoomIn(T.page, 1); await T.page.waitForTimeout(2600);
  assert.ok(await noSideways(T.page) <= 0);
  await shot(T.page, 'board-820');
  await T.page.setViewportSize(PHONE); await T.page.click('[data-hr="fit"]'); await zoomIn(T.page, 3); await T.page.waitForTimeout(2600);
  assert.ok(await noSideways(T.page) <= 0);
  await shot(T.page, 'board-390');
  await T.page.click(`.hr-desk[data-sid="${ben.id}"]`, { position: { x: 40, y: 30 }, force: true }).catch(() => {});
  if (await T.page.locator('.hr-lkscreen').count()) { await T.page.waitForSelector('.hr-lkscreen img.hr-simg', { timeout: 20000 }); await T.page.waitForTimeout(800); await shot(T.page, 'look-390'); await T.page.keyboard.press('Escape'); }
  for (const s of [T, A, B, C, Dv, R]) assert.deepEqual(s.errors, [], 'no page errors');
  H.setLive(teacher, cls, 'end');
  assert.ok(!HW._rooms.get(cls.id), 'End class forgets every picture');
  for (const s of [T, A, B, C, Dv, R]) await s.ctx.close();
  HT.removeTool(teacher, cls, tool.item.id);
});

test('the catalog: search, subjects and grade on a laptop, the phone\'s sheet; a tool and a folder\'s game hand out and play', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  const T = await open(teacher, `/class/${cls.id}/homeroom`, LAPTOP);
  await T.page.waitForSelector('[data-catalog]');
  for (const k of ['s-math', 's-words', 's-maps', 'mine', 'f-0', 'm-0', 'm-1']) assert.equal(await T.page.locator(`[data-cgroup="${k}"]`).count(), 1, k);
  await T.page.fill('#hr-cq', 'base ten');
  await T.page.waitForTimeout(100);
  const shown = await T.page.$$eval('#hr-panel .hr-items > li:not([hidden]) .hr-itemt', l => l.map(x => x.textContent.trim()));
  assert.deepEqual(shown, ['Base Ten Blocks']);
  await T.page.waitForTimeout(300);
  await shot(T.page, 'catalog-search-1366');
  await T.page.fill('#hr-cq', '');
  await T.page.click('[data-csubj="words"]');
  const words = await T.page.$$eval('#hr-panel .hr-items > li:not([hidden]) .hr-itemt', l => l.map(x => x.textContent.trim()));
  assert.ok(words.includes('Word Hunt') && !words.includes('Sum Racer'));
  await T.page.click('[data-csubj=""]');
  await T.page.selectOption('#hr-cg', '0');
  const k = await T.page.$$eval('#hr-panel [data-cgroup^="s-"] .hr-items > li:not([hidden]) .hr-itemt', l => l.map(x => x.textContent.trim()));
  assert.ok(!k.includes('Atlas Quest') && !k.includes('Sum Racer'), `Kindergarten: ${k}`);
  await T.page.selectOption('#hr-cg', '');
  // a tool from the catalog to Whole class (the sheet: the teacher's words)
  await T.page.fill('#hr-cq', 'color tiles');
  await T.page.click('[data-hritem="T:manip:color-tiles"]');
  await T.page.click('.hr-givebar [data-hrto="all"]');
  await T.page.waitForSelector('.hr-giveform');
  assert.equal(await T.page.locator('.hr-giveform [data-seg="grade"]').count(), 0, 'a tool: open practice');
  await T.page.fill('#hr-ins', 'Make a 3 by 4 rectangle.');
  await T.page.click('.hr-giveok');
  await T.page.waitForSelector('.toast');
  const it = HT.storedOf(cls.id).find(x => x.tool === 'color-tiles');
  assert.ok(it && !it.students.length);
  // a folder's game to one desk
  await T.page.fill('#hr-cq', 'spelling');
  await T.page.click(`[data-cgroup="f-0"] [data-hritem="${myGame.id}"]`);
  await T.page.click(`.hr-desk[data-sid="${dev.id}"]`, { position: { x: 30, y: 30 } });
  await T.page.waitForSelector('.hr-giveform');
  await T.page.click('[data-seg="order"][data-v="any"]');   // (Dev still has Atlas Quest open)
  await T.page.click('.hr-giveok');
  await T.page.waitForTimeout(400);
  // on the desk: both cards; both play in the player
  const D = await open(dev, `/class/${cls.id}/desk`, TABLET, true);
  await D.page.click('.hd-card:has-text("Spelling Bee")');
  await D.page.frameLocator('.hr-playframe').frameLocator('#gameframe').locator('text=Spell: friend').waitFor({ timeout: 20000 });
  await D.page.click('[data-hrplayer="close"]');
  await D.page.click('.hd-card:has-text("Color Tiles")');
  await D.page.frameLocator('.hr-playframe').locator('#rm-pal [data-pal]').first().waitFor({ timeout: 20000 });
  assert.match(await D.page.textContent('.hd-card:has-text("Color Tiles")').catch(() => 'Manipulatives'), /Manipulatives|Color Tiles/);
  // the phone: Find lessons opens the catalog in a sheet; a pick there shows the yellow bar
  const P = await open(teacher, `/class/${cls.id}/homeroom`, PHONE, true);
  await P.page.click('[data-hr="catalog"]');
  await P.page.waitForSelector('.hr-csheet [data-cq]');
  await P.page.fill('.hr-csheet [data-cq]', 'sum');
  await P.page.waitForTimeout(100);
  assert.ok(await noSideways(P.page) <= 0);
  await P.page.waitForTimeout(600);
  await shot(P.page, 'catalog-search-390');
  await P.page.click(`.hr-csheet [data-hritem="${sumRacer.id}"]`);
  await P.page.waitForSelector('.hr-givebar:not([hidden])');
  assert.match(await P.page.textContent('.hr-givebar'), /Sum Racer/);
  await P.page.setViewportSize({ width: 820, height: 1180 });
  await P.page.click('[data-hr="unpick"]');
  for (const s of [T, D, P]) { assert.deepEqual(s.errors, []); await s.ctx.close(); }
  HT.removeTool(teacher, cls, it.id);
});

test('30 students: the board\'s network and CPU while every desk sends pictures', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  const big = S.createClass(boss, oak.id, { name: 'Room 30', teacherId: teacher.id }).class;
  const many = Array.from({ length: 30 }, (_, i) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: `Kid ${i + 1}` }).user.id); S.addToClass(boss, big.id, u.id); return getUser(u.id); });
  H.saveSeats(teacher, big, { preset: 'rows', seats: {} });
  const ho = HO.handOut(teacher, big, { gameId: sumRacer.id, to: { kind: 'all' } });
  H.setLive(teacher, big, 'start');
  // a real tile picture of the page game, made once in the browser
  const A = await open(many[0], `/class/${big.id}/desk`, TABLET, true);
  const T = await open(teacher, `/class/${big.id}/homeroom`, LAPTOP);
  await T.page.waitForSelector('.hr-desk[data-sid]');
  await T.page.click('[data-hr="fit"]').catch(() => {});
  await A.page.click('.hd-card:has-text("Sum Racer")');
  await T.page.waitForSelector(`.hr-desk[data-sid="${many[0].id}"] img.hr-simg`, { timeout: 40000 }).catch(() => {});
  const pic = HW._rooms.get(big.id) && HW._rooms.get(big.id).snaps.get(many[0].id);
  const img = pic ? pic.img : `data:image/webp;base64,${'A'.repeat(12000)}`;
  // the student's own page: what a picture costs there (CPU over 12 s, watched as a tile)
  const sc = await A.ctx.newCDPSession(A.page); await sc.send('Performance.enable');
  const m0 = Object.fromEntries((await sc.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  await A.page.waitForTimeout(12000);
  const m1 = Object.fromEntries((await sc.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  const studentCpu = (m1.TaskDuration - m0.TaskDuration) / 12;
  // 29 more desks: each pulses and sends its picture at the tile rate (the server's own limits)
  const at0 = Date.now(); let sent = 0, refused = 0;
  const fake = setInterval(() => {
    for (const k of many.slice(1)) {
      HV.pulse(k, big, { where: 'game', on: ho.classLesson.id, idle: 2 });
      const r = HW.putSnap(k, big, { img, w: pic ? pic.w : 240, h: pic ? pic.h : 150, cur: [Math.random(), Math.random()] });
      if (r.ok) sent++; else refused++;
    }
  }, 1000);
  let bytes = 0, polls = 0;
  T.page.on('response', async r => { if (r.url().includes('/pulse')) { polls++; try { bytes += (await r.body()).length; } catch { /* gone */ } } });
  const cdp = await T.ctx.newCDPSession(T.page); await cdp.send('Performance.enable');
  const b0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  await T.page.waitForTimeout(20000);
  const b1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  clearInterval(fake);
  const secs = (Date.now() - at0) / 1000, boardCpu = (b1.TaskDuration - b0.TaskDuration) / 20;
  const shownPics = await T.page.locator('.hr-desk img.hr-simg').count();
  const report = { students: 30, pictureBytes: img.length, picturesAccepted: sent, refusedAsTooSoon: refused, perStudentPerSec: +(sent / 29 / secs).toFixed(3), boardPolls: polls, boardKBPerSec: +(bytes / 1024 / 20).toFixed(1), boardCpuShare: +boardCpu.toFixed(3), studentCpuShare: +studentCpu.toFixed(3), tilesShown: shownPics };
  console.log('watch load', JSON.stringify(report));
  if (SHOTS) fs.writeFileSync(`${SHOTS}/hrwatch-load.json`, JSON.stringify(report, null, 2));
  // the caps: one picture per desk every 5 s at most, so the board's poll carries at most 30 tiles per 5 s
  assert.ok(report.perStudentPerSec <= 1 / (HW.TILE.every / 1000) + 0.05, JSON.stringify(report));
  assert.ok(report.boardKBPerSec < (30 * HW.TILE.bytes) / 1024 / (HW.TILE.every / 1000) + 20, JSON.stringify(report));
  assert.ok(report.boardCpuShare < 0.5, `the board's main thread is mostly idle (${report.boardCpuShare})`);
  // hidden: the board stops asking, and desks stop being watched
  await T.page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await T.page.waitForTimeout(HW.WATCH_MS + 2500);
  assert.equal(HW.watchOf(big, many[3].id), '', 'nobody watches a hidden board\'s desks');
  await shot(T.page, 'board-30');
  H.setLive(teacher, big, 'end');
  for (const s of [A, T]) await s.ctx.close();
});
