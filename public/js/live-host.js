// /live/host/:sid (server/views/live.js hostBody; docs/live-protocol.md). The projector page: the big code, QR and
// address, the roster (portraits and names, marks for ready, late, watching and offline; Remove asks first; no links,
// profiles or messages anywhere), the host controls (real buttons with keyboard shortcuts, shown by phase), and the
// game's own host view in a sandboxed frame (role host: the game draws a spectator view, e.g. the cinematic camera of
// the shared 3D world and the leaderboard). The game's live settings (Oomba.live.ready) go to the server as rdy.cfg.
import { connect, gameFrame, readJson, portraits, avatarCanvas, playerOf, nameOf, fill } from '/js/live-common.js';

const D = readJson('lv-host-data');
const $ = id => document.getElementById(id);
const roster = $('lv-roster'), tpl = $('lv-player-tpl'), stage = $('lv-stage');
const players = new Map();
let phase = 'lobby', seq = 0, locked = false, sock = null, frame = null, wel = null, frameReq = new Map(), max = D.max;
const pics = portraits(D.kit);
const nm = n => nameOf(D.nicks || [], n);
const SHOW = {
  lobby: ['start', 'lock', 'unlock', 'end'], loading: ['end'], countdown: ['end'],
  playing: ['pause', 'next', 'skip', 'end'], paused: ['resume', 'end'], between: ['next', 'end'], ended: [],
};

sock = connect({
  tok: D.tok,
  onMessage,
  onState(st) { document.body.classList.toggle('lv-offline', st === 'retry'); },
  onClock() { if (frame) frame.clock(sock.serverNow()); },
});
setInterval(() => { if (frame && sock) frame.clock(sock.serverNow()); }, 5000);

function frameToken(f) {
  return new Promise(res => { frameReq.set(f, res); if (!sock.send('fr', { f })) res(null); setTimeout(() => { if (frameReq.get(f) === res) { frameReq.delete(f); res(null); } }, 8000); });
}
function onMessage(m) {
  switch (m.t) {
    case 'wel': welcome(m); break;
    case 'fr': { const r = frameReq.get(m.f); if (r) { frameReq.delete(m.f); r(m.tok); } return; }
    case 'pj': case 'pu': { const p = playerOf(m.p); players.set(p.seat, p); drawPlayer(p); count(); break; }
    case 'pl': { players.delete(m.n); const li = roster.querySelector(`[data-seat="${m.n}"]`); if (li) li.remove(); count(); break; }
    case 'ph': onPhase(m); break;
    case 'lk': setLocked(m.locked); return;
    case 'rp': { const r = $('lv-reports'); if (r) r.hidden = false; return; }
    case 'res': location.href = D.results; return;
    case 'bye': if (m.why !== 'ended') document.body.classList.add('lv-offline'); return;
    default: break;
  }
  if (frame) frame.send(m);
}

function welcome(m) {
  wel = m; phase = m.phase; seq = m.seq; max = m.max || max;
  players.clear(); roster.textContent = '';
  for (const P of m.players || []) { const p = playerOf(P); players.set(p.seat, p); drawPlayer(p); }
  count(); setLocked(m.locked);
  if (!frame || !frame.el) {
    const kind = m.lobbyFrame && phase === 'lobby' ? 'lobby' : 'game';
    loadFrame(kind, kind === 'lobby' ? m.lobbyFrame : m.frame);
  }
  onPhase(m, true);
}
function loadFrame(kind, token) {
  if (!frame) frame = gameFrame({
    stage, role: 'host', title: D.title,
    getToken: f => frameToken(f),
    // The game's own live settings (Oomba.live.ready(opts)) go to the server with the host's rdy.
    onReady: ({ cfg }) => { sock.send('rdy', cfg ? { view: '3d', cfg } : { view: '3d' }); frame.clock(sock.serverNow()); },
    onOut: (t2, m) => sock.send(t2, m),
  });
  frame.load(token, kind, '3d');
  if (wel) { frame.send(wel); frame.clock(sock.serverNow()); }
}

async function onPhase(m, first = false) {
  phase = m.phase; if (m.seq) seq = m.seq;
  const show = SHOW[phase] || [];
  for (const b of document.querySelectorAll('[data-lv-act]')) {
    const a = b.dataset.lvAct;
    b.hidden = !show.includes(a) || (a === 'lock' && locked) || (a === 'unlock' && !locked) || (a === 'skip' && wel && wel.mode === 'game');
  }
  const al = $('lv-autolock'); if (al) al.hidden = phase !== 'lobby' || locked;
  document.body.dataset.phase = phase;
  if (phase === 'loading' && frame && frame.kind === 'lobby' && !first) { const tok = await frameToken('game'); if (tok) loadFrame('game', tok); }
  // In a game, the code box gets out of the way once play starts (Show code brings it back).
  $('lv-joinbox').classList.toggle('is-small', !['lobby'].includes(phase));
}
function setLocked(on) {
  locked = !!on;
  for (const b of document.querySelectorAll('[data-lv-act="lock"], [data-lv-act="unlock"]')) b.hidden = !(SHOW[phase] || []).includes(b.dataset.lvAct) || (b.dataset.lvAct === 'lock' ? locked : !locked);
  $('lv-joinbox').classList.toggle('is-locked', locked);
}
function count() {
  const n = [...players.values()].length;
  const el = $('lv-count'); if (el) el.textContent = fill(D.text.count, { count: n, max });
  const empty = $('lv-empty'); if (empty) empty.hidden = n > 0;
}
function drawPlayer(p) {
  let li = roster.querySelector(`[data-seat="${p.seat}"]`);
  if (!li) {
    li = tpl.content.firstElementChild.cloneNode(true); li.dataset.seat = p.seat;
    const cv = avatarCanvas('lv-av', 40); li.querySelector('.lv-p-avatar').append(cv); pics.draw(cv, p.avatar, 40);
    li.querySelector('[data-lv-kick]').dataset.lvKick = p.seat;
    roster.append(li);
  }
  li.querySelector('.lv-p-name').textContent = nm(p.name);
  const marks = [];
  if (p.ready && phase !== 'lobby') marks.push(`✓ ${D.text.ready}`);
  if (p.late) marks.push(D.text.late);
  if (!p.connected) marks.push(D.text.offline);
  li.querySelector('.lv-p-marks').textContent = marks.join(' · ');
  li.classList.toggle('is-off', !p.connected);
  const kick = li.querySelector('[data-lv-kick]');
  kick.setAttribute('aria-label', `${kick.textContent.trim()}: ${nm(p.name)}`);
}

// ---- controls ----
function act(a, extra = {}) {
  if (a === 'end' && !confirm(document.querySelector('[data-lv-act="end"]').dataset.confirm)) return;
  const msg = { a, ...extra };
  if (a === 'next' || a === 'skip') msg.at = seq;
  sock.send('h', msg);
}
$('lv-controls').addEventListener('click', e => { const b = e.target.closest('[data-lv-act]'); if (b && !b.hidden) act(b.dataset.lvAct); });
roster.addEventListener('click', e => {
  const b = e.target.closest('[data-lv-kick]'); if (!b) return;
  if (!confirm(D.text.removeConfirm)) return;
  act('kick', { n: +b.dataset.lvKick });
});
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test((e.target && e.target.tagName) || '')) return;
  const k = e.key.toUpperCase();
  const b = [...document.querySelectorAll('[data-lv-act]')].find(x => !x.hidden && x.getAttribute('aria-keyshortcuts') === k);
  if (b) { e.preventDefault(); act(b.dataset.lvAct); }
});
$('lv-hide-code').addEventListener('click', () => {
  const box = $('lv-joinbox'), b = $('lv-hide-code'), hide = !box.classList.contains('is-hidden');
  box.classList.toggle('is-hidden', hide);
  b.setAttribute('aria-pressed', String(hide)); b.textContent = hide ? D.text.showCode : D.text.hideCode;
});
