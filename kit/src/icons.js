// UI icons (spec §6.3) in the art's own language: a 24-unit grid, chunky round-capped Ink lines (2.5 units, the
// grammar's outline at icon size), and the stickers (rewards, hearts, goals) filled by their colour role with an Ink
// outline, exactly like the art: reward = Spark, danger and lives = Coral, success and goals = Mint. Lines are
// currentColor (Ink by day, Cream on night cards), so glyphs follow the theme; nothing else is coloured.
// Each icon is a list of parts: 'd' a line, '*d' a solid Ink shape, 'role:d' a sticker (role fill + Ink outline).
// Filled / outline pairs: heart / heart-off, spark / spark-off, star / star-off, flag / flag-off.
// As SVG strings, so the DOM UI, the HUD and the Builder preview can inline them. The kit never draws emoji.
import { PALETTE } from './tokens.js';

const C = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const SPARK = 'M12 2.5Q13.4 10.6 21.5 12Q13.4 13.4 12 21.5Q10.6 13.4 2.5 12Q10.6 10.6 12 2.5z';
// the same heart as the prop and particle heart (art.js), fitted to the grid
const HEART = 'M12 20.6C5.2 16.8 3 12.6 3.6 9.2C4.2 5.6 8.6 4.4 12 8.2C15.4 4.4 19.8 5.6 20.4 9.2C21 12.6 18.8 16.8 12 20.6z';
const STAR = 'M12 3l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.4 6.7 19.3l1.1-5.9-4.4-4.1 6-.8z';
const FLAG = 'M6.5 4.5h11l-2.6 4 2.6 4h-11z';
const SPEAKER = '*M3.5 9.5h3.6L12 5.2v13.6l-4.9-4.3H3.5z';
/** Role fills (overridable per use with the CSS variable --ok-fill, e.g. a greyed results slot). */
export const ICON_ROLES = { reward: PALETTE.spark[2], danger: PALETTE.coral[2], success: PALETTE.mint[2], card: PALETTE.cream[0] };
export const ICONS = {
  play: ['*M8 4.8v14.4L19.5 12z'],
  pause: ['M9 5.5v13', 'M15 5.5v13'],
  sound: [SPEAKER, 'M15.5 9.2a4 4 0 0 1 0 5.6', 'M18.2 6.6a7.6 7.6 0 0 1 0 10.8'],
  mute: [SPEAKER, 'M15.8 9.5l5 5', 'M20.8 9.5l-5 5'],
  music: ['M9 17.5V6l10-2v11.5', '*' + C(6.5, 17.5, 2.6), '*' + C(16.5, 15.5, 2.6)],
  settings: [C(12, 12, 3.4), 'M12 2.8v2.8M12 18.4v2.8M2.8 12h2.8M18.4 12h2.8M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2'],
  restart: ['M4.5 12a7.5 7.5 0 1 0 2.4-5.5', 'M4.5 3.5v4.5H9'],
  home: ['card:M3.5 11.5L12 4.5l8.5 7v8.5h-17z', 'M10 20v-5h4v5'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  cross: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  hint: ['card:M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z', 'M9.5 18.5h5', 'M10.5 21h3'],
  lock: ['card:M5.5 11h13v10h-13z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3', 'M12 15v2'],
  unlock: ['card:M5.5 11h13v10h-13z', 'M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2', 'M12 15v2'],
  left: ['M19 12H5', 'M11 6l-6 6 6 6'],
  right: ['M5 12h14', 'M13 6l6 6-6 6'],
  up: ['M12 19V5', 'M6 11l6-6 6 6'],
  down: ['M12 5v14', 'M6 13l6 6 6-6'],
  back: ['M15 5l-7 7 7 7'],
  next: ['M9 5l7 7-7 7'],
  heart: ['danger:' + HEART],
  'heart-off': [HEART],
  spark: ['reward:' + SPARK],
  'spark-off': [SPARK],
  star: ['reward:' + STAR],
  'star-off': [STAR],
  flag: ['M6.5 21V3.5', 'success:' + FLAG],
  'flag-off': ['M6.5 21V3.5', FLAG],
  coin: ['reward:' + C(12, 12, 8.5), 'M12 8v8', 'M9.8 10h3.4a1.4 1.4 0 0 1 0 2.8h-2.4a1.4 1.4 0 0 0 0 2.8h3.4'],
  gem: ['reward:M6.5 4.5h11L21 9.5l-9 10.5L3 9.5z', 'M3 9.5h18', 'M9.5 4.5L12 9.5l2.5-5'],
  trophy: ['reward:M7.5 4h9v5a4.5 4.5 0 0 1-9 0z', 'M7.5 6H4.5a3 3 0 0 0 3.2 4', 'M16.5 6h3a3 3 0 0 1-3.2 4', 'M12 13.5v3.5', 'M8 21h8', 'M9 17h6'],
  key: ['reward:' + C(8, 12, 4.2), 'M12.2 12H21', 'M18 12v3', 'M21 12v2.5'],
  timer: ['card:' + C(12, 13.5, 7.8), 'M12 9.5v4l2.5 2', 'M10 2.5h4'],
  clock: ['card:' + C(12, 12, 9), 'M12 7v5l3.5 2'],
  move: ['M12 3v18', 'M3 12h18', 'M9 6l3-3 3 3', 'M9 18l3 3 3-3', 'M6 9l-3 3 3 3', 'M18 9l3 3-3 3'],
  jump: ['M12 16V4', 'M7 9l5-5 5 5', 'M5 20.5h14'],
  tap: ['*' + C(12, 12, 3), C(12, 12, 7.5)],
  drag: ['*' + C(6, 12, 2.6), 'M10.5 12h9', 'M16 8.5l3.5 3.5-3.5 3.5'],
  info: ['card:' + C(12, 12, 9), 'M12 11v6', 'M12 7.5v.2'],
  question: ['card:' + C(12, 12, 9), 'M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.7v.6', 'M12 17v.2'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  speak: ['card:M4 5h16v11H10l-5 4v-4H4z', 'M8 10.5h8'],
  captions: ['card:M3 6h18v12H3z', 'M6.5 12h4', 'M13 12h4.5', 'M6.5 15h7'],
  contrast: [C(12, 12, 9), '*M12 3a9 9 0 0 1 0 18z'],
  swap: ['M7 7.5h13', 'M16 3.5l4 4-4 4', 'M17 16.5H4', 'M8 12.5l-4 4 4 4'],
  eye: ['card:M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', '*' + C(12, 12, 3.2)],
  book: ['card:M3.5 5h6a2.5 2.5 0 0 1 2.5 2.5V20a2 2 0 0 0-2-2H3.5z', 'card:M20.5 5h-6A2.5 2.5 0 0 0 12 7.5V20a2 2 0 0 1 2-2h6.5z'],
  pencil: ['card:M4 20l1-5L16 4l4 4L9 19z', 'M13.5 6.5l4 4'],
  gamepad: ['card:M7 8h10a4.5 4.5 0 0 1 0 9c-1.2 0-2-.6-2.6-1.5h-4.8C9 16.4 8.2 17 7 17a4.5 4.5 0 0 1 0-9z', 'M7.5 10.8v3.4', 'M5.8 12.5h3.4', 'M15.8 11.6v.1', 'M17.8 13.4v.1'],
  fullscreen: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  user: ['card:' + C(12, 8, 4), 'M4.5 21a7.5 7.5 0 0 1 15 0'],
  quit: ['M10 4H5v16h5', 'M14 8l4 4-4 4', 'M18 12H9'],
};
export const ICON_NAMES = Object.keys(ICONS);
/** icon('pause', {size, label, stroke}) -> an SVG string (aria-hidden unless a label is given). */
export function icon(name, o = {}) {
  const parts = ICONS[name] || ICONS.question;
  const size = o.size || 24, sw = o.stroke || 2.5;
  const body = parts.map(d => {
    if (d[0] === '*') return `<path d="${d.slice(1)}" fill="currentColor"/>`;
    const m = /^(reward|danger|success|card):/.exec(d);
    if (m) return `<path class="ok-i-${m[1]}" d="${d.slice(m[0].length)}" fill="var(${m[1] === 'card' ? '--ok-icon-card' : '--ok-fill'},${ICON_ROLES[m[1]]})"/>`;
    return `<path d="${d}"/>`;
  }).join('');
  const a11y = o.label ? ` role="img" aria-label="${String(o.label).replace(/[<>&"]/g, '')}"` : ' aria-hidden="true"';
  return `<svg class="ok-i" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" focusable="false"${a11y}>${body}</svg>`;
}
