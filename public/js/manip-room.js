// The manipulatives live room (docs/decisions.md "Virtual math manipulatives: the shared room"; server:
// services/manipulatives.js roomFor/saveArea, services/manip-socket.js). One big board per session, panned and zoomed
// like a whiteboard: the teacher's area across the top (everyone sees it) and a square per student in a grid. A student
// adds and moves things only in their own square (the server keeps them there too); the teacher can work anywhere.
// Everyone sees everyone's cursor; on a touch screen, the last place they touched. Classmates' sticky notes arrive with
// no text (the server never sends it).
// Saving: an area that changed is sent half a second later (POST .../area/<key>), cleaned and checked on the server, and
// the others are told to read the room again. Cursors travel on the socket (memory only); without a socket the page
// falls back to short requests.
// The tools' own code (boards, palettes, taps) comes from public/js/manip.js through open()'s deps.
import { t, api, toast, esc, copyText, ask } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { toolOf, tutorialOf, roomLayout, layoutOf, instructionNotes, stripHeight, stripFullHeight, STRIP, stepsOf, stepStripTexts, TEACHER_STEP_H, checkSummary } from '/js/manip-data.js';
import { WORLD, migrate, fitInto, newBoard, objectTool, kindOf, objSize, objRect, boxesOf, bbox, spotIn, slotsOf, snapFor, groupOf, pieceBox, SNAP_PX, OBJ_MAX, OBJ_MAX_SQUARE, S_MIN, S_MAX,
  snapOpts, linksPieces, nearSpot, ANS, FREE_SIZE, freeResize, rectFrom, inRect, selCount, selKeep, selMoving, selMove, selDelete } from '/js/manip-board.js';
import { paletteAdd } from '/js/manip-pv.js';
import { openWheel, closeWheel, startHold, shake, undoToast, hideUndo, wheelOpen, SLOP } from '/js/manip-wheel.js';
import { clamp, zoomAround, fitView, applyTransform, visible, miniHtml, miniPoint, zoomPillHtml } from '/js/board-view.js';

const PEN_COLORS = ['#FF6B4A', '#141414', '#1F9D63', '#1E88E5'];
// Z_FIT: how far Fit may zoom out (below Z_MIN) so a big class still shows whole on a phone, between its bars.
const NOTE_MAX = 12, Z_MIN = 0.12, Z_MAX = 2.5, Z_FIT = 0.04;
let R = null;
const parse = (s, d) => { try { return typeof s === 'string' ? JSON.parse(s) : s || d; } catch { return d; } };
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const phone = () => window.matchMedia('(max-width: 899px)').matches;
/** Inside Homeroom's player (?in=hr): its own bar names the work and has Raise hand (public/js/homeroom-player.js). */
const inHomeroom = () => document.body.classList.contains('mp-inhr');

/** Leave the room: the socket, the timers, the listeners. */
export function close() {
  if (!R) return;
  for (const x of R.timers) { clearInterval(x); clearTimeout(x); }
  for (const A of R.areas.values()) if (A.saveTimer) { clearTimeout(A.saveTimer); saveNow(A.key); }
  try { if (R.ws) R.ws.close(); } catch { /* gone */ }
  window.removeEventListener('resize', R.onResize);
  document.querySelector('main#main')?.classList.remove('rm-main');
  hideUndo();   // its Undo belongs to this room
  R = null;
}

/** Open the room of session id in root. deps: { IMPL, mkPiece, breakPiece, regroup, newId, boards, host } */
export async function open(root, id, deps) {
  close();
  root.innerHTML = `<p class="muted">${esc(t('js.manip-room.loading'))}</p>`;
  const r = await api(`/api/manipulatives/live/${encodeURIComponent(id)}/room`);
  const room = r.room, impl = deps.IMPL[room.tool];
  R = { root, id, deps, room, impl, tool: toolOf(room.tool), L: roomLayout(room.tool), role: room.role, me: room.me, areas: new Map(), view: { x: 0, y: 0, z: 1 },
    active: room.role === 'teacher' ? 't' : room.me, sel: null, annotate: false, pen: PEN_COLORS[0], editing: null, hist: [], cursors: room.cursors || [],
    seenBring: room.bring ? room.bring.seq : 0, seenPush: 0, timers: [], ws: null, wsOk: false, pointers: new Map(), gesture: null, lastSend: 0, brought: false, stripOpen: new Set(), hands: room.hands || [], handsOpen: false, many: null };
  syncAreas(room);
  root.innerHTML = `<div class="rm${R.role === 'teacher' ? ' rm-teacher' : ''}" id="rm" tabindex="-1">
    <div class="rm-world" id="rm-world"></div><div class="rm-cursors" id="rm-cursors" aria-hidden="true"></div>
    <div class="rm-bar" id="rm-bar"></div><aside class="mp-side rm-pal" id="rm-pal" aria-label="${esc(t('js.manip-room.palette'))}"></aside>
    <div class="rm-float rm-zoomdesk" id="rm-zoom"></div><div class="rm-float rm-minifloat" id="rm-mini"></div>
    <div id="rm-handlist"></div><div id="rm-menu"></div><div id="rm-banner"></div><div class="mp-selbox" id="rm-selbox" hidden></div><div class="mp-selpill rm-selpill" id="rm-selpill" role="group" aria-live="polite" hidden></div>${btn('btn btn-primary btn-big rm-back', `id="rm-back" data-rtool="mine" hidden`, `${iconHtml('🏠', { size: 18 })} ${esc(t('js.manip-room.backMine'))}`)}</div>`;
  document.querySelector('main#main')?.classList.add('rm-main');
  renderWorld(); renderBar(); renderPal();
  requestAnimationFrame(() => { if (R.role === 'teacher') fitAll(); else goMine(); });
  bind();
  R.onResize = () => applyView(); window.addEventListener('resize', R.onResize);
  R.deps.bindTrayDrag(document.getElementById('rm-pal'), { item: i => { const A = R.areas.get(R.active); return A ? palette(A)[i] : null; }, zoom: () => R.view.z, drop: roomDrop });
  connect();
  R.timers.push(setInterval(() => { if (!document.hidden) refresh(); }, 2500));
}

// ---------------------------------------------------------------- areas
/** A square's (or the teacher's area's) saved state, as this page works on it: format 2 (an older square keeps its
 *  places: it was already in square pixels), a new square with one object of the tool in its middle. */
function stateOf(text, space) {
  const slug = R.room.tool, raw = parse(text, {}) || {};
  const o = migrate(slug, Object.keys(raw).length ? raw : newBoard(slug, space), { at: { x: 0, y: 0 }, space, from: space }), ann = o.__ann || {}, steps = stepsOf(o);
  const rest = { ...o }; delete rest.__ann; delete rest.__steps;
  const st = R.deps.normalize(slug, R.impl, rest);
  return { st, steps, ann: { notes: Array.isArray(ann.notes) ? ann.notes.slice(0, NOTE_MAX) : [], strokes: Array.isArray(ann.strokes) ? ann.strokes : [], texts: Array.isArray(ann.texts) ? ann.texts.slice(0, 30) : [] } };
}
/** The server's room into R.areas, keeping any area this page is still changing. -> true when squares came or went. */
function syncAreas(room) {
  const keys = new Set(['t', ...room.areas.map(a => a.key)]);
  let changed = false;
  // The room's sizes: grown when a board placed in it needed more room (the teacher's area's `layout`).
  const lay = JSON.stringify(layoutOf(parse(room.teacher && room.teacher.state, {}) || {}));
  if (lay !== R.layKey) { R.layKey = lay; R.L = roomLayout(room.tool, JSON.parse(lay)); changed = true; }
  for (const k of [...R.areas.keys()]) if (!keys.has(k)) { R.areas.delete(k); changed = true; }
  const put = (key, src, meta) => {
    const A = R.areas.get(key);
    const typing = document.activeElement && document.activeElement.matches && document.activeElement.matches('.mp-answer, .mp-seglabel, .mp-segval') && document.activeElement.closest(`.rm-area[data-key="${CSS.escape(key)}"]`);
    if (A && (typing || A.saveTimer || A.saving || (R.gesture && R.gesture.key === key) || (R.editing && R.editing.key === key) || (R.textEdit && R.textEdit.key === key))) { Object.assign(A, meta); return; }
    if (A && A.updatedAt === src.updatedAt && !!A.hidden === !!meta.hidden) { Object.assign(A, meta); return; }
    const A0 = { key, ...meta };
    R.areas.set(key, { ...A0, ...stateOf(src.state, workSize(A0)), updatedAt: src.updatedAt, lastAdd: A ? A.lastAdd : null });
    if (!A) changed = true; else if (key === 't') changed = true; else if (R.world) renderArea(key);
  };
  put('t', room.teacher, { name: t('js.manip-room.teacherArea'), color: '#FFD23F', rect: R.L.teacher, editable: R.role === 'teacher', mine: false, hidden: false });
  for (const a of room.areas) put(a.key, a, { name: a.name, color: a.color, rect: R.L.slot(a.slot), editable: R.role === 'teacher' || a.mine, mine: !!a.mine, slot: a.slot, hidden: !!a.hidden });
  return changed;
}
const world = () => R.L.world(Math.max(1, ...[...R.areas.values()].map(a => (a.slot ?? -1) + 1)));
function renderWorld() {
  const el = document.getElementById('rm-world'); if (!el) return;
  const wd = world();
  el.style.width = `${wd.w}px`; el.style.height = `${wd.h}px`;
  el.innerHTML = [...R.areas.values()].sort((a, b) => (a.key === 't' ? -1 : b.key === 't' ? 1 : a.slot - b.slot)).map(areaHtml).join('');
  R.world = el;
  for (const A of R.areas.values()) { bindArea(A.key); const ael = !A.hidden && el.querySelector(`.rm-area[data-key="${CSS.escape(A.key)}"]`); if (ael) R.deps.growAnswers(ael, A.st, workSize(A)); }
  applyView();
}
function areaHtml(A) {
  const r = A.rect;
  const label = A.key === 't' ? `✦ ${esc(A.name)} · ${esc(t('js.manip-room.teacherAreaNote'))}` : labelHtml(A);
  return `<section class="rm-area${A.key === 't' ? ' teach' : ''}${A.mine ? ' mine' : ''}${R.role === 'teacher' && R.active === A.key ? ' active' : ''}${A.editable ? ' editable' : ''}" data-key="${esc(A.key)}"
    style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;--c:${esc(A.color)}" aria-label="${esc(A.name)}">
    <header class="rm-label">${label}</header>${areaInner(A)}</section>`;
}
const handUp = key => R.hands.some(h => h.k === key);
function labelHtml(A) {
  const c = R.role === 'teacher' && R.room.checks && R.room.checks[A.key];
  return `<span class="rm-dot"></span>${esc(A.name)}${A.mine ? ` · ${esc(t('js.manip-room.mySquare'))}` : ''}${handUp(A.key) ? `<span class="rm-handbadge" aria-label="${esc(t('js.manip-room.handUp'))}">✋</span>` : ''}${c ? `<span class="rm-checkbadge${c.right === c.total ? ' all' : ''}">${esc(t('js.manip-room.checkScore', { right: c.right, total: c.total }))}</span>` : ''}`;
}
/** "Check my answers": on (the teacher's switch) and this student's square has answer boxes. */
const checksOn = () => (R.areas.get('t') || { st: {} }).st.checks === true;
const myBoxes = () => { const A = R.areas.get(R.me); return A ? A.st.objects.filter(o => o.k === 'answer' || o.k === 'frac-eq') : []; };
async function checkMine() {
  const answers = {}; for (const o of myBoxes()) answers[o.id] = String(o.st.ans || '');
  try {
    const r = await api(`/api/manipulatives/live/${R.id}/check`, { method: 'POST', body: { answers } });
    // Everything right: a cheer, never "Try again on the others" (there are none); else how many and a nudge.
    R.checked = r.results; renderArea(R.me);
    toast(r.right >= r.total ? t('js.manip-room.checkAll', { total: r.total }) : t('js.manip-room.checkResult', { right: r.right, total: r.total }));
  } catch (e) { toast(e.message, { bad: true }); }
}
/** Raised hands changed (the socket, or a read of the room): badges, the student's button, the teacher's list. */
function setHands(list) {
  const before = R.hands.map(h => h.k).join(), more = list.length > R.hands.length;
  R.hands = Array.isArray(list) ? list : [];
  if (before === R.hands.map(h => h.k).join()) return;
  for (const A of R.areas.values()) { if (A.key === 't') continue; const el = R.world && R.world.querySelector(`.rm-area[data-key="${CSS.escape(A.key)}"] .rm-label`); if (el) el.innerHTML = labelHtml(A); }
  renderCursors(); renderHandButtons();
  if (R.role === 'teacher' && more) { const b = document.getElementById('rm-hands'); if (b) { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); } }
}
function renderHandButtons() {
  const mine = handUp(R.me);
  for (const b of document.querySelectorAll('[data-rtool="hand"]')) { b.classList.toggle('on', mine); b.setAttribute('aria-pressed', String(mine)); b.querySelector('.rm-handt').textContent = mine ? t('js.manip-room.lowerHand') : t('js.manip-room.raiseHand'); }
  const tb = document.getElementById('rm-hands');
  if (tb) { tb.querySelector('.rm-handt').textContent = handsLabel(); tb.classList.toggle('on', R.hands.length > 0); }
  renderHandList();
}
/** The teacher's list of raised hands, in the order they went up (roster names). */
function renderHandList() {
  const el = document.getElementById('rm-handlist'); if (!el) return;
  if (R.role !== 'teacher' || !R.handsOpen) { el.innerHTML = ''; return; }
  const list = R.hands.map(h => ({ h, A: R.areas.get(h.k) })).filter(x => x.A);
  el.innerHTML = `<div class="rm-handlist panel" role="dialog" aria-label="${esc(t('js.manip-room.handsTitle'))}"><div class="row"><b>${iconHtml('✋', { size: 18 })} ${esc(t('js.manip-room.handsTitle'))}</b><span class="rm-grow"></span>${list.length ? btn('btn btn-sm', 'data-hlow="all"', esc(t('js.manip-room.lowerAll'))) : ''}${btn('btn btn-sm btn-ghost', 'data-rtool="hands"', '✕')}</div>
    ${list.length ? `<ol>${list.map(({ A }) => `<li><span class="rm-dot" style="background:${esc(A.color)}"></span>${btn('rm-hgo', `data-hgo="${esc(A.key)}"`, esc(A.name))}${btn('btn btn-sm', `data-hlow="${esc(A.key)}" aria-label="${esc(t('js.manip-room.lowerOne', { name: A.name }))}"`, esc(t('js.manip-room.lower')))}</li>`).join('')}</ol>` : `<p class="small muted">${esc(t('js.manip-room.noHands'))}</p>`}</div>`;
}
/** The teacher's "Instructions" strip at the top of every student square: the teacher's area's notes, numbered. */
const deck = () => R.room.deck || { total: 0, cur: 0, list: [] };
/** A square's strip: in step mode, the step this viewer may see (a student: their own; the teacher: that student's);
 *  otherwise the teacher's notes. -> { mode, texts (for its height), h, full, i, text, earlier } */
function strip(A) {
  const d = deck();
  if (d.total) {
    const i = R.role === 'teacher' && A && d.mine && A.key in d.mine ? d.mine[A.key] : d.cur;
    const texts = stepStripTexts(d.list, i, d.total), cur = d.list[i];
    return { mode: 'step', texts, h: stripHeight(texts, R.L.sq), full: stripFullHeight([cur ? cur.text : '', ...d.list.slice(0, i).map(x => x.text)], R.L.sq), i, text: cur ? cur.text : '', earlier: d.list.slice(0, i) };
  }
  const T = R.areas.get('t'), texts = instructionNotes(T ? T.ann.notes : []);
  return { mode: 'notes', texts, h: stripHeight(texts, R.L.sq), full: stripFullHeight(texts, R.L.sq) };
}
/** A square's work space: its size under the strip; the teacher's area under its big step card in step mode. */
const workSize = A => (A.key === 't' ? { w: A.rect.w, h: A.rect.h - (deck().total ? TEACHER_STEP_H : 0) } : { w: A.rect.w, h: A.rect.h - strip(A).h });
const topOf = A => (A.key === 't' ? (deck().total ? TEACHER_STEP_H : 0) : strip(A).h);
function stripHtml(A) {
  if (A.key === 't') {
    const d = deck(); if (!d.total) return '';
    const cur = d.list[d.cur];
    return `<div class="rm-tstep" style="height:${TEACHER_STEP_H}px"><span class="rm-stepno">${esc(t('js.manip-room.stepOf', { n: d.cur + 1, total: d.total }))}</span><p>${esc(cur ? cur.text : '')}</p></div>`;
  }
  const sp = strip(A); if (!sp.h) return '';
  const open = R.stripOpen.has(A.key), more = sp.full > sp.h || (sp.mode === 'step' && sp.earlier.length);
  const own = R.role === 'student' && A.key === R.me, paceBtns = sp.mode === 'step' && own && deck().pace && R.room.status === 'active'
    ? `${btn('rm-stepbtn', `data-mystep="-1"${sp.i ? '' : ' disabled'} aria-label="${esc(t('js.manip-room.back'))}"`, '◀')}${btn('rm-stepbtn', `data-mystep="1"${sp.i + 1 < deck().total ? '' : ' disabled'} aria-label="${esc(t('js.manip-room.next'))}"`, '▶')}` : '';
  const head = sp.mode === 'step' ? `${iconHtml('📌', { size: 18 })} ${esc(t('js.manip-room.stepOf', { n: sp.i + 1, total: deck().total }))}` : `${iconHtml('📌', { size: 18 })} ${esc(t('js.manip-room.instructions'))}`;
  const body = sp.mode === 'step'
    ? `${open && sp.earlier.length ? `<ol class="rm-earlierlist">${sp.earlier.map(x => `<li>${esc(x.text)}</li>`).join('')}</ol>` : ''}<p class="rm-steptext">${esc(sp.text)}</p>`
    : `<ol style="max-height:${open ? 'none' : `${sp.h - STRIP.head - STRIP.pad}px`}">${sp.texts.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
  const toggle = more ? btn(open ? 'rm-more' : 'rm-more low', `data-strip="${esc(A.key)}" aria-expanded="${open}"`, esc(open ? t('js.manip-room.less') : sp.mode === 'step' && sp.earlier.length ? t('js.manip-room.earlier', { n: sp.earlier.length }) : t('js.manip-room.more'))) : '';
  return `<div class="rm-strip${open ? ' open' : ''}" data-stripkey="${esc(A.key)}" style="${open ? 'min-height' : 'height'}:${sp.h}px" role="note" aria-label="${esc(t('js.manip-room.instructions'))}">
    <div class="rm-striphead"><b>${head}</b>${paceBtns}${open ? toggle : ''}</div>${body}${more && !open ? `<span class="rm-fade" aria-hidden="true"></span>${toggle}` : ''}</div>`;
}
function areaInner(A) {
  // A classmate's square while the teacher hides work: the server sent nothing of it; a frosted panel drawn from nothing.
  if (A.hidden) return `<div class="rm-body">${stripHtml(A)}<div class="rm-in rm-frost" style="top:${topOf(A)}px"><span>${iconHtml('🔒', { size: 18 })} ${esc(t('js.manip-room.hiddenWork'))}</span></div></div>`;
  const sel = R.sel && R.sel.key === A.key ? R.sel.id : null, osel = R.osel && R.osel.key === A.key ? R.osel.id : null, ws = workSize(A), many = R.many && R.many.key === A.key ? R.many : null;
  const lifted = R.lifted && R.lifted.key === A.key ? R.lifted.id : null, flipIn = R.flipIn && R.flipIn.key === A.key ? R.flipIn.id : null;
  return `<div class="rm-body">${stripHtml(A)}<div class="rm-in" style="top:${topOf(A)}px"><div class="mp-content mp-abs">${R.deps.boardHtml(R.room.tool, R.impl, A.st, { sel, osel, many, readOnly: !A.editable || R.room.status !== 'active', snapped: R.snapped, fresh: R.fresh, traded: R.traded && R.traded.key === A.key ? R.traded.ids : null, totals: totalsOn(), checked: A.key === R.me ? R.checked : null, lifted, flipIn })}</div>
    <svg class="mp-ink" viewBox="0 0 ${ws.w} ${ws.h}" aria-hidden="true">${inkOf(A)}</svg>
    <div class="mp-texts">${A.ann.texts.map(x => textHtml(A, x)).join('')}</div><div class="mp-notes">${A.ann.notes.map((n, i) => noteHtml(A, n, i)).join('')}</div></div></div>`;
}
/** Board text (T): plain words in the theme's ink; while being written, a field with its ×. */
function textHtml(A, x) {
  const editing = !!(R.textEdit && R.textEdit.key === A.key && R.textEdit.id === x.id && canEditNote(A, x));
  return R.deps.textBoxHtml(x, { editing, ro: !canEditNote(A, x), del: 'data-rtx', id: `rt-${x.id}`, label: t('js.manip-room.textLabel'), ph: t('js.manip-room.textPh'), delLabel: t('js.manip-room.textDelete') });
}
const canEditNote = (A, n) => A.editable && R.room.status === 'active' && (R.role === 'teacher' || n.by !== 't');
function noteHtml(A, n, i) {
  const pos = `left:${(+n.x || 0) * 100}%;top:${(+n.y || 0) * 100}%`;
  if (n.blank) return `<div class="mp-sticky rm-blank" style="${pos}" aria-label="${esc(t('js.manip-room.classmateNote'))}"><p class="rm-lines"><i></i><i></i><i></i></p></div>`;
  const edit = canEditNote(A, n), id = esc(n.id);
  if (edit && R.editing && R.editing.key === A.key && R.editing.id === n.id) {
    return `<div class="mp-sticky editing" data-note="${id}" style="${pos}"><label class="sr-only" for="rn-${id}">${esc(t('js.manip-room.noteText', { n: i + 1 }))}</label>
      <textarea id="rn-${id}" class="mp-notetext" rows="3" maxlength="300" placeholder="${esc(t('js.manip-room.notePh'))}">${esc(n.text)}</textarea>
      <div class="row">${btn('mp-nbtn', `data-nact="done" data-id="${id}"`, esc(t('js.manip-room.done')))}${btn('mp-nbtn bad', `data-nact="delete" data-id="${id}"`, esc(t('js.manip-room.delete')))}</div></div>`;
  }
  return `<div class="mp-sticky${n.by === 't' ? ' rm-tnote' : ''}" data-note="${id}" role="group" aria-label="${esc(t('js.manip-room.noteN', { n: i + 1 }))}" style="${pos}">${n.by === 't' && A.key !== 't' ? `<span class="rm-from">✦ ${esc(t('js.manip-room.teacher'))}</span>` : ''}<p>${n.text ? esc(n.text) : `<span class="mp-ph">${esc(t('js.manip-room.noteTap'))}</span>`}</p>
    ${edit ? `<div class="row">${btn('mp-nbtn', `data-nact="edit" data-id="${id}"`, `${iconHtml('✎', { size: 18 })} ${esc(t('js.manip-room.edit'))}`)}${btn('mp-nbtn bad', `data-nact="delete" data-id="${id}"`, esc(t('js.manip-room.delete')))}</div>` : ''}</div>`;
}
/** Totals on objects: the teacher always; students unless the teacher turned them off (the teacher's area's
 *  `totals`; a practice board starts with them off). */
const totalsOn = () => R.role === 'teacher' || (R.areas.get('t') || { st: {} }).st.totals !== false;
/** Pen marks in square pixels (see public/js/manip.js inkLine: a mark of one point is not drawn). */
function inkOf(A) { const ws = workSize(A); return A.ann.strokes.map(s => R.deps.inkLine(s, ws.w, ws.h)).join(''); }
function renderArea(key) {
  const A = R.areas.get(key), el = R.world && R.world.querySelector(`.rm-area[data-key="${CSS.escape(key)}"]`);
  if (!A || !el) return;
  if (R.many && R.many.key === key) setMany(key, A.editable ? selKeep(A.st, R.many) : null);   // what went away (or a room that ended) leaves the selection
  el.classList.toggle('active', R.role === 'teacher' && R.active === key);
  el.querySelector('.rm-body').outerHTML = areaInner(A);
  bindArea(key); R.fresh = null; if (R.traded && R.traded.key === key) R.traded = null;
  if (!A.hidden) R.deps.growAnswers(el, A.st, workSize(A));   // a long answer shows whole (its box grows; saved with its next change)
  const ta = el.querySelector('textarea.mp-notetext, textarea.mp-textin'); if (ta) ta.focus({ preventScroll: true });
  renderSelPill();
}
// ---------------------------------------------------------------- many at once, in one square (public/js/manip.js setMany)
/** The selection in square key (a selection box, Shift+click): one thing is the usual R.sel or R.osel; two or more are
 *  R.many { key, p, o }. Anything selected in another square is let go of. */
function setMany(key, m) {
  const n = selCount(m);
  R.many = n > 1 ? { key, p: m.p, o: m.o } : null;
  R.sel = n === 1 && m.p.size ? { key, id: [...m.p][0] } : null;
  R.osel = n === 1 && m.o.size ? { key, id: [...m.o][0] } : null;
}
const curSel = key => (R.many && R.many.key === key ? R.many : { p: new Set(R.sel && R.sel.key === key ? [R.sel.id] : []), o: new Set(R.osel && R.osel.key === key ? [R.osel.id] : []) });
/** The squares that show something selected now. */
const selKeys = () => new Set([R.sel, R.osel, R.many].filter(Boolean).map(x => x.key));
/** Change the selection and draw again every square it was or is in. */
function reselect(fn) { const was = selKeys(); fn(); for (const k of new Set([...was, ...selKeys()])) renderArea(k); renderPal(); renderSelPill(); }
/** Shift+click in square key: a piece (k 'p') or object ('o') joins the selection there, or leaves it. */
function toggleSel(key, k, it) {
  if (it.locked) return;
  const m = curSel(key), c = { p: new Set(m.p), o: new Set(m.o) };
  if (c[k].has(it.id)) c[k].delete(it.id); else c[k].add(it.id);
  setMany(key, c);
}
function renderSelPill() {
  const el = document.getElementById('rm-selpill'); if (!el || !R) return;
  const n = selCount(R.many); el.hidden = !n;
  el.innerHTML = n ? R.deps.selPillHtml(n, { count: t('js.manip-room.selCount', { n }), del: t('js.manip-room.selDelete'), delLabel: t('js.manip-room.selDeleteN', { n }), clear: t('js.manip-room.selClear') }) : '';
  const bar = document.getElementById('rm-bar'); if (n && bar) el.style.top = `${bar.offsetTop + bar.offsetHeight + 10}px`;
}
/** Delete everything selected in its square: one Undo step (and an Undo on the toast). */
function deleteMany() {
  const m = R.many; if (!m) return;
  const n = selCount(m);
  edit(m.key, (st, v) => { if (!selDelete(st, m)) return false; R.many = null; v.sel = null; v.osel = null; });
  const mark = R.hist.length;
  undoToast(t('js.manip-room.selDeleted', { n }), t('js.manip-room.undo'), () => { if (R && R.hist.length === mark) toolButton('undo'); });
}
/** Delete or Backspace deletes what is selected, Escape lets go (never while typing or with a wheel open). */
const typing = el => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
document.addEventListener('keydown', e => {
  if (!R || !document.getElementById('rm') || typing(e.target)) return;
  if (e.code === 'Space') { if (!e.target.closest?.('button, a') && (document.getElementById('rm').matches(':hover') || R.spaceDown)) { e.preventDefault(); R.spaceDown = true; document.getElementById('rm').classList.add('rm-grab'); } return; }
  if (!R.many || wheelOpen()) return;
  if (e.key === 'Escape') { e.preventDefault(); reselect(() => { R.many = null; }); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteMany(); }
});
const spaceUp = () => { if (!R) return; R.spaceDown = false; document.getElementById('rm')?.classList.remove('rm-grab'); };
document.addEventListener('keyup', e => { if (e.code === 'Space') spaceUp(); });
window.addEventListener('blur', spaceUp);
/** Where a screen point falls in square key's work space (its pixels). */
function inArea(key, cx, cy) {
  const inn = R.world && R.world.querySelector(`.rm-area[data-key="${CSS.escape(key)}"] .rm-in`); if (!inn) return { x: 0, y: 0 };
  const r = inn.getBoundingClientRect(); return { x: (cx - r.left) / R.view.z, y: (cy - r.top) / R.view.z };
}
function bindArea(key) {
  const A = R.areas.get(key), el = R.world.querySelector(`.rm-area[data-key="${CSS.escape(key)}"]`);
  if (A && el && A.editable && R.impl.bind && R.room.status === 'active') R.impl.bind(el.querySelector('.mp-content'), { find: id => A.st.objects.find(o => o.id === id), before: () => JSON.stringify({ st: A.st, ann: A.ann }), blocked: () => R.annotate || R.textMode,
    done: before => { R.hist.push([key, before]); if (R.hist.length > 60) R.hist.shift(); renderArea(key); renderPal(); queueSave(key); } });
}

// ---------------------------------------------------------------- changing an area, saving it
function edit(key, fn) {
  const A = R.areas.get(key);
  if (!A || !A.editable || R.room.status !== 'active') return;
  const before = JSON.stringify({ st: A.st, ann: A.ann });
  const sel = { sel: R.sel && R.sel.key === key ? R.sel.id : null, osel: R.osel && R.osel.key === key ? R.osel.id : null };
  if (fn(A.st, sel, A) === false) return;
  settle(A, sel);
  R.sel = sel.sel ? { key, id: sel.sel } : R.sel && R.sel.key === key ? null : R.sel;
  R.osel = sel.osel ? { key, id: sel.osel } : R.osel && R.osel.key === key ? null : R.osel;
  R.fresh = sel.fresh || null; if (sel.lastAdd) A.lastAdd = sel.lastAdd;   // a new piece or object: a soft highlight where it landed, never its buttons
  R.hist.push([key, before]); if (R.hist.length > 60) R.hist.shift();
  renderArea(key); renderPal(); queueSave(key);
}
/** Regroup and lay out the square's place-value charts after a change (manip.js settleBoard); the new pieces pop. */
function settle(A, v = {}) {
  R.deps.settleBoard(R.room.tool, A.st, v, workSize(A));
  if (v.traded && v.traded.size) R.traded = { key: A.key, ids: v.traded };
}
function queueSave(key) {
  const A = R.areas.get(key); if (!A) return;
  if (key === 't') stripsLater();
  clearTimeout(A.saveTimer);
  A.saveTimer = setTimeout(() => saveNow(key), 450);
}
async function saveNow(key) {
  const A = R && R.areas.get(key); if (!A) return;
  A.saveTimer = null; A.saving = true;
  try {
    await api(`/api/manipulatives/live/${R.id}/area/${encodeURIComponent(key)}`, { method: 'POST', body: { state: { ...A.st, v: 2, ...(A.key === 't' ? { __steps: A.steps || [] } : {}), __ann: { notes: A.ann.notes, strokes: A.ann.strokes, texts: A.ann.texts.filter(x => String(x.text || '').trim()) } } } });
    A.updatedAt = -1;   // read it back on the next refresh (the server may have kept a teacher's note)
  } catch (e) { toast(e.message, { bad: true }); A.updatedAt = -1; }
  finally { A.saving = false; }
}
async function refresh() {
  if (!R) return;
  let room; try { room = (await api(`/api/manipulatives/live/${R.id}/room`, { background: true })).room; } catch (e) { if (e.status === 404 && R) { R.root.innerHTML = `<div class="empty"><h1>${esc(t('js.manip-room.gone'))}</h1><p><a href="#">${esc(t('js.manip-room.back'))}</a></p></div>`; close(); } return; }
  if (!R) return;
  const was = R.room; R.room = room;
  if (syncAreas(room)) renderWorld();
  if (!R.wsOk) { R.cursors = room.cursors || []; renderCursors(); setHands(room.hands || []); }
  if (room.bring && room.bring.seq > R.seenBring) onBring(room.bring);
  if (JSON.stringify(was.deck) !== JSON.stringify(room.deck)) {
    renderWorld(); renderBar(); renderPal();
    // A student's step changed: a short, gentle highlight on the strip (none with reduced motion: app.css).
    const old = was.deck || {}, now = room.deck || {};
    if (R.role === 'student' && (old.cur !== now.cur || old.total !== now.total)) for (const el of document.querySelectorAll('.rm-strip')) el.classList.add('flash');
  }
  if (JSON.stringify(was.checks || {}) !== JSON.stringify(room.checks || {})) { for (const A of R.areas.values()) { if (A.key === 't') continue; const el = R.world && R.world.querySelector(`.rm-area[data-key="${CSS.escape(A.key)}"] .rm-label`); if (el) el.innerHTML = labelHtml(A); } renderMenu(); }
  if (R.role === 'student' && R.lastChecksOn !== checksOn()) { R.lastChecksOn = checksOn(); renderBar(); }
  if (was.status !== room.status || was.pushedAt !== room.pushedAt || was.areas.length !== room.areas.length || was.showWork !== room.showWork) { renderBar(); if (was.status !== room.status) { renderWorld(); renderPal(); } }
  if (was.status !== 'active' && room.status === 'active' && !R.ws) connect();   // the teacher reopened the room
}
let stripTimer = null;
/** The teacher changed their area: every square's strip (and work space) follows, a moment after the last change. */
function stripsLater() {
  clearTimeout(stripTimer);
  stripTimer = setTimeout(() => { if (!R) return; for (const A of R.areas.values()) if (A.key !== 't' && !(R.editing && R.editing.key === A.key)) renderArea(A.key); }, 300);
}
let refreshSoon = null;
const refreshLater = () => { clearTimeout(refreshSoon); refreshSoon = setTimeout(refresh, 150); };

// ---------------------------------------------------------------- the socket: cursors, changes, bring, end
function connect() {
  if (!R || R.room.status !== 'active') return;
  let ws;
  try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/manipulatives/ws?s=${encodeURIComponent(R.id)}`); } catch { return; }
  R.ws = ws;
  ws.onopen = () => { if (R && R.ws === ws) R.wsOk = true; };
  ws.onmessage = ev => {
    if (!R || R.ws !== ws) return;
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'cur' || m.t === 'hi') { R.cursors = m.t === 'cur' ? m.list : m.cur || []; renderCursors(); }
    if (m.t === 'hands' || m.t === 'hi') setHands(m.t === 'hands' ? m.list : m.hands || []);
    if (m.t === 'dirty' || m.t === 'step') refreshLater();
    if (m.t === 'bring' && m.seq > R.seenBring) onBring(m);
    if (m.t === 'end') refresh();
  };
  ws.onclose = () => {
    if (!R || R.ws !== ws) return;
    R.wsOk = false; R.ws = null;
    if (R.room.status === 'active') R.timers.push(setTimeout(connect, 3000));
  };
}
/** My pointer, in room pixels: on the socket (10 a second at most), else a short request (2 a second). */
function sendCursor(e) {
  const now = Date.now(), wsOn = R.ws && R.wsOk, gap = wsOn ? 100 : 500;
  const p = toWorld(e.clientX, e.clientY), msg = { x: Math.round(p.x), y: Math.round(p.y), touch: e.pointerType === 'touch' };
  // Too soon: keep the latest place and send it when the gap is up, so where the pointer stops is always sent.
  if (now - R.lastSend < gap) { R.nextCursor = msg; if (!R.cursorTimer) R.cursorTimer = setTimeout(() => { if (!R) return; R.cursorTimer = null; const m = R.nextCursor; R.nextCursor = null; if (m) sendMsg(m); }, gap - (now - R.lastSend)); return; }
  sendMsg(msg);
}
function sendMsg(msg) {
  const wsOn = R.ws && R.wsOk;
  R.lastSend = Date.now();
  if (wsOn) { try { R.ws.send(JSON.stringify({ t: 'c', ...msg })); } catch { /* reconnecting */ } }
  else if (R.room.status === 'active') api(`/api/manipulatives/live/${R.id}/cursor`, { method: 'POST', body: msg, background: true }).catch(() => {});
}
function renderCursors() {
  const el = document.getElementById('rm-cursors'); if (!el || !R) return;
  const v = R.view;
  el.innerHTML = R.cursors.filter(c => c.k !== R.me).map(c => {
    const teacher = c.k === 't', A = teacher ? null : R.areas.get(c.k); if (!teacher && !A) return '';
    const color = teacher ? '#141414' : A.color, name = teacher ? `✦ ${t('js.manip-room.teacher')}` : `${A.name}${handUp(c.k) ? ' ✋' : ''}`;
    const mark = c.touch ? `<span class="rm-touch" style="--c:${teacher ? '#FFD23F' : esc(color)}"></span>`
      : `<svg class="rm-arrow" width="22" height="26" viewBox="0 0 22 26"><path d="M2 2 L2 21 L7.5 16 L11 24 L14.5 22.5 L11 14.5 L18.5 14.5 Z" fill="${esc(color)}" stroke="${teacher ? '#FFD23F' : '#fff'}" stroke-width="${teacher ? 2.5 : 2}" stroke-linejoin="round"/></svg>`;
    return `<div class="rm-cursor${teacher ? ' teacher' : ''}" data-k="${esc(c.k)}" style="transform:translate(${v.x + c.x * v.z}px,${v.y + c.y * v.z}px)">${mark}<span class="rm-tag" style="background:${esc(color)}">${esc(name)}</span></div>`;
  }).join('');
}

// ---------------------------------------------------------------- the view: pan, zoom, fit, my square, bring
function size() { const el = document.getElementById('rm'); return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 800, h: 600 }; }
const toWorld = (cx, cy) => { const r = document.getElementById('rm').getBoundingClientRect(); return { x: (cx - r.left - R.view.x) / R.view.z, y: (cy - r.top - R.view.y) / R.view.z }; };
function applyView() {
  if (!R || !R.world) return;
  applyTransform(R.world, R.view);
  renderCursors(); renderMini();
  const pct = document.querySelectorAll('.rm-pct'); for (const p of pct) p.textContent = `${Math.round(R.view.z * 100)}%`;
}
function zoomAt(f, sx, sy) {
  R.view = zoomAround(R.view, f, sx, sy, Math.min(Z_MIN, R.view.z), Z_MAX);   // never further out than Fit went
  applyView();
}
/** Show a room rectangle, as big as fits between the bars. */
function fitRect(rect, pad = 24) {
  const s = size(), top = (document.getElementById('rm-bar')?.offsetHeight || 60) + 24, left = !phone() ? (document.getElementById('rm-pal')?.offsetWidth || 0) + 32 : 8;
  const bottom = phone() ? (document.getElementById('rm-pal')?.offsetHeight || 0) + 16 : 16;
  R.view = fitView(rect, { left, top, w: Math.max(100, s.w - left - 16), h: Math.max(100, s.h - top - bottom) }, { pad, zMin: Z_FIT, zMax: Z_MAX });
  applyView();
}
const fitAll = () => { const w = world(); fitRect({ x: 0, y: 0, w: w.w, h: w.h }); };
function goMine() {
  const A = R.areas.get(R.me);
  if (A) fitRect({ x: A.rect.x, y: A.rect.y - 36, w: A.rect.w, h: A.rect.h + 36 }, 12); else fitAll();
  R.brought = false; renderBanner();
}
/** Bring a room point on screen (centered) if it is not already well inside the view. */
function showSpot(wx, wy) {
  const s = size(), sx = R.view.x + wx * R.view.z, sy = R.view.y + wy * R.view.z;
  if (sx > 240 && sx < s.w - 120 && sy > 120 && sy < s.h - 160) return;
  R.view.x = s.w / 2 - wx * R.view.z; R.view.y = s.h / 2 - wy * R.view.z; applyView();
}
/** What this screen shows, as a room rectangle (what "Bring everyone to me" sends). */
function visibleRect() { return visible(R.view, size()); }
function onBring(b) {
  R.seenBring = b.seq;
  if (R.role !== 'student' || !b.view) return;
  fitRect(b.view, 0);
  // A wide classroom screen squeezed onto a phone would be too small to read: never below 40%, around the same middle.
  if (R.view.z < 0.4) { const s = size(), cx = b.view.x + b.view.w / 2, cy = b.view.y + b.view.h / 2; R.view = { z: 0.4, x: s.w / 2 - cx * 0.4, y: s.h * 0.42 - cy * 0.4 }; applyView(); }
  R.brought = true; renderBanner();
  // The banner goes after a few seconds; "Back to my square" stays until they use it.
  clearTimeout(R.bannerTimer); R.bannerTimer = setTimeout(() => { if (!R || !R.brought) return; const el = document.getElementById('rm-banner'); if (el) el.innerHTML = ''; }, 5000);
}
function renderBanner() {
  const el = document.getElementById('rm-banner'), back = document.getElementById('rm-back'); if (!el) return;
  el.innerHTML = R.brought ? `<div class="rm-banner" role="status">${iconHtml('📍', { size: 18 })} ${esc(t('js.manip-room.brought'))}<span class="small">${esc(t('js.manip-room.broughtText'))}</span>${btn('btn btn-sm rm-x', 'data-rtool="unbanner"', '✕')}</div>` : '';
  back.hidden = !R.brought;
}
function renderMini() {
  const el = document.getElementById('rm-mini'); if (!el || !R) return;
  if (R.role === 'student') { el.innerHTML = ''; return; }   // students: Fit and My square instead
  el.innerHTML = miniHtml({ world: world(), items: [...R.areas.values()].map(a => ({ rect: a.rect, cls: a.key === 't' ? 't' : a.key === R.me ? 'me' : '', c: a.color })),
    view: R.view, size: size(), width: phone() ? 96 : 150, label: t('js.manip-room.map') });
}

// ---------------------------------------------------------------- the bar and the palette
function zoomHtml(cls) {
  if (R.role === 'student') return `<div class="rm-zoom ${cls}" role="group" aria-label="${esc(t('js.manip-room.zoom'))}">${btn('chip', 'data-rtool="fit"', `⤢ ${esc(t('js.manip-room.fit'))}`)}${btn('chip', 'data-rtool="mine"', `${iconHtml('🏠', { size: 18 })} ${esc(t('js.manip-room.mySquareBtn'))}`)}</div>`;
  return zoomPillHtml({ z: R.view.z, attr: 'data-rtool', cls, labels: { zoom: t('js.manip-room.zoom'), zoomOut: t('js.manip-room.zoomOut'), zoomIn: t('js.manip-room.zoomIn'), fit: t('js.manip-room.fit') } });
}
function renderBar() {
  const el = document.getElementById('rm-bar'), room = R.room, live = room.status === 'active', d = deck();
  const state = live ? `<span class="rm-live">${esc(t('js.manip-room.live'))}</span>` : `<span class="mp-tag bad">${esc(t('js.manip-room.ended'))}</span>`;
  const pushed = R.role === 'student' && live && room.pushed && room.pushedAt > R.seenPush;
  if (R.role === 'teacher') {
    // At most: the step bar (2+ steps), Hands up, Bring everyone to me and one ⋯ menu for the rest.
    const counts = d.pace && d.mine ? Object.values(d.mine).reduce((m, i) => { m[i] = (m[i] || 0) + 1; return m; }, {}) : null;
    const steps = live && d.total > 1 ? `<span class="rm-steps">${btn('btn btn-sm', `data-rtool="prev"${d.cur ? '' : ' disabled'}`, `◀ ${esc(t('js.manip-room.back'))}`)}<b class="rm-stepnow">${esc(t('js.manip-room.stepOf', { n: d.cur + 1, total: d.total }))}</b>${btn('btn btn-sm btn-primary', `data-rtool="next"${d.cur + 1 < d.total ? '' : ' disabled'}`, `${esc(t('js.manip-room.next'))} ▶`)}
      ${counts ? `<span class="small muted rm-pacesum">${Object.entries(counts).sort((x, y) => x[0] - y[0]).map(([i, n]) => esc(t('js.manip-room.paceSum', { step: +i + 1, n }))).join(' · ')}</span>` : ''}</span>` : '';
    el.innerHTML = `${state}<h1>${esc(room.title)}</h1><span class="rm-grow"></span>${steps}
      ${live ? btn(`btn rm-handsbtn${R.hands.length ? ' on' : ''}`, 'id="rm-hands" data-rtool="hands"', `${iconHtml('✋', { size: 18 })}<span class="rm-handt">${esc(handsLabel())}</span>`) : ''}
      ${live ? btn('btn btn-hot', 'data-rtool="bring"', `${iconHtml('📍', { size: 18 })}<span class="rm-hidephone"> ${esc(t('js.manip-room.bring'))}</span>`) : ''}
      ${btn('btn rm-menubtn', `data-rtool="menu" aria-expanded="${!!R.menuOpen}" aria-label="${esc(t('js.manip-room.menu'))}"`, '⋯')}`;
  } else if (inHomeroom()) {
    // Homeroom's bar replaces this one (Live, the title, Raise hand): only what a student must still reach stays, in a
    // small corner (load the pushed board, Check my answers, and on a phone the way back to their own square).
    el.classList.add('rm-barmin');
    el.innerHTML = `${live ? '' : state}${pushed ? `${btn('btn btn-sm btn-primary', 'data-rtool="loadpush"', esc(t('js.manip-room.loadPush')))}${btn('btn btn-sm', 'data-rtool="keeppush"', esc(t('js.manip-room.keep')))}` : ''}${live && checksOn() && myBoxes().length ? btn('btn btn-hot rm-check', `data-rtool="check" aria-label="${esc(t('js.manip-room.check'))}"`, `${iconHtml('☑', { size: 18 })}<span class="rm-hidephone"> ${esc(t('js.manip-room.check'))}</span><span class="rm-phoneonly"> ${esc(t('js.manip-room.checkShort'))}</span>`) : ''}${btn('btn btn-primary rm-minebar', `data-rtool="mine" aria-label="${esc(t('js.manip-room.mySquareBtn'))}" title="${esc(t('js.manip-room.mySquareBtn'))}"`, iconHtml('🏠', { size: 18 }))}`;
  } else {
    el.innerHTML = `${state}<h1>${esc(room.title)}</h1><span class="rm-grow"></span>
      ${pushed ? `${btn('btn btn-sm btn-primary', 'data-rtool="loadpush"', esc(t('js.manip-room.loadPush')))}${btn('btn btn-sm', 'data-rtool="keeppush"', esc(t('js.manip-room.keep')))}` : ''}
      ${live && checksOn() && myBoxes().length ? btn('btn btn-hot rm-check', `data-rtool="check" aria-label="${esc(t('js.manip-room.check'))}"`, `${iconHtml('☑', { size: 18 })}<span class="rm-hidephone"> ${esc(t('js.manip-room.check'))}</span><span class="rm-phoneonly"> ${esc(t('js.manip-room.checkShort'))}</span>`) : ''}
      ${live ? handBtn('btn rm-hidephone') : ''}${btn('btn btn-primary rm-minebar', 'data-rtool="mine"', `${iconHtml('🏠', { size: 18 })} ${esc(t('js.manip-room.mySquareBtn'))}`)}`;
  }
  renderHandList(); renderMenu();
  document.getElementById('rm-zoom').innerHTML = zoomHtml('');
  // The palette, banners and lists sit under the bar, however many lines it takes.
  requestAnimationFrame(() => { const rm = document.getElementById('rm'); if (rm && el) rm.style.setProperty('--rm-bar-h', `${el.offsetHeight}px`); });
}
const handsLabel = () => (R.hands.length ? ` ${t('js.manip-room.handsUpN', { n: R.hands.length })}` : ` ${t('js.manip-room.handsUpNone')}`);
/** The teacher's ⋯ menu: everything that isn't needed every minute. Its body scrolls (the "Answers checked" list grows
 *  with the class); the session's action (End session, or Reopen room) stays pinned at its foot, always in reach. */
function renderMenu() {
  const el = document.getElementById('rm-menu'); if (!el) return;
  if (R.role !== 'teacher' || !R.menuOpen) { el.innerHTML = ''; return; }
  const room = R.room, live = room.status === 'active', d = deck();
  el.innerHTML = `<div class="rm-menu panel" role="menu"><div class="rm-menu-body">
    <div class="rm-mi rm-codeline">${esc(t('js.manip-room.joinCode', { code: room.code || '' }))}${btn('btn btn-sm', 'data-rtool="copycode"', esc(t('js.manip-room.copy')))}</div>
    ${btn('rm-mi rm-switch', `role="switch" aria-checked="${!room.showWork}" data-rtool="showwork"`, `<span class="rm-knob" aria-hidden="true"></span>${esc(t('js.manip-room.hideWork'))}`)}
    ${live ? btn('rm-mi rm-switch', `role="switch" aria-checked="${checksOn()}" data-rtool="checks"`, `<span class="rm-knob" aria-hidden="true"></span>${esc(t('js.manip-room.checksSwitch'))}`) : ''}
    ${checksHtml()}
    ${live ? btn('rm-mi rm-switch', `role="switch" aria-checked="${(R.areas.get('t') || { st: {} }).st.totals !== false}" data-rtool="totals"`, `<span class="rm-knob" aria-hidden="true"></span>${esc(t('js.manip-room.totals'))}`) : ''}
    ${d.total > 1 && live ? btn('rm-mi rm-switch', `role="switch" aria-checked="${!!d.pace}" data-rtool="pace"`, `<span class="rm-knob" aria-hidden="true"></span>${esc(t('js.manip-room.pace'))}`) : ''}
    ${live ? btn('rm-mi', 'data-rtool="push"', `${iconHtml('📤', { size: 18 })} ${esc(t('js.manip-room.push'))}`) : ''}
    ${howBtn('rm-mi', { menu: true })}
    <a class="rm-mi" href="/api/manipulatives/live/${esc(R.id)}/export.pdf" download>${iconHtml('📄', { size: 18 })} ${esc(t('js.manip-room.pdf'))}</a></div>
    <div class="rm-menu-foot">${live ? btn('rm-mi bad', 'data-rtool="end"', `${iconHtml('⏹', { size: 18 })} ${esc(t('js.manip-room.end'))}`) : btn('rm-mi', 'data-rtool="reopen"', `${iconHtml('🔄', { size: 18 })} ${esc(t('js.manip-room.reopen'))}`)}</div></div>`;
}
/** "Answers checked: 12 of 16" in the ⋯ menu: one line, closed by default, that opens (a native details) to the names,
 *  those who need help first, each with their score and a mark. Nobody checked yet: the line alone. Shown while checks
 *  are on, or once anyone checked. */
function checksHtml() {
  const students = [...R.areas.values()].filter(A => A.key !== 't').sort((a, b) => a.slot - b.slot).map(A => ({ key: A.key, name: A.name }));
  const sum = checkSummary(R.room.checks, students);
  // An ended room: none (results are memory only and go when it ends, so it would read 0); back after Reopen.
  if (R.room.status !== 'active' || !students.length || (!sum.checked && !checksOn())) return '';
  const line = esc(t('js.manip-room.checksSummary', { checked: sum.checked, total: sum.total }));
  if (!sum.checked) return `<div class="rm-checks rm-checks-none">${iconHtml('☑', { size: 18 })}<span>${line}</span></div>`;
  const row = r => `<li class="${r.ok ? 'ok' : 'help'}"><span class="rm-cname" title="${esc(r.name)}">${esc(r.name)}</span><span class="rm-cscore"><bdi>${r.right}/${r.total}</bdi>${iconHtml(r.ok ? '✅' : '⚠️', { size: 16, label: t(r.ok ? 'js.manip-room.checkAllRight' : 'js.manip-room.checkNeedsHelp') })}</span></li>`;
  const open = R.checksOpen ? ' open' : '';
  return `<details class="rm-checks"${open}><summary>${iconHtml('☑', { size: 18 })}<span>${line}</span></summary>
    <ul aria-label="${esc(t('js.manip-room.checksTitle'))}">${sum.rows.map(row).join('')}</ul></details>`;
}
const handBtn = cls => btn(`${cls} rm-hand${handUp(R.me) ? ' on' : ''}`, `data-rtool="hand" aria-pressed="${handUp(R.me)}" aria-label="${esc(t('js.manip-room.raiseHand'))}"`, `${iconHtml('✋', { size: 18 })} <span class="rm-handt">${esc(handUp(R.me) ? t('js.manip-room.lowerHand') : t('js.manip-room.raiseHand'))}</span>`);
/** The tool's "How it works" video (the tool page's button: public/js/manip.js openHow), when it has one. menu: a ⋯
 *  menu item (the teacher); else a palette button (a student: in the palette's header, or its tools row on a phone). */
const howBtn = (cls, { menu = false, short = false } = {}) => (!tutorialOf(R.room.tool) || !R.deps.openHow ? ''
  : btn(cls, `data-rtool="how"${menu ? ' role="menuitem"' : ''} aria-label="${esc(t('js.manip-room.how'))}"`, `${iconHtml('▶️', { size: 18 })}${short ? '' : ` ${esc(t('js.manip-room.how'))}`}`));
const initials = name => String(name).split(/\s+/).map(w => [...w][0] || '').join('').slice(0, 2).toUpperCase() || '?';
/** What the palette offers for an area (public/js/manip.js paletteFor): new objects inside it (a student's: only
 *  inside their own square; at most OBJ_MAX_SQUARE there), the selected object's actions, pieces. */
const objMax = A => (A.key === 't' ? OBJ_MAX : OBJ_MAX_SQUARE);
function palette(A) {
  const ws = workSize(A);
  return R.deps.paletteFor(R.room.tool, R.impl, A.st, { osel: R.osel && R.osel.key === A.key ? R.osel.id : null, region: { x: 0, y: 0, w: ws.w, h: ws.h }, space: ws, max: objMax(A), place: d => place(A, d) });
}
/** A new piece in the first free spot of the area: never on a piece, an object or a note already there. */
function place(A, d) {
  // As on the solo board (manip-pv.js paletteAdd): the last block's column when this one is worth the same, else the
  // square's next free spot (never on a chart), else the chart's column for its value.
  const ws = workSize(A), r = paletteAdd(R.room.tool, A.st, d, { x: 0, y: 0, w: ws.w, h: ws.h }, A.lastAdd, R.deps.mkPiece, ws);
  A.lastAdd = r.last;
  return r.p;
}
/** The selected object of an area (else its last object of the tool's own kind): what settings change. */
const tgt = A => R.deps.target(R.room.tool, A.st, R.osel && R.osel.key === A.key ? R.osel.id : null);
const settingsOf = (A, st) => (objectTool(R.room.tool) ? (R.deps.target(R.room.tool, st, R.osel && R.osel.key === A.key ? R.osel.id : null) || {}).st : st);
function renderPal() {
  const el = document.getElementById('rm-pal'); if (!el) return;
  const A = R.areas.get(R.active), live = R.room.status === 'active';
  if (!A || !A.editable || !live) { el.innerHTML = R.role === 'student' ? `<div class="mp-toolsrow">${btn('mp-tbtn', 'data-rtool="mine"', `${iconHtml('🏠', { size: 18 })} ${esc(t('js.manip-room.mySquareBtn'))}`)}${howBtn('mp-tbtn')}${btn('mp-tbtn rm-phoneonly', 'data-rtool="zout"', '−')}${btn('mp-tbtn rm-phoneonly', 'data-rtool="zin"', '+')}</div>` : ''; return; }
  const items = palette(A), o = objectTool(R.room.tool) ? tgt(A) : null, K = o && kindOf(R.room.tool, o.k);
  const where = R.role === 'teacher' ? t('js.manip-room.addTo', { name: A.name }) : t('js.manip-room.addMine');
  const group = (g, cap) => { const l = items.map((p, i) => ({ p, i })).filter(x => x.p.group === g); return l.length ? `${cap ? `<p class="mp-cap">${esc(cap)}</p>` : ''}<div class="mp-palette">${l.map(({ p, i }) => R.deps.palButton(p, i, label => t('js.manip-room.add', { label }))).join('')}</div>` : ''; };
  const head = R.role === 'student' ? howBtn('btn btn-sm mp-howbtn rm-palhow rm-hidephone') : '';
  el.innerHTML = `${head}<p class="mp-cap">${esc(where)}</p>${group('add', '')}${group('obj', K ? `${K.name}${o.st.label ? ` · ${o.st.label}` : ''}` : '')}${group('piece', '')}
    <div class="mp-toolsrow">${btn('mp-tbtn', `data-rtool="note" aria-label="${esc(t('js.manip-room.note'))}"${A.ann.notes.length >= NOTE_MAX ? ' disabled' : ''}`, `${iconHtml('🗒️', { size: 18 })}<span class="rm-hidephone"> ${esc(t('js.manip-room.note'))}</span>`)}
      ${btn(`mp-tbtn${R.textMode ? ' on' : ''}`, `data-rtool="text" aria-pressed="${!!R.textMode}" aria-label="${esc(t('js.manip-room.text'))}"`, `<b class="mp-tglyph">T</b><span class="rm-hidephone"> ${esc(t('js.manip-room.text'))}</span>`)}
      ${btn(`mp-tbtn${R.annotate ? ' on' : ''}`, `data-rtool="pen" aria-pressed="${R.annotate}" aria-label="${esc(t('js.manip-room.pen'))}"`, `${iconHtml('✎', { size: 18 })}<span class="rm-hidephone"> ${esc(t('js.manip-room.pen'))}</span>`)}
      ${btn('mp-tbtn', `data-rtool="undo"${R.hist.length ? '' : ' disabled'} aria-label="${esc(t('js.manip-room.undo'))}"`, `${iconHtml('↩', { size: 18 })}<span class="rm-hidephone"> ${esc(t('js.manip-room.undo'))}</span>`)}
      ${R.role === 'teacher' ? `${btn('mp-tbtn rm-phoneonly', `data-rtool="zout" aria-label="${esc(t('js.manip-room.zoomOut'))}"`, '−')}${btn('mp-tbtn rm-phoneonly', `data-rtool="zin" aria-label="${esc(t('js.manip-room.zoomIn'))}"`, '+')}` : ''}
      ${R.role === 'teacher' && A.key === 't' ? btn('mp-tbtn rm-hidephone', 'data-rtool="steps"', `${iconHtml('📋', { size: 18 })} ${esc(t('js.manip-room.steps'))}`) : ''}
      ${R.role === 'student' ? `${inHomeroom() ? '' : handBtn('mp-tbtn rm-phoneonly')}${howBtn('mp-tbtn rm-phoneonly', { short: true })}` : ''}</div>
    ${R.annotate ? `<div class="row rm-pens">${PEN_COLORS.map(c => btn(`mp-pen${R.pen === c ? ' on' : ''}`, `data-rpen="${c}" style="background:${c}" aria-label="${esc(t('js.manip-room.penColor', { color: c }))}"`, '')).join('')}${btn('chip', 'data-rtool="clearpen"', esc(t('js.manip-room.clearPen')))}</div>` : ''}
    ${R.impl.settings && (!objectTool(R.room.tool) || (o && !o.st.q)) ? `<div class="rm-settings">${R.impl.settings(objectTool(R.room.tool) ? o.st : A.st)}</div>` : ''}`;
}

// ---------------------------------------------------------------- input
function bind() {
  const el = document.getElementById('rm');
  // A drag's end sets R.justPanned so the click of that same press is not a tap; the next press clears it, so a drag
  // whose click never came (the board drew again and replaced the dragged element) never eats a later, real click.
  el.addEventListener('pointerdown', () => { if (R) R.justPanned = false; }, true);
  el.addEventListener('keydown', () => { if (R) R.justPanned = false; }, true);
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  // The wheel pans the room (Ctrl or Cmd, or a trackpad's pinch: zooms; manip.js wheelMove), except over a list that
  // scrolls (the ⋯ menu's "Answers checked", raised hands) or a field.
  el.addEventListener('wheel', e => {
    if (e.target.closest('.rm-menu, .rm-handlist, textarea')) return;
    e.preventDefault();
    const w = R.deps.wheelMove(e, size().h), r = el.getBoundingClientRect();
    if (w.zoom) zoomAt(w.zoom, e.clientX - r.left, e.clientY - r.top); else { R.view.x += w.dx; R.view.y += w.dy; applyView(); }
  }, { passive: false });
  el.addEventListener('click', click);
  // The menu's "Answers checked" stays open (or closed) as the teacher left it when the menu is drawn again.
  el.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('details.rm-checks')) R.checksOpen = e.target.open; }, true);
  el.addEventListener('change', e => {
    // A typed value inside an object (a bar model's part size), once it is finished.
    if (e.target.classList.contains('mp-segval') && R.impl.commit) {
      const area = e.target.closest('.rm-area'), oe = e.target.closest('.mp-obj'); if (!area || !oe) return;
      edit(area.dataset.key, st => { const o = st.objects.find(x => x.id === oe.dataset.oid); return o && !o.st.q ? R.impl.commit(o.st, e.target) : false; });
      return;
    }
    const s = e.target.closest('[data-set]'); if (!s || !e.target.closest('#rm-pal')) return;
    const k = s.dataset.set, v = s.value;
    const A = R.areas.get(R.active); if (!A) return;
    edit(R.active, st0 => { const st = settingsOf(A, st0); if (!st) return false; st[k] = typeof st[k] === 'boolean' ? !!v : typeof st[k] === 'number' ? (Number.isFinite(+v) ? +v : st[k]) : v; if (R.impl.onSet) R.impl.onSet(st, k); });
  });
  el.addEventListener('keydown', e => {
    if (e.target.matches('textarea.mp-answer') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); return; }   // one line of words: Enter finishes
    if (e.target.matches('.mp-textin') && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); commitText(); return; }
    // A focused piece or object handle: Shift+F10, the ContextMenu key or Enter opens its wheel.
    if (!R.deps.wheelKey(e)) return;
    const pe = e.target.closest('.rm-area .mp-piece'), oh = !pe && e.target.closest('.rm-area .mp-ohead'), area = (pe || oh) && (pe || oh).closest('.rm-area'); if (!area) return;
    e.preventDefault();
    const r = (pe || oh).getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (pe) pieceMenu(area.dataset.key, pe.dataset.pid, x, y, true); else objMenu(area.dataset.key, oh.closest('.mp-obj').dataset.oid, x, y, true);
  });
  el.addEventListener('contextmenu', e => { if (e.target.closest('.rm-area .mp-piece, .rm-area .mp-obj')) e.preventDefault(); });
  el.addEventListener('focusout', e => { if (e.target.matches('.mp-textin')) setTimeout(() => { const box = e.target.closest('.mp-text'); if (R && R.textEdit && !(box && box.contains(document.activeElement)) && !(Date.now() - (R.textHold || 0) < 700)) commitText(); }, 0); });
  el.addEventListener('mousedown', e => { if (e.target.closest('.mp-text.editing .mp-textbar, .mp-text.editing [data-trz]')) e.preventDefault(); });   // the field keeps its focus
  el.addEventListener('input', e => {
    const area = e.target.closest('.rm-area'), A = area && R.areas.get(area.dataset.key); if (!A || !A.editable) return;
    if (e.target.classList.contains('mp-seglabel') && R.impl.input) { const oe = e.target.closest('.mp-obj'), o = oe && A.st.objects.find(x => x.id === oe.dataset.oid); if (o) { R.impl.input(o.st, e.target); queueSave(A.key); } }
    if (e.target.classList.contains('mp-answer')) { const o = A.st.objects.find(x => x.id === e.target.dataset.oid); if (o) { if (e.target.value.includes('\n')) e.target.value = e.target.value.replace(/\n+/g, ' '); o.st.ans = e.target.value.slice(0, ANS.max); R.deps.growAnswer(o, e.target, workSize(A)); queueSave(A.key); if (R.checked && o.id in R.checked) { delete R.checked[o.id]; const box = e.target.closest('.mp-ansbox'); box.classList.remove('ok', 'again'); box.querySelector('.mp-checkmark')?.remove(); } } return; }
    if (e.target.classList.contains('mp-textin') && R.textEdit) { if (e.target.value.includes('\n')) e.target.value = e.target.value.replace(/\n+/g, ' '); const x = A.ann.texts.find(n => n.id === R.textEdit.id); if (x) { x.text = e.target.value.slice(0, 200); R.deps.growText(x, e.target, workSize(A)); } }
    if (e.target.classList.contains('mp-notetext') && R.editing) { const n = A.ann.notes.find(x => x.id === R.editing.id); if (n) { n.text = e.target.value.slice(0, 300); queueSave(A.key); } }
  });
}
const UI = 'button, a, input, select, textarea, label, .mp-selpill, .rm-bar, .rm-pal, .rm-float, .rm-banner, .rm-back, .rm-strip, .rm-handlist, .rm-menu, .rm-steps-sheet';
function down(e) {
  if (!R) return;
  const rm = document.getElementById('rm');
  R.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  R.lastSend = 0; sendCursor(e);   // a touch shows where it landed at once
  if (e.target.closest('.rm-mini')) { miniJump(e); return; }
  if (R.pointers.size === 2) {
    const [a, b] = [...R.pointers.values()];
    if (R.gesture && R.gesture.hold) R.gesture.hold.cancel();
    selBox(null);
    R.gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    return;
  }
  if (e.target.closest('.mp-text.editing .mp-textbar, .mp-text.editing [data-trz]')) R.textHold = Date.now();   // the text's own buttons keep it open
  if (e.target.closest(UI)) return;
  const mouse = e.pointerType !== 'touch';
  // Space held, or the middle button: a mouse pans from anywhere.
  if (e.button === 1 || (mouse && R.spaceDown && e.button === 0)) { e.preventDefault(); R.gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, x0: R.view.x, y0: R.view.y, moved: false, grab: true }; rm.setPointerCapture(e.pointerId); return; }
  const areaEl = e.target.closest('.rm-area'), A = areaEl && R.areas.get(areaEl.dataset.key);
  const live = R.room.status === 'active';
  // A selection box in this square, from here (on a locked backdrop's body, o: a hold still opens its wheel).
  const boxFrom = (o = null) => {
    const gg = R.gesture = { kind: 'box', key: A.key, sx: e.clientX, sy: e.clientY, moved: false, add: e.shiftKey };
    if (o) gg.hold = startHold(e.clientX, e.clientY, () => { if (R && R.gesture === gg && !gg.moved) { gg.held = true; objMenu(gg.key, o.id, gg.sx, gg.sy); } });
    rm.setPointerCapture(e.pointerId);
  };
  const boxable = !!(A && A.editable && live && !A.hidden && !R.textMode && !R.annotate && e.target.closest('.rm-in'));
  if (A && A.editable && live) {
    if (R.role === 'teacher' && R.active !== A.key) { const old = R.active; R.active = A.key; renderPal(); areaEl.classList.add('active'); R.world.querySelector(`.rm-area[data-key="${CSS.escape(old)}"]`)?.classList.remove('active'); }
    const inner = areaEl.querySelector('.rm-in').getBoundingClientRect();
    if (R.annotate && e.target.closest('.rm-in')) {
      const pt = { x: clamp((e.clientX - inner.left) / inner.width, 0, 1), y: clamp((e.clientY - inner.top) / inner.height, 0, 1) };
      R.hist.push([A.key, JSON.stringify({ st: A.st, ann: A.ann })]);
      A.ann.strokes.push({ c: R.pen, pts: [pt] });
      R.gesture = { kind: 'ink', key: A.key, inner };
      rm.setPointerCapture(e.pointerId); return;
    }
    const before = JSON.stringify({ st: A.st, ann: A.ann });
    const rz = !R.annotate && !R.textMode && e.target.closest('[data-oresize]');
    if (rz) { const o = A.st.objects.find(x => x.id === rz.dataset.oresize); if (o && !o.locked) { R.gesture = { kind: 'resize', key: A.key, o, nat: objSize(R.room.tool, o), s0: o.s, st0: JSON.stringify(o.st), sx: e.clientX, sy: e.clientY, before, el: rz.closest('.mp-obj'), moved: false }; rm.setPointerCapture(e.pointerId); e.preventDefault(); return; } }
    const pieceEl = !R.textMode && e.target.closest('.mp-piece');
    if (pieceEl && A.st.pieces) {
      const p = A.st.pieces.find(x => x.id === pieceEl.dataset.pid);
      if (p) {
        // A tap selects; 10 px of movement drags it (with its group); a hold opens its wheel; right-click at once.
        e.preventDefault();
        if (e.button === 2) { pieceMenu(A.key, p.id, e.clientX, e.clientY); return; }
        if (e.button > 0) return;
        const gg = R.gesture = { kind: 'piece', key: A.key, p, sx: e.clientX, sy: e.clientY, moved: false, held: false, before, shift: e.shiftKey, many: !e.shiftKey && !!R.many && R.many.key === A.key && R.many.p.has(p.id) };
        gg.hold = startHold(e.clientX, e.clientY, () => { if (R && R.gesture === gg && !gg.moved) { gg.held = true; pieceMenu(gg.key, p.id, gg.sx, gg.sy); } });
        rm.setPointerCapture(e.pointerId); return;
      }
    }
    const textEl = e.target.closest('.mp-text[data-text]');
    if (textEl && textEl.classList.contains('editing')) {
      // The text being written: its grip moves it, its corner resizes it (its buttons and field are its own).
      const x = A.ann.texts.find(n => n.id === textEl.dataset.text);
      if (x && canEditNote(A, x) && R.deps.textBoxPointer(e, { x, el: textEl, space: workSize(A), zoom: () => R.view.z, others: () => R.deps.othersThan(R.room.tool, { ...A.st, __ann: A.ann }, workSize(A), x.id),
        start: () => { R.hist.push([A.key, JSON.stringify({ st: A.st, ann: A.ann })]); },
        done: moved => { if (moved) { queueSave(A.key); textEl.querySelector('textarea')?.focus({ preventScroll: true }); } R.justPanned = true; } })) return;
      return;
    }
    if (textEl && !textEl.classList.contains('editing')) {
      const x = A.ann.texts.find(n => n.id === textEl.dataset.text);
      if (x && canEditNote(A, x)) { R.gesture = { kind: 'text', key: A.key, n: x, el: textEl, sx: e.clientX, sy: e.clientY, x0: +x.x || 0, y0: +x.y || 0, inner, moved: false }; rm.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    }
    if (R.textMode && e.target.closest('.rm-in') && !e.target.closest('.mp-sticky, .mp-text, button, input')) {
      if (R.textEdit) { commitText(); R.justPanned = true; return; }
      R.hist.push([A.key, JSON.stringify({ st: A.st, ann: A.ann })]);
      const x = { id: `x-${R.deps.newId()}`, text: '', x: clamp((e.clientX - inner.left) / inner.width, 0, 0.95), y: clamp((e.clientY - inner.top - 10 * R.view.z) / inner.height, 0, 0.96), ...(R.role === 'teacher' ? { by: 't' } : {}) };
      A.ann.texts.push(x); R.textEdit = { key: A.key, id: x.id }; renderArea(A.key); R.justPanned = true; e.preventDefault(); return;
    }
    const noteEl = e.target.closest('.mp-sticky[data-note]');
    if (noteEl && !noteEl.classList.contains('editing')) {
      const n = A.ann.notes.find(x => x.id === noteEl.dataset.note);
      if (n && canEditNote(A, n)) { R.gesture = { kind: 'note', key: A.key, n, el: noteEl, sx: e.clientX, sy: e.clientY, x0: +n.x || 0, y0: +n.y || 0, inner, moved: false }; rm.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    }
    if (e.target.closest('[data-act], svg.mp-nl, svg.mp-grid, svg[data-clock], .mp-seglabel, .mp-segval')) return;   // a tap on the tool itself
    if (R.impl.edgeTap && R.impl.edgeTap(e)) return;   // a tap on the grid's edge, just outside it
    const objEl = !R.textMode && e.target.closest('.mp-obj');
    if (objEl) {
      const o = A.st.objects.find(x => x.id === objEl.dataset.oid);
      if (o) {
        e.preventDefault();
        if (e.button === 2) { objMenu(A.key, o.id, e.clientX, e.clientY); return; }
        if (e.button > 0) return;
        // A locked backdrop's body is the square under the pieces for a mouse: a drag there draws the selection box.
        if (o.locked && mouse && boxable && !e.target.closest('.mp-ohead')) return boxFrom(o);
        const gg = R.gesture = { kind: 'obj', key: A.key, o, el: objEl, head: !!e.target.closest('.mp-ohead'), x0: o.x, y0: o.y, sx: e.clientX, sy: e.clientY, moved: false, held: false, before, shift: e.shiftKey, many: !e.shiftKey && !!R.many && R.many.key === A.key && R.many.o.has(o.id) };
        gg.hold = startHold(e.clientX, e.clientY, () => { if (R && R.gesture === gg && !gg.moved) { gg.held = true; objMenu(gg.key, o.id, gg.sx, gg.sy); } });
        rm.setPointerCapture(e.pointerId); return;
      }
    }
  }
  // Empty space in a square this viewer may change: a mouse draws the selection box; a finger pans, or held still for a
  // moment first, draws the box. Anywhere else a drag pans the room.
  if (boxable && mouse) { if (e.button === 0) boxFrom(); return; }
  const gg = R.gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, x0: R.view.x, y0: R.view.y, moved: false };
  if (boxable) gg.hold = startHold(e.clientX, e.clientY, () => { if (R && R.gesture === gg && !gg.moved) R.gesture = { kind: 'box', key: A.key, sx: gg.sx, sy: gg.sy, moved: false, add: false }; });
  rm.setPointerCapture(e.pointerId);
}
const selBox = a => R && R.deps.drawSelBox(document.getElementById('rm-selbox'), document.getElementById('rm'), a);
function move(e) {
  if (!R) return;
  if (R.pointers.has(e.pointerId)) R.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (e.pointerType !== 'touch' || R.pointers.size) sendCursor(e);
  const g = R.gesture; if (!g) return;
  if (g.kind === 'pinch' && R.pointers.size === 2) {
    const [a, b] = [...R.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const r = document.getElementById('rm').getBoundingClientRect();
    R.view.x += cx - g.cx; R.view.y += cy - g.cy;
    zoomAt(d / (g.d || d), cx - r.left, cy - r.top);
    Object.assign(g, { d, cx, cy }); return;
  }
  if (g.kind === 'dead') return;
  const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
  if (g.kind === 'box') {
    if (g.held || (!g.moved && Math.abs(dx) + Math.abs(dy) < 5)) return;
    if (g.hold) g.hold.cancel();
    g.moved = true; g.ex = e.clientX; g.ey = e.clientY; selBox({ x0: g.sx, y0: g.sy, x1: g.ex, y1: g.ey }); return;
  }
  if ((g.kind === 'piece' || g.kind === 'obj') && !g.moved) {
    // A piece or object starts to move after 10 px; before that it may still become a hold.
    if (Math.hypot(dx, dy) < SLOP) return;
    g.hold.cancel();
    const A0 = R.areas.get(g.key); if (!A0) { R.gesture = null; return; }
    // A locked chart, grid or mat dragged by its body pans the room (backdrops start locked); by its handle bar, or a
    // locked piece: a small shake.
    if (g.kind === 'obj' && g.o.locked && !g.held && !g.head) { R.gesture = { kind: 'pan', sx: g.sx, sy: g.sy, x0: R.view.x, y0: R.view.y, moved: true }; R.view.x += dx; R.view.y += dy; applyView(); return; }
    if (g.kind === 'piece' ? g.p.locked : g.o.locked) { if (!g.held) shake(g.kind === 'piece' ? pieceElIn(g.key, g.p.id) : objElIn(g.key, g.o.id)); R.gesture = { kind: 'dead', key: g.key }; return; }
    if (g.held) { closeWheel({ focus: false }); g.before = JSON.stringify({ st: A0.st, ann: A0.ann }); }
    // One of many selected: all of them move (and what their frames carry), no snapping.
    if (g.many && !g.held && R.many) g.list = selMoving(R.room.tool, A0.st, R.many, o => R.deps.carried(R.room.tool, o, A0.st.pieces)).map(x => ({ ...x, el: x.obj ? objElIn(g.key, x.it.id) : pieceElIn(g.key, x.it.id) }));
    else if (g.kind === 'piece') {
      // Held first (out of its group now), or counters (they never link): just this piece.
      const members = g.held || !linksPieces(R.room.tool) ? [g.p] : groupOf(A0.st.pieces, g.p);
      g.members = members.map(m => ({ m, x0: m.x, y0: m.y, el: pieceElIn(g.key, m.id) }));
    } else {
      g.el = objElIn(g.key, g.o.id) || g.el; g.x0 = g.o.x; g.y0 = g.o.y;
      // An unlocked frame takes the counters seated in its cells along.
      // A place-value chart takes the blocks in its columns along.
      g.carry = R.deps.carried(R.room.tool, g.o, A0.st.pieces).map(m => ({ m, x0: m.x, y0: m.y, el: pieceElIn(g.key, m.id) }));
    }
    g.moved = true;
  }
  if (g.kind === 'pan') { if (Math.abs(dx) + Math.abs(dy) > 4) { g.moved = true; if (g.hold) { g.hold.cancel(); g.hold = null; } } R.view.x = g.x0 + dx; R.view.y = g.y0 + dy; applyView(); return; }
  if (g.kind === 'ink') {
    const A = R.areas.get(g.key), s = A.ann.strokes[A.ann.strokes.length - 1];
    if (s && s.pts.length < 600) s.pts.push({ x: clamp((e.clientX - g.inner.left) / g.inner.width, 0, 1), y: clamp((e.clientY - g.inner.top) / g.inner.height, 0, 1) });
    const svg = R.world.querySelector(`.rm-area[data-key="${CSS.escape(g.key)}"] .mp-ink`);
    if (svg) svg.innerHTML = inkOf(A);
    return;
  }
  if (!g.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
  if (!g.moved && (g.kind === 'note' || g.kind === 'text')) { const A0 = R.areas.get(g.key); R.hist.push([g.key, JSON.stringify({ st: A0.st, ann: A0.ann })]); }
  g.moved = true;
  const A = R.areas.get(g.key), ws = workSize(A), z = R.view.z;
  // Everything stays inside the square's work space (under its strip): the server keeps it there too.
  if (g.list) {
    selMove(g.list, dx / z, dy / z, ws);
    for (const x of g.list) if (x.el) { x.el.style.left = `${x.it.x}px`; x.el.style.top = `${x.it.y}px`; if (!x.obj) x.el.classList.add('dragging'); }
    return;
  }
  if (g.kind === 'obj') {
    const r = objRect(R.room.tool, g.o);
    g.o.x = Math.round(clamp(g.x0 + dx / z, 0, ws.w - r.w)); g.o.y = Math.round(clamp(g.y0 + dy / z, 0, ws.h - r.h));
    g.el.style.left = `${g.o.x}px`; g.el.style.top = `${g.o.y}px`;
    for (const c of g.carry || []) { c.m.x = c.x0 + g.o.x - g.x0; c.m.y = c.y0 + g.o.y - g.y0; if (c.el) { c.el.style.left = `${c.m.x}px`; c.el.style.top = `${c.m.y}px`; } }
    return;
  }
  if (g.kind === 'resize' && FREE_SIZE.has(g.o.k)) {
    // An answer box: its own width and height change (more room for its words), never its font size.
    const r = freeResize({ ...g.o, st: JSON.parse(g.st0) }, dx / z, dy / z, ws);
    g.o.st.w = r.w; g.o.st.h = r.h; R.deps.sizeObjEl(g.el, g.o, objSize(R.room.tool, g.o)); return;
  }
  if (g.kind === 'resize') {
    g.o.s = Math.round(clamp((g.nat.w * g.s0 + dx / z) / g.nat.w, S_MIN, Math.min(S_MAX, (ws.w - g.o.x) / g.nat.w, (ws.h - g.o.y) / g.nat.h)) * 1000) / 1000;
    g.el.style.width = `${Math.round(g.nat.w * g.o.s)}px`; g.el.style.height = `${Math.round(g.nat.h * g.o.s)}px`; g.el.querySelector('.mp-objin').style.transform = `scale(${g.o.s})`; return;
  }
  if (g.kind === 'piece' && !g.p.locked) {
    const box = bbox(g.members.map(x => ({ x: x.x0, y: x.y0, w: x.m.w, h: x.m.h })));
    const ddx = clamp(dx / z, -box.x, ws.w - box.x - box.w), ddy = clamp(dy / z, -box.y, ws.h - box.y - box.h);
    for (const x of g.members) { x.m.x = Math.round(x.x0 + ddx); x.m.y = Math.round(x.y0 + ddy); if (x.el) { x.el.style.left = `${x.m.x}px`; x.el.style.top = `${x.m.y}px`; x.el.classList.add('dragging'); } }
    g.snap = snapOf(A, g);
    const gh = ghostIn(A);
    if (gh) { if (g.snap) { const b = pieceBox(g.p); gh.hidden = false; Object.assign(gh.style, { left: `${b.x + g.snap.dx}px`, top: `${b.y + g.snap.dy}px`, width: `${b.w}px`, height: `${b.h}px` }); } else gh.hidden = true; }
  }
  if (g.kind === 'note' || g.kind === 'text') {
    g.n.x = clamp(g.x0 + dx / g.inner.width, 0, 1 - g.el.offsetWidth * R.view.z / g.inner.width); g.n.y = clamp(g.y0 + dy / g.inner.height, 0, 1 - g.el.offsetHeight * R.view.z / g.inner.height);
    g.el.style.left = `${g.n.x * 100}%`; g.el.style.top = `${g.n.y * 100}%`;
  }
}
function up(e) {
  if (!R) return;
  R.pointers.delete(e.pointerId);
  const g = R.gesture; if (!g) return;
  if (g.kind === 'pinch') { if (R.pointers.size < 2) R.gesture = null; return; }
  R.gesture = null;
  if (g.hold) g.hold.cancel();
  if (g.kind === 'dead') { R.justPanned = true; return; }
  // Held: the wheel stays open after the finger lifts.
  if ((g.kind === 'obj' || g.kind === 'piece') && !g.moved && (g.held || e.type === 'pointercancel')) { R.justPanned = true; return; }
  if (g.kind === 'box') {
    selBox(null);
    if (g.held) { R.justPanned = true; return; }
    const A = R.areas.get(g.key);
    if (g.moved && A) {
      // Everything unlocked the box touches in this square (Shift: added to what was selected there).
      const m = inRect(R.room.tool, A.st, rectFrom(inArea(g.key, g.sx, g.sy), inArea(g.key, g.ex, g.ey)));
      if (g.add) { const c = curSel(g.key); for (const id of c.p) m.p.add(id); for (const id of c.o) m.o.add(id); }
      reselect(() => setMany(g.key, m)); R.justPanned = true; return;
    }
  }
  // A tap on empty space lets go of what was selected.
  if (g.kind === 'pan' || g.kind === 'box') { R.justPanned = g.moved; if (!g.moved && !g.grab && !g.add && (R.sel || R.osel || R.many)) reselect(() => { R.sel = null; R.osel = null; R.many = null; }); return; }
  if (g.kind === 'ink') { const A = R.areas.get(g.key); A.ann.strokes = A.ann.strokes.filter(s => s.pts.length > 1); renderArea(g.key); renderPal(); queueSave(g.key); return; }
  // Many moved together: one Undo step, the selection kept.
  if (g.list) { const A = R.areas.get(g.key); if (A) settle(A); R.hist.push([g.key, g.before]); if (R.hist.length > 60) R.hist.shift(); queueSave(g.key); renderArea(g.key); renderPal(); R.justPanned = true; return; }
  // Any other drag or tap on a piece or object lets go of many selected (Shift+click adds or removes one instead).
  if ((g.kind === 'obj' || g.kind === 'piece') && R.many && !(g.shift && !g.moved)) reselect(() => { R.many = null; });
  if (g.kind === 'obj' || g.kind === 'resize') {
    // A tap selects (its buttons open; Shift: adds or removes it); a drag only moves it.
    if (g.moved) {
      const A = R.areas.get(g.key);
      if (A && g.kind === 'resize') R.deps.scaleWithChart(R.room.tool, g.o, g.s0, A.st.pieces);
      if (A) settle(A);
      R.hist.push([g.key, g.before]); queueSave(g.key);
    } else if (g.shift && g.kind === 'obj') reselect(() => toggleSel(g.key, 'o', g.o));
    else if (g.o && !g.o.locked) { R.osel = { key: g.key, id: g.o.id }; R.sel = null; }
    renderArea(g.key); renderPal(); R.justPanned = true; return;
  }
  if (g.kind === 'piece') {
    const A = R.areas.get(g.key), gh = ghostIn(A); if (gh) gh.hidden = true;
    if (g.moved && !g.p.locked) {
      const s = snapOf(A, g), ws = workSize(A);
      if (s) {
        const box = bbox(g.members.map(q => ({ x: q.m.x, y: q.m.y, w: q.m.w, h: q.m.h })));
        // A snap never pulls a piece out of the square or under its strip.
        if (box.x + s.dx >= 0 && box.y + s.dy >= 0 && box.x + box.w + s.dx <= ws.w && box.y + box.h + s.dy <= ws.h) {
          for (const q of g.members) { q.m.x = Math.round(q.m.x + s.dx); q.m.y = Math.round(q.m.y + s.dy); }
          if (s.to) R.deps.joinGroup(A.st.pieces, g.p, A.st.pieces.find(q => q.id === s.to));
          R.snapped = new Set(g.members.map(q => q.m.id));
        }
      }
      A.lastAdd = { id: g.p.id, runX: g.p.x };   // the last block placed in this square
      settle(A);
      R.hist.push([g.key, g.before]); if (R.hist.length > 60) R.hist.shift(); queueSave(g.key);
    }
    if (!g.moved && g.shift) reselect(() => toggleSel(g.key, 'p', g.p));
    else if (!g.moved) { R.sel = { key: g.key, id: g.p.id }; R.osel = null; } else if (R.sel && R.sel.key === g.key && R.sel.id !== g.p.id) R.sel = null;
    renderArea(g.key); renderPal(); R.snapped = null;
    R.justPanned = true; return;
  }
  if (g.kind === 'text') {
    if (g.moved) { const A = R.areas.get(g.key); if (A) R.deps.snapText(g.n, g.el, workSize(A), R.deps.othersThan(R.room.tool, { ...A.st, __ann: A.ann }, workSize(A), g.n.id), SNAP_PX / R.view.z); renderPal(); queueSave(g.key); }
    else { if (R.textEdit) commitText(); R.textEdit = { key: g.key, id: g.n.id }; renderArea(g.key); }
    R.justPanned = true; return;
  }
  if (g.kind === 'note') {
    if (g.moved) { renderPal(); queueSave(g.key); }
    else { R.editing = { key: g.key, id: g.n.id }; renderArea(g.key); }
    R.justPanned = true;
  }
}
/** A piece or object dropped from the palette: only inside a square this viewer may change (a student: their own),
 *  under its strip; anywhere else nothing happens. */
function roomDrop(cx, cy, item) {
  if (!R || R.room.status !== 'active') return false;
  const under = document.elementsFromPoint(cx, cy).find(el => el.classList && el.classList.contains('rm-area'));
  const A = under && R.areas.get(under.dataset.key);
  if (!A || !A.editable || A.hidden) return false;
  const inner = under.querySelector('.rm-in').getBoundingClientRect(), ws = workSize(A);
  const p = { x: (cx - inner.left) / R.view.z, y: (cy - inner.top) / R.view.z };
  if (p.x < 0 || p.y < 0 || p.x > ws.w || p.y > ws.h) return false;
  if (R.role === 'teacher' && R.active !== A.key) { R.active = A.key; renderPal(); }
  edit(A.key, (st, v) => R.deps.dropAt(R.room.tool, st, v, item, p, ws, objMax(A), SNAP_PX / R.view.z));
  return true;
}
/** Where the held piece (and its group) would snap: only this square's own pieces and objects (never across squares). */
function snapOf(A, g) {
  const ids = new Set(g.members.map(x => x.m.id));
  return snapFor([g.p, ...g.members.map(x => x.m).filter(m => m !== g.p)], A.st.pieces.filter(q => !ids.has(q.id)), A.st.objects.flatMap(o => slotsOf(R.room.tool, o)), SNAP_PX / R.view.z, snapOpts(R.room.tool));
}
function ghostIn(A) {
  const inn = R.world && R.world.querySelector(`.rm-area[data-key="${CSS.escape(A.key)}"] .rm-in`); if (!inn) return null;
  let gh = inn.querySelector('.mp-ghost'); if (!gh) { gh = document.createElement('div'); gh.className = 'mp-ghost'; gh.hidden = true; inn.appendChild(gh); }
  return gh;
}
function miniJump(e) {
  const p = miniPoint(e, world()), s = size();
  R.view.x = s.w / 2 - p.x * R.view.z; R.view.y = s.h / 2 - p.y * R.view.z; applyView();
}
function click(e) {
  if (!R) return;
  if (R.justPanned) { R.justPanned = false; if (!e.target.closest(UI)) return; }
  const pal = e.target.closest('[data-pal]');
  if (pal && pal.closest('[data-dragged]')) return;   // the end of a drag from the palette
  if (pal) { const A = R.areas.get(R.active); const p = A && palette(A)[+pal.dataset.pal]; if (p) edit(R.active, (st, v) => p.run(st, v)); return; }
  const tool = e.target.closest('[data-rtool]');
  if (tool) return toolButton(tool.dataset.rtool);
  if (e.target.closest('#rm-selpill [data-seldel]')) return deleteMany();
  if (e.target.closest('#rm-selpill [data-selx]')) return reselect(() => { R.many = null; });
  const hgo = e.target.closest('[data-hgo]');
  if (hgo) { const A = R.areas.get(hgo.dataset.hgo); if (A) fitRect({ x: A.rect.x, y: A.rect.y - 36, w: A.rect.w, h: A.rect.h + 36 }, 12); return; }
  const hlow = e.target.closest('[data-hlow]');
  if (hlow) { api(`/api/manipulatives/live/${R.id}/hand`, { method: 'POST', body: { up: false, key: hlow.dataset.hlow } }).then(() => { if (!R.wsOk) refresh(); }).catch(err => toast(err.message, { bad: true })); return; }
  const tsz = e.target.closest('[data-tsz]');
  if (tsz && R.textEdit) {
    const A = R.areas.get(R.textEdit.key), x = A && A.ann.texts.find(n => n.id === tsz.dataset.id);
    if (x && canEditNote(A, x)) {
      const inp = R.world.querySelector(`.rm-area[data-key="${CSS.escape(A.key)}"] .mp-textin`); if (inp) x.text = inp.value.replace(/\n+/g, ' ').slice(0, 200);
      const before = JSON.stringify({ st: A.st, ann: A.ann });
      if (R.deps.textSizeButton(x, +tsz.dataset.tsz)) { R.hist.push([A.key, before]); renderArea(A.key); queueSave(A.key); }
    }
    return;
  }
  const rtx = e.target.closest('[data-rtx]');
  if (rtx && R.textEdit) { const A = R.areas.get(R.textEdit.key); if (A) { R.hist.push([A.key, JSON.stringify({ st: A.st, ann: A.ann })]); A.ann.texts = A.ann.texts.filter(n => n.id !== rtx.dataset.rtx); R.textEdit = null; renderArea(A.key); queueSave(A.key); } return; }
  const my = e.target.closest('[data-mystep]');
  if (my) { api(`/api/manipulatives/live/${R.id}/step`, { method: 'POST', body: { dir: +my.dataset.mystep } }).then(refresh).catch(err => toast(err.message, { bad: true })); return; }
  const more = e.target.closest('[data-strip]');
  if (more) { const k = more.dataset.strip; if (R.stripOpen.has(k)) R.stripOpen.delete(k); else R.stripOpen.add(k); renderArea(k); return; }
  const pen = e.target.closest('[data-rpen]');
  if (pen) { R.pen = pen.dataset.rpen; renderPal(); return; }
  const tg = e.target.closest('#rm-pal [data-toggle]');
  if (tg) { const k = tg.dataset.toggle, A0 = R.areas.get(R.active); if (A0) edit(R.active, st0 => { const st = settingsOf(A0, st0); if (!st) return false; st[k] = !st[k]; }); return; }
  const areaEl = e.target.closest('.rm-area'), A = areaEl && R.areas.get(areaEl.dataset.key);
  if (!A || !A.editable || R.room.status !== 'active') return;
  const nb = e.target.closest('[data-nact]');
  if (nb) return noteButton(A, nb.dataset.nact, nb.dataset.id);
  const objEl = e.target.closest('.mp-content .mp-obj');
  const act = e.target.closest('.mp-content [data-act]');
  if (act && objEl) { edit(A.key, (st, v) => { const o = st.objects.find(x => x.id === objEl.dataset.oid); if (!o || o.st.q) return false; v.osel = o.id; return R.impl.act(o.st, act.dataset, e); }); return; }
  if (R.impl.boardTap && objEl && (e.target.closest('svg.mp-nl, svg.mp-grid') || (R.impl.edgeTap && R.impl.edgeTap(e)))) edit(A.key, (st, v) => { const o = st.objects.find(x => x.id === objEl.dataset.oid); if (!o || o.st.q) return false; v.osel = o.id; return R.impl.act(o.st, {}, e); });
}
/** Finish the text being written: kept with its words, gone if empty; saved. */
function commitText() {
  const te = R.textEdit; if (!te) return;
  const A = R.areas.get(te.key); R.textEdit = null; if (!A) return;
  const inp = R.world.querySelector(`.rm-area[data-key="${CSS.escape(te.key)}"] .mp-textin`), x = A.ann.texts.find(n => n.id === te.id);
  if (x && inp) x.text = inp.value.replace(/\n+/g, ' ').slice(0, 200);
  A.ann.texts = A.ann.texts.filter(n => String(n.text || '').trim());
  renderArea(te.key); renderPal(); queueSave(te.key);
}
function noteButton(A, k, id) {
  const n = A.ann.notes.find(x => x.id === id); if (!n || !canEditNote(A, n)) return;
  if (k === 'edit') R.editing = { key: A.key, id };
  else if (k === 'done') R.editing = null;
  else if (k === 'delete') { R.hist.push([A.key, JSON.stringify({ st: A.st, ann: A.ann })]); A.ann.notes = A.ann.notes.filter(x => x.id !== id); R.editing = null; queueSave(A.key); renderPal(); }
  renderArea(A.key);
}
// ---------------------------------------------------------------- the hold-to-edit wheel (public/js/manip-wheel.js)
const pieceElIn = (key, id) => R && R.world && R.world.querySelector(`.rm-area[data-key="${CSS.escape(key)}"] .mp-content .mp-piece[data-pid="${CSS.escape(id)}"]`);
const objElIn = (key, id) => R && R.world && R.world.querySelector(`.rm-area[data-key="${CSS.escape(key)}"] .mp-content .mp-obj[data-oid="${CSS.escape(id)}"]`);
/** Something the teacher locked in a student's square: the student can't unlock it (the server keeps it too). */
const teacherLocked = x => !!(x && x.locked && x.lockBy === 't' && R.role !== 'teacher');
/** After a lock or unlock in a student's square: who locked it (the teacher's lock is the teacher's; the server decides
 *  this again on saving: services/manipulatives.js lockedBy). */
function markLock(key, x, k) { if (!x) return; if (k === 'lock' && R.role === 'teacher' && key !== 't') x.lockBy = 't'; if (k === 'unlock' || (k === 'lock' && R.role !== 'teacher')) delete x.lockBy; }
/** A piece's wheel in the room: the same as on the solo board (lifted out of its group first), in that square. */
function pieceMenu(key, id, x, y, keyboard = false) {
  const A = R && R.areas.get(key); if (!A || !A.editable || R.room.status !== 'active' || !A.st.pieces) return;
  const slug = R.room.tool, ws = workSize(A);
  const p0 = A.st.pieces.find(q => q.id === id); if (!p0) return;
  if (teacherLocked(p0)) { shake(pieceElIn(key, id)); toast(t('js.manip-room.teacherLock')); return; }
  if (R.many) reselect(() => { R.many = null; });
  edit(key, (st, v) => R.deps.pieceAction(st, 'lift', id, v, null, slug, ws));
  const p = A.st.pieces.find(q => q.id === id); if (!p) return;
  R.sel = { key, id }; R.osel = null; R.lifted = p.locked ? null : { key, id };
  renderArea(key); renderPal();
  openWheel({ x, y, keyboard, items: R.deps.wheelItems(R.deps.pieceWheel(slug, p)), label: t('js.manip-room.actionsFor', { label: p.label }), focusBack: () => pieceElIn(key, id),
    onClose: () => { if (R && R.lifted && R.lifted.key === key && R.lifted.id === id) { R.lifted = null; pieceElIn(key, id)?.classList.remove('lifted'); } },
    onPick: k => {
      const q = A.st.pieces.find(z => z.id === id); if (!q) return closeWheel();
      R.deps.wheelRun({ k, slug, label: q.label, el: () => pieceElIn(key, id), mark: () => R.hist.length, undo: () => toolButton('undo'),
        apply: flip => {
          if (flip) R.flipIn = { key, id };
          edit(key, (st, v) => { const r = R.deps.pieceAction(st, k, id, v, pp => nearSpot(boxesOf(slug, { ...st, __ann: A.ann }, ws), pp, { x: 0, y: 0, w: ws.w, h: ws.h }), slug, ws); if (r) markLock(key, st.pieces.find(z => z.id === id), k); return r; });
          R.flipIn = null;
        } });
    } });
}
/** An object's wheel in the room: Lock or Unlock, Copy, Delete. */
function objMenu(key, id, x, y, keyboard = false) {
  const A = R && R.areas.get(key); if (!A || !A.editable || R.room.status !== 'active') return;
  const slug = R.room.tool, ws = workSize(A), o = A.st.objects.find(q => q.id === id); if (!o) return;
  if (teacherLocked(o)) { shake(objElIn(key, id)); toast(t('js.manip-room.teacherLock')); return; }
  if (!o.locked) reselect(() => { R.many = null; R.osel = { key, id }; R.sel = null; });
  openWheel({ x, y, keyboard, items: R.deps.wheelItems(R.deps.objWheel(o)), label: t('js.manip-room.actionsFor', { label: R.deps.objName(slug, o) }), focusBack: () => objElIn(key, id)?.querySelector('.mp-ohead'),
    onPick: k => R.deps.wheelRun({ k, slug, label: R.deps.objName(slug, o), el: () => null, mark: () => R.hist.length, undo: () => toolButton('undo'),
      apply: () => edit(key, (st, v) => { const r = R.deps.objectAction(slug, st, k, id, v, { x: 0, y: 0, w: ws.w, h: ws.h }, ws, objMax(A)); if (r) markLock(key, st.objects.find(z => z.id === id), k); return r; }) }) });
}
async function toolButton(k) {
  const s = size();
  if (k === 'zin') return zoomAt(1.25, s.w / 2, s.h / 2);
  if (k === 'zout') return zoomAt(0.8, s.w / 2, s.h / 2);
  if (k === 'fit') return fitAll();
  if (k === 'mine') return goMine();
  if (k === 'copycode') { try { await copyText(R.room.code || ''); toast(t('js.manip-room.copied')); } catch { toast(R.room.code || ''); } return; }
  if (k === 'how') { if (R.menuOpen) { R.menuOpen = false; renderMenu(); renderBar(); } R.deps.openHow(R.room.tool); return; }
  if (k === 'menu') { R.menuOpen = !R.menuOpen; R.handsOpen = false; renderBar(); return; }
  if (k === 'prev' || k === 'next' || k === 'pace') {
    try {
      if (k === 'pace') await api(`/api/manipulatives/live/${R.id}/pace`, { method: 'POST', body: { on: !deck().pace } });
      else await api(`/api/manipulatives/live/${R.id}/step`, { method: 'POST', body: { dir: k === 'next' ? 1 : -1 } });
      await refresh();
    } catch (e) { toast(e.message, { bad: true }); }
    return;
  }
  if (k === 'steps') return stepsSheet();
  if (k === 'totals') { edit('t', st => { st.totals = st.totals === false; }); renderMenu(); return; }
  if (k === 'checks') { edit('t', st => { st.checks = st.checks !== true; }); renderMenu(); return; }
  if (k === 'check') return checkMine();
  if (k === 'showwork') {
    try { await api(`/api/manipulatives/live/${R.id}/show`, { method: 'POST', body: { show: !R.room.showWork } }); await refresh(); toast(R.room.showWork ? t('js.manip-room.workShown') : t('js.manip-room.workHidden')); } catch (e) { toast(e.message, { bad: true }); }
    return;
  }
  if (k === 'hands' && !R.hands.length && !R.handsOpen) { toast(t('js.manip-room.noHands')); return; }
  if (k === 'hands') { R.handsOpen = !R.handsOpen; R.menuOpen = false; renderMenu(); return renderHandList(); }
  if (k === 'hand') {
    const up = !handUp(R.me);
    if (R.ws && R.wsOk) { try { R.ws.send(JSON.stringify({ t: 'h', up })); } catch { /* reconnecting */ } return; }
    try { await api(`/api/manipulatives/live/${R.id}/hand`, { method: 'POST', body: { up } }); await refresh(); } catch (e) { toast(e.message, { bad: true }); }
    return;
  }
  if (k === 'unbanner') { R.brought = false; return renderBanner(); }
  if (k === 'undo') {
    const last = R.hist.pop(); if (!last) return;
    const A = R.areas.get(last[0]); if (!A) return;
    const o = JSON.parse(last[1]); A.st = o.st; A.ann = o.ann; if (R.many && R.many.key === A.key) R.many = null; renderArea(A.key); renderPal(); queueSave(A.key); return;
  }
  if (k === 'pen') { R.annotate = !R.annotate; renderPal(); document.getElementById('rm').classList.toggle('inking', R.annotate); return; }
  if (k === 'clearpen') { const A = R.areas.get(R.active); if (A) { R.hist.push([A.key, JSON.stringify({ st: A.st, ann: A.ann })]); A.ann.strokes = []; renderArea(A.key); queueSave(A.key); } return; }
  if (k === 'text') { R.textMode = !R.textMode; if (R.textMode) { R.annotate = false; document.getElementById('rm').classList.remove('inking'); } else commitText(); document.getElementById('rm').classList.toggle('texting', R.textMode); renderPal(); return; }
  if (k === 'note') {
    const A = R.areas.get(R.active); if (!A || !A.editable || A.ann.notes.length >= NOTE_MAX) return;
    const ws = workSize(A), sp = spotIn(boxesOf(R.room.tool, { ...A.st, __ann: A.ann }, ws, { noteH: 100 }), 176, 100, { x: 0, y: 0, w: ws.w, h: ws.h });
    const at = { x: clamp(sp.x, 0, ws.w - 176), y: clamp(sp.y, 0, ws.h - 100) };
    R.hist.push([A.key, JSON.stringify({ st: A.st, ann: A.ann })]);
    const n = { id: `n-${R.deps.newId()}`, text: '', x: at.x / ws.w, y: at.y / ws.h, ...(R.role === 'teacher' ? { by: 't' } : {}) };
    A.ann.notes.push(n); R.editing = { key: A.key, id: n.id }; renderArea(A.key); renderPal(); queueSave(A.key);
    showSpot(A.rect.x + at.x + 88, A.rect.y + (A.rect.h - ws.h) + at.y + 50);   // the new note where it can be seen and typed in
    return;
  }
  if (k === 'bring') {
    try { await api(`/api/manipulatives/live/${R.id}/bring`, { method: 'POST', body: { view: visibleRect() } }); toast(t('js.manip-room.broughtAll')); } catch (e) { toast(e.message, { bad: true }); }
    return;
  }
  if (k === 'end') {
    // The site's own confirm (app.js ask), never the browser's: ending stops every student's square.
    if (!(await ask({ title: t('js.manip-room.endTitle'), text: t('js.manip-room.endConfirm'), ok: t('js.manip-room.end'), danger: true }))) return;
    if (!R || R.room.status !== 'active') return;
    try { await api(`/api/manipulatives/live/${R.id}/end`, { method: 'POST', body: {} }); toast(t('js.manip-room.endedMsg')); await refresh(); } catch (e) { toast(e.message, { bad: true }); }
    return;
  }
  // An ended room runs again: the same code, every student's square as it was (services/manipulatives.js reopen).
  if (k === 'reopen') {
    try { await api(`/api/manipulatives/live/${R.id}/reopen`, { method: 'POST', body: {} }); R.menuOpen = false; toast(t('js.manip-room.reopened')); await refresh(); } catch (e) { toast(e.message, { bad: true }); }
    return;
  }
  if (k === 'push') return pushSheet();
  if (k === 'loadpush' || k === 'keeppush') {
    R.seenPush = R.room.pushedAt;
    const A = R.areas.get(R.me), p = parse(R.room.pushed, null);
    if (k === 'loadpush' && A && p) {
      // The teacher's board was made on the big solo board: it comes into the square, made smaller if it must be.
      R.hist.push([A.key, JSON.stringify({ st: A.st, ann: A.ann })]);
      // One scale for everything (the server made every square tall enough to read it: layout.sh).
      const ws = workSize(A), o = stateOf(JSON.stringify(fitInto(R.room.tool, migrate(R.room.tool, parse(p.state, {}) || {}), WORLD, ws).board), ws);
      A.st = o.st; A.ann = o.ann; R.osel = null; renderArea(A.key); renderPal(); queueSave(A.key); goMine(); toast(t('js.manip-room.loadedPush'));
    }
    renderBar();
  }
}
/** Is the teacher's area empty (nothing on it to push)? */
const areaEmpty = A => !A || (!A.st.objects.length && !(A.st.pieces || []).length && !A.ann.strokes.length && !A.ann.texts.some(x => String(x.text || '').trim()));
/** Push a board (the ⋯ menu): "Push my board" sends the teacher's own area as it is right now (nothing saved first);
 *  an empty area says so, with a way to it. Then the saved boards for this tool, if any, and a link that opens the tool
 *  in a new tab to build and save one. The menu closes when the sheet opens. */
function pushSheet() {
  R.menuOpen = false; renderMenu(); renderBar();
  const mine = (R.deps.boards || []).filter(b => b.tool === R.room.tool), T = R.areas.get('t'), empty = areaEmpty(T);
  // The answers typed in the teacher's answer boxes are what "Check my answers" checks against (the server keeps them;
  // students get empty boxes). Boxes with nothing typed: it can still be pushed, without a key.
  const boxes = T ? T.st.objects.filter(o => o.k === 'answer' || o.k === 'frac-eq') : [];
  const noKey = boxes.length && !boxes.some(o => String(o.st.key || o.st.ans || '').trim());
  const box = document.createElement('div');
  box.className = 'mp-viewer rm-pushsheet'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', t('js.manip-room.pushTitle'));
  const own = empty
    ? `<p class="rm-pushempty">${esc(t('js.manip-room.pushEmpty'))}</p>${btn('btn btn-primary', 'data-pgo', `${iconHtml('📍', { size: 18 })} ${esc(t('js.manip-room.pushGoArea'))}`)}`
    : `${btn('btn btn-primary', 'data-pushmine', `${iconHtml('📤', { size: 18 })} ${esc(t('js.manip-room.pushMine'))}`)}<p class="small muted">${esc(t('js.manip-room.pushMineText'))}</p>${noKey ? `<p class="rm-pushnokey">${esc(t('js.manip-room.pushNoKey'))}</p>` : ''}`;
  const saved = mine.length
    ? `<h3>${esc(t('js.manip-room.pushSaved'))}</h3><ul class="rm-pushlist">${mine.map(b => `<li><span>${esc(b.title || '')}</span>${btn('btn btn-sm', `data-push="${esc(b.id)}"`, esc(t('js.manip-room.pushOne', { code: b.code })))}</li>`).join('')}</ul>`
    : `<p class="small muted">${esc(t('js.manip-room.noBoards'))}</p>`;
  box.innerHTML = `<div class="mp-viewbox panel"><div class="row"><h2>${esc(t('js.manip-room.pushTitle'))}</h2>${btn('btn btn-sm', 'data-close', esc(t('js.manip-room.close')))}</div>
    <p class="small muted">${esc(t('js.manip-room.pushText'))}</p><div class="rm-pushown">${own}</div>${saved}
    <p><a href="/manipulatives#${encodeURIComponent(R.room.tool)}" target="_blank" rel="noopener">${esc(t('js.manip-room.pushBuild', { tool: R.tool ? R.tool.name : '' }))}</a></p></div>`;
  R.root.appendChild(box);
  const prev = document.activeElement, shut = () => { box.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.isConnected && prev.focus) prev.focus(); };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); shut(); } };
  document.addEventListener('keydown', onKey);
  box.querySelector('[data-pushmine], [data-pgo], [data-push], [data-close]').focus();
  const send = async (body, msg, el) => {
    el.disabled = true;
    try { await api(`/api/manipulatives/live/${R.id}/push`, { method: 'POST', body }); toast(msg); shut(); } catch (err) { toast(err.message, { bad: true }); el.disabled = false; }
  };
  box.addEventListener('click', async e => {
    if (e.target === box || e.target.closest('[data-close]')) return shut();
    if (e.target.closest('[data-pgo]')) { shut(); R.active = 't'; const A = R.areas.get('t'); renderWorld(); renderPal(); if (A) fitRect({ x: A.rect.x, y: A.rect.y - 36, w: A.rect.w, h: A.rect.h + 36 }, 12); return; }
    const m = e.target.closest('[data-pushmine]');
    if (m) {
      // The area is saved first (a change still waiting, or a new room's first rekenrek, never saved yet): what is pushed
      // is the area as it is on the screen.
      const A = R.areas.get('t');
      for (let i = 0; i < 40 && A && A.saving; i++) await new Promise(r => setTimeout(r, 50));
      if (A) { clearTimeout(A.saveTimer); await saveNow('t'); }
      return send({ own: true }, t('js.manip-room.pushedMine'), m);
    }
    const b = e.target.closest('[data-push]'); if (b) return send({ boardId: b.dataset.push }, t('js.manip-room.pushed'), b);
  });
}

// ---------------------------------------------------------------- the steps card (on the board itself)
/**
 * The steps card pinned at the top of a board (docs/decisions.md "steps on the board"): "Step 2 of 4", the step big,
 * ◀ ▶ for whoever may move it, "All steps" for the list (only the steps given here: a viewer is never handed one they
 * may not see), and for the teacher a way to fold it to one slim line. Not a piece: it sits above the board, so nothing
 * on the board is ever under it. The same look and words as a live square's strip (rm-strip). '' with no steps.
 * o: { list: [{ text }], i (current), total (defaults to the list's length), move (◀ ▶ shown), open (the list),
 *      folded, fold (the teacher may fold it) }. Buttons: data-sc="prev|next|all|fold|unfold".
 */
export function stepCardHtml({ list = [], i = 0, total = list.length, move = true, open = false, folded = false, fold = false } = {}) {
  if (!total || !list.length) return '';
  const n = Math.max(0, Math.min(i, list.length - 1)), rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const label = total > 1 ? t('js.manip-room.stepOf', { n: n + 1, total }) : t('js.manip-room.instructions');
  // Printed, the card shows every step it may (no buttons).
  const print = `<ol class="mp-sc-print">${list.map(x => `<li>${esc(x.text)}</li>`).join('')}</ol>`;
  if (folded) {
    return `<section class="mp-stepcard folded" aria-label="${esc(t('js.manip-room.steps'))}"><div class="mp-sc-row"><span class="mp-sc-no">${iconHtml('📌', { size: 18 })} ${esc(label)}</span>
      <span class="mp-sc-grow"></span>${btn('mp-sc-link', 'data-sc="unfold" aria-expanded="false"', esc(t('js.manip-room.showSteps')))}</div>${print}</section>`;
  }
  const nav = move && total > 1 ? `<span class="mp-sc-nav">${btn('chip mp-sc-arrow', `data-sc="prev"${n ? '' : ' disabled'} aria-label="${esc(t('js.manip-room.prevStep'))}" title="${esc(t('js.manip-room.prevStep'))}"`, rtl ? '▶' : '◀')}${btn('chip mp-sc-arrow', `data-sc="next"${n + 1 < total ? '' : ' disabled'} aria-label="${esc(t('js.manip-room.nextStep'))}" title="${esc(t('js.manip-room.nextStep'))}"`, rtl ? '◀' : '▶')}</span>` : '';
  const all = list.length > 1 ? btn('mp-sc-link', `data-sc="all" aria-expanded="${!!open}"`, esc(open ? t('js.manip-room.thisStep') : t('js.manip-room.allSteps'))) : '';
  const foldBtn = fold ? btn('mp-sc-quiet', `data-sc="fold" aria-label="${esc(t('js.manip-room.hideSteps'))}" title="${esc(t('js.manip-room.hideSteps'))}"`, '✕') : '';
  const body = open ? `<ol class="mp-sc-list">${list.map((x, j) => `<li${j === n ? ' aria-current="step" class="now"' : ''}>${esc(x.text)}</li>`).join('')}</ol>`
    : `<p class="mp-sc-text" aria-live="polite">${esc(list[n] ? list[n].text : '')}</p>`;
  return `<section class="mp-stepcard${open ? ' open' : ''}" aria-label="${esc(t('js.manip-room.steps'))}"><div class="mp-sc-row"><span class="mp-sc-no">${iconHtml('📌', { size: 18 })} ${esc(label)}</span>
    ${all}<span class="mp-sc-grow"></span>${nav}${foldBtn}</div>${body}${print}</section>`;
}

// ---------------------------------------------------------------- the steps editor (the room and the tool on its own)
/** A deck of steps to build: reorder (drag, or ↑ ↓), add, edit, delete. Mounts in box; onChange(steps) after each change. */
export function stepsEditor(box, steps, onChange) {
  let list = (steps || []).map((x, i) => ({ id: x.id || `s${Date.now().toString(36)}${i}`, text: x.text || '' }));
  let from = null;
  const changed = () => onChange(list.map(x => ({ ...x })));
  const draw = () => {
    box.innerHTML = `${list.length ? `<ol class="rm-stepsed">${list.map((x, i) => `<li draggable="true" data-i="${i}"><span class="rm-grip" aria-hidden="true">⠿</span>
      <label class="sr-only" for="st-${i}">${esc(t('js.manip-room.stepN', { n: i + 1 }))}</label><textarea id="st-${i}" class="input" rows="2" maxlength="300" data-si="${i}" placeholder="${esc(t('js.manip-room.stepPh'))}">${esc(x.text)}</textarea>
      <span class="rm-stepops">${btn('btn btn-sm', `data-sup="${i}"${i ? '' : ' disabled'} aria-label="${esc(t('js.manip-room.stepUp', { n: i + 1 }))}"`, '↑')}${btn('btn btn-sm', `data-sdown="${i}"${i + 1 < list.length ? '' : ' disabled'} aria-label="${esc(t('js.manip-room.stepDown', { n: i + 1 }))}"`, '↓')}${btn('btn btn-sm btn-danger', `data-sdel="${i}" aria-label="${esc(t('js.manip-room.stepDelete', { n: i + 1 }))}"`, '✕')}</span></li>`).join('')}</ol>`
      : `<p class="small muted">${esc(t('js.manip-room.noSteps'))}</p>`}${list.length < 20 ? btn('btn btn-sm', 'data-sadd', `+ ${esc(t('js.manip-room.addStep'))}`) : ''}`;
  };
  const move = (i, j) => { if (j < 0 || j >= list.length || i === j) return; const [x] = list.splice(i, 1); list.splice(j, 0, x); draw(); changed(); };
  box.oninput = e => { const ta = e.target.closest('[data-si]'); if (!ta) return; list[+ta.dataset.si].text = ta.value.slice(0, 300); changed(); };
  box.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sup) move(+b.dataset.sup, +b.dataset.sup - 1);
    else if (b.dataset.sdown) move(+b.dataset.sdown, +b.dataset.sdown + 1);
    else if (b.dataset.sdel) { list.splice(+b.dataset.sdel, 1); draw(); changed(); }
    else if (b.hasAttribute('data-sadd')) { list.push({ id: `s${Date.now().toString(36)}`, text: '' }); draw(); changed(); box.querySelector(`#st-${list.length - 1}`)?.focus(); }
  };
  box.ondragstart = e => { const li = e.target.closest('li[data-i]'); if (li) { from = +li.dataset.i; e.dataTransfer.effectAllowed = 'move'; } };
  box.ondragover = e => { if (from !== null) e.preventDefault(); };
  box.ondrop = e => { const li = e.target.closest('li[data-i]'); if (li && from !== null) { e.preventDefault(); move(from, +li.dataset.i); } from = null; };
  draw();
}
function stepsSheet() {
  const A = R.areas.get('t'); if (!A) return;
  const box = document.createElement('div');
  box.className = 'mp-viewer rm-steps-sheet'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', t('js.manip-room.steps'));
  box.innerHTML = `<div class="mp-viewbox panel"><div class="row"><h2>${iconHtml('📋', { size: 28 })} ${esc(t('js.manip-room.steps'))}</h2>${btn('btn btn-sm', 'data-close', esc(t('js.manip-room.done')))}</div>
    <p class="small muted">${esc(t('js.manip-room.stepsText'))}</p><div id="rm-stepsed"></div></div>`;
  R.root.appendChild(box);
  stepsEditor(box.querySelector('#rm-stepsed'), A.steps, list => { A.steps = list.filter(x => x.text.trim()); queueSave('t'); });
  box.addEventListener('click', e => { if (e.target === box || e.target.closest('[data-close]')) box.remove(); });
}
