// A small QR code maker (ISO/IEC 18004) for the live host screen's join link, so no dependency and no outside service
// is needed. Byte mode, error correction level M, versions 1-4 (up to 62 bytes: https://oomba.ai/join#1234567 is 30,
// version 3). The mask with the lowest penalty is chosen. Pure module; the input is only our own join address.

// ---------------------------------------------------------------- GF(256) and Reed-Solomon
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function generator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
    g = next;
  }
  return g;
}
/** The n error correction codewords for data (an array of bytes). */
export function rsEncode(data, n) {
  const g = generator(n);
  const rem = new Array(n).fill(0);
  for (const d of data) {
    const f = d ^ rem[0];
    rem.shift(); rem.push(0);
    for (let j = 0; j < n; j++) rem[j] ^= mul(g[j + 1], f);
  }
  return rem;
}

// ---------------------------------------------------------------- versions 1-4, level M
// [data codewords per block, blocks, EC codewords per block, alignment centre or 0]
export const VERSIONS = { 1: [16, 1, 10, 0], 2: [28, 1, 16, 18], 3: [44, 1, 26, 22], 4: [32, 2, 18, 26] };
/** The 15 format bits for level M and a mask (BCH code, then the fixed XOR). */
export function formatBits(mask) {
  const data = (0 << 3) | mask;   // level M is 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** The data codewords: byte mode, length, the bytes, terminator, padding. */
export function dataCodewords(bytes, version) {
  const [per, blocks] = VERSIONS[version];
  const cap = per * blocks;
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, 8);
  for (const b of bytes) put(b, 8);
  for (let i = 0; i < 4 && bits.length < cap * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let p = 0; out.length < cap; p++) out.push(p % 2 ? 0x11 : 0xec);
  return out;
}

/** All codewords in order: data blocks interleaved, then their error correction interleaved. */
function codewords(bytes, version) {
  const [per, blocks, ec] = VERSIONS[version];
  const data = dataCodewords(bytes, version);
  const parts = Array.from({ length: blocks }, (_, b) => data.slice(b * per, (b + 1) * per));
  const ecs = parts.map(p => rsEncode(p, ec));
  const out = [];
  for (let i = 0; i < per; i++) for (const p of parts) out.push(p[i]);
  for (let i = 0; i < ec; i++) for (const e of ecs) out.push(e[i]);
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function build(version, words, mask) {
  const size = 17 + 4 * version;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, v) => { m[y][x] = v; fn[y][x] = true; };
  // Finder patterns and their separators.
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  }
  // Timing patterns.
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  // The alignment pattern (versions 2-4 have one).
  const al = VERSIONS[version][3];
  if (al) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al + dx, al + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  // Format bits (reserved now, drawn after the data) and the dark module.
  const drawFormat = bits => {
    const b = i => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, b(i));
    set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, b(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, b(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  // Data, in the zigzag from the bottom right, skipping the vertical timing column.
  let i = 0;
  const total = words.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - vert : vert;
        if (fn[y][x]) continue;
        const bit = i < total ? ((words[i >>> 3] >>> (7 - (i & 7))) & 1) === 1 : false;
        i++;
        m[y][x] = bit !== MASKS[mask](x, y);
      }
    }
  }
  drawFormat(formatBits(mask));
  return m;
}

/** The ISO penalty score of a finished symbol (lower is easier to read). */
export function penalty(m) {
  const size = m.length;
  let p = 0, dark = 0;
  const lines = [];
  for (let y = 0; y < size; y++) { lines.push(m[y]); lines.push(m.map(r => r[y])); }
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else { if (run >= 5) p += 3 + (run - 5); run = 1; }
    }
    const s = line.map(v => (v ? '1' : '0')).join('');
    for (const pat of ['10111010000', '00001011101']) { let k = s.indexOf(pat); while (k >= 0) { p += 40; k = s.indexOf(pat, k + 1); } }
  }
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const v = m[y][x];
    if (v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) p += 3;
  }
  for (const r of m) for (const v of r) if (v) dark++;
  p += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return p;
}

/** text -> { version, size, mask, modules: boolean[][] } (true = dark). Throws for more than 62 bytes. */
export function qr(text) {
  const bytes = [...Buffer.from(String(text), 'utf8')];
  const version = [1, 2, 3, 4].find(v => bytes.length <= VERSIONS[v][0] * VERSIONS[v][1] - 2);
  if (!version) throw new Error('too long for a small QR code');
  const words = codewords(bytes, version);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const modules = build(version, words, mask);
    const score = penalty(modules);
    if (!best || score < best.score) best = { version, size: modules.length, mask, modules, score };
  }
  return best;
}

/** An inline SVG of the code (4 modules of quiet zone), for the host screen. title: the accessible name. */
export function qrSvg(text, { title = '' } = {}) {
  const { size, modules } = qr(text);
  const n = size + 8;
  let d = '';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img"${title ? ` aria-label="${esc(title)}"` : ' aria-hidden="true"'}><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
