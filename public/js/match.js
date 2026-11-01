// Online matches on the play page (server/routes/match.js; docs/sdk.md "Online matches").
// - openLobby(): the "Play online" sheet a game opens with BRB.match.menu(): invite friends or family, make a code, enter one.
// - startRelay(): in a match (?match=<id>), the page relays between the game frame's private port and the server
//   (long-poll for the other player's events, POST for ours), and shows the waiting card until they join.
// Game events are numbers and booleans only; this page checks them again before sending (the server checks a third time).
import { api, toast, sheet, $, t, esc } from '/js/app.js';

const DATA_KEY = /^[a-z]{1,2}$/;
function cleanData(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const keys = Object.keys(d); if (keys.length > 8) return null;
  const out = {};
  for (const k of keys) { const v = d[k]; if (!DATA_KEY.test(k) || !(typeof v === 'boolean' || (Number.isInteger(v) && v >= 0 && v <= 9999))) return null; out[k] = v; }
  return out;
}
const go = url => { location.href = url; };

/** The "Play online" sheet. */
export async function openLobby(d) {
  let people = [], guest = false;
  try { const r = await api(`/api/match/people?game=${encodeURIComponent(d.gameId)}`); people = r.people; guest = r.guest; } catch (e) { toast(e.message, { bad: true }); return; }
  let invites = []; try { invites = (await api('/api/match/inbox', { background: true })).invites.filter(i => i.game.slug === d.slug); } catch { /* none */ }
  const row = p => `<li class="mt-person"><span class="mt-av" aria-hidden="true">${esc(p.avatar)}</span><span class="mt-name"><bdi>${esc(p.name)}</bdi>${p.playing ? `<small class="mt-on"><span class="dot" aria-hidden="true"></span>${esc(t('js.match.playingNow'))}</small>` : p.kind === 'family' ? `<small>${esc(t('js.match.family'))}</small>` : ''}</span><button class="btn btn-primary btn-sm" type="button" data-invite="${esc(p.id)}">${esc(t('js.match.invite'))}</button></li>`;
  const inv = i => `<li class="mt-person mt-invite"><span class="mt-av" aria-hidden="true">${esc(i.from.avatar)}</span><span class="mt-name">${esc(t('js.match.wantsToPlay', { name: i.from.name }))}</span><button class="btn btn-primary btn-sm" type="button" data-accept="${esc(i.id)}">${esc(t('js.match.play'))}</button></li>`;
  const content = `
    ${invites.length ? `<h3 class="mt-h">${esc(t('js.match.invitesForYou'))}</h3><ul class="mt-list">${invites.map(inv).join('')}</ul>` : ''}
    <h3 class="mt-h">${esc(t('js.match.friendsHeading'))}</h3>
    ${people.length ? `<ul class="mt-list">${people.map(row).join('')}</ul>`
      : `<p class="muted small">${esc(guest ? t('js.match.guestNoFriends') : t('js.match.noFriends'))}${guest ? '' : ` <a href="/friends">${esc(t('js.match.friendsPage'))}</a>`}</p>`}
    <h3 class="mt-h">${esc(t('js.match.codeHeading'))}</h3>
    <p class="muted small">${esc(t('js.match.codeHint'))}</p>
    <div class="mt-code-row"><button class="btn" type="button" id="mt-make"><span aria-hidden="true">🔑</span> ${esc(t('js.match.makeCode'))}</button></div>
    <form class="mt-code-row" id="mt-join" novalidate>
      <label class="sr-only" for="mt-code">${esc(t('js.match.enterCode'))}</label>
      <input class="input codeinput" id="mt-code" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" placeholder="${esc(t('js.match.codePlaceholder'))}">
      <button class="btn btn-primary" type="submit">${esc(t('js.match.join'))}</button>
    </form>
    <p class="err" id="mt-err" role="alert"></p>`;
  const s = sheet({ title: t('js.match.title', { title: d.title }), content });
  const err = $('#mt-err', s.el);
  const busy = async (btn, fn) => { if (btn) btn.disabled = true; err.textContent = ''; try { const r = await fn(); if (r && r.redirect) go(r.redirect); } catch (e) { err.textContent = e.message; if (btn) btn.disabled = false; } };
  s.el.addEventListener('click', e => {
    const b = e.target.closest('[data-invite],[data-accept],#mt-make'); if (!b) return;
    if (b.dataset.invite) busy(b, () => api('/api/match', { method: 'POST', body: { game: d.gameId, invite: b.dataset.invite } }));
    else if (b.dataset.accept) busy(b, () => api(`/api/match/${encodeURIComponent(b.dataset.accept)}/accept`, { method: 'POST', body: {} }));
    else busy(b, () => api('/api/match', { method: 'POST', body: { game: d.gameId } }));
  });
  $('#mt-join', s.el).addEventListener('submit', e => {
    e.preventDefault();
    const code = $('#mt-code', s.el).value;
    if (!code.trim()) { err.textContent = t('js.match.typeCode'); return; }
    busy(e.submitter, () => api('/api/match/join', { method: 'POST', body: { code } }));
  });
}

/** In a match: the waiting card, and the relay between the frame's port and the server. */
export function startRelay(d, stage) {
  const M = d.match; let port = null, after = 0, stamp = '', oppOn = null, started = false, ended = false, queue = [];
  const card = document.createElement('div'); card.className = 'mt-wait'; card.hidden = true; stage.appendChild(card);
  const toFrame = m => { if (port) port.postMessage(m); else queue.push(m); };
  const backToGame = () => go(`/play/${d.slug}`);
  const leave = async () => { ended = true; try { await api(`/api/match/${encodeURIComponent(M.id)}/leave`, { method: 'POST', body: {} }); } catch { /* gone already */ } backToGame(); };

  function showWait(v) {
    card.hidden = false;
    card.innerHTML = `<div class="mt-wait-box" role="status">
      ${v.code ? `<p>${esc(t('js.match.shareCode'))}</p><p class="bigcode" dir="ltr">${esc(v.code)}</p><p class="muted small">${esc(t('js.match.shareHint', { title: d.title }))}</p>`
        : `<p class="mt-wait-name">${esc(t('js.match.waitingFor', { name: v.waitingFor || '' }))}</p>`}
      <p class="mt-dots" aria-hidden="true"><i></i><i></i><i></i></p>
      <button class="btn" type="button" id="mt-cancel">${esc(t('js.match.cancel'))}</button></div>`;
    $('#mt-cancel', card).addEventListener('click', leave);
  }
  function apply(v) {
    if (v.state === 'waiting') { showWait(v); toFrame({ t: 'wait' }); }
    if (v.state !== 'waiting') card.hidden = true;
    if (!started && v.opp && v.state !== 'waiting') {
      started = true;
      toFrame({ t: 'go', seat: v.seat, me: { name: v.me.name }, opp: { name: v.opp.name, character: v.opp.character || null }, hist: v.ev.map(e => [e[1], e[2], e[3]]) });
    } else if (started) {
      for (const e of v.ev) if (e[1] !== v.seat) toFrame({ t: 'ev', f: e[1], k: e[2], d: e[3] });
    }
    after = v.n;
    if (started && v.opp && v.opp.on !== oppOn && v.state === 'playing') { if (oppOn !== null || !v.opp.on) toFrame({ t: 'opp', on: v.opp.on }); oppOn = v.opp.on; }
    if (v.state === 'ended' && !ended) {
      ended = true;
      if (v.left) toFrame({ t: 'left' });
      else if (!started) { toast(t('js.match.ended')); setTimeout(backToGame, 1500); }
    }
  }
  let ctl = null;
  async function poll() {
    let fails = 0;
    while (!ended) {
      ctl = new AbortController(); const mine = ctl;
      try {
        const v = await api(`/api/match/${encodeURIComponent(M.id)}/wait?after=${after}&k=${encodeURIComponent(stamp)}`, { background: true, signal: mine.signal });
        if (mine.signal.aborted) continue;
        stamp = `${v.state}:${v.n}:${v.opp ? 1 : 0}`; fails = 0; apply(v);
      } catch (e) {
        if (mine.signal.aborted) continue;
        if (e.status === 410 || e.status === 404) { ended = true; toFrame({ t: 'left' }); toast(t('js.match.ended')); return; }
        fails++; await new Promise(r => setTimeout(r, Math.min(15000, 1000 * 2 ** fails)));
      }
    }
  }
  // The frame's port (from its first brb:ready). Its own events go to the server; 'leave' leaves the match.
  function attach(p) {
    port = p;
    p.onmessage = async e => {
      const m = e.data; if (!m || typeof m !== 'object') return;
      if (m.t === 'leave') return leave();
      if (m.t !== 'ev' || (m.k !== 'mv' && m.k !== 'act')) return;
      const dd = cleanData(m.d); if (!dd || ended) return;
      try { await api(`/api/match/${encodeURIComponent(M.id)}/send`, { method: 'POST', body: { k: m.k, d: dd }, active: true }); } catch (err) { toast(err.message, { bad: true }); }
    };
    const q = queue; queue = []; q.forEach(m => p.postMessage(m));
  }
  // A reloaded frame gets a new port: start it over from the whole history.
  function reattach(p) { started = false; queue = []; after = 0; stamp = ''; oppOn = null; attach(p); if (ctl) ctl.abort(); }
  poll();
  return { attach: p => (port ? reattach(p) : attach(p)) };
}
