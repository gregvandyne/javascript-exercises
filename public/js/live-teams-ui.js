// Oomba Live teams UI (docs/live-protocol.md "Part 3 hooks"), shared by the projector's Teams sheet, the teacher's
// dashboard and the class teams editor on the class page. Columns per team (shape, icon, name, size) with big player
// chips. Two ways to move a player, both always there:
//  - select then move (keyboard, switch, tap): activate a chip (aria-pressed), every other team shows "Move here";
//    activate one to move the player; focus returns to the chip in its new column; Escape cancels;
//  - drag (pointer events: mouse, touch, whiteboard pens): a ghost chip follows, the column under it gets a thick
//    dashed outline (never colour alone), letting go over a column moves the player.
// Each move is announced in a polite live region. Colour is never the only cue: every column and chip shows the shape
// and the team name.
import { shapeSvg, paintTeam, fill } from '/js/live-common.js';

/**
 * board({ root, unassigned?, live?, presets, text, onMove(seat, k), drawAvatar?(el, seat) }) ->
 *   { render({ list: [{k, p}], of: Map(seat -> k), seats: [{seat, name}], unassigned: bool, warn? }), cancel() }
 * text: { moveHere, empty, unassigned, moved ({name}, {team}), size ({count}), selectHint? }
 */
export function board({ root, unassigned = null, live = null, presets, text, onMove, drawAvatar = null }) {
  let state = { list: [], of: new Map(), seats: [], unassigned: false }, selected = 0, focusSeat = 0;
  const nameOf = seat => { const x = state.seats.find(s => s.seat === seat); return x ? x.name : ''; };
  const teamName = k => { const t = state.list.find(x => x.k === k); return t && presets[t.p] ? presets[t.p].name : text.unassigned; };

  function chip(seat) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lv-chip'; b.dataset.seat = seat;
    b.setAttribute('aria-pressed', String(selected === seat));
    const av = document.createElement('span'); av.className = 'lv-chip-avatar'; av.setAttribute('aria-hidden', 'true');
    if (drawAvatar) drawAvatar(av, seat);
    const nm = document.createElement('span'); nm.className = 'lv-chip-name'; nm.textContent = nameOf(seat);
    b.append(av, nm);
    return b;
  }
  function column(t) {
    const p = presets[t.p], sec = document.createElement('section'); sec.className = 'lv-team'; paintTeam(sec, p, t.k);
    const members = state.seats.filter(s => state.of.get(s.seat) === t.k);
    const h = document.createElement('h3'); h.className = 'lv-team-head';
    const ic = document.createElement('span'); ic.className = 'lv-team-icon'; ic.setAttribute('aria-hidden', 'true'); ic.textContent = p.icon;
    const nm = document.createElement('span'); nm.className = 'lv-team-name'; nm.textContent = p.name;
    const sz = document.createElement('span'); sz.className = 'lv-team-size'; sz.textContent = fill(text.size, { count: members.length });
    h.append(shapeSvg(p.shape), ic, nm, sz);
    const chips = document.createElement('div'); chips.className = 'lv-chips';
    for (const s of members) chips.append(chip(s.seat));
    const empty = document.createElement('p'); empty.className = 'small muted lv-team-empty'; empty.textContent = text.empty; empty.hidden = members.length > 0;
    const mv = document.createElement('button'); mv.type = 'button'; mv.className = 'btn btn-sm lv-move-here'; mv.dataset.lvMove = t.k;
    mv.textContent = text.moveHere; mv.setAttribute('aria-label', `${text.moveHere}: ${p.name}`);
    mv.hidden = !selected || state.of.get(selected) === t.k;
    sec.append(h, chips, empty, mv);
    return sec;
  }
  function render(next) {
    if (next) state = { ...state, ...next };
    if (selected && !state.seats.some(s => s.seat === selected)) selected = 0;
    // a redraw (the server's tms) keeps the keyboard focus where it was: on the same chip, or the same team's button
    const act = document.activeElement, inside = act && (root.contains(act) || (unassigned && unassigned.contains(act)));
    if (inside && !focusSeat && act.dataset.seat) focusSeat = +act.dataset.seat;
    const focusMove = inside && act.dataset.lvMove ? act.dataset.lvMove : '';
    root.textContent = '';
    for (const t of state.list) if (presets[t.p]) root.append(column(t));
    root.dataset.cols = String(state.list.length);
    if (unassigned) {
      const loose = state.seats.filter(s => !state.of.get(s.seat));
      unassigned.hidden = !state.unassigned || !loose.length;
      const box = unassigned.querySelector('.lv-chips') || unassigned; box.textContent = '';
      for (const s of loose) box.append(chip(s.seat));
    }
    if (focusSeat) { const c = root.querySelector(`.lv-chip[data-seat="${focusSeat}"]`) || (unassigned && unassigned.querySelector(`.lv-chip[data-seat="${focusSeat}"]`)); if (c) c.focus(); focusSeat = 0; }
    else if (focusMove) { const b = root.querySelector(`[data-lv-move="${focusMove}"]:not([hidden])`); if (b) b.focus(); }
  }
  function select(seat) {
    selected = selected === seat ? 0 : seat;
    render();
    const c = root.querySelector(`.lv-chip[data-seat="${seat}"]`) || (unassigned && unassigned.querySelector(`.lv-chip[data-seat="${seat}"]`));
    if (c) c.focus();
  }
  function move(seat, k) {
    if (!seat || !k || state.of.get(seat) === k) return;
    const name = nameOf(seat);
    selected = 0; focusSeat = seat;
    // shown at once (the server's tms confirms it)
    state.of = new Map(state.of); state.of.set(seat, k);
    render();
    if (live) { live.textContent = ''; setTimeout(() => { live.textContent = fill(text.moved, { name, team: teamName(k) }); }, 30); }
    onMove(seat, k);
  }
  function cancel() { if (selected) { const s = selected; selected = 0; render(); const c = root.querySelector(`.lv-chip[data-seat="${s}"]`); if (c) c.focus(); } }

  // clicks: chips select, "Move here" moves
  const onClick = e => {
    if (dragged) { dragged = false; return; }
    const mv = e.target.closest('[data-lv-move]'); if (mv) { move(selected, +mv.dataset.lvMove); return; }
    const c = e.target.closest('.lv-chip'); if (c) select(+c.dataset.seat);
  };
  root.addEventListener('click', onClick);
  if (unassigned) unassigned.addEventListener('click', onClick);
  const onKey = e => { if (e.key === 'Escape' && selected) { e.preventDefault(); e.stopPropagation(); cancel(); } };
  root.addEventListener('keydown', onKey);
  if (unassigned) unassigned.addEventListener('keydown', onKey);

  // drag: pointer events on the chips; a ghost follows; the column under the pointer is the target
  let drag = null, dragged = false;
  const colAt = (x, y) => { const el = document.elementFromPoint(x, y); const col = el && el.closest && el.closest('.lv-team'); return col && root.contains(col) ? col : null; };
  const onDown = e => {
    const c = e.target.closest('.lv-chip'); if (!c || e.button > 0) return;
    drag = { seat: +c.dataset.seat, x: e.clientX, y: e.clientY, el: c, ghost: null, over: null, id: e.pointerId };
  };
  const onMoveP = e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      try { drag.el.setPointerCapture(e.pointerId); } catch { /* ok */ }
      drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('lv-chip-ghost'); drag.ghost.setAttribute('aria-hidden', 'true');
      document.body.append(drag.ghost); drag.el.classList.add('is-dragging');
    }
    e.preventDefault();
    drag.ghost.style.insetInlineStart = ''; drag.ghost.style.left = `${e.clientX - 40}px`; drag.ghost.style.top = `${e.clientY - 24}px`;
    const col = colAt(e.clientX, e.clientY);
    if (col !== drag.over) { if (drag.over) drag.over.classList.remove('is-drop'); drag.over = col; if (col) col.classList.add('is-drop'); }
  };
  const onUp = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.ghost) return;
    d.ghost.remove(); d.el.classList.remove('is-dragging'); if (d.over) d.over.classList.remove('is-drop');
    dragged = true; setTimeout(() => { dragged = false; }, 0);
    const col = colAt(e.clientX, e.clientY);
    if (col && col.dataset.team) move(d.seat, +col.dataset.team);
  };
  for (const el of [root, unassigned].filter(Boolean)) { el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMoveP); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp); }

  return { render, cancel, move, get selected() { return selected; } };
}

/**
 * The team board: one bar per team, ranked, with shape, icon, name, score (and "per player" in average mode).
 * ol: the list; rows: [{k, p, score, rank, size}] (rank 0 = no members / ranks hidden); text: { perPlayer, none?, rank? }.
 */
export function teamBars(ol, rows, presets, { scoring = 'avg', text = {}, ranks = true } = {}) {
  if (!ol) return;
  ol.textContent = '';
  const sorted = rows.slice().sort((a, b) => ((a.rank || 99) - (b.rank || 99)) || (b.score - a.score) || (a.k - b.k));
  const max = Math.max(1, ...sorted.map(r => r.score || 0));
  for (const r of sorted) {
    const p = presets[r.p]; if (!p) continue;
    const li = document.createElement('li'); li.className = 'lv-tbar'; paintTeam(li, p, r.k);
    const rank = document.createElement('span'); rank.className = 'lv-tbar-rank'; rank.textContent = ranks && r.rank ? String(r.rank) : '–';
    const ic = document.createElement('span'); ic.className = 'lv-team-icon'; ic.setAttribute('aria-hidden', 'true'); ic.textContent = p.icon;
    const nm = document.createElement('span'); nm.className = 'lv-team-name'; nm.textContent = p.name;
    const sc = document.createElement('span'); sc.className = 'lv-tbar-score'; sc.textContent = `${r.score || 0}${scoring === 'avg' && text.perPlayer ? ` ${text.perPlayer}` : ''}`;
    const bar = document.createElement('span'); bar.className = 'lv-tbar-fill'; bar.style.setProperty('--w', `${Math.round(100 * (r.score || 0) / max)}%`); bar.setAttribute('aria-hidden', 'true');
    li.append(rank, shapeSvg(p.shape), ic, nm, sc, bar);
    if (!r.size && text.none) li.classList.add('is-empty');
    ol.append(li);
  }
}
