// Story Builder picture books (docs/story-builder.md "Picture books"; docs/decisions.md "Story Builder: picture books
// for teachers"): the start offers Video story, Illustrated picture book and Choose-your-own-adventure picture book to
// the account kinds STORY_PICTURE_BOOKS names (default 'teacher'; 'teacher,parent' adds family grown-ups), never to kids
// or students, refused on the server on every route whatever the flag says. A picture book is a hand-off to the book
// maker: its card in the Oomba chat (or the setup page's own steps) comes pre-filled with what the Story Builder knew and
// asks only the rest. No network: the chat's AI is never called here.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config, parsePictureBooks } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const CO = await import('../../server/services/companion.js');
const BK = await import('../../server/services/companion-book.js');
const SB = await import('../../server/services/storybook.js');
const RL = await import('../../server/services/ratelimit.js');
const { grownupMay } = await import('../../server/routes/family.js');
const { createApp } = await import('../../server/app.js');

let server, base;
const old = { on: config.storyBuilder, books: config.storyPictureBooks };
test.before(async () => { config.storyBuilder = true; server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { config.storyBuilder = old.on; config.storyPictureBooks = old.books; SB.hooks.screen = null; server.close(); });
test.beforeEach(() => { RL._reset(); config.storyPictureBooks = ['teacher']; q.run('DELETE FROM made_book_ai_days'); SB.hooks.screen = async () => ({ ok: true }); });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { body } = {}) => {
  const headers = { cookie: cookieFor(who.id) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};
const boss = createUser({ username: 'PicBookBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Picture Oak' }).school;
let k = 0;
/** A teacher; chat: with the Oomba chat (a tester), else the setup page's steps (no Teacher plan, plans off). */
function teacher({ chat = true } = {}) {
  const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: `Pia Teacher${++k}`, role: 'teacher' }).user.id);
  if (chat) config.manipulativesUsers = [...config.manipulativesUsers, u.username.toLowerCase()];
  S.createClass(boss, oak.id, { name: `2P-${k}`, grade: '2', teacherId: u.id });
  return u;
}
const student = () => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: `Sam Student${++k}` }).user.id);
const kid = () => getUser(createUser({ username: `PicKid${++k}`, password: 'rainbow-77' }).id);
const grownup = () => getUser(createUser({ username: `PicGro${++k}`, password: 'rainbow-77-long', accountType: 'grownup' }).id);
const card = chat => { const x = [...chat.turns].reverse().find(y => y.note && y.note.book && y.note.book.state !== 'moved'); return x ? { turn: x, b: x.note.book } : null; };
const chatOf = async u => (await as(u)('/api/companion/chat')).json.chat;
const IDEA = 'a shy turtle who finds the way home across the reef';

test('STORY_PICTURE_BOOKS: unset is teacher, a list of kinds, 0 is nobody; an unknown kind is a start-up error', () => {
  assert.deepEqual(parsePictureBooks(undefined), { list: ['teacher'] });
  assert.deepEqual(parsePictureBooks(''), { list: ['teacher'] });
  assert.deepEqual(parsePictureBooks('teacher,parent').list, ['teacher', 'parent']);
  assert.deepEqual(parsePictureBooks(' Parent , teacher ').list, ['teacher', 'parent']);
  assert.deepEqual(parsePictureBooks('grownup').list, ['parent'], 'the account type name works too');
  assert.deepEqual(parsePictureBooks('0'), { list: [] });
  assert.deepEqual(parsePictureBooks('off'), { list: [] });
  const bad = parsePictureBooks('teacher,kid');
  assert.deepEqual(bad.list, ['teacher']);
  assert.match(bad.error, /STORY_PICTURE_BOOKS must be/);
  assert.doesNotMatch(bad.error, /kid/, 'the value is not echoed');
});

test('who: teachers by default; grown-ups only when the flag names parent; kids and students never, whatever the flag', () => {
  const tch = teacher({ chat: false }), st = student(), kd = kid(), gu = grownup();
  assert.ok(SB.pictureBooksFor(tch) && SB.canMake(tch) && SB.canShare(tch));
  assert.ok(SB.pictureBooksFor(boss), 'the platform admin is a teacher here');
  for (const u of [st, kd, gu]) assert.ok(!SB.pictureBooksFor(u) && !SB.canMake(u), u.username);
  config.storyPictureBooks = ['teacher', 'parent'];
  assert.ok(SB.pictureBooksFor(gu) && SB.canMake(gu), 'a grown-up may make books when the flag says parent');
  assert.ok(!SB.canShare(gu), 'but has no classes to share with');
  assert.deepEqual(SB.shareClasses(gu), []);
  for (const u of [st, kd]) assert.ok(!SB.pictureBooksFor(u) && !SB.canMake(u), u.username);
  config.storyPictureBooks = ['parent'];
  assert.ok(!SB.pictureBooksFor(tch), 'teachers off: no picture books in the Story Builder');
  assert.ok(SB.canMake(tch), 'the book maker itself stays for teachers');
  config.storyPictureBooks = [];
  assert.ok(!SB.pictureBooksFor(tch) && !SB.pictureBooksFor(gu) && !SB.canMake(gu));
});

test('the start: three options for a teacher; only the video for a kid and a student; a grown-up only with parent', async () => {
  const tch = teacher();
  const t = await as(tch)('/stories/new');
  assert.equal(t.status, 200);
  for (const v of ['video', 'book', 'cyoa']) assert.match(t.text, new RegExp(`<input type="radio" class="sr-only" name="make" id="sb-make-${v}" value="${v}"`), v);
  assert.match(t.text, /What do you want to make\?/);
  assert.match(t.text, /Video story/); assert.match(t.text, /Illustrated picture book/); assert.match(t.text, /Choose-your-own-adventure picture book/);
  assert.match(t.text, /id="sb-make-video" value="video" checked/, 'the video is picked first');
  assert.match(t.text, /id="sb-blen"/, 'a book length');
  assert.match(t.text, /"books":true/);
  assert.doesNotMatch(t.text.split('id="sb-make"')[1].split('</fieldset>')[0], /[\u{1F300}-\u{1FAFF}]/u, 'icons, not emoji, on the new cards');
  config.storyPictureBooks = ['teacher', 'parent'];
  for (const u of [kid(), student()]) {
    const r = await as(u)('/stories/new');
    assert.equal(r.status, 200);
    assert.match(r.text, /id="sb-form"/);
    assert.doesNotMatch(r.text, /name="make"|sb-make|sb-blen|picture book/i, `${u.username}: only the video story, as before`);
    assert.match(r.text, /"books":false/);
  }
  const gu = grownup();
  assert.match((await as(gu)('/stories/new')).text, /name="make"/, 'grown-up with parent');
  config.storyPictureBooks = ['teacher'];
  const g2 = await as(gu)('/stories/new');
  assert.equal(g2.status, 200);
  assert.doesNotMatch(g2.text, /name="make"/, 'grown-up without parent: the video only');
});

test('the server refuses kids and students on the hand-off and on the book maker, even with the flag on for everyone', async () => {
  config.storyPictureBooks = ['teacher', 'parent'];
  const body = { make: 'cyoa', idea: IDEA };
  for (const u of [kid(), student()]) {
    const r = as(u);
    assert.equal((await r('/api/stories/book', { body })).status, 404, `${u.username} hand-off`);
    assert.equal((await r('/api/stories/book', { body: { ...body, make: 'book' } })).status, 404);
    assert.equal((await r('/library/make')).status, 404, 'the book maker page');
    assert.equal((await r('/api/library/make/check', { body: { setup: { source: 'ai', kind: 'cyoa', about: IDEA } } })).status, 404);
    assert.equal((await r('/api/library/make/start', { body: { setup: { source: 'ai', kind: 'cyoa', about: IDEA } } })).status, 404);
    assert.equal((await r('/api/companion/book/new', { body: {} })).status, 404);
    assert.ok(!CO.storyBook(u, { input: BK.fromStory({ kind: 'cyoa', idea: IDEA }, s => s) }).ok);
  }
  // a grown-up without parent in the flag: the fence answers first
  config.storyPictureBooks = ['teacher'];
  const gu = grownup();
  assert.equal((await as(gu)('/api/stories/book', { body })).status, 404);
  assert.equal((await as(gu)('/library/make')).status, 404);
  assert.ok(!grownupMay('GET', '/library/make'));
  // a teacher may not send a video as a book, nor an empty idea
  const tch = teacher({ chat: false });
  assert.equal((await as(tch)('/api/stories/book', { body: { make: 'video', idea: IDEA } })).status, 400);
  assert.equal((await as(tch)('/api/stories/book', { body: { make: 'book', idea: 'x' } })).json.code, 'empty');
});

test('the hand-off: the book maker\'s card in the Oomba chat comes pre-filled and skips what the Story Builder answered', async () => {
  const tch = teacher();
  // an earlier book being set up gives way to the new one
  assert.equal((await as(tch)('/api/companion/book/new', { body: {} })).status, 200);
  const before = card(await chatOf(tch));
  assert.equal(before.b.state, 'source');
  const r = await as(tch)('/api/stories/book', { body: { make: 'cyoa', idea: IDEA, ageBand: '6-8', length: 'long', style: 'adventure', tone: 'brave', characters: 'Tilly the turtle', lesson: 'asking for help is brave', voice: 'onyx' } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json, { href: '/library?make=1' });
  const chat = await chatOf(tch);
  assert.equal(chat.turns.find(x => x.id === before.turn.id).note.book.state, 'moved', 'the old card is moved');
  let c = card(chat);
  assert.match(c.turn.text, /from the Story Builder/);
  assert.equal(c.b.state, 'endings', 'Have AI make one, the kind, the grade, the length, the theme, your words and the pictures were answered');
  assert.deepEqual(c.b.known, ['Have AI make one', 'Choose-your-own-adventure', 'Grade 2', 'Long', 'Oomba paints them']);
  // the opened library page shows this card (make=1 carries the open book on, it does not start another)
  assert.equal((await as(tch)('/api/companion/book/new', { body: {} })).json.chat.turns.filter(x => x.note && x.note.book && x.note.book.state !== 'moved').length, 1);
  assert.equal((await as(tch)('/library?make=1')).status, 200);
  const pick = async v => { const x = await as(tch)('/api/companion/chat/act', { body: { turnId: c.turn.id, act: 'bookPick', value: v } }); assert.equal(x.status, 200, x.text); c = card(x.json.chat); };
  await pick('3');
  assert.equal(c.b.state, 'level', 'then only the reading level');
  await pick('growing');
  assert.equal(c.b.state, 'check', 'then the check, with nothing else asked');
  const sent = c.b.rows.find(x => x.part === 'words' && x.text !== undefined).text;
  assert.match(sent, new RegExp(IDEA));
  assert.match(sent, /Kind of story: Adventure\. Feeling: Brave\./);
  assert.match(sent, /Who is in it: Tilly the turtle/);
  assert.match(sent, /A lesson to learn: asking for help is brave/);
  assert.ok(c.b.ok, 'Make my book is ready');
  assert.equal(SB.myBooks(tch).length, 0, 'nothing made before Make my book');
});

test('the hand-off: a picture book for everyone asks the grade; the video length picks the book length when none is sent', () => {
  const t = s => s === 'stories.book.feel' ? 'feel' : s;
  const i = BK.fromStory({ kind: 'linear', idea: IDEA, ageBand: 'all', seconds: 45, style: 'bedtime', tone: 'cozy' }, t);
  assert.deepEqual({ ...i, about: undefined }, { source: 'ai', kind: 'linear', length: 'short', pictures: 'ai', about: undefined });
  const tch = teacher();
  const d = BK.fromInput(tch, { lang: 'en', meta: {} }, i, null);
  assert.equal(d.state, 'grade');
  assert.deepEqual(d.given.sort(), ['kind', 'length', 'pictures', 'source']);
  assert.equal(d.ctxDone, true, 'the idea answers Your words');
  for (const [age, grade] of [['3-5', 'k'], ['6-8', '2'], ['9-12', '4-5']]) assert.equal(BK.fromStory({ kind: 'cyoa', idea: IDEA, ageBand: age }, t).grade, grade);
  for (const [s, l] of [[45, 'short'], [60, 'medium'], [90, 'long']]) assert.equal(BK.fromStory({ kind: 'linear', idea: IDEA, seconds: s }, t).length, l);
});

test('the hand-off without the Oomba chat: the setup page\'s own steps with the answers picked', async () => {
  const tch = teacher({ chat: false });
  assert.ok(!CO.companionFor(tch));
  const r = await as(tch)('/api/stories/book', { body: { make: 'book', idea: IDEA, ageBand: '3-5', length: 'medium', style: 'funny', tone: 'silly' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.href, '/library/make');
  const s = r.json.setup;
  assert.deepEqual([s.step, s.source, s.kind, s.grade, s.length, s.pictures], ['options', 'ai', 'linear', 'k', 'medium', 'ai']);
  assert.match(s.about, /Kind of story: Funny\. Feeling: Silly\./);
  // what the page would send checks like any setup
  const chk = await as(tch)('/api/library/make/check', { body: { setup: s } });
  assert.equal(chk.status, 200, chk.text);
  assert.equal(chk.json.setup.kind, 'linear');
});

test('a grown-up with parent in the flag: the book maker without classes (no Share), reading and printing their own books', async () => {
  config.storyPictureBooks = ['teacher', 'parent'];
  const gu = grownup();
  const r = await as(gu)('/api/stories/book', { body: { make: 'cyoa', idea: IDEA, ageBand: '6-8' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.href, '/library/make', 'grown-ups have no Oomba chat: the setup page');
  const pg = await as(gu)('/library/make');
  assert.equal(pg.status, 200);
  assert.match(pg.text, /id="sb-setup"/);
  assert.match(pg.text, /href="\/stories"/, 'back to the Story Builder, not the library');
  const st = await as(gu)('/api/library/make/start', { body: { setup: r.json.setup } });
  assert.equal(st.status, 200, st.text);
  const row = SB.myBooks(gu)[0];
  assert.ok(row, 'their book');
  await (await import('../../server/services/oomba-chat.js')).allSettled();
  const ed = await as(gu)(`/library/make/${row.id}`);
  assert.equal(ed.status, 200);
  assert.doesNotMatch(ed.text, /id="sb-share"/, 'no Share with classes');
  assert.match(ed.text, /\/library\/made\/[^/]+\/print/);
  assert.equal((await as(gu)(`/api/library/make/${row.id}/share`, { body: { classIds: [] } })).status, 404);
  assert.equal((await as(gu)(`/library/made/${row.id}/read`)).status, 200);
  assert.equal((await as(gu)(`/library/made/${row.id}/print`)).status, 200);
  assert.equal((await as(gu)('/library')).status, 404, 'the library itself stays closed to grown-ups');
  // the flag back to teachers: their book maker closes again
  config.storyPictureBooks = ['teacher'];
  assert.equal((await as(gu)(`/library/make/${row.id}`)).status, 404);
});
