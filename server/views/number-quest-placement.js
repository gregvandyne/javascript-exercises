// Pages for Tally's Sorting Game (services/number-quest-placement.js): the child's game page and the
// grown-up Starting Point note. Course copy is English data (the course ships English-first, like its
// decks), rendered lang="en". The child's page shows no score, percentage, timer or rung anywhere — Tally
// names a starting workshop, and that is all. The note page is where the rungs live, in plain words,
// with the caveat the service puts in the data.
import { html, raw, esc } from './html.js';
import { VERSION } from './layout.js';
import * as P from '../services/number-quest-placement.js';

// The shared per-boot cache buster, like every other stylesheet: a fixed "?v=1" would keep the old
// sheet in returning browsers after a deploy (the strand-card contrast fix must actually arrive).
export const CSS = raw(`<link rel="stylesheet" href="/css/number-quest.css?v=${VERSION}">`);

const GRADES = [['K', 'Kindergarten'], ['1', 'Grade 1'], ['2', 'Grade 2'], ['3', 'Grade 3'], ['4', 'Grade 4'], ['5', 'Grade 5'], ['6', 'Grade 6'], ['7', 'Grade 7'], ['8', 'Grade 8']];

/** The game page: three stages (doors → questions → result) swapped by public/js/number-quest-placement.js.
 *  Everything the script needs arrives through the JSON APIs; the page itself holds no item and no answer.
 *  `ttsLangs` is the site's AI-voice locales switched on now (services/tts.js onLocales): the script asks
 *  /api/tts for the current item by run id only when English is among them (routes/tts.js, ctx 'placement'). */
export function sortingGamePage({ placement, ttsLangs = [] } = {}) {
  return html`<div class="nq" lang="en" data-tts-langs="${esc(ttsLangs.join(','))}">
  <section class="nq-stage" id="nq-doors">
    <p class="nq-kicker">🔢 Number Quest</p>
    <h1>Tally's Sorting Game</h1>
    <p class="lead">Tally the cat runs the Numberworks. She wants to find your first workshop. Show her what you can do!</p>
    ${placement && placement.disabled ? html`<div class="panel"><p>Your teacher or parent has placed you at <b>${esc(P.nodeInfo(placement.startNode).workshop)}</b>, so there is no game to play today.</p><p><a class="btn btn-primary" href="/courses/number-quest">Go to Number Quest</a></p></div>` : html`
    <h2>What grade are you in?</h2>
    <div class="nq-grades" role="group" aria-label="Your grade">
      ${GRADES.map(([g, label]) => html`<button type="button" class="nq-grade" data-grade="${g}">${label}</button>`)}
      <button type="button" class="nq-grade nq-grade-wide" data-grade="">I'm a grown-up / not sure</button>
    </div>
    <div class="nq-doors" hidden id="nq-door-row">
      <button type="button" class="btn btn-primary btn-big" id="nq-play">▶ Play the Sorting Game</button>
      <button type="button" class="btn btn-big" id="nq-begin">Just Play</button>
    </div>
    <p class="small muted">Skipping the game is always fine. You can play it later from the course map, whenever you like.</p>
    ${placement && placement.startNode ? html`<p class="small">You already have a starting workshop: <b>${esc(P.nodeInfo(placement.startNode).workshop)}</b>. Playing again is a retake: your old start point stays until you say to use the new one.</p>` : ''}`}
  </section>

  <section class="nq-stage" id="nq-game" hidden>
    <div class="nq-tally panel">
      <img class="nq-tally-img" src="/img/csq/chars/tally.webp" alt="Tally the cat" width="219" height="353">
      <p class="nq-tally-says"><b>Tally says:</b> <span id="nq-tally-line">Show me what you can do!</span></p>
      <button type="button" class="btn" id="nq-listen" hidden>🔊 Listen</button>
    </div>
    <div class="nq-trail" aria-hidden="true"><span class="nq-trail-fill" id="nq-trail-fill"></span><span class="nq-trail-paw">🐾</span></div>
    <p class="nq-strand small muted" id="nq-strand"></p>
    <div class="panel nq-item">
      <p class="nq-prompt" id="nq-prompt"></p>
      <div class="nq-manip" id="nq-manip" hidden></div>
      <div class="nq-choices" id="nq-choices"></div>
      <div class="nq-answer-row" id="nq-answer-row" hidden>
        <label class="sr-only" for="nq-answer">Your answer</label>
        <input id="nq-answer" class="nq-answer" inputmode="decimal" autocomplete="off">
        <button type="button" class="btn btn-primary" id="nq-answer-go">That's my answer</button>
      </div>
      <p class="nq-feedback" id="nq-feedback" role="status"></p>
    </div>
    <p><button type="button" class="btn" id="nq-stop">Stop and start playing</button></p>
  </section>

  <section class="nq-stage" id="nq-result" hidden>
    <p class="nq-kicker">🔢 Number Quest</p>
    <h1 id="nq-result-h">I found your starting workshop!</h1>
    <p class="lead" id="nq-result-workshop"></p>
    <p id="nq-result-beyond" hidden></p>
    <div class="nq-result-strands" id="nq-result-picture" hidden>
      <h2 class="nq-result-strands-h">The puzzles you showed Tally</h2>
      <div class="nq-strand-cards" id="nq-strand-cards"></div>
    </div>
    <p>You can always visit the earlier workshops. They stay open for games, laps and test-out.</p>
    <p class="small muted">Grown-ups: Tally also wrote a Starting Point note that explains each kind of puzzle in plain words. Ask a teacher or parent to open it from your family or school page — it lives there so it can sit next to your other grown-up pages.</p>
    <p class="row"><a class="btn btn-primary btn-big" href="/courses/number-quest">Go to Number Quest</a>
    <button type="button" class="btn btn-big" id="nq-retake-keep" hidden>Keep my old start point</button>
    <button type="button" class="btn btn-big" id="nq-retake-use" hidden>Use this new start point</button></p>
  </section>
  </div>`;
}

/** The Starting Point note for a teacher or parent: plain words per strand, the placed unit, the caveat,
 *  and the override controls (choose any start node; disable or re-enable the game). */
export function startingPointPage({ child, placement, note, canManage }) {
  const info = placement && placement.startNode ? P.nodeInfo(placement.startNode) : null;
  return html`<div class="nq" lang="en">
  <p class="nq-kicker">🔢 Number Quest · for teachers and parents</p>
  <h1>Starting Point note</h1>
  ${child ? html`<p class="lead">For ${esc(child.display_name || child.username)}.</p>` : ''}
  ${!placement || !placement.startNode ? html`<div class="panel"><p>No placement yet. The Sorting Game has not placed this learner, or they chose to start from the very beginning without one being saved.</p></div>` : html`
  <div class="panel">
    ${note ? html`<ul class="nq-note-lines">${note.lines.map(l => html`<li>${esc(l)}</li>`)}</ul>
    <p><b>Placed start:</b> ${esc(note.placedUnit)}</p>
    ${note.launchpadLine ? html`<p>${esc(note.launchpadLine)}</p>` : ''}
    ${note.partial ? html`<p>${esc(note.partial)}</p>` : ''}` : html`<p><b>Start point:</b> ${esc(info.workshop)} (${esc(placement.startNode)}), set by ${esc(placement.source)}.</p>`}
    <p class="nq-caveat">${esc(P.CAVEAT)}</p>
    ${placement.softLandNode ? html`<p>Tally is currently suggesting a warm-up at <b>${esc(P.nodeInfo(placement.softLandNode).workshop)}</b> first, after two tricky checks at the placed start. The placement itself has not moved.</p>` : ''}
    <p class="small muted">Placement asks only a grade and stores rungs, not birthdays. Rungs are curriculum-order judgements by the course writers, refined by item data after launch, not certified grades.</p>
  </div>
  ${canManage ? html`<div class="panel">
    <h2>Override: your word is final</h2>
    <p>Placement is advice the platform gives, never a gate it keeps. You can move this learner to any start point, or turn the Sorting Game off for them.</p>
    <form id="nq-override-form" class="row">
      <label>Start point <select id="nq-override-node">${P.START_NODES.map(n => html`<option value="${n.node}" ${placement.startNode === n.node ? 'selected' : ''}>${esc(n.workshop)} (${esc(n.node)})</option>`)}</select></label>
      <button type="submit" class="btn btn-primary">Set start point</button>
    </form>
    <p><button type="button" class="btn" id="nq-toggle-disabled">${placement.disabled ? 'Turn the Sorting Game back on' : 'Turn the Sorting Game off for this learner'}</button></p>
    <p class="small" id="nq-override-msg" role="status"></p>
  </div>` : ''}`}
  </div>`;
}
