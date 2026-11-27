// The Oomba chat's book actions besides changes (docs/storybook-builder.md "Your books"): rename, duplicate, delete and
// paint again, through the same service functions as the cards. A book is found among the teacher's own only
// (findMyBooks' matching); several that fit become a choice card; delete never runs from the AI: it shows a Delete /
// Keep card and only Delete removes the book. Teachers only, on the server. The chat's AI is a stand-in
// (services/companion.js hooks.create); the book's AI is the built-in stand-in. No network.
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
async function madeBook(u, title, setup = {}) {
  const r = await SB.createBook(u, { source: 'ai', kind: 'cyoa', grade: '2', length: 'short', endings: 2, level: 'growing', pictures: 'ai', about: title, ...setup });
  assert.ok(r.ok, JSON.stringify(r));
  const row = SB.ownBook(u, r.id), w = await SB.writeBook(u, row, { text: '' });
  SB.applyBook(u, r.id, SB.bookOf(row), w.book, {});
  q.run('UPDATE made_books SET title=? WHERE id=?', title, r.id);
  return r.id;
}
const D = await import('../../server/services/storybook-draw.js');
const tctx = (u, over = {}) => ({ user: u, page: { type: 'library' }, lang: 'en', names: [], files: [], seen: new Map(), out: {}, meta: {}, who: {}, text: '', links: new Set(), ...over });
const say = async (u, text, page = { type: 'dashboard' }) => { const r = await as(u)('/api/companion/chat', { body: { text, page } }); assert.equal(r.status, 200, r.text); await C.allSettled(); return (await chatOf(u)).turns.at(-1); };

test('rename and duplicate from the chat: the cards\' own functions; several books fit: a choice card, the tap does it', async () => {
  const u = teacher(), other = teacher();
  const kip = await madeBook(u, 'Kip and the Color King');
  const milo = await madeBook(u, 'Milo and Zig Take Over the World');
  const milo2 = await madeBook(u, 'Milo and Zig Take Over the World');
  const theirs = await madeBook(other, 'Kip and the Color King');
  // one fits: renamed at once, with Open the book
  const u0 = used(u);
  standIn(w => (/rename the kip/i.test(w) ? ['renameBook', { which: 'Kip', title: 'Kip and the Rainbow' }] : null), 'Renamed it.');
  let last = await say(u, 'rename the Kip book to Kip and the Rainbow');
  assert.equal(SB.ownBook(u, kip).title, 'Kip and the Rainbow'); assert.equal(SB.bookOf(SB.ownBook(u, kip)).title, 'Kip and the Rainbow');
  assert.equal(last.note.bookRef.href, `/library/make/${kip}`);
  assert.ok(last.note.steps.some(s => s.k === 'book_rename'));
  assert.equal(SB.ownBook(other, theirs).title, 'Kip and the Color King', 'never another teacher\'s book');
  assert.equal(used(u), u0, 'no turn spent');
  // duplicate, several fit: the choice card; the tap makes the copy of that book
  standIn(w => (/copy of/i.test(w) ? ['duplicateBook', { which: 'Milo and Zig' }] : null), 'Which one?');
  last = await say(u, 'make a copy of my Milo and Zig book');
  const ask = last.note.ask;
  assert.equal(ask.kind, 'book'); assert.equal(ask.op, 'duplicate');
  assert.deepEqual(ask.options.map(o => o.book).sort(), [milo, milo2].sort());
  const n0 = SB.myBooks(u).length;
  const tap = await act(u, last, 'askPick', String(ask.options.findIndex(o => o.book === milo2)));
  assert.equal(tap.status, 200, tap.text);
  const copy = SB.myBooks(u).find(r => r.title === 'Milo and Zig Take Over the World (copy)');
  assert.ok(copy, 'the copy'); assert.equal(SB.myBooks(u).length, n0 + 1); assert.equal(SB.sharedWith(copy.id).length, 0);
  const t = tap.json.chat.turns.at(-1);
  assert.match(t.text, /I made a copy: “Milo and Zig Take Over the World \(copy\)”/); assert.equal(t.note.bookRef.href, `/library/make/${copy.id}`);
  assert.equal(tap.json.chat.turns.at(-2).note.ask.state, 'answered');
  // another teacher's book id from the AI: refused
  assert.match(CO.runTool('renameBook', { bookId: theirs, title: 'Mine' }, tctx(u)).result.error, /not one of the teacher's books/);
  assert.match(CO.runTool('duplicateBook', { bookId: theirs }, tctx(u)).result.error, /not one of the teacher's books/);
  // the title's words are checked as on the cards
  assert.match(CO.runTool('renameBook', { bookId: kip, title: 'Quinn Marsh and the sea' }, tctx(u)).result.error || '', /real child|title/);
  CO.reset(u);
});

test('delete from the chat: never at once; a Delete / Keep card; Keep keeps it; Delete removes it with its pictures and shares', async () => {
  const u = teacher();
  const milo = await madeBook(u, 'Milo and Zig Take Over the World');
  const milo2 = await madeBook(u, 'Milo and Zig Take Over the World');
  const kip = await madeBook(u, 'Kip and the Color King');
  const c = S.classesOf(u.id, 'teacher')[0];
  SB.setShared(u, kip, [c.id]);
  standIn(w => (/delete my kip/i.test(w) ? ['deleteBook', { which: 'Kip' }] : /delete my milo/i.test(w) ? ['deleteBook', { which: 'Milo and Zig' }] : null), 'Tap Delete on the card if you are sure.');
  let last = await say(u, 'delete my Kip book');
  assert.ok(SB.ownBook(u, kip), 'nothing deleted by the AI');
  const d = last.note.bookDelete;
  assert.equal(d.state, 'open'); assert.equal(d.bookId, kip); assert.equal(d.title, 'Kip and the Color King');
  // Keep
  let r = await act(u, last, 'bookKeep');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.chat.turns.find(x => x.id === last.id).note.bookDelete.state, 'kept'); assert.ok(SB.ownBook(u, kip));
  assert.equal((await act(u, last, 'bookDelete')).status, 404, 'a card answered once stays answered');
  // Delete
  last = await say(u, 'delete my Kip book');
  // another teacher can't answer it
  const other = teacher();
  assert.equal((await act(other, last, 'bookDelete')).status, 404);
  r = await act(u, last, 'bookDelete');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.chat.turns.find(x => x.id === last.id).note.bookDelete.state, 'deleted');
  assert.equal(SB.ownBook(u, kip), null);
  for (const tb of ['made_book_pics', 'made_book_classes', 'made_book_reads', 'made_book_draws']) assert.equal(q.get(`SELECT COUNT(*) n FROM ${tb} WHERE book_id=?`, kip).n, 0, tb);
  // several fit: the choice card first, then the Delete / Keep card for the book tapped
  last = await say(u, 'delete my Milo and Zig book');
  assert.equal(last.note.ask.op, 'delete');
  const i = last.note.ask.options.findIndex(o => o.book === milo2);
  r = await act(u, last, 'askPick', String(i));
  assert.equal(r.status, 200, r.text);
  assert.ok(SB.ownBook(u, milo2), 'the tap only asks');
  const card2 = r.json.chat.turns.at(-1);
  assert.equal(card2.note.bookDelete.bookId, milo2);
  r = await act(u, card2, 'bookDelete');
  assert.equal(SB.ownBook(u, milo2), null); assert.ok(SB.ownBook(u, milo), 'only the book tapped');
  CO.reset(u);
});

test('paint again from the chat, and teachers only: a grown-up gets no book tools and every tool refuses them', async () => {
  const u = teacher();
  const kip = await madeBook(u, 'Kip and the Color King');
  // the picture maker is not set up here: the same reason as the book page
  const r = CO.runTool('repaintBook', { which: 'Kip' }, tctx(u));
  assert.match(r.result.error, /not set up/);
  // with a stand-in picture maker, a fallback picture is queued through the cards' own function
  const G = await import('../../server/services/storybook-gemini.js');
  const { fakeGemini } = await import('../support/fake-gemini.js');
  const fake = fakeGemini(G); D.hooks.screenImage = async () => 'allow';
  try {
    const row = SB.ownBook(u, kip);
    assert.ok(D.fallbacks(row).length > 0, 'made without the picture maker: every picture is the art pack');
    const want = D.fallbacks(row).length;
    const c = tctx(u), ok = CO.runTool('repaintBook', { bookId: kip }, c);
    // checked in a dry run: what would be queued, never "done"; nothing is queued until the answer is saved
    assert.equal(ok.result.done, undefined); assert.equal(ok.result.queued, want); assert.equal(ok.result.painted, 0);
    assert.match(ok.result.note, /not painted yet/);
    assert.equal(D.fallbacks(SB.ownBook(u, kip)).length, want, 'nothing queued by the tool itself');
    const real = c.out.later.run();   // what the answer's apply() runs, in the engine's transaction
    assert.equal(real.ok, true); assert.equal(real.result.queued, want);
    await D.settle(); await new Promise(res => setTimeout(res, 30)); await D.settle();
    assert.ok(fake.calls.length >= 1);
  } finally { G.hooks.generate = null; D.hooks.screenImage = null; }
  // teachers only
  const mum = createUser({ username: `CrudMum${++k}`, password: 'a-long-password-1', accountType: 'grownup' });
  config.manipulativesUsers = [...config.manipulativesUsers, mum.username.toLowerCase()];
  const g = getUser(mum.id);
  assert.ok(!CO.toolsFor({ type: 'library' }, g).some(x => ['renameBook', 'duplicateBook', 'deleteBook', 'repaintBook'].includes(x.name)));
  assert.ok(CO.toolsFor({ type: 'library' }, u).some(x => x.name === 'deleteBook'));
  for (const name of ['renameBook', 'duplicateBook', 'deleteBook', 'repaintBook']) {
    const x = CO.runTool(name, { bookId: kip, title: 'Mine' }, tctx(g));
    assert.match(x.result.error, /teachers only/, name);
  }
  assert.ok(SB.ownBook(u, kip));
  // Try again for a companion teacher: the first draft as a turn of this chat
  const empty = (await SB.createBook(u, { source: 'ai', kind: 'linear', grade: '2', length: 'short', level: 'growing', about: 'a quiet owl' })).id;
  assert.equal(SB.stateOfBook(SB.ownBook(u, empty)), 'unfinished');
  const tr = await as(u)(`/api/library/make/${empty}/retry`, { body: {} });
  assert.equal(tr.status, 200, tr.text); await C.allSettled();
  assert.ok(SB.bookOf(SB.ownBook(u, empty)).pages.length > 0);
  assert.equal((await as(getUser(teacher().id))(`/api/library/make/${empty}/retry`, { body: {} })).status, 404);
  CO.reset(u);
});
