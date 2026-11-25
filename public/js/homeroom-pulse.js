// Homeroom, step 3a (docs/decisions.md "Homeroom, step 3a"; server: services/homeroom-live.js pulse): a student's desk,
// and a handout's game page, tell the teacher's board a little about what is going on while class is live:
//   - where they are (the desk or a game) and which handout;
//   - how many seconds since their last input (a key, a tap, a pen stroke; on the game page the browser's own "the
//     person just used this page" flag, which also covers taps inside the game's frame);
//   - how many times the game itself moved forward on this page (it saved or scored), never what was saved;
//   - on the desk: where the pointer is over their own desk and over the pad, as fractions of it, sampled at most 4
//     times a second and sent in a batch (every 2 s while it moves, else a pulse every 10 s).
// Never keystrokes, words, answers or the screen. Nothing is sent while class isn't live (the desk's state poll and the
// pulse's own answer say when it is), while the page is hidden, or for a hidden cursor.
//
// On the game page (page-data hrPulse, added by services/homeroom-handouts.js's play frame) this file starts itself and
// also shows the desk's lock, Pause screens and "Your teacher is coming over" over the game.
import { t, api, esc, pageData } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
// (on a game's page, a Homeroom student's supports over the game: bigger text, Read to me on the teacher's note)
import '/js/homeroom-support.js';

const tp = (k, v) => t(`js.homeroom-pulse.${k}`, v);
const SAMPLE_MS = 250, SEND_MS = 2000, BEAT_MS = 10000, SAMPLES = 8;

/**
 * Start pulsing. opts: { classId, where: 'desk' | 'game', on: () => class lesson id | '', deskEl: () => element whose
 * box the cursor is measured against, padEl: () => the pad's element, onAnswer: r => {} (the pulse's answer: live, me,
 * mates) }. -> { setLive(live, me), stop(), input() }
 */
export function startPulse(opts) {
  const P = { live: null, me: null, lastInput: 0, step: 0, cur: [], pad: [], lastSample: 0, lastSent: 0, timer: null, busy: false, stopped: false };
  const mark = () => { P.lastInput = Date.now(); };
  for (const ev of ['pointerdown', 'keydown', 'input', 'wheel']) addEventListener(ev, mark, { capture: true, passive: true });
  addEventListener('pointermove', e => { if (e.buttons) mark(); sample(e); }, { capture: true, passive: true });
  // the game page: the browser marks the page as used for a few seconds after real input, even inside the game's frame
  const ua = navigator.userActivation;
  if (opts.where === 'game' && ua) setInterval(() => { if (ua.isActive) mark(); }, 1000);
  const sharing = () => !!P.live && !P.live.paused && !!P.me && P.me.cursors !== false && !P.me.hidden;
  function rel(el, e) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }
  function sample(e) {
    if (opts.where !== 'desk' || !sharing() || document.hidden) return;
    const now = Date.now(); if (now - P.lastSample < SAMPLE_MS) return;
    const d = rel(opts.deskEl && opts.deskEl(), e); if (!d) return;
    P.lastSample = now;
    const r3 = v => Math.round(v * 1000) / 1000;
    P.cur.push([now, r3(d[0]), r3(d[1])]); if (P.cur.length > SAMPLES) P.cur.shift();
    const p = rel(opts.padEl && opts.padEl(), e);
    if (p) { P.pad.push([now, r3(p[0]), r3(p[1])]); if (P.pad.length > SAMPLES) P.pad.shift(); }
  }
  async function send() {
    if (P.busy || P.stopped) return;
    P.busy = true;
    const rebase = list => { const t0 = list.length ? list[0][0] : 0; return list.map(([at, x, y]) => [at - t0, x, y]); };
    const idle = P.lastInput ? Math.round((Date.now() - P.lastInput) / 1000) : 3600;
    const body = { where: opts.where, on: (opts.on && opts.on()) || '', idle, step: P.step, ...(P.cur.length ? { cur: rebase(P.cur) } : {}), ...(P.pad.length ? { pad: rebase(P.pad) } : {}) };
    P.cur = []; P.pad = []; P.lastSent = Date.now();
    try {
      const r = await api(`/api/desk/${encodeURIComponent(opts.classId)}/pulse`, { method: 'POST', body, background: true, active: idle < 60 });
      P.live = r.live || null; P.me = r.me || null;
      if (opts.onAnswer) opts.onAnswer(r);
    } catch (e) { if (opts.onError) opts.onError(e); } finally { P.busy = false; }
  }
  function loop() {
    clearTimeout(P.timer); if (P.stopped) return;
    const now = Date.now();
    // Not live: the desk's own poll says when class starts; the game page asks now and then.
    if (!document.hidden && !P.paused && (P.live || opts.where === 'game')) {
      const every = !P.live ? 30000 : BEAT_MS;
      if (now - P.lastSent >= every || (P.live && (P.cur.length || P.pad.length) && now - P.lastSent >= SEND_MS)) send();
    }
    P.timer = setTimeout(loop, 500);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && P.live) send(); });
  P.timer = setTimeout(loop, opts.where === 'game' ? 400 : 1500);
  return {
    /** The desk's state poll heard the live state and its own live desk. */
    setLive(live, me) { const was = !!P.live; P.live = live || null; if (me !== undefined) P.me = me; if (!was && P.live) { P.lastSent = 0; } },
    /** The game moved forward (it saved or scored). */
    step() { P.step++; },
    input: mark,
    /** The desk's game layer is open: the game page in it pulses instead (never two pulses for one student). */
    pause() { P.paused = true; },
    resume() { P.paused = false; P.lastSent = 0; },
    stop() { P.stopped = true; clearTimeout(P.timer); },
  };
}

// ---------------------------------------------------------------- the game page
/** The lock, Pause screens and "Your teacher is coming over", over a handout's game. */
function gamePage(cfg) {
  if (!document.querySelector('link[href^="/css/homeroom.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `/css/homeroom.css?v=${encodeURIComponent((document.querySelector('link[href*="?v="]')?.href || '').split('?v=')[1] || '')}`; document.head.appendChild(l);
  }
  const box = document.createElement('div'); box.id = 'hp-over'; document.body.appendChild(box);
  let shown = '';
  const draw = r => {
    const L = r.live || {}, me = r.me || {};
    const html = me.locked ? over('🔒', tp('locked'), tp('lockedHint')) : L.paused ? over('👀', tp('eyes'), tp('eyesHint'))
      : me.coming ? `<div class="hp-note" role="status">${iconHtml('🚶', { size: 22 })} <span>${esc(tp('coming'))}</span></div>` : '';
    if (html !== shown) { box.innerHTML = html; shown = html; }
  };
  const over = (icon, title, hint) => `<div class="hd-over hd-pause hp-full" role="status"><div class="hd-pausein">${iconHtml(icon, { size: 64 })}<h2>${esc(title)}</h2><p>${esc(hint)}</p></div></div>`;
  const pulse = startPulse({ classId: cfg.classId, where: 'game', on: () => cfg.on, onAnswer: draw });
  // The game's own steps forward: it saved or scored (from its frame only; play.js checks and sends them on).
  const frame = () => document.getElementById('gameframe');
  addEventListener('message', e => {
    const f = frame(); if (!f || e.source !== f.contentWindow || !e.data || typeof e.data !== 'object') return;
    if (['brb:save', 'brb:score', 'brb:gameover'].includes(e.data.type)) pulse.step();
  });
}
const cfg = pageData().hrPulse;
if (cfg && cfg.classId) gamePage(cfg);
