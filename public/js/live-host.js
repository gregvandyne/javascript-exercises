// /live/host/:sid (server/views/live.js hostBody; docs/live-protocol.md). The projector page: the big code, QR and
// address, the roster (portraits and names, marks for ready, late, watching and offline; Remove asks first; no links,
// profiles or messages anywhere), the host controls (real buttons with keyboard shortcuts, shown by phase), and the
// game's own host view in a sandboxed frame (role host: the game draws a spectator view, e.g. the cinematic camera of
// the shared 3D world and the leaderboard). The game's live settings (Oomba.live.ready) go to the server as rdy.cfg.
// Part 3: teams (the Teams row, the Teams sheet with drag and select-then-move, the team board during play), game
// settings, Eyes up, fixed messages, +time, projector sound, the "Teacher view on your phone" QR, and the podium hold
// at the end. This page is on the class's screen: it never shows "needs help", support, marks or a player's bonus.
// Part 4: co-hosts. The host's "Co-hosts" dialog shows adults' names only behind a gate ("check the class can't see your
// screen"), and closing it hides them again; no activity line ever shows here. A co-host may use this page when the
// projector slot is free (else it says so and points to the Teacher view); the host's own projector takes it back.
import { connect, gameFrame, readJson, portraits, avatarCanvas, playerOf, nameOf, fill, shapeSvg, teamChip, teamsOf, scoresOf, flash, paintTeam } from '/js/live-common.js';
import { board as teamBoard, teamBars } from '/js/live-teams-ui.js';
import { cohostPanel, actText, namesOf } from '/js/live-cohost.js';

const D = readJson('lv-host-data');
const $ = id => document.getElementById(id);
const roster = $('lv-roster'), tpl = $('lv-player-tpl'), stage = $('lv-stage');
const players = new Map();
let phase = 'lobby', seq = 0, locked = false, sock = null, frame = null, wel = null, frameReq = new Map(), max = D.max;
let teams = teamsOf(null), scores = new Map(), settings = { ...(D.settings || {}) }, eyesOn = false, ended = false;
const TT = (D.text && D.text.team) || {};
const presets = D.presets || [];
const pics = portraits(D.kit);
const nm = n => nameOf(D.nicks || [], n);
const SHOW = {
  lobby: ['start', 'lock', 'unlock', 'end'], loading: ['end'], countdown: ['end'],
  playing: ['pause', 'next', 'skip', 'end'], paused: ['resume', 'end'], between: ['next', 'end'], ended: [],
};
const ALWAYS = new Set(['eyes', 'settings', 'sound', 'dash', 'cohosts']);
const CTL = D.ctl || { role: 'host', tier: 'full' }, TC = D.cohost || null;
let adults = new Map(), acts = [];
const seenNames = new Map();

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
    case 'pj': case 'pu': { const p = playerOf(m.p); players.set(p.seat, p); drawPlayer(p); count(); drawTeams(); break; }
    case 'pl': { players.delete(m.n); const li = roster.querySelector(`[data-seat="${m.n}"]`); if (li) li.remove(); count(); drawTeams(); break; }
    case 'ros': { players.clear(); roster.textContent = ''; for (const P of m.players || []) { const p = playerOf(P); players.set(p.seat, p); drawPlayer(p); } count(); drawTeams(); break; }
    case 'ph': onPhase(m); break;
    case 'lk': setLocked(m.locked); return;
    case 'rp': { const r = $('lv-reports'); if (r) r.hidden = false; return; }
    case 'res': podiumHold(); return;
    case 'bye':
      if (TC && (m.why === 'projectorBusy' || (m.why === 'replaced' && CTL.role === 'cohost'))) { busy(m.why === 'replaced' ? TC.projBack : TC.projBusy); return; }
      if (TC && m.why === 'cohostOff') { off(); return; }
      if (m.why !== 'ended') document.body.classList.add('lv-offline'); return;
    case 'ch': namesOf(m, adults); if (panel) panel.setCh(m); drawRecent(); return;
    case 'act': if (m.a === 'acc') return; acts.push(m); if (acts.length > 10) acts.shift(); drawRecent(); return;
    case 'nak': return;   // adults' names: never on the class's screen
    case 'tms': teams = teamsOf(m); for (const [seat, k] of teams.of) { const p = players.get(seat); if (p) p.team = k; } for (const p of players.values()) if (!teams.of.has(p.seat)) p.team = 0; drawTeams(); for (const p of players.values()) drawPlayer(p); break;
    case 'tml': tmlNotice(m); return;
    case 'ts': scoresOf(m.s, scores); drawBoard(); break;
    case 'bn': if (m.k) flash($('lv-bonus-toast'), fill(D.text.toastTeam, { team: (presetOf(m.k) || {}).name || '', points: m.p, reason: (D.bonus || [])[m.r] || '' }), 5000); if (!m.k) return; break;   // a player's bonus is private: not on the class's screen
    case 'eyes': setEyes(m.on); return;
    case 'say': flash($('lv-say-banner'), (D.say || [])[m.m] || '', 6000); return;
    case 'cf': settings = { ...settings, ...m.d }; fillSettings(); setSound(); return;
    case 'dq': case 'dp': case 'sup': case 'me': case 'again': return;   // never for the projector (and never sent here)
    default: break;
  }
  if (frame) frame.send(m);
}

function welcome(m) {
  // part 4: promoted to host, or handed back (the page is drawn per role)
  if (m.ctl && m.ctl.role !== CTL.role) { location.reload(); return; }
  if (m.ch) { namesOf(m.ch, adults); if (panel) panel.setCh(m.ch); }
  if (m.acts) { acts = m.acts.filter(x => x.a !== 'acc'); drawRecent(); }
  wel = m; phase = m.phase; seq = m.seq; max = m.max || max;
  players.clear(); roster.textContent = '';
  for (const P of m.players || []) { const p = playerOf(P); players.set(p.seat, p); }
  if (m.teams) teams = teamsOf(m.teams);
  if (m.ts) scoresOf(m.ts, scores);
  if (m.settings) { settings = { ...settings, ...m.settings }; fillSettings(); setSound(); }
  for (const p of players.values()) drawPlayer(p);
  count(); setLocked(m.locked); setEyes(!!m.eyes);
  if (!frame || !frame.el) {
    const kind = m.lobbyFrame && phase === 'lobby' ? 'lobby' : 'game';
    loadFrame(kind, kind === 'lobby' ? m.lobbyFrame : m.frame);
  }
  onPhase(m, true);
  drawTeams(); drawBoard();
}
function loadFrame(kind, token) {
  if (!frame) frame = gameFrame({
    stage, role: 'host', title: D.title,
    getToken: f => frameToken(f),
    // The game's own live settings (Oomba.live.ready(opts)) go to the server with the host's rdy.
    onReady: ({ cfg }) => { sock.send('rdy', cfg ? { view: '3d', cfg } : { view: '3d' }); frame.clock(sock.serverNow()); frame.send({ t: 'snd', on: settings.sound !== false }); },
    onOut: (t2, m) => sock.send(t2, m),
  });
  frame.load(token, kind, '3d');
  if (wel) { frame.send(wel); frame.clock(sock.serverNow()); }
}

async function onPhase(m, first = false) {
  phase = m.phase; if (m.seq) seq = m.seq;
  const show = SHOW[phase] || [];
  for (const b of document.querySelectorAll('#lv-controls [data-lv-act]')) {
    const a = b.dataset.lvAct;
    if (ALWAYS.has(a)) { b.hidden = phase === 'ended'; continue; }
    b.hidden = !show.includes(a) || (a === 'lock' && locked) || (a === 'unlock' && !locked) || (a === 'skip' && wel && wel.mode === 'game');
  }
  // In quiz modes "Next" while a question is open reveals it now.
  const nx = document.querySelector('#lv-controls [data-lv-act="next"]');
  if (nx) { if (!nx.dataset.label) nx.dataset.label = nx.textContent; nx.textContent = D.quiz && phase === 'playing' ? D.text.revealNow : nx.dataset.label; }
  const time = $('lv-time'); if (time) time.hidden = !(D.quiz && phase === 'playing');
  const al = $('lv-autolock'); if (al) al.hidden = phase !== 'lobby' || locked || settings.late !== false;
  document.body.dataset.phase = phase;
  if (phase === 'loading' && frame && frame.kind === 'lobby' && !first) { const tok = await frameToken('game'); if (tok) loadFrame('game', tok); }
  // In a game, the code box gets out of the way once play starts (Show code brings it back).
  $('lv-joinbox').classList.toggle('is-small', !['lobby'].includes(phase));
  // Settings that only change before the start are disabled after it.
  for (const k of ['secs', 'count', 'shuffleQ', 'shuffleA', 'points']) { const el = $(`lv-hs-${k}`); if (el) el.disabled = phase !== 'lobby'; }
  drawTeams(); drawBoard();
}
function setLocked(on) {
  locked = !!on;
  for (const b of document.querySelectorAll('#lv-controls [data-lv-act="lock"], #lv-controls [data-lv-act="unlock"]')) b.hidden = !(SHOW[phase] || []).includes(b.dataset.lvAct) || (b.dataset.lvAct === 'lock' ? locked : !locked);
  $('lv-joinbox').classList.toggle('is-locked', locked);
}
function count() {
  const n = [...players.values()].length;
  const el = $('lv-count'); if (el) el.textContent = fill(D.text.count, { count: n, max });
  const empty = $('lv-empty'); if (empty) empty.hidden = n > 0;
}
const presetOf = k => { const t = teams.list.find(x => x.k === k); return t ? presets[t.p] : null; };
function drawPlayer(p) {
  let li = roster.querySelector(`[data-seat="${p.seat}"]`);
  if (!li) {
    li = tpl.content.firstElementChild.cloneNode(true); li.dataset.seat = p.seat;
    const cv = avatarCanvas('lv-av', 40); li.querySelector('.lv-p-avatar').append(cv); pics.draw(cv, p.avatar, 40);
    li.querySelector('[data-lv-kick]').dataset.lvKick = p.seat;
    roster.append(li);
  }
  const name = nm(p.name);
  seenNames.set(p.seat, name);
  li.querySelector('.lv-p-name').textContent = name;
  // the team: a small shape and the team's colour on the edge (the name is in the board and the sheet)
  let sh = li.querySelector('.lv-p-team'); const pr = teams.on && p.team ? presetOf(p.team) : null;
  if (pr) { if (!sh || sh.dataset.shape !== pr.shape) { if (sh) sh.remove(); sh = shapeSvg(pr.shape, 'lv-shape lv-p-team'); sh.dataset.shape = pr.shape; li.querySelector('.lv-p-avatar').after(sh); } const tt = document.createElementNS('http://www.w3.org/2000/svg', 'title'); tt.textContent = pr.name; sh.replaceChildren(sh.firstChild, tt); paintTeam(li, pr, p.team); }
  else { if (sh) sh.remove(); paintTeam(li, null); }
  const marks = [];
  if (p.ready && phase !== 'lobby') marks.push(`✓ ${D.text.ready}`);
  if (p.late) marks.push(D.text.late);
  if (!p.connected) marks.push(D.text.offline);
  li.querySelector('.lv-p-marks').textContent = marks.join(' · ');
  li.classList.toggle('is-off', !p.connected);
  const kick = li.querySelector('[data-lv-kick]');
  kick.setAttribute('aria-label', `${kick.textContent.trim()}: ${name || `#${p.seat}`}`);
}

// ---- controls ----
function act(a, extra = {}) {
  if (a === 'end' && !confirm(document.querySelector('[data-lv-act="end"]').dataset.confirm)) return;
  if (a === 'eyes') { sock.send('h', { a: 'eyes', on: !eyesOn }); return; }
  if (a === 'settings') { const d = $('lv-settings'); fillSettings(); if (d && d.showModal) d.showModal(); return; }
  if (a === 'sound') { sock.send('cf', { d: { sound: settings.sound === false } }); return; }
  if (a === 'dash') { const d = $('lv-dash-qr'); if (d && d.showModal) d.showModal(); return; }
  if (a === 'cohosts') { openCohosts(); return; }
  const msg = { a, ...extra };
  if (a === 'end' && CTL.role !== 'host') msg.sure = 1;   // a co-host's end says it is sure
  if (a === 'next' || a === 'skip') msg.at = seq;
  sock.send('h', msg);
}
$('lv-controls').addEventListener('click', e => {
  const t = e.target.closest('[data-lv-time]'); if (t) { sock.send('h', { a: 'time', s: +t.dataset.lvTime }); return; }
  const s = e.target.closest('[data-lv-say]'); if (s) { sock.send('h', { a: 'say', m: +s.dataset.lvSay }); const d = $('lv-say'); if (d) d.open = false; return; }
  const b = e.target.closest('[data-lv-act]'); if (b && !b.hidden) act(b.dataset.lvAct);
});
roster.addEventListener('click', e => {
  const b = e.target.closest('[data-lv-kick]'); if (!b) return;
  if (!confirm(D.text.removeConfirm)) return;
  act('kick', { n: +b.dataset.lvKick });
});
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test((e.target && e.target.tagName) || '')) return;
  if (document.querySelector('dialog[open]')) return;
  // The physical key (e.code 'KeyS'), so the shortcuts work on Hebrew, Arabic, Russian... layouts too; e.key as a fallback.
  const k = /^Key[A-Z]$/.test(e.code || '') ? e.code.slice(3) : String(e.key || '').toUpperCase();
  const b = [...document.querySelectorAll('[data-lv-act]')].find(x => !x.hidden && x.getAttribute('aria-keyshortcuts') === k);
  if (b) { e.preventDefault(); act(b.dataset.lvAct); }
});
$('lv-hide-code').addEventListener('click', () => {
  const box = $('lv-joinbox'), b = $('lv-hide-code'), hide = !box.classList.contains('is-hidden');
  box.classList.toggle('is-hidden', hide);
  b.setAttribute('aria-pressed', String(hide)); b.textContent = hide ? D.text.showCode : D.text.hideCode;
});

// ---- eyes up, sound ----
function setEyes(on) {
  eyesOn = !!on;
  const b = document.querySelector('#lv-controls [data-lv-act="eyes"]');
  if (b) { b.setAttribute('aria-pressed', String(eyesOn)); b.classList.toggle('is-on', eyesOn); b.title = eyesOn ? D.text.eyesOff : D.text.eyesOn; }
  const ban = $('lv-eyes-banner'); if (ban) ban.hidden = !eyesOn;
}
function setSound() {
  const b = document.querySelector('#lv-controls [data-lv-act="sound"]'); if (!b) return;
  const on = settings.sound !== false;
  b.setAttribute('aria-pressed', String(on)); b.textContent = `${on ? '🔊' : '🔇'} ${on ? D.text.soundOn : D.text.soundOff}`;
}
setSound();

// ---- the settings dialog: fields named by setting; Save sends what changed (cf) ----
const sform = $('lv-settings-form');
function fillSettings() {
  if (!sform) return;
  for (const el of sform.elements) {
    if (!el.name || !(el.name in settings)) continue;
    if (el.type === 'checkbox') el.checked = !!settings[el.name];
    else if (el.type !== 'hidden') el.value = String(settings[el.name]);
  }
}
$('lv-settings') && $('lv-settings').addEventListener('close', () => {
  const d = $('lv-settings'); if (d.returnValue !== 'save') return; d.returnValue = '';
  const out = {};
  for (const el of sform.elements) {
    if (!el.name || el.type === 'hidden' || el.disabled) continue;
    const v = el.type === 'checkbox' ? el.checked : /^\d+$/.test(el.value) ? +el.value : el.value;
    if (settings[el.name] !== v) out[el.name] = v;
  }
  if (Object.keys(out).length) sock.send('cf', { d: out });
});

// ---- teams: the row (Off · 2-6), the summary, the Teams sheet, the board ----
const box = $('lv-teamsbox'), sheet = $('lv-teams-sheet');
const tmSend = (a, extra = {}) => sock.send('tm', { a, ...extra });
let ui = null;
if (box && sheet) {
  ui = teamBoard({
    root: $('lv-teams-cols'), unassigned: $('lv-teams-unassigned'), live: $('lv-teams-live'), presets,
    text: { moveHere: TT.moveHere, empty: TT.empty, unassigned: TT.unassigned, moved: TT.moved, size: TT.size },
    onMove: (seat, k) => tmSend('move', { s: seat, k }),
    drawAvatar: (el, seat) => { const p = players.get(seat); const cv = avatarCanvas('lv-av', 32); el.append(cv); pics.draw(cv, p && p.avatar, 32); },
  });
  box.addEventListener('change', e => {
    if (e.target.name !== 'lv-teams') return;
    const n = +e.target.value;
    if (!n) tmSend('off'); else if (!teams.on) tmSend('on', { n }); else tmSend('count', { n });
  });
  $('lv-teams-edit').addEventListener('click', () => { if (sheet.showModal) sheet.showModal(); drawTeams(); });
  $('lv-teams-done').addEventListener('click', () => sheet.close());
  sheet.addEventListener('cancel', e => { if (ui && ui.selected) { e.preventDefault(); ui.cancel(); } });
  sheet.addEventListener('click', e => {
    const b = e.target.closest('[data-lv-tm]'); if (!b) return;
    const a = b.dataset.lvTm;
    if (a === 'last') { $('lv-teams-warn').hidden = true; }
    tmSend(a);
  });
  sheet.addEventListener('change', e => {
    if (e.target.name === 'lv-scoring') tmSend('scoring', { v: e.target.value });
    else if (e.target.id === 'lv-teams-choose') tmSend('choose', { v: e.target.checked });
    else if (e.target.dataset.lvPreset) tmSend('preset', { k: +e.target.dataset.lvPreset, p: +e.target.value });
  });
}
let uneven = null;
function tmlNotice(m) {
  const w = $('lv-teams-warn'); if (!w) return;
  if (!m.ok) { uneven = null; w.textContent = TT.noLast; w.hidden = false; return; }
  uneven = m.uneven || null; drawTeams();
}
function drawTeams() {
  if (!box) return;
  const lobby = phase === 'lobby';
  // the row: Off or the count; only in the lobby
  for (const r of box.querySelectorAll('input[name="lv-teams"]')) { r.checked = +r.value === (teams.on ? teams.n : 0); r.disabled = !lobby; }
  $('lv-teams-n').hidden = !lobby; // the count row is a lobby control: dead buttons on the class's screen during play
  $('lv-teams-edit').hidden = !teams.on || phase === 'ended';
  box.hidden = phase !== 'lobby' && !teams.on;
  // the summary: shape, icon, name, size
  const sum = $('lv-teams-summary'); sum.textContent = '';
  if (teams.on && lobby) for (const t of teams.list) { const p = presets[t.p]; if (!p) continue; const li = document.createElement('li'); li.append(teamChip(p, t.k, fill(TT.size, { count: sizeOf(t.k) }))); sum.append(li); }
  sum.hidden = !teams.on || !lobby;
  if (!sheet) return;
  // the sheet's tools and options
  for (const b of sheet.querySelectorAll('[data-lv-tm]')) {
    const a = b.dataset.lvTm;
    b.hidden = (a === 'lock' && teams.locked) || (a === 'unlock' && !teams.locked) || (['shuffle', 'last'].includes(a) && !lobby) || (a === 'balance' && !(lobby || phase === 'between'));
  }
  const more = $('lv-teams-presets');
  if (more && teams.on) {
    // update the pickers in place: rebuilding them would drop the teacher's focus
    // (and close an open dropdown) every time a 'tms' message arrives
    const want = teams.list.map(t => t.k).join(',');
    if (more.dataset.ks !== want) {
      more.textContent = ''; more.dataset.ks = want;
      for (const t of teams.list) {
        const f = document.createElement('div'); f.className = 'field lv-preset-pick';
        const id = `lv-preset-${t.k}`, l = document.createElement('label'); l.htmlFor = id;
        const sel = document.createElement('select'); sel.id = id; sel.dataset.lvPreset = t.k;
        presets.forEach((p, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${p.icon} ${p.name}`; sel.append(o); });
        f.append(l, sel); more.append(f);
      }
    }
    for (const t of teams.list) {
      const sel = $(`lv-preset-${t.k}`), l = sel && sel.previousElementSibling; if (!sel) continue;
      if (+sel.value !== t.p) sel.value = String(t.p);
      sel.disabled = !lobby;
      const p = presets[t.p] || {};
      if (l.dataset.p !== String(t.p)) { l.dataset.p = String(t.p); l.textContent = ''; l.append(shapeSvg(p.shape || 'circle'), ` ${p.name || ''}`); paintTeam(l, presets[t.p], t.k); }
    }
  } else if (more) { more.textContent = ''; delete more.dataset.ks; }
  for (const r of sheet.querySelectorAll('input[name="lv-scoring"]')) { r.checked = r.value === teams.scoring; r.disabled = !lobby; }
  const ch = $('lv-teams-choose'); if (ch) { ch.checked = teams.choose; ch.disabled = !lobby; }
  // warnings: empty teams before the start; uneven after "Use last teams"
  const warn = $('lv-teams-warn'), msgs = [];
  if (teams.on && lobby && players.size) for (const t of teams.list) if (!sizeOf(t.k) && presets[t.p]) msgs.push(fill(TT.emptyWarn, { team: presets[t.p].name }));
  if (uneven && lobby && teams.on) {
    const sizes = teams.list.map(t => sizeOf(t.k));
    if (Math.max(...sizes) - Math.min(...sizes) > 1) msgs.push(fill(TT.uneven, { sizes: sizes.join(' · ') })); else uneven = null;
  }
  if (warn && (msgs.length || warn.textContent !== TT.noLast)) { warn.textContent = msgs.join(' '); warn.hidden = !msgs.length; }
  if (ui && teams.on) ui.render({ list: teams.list, of: teams.of, seats: [...players.values()].sort((a, b) => a.seat - b.seat).map(p => ({ seat: p.seat, name: nm(p.name) || `#${p.seat}` })), unassigned: lobby });
  else if (ui) ui.render({ list: [], of: new Map(), seats: [], unassigned: false });
}
const sizeOf = k => { let n = 0; for (const v of teams.of.values()) if (v === k) n++; return n; };
function drawBoard() {
  const ol = $('lv-team-board'); if (!ol) return;
  const on = teams.on && phase !== 'lobby';
  ol.hidden = !on;
  if (!on) return;
  teamBars(ol, teams.list.map(t => ({ k: t.k, p: t.p, size: sizeOf(t.k), ...(scores.get(t.k) || { score: 0, rank: 0 }) })), presets, { scoring: teams.scoring, text: { perPlayer: TT.perPlayer } });
}

// ---- the end: hold the game's podium on the big screen, then the results ----
function podiumHold() {
  if (ended) return; ended = true;
  const hold = $('lv-podium-hold'), go = () => { location.href = D.results; };
  if (!hold) return go();
  hold.hidden = false;
  const b = $('lv-see-results'); if (b) { b.addEventListener('click', go); b.focus({ preventScroll: true }); }
  setTimeout(go, D.podiumHoldMs || 6000);
}

// ---- part 4: the Co-hosts dialog (behind its gate), and this page as a co-host's ----
const cdlg = $('lv-cohosts'), panelRoot = cdlg && cdlg.querySelector('[data-lv-cohost-panel]');
const panel = panelRoot && TC ? cohostPanel(panelRoot, { sid: D.sid, TX: TC }) : null;
function openCohosts() {
  if (!cdlg) return;
  $('lv-cohosts-gate').hidden = false; $('lv-cohosts-body').hidden = true;
  if (cdlg.showModal) cdlg.showModal();
}
if (cdlg) {
  $('lv-cohosts-show').addEventListener('click', () => { $('lv-cohosts-gate').hidden = true; $('lv-cohosts-body').hidden = false; if (panel) panel.refresh(); drawRecent(); const f = cdlg.querySelector('#lv-cohosts-body select, #lv-cohosts-body button'); if (f) f.focus(); });
  $('lv-cohosts-phone').addEventListener('click', () => { cdlg.close(); const d = $('lv-dash-qr'); if (d && d.showModal) d.showModal(); });
  // closing hides the names again; focus goes back to the button that opened it
  cdlg.addEventListener('close', () => { $('lv-cohosts-gate').hidden = false; $('lv-cohosts-body').hidden = true; const b = document.querySelector('[data-lv-act="cohosts"]'); if (b) b.focus(); });
}
const presetName = k => (presetOf(k) || {}).name || '';
function drawRecent() {
  if (!panel || !TC) return;
  panel.setRecent(acts.slice(-5).reverse().map(m => actText(m, { names: adults, player: n => seenNames.get(n) || '', team: presetName, TX: TC })).filter(Boolean));
}
function busy(text) {
  const box = $('lv-proj-busy'); if (!box) return;
  $('lv-proj-busy-text').textContent = text; box.hidden = false;
  standDown();
}
function off() {
  const box = $('lv-cohost-off'); if (!box) return;
  $('lv-cohost-off-text').textContent = TC.removed; box.hidden = false;
  const busyBox = $('lv-proj-busy'); if (busyBox) busyBox.hidden = true;
  standDown();
}
/** This page no longer runs the game here (another screen has it, or no longer a co-host): only the header and the
 *  notice stay (no roster, teams row, controls or open dialog left to press). */
function standDown() {
  if (frame) frame.destroy(); frame = null;
  for (const el of [$('lv-controls'), $('lv-stage'), $('lv-joinbox')]) if (el) el.hidden = true;
  for (const d of document.querySelectorAll('.lv-host dialog[open]')) d.close();
  const root = document.querySelector('.lv-host'); if (root) root.classList.add('lv-host-off');
}
