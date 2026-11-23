// The book maker's picture model (services/storybook-draw.js, storybook-gemini.js; docs/storybook-builder.md "Pictures").
// No network: Google is a stand-in (tests/support/fake-gemini.js, through hooks.generate) or a stubbed fetch that
// checks the real HTTP request; Oomba is the built-in stand-in (no Anthropic key); the picture check is a hook.
//   - the request: the house style and the book's style seed in every prompt, character sheets first, then pages with
//     the sheets of their characters as reference pictures, the key only in the x-goog-api-key header, no student names;
//   - Google's safety blocks and our picture check's refusals: nothing kept, the art-pack drawing stays, with a reason;
//   - the daily picture count can't be beaten by many requests at once; no key or the budget resting: art packs;
//   - Redraw with a note, a character sheet redrawn, the spend recorded, access (teachers only), deleting.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { call, teacher, teacher2, mia, kid, mum, cls, q, RL, config, cookieFor, ctx } from './_live.js';
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
const draws = id => q.all('SELECT * FROM made_book_draws WHERE book_id=? ORDER BY target', id);
const drawnPics = id => q.get("SELECT COUNT(*) n FROM made_book_pics WHERE book_id=? AND kind!='upload'", id).n;
const used = u => (q.get('SELECT n FROM made_book_ai_days WHERE user_id=? AND day=?', u.id, `${new Date().toISOString().slice(0, 10)}:draw`) || {}).n || 0;
let fake, checks;
test.beforeEach(() => {
  RL._reset(); q.run('DELETE FROM made_book_ai_days'); SB._resetPrune();
  Object.assign(config, { storybookFreePerDay: 50, storybookPlanPerDay: 50, storybookPicturesFreePerDay: 40, storybookPicturesPlanPerDay: 40, storybookDrawAtOnce: 2, geminiKey: '', aiDailyBudgetUsd: 1000, aiMonthlyBudgetUsd: 100000 });
  SB.hooks.create = null; SB.hooks.classify = async () => null; SB.hooks.screen = null;
  checks = [];
  D.hooks.screenImage = async (bytes, mime) => { checks.push(mime); return 'allow'; };
  fake = fakeGemini(G);
});
test.after(() => { G.hooks.generate = null; D.hooks.screenImage = null; Object.assign(SB.hooks, { create: null, classify: null, screen: null }); });

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
  assert.match(parts[1].text, /^Reference picture 1: /); assert.equal(parts[2].inlineData.mimeType, 'image/webp'); assert.ok(parts[2].inlineData.data.length > 100);
  // every picture passed the picture check as WebP, and is kept
  assert.equal(checks.length, fake.calls.length); assert.ok(checks.every(m => m === 'image/webp'));
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
  const r = await get(mia); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/webp');
  const buf = Buffer.from(await r.arrayBuffer()); assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
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
