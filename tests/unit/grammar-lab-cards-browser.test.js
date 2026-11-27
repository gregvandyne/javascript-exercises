// Grammar Lab: every topic's teaching card on a phone (320 x 568 and 390 x 844), every band. A card's worked examples
// mark words (colored highlights, small labels like "comma" under a mark, capital and comma markers): none of those, nor
// any word, may overlap another, stick out sideways or be cut off (tests/unit/_grammar-lab-play.js cardOverlaps). One
// browser and one page for all of them; dark mode on a sample (the same layout, other colors). A fix example (a sentence
// as written, then fixed) is a before and an after: every label on the after, none on the before, the after's marked
// words on lines below the before, and a fixed title on one line where it fits (else no marked word alone on a line).
// Screenshots with GL_SHOTS=<dir>. GL_CARDS=<topic,...> checks only those. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './_grammar-lab-play.js';
const GL = H.GL;

const env = {};
test.before(() => H.startAll(env));
test.after(() => H.stopAll(env));
const only = (process.env.GL_CARDS || '').split(',').filter(Boolean);

/** Every topic once in each band it is taught in (a band changes the card's type size): [band, unit, topic]. */
const CARDS = (() => {
  const seen = new Set(), out = [];
  for (const b of GL.bands()) for (const p of GL.pathwaysOf(b.id)) for (const id of p.topics) {
    if (seen.has(`${b.id}/${id}`) || (only.length && !only.includes(id))) continue;
    seen.add(`${b.id}/${id}`); out.push([b.id, p.id, id]);
  }
  return out;
})();
const SIZES = [{ width: 320, height: 568 }, { width: 390, height: 844 }];

/** The card's fix examples, in the page: -> { pairs, titles, problems }. Each fix (.gl-ex-fix) has a before and an after;
 *  the before has no mark, every label is on the after, and the after's marks sit below every line of the before. A
 *  fixed title (italic) is on one line when it fits the line's width, and when it wraps, no line holds one marked word
 *  alone (when it has words enough to give every line two). */
function fixProblems(page) {
  return page.evaluate(() => {
    const out = [], say = e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 40);
    const fixes = [...document.querySelectorAll('.gl-card-body .gl-ex-fix')];
    let titles = 0;
    for (const ex of fixes) {
      const before = ex.querySelector('.gl-ba-before'), after = ex.querySelector('.gl-ba-after');
      if (!before || !after) { out.push(`a fix without its before and after: "${say(ex)}"`); continue; }
      if (!/\S/.test(before.querySelector('.sr-only')?.textContent || '') || !/\S/.test(after.querySelector('.sr-only')?.textContent || '')) out.push(`a fix with no Before/After words for a screen reader: "${say(ex)}"`);
      if (before.querySelector('.gl-mk')) out.push(`the before has a mark: "${say(before)}"`);
      for (const l of ex.querySelectorAll('.gl-mk-tag')) if (!after.contains(l)) out.push(`label "${l.textContent}" is not on the after: "${say(ex)}"`);
      const low = Math.max(...[...before.getClientRects()].map(r => r.bottom));
      for (const m of after.querySelectorAll('.gl-mk')) if (m.getBoundingClientRect().top < low - 1) out.push(`the after's "${m.firstChild.textContent}" is not below the before: "${say(ex)}"`);
      const title = after.querySelector('.gl-title');
      if (!title) continue;
      titles++;
      // its lines, by the words on them (a word's own box: its mark, or the word)
      const toks = [...title.querySelectorAll('.gl-tok')].map(e => ({ e, r: (e.querySelector('.gl-mk-w') || e).getBoundingClientRect() }));
      const lines = [];
      for (const x of toks) { const l = lines.find(y => Math.abs(y.top - x.r.top) < 4); if (l) l.toks.push(x); else lines.push({ top: x.r.top, toks: [x] }); }
      if (lines.length < 2) continue;
      // the width it needs on one line (with its check) against the width it has
      const was = after.style.whiteSpace; after.style.whiteSpace = 'nowrap';
      const rg = document.createRange(); rg.selectNodeContents(after);
      const need = rg.getBoundingClientRect().width;
      after.style.whiteSpace = was;
      if (need <= after.clientWidth) out.push(`the title "${say(title)}" wraps though it fits (${Math.round(need)} of ${after.clientWidth})`);
      // (a line of one word is fine only when the words are too few to give every line two)
      if (toks.length >= 2 * lines.length) for (const l of lines) if (l.toks.length === 1 && l.toks[0].e.querySelector('.gl-mk-tag')) out.push(`the title "${say(title)}" leaves "${say(l.toks[0].e)}" and its label alone on a line`);
    }
    return { pairs: fixes.length, titles, problems: out };
  });
}

test(`every teaching card (${CARDS.length}) on a phone: no marked word or label overlaps, nothing sideways or cut off; fixes shown before and after`, { timeout: 270_000 }, async t => {
  if (env.skip) return t.skip(env.skip);
  assert.ok(only.length || CARDS.length > 150, `every topic: ${CARDS.length}`);
  const ctx = await env.browser.newContext({ viewport: SIZES[0], colorScheme: 'light', reducedMotion: 'reduce' });
  const kid = H.newKid('glcard');
  await ctx.addCookies([H.sessionCookie(kid.id, env.base)]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const bad = [], seen = { pairs: 0, titles: 0, cards: new Set() };
  try {
    for (const size of SIZES) {
      await page.setViewportSize(size);
      for (const [i, [band, unit, topic]] of CARDS.entries()) {
        // dark on a sample: every seventh card
        const themes = i % 7 === 0 ? ['light', 'dark'] : ['light'];
        await page.goto(`${env.base}/courses/grammar-lab/${band}/${unit}/${topic}/card`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => document.fonts.ready);
        for (const th of themes) {
          await page.emulateMedia({ colorScheme: th });
          const pr = await H.cardOverlaps(page);
          const fx = await fixProblems(page);
          pr.push(...fx.problems);
          if (th === 'light') { seen.pairs += fx.pairs; seen.titles += fx.titles; if (fx.pairs) seen.cards.add(topic); }
          if (pr.length) bad.push([`${band}/${topic} ${size.width} ${th}`, pr]);
          if (H.SHOTS && (pr.length || only.length)) await page.screenshot({ path: `${H.SHOTS}/card-${band}-${topic}-${size.width}-${th}.png`, fullPage: true });
        }
        await page.emulateMedia({ colorScheme: 'light' });
      }
    }
  } finally { await ctx.close(); }
  const cards = new Set(bad.map(([s]) => s.split(' ')[0]));
  t.diagnostic(`${cards.size} cards with problems`);
  t.diagnostic(`${seen.pairs} fix examples (${seen.titles} titles) on ${seen.cards.size} cards`);
  assert.deepEqual(errors, [], 'no page errors');
  // the checks above found the fixes: the K-2 titles card's three, and fixes in every band
  if (!only.length) assert.ok(seen.cards.has('capitalizing-titles') && seen.titles >= 3 * 2 * 2 && seen.cards.size > 20, `fix examples found: ${[...seen.cards].join(', ')}`);
  assert.equal(bad.length, 0, `${cards.size} cards with problems:\n${bad.map(([s, pr]) => `${s}:\n    ${pr.slice(0, 6).join('\n    ')}${pr.length > 6 ? `\n    (and ${pr.length - 6} more)` : ''}`).join('\n')}`);
});
