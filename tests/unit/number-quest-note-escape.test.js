// The Starting Point note escapes text exactly once: an apostrophe shows as ' on the page, never as a literal &#39;.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startingPointPage, sortingGamePage } from '../../server/views/number-quest-placement.js';

const node = 'explorer-7.4';
const placement = { startNode: node, source: 'sorting-game', softLandNode: node };

test('the Starting Point note escapes each value once', () => {
  const note = {
    lines: ["Lands at the Explorer street's finale door", 'Fractions <b>4.5</b> & more'],
    placedUnit: "Explorer street's workshops",
    launchpadLine: "Launchpad's line",
    proLine: "Pro's line",
    partial: "Didn't finish",
  };
  const html = String(startingPointPage({ child: { display_name: "O'Brien <kid>" }, placement, note, canManage: false }));
  assert.ok(!html.includes('&amp;#39;') && !html.includes('&amp;lt;') && !html.includes('&amp;amp;'), 'nothing is escaped twice');
  for (const s of ['Explorer street&#39;s finale door', 'Explorer street&#39;s workshops', 'Launchpad&#39;s line', 'Pro&#39;s line', 'Didn&#39;t finish', 'doesn&#39;t certify', 'O&#39;Brien &lt;kid&gt;', 'Fractions &lt;b&gt;4.5&lt;/b&gt; &amp; more']) {
    assert.ok(html.includes(s), `escaped once: ${s}`);
  }
  assert.ok(!html.includes('<b>4.5</b>'), 'text is never raw markup');
});

test('the note without a saved note and the Sorting Game page escape once too', () => {
  const html = String(startingPointPage({ child: null, placement, note: null, canManage: true }));
  assert.ok(!html.includes('&amp;#39;') && !html.includes('&amp;amp;') && !html.includes('&amp;quot;'));
  const game = String(sortingGamePage({ placement: { startNode: node }, ttsLangs: ['en', 'es'] }));
  assert.ok(!game.includes('&amp;#39;') && !game.includes('&amp;amp;') && !game.includes('&amp;quot;'));
});
