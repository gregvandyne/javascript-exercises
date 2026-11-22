// Oomba on the Manipulatives board (docs/decisions.md "Virtual math manipulatives: Oomba chat"; server:
// services/manip-chat.js). "Draft with AI" (and the Oomba button by the board's title) opens a chat with Oomba that knows
// the board on the screen. Laptops and tablets: a panel docked on the right, the board narrows beside it. Phones: a
// sheet over the lower part of the screen with a minimize control; minimized it is a round Oomba bubble at the bottom
// right, above the tab bar, with a dot when Oomba answered meanwhile. Escape minimizes.
// Each message is a job on the server: the page sends it and asks how it is going, so a refresh never loses it. A change
// Oomba makes is put on the board as one change (the board's own Undo, and "Undo Oomba's change" under the reply).
// Hosts only: manip.js attaches it on a teacher's own board; students never get it.
import { t, api, esc } from '/js/app.js';
import { TASKS } from '/js/manip-tasks.js';

/** The Oomba mark (public/icons/icon.svg): the yellow square with its two eyes. round: the bubble's circle. */
export const oombaMark = (size = 32, round = false) => `<svg class="mpc-mark" width="${size}" height="${size}" viewBox="0 0 240 240" aria-hidden="true" focusable="false"><rect width="240" height="240" rx="${round ? 120 : 56}" fill="#FFD23F"/><g transform="${round ? 'translate(24 24) scale(.8)' : ''}"><g fill="none" stroke="#141414" stroke-width="30"><circle cx="66" cy="120" r="36"/><circle cx="178" cy="120" r="36"/></g><g fill="#141414"><circle cx="73" cy="114" r="13"/><circle cx="185" cy="114" r="13"/></g></g></svg>`;

const POLL_MS = 2000;
const FAILS = ['timeout', 'busy', 'resting', 'restart', 'error'];
const SEND_ERRORS = ['names', 'words', 'personal', 'brief', 'chatBusy', 'badTool', 'notFound'];
const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const store = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* no storage */ } } };

let C = null;   // the attached board: { ctx, mode, chat, ... }

/**
 * The chat for the board on the screen. ctx: { slug, name, get() -> { boardId, title, state, empty }, snapshot() ->
 * what Undo brings back, apply(state, title) one change on the board, restore(snapshot), layout() (the board fits
 * again when the panel opens or closes), opener: the button focus goes back to }.
 */
export function attach(ctx) {
  detach();
  C = { ctx, mode: 'closed', chat: { turns: [], pending: null, grade: '' }, unread: false, waiting: null, timer: null, tick: null, undo: new Map(), undone: new Set(), local: new Map(), err: '', draft: '' };
  const root = document.createElement('div');
  root.id = 'mpc-root';
  root.innerHTML = `<aside class="mpc" id="mpc" aria-labelledby="mpc-title" hidden>
      <header class="mpc-head"><span class="mpc-av">${oombaMark(36)}</span><div class="mpc-who"><h2 id="mpc-title">${esc(t('js.manip-chat.title'))}</h2><p class="mpc-sub">${esc(t('js.manip-chat.knows', { tool: ctx.name }))}</p></div>
        <button type="button" class="mpc-hbtn" data-c="min" aria-label="${esc(t('js.manip-chat.minimize'))}" title="${esc(t('js.manip-chat.minimize'))}"><span aria-hidden="true">–</span></button>
        <button type="button" class="mpc-hbtn" data-c="close" aria-label="${esc(t('js.manip-chat.close'))}" title="${esc(t('js.manip-chat.close'))}"><span aria-hidden="true">✕</span></button></header>
      <div class="mpc-log" id="mpc-log" role="log" aria-live="polite" aria-relevant="additions text"></div>
      <form class="mpc-compose" id="mpc-form" autocomplete="off">
        <p class="mpc-err" id="mpc-err" role="alert" hidden></p>
        <div class="mpc-row"><label class="sr-only" for="mpc-in">${esc(t('js.manip-chat.inputLabel'))}</label>
          <textarea class="mpc-in" id="mpc-in" rows="1" maxlength="1000" dir="auto"></textarea>
          <button class="btn btn-primary mpc-send" type="submit" id="mpc-send">${esc(t('js.manip-chat.send'))}</button></div>
        <div class="mpc-foot"><label class="mpc-grade"><span>${esc(t('js.manip-chat.gradeLabel'))}</span> <select id="mpc-grade" class="input input-sm"><option value="">${esc(t('js.manip-chat.anyGrade'))}</option>${['K', '1', '2', '3', '4', '5', '6', '7', '8'].map(g => `<option value="${g}">${esc(t('js.manip-chat.grade', { grade: g }))}</option>`).join('')}</select></label>
          <span class="mpc-private">${esc(t('js.manip-chat.private'))}</span></div>
      </form></aside>
    <button type="button" class="mpc-bubble" id="mpc-bubble" hidden aria-label="${esc(t('js.manip-chat.reopen'))}">${oombaMark(56, true)}<span class="mpc-dot" hidden></span></button>`;
  document.body.appendChild(root);
  C.root = root;
  const $ = id => root.querySelector(`#${id}`);
  C.el = { panel: $('mpc'), log: $('mpc-log'), form: $('mpc-form'), input: $('mpc-in'), send: $('mpc-send'), err: $('mpc-err'), grade: $('mpc-grade'), bubble: $('mpc-bubble') };
  // The Oomba button by the board's title (the board's own toolbar keeps "Draft with AI", which opens the same chat).
  const head = document.querySelector('.mp-head');
  if (head) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mpc-open'; b.id = 'mpc-open'; b.setAttribute('aria-controls', 'mpc'); b.setAttribute('aria-expanded', 'false');
    b.innerHTML = `${oombaMark(26)}<span>${esc(t('js.manip-chat.button'))}</span>`;
    b.onclick = () => (C.mode === 'open' ? setMode('min') : open({ from: b }));
    head.appendChild(b); C.headBtn = b;
  }
  root.addEventListener('click', onClick);
  C.el.panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); setMode('min'); } });
  C.el.bubble.onclick = () => open({ from: C.el.bubble });
  C.el.form.onsubmit = e => { e.preventDefault(); sendText(C.el.input.value); };
  C.el.input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendText(C.el.input.value); } });
  C.el.input.addEventListener('input', () => { autosize(); C.draft = C.el.input.value; store.set(`mpc-draft:${ctx.slug}`, C.draft); });
  C.el.grade.onchange = () => { C.chat.grade = C.el.grade.value; };
  C.draft = store.get(`mpc-draft:${ctx.slug}`) || '';
  C.el.input.value = C.draft;
  load().then(() => { const m = store.get(`mpc:${ctx.slug}`); if (m === 'open' || m === 'min' || C.chat.pending) setMode(m === 'min' ? 'min' : 'open', { focus: false }); });
}
/** Leaving the board: the panel and bubble go (the conversation stays on the server). */
export function detach() {
  if (!C) return;
  clearInterval(C.timer); clearInterval(C.tick);
  C.root.remove(); if (C.headBtn) C.headBtn.remove();
  document.body.classList.remove('mpc-on');
  C = null;
}
export const isOpen = () => !!C && C.mode === 'open';
/** Opens the chat (Draft with AI, the Oomba button, the bubble). */
export function open({ from = null } = {}) {
  if (!C) return;
  if (from) C.opener = from;
  setMode('open');
}

function setMode(mode, { focus = true } = {}) {
  if (!C) return;
  // Closing while Oomba is answering keeps the bubble, so the answer has somewhere to show up.
  if (mode === 'closed' && C.chat.pending) mode = 'min';
  const was = C.mode; C.mode = mode;
  store.set(`mpc:${C.ctx.slug}`, mode);
  C.el.panel.hidden = mode !== 'open';
  C.el.bubble.hidden = mode !== 'min';
  if (mode === 'open') C.unread = false;
  C.el.bubble.querySelector('.mpc-dot').hidden = !C.unread;
  C.el.bubble.setAttribute('aria-label', t(C.unread ? 'js.manip-chat.reopenNew' : 'js.manip-chat.reopen'));
  document.body.classList.toggle('mpc-on', mode === 'open');
  if (C.headBtn) { C.headBtn.setAttribute('aria-expanded', String(mode === 'open')); C.headBtn.classList.toggle('on', mode === 'open'); }
  if (mode === 'open') { render(); autosize(); scrollDown(); if (focus) C.el.input.focus(); }
  else if (focus && was === 'open') (mode === 'min' ? C.el.bubble : (C.opener && C.opener.isConnected ? C.opener : C.headBtn))?.focus();
  if (was !== mode && (was === 'open' || mode === 'open')) requestAnimationFrame(() => C && C.ctx.layout());
}
function autosize() { const i = C.el.input; i.style.height = 'auto'; i.style.height = `${Math.min(140, i.scrollHeight + 4)}px`; }
function scrollDown() { const l = C.el.log; l.scrollTop = l.scrollHeight; }

// ---------------------------------------------------------------- talking to the server
const where = () => { const g = C.ctx.get(); return { tool: C.ctx.slug, boardId: g.boardId || null }; };
async function load() {
  try { const r = await api(`/api/manipulatives/chat?tool=${encodeURIComponent(C.ctx.slug)}${where().boardId ? `&boardId=${encodeURIComponent(where().boardId)}` : ''}`, { background: true }); took(r.chat, { initial: true }); }
  catch { /* the chat opens empty; sending works */ }
}
/** A new copy of the conversation from the server: new answers (applied when this page saw them coming), polling. */
function took(chat, { initial = false } = {}) {
  if (!C || !chat) return;
  const before = new Set(C.chat.turns.map(x => x.id));
  const sig = JSON.stringify([(chat.turns || []).map(x => [x.id, x.change && x.change.applied]), chat.pending && chat.pending.id]);
  const same = !initial && sig === C.sig; C.sig = sig;
  if (chat.pending) C.skew = Date.now() - chat.pending.now;
  if (same) return;
  C.chat = { ...chat, turns: chat.turns || [] };
  if (initial && C.chat.grade) C.el.grade.value = C.chat.grade;
  if (C.chat.pending && !C.waiting) C.waiting = C.chat.pending.id;   // a refresh mid-answer: this page waits for it too
  for (const x of C.chat.turns) {
    if (x.change && x.change.state) C.local.set(x.id, x.change);
    if (initial || before.has(x.id) || x.role !== 'oomba') continue;
    if (C.mode !== 'open') C.unread = true;
    if (x.change && x.change.state && !x.change.applied && C.waiting) applyTurn(x);
  }
  if (!C.chat.pending) C.waiting = null;
  if (C.chat.pending && !C.timer) { C.timer = setInterval(poll, POLL_MS); C.tick = setInterval(tickTime, 1000); }
  if (!C.chat.pending && C.timer) { clearInterval(C.timer); clearInterval(C.tick); C.timer = null; C.tick = null; }
  if (C.mode === 'min') setMode('min', { focus: false });
  render();
}
async function poll() {
  if (!C || C.polling) return;
  C.polling = true;
  try { const r = await api(`/api/manipulatives/chat?tool=${encodeURIComponent(C.ctx.slug)}${where().boardId ? `&boardId=${encodeURIComponent(where().boardId)}` : ''}`, { background: true }); took(r.chat); }
  catch { /* the next tick asks again */ } finally { if (C) C.polling = false; }
}
function tickTime() { const el = C && C.el.log.querySelector('[data-c-time]'); if (el) el.textContent = waitText(); }
const waitText = () => {
  const p = C.chat.pending; if (!p) return '';
  const el = Date.now() - (C.skew || 0) - p.at;
  return el > 30e3 ? t('js.manip-chat.longer', { time: mmss(el) }) : t('js.manip-chat.thinking', { time: mmss(el) });
};
async function sendText(raw, { retry = null } = {}) {
  if (!C) return;
  const text = String(raw || '').trim();
  showErr('');
  if (text.length < 2) { showErr(t('js.manip-chat.needText')); C.el.input.focus(); return; }
  if (C.chat.pending) { showErr(t('js.manip-chat.err.chatBusy')); return; }
  const g = C.ctx.get();
  C.el.send.disabled = true;
  try {
    const r = await api('/api/manipulatives/chat', { method: 'POST', body: { tool: C.ctx.slug, boardId: g.boardId || null, title: g.title || '', text, grade: C.el.grade.value, state: g.state, ...(retry ? { retry } : {}) } });
    if (!retry || C.el.input.value.trim() === text) { C.el.input.value = ''; C.draft = ''; store.set(`mpc-draft:${C.ctx.slug}`, ''); autosize(); }
    took(r.chat);
    C.waiting = r.chat.pending ? r.chat.pending.id : null;
    scrollDown();
  } catch (e) {
    // Refused before anything was stored or sent: the words stay in the box, and the reason is said.
    const code = e.data && e.data.code;
    if (retry && !C.el.input.value.trim()) { C.el.input.value = text; autosize(); }
    showErr(SEND_ERRORS.includes(code) ? t(`js.manip-chat.err.${code}`) : e.status === 429 ? t('js.manip-chat.err.slow') : e.message || t('js.manip-chat.err.other'));
  } finally { if (C) C.el.send.disabled = false; }
}
function showErr(msg) { if (!C) return; C.el.err.textContent = msg; C.el.err.hidden = !msg; }

// ---------------------------------------------------------------- changes on the board
function applyTurn(x) {
  const ch = C.local.get(x.id) || x.change; if (!ch || !ch.state) return;
  const snap = C.ctx.snapshot();
  C.ctx.apply(ch.state, ch.title);
  C.undo.set(x.id, snap); C.undone.delete(x.id);
  x.change.applied = true;
  api('/api/manipulatives/chat/applied', { method: 'POST', body: { ...where(), turnId: x.id }, background: true }).catch(() => {});
}
function undoTurn(id) {
  const snap = C.undo.get(id); if (!snap) return;
  C.ctx.restore(snap); C.undone.add(id);
}
function redoTurn(id) {
  const ch = C.local.get(id); if (!ch) return;
  const snap = C.ctx.snapshot(); C.ctx.apply(ch.state, ch.title); C.undo.set(id, snap); C.undone.delete(id);
}
function onClick(e) {
  const b = e.target.closest('[data-c]'); if (!b || !C) return;
  const k = b.dataset.c, id = b.dataset.id;
  if (k === 'min') return setMode('min');
  if (k === 'close') return setMode('closed');
  if (k === 'chip') { C.el.input.value = b.dataset.text; autosize(); C.el.input.focus(); return; }
  const turn = C.chat.turns.find(x => x.id === id);
  if (k === 'undo') { undoTurn(id); render(); C.el.log.querySelector(`[data-c="redo"][data-id="${id}"]`)?.focus(); return; }
  if (k === 'redo') { redoTurn(id); render(); C.el.log.querySelector(`[data-c="undo"][data-id="${id}"]`)?.focus(); return; }
  if (k === 'use' && turn) { applyTurn(turn); render(); return; }
  if (k === 'retry' && turn) return sendText(turn.text, { retry: turn.id });
  if (k === 'edit' && turn) { C.el.input.value = turn.text; autosize(); C.el.input.focus(); }
}

// ---------------------------------------------------------------- drawing the conversation
const failText = r => `${t(`js.manip-chat.fail.${FAILS.includes(r) ? r : 'error'}`)}`;
function changeCard(x) {
  const ch = x.change, undone = C.undone.has(x.id), canUndo = C.undo.has(x.id);
  const what = t('js.manip-chat.changed', { n: ch.n, steps: ch.steps });
  let action = '';
  if (canUndo && !undone) action = `<button type="button" class="btn btn-sm mpc-act" data-c="undo" data-id="${esc(x.id)}">↩ ${esc(t('js.manip-chat.undo'))}</button>`;
  else if (canUndo && undone) action = `<button type="button" class="btn btn-sm mpc-act" data-c="redo" data-id="${esc(x.id)}">${esc(t('js.manip-chat.redo'))}</button>`;
  else if (ch.state && !ch.applied) action = `<button type="button" class="btn btn-primary btn-sm mpc-act" data-c="use" data-id="${esc(x.id)}">${esc(t('js.manip-chat.use'))}</button>`;
  return `<div class="mpc-change${undone ? ' undone' : ''}"><p><b>${esc(undone ? t('js.manip-chat.undoneTitle') : t('js.manip-chat.changedTitle', { title: ch.title }))}</b> <span>${esc(undone ? '' : what)}${!undone && ch.capped ? ` ${esc(t('js.manip-chat.capped', { max: 12 }))}` : ''}</span></p>${action}</div>`;
}
function render() {
  if (!C || C.mode !== 'open') return;
  const log = C.el.log, atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const turns = C.chat.turns, g = C.ctx.get();
  const parts = [];
  const bot = (inner, cls = '') => `<div class="mpc-turn bot${cls}"><span class="mpc-av sm">${oombaMark(28)}</span><div class="mpc-msg bot">${inner}</div></div>`;
  if (!turns.length) {
    parts.push(bot(esc(t(g.empty ? 'js.manip-chat.helloEmpty' : 'js.manip-chat.hello', { tool: C.ctx.name }))));
    const tasks = g.empty ? (TASKS[C.ctx.slug] || []).slice(0, 3) : [];
    const ideas = tasks.length ? tasks.map(x => ({ label: x.title, text: `${x.title}: ${x.prompt}` }))
      : [t('js.manip-chat.idea.more'), t('js.manip-chat.idea.easier'), t('js.manip-chat.idea.steps')].map(s => ({ label: s, text: s }));
    parts.push(`<div class="mpc-chips" role="group" aria-label="${esc(t('js.manip-chat.ideas'))}">${ideas.map(x => `<button type="button" class="chip" data-c="chip" data-text="${esc(x.text)}">${esc(x.label)}</button>`).join('')}</div>`);
  }
  const lastFail = [...turns].reverse().find(x => x.role === 'oomba');
  for (const x of turns) {
    if (x.role === 'me') {
      const failed = lastFail && lastFail.failed && lastFail.for === x.id;
      parts.push(`<div class="mpc-turn me"><div class="mpc-msg me" dir="auto">${esc(x.text)}</div>${failed ? `<div class="mpc-again"><button type="button" class="btn btn-sm" data-c="retry" data-id="${esc(x.id)}">${esc(t('js.manip-chat.retry'))}</button><button type="button" class="btn btn-sm btn-ghost" data-c="edit" data-id="${esc(x.id)}">${esc(t('js.manip-chat.edit'))}</button></div>` : ''}</div>`);
    } else if (x.failed) {
      parts.push(`<div class="mpc-turn bot"><span class="mpc-av sm">${oombaMark(28)}</span><div class="mpc-msg bot calm">${esc(failText(x.failed))}</div></div>`);
    } else {
      parts.push(bot(`<span dir="auto">${esc(x.text)}</span>${x.note === 'notBuilt' ? `<span class="mpc-note">${esc(t('js.manip-chat.notBuilt'))}</span>` : ''}${x.change ? changeCard(x) : ''}`));
    }
  }
  if (C.chat.pending) parts.push(`<div class="mpc-turn bot mpc-wait"><span class="mpc-av sm">${oombaMark(28)}</span><div class="mpc-msg bot"><span class="mpc-dots" aria-hidden="true"><i></i><i></i><i></i></span> <span data-c-time>${esc(waitText())}</span><span class="mpc-note">${esc(t('js.manip-chat.leave'))}</span></div></div>`);
  log.innerHTML = parts.join('');
  C.el.input.placeholder = t(turns.length || !g.empty ? 'js.manip-chat.placeholder' : 'js.manip-chat.placeholderEmpty');
  C.el.send.disabled = !!C.chat.pending;
  if (atEnd || C.chat.pending) scrollDown();
}
