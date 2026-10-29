// Runs in the page (page.evaluate): does everything in the top bar fit? Nothing closer than 4px (menu links 2px), nothing
// outside the window, no sideways scroll, the search placeholder not cut off, and the menus, Sign in / Me, the search
// field (or its round button) and, signed out, ▶ Play now all visible. Right-to-left bars are read from the right.
export function topbarFit() {
  const bar = document.querySelector('.topbar'); const rtl = document.dir === 'rtl';
  const vis = e => e && e.checkVisibility();
  const items = [...bar.children].filter(e => vis(e) && !e.classList.contains('skip')).map(e => e.getBoundingClientRect()).sort((a, b) => a.left - b.left);
  const nav = [...document.querySelectorAll('.topnav .navlink')].filter(vis).map(e => e.getBoundingClientRect()).sort((a, b) => a.left - b.left);
  const q = document.querySelector('#topq'), cs = getComputedStyle(q), cx = document.createElement('canvas').getContext('2d');
  cx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const field = vis(q);
  const cut = field && cx.measureText(q.placeholder).width > q.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const want = ['.topbar .langpick > summary', '.topbar .themepick > summary', '.topbar .me-btn', field ? '#topq' : '.topsearch-btn'];
  if (document.querySelector('.topbar .playnow')) want.push('.topbar .playnow');
  return { rtl, field, cut, missing: want.filter(s => !vis(document.querySelector(s))),
    tight: items.slice(1).some((b, i) => b.left - items[i].right < 4) || nav.slice(1).some((b, i) => b.left - nav[i].right < 2),
    off: items.some(b => b.left < 0 || b.right > innerWidth), wide: document.documentElement.scrollWidth - innerWidth };
}
