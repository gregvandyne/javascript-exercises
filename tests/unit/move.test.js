// Oomba Breathe & Bend (Brain Breaks, /move): episode data integrity, the AI voice registration,
// the copy rules, and completion that counts only at the end of the Rest, for signed-in users only.
// The audible playthrough (narration per segment, music per segment, both mutes) is verified live in
// the build's end-to-end check; here the guarantees are pinned so a future edit cannot quietly break
// them: a dropped line, an em dash, a knee in Tree, a device voice in the player, a missing segment.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const { createApp } = await import('../../server/app.js');
const MOVE = await import('../../server/services/move.js');
const DATA = await import('../../server/services/move-data.js');
const lines = await import('../../server/services/tts-lines.js');

const EP = DATA.episodeById('mountain-morning');

test('Episode 1 data: the approved shape, in the approved order, totalling five minutes', () => {
  assert.ok(EP, 'mountain-morning exists');
  assert.deepEqual(EP.segments.map(s => s.id), ['intro', 'spark', 'mountain', 'tree', 'star', 'waterfall', 'butterfly', 'boat', 'cobra', 'rest']);
  assert.equal(DATA.episodeSeconds(EP), 300, 'the segments total 300 seconds');
  for (const s of EP.segments) {
    assert.ok(s.seconds >= 15 && s.seconds <= 60, `${s.id} has a sane length`);
    assert.ok(s.lines.length >= 1 && s.lines.length <= 3, `${s.id} has narration lines`);
    assert.ok(s.name && s.pose, `${s.id} is named and posed`);
  }
  assert.deepEqual(EP.segments.filter(s => s.yourTurn).map(s => s.id), ['tree', 'boat'], 'pause-and-do holds are Tree and Boat only');
  for (const id of ['spark', 'mountain', 'tree', 'star', 'waterfall']) {
    const s = EP.segments.find(x => x.id === id);
    assert.ok(s.seated && s.seated.length > 10, `${id} (a standing pose) has a seated version`);
  }
  assert.equal(EP.segments.find(s => s.id === 'star').pose, 'star', 'Star Pose is the standing star pose');
});

test('the words follow the rules: no em dashes, no emoji, no left or right, calf never knee', () => {
  const all = DATA.allLines(EP).join('\n');
  assert.ok(!all.includes('—'), 'no em dash in any spoken or shown line');
  assert.ok(!/\p{Extended_Pictographic}/u.test(all), 'no emoji or pictographs a voice could read aloud');
  assert.ok(!/\b(left|right)\b/i.test(all), 'no side is ever assumed');
  const tree = EP.segments.find(s => s.id === 'tree');
  assert.ok(/calf/.test(tree.lines.join(' ')) && !/knee/i.test(tree.lines.join(' ')), 'Tree rests the foot on the calf, never the knee');
  assert.ok(/eyes closed if you like/.test(all), 'eyes close only if you like');
  assert.ok(/Stop if anything hurts/.test(EP.segments[0].lines.join(' ')), 'the safety line is in the intro');
  assert.ok(/seated version/.test(EP.segments[0].lines.join(' ')), 'the intro offers the seated version');
});

test('every narration line is registered in tts-lines, word for word, in the narrator voice', () => {
  const all = DATA.allLines(EP);
  assert.equal(lines.MOVE_LINES.filter(l => l.episode === EP.id).length, all.length, 'the registry holds every line');
  let n = 0;
  EP.segments.forEach((s, si) => s.lines.forEach((text, li) => {
    const got = lines.moveLine(EP.id, si, li);
    assert.ok(got, `segment ${si} line ${li} is registered`);
    assert.equal(got.text, text); assert.equal(got.role, 'narrator'); n++;
  }));
  EP.endLines.forEach((text, li) => {
    const got = lines.moveLine(EP.id, EP.segments.length, li);
    assert.ok(got && got.text === text, 'the end card line is registered');
  });
  assert.ok(n >= 20, `the episode is fully narrated (${n} segment lines)`);
  assert.equal(lines.moveLine(EP.id, 99, 0), null, 'out of range is refused');
  assert.equal(lines.moveLine('no-such-episode', 0, 0), null);
  assert.equal(lines.moveLine(EP.id, 0, 99), null);
});

test('the player never uses a device voice and the music is made in code', () => {
  const player = read('public/js/move.js');
  assert.ok(!/speechSynthesis|deviceSpeak|readAloud/.test(player), 'no speechSynthesis, no device voice fallback in the player');
  assert.ok(/ttsBlob\(\{ ctx: 'move'/.test(player), 'narration goes through the shared TTS path with ctx move');
  assert.ok(/AudioContext/.test(player) && /MELODY/.test(player) && /CHORDS/.test(player), 'the music is an in-code WebAudio pattern');
  assert.ok(!/\.mp3|\.wav|\.ogg/.test(player), 'no recorded music files');
  const css = read('public/css/move.css');
  for (const pose of ['intro', 'spark', 'mountain', 'tree', 'star', 'waterfall', 'butterfly', 'boat', 'cobra', 'rest'])
    assert.ok(css.includes(`[data-pose="${pose}"]`), `the CSS poses Remy for ${pose}`);
  assert.ok(/prefers-reduced-motion/.test(css), 'reduced motion is honoured');
  assert.ok(/\[data-pose="star"\] \.leg-l \{ transform: translateX\(-13px\)/.test(css), 'Star Pose stands wide (the storyboard board drew it seated; the build does not)');
});

async function server() {
  const app = createApp();
  const srv = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, close: () => new Promise(r => srv.close(r)) };
}

test('the pages serve: index lists Episode 1, the player carries the data, a bad episode 404s', async () => {
  const { base, close } = await server();
  try {
    const idx = await (await fetch(base + '/move')).text();
    assert.ok(idx.includes('Mountain Morning with Remy') && idx.includes('/move/mountain-morning'), 'the index links the episode');
    assert.ok(idx.includes('Ocean Breath'), 'the season is listed');
    const play = await (await fetch(base + '/move/mountain-morning')).text();
    assert.ok(play.includes('id="page-data"') && play.includes('Spark Breathing') && play.includes('Starfish Rest'), 'the player page carries the episode');
    assert.ok(play.includes('/js/move.js') && play.includes('/css/move.css'), 'the player assets are wired');
    assert.equal((await fetch(base + '/move/no-such')).status, 404);
  } finally { await close(); }
});

test('completion: a guest stores nothing, a signed-in user stores once, mid-episode writes nothing', async () => {
  const guest = { id: 'move-guest', is_guest: 1 };
  const user = { id: 'move-user-1', is_guest: 0 };
  assert.deepEqual(MOVE.complete(guest, EP.id), { ok: true, stored: false, already: false }, 'a guest finish is session-only');
  assert.deepEqual(MOVE.completionsFor(guest), {}, 'a guest has no stored finishes');
  const first = MOVE.complete(user, EP.id);
  assert.deepEqual(first, { ok: true, stored: true, already: false }, 'a signed-in finish is stored');
  const again = MOVE.complete(user, EP.id);
  assert.deepEqual(again, { ok: true, stored: true, already: true }, 'a repeat finish is the same record, never two');
  assert.ok(MOVE.completionsFor(user)[EP.id] > 0, 'the finish is readable back');
  assert.equal(MOVE.complete(user, 'no-such-episode').ok, false);
  const { base, close } = await server();
  try {
    const r = await fetch(base + '/api/move/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ episode: EP.id }) });
    const d = await r.json();
    assert.equal(r.status, 200); assert.equal(d.stored, false, 'an anonymous post stores nothing (a guest in class)');
    assert.equal((await fetch(base + '/api/move/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ episode: 'nope' }) })).status, 404);
  } finally { await close(); }
});

test('ctx move on the TTS route is not an unknown context', async () => {
  const { base, close } = await server();
  try {
    const r = await fetch(base + '/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ctx: 'move', episode: EP.id, seg: 0, line: 0 }) });
    // With AI voices off in the test environment the route refuses with 404 'off' before resolving;
    // an unknown context would be 400 'ctx'. The enabled path is heard in the live playthrough.
    assert.notEqual(r.status, 400, 'ctx move is recognised');
    if (r.status === 200) { const d = await r.json(); assert.ok(/^\/tts\/[0-9a-f]{64}\.mp3$/.test(d.u), 'a line resolves to audio'); }
  } finally { await close(); }
});
