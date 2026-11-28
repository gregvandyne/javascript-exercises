// The Builder in the Oomba chat (docs/decisions.md "Builder in the chat (phase 2)"; services/companion-build.js): the
// cards public/js/companion.js draws for a game built in the chat.
//   - the ask card: each question a stack of choice cards (icon, bold label, one plain line), the picked one checked; the
//     picks stay in this page until "Show me the plan";
//   - the plan card: what students do, the teacher's own words for the Builder in a box they may edit (sent as they are),
//     Build it (one tap, one of today's builds) and Change;
//   - the game's job card: while it builds, the Builder's real steps (GET /api/companion/build/:gameId every 1.5 s) and
//     a thin bar by steps done; when it is done, Oomba's words about what was checked, the game's own sandboxed preview
//     (16:10, "Tap to play"; its address is minted for this viewer), the version line and Play, Change, Assign, Host
//     live, Open big. A change by message shows the version before it, with "Version 2 building…" over it.
import { t, api, esc } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import * as BUS from '/js/oomba-bus.js';

const L = (k, v) => t(`js.companion-build.${k}`, v);
/** Studio with Oomba (docs/decisions.md "Builder in the chat (phase 3)"): the game open in Studio, whose big preview is
 *  beside the chat ({ id, shown: the version on screen }), or null on any other page. Its cards are compact there. */
const studio = () => { const a = BUS.page(); const g = a && typeof a.game === 'function' ? a.game() : null; return g && g.id ? g : null; };
const inStudio = gameId => { const g = studio(); return !!g && g.id === gameId; };
const ic = (e, size = 18) => iconHtml(e, { size });
const ICON = { game: '🎮', lesson: '📋', devices: '💻', board: '🖥️', show: '👀', hints: '💡', own: '🎯' };
const OPTIONS = { kind: ['game', 'lesson'], use: ['devices', 'board'], help: ['show', 'hints', 'own'] };
const ROWS = ['safe', 'plan', 'write', 'play', 'scan'];
const POLL_MS = 1500;

const S = { chat: null, picks: new Map(), told: new Map(), live: new Map(), pv: new Map(), asked: new Set(), playing: new Set(), timer: null,
  // the done card's Versions: each game's versions (newest first), and the version a card shows (job id -> version id)
  vers: new Map(), cardV: new Map(), states: new Map(), newsAt: 0 };
/** The chat panel (oomba-chat.js mountChat), once mounted. */
export function setChat(chat) {
  S.chat = chat;
  // What the teacher types in a plan's box stays while the panel redraws (it goes only with Build it).
  chat.root.addEventListener('input', e => { const el = e.target.closest && e.target.closest('textarea[data-ocb-told]'); if (el) S.told.set(el.dataset.ocbTold, el.value); });
  if (!S.timer) S.timer = setInterval(poll, POLL_MS);
  setTimeout(poll, 0);
}
const turns = () => ((S.chat && S.chat.state().chat && S.chat.state().chat.turns) || []);
const gameJobs = () => turns().flatMap(x => ((x.note && x.note.jobs) || []).filter(j => j.kind === 'game' && j.gameId).map(j => ({ x, j })));

// ---------------------------------------------------------------- the ask and plan cards
const gradeText = g => (!g ? '' : g === 'K' ? L('gradeK') : L('grade', { g }));
const picksOf = (x, card) => ({ ...(card.pick || {}), ...(S.picks.get(x.id) || {}) });
export function cardHtml(x, card) {
  if (card.state === 'classPick' || card.state === 'classPicked') return classHtml(x, card);
  if (card.state === 'ask' || card.state === 'answered') return askHtml(x, card);
  return planHtml(x, card);
}
function askHtml(x, card) {
  const p = picksOf(x, card), open = card.state === 'ask';
  if (!open) {
    const list = ['kind', 'use', 'help'].filter(k => card.pick && card.pick[k]).map(k => L(k === 'kind' ? `opt.${card.pick[k]}.label` : `short.${card.pick[k]}`).replace(/\.$/, ''));
    return `<div class="oc-ask done ocb-ask"><p class="oc-hsub">${ic('✓', 14)} ${esc(L('answered', { list: list.join(' · ') }))}</p></div>`;
  }
  const qs = card.asked.filter(k => !(k !== 'kind' && p.kind === 'lesson'));
  const fs = qs.map(k => `<fieldset class="ocb-q"><legend>${esc(L(`q.${k}`))}</legend><div class="ocb-opts" role="radiogroup" aria-label="${esc(L(`q.${k}`))}">${OPTIONS[k].map(o => {
    const on = p[k] === o;
    return `<button type="button" class="ocb-opt${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-c="act" data-act="buildPick" data-turn="${esc(x.id)}" data-v="${k}:${o}"><span class="ocb-oi" aria-hidden="true">${ic(ICON[o], 24)}</span><span class="ocb-ot"><b>${esc(L(`opt.${o}.label`))}</b><span>${esc(L(`opt.${o}.text`))}</span></span><span class="ocb-ck" aria-hidden="true">${on ? ic('✓', 14) : ''}</span></button>`;
  }).join('')}</div></fieldset>`).join('');
  const ready = qs.every(k => p[k]);
  return `<div class="oc-hand ocb-ask" data-ocb="${esc(card.id)}">${fs}<div class="oc-acts"><button type="button" class="btn btn-sm btn-primary" data-c="act" data-act="buildPlan" data-turn="${esc(x.id)}"${ready ? '' : ' aria-disabled="true"'}>${esc(L('showPlan'))}</button></div></div>`;
}
/** Assign on a done card, for a teacher with several classes: which class first (then the assign card). */
function classHtml(x, card) {
  const list = card.classes || [];
  if (card.state !== 'classPick') {
    const c = list.find(y => y.id === card.picked);
    return `<div class="oc-ask done ocb-ask"><p class="oc-hsub">${ic('✓', 14)} <span dir="auto">${esc(c ? c.name : '')}</span></p></div>`;
  }
  return `<div class="oc-hand ocb-ask" data-ocb="${esc(card.id)}"><fieldset class="ocb-q"><legend dir="auto">${esc(L('asg.pick', { title: card.title || '' }))}</legend><div class="ocb-opts">${list.map(c => `<button type="button" class="ocb-opt" data-c="act" data-act="buildClass" data-turn="${esc(x.id)}" data-v="${esc(c.id)}"><span class="ocb-oi" aria-hidden="true">${ic('🎒', 22)}</span><span class="ocb-ot"><b dir="auto">${esc(c.name)}</b></span></button>`).join('')}</div></fieldset></div>`;
}
function planHtml(x, card) {
  const p = card.pick || {};
  const sub = [L('planKind'), gradeText(card.grade), p.use ? L(`short.${p.use}`) : '', p.help ? L(`short.${p.help}`) : ''].filter(Boolean).join(' · ');
  const head = `<h4>${ic('🎮', 18)} <span dir="auto">${esc(card.title || '')}</span></h4><p class="oc-hsub">${esc(sub)}</p><ul class="ocb-does">${(card.does || []).map(d => `<li dir="auto">${esc(d)}</li>`).join('')}</ul>`;
  if (card.state !== 'plan') {
    const note = card.state === 'built' ? L('sent') : L('redone');
    return `<div class="oc-hand ocb-plan done">${head}<p class="ocb-tl">${esc(L('tell'))}</p><div class="oc-brief" dir="auto">${esc(card.told || card.words || '')}</div><p class="oc-hsub">${ic('✓', 14)} ${esc(note)}</p></div>`;
  }
  const told = S.told.has(card.id) ? S.told.get(card.id) : card.words || '';
  const left = Number(card.left) || 0;
  return `<div class="oc-hand ocb-plan" data-ocb="${esc(card.id)}">${head}
    <label class="ocb-tl" for="ocb-told-${esc(card.id)}">${esc(L('tell'))}</label>
    <textarea class="ocb-told" id="ocb-told-${esc(card.id)}" data-ocb-told="${esc(card.id)}" rows="3" maxlength="2000" dir="auto">${esc(told)}</textarea>
    <div class="oc-acts"><button type="button" class="btn btn-sm btn-primary" data-c="act" data-act="buildGo" data-turn="${esc(x.id)}"${left > 0 ? '' : ' disabled'}>${ic('🔨', 16)} ${esc(L('build'))}</button><button type="button" class="btn btn-sm" data-c="act" data-act="buildRedo" data-turn="${esc(x.id)}">${esc(L('change'))}</button></div>
    <p class="ocb-uses">${esc(left > 0 ? L('uses', { left }) : L('noneLeft'))}</p></div>`;
}

// ---------------------------------------------------------------- the game's card
const defaultRows = j => ROWS.map((k, i) => ({ k, state: i === 0 && j.state === 'running' ? 'now' : 'todo' }));
function stepsHtml(rows) {
  const done = rows.filter(r => r.state === 'done').length;
  const li = rows.map(r => `<li class="ocb-s ${r.state}"><span class="ocb-sd" aria-hidden="true">${r.state === 'done' ? '✓' : r.state === 'now' ? '●' : '○'}</span><span>${esc(L(`steps.${r.k}`))}</span>${r.state === 'now' ? `<span class="sr-only">…</span>` : ''}</li>`).join('');
  return `<ol class="ocb-steps">${li}</ol><div class="ocb-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${rows.length}" aria-valuenow="${done}" aria-label="${esc(L('steps.write'))}"><i style="width:${Math.round(done / rows.length * 100)}%"></i></div>`;
}
const pvKey = (gameId, vid, slot = '') => `${gameId}:${vid || ''}${slot ? `:${slot}` : ''}`;
/** The preview's place in the card: an empty box of the right size. The game's frame itself lives in a layer outside
 *  the chat's redrawn HTML (frames() below), laid over this box, so a redraw never reloads a game being played. */
function previewHtml(gameId, vid, title, { over = '', playable = true, slot = '' } = {}) {
  const key = pvKey(gameId, vid, slot);
  return `<div class="ocb-pv" data-ocb-pv="${esc(key)}" data-game="${esc(gameId)}" data-v="${esc(vid)}" data-title="${esc(title)}" data-play="${playable ? 1 : 0}" data-over="${esc(over)}" role="img" aria-label="${esc(L('previewOf', { title }))}"></div>`;
}
const FAILS = ['limit', 'resting', 'tooMany', 'disabled', 'restarting', 'gone', 'notAllowed', 'restart', 'error'];
export function jobHtml(x, j) {
  const head = `<h4>${ic('🎮', 18)} <span dir="auto">${esc(j.title || '')}</span></h4>`;
  if (j.state === 'failed') {
    const again = j.retried ? '' : `<div class="oc-acts"><button type="button" class="btn btn-sm" data-c="act" data-act="jobRetry" data-turn="${esc(x.id)}" data-v="${esc(j.id)}">${esc(L('retry'))}</button></div>`;
    return `<div class="oc-made oc-made-no oc-job ocb-game" role="note">${head}<p>${ic('⚠️', 16)} ${esc(L(`fail.${FAILS.includes(j.error) ? j.error : 'error'}`))}</p>${again}</div>`;
  }
  if (j.state === 'done' && j.game) return doneHtml(x, j, head);
  const live = S.live.get(j.gameId);
  const rows = (live && live.rows) || defaultRows(j);
  const base = Number(j.base) || 0;
  const pv = j.mode === 'change' && j.baseId && !inStudio(j.gameId) ? previewHtml(j.gameId, j.baseId, j.title, { over: `${L('vBuilding', { n: base + 1 })}\n${L('vWorks', { n: base || 1 })}`, playable: false, slot: `busy-${j.id}` }) : '';
  return `<div class="oc-made oc-job ocb-game" aria-busy="true" data-ocb-job="${esc(j.id)}">${head}${pv}<div data-ocb-steps="${esc(j.id)}">${stepsHtml(rows)}</div><p class="ocb-usually" data-ocb-eta="${esc(j.id)}">${esc(etaLine(live && live.eta))}</p></div>`;
}
let minutesF = null;
/** 2 -> "2 minutes", (2, 6) -> "2–6 minutes", in the reader's language (the browser's own plurals and ranges). */
function minutes(lo, hi = lo) {
  try {
    const loc = document.documentElement.lang || undefined;
    if (!minutesF) minutesF = new Intl.NumberFormat(loc, { style: 'unit', unit: 'minute', unitDisplay: 'long' });
    if (lo === hi) return minutesF.format(hi);
    return typeof minutesF.formatRange === 'function' ? minutesF.formatRange(lo, hi) : `${new Intl.NumberFormat(loc).format(lo)}-${minutesF.format(hi)}`;
  } catch { return lo === hi ? `${hi} min` : `${lo}-${hi} min`; }
}
/** The card's time line from the build's own estimate (GET /api/companion/build/:gameId eta: recent real builds of this
 *  kind, or a first guess that says "About"); before the first answer, no number at all. */
function etaLine(e) {
  if (!e) return L('usually');
  if (e.show === 'under') return L('etaUnder');
  const time = e.show === 'range' ? minutes(e.lo, e.hi) : minutes(e.hi);
  return L(e.guess ? 'etaGuess' : 'etaRange', { time });
}
function lineOf(g) {
  const parts = [L('line.version', { n: g.number })];
  if (g.played === 'pass') parts.push(g.views && g.views.length ? L('line.sizes', { count: g.views.length }) : L('line.played'));
  else parts.push(L(g.played === 'fail' ? 'line.playFail' : 'line.noPlay'));
  parts.push(L(g.scan === 'pass' ? 'line.scanPass' : 'line.scanFail'));
  return parts.join(' · ');
}
function doneHtml(x, j, head) {
  const g = j.game;
  if (g.versionId && inStudio(j.gameId)) return compactHtml(x, j, head);
  const say = `<p class="ocb-say" dir="auto">${esc(g.say || '')}</p>`;
  const big = `<a class="btn btn-sm" href="/studio/${encodeURIComponent(j.gameId)}">${ic('↗️', 16)} ${esc(L('btn.big'))}</a>`;
  const change = `<button type="button" class="btn btn-sm" data-c="act" data-act="buildChange" data-turn="${esc(x.id)}" data-v="${esc(j.id)}">${ic('✏️', 16)} ${esc(L('btn.change'))}</button>`;
  const again = g.why === 'nothing' && !j.again ? `<button type="button" class="btn btn-sm btn-primary" data-c="act" data-act="buildAgain" data-turn="${esc(x.id)}" data-v="${esc(j.id)}">${ic('🔁', 16)} ${esc(L('retry'))}</button>` : '';
  if (!g.versionId) return `<div class="oc-made oc-made-no ocb-game ocb-done" role="note">${say}${head}<div class="oc-acts">${again}${change}${big}</div></div>`;
  // Versions: the card shows the version it made, or an earlier one picked here (S.cardV); the newest is the one a
  // change by message changes.
  const list = S.vers.get(j.gameId) || [];
  const vid = list.some(v => v.id === S.cardV.get(j.id)) ? S.cardV.get(j.id) : g.versionId;
  const shownN = (list.find(v => v.id === vid) || {}).number || g.number;
  const vpick = list.length > 1 ? `<label class="ocb-vers"><span>${ic('🕘', 14)} ${esc(L('versions'))}</span><select data-ocb-vers="${esc(j.id)}" data-game="${esc(j.gameId)}" aria-label="${esc(L('versions'))}">${list.map(v => `<option value="${esc(v.id)}"${v.id === vid ? ' selected' : ''}>${esc(L('versionOf', { n: v.number, total: list[0].number }))}</option>`).join('')}</select></label>` : '';
  const changed = (g.changed || []).length ? `<div class="ocb-changed"><b>${esc(L('changed'))}</b><ul>${g.changed.map(c => `<li dir="auto">${esc(c)}</li>`).join('')}</ul></div>` : '';
  const acts = `<div class="oc-acts"><button type="button" class="btn btn-sm btn-primary" data-c="act" data-act="buildPlay" data-turn="${esc(x.id)}" data-v="${esc(pvKey(j.gameId, vid))}">${ic('▶️', 16)} ${esc(L('btn.play'))}</button>${change}${g.ok ? `<button type="button" class="btn btn-sm" data-c="act" data-act="buildAssign" data-turn="${esc(x.id)}" data-v="${esc(j.id)}">${ic('🎒', 16)} ${esc(L('btn.assign'))}</button><a class="btn btn-sm" href="/live?game=${encodeURIComponent(j.gameId)}">${ic('📡', 16)} ${esc(L('btn.host'))}</a>` : ''}${big}</div>`;
  const line = vid === g.versionId ? `<p class="ocb-line">${g.ok ? ic('✓', 14) : ic('⚠️', 14)} ${esc(lineOf(g))}</p>` : `<p class="ocb-line">${ic('🕘', 14)} ${esc(L('olderShown', { n: shownN, newest: g.number }))}</p>`;
  return `<div class="oc-made ocb-game ocb-done${g.ok ? '' : ' ocb-warn'}" data-ocb-done="${esc(j.id)}">${say}${head}${previewHtml(j.gameId, vid, j.title)}${vpick}${line}${changed}${acts}</div>`;
}

/** The done card in Studio: no preview (the big one is beside the chat), "Showing big on the left" for the version on
 *  screen (Show it big for another), the checks' line, what changed, and Change, Assign and Host live. */
function compactHtml(x, j, head) {
  const g = j.game, st = studio();
  const shown = st && st.shown === g.versionId;
  const where = shown ? `<p class="ocb-big">${ic('🖥️', 16)} ${esc(L(window.matchMedia('(min-width: 961px)').matches ? 'showingBig' : 'showingBigAbove'))}</p>` : `<div class="oc-acts"><button type="button" class="btn btn-sm" data-c="act" data-act="buildShow" data-turn="${esc(x.id)}" data-v="${esc(g.versionId)}">${ic('🖥️', 16)} ${esc(L('btn.showBig'))}</button></div>`;
  const changed = (g.changed || []).length ? `<div class="ocb-changed"><b>${esc(L('changed'))}</b><ul>${g.changed.map(c => `<li dir="auto">${esc(c)}</li>`).join('')}</ul></div>` : '';
  const change = `<button type="button" class="btn btn-sm" data-c="act" data-act="buildChange" data-turn="${esc(x.id)}" data-v="${esc(j.id)}">${ic('✏️', 16)} ${esc(L('btn.change'))}</button>`;
  const acts = `<div class="oc-acts">${g.ok ? `<button type="button" class="btn btn-sm btn-primary" data-c="act" data-act="buildAssign" data-turn="${esc(x.id)}" data-v="${esc(j.id)}">${ic('🎒', 16)} ${esc(L('btn.assign'))}</button><a class="btn btn-sm" href="/live?game=${encodeURIComponent(j.gameId)}">${ic('📡', 16)} ${esc(L('btn.host'))}</a>` : ''}${change}</div>`;
  return `<div class="oc-made ocb-game ocb-done ocb-compact${g.ok ? '' : ' ocb-warn'}" data-ocb-done="${esc(j.id)}">${`<p class="ocb-say" dir="auto">${esc(g.say || '')}</p>`}${head}${where}<p class="ocb-line">${g.ok ? ic('✓', 14) : ic('⚠️', 14)} ${esc(lineOf(g))}</p>${changed}${acts}</div>`;
}

// ---------------------------------------------------------------- taps
/** A tap on a build card. -> what companion.js's onAct returns (a result with chat, or null when handled here). */
export async function onAct(act, turn, btn) {
  const chat = S.chat; if (!chat) return null;
  if (act === 'buildPlay') { const key = btn && btn.dataset.v; if (key) play(key, true); return null; }
  if (act === 'buildShow') { const a = BUS.page(); if (a && a.show && btn && btn.dataset.v) a.show(btn.dataset.v); return null; }
  if (!turn) return null;
  if (act === 'buildPick') {
    const [k, o] = String((btn && btn.dataset.v) || '').split(':');
    if (!OPTIONS[k] || !OPTIONS[k].includes(o)) return null;
    S.picks.set(turn.id, { ...(S.picks.get(turn.id) || {}), [k]: o });
    chat.render();
    const again = chat.root.querySelector(`[data-turn="${CSS.escape(turn.id)}"][data-v="${k}:${o}"]`); if (again) again.focus();
    return null;
  }
  const job = (turn.note && turn.note.jobs || []).find(j => j.id === (btn && btn.dataset.v));
  if (act === 'buildChange') {
    const box = chat.root.querySelector('#oc-in') || document.getElementById('oc-in');
    if (box) { box.value = L('changeText', { title: (job && job.title) || '' }); box.dispatchEvent(new Event('input')); box.focus(); try { box.setSelectionRange(box.value.length, box.value.length); } catch { /* not a text box */ } }
    return null;
  }
  const card = turn.note && turn.note.build;
  let value = '';
  // Assign (the game is shared with the class on the assign card's own Assign), Try again, a class picked
  if ((act === 'buildAssign' || act === 'buildAgain') && job) value = job.id;
  if (act === 'buildClass') value = String((btn && btn.dataset.v) || '');
  if (act === 'buildPlan' && card) {
    const p = picksOf(turn, card);
    const need = card.asked.filter(k => !(k !== 'kind' && p.kind === 'lesson'));
    if (!need.every(k => p[k])) { chat.showErr(L('err.needPick')); return null; }
    value = JSON.stringify(p);
  }
  if (act === 'buildGo' && card) {
    const box = document.getElementById(`ocb-told-${card.id}`);
    value = (box ? box.value : S.told.get(card.id) || card.words || '').slice(0, 2000);
  }
  try {
    const r = await api('/api/companion/build/act', { method: 'POST', body: { turnId: turn.id, act, value } });
    if (act === 'buildGo' && card) S.told.delete(card.id);
    setTimeout(poll, 50);
    return r;
  } catch (e) { chat.showErr(e.message); return null; }
}

// ---------------------------------------------------------------- the live steps and previews
async function poll() {
  if (!S.chat || document.hidden) return;
  const list = gameJobs();
  for (const { j } of list) {
    if ((j.state === 'queued' || j.state === 'running') && j.gameId) {
      try {
        const r = await api(`/api/companion/build/${encodeURIComponent(j.gameId)}`, { background: true });
        if (r.rows) S.live.set(j.gameId, r);
        const box = S.chat.root.querySelector(`[data-ocb-steps="${CSS.escape(j.id)}"]`);
        if (box && r.rows) box.innerHTML = stepsHtml(r.rows);
        const line = S.chat.root.querySelector(`[data-ocb-eta="${CSS.escape(j.id)}"]`);
        if (line && r.rows) line.textContent = etaLine(r.eta);
      } catch { /* the next tick asks again */ }
    }
    const vid = j.state === 'done' && j.game ? (S.cardV.get(j.id) || j.game.versionId) : j.mode === 'change' ? j.baseId : null;
    if (vid) await preview(j.gameId, vid);
    if (j.state === 'done' && j.game && j.game.versionId && !inStudio(j.gameId)) await versionsOf(j.gameId, j.game.versionId);
  }
  readyNotice(list);
  frames();
}
/** The game's versions for the done card's Versions (read again when a newer version lands). */
async function versionsOf(gameId, newest) {
  const have = S.vers.get(gameId);
  if (have && have.some(v => v.id === newest)) return;
  if (S.asked.has(`vers:${gameId}:${newest}`)) return;
  S.asked.add(`vers:${gameId}:${newest}`);
  try {
    const r = await api(`/api/companion/build/${encodeURIComponent(gameId)}`, { background: true });
    if (Array.isArray(r.versions)) { S.vers.set(gameId, r.versions); if (r.versions.length > 1 && S.chat) S.chat.render(); }
  } catch { S.asked.delete(`vers:${gameId}:${newest}`); }
}
/** "Your game is ready" (the layout's own notice), when a game's card is done (first seen done on this page, or turned
 *  done while it is open): the build ended while the teacher was here, on any page, or just before. The server tells
 *  each build once (the layout marks what it showed when the page opened), so asking again never repeats it. */
function readyNotice(list) {
  let fresh = false;
  for (const { j } of list) {
    const was = S.states.get(j.id);
    S.states.set(j.id, j.state);
    if (was !== 'done' && j.state === 'done') fresh = true;
  }
  if (!fresh || Date.now() - S.newsAt < 3000) return;
  S.newsAt = Date.now();
  const g = studio();
  api(`/api/companion/build/news${g ? `?not=${encodeURIComponent(g.id)}` : ''}`, { background: true }).then(r => {
    if (!r || !r.html) return;
    const main = document.getElementById('main'); if (!main) return;
    const p = document.createElement('p');
    p.className = `notice ${r.kind === 'stopped' ? 'warn' : 'good'} pagenote ocb-news`;
    p.setAttribute('role', 'status');
    p.innerHTML = `${ic({ ready: '✨', question: '💬', stopped: '⚠️' }[r.kind] || '✨', 20)} ${r.html}`;
    main.prepend(p);
  }).catch(() => { /* the next page's layout says it */ });
}
// A version picked on a done card: that version in the card's preview (this viewer's own address, made once).
document.addEventListener('change', e => {
  const sel = e.target && e.target.closest && e.target.closest('select[data-ocb-vers]');
  if (!sel || !S.chat) return;
  S.cardV.set(sel.dataset.ocbVers, sel.value);
  preview(sel.dataset.game, sel.value).then(() => { if (S.chat) S.chat.render(); });
  S.chat.render();
  const again = S.chat.root.querySelector(`select[data-ocb-vers="${CSS.escape(sel.dataset.ocbVers)}"]`); if (again) again.focus();
});
/** This viewer's own preview address for one version (once). */
async function preview(gameId, vid) {
  const key = pvKey(gameId, vid);
  if (S.pv.has(key) || S.asked.has(key)) return;
  S.asked.add(key);
  try {
    const r = await api(`/api/companion/build/${encodeURIComponent(gameId)}?v=${encodeURIComponent(vid)}`, { background: true });
    if (r.preview) { S.pv.set(key, r.preview); frames(); }
  } catch { S.asked.delete(key); }
}

// ---------------------------------------------------------------- the frames, kept alive across redraws
// The chat redraws its whole log (a new message, a job ending, polling), which would reload any frame inside it and
// restart a game mid-play. So each game frame lives in one layer outside the log (on <body>, fixed, clipped to the
// log), one frame per preview place (game + version, plus a slot for a change's "building" card), and is laid over
// its box after every redraw, scroll and resize. A frame is made once and loads again only for a new version.
const F = new Map();   // key -> { wrap, frame, tap }
let layer = null;
const logEl = () => (S.chat && (S.chat.root.querySelector('.oc-log') || document.getElementById('oc-log'))) || null;
function ensureLayer() {
  if (layer && layer.isConnected) return layer;
  layer = document.createElement('div');
  layer.className = 'ocb-layer';
  document.body.append(layer);
  const log = logEl();
  if (log) {
    log.addEventListener('scroll', () => sync(), { passive: true });
    new MutationObserver(() => frames()).observe(log, { childList: true, subtree: true });
    if (window.ResizeObserver) new ResizeObserver(() => sync()).observe(log);
    const panel = log.closest('.oc') || log.parentElement;
    if (panel) new MutationObserver(() => sync()).observe(panel, { attributes: true, subtree: true, attributeFilter: ['hidden', 'class', 'style', 'aria-expanded'] });
  }
  window.addEventListener('resize', () => sync());
  window.addEventListener('scroll', () => sync(), { passive: true });   // the chat docked in a page (Studio) scrolls with it
  document.addEventListener('fullscreenchange', () => sync());
  return layer;
}
/** A frame for every preview box now in the log (made once per key), then each laid over its box. */
function frames() {
  const log = logEl(); if (!log) return;
  ensureLayer();
  for (const box of log.querySelectorAll('[data-ocb-pv]')) {
    const key = box.dataset.ocbPv;
    const pv = S.pv.get(pvKey(box.dataset.game, box.dataset.v));
    if (!pv) { preview(box.dataset.game, box.dataset.v); continue; }
    if (!F.has(key)) F.set(key, makeFrame(key, pv, box));
  }
  sync();
}
function makeFrame(key, pv, box) {
  const wrap = document.createElement('div');
  wrap.className = 'ocb-pvl'; wrap.dataset.key = key;
  const frame = document.createElement('iframe');
  frame.title = L('previewOf', { title: box.dataset.title || '' });
  frame.setAttribute('sandbox', pv.sandbox); frame.setAttribute('allow', 'fullscreen; autoplay'); frame.setAttribute('allowfullscreen', ''); frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.tabIndex = -1;
  frame.dataset.loads = '0';
  frame.addEventListener('load', () => { frame.dataset.loads = String(Number(frame.dataset.loads) + 1); });
  frame.src = pv.url;
  wrap.append(frame);
  let tap = null;
  if (box.dataset.over) {
    const over = document.createElement('div'); over.className = 'ocb-over';
    const [a, b] = box.dataset.over.split('\n');
    const strong = document.createElement('b'); strong.textContent = a || '';
    const span = document.createElement('span'); span.textContent = b || '';
    over.append(strong, span); wrap.append(over);
  } else if (box.dataset.play === '1') {
    tap = document.createElement('button'); tap.type = 'button'; tap.className = 'ocb-tap';
    tap.innerHTML = `${ic('▶️', 16)} ${esc(L('tap'))}`;
    tap.addEventListener('click', () => play(key, false));
    wrap.append(tap);
  }
  // Scrolling the chat over a preview that is not being played scrolls the chat, as it would over the box.
  wrap.addEventListener('wheel', e => { if (wrap.classList.contains('playing')) return; const log = logEl(); if (log) { log.scrollTop += e.deltaY; e.preventDefault(); } }, { passive: false });
  let ty = null;
  wrap.addEventListener('touchstart', e => { ty = wrap.classList.contains('playing') ? null : e.touches[0].clientY; }, { passive: true });
  wrap.addEventListener('touchmove', e => { if (ty === null) return; const log = logEl(); const y = e.touches[0].clientY; if (log) log.scrollTop += ty - y; ty = y; }, { passive: true });
  layer.append(wrap);
  return { wrap, frame, tap };
}
/** Play: the frame takes taps and keys (and, from the Play button, the whole screen). */
function play(key, full) {
  frames();
  const f = F.get(key); if (!f) return;
  S.playing.add(key);
  f.wrap.classList.add('playing');
  if (f.tap) { f.tap.remove(); f.tap = null; }
  f.frame.removeAttribute('tabindex'); f.frame.focus();
  if (full && f.wrap.requestFullscreen) f.wrap.requestFullscreen().catch(() => {});
}
/** Each frame over its box, clipped to the log's visible part; a frame whose box is not in the log is hidden, kept. */
function sync() {
  const log = logEl(); if (!layer || !log) return;
  const lr = log.getBoundingClientRect();
  const z = Number(getComputedStyle(log.closest('.oc') || log).zIndex) || 45;
  Object.assign(layer.style, { left: `${lr.left}px`, top: `${lr.top}px`, width: `${lr.width}px`, height: `${lr.height}px`, zIndex: String(z + 1) });
  const hist = document.getElementById('oc-hist');   // the chat history list covers the log while it is open
  const shown = lr.width > 0 && lr.height > 0 && getComputedStyle(log).visibility !== 'hidden' && !(hist && !hist.hidden && hist.getBoundingClientRect().height > 0);
  for (const [key, f] of F) {
    if (document.fullscreenElement === f.wrap) { f.wrap.hidden = false; continue; }
    const box = shown ? log.querySelector(`[data-ocb-pv="${CSS.escape(key)}"]`) : null;
    if (!box) { f.wrap.hidden = true; continue; }
    const r = box.getBoundingClientRect();
    f.wrap.hidden = false;
    Object.assign(f.wrap.style, { left: `${r.left - lr.left}px`, top: `${r.top - lr.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }
}
