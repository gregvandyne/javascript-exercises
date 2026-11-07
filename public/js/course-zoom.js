// Zoom-to-cue for lesson screenshots (a self-contained block for public/js/course.js; loaded only when a page has a
// toured screenshot whose capture recorded its words: public/js/course-zoom-data.js and /img/zoom/<key>.json).
//
// A phone shows a 1280-wide game capture at a third of its size or less, so the game's own words can land at 7 px.
// When a figure's words would render under MIN_PX, its picture shows whole (its authored view) at rest, and each
// tour step zooms and pans the picture so that the step's box, with a margin, fills the frame: as close as the box
// allows to READ_PX for the words, never under MIN_PX when the box fits, and never further than MAX_Z. The zoom's
// edges sit in the gaps between words (the capture's recorded word boxes): no word anywhere is cut by the frame,
// and every word the box touches is held whole. The ring, badge and chip follow the zoomed picture (the step's box
// is laid out in the zoomed frame, and course.js parks its badge there); the step's words go to the caption strip
// under the picture. Reduced motion: the zoom steps through without animation. The whole-picture viewer (⤢) is
// untouched. The pure geometry (zoomFor) is shared with the tests (tests/unit/cyber-shots.test.js).

export const MIN_PX = 11, READ_PX = 15, MAX_Z = 4;
const MX = 1.6, MY = 2.8; // the margin round a box, % of the picture's width / height
// A frame edge must clear every line by this much (% of the picture): a glyph's ink runs past its text box a little.
const CLEAR_X = 0.6, CLEAR_Y = 0.8;
/** The lines a region [x, y, w, h] cuts: crossed by one of its edges, or with an end too close inside it. */
export function cutLines(d, lines) {
  const [x0, y0, x1, y1] = [d[0], d[1], d[0] + d[2], d[1] + d[3]];
  return lines.filter(l => {
    const lx1 = l[0] + l[2], ly1 = l[1] + l[3];
    const inY = Math.min(ly1, y1) - Math.max(l[1], y0) > 0.05, inX = Math.min(lx1, x1) - Math.max(l[0], x0) > 0.05;
    const sx = e => l[0] < e + CLEAR_X && lx1 > e - CLEAR_X, sy = e => l[1] < e + CLEAR_Y && ly1 > e - CLEAR_Y;
    return (inY && ((sx(x0) && x0 > 0.05) || (sx(x1) && x1 < 99.95))) || (inX && ((sy(y0) && y0 > 0.05) || (sy(y1) && y1 < 99.95)));
  });
}

const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0.05;
/** The game's body text size (px) when the picture's region `vw` % wide is drawn `frameW` px wide. */
export const textPx = (font, vw, frameW) => font * frameW / (vw * 12.8);

/** The zoom for one step. view, box: [x, y, w, h] in % of the picture; font: the capture's body text size in its
 *  1280-wide master; words: its word boxes (% of the picture); frameW: the frame's width in px.
 *  -> null when the words already read at rest, else { d: [x, y, w, h] the region shown, z, px: the words' size,
 *  fits: the box fits at MIN_PX or more, cut: the word boxes the region's edges cross }. */
/** The picture's lines of text: its words joined where they sit on one line with a word space between them. A zoom
 *  never shows part of a line (half a sentence reads as wrong as half a word). */
const LINES = new WeakMap();
export function linesOf(words) {
  if (LINES.has(words)) return LINES.get(words);
  // rows: words whose heights overlap by half; each row, left to right, split only where the gap is wider than 5%
  // (a chip's padding and tick mark inside a sentence keep the sentence one line)
  const rows = [];
  for (const w of [...words].sort((p, q) => p[1] - q[1])) {
    const row = rows.find(r => Math.min(r.b, w[1] + w[3]) - Math.max(r.t, w[1]) > 0.5 * Math.min(r.b - r.t, w[3]));
    if (row) { row.ws.push(w); row.t = Math.min(row.t, w[1]); row.b = Math.max(row.b, w[1] + w[3]); } else rows.push({ t: w[1], b: w[1] + w[3], ws: [w] });
  }
  const out = [];
  for (const row of rows) {
    let cur = null;
    for (const w of row.ws.sort((p, q) => p[0] - q[0])) {
      if (cur && w[0] - (cur[0] + cur[2]) < 5) { const x1 = Math.max(cur[0] + cur[2], w[0] + w[2]), y0 = Math.min(cur[1], w[1]), y1 = Math.max(cur[1] + cur[3], w[1] + w[3]); cur[1] = y0; cur[2] = x1 - cur[0]; cur[3] = y1 - y0; }
      else { cur = [...w]; out.push(cur); }
    }
  }
  LINES.set(words, out);
  return out;
}
export function zoomFor(view, box, font, words, frameW) {
  words = linesOf(words);
  const [vx, vy, vw, vh] = view;
  const base = textPx(font, vw, frameW);
  if (base >= MIN_PX - 0.05) return null;
  const k = vh / vw;
  // the box and its margin, grown to hold whole every line the box touches
  let r = [box[0] - MX, box[1] - MY, box[0] + box[2] + MX, box[1] + box[3] + MY];
  for (const w of words) if (ov(w[0], w[0] + w[2], box[0], box[0] + box[2]) && ov(w[1], w[1] + w[3], box[1], box[1] + box[3])) {
    r = [Math.min(r[0], w[0] - 0.4), Math.min(r[1], w[1] - 0.6), Math.max(r[2], w[0] + w[2] + 0.4), Math.max(r[3], w[1] + w[3] + 0.6)];
  }
  r = [Math.max(0, r[0]), Math.max(0, r[1]), Math.min(100, r[2]), Math.min(100, r[3])];
  const rw = r[2] - r[0], rh = r[3] - r[1];
  const zFit = Math.min(vw / rw, vh / rh);
  const need = MIN_PX / base;
  const zTop = Math.max(1, Math.min(zFit, MAX_Z, Math.max(need, READ_PX / base)));
  // the words an edge at x (or y) would cut, each kept with its extent on the other axis
  const atX = x => (x <= 0.05 || x >= 99.95 ? [] : words.filter(w => w[0] < x + CLEAR_X && w[0] + w[2] > x - CLEAR_X));
  const atY = y => (y <= 0.05 || y >= 99.95 ? [] : words.filter(w => w[1] < y + CLEAR_Y && w[1] + w[3] > y - CLEAR_Y));
  const place = z => {
    const dw = Math.min(100, vw / z), dh = Math.min(100, dw * k);
    const span = (a0, a1, len) => [Math.max(0, a1 - len), Math.min(100 - len, a0)];
    const [xa, xb] = span(r[0], r[2], dw), [ya, yb] = span(r[1], r[3], dh);
    const cx = (r[0] + r[2] - dw) / 2, cy = (r[1] + r[3] - dh) / 2;
    const steps = (a, b, c, len) => {
      const out = [];
      if (b >= a) for (let v = a; v <= b + 1e-6; v += 0.25) out.push(v); else out.push(Math.min(Math.max(0, c), 100 - len));
      return out.sort((p, q) => Math.abs(p - c) - Math.abs(q - c)).map(v => ({ v }));
    };
    const xs = steps(xa, xb, cx, dw).map(o => ({ v: o.v, cut: [...atX(o.v), ...atX(o.v + dw)] }));
    const ys = steps(ya, yb, cy, dh).map(o => ({ v: o.v, cut: [...atY(o.v), ...atY(o.v + dh)] }));
    let best = null;
    for (const Y of ys) for (const X of xs) {
      const c = X.cut.filter(w => ov(w[1], w[1] + w[3], Y.v, Y.v + dh)).concat(Y.cut.filter(w => ov(w[0], w[0] + w[2], X.v, X.v + dw)));
      const score = c.length * 1000 + Math.abs(X.v - cx) + Math.abs(Y.v - cy);
      if (!best || score < best.score) best = { d: [X.v, Y.v, dw, dh], c, score };
      if (!c.length) return best;
    }
    return best;
  };
  // the largest zoom up to zTop (READ_PX, or what the box allows) whose edges cut no word; else the least cut
  const zs = [];
  for (let z = zTop; z > 1.0001; z /= 1.04) zs.push(z);
  zs.push(1);
  let pick = null;
  for (const z of zs) {
    const p = place(z);
    if (!pick || p.c.length < pick.c.length) pick = { ...p, z };
    if (!p.c.length) break;
  }
  const z = vw / pick.d[2];
  if (z < 1.05 || pick.c.length) return { d: null, z: 1, px: base, fits: zFit * base >= MIN_PX - 0.05, cut: [] }; // no zoom worth the motion
  return { d: pick.d.map(v => Math.round(v * 100) / 100), z, px: z * base, fits: zFit * base >= MIN_PX - 0.05, cut: pick.c };
}

// ------------------------------------------------------------------------------------------------ the page
const r2 = v => Math.round(v * 100) / 100;
/** The region [x, y, w, h] (% of the picture) the frame shows now, read from the picture's own geometry. */
function viewOf(img) {
  if (!img.classList.contains('simg--crop')) return [0, 0, 100, 100];
  const w = parseFloat(img.style.width), h = parseFloat(img.style.height);
  const vw = 10000 / w, vh = 10000 / h;
  return [-parseFloat(img.style.left) * vw / 100, -parseFloat(img.style.top) * vh / 100, vw, vh];
}
const geo = d => ({ width: `${r2(10000 / d[2])}%`, height: `${r2(10000 / d[3])}%`, left: `${r2(-d[0] / d[2] * 100)}%`, top: `${r2(-d[1] / d[3] * 100)}%` });
const boxIn = (d, b) => [(b[0] - d[0]) / d[2] * 100, (b[1] - d[1]) / d[3] * 100, b[2] / d[2] * 100, b[3] / d[3] * 100];
function setBox(el, b) {
  el.style.left = `${r2(b[0])}%`; el.style.top = `${r2(b[1])}%`; el.style.width = `${r2(b[2])}%`; el.style.height = `${r2(b[3])}%`;
  el.style.setProperty('--bx', r2(b[0])); el.style.setProperty('--by', r2(b[1]));
}

export async function init({ figs, placeStep, reduced }) {
  const shots = figs.filter(f => !f.classList.contains('vf') && f.querySelector('.simg') && !f.querySelector('.gf-path'));
  if (!shots.length) return;
  const index = (await import('/js/course-zoom-data.js')).default;
  for (const fig of shots) {
    const img = fig.querySelector('.simg');
    const key = new URL(img.getAttribute('src'), location.href).pathname.replace(/^\/img\//, '').replace(/\.webp$/, '');
    const font = index[key];
    if (!font) continue;
    let words;
    try { words = await (await fetch(`/img/zoom/${key}.json`)).json(); } catch (e) { continue; }
    setup(fig, img, font, words, placeStep, reduced);
  }
}

const badgeGet = b => b.badge && { style: b.badge.getAttribute('style') || '', cls: b.badge.className };
const badgeSet = (b, v) => { if (!b.badge || !v) return; b.badge.setAttribute('style', v.style); b.badge.className = v.cls; };
function setup(fig, img, font, words, placeStep, reduced) {
  const view = viewOf(img);
  const rest = { crop: img.classList.contains('simg--crop'), style: img.getAttribute('style') || '' };
  const boxes = [...fig.querySelectorAll('.gf-step')].map(st => {
    const el = st.querySelector('.gf-box');
    const f = [parseFloat(el.style.left), parseFloat(el.style.top), parseFloat(el.style.width), parseFloat(el.style.height)];
    return { el, badge: el.querySelector('.gf-badge'), rest: el.getAttribute('style'), pic: [view[0] + f[0] * view[2] / 100, view[1] + f[1] * view[3] / 100, f[2] * view[2] / 100, f[3] * view[3] / 100] };
  });
  let zooms = [];
  const show = i => {
    const z = i == null ? null : zooms[i];
    if (!z) {
      if (rest.crop) img.setAttribute('style', rest.style); else { img.classList.remove('simg--crop'); img.setAttribute('style', rest.style); }
      boxes.forEach(b => { b.el.setAttribute('style', b.rest); if (b.badgeRest) badgeSet(b, b.badgeRest); });
      fig.classList.remove('gfz-in');
      return;
    }
    img.classList.add('simg--crop'); Object.assign(img.style, geo(z.d));
    setBox(boxes[i].el, boxIn(z.d, boxes[i].pic));
    fig.classList.add('gfz-in');
  };
  const layout = () => {
    const done = () => requestAnimationFrame(() => fig.classList.remove('gfz-now'));
    const fw = fig.querySelector('.sframe').getBoundingClientRect().width;
    if (!fw) return done();
    const raw = boxes.map(b => zoomFor(view, b.pic, font, words, fw));
    zooms = raw.map(z => (z && z.d ? z : null));
    const on = zooms.some(Boolean);
    fig.classList.toggle('gfz', on);
    fig.gfz = { view, raw, zooms, font, fw, restPx: textPx(font, view[2], fw), boxes };
    if (!on) return done();
    if (reduced) stepButton(fig, boxes.length);
    fig.classList.add('gf--strip'); // the step's words go under the picture while it zooms
    const rb = fig.querySelector('.gf-replay'), strip = fig.querySelector('.gf-strip');
    if (rb && strip) strip.after(rb); // and the Replay button with them, as course.js does for a strip figure
    fig.classList.add('gfz-now'); // lay each step out at its own zoom, without animation
    boxes.forEach(b => { b.badgeRest = badgeGet(b); });
    boxes.forEach((b, i) => { if (!zooms[i]) return; show(i); placeStep(fig, i); b.zoomed = b.el.getAttribute('style'); b.badgeZoom = badgeGet(b); });
    show(null);
    const cur = state();
    if (cur !== null) apply(cur);
    done();
  };
  const apply = i => {
    if (i == null || !zooms[i]) return show(null);
    show(i);
    if (boxes[i].zoomed) boxes[i].el.setAttribute('style', boxes[i].zoomed);
    if (boxes[i].badgeZoom) badgeSet(boxes[i], boxes[i].badgeZoom);
  };
  // data-gfz-pin (tests and capture tools) holds one step's zoom, or 'rest', whatever the tour is doing
  const state = () => { const s = fig.getAttribute('data-gfz-pin') ?? fig.getAttribute('data-gf-step'); return s === null || s === 'rest' ? null : +s; };
  new MutationObserver(() => apply(state())).observe(fig, { attributes: true, attributeFilter: ['data-gf-step', 'data-gfz-pin'] });
  // course.js lays its badges out on the picture at rest: back there at once (no glide), measured, then zoomed again
  fig.addEventListener('gf:prelayout', () => { fig.classList.add('gfz-now'); show(null); });
  fig.addEventListener('gf:layout', layout);
  layout();

}

/** Reduced motion: course.js plays no tour and shows every box at once on the whole picture. A zooming figure
 *  offers its Replay button: a tap steps through the zooms (no animation, ~2.6 s a step) and comes back to rest. */
function stepButton(fig, n) {
  const btn = fig.querySelector('.gf-replay');
  if (!btn || btn.dataset.gfz) return;
  btn.dataset.gfz = '1'; btn.hidden = false;
  let timers = [];
  btn.addEventListener('click', () => {
    timers.forEach(clearTimeout); timers = [];
    btn.hidden = true; // its place is the strip's while a step's words show there
    for (let i = 0; i < n; i++) timers.push(setTimeout(() => fig.setAttribute('data-gf-step', String(i)), i * 2600));
    timers.push(setTimeout(() => { fig.removeAttribute('data-gf-step'); btn.hidden = false; btn.focus({ preventScroll: true }); }, n * 2600));
  });
}
