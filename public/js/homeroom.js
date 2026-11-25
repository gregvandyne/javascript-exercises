// Homeroom, the teacher's board (docs/homeroom.md; server: routes/homeroom.js, services/homeroom.js). Step 1a: one big
// board with the Manipulatives live room's feel and its pieces (public/js/board-view.js: pan, zoom, Fit, the zoom pill
// and the minimap; public/js/board-ann.js: pen marks and text; the room's sticky notes and its CSS), holding:
//   - the teacher's area across the top (yellow band, everyone will see it): sticky notes, text, pen and shapes, saved
//     half a second after a change (POST /api/homeroom/<class>/area), cleaned on the server like the room's area;
//   - the teacher's desk, and a desk per student with their name above it and their group's color as its border;
//   - Arrange seats: Rows, Tables of 4, U-shape, Circle, then drag any desk (or move it with the arrow keys); saved per
//     class (POST .../seats);
//   - groups the teacher names, with a color each (POST .../groups).
// Handouts, live class, plans and cursors come in later steps (docs/homeroom.md "Build order").
import { t, api, toast, esc, pageData, sheet } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { clamp, zoomAround, fitView, applyTransform, miniHtml, miniPoint, zoomPillHtml } from '/js/board-view.js';
import { inkLine, textBoxHtml, textSizeButton, textBoxPointer, snapText } from '/js/board-ann.js';
import { AREA, TEACHER_DESK, DESK, PRESETS, GROUP_COLORS, GROUPS_MAX, GROUP_NAME_MAX, layout, clampSeat, boardSize } from '/js/homeroom-seats.js';

const D = pageData();
const PEN_COLORS = ['#FF6B4A', '#141414', '#1F9D63', '#1E88E5'];
const NOTE_MAX = 12, TEXT_MAX = 30, SHAPE_MAX = 40, Z_MIN = 0.12, Z_MAX = 2.5, Z_FIT = 0.05;
const MODES = ['note', 'text', 'pen', 'rect', 'circle', 'line'];
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const phone = () => window.matchMedia('(max-width: 819px)').matches;
const tm = (k, v) => t(`js.manip-room.${k}`, v);
const th = (k, v) => t(`js.homeroom.${k}`, v);
const newId = () => Math.random().toString(36).slice(2, 10);

const room = D.room || {};
const H = {
  students: room.students || [], seats: room.seats || {}, preset: room.preset || 'rows', groups: room.groups || [], members: room.members || {},
  ann: { notes: [], texts: [], strokes: [], ...((room.area || {}).__ann || {}) }, shapes: Array.isArray((room.area || {}).shapes) ? room.area.shapes : [],
  view: { x: 0, y: 0, z: 0.5 }, mode: 'move', pen: PEN_COLORS[1], hist: [], editing: null, textEdit: null, shapeSel: null, gesture: null, pointers: new Map(),
  justPanned: false, menuOpen: false, seatsOpen: false, deskSel: null,
};
const $ = id => document.getElementById(id);
const board = $('hr-board'), worldEl = $('hr-world');

// ---------------------------------------------------------------- groups and names
const groupOf = sid => H.groups.find(g => g.id === H.members[sid]) || null;
const groupName = g => (g.name || (g.key ? th(`groups.${g.key}`) : '')) || th('groups.unnamed');
const count = g => H.students.filter(s => H.members[s.id] === g.id).length;
function renderChips() {
  $('hr-groupchips').innerHTML = `<span class="hr-gchip whole">${esc(th('wholeClass', { count: H.students.length }))}</span>${H.groups.map(g => `<span class="hr-gchip" style="--gc:${esc(g.color)}"><span class="rm-dot" style="--c:${esc(g.color)}"></span>${esc(groupName(g))} · ${count(g)}</span>`).join('')}
    ${btn('hr-gedit', 'data-hr="groups"', `${iconHtml('🏷️', { size: 16 })} ${esc(th('editGroups'))}`)}`;
}

// ---------------------------------------------------------------- the board
const world = () => boardSize(H.seats);
function areaInner() {
  return `<div class="rm-in hr-areain"><svg class="mp-ink" viewBox="0 0 ${AREA.w} ${AREA.h}" aria-hidden="true">${H.ann.strokes.map(s => inkLine(s, AREA.w, AREA.h)).join('')}</svg>
    <svg class="hr-shapes" viewBox="0 0 ${AREA.w} ${AREA.h}" aria-hidden="true">${H.shapes.map(shapeSvg).join('')}</svg>
    ${H.shapeSel ? shapeDelHtml() : ''}
    <div class="mp-texts">${H.ann.texts.map(x => textBoxHtml(x, { editing: H.textEdit === x.id, ro: false, del: 'data-hrtx', id: `hrt-${x.id}`, label: tm('textLabel'), ph: tm('textPh'), delLabel: tm('textDelete') })).join('')}</div>
    <div class="mp-notes">${H.ann.notes.map(noteHtml).join('')}</div></div>`;
}
function shapeSvg(s) {
  const x1 = s.x * AREA.w, y1 = s.y * AREA.h, x2 = s.x2 * AREA.w, y2 = s.y2 * AREA.h, on = H.shapeSel === s.id ? ' on' : '';
  const attrs = `class="hr-shape${on}" data-shape="${esc(s.id)}" stroke="${esc(s.c)}" stroke-width="5" fill="none" stroke-linecap="round"`;
  if (s.k === 'line') return `<line ${attrs} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line class="hr-hit" data-shape="${esc(s.id)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  if (s.k === 'circle') return `<ellipse ${attrs} cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
  return `<rect ${attrs} x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>`;
}
function shapeDelHtml() {
  const s = H.shapes.find(x => x.id === H.shapeSel); if (!s) return '';
  return btn('hr-shapedel', `data-hrshapedel="${esc(s.id)}" style="left:${Math.max(s.x, s.x2) * 100}%;top:${Math.min(s.y, s.y2) * 100}%" aria-label="${esc(th('shapeDelete'))}"`, '×');
}
function noteHtml(n, i) {
  const pos = `left:${(+n.x || 0) * 100}%;top:${(+n.y || 0) * 100}%`, id = esc(n.id);
  if (H.editing === n.id) {
    return `<div class="mp-sticky editing" data-note="${id}" style="${pos}"><label class="sr-only" for="hrn-${id}">${esc(tm('noteText', { n: i + 1 }))}</label>
      <textarea id="hrn-${id}" class="mp-notetext" rows="3" maxlength="300" placeholder="${esc(tm('notePh'))}">${esc(n.text)}</textarea>
      <div class="row">${btn('mp-nbtn', `data-nact="done" data-id="${id}"`, esc(tm('done')))}${btn('mp-nbtn bad', `data-nact="delete" data-id="${id}"`, esc(tm('delete')))}</div></div>`;
  }
  return `<div class="mp-sticky" data-note="${id}" role="group" aria-label="${esc(tm('noteN', { n: i + 1 }))}" style="${pos}"><p>${n.text ? esc(n.text) : `<span class="mp-ph">${esc(tm('noteTap'))}</span>`}</p>
    <div class="row">${btn('mp-nbtn', `data-nact="edit" data-id="${id}"`, `${iconHtml('✎', { size: 18 })} ${esc(tm('edit'))}`)}${btn('mp-nbtn bad', `data-nact="delete" data-id="${id}"`, esc(tm('delete')))}</div></div>`;
}
function deskHtml(s) {
  const p = H.seats[s.id] || { x: 0, y: 0 }, g = groupOf(s.id), c = g ? g.color : '';
  return `<div class="hr-desk${H.deskSel === s.id ? ' sel' : ''}" data-sid="${esc(s.id)}" role="group" aria-label="${esc(th('deskOf', { name: s.name }))}"${H.seatsOpen ? ' tabindex="0"' : ''}
    style="left:${p.x}px;top:${p.y}px;width:${DESK.w}px;height:${DESK.h}px${c ? `;--gc:${esc(c)}` : ''}">
    <span class="hr-name"><span class="rm-dot"${c ? ` style="--c:${esc(c)}"` : ''}></span><bdi>${esc(s.name)}</bdi></span>
    <span class="hr-empty">${esc(th('emptyDesk'))}</span>${g ? `<span class="hr-gtag">${esc(groupName(g))}</span>` : ''}</div>`;
}
function renderWorld() {
  const w = world();
  worldEl.style.width = `${w.w}px`; worldEl.style.height = `${w.h}px`;
  worldEl.innerHTML = `<section class="rm-area teach editable hr-area${H.mode !== 'move' && MODES.includes(H.mode) ? ' drawing' : ''}" data-key="t" style="left:${AREA.x}px;top:${AREA.y}px;width:${AREA.w}px;height:${AREA.h}px" aria-label="${esc(tm('teacherArea'))}">
      <header class="rm-label">✦ ${esc(tm('teacherArea'))} · ${esc(tm('teacherAreaNote'))}</header><div class="hr-areabody">${areaInner()}</div></section>
    <div class="hr-tdesk" style="left:${TEACHER_DESK.x}px;top:${TEACHER_DESK.y}px;width:${TEACHER_DESK.w}px;height:${TEACHER_DESK.h}px">${esc(th('teacherDesk'))}</div>
    ${H.students.map(deskHtml).join('')}
    ${H.students.length ? '' : `<p class="hr-nostudents" style="left:${AREA.x}px;top:${TEACHER_DESK.y + 160}px;width:${AREA.w}px">${esc(th('noStudents'))} <a href="/class/${esc(D.classId)}?tab=students">${esc(th('addStudents'))}</a></p>`}`;
  board.classList.toggle('hr-seating', H.seatsOpen);
  applyView();
}
function renderArea() {
  const el = worldEl.querySelector('.hr-areabody'); if (!el) return;
  el.innerHTML = areaInner();
  const ta = el.querySelector('textarea'); if (ta) ta.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- the view
function size() { return { w: board.clientWidth || 800, h: board.clientHeight || 600 }; }
const toWorld = (cx, cy) => { const r = board.getBoundingClientRect(); return { x: (cx - r.left - H.view.x) / H.view.z, y: (cy - r.top - H.view.y) / H.view.z }; };
function applyView() {
  applyTransform(worldEl, H.view);
  for (const p of document.querySelectorAll('#hr-zoom .rm-pct')) p.textContent = `${Math.round(H.view.z * 100)}%`;
  renderMini();
}
function zoomAt(f, sx, sy) { H.view = zoomAround(H.view, f, sx, sy, Math.min(Z_MIN, H.view.z), Z_MAX); applyView(); }
function zoomMid(f) { const s = size(); zoomAt(f, s.w / 2, s.h / 2); }
/** The free part of the board's box: right of the teacher's desk panel (under it on a phone), under the seat bar. */
function freeBox() {
  const s = size(), panel = $('hr-panel'), bar = $('hr-seatbar');
  const left = !phone() && panel ? panel.offsetWidth + 28 : 8, top = (H.seatsOpen && bar && !bar.hidden ? bar.offsetHeight + 24 : 12);
  const bottom = phone() && panel ? panel.offsetHeight + 72 : 72;
  return { left, top, w: Math.max(100, s.w - left - 16), h: Math.max(100, s.h - top - bottom) };
}
function fit() {
  const w = world(), xs = [AREA.x, ...Object.values(H.seats).map(p => p.x)], ys = Object.values(H.seats).map(p => p.y + DESK.h);
  const x0 = Math.min(...xs) - 20, x1 = Math.max(AREA.x + AREA.w, ...Object.values(H.seats).map(p => p.x + DESK.w)) + 20;
  const rect = { x: x0, y: 0, w: Math.min(w.w, x1) - x0, h: Math.max(AREA.y + AREA.h + 140, ...ys) + 40 };
  H.view = fitView(rect, freeBox(), { pad: 12, zMin: Z_FIT, zMax: 1 });
  applyView();
}
function renderMini() {
  const el = $('hr-mini'); if (!el) return;
  if (phone()) { el.innerHTML = ''; return; }
  const items = [{ rect: AREA, cls: 't', c: '#FFD23F' }, { rect: TEACHER_DESK, cls: '', c: '#141414' },
    ...H.students.map(s => ({ rect: { ...(H.seats[s.id] || { x: 0, y: 0 }), ...DESK }, cls: '', c: (groupOf(s.id) || { color: '#B9B3A0' }).color }))];
  el.innerHTML = miniHtml({ world: world(), items, view: H.view, size: size(), width: 150, label: tm('map') });
}
function renderZoom() {
  $('hr-zoom').innerHTML = zoomPillHtml({ z: H.view.z, attr: 'data-hr', labels: { zoom: tm('zoom'), zoomOut: tm('zoomOut'), zoomIn: tm('zoomIn'), fit: tm('fit') } });
}

// ---------------------------------------------------------------- the board tools (the teacher's area)
function renderTools() {
  const tool = (mode, icon, label) => btn(`mp-tbtn hr-tool${H.mode === mode ? ' on' : ''}`, `data-hrmode="${mode}" aria-pressed="${H.mode === mode}"`, `${icon}<span> ${esc(label)}</span>`);
  $('hr-tools').innerHTML = `<div class="hr-toolgrid">${tool('note', iconHtml('🗒️', { size: 18 }), tm('note'))}${tool('text', '<b class="mp-tglyph">T</b>', tm('text'))}${tool('pen', iconHtml('✎', { size: 18 }), tm('pen'))}
      ${tool('rect', iconHtml('🔲', { size: 18 }), th('shapes.rect'))}${tool('circle', iconHtml('⚪', { size: 18 }), th('shapes.circle'))}${tool('line', iconHtml('📏', { size: 18 }), th('shapes.line'))}
      ${btn('mp-tbtn hr-tool', `data-hr="undo"${H.hist.length ? '' : ' disabled'}`, `${iconHtml('↩', { size: 18 })}<span> ${esc(tm('undo'))}</span>`)}</div>
    ${['pen', 'rect', 'circle', 'line'].includes(H.mode) ? `<div class="row rm-pens">${PEN_COLORS.map(c => btn(`mp-pen${H.pen === c ? ' on' : ''}`, `data-hrpen="${c}" style="background:${c}" aria-label="${esc(tm('penColor', { color: c }))}"`, '')).join('')}${H.mode === 'pen' ? btn('chip', 'data-hr="clearpen"', esc(tm('clearPen'))) : ''}</div>` : ''}
    <p class="hr-toolhint small">${esc(H.mode === 'move' ? th('hintMove') : th('hintDraw'))}</p>`;
}
function setMode(m) {
  H.mode = H.mode === m ? 'move' : m;
  if (H.textEdit) commitText();
  H.editing = null; H.shapeSel = null;
  board.classList.toggle('inking', H.mode !== 'move');
  renderTools(); renderArea();
  worldEl.querySelector('.hr-area')?.classList.toggle('drawing', H.mode !== 'move');
}
const snapshot = () => JSON.stringify({ ann: H.ann, shapes: H.shapes });
function remember() { H.hist.push(snapshot()); if (H.hist.length > 60) H.hist.shift(); }
let saveTimer = null;
function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveArea, 450); renderTools(); }
async function saveArea() {
  saveTimer = null;
  const state = { __ann: { notes: H.ann.notes, strokes: H.ann.strokes, texts: H.ann.texts.filter(x => String(x.text || '').trim()) }, shapes: H.shapes };
  try { await api(`/api/homeroom/${encodeURIComponent(D.classId)}/area`, { method: 'POST', body: { state } }); } catch (e) { toast(e.message, { bad: true }); }
}
function undo() {
  const last = H.hist.pop(); if (!last) return;
  const o = JSON.parse(last); H.ann = o.ann; H.shapes = o.shapes; H.editing = null; H.textEdit = null; H.shapeSel = null;
  renderArea(); queueSave();
}
/** A point inside the teacher's area, as fractions of it (null outside). */
function inArea(cx, cy, pad = 0) {
  const p = toWorld(cx, cy), x = (p.x - AREA.x) / AREA.w, y = (p.y - AREA.y) / AREA.h;
  return x < -pad || y < -pad || x > 1 + pad || y > 1 + pad ? null : { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
}
function commitText() {
  const id = H.textEdit; if (!id) return;
  H.textEdit = null;
  const inp = worldEl.querySelector('.hr-area .mp-textin'), x = H.ann.texts.find(n => n.id === id);
  if (x && inp) x.text = inp.value.replace(/\n+/g, ' ').slice(0, 200);
  H.ann.texts = H.ann.texts.filter(n => String(n.text || '').trim());
  renderArea(); queueSave();
}
function commitNote() {
  const id = H.editing; if (!id) return;
  const ta = worldEl.querySelector('.hr-area textarea.mp-notetext'), n = H.ann.notes.find(x => x.id === id);
  if (n && ta) n.text = ta.value.slice(0, 300);
  H.editing = null; renderArea(); queueSave();
}

// ---------------------------------------------------------------- Arrange seats
function renderSeatbar() {
  const el = $('hr-seatbar');
  el.hidden = !H.seatsOpen;
  document.querySelector('[data-hr="seats"]')?.setAttribute('aria-pressed', String(H.seatsOpen));
  if (!H.seatsOpen) { el.innerHTML = ''; return; }
  el.innerHTML = `<span class="hr-seatlead">${esc(th('seats.lead'))}</span>${PRESETS.map(p => btn(`btn btn-sm hr-chunk${H.preset === p ? ' on' : ''}`, `data-hrpreset="${p}" aria-pressed="${H.preset === p}"`, esc(th(`seats.${p}`)))).join('')}
    <span class="hr-seathint small">${esc(th('seats.hint'))}</span>${btn('btn btn-sm hr-chunk hr-done', 'data-hr="seatsdone"', esc(th('seats.done')))}`;
}
function openSeats(on = !H.seatsOpen) {
  H.seatsOpen = on; H.deskSel = null; H.menuOpen = false; renderMenu();
  if (on && H.mode !== 'move') setMode(H.mode);
  renderSeatbar(); renderWorld();
  if (!on) toast(th('seats.saved', { class: D.className }));
}
async function saveSeats(body) {
  try { const r = await api(`/api/homeroom/${encodeURIComponent(D.classId)}/seats`, { method: 'POST', body }); H.seats = r.seats; H.preset = r.preset; }
  catch (e) { toast(e.message, { bad: true }); }
}
async function usePreset(p) {
  const spots = layout(p, H.students.length), seats = {};
  H.students.forEach((s, i) => { seats[s.id] = spots[i]; });
  H.seats = seats; H.preset = p; renderSeatbar(); renderWorld(); fit();
  await saveSeats({ preset: p, seats });
}
let seatTimer = null;
function seatMoved(sid) { clearTimeout(seatTimer); const at = H.seats[sid]; seatTimer = setTimeout(() => saveSeats({ seats: { [sid]: at } }), 300); renderMini(); }
function moveDeskEl(sid) {
  const el = worldEl.querySelector(`.hr-desk[data-sid="${CSS.escape(sid)}"]`), p = H.seats[sid];
  if (el && p) { el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; }
}

// ---------------------------------------------------------------- the ⋯ menu and groups
function renderMenu() {
  const el = $('hr-menu');
  document.querySelector('[data-hr="menu"]')?.setAttribute('aria-expanded', String(H.menuOpen));
  if (!H.menuOpen) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="rm-menu panel hr-menu" role="menu"><div class="rm-menu-body">
    ${btn('rm-mi', 'role="menuitem" data-hr="seats"', `${iconHtml('🔀', { size: 18 })} ${esc(th('arrange'))}`)}
    ${btn('rm-mi', 'role="menuitem" data-hr="groups"', `${iconHtml('🏷️', { size: 18 })} ${esc(th('editGroups'))}`)}
    <p class="hr-menusoon small">${esc(th('menuSoon'))}</p></div></div>`;
  el.querySelector('button')?.focus();
}
function groupsSheet() {
  H.menuOpen = false; renderMenu();
  let groups = H.groups.map(g => ({ ...g, name: groupName(g) })), members = { ...H.members };
  const draw = () => `<p class="small muted">${esc(th('groupsLead'))}</p>
    <ol class="hr-glist">${groups.map((g, i) => `<li><span class="rm-dot" style="--c:${esc(g.color)}"></span>
      <label class="sr-only" for="hrg-${i}">${esc(th('groupName', { n: i + 1 }))}</label><input class="input input-sm" id="hrg-${i}" data-gname="${i}" maxlength="${GROUP_NAME_MAX}" value="${esc(g.name)}">
      <span class="hr-swatches" role="radiogroup" aria-label="${esc(th('groupColor', { n: i + 1 }))}">${GROUP_COLORS.map((c, k) => `<button type="button" class="hr-sw${g.color === c ? ' on' : ''}" role="radio" aria-checked="${g.color === c}" data-gcolor="${i}:${c}" style="background:${c}" aria-label="${esc(th('colorN', { n: k + 1 }))}"></button>`).join('')}</span>
      ${groups.length > 1 ? btn('btn btn-sm', `data-gdel="${i}" aria-label="${esc(th('removeGroup', { name: g.name || th('groups.unnamed') }))}"`, '×') : ''}</li>`).join('')}</ol>
    ${groups.length < GROUPS_MAX ? btn('btn btn-sm', 'data-gadd', `+ ${esc(th('addGroup'))}`) : ''}
    <h3 class="hr-gsub">${esc(th('whoIsIn'))}</h3>
    ${H.students.length ? `<ul class="plain hr-gstudents">${H.students.map(s => `<li><label for="hrm-${esc(s.id)}"><bdi>${esc(s.name)}</bdi></label><select class="input input-sm" id="hrm-${esc(s.id)}" data-gmember="${esc(s.id)}">
      <option value="">${esc(th('noGroup'))}</option>${groups.map(g => `<option value="${esc(g.id)}"${members[s.id] === g.id ? ' selected' : ''}>${esc(g.name || th('groups.unnamed'))}</option>`).join('')}</select></li>`).join('')}</ul>` : `<p class="small muted">${esc(th('noStudents'))}</p>`}
    <div class="row hr-gacts">${btn('btn btn-primary', 'data-gsave', esc(th('save')))}</div>`;
  const sh = sheet({ title: `🏷️ ${th('groupsTitle')}`, content: draw() });
  const body = sh.el.querySelector('.sheet-body');
  const read = () => { for (const inp of body.querySelectorAll('[data-gname]')) groups[+inp.dataset.gname].name = inp.value; for (const sel of body.querySelectorAll('[data-gmember]')) { if (sel.value) members[sel.dataset.gmember] = sel.value; else delete members[sel.dataset.gmember]; } };
  const redraw = () => { body.innerHTML = draw(); };
  body.addEventListener('click', async e => {
    const c = e.target.closest('[data-gcolor]');
    if (c) { read(); const [i, col] = c.dataset.gcolor.split(':'); groups[+i].color = col; redraw(); body.querySelector(`[data-gcolor="${i}:${col}"]`)?.focus(); return; }
    const del = e.target.closest('[data-gdel]');
    if (del) { read(); const g = groups.splice(+del.dataset.gdel, 1)[0]; for (const k of Object.keys(members)) if (members[k] === g.id) delete members[k]; redraw(); return; }
    if (e.target.closest('[data-gadd]')) {
      read(); const used = new Set(groups.map(g => g.color));
      groups.push({ id: `g${newId()}`, name: '', color: GROUP_COLORS.find(x => !used.has(x)) || GROUP_COLORS[0] }); redraw();
      body.querySelector(`[data-gname="${groups.length - 1}"]`)?.focus(); return;
    }
    if (e.target.closest('[data-gsave]')) {
      read();
      // A default group whose name was left as it was keeps following the teacher's language.
      const out = groups.map(g => { const d = g.key && g.name.trim() === th(`groups.${g.key}`); return { id: g.id, ...(g.key && (d || !g.name.trim()) ? { key: g.key } : {}), name: d ? '' : g.name.trim(), color: g.color }; });
      if (out.some(g => !g.name && !g.key)) { toast(th('needName'), { bad: true }); return; }
      try {
        const r = await api(`/api/homeroom/${encodeURIComponent(D.classId)}/groups`, { method: 'POST', body: { groups: out, members } });
        H.groups = r.groups; H.members = r.members; sh.close(); renderChips(); renderWorld(); toast(th('groupsSaved'));
      } catch (err) { toast(err.message, { bad: true }); }
    }
  });
}

// ---------------------------------------------------------------- input
const UI = 'button, a, input, select, textarea, label, .hr-panel, .hr-seatbar, .rm-float, .rm-menu';
function down(e) {
  H.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (H.pointers.size === 2) { const [a, b] = [...H.pointers.values()]; H.gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; return; }
  if (e.target.closest(UI)) return;
  const desk = e.target.closest('.hr-desk');
  if (H.seatsOpen && desk) {
    const sid = desk.dataset.sid, p = H.seats[sid] || { x: 0, y: 0 };
    H.deskSel = sid; for (const d of worldEl.querySelectorAll('.hr-desk.sel')) d.classList.remove('sel'); desk.classList.add('sel');
    H.gesture = { kind: 'desk', sid, sx: e.clientX, sy: e.clientY, x0: p.x, y0: p.y, moved: false };
    board.setPointerCapture(e.pointerId); e.preventDefault(); return;
  }
  const textEl = e.target.closest('.hr-area .mp-text[data-text]');
  if (textEl && textEl.classList.contains('editing')) {
    const x = H.ann.texts.find(n => n.id === textEl.dataset.text);
    if (x) textBoxPointer(e, { x, el: textEl, space: AREA, zoom: () => H.view.z, others: () => [], start: remember, done: moved => { if (moved) queueSave(); H.justPanned = true; } });
    return;
  }
  const at = inArea(e.clientX, e.clientY);
  if (at && !H.seatsOpen && H.mode !== 'move') {
    if (H.textEdit) { commitText(); H.justPanned = true; return; }
    if (H.editing) { commitNote(); H.justPanned = true; return; }
    if (H.mode === 'pen') { remember(); H.ann.strokes.push({ c: H.pen, pts: [at] }); H.gesture = { kind: 'ink' }; board.setPointerCapture(e.pointerId); return; }
    if (H.mode === 'note') {
      if (H.ann.notes.length >= NOTE_MAX) { toast(th('tooMany'), { bad: true }); return; }
      remember(); const n = { id: `n-${newId()}`, text: '', x: clamp(at.x, 0, 0.88), y: clamp(at.y, 0, 0.7), by: 't' };
      H.ann.notes.push(n); H.editing = n.id; H.mode = 'move'; renderTools(); renderArea(); H.justPanned = true; e.preventDefault(); return;
    }
    if (H.mode === 'text') {
      if (H.ann.texts.length >= TEXT_MAX) { toast(th('tooMany'), { bad: true }); return; }
      remember(); const x = { id: `x-${newId()}`, text: '', x: clamp(at.x, 0, 0.95), y: clamp(at.y - 10 / AREA.h, 0, 0.96), by: 't' };
      H.ann.texts.push(x); H.textEdit = x.id; renderArea(); H.justPanned = true; e.preventDefault(); return;
    }
    if (['rect', 'circle', 'line'].includes(H.mode)) {
      if (H.shapes.length >= SHAPE_MAX) { toast(th('tooMany'), { bad: true }); return; }
      remember(); const s = { id: `s-${newId()}`, k: H.mode, x: at.x, y: at.y, x2: at.x, y2: at.y, c: H.pen };
      H.shapes.push(s); H.gesture = { kind: 'shape', s }; board.setPointerCapture(e.pointerId); return;
    }
  }
  if (at && !H.seatsOpen) {
    const noteEl = e.target.closest('.mp-sticky[data-note]:not(.editing)'), textEl2 = e.target.closest('.mp-text[data-text]'), shapeEl = e.target.closest('[data-shape]');
    const it = noteEl ? H.ann.notes.find(n => n.id === noteEl.dataset.note) : textEl2 ? H.ann.texts.find(n => n.id === textEl2.dataset.text) : null;
    if (it) { H.gesture = { kind: noteEl ? 'note' : 'text', it, el: noteEl || textEl2, sx: e.clientX, sy: e.clientY, x0: +it.x || 0, y0: +it.y || 0, moved: false }; board.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    if (shapeEl) { const s = H.shapes.find(x => x.id === shapeEl.dataset.shape); if (s) { H.gesture = { kind: 'moveShape', s, sx: e.clientX, sy: e.clientY, o: { ...s }, moved: false }; board.setPointerCapture(e.pointerId); e.preventDefault(); return; } }
  }
  H.gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, x0: H.view.x, y0: H.view.y, moved: false };
  board.setPointerCapture(e.pointerId);
}
function move(e) {
  if (H.pointers.has(e.pointerId)) H.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const g = H.gesture; if (!g) return;
  if (g.kind === 'pinch') {
    if (H.pointers.size !== 2) return;
    const [a, b] = [...H.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, r = board.getBoundingClientRect();
    H.view.x += cx - g.cx; H.view.y += cy - g.cy; zoomAt(d / (g.d || d), cx - r.left, cy - r.top); Object.assign(g, { d, cx, cy }); return;
  }
  const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
  if (g.kind === 'pan') { if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true; H.view.x = g.x0 + dx; H.view.y = g.y0 + dy; applyView(); return; }
  if (g.kind === 'ink') { const s = H.ann.strokes[H.ann.strokes.length - 1], p = inArea(e.clientX, e.clientY, 1); if (s && p && s.pts.length < 600) s.pts.push(p); const svg = worldEl.querySelector('.hr-area .mp-ink'); if (svg) svg.innerHTML = H.ann.strokes.map(x => inkLine(x, AREA.w, AREA.h)).join(''); return; }
  if (g.kind === 'shape') { const p = inArea(e.clientX, e.clientY, 1); if (p) { g.s.x2 = p.x; g.s.y2 = p.y; const svg = worldEl.querySelector('.hr-area .hr-shapes'); if (svg) svg.innerHTML = H.shapes.map(shapeSvg).join(''); } return; }
  if (!g.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
  if (!g.moved && g.kind !== 'desk') remember();
  g.moved = true;
  const z = H.view.z;
  if (g.kind === 'desk') { const p = clampSeat({ x: Math.round((g.x0 + dx / z) / 10) * 10, y: Math.round((g.y0 + dy / z) / 10) * 10 }); if (p) { H.seats[g.sid] = p; moveDeskEl(g.sid); } return; }
  if (g.kind === 'note' || g.kind === 'text') {
    g.it.x = clamp(g.x0 + dx / z / AREA.w, 0, 1 - g.el.offsetWidth / AREA.w); g.it.y = clamp(g.y0 + dy / z / AREA.h, 0, 1 - g.el.offsetHeight / AREA.h);
    g.el.style.left = `${g.it.x * 100}%`; g.el.style.top = `${g.it.y * 100}%`; return;
  }
  if (g.kind === 'moveShape') {
    const o = g.o, ddx = clamp(dx / z / AREA.w, -Math.min(o.x, o.x2), 1 - Math.max(o.x, o.x2)), ddy = clamp(dy / z / AREA.h, -Math.min(o.y, o.y2), 1 - Math.max(o.y, o.y2));
    Object.assign(g.s, { x: o.x + ddx, x2: o.x2 + ddx, y: o.y + ddy, y2: o.y2 + ddy });
    const svg = worldEl.querySelector('.hr-area .hr-shapes'); if (svg) svg.innerHTML = H.shapes.map(shapeSvg).join('');
  }
}
function up(e) {
  H.pointers.delete(e.pointerId);
  const g = H.gesture; if (!g) return;
  if (g.kind === 'pinch') { if (H.pointers.size < 2) H.gesture = null; return; }
  H.gesture = null;
  if (g.kind === 'pan') {
    H.justPanned = g.moved;
    if (!g.moved) {
      if (H.textEdit) commitText(); else if (H.editing) commitNote();
      if (H.shapeSel) { H.shapeSel = null; renderArea(); }
      if (H.deskSel) { H.deskSel = null; for (const d of worldEl.querySelectorAll('.hr-desk.sel')) d.classList.remove('sel'); }
    }
    return;
  }
  if (g.kind === 'desk') { if (g.moved) seatMoved(g.sid); H.justPanned = true; return; }
  if (g.kind === 'ink') { H.ann.strokes = H.ann.strokes.filter(s => s.pts.length > 1); renderArea(); queueSave(); return; }
  if (g.kind === 'shape') {
    const s = g.s, tiny = Math.abs(s.x2 - s.x) * AREA.w < 12 && Math.abs(s.y2 - s.y) * AREA.h < 12;
    if (tiny) { H.shapes = H.shapes.filter(x => x !== s); H.hist.pop(); } else queueSave();
    renderArea(); renderTools(); H.justPanned = true; return;
  }
  if (g.kind === 'moveShape') { if (g.moved) queueSave(); else H.shapeSel = H.shapeSel === g.s.id ? null : g.s.id; renderArea(); H.justPanned = true; return; }
  if (g.kind === 'text') {
    if (g.moved) { snapText(g.it, g.el, AREA, [], 14 / H.view.z); queueSave(); }
    else { if (H.textEdit) commitText(); H.textEdit = g.it.id; renderArea(); }
    H.justPanned = true; return;
  }
  if (g.kind === 'note') { if (g.moved) queueSave(); else { H.editing = g.it.id; renderArea(); } H.justPanned = true; }
}
function click(e) {
  if (H.justPanned) { H.justPanned = false; if (!e.target.closest(UI)) return; }
  const mode = e.target.closest('[data-hrmode]'); if (mode) return setMode(mode.dataset.hrmode);
  const pen = e.target.closest('[data-hrpen]'); if (pen) { H.pen = pen.dataset.hrpen; renderTools(); return; }
  const preset = e.target.closest('[data-hrpreset]'); if (preset) return usePreset(preset.dataset.hrpreset);
  const sd = e.target.closest('[data-hrshapedel]'); if (sd) { remember(); H.shapes = H.shapes.filter(s => s.id !== sd.dataset.hrshapedel); H.shapeSel = null; renderArea(); queueSave(); return; }
  const tx = e.target.closest('[data-hrtx]'); if (tx) { remember(); H.ann.texts = H.ann.texts.filter(n => n.id !== tx.dataset.hrtx); H.textEdit = null; renderArea(); queueSave(); return; }
  const tsz = e.target.closest('[data-tsz]');
  if (tsz && H.textEdit) {
    const x = H.ann.texts.find(n => n.id === H.textEdit), inp = worldEl.querySelector('.hr-area .mp-textin');
    if (x) { if (inp) x.text = inp.value.replace(/\n+/g, ' ').slice(0, 200); const before = snapshot(); if (textSizeButton(x, +tsz.dataset.tsz)) { H.hist.push(before); renderArea(); queueSave(); } }
    return;
  }
  const nb = e.target.closest('[data-nact]');
  if (nb) {
    const id = nb.dataset.id, k = nb.dataset.nact;
    if (k === 'edit') { H.editing = id; renderArea(); }
    else if (k === 'done') commitNote();
    else if (k === 'delete') { remember(); H.ann.notes = H.ann.notes.filter(n => n.id !== id); H.editing = null; renderArea(); queueSave(); }
    return;
  }
  const a = e.target.closest('[data-hr]'); if (!a) { if (H.menuOpen && !e.target.closest('.hr-morewrap')) { H.menuOpen = false; renderMenu(); } return; }
  const k = a.dataset.hr;
  if (k !== 'menu' && H.menuOpen) { H.menuOpen = false; renderMenu(); }
  if (k === 'zin') zoomMid(1.25);
  else if (k === 'zout') zoomMid(1 / 1.25);
  else if (k === 'fit') fit();
  else if (k === 'undo') undo();
  else if (k === 'clearpen') { if (H.ann.strokes.length) { remember(); H.ann.strokes = []; renderArea(); queueSave(); } }
  else if (k === 'seats') openSeats(true);
  else if (k === 'seatsdone') openSeats(false);
  else if (k === 'menu') { H.menuOpen = !H.menuOpen; renderMenu(); }
  else if (k === 'groups') groupsSheet();
}
function keys(e) {
  if (e.key === 'Escape') {
    if (H.menuOpen) { H.menuOpen = false; renderMenu(); document.querySelector('[data-hr="menu"]')?.focus(); return; }
    if (H.textEdit) { commitText(); return; }
    if (H.editing) { commitNote(); return; }
    if (H.seatsOpen) { openSeats(false); return; }
    if (H.mode !== 'move') { setMode(H.mode); return; }
  }
  if (e.target.matches && e.target.matches('input, textarea, select')) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && H.shapeSel) { remember(); H.shapes = H.shapes.filter(s => s.id !== H.shapeSel); H.shapeSel = null; renderArea(); queueSave(); e.preventDefault(); return; }
  // Arrange seats from the keyboard: a desk with the focus moves 10 pixels per arrow key (50 with Shift).
  const desk = e.target.closest && e.target.closest('.hr-desk');
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (H.seatsOpen && desk && dir) {
    const sid = desk.dataset.sid, p = H.seats[sid], step = e.shiftKey ? 50 : 10;
    const at = clampSeat({ x: p.x + dir[0] * step, y: p.y + dir[1] * step }); if (at) { H.seats[sid] = at; moveDeskEl(sid); seatMoved(sid); }
    e.preventDefault();
  }
}

// ---------------------------------------------------------------- start
function start() {
  document.querySelector('main#main')?.classList.add('rm-main');
  renderChips(); renderTools(); renderZoom(); renderSeatbar(); renderWorld();
  requestAnimationFrame(fit);
  board.addEventListener('pointerdown', down);
  board.addEventListener('pointermove', move);
  board.addEventListener('pointerup', up); board.addEventListener('pointercancel', up);
  board.addEventListener('wheel', e => { e.preventDefault(); const r = board.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  const root = $('homeroom');
  root.addEventListener('click', click);
  root.addEventListener('keydown', keys);
  // The minimap sits outside the board: a press on it moves the view there.
  $('hr-mini').addEventListener('pointerdown', e => { if (!e.target.closest('.rm-mini')) return; const p = miniPoint(e, world()), s = size(); H.view.x = s.w / 2 - p.x * H.view.z; H.view.y = s.h / 2 - p.y * H.view.z; applyView(); });
  $('hr-class').addEventListener('change', e => { if (e.target.value && e.target.value !== D.classId) location.href = `/class/${encodeURIComponent(e.target.value)}/homeroom`; });
  let rz = null; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { renderMini(); }, 150); });
  window.addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); saveArea(); } });
}
if (board && worldEl) start();
