// Layout check: boxes on a page (panels, cards, rows with a border, background or shadow) must never touch.
// Used by tests/e2e/layout.spec.js and scripts/layout-audit.js.
//
// A "box" is an element that looks like a container: a shadow, a border all the way round, a background that differs
// from what is behind it, or a background image. Two boxes that are not inside one another must keep at least
// `gap` pixels between them (side by side or one above the other). Buttons, fields and chips are boxes too, and
// must keep `controlGap` pixels from each other and from other boxes.
//
// Not checked: boxes in fixed, sticky or absolutely placed layers (top bar, tab bar, menus, toasts), and parts that
// are built to join up (the segmented control, game frames).

/** Returns a list of touching or overlapping pairs: [{ a, b, gap, dir }]. */
export async function findTouching(page, { gap = 8, controlGap = 4 } = {}) {
  return page.evaluate(({ gap, controlGap }) => {
    const SKIP_INSIDE = '.topbar,.tabbar,.toasts,.sheet-bg,.stage,.seg,.sr-only,[aria-hidden="true"],.playbar,.lang-menu,.inline-menu .menu,.coverart,.heroart';
    const CONTROL = 'button,.btn,input,select,textarea,.chip,.iconbtn,.tab,summary.btn';
    const transparent = c => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
    const bgBehind = el => {
      for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!transparent(c)) return c; }
      return getComputedStyle(document.body).backgroundColor;
    };
    const layered = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky' || p === 'absolute') return true; } return false; };
    const looksBoxed = (el, cs) => {
      if (cs.boxShadow && cs.boxShadow !== 'none') return true;
      const sides = ['Top', 'Right', 'Bottom', 'Left'].filter(s => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none' && !transparent(cs[`border${s}Color`]));
      if (sides.length === 4) return true;
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
      return !transparent(cs.backgroundColor) && el.parentElement && cs.backgroundColor !== bgBehind(el.parentElement);
    };
    const name = el => {
      const one = e => e.tagName.toLowerCase() + (e.id ? `#${e.id}` : '') + [...e.classList].slice(0, 3).map(c => `.${c}`).join('');
      const parts = [one(el)]; let p = el.parentElement;
      for (let i = 0; i < 2 && p && p !== document.body; i++, p = p.parentElement) parts.unshift(one(p));
      const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return parts.join(' > ') + (text ? ` "${text}"` : '');
    };
    const boxes = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest(SKIP_INSIDE)) continue;
      // Contents of a closed <details> keep their boxes in some browsers, hidden: only its <summary> shows.
      const shut = el.closest('details:not([open])');
      if (shut && !el.closest('summary')?.parentElement?.isSameNode(shut) && el !== shut) continue;
      if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 16) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility !== 'visible' || +cs.opacity === 0 || cs.display === 'contents') continue;
      if (/^(HTML|BODY|MAIN|SCRIPT|STYLE|OPTION|OPTGROUP|SVG|IMG|VIDEO|CANVAS|IFRAME|TD|TH|TR|TBODY|THEAD|LABEL)$/.test(el.tagName)) continue;
      if (!looksBoxed(el, cs) || layered(el)) continue;
      boxes.push({ el, r: { l: r.left + scrollX, t: r.top + scrollY, rt: r.right + scrollX, b: r.bottom + scrollY }, control: el.matches(CONTROL) });
    }
    const out = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i], B = boxes[j];
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        const xo = Math.min(A.r.rt, B.r.rt) - Math.max(A.r.l, B.r.l);
        const yo = Math.min(A.r.b, B.r.b) - Math.max(A.r.t, B.r.t);
        let g, dir;
        if (xo > 2 && yo > 2) { g = -Math.min(xo, yo); dir = 'overlap'; }
        else if (xo > 2) { g = Math.max(B.r.t - A.r.b, A.r.t - B.r.b); dir = 'vertical'; }
        else if (yo > 2) { g = Math.max(B.r.l - A.r.rt, A.r.l - B.r.rt); dir = 'horizontal'; }
        else continue;
        const need = A.control || B.control ? controlGap : gap;
        if (g < need - 0.5) out.push({ a: name(A.el), b: name(B.el), gap: Math.round(g * 10) / 10, dir });
      }
    }
    return out;
  }, { gap, controlGap });
}
