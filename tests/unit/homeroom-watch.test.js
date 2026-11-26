// Homeroom: watching desks and the full catalog (docs/decisions.md "Homeroom: watching desks and the full catalog";
// services/homeroom-watch.js, services/homeroom-tools.js, routes/homeroom.js watchView and deskLists):
//   - a game's small picture: only while class is live and the teacher's board shows that desk (tile or look), within the
//     size and rate caps (a tile 5 s / 24 KB, look 1.5 s / 110 KB), a picture only; never for a student absent or at
//     home, never while Pause screens is on; memory only, gone at End class;
//   - who gets the pictures: the class's teachers and aides (the board's poll); never a student (theirs or another
//     class's), the projector, a sub's link, or another teacher; a student can't send one for someone else;
//   - a Manipulatives tool handed out: its live room for the class (one tool at a time), a card on the targeted desks
//     only, the board gets the student's board and cursor, taken off; the parents' view never lists it;
//   - the left panel's catalog: every Oomba Learn game Find Oomba lessons offers (a live-only one with Host live), each
//     Manipulatives tool, Figures, the teacher's own games, their folders, shared folders and favorites.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.manipulatives = true;
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HV = await import('../../server/services/homeroom-live.js');
const HW = await import('../../server/services/homeroom-watch.js');
const HT = await import('../../server/services/homeroom-tools.js');
const HA = await import('../../server/services/homeroom-aides.js');
const AT = await import('../../server/services/homeroom-attendance.js');
const PV = await import('../../server/services/homeroom-parents.js');
const M = await import('../../server/services/manipulatives.js');
const F = await import('../../server/services/game-folders.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(p, { body, cookie = '' } = {}) {
  const headers = cookie ? { cookie } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, setCookie: r.headers.get('set-cookie') || '' };
}
const as = who => (p, o = {}) => call(p, { ...o, cookie: who ? cookieFor(who.id) : (o.cookie || '') });

const boss = createUser({ username: 'HwBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Watch Oak' }).school;
const staff = name => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff('Ms Rivera'), kim = staff('Mr Kim'), other = staff('Mr Other');
for (const u of [rivera, other]) TOOLS.givePlan(u.id);
const cls = S.createClass(boss, oak.id, { name: 'Room 5', teacherId: rivera.id }).class;
const otherCls = S.createClass(boss, oak.id, { name: 'Room 6', teacherId: other.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const [ava, ben, cleo] = ['Ava Stone', 'Ben Hill', 'Cleo Park'].map(n => kidIn(cls, n));
const eli = kidIn(otherCls, 'Eli Moss');
Object.assign(config, { homeroom: true, homeroomUsers: [rivera, other].map(u => u.username.toLowerCase()), manipulativesUsers: [rivera.username.toLowerCase()] });
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon = '🎮', owner = official, seed = true) {
  const g = games.createGame(owner.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run(`UPDATE games SET status='published', visibility='public', published_version_id=?, ${seed ? "source='seed', shelf='learn'," : ''} slug=?, icon=? WHERE id=?`, v.id, slug, icon, g.id);
  return games.getGame(g.id);
}
// Find Oomba lessons' list is the official Learn games with a subject (learn.js SHELF_INFO): a few of them
const sumRacer = made('Sum Racer', 'sum-racer', '🏎️'), wordHunt = made('Word Hunt', 'word-hunt', '🔎'), atlas = made('Atlas Quest', 'atlas-quest', '🌍'), sudoku = made('Sudoku', 'sudoku', '🔢');
const C = id => `/api/homeroom/${id}`;
const PIC = n => `data:image/webp;base64,${'A'.repeat(n)}`;
const snap = (who, n = 2000, extra = {}) => as(who)(`/api/desk/${cls.id}/snap`, { body: { img: PIC(n), w: 240, h: 150, cur: [0.5, 0.25], on: '', ...extra } });
const boardPoll = (who, qs) => as(who)(`${C(cls.id)}/pulse?hv=${qs ? `&${qs}` : ''}`);

test('pictures: only while live and watched, within the size and rate caps; memory only', async () => {
  // not live: nothing
  assert.equal((await snap(ava)).json.code, 'notLive');
  H.setLive(rivera, cls, 'start');
  HV.pulse(ava, cls, { where: 'game', on: '', idle: 1 });
  // live but nobody watches Ava's desk: refused (the play page's loop stops)
  let r = await snap(ava); assert.equal(r.status, 200); assert.equal(r.json.ok, false); assert.equal(r.json.code, 'notWatched');
  assert.equal(HV.pulse(ava, cls, { where: 'game', idle: 1 }).watch, '');
  // the board shows Ava's and Ben's desks: they are asked for tiles
  r = await boardPoll(rivera, `w=${ava.id},${ben.id}`);
  assert.equal(r.status, 200); assert.deepEqual(r.json.screens, {});
  const ask = HV.pulse(ava, cls, { where: 'game', idle: 1 });
  assert.equal(ask.watch, 'tile'); assert.equal(ask.every, HW.TILE.every); assert.equal(ask.w, HW.TILE.w);
  // a tile: too big, not a picture, a size it never asked for
  assert.equal((await snap(ava, HW.TILE.bytes)).status, 413);
  assert.equal((await snap(ava, 100, { img: 'data:text/html;base64,AAAA' })).status, 400);
  assert.equal((await snap(ava, 100, { img: 'javascript:alert(1)' })).status, 400);
  assert.equal((await snap(ava, 100, { w: 900 })).status, 400);
  r = await snap(ava, 3000); assert.equal(r.status, 200); assert.equal(r.json.watch, 'tile');
  // the next one too soon: slow down
  assert.equal((await snap(ava, 3000)).status, 429);
  // the board gets it once (it says which version it has)
  r = await boardPoll(rivera, `w=${ava.id},${ben.id}`);
  const s = r.json.screens[ava.id];
  assert.ok(s && s.img === PIC(3000) && s.w === 240); assert.deepEqual(s.cur, [0.5, 0.25]);
  assert.equal(r.json.desks[ava.id].sv, s.v);
  r = await boardPoll(rivera, `w=${ava.id}&sv=${ava.id}:${s.v}`);
  assert.deepEqual(r.json.screens, {}, 'nothing new: nothing sent');
  // a desk out of view: its picture is not sent
  r = await boardPoll(rivera, `w=${ben.id}`);
  assert.ok(!r.json.screens[ava.id]);
  // look: larger and sooner
  r = await boardPoll(rivera, `w=${ben.id}&look=${ava.id}`);
  assert.equal(HV.pulse(ava, cls, { where: 'game', idle: 1 }).watch, 'look');
  const room = HW._rooms.get(cls.id); room.snaps.get(ava.id).at -= 10e3;
  r = await snap(ava, HW.TILE.bytes + 5000, { w: 600, h: 380 }); assert.equal(r.status, 200, r.text); assert.equal(r.json.watch, 'look');
  assert.equal((await snap(ava, HW.LOOK.bytes + 10)).status, 413);
  // nothing written anywhere: no table holds it
  const tables = q.all("SELECT name FROM sqlite_master WHERE type='table'").map(x => x.name);
  for (const tb of tables) { const cols = q.all(`PRAGMA table_info(${tb})`).map(c => c.name); for (const c of cols) assert.ok(!q.get(`SELECT 1 FROM "${tb}" WHERE CAST("${c}" AS TEXT) LIKE 'data:image/webp;base64,AAAA%' LIMIT 1`), `${tb}.${c}`); }
  // Pause screens: nobody is watched, pictures go
  H.setLive(rivera, cls, 'pause');
  assert.equal(HV.pulse(ava, cls, { where: 'game', idle: 1 }).watch, '');
  assert.ok(!HW._rooms.get(cls.id), 'pause forgets the pictures');
  H.setLive(rivera, cls, 'resume');
  // absent or at home: never watched
  await boardPoll(rivera, `w=${ava.id},${ben.id}`);
  assert.ok(AT.mark(rivera, cls, ben.id, 'home').ok);
  HV.pulse(ben, cls, { where: 'game', idle: 1 });
  assert.equal(HV.pulse(ben, cls, { where: 'game', idle: 1 }).watch, '');
  assert.equal((await snap(ben)).json.code, 'notWatched');
  assert.ok(AT.mark(rivera, cls, ben.id, '').ok);
  // End class: everything goes
  H.setLive(rivera, cls, 'end');
  assert.ok(!HW._rooms.get(cls.id));
});

test('who gets pictures: the class\'s teachers and aides; never a student, another teacher, the projector or a sub', async () => {
  H.setLive(rivera, cls, 'start');
  assert.ok(HA.addStaff(rivera, cls, kim.id).ok, 'Mr Kim is the class\'s aide');
  await boardPoll(rivera, `w=${ava.id}`);
  HV.pulse(ava, cls, { where: 'game', idle: 1 });
  assert.equal((await snap(ava, 1000)).status, 200);
  // an aide: the board's poll, pictures included
  const ai = await boardPoll(kim, `w=${ava.id}`);
  assert.equal(ai.status, 200); assert.ok(ai.json.screens[ava.id]);
  // a student (of the class, or another class), another teacher, a guest: the site's 404
  for (const who of [ava, eli, other, null]) assert.equal((await boardPoll(who, `w=${ava.id}`)).status, 404, who ? who.username : 'guest');
  // a teacher or another class's student can't send one for this class's desk
  for (const who of [rivera, eli, other]) assert.equal((await as(who)(`/api/desk/${cls.id}/snap`, { body: { img: PIC(100), w: 240, h: 150 } })).status, 404);
  // the desk's own state, See the room and the projector never carry a picture
  const desk = await as(ben)(`/api/desk/${cls.id}/state`);
  assert.ok(!desk.text.includes('data:image/webp'));
  const proj = await as(rivera)(`${C(cls.id)}/state`);
  assert.equal(proj.status, 200); assert.ok(!proj.text.includes('data:image/webp') && !proj.text.includes('"screens"'));
  const projPage = await as(rivera)(`/class/${cls.id}/homeroom/projector`);
  assert.ok(!projPage.text.includes('data:image/webp'));
  // a sub's link: the board's poll is not one of its addresses (403), its own state has no pictures
  const link = await as(rivera)(`${C(cls.id)}/sub-links`, { body: { action: 'create', day: 'today' } });
  assert.equal(link.status, 200, link.text);
  const open = await call(`/sub/${link.json.url.split('/sub/')[1]}`);
  const ck = (open.setCookie.match(/hr_sub=[^;]*/) || [''])[0];
  assert.ok(ck);
  assert.equal((await call(`${C(cls.id)}/pulse?w=${ava.id}`, { cookie: ck })).status, 403);
  const subState = await call('/api/sub/state', { cookie: ck });
  assert.equal(subState.status, 200); assert.ok(!subState.text.includes('data:image/webp'));
  H.setLive(rivera, cls, 'end');
});

test('a Manipulatives tool: its live room, cards on the targeted desks, the board gets the board and cursor', async () => {
  // only the class's teacher who may host Manipulatives
  assert.equal(HT.handOutTool(other, cls, { tool: 'base-ten-blocks', to: { kind: 'all' } }).code, 'notFound');
  assert.equal(HT.handOutTool(rivera, cls, { tool: 'nope', to: { kind: 'all' } }).code, 'badTool');
  const r = await as(rivera)(`${C(cls.id)}/handouts`, { body: { tool: 'base-ten-blocks', to: { kind: 'desk', id: ava.id }, instructions: 'Show 46 with rods and units.' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.tools.length, 1);
  const item = r.json.tools[0];
  assert.equal(item.tool, 'base-ten-blocks'); assert.equal(item.students, 1); assert.ok(item.open);
  const s = M.getSession(item.session);
  assert.equal(s.class_id, cls.id); assert.equal(s.tool, 'base-ten-blocks'); assert.equal(s.status, 'active');
  // the card is on Ava's desk only, and opens the tool's room
  const da = (await as(ava)(`/api/desk/${cls.id}/state`)).json.cards, db = (await as(ben)(`/api/desk/${cls.id}/state`)).json.cards || [];
  const card = da.find(x => x.tool);
  assert.ok(card && card.ready && card.href === `/manipulatives#join/${s.id}` && card.instructions === 'Show 46 with rods and units.');
  assert.ok(!db.some(x => x.tool));
  // another tool while this one's room runs: refused (one Manipulatives room per class)
  assert.equal(HT.handOutTool(rivera, cls, { tool: 'color-tiles', to: { kind: 'all' } }).code, 'oneTool');
  // the same tool to the same desk again: already there
  assert.equal(HT.handOutTool(rivera, cls, { tool: 'base-ten-blocks', to: { kind: 'desk', id: ava.id } }).code, 'alreadyOnDesk');
  // the page in the player: the real Manipulatives page, framed by this site only, no menu
  const pg = await call(`/manipulatives?in=hr`, { cookie: cookieFor(ava.id) });
  assert.equal(pg.status, 200);
  // Ava joins and works in her square, as in any live room
  assert.ok(M.join(ava, { id: s.id }).ok);
  const board = { objects: [], pieces: [{ id: 'p1', kind: 'rod', x: 40, y: 40, rot: 0, color: '#1E88E5', label: '10', value: 10, w: 20, h: 200 }] };
  assert.ok(M.submitWork(ava, s.id, JSON.stringify(board)).ok);
  H.setLive(rivera, cls, 'start');
  HV.pulse(ava, cls, { where: 'tool', on: item.id, idle: 1 });
  const lv = await boardPoll(rivera, `w=${ava.id},${ben.id}`);
  assert.equal(lv.json.desks[ava.id].where, 'tool');
  assert.equal(lv.json.desks[ava.id].tool.slug, 'base-ten-blocks');
  const b = lv.json.boards[ava.id];
  assert.ok(b && b.tool === 'base-ten-blocks' && b.space.w > 100 && JSON.parse(b.state).pieces.length === 1);
  assert.ok(!lv.json.boards[ben.id], 'Ben has no tool');
  // her live-room cursor reaches the board as a place on her square
  const L = (await import('../../public/js/manip-data.js')).roomLayout('base-ten-blocks', {});
  const slot = q.get('SELECT slot FROM manip_work WHERE session_id=? AND user_id=?', s.id, ava.id).slot, rect = L.slot(slot);
  (await import('../../server/services/manip-live.js')).setCursor(s.id, ava.id, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
  const lv2 = await boardPoll(rivera, `w=${ava.id}&mv=${ava.id}:${b.v}`);
  assert.ok(!lv2.json.boards[ava.id], 'the same board: not sent again');
  assert.ok(Array.isArray(lv2.json.bcur[ava.id]) && lv2.json.bcur[ava.id][0] > 0.4 && lv2.json.bcur[ava.id][0] < 0.6);
  // a student's pulse can't claim a tool that isn't on their desk
  HV.pulse(ben, cls, { where: 'tool', on: item.id, idle: 1 });
  assert.equal(HV.liveView(cls).desks[ben.id].tool, undefined);
  // the parents' view never lists the tool
  assert.ok(!PV.classView(ava, cls).handouts.some(x => x.tool || x.id === item.id));
  // a student never sees another desk's board; the projector never carries one
  assert.ok(!(await as(ben)(`/api/desk/${cls.id}/state`)).text.includes('"pieces"'));
  assert.equal((await boardPoll(ava, `w=${ava.id}`)).status, 404);
  H.setLive(rivera, cls, 'end');
  // taken off every desk: the card goes and the room ends
  const off = await as(rivera)(`${C(cls.id)}/handouts/${item.id}/remove`, { body: {} });
  assert.equal(off.status, 200, off.text);
  assert.equal(off.json.tools.length, 0);
  assert.equal(M.getSession(s.id).status, 'ended');
  assert.ok(!((await as(ava)(`/api/desk/${cls.id}/state`)).json.cards || []).some(x => x.tool));
  // now another tool may run
  assert.ok(HT.handOutTool(rivera, cls, { tool: 'color-tiles', to: { kind: 'all' } }).ok);
  // a room that ended by itself (12 hours) opens again when the teacher opens Homeroom
  const it2 = HT.storedOf(cls.id)[0];
  q.run("UPDATE manip_sessions SET status='ended', ended_at=? WHERE id=?", Date.now(), it2.session);
  assert.ok(!(await as(cleo)(`/api/desk/${cls.id}/state`)).json.cards.find(x => x.tool).ready);
  assert.equal((await as(rivera)(`/class/${cls.id}/homeroom`)).status, 200);
  assert.equal(M.getSession(it2.session).status, 'active');
  assert.ok(HT.removeTool(rivera, cls, it2.id).ok);
});

test('the catalog: every Find Oomba lesson, each Manipulatives tool, Figures, own games, folders, shared and favorites', async () => {
  const mine = made('My Fractions Quiz', 'my-fractions-quiz', '🧩', rivera, false);
  const colleague = made('Colleague Maps', 'colleague-maps', '🗺️', other, false);
  const f = F.createFolder(rivera, 'Fractions week'); assert.ok(f.ok);
  assert.ok(F.addGame(rivera, f.folder.id, sudoku.id).ok);
  const sf = F.createFolder(other, 'Grade 5 team'); assert.ok(sf.ok);
  assert.ok(F.addGame(other, sf.folder.id, colleague.id).ok);
  assert.ok(F.shareFolder(other, sf.folder.id, oak.id).ok);
  q.run('INSERT INTO likes(user_id, game_id, created_at) VALUES (?,?,?)', rivera.id, wordHunt.id, Date.now());
  const pg = await as(rivera)(`/class/${cls.id}/homeroom`);
  assert.equal(pg.status, 200);
  const has = (id, label) => assert.ok(pg.text.includes(`data-hritem="${id}"`), label);
  for (const g of [sumRacer, wordHunt, atlas, sudoku]) has(g.id, g.slug);
  has(mine.id, 'own game'); has(colleague.id, 'a shared folder\'s game');
  for (const tl of M.TOOLS) has(`T:manip:${tl.slug}`, tl.slug);
  for (const k of ['data-cgroup="s-math"', 'data-cgroup="s-words"', 'data-cgroup="s-maps"', 'data-cgroup="mine"', 'data-cgroup="fav"', 'data-cgroup="f-0"', 'data-cgroup="sh-0"', 'data-cgroup="m-0"', 'data-cq', 'data-csubj="math"', 'data-csubj="tools"']) assert.ok(pg.text.includes(k), k);
  assert.match(pg.text, /data-q="sum racer math"/);
  assert.match(pg.text, /data-gf="1" data-gt="5"/, 'Sum Racer is for grades 1 to 5');
  // a newly listed item hands out: a Manipulatives tool to Whole class
  const r = await as(rivera)(`${C(cls.id)}/handouts`, { body: { tool: 'fraction-tiles', to: { kind: 'all' } } });
  assert.equal(r.status, 200, r.text);
  assert.ok((await as(cleo)(`/api/desk/${cls.id}/state`)).json.cards.some(x => x.tool === 'fraction-tiles'));
  assert.ok(HT.removeTool(rivera, cls, r.json.tools[0].id).ok);
  // an aide's page has no catalog; a student never gets the page
  assert.ok(!(await as(kim)(`/class/${cls.id}/homeroom`)).text.includes('data-catalog'));
  assert.equal((await as(ava)(`/class/${cls.id}/homeroom`)).status, 404);
});

test('an account deleted: its name goes from the tool handouts, and a handout only it had goes', async () => {
  const AD = await import('../../server/services/account-delete.js');
  const solo = kidIn(cls, 'Gus Lee');
  const a = HT.handOutTool(rivera, cls, { tool: 'rekenreks', to: { kind: 'desk', id: solo.id } }); assert.ok(a.ok, a.code);
  const b = HT.handOutTool(rivera, cls, { tool: 'rekenreks', to: { kind: 'desk', id: cleo.id } }); assert.ok(b.ok, b.code);
  const res = AD.deleteAccount(solo.id, boss, { by: 'admin', parentMade: false, leaveSchools: true });
  assert.ok(res.ok, res.code);
  const left = HT.storedOf(cls.id);
  assert.ok(!JSON.stringify(left).includes(solo.id), 'no trace of the deleted account');
  assert.ok(left.some(x => x.id === b.item.id) && !left.some(x => x.id === a.item.id));
  for (const x of left) HT.removeTool(rivera, cls, x.id);
});
