// Colour contrast of the design tokens: every text/background pair the CSS uses, in the light and the dark palette,
// read straight from public/css/app.css. WCAG AA: 4.5:1 for text, 3:1 for large text and the edges of controls.
//   node scripts/contrast.js        prints the table, exits 1 if a pair fails
// tests/unit/theme.test.js runs the same check.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT = 4.5, UI = 3;
// [foreground, [backgrounds], minimum, what it is]
export const PAIRS = [
  ['--text', ['--bg', '--card', '--card-2', '--bar', '--hover', '--accent-soft', '--ok-bg', '--warn-bg', '--spark-soft', '--bad-bg'], TEXT, 'body text'],
  ['--text-2', ['--bg', '--card', '--card-2', '--bar', '--hover', '--accent-soft'], TEXT, 'secondary text'],
  ['--muted', ['--bg', '--card', '--card-2', '--bar', '--hover', '--accent-soft'], TEXT, 'hints, captions'],
  ['--link', ['--bg', '--card', '--card-2', '--bar', '--hover', '--accent-soft', '--ok-bg', '--warn-bg', '--bad-bg', '--spark-soft'], TEXT, 'links, accent text (also inside notices)'],
  ['--on-accent', ['--accent', '--accent-hover', '--spark', '--spark-hover'], TEXT, 'primary buttons, badges'],
  ['--on-current', ['--current'], TEXT, 'current nav item, pressed chips'],
  ['--accent-ink', ['--accent-soft'], TEXT, 'tags'],
  ['--ok', ['--bg', '--card', '--card-2', '--ok-bg'], TEXT, 'success text'],
  ['--danger', ['--bg', '--card', '--card-2', '--hover', '--bad-bg'], TEXT, 'errors, danger buttons'],
  ['--on-danger', ['--danger'], TEXT, 'error toast'],
  ['--warn-ink', ['--warn-bg', '--card', '--card-2'], TEXT, 'amber chip, flagged scan'],
  ['--bad-ink', ['--bad-bg'], TEXT, 'red chip'],
  ['--bg', ['--text'], TEXT, 'toast'],
  ['--brand-cream', ['--brand-ink'], TEXT, 'play bar'],
  ['--brand-mint', ['--brand-ink'], TEXT, 'play bar live count'],
  ['--brand-ink', ['--brand-mint'], TEXT, 'Build hero'],
  ['--edge', ['--bg', '--card', '--card-2'], UI, 'field edges'],
  ['--focus', ['--bg', '--card', '--card-2', '--bar'], UI, 'focus ring'],
  ['--accent-line', ['--bg', '--card', '--card-2'], UI, 'selected edges, tab underline, progress'],
  ['--viz-1', ['--card'], UI, 'chart bars'],
  ['--logo-sub', ['--bar'], UI, 'ACADEMY under the logo (logo text: no minimum, kept large-text safe)'],
];

const css = () => fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function blockAfter(src, opener) {
  const i = src.indexOf(opener); if (i < 0) return null;
  let depth = 1, j = i + opener.length;
  for (; j < src.length && depth; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; }
  return src.slice(i + opener.length, j - 1);
}
const props = body => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
/** { light: {token: value}, dark: {token: value} } with the dark palette laid over the light one. */
export function palettes(src = css()) {
  const light = props(blockAfter(src, '\n:root{'));
  const dark = { ...light, ...props(blockAfter(src, '@media screen{:root[data-theme="dark"]{')) };
  return { light, dark };
}
function parse(v, tokens, seen = new Set()) {
  v = v.trim();
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) { if (seen.has(ref[1])) throw new Error(`loop at ${ref[1]}`); seen.add(ref[1]); return parse(tokens[ref[1]], tokens, seen); }
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) { const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1]; return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
  const mix = v.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(.+)\)$/);
  if (mix) { const a = parse(mix[1], tokens, seen), b = parse(mix[3], tokens, seen), p = +mix[2] / 100; return a.map((x, i) => Math.round(x * p + b[i] * (1 - p))); }
  throw new Error(`can't read colour "${v}"`);
}
const lum = rgb => { const [r, g, b] = rgb.map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hexOf = rgb => '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();

/** Every pair in both palettes: [{ theme, fg, bg, fgHex, bgHex, ratio, min, ok, what }] */
export function check(src) {
  const rows = [];
  for (const [theme, tokens] of Object.entries(palettes(src))) {
    for (const [fg, bgs, min, what] of PAIRS) for (const bg of bgs) {
      const f = parse(`var(${fg})`, tokens), b = parse(`var(${bg})`, tokens), r = ratio(f, b);
      rows.push({ theme, fg, bg, fgHex: hexOf(f), bgHex: hexOf(b), ratio: Math.floor(r * 100) / 100, min, ok: r >= min, what });
    }
  }
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = check();
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('theme', 6)}${pad('text / edge', 15)}${pad('on', 14)}${pad('colours', 20)}${pad('ratio', 8)}${pad('needs', 7)}`);
  for (const r of rows) console.log(`${pad(r.theme, 6)}${pad(r.fg, 15)}${pad(r.bg, 14)}${pad(`${r.fgHex} ${r.bgHex}`, 20)}${pad(r.ratio.toFixed(2), 8)}${pad(r.min, 7)}${r.ok ? 'ok' : 'FAIL'}  ${r.what}`);
  const bad = rows.filter(r => !r.ok);
  console.log(bad.length ? `\n${bad.length} pair(s) fail.` : `\nAll ${rows.length} pairs pass.`);
  process.exit(bad.length ? 1 : 0);
}
