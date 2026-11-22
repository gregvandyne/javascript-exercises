// Oomba Figures: the biology of transcription and translation, stated once. A pairs with T in DNA and with U in RNA; G
// pairs with C. The two strands of DNA are antiparallel, so the template strand, written 3' to 5' left to right, lines
// up base under base with the coding strand (5' to 3') and the mRNA (5' to 3'), which is the coding strand with U for T.
// An anticodon pairs with its codon the same way, antiparallel: under 5'-AUG-3' it reads 3'-UAC-5'. The standard genetic
// code (NCBI table 1), the 20 amino acids' one- and three-letter codes, and reading an mRNA in codons from its first AUG
// (or its first base) until the first stop codon; stop codons are read by a release factor, not a tRNA, so they get no
// anticodon. A row's blanks come from a seed (mulberry32), each row its own numbers, so blanking one row never moves
// another's. Pure data in, pure data out: figures/src/molecular.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the amino acids keep their codes but not their English names; reading a
// typed sequence (written ends, stray letters, T for U), the deliberate mistakes, the codon chart's layout, the answer
// key's text and the settings are left out (Oomba takes the bases as data and checks them).

export const DN_DNA_PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' };
export const DN_RNA_PAIR = { A: 'U', T: 'A', U: 'A', G: 'C', C: 'G' };
/** A strand's bases paired one for one, as DNA or RNA (the pairs read the other way round). */
export const dnComplement = (bases, as) => [...bases].map(b => (as === 'dna' ? DN_DNA_PAIR[b === 'U' ? 'T' : b] : DN_RNA_PAIR[b]) || '').join('');
export const dnToRna = bases => bases.replace(/T/g, 'U');
export const dnToDna = bases => bases.replace(/U/g, 'T');
export const dnAnticodon = codon => dnComplement(codon, 'rna');
/** The amino acids: one-letter code -> three-letter code. */
export const DN_AMINO = { A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys', Q: 'Gln', E: 'Glu', G: 'Gly', H: 'His', I: 'Ile', L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe', P: 'Pro', S: 'Ser', T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val' };
const DN_ORDER = ['U', 'C', 'A', 'G'];
const DN_TABLE = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
/** Every mRNA codon -> its amino acid's one-letter code, or "*" for a stop codon. */
export const DN_CODONS = new Map([...DN_TABLE].map((letter, i) => [[16, 4, 1].map(step => DN_ORDER[Math.floor(i / step) % 4]).join(''), letter]));
export const DN_START = 'AUG';
/** An mRNA (5' to 3') read in codons from its first AUG (frame "aug") or first base ("first"): { start, codons: [{ at,
 *  bases, code: one-letter, "*" for stop, null after the stop }], stopped }. */
export function dnTranslate(mrna, frame) {
  const at = frame === 'first' ? 0 : mrna.indexOf(DN_START);
  if (at < 0) return { start: null, codons: [], stopped: false };
  const codons = []; let stopped = false;
  for (let i = at; i + 3 <= mrna.length; i += 3) {
    const bases = mrna.slice(i, i + 3), code = stopped ? null : DN_CODONS.get(bases) || null;
    if (code === '*') stopped = true;
    codons.push({ at: i, bases, code });
  }
  return { start: at, codons, stopped };
}
/** All three strands from the coding strand (5' to 3'). */
export const dnStrands = coding => ({ coding, template: [...coding].map(b => DN_DNA_PAIR[b]).join(''), mrna: dnToRna(coding) });
/** A small random number generator (mulberry32). */
export function dnRandom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function dnShuffled(n, rand) {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
/** How many of a partly blank row's n boxes are blank: the share asked, at least one, and one left written. */
export function dnBlankCount(n, share) { if (n === 0) return 0; if (n === 1) return 1; return Math.min(n - 1, Math.max(1, Math.round((n * share) / 100))); }
/** Which of a row's n boxes are blank, for a share (%) and a seed; each row (by its place) has its own numbers. */
export function dnBlanks(n, share, seed, row) {
  const rand = dnRandom((seed * 31 + row * 0x9e3779b9) >>> 0);
  return new Set(dnShuffled(n, rand).slice(0, dnBlankCount(n, share)));
}
