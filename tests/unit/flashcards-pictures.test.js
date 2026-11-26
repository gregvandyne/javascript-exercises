// Flashcards pictures (services/flash-pics.js; docs/decisions.md "Flashcards: pictures"), built on the Storybook's
// picture pieces. No network: Google is the book maker's stand-in (tests/support/fake-gemini.js), the picture checks
// are the Storybook's hooks. Checked here:
//   - cleanFlashItems takes our own picture refs on either side ('img:<id>') and never a URL; old sets read as before;
//   - a set keeps only its owner's pictures; who sees a picture (its owner, the set that names it);
//   - uploads pass exactly the Storybook's checks (storybook.js checkUpload: JPEG only, size, the person check);
//   - who may add pictures: Storybook's rule (never a student, a child, a guest; a family grown-up neither, here);
//   - Oomba paints a card's picture through the book pictures' path (the house style, the daily pictures, the check);
//   - printing puts the pictures on the cards and the study sheet; deleting a set or the account takes its pictures.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, publish, official, teacher, teacher2, mia, kid, mum, boss, school, auth, q, RL, config } from './_live.js';
import * as G from '../../server/services/game-sets.js';
import * as FP from '../../server/services/flash-pics.js';
import * as SB from '../../server/services/storybook.js';
import * as D from '../../server/services/storybook-draw.js';
import * as GM from '../../server/services/storybook-gemini.js';
import * as PR from '../../server/services/flash-print.js';
import { fakeGemini } from '../support/fake-gemini.js';
import { deleteAccount } from '../../server/services/account-delete.js';
import * as S from '../../server/services/schools.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/flashcards.html'), 'utf8');
const GAME = publish(official, HTML, { source: 'seed', slug: 'flashcards', title: 'Flashcards' });
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const base = `/api/games/${GAME.id}`;
const up = (user, data = JPG) => call(`${base}/flash-pics`, { method: 'POST', user, body: { data: Buffer.from(data).toString('base64') } });
const cards = (a = '', b = '') => [['habitat', 'where an animal lives', a, ...(b ? [b] : [])], ['predator', 'an animal that hunts others', '🦁']];
let fake;
test.beforeEach(() => {
  RL._reset(); q.run('DELETE FROM made_book_ai_days'); D._resetPace();
  Object.assign(config, { storybookPicturesFreePerDay: 40, storybookPicturesPlanPerDay: 40, storybookDrawAtOnce: 2, geminiKey: '', aiDailyBudgetUsd: 1000, aiMonthlyBudgetUsd: 100000 });
  SB.hooks.screenImage = async () => 'allow'; D.hooks.screenImage = async () => 'allow';
  fake = fakeGemini(GM);
});
test.after(() => { GM.hooks.generate = null; SB.hooks.screenImage = null; D.hooks.screenImage = null; D._resetPace(); });

test('cleanFlashItems: our own picture refs on the front, the back or both; never a URL, a path or a data: picture; old sets unchanged', () => {
  const ref = 'img:Abc123def456ghi7', ref2 = 'img:Zyx987wvu654tsr3';
  assert.deepEqual(G.cleanFlashItems([{ t: '', c: cards(ref) }])[0].c[0], ['habitat', 'where an animal lives', ref]);
  assert.deepEqual(G.cleanFlashItems([{ t: '', c: cards(ref, ref2) }])[0].c[0], ['habitat', 'where an animal lives', ref, ref2], 'one picture a side');
  assert.deepEqual(G.cleanFlashItems([{ t: '', c: cards('🏞️', ref2) }])[0].c[0], ['habitat', 'where an animal lives', '🏞️', ref2], 'an emoji front, a picture back');
  assert.deepEqual(G.cleanFlashItems([{ t: '', c: [['a', 'b', '', ''], ['c', 'd']] }])[0].c, [['a', 'b', ''], ['c', 'd', '']], 'an empty back is left off: old sets read as they did');
  for (const bad of ['https://evil.example/cat.jpg', '//evil.example/cat.jpg', '/api/games/x/flash-pics/Abc123def456', 'img:../../etc', 'img:short', 'img:Abc123def456ghi7?x=1', 'data:image/png;base64,AAAA', 'javascript:alert(1)', 'img:Abc123def456 ghi']) {
    assert.equal(G.cleanFlashItems([{ t: '', c: cards(bad) }]), null, `front ${bad}`);
    assert.equal(G.cleanFlashItems([{ t: '', c: cards('', bad) }]), null, `back ${bad}`);
  }
  assert.equal(G.cleanFlashItems([{ t: '', c: [['a', 'b', '', '', ''], ['c', 'd']] }]), null, 'at most two pictures a card');
  assert.deepEqual([...G.flashRefs([{ c: cards(ref, ref2) }])], ['Abc123def456ghi7', 'Zyx987wvu654tsr3']);
});

test('upload: the Storybook\'s own checks (JPEG only, size, no person, nothing private or unsafe); refused pictures are never kept', async () => {
  q.run('DELETE FROM flash_pics');
  const verdicts = { person: 'imgPerson', personal_info: 'imgPersonal', unsafe: 'imgUnsafe' };
  for (const [v, code] of Object.entries(verdicts)) {
    SB.hooks.screenImage = async () => v;
    const r = await up(teacher); assert.equal(r.status, 422, r.text); assert.equal(r.json.code, code);
    // the book maker refuses the very same picture the same way
    assert.equal((await SB.checkUpload(teacher, JPG)).code, code);
  }
  SB.hooks.screenImage = async () => 'resting';
  assert.equal((await up(teacher)).json.code, 'imgResting');
  assert.equal(q.get('SELECT COUNT(*) n FROM flash_pics').n, 0, 'nothing refused is kept');
  SB.hooks.screenImage = async () => 'allow';
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108020000009077', 'hex');
  assert.equal((await up(teacher, png)).json.code, 'imgType', 'a JPEG only, as book pictures');
  const big = Buffer.alloc(SB.PIC_LIMITS.maxBytes + 10, 1); big[0] = 0xff; big[1] = 0xd8;
  assert.equal((await up(teacher, big)).status, 413, 'the book pictures\' size limit');
  const r = await up(teacher);
  assert.equal(r.status, 200, r.text); assert.match(r.json.ref, /^img:[A-Za-z0-9]{16}$/);
  const row = q.get('SELECT * FROM flash_pics WHERE id=?', r.json.ref.slice(4));
  assert.equal(row.owner_id, teacher.id); assert.equal(row.kind, 'upload'); assert.equal(row.state, 'done');
  // the daily count of picture checks is the book maker's own
  assert.ok(q.get('SELECT n FROM made_book_ai_days WHERE user_id=? AND day LIKE ?', teacher.id, '%:pic').n >= 1);
});

test('who may add pictures: Storybook\'s rule; a student, a child, a guest, a family grown-up and signed out may not upload or paint', async () => {
  const guest = auth.createGuest();
  for (const u of [teacher, boss, mia, kid, guest]) assert.equal(FP.canPicture(u), SB.canMake(u) && !auth.isGrownup(u), u.username);
  assert.equal(FP.canPicture(teacher), true); assert.equal(FP.canPicture(mia), false); assert.equal(FP.canPicture(kid), false);
  const was = config.storyPictureBooks;
  config.storyPictureBooks = ['teacher', 'parent'];
  try {
    assert.equal(SB.canMake(mum), true, 'Storybook lets a family grown-up make books with this flag');
    assert.equal(FP.canPicture(mum), false, 'but their flashcards live in their own save only: no pictures');
    for (const [who, u, status] of [['student', mia, 403], ['child', kid, 403], ['guest', guest, 403], ['family grown-up (the fence: 404)', mum, 404], ['signed out', null, 401]]) {
      assert.equal((await up(u)).status, status, `${who} upload`);
      assert.equal((await call(`${base}/flash-pics/paint`, { method: 'POST', user: u, body: { asks: [{ subject: 'cat' }] } })).status, status, `${who} paint`);
    }
  } finally { config.storyPictureBooks = was; }
  // the frame offers pictures to a teacher only
  const init = async u => { const page = await call('/play/flashcards', { user: u }); const fr = await call(/data-src="(\/frame\/[^"]+?)"/.exec(page.text)[1].replace(/&amp;/g, '&'), { user: u }); return JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(fr.text)[1]); };
  assert.deepEqual((await init(teacher)).flashPics, { upload: true, paint: true, left: 40 });
  assert.equal((await init(mia)).flashPics, undefined); assert.equal((await init(kid)).flashPics, undefined);
});

test('a set shows only its owner\'s pictures; who sees one: its owner, and anyone with a set of theirs that names it', async () => {
  q.run('DELETE FROM flash_pics'); q.run('DELETE FROM game_sets');
  const mine = (await up(teacher)).json.ref, theirs = (await up(teacher2)).json.ref;
  const s = await call(`${base}/sets`, { method: 'POST', user: teacher, body: { items: [{ t: 'Habitats', c: cards(mine, theirs) }] } });
  assert.equal(s.status, 200, s.text);
  assert.deepEqual(G.get(GAME.id, s.json.id).items[0].c[0], ['habitat', 'where an animal lives', mine], 'another teacher\'s picture is left off');
  const get = (u, ref, set = '') => call(`${base}/flash-pics/${ref.slice(4)}${set ? `?set=${set}` : ''}`, { user: u });
  assert.equal((await get(teacher, mine)).status, 200);
  assert.equal((await get(teacher, mine)).headers.get('content-type'), 'image/jpeg');
  assert.equal((await get(mia, mine)).status, 404, 'not without the set');
  assert.equal((await get(mia, mine, s.json.id)).status, 200, 'a student with the assigned set sees it');
  assert.equal((await get(null, mine, s.json.id)).status, 200, 'as anyone with the class code can open the set');
  assert.equal((await get(mia, theirs, s.json.id)).status, 404, 'a picture the set does not name');
  const other = await call(`${base}/sets`, { method: 'POST', user: teacher2, body: { items: [{ t: 'Other', c: cards() }] } });
  assert.equal((await get(mia, mine, other.json.id)).status, 404, 'someone else\'s set never shows it');
  // the frame gets nothing but our own pictures: the play page only ever asks our own route for an img: ref
  const play = fs.readFileSync(path.join(ROOT, 'public/js/play.js'), 'utf8');
  assert.match(play, /'brb:fpic-get': m => .*\/\^img:\[A-Za-z0-9\]\{10,40\}\$\//);
  assert.match(play, /fetch\(`\$\{base\}\/\$\{m\.ref\.slice\(4\)\}/);
});

test('Oomba paints it: queued with a placeholder, painted through the book pictures\' path (house style, the daily pictures, the check)', async () => {
  q.run('DELETE FROM flash_pics');
  const r = await call(`${base}/flash-pics/paint`, { method: 'POST', user: teacher, body: { asks: [{ subject: 'habitat', note: 'a pond with frogs' }, { subject: 'predator' }] } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.refs.length, 2); assert.ok(r.json.refs.every(x => /^img:/.test(x)));
  const [a, b] = r.json.refs;
  // until it is painted, a placeholder (202)
  const first = await call(`${base}/flash-pics/${a.slice(4)}`, { user: teacher });
  assert.ok(first.status === 202 || first.status === 200);
  for (let k = 0; k < 400 && q.get("SELECT COUNT(*) n FROM flash_pics WHERE state IN ('queued','drawing')").n; k++) { FP.kick(); await new Promise(res => setTimeout(res, 25)); }
  await FP.settle();
  for (const ref of [a, b]) assert.equal(q.get('SELECT state FROM flash_pics WHERE id=?', ref.slice(4)).state, 'done');
  assert.equal((await call(`${base}/flash-pics/${a.slice(4)}`, { user: teacher })).status, 200);
  const prompts = fake.calls.map(c => c.body.contents[0].parts[0].text);
  assert.equal(prompts.length, 2);
  assert.ok(prompts.every(p => p.includes(GM.HOUSE_STYLE)), 'the Storybook\'s house style');
  assert.match(prompts[0], /What the picture shows: habitat\./); assert.match(prompts[0], /a pond with frogs/);
  assert.equal(fake.calls[0].body.generationConfig.imageConfig.aspectRatio, '4:3');
  assert.equal(q.get('SELECT n FROM made_book_ai_days WHERE user_id=? AND day LIKE ?', teacher.id, '%:draw').n, 2, 'the same daily pictures as books');
  assert.deepEqual(FP.stateOf(teacher, [a]), { [a]: { state: 'done', reason: '' } }); assert.deepEqual(FP.stateOf(mia, [a]), {});
  // words the book maker refuses are refused here too; the day's pictures used: nothing more is queued
  assert.equal((await call(`${base}/flash-pics/paint`, { method: 'POST', user: teacher, body: { asks: [{ subject: 'call 555-123-4567' }] } })).status, 400);
  config.storybookPicturesFreePerDay = 3;
  const more = await call(`${base}/flash-pics/paint`, { method: 'POST', user: teacher, body: { asks: [{ subject: 'prey' }, { subject: 'erosion' }] } });
  assert.equal(more.status, 200); assert.equal(more.json.refs.filter(Boolean).length, 1); assert.equal(more.json.more, 1);
  config.storybookPicturesFreePerDay = 2; q.run("UPDATE made_book_ai_days SET n=2 WHERE user_id=? AND day LIKE '%:draw'", teacher.id);
  assert.equal((await call(`${base}/flash-pics/paint`, { method: 'POST', user: teacher, body: { asks: [{ subject: 'prey' }] } })).json.code, 'limit');
  // a painting our picture check refuses is never kept
  config.storybookPicturesFreePerDay = 40; q.run('DELETE FROM made_book_ai_days');
  D.hooks.screenImage = async () => 'person';
  const no = (await call(`${base}/flash-pics/paint`, { method: 'POST', user: teacher, body: { asks: [{ subject: 'tiger' }] } })).json.refs[0];
  for (let k = 0; k < 400 && q.get("SELECT COUNT(*) n FROM flash_pics WHERE state IN ('queued','drawing')").n; k++) { FP.kick(); await new Promise(res => setTimeout(res, 25)); }
  await FP.settle();
  const row = q.get('SELECT * FROM flash_pics WHERE id=?', no.slice(4));
  assert.equal(row.state, 'fallback'); assert.equal(row.reason, 'refused'); assert.equal(row.bytes, null);
  assert.equal((await call(`${base}/flash-pics/${no.slice(4)}`, { user: teacher })).status, 404);
});

test('print: the cut-out cards and the study sheet carry the pictures this viewer may see, from our own route only', async () => {
  q.run('DELETE FROM flash_pics'); q.run('DELETE FROM game_sets');
  const ref = (await up(teacher)).json.ref, back = (await up(teacher)).json.ref;
  const s = (await call(`${base}/sets`, { method: 'POST', user: teacher, body: { items: [{ t: 'Habitats', c: cards(ref, back) }] } })).json.id;
  const doc = as => ({ t: 'Habitats', c: cards(ref, back), as, set: s });
  for (const as of ['cards', 'list']) {
    const r = await call(`${base}/print`, { method: 'POST', user: mia, body: { doc: doc(as) } });
    assert.equal(r.status, 200, r.text);
    assert.ok(r.json.html.includes(`src="/api/games/${GAME.id}/flash-pics/${ref.slice(4)}?set=${s}"`), `${as}: the front picture`);
    assert.ok(r.json.html.includes(`src="/api/games/${GAME.id}/flash-pics/${back.slice(4)}?set=${s}"`), `${as}: the back picture`);
    assert.match(r.json.html, /alt="habitat"/);
  }
  // without the set, a student sees no one else's pictures (an owner's own draft prints its own)
  const loose = await call(`${base}/print`, { method: 'POST', user: mia, body: { doc: { t: 'x', c: cards(ref), as: 'cards' } } });
  assert.doesNotMatch(loose.json.html, /<img/);
  const own = await call(`${base}/print`, { method: 'POST', user: teacher, body: { doc: { t: 'x', c: cards(ref), as: 'cards' } } });
  assert.match(own.json.html, /<img class="fcp-pic-img" src="\/api\/games\/[^"]+\/flash-pics\/[A-Za-z0-9]+"/);
  // the printer itself never prints a src it was not given by our route
  const html = PR.flashPrintHtml({ t: 'x', c: [['a', 'b', ref]], as: 'cards', note: '' }, { t: k => k, picSrc: () => 'https://evil.example/x.jpg' });
  assert.doesNotMatch(html, /evil|<img/);
});

test('deleting: a set takes the pictures only it used; the account takes them all; pictures no saved set uses go after keepDays', async () => {
  q.run('DELETE FROM flash_pics'); q.run('DELETE FROM game_sets');
  const a = (await up(teacher)).json.ref, b = (await up(teacher)).json.ref;
  const s1 = (await call(`${base}/sets`, { method: 'POST', user: teacher, body: { items: [{ t: 'One', c: cards(a, b) }] } })).json.id;
  const s2 = (await call(`${base}/sets`, { method: 'POST', user: teacher, body: { items: [{ t: 'Two', c: cards(b) }] } })).json.id;
  const has = ref => !!q.get('SELECT 1 FROM flash_pics WHERE id=?', ref.slice(4));
  assert.equal((await call(`${base}/sets/${s1}`, { method: 'DELETE', user: teacher })).status, 200);
  assert.equal(has(a), false, 'a picture only the deleted set used goes with it'); assert.equal(has(b), true, 'one another set uses stays');
  // a picture taken off a set when it is saved again goes too
  await call(`${base}/sets`, { method: 'POST', user: teacher, body: { id: s2, items: [{ t: 'Two', c: cards() }] } });
  assert.equal(has(b), false);
  // an unsaved draft's picture: kept for keepDays, then gone
  const c = (await up(teacher)).json.ref;
  assert.equal(FP.pruneUnused(), 0); assert.equal(has(c), true);
  assert.equal(FP.pruneUnused(Date.now() + (FP.LIMITS.keepDays + 1) * 864e5), 1); assert.equal(has(c), false);
  // the account: every picture of theirs
  const tmp = S.createSchoolAccount(boss, school.id, { rosterName: 'Temp Teacher', role: 'teacher' }).user;
  const d = (await up(tmp)).json.ref;
  await call(`${base}/sets`, { method: 'POST', user: tmp, body: { items: [{ t: 'Mine', c: cards(d) }] } });
  assert.equal(has(d), true);
  const del = deleteAccount(tmp.id, boss, { by: 'admin', leaveSchools: true });
  assert.equal(del.ok, true, JSON.stringify(del));
  assert.equal(has(d), false, 'the account\'s pictures go with it');
  assert.equal(q.get('SELECT COUNT(*) n FROM flash_pics WHERE owner_id=?', tmp.id).n, 0);
});
