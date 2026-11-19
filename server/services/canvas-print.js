// A classroom activity's printed worksheet (Oomba Canvas 1.2.0, config.purpose "worksheet" or "generator"; docs/
// canvas-api.md "Printing"). The same pipeline as The Big Divide's (services/game-print.js, BRB.print): the frame sends
// only numbers ({ k: 'canvas', seed, n, paper, key }), the play page or the Studio asks POST /api/games/:id/print, and
// this makes the printable page from the version's OWN data: the kit's frozen file deals the sheet for that seed
// (sheet.js) and writes each question, answer and worked answer in the viewer's language, and the pinned Oomba Figures
// file draws each figure in black and white. Every word is escaped here; no HTML ever comes from the frame. The sheet
// has a blank name line and nothing about any student. The answer key is a page of its own, for the activity's maker
// and school staff only (the route checks; BRB.canPrintKey tells the kit whether to offer it).
import { canvasVersion, activityData, canvasKit } from './canvaskit.js';
import { figureLibs, figuresKit, FIG_LATEST } from './figlibs.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ge = (v, w) => { const a = v.split('.').map(Number), b = w.split('.').map(Number); return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; };
export const PURPOSE_PRINTS = ['worksheet', 'generator'];

/** A version that prints: an Oomba Canvas 1.2.0 (or later) activity whose purpose includes a worksheet or a question
 *  generator -> { v, data }; else null. */
export function canvasPrintable(html) {
  const v = canvasVersion(html);
  if (!v || ge(v, '1.2.0') < 0) return null;
  const d = activityData(html);
  if (!d || !d.data) return null;
  const pu = d.data.config && Array.isArray(d.data.config.purpose) ? d.data.config.purpose : [];
  return pu.some(x => PURPOSE_PRINTS.includes(x)) ? { v, data: d.data } : null;
}
/** The frame's request -> { ok, doc: { k, seed, n, paper, key } } or { ok: false, code: 'bad' }. Numbers only. */
export function cleanCanvasPrintDoc(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!r || r.k !== 'canvas' || !Number.isInteger(r.seed) || r.seed < 1 || r.seed > 999999 || !Number.isInteger(r.n) || r.n < 1 || r.n > 30) return { ok: false, code: 'bad' };
  if (r.paper !== undefined && r.paper !== 'a4' && r.paper !== 'letter') return { ok: false, code: 'bad' };
  const extra = Object.keys(r).filter(k => !['k', 'seed', 'n', 'paper', 'key'].includes(k));
  if (extra.length) return { ok: false, code: 'bad' };
  return { ok: true, doc: { k: 'canvas', seed: r.seed, n: r.n, paper: r.paper === 'letter' ? 'letter' : 'a4', key: r.key === true } };
}

/** Pieces (strings and { frac: [n, d] }) -> HTML. */
const pcs = list => (Array.isArray(list) ? list : []).map(x => (x && typeof x === 'object' && Array.isArray(x.frac) ? `<span class="ocp-frac" role="img" aria-label="${esc(`${x.frac[0]}/${x.frac[1]}`)}"><span>${esc(x.frac[0])}</span><span>${esc(x.frac[1])}</span></span>` : esc(x))).join('');
const svgBox = (w, h, body, label) => `<svg class="ocp-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;
/** A plain picture of the manipulative (black lines on white): bars, a number line, columns, tiles. */
function picture(pic, F, lang, labelText) {
  if (!pic) return '';
  if (pic.fig) {
    const { kind, hide, ...data } = pic.fig;
    const fig = F ? F.svg(kind, { kind, ...data }, { print: true, lang, hide: hide || false, title: labelText }) : '';
    return `<div class="ocp-fig">${fig}</div>${pic.pic === 'choices' ? choices(pic.choices) : ''}`;
  }
  switch (pic.pic) {
    case 'choices': return choices(pic.choices);
    case 'bars': return svgBox(320, pic.bars.length * 44, pic.bars.map(([n, d], k) => Array.from({ length: d }, (_, i) => `<rect x="${(i * 320) / d + 1}" y="${k * 44 + 4}" width="${320 / d - 2}" height="30" fill="${i < n ? '#bbb' : '#fff'}" stroke="#000" stroke-width="1.5"/>`).join('')).join(''), labelText);
    case 'line': {
      const ticks = (pic.hi - pic.lo) * pic.sub, W = 360, X = t => 14 + (t * (W - 28)) / ticks;
      let b = `<line x1="6" y1="30" x2="${W - 6}" y2="30" stroke="#000" stroke-width="2"/>`;
      for (let t = 0; t <= ticks; t++) { const whole = t % pic.sub === 0; b += `<line x1="${X(t)}" y1="${whole ? 18 : 23}" x2="${X(t)}" y2="${whole ? 42 : 37}" stroke="#000" stroke-width="${whole ? 2 : 1.2}"/>${whole ? `<text x="${X(t)}" y="58" text-anchor="middle" font-size="13">${esc(pic.lo + t / pic.sub)}</text>` : ''}`; }
      return svgBox(W, 66, b, labelText);
    }
    case 'columns': {
      const S = 26, cols = pic.cols + 1, sign = { add: '+', sub: '−', mul: '×' }[pic.op] || '+', W = cols * S + 4;
      const row = (n, y) => String(n).split('').reverse().map((c, i) => `<text x="${(cols - i - 0.5) * S}" y="${y}" text-anchor="middle" font-size="18" font-family="Courier New, monospace" font-weight="700">${c}</text>`).join('');
      const boxes = Array.from({ length: pic.cols }, (_, i) => `<rect x="${(cols - i - 1) * S + 2}" y="${2 * S + 10}" width="${S - 4}" height="${S - 4}" fill="#fff" stroke="#000" stroke-width="1.2"/>`).join('');
      return svgBox(W, 3 * S + 14, `${row(pic.a, S - 6)}${row(pic.b, 2 * S - 6)}<text x="${S / 2}" y="${2 * S - 6}" text-anchor="middle" font-size="18" font-weight="700">${sign}</text><line x1="2" y1="${2 * S + 3}" x2="${W - 2}" y2="${2 * S + 3}" stroke="#000" stroke-width="2"/>${boxes}`, labelText);
    }
    case 'sort': case 'order': return `<p class="ocp-tiles" dir="auto">${pic.items.map(v => `<span class="ocp-tile">${Array.isArray(v) ? pcs([{ frac: v }]) : esc(v)}</span>`).join('')}</p>`;
    default: return '';
  }
}
const choices = list => `<ol class="ocp-choices" type="A">${(list || []).map(c => `<li dir="auto"><span class="ocp-circle" aria-hidden="true"></span>${esc(c)}</li>`).join('')}</ol>`;

/**
 * The printable page (a fragment for the page's print area): the questions on their own page(s), then the answer key
 * on a page of its own when asked. -> HTML, or null when the version does not print.
 */
export function canvasPrintHtml(html, doc, { t, dir = 'ltr', lang = 'en' }) {
  const pr = canvasPrintable(html); if (!pr) return null;
  const kit = canvasKit(pr.v), s = kit.sheet(pr.data, { seed: doc.seed, n: doc.n, lang });
  const F = s.items.some(it => it.picture && it.picture.fig) ? figuresKit(figureLibs(html)['oomba-figures'] || FIG_LATEST['oomba-figures']) : null;
  const title = s.title || t('play.printCanvas.untitled'), code = String(s.seed);
  const head = h1 => `<header class="cwp-head"><h1 dir="auto">${esc(h1)}</h1>${h1 === title ? `<p class="cwp-lines"><span class="cwp-line">${esc(t('play.print.name'))}<i class="cwp-blank cwp-blank-name"></i></span><span class="cwp-line">${esc(t('play.print.date'))}<i class="cwp-blank"></i></span></p>` : ''}</header>`;
  const foot = `<footer class="cwp-foot"><span>${esc(t('play.print.made'))}</span><span class="ocp-code">${esc(t('play.printCanvas.sheet', { code }))}</span></footer>`;
  const answerLine = it => (it.tool === 'figure.number' ? `<p class="ocp-ans"><b>${esc(t('play.printCanvas.answer'))}</b> <i class="cwp-blank"></i>${it.unit ? ` <span dir="auto">${esc(it.unit)}</span>` : ''}</p>`
    : it.tool === 'figure.choice' ? `<p class="ocp-ans ocp-small">${esc(t('play.printCanvas.choose'))}</p>`
      : it.tool.startsWith('digits.') ? '' : `<p class="ocp-ans"><b>${esc(t('play.printCanvas.answer'))}</b> <i class="cwp-blank ocp-wide"></i></p>`);
  const q = it => `<li class="ocp-q" value="${it.n}"><div class="ocp-qtext" dir="auto">${pcs(it.task)}</div>${picture(it.picture, F, lang, t('play.printCanvas.figure', { n: it.n }))}${answerLine(it)}</li>`;
  const wide = s.items.some(it => it.picture && it.picture.fig);
  const sheetPage = `<section class="cwp-page ocp-sheet">${head(title)}${s.say ? `<p class="bbp-how" dir="auto">${esc(s.say)}</p>` : ''}
<ol class="ocp-list ${wide ? 'ocp-one' : 'ocp-two'}">${s.items.map(q).join('')}</ol>${foot}</section>`;
  const keyPage = doc.key ? `<section class="cwp-page cwp-key ocp-key">${head(t('play.print.keyTitle', { title }))}
<ol class="ocp-keylist">${s.items.map(it => `<li value="${it.n}"><b class="ocp-kans" dir="auto">${pcs(it.answer)}</b><ul class="ocp-work">${it.work.map(w => `<li dir="auto">${pcs(w)}</li>`).join('')}</ul></li>`).join('')}</ol>${foot}</section>` : '';
  return `<div class="cwp ocp ocp-${doc.paper === 'letter' ? 'letter' : 'a4'}" lang="${esc(lang)}" dir="${dir === 'rtl' ? 'rtl' : 'ltr'}" data-questions="${s.items.length}" data-answers="${doc.key ? s.items.length : 0}">${sheetPage}${keyPage}</div>`;
}
