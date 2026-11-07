// CS Quest pictures: every Robo Route path is a real route on its pictured board (scripts/csq-route-check.js), every
// program a slide talks about does what the slide says, and every screenshot slide carries a view crop that keeps
// its focus boxes inside it and is wide enough to read on a phone.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkRoutes, loadDecks } from '../../scripts/csq-route-check.js';

// CS Quest's phone-width and compact captures (scripts/csq-shots-spec.json): a narrow shot is the game laid out at
// phone width, so the whole picture is the legible view (as is a title screen, which meets the world's character); a compact shot draws the game's text 1.6x larger, so its
// crop may be wider (up to 62%) and still read like a 50% crop of a wide capture.
const CSQ = JSON.parse(fs.readFileSync(new URL('../../scripts/csq-shots-spec.json', import.meta.url), 'utf8'));
const CYBER = JSON.parse(fs.readFileSync(new URL('../../scripts/cyber-shots-spec.json', import.meta.url), 'utf8'));
const NARROW = new Set([...CSQ, ...CYBER].filter(s => s.narrow || s.title).map(s => `csq/${s.game}/${s.state}`));
const COMPACT = new Set(CSQ.filter(s => s.compact).map(s => `csq/${s.game}/${s.state}`));

test('cs-quest: Robo Route paths follow the board square by square, and pictured programs match their slides', () => {
  const { errors, report } = checkRoutes();
  assert.ok(report.length > 40, `replayed ${report.length} pictured programs`);
  assert.deepEqual(errors, []);
});

test('cs-quest: every screenshot slide has a legible view crop that holds its focus boxes', () => {
  const all = loadDecks(), byId = new Map(all.map(e => [e.id, e.slide]));
  const near = (id, d) => byId.get(id.replace(/s(\d+)$/, (m, n) => `s${+n + d}`));
  for (const { id, slide: s } of all) {
    if (!s.img) continue;
    if ((NARROW.has(s.img) || s.img.startsWith('csq/chars/')) && !s.view) continue;   // a guide's portrait: the whole picture
    // One wide picture split across two slides in a row (two side-by-side panels): each slide shows one whole
    // panel, so its crop may be narrower (down to 22%: about 1.3x on a phone, 1.6x on a laptop).
    const split = [near(id, -1), near(id, 1)].some(o => o && o.img === s.img && o.view && s.view && String(o.view) !== String(s.view));
    const v = s.view;
    assert.ok(Array.isArray(v) && v.length === 4, `${id}: a screenshot slide needs a view`);
    const [x, y, w, h] = v;
    assert.ok(x >= 0 && y >= 0 && x + w <= 100.01 && y + h <= 100.01, `${id}: view ${v} is inside the picture`);
    const max = COMPACT.has(s.img) ? 62 : 55;
    assert.ok(w >= (split ? 22 : 30) && w <= max, `${id}: view width ${w}% is between ${split ? 22 : 30}% and ${max}% of the picture`);
    const aspect = (w * 1280) / (h * 720);
    assert.ok(aspect >= 0.8 && aspect <= 3.3, `${id}: view aspect ${aspect.toFixed(2)}`);
    for (const f of s.focus || []) {
      const [bx, by, bw, bh] = f.box;
      assert.ok(bx >= x - 0.3 && by >= y - 0.3 && bx + bw <= x + w + 0.3 && by + bh <= y + h + 0.3, `${id}: box ${f.box} (${f.cue}) is inside the view ${v}`);
      for (const [px, py] of f.path || []) assert.ok(px >= x && py >= y && px <= x + w && py <= y + h, `${id}: path point ${px},${py} is inside the view`);
    }
  }
});
