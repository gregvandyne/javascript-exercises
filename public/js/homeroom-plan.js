// The day plan on the teacher's board, the projector and a desk (docs/decisions.md "Homeroom: the day plan"; server:
// services/homeroom-plan.js, routes/homeroom.js /api/homeroom/<class>/plan). The plan itself is drafted, changed, used,
// saved and copied in the Oomba chat only (public/js/companion.js draws its card); there is no plan row on the board.
// Here:
//   - planPill(ctx): the plan pill in the shared top bar. No plan: "Plan today" (opens the Oomba chat). A plan on desks:
//     "Today: <name> · 36 min" and Start plan. Running: "Now: <part> 12:34" and "Next: <part>", with +5 min and Next
//     beside it; when the part's time is up the pill turns yellow ("Time's up") and stays on that part until the teacher
//     taps Next: it never moves on by itself. Running behind is said calmly in its tooltip and menu ("About 5 min
//     behind"), never in red. The pill's menu lists the parts; Finish class shows the short summary (parts done, time
//     used against planned, handouts finished per part as counts); unfinished handouts stay on desks as homework.
//     The timer is the server's (a reload, another device and the projector agree); the page only counts down between
//     polls. On the Homeroom view the Oomba chat knows this class's Homeroom is on screen (public/js/oomba-bus.js), so
//     its plan tools are there.
//     Week plans (docs/decisions.md "Homeroom: week plans, due dates, copying plans"; services/homeroom-week.js): on a
//     day of a saved week the pill has that day's plan ("Today", Start; the menu's Put on desks only hands out), and the
//     menu has the week strip (Mon..Fri chips: open a day, swap two days, clear one). With no plan today but a week, the
//     pill says "This week" and opens the strip. Still no plan row on the board.
//   - nowNextHtml(view): the projector's and the desk's Now / Next line: part names and the timer only.
import { t, api, esc, toast, sheet, ask } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { placePopover } from '/js/popover-place.js';
import * as BUS from '/js/oomba-bus.js';
import { timing, clock } from '/js/homeroom-plan-time.js';

const tp = (k, v) => t(`js.homeroom-plan.${k}`, v);
const ic = (e, size = 18) => iconHtml(e, { size });
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
/** A part's name: its title, else its kind ("Work time"). */
export const partName = p => (p ? p.title || tp(`kind.${p.kind}`) : '');

/** The projector's and a desk's Now / Next (view: services/homeroom-plan.js publicView; skew: the page's clock minus the
 *  server's). '' when no plan runs. */
export function nowNextHtml(v, skew = 0, { clockOn = true } = {}) {
  if (!v) return '';
  if (v.done) return `<span class="hr-nn-now">${ic('🏁')} ${esc(tp('allDone'))}</span>`;
  const left = v.endsAt - (Date.now() - skew), up = clockOn && left <= 0;   // a desk (no clock) never says Time's up
  return `<span class="hr-nn-now${up ? ' up' : ''}"><span class="hr-nn-cap">${esc(up ? tp('timesUp') : tp('now'))}</span> <b dir="auto">${esc(partName(v.part))}</b>${clockOn && !up ? ` <span class="hr-nn-clock" data-hrclock>${esc(clock(left))}</span>` : ''}</span>${v.next ? `<span class="hr-nn-next"><span class="hr-nn-cap">${esc(tp('next'))}</span> <span dir="auto">${esc(partName(v.next))}</span></span>` : ''}`;
}

/**
 * The board's plan pill. ctx: { D (page data: classId, className, plan), H (the board's state: away), viewEl }. ->
 * { running(), finish() -> the summary shown, refresh() }
 */
export function planPill(ctx) {
  const { D } = ctx;
  // An aide (step 3c) sees the plan and its timer but changes nothing: no Start, +5 min, Next, Finish, Clear or chat.
  const RO = !!ctx.readOnly;
  // week: the menu's week strip (services/homeroom-week.js stripOf): the day open in it, and the day being swapped
  const P = { plan: D.plan || null, skew: D.plan ? Date.now() - D.plan.now : 0, menu: false, busy: false, sig: '', timer: null, wkSel: null, wkSwap: null };
  const host = () => document.getElementById('hr-plan');
  const path = `/api/homeroom/${encodeURIComponent(D.classId)}/plan`;
  const at = () => Date.now() - P.skew;
  const tm = () => (P.plan ? timing(P.plan.parts, P.plan.state === 'running' || P.plan.state === 'done' ? P.plan.run : null, at()) : null);
  const minutes = n => tp('min', { count: n });
  const behindText = n => (n > 0 ? tp('behind', { count: n }) : tp('onTime'));

  function take(plan) {
    P.plan = plan || null;
    P.skew = plan ? Date.now() - plan.now : 0;
    render(true);
  }
  // ---------------------------------------------------------------- the pill
  function pillHtml() {
    const p = P.plan, x = tm();
    if ((!p || p.state === 'none') && RO) return '';
    // no plan today, but a week plan: the pill opens the week strip (and Plan today in the chat from there)
    if (p && p.state === 'none') return btn('btn hr-chunk hr-planpill', `data-hrplan="menu" aria-expanded="${P.menu}" aria-haspopup="true" aria-label="${esc(tp('weekLabel'))}"`, `${ic('🗓️')}<span class="hr-pp-word"> ${esc(tp('thisWeek'))}</span>`);
    if (!p) return btn('btn hr-chunk hr-planpill', `data-hrplan="ask" aria-label="${esc(tp('askLabel'))}" title="${esc(tp('askLabel'))}"`, `${ic('🗓️')}<span class="hr-pp-word"> ${esc(tp('planToday'))}</span>`);
    const menuAttrs = `data-hrplan="menu" aria-expanded="${P.menu}" aria-haspopup="true"`;
    if (p.state === 'ready' || p.state === 'planned') {
      return `${btn('btn hr-chunk hr-planpill', `${menuAttrs} aria-label="${esc(tp('todayLabel', { name: p.name || tp('title'), minutes: x.plannedMin }))}"`, `${ic('🗓️')}<span class="hr-pp-t"><span class="hr-pp-cap">${esc(tp('today'))}</span> <b dir="auto">${esc(p.name || tp('title'))}</b> <span class="hr-pp-sub">${esc(minutes(x.plannedMin))}</span></span>`)}
        ${RO ? '' : btn('btn hr-chunk hr-spark hr-pp-act', `data-hrplan="start" aria-label="${esc(tp('start'))}"`, `${ic('▶️')}<span class="hr-hidephone"> ${esc(tp('start'))}</span>`)}`;
    }
    if (p.state === 'finished') return btn('btn hr-chunk hr-planpill', `${menuAttrs} aria-label="${esc(tp('finishedLabel'))}"`, `${ic('🏁')}<span class="hr-pp-t"><b>${esc(tp('finished'))}</b></span>`);
    if (x.done) {
      return `${btn('btn hr-chunk hr-planpill', `${menuAttrs} title="${esc(behindText(x.behindMin))}" aria-label="${esc(tp('allDone'))}"`, `${ic('✅')}<span class="hr-pp-t"><b>${esc(tp('allDone'))}</b></span>`)}
        ${RO ? '' : btn('btn hr-chunk hr-spark hr-pp-act', `data-hrplan="finish" aria-label="${esc(tp('finish'))}"`, `${ic('🏁')}<span class="hr-hidephone"> ${esc(tp('finish'))}</span>`)}`;
    }
    const up = x.timesUp, tip = `${behindText(x.behindMin)}${x.next ? ` · ${tp('next')} ${partName(x.next)}` : ''}`;
    return `${btn(`btn hr-chunk hr-planpill hr-pp-run${up ? ' up' : ''}`, `${menuAttrs} title="${esc(tip)}" aria-label="${esc(up ? tp('upLabel', { part: partName(x.part) }) : tp('nowLabel', { part: partName(x.part) }))}"`,
      `${ic(up ? '⌛' : '⏱️')}<span class="hr-pp-t"><span class="hr-pp-l1"><span class="hr-pp-cap">${esc(up ? tp('timesUp') : tp('now'))}</span><b dir="auto">${esc(partName(x.part))}</b>${up ? '' : `<span class="hr-pp-clock" data-hrclock>${esc(clock(x.left))}</span>`}</span>${x.next ? `<span class="hr-pp-sub hr-pp-l2">${esc(tp('next'))} <span dir="auto">${esc(partName(x.next))}</span></span>` : `<span class="hr-pp-sub hr-pp-l2">${esc(tp('lastPart'))}</span>`}</span>`)}
      ${RO ? '' : `${btn('btn hr-chunk hr-pp-act', `data-hrplan="more" aria-label="${esc(tp('moreLabel'))}"`, `<span>${esc(tp('more'))}</span>`)}
      ${btn(`btn hr-chunk hr-pp-act${up ? ' hr-spark' : ''}`, `data-hrplan="next" aria-label="${esc(x.next ? tp('nextLabel', { part: partName(x.next) }) : tp('endLast'))}"`, `${ic('⏭️')}<span class="hr-hidephone"> ${esc(tp('nextBtn'))}</span>`)}`}`;
  }
  /** Redraw only when something but the seconds changed (the focus stays put); the seconds are written in place. */
  function render(force = false) {
    const el = host(); if (!el) return;
    const x = tm(), p = P.plan;
    const sig = JSON.stringify([p && p.id, p && p.state, p && p.run && p.run.idx, p && p.run && p.run.extra, x && x.timesUp, x && x.done, x && x.behindMin, P.menu, p && p.week && JSON.stringify(p.week), P.wkSel, P.wkSwap]);
    if (force || sig !== P.sig) {
      const f = document.activeElement && el.contains(document.activeElement) ? document.activeElement.dataset.hrplan : null;
      P.sig = sig; el.innerHTML = pillHtml();
      if (f) el.querySelector(`[data-hrplan="${f}"]`)?.focus();
      if (P.menu) renderMenu();
    } else if (x && x.left !== null) for (const c of el.querySelectorAll('[data-hrclock]')) { if (c.firstChild) c.firstChild.nodeValue = clock(x.left); }   // (the text node only: the bar's fit() watches for new nodes, not seconds)
    el.classList.toggle('on', !!p);
  }
  // ---------------------------------------------------------------- the menu
  function menuEl() {
    let el = document.getElementById('hr-planmenu');
    if (!el) { el = document.createElement('div'); el.id = 'hr-planmenu'; document.body.appendChild(el); }
    return el;
  }
  /** The week strip (Mon..Fri chips): a day opens its parts here, and can be swapped with another day or cleared. Never
   *  a plan row on the board: planning stays in the chat and this pill. */
  function weekHtml(w) {
    if (!w || !w.days) return '';
    const sel = w.days.find(d => d.date === P.wkSel) || null;
    const chips = w.days.map(d => {
      const lab = `${dayOf(d.date)}${d.plan ? `, ${d.plan.name || tp('title')}, ${minutes(d.plan.minutes)}` : `, ${tp('wk.none')}`}`;
      const target = P.wkSwap && P.wkSwap !== d.date && !d.past;
      return `<button type="button" class="hr-wk-chip${d.today ? ' today' : ''}${d.past ? ' past' : ''}${d.plan ? '' : ' empty'}${d.used ? ' used' : ''}${sel && sel.date === d.date ? ' sel' : ''}${target ? ' target' : ''}" data-hrplan="wkday" data-day="${esc(d.date)}" aria-pressed="${!!sel && sel.date === d.date}" aria-label="${esc(target ? tp('wk.swapWith', { day: dayOf(d.date, true) }) : lab)}">
        <b>${esc(dayOf(d.date))}</b><small>${d.plan ? esc(minutes(d.plan.minutes)) : '·'}</small>${d.today ? `<i class="hr-wk-dot" aria-hidden="true"></i>` : ''}</button>`;
    }).join('');
    let open = '';
    if (P.wkSwap) open = `<p class="hr-wk-note">${ic('🔁', 16)} ${esc(tp('wk.pickSwap', { day: dayOf(P.wkSwap, true) }))}</p>${btn('btn btn-sm btn-ghost', 'data-hrplan="wkcancel"', esc(tp('wk.cancel')))}`;
    else if (sel) {
      const pl = sel.plan;
      open = `<p class="hr-wk-h2"><b>${esc(dayOf(sel.date, true))}</b>${pl ? ` · <span dir="auto">${esc(pl.name || tp('title'))}</span> · ${esc(minutes(pl.minutes))}${pl.half ? ` · ${esc(tp('wk.half'))}` : ''}` : ''}</p>
        ${pl ? `<ol class="plain hr-wk-parts">${pl.parts.map(q => `<li><span dir="auto">${esc(partName(q))}</span><span class="hr-pm-min">${esc(minutes(q.minutes))}</span></li>`).join('')}</ol>` : `<p class="small muted">${esc(tp('wk.noneLong'))}</p>`}
        ${sel.used ? `<p class="small muted">${esc(tp('wk.inUse'))}</p>` : sel.past ? `<p class="small muted">${esc(tp('wk.pastDay'))}</p>` : RO ? ''
          : `<div class="hr-wk-acts">${btn('btn btn-sm', `data-hrplan="wkswap" data-day="${esc(sel.date)}"`, `${ic('🔁', 16)} ${esc(tp('wk.swap'))}`)}${pl ? btn('btn btn-sm btn-ghost', `data-hrplan="wkclear" data-day="${esc(sel.date)}"`, esc(tp('wk.clear'))) : ''}</div>`}`;
    }
    return `<section class="hr-wk" aria-labelledby="hr-wkh"><h3 class="hr-wk-h" id="hr-wkh">${ic('🗓️', 16)} ${esc(tp('thisWeek'))}</h3>
      <div class="hr-wk-days">${chips}</div>${open ? `<div class="hr-wk-open">${open}</div>` : ''}</section>`;
  }
  const dayOf = (iso, long = false) => { try { return new Date(`${iso}T00:00:00Z`).toLocaleDateString(document.documentElement.lang || undefined, { weekday: long ? 'long' : 'short', timeZone: 'UTC' }); } catch { return iso; } };
  function menuHtml() {
    const p = P.plan, x = tm();
    if (p.state === 'none') {
      return `<div class="rm-menu panel hr-planmenu" role="dialog" aria-labelledby="hr-wkh"><div class="hr-pm-body">${weekHtml(p.week)}
        <div class="hr-pm-foot">${RO ? '' : btn('btn btn-sm btn-ghost', 'data-hrplan="ask"', `${ic('💬', 16)} ${esc(tp('planTodayChat'))}`)}</div></div></div>`;
    }
    const rows = p.parts.map((q, i) => {
      const done = p.run && (p.run.done || i < p.run.idx), now = p.state === 'running' && !x.done && i === x.idx;
      return `<li class="hr-pm-part${now ? ' now' : ''}${done ? ' done' : ''}"><span class="hr-pm-mark" aria-hidden="true">${done ? '✓' : now ? '▶' : i + 1}</span><span class="hr-pm-name" dir="auto">${esc(partName(q))}</span><span class="hr-pm-min">${esc(minutes(q.minutes))}${now && p.run.extra ? ` <small>${esc(tp('added', { count: Math.round(p.run.extra / 60e3) }))}</small>` : ''}</span></li>`;
    }).join('');
    const running = p.state === 'running' && !x.done;
    const acts = RO ? '' : p.state === 'planned' ? `${btn('btn btn-primary', 'data-hrplan="start"', `${ic('▶️', 16)} ${esc(tp('start'))}`)}${btn('btn', 'data-hrplan="use"', `${ic('🎒', 16)} ${esc(tp('putOnDesks'))}`)}`
      : p.state === 'ready' ? btn('btn btn-primary', 'data-hrplan="start"', `${ic('▶️', 16)} ${esc(tp('start'))}`)
      : running ? `${btn('btn', 'data-hrplan="more"', esc(tp('more')))}${btn('btn btn-primary', 'data-hrplan="next"', `${ic('⏭️', 16)} ${esc(x.next ? tp('nextTo', { part: partName(x.next) }) : tp('endLast'))}`)}${btn('btn', 'data-hrplan="finish"', `${ic('🏁', 16)} ${esc(tp('finish'))}`)}`
        : p.state === 'done' ? btn('btn btn-primary', 'data-hrplan="finish"', `${ic('🏁', 16)} ${esc(tp('finish'))}`)
          : p.summary ? btn('btn btn-primary', 'data-hrplan="summary"', `${ic('🏁', 16)} ${esc(tp('showSummary'))}`) : '';
    return `<div class="rm-menu panel hr-planmenu" role="dialog" aria-labelledby="hr-pmh"><div class="hr-pm-body">
      <h2 class="hr-pm-h" id="hr-pmh">${ic('🗓️', 20)} <span dir="auto">${esc(p.name || tp('title'))}</span> <span class="hr-pm-tot">${esc(minutes(x.plannedMin))}</span></h2>
      ${p.run && p.state !== 'finished' ? `<p class="hr-pm-behind${x.behindMin > 0 ? ' late' : ''}">${ic(x.behindMin > 0 ? '🐢' : '👍', 16)} ${esc(x.behindMin > 0 ? tp('behindLong', { count: x.behindMin }) : tp('onTimeLong'))}</p>` : ''}
      ${p.state === 'planned' ? `<p class="small muted hr-pm-note">${esc(tp('fromWeek'))}</p>` : ''}
      <ol class="plain hr-pm-parts">${rows}</ol>
      <div class="hr-pm-acts">${acts}</div>${weekHtml(p.week)}
      <div class="hr-pm-foot">${RO ? '' : btn('btn btn-sm btn-ghost', 'data-hrplan="ask"', `${ic('💬', 16)} ${esc(tp('change'))}`)}${RO || ['running', 'done', 'planned'].includes(p.state) ? '' : btn('btn btn-sm btn-ghost', 'data-hrplan="clear"', esc(tp('clear')))}</div>
      ${p.state === 'running' && x.timesUp ? `<p class="small muted hr-pm-note">${esc(tp('neverMoves'))}</p>` : ''}</div></div>`;
  }
  function renderMenu() {
    const el = menuEl(), b = host() && host().querySelector('[data-hrplan="menu"]');
    if (!P.menu || !P.plan || !b) { P.menu = false; el.innerHTML = ''; return; }
    el.innerHTML = menuHtml();
    placePopover(el.firstElementChild, b);
    el.querySelector('.hr-wk-open')?.scrollIntoView({ block: 'nearest' });
  }
  function setMenu(on) { P.menu = on; render(true); if (!on) renderMenu(); else menuEl().querySelector('button')?.focus(); }

  // ---------------------------------------------------------------- acting
  async function act(action, extra = {}) {
    if (P.busy) return null;
    if (action === 'clear' && !(await ask({ title: tp('clearTitle'), text: tp('clearText'), ok: tp('clear') }))) return null;
    if (action === 'weekClear' && !(await ask({ title: tp('wk.clearTitle', { day: dayOf(extra.day, true) }), text: tp('wk.clearText'), ok: tp('wk.clear') }))) return null;
    P.busy = true;
    try {
      const r = await api(path, { method: 'POST', body: { action, ...extra } });
      take(r.plan);
      if (action === 'start') toast(r.toast ? `${r.toast} ${tp('startedToast')}` : tp('startedToast'));
      else if (r.toast) toast(r.toast);
      if (r.summary) { setMenu(false); summarySheet(r.summary, { follow: !!r.follow }); }
      // Oomba's follow-up card is in the chat now (services/homeroom-follow.js): the panel shows it at once
      if (r.follow) BUS.whenChat(c => c.refresh());
      return r;
    } catch (e) { toast(e.message, { bad: true }); return null; } finally { P.busy = false; }
  }
  function openChat() {
    setMenu(false);
    if (!BUS.chat()) { toast(tp('noChat')); return; }
    BUS.whenChat(c => { c.setMode('open'); setTimeout(() => document.getElementById('oc-in')?.focus(), 50); });
  }
  function summarySheet(s, { follow = false } = {}) {
    const rows = s.parts.map(x => `<li class="hr-sum-part${x.done ? ' done' : ''}"><span class="hr-pm-mark" aria-hidden="true">${x.done ? '✓' : x.cut ? '…' : '·'}</span>
      <span class="hr-sum-b"><b dir="auto">${esc(partName(x))}</b><span class="small">${esc(!x.done && !x.cut ? tp('notReached', { planned: x.planned }) : x.used < 1 ? tp('underMin', { planned: x.planned }) : tp('usedOf', { used: x.used, planned: x.planned }))}${x.cut ? ` · ${esc(tp('cut'))}` : ''}</span>
      ${x.of ? `<span class="hr-sum-ho"><span class="hr-sum-bar" role="img" aria-label="${esc(tp('finishedOf', { finished: x.finished, of: x.of }))}"><i style="width:${Math.round((100 * x.finished) / x.of)}%"></i></span><span class="small">${esc(tp('finishedOf', { finished: x.finished, of: x.of }))}</span></span>` : ''}</span></li>`).join('');
    sheet({ title: `🏁 ${tp('summaryTitle')}`, content: `<div class="hr-sum">
      <div class="hr-sum-nums"><div><b>${esc(tp('partsDone', { done: s.partsDone, total: s.partsTotal }))}</b><span class="small muted">${esc(tp('parts'))}</span></div><div><b>${esc(minutes(s.used))}</b><span class="small muted">${esc(tp('plannedWas', { count: s.planned }))}</span></div>${s.absent ? `<div class="hr-sum-abs"><b>${esc(tp('absentN', { count: s.absent }))}</b><span class="small muted">${esc(tp('absentNote'))}</span></div>` : ''}</div>
      <ol class="plain hr-sum-parts">${rows}</ol>
      <p class="hr-sum-home">${ic('🎒', 18)} <span>${esc(s.homework ? tp('homework', { count: s.homework }) : tp('noHomework'))}</span></p>
      ${follow ? `<p class="hr-sum-follow">${ic('💬', 18)} <span>${esc(tp('follow.ready'))}</span> ${btn('btn btn-sm btn-primary', 'data-hrplan="follow"', esc(tp('follow.open')))}</p>` : ''}
      <p class="small muted">${esc(tp('summaryPrivate'))}</p></div>` });
  }
  async function finish() { const r = await act('finish'); return r && r.summary; }

  function click(e) {
    const b = e.target.closest('[data-hrplan]'); if (!b) { if (P.menu && !e.target.closest('#hr-planmenu')) setMenu(false); return; }
    const k = b.dataset.hrplan;
    if (k === 'menu') setMenu(!P.menu);
    else if (k === 'wkday') {
      const d = b.dataset.day, w = P.plan && P.plan.week, day = w && w.days.find(x => x.date === d);
      if (P.wkSwap && !RO) { if (d !== P.wkSwap && day && !day.past) { const a = P.wkSwap; P.wkSwap = null; P.wkSel = d; act('weekSwap', { day: a, with: d }); } return; }
      P.wkSel = P.wkSel === d ? null : d; render(true);
      menuEl().querySelector(`[data-day="${CSS.escape(d)}"]`)?.focus();
    }
    else if (RO) return;
    else if (k === 'wkswap') { P.wkSwap = b.dataset.day; render(true); menuEl().querySelector('.hr-wk-chip.target')?.focus(); }
    else if (k === 'wkcancel') { P.wkSwap = null; render(true); }
    else if (k === 'wkclear') act('weekClear', { day: b.dataset.day });
    else if (k === 'ask') openChat();
    else if (k === 'follow') { document.querySelector('.sheet-bg .close')?.click(); openChat(); }
    else if (k === 'summary') { setMenu(false); if (P.plan && P.plan.summary) summarySheet(P.plan.summary); }
    else act(k);
  }
  // ---------------------------------------------------------------- staying in step
  async function poll() {
    clearTimeout(P.timer); P.timer = null;
    if (!document.hidden && !(ctx.H && ctx.H.away)) {
      try { const r = await api(path, { background: true }); if (JSON.stringify(r.plan && { ...r.plan, now: 0 }) !== JSON.stringify(P.plan && { ...P.plan, now: 0 })) take(r.plan); else if (r.plan) P.skew = Date.now() - r.plan.now; } catch { /* the next one */ }
    }
    P.timer = setTimeout(poll, P.plan && P.plan.state === 'running' ? 10000 : 30000);
  }
  // On the Homeroom view the Oomba chat sees this class's Homeroom (its plan tools); on the other views it doesn't.
  const adapter = {
    page: () => ({ type: 'homeroom', classId: D.classId }),
    label: () => D.className || '',
    placeholder: () => tp('placeholder'),
    hello: () => tp('hello'),
    // a follow-up card's students (services/homeroom-follow.js keeps ids): their names, in the browser only
    nameOf: id => (((D.room && D.room.students) || []).find(x => x.id === id) || {}).name || '',
  };
  const onView = on => { if (RO) return; if (on) BUS.setPage(adapter); else if (BUS.page() === adapter) BUS.setPage(null); };
  // A phone: the bar is full in a live class, so the pill floats over the board (public/css/homeroom.css).
  const phone = matchMedia('(max-width: 819px)'), home = { parent: null, next: null };
  function place() {
    const el = host(), stage = document.querySelector('.hr-stage'); if (!el || !stage) return;
    if (!home.parent && el.parentElement !== stage) { home.parent = el.parentElement; home.next = el.nextSibling; }
    if (phone.matches && el.parentElement !== stage) stage.appendChild(el);
    else if (!phone.matches && home.parent && el.parentElement === stage) home.parent.insertBefore(el, home.next);
    if (P.menu) renderMenu();
  }
  phone.addEventListener?.('change', place);

  document.addEventListener('click', click);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && P.menu) { setMenu(false); host()?.querySelector('[data-hrplan="menu"]')?.focus(); } });
  document.addEventListener('oomba:plan', e => { const d = e.detail || {}; if (!d.classId || d.classId === D.classId) take(d.plan); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  window.addEventListener('resize', () => { if (P.menu) renderMenu(); });
  ctx.viewEl?.addEventListener('cv:hide', () => { setMenu(false); onView(false); });
  ctx.viewEl?.addEventListener('cv:show', () => { onView(true); poll(); });
  onView(!ctx.viewEl || !ctx.viewEl.hidden);
  place();
  setInterval(() => render(), 1000);
  render(true);
  P.timer = setTimeout(poll, 10000);
  /** End class while the plan runs: "Finish class" first (the summary); false when the teacher keeps class going. */
  async function finishForEnd(title) {
    if (!(await ask({ title, text: tp('endFinish'), ok: tp('finish') }))) return false;
    await finish();
    return true;
  }
  return { running: () => !!P.plan && (P.plan.state === 'running' || P.plan.state === 'done'), finish, finishForEnd, refresh: poll };
}
