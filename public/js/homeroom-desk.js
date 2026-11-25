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
//   - step 3a, live class: the big yellow Raise hand (I have a question, I need help, Bathroom through the hall pass:
//     "You're next", "Go ahead" with the pass timer, I'm back; tap again to put it down), the desk's lock ("Your teacher
//     locked your desk for a moment"), "Your teacher is coming over", a team pad's teammates' cursors, and the pulse
//     (public/js/homeroom-pulse.js) that tells the teacher's board what this desk is doing (never keys or words).
//   - step 3c, their supports (public/js/homeroom-support.js; only their own): Read to me beside the teacher's words,
//     Bigger text, the simpler wording in place of the instructions (from the server), and with extra time their own
//     longer clock for the plan's part on now ("Your time"). Shown as tools, never a label; See the room shows nobody's.
//   - step 4a, the notebook (public/js/notebook.js; docs/decisions.md "Homeroom: the notebook"): Notebook, the dock's last
//     button, and Notes under each handout card (its page in this class's tab of the notebook, named after it).
//   - a shared device (step 1c: signed in with the class sign-in, D.device): "Not you? Switch" signs out and goes back to
//     the names (POST /api/desk/<class>/switch), and when the teacher ends class (the sign-in ends) the desk goes to the
//     sign-in page.
import { t, api, toast, esc, pageData } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { inkLine } from '/js/board-ann.js';
import { areaHtml, fitAreas } from '/js/homeroom-area.js';
import { AREA, TEACHER_DESK, DESK, TEAM_DESK } from '/js/homeroom-seats.js';
import { nowNextHtml } from '/js/homeroom-plan.js';
import { startPulse } from '/js/homeroom-pulse.js';
import { gamePlayer } from '/js/homeroom-player.js';
import { readBtn, wireRead, bigText } from '/js/homeroom-support.js';
import { clock as planClock } from '/js/homeroom-plan-time.js';

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
  // step 3a: this desk's own live desk (hand, hall pass, lock, "coming over"), the teammates' cursors on the pad, the
  // hand menu, and the server's clock (the pass timer counts from it)
  me: null, mates: [], handMenu: false, handBusy: false, skew: 0,
  // step 3c: their supports ({ time, read, simple, big }) and the plan's Now / Next with their own clock
  sup: D.support || null, plan: null, planSkew: 0,
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
          <rect class="hd-paper" x="1" y="1" width="${P.w - 2}" height="${P.h - 2}" rx="14"/><g id="hd-ink"></g><g id="hd-cur"></g><g id="hd-mates" aria-hidden="true"></g></svg></div>
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
  const card = x.locked || !x.ready || !x.href ? `<div class="${cls}" role="group" aria-label="${esc(label)}" aria-disabled="true" data-hdcard="${esc(x.id)}">${inner}</div>`
    : `<a class="${cls}" href="${esc(x.href)}" aria-label="${esc(label)}" data-hdcard="${esc(x.id)}">${inner}</a>`;
  // Read aloud (step 3c): the card's title and the teacher's words, from a button beside the card (never inside its link)
  const read = S.sup && S.sup.read && !x.done ? readBtn([title, x.instructions].filter(Boolean).join('. ')) : '';
  // the handout's note area: its page in this class's tab of the notebook (public/js/notebook.js), named after it
  const note = D.notebook ? `<button type="button" class="hd-notebtn" data-hdnote="${esc(x.id)}" aria-label="${esc(td('notesLabel', { title }))}">${iconHtml('📝', { size: 18 })}<span>${esc(td('notes'))}</span></button>` : '';
  return read || note ? `<div class="hd-cardwrap">${card}${read}${note}</div>` : card;
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
  if (S.me && S.me.locked && S.live) {
    html = `<div class="hd-over hd-pause hd-locked" role="status"><div class="hd-pausein">${iconHtml('🔒', { size: 64 })}<h2>${esc(td('hand.locked'))}</h2><p>${esc(td('hand.lockedHint'))}</p></div></div>`;
  } else if (L.paused) {
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
  const was = JSON.stringify([S.live, S.me && S.me.locked]);
  S.live = st.live || null; S.v = st.v;
  liveDesk(st);
  if (Array.isArray(st.cards)) newCards(st.cards);
  teamPad(st);
  if (st.hv !== undefined) S.hv = st.hv;
  const dot = $('hr-live'); if (dot) dot.hidden = !S.live;
  // The day plan's Now / Next (part names only, no clock: docs/decisions.md "Homeroom: the day plan"); with extra time
  // (step 3c) their own longer clock for the part on now.
  if ('plan' in st) { S.plan = st.plan || null; S.planSkew = S.plan ? Date.now() - S.plan.now : 0; renderNow(); }
  if ('support' in st && JSON.stringify(st.support || null) !== JSON.stringify(S.sup)) { S.sup = st.support || null; applySup(); renderCards(); }
  const areaChanged = 'area' in st;
  if (areaChanged) { S.area = st.area || {}; renderWindow(); }
  if (areaChanged || was !== JSON.stringify([S.live, S.me && S.me.locked])) renderOver();
}
/** The Now line; with extra time, "Your time" counts down to their own end of the part (never "Time's up"). */
function renderNow() {
  const el = $('hd-now'); if (!el) return;
  const p = S.plan, mine = p && p.mine;
  el.hidden = !p;
  const left = mine ? mine.endsAt - (Date.now() - S.planSkew) : 0;
  const html = p ? `${nowNextHtml(p, 0, { clockOn: false })}${mine && left > 0 ? `<span class="hd-mytime">${iconHtml('⏳', { size: 16 })} ${esc(td('myTime'))} <b data-hdmyclock>${esc(planClock(left))}</b></span>` : ''}` : '';
  if (el.innerHTML !== html) el.innerHTML = html;
}
/** Bigger text on the whole desk. */
function applySup() { bigText(root, S.sup && S.sup.big); }
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

// ---------------------------------------------------------------- live class: the hand, the hall pass, the lock (step 3a)
let PULSE = null;
const KINDS = [['question', '💬'], ['help', '🆘'], ['bathroom', '🚻']];
/** The live desk as the state poll or a pulse brought it: { live, me, mates }. */
function liveDesk(st) {
  const live = st.live || null;
  if ('me' in st || !live) {
    const lockWas = !!(S.me && S.me.locked);
    S.me = live ? st.me || null : null;
    if (S.me && S.me.now) S.skew = Date.now() - S.me.now;
    if (!live) S.handMenu = false;
    if (lockWas !== !!(S.me && S.me.locked)) renderOver();
  }
  S.mates = live && Array.isArray(st.mates) ? st.mates : [];
  if (PULSE) PULSE.setLive(live, S.me);
  renderHand(); drawMates();
}
const passLeft = () => { const me = S.me; if (!me || me.pass !== 'out' || !me.outAt) return 0; return Math.round((me.outAt + me.minutes * 60e3 - (Date.now() - S.skew)) / 1000); };
const clock = s => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`;
function handNote() {
  const me = S.me; if (!me) return '';
  const k = me.hand;
  if (me.pass === 'out') {
    const left = passLeft();
    return `<div class="hd-note go" role="status">${iconHtml('🚻', { size: 22 })}<span class="hd-notet"><b>${esc(td('hand.goAhead'))}</b> <span class="hd-passclock${left <= 0 ? ' over' : ''}" id="hd-passclock">${esc(left > 0 ? td('hand.passLeft', { time: clock(left) }) : td('hand.timeUp'))}</span></span>${btn('btn hr-chunk hd-noteb', 'data-hdhand="back"', esc(td('hand.back')))}</div>`;
  }
  if (me.pass === 'line') return `<div class="hd-note" role="status">${iconHtml('🚻', { size: 22 })}<span class="hd-notet"><b>${esc(me.place <= 1 ? td('hand.next') : td('hand.inLine', { count: me.place - 1 }))}</b> <span>${esc(td('hand.lineHint'))}</span></span>${btn('btn hr-chunk hd-noteb', 'data-hdhand="lower"', esc(td('hand.leaveLine')))}</div>`;
  if (k) return `<div class="hd-note up" role="status">${iconHtml(k === 'bathroom' ? '🚻' : '✋', { size: 22 })}<span class="hd-notet"><b>${esc(td(`hand.up.${k}`))}</b> <span>${esc(td(k === 'bathroom' ? 'hand.askedPass' : 'hand.upHint'))}</span></span>${btn('btn hr-chunk hd-noteb', 'data-hdhand="lower"', esc(td('hand.down')))}</div>`;
  if (me.coming) return `<div class="hd-note calm" role="status">${iconHtml('🚶', { size: 22 })}<span class="hd-notet"><b>${esc(td('hand.coming'))}</b></span></div>`;
  return '';
}
function renderHand() {
  const wrap = $('hd-handwrap'); if (!wrap) return;
  const me = S.me, live = S.live;
  if (!live || !me) { wrap.innerHTML = ''; renderNote(''); return; }
  const up = !!me.hand || !!me.pass;
  const menu = S.handMenu ? `<div class="hd-handmenu" id="hd-handmenu" role="menu" aria-label="${esc(td('hand.menu'))}">
    ${up && me.pass !== 'out' ? btn('hd-hmi down', 'role="menuitem" data-hdhand="lower"', `${iconHtml('👇', { size: 22 })} <span>${esc(me.pass === 'line' ? td('hand.leaveLine') : td('hand.down'))}</span>`) : ''}
    ${me.pass === 'out' ? btn('hd-hmi', 'role="menuitem" data-hdhand="back"', `${iconHtml('🏫', { size: 22 })} <span>${esc(td('hand.back'))}</span>`) : ''}
    ${KINDS.map(([k, ic]) => btn(`hd-hmi${me.hand === k ? ' on' : ''}`, `role="menuitemradio" aria-checked="${me.hand === k}" data-hdhand="raise:${k}"${k === 'bathroom' && me.pass ? ' disabled' : ''}`,
      `${iconHtml(ic, { size: 22 })} <span>${esc(td(`hand.${k}`))}</span>${k === 'bathroom' ? `<span class="hd-hmtag">${esc(td('hand.hallPass'))}</span>` : ''}`)).join('')}</div>` : '';
  wrap.innerHTML = `${btn(`btn hr-chunk hr-spark hd-handbtn${up ? ' on' : ''}`, `data-hd="hand" aria-haspopup="menu" aria-expanded="${S.handMenu}"`, `${iconHtml(me.pass ? '🚻' : '✋', { size: 20 })} <span>${esc(me.pass ? td('hand.passBtn') : up ? td('hand.isUp') : td('hand.raise'))}</span>`)}${menu}`;
  renderNote(handNote());
}
let noteShown = '';
function renderNote(html) {
  let el = $('hd-note');
  if (!el) { el = document.createElement('div'); el.id = 'hd-note'; el.className = 'hd-notewrap'; root.querySelector('.hd-top')?.after(el); }
  if (html !== noteShown) { el.innerHTML = html; noteShown = html; }
  el.hidden = !html;
  root.classList.toggle('hd-hasnote', !!html);
}
function tick() {
  if (!S.me || S.me.pass !== 'out') return;
  const el = $('hd-passclock'); if (!el) return;
  const left = passLeft();
  el.textContent = left > 0 ? td('hand.passLeft', { time: clock(left) }) : td('hand.timeUp');
  el.classList.toggle('over', left <= 0);
}
async function handAction(a) {
  if (S.handBusy) return;
  S.handBusy = true; S.handMenu = false;
  const [action, kind] = a.split(':');
  try {
    const r = await api(`/api/desk/${encodeURIComponent(D.classId)}/hand`, { method: 'POST', body: { action, ...(kind ? { kind } : {}) } });
    S.me = r.me || S.me; if (S.me && S.me.now) S.skew = Date.now() - S.me.now;
    if (PULSE) PULSE.input();
    toast(td(action === 'raise' ? (kind === 'bathroom' ? 'hand.toastPass' : 'hand.toastUp') : action === 'back' ? 'hand.toastBack' : 'hand.toastDown'));
  } catch (e) { toast(e.message, { bad: true }); } finally { S.handBusy = false; renderHand(); root.querySelector('[data-hd="hand"]')?.focus(); }
}
/** A team pad's teammates' cursors (their names, the names classmates see), played back over the last couple of
 *  seconds. Nobody else's cursor shows on a student's desk. */
const mateSeen = new Map();
function drawMates() {
  const g = $('hd-mates'); if (!g) return;
  const keep = new Set();
  for (const m of S.mates) {
    keep.add(m.id);
    let el = g.querySelector(`[data-mate="${CSS.escape(m.id)}"]`);
    if (!el) {
      el = document.createElementNS('http://www.w3.org/2000/svg', 'g'); el.setAttribute('class', 'hd-mate'); el.dataset.mate = m.id;
      el.innerHTML = `<path d="M0 0l22 12-10 3-4 10z" fill="#E8833A" stroke="#fff" stroke-width="2"/><text x="20" y="34">${esc(m.name)}</text>`;
      g.appendChild(el);
    }
    // new samples only (the same ones can come with a pulse and a poll), played with their own timing
    const now = S.me && S.me.now ? S.me.now : Date.now() - S.skew, seen = mateSeen.get(m.id) || 0;
    const pts = (m.pts || []).map(([age, x, y]) => [now - age, x, y]).filter(p => p[0] > seen);
    if (!pts.length) continue;
    mateSeen.set(m.id, Math.max(...pts.map(p => p[0])));
    const first = Math.min(...pts.map(p => p[0]));
    for (const [at, x, y] of pts) setTimeout(() => el.setAttribute('transform', `translate(${x * P.w} ${y * P.h})`), at - first);
  }
  for (const el of [...g.children]) if (!keep.has(el.dataset.mate)) el.remove();
}

// ---------------------------------------------------------------- Not you? Switch (a shared device)
async function switchUser(b) {
  b.disabled = true; flush();
  try { const r = await api(`/api/desk/${encodeURIComponent(D.classId)}/switch`, { method: 'POST', body: {} }); location.href = r.redirect || '/hr'; }
  catch { location.href = '/hr'; }
}

// ---------------------------------------------------------------- input
function click(e) {
  // A handout plays inside the desk (public/js/homeroom-player.js); a click for a new tab opens the game page.
  const play = e.target.closest('a.hd-card[data-hdcard]');
  if (play && !(e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) && PL.open(play.dataset.hdcard)) { e.preventDefault(); return; }
  const card = e.target.closest('.hd-card[aria-disabled="true"]');
  if (card) { const x = S.cards.find(c => c.id === card.dataset.hdcard); toast(x && x.locked ? td('laterHint') : td('notReadyHint')); return; }
  const note = e.target.closest('[data-hdnote]');
  if (note) { window.dispatchEvent(new CustomEvent('notebook:open', { detail: { classId: D.classId, handout: note.dataset.hdnote } })); return; }
  const pen = e.target.closest('[data-hdpen]');
  if (pen) { S.pen = pen.dataset.hdpen; for (const b of root.querySelectorAll('[data-hdpen]')) { const on = b === pen; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); } return; }
  const hk = e.target.closest('[data-hdhand]'); if (hk) { handAction(hk.dataset.hdhand); return; }
  const a = e.target.closest('[data-hd]'); if (!a) { if (S.handMenu && !e.target.closest('.hd-handwrap')) { S.handMenu = false; renderHand(); } return; }
  const k = a.dataset.hd;
  if (k === 'hand') { S.handMenu = !S.handMenu; renderHand(); if (S.handMenu) $('hd-handmenu')?.querySelector('button')?.focus(); return; }
  if (k === 'undo') { const last = S.hist.pop(); if (last) { S.strokes = JSON.parse(last); S.fresh.pop(); drawInk(); toolsState(); queueSave(); } }
  else if (k === 'clear') { if (S.strokes.length) { remember(); S.strokes = []; S.fresh = []; drawInk(); toolsState(); queueSave(); } }
  else if (k === 'switch') switchUser(a);
  else if (k === 'desk' || k === 'area' || k === 'room') {
    if (k === 'desk' && PL.current()) PL.close();
    S.view = k === S.view && k !== 'desk' ? 'desk' : k; renderOver();
    if (S.view === 'desk') root.querySelector('.hd-dockbtn[data-hd="desk"]')?.focus();
    else over.querySelector('.hd-back')?.focus();
  }
}
// A handout played inside the desk: the desk's own pulse rests while the game page in the layer pulses for it (one
// pulse, where: game); closing asks for the cards again, so the card shows its progress.
const PL = gamePlayer({
  host: root, path: `/class/${encodeURIComponent(D.classId)}/desk`, back: td('playBack'),
  find: id => { const x = S.cards.find(c => c.id === id); return x && x.href && x.ready && !x.locked ? { href: x.href, title: x.lesson ? td('lessonTitle', { title: x.title }) : x.title, icon: x.lesson ? '📄' : x.icon } : null; },
  onOpen: () => { root.classList.add('hd-playing'); if (PULSE) PULSE.pause(); },
  onClose: () => { root.classList.remove('hd-playing'); if (PULSE) PULSE.resume(); S.hv = ''; poll(); },
});

function start() {
  document.querySelector('main#main')?.classList.add('rm-main');
  S.area = (D.state && D.state.area) || {};
  renderDesk();
  applyState(D.state);
  root.addEventListener('click', click);
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.handMenu) { S.handMenu = false; renderHand(); root.querySelector('[data-hd="hand"]')?.focus(); return; }
    if (e.key === 'Escape' && S.view !== 'desk') { S.view = 'desk'; renderOver(); }
  });
  PULSE = startPulse({ classId: D.classId, where: 'desk', on: () => '', deskEl: () => root.querySelector('.hd-desk'), padEl: () => $('hd-svg'),
    onAnswer: r => liveDesk({ live: r.live, me: r.me, mates: r.mates }) });
  PULSE.setLive(S.live, S.me);
  setInterval(() => { tick(); if (S.plan && S.plan.mine) renderNow(); }, 1000);
  applySup(); wireRead(root);
  body.addEventListener('pointerdown', padDown);
  body.addEventListener('pointermove', padMove);
  body.addEventListener('pointerup', padUp); body.addEventListener('pointercancel', padUp);
  let rz = null; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { fitAreas(root); placeRoom(); }, 120); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else poll(); });
  window.addEventListener('pagehide', flush);
  pollTimer = setTimeout(poll, S.live ? 3000 : 6000);
  PL.sync();   // a handout the address names (#play=<card>): open it again
}
if (root && body) start();
