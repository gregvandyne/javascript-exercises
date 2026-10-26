// Live build steps (steps.js): the streaming notes/lines scanner, the shared note cleaner, the step recorder,
// and the rule that the stored steps record never reaches the model.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
import test from 'node:test';
import assert from 'node:assert/strict';

const { inputScanner, cleanNote, stepRecorder, keep, NO_STEPS, STEP_KEYS } = await import('../../server/builder/steps.js');
const { summariseEvents } = await import('../../server/builder/chat.js');
const { historyToMessages } = await import('../../server/builder/claude.js');

/** Feed s in the given pieces; returns the last result. */
const feed = (pieces) => { const sc = inputScanner(); let r; for (const p of pieces) r = sc.push(p); return r; };
const lines = n => Array.from({ length: n }, (_, i) => `  line ${i + 1} {"x": "y"}, 'q' \\ ok`).join('\n');

test('inputScanner: notes before or after html give the same plan and lines, however the input is cut', () => {
  const html = `<title>Fox</title>\n${lines(99)}`;   // 100 lines
  for (const json of [JSON.stringify({ notes: 'A fox who hops over logs', html }), JSON.stringify({ html, notes: 'A fox who hops over logs' })]) {
    const whole = feed([json]);
    assert.deepEqual(whole, { plan: 'A fox who hops over logs', lines: 100, edits: 0 });
    assert.deepEqual(feed(json.split('')), whole, 'one character at a time');
    for (let i = 0; i <= json.length; i++) assert.deepEqual(feed([json.slice(0, i), json.slice(i)]), whole, `cut at ${i}`);
  }
  // notes first: the plan is known long before the html is finished
  const json = JSON.stringify({ notes: 'Adding a dragon boss', html });
  const early = inputScanner().push(json.slice(0, 60));
  assert.equal(early.plan, 'Adding a dragon boss'); assert.ok(early.lines >= 1 && early.lines < 100);
  assert.deepEqual(inputScanner().push('{"notes":"x"'), { plan: 'x', lines: 0, edits: 0 }, 'no html yet: 0 lines');
});

test('inputScanner: escapes, unicode, surrogate pairs and RTL text in notes are decoded', () => {
  const cases = ['Said "hi" to the fox', 'A back\\slash path', 'Café time', 'A 🐉 dragon boss', 'הוספתי דרקון', 'أضفت تنينًا'];
  for (const notes of cases) {
    const json = JSON.stringify({ notes, html: '<title>x</title>' });
    assert.equal(feed(json.split('')).plan, notes, notes);   // one UTF-16 unit at a time, even inside 🐉
    for (let i = 0; i <= json.length; i++) assert.equal(feed([json.slice(0, i), json.slice(i)]).plan, notes, `${notes} cut at ${i}`);
  }
  // written as \u escapes (what some encoders send), including a surrogate pair split across chunks
  const esc = '{"notes":"Caf\\u00e9 \\ud83d\\udc09 boss","html":"<p>"}';
  assert.equal(feed([esc]).plan, 'Café 🐉 boss');
  for (let i = 0; i <= esc.length; i++) assert.equal(feed([esc.slice(0, i), esc.slice(i)]).plan, 'Café 🐉 boss', `cut at ${i}`);
  // control and bidi-override characters inside the notes are cleaned like version notes
  assert.equal(feed([JSON.stringify({ notes: 'Evil‮ txt\nline two\t!', html: '' })]).plan, 'Evil txt line two !');
});

test('inputScanner: only real newlines in the html count; text that looks like notes inside html is ignored', () => {
  assert.equal(feed([JSON.stringify({ notes: 'n', html: 'a\\nb' })]).lines, 1, 'a literal backslash + n is not a newline');
  assert.equal(feed([JSON.stringify({ notes: 'n', html: 'a\nb\nc' })]).lines, 3);
  const sneaky = JSON.stringify({ html: 'var x = {"notes":"fake"};\n' + lines(5), notes: 'Real plan' });
  assert.equal(feed([sneaky]).plan, 'Real plan');
  assert.equal(feed(sneaky.split('')).plan, 'Real plan');
  const sneakyFirst = JSON.stringify({ notes: 'Real plan', html: '{"notes":"fake"}' });
  assert.equal(feed([sneakyFirst]).plan, 'Real plan', 'only the first top-level notes counts');
  assert.equal(feed([JSON.stringify({ html: lines(100) })]).lines, 100);
  assert.equal(feed([JSON.stringify({ html: lines(100) })]).plan, null, 'no notes at all');
});

test('inputScanner: edits count completed find/replace objects, also when cut in the middle of one', () => {
  const json = JSON.stringify({ notes: 'Faster fox', edits: [{ find: 'speed: 1', replace: 'speed: 2' }, { find: 'a\n"b"', replace: '{x}\n[y]' }] });
  assert.deepEqual(feed([json]), { plan: 'Faster fox', lines: 0, edits: 2 });
  const mid = json.indexOf('{"find":"a');
  const sc = inputScanner();
  assert.equal(sc.push(json.slice(0, mid + 5)).edits, 1, 'first edit done, second still streaming');
  assert.equal(sc.push(json.slice(mid + 5)).edits, 2);
  for (let i = 0; i <= json.length; i++) assert.deepEqual(feed([json.slice(0, i), json.slice(i)]), { plan: 'Faster fox', lines: 0, edits: 2 }, `cut at ${i}`);
  assert.equal(feed([JSON.stringify({ edits: [{ find: 'a', replace: 'b' }], notes: 'After' })]).plan, 'After', 'notes after edits');
});

test('inputScanner: malformed input never throws; very long notes are given up', () => {
  const junk = ['{"html":"a"b"c\n', '"}}}]]]', '\\', '{"notes":', 'garbage {[}]"\\u12', '', '{"notes":"\\uZZZZ"}', null, undefined, 42];
  const sc = inputScanner();
  for (const j of junk) assert.doesNotThrow(() => sc.push(j));
  assert.doesNotThrow(() => feed(['{"notes":"unterminated']));
  assert.equal(feed(['{"notes":"unterminated']).plan, null, 'an unfinished notes string is not a plan yet');
  assert.equal(feed([JSON.stringify({ notes: 'x'.repeat(4001), html: 'a' })]).plan, null, 'over 4000 characters: no plan');
  assert.equal(feed([JSON.stringify({ notes: 'y'.repeat(300), html: 'a' })]).plan, 'y'.repeat(120), 'long notes are capped at 120');
  assert.equal(feed(['{"notes":"   ","html":"a"}']).plan, null, 'blank notes are not a plan');
  // a bad notes value makes the scanner give up on the plan, never pick up a later fake one
  assert.equal(feed(['{"notes":"bad\\uZZZZ","html":"{\\"notes\\":\\"fake\\"}"}']).plan, null);
});

test('cleanNote: collapses whitespace, caps the length, turns control and bidi characters into spaces', () => {
  assert.equal(cleanNote('  Added   a\n\ndragon\t hero  '), 'Added a dragon hero');
  assert.equal(cleanNote('a‮b⁦c⁩d\u0000e\u0085f'), 'a b c d e f');
  assert.equal(cleanNote('x'.repeat(300)).length, 200);
  assert.equal(cleanNote('abc', 2), 'ab');
  assert.equal(cleanNote('ab🐉', 3), 'ab', 'never cut in the middle of a surrogate pair');
  assert.equal(cleanNote(null), ''); assert.equal(cleanNote(undefined), ''); assert.equal(cleanNote(12), '12');
});

test('stepRecorder: numbers rows, patches the right row, keeps only allowed facts', () => {
  const out = []; const s = stepRecorder((n, d) => out.push([n, d]), Date.now());
  assert.equal(s.current(), null);
  assert.equal(s.start('screen'), 1);
  assert.equal(s.start('think', { n: 1, c: 'start', g: 1, junk: 'x', label: 'Round 1' }), 2);
  assert.equal(s.start('write'), 3);
  assert.equal(s.start('name', { title: 'Fox Hop', icon: '🦊', description: 'not kept' }), 4);
  s.info({ plan: 'p'.repeat(200), l: 12.6 }, 3);     // not the newest row
  s.info({ ok: false, why: 'cut' }, 3);
  s.info({ th: 1 }, 2);
  s.info({ c: 'nonsense', n: '7', ok: true, why: 'other', foo: 1 }, 2);   // nothing valid: no event
  s.info({ l: 5 }, 0); s.info({ l: 5 }, 99);                            // no such row: ignored
  assert.equal(s.start('made-up'), 0, 'unknown keys are refused');
  assert.equal(s.current(), 'name');
  // step carries at (ms since the attempt started) for pages that join mid-build; it is structural, never a fact.
  for (const [n, d] of out) if (n === 'step') { assert.ok(Number.isInteger(d.at) && d.at >= 0, 'step has at'); delete d.at; }
  assert.deepEqual(out, [
    ['step', { i: 1, key: 'screen' }],
    ['step', { i: 2, key: 'think', n: 1, c: 'start', g: 1 }],
    ['step', { i: 3, key: 'write' }],
    ['step', { i: 4, key: 'name', title: 'Fox Hop', icon: '🦊' }],
    ['stepinfo', { i: 3, plan: 'p'.repeat(120), l: 13 }],
    ['stepinfo', { i: 3, ok: false, why: 'cut' }],
    ['stepinfo', { i: 2, th: 1 }],
  ]);
  assert.deepEqual(keep({ st: 'pass', v: 3, pics: 7, probs: -2, e: 4, via: 'edit', c: 'look' }), { st: 'pass', v: 3, pics: 2, probs: 0, e: 4, via: 'edit', c: 'look' });
  assert.deepEqual(keep({ st: 'bad', via: 'paint', title: '  ', icon: '', plan: '' }), {});
  assert.equal(keep({ title: 'T'.repeat(80) }).title.length, 60);
  assert.equal(keep({ icon: '🐉🐉🐉🐉🐉🐉🐉🐉🐉🐉' }).icon, '🐉'.repeat(8), 'icon capped at 8 characters (code points)');
  assert.deepEqual(keep({ st: 'flag', k: 3 }), { st: 'flag', k: 3 }); assert.deepEqual(keep({ k: 500 }), { k: 99 });
  // Only the allow-list's own keys: inherited names and __proto__ are dropped, never looked up or stored.
  assert.deepEqual(keep(JSON.parse('{"__proto__":{"x":1},"n":3}')), { n: 3 });
  assert.deepEqual(keep({ toString: 1, constructor: 'x', hasOwnProperty: 2, n: 2 }), { n: 2 });
  const rec = s.record({ p: 'ai', ti: 1000, to: 50, end: 'ok' });
  assert.equal(rec.v, 1); assert.equal(rec.p, 'ai'); assert.equal(rec.r, 1, 'r counts think rows'); assert.equal(rec.ti, 1000); assert.equal(rec.to, 50); assert.equal(rec.end, 'ok');
  assert.ok(Number.isInteger(rec.ms) && rec.ms >= 0);
  assert.deepEqual(rec.s.map(r => r[0]), ['screen', 'think', 'write', 'name']);
  assert.equal(rec.s[0].length, 2, 'rows without facts are [key, at]');
  assert.deepEqual(rec.s[2][2], { plan: 'p'.repeat(120), l: 13, ok: false, why: 'cut' });
  assert.ok(rec.s.every(r => Number.isInteger(r[1]) && r[1] >= 0));
  assert.equal(STEP_KEYS.includes('sending') || STEP_KEYS.includes('offline') || STEP_KEYS.includes('waiting'), false, 'client-only rows are never sent');
  assert.ok(STEP_KEYS.includes('resume'), 'a build carried on after a restart has a resume row');
  assert.ok(!rec.s.some(r => r[2] && 'at' in r[2]), 'at is not stored as a fact');
  const r2 = stepRecorder(() => {}); r2.start('resume', { v: 3 }); assert.deepEqual(r2.record({ p: 'blocks', end: 'restart' }).s[0][2], { v: 3 });
});

test('stepRecorder: no record when only screening happened; tokens left out when 0; at most 80 rows', () => {
  const s = stepRecorder(() => {}); s.start('screen');
  assert.equal(s.record({ p: 'ai' }), null);
  assert.equal(stepRecorder(() => {}).record({ p: 'blocks' }), null, 'nothing at all');
  s.start('blocks');
  const rec = s.record({ p: 'blocks', ti: 0, to: 0 });
  assert.equal('ti' in rec, false); assert.equal('to' in rec, false); assert.equal(rec.r, 0); assert.equal(rec.end, 'ok');
  const big = stepRecorder(() => {}); let last = 0;
  for (let k = 0; k < 100; k++) last = big.start('think', { n: 1, c: 'next' }) || last;
  assert.equal(last, 80); assert.equal(big.start('ask'), 0);
  assert.equal(big.record({ p: 'ai' }).s.length, 80);
  assert.equal(NO_STEPS.start('think'), 0); assert.doesNotThrow(() => NO_STEPS.info({ th: 1 })); assert.equal(NO_STEPS.current(), null);
});

test('the steps record never reaches the model', () => {
  const version = ['version', { number: 2, notes: 'Faster fox', status: 'pass' }];
  const rec = { v: 1, p: 'ai', ms: 84210, r: 2, ti: 4000, to: 300, end: 'ok', s: [['screen', 0], ['think', 412, { n: 1, c: 'start', th: 1 }], ['write', 1300, { plan: 'Secret plan words', l: 312 }]] };
  assert.equal(summariseEvents([version, ['steps', rec]]), summariseEvents([version]));
  assert.equal(summariseEvents([['steps', rec]]), '');
  const base = [{ role: 'user', text: 'a fox game' }, { role: 'assistant', text: 'Here it is!', events: [version] }, { role: 'user', text: 'thanks' }];
  const withSteps = [base[0], { ...base[1], events: [version, ['steps', rec]] }, base[2]];
  const a = historyToMessages(base), b = historyToMessages(withSteps);
  assert.deepEqual(b, a);
  const json = JSON.stringify(b);
  for (const s of ['"steps"', 'steps', 'plan', 'Secret plan words', '"th"', 'think']) assert.ok(!json.includes(s), s);
  // A steps-only assistant message (e.g. a turn with no words) adds nothing either; the two user messages it leaves
  // side by side are joined (the API wants the roles in turns).
  assert.deepEqual(historyToMessages([base[0], { role: 'assistant', text: '', events: [['steps', rec]] }, base[2]]), [{ role: 'user', content: 'a fox game\n\nthanks' }]);
});

test('follow-up facts: a round started by new messages (c msg, m 1-9), the read row, and fu in the record only when above 0', () => {
  assert.ok(STEP_KEYS.includes('read') && STEP_KEYS.includes('resume'));
  assert.deepEqual(keep({ c: 'msg', m: 2, n: 3 }), { c: 'msg', m: 2, n: 3 });
  assert.deepEqual(keep({ m: 0 }), {}); assert.deepEqual(keep({ m: 10 }), {}); assert.deepEqual(keep({ m: 1.5 }), {});
  const out = [];
  const rec = stepRecorder((name, d) => out.push([name, d]));
  rec.start('blocks'); rec.start('read', { m: 1 });
  assert.deepEqual(out[1][1], { i: 2, key: 'read', at: out[1][1].at, m: 1 });
  assert.equal(typeof out[1][1].at, 'number');
  assert.equal(rec.record({ p: 'blocks' }).fu, undefined);
  assert.equal(rec.record({ p: 'blocks', fu: 0 }).fu, undefined);
  assert.equal(rec.record({ p: 'blocks', fu: 2 }).fu, 2);
});
