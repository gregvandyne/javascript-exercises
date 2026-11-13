// The small drawing kit the course diagrams share (views/nq-diagrams.js and views/nq-diagrams-pro.js): the colour
// tokens, a text line, an arrowhead and the text metrics, all in the 100 x 56.25 space of a slide's drawing.
export const INK = '#141414', LEAF = '#1F9D63', GROUND = '#FFFDF2', LINE = '#C9C2A6';
export const TONES = ['#66C792', '#FFD23F', '#8FC1F5', '#F2A65A'];
export const r2 = v => Math.round(v * 100) / 100;
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A text line; `halo` paints a ground-coloured outline under the letters where they sit on lines. */
export const tx = (x, y, str, size, anchor = 'middle', weight = 700, fill = INK, halo = false) =>
  `<text x="${r2(x)}" y="${r2(y)}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}" fill="${fill}"${halo ? ` stroke="${GROUND}" stroke-width="1.1" paint-order="stroke" stroke-linejoin="round"` : ''}>${esc(str)}</text>`;
export const tTop = (y, size) => y - 0.84 * size, tBot = (y, size) => y + 0.28 * size;
/** A caption's size: the standard 3.8, smaller only for a long one (the labelFs rule in courses.js). */
export const capFs = s => Math.min(3.8, 168 / String(s).length);
/** An arrowhead at (x, y) pointing along (dx, dy). */
export const head = (x, y, dx, dy, fill = INK, k = 2.2) => {
  const l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
  return `<path d="M${r2(x)} ${r2(y)} L${r2(x - ux * k - uy * k * 0.55)} ${r2(y - uy * k + ux * k * 0.55)} L${r2(x - ux * k + uy * k * 0.55)} ${r2(y - uy * k - ux * k * 0.55)} Z" fill="${fill}"/>`;
};
