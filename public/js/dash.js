// Classroom dashboards (server/routes/dash.js; docs/decisions.md "Classroom dashboards, stage 1"). One module for the
// teacher's screen (the projector) and a student's screen: the 12-column widget grid with edit mode (library, move,
// resize, remove, undo, settings) by mouse, touch or keyboard; backgrounds; the teacher's layouts, Push to students and
// Eyes up; a student's banner, "From your teacher" tray and Eyes up card. Screens check /api/dash/<class>/live every few
// seconds while they are in view (the way class pages learn about a live game, public/js/class-live.js).
// Stage 2 (docs/decisions.md "Classroom dashboards, stage 2"): the everyday widgets' state (timers, the help queue,
// quick checks, weather) rides on the same check; widgets get it through their live() hook. A student answers a quick
// check in the card under the banner.
// Stage 3 (docs/decisions.md "Classroom dashboards, stage 3"): teaching tools keep their state through ctx.keep (the
// teacher's layout, or a student's own screen) and go to students with ctx.send (a push of kind 'tool'); a student opens
// their own copy in a sheet (kept in this browser only) and may pin it to their own screen. The Picture widget uploads
// through ctx.upload (the stage 1 picture checks).
// Stage 4 (docs/decisions.md "Classroom dashboards, stage 4"): teaching tools part 2 (public/js/dash-tools4.js) use the
// same ctx, plus ctx.ask (the teacher turns a tool into a quick check) and ctx.practice (official games to practise with).
import { api, toast, sheet, pageData, esc, $, $$, t } from '/js/app.js';
import { INTL } from '/js/i18n.js';
import { RENDER, checkChoices, skewOf } from '/js/dash-widgets.js';
import { parseVideo, siteUrl } from '/js/dash-video.js';
import { PASS_ICON, secsText } from '/js/dash-class5.js';

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
  const S = { skew: D.live && D.live.now ? D.live.now - Date.now() : 0, samples: [], editing: false, selected: null, undo: [], bg: null, live: D.live || { pushes: [] }, layoutId: D.current || null, layouts: D.layouts || [], active: D.active || null, pinsAt: (D.live || {}).pinsAt || 0, pins: D.pins || [] };
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
  const tickers = new Map(), hooks = new Map(), destroyers = new Map();
  // A widget body taller than its box scrolls; is-scrolly / at-end draw the "there is more" shadow (public/css/dash.css).
  // Inner lists that scroll on their own (.dw-scroll: the help queue, a check's bars, the teams) get the same marks.
  const mark = x => {
    const on = x.scrollHeight > x.clientHeight + 6;
    x.classList.toggle('is-scrolly', on);
    const end = !on || x.scrollTop + x.clientHeight >= x.scrollHeight - 6;
    x.classList.toggle('at-end', end);
    return end;
  };
  const moreTarget = b => [b, ...b.querySelectorAll('.dw-scroll')].find(x => x.classList.contains('is-scrolly') && !x.classList.contains('at-end')) || null;
  /** Stage 5 review: a list that scrolls shows whole rows only. Its height is cut at the bottom of the last row that fits
   *  (a row of a grid ends with its tallest item; a list of lines, a paragraph, at a whole line), so nothing is ever
   *  sliced through; the soft fade at its bottom edge (public/css/dash.css) says there is more. */
  /** The boxes of the lines of text in an element (text only: not the boxes of the elements around it). */
  const textRects = root => {
    const out = [], walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), rg = document.createRange();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) { if (!n.textContent.trim()) continue; rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0.5) out.push(r); }
    return out;
  };
  const snapRows = x => {
    const keep = x.scrollTop;
    x.style.maxHeight = '';
    const st = getComputedStyle(x);
    if (!/(auto|scroll)/.test(st.overflowY)) return;
    const avail = x.clientHeight;
    if (x.scrollHeight <= avail + 1) return;
    const xr = x.getBoundingClientRect(), bt = parseFloat(st.borderTopWidth) || 0;  // (all boxes are border-box)
    const items = [...x.children].filter(c => c.getClientRects().length && getComputedStyle(c).position !== 'absolute')
      .map(c => { const r = c.getBoundingClientRect(); return { t: r.top - xr.top - bt + x.scrollTop, b: r.bottom - xr.top - bt + x.scrollTop }; });
    let cut = 0;
    if (items.length) {
      for (const it of items) if (it.b <= avail + 0.5) cut = Math.max(cut, it.b);
      // A taller neighbour in the same grid row (it starts above the cut and ends below it) moves the cut above that row.
      for (let k = 0; k < 6; k++) {
        const cross = items.filter(it => it.t < cut - 0.5 && it.b > cut + 0.5); if (!cross.length) break;
        const rowTop = Math.min(...cross.map(c => c.t));
        cut = Math.max(0, ...items.filter(it => it.b <= rowTop + 0.5).map(it => it.b));
      }
    }
    // Not even one row fits (a long idea in an organizer box, a group card in a short widget): cut between two lines of
    // its text instead, never through one.
    if (cut <= 0) {
      const lines = textRects(x).map(r => ({ t: r.top - xr.top - bt + x.scrollTop, b: r.bottom - xr.top - bt + x.scrollTop }));
      cut = Math.max(0, ...lines.filter(l => l.b <= avail + 0.5).map(l => l.b));
      for (let k = 0; k < 6; k++) {
        const cross = lines.filter(l => l.t < cut - 0.5 && l.b > cut + 0.5); if (!cross.length) break;
        const top = Math.min(...cross.map(l => l.t));
        cut = Math.max(0, ...lines.filter(l => l.b <= top + 0.5).map(l => l.b));
      }
      if (cut > 0) cut = Math.min(avail, cut + 2);
    }
    if (cut > 0) { x.style.maxHeight = `${Math.floor(cut + bt + (parseFloat(st.borderBottomWidth) || 0))}px`; x.scrollTop = keep; }
  };
  const scrolly = (b, snap = true) => {
    if (snap) for (const x of b.querySelectorAll('.dw-scroll')) snapRows(x);
    mark(b);
    for (const x of b.querySelectorAll('.dw-scroll')) mark(x);
    if (b.moreBtn) b.moreBtn.hidden = !moreTarget(b);
  };
  /** Every widget's lists again (projector mode changes the type size, so rows change height while the boxes may not). */
  const resnapAll = () => { for (const b of grid.querySelectorAll('.dash-wb')) scrolly(b); };
  const sizeWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(es => { for (const e of es) scrolly(e.target); }) : null;
  const watchBody = b => {
    sizeWatch?.observe(b);
    b.addEventListener('scroll', () => scrolly(b, false), { passive: true, capture: true });
    new MutationObserver(() => scrolly(b)).observe(b, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    requestAnimationFrame(() => scrolly(b));
    document.fonts?.ready.then(() => scrolly(b));
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const projecting = () => document.body.classList.contains('dash-projector');
  /** What a widget's renderer gets besides its settings (public/js/dash-widgets.js says what each is for). */
  const api2 = path => api(`/api/dash/${CID}${path}`);
  async function act(path, body, errEl) {
    try { return await api(`/api/dash/${CID}${path}`, { method: 'POST', body: body || {} }); }
    catch (err) { if (errEl) errEl.textContent = err.message; else toast(err.message, { bad: true }); return null; }
  }
  const ctxFor = (w, type) => ({
    type, intl: INTL, role: D.role, id: w.id, classId: CID, tz: D.tz, teacher: TEACHER, pinned: !!w.pinned, own: !TEACHER && !w.pinned, editing: S.editing,
    reduced: () => reduced.matches, private: projecting, live: () => S.live, now: () => Date.now() + S.skew,
    get: api2, act, poll: () => poll(), sheet, toast, esc, say: msg => announce(msg), flush: async () => { if (saveTimer) await flush(); },
    // Stage 3: teaching tools.
    common: D.registry.common || {}, copy: false,
    keep: state => { if (w.pinned) return; w.s = { ...w.s, state }; save(); },
    send: TEACHER ? async state => {
      if (saveTimer) await flush();
      const r = await act('/pushes', { kind: 'tool', ref: w.id, state });
      if (r) { toast(t('js.dash.tools.sent', { name: (type && type.name) || '' })); poll(); }
    } : null,
    upload: TEACHER ? uploadShow : null,
    checks: TEACHER ? checksForGraph : null,
    // Stage 4: "Make a question from it" sends an ordinary quick check (multiple choice); "Practice it" links to official
    // games every student of the class can open (worked out by the server with the page).
    ask: TEACHER ? async ({ question, options }, errEl) => { const r = await act('/checks', { kind: 'choice', question, options }, errEl); if (r) { toast(r.toast || t('js.dash.push.sent')); poll(); } return r; } : null,
    askWords: D.registry.ask || {},
    practice: (D.practice || {})[w.type] || [],
    // A widget the teacher changes with a tap (work symbols, traffic light, scoreboard, stickers): keep it, redraw it, save.
    // A student's own widget too (the timer's mode); never a pinned one.
    set: (key, value) => {
      if (w.pinned) return;
      w.s = { ...w.s, [key]: value };
      const old = grid.querySelector(`[data-id="${CSS.escape(w.id)}"]`);
      if (old) { const had = old.contains(document.activeElement) ? [...old.querySelectorAll('button')].indexOf(document.activeElement) : -1; const fresh = card(w, +old.style.order); old.replaceWith(fresh); if (had >= 0) fresh.querySelectorAll('button')[had]?.focus(); }
      save();
    },
  });
  function applyBg() {
    root.className = root.className.replace(/\bdash-bg-\S+/g, '').trim();
    root.style.removeProperty('--dash-pic');
    const bg = S.bg || { kind: 'color', id: 'cream' };
    if (bg.kind === 'pic') { root.classList.add('dash-bg-pic'); root.style.setProperty('--dash-pic', `url("/dash/pictures/${encodeURIComponent(bg.id)}")`); }
    else root.classList.add(`dash-bg-${bg.kind}-${bg.id}`);
    $$('[data-bg-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bgKind === bg.kind && b.dataset.bgId === bg.id)));
  }
  function render() {
    tickers.clear(); hooks.clear();
    for (const f of destroyers.values()) { try { f(); } catch { /* gone */ } }
    destroyers.clear();
    grid.textContent = '';
    const rows = Math.max(MIN_ROWS, rowsUsed() + (S.editing ? 1 : 0));
    grid.style.setProperty('--rows', rows);
    fitRows();
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
    if (type && type.group) c.dataset.group = type.group;
    // One header for every widget: an icon chip in the group's colour, the title, and the pin as a quiet chip.
    const head = document.createElement('div'); head.className = 'dash-wh';
    const icon = document.createElement('span'); icon.className = 'dash-wicon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = (type && type.icon) || '▫️';
    const title = document.createElement('h2'); title.className = 'dash-wt'; title.id = `dw-${w.id}`; title.textContent = nameOf(w);
    head.append(icon, title);
    const pinText = w.pinned ? t('js.dash.pinnedBy') : TEACHER && w.pin ? t('js.dash.onStudents') : '';
    if (pinText) { const pin = document.createElement('span'); pin.className = 'dash-pin'; pin.title = pinText; pin.innerHTML = `<span aria-hidden="true">📌</span> <span class="dash-pintext"></span>`; pin.lastChild.textContent = pinText; head.appendChild(pin); }
    c.appendChild(head);
    c.setAttribute('aria-labelledby', title.id);
    const body = document.createElement('div'); body.className = 'dash-wb';
    c.appendChild(body);
    // "More below": shown while the body has more than fits; a tap scrolls it.
    const more = document.createElement('button'); more.type = 'button'; more.className = 'dash-more'; more.hidden = true;
    more.textContent = `↓ ${t('js.dash.more')}`; more.setAttribute('aria-label', t('js.dash.moreName', { name: nameOf(w) }));
    more.addEventListener('click', e => { e.stopPropagation(); const x = moreTarget(body) || body; x.scrollBy({ top: x.clientHeight * 0.8, behavior: reduced.matches ? 'auto' : 'smooth' }); });
    head.appendChild(more); body.moreBtn = more;
    watchBody(body);
    if (destroyers.has(w.id)) { try { destroyers.get(w.id)(); } catch { /* gone */ } destroyers.delete(w.id); }
    const r = RENDER[w.type] ? RENDER[w.type](body, w.s || {}, ctxFor(w, type)) : null;
    if (r && r.tick) tickers.set(w.id, r.tick);
    if (r && r.live) hooks.set(w.id, r.live);
    if (r && r.destroy) destroyers.set(w.id, r.destroy);
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
    const w = { id: `${type.id}${Math.random().toString(36).slice(2, 8)}`, type: type.id, ...box, s, ...(TEACHER && type.pin && type.pinDef ? { pin: true } : {}) };
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
  /** Stage 5: redraw the settings once the field being typed in has let go (a pasted video link can set the start). */
  const renderSideSoon = () => setTimeout(() => { const box = $('#dash-side-body'); if (box) { box.dataset.for = ''; document.activeElement?.blur?.(); renderSide(); $(`#${CSS.escape(`dset-${S.selected}-video`)}`)?.focus(); } }, 0);
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
      if (f.hidden) continue;   // changed by the widget itself (scores, stickers)
      const id = `dset-${w.id}-${f.key}`;
      const field = document.createElement('div'); field.className = f.type === 'bool' ? 'dash-tog' : 'field';
      if (f.type === 'bool') {
        field.innerHTML = `<label for="${id}">${esc(f.label)}</label><input type="checkbox" id="${id}"${w.s[f.key] ? ' checked' : ''}>`;
        field.querySelector('input').addEventListener('change', e => { w.s[f.key] = e.target.checked; commit(); redraw(); });
      } else if (f.type === 'select') {
        field.innerHTML = `<label for="${id}">${esc(f.label)}</label><select class="input" id="${id}">${f.options.map(o => `<option value="${esc(o)}"${w.s[f.key] === o ? ' selected' : ''}>${esc(f.labels[o])}</option>`).join('')}</select>`;
        field.querySelector('select').addEventListener('change', e => { w.s[f.key] = e.target.value; commit(); redraw(); });
      } else if (EDITORS[f.type]) {
        EDITORS[f.type](field, f, w, id, type, { commit, redraw });
      } else {
        const tag = f.type === 'textarea' ? `<textarea class="input" id="${id}" rows="${f.max > 300 ? 7 : 3}" maxlength="${f.max}"></textarea>` : `<input class="input" id="${id}" maxlength="${f.max}">`;
        field.innerHTML = `<label for="${id}">${esc(f.label)}</label>${tag}`;
        const inp = field.querySelector('input,textarea'); inp.value = w.s[f.key] || '';
        inp.addEventListener('input', () => { w.s[f.key] = inp.value; redraw(); });
        inp.addEventListener('change', commit);
      }
      form.appendChild(field);
    }
    if (TEACHER && type.pin) {
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
  // ---------------------------------------------------------------- stage 2 settings editors
  // number, zone, periods (schedule), place (weather: the teacher types a city, the server looks it up), target (what a
  // QR code opens: approved links, the live game, open lessons, games) and tiles (Oomba games and lessons).
  const ZONE_LIST = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo',
    'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Moscow', 'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Asia/Jerusalem', 'Asia/Dubai',
    'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Taipei', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Australia/Sydney', 'Pacific/Auckland'];
  const cityOf = z => z.split('/').pop().replace(/_/g, ' ');
  let optsCache = null;
  const pushOpts = async (q = '') => { if (!q && optsCache) return optsCache; const r = await api(`/api/dash/${CID}/push-options${q ? `?q=${encodeURIComponent(q)}` : ''}`); if (!q) optsCache = r; return r; };
  /** Stage 5: "1:30", "90" or "1:02:03" -> seconds, or null (the same rule as services/dash.js cleanSecs). */
  const secsOf = v => { const x = String(v || '').trim(); if (!x) return 0; if (/^\d{1,5}$/.test(x)) return Math.min(86400, +x); const m = /^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/.exec(x); return m ? Math.min(86400, (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3]) : null; };
  const EDITORS = {
    // ---- stage 5: a video link (only the provider and the video's id are kept), a time in the video, a site's address,
    // the hall pass's places.
    video(field, f, w, id, type, { commit, redraw }) {
      const W = type.words;
      field.innerHTML = `<label for="${id}">${esc(W.paste)}</label><input class="input" id="${id}" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="300" placeholder="${esc(W.pasteHint)}" aria-describedby="${id}-m"><p class="small dash-fieldmsg" id="${id}-m" role="status"></p><p class="small muted">${esc(W.note)}</p>`;
      const inp = field.querySelector('input'), msg = field.querySelector('.dash-fieldmsg');
      const show = () => { msg.textContent = w.s[f.key] ? `✔ ${W.ok}` : ''; msg.classList.remove('err'); };
      show();
      inp.addEventListener('change', () => {
        const x = inp.value.trim(); if (!x) { show(); return; }
        const v = parseVideo(x);
        if (!v) { msg.textContent = `✖ ${W.bad}`; msg.classList.add('err'); return; }
        w.s[f.key] = { p: v.p, id: v.id, ...(v.h ? { h: v.h } : {}) };
        if (v.t && !w.s.start) w.s.start = v.t;
        inp.value = ''; commit(); redraw(); renderSideSoon(); announce(W.ok);
      });
    },
    secs(field, f, w, id, type, { commit, redraw }) {
      const W = type.words;
      field.innerHTML = `<label for="${id}">${esc(f.label)}</label><input class="input dash-secs" id="${id}" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="0:00" aria-describedby="${id}-m"><p class="small dash-fieldmsg" id="${id}-m">${esc(f.key === 'end' ? `${W.secsHint} ${W.endNote}` : W.secsHint)}</p>`;
      const inp = field.querySelector('input'), msg = field.querySelector('.dash-fieldmsg');
      inp.value = w.s[f.key] ? secsText(w.s[f.key]) : '';
      inp.addEventListener('change', () => {
        const n = secsOf(inp.value);
        if (n === null) { msg.textContent = `✖ ${W.secsBad}`; msg.classList.add('err'); msg.setAttribute('role', 'alert'); return; }
        msg.textContent = f.key === 'end' ? `${W.secsHint} ${W.endNote}` : W.secsHint; msg.classList.remove('err'); msg.removeAttribute('role');
        w.s[f.key] = n; inp.value = n ? secsText(n) : ''; commit(); redraw();
      });
    },
    site(field, f, w, id, type, { commit, redraw }) {
      const W = type.words;
      field.innerHTML = `<label for="${id}">${esc(f.label)}</label><input class="input" id="${id}" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="500" placeholder="https://" aria-describedby="${id}-m ${id}-n" dir="ltr"><p class="small dash-fieldmsg" id="${id}-m" role="status"></p><p class="small muted" id="${id}-n">${esc(W.note)}</p>`;
      const inp = field.querySelector('input'), msg = field.querySelector('.dash-fieldmsg');
      inp.value = w.s[f.key] || '';
      inp.addEventListener('change', () => {
        const x = inp.value.trim(), ok = siteUrl(x);
        if (x && !ok) { msg.textContent = `✖ ${W.bad}`; msg.classList.add('err'); return; }
        msg.textContent = ''; msg.classList.remove('err');
        w.s[f.key] = x ? ok : ''; commit(); redraw();
      });
    },
    places(field, f, w, id, type, { commit, redraw }) {
      const W = type.words;
      field.className = 'field dash-places';
      field.innerHTML = `<fieldset><legend class="dash-lab">${esc(f.label)}</legend>${f.def.map(p => `<label class="dash-tog"><span><span aria-hidden="true">${PASS_ICON[p] || ''}</span> ${esc(W[`p_${p}`] || p)}</span><input type="checkbox" value="${esc(p)}"${(w.s[f.key] || []).includes(p) ? ' checked' : ''}></label>`).join('')}</fieldset>`;
      field.addEventListener('change', () => {
        const on = [...field.querySelectorAll('input:checked')].map(x => x.value);
        if (!on.length) { field.querySelector(`input[value="${CSS.escape((w.s[f.key] || f.def)[0])}"]`).checked = true; return; }
        w.s[f.key] = on; commit(); redraw();
      });
    },
    // Stage 3: the Picture widget's picture (the class's teacher uploads; the stage 1 checks).
    pic(field, f, w, id, type, { commit, redraw }) {
      const W = type.words;
      field.className = 'field dash-picedit';
      field.innerHTML = `<span class="dash-lab" id="${id}-l">${esc(f.label)}</span><div class="dash-picprev"></div><button class="btn btn-sm" type="button" id="${id}" aria-describedby="${id}-l">🖼️ ${esc(w.s[f.key] ? W.replace : W.upload)}</button><input type="file" accept="image/*" hidden>`;
      const prev = field.querySelector('.dash-picprev'), b = field.querySelector('button'), file = field.querySelector('input');
      const show = () => { prev.innerHTML = w.s[f.key] ? `<img src="/dash/pictures/${encodeURIComponent(w.s[f.key])}" alt="" width="120" height="80">` : ''; };
      show();
      b.addEventListener('click', () => file.click());
      file.addEventListener('change', async () => {
        const x = file.files && file.files[0]; if (!x) return; file.value = '';
        b.disabled = true; b.textContent = W.uploading;
        try { const r = await uploadShow(x); w.s[f.key] = r.id; commit(); redraw(); show(); announce(W.replace); }
        catch (err) { toast(err.message, { bad: true, ms: 5000 }); }
        finally { b.disabled = false; b.textContent = `🖼️ ${w.s[f.key] ? W.replace : W.upload}`; }
      });
    },
    date(field, f, w, id, type, { commit, redraw }) {
      field.innerHTML = `<label for="${id}">${esc(f.label)}</label><input class="input" id="${id}" type="date" min="2000-01-01" max="2100-12-31">`;
      const inp = field.querySelector('input'); inp.value = w.s[f.key] || '';
      inp.addEventListener('change', () => { w.s[f.key] = inp.value; commit(); redraw(); });
    },
    hhmm(field, f, w, id, type, { commit, redraw }) {
      field.innerHTML = `<label for="${id}">${esc(f.label)}</label><input class="input" id="${id}" type="time">`;
      const inp = field.querySelector('input'); inp.value = w.s[f.key] || f.def;
      inp.addEventListener('change', () => { w.s[f.key] = inp.value || f.def; commit(); redraw(); });
    },
    marks(field, f, w, id, type, { commit, redraw }) {
      const W = type.words;
      field.className = 'field dash-periods';
      const draw = () => {
        const list = w.s[f.key] || (w.s[f.key] = []);
        field.innerHTML = `<span class="dash-lab" id="${id}-l">${esc(f.label)}</span><ol class="plain dash-prows" aria-labelledby="${id}-l">${list.map((m, i) => `<li class="dash-perrow" data-i="${i}">
          <label class="sr-only" for="${id}-t${i}">${esc(W.label)} ${i + 1}</label><input class="input dash-pername" id="${id}-t${i}" data-k="label" maxlength="40" dir="auto" value="${esc(m.label)}" placeholder="${esc(W.label)}">
          <button class="btn btn-sm dash-perrm" type="button" data-rm="${i}" aria-label="${esc(W.remove)} ${i + 1}">✖</button>
          <span class="dash-pertimes"><span class="dash-pertime"><label for="${id}-d${i}">${esc(W.day)}</label><input class="input" id="${id}-d${i}" data-k="date" type="date" value="${esc(m.date)}"></span></span></li>`).join('')}</ol>
          <button class="btn btn-sm" type="button" data-addp>➕ ${esc(W.addMark)}</button>`;
      };
      draw();
      field.addEventListener('input', e => { const li = e.target.closest('[data-i]'); if (!li || !e.target.dataset.k) return; w.s[f.key][+li.dataset.i][e.target.dataset.k] = e.target.value; redraw(); });
      field.addEventListener('change', () => commit());
      field.addEventListener('click', e => {
        const rm = e.target.closest('[data-rm]');
        if (rm) { w.s[f.key].splice(+rm.dataset.rm, 1); commit(); redraw(); draw(); field.querySelector('[data-addp]').focus(); }
        if (e.target.closest('[data-addp]')) {
          const list = w.s[f.key] || []; if (list.length >= 40) return;
          list.push({ date: new Intl.DateTimeFormat('en-CA', { timeZone: D.tz }).format(new Date()), label: '' });
          w.s[f.key] = list; commit(); redraw(); draw(); field.querySelector(`#${CSS.escape(`${id}-t${list.length - 1}`)}`)?.focus();
        }
      });
    },
    number(field, f, w, id, type, { commit, redraw }) {
      field.innerHTML = `<label for="${id}">${esc(f.label)}</label><input class="input" id="${id}" type="number" inputmode="numeric" min="${f.min}" max="${f.max}">`;
      const inp = field.querySelector('input'); inp.value = w.s[f.key] ?? f.def;
      inp.addEventListener('change', () => { const n = Math.round(+inp.value); w.s[f.key] = Number.isFinite(n) && inp.value !== '' ? Math.min(f.max, Math.max(f.min, n)) : f.def; inp.value = w.s[f.key]; commit(); redraw(); });
    },
    zone(field, f, w, id, type, { commit, redraw }) {
      const list = [...new Set([...(w.s[f.key] ? [w.s[f.key]] : []), ...ZONE_LIST])].sort((a, b) => cityOf(a).localeCompare(cityOf(b)));
      field.innerHTML = `<label for="${id}">${esc(f.label)}</label><select class="input" id="${id}"><option value="">${esc(t('js.dash.side.zoneNone'))}</option>${list.map(z => `<option value="${esc(z)}"${w.s[f.key] === z ? ' selected' : ''}>${esc(cityOf(z))}</option>`).join('')}</select>`;
      field.querySelector('select').addEventListener('change', e => { w.s[f.key] = e.target.value; commit(); redraw(); });
    },
    periods(field, f, w, id, type, { commit, redraw }) {
      const W = type.words;
      field.className = 'field dash-periods';
      const draw = () => {
        const list = w.s[f.key] || (w.s[f.key] = []);
        field.innerHTML = `<span class="dash-lab" id="${id}-l">${esc(f.label)}</span><ol class="plain dash-prows" aria-labelledby="${id}-l">${list.map((p, i) => `<li class="dash-perrow" data-i="${i}">
          <label class="sr-only" for="${id}-n${i}">${esc(W.period)} ${i + 1}</label><input class="input dash-pername" id="${id}-n${i}" data-k="name" maxlength="40" dir="auto" value="${esc(p.name)}" placeholder="${esc(W.period)} ${i + 1}">
          <button class="btn btn-sm dash-perrm" type="button" data-rm="${i}" aria-label="${esc(W.remove)} ${i + 1}">✖</button>
          <span class="dash-pertimes"><span class="dash-pertime"><label for="${id}-s${i}">${esc(W.from)}</label><input class="input" id="${id}-s${i}" data-k="start" type="time" value="${esc(p.start)}"></span>
          <span class="dash-pertime"><label for="${id}-e${i}">${esc(W.to)}</label><input class="input" id="${id}-e${i}" data-k="end" type="time" value="${esc(p.end)}"></span></span></li>`).join('')}</ol>
          <button class="btn btn-sm" type="button" data-addp>➕ ${esc(W.addPeriod)}</button>`;
      };
      draw();
      field.addEventListener('input', e => { const li = e.target.closest('[data-i]'); if (!li || !e.target.dataset.k) return; w.s[f.key][+li.dataset.i][e.target.dataset.k] = e.target.value; redraw(); });
      field.addEventListener('change', () => commit());
      field.addEventListener('click', e => {
        const rm = e.target.closest('[data-rm]'), addB = e.target.closest('[data-addp]');
        if (rm) { w.s[f.key].splice(+rm.dataset.rm, 1); commit(); redraw(); draw(); field.querySelector('[data-addp]').focus(); }
        if (addB) {
          const list = w.s[f.key] || []; if (list.length >= 16) return;
          const last = list[list.length - 1], start = last ? last.end : '08:30';
          const [h, m] = start.split(':').map(Number), endMin = Math.min(23 * 60 + 59, h * 60 + m + 45);
          list.push({ name: '', start, end: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}` });
          w.s[f.key] = list; commit(); redraw(); draw(); field.querySelector(`#${CSS.escape(`${id}-n${list.length - 1}`)}`)?.focus();
        }
      });
    },
    place(field, f, w, id, type, { commit, redraw }) {
      const W = type.words;
      field.innerHTML = `<span class="dash-lab">${esc(f.label)}</span><p class="dash-cur" dir="auto"></p>
        <div class="row dash-findrow"><label class="sr-only" for="${id}">${esc(W.search)}</label><input class="input grow" id="${id}" type="search" maxlength="60" autocomplete="off" placeholder="${esc(W.searchHint)}"><button class="btn btn-sm" type="button">🔎 ${esc(W.find)}</button></div>
        <ul class="plain dash-found" aria-live="polite"></ul><p class="small muted">${esc(t('js.dash.side.placeNote'))}</p>`;
      const cur = field.querySelector('.dash-cur'), inp = field.querySelector('input'), found = field.querySelector('.dash-found');
      const showCur = () => { cur.textContent = w.s[f.key] ? `📍 ${w.s[f.key].name}` : W.none; };
      showCur();
      const find = async () => {
        const q = inp.value.trim(); if (q.length < 2) return;
        found.innerHTML = '<li class="small muted">…</li>';
        try {
          const r = await api(`/api/dash/${CID}/places?q=${encodeURIComponent(q)}`);
          found.innerHTML = r.places.map((p, i) => `<li><button class="btn btn-sm dash-placebtn" type="button" data-p="${i}" dir="auto">${esc(p.name)}</button></li>`).join('') || `<li class="small muted">${esc(W.none)}</li>`;
          found.onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; w.s[f.key] = r.places[+b.dataset.p]; commit(); redraw(); showCur(); found.textContent = ''; inp.value = ''; announce(`${W.place}: ${w.s[f.key].name}`); inp.focus(); };
        } catch (err) { found.innerHTML = `<li class="small muted">${esc(err.message)}</li>`; }
      };
      field.querySelector('button').addEventListener('click', find);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); find(); } });
    },
    target(field, f, w, id, type, { commit, redraw }) {
      const W = type.words;
      field.innerHTML = `<label for="${id}">${esc(f.label)}</label><select class="input" id="${id}"><option value="">${esc(W.nothing)}</option></select><p class="small muted">${esc(t('js.dash.side.qrNote'))}</p>`;
      const sel = field.querySelector('select');
      const curKey = w.s[f.key] ? `${w.s[f.key].kind}:${w.s[f.key].ref}` : '';
      pushOpts().then(o => {
        const group = (kind, items) => (items.length ? `<optgroup label="${esc(t(`js.dash.kind.${kind}`))}">${items.map(x => `<option value="${esc(`${kind}:${x.ref}`)}">${esc(x.title)}</option>`).join('')}</optgroup>` : '');
        sel.insertAdjacentHTML('beforeend', group('link', o.links.map(l => ({ ref: l.id, title: l.title }))) + group('live', o.live ? [{ ref: '', title: o.live.title }] : []) + group('lesson', o.lessons.map(l => ({ ref: l.id, title: l.title }))) + group('game', o.games.map(g => ({ ref: g.id, title: g.title }))));
        if (curKey && !sel.querySelector(`option[value="${CSS.escape(curKey)}"]`)) sel.insertAdjacentHTML('beforeend', `<option value="${esc(curKey)}">${esc(W.gone)}</option>`);
        sel.value = curKey;
      }).catch(() => {});
      sel.addEventListener('change', () => { const [kind, ref = ''] = sel.value.split(':'); w.s[f.key] = sel.value ? { kind, ref } : null; commit(); redraw(); });
    },
    tiles(field, f, w, id, type, { commit, redraw }) {
      const W = type.words;
      field.className = 'field dash-tilesed';
      field.innerHTML = `<span class="dash-lab">${esc(f.label)}</span><ul class="plain dash-plist dash-tilecur"></ul>
        <label for="${id}">${esc(W.add)}</label><div class="row"><select class="input grow" id="${id}"></select><button class="btn btn-sm" type="button" data-addt>➕ ${esc(W.add)}</button></div>`;
      const cur = field.querySelector('.dash-tilecur'), sel = field.querySelector('select');
      let names = new Map();
      const showCur = () => {
        const list = w.s[f.key] || [];
        cur.innerHTML = list.map((x, i) => `<li class="dash-prow"><span class="grow" dir="auto">${esc(names.get(`${x.kind}:${x.ref}`) || '…')}</span><button class="btn btn-sm" type="button" data-rmt="${i}" aria-label="${esc(W.remove)}: ${esc(names.get(`${x.kind}:${x.ref}`) || '')}">✖</button></li>`).join('') || `<li class="small muted">${esc(W.empty)}</li>`;
      };
      pushOpts().then(o => {
        for (const g of o.games) names.set(`game:${g.id}`, `${g.icon || '🎮'} ${g.title}`);
        for (const l of o.lessons) names.set(`lesson:${l.id}`, `📚 ${l.title}`);
        sel.innerHTML = `<optgroup label="${esc(W.games)}">${o.games.map(g => `<option value="game:${esc(g.id)}">${esc(g.title)}</option>`).join('')}</optgroup><optgroup label="${esc(W.lessons)}">${o.lessons.map(l => `<option value="lesson:${esc(l.id)}">${esc(l.title)}</option>`).join('')}</optgroup>`;
        const missing = (w.s[f.key] || []).filter(x => !names.has(`${x.kind}:${x.ref}`));
        if (missing.length) api(`/api/dash/${CID}/tiles?refs=${encodeURIComponent(missing.map(x => `${x.kind}:${x.ref}`).join(','))}`).then(r => { for (const x of r.tiles) names.set(`${x.kind}:${x.ref}`, `${x.icon} ${x.title}`); showCur(); }).catch(() => {});
        showCur();
      }).catch(() => {});
      showCur();
      field.addEventListener('click', e => {
        const rm = e.target.closest('[data-rmt]');
        if (rm) { w.s[f.key].splice(+rm.dataset.rmt, 1); commit(); redraw(); showCur(); sel.focus(); }
        if (e.target.closest('[data-addt]') && sel.value) {
          const [kind, ref] = sel.value.split(':'); const list = w.s[f.key] || (w.s[f.key] = []);
          if (list.length < 12 && !list.some(x => x.kind === kind && x.ref === ref)) { list.push({ kind, ref }); commit(); redraw(); showCur(); }
        }
      });
    },
  };

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
  /** Stage 3: a picture for the Picture widget (the class's teacher only), through the same checks as a background. */
  async function uploadShow(f) {
    let blob; try { blob = await toJpeg(f); } catch { throw new Error(t('js.dash.uploadBad')); }
    const res = await fetch(`/api/dash/${CID}/pictures?use=show`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('js.dash.uploadBad'));
    return data;
  }
  /** Stage 3: quick checks the graph maker can show: today's and saved ones, totals only (never who answered). */
  async function checksForGraph() {
    const W = (types.get('check') || { words: {} }).words;
    const saved = await api2('/checks/saved').then(r => r.checks).catch(() => []);
    const seen = new Set(), out = [];
    for (const c of [...(S.live.checks || []), ...saved]) {
      if (seen.has(c.id)) continue; seen.add(c.id);
      const rows = checkChoices(c, W).map((x, i) => ({ l: `${x.icon && !x.typed && c.kind !== 'fist' ? `${x.icon} ` : ''}${x.label}`.trim(), v: (c.tally || [])[i] || 0 }));
      out.push({ title: `${c.q || W[c.kind]}${c.day ? ` (${c.day})` : ''}`, q: c.q || W[c.kind] || '', rows });
    }
    return out;
  }
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
      const sent = Date.now();
      const live = await api(`/api/dash/${CID}/live`, { background: true });
      const got = Date.now();
      // The server's clock: the estimate from the quickest of the last few round trips (timers agree on every screen).
      S.samples.push({ rtt: got - sent, skew: skewOf(live.now, sent, got) }); if (S.samples.length > 8) S.samples.shift();
      S.skew = S.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).skew;
      S.live = live; showLive();
      for (const f of hooks.values()) { try { f(live); } catch { /* one widget */ } }
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
    keepChip();
  }
  /** More chips than fit scroll sideways on a wide screen (ready-made layouts make six or more usual): keep the one on
   *  screen in view, and fade the bar's edge while there are more to scroll to. */
  function keepChip() {
    const box = $('#dash-layouts'); if (!box) return;
    const more = box.scrollWidth > box.clientWidth + 1;
    box.classList.toggle('is-more', more);
    const on = box.querySelector('[aria-pressed="true"]');
    if (on && more) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    chipEnd();
  }
  const chipEnd = () => { const box = $('#dash-layouts'); if (box) box.classList.toggle('at-end', Math.abs(box.scrollLeft) + box.clientWidth >= box.scrollWidth - 2); };
  $('#dash-layouts')?.addEventListener('scroll', chipEnd, { passive: true });
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
  // New layout: one of the ready-made layouts (docs/decisions.md "Ready-made layouts"; its name filled in, editable), or
  // the teacher's own (a copy of the layout on screen, or the starter).
  async function addLayout(r) {
    S.layouts.push({ id: r.layout.id, name: r.layout.name, widgets: r.layout.widgets, bg: r.layout.bg });
    await switchLayout(r.layout.id);
  }
  function newSheet() {
    const tpls = D.templates || [];
    const card = (id, icon, name, desc, on) => `<label class="dash-tpl"><input type="radio" name="dash-tpl" value="${esc(id)}"${on ? ' checked' : ''}><span class="dash-tpl-icon" aria-hidden="true">${esc(icon)}</span><span class="dash-tpl-text"><b>${esc(name)}</b><span class="small muted">${esc(desc)}</span></span></label>`;
    const sh = sheet({ title: t('js.dash.layouts.newTitle'), content: `<form class="stack" id="dash-name-form" novalidate>
      ${tpls.length ? `<fieldset class="dash-tpls"><legend class="dash-h3">${esc(t('js.dash.tpl.heading'))}</legend>${tpls.map(x => card(x.id, x.icon, x.name, x.desc, false)).join('')}
      <p class="dash-h3 dash-tpl-or">${esc(t('js.dash.tpl.own'))}</p>${card('', '✏️', t('js.dash.tpl.ownName'), t('js.dash.tpl.ownDesc'), true)}</fieldset>` : ''}
      <div class="field"><label for="dash-name-in">${esc(t('js.dash.layouts.name'))}</label><input class="input" id="dash-name-in" maxlength="40" required value=""></div>
      <label class="dash-tog" id="dash-name-copyrow"><span>${esc(t('js.dash.layouts.copy'))}</span><input type="checkbox" id="dash-name-copy" checked></label>
      <p class="err form-err" role="alert"></p><div class="row"><button class="btn btn-primary" type="submit">${esc(t('js.dash.layouts.save'))}</button></div></form>` });
    const nameIn = $('#dash-name-in', sh.el), copyRow = $('#dash-name-copyrow', sh.el);
    const picked = () => ($('input[name="dash-tpl"]:checked', sh.el) || {}).value || '';
    // The ready-made name fills the box until the teacher types their own.
    let auto = '';
    sh.el.addEventListener('change', e => {
      if (e.target.name !== 'dash-tpl') return;
      const tpl = tpls.find(x => x.id === picked());
      copyRow.hidden = !!tpl;
      if (nameIn.value.trim() === '' || nameIn.value === auto) { auto = tpl ? tpl.name : ''; nameIn.value = auto; }
    });
    $('#dash-name-form', sh.el).addEventListener('submit', async e => {
      e.preventDefault();
      const name = nameIn.value.trim(), tpl = picked();
      if (!name) { $('.form-err', sh.el).textContent = t('js.dash.layouts.needName'); nameIn.focus(); return; }
      try {
        if (saveTimer) await flush();
        await addLayout(tpl ? await api(`/api/dash/${CID}/templates/${encodeURIComponent(tpl)}`, { method: 'POST', body: { name } })
          : await api(`/api/dash/${CID}/layouts`, { method: 'POST', body: { name, copyFrom: $('#dash-name-copy', sh.el).checked ? S.layoutId : null } }));
        sh.close();
      } catch (err) { $('.form-err', sh.el).textContent = err.message; }
    });
  }
  $('#dash-layout-new')?.addEventListener('click', newSheet);
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

  const KIND_ICON = { game: '🎮', live: '📡', lesson: '📚', link: '🔗', check: '✅', tool: '🧮' };
  const titleOf = p => (p.kind === 'tool' ? ((types.get(p.tool && p.tool.type) || {}).name || t('js.dash.kind.tool')) : p.title || t(`js.dash.kind.${p.kind}`));
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
      <ul class="plain dash-plist">${sent.map(p => row(KIND_ICON[p.kind] || '📤', titleOf(p), `${t(`js.dash.kind.${p.kind}`)} · ${timeOf(p.at)}`, `<button class="btn btn-sm" type="button" data-end="${esc(p.id)}" aria-label="${esc(t('js.dash.push.endName', { title: titleOf(p) }))}">${esc(t('js.dash.push.end'))}</button>`)).join('') || `<li class="small muted">${esc(t('js.dash.push.noneYet'))}</li>`}</ul></section>
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
  const ACT = { game: 'play', live: 'join', lesson: 'lesson', link: 'link', check: 'answer', tool: 'open' };
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
        slot.innerHTML = `<div class="dash-banner"><span class="dash-bicon" aria-hidden="true">📣</span><span class="dash-btext"><span class="dash-bfrom">${esc(t('js.dash.banner.from', { when: timeOf(top.at) }))}</span><b dir="auto">${esc(titleOf(top))}</b></span>
          <a class="btn btn-hot" href="${esc(top.href)}"${openAttrs(top)}>${esc(t(`js.dash.act.${ACT[top.kind]}`))}</a><button class="btn dash-hide" type="button" data-hide="${esc(top.id)}">${esc(t('js.dash.banner.hide'))}</button></div>`;
      } else if (top) {
        slot.innerHTML = `<div class="dash-hidden"><span class="grow">${t('js.dash.banner.hidden', { title: `<b dir="auto">${esc(titleOf(top))}</b>` })}</span><button class="btn btn-sm" type="button" data-unhide="${esc(top.id)}">${esc(t('js.dash.banner.back'))}</button></div>`;
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
      li.innerHTML = `<span aria-hidden="true">${KIND_ICON[p.kind] || '📤'}</span><span class="grow"><b dir="auto">${esc(titleOf(p))}</b><span class="small muted">${esc(t(`js.dash.kind.${p.kind}`))} · ${esc(timeOf(p.at))}</span></span>${btn}`;
      list.appendChild(li);
    }
    showCheck(live);
    eyes(live.eyes);
  }
  // A quick check from the teacher: big tap buttons (no typing). Only this student's own answer is ever shown here.
  function showCheck(live) {
    const box = $('#dash-check'); if (!box) return;
    const ch = (live.checks || [])[0] || null;
    const key = ch ? `${ch.id}:${ch.mine}` : '';
    if (box.dataset.key === key) return;
    const had = box.contains(document.activeElement) ? document.activeElement.dataset.answer : null;
    box.dataset.key = key; box.hidden = !ch; box.textContent = '';
    if (!ch) return;
    const W = (types.get('check') || { words: {} }).words;
    const choices = checkChoices(ch, W);
    box.innerHTML = `<h2 id="dash-check-h"><span aria-hidden="true">✅</span> ${esc(t('js.dash.check.title'))}</h2>${ch.q ? `<p class="dash-checkq" dir="auto">${esc(ch.q)}</p>` : ''}
      <div class="dash-answers dash-answers-${esc(ch.kind)}" role="group" aria-labelledby="dash-check-h">${choices.map((c, i) => `<button class="dash-ans" type="button" data-answer="${i}" aria-pressed="${ch.mine === i}">${c.icon ? `<span class="dash-ansicon${c.rot ? ' dw-rot' : ''}" aria-hidden="true">${esc(c.icon)}</span>` : ''}<span class="dash-anslab"${c.typed ? ' dir="auto"' : ''}>${esc(c.label)}</span></button>`).join('')}</div>
      <p class="small dash-checknote" role="status">${esc(ch.mine == null ? t('js.dash.check.tap') : t('js.dash.check.thanks'))}</p>`;
    if (had != null) box.querySelector(`[data-answer="${had}"]`)?.focus();
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
      const tool = e.target.closest('a[href^="#tool-"]');
      if (tool) { e.preventDefault(); setTray(false); openCopy(tool.getAttribute('href').slice(6)); return; }
      const go = e.target.closest('a[href^="#check-"]');
      if (go) { e.preventDefault(); setTray(false); const box = $('#dash-check'); if (box && !box.hidden) { box.scrollIntoView({ block: 'nearest' }); (box.querySelector('.dash-ans[aria-pressed="false"]') || box).focus(); } return; }
      const a = e.target.closest('[data-answer]');
      if (a) {
        const ch = (S.live.checks || [])[0]; if (!ch) return;
        const value = +a.dataset.answer;
        try { await api(`/api/dash/${CID}/checks/${ch.id}/answer`, { method: 'POST', body: { value } }); ch.mine = value; showCheck(S.live); announce(t('js.dash.check.thanks')); }
        catch (err) { toast(err.message, { bad: true }); poll(); }
        return;
      }
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

  // ---------------------------------------------------------------- a student's own copy of a teaching tool (stage 3)
  // The teacher's tool arrives as a push; the student plays with their own copy in a sheet. It stays in this browser only
  // (closing and opening it again keeps it until the page reloads); "Pin to my screen" makes it one of their own widgets.
  const copies = new Map();
  function openCopy(pid) {
    const p = (S.live.pushes || []).find(x => x.id === pid && x.kind === 'tool');
    const type = p && p.tool && types.get(p.tool.type);
    if (!type || !RENDER[type.id]) return;
    const C = D.registry.common || {};
    const sh = sheet({ title: `${type.icon} ${type.name}`, content: `<p class="small muted">${esc(C.yourCopy)}</p><section class="dash-w dash-wcopy" data-group="${esc(type.group)}"><div class="dash-wb"></div></section><div class="row dash-copyacts"><button class="btn btn-primary" type="button" data-pincopy>📌 ${esc(C.pin)}</button></div>` });
    sh.el.querySelector('.sheet').classList.add('dash-copysheet');
    const body = sh.el.querySelector('.dash-wcopy .dash-wb');
    const w = { id: `copy-${pid}`, type: type.id, s: { state: copies.get(pid) || p.tool.state } };
    const ctx = { ...ctxFor(w, type), own: true, copy: true, send: null, upload: null, checks: null, ask: null, keep: state => copies.set(pid, state), set: () => {} };
    const r = RENDER[type.id](body, w.s, ctx);
    sh.el.querySelector('[data-pincopy]').addEventListener('click', () => {
      const box = freeSpot(type.size[0], type.size[1]);
      const mine = { id: `${type.id}${Math.random().toString(36).slice(2, 8)}`, type: type.id, ...box, s: { state: copies.get(pid) || p.tool.state } };
      S.widgets.push(mine); render(); save();
      if (r && r.destroy) r.destroy();
      sh.close(); toast(C.pinned); announce(C.pinned);
      grid.querySelector(`[data-id="${CSS.escape(mine.id)}"]`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  // ---------------------------------------------------------------- projector mode (the teacher)
  let lock = null, idle = null;
  const wake = async () => { try { if (navigator.wakeLock && document.body.classList.contains('dash-projector') && !document.hidden) lock = await navigator.wakeLock.request('screen'); } catch { lock = null; } };
  const awake = () => { document.body.classList.remove('dash-idle'); clearTimeout(idle); if (document.body.classList.contains('dash-projector')) idle = setTimeout(() => document.body.classList.add('dash-idle'), 3000); };
  function projector(on) {
    document.body.classList.toggle('dash-projector', on);
    requestAnimationFrame(() => { fitRows(); requestAnimationFrame(resnapAll); });
    $('#dash-projector')?.setAttribute('aria-pressed', String(on));
    if (on) { document.documentElement.requestFullscreen?.().catch(() => {}); wake(); awake(); }
    else { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); try { lock && lock.release(); } catch { /* gone */ } lock = null; clearTimeout(idle); document.body.classList.remove('dash-idle'); }
  }
  $('#dash-projector')?.addEventListener('click', () => projector(!document.body.classList.contains('dash-projector')));
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('dash-projector')) projector(false); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  for (const ev of ['mousemove', 'pointerdown', 'keydown']) document.addEventListener(ev, awake, { passive: true });

  narrow.addEventListener('change', render);
  // Projector mode (stage 3 review): the whole screen fits without scrolling when the rows can be at least 56px tall;
  // a layout taller than that scrolls inside the stage, with a shadow at the bottom while there is more below.
  function fitRows() {
    const stage = grid.parentElement;
    let min = 72;
    if (document.body.classList.contains('dash-projector') && !S.editing && !narrow.matches) {
      const rows = +grid.style.getPropertyValue('--rows') || MIN_ROWS, gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
      const fit = Math.floor((stage.clientHeight - parseFloat(getComputedStyle(stage).paddingBottom || 0) - gap * (rows - 1)) / rows);
      if (fit >= 56) min = Math.min(72, fit);
    }
    grid.style.setProperty('--rowmin', `${min}px`);
    stageMark();
    keepChip();
  }
  const stageEl = grid.parentElement;
  const stageMark = () => { const more = stageEl.scrollHeight > stageEl.clientHeight + 12 && stageEl.scrollTop + stageEl.clientHeight < stageEl.scrollHeight - 12; stageEl.classList.toggle('has-more', more); };
  stageEl.addEventListener('scroll', stageMark, { passive: true });
  addEventListener('resize', () => requestAnimationFrame(fitRows));
  document.addEventListener('fullscreenchange', () => requestAnimationFrame(fitRows));
  applyBg(); render(); renderLayouts(); showLive(); tick();
}
