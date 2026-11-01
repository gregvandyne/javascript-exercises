// Layout check inside a game frame (used by tests/e2e/live-layout.spec.js): at the current viewport, does everything
// the player or the class needs to read or tap fit? Returns a list of problems (empty = fine):
//   offscreen  text or a control that sticks out of the frame's own window (cut off at an edge)
//   clipped    text cut off inside a box that hides overflow (a box that scrolls is fine)
//   overlap    two pieces of text, or two controls, on top of each other (overlays that ignore the pointer, such as
//              a banner or confetti, are left out: they are meant to float over the game)
//   squashed   a tappable control under 40 px, or out of shape (a tile half again taller than wide, or a sliver)
// Only visible things count: hidden, transparent and zero-size elements, anything in an aria-hidden layer, and
// anything covered by another layer (a board under the question card).
export async function frameProblems(frame, { minTap = 40 } = {}) {
  return frame.evaluate(({ minTap }) => {
    const W = innerWidth, H = innerHeight, out = [];
    const visible = el => {
      if (el.closest('[aria-hidden="true"],[hidden]')) return false;
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.2) return false;
      }
      const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2;
    };
    const floating = el => { for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).pointerEvents === 'none') return true; return false; };
    const label = el => {
      const one = e => e.tagName.toLowerCase() + (e.id ? `#${e.id}` : '') + [...e.classList].slice(0, 2).map(c => `.${c}`).join('');
      return `${one(el.parentElement || el)} > ${one(el)} "${(el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`;
    };
    // Things to check: controls, and elements that hold text of their own.
    const ownText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const items = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (/^(SCRIPT|STYLE|CANVAS|SVG|svg|path|g|TEMPLATE|NOSCRIPT)$/.test(el.tagName)) continue;
      const control = el.matches('button,[role="button"],a[href],input,select');
      if (!control && !ownText(el)) continue;
      if (!visible(el)) continue;
      const rect = el.getBoundingClientRect();
      // Behind something else (a board under the question card): what is on top at its middle is not part of it.
      const cx = Math.min(W - 1, Math.max(0, rect.left + rect.width / 2)), cy = Math.min(H - 1, Math.max(0, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(cx, cy);
      const behind = hit && !el.contains(hit) && !hit.contains(el) && !floating(hit) && cy === rect.top + rect.height / 2;
      if (behind) continue;
      items.push({ el, control, rect, float: floating(el) });
    }
    for (const it of items) {
      const r = it.rect, name = label(it.el);
      // Text that scrolls with a scrolling box is fine; only judge what is in the frame's own window.
      let scroller = null;
      for (let e = it.el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowY; if (o === 'auto' || o === 'scroll') { scroller = e; break; } }
      if (!scroller && !it.float && (r.left < -2 || r.top < -2 || r.right > W + 2 || r.bottom > H + 2)) out.push({ kind: 'offscreen', what: name, rect: [r.left, r.top, r.width, r.height].map(Math.round) });
      // A control (an answer button) has to be in view without scrolling, even inside a box that scrolls.
      if (scroller && it.control && !it.float) {
        const b = scroller.getBoundingClientRect();
        if (r.top < b.top - 2 || r.bottom > Math.min(b.bottom, H) + 2) out.push({ kind: 'offscreen', what: `${name} (needs scrolling)`, rect: [r.left, r.top, r.width, r.height].map(Math.round) });
      }
      const cs = getComputedStyle(it.el);
      if (!it.control && /hidden|clip/.test(cs.overflowX + cs.overflowY) && cs.textOverflow !== 'ellipsis' && (it.el.scrollWidth > it.el.clientWidth + 2 || it.el.scrollHeight > it.el.clientHeight + 3)) out.push({ kind: 'clipped', what: name });
      if (it.control && !it.float) {
        const small = Math.min(r.width, r.height), ratio = r.height / r.width;
        if (small < minTap) out.push({ kind: 'squashed', what: name, size: [Math.round(r.width), Math.round(r.height)] });
        else if (ratio > 1.5 || ratio < 0.08) out.push({ kind: 'squashed', what: name, size: [Math.round(r.width), Math.round(r.height)] });
      }
    }
    // Overlap: pairs of texts or of controls in the normal page (not floating), not nested in each other.
    const flat = items.filter(it => !it.float);
    for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i], b = flat[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.control !== b.control && (a.el.closest('button,[role="button"]') || b.el.closest('button,[role="button"]'))) continue;
      const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (x > 4 && y > 4) {
        const area = x * y, small = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
        if (area > small * 0.2) out.push({ kind: 'overlap', what: `${label(a.el)}  ×  ${label(b.el)}` });
      }
    }
    return out;
  }, { minTap });
}

/** The page around the frame: no sideways scrolling at this width. */
export async function pageScrollsSideways(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
}
