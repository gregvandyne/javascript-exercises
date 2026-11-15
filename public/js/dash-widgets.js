// Classroom dashboards: what each widget type draws (server/services/dash.js WIDGETS is the registry: ids, sizes,
// settings). A renderer gets the widget's body element, its settings and ctx, and may return { tick(date) } (called
// once a second), { live(state) } (called after each /live check, every 4 s while the screen is in view) and
// { destroy() } (the widget is redrawn or goes away). Stage 2 adds the everyday widgets (docs/decisions.md
// "Classroom dashboards, stage 2"): timer, stopwatch, schedule, weather, QR, picker, noise meter, help queue, quick
// checks and Oomba tiles.
// ctx: { type (with the translated words), intl, role, id, tz, teacher (the class's teacher's own widget), pinned (a
// student seeing the teacher's pinned widget), own (a student's own widget), editing, reduced() (reduced motion),
// private() (projector mode: no names), live() (the last /live answer), now() (the server's clock), get(path),
// act(path, body), poll(), sheet, toast, esc, say(msg), flush() (save the layout now) }. Paths are under
// /api/dash/<class>.
// Widgets render text with textContent only: never innerHTML with anything a person typed (the sheets escape it).
// No widget talks to an AI. The noise meter (dash-noise.js) has no network code at all.
import { noise } from './dash-noise.js';

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
    const ol = el('ol', 'dw-list'); ol.dir = 'auto';
    for (const line of lines.filter(Boolean)) ol.appendChild(typed('li', null, line.replace(/^[-*•]\s*/, '')));
    body.appendChild(ol);
  } else body.appendChild(typed('p', 'dw-para', lines.join('\n')));
  return null;
}

function ican(body, s, ctx) {
  body.classList.add('dw-ican');
  body.appendChild(el('div', 'dw-lead', ctx.type.words.lead));
  if (s.goal) body.appendChild(typed('div', 'dw-goal', s.goal));
  else body.appendChild(el('p', 'dw-empty', ctx.type.words.empty));
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
const localTimers = new Map();
const RING = 2 * Math.PI * 44;   // a student's own timers (their browser only)
function runner(body, s, ctx, down) {
  const W = ctx.type.words;
  const control = ctx.teacher || ctx.own;
  const fresh = () => ({ mode: down ? 'down' : 'up', dur: (s.minutes || 5) * 60e3, base: 0, start: 0, on: false });
  const state = () => {
    if (ctx.own) { if (!localTimers.has(ctx.id)) localTimers.set(ctx.id, fresh()); return localTimers.get(ctx.id); }
    const st = (ctx.live().timers || {})[ctx.id];
    return st && st.mode === (down ? 'down' : 'up') ? st : fresh();
  };
  const clockNow = () => (ctx.own ? Date.now() : ctx.now());
  body.classList.add('dw-timer');
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
    body.append(wrap, doneMsg);
  } else body.append(digits, doneMsg);
  if (bar) body.appendChild(bar);
  let go = null;
  if (control) {
    if (down) {
      const pre = el('div', 'dw-presets'); pre.setAttribute('role', 'group'); pre.setAttribute('aria-label', W.presets);
      for (const m of [1, 2, 5, 10]) { const b = btn(`${m}`, 'btn btn-sm dw-pre', fill(W.mins, { n: m })); b.addEventListener('click', () => act('set', m * 60e3)); pre.appendChild(b); }
      const cb = btn(W.custom, 'btn btn-sm dw-pre'); cb.setAttribute('aria-expanded', 'false');
      pre.appendChild(cb);
      body.appendChild(pre);
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
      body.appendChild(custom);
    }
    const row = el('div', 'dw-row');
    go = btn(W.start, 'btn btn-primary dw-go');
    const reset = btn(W.reset, 'btn dw-reset');
    go.addEventListener('click', () => act(state().on ? 'pause' : 'start'));
    reset.addEventListener('click', () => act('reset'));
    row.append(go, reset);
    body.appendChild(row);
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
    if (go) { go.textContent = st.on ? W.pause : st.base > 0 && !v.done ? W.resume : W.start; go.classList.toggle('btn-primary', !st.on); }
    const key = `${st.start}:${st.dur}`;
    if (done && st.on && rang !== key) { rang = key; if (s.chime && control) chime(); if (control) ctx.say(W.done); }
  }
  draw();
  return { tick: draw, live: draw };
}
const timer = (body, s, ctx) => runner(body, s, ctx, true);
const stopwatch = (body, s, ctx) => runner(body, s, ctx, false);

// ---------------------------------------------------------------- the day's schedule (the school's time zone)
function schedule(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-sched');
  const periods = s.periods || [];
  if (!periods.length) { body.appendChild(el('p', 'dw-empty', ctx.role === 'teacher' ? W.empty : '')); return null; }
  const fmt = new Intl.DateTimeFormat(ctx.intl, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const at = hhmm => { const [h, m] = hhmm.split(':').map(Number); return fmt.format(Date.UTC(2020, 0, 1, h, m)); };
  const status = el('div', 'dw-sched-now'); status.setAttribute('aria-live', 'polite'); status.dir = 'auto';
  const ol = el('ol', 'dw-periods');
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
    if (msg !== last) { last = msg; status.textContent = msg; }
  };
  tick();
  return { tick };
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
function qr(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-qr');
  if (!s.target) { body.appendChild(el('p', 'dw-empty', W.empty)); return null; }
  const key = `${s.target.kind}:${s.target.ref}`;
  const show = r => {
    body.textContent = '';
    if (!r) { body.appendChild(el('p', 'dw-empty', W.gone)); return; }
    const box = el('div', 'dw-qrbox');
    box.innerHTML = r.svg;   // our own server's SVG (services/qr.js), built from an allowed address only
    const link = el('div', 'dw-qrtext', r.text); link.dir = 'ltr';
    body.append(box, typed('div', 'dw-qrtitle', r.title), link);
  };
  const hit = qrCache.get(key);
  if (hit && hit.until > Date.now()) show(hit.r);
  else {
    body.appendChild(el('p', 'dw-empty', '…'));
    ctx.get(`/qr?kind=${encodeURIComponent(s.target.kind)}&ref=${encodeURIComponent(s.target.ref || '')}`)
      .then(r => { qrCache.set(key, { r, until: Date.now() + 60e3 }); show(r); })
      .catch(() => { qrCache.set(key, { r: null, until: Date.now() + 15e3 }); show(null); });
  }
  return null;
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
  const name = el('div', 'dw-pickname', wheelMode ? '' : '🎲'); name.setAttribute('aria-live', 'polite'); name.dir = 'auto';
  let wheel = null, rot = 0;
  if (wheelMode) { wheel = el('div', 'dw-wheel'); wheel.setAttribute('aria-hidden', 'true'); body.appendChild(wheel); }
  const left = el('div', 'dw-pickleft small muted');
  const row = el('div', 'dw-row');
  const go = btn(wheelMode ? `🎡 ${W.spin}` : `🎲 ${W.pick}`, 'btn btn-primary'), away = btn(W.away), reset = btn(W.reset);
  row.append(go);
  if (!own) row.append(away);
  row.append(reset);
  body.append(name, left, row);
  let view = null, timer = 0;
  const ownState = localPicks.get(ctx.id) || { picked: [] }; localPicks.set(ctx.id, ownState);
  /** What the wheel shows: the teacher's items, or the class's Oomba names (away students left out). */
  const entries = () => (own ? items : view ? view.students.filter(k => !view.away.includes(k.id)).map(k => k.name) : []);
  const drawWheel = () => {
    if (!wheel) return;
    const list = entries();
    wheel.textContent = '';
    if (!list.length) return;
    const svg = svgEl('svg', { viewBox: '-50 -50 100 100', class: 'dw-wheelsvg' });
    const g = svgEl('g', { class: 'dw-wheelrot' }); g.style.transform = `rotate(${rot}deg)`;
    const seg = 360 / list.length;
    list.forEach((label, i) => {
      const a0 = (i * seg - 90) * Math.PI / 180, a1 = ((i + 1) * seg - 90) * Math.PI / 180;
      const big = seg > 180 ? 1 : 0;
      const d = list.length === 1 ? 'M0 -48 A48 48 0 1 1 -0.01 -48 Z' : `M0 0 L${48 * Math.cos(a0)} ${48 * Math.sin(a0)} A48 48 0 ${big} 1 ${48 * Math.cos(a1)} ${48 * Math.sin(a1)} Z`;
      g.appendChild(svgEl('path', { d, class: `dw-seg dw-seg${i % 4}` }));
      const mid = (i + 0.5) * seg - 90;
      const shown = label.length > 16 ? `${label.slice(0, 15)}…` : label;
      const tx = svgEl('text', { x: 9, y: 0, transform: `rotate(${mid})`, class: 'dw-segtext', 'font-size': Math.max(2.6, Math.min(7, 70 / list.length, 66 / Math.max(1, shown.length))) });
      tx.textContent = shown;
      g.appendChild(tx);
    });
    svg.appendChild(g);
    svg.appendChild(svgEl('path', { d: 'M-4 -50 L4 -50 L0 -41 Z', class: 'dw-pointer' }));
    svg.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 5, class: 'dw-hub' }));
    wheel.appendChild(svg);
  };
  const showLeft = () => {
    if (own) { left.textContent = items.length ? '' : W.noItems; go.disabled = !items.length; drawWheel(); return; }
    if (!view) return;
    const here = view.students.filter(k => !view.away.includes(k.id));
    const n = s.norepeat ? here.filter(k => !view.picked.includes(k.id)).length || here.length : here.length;
    left.textContent = here.length ? fill(W.left, { n }) : W.none;
    go.disabled = !here.length;
    drawWheel();
  };
  const load = () => (own ? Promise.resolve(showLeft()) : ctx.get('/picker').then(v => { view = v; showLeft(); }).catch(() => {}));
  load();
  /** Turn the wheel so the picked entry stops under the pointer (at once with reduced motion). */
  const spinTo = (index, done) => {
    const list = entries(), seg = 360 / list.length;
    const g = wheel && wheel.querySelector('.dw-wheelrot');
    if (!g || ctx.reduced()) { rot = -(index + 0.5) * seg; drawWheel(); done(); return; }
    const base = Math.ceil(rot / 360) * 360 + 360 * 4;
    rot = base - (index + 0.5) * seg + (Math.random() - 0.5) * seg * 0.6;
    g.style.transition = 'transform 3.2s cubic-bezier(.17,.67,.21,1)';
    requestAnimationFrame(() => { g.style.transform = `rotate(${rot}deg)`; });
    timer = setTimeout(done, 3300);
  };
  go.addEventListener('click', async () => {
    go.disabled = true;
    name.classList.remove('is-picked');
    try {
      let pickName, index;
      if (own) {
        // Teacher-typed items: picked here (no student data involved).
        let pool = items.map((x, i) => i).filter(i => !s.norepeat || !ownState.picked.includes(i));
        if (!pool.length) { ownState.picked = []; pool = items.map((x, i) => i); }
        index = pool[crypto.getRandomValues(new Uint32Array(1))[0] % pool.length];
        ownState.picked.push(index); pickName = items[index];
      } else {
        const before = entries();
        const r = await ctx.act('/picker', { action: 'pick', norepeat: !!s.norepeat });
        if (!r || !r.pick) { go.disabled = false; return; }
        view = r; pickName = r.pick.name; index = Math.max(0, before.indexOf(pickName));
        if (wheelMode && before.join('\n') !== entries().join('\n')) { drawWheel(); index = entries().indexOf(pickName); }
      }
      const land = () => { name.removeAttribute('aria-busy'); name.textContent = pickName; name.classList.add('is-picked'); go.disabled = false; if (!own) showLeft(); if (!wheelMode) go.textContent = `🎲 ${W.again}`; };
      name.setAttribute('aria-busy', 'true');
      if (wheelMode) { spinTo(index, land); return; }
      const names = view.students.map(k => k.name);
      if (ctx.reduced() || names.length < 2) land();
      else {
        let i = 0, wait = 60;
        const spin = () => { name.textContent = names[Math.floor(Math.random() * names.length)]; i++; wait *= 1.18; if (i < 14) timer = setTimeout(spin, wait); else land(); };
        spin();
      }
    } catch { go.disabled = false; }
  });
  reset.addEventListener('click', async () => {
    if (own) { ownState.picked = []; name.textContent = ''; return; }
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
  return { destroy() { clearTimeout(timer); } };
}
const localPicks = new Map();

// ---------------------------------------------------------------- help queue
// Students tap "I need help" or "I'm done" (no text). The teacher's widget shows the queue in order; on the projector
// (projector mode) the names are hidden and only the counts show. A student sees only their own place.
function help(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-help');
  if (ctx.role === 'student') {
    const row = el('div', 'dw-helpbtns');
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
  const list = el('ol', 'dw-queue dw-private');
  const hidden = el('p', 'dw-public small muted', W.hidden);
  const row = el('div', 'dw-row');
  const next = btn(`➡️ ${W.next}`, 'btn btn-primary'), clear = btn(W.clear);
  row.append(next, clear);
  body.append(counts, list, hidden, row);
  let sig = '';
  const draw = live => {
    const q = (((live || ctx.live()).help) || {}).queue || [];
    const s2 = JSON.stringify(q); if (s2 === sig) return; sig = s2;
    const waiting = q.filter(x => x.kind === 'help'), finished = q.filter(x => x.kind === 'done');
    counts.textContent = `✋ ${fill(W.waiting, { n: waiting.length })} · ✅ ${fill(W.finished, { n: finished.length })}`;
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
  const metaRow = el('div', 'dw-checkmetarow');
  const meta = el('span', 'dw-checkmeta small');
  const saved = btn(W.savedList, 'btn btn-sm dw-linkbtn');
  metaRow.append(meta, saved);
  const row = el('div', 'dw-row');
  const add = btn(`➕ ${W.new}`, 'btn btn-sm btn-primary'), end = btn(W.end, 'btn btn-sm'), names = btn(`👀 ${W.names}`, 'btn btn-sm dw-private'), save = btn(W.save, 'btn btn-sm');
  row.append(add, end, names, save);
  body.append(head, bars, metaRow, row);
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
    const ul = el('ul', 'dw-tilegrid');
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
// Event countdown, calendar, work symbols, traffic light, dice, random number, group maker, scoreboard, stickers.
// Widgets the teacher changes with a tap (symbols, light, score, stickers) save through ctx.set(key, value): the
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
/** The fixed Oomba sticker set (no uploads). services/dash.js STAMP_COUNT must match. */
export const STAMPS = ['⭐', '🌟', '🎉', '👏', '💯', '🏆', '🌈', '🔥', '💡', '❤️', '✅', '🎯', '🚀', '🍎', '📚', '✏️', '🌻', '🐸', '🦉', '🎵'];
const rnd = n => (globalThis.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] % n : Math.floor(Math.random() * n));

function countdown(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-count');
  if (!s.date) { body.appendChild(el('p', 'dw-empty', ctx.role === 'teacher' ? W.empty : '')); return null; }
  const tz = ctx.tz || 'America/New_York';
  const at = zonedEpoch(s.date, s.time, tz);
  if (s.label) body.appendChild(typed('div', 'dw-countlabel', s.label));
  const boxes = el('div', 'dw-countboxes');
  const part = key => { const b = el('div', 'dw-countbox'); const n = b.appendChild(el('b', 'dw-countn')); b.appendChild(el('span', 'dw-countu', W[key])); boxes.appendChild(b); return n; };
  const nd = part('days'), nh = part('hours'), nm = part('mins');
  const msg = el('div', 'dw-countmsg'); msg.setAttribute('role', 'status');
  body.append(boxes, msg);
  const tick = () => {
    const now = ctx.now(), left = at - now;
    const today = todayIn(tz, new Date(now)) === s.date;
    if (left <= 0) { boxes.hidden = true; msg.textContent = today ? W.today : W.past; return; }
    const p = countdownParts(left);
    boxes.hidden = false; nd.textContent = p.days; nh.textContent = p.hours; nm.textContent = p.mins;
    msg.textContent = today ? W.today : '';
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
    const coming = (s.marks || []).filter(x => x.date >= today).slice(0, 4);
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
    const row = el('div', 'dw-symrow'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', W.change);
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
    const row = el('div', 'dw-row dw-lightrow'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', W.set);
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
  body.append(row, total, go);
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
  body.append(out, range, go);
  go.addEventListener('click', () => { const v = lo + rnd(hi - lo + 1); lastNumbers.set(ctx.id, v); out.textContent = String(v); });
  return null;
}

// Group maker (teacher only, never pinned): the class's Oomba names, away students left out (the picker's "Away today"
// list). Made in the teacher's browser, kept while the page is open.
const madeGroups = new Map();
function groups(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-groups');
  const out = el('div', 'dw-grouplist');
  const note = el('p', 'small muted dw-note', W.note);
  const row = el('div', 'dw-row');
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
  const W = ctx.type.words;
  body.classList.add('dw-score');
  let names = String(s.teams || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 8);
  if (!names.length) names = [fill(W.team, { n: 1 }), fill(W.team, { n: 2 })];
  const scores = names.map((_, i) => Number((s.scores || [])[i]) || 0);
  const ul = el('ul', 'dw-teams');
  const control = ctx.teacher && !ctx.editing;
  names.forEach((nm, i) => {
    const li = el('li', `dw-team dw-team${i % 4}`);
    li.appendChild(typed('span', 'dw-teamname', nm));
    const pts = el('b', 'dw-teampts', String(scores[i])); pts.setAttribute('aria-live', 'polite');
    if (control) {
      const minus = btn('−', 'btn btn-sm dw-pm', fill(W.minus, { team: nm })), plus = btn('+', 'btn btn-sm btn-primary dw-pm', fill(W.plus, { team: nm }));
      const change = d => { const next = scores.slice(); next[i] = Math.max(-9999, Math.min(9999, next[i] + d)); ctx.set('scores', next); ctx.say(`${nm}: ${next[i]}`); };
      minus.addEventListener('click', () => change(-1)); plus.addEventListener('click', () => change(1));
      li.append(minus, pts, plus);
    } else li.appendChild(pts);
    ul.appendChild(li);
  });
  body.appendChild(ul);
  if (control) { const r = btn(W.reset, 'btn btn-sm dw-linkbtn'); r.addEventListener('click', () => ctx.set('scores', names.map(() => 0))); body.appendChild(r); }
  return null;
}

function stickers(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-stickers');
  const area = el('div', 'dw-stickarea');
  const list = s.stamps || [];
  const control = ctx.teacher && !ctx.editing;
  list.forEach((x, i) => {
    const e = STAMPS[x.e] || '⭐';
    const sp = el(control ? 'button' : 'span', 'dw-stamp', e);
    sp.style.insetInlineStart = `${x.x}%`; sp.style.insetBlockStart = `${x.y}%`;
    if (control) { sp.type = 'button'; sp.setAttribute('aria-label', fill(W.remove, { e })); sp.addEventListener('click', () => ctx.set('stamps', list.filter((_, j) => j !== i))); }
    else sp.setAttribute('aria-hidden', 'true');
    area.appendChild(sp);
  });
  body.appendChild(area);
  if (!list.length && control) area.appendChild(el('p', 'dw-empty', W.empty));
  if (control) {
    const pal = el('div', 'dw-palette'); pal.setAttribute('role', 'group'); pal.setAttribute('aria-label', W.add);
    STAMPS.forEach((e, i) => {
      const b = btn(e, 'btn btn-sm dw-palbtn', `${W.add}: ${e}`);
      b.addEventListener('click', () => { if (list.length >= 30) return; ctx.set('stamps', [...list, { e: i, x: 6 + rnd(80), y: 6 + rnd(70) }]); });
      pal.appendChild(b);
    });
    const clear = btn(W.clear, 'btn btn-sm dw-linkbtn'); clear.disabled = !list.length; clear.addEventListener('click', () => ctx.set('stamps', []));
    pal.appendChild(clear);
    body.appendChild(pal);
  }
  return null;
}

/** id -> renderer. A type the server lists but this file doesn't know yet is left out of the screen. */
export const RENDER = { clock, text, ican, timer, stopwatch, schedule, weather, qr, picker, noise, help, check, tiles, countdown, calendar, symbols, light, dice, random, groups, score, stickers };
