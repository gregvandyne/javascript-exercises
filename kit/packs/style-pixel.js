// Style pack "style-pixel" (public/vendor/oomba-kit/<version>/packs/style-pixel.js): the pixel art style, opt-in.
// A game turns it on with Oomba.style('pixel') before it draws (this pack's tag and art-pixel's, after the kit tag).
// Without this pack Oomba.style('pixel') is the Ink look ('playful'): the style always falls back to Oomba Ink.
// Same Oomba Ink rules at a pixel scale (docs/kit.md "Pixel style"): the kit's colours, a 1 px Ink edge, one hard
// shade. What changes:
// - the UI (under .ok-pixel): a pixel font (Pixelify Sans, SIL OFL, self-hosted next to the kit, Latin and Cyrillic;
//   other scripts keep the kit font; numbers and maths signs in Oomba Pixel Digits, drawn so 5 never reads as S),
//   square cards and buttons with stepped corners and hard Ink drop edges, no
//   gradients on the title lockup;
// - Oomba.pixel: the pixel palette, the art from the art-pixel pack (one atlas of Blender-rendered sprites and
//   hand-pixelled tiles), and the helpers a 2D game needs to draw in the style at any screen size: an integer pixel
//   scale, sprites drawn nearest-neighbour, a dithered sky, a palette snap (with the Ink edge) for anything drawn at
//   run time (a player's own avatar), and a night grade that stays inside the palette.
export const PACK = { name: 'style-pixel' };
export function define(K) {
  const kit = K.kit, win = kit.win, doc = kit.doc, INK = K.INK;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const S = { on: false, art: null, img: null, wait: [], pal: null, lut: new Map(), nightLut: null };
  const FONT = 'Oomba Pixel', DIGITS = 'Oomba Pixel Digits';   // words in Pixelify Sans, numbers and signs in the kit's own pixel digits
  // ---- the style switch: pixel, or the kit's own (bold / playful) ----
  const base = kit.setStyle;
  const font = () => {
    const r = kit.ui.root; if (!r) return;
    const cur = (r.style.getPropertyValue && r.style.getPropertyValue('--ok-font')) || '';
    if (S.on && cur.indexOf(FONT) < 0) r.style.setProperty('--ok-font', `'${DIGITS}','${FONT}',` + cur);
  };
  const sync = kit.ui.sync.bind(kit.ui);
  kit.ui.sync = () => { sync(); font(); };
  let faces = false;
  const loadFaces = () => {
    if (faces || !win.FontFace || !doc.fonts || !kit.base) return; faces = true;
    for (const [f, range] of [['pixelify-latin.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
      ['pixelify-latin-ext.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF'],
      ['pixelify-cyrillic.woff2', 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'], ['oomba-pixel-digits.woff2', 'U+2B-2F,U+30-39,U+3D,U+3F,U+D7,U+F7,U+2212']]) {
      try { const face = new win.FontFace(f.startsWith('oomba') ? DIGITS : FONT, `url(${kit.base}fonts/${f}) format('woff2')`, { weight: '400 700', unicodeRange: range, display: 'swap' }); doc.fonts.add(face); face.load().catch(() => {}); } catch (e) { /* the kit font stays */ }
    }
  };
  kit.setStyle = n => {
    const root = kit.ui.mount();
    if (n !== 'pixel') { S.on = false; root.classList.remove('ok-pixel'); kit.ui.sync(); return base(n); }
    base('playful'); K.style.name = 'pixel'; S.on = true;
    root.classList.add('ok-pixel'); loadFaces(); font();
    if (!S.art) kit.warn("style 'pixel': load the art-pixel pack too (its pinned tag right after style-pixel's)");
    return 'pixel';
  };
  // ---- the UI skin (only under .ok-pixel). --px is one UI pixel; corners are stepped by one pixel ----
  const P = K.P, cut = 'polygon(0 var(--px),var(--px) var(--px),var(--px) 0,calc(100% - var(--px)) 0,calc(100% - var(--px)) var(--px),100% var(--px),100% calc(100% - var(--px) + var(--lip,0px)),calc(100% - var(--px)) calc(100% - var(--px) + var(--lip,0px)),calc(100% - var(--px)) calc(100% + var(--lip,0px)),var(--px) calc(100% + var(--lip,0px)),var(--px) calc(100% - var(--px) + var(--lip,0px)),0 calc(100% - var(--px) + var(--lip,0px)))';
  const css = `.ok-ui.ok-pixel{--px:3px;--ok-radius:0px}
.ok-ui.ok-pixel canvas{image-rendering:pixelated}
.ok-ui.ok-pixel .ok-px,.ok-ui.ok-pixel .ok-btn,.ok-ui.ok-pixel .ok-card,.ok-ui.ok-pixel .ok-pill,.ok-ui.ok-pixel .ok-toast,.ok-ui.ok-pixel .ok-tile,.ok-ui.ok-pixel .ok-tiles,.ok-ui.ok-pixel .ok-bubble,.ok-ui.ok-pixel .ok-brand,.ok-ui.ok-pixel .ok-seg{border-radius:0!important;clip-path:${cut};border-width:var(--px)!important}
.ok-ui.ok-pixel .ok-btn{--lip:calc(var(--px) * 2);box-shadow:0 calc(var(--px) * 2) 0 var(--ok-press,${INK})!important;letter-spacing:.02em}
.ok-ui.ok-pixel .ok-btn:active,.ok-ui.ok-pixel .ok-btn.ok-down{transform:translateY(var(--px));box-shadow:0 var(--px) 0 var(--ok-press,${INK})!important}
.ok-ui.ok-pixel .ok-card{--lip:calc(var(--px) * 2);box-shadow:0 calc(var(--px) * 2) 0 ${INK}!important}
.ok-ui.ok-pixel .ok-big{animation:none}
.ok-ui.ok-pixel .ok-title-word{rotate:0deg!important;animation:ok-fade 200ms ease-out both}
.ok-ui.ok-pixel .ok-title-word i{background:none;color:${P.spark[1]};-webkit-text-fill-color:${P.spark[1]}}
.ok-ui.ok-pixel .ok-title-word:nth-child(even) i{color:${P.coral[1]};-webkit-text-fill-color:${P.coral[1]}}
.ok-ui.ok-pixel .ok-title-word::before{-webkit-text-stroke-width:.09em;transform:translate(0,.07em)}
.ok-ui.ok-pixel .ok-title-word::after{display:none}
.ok-ui.ok-pixel .ok-title-block::before,.ok-ui.ok-pixel .ok-cta::before{display:none}
.ok-ui.ok-pixel{font-variant-ligatures:none;font-feature-settings:"liga" 0,"clig" 0}
.ok-ui.ok-pixel .ok-h1,.ok-ui.ok-pixel .ok-h2{font-weight:700;letter-spacing:.01em}
.ok-ui.ok-pixel .ok-scrim{-webkit-backdrop-filter:none;backdrop-filter:none}
.ok-ui.ok-pixel .ok-switch{border-radius:0!important}.ok-ui.ok-pixel .ok-switch::after,.ok-ui.ok-pixel .ok-switch::before{border-radius:0!important}`;
  const el = doc.createElement('style'); el.textContent = css; (doc.head || doc.documentElement).appendChild(el);

  // ---- colours ----
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const lab = ([r, g, b]) => {   // OKLab, as the Blender post snaps (tools/blender/styles.py quantize)
    const l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const R = l(r), G = l(g), B = l(b);
    const L = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), M = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), N = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * L + 0.7936177850 * M - 0.0040720468 * N, 1.9779984951 * L - 2.4285922050 * M + 0.4505937099 * N, 0.0259040371 * L + 0.7827717662 * M - 0.8086757660 * N];
  };
  const palette = () => { if (!S.pal && S.art) S.pal = S.art.palette.map(h => ({ h, rgb: hex(h), lab: lab(hex(h)) })); return S.pal || []; };
  const nearest = rgb => {
    const key = (rgb[0] >> 2) << 12 | (rgb[1] >> 2) << 6 | rgb[2] >> 2;
    let hit = S.lut.get(key); if (hit) return hit;
    const q = lab(rgb); let best = null, bd = 1e9;
    for (const p of palette()) { const d = (p.lab[0] - q[0]) ** 2 + 2 * ((p.lab[1] - q[1]) ** 2 + (p.lab[2] - q[2]) ** 2); if (d < bd) { bd = d; best = p; } }
    S.lut.set(key, best); return best;
  };
  /** snap(canvas, {outline}): every pixel to the nearest palette colour (alpha cut at half), then a 1 px Ink edge
   *  round the silhouette (outside it), as the Blender post does. In place; returns the canvas. */
  const snap = (cv, o = {}) => {
    const g = cv.getContext('2d'), w = cv.width, h = cv.height, im = g.getImageData(0, 0, w, h), d = im.data;
    const on = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (d[i * 4 + 3] < 128) { d[i * 4 + 3] = 0; continue; }
      const p = nearest([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]); d[i * 4] = p.rgb[0]; d[i * 4 + 1] = p.rgb[1]; d[i * 4 + 2] = p.rgb[2]; d[i * 4 + 3] = 255; on[i] = 1;
    }
    if (o.outline !== false) {
      const ink = hex(INK);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; if (on[i]) continue;
        if ((x > 0 && on[i - 1]) || (x < w - 1 && on[i + 1]) || (y > 0 && on[i - w]) || (y < h - 1 && on[i + w])) { d[i * 4] = ink[0]; d[i * 4 + 1] = ink[1]; d[i * 4 + 2] = ink[2]; d[i * 4 + 3] = 255; }
      }
    }
    g.putImageData(im, 0, 0); return cv;
  };
  /** night(canvas): each colour to the palette colour nearest to it darkened and cooled toward the night sky. */
  const NIGHT = hex('#0E2A2E');
  const night = cv => {
    const g = cv.getContext('2d'), im = g.getImageData(0, 0, cv.width, cv.height), d = im.data;
    if (!S.nightLut) S.nightLut = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const k = d[i] << 16 | d[i + 1] << 8 | d[i + 2]; let p = S.nightLut.get(k);
      if (!p) { const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255, f = lum > 0.85 ? 0.38 : 0.5; p = nearest([d[i] + (NIGHT[0] - d[i]) * f, d[i + 1] + (NIGHT[1] - d[i + 1]) * f, d[i + 2] + (NIGHT[2] - d[i + 2]) * f]).rgb; S.nightLut.set(k, p); }
      d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2];
    }
    g.putImageData(im, 0, 0); return cv;
  };
  /** sky(g, w, h, stops): a vertical gradient through the stops (palette colours): solid bands with an ordered dither
   *  where each neighbouring pair meets, w x h in the pixels of g (draw it into a native-size canvas and scale it up). */
  const sky = (g, w, h, stops) => {
    const n = stops.length - 1;
    for (let y = 0; y < h; y++) {
      const t = (y / Math.max(1, h - 1)) * n, i = Math.min(n - 1, Math.floor(t)), f = Math.min(1, Math.max(0, (t - i - 0.5) * 2.6 + 0.5));   // solid bands, dithered where they meet
      for (let x = 0; x < w; x += 4) {
        for (let k = 0; k < 4 && x + k < w; k++) { g.fillStyle = f > (BAYER[(y % 4) * 4 + ((x + k) % 4)] + 0.5) / 16 ? stops[i + 1] : stops[i]; g.fillRect(x + k, y, 1, 1); }
      }
    }
  };
  /** The art: the atlas image (once decoded) and its frames. */
  const ready = new Promise(res => S.wait.push(res));
  const take = A => {
    S.art = A; S.pal = null; S.lut.clear(); S.nightLut = null;
    if (!win.Image) return;   // no images here (a test's fake window): the art is known, nothing is drawn
    const img = new win.Image();
    img.onload = () => { S.img = img; for (const f of S.wait.splice(0)) f(true); };
    img.onerror = () => { kit.warn('style-pixel: the art atlas did not decode'); for (const f of S.wait.splice(0)) f(false); };
    img.src = A.png;
  };
  if (kit.pixelArt) take(kit.pixelArt); else kit.pixelArtReady = take;
  /** draw(g, name, x, y, k, o): frame `name` with its top-left at (x, y), each art pixel k x k, nearest neighbour.
   *  o.flip mirrors it; o.anchor 'bottom' puts (x, y) at its bottom centre. -> [w, h] drawn, or null. */
  const draw = (g, name, x, y, k, o) => {
    const f = S.art && S.img && S.art.frames[name]; if (!f) return null;
    const w = f[2] * k, h = f[3] * k; o = o || {};
    if (o.anchor === 'bottom') { x -= w / 2; y -= h; }
    const s = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
    if (o.flip) { g.save(); g.translate(x + w, y); g.scale(-1, 1); g.drawImage(S.img, f[0], f[1], f[2], f[3], 0, 0, w, h); g.restore(); }
    else g.drawImage(S.img, f[0], f[1], f[2], f[3], x, y, w, h);
    g.imageSmoothingEnabled = s;
    return [w, h];
  };
  const api = {
    /** true while the style is pixel and the art is ready to draw. */
    get on() { return S.on && !!S.img; },
    get style() { return S.on; },
    get art() { return S.art; },
    get image() { return S.img; },
    ready,
    palette: () => palette().map(p => p.h),
    frame: name => (S.art && S.art.frames[name]) || null,
    /** scale(cssPx, artPx): the integer pixel size that makes artPx art pixels about cssPx CSS pixels (at least 1). */
    scale: (css, art) => Math.max(1, Math.round(css / art)),
    draw, snap, night, sky, nearest: rgb => nearest(rgb).h,
    font: FONT, digits: DIGITS,
  };
  const O = win.Oomba || win.OK;
  if (O && !O.pixel) Object.defineProperty(O, 'pixel', { value: api, enumerable: true });
  kit.pixel = api;
}
