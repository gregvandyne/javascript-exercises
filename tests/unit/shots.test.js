// Screenshots: Studio games get a real cover picture, only the right people can see it, and the Builder's playtest
// tool shows the model pictures and problems. Needs a local Chromium; skipped when there is none.
import fs from 'node:fs';
import os from 'node:os';
const LOCAL = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_SNAPSHOTS = '1'; if (exe) process.env.BRB_CHROMIUM = exe;
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-shots-');
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const { createUser, startSession } = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const shots = await import('../../server/services/shots.js');
const snapshot = await import('../../server/services/snapshot.js');
const { toolbox } = await import('../../server/builder/tools.js');
const { createApp } = await import('../../server/app.js');
const { templateHtml } = await import('../../server/builder/catalog.js');
const { config } = await import('../../server/config.js');
const http = await import('node:http');

const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await snapshot.closeBrowser(); });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const owner = createUser({ username: 'ShotOwner', password: 'secret123' });
const other = createUser({ username: 'ShotOther', password: 'secret123' });

test('a Studio version gets a cover picture; strangers only ever see the live one', { skip, timeout: 90_000 }, async () => {
  const g = games.createGame(owner.id, { title: 'Catch' });
  const { html } = await templateHtml('catch');
  const v = games.addVersion(g.id, html, { createdBy: owner.id, safetyStatus: 'pass' });
  assert.equal(await shots.takeShot(v.id), true);
  assert.ok(fs.statSync(shots.fileFor(v.id)).size > 5000, 'a real JPEG');
  const url = shots.urlFor(v.id); assert.match(url, new RegExp(`^/shots/${v.id}\\.jpg\\?v=`));
  const get = (u, who) => fetch(base + u, { headers: who ? { cookie: cookieFor(who.id) } : {} });
  // draft: owner yes, others no; the card art uses the picture only in the owner's draft view
  assert.equal((await get(url, owner)).status, 200);
  assert.equal((await get(url, other)).status, 404);
  assert.equal((await get(url)).status, 404);
  let row = games.getGame(g.id);
  const { coverArt } = await import('../../server/views/components.js');
  assert.doesNotMatch(String(coverArt(row)), /\/shots\//, 'not live yet');
  assert.match(String(coverArt(row, '', { draft: true })), /\/shots\//);
  // live and public: everyone, cacheable
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
  row = games.getGame(g.id);
  assert.match(String(coverArt(row)), new RegExp(`/shots/${v.id}`));
  const r = await get(url); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/jpeg'); assert.match(r.headers.get('cache-control'), /public/);
  assert.match(await (await get(`/g/${row.slug}`)).text(), new RegExp(`/shots/${v.id}\\.jpg`), 'the game page shows it');
  // an unreviewed update never leaks: its picture stays private
  const v2 = games.addVersion(g.id, html.replace('</title>', ' 2</title>'), { createdBy: owner.id, safetyStatus: 'pass' });
  await shots.takeShot(v2.id);
  assert.equal((await get(shots.urlFor(v2.id), other)).status, 404);
  // deleted: gone for players
  games.deleteGame(g.id);
  assert.equal((await get(url)).status, 404);
  // garbage ids
  assert.equal((await get('/shots/..%2Fbrb.db')).status, 404);
});

test('the sweeper finds live versions without a picture; seed and failed versions are skipped', { skip }, () => {
  const g = games.createGame(owner.id, { title: 'Swept' });
  const v = games.addVersion(g.id, '<title>x</title><p>hi</p>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
  const s = games.createGame(owner.id, { title: 'Seedy', source: 'seed' });
  const sv = games.addVersion(s.id, '<title>x</title>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", sv.id, s.id);
  const rows = q.all('SELECT id FROM game_versions WHERE shot_at=0').map(r => r.id);
  assert.ok(rows.includes(v.id));
  assert.ok(shots.sweep(50) >= 1);
});

test('playtest_game shows the model two pictures, the errors and the layout problems', { skip, timeout: 90_000 }, async () => {
  const g = games.createGame(owner.id, { title: 'Broken' });
  games.addVersion(g.id, `<title>Broken</title><style>.wide{width:900px;background:#f60;height:40px}</style>
    <div class="wide">This line is far too wide for a phone screen and runs off the side</div>
    <button style="width:20px;height:20px">x</button><button id="go" style="width:200px;height:80px" onclick="boom()">Play</button>
    <script>setTimeout(()=>{ undefinedThing.call(); }, 100)</script>`, { createdBy: owner.id, safetyStatus: 'pass' });
  const events = [];
  const tb = toolbox({ user: owner, gameId: g.id, emit: (n, d) => events.push([n, d]), state: {}, locale: 'en' });
  const r = await tb.exec('playtest_game', {});
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.forModel)); assert.equal(r.forModel.filter(b => b.type === 'image').length, 2);
  const text = r.forModel[0].text;
  assert.match(text, /undefinedThing/); assert.match(text, /boom/);
  assert.match(text, /wider than the phone/); assert.match(text, /div\.wide> from x=0 to x=900/); assert.match(text, /smaller than 40px/); assert.match(text, /__brbTest is missing/);
  assert.match(text, /tapped "Play"/);
  assert.deepEqual(events.map(e => e[0]), ['progress', 'playtest']);
});

test('screenshot worker down, busy or refusing the token: no try is used up (covers come later); a game it cannot run uses one', async () => {
  let status = 401;
  const fake = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(status, { 'content-type': 'application/json' }); res.end('{"error":"x"}'); }); }).listen(0);
  await new Promise(r => fake.once('listening', r));
  const saved = { url: config.snapshotUrl, token: config.shotsToken };
  const g = games.createGame(owner.id, { title: 'Waits' });
  const v = games.addVersion(g.id, '<title>w</title><p>hi</p>', { createdBy: owner.id, safetyStatus: 'pass' });
  const tries = () => q.get('SELECT shot_tries FROM game_versions WHERE id=?', v.id).shot_tries;
  try {
    config.snapshotUrl = `http://127.0.0.1:${fake.address().port}`; config.shotsToken = 'not-the-workers';
    await assert.rejects(snapshot.runGame('<p>x</p>'), e => e.workerDown === true && /refused SHOTS_TOKEN \(401\)/.test(e.message));
    assert.equal(await shots.takeShot(v.id), false); assert.equal(tries(), 0, 'wrong token');
    status = 503;
    assert.equal(await shots.takeShot(v.id), false); assert.equal(tries(), 0, 'busy');
    status = 500;   // the worker ran the game and it failed (froze, never loaded): that counts
    assert.equal(await shots.takeShot(v.id), false); assert.equal(tries(), 1);
    await new Promise(r => fake.close(r));
    await assert.rejects(snapshot.runGame('<p>x</p>'), e => e.workerDown === true && /^screenshot worker unreachable \((ECONNREFUSED|UND_ERR_SOCKET)\)$/.test(e.message));
    assert.equal(await shots.takeShot(v.id), false); assert.equal(tries(), 1, 'worker down');
    // The Builder's playtest says playtesting is unavailable instead of blaming the game.
    const tb = toolbox({ user: owner, gameId: g.id, emit: () => {}, state: {}, locale: 'en' });
    const pt = await tb.exec('playtest_game', {});
    assert.equal(pt.ok, false); assert.match(pt.forModel, /not available on this server right now/);
    // BRB_SNAPSHOTS=0 turns screenshots off even with a worker named.
    assert.equal(snapshot.enabled(), true);
    config.snapshotsOff = true;
    assert.equal(snapshot.enabled(), false);
  } finally { config.snapshotUrl = saved.url; config.shotsToken = saved.token; config.snapshotsOff = false; fake.close(); }
});

test('a job that runs past the time limit waited in the worker\'s queue: busy, so no try is used up', async () => {
  const fake = http.createServer(() => {}).listen(0);   // takes the job and never answers
  await new Promise(r => fake.once('listening', r));
  const saved = { url: config.snapshotUrl, token: config.shotsToken };
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    config.snapshotUrl = `http://127.0.0.1:${fake.address().port}`; config.shotsToken = 'tok';
    const p = snapshot.runGame('<p>x</p>');
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    mock.timers.tick(56_000);
    await assert.rejects(p, e => e.workerDown === true && /timed out \(busy\)/.test(e.message));
  } finally { mock.timers.reset(); config.snapshotUrl = saved.url; config.shotsToken = saved.token; fake.closeAllConnections(); fake.close(); }
});
