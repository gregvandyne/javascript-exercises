// The book maker's picture drawer (docs/storybook-builder.md "Illustrations"): a page's picture spec -> one SVG, drawn
// from the 2D art packs the games already use (public/vendor/art2d: a world's sky, far and near scenery, ground and
// props; the heroes' and animals' sprite sheets, first idle frame). Pure (no DOM): the server draws the reader's and the
// print view's pictures with it, the book editor redraws as the teacher changes a picture. The catalog (what each world
// and character file holds) comes from services/storybook-illustrator.js catalog().
//
// The same spec always gives the same picture: a page's scenery slice comes from a hash of its page id and world, so a
// world looks the same on every page that uses it, and a character is always the same sprite (the cast's art).
//
// While Oomba is still painting a page's picture (the picture model, services/storybook-draw.js), no art-pack drawing is
// shown for it: paintingHtml is the calm "Oomba is painting this picture" panel in its place (docs/decisions.md "Book
// pictures: a painting placeholder, never the art pack while painting").
import { iconHtml } from './icons.js';

export const W = 800, H = 450, GROUND = 352;
const SPOT = { left: 0.24, center: 0.5, right: 0.76 };
const K = 0.82;   // sprite pixels -> picture pixels (every sprite sheet is drawn at one scale, so sizes stay true)
const MOOD = {
  bright: null,
  warm: { fill: '#FFB347', op: 0.16 },
  dusk: { grad: ['#5B3D8F', '#FF8A5C'], op: 0.32 },
  night: { fill: '#14204A', op: 0.5, stars: true },
  gloomy: { fill: '#5E6670', op: 0.34 },
  magic: { grad: ['#B77CF2', '#FFD23F'], op: 0.2, sparkles: true },
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n1 = v => Math.round(v * 10) / 10;
/** A small stable number from a string (FNV-1a). */
export function hashOf(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }

/** Part of a picture file (an atlas cell or a sprite frame) at x, y, w, h, optionally mirrored. */
function crop(href, img, r, x, y, w, h, flip = false) {
  const inner = `<svg x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" viewBox="${r.join(' ')}" preserveAspectRatio="none" overflow="hidden"><image href="${esc(href)}" width="${img.w}" height="${img.h}"/></svg>`;
  return flip ? `<g transform="translate(${n1(2 * x + w)} 0) scale(-1 1)">${inner}</g>` : inner;
}

/**
 * A page's picture. spec: { world, mood, chars: [{ name, pos, flip }], props: [name] }; cast: [{ name, art }];
 * cat: the catalog; o: { key (makes the scenery slice and the SVG ids), label (alt text: the SVG is an img with it),
 * decorative (aria-hidden) }. An unknown world draws a plain sky and ground. -> '<svg ...>'
 */
export function pictureSvg(spec, cast, cat, o = {}) {
  const key = String(o.key || 'pic');
  const id = `sbp${hashOf(`${key}:${JSON.stringify(spec)}`).toString(36)}`;
  const w = (cat && cat.worlds && cat.worlds[spec && spec.world]) || null;
  const parts = [];
  const sky = w ? w.sky : ['#8EC9F2', '#D7EEFF', '#FFF6DA'];
  parts.push(`<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${esc(sky[0])}"/><stop offset=".62" stop-color="${esc(sky[1])}"/><stop offset="1" stop-color="${esc(sky[2])}"/></linearGradient></defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#${id}s)"/>`);
  const seed = hashOf(`${key}:${spec && spec.world}`);
  if (w) {
    // far hills, then the nearer scenery: a slice of each strip, the same slice for the same page
    if (w.far) {
      const s = 1.0, fw = w.far.w * s, fh = w.far.h * s, x0 = -((seed % 97) / 97) * (fw - W) * 0.5;
      const y = GROUND - fh + (w.far.base + 30) * s;
      parts.push(`<image href="${esc(w.base + w.far.image)}" x="${n1(x0)}" y="${n1(y)}" width="${n1(fw)}" height="${n1(fh)}" preserveAspectRatio="none"/>`);
      if (x0 + fw < W) parts.push(`<image href="${esc(w.base + w.far.image)}" x="${n1(x0 + fw - 1)}" y="${n1(y)}" width="${n1(fw)}" height="${n1(fh)}" preserveAspectRatio="none"/>`);
    }
    if (w.mid) {
      const s = 0.82, mw = w.mid.w * s, mh = w.mid.h * s, x0 = -(((seed >>> 8) % 89) / 89) * (mw - W);
      parts.push(`<image href="${esc(w.base + w.mid.image)}" x="${n1(x0)}" y="${n1(GROUND - (w.mid.h - w.mid.base) * s)}" width="${n1(mw)}" height="${n1(mh)}" preserveAspectRatio="none"/>`);
    }
  }
  // the ground: the world's strip along the top edge, its fill below
  const fill = w ? w.ground.fill : '#9BC77A';
  parts.push(`<rect x="0" y="${GROUND}" width="${W}" height="${H - GROUND}" fill="${esc(fill)}"/>`);
  if (w && w.ground && !w.ground.open) {
    const g = w.ground, s = 0.9, tw = g.w * s, th = g.h * s;
    for (let x = 0; x < W; x += tw - 1) parts.push(`<image href="${esc(w.base + g.image)}" x="${n1(x)}" y="${n1(GROUND - g.over * s)}" width="${n1(tw)}" height="${n1(th)}" preserveAspectRatio="none"/>`);
  }
  // props: at the back, away from where the characters stand
  const props = (spec && Array.isArray(spec.props) ? spec.props : []).filter(p => w && w.props.items[p]).slice(0, 3);
  const propX = [0.08, 0.92, 0.62];
  props.forEach((p, i) => {
    const it = w.props.items[p], cell = 62, hgt = Math.min(270, it.size * cell), wid = hgt * it.r[2] / it.r[3];
    const x = W * propX[i] - wid * it.ax, y = GROUND + 8 - hgt * it.ay;
    parts.push(crop(w.base + w.props.image, w.props, it.r, x, y, wid, hgt, i === 1));
  });
  // the characters, standing on the ground (sea animals swim a little above it), with a soft shadow
  const chars = spec && Array.isArray(spec.chars) ? spec.chars : [];
  for (const c of chars.slice(0, 3)) {
    const who = (cast || []).find(x => x.name === c.name); const sp = who && cat && cat.chars ? cat.chars[who.art] : null;
    if (!sp) continue;
    const k = sp.kind === 'hero' ? K * 1.2 : K;   // heroes are drawn smaller in their sheets than the animals
    let wid = sp.fw * k, hgt = sp.fh * k;
    const big = Math.max(wid / 300, hgt / 230); if (big > 1) { wid /= big; hgt /= big; }
    const cx = W * (SPOT[c.pos] || 0.5), swim = sp.group === 'sea' ? 70 : 0, foot = GROUND + 30 - swim;
    // face the middle of the picture unless the spec says otherwise
    const flip = c.flip === true ? true : c.pos === 'right';
    if (!swim) parts.push(`<ellipse cx="${n1(cx)}" cy="${foot - 2}" rx="${n1(wid * 0.32)}" ry="9" fill="#141414" opacity=".16"/>`);
    parts.push(crop(sp.src, { w: sp.fw * sp.cols, h: sp.fh * sp.rows }, [0, 0, sp.fw, sp.fh], cx - wid * (flip ? 1 - sp.ax : sp.ax), foot - hgt * sp.ay, wid, hgt, flip));
  }
  // the mood: a light wash over everything
  const m = MOOD[spec && spec.mood] || null;
  if (m) {
    if (m.grad) parts.push(`<defs><linearGradient id="${id}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m.grad[0]}"/><stop offset="1" stop-color="${m.grad[1]}"/></linearGradient></defs>`);
    parts.push(`<rect width="${W}" height="${H}" fill="${m.grad ? `url(#${id}m)` : m.fill}" opacity="${m.op}"/>`);
    if (m.stars || m.sparkles) {
      for (let i = 0; i < 14; i++) {
        const h = hashOf(`${key}:star:${i}`), x = h % W, y = (h >>> 10) % (m.stars ? 170 : 300) + 12, r = 1.5 + ((h >>> 20) % 3);
        parts.push(m.stars ? `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFFDF2" opacity=".85"/>` : `<path d="M${x} ${y - r * 2}L${x + r * 0.6} ${y}L${x} ${y + r * 2}L${x - r * 0.6} ${y}Z" fill="#FFFDF2" opacity=".8"/>`);
      }
    }
  }
  const a11y = o.decorative ? 'aria-hidden="true" focusable="false"' : `role="img" aria-label="${esc(o.label || '')}"`;
  return `<svg class="sb-art" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${a11y} xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

/**
 * The placeholder for a picture Oomba is still painting (queued or drawing, nothing painted before): a soft paper panel
 * with a gentle shimmer (none with reduced motion), a small brush and the words. text: the translated "Oomba is painting
 * this picture"; o.decorative: hidden from screen readers (thumbnails, card covers). -> '<div class="sb-painting" ...>'
 */
export function paintingHtml(text, o = {}) {
  const a11y = o.decorative ? 'aria-hidden="true"' : `role="img" aria-label="${esc(text)}"`;
  return `<div class="sb-art sb-painting" data-painting="1" ${a11y}><span class="sb-painting-in">${iconHtml('🖌️', { size: 28 })}<span class="sb-painting-t">${esc(text)}</span></span></div>`;
}
