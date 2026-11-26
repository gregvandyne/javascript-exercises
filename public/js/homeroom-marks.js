// Students' lines on the room (docs/decisions.md "Homeroom: touch drag, eraser, resizable area, the whole board";
// server: services/homeroom-marks.js). When the class's teachers turn it on, a student in See the room draws with a pen
// and erases their own lines anywhere on the room outside other students' desks, the teacher's area and My desk. The
// lines are board pixels; everyone in See the room sees them (without names), the teacher's and the aide's board too
// (with whose they are). Never the projector. No words here: the pages pass theirs.
//   marksLayer(...)  the board's layer of students' lines (public/js/homeroom.js), asked for every few seconds
//   roomPen(...)     See the room's pen and eraser for a student (public/js/homeroom-desk.js)
import { api, toast, esc } from '/js/app.js';
import { strokeSvg } from '/js/board-shapes.js';
import { eraseStrokes } from '/js/board-erase.js';
import { DESK, TEAM_DESK, NAME_H, tdeskOf } from '/js/homeroom-seats.js';

const r1 = v => Math.round(v * 10) / 10;
/** Lines as SVG polylines (map(p) moves each point; title: whose, for the teacher's board). */
export function marksSvg(list, map = null, title = null) {
  return (Array.isArray(list) ? list : []).map(s => {
    const line = strokeSvg(map ? { ...s, pts: s.pts.map(map) } : s, 1, 1, 'class="hr-mark"');
    return title && line ? line.replace('/>', `><title>${esc(title)}</title></polyline>`) : line;
  }).join('');
}

/**
 * The board's layer: every student's lines with their name (a title on each, which a mouse shows), asked for again
 * every few seconds while the board is on screen. ctx: { url, svg() (the layer), away() (the board is hidden), every,
 * onData(data) }
 */
export function marksLayer(ctx) {
  const st = { on: false, v: null, marks: [] };
  let timer = null;
  function render() {
    const el = ctx.svg(); if (!el) return;
    const w = ctx.size(); el.setAttribute('width', w.w); el.setAttribute('height', w.h); el.setAttribute('viewBox', `0 0 ${w.w} ${w.h}`);
    el.innerHTML = st.marks.map(m => marksSvg(m.strokes, null, m.name)).join('');
  }
  function take(r) {
    if (!r) return;
    st.on = !!r.on; st.v = r.v;
    if (Array.isArray(r.marks)) { st.marks = r.marks; render(); }
    ctx.onData?.(st);
  }
  async function poll() {
    clearTimeout(timer); timer = null;
    if (document.hidden || ctx.away()) return;
    try { take(await api(`${ctx.url}?v=${encodeURIComponent(st.v ?? '')}`, { background: true })); } catch { /* again later */ }
    timer = setTimeout(poll, st.on || st.marks.length ? ctx.every : ctx.every * 4);
  }
  return { st, render, take, poll, stop: () => { clearTimeout(timer); timer = null; } };
}

/**
 * See the room's pen for a student. ctx: { url, box() (the room's box), map() -> the room's transform { x0, top, up, k,
 * fr } or null (the phone's grid of names: no board), desks: [{ x, y, team?, me? }], colors, words: { full, notHere,
 * locked, off }, onChange(st) }. st: { on (the teacher allows it), locked, tool: '' | 'pen' | 'erase', color, mine,
 * others }.
 */
export function roomPen(ctx) {
  const st = { on: false, locked: false, tool: '', color: ctx.colors[0], mine: [], others: [], v: null, hist: [] };
  let cur = null, saveTimer = null, saving = false, dirty = false, pollTimer = null;
  const newId = () => `m${Math.random().toString(36).slice(2, 10)}`;
  /** The places this student may not draw (board pixels): the area, My desk, everyone else's desk with its name. */
  function offLimits(m) {
    const out = [m.fr, tdeskOf(m.fr)];
    for (const d of ctx.desks) if (!d.me) { const b = d.team ? TEAM_DESK : DESK; out.push({ x: d.x, y: d.y - NAME_H, w: b.w, h: b.h + NAME_H }); }
    return out;
  }
  const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  /** A pointer on the room's box, in board pixels (null above the teacher's area's bottom: its band is squeezed). */
  function toBoard(e, m) {
    const r = ctx.box().getBoundingClientRect(), x = (e.clientX - r.left) / m.k + m.x0, yr = (e.clientY - r.top) / m.k + m.top, y = yr + m.up;
    if (y <= m.fr.y + m.fr.h) return null;
    return { x: r1(x), y: r1(y) };
  }
  const fromBoard = m => p => ({ x: (p.x - m.x0) * m.k, y: (p.y - m.up - m.top) * m.k });
  function render() {
    const box = ctx.box(); if (!box) return;
    let el = box.querySelector(':scope > .hd-rmarks');
    const m = ctx.map();
    if (!m) { el?.remove(); return; }
    if (!el) { el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('class', 'hd-rmarks'); el.setAttribute('aria-hidden', 'true'); box.append(el); }
    const map = fromBoard(m), k = m.k;
    // (the lines scaled with the room: the pen's width too)
    const scaled = list => list.map(s => strokeSvg({ ...s, pts: s.pts.map(map) }, 1, 1, 'class="hr-mark"')).join('');
    el.innerHTML = `<g class="hd-rmo">${scaled(st.others)}</g><g class="hd-rmm">${scaled(st.mine)}</g>${cur && cur.s ? `<g class="hd-rmm">${scaled([cur.s])}</g>` : ''}`;
    for (const pl of el.querySelectorAll('polyline')) pl.setAttribute('stroke-width', String(Math.max(1.5, 4 * k)));
    box.classList.toggle('hd-drawing', !!(st.tool && st.on && !st.locked));
  }
  function take(r) {
    if (!r) return;
    const was = st.on && !st.locked;
    st.on = !!r.on; st.locked = !!r.locked; st.v = r.v;
    if (Array.isArray(r.others)) st.others = r.others;
    if (Array.isArray(r.mine) && !dirty && !saving && !cur) st.mine = r.mine;
    if (!(st.on && !st.locked)) { st.tool = ''; cur = null; }
    if (was && !(st.on && !st.locked) && st.locked) toast(ctx.words.locked);
    render(); ctx.onChange?.(st);
  }
  async function poll() {
    clearTimeout(pollTimer); pollTimer = null;
    if (document.hidden || !ctx.box()) return;
    try { take(await api(`${ctx.url}?v=${encodeURIComponent(dirty || saving ? '' : st.v ?? '')}`, { background: true })); } catch { /* again later */ }
    pollTimer = setTimeout(poll, 4000);
  }
  function queueSave() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(save, 600); }
  async function save() {
    saveTimer = null; if (!dirty || saving) return; dirty = false; saving = true;
    try { const r = await api(ctx.url, { method: 'POST', body: { strokes: st.mine } }); st.v = r.v; }
    catch (e) {
      if (e.status === 429) { dirty = true; saveTimer = setTimeout(save, 3000); }
      else {
        toast(e.message, { bad: true });
        // refused (turned off, locked, another desk): back to what the server has
        if (e.data && (e.data.code === 'drawOff' || e.data.code === 'deskLocked')) { st.tool = ''; if (e.data.code === 'drawOff') st.on = false; else st.locked = true; }
        st.v = null; st.hist = []; setTimeout(poll, 0);
      }
    } finally { saving = false; render(); ctx.onChange?.(st); }
  }
  function remember() { st.hist.push(JSON.stringify(st.mine)); if (st.hist.length > 40) st.hist.shift(); }
  function undo() { const last = st.hist.pop(); if (last == null) return; st.mine = JSON.parse(last); render(); queueSave(); ctx.onChange?.(st); }
  function down(e) {
    const m = ctx.map();
    if (!st.tool || !st.on || st.locked || !m || e.button > 0 || cur) return false;
    const p = toBoard(e, m); if (!p) return false;
    e.preventDefault();
    try { ctx.box().setPointerCapture(e.pointerId); } catch { /* gone */ }
    if (st.tool === 'erase') { remember(); cur = { id: e.pointerId, erase: true, last: p, changed: erase([p], m) }; return true; }
    if (st.mine.length >= ctx.limits.strokes) { toast(ctx.words.full, { bad: true }); return true; }
    const no = offLimits(m);
    if (no.some(r => inside(p, r))) { toast(ctx.words.notHere); return true; }
    cur = { id: e.pointerId, s: { id: newId(), c: st.color, pts: [p] }, no };
    render(); return true;
  }
  function erase(path, m) {
    const r = eraseStrokes(st.mine, path, 16 / m.k, { fromPx: p => ({ x: r1(p.x), y: r1(p.y) }), newId, maxPts: ctx.limits.points });
    if (!r.changed) return false;
    if (r.strokes.length > ctx.limits.strokes) { toast(ctx.words.full, { bad: true }); return false; }
    st.mine = r.strokes; render(); return true;
  }
  function move(e) {
    if (!cur || cur.id !== e.pointerId) return;
    const m = ctx.map(); if (!m) return;
    const p = toBoard(e, m);
    if (cur.erase) { if (p) { if (erase([cur.last, p], m)) cur.changed = true; cur.last = p; } return; }
    // a line stops at another desk, the area or My desk; it goes on once the pen is out again (a new line)
    if (!p || cur.no.some(r => inside(p, r))) { if (cur.s.pts.length > 1) finish(); else cur.s.pts = []; return; }
    const last = cur.s.pts[cur.s.pts.length - 1];
    if (!last) { cur.s.pts.push(p); return; }
    if (cur.s.pts.length === 1 && st.mine.length >= ctx.limits.strokes) return;
    if (Math.hypot(p.x - last.x, p.y - last.y) * m.k < 1.5 || cur.s.pts.length >= ctx.limits.points) return;
    cur.s.pts.push(p); render();
  }
  function finish() {
    const c = cur; if (!c || c.erase) return;
    if (new Set(c.s.pts.map(p => `${p.x},${p.y}`)).size >= 2) { remember(); st.mine = [...st.mine, c.s]; queueSave(); }
    cur = { id: c.id, s: { id: newId(), c: c.s.c, pts: [] }, no: c.no };
    render(); ctx.onChange?.(st);
  }
  function up(e) {
    if (!cur || cur.id !== e.pointerId) return;
    const c = cur;
    if (c.erase) { cur = null; if (c.changed) queueSave(); else st.hist.pop(); render(); ctx.onChange?.(st); return; }
    if (c.s.pts.length > 1) finish();
    cur = null; render(); ctx.onChange?.(st);
  }
  /** Leaving See the room: what was drawn is saved now. */
  function flush() { if (dirty) { clearTimeout(saveTimer); save(); } clearTimeout(pollTimer); pollTimer = null; }
  return { st, render, take, poll, down, move, up, undo, flush, setTool: k => { st.tool = st.tool === k ? '' : k; render(); ctx.onChange?.(st); }, setColor: c => { st.color = c; st.tool = 'pen'; render(); ctx.onChange?.(st); } };
}
