// One fit for every kit game (replaces per-game resize()): design size, 'expand' (the view grows on the longer side so
// there are no bars) or 'letterbox', device-pixel ratio with a cap. Pure computeFit() is unit-tested.

/** computeFit(cssW, cssH, [W, H], fit, dpr) -> {k (css px per unit), vw, vh (visible design units), offX, offY (css px), dpr, pw, ph} */
export function computeFit(cw, ch, size, fit = 'expand', dpr = 1) {
  cw = Math.max(1, cw); ch = Math.max(1, ch);
  const W = size[0], H = size[1];
  const k = Math.min(cw / W, ch / H);
  let vw, vh, offX = 0, offY = 0;
  if (fit === 'letterbox') { vw = W; vh = H; offX = (cw - W * k) / 2; offY = (ch - H * k) / 2; }
  else { vw = cw / k; vh = ch / k; }
  return { k, vw, vh, offX, offY, dpr, pw: Math.max(1, Math.round(cw * dpr)), ph: Math.max(1, Math.round(ch * dpr)) };
}
/** Oomba.fit(canvas, {size, fit, dprCap}) for ported games: sizes the canvas to its parent (or the window) on every
 *  resize and returns {scale, offsetX, offsetY, dpr, vw, vh, off()} (scale = device px per design unit). */
export function fitCanvas(win, canvas, o = {}) {
  const size = o.size || [960, 540], cap = o.dprCap || 2;
  const res = { scale: 1, offsetX: 0, offsetY: 0, dpr: 1, vw: size[0], vh: size[1], off: null, onResize: o.onResize || null };
  const apply = () => {
    const parent = canvas.parentElement;
    const cw = parent && parent !== win.document.body ? parent.clientWidth : win.innerWidth, ch = parent && parent !== win.document.body ? parent.clientHeight : win.innerHeight;
    const dpr = Math.min(win.devicePixelRatio || 1, cap);
    const f = computeFit(cw, ch, size, o.fit, dpr);
    canvas.width = f.pw; canvas.height = f.ph; canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    res.scale = f.k * dpr; res.offsetX = f.offX * dpr; res.offsetY = f.offY * dpr; res.dpr = dpr; res.vw = f.vw; res.vh = f.vh;
    if (res.onResize) res.onResize(res);
  };
  apply();
  win.addEventListener('resize', apply);
  res.off = () => win.removeEventListener('resize', apply);
  return res;
}
