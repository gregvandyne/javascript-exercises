// Homeroom's first-run guide for teachers (docs/decisions.md "Homeroom: onboarding, Needs a look, Oomba follow-ups";
// server: services/homeroom-intro.js, POST /api/homeroom/<class>/tour). The first time a teacher opens Homeroom (once
// per teacher, kept on the server), six calm coach marks, each pointing at the real thing on the page: Arrange seats, the
// teacher's area and its pen, handing out a lesson (tap or drag, touch works), My desk, Oomba for today's plan, and
// Everyone to Homeroom with the quick sign-in code. A class with no students starts with its own step instead of seats:
// the join code and Google Classroom. Next and Skip on each; Escape skips. It never covers the board with a layer: a
// small card beside what it points at and a soft ring around it, so the board stays usable underneath, on a phone, a
// tablet and a laptop. The ⋯ menu's Show me around opens it again.
import { t, api, esc } from '/js/app.js';
import { iconHtml } from '/js/icons.js';

const tg = (k, v) => t(`js.homeroom-look.tour.${k}`, v);
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const PAD = 6, GAP = 12, EDGE = 16;

/** ctx: { D (page data: classId, joinCode, gcLink), students: () => how many, away: () => bool }. -> { start(), stop(), on() } */
export function tour(ctx) {
  const { D } = ctx;
  const S = { i: 0, steps: [], el: null, ring: null, saved: false, raf: 0 };
  const q = sel => document.querySelector(sel);
  const STEPS = {
    empty: { icon: '🌱', at: () => q('.hr-nostudents') || q('[data-hr="menu"]') },
    seats: { icon: '🔀', at: () => q('[data-cv-acts="homeroom"] [data-hr="seats"]') || q('[data-hr="seats"]') },
    area: { icon: '🧑‍🏫', at: () => q('.hr-area') },
    // (a lesson in the panel when one is on screen, else the panel: on a phone, its strip along the bottom)
    handout: { icon: '👆', at: () => { const p = q('#hr-panel'); const it = p && [...p.querySelectorAll('.hr-give')].find(visible); return it || p; } },
    mydesk: { icon: '🎒', at: () => q('#hr-tdesk') },
    oomba: { icon: '💬', at: () => q('#hr-plan .hr-planpill') || q('#hr-plan') || q('#oc-bubble') },
    golive: { icon: '🏫', at: () => q('[data-hr="golive"]') || q('[data-hr="menu"]') },
  };
  /** What the guide points at as it shows: a thing on the board only as far as the board shows it (it pans and zooms
   *  under the top bar). -> a rect, or null when it isn't on screen */
  function rectOf(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect(), box = el.closest('#hr-board') ? el.closest('#hr-board').getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const x = { left: Math.max(r.left, box.left, 0), top: Math.max(r.top, box.top, 0), right: Math.min(r.right, box.right, innerWidth), bottom: Math.min(r.bottom, box.bottom, innerHeight) };
    if (x.right - x.left < 4 || x.bottom - x.top < 4) return null;
    return { ...x, width: x.right - x.left, height: x.bottom - x.top };
  }
  function visible(el) { return !!rectOf(el); }

  function text(id) {
    if (id === 'empty') return `${esc(tg('emptyText', { code: D.joinCode || '' }))}`;
    return esc(tg(`${id}Text`));
  }
  function html() {
    const id = S.steps[S.i], last = S.i === S.steps.length - 1, st = STEPS[id];
    const extra = id === 'empty' ? `<p class="hr-tourcode">${iconHtml('🔑', { size: 16 })} <b dir="ltr">${esc(D.joinCode || '')}</b> <a class="btn btn-sm" href="${esc(D.gcLink || '#')}">${esc(tg('addStudents'))}</a></p>` : '';
    return `<div class="hr-tourcard" role="dialog" aria-modal="false" aria-labelledby="hr-tourh" aria-describedby="hr-tourp">
      <p class="hr-tourstep small">${esc(tg('step', { n: S.i + 1, total: S.steps.length }))}</p>
      <h2 class="hr-tourh" id="hr-tourh">${iconHtml(st.icon, { size: 20 })} <span>${esc(tg(`${id}Title`))}</span></h2>
      <p class="hr-tourp" id="hr-tourp">${text(id)}</p>${extra}
      <div class="hr-touracts">${last ? '' : btn('btn btn-sm btn-ghost', 'data-tour="skip"', esc(tg('skip')))}${btn('btn btn-sm btn-primary', 'data-tour="next"', esc(last ? tg('done') : tg('next')))}</div></div>`;
  }
  /** The card beside what it points at (below it when there is room, else above; on a narrow screen, across the top or
   *  the bottom, away from it), and the ring around it. */
  function place() {
    if (!S.el) return;
    const card = S.el.firstElementChild, a = STEPS[S.steps[S.i]].at(), w = innerWidth, h = innerHeight;
    const r = rectOf(a);
    if (r) {
      const x0 = Math.max(2, r.left - PAD), y0 = Math.max(2, r.top - PAD), x1 = Math.min(w - 2, r.right + PAD), y1 = Math.min(h - 2, r.bottom + PAD);
      Object.assign(S.ring.style, { display: '', left: `${x0}px`, top: `${y0}px`, width: `${Math.max(0, x1 - x0)}px`, height: `${Math.max(0, y1 - y0)}px` });
    } else S.ring.style.display = 'none';
    const cw = Math.min(360, w - 2 * EDGE); card.style.width = `${cw}px`;
    const ch = card.offsetHeight;
    let left, top;
    if (w < 600 || !r) {
      left = (w - cw) / 2;
      // across the bottom unless what it points at is down there
      top = r && r.top + r.height / 2 > h / 2 ? EDGE : h - ch - EDGE - 64;
      if (r && top < r.bottom + GAP && top + ch > r.top - GAP) top = r.top > ch + 2 * EDGE ? r.top - ch - GAP : Math.min(h - ch - EDGE, r.bottom + GAP);
    } else {
      left = Math.min(w - cw - EDGE, Math.max(EDGE, r.left + r.width / 2 - cw / 2));
      const big = r.height > h * 0.5;
      top = big ? Math.max(EDGE, Math.min(h - ch - EDGE, r.top + 40)) : r.bottom + GAP + ch < h - EDGE ? r.bottom + GAP : Math.max(EDGE, r.top - GAP - ch);
      if (big) left = r.right + GAP + cw < w - EDGE ? r.right + GAP : r.left - GAP - cw > EDGE ? r.left - GAP - cw : left;
    }
    card.style.left = `${Math.round(Math.max(EDGE / 2, left))}px`; card.style.top = `${Math.round(Math.max(EDGE / 2, top))}px`;
  }
  function render() {
    if (!S.el) return;
    S.el.innerHTML = html();
    place();
    S.el.querySelector('[data-tour="next"]')?.focus({ preventScroll: true });
  }
  const onResize = () => { cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(place); };
  function key(e) { if (e.key === 'Escape' && S.el) { e.stopPropagation(); stop(); } }
  function click(e) {
    const b = e.target.closest('[data-tour]'); if (!b) return;
    if (b.dataset.tour === 'skip') stop();
    else if (S.i >= S.steps.length - 1) stop();
    else { S.i++; render(); }
  }
  function start() {
    stop({ save: false });
    S.steps = [ctx.students() ? 'seats' : 'empty', 'area', 'handout', 'mydesk', 'oomba', 'golive'];
    S.i = 0;
    S.ring = document.createElement('div'); S.ring.className = 'hr-tourring'; S.ring.setAttribute('aria-hidden', 'true');
    S.el = document.createElement('div'); S.el.className = 'hr-tour'; S.el.id = 'hr-tour';
    document.body.append(S.ring, S.el);
    S.el.addEventListener('click', click);
    document.addEventListener('keydown', key, true);
    addEventListener('resize', onResize); addEventListener('scroll', onResize, true);
    render();
  }
  /** Closed (Done, Skip, Escape): shown, so it is not shown again (Show me around still opens it). */
  function stop({ save = true } = {}) {
    if (!S.el) return;
    S.el.remove(); S.ring.remove(); S.el = null; S.ring = null;
    document.removeEventListener('keydown', key, true);
    removeEventListener('resize', onResize); removeEventListener('scroll', onResize, true);
    if (save && !S.saved) { S.saved = true; api(`/api/homeroom/${encodeURIComponent(D.classId)}/tour`, { method: 'POST', body: { done: true }, background: true }).catch(() => { S.saved = false; }); }
  }
  // the board moves under it (pan, zoom, a panel opening): the ring follows
  setInterval(() => { if (S.el && !ctx.away()) place(); }, 700);
  return { start, stop, on: () => !!S.el };
}
