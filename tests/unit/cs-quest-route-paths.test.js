// CS Quest pictures: every Robo Route path is a real route on its pictured board (scripts/csq-route-check.js), every
// program a slide talks about does what the slide says, and every screenshot slide carries a view crop that keeps
// its focus boxes inside it and is wide enough to read on a phone.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRoutes, loadDecks } from '../../scripts/csq-route-check.js';

test('cs-quest: Robo Route paths follow the board square by square, and pictured programs match their slides', () => {
  const { errors, report } = checkRoutes();
  assert.ok(report.length > 40, `replayed ${report.length} pictured programs`);
  assert.deepEqual(errors, []);
});

test('cs-quest: every screenshot slide has a legible view crop that holds its focus boxes', () => {
  for (const { id, slide: s } of loadDecks()) {
    if (!s.img) continue;
    const v = s.view;
    assert.ok(Array.isArray(v) && v.length === 4, `${id}: a screenshot slide needs a view`);
    const [x, y, w, h] = v;
    assert.ok(x >= 0 && y >= 0 && x + w <= 100.01 && y + h <= 100.01, `${id}: view ${v} is inside the picture`);
    assert.ok(w >= 30 && w <= 55, `${id}: view width ${w}% is between 30% and 55% of the picture`);
    const aspect = (w * 1280) / (h * 720);
    assert.ok(aspect >= 0.8 && aspect <= 3.3, `${id}: view aspect ${aspect.toFixed(2)}`);
    for (const f of s.focus || []) {
      const [bx, by, bw, bh] = f.box;
      assert.ok(bx >= x - 0.3 && by >= y - 0.3 && bx + bw <= x + w + 0.3 && by + bh <= y + h + 0.3, `${id}: box ${f.box} (${f.cue}) is inside the view ${v}`);
      for (const [px, py] of f.path || []) assert.ok(px >= x && py >= y && px <= x + w && py <= y + h, `${id}: path point ${px},${py} is inside the view`);
    }
  }
});
