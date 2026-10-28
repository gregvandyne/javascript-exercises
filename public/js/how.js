// /parents and /teachers (server/views/how.js, public/css/how.css): motion on top of a page that is complete without it.
//  - Hero parallax: the layers of .how-art move at different speeds as the page scrolls (CSS scroll-driven animations
//    where the browser has them, else --how-p set here once per frame), and lean a little toward the pointer on desktop.
//  - Steps: on wide screens a sticky screen beside the steps shows the screenshot of the step in the middle of the view.
//  - Reveal: sections fade and slide in once, the first time they come into view.
// Only classes and custom properties are set; nothing runs when the reader asked for reduced motion, and without
// IntersectionObserver the page stays as the server drew it.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const IO = 'IntersectionObserver' in window;

if (!reduce && IO) {
  parallax();
  stage();
  reveal();
}

/** The hero's layered picture. */
function parallax() {
  const art = document.querySelector('.how-art'); const hero = art && art.closest('.lp-hero');
  if (!art || !hero) return;
  let visible = true;
  new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; }).observe(hero);
  // Scroll: only where CSS can't do it itself.
  if (!(window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()'))) {
    art.classList.add('how-par-js');
    let queued = false;
    const draw = () => { queued = false; const p = Math.min(1, Math.max(0, scrollY / (innerHeight * 0.8))); art.style.setProperty('--how-p', p.toFixed(4)); };
    addEventListener('scroll', () => { if (visible && !queued) { queued = true; requestAnimationFrame(draw); } }, { passive: true });
    draw();
  }
  // Pointer: a fine pointer on a wide screen only.
  const fine = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 960px)');
  let mx = 0, my = 0, queued = false;
  const draw = () => { queued = false; art.style.setProperty('--mx', mx.toFixed(3)); art.style.setProperty('--my', my.toFixed(3)); };
  const ask = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
  hero.addEventListener('pointermove', e => {
    if (!fine.matches || e.pointerType !== 'mouse' || !visible) return;
    const r = hero.getBoundingClientRect();
    mx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    my = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    ask();
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { mx = 0; my = 0; ask(); });
}

/** The sticky screen beside the steps (shown from 960px wide by CSS). */
function stage() {
  const sec = document.querySelector('.how'); if (!sec) return;
  const steps = [...sec.querySelectorAll('.how-step')]; const box = sec.querySelector('.how-stage');
  const shots = box && box.querySelector('.how-shots');
  if (!steps.length || !shots) return;
  const dots = box.querySelector('.how-dots'); const count = box.querySelector('.how-count');
  // Copies of the steps' pictures (the stage is aria-hidden, so they say nothing).
  const frames = steps.map(li => {
    const pic = li.querySelector('picture'); const div = document.createElement('div'); div.className = 'how-shot';
    if (pic) {
      const copy = pic.cloneNode(true);
      for (const s of copy.querySelectorAll('source')) s.sizes = '(min-width:1240px) 680px, 54vw';
      const img = copy.querySelector('img'); if (img) img.alt = '';
      div.append(copy);
    }
    shots.append(div);
    if (dots) dots.append(document.createElement('i'));
    return div;
  });
  const bars = dots ? [...dots.children] : [];
  let cur = 0;
  const show = n => {
    if (n === cur) return; cur = n;
    box.dataset.step = String(n);
    frames.forEach((f, i) => f.classList.toggle('on', i === n - 1));
    bars.forEach((b, i) => { b.classList.toggle('on', i === n - 1); b.classList.toggle('done', i < n - 1); });
    steps.forEach((li, i) => { if (i === n - 1) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    if (count) count.textContent = `${n} / ${steps.length}`;
  };
  show(1);
  box.hidden = false;
  sec.classList.add('how-js');
  // The step crossing the middle tenth of the view is the current one.
  const io = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) show(steps.indexOf(e.target) + 1);
  }, { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach(li => io.observe(li));
}

/** Sections fade in once. Whatever is already on screen is marked shown in the same frame, so nothing flashes. */
function reveal() {
  const lp = document.querySelector('.lp'); if (!lp) return;
  const items = [...lp.querySelectorAll(':scope > section:not(.lp-hero):not(.how), :scope > .lp-cols > *, :scope > .panel, .how-step')];
  if (!items.length) return;
  const io = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -6% 0px' });
  for (const el of items) {
    el.classList.add('how-rv');
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in'); else io.observe(el);
  }
  lp.classList.add('how-reveal');
  // Jumping to a section (#faq, find in page) shows it at once.
  addEventListener('hashchange', () => { const t = location.hash && document.getElementById(location.hash.slice(1)); const rv = t && t.closest('.how-rv'); if (rv) rv.classList.add('is-in'); });
}
