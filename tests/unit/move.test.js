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

test('one seamless timeline: narration is a single due-time list, transitions line the joins', () => {
  // Greg's seamless rule: the episode is one five minute timeline. The narration plan covers
  // every line exactly once, in episode order, each due at a planned second on the master
  // clock: the first line of every segment is due exactly at that segment's start (the chapter
  // marker), later lines inside their own segment's window, and the end card line at 300.
  const tl = DATA.narrationTimeline(EP);
  const flat = [...EP.segments.flatMap((s, si) => s.lines.map((text, li) => ({ seg: si, line: li, text }))), ...EP.endLines.map((text, li) => ({ seg: EP.segments.length, line: li, text }))];
  assert.equal(tl.length, flat.length, 'the timeline holds every line');
  tl.forEach((e, i) => { assert.equal(e.seg, flat[i].seg); assert.equal(e.line, flat[i].line); assert.equal(e.text, flat[i].text); });
  let segStart = 0;
  EP.segments.forEach((s, si) => {
    const first = tl.find(e => e.seg === si && e.line === 0);
    assert.equal(first.start, segStart, `${s.id} opens on its chapter second`);
    for (const e of tl.filter(x => x.seg === si)) assert.ok(e.start >= segStart && e.start < segStart + s.seconds, `${s.id} line ${e.line} is due inside its segment`);
    segStart += s.seconds;
  });
  for (let i = 1; i < tl.length; i++) assert.ok(tl[i].start >= tl[i - 1].start, 'due times never go backwards');
  assert.equal(tl[tl.length - 1].start, 300, 'the end card line is due at the end of Rest');
  assert.deepEqual(DATA.TRANSITION_SLUGS, ['t01-02', 't02-03', 't03-04', 't04-05', 't05-06', 't06-07', 't07-08', 't08-09', 't09-10'], 'one named transition per join');
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
  // Seamless assembly, pinned: narration is one timeline queue (pumpNarration on TIMELINE),
  // chapter changes touch neither narration nor music, the music bed starts once, and shots
  // join by crossfading dual video elements (plus straddled transition clips when present).
  assert.ok(/TIMELINE/.test(player) && /pumpNarration/.test(player), 'narration runs off the single timeline');
  const enter = player.slice(player.indexOf('function enterSegment'), player.indexOf('function finish'));
  assert.ok(!/speak|stopNarration|Music\.start/.test(enter), 'a chapter change never restarts or cuts narration or music');
  const tickChange = player.slice(player.indexOf('if (segElapsed >= seg.seconds)'));
  assert.ok(!/stopNarration/.test(tickChange.slice(0, 200)), 'the clock does not stop narration at a join');
  assert.ok(/starts\+\+/.test(player) && /starts: this\.starts/.test(player), 'the music bed counts its starts (one per run)');
  assert.ok(/beatNow \+= \(targetBeat - this\.beatNow\)/.test(player), 'the Rest slow-down morphs instead of switching');
  const route = read('server/routes/move.js');
  assert.ok(route.includes('id="mv-video-a"') && route.includes('id="mv-video-b"'), 'two video elements alternate for crossfades');
  assert.ok(/startTransition/.test(player) && /TRANSITION_LEAD_MAX/.test(player), 'transition clips straddle the joins');
  assert.ok(/RETRY_MS = \[2000, 4000, 8000, 16000, 30000\]/.test(player) && /retriesLeft/.test(player), 'a transient voice refusal holds and retries the line instead of skipping it');
  const css = read('public/css/move.css');
  assert.ok(/\.mv-video \{[^}]*transition: opacity \.45s/.test(css) && /\.mv-video\.on \{ opacity: 1; \}/.test(css), 'video shots join with a 0.45s crossfade, never a hard cut');
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
    // The 3D stills are the player's visuals for every segment (Greg's clips take the same slots
    // later): every segment and both standing seated variants resolve to a frame URL, and the
    // base64-stored Mountain frame decodes back to real JPEG bytes (SOI marker) over HTTP.
    const pd = JSON.parse(play.match(/<script type="application\/json" id="page-data">(.*?)<\/script>/s)[1].replace(/\\u003c/g, '<'));
    for (const s of EP.segments) assert.ok(pd.frames[s.pose], `frame wired for ${s.id}`);
    assert.ok(pd.frames['mountain-seated'] && pd.frames['tree-seated'], 'seated frames wired');
    // The seamless assembly data: the narration timeline ships with the page, and the nine
    // transition slots line the joins (all empty until Greg's clips land; stills crossfade).
    assert.equal(pd.episode.timeline.length, DATA.allLines(EP).length, 'the page carries the one narration timeline');
    assert.equal(pd.episode.timeline[0].start, 0);
    assert.equal(pd.episode.timeline[pd.episode.timeline.length - 1].start, 300);
    assert.equal(pd.transitions.length, EP.segments.length - 1, 'one transition slot per join');
    assert.ok(pd.transitions.every(u => u === null || typeof u === 'string'), 'transition slots are URLs or empty');
    const img = await fetch(base + pd.frames.mountain);
    assert.equal(img.status, 200);
    assert.match(img.headers.get('content-type') || '', /image\/jpeg/);
    const bytes = Buffer.from(await img.arrayBuffer());
    assert.ok(bytes.length > 100000 && bytes[0] === 0xff && bytes[1] === 0xd8, 'a real JPEG comes back');
    assert.equal((await fetch(base + '/move-frames/nope.jpg')).status, 404);
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
