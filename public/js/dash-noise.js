// Classroom dashboards, stage 2: the voice / noise meter (docs/decisions.md "Classroom dashboards, stage 2").
// The microphone is used in the teacher's browser only, and only after the teacher taps "Turn the mic on". Sound is
// turned into a loudness number with Web Audio (an AnalyserNode) many times a second, and that number is all this file
// keeps: audio is NEVER stored, recorded or sent anywhere. This module has no network calls of any kind and never
// creates a recorder (tests/unit/dash-stage2.test.js reads this file to check that).

/** Where each target zone ends, on the meter's 0-100 scale. */
export const ZONES = { silent: 18, whisper: 34, talk: 58, busy: 78 };
/** Loudness 0-100 from time-domain samples (0-255, 128 = silence): RMS on a gentle curve so talk sits mid-scale. */
export function levelOf(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) { const v = (samples[i] - 128) / 128; sum += v * v; }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return Math.max(0, Math.min(100, Math.round(Math.sqrt(rms) * 160)));
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function noise(body, s, ctx) {
  const W = ctx.type.words, top = ZONES[s.zone] || ZONES.talk;
  body.classList.add('dw-noise');
  const status = el('div', 'dw-noise-status');
  const chip = el('span', 'chip-s dw-micchip', W.off);
  const face = el('span', 'dw-noise-face'); face.setAttribute('aria-hidden', 'true');
  const word = el('span', 'dw-noise-word');
  status.append(chip, face, word);
  const meter = el('div', 'dw-meter');
  meter.setAttribute('role', 'meter'); meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '100'); meter.setAttribute('aria-valuenow', '0');
  meter.setAttribute('aria-label', ctx.type.name);
  const zone = el('span', 'dw-meter-zone'); zone.style.inlineSize = `${top}%`;
  const fill = el('span', 'dw-meter-fill');
  meter.append(zone, fill);
  const row = el('div', 'dw-row');
  const btn = el('button', 'btn btn-sm btn-primary dw-micbtn', `🎤 ${W.start}`); btn.type = 'button';
  const note = el('p', 'dw-note small muted', W.note);
  row.append(btn);
  body.append(status, meter, row, note);

  let stream = null, audio = null, raf = 0, smooth = 0, lastSay = '';
  function show(level) {
    smooth = smooth * 0.8 + level * 0.2;
    const v = Math.round(smooth);
    fill.style.inlineSize = `${v}%`;
    meter.setAttribute('aria-valuenow', String(v));
    const state = v > top ? 'loud' : v > top * 0.7 ? 'ok' : 'quiet';
    meter.dataset.state = state;
    face.textContent = state === 'loud' ? '🙉' : state === 'ok' ? '🙂' : '😌';
    word.textContent = W[state];
    if (state !== lastSay) { lastSay = state; meter.setAttribute('aria-valuetext', `${v} · ${W[state]}`); }
  }
  function stop() {
    cancelAnimationFrame(raf); raf = 0;
    if (stream) for (const tr of stream.getTracks()) tr.stop();
    stream = null;
    if (audio) audio.close().catch(() => {});
    audio = null; smooth = 0;
    chip.textContent = W.off; chip.classList.remove('is-on');
    btn.textContent = `🎤 ${W.start}`; btn.classList.add('btn-primary');
    fill.style.inlineSize = '0%'; meter.setAttribute('aria-valuenow', '0'); delete meter.dataset.state;
    face.textContent = ''; word.textContent = '';
  }
  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    } catch { word.textContent = W.denied; stream = null; return; }
    audio = new (window.AudioContext || window.webkitAudioContext)();
    const src = audio.createMediaStreamSource(stream);
    const an = audio.createAnalyser(); an.fftSize = 1024;
    src.connect(an);   // never connected to the speakers or to anything that keeps sound
    const buf = new Uint8Array(an.fftSize);
    chip.textContent = `🔴 ${W.on}`; chip.classList.add('is-on');
    btn.textContent = `⏹ ${W.stop}`; btn.classList.remove('btn-primary');
    const loop = () => { an.getByteTimeDomainData(buf); show(levelOf(buf)); raf = requestAnimationFrame(loop); };
    loop();
    ctx.say(W.on);
  }
  btn.addEventListener('click', () => { if (stream) { stop(); ctx.say(W.off); } else start(); });
  // The mic turns off when the tab is hidden or the widget goes away.
  const onHide = () => { if (document.hidden && stream) stop(); };
  document.addEventListener('visibilitychange', onHide);
  return { destroy() { stop(); document.removeEventListener('visibilitychange', onHide); } };
}
