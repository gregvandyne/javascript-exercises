// "My worksheets" in a Builder classroom activity (Oomba Canvas 1.4.0; server/services/game-sets.js cleanCanvasItems,
// routes/games.js canvasSetVersion / setKind, services/canvas-print.js; docs/canvas-api.md "Worksheets"): what a
// worksheet may hold (the kit's own problems, its text through the site's filter, the self-test), who may save one
// (school staff only, never a student, a child or a guest), owner-only list / rename / duplicate / delete (anyone
// else's is a 404), which activities keep them (1.4.0 and later only, never an arcade game), who the frame offers the
// list to, the link that opens a worksheet for students, and printing one by its code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reset, call, publish, kid, teacher, teacher2, mia, mum, boss, q } from './_live.js';
import * as G from '../../server/services/game-sets.js';
import { canvasTag } from '../../server/services/canvaskit.js';
import { cleanCanvasPrintDoc } from '../../server/services/canvas-print.js';
import { createGuest } from '../../server/auth.js';

const DATA = {
  config: { lang: 'en', support: 'guided', supports: ['guided'], count: 3, fresh: true, board: false, purpose: ['screen', 'worksheet', 'generator'] },
  task: { title: 'Adding', say: 'Add the numbers.' }, problems: [], gen: { tool: 'digits.add', digits: 2 }, steps: {}, hints: {},
};
const page = (v = '1.4.0', data = DATA) => `<title>Adding</title>\n${canvasTag(v)}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
const ACT = publish(teacher, page(), { title: 'Adding' });
const SCREEN = publish(teacher, page('1.4.0', { ...DATA, config: { ...DATA.config, purpose: ['screen'] }, gen: null, problems: [{ tool: 'digits.add', a: 12, b: 34 }] }), { title: 'Screen only' });
const OLD = publish(teacher, page('1.3.0'), { title: 'Old kit' });
const ARCADE = publish(teacher, '<!doctype html><title>t</title><p>arcade</p>', { title: 'Arcade' });
const ITEMS = [{ tool: 'digits.add', a: 12, b: 34 }, { tool: 'digits.add', a: 56, b: 27 }, { tool: 'digits.add', a: 48, b: 19 }];
const SORT = { tool: 'tiles.sort', items: [{ t: 'cat', bin: 0 }, { t: 'oak', bin: 1 }, { t: 'dog', bin: 0 }], bins: ['Animals', 'Plants'] };
const CHOICE = { tool: 'figure.choice', q: 'Which is bigger?', choices: ['A cat', 'A dog'], answer: 1, work: ['A dog is bigger.', 'A dog'] };
const base = g => `/api/games/${g.id}/sets`;
const clear = () => q.run('DELETE FROM game_sets');
const save = async (g, items = ITEMS, user = teacher, extra = {}) => call(base(g), { method: 'POST', body: { items, ...extra }, user });
const frameInit = async (g, user = null, query = '') => {
  const p = await call(`/play/${g.slug}${query}`, { user });
  assert.equal(p.status, 200);
  const frame = await call(/data-src="(\/frame\/[^"]+?)"/.exec(p.text)[1].replace(/&amp;/g, '&'), { user });
  return JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(frame.text)[1]);
};

test('cleanCanvasItems: the kit\'s own problems, fields it does not read dropped, text through the filter, and the self-test', () => {
  const html = page();
  assert.deepEqual(G.cleanCanvasItems(ITEMS, html), ITEMS);
  assert.deepEqual(G.cleanCanvasItems([{ ...ITEMS[0], name: 'Mia Pupil', st: { ans: [4, 6] } }], html), [ITEMS[0]], 'only the fields the kit reads: nothing about who played');
  assert.deepEqual(G.cleanCanvasItems([SORT, CHOICE], html), [SORT, CHOICE], 'free text the filter lets through stays');
  for (const [bad, why] of [
    [[], 'empty'], [Array(21).fill(ITEMS[0]), 'over 20'], ['x', 'not a list'], [[{ tool: 'nope' }], 'an unknown tool'],
    [[{ tool: 'fractions.equiv', from: [5, 6], to: 8 }], 'a problem the self-test refuses (cannot be made)'],
    [[{ ...SORT, bins: ['Animals', 'shit'] }], 'a rude word'], [[{ ...CHOICE, q: 'Email me at someone@example.com' }], 'personal details'],
    [[{ ...CHOICE, q: 'See https://bad.example/x' }], 'a link'],
    [[{ ...CHOICE, work: ['A dog is bigger.', 'A cat'] }], 'a worked answer that does not end on the answer'],
  ]) assert.equal(G.cleanCanvasItems(bad, html), null, why);
  assert.ok(G.cleanCanvasItems([{ ...CHOICE, q: 'x'.repeat(400) }], html)[0].q.length <= 200, 'a long question is cut to the kit\'s own limit');
  assert.equal(G.cleanCanvasItems(ITEMS, page('1.3.0')), null, 'only an activity on 1.4.0 or later');
  assert.equal(G.cleanCanvasItems(ITEMS, '<p>arcade</p>'), null);
  assert.equal(G.labelOf(G.CANVAS_KIND, ITEMS), '3 questions'); assert.equal(G.labelOf(G.CANVAS_KIND, ITEMS.slice(0, 1)), '1 question');
  assert.equal(G.sizeOf(G.CANVAS_KIND, ITEMS), 3);
});

test('saving: school staff only; a student, a child, a guest and a family grown-up cannot; only activities on 1.4.0', async () => {
  reset(); clear();
  const r = await save(ACT, [...ITEMS, { ...ITEMS[0], extra: 1 }], teacher, { title: 'Unit 4 practice' });
  assert.equal(r.status, 200, r.text); assert.match(r.json.id, G.SET_ID);
  const s = G.get(ACT.id, r.json.id);
  assert.equal(s.ownerId, teacher.id); assert.equal(s.title, 'Unit 4 practice'); assert.deepEqual(s.items, [...ITEMS, ITEMS[0]]);
  assert.equal((await save(SCREEN, ITEMS.slice(0, 1))).status, 200, 'an activity for the screen only keeps worksheets too');
  for (const u of [mia, kid]) { const x = await save(ACT, ITEMS, u); assert.equal(x.status, 403, u.username); assert.equal(x.json.code, 'notAllowed'); }
  const guest = createGuest();
  assert.equal((await save(ACT, ITEMS, guest)).status, 403);
  assert.equal((await save(ACT, ITEMS, null)).status, 401);
  assert.notEqual((await save(ACT, ITEMS, mum)).status, 200, 'the fence keeps family grown-ups to playing');
  assert.equal((await save(OLD, ITEMS)).status, 404, 'an activity on 1.3.0 keeps none');
  assert.equal((await save(ARCADE, ITEMS)).status, 404, 'an arcade game keeps none');
  const bad = await save(ACT, [{ tool: 'nope' }]); assert.equal(bad.status, 400); assert.equal(bad.json.code, 'bad');
  assert.equal((await save(ACT, ITEMS, boss)).status, 200, 'the platform admin may');
  assert.equal(q.get('SELECT COUNT(*) n FROM game_sets WHERE owner_id IN (?,?)', mia.id, kid.id).n, 0, 'no student or child data in any set');
});

test('the list, rename, duplicate and delete: the owner only; anyone else\'s worksheet is a 404', async () => {
  reset(); clear();
  const id = (await save(ACT, ITEMS, teacher, { title: 'Warm-up' })).json.id;
  await save(ACT, ITEMS.slice(0, 1), teacher2);
  const list = await call(base(ACT), { user: teacher });
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.sets.map(s => [s.id, s.title, s.n, s.label, s.code]), [[id, 'Warm-up', 3, '3 questions', G.codeOf(id)]]);
  assert.deepEqual(list.json.sets[0].items, ITEMS);
  for (const [m, p, body] of [['DELETE', `${base(ACT)}/${id}`], ['POST', `${base(ACT)}/${id}/rename`, { title: 'x' }], ['POST', `${base(ACT)}/${id}/duplicate`, {}]]) {
    const r = await call(p, { method: m, body, user: teacher2 });
    assert.equal(r.status, 404, `${m} ${p}`); assert.equal(r.json.code, 'noSet');
  }
  assert.equal((await call(`${base(SCREEN)}/${id}`, { method: 'DELETE', user: teacher })).status, 404, 'another activity\'s');
  const rn = await call(`${base(ACT)}/${id}/rename`, { method: 'POST', body: { title: 'Unit 4' }, user: teacher });
  assert.deepEqual(rn.json, { ok: true, title: 'Unit 4' });
  assert.equal((await call(`${base(ACT)}/${id}/rename`, { method: 'POST', body: { title: 'shit list' }, user: teacher })).json.code, 'title');
  const dup = await call(`${base(ACT)}/${id}/duplicate`, { method: 'POST', body: {}, user: teacher });
  assert.equal(dup.status, 200); assert.equal(dup.json.set.title, 'Copy of Unit 4'); assert.deepEqual(dup.json.set.items, ITEMS);
  assert.equal((await call(`${base(ACT)}/${id}`, { method: 'DELETE', user: teacher })).status, 200);
  assert.deepEqual((await call(base(ACT), { user: teacher })).json.sets.map(s => s.id), [dup.json.id]);
  assert.equal((await call(base(OLD), { user: teacher })).status, 404);
});

test('the frame: My worksheets for school staff in the published activity; never a student; a worksheet link opens its questions', async () => {
  reset(); clear();
  const id = (await save(ACT, ITEMS)).json.id;
  const t = await frameInit(ACT, teacher);
  assert.equal(t.mySets, true); assert.equal(t.teach, true); assert.equal(t.set, undefined);
  for (const u of [mia, kid, null]) { const i = await frameInit(ACT, u); assert.equal(i.mySets, undefined, String(u && u.username)); assert.equal(i.setSave, false, 'saving is off for them'); }
  assert.equal((await frameInit(OLD, teacher)).mySets, undefined, 'an older kit: no list');
  assert.equal((await frameInit(ARCADE, teacher)).mySets, undefined);
  const s = await frameInit(ACT, mia, `?chapter=${id}&lock=1`);
  assert.deepEqual(s.set, { id, items: ITEMS, mine: false });
  assert.deepEqual((await frameInit(ACT, teacher, `?chapter=${id}&lock=1`)).set.mine, true);
  assert.deepEqual((await frameInit(ACT, mia, '?chapter=s-zzzzzzzzzz&lock=1')).set, { id: 's-zzzzzzzzzz', missing: true });
  assert.equal((await frameInit(OLD, mia, `?chapter=${id}`)).set, undefined, 'another activity never opens it');
  // a class code typed in works the same way as for the official games
  const code = await call(`${base(ACT)}/${id.slice(2).toUpperCase()}`);
  assert.deepEqual(code.json, { id, items: ITEMS });
});

test('printing a worksheet by its code: its own questions, its class code and link; anyone else\'s activity or a bad code is refused', async () => {
  reset(); clear();
  assert.deepEqual(cleanCanvasPrintDoc({ k: 'canvas', set: 's-abcdefghjk', n: 3 }), { ok: true, doc: { k: 'canvas', set: 's-abcdefghjk', n: 3, paper: 'a4', key: false } });
  for (const bad of [{ k: 'canvas', set: 's-abc', n: 3 }, { k: 'canvas', set: 's-abcdefghjk', seed: 4, n: 3 }, { k: 'canvas', set: 7, n: 3 }]) assert.equal(cleanCanvasPrintDoc(bad).ok, false);
  const id = (await save(ACT, ITEMS)).json.id;
  const r = await call(`/api/games/${ACT.id}/print`, { method: 'POST', body: { doc: { k: 'canvas', set: id, n: 3, paper: 'letter' } }, user: mia });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.html, /data-questions="3"/);
  assert.match(r.json.html, /12/); assert.match(r.json.html, /56/); assert.match(r.json.html, /48/);
  assert.ok(r.json.html.includes(`Class code: ${G.codeOf(id)}`));
  assert.ok(r.json.html.includes(`/play/${ACT.slug}?chapter=${id}&amp;lock=1`));
  assert.doesNotMatch(r.json.html, /Sheet \d+/, 'a worksheet shows its code, not a sheet number');
  const key = await call(`/api/games/${ACT.id}/print`, { method: 'POST', body: { doc: { k: 'canvas', set: id, n: 3, key: true } }, user: mia });
  assert.equal(key.status, 403, 'the answer key is not for a student');
  assert.equal((await call(`/api/games/${ACT.id}/print`, { method: 'POST', body: { doc: { k: 'canvas', set: id, n: 3, key: true } }, user: teacher })).status, 200);
  assert.equal((await call(`/api/games/${ACT.id}/print`, { method: 'POST', body: { doc: { k: 'canvas', set: 's-zzzzzzzzzz', n: 3 } } })).status, 404);
  const other = publish(teacher2, page(), { title: 'Other' });
  assert.equal((await call(`/api/games/${other.id}/print`, { method: 'POST', body: { doc: { k: 'canvas', set: id, n: 3 } } })).status, 404, 'another activity\'s worksheet');
});
