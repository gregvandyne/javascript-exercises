// The automatic playtest (docs/decisions.md "The Builder playtests every build"). After the AI finishes a build that
// saved a new version, and before the build ends, the platform plays the game like a kid would (snapshot.js autoplay():
// about 18 s of keys, taps, swipes, the game's own buttons and mouse movement, then the layout at phone landscape,
// tablet portrait and desktop). buildReport() turns those raw facts into a short report: what happened, and the
// problems that are clearly real (errors, it never started, a blank or frozen screen, input ignored, a score that never
// changes in a scoring game, a game over within seconds, layout problems, very slow). claude.js sends the report to the
// AI as a platform note to fix, re-tests the fixed version, and stops when the test is clean or the rounds are used up
// (fixRounds: 1 for everyone, 3 for trusted makers). The report is data for the AI: what the game itself printed is
// quoted, cleaned and cut short, never instructions.
import { cleanNote } from './steps.js';
import { trustedMaker } from './usage.js';

/** Tests: raw(html, version) replaces the browser run (it returns what snapshot.autoplayGame would). */
export const hooks = { raw: null };

export { trustedMaker };
/** How many times one build may go back (trusted makers: the admin, school staff and class teachers, usage.js) to fix what the automatic playtest found. */
export const fixRounds = u => (trustedMaker(u) ? 3 : 1);
/** The AI needs at least this much of the build's time left to start a fix round (a fix is one or two model calls). */
export const FIX_NEEDS_MS = 4 * 60_000;
/** ...and this much to run the playtest at all. */
export const TEST_NEEDS_MS = 75_000;

const q = (s, n = 140) => `"${cleanNote(String(s || ''), n).replace(/"/g, '\'')}"`;
const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : null);
// A game's own state names its player hero, pos or player (2D x/y, or 3D x/y/z), and its screen scene or screen.
const heroOf = st => { const h = st && (st.hero || st.pos || st.player); return h && typeof h === 'object' && num(h.x) !== null ? h : null; };
const sceneOf = st => (st && typeof (st.scene ?? st.screen) === 'string' ? st.scene ?? st.screen : null);

/**
 * raw: snapshot.autoplayGame() result, or { failed: message } when the run itself broke (a timeout: the game froze).
 * o: { html (the version's code), version }.
 * -> { facts (compact, for tests and logs), issues: [{ key, text, soft }], problems: [their texts], forModel: the report
 *    text, clean }
 */
export function buildReport(raw, o = {}) {
  const html = String(o.html || '');
  if (!raw || raw.failed) {
    const why = cleanNote(raw && raw.failed, 120) || 'unknown';
    const problems = [`The automatic playtest could not finish (${why}). The game may freeze or loop forever while loading or right after starting: check the start-up code and any while/for loops.`];
    return { facts: { failed: why }, issues: [{ key: 'failed', text: problems[0], soft: false }], problems, forModel: text(o.version, problems, ['The game could not be played to the end.']), clean: false };
  }
  const shots = Array.isArray(raw.shots) ? raw.shots : [];
  const startShot = shots.find(s => s.at === 'start'), idleShot = shots.find(s => s.at === 'idle');
  const play = shots.filter(s => s.at === 'play' && typeof s.moved === 'number');
  const last = shots[shots.length - 1];
  const readings = [raw.s1, ...(raw.readings || []), raw.s2].filter(r => r && !r.error);
  const states = readings.map(r => r.state).filter(s => s && typeof s === 'object' && !s.error);
  const events = Array.isArray(raw.events) ? raw.events : [];
  const startedAt = num(raw.startedAt) || 0;

  // Moving pictures: how much of the screen changed between samples (0..1).
  const idle = idleShot ? idleShot.moved || 0 : 0;
  const playMoves = play.map(s => s.moved);
  const avgPlay = playMoves.length ? playMoves.reduce((a, b) => a + b, 0) / playMoves.length : 0;
  const maxPlay = playMoves.length ? Math.max(...playMoves) : 0;
  // Blank: almost all one colour AND nothing moving (a small sprite on a dark sky is not blank).
  const blank = !!(last && last.same > 0.97 && (!startShot || startShot.same > 0.97) && maxPlay < 0.01);

  // What the game says: its state, the SDK's messages, numbers on screen.
  const scores = states.map(s => num(s.score)).filter(x => x !== null);
  const scoreEvents = events.filter(e => e.type === 'brb:score');
  const overEvents = events.filter(e => e.type === 'brb:gameover');
  const scoreChanged = (scores.length > 1 && new Set(scores).size > 1) || scoreEvents.some(e => (e.score || 0) > 0);
  const numStrings = readings.map(r => r.nums || '');
  const numbersChanged = new Set(numStrings).size > 1;
  const scenes = [...new Set([sceneOf(raw.s0 && raw.s0.state), ...states.map(sceneOf)].filter(x => typeof x === 'string'))];
  const heroes = states.map(heroOf).filter(Boolean);
  const st0 = raw.s0 && raw.s0.state, st1 = raw.s1 && raw.s1.state;
  const spread = k => { const v = heroes.map(h => num(h[k])).filter(x => x !== null); return v.length > 1 ? Math.max(...v) - Math.min(...v) : 0; };
  const unit = st1 && num(st1.cell) ? st1.cell / 12 : heroes.some(h => num(h.z) !== null) ? 0.25 : 4;   // pixels in 2D, metres in 3D
  const heroMoved = heroes.length > 1 && (spread('x') > unit || spread('y') > unit || spread('z') > unit);
  const stateChanged = new Set(states.map(s => JSON.stringify({ ...s, raf: 0, timeLeft: 0 }))).size > 1;
  const sceneChangedAtStart = !!(st0 && st1 && sceneOf(st0) !== sceneOf(st1));
  const started = sceneChangedAtStart || (startShot ? startShot.moved > 0.05 : false) || events.some(e => e.type !== 'brb:ready') || stateChanged || maxPlay > 0.1;   // a tap's focus ring or pressed button alone changes a few per cent
  const frozen = !blank && maxPlay < 0.004 && (!startShot || (startShot.moved || 0) < 0.004) && !stateChanged && !numbersChanged && !scoreEvents.length && !overEvents.length;
  // Did input do anything? Clear when the game reports a hero (moved or not) or a still screen that moved during play.
  const controls = st1 && typeof st1.controls === 'string' ? st1.controls : null;
  let input = 'unclear';
  if (heroes.length > 1 && controls !== 'none') input = heroMoved || scoreChanged ? 'yes' : 'no';
  else if (scoreChanged || numbersChanged || overEvents.length) input = 'yes';
  else if (idle < 0.01 && avgPlay > 0.05) input = 'yes';
  else if (idle < 0.01 && maxPlay < 0.01) input = 'no';
  const scoring = scores.length > 0 || /BRB\.score|BRB\.gameOver|\bscore\b/i.test(html) || readings.some(r => r.scoreWord);
  const endScenes = states.filter(s => /^(win|lose|over|gameover|results?)$/i.test(String(sceneOf(s) || '')));
  const firstOver = overEvents.length ? Math.min(...overEvents.map(e => e.t)) - startedAt : null;
  const instantOver = firstOver !== null && firstOver < 3000;
  const errors = [...new Set((raw.errors || []).map(e => cleanNote(e, 160)).filter(Boolean))].slice(0, 5);
  const fps = num(raw.fps);
  const layout = (raw.layout || []).map(v => ({ label: String(v.label || v.key || ''), width: v.width, height: v.height, problems: (v.problems || []).slice(0, 4).map(p => cleanNote(p, 140)) }));

  const facts = {
    started, startedHow: String(raw.started || 'none').slice(0, 40), input, scoreChanged, numbersChanged, scoring, frozen, blank,
    gameOver: overEvents.length || endScenes.length ? { at: firstOver, instant: instantOver } : null,
    errors: errors.length, scenes: scenes.slice(0, 8), fps, inputs: raw.inputs || 0, playSecs: Math.round((raw.playMs || 0) / 1000),
    motion: { idle: round(idle), play: round(avgPlay), max: round(maxPlay) }, layout: layout.map(v => v.problems.length),
  };

  // Each issue: hard ones always start a fix round; a soft one (it may be a false alarm: the score check) starts one
  // only the first time this build sees it (claude.js), so the AI is never asked twice about something it judged fine.
  const issues = [];
  const add = (key, text, soft = false) => issues.push({ key, text, soft });
  if (errors.length) add('errors', `Errors while playing (quoted from the game's console; find the cause): ${errors.map(e => q(e)).join(' | ')}.`);
  if (blank) add('blank', 'The screen stayed almost all one colour the whole time: nothing was drawn (a canvas never painted, everything hidden, or a crash at start).');
  else if (!started) add('start', `Pressing start did nothing that could be seen (${raw.started === 'hook' ? '__brbTest.start() was called' : raw.started && raw.started !== 'none' ? 'the start button was tapped' : 'nothing to tap was found, so the middle was tapped'}, then Enter): the title screen stayed as it was. Check the start button works with a tap (pointerdown/click) and that __brbTest.start() starts a round.`);
  else if (frozen) add('frozen', 'After starting, nothing on screen moved and nothing changed during the whole playtest (keys, taps, swipes, buttons): the game looks frozen. Check the game loop keeps running (requestAnimationFrame) and nothing waits forever.');
  if (!blank && started && !frozen && input === 'no') add('input', heroes.length > 1 ? 'The hero never moved and the score never changed while the playtest pressed arrows, WASD and space, tapped, swiped and pressed the game\'s buttons: the controls seem not to work. Check the key and touch handlers (and that they listen on window or the canvas, not an element that never gets focus).' : 'The screen did not react to any input (arrows, WASD, space, taps, swipes, the game\'s own buttons): check the controls are wired up.');
  if (instantOver) add('over', `The game ended ${Math.max(0, Math.round(firstOver / 100) / 10)} s after it started: a round should not be over before the player has a chance (check the start state: lives, timers, collisions at the start position).`);
  if (!blank && started && !frozen && scoring && !scoreChanged && !numbersChanged && !overEvents.length && input !== 'no') add('score', `In ${facts.playSecs} s of play (arrows, WASD, space, taps, swipes and the game's own buttons) the score never changed and no numbers on screen changed. If this game is about scoring, check points are really added (and shown). If it is a calm game or waits for an answer, ignore this.`, true);
  if (fps !== null && fps > 0 && fps < 8) add('slow', `It ran at about ${fps} frames a second on the test machine: far too slow. Draw less each frame (fewer objects, smaller canvases, no work that grows every frame).`);
  for (const v of layout) if (v.problems.length) add(`layout:${v.label}`, `On ${v.label.toLowerCase()} (${v.width}x${v.height}): ${v.problems.join('; ')}.`);
  for (const w of (raw.kitWarnings || []).slice(0, 3)) add(`kit:${cleanNote(w, 40)}`, `Oomba Kit warning: ${q(w)}.`);
  const problems = issues.map(i => i.text);

  const seen = [
    `Started: ${started ? 'yes' : 'no'} (${facts.startedHow}). Input made a difference: ${input}. Score changed: ${scoreChanged ? 'yes' : 'no'}${numbersChanged ? '; numbers on screen changed' : ''}.`,
    scenes.length ? `Scenes seen: ${scenes.join(' → ')}.` : '',
    facts.gameOver ? `Game over: ${firstOver !== null ? `after ${Math.round(firstOver / 1000)} s` : 'reached'}.` : 'Game over: not reached in the playtest.',
    `Screen movement (share of the screen that changed between pictures): with no input ${pct(idle)}, while playing ${pct(avgPlay)} on average, ${pct(maxPlay)} at most.${fps ? ` About ${fps} frames a second on a slow test machine.` : ''}`,
  ].filter(Boolean);
  return { facts, issues, problems, forModel: text(o.version, problems, seen), clean: problems.length === 0 };
}

const round = x => Math.round(x * 1000) / 1000;
const pct = x => `${Math.round(x * 100)}%`;

function text(version, problems, seen) {
  const out = [
    `[Automatic playtest from the platform, of version ${version || '?'}: it played the game for about 18 s like a kid would (arrow keys, WASD, space, Enter, taps across the screen, swipes, the game's own answer/move buttons, mouse movement), then checked the layout on phone landscape, tablet portrait and desktop.]`,
    ...seen,
    problems.length ? `Problems found:\n- ${problems.join('\n- ')}` : 'No problems found.',
    problems.length ? 'Fix the real problems now with edit_game (or write_game for big ones), keeping everything that works. Judge each one against what this game is meant to be: some can be false alarms (a calm game with no score, a quiz or story waiting for an answer, a game played only by dragging). Skip those, and do not mention them. The platform plays the fixed version again by itself, so do not call playtest_game for this. Any question you already asked stays on screen: do not ask again. End with one short, honest sentence to the builder about what you fixed.' : '',
  ].filter(Boolean).join('\n');
  return out.length > 3800 ? out.slice(0, 3800) + '…' : out;
}
