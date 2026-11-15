// Classroom dashboards (server/routes/dash.js; docs/decisions.md "Classroom dashboards, stage 1"). One module for the
// teacher's screen (the projector) and a student's screen: the 12-column widget grid with edit mode (library, move,
// resize, remove, undo, settings) by mouse, touch or keyboard; backgrounds; the teacher's layouts, Push to students and
// Eyes up; a student's banner, "From your teacher" tray and Eyes up card. Screens check /api/dash/<class>/live every few
// seconds while they are in view (the way class pages learn about a live game, public/js/class-live.js).
import { api, toast, sheet, pageData, esc, $, $$, t } from '/js/app.js';
import { INTL } from '/js/i18n.js';
import { RENDER } from '/js/dash-widgets.js';

const D = pageData();
const root = document.getElementById('dash');
if (root && D.classId) start();

function start() {
  const TEACHER = D.role === 'teacher';
  const CID = D.classId;
  const COLS = 12, MIN_ROWS = 4, MAX_ROWS = 24, MAX_H = 8, POLL_MS = 4000;
  const types = new Map(D.registry.types.map(x => [x.id, x]));
  const grid = $('#dash-grid'), say = $('#dash-say');
  const narrow = matchMedia('(max-width: 719px)');
  const announce = msg => { say.textContent = ''; setTimeout(() => { say.textContent = msg; }, 30); };

  // ---------------------------------------------------------------- grid geometry
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  /** Anything the moved widget now covers moves down below it (and so on): nothing ever overlaps. */
  function settle(list, moved) {
    const queue = [moved]; let guard = 0;
    while (queue.length && guard++ < 500) {
      const a = queue.shift();
      for (const b of list) if (b !== a && b !== moved && overlap(a, b)) { b.y = Math.min(MAX_ROWS - 1, a.y + a.h); queue.push(b); }
    }
  }
  /** The first free place for a w x h widget, reading order. */
  function freeSpot(w, h) {
    for (let y = 0; y < MAX_ROWS; y++) for (let x = 0; x + w <= COLS; x++) { const box = { x, y, w, h }; if (!S.widgets.some(o => overlap(o, box))) return box; }
    return { x: 0, y: rowsUsed(), w, h };
  }
  const rowsUsed = () => S.widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
  const canRemove = w => !w.pinned;
  const nameOf = w => (types.get(w.type) || {}).name || w.type;

  // ---------------------------------------------------------------- state
  // widgets: what this screen shows. Teacher: the current layout's widgets. Student: the teacher's pinned widgets
  // (pinned: true, at the place this student moved them to) then their own.
  const S = { editing: false, selected: null, undo: [], bg: null, live: D.live || { pushes: [] }, layoutId: D.current || null, layouts: D.layouts || [], active: D.active || null, pinsAt: (D.live || {}).pinsAt || 0, pins: D.pins || [] };
  if (TEACHER) { const l = S.layouts.find(x => x.id === S.layoutId) || S.layouts[0]; S.widgets = clone(l.widgets); S.bg = l.bg; }
  else { S.mine = D.me; S.widgets = mergeStudent(); S.bg = D.me.bg; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function mergeStudent() {
    const own = clone(S.mine.widgets || []).filter(w => types.get(w.type));
    const pins = clone(S.pins).filter(w => types.get(w.type)).map(w => ({ ...w, ...(S.mine.pins || {})[w.id], pinned: true }));
    const list = [...pins];
    for (const w of own) { list.push(w); settle(list, w); }
    return list;
  }

  // ---------------------------------------------------------------- drawing
  const tickers = new Map();
  function applyBg() {
    root.className = root.className.replace(/\bdash-bg-\S+/g, '').trim();
    root.style.removeProperty('--dash-pic');
    const bg = S.bg || { kind: 'color', id: 'cream' };
    if (bg.kind === 'pic') { root.classList.add('dash-bg-pic'); root.style.setProperty('--dash-pic', `url("/dash/pictures/${encodeURIComponent(bg.id)}")`); }
    else root.classList.add(`dash-bg-${bg.kind}-${bg.id}`);
    $$('[data-bg-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bgKind === bg.kind && b.dataset.bgId === bg.id)));
  }
  function render() {
    tickers.clear();
    grid.textContent = '';
    const rows = Math.max(MIN_ROWS, rowsUsed() + (S.editing ? 1 : 0));
    grid.style.setProperty('--rows', rows);
    const order = [...S.widgets].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const w of order) grid.appendChild(card(w, order.indexOf(w)));
    if (S.editing && !narrow.matches) {
      const spot = freeSpot(3, 1);
      const drop = document.createElement('div'); drop.className = 'dash-drop'; drop.setAttribute('aria-hidden', 'true');
      drop.style.gridColumn = `${spot.x + 1} / span 3`; drop.style.gridRow = `${spot.y + 1} / span 1`;
      drop.textContent = t('js.dash.dropHint');
      grid.appendChild(drop);
    }
    $('#dash-undo') && ($('#dash-undo').disabled = !S.undo.length);
    if (S.editing) renderSide();
  }
  function card(w, i) {
    const type = types.get(w.type);
    const c = document.createElement('section');
    c.className = 'dash-w' + (w.pinned ? ' is-pinned' : '') + (S.selected === w.id ? ' is-selected' : '');
    c.dataset.id = w.id;
    c.setAttribute('role', 'listitem');
    c.style.gridColumn = `${w.x + 1} / span ${w.w}`; c.style.gridRow = `${w.y + 1} / span ${w.h}`;
    c.style.order = i; c.style.setProperty('--h', w.h);
    const head = document.createElement('div'); head.className = 'dash-wh';
    const title = document.createElement('h2'); title.className = 'dash-wt'; title.id = `dw-${w.id}`; title.textContent = nameOf(w);
    head.appendChild(title);
    if (w.pinned) head.appendChild(Object.assign(document.createElement('span'), { className: 'chip-s dash-pin', textContent: `📌 ${t('js.dash.pinnedBy')}` }));
    else if (TEACHER && w.pin) head.appendChild(Object.assign(document.createElement('span'), { className: 'chip-s dash-pin', textContent: `📌 ${t('js.dash.onStudents')}` }));
    c.appendChild(head);
    c.setAttribute('aria-labelledby', title.id);
    const body = document.createElement('div'); body.className = 'dash-wb';
    c.appendChild(body);
    const r = RENDER[w.type] ? RENDER[w.type](body, w.s || {}, { type, intl: INTL, role: D.role }) : null;
    if (r && r.tick) tickers.set(w.id, r.tick);
    if (S.editing) editChrome(c, w);
    return c;
  }

  // ---------------------------------------------------------------- edit mode: chrome on each widget
  function editChrome(c, w) {
    c.tabIndex = 0;
    c.setAttribute('aria-describedby', 'dash-keyhelp');
    c.setAttribute('aria-roledescription', t('js.dash.widgetRole'));
    if (S.selected === w.id) {
      const bar = document.createElement('div'); bar.className = 'dash-tools'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', t('js.dash.toolsFor', { name: nameOf(w) }));
      const b = (key, icon, fn, ok = true) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn btn-sm dash-tool'; x.innerHTML = `<span aria-hidden="true">${icon}</span>`; x.setAttribute('aria-label', t(`js.dash.tool.${key}`)); x.title = t(`js.dash.tool.${key}`); x.disabled = !ok; x.addEventListener('click', e => { e.stopPropagation(); fn(); }); bar.appendChild(x); };
      b('up', '↑', () => nudge(w, 0, -1), w.y > 0);
      b('down', '↓', () => nudge(w, 0, 1));
      if (!narrow.matches) { b('left', '←', () => nudge(w, -1, 0), w.x > 0); b('right', '→', () => nudge(w, 1, 0), w.x + w.w < COLS); }
      b('narrower', '⇤', () => grow(w, -1, 0), w.w > types.get(w.type).min[0]);
      b('wider', '⇥', () => grow(w, 1, 0), w.x + w.w < COLS);
      b('shorter', '⤒', () => grow(w, 0, -1), w.h > types.get(w.type).min[1]);
      b('taller', '⤓', () => grow(w, 0, 1), w.h < MAX_H);
      if (canRemove(w)) b('remove', '✖', () => remove(w));
      c.appendChild(bar);
    }
    if (!narrow.matches) {
      const h = document.createElement('span'); h.className = 'dash-resize'; h.setAttribute('aria-hidden', 'true'); h.dataset.resize = '1';
      c.appendChild(h);
    }
  }

  // ---------------------------------------------------------------- changes (every change can be undone)
  function snapshot() { S.undo.push(JSON.stringify({ widgets: S.widgets, bg: S.bg })); if (S.undo.length > 40) S.undo.shift(); }
  function changed(msg) { render(); save(); if (msg) announce(msg); refocus(); }
  function refocus() { if (!S.selected || !S.editing) return; const c = grid.querySelector(`[data-id="${CSS.escape(S.selected)}"]`); if (c && document.activeElement !== c && !c.contains(document.activeElement) && !$('#dash-side').contains(document.activeElement)) c.focus({ preventScroll: true }); }
  function place(w, box) {
    const type = types.get(w.type);
    w.w = Math.max(type.min[0], Math.min(COLS, box.w)); w.h = Math.max(type.min[1], Math.min(MAX_H, box.h));
    w.x = Math.max(0, Math.min(COLS - w.w, box.x)); w.y = Math.max(0, Math.min(MAX_ROWS - 1, box.y));
    settle(S.widgets, w);
  }
  function nudge(w, dx, dy) {
    snapshot();
    if (narrow.matches && dy) {
      // One column on a phone: up and down change the order (take the place of the widget before or after).
      const order = [...S.widgets].sort((a, b) => a.y - b.y || a.x - b.x), i = order.indexOf(w), o = order[i + dy];
      if (o) { if (dy < 0) place(w, { ...w, x: o.x, y: o.y }); else { const oy = w.y; place(o, { ...o, x: w.x, y: oy }); } }
    } else place(w, { ...w, x: w.x + dx, y: w.y + dy });
    S.selected = w.id;
    changed(t('js.dash.say.moved', { name: nameOf(w), x: w.x + 1, y: w.y + 1 }));
  }
  function grow(w, dw, dh) {
    snapshot(); place(w, { ...w, w: w.w + dw, h: w.h + dh }); S.selected = w.id;
    changed(t('js.dash.say.resized', { name: nameOf(w), w: w.w, h: w.h }));
  }
  function remove(w) {
    if (!canRemove(w)) { announce(t('js.dash.say.pinned', { name: nameOf(w) })); return; }
    snapshot(); S.widgets = S.widgets.filter(x => x !== w); S.selected = null;
    changed(t('js.dash.say.removed', { name: nameOf(w) }));
    grid.querySelector('.dash-w')?.focus({ preventScroll: true });
  }
  function add(type) {
    snapshot();
    const box = freeSpot(type.size[0], type.size[1]);
    const s = {}; for (const f of type.settings) s[f.key] = f.def;
    const w = { id: `${type.id}${Math.random().toString(36).slice(2, 8)}`, type: type.id, ...box, s };
    S.widgets.push(w); S.selected = w.id;
    changed(t('js.dash.say.added', { name: type.name }));
    grid.querySelector(`[data-id="${CSS.escape(w.id)}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  function undo() {
    const last = S.undo.pop(); if (!last) return;
    const x = JSON.parse(last); S.widgets = x.widgets; S.bg = x.bg; applyBg();
    if (!S.widgets.some(w => w.id === S.selected)) S.selected = null;
    changed(t('js.dash.say.undone'));
  }

  // ---------------------------------------------------------------- saving
  let saveTimer = null;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700); }
  async function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    const strip = w => ({ id: w.id, type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, s: w.s, ...(w.pin ? { pin: true } : {}) });
    try {
      if (TEACHER) {
        const r = await api(`/api/dash/${CID}/layouts/${S.layoutId}`, { method: 'POST', body: { widgets: S.widgets.map(strip), bg: S.bg } });
        const l = S.layouts.find(x => x.id === S.layoutId); if (l) { l.widgets = r.layout.widgets; l.bg = r.layout.bg; }
      } else {
        const pins = {}; for (const w of S.widgets.filter(x => x.pinned)) pins[w.id] = { x: w.x, y: w.y, w: w.w, h: w.h };
        const r = await api(`/api/dash/${CID}/me`, { method: 'POST', body: { widgets: S.widgets.filter(x => !x.pinned).map(strip), pins, bg: S.bg } });
        S.mine = r.state;
      }
    } catch (err) { toast(err.message, { bad: true }); }
  }
  addEventListener('pagehide', () => { if (saveTimer) flush(); });

  // ---------------------------------------------------------------- pointer: drag to move, drag the corner to resize
  let drag = null;
  grid.addEventListener('pointerdown', e => {
    if (!S.editing || narrow.matches || e.button > 0) return;
    const c = e.target.closest('.dash-w'); if (!c || e.target.closest('.dash-tools,button,a,input,textarea,select')) return;
    const w = S.widgets.find(x => x.id === c.dataset.id); if (!w) return;
    const r = grid.getBoundingClientRect(), gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    const rows = +grid.style.getPropertyValue('--rows') || MIN_ROWS;
    drag = { w, c, resize: !!e.target.dataset.resize, sx: e.clientX, sy: e.clientY, colW: (r.width + gap) / COLS, rowH: (r.height + (parseFloat(getComputedStyle(grid).rowGap) || 0)) / rows, start: { ...w }, moved: false, id: e.pointerId };
    c.setPointerCapture(e.pointerId);
    S.selected = w.id;
    e.preventDefault();
  });
  grid.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    drag.c.classList.add('is-dragging');
    if (drag.resize) {
      const w = Math.max(1, Math.round(drag.start.w + dx / drag.colW)), h = Math.max(1, Math.round(drag.start.h + dy / drag.rowH));
      drag.c.style.gridColumn = `${drag.start.x + 1} / span ${Math.min(COLS - drag.start.x, w)}`; drag.c.style.gridRow = `${drag.start.y + 1} / span ${Math.min(MAX_H, h)}`;
      drag.box = { ...drag.start, w, h };
    } else {
      drag.c.style.transform = `translate(${dx}px, ${dy}px)`;
      drag.box = { ...drag.start, x: Math.round(drag.start.x + dx / drag.colW), y: Math.max(0, Math.round(drag.start.y + dy / drag.rowH)) };
    }
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.moved || !d.box) { render(); d.w && grid.querySelector(`[data-id="${CSS.escape(d.w.id)}"]`)?.focus({ preventScroll: true }); return; }
    snapshot(); place(d.w, d.box);
    changed(d.resize ? t('js.dash.say.resized', { name: nameOf(d.w), w: d.w.w, h: d.w.h }) : t('js.dash.say.moved', { name: nameOf(d.w), x: d.w.x + 1, y: d.w.y + 1 }));
  };
  grid.addEventListener('pointerup', endDrag);
  grid.addEventListener('pointercancel', endDrag);

  // ---------------------------------------------------------------- keyboard
  grid.addEventListener('keydown', e => {
    if (!S.editing) return;
    const c = e.target.closest('.dash-w'); if (!c || e.target !== c) return;
    const w = S.widgets.find(x => x.id === c.dataset.id); if (!w) return;
    const k = e.key, dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    const rtl = document.documentElement.dir === 'rtl';
    if (dir) {
      e.preventDefault();
      let [dx, dy] = dir; if (rtl) dx = -dx;
      if (e.shiftKey) grow(w, dx, dy); else nudge(w, dx, dy);
    } else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); remove(w); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); S.selected = w.id; render(); refocus(); $('#dash-side-body input,#dash-side-body textarea,#dash-side-body select')?.focus(); }
    else if (k === 'Escape') { S.selected = null; render(); }
  });
  grid.addEventListener('focusin', e => {
    if (!S.editing) return;
    const c = e.target.closest('.dash-w'); if (!c || S.selected === c.dataset.id) return;
    S.selected = c.dataset.id; render(); refocus();
  });
  grid.addEventListener('click', e => {
    if (!S.editing) return;
    const c = e.target.closest('.dash-w'); if (!c) return;
    if (S.selected !== c.dataset.id) { S.selected = c.dataset.id; render(); refocus(); }
  });
  document.addEventListener('keydown', e => {
    if (S.editing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest('input,textarea')) { e.preventDefault(); undo(); }
  });

  // ---------------------------------------------------------------- edit mode on and off
  const keyhelp = document.createElement('p'); keyhelp.id = 'dash-keyhelp'; keyhelp.className = 'sr-only'; keyhelp.textContent = t('js.dash.keyHelp'); root.appendChild(keyhelp);
  function setEditing(on) {
    S.editing = on; S.selected = null; S.undo = on ? [] : S.undo;
    root.classList.toggle('is-editing', on);
    for (const id of ['dash-lib', 'dash-side', 'dash-editfoot', 'dash-edithead']) { const x = document.getElementById(id); if (x) x.hidden = !on; }
    for (const id of ['dash-top', 'dash-foot', 'dash-banner']) { const x = document.getElementById(id); if (x) x.hidden = on; }
    if (on) { renderLibrary(); if (TEACHER) $('#dash-editing').textContent = t('js.dash.editing', { name: currentName() }); }
    else if (saveTimer) flush();
    render();
    (on ? $('#dash-lib-q') : $('#dash-edit'))?.focus();
  }
  $('#dash-edit')?.addEventListener('click', () => setEditing(true));
  $('#dash-done')?.addEventListener('click', () => setEditing(false));
  $('#dash-undo')?.addEventListener('click', undo);

  // ---------------------------------------------------------------- the library
  let group = '';
  function renderLibrary() {
    const chips = $('#dash-lib-groups'); chips.textContent = '';
    for (const g of [{ id: '', name: t('js.dash.all') }, ...D.registry.groups]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = g.name; b.setAttribute('aria-pressed', String(g.id === group));
      b.addEventListener('click', () => { group = g.id; renderLibrary(); });
      chips.appendChild(b);
    }
    const q = ($('#dash-lib-q').value || '').trim().toLowerCase();
    const list = $('#dash-lib-list'); list.textContent = '';
    const found = D.registry.types.filter(x => x.add && (!group || x.group === group) && (!q || `${x.name} ${x.desc}`.toLowerCase().includes(q)));
    for (const x of found) {
      const li = document.createElement('li'); li.className = 'dash-libitem';
      li.innerHTML = `<span class="dash-libmark" aria-hidden="true">${esc(x.icon || '▫️')}</span><span class="dash-libtext"><b>${esc(x.name)}</b><span class="small muted">${esc(x.desc)}</span></span><button class="btn btn-sm" type="button" aria-label="${esc(t('js.dash.addName', { name: x.name }))}">${esc(t('js.dash.add'))}</button>`;
      li.querySelector('button').addEventListener('click', () => add(x));
      list.appendChild(li);
    }
    if (!found.length) list.innerHTML = `<li class="small muted">${esc(t('js.dash.noneFound'))}</li>`;
  }
  $('#dash-lib-q')?.addEventListener('input', renderLibrary);

  // ---------------------------------------------------------------- the settings panel
  function renderSide() {
    const box = $('#dash-side-body'), h = $('#dash-side-h'); if (!box) return;
    if (box.contains(document.activeElement) && box.dataset.for === S.selected) return;   // typing: keep the form
    box.textContent = ''; box.dataset.for = S.selected || '';
    const w = S.widgets.find(x => x.id === S.selected);
    if (!w) {
      h.textContent = t('js.dash.side.none');
      box.innerHTML = `<p class="small muted">${esc(t('js.dash.side.noneText'))}</p>`;
      if (TEACHER) studentPictures(box);
      return;
    }
    const type = types.get(w.type);
    h.textContent = t('js.dash.side.title', { name: type.name });
    if (w.pinned) { box.innerHTML = `<p class="notice small">${esc(t('js.dash.side.pinnedNote'))}</p>`; return; }
    const form = document.createElement('form'); form.className = 'stack dash-form'; form.addEventListener('submit', e => e.preventDefault());
    let pending = null;
    form.addEventListener('focusin', () => { pending = JSON.stringify({ widgets: S.widgets, bg: S.bg }); });
    const commit = () => { if (pending) { S.undo.push(pending); pending = JSON.stringify({ widgets: S.widgets, bg: S.bg }); } $('#dash-undo').disabled = !S.undo.length; };
    const redraw = () => { const old = grid.querySelector(`[data-id="${CSS.escape(w.id)}"]`); if (old) { const order = +old.style.order; old.replaceWith(card(w, order)); } save(); };
    for (const f of type.settings) {
      const id = `dset-${w.id}-${f.key}`;
      const field = document.createElement('div'); field.className = f.type === 'bool' ? 'dash-tog' : 'field';
      if (f.type === 'bool') {
        field.innerHTML = `<label for="${id}">${esc(f.label)}</label><input type="checkbox" id="${id}"${w.s[f.key] ? ' checked' : ''}>`;
        field.querySelector('input').addEventListener('change', e => { w.s[f.key] = e.target.checked; commit(); redraw(); });
      } else if (f.type === 'select') {
        field.innerHTML = `<label for="${id}">${esc(f.label)}</label><select class="input" id="${id}">${f.options.map(o => `<option value="${esc(o)}"${w.s[f.key] === o ? ' selected' : ''}>${esc(f.labels[o])}</option>`).join('')}</select>`;
        field.querySelector('select').addEventListener('change', e => { w.s[f.key] = e.target.value; commit(); redraw(); });
      } else {
        const tag = f.type === 'textarea' ? `<textarea class="input" id="${id}" rows="${f.max > 300 ? 7 : 3}" maxlength="${f.max}"></textarea>` : `<input class="input" id="${id}" maxlength="${f.max}">`;
        field.innerHTML = `<label for="${id}">${esc(f.label)}</label>${tag}`;
        const inp = field.querySelector('input,textarea'); inp.value = w.s[f.key] || '';
        inp.addEventListener('input', () => { w.s[f.key] = inp.value; redraw(); });
        inp.addEventListener('change', commit);
      }
      form.appendChild(field);
    }
    if (TEACHER) {
      const pin = document.createElement('div'); pin.className = 'dash-tog';
      pin.innerHTML = `<label for="dset-${w.id}-pin">${esc(t('js.dash.side.pin'))}</label><input type="checkbox" id="dset-${w.id}-pin"${w.pin ? ' checked' : ''}>`;
      pin.querySelector('input').addEventListener('change', e => { w.pin = e.target.checked; commit(); redraw(); announce(e.target.checked ? t('js.dash.say.pinOn', { name: type.name }) : t('js.dash.say.pinOff', { name: type.name })); });
      form.appendChild(pin);
      form.insertAdjacentHTML('beforeend', `<p class="small muted">${esc(t('js.dash.side.pinHelp'))}</p>`);
    }
    const acts = document.createElement('div'); acts.className = 'row dash-sideacts';
    const dup = document.createElement('button'); dup.type = 'button'; dup.className = 'btn btn-sm'; dup.textContent = t('js.dash.side.duplicate');
    dup.addEventListener('click', () => { snapshot(); const box2 = freeSpot(w.w, w.h); const copy = { ...clone(w), id: `${w.type}${Math.random().toString(36).slice(2, 8)}`, ...box2 }; delete copy.pinned; S.widgets.push(copy); S.selected = copy.id; changed(t('js.dash.say.added', { name: type.name })); });
    const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'btn btn-sm btn-danger'; rm.textContent = t('js.dash.side.remove');
    rm.addEventListener('click', () => remove(w));
    acts.append(dup, rm);
    form.appendChild(acts);
    box.appendChild(form);
  }
  async function studentPictures(box) {
    const sec = document.createElement('section'); sec.className = 'dash-pics';
    sec.innerHTML = `<h3 class="dash-h3">${esc(t('js.dash.side.pictures'))}</h3><p class="small muted">${esc(t('js.dash.side.picturesNote'))}</p><ul class="plain dash-piclist"></ul>`;
    box.appendChild(sec);
    try {
      const r = await api(`/api/dash/${CID}/pictures`);
      const ul = $('.dash-piclist', sec);
      if (!r.pictures.length) { ul.innerHTML = `<li class="small muted">${esc(t('js.dash.side.picturesNone'))}</li>`; return; }
      for (const p of r.pictures) {
        const li = document.createElement('li'); li.className = 'dash-picrow';
        li.innerHTML = `<img src="${esc(p.url)}" alt="" width="64" height="40" loading="lazy"><span class="grow">${esc(p.name)}</span><button class="btn btn-sm btn-danger" type="button">${esc(t('js.dash.side.takeDown'))}</button>`;
        li.querySelector('button').addEventListener('click', async () => {
          try { await api(`/api/dash/${CID}/pictures/${p.id}/remove`, { method: 'POST', body: {} }); li.remove(); toast(t('js.dash.side.takenDown')); } catch (err) { toast(err.message, { bad: true }); }
        });
        ul.appendChild(li);
      }
    } catch { /* the list is a convenience */ }
  }

  // ---------------------------------------------------------------- backgrounds
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-bg-kind]'); if (!b) return;
    snapshot(); S.bg = { kind: b.dataset.bgKind, id: b.dataset.bgId }; applyBg(); save();
    announce(t('js.dash.bgChanged'));
  });
  const file = $('#dash-bg-file');
  $('[data-bg-upload]')?.addEventListener('click', () => file.click());
  file?.addEventListener('change', async () => {
    const f = file.files && file.files[0]; if (!f) return; file.value = '';
    const btn = $('[data-bg-upload]'); const old = btn.innerHTML; btn.disabled = true; btn.textContent = t('js.dash.uploading');
    try {
      let blob; try { blob = await toJpeg(f); } catch { throw new Error(t('js.dash.uploadBad')); }
      const res = await fetch(`/api/dash/${CID}/pictures`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('js.dash.uploadBad'));
      snapshot(); S.bg = { kind: 'pic', id: data.id }; applyBg(); save();
      toast(t('js.dash.bgChanged'));
    } catch (err) { toast(err.message, { bad: true, ms: 5000 }); }
    finally { btn.disabled = false; btn.innerHTML = old; }
  });
  /** A background picture: at most 1600 x 1000, re-drawn as a JPEG in the browser (which also drops location data). */
  async function toJpeg(f) {
    let img;
    try { img = await createImageBitmap(f, { imageOrientation: 'from-image' }); }
    catch { img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = URL.createObjectURL(f); }); }
    const k = Math.min(1, 1600 / img.width, 1000 / img.height);
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return new Promise((ok, bad) => c.toBlob(b => (b ? ok(b) : bad(new Error('no blob'))), 'image/jpeg', 0.82));
  }

  // ---------------------------------------------------------------- the clock in the top bar, the date, tickers
  const nowEl = $('#dash-now'), dateEl = $('#dash-date');
  const hm = new Intl.DateTimeFormat(INTL, { hour: 'numeric', minute: '2-digit' }), long = new Intl.DateTimeFormat(INTL, { weekday: 'long', month: 'long', day: 'numeric' });
  const tick = () => { const d = new Date(); if (nowEl) nowEl.textContent = hm.format(d); if (dateEl) dateEl.textContent = long.format(d); for (const f of tickers.values()) f(d); };
  setInterval(tick, 1000);

  // ---------------------------------------------------------------- live state (every few seconds while in view)
  async function poll() {
    if (document.hidden) return;
    try {
      const live = await api(`/api/dash/${CID}/live`, { background: true });
      S.live = live; showLive();
      if (!TEACHER && live.pinsAt !== S.pinsAt) {
        const r = await api(`/api/dash/${CID}/pins`, { background: true });
        S.pins = r.pins; S.pinsAt = r.pinsAt;
        if (!S.editing) { S.widgets = mergeStudent(); render(); }
      }
    } catch { /* offline for a moment: next time */ }
  }
  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  // ---------------------------------------------------------------- the teacher: layouts, Eyes up, Push to students
  const currentName = () => (S.layouts.find(l => l.id === S.layoutId) || {}).name || '';
  function renderLayouts() {
    const box = $('#dash-layouts'); if (!box) return; box.textContent = '';
    for (const l of S.layouts) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = l.name; b.setAttribute('aria-pressed', String(l.id === S.layoutId));
      b.addEventListener('click', () => switchLayout(l.id));
      box.appendChild(b);
    }
  }
  async function switchLayout(id) {
    if (saveTimer) await flush();
    try {
      await api(`/api/dash/${CID}/layouts/${id}/use`, { method: 'POST', body: {} });
      const l = S.layouts.find(x => x.id === id);
      S.layoutId = id; S.active = id; S.widgets = clone(l.widgets); S.bg = l.bg; S.undo = [];
      applyBg(); render(); renderLayouts();
      announce(t('js.dash.say.layout', { name: l.name }));
    } catch (err) { toast(err.message, { bad: true }); }
  }
  function nameSheet(title, value, copy, onSave) {
    const sh = sheet({ title, content: `<form class="stack" id="dash-name-form" novalidate><div class="field"><label for="dash-name-in">${esc(t('js.dash.layouts.name'))}</label><input class="input" id="dash-name-in" maxlength="40" required value="${esc(value)}"></div>${copy ? `<label class="dash-tog"><span>${esc(t('js.dash.layouts.copy'))}</span><input type="checkbox" id="dash-name-copy" checked></label>` : ''}<p class="err form-err" role="alert"></p><div class="row"><button class="btn btn-primary" type="submit">${esc(t('js.dash.layouts.save'))}</button></div></form>` });
    $('#dash-name-form', sh.el).addEventListener('submit', async e => {
      e.preventDefault();
      const name = $('#dash-name-in', sh.el).value.trim(); if (!name) { $('.form-err', sh.el).textContent = t('js.dash.layouts.needName'); return; }
      try { await onSave(name, copy ? $('#dash-name-copy', sh.el).checked : false); sh.close(); } catch (err) { $('.form-err', sh.el).textContent = err.message; }
    });
  }
  $('#dash-layout-new')?.addEventListener('click', () => nameSheet(t('js.dash.layouts.newTitle'), '', true, async (name, copy) => {
    if (saveTimer) await flush();
    const r = await api(`/api/dash/${CID}/layouts`, { method: 'POST', body: { name, copyFrom: copy ? S.layoutId : null } });
    S.layouts.push({ id: r.layout.id, name: r.layout.name, widgets: r.layout.widgets, bg: r.layout.bg });
    await switchLayout(r.layout.id);
  }));
  $('#dash-layout-more')?.addEventListener('click', () => {
    const l = S.layouts.find(x => x.id === S.layoutId);
    const sh = sheet({ title: t('js.dash.layouts.manageTitle', { name: l.name }), content: `<div class="stack"><button class="btn" type="button" id="dash-rename">✏️ ${esc(t('js.dash.layouts.rename'))}</button><button class="btn btn-danger" type="button" id="dash-del"${S.layouts.length < 2 ? ' disabled' : ''}>🗑️ ${esc(t('js.dash.layouts.del'))}</button>${S.layouts.length < 2 ? `<p class="small muted">${esc(t('js.dash.layouts.keepOne'))}</p>` : ''}</div>` });
    $('#dash-rename', sh.el).addEventListener('click', () => { sh.close(); nameSheet(t('js.dash.layouts.rename'), l.name, false, async name => {
      const r = await api(`/api/dash/${CID}/layouts/${l.id}`, { method: 'POST', body: { name } }); l.name = r.layout.name; renderLayouts(); }); });
    $('#dash-del', sh.el).addEventListener('click', async () => {
      if (!confirm(t('js.dash.layouts.delConfirm', { name: l.name }))) return;
      try {
        await api(`/api/dash/${CID}/layouts/${l.id}/delete`, { method: 'POST', body: {} });
        S.layouts = S.layouts.filter(x => x.id !== l.id); sh.close();
        await switchLayout(S.layouts[0].id);
      } catch (err) { toast(err.message, { bad: true }); }
    });
  });
  const eyesBtn = $('#dash-eyes-btn');
  eyesBtn?.addEventListener('click', async () => {
    const on = !S.live.eyes;
    try { const r = await api(`/api/dash/${CID}/eyes`, { method: 'POST', body: { on } }); S.live.eyes = r.eyes; showLive(); announce(on ? t('js.dash.say.eyesOn') : t('js.dash.say.eyesOff')); }
    catch (err) { toast(err.message, { bad: true }); }
  });

  const KIND_ICON = { game: '🎮', live: '📡', lesson: '📚', link: '🔗' };
  let pushSheet = null, pushTab = 'game';
  $('#dash-push')?.addEventListener('click', () => openPush());
  async function openPush(q = '') {
    let opts;
    try { opts = await api(`/api/dash/${CID}/push-options${q ? `?q=${encodeURIComponent(q)}` : ''}`); } catch (err) { toast(err.message, { bad: true }); return; }
    const sent = S.live.pushes || [];
    const tabs = ['game', 'live', 'lesson', 'link'];
    const row = (icon, title, sub, btn) => `<li class="dash-prow"><span aria-hidden="true">${icon}</span><span class="grow"><b>${esc(title)}</b>${sub ? `<span class="small muted">${esc(sub)}</span>` : ''}</span>${btn}</li>`;
    const sendBtn = (kind, ref, title) => `<button class="btn btn-sm btn-primary" type="button" data-send="${kind}" data-ref="${esc(ref)}" aria-label="${esc(t('js.dash.push.sendName', { title }))}">${esc(t('js.dash.push.send'))}</button>`;
    const panel = {
      game: `<form class="row" id="dash-gq-form" role="search"><label class="sr-only" for="dash-gq">${esc(t('js.dash.push.search'))}</label><input class="input grow" id="dash-gq" type="search" value="${esc(q)}" placeholder="${esc(t('js.dash.push.search'))}"><button class="btn btn-sm" type="submit">🔎</button></form>
        <ul class="plain dash-plist">${opts.games.map(g => row(esc(g.icon || '🎮'), g.title, '', sendBtn('game', g.id, g.title))).join('') || `<li class="small muted">${esc(t('js.dash.push.gamesNone'))}</li>`}</ul>`,
      live: opts.live ? `<ul class="plain dash-plist">${row('📡', opts.live.title, t('js.dash.push.liveOpen'), sendBtn('live', '', opts.live.title))}</ul>`
        : `<p class="small muted">${esc(t('js.dash.push.liveNone'))}</p><a class="btn btn-sm" href="/live?class=${encodeURIComponent(CID)}">📡 ${esc(t('js.dash.push.liveStart'))}</a>`,
      lesson: `<ul class="plain dash-plist">${opts.lessons.map(l => row('📚', l.title, '', sendBtn('lesson', l.id, l.title))).join('') || `<li class="small muted">${esc(t('js.dash.push.lessonsNone'))}</li>`}</ul>`,
      link: `<p class="small muted">${esc(t('js.dash.push.linksNote'))}</p>
        <ul class="plain dash-plist">${opts.links.map(l => row('🔗', l.title, l.url, `${sendBtn('link', l.id, l.title)}<button class="btn btn-sm" type="button" data-unlink="${esc(l.id)}" aria-label="${esc(t('js.dash.push.linkRemoveName', { title: l.title }))}">✖</button>`)).join('') || `<li class="small muted">${esc(t('js.dash.push.linksNone'))}</li>`}</ul>
        <form class="stack dash-linkform" id="dash-link-form" novalidate><div class="field"><label for="dash-ln">${esc(t('js.dash.push.linkName'))}</label><input class="input" id="dash-ln" maxlength="60"></div>
          <div class="field"><label for="dash-lu">${esc(t('js.dash.push.linkUrl'))}</label><input class="input" id="dash-lu" type="url" inputmode="url" maxlength="500" placeholder="https://" dir="ltr" required></div>
          <p class="err form-err" role="alert"></p><div class="row"><button class="btn" type="submit">✅ ${esc(t('js.dash.push.linkAdd'))}</button></div></form>`,
    };
    const content = `<section class="dash-sent"><h3 class="dash-h3">${esc(t('js.dash.push.sentToday'))}</h3>
      <ul class="plain dash-plist">${sent.map(p => row(KIND_ICON[p.kind] || '📤', p.title, `${t(`js.dash.kind.${p.kind}`)} · ${timeOf(p.at)}`, `<button class="btn btn-sm" type="button" data-end="${esc(p.id)}" aria-label="${esc(t('js.dash.push.endName', { title: p.title }))}">${esc(t('js.dash.push.end'))}</button>`)).join('') || `<li class="small muted">${esc(t('js.dash.push.noneYet'))}</li>`}</ul></section>
      <div class="chips dash-ptabs" role="tablist" aria-label="${esc(t('js.dash.push.what'))}">${tabs.map(k => `<button class="chip" type="button" role="tab" id="dash-ptab-${k}" aria-controls="dash-ppanel" aria-selected="${k === pushTab}" tabindex="${k === pushTab ? 0 : -1}" data-ptab="${k}">${KIND_ICON[k]} ${esc(t(`js.dash.push.tab.${k}`))}</button>`).join('')}</div>
      <div class="dash-ppanel" id="dash-ppanel" role="tabpanel" aria-labelledby="dash-ptab-${pushTab}">${panel[pushTab]}</div>`;
    if (pushSheet) { $('.sheet-body', pushSheet.el).innerHTML = content; } else { pushSheet = sheet({ title: t('js.dash.push.title'), content, onClose: () => { pushSheet = null; } }); wirePush(); }
  }
  const timeOf = at => new Intl.DateTimeFormat(INTL, { hour: 'numeric', minute: '2-digit' }).format(new Date(at));
  function wirePush() {
    const el = pushSheet.el;
    el.addEventListener('click', async e => {
      const tab = e.target.closest('[data-ptab]');
      if (tab) { pushTab = tab.dataset.ptab; await openPush(); $(`#dash-ptab-${pushTab}`, el)?.focus(); return; }
      const s = e.target.closest('[data-send]'), end = e.target.closest('[data-end]'), un = e.target.closest('[data-unlink]');
      try {
        if (s) { s.disabled = true; const r = await api(`/api/dash/${CID}/pushes`, { method: 'POST', body: { kind: s.dataset.send, ref: s.dataset.ref } }); toast(r.toast || t('js.dash.push.sent')); await poll(); await openPush(); }
        else if (end) { await api(`/api/dash/${CID}/pushes/${end.dataset.end}/end`, { method: 'POST', body: {} }); await poll(); await openPush(); }
        else if (un) { await api(`/api/dash/${CID}/links/${un.dataset.unlink}/remove`, { method: 'POST', body: {} }); await poll(); await openPush(); }
      } catch (err) { if (s) s.disabled = false; toast(err.message, { bad: true }); }
    });
    el.addEventListener('keydown', e => {
      const tab = e.target.closest('[data-ptab]'); if (!tab || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const all = $$('[data-ptab]', el), i = all.indexOf(tab), n = all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
      n.click();
    });
    el.addEventListener('submit', async e => {
      e.preventDefault();
      if (e.target.id === 'dash-gq-form') { await openPush($('#dash-gq', el).value.trim()); $('#dash-gq', el)?.focus(); return; }
      if (e.target.id === 'dash-link-form') {
        const err = $('.form-err', e.target);
        try { await api(`/api/dash/${CID}/links`, { method: 'POST', body: { title: $('#dash-ln', el).value, url: $('#dash-lu', el).value } }); toast(t('js.dash.push.linkAdded')); await openPush(); $('#dash-lu', el)?.focus(); }
        catch (x) { err.textContent = x.message; }
      }
    });
  }

  // ---------------------------------------------------------------- what the live state shows
  const ACT = { game: 'play', live: 'join', lesson: 'lesson', link: 'link' };
  const openAttrs = p => (p.kind === 'link' ? ' target="_blank" rel="noopener noreferrer"' : '');
  function showLive() {
    const live = S.live || { pushes: [] };
    if (TEACHER) {
      const n = $('#dash-push-n'); if (n) { n.hidden = !live.pushes.length; n.textContent = live.pushes.length; }
      if (eyesBtn) { eyesBtn.setAttribute('aria-pressed', String(!!live.eyes)); eyesBtn.innerHTML = `👀 ${esc(live.eyes ? t('js.dash.eyesEnd') : t('js.dash.eyes'))}`; eyesBtn.classList.toggle('btn-hot', !!live.eyes); }
      return;
    }
    // A student: the newest push is the banner (or the dashed "Bring it back" line); all of today's are in the tray.
    const slot = $('#dash-banner'), top = live.pushes[0];
    const key = top ? `${top.id}:${top.hidden}:${top.href}` : '';
    if (slot.dataset.key !== key) {
      slot.dataset.key = key; slot.textContent = '';
      if (top && !top.hidden) {
        slot.innerHTML = `<div class="dash-banner"><span class="dash-bicon" aria-hidden="true">📣</span><span class="dash-btext"><span class="dash-bfrom">${esc(t('js.dash.banner.from', { when: timeOf(top.at) }))}</span><b>${esc(top.title)}</b></span>
          <a class="btn btn-hot" href="${esc(top.href)}"${openAttrs(top)}>${esc(t(`js.dash.act.${ACT[top.kind]}`))}</a><button class="btn dash-hide" type="button" data-hide="${esc(top.id)}">${esc(t('js.dash.banner.hide'))}</button></div>`;
      } else if (top) {
        slot.innerHTML = `<div class="dash-hidden"><span class="grow">${t('js.dash.banner.hidden', { title: `<b>${esc(top.title)}</b>` })}</span><button class="btn btn-sm" type="button" data-unhide="${esc(top.id)}">${esc(t('js.dash.banner.back'))}</button></div>`;
      }
    }
    const n = $('#dash-tray-n'); n.textContent = live.pushes.length;
    const trayBtn = $('#dash-tray-btn');
    trayBtn.classList.toggle('btn-hot', !!(top && top.hidden));
    trayBtn.setAttribute('aria-label', t('js.dash.tray.label', { count: live.pushes.length }));
    const list = $('#dash-traylist'); list.textContent = '';
    $('#dash-tray-empty').hidden = !!live.pushes.length;
    for (const p of live.pushes) {
      const li = document.createElement('li'); li.className = 'dash-trayrow';
      const isTop = p === top;
      const btn = isTop && !p.hidden ? `<span class="chip-s">${esc(t('js.dash.tray.showing'))}</span>`
        : isTop ? `<button class="btn btn-sm btn-hot" type="button" data-unhide="${esc(p.id)}">${esc(t('js.dash.tray.show'))}</button>`
          : `<a class="btn btn-sm" href="${esc(p.href)}"${openAttrs(p)}>${esc(t(`js.dash.act.${ACT[p.kind]}`))}</a>`;
      li.innerHTML = `<span aria-hidden="true">${KIND_ICON[p.kind] || '📤'}</span><span class="grow"><b>${esc(p.title)}</b><span class="small muted">${esc(t(`js.dash.kind.${p.kind}`))} · ${esc(timeOf(p.at))}</span></span>${btn}`;
      list.appendChild(li);
    }
    eyes(live.eyes);
  }
  // Eyes up: a card over the whole screen until the teacher ends it (or it ends by itself).
  let eyesTimer = null;
  function eyes(on) {
    const box = $('#dash-eyes'); if (!box) return;
    const was = !box.hidden;
    box.hidden = !on;
    for (const el of [...root.children].filter(x => x !== box && x.id !== 'dash-say')) el.inert = !!on;
    clearTimeout(eyesTimer);
    if (on) { eyesTimer = setTimeout(() => { S.live.eyes = null; eyes(null); }, Math.max(0, on.until - Date.now())); if (!was) { announce(t('js.dash.say.eyesUp')); box.focus?.(); } }
  }
  if (!TEACHER) {
    $('#dash-eyes').tabIndex = -1;
    const tray = $('#dash-tray'), trayBtn = $('#dash-tray-btn');
    const setTray = open => { tray.hidden = !open; trayBtn.setAttribute('aria-expanded', String(open)); if (open) $('#dash-tray-close').focus(); };
    trayBtn.addEventListener('click', () => setTray(tray.hidden));
    $('#dash-tray-close').addEventListener('click', () => { setTray(false); trayBtn.focus(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !tray.hidden) { setTray(false); trayBtn.focus(); } });
    document.addEventListener('click', async e => {
      const h = e.target.closest('[data-hide],[data-unhide]'); if (!h) return;
      const id = h.dataset.hide || h.dataset.unhide, hidden = !!h.dataset.hide;
      const p = S.live.pushes.find(x => x.id === id); if (p) p.hidden = hidden;
      showLive();
      if (!hidden) setTray(false);
      ($('#dash-banner [data-unhide]') || $('#dash-banner .btn-hot') || trayBtn).focus();
      announce(hidden ? t('js.dash.say.hidden') : t('js.dash.say.back'));
      try { await api(`/api/dash/${CID}/pushes/${id}/hide`, { method: 'POST', body: { hidden } }); } catch (err) { toast(err.message, { bad: true }); }
    });
  }

  // ---------------------------------------------------------------- projector mode (the teacher)
  let lock = null, idle = null;
  const wake = async () => { try { if (navigator.wakeLock && document.body.classList.contains('dash-projector') && !document.hidden) lock = await navigator.wakeLock.request('screen'); } catch { lock = null; } };
  const awake = () => { document.body.classList.remove('dash-idle'); clearTimeout(idle); if (document.body.classList.contains('dash-projector')) idle = setTimeout(() => document.body.classList.add('dash-idle'), 3000); };
  function projector(on) {
    document.body.classList.toggle('dash-projector', on);
    $('#dash-projector')?.setAttribute('aria-pressed', String(on));
    if (on) { document.documentElement.requestFullscreen?.().catch(() => {}); wake(); awake(); }
    else { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); try { lock && lock.release(); } catch { /* gone */ } lock = null; clearTimeout(idle); document.body.classList.remove('dash-idle'); }
  }
  $('#dash-projector')?.addEventListener('click', () => projector(!document.body.classList.contains('dash-projector')));
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('dash-projector')) projector(false); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  for (const ev of ['mousemove', 'pointerdown', 'keydown']) document.addEventListener(ev, awake, { passive: true });

  narrow.addEventListener('change', render);
  applyBg(); render(); renderLayouts(); showLive(); tick();
}
