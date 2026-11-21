// Class Board: stickers (docs/decisions.md "Class Board: PDF, link tile and stickers"). The owner's sticker library
// (docs/class-board/sticker-library/, served from /img/stickers/ by scripts/build-stickers.js): 153 illustrated stickers
// (transparent WebP) and 3,504 greeting stickers (SVG), searched through the library's own index (index.json, read once).
// - The panel: a search box (always at the top, "Search stickers"), theme, language and shape filters that combine with
//   it, a count, results a page at a time, an empty state with Clear search, the 12 most recently used and starred
//   Favorites (this browser, per teacher: localStorage). A tap or click on a sticker puts one on the board; dragging it
//   out puts it where it is dropped.
// - On the board: each placed sticker is its own entry in the layout (server/services/dash.js, type 'stickers'): its
//   sticker, centre (grid columns and rows, so it stays with the widgets it decorates), size (its longer side, 60 to
//   600 px on a 1200 px wide board), turn and layer (in front of or behind the widgets). Drag to move, the corner to
//   resize (proportions kept), the round handle to turn; its own toolbar has only Duplicate and Delete (owner, 21 Nov
//   2026: the corner and round handles already size and turn it, and the one last moved sits on top). Mouse, touch and keyboard.
// Pure helpers first (tested in node: tests/unit/dash-board-p0.test.js), then the panel and the layer.
import { format } from './i18n-format.js';

export const INDEX_URL = '/img/stickers/index.json';
export const SIZE_MIN = 60, SIZE_MAX = 600, SIZES = { small: 100, medium: 200, large: 360 }, TURN = 15, PAGE = 60, RECENT_MAX = 12, FAV_MAX = 120;
export const REF_WIDTH = 1200;
/** Where stickers placed by a tap go, around the middle of the board in view (px on a REF_WIDTH board). */
const SPREAD = [[0, 0], [220, -40], [-220, -40], [0, 160], [220, 120], [-220, 120], [110, 60], [-110, 60]];
/** The index's language for an illustrated sticker ("en") -> the greeting stickers' language names. */
const LANG = { en: 'English' };
export const langOf = l => LANG[l] || l;
/** Lower case, accents dropped ("Buenos días" -> "buenos dias"), spaces collapsed: how search text and queries compare. */
export const fold = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const clampSize = n => Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(Number(n) || SIZES.medium)));
export const turn = (r, step) => ((Math.round((Number(r) || 0) + step) % 360) + 360) % 360;

/** The served index -> { list, byId }. labels: { th_<sheet>, lang_<Language> } in the reader's language, added to the
 *  search text so a theme or language is also found by its name on screen. The library's own fields are never changed. */
export function buildIndex(raw, labels = {}) {
  const base = raw && raw.base ? raw.base : '/img/stickers/';
  const list = (raw && Array.isArray(raw.entries) ? raw.entries : []).map(e => {
    const lang = langOf(e.language);
    const hay = fold([e.name, e.text, e.theme, lang, e.keywords, labels[`th_${e.sheet}`], labels[`lang_${lang}`]].filter(Boolean).join(' '));
    return { id: String(e.id), src: base + e.file, thumb: base + (e.thumb || e.file), sheet: e.sheet, theme: e.theme, name: e.name || '', text: e.text || '', lang,
      shape: e.shape || '', palette: e.palette || '', w: +e.w || 1, h: +e.h || 1, hay };
  });
  return { list, byId: new Map(list.map(x => [x.id, x])) };
}
/** Stickers matching the search text (case and accents ignored: the whole phrase, in the name, the words on the sticker,
 *  theme, language or keywords) and the filters (theme sheet, language, greeting shape). All of them when nothing is set. */
export function search(idx, { q = '', sheet = '', lang = '', shape = '' } = {}) {
  const f = fold(q);
  const out = [];
  for (const x of idx.list) {
    if (sheet && x.sheet !== sheet) continue;
    if (lang && x.lang !== lang) continue;
    if (shape && x.shape !== shape) continue;
    if (f && !x.hay.includes(f)) continue;
    out.push(x);
  }
  return out;
}
/** A sticker's box on screen: its longer side is size (on a REF_WIDTH board) times scale. */
export function boxOf(entry, size, scale = 1) {
  const long = clampSize(size) * scale, ar = entry && entry.w && entry.h ? entry.w / entry.h : 1;
  return ar >= 1 ? { w: long, h: long / ar } : { w: long * ar, h: long };
}
/** The list with one more used sticker at the front (no repeats, at most RECENT_MAX). */
export const pushRecent = (list, id) => [id, ...(list || []).filter(x => x !== id)].slice(0, RECENT_MAX);

// ---------------------------------------------------------------- this browser's recents and favorites
const store = (key, max) => ({
  get() { try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, max) : []; } catch { return []; } },
  set(v) { try { localStorage.setItem(key, JSON.stringify(v.slice(0, max))); } catch { /* private mode: not kept */ } },
});

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const button = (cls, text, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) { b.setAttribute('aria-label', label); b.title = label; } return b; };
const fill = (s, vars = {}) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

let loading = null;
export const loadIndex = () => (loading ||= fetch(INDEX_URL, { credentials: 'same-origin' }).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).catch(e => { loading = null; throw e; }));

/**
 * The stickers on a teacher's board, and the panel. opts:
 *   grid           the board's grid element (the stickers' layers go inside it)
 *   words          dash.w.stickers.* (the registry's words)
 *   intl           the reader's locale (counts)
 *   list()         the layout's stickers ({ id, type: 'stickers', s: { k, x, y, size, r, back } }, in layer order)
 *   setList(l)     replace them
 *   snapshot()     one undo step, before a change
 *   save()         save the layout soon
 *   say(msg)       tell screen readers
 *   toast(msg, o)  a message on screen
 *   narrow()       a phone's one-column board
 *   max            how many a layout may hold
 *   user           the teacher's id (recents and favorites are this teacher's, in this browser)
 */
export function createStickers(opts) {
  const W = opts.words, grid = opts.grid;
  const recents = store(`oomba.dash.stickers.recent.${opts.user || ''}`, RECENT_MAX), favs = store(`oomba.dash.stickers.fav.${opts.user || ''}`, FAV_MAX);
  let idx = null, sel = null, panel = null, cascade = 0;
  const ready = () => (idx ? Promise.resolve(idx) : loadIndex().then(raw => (idx ||= buildIndex(raw, W))));
  const nameOf = e => (e ? e.text || e.name : '') || W.role;

  // ---------------------------------------------------------------- geometry: grid units <-> px inside the grid
  function metrics() {
    const r = grid.getBoundingClientRect();
    const cs = getComputedStyle(grid), rowGap = parseFloat(cs.rowGap) || 0;
    const rows = +grid.style.getPropertyValue('--rows') || 4;
    const rowPitch = opts.narrow() ? 88 : (r.height + rowGap) / rows;
    return { r, colPitch: r.width / 12, rowPitch, scale: Math.max(0.6, Math.min(1.6, r.width / REF_WIDTH)) };
  }
  const toGrid = (m, cx, cy) => ({ x: Math.round(Math.max(0, Math.min(12, cx / m.colPitch)) * 100) / 100, y: Math.round(Math.max(0, Math.min(24, cy / m.rowPitch)) * 100) / 100 });

  // ---------------------------------------------------------------- the layers on the board
  let layers = null;
  function render() {
    layers = { back: el('div', 'dash-stklayer dash-stkback'), front: el('div', 'dash-stklayer dash-stkfront') };
    for (const l of Object.values(layers)) l.setAttribute('role', 'presentation');
    grid.append(layers.back, layers.front);
    if (!opts.list().length) return;
    ready().then(() => draw()).catch(() => {});
  }
  function draw() {
    if (!layers || !layers.back.isConnected) return;
    layers.back.textContent = ''; layers.front.textContent = '';
    const m = metrics();
    for (const w of opts.list()) {
      const e = idx.byId.get(w.s.k); if (!e) continue;
      (w.s.back ? layers.back : layers.front).appendChild(stickerEl(w, e, m));
    }
    const w = opts.list().find(x => x.id === sel);
    if (w) toolbar(w, m);
  }
  function place(node, w, e, m) {
    const b = boxOf(e, w.s.size, m.scale), cx = w.s.x * m.colPitch, cy = w.s.y * m.rowPitch;
    node.style.width = `${b.w}px`; node.style.height = `${b.h}px`;
    node.style.left = `${cx - b.w / 2}px`; node.style.top = `${cy - b.h / 2}px`;
    node.style.transform = w.s.r ? `rotate(${w.s.r}deg)` : '';
  }
  function stickerEl(w, e, m) {
    const node = el('div', 'dash-stk' + (sel === w.id ? ' is-selected' : ''));
    node.dataset.sid = w.id; node.dataset.k = w.s.k;
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-roledescription', W.role);
    node.setAttribute('aria-label', nameOf(e));
    const img = el('img', 'dash-stkimg'); img.src = e.src; img.alt = ''; img.draggable = false; img.decoding = 'async';
    node.appendChild(img);
    place(node, w, e, m);
    if (sel === w.id) {
      const rs = el('span', 'dash-stkresize'); rs.dataset.h = 'resize'; rs.setAttribute('aria-hidden', 'true'); rs.title = W.resize;
      const ro = el('span', 'dash-stkrotate'); ro.dataset.h = 'rotate'; ro.setAttribute('aria-hidden', 'true'); ro.title = W.rotate;
      node.append(rs, ro);
    }
    node.addEventListener('pointerdown', ev => down(ev, w, node, e));
    node.addEventListener('keydown', ev => key(ev, w));
    // Tabbing to a sticker selects it (its handles and toolbar show); it is drawn again, and keeps the focus.
    node.addEventListener('focus', () => { if (sel !== w.id) select(w.id); });
    return node;
  }
  function toolbar(w, m) {
    const e = idx.byId.get(w.s.k);
    const bar = el('div', 'dash-stkbar'); bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', fill(W.toolsFor, { name: nameOf(e) }));
    const b = (txt, label, fn, cls = '') => { const x = button(`btn btn-sm dash-stkbtn ${cls}`, txt, label); x.addEventListener('click', ev => { ev.stopPropagation(); fn(); }); bar.appendChild(x); return x; };
    b('⧉', W.duplicate, () => duplicate(w), 'dash-stk-dup');
    b('✖', W.remove, () => remove(w), 'dash-stk-del btn-danger');
    // A phone: the toolbar sits fixed above the bottom bar (public/css/dash.css), wherever the page is scrolled.
    if (opts.narrow()) {
      const foot = document.getElementById('dash-foot'), fr = foot && !foot.hidden ? foot.getBoundingClientRect() : null;
      bar.classList.add('is-docked'); bar.style.bottom = `${(fr && fr.height && fr.top < window.innerHeight ? window.innerHeight - fr.top : 0) + 8}px`;
      layers.front.appendChild(bar); return;
    }
    // Below the sticker (its turned box), inside the board's width; above it when there is no room below.
    const box = boxOf(e, w.s.size, m.scale), d = Math.hypot(box.w, box.h) / 2, cx = w.s.x * m.colPitch, cy = w.s.y * m.rowPitch;
    layers.front.appendChild(bar);
    const bw = bar.offsetWidth || 320, bh = bar.offsetHeight || 52;
    const left = Math.max(0, Math.min(m.r.width - bw, cx - bw / 2));
    const below = cy + Math.min(d, box.h / 2 + 24) + 8, above = cy - Math.min(d, box.h / 2 + 24) - 8 - bh;
    bar.style.left = `${left}px`; bar.style.top = `${m.r.top + below + bh > window.innerHeight && m.r.top + above > 0 ? above : below}px`;
  }

  // ---------------------------------------------------------------- changes
  const sticker = id => opts.list().find(x => x.id === id);
  function change(w, s, msg) { opts.snapshot(); w.s = { ...w.s, ...s }; draw(); opts.save(); if (msg) opts.say(msg); refocus(w.id); }
  function remove(w) {
    const e = idx && idx.byId.get(w.s.k);
    opts.snapshot(); opts.setList(opts.list().filter(x => x !== w)); sel = null; draw(); opts.save();
    opts.say(fill(W.removed, { name: nameOf(e) }));
  }
  const newId = () => `stk${Math.random().toString(36).slice(2, 10)}`;
  function duplicate(w) {
    if (opts.list().length >= opts.max) { opts.toast(fill(W.full, { n: opts.max }), { bad: true }); return; }
    opts.snapshot();
    const copy = { id: newId(), type: 'stickers', s: { ...w.s, x: Math.min(12, w.s.x + 0.5), y: w.s.y + 0.5 } };
    opts.setList([...opts.list(), copy]); sel = copy.id; draw(); opts.save();
    opts.say(fill(W.placed, { name: nameOf(idx.byId.get(w.s.k)) })); refocus(copy.id);
  }
  function select(id, focus = true) { sel = id; draw(); if (focus && id) refocus(id); }
  function refocus(id) { const n = grid.querySelector(`.dash-stk[data-sid="${CSS.escape(id)}"]`); if (n && document.activeElement !== n) n.focus({ preventScroll: true }); }
  /** Put one sticker on the board: at a point on screen (a drop), else in the middle of the board in view (a tap). */
  async function add(k, at = null) {
    await ready();
    const e = idx.byId.get(k); if (!e) return null;
    if (opts.list().length >= opts.max) { opts.toast(fill(W.full, { n: opts.max }), { bad: true }); return null; }
    const m = metrics();
    let cx, cy;
    if (at) { cx = at.x - m.r.left; cy = at.y - m.r.top; }
    else {
      // The middle of what shows of the board, a little further along for each sticker added this way.
      // (On a phone the sheet steps aside once the sticker is placed: the middle of the whole screen.)
      const top = Math.max(m.r.top, 0), bottom = Math.max(top + 40, Math.min(m.r.bottom, window.innerHeight));
      // Spread out (scaled to the board) so stickers tapped in one after another don't land on each other.
      const [ox, oy] = SPREAD[cascade++ % SPREAD.length], k = m.scale;
      cx = Math.max(40, Math.min(m.r.width - 40, m.r.width / 2 + ox * k)); cy = Math.max(40, (top + bottom) / 2 - m.r.top + oy * k);
    }
    opts.snapshot();
    const s = { k, ...toGrid(m, cx, cy), size: SIZES.medium, r: 0, back: false };
    const w = { id: newId(), type: 'stickers', s };
    opts.setList([...opts.list(), w]);
    recents.set(pushRecent(recents.get(), k));
    sel = w.id;
    if (!layers || !layers.back.isConnected) render(); else draw();
    opts.save();
    opts.say(fill(W.placed, { name: nameOf(e) }));
    if (panel && !panel.el.hidden && opts.narrow() && !at) {
      // A phone: the sheet covers most of the board, so it steps aside and the new sticker shows, selected.
      api.close(false);
      setTimeout(() => grid.querySelector(`.dash-stk[data-sid="${CSS.escape(w.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'instant' }), 80);
    } else if (panel && !panel.el.hidden && !panel.q.value && !panel.filtered()) panel.show();
    return w;
  }

  // ---------------------------------------------------------------- pointer: move, resize, turn
  let drag = null;
  function down(ev, w, node, e) {
    if (ev.button > 0) return;
    const h = ev.target.dataset && ev.target.dataset.h;
    const m = metrics(), rect = node.getBoundingClientRect();
    const c = { x: m.r.left + w.s.x * m.colPitch, y: m.r.top + w.s.y * m.rowPitch };
    drag = { w, node, e, m, kind: h || 'move', id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, c, start: { ...w.s }, moved: false,
      d0: Math.max(8, Math.hypot(ev.clientX - c.x, ev.clientY - c.y)), rect };
    node.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  }
  function move(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) { drag.moved = true; drag.node.classList.add('is-dragging'); grid.querySelector('.dash-stkbar')?.remove(); }
    const m = drag.m, s = drag.w.s;
    if (drag.kind === 'move') {
      const p = toGrid(m, drag.start.x * m.colPitch + dx, drag.start.y * m.rowPitch + dy);
      drag.next = p;
    } else if (drag.kind === 'resize') {
      const d = Math.hypot(ev.clientX - drag.c.x, ev.clientY - drag.c.y);
      drag.next = { size: clampSize(drag.start.size * d / drag.d0) };
    } else {
      const a = Math.atan2(ev.clientY - drag.c.y, ev.clientX - drag.c.x) * 180 / Math.PI + 90;
      // The handle snaps to 15 degree steps when it is near one (and with Shift always).
      let r = Math.round(a); const snap = Math.round(a / TURN) * TURN;
      if (ev.shiftKey || Math.abs(a - snap) < 4) r = snap;
      drag.next = { r: turn(r, 0) };
    }
    place(drag.node, { ...drag.w, s: { ...s, ...drag.next } }, drag.e, m);
  }
  function up(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    const d = drag; drag = null;
    d.node.classList.remove('is-dragging');
    if (!d.moved || !d.next) { select(d.w.id); return; }
    const name = nameOf(d.e);
    const msg = d.kind === 'move' ? fill(W.moved, { name }) : d.kind === 'resize' ? fill(W.sized, { name, size: d.next.size }) : fill(W.turned, { name, deg: d.next.r });
    sel = d.w.id;
    // A sticker that is moved, resized or turned comes to the top of the others (owner, 21 Nov 2026: no layer buttons).
    opts.snapshot();
    d.w.s = { ...d.w.s, ...d.next, back: false };
    opts.setList([...opts.list().filter(x => x !== d.w), d.w]);
    draw(); opts.save(); opts.say(msg); refocus(d.w.id);
  }
  grid.addEventListener('pointermove', move);
  grid.addEventListener('pointerup', up);
  grid.addEventListener('pointercancel', ev => { if (drag && ev.pointerId === drag.id) { drag = null; draw(); } });
  // A tap anywhere else lets go of the selected sticker.
  document.addEventListener('pointerdown', ev => {
    if (!sel || ev.target.closest('.dash-stk,.dash-stkbar,.dash-stkpanel')) return;
    sel = null; draw();
  });
  function key(ev, w) {
    const k = ev.key, e = idx.byId.get(w.s.k), name = nameOf(e);
    const step = ev.shiftKey ? 1 : 0.25, rtl = document.documentElement.dir === 'rtl';
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (dir) {
      ev.preventDefault();
      const dx = (rtl ? -dir[0] : dir[0]) * step, dy = dir[1] * step;
      change(w, { x: Math.max(0, Math.min(12, Math.round((w.s.x + dx) * 100) / 100)), y: Math.max(0, Math.min(24, Math.round((w.s.y + dy) * 100) / 100)) }, fill(W.moved, { name }));
    } else if (k === '+' || k === '=') { ev.preventDefault(); const size = clampSize(w.s.size + 20); change(w, { size }, fill(W.sized, { name, size })); }
    else if (k === '-' || k === '_') { ev.preventDefault(); const size = clampSize(w.s.size - 20); change(w, { size }, fill(W.sized, { name, size })); }
    else if (k === 'r' || k === 'R') { ev.preventDefault(); const r = turn(w.s.r, ev.shiftKey ? -TURN : TURN); change(w, { r }, fill(W.turned, { name, deg: r })); }
    else if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); remove(w); grid.querySelector('.dash-stk')?.focus({ preventScroll: true }); }
    else if (k === 'Escape') { ev.preventDefault(); sel = null; draw(); }
    else if (k === 'Enter' || k === ' ') { ev.preventDefault(); select(w.id); }
  }

  // ---------------------------------------------------------------- the panel
  function makePanel() {
    const root = el('aside', 'dash-stkpanel'); root.id = 'dash-stkpanel'; root.hidden = true;
    root.setAttribute('aria-labelledby', 'dash-stkpanel-h');
    const head = el('div', 'dash-stkhead');
    const h = el('h2', 'dash-h3', W.heading); h.id = 'dash-stkpanel-h';
    const close = button('iconbtn dash-stkclose', '✖', W.close);
    head.append(h, close);
    const q = el('input', 'input dash-stkq'); q.type = 'search'; q.id = 'dash-stkq'; q.placeholder = W.search; q.autocomplete = 'off'; q.spellcheck = false; q.setAttribute('aria-label', W.search); q.enterKeyHint = 'search';
    const sel3 = (id, label, all, items) => {
      const s = el('select', 'input dash-stkfilter'); s.id = id; s.setAttribute('aria-label', label); s.title = label;
      s.append(new Option(all, ''), ...items.map(([v, l]) => new Option(l, v)));
      return s;
    };
    const sheets = ['oomba', 'praise', 'classroom', 'animals-nature', 'maths-stem', 'seasons-holidays', 'food', 'sports-play', 'space-weather', 'music-arts', 'transport', 'emotions', 'letters-numbers', 'good-morning', 'praise-words', 'hello-welcome', 'goodbye', 'greetings'];
    const langs = ['English', 'Italian', 'Spanish', 'French', 'German', 'Dutch', 'Portuguese', 'Swedish', 'Turkish'];
    const theme = sel3('dash-stk-theme', W.theme, W.allThemes, sheets.map(x => [x, W[`th_${x}`] || x]));
    const lang = sel3('dash-stk-lang', W.language, W.allLanguages, langs.map(x => [x, W[`lang_${x}`] || x]));
    const shape = sel3('dash-stk-shape', W.shape, W.allShapes, ['rect', 'circle', 'bubble'].map(x => [x, W[`shape_${x}`] || x]));
    const filters = el('div', 'dash-stkfilters'); filters.append(theme, lang, shape);
    const count = el('p', 'dash-stkcount'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
    const list = el('div', 'dash-stklist');
    const hint = el('p', 'small muted dash-stkhint', W.hint);
    const top = el('div', 'dash-stktop'); top.append(q, filters, count);
    root.append(head, top, list, hint);
    document.getElementById('dash')?.appendChild(root) || document.body.appendChild(root);
    const filtered = () => !!(theme.value || lang.value || shape.value);
    let shown = PAGE, timer = 0;
    const tile = e => {
      const li = el('li', 'dash-stkcell');
      const b = button('dash-stkitem', null, fill(W.add, { name: nameOf(e) })); b.dataset.k = e.id;
      const img = el('img'); img.src = e.thumb; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false; img.width = 96; img.height = 96;
      b.appendChild(img);
      const isFav = favs.get().includes(e.id);
      const star = button('dash-stkstar', isFav ? '★' : '☆', fill(isFav ? W.unstar : W.star, { name: nameOf(e) })); star.setAttribute('aria-pressed', String(isFav)); star.dataset.k = e.id;
      li.append(b, star);
      return li;
    };
    const grid3 = items => { const ul = el('ul', 'plain dash-stkgrid'); for (const e of items) ul.appendChild(tile(e)); return ul; };
    const section = (title, items) => { const s = el('section', 'dash-stksec'); s.append(el('h3', 'dash-stksech', title), grid3(items)); return s; };
    function show(keep = false) {
      if (!idx) { list.textContent = ''; count.textContent = W.loading; return; }
      if (!keep) shown = PAGE;
      const text = q.value.trim();
      const found = search(idx, { q: text, sheet: theme.value, lang: lang.value, shape: shape.value });
      list.textContent = '';
      count.textContent = format(W.count, { n: found.length }, opts.intl);
      count.dataset.q = text;
      if (!found.length) {
        const empty = el('div', 'dash-stkempty');
        empty.append(el('p', null, text ? fill(W.none, { q: text }) : W.noneFilters));
        const clear = button('btn btn-sm dash-stkclear', W.clear); clear.addEventListener('click', () => { q.value = ''; theme.value = lang.value = shape.value = ''; show(); q.focus(); });
        empty.appendChild(clear);
        list.appendChild(empty);
        return;
      }
      if (!text && !filtered()) {
        const fav = favs.get().map(k => idx.byId.get(k)).filter(Boolean), rec = recents.get().map(k => idx.byId.get(k)).filter(Boolean);
        if (fav.length) list.appendChild(section(W.favorites, fav));
        if (rec.length) list.appendChild(section(W.recent, rec));
        list.appendChild(el('h3', 'dash-stksech', W.all));
      }
      const g = grid3(found.slice(0, shown)); g.classList.add('dash-stkresults'); list.appendChild(g);
      if (found.length > shown) {
        const more = button('btn btn-sm dash-stkmore', W.more); more.addEventListener('click', () => { shown += PAGE; const st = list.scrollTop; show(true); list.scrollTop = st; });
        list.appendChild(more);
        if (typeof IntersectionObserver === 'function') { const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); more.click(); } }, { root: list }); io.observe(more); }
      }
    }
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => show(), 60); });
    for (const s of [theme, lang, shape]) s.addEventListener('change', () => show());
    q.addEventListener('keydown', ev => { if (ev.key === 'Escape' && q.value) { ev.stopPropagation(); q.value = ''; show(); } });
    close.addEventListener('click', () => api.close());
    // A tap or click puts one sticker on the board; dragging it out of the panel puts it where it is dropped.
    let pick = null, ghost = null;
    list.addEventListener('click', ev => {
      const star = ev.target.closest('.dash-stkstar');
      if (star) {
        const k = star.dataset.k, on = !favs.get().includes(k);
        favs.set(on ? [k, ...favs.get().filter(x => x !== k)] : favs.get().filter(x => x !== k));
        const e = idx.byId.get(k);
        star.textContent = on ? '★' : '☆'; star.setAttribute('aria-pressed', String(on)); star.setAttribute('aria-label', fill(on ? W.unstar : W.star, { name: nameOf(e) })); star.title = star.getAttribute('aria-label');
        if (!q.value && !filtered()) { const st = list.scrollTop; show(true); list.scrollTop = st; list.querySelector(`.dash-stkstar[data-k="${CSS.escape(k)}"]`)?.focus(); }
        return;
      }
      const b = ev.target.closest('.dash-stkitem'); if (!b) return;
      if (b.dataset.dragged === '1') { delete b.dataset.dragged; return; }
      add(b.dataset.k);
    });
    list.addEventListener('pointerdown', ev => {
      const b = ev.target.closest('.dash-stkitem'); if (!b || ev.button > 0) return;
      pick = { b, k: b.dataset.k, id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, on: false };
    });
    const endGhost = () => { ghost?.remove(); ghost = null; };
    document.addEventListener('pointermove', ev => {
      if (!pick || ev.pointerId !== pick.id) return;
      if (!pick.on && Math.hypot(ev.clientX - pick.sx, ev.clientY - pick.sy) < 10) return;
      if (!pick.on) {
        pick.on = true; pick.b.dataset.dragged = '1';
        try { pick.b.setPointerCapture(ev.pointerId); } catch { /* touch scrolling took it */ }
        ghost = el('img', 'dash-stkghost'); ghost.src = pick.b.querySelector('img').src; ghost.alt = ''; document.body.appendChild(ghost);
      }
      ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`;
    });
    document.addEventListener('pointerup', ev => {
      if (!pick || ev.pointerId !== pick.id) return;
      const p = pick; pick = null; endGhost();
      if (!p.on) return;
      setTimeout(() => { delete p.b.dataset.dragged; }, 80);
      const r = grid.getBoundingClientRect(), under = document.elementFromPoint(ev.clientX, ev.clientY);
      if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom && !(under && under.closest('.dash-stkpanel'))) add(p.k, { x: ev.clientX, y: ev.clientY });
    });
    document.addEventListener('pointercancel', ev => { if (pick && ev.pointerId === pick.id) { if (pick.on) delete pick.b.dataset.dragged; pick = null; endGhost(); } });
    return { el: root, q, show, filtered, theme, lang, shape };
  }
  const api = {
    render,
    draw: () => { if (idx) draw(); },
    add,
    select,
    get selected() { return sel; },
    ready,
    open() {
      panel ||= makePanel();
      panel.el.hidden = false;
      document.body.classList.add('dash-stk-open');
      document.getElementById('dash-stickers-btn')?.setAttribute('aria-expanded', 'true');
      panel.show();
      ready().then(() => panel.show()).catch(() => { const c = panel.el.querySelector('.dash-stkcount'); if (c) c.textContent = W.failed; });
      panel.q.focus();
      requestAnimationFrame(() => api.draw());
    },
    close(focus = true) {
      if (!panel) return;
      panel.el.hidden = true;
      document.body.classList.remove('dash-stk-open');
      const b = document.getElementById('dash-stickers-btn'); b?.setAttribute('aria-expanded', 'false'); if (focus) b?.focus({ preventScroll: true });
      requestAnimationFrame(() => api.draw());
    },
    toggle() { if (panel && !panel.el.hidden) api.close(); else api.open(); },
  };
  addEventListener('resize', () => requestAnimationFrame(() => api.draw()));
  return api;
}
