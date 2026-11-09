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

function start() {
  if (reduce.matches) return;
  startParallax(); startReveal(); startDemo();
}
start();
reduce.addEventListener?.('change', () => { if (reduce.matches) { stopParallax(); const f = document.querySelector('.lp-demo'); if (f) f.dataset.stage = 'done'; } else start(); });
root.classList.add('lp-ready');
