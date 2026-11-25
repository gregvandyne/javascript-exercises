// A student's desk in Homeroom (docs/homeroom.md "The student desk"; docs/decisions.md "Homeroom, step 1b"; server:
// routes/homeroom.js /class/:id/desk, services/homeroom.js). Step 1b:
//   - the desk with their name and their group's color, and their handouts (step 2a) as cards in the order the teacher
//     handed them out: the first unfinished one is "Next up"; an In order card after an unfinished one shows "🔒 Later"
//     and does not open; the teacher's instructions in yellow on the card; tapping opens the game (its Back goes to
//     this desk); a finished card fades with a check. "Nothing on your desk yet" when there are none. The cards come
//     again with the desk's poll when they changed (hv);
//   - a doodle and working-out pad (finger, pencil or mouse), saved for them in this class (POST /api/desk/<class>/doodle,
//     cleaned and limited on the server);
//   - a small read-only window on the teacher's area (public/js/homeroom-area.js), kept fresh by asking
//     GET /api/desk/<class>/state every few seconds (the area comes only when it changed);
//   - the dock: My desk, Teacher's area (full screen), Library, See the room (every desk where the teacher seated it,
//     names only, no work);
//   - live class: Bring everyone to me shows every desk the teacher's area ("Your teacher is showing this"), Pause
//     screens shows "Eyes on your teacher". Students only read the live state; only the class's teachers change it.
//   - step 2c: a team desk (students who share one desk): "Team: names" on the desk, one shared pad any member draws on
//     (the poll brings a teammate's strokes; a save that crossed one adds this desk's new strokes to theirs), the team
//     desk once in See the room; and the teacher's comment and sticker on a finished card (only this student's own).
//   - a shared device (step 1c: signed in with the class sign-in, D.device): "Not you? Switch" signs out and goes back to
//     the names (POST /api/desk/<class>/switch), and when the teacher ends class (the sign-in ends) the desk goes to the
//     sign-in page.
import { t, api, toast, esc, pageData } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { inkLine } from '/js/board-ann.js';
import { areaHtml, fitAreas } from '/js/homeroom-area.js';
import { AREA, TEACHER_DESK, DESK, TEAM_DESK } from '/js/homeroom-seats.js';

const D = pageData();
const P = D.doodle || { w: 900, h: 600, strokes: 150, points: 400, total: 15000, colors: ['#141414'] };
const td = (k, v) => t(`js.homeroom-desk.${k}`, v);
const $ = id => document.getElementById(id);
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const S = {
  cards: Array.isArray(D.cards) ? D.cards : [], hv: null,
  live: null, area: {}, v: null, view: 'desk', strokes: Array.isArray(D.strokes) ? D.strokes : [], hist: [], pen: P.colors[0],
  cur: null, penSeen: false, saveTimer: null, dirty: false,
  // a team's shared pad (step 2c): the version last saved or seen, and strokes drawn here since then (added to a
  // teammate's newer pad when a save crosses theirs)
  team: D.team || null, pv: D.pv ?? null, fresh: [], saving: false,
};
const root = $('hd'), body = $('hd-body'), over = $('hd-over');

// ---------------------------------------------------------------- the desk
function renderDesk() {
  const color = D.color ? ` style="--gc:${esc(D.color)}"` : '';
  body.innerHTML = `<div class="hd-grid">
    <section class="hd-desk"${color} aria-labelledby="hd-deskh">
      <div class="hd-deskrow"><h2 class="hd-deskh" id="hd-deskh"><span class="rm-dot"${D.color ? ` style="--c:${esc(D.color)}"` : ''}></span><span>${esc(td('deskOf', { name: D.me.name }))}</span></h2><span class="hd-order" id="hd-order"></span></div>
      ${S.team ? `<p class="hd-team" id="hd-team">${iconHtml('🤝', { size: 18 })} <span><bdi>${esc(td('team', { names: S.team.names.join(', ') }))}</bdi></span></p>` : ''}
      <div id="hd-cards"></div>
      <div class="hd-pad">
        <div class="hd-padbar"><h3 class="hd-padcap">${esc(td(S.team ? 'teamPad' : 'pad'))}</h3><span class="hd-grow"></span>
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
  drawInk(); renderWindow(); toolsState(); renderCards();
}

// ---------------------------------------------------------------- handouts (step 2a)
const dayFmt = due => { try { return new Date(due).toLocaleDateString(document.documentElement.lang || undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch { return ''; } };
function cardHtml(x) {
  const cls = `hd-card${x.next ? ' next' : ''}${x.locked ? ' locked' : ''}${x.done ? ' done' : ''}${x.ready ? '' : ' notready'}`;
  const badge = x.done ? `<span class="hd-badge done">✓ ${esc(td('done'))}</span>` : x.next ? `<span class="hd-badge next">${esc(td('nextUp'))}</span>` : x.locked ? `<span class="hd-badge later">${iconHtml('🔒', { size: 12 })} ${esc(td('later'))}</span>` : '';
  // A lesson (step 2b): "Lesson: <name>" and "Worksheet · N problems"; a game: free play.
  const kind = !x.ready ? td('notReady') : x.lesson ? td(x.unit === 'words' ? 'worksheetWords' : 'worksheet', { count: x.n || 0 }) : td('freePlay');
  const sub = [kind, x.due ? td('due', { date: dayFmt(x.due) }) : ''].filter(Boolean).join(' · ');
  const title = x.lesson ? td('lessonTitle', { title: x.title }) : x.title;
  const inner = `${badge}<span class="hd-cico" aria-hidden="true">${iconHtml(x.lesson ? '📄' : x.icon, { size: 26 })}</span><b class="hd-ct" dir="auto">${esc(title)}</b><span class="hd-csub">${esc(sub)}</span>
    ${x.instructions ? `<span class="hd-cins" dir="auto"><b>${esc(td('teacherSays'))}</b> ${esc(x.instructions)}</span>` : ''}${fbHtml(x)}<span class="hd-cbar" aria-hidden="true"><i style="width:${x.pct}%"></i></span>`;
  const label = `${title}${x.done ? `, ${td('done')}` : x.locked ? `, ${td('laterHint')}` : x.next ? `, ${td('nextUp')}` : ''}`;
  return x.locked || !x.ready || !x.href ? `<div class="${cls}" role="group" aria-label="${esc(label)}" aria-disabled="true" data-hdcard="${esc(x.id)}">${inner}</div>`
    : `<a class="${cls}" href="${esc(x.href)}" aria-label="${esc(label)}" data-hdcard="${esc(x.id)}">${inner}</a>`;
}
/** The teacher's comment and sticker on a finished card (step 2c): only this student's own. */
function fbHtml(x) {
  const f = x.done && x.fb; if (!f || (!f.comment && !f.src)) return '';
  return `<span class="hd-fb">${f.src ? `<img class="hd-fbsticker" src="${esc(f.src)}" alt="${esc(td(`stickers.${f.sticker}`))}" width="56" height="56">` : ''}${f.comment ? `<span class="hd-fbtext" dir="auto"><b>${esc(td('fromTeacher'))}</b> ${esc(f.comment)}</span>` : ''}</span>`;
}
function renderCards() {
  const el = $('hd-cards'), ord = $('hd-order'); if (!el) return;
  const cards = S.cards;
  if (ord) { const left = cards.filter(x => !x.done); ord.textContent = !left.length ? '' : left.some(x => x.inOrder) ? td('inOrder') : td('anyOrder'); ord.hidden = !left.length; }
  el.className = cards.length ? 'hd-cards' : '';
  el.innerHTML = cards.length ? cards.map(cardHtml).join('')
    : `<div class="hd-emptydesk">${iconHtml('🎒', { size: 28 })}<p><b>${esc(td('empty'))}</b><span>${esc(td('emptyText'))}</span></p></div>`;
}
function newCards(list) {
  const had = new Set(S.cards.map(x => x.id)), fresh = list.filter(x => !had.has(x.id));
  S.cards = list; renderCards();
  if (fresh.length && S.hv !== null) toast(td('newHandout', { title: fresh[fresh.length - 1].title }));
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
  remember(); S.strokes.push(c.s); if (S.team) S.fresh.push(c.s); drawInk(); toolsState(); queueSave();
}
function queueSave() { S.dirty = true; clearTimeout(S.saveTimer); S.saveTimer = setTimeout(save, 700); }
const padBody = () => ({ strokes: S.strokes, ...(S.team ? { base: S.pv } : {}) });
async function save(tries = 0) {
  S.saveTimer = null; if (!S.dirty || S.saving) return; S.dirty = false; S.saving = true;
  try {
    const r = await api(`/api/desk/${encodeURIComponent(D.classId)}/doodle`, { method: 'POST', body: padBody() });
    if (r && r.pv !== undefined) S.pv = r.pv;
    S.fresh = [];
  } catch (e) {
    // A teammate saved the shared pad since this desk last saw it: their pad, plus what was drawn here since, saved again.
    if (e.status === 409 && e.data && Array.isArray(e.data.strokes) && tries < 3) {
      S.strokes = [...e.data.strokes, ...S.fresh].slice(-P.strokes); S.pv = e.data.pv; S.hist = []; drawInk(); toolsState();
      S.saving = false; S.dirty = true; return save(tries + 1);
    }
    toast(e.message, { bad: true });
  } finally { S.saving = false; }
}
function flush() {
  if (!S.dirty) return; clearTimeout(S.saveTimer); S.dirty = false;
  try { fetch(`/api/desk/${encodeURIComponent(D.classId)}/doodle`, { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(padBody()) }); } catch { /* gone */ }
}
/** A teammate drew on the shared pad (the poll's strokes): shown here, unless this desk has strokes not saved yet (its
 *  save then adds them to the teammate's). */
function teamPad(st) {
  if (!S.team || st.pv === undefined) return;
  if (Array.isArray(st.strokes) && !S.dirty && !S.saving && !S.cur && String(st.pv) !== String(S.pv)) { S.strokes = st.strokes; S.pv = st.pv; S.hist = []; S.fresh = []; drawInk(); toolsState(); }
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
    ${desks.map(d => `<div class="hd-rdesk${d.me ? ' me' : ''}" data-x="${+d.x || 0}" data-y="${+d.y || 0}"${d.me && D.color ? ` style="--gc:${esc(D.color)}"` : ''}><span class="hd-rname"><bdi>${esc(d.name)}</bdi>${d.me ? ` <b>(${esc(td('you'))})</b>` : ''}</span></div>`).join('')}
    ${(D.teams || []).map(x => `<div class="hd-rdesk hd-rteam${x.me ? ' me' : ''}" data-x="${+x.x || 0}" data-y="${+x.y || 0}" data-team="1"${x.me && D.color ? ` style="--gc:${esc(D.color)}"` : ''}><span class="hd-rname">${iconHtml('🤝', { size: 14 })} <bdi>${esc(x.names.join(', '))}</bdi>${x.me ? ` <b>(${esc(td('you'))})</b>` : ''}</span></div>`).join('')}</div></div>`;
}
/** See the room: desks where the teacher seated them, scaled to the screen; when that would make desks too small to
 *  read (a phone), the same desks in seating order (front row first, left to right) as a simple grid. */
function placeRoom() {
  const box = $('hd-roombox'); if (!box) return;
  const desks = [...box.querySelectorAll('.hd-rdesk')], pts = desks.map(el => ({ el, x: +el.dataset.x, y: +el.dataset.y, ...(el.dataset.team ? TEAM_DESK : DESK) }));
  if (!pts.length) return;
  const x0 = Math.min(AREA.x, ...pts.map(p => p.x)) - 20, x1 = Math.max(AREA.x + AREA.w, ...pts.map(p => p.x + p.w)) + 20;
  const y1 = Math.max(...pts.map(p => p.y + p.h)) + 20, k = box.clientWidth / (x1 - x0);
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
  for (const p of pts) { put(p.el, { x: p.x, y: p.y - up, w: p.w, h: p.h }); p.el.style.order = ''; }
  box.style.height = `${(y1 - up - top) * k + 10}px`;
}

// ---------------------------------------------------------------- live state
function applyState(st) {
  if (!st) return;
  const was = JSON.stringify(S.live);
  S.live = st.live || null; S.v = st.v;
  if (Array.isArray(st.cards)) newCards(st.cards);
  teamPad(st);
  if (st.hv !== undefined) S.hv = st.hv;
  const dot = $('hr-live'); if (dot) dot.hidden = !S.live;
  const areaChanged = 'area' in st;
  if (areaChanged) { S.area = st.area || {}; renderWindow(); }
  if (areaChanged || was !== JSON.stringify(S.live)) renderOver();
}
let pollTimer = null;
async function poll() {
  clearTimeout(pollTimer); pollTimer = null;
  if (document.hidden) return;
  try { applyState(await api(`/api/desk/${encodeURIComponent(D.classId)}/state?v=${encodeURIComponent(S.v ?? '')}&hv=${encodeURIComponent(S.hv ?? '')}${S.team ? `&pv=${encodeURIComponent(S.pv ?? '')}` : ''}`, { background: true })); }
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
  const card = e.target.closest('.hd-card[aria-disabled="true"]');
  if (card) { const x = S.cards.find(c => c.id === card.dataset.hdcard); toast(x && x.locked ? td('laterHint') : td('notReadyHint')); return; }
  const pen = e.target.closest('[data-hdpen]');
  if (pen) { S.pen = pen.dataset.hdpen; for (const b of root.querySelectorAll('[data-hdpen]')) { const on = b === pen; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); } return; }
  const a = e.target.closest('[data-hd]'); if (!a) return;
  const k = a.dataset.hd;
  if (k === 'undo') { const last = S.hist.pop(); if (last) { S.strokes = JSON.parse(last); S.fresh.pop(); drawInk(); toolsState(); queueSave(); } }
  else if (k === 'clear') { if (S.strokes.length) { remember(); S.strokes = []; S.fresh = []; drawInk(); toolsState(); queueSave(); } }
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
