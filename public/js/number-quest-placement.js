// Tally's Sorting Game — the child's page script. Talks only to the placement JSON APIs: it never sees
// an answer key, a rung, a score or a timer (there is nothing here to show one with). Low-rung and
// Every question has a Listen button, and the platform read-aloud (public/js/tts.js) speaks the
// question only when it is tapped: nothing reads on its own, on load or after an answer. Tally reacts to each answer — a cheer when it lands, a kind word and
// the trying praised when it does not — and a paw trail fills as the game goes, so a child can feel
// how much longer there is. Hands-on items render as things to touch: count-out objects that mark
// themselves counted when tapped, and builds shown as a filled ten-frame with loose counters.
import { readAloud, stopReading } from '/js/tts.js';

const $ = id => document.getElementById(id);
const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const PRAISE = ['Yes! Tally does a little spin.', 'That is the way! Tally is purring.', 'You saw it! Tally taps her paw twice.', 'Right! Tally nods like she knew all along.', 'Got it! Tally is writing that one down.', 'Exactly! Tally\u2019s tail does a happy flick.', 'Brilliant! Tally does a happy little hop.', 'You worked that one out. Tally is impressed.', 'Spot on! Tally writes it down with a gold star.', 'That is right! Tally is grinning.', 'Lovely work. Tally does a proud little strut.', 'You knew that one! Tally claps her paws.', 'Right again! Tally is keeping count of the good ones.', 'Super thinking. Tally tips her hat to you.'];
const GENTLE = ['Not that one, and that is fine: it tells Tally where to look.', 'Good try. Tally makes a note and finds another.', 'Hmm, not quite. Trying is the whole game.', 'That one was a Jumble special. On we go!', 'Not this time. Tally believes in the next one.', 'A miss is a clue, never a mark against you. Next!', 'Nearly there. Tally has made a note of that one.', 'Good thinking, just not the one. On we go!', 'That was a tricky one. Tally is glad you tried.', 'Not quite, and no harm done. Next puzzle!'];
const EFFORT = ['You are showing me how you think. Keep going!', 'Every try teaches Tally something. Next one!', 'Counters count on: one more!', 'Good sticking with it. Here is another!', 'Tally is watching the trying, not the score.', 'Tally loves seeing how you work it out.', 'One more puzzle for the tour. Here it comes!', 'You are doing the real work: trying. Next!'];
// Lines are dealt from a shuffled bag, never in a fixed cycle: a line cannot come round again
// until every other line has had a turn (and not twice in a row across a reshuffle), so one
// sitting does not hear the same cheer twice (repair round 3: the old modulo cycle repeated
// its six praise lines two or three times in a single run).
function lineBag(lines) {
  let deck = [], last = null;
  return () => {
    if (!deck.length) {
      deck = [...lines];
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      if (deck.length > 1 && deck[deck.length - 1] === last) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
    }
    last = deck.pop();
    return last;
  };
}
const nextPraise = lineBag(PRAISE), nextGentle = lineBag(GENTLE), nextEffort = lineBag(EFFORT);
const tallySays = line => { $('nq-tally-line').textContent = line; };
const tallyImg = document.querySelector('.nq-tally-img');
function tallyBounce() {
  if (!tallyImg || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  tallyImg.classList.remove('nq-tally-bounce'); void tallyImg.offsetWidth; tallyImg.classList.add('nq-tally-bounce');
}

let grade = null, runId = null, current = null;

document.querySelectorAll('.nq-grade').forEach(b => b.addEventListener('click', () => {
  grade = b.dataset.grade;
  document.querySelectorAll('.nq-grade').forEach(x => x.classList.toggle('nq-grade-on', x === b));
  $('nq-door-row').hidden = false;
}));

function show(id) { for (const s of ['nq-doors', 'nq-game', 'nq-result']) $(s).hidden = s !== id; }

/** The AI voice reads the item (routes/tts.js, ctx 'placement'): the page sends only the run id — the
 *  server regenerates the item it dealt this run and reads that, in Tally's voice. The text rides along
 *  solely as readAloud's device-voice fallback (used when AI voices are off for English, or the audio
 *  does not come); public/js/tts.js strips emoji from it there, as the server does for the AI read.
 *  `n` numbers the item within this page's run. The server ignores it, but tts.js caches audio (and
 *  joins in-flight requests) by the request body: with the body only { ctx, runId }, every question in
 *  a run shared one cache key, so after question 1 the voice replayed question 1's audio forever
 *  (iPhone report, 2026-11-07). Each item now has its own key. */
const ttsLangs = () => (document.querySelector('.nq')?.dataset.ttsLangs || '').split(',').filter(Boolean);
let itemNo = 0;
function speak(item) {
  try {
    const langs = ttsLangs();
    readAloud({ text: item.spokenPrompt || item.prompt, lang: 'en',
      ai: runId && langs.length ? { body: { ctx: 'placement', runId, n: itemNo }, langs } : null });
  } catch { /* the words are on screen too */ }
}
const hush = () => { try { stopReading(); } catch { /* nothing playing */ } };

/** The hands-on part of an item: count-out objects to tap as you count (each tap marks one counted —
 *  no running total is ever shown, counting is the child's job), or a build's ten-frame and counters. */
function renderManip(item) {
  const box = $('nq-manip'); box.innerHTML = ''; box.hidden = true;
  const m = item.manip; if (!m) return;
  if (m.kind === 'count-out') {
    box.hidden = false;
    const hint = document.createElement('p'); hint.className = 'small muted'; hint.textContent = 'Tap each one as you count it, so none gets counted twice.';
    const counter = () => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'nq-counter'; b.textContent = m.glyph;
      b.setAttribute('aria-label', 'counter');
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { const on = b.classList.toggle('is-counted'); b.setAttribute('aria-pressed', String(on)); });
      return b;
    };
    // An item whose words promise an arrangement ("4 rows of 6 squares") carries that structure in
    // its manip (rows x perRow), and the picture must show exactly it — never a flat wrap that
    // contradicts the words. Anything unstructured keeps the plain flowing grid.
    if (m.rows && m.perRow && m.rows * m.perRow === m.count) {
      const rowsBox = document.createElement('div'); rowsBox.className = 'nq-counter-rows';
      for (let r = 0; r < m.rows; r++) {
        const row = document.createElement('div'); row.className = 'nq-counter-row';
        for (let i = 0; i < m.perRow; i++) row.appendChild(counter());
        rowsBox.appendChild(row);
      }
      box.append(hint, rowsBox);
    } else {
      const grid = document.createElement('div'); grid.className = 'nq-counters';
      for (let i = 0; i < m.count; i++) grid.appendChild(counter());
      box.append(hint, grid);
    }
  } else if (m.kind === 'build') {
    box.hidden = false;
    const frame = document.createElement('div'); frame.className = 'nq-tenframe'; frame.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < m.tens * 10; i++) { const c = document.createElement('span'); c.className = 'nq-cell is-full'; c.textContent = '🟠'; frame.appendChild(c); }
    const loose = document.createElement('div'); loose.className = 'nq-loose'; loose.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < m.extra; i++) { const c = document.createElement('span'); c.className = 'nq-cell is-full'; c.textContent = '🟠'; loose.appendChild(c); }
    const hint = document.createElement('p'); hint.className = 'small muted'; hint.textContent = 'A full ten-frame is ten. Count the loose ones on.';
    box.append(frame, loose, hint);
  }
}

function renderItem(cur, reaction) {
  // A new question silences the old one at once: audio still playing (or still on its way) belongs to
  // the question that just left the screen.
  hush();
  current = cur;
  if (!cur) return;
  itemNo += 1;
  tallySays(reaction || nextEffort());
  $('nq-feedback').textContent = '';
  $('nq-prompt').textContent = cur.item.prompt;
  $('nq-strand').textContent = cur.strandLabel ? `Now showing Tally: ${cur.strandLabel}` : '';
  if (cur.progress && cur.progress.total) $('nq-trail-fill').style.width = `${Math.round(100 * Math.min(cur.progress.served, cur.progress.total) / cur.progress.total)}%`;
  // Listen on every question (not only the audio-first ones): any child may want a question read.
  $('nq-listen').hidden = false;
  renderManip(cur.item);
  const choices = $('nq-choices'); choices.innerHTML = '';
  $('nq-answer-row').hidden = !!cur.item.choices;
  if (cur.item.choices) {
    cur.item.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn nq-choice'; b.textContent = String(c.value);
      b.addEventListener('click', () => answer({ choice: i }));
      choices.appendChild(b);
    });
  } else { $('nq-answer').value = ''; $('nq-answer').focus(); }
  // No auto-read: the question is spoken only when the child taps Listen.
}
$('nq-listen').addEventListener('click', () => current && speak(current.item));
$('nq-answer-go').addEventListener('click', () => answer({ value: $('nq-answer').value }));
$('nq-answer').addEventListener('keydown', e => { if (e.key === 'Enter') answer({ value: $('nq-answer').value }); });

async function answer(a) {
  if (!runId) return;
  const { data } = await post('/api/number-quest/placement/answer', { runId, answer: a });
  if (data.result) return showResult(data.result);
  if (data.next) {
    // Tally reacts to THIS answer as the next item arrives: a cheer or a kind word, never a score.
    const line = data.correct ? nextPraise() : nextGentle();
    if (data.correct) tallyBounce();
    renderItem(data.next, line);
  }
}
async function startGame() {
  const { status, data } = await post('/api/number-quest/placement/start', { grade });
  if (status === 409) { showResult({ workshop: 'your workshop', disabled: true }); return; }
  runId = data.runId; show('nq-game'); renderItem(data.current);
}
function showResult(result) {
  hush();
  show('nq-result');
  runId = result.runId || runId;
  if (result.disabled) { $('nq-result-h').textContent = 'No game today'; $('nq-result-workshop').textContent = 'Your teacher or parent has set your start point.'; return; }
  $('nq-result-h').textContent = 'I found your starting workshop!';
  $('nq-result-workshop').textContent = result.workshop ? `You start at: ${result.workshop}` : 'You start at the beginning of the street.';
  // Past the built street: say so plainly, right under the workshop name (never a fallback label).
  const beyondEl = $('nq-result-beyond');
  if (beyondEl) { beyondEl.hidden = !result.finaleLine; beyondEl.textContent = result.finaleLine || ''; }
  // The per-strand picture: what kinds of puzzles the tour visited, a paw for every one tried.
  // It carries no score and no rung — those live only in the grown-up note.
  const pic = $('nq-result-picture'), cards = $('nq-strand-cards');
  if (pic && cards && Array.isArray(result.picture) && result.picture.length) {
    cards.innerHTML = '';
    for (const s of result.picture) {
      const card = document.createElement('div'); card.className = 'nq-strand-card';
      const head = document.createElement('p'); head.className = 'nq-strand-card-h';
      head.textContent = `${s.icon} ${s.label}`;
      const line = document.createElement('p'); line.className = 'nq-strand-card-line'; line.textContent = s.line;
      const paws = document.createElement('p'); paws.className = 'nq-strand-card-paws'; paws.setAttribute('aria-hidden', 'true');
      paws.textContent = '🐾'.repeat(Math.max(0, s.tried || 0));
      const tried = document.createElement('span'); tried.className = 'sr-only';
      tried.textContent = `You tried ${s.tried} of these puzzles.`;
      card.append(head, line, paws, tried); cards.appendChild(card);
    }
    pic.hidden = false;
  }
  const pending = !!result.pendingRetake;
  $('nq-retake-keep').hidden = !pending; $('nq-retake-use').hidden = !pending;
  if (pending) pendingRun = runId;
}
let pendingRun = null;
$('nq-play').addEventListener('click', startGame);
$('nq-begin').addEventListener('click', async () => {
  const { data } = await post('/api/number-quest/placement/begin', { grade });
  showResult({ workshop: data.workshop });
});
$('nq-stop').addEventListener('click', async () => {
  if (!runId) { show('nq-doors'); return; }
  const { data } = await post('/api/number-quest/placement/finish', { runId });
  showResult(data);
});
$('nq-retake-use').addEventListener('click', async () => {
  await post('/api/number-quest/placement/confirm-retake', { runId: pendingRun });
  $('nq-retake-keep').hidden = true; $('nq-retake-use').hidden = true;
  tallyDone('Your new start point is saved.');
});
$('nq-retake-keep').addEventListener('click', () => {
  $('nq-retake-keep').hidden = true; $('nq-retake-use').hidden = true;
  tallyDone('Your old start point stays. You can always visit the earlier workshops.');
});
function tallyDone(line) { const p = document.createElement('p'); p.textContent = line; $('nq-result').appendChild(p); }

// The grown-up override controls on the Starting Point note.
const form = $('nq-override-form');
if (form) {
  const child = new URLSearchParams(location.search).get('child') || '';
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const { data } = await post('/api/number-quest/placement/override', { child, node: $('nq-override-node').value });
    $('nq-override-msg').textContent = data.placement ? `Saved: start point is now ${data.placement.startNode}.` : 'That did not save. Try again.';
  });
  $('nq-toggle-disabled').addEventListener('click', async e => {
    const off = e.target.textContent.includes('Turn the Sorting Game off');
    const { data } = await post('/api/number-quest/placement/override', { child, disabled: off });
    $('nq-override-msg').textContent = data.placement ? (off ? 'The Sorting Game is off for this learner.' : 'The Sorting Game is back on.') : 'That did not save. Try again.';
    e.target.textContent = off ? 'Turn the Sorting Game back on' : 'Turn the Sorting Game off for this learner';
  });
}
