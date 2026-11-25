// Homeroom, Classroom and Dashboard as one page (server: routes/homeroom-views.js; docs/decisions.md "Homeroom: one page,
// three views"). The shared bar (class switcher, Homeroom | Classroom | Dashboard, the view's own buttons) stays; a tap
// on the pill swaps the view under it without loading the page again:
//   - a view opened for the first time is fetched with the X-View header (its content, its buttons for the bar, its
//     stylesheets, its scripts at the same ?v= addresses the page itself uses, and their strings). Its stylesheets
//     load first, then the content goes in, then its scripts run once, into the view (they find their elements there);
//   - after that a view is only hidden and shown again: nothing is fetched or run twice, so listeners and timers are
//     never doubled. A view hears 'cv:hide' and 'cv:show' on its <section> (Homeroom stops asking for the desks while
//     hidden and asks again when shown; the dashboard stops its live check, leaves Projector and edit mode);
//   - each view's page data (<script type="application/json" id="page-data">) has its id only while it is shown, so
//     the scripts of the view on screen read their own;
//   - a short, calm fade out and in (none with reduced motion); the address follows (history.pushState), so Back and
//     Forward move between views, and a reload or a link opens the view the address names (the server draws it).
// Classroom's own tabs and links still open their page as before (the page comes back with Classroom in it). Which
// Classroom page was open, and how far down, is kept for this tab (sessionStorage), so Classroom opens there again.
// A failed fetch, or a click with a modifier key, opens the address as the plain link it is.
import { addStrings } from '/js/i18n.js';

const root = document.getElementById('cv');
if (root && !globalThis.__cvViews) { globalThis.__cvViews = true; start(); }

function start() {
  const V = new URL(import.meta.url).search;
  const CID = root.dataset.class;
  const bar = document.getElementById('cv-bar'), main = document.getElementById('main');
  const sec = k => root.querySelector(`.cv-view[data-cv-view="${k}"]`);
  const acts = k => bar.querySelector(`[data-cv-acts="${k}"]`);
  const pill = k => bar.querySelector(`a[data-cv-go="${k}"]`);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const KEY = `cv-room:${CID}`;
  const store = {
    get() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } },
    set(v) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage off: Classroom opens on its first tab */ } },
  };
  const here = () => location.pathname + location.search;
  let cur = root.dataset.view;
  const loaded = new Set([cur]);
  sec(cur).dataset.cvTitle = document.title;

  /** Which view an address of this class is ('' for anything else). */
  function viewOf(href) {
    const p = new URL(href, location.href).pathname.replace(/\/+$/, ''), base = `/class/${CID}`;
    if (p === `${base}/homeroom`) return 'homeroom';
    if (p === `${base}/dashboard`) return 'dashboard';
    if (p.startsWith(`${base}/homeroom/`) || p.startsWith(`${base}/dashboard/`)) return '';
    return p === base || p.startsWith(`${base}/`) ? 'classroom' : '';
  }
  // Classroom opens where it was left (this tab only).
  const keepRoom = () => { if (cur === 'classroom') { sec('classroom').dataset.cvUrl = here(); store.set({ url: here(), y: Math.round(scrollY) }); } };
  const kept = store.get();
  if (cur !== 'classroom' && kept && viewOf(kept.url) === 'classroom' && pill('classroom')) pill('classroom').setAttribute('href', kept.url);
  addEventListener('pagehide', keepRoom);

  /** A view's JSON blocks (its page data) answer to their ids only while it is the one shown. */
  function dataIds(k, on) {
    for (const el of sec(k).querySelectorAll('script[type="application/json"]')) {
      if (on && el.dataset.cvId) { el.id = el.dataset.cvId; delete el.dataset.cvId; }
      else if (!on && el.id) { el.dataset.cvId = el.id; el.removeAttribute('id'); }
    }
  }
  const bodyClasses = k => String(sec(k).dataset.cvBody || '').split(/\s+/).filter(Boolean);
  const fade = (els, a, b, ms) => (reduced.matches ? Promise.resolve() : Promise.all(els.filter(el => el && el.animate).map(el => {
    const x = el.animate([{ opacity: a }, { opacity: b }], { duration: ms, easing: 'ease-out', fill: 'forwards' });
    return x.finished.then(() => x.cancel(), () => {});
  })));

  async function addHead(markup) {
    const tpl = document.createElement('template'); tpl.innerHTML = markup || '';
    const anchor = document.querySelector('link[data-cv-css]'), have = new Set([...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.getAttribute('href')));
    const waits = [];
    for (const el of tpl.content.querySelectorAll('link[rel="stylesheet"]')) {
      const href = el.getAttribute('href'); if (!href || have.has(href)) continue;
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
      waits.push(new Promise(ok => { l.onload = ok; l.onerror = ok; setTimeout(ok, 5000); }));
      if (anchor) anchor.before(l); else document.head.appendChild(l);
    }
    for (const el of tpl.content.querySelectorAll('style')) document.head.appendChild(el.cloneNode(true));
    await Promise.all(waits);
  }
  async function fetchView(k, url) {
    const res = await fetch(url, { headers: { 'X-View': '1' }, credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) throw new Error(String(res.status));
    const r = await res.json();
    if (r.view !== k) throw new Error('view');
    return r;
  }

  let chain = Promise.resolve();
  const go = (k, url, push) => { chain = chain.then(() => swap(k, url, push)).catch(() => { location.href = url; }); return chain; };

  async function swap(k, url, push) {
    const to = sec(k); if (!to) { location.href = url; return; }
    if (k === cur) { if (push && url !== here()) location.href = url; return; }
    const from = cur, first = !loaded.has(k);
    let r = null;
    if (first) {
      const p = pill(k); p?.setAttribute('aria-busy', 'true');
      try { r = await fetchView(k, url); await addHead(r.head); } finally { p?.removeAttribute('aria-busy'); }
      addStrings(r.strings);
      acts(k).innerHTML = r.actions || '';
      to.innerHTML = r.body;
      to.dataset.cvBody = r.bodyClass || ''; to.dataset.cvTitle = r.title || document.title;
      if (k === 'classroom') to.classList.toggle('mid', !!r.mid);
    }
    // Leave the view on screen: it hears 'cv:hide' first (Homeroom pauses, the dashboard leaves Projector).
    keepRoom();
    sec(from).dispatchEvent(new CustomEvent('cv:hide'));
    await fade([sec(from), acts(from)], 1, 0, 110);
    sec(from).hidden = true; dataIds(from, false);
    document.body.classList.remove(`cv-on-${from}`, ...bodyClasses(from));
    cur = k; root.dataset.view = k;
    for (const a of bar.querySelectorAll('a[data-cv-go]')) { if (a.dataset.cvGo === k) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
    document.body.classList.add(`cv-on-${k}`, ...bodyClasses(k));
    main.classList.remove('rm-main');
    dataIds(k, true); to.hidden = false;
    document.title = to.dataset.cvTitle || document.title;
    if (push) history.pushState({ cv: k }, '', url);
    if (k !== 'classroom') scrollTo(0, 0);
    const fadeIn = fade([to, acts(k)], 0, 1, 170);
    if (first) {
      // The view's scripts run once, now that their elements are in the page and on screen (they measure them).
      for (const src of r.scripts || []) await import(src);
      main.classList.remove('rm-main');   // Homeroom's script marks <main> as the live room's; the views' CSS fills it
      if (to.querySelector('[data-reorder]')) import(`/js/reorder.js${V}`).then(m => m.wireAll(to)).catch(() => {});
      loaded.add(k);
    }
    to.dispatchEvent(new CustomEvent('cv:show'));
    document.dispatchEvent(new CustomEvent('cv:view', { detail: { view: k, classId: CID } }));
    if (k === 'classroom') {
      const was = store.get();
      if (was && was.url === here() && was.y) requestAnimationFrame(() => scrollTo(0, was.y));
    }
    const say = document.getElementById('cv-say'), p = pill(k);
    if (say && p) { say.textContent = ''; setTimeout(() => { say.textContent = p.textContent.trim(); }, 30); }
    await fadeIn;
  }

  // Every button in the bar whole, at every width (public/css/class-views.css): the view's buttons on screen are
  // measured, and when one does not fit (a live class, a longer language, a narrow window) the bar drops their words
  // (cv-icons), then the clock (cv-noclock), then a button the ⋯ menu also has (cv-fold, Arrange seats), then gives the
  // pill a row of its own (cv-two; under 1024 px it always has). Before all of these, Homeroom's Arrange seats loses its word
  // (cv-short: the ⋯ menu also has it), so the day plan pill (public/js/homeroom-plan.js) and the other buttons keep theirs.
  // Again after a resize, a view change and any change to the bar's buttons (Homeroom's live buttons come and go).
  const TIGHT = ['cv-short', 'cv-icons', 'cv-noclock', 'cv-fold', 'cv-two'], twoRows = matchMedia('(max-width: 1023px)');
  function overflows() {
    const a = acts(cur);
    if (bar.scrollWidth > bar.clientWidth + 1) return true;
    if (!a || !a.getClientRects().length) return false;
    if (a.scrollWidth > a.clientWidth + 1) return true;
    const r = a.getBoundingClientRect();
    for (const el of a.querySelectorAll('button, a, select, summary, .dash-now, .hr-livedot')) {
      const b = el.getBoundingClientRect();
      if (b.width && (b.left < r.left - 1 || b.right > r.right + 1)) return true;
    }
    return false;
  }
  function fit() {
    bar.classList.remove(...TIGHT);
    for (const c of TIGHT) {
      if (!overflows()) return;
      if (c === 'cv-two' && twoRows.matches) return;
      bar.classList.add(c);
    }
  }
  let fitting = 0;
  const refit = () => { if (!fitting) fitting = requestAnimationFrame(() => { fitting = 0; fit(); }); };
  fit();
  addEventListener('resize', refit);
  new MutationObserver(refit).observe(bar, { childList: true, subtree: true });
  document.fonts?.ready.then(refit, () => {});
  document.addEventListener('cv:view', refit);

  bar.addEventListener('click', e => {
    const a = e.target instanceof Element && e.target.closest('a[data-cv-go]');
    if (!a || e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const k = a.dataset.cvGo;
    if (k === cur) return;
    const url = k === 'classroom' && loaded.has('classroom') ? sec('classroom').dataset.cvUrl || a.getAttribute('href') : a.getAttribute('href');
    go(k, url, true);
  });
  // Another class: the same view of it (a new page).
  // All classes (the last option): the teacher's list of classes. Coming back to this page (Back, the page cache) shows
  // this class in the switcher again.
  const sw = bar.querySelector('[data-cv-switch]');
  addEventListener('pageshow', () => { if (sw && sw.value !== CID) sw.value = CID; });
  sw?.addEventListener('change', e => {
    const opt = e.target.selectedOptions && e.target.selectedOptions[0];
    if (opt && opt.dataset.cvHref) { location.href = opt.dataset.cvHref; return; }
    const id = e.target.value; if (!id || id === CID) return;
    const base = `/class/${encodeURIComponent(id)}`;
    location.href = cur === 'homeroom' ? `${base}/homeroom` : cur === 'dashboard' ? `${base}/dashboard` : base;
  });
  // Back and Forward between views. A Classroom address other than the one kept on the page (and not one the Games
  // tab's own list manages, public/js/shelf.js) is loaded as a page.
  addEventListener('popstate', e => {
    const k = viewOf(location.href);
    if (!k) { location.reload(); return; }
    if (k === cur) return;
    if (k === 'classroom' && loaded.has('classroom') && sec('classroom').dataset.cvUrl !== here() && !(e.state && 'shelf' in e.state)) { location.reload(); return; }
    go(k, here(), false);
  });
}
