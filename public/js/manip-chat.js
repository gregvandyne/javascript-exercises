// The Manipulatives board's workflow in Oomba, the site's one companion chat (docs/decisions.md "Oomba teaching
// companion: one chat everywhere"; public/js/oomba-bus.js, public/js/companion.js; server: services/companion.js with
// services/manip-chat.js). It replaces the board's own chat panel. On a host's board the companion knows the board
// ("Sees: Clocks board") and can change it with changeBoard: the first message on an empty board is the brief, every
// later one adjusts the board ("make it 4 clocks", "use quarter hours"). Every message carries the board as it is now;
// the server builds the AI's view of it (kinds and numbers only, never notes, pen marks or typed text).
// A change Oomba makes is put on the board as one change when this page sent the message (or watched it run after a
// refresh), with Undo and Redo under the answer and the board's own Undo; an answer that came while the page was
// closed offers "Put it on my board". Hosts only: manip.js attaches it on a teacher's own board; students never get it.
import { t, api, esc } from '/js/app.js';
import * as BUS from '/js/oomba-bus.js';

let A = null;   // the attached board: { ctx, waiting, undo: Map, undone: Set }

/** ctx: { slug, name, get() -> { boardId, title, state, empty }, snapshot(), apply(state, title), restore(snapshot), layout() } */
export function attach(ctx) {
  A = { ctx, waiting: false, undo: new Map(), undone: new Set(), failed: new Set() };
  const here = m => !!(m && m.tool === ctx.slug);
  BUS.setPage({
    kind: 'manip',
    page: () => { const g = ctx.get(); return { type: 'manip', tool: ctx.slug, ...(g.boardId ? { boardId: g.boardId } : {}) }; },
    body: () => { const g = ctx.get(); A.waiting = true; return { board: { tool: ctx.slug, boardId: g.boardId || null, title: g.title || '', state: g.state } }; },
    label: () => { const g = ctx.get(); return g.title ? `${ctx.name} · ${g.title}` : t('js.manip-chat.boardOf', { tool: ctx.name }); },
    hello: () => t(ctx.get().empty ? 'js.manip-chat.greetLine' : 'js.manip-chat.greetLineHas', { tool: ctx.name }),
    placeholder: c => t(c.turns.length || !ctx.get().empty ? 'js.manip-chat.placeholder' : 'js.manip-chat.placeholderEmpty'),
    note: x => (x.note && x.note.manip ? card(x) : ''),
    onAct(act, turn) {
      if (!turn || !turn.note || !turn.note.manip) return undefined;
      if (act === 'mundo') { undo(turn.id); return null; }
      if (act === 'mredo') { redo(turn); return null; }
      if (act === 'muse') { put(turn); return null; }
      return undefined;
    },
    onAnswer(x) { if (x.note && x.note.manip && here(x.note.manip) && A.waiting && !x.note.manip.applied) put(x); A.waiting = false; },
    // A refresh mid-answer: this page waits for it too when it was sent from this tool.
    onSync(c) { if (c.pending && !A.waiting) { const me = c.turns.find(y => y.id === c.pending.me); if (me && me.meta && me.meta.page && me.meta.page.tool === ctx.slug) A.waiting = true; } },
    onMode: () => requestAnimationFrame(() => A && A.ctx.layout()),
  });
}
export function detach() { if (A) { BUS.setPage(null); A = null; } }
/** Draft with AI: opens Oomba (the panel's first message on an empty board is the brief). */
export function open() { BUS.whenChat(c => c.setMode('open')); }
/** A brief from the board's old drafter (Try again after a draft that failed): Oomba opens with the words in its box. */
export function ask(text) {
  BUS.whenChat(c => { c.setMode('open'); const box = document.getElementById('oc-in'); if (box && text) { box.value = text; box.dispatchEvent(new Event('input')); } });
}
/** The live room's teacher view: Oomba knows it is there (it does not change the room's boards). */
export function attachLive(label) {
  A = null;
  BUS.setPage({ kind: 'manip-live', page: () => ({ type: 'manip-live' }), label: () => label || t('js.manip-chat.liveRoom') });
}

function put(x) {
  const m = x.note.manip; if (!m || !m.state || !A) return;
  const snap = A.ctx.snapshot();
  // Checked work: a board the page could not put on is put back as it was, and the card says so (never "changed").
  const want = typeof m.state === 'string' ? JSON.parse(m.state) : m.state;
  try { A.ctx.apply(want, m.title); } catch { try { A.ctx.restore(snap); } catch { /* as it is */ } A.failed.add(x.id); rerender(); return; }
  // Read back from the page: a board that asked for a change but reads exactly as before did not take it (put back, and
  // the card says so). Only then does the server hear it is on the board (manipApplied), and the card say "updated".
  const now = A.ctx.snapshot(), key = v => JSON.stringify(v);
  if (key(now.state) === key(snap.state) && key(want) !== key(snap.state)) { try { A.ctx.restore(snap); } catch { /* as it is */ } A.failed.add(x.id); rerender(); return; }
  A.failed.delete(x.id);
  A.undo.set(x.id, snap); A.undone.delete(x.id);
  m.applied = true;
  api('/api/companion/chat/act', { method: 'POST', body: { turnId: x.id, act: 'manipApplied' }, background: true }).catch(() => {});
  rerender();
}
function undo(id) { const snap = A && A.undo.get(id); if (!snap) return; A.ctx.restore(snap); A.undone.add(id); rerender(); }
function redo(x) { const m = x.note.manip; if (!A || !m.state) return; const snap = A.ctx.snapshot(); A.ctx.apply(typeof m.state === 'string' ? JSON.parse(m.state) : m.state, m.title); A.undo.set(x.id, snap); A.undone.delete(x.id); rerender(); }
const rerender = () => BUS.whenChat(c => c.render());
/** "What changed" under one of Oomba's answers on this board, with Undo, Redo or "Put it on my board". */
function card(x) {
  const ch = x.note.manip, undone = !!A && A.undone.has(x.id), canUndo = !!A && A.undo.has(x.id), here = !!A && ch.tool === A.ctx.slug;
  const what = t('js.manip-chat.changed', { n: ch.n, steps: ch.steps });
  let action = '';
  if (canUndo && !undone) action = `<button type="button" class="btn btn-sm" data-c="act" data-act="mundo" data-turn="${esc(x.id)}">↩ ${esc(t('js.manip-chat.undo'))}</button>`;
  else if (canUndo && undone) action = `<button type="button" class="btn btn-sm" data-c="act" data-act="mredo" data-turn="${esc(x.id)}">${esc(t('js.manip-chat.redo'))}</button>`;
  else if (here && ch.state && !ch.applied) action = `<button type="button" class="btn btn-primary btn-sm" data-c="act" data-act="muse" data-turn="${esc(x.id)}">${esc(t('js.manip-chat.use'))}</button>`;
  if (A && A.failed.has(x.id)) return `<div class="oc-change"><div class="oc-verify" role="note"><p><b>${esc(t('js.manip-chat.notPut'))}</b></p></div></div>`;
  // Not confirmed by a board page yet (another page, or before it was put on): never "updated".
  if (!ch.applied && !canUndo && !undone) return `<div class="oc-change"><p><b>${esc(t('js.manip-chat.notYet'))}</b><br><span>${esc(what)}</span></p>${action}</div>`;
  return `<div class="oc-change${undone ? ' undone' : ''}"><p><b>${esc(undone ? t('js.manip-chat.undoneTitle') : t('js.manip-chat.changedTitle', { title: ch.title }))}</b>${undone ? '' : '<br>'}<span>${esc(undone ? '' : what)}${!undone && ch.capped ? ` ${esc(t('js.manip-chat.capped', { max: 12 }))}` : ''}</span></p>${action}</div>`;
}
