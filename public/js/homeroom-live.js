// Homeroom, step 3a, the teacher's side of live class (docs/decisions.md "Homeroom, step 3a"; server:
// services/homeroom-live.js, GET /api/homeroom/<class>/pulse every 2 s while live and the page is visible):
//   - each desk: a calm status chip hanging under it (Working, Typing, Stuck, Done, Not here, At desk) with a small bar
//     for the handout they are on (that card is marked on the desk), "Needs a look" on a Stuck desk, ✋ when a hand is
//     up; a desk whose student is not here fades. No ranking, no red alarms.
//   - cursors: each student's named cursor moves around their own desk (played back from the samples the desk sent, a
//     couple of seconds behind); above 30 students, presence only (the server says so).
//   - ✋ Hands in the top bar (a count badge): the hands up in the order raised, Answered, the hall pass (Give hall pass
//     or Not now, who has it and for how long, who is next, "X is back", how long the pass lasts).
//   - 📊 Today: each handout handed out today (or since class started), Done / Working / Stuck / Not started as a
//     stacked bar, the Needs a look names, and the way to the Classroom tab for longer-term progress.
//   - tapping a desk (or its status chip) while live: a look at that student's desk in summary (current handout and how
//     far, their pad as a read-only drawing, their last activity), with Lock desk, Hide cursor and "I'm coming over".
// Nothing here is ever on the projector (its page and poll carry only the teacher's area and the live state).
import { t, api, toast, esc, sheet } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { inkLine } from '/js/board-ann.js';
import { DESK, TEAM_DESK } from '/js/homeroom-seats.js';

const tl = (k, v) => t(`js.homeroom-live.${k}`, v);
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const PAD = { w: 900, h: 600 };

/**
 * ctx: { D, H, th, api2, worldEl, setHo(ho), renderLive(), deskSheet(sid), groupOf(sid), nameOfId(sid), teamOf(sid),
 * handout(id) }. -> { paint, topButtons, onLive, click(e) -> true when it took the click, polling() }
 */
export function liveBoard(ctx) {
  const { D, H } = ctx;
  const LV = { data: null, timer: null, open: '', hv: '', look: null, lookTimer: null, curTimers: new Map(), curSeen: new Map() };
  const desks = () => (LV.data && LV.data.desks) || {};
  const live = () => !!H.live;

  // ---------------------------------------------------------------- polling
  async function poll() {
    clearTimeout(LV.timer); LV.timer = null;
    if (!live()) { LV.data = null; paint(); renderPanel(); return; }
    if (!document.hidden) {
      try {
        const r = await api(ctx.api2(`pulse?hv=${encodeURIComponent(LV.hv)}`), { background: true });
        LV.data = r; LV.hv = r.hv || '';
        if (r.ho) ctx.setHo(r.ho);
        if (!r.live && H.live) { H.live = null; ctx.renderLive(); }
        paint(); renderPanel(); ctx.renderLive();
      } catch { /* try again */ }
    }
    if (live()) LV.timer = setTimeout(poll, 2000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && live()) poll(); });

  // ---------------------------------------------------------------- the desks
  const stLabel = (st) => tl(`st.${st}`);
  const kindLabel = k => tl(`hand.${k}`);
  function chip(sid, d) {
    const cards = (H.ho.desks[sid] || []), card = cards.find(x => x.id === d.on), h = card && ctx.handout(card.id);
    const bar = card && !card.done && d.st !== 'away' && d.st !== 'stuck' ? `<span class="hr-lvbar" aria-hidden="true"><i style="width:${card.pct}%"></i></span>` : '';
    const name = ctx.nameOfId(sid);
    const what = h && d.st !== 'done' ? `, ${tl(d.where === 'game' ? 'inGame' : 'onDesk', { title: h.title })}` : '';
    return btn(`hr-lvchip st-${d.st}`, `data-hrlook="${esc(sid)}" aria-label="${esc(tl('chipLabel', { name, status: stLabel(d.st) }) + what)}"`,
      `<span class="hr-lvdot" aria-hidden="true"></span><span class="hr-lvt">${esc(stLabel(d.st))}</span>${bar}`);
  }
  function handBadge(sid, d, named = false) {
    if (!d.hand && d.pass !== 'out' && d.pass !== 'line') return '';
    const k = d.hand || 'bathroom', icon = k === 'bathroom' ? '🚻' : '✋';
    const label = d.pass === 'out' ? tl('pass.outShort') : d.pass === 'line' ? tl('pass.lineShort') : kindLabel(k);
    const tag = d.pass === 'out' ? tl('pass.outTag') : d.pass === 'line' ? tl('pass.lineTag') : kindLabel(k);
    return btn(`hr-lvhand${d.pass === 'out' ? ' out' : ''}`, `data-hrhands="1" aria-label="${esc(tl('handOf', { name: ctx.nameOfId(sid), what: label }))}"`, `${iconHtml(icon, { size: 14 })} ${named ? `<bdi>${esc(ctx.nameOfId(sid))}</bdi>: ` : ''}${esc(tag)}`);
  }
  const top = (el, html) => { const t2 = document.createElement('div'); t2.className = 'hr-lvtop'; t2.innerHTML = html; el.appendChild(t2); };
  /** Marks, chips and badges on every desk (after the desks were drawn, and after every poll). */
  function paint() {
    const W = ctx.worldEl, dd = desks(), on = live() && !!LV.data && !H.seatsOpen;
    for (const el of W.querySelectorAll('.hr-desk')) {
      for (const x of el.querySelectorAll(':scope > .hr-lv, :scope > .hr-lvtop')) x.remove();
      el.classList.remove('hr-away', 'hr-stuck');
      for (const c of el.querySelectorAll('.hr-card.on')) c.classList.remove('on');
      if (!on) continue;
      const members = el.dataset.team ? ((H.teams.find(x => x.id === el.dataset.team) || {}).members || []) : [el.dataset.sid];
      const ds = members.map(id => [id, dd[id]]).filter(([, d]) => d);
      if (!ds.length) continue;
      const box = document.createElement('div'); box.className = 'hr-lv';
      if (el.dataset.team) {
        // a team desk: one dot per member (their name in the label), Needs a look if any is stuck, the first hand up
        const stuck = ds.filter(([, d]) => d.st === 'stuck'), hand = ds.find(([, d]) => d.hand || d.pass);
        box.innerHTML = `<span class="hr-lvteam">${ds.map(([id, d]) => btn(`hr-lvm st-${d.st}`, `data-hrlook="${esc(id)}" aria-label="${esc(tl('chipLabel', { name: ctx.nameOfId(id), status: stLabel(d.st) }))}"`, `<span class="hr-lvdot" aria-hidden="true"></span><bdi>${esc(ctx.nameOfId(id))}</bdi>`)).join('')}</span>
          ${stuck.length ? `<span class="hr-lvflag">${esc(tl('needsLook'))}</span>` : ''}`;
        if (hand) top(el, handBadge(hand[0], hand[1], true));
        el.classList.toggle('hr-away', ds.every(([, d]) => d.st === 'away'));
        el.classList.toggle('hr-stuck', !!stuck.length);
      } else {
        const [sid, d] = ds[0];
        box.innerHTML = `${chip(sid, d)}${d.st === 'stuck' ? `<span class="hr-lvflag">${esc(tl('needsLook'))}</span>` : ''}`;
        const hb = handBadge(sid, d); if (hb) top(el, hb);
        el.classList.toggle('hr-away', d.st === 'away');
        el.classList.toggle('hr-stuck', d.st === 'stuck');
        if (d.on && d.st !== 'away') el.querySelector(`.hr-card[data-hrho="${CSS.escape(d.on)}"]`)?.classList.add('on');
      }
      el.appendChild(box);
    }
    paintCursors(on);
  }

  // ---------------------------------------------------------------- cursors
  function deskRect(sid) {
    const tm = ctx.teamOf(sid);
    if (tm) return { x: tm.x, y: tm.y, w: TEAM_DESK.w, h: TEAM_DESK.h };
    const p = H.seats[sid]; return p ? { x: p.x, y: p.y, w: DESK.w, h: DESK.h } : null;
  }
  function paintCursors(on) {
    let layer = ctx.worldEl.querySelector(':scope > .hr-curs');
    if (!on || !LV.data || !LV.data.cursors) { layer?.remove(); return; }
    if (!layer) { layer = document.createElement('div'); layer.className = 'hr-curs'; layer.setAttribute('aria-hidden', 'true'); ctx.worldEl.appendChild(layer); }
    const keep = new Set();
    for (const [sid, d] of Object.entries(desks())) {
      if (!d.cur || !d.cur.length) continue;
      const r = deskRect(sid); if (!r) continue;
      keep.add(sid);
      let el = layer.querySelector(`[data-cur="${CSS.escape(sid)}"]`);
      const g = ctx.groupOf(sid), c = g ? g.color : '#5D5A50';
      if (!el) {
        el = document.createElement('div'); el.className = 'hr-cur'; el.dataset.cur = sid;
        el.innerHTML = `<svg width="18" height="20" viewBox="0 0 18 20"><path d="M1 1l15 8-7 2-3 7z" fill="${esc(c)}" stroke="#fff" stroke-width="1.5"/></svg><span style="background:${esc(c)}"><bdi>${esc(ctx.nameOfId(sid))}</bdi></span>`;
        const [, x, y] = d.cur[0]; el.style.transform = `translate(${r.x + x * r.w}px, ${r.y + y * r.h}px)`;
        layer.appendChild(el);
      }
      // Play the new samples back with their own timing (the oldest now), so the cursor moves a few times a second; the
      // same samples can come in two polls, and play once.
      const seen = LV.curSeen.get(sid) || 0, fresh = d.cur.map(([age, x, y]) => [LV.data.now - age, x, y]).filter(p => p[0] > seen);
      if (!fresh.length) continue;
      LV.curSeen.set(sid, Math.max(...fresh.map(p => p[0])));
      (LV.curTimers.get(sid) || []).forEach(clearTimeout);
      const first = Math.min(...fresh.map(p => p[0]));
      LV.curTimers.set(sid, fresh.map(([at, x, y]) => setTimeout(() => { el.style.transform = `translate(${r.x + x * r.w}px, ${r.y + y * r.h}px)`; }, at - first)));
    }
    for (const el of [...layer.children]) if (!keep.has(el.dataset.cur)) { (LV.curTimers.get(el.dataset.cur) || []).forEach(clearTimeout); el.remove(); }
  }

  // ---------------------------------------------------------------- the top bar's buttons and panels
  const handsCount = () => (LV.data ? LV.data.hands.length : 0);
  function topButtons() {
    const n = handsCount();
    return `${btn(`btn hr-chunk hr-todaybtn${LV.open === 'today' ? ' on' : ''}`, `data-hrpanel="today" aria-expanded="${LV.open === 'today'}" aria-label="${esc(tl('today.title'))}"`, `${iconHtml('📊', { size: 18 })}<span class="hr-hidephone"> ${esc(tl('today.button'))}</span>`)}
      ${live() ? btn(`btn hr-chunk hr-handsbtn${LV.open === 'hands' ? ' on' : ''}`, `data-hrpanel="hands" aria-expanded="${LV.open === 'hands'}" aria-label="${esc(tl('hands.label', { count: n }))}"`, `${iconHtml('✋', { size: 18 })}<span class="hr-hidephone"> ${esc(tl('hands.button'))}</span>${n ? `<span class="hr-count" aria-hidden="true">${n}</span>` : ''}`) : ''}`;
  }
  function panelEl() {
    let el = document.getElementById('hr-flpanel');
    if (!el) { el = document.createElement('section'); el.id = 'hr-flpanel'; el.className = 'hr-fl'; el.hidden = true; document.querySelector('.hr-stage')?.appendChild(el); }
    return el;
  }
  const mmss = s => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`;
  const skew = () => (LV.data ? Date.now() - LV.data.now : 0);
  function passClock(p) {
    if (!p || !p.out) return '';
    const left = Math.round((p.out.at + p.minutes * 60e3 - (Date.now() - skew())) / 1000);
    return left > 0 ? tl('pass.left', { time: mmss(left) }) : tl('pass.over', { time: mmss(left) });
  }
  function handsHtml() {
    const d = LV.data || { hands: [], pass: { minutes: 5, out: null, line: [] } }, p = d.pass;
    const rows = d.hands.map(h => `<li class="hr-hrow"><span class="hr-hwho"><b><bdi>${esc(h.name)}</bdi></b> <span class="hr-hkind k-${esc(h.kind)}">${iconHtml(h.kind === 'bathroom' ? '🚻' : h.kind === 'help' ? '🆘' : '💬', { size: 16 })} ${esc(kindLabel(h.kind))}</span></span>
      <span class="hr-hacts">${h.kind === 'bathroom' ? `${btn('btn btn-sm', `data-hrhand="notNow:${esc(h.id)}"`, esc(tl('hands.notNow')))}${btn('btn btn-sm btn-primary', `data-hrhand="pass:${esc(h.id)}"`, esc(p.out ? tl('hands.putInLine') : tl('hands.givePass')))}`
        : btn('btn btn-sm btn-primary', `data-hrhand="answer:${esc(h.id)}"`, esc(tl('hands.answered')))}</span></li>`).join('');
    const left = p.out ? Math.round((p.out.at + p.minutes * 60e3 - (Date.now() - skew())) / 1000) : 0;
    return `<header class="hr-flhead"><h2 id="hr-flh">${iconHtml('✋', { size: 20 })} ${esc(tl('hands.title'))}</h2>${btn('iconbtn hr-flclose', `data-hrpanel="" aria-label="${esc(tl('close'))}"`, iconHtml('✖️', { size: 16 }))}</header>
      ${rows ? `<ol class="plain hr-hlist">${rows}</ol>` : `<p class="small muted">${esc(tl('hands.none'))}</p>`}
      <h3 class="hr-flsub">${iconHtml('🚻', { size: 18 })} ${esc(tl('pass.title'))}</h3>
      ${p.out ? `<div class="hr-pout${left <= 0 ? ' over' : ''}"><span><b><bdi>${esc(p.out.name)}</bdi></b> <span class="hr-pclock" id="hr-pclock">${esc(passClock(p))}</span></span>${btn('btn btn-sm btn-primary', `data-hrhand="back:${esc(p.out.id)}"`, esc(tl('pass.isBack', { name: p.out.name })))}</div>` : `<p class="small muted">${esc(tl('pass.nobody'))}</p>`}
      ${p.line.length ? `<ol class="plain hr-pline">${p.line.map((x, i) => `<li><span>${esc(i ? tl('pass.then') : tl('pass.next'))} <b><bdi>${esc(x.name)}</bdi></b></span>${btn('btn btn-sm', `data-hrhand="back:${esc(x.id)}" aria-label="${esc(tl('pass.removeLine', { name: x.name }))}"`, '×')}</li>`).join('')}</ol>` : ''}
      <div class="hr-pmin"><span id="hr-pminl">${esc(tl('pass.length'))}</span>${btn('btn btn-sm hr-pstep', `data-hrmin="-1" aria-label="${esc(tl('pass.less'))}"${p.minutes <= (D.pulse || {}).passMin ? ' disabled' : ''}`, '−')}<b aria-live="polite">${esc(tl('pass.minutes', { count: p.minutes }))}</b>${btn('btn btn-sm hr-pstep', `data-hrmin="1" aria-label="${esc(tl('pass.more'))}"${p.minutes >= (D.pulse || {}).passMax ? ' disabled' : ''}`, '+')}</div>
      <p class="small muted hr-flnote">${esc(tl('hands.private'))}</p>`;
  }
  /** Today's handouts: handed out since the start of the teacher's day, or since this live class started. */
  function todayHandouts() {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const since = Math.min(d0.getTime(), H.live ? H.live.since : Infinity);
    return H.ho.handouts.filter(h => (h.at || 0) >= since);
  }
  function todayHtml() {
    const list = todayHandouts(), dd = desks(), look = new Set();
    const rows = list.map(h => {
      let done = 0, stuck = 0, work = 0, total = 0;
      for (const s of H.students) {
        const card = (H.ho.desks[s.id] || []).find(x => x.id === h.id); if (!card) continue;
        total++;
        const d = dd[s.id];
        if (card.done) done++;
        else if (d && d.st === 'stuck' && d.on === h.id) { stuck++; look.add(s.id); }
        else if (card.pct > 0 || (d && d.on === h.id && d.st !== 'away')) work++;
      }
      const none = total - done - stuck - work, pc = n => (total ? (100 * n) / total : 0);
      return `<li class="hr-tg"><div class="hr-tgh"><b dir="auto">${iconHtml(h.icon, { size: 16 })} ${esc(h.title)}</b><span>${esc(tl('today.doneOf', { done, total }))}</span></div>
        <div class="hr-tgbar" role="img" aria-label="${esc(tl('today.barLabel', { done, work, stuck, none }))}"><i class="d" style="width:${pc(done)}%"></i><i class="w" style="width:${pc(work)}%"></i><i class="s" style="width:${pc(stuck)}%"></i></div>
        <p class="hr-tgnums small">${esc(tl('today.nums', { done, work, stuck, none }))}</p></li>`;
    }).join('');
    for (const [sid, d] of Object.entries(dd)) if (d.st === 'stuck') look.add(sid);
    const names = [...look].map(id => btn('hr-lookname', `data-hrlook="${esc(id)}"`, `<bdi>${esc(ctx.nameOfId(id))}</bdi>`)).join('');
    return `<header class="hr-flhead"><h2 id="hr-flh">${iconHtml('📊', { size: 20 })} ${esc(tl('today.title'))}</h2>${btn('iconbtn hr-flclose', `data-hrpanel="" aria-label="${esc(tl('close'))}"`, iconHtml('✖️', { size: 16 }))}</header>
      <p class="small muted">${esc(live() ? tl('today.leadLive') : tl('today.lead'))}</p>
      ${rows ? `<ol class="plain hr-tglist">${rows}</ol><div class="hr-tgkey" aria-hidden="true"><span><i class="d"></i>${esc(tl('today.done'))}</span><span><i class="w"></i>${esc(tl('today.working'))}</span><span><i class="s"></i>${esc(tl('today.stuck'))}</span><span><i></i>${esc(tl('today.notStarted'))}</span></div>` : `<p class="muted">${esc(tl('today.none'))}</p>`}
      ${names ? `<div class="hr-tgflag"><b>${esc(tl('needsLook'))}:</b> ${names}</div>` : ''}
      <p class="small hr-flnote">${esc(tl('today.weeks'))} <a href="/class/${esc(encodeURIComponent(D.classId))}/progress">${esc(tl('today.classroom'))}</a></p>`;
  }
  function renderPanel() {
    const el = panelEl();
    if (LV.open === 'hands' && !live()) LV.open = '';
    el.hidden = !LV.open;
    if (!LV.open) { el.innerHTML = ''; return; }
    // keep the focus where it was across the 2 s refresh
    const f = document.activeElement && el.contains(document.activeElement) ? [...el.querySelectorAll('button,a')].indexOf(document.activeElement) : -1;
    el.setAttribute('aria-labelledby', 'hr-flh');
    el.innerHTML = LV.open === 'hands' ? handsHtml() : todayHtml();
    if (f >= 0) el.querySelectorAll('button,a')[f]?.focus();
  }
  function openPanel(k) {
    LV.open = LV.open === k ? '' : k;
    renderPanel(); ctx.renderLive();
    if (LV.open) panelEl().querySelector('button,a')?.focus();
  }
  setInterval(() => { if (LV.open === 'hands' && LV.data && LV.data.pass.out) { const el = document.getElementById('hr-pclock'); if (el) el.textContent = passClock(LV.data.pass); } }, 1000);

  async function handAct(v) {
    const [action, studentId] = v.split(':');
    try {
      const r = await api(ctx.api2('hands'), { method: 'POST', body: { action, studentId } });
      if (LV.data) Object.assign(LV.data, { hands: r.hands, pass: r.pass });
      toast(tl(`hands.done.${action}`));
      poll();
    } catch (e) { toast(e.message, { bad: true }); }
  }
  async function setMinutes(delta) {
    const cur = LV.data ? LV.data.pass.minutes : 5;
    try { const r = await api(ctx.api2('hands'), { method: 'POST', body: { action: 'minutes', minutes: cur + delta } }); if (LV.data) Object.assign(LV.data, { hands: r.hands, pass: r.pass }); renderPanel(); }
    catch (e) { toast(e.message, { bad: true }); }
  }

  // ---------------------------------------------------------------- look at a student's desk
  const ago = at => {
    if (!at) return tl('look.never');
    const s = Math.max(0, Math.round((Date.now() - skew() - at) / 1000));
    try { const f = new Intl.RelativeTimeFormat(document.documentElement.lang || undefined, { numeric: 'auto' }); return s < 60 ? f.format(-s, 'second') : f.format(-Math.round(s / 60), 'minute'); } catch { return `${s}s`; }
  };
  function lookHtml(x) {
    const fl = x.flags || {};
    const on = x.on ? `<div class="hr-lkon">${iconHtml(x.on.icon, { size: 22 })}<div><b dir="auto">${esc(x.on.title)}</b><span class="small muted">${esc(x.on.done ? tl('look.done') : tl('look.pct', { pct: x.on.pct }))}</span>
        <span class="hr-lvbar big" aria-hidden="true"><i style="width:${x.on.done ? 100 : x.on.pct}%"></i></span></div></div>` : `<p class="muted">${esc(x.total ? tl('look.allDone') : tl('look.nothing'))}</p>`;
    const stuckNote = x.st === 'stuck' ? `<p class="hr-lkstuck">${esc(tl('look.stuckNote', { min: (D.pulse || {}).stuckMin || 3 }))}</p>` : '';
    return `<div class="hr-look" data-look="${esc(x.id)}">
      <div class="hr-lkhead"><span class="hr-lvchip st-${esc(x.st)} static"><span class="hr-lvdot" aria-hidden="true"></span><span class="hr-lvt">${esc(stLabel(x.st))}</span></span>
        <span class="small muted">${esc(x.st === 'away' ? tl('look.lastSeen', { when: ago(x.at) }) : `${tl(x.where === 'game' ? 'look.whereGame' : 'look.whereDesk')} · ${tl('look.activity', { when: ago(x.inputAt || x.at) })}`)}</span></div>
      ${stuckNote}
      <h3 class="hr-flsub">${esc(tl('look.on'))}</h3>${on}
      <p class="small muted">${esc(tl('look.progress', { done: x.done, total: x.total }))}</p>
      ${x.hand || x.pass ? `<p class="hr-lkhand">${iconHtml(x.pass || x.hand === 'bathroom' ? '🚻' : '✋', { size: 18 })} ${esc(x.pass === 'out' ? tl('pass.outShort') : x.pass === 'line' ? tl('pass.lineShort') : kindLabel(x.hand))}</p>` : ''}
      <h3 class="hr-flsub">${esc(x.team ? tl('look.teamPad') : tl('look.pad'))}</h3>
      <div class="hr-lkpad"><svg viewBox="0 0 ${PAD.w} ${PAD.h}" role="img" aria-label="${esc(tl('look.padLabel', { name: x.name }))}"><rect x="1" y="1" width="${PAD.w - 2}" height="${PAD.h - 2}" rx="14" class="hd-paper"/>${(x.strokes || []).map(s => inkLine(s, PAD.w, PAD.h)).join('')}</svg>${(x.strokes || []).length ? '' : `<span class="hr-lkempty small muted">${esc(tl('look.padEmpty'))}</span>`}</div>
      <p class="small muted">${esc(tl('look.private'))}</p>
      <div class="row hr-lkacts">
        ${btn(`btn hr-chunk${fl.coming ? ' on' : ''}`, `data-hrflag="coming" aria-pressed="${!!fl.coming}"`, `${iconHtml('🚶', { size: 18 })} ${esc(fl.coming ? tl('look.comingOn') : tl('look.coming'))}`)}
        ${btn(`btn hr-chunk${fl.locked ? ' on' : ''}`, `data-hrflag="lock" aria-pressed="${!!fl.locked}"`, `${iconHtml(fl.locked ? '🔓' : '🔒', { size: 18 })} ${esc(fl.locked ? tl('look.unlock') : tl('look.lock'))}`)}
        ${btn(`btn hr-chunk${fl.hidden ? ' on' : ''}`, `data-hrflag="hide" aria-pressed="${!!fl.hidden}"`, `${iconHtml('🙈', { size: 18 })} ${esc(fl.hidden ? tl('look.showCursor') : tl('look.hideCursor'))}`)}
        ${btn('btn hr-chunk', 'data-hrlkdesk', `${iconHtml('🎒', { size: 18 })} ${esc(tl('look.handouts'))}`)}
      </div></div>`;
  }
  async function look(sid) {
    if (LV.look) LV.look.sh.close();
    const name = ctx.nameOfId(sid);
    const sh = sheet({ title: `👀 ${tl('look.title', { name })}`, content: `<div class="hr-lookbox"><p class="muted">${esc(tl('look.loading'))}</p></div>`, onClose: () => { clearInterval(LV.lookTimer); LV.look = null; } });
    const box = sh.el.querySelector('.hr-lookbox');
    LV.look = { sid, sh };
    const load = async () => {
      try {
        const x = await api(ctx.api2(`look/${encodeURIComponent(sid)}`), { background: true });
        if (!LV.look || LV.look.sid !== sid) return;
        const f = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.hrflag || (document.activeElement.hasAttribute('data-hrlkdesk') ? 'desk' : '') : '';
        box.innerHTML = lookHtml(x);
        if (f) box.querySelector(f === 'desk' ? '[data-hrlkdesk]' : `[data-hrflag="${f}"]`)?.focus();
      } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
    };
    box.addEventListener('click', async e => {
      const fb = e.target.closest('[data-hrflag]');
      if (fb) {
        const flag = fb.dataset.hrflag, on = fb.getAttribute('aria-pressed') !== 'true';
        try { await api(ctx.api2('desk-flag'), { method: 'POST', body: { studentId: sid, flag, on } }); toast(tl(`look.toast.${flag}${on ? 'On' : 'Off'}`, { name })); await load(); poll(); }
        catch (err) { toast(err.message, { bad: true }); }
        return;
      }
      if (e.target.closest('[data-hrlkdesk]')) { sh.close(); ctx.deskSheet(sid); }
    });
    await load();
    LV.lookTimer = setInterval(load, 4000);
  }

  // ---------------------------------------------------------------- clicks
  function click(e) {
    const p = e.target.closest('[data-hrpanel]'); if (p) { openPanel(p.dataset.hrpanel); return true; }
    if (e.target.closest('[data-hrhands]')) { if (LV.open !== 'hands') openPanel('hands'); return true; }
    const hh = e.target.closest('[data-hrhand]'); if (hh) { handAct(hh.dataset.hrhand); return true; }
    const mn = e.target.closest('[data-hrmin]'); if (mn) { setMinutes(+mn.dataset.hrmin); return true; }
    const lk = e.target.closest('[data-hrlook]'); if (lk) { look(lk.dataset.hrlook); return true; }
    if (!live() || H.seatsOpen || H.pick) return false;
    // While live a team member's name looks at their desk (their handouts are one tap away from there).
    const tn = e.target.closest('.hr-tname[data-hrdesk]'); if (tn) { look(tn.dataset.hrdesk); return true; }
    return false;
  }
  /** A desk tapped (not one of its buttons) while live: look at it. */
  function tapDesk(desk) {
    if (!live() || H.seatsOpen || H.pick || !desk.dataset.sid) return false;
    look(desk.dataset.sid); return true;
  }
  return {
    paint, topButtons, click, tapDesk,
    /** Live class started or ended on this page. */
    onLive() { LV.hv = ''; if (live()) poll(); else { clearTimeout(LV.timer); LV.data = null; if (LV.look) LV.look.sh.close(); paint(); renderPanel(); } },
    polling: () => live(),
    escape() { if (LV.open) { openPanel(LV.open); return true; } return false; },
  };
}
