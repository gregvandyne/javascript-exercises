// /live/host/:sid/dash (server/views/live.js dashBody; docs/live-protocol.md "Part 3 hooks"). The teacher's dashboard:
// phone first, for the host only (same host token and sign-in; the address holds no token). The socket says
// hello { view: 'dash' } and gets what the projector gets plus the teacher-only data (dq, dp, sup), which never reaches
// the projector, a player or a game frame. Many classrooms mirror the teacher's laptop to the projector, so the right
// answer and "needs help" stay hidden until the teacher taps (remembered), and the first visit says to use a screen the
// class can't see. Tabs: players (status, needs help, support badges, a menu per player: bonus, move, new nickname,
// support, remove), question (live answer bars), teams (board, team bonus, select-then-move), messages, settings.
// Part 4: co-hosts use this page too, with their own token. The Host / Co-host chip, the activity line (act, nak: "Ms. X
// paused the game"), and the Co-hosts tab. A limited co-host (not a teacher of the class) has no needs help, support or
// who answered: the server never sends them, and the page has no place for them.
import { connect, readJson, portraits, avatarCanvas, playerOf, nameOf, fill, teamChip, teamsOf, scoresOf, flash, paintTeam } from '/js/live-common.js';
import { board as teamBoard, teamBars } from '/js/live-teams-ui.js';
import { cohostPanel, actText, nakText, namesOf } from '/js/live-cohost.js';

const D = readJson('lv-dash-data');
const $ = id => document.getElementById(id);
const TX = D.text || {}, TT = TX.team || {}, presets = D.presets || [];
const players = new Map(), progress = new Map(), support = new Map();
let phase = 'lobby', seq = 0, locked = false, eyesOn = false, teams = teamsOf(null), scores = new Map(), settings = { ...(D.settings || {}) };
let q = null, dq = null, answered = new Set(), current = 0, mode = D.mode;
const pics = portraits(D.kit);
const nm = n => nameOf(D.nicks || [], n);
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* private mode */ } return null; };
let showHelp = store('lv:dash:help') === '1', showAnswer = store('lv:dash:answer') === '1';
const CTL = D.ctl || { role: 'host', tier: 'full' }, TC = D.cohost || null, FULL = CTL.tier === 'full';
let adults = new Map(), acts = [], leaving = false, ch = null;
const shownNames = new Map();   // seat -> the name this page last showed (an act about a removed player still names them)

const sock = connect({ tok: D.tok, view: 'dash', onMessage, onState(st) { document.body.classList.toggle('lv-offline', st === 'retry'); } });

function onMessage(m) {
  switch (m.t) {
    case 'wel': if (m.ctl && (m.ctl.role !== CTL.role || m.ctl.tier !== CTL.tier)) { location.reload(); return; } welcome(m); break;
    case 'ch': onCh(m); break;
    case 'act': onAct(m); break;
    case 'nak': if (TC) line(nakText(m, { names: adults, TX: TC })); break;
    case 'bye': if (m.why === 'cohostOff') cohostOff(); break;
    case 'pj': case 'pu': { const p = playerOf(m.p); players.set(p.seat, p); drawPlayers(); drawTeams(); break; }
    case 'pl': players.delete(m.n); progress.delete(m.n); support.delete(m.n); drawPlayers(); drawTeams(); break;
    case 'ros': players.clear(); for (const P of m.players || []) { const p = playerOf(P); players.set(p.seat, p); } drawPlayers(); drawTeams(); break;
    case 'ph': onPhase(m); break;
    case 'lk': locked = !!m.locked; onPhase({ phase }); break;
    case 'q': q = m; dq = null; answered = new Set(); drawQuestion(); drawPlayers(); break;
    case 'dq': dq = m; answered = new Set(m.answered || []); drawQuestion(); drawPlayers(); break;
    case 'rv': if (q && q.i === m.i) { q.revealed = m.answer; q.counts = m.counts; } drawQuestion(); break;
    case 'dp': for (const r of m.p || []) progress.set(r[0], r); drawPlayers(); break;
    case 'sup': support.clear(); for (const r of m.p || []) support.set(r[0], r); drawPlayers(); break;
    case 'tms': teams = teamsOf(m); for (const p of players.values()) p.team = teams.of.get(p.seat) || 0; drawTeams(); drawPlayers(); break;
    case 'tml': if (!m.ok) flash($('lv-bonus-toast'), TT.noLast, 4000); else if (m.uneven) flash($('lv-bonus-toast'), fill(TT.uneven, { sizes: m.uneven.join(' · ') }), 6000); break;
    case 'ts': scoresOf(m.s, scores); drawTeams(); break;
    case 'bn': {
      const reason = (D.bonus || [])[m.r] || '';
      if (m.k) flash($('lv-bonus-toast'), fill(TX.toastTeam, { reason, points: m.p, team: (presetOf(m.k) || {}).name || '' }), 4000);
      else { const p = players.get(m.n); flash($('lv-bonus-toast'), `${p ? nm(p.name) : ''}: ${fill(TX.toastSeat, { reason, points: m.p })}`, 4000); }
      break;
    }
    case 'eyes': eyesOn = !!m.on; drawActs(); break;
    case 'cf': settings = { ...settings, ...m.d }; fillSettings(); break;
    case 'res': setTimeout(() => { location.href = D.results; }, 1500); break;
    default: break;
  }
}
function welcome(m) {
  phase = m.phase; seq = m.seq; locked = !!m.locked; eyesOn = !!m.eyes; mode = m.mode || mode;
  players.clear(); for (const P of m.players || []) { const p = playerOf(P); players.set(p.seat, p); }
  progress.clear(); for (const r of m.dp || []) progress.set(r[0], r);
  support.clear(); for (const r of m.sup || []) support.set(r[0], r);
  if (m.teams) teams = teamsOf(m.teams);
  if (m.ts) scoresOf(m.ts, scores);
  if (m.settings) { settings = { ...settings, ...m.settings }; fillSettings(); }
  if (m.quiz && m.quiz.q) { q = m.quiz.q; }
  if (m.dq) { dq = m.dq; answered = new Set(m.dq.answered || []); }
  if (m.ch) onCh(m.ch);
  if (m.acts) { acts = []; for (const a of m.acts) onAct(a, true); if (acts.length && TC) line(actLine(acts[acts.length - 1])); }
  onPhase(m);
}

// ---- part 4: the chip, the activity line, the Co-hosts tab ----
const panelRoot = document.querySelector('#lv-tab-cohosts [data-lv-cohost-panel]');
const panel = panelRoot && TC ? cohostPanel(panelRoot, { sid: D.sid, TX: TC, onLeft: () => { leaving = true; } }) : null;
if (panel && CTL.role === 'host') panel.refresh();
function onCh(m) {
  ch = m; namesOf(m, adults);
  const chip = $('lv-dash-role');
  if (chip && TC) chip.textContent = CTL.role === 'host' ? TC.roleHost : fill(TC.youCohost, { host: adults.get(m.host) || '' });
  if (panel) panel.setCh(m);
  drawRecent();
}
const presetName = k => (presetOf(k) || {}).name || '';
const actLine = m => actText(m, { names: adults, player: n => shownNames.get(n) || '', team: presetName, TX: TC });
function onAct(m, quiet = false) {
  if (!TC) return;
  acts.push(m); if (acts.length > 10) acts.shift();
  if (!quiet) line(actLine(m));
  drawRecent();
}
function drawRecent() { if (panel) panel.setRecent(acts.slice().reverse().map(actLine).filter(Boolean)); }
function line(text) { const el = $('lv-dash-activity'); if (el && text) el.textContent = text; }
function cohostOff() {
  const box = $('lv-cohost-off'); if (!box || !TC) return;
  $('lv-cohost-off-text').textContent = leaving ? TC.left : TC.removed;
  box.hidden = false;
  document.body.classList.add('lv-cohost-gone');
}

// ---- the top bar: the controls shown by phase ----
const SHOW = { lobby: ['start', 'eyes', 'lock', 'unlock', 'end'], loading: ['eyes', 'end'], countdown: ['eyes', 'end'], playing: ['pause', 'next', 'skip', 'eyes', 'end'], paused: ['resume', 'eyes', 'end'], between: ['next', 'eyes', 'end'], ended: [] };
function onPhase(m) {
  phase = m.phase; if (m.seq) seq = m.seq;
  $('lv-dash-phase').textContent = (TX.phases || {})[phase] || '';
  if (phase !== 'playing' && phase !== 'paused' && q && phase !== 'between') { /* keep the last question for review */ }
  drawActs(); drawPlayers(); drawQuestion(); drawTeams();
  for (const k of ['secs', 'count', 'shuffleQ', 'shuffleA', 'points']) { const el = $(`lv-ds-${k}`); if (el) el.disabled = phase !== 'lobby'; }
}
function drawActs() {
  const show = SHOW[phase] || [];
  for (const b of document.querySelectorAll('.lv-dash-acts [data-lv-act]')) {
    const a = b.dataset.lvAct;
    b.hidden = !show.includes(a) || (a === 'lock' && locked) || (a === 'unlock' && (!locked || phase !== 'lobby')) || (a === 'skip' && mode === 'game');
    if (a === 'lock' && phase !== 'lobby') b.hidden = true;
  }
  const nx = document.querySelector('.lv-dash-acts [data-lv-act="next"]');
  if (nx) { if (!nx.dataset.label) nx.dataset.label = nx.textContent; nx.textContent = D.quiz && phase === 'playing' ? TX.revealNow : (TX.next || nx.dataset.label); }
  const time = document.querySelector('.lv-dash-acts [data-lv-time]'); if (time) time.hidden = !(D.quiz && phase === 'playing');
  const ey = document.querySelector('.lv-dash-acts [data-lv-act="eyes"]');
  if (ey) { ey.setAttribute('aria-pressed', String(eyesOn)); ey.classList.toggle('is-on', eyesOn); }
}
document.querySelector('.lv-dash-acts').addEventListener('click', e => {
  const t = e.target.closest('[data-lv-time]'); if (t) { sock.send('h', { a: 'time', s: +t.dataset.lvTime }); return; }
  const b = e.target.closest('[data-lv-act]'); if (!b || b.hidden) return;
  const a = b.dataset.lvAct;
  if (a === 'end' && !confirm(b.dataset.confirm)) return;
  if (a === 'eyes') { sock.send('h', { a: 'eyes', on: !eyesOn }); return; }
  // a co-host's end says it is sure (the server ignores it otherwise)
  sock.send('h', { a, ...(a === 'next' || a === 'skip' ? { at: seq } : {}), ...(a === 'end' && CTL.role !== 'host' ? { sure: 1 } : {}) });
});

// ---- the one-time notice ----
{ const n = $('lv-dash-notice'); if (n && store('lv:dash:notice') !== '1') { n.hidden = false; $('lv-dash-notice-ok').addEventListener('click', () => { n.hidden = true; store('lv:dash:notice', '1'); }); } }

// ---- tabs (arrow keys move between them) ----
const tabs = [...document.querySelectorAll('[role="tab"][data-lv-tab]')];
function pickTab(name, focus = false) {
  for (const t of tabs) {
    const on = t.dataset.lvTab === name;
    t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    const panel = $(`lv-tab-${t.dataset.lvTab}`); if (panel) panel.hidden = !on;
    if (on && focus) t.focus();
  }
}
for (const t of tabs) t.addEventListener('click', () => pickTab(t.dataset.lvTab));
document.querySelector('.lv-tabs').addEventListener('keydown', e => {
  const vis = tabs.filter(t => !t.hidden), i = vis.indexOf(document.activeElement); if (i < 0) return;
  const rtl = document.documentElement.dir === 'rtl';
  const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, Home: -99, End: 99 }[e.key]; if (!step) return;
  e.preventDefault(); const j = step === -99 ? 0 : step === 99 ? vis.length - 1 : (i + step + vis.length) % vis.length;
  pickTab(vis[j].dataset.lvTab, true);
});
pickTab('players');
// The chip ("Host" / "Co-host · ...") opens the Co-hosts tab: on a phone that tab sits past the edge of the row.
const roleChip = $('lv-dash-role');
if (roleChip && $('lv-tab-cohosts')) roleChip.addEventListener('click', () => { pickTab('cohosts', true); $('lv-tab-cohosts').scrollIntoView({ block: 'nearest' }); });
// More tabs past the edge: the row fades at that end (lv-tabs-more), until it is scrolled to the end.
const tabRow = document.querySelector('.lv-tabs');
function tabFade() {
  const max = tabRow.scrollWidth - tabRow.clientWidth;
  tabRow.classList.toggle('lv-tabs-more', max > 2 && Math.abs(tabRow.scrollLeft) < max - 2);
}
tabRow.addEventListener('scroll', tabFade, { passive: true }); addEventListener('resize', tabFade); tabFade();

// ---- players ----
const list = $('lv-dash-players'), cardTpl = $('lv-dash-card-tpl');
const presetOf = k => { const t = teams.list.find(x => x.k === k); return t ? presets[t.p] : null; };
function statusOf(p) {
  if (!p.connected) return ['offline', TX.offline];
  if (FULL && D.quiz && (phase === 'playing' || phase === 'paused') && q) return answered.has(p.seat) ? ['answered', `✓ ${TX.answered}`] : ['thinking', `… ${TX.thinking}`];
  if (p.late) return ['late', TX.late];
  return ['', ''];
}
function drawPlayers() {
  const helpBtn = $('lv-dash-help-toggle');
  if (helpBtn) { helpBtn.setAttribute('aria-pressed', String(showHelp)); helpBtn.textContent = showHelp ? TX.hideHelp : TX.showHelp; }
  $('lv-dash-empty').hidden = players.size > 0;
  const seen = new Set();
  for (const p of [...players.values()].sort((a, b) => a.seat - b.seat)) {
    seen.add(String(p.seat));
    let li = list.querySelector(`[data-seat="${p.seat}"]`);
    if (!li) {
      li = cardTpl.content.firstElementChild.cloneNode(true); li.dataset.seat = p.seat;
      const cv = avatarCanvas('lv-av', 40); li.querySelector('.lv-p-avatar').append(cv); pics.draw(cv, p.avatar, 40);
      li.querySelector('.lv-dash-menu').dataset.seat = p.seat;
      list.append(li);
    }
    const name = nm(p.name) || `#${p.seat}`;
    shownNames.set(p.seat, name);
    li.querySelector('.lv-p-name').textContent = name;
    li.querySelector('.lv-dash-menu').setAttribute('aria-label', `${name}: ⋯`);
    const tm = li.querySelector('.lv-dash-team'); tm.textContent = ''; const pr = teams.on && p.team ? presetOf(p.team) : null;
    if (pr) tm.append(teamChip(pr, p.team)); paintTeam(li, pr, p.team);
    const [cls, text] = statusOf(p), st = li.querySelector('.lv-dash-status');
    st.textContent = text; st.dataset.status = cls;
    const pg = progress.get(p.seat), flag = pg && pg[5], help = li.querySelector('.lv-dash-help');
    help.hidden = !(showHelp && flag); help.textContent = flag ? `⚑ ${TX.needsHelp}: ${(TX.why || {})[flag] || ''}` : '';
    const sp = support.get(p.seat), sup = li.querySelector('.lv-dash-sup');
    sup.hidden = !sp; sup.textContent = sp ? `${TX.supportBadge}${sp[1] > 100 ? ` · ⏱ ×${sp[1] / 100}` : ''}${sp[2] ? ' · 🔊' : ''}${sp[3] ? ' · ◻' : ''}` : '';
    li.classList.toggle('is-off', !p.connected);
  }
  for (const li of [...list.children]) if (!seen.has(li.dataset.seat)) li.remove();
}
$('lv-dash-help-toggle') && $('lv-dash-help-toggle').addEventListener('click', () => { showHelp = !showHelp; store('lv:dash:help', showHelp ? '1' : '0'); drawPlayers(); });

// the player menu (a dialog): bonus, move, new nickname, support, remove
const dlg = $('lv-dash-player');
list.addEventListener('click', e => { const b = e.target.closest('.lv-dash-menu'); if (b) openPlayer(+b.dataset.seat); });
function openPlayer(seat) {
  const p = players.get(seat); if (!p) return;
  current = seat;
  $('lv-dash-player-h').textContent = nm(p.name) || `#${seat}`;
  const mv = $('lv-dash-move'), row = $('lv-dash-move-row'); mv.textContent = '';
  row.hidden = !teams.on;
  if (teams.on) {
    if (phase === 'lobby') { const o = document.createElement('option'); o.value = 0; o.textContent = TT.unassigned; o.selected = !p.team; mv.append(o); }
    for (const t of teams.list) { const pr = presets[t.p]; if (!pr) continue; const o = document.createElement('option'); o.value = t.k; o.textContent = `${pr.icon} ${pr.name}`; o.selected = p.team === t.k; mv.append(o); }
  }
  // a new nickname: for seats shown by a nickname (a room showing account names has nothing to reroll)
  $('lv-dash-rename').hidden = typeof p.name !== 'number';
  const sp = support.get(seat) || [seat, 100, 0, 0, 0];
  for (const r of dlg.querySelectorAll('input[name="lv-acc-time"]')) r.checked = +r.value === sp[1];
  if ($('lv-acc-read')) { $('lv-acc-read').checked = !!sp[2]; $('lv-acc-simple').checked = !!sp[3]; }
  const sv = $('lv-acc-save'); if (sv) sv.checked = !!sp[4];
  if (dlg.showModal) dlg.showModal();
}
dlg.addEventListener('click', e => {
  const b = e.target.closest('[data-lv-bonus]'); if (b && current) { sock.send('h', { a: 'bonus', n: current, r: +b.dataset.lvBonus }); dlg.close(); return; }
  if (e.target.id === 'lv-dash-rename' && current) { sock.send('h', { a: 'rename', n: current }); dlg.close(); return; }
  if (e.target.id === 'lv-acc-apply' && current) {
    const x = +((dlg.querySelector('input[name="lv-acc-time"]:checked') || {}).value || 100);
    const sv = $('lv-acc-save');
    sock.send('h', { a: 'acc', n: current, x, ra: $('lv-acc-read').checked ? 1 : 0, sv: $('lv-acc-simple').checked ? 1 : 0, ...(sv && sv.checked ? { save: 1 } : {}) });
    dlg.close(); return;
  }
  if (e.target.id === 'lv-dash-remove' && current) { if (confirm(e.target.dataset.confirm)) { sock.send('h', { a: 'kick', n: current }); dlg.close(); } }
});
$('lv-dash-move').addEventListener('change', e => { if (current) sock.send('tm', { a: 'move', s: current, k: +e.target.value }); });

// ---- the question: text, choices with live bars, the answer behind a toggle ----
function drawQuestion() {
  const box = $('lv-dash-q'), bars = $('lv-dash-bars');
  const tg = $('lv-dash-answer-toggle'); tg.setAttribute('aria-pressed', String(showAnswer)); tg.textContent = showAnswer ? TX.hideAnswer : TX.showAnswer;
  if (!q) { box.textContent = ''; bars.textContent = ''; $('lv-dash-answered').textContent = ''; $('lv-dash-extra').hidden = true; return; }
  box.textContent = `${q.i + 1}/${q.n} · ${q.q}`;
  const counts = (q.revealed !== undefined ? q.counts : dq && dq.i === q.i ? dq.counts : null) || q.choices.map(() => 0);
  const right = q.revealed !== undefined ? q.revealed : dq && dq.i === q.i ? dq.answer : -1;
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  bars.textContent = '';
  q.choices.forEach((c, i) => {
    const li = document.createElement('li'); li.className = 'lv-dbar';
    const isRight = showAnswer && i === right;
    li.classList.toggle('is-right', isRight);
    const lab = document.createElement('span'); lab.className = 'lv-dbar-label'; lab.textContent = `${c}${isRight ? ' ✓' : ''}`;
    const n = document.createElement('span'); n.className = 'lv-dbar-n'; n.textContent = String(counts[i] || 0);
    const f = document.createElement('span'); f.className = 'lv-dbar-fill'; f.setAttribute('aria-hidden', 'true'); f.style.setProperty('--w', `${Math.round(100 * (counts[i] || 0) / total)}%`);
    li.append(lab, n, f); bars.append(li);
  });
  const connected = [...players.values()].filter(p => p.connected).length;
  // a limited co-host has the counts, not who answered
  const done = FULL ? answered.size : dq && dq.i === q.i ? dq.counts.reduce((x, y) => x + y, 0) : 0;
  $('lv-dash-answered').textContent = `${fill(TX.answers, { count: done })} · ${done}/${connected}`;
  const ex = $('lv-dash-extra'); ex.hidden = !(dq && dq.extra && phase === 'playing'); if (!ex.hidden) ex.textContent = fill(TX.extraWaiting, { count: dq.extra });
}
$('lv-dash-answer-toggle').addEventListener('click', () => { showAnswer = !showAnswer; store('lv:dash:answer', showAnswer ? '1' : '0'); drawQuestion(); });

// ---- teams: the board with team bonus, and the select-then-move editor ----
const teamsPanel = $('lv-tab-teams');
const editor = document.createElement('div'); editor.className = 'lv-team-cols lv-dash-editor'; editor.id = 'lv-dash-teamcols';
const live = document.createElement('p'); live.className = 'sr-only'; live.setAttribute('aria-live', 'polite');
const bonusRow = document.createElement('div'); bonusRow.className = 'lv-dash-teambonus';
teamsPanel.append(bonusRow, editor, live);
const ui = teamBoard({
  root: editor, live, presets,
  text: { moveHere: TT.moveHere, empty: TT.empty, unassigned: TT.unassigned, moved: TT.moved, size: TT.size },
  onMove: (seat, k) => sock.send('tm', { a: 'move', s: seat, k }),
});
const sizeOf = k => { let n = 0; for (const v of teams.of.values()) if (v === k) n++; return n; };
function drawTeams() {
  $('lv-dash-noteams').hidden = teams.on;
  teamBars($('lv-dash-teams'), teams.on ? teams.list.map(t => ({ k: t.k, p: t.p, size: sizeOf(t.k), ...(scores.get(t.k) || { score: 0, rank: 0 }) })) : [], presets, { scoring: teams.scoring, text: { perPlayer: TT.perPlayer } });
  // team bonus: a menu of the fixed reasons per team
  bonusRow.textContent = '';
  if (teams.on && phase !== 'ended') for (const t of teams.list) {
    const pr = presets[t.p]; if (!pr) continue;
    const d = document.createElement('details'); d.className = 'lv-dash-tb';
    const s = document.createElement('summary'); s.className = 'btn btn-sm'; s.append(teamChip(pr, t.k), ` · ${TX.bonusGive || '+100'}`); d.append(s);
    const g = document.createElement('div'); g.className = 'lv-say-list'; g.setAttribute('role', 'group');
    (D.bonus || []).forEach((label, r) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-sm'; b.dataset.lvTeamBonus = `${t.k}:${r}`; b.textContent = label; g.append(b); });
    d.append(g); bonusRow.append(d);
  }
  editor.hidden = !teams.on;
  if (teams.on) ui.render({ list: teams.list, of: teams.of, seats: [...players.values()].sort((a, b) => a.seat - b.seat).map(p => ({ seat: p.seat, name: nm(p.name) || `#${p.seat}` })), unassigned: false });
}
bonusRow.addEventListener('click', e => {
  const b = e.target.closest('[data-lv-team-bonus]'); if (!b) return;
  const [k, r] = b.dataset.lvTeamBonus.split(':').map(Number);
  sock.send('h', { a: 'bonus', k, r }); const d = b.closest('details'); if (d) d.open = false;
});

// ---- messages ----
$('lv-tab-messages').addEventListener('click', e => { const b = e.target.closest('[data-lv-say]'); if (b) { sock.send('h', { a: 'say', m: +b.dataset.lvSay }); flash($('lv-bonus-toast'), b.textContent, 2500); } });

// ---- settings ----
const sform = $('lv-dash-settings');
function fillSettings() {
  for (const el of sform.elements) {
    if (!el.name || !(el.name in settings)) continue;
    if (el.type === 'checkbox') el.checked = !!settings[el.name]; else if (el.type !== 'hidden') el.value = String(settings[el.name]);
  }
}
sform.addEventListener('submit', e => {
  e.preventDefault();
  const out = {};
  for (const el of sform.elements) {
    if (!el.name || el.type === 'hidden' || el.disabled) continue;
    const v = el.type === 'checkbox' ? el.checked : /^\d+$/.test(el.value) ? +el.value : el.value;
    if (settings[el.name] !== v) out[el.name] = v;
  }
  if (Object.keys(out).length) sock.send('cf', { d: out });
  flash($('lv-bonus-toast'), TX.saved || '✓', 2000);
});
fillSettings();
