// /live/play/:sid (server/views/live.js playBody; docs/live-protocol.md). The player's page: the socket, the game frame
// (or, for a 3D game with no 2D path on a device that can't draw 3D, the Watch view: a map of everyone and the
// leaderboard), phase banners and results announced in a polite live region, emotes, Simple view, Report (fixed reasons
// only, never who sent it) and Leave. Nothing for sale and no way to type anything here.
import { api, toast, t } from '/js/app.js';
import { connect, gameFrame, can3d, readJson, portraits, avatarCanvas, playerOf, nameOf, fill } from '/js/live-common.js';

const D = readJson('lv-play-data');
const $ = id => document.getElementById(id);
const sid = D.sid;
const phaseEl = $('lv-phase'), stage = $('lv-stage'), watch = $('lv-watch'), endBox = $('lv-end');
let tok = null; try { tok = sessionStorage.getItem(`lv:${sid}`); } catch { /* none */ }
const removedMark = (() => { try { return !!sessionStorage.getItem(`lv:removed:${sid}`); } catch { return false; } })();
let simple = (() => { try { return sessionStorage.getItem('lv:simple') === '1'; } catch { return false; } })();
const says = text => { if (phaseEl) phaseEl.textContent = text || ''; };
const players = new Map();
let me = null, phase = 'lobby', seq = 0, cfg = {}, sock = null, frame = null, view = '3d', watching = false, wel = null, frameReq = new Map(), countdownTimer = null, mySeat = 0;
const pics = portraits(D.kit);
const nm = n => nameOf(D.nicks || [], n);

if (!D.open) stop(D.msgs && D.msgs.gone);
else if (removedMark) stop(D.msgs && D.msgs.removed);
else if (!tok) stop(D.msgs && D.msgs.gone, true);
else start();

function stop(text, offerJoin) {
  says(text || '');
  if (frame) { frame.destroy(); frame = null; }
  for (const b of document.querySelectorAll('#lv-emotes button, #lv-simple, #lv-report-open')) b.disabled = true;
  if (offerJoin && endBox) { endBox.hidden = false; $('lv-end-title').textContent = text || ''; $('lv-place').textContent = ''; }
}

function start() {
  $('lv-simple').setAttribute('aria-pressed', String(simple));
  sock = connect({
    tok,
    onMessage,
    onState(st, code) {
      if (st === 'retry') says(D.msgs.reconnecting);
      if (st === 'gone' && code !== 4000 && code !== 4403 && code !== 4409) stop(D.msgs.expired);
    },
    onClock() { if (frame) frame.clock(sock.serverNow()); },
  });
  setInterval(() => { if (frame && sock) frame.clock(sock.serverNow()); }, 5000);
}

function frameToken(f) {
  return new Promise(res => {
    frameReq.set(f, res);
    if (!sock.send('fr', { f })) res(null);
    setTimeout(() => { if (frameReq.get(f) === res) { frameReq.delete(f); res(null); } }, 8000);
  });
}

function onMessage(m) {
  switch (m.t) {
    case 'wel': welcome(m); break;
    case 'fr': { const r = frameReq.get(m.f); if (r) { frameReq.delete(m.f); r(m.tok); } return; }
    case 'pj': case 'pu': players.set(m.p[0], playerOf(m.p)); break;
    case 'pl': players.delete(m.n); break;
    case 'ph': onPhase(m); break;
    case 'you': if (m.of) place(m); else if (m.i != null) announceResult(m); break;
    case 'bye': return bye(m.why);
    default: break;
  }
  if (watching) watchMsg(m);
  if (frame) frame.send(m);
}

function welcome(m) {
  wel = m; phase = m.phase; seq = m.seq; cfg = m.cfg || {}; mySeat = m.seat;
  players.clear(); for (const P of m.players || []) players.set(P[0], playerOf(P));
  me = m.me;
  $('lv-me-name').textContent = me ? nm(me.name) : '';
  const box = $('lv-me-avatar');
  if (box && me) { let cv = box.querySelector('canvas'); if (!cv) { cv = avatarCanvas('lv-av', 40); box.append(cv); } pics.draw(cv, me.avatar, 40); }
  if (me && me.late) toast(D.late);
  // The view: a 3D game with no 2D path on a device that can't draw 3D gets the Watch view; otherwise the game frame
  // (3D, or its own 2D path with Simple view or no 3D).
  const has3d = can3d();
  watching = !!(cfg.threeD && !cfg.twoD && !has3d);
  view = simple || !has3d ? '2d' : '3d';
  $('lv-simple').hidden = !(cfg.threeD && cfg.twoD);   // only 3D games with their own 2D path have a Simple view
  if (watching) { startWatch(); sock.send('rdy', { view: 'watch' }); }
  else if (!frame || !frame.el) loadFrame(m.lobbyFrame && phase === 'lobby' ? 'lobby' : 'game', m.lobbyFrame && phase === 'lobby' ? m.lobbyFrame : m.frame);
  else if (frame.ready) sock.send('rdy', { view: frame.view });
  onPhase({ phase: m.phase, at: m.at, seq: m.seq, round: m.round }, true);
}

function loadFrame(kind, token) {
  if (!frame) frame = gameFrame({
    stage, role: 'player', title: D.title,
    getToken: f => frameToken(f),
    onReady: ({ view: v }) => { sock.send('rdy', { view: v }); if (wel) frame.clock(sock.serverNow()); },
    onOut: (t2, m) => sock.send(t2, m),
  });
  frame.load(token, kind, view);
  // the welcome (and the clock) go to each new frame: it starts from where the session is
  if (wel) { frame.send(wel); frame.clock(sock.serverNow()); }
}

async function onPhase(m, first = false) {
  phase = m.phase; if (m.seq) seq = m.seq;
  clearInterval(countdownTimer);
  if (phase === 'countdown') {
    const tick = () => { const left = Math.ceil((m.at - sock.serverNow()) / 1000); says(left > 0 ? `${D.phases.countdown} ${left}` : ''); if (left <= 0) clearInterval(countdownTimer); };
    tick(); countdownTimer = setInterval(tick, 250);
  } else says(D.phases[phase] || '');
  // The game swaps in for the platform lobby when the host starts (games that draw their own lobby are already here).
  if (phase === 'loading' && frame && frame.kind === 'lobby' && !first) {
    const tok2 = await frameToken('game');
    if (tok2) loadFrame('game', tok2);
  } else if (phase === 'loading' && frame && frame.ready && !first) sock.send('rdy', { view: frame.view });
  if (phase === 'ended') ended();
  document.getElementById('lv-emotes').hidden = phase === 'ended' || phase === 'paused' || (phase === 'playing' && !(wel && wel.mode === 'game'));
}

function announceResult(m) {
  if (m.none) return;
  says(m.ok ? t('js.live-play.right', { points: m.points }) : t('js.live-play.wrong'));
}
function place(m) {
  const p = $('lv-place'); if (p) p.textContent = fill(D.place, { rank: m.rank, count: m.of });
  says(fill(D.place, { rank: m.rank, count: m.of }));
}
function ended() {
  if (endBox) endBox.hidden = false;
}
function bye(why) {
  if (why === 'removed') { try { sessionStorage.setItem(`lv:removed:${sid}`, '1'); sessionStorage.removeItem(`lv:${sid}`); } catch { /* ignore */ } }
  if (why === 'ended') { ended(); return; }
  stop((D.msgs && D.msgs[why]) || D.msgs.gone);
  if (why === 'removed' && endBox) { endBox.hidden = false; $('lv-end-title').textContent = D.msgs.removed; $('lv-place').textContent = ''; $('lv-again').hidden = true; }
}

// ---- emotes, Simple view, Report, Leave ----
document.getElementById('lv-emotes').addEventListener('click', e => {
  const b = e.target.closest('[data-emote]'); if (!b || !sock) return;
  sock.send('em', { e: +b.dataset.emote });
  if (frame) frame.send({ t: 'em', f: mySeat, e: +b.dataset.emote });
});
$('lv-simple').addEventListener('click', async () => {
  simple = !simple; $('lv-simple').setAttribute('aria-pressed', String(simple));
  try { sessionStorage.setItem('lv:simple', simple ? '1' : '0'); } catch { /* ignore */ }
  if (!frame || watching) return;
  view = simple || !can3d() ? '2d' : '3d';
  const kind = frame.kind, tok2 = await frameToken(kind);
  if (tok2) loadFrame(kind, tok2);
});
const dlg = $('lv-report');
$('lv-report-open').addEventListener('click', () => { if (dlg && dlg.showModal) dlg.showModal(); });
dlg && dlg.addEventListener('close', async () => {
  const reason = dlg.returnValue; dlg.returnValue = '';
  if (!reason) return;
  try { const r = await api('/api/live/report', { method: 'POST', body: { tok, reason } }); toast(r.toast || D.thanks); }
  catch (e) { toast(e.message, { bad: true }); }
});
$('lv-leave').addEventListener('click', () => {
  if (!confirm($('lv-leave').dataset.confirm)) return;
  if (sock) sock.close(); if (frame) frame.destroy();
  try { sessionStorage.removeItem(`lv:${sid}`); } catch { /* ignore */ }
  location.href = '/join';
});

// ---- the Watch view: a 2D map of everyone (from the position snapshots) and the leaderboard ----
const pos = new Map(); let board = [], raceList = [], watchTimer = 0;
function startWatch() {
  if (!watch) return;
  watch.hidden = false; stage.hidden = true; says(D.watchHint);
  const draw = () => {
    const c = watch.getContext('2d'), W = watch.clientWidth || 320, H = watch.clientHeight || 320, dpr = devicePixelRatio || 1;
    if (watch.width !== Math.round(W * dpr)) { watch.width = Math.round(W * dpr); watch.height = Math.round(H * dpr); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    c.fillStyle = getComputedStyle(document.body).getPropertyValue('--card') || '#e9f5ee'; c.fillRect(0, 0, W, H);
    const b = Math.max(10, (cfg.presence && cfg.presence.bounds) || 50), sc = Math.min(W, H) / (b * 2.2);
    c.font = '600 12px system-ui, sans-serif'; c.textAlign = 'center'; c.direction = document.documentElement.dir || 'ltr';
    for (const [seat, p] of pos) {
      const pl = players.get(seat); if (!pl) continue;
      const x = W / 2 + p[0] / 100 * sc, y = H / 2 + p[2] / 100 * sc;
      c.fillStyle = seat === mySeat ? '#2f6bff' : '#3aa676'; c.beginPath(); c.arc(x, y, seat === mySeat ? 8 : 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1d2340'; c.fillText(nm(pl.name), x, y - 10);
    }
    const list = raceList.length ? raceList.slice().sort((a, b2) => b2[1] - a[1]).map(r => [r[0], r[1]]) : board;
    c.textAlign = 'start'; c.font = '700 14px system-ui, sans-serif';
    list.slice(0, 5).forEach((r, i) => { const pl = players.get(r[0]); c.fillStyle = '#1d2340'; c.fillText(`${i + 1}. ${pl ? nm(pl.name) : ''} ${r[1]}`, 10, 20 + i * 18); });
    watchTimer = requestAnimationFrame(draw);
  };
  cancelAnimationFrame(watchTimer); draw();
}
function watchMsg(m) {
  if (m.t === 's') for (const r of m.p) pos.set(r[0], r.slice(1));
  if (m.t === 'lb') board = m.top || [];
  if (m.t === 'race') raceList = m.p || [];
  if (m.t === 'wel' && m.race) raceList = m.race;
}
