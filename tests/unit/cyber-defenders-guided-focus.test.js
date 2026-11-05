// Cyber Defenders guided focus, pinned by the 2026-11-05 form-factor audit (Greg's live phone report:
// deck 2-1.1 "Got it, and spot the gap", step 2 — the ring framed mail slots 3 AND 4 together on his
// phone, though the same box had passed a desktop-only check the day before). The audit's findings,
// encoded here so they cannot silently regress:
//   1. The overlay mapping was never the problem: a box's % lands identically at every figure size
//      (the captures are all 1280x720 and the figure is 16:9, so object-fit:cover never crops). The
//      failures were box DATA authored from coarse templates (50 of 423 steps re-authored), plus one
//      renderer aggravator: the ring's fixed 8px outset is proportionally ~2.2x fatter on a 326px
//      phone figure than on the 720px desktop figure. app.css now scales the outset with the figure
//      (1.15cqw, ~8px at 720px, ~4px at 326px); the browser test below pins both halves.
//   2. Greg's slide and every re-authored box are pinned verbatim (AUDITED below). Element bounds
//      cited in comments were measured on the raw captures (edge detection), not eyeballed.
//   3. The structural pass criteria for ALL Cyber focus data: every pictured slide in units 1-6
//      carries focus, and every box is a non-degenerate in-frame rectangle. (Containment of the
//      cued element is a human judgment — scripts/focus-sheet.js, incl. its --form-factors mode,
//      is the tool for re-checking it; this file pins the audit's verdicts.)
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CD = path.join(ROOT, 'seed-lessons/cyber-defenders/course');
const BANDS = ['1b', '2'];
const deck = (band, n) => JSON.parse(fs.readFileSync(path.join(CD, band, `${n}.json`), 'utf8'));
const allDecks = () => BANDS.flatMap(band =>
  fs.readdirSync(path.join(CD, band)).filter(f => f.endsWith('.json')).sort()
    .map(f => ({ band, n: f.replace('.json', ''), deck: deck(band, f.replace('.json', '')) })));

test('every pictured slide in units 1-6 carries focus; every box is a non-degenerate in-frame rectangle', () => {
  let slides = 0, steps = 0;
  for (const { band, n, deck: d } of allDecks()) {
    if (n === '0.1') continue; // the intro carries no focus yet (content test documents this)
    d.slides.forEach((s, si) => {
      if (!s.img) return;
      slides++;
      assert.ok(Array.isArray(s.focus) && s.focus.length >= 1 && s.focus.length <= 4,
        `${band}/${n} s${si} "${s.title}": pictured slide carries 1-4 focus steps`);
      s.focus.forEach((f, fi) => {
        steps++;
        const [x, y, w, h] = f.box || [];
        assert.ok([x, y, w, h].every(v => Number.isFinite(v)), `${band}/${n} s${si} step ${fi + 1}: box is four numbers`);
        assert.ok(x >= 0 && y >= 0 && x + w <= 100 && y + h <= 100, `${band}/${n} s${si} step ${fi + 1}: box in frame (${f.box})`);
        assert.ok(w >= 3 && h >= 3, `${band}/${n} s${si} step ${fi + 1}: box not degenerate (${f.box})`);
        assert.ok(typeof f.cue === 'string' && f.cue.trim() === f.cue && f.cue.length >= 1 && f.cue.length <= 80,
          `${band}/${n} s${si} step ${fi + 1}: cue well-formed`);
      });
    });
  }
  assert.equal(slides, 230, 'pictured focus slides across both bands');
  assert.equal(steps, 423, 'focus steps across both bands');
});

// Greg's slide: band 2, deck 1.1, slide 1 "Got it, and spot the gap" (img protocols-2-ack).
// Measured on the raw capture: the five mail slots span x 54.1-79.5%, y 42.5-50.6%; slot 3 alone is
// x 65.2-69.5%; slot 4 starts at x 70.2%. The inbox squares row spans y 54.5-63.5%, x 54.1-82.5%.
test("Greg's slide (2/1.1 slide 1): step 2 rings slot 3 alone, steps 1 and 3 frame the slots row and the inbox", () => {
  const s = deck('2', '1.1').slides[1];
  assert.equal(s.img, 'csq/packet-post/protocols-2-ack');
  assert.deepEqual(s.focus.map(f => f.box), [
    [53.5, 41.5, 26.5, 10],
    [64.5, 41.5, 5.5, 10],
    [53.5, 50.5, 29, 13.5],
  ]);
  const [x, y, w, h] = s.focus[1].box;
  assert.ok(x <= 65.2 && x + w >= 69.5 && y <= 42.5 && y + h >= 50.6, 'step 2 box fully contains slot 3 (measured bounds)');
  assert.ok(x + w < 70.2, 'step 2 box does not reach slot 4 (measured start)');
  assert.match(s.focus[1].cue, /Slot 3 stayed empty/);
});

// Every box re-authored by the 2026-11-05 audit, pinned verbatim: [band, deck, slide, step, box].
const AUDITED = [
  ['1b', '1.1', 3, 2, [45.5, 51, 10.5, 14]],
  ['1b', '1.1', 4, 0, [21.5, 49, 10, 14]],
  ['1b', '1.2', 0, 1, [54, 37, 24, 14]],
  ['1b', '1.2', 1, 1, [60, 50, 13, 12]],
  ['1b', '1.2', 2, 0, [24.5, 34, 22.5, 10.5]],
  ['1b', '1.3', 0, 1, [9, 35, 44, 38]],
  ['1b', '1.3', 2, 0, [26.5, 35, 7, 12.5]],
  ['1b', '1.3', 4, 0, [7, 25, 47, 22]],
  ['1b', '1.3', 4, 1, [8.5, 35, 44, 12]],
  ['1b', '2.3', 1, 0, [13.5, 24.5, 34.5, 61.5]],
  ['1b', '2.3', 1, 1, [53.5, 34.5, 35.5, 24]],
  ['1b', '2.3', 2, 1, [13.5, 24.5, 34.5, 61.5]],
  ['1b', '2.3', 3, 1, [13.5, 24.5, 34.5, 61.5]],
  ['1b', '2.3', 4, 0, [53.5, 34.5, 35.5, 24]],
  ['1b', '2.3', 6, 0, [13.5, 24.5, 34.5, 61.5]],
  ['1b', '4.2', 4, 1, [54, 56, 35, 10.5]],
  ['1b', '4.3', 4, 0, [7, 26.5, 34, 7.5]],
  ['1b', '5.1', 2, 1, [7, 26.5, 40.5, 7.5]],
  ['1b', '5.1', 3, 1, [54, 56, 35, 10.5]],
  ['1b', '5.1', 4, 1, [54, 56, 35, 10.5]],
  ['1b', '5.3', 4, 0, [21.5, 49, 10, 14]],
  ['1b', '5.3', 6, 0, [21.5, 49, 10, 14]],
  ['1b', '6.2', 3, 0, [53.5, 52.5, 29, 11.5]],
  ['1b', '6.2', 3, 1, [53.5, 40.5, 27, 11.5]],
  ['1b', '6.3', 5, 1, [54, 56, 35, 10.5]],
  ['1b', '6.4', 3, 0, [13.5, 24.5, 34.5, 61.5]],
  ['1b', '6.4', 3, 1, [53.5, 34.5, 35.5, 24]],
  ['2', '1.1', 1, 0, [53.5, 41.5, 26.5, 10]],
  ['2', '1.1', 1, 1, [64.5, 41.5, 5.5, 10]],
  ['2', '1.1', 1, 2, [53.5, 50.5, 29, 13.5]],
  ['2', '1.2', 0, 0, [9, 51, 59, 38]],
  ['2', '1.2', 1, 0, [24.5, 34, 22.5, 10.5]],
  ['2', '1.3', 0, 0, [51, 42, 38, 21]],
  ['2', '1.3', 1, 1, [24.5, 34, 22.5, 10.5]],
  ['2', '1.3', 2, 0, [51.5, 50.5, 20.5, 10]],
  ['2', '1.3', 2, 1, [9.5, 58, 40, 13]],
  ['2', '2.3', 1, 1, [13.5, 24.5, 34.5, 61.5]],
  ['2', '2.3', 6, 0, [13.5, 24.5, 34.5, 61.5]],
  ['2', '4.1', 0, 0, [7, 26.5, 40, 7.5]],
  ['2', '4.1', 4, 0, [28, 26.5, 18.5, 7.5]],
  ['2', '4.1', 6, 0, [7, 26.5, 40, 7.5]],
  ['2', '4.2', 2, 0, [7, 26.5, 40, 7.5]],
  ['2', '4.2', 4, 0, [50.5, 34.5, 21.5, 17]],
  ['2', '6.2', 2, 1, [50.5, 34.5, 21.5, 17]],
  ['2', '6.3', 1, 1, [28, 26.5, 18.5, 7.5]],
  ['2', '6.3', 2, 0, [7, 26.5, 40, 7.5]],
  ['2', '6.3', 3, 1, [54, 56, 35, 10.5]],
  ['2', '6.4', 3, 0, [13.5, 24.5, 34.5, 61.5]],
  ['2', '6.4', 3, 1, [53.5, 34.5, 35.5, 24]],
  ['2', '6.4', 4, 1, [26, 65, 22, 22]],
];
test('the 50 boxes re-authored by the 2026-11-05 audit stay as audited', () => {
  assert.equal(AUDITED.length, 50);
  for (const [band, n, si, fi, box] of AUDITED) {
    assert.deepEqual(deck(band, n).slides[si].focus[fi].box, box, `${band}/${n} s${si} step ${fi + 1}`);
  }
});

// The renderer half of the fix, checked on the real step page in a real browser: the box % must land
// identically at phone/tablet/desktop figure sizes, and the ring outset must shrink with the figure.
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const C = await import('../../server/services/courses.js');
const { chromium } = await import('@playwright/test');
seed({ quiet: true });
const course = C.getCourse('cyber-defenders');
const kid = auth.createUser({ username: `cybgf${Date.now() % 1e6}`, password: 'correct-horse-12', displayName: 'Kid', role: 'admin' });
C.setBand(kid, course, '2');
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

test("Greg's slide renders the same box % at 390/834/1280, contains slot 3, and the ring outset scales with the figure", async () => {
  let cookie = '';
  auth.startSession({ append: (k, v) => { cookie = v.split(';')[0]; } }, kid.id);
  const [cname, cval] = cookie.split(/=(.*)/).filter(Boolean);
  const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
  try {
    const seen = {};
    for (const w of [390, 834, 1280]) {
      const page = await browser.newPage({ viewport: { width: w, height: 950 } });
      await page.context().addCookies([{ name: cname, value: cval, url: base }]);
      await page.goto(`${base}/courses/cyber-defenders/2-1.1`, { waitUntil: 'networkidle' });
      await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
      await page.evaluate(() => { const dots = document.querySelectorAll('#deck-nav .dot'); if (dots[1]) dots[1].click(); });
      await page.waitForTimeout(150);
      seen[w] = await page.evaluate(() => {
        const fig = document.querySelector('.slide:not([hidden]) .smedia.gf');
        fig.setAttribute('data-gf-step', '1');
        const fr = fig.getBoundingClientRect();
        const box = fig.querySelectorAll('.gf-step')[1].querySelector('.gf-box');
        const br = box.getBoundingClientRect();
        const outset = Math.abs(parseFloat(getComputedStyle(box, '::after').inset.split(' ')[0])); // inset is negative (the ring sits OUTSIDE the box)
        return {
          figW: fr.width,
          boxPct: [(br.left - fr.left) / fr.width * 100, (br.top - fr.top) / fr.height * 100, br.width / fr.width * 100, br.height / fr.height * 100],
          outset,
        };
      });
      await page.close();
    }
    for (const w of [390, 834, 1280]) {
      const want = [64.5, 41.5, 5.5, 10];
      seen[w].boxPct.forEach((v, i) => assert.ok(Math.abs(v - want[i]) <= 0.6, `width ${w}: box % [${seen[w].boxPct.map(v => v.toFixed(2))}] ≈ authored ${want}`));
      // The ring (box expanded by the outset on every side) must still contain slot 3's measured
      // bounds and keep slot 4's centre (72.35%, 46.55%) outside, at every size.
      const [bx, by, bw, bh] = seen[w].boxPct;
      const ox = seen[w].outset / seen[w].figW * 100, oy = seen[w].outset / (seen[w].figW * 9 / 16) * 100;
      assert.ok(bx - ox <= 65.2 && bx + bw + ox >= 69.5 && by - oy <= 42.5 && by + bh + oy >= 50.6, `width ${w}: ring contains slot 3`);
      assert.ok(!(72.35 > bx - ox && 72.35 < bx + bw + ox && 46.55 > by - oy && 46.55 < by + bh + oy), `width ${w}: ring excludes slot 4's centre`);
    }
    assert.ok(seen[390].outset <= 5, `phone ring outset ${seen[390].outset}px ≤ 5px (figure-scaled, was a fixed 8px)`);
    assert.ok(seen[1280].outset >= 7, `desktop ring outset ${seen[1280].outset}px ≥ 7px (unchanged at full figure width)`);
    assert.ok(seen[834].outset === seen[1280].outset, 'tablet figure is the same 720px as desktop, so the outset matches');
  } finally {
    await browser.close();
  }
});
