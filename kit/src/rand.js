// Seeded randomness. The kit never uses Math.random: same seed, same meadow, same sparkles (snapshot tests rely on it).

/** Any string or number -> a 32-bit seed (FNV-1a for strings). */
export function seedOf(s) {
  if (typeof s === 'number' && isFinite(s)) return s >>> 0;
  let h = 2166136261; const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** mulberry32: a tiny, fast generator with good spread for games. */
export function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Oomba.rand(seed) -> { float, int(a,b) inclusive, range(a,b), pick, chance, shuffle (copy), sign } */
export function rand(seed = 1) {
  const f = mulberry32(seedOf(seed));
  const r = {
    float: f,
    range: (a, b) => a + (b - a) * f(),
    int: (a, b) => a + Math.floor(f() * (b - a + 1)),
    pick: arr => arr[Math.floor(f() * arr.length)],
    chance: p => f() < p,
    sign: () => (f() < 0.5 ? -1 : 1),
    shuffle: arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
  };
  return r;
}
/** Smooth 1D value noise in -1..1 (shake, wind, clouds): hash-based so it needs no tables. */
export function hash1(i) { let h = Math.imul((i | 0) ^ 0x27d4eb2d, 0x165667b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return ((h >>> 0) / 4294967296) * 2 - 1; }
export function noise1(x) { const i = Math.floor(x), t = x - i, u = t * t * (3 - 2 * t); return hash1(i) * (1 - u) + hash1(i + 1) * u; }
