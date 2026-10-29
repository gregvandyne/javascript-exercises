// World text (floating "+1", signs, bubbles drawn in the world): fillText with the kit font, the player's direction,
// an Ink outline and Cream rim, cached in the atlas per (text, style, size bucket). DOM UI text never comes here.
import { INK, CREAM, outline } from './tokens.js';
import { bucket, UNLIT } from './atlas.js';

/** CSS font stack per script (matches app.css :lang() rules); never forced uppercase, no letter-spacing on ar/he. */
export function fontStack(lang) {
  const base = '"Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const l = String(lang || 'en');
  // The kit face first: its unicode-range is Latin only, so digits, maths and Latin words stay on-brand while
  // the script's own font draws the Hebrew/Arabic/CJK letters.
  const kitFirst = more => base.replace('"Bricolage Grotesque", ', '"Bricolage Grotesque", ' + more + ', ');
  if (l.startsWith('ar')) return kitFirst('"Noto Sans Arabic", Tahoma');
  if (l.startsWith('he')) return kitFirst('Rubik, "Arial Hebrew", Arial');
  if (l.startsWith('ja')) return kitFirst('"Hiragino Maru Gothic ProN", "Noto Sans JP"');
  if (l.startsWith('zh')) return kitFirst('"PingFang TC", "Microsoft JhengHei", "Noto Sans TC"');
  if (l.startsWith('ru')) return 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  return base;
}
/** textSprite(atlas, 'text', {px, weight, color, dir, lang, max, rim}) -> entry id; px = device px cap height bucket. */
export function textSprite(atlas, str, o = {}) {
  const px = bucket(o.px || 24), weight = o.weight || 800, color = o.color || INK, dir = o.dir || 'ltr';
  const key = 'T|' + str + '|' + px + '|' + weight + '|' + color + '|' + dir + '|' + (o.rim === false ? 0 : 1) + '|' + (o.lang || '');
  const have = atlas.get(key); if (have >= 0) return have;
  const font = `${weight} ${px}px ${fontStack(o.lang)}`;
  const m = atlas.doc.createElement('canvas').getContext('2d'); m.font = font;
  let w = Math.ceil(m.measureText(str).width);
  const maxW = o.max ? Math.ceil(o.max) : 0;
  let scale = 1;
  if (maxW && w > maxW) scale = Math.max(0.7, maxW / w);   // auto-fit: shrink to at most 70%, then let it overflow (dev warning)
  if (maxW && w * scale > maxW && typeof console !== 'undefined') console.warn('[oomba] text overflows', str);
  const lw = outline(px * 1.4), rim = o.rim === false ? 0 : Math.max(2, lw * 0.45);
  const pad = Math.ceil(lw + rim + 2);
  const W = Math.ceil(w * scale) + pad * 2, H = Math.ceil(px * 1.35) + pad * 2;
  return atlas.bake(key, W, H, (ctx, k) => {
    ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    try { ctx.direction = dir; } catch (e) { /* older engines */ }
    ctx.translate(W / 2, H / 2); ctx.scale(scale, 1);
    ctx.lineJoin = 'round';
    if (rim) { ctx.strokeStyle = CREAM; ctx.lineWidth = (lw + rim * 2) / scale; ctx.strokeText(str, 0, 0); }
    ctx.strokeStyle = INK; ctx.lineWidth = lw / scale; ctx.strokeText(str, 0, 0);
    ctx.fillStyle = color; ctx.fillText(str, 0, 0);
    const mk = k.mask(); mk.font = font; mk.textBaseline = 'middle'; mk.textAlign = 'center'; mk.translate(W / 2, H / 2); mk.scale(scale, 1);
    mk.strokeStyle = UNLIT; mk.lineWidth = (lw + rim * 2) / scale; mk.lineJoin = 'round'; mk.strokeText(str, 0, 0); mk.fillStyle = UNLIT; mk.fillText(str, 0, 0);
  });
}
