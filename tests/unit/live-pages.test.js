// Oomba Live pages (routes/live.js, views/live.js): one /join for live codes and class codes, nothing sold on player
// pages, no profile links in the host's roster, the landing for hosts only, traffic never counted, the flag.
import { reset, call, open, config, teacher, mum, kid, mia, cls, L, S, LS, publish, liveHtml, official } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const traffic = await import('../../server/services/traffic.js');
const { q } = await import('../../server/db.js');
const SOLD = /plans|price|€|\$|upgrade|checkout|subscribe/i;
const visible = html => html.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, '');

test.beforeEach(() => reset());

test('/join: one code box (live 7 digits, class codes go on); live codes move to the #fragment; bare page, nothing sold', async () => {
  const r = await call('/join');
  assert.equal(r.status, 200);
  assert.match(r.text, /id="jc" name="code"/); assert.match(r.text, /inputmode="numeric"/);
  assert.match(r.text, /data-lv-join/); assert.match(r.text, /id="lv-card-step" hidden/);
  assert.doesNotMatch(r.text, /class="topbar"|class="foot"/, 'no menus, no footer');
  assert.doesNotMatch(visible(r.text), SOLD);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.getSetCookie().length, 0, 'no cookie for a visitor');
  const data = JSON.parse(r.text.match(/id="lv-join-data">(.*?)<\/script>/)[1]);
  assert.equal(data.nicks.length, 144); assert.ok(data.msgs.notFound);
  const fwd = await call('/join?code=482%209137');
  assert.equal(fwd.status, 302); assert.equal(fwd.headers.get('location'), '/join#4829137');
  assert.equal((await call('/join/4829137')).headers.get('location'), '/join#4829137');
  // Google sign-in off: a class code has nowhere to go, so the page says the code looks wrong.
  const cls = await call('/join?code=ABC234');
  assert.equal(cls.status, 200); assert.match(cls.text, /7 numbers/);
});

test('flag off: /join is the class flow only (404 without Google), live pages and APIs 404, no section on /parents', async () => {
  config.liveClassroom = false;
  assert.equal((await call('/join')).status, 404);
  assert.equal((await call('/live', { user: teacher })).status, 404);
  assert.equal((await call('/api/live/join', { method: 'POST', body: { code: '1234567' } })).status, 404);
  assert.doesNotMatch((await call('/parents')).text, /id="live"/);
  assert.doesNotMatch((await call('/teachers')).text, /id="live"/);
  config.liveClassroom = true;
  assert.match((await call('/parents')).text, /id="live"/);
  assert.match((await call('/teachers')).text, /id="live"/);
});

test('/live: hosts only (others go to /join); the landing posts to /api/live/sessions and opens the host page', async () => {
  assert.equal((await call('/live', { user: kid })).headers.get('location'), '/join');
  assert.equal((await call('/live', { user: mia })).headers.get('location'), '/join');
  const page = await call('/live', { user: teacher });
  assert.equal(page.status, 200); assert.match(page.text, /data-api="\/api\/live\/sessions"/); assert.match(page.text, /value="mode:quest-race"/);
  assert.match(page.text, /<option value="bank" selected>/, "the question bank is the default");
  assert.match(page.text, /name="bankSubject"/); assert.match(page.text, /name="bankLevel"/);
  const r = await call('/api/live/sessions', { method: 'POST', user: teacher, body: { pick: 'mode:quest-race', set: 'starter:science', audience: 'open', maxPlayers: '20' } });
  assert.equal(r.status, 200, r.text); assert.match(r.json.redirect, /^\/live\/host\//);
  const again = await call('/api/live/sessions', { method: 'POST', user: teacher, body: { pick: 'mode:battle', set: 'starter:geo', audience: 'open' } });
  assert.equal(again.status, 409); assert.equal(again.json.code, 'hasOpen'); assert.ok(again.json.error);
  assert.equal((await call('/api/live/sessions', { method: 'POST', user: kid, body: { pick: 'mode:battle' } })).status, 404);
  const s = LS.get(r.json.sid);
  assert.equal(s.settings.maxPlayers, 20);
  // The host page: code (left to right, grouped), QR, roster without links, controls with keyboard shortcuts.
  const host = await call(r.json.redirect, { user: teacher });
  assert.equal(host.status, 200);
  assert.match(host.text, new RegExp(`<p class="lv-bigcode" id="lv-code" dir="ltr" translate="no">${s.code.slice(0, 3)} ${s.code.slice(3)}</p>`));
  assert.match(host.text, /<svg[^>]+shape-rendering="crispEdges"/);
  assert.match(host.text, /data-lv-act="start" aria-keyshortcuts="S"/);
  const roster = host.text.match(/<section class="lv-rosterbox"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(roster, /<a\b/, 'no links in the roster');
  assert.equal((await call(r.json.redirect, { user: mum })).status, 404, 'only the host');
});

test('/live/play: bare, nothing sold, fixed report reasons, emotes are buttons', async () => {
  const s = open(teacher, { mode: 'battle', starter: 'geo', audience: 'open' });
  const r = await call(`/live/play/${s.id}`);
  assert.equal(r.status, 200);
  assert.doesNotMatch(visible(r.text), SOLD);
  assert.doesNotMatch(r.text, /class="topbar"|class="foot"/);
  assert.equal((r.text.match(/data-report="/g) || []).length, 4);
  assert.equal((r.text.match(/data-emote="/g) || []).length, 6);
  assert.doesNotMatch(r.text, /<textarea|type="text"/, 'nothing to type');
  assert.equal((await call('/live/play/nope')).status, 404);
});

test('reports: fixed reasons, never who sent them; the host hears about it', async () => {
  const s = open(teacher, { mode: 'battle', starter: 'geo', audience: 'open' });
  const j = await call('/api/live/join', { method: 'POST', body: { code: s.code } });
  assert.equal((await call('/api/live/report', { method: 'POST', body: { tok: j.json.tok, reason: 'rude words here' } })).status, 400);
  const r = await call('/api/live/report', { method: 'POST', body: { tok: j.json.tok, reason: 'scary' } });
  assert.equal(r.status, 200);
  const row = q.get('SELECT * FROM live_reports ORDER BY created_at DESC LIMIT 1');
  assert.equal(row.reason, 'scary'); assert.equal(row.host_id, teacher.id);
  assert.ok(!JSON.stringify(row).includes(j.json.tok.slice(0, 16)));
  assert.deepEqual(Object.keys(row).sort(), ['created_at', 'game_id', 'host_id', 'id', 'items', 'reason', 'resolved_at', 'resolved_by', 'set_id', 'version_id']);
  for (let i = 0; i < 2; i++) await call('/api/live/report', { method: 'POST', body: { tok: j.json.tok, reason: 'other' } });
  assert.equal((await call('/api/live/report', { method: 'POST', body: { tok: j.json.tok, reason: 'other' } })).status, 429);
});

test('visits to /join and /live are never counted', () => {
  for (const p of ['/join', '/live', '/live/play/x', '/live/host/x']) {
    let counted = true;
    traffic.countVisits({ method: 'GET', path: p, headers: { accept: 'text/html' } }, {}, () => { counted = false; });
    assert.equal(counted, false, p);
  }
});

test('question sets: hosts make, list and archive them; rude or personal text is refused; drafts from a lesson can\'t be hosted', async () => {
  const bad = await call('/api/live/sets', { method: 'POST', user: teacher, body: { title: 'Mine', items: [{ q: 'Call me on 555 123 4567', choices: ['a', 'b'], answer: 0, secs: 20 }] } });
  assert.equal(bad.status, 400); assert.equal(bad.json.code, 'question'); assert.match(bad.json.error, /1/);
  const same = await call('/api/live/sets', { method: 'POST', user: teacher, body: { title: 'Mine', items: [{ q: 'Pick', choices: ['a', 'A'], answer: 0, secs: 20 }] } });
  assert.equal(same.json.code, 'sameChoice');
  const ok = await call('/api/live/sets', { method: 'POST', user: teacher, body: { title: 'Fractions', items: [{ q: 'Half of 8?', choices: ['4', '2', '6'], answer: 0, secs: 20 }] } });
  assert.equal(ok.status, 200);
  const list = await call('/api/live/sets', { user: teacher });
  assert.equal(list.json.mine[0].title, 'Fractions'); assert.equal(list.json.mine[0].ready, true);
  assert.equal((await call(`/api/live/sets/${ok.json.id}`, { user: mum })).status, 404, 'not someone else\'s');
  const s = LS.createSession(teacher, { mode: 'battle', setId: ok.json.id, audience: 'open' });
  assert.ok(s.ok); assert.equal(s.session.items[0].q, 'Half of 8?');
  assert.equal((await call(`/api/live/sets/${ok.json.id}/archive`, { method: 'POST', user: teacher })).status, 200);
});

test('/live: the question bank by subject and level; the choice is remembered for next time', async () => {
  publish(official, liveHtml("live.on('question', () => {});", { quiz: true }), { source: 'seed', slug: 'brain-board', title: 'Brain Board' });
  const r = await call('/api/live/sessions', { method: 'POST', user: teacher, body: { pick: 'mode:battle', set: 'bank', bankSubject: 'history', bankLevel: 'a12', bankCount: '15', audience: 'open', replace: true } });
  assert.equal(r.status, 200, r.text);
  const s = LS.get(r.json.sid);
  assert.equal(s.items.length, 15);
  assert.ok(s.items.every(it => it.cat === 'History'));
  const page = (await call('/live', { user: teacher })).text;
  assert.match(page, /<option value="history" selected>/);
  assert.match(page, /<option value="a12" selected>/);
  assert.match(page, /<option value="15" selected>/);
  // a board takes the ticked subjects
  const b = await call('/api/live/sessions', { method: 'POST', user: teacher, body: { pick: 'mode:board', set: 'bank', bankBoard: ['math', 'words', 'general'], bankLevel: 'a6', audience: 'open', replace: true } });
  assert.equal(b.status, 200, b.text);
  assert.deepEqual([...new Set(LS.get(b.json.sid).items.map(it => it.cat))], ['Math', 'Reading & words', 'General knowledge']);
});

test('/live?starter=: a lesson plan preselects Would You Rather topics, the bank, Atlas or a fixed starter; unknown ids are ignored', async () => {
  // P6 (CS Quest): 6.1 hosts wyr:tech:8:20; the mode comes from the starter when the URL names none
  const wyr = (await call('/live?starter=wyr:tech:8:20', { user: teacher })).text;
  assert.match(wyr, /value="mode:wyr" checked/);
  assert.match(wyr, /name="wyrTopic" value="tech" checked/); assert.doesNotMatch(wyr, /name="wyrTopic" value="animals" checked/); assert.doesNotMatch(wyr, /name="wyrTopic" value="online" checked/);
  assert.match(wyr, /<select id="lv-wyr-count" name="wyrCount">(?:(?!<\/select>)[\s\S])*<option value="8" selected>/);
  assert.match(wyr, /<select id="lv-wyr-secs" name="wyrSecs">(?:(?!<\/select>)[\s\S])*<option value="20" selected>/);
  assert.match(wyr, /id="lv-preset" data-starter="wyr:tech:8:20">Set up from the lesson plan\./);
  const mix = (await call('/live?starter=wyr:mix:5:10', { user: teacher })).text;
  assert.match(mix, /name="wyrTopic" value="animals" checked/); assert.match(mix, /name="wyrTopic" value="online" checked/);
  // a bank starter fills in subject, level and count; the mode in the URL wins over the starter's
  const bank = (await call('/live?mode=battle&starter=bank:science:a10:15', { user: teacher })).text;
  assert.match(bank, /value="mode:battle" checked/); assert.match(bank, /<option value="bank" selected>/);
  assert.match(bank, /<option value="science" selected>/); assert.match(bank, /<option value="a10" selected>/);
  assert.match(bank, /<select id="lv-bank-count" name="bankCount">(?:(?!<\/select>)[\s\S])*<option value="15" selected>/);
  const board = (await call('/live?starter=bank:board:a6:math+words', { user: teacher })).text;
  assert.match(board, /value="mode:board" checked/); assert.match(board, /<option value="a6" selected>/);
  assert.match(board, /name="bankBoard" value="math" checked/); assert.match(board, /name="bankBoard" value="words" checked/); assert.doesNotMatch(board, /name="bankBoard" value="science" checked/);
  const fixed = (await call('/live?starter=science', { user: teacher })).text;
  assert.match(fixed, /<option value="starter:science" selected>/); assert.match(fixed, /value="mode:quest-race" checked/, 'no mode implied: the first one as usual');
  const atlas = (await call('/live?starter=atlas:eu:hard:flag+capital:5:30', { user: teacher })).text;
  assert.match(atlas, /value="mode:atlas" checked/); assert.match(atlas, /<option value="eu" selected>/); assert.match(atlas, /<option value="hard" selected>/);
  assert.match(atlas, /name="atlasKind" value="flag" checked/); assert.match(atlas, /name="atlasKind" value="capital" checked/); assert.doesNotMatch(atlas, /name="atlasKind" value="find" checked/);
  assert.match(atlas, /<select id="lv-atlas-secs" name="atlasSecs">(?:(?!<\/select>)[\s\S])*<option value="30" selected>/);
  // anything the session API would refuse is ignored: the usual landing, no preset note
  for (const bad of ['nonsense', 'wyr:pizza:5:15', 'wyr:tech:9:20', 'bank:magic:a8:10', 'atlas:mars:easy:find:10:20', '<script>alert(1)</script>', 'x'.repeat(300)]) {
    const page = await call(`/live?starter=${encodeURIComponent(bad)}`, { user: teacher });
    assert.equal(page.status, 200, bad); assert.doesNotMatch(page.text, /id="lv-preset"/, bad);
    assert.match(page.text, /<option value="bank" selected>/, bad); assert.match(page.text, /value="mode:quest-race" checked/, bad);
    assert.ok(!page.text.includes('<script>alert'), 'escaped');
  }
  const { starterPre } = await import('../../server/routes/live.js');
  assert.deepEqual(starterPre('wyr:online:8:20'), { id: 'wyr:online:8:20', kind: 'wyr', mode: 'wyr', wyr: { topics: ['online'], count: 8, secs: 20 } });
  assert.equal(starterPre('bank:mixed:a8:10').mode, null); assert.equal(starterPre('bank:board:a8:math+science').mode, 'board');
  assert.equal(starterPre('board').mode, 'board'); assert.equal(starterPre('math-8').kind, 'fixed');
  assert.equal(starterPre('bank:board:a6:math words').id, 'bank:board:a6:math+words', 'an unencoded + arrives as a space');
  for (const none of ['', undefined, null, 'wyr:', 'bank:', 42]) assert.equal(starterPre(none), null, String(none));
});

test('/live: CS Quest\'s derived sets sit under their own group in the picker; a teacher\'s own sets stay in theirs', async () => {
  // P20 (CS Quest): the materialiser makes 35+ sets per band in a teacher's own sets (lesson_id + the CSQ title prefix,
  // or subject cs-quest); they are grouped so they do not bury the teacher's own question sets
  const SETS = await import('../../server/services/classlive-sets.js');
  const items = [{ q: 'Which block repeats what is inside it?', choices: ['forward', 'repeat', 'turn', 'stop'], answer: 1, secs: 15, cat: '1B-AP-10' }];
  const lesson = L.createLesson(teacher, S.getClass(cls.id).school_id, { title: 'Again and again' }).lesson;
  const own = SETS.createSet(teacher, { title: 'My robots quiz', items }).set;
  const warm = SETS.createSet(teacher, { title: 'CSQ 1.2 warm-up · Loops (3-5)', items, lessonId: lesson.id }).set;
  const review = SETS.createSet(teacher, { title: 'CSQ Unit 1 review (3-5)', subject: SETS.CSQ_SUBJECT, items }).set;
  const draft = SETS.createSet(teacher, { title: 'Questions from my lesson', items: [{ q: 'Why does the robot stop?', choices: [], answer: 0, secs: 20 }], lessonId: lesson.id }).set;
  assert.ok(own && warm && review && draft, 'all four sets made');
  assert.ok(SETS.isCsQuest(warm) && SETS.isCsQuest(review) && !SETS.isCsQuest(own) && !SETS.isCsQuest(draft) && !SETS.isCsQuest(null));
  assert.deepEqual(SETS.listFor(teacher).mine.filter(s => s.cs).map(s => s.id).sort(), [warm.id, review.id].sort());
  const page = (await call('/live', { user: teacher })).text;
  const group = /<optgroup label="CS Quest" data-csq="1">([\s\S]*?)<\/optgroup>/.exec(page);
  assert.ok(group, 'the CS Quest group');
  assert.ok(group[1].includes(`value="set:${warm.id}"`) && group[1].includes(`value="set:${review.id}"`), group[1]);
  assert.ok(!group[1].includes(`set:${own.id}`) && !group[1].includes(`set:${draft.id}`));
  const mine = /<optgroup label="My question sets">([\s\S]*?)<\/optgroup>/.exec(page)[1];
  assert.ok(mine.includes(`value="set:${own.id}"`) && mine.includes(`value="set:${draft.id}" disabled`) && !mine.includes(`set:${warm.id}`), mine);
  // a lesson's "Host live" link still selects its set by id, wherever it is grouped
  assert.match((await call(`/live?set=${warm.id}`, { user: teacher })).text, new RegExp(`<option value="set:${warm.id}" selected>`));
  for (const s of [own, warm, review, draft]) SETS.archiveSet(teacher, s.id);
  assert.doesNotMatch((await call('/live', { user: teacher })).text, /data-csq="1"/, 'no group without CS Quest sets');
});
