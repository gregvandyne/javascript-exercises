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

const L = (k, v) => t(`js.companion-build.${k}`, v);
const ic = (e, size = 18) => iconHtml(e, { size });
const ICON = { game: '🎮', lesson: '📋', devices: '💻', board: '🖥️', show: '👀', hints: '💡', own: '🎯' };
const OPTIONS = { kind: ['game', 'lesson'], use: ['devices', 'board'], help: ['show', 'hints', 'own'] };
const ROWS = ['safe', 'plan', 'write', 'play', 'scan'];
const POLL_MS = 1500;

const S = { chat: null, picks: new Map(), told: new Map(), live: new Map(), pv: new Map(), asked: new Set(), playing: new Set(), timer: null };
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
const pvKey = (gameId, vid) => `${gameId}:${vid || ''}`;
function previewHtml(gameId, vid, title, { over = '', playable = true } = {}) {
  const key = pvKey(gameId, vid), pv = S.pv.get(key), playing = S.playing.has(key) && playable;
  const frame = pv ? `<iframe src="${esc(pv.url)}" title="${esc(L('previewOf', { title }))}" sandbox="${esc(pv.sandbox)}" allow="fullscreen; autoplay" allowfullscreen referrerpolicy="no-referrer" loading="lazy"${playing ? '' : ' tabindex="-1"'}></iframe>` : '';
  const tap = !playing && playable && !over ? `<button type="button" class="ocb-tap" data-c="act" data-act="buildTap" data-turn="" data-v="${esc(key)}">${ic('▶️', 16)} ${esc(L('tap'))}</button>` : '';
  return `<div class="ocb-pv${playing ? ' playing' : ''}" data-ocb-pv="${esc(key)}">${frame}${over}${tap}</div>`;
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
  const pv = j.mode === 'change' && j.baseId ? previewHtml(j.gameId, j.baseId, j.title, { over: `<div class="ocb-over"><b>${esc(L('vBuilding', { n: base + 1 }))}</b><span>${esc(L('vWorks', { n: base || 1 }))}</span></div>`, playable: false }) : '';
  return `<div class="oc-made oc-job ocb-game" aria-busy="true" data-ocb-job="${esc(j.id)}">${head}${pv}<div data-ocb-steps="${esc(j.id)}">${stepsHtml(rows)}</div><p class="ocb-usually">${esc(L('usually'))}</p></div>`;
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
  const say = `<p class="ocb-say" dir="auto">${esc(g.say || '')}</p>`;
  const big = `<a class="btn btn-sm" href="/studio/${encodeURIComponent(j.gameId)}">${ic('↗️', 16)} ${esc(L('btn.big'))}</a>`;
  const change = `<button type="button" class="btn btn-sm" data-c="act" data-act="buildChange" data-turn="${esc(x.id)}" data-v="${esc(j.id)}">${ic('✏️', 16)} ${esc(L('btn.change'))}</button>`;
  if (!g.versionId) return `<div class="oc-made oc-made-no ocb-game ocb-done" role="note">${say}${head}<div class="oc-acts">${change}${big}</div></div>`;
  const changed = (g.changed || []).length ? `<div class="ocb-changed"><b>${esc(L('changed'))}</b><ul>${g.changed.map(c => `<li dir="auto">${esc(c)}</li>`).join('')}</ul></div>` : '';
  const acts = `<div class="oc-acts"><button type="button" class="btn btn-sm btn-primary" data-c="act" data-act="buildPlay" data-turn="${esc(x.id)}" data-v="${esc(pvKey(j.gameId, g.versionId))}">${ic('▶️', 16)} ${esc(L('btn.play'))}</button>${change}${g.ok ? `<button type="button" class="btn btn-sm" data-c="act" data-act="buildAssign" data-turn="${esc(x.id)}" data-v="${esc(j.id)}">${ic('🎒', 16)} ${esc(L('btn.assign'))}</button><a class="btn btn-sm" href="/live?game=${encodeURIComponent(j.gameId)}">${ic('📡', 16)} ${esc(L('btn.host'))}</a>` : ''}${big}</div>`;
  return `<div class="oc-made ocb-game ocb-done${g.ok ? '' : ' ocb-warn'}" data-ocb-done="${esc(j.id)}">${say}${head}${previewHtml(j.gameId, g.versionId, j.title)}<p class="ocb-line">${g.ok ? ic('✓', 14) : ic('⚠️', 14)} ${esc(lineOf(g))}</p>${changed}${acts}</div>`;
}

// ---------------------------------------------------------------- taps
/** A tap on a build card. -> what companion.js's onAct returns (a result with chat, or null when handled here). */
export async function onAct(act, turn, btn) {
  const chat = S.chat; if (!chat) return null;
  if (act === 'buildTap' || act === 'buildPlay') {
    const key = btn && btn.dataset.v; if (!key) return null;
    S.playing.add(key);
    const el = document.querySelector(`[data-ocb-pv="${CSS.escape(key)}"]`);
    if (el) { el.classList.add('playing'); const tap = el.querySelector('.ocb-tap'); if (tap) tap.remove(); const f = el.querySelector('iframe'); if (f) { f.removeAttribute('tabindex'); f.focus(); } if (act === 'buildPlay' && el.requestFullscreen) el.requestFullscreen().catch(() => {}); }
    return null;
  }
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
  if (act === 'buildAssign') { if (job) setTimeout(() => chat.send(L('assignText', { title: job.title })), 0); return null; }
  const card = turn.note && turn.note.build;
  let value = '';
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
      } catch { /* the next tick asks again */ }
    }
    const vid = j.state === 'done' && j.game ? j.game.versionId : j.mode === 'change' ? j.baseId : null;
    if (vid) await preview(j.gameId, vid);
  }
}
/** This viewer's own preview address for one version (once), put into its card where it is on screen. */
async function preview(gameId, vid) {
  const key = pvKey(gameId, vid);
  if (S.pv.has(key) || S.asked.has(key)) return;
  S.asked.add(key);
  try {
    const r = await api(`/api/companion/build/${encodeURIComponent(gameId)}?v=${encodeURIComponent(vid)}`, { background: true });
    if (!r.preview) return;
    S.pv.set(key, r.preview);
    for (const el of S.chat.root.querySelectorAll(`[data-ocb-pv="${CSS.escape(key)}"]`)) {
      if (el.querySelector('iframe')) continue;
      const f = document.createElement('iframe');
      f.src = r.preview.url; f.title = L('previewOf', { title: r.title || '' }); f.setAttribute('sandbox', r.preview.sandbox); f.setAttribute('allow', 'fullscreen; autoplay'); f.setAttribute('allowfullscreen', ''); f.setAttribute('referrerpolicy', 'no-referrer');
      if (!S.playing.has(key)) f.tabIndex = -1;
      el.prepend(f);
    }
  } catch { S.asked.delete(key); }
}
