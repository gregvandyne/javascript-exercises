// Manipulatives tool icons drawn in a soft-3D look to sit beside Microsoft's Fluent Emoji 3D set: rounded shapes, a top
// light (each face a gradient from a lighter top to a deeper bottom), a darker "side" under each piece for depth, a
// glossy highlight, and one soft shadow under the whole icon. SVG, 256 grid. Drawn for this mockup.
let gid = 0;
const mix = (hex, to, t) => { const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16); const c = k => Math.round(((a >> k) & 255) * (1 - t) + ((b >> k) & 255) * t); return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`; };
function defsFor(color) {
  const id = `g${gid++}`;
  return { id, defs: `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(color, '#ffffff', 0.38)}"/><stop offset=".55" stop-color="${color}"/><stop offset="1" stop-color="${mix(color, '#000000', 0.18)}"/></linearGradient>`, side: mix(color, '#000000', 0.32) };
}
/** A raised rounded block: its side (depth d below), its face (gradient) and a glossy highlight along the top. */
function block(x, y, w, h, r, color, d = 10) {
  const g = defsFor(color);
  return { defs: g.defs, body: `<rect x="${x}" y="${y + d}" width="${w}" height="${h}" rx="${r}" fill="${g.side}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#${g.id})"/>
    <rect x="${x + Math.min(10, w * 0.12)}" y="${y + 5}" width="${Math.max(0, w - Math.min(20, w * 0.24))}" height="${Math.max(4, Math.min(14, h * 0.18))}" rx="${Math.min(7, h * 0.09)}" fill="#fff" opacity=".45"/>` };
}
function disk(cx, cy, r, color, d = 10) {
  const g = defsFor(color);
  return { defs: g.defs, body: `<circle cx="${cx}" cy="${cy + d}" r="${r}" fill="${g.side}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${g.id})"/><ellipse cx="${cx - r * 0.25}" cy="${cy - r * 0.45}" rx="${r * 0.42}" ry="${r * 0.2}" fill="#fff" opacity=".5"/>` };
}
function poly(points, color, d = 10) {
  const g = defsFor(color), down = points.map(([x, y]) => `${x},${y + d}`).join(' '), up = points.map(([x, y]) => `${x},${y}`).join(' ');
  const ys = points.map(p => p[1]), top = Math.min(...ys), xs = points.map(p => p[0]);
  return { defs: g.defs, body: `<polygon points="${down}" fill="${g.side}" stroke="${g.side}" stroke-width="14" stroke-linejoin="round"/><polygon points="${up}" fill="url(#${g.id})" stroke="url(#${g.id})" stroke-width="14" stroke-linejoin="round"/>
    <polygon points="${up}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="5" stroke-linejoin="round" clip-path="inset(0 0 60% 0)"/>` };
}
const raw = body => ({ defs: '', body });
function icon(parts, { shadow = [128, 228, 92, 12], vb = '14 14 228 228' } = {}) {
  const defs = parts.map(p => p.defs).join(''), id = `b${gid++}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><defs>${defs}<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter></defs>
    <ellipse cx="${shadow[0]}" cy="${shadow[1]}" rx="${shadow[2]}" ry="${shadow[3]}" fill="#000" opacity=".18" filter="url(#${id})"/>${parts.map(p => p.body).join('')}</svg>`;
}
const RED = '#F8312F', ORANGE = '#FF822D', YELLOW = '#FFB02E', GREEN = '#00D26A', BLUE = '#1C5CD7', SKY = '#00A6ED', PURPLE = '#8D65C5', PINK = '#F70A8D', LIGHT = '#E1D8EC', WOOD = '#C88A5C', WHITE = '#F4F0FA';

export const DRAWN = {
  'two-color-counters': icon([disk(150, 124, 62, RED, 12), disk(98, 112, 62, YELLOW, 12), raw('<text x="98" y="128" text-anchor="middle" font-size="46" font-weight="900" fill="#fff" opacity=".9" font-family="system-ui,sans-serif">+</text>')]),
  'linking-cubes': icon([block(26, 98, 66, 66, 12, '#5092FF'), block(38, 80, 42, 20, 7, '#5092FF', 4), block(96, 98, 66, 66, 12, YELLOW), block(108, 80, 42, 20, 7, YELLOW, 4), block(166, 98, 66, 66, 12, RED), block(178, 80, 42, 20, 7, RED, 4)], { shadow: [128, 184, 104, 12], vb: '18 34 220 220' }),
  'color-tiles': icon([block(48, 44, 74, 74, 12, RED), block(134, 44, 74, 74, 12, BLUE), block(48, 130, 74, 74, 12, YELLOW), block(134, 130, 74, 74, 12, GREEN)]),
  'hundred-board': icon([block(36, 36, 184, 184, 22, WHITE, 12), ...[0, 1, 2, 3].flatMap(r => [0, 1, 2, 3].map(c => block(54 + c * 38, 54 + r * 38, 32, 32, 7, (r * 4 + c) % 5 === 0 ? BLUE : LIGHT, 4)))]),
  'base-ten-blocks': icon([block(28, 76, 116, 116, 12, '#5092FF'), raw(`<path d="M67 82v104M106 82v104M34 115h104M34 154h104" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>`), block(160, 52, 36, 140, 10, GREEN), raw('<path d="M166 92h24M166 126h24M166 160h24" stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/>'), block(206, 158, 34, 34, 8, YELLOW)], { shadow: [130, 214, 110, 12] }),
  'place-value-disks': icon([disk(178, 156, 46, SKY), disk(88, 152, 54, PURPLE), disk(140, 82, 50, BLUE), raw('<circle cx="140" cy="82" r="30" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="6"/><circle cx="88" cy="152" r="33" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="6"/>')]),
  'number-rods': icon([block(36, 158, 184, 40, 10, ORANGE), block(36, 106, 124, 40, 10, GREEN), block(36, 54, 64, 40, 10, RED)], { shadow: [128, 216, 100, 12] }),
  'fraction-circles': icon([disk(128, 124, 88, WHITE, 12), raw(`<path d="M128 124V36a88 88 0 0 1 88 88Z" fill="${RED}"/><path d="M128 124V36a88 88 0 0 1 88 88Z" fill="#fff" opacity=".2"/><path d="M128 36v176M40 124h176" stroke="#C3B9D0" stroke-width="5"/>`), raw(`<path d="M134 118V44a80 80 0 0 1 76 74Z" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linejoin="round"/>`)]),
  'fraction-tiles': icon([block(32, 46, 192, 42, 10, LIGHT), block(32, 102, 94, 42, 10, RED), block(130, 102, 94, 42, 10, RED), block(32, 158, 61, 42, 10, ORANGE), block(97, 158, 62, 42, 10, ORANGE), block(163, 158, 61, 42, 10, ORANGE)], { shadow: [128, 220, 100, 12] }),
  'number-lines': icon([block(20, 150, 216, 38, 14, SKY, 9), raw('<path d="M60 152v14M100 152v14M140 152v14M180 152v14" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".8"/>'),
    raw(`<path d="M60 136C70 72 170 72 180 132" fill="none" stroke="${ORANGE}" stroke-width="12" stroke-linecap="round"/><path d="M164 120l16 16 14-20" fill="none" stroke="${ORANGE}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`), disk(60, 140, 18, RED, 5)], { shadow: [128, 206, 108, 10], vb: '14 40 228 228' }),
  'bar-models': icon([block(28, 56, 124, 62, 14, GREEN), block(156, 56, 72, 62, 14, '#9EE6B5'), block(28, 138, 164, 62, 14, '#5092FF')], { shadow: [128, 222, 100, 12] }),
  'algebra-tiles': icon([block(28, 36, 120, 120, 14, '#5092FF'), block(164, 36, 44, 120, 12, GREEN), block(164, 172, 44, 44, 10, YELLOW), block(28, 172, 120, 44, 12, '#FF6D6D')], { shadow: [124, 232, 100, 10] }),
  'xy-coordinate-board': icon([block(36, 36, 184, 184, 22, WHITE, 12), raw('<path d="M64 128h128M128 64v128" stroke="#9A8FB0" stroke-width="5" stroke-dasharray="2 14" stroke-linecap="round"/><path d="M56 176h148M88 208V60" stroke="#6E6585" stroke-width="9" stroke-linecap="round"/><path d="M196 168l12 8-12 8M80 70l8-12 8 12" fill="none" stroke="#6E6585" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>'), disk(166, 98, 18, RED, 5)]),
  geoboard: icon([block(32, 32, 192, 192, 24, WOOD, 14), ...[0, 1, 2].flatMap(r => [0, 1, 2].map(c => disk(72 + c * 56, 72 + r * 56, 9, '#5A3A28', 4))), raw(`<polygon points="72,72 184,72 72,184" fill="${RED}" fill-opacity=".18" stroke="${RED}" stroke-width="10" stroke-linejoin="round"/>`), ...[[72, 72], [184, 72], [72, 184]].map(([x, y]) => disk(x, y, 9, '#5A3A28', 3))]),
  'pattern-blocks': icon([poly([[78, 46], [134, 46], [162, 94], [134, 142], [78, 142], [50, 94]], YELLOW), poly([[166, 104], [214, 186], [118, 186]], GREEN), poly([[40, 166], [100, 166], [86, 196], [54, 196]], RED, 8)], { shadow: [128, 222, 100, 12] }),
};
