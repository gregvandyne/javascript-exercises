// The teacher's own books as cards, with create, read, update and delete (docs/storybook-builder.md "Your books";
// docs/decisions.md "Book maker: my books as cards, with CRUD"). No network: Oomba is the built-in stand-in (or a hook
// that fails), Google is the stand-in (tests/support/fake-gemini.js), the picture check a hook.
//   - cards on /library and /library/make: the cover, chips, title, meta and actions, for the teacher's own books only;
//   - rename, duplicate (pictures copied, not shared, nothing painted again), delete (pictures, shares, places gone);
//   - another teacher, a student, a kid, a family grown-up and signed-out visitors are refused by every new route;
//   - a book whose first draft never came: "Didn't finish" with Try again and Delete, cleaned up after an hour;
//   - Paint pictures again: only art-pack fallbacks are queued, through the daily picture count.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { call, teacher, teacher2, mia, kid, mum, cls, q, RL, config } from './_live.js';
import * as SB from '../../server/services/storybook.js';
import * as C from '../../server/services/oomba-chat.js';
import * as D from '../../server/services/storybook-draw.js';
import * as G from '../../server/services/storybook-gemini.js';
import { fakeGemini } from '../support/fake-gemini.js';

const SETUP = { source: 'ai', kind: 'linear', grade: '2', length: 'short', level: 'growing', theme: 'animals', about: 'A fox who shares.' };
const settle = async () => { await C.allSettled(); await D.settle(); await new Promise(r => setTimeout(r, 20)); await D.settle(); };
async function start(user = teacher, setup = SETUP) {
  const r = await call('/api/library/make/start', { method: 'POST', body: { setup }, user });
  assert.equal(r.status, 200, r.text);
  await settle();
  return r.json.redirect.split('/').pop();
}
const rowOf = id => q.get('SELECT * FROM made_books WHERE id=?', id);
const pics = id => q.all('SELECT * FROM made_book_pics WHERE book_id=?', id);
const used = u => (q.get('SELECT n FROM made_book_ai_days WHERE user_id=? AND day=?', u.id, `${new Date().toISOString().slice(0, 10)}:draw`) || {}).n || 0;
const card = (html, id) => { const m = html.match(new RegExp(`<li class="lb-card sb-bcard[^"]*" data-book="${id}"[\\s\\S]*?</li>`)); return m ? m[0] : null; };
let fake;
test.beforeEach(() => {
  D._resetPace(); RL._reset(); q.run('DELETE FROM made_book_ai_days'); SB._resetPrune();
  Object.assign(config, { storybookFreePerDay: 50, storybookPlanPerDay: 50, storybookPicturesFreePerDay: 40, storybookPicturesPlanPerDay: 40, storybookDrawAtOnce: 2, geminiKey: '', aiDailyBudgetUsd: 1000, aiMonthlyBudgetUsd: 100000 });
  SB.hooks.create = null; SB.hooks.classify = async () => null; SB.hooks.screen = null;
  D.hooks.screenImage = async () => 'allow';
  fake = fakeGemini(G);
});
test.after(() => { G.hooks.generate = null; D.hooks.screenImage = null; D._resetPace(); Object.assign(SB.hooks, { create: null, classify: null, screen: null }); });

test('cards: the teacher\'s own books on /library and /library/make, with the cover, chips, title, meta and actions', async () => {
  const id = await start();
  const theirs = await start(teacher2);
  await call(`/api/library/make/${id}/share`, { method: 'POST', user: teacher, body: { classIds: [cls.id] } });
  for (const path of ['/read', '/library/make']) {
    const r = await call(path, { user: teacher });
    assert.equal(r.status, 200);
    const c = card(r.text, id);
    assert.ok(c, `${path}: the book is a card`);
    assert.match(c, /class="lb-cover sb-bcover"[\s\S]*?(<img class="sb-art"|<svg [^>]*sb-art)/, 'the cover is the first page\'s picture');
    assert.match(c, /class="lb-lvl lb-g2">Grade 2</); assert.match(c, /class="lb-lvl sb-bkind"[^>]*>Picture book</);
    assert.match(c, new RegExp(`<h3 class="lb-title"><a href="/library/make/${id}" dir="auto">${SB.bookOf(rowOf(id)).title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</a>`));
    assert.match(c, /\d+ pages · [^<]+ · shared with 1 class/);
    assert.match(c, new RegExp(`href="/library/made/${id}/read"`)); assert.match(c, new RegExp(`href="/library/make/${id}"[^>]*>[\\s\\S]*?Open`));
    for (const a of ['rename', 'share', 'duplicate', 'delete']) assert.match(c, new RegExp(`data-b="${a}"`), `More: ${a}`);
    assert.match(c, /<details class="sb-bmore"><summary[^>]*aria-label="More for /);
    assert.equal(card(r.text, theirs), null, 'never another teacher\'s book');
    assert.match(r.text, /\/js\/storybook-books\.js/);
  }
  // the library's own CSS styles the cards (the shelf used to be a plain list without styles on /library)
  const css = fs.readFileSync(new URL('../../public/css/library.css', import.meta.url), 'utf8');
  assert.match(css, /\.sb-bcard\{/); assert.match(css, /\.sb-bmenu\{/);
  // students, kids, grown-ups and visitors: no cards
  for (const who of [mia, kid, mum, null]) assert.doesNotMatch((await call('/read', { user: who })).text, /sb-bcard|storybook-books\.js/);
  // the cards' delete asks in the site's own dialog, never the browser's
  const js = fs.readFileSync(new URL('../../public/js/storybook-books.js', import.meta.url), 'utf8');
  assert.match(js, /await ask\(\{ title: L\('deleteQ'/);
});

test('rename, duplicate (its pictures copied, not shared, nothing painted again) and delete (pictures, shares and places gone)', async () => {
  const id = await start();
  const b0 = SB.bookOf(rowOf(id));
  // rename: checked words, the book's own title too
  let r = await call(`/api/library/make/${id}/rename`, { method: 'POST', user: teacher, body: { title: '  Pip and the Berry Hunt ' } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.title, 'Pip and the Berry Hunt');
  assert.equal(rowOf(id).title, 'Pip and the Berry Hunt'); assert.equal(SB.bookOf(rowOf(id)).title, 'Pip and the Berry Hunt');
  assert.equal((await call(`/api/library/make/${id}/rename`, { method: 'POST', user: teacher, body: { title: '   ' } })).json.code, 'title');
  assert.equal((await call(`/api/library/make/${id}/rename`, { method: 'POST', user: teacher, body: { title: 'Mia Pupil goes to space' } })).json.code, 'names');
  // duplicate: a new id, "(copy)", the same pages and cast, copies of every picture, not shared, no picture painted
  await call(`/api/library/make/${id}/share`, { method: 'POST', user: teacher, body: { classIds: [cls.id] } });
  const calls0 = fake.calls.length, used0 = used(teacher);
  assert.ok(pics(id).length >= b0.pages.length, 'the original has painted pictures');
  r = await call(`/api/library/make/${id}/duplicate`, { method: 'POST', user: teacher });
  assert.equal(r.status, 200, r.text);
  const cp = r.json.id; assert.notEqual(cp, id);
  assert.equal(r.json.title, 'Pip and the Berry Hunt (copy)');
  assert.match(r.json.card, new RegExp(`data-book="${cp}"`));
  const bc = SB.bookOf(rowOf(cp));
  assert.deepEqual(bc.pages.map(p => p.text), b0.pages.map(p => p.text)); assert.deepEqual(bc.cast, b0.cast);
  const a = pics(id), c = pics(cp);
  assert.equal(c.length, a.length); assert.ok(c.every(p => !a.some(x => x.id === p.id)), 'new picture rows');
  assert.deepEqual(c.map(p => p.bytes.length).sort(), a.map(p => p.bytes.length).sort());
  assert.equal(SB.sharedWith(cp).length, 0, 'not shared'); assert.equal(SB.sharedWith(id).length, 1);
  const st = D.stateOf(teacher, rowOf(cp));
  assert.ok(Object.values(st.pages).every(x => x.state === 'done' && x.pic && !x.stale), 'the copy shows its own painted pictures, in sync');
  assert.ok(Object.values(st.pages).every(x => c.some(p => p.id === x.pic)));
  await settle();
  assert.equal(fake.calls.length, calls0, 'nothing painted again'); assert.equal(used(teacher), used0, 'nothing counted');
  const rd = await call(`/library/made/${cp}/read`, { user: teacher }); assert.equal(rd.status, 200);
  // the copy's title stays within the limit
  q.run('UPDATE made_books SET book=? WHERE id=?', JSON.stringify({ ...SB.bookOf(rowOf(id)), title: 'x'.repeat(SB.LIMITS.title) }), id);
  r = await call(`/api/library/make/${id}/duplicate`, { method: 'POST', user: teacher });
  assert.ok(r.json.title.length <= SB.LIMITS.title && r.json.title.endsWith(' (copy)'));
  // delete: the book, its pictures, shares, readers' places and picture queue
  await call(`/api/library/made/${id}/progress`, { method: 'POST', user: mia, body: { page: b0.pages[0].id } });
  assert.ok(q.get('SELECT 1 FROM made_book_reads WHERE book_id=?', id));
  r = await call(`/api/library/make/${id}/delete`, { method: 'POST', user: teacher });
  assert.equal(r.status, 200);
  assert.equal(rowOf(id), undefined); assert.equal(pics(id).length, 0);
  for (const tb of ['made_book_classes', 'made_book_reads', 'made_book_draws']) assert.equal(q.get(`SELECT COUNT(*) n FROM ${tb} WHERE book_id=?`, id).n, 0, tb);
  assert.ok(rowOf(cp) && pics(cp).length === a.length, 'the copy stays whole');
  assert.equal((await call(`/library/made/${id}/read`, { user: mia })).status, 404);
});

test('teachers only, own books only: every new route refuses another teacher, a student, a kid, a grown-up and visitors', async () => {
  const id = await start();
  const before = JSON.stringify(rowOf(id)), theirs = q.get('SELECT COUNT(*) n FROM made_books WHERE owner_id=?', teacher2.id).n;
  const routes = [['rename', { title: 'Mine now' }], ['duplicate', {}], ['retry', {}], ['repaint', {}], ['delete', {}]];
  for (const who of [teacher2, mia, kid, mum]) {
    for (const [p, body] of routes) { const r = await call(`/api/library/make/${id}/${p}`, { method: 'POST', user: who, body }); assert.equal(r.status, 404, `${who.username} ${p}`); }
    assert.equal((await call('/library/make', { user: who })).text.includes(id), false);
  }
  for (const [p, body] of routes) { const r = await call(`/api/library/make/${id}/${p}`, { method: 'POST', body }); assert.ok([401, 403].includes(r.status), `signed out ${p}: ${r.status}`); }
  assert.equal(JSON.stringify(rowOf(id)), before, 'nothing changed');
  assert.equal(q.get('SELECT COUNT(*) n FROM made_books WHERE owner_id=?', teacher2.id).n, theirs, 'no copy for anyone else');
  // the service functions refuse too
  assert.equal(SB.renameBook(teacher2, id, 'x').code, 'notFound'); assert.equal(SB.duplicateBook(mia, id).code, 'notFound');
  assert.equal(SB.deleteBook(teacher2, id).code, 'notFound'); assert.equal(D.repaint(teacher2, id).code, 'notFound');
});

test('a book whose first draft never came: "Didn\'t finish" with Try again and Delete, never a normal book; cleaned up after an hour', async () => {
  SB.hooks.create = async () => { throw Object.assign(new Error('overloaded'), { status: 529 }); };
  config.anthropicKey = 'test-key';
  let id;
  try { id = await start(); } finally { config.anthropicKey = ''; }
  const row = rowOf(id);
  assert.equal(SB.bookOf(row).pages.length, 0, 'the row was made, the draft never came');
  assert.equal(SB.stateOfBook(row), 'unfinished');
  let c = card((await call('/library/make', { user: teacher })).text, id);
  assert.match(c, /is-unfinished/); assert.match(c, /Didn&#39;t finish|Didn't finish/);
  assert.match(c, /data-b="retry"/); assert.match(c, /data-b="delete"/);
  assert.doesNotMatch(c, /\/read"/, 'no Read for a book with no pages'); assert.doesNotMatch(c, /0 pages/);
  // the editor says so too, with Try again
  assert.equal((await call(`/api/library/make/${id}`, { user: teacher })).json.state, 'unfinished');
  // Try again: one of today's turns, then the first draft (the page's own chat for a teacher without the companion)
  SB.hooks.create = null;
  const r = await call(`/api/library/make/${id}/retry`, { method: 'POST', user: teacher });
  assert.equal(r.status, 200, r.text); await settle();
  assert.ok(SB.bookOf(rowOf(id)).pages.length > 0, 'Try again wrote it');
  assert.equal(SB.stateOfBook(rowOf(id)), 'ready');
  assert.equal((await call(`/api/library/make/${id}/retry`, { method: 'POST', user: teacher })).json.code, 'notEmpty');
  // empty rows: kept for an hour (Try again), then removed with what is under them; a book with pages never is
  const t0 = Date.now();
  const mk = (age, book = { title: '', kind: 'linear', start: '', cast: [], pages: [] }) => { const bid = `empty${Math.random().toString(36).slice(2, 10)}`; q.run('INSERT INTO made_books(id, owner_id, title, kind, source, setup, book, rev, created_at, updated_at) VALUES (?,?,?,?,?,?,?,0,?,?)', bid, teacher.id, '', 'linear', 'ai', '{}', JSON.stringify(book), t0 - age, t0 - age); return bid; };
  const old = mk(2 * 3600e3), young = mk(10 * 60e3);
  q.run('INSERT INTO made_book_pics(id, owner_id, book_id, name, width, height, bytes, created_at) VALUES (?,?,?,?,?,?,?,?)', 'pic-of-old-1', teacher.id, old, 'a.jpg', 1, 1, Buffer.from('x'), t0);
  q.run('UPDATE made_books SET created_at=? WHERE id=?', t0 - 3 * 3600e3, id);   // an old book with pages
  const list = await call('/library/make', { user: teacher });
  assert.equal(rowOf(old), undefined, 'an empty book older than an hour is removed when the books are listed');
  assert.equal(q.get("SELECT COUNT(*) n FROM made_book_pics WHERE id='pic-of-old-1'").n, 0);
  assert.ok(rowOf(young), 'a young one stays, with Try again'); assert.ok(card(list.text, young));
  assert.ok(rowOf(id), 'a book with pages is never removed');
  // the hourly job (and the one soon after start-up) does the same for every teacher
  const old2 = mk(5 * 3600e3);
  assert.ok(SB.pruneEmpty() >= 1); assert.equal(rowOf(old2), undefined);
  SB.deleteBook(teacher, young);
});

test('Paint pictures again: only art-pack fallbacks go back in the queue, through the daily picture count', async () => {
  const id = await start();
  const row = rowOf(id), b = SB.bookOf(row);
  const n0 = fake.calls.length;
  assert.equal(D.repaint(teacher, id).code, 'none', 'nothing to paint: every picture is painted');
  // two pages and one character sheet fell back to the art pack (Google refused them); one page never got a queue row
  const [p1, p2, p3] = b.pages;
  for (const tg of [`page:${p1.id}`, `page:${p2.id}`, `cast:${b.cast[0].name.toLowerCase()}`]) {
    const d = q.get('SELECT pic_id FROM made_book_draws WHERE book_id=? AND target=?', id, tg);
    q.run("DELETE FROM made_book_pics WHERE id=?", d.pic_id);
    q.run("UPDATE made_book_draws SET state='fallback', reason='error', pic_id=NULL WHERE book_id=? AND target=?", id, tg);
  }
  q.run('DELETE FROM made_book_draws WHERE book_id=? AND target=?', id, `page:${p3.id}`);
  assert.deepEqual(D.fallbacks(row).sort(), [`cast:${b.cast[0].name.toLowerCase()}`, `page:${p1.id}`, `page:${p2.id}`, `page:${p3.id}`].sort());
  const done0 = q.all("SELECT target, pic_id FROM made_book_draws WHERE book_id=? AND state='done'", id);
  // the day's pictures: 2 left, so 2 are queued (the sheet first) and 2 wait
  q.run('DELETE FROM made_book_ai_days');
  config.storybookPicturesPlanPerDay = 2; config.storybookPicturesFreePerDay = 2;
  const r = await call(`/api/library/make/${id}/repaint`, { method: 'POST', user: teacher });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.queued, 2); assert.equal(r.json.more, 2);
  await settle();
  assert.equal(fake.calls.length - n0, 2, 'two pictures painted'); assert.equal(used(teacher), 2, 'and counted');
  assert.equal(fake.calls.at(-2).body.generationConfig.imageConfig.aspectRatio, '1:1', 'the character sheet first');
  for (const d of done0) assert.equal(q.get('SELECT pic_id FROM made_book_draws WHERE book_id=? AND target=?', id, d.target).pic_id, d.pic_id, 'painted pictures are left alone');
  // at the limit: refused at once, nothing queued
  const l = await call(`/api/library/make/${id}/repaint`, { method: 'POST', user: teacher });
  assert.equal(l.status, 429); assert.equal(l.json.code, 'limit');
  // a new day: the rest
  q.run('DELETE FROM made_book_ai_days');
  const r2 = await call(`/api/library/make/${id}/repaint`, { method: 'POST', user: teacher });
  assert.equal(r2.json.queued, 2); assert.equal(r2.json.more, 0);
  await settle();
  assert.equal(D.fallbacks(rowOf(id)).length, 0, 'every picture painted');
  // "I'll add my own" books are never painted
  const own = await start(teacher, { ...SETUP, pictures: 'own' });
  assert.equal(D.repaint(teacher, own).code, 'off');
});
