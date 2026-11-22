// The layout check the Builder's playtest runs inside a game frame at each device size (snapshot.js autoplay and the
// preview's views; builder/autotest.js turns its findings into the fix-it report). It runs IN THE PAGE
// (frame.evaluate(layoutProblems, opts)), so it must stay one self-contained function: no imports, no outer names.
// Findings are short sentences for the model, at most 6 per size:
//   - the page is wider than the screen (sideways scrolling)
//   - something cut off at the screen edge (not inside a row that scrolls sideways on purpose, such as Oomba Canvas's
//     toolbar, and not below the fold of a page that scrolls)
//   - text that does not fit its button, label or heading (scrollWidth > clientWidth: cut off, spilling out, or "…")
//   - visible buttons and links on top of each other
//   - buttons too small to tap (opts.minTap: 40 px on a phone, 44 elsewhere) or squashed tall and thin
// Only visible things on top count (not a board under a question card, not floating layers that ignore the pointer,
// such as banners and confetti).

/** opts: { minTap (default 44), skipKit (an activity on an older Oomba Canvas: leave out the kit's own parts, .oc) }
 *  -> [finding, ...] */
export function layoutProblems(opts) {
  const minTap = (opts && opts.minTap) || 44;
  const W = innerWidth, H = innerHeight, found = [];
  // rank: 0 sideways scrolling, 1 overlaps and text that does not fit, 2 cut off at an edge, 3 tap sizes (the most
  // serious first: only 6 are kept)
  const say = (s, rank = 1) => { if (!found.some(f => f.s === s)) found.push({ s, rank }); };
  const de = document.documentElement, body = document.body;
  if (de.scrollWidth > W + 2 || (body && body.scrollWidth > W + 2)) {
    // name the outermost thing that sticks out, so the model knows what to fix
    const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '');
    let wide = null;
    for (const el of body ? body.querySelectorAll('*') : []) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > W + 2) { wide = el; break; } }
    say(`the page is wider than the screen and scrolls sideways${wide ? ` (<${name(wide)}> reaches x=${Math.round(wide.getBoundingClientRect().right)})` : ''}`, 0);
  }
  const shown = el => {
    if (el.closest('[aria-hidden="true"],[hidden]')) return false;
    for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.2) return false; }
    const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2;
  };
  const floating = el => { for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).pointerEvents === 'none') return true; return false; };
  const label = el => (el.innerText || el.value || el.getAttribute('aria-label') || el.tagName.toLowerCase()).trim().replace(/\s+/g, ' ').slice(0, 28);
  const txt = el => `"${label(el)}"`;
  const ownText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  // a box that scrolls (a list, a panel, a toolbar row that scrolls sideways on purpose): what is outside it is reachable
  const scrollerOf = el => {
    for (let e = el.parentElement; e && e !== body && e !== de; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (/auto|scroll/.test(cs.overflowY) || /auto|scroll/.test(cs.overflowX)) return e;
    }
    return null;
  };
  // a bar pinned to the screen (position fixed or sticky): on a page that scrolls, content passes under it by design
  const pinnedOf = el => { for (let e = el; e && e !== body; e = e.parentElement) if (/fixed|sticky/.test(getComputedStyle(e).position)) return e; return null; };
  const passesUnder = (a, b) => pageScrollsY && !a.pinned !== !b.pinned;
  const pageScrollsY = de.scrollHeight > H + 2 && !/hidden|clip/.test(getComputedStyle(de).overflowY) && !(body && /hidden|clip/.test(getComputedStyle(body).overflowY));
  // Oomba Canvas marks a dense number line or fraction bar (data-oc-dense: each tick or part is as wide as its share, with
  // no gaps, and a tick's number may sit wider than it): small by design
  const dense = el => !!(window.OombaCanvas && el.closest('[data-oc-dense]'));
  const items = [];
  for (const el of body ? body.querySelectorAll('*') : []) {
    if (/^(SCRIPT|STYLE|CANVAS|TEMPLATE|NOSCRIPT|svg|path|g)$/i.test(el.tagName)) continue;
    const control = el.matches('button,[role="button"],a[href],input,select,textarea');
    const boxed = !control && el.matches('label,h1,h2,h3,h4,h5,h6,[role="heading"]');
    if (!control && !boxed && !ownText(el)) continue;
    if (!shown(el)) continue;
    if (opts && opts.skipKit && el.closest('.oc')) continue;
    const r = el.getBoundingClientRect();
    const cx = Math.min(W - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(H - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(cx, cy);
    if (hit && !el.contains(hit) && !hit.contains(el) && !floating(hit) && cy === r.top + r.height / 2) continue;   // covered by another layer
    items.push({ el, control, boxed, r, float: floating(el), scroller: scrollerOf(el), pinned: pinnedOf(el) });
    if (items.length > 400) break;
  }
  for (const it of items) {
    const r = it.r, cs = getComputedStyle(it.el);
    const sideways = r.left < -2 || r.right > W + 2, up = r.top < -2 && !pageScrollsY && !scrollY, down = r.bottom > H + 2 && !pageScrollsY;
    if (!it.float && !it.scroller && (sideways || up || down)) say(`cut off at the screen edge: ${txt(it.el)}`, 2);
    // text that does not fit its box: cut off (overflow hidden), shortened with "…", or spilling out of a button
    const over = it.el.scrollWidth > it.el.clientWidth + 2 && it.el.clientWidth > 0;
    if ((it.control || it.boxed) && over && !dense(it.el) && (/hidden|clip/.test(cs.overflowX) || cs.textOverflow === 'ellipsis' || it.control)) { say(`the text of ${it.control ? 'the button' : 'the heading or label'} ${txt(it.el)} does not fit in it (${it.el.clientWidth}px wide, needs ${it.el.scrollWidth}px)`); if (it.control) it.spill = true; }
    else if (!it.control && /hidden|clip/.test(cs.overflowX + cs.overflowY) && cs.textOverflow !== 'ellipsis' && (it.el.scrollWidth > it.el.clientWidth + 2 || it.el.scrollHeight > it.el.clientHeight + 3)) say(`text cut off inside its box: ${txt(it.el)}`);
    if (it.control && !it.float && !dense(it.el)) {
      const w = Math.round(r.width), h = Math.round(r.height);
      if (Math.min(w, h) < minTap) say(`too small to tap (${w}x${h}px, needs ${minTap}): ${txt(it.el)}`, 3);
      else if (h / w > 1.5) say(`squashed tall and thin (${w}x${h}px): ${txt(it.el)}`, 3);
    }
  }
  // buttons and links on top of each other (each pair once)
  const controls = items.filter(it => it.control && !it.float);
  // (a label spilling out of its button counts with the space its text really takes)
  const inkOf = it => { if (!it.spill) return it.r; try { const g = document.createRange(); g.selectNodeContents(it.el); const t = g.getBoundingClientRect(); return { left: Math.min(it.r.left, t.left), right: Math.max(it.r.right, t.right), top: it.r.top, bottom: it.r.bottom }; } catch (e) { return it.r; } };
  let pairs = 0;
  for (let i = 0; i < controls.length && pairs < 3; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], b = controls[j];
    if (a.el.contains(b.el) || b.el.contains(a.el) || passesUnder(a, b)) continue;
    const ra = inkOf(a), rb = inkOf(b);
    const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (x > 2 && y > 2) { say(`the buttons ${txt(a.el)} and ${txt(b.el)} overlap`); pairs++; break; }
  }
  // other visible things on top of each other (text over text, text over a button)
  const flat = items.filter(it => !it.float);
  for (let i = 0; i < flat.length && found.length < 40; i++) for (let j = i + 1; j < flat.length; j++) {
    const a = flat[i], b = flat[j];
    if (a.control && b.control) continue;   // said above
    if (a.el.contains(b.el) || b.el.contains(a.el) || passesUnder(a, b)) continue;
    if (a.control !== b.control && (a.el.closest('button,[role="button"]') || b.el.closest('button,[role="button"]'))) continue;
    const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (x > 4 && y > 4 && x * y > Math.min(a.r.width * a.r.height, b.r.width * b.r.height) * 0.2) { say(`on top of each other: ${txt(a.el)} and ${txt(b.el)}`); break; }
  }
  return found.sort((a, b) => a.rank - b.rank).slice(0, 6).map(f => f.s);
}

/** In an Oomba Canvas activity: play the set to its end card (Check twice shows the worked answer, then Next), so the
 *  results card's layout is checked too. -> true when the end card is on screen. Self-contained (frame.evaluate). */
export function canvasToEnd() {
  if (!window.OombaCanvas || !document.querySelector('.oc')) return false;
  const end = document.querySelector('.oc-end');
  for (let i = 0; i < 80 && end && end.hidden; i++) { const y = document.querySelector('.oc-fb .oc-btn'); if (y) y.click(); const b = document.querySelector('.oc-band .oc-primary'); if (!b) break; b.click(); }
  return !!(end && !end.hidden);
}
