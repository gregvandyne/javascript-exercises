// /live/play/:sid (server/views/live.js playBody; docs/live-protocol.md). The player's page: the socket, the game frame
// (or, for a 3D game with no 2D path on a device that can't draw 3D, the Watch view: a map of everyone and the
// leaderboard), phase banners and results announced in a polite live region, emotes, Simple view, Report (fixed reasons
// only, never who sent it) and Leave. Nothing for sale and no way to type anything here.
// Part 3: the player's team (the header band in the team colour, with its shape and name; the team's place when the
// leaderboard allows ranks), picking a team in the lobby when the host allows it, "Eyes on your teacher" (a cover that
// makes the game inert), the teacher's fixed messages, bonus toasts, Read aloud (for everyone, so it marks nobody out;
// automatic for a seat whose support says so), and Play again (a private token moves this page to the new game).
// The seat's own support (me / wel.me.acc) stays on this page: it is never passed into the game frame.
import { api, toast, t } from '/js/app.js';
import { connect, gameFrame, can3d, readJson, portraits, avatarCanvas, playerOf, nameOf, fill, shapeSvg, paintTeam, teamsOf, scoresOf, speak, voiceFor, flash } from '/js/live-common.js';

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
let teams = teamsOf(null), scores = new Map(), myTeam = 0, opt = { board: 'all', emotes: true }, acc = { time: 100, read: false, simple: false }, question = null, tapped = false, lang = '', lingering = false;
const TX = D.text || {}, presets = D.presets || [];
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
    case 'tms': teams = teamsOf(m); for (const [seat, k] of teams.of) { const p = players.get(seat); if (p) p.team = k; } drawTeam(); break;
    case 'ts': scoresOf(m.s, scores); drawTeam(); break;
    case 'bn': bonusToast(m); if (m.n && m.n !== mySeat) return; break;
    case 'eyes': setEyes(m.on); return;
    case 'say': flash($('lv-say-banner'), (D.say || [])[m.m] || '', 6000); return;
    case 'opt': opt = { ...opt, ...m }; applyOpt(); break;
    case 'me': if (m.acc) setAcc(m.acc); return;
    case 'again': return again(m);
    case 'ros': players.clear(); for (const P of m.players || []) players.set(P[0], playerOf(P)); { const mine = players.get(mySeat); if (mine) $('lv-me-name').textContent = nm(mine.name); } break;
    case 'q': question = { i: m.i, q: m.q, choices: m.choices || [] }; showRead(); if (acc.read && tapped) readQuestion(); break;
    case 'rv': question = null; break;
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
  if (m.teams) teams = teamsOf(m.teams);
  if (m.ts) scoresOf(m.ts, scores);
  if (m.settings) { opt = { ...opt, ...m.settings }; applyOpt(); }
  lang = m.lang || lang;
  if (m.quiz && m.quiz.q) question = { i: m.quiz.q.i, q: m.quiz.q.q, choices: m.quiz.q.choices || [] };
  setEyes(!!m.eyes);
  if (me && me.acc) setAcc(me.acc, true);
  drawTeam(); showRead();
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
  if (phase !== 'playing') question = phase === 'paused' ? question : null;
  applyOpt(); drawTeam(); showRead();
}

function announceResult(m) {
  // A quiz game in its frame says the result itself (its own live region): saying it here too would read it twice.
  if (m.none || (frame && !watching)) return;
  says(m.ok ? t('js.live-play.right', { points: m.points }) : t('js.live-play.wrong'));
}
function place(m) {
  // the leaderboard off: no place, just the end
  const text = m.rank ? fill(D.place, { rank: m.rank, count: m.of }) : (D.phases || {}).ended || '';
  const p = $('lv-place'); if (p) p.textContent = text;
  says(text);
}
function ended() {
  if (endBox) endBox.hidden = false;
  lingering = true; const w = $('lv-again-wait'); if (w) w.hidden = false;
  drawEndTeams();
}
function bye(why) {
  if (why === 'removed') { try { sessionStorage.setItem(`lv:removed:${sid}`, '1'); sessionStorage.removeItem(`lv:${sid}`); } catch { /* ignore */ } }
  if (why === 'ended') { ended(); lingering = false; const w = $('lv-again-wait'); if (w) w.hidden = true; return; }
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
  // The map frames the players themselves (not the game's whole world: Sunvale is 460 m across, which would put a whole
  // class on one pixel), easing as they move. Colours come from the theme, text runs the page's direction, and names
  // that would overprint another are left out (mine always shows).
  const view2 = { cx: 0, cz: 0, span: 20 };
  const list0 = () => (raceList.length ? raceList.slice().sort((a, b2) => b2[1] - a[1]).map(r => [r[0], r[1]]) : board);
  const draw = () => {
    const c = watch.getContext('2d'), W = watch.clientWidth || 320, H = watch.clientHeight || 320, dpr = devicePixelRatio || 1;
    if (watch.width !== Math.round(W * dpr)) { watch.width = Math.round(W * dpr); watch.height = Math.round(H * dpr); }
    const css = getComputedStyle(document.body), rtl = (document.documentElement.dir || 'ltr') === 'rtl';
    const bg = css.getPropertyValue('--card').trim() || '#ffffff', ink = css.getPropertyValue('--text').trim() || css.color || '#141414';
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [seat, p] of pos) { if (!players.has(seat)) continue; x0 = Math.min(x0, p[0] / 100); x1 = Math.max(x1, p[0] / 100); z0 = Math.min(z0, p[2] / 100); z1 = Math.max(z1, p[2] / 100); }
    if (x0 <= x1) {
      const k = 0.08;
      view2.cx += ((x0 + x1) / 2 - view2.cx) * k; view2.cz += ((z0 + z1) / 2 - view2.cz) * k;
      view2.span += (Math.max(20, x1 - x0, z1 - z0) * 1.25 - view2.span) * k;
    }
    const top = list0().length ? 110 : 0, sc = Math.max(1, Math.min(W, H - top)) / view2.span, oy = top + (H - top) / 2;
    c.font = '700 12px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.direction = rtl ? 'rtl' : 'ltr';
    const placed = [], order = [...pos].filter(([seat]) => players.has(seat)).sort((a, b2) => (a[0] === mySeat) - (b2[0] === mySeat)).reverse();
    for (const [seat, p] of order) {
      const pl = players.get(seat), mine = seat === mySeat;
      const x = W / 2 + (p[0] / 100 - view2.cx) * sc, y = oy + (p[2] / 100 - view2.cz) * sc;
      c.fillStyle = mine ? '#2f6bff' : '#3aa676'; c.beginPath(); c.arc(x, y, mine ? 8 : 6, 0, Math.PI * 2); c.fill();
      const name = nm(pl.name), w = Math.min(120, c.measureText(name).width + 10), box = [x - w / 2, y - 27, w, 16];
      if (!mine && placed.some(r => box[0] < r[0] + r[2] && r[0] < box[0] + box[2] && box[1] < r[1] + r[3] && r[1] < box[1] + box[3])) continue;
      placed.push(box);
      c.fillStyle = mine ? '#2f6bff' : 'rgba(29,35,64,.85)'; c.fillRect(box[0], box[1], box[2], box[3]);
      c.fillStyle = '#ffffff'; c.fillText(name, x, y - 15, 112);
    }
    // the top five, in a card at the top that reads from the page's start edge
    const list = list0();
    if (list.length) {
      c.fillStyle = bg; c.globalAlpha = 0.92; c.fillRect(0, 0, W, 104); c.globalAlpha = 1;
      c.textAlign = 'start'; c.font = '700 14px system-ui, sans-serif'; c.fillStyle = ink;
      const sx = rtl ? W - 10 : 10;
      list.slice(0, 5).forEach((r, i) => { const pl = players.get(r[0]); c.fillText(`${i + 1}. ${pl ? nm(pl.name) : ''} ${r[1]}`, sx, 20 + i * 19, W - 20); });
    }
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

// ---------------------------------------------------------------- part 3
// ---- my team: the header band, the team's place, the picker (lobby, when the host allows it) ----
const presetOf = k => { const tm = teams.list.find(x => x.k === k); return tm ? presets[tm.p] : null; };
function drawTeam() {
  const k = teams.on ? teams.of.get(mySeat) || 0 : 0, pr = k ? presetOf(k) : null, band = $('lv-me-team'), bar = document.querySelector('.lv-play > .lv-bar');
  if (band) {
    band.hidden = !pr;
    if (pr) {
      const use = band.querySelector('use'); if (use) use.setAttribute('href', `#lv-shape-${pr.shape}`);
      band.querySelector('.lv-me-team-name').textContent = `${pr.icon} ${pr.name}`;
      const sc = scores.get(k), ranked = teams.list.filter(x => (scores.get(x.k) || {}).rank > 0).length;
      band.querySelector('.lv-me-team-rank').textContent = phase !== 'lobby' && opt.board !== 'off' && sc && sc.rank ? fill(TX.rank, { rank: sc.rank, count: ranked || teams.list.length }) : '';
      band.setAttribute('aria-label', `${TX.team}: ${pr.name}`);
    }
  }
  paintTeam(bar, pr, k); if (bar) bar.classList.toggle('lv-bar-team', !!pr);
  if (k !== myTeam) {
    const was = myTeam; myTeam = k;
    if (pr) { const live = $('lv-team-live'); if (live) { live.textContent = ''; setTimeout(() => { live.textContent = fill(was ? TX.moved : TX.you, { team: pr.name }); }, 40); } }
  }
  drawPicker();
  if (phase === 'ended') drawEndTeams();
}
function drawPicker() {
  const box = $('lv-team-pick'), listEl = $('lv-team-pick-list'); if (!box) return;
  const show = teams.on && teams.choose && phase === 'lobby';
  box.hidden = !show; if (!show) return;
  const total = players.size || 1, cap = Math.ceil(total / Math.max(1, teams.n)) + 1;
  listEl.textContent = '';
  for (const tm of teams.list) {
    const pr = presets[tm.p]; if (!pr) continue;
    const size = [...teams.of.values()].filter(v => v === tm.k).length, mine = teams.of.get(mySeat) === tm.k;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn lv-team-btn'; b.dataset.k = tm.k; paintTeam(b, pr, tm.k);
    const nmEl = document.createElement('span'); nmEl.className = 'lv-team-name'; nmEl.textContent = `${pr.icon} ${pr.name}`;
    const sz = document.createElement('span'); sz.className = 'small lv-team-size';
    const why = teams.locked ? TX.locked : !mine && size >= cap ? TX.full : '';
    sz.textContent = `${fill(TX.size, { count: size })}${why ? ` · ${why}` : ''}`;
    b.append(shapeSvg(pr.shape), nmEl, sz);
    b.setAttribute('aria-pressed', String(mine));
    b.disabled = !!why || mine;
    listEl.append(b);
  }
}
$('lv-team-pick-list') && $('lv-team-pick-list').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b && !b.disabled && sock) sock.send('pt', { k: +b.dataset.k }); });
function drawEndTeams() {
  const ol = $('lv-end-teams'); if (!ol) return;
  ol.hidden = !teams.on; if (!teams.on) return;
  ol.textContent = '';
  const rows = teams.list.map(tm => ({ ...tm, ...(scores.get(tm.k) || { score: 0, rank: 0 }) }));
  const ranks = opt.board !== 'off';
  rows.sort((a, b) => (ranks ? ((a.rank || 99) - (b.rank || 99)) : 0) || (a.k - b.k));
  for (const r of rows) {
    const pr = presets[r.p]; if (!pr) continue;
    const li = document.createElement('li'); li.className = 'lv-end-team'; paintTeam(li, pr, r.k);
    if (r.k === myTeam) li.classList.add('is-mine');
    const nmEl = document.createElement('span'); nmEl.textContent = `${ranks && r.rank ? `${r.rank}. ` : ''}${pr.icon} ${pr.name}`;
    li.append(shapeSvg(pr.shape), nmEl);
    if (ranks) { const sc = document.createElement('span'); sc.className = 'lv-end-score'; sc.textContent = `${r.score}${teams.scoring === 'avg' ? ` ${TX.perPlayer}` : ''}`; li.append(sc); }
    ol.append(li);
  }
}

// ---- eyes up, messages, bonus ----
function setEyes(on) {
  const cover = $('lv-eyes'); if (!cover) return;
  cover.hidden = !on;
  for (const el of [stage, $('lv-emotes'), $('lv-team-pick'), $('lv-read'), watch]) if (el) { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); }
  document.body.classList.toggle('lv-eyes-on', !!on);
}
function bonusToast(m) {
  const reason = (D.bonus || [])[m.r] || '';
  if (m.k) flash($('lv-bonus-toast'), fill(TX.toastTeam, { reason, points: m.p, team: (presetOf(m.k) || {}).name || '' }), 5000);
  else if (m.n === mySeat) flash($('lv-bonus-toast'), fill(TX.toastSeat, { reason, points: m.p }), 5000);
}
function applyOpt() {
  const em = document.getElementById('lv-emotes');
  if (em) em.hidden = opt.emotes === false || phase === 'ended' || phase === 'paused' || (phase === 'playing' && !(wel && wel.mode === 'game'));
}

// ---- support (private to this page): Simple view and automatic read aloud ----
async function setAcc(a, first = false) {
  acc = { time: a.time || 100, read: !!a.read, simple: !!a.simple };
  showRead();
  if (acc.simple && !simple) {
    simple = true; $('lv-simple').setAttribute('aria-pressed', 'true');
    try { sessionStorage.setItem('lv:simple', '1'); } catch { /* ignore */ }
    document.documentElement.classList.add('lv-reduced');
    if (!first && frame && !watching) { view = '2d'; const kind = frame.kind, tok2 = await frameToken(kind); if (tok2) loadFrame(kind, tok2); }
    else view = '2d';
  }
}
// ---- read aloud: a button for every player in quiz modes (when this browser has a voice for the set's language) ----
const readBtn = $('lv-read');
function showRead() {
  if (!readBtn) return;
  const quiz = wel && wel.mode && wel.mode !== 'game';
  const can = !!(window.speechSynthesis && voiceFor(lang || document.documentElement.lang));
  readBtn.hidden = !(quiz && can && question && phase === 'playing');
}
function readQuestion() {
  if (!question) return;
  const L2 = i => String.fromCharCode(65 + i);
  speak(`${question.q}. ${question.choices.map((c, i) => `${L2(i)}: ${c}`).join('. ')}`, lang || document.documentElement.lang);
}
readBtn && readBtn.addEventListener('click', () => { tapped = true; readQuestion(); readBtn.textContent = `🔊 ${TX.readAgain}`; });
// browsers speak only after a gesture: the first tap anywhere unlocks the automatic reading
addEventListener('pointerdown', () => { if (!tapped) { tapped = true; if (acc.read && question) readQuestion(); } }, { once: true });
if (window.speechSynthesis) window.speechSynthesis.addEventListener && window.speechSynthesis.addEventListener('voiceschanged', showRead);

// ---- play again: a private token for the new game ----
function again(m) {
  if (!m || !m.sid || !m.tok) return;
  try { sessionStorage.setItem(`lv:${m.sid}`, m.tok); } catch { /* ignore */ }
  if (sock) sock.close(); if (frame) frame.destroy();
  location.href = `/live/play/${encodeURIComponent(m.sid)}`;
}
