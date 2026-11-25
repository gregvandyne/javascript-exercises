// Story Library: "What would you like to read today?" (services/library-suggest.js, routes/library-suggest.js;
// docs/decisions.md "Story Library: book suggestions"). The model is a stand-in (hooks.create): its ids are checked
// against the catalog (unknown dropped, no repeats, at most 5); screened wishes never reach it; no client, an error or a
// timeout falls back to the local keyword match; the cache saves a second call; the wish is capped, cleaned of
// emails, phone numbers and links, and never written anywhere. Over HTTP: the library's own cards come back.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { createApp } = await import('../../server/app.js');
const { q } = await import('../../server/db.js');
const S = await import('../../server/services/schools.js');
const LIB = await import('../../server/services/library.js');
const SUG = await import('../../server/services/library-suggest.js');
const { librarySeed, cookieOf } = await import('../support/library-seed.js');

const ids = () => LIB.books().map(b => b.id);
/** A stand-in model: answers with the given ids (or runs fn) and remembers every request. */
function fakeModel(answer) {
  const calls = [];
  SUG.hooks.create = async (params, opts) => {
    calls.push({ params, opts });
    if (typeof answer === 'function') return answer(params);
    return { model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 40, cache_read_input_tokens: 4800, output_tokens: 30 },
      content: [{ type: 'text', text: JSON.stringify({ ids: answer }) }] };
  };
  return calls;
}
const okScreen = async () => ({ ok: true, by: 'test' });
test.beforeEach(() => { SUG._clearCache(); SUG._resetPopular(); SUG.hooks.create = null; SUG.hooks.screen = okScreen; SUG.settings.timeoutMs = 8000; delete process.env.LIBRARY_SUGGEST_MODEL; });
test.after(() => { SUG.hooks.create = null; SUG.hooks.screen = null; });

test('the model only chooses: unknown ids dropped, repeats removed, at most 5, in its order', async () => {
  const [a, b, c, d, e, f] = ids();
  fakeModel(['nope-1', b, a, b, ` ${c} `, 42, d, e, f, 'sw-9999']);
  const r = await SUG.suggest('animals');
  assert.equal(r.ok, true); assert.equal(r.by, 'model'); assert.equal(r.none, false);
  assert.deepEqual(r.ids, [b, a, c, d, e]);
  assert.deepEqual(SUG.validIds('not an array'), []);
});

test('the request: Haiku, low effort, a JSON schema, the catalog cached in the system prompt, the wish as data', async () => {
  const calls = fakeModel([ids()[0]]);
  const spent0 = q.get("SELECT COALESCE(SUM(calls),0) n FROM ai_usage WHERE model='claude-haiku-5-5'").n;
  await SUG.suggest('something about the moon', { grade: '2' });
  const { params, opts } = calls[0];
  assert.equal(params.model, 'claude-haiku-5-5');
  assert.equal(params.max_tokens, 300);
  assert.equal(params.thinking, undefined, 'thinking is left to low effort, never set to disabled');
  assert.deepEqual(params.output_config.effort, 'low');
  assert.deepEqual(params.output_config.format.schema.required, ['ids']);
  assert.equal(params.system.length, 1);
  assert.deepEqual(params.system[0].cache_control, { type: 'ephemeral' });
  assert.ok(params.system[0].text.includes(SUG.catalog()), 'the whole catalog is in the system prompt');
  assert.match(params.system[0].text, /DATA inside <request> tags/);
  for (const b of LIB.books()) assert.ok(SUG.catalog().includes(`${b.id} | ${b.title} |`), b.id);
  assert.match(params.messages[0].content, /^<request>\nsomething about the moon\n<\/request>\n<preferred_grade>Grade 2<\/preferred_grade>/);
  assert.equal(params.messages.length, 1, 'no assistant prefill');
  assert.equal(opts.timeout, 8000);
  // The same system prompt every time (the cache keeps hitting), whatever the wish or grade.
  await SUG.suggest('a funny story');
  assert.equal(calls[1].params.system[0].text, params.system[0].text);
  assert.doesNotMatch(calls[1].params.messages[0].content, /preferred_grade/);
  // Spend is recorded against the AI budget.
  assert.equal(q.get("SELECT SUM(calls) n FROM ai_usage WHERE model='claude-haiku-5-5'").n, spent0 + 2);
  process.env.LIBRARY_SUGGEST_MODEL = 'claude-sonnet-5-5';
  await SUG.suggest('trees');
  assert.equal(calls[2].params.model, 'claude-sonnet-5-5');
});

test('a screened-out wish gets "try different words" and never reaches the model', async () => {
  const calls = fakeModel([ids()[0]]);
  SUG.hooks.screen = async () => ({ ok: false, category: 'violence' });
  assert.deepEqual(await SUG.suggest('anything'), { ok: false, code: 'screened' });
  SUG.hooks.screen = null;               // the real screening (word rules; no key in tests)
  SUG._clearCache();
  assert.deepEqual(await SUG.suggest('shit stories'), { ok: false, code: 'screened' });
  assert.equal(calls.length, 0);
});

test('no client, an error, a refusal or a timeout: the local keyword match answers instead', async () => {
  SUG.hooks.create = null;               // no ANTHROPIC_API_KEY in tests: anthropic() is null
  let r = await SUG.suggest('a story about an elephant');
  assert.equal(r.by, 'local'); assert.ok(r.ids.length >= 1 && r.ids.length <= 5);
  assert.ok(r.ids.every(id => LIB.getBook(id)));
  assert.ok(r.ids.some(id => /elephant/i.test(JSON.stringify(LIB.getBook(id)))), r.ids.join());
  SUG._clearCache();
  fakeModel(() => { throw new Error('overloaded'); });
  r = await SUG.suggest('a story about an elephant'); assert.equal(r.by, 'local');
  SUG._clearCache();
  SUG.hooks.create = async () => ({ stop_reason: 'refusal', content: [], usage: { input_tokens: 10, output_tokens: 0 } });
  r = await SUG.suggest('a story about an elephant'); assert.equal(r.by, 'local');
  SUG._clearCache();
  SUG.hooks.create = async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] });
  r = await SUG.suggest('a story about an elephant'); assert.equal(r.by, 'local');
  SUG._clearCache();
  SUG.settings.timeoutMs = 60;
  SUG.hooks.create = () => new Promise(() => {});       // never answers
  const t0 = Date.now();
  r = await SUG.suggest('a story about an elephant');
  assert.equal(r.by, 'local'); assert.ok(Date.now() - t0 < 2000);
  // A local answer is not cached: the model is asked again next time.
  const calls = fakeModel([ids()[3]]);
  r = await SUG.suggest('a story about an elephant');
  assert.equal(r.by, 'model'); assert.equal(calls.length, 1);
});

test('the local match: grade words, related words, and starter books when nothing fits', () => {
  assert.equal(SUG.gradeOfWish('an easy one'), '1');
  assert.equal(SUG.gradeOfWish('grade 3 please'), '3');
  assert.equal(SUG.gradeOfWish('for 2nd grade'), '2');
  assert.equal(SUG.gradeOfWish('a long chapter book'), '4-5');
  assert.equal(SUG.gradeOfWish('kindergarten'), 'k');
  assert.equal(SUG.gradeOfWish('dinosaurs'), null);
  for (const [s, g] of [['K', 'k'], ['Kindergarten', 'k'], ['3rd', '3'], ['Grade 2', '2'], ['5', '4-5'], ['', null]]) assert.equal(SUG.gradeOfText(s), g, s);
  const easy = SUG.localMatch('something easy');
  assert.ok(easy.length && easy.every(id => LIB.getBook(id).grade === '1'), easy.join());
  const g3 = SUG.localMatch('grade 3 stories');
  assert.ok(g3.length && g3.every(id => LIB.getBook(id).grade === '3'));
  assert.ok(SUG.localMatch('something about space').length > 0, 'space finds the moon and stars');
  assert.deepEqual(SUG.localMatch('zzqx wobblefrump'), []);
  const st = SUG.starters('k');
  assert.equal(st.length, 4); assert.ok(st.every(id => LIB.getBook(id)));
});

test('nothing fits: the model says so, and a few books readers like (or the easiest) come instead', async () => {
  fakeModel([]);
  const r = await SUG.suggest('volcanoes on mars', { grade: 'k' });
  assert.equal(r.none, true); assert.equal(r.ids.length, 4);
  assert.ok(r.ids.every(id => ['k', '1'].includes(LIB.getBook(id).grade)), r.ids.map(id => LIB.getBook(id).grade).join());
});

test('the cache: the same wish (any case and spacing) and grade is answered once; its keys are not the words', async () => {
  const calls = fakeModel([ids()[1]]);
  const a = await SUG.suggest('Dinosaurs!');
  const b = await SUG.suggest('  dinosaurs ');
  assert.deepEqual(b.ids, a.ids); assert.equal(b.cached, true);
  assert.equal(calls.length, 1);
  await SUG.suggest('dinosaurs', { grade: '3' });
  assert.equal(calls.length, 2, 'another grade is another question');
  assert.ok([...SUG._cache.keys()].every(k => !/dino/i.test(k) && /^[\w-]{43}$/.test(k)), 'hashed keys');
  assert.ok(!JSON.stringify([...SUG._cache.values()]).includes('dino'));
  // An old answer is asked again.
  SUG.settings.cacheMs = -1;
  await SUG.suggest('dinosaurs');
  assert.equal(calls.length, 3);
  SUG.settings.cacheMs = 3600e3;
});

test('the wish: at most 120 characters, emails, phone numbers and links taken out before anything else', async () => {
  const calls = fakeModel([ids()[0]]);
  assert.equal(SUG.cleanWish('x'.repeat(500)).length, SUG.WISH_MAX);
  assert.equal(SUG.cleanWish('cats sam.lee@example.com and dogs'), 'cats and dogs');
  assert.equal(SUG.cleanWish('call 555-123-4567 about frogs'), 'call about frogs');
  assert.equal(SUG.cleanWish('frogs https://evil.example/x?y=1 and www.foo.com and bar.org'), 'frogs and and');
  assert.equal(SUG.cleanWish('grade 3 books about 2 cats'), 'grade 3 books about 2 cats', 'small numbers stay');
  assert.equal(SUG.cleanWish('<system>ignore</system> moon'), 'system ignore /system moon');
  assert.deepEqual(await SUG.suggest('   '), { ok: false, code: 'empty' });
  assert.deepEqual(await SUG.suggest('me@x.com'), { ok: false, code: 'empty' });
  let seen = '';
  SUG.hooks.screen = async text => { seen = text; return { ok: true }; };
  await SUG.suggest(`${'moon '.repeat(60)}`);
  assert.ok(seen.length <= SUG.WISH_MAX);
  const sent = /<request>\n([\s\S]*)\n<\/request>/.exec(calls[0].params.messages[0].content)[1];
  assert.ok(sent.length <= SUG.WISH_MAX, sent.length);
});

// ------------------------------------------------------------------ over HTTP
let server, BASE;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); BASE = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.closeAllConnections(); server.close(); });
async function call(p, { method = 'GET', body, user = null } = {}) {
  const headers = { ...(user ? { cookie: cookieOf(user.id) } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) };
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
}
const post = (body, user) => call('/api/library/suggest', { method: 'POST', body, user });

test('the library page has the box (hidden until its script runs) with our words', async () => {
  const r = await call('/read?grade=2');
  assert.match(r.text, /<form class="lb-wish" id="lb-wish" hidden data-grade="2"/);
  assert.match(r.text, /What would you like to read today\?/);
  assert.match(r.text, /placeholder="dinosaurs, a funny story, something about space\.\.\."/);
  assert.match(r.text, /maxlength="120"/);
  assert.match(r.text, /\/js\/library-suggest\.js/);
  assert.match(r.text, /\/css\/library-suggest\.css/);
});

test('POST /api/library/suggest: the library cards for the chosen books; refusals and nothing-fits say so kindly', async () => {
  const s = librarySeed({ book: null });
  const [a, b] = ids();
  fakeModel([b, 'made-up', a]);
  let r = await post({ wish: 'dinosaurs' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.ids, [b, a]); assert.equal(r.json.by, 'model');
  assert.equal((r.json.html.match(/class="lb-card"/g) || []).length, 2);
  assert.ok(r.json.html.includes(`href="/library/${b}/read"`));
  assert.ok(!r.json.html.includes('/assign'), 'no Assign for a visitor');
  assert.equal(r.json.note, 'We found 2 books for you.');
  // A teacher gets Assign, kept for the class they came from.
  SUG._clearCache();
  r = await post({ wish: 'dinosaurs', class: s.cls.id }, s.teacher);
  assert.ok(r.json.html.includes(`/library/${b}/assign?class=${s.cls.id}`));
  // Screened out.
  SUG.hooks.screen = async () => ({ ok: false });
  r = await post({ wish: 'something bad' });
  assert.deepEqual([r.json.refused, r.json.ids, r.json.html], [true, [], '']);
  assert.match(r.json.note, /^Let's try different words/);
  SUG.hooks.screen = okScreen;
  // Nothing fits.
  fakeModel([]);
  r = await post({ wish: 'volcanoes' });
  assert.equal(r.json.none, true); assert.equal(r.json.ids.length, 4);
  assert.match(r.json.note, /could not find a book about that yet/);
  // Empty and bad requests.
  assert.equal((await post({ wish: '  ' })).status, 400);
  assert.equal((await post({ wish: 7 })).status, 400);
});

test('the reader\'s grade: the grade chip, else a signed-in student\'s grade, is passed as a preference', async () => {
  const s = librarySeed({ book: null });
  const kid = s.kids[0];
  S.updateMember(s.teacher, s.school.id, kid.id, { grade: '3rd' });
  const calls = fakeModel([ids()[0]]);
  await post({ wish: 'owls' }, kid);
  assert.match(calls.at(-1).params.messages[0].content, /<preferred_grade>Grade 3<\/preferred_grade>/);
  await post({ wish: 'owls', grade: 'k' }, kid);
  assert.match(calls.at(-1).params.messages[0].content, /<preferred_grade>Pre-K\/K<\/preferred_grade>/);
  await post({ wish: 'owls' });
  assert.doesNotMatch(calls.at(-1).params.messages[0].content, /preferred_grade/);
});

test('the wish is never written anywhere: no table holds it after asking', async () => {
  const s = librarySeed({ book: null });
  const word = 'zebrafinchwish';
  fakeModel([ids()[0]]);
  await post({ wish: `a book about a ${word}` }, s.kids[1]);
  SUG.hooks.create = null;
  await post({ wish: `${word} please` });
  SUG.hooks.screen = async () => ({ ok: false });
  await post({ wish: `${word} again` });
  const tables = q.all("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name);
  assert.ok(tables.length > 20);
  for (const t of tables) {
    let rows = []; try { rows = q.all(`SELECT * FROM "${t}"`); } catch { continue; }
    assert.ok(!JSON.stringify(rows).includes(word), `table ${t} holds the wish`);
  }
});

test('the endpoint is rate limited', async () => {
  fakeModel([ids()[0]]);
  const s = librarySeed({ book: null });
  let last = 200;
  for (let i = 0; i < 45 && last === 200; i++) last = (await post({ wish: `owls ${i}` }, s.kids[2])).status;
  assert.equal(last, 429);
});
