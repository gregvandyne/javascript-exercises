// Oomba Figures: what the 1.7.0 physics kinds share (circular motion, fields, the lever, torque, the pendulum, the
// spring and the roller coaster): their few default words in every site language, a hatched ceiling, floor or wall,
// a dimension line with its words, a block and a ball, a dashed motion arrow, and the checks every one of them makes.
// Oomba's own code (the source's support and label helpers are not ported: these are drawn the Oomba way).
import { node, label, line, arrow, fmt, isNum } from './svg.js';
import { figWords } from './words.js';

/** The words these figures write when the data gives none (titles and the lever's part names), by site language. */
export const MECH_WORDS = {
  en: { circularMotion: 'Circular motion', fields: 'Field lines', lever: 'Lever', torque: 'Torque', pendulum: 'Pendulum', spring: 'Spring', rollerCoaster: 'Roller coaster', effort: 'Effort', load: 'Load', fulcrum: 'Fulcrum' },
  es: { circularMotion: 'Movimiento circular', fields: 'Líneas de campo', lever: 'Palanca', torque: 'Momento de fuerza', pendulum: 'Péndulo', spring: 'Resorte', rollerCoaster: 'Montaña rusa', effort: 'Potencia', load: 'Resistencia', fulcrum: 'Punto de apoyo' },
  fr: { circularMotion: 'Mouvement circulaire', fields: 'Lignes de champ', lever: 'Levier', torque: 'Moment de force', pendulum: 'Pendule', spring: 'Ressort', rollerCoaster: 'Montagnes russes', effort: 'Force motrice', load: 'Charge', fulcrum: "Point d'appui" },
  de: { circularMotion: 'Kreisbewegung', fields: 'Feldlinien', lever: 'Hebel', torque: 'Drehmoment', pendulum: 'Pendel', spring: 'Feder', rollerCoaster: 'Achterbahn', effort: 'Kraft', load: 'Last', fulcrum: 'Drehpunkt' },
  it: { circularMotion: 'Moto circolare', fields: 'Linee di campo', lever: 'Leva', torque: 'Momento torcente', pendulum: 'Pendolo', spring: 'Molla', rollerCoaster: 'Montagne russe', effort: 'Potenza', load: 'Resistenza', fulcrum: 'Fulcro' },
  pt: { circularMotion: 'Movimento circular', fields: 'Linhas de campo', lever: 'Alavanca', torque: 'Torque', pendulum: 'Pêndulo', spring: 'Mola', rollerCoaster: 'Montanha-russa', effort: 'Potência', load: 'Resistência', fulcrum: 'Fulcro' },
  nl: { circularMotion: 'Cirkelbeweging', fields: 'Veldlijnen', lever: 'Hefboom', torque: 'Moment', pendulum: 'Slinger', spring: 'Veer', rollerCoaster: 'Achtbaan', effort: 'Kracht', load: 'Last', fulcrum: 'Draaipunt' },
  ru: { circularMotion: 'Движение по окружности', fields: 'Силовые линии', lever: 'Рычаг', torque: 'Момент силы', pendulum: 'Маятник', spring: 'Пружина', rollerCoaster: 'Американские горки', effort: 'Сила', load: 'Груз', fulcrum: 'Точка опоры' },
  ja: { circularMotion: '円運動', fields: '力線', lever: 'てこ', torque: '力のモーメント', pendulum: '振り子', spring: 'ばね', rollerCoaster: 'ジェットコースター', effort: '力点', load: '作用点', fulcrum: '支点' },
  'zh-Hant': { circularMotion: '圓周運動', fields: '場線', lever: '槓桿', torque: '力矩', pendulum: '單擺', spring: '彈簧', rollerCoaster: '雲霄飛車', effort: '施力', load: '抗力', fulcrum: '支點' },
  ar: { circularMotion: 'الحركة الدائرية', fields: 'خطوط المجال', lever: 'الرافعة', torque: 'عزم الدوران', pendulum: 'البندول', spring: 'النابض', rollerCoaster: 'قطار الملاهي', effort: 'القوة', load: 'المقاومة', fulcrum: 'نقطة الارتكاز' },
  he: { circularMotion: 'תנועה מעגלית', fields: 'קווי שדה', lever: 'מנוף', torque: 'מומנט כוח', pendulum: 'מטוטלת', spring: 'קפיץ', rollerCoaster: 'רכבת הרים', effort: 'כוח', load: 'משא', fulcrum: 'נקודת משען' },
};
/** The words for a site language: the language, its base, then English, then the core's words. */
export function mechWords(lang) {
  const l = String(lang || 'en'), base = MECH_WORDS[l] || MECH_WORDS[l.split('-')[0]] || {}, core = figWords(lang);
  return k => (base[k] != null ? base[k] : MECH_WORDS.en[k] != null ? MECH_WORDS.en[k] : core(k));
}

/** A data key check: the keys this kind takes, true/false switches, and choices from a list. */
export function keysCheck(d, keys, what) { return Object.keys(d).filter(k => !keys.includes(k)).map(k => `"${k}" is not used by ${what}`); }
export function boolCheck(d, names) { return names.filter(k => d[k] !== undefined && typeof d[k] !== 'boolean').map(k => `"${k}" must be true or false`); }
export function oneOf(d, k, list) { return d[k] === undefined || list.includes(d[k]) ? [] : [`"${k}" must be ${list.map(x => JSON.stringify(x)).join(', ')}`]; }
export function numCheck(d, k, lo, hi, what) { return d[k] === undefined || isNum(d[k], lo, hi) ? [] : [`"${k}" must be ${what}, ${lo} to ${hi}`]; }
/** A short label of the teacher's (a string or a number), or the fallback. */
export const lbl = (v, fallback, n = 24) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : typeof v === 'number' && Number.isFinite(v) ? String(v) : fallback);
/** A value with its unit, in the reader's number format: "2.5 m". */
export const withUnit = (v, unit, lang, dp = 2) => `${fmt(v, dp, lang)}${unit ? ` ${unit}` : ''}`;

/** A hatched surface from (x1, y) to (x2, y): hatches above it (a ceiling) or below (a floor). */
export function hatched(x1, x2, y, P, below = false) {
  const kids = [line(x1, y, x2, y, P.ink, 2.5)];
  for (let x = x1 + 4; x < x2 - 2; x += 13) kids.push(below ? line(x + 7, y, x, y + 9, P.ink, 1.3) : line(x, y, x + 8, y - 10, P.ink, 1.3));
  return node('g', { class: 'of-support' }, kids);
}
/** A hatched upright wall at x from y1 to y2, its hatches on the left (or right) side. */
export function wallAt(x, y1, y2, P, side = -1) {
  const kids = [line(x, y1, x, y2, P.ink, 2.5)];
  for (let y = y1 + 4; y < y2 - 2; y += 13) kids.push(line(x, y, x + side * 9, y + 7, P.ink, 1.3));
  return node('g', { class: 'of-support' }, kids);
}
/** A dimension line from one point to another with arrowheads at both ends and its words beside its middle. */
export function dimension(x1, y1, x2, y2, words, P, o = {}) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, horiz = Math.abs(y1 - y2) < Math.abs(x1 - x2), len = Math.hypot(x2 - x1, y2 - y1);
  const kids = len >= 16 ? [arrow(mx, my, x1, y1, { colour: P.ink, width: 1.4, head: 7 }), arrow(mx, my, x2, y2, { colour: P.ink, width: 1.4, head: 7 })] : [line(x1, y1, x2, y2, P.ink, 1.4)];
  const side = o.side || 1, off = o.off ?? 12;
  if (words) kids.push(label(horiz ? mx : mx + side * off, horiz ? my + side * (off + 2) : my, words, { anchor: horiz ? 'middle' : side > 0 ? 'start' : 'end', size: o.size || 14, colour: P.ink, halo: P.paper, italic: !!o.italic, cls: 'of-mark' }));
  return node('g', { class: 'of-dim' }, kids);
}
/** A block (its bottom middle at x, y) with its words inside. */
export function block(x, y, w, h, words, P, o = {}) {
  return node('g', { class: 'of-object', transform: o.turn ? `rotate(${o.turn} ${x} ${y})` : null },
    node('rect', { x: x - w / 2, y: y - h, width: w, height: h, rx: 3, fill: o.fill || P.soft, stroke: P.ink, 'stroke-width': 2 }),
    words ? label(x, y - h / 2, words, { anchor: 'middle', size: o.size || 14, italic: !!o.italic, colour: P.ink }) : null);
}
/** A ball centered at x, y. */
export const ball = (x, y, r, P, o = {}) => node('circle', { cx: x, cy: y, r, fill: o.fill || P.soft, stroke: P.ink, 'stroke-width': 2, 'stroke-dasharray': o.dash || null, opacity: o.opacity || null, class: 'of-object' });
/** A motion arrow (velocity, acceleration): dashed, the way these diagrams tell motion from force. */
export const motion = (x1, y1, x2, y2, c) => arrow(x1, y1, x2, y2, { colour: c, width: 2.6, head: 11, dash: '7 5' });
/** A force arrow: solid. */
export const force = (x1, y1, x2, y2, c) => arrow(x1, y1, x2, y2, { colour: c, width: 3, head: 12 });
/** A compass word for a direction on the page (degrees counterclockwise from the right), or '' between them. */
export function compass(deg) {
  const a = ((deg % 360) + 360) % 360;
  for (const [w, c] of [['right', 0], ['up', 90], ['left', 180], ['down', 270], ['right', 360]]) if (Math.abs(a - c) < 1e-6) return w;
  return '';
}
