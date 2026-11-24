// Book pictures free of the art kit (docs/decisions.md "Book pictures: the story and the pictures are free of the art
// kit"; docs/storybook-builder.md "Pictures"). The owner saw "Tomas and Coco Help Out" (a boy and his chameleon friend)
// painted with Coco as a dinosaur and as an elderly woman: the art kit's sprite and world names were sent to Google, and
// the writer bent the cast to the kit. No network: the writer is faked through hooks.create, Google through the
// stand-in (tests/support/fake-gemini.js).
//   - the writer: every cast member says what it is ("what") and has a look that names it, every picture a setting; the
//     kit is an optional stand-in (unknown or missing art is kept, not dropped); one retry lists the problems; the reply
//     never mentions the kit; the new words pass the word rules;
//   - the prompts: no kit sprite or world name ever reaches Google when the book's own words don't use it (a chameleon
//     drawn by the 'triceratops' sprite in 'dino-valley' is never a "triceratops" or a "Dino Valley"); the sheet says
//     what the character is and to draw it as that; an old book's character with no look is never a kit kind;
//   - the audit trail: each picture's prompt is kept (students' names taken out) and only the book's owner can see it;
//   - Paint all pictures again: every picture, painted ones too, counted against the day's pictures.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { call, teacher, teacher2, mia, q, RL, config } from './_live.js';
import * as SB from '../../server/services/storybook.js';
import * as C from '../../server/services/oomba-chat.js';
import * as D from '../../server/services/storybook-draw.js';
import * as G from '../../server/services/storybook-gemini.js';
import { catalog } from '../../server/services/storybook-illustrator.js';
import { shapeBook, textsOf } from '../../public/js/storybook-core.js';
import { fakeGemini } from '../support/fake-gemini.js';

const SETUP = { source: 'ai', kind: 'linear', grade: '2', length: 'short', level: 'growing', about: 'Tomas and his chameleon friend Coco help out at home.' };
const answer = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, model: 'test' });
const TOMAS = { name: 'Tomas', what: 'boy', look: 'a boy of about seven with curly brown hair, a blue sweater and red sneakers', art: 'barbarian' };
const COCO = { name: 'Coco', what: 'chameleon', look: 'a small green chameleon with a curly tail and big round eyes', art: 'triceratops' };
const page = (id, text, setting, chars) => ({ id, text, alt: text, pic: { world: 'dino-valley', mood: 'bright', setting, scene: `${text} The kite string is tugged by a curly tail.`, chars } });
const BOOK = cast => ({ title: 'Tomas and Coco Help Out', kind: 'linear', cast, pages: [
  page('p1', 'Tomas and Coco fly a red kite.', 'a windy hill in the park', [{ name: 'Tomas', pos: 'left' }, { name: 'Coco', pos: 'right' }]),
  page('p2', 'Coco helps carry the picnic basket home.', 'a quiet street with little houses', [{ name: 'Coco', pos: 'center' }]),
] });
let fake, calls;
const writer = fn => { calls = []; SB.hooks.create = async params => { calls.push(params); return answer(fn(calls.length, params)); }; };
const settle = async () => { await C.allSettled(); await D.settle(); await new Promise(r => setTimeout(r, 20)); await D.settle(); };
const rowOf = id => q.get('SELECT * FROM made_books WHERE id=?', id);
const draws = id => q.all('SELECT * FROM made_book_draws WHERE book_id=? ORDER BY target', id);
const promptText = c => c.body.contents[0].parts.filter(p => p.text).map(p => p.text).join('\n');
async function start(setup = SETUP) {
  const r = await call('/api/library/make/start', { method: 'POST', body: { setup }, user: teacher });
  assert.equal(r.status, 200, r.text);
  await settle();
  return r.json.redirect.split('/').pop();
}
/** Every name of the art kit (sprite ids and names, world ids and names) the book's own words never use. */
function kitWordsNotIn(book) {
  const own = textsOf(book).map(([, s]) => s).join(' ').toLowerCase();
  const cat = catalog();
  const words = [...Object.entries(cat.chars).flatMap(([id, c]) => [id, c.name]), ...Object.entries(cat.worlds).flatMap(([id, w]) => [id, w.name])];
  return [...new Set(words)].filter(w => w.length > 3 && !own.includes(w.toLowerCase()));
}

test.beforeEach(() => {
  D._resetPace(); RL._reset(); q.run('DELETE FROM made_book_ai_days'); SB._resetPrune();
  Object.assign(config, { storybookFreePerDay: 50, storybookPlanPerDay: 50, storybookPicturesFreePerDay: 40, storybookPicturesPlanPerDay: 40, storybookDrawAtOnce: 2, geminiKey: '', aiDailyBudgetUsd: 1000, aiMonthlyBudgetUsd: 100000 });
  SB.hooks.create = null; SB.hooks.classify = async () => null; SB.hooks.screen = null;
  D.hooks.screenImage = async () => 'allow';
  fake = fakeGemini(G);
});
test.after(() => { G.hooks.generate = null; D.hooks.screenImage = null; Object.assign(SB.hooks, { create: null, classify: null, screen: null }); });

// ---------------------------------------------------------------- the writer
test('shapeBook: with painting, unknown or missing kit art is kept as a stand-in gap, and what and setting are kept', () => {
  const art = { chars: new Set(['fox']), worlds: new Set(['wild-woods']), props: () => [] };
  const raw = { title: 'T', kind: 'linear', cast: [{ name: 'Coco', what: 'chameleon', look: 'a green chameleon' }, { name: 'Pip', art: 'fox', what: 'fox', look: 'a red fox' }],
    pages: [{ id: 'p1', text: 'Hi', alt: 'a', pic: { world: 'nowhere', setting: 'a sunny kitchen', scene: 's', chars: [{ name: 'Coco', pos: 'left' }] } }] };
  const free = shapeBook(raw, { art, free: true });
  assert.deepEqual(free.fixes, []);
  assert.deepEqual(free.book.cast.map(c => [c.name, c.what, c.art]), [['Coco', 'chameleon', ''], ['Pip', 'fox', 'fox']]);
  assert.equal(free.book.pages[0].pic.world, ''); assert.equal(free.book.pages[0].pic.setting, 'a sunny kitchen');
  assert.deepEqual(free.book.pages[0].pic.chars.map(c => c.name), ['Coco'], 'a character with no stand-in art is still in the picture');
  // the art-pack books (no painting) keep their old rule: the kit picks the cast
  const packs = shapeBook(raw, { art });
  assert.deepEqual(packs.book.cast.map(c => c.name), ['Pip']); assert.equal(packs.book.pages[0].pic, null);
  assert.ok(packs.fixes.some(f => /not a character in the catalog/.test(f)));
  // the new words are read by the word rules like every other word of a book
  const words = textsOf(free.book).map(([w]) => w);
  assert.ok(words.includes('cast Coco what') && words.includes('page p1 setting'));
});

test('the painting prompt asks for what, look and setting and never for the closest art; the art packs keep theirs', () => {
  const paint = SB.systemPrompt({ ...SETUP, pictures: 'ai', lang: 'en' });
  assert.match(paint, /"what"/); assert.match(paint, /"look"/); assert.match(paint, /"setting"/);
  assert.match(paint, /never change it, or how they look, to fit any list/);
  assert.match(paint, /never mentioned to the teacher/);
  assert.doesNotMatch(paint, /closest/i);
  assert.match(paint, /"cast": \[\{"name": "\.\.\.", "what": "\.\.\.", "look": "\.\.\."\}\]/);
  const own = SB.systemPrompt({ ...SETUP, pictures: 'own', lang: 'en' });
  assert.match(own, /closest animal id/, 'the teacher adds their own pictures: the art packs hold the place, as before');
  assert.doesNotMatch(own, /"setting"/);
  assert.equal(SB.lookNames('a small green chameleon with a curly tail', 'chameleon'), true);
  assert.equal(SB.lookNames('a tiny dragon with gold wings', 'baby dragon'), true);
  assert.equal(SB.lookNames('a friendly dinosaur', 'chameleon'), false);
});

test('the writer: a cast member with no "what", or a look that does not name it, is sent back once with the problems', async () => {
  const id = (await SB.createBook(teacher, SETUP)).id;
  const bad = BOOK([{ ...TOMAS, what: '' }, { ...COCO, look: 'a friendly green dinosaur with a long tail' }]);
  bad.pages[1].pic.setting = '';
  writer(n => (n === 1 ? { reply: 'Here it is.', book: bad } : { reply: 'Here is your book about Tomas and Coco.', book: BOOK([TOMAS, COCO]) }));
  const r = await SB.writeBook(teacher, rowOf(id), {});
  assert.equal(calls.length, 2);
  const back = calls[1].messages.at(-1).content;
  assert.match(back, /cast "Tomas": give "what"/);
  assert.match(back, /cast "Coco": the "look" must say what they are \("chameleon"\)/);
  assert.match(back, /page p2: the "pic" needs a "setting"/);
  assert.deepEqual(r.book.cast.map(c => [c.name, c.what]), [['Tomas', 'boy'], ['Coco', 'chameleon']]);
  assert.equal(r.book.pages[0].pic.setting, 'a windy hill in the park');
});

test('the writer: a "what" or a setting that breaks the word rules is refused like any other word', async () => {
  const id = (await SB.createBook(teacher, SETUP)).id;
  writer(() => ({ reply: 'Done.', book: BOOK([TOMAS, { ...COCO, what: 'Mia Pupil' }]) }));
  const r = await SB.writeBook(teacher, rowOf(id), {});
  assert.equal(r.failed, 'unsafe', 'a student\'s name in "what" never reaches the book');
});

test('the reply to the teacher never mentions the art kit while Oomba paints the pictures', async () => {
  const id = (await SB.createBook(teacher, SETUP)).id;
  writer(() => ({ reply: 'Here is your book about Tomas and Coco. Coco has no matching animal picture, so the cast uses a green-looking friend drawn as the closest art, and the look describes her as a chameleon. Ask me for any changes!', book: BOOK([TOMAS, COCO]) }));
  const r = await SB.writeBook(teacher, rowOf(id), {});
  assert.equal(r.reply, 'Here is your book about Tomas and Coco. Ask me for any changes!');
  assert.equal(SB.kitFree('I used the art pack sprite for Coco.'), '');
  assert.equal(SB.kitFree('Coco is a chameleon.'), 'Coco is a chameleon.');
});

// ---------------------------------------------------------------- the prompts and the audit trail
test('no kit sprite or world name ever reaches Google: a chameleon drawn by the triceratops sprite is painted as a chameleon', async () => {
  writer(() => ({ reply: 'Here is your book.', book: BOOK([TOMAS, COCO]) }));
  const id = await start();
  const b = SB.bookOf(rowOf(id));
  assert.equal(b.cast.find(c => c.name === 'Coco').art, 'triceratops', 'the stand-in art is still kept for the fallback drawing');
  assert.ok(fake.calls.length >= 4, 'two sheets and two pages');
  const banned = kitWordsNotIn(b);
  assert.ok(banned.includes('Triceratops') && banned.includes('Dino Valley') && banned.includes('Explorer'));
  for (const c of fake.calls) {
    const text = promptText(c);
    for (const w of banned) assert.doesNotMatch(text, new RegExp(`\\b${w.replace(/[-]/g, '[- ]')}\\b`, 'i'), `"${w}" was sent to Google`);
    assert.doesNotMatch(text, /dinosaur/i);
  }
  const sheet = fake.calls.map(promptText).find(t => /called Coco/.test(t));
  assert.match(sheet, /The character, called Coco: a small green chameleon with a curly tail and big round eyes\./);
  assert.match(sheet, /What Coco is: chameleon\. Draw Coco as exactly that .*never as any other animal, person or creature\./);
  const p1 = fake.calls.map(promptText).find(t => /flies? a red kite|fly a red kite/.test(t));
  assert.match(p1, /Where: a windy hill in the park\./);
  assert.match(p1, /- Coco \(chameleon\): a small green chameleon/);
  // the audit trail: every picture's prompt is kept, exactly as sent
  const rows = draws(id);
  assert.ok(rows.length >= 4 && rows.every(d => d.state === 'done' && d.prompt));
  for (const d of rows) assert.ok(fake.calls.some(c => promptText(c).startsWith(d.prompt.split('\nReference picture')[0])), `${d.target}'s prompt is the one sent`);
});

test('an old book (no "what", no look, kit art and world): the prompts carry no kit kind or world name', async () => {
  writer(() => ({ reply: 'Here is your book.', book: BOOK([TOMAS, COCO]) }));
  const id = await start();
  // as books were before: the cast without "what" or a look, pictures without a setting
  const b = SB.bookOf(rowOf(id));
  b.cast = b.cast.map(({ what, ...c }) => ({ ...c, look: '' }));
  for (const p of b.pages) delete p.pic.setting;
  q.run('UPDATE made_books SET book=? WHERE id=?', JSON.stringify(b), id);
  fake.calls.length = 0;
  for (const tg of ['cast:Coco', 'page:p1']) {
    const r = await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: tg } });
    assert.equal(r.status, 200, r.text);
    await settle();
  }
  assert.equal(fake.calls.length, 2);
  for (const c of fake.calls) {
    const text = promptText(c);
    assert.doesNotMatch(text, /triceratops|dino valley|explorer|dinosaur/i);
    assert.doesNotMatch(text, /^Where:/m, 'no setting: no "Where" at all (never the kit world)');
  }
  assert.match(promptText(fake.calls[0]), /called Coco: a friendly character\./);
});

test('"What Oomba asked for": the owner sees each picture\'s prompt (no student names); nobody else does', async () => {
  writer(() => ({ reply: 'Here is your book.', book: BOOK([TOMAS, COCO]) }));
  const id = await start();
  const ed = (await call(`/api/library/make/${id}`, { user: teacher })).json;
  assert.equal(ed.draws.pages.p1.asked, true); assert.equal(ed.draws.cast.Coco.asked, true);
  const row = draws(id).find(d => d.target === 'page:p1');
  const r = await call(`/api/library/make/${id}/asked?target=page:p1`, { user: teacher });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.text, row.prompt);
  assert.match(r.json.text, /Where: a windy hill in the park\./);
  assert.equal((await call(`/api/library/make/${id}/asked?target=cast:Coco`, { user: teacher })).json.text, draws(id).find(d => d.target === 'cast:coco').prompt);
  for (const who of [teacher2, mia]) assert.equal((await call(`/api/library/make/${id}/asked?target=page:p1`, { user: who })).status, 404, `${who.username} can't see it`);
  assert.equal((await call(`/api/library/make/${id}/asked?target=page:nope`, { user: teacher })).status, 404);
  // a student's name typed into a look is taken out before the prompt is made, so it is never kept either
  const b = SB.bookOf(rowOf(id)); b.cast[1].look = 'a small green chameleon who looks like Mia Pupil';
  q.run('UPDATE made_books SET book=? WHERE id=?', JSON.stringify(b), id);
  assert.equal((await call(`/api/library/make/${id}/draw`, { method: 'POST', user: teacher, body: { target: 'cast:Coco' } })).status, 200);
  await settle();
  const kept = draws(id).find(d => d.target === 'cast:coco').prompt;
  assert.match(kept, /chameleon/); assert.doesNotMatch(kept, /Mia|Pupil/);
  // the editor shows it, small, under the picture (the owner only)
  assert.match((await call(`/library/make/${id}`, { user: teacher })).text, /id="sb-repaint-all"/);
});

test('Paint all pictures again: every picture, painted ones too, against the day\'s pictures', async () => {
  writer(() => ({ reply: 'Here is your book.', book: BOOK([TOMAS, COCO]) }));
  const id = await start();
  const total = draws(id).length, usedBefore = D.usedToday(teacher);
  assert.ok(draws(id).every(d => d.state === 'done'));
  const none = await call(`/api/library/make/${id}/repaint`, { method: 'POST', user: teacher, body: {} });
  assert.equal(none.status, 409, 'Paint pictures again: nothing fell back, nothing to do');
  const before = new Map(draws(id).map(d => [d.target, d.pic_id]));
  fake.calls.length = 0;
  const r = await call(`/api/library/make/${id}/repaint`, { method: 'POST', user: teacher, body: { all: true } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.queued, total); assert.equal(r.json.more, 0);
  await settle();
  assert.equal(fake.calls.length, total);
  assert.equal(D.usedToday(teacher), usedBefore + total, 'each one counts');
  assert.ok(draws(id).every(d => d.state === 'done' && d.pic_id && d.pic_id !== before.get(d.target)), 'every picture painted anew');
  // at most what is left today
  config.storybookPicturesFreePerDay = D.usedToday(teacher) + 1; config.storybookPicturesPlanPerDay = config.storybookPicturesFreePerDay;
  const some = await call(`/api/library/make/${id}/repaint`, { method: 'POST', user: teacher, body: { all: true } });
  assert.equal(some.status, 200); assert.equal(some.json.queued, 1); assert.equal(some.json.more, total - 1);
  await settle();
  assert.equal((await call(`/api/library/make/${id}/repaint`, { method: 'POST', user: teacher2, body: { all: true } })).status, 404, 'another teacher\'s book is not there');
});
