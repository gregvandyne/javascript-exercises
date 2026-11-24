// The book maker in the Oomba chat (docs/storybook-builder.md "In the Oomba chat"; docs/decisions.md "The book maker in
// the Oomba chat"): the cards ask only what is missing; the teacher's words and attachments go into the book, never to
// the chat's AI; the check card runs the page's own scrubber and screening before anything is generated; Make my book
// uses the page's own service and daily cap; the first draft and every later change are turns of the same chat (the
// book page and any other page), with Undo; books made in the past are found among the teacher's own only; teachers
// only, on the server. The chat's AI is a stand-in (services/companion.js hooks.create); the book's AI is the built-in
// stand-in (no key: services/storybook-mock.js). No network.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const CO = await import('../../server/services/companion.js');
const BK = await import('../../server/services/companion-book.js');
const SB = await import('../../server/services/storybook.js');
const C = await import('../../server/services/oomba-chat.js');
const RL = await import('../../server/services/ratelimit.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { CO.hooks.create = null; CO.hooks.screenImage = null; Object.assign(SB.hooks, { screen: null, screenImage: null }); server.close(); });
test.beforeEach(() => { RL._reset(); q.run('DELETE FROM made_book_ai_days'); SB._resetPrune(); Object.assign(config, { storybookPlanPerDay: 50, storybookFreePerDay: 50 }); SB.hooks.screen = null; });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { body, raw, type } = {}) => {
  const headers = { cookie: cookieFor(who.id) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (raw) headers['content-type'] = type || 'application/octet-stream';
  const r = await fetch(base + p, { method: body !== undefined || raw ? 'POST' : 'GET', headers, body: raw || (body !== undefined ? JSON.stringify(body) : undefined), redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
};
const boss = createUser({ username: 'BookChatBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Book Oak' }).school;
let k = 0;
function teacher({ tester = true } = {}) {
  const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: `Rita Teacher${++k}`, role: 'teacher' }).user.id);
  if (tester) config.manipulativesUsers = [...config.manipulativesUsers, u.username.toLowerCase()];
  const c = S.createClass(boss, oak.id, { name: `3R-${k}`, grade: '3', teacherId: u.id }).class;
  const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Quinn Marsh' }).user.id); S.addToClass(boss, c.id, kid.id);
  return u;
}
/** The chat's AI: script(words, params) -> [tool, input] or null; then a short reply. */
function standIn(script, reply = 'Okay.') {
  const calls = [];
  CO.hooks.create = async p => {
    calls.push(JSON.parse(JSON.stringify(p)));
    const last = p.messages.at(-1), afterTool = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    const said = typeof last.content === 'string' ? last.content : '';
    const t = afterTool ? null : script(said, p);
    if (t) return { model: p.model, usage: {}, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${calls.length}`, name: t[0], input: t[1] }] };
    return { model: p.model, usage: {}, stop_reason: 'end_turn', content: [{ type: 'text', text: reply }] };
  };
  return calls;
}
const chatOf = async u => (await as(u)('/api/companion/chat')).json.chat;
const card = chat => { const x = [...chat.turns].reverse().find(y => y.note && y.note.book && y.note.book.state !== 'moved'); return x ? { turn: x, b: x.note.book } : null; };
const act = (u, turn, a, value) => as(u)('/api/companion/chat/act', { body: { turnId: turn.id, act: a, ...(value !== undefined ? { value } : {}) } });
const pickAll = async (u, answers) => { let c = card(await chatOf(u)); for (const v of answers) { const r = await act(u, c.turn, 'bookPick', v); assert.equal(r.status, 200, r.text); c = card(r.json.chat); } return c; };
const used = u => (q.get('SELECT n FROM made_book_ai_days WHERE user_id=? AND day=?', u.id, new Date().toISOString().slice(0, 10)) || {}).n || 0;
const ASK = 'make a choose your own adventure about the water cycle for grade 3';

test('the teacher\'s request skips what it answered; the cards ask the rest; the check runs the page\'s scrubber and screening before Make my book', async () => {
  const u = teacher();
  const calls = standIn(w => (/adventure/.test(w) ? ['makeBook', { source: 'ai', kind: 'cyoa', grade: '3', about: 'the water cycle, told by a raindrop' }] : null), 'Answer the card and I will check it with you.');
  const r = await as(u)('/api/companion/chat', { body: { text: ASK, page: { type: 'library' } } });
  assert.equal(r.status, 200); await C.allSettled();
  assert.ok(calls[0].tools.some(x => x.name === 'makeBook'), 'offered to a teacher');
  assert.match(calls[0].system, /call makeBook/);
  let c = card(await chatOf(u));
  assert.equal(c.b.state, 'length', 'source, kind and grade were answered; the topic answers theme and your words');
  assert.deepEqual(c.b.known, ['Have AI make one', 'Choose-your-own-adventure', 'Grade 3']);
  assert.deepEqual(c.b.options.map(o => o.v), ['short', 'medium', 'long']);
  assert.equal(SB.myBooks(u).length, 0, 'nothing made yet');
  // the remaining steps, in the page's order: length, endings, reading level, pictures; then the check by itself
  const steps = [];
  c = card(await chatOf(u));
  for (const v of ['short', '3', 'growing', 'ai']) { steps.push(c.b.state); const x = await act(u, c.turn, 'bookPick', v); c = card(x.json.chat); }
  assert.deepEqual(steps, ['length', 'endings', 'level', 'pictures']);
  assert.equal(c.b.state, 'check'); assert.equal(c.b.ok, true);
  const rows = Object.fromEntries(c.b.rows.map(x => [x.label, x.value ?? x.text]));
  assert.equal(rows['What it is about'], 'the water cycle, told by a raindrop');
  assert.match(rows.Choices, /Grade 3 · Short · 3 endings · Growing reader · Oomba paints them/);
  assert.ok(c.b.rows.every(x => x.part), 'every part has Edit');
  assert.ok(c.b.L.never.includes('students\' names'));
  assert.equal(calls.length, 2, 'no AI for the cards');
  // Edit the options: asked again, then straight back to the check
  const e = await act(u, c.turn, 'bookEdit', 'options'); c = card(e.json.chat);
  assert.equal(c.b.state, 'grade');
  c = await pickAll(u, ['4', 'medium', '2', 'early', 'own']);
  assert.equal(c.b.state, 'check'); assert.match(c.b.rows.find(x => x.part === 'options').value, /Grades 4-5 · Medium · 2 endings · Early reader · I'll add my own/);
  // the screening (storybook.screenSetup, the page's own) can block it: no Make my book
  SB.hooks.screen = async () => ({ ok: false, category: 'unsafe', message: 'Blocked by the screening.' });
  c = card((await act(u, c.turn, 'bookEdit', 'pictures')).json.chat);
  c = card((await act(u, c.turn, 'bookPick', 'ai')).json.chat);
  assert.equal(c.b.ok, false); assert.ok(c.b.notes.some(n => n.text === 'Blocked by the screening.'));
  assert.equal((await act(u, c.turn, 'bookStart')).status, 404, 'Make my book is refused');
  assert.equal(SB.myBooks(u).length, 0);
  SB.hooks.screen = null;
  c = card((await act(u, c.turn, 'bookEdit', 'pictures')).json.chat);
  c = card((await act(u, c.turn, 'bookPick', 'ai')).json.chat);
  assert.equal(c.b.ok, true);
  // Make my book: the page's own service (createBook) and daily turn; the first draft is a turn of this chat
  const s = await act(u, c.turn, 'bookStart');
  assert.equal(s.status, 200, s.text);
  const [row] = SB.myBooks(u);
  assert.ok(row); assert.equal(row.kind, 'cyoa');
  assert.equal(SB.setupOf(row).grade, '4-5'); assert.equal(SB.setupOf(row).about, 'the water cycle, told by a raindrop'); assert.equal(SB.setupOf(row).pictures, 'ai');
  assert.equal(used(u), 1, 'one of today\'s book turns, as on the page');
  let chat = s.json.chat;
  assert.ok(chat.turns.some(x => x.note && x.note.bookRef && x.note.bookRef.href === `/library/make/${row.id}`), 'Open the book');
  assert.equal(chat.turns.at(-1).role, 'me'); assert.deepEqual(chat.turns.at(-1).meta.page, { type: 'book', bookId: row.id });
  await C.allSettled();
  chat = await chatOf(u);
  const first = chat.turns.at(-1);
  assert.equal(first.change.kind, 'book'); assert.equal(first.change.first, true); assert.equal(first.change.canUndo, true);
  assert.match(first.change.lines.items[0], /A new adventure: \d+ pages, 2 endings/);
  const bk = SB.bookOf(SB.ownBook(u, row.id));
  assert.equal(bk.pages.filter(p => p.end).length, 2);
  assert.equal(calls.length, 2, 'the first draft went to the book\'s own writer, not the chat\'s AI');
  assert.equal(card(chat).b.state, 'started');
  await C.allSettled(); CO.reset(u);
});

test('"make a book": every card; your words and files go into the book, never to the AI; names taken out; upload needs a story', async () => {
  const u = teacher();
  const calls = standIn(() => null);
  const nb = await as(u)('/api/companion/book/new', { body: {} });
  assert.equal(nb.status, 200);
  let c = card(nb.json.chat);
  assert.equal(c.b.state, 'source'); assert.deepEqual(c.b.options.map(o => o.v), ['upload', 'ai']);
  assert.equal(c.b.options[0].label, 'Upload your own book'); assert.equal(c.b.options[1].label, 'Have AI make one');
  c = await pickAll(u, ['upload', 'linear', '2', 'short', 'growing', 'ai']);
  assert.equal(c.b.state, 'context', 'upload: no theme step');
  assert.equal(c.b.canSkip, false, 'Upload your own book: no Nothing to add, the story is needed');
  assert.equal(c.b.L.check, undefined, 'no Check button');
  // Check before a story: the page's own rule
  c = card((await act(u, c.turn, 'bookCheck')).json.chat);
  assert.equal(c.b.ok, false); assert.ok(c.b.notes.some(n => /add your story/.test(n.text)));
  c = card((await act(u, c.turn, 'bookEdit', 'words')).json.chat);
  assert.equal(c.b.state, 'context');
  // words in the box while the card waits: into the book (no AI), the student's name taken out
  const n0 = calls.length;
  const story = 'Once upon a time Quinn Marsh found a tiny seed in the garden. Every day the seed grew a little taller in the sun.';
  const w = await as(u)('/api/companion/chat', { body: { text: story, page: { type: 'library' }, book: c.b.id } });
  assert.equal(w.status, 200, w.text);
  assert.equal(calls.length, n0, 'never to the chat\'s AI');
  assert.doesNotMatch(JSON.stringify(w.json.chat), /Quinn|Marsh/);
  c = card(w.json.chat);
  // No Check button (the owner, 23 Nov 2026): the words go straight on to the check card, which checks itself once
  // (public/js/companion.js autoCheck posts bookCheck, as here); the card at Your words has no Check button.
  assert.equal(c.b.state, 'check', 'words sent: straight on to the check'); assert.ok(!c.b.rows, 'checked by the page itself');
  c = card((await act(u, c.turn, 'bookCheck')).json.chat);
  assert.equal(c.b.state, 'check'); assert.equal(c.b.ok, true);
  // a document attached: its text goes in too (the companion's upload, the Builder's lesson reader), checked again
  const f = await as(u)('/api/companion/file?name=more.txt', { raw: Buffer.from('The seed became a sunflower and fed the birds in winter.') });
  assert.equal(f.status, 200, f.text);
  c = card((await act(u, c.turn, 'bookFile', f.json.file.id)).json.chat);
  assert.equal(c.b.state, 'check'); assert.equal(c.b.ok, true);
  const sent = c.b.rows.find(x => x.label === 'Your story').text;
  assert.match(sent, /\[student\] found a tiny seed/); assert.match(sent, /sunflower/);
  assert.ok(c.b.rows.some(x => x.label === 'Files' && x.value === 'more.txt'));
  // Stop: nothing made, the card closes
  c = card((await act(u, c.turn, 'bookStop')).json.chat);
  assert.equal(c.b.state, 'cancelled'); assert.equal(SB.myBooks(u).length, 0);
  assert.equal(calls.length, n0);
  CO.reset(u);
});

test('the theme: "Something else" takes the teacher\'s own theme, which becomes the book\'s topic (checked like their words)', async () => {
  const u = teacher();
  const calls = standIn(() => null);
  let c = card((await as(u)('/api/companion/book/new', { body: {} })).json.chat);
  c = await pickAll(u, ['ai', 'linear', '3', 'medium', 'growing']);
  assert.equal(c.b.state, 'theme');
  assert.equal(c.b.ownTheme, 60); assert.equal(c.b.L.other, 'Something else'); assert.equal(c.b.L.useTheme, 'Use this theme');
  assert.ok(c.b.options.some(o => o.v === 'none'), 'No theme is still there');
  // too short, or not on the theme question: nothing changes
  assert.equal((await act(u, c.turn, 'bookTheme', ' x ')).status, 404);
  const n0 = calls.length;
  c = card((await act(u, c.turn, 'bookTheme', '  Pirates   and buried treasure ')).json.chat);
  assert.equal(c.b.state, 'pictures', 'on to the next question');
  assert.equal((await act(u, c.turn, 'bookTheme', 'Robots')).status, 404, 'only while the theme is asked');
  c = card((await act(u, c.turn, 'bookPick', c.b.options[0].v)).json.chat);
  assert.equal(c.b.state, 'context'); assert.ok(c.b.have.length, 'the theme counts as their words');
  c = card((await act(u, c.turn, 'bookCheck')).json.chat);
  assert.equal(c.b.state, 'check');
  assert.equal(c.b.rows.find(x => x.part === 'words' && x.text !== undefined).text, 'Pirates and buried treasure');
  assert.doesNotMatch(c.b.rows.find(x => x.part === 'options').value, /Animals|Space|No theme/, 'no list theme');
  assert.equal(calls.length, n0, 'never to the chat\'s AI');
  CO.reset(u);
});

test('a picture attached goes on the book\'s first page through the page\'s own picture check; never to the AI', async () => {
  const u = teacher();
  standIn(() => null);
  CO.hooks.screenImage = async () => 'allow'; SB.hooks.screenImage = async () => 'allow';
  const { cleanJpeg } = await import('../../server/services/photos.js');
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64');
  let ok = true; try { cleanJpeg(jpeg, { maxBytes: 1e6, maxSide: 1600 }); } catch { ok = false; }
  assert.ok(ok, 'a readable test JPEG');
  const nb = await as(u)('/api/companion/book/new', { body: {} });
  let c = card(nb.json.chat);
  c = await pickAll(u, ['ai', 'linear', 'k', 'short', 'early', 'animals', 'own']);
  const img = await as(u)('/api/companion/image?name=fox.jpg', { raw: jpeg, type: 'image/jpeg' });
  assert.equal(img.status, 200, img.text);
  c = card((await act(u, c.turn, 'bookFile', img.json.file.id)).json.chat);
  assert.equal(c.b.state, 'check', 'a picture added: straight on to the check');
  c = card((await act(u, c.turn, 'bookCheck')).json.chat);
  assert.match(c.b.rows.find(x => x.label === 'Your pictures').value, /^1 picture/);
  const s = await act(u, c.turn, 'bookStart'); assert.equal(s.status, 200, s.text);
  await C.allSettled();
  const [row] = SB.myBooks(u);
  assert.equal(SB.picsOf(row.id).length, 1, 'claimed by the book');
  assert.ok(SB.bookOf(SB.ownBook(u, row.id)).pages[0].upload, 'on the first page');
  CO.hooks.screenImage = null; SB.hooks.screenImage = null; CO.reset(u);
});

test('teachers only, on the server: a family grown-up with the companion gets no book tool, no card, no taps', async () => {
  const mum = createUser({ username: `BookChatMum${++k}`, password: 'a-long-password-1', accountType: 'grownup' });
  config.manipulativesUsers = [...config.manipulativesUsers, mum.username.toLowerCase()];
  const g = getUser(mum.id);
  assert.equal(SB.canMake(g), false);
  assert.ok(!CO.toolsFor({ type: 'library' }, g).some(x => BK.BOOK_STEPS && ['makeBook', 'changeBook', 'findMyBooks', 'redrawPicture'].includes(x.name)));
  const ctx = { user: g, page: { type: 'library' }, lang: 'en', names: [], files: [], seen: new Map(), out: {}, meta: {}, who: {}, text: 'make a book', links: new Set() };
  for (const name of ['makeBook', 'findMyBooks', 'changeBook', 'redrawPicture']) {
    const r = CO.runTool(name, { request: 'x', page: 1 }, ctx);
    assert.match(r.result.error, /teachers only/, name);
  }
  assert.equal(ctx.out.book, undefined);
  if (CO.companionFor(g)) assert.equal((await as(g)('/api/companion/book/new', { body: {} })).status, 404);
  // a student or kid never reaches the companion at all
  const kid = createUser({ username: `BookChatKid${++k}`, password: 'secret123' });
  assert.equal((await as(kid)('/api/companion/book/new', { body: {} })).status, 404);
});

test('the daily cap: Make my book and a change spend the page\'s turns; at the cap nothing is made or changed', async () => {
  const u = teacher();
  config.storybookPlanPerDay = 1;
  standIn(w => (/adventure/.test(w) ? ['makeBook', { source: 'ai', kind: 'linear', grade: '2', length: 'short', level: 'growing', pictures: 'ai', about: 'a kind fox' }] : /simpler/.test(w) ? ['changeBook', { request: w }] : null));
  await as(u)('/api/companion/chat', { body: { text: 'a picture book adventure about a kind fox', page: { type: 'library' } } }); await C.allSettled();
  let c = card(await chatOf(u));
  assert.equal(c.b.state, 'check', 'everything answered: the check (the page asks for it by itself)');
  c = card((await act(u, c.turn, 'bookCheck')).json.chat);
  assert.equal(c.b.ok, true);
  assert.equal((await act(u, c.turn, 'bookStart')).status, 200); await C.allSettled();
  assert.equal(used(u), 1);
  const [row] = SB.myBooks(u);
  const before = SB.ownBook(u, row.id).rev;
  await as(u)('/api/companion/chat', { body: { text: 'simpler words please', page: { type: 'book', bookId: row.id } } }); await C.allSettled();
  assert.equal(SB.ownBook(u, row.id).rev, before, 'at the cap: nothing changed');
  // a second book at the cap: the card says so, nothing made
  await as(u)('/api/companion/chat', { body: { text: 'another adventure please', page: { type: 'library' } } }); await C.allSettled();
  c = card(await chatOf(u));
  c = card((await act(u, c.turn, 'bookCheck')).json.chat);
  assert.equal(c.b.ok, false); assert.ok(c.b.notes.some(n => /today's Oomba turns/.test(n.text)));
  assert.equal(SB.myBooks(u).length, 1);
  CO.reset(u);
});

/** A book made the page's way (createBook and the book's own writer), with a title. */
async function madeBook(u, title, setup = {}) {
  const r = await SB.createBook(u, { source: 'ai', kind: 'cyoa', grade: '2', length: 'short', endings: 2, level: 'growing', pictures: 'ai', about: title, ...setup });
  assert.ok(r.ok, JSON.stringify(r));
  const row = SB.ownBook(u, r.id), w = await SB.writeBook(u, row, { text: '' });
  SB.applyBook(u, r.id, SB.bookOf(row), w.book, {});
  q.run('UPDATE made_books SET title=? WHERE id=?', title, r.id);
  return r.id;
}

test('changes from the book\'s page and from any other page: the same writer, Undo, Open the book; a book made in the past; only the teacher\'s own books', async () => {
  const u = teacher(), other = teacher();
  const water = await madeBook(u, 'The Water Cycle Trip');
  const dragon = await madeBook(u, 'Dragon Adventure');
  const dragon2 = await madeBook(u, 'Dragon Adventure Two');
  const theirs = await madeBook(other, 'The Water Cycle Trip');
  q.run('DELETE FROM made_book_ai_days');
  // findMyBooks: the teacher's own, never another teacher's
  const ctx = { user: u, page: { type: 'library' }, lang: 'en', names: [], files: [], seen: new Map(), out: {}, meta: {}, who: {}, text: '', links: new Set() };
  const found = CO.runTool('findMyBooks', { words: 'water cycle' }, ctx).result.books;
  assert.deepEqual(found.map(b => b.id), [water]);
  assert.match(CO.runTool('changeBook', { request: 'simpler words', bookId: theirs }, { ...ctx, out: {} }).result.error, /not one of the teacher's books/);
  // on the book's page: that book
  standIn(w => (/simpler/.test(w) ? ['changeBook', { request: w }] : null), 'Done.');
  const p0 = SB.bookOf(SB.ownBook(u, water));
  await as(u)('/api/companion/chat', { body: { text: 'simpler words on page 2 please', page: { type: 'book', bookId: water } } }); await C.allSettled();
  let chat = await chatOf(u), last = chat.turns.at(-1);
  assert.equal(last.change.kind, 'book'); assert.equal(last.change.bookId, water); assert.equal(last.change.canUndo, true);
  assert.notDeepEqual(SB.bookOf(SB.ownBook(u, water)).pages, p0.pages);
  assert.equal(used(u), 1);
  const un = await as(u)('/api/companion/chat/undo', { body: { turnId: last.id } });
  assert.equal(un.status, 200, un.text);
  assert.deepEqual(SB.bookOf(SB.ownBook(u, water)).pages.map(p => p.text), p0.pages.map(p => p.text), 'Undo puts the book back');
  // from another page, naming an older book: one fits
  standIn(w => (/water cycle book/.test(w) ? ['changeBook', { request: 'simpler words on page 2', which: 'water cycle' }] : /dragon/.test(w) ? ['changeBook', { request: 'simpler words', which: 'dragon adventure' }] : /zorblax/i.test(w) ? ['changeBook', { request: 'simpler words', which: 'Zorblax' }] : null), 'Done.');
  const rev0 = SB.ownBook(u, water).rev, revTheirs = SB.ownBook(other, theirs).rev;
  await as(u)('/api/companion/chat', { body: { text: 'in my water cycle book, use simpler words on page 2', page: { type: 'dashboard' } } }); await C.allSettled();
  chat = await chatOf(u); last = chat.turns.at(-1);
  assert.equal(last.change.bookId, water); assert.ok(SB.ownBook(u, water).rev > rev0);
  assert.equal(last.note.bookRef.href, `/library/make/${water}`, 'Open the book');
  assert.equal(SB.ownBook(other, theirs).rev, revTheirs, 'never another teacher\'s book');
  // several fit: a choice card of the teacher's books; the tap makes the change in that book
  await as(u)('/api/companion/chat', { body: { text: 'make the dragon adventure simpler', page: { type: 'dashboard' } } }); await C.allSettled();
  chat = await chatOf(u); last = chat.turns.at(-1);
  const ask = last.note.ask;
  assert.equal(ask.kind, 'book'); assert.deepEqual(ask.options.map(o => o.book).sort(), [dragon, dragon2].sort());
  assert.ok(ask.options.every(o => o.kindText === 'Choose-your-own-adventure' && o.at));
  const d2 = SB.ownBook(u, dragon2).rev, d1 = SB.ownBook(u, dragon).rev;
  const i = ask.options.findIndex(o => o.book === dragon2);
  const tap = await act(u, last, 'askPick', String(i));
  assert.equal(tap.status, 200, tap.text); await C.allSettled();
  assert.ok(SB.ownBook(u, dragon2).rev > d2); assert.equal(SB.ownBook(u, dragon).rev, d1);
  // none fits: say so, with Make a book
  await as(u)('/api/companion/chat', { body: { text: 'edit my book about Zorblax', page: { type: 'dashboard' } } }); await C.allSettled();
  last = (await chatOf(u)).turns.at(-1);
  assert.equal(last.note.bookNone, true);
  // the cap counts every change, wherever it came from
  config.storybookPlanPerDay = used(u);
  const r1 = SB.ownBook(u, water).rev;
  await as(u)('/api/companion/chat', { body: { text: 'in my water cycle book, use simpler words', page: { type: 'dashboard' } } }); await C.allSettled();
  assert.equal(SB.ownBook(u, water).rev, r1, 'at the cap');
  CO.reset(u);
});

test('pages: Make a book opens the chat for companion teachers; the book page is the companion\'s (no second chat); others keep the page flow', async () => {
  const u = teacher(), plain = teacher({ tester: false });
  const lib = await as(u)('/library');
  assert.match(lib.text, /href="\/library\/make\?new=1"[^>]*data-oc-book/);
  const go = await as(u)('/library/make?new=1');
  assert.equal(go.status, 302); assert.equal(go.headers.get('location'), '/library?make=1');
  const list = await as(u)('/library/make');
  assert.equal(list.status, 200); assert.doesNotMatch(list.text, /id="sb-setup"/);
  const id = await madeBook(u, 'A Seed Story', { kind: 'linear' });
  const ed = await as(u)(`/library/make/${id}`);
  const oc = JSON.parse(/data-oc="([^"]*)"/.exec(ed.text)[1].replace(/&quot;/g, '"'));
  assert.deepEqual({ type: oc.type, bookId: oc.bookId }, { type: 'book', bookId: id });
  // a teacher without the companion: the setup steps and the editor's own chat, as before
  assert.equal(CO.companionFor(plain), false);
  const lp = await as(plain)('/library/make');
  assert.match(lp.text, /id="sb-setup"/);
  const id2 = await madeBook(plain, 'Plain Book');
  assert.doesNotMatch((await as(plain)(`/library/make/${id2}`)).text, /data-oc=/);
});
