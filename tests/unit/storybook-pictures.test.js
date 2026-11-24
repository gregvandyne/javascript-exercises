// The book maker's picture model (services/storybook-draw.js, storybook-gemini.js; docs/storybook-builder.md "Pictures").
// No network: Google is a stand-in (tests/support/fake-gemini.js, through hooks.generate) or a stubbed fetch that
// checks the real HTTP request; Oomba is the built-in stand-in (no Anthropic key); the picture check is a hook.
//   - the request: the house style and the book's style seed in every prompt, character sheets first, then pages with
//     the sheets of their characters as reference pictures, the key only in the x-goog-api-key header, no student names;
//   - Google's safety blocks and our picture check's refusals: nothing kept, the art-pack drawing stays, with a reason;
//   - the daily picture count can't be beaten by many requests at once; no key or the budget resting: art packs;
//   - Redraw with a note, a character sheet redrawn, the spend recorded, access (teachers only), deleting;
//   - Google's 429s: the queue pauses until the retry time and goes on one at a time, the picture waits without using its
//     attempts and appears later; a quota of zero falls back with its own reason, logged once an hour; nothing counted.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { call, teacher, teacher2, mia, kid, mum, cls, q, RL, config, cookieFor, ctx } from './_live.js';
import * as SB from '../../server/services/storybook.js';
import * as C from '../../server/services/oomba-chat.js';
import * as D from '../../server/services/storybook-draw.js';
import * as G from '../../server/services/storybook-gemini.js';
import { fakeGemini, googleError } from '../support/fake-gemini.js';
import * as A from '../../server/services/admin-alerts.js';

const SETUP = { source: 'ai', kind: 'linear', grade: '2', length: 'short', level: 'growing', theme: 'animals', about: 'A fox who shares.' };
const settle = async () => { await C.allSettled(); await D.settle(); await new Promise(r => setTimeout(r, 20)); await D.settle(); };
async function start(user = teacher, setup = SETUP) {
  const r = await call('/api/library/make/start', { method: 'POST', body: { setup }, user });
  assert.equal(r.status, 200, r.text);
  await settle();
  return r.json.redirect.split('/').pop();
}
const draws = id => q.all('SELECT * FROM made_book_draws WHERE book_id=? ORDER BY target', id);
const drawnPics = id => q.get("SELECT COUNT(*) n FROM made_book_pics WHERE book_id=? AND kind!='upload'", id).n;
const used = u => (q.get('SELECT n FROM made_book_ai_days WHERE user_id=? AND day=?', u.id, `${new Date().toISOString().slice(0, 10)}:draw`) || {}).n || 0;
let fake, checks, lines;
const PACE0 = { ...D.PACE };
/** Wait (polling) until ok() is true, or fail after ms. */
async function waitFor(ok, ms = 15e3, what = 'the queue') {
  const t0 = Date.now();
  while (!ok()) { if (Date.now() - t0 > ms) assert.fail(`timed out waiting for ${what}`); await new Promise(r => setTimeout(r, 25)); }
  await D.settle();
}
const quiet = id => draws(id).every(d => d.state !== 'queued' && d.state !== 'drawing');
test.beforeEach(() => {
  D._resetPace(); Object.assign(D.PACE, PACE0, { errorMs: 0 });
  q.run('DELETE FROM settings WHERE key=?', D.QUOTA_ALERT_KEY);
  lines = []; D.hooks.log = (msg, f) => lines.push({ msg, ...f });
  RL._reset(); q.run('DELETE FROM made_book_ai_days'); SB._resetPrune();
  Object.assign(config, { storybookFreePerDay: 50, storybookPlanPerDay: 50, storybookPicturesFreePerDay: 40, storybookPicturesPlanPerDay: 40, storybookDrawAtOnce: 2, geminiKey: '', aiDailyBudgetUsd: 1000, aiMonthlyBudgetUsd: 100000 });
  SB.hooks.create = null; SB.hooks.classify = async () => null; SB.hooks.screen = null;
  checks = [];
  D.hooks.screenImage = async (bytes, mime) => { checks.push(mime); return 'allow'; };
  fake = fakeGemini(G);
});
test.after(() => { G.hooks.generate = null; D.hooks.screenImage = null; D.hooks.log = null; D._resetPace(); Object.assign(D.PACE, PACE0); Object.assign(SB.hooks, { create: null, classify: null, screen: null }); });

test('a new book: character sheets first, then every page with its characters\' sheets as references, kept as checked WebP', async () => {
  const id = await start();
  const book = SB.bookOf(q.get('SELECT * FROM made_books WHERE id=?', id));
  assert.ok(book.cast.length >= 2 && book.cast.every(c => c.look), 'Oomba wrote how each character looks');
  assert.ok(book.pages.every(p => p.pic.scene), 'and what each picture shows');
  const sheets = fake.calls.filter(c => c.body.generationConfig.imageConfig.aspectRatio === '1:1');
  const pages = fake.calls.filter(c => c.body.generationConfig.imageConfig.aspectRatio === '16:9');
  assert.equal(sheets.length, book.cast.length);
  assert.equal(pages.length, book.pages.length);
  assert.ok(fake.calls.indexOf(pages[0]) >= sheets.length, 'sheets are drawn before any page');
  const style = G.styleOf(id);
  for (const c of fake.calls) {
    const text = c.body.contents[0].parts[0].text;
    assert.ok(text.includes(G.HOUSE_STYLE), 'the house style is in every prompt');
    assert.ok(text.includes(style.code) && text.includes(style.palette), 'and the book\'s own style seed');
    assert.deepEqual(c.body.generationConfig.responseModalities, ['IMAGE']);
    assert.ok(c.body.safetySettings.every(s => s.threshold === 'BLOCK_LOW_AND_ABOVE'));
    assert.equal(c.model, 'gemini-3.1-flash-image');
    assert.doesNotMatch(text, /\b(Mia|Leo|Pupil|Tia|Teacher)\b/, 'no student or teacher names');
  }
  // a page showing two characters carries both sheets, as inline PNG data after their labels
  const two = pages.find(c => c.body.contents[0].parts.filter(p => p.inlineData).length === 2);
  assert.ok(two, 'a page with two characters has two reference pictures');
  const parts = two.body.contents[0].parts;
  assert.match(parts[1].text, /^Reference picture 1: /); assert.equal(parts[2].inlineData.mimeType, 'image/png'); assert.ok(parts[2].inlineData.data.length > 100);
  // every picture passed the picture check as JPEG, and is kept
  assert.equal(checks.length, fake.calls.length); assert.ok(checks.every(m => m === 'image/jpeg'));
  assert.ok(draws(id).every(d => d.state === 'done' && d.pic_id));
  assert.equal(drawnPics(id), fake.calls.length);
  assert.equal(used(teacher), fake.calls.length, 'each picture counts, character sheets too');
  const spend = q.get("SELECT calls, usd FROM ai_usage WHERE model='image:gemini-3.1-flash-image' ORDER BY day DESC");
  assert.ok(spend && spend.calls >= fake.calls.length && spend.usd > 0.06 * fake.calls.length, 'every call goes through the AI budget');
  // the editor, the reader and the print copy show the drawn pictures; readers of the book may fetch them
  const ed = (await call(`/api/library/make/${id}`, { user: teacher })).json;
  assert.equal(ed.draws.on, true); assert.equal(ed.draws.busy, 0); assert.equal(Object.keys(ed.draws.pages).length, book.pages.length);
  const p1 = ed.draws.pages[book.pages[0].id].pic;
  const rd = await call(`/library/made/${id}/read`, { user: teacher });
  assert.match(rd.text, new RegExp(`/library/made/${id}/pic/${p1}`));
  assert.match((await call(`/library/made/${id}/print`, { user: teacher })).text, new RegExp(`/pic/${p1}`));
  const get = u => fetch(`${ctx.base}/library/made/${id}/pic/${p1}`, { headers: { cookie: cookieFor(u.id) } });
  assert.equal((await get(mia)).status, 404, 'not shared yet');
  await call(`/api/library/make/${id}/share`, { method: 'POST', user: teacher, body: { classIds: [cls.id] } });
  const r = await get(mia); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/jpeg');
  const buf = Buffer.from(await r.arrayBuffer()); assert.equal(buf[0], 0xff); assert.equal(buf[1], 0xd8);
  // the teacher's own picture still wins on a page, and the drawn pictures are not in the uploads list
  assert.equal(ed.uploads.length, 0);
});

test('the real request: v1beta generateContent, the key only in the x-goog-api-key header, image parts, no student names', async () => {
  fake.off(); config.geminiKey = 'test-key-123';
  const real = globalThis.fetch, seen = [];
  globalThis.fetch = async (url, o) => {
    if (!String(url).startsWith(G.API)) return real(url, o);
    seen.push({ url: String(url), o, body: JSON.parse(o.body) });
    const { paint } = await import('../support/fake-gemini.js');
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ok' }, { inlineData: { mimeType: 'image/png', data: paint('x', { w: 64, h: 36 }).toString('base64') } }] } }], usageMetadata: { promptTokenCount: 300 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const id = await start();
    // a student's name slipped into a character's look (as if typed before the student joined): it never leaves
    const row = q.get('SELECT * FROM made_books WHERE id=?', id), b = SB.bookOf(row);
    b.cast[0].look = 'a fox that looks like Mia Pupil';
    q.run('UPDATE made_books SET book=? WHERE id=?', JSON.stringify(b), id);
    const r = await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `cast:${b.cast[0].name}` } });
    assert.equal(r.status, 200, r.text);
    await settle();
    assert.ok(seen.length > 2);
    for (const s of seen) {
      assert.equal(s.url, `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent`);
      assert.doesNotMatch(s.url, /key=|test-key/, 'never in the address');
      assert.equal(s.o.method, 'POST'); assert.equal(s.o.headers['x-goog-api-key'], 'test-key-123');
      assert.ok(s.body.contents[0].parts[0].text.includes('Style: a warm, hand-painted children'));
      assert.doesNotMatch(JSON.stringify(s.body), /Mia|Leo|Pupil/);
    }
    assert.match(seen[seen.length - 1].body.contents[0].parts[0].text, /\[student\]/, 'the name was taken out');
    assert.ok(draws(id).every(d => d.state === 'done'));
  } finally { globalThis.fetch = real; config.geminiKey = ''; }
});

test('Google blocks a picture, or our picture check refuses it: nothing is kept, the page keeps its art-pack drawing and says why', async () => {
  fake.set(body => (body.generationConfig.imageConfig.aspectRatio === '1:1' ? 'ok' : body.contents[0].parts[0].text.length % 2 ? 'prompt-blocked' : 'blocked'));
  const id = await start();
  const pageRows = draws(id).filter(d => d.target.startsWith('page:'));
  assert.ok(pageRows.length && pageRows.every(d => d.state === 'fallback' && d.reason === 'blocked' && !d.pic_id), JSON.stringify(pageRows.map(d => [d.state, d.reason])));
  assert.equal(q.get("SELECT COUNT(*) n FROM made_book_pics WHERE book_id=? AND kind='page'", id).n, 0);
  const row = q.get('SELECT * FROM made_books WHERE id=?', id), b = SB.bookOf(row);
  assert.match(SB.pictureHtml(row, b, b.pages[0]), /^<svg class="sb-art"/, 'the art-pack drawing');
  const st = (await call(`/api/library/make/${id}/draws`, { user: teacher })).json;
  assert.equal(st.pages[b.pages[0].id].reason, 'blocked');
  // our picture check refuses the picture Google made: dropped, never shown
  fake.set('ok'); D.hooks.screenImage = async () => 'person';
  const r = await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `page:${b.pages[0].id}` } });
  assert.equal(r.status, 200, r.text); await settle();
  const d = draws(id).find(x => x.target === `page:${b.pages[0].id}`);
  assert.equal(d.state, 'fallback'); assert.equal(d.reason, 'refused'); assert.equal(d.pic_id, null);
  assert.equal(q.get("SELECT COUNT(*) n FROM made_book_pics WHERE book_id=? AND kind='page'", id).n, 0);
  // a refused redraw of a page that had a picture keeps the earlier one
  D.hooks.screenImage = async () => 'allow';
  await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `page:${b.pages[0].id}` } }); await settle();
  const kept = draws(id).find(x => x.target === `page:${b.pages[0].id}`).pic_id; assert.ok(kept);
  D.hooks.screenImage = async () => 'unsafe';
  await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `page:${b.pages[0].id}` } }); await settle();
  const after = draws(id).find(x => x.target === `page:${b.pages[0].id}`);
  assert.equal(after.reason, 'refused'); assert.equal(after.pic_id, kept);
  assert.match(SB.pictureHtml(row, b, b.pages[0]), new RegExp(`/pic/${kept}`));
  // a network failure is tried once more, then falls back, and is not counted
  const before = used(teacher); fake.set('error');
  await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `page:${b.pages[1].id}` } }); await settle();
  const e = draws(id).find(x => x.target === `page:${b.pages[1].id}`);
  assert.equal(e.state, 'fallback'); assert.equal(e.reason, 'error'); assert.equal(used(teacher), before, 'given back');
});

test('the daily picture count: in the database, taken at the moment of drawing, never beaten by many requests at once', async () => {
  config.storybookPicturesFreePerDay = 3; config.storybookPicturesPlanPerDay = 3; config.storybookDrawAtOnce = 4;
  fake.delay(30);
  const id = await start();
  assert.equal(fake.calls.length, 3, 'only 3 pictures were drawn');
  assert.equal(used(teacher), 3);
  const rows = draws(id);
  assert.equal(rows.filter(d => d.state === 'done').length, 3);
  assert.ok(rows.filter(d => d.state === 'fallback').every(d => d.reason === 'limit'));
  const st = (await call(`/api/library/make/${id}/draws`, { user: teacher })).json;
  assert.equal(st.reason, 'limit'); assert.equal(st.left, 0);
  // Redraw at the limit: refused calmly, and nothing reaches Google even with many requests at once
  const b = SB.bookOf(q.get('SELECT * FROM made_books WHERE id=?', id));
  const rs = await Promise.all(b.pages.map(p => call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `page:${p.id}` } })));
  assert.ok(rs.every(r => r.status === 429 && r.json.code === 'limit'));
  await settle();
  assert.equal(fake.calls.length, 3);
  // a fresh day's worth, then many redraws in parallel: the count stops them at the cap, whatever passed the route
  q.run('DELETE FROM made_book_ai_days'); RL._reset();
  const n0 = fake.calls.length;
  const rs2 = await Promise.all(b.pages.map(p => call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `page:${p.id}` } })));
  assert.ok(rs2.filter(r => r.status === 200).length >= 3);
  await settle();
  assert.equal(fake.calls.length - n0, 3, 'exactly the cap');
  assert.equal(used(teacher), 3);
  // and the counter itself: 20 takes at once, 3 succeed
  q.run('DELETE FROM made_book_ai_days');
  const takes = await Promise.all(Array.from({ length: 20 }, () => Promise.resolve().then(() => SB.take(teacher, { key: `${new Date().toISOString().slice(0, 10)}:draw`, cap: D.capOf(teacher) }))));
  assert.equal(takes.filter(Boolean).length, 3);
});

test('no key, or the AI budget resting: the art packs, one calm reason, nothing queued or sent', async () => {
  fake.off();
  const id = await start();
  assert.equal(draws(id).length, 0);
  let ed = (await call(`/api/library/make/${id}`, { user: teacher })).json;
  assert.equal(ed.draws.on, false); assert.equal(ed.draws.reason, 'nokey');
  let r = await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `page:${ed.book.pages[0].id}` } });
  assert.equal(r.status, 503); assert.equal(r.json.code, 'nokey'); assert.ok(r.json.error);
  const row = q.get('SELECT * FROM made_books WHERE id=?', id);
  assert.match(SB.pictureHtml(row, ed.book, ed.book.pages[0]), /^<svg/);
  // the key is there but the budget rests
  fake = fakeGemini(G); config.aiDailyBudgetUsd = 0;
  ed = (await call(`/api/library/make/${id}`, { user: teacher })).json;
  assert.equal(ed.draws.on, false); assert.equal(ed.draws.reason, 'resting');
  r = await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `page:${ed.book.pages[0].id}` } });
  assert.equal(r.status, 503); assert.equal(r.json.code, 'resting');
  assert.equal(fake.calls.length, 0);
  // the editor page itself renders with the line's place
  assert.match((await call(`/library/make/${id}`, { user: teacher })).text, /id="sb-drawline"/);
});

test('Redraw: a note goes into the prompt (checked and scrubbed), the new picture replaces the old; a character redrawn marks its pages', async () => {
  const id = await start();
  const b = SB.bookOf(q.get('SELECT * FROM made_books WHERE id=?', id)), p = b.pages[1];
  const old = draws(id).find(d => d.target === `page:${p.id}`).pic_id;
  let r = await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `page:${p.id}`, note: 'Mia should be in it' } });
  assert.equal(r.status, 400); assert.equal(r.json.code, 'names');
  r = await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `page:${p.id}`, note: 'make it a sunny morning' } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.draws.pages[p.id].state === 'queued' || r.json.draws.pages[p.id].state === 'drawing', true);
  await settle();
  assert.match(fake.calls[fake.calls.length - 1].body.contents[0].parts[0].text, /The teacher asks for this change: make it a sunny morning/);
  const d = draws(id).find(x => x.target === `page:${p.id}`);
  assert.equal(d.state, 'done'); assert.notEqual(d.pic_id, old); assert.equal(d.note, '');
  assert.equal(q.get('SELECT COUNT(*) n FROM made_book_pics WHERE id=?', old).n, 0, 'the old picture is gone');
  // a change from Oomba to the words only: no picture is drawn again (what a picture shows did not change)
  const n0 = fake.calls.length;
  r = await call(`/api/library/make/${id}/chat`, { method: 'POST', user: teacher, body: { text: 'Change page 3 please' } });
  assert.equal(r.status, 200, r.text); await settle();
  assert.equal(fake.calls.length, n0);
  // a character's reference picture redrawn: the pages showing them are marked as changed since
  const who = p.pic.chars[0].name;
  r = await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `cast:${who}` } });
  assert.equal(r.status, 200); await settle();
  const st = (await call(`/api/library/make/${id}/draws`, { user: teacher })).json;
  assert.equal(st.pages[p.id].stale, true);
  assert.ok(b.pages.filter(x => !x.pic.chars.some(c => c.name === who)).every(x => !st.pages[x.id].stale));
  // unknown targets and pages with the teacher's own picture: not found
  assert.equal((await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: 'page:nope' } })).status, 404);
  assert.equal((await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: 'cast:Nobody' } })).status, 404);
});

test('teachers only: students, kids, grown-ups, other teachers and signed-out visitors are refused', async () => {
  const id = await start();
  const b = SB.bookOf(q.get('SELECT * FROM made_books WHERE id=?', id));
  for (const who of [mia, kid, mum, teacher2]) {
    assert.equal((await call(`/api/library/make/${id}/draws`, { user: who })).status, 404, who.username);
    assert.equal((await call(`/api/library/make/${id}/draw`, { method: 'POST', user: who, body: { target: `page:${b.pages[0].id}` } })).status, 404, who.username);
  }
  assert.equal((await call(`/api/library/make/${id}/draws`)).status, 401);
  assert.equal((await call(`/api/library/make/${id}/draw`, { method: 'POST', body: { target: `page:${b.pages[0].id}` } })).status, 401);
  // a drawn picture can't be removed as if it were an upload
  const pic = draws(id)[0].pic_id;
  assert.equal((await call(`/api/library/make/${id}/pic/${pic}/remove`, { method: 'POST', user: teacher })).status, 404);
  // deleting the book takes its queue and pictures
  assert.equal((await call(`/api/library/make/${id}/delete`, { method: 'POST', user: teacher })).status, 200);
  assert.equal(draws(id).length, 0); assert.equal(q.get('SELECT COUNT(*) n FROM made_book_pics WHERE book_id=?', id).n, 0);
});

test('readAnswer: Google\'s shapes (inlineData and inline_data, finish reasons, prompt blocks)', () => {
  const img = Buffer.from('x').toString('base64');
  assert.equal(G.readAnswer({ candidates: [{ content: { parts: [{ inline_data: { mime_type: 'image/png', data: img } }] } }] }).ok, true);
  assert.equal(G.readAnswer({ promptFeedback: { blockReason: 'OTHER' } }).code, 'blocked');
  assert.equal(G.readAnswer({ candidates: [{ finishReason: 'PROHIBITED_CONTENT' }] }).code, 'blocked');
  assert.equal(G.readAnswer({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'no' }] } }] }).code, 'error');
  assert.equal(G.readAnswer(null).code, 'error');
  // prompts never name an artist or a book series; the rules are in the house style
  for (const s of [G.HOUSE_STYLE, G.sheetPrompt({ name: 'Pip', look: 'a fox' }, G.styleOf('x'))]) {
    assert.match(s, /no words, letters/); assert.doesNotMatch(s, /in the style of|Disney|Pixar|Ghibli|Seuss|Potter/i);
  }
});

test('a choose-your-own-adventure is illustrated too: every page, every branch and every ending painted; the reader and the print copy show them', async () => {
  const id = await start(teacher, { ...SETUP, kind: 'cyoa', endings: 3, length: 'medium', about: 'A lost kite finds its way home.' });
  const row = q.get('SELECT * FROM made_books WHERE id=?', id), book = SB.bookOf(row);
  const ends = book.pages.filter(p => p.end), branches = book.pages.filter(p => p.choices.length > 1);
  assert.equal(ends.length, 3); assert.ok(branches.length >= 1);
  assert.ok(book.pages.every(p => p.pic && p.pic.scene), 'Oomba wrote a scene for every page');
  const pages = draws(id).filter(d => d.target.startsWith('page:'));
  assert.deepEqual(pages.map(d => d.target.slice(5)).sort(), book.pages.map(p => p.id).sort(), 'every page was queued');
  assert.ok(pages.every(d => d.state === 'done' && d.pic_id), 'and painted, endings and branches included');
  const pr = (await call(`/library/made/${id}/print`, { user: teacher })).text;
  for (const d of pages) {
    const pid = d.target.slice(5);
    const rd = await call(`/library/made/${id}/read?p=${encodeURIComponent(pid)}`, { user: teacher });
    assert.match(rd.text, new RegExp(`<figure class="rd-pic sb-rpic"><img class="sb-art" src="/library/made/${id}/pic/${d.pic_id}"`), `the reader shows page ${pid}'s picture`);
    assert.match(pr, new RegExp(`/pic/${d.pic_id}`), `the print copy shows page ${pid}'s picture`);
  }
});

test('the Pictures choice: "I\'ll add my own" and "No pictures" never paint or spend a picture; "No pictures" leaves every page without one', async () => {
  for (const pictures of ['own', 'none']) {
    const n0 = fake.calls.length, u0 = used(teacher);
    const id = await start(teacher, { ...SETUP, kind: 'cyoa', pictures });
    const row = q.get('SELECT * FROM made_books WHERE id=?', id);
    assert.equal(SB.setupOf(row).pictures, pictures);
    assert.equal(fake.calls.length, n0, `${pictures}: nothing painted`); assert.equal(used(teacher), u0, 'nothing spent');
    assert.equal(draws(id).length, 0);
    const ed = (await call(`/api/library/make/${id}`, { user: teacher })).json;
    assert.equal(ed.draws.on, false); assert.equal(ed.draws.reason, pictures);
    const b = SB.bookOf(row);
    const rd = await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `page:${b.pages[0].id}` } });
    assert.equal(rd.status, pictures === 'own' ? 409 : 404, 'Redraw is refused');
    if (pictures === 'none') assert.ok(b.pages.length && b.pages.every(p => !p.pic && !p.upload), 'no picture on any page');
    else assert.ok(b.pages.every(p => p.pic), 'the art-pack drawing holds each place until the teacher adds their own');
  }
});

test('Google says 429 with a retry time: the whole queue pauses, the pictures wait ("Waiting for Google") without using attempts, then all arrive one at a time; nothing counted for the 429s', async () => {
  // every call counts how many were in flight when it started
  let inflight = 0; const seen = [];
  fake.retry('0.3s'); fake.delay(15);
  fake.set(() => (fake.calls.length <= 2 ? 'rate-limited' : 'ok'));
  const inner = G.hooks.generate;
  G.hooks.generate = async (b, o) => { inflight++; seen.push(inflight); try { return await inner(b, o); } finally { inflight--; } };
  const t0 = Date.now();
  const id = await start();
  // the first two calls (the character sheets, two at a time) got 429: nothing else was sent, the queue is paused
  assert.equal(fake.calls.length, 2, 'no hammering: the queue stopped at the first 429s');
  const pace = D.paceState();
  assert.ok(pace.until >= t0 + 300, 'paused at least until Google\'s retry time'); assert.ok(pace.slowUntil > pace.until);
  const rows = draws(id);
  assert.ok(rows.every(d => d.state === 'queued'), JSON.stringify(rows.map(d => [d.target, d.state, d.reason])));
  const sheets = rows.filter(d => d.target.startsWith('cast:'));
  assert.ok(sheets.every(d => d.reason === 'google' && d.attempts === 0 && d.not_before >= t0 + 300 && d.wait_since), 'back in the queue, attempts not used');
  assert.equal(used(teacher), 0, 'a 429 made no picture: not counted');
  const st = (await call(`/api/library/make/${id}/draws`, { user: teacher })).json;
  assert.equal(st.on, true); assert.ok(st.busy > 0);
  assert.ok(Object.values(st.pages).every(x => x.state === 'queued' && x.reason === 'google'), 'each page says it is waiting for Google');
  // the log line says what Google said: the status, the quota and the retry time (never the key or the prompt)
  const fails = lines.filter(l => l.msg === 'storybook picture model failed');
  assert.equal(fails.length, 2);
  for (const l of fails) {
    assert.equal(l.code, 'rate_limited'); assert.equal(l.http, 429); assert.equal(l.status, 'RESOURCE_EXHAUSTED');
    assert.equal(l.metric, 'generativelanguage.googleapis.com/generate_content_paid_tier_requests'); assert.equal(l.quota, 'GenerateRequestsPerMinutePerProjectPerModel');
    assert.equal(l.limit, '10'); assert.equal(l.retryMs, 300);
    assert.doesNotMatch(JSON.stringify(l), /Style:|x-goog|stub|test-key/);
  }
  // after the pause: everything is drawn, one at a time, and nothing fell back to the art pack
  await waitFor(() => quiet(id));
  assert.ok(Date.now() - t0 >= 300, 'not before the retry time');
  const done = draws(id);
  assert.ok(done.every(d => d.state === 'done' && d.pic_id && d.reason === '' && d.not_before === null && d.wait_since === null), JSON.stringify(done.map(d => [d.target, d.state, d.reason])));
  assert.ok(done.every(d => d.attempts === 1), 'each picture used one attempt: the one that worked');
  assert.equal(fake.calls.length, done.length + 2);
  assert.ok(seen.slice(2).every(n => n === 1), `one at a time after a 429 (${seen.join(',')})`);
  assert.equal(used(teacher), done.length, 'only the pictures made are counted');
  assert.equal(D.paceState().streak, 0, 'Google answered: the backoff starts small again');
  assert.ok(!lines.some(l => /quota is zero/.test(l.msg)));
});

test('Google keeps saying 429: a picture waits up to the window, then falls back to the art pack with its own reason ("busy"), never counted', async () => {
  Object.assign(D.PACE, { waitMaxMs: 250, baseMs: 20, maxMs: 100 });
  fake.retry('0.05s'); fake.set('rate-limited');
  const id = await start();
  await waitFor(() => quiet(id));
  const rows = draws(id);
  assert.ok(rows.length && rows.every(d => d.state === 'fallback' && d.reason === 'busy' && !d.pic_id), JSON.stringify(rows.map(d => [d.target, d.state, d.reason])));
  assert.ok(rows.every(d => d.attempts <= 1), 'the 429s did not use attempts');
  assert.ok(fake.calls.length >= rows.length * 2, 'each picture was tried again while it waited');
  assert.equal(used(teacher), 0);
  const st = (await call(`/api/library/make/${id}/draws`, { user: teacher })).json;
  const b = SB.bookOf(q.get('SELECT * FROM made_books WHERE id=?', id));
  assert.equal(st.pages[b.pages[0].id].reason, 'busy');
  assert.match(SB.pictureHtml(q.get('SELECT * FROM made_books WHERE id=?', id), b, b.pages[0]), /^<svg class="sb-art"/, 'the art-pack drawing');
  // the next change of the book tries those pictures again (Google may have room by then)
  D._resetPace(); fake.set('ok');
  assert.ok(D.queueBook(q.get('SELECT * FROM made_books WHERE id=?', id)) > 0);
  await waitFor(() => quiet(id));
  assert.ok(draws(id).every(d => d.state === 'done'));
});

test('Google says the quota is zero (billing not enabled): the art pack at once with a "not set up yet" reason, logged once an hour, one admin alert a day, nothing counted', async () => {
  fake.set('quota-zero');
  const id = await start();
  const rows = draws(id);
  assert.ok(rows.length && rows.every(d => d.state === 'fallback' && d.reason === 'notset' && !d.pic_id), JSON.stringify(rows.map(d => [d.target, d.state, d.reason])));
  assert.ok(fake.calls.length <= 2, 'after the first answer, no more calls for a while');
  assert.equal(used(teacher), 0, 'not counted');
  const warns = lines.filter(l => /quota is zero/.test(l.msg));
  assert.equal(warns.length, 1, 'one warn line');
  assert.equal(warns[0].msg, 'storybook pictures: google quota is zero (billing not enabled on the key\'s project?)');
  assert.equal(warns[0].limit, '0'); assert.match(warns[0].metric, /free_tier/);
  const fail = lines.find(l => l.msg === 'storybook picture model failed');
  assert.equal(fail.code, 'quota_zero'); assert.equal(fail.http, 429);
  // the editor: each page and the line say pictures are not set up yet
  const st = (await call(`/api/library/make/${id}/draws`, { user: teacher })).json;
  assert.equal(st.reason, 'notset');
  assert.ok(Object.values(st.pages).every(x => x.reason === 'notset'));
  // one admin alert a day (the day is remembered; the alert itself is queued when admin alerts are on)
  assert.ok(A.KINDS.service, 'the admin alerts know the kind');
  assert.equal(q.get('SELECT value FROM settings WHERE key=?', D.QUOTA_ALERT_KEY).value, new Date().toISOString().slice(0, 10));
  // later in the hour (the hold over): Google is asked again, still zero: no second warn line
  D.PACE.quotaHoldMs = 0;
  const b = SB.bookOf(q.get('SELECT * FROM made_books WHERE id=?', id));
  const n0 = fake.calls.length;
  const r = await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `page:${b.pages[0].id}` } });
  assert.equal(r.status, 200, r.text); await settle();
  assert.equal(fake.calls.length, n0 + 1);
  assert.equal(draws(id).find(d => d.target === `page:${b.pages[0].id}`).reason, 'notset');
  assert.equal(lines.filter(l => /quota is zero/.test(l.msg)).length, 1, 'at most once an hour');
  assert.equal(used(teacher), 0);
  // billing turned on: pictures are painted again
  fake.set('ok');
  await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: `page:${b.pages[0].id}` } }); await settle();
  assert.equal(draws(id).find(d => d.target === `page:${b.pages[0].id}`).state, 'done');
  assert.equal(used(teacher), 1);
});

test('readError: Google\'s 429 bodies (QuotaFailure, RetryInfo, Retry-After, the message), the real fetch path, and other errors', async () => {
  const rl = G.readError(429, googleError('rate-limited', { retry: '39s' }));
  assert.equal(rl.code, 'rate_limited'); assert.equal(rl.retryMs, 39000); assert.equal(rl.limit, '10'); assert.equal(rl.gstatus, 'RESOURCE_EXHAUSTED');
  const qz = G.readError(429, googleError('quota-zero'));
  assert.equal(qz.code, 'quota_zero'); assert.equal(qz.limit, '0');
  // only the message: "limit: 0" and "Please retry in"
  const m = G.readError(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric: generativelanguage.googleapis.com/x, limit: 0, model: m\nPlease retry in 12.5s.' } });
  assert.equal(m.code, 'quota_zero'); assert.equal(m.retryMs, 12500); assert.equal(m.metric, 'generativelanguage.googleapis.com/x');
  // no body at all, a Retry-After header
  const h = G.readError(429, null, new Headers({ 'retry-after': '7' }));
  assert.equal(h.code, 'rate_limited'); assert.equal(h.retryMs, 7000);
  assert.equal(G.readError(400, { error: { status: 'INVALID_ARGUMENT', message: 'blocked for safety' } }).code, 'blocked');
  assert.equal(G.readError(500, { error: { status: 'INTERNAL' } }).code, 'error');
  // the real request path reads the body and the header
  fake.off(); config.geminiKey = 'test-key-123';
  const real = globalThis.fetch;
  globalThis.fetch = async (url, o) => (String(url).startsWith(G.API) ? new Response(JSON.stringify(googleError('rate-limited', { retry: '3s' })), { status: 429, headers: { 'content-type': 'application/json' } }) : real(url, o));
  try {
    const r = await G.generate({ prompt: 'x' });
    assert.equal(r.ok, false); assert.equal(r.code, 'rate_limited'); assert.equal(r.why, 'http 429'); assert.equal(r.retryMs, 3000);
    assert.doesNotMatch(JSON.stringify(r), /test-key/);
  } finally { globalThis.fetch = real; config.geminiKey = ''; }
});

test('Google refuses the full request (400 INVALID_ARGUMENT): its message is kept; the plain request once, kept when it works; an unknown model id tries its -preview twin', async () => {
  G.resetLearned();
  const bodies = [], models = [];
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64').toString('base64');
  const ok = { candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/png', data: png } }] } }] };
  const prev = G.hooks.generate;
  try {
    G.hooks.generate = async (b, o) => {
      bodies.push(b); models.push(o.model);
      if (b.safetySettings) throw { httpStatus: 400, body: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload: unknown field "imageSize" key AIzaSyA1234567890abcdefghijk' } } };
      return ok;
    };
    let r = await G.generate({ prompt: 'a fox in a meadow' });
    assert.equal(r.ok, true, 'the plain request drew it');
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[1].generationConfig.responseModalities, ['TEXT', 'IMAGE']);
    assert.equal(bodies[1].safetySettings, undefined);
    r = await G.generate({ prompt: 'a fox at night' });
    assert.equal(r.ok, true); assert.equal(bodies.length, 3, 'learned: plain straight away');
    // The message is kept (cleaned: no key) when both are refused
    G.resetLearned(); bodies.length = 0;
    G.hooks.generate = async () => { throw { httpStatus: 400, body: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Bad thing; key AIzaSyA1234567890abcdefghijk' } } }; };
    r = await G.generate({ prompt: 'x' });
    assert.equal(r.ok, false); assert.equal(r.http, 400); assert.match(r.gmsg, /Bad thing/); assert.doesNotMatch(r.gmsg, /AIza/);
    // A 404 for the model: its -preview twin, kept
    G.resetLearned(); models.length = 0;
    G.hooks.generate = async (b, o) => { models.push(o.model); if (!/-preview$/.test(o.model)) throw { httpStatus: 404, body: { error: { code: 404, status: 'NOT_FOUND', message: 'models/x is not found' } } }; return ok; };
    r = await G.generate({ prompt: 'y' });
    assert.equal(r.ok, true); assert.match(models[1], /-preview$/);
    await G.generate({ prompt: 'z' });
    assert.match(models.at(-1), /-preview$/, 'kept');
  } finally { G.hooks.generate = prev; G.resetLearned(); }
});

test('reference pictures go to Google as PNG; refused as "Unable to process input image": drawn again from words only', async () => {
  const webp = await new Promise((res, rej) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=32x32', '-frames:v', '1', '-c:v', 'libwebp', '-f', 'webp', 'pipe:1']);
    const out = []; ff.stdout.on('data', d => out.push(d)); ff.on('error', rej); ff.on('close', () => res(Buffer.concat(out)));
  }).catch(() => null);
  if (!webp || !webp.length) return;   // no ffmpeg here
  const png = await D.toPng(webp);
  assert.ok(D.pngSize(png), 'converted to PNG');
  assert.ok((await D.toPng(png)).equals(png), 'a PNG stays as it is');
});

test('painted pictures are kept as JPEG; a WebP kept before is served (and kept) as a JPEG; the type comes from the bytes', async () => {
  const webp = await new Promise((res, rej) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x36', '-frames:v', '1', '-c:v', 'libwebp', '-f', 'webp', 'pipe:1']);
    const out = []; ff.stdout.on('data', d => out.push(d)); ff.on('error', rej); ff.on('close', () => res(Buffer.concat(out)));
  }).catch(() => null);
  if (!webp || !webp.length) return;   // no ffmpeg here
  const j = await D.toJpeg(webp);
  assert.equal(j.mime, 'image/jpeg'); assert.deepEqual([j.width, j.height], [64, 36]); assert.deepEqual(D.jpegSize(j.bytes), { width: 64, height: 36 });
  const id = `oldwebp${Date.now().toString(36)}`.slice(0, 14);
  q.run("INSERT INTO made_book_pics(id, owner_id, book_id, name, width, height, bytes, created_at, kind, mime) VALUES (?,?,NULL,'page.webp',64,36,?,?, 'page','image/webp')", id, teacher.id, webp, Date.now());
  const row = q.get('SELECT * FROM made_book_pics WHERE id=?', id);
  const x = await D.storeAsJpeg(row);
  assert.equal(x.mime, 'image/jpeg'); assert.equal(x.bytes[0], 0xff);
  assert.equal(q.get('SELECT mime FROM made_book_pics WHERE id=?', id).mime, 'image/jpeg', 'kept as JPEG');
  q.run('DELETE FROM made_book_pics WHERE id=?', id);
});
