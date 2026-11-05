// Oomba Breathe & Bend player (/move/:episode). Everything runs off the episode data the server
// put in page-data (services/move-data.js): segment order, seconds, poses, narration lines, seated
// versions. This file holds the three engines and nothing else:
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
const EP = data.episode, UI = data.ui, FRAMES = data.frames || {}, CLIPS = data.clips || {};
const $ = id => document.getElementById(id);
const stage = $('mv-stage'), mini = $('mv-mini'), miniWrap = $('mv-mini-wrap'), miniText = $('mv-mini-text');
const framesEl = $('mv-frames'), frameWrap = $('mv-framewrap'), frameImgs = [$('mv-frame-a'), $('mv-frame-b')], miniImg = $('mv-mini-img');
const videoEl = $('mv-video');
const captionEl = $('mv-caption'), segNameEl = $('mv-segname'), barEl = $('mv-bar'), timeEl = $('mv-time');
const playBtn = $('mv-play'), statusEl = $('mv-status'), yourTurnEl = $('mv-yourturn'), ringEl = $('mv-ring');
const endCard = $('mv-endcard'), doneStatus = $('mv-done-status');
const TOTAL = EP.segments.reduce((a, s) => a + s.seconds, 0);
const FAST = Math.max(1, Math.min(60, Number(new URLSearchParams(location.search).get('fast')) || 1));
const STANDING = new Set(['mountain', 'tree', 'star', 'waterfall']);
const RING_C = 326.7;

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) { stage.dataset.motion = 'reduced'; mini.dataset.motion = 'reduced'; framesEl.dataset.motion = 'reduced'; }

let playing = false, segIdx = -1, segElapsed = 0, lastTick = 0, timer = null;
let captionsOn = true, narrationOn = true, seatedMode = false, completed = false, endSpoken = false;
let captionIdx = 0, speakSeq = 0, narrating = false;
const elapsedBefore = () => EP.segments.slice(0, segIdx).reduce((a, s) => a + s.seconds, 0);
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ------------------------------------------------------------------ music (WebAudio, in code)
// An original pattern: a four bar loop (C, G, A minor, F as soft pads) with a marimba style
// pentatonic pluck melody whose order is fixed by the table below. Nothing is sampled or copied.
const Music = {
  ctx: null, gain: null, filter: null, timer: null, nextNote: 0, step: 0, started: false,
  notes: 0, bars: 0, perSegment: {}, level: 'duck',
  CHORDS: [[130.81, 196.0, 261.63], [98.0, 146.83, 246.94], [110.0, 164.81, 261.63], [87.31, 174.61, 220.0]],
  SCALE: [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25],
  MELODY: [0, 2, 4, 3, 4, 5, 4, 2, 0, 2, 4, 7, 5, 4, 2, 1, 2, 4, 5, 4, 2, 0, 2, -1, 0, 2, 4, 3, 2, 1, 2, -1],
  on: true,
  start() {
    if (this.started) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.filter = this.ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 1800;
    this.gain = this.ctx.createGain(); this.gain.gain.value = this.on ? 0.06 : 0;
    this.filter.connect(this.gain); this.gain.connect(this.ctx.destination);
    this.nextNote = this.ctx.currentTime + 0.06; this.step = 0; this.started = true;
    this.timer = setInterval(() => this.schedule(), 180);
  },
  beat() { return (segIdx >= 0 && EP.segments[segIdx].id === 'rest') || endCard.classList.contains('on') ? 0.56 : 0.417; },
  restMode() { return segIdx >= 0 && EP.segments[segIdx] && EP.segments[segIdx].id === 'rest'; },
  schedule() {
    if (!this.ctx) return;
    const ahead = this.ctx.currentTime + 0.4;
    while (this.nextNote < ahead) {
      this.pluck(this.nextNote, this.step);
      if (this.step % 8 === 0) { this.pad(this.nextNote, this.step / 8); this.bars++; }
      this.nextNote += this.beat(); this.step++;
    }
    const rest = this.restMode();
    this.filter.frequency.setTargetAtTime(rest ? 850 : 1800, this.ctx.currentTime, 0.6);
    const base = !this.on ? 0 : rest ? 0.1 : this.level === 'up' ? 0.15 : 0.06;
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
    const chord = this.CHORDS[bar % this.CHORDS.length], dur = this.beat() * 8;
    for (const f of chord) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.5);
      g.gain.setValueAtTime(0.05, t + dur - 0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.filter); o.start(t); o.stop(t + dur + 0.05);
    }
  },
  stats() {
    return { started: this.started, on: this.on, notes: this.notes, bars: this.bars, perSegment: this.perSegment,
      ctxState: this.ctx ? this.ctx.state : 'none', gain: this.gain ? Math.round(this.gain.gain.value * 1000) / 1000 : 0,
      restMode: this.restMode(), level: this.level };
  },
};

// ------------------------------------------------------------------ narration (AI voice only)
const narrAudio = new Audio();
const narrationLog = [];
const aiReady = () => !!(data.tts && aiOn(data.tts.langs, 'en'));
function showCaption(text) { captionEl.textContent = captionsOn ? (text || '') : ''; }
function speakLine(si, li, done) {
  const seg = si < EP.segments.length ? EP.segments[si] : null;
  const text = seg ? seg.lines[li] : EP.endLines[li];
  showCaption(text);
  if (!narrationOn || !aiReady()) { narrationLog.push({ seg: si, line: li, via: 'captions-only' }); return done && done(); }
  const my = ++speakSeq; narrating = true; Music.level = 'duck';
  ttsBlob({ ctx: 'move', episode: EP.id, seg: si, line: li }).then(blob => {
    if (my !== speakSeq) return;
    const url = URL.createObjectURL(blob);
    narrAudio.src = url;
    narrAudio.onplaying = () => { if (my === speakSeq) narrationLog.push({ seg: si, line: li, via: 'ai' }); };
    narrAudio.onended = () => { URL.revokeObjectURL(url); if (my === speakSeq) { narrating = false; done && done(); } };
    narrAudio.onerror = () => { URL.revokeObjectURL(url); if (my === speakSeq) { narrating = false; narrationLog.push({ seg: si, line: li, via: 'error' }); done && done(); } };
    const p = narrAudio.play();
    if (p && p.catch) p.catch(() => { if (my === speakSeq) { narrating = false; done && done(); } });
  }).catch(() => { if (my === speakSeq) { narrating = false; narrationLog.push({ seg: si, line: li, via: 'refused' }); done && done(); } });
}
function speakSegment(si) {
  const seg = EP.segments[si]; captionIdx = 0;
  const next = () => { if (!playing) return; if (captionIdx >= seg.lines.length) return; speakLine(si, captionIdx, () => { captionIdx++; next(); }); };
  next();
  for (let li = 1; li < seg.lines.length; li++) if (aiReady() && narrationOn) ttsBlob({ ctx: 'move', episode: EP.id, seg: si, line: li }, { pre: true }).catch(() => {});
}
function stopNarration() { speakSeq++; narrating = false; try { narrAudio.pause(); narrAudio.removeAttribute('src'); } catch { /* ignore */ } }

// ------------------------------------------------------- the visual layer (rendered 3D frames)
// Since Greg's art redirect the stage is pre-rendered 3D frames of Remy (public/img/move/frames),
// one per pose, crossfaded by the player. The life Greg asked for is player-applied motion on top
// of the stills: a soft bounce with a squash as each pose lands, a slow breathing scale and sway
// while holding, and a warm light layer drifting against the frame's drift (parallax). The flat
// SVG stage underneath remains as the per-pose fallback for any frame file that is missing; it is
// hidden whenever the current pose has a frame. Reduced motion turns all of it off: a still
// frame per segment, as the accessibility rules require.
let frameFront = 0, currentFrame = null, currentClip = null;
// One media slot per segment: Greg's real clip (mp4, silent by design, looped to fill the
// segment) when its file exists, with the segment's still frame as poster and fallback; the
// still alone until then. The clip never drives the clock, the narration or the music: those
// live in the player and sit on top of whatever the slot shows. Reduced motion never plays
// the clip: the poster still is the segment's finished frame, as the rules require.
function syncVideo(seg, wantPlay) {
  const clip = CLIPS[seg.id] || null;
  currentClip = clip;
  if (!clip) { videoEl.hidden = true; if (!videoEl.paused) videoEl.pause(); return; }
  videoEl.hidden = false;
  const still = (seatedMode && STANDING.has(seg.pose) && FRAMES[`${seg.pose}-seated`]) || FRAMES[seg.pose];
  if (still) videoEl.poster = still;
  if (videoEl.dataset.clip !== clip) { videoEl.dataset.clip = clip; videoEl.src = clip; }
  if (wantPlay && !reduced) { const p = videoEl.play(); if (p && p.catch) p.catch(() => {}); }
  else videoEl.pause();
}
videoEl.addEventListener('error', () => { videoEl.hidden = true; videoEl.removeAttribute('src'); delete videoEl.dataset.clip; currentClip = null; }, true);
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
  syncVideo(seg, playing);
  if (seg.seated) {
    miniWrap.hidden = false; miniText.textContent = seg.seated;
    if (seatedUrl) { miniImg.src = seatedUrl; miniImg.hidden = false; mini.style.display = 'none'; }
    else { miniImg.hidden = true; mini.style.display = ''; }
  } else miniWrap.hidden = true;
  segNameEl.textContent = seg.name;
}
function yourTurnWindow(seg) { if (!seg.yourTurn) return null; const start = Math.max(6, seg.seconds - 16); return [start, start + 10]; }
function enterSegment(i) {
  segIdx = i; segElapsed = 0; const seg = EP.segments[i];
  setPose(seg); stage.classList.remove('hold'); framesEl.classList.remove('hold'); yourTurnEl.classList.remove('on'); yourTurnEl.setAttribute('aria-hidden', 'true');
  Music.perSegment[seg.id] = Music.perSegment[seg.id] || { notes: 0 };
  speakSegment(i);
}
function finish() {
  playing = false; playBtn.textContent = UI.play; clearInterval(timer); timer = null;
  if (!videoEl.paused) videoEl.pause();
  stage.classList.remove('hold'); framesEl.classList.remove('hold'); yourTurnEl.classList.remove('on');
  Music.level = 'up';
  endCard.classList.add('on');
  if (!completed) {
    completed = true;
    fetch('/api/move/complete', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ episode: EP.id }) })
      .then(r => r.json()).then(d => { doneStatus.textContent = d && d.stored ? (d.already || data.alreadyDone ? UI.alreadyDone : UI.savedDone) : UI.guestDone; })
      .catch(() => { doneStatus.textContent = UI.guestDone; });
  }
  if (!endSpoken) { endSpoken = true; speakLine(EP.segments.length, 0, null); }
}
function tick() {
  const now = performance.now(); const dt = Math.min(0.5, (now - lastTick) / 1000) * FAST; lastTick = now;
  if (!playing) return;
  segElapsed += dt;
  const seg = EP.segments[segIdx];
  const win = yourTurnWindow(seg);
  if (win && segElapsed >= win[0] && segElapsed < win[1]) {
    stage.classList.add('hold'); framesEl.classList.add('hold'); yourTurnEl.classList.add('on'); yourTurnEl.setAttribute('aria-hidden', 'false');
    if (currentClip && !videoEl.paused) videoEl.pause();
    ringEl.style.strokeDashoffset = String(RING_C * (1 - (segElapsed - win[0]) / 10));
    Music.level = 'up';
    if (narrating) { /* the hold is quiet: narration lines were read before it */ }
  } else {
    stage.classList.remove('hold'); framesEl.classList.remove('hold'); yourTurnEl.classList.remove('on'); yourTurnEl.setAttribute('aria-hidden', 'true');
    if (currentClip && playing && !reduced && videoEl.paused && !(win && segElapsed >= win[0] && segElapsed < win[1])) { const p = videoEl.play(); if (p && p.catch) p.catch(() => {}); }
    if (!narrating) Music.level = win && segElapsed >= win[1] ? 'duck' : Music.level;
  }
  if (!narrating && !aiReady() && captionsOn) {
    const idx = Math.min(seg.lines.length - 1, Math.floor(segElapsed / seg.seconds * seg.lines.length));
    if (idx !== captionIdx) { captionIdx = idx; showCaption(seg.lines[idx]); }
  }
  const total = elapsedBefore() + Math.min(segElapsed, seg.seconds);
  barEl.style.width = `${Math.min(100, total / TOTAL * 100)}%`;
  timeEl.textContent = `${fmt(Math.min(total, TOTAL))} / ${fmt(TOTAL)}`;
  if (segElapsed >= seg.seconds) {
    stopNarration();
    if (segIdx + 1 < EP.segments.length) enterSegment(segIdx + 1); else finish();
  }
}
function startClock() { lastTick = performance.now(); if (!timer) timer = setInterval(tick, 100); }
function play() {
  if (completed && endCard.classList.contains('on')) return;
  Music.start();
  if (segIdx < 0) enterSegment(0);
  playing = true; playBtn.textContent = UI.pause; startClock();
  if (currentClip && !reduced) { const p = videoEl.play(); if (p && p.catch) p.catch(() => {}); }
  if (narrAudio.paused && narrating) narrAudio.play().catch(() => {});
}
function pause() {
  playing = false; playBtn.textContent = UI.play;
  if (!videoEl.paused) videoEl.pause();
  try { narrAudio.pause(); } catch { /* ignore */ }
}
function restart() {
  pause(); stopNarration(); completed = false; endSpoken = false; endCard.classList.remove('on');
  doneStatus.textContent = ''; captionIdx = 0; segIdx = -1; barEl.style.width = '0%';
  statusEl.textContent = '';
  play();
}

playBtn.addEventListener('click', () => (playing ? pause() : play()));
$('mv-restart').addEventListener('click', restart);
$('mv-again').addEventListener('click', restart);
$('mv-cap-btn').addEventListener('click', e => { captionsOn = !captionsOn; e.currentTarget.setAttribute('aria-pressed', String(captionsOn)); if (!captionsOn) captionEl.textContent = ''; else { const seg = EP.segments[Math.max(0, segIdx)]; if (seg) showCaption(seg.lines[Math.min(captionIdx, seg.lines.length - 1)]); } });
$('mv-music-btn').addEventListener('click', e => { Music.on = !Music.on; e.currentTarget.setAttribute('aria-pressed', String(Music.on)); if (Music.ctx && Music.gain) Music.gain.gain.setTargetAtTime(Music.on ? 0.06 : 0, Music.ctx.currentTime, 0.15); });
$('mv-narr-btn').addEventListener('click', e => { narrationOn = !narrationOn; e.currentTarget.setAttribute('aria-pressed', String(narrationOn)); if (!narrationOn) stopNarration(); else if (playing && segIdx >= 0) speakSegment(segIdx); });
$('mv-seated-btn').addEventListener('click', e => { seatedMode = !seatedMode; e.currentTarget.setAttribute('aria-pressed', String(seatedMode)); if (segIdx >= 0) setPose(EP.segments[segIdx]); });
for (const group of document.querySelectorAll('.mv-calm')) group.addEventListener('click', e => {
  const b = e.target.closest('[data-calm]'); if (!b) return;
  for (const x of group.querySelectorAll('[data-calm]')) x.setAttribute('aria-pressed', String(x === b));
});

window.__moveTest = {
  state: () => ({ segIdx, seg: segIdx >= 0 && EP.segments[segIdx] ? EP.segments[segIdx].id : null, pose: stage.dataset.pose, frame: currentFrame, clip: currentClip, media: currentClip ? 'clip' : currentFrame ? 'still' : 'svg', elapsed: Math.round(elapsedBefore() + segElapsed), playing, completed, caption: captionEl.textContent, aiReady: aiReady(), fast: FAST }),
  narration: narrationLog,
  music: () => Music.stats(),
  play, pause, restart,
};
segNameEl.textContent = EP.segments[0].name;
showCaption('');
setPose(EP.segments[0]);
