// A student's desk in Homeroom (docs/homeroom.md "The student desk"; docs/decisions.md "Homeroom, step 1b"; server:
// routes/homeroom.js /class/:id/desk, services/homeroom.js). Step 1b:
//   - the desk with their name and their group's color, "Nothing on your desk yet" (handouts land here in step 2);
//   - a doodle and working-out pad (finger, pencil or mouse), saved for them in this class (POST /api/desk/<class>/doodle,
//     cleaned and limited on the server);
//   - a small read-only window on the teacher's area (public/js/homeroom-area.js), kept fresh by asking
//     GET /api/desk/<class>/state every few seconds (the area comes only when it changed);
//   - the dock: My desk, Teacher's area (full screen), Library, See the room (every desk where the teacher seated it,
//     names only, no work);
//   - live class: Bring everyone to me shows every desk the teacher's area ("Your teacher is showing this"), Pause
//     screens shows "Eyes on your teacher". Students only read the live state; only the class's teachers change it.
//   - a shared device (step 1c: signed in with the class sign-in, D.device): "Not you? Switch" signs out and goes back to
//     the names (POST /api/desk/<class>/switch), and when the teacher ends class (the sign-in ends) the desk goes to the
//     sign-in page.
import { t, api, toast, esc, pageData } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { inkLine } from '/js/board-ann.js';
import { areaHtml, fitAreas } from '/js/homeroom-area.js';
import { AREA, TEACHER_DESK, DESK } from '/js/homeroom-seats.js';

const D = pageData();
const P = D.doodle || { w: 900, h: 600, strokes: 150, points: 400, total: 15000, colors: ['#141414'] };
const td = (k, v) => t(`js.homeroom-desk.${k}`, v);
const $ = id => document.getElementById(id);
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const S = {
  live: null, area: {}, v: null, view: 'desk', strokes: Array.isArray(D.strokes) ? D.strokes : [], hist: [], pen: P.colors[0],
  cur: null, penSeen: false, saveTimer: null, dirty: false,
};
const root = $('hd'), body = $('hd-body'), over = $('hd-over');

// ---------------------------------------------------------------- the desk
function renderDesk() {
  const color = D.color ? ` style="--gc:${esc(D.color)}"` : '';
  body.innerHTML = `<div class="hd-grid">
    <section class="hd-desk"${color} aria-labelledby="hd-deskh">
      <h2 class="hd-deskh" id="hd-deskh"><span class="rm-dot"${D.color ? ` style="--c:${esc(D.color)}"` : ''}></span><span>${esc(td('deskOf', { name: D.me.name }))}</span></h2>
      <div class="hd-emptydesk">${iconHtml('🎒', { size: 28 })}<p><b>${esc(td('empty'))}</b><span>${esc(td('emptyText'))}</span></p></div>
      <div class="hd-pad">
        <div class="hd-padbar"><h3 class="hd-padcap">${esc(td('pad'))}</h3><span class="hd-grow"></span>
          <span class="hd-pens" role="radiogroup" aria-label="${esc(td('pens'))}">${P.colors.map((c, i) => btn(`hd-pen${S.pen === c ? ' on' : ''}`, `role="radio" aria-checked="${S.pen === c}" data-hdpen="${c}" aria-label="${esc(td('penColor', { n: i + 1 }))}"`, `<i style="background:${c}"></i>`)).join('')}</span>
          ${btn('hd-tool', 'data-hd="undo" id="hd-undo"', `${iconHtml('↩', { size: 18 })}<span>${esc(td('undo'))}</span>`)}${btn('hd-tool', 'data-hd="clear" id="hd-clear"', `${iconHtml('🧽', { size: 18 })}<span>${esc(td('clear'))}</span>`)}</div>
        <div class="hd-padbox"><svg class="hd-svg" id="hd-svg" viewBox="0 0 ${P.w} ${P.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(td('padLabel'))}">
          <rect class="hd-paper" x="1" y="1" width="${P.w - 2}" height="${P.h - 2}" rx="14"/><g id="hd-ink"></g><g id="hd-cur"></g></svg></div>
      </div>
    </section>
    <section class="hd-side" aria-labelledby="hd-areah">
      <div class="hd-wintop"><h2 class="hd-areah" id="hd-areah">✦ ${esc(td('teacherArea'))}</h2>${btn('hd-open', `data-hd="area" aria-label="${esc(td('openArea'))}"`, iconHtml('⤢', { size: 18 }))}</div>
      <div class="hd-window" id="hd-window" data-hd="area"></div>
    </section></div>`;
  drawInk(); renderWindow(); toolsState();
}
function renderWindow() {
  const w = $('hd-window'); if (!w) return;
  w.innerHTML = areaHtml(S.area, { mode: 'width', label: false });
  fitAreas(w);
}
function toolsState() {
  const u = $('hd-undo'), c = $('hd-clear');
  if (u) u.disabled = !S.hist.length; if (c) c.disabled = !S.strokes.length;
}

// ---------------------------------------------------------------- the pad
const svg = () => $('hd-svg');
function drawInk() { const g = $('hd-ink'); if (g) g.innerHTML = S.strokes.map(s => inkLine(s, P.w, P.h)).join(''); }
/** A pointer's place on the page, as fractions of it (the page keeps its shape on every screen). */
function at(e) {
  const el = svg(), m = el && el.getScreenCTM(); if (!m) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: Math.min(1, Math.max(0, p.x / P.w)), y: Math.min(1, Math.max(0, p.y / P.h)) };
}
const totalPoints = () => S.strokes.reduce((n, s) => n + s.pts.length, 0);
function remember() { S.hist.push(JSON.stringify(S.strokes)); if (S.hist.length > 50) S.hist.shift(); }
function padDown(e) {
  if (!e.target.closest('#hd-svg') || S.cur) return;
  if (e.pointerType === 'pen') S.penSeen = true;
  // A pencil in use: a palm resting on the screen draws nothing.
  if (e.pointerType === 'touch' && S.penSeen) return;
  if (e.button > 0) return;
  if (S.strokes.length >= P.strokes || totalPoints() >= P.total - 2) { toast(td('padFull'), { bad: true }); return; }
  const p = at(e); if (!p) return;
  e.preventDefault();
  S.cur = { id: e.pointerId, s: { c: S.pen, pts: [p] } };
  try { svg().setPointerCapture(e.pointerId); } catch { /* gone */ }
}
function padMove(e) {
  const c = S.cur; if (!c || c.id !== e.pointerId) return;
  const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
  for (const ev of evs.length ? evs : [e]) {
    if (c.s.pts.length >= P.points) break;
    const p = at(ev), last = c.s.pts[c.s.pts.length - 1];
    if (p && (Math.abs(p.x - last.x) * P.w + Math.abs(p.y - last.y) * P.h) >= 1.5) c.s.pts.push(p);
  }
  const g = $('hd-cur'); if (g) g.innerHTML = inkLine(c.s, P.w, P.h);
}
function padUp(e) {
  const c = S.cur; if (!c || c.id !== e.pointerId) return;
  S.cur = null; const g = $('hd-cur'); if (g) g.innerHTML = '';
  if (c.s.pts.length < 2) return;
  if (totalPoints() + c.s.pts.length > P.total) { toast(td('padFull'), { bad: true }); return; }
  remember(); S.strokes.push(c.s); drawInk(); toolsState(); queueSave();
}
function queueSave() { S.dirty = true; clearTimeout(S.saveTimer); S.saveTimer = setTimeout(save, 700); }
async function save() {
  S.saveTimer = null; if (!S.dirty) return; S.dirty = false;
  try { await api(`/api/desk/${encodeURIComponent(D.classId)}/doodle`, { method: 'POST', body: { strokes: S.strokes } }); }
  catch (e) { toast(e.message, { bad: true }); }
}
function flush() {
  if (!S.dirty) return; clearTimeout(S.saveTimer); S.dirty = false;
  try { fetch(`/api/desk/${encodeURIComponent(D.classId)}/doodle`, { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strokes: S.strokes }) }); } catch { /* gone */ }
}

// ---------------------------------------------------------------- overlays: the teacher's area, See the room, live class
function renderOver() {
  const L = S.live || {};
  let html = '';
  if (L.paused) {
    html = `<div class="hd-over hd-pause" role="status"><div class="hd-pausein">${iconHtml('👀', { size: 64 })}<h2>${esc(td('eyes'))}</h2><p>${esc(td('eyesHint'))}</p></div></div>`;
  } else if (L.bring) {
    html = `<div class="hd-over hd-show" role="status"><p class="hd-overcap">${esc(td('showing'))}</p><div class="hd-overarea">${areaHtml(S.area, { mode: 'contain' })}</div><p class="hd-overhint">${esc(td('showingHint'))}</p></div>`;
  } else if (S.view === 'area') {
    html = `<div class="hd-over hd-show" role="dialog" aria-modal="false" aria-labelledby="hd-overh"><div class="hd-overtop"><h2 class="hd-overcap" id="hd-overh">✦ ${esc(td('teacherArea'))}</h2>${btn('btn hr-chunk hd-back', 'data-hd="desk"', `${iconHtml('🎒', { size: 18 })} ${esc(td('back'))}`)}</div><div class="hd-overarea">${areaHtml(S.area, { mode: 'contain', label: false })}</div></div>`;
  } else if (S.view === 'room') {
    html = roomHtml();
  }
  over.innerHTML = html;
  root.classList.toggle('hd-covered', !!html);
  for (const b of root.querySelectorAll('.hd-dockbtn[data-hd]')) b.setAttribute('aria-pressed', String(b.dataset.hd === S.view));
  if (html) { fitAreas(over); placeRoom(); }
}
function roomHtml() {
  const desks = D.desks || [];
  return `<div class="hd-over hd-room" role="dialog" aria-modal="false" aria-labelledby="hd-roomh"><div class="hd-overtop"><h2 class="hd-overcap" id="hd-roomh">${iconHtml('🏫', { size: 20 })} ${esc(td('roomTitle', { class: D.className }))}</h2>${btn('btn hr-chunk hd-back', 'data-hd="desk"', `${iconHtml('🎒', { size: 18 })} ${esc(td('back'))}`)}</div>
    <div class="hd-roombox" id="hd-roombox"><div class="hd-front"><span>✦ ${esc(td('teacherArea'))}</span></div><div class="hd-tdesk">${esc(td('teacherDesk'))}</div>
    ${desks.map(d => `<div class="hd-rdesk${d.me ? ' me' : ''}" data-x="${+d.x || 0}" data-y="${+d.y || 0}"${d.me && D.color ? ` style="--gc:${esc(D.color)}"` : ''}><span class="hd-rname"><bdi>${esc(d.name)}</bdi>${d.me ? ` <b>(${esc(td('you'))})</b>` : ''}</span></div>`).join('')}</div></div>`;
}
/** See the room: desks where the teacher seated them, scaled to the screen; when that would make desks too small to
 *  read (a phone), the same desks in seating order (front row first, left to right) as a simple grid. */
function placeRoom() {
  const box = $('hd-roombox'); if (!box) return;
  const desks = [...box.querySelectorAll('.hd-rdesk')], pts = desks.map(el => ({ el, x: +el.dataset.x, y: +el.dataset.y }));
  if (!pts.length) return;
  const x0 = Math.min(AREA.x, ...pts.map(p => p.x)) - 20, x1 = Math.max(AREA.x + AREA.w, ...pts.map(p => p.x + DESK.w)) + 20;
  const y1 = Math.max(...pts.map(p => p.y + DESK.h)) + 20, k = box.clientWidth / (x1 - x0);
  const grid = k * DESK.w < 84;
  box.classList.toggle('grid', grid);
  const front = box.querySelector('.hd-front'), tdesk = box.querySelector('.hd-tdesk');
  if (grid) {
    for (const el of [front, tdesk, ...desks]) el.removeAttribute('style');
    pts.sort((a, b) => (Math.abs(a.y - b.y) < DESK.h / 2 ? a.x - b.x : a.y - b.y)).forEach((p, i) => { p.el.style.order = String(i + 2); if (p.el.classList.contains('me') && D.color) p.el.style.setProperty('--gc', D.color); });
    box.style.height = '';
    return;
  }
  // The front of the room as a low band (the area's words aren't shown here), everything under it moved up to match.
  const top = AREA.y - 10, band = Math.round(AREA.h * 0.3), up = AREA.h - band;
  const put = (el, r) => Object.assign(el.style, { left: `${(r.x - x0) * k}px`, top: `${(r.y - top) * k}px`, width: `${r.w * k}px`, height: `${r.h * k}px` });
  put(front, { ...AREA, h: band }); put(tdesk, { ...TEACHER_DESK, y: TEACHER_DESK.y - up });
  for (const p of pts) { put(p.el, { x: p.x, y: p.y - up, w: DESK.w, h: DESK.h }); p.el.style.order = ''; }
  box.style.height = `${(y1 - up - top) * k + 10}px`;
}

// ---------------------------------------------------------------- live state
function applyState(st) {
  if (!st) return;
  const was = JSON.stringify(S.live);
  S.live = st.live || null; S.v = st.v;
  const dot = $('hr-live'); if (dot) dot.hidden = !S.live;
  const areaChanged = 'area' in st;
  if (areaChanged) { S.area = st.area || {}; renderWindow(); }
  if (areaChanged || was !== JSON.stringify(S.live)) renderOver();
}
let pollTimer = null;
async function poll() {
  clearTimeout(pollTimer); pollTimer = null;
  if (document.hidden) return;
  try { applyState(await api(`/api/desk/${encodeURIComponent(D.classId)}/state?v=${encodeURIComponent(S.v ?? '')}`, { background: true })); }
  catch (e) {
    // A shared device's sign-in ended (End class, or its time ran out): back to the class sign-in for the next student.
    if (D.device && (e.status === 401 || e.status === 404)) { location.href = '/hr?ended=1'; return; }
  }
  pollTimer = setTimeout(poll, S.live ? 3000 : 6000);
}

// ---------------------------------------------------------------- Not you? Switch (a shared device)
async function switchUser(b) {
  b.disabled = true; flush();
  try { const r = await api(`/api/desk/${encodeURIComponent(D.classId)}/switch`, { method: 'POST', body: {} }); location.href = r.redirect || '/hr'; }
  catch { location.href = '/hr'; }
}

// ---------------------------------------------------------------- input
function click(e) {
  const pen = e.target.closest('[data-hdpen]');
  if (pen) { S.pen = pen.dataset.hdpen; for (const b of root.querySelectorAll('[data-hdpen]')) { const on = b === pen; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); } return; }
  const a = e.target.closest('[data-hd]'); if (!a) return;
  const k = a.dataset.hd;
  if (k === 'undo') { const last = S.hist.pop(); if (last) { S.strokes = JSON.parse(last); drawInk(); toolsState(); queueSave(); } }
  else if (k === 'clear') { if (S.strokes.length) { remember(); S.strokes = []; drawInk(); toolsState(); queueSave(); } }
  else if (k === 'switch') switchUser(a);
  else if (k === 'desk' || k === 'area' || k === 'room') {
    S.view = k === S.view && k !== 'desk' ? 'desk' : k; renderOver();
    if (S.view === 'desk') root.querySelector('.hd-dockbtn[data-hd="desk"]')?.focus();
    else over.querySelector('.hd-back')?.focus();
  }
}
function start() {
  document.querySelector('main#main')?.classList.add('rm-main');
  S.area = (D.state && D.state.area) || {};
  renderDesk();
  applyState(D.state);
  root.addEventListener('click', click);
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && S.view !== 'desk') { S.view = 'desk'; renderOver(); } });
  body.addEventListener('pointerdown', padDown);
  body.addEventListener('pointermove', padMove);
  body.addEventListener('pointerup', padUp); body.addEventListener('pointercancel', padUp);
  let rz = null; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { fitAreas(root); placeRoom(); }, 120); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else poll(); });
  window.addEventListener('pagehide', flush);
  pollTimer = setTimeout(poll, S.live ? 3000 : 6000);
}
if (root && body) start();
