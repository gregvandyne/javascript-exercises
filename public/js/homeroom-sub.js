// The sub's page (docs/decisions.md "Homeroom: supports, aides and sub links"; server: routes/homeroom-sub.js,
// services/homeroom-sub.js subView). A substitute opens the teacher's one-day link (no account): its PIN first when it
// has one, then this page:
//   - the top bar: the class, a Sub chip, the Live dot, the day plan (Now with its clock and Next; Start, +5 min, Next),
//     live class (Start class, Pause screens, Bring everyone to me, End class), the projector view and Leave;
//   - the teacher's note for the sub, and until when the link works;
//   - hands and the hall pass, answered here (first names only);
//   - the room: the teacher's area and every desk where the teacher seated it, with first names, a calm live status,
//     a raised hand, and "has supports" with only what the sub needs to act on (for example "Reads aloud").
// Never grades, progress, handouts, notebooks or anything of another class: the server sends none of it. The page asks
// again every few seconds while it is visible; a revoked or ended link answers 403 and the page says so.
import { t, api, toast, esc, pageData, ask } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { areaHtml, fitAreas } from '/js/homeroom-area.js';
import { partName } from '/js/homeroom-plan.js';
import { timing, clock } from '/js/homeroom-plan-time.js';
import { AREA, DESK, TEAM_DESK } from '/js/homeroom-seats.js';

const D = pageData();
const ts = (k, v) => t(`js.homeroom-sub.${k}`, v);
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const ic = (e, size = 18) => iconHtml(e, { size });
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- the PIN
const pin = $('hr-subpin');
if (pin) {
  pin.addEventListener('submit', async e => {
    e.preventDefault();
    const b = pin.querySelector('button[type="submit"]'); b.disabled = true;
    try { const r = await api('/api/sub/open', { method: 'POST', body: { token: pin.dataset.token, pin: $('hr-subpinin').value.trim() } }); location.replace(r.redirect || '/sub'); }
    catch (err) { $('hr-subpinerr').textContent = err.message; b.disabled = false; $('hr-subpinin').select(); }
  });
  $('hr-subpinin')?.focus();
}

// ---------------------------------------------------------------- the page
const root = $('hr-sub');
const S = { st: null, area: {}, v: null, skew: 0, busy: false, ended: false };
const ST = ['working', 'typing', 'stuck', 'done', 'away', 'here'];
const SUP_ICON = { time: '⏳', read: '🔊', simple: '✏️', big: '🔍' };

function planHtml() {
  const p = S.st && S.st.plan; if (!p) return '';
  const at = Date.now() - S.skew, x = timing(p.parts, p.state === 'running' || p.state === 'done' ? p.run : null, at);
  if (p.state === 'ready') return `<span class="hr-subpp">${ic('🗓️')} <span><span class="hr-pp-cap">${esc(ts('today'))}</span> <b dir="auto">${esc(p.name || ts('plan'))}</b></span></span>${btn('btn hr-chunk hr-spark', 'data-subplan="start"', `${ic('▶️')} ${esc(ts('startPlan'))}`)}`;
  if (x.done) return `<span class="hr-subpp">${ic('✅')} <b>${esc(ts('planDone'))}</b></span>`;
  return `<span class="hr-subpp${x.timesUp ? ' up' : ''}">${ic(x.timesUp ? '⌛' : '⏱️')} <span><span class="hr-pp-cap">${esc(x.timesUp ? ts('timesUp') : ts('now'))}</span> <b dir="auto">${esc(partName(x.part))}</b>${x.timesUp ? '' : ` <span class="hr-pp-clock" data-subclock>${esc(clock(x.left))}</span>`}${x.next ? `<span class="hr-pp-sub"> · ${esc(ts('next'))} <span dir="auto">${esc(partName(x.next))}</span></span>` : ''}</span></span>
    ${btn('btn hr-chunk', `data-subplan="more" aria-label="${esc(ts('moreLabel'))}"`, esc(ts('more')))}${btn(`btn hr-chunk${x.timesUp ? ' hr-spark' : ''}`, 'data-subplan="next"', `${ic('⏭️')} ${esc(ts('nextBtn'))}`)}`;
}
function liveHtml() {
  const L = S.st && S.st.live;
  if (!L) return btn('btn hr-chunk hr-spark', 'data-sublive="start"', `${ic('🏫')} ${esc(ts('startClass'))}`);
  return `${btn(`btn hr-chunk${L.paused ? ' on' : ''}`, `data-sublive="${L.paused ? 'resume' : 'pause'}" aria-pressed="${!!L.paused}" aria-label="${esc(ts(L.paused ? 'resume' : 'pause'))}"`, `${ic('👀')}<span class="hr-hidephone"> ${esc(ts(L.paused ? 'resume' : 'pause'))}</span>`)}
    ${btn('btn hr-chunk hr-spark', `data-sublive="${L.bring ? 'back' : 'bring'}" aria-pressed="${!!L.bring}" aria-label="${esc(ts(L.bring ? 'back' : 'bring'))}"`, `${ic(L.bring ? '🎒' : '🙋')}<span class="hr-hidephone"> ${esc(ts(L.bring ? 'back' : 'bring'))}</span>`)}
    ${btn('btn hr-chunk', `data-sublive="end" aria-label="${esc(ts('endClass'))}"`, `${ic('⏹️')}<span class="hr-hidephone"> ${esc(ts('endClass'))}</span>`)}`;
}
const supLine = sup => (sup && sup.length ? `<span class="hr-subsup" title="${esc(ts('hasSupports'))}">${ic('🧩', 14)} ${sup.map(k => `<span>${ic(SUP_ICON[k], 14)} ${esc(ts(`sup.${k}`))}</span>`).join('')}</span>` : '');
const stChip = st => (st && ST.includes(st) ? `<span class="hr-lvchip st-${st} static"><span class="hr-lvdot" aria-hidden="true"></span><span class="hr-lvt">${esc(ts(`st.${st}`))}</span></span>` : '');
const handTag = d => (d.pass === 'out' ? `<span class="hr-lvhand out">${ic('🚻', 14)} ${esc(ts('passOut'))}</span>` : d.pass === 'line' ? `<span class="hr-lvhand">${ic('🚻', 14)} ${esc(ts('passLine'))}</span>` : d.hand ? `<span class="hr-lvhand">${ic(d.hand === 'bathroom' ? '🚻' : '✋', 14)} ${esc(ts(`hand.${d.hand}`))}</span>` : '');
function deskHtml(d) {
  return `<div class="hr-sdesk${d.st === 'away' ? ' away' : ''}${d.hand || d.pass ? ' hand' : ''}" data-x="${+d.x || 0}" data-y="${+d.y || 0}"><b class="hr-sname" dir="auto"><bdi>${esc(d.name)}</bdi></b>${handTag(d)}${stChip(d.st)}${supLine(d.sup)}</div>`;
}
function teamHtml(tm) {
  return `<div class="hr-sdesk team" data-x="${+tm.x || 0}" data-y="${+tm.y || 0}" data-team="1">${tm.members.map(d => `<div class="hr-steam"><b class="hr-sname" dir="auto"><bdi>${esc(d.name)}</bdi></b>${handTag(d)}${stChip(d.st)}${supLine(d.sup)}</div>`).join('')}</div>`;
}
function handsHtml() {
  const st = S.st || {}, hands = st.hands || [], p = st.pass || { out: null, line: [] };
  const rows = hands.map(h => `<li class="hr-hrow"><span class="hr-hwho"><b><bdi>${esc(h.name)}</bdi></b> <span class="hr-hkind">${ic(h.kind === 'bathroom' ? '🚻' : h.kind === 'help' ? '🆘' : '💬', 16)} ${esc(ts(`hand.${h.kind}`))}</span></span>
    <span class="hr-hacts">${h.kind === 'bathroom' ? `${btn('btn btn-sm', `data-subhand="notNow:${esc(h.id)}"`, esc(ts('notNow')))}${btn('btn btn-sm btn-primary', `data-subhand="pass:${esc(h.id)}"`, esc(p.out ? ts('putInLine') : ts('givePass')))}` : btn('btn btn-sm btn-primary', `data-subhand="answer:${esc(h.id)}"`, esc(ts('answered')))}</span></li>`).join('');
  return `<h2 class="hr-subh">${ic('✋', 20)} ${esc(ts('hands'))}</h2>
    ${!st.live ? `<p class="small muted">${esc(ts('handsNotLive'))}</p>` : rows ? `<ol class="plain hr-hlist">${rows}</ol>` : `<p class="small muted">${esc(ts('noHands'))}</p>`}
    <h3 class="hr-flsub">${ic('🚻', 18)} ${esc(ts('pass'))}</h3>
    ${p.out ? `<div class="hr-pout"><span><b><bdi>${esc(p.out.name)}</bdi></b> <span class="small">${esc(ts('passFor', { minutes: p.minutes }))}</span></span>${btn('btn btn-sm btn-primary', `data-subhand="back:${esc(p.out.id)}"`, esc(ts('isBack', { name: p.out.name })))}</div>` : `<p class="small muted">${esc(ts('nobodyOut'))}</p>`}
    ${p.line.length ? `<ol class="plain hr-pline">${p.line.map((x, i) => `<li><span>${esc(i ? ts('then') : ts('nextInLine'))} <b><bdi>${esc(x.name)}</bdi></b></span></li>`).join('')}</ol>` : ''}`;
}
function render() {
  const st = S.st; if (!st || !root) return;
  $('hr-live').hidden = !st.live;
  const pl = planHtml(), lv = liveHtml();
  if ($('hr-subplan').innerHTML !== pl) $('hr-subplan').innerHTML = pl;
  if ($('hr-sublive').innerHTML !== lv) $('hr-sublive').innerHTML = lv;
  const main = $('hr-submain');
  if (!main.querySelector('.hr-subgrid')) {
    main.innerHTML = `<div class="hr-subgrid"><aside class="hr-subside">
        <section class="hr-subnote" aria-labelledby="hr-subnoteh"><h2 class="hr-subh" id="hr-subnoteh">${ic('📝', 20)} ${esc(ts('noteTitle'))}</h2>${D.note ? `<p dir="auto">${esc(D.note)}</p>` : `<p class="small muted">${esc(ts('noNote'))}</p>`}<p class="small muted">${ic('🕒', 14)} ${esc(D.endOfDay ? ts('untilEnd') : ts('until', { time: D.until }))}</p></section>
        <section class="hr-subhands" id="hr-subhands" aria-live="polite"></section>
        <p class="small muted hr-subpriv">${ic('🔒', 14)} ${esc(ts('privacy'))}</p></aside>
      <section class="hr-subroom" aria-labelledby="hr-subroomh"><h2 class="hr-subh" id="hr-subroomh">${ic('🏫', 20)} ${esc(ts('room'))}</h2>
        <div class="hr-subarea" id="hr-subarea"></div><div class="hr-subdesks" id="hr-subdesks"></div></section></div>`;
  }
  const hh = handsHtml(); if ($('hr-subhands').dataset.h !== hh) { $('hr-subhands').innerHTML = hh; $('hr-subhands').dataset.h = hh; }
  const dk = [...st.desks.map(deskHtml), ...(st.teams || []).map(teamHtml)].join('') || `<p class="muted">${esc(ts('noStudents'))}</p>`;
  if ($('hr-subdesks').dataset.h !== dk) { $('hr-subdesks').innerHTML = dk; $('hr-subdesks').dataset.h = dk; placeDesks(); }
}
function renderArea() { const el = $('hr-subarea'); if (!el) return; el.innerHTML = areaHtml(S.area, { mode: 'width', label: true }); fitAreas(el); }
/** The desks where the teacher seated them, scaled to the box; a simple grid in seating order when too small to read. */
function placeDesks() {
  const box = $('hr-subdesks'); if (!box) return;
  const els = [...box.querySelectorAll('.hr-sdesk')], pts = els.map(el => ({ el, x: +el.dataset.x, y: +el.dataset.y, ...(el.dataset.team ? TEAM_DESK : DESK) }));
  if (!pts.length) { box.style.height = ''; return; }
  const x0 = Math.min(AREA.x, ...pts.map(p => p.x)) - 10, x1 = Math.max(AREA.x + AREA.w, ...pts.map(p => p.x + p.w)) + 10;
  const y0 = Math.min(...pts.map(p => p.y)) - 10, y1 = Math.max(...pts.map(p => p.y + p.h)) + 10, k = box.clientWidth / (x1 - x0);
  const grid = k * DESK.w < 120;
  box.classList.toggle('grid', grid);
  if (grid) { for (const p of pts) p.el.removeAttribute('style'); pts.sort((a, b) => (Math.abs(a.y - b.y) < DESK.h / 2 ? a.x - b.x : a.y - b.y)).forEach((p, i) => { p.el.style.order = String(i); }); box.style.height = ''; return; }
  for (const p of pts) Object.assign(p.el.style, { left: `${(p.x - x0) * k}px`, top: `${(p.y - y0) * k}px`, width: `${p.w * k}px`, minHeight: `${p.h * k}px`, order: '' });
  box.style.height = `${(y1 - y0) * k + 10}px`;
}
function take(st) {
  if (!st) return;
  S.st = st; S.skew = Date.now() - st.now; S.v = st.v;
  render();
  if ('area' in st) { S.area = st.area || {}; renderArea(); }
}
function ended() {
  S.ended = true;
  root.innerHTML = `<div class="hr-helpcard"><div class="hr-helpico">${ic('🔗', 56)}</div><h1 class="hs-h">${esc(ts('endedTitle'))}</h1><p class="hs-lead">${esc(ts('endedText'))}</p></div>`;
}
let timer = null;
async function poll() {
  clearTimeout(timer); timer = null;
  if (S.ended) return;
  if (!document.hidden) {
    try { take(await api(`/api/sub/state?v=${encodeURIComponent(S.v ?? '')}`, { background: true })); }
    catch (e) { if (e.data && e.data.code === 'subEnded') { ended(); return; } }
  }
  timer = setTimeout(poll, S.st && S.st.live ? 3000 : 6000);
}
async function act(path, body, ok) {
  if (S.busy) return; S.busy = true;
  try { const r = await api(`/api/sub/${path}`, { method: 'POST', body }); if (r.state) take(r.state); if (ok) toast(ok); }
  catch (e) { if (e.data && e.data.code === 'subEnded') ended(); else toast(e.message, { bad: true }); }
  finally { S.busy = false; }
}
async function click(e) {
  const l = e.target.closest('[data-sublive]');
  if (l) { const a = l.dataset.sublive; if (a === 'end' && !(await ask({ title: ts('endClass'), text: ts('endConfirm'), ok: ts('endClass') }))) return; act('live', { action: a }, ts(`toast.${a}`)); return; }
  const p = e.target.closest('[data-subplan]'); if (p) { act('plan', { action: p.dataset.subplan }, ts(`toast.plan.${p.dataset.subplan}`)); return; }
  const h = e.target.closest('[data-subhand]'); if (h) { const [action, studentId] = h.dataset.subhand.split(':'); act('hands', { action, studentId }, ts(`toast.hand.${action}`)); return; }
  if (e.target.closest('[data-sub="leave"]')) { api('/api/sub/leave', { method: 'POST', body: {} }).finally(() => { location.href = '/'; }); }
}
if (root && D.state) {
  document.querySelector('main#main')?.classList.add('rm-main');
  take(D.state);
  root.addEventListener('click', click);
  setInterval(() => { const c = root.querySelector('[data-subclock]'); if (c && S.st && S.st.plan && S.st.plan.run) { const x = timing(S.st.plan.parts, S.st.plan.run, Date.now() - S.skew); if (x.timesUp) render(); else c.textContent = clock(x.left); } }, 1000);
  let rz = null; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { fitAreas(root); placeDesks(); }, 120); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  timer = setTimeout(poll, 3000);
}
