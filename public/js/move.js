// Oomba Breathe & Bend player (/move/:episode). Everything runs off the episode data the server
// put in page-data (services/move-data.js): segment order, seconds, poses, narration lines, seated
// versions. The episode plays as ONE continuous timeline (Greg's seamless rule): the segments are
// chapter markers on a single five minute master clock, the narration is one queue scheduled on
// that clock (a line in progress is never cut at a chapter join; it finishes across it), the music
// is one bed started once and never restarted, and the shots are joined by transition clips.
// Before that clock starts, a logo intro pre-roll (the composed Oomba Academy card, about 3.5s)
// opens the episode with the music bed already running underneath it, outside the master clock.
// straddling the joins or, without one, a 0.45s crossfade. This file holds the three engines:
//   1. The clock: walks the segments, poses Remy (data-pose on the stage), shows the seated version
//      in the corner for standing poses, and pauses Tree and Boat on a 10 second "Your turn" ring.
//   2. Narration: every line is read by the platform AI voice through the shared path
//      (public/js/tts.js ttsBlob, POST /api/tts ctx 'move', the server picks the registered line by
//      number). There is deliberately NO fallback to a device voice here: if the
//      AI voice is off for English, the episode is silent and the captions (the same lines, word for
//      word) carry it. Captions are the narration transcript, never separate copy.
//   3. Music: an original gentle loop made in code (WebAudio marimba style plucks and a soft pad,
//      an original four bar pattern, no recorded or licensed material). It starts with Play, runs
//      under every segment, ducks while a narration line is speaking, comes up a little in the
//      holds, and slows and softens for Starfish Rest. Music and narration mute independently:
//      narration off is the teacher's music-only mode.
// Completion: the player posts /api/move/complete exactly once, when the clock reaches the end of
// Starfish Rest, never on open or start. The server stores it only for signed-in, non-guest users.
// A ?fast=N query speeds the clock up N times; it exists for the automated playthrough test and
// changes nothing else. window.__moveTest exposes the engines' state for that test.
import { ttsBlob, aiOn } from './tts.js';

const data = JSON.parse(document.getElementById('page-data').textContent);
const EP = data.episode, UI = data.ui, FRAMES = data.frames || {}, CLIPS = data.clips || {}, TRANSITIONS = data.transitions || [];
const $ = id => document.getElementById(id);
const stage = $('mv-stage'), mini = $('mv-mini'), miniWrap = $('mv-mini-wrap'), miniText = $('mv-mini-text');
const framesEl = $('mv-frames'), frameWrap = $('mv-framewrap'), frameImgs = [$('mv-frame-a'), $('mv-frame-b')], miniImg = $('mv-mini-img');
const videoEls = [$('mv-video-a'), $('mv-video-b')];
const CROSSFADE_MS = 450;
const captionEl = $('mv-caption'), segNameEl = $('mv-segname'), barEl = $('mv-bar'), timeEl = $('mv-time');
const playBtn = $('mv-play'), statusEl = $('mv-status'), yourTurnEl = $('mv-yourturn'), ringEl = $('mv-ring');
const endCard = $('mv-endcard'), doneStatus = $('mv-done-status');
const introCardEl = $('mv-introcard');
const TOTAL = EP.segments.reduce((a, s) => a + s.seconds, 0);
const FAST = Math.max(1, Math.min(60, Number(new URLSearchParams(location.search).get('fast')) || 1));
const STANDING = new Set(['mountain', 'tree', 'star', 'waterfall']);
const RING_C = 326.7;

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) { stage.dataset.motion = 'reduced'; mini.dataset.motion = 'reduced'; framesEl.dataset.motion = 'reduced'; }

let playing = false, segIdx = -1, segElapsed = 0, lastTick = 0, timer = null;
// The logo intro pre-roll (Greg, 2026-11-05): the composed Oomba Academy card
// (data.introCard, served by routes/move.js when the file is there) opens the episode for
// about 3.5 seconds BEFORE the master timeline starts. It sits outside the 300 second
// clock entirely: no chapter due-time, narration due second or completion moves, the
// music bed starts underneath the card (its single start counts from here), no narration
// line or caption plays over it, and it crossfades into the intro shot with the same
// 0.45s fade as the shot joins. Pausing freezes the hold; reduced motion keeps the card
// but shortens the hold to 1.5s and drops the fade (CSS). No card file, no pre-roll.
const INTRO_CARD = data.introCard || null;
const PREROLL_S = reduced ? 1.5 : 3.5;
let prerollActive = false, prerollDone = !INTRO_CARD, prerollElapsed = 0;
let captionsOn = true, narrationOn = true, seatedMode = false, completed = false;
let narrating = false;
const elapsedBefore = () => EP.segments.slice(0, Math.max(0, segIdx)).reduce((a, s) => a + s.seconds, 0);
/** The one master clock of the episode, in episode seconds (0..TOTAL). Everything (chapters,
 * narration due times, captions, the progress bar) reads this and nothing else. */
const episodeElapsed = () => (segIdx < 0 ? 0 : Math.min(TOTAL, elapsedBefore() + Math.min(segElapsed, EP.segments[segIdx].seconds)));
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ------------------------------------------------------------------ music (WebAudio, in code)
// An original pattern: a four bar loop (C, G, A minor, F as soft pads) with a marimba style
// pentatonic pluck melody whose order is fixed by the table below. Nothing is sampled or copied.
const Music = {
  ctx: null, gain: null, filter: null, timer: null, nextNote: 0, step: 0, started: false, starts: 0, beatNow: 0.417,
  notes: 0, bars: 0, perSegment: {}, level: 'duck',
  CHORDS: [[130.81, 196.0, 261.63], [98.0, 146.83, 246.94], [110.0, 164.81, 261.63], [87.31, 174.61, 220.0]],
  SCALE: [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25],
  MELODY: [0, 2, 4, 3, 4, 5, 4, 2, 0, 2, 4, 7, 5, 4, 2, 1, 2, 4, 5, 4, 2, 0, 2, -1, 0, 2, 4, 3, 2, 1, 2, -1],
  on: true,
  start() {
    // The bed starts exactly once per page (starts stays 1 across every chapter join, pause and
    // resume); a resume only wakes the context, it never resets the pattern, the step or the clock.
    if (this.started) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.filter = this.ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 1800;
    this.gain = this.ctx.createGain(); this.gain.gain.value = this.on ? 0.06 : 0;
    this.filter.connect(this.gain); this.gain.connect(this.ctx.destination);
    this.nextNote = this.ctx.currentTime + 0.06; this.step = 0; this.started = true; this.starts++;
    this.timer = setInterval(() => this.schedule(), 180);
  },
  restMode() { return segIdx >= 0 && EP.segments[segIdx] && EP.segments[segIdx].id === 'rest'; },
  schedule() {
    if (!this.ctx) return;
    const rest = this.restMode() || endCard.classList.contains('on');
    // The Rest slow-down is a morph, not a switch: the beat interval glides from 0.417s to 0.56s
    // over a few seconds of notes, so there is no audible tempo or level step at the Rest join.
    const targetBeat = rest ? 0.56 : 0.417;
    const ahead = this.ctx.currentTime + 0.4;
    while (this.nextNote < ahead) {
      this.pluck(this.nextNote, this.step);
      if (this.step % 8 === 0) { this.pad(this.nextNote, this.step / 8); this.bars++; }
      this.beatNow += (targetBeat - this.beatNow) * 0.15;
      this.nextNote += this.beatNow; this.step++;
    }
    this.filter.frequency.setTargetAtTime(rest ? 850 : 1800, this.ctx.currentTime, 0.6);
    // One continuous level shape, always approached with a 0.35s time constant (never a step):
    // ducked lowest while the narrator is actually speaking, the Rest bed a touch higher when
    // nobody is speaking, holds a little higher again.
    const base = !this.on ? 0 : narrating ? (rest ? 0.05 : 0.06) : rest ? 0.1 : this.level === 'up' ? 0.15 : 0.075;
    this.gain.gain.setTargetAtTime(base, this.ctx.currentTime, 0.35);
  },
  pluck(t, step) {
    const deg = this.MELODY[step % this.MELODY.length]; if (deg < 0) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = this.SCALE[deg];
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g); g.connect(this.filter); o.start(t); o.stop(t + 0.4);
    this.notes++;
    const id = segIdx >= 0 && EP.segments[segIdx] ? EP.segments[segIdx].id : 'end';
    (this.perSegment[id] = this.perSegment[id] || { notes: 0 }).notes++;
  },
  pad(t, bar) {
    const chord = this.CHORDS[bar % this.CHORDS.length], dur = this.beatNow * 8;
    for (const f of chord) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.5);
      g.gain.setValueAtTime(0.05, t + dur - 0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.filter); o.start(t); o.stop(t + dur + 0.05);
    }
  },
  stats() {
    return { started: this.started, starts: this.starts, on: this.on, notes: this.notes, bars: this.bars, perSegment: this.perSegment,
      ctxState: this.ctx ? this.ctx.state : 'none', gain: this.gain ? Math.round(this.gain.gain.value * 1000) / 1000 : 0,
      beat: Math.round(this.beatNow * 1000) / 1000, restMode: this.restMode(), level: this.level };
  },
};

// ------------------------------------------------------------------ narration (AI voice only)
// One performance on the master timeline. TIMELINE is the episode's lines with their due
// seconds (services/move-data.js narrationTimeline, shipped in page-data), and the queue below
// is the only narration driver: a line starts when the master clock reaches its due second AND
// the previous line has finished. If the voice runs long, the line in progress carries over the
// chapter join untouched and the next line follows it immediately; chapter changes never call
// into this engine, and nothing here restarts at a segment boundary. Pause freezes both the
// clock and the audio element, so a resume continues the same line where it stopped. Captions
// are the same lines on the same clock: the voice moves the caption when a line starts, and
// without a voice (or with narration muted) the caption track follows the due seconds itself.
const TIMELINE = (EP.timeline && EP.timeline.length) ? EP.timeline
  : EP.segments.flatMap((s, si) => s.lines.map((text, li) => ({ seg: si, line: li, text, start: 0 })))
    .concat(EP.endLines.map((text, li) => ({ seg: EP.segments.length, line: li, text, start: TOTAL })));
const narrAudio = new Audio();
const narrationLog = [];
const aiReady = () => !!(data.tts && aiOn(data.tts.langs, 'en'));
let narrIndex = 0, narrActive = null, narrFetching = false, narrToken = 0, captionIndex = -1;
function showCaption(text) { captionEl.textContent = captionsOn ? (text || '') : ''; }
const narrationLive = () => playing || endCard.classList.contains('on');
const entryIndexAt = at => { let idx = -1; for (let i = 0; i < TIMELINE.length; i++) { if (at >= TIMELINE[i].start) idx = i; else break; } return idx; };
function logLine(entry, via) { narrationLog.push({ seg: entry.seg, line: entry.line, via, at: Math.round(episodeElapsed() * 10) / 10, due: entry.start }); }
function prefetch(entry) { if (entry && aiReady() && narrationOn) ttsBlob({ ctx: 'move', episode: EP.id, seg: entry.seg, line: entry.line }, { pre: true }).catch(() => {}); }
function pumpNarration() {
  if (prerollActive || !narrationLive() || !narrationOn || !aiReady() || narrActive || narrFetching) return;
  const entry = TIMELINE[narrIndex];
  if (!entry || episodeElapsed() < entry.start) return;
  narrFetching = true; Music.level = 'duck';
  captionIndex = narrIndex; showCaption(entry.text); // the caption lands at the due second, even if the audio fetch lags a moment
  const my = ++narrToken;
  // A transient refusal (the voice service's per-minute generation cap answering 429 'fast',
  // or a 503 'busy') must not eat a line: the queue HOLDS on this line and retries with
  // backoff for about a minute, which is how long the cap's rolling window takes to clear.
  // At natural speed the cap is never approached (the busiest minute of a first ever play
  // generates about eight lines); this is a safety net for cold caches and busy minutes.
  // Only when every retry is refused does the line fall back to captions alone, logged as such.
  const RETRY_MS = [2000, 4000, 8000, 16000, 30000];
  const attempt = retriesLeft => {
    ttsBlob({ ctx: 'move', episode: EP.id, seg: entry.seg, line: entry.line }).then(blob => {
      if (my !== narrToken) return;
      narrFetching = false;
      if (!narrationLive() || !narrationOn) return; // paused or muted while fetching: the line stays queued
      narrActive = entry; narrating = true;
      const url = URL.createObjectURL(blob);
      let logged = false;
      narrAudio.src = url;
      narrAudio.onplaying = () => { if (my === narrToken && !logged) { logged = true; logLine(entry, 'ai'); } };
      const advance = via => { URL.revokeObjectURL(url); if (my !== narrToken) return; if (via !== 'ai') logLine(entry, via); narrActive = null; narrating = false; narrIndex++; pumpNarration(); };
      narrAudio.onended = () => advance('ai');
      narrAudio.onerror = () => advance('error');
      const p = narrAudio.play();
      if (p && p.catch) p.catch(() => { if (my === narrToken && narrationLive()) advance('refused'); });
      prefetch(TIMELINE[narrIndex + 1]); prefetch(TIMELINE[narrIndex + 2]);
    }).catch(() => {
      if (my !== narrToken) return;
      if (retriesLeft > 0 && narrationLive() && narrationOn) {
        const wait = RETRY_MS[RETRY_MS.length - retriesLeft];
        setTimeout(() => { if (my !== narrToken) return; if (!narrationLive() || !narrationOn) { narrFetching = false; return; } attempt(retriesLeft - 1); }, wait);
      } else if (retriesLeft > 0) { narrFetching = false; } // paused or muted: stay queued, a resume re-pumps
      else { narrFetching = false; logLine(entry, 'refused'); narrIndex++; pumpNarration(); }
    });
  };
  attempt(RETRY_MS.length);
}
/** The caption track when no voice is speaking (AI off, or narration muted for music-only):
 * follows the same due seconds on the same master clock, one line at a time, in order. */
function syncCaptions() {
  if (prerollActive || narrActive || (narrationOn && aiReady())) return;
  const idx = entryIndexAt(episodeElapsed());
  if (idx !== captionIndex) {
    captionIndex = idx;
    if (idx >= 0) { showCaption(TIMELINE[idx].text); logLine(TIMELINE[idx], 'captions-only'); }
  }
}
function stopNarration() {
  narrToken++; narrFetching = false; narrActive = null; narrating = false;
  try { narrAudio.pause(); narrAudio.removeAttribute('src'); } catch { /* ignore */ }
}

// ------------------------------------------------------- the visual layer (rendered 3D frames)
// Since Greg's art redirect the stage is pre-rendered 3D frames of Remy (public/img/move/frames),
// one per pose, crossfaded by the player. The life Greg asked for is player-applied motion on top
// of the stills: a soft bounce with a squash as each pose lands, a slow breathing scale and sway
// while holding, and a warm light layer drifting against the frame's drift (parallax). The flat
// SVG stage underneath remains as the per-pose fallback for any frame file that is missing; it is
// hidden whenever the current pose has a frame. Reduced motion turns all of it off: a still
// frame per segment, as the accessibility rules require.
let frameFront = 0, currentFrame = null, currentClip = null;
// The shots are assembled on the same master timeline. One media slot per segment holds Greg's
// real clip (mp4, silent by design, looped to fill the segment) when its file exists, with the
// segment's still frame as poster and fallback; the still alone until then. Two video elements
// alternate so no join is ever a hard cut: pose clip crossfades to pose clip over 0.45s, and
// when a transition clip exists for a boundary (t01-02.mp4 and friends, TRANSITIONS in
// page-data), it straddles the join: preloaded near the end of the outgoing segment, started up
// to half its length (at most 2.5s) before the chapter change, and the incoming pose clip
// crossfades in as it ends. The video never drives the clock, the narration or the music: those
// live in the player and sit on top of whatever the slot shows. Reduced motion never plays a
// clip: the poster still is the segment's finished frame, as the rules require.
let videoFront = 0, transBoundary = -1, transActive = false, transStartedFor = -1, transPreparedFor = -1, joinPending = false;
const TRANSITION_LEAD_MAX = 2.5;
const activeVideo = () => videoEls[videoFront];
const idleVideo = () => videoEls[1 - videoFront];
const stillFor = seg => (seatedMode && STANDING.has(seg.pose) && FRAMES[`${seg.pose}-seated`]) || FRAMES[seg.pose] || '';
const transitionUrl = boundary => (boundary >= 0 && boundary < TRANSITIONS.length ? TRANSITIONS[boundary] : null);
function pauseVideo(el) { try { el.pause(); } catch { /* ignore */ } }
function playVideo(el) { if (!reduced && el) { const p = el.play(); if (p && p.catch) p.catch(() => {}); } }
function fadeOutVideo(el) {
  el.classList.remove('on');
  setTimeout(() => { if (!el.classList.contains('on')) { pauseVideo(el); el.hidden = true; } }, CROSSFADE_MS + 60);
}
function showVideo(el, url, { loop = true, poster = '', play = false, mode = 'clip' } = {}) {
  if (el.dataset.src !== url) { el.dataset.src = url; el.src = url; }
  el.dataset.mode = mode; el.loop = loop; if (poster) el.poster = poster;
  el.hidden = false; void el.offsetWidth; el.classList.add('on');
  if (play) playVideo(el); else pauseVideo(el);
}
function crossfadeTo(url, opts = {}) {
  const from = activeVideo(), to = idleVideo();
  if (from.dataset.src === url && from.classList.contains('on')) { if (opts.poster) from.poster = opts.poster; if (opts.play) playVideo(from); return from; }
  showVideo(to, url, opts);
  if (from !== to) fadeOutVideo(from);
  videoFront = 1 - videoFront;
  return to;
}
function showSegmentVideo(seg) {
  const clip = CLIPS[seg.id] || null;
  currentClip = clip;
  if (transActive) return; // a transition clip is mid-join; it hands over to this segment when it ends
  if (joinPending && !reduced && transitionUrl(segIdx - 1) && transStartedFor !== segIdx - 1) { startTransition(segIdx - 1); return; }
  if (reduced || !clip) { for (const el of videoEls) fadeOutVideo(el); return; }
  const act = activeVideo();
  if (act.dataset.src === clip && act.classList.contains('on')) { act.poster = stillFor(seg); if (playing) playVideo(act); return; }
  crossfadeTo(clip, { loop: true, poster: stillFor(seg), play: playing });
}
function prepareTransition(boundary) {
  const url = transitionUrl(boundary);
  if (!url || transPreparedFor === boundary || transStartedFor === boundary) return;
  const el = idleVideo();
  if (el.dataset.src !== url) { el.dataset.src = url; el.src = url; }
  el.dataset.mode = 'transition'; el.dataset.boundary = String(boundary); el.loop = false;
  el.poster = stillFor(EP.segments[boundary + 1]); el.preload = 'auto'; el.hidden = false;
  transPreparedFor = boundary;
}
function transitionLead(boundary) {
  const el = videoEls.find(v => v.dataset.mode === 'transition' && Number(v.dataset.boundary) === boundary);
  const d = el && isFinite(el.duration) && el.duration > 0 ? el.duration : 5;
  return Math.min(TRANSITION_LEAD_MAX, d / 2);
}
function startTransition(boundary) {
  const url = transitionUrl(boundary);
  if (!url || transStartedFor === boundary) return;
  transStartedFor = boundary; transBoundary = boundary; transActive = true;
  crossfadeTo(url, { loop: false, poster: stillFor(EP.segments[boundary + 1]), play: playing, mode: 'transition' });
}
for (const el of videoEls) {
  el.addEventListener('ended', () => {
    if (el.dataset.mode === 'transition' && transActive && Number(el.dataset.boundary) === transBoundary) {
      transActive = false;
      showSegmentVideo(EP.segments[Math.max(0, segIdx)]);
    }
  });
  el.addEventListener('error', () => {
    const wasTransition = el.dataset.mode === 'transition';
    el.classList.remove('on'); el.hidden = true; el.removeAttribute('src'); delete el.dataset.src;
    if (wasTransition && transActive) { transActive = false; showSegmentVideo(EP.segments[Math.max(0, segIdx)]); }
    else if (el === activeVideo()) currentClip = null;
  }, true);
}
function showFrame(url) {
  if (url === currentFrame) return;
  currentFrame = url;
  const back = frameImgs[1 - frameFront], front = frameImgs[frameFront];
  const swap = () => { back.classList.add('on'); front.classList.remove('on'); frameFront = 1 - frameFront; };
  if (back.getAttribute('src') === url && back.complete && back.naturalWidth) swap();
  else { back.onload = swap; back.onerror = swap; back.src = url; }
  if (!reduced) { frameWrap.classList.remove('mv-bounce'); void frameWrap.offsetWidth; frameWrap.classList.add('mv-bounce'); }
}
function setPose(seg) {
  stage.dataset.pose = seg.pose; mini.dataset.pose = seg.pose;
  stage.dataset.seated = seatedMode && STANDING.has(seg.pose) ? '1' : '0';
  const seatedUrl = FRAMES[`${seg.pose}-seated`] || null;
  const frameUrl = (seatedMode && STANDING.has(seg.pose) && seatedUrl) || FRAMES[seg.pose] || null;
  if (frameUrl || CLIPS[seg.id]) { framesEl.hidden = false; stage.style.display = 'none'; if (frameUrl) showFrame(frameUrl); }
  else { framesEl.hidden = true; stage.style.display = ''; currentFrame = null; }
  showSegmentVideo(seg);
  if (seg.seated) {
    miniWrap.hidden = false; miniText.textContent = seg.seated;
    if (seatedUrl) { miniImg.src = seatedUrl; miniImg.hidden = false; mini.style.display = 'none'; }
    else { miniImg.hidden = true; mini.style.display = ''; }
  } else miniWrap.hidden = true;
  segNameEl.textContent = seg.name;
}
function yourTurnWindow(seg) { if (!seg.yourTurn) return null; const start = Math.max(6, seg.seconds - 16); return [start, start + 10]; }
function enterSegment(i) {
  // A chapter change moves the picture only. Narration and music are NOT touched here: they run
  // on the master timeline straight through the join.
  segIdx = i; segElapsed = 0; const seg = EP.segments[i];
  joinPending = i > 0;
  setPose(seg); joinPending = false;
  stage.classList.remove('hold'); framesEl.classList.remove('hold'); yourTurnEl.classList.remove('on'); yourTurnEl.setAttribute('aria-hidden', 'true');
  Music.perSegment[seg.id] = Music.perSegment[seg.id] || { notes: 0 };
}
function finish() {
  playing = false; playBtn.textContent = UI.play; clearInterval(timer); timer = null;
  for (const el of videoEls) pauseVideo(el);
  stage.classList.remove('hold'); framesEl.classList.remove('hold'); yourTurnEl.classList.remove('on');
  Music.level = 'up';
  endCard.classList.add('on');
  if (!completed) {
    completed = true;
    fetch('/api/move/complete', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ episode: EP.id }) })
      .then(r => r.json()).then(d => { doneStatus.textContent = d && d.stored ? (d.already || data.alreadyDone ? UI.alreadyDone : UI.savedDone) : UI.guestDone; })
      .catch(() => { doneStatus.textContent = UI.guestDone; });
  }
  // The end card line is simply the last entry of the same timeline queue: if a Rest line is
  // still speaking it finishes first, across the join into the end card, then this follows.
  pumpNarration(); syncCaptions();
}
function tick() {
  const now = performance.now(); const dt = Math.min(0.5, (now - lastTick) / 1000) * FAST; lastTick = now;
  if (!playing) return;
  if (prerollActive) {
    // The pre-roll runs on this same tick but outside the master clock: segElapsed and the
    // episode elapsed stay at zero under the card, so no line comes due, no caption shows
    // and no chapter moves until the card hands over to the intro shot.
    prerollElapsed += dt;
    if (prerollElapsed >= PREROLL_S) endPreroll();
    return;
  }
  segElapsed += dt;
  const seg = EP.segments[segIdx];
  const win = yourTurnWindow(seg);
  if (win && segElapsed >= win[0] && segElapsed < win[1]) {
    stage.classList.add('hold'); framesEl.classList.add('hold'); yourTurnEl.classList.add('on'); yourTurnEl.setAttribute('aria-hidden', 'false');
    const av = activeVideo(); if (currentClip && av.dataset.mode === 'clip') pauseVideo(av);
    ringEl.style.strokeDashoffset = String(RING_C * (1 - (segElapsed - win[0]) / 10));
    Music.level = 'up';
    if (narrating) { /* the hold is quiet: narration lines were read before it */ }
  } else {
    stage.classList.remove('hold'); framesEl.classList.remove('hold'); yourTurnEl.classList.remove('on'); yourTurnEl.setAttribute('aria-hidden', 'true');
    const av = activeVideo();
    if (currentClip && playing && !reduced && av.paused && av.dataset.src === currentClip) playVideo(av);
    if (!narrating) Music.level = win && segElapsed >= win[1] ? 'duck' : Music.level;
  }
  // The one timeline at work: due narration lines start here (never at a chapter call), the
  // caption track follows the same due seconds when no voice is speaking, and the next join's
  // transition clip is preloaded, then started so it straddles the chapter change.
  pumpNarration(); syncCaptions();
  if (!reduced && segIdx + 1 < EP.segments.length && transitionUrl(segIdx)) {
    if (segElapsed > seg.seconds - 8) prepareTransition(segIdx);
    if (segElapsed >= seg.seconds - transitionLead(segIdx)) startTransition(segIdx);
  }
  const total = elapsedBefore() + Math.min(segElapsed, seg.seconds);
  barEl.style.width = `${Math.min(100, total / TOTAL * 100)}%`;
  timeEl.textContent = `${fmt(Math.min(total, TOTAL))} / ${fmt(TOTAL)}`;
  if (segElapsed >= seg.seconds) {
    if (segIdx + 1 < EP.segments.length) enterSegment(segIdx + 1); else finish();
  }
}
function startClock() { lastTick = performance.now(); if (!timer) timer = setInterval(tick, 100); }
function showIntroCard() {
  if (!INTRO_CARD || !introCardEl) { prerollDone = true; return; }
  prerollActive = true; prerollElapsed = 0;
  introCardEl.hidden = false; void introCardEl.offsetWidth; introCardEl.classList.add('on');
}
function endPreroll() {
  prerollActive = false; prerollDone = true;
  enterSegment(0);
  if (introCardEl) {
    introCardEl.classList.remove('on'); // the 0.45s crossfade into the intro shot, like every join
    setTimeout(() => { if (prerollDone && !prerollActive) introCardEl.hidden = true; }, CROSSFADE_MS + 60);
  }
  pumpNarration();
}
function play() {
  if (completed && endCard.classList.contains('on')) return;
  Music.start();
  if (!prerollDone) {
    // The bed is already running (started just above, underneath the card); the master
    // clock itself starts only when the pre-roll hands over in endPreroll.
    if (!prerollActive) showIntroCard();
    playing = true; playBtn.textContent = UI.pause; startClock();
    return;
  }
  if (segIdx < 0) enterSegment(0);
  playing = true; playBtn.textContent = UI.pause; startClock();
  const av = activeVideo(); if (av.classList.contains('on')) playVideo(av);
  if (narrActive && narrAudio.paused) narrAudio.play().catch(() => {});
  pumpNarration();
}
function pause() {
  playing = false; playBtn.textContent = UI.play;
  for (const el of videoEls) pauseVideo(el);
  try { narrAudio.pause(); } catch { /* ignore */ }
}
function restart() {
  pause(); stopNarration();
  prerollActive = false; prerollDone = !INTRO_CARD; prerollElapsed = 0;
  if (introCardEl) { introCardEl.classList.remove('on'); introCardEl.hidden = true; }
  narrIndex = 0; captionIndex = -1;
  transActive = false; transBoundary = -1; transStartedFor = -1; transPreparedFor = -1;
  for (const el of videoEls) { el.classList.remove('on'); el.hidden = true; el.removeAttribute('src'); delete el.dataset.src; }
  completed = false; endCard.classList.remove('on');
  doneStatus.textContent = ''; segIdx = -1; barEl.style.width = '0%';
  statusEl.textContent = '';
  play();
}

playBtn.addEventListener('click', () => (playing ? pause() : play()));
$('mv-restart').addEventListener('click', restart);
$('mv-again').addEventListener('click', restart);
$('mv-cap-btn').addEventListener('click', e => { captionsOn = !captionsOn; e.currentTarget.setAttribute('aria-pressed', String(captionsOn)); if (!captionsOn) captionEl.textContent = ''; else { const entry = TIMELINE[Math.max(0, captionIndex)]; if (entry) showCaption(entry.text); } });
$('mv-music-btn').addEventListener('click', e => { Music.on = !Music.on; e.currentTarget.setAttribute('aria-pressed', String(Music.on)); if (Music.ctx && Music.gain) Music.gain.gain.setTargetAtTime(Music.on ? 0.06 : 0, Music.ctx.currentTime, 0.15); });
$('mv-narr-btn').addEventListener('click', e => { narrationOn = !narrationOn; e.currentTarget.setAttribute('aria-pressed', String(narrationOn)); if (!narrationOn) stopNarration(); else if (narrationLive() && segIdx >= 0) { narrIndex = Math.max(0, entryIndexAt(episodeElapsed())); pumpNarration(); } });
$('mv-seated-btn').addEventListener('click', e => { seatedMode = !seatedMode; e.currentTarget.setAttribute('aria-pressed', String(seatedMode)); if (segIdx >= 0) setPose(EP.segments[segIdx]); });
for (const group of document.querySelectorAll('.mv-calm')) group.addEventListener('click', e => {
  const b = e.target.closest('[data-calm]'); if (!b) return;
  for (const x of group.querySelectorAll('[data-calm]')) x.setAttribute('aria-pressed', String(x === b));
});

window.__moveTest = {
  state: () => ({ segIdx, seg: segIdx >= 0 && EP.segments[segIdx] ? EP.segments[segIdx].id : null, pose: stage.dataset.pose, frame: currentFrame, clip: currentClip, media: currentClip ? 'clip' : currentFrame ? 'still' : 'svg', elapsed: Math.round(episodeElapsed()), playing, completed, caption: captionEl.textContent, aiReady: aiReady(), fast: FAST, preroll: prerollActive, phase: prerollActive ? 'preroll' : endCard.classList.contains('on') ? 'end' : segIdx < 0 ? 'ready' : 'playing' }),
  narration: narrationLog,
  music: () => Music.stats(),
  // The seamless-timeline evidence: the music bed's start count (1 for a whole run), where the
  // single narration queue has reached, whether a transition clip is mid-join, and the join
  // crossfade the player uses between shots.
  timeline: () => ({ musicStarts: Music.starts, narrationIndex: narrIndex, narrationEntries: TIMELINE.length,
    narrationActive: narrActive ? { seg: narrActive.seg, line: narrActive.line } : null,
    transitionBoundary: transActive ? transBoundary : null, crossfadeMs: CROSSFADE_MS,
    prerollDone, prerollSeconds: INTRO_CARD ? PREROLL_S : 0 }),
  play, pause, restart,
};
segNameEl.textContent = EP.segments[0].name;
showCaption('');
setPose(EP.segments[0]);
