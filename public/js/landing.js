// The teacher landing page (server/routes/landing.js): parallax, the hero's lesson-to-game loop, reveal on scroll and
// click counts. Vanilla, no libraries. The page is complete without this file: it only adds motion and counting.
// Motion: transforms only, one requestAnimationFrame per scroll burst, passive listeners; nothing moves under
// prefers-reduced-motion (the CSS also stops its own loops there).
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;

// ---- "/#play" (older links and the app's "Play now" button pointed at the home page's game rows): those are on /play now.
if (location.hash === '#play') {
  const a = document.querySelector('#play a[href]');
  if (a) location.replace(a.getAttribute('href'));
}

// ---- click counts: a beacon per call to action (a daily total on the server, nothing about who clicked).
document.addEventListener('click', e => {
  const a = e.target instanceof Element && e.target.closest('[data-cta]');
  if (a && navigator.sendBeacon) try { navigator.sendBeacon(`/landing/count/${a.dataset.cta}`); } catch { /* counting never stops a link */ }
});

// ---- parallax
// [data-sky]: fixed layers, moved by scroll × depth (star fields wrap at their tile height, so they never run out).
// [data-depth]: elements in the page, moved by (their place − the middle of the screen) × depth, measured from their
// parent (never transformed) so a moved element is never measured where it was moved to.
const sky = [...document.querySelectorAll('[data-sky]')].map(el => ({ el, d: +el.dataset.sky || 0, tile: parseFloat(getComputedStyle(el).backgroundSize) || 0 }));
let items = [];
let vh = innerHeight;
function measure() {
  vh = innerHeight;
  const y = scrollY;
  items = [...document.querySelectorAll('[data-depth]')].filter(el => el.offsetParent !== null).map(el => {
    const r = el.parentElement.getBoundingClientRect();
    return { el, d: +el.dataset.depth || 0, mid: r.top + y + r.height / 2, top: r.top + y, bottom: r.bottom + y };
  });
}
let queued = false;
function frame() {
  queued = false;
  const y = scrollY;
  for (const s of sky) {
    let move = y * s.d;
    if (s.tile) move %= s.tile; else move = Math.min(move, vh * 0.6);
    s.el.style.transform = `translate3d(0,${(-move).toFixed(1)}px,0)`;
  }
  const lo = y - vh, hi = y + 2 * vh;
  for (const it of items) {
    if (it.bottom < lo || it.top > hi) continue;   // far off screen: leave it
    it.el.style.transform = `translate3d(0,${((it.mid - (y + vh / 2)) * it.d).toFixed(1)}px,0)`;
  }
}
const kick = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
function startParallax() {
  measure(); frame();
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', () => { measure(); kick(); }, { passive: true });
  // Late fonts and pictures move things: measure again once everything has loaded.
  addEventListener('load', () => { measure(); kick(); }, { once: true });
}
function stopParallax() {
  removeEventListener('scroll', kick);
  for (const s of sky) s.el.style.transform = '';
  for (const it of items) it.el.style.transform = '';
}

// ---- reveal on scroll: only what starts below the first screen is hidden first, so nothing above the fold flickers.
function startReveal() {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('rv-in'); e.target.classList.remove('rv-wait'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  for (const el of document.querySelectorAll('.rv')) {
    if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('rv-wait'); io.observe(el); }
  }
}

// ---- the hero loop: lesson → the Builder's steps → the game, again and again while it is on screen.
function startDemo() {
  const fig = document.querySelector('.lp-demo');
  if (!fig) return;
  const steps = [...fig.querySelectorAll('.lp-d-steps li')];
  let visible = true, running = false;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function loop() {
    if (running) return; running = true;
    while (visible && !document.hidden && !reduce.matches) {
      steps.forEach(li => li.classList.remove('on'));
      fig.style.setProperty('--p', 0);
      fig.dataset.stage = '0'; await wait(1700);
      fig.dataset.stage = '1';
      for (let i = 0; i < steps.length; i++) {
        await wait(650);
        steps[i].classList.add('on'); fig.style.setProperty('--p', (i + 1) / steps.length);
      }
      await wait(500);
      fig.dataset.stage = '2'; await wait(4200);
    }
    running = false;
    if (!visible || reduce.matches) { fig.dataset.stage = 'done'; steps.forEach(li => li.classList.add('on')); }
  }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); }, { threshold: 0.2 }).observe(fig);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) loop(); });
}

// ---- the menu (a <details>, so it works without this): closes when a section is chosen, on Escape and on a tap outside.
const menu = document.getElementById('lp-menu');
if (menu) {
  const close = () => { if (menu.open) menu.open = false; };
  menu.addEventListener('click', e => { if (e.target instanceof Element && e.target.closest('.lp-menu-panel a')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.open) { close(); menu.querySelector('summary')?.focus(); } });
  document.addEventListener('click', e => { if (menu.open && e.target instanceof Node && !menu.contains(e.target)) close(); });
}

// ---- How it works (#how): the line through the five steps fills as the page scrolls past it, and each step lights up as
// the line reaches it. Without this (no script, reduced motion) the line is simply drawn and nothing is lit.
let journeyOn = false;
function startJourney() {
  const list = document.querySelector('[data-journey]');
  if (!list || journeyOn) return;
  journeyOn = true;
  const steps = [...list.children];
  list.dataset.fill = '';
  let queued = false;
  function draw() {
    queued = false;
    if (reduce.matches) { list.style.removeProperty('--fill'); delete list.dataset.fill; steps.forEach(s => s.classList.remove('is-on')); return; }
    list.dataset.fill = '';
    const r = list.getBoundingClientRect();
    // Empty when the list's top reaches 85% down the screen; full when its bottom reaches 55%.
    const f = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.3)));
    list.style.setProperty('--fill', f.toFixed(3));
    steps.forEach((s, i) => s.classList.toggle('is-on', f >= (steps.length === 1 ? 0 : i / (steps.length - 1)) - 0.02));
  }
  const kickJ = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
  addEventListener('scroll', kickJ, { passive: true });
  addEventListener('resize', kickJ, { passive: true });
  reduce.addEventListener?.('change', kickJ);
  draw();
}

// ---- the layout tour (#dash-tour): on a wide screen the section stays put while the page scrolls through it, and the
// layouts come forward one by one (each rests a moment in front); the widget rows slide sideways, in turn. Without this
// (narrow screens, reduced motion, no script) it is a plain list. Transforms and opacity only, one frame per scroll burst.
let tourOn = false;
function startTour() {
  const tour = document.querySelector('[data-dtour]');
  const box = document.querySelector('.lp-dt-widgets');
  if (!tour || tourOn) return;
  tourOn = true;
  const stage = tour.querySelector('.lp-dt-stage');
  const items = [...tour.querySelectorAll('.lp-dt-item')], dots = [...tour.querySelectorAll('.lp-dt-dots li')];
  const rows = box ? [...box.querySelectorAll('.lp-dt-row')] : [];
  const n = items.length;
  const wide = matchMedia('(min-width: 1000px) and (min-height: 620px)');
  let deck = false, queued = false;
  // Within each step, hold still at both ends and glide between (so a layout rests in front for a while).
  const ease = x => { const f = Math.floor(x), r = x - f, u = Math.min(1, Math.max(0, (r - 0.2) / 0.6)); return f + u * u * (3 - 2 * u); };
  const set = (el, k, v) => el.style.setProperty(k, v.toFixed(3));
  function draw() {
    queued = false;
    if (deck) {
      const total = tour.offsetHeight - stage.offsetHeight;
      const p = ease(Math.min(1, Math.max(0, -tour.getBoundingClientRect().top / total)) * (n - 1) * 0.9999);
      items.forEach((it, i) => {
        const d = i - p, past = Math.min(0, d), ahead = Math.max(0, d);
        set(it, '--d', d); set(it, '--past', past); set(it, '--ahead', ahead);
        set(it, '--o', Math.max(0, 1 - Math.abs(d) * 2.2));
        set(it, '--fo', d < 0 ? Math.max(0, 1 + d * 1.4) : Math.max(0, Math.min(1, 4 - ahead)));
        it.style.zIndex = String(d < 0 ? 200 : 100 - Math.round(ahead * 10));   // a layout leaving goes over the next one
        it.classList.toggle('on', Math.abs(d) < 0.5);
      });
      dots.forEach((dot, i) => dot.classList.toggle('on', Math.round(p) === i));
    }
    if (rows.length && box.classList.contains('is-slide')) {
      const shift = (innerHeight - box.getBoundingClientRect().top - innerHeight * 0.6) * 0.35;
      for (const row of rows) {
        const centre = (box.clientWidth - row.scrollWidth) / 2 - row.offsetLeft;   // offsetLeft ignores transforms
        row.style.transform = `translate3d(${(centre + shift * (+row.dataset.row || 1)).toFixed(1)}px,0,0)`;
      }
    }
  }
  const kickTour = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
  function mode() {
    deck = wide.matches && !reduce.matches;
    tour.classList.toggle('is-tour', deck);
    if (!deck) for (const it of items) { it.removeAttribute('style'); it.classList.remove('on'); }
    if (box) { box.classList.toggle('is-slide', !reduce.matches); for (const r of rows) { r.classList.toggle('is-slide', !reduce.matches); if (reduce.matches) r.style.transform = ''; } }
    draw();
  }
  wide.addEventListener?.('change', mode);
  reduce.addEventListener?.('change', mode);
  addEventListener('scroll', kickTour, { passive: true });
  addEventListener('resize', kickTour, { passive: true });
  addEventListener('load', kickTour, { once: true });
  mode();
}

function start() {
  if (reduce.matches) return;
  startParallax(); startReveal(); startDemo(); startTour(); startJourney();
}
start();
reduce.addEventListener?.('change', () => { if (reduce.matches) { stopParallax(); const f = document.querySelector('.lp-demo'); if (f) f.dataset.stage = 'done'; } else start(); });
root.classList.add('lp-ready');
