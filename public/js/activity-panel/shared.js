// The Activity panel's shared parts: the words (js.activityPanel.*), the kit and Oomba Figures loaded into this page
// for the panel's own checks and thumbnails (the same frozen files the activity uses), and a problem's short line.
import { t, esc } from '/js/app.js';

export const P = (k, vars) => t(`js.activityPanel.${k}`, vars);
export const E = (k, vars) => esc(P(k, vars));
export const clone = v => JSON.parse(JSON.stringify(v));

const loaded = new Map();
/** Load a site script once (the kit and Oomba Figures: plain scripts that set a global). */
export function loadScript(src) {
  if (!src) return Promise.resolve();
  if (!loaded.has(src)) loaded.set(src, new Promise(res => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = res; document.head.append(s); }));
  return loaded.get(src);
}
export const kit = () => window.OombaCanvas || null;
export const figures = () => window.OombaFigures || null;

/** The kinds of problem, by the kit's tool: an icon and its name in the panel. */
const KINDS = { fractions: '🟩', numberline: '📏', digits: '🔢', tiles: '🧩', figure: '📐' };
export const kindIcon = p => (p.fig && p.fig.kind === 'reading' ? ({ thermometer: '🌡️', cylinder: '🧪', spring: '⚖️' }[p.fig.type] || '📐') : KINDS[String(p.tool).split('.')[0]] || '🧮');
export const kindName = p => (p.fig && p.fig.kind === 'reading' ? `${P('kind.reading')} · ${P(`kind.${p.fig.type}`)}` : P(`kind.${String(p.tool).replace('.', '_')}`));

/** A value as the teacher reads and types it: 3, 1.5 or 3/4. */
export const valText = v => (Array.isArray(v) ? `${v[0]}/${v[1]}` : v === undefined || v === null ? '' : String(v));
/** What the teacher typed -> a number or [n, d] (null if it is neither). */
export function valParse(s) {
  const x = String(s).trim().replace(',', '.'); let m;
  if ((m = /^(-?\d+)\s*\/\s*(\d+)$/.exec(x))) return [+m[1], +m[2]];
  return x !== '' && Number.isFinite(+x) ? +x : null;
}

/** The kit's own words for a problem's line, in the panel's language (the kit's table: canvas/src/words.js). */
function kitLine(k, v) {
  const K = kit(); if (!K) return '';
  const lang = document.documentElement.lang || 'en', W = K.words[lang] || K.words[lang.split('-')[0]] || K.words.en;
  return String(W[k] || K.words.en[k] || '').replace(/\{(\w+)\}/g, (m, n) => (v[n] === undefined ? m : valText(v[n])));
}
/** A problem's line: its question (a figure) or the kit's line for it. */
export function lineOf(p) {
  if (typeof p.q === 'string' && p.q) return p.q;
  const K = kit(), T = K && K.logic.TOOLS[p.tool];
  if (!T) return p.tool;
  try { const c = K.logic.cleanProblem(p); const x = T.task(c.p || p); return x.text !== undefined ? x.text : kitLine(x.k, x.v || {}); } catch { return p.tool; }
}
/** The kit's own check of one problem -> null (it checks out) or why not (the kit says why in English). */
export function checkOne(p) {
  const K = kit(); if (!K) return null;
  const r = K.selfTest({ problems: [p] });
  return r.ok ? null : String((r.problems[0] || {}).why || '');
}
/** A small drawing of the figure (Oomba Figures), or the kind's icon. */
export function thumb(p) {
  const box = document.createElement('span'); box.className = 'ap-thumb'; box.setAttribute('aria-hidden', 'true');
  const F = figures();
  if (p.fig && F && typeof F.draw === 'function') {
    try { const { kind, hide, ...data } = p.fig; const svg = F.draw(kind, { kind, ...data }, { hide: hide || false }); if (svg) { box.append(svg); return box; } } catch { /* the icon */ }
  }
  box.textContent = kindIcon(p); box.classList.add('ap-ico');
  return box;
}
