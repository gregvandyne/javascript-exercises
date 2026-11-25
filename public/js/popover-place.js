// A dropdown or popover kept fully on the screen (Homeroom's ⋯ menu; docs/decisions.md "Homeroom: one way to edit the
// board"). It is placed by its button with position: fixed: under it (over it when there is more room above), lined up
// with the button's right edge, or its left edge when that would go off the left side (a wrapped top bar puts the button
// at the far left), then kept inside the viewport on every side, its height capped so it scrolls inside. Placed again
// when the window is resized or the page scrolls, until it leaves the page.
const clamp = (v, lo, hi) => Math.min(Math.max(lo, v), Math.max(lo, hi));

export function placePopover(pop, anchor, { gap = 8, margin = 8 } = {}) {
  if (!pop || !anchor) return;
  const place = () => {
    if (!pop.isConnected || !anchor.isConnected) { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); return; }
    const vv = window.visualViewport, vw = document.documentElement.clientWidth || window.innerWidth, vh = vv ? vv.height : window.innerHeight;
    Object.assign(pop.style, { position: 'fixed', right: 'auto', bottom: 'auto', maxWidth: `${vw - margin * 2}px`, maxHeight: '' });
    const a = anchor.getBoundingClientRect(), w = Math.min(pop.offsetWidth, vw - margin * 2);
    let left = a.right - w; if (left < margin) left = a.left;
    left = clamp(left, margin, vw - margin - w);
    const below = vh - a.bottom - gap - margin, above = a.top - gap - margin, h = pop.scrollHeight;
    let top;
    if (h <= below || below >= above) { pop.style.maxHeight = `${Math.max(120, below)}px`; top = a.bottom + gap; }
    else { pop.style.maxHeight = `${above}px`; top = a.top - gap - Math.min(h, above); }
    top = clamp(top, margin, vh - margin - Math.min(pop.offsetHeight, vh - margin * 2));
    pop.style.left = `${left}px`; pop.style.top = `${top}px`;
  };
  place();
  window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
}
