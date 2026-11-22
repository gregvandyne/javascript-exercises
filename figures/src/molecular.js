// Oomba Figures: molecular biology (1.3.0, the biology pack). Protein synthesis: a DNA strand transcribed and
// translated, each row (the template strand 3' to 5', the coding strand and the mRNA 5' to 3', the tRNA anticodons, the
// amino acids) worked out from one strand by base pairing and the standard genetic code (ported/dna.js), base under
// base, codons grouped from the start codon, any row or a share of its boxes left blank for students. Every base is
// written as its letter, so nothing depends on color: on screen the boxes are tinted by base, in print they are white.
// Gel electrophoresis: lanes of a ladder and samples, each band as far down as its size runs on that gel (in a straight
// line with log10 of its size within the gel's range, crowding past it: ported/gel.js), drawn to scale against a
// centimeter ruler, with bands too close to read as two run together. The checks, the answers (OF.solve) and the
// drawing are Oomba's own.
import { node, label, line, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { dnComplement, dnToRna, dnToDna, dnAnticodon, DN_AMINO, dnTranslate, dnStrands, dnBlanks } from './ported/dna.js';
import { GE_GELS, GE_RANGES, geRun, geInRange, geStrength, geDrawBands, GE_LADDERS, geLadderBands } from './ported/gel.js';

const molOdd = (d, keys, what) => { const k = Object.keys(d).find(x => !keys.includes(x)); return k ? [`${what} does not take "${k}"`] : []; };

// ---------------------------------------------------------------- protein synthesis
const DN_KEYS = ['kind', 'hide', 'coding', 'template', 'mrna', 'rows', 'frame', 'codons', 'names', 'blanks', 'seed', 'heading'];
const DN_ROWS = ['template', 'coding', 'mrna', 'trna', 'amino'];
const DN_TINT = { A: '#F6D6D2', T: '#D7E8F4', U: '#E6DDF4', G: '#D9EED9', C: '#F7EBC6' };
/** The three strands from whichever was given, cut to the codons drawn. */
function dnOf(d) {
  const typed = d.coding ?? d.template ?? d.mrna, coding = d.coding !== undefined ? d.coding : d.template !== undefined ? dnComplement(d.template, 'dna') : dnToDna(d.mrna);
  let S = dnStrands(coding), tr = dnTranslate(S.mrna, d.frame || 'aug');
  if (d.codons !== undefined && tr.start !== null) { S = dnStrands(coding.slice(0, tr.start + 3 * d.codons)); tr = dnTranslate(S.mrna, d.frame || 'aug'); }
  return { S, tr, typed };
}
const dnRows = d => d.rows || ['template', 'mrna', 'amino'];
/**
 * { coding: "ATGGCC..." | template: "TACCGG..." (written 3' to 5') | mrna: "AUGGCC..." (one of them; 3 to 36 bases),
 * rows: ["template", "coding", "mrna", "trna", "amino"] (the rows drawn, top down; default template, mrna, amino),
 * frame: "aug" (from the first AUG) | "first" (from the first base), codons (draw this many codons of the frame), names:
 * "three" | "one" (amino acids), blanks: { mrna: 50 } (a row and the share of its boxes left blank, %), seed (which
 * boxes), heading }. hide: a row's name (all its boxes blank), true (every row but the first).
 */
export const proteinSynthesis = {
  check(d) {
    const out = molOdd(d, DN_KEYS, 'a protein synthesis figure');
    if (out.length) return out;
    const given = ['coding', 'template', 'mrna'].filter(k => d[k] !== undefined);
    if (given.length !== 1) return ['give one strand: "coding", "template" or "mrna"'];
    const s = d[given[0]], rna = given[0] === 'mrna';
    if (typeof s !== 'string' || !(rna ? /^[ACGU]+$/ : /^[ACGT]+$/).test(s)) return [`"${given[0]}" must be bases written in capitals, only ${rna ? 'A, C, G, U' : 'A, C, G, T'}`];
    if (s.length < 3 || s.length > 36) return ['a strand of 3 to 36 bases (12 codons) is drawn'];
    if (d.frame !== undefined && !['aug', 'first'].includes(d.frame)) out.push('"frame" must be "aug" or "first"');
    const rows = dnRows(d);
    if (!Array.isArray(rows) || !rows.length || rows.some(r => !DN_ROWS.includes(r)) || new Set(rows).size !== rows.length) out.push(`"rows" lists the rows drawn: ${DN_ROWS.join(', ')}`);
    if (d.names !== undefined && !['three', 'one'].includes(d.names)) out.push('"names" must be "three" or "one"');
    if (d.blanks !== undefined && (!d.blanks || typeof d.blanks !== 'object' || Object.entries(d.blanks).some(([k, v]) => !DN_ROWS.includes(k) || !isNum(v, 0, 100)))) out.push('"blanks" maps a row to the share of its boxes left blank (0 to 100)');
    if (d.seed !== undefined && !(Number.isInteger(d.seed) && d.seed >= 0)) out.push('"seed" must be a whole number');
    if (out.length) return out;
    const tr = dnTranslate(dnToRna(dnOf(d).S.coding), d.frame || 'aug'), raw = dnTranslate(rna ? s : dnToRna(given[0] === 'coding' ? s : dnComplement(s, 'dna')), d.frame || 'aug');
    if (raw.start === null && (rows.includes('amino') || rows.includes('trna') || d.codons !== undefined)) out.push('the mRNA has no start codon (AUG) to translate from: add one, or use "frame": "first"');
    if (d.codons !== undefined) {
      if (!(Number.isInteger(d.codons) && d.codons >= 1 && d.codons <= 12)) out.push('"codons" must be 1 to 12');
      else if (raw.start !== null && raw.start + 3 * d.codons > s.length) out.push(`the strand has only ${Math.floor((s.length - raw.start) / 3)} codons from its start`);
    }
    if (!out.length && rows.includes('amino') && !tr.codons.length) out.push('there is no whole codon to translate');
    return out;
  },
  /** The strands (coding and mRNA 5' to 3', template 3' to 5'), where the frame starts, the codons, the anticodons, the
   *  amino acids (three-letter, to the stop codon) and how many there are. */
  solve(d) {
    if (proteinSynthesis.check(d).length) return null;
    const { S, tr } = dnOf(d), coded = tr.codons.filter(c => c.code && c.code !== '*');
    return { coding: S.coding, template: S.template, mrna: S.mrna, start: tr.start, codons: tr.codons.length, aminoAcids: coded.length, stop: tr.stopped,
      protein: coded.map(c => DN_AMINO[c.code]).join('-'), oneLetter: coded.map(c => c.code).join(''), anticodons: coded.map(c => dnAnticodon(c.bases)), bases: S.coding.length };
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), { S, tr } = dnOf(d), rows = dnRows(d), box = 26, gapCodon = 7, x0 = 150, kids = [], n = S.coding.length;
    const start = tr.start ?? 0, colX = i => x0 + i * box + (i >= start ? Math.floor((i - start) / 3) * gapCodon : 0), hidden = r => o.hide === true ? r !== rows[0] : hides(o, r);
    const coded = tr.codons.filter(c => c.code !== null), named = { template: [W('templateStrand'), "3′", "5′"], coding: [W('codingStrand'), "5′", "3′"], mrna: ['mRNA', "5′", "3′"], trna: ['tRNA', '', ''], amino: [W('aminoAcids'), '', ''] };
    let y = d.heading ? 40 : 16;
    rows.forEach((r, ri) => {
      const [name, left, right] = named[r];
      kids.push(label(8, y + box / 2, name, { size: 13, weight: 800, colour: P.ink, cls: 'of-row-name' }));
      if (left) kids.push(label(x0 - 8, y + box / 2, left, { anchor: 'end', size: 13, colour: P.ink2 }), label(colX(n - 1) + box + 8, y + box / 2, right, { size: 13, colour: P.ink2 }));
      const cells = r === 'trna' ? coded.filter(c => c.code !== '*').flatMap(c => [...dnAnticodon(c.bases)].map((b, k) => ({ col: c.at + k, base: b }))) : r === 'amino' ? [] : [...(r === 'template' ? S.template : r === 'coding' ? S.coding : S.mrna)].map((b, col) => ({ col, base: b }));
      if (r === 'amino') {
        const blank = (d.blanks || {}).amino ? dnBlanks(coded.length, d.blanks.amino, d.seed || 1, ri) : new Set();
        coded.forEach((c, k) => {
          const x = colX(c.at), w = 3 * box, empty = hidden('amino') || blank.has(k), stop = c.code === '*';
          kids.push(node('rect', { x: x + 1, y, width: w - 2, height: box, rx: 13, fill: stop ? P.soft : P.paper, stroke: P.ink, 'stroke-width': 1.4, 'stroke-dasharray': stop ? '4 3' : null, class: 'of-amino' }));
          if (!empty) kids.push(label(x + w / 2, y + box / 2, stop ? W('stop') : d.names === 'one' ? c.code : DN_AMINO[c.code], { anchor: 'middle', size: 13, colour: P.ink, cls: 'of-amino-name' }));
        });
      } else {
        const blank = (d.blanks || {})[r] ? dnBlanks(cells.length, d.blanks[r], d.seed || 1, ri) : new Set();
        cells.forEach((c, k) => {
          const x = colX(c.col), empty = hidden(r) || blank.has(k);
          kids.push(node('rect', { x, y, width: box - 2, height: box, rx: 3, fill: empty || o.print ? P.paper : DN_TINT[c.base], stroke: P.ink, 'stroke-width': 1.2, class: 'of-base' }));
          if (!empty) kids.push(label(x + (box - 2) / 2, y + box / 2 + 1, c.base, { anchor: 'middle', size: 15, weight: 800, colour: P.ink, cls: 'of-base-letter' }));
        });
      }
      // base pairs between DNA strands that sit next to each other: a short rung per column
      const next = rows[ri + 1];
      if (next && ['template', 'coding'].includes(r) && ['template', 'coding'].includes(next)) for (let i = 0; i < n; i++) kids.push(line(colX(i) + 12, y + box + 1, colX(i) + 12, y + box + 9, P.muted, 1.4));
      y += box + 12;
    });
    const w = colX(n - 1) + box + 36;
    if (d.heading) kids.push(label(w / 2, 16, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    return frame(w, y + 4, kids, { ...o, kind: 'proteinSynthesis' }, o.title || W('proteinSynthesis'));
  },
};

// ---------------------------------------------------------------- gel electrophoresis
const GE_KEYS = ['kind', 'hide', 'lanes', 'gel', 'look', 'sizes', 'values', 'ruler', 'electrodes', 'numbers', 'heading'];
const GE_RUN_CM = 7, GE_PX_CM = 56;
const geGel = d => String(d.gel ?? '1');
const geBands = lane => (lane.ladder ? geLadderBands(lane.ladder) : lane.bands.map(b => (typeof b === 'number' ? { bp: b, amount: 1 } : { bp: b.bp, amount: b.amount ?? 1 })));
/**
 * { lanes: 2 to 12 of { ladder: "1kb" | "100bp" | "lambda", label } or { label, bands: [5200, 3100, { bp: 450, amount: 2
 * }] } (sizes in bp, 10 to 50,000; amount: DNA against a typical band, 0.1 to 10), gel: "0.8" | "1" | "1.5" | "2" (%
 * agarose), look: "stain" | "glow" (glowing bands on a dark gel; print is always stained), sizes (true: the ladder's
 * sizes beside it), values (each sample band's size), ruler (centimeters from the wells), electrodes (true), numbers
 * (lane numbers), heading }. hide: "sizes", "labels" (blank lines over the wells), "values", true.
 */
export const gel = {
  check(d) {
    const out = molOdd(d, GE_KEYS, 'a gel');
    if (out.length) return out;
    if (!GE_GELS.includes(geGel(d))) return ['"gel" must be "0.8", "1", "1.5" or "2" (% agarose)'];
    const L = d.lanes;
    if (!Array.isArray(L) || L.length < 2 || L.length > 12) return ['"lanes" lists 2 to 12 lanes'];
    L.forEach((lane, i) => {
      const at = `lane ${i + 1}`;
      if (!lane || typeof lane !== 'object') { out.push(`${at} must be { ladder } or { label, bands }`); return; }
      const k = Object.keys(lane).find(x => !['ladder', 'label', 'bands'].includes(x)); if (k) { out.push(`${at} does not take "${k}"`); return; }
      if ((lane.ladder === undefined) === (lane.bands === undefined)) { out.push(`${at} is a ladder ({ ladder }) or a sample ({ bands }), one of them`); return; }
      if (lane.label !== undefined && !text(lane.label, 24)) out.push(`${at}: "label" must be short (24 characters)`);
      if (lane.ladder !== undefined && !Object.prototype.hasOwnProperty.call(GE_LADDERS, lane.ladder)) out.push(`${at}: "ladder" must be one of ${Object.keys(GE_LADDERS).join(', ')}`);
      if (lane.bands !== undefined) {
        const B = lane.bands;
        if (!Array.isArray(B) || B.length > 20 || B.some(b => !(isNum(b, 10, 50000) || (b && typeof b === 'object' && isNum(b.bp, 10, 50000) && (b.amount === undefined || isNum(b.amount, 0.1, 10)))))) out.push(`${at}: "bands" lists up to 20 sizes in bp (10 to 50,000), or { bp, amount (0.1 to 10) }`);
        else { const s = B.map(b => (typeof b === 'number' ? b : b.bp)); if (new Set(s).size !== s.length) out.push(`${at}: a size is listed twice: list it once, with its "amount"`); }
      }
    });
    if (d.look !== undefined && !['stain', 'glow'].includes(d.look)) out.push('"look" must be "stain" or "glow"');
    for (const b of ['sizes', 'values', 'ruler', 'electrodes', 'numbers']) if (d[b] !== undefined && typeof d[b] !== 'boolean') out.push(`"${b}" must be true or false`);
    return out;
  },
  /** Every band's distance from its well (cm, the run is 7 cm), whether the gel resolves it, the bands that ran together,
   *  and each sample lane's total (its bands' sizes added: a digest adds up to the whole). */
  solve(d) {
    if (gel.check(d).length) return null;
    const g = geGel(d), lanes = d.lanes.map((lane, i) => ({ lane: i + 1, label: text(lane.label, 24), ladder: lane.ladder || null,
      bands: geBands(lane).map(b => ({ bp: b.bp, cm: Math.round(geRun(b.bp, g) * GE_RUN_CM * 1000) / 1000, resolved: geInRange(b.bp, g) })),
      merged: geDrawBands(geBands(lane), bp => geRun(bp, g) * GE_RUN_CM * GE_PX_CM).filter(b => b.sizes.length > 1).map(b => b.sizes) }));
    const totals = Object.fromEntries(lanes.filter(l => !l.ladder).map(l => [String(l.lane), l.bands.reduce((s, b) => s + b.bp, 0)]));
    return { gel: g, range: GE_RANGES[g], lanes, totals, bands: lanes.reduce((s, l) => s + l.bands.length, 0) };
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), g = geGel(d), glow = d.look === 'glow' && !o.print, laneW = 54, gap = d.values ? 40 : 12, n = d.lanes.length, run = GE_RUN_CM * GE_PX_CM;
    const sizes = d.sizes !== false, left = (sizes ? 74 : 26) + (d.ruler ? 54 : 0), top = (d.heading ? 30 : 8) + (d.numbers ? 16 : 0) + 40, wells = top + 10, gw = n * (laneW + gap) + gap, kids = [];
    const hideAll = o.hide === true, x0 = left;
    const Y = bp => wells + 12 + geRun(bp, g) * run;
    kids.push(node('rect', { x: x0, y: top, width: gw, height: run + 44, rx: 6, fill: glow ? '#1E2430' : o.print ? '#FFFFFF' : '#EEF3F6', stroke: P.ink, 'stroke-width': 1.8, class: 'of-gel' }));
    const bandFill = glow ? '#F2C94C' : o.print ? '#000000' : '#2D4B8E';
    d.lanes.forEach((lane, i) => {
      const lx = x0 + gap + i * (laneW + gap);
      kids.push(node('rect', { x: lx + 4, y: wells, width: laneW - 8, height: 8, fill: glow ? '#0B0E14' : P.paper, stroke: glow ? '#7A8499' : P.ink, 'stroke-width': 1.2, class: 'of-well' }));
      const name = text(lane.label, 24) || (lane.ladder ? W('ladder') : '');
      if (hideAll || hides(o, 'labels')) kids.push(line(lx + 2, top - 10, lx + laneW - 2, top - 10, P.ink, 1.2, { class: 'of-blank' }));
      else if (name) kids.push(node('g', { transform: `translate(${r2(lx + laneW / 2)} ${top - 8}) rotate(-30)` }, label(0, 0, name, { size: 12, colour: P.ink, cls: 'of-lane-label' })));
      if (d.numbers) kids.push(label(lx + laneW / 2, top - 34 - (d.heading ? 0 : 0), String(i + 1), { anchor: 'middle', size: 12, weight: 800, colour: P.ink2, cls: 'of-lane-number' }));
      const B = geBands(lane);
      for (const b of geDrawBands(B, Y)) kids.push(node('rect', { x: lx + 4, y: r2(b.top), width: laneW - 8, height: r2(b.bottom - b.top), rx: 2, fill: bandFill, 'fill-opacity': r2(geStrength(b.amount)), class: 'of-band' }));
      if (lane.ladder && sizes && i === d.lanes.findIndex(l => l.ladder)) {
        const placed = [];
        for (const b of geDrawBands(B, Y)) {
          const yy = (b.top + b.bottom) / 2; if (placed.some(p => Math.abs(p - yy) < 13)) continue; placed.push(yy);
          kids.push(line(x0 - 4, r2(yy), x0, r2(yy), P.ink, 1));
          if (hideAll || hides(o, 'sizes')) kids.push(line(x0 - 50, r2(yy + 5), x0 - 8, r2(yy + 5), P.ink, 1, { class: 'of-blank' }));
          else kids.push(label(x0 - 7, r2(yy), b.sizes.map(s => fmt(s, 0, o.lang)).join('/'), { anchor: 'end', size: 11, weight: 600, colour: P.ink2, cls: 'of-size' }));
        }
      }
      if (!lane.ladder && d.values && !hideAll && !hides(o, 'values')) { let last = -1e9; for (const b of geDrawBands(B, Y)) { const yy = Math.max((b.top + b.bottom) / 2, last + 12); last = yy; kids.push(label(lx + laneW + 2, r2(yy), b.sizes.map(s => fmt(s, 0, o.lang)).join('/'), { size: 10, weight: 700, colour: glow ? '#FFFFFF' : P.ink, cls: 'of-value' })); } }
    });
    if (d.ruler) {
      const rx = 34;
      kids.push(line(rx, wells + 12, rx, wells + 12 + run, P.ink, 1.6));
      for (let c = 0; c <= GE_RUN_CM; c += 0.5) { const yy = wells + 12 + c * GE_PX_CM, major = Number.isInteger(c); kids.push(line(rx, yy, rx + (major ? 10 : 6), yy, P.ink, 1.2)); if (major) kids.push(label(rx - 4, yy, String(c), { anchor: 'end', size: 11, weight: 600, colour: P.ink2 })); }
      kids.push(label(rx - 4, wells, 'cm', { anchor: 'end', size: 11, colour: P.ink2 }));
    }
    if (d.electrodes !== false) {
      const ex = x0 + gw + 18;
      kids.push(node('circle', { cx: ex, cy: wells, r: 10, fill: P.paper, stroke: P.ink, 'stroke-width': 1.6 }), label(ex, wells + 1, '−', { anchor: 'middle', size: 16, colour: P.ink }));
      kids.push(node('circle', { cx: ex, cy: wells + run + 12, r: 10, fill: P.paper, stroke: P.ink, 'stroke-width': 1.6 }), label(ex, wells + run + 13, '+', { anchor: 'middle', size: 16, colour: P.ink }));
      kids.push(line(ex, wells + 18, ex, wells + run - 4, P.muted, 1.4, { 'stroke-dasharray': '3 4' }), node('polygon', { points: `${ex},${wells + run + 2} ${ex - 4},${wells + run - 6} ${ex + 4},${wells + run - 6}`, fill: P.muted }));
    }
    const w = x0 + gw + (d.electrodes !== false ? 40 : 12);
    if (d.heading) kids.push(label(w / 2, 14, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    return frame(w, top + run + 54, kids, { ...o, kind: 'gel' }, o.title || W('gel'));
  },
};
export const MOLECULAR_KINDS = { proteinSynthesis, gel };
