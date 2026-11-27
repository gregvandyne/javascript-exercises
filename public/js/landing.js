// The teacher landing page (server/routes/landing.js): the Hub tour, the video player, the menu and click counts.
// Vanilla, no libraries. The page is complete without this file: the tour is then a list of its six steps, and each
// video link opens the video file itself.

// ---- "/#play" (older links and the app's "Play now" button pointed at the home page's game rows): those are on /learn.
if (location.hash === '#play') {
  const a = document.querySelector('#play a[href]');
  if (a) location.replace(a.getAttribute('href'));
}

// ---- click counts: a beacon per call to action (a daily total on the server, nothing about who clicked).
document.addEventListener('click', e => {
  const a = e.target instanceof Element && e.target.closest('[data-cta]');
  if (a && navigator.sendBeacon) try { navigator.sendBeacon(`/landing/count/${a.dataset.cta}`); } catch { /* counting never stops a link */ }
});

// ---- the menu (a <details>, so it works without this): closes when a section is chosen, on Escape and on a tap outside.
const menu = document.getElementById('lp-menu');
if (menu) {
  const close = () => { if (menu.open) menu.open = false; };
  menu.addEventListener('click', e => { if (e.target instanceof Element && e.target.closest('.lp-menu-panel a')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.open) { close(); menu.querySelector('summary')?.focus(); } });
  document.addEventListener('click', e => { if (menu.open && e.target instanceof Node && !menu.contains(e.target)) close(); });
}

// ---- the Hub tour: one step at a time, with the stepper, Back and Next, the arrow keys (and Home/End), a swipe on the
// picture and the progress bar. Each step's picture is zoomed to the part of the screen that matters, with a ring around
// the control (server/routes/landing.js STEPS); a step change pans and zooms the camera from the last step's region to the
// new one (the CSS transition, none under prefers-reduced-motion). The picture itself is not a button. A step change says
// "Step 3 of 6: Watch every desk" to screen readers; Back and Next keep the focus where it was (on the other button at
// either end), and a step picked in the stepper moves the focus to its heading. The last step's Next starts again.
export function startTour(box) {
  const steps = [...box.querySelectorAll('.lp-tstep')];
  const picks = [...box.querySelectorAll('.lp-step')];
  const bar = box.querySelector('.lp-progress'); const fill = bar && bar.querySelector('i');
  const live = box.querySelector('[data-tour-live]');
  const n = steps.length;
  if (!n) return null;
  let at = 0;
  box.classList.add('is-on');
  // The other steps' pictures are fetched once the tour is near, so Next never waits on a blank window.
  const eager = () => { for (const img of box.querySelectorAll('.lp-tstage img[loading="lazy"]')) img.loading = 'eager'; };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { eager(); io.disconnect(); } }, { rootMargin: '600px 0px' });
    io.observe(box);
  } else eager();
  const camOf = s => s.querySelector('.lp-tcam');
  for (const s of steps) s.querySelector('.lp-tipbtns')?.removeAttribute('hidden');
  function show(i, { focus = null } = {}) {
    const from = at;
    at = (i + n) % n;
    steps.forEach((s, j) => { s.classList.toggle('on', j === at); s.toggleAttribute('hidden', j !== at); });
    // The camera starts where the last step's was and moves to this step's region.
    const cam = camOf(steps[at]), was = camOf(steps[from]);
    if (cam && was && from !== at) {
      const [cx, cy, w] = was.dataset.cam.split(',');
      cam.style.transition = 'none';
      cam.style.setProperty('--cx', cx); cam.style.setProperty('--cy', cy); cam.style.setProperty('--w', w);
      void cam.offsetWidth;
      cam.style.transition = '';
      const [tx, ty, tw] = cam.dataset.cam.split(',');
      cam.style.setProperty('--cx', tx); cam.style.setProperty('--cy', ty); cam.style.setProperty('--w', tw);
    }
    picks.forEach((p, j) => { if (j === at) p.setAttribute('aria-current', 'step'); else p.removeAttribute('aria-current'); p.classList.toggle('done', j < at); });
    if (bar) { bar.setAttribute('aria-valuenow', String(at + 1)); fill.style.width = `${((at + 1) / n * 100).toFixed(2)}%`; }
    const step = steps[at];
    const back = step.querySelector('[data-back]');
    if (back) back.disabled = at === 0;
    if (live) live.textContent = `${step.querySelector('.lp-tipnav > span')?.textContent || ''}: ${step.querySelector('h3')?.textContent || ''}`;
    if (focus === 'heading') step.querySelector('h3')?.focus();
    else if (focus === 'next') step.querySelector('[data-next]')?.focus();
    else if (focus === 'back') (at === 0 ? step.querySelector('[data-next]') : step.querySelector('[data-back]'))?.focus();
    box.dataset.step = String(at);
  }
  box.addEventListener('click', e => {
    const t = e.target instanceof Element ? e.target : null; if (!t) return;
    if (t.closest('[data-next]')) show(at + 1, { focus: 'next' });
    else if (t.closest('[data-back]')) show(at - 1, { focus: 'back' });
    else if (t.closest('[data-go]')) show(+t.closest('[data-go]').dataset.go, { focus: 'heading' });
  });
  box.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const rtl = getComputedStyle(box).direction === 'rtl';
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight', bwd = rtl ? 'ArrowRight' : 'ArrowLeft';
    const inPicks = e.target instanceof Element && e.target.closest('.lp-steps');
    if (e.key === fwd) { e.preventDefault(); show(at + 1, { focus: inPicks ? null : 'next' }); if (inPicks) picks[at].focus(); }
    else if (e.key === bwd) { e.preventDefault(); show(at - 1, { focus: inPicks ? null : 'back' }); if (inPicks) picks[at].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); show(0, { focus: 'heading' }); }
    else if (e.key === 'End') { e.preventDefault(); show(n - 1, { focus: 'heading' }); }
  });
  // A swipe on the picture: left for the next step, right for the one before (mirrored right to left).
  let x0 = null, y0 = null;
  box.addEventListener('touchstart', e => { if (e.target instanceof Element && e.target.closest('.lp-tstage')) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
  box.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    const rtl = getComputedStyle(box).direction === 'rtl';
    show(at + ((dx < 0) !== rtl ? 1 : -1));
  }, { passive: true });
  show(0);
  return { show, get at() { return at; } };
}

// ---- the video player: every [data-video] link opens one <dialog> with the video, its poster and English captions,
// muted until the viewer turns the sound on. Closing (the × button, Escape, a click outside the video) stops it and
// puts the focus back on the link that opened it. Nothing is loaded until a video is opened.
export function startVideos(dlg) {
  const v = dlg.querySelector('video'); const h = dlg.querySelector('.lp-vd-h');
  if (!v || typeof dlg.showModal !== 'function') return null;
  let from = null;
  function open(a) {
    from = a;
    v.replaceChildren();
    v.poster = a.dataset.poster || '';
    const src = document.createElement('source'); src.src = a.dataset.video; src.type = 'video/mp4'; v.append(src);
    if (a.dataset.vtt) { const tr = document.createElement('track'); tr.kind = 'captions'; tr.src = a.dataset.vtt; tr.srclang = 'en'; tr.label = 'English'; tr.default = true; v.append(tr); }
    h.textContent = a.dataset.title || '';
    v.load();
    dlg.showModal();
    v.focus();
    v.play().catch(() => { /* the viewer presses Play */ });
  }
  function onClose() { v.pause(); v.removeAttribute('poster'); v.replaceChildren(); v.load(); if (from) from.focus(); from = null; }
  document.addEventListener('click', e => {
    const a = e.target instanceof Element && e.target.closest('a[data-video]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button > 0) return;
    e.preventDefault(); open(a);
  });
  dlg.addEventListener('click', e => { if (e.target === dlg || (e.target instanceof Element && e.target.closest('[data-close]'))) dlg.close(); });
  dlg.addEventListener('close', onClose);
  return { open };
}

const tourBox = document.querySelector('[data-tour]');
if (tourBox) startTour(tourBox);
const player = document.getElementById('lp-vd');
if (player) startVideos(player);
document.documentElement.classList.add('lp-ready');
