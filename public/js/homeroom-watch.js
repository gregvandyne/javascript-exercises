// Watching desks on the teacher's board (docs/decisions.md "Homeroom: watching desks and the full catalog"; server:
// services/homeroom-watch.js, services/homeroom-tools.js, routes/homeroom.js watchView). Like the Manipulatives live room,
// where each student's board shows in its square, each desk on the board shows what that student has open right now,
// scaled down, and tapping the desk opens it large (look):
//   - a game in the in-desk player: the small picture the game's own frame draws (a few seconds old at most), with
//     where their pointer is;
//   - a Manipulatives tool: their square in the tool's live room, drawn read-only by the tool's own code
//     (public/js/manip.js readOnlyBoard, the same drawing the live room uses), with their cursor;
//   - reading: the page they are on, its picture and its first words;
//   - their desk otherwise: their cards (as always) and their doodle pad.
// The notebook is never shown (it stays private). Nothing is asked for while live class is off, the board is hidden or
// another view is on screen (public/js/homeroom-live.js stops polling then), and only the desks in view are watched.
import { t, esc } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { inkLine } from '/js/board-ann.js';

const tw = (k, v) => t(`js.homeroom-watch.${k}`, v);
const PAD = { w: 900, h: 600 };
/** On-screen width a desk needs before its picture is worth asking for. */
const MIN_PX = 48;

/** ctx: { worldEl, board: () => the board's element, handout(id), nameOfId(sid) }. */
export function watcher(ctx) {
  const W = { screens: {}, boards: {}, bcur: {}, pads: {}, manip: null, loading: null, drawn: new Map() };

  // ---------------------------------------------------------------- what the poll says and asks
  /** Solo desks whose box is on screen and big enough (team desks: their members in look). */
  function inView() {
    const b = ctx.board(); if (!b) return [];
    const r = b.getBoundingClientRect(), out = [];
    for (const el of ctx.worldEl.querySelectorAll('.hr-desk[data-sid]')) {
      const d = el.getBoundingClientRect();
      if (d.width >= MIN_PX && d.right > r.left && d.left < r.right && d.bottom > r.top && d.top < r.bottom) out.push(el.dataset.sid);
    }
    return out;
  }
  const pairs = o => Object.entries(o).map(([k, v]) => `${k}:${v.v}`).join(',');
  /** The poll's query: the desks in view, the one open large, and the versions the board already has. */
  function query(look = '') {
    const w = inView();
    return `&w=${encodeURIComponent(w.join(','))}${look ? `&look=${encodeURIComponent(look)}` : ''}&sv=${encodeURIComponent(pairs(W.screens))}&mv=${encodeURIComponent(pairs(W.boards))}&pv=${encodeURIComponent(pairs(W.pads))}`;
  }
  /** The poll's answer: new pictures, boards and pads; cursors on boards. */
  function take(r) {
    const now = Date.now();
    for (const [sid, x] of Object.entries(r.screens || {})) W.screens[sid] = { ...x, at: now - (x.age || 0) };
    for (const [sid, x] of Object.entries(r.boards || {})) { W.boards[sid] = x; W.drawn.delete(sid); }
    W.bcur = r.bcur || {};
    // a board the server no longer has for that desk (the player closed, the set is done, another one opened) goes:
    // bcur names every desk that still has one
    for (const sid of Object.keys(W.boards)) if (!(sid in W.bcur)) delete W.boards[sid];
    for (const [sid, x] of Object.entries(r.pads || {})) W.pads[sid] = x;
    // a picture a little old is still them; one older than 30 s is not shown (the server stops sending it too)
    for (const [sid, x] of Object.entries(W.screens)) if (now - x.at > 30e3) delete W.screens[sid];
    if (Object.keys(W.boards).length && !W.manip) loadManip();
  }
  /** The Manipulatives tools' own drawing, once a board needs it. */
  function loadManip() {
    if (W.loading) return W.loading;
    W.loading = import('/js/manip.js').then(m => { W.manip = m; ctx.repaint(); }).catch(() => { W.loading = null; });
    return W.loading;
  }

  // ---------------------------------------------------------------- drawing
  const curDot = (cur, name) => (cur ? `<span class="hr-scur" style="left:${cur[0] * 100}%;top:${cur[1] * 100}%" aria-hidden="true"><svg width="14" height="16" viewBox="0 0 18 20"><path d="M1 1l15 8-7 2-3 7z" fill="#FF6B4A" stroke="#fff" stroke-width="1.5"/></svg>${name ? `<b><bdi>${esc(name)}</bdi></b>` : ''}</span>` : '');
  /** A Manipulatives board drawn read-only, scaled to fit w x h. */
  function boardHtml(sid, x, w, h, name) {
    if (!W.manip) { loadManip(); return `<div class="hr-sbusy">${iconHtml('🧮', { size: 22 })}</div>`; }
    let st = null; try { st = JSON.parse(x.state || '{}') || {}; } catch { st = {}; }
    const sp = x.space || { w: 600, h: 400 }, rb = W.manip.readOnlyBoard(x.tool, st, sp);
    if (!rb) return '';
    const k = Math.min(w / sp.w, h / sp.h);
    const notes = rb.ann.notes.map(n => `<div class="mp-sticky hr-snote" style="left:${(+n.x || 0) * 100}%;top:${(+n.y || 0) * 100}%"><p>${esc(n.text || '')}</p></div>`).join('');
    return `<div class="hr-mscreen" data-w="${sp.w}" data-h="${sp.h}" style="width:${sp.w}px;height:${sp.h}px;transform:scale(${k})"><div class="rm-in hr-msq"><div class="mp-content mp-abs">${rb.html}</div>
      <svg class="mp-ink" viewBox="0 0 ${sp.w} ${sp.h}" aria-hidden="true">${rb.ann.strokes.map(s => inkLine(s, sp.w, sp.h)).join('')}</svg><div class="mp-notes">${notes}</div></div></div>
      <span class="hr-sbox" style="width:${sp.w * k}px;height:${sp.h * k}px">${curDot(W.bcur[sid], name)}</span>`;
  }
  const padSvg = (strokes, cls = '') => `<svg class="${cls}" viewBox="0 0 ${PAD.w} ${PAD.h}" aria-hidden="true"><rect x="1" y="1" width="${PAD.w - 2}" height="${PAD.h - 2}" rx="14" class="hd-paper"/>${(strokes || []).map(s => inkLine(s, PAD.w, PAD.h)).join('')}</svg>`;
  /** What a desk's screen shows now: { kind, key, html } or null (their desk: the cards, as always). */
  function screenOf(sid, d, size) {
    if (!d || d.st === 'away' || d.absent || d.home) return null;
    const name = size === 'big' ? '' : '';
    if (d.where === 'game') {
      // (a picture is of the game it was drawn in: one of another handout than the desk has open now is not shown)
      const s0 = W.screens[sid], s = s0 && (!s0.on || !d.on || s0.on === d.on) ? s0 : null, h = d.on ? ctx.handout(d.on) : null, title = h ? h.title : tw('aGame');
      if (s) return { kind: 'game', key: `g${s.v}`, html: `<img class="hr-simg" src="${esc(s.img)}" alt="" width="${s.w}" height="${s.h}">${curDot(s.cur, name)}<span class="hr-stag">${iconHtml(h ? h.icon : '🎮', { size: 12 })} <span dir="auto">${esc(title)}</span></span>` };
      return { kind: 'game', key: `gx${d.on}`, html: `<div class="hr-swait">${iconHtml(h ? h.icon : '🎮', { size: size === 'big' ? 40 : 22 })}<span dir="auto">${esc(tw('playing', { title }))}</span></div>` };
    }
    if (d.where === 'tool') {
      // the board and its problem come as one (services/homeroom-tools.js boardsOf), and only while that very handout is
      // open: one for another handout than the desk has open is never shown, and its label is its own title
      const b0 = W.boards[sid], open = d.tool ? d.tool.id : '', b = b0 && (!b0.on || !open || b0.on === open) ? b0 : null, title = (b && b.title) || (d.tool ? d.tool.title : tw('aTool'));
      if (b) {
        const w = size === 'big' ? 560 : 168, h = size === 'big' ? 380 : 110;
        // a Manipulatives practice set (services/manip-tasks.js): the problem they are on, and what they typed (look)
        const pr = b.prob, prob = !pr ? '' : size === 'big' ? `<p class="hr-sprob"><b>${esc(tw('question', { i: pr.i + 1, n: pr.n }))}</b> <span dir="auto">${esc(pr.prompt)}</span>${pr.box ? ` <span class="hr-sprobbox">${esc(tw('typed', { box: pr.box }))}</span>` : ''}</p>` : '';
        const tag = pr ? `${title} · ${tw('question', { i: pr.i + 1, n: pr.n })}` : title;
        return { kind: 'tool', key: `t${b.v}:${b.on || ''}:${(W.bcur[sid] || []).join(',')}:${W.manip ? 1 : 0}:${size}`, html: `${prob}<div class="hr-sfit">${boardHtml(sid, b, w, h, name)}</div><span class="hr-stag">${iconHtml(d.tool ? d.tool.icon : '🧮', { size: 12 })} <span dir="auto">${esc(tag)}</span></span>` };
      }
      return { kind: 'tool', key: `tx${d.on}`, html: `<div class="hr-swait">${iconHtml(d.tool ? d.tool.icon : '🧮', { size: size === 'big' ? 40 : 22 })}<span dir="auto">${esc(tw('using', { title }))}</span></div>` };
    }
    if (d.where === 'reading' && d.book) {
      const bk = d.book;
      return { kind: 'read', key: `r${bk.id}:${bk.page}`, html: `<div class="hr-sread"><img src="${esc(bk.pic || bk.cover)}" alt="" loading="lazy">${bk.words ? `<p dir="auto">${esc(bk.words)}</p>` : ''}</div><span class="hr-stag">${iconHtml('📖', { size: 12 })} <span dir="auto">${esc(tw('page', { page: bk.page || 1, pages: bk.pages }))}</span></span>` };
    }
    return null;
  }
  /** Put each watched desk's screen on it (after the board's live marks are drawn). dd: the poll's desks. */
  function paint(dd, on) {
    for (const el of ctx.worldEl.querySelectorAll('.hr-desk[data-sid]')) {
      const sid = el.dataset.sid, sc = on ? screenOf(sid, dd[sid], 'tile') : null;
      let box = el.querySelector(':scope > .hr-screen'), pad = el.querySelector(':scope > .hr-spad');
      el.classList.toggle('hr-watching', !!sc);
      if (!sc) { box?.remove(); } else {
        if (!box) { box = document.createElement('div'); box.className = 'hr-screen'; box.setAttribute('aria-hidden', 'true'); el.appendChild(box); }
        if (box.dataset.key !== sc.key) { box.dataset.key = sc.key; box.dataset.kind = sc.kind; box.innerHTML = sc.html; fit(box); }
      }
      // their doodle pad, small, while they are at their desk
      const p = W.pads[sid], d = dd[sid], showPad = on && !sc && p && p.strokes.length && d && d.st !== 'away' && !d.absent;
      if (!showPad) pad?.remove();
      else if (!pad || pad.dataset.v !== String(p.v)) { pad?.remove(); pad = document.createElement('div'); pad.className = 'hr-spad'; pad.dataset.v = String(p.v); pad.setAttribute('aria-hidden', 'true'); pad.innerHTML = padSvg(p.strokes); el.appendChild(pad); }
    }
  }
  /** A board drawn into a box of any size: scaled to fit the box it landed in (a tile, look's large view). */
  function fit(root) {
    for (const m of root.querySelectorAll('.hr-mscreen[data-w]')) {
      const box = m.parentElement, w = +m.dataset.w, h = +m.dataset.h; if (!box || !box.clientWidth) continue;
      const k = Math.min(box.clientWidth / w, box.clientHeight / h);
      m.style.transform = `scale(${k})`;
      const cb = box.querySelector('.hr-sbox'); if (cb) { cb.style.width = `${w * k}px`; cb.style.height = `${h * k}px`; }
    }
  }
  /** Look's large view of what they see. */
  function bigHtml(sid, d) {
    const sc = screenOf(sid, d, 'big');
    if (sc) return `<div class="hr-lkscreen" data-kind="${sc.kind}" data-key="${esc(sc.key)}">${sc.html}</div>`;
    if (d && d.where === 'desk' && d.st !== 'away') return `<div class="hr-lkscreen hr-lkdesk" data-key="desk">${iconHtml('🎒', { size: 28 })}<span>${esc(tw('atDesk'))}</span></div>`;
    return '';
  }
  return { query, take, paint, bigHtml, fit, boardOf: sid => W.boards[sid] || null, has: sid => !!(W.screens[sid] || W.boards[sid]) };
}
