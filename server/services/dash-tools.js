// Classroom dashboards, stage 3: the teaching tools' state (docs/decisions.md "Classroom dashboards, stage 3"). A tool's
// state is what the teacher (or a student, on their own screen) has set up: the fractions shown, a number line's range,
// a line's slope... It is kept in the widget's hidden `state` setting and, when the teacher sends the tool to students,
// copied into the push. Everything a browser sends is rebuilt here from the tool's spec: unknown keys are dropped,
// numbers clamped, lists cut, text clipped. Drawings (the whiteboard) are never part of any state: they never leave the
// browser.
//
// Spec: { key: ['int', lo, hi, def] | ['enum', [values], def] | ['bool', def] | ['text', max, def]
//              | ['ints', maxLen, lo, hi, def] | ['list', maxLen, { spec }, def] }
// then fix(state) for rules that tie keys together (a numerator no bigger than its denominator...).

const SAFE_TEXT = (v, max) => [...String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/[‪-‮⁦-⁩]/g, '').trim()].slice(0, max).join('');
const toInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return v !== null && v !== '' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export const TOOL_SPECS = {
  fractions: {
    spec: { shape: ['enum', ['bar', 'circle'], 'bar'], bars: ['list', 3, { n: ['int', 0, 12, 1], d: ['int', 1, 12, 2] }, [{ n: 3, d: 4 }, { n: 5, d: 8 }]], same: ['bool', false], hide: ['bool', false] },
    fix: s => { if (!s.bars.length) s.bars = [{ n: 1, d: 2 }]; for (const b of s.bars) b.n = Math.min(b.n, b.d); },
  },
  numline: {
    spec: { lo: ['int', -100, 999, 0], hi: ['int', -99, 1000, 10], sub: ['enum', [1, 2, 3, 4, 5, 6, 8, 10, 12], 1], mode: ['enum', ['whole', 'fraction', 'decimal'], 'whole'],
      tool: ['enum', ['point', 'jump'], 'jump'], points: ['ints', 20, -12000, 12000], jumps: ['list', 12, { a: ['int', -12000, 12000, 0], b: ['int', -12000, 12000, 0] }, []] },
    fix: s => {
      if (s.hi <= s.lo) s.hi = s.lo + 1;
      if (s.mode === 'decimal' && [3, 6, 12].includes(s.sub)) s.sub = 10;
      if (s.mode === 'whole') s.sub = 1;
      while ((s.hi - s.lo) * s.sub > 240 && s.sub > 1) s.sub = [1, 2, 3, 4, 5, 6, 8, 10, 12].filter(x => x < s.sub).pop();
      if ((s.hi - s.lo) * s.sub > 240) s.hi = s.lo + 240;
      const lo = s.lo * s.sub, hi = s.hi * s.sub, inside = x => x >= lo && x <= hi;
      s.points = [...new Set(s.points.filter(inside))];
      s.jumps = s.jumps.filter(j => inside(j.a) && inside(j.b) && j.a !== j.b);
    },
  },
  coord: {
    spec: { quads: ['enum', [4, 1], 4], size: ['enum', [5, 10], 5], mi: ['int', 0, 20, 15], b: ['int', -10, 10, 1], line: ['bool', true], table: ['bool', true],
      points: ['list', 20, { x: ['int', -20, 20, 0], y: ['int', -20, 20, 0] }, []] },
    fix: s => {
      const lo = s.quads === 1 ? 0 : -s.size, hi = s.quads === 1 ? 2 * s.size : s.size;
      const seen = new Set();
      s.points = s.points.filter(p => p.x >= lo && p.x <= hi && p.y >= lo && p.y <= hi && !seen.has(`${p.x},${p.y}`) && seen.add(`${p.x},${p.y}`));
    },
  },
  graph: {
    spec: { kind: ['enum', ['bar', 'line', 'picture', 'dot'], 'bar'], title: ['text', 60, ''], icon: ['int', 0, 11, 0], per: ['enum', [1, 2, 5, 10], 1],
      rows: ['list', 12, { l: ['text', 24, ''], v: ['int', 0, 999, 0] }, [{ l: '', v: 3 }, { l: '', v: 5 }, { l: '', v: 2 }, { l: '', v: 4 }]] },
  },
  base10: { spec: { h: ['int', 0, 9, 1], t: ['int', 0, 19, 2], o: ['int', 0, 19, 4] } },
  placeval: { spec: { v: ['int', 0, 9999999, 3405270], discs: ['bool', true], dec: ['bool', true] }, fix: s => { if (!s.dec) s.v -= s.v % 1000; } },
  tenframe: { spec: { frames: ['enum', [1, 2], 1], cells: ['ints', 20, 0, 2, [1, 1, 1, 1, 1, 1, 1, 2, 2]], bond: ['bool', true] },
    fix: s => { s.cells = Array.from({ length: 20 }, (_, i) => (i < s.frames * 10 ? s.cells[i] || 0 : 0)); } },
  hundreds: { spec: { start: ['enum', [1, 0], 1], shade: ['ints', 100, 0, 100], skip: ['int', 0, 10, 0], hide: ['enum', ['none', 'shaded', 'all'], 'none'] },
    fix: s => { const lo = s.start, hi = s.start ? 100 : 99; s.shade = [...new Set(s.shade)].filter(x => x >= lo && x <= hi).sort((a, b) => a - b); if (s.skip === 1) s.skip = 0; } },
  area: { spec: { a: ['int', 1, 99, 4], b: ['int', 1, 99, 6], view: ['enum', ['array', 'area'], 'array'], sa: ['int', 0, 98, 0], sb: ['int', 0, 98, 0] },
    fix: s => { if (s.sa >= s.a) s.sa = 0; if (s.sb >= s.b) s.sb = 0; } },
  times: { spec: { size: ['enum', [10, 12], 10], r: ['int', 0, 12, 0], c: ['int', 0, 12, 0], mark: ['enum', ['fact', 'row', 'col', 'squares', 'turn'], 'fact'], hide: ['bool', false] },
    fix: s => { if (s.r > s.size) s.r = 0; if (s.c > s.size) s.c = 0; } },
  tclock: { spec: { t: ['int', 0, 1439, 580], digital: ['bool', true], h24: ['bool', false], el: ['bool', false], end: ['int', 0, 1439, 735] } },
  fdp: { spec: { n: ['int', 0, 100, 3], d: ['int', 1, 100, 8] }, fix: s => { s.n = Math.min(s.n, s.d); } },
};
/** The tools a teacher can send to students (each student gets their own copy). */
export const TOOL_IDS = Object.keys(TOOL_SPECS);

function cleanBy(spec, src) {
  const o = src && typeof src === 'object' && !Array.isArray(src) ? src : {}, out = {};
  for (const [k, d] of Object.entries(spec)) {
    const v = o[k];
    if (d[0] === 'int') out[k] = toInt(v, d[1], d[2], d[3]);
    else if (d[0] === 'enum') out[k] = d[1].includes(v) ? v : d[1].includes(Number(v)) && typeof d[1][0] === 'number' ? Number(v) : d[2];
    else if (d[0] === 'bool') out[k] = v === undefined ? d[1] : v === true || v === 1 || v === 'true';
    else if (d[0] === 'text') out[k] = v === undefined ? d[2] : SAFE_TEXT(v, d[1]);
    else if (d[0] === 'ints') out[k] = (Array.isArray(v) ? v : d[4] || []).slice(0, d[1]).map(x => toInt(x, d[2], d[3], null)).filter(x => x !== null);
    else if (d[0] === 'list') out[k] = Array.isArray(v) ? v.slice(0, d[1]).filter(x => x && typeof x === 'object').map(x => cleanBy(d[2], x)) : d[3].map(x => ({ ...x }));
  }
  return out;
}
/** A tool's state as a browser sent it -> what may be stored or sent to students. Nothing else survives. */
export function cleanToolState(type, v) {
  const t = TOOL_SPECS[type]; if (!t) return null;
  const s = cleanBy(t.spec, v);
  if (t.fix) t.fix(s);
  return s;
}
