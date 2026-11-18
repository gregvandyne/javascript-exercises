// Box by Box (seed-games/box-by-box.html, built from tools/box-by-box): long division and multiplication worked box by
// box. Its activities are shared as question sets (services/game-sets.js): one activity per set, only numbers and
// fixed settings (no title or other free text leaves the teacher's save). This file: the set cleaner, what the Assign
// page and the lesson call an activity, and saving one through the route and opening it in the frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reset, call, publish, official, kid, teacher } from './_live.js';
import * as gameSets from '../../server/services/game-sets.js';
import { parseParams } from '../../server/services/play-params.js';

const DIV = { k: 'divide', p: [[92, 4], [612, 6], [1000, 3]], l: 'guided' };
const MUL = { k: 'multiply', p: [[24, 13], [4096, 908]], l: 'countUp' };

test('box-by-box sets: one activity of problems the game can work, a known level, flags only for a custom mix', () => {
  const clean = gameSets.SET_GAMES.get('box-by-box');
  assert.deepEqual(clean([DIV]), [DIV]);
  assert.deepEqual(clean([MUL]), [MUL]);
  assert.deepEqual(clean([{ ...DIV, p: [['92', '4']] }]), [{ ...DIV, p: [[92, 4]] }], 'numbers written as text are read');
  assert.deepEqual(clean([{ ...DIV, l: 'custom', c: '0100001' }]), [{ ...DIV, l: 'custom', c: '0100001' }]);
  const plan = { count: 16, dividends: [100, 999], divisors: [2, 9], remainders: false };
  assert.deepEqual(clean([{ k: 'divide', p: [], l: 'guided', d: 1, g: plan }]), [{ k: 'divide', p: [], l: 'guided', d: 1, g: plan }], 'a fresh set per student');
  const bad = [
    [], [DIV, MUL], 'x', [null],
    [{ ...DIV, k: 'add' }], [{ ...DIV, l: 'expert' }], [{ ...DIV, p: [] }], [{ ...DIV, p: Array(101).fill([92, 4]) }],
    [{ ...DIV, p: [[92, 1]] }], [{ ...DIV, p: [[3, 4]] }], [{ ...DIV, p: [[1234567, 4]] }], [{ ...DIV, p: [[92.5, 4]] }],
    [{ ...MUL, p: [[24, 1]] }], [{ ...MUL, p: [[24, 130]] }], [{ ...MUL, p: [[24]] }],
    [{ ...DIV, l: 'custom' }], [{ ...DIV, l: 'custom', c: '01' }],
    [{ k: 'divide', p: [], l: 'guided', d: 1 }], [{ k: 'divide', p: [], l: 'guided', d: 1, g: { ...plan, count: 0 } }],
    [{ k: 'multiply', p: [], l: 'guided', d: 1, g: { count: 12, tops: [10, 99], bottoms: [1, 99] } }],
  ];
  for (const b of bad) assert.equal(clean(b), null, JSON.stringify(b).slice(0, 80));
  // Nothing else rides along: no title, no other keys.
  assert.deepEqual(clean([{ ...DIV, n: 'Ms Smith’s class', note: 'hi' }]), [DIV]);
});

test('box-by-box: a teacher saves an activity, its link opens it, the Assign page and the lesson name it', async () => {
  reset();
  const g = publish(official, '<!doctype html><title>t</title><p>bb</p>', { source: 'seed', slug: 'box-by-box', title: 'Box by Box' });
  const r = await call(`/api/games/${g.id}/sets`, { method: 'POST', body: { items: [DIV] }, user: teacher });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.id, gameSets.SET_ID);
  assert.equal((await call(`/api/games/${g.id}/sets`, { method: 'POST', body: { items: [{ ...DIV, p: [[3, 4]] }] }, user: teacher })).status, 400);
  assert.equal((await call(`/api/games/${g.id}/sets`, { method: 'POST', body: { items: [{ a: 'solve', p: '2x=4' }] }, user: teacher })).status, 400, "another game's shape");
  const page = await call(`/play/box-by-box?chapter=${r.json.id}&lock=1`, { user: kid });
  const fr = await call(/data-src="(\/frame\/[^"]+?)"/.exec(page.text)[1].replace(/&amp;/g, '&'), { user: kid });
  const init = JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(fr.text)[1]);
  assert.deepEqual(init.set, { id: r.json.id, items: [DIV], mine: false });
  assert.deepEqual(gameSets.describe(g.id, parseParams(`chapter=${r.json.id}&lock=1`), 'box-by-box'), { kind: 'one', label: 'Long division, 3 problems, Guided' });
  const per = gameSets.save(g.id, teacher.id, [{ k: 'multiply', p: [[24, 13], [57, 16]], l: 'onMyOwn', d: 1, g: { count: 12, tops: [10, 99], bottoms: [10, 99] } }], null, 'box-by-box');
  assert.equal(gameSets.describe(g.id, { chapter: per.id }, 'box-by-box').label, 'Multiplication, 2 problems (different for each student), On my own');
  assert.equal(gameSets.describe(g.id, { mode: 'solve', chapter: '2xp3q7' }, 'box-by-box'), null, 'only its own sets');
  const pg = await call(`/teach/assign?game=box-by-box&opts=${encodeURIComponent(`chapter=${r.json.id}&lock=1`)}`, { user: teacher });
  assert.match(pg.text, /Students open: Long division, 3 problems, Guided/);
  assert.match((await call('/teach/assign?game=box-by-box', { user: teacher })).text, /in the game first/);
});
