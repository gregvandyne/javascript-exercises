// Classroom dashboards: what each widget type draws (server/services/dash.js WIDGETS is the registry: ids, sizes,
// settings). A renderer gets the widget's body element, its settings and ctx, and may return { tick(date) } (called
// once a second), { live(state) } (called after each /live check, every 4 s while the screen is in view) and
// { destroy() } (the widget is redrawn or goes away). Stage 2 adds the everyday widgets (docs/decisions.md
// "Classroom dashboards, stage 2"): timer (with its stopwatch mode), schedule, weather, QR, picker, noise meter, help queue, quick
// checks and Oomba tiles.
// ctx: { type (with the translated words), intl, role, id, tz, teacher (the class's teacher's own widget), pinned (a
// student seeing the teacher's pinned widget), own (a student's own widget), editing, reduced() (reduced motion),
// private() (projector mode: no names), live() (the last /live answer), now() (the server's clock), get(path),
// act(path, body), poll(), sheet, toast, esc, say(msg), flush() (save the layout now) }. Paths are under
// /api/dash/<class>.
// Widgets render text with textContent only: never innerHTML with anything a person typed (the sheets escape it).
// No widget talks to an AI. The noise meter (dash-noise.js) has no network code at all.
// Stage 3 (docs/decisions.md "Classroom dashboards, stage 3"): the teaching tools, the whiteboard and the Picture widget
// are in public/js/dash-tools.js (their maths in dash-math.js); ctx gains common, keep, send, copy, upload and checks.
// Stage 4: teaching tools part 2 are in public/js/dash-tools4.js (maths in dash-math4.js); ctx gains ask and practice.
import { noise } from './dash-noise.js';
import { TOOLS } from './dash-tools.js';
import { TOOLS4 } from './dash-tools4.js';
import { withModes } from './dash-modes.js';
// Stage 5 (docs/decisions.md "Classroom dashboards, stage 5"): video, site window, hall pass, class jobs, mood, breathing,
// sticky note, checklist and points for each student are in dash-class5.js; the document camera in dash-camera.js.
import { RENDER5, points } from './dash-class5.js';
import { camera } from './dash-camera.js';
import { format } from './i18n-format.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
/** Text a person typed: its own direction (an English agenda on a Hebrew page reads left to right). */
const typed = (tag, cls, text) => { const e = el(tag, cls, text); e.dir = 'auto'; return e; };
const SVG = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const btn = (label, cls = 'btn btn-sm', aria) => { const b = el('button', cls, label); b.type = 'button'; if (aria) b.setAttribute('aria-label', aria); return b; };
/** A word with {placeholders} filled in. */
export const fill = (s, vars = {}) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

// ---------------------------------------------------------------- pure helpers (tested in node)
/** What a timer shows at server time t (the same sums as services/dash.js timerView). */
export function timerView(st, t) {
  const elapsed = Math.max(0, (st.base || 0) + (st.on ? t - st.start : 0));
  if (st.mode !== 'down') return { elapsed, left: null, done: false };
  const left = Math.max(0, st.dur - elapsed);
  return { elapsed: Math.min(elapsed, st.dur), left, done: left === 0 };
}
/** The server's clock minus this one, from one /live round trip (sent and got are this clock). */
export const skewOf = (serverNow, sent, got) => serverNow - (sent + got) / 2;
/** ms -> "4:05" or "1:02:03" (whole seconds, rounded up for countdowns so 0:00 means done). */
export function mmss(ms, up = false) {
  const s = up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
/** Minutes since midnight in a time zone. */
export function minutesIn(tz, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60;
}
const toMin = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
/** The period now (index or -1), the next one (index or -1), and minutes left in the current one. */
export function periodAt(periods, min) {
  const cur = periods.findIndex(p => min >= toMin(p.start) && min < toMin(p.end));
  const next = periods.findIndex(p => toMin(p.start) > min);
  return { cur, next, left: cur >= 0 ? toMin(periods[cur].end) - min : 0 };
}
/** The answer buttons of a quick check: [{ icon, label }] in value order. words: the check widget's words. */
export function checkChoices(ch, words) {
  if (ch.kind === 'thumbs') return [{ icon: '👍', label: words.up }, { icon: '👍', rot: true, label: words.side }, { icon: '👎', label: words.down }];
  if (ch.kind === 'fist') return [0, 1, 2, 3, 4, 5].map(n => ({ icon: n === 0 ? '✊' : n === 5 ? '🖐️' : '', label: String(n) }));
  if (ch.kind === 'scale') return [1, 2, 3, 4, 5].map(n => ({ icon: '', label: String(n) }));
  return (ch.options || []).map((o, i) => ({ icon: String.fromCharCode(65 + i), label: o, typed: true }));
}
/** °C -> the unit the widget shows. auto: °F for US English, else °C. */
export const unitOf = (s, intl) => (s.unit === 'f' || s.unit === 'c' ? s.unit : /^en-US$/i.test(intl) ? 'f' : 'c');
export const temp = (c, unit) => (c == null || !Number.isFinite(c) ? '–' : `${Math.round(unit === 'f' ? c * 9 / 5 + 32 : c)}°`);
export const WEATHER_ICON = { clear: '☀️', clearNight: '🌙', partly: '⛅', cloudy: '☁️', fog: '🌫️', drizzle: '🌦️', rain: '🌧️', snow: '❄️', storm: '⛈️' };

// ---------------------------------------------------------------- stage 1
function clock(body, s, ctx) {
  const timeFmt = new Intl.DateTimeFormat(ctx.intl, { hour: 'numeric', minute: '2-digit', ...(s.seconds ? { second: '2-digit' } : {}), hour12: !!s.hour12 });
  const dateFmt = new Intl.DateTimeFormat(ctx.intl, { weekday: 'long', month: 'long', day: 'numeric' });
  body.classList.add('dw-clock');
  let draw;
  if (s.face === 'analog') {
    const svg = svgEl('svg', { viewBox: '0 0 100 100', class: 'dw-analog', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('circle', { cx: 50, cy: 50, r: 46, class: 'dw-face' }));
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; svg.appendChild(svgEl('line', { x1: 50 + 38 * Math.sin(a), y1: 50 - 38 * Math.cos(a), x2: 50 + 43 * Math.sin(a), y2: 50 - 43 * Math.cos(a), class: 'dw-tick' })); }
    const hand = (cls, len) => { const l = svgEl('line', { x1: 50, y1: 50, x2: 50, y2: 50 - len, class: cls }); svg.appendChild(l); return l; };
    const hh = hand('dw-hh', 24), mh = hand('dw-mh', 36), sh = s.seconds ? hand('dw-sh', 38) : null;
    svg.appendChild(svgEl('circle', { cx: 50, cy: 50, r: 3, class: 'dw-pin' }));
    body.appendChild(svg);
    const label = el('span', 'sr-only');
    body.appendChild(label);
    draw = d => {
      const m = d.getMinutes() + d.getSeconds() / 60, h = (d.getHours() % 12) + m / 60;
      hh.setAttribute('transform', `rotate(${h * 30} 50 50)`); mh.setAttribute('transform', `rotate(${m * 6} 50 50)`);
      if (sh) sh.setAttribute('transform', `rotate(${d.getSeconds() * 6} 50 50)`);
      label.textContent = timeFmt.format(d);
    };
  } else {
    const time = el('div', 'dw-time');
    body.appendChild(time);
    draw = d => { time.textContent = timeFmt.format(d); };
  }
  const date = s.date ? body.appendChild(el('div', 'dw-date')) : null;
  // A second time zone (stage 2): the city's name and its time, under the main clock.
  let zone = null;
  if (s.zone2) {
    try {
      const f = new Intl.DateTimeFormat(ctx.intl, { hour: 'numeric', minute: '2-digit', hour12: !!s.hour12, timeZone: s.zone2 });
      const row = body.appendChild(el('div', 'dw-zone2'));
      row.appendChild(typed('span', 'dw-zcity', s.zone2.split('/').pop().replace(/_/g, ' ')));
      const tm = row.appendChild(el('b', 'dw-ztime'));
      zone = d => { tm.textContent = f.format(d); };
    } catch { zone = null; }
  }
  const tick = d => { draw(d); if (date) date.textContent = dateFmt.format(d); if (zone) zone(d); };
  tick(new Date());
  return { tick };
}

function text(body, s, ctx) {
  body.classList.add('dw-text');
  if (s.title) body.appendChild(typed('div', 'dw-title', s.title));
  const lines = String(s.body || '').split('\n').map(x => x.trim());
  if (!lines.some(Boolean)) { body.appendChild(el('p', 'dw-empty', ctx.role === 'teacher' ? ctx.type.words.empty : '')); return null; }
  if (s.style === 'list') {
    const ol = el('ol', 'dw-list dw-scroll'); ol.dir = 'auto';
    for (const line of lines.filter(Boolean)) ol.appendChild(typed('li', null, line.replace(/^[-*•]\s*/, '')));
    body.appendChild(ol);
  } else body.appendChild(typed('p', 'dw-para dw-scroll', lines.join('\n')));
  return null;
}

function ican(body, s, ctx) {
  body.classList.add('dw-ican');
  body.appendChild(el('div', 'dw-lead', ctx.type.words.lead));
  if (s.goal) body.appendChild(typed('div', 'dw-goal dw-scroll', s.goal));
  // The teacher's goal pinned on a student's screen: the student can't edit it, so no "add a goal" hint (as for text).
  else body.appendChild(el('p', 'dw-empty', ctx.pinned ? '' : ctx.type.words.empty));
  return null;
}

// ---------------------------------------------------------------- timers
// The teacher's timer (and the same timer pinned on student screens) is a start time and a duration kept on the
// server; every screen works out what is left from the server's clock (ctx.now), so they all agree. A student's own
// timer is kept in their browser only.
let chimeCtx = null;
/** A soft two-note chime (off unless the teacher turns it on). */
function chime() {
  try {
    chimeCtx = chimeCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = chimeCtx.currentTime;
    for (const [f, at] of [[659, 0], [880, 0.28]]) {
      const o = chimeCtx.createOscillator(), g = chimeCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(0.12, t0 + at + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.9);
      o.connect(g).connect(chimeCtx.destination); o.start(t0 + at); o.stop(t0 + at + 1);
    }
  } catch { /* no sound: fine */ }
}
const localTimers = new Map();   // a student's own timers (their browser only)
const RING = 2 * Math.PI * 44;
// The timer and the stopwatch are one widget (docs/decisions.md "Timer and stopwatch combined"): s.mode 'timer'
// counts down, 'stopwatch' counts up. Whoever controls it switches with the two buttons at the top; a switch drops
// the run it had (the server does the same when the layout is saved), so nothing carries over from the other mode.
const MODE_ICONS = { timer: '⏳', stopwatch: '⏱️' };
function timer(body, s, ctx) {
  const W = ctx.type.words;
  const down = s.mode !== 'stopwatch', mode = down ? 'down' : 'up';
  const control = ctx.teacher || ctx.own;
  const fresh = () => ({ mode, dur: (s.minutes || 5) * 60e3, base: 0, start: 0, on: false });
  const state = () => {
    if (ctx.own) { const mine = localTimers.get(ctx.id); if (!mine || mine.mode !== mode) localTimers.set(ctx.id, fresh()); return localTimers.get(ctx.id); }
    const st = (ctx.live().timers || {})[ctx.id];
    return st && st.mode === mode ? st : fresh();
  };
  const clockNow = () => (ctx.own ? Date.now() : ctx.now());
  body.classList.add('dw-timer', `dw-timer-${s.mode === 'stopwatch' ? 'stopwatch' : 'timer'}`);
  if (control) {
    const f = ctx.type.settings.find(x => x.key === 'mode');
    const modes = el('div', 'dw-modes'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', W.mode);
    for (const m of f.options) {
      const b = btn('', 'btn btn-sm dw-mode');
      const ic = el('span', 'dw-modeicon', MODE_ICONS[m]); ic.setAttribute('aria-hidden', 'true');
      b.append(ic, el('span', 'dw-modetext', f.labels[m]));
      b.title = m === 'stopwatch' ? W.toStopwatch : W.toTimer;
      b.setAttribute('aria-pressed', String(m === (down ? 'timer' : 'stopwatch')));
      b.addEventListener('click', async () => {
        if (m === (down ? 'timer' : 'stopwatch')) return;
        if (ctx.own) localTimers.delete(ctx.id);
        else { const live = ctx.live(); if (live.timers) { const { [ctx.id]: gone, ...rest } = live.timers; live.timers = rest; } }
        ctx.set('mode', m);
        ctx.say(m === 'stopwatch' ? W.toStopwatch : W.toTimer);
        await ctx.flush();
      });
      modes.appendChild(b);
    }
    body.appendChild(modes);
  }
  const main = body.appendChild(el('div', 'dw-tmain'));
  const digits = el('div', 'dw-digits'); digits.setAttribute('role', 'timer');
  const doneMsg = el('div', 'dw-done', W.done || ''); doneMsg.hidden = true; doneMsg.setAttribute('role', 'status');
  const ringView = down && s.view === 'ring';
  const bar = down && s.bar && !ringView ? el('div', 'dw-bar') : null;
  const barFill = bar ? bar.appendChild(el('span', 'dw-barfill')) : null;
  if (bar) bar.setAttribute('aria-hidden', 'true');
  // The visual timer: a ring that shrinks as time runs out, the digits inside it.
  let arc = null;
  if (ringView) {
    const wrap = el('div', 'dw-ring');
    const svg = svgEl('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('circle', { cx: 50, cy: 50, r: 44, class: 'dw-ringbg' }));
    arc = svgEl('circle', { cx: 50, cy: 50, r: 44, class: 'dw-ringfg', 'stroke-dasharray': RING, transform: 'rotate(-90 50 50)' });
    svg.appendChild(arc);
    wrap.append(svg, digits);
    main.append(wrap, doneMsg);
  } else main.append(digits, doneMsg);
  if (bar) main.appendChild(bar);
  let go = null;
  if (control) {
    if (down) {
      const pre = el('div', 'dw-presets'); pre.setAttribute('role', 'group'); pre.setAttribute('aria-label', W.presets);
      for (const m of [1, 2, 5, 10]) { const b = btn(`${m}`, 'btn btn-sm dw-pre', fill(W.mins, { n: m })); b.addEventListener('click', () => act('set', m * 60e3)); pre.appendChild(b); }
      const cb = btn(W.custom, 'btn btn-sm dw-pre'); cb.setAttribute('aria-expanded', 'false');
      pre.appendChild(cb);
      main.appendChild(pre);
      const custom = el('form', 'dw-custom'); custom.hidden = true;
      const mid = `dw-${ctx.id}-m`, sid = `dw-${ctx.id}-s`;
      const lm = el('label', null, W.min); lm.htmlFor = mid;
      const im = el('input', 'input'); Object.assign(im, { id: mid, type: 'number', inputMode: 'numeric', min: 0, max: 180, value: s.minutes || 5 });
      const ls = el('label', null, W.sec); ls.htmlFor = sid;
      const is = el('input', 'input'); Object.assign(is, { id: sid, type: 'number', inputMode: 'numeric', min: 0, max: 59, value: 0 });
      const setB = el('button', 'btn btn-sm btn-primary', W.set); setB.type = 'submit';
      custom.append(lm, im, ls, is, setB);
      custom.addEventListener('submit', e => {
        e.preventDefault();
        const ms = (Math.max(0, +im.value || 0) * 60 + Math.max(0, Math.min(59, +is.value || 0))) * 1000;
        if (ms >= 1000) { act('set', Math.min(ms, 3 * 3600e3)); custom.hidden = true; cb.setAttribute('aria-expanded', 'false'); cb.focus(); }
      });
      cb.addEventListener('click', () => { custom.hidden = !custom.hidden; cb.setAttribute('aria-expanded', String(!custom.hidden)); if (!custom.hidden) im.focus(); });
      main.appendChild(custom);
    }
    const row = el('div', 'dw-row dw-foot');
    go = btn(W.start, 'btn btn-primary dw-go');
    const reset = btn(W.reset, 'btn dw-reset');
    go.addEventListener('click', () => act(state().on ? 'pause' : 'start'));
    reset.addEventListener('click', () => act('reset'));
    row.append(go, reset);
    main.appendChild(row);
  }
  async function act(action, ms) {
    if (ctx.own) {
      const st = state(), t = Date.now(), v = timerView(st, t);
      if (action === 'start' && !st.on) { if (down && v.done) st.base = 0; st.start = t; st.on = true; }
      else if (action === 'pause' && st.on) { st.base = v.elapsed; st.on = false; }
      else if (action === 'reset') Object.assign(st, { base: 0, on: false, start: 0 });
      else if (action === 'set') Object.assign(st, { dur: ms, base: 0, on: false, start: 0 });
      draw(); return;
    }
    await ctx.flush();
    const r = await ctx.act(`/timers/${encodeURIComponent(ctx.id)}`, { action, ms });
    if (r && r.timer) { const live = ctx.live(); live.timers = { ...(live.timers || {}), [ctx.id]: r.timer }; draw(); }
  }
  let rang = '';
  function draw() {
    const st = state(), v = timerView(st, clockNow());
    const ms = down ? v.left : v.elapsed;
    digits.textContent = mmss(ms, !down);
    digits.setAttribute('aria-label', down ? fill(W.left, { time: mmss(ms) }) : mmss(ms, true));
    if (barFill) barFill.style.inlineSize = `${st.dur ? (100 * v.left) / st.dur : 0}%`;
    if (arc) arc.setAttribute('stroke-dashoffset', String(RING * (1 - (st.dur ? v.left / st.dur : 0))));
    body.classList.toggle('is-running', !!st.on);
    const done = down && v.done && (st.on || st.base > 0);
    body.classList.toggle('is-done', done);
    doneMsg.hidden = !done;
    if (go) go.textContent = st.on ? W.pause : st.base > 0 && !v.done ? W.resume : W.start;
    const key = `${st.start}:${st.dur}`;
    if (done && st.on && rang !== key) { rang = key; if (s.chime && control) chime(); if (control) ctx.say(W.done); }
  }
  draw();
  return { tick: draw, live: draw };
}

// ---------------------------------------------------------------- the day's schedule (the school's time zone)
function schedule(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-sched');
  const periods = s.periods || [];
  if (!periods.length) { body.appendChild(el('p', 'dw-empty', ctx.role === 'teacher' ? W.empty : '')); return null; }
  const fmt = new Intl.DateTimeFormat(ctx.intl, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const at = hhmm => { const [h, m] = hhmm.split(':').map(Number); return fmt.format(Date.UTC(2020, 0, 1, h, m)); };
  if (s.view === 'nownext') return nowNext(body, periods, at, ctx);
  const status = el('div', 'dw-sched-now'); status.setAttribute('aria-live', 'polite'); status.dir = 'auto';
  const ol = el('ol', 'dw-periods dw-scroll');
  const rows = periods.map(p => {
    const li = el('li', 'dw-period');
    const tm = el('span', 'dw-ptime', `${at(p.start)}–${at(p.end)}`); tm.dir = 'ltr';
    li.append(tm, typed('span', 'dw-pname', p.name || '…'));
    ol.appendChild(li); return li;
  });
  body.append(status, ol);
  let last = '';
  const tick = () => {
    const now = minutesIn(ctx.tz || 'America/New_York');
    const r = periodAt(periods, now);
    rows.forEach((li, i) => {
      li.classList.toggle('is-now', i === r.cur); li.classList.toggle('is-past', toMin(periods[i].end) <= now);
      if (i === r.cur) li.setAttribute('aria-current', 'time'); else li.removeAttribute('aria-current');
    });
    let msg;
    if (r.cur >= 0) msg = `${W.now}: ${periods[r.cur].name || '…'} · ${fill(W.left, { n: Math.ceil(r.left) })}`;
    else if (r.next >= 0) msg = `${r.next === 0 ? W.before : W.next}: ${periods[r.next].name || '…'} · ${at(periods[r.next].start)}`;
    else msg = W.after;
    // The period on now (or the next one) in view when the list is longer than the widget: the list rests on that row
    // (snapRows in public/js/dash.js scrolls to it and cuts the list at whole rows from there; the rows above fade).
    // Set before the text changes, so the cut that the change sets off already rests on it.
    // After the last period, the end of the day.
    ol.snapTo = rows[r.cur >= 0 ? r.cur : r.next >= 0 ? r.next : rows.length - 1] || null;
    if (msg !== last) { last = msg; status.textContent = msg; }
  };
  tick();
  return { tick };
}

/** Stage 5: the schedule as two big cards, "Now" and "Next". */
function nowNext(body, periods, at, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-nownext', 'dw5');
  const card = cls => { const c = el('section', `dw5-nn ${cls}`); const h = el('span', 'dw5-nnlab'); const n = el('b', 'dw5-nnname'); n.dir = 'auto'; const m = el('span', 'dw5-nnmeta'); c.append(h, n, m); body.appendChild(c); return { c, h, n, m }; };
  const a = card('is-now'), b = card('is-next');
  a.c.setAttribute('aria-live', 'polite');
  let last = '';
  const tick = () => {
    const now = minutesIn(ctx.tz || 'America/New_York'), r = periodAt(periods, now);
    const nextI = r.cur >= 0 ? (r.cur + 1 < periods.length ? r.cur + 1 : -1) : r.next;
    // (Each second, too, while the text is more than the widget holds: a step the frames below missed.)
    const key = `${r.cur}:${nextI}:${Math.ceil(r.left)}`; if (key === last) { if (over()) shrink(); return; } last = key;
    // The next period starts as this one ends: its start time says nothing "minutes left" does not, so the card leaves it
    // out (public/css/dash.css) and both cards fit a short widget.
    b.c.classList.toggle('is-follows', r.cur >= 0 && nextI >= 0 && periods[nextI].start === periods[r.cur].end);
    // Only a period on now is lit as "now". Before school (or in a gap) the card says what comes first and when; after
    // the last period it is a calm end of the day, with no "Now" over it.
    a.c.classList.toggle('is-now', r.cur >= 0); a.c.classList.toggle('is-done', r.cur < 0 && r.next < 0);
    a.h.hidden = r.cur < 0 && r.next < 0;
    a.h.textContent = r.cur >= 0 ? W.now : r.next >= 0 ? (r.next === 0 ? W.before : W.next) : '';
    if (r.cur >= 0) { a.n.textContent = periods[r.cur].name || '…'; a.m.textContent = fill(W.left, { n: Math.ceil(r.left) }); }
    else if (r.next >= 0) { a.n.textContent = periods[r.next].name || '…'; a.m.textContent = fill(W.starts, { time: at(periods[r.next].start) }); }
    else { a.n.textContent = W.after; a.m.textContent = ''; }
    b.c.hidden = r.cur < 0;
    b.h.textContent = W.next;
    if (nextI >= 0) { b.n.textContent = periods[nextI].name || '…'; b.m.textContent = fill(W.starts, { time: at(periods[nextI].start) }); }
    else { b.n.textContent = W.nothingNext; b.m.textContent = ''; }
    refit();
  };
  // The cards hold their whole text, never cut. When it is more than the widget holds (long names in a small widget),
  // the names get smaller in steps (90% down to 60%, never under 13px: public/css/dash.css --nnk); if that is not
  // enough, the "next" card steps aside and "now" keeps the widget. One step a frame and only ever down, until the text
  // or the widget's size changes: the type follows the widget's size (container units) a frame late, so a size read
  // straight after a change can be stale, and stepping down only never swings back and forth.
  const over = () => body.isConnected && body.scrollHeight > body.clientHeight + 1;
  let step = 0, frame = 0;
  const apply = () => { body.style.setProperty('--nnk', String(Math.max(6, 10 - step) / 10)); b.c.classList.toggle('is-out', step > 4); };
  const shrink = () => { if (step > 4 || b.c.hidden && step > 3) return; step++; apply(); later(); };
  const later = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (over()) shrink(); }); };
  const refit = () => { step = 0; apply(); later(); };
  let size = '';
  const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const z = `${body.clientWidth}x${body.clientHeight}`; if (z !== size) { size = z; refit(); } }) : null;
  watch?.observe(body);
  document.fonts?.ready.then(refit);
  tick();
  return { tick, destroy: () => { watch?.disconnect(); cancelAnimationFrame(frame); } };
}

// ---------------------------------------------------------------- weather (from the server, never the browser's place)
function weather(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-weather');
  if (!s.place) { body.appendChild(el('p', 'dw-empty', ctx.role === 'teacher' ? W.empty : '')); return null; }
  const key = `${Number(s.place.lat).toFixed(2)},${Number(s.place.lon).toFixed(2)}`;
  const unit = unitOf(s, ctx.intl);
  let shown = '';
  const draw = live => {
    const d = ((live || ctx.live()).weather || {})[key] || { loading: true };
    const sig = JSON.stringify(d) + unit;
    if (sig === shown) return; shown = sig;
    body.textContent = '';
    if (d.loading || d.resting) {
      const p = el('div', 'dw-wrest');
      const msg = el('span', null, d.resting ? W.resting : W.loading); msg.setAttribute('role', 'status');
      p.append(el('span', 'dw-wicon', d.resting ? '😴' : '⏳'), msg);
      p.firstChild.setAttribute('aria-hidden', 'true');
      body.append(p, typed('div', 'dw-wplace small muted', s.place.name));
      return;
    }
    const main = el('div', 'dw-wmain');
    const icon = el('span', 'dw-wicon', WEATHER_ICON[d.group] || '☁️'); icon.setAttribute('aria-hidden', 'true');
    main.append(icon, el('span', 'dw-wtemp', `${temp(d.t, unit)}${unit === 'f' ? 'F' : 'C'}`));
    const side = el('div', 'dw-wside');
    side.append(el('div', 'dw-wwords', W[d.group] || ''), el('div', 'dw-whl', fill(W.hiLo, { hi: temp(d.hi, unit), lo: temp(d.lo, unit) })), typed('div', 'dw-wplace small muted', s.place.name));
    const box = el('div', 'dw-wbox');   // inside the widget body, so the size rules (container queries) apply to it
    box.append(main, side);
    body.appendChild(box);
  };
  draw();
  return { live: draw };
}

// ---------------------------------------------------------------- QR code (allowed targets only; made on the server)
const qrCache = new Map();
/** Forget every code (a link was added or removed here): the next draw asks the server again. */
export const qrForget = () => qrCache.clear();
function qr(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-qr');
  if (!s.target) { body.appendChild(el('p', 'dw-empty', W.empty)); return null; }
  const key = `${s.target.kind}:${s.target.ref}`;
  let shown;
  const show = r => {
    const was = shown; shown = r ? r.svg : r === false ? false : null;
    if (was !== undefined && was === shown) return;
    body.textContent = '';
    if (r === false) { body.appendChild(el('p', 'dw-empty', W.tooLong)); return; }
    if (!r) { body.appendChild(el('p', 'dw-empty', W.gone)); return; }
    const box = el('div', 'dw-qrbox');
    box.innerHTML = r.svg;   // our own server's SVG (services/qr.js), built from an allowed address only
    const link = el('div', 'dw-qrtext', r.text); link.dir = 'ltr';
    if (r.title) body.append(box, typed('div', 'dw-qrtitle', r.title), link); else body.append(box, link);
  };
  // 422: the address is too long for a code (false); anything else: not allowed any more (null).
  const load = () => ctx.get(`/qr?kind=${encodeURIComponent(s.target.kind)}&ref=${encodeURIComponent(s.target.ref || '')}`)
    .then(r => { qrCache.set(key, { r, until: Date.now() + 60e3 }); show(r); })
    .catch(e => { const r = e && e.status === 422 ? false : null; qrCache.set(key, { r, until: Date.now() + (r === false ? 60e3 : 15e3) }); show(r); });
  const hit = qrCache.get(key);
  if (hit && hit.until > Date.now()) show(hit.r);
  else { body.appendChild(el('p', 'dw-empty', '…')); load(); }
  // Checked again each minute, so a link removed on another screen takes its code away here too.
  let next = Date.now() + 60e3;
  return { tick() { if (Date.now() < next || !body.isConnected) return; next = Date.now() + 60e3; const h = qrCache.get(key); if (h && h.until > Date.now()) show(h.r); else load(); } };
}

// ---------------------------------------------------------------- the random student picker (teacher only)
// Names are the students' Oomba names (what the class already sees), never their real names. The pick is made on the
// server; the shuffle is only for fun and is skipped with reduced motion.
function picker(body, s, ctx) {
  const W = ctx.type.words;
  const wheelMode = s.mode === 'wheel', own = wheelMode && s.source === 'items';
  const items = own ? String(s.items || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 40) : [];
  body.classList.add('dw-picker');
  if (wheelMode) body.classList.add('dw-wheelmode');
  // The big readout: the name under the pointer while the wheel turns, then the winner (always the full name).
  const name = el('div', 'dw-pickname', wheelMode ? '' : '🎲'); name.setAttribute('aria-live', 'polite'); name.dir = 'auto';
  let wheel = null, rot = 0, spinning = false, raf = 0;
  const wrap = el('div', 'dw-pickwrap');   // inside the body, so the widget's size rules (container queries) reach it
  if (wheelMode) { wheel = el('div', 'dw-wheel'); wheel.setAttribute('aria-hidden', 'true'); wrap.appendChild(wheel); }
  const side = el('div', 'dw-pickside');
  const left = el('div', 'dw-pickleft');
  const row = el('div', 'dw-row dw-foot');
  const go = btn(wheelMode ? `🎡 ${W.spin}` : `🎲 ${W.pick}`, 'btn btn-primary'), away = btn(W.away), reset = btn(W.reset);
  row.append(go);
  if (!own) row.append(away);
  row.append(reset);
  side.append(name, left, row);
  wrap.appendChild(side);
  body.appendChild(wrap);
  let view = null, timer = 0;
  const ownState = localPicks.get(ctx.id) || { picked: [] }; localPicks.set(ctx.id, ownState);
  /** What the wheel shows: the class's Oomba names (away students left out) or the teacher's items, and with "no
   *  repeats" only those not picked yet this round, so the wheel gets easier to read as the round goes on. */
  const entries = () => {
    if (own) { const fresh = items.filter((x, i) => !s.norepeat || !ownState.picked.includes(i)); return fresh.length ? fresh : items; }
    if (!view) return [];
    const here = view.students.filter(k => !view.away.includes(k.id));
    const fresh = s.norepeat ? here.filter(k => !view.picked.includes(k.id)) : here;
    return (fresh.length ? fresh : here).map(k => k.name);
  };
  let shown = [];
  const drawWheel = () => {
    if (!wheel || spinning) return;
    shown = entries();
    wheel.textContent = '';
    if (!shown.length) return;
    const px = Math.min(wheel.clientWidth, wheel.clientHeight) || 0;
    const plan = wheelPlan(shown, px, ctx.private());
    const colors = sliceColors(shown.length);
    const svg = svgEl('svg', { viewBox: '-50 -50 100 100', class: 'dw-wheelsvg' });
    const g = svgEl('g', { class: 'dw-wheelrot' }); g.style.transform = `rotate(${rot}deg)`;
    const seg = 360 / shown.length;
    shown.forEach((label, i) => {
      const a0 = (i * seg - 90) * Math.PI / 180, a1 = ((i + 1) * seg - 90) * Math.PI / 180;
      const big = seg > 180 ? 1 : 0;
      const d = shown.length === 1 ? 'M0 -48 A48 48 0 1 1 -0.01 -48 Z' : `M0 0 L${48 * Math.cos(a0)} ${48 * Math.sin(a0)} A48 48 0 ${big} 1 ${48 * Math.cos(a1)} ${48 * Math.sin(a1)} Z`;
      g.appendChild(svgEl('path', { d, class: `dw-seg dw-seg${colors[i]}` }));
      const mid = (i + 0.5) * seg - 90;
      // Where the text points once the wheel is turned: on the left half it would read upside down, so it turns round
      // and is anchored from the other end.
      const flip = labelFlips(mid + rot);
      if (plan.names) {
        const tx = svgEl('text', { x: flip ? -9 : 9, y: 0, transform: `rotate(${flip ? mid + 180 : mid})`, 'text-anchor': flip ? 'end' : 'start', class: 'dw-segtext', 'font-size': plan.units[i] });
        tx.textContent = sliceLabel(label);
        g.appendChild(tx);
      } else {
        // Too many to read: a number at the rim (the readout below says the name).
        const tx = svgEl('text', { x: flip ? -42 : 42, y: 0, transform: `rotate(${flip ? mid + 180 : mid})`, 'text-anchor': 'middle', class: 'dw-segtext dw-segnum', 'font-size': plan.numberUnits });
        tx.textContent = String(i + 1);
        g.appendChild(tx);
      }
    });
    svg.appendChild(g);
    svg.appendChild(svgEl('path', { d: 'M-4.5 -50 L4.5 -50 L0 -40 Z', class: 'dw-pointer' }));
    svg.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 5, class: 'dw-hub' }));
    wheel.appendChild(svg);
  };
  const sized = typeof ResizeObserver === 'function' && wheel ? new ResizeObserver(() => drawWheel()) : null;
  if (sized) sized.observe(wheel);
  const showLeft = () => {
    if (own) { left.textContent = items.length ? fill(W.left, { n: entries().length }) : W.noItems; go.disabled = !items.length; drawWheel(); return; }
    if (!view) return;
    const here = view.students.filter(k => !view.away.includes(k.id));
    const n = s.norepeat ? here.filter(k => !view.picked.includes(k.id)).length || here.length : here.length;
    left.textContent = here.length ? fill(W.left, { n }) : W.none;
    go.disabled = !here.length;
    drawWheel();
  };
  const load = () => (own ? Promise.resolve(showLeft()) : ctx.get('/picker').then(v => { view = v; showLeft(); }).catch(() => {}));
  load();
  /** Turn the wheel so the picked entry stops under the pointer, the readout ticking through the names it passes (at
   *  once with reduced motion). */
  const spinTo = (index, done) => {
    const seg = 360 / shown.length;
    const g = wheel && wheel.querySelector('.dw-wheelrot');
    if (!g || ctx.reduced()) { rot = -(index + 0.5) * seg; drawWheel(); done(); return; }
    const base = Math.ceil(rot / 360) * 360 + 360 * 4;
    rot = base - (index + 0.5) * seg + (Math.random() - 0.5) * seg * 0.6;
    spinning = true;
    g.style.transition = 'transform 3.2s cubic-bezier(.17,.67,.21,1)';
    requestAnimationFrame(() => { g.style.transform = `rotate(${rot}deg)`; });
    const tick = () => {
      const m = getComputedStyle(g).transform;
      const mm = /matrix\(([^,]+),\s*([^,]+)/.exec(m);
      if (mm) { const deg = Math.atan2(+mm[2], +mm[1]) * 180 / Math.PI; const i = underPointer(deg, shown.length); if (shown[i] && name.textContent !== shown[i]) name.textContent = shown[i]; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    timer = setTimeout(() => { cancelAnimationFrame(raf); spinning = false; done(); }, 3300);
  };
  go.addEventListener('click', async () => {
    go.disabled = true;
    name.classList.remove('is-picked');
    try {
      let pickName, index;
      if (own) {
        // Teacher-typed items: picked here (no student data involved).
        let pool = items.map((x, i) => i).filter(i => !s.norepeat || !ownState.picked.includes(i));
        if (!pool.length) { ownState.picked = []; pool = items.map((x, i) => i); drawWheel(); }
        const k = pool[crypto.getRandomValues(new Uint32Array(1))[0] % pool.length];
        pickName = items[k]; index = shown.indexOf(pickName);
        ownState.picked.push(k);
      } else {
        const before = shown.slice();
        const r = await ctx.act('/picker', { action: 'pick', norepeat: !!s.norepeat });
        if (!r || !r.pick) { go.disabled = false; return; }
        view = r; pickName = r.pick.name; index = before.indexOf(pickName);
        if (wheelMode && index < 0) { drawWheel(); index = shown.indexOf(pickName); }   // a new round began
      }
      const land = () => { name.removeAttribute('aria-busy'); name.textContent = pickName; name.classList.add('is-picked'); go.disabled = false; showLeft(); if (!wheelMode) go.textContent = `🎲 ${W.again}`; };
      name.setAttribute('aria-busy', 'true');
      if (wheelMode) { spinTo(Math.max(0, index), land); return; }
      const names = view.students.map(k => k.name);
      if (ctx.reduced() || names.length < 2) land();
      else {
        let i = 0, wait = 60;
        const spin = () => { name.textContent = names[Math.floor(Math.random() * names.length)]; i++; wait *= 1.18; if (i < 14) timer = setTimeout(spin, wait); else land(); };
        spin();
      }
    } catch { go.disabled = false; spinning = false; }
  });
  reset.addEventListener('click', async () => {
    if (own) { ownState.picked = []; name.textContent = ''; showLeft(); return; }
    const r = await ctx.act('/picker', { action: 'reset' });
    if (r) { view = r; name.textContent = wheelMode ? '' : '🎲'; name.classList.remove('is-picked'); go.textContent = wheelMode ? `🎡 ${W.spin}` : `🎲 ${W.pick}`; showLeft(); }
  });
  away.addEventListener('click', async () => {
    if (!view) await load();
    if (!view) return;
    const esc = ctx.esc;
    const sh = ctx.sheet({ title: W.awayTitle, content: `<p class="small muted">${esc(W.awayNote)}</p><ul class="plain dw-awaylist">${view.students.map(k => `<li><label class="dash-tog"><span dir="auto">${esc(k.name)}</span><input type="checkbox" data-away="${esc(k.id)}"${view.away.includes(k.id) ? ' checked' : ''}></label></li>`).join('') || `<li class="small muted">${esc(W.none)}</li>`}</ul>` });
    sh.el.addEventListener('change', async e => {
      const box = e.target.closest('[data-away]'); if (!box) return;
      const r = await ctx.act('/picker', { action: 'away', user: box.dataset.away, on: box.checked });
      if (r) { view = r; showLeft(); }
    });
  });
  return { destroy() { clearTimeout(timer); cancelAnimationFrame(raf); if (sized) sized.disconnect(); } };
}
const localPicks = new Map();
/** A wheel label pointing at this angle (degrees, 0 = to the right, clockwise) would read upside down. */
export const labelFlips = deg => { const a = ((deg % 360) + 360) % 360; return a > 90 && a < 270; };
/** A name on a slice: at most 16 characters (the readout under the wheel always shows the whole name). */
export const sliceLabel = label => (label.length > 16 ? `${label.slice(0, 15)}…` : label);
/** How many slice colours there are (public/css/dash.css .dw-seg0 … .dw-seg5). */
export const SLICE_COLOURS = 6;
/** A colour per slice where no two neighbours match, the last and the first included. */
export function sliceColors(n, k = SLICE_COLOURS) {
  const c = Array.from({ length: n }, (_, i) => i % k);
  if (n > 2 && c[n - 1] === c[0]) c[n - 1] = [1, 2, 3, 4, 5].map(x => (c[0] + x) % k).find(x => x !== c[n - 2] && x !== c[0]);
  return c;
}
/** Whether names fit on the slices of a wheel this many pixels wide: each name's size (viewBox units, the wheel is
 *  100 across) and its rendered size; names only when every one is at least 12px (13px on the projector), else
 *  numbers at the rim. */
export function wheelPlan(names, px, projector = false) {
  const n = Math.max(1, names.length), min = projector ? 13 : 12;
  const units = names.map(x => Math.min(7, 70 / n, 64 / Math.max(1, sliceLabel(x).length)));
  const smallest = Math.min(...units) * px / 100;
  return { names: names.length > 0 && px > 0 && smallest >= min, units, smallestPx: smallest, numberUnits: Math.max(3.2, Math.min(6, (2 * Math.PI * 42 / n) * 0.62)) };
}
/** The slice under the pointer (at the top) when the wheel is turned by deg degrees. */
export const underPointer = (deg, n) => Math.floor(((((-deg) % 360) + 360) % 360) / (360 / n)) % n;

// ---------------------------------------------------------------- help queue
// Students tap "I need help" or "I'm done" (no text). The teacher's widget shows the queue in order; on the projector
// (projector mode) the names are hidden and only the counts show. A student sees only their own place.
function help(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-help');
  if (ctx.role === 'student') {
    const row = el('div', 'dw-helpbtns dw-stick-top');
    const need = btn(`✋ ${W.need}`, 'btn dw-big'), done = btn(`✅ ${W.done}`, 'btn dw-big');
    const status = el('div', 'dw-helpme'); status.setAttribute('role', 'status');
    const cancel = btn(W.cancel, 'btn btn-sm');
    row.append(need, done);
    body.append(row, status, cancel);
    const draw = live => {
      const mine = ((live || ctx.live()).help || {}).mine || null;
      need.setAttribute('aria-pressed', String(!!(mine && mine.kind === 'help')));
      done.setAttribute('aria-pressed', String(!!(mine && mine.kind === 'done')));
      status.textContent = !mine ? '' : mine.kind === 'help' ? fill(W.place, { n: mine.place }) : W.doneMine;
      cancel.hidden = !mine;
    };
    const ask = async kind => { const r = await ctx.act('/help', { kind }); if (r) { ctx.live().help = { mine: r.mine }; draw(); ctx.say(status.textContent || W.cancel); } };
    need.addEventListener('click', () => ask('help'));
    done.addEventListener('click', () => ask('done'));
    cancel.addEventListener('click', () => ask('cancel'));
    draw();
    return { live: draw };
  }
  const counts = el('div', 'dw-helpcounts');
  const list = el('ol', 'dw-queue dw-private dw-scroll');
  const hidden = el('p', 'dw-public small muted', W.hidden);
  const row = el('div', 'dw-row dw-foot');
  const next = btn(`➡️ ${W.next}`, 'btn btn-primary'), clear = btn(W.clear);
  row.append(next, clear);
  body.append(counts, list, hidden, row);
  let sig = '';
  const draw = live => {
    const q = (((live || ctx.live()).help) || {}).queue || [];
    const s2 = JSON.stringify(q); if (s2 === sig) return; sig = s2;
    const waiting = q.filter(x => x.kind === 'help'), finished = q.filter(x => x.kind === 'done');
    counts.textContent = `✋ ${format(W.waiting, { n: waiting.length }, ctx.intl)} · ✅ ${format(W.finished, { n: finished.length }, ctx.intl)}`;
    list.textContent = '';
    if (!q.length) list.appendChild(el('li', 'dw-empty', W.empty));
    for (const x of [...waiting, ...finished]) {
      const li = el('li', `dw-qrow dw-q-${x.kind}`);
      const mark = el('span', 'dw-qmark', x.kind === 'help' ? '✋' : '✅'); mark.setAttribute('aria-hidden', 'true');
      li.append(mark, typed('span', 'dw-qname', x.name));
      const rm = btn('✖', 'btn btn-sm dw-qx', fill(W.remove, { name: x.name }));
      rm.addEventListener('click', () => teacherAct({ action: 'remove', user: x.id }));
      li.appendChild(rm); list.appendChild(li);
    }
    next.disabled = !waiting.length; clear.disabled = !q.length;
  };
  const teacherAct = async b => { const r = await ctx.act('/help/queue', b); if (r) { ctx.live().help = { queue: r.queue }; draw(); if (r.served && !ctx.private()) ctx.say(`${W.next}: ${r.served.name}`); } };
  next.addEventListener('click', () => teacherAct({ action: 'next' }));
  clear.addEventListener('click', () => teacherAct({ action: 'clear' }));
  draw();
  return { live: draw };
}

// ---------------------------------------------------------------- quick checks (teacher's widget: totals)
// The widget on the teacher's screen shows totals only, never names (the screen may be on the projector). Names are in
// a sheet the teacher opens, and that button is hidden in projector mode.
function check(body, s, ctx) {
  const W = ctx.type.words, esc = ctx.esc;
  body.classList.add('dw-check');
  const head = el('div', 'dw-checkhead');
  const bars = el('ul', 'dw-bars');
  // Every answer's total is always in view: the bars shrink with the widget (two columns for more than three
  // answers). Only a long list in the teacher's own (not projector) view may scroll.
  const metaRow = el('div', 'dw-checkmetarow');
  const meta = el('span', 'dw-checkmeta');
  const saved = btn(W.savedList, 'btn btn-sm dw-linkbtn dw-private');   // the teacher's list, not for the projector
  metaRow.append(meta, saved);
  const row = el('div', 'dw-row dw-foot');
  const add = btn(`➕ ${W.new}`, 'btn btn-sm btn-primary'), end = btn(W.end, 'btn btn-sm'), names = btn('👀', 'btn btn-sm dw-private', W.names), save = btn(W.save, 'btn btn-sm');
  names.appendChild(el('span', 'dw-btxt', ` ${W.names}`)); names.title = W.names;   // the words go on a narrow widget; the label stays
  row.append(add, end, names, save);
  const area = el('div', 'dw-checkarea');
  area.append(head, metaRow, bars);
  body.append(area, row);
  let cur = null, sig = '';
  const draw = live => {
    const L = live || ctx.live();
    cur = (L.checks || [])[0] || null;
    const s2 = JSON.stringify([cur, L.size]); if (s2 === sig) return; sig = s2;
    head.textContent = ''; bars.textContent = ''; meta.textContent = '';
    end.hidden = names.hidden = save.hidden = !cur;
    if (!cur) { head.appendChild(el('p', 'dw-empty', W.empty)); return; }
    head.append(el('span', 'dw-kindchip', W[cur.kind]), typed('b', 'dw-checkq', cur.q || ''));
    const ch = checkChoices(cur, W), max = Math.max(1, ...cur.tally);
    bars.classList.toggle('dw-bars-many', ch.length > 3);
    ch.forEach((c, i) => {
      const li = el('li', 'dw-barrow');
      const lab = el('span', 'dw-barlab'); if (c.icon) { const ic = lab.appendChild(el('span', c.rot ? 'dw-rot' : 'dw-ic', c.icon)); ic.setAttribute('aria-hidden', 'true'); }
      lab.appendChild(c.typed ? typed('span', null, c.label) : el('span', null, c.label));
      const track = el('span', 'dw-bartrack'); track.setAttribute('aria-hidden', 'true');
      track.appendChild(el('span', 'dw-barfill2')).style.inlineSize = `${(100 * cur.tally[i]) / max}%`;
      li.append(lab, track, el('b', 'dw-barn', String(cur.tally[i])));
      bars.appendChild(li);
    });
    meta.textContent = `${fill(W.answered, { n: cur.n, total: L.size ?? '–' })}${cur.open ? '' : ` · ${W.ended}`}`;
    end.disabled = !cur.open;
    save.textContent = cur.saved ? `✔ ${W.saved}` : W.save;
    save.setAttribute('aria-pressed', String(!!cur.saved));
  };
  add.addEventListener('click', () => composer());
  end.addEventListener('click', async () => { if (cur && await ctx.act(`/checks/${cur.id}/end`, {})) ctx.poll(); });
  save.addEventListener('click', async () => { if (cur && await ctx.act(`/checks/${cur.id}/save`, { saved: !cur.saved })) ctx.poll(); });
  names.addEventListener('click', async () => {
    if (!cur || ctx.private()) return;
    const r = await ctx.get(`/checks/${cur.id}/names`).catch(() => null); if (!r) return;
    const ch = checkChoices(cur, W);
    const group = (c, arr) => `<li class="dw-namegroup"><div class="dw-nghead">${c.icon ? `<span class="${c.rot ? 'dw-rot' : 'dw-ic'}" aria-hidden="true">${esc(c.icon)}</span>` : ''}<b${c.typed ? ' dir="auto"' : ''}>${esc(c.label)}</b><span class="dash-count">${arr.length}</span></div><div class="dw-namelist">${arr.map(n => `<span class="dw-name" dir="auto">${esc(n)}</span>`).join('') || `<span class="small muted">${esc(W.nobody)}</span>`}</div></li>`;
    ctx.sheet({ title: W.names, content: `<ul class="dw-names">${ch.map((c, i) => group(c, r.groups[i] || [])).join('')}${group({ label: W.notYet }, r.missing)}</ul>` });
  });
  saved.addEventListener('click', async () => {
    const r = await ctx.get('/checks/saved').catch(() => null); if (!r) return;
    const rowHtml = c => { const ch = checkChoices(c, W); return `<li class="dash-prow"><span class="grow"><b dir="auto">${esc(c.q || W[c.kind])}</b><span class="small muted">${esc(c.day)} · ${esc(fill(W.answered, { n: c.n, total: '–' }))}</span><span class="small">${ch.map((x, i) => `${esc(x.icon ? `${x.icon} ` : '')}${esc(x.label)}: <b>${c.tally[i]}</b>`).join(' · ')}</span></span></li>`; };
    ctx.sheet({ title: W.savedList, content: `<ul class="plain dash-plist">${r.checks.map(rowHtml).join('') || `<li class="small muted">${esc(W.savedNone)}</li>`}</ul>` });
  });
  function composer() {
    let kind = 'thumbs';
    const sh = ctx.sheet({ title: W.new, content: `<form class="stack dw-compose" novalidate>
      <fieldset class="dw-kinds"><legend>${esc(W.kind)}</legend>${['thumbs', 'fist', 'choice', 'scale'].map(k => `<label class="chip"><input type="radio" name="dw-kind" value="${k}"${k === kind ? ' checked' : ''}> ${esc(W[k])}</label>`).join('')}</fieldset>
      <div class="field"><label for="dw-q">${esc(W.question)}</label><input class="input" id="dw-q" maxlength="120" dir="auto" placeholder="${esc(W.questionHint)}"></div>
      <fieldset class="dw-opts" hidden><legend>${esc(W.options)}</legend><ol class="dw-optlist"></ol><button class="btn btn-sm" type="button" data-addopt>➕ ${esc(W.addOption)}</button></fieldset>
      <p class="err form-err" role="alert"></p><div class="row"><button class="btn btn-primary" type="submit">📤 ${esc(W.send)}</button></div></form>` });
    const f = sh.el.querySelector('form'), opts = f.querySelector('.dw-opts'), ol = f.querySelector('.dw-optlist');
    const addOpt = () => { const n = ol.children.length; if (n >= 6) return null; const li = document.createElement('li'); li.innerHTML = `<label class="sr-only" for="dw-o${n}">${esc(fill(W.option, { n: n + 1 }))}</label><input class="input" id="dw-o${n}" maxlength="60" dir="auto">`; ol.appendChild(li); return li.querySelector('input'); };
    addOpt(); addOpt();
    f.addEventListener('change', e => { if (e.target.name === 'dw-kind') { kind = e.target.value; opts.hidden = kind !== 'choice'; } });
    f.querySelector('[data-addopt]').addEventListener('click', () => addOpt()?.focus());
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const options = [...ol.querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean);
      if (kind === 'choice' && options.length < 2) { f.querySelector('.form-err').textContent = W.needOptions; return; }
      const r = await ctx.act('/checks', { kind, question: f.querySelector('#dw-q').value, options }, f.querySelector('.form-err'));
      if (r) { sh.close(); ctx.toast(r.toast); ctx.poll(); }
    });
  }
  draw();
  return { live: draw };
}

// ---------------------------------------------------------------- Oomba tiles
const tileCache = new Map();
function tiles(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-tiles');
  const list = s.tiles || [];
  if (!list.length) { body.appendChild(el('p', 'dw-empty', ctx.role === 'teacher' ? W.empty : '')); return null; }
  const refs = list.map(x => `${x.kind}:${x.ref}`).join(',');
  const show = got => {
    body.textContent = '';
    if (!got.length) { body.appendChild(el('p', 'dw-empty', W.gone)); return; }
    const ul = el('ul', 'dw-tilegrid dw-scroll');
    for (const x of got) {
      const li = el('li');
      const a = el(ctx.editing ? 'span' : 'a', 'dw-tile');
      if (!ctx.editing) a.href = x.href;
      const ic = el('span', 'dw-tileicon', x.icon); ic.setAttribute('aria-hidden', 'true');
      a.append(ic, typed('span', 'dw-tiletitle', x.title));
      li.appendChild(a); ul.appendChild(li);
    }
    body.appendChild(ul);
  };
  const hit = tileCache.get(refs);
  if (hit && hit.until > Date.now()) show(hit.got);
  else ctx.get(`/tiles?refs=${encodeURIComponent(refs)}`).then(r => { tileCache.set(refs, { got: r.tiles, until: Date.now() + 60e3 }); show(r.tiles); }).catch(() => show([]));
  return null;
}

// ================================================================ stage 2, second part
// Event countdown, calendar, work symbols, traffic light, dice, random number, group maker, scoreboard.
// Widgets the teacher changes with a tap (symbols, light, score) save through ctx.set(key, value): the
// layout saves, and a pinned one reaches student screens with the next /live check.

/** Today in a time zone as YYYY-MM-DD. */
export const todayIn = (tz, d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
/** The moment a wall-clock date and time happen in a time zone (ms). */
export function zonedEpoch(ymd, hhmm, tz) {
  const [y, m, d] = ymd.split('-').map(Number), [h, mi] = String(hhmm || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const offsetAt = t => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t; };
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);   // once more across a clock change
  return t;
}
/** ms left -> { days, hours, mins } (whole, rounded up to the minute). */
export function countdownParts(ms) {
  const m = Math.max(0, Math.ceil(ms / 60e3));
  return { days: Math.floor(m / 1440), hours: Math.floor((m % 1440) / 60), mins: m % 60 };
}
/** Random groups: by size (groups of about n) or by count (n groups); everyone in exactly one group, sizes differ by at
 *  most one. rand() -> [0, 1). */
export function makeGroups(names, by, n, rand = Math.random) {
  const list = [...names];
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  if (!list.length) return [];
  const k = Math.max(1, Math.min(list.length, by === 'count' ? n : Math.round(list.length / Math.max(1, n)) || 1));
  const groups = Array.from({ length: k }, () => []);
  list.forEach((x, i) => groups[i % k].push(x));
  return groups;
}
const rnd = n => (globalThis.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] % n : Math.floor(Math.random() * n));

/** Days from one YYYY-MM-DD to another (calendar days, whatever the clock). */
const utcDay = ymd => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const dayDiff = (a, b) => Math.round((utcDay(b) - utcDay(a)) / 864e5);
/** How long a past day stays on a card of several countdowns (greyed, at the end) before it drops off. */
export const PAST_DAYS = 7;
/** A countdown's events as its card shows them at time now in the school's time zone (docs/decisions.md "Several
 *  countdowns in one card"): only events with a day; upcoming and today's soonest first, then days gone by in the last
 *  PAST_DAYS (most recent first). If nothing is left, the latest day gone by alone, so a card of one keeps saying "That
 *  day has come and gone" as it always did. Each: { label, date, time, at (ms), state: 'coming'|'today'|'past', left
 *  (ms; 0 once reached), parts ({ days, hours, mins }; an event with no time counts whole days only: hours null) }.
 *  A countdown saved as one { label, date, time } is read as a list of one. */
export function countdownEvents(s, now, tz) {
  const list = Array.isArray(s && s.events) ? s.events : s && s.date ? [{ label: s.label || '', date: s.date, time: s.time || '' }] : [];
  const today = todayIn(tz, new Date(now));
  const all = list.filter(e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date)).map(e => {
    const at = zonedEpoch(e.date, e.time || '00:00', tz), d = dayDiff(today, e.date);
    const left = d < 0 ? 0 : e.time ? Math.max(0, at - now) : 0;
    const state = d < 0 ? 'past' : d === 0 ? 'today' : 'coming';
    const parts = e.time ? countdownParts(left) : { days: Math.max(0, d), hours: null, mins: null };
    return { label: e.label || '', date: e.date, time: e.time || '', at, state, left, parts, ago: -d };
  });
  const soon = all.filter(e => e.state !== 'past').sort((a, b) => a.at - b.at);
  const past = all.filter(e => e.state === 'past').sort((a, b) => b.at - a.at);
  const recent = past.filter(e => e.ago <= PAST_DAYS);
  return soon.length || recent.length ? [...soon, ...recent] : past.slice(0, 1);
}

function countdown(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-count');
  const tz = ctx.tz || 'America/New_York';
  const shown = () => countdownEvents(s, ctx.now(), tz);
  if (!shown().length) { body.appendChild(el('p', 'dw-empty', ctx.role === 'teacher' ? W.empty : '')); return null; }
  const put = (node, text) => { const x = String(text); if (node.textContent !== x) node.textContent = x; };
  let sig = '', draw = null;
  const one = () => {
    // One event: the big boxes, as the countdown has always looked.
    body.classList.remove('dw-countmany');
    const label = typed('div', 'dw-countlabel', '');
    const boxes = el('div', 'dw-countboxes');
    const part = key => { const b = el('div', 'dw-countbox'); const n = b.appendChild(el('b', 'dw-countn')); b.appendChild(el('span', 'dw-countu', W[key])); boxes.appendChild(b); return [b, n]; };
    const [, nd] = part('days'), [bh, nh] = part('hours'), [bm, nm] = part('mins');
    const msg = el('div', 'dw-countmsg'); msg.setAttribute('role', 'status');
    body.append(label, boxes, msg);
    return e => {
      put(label, e.label); label.hidden = !e.label;
      const timed = !!e.time;
      if (e.state === 'past' || (e.state === 'today' && !e.left)) { boxes.hidden = true; put(msg, e.state === 'past' ? W.past : W.today); return; }
      boxes.hidden = false; bh.hidden = bm.hidden = !timed;
      put(nd, e.parts.days); if (timed) { put(nh, e.parts.hours); put(nm, e.parts.mins); }
      put(msg, e.state === 'today' ? W.today : '');
    };
  };
  const many = list => {
    // Several: a list, soonest first; each row its label, its day and how long is left (days, or hours and minutes
    // once it is less than a day away). Days gone by are greyed at the end. The list scrolls by whole rows.
    body.classList.add('dw-countmany');
    const ol = el('ol', 'dw-countlist dw-scroll');
    const dayFmt = new Intl.DateTimeFormat(ctx.intl, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    const timeFmt = new Intl.DateTimeFormat(ctx.intl, { hour: 'numeric', minute: '2-digit', timeZone: tz });
    const rows = list.map(e => {
      const li = el('li', `dw-countrow is-${e.state}`);
      const what = li.appendChild(el('div', 'dw-countwhat'));
      if (e.label) what.appendChild(typed('span', 'dw-countname', e.label));
      // Under the label: its day (and time); "It's today!" on the day; a day gone by says so. With no label, the day leads.
      const day = dayFmt.format(utcDay(e.date)), word = e.state === 'today' ? W.today : e.state === 'past' ? W.past : '';
      what.appendChild(el('span', 'dw-countwhen', word ? (e.label ? word : `${day} · ${word}`) : `${day}${e.time ? ` · ${timeFmt.format(e.at)}` : ''}`));
      const val = li.appendChild(el('div', 'dw-countval'));
      const pair = key => { const p = el('span', 'dw-countpair'); const n = p.appendChild(el('b', 'dw-countn')); p.appendChild(el('span', 'dw-countu', W[key])); val.appendChild(p); return n; };
      const a = pair('days'), b = pair('hours');
      ol.appendChild(li);
      return x => {
        const done = x.state === 'past' || (x.state === 'today' && !x.left);
        val.hidden = done;
        if (done) return;
        const close = !!x.time && x.parts.days === 0;
        // Days (and hours when it has a time), or hours and minutes once it is less than a day away.
        put(a.nextSibling, close ? W.hours : W.days); put(b.nextSibling, close ? W.mins : W.hours);
        put(a, close ? x.parts.hours : x.parts.days); b.parentNode.hidden = !x.time; if (x.time) put(b, close ? x.parts.mins : x.parts.hours);
      };
    });
    body.appendChild(ol);
    return xs => xs.forEach((x, i) => rows[i](x));
  };
  const tick = () => {
    const list = shown();
    // Rebuilt only when what is listed changes (an event reached, a day gone by): the numbers change in place.
    const next = list.map(e => `${e.date}|${e.time}|${e.label}|${e.state}|${e.state === 'today' && !e.left}`).join('\n');
    if (next !== sig) { sig = next; body.textContent = ''; draw = list.length > 1 ? many(list) : list.length ? one() : null; if (!list.length) body.appendChild(el('p', 'dw-empty', '')); }
    if (draw) draw(list.length > 1 ? list : list[0]);
  };
  tick();
  return { tick };
}

function calendar(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-cal');
  const tz = ctx.tz || 'America/New_York';
  let shown = '';
  const draw = () => {
    const today = todayIn(tz, new Date(ctx.now()));
    if (today === shown) return; shown = today;
    body.textContent = '';
    const [y, m] = today.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let weekStart = /^en-US$/i.test(ctx.intl) || /^(he|ar|ja|zh|pt-BR)/i.test(ctx.intl) ? 0 : 1;
    try { const wi = new Intl.Locale(ctx.intl); const info = wi.getWeekInfo ? wi.getWeekInfo() : wi.weekInfo; if (info && info.firstDay) weekStart = info.firstDay % 7; } catch { /* keep */ }
    const title = el('div', 'dw-caltitle', new Intl.DateTimeFormat(ctx.intl, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first));
    const marks = new Map((s.marks || []).map(x => [x.date, x.label]));
    const grid = el('div', 'dw-calgrid'); grid.setAttribute('role', 'grid'); grid.setAttribute('aria-label', title.textContent);
    const wd = new Intl.DateTimeFormat(ctx.intl, { weekday: 'narrow', timeZone: 'UTC' });
    const head = el('div', 'dw-calrow'); head.setAttribute('role', 'row');
    for (let i = 0; i < 7; i++) { const c = el('span', 'dw-calwd', wd.format(new Date(Date.UTC(2023, 0, 1 + ((weekStart + i) % 7))))); c.setAttribute('role', 'columnheader'); head.appendChild(c); }
    grid.appendChild(head);
    const lead = (first.getUTCDay() - weekStart + 7) % 7;
    const long = new Intl.DateTimeFormat(ctx.intl, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
    let row = null;
    for (let i = 0; i < lead + days; i++) {
      if (i % 7 === 0) { row = el('div', 'dw-calrow'); row.setAttribute('role', 'row'); grid.appendChild(row); }
      const c = el('span', 'dw-calday'); c.setAttribute('role', 'gridcell');
      if (i >= lead) {
        const d = i - lead + 1, ymd = `${today.slice(0, 8)}${String(d).padStart(2, '0')}`;
        c.textContent = d;
        const label = [long.format(Date.UTC(y, m - 1, d))];
        if (ymd === today) { c.classList.add('is-today'); c.setAttribute('aria-current', 'date'); label.push(W.today); }
        if (marks.has(ymd)) { c.classList.add('is-marked'); label.push(marks.get(ymd)); }
        c.setAttribute('aria-label', label.join(' · '));
      }
      row.appendChild(c);
    }
    const coming = (s.marks || []).filter(x => x.date >= today).slice(0, 2);
    const list = el('ul', 'dw-calmarks');
    const short = new Intl.DateTimeFormat(ctx.intl, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    for (const x of coming) { const li = el('li'); const [yy, mm, dd] = x.date.split('-').map(Number); li.append(el('b', null, short.format(Date.UTC(yy, mm - 1, dd))), typed('span', null, x.label)); list.appendChild(li); }
    body.append(title, grid);
    if (coming.length) { body.appendChild(el('div', 'dw-calh small muted', W.coming)); body.appendChild(list); }
  };
  draw();
  return { tick: draw };
}

const SYMBOLS = { silent: '🤫', whisper: '🗣️', partner: '👥', together: '🧑‍🤝‍🧑', hand: '✋' };
function symbols(body, s, ctx) {
  const W = ctx.type.words, f = ctx.type.settings.find(x => x.key === 'mode');
  body.classList.add('dw-sym', `dw-sym-${s.mode}`);
  const big = el('div', 'dw-symbig'); big.setAttribute('role', 'status');
  const ic = el('span', 'dw-symicon', SYMBOLS[s.mode] || '🤫'); ic.setAttribute('aria-hidden', 'true');
  big.append(ic, el('span', 'dw-symlabel', f.labels[s.mode]));
  body.appendChild(big);
  if (ctx.teacher && !ctx.editing) {
    const row = el('div', 'dw-symrow dw-stick'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', W.change);
    for (const m of f.options) {
      const b = btn(SYMBOLS[m], 'btn btn-sm dw-symbtn', f.labels[m]); b.title = f.labels[m];
      b.setAttribute('aria-pressed', String(m === s.mode));
      b.addEventListener('click', () => { ctx.set('mode', m); ctx.say(f.labels[m]); });
      row.appendChild(b);
    }
    body.appendChild(row);
  }
  return null;
}

function light(body, s, ctx) {
  const W = ctx.type.words, f = ctx.type.settings.find(x => x.key === 'color');
  body.classList.add('dw-light');
  const lamp = el('div', 'dw-lamps'); lamp.setAttribute('aria-hidden', 'true');
  for (const c of f.options) lamp.appendChild(el('span', `dw-lamp dw-lamp-${c}${c === s.color ? ' is-on' : ''}`));
  const label = el('div', 'dw-lightlabel', s[s.color] || f.labels[s.color]); label.dir = 'auto'; label.setAttribute('role', 'status');
  label.setAttribute('aria-label', `${f.labels[s.color]}${s[s.color] ? `: ${s[s.color]}` : ''}`);
  body.append(lamp, label);
  if (ctx.teacher && !ctx.editing) {
    const row = el('div', 'dw-row dw-lightrow dw-stick'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', W.set);
    for (const c of f.options) {
      const b = btn(f.labels[c], `btn btn-sm dw-lightbtn dw-lightbtn-${c}`); b.setAttribute('aria-pressed', String(c === s.color));
      b.addEventListener('click', () => { ctx.set('color', c); ctx.say(s[c] || f.labels[c]); });
      row.appendChild(b);
    }
    body.appendChild(row);
  }
  return null;
}

/** A die face as dots (an SVG; its number is in the label). */
function die(n) {
  const P = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]] };
  const svg = svgEl('svg', { viewBox: '0 0 100 100', class: 'dw-die', 'aria-hidden': 'true' });
  svg.appendChild(svgEl('rect', { x: 4, y: 4, width: 92, height: 92, rx: 18, class: 'dw-dieface' }));
  for (const [x, y] of P[n]) svg.appendChild(svgEl('circle', { cx: x, cy: y, r: 8.5, class: 'dw-diedot' }));
  return svg;
}
const lastRolls = new Map();
function dice(body, s, ctx) {
  const W = ctx.type.words, n = Math.max(1, Math.min(6, s.count || 1));
  body.classList.add('dw-dice');
  const row = el('div', 'dw-dicerow');
  const total = el('div', 'dw-dicetotal'); total.setAttribute('role', 'status');
  const go = btn(`🎲 ${W.roll}`, 'btn btn-primary');
  const ctl = el('div', 'dw-row dw-stick'); ctl.appendChild(go);
  body.append(row, total, ctl);
  let timer = 0;
  const show = vals => {
    row.textContent = '';
    vals.forEach(v => { const d = die(v); const w = el('span', 'dw-diewrap'); w.appendChild(d); row.appendChild(w); });
    total.textContent = vals.length > 1 ? fill(W.total, { n: vals.reduce((a, b) => a + b, 0) }) : fill(W.die, { n: vals[0] });
  };
  const roll = () => Array.from({ length: n }, () => rnd(6) + 1);
  show(lastRolls.get(ctx.id) || Array.from({ length: n }, (_, i) => (i % 6) + 1).slice(0, n));
  if (!lastRolls.has(ctx.id)) total.textContent = '';
  go.addEventListener('click', () => {
    const final = roll(); lastRolls.set(ctx.id, final);
    if (ctx.reduced()) { show(final); return; }
    let i = 0; row.classList.add('is-rolling');
    const spin = () => { if (i++ < 8) { row.textContent = ''; roll().forEach(v => { const w = el('span', 'dw-diewrap'); w.appendChild(die(v)); row.appendChild(w); }); timer = setTimeout(spin, 70); } else { row.classList.remove('is-rolling'); show(final); } };
    total.textContent = '';
    spin();
  });
  return { destroy() { clearTimeout(timer); } };
}

const lastNumbers = new Map();
function random(body, s, ctx) {
  const W = ctx.type.words;
  const lo = Math.min(s.min, s.max), hi = Math.max(s.min, s.max);
  body.classList.add('dw-rand');
  const out = el('div', 'dw-randn', lastNumbers.has(ctx.id) ? String(lastNumbers.get(ctx.id)) : '?'); out.setAttribute('role', 'status');
  const range = el('div', 'dw-randrange small muted', fill(W.between, { min: lo, max: hi }));
  const go = btn(`🔢 ${W.go}`, 'btn btn-primary');
  const ctl = el('div', 'dw-row dw-stick'); ctl.appendChild(go);
  body.append(out, range, ctl);
  go.addEventListener('click', () => { const v = lo + rnd(hi - lo + 1); lastNumbers.set(ctx.id, v); out.textContent = String(v); });
  return null;
}

// Group maker (teacher only, never pinned): the class's Oomba names, away students left out (the picker's "Away today"
// list). Made in the teacher's browser, kept while the page is open.
const madeGroups = new Map();
function groups(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-groups');
  const out = el('div', 'dw-grouplist dw-scroll');
  const note = el('p', 'small muted dw-note', W.note);
  const row = el('div', 'dw-row dw-stick-top');
  const go = btn(`👥 ${W.make}`, 'btn btn-primary');
  row.appendChild(go);
  body.append(row, out, note);
  const show = list => {
    out.textContent = '';
    if (!list) return;
    if (!list.length) { out.appendChild(el('p', 'dw-empty', W.none)); return; }
    list.forEach((g, i) => {
      const card = el('section', 'dw-group'); card.setAttribute('aria-label', fill(W.group, { n: i + 1 }));
      card.appendChild(el('b', 'dw-grouph', fill(W.group, { n: i + 1 })));
      const ul = el('ul', 'dw-groupnames'); for (const nm of g) ul.appendChild(typed('li', null, nm));
      card.appendChild(ul); out.appendChild(card);
    });
    go.textContent = `🔀 ${W.again}`;
  };
  show(madeGroups.get(ctx.id));
  go.addEventListener('click', async () => {
    const v = await ctx.get('/picker').catch(() => null); if (!v) return;
    const names = v.students.filter(k => !v.away.includes(k.id)).map(k => k.name);
    const list = makeGroups(names, s.by, s.n || 4, () => rnd(1e6) / 1e6);
    madeGroups.set(ctx.id, list); show(list);
    ctx.say(list.length ? `${list.length} · ${fill(W.group, { n: list.length })}` : W.none);
  });
  return null;
}

function score(body, s, ctx) {
  // Stage 5: points for each student (positive reasons only; a student sees only their own).
  if (s.mode === 'students') return points(body, s, ctx);
  const W = ctx.type.words;
  body.classList.add('dw-score');
  let names = String(s.teams || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 8);
  if (!names.length) names = [fill(W.team, { n: 1 }), fill(W.team, { n: 2 })];
  const scores = names.map((_, i) => Number((s.scores || [])[i]) || 0);
  const ul = el('ul', 'dw-teams dw-scroll');   // more teams than fit: the list scrolls, the reset stays below
  const control = ctx.teacher && !ctx.editing;
  names.forEach((nm, i) => {
    const li = el('li', `dw-team dw-team${i % 4}`);
    li.appendChild(typed('span', 'dw-teamname', nm));
    const pts = el('b', 'dw-teampts', String(scores[i])); pts.setAttribute('aria-live', 'polite');
    if (control) {
      const minus = btn('−', 'btn btn-sm dw-pm', fill(W.minus, { team: nm })), plus = btn('+', 'btn btn-sm dw-pm dw-plus', fill(W.plus, { team: nm }));
      const change = d => { const next = scores.slice(); next[i] = Math.max(-9999, Math.min(9999, next[i] + d)); ctx.set('scores', next); ctx.say(`${nm}: ${next[i]}`); };
      minus.addEventListener('click', () => change(-1)); plus.addEventListener('click', () => change(1));
      li.append(minus, pts, plus);
    } else li.appendChild(pts);
    ul.appendChild(li);
  });
  body.appendChild(ul);
  if (control) { const r = btn(`↺ ${W.reset}`, 'btn btn-sm dw-scorereset'); r.addEventListener('click', () => ctx.set('scores', names.map(() => 0))); const ctl = el('div', 'dw-row dw-foot dw-scorefoot'); ctl.appendChild(r); body.appendChild(ctl); }
  return null;
}

/** id -> renderer. A type the server lists but this file doesn't know yet is left out of the screen. */
export const RENDER = { clock, text, ican, timer, schedule, weather, qr, picker, noise, help, check, tiles, countdown, calendar, symbols, light, dice, random, groups, score, ...withModes({ ...TOOLS, ...TOOLS4 }), ...RENDER5, camera };
