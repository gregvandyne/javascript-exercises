// Oomba Figures: waves (the physics pack, 1.1.0). A transverse wave on numbered axes (displacement against distance, to
// read its wavelength, or against time, to read its period), a longitudinal wave as lines bunched at its compressions,
// or the longitudinal wave above its matching transverse one, lined up. y = A sin(2πx / λ) from the numbers, on axes
// fitted so the wavelength (or period) and the amplitude are whole numbers of blocks (ported/waves.js), so a student
// can measure them off the grid; marks for the wavelength (or period) and the amplitude, and the crest, trough,
// compression and rarefaction named where they are.
import { node, label, line, poly, arrow, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { axes, axisTitle } from './graphs.js';
import { wvFitX, wvFitY, wvPeaks, wvLineXs } from './ported/waves.js';

const WV_KEYS = ['kind', 'hide', 'wave', 'axis', 'amplitude', 'wavelength', 'period', 'speed', 'cycles', 'marks', 'labels', 'xunit', 'yunit', 'heading'];
const WV_LABELS = ['crest', 'trough', 'compression', 'rarefaction'];
const wvTime = d => d.axis === 'time';
const wvRepeat = d => (wvTime(d) ? d.period : d.wavelength);
/**
 * { wave?: "transverse" | "longitudinal" | "both", axis?: "distance" | "time" (a transverse wave only), amplitude (in
 * yunit; not for a longitudinal wave alone), wavelength (along distance) or period (along time), cycles: 0.5 to 8 in
 * halves, speed?: m/s (for the frequency), marks?: ["wavelength", "amplitude"] (the default; [] for none; "wavelength"
 * marks the period along time), labels?: ["crest", "trough", "compression", "rarefaction"], xunit?: "m" (or "s"),
 * yunit?: "cm" }. hide: true (no marks, no labels), "marks", "labels".
 */
export const waves = {
  check(d) {
    const out = [], wave = d.wave || 'transverse';
    for (const k of Object.keys(d)) if (!WV_KEYS.includes(k)) out.push(`"${k}" is not used by a wave`);
    if (!['transverse', 'longitudinal', 'both'].includes(wave)) out.push('"wave" must be "transverse", "longitudinal" or "both"');
    if (d.axis !== undefined && !['distance', 'time'].includes(d.axis)) out.push('"axis" must be "distance" or "time"');
    if (wvTime(d) && wave !== 'transverse') out.push('a longitudinal wave is drawn along distance: "axis": "time" is for a transverse wave only');
    if (wvTime(d)) { if (!isNum(d.period, 1e-4, 1e5)) out.push('along time, give "period" (s), above 0'); if (d.wavelength !== undefined && !isNum(d.wavelength, 1e-4, 1e6)) out.push('"wavelength" must be above 0'); }
    else { if (!isNum(d.wavelength, 1e-4, 1e6)) out.push('give "wavelength" (in xunit), above 0'); if (d.period !== undefined) out.push('along distance the wave shows its wavelength: give "speed" for its frequency, or draw it along time ("axis": "time") with "period"'); }
    if (wave !== 'longitudinal' ? !isNum(d.amplitude, 1e-4, 1e6) : d.amplitude !== undefined) out.push(wave !== 'longitudinal' ? '"amplitude" must be above 0 (in yunit)' : 'a longitudinal wave alone has no displacement axis: leave out "amplitude" (or draw "both")');
    if (d.speed !== undefined && !isNum(d.speed, 1e-6, 1e9)) out.push('"speed" must be above 0 (m/s)');
    if (!isNum(d.cycles, 0.5, 8) || Math.abs(d.cycles * 2 - Math.round(d.cycles * 2)) > 1e-9) out.push('"cycles" must be 0.5 to 8, in halves');
    if (d.marks !== undefined && (!Array.isArray(d.marks) || d.marks.some(m => !['wavelength', 'amplitude'].includes(m)))) out.push('"marks" lists "wavelength" and/or "amplitude"');
    if (d.marks && d.marks.includes('amplitude') && wave === 'longitudinal') out.push('a longitudinal wave alone has no amplitude to mark');
    if (d.labels !== undefined && (!Array.isArray(d.labels) || d.labels.some(m => !WV_LABELS.includes(m)))) out.push(`"labels" lists any of ${WV_LABELS.join(', ')}`);
    if (d.labels && wave === 'transverse' && d.labels.some(l => l === 'compression' || l === 'rarefaction')) out.push('compressions and rarefactions are on a longitudinal wave ("wave": "longitudinal" or "both")');
    if (d.labels && wave === 'longitudinal' && d.labels.some(l => l === 'crest' || l === 'trough')) out.push('crests and troughs are on a transverse wave ("wave": "transverse" or "both")');
    if (!out.length && d.marks && d.marks.includes('wavelength') && d.cycles < 1) out.push('a wavelength mark needs at least one whole cycle: give "cycles" of 1 or more');
    return out;
  },
  /** The wave's numbers: amplitude, wavelength, period and frequency (from the period, or from the speed and the
   *  wavelength), speed when it can be worked out, and where the crests and troughs (compressions and rarefactions) are. */
  solve(d) {
    if (waves.check(d).length) return null;
    const rep = wvRepeat(d), p = wvPeaks(rep, d.cycles * rep), out = { amplitude: d.amplitude, crests: p.crests, troughs: p.troughs };
    if (wvTime(d)) Object.assign(out, { period: d.period, frequency: 1 / d.period }, d.wavelength ? { wavelength: d.wavelength, speed: d.wavelength / d.period } : {});
    else Object.assign(out, { wavelength: d.wavelength }, d.speed ? { speed: d.speed, frequency: d.speed / d.wavelength, period: d.wavelength / d.speed } : {});
    return out;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), lang = o.lang, wave = d.wave || 'transverse', time = wvTime(d), rep = wvRepeat(d), end = d.cycles * rep;
    const marks = o.hide === true || hides(o, 'marks') ? [] : d.marks || ['wavelength', 'amplitude'].filter(m => m !== 'amplitude' || wave !== 'longitudinal');
    const labels = o.hide === true || hides(o, 'labels') ? [] : d.labels || [];
    const trans = wave !== 'longitudinal', longi = wave !== 'transverse', { crests, troughs } = wvPeaks(rep, end);
    const fx = wvFitX(end, rep), xr = [0, fx.blocks * fx.step], xun = text(d.xunit, 6) || (time ? 's' : 'm'), yun = text(d.yunit, 6) || 'cm';
    const markName = time ? 'T' : 'λ', kids = [], BAND = 64, bandTop = 30 + (d.heading ? 24 : 0) + (longi && labels.some(l => l === 'compression' || l === 'rarefaction') ? 22 : 0) + (longi && !trans && marks.includes('wavelength') ? 34 : 0);
    if (d.heading) kids.push(label(250, 22, text(d.heading, 60), { anchor: 'middle', size: 15, colour: P.ink }));
    const dim = (x1, x2, y, words) => node('g', { class: 'of-mark' }, arrow((x1 + x2) / 2, y, x1, y, { colour: P.red, width: 1.6, head: 8 }), arrow((x1 + x2) / 2, y, x2, y, { colour: P.red, width: 1.6, head: 8 }), label((x1 + x2) / 2, y - 11, words, { anchor: 'middle', size: 14, italic: true, colour: P.red, halo: P.paper }));
    let A = null, X, top = longi ? bandTop + BAND + 22 : 20 + (d.heading ? 24 : 0);
    if (trans) {
      const fy = wvFitY(d.amplitude, 1 + (marks.includes('wavelength') ? 0.6 : 0)), yr = [-fy.half * fy.step, fy.half * fy.step];
      A = axes(xr, yr, o, { xstep: fx.step, ystep: fy.step, origin: true, xtitle: axisTitle(W(time ? 'time' : 'distance'), xun), ytitle: axisTitle(W('displacement'), yun), xname: time ? 't' : 'x', yname: 'y' });
      X = A.X;
      const pts = []; for (let k = 0; k <= 240; k++) { const x = (end * k) / 240; pts.push([A.X(x), A.Y(d.amplitude * Math.sin((2 * Math.PI * x) / rep))]); }
      const g = [...A.kids, poly(pts, { stroke: P.blue, 'stroke-width': 3, class: 'of-wave' })];
      if (marks.includes('wavelength')) {
        const two = crests.length >= 2, a = two ? crests[0] : 0, b = two ? crests[1] : rep, y = A.Y(two ? d.amplitude : 0) - (labels.includes('crest') && crests.length < 3 ? 42 : 22);
        if (two) g.push(line(A.X(a), A.Y(d.amplitude) - 6, A.X(a), y - 6, P.red, 1), line(A.X(b), A.Y(d.amplitude) - 6, A.X(b), y - 6, P.red, 1));
        g.push(dim(A.X(a), A.X(b), y, markName));
      }
      if (marks.includes('amplitude') && crests.length) {
        const c = crests[0];   // under the wavelength mark, clear of the crest label (on the last crest)
        g.push(node('g', { class: 'of-mark' }, arrow(A.X(c), A.Y(0), A.X(c), A.Y(d.amplitude), { colour: P.red, width: 1.6, head: 8 }), label(A.X(c) + 8, A.Y(d.amplitude / 2), 'A', { size: 14, italic: true, colour: P.red, halo: P.paper })));
      }
      const word = (k, x, y, dy) => g.push(label(A.X(x), A.Y(y) + dy, W(k), { anchor: 'middle', size: 13, colour: P.ink, halo: P.paper, cls: 'of-label' }));
      if (labels.includes('crest') && crests.length) word('crest', crests[crests.length - 1], d.amplitude, -14);
      if (labels.includes('trough') && troughs.length) word('trough', troughs[troughs.length - 1], -d.amplitude, 16);
      kids.push(node('g', { transform: `translate(0 ${r2(longi ? top - 22 : top - 22)})` }, g));
    } else {
      // a longitudinal wave alone: its lines over a distance axis
      const L = 56, w = 420; X = x => L + ((x - xr[0]) / (xr[1] - xr[0])) * w;
      const ay = bandTop + BAND + 16;
      kids.push(line(L, ay, L + w + 10, ay, P.ink, 2));
      for (let k = 0; k <= fx.blocks; k++) { const v = k * fx.step; kids.push(line(X(v), ay - 4, X(v), ay + 4, P.ink, 1.5)); if (k % 2 === 0 || fx.blocks <= 12) kids.push(label(X(v), ay + 16, fmt(v, 3, lang), { anchor: 'middle', size: 12, weight: 600, colour: P.ink2 })); }
      kids.push(label(L + w / 2, ay + 40, axisTitle(W('distance'), xun), { anchor: 'middle', size: 13, colour: P.ink }));
      top = ay + 50;
    }
    if (longi) {
      const xs = wvLineXs(rep, end, 12);
      kids.push(node('g', { class: 'of-longitudinal' }, xs.map(x => line(X(x), bandTop, X(x), bandTop + BAND, P.ink, 1.6))));
      const word = (k, x) => kids.push(label(X(x), bandTop - 10, W(k), { anchor: 'middle', size: 13, colour: P.ink, halo: P.paper, cls: 'of-label' }));
      if (labels.includes('compression') && crests.length) word('compression', crests[crests.length - 1]);
      if (labels.includes('rarefaction') && troughs.length) word('rarefaction', troughs[0]);
      if (!trans && marks.includes('wavelength')) {
        const two = crests.length >= 2, y = bandTop - 14 - (labels.length ? 22 : 0);
        kids.push(dim(X(two ? crests[0] : 0), X(two ? crests[1] : rep), y, markName));
      }
      if (trans) for (const x of crests) kids.push(line(X(x), bandTop + BAND + 2, X(x), top - 22 + (A ? 22 : 0), P.muted, 1, { 'stroke-dasharray': '2 4', class: 'of-align' }));
    }
    const Wd = A ? A.w : 500, Ht = A ? top - 22 + A.h : top;
    return frame(Wd, Ht, kids, { ...o, kind: 'waves' }, o.title || W('wave'));
  },
};
export const WAVE_KINDS = { waves };
