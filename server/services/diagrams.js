// The drawn diagram types that views/nq-diagrams.js draws (grid, squares, lines, chart, table), cleaned the way
// services/courses.js cleanSlide cleans the older types: strictly shaped per type, every string capped, every
// number checked; anything malformed returns null and the slide drops the whole visual (fromDeck reports it).
export const DIAGRAM_TYPES = Object.freeze(['grid', 'squares', 'lines', 'chart', 'table']);
export const LINE_KINDS = Object.freeze(['parallel', 'perpendicular', 'crossing']);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const txt = (x, max) => (typeof x === 'number' && Number.isFinite(x) ? String(x) : str(x, max));

/** One cleaned diagram ({ type, label, ...its data }) or null. `label` is the already-cleaned alt label. */
export function cleanDiagram(v, label) {
  if (!label || !v || typeof v !== 'object') return null;
  if (v.type === 'grid') {
    if (!int(v.cols, 2, 8) || !int(v.rows, 2, 6)) return null;
    const p = v.point;
    if (p != null && !(p && int(p.x, 0, v.cols) && int(p.y, 0, v.rows) && (p.label == null || str(p.label, 10)))) return null;
    return { type: 'grid', label, cols: v.cols, rows: v.rows,
      ...(p ? { point: { x: p.x, y: p.y, ...(p.label ? { label: str(p.label, 10) } : {}) } } : {}),
      ...(v.walk && p ? { walk: true } : {}),
      ...(str(v.xName, 8) ? { xName: str(v.xName, 8) } : {}), ...(str(v.yName, 8) ? { yName: str(v.yName, 8) } : {}) };
  }
  if (v.type === 'squares') {
    if (!Array.isArray(v.shapes) || v.shapes.length < 1 || v.shapes.length > 3) return null;
    if (!v.shapes.every(q => q && int(q.rows, 1, 6) && int(q.cols, 1, 10) && (q.tone == null || int(q.tone, 0, 3)))) return null;
    if (v.shapes.reduce((a, q) => a + q.cols, 0) > 16) return null;
    return { type: 'squares', label, ...(v.fence ? { fence: true } : {}),
      shapes: v.shapes.map(q => ({ rows: q.rows, cols: q.cols, ...(q.tone != null ? { tone: q.tone } : {}),
        ...(txt(q.top, 10) ? { top: txt(q.top, 10) } : {}), ...(txt(q.side, 10) ? { side: txt(q.side, 10) } : {}), ...(str(q.name, 24) ? { name: str(q.name, 24) } : {}) })) };
  }
  if (v.type === 'lines') {
    if (!Array.isArray(v.items) || v.items.length < 1 || v.items.length > 3) return null;
    if (!v.items.every(it => it && LINE_KINDS.includes(it.kind) && str(it.name, 14))) return null;
    return { type: 'lines', label, items: v.items.map(it => ({ kind: it.kind, name: str(it.name, 14) })) };
  }
  if (v.type === 'chart') {
    if (!int(v.max, 1, 1000) || !int(v.step, 1, v.max) || v.max % v.step || v.max / v.step > 10) return null;
    if (!Array.isArray(v.bars) || v.bars.length < 2 || v.bars.length > 5) return null;
    if (!v.bars.every(b => b && str(b.label, 10) && typeof b.value === 'number' && b.value >= 0 && b.value <= v.max && (b.tone == null || int(b.tone, 0, 3)))) return null;
    return { type: 'chart', label, max: v.max, step: v.step, ...(str(v.unit, 20) ? { unit: str(v.unit, 20) } : {}),
      bars: v.bars.map(b => ({ label: str(b.label, 10), value: b.value, ...(b.tone != null ? { tone: b.tone } : {}) })) };
  }
  if (v.type === 'table') {
    if (!Array.isArray(v.head) || v.head.length < 2 || v.head.length > 5 || !v.head.every(h => txt(h, 10))) return null;
    if (!Array.isArray(v.rows) || v.rows.length < 1 || v.rows.length > 4) return null;
    if (!v.rows.every(r => Array.isArray(r) && r.length === v.head.length && r.every(c => txt(c, 10)))) return null;
    if (v.mark != null && !int(v.mark, 0, v.rows.length - 1)) return null;
    return { type: 'table', label, head: v.head.map(h => txt(h, 10)), rows: v.rows.map(r => r.map(c => txt(c, 10))), ...(v.mark != null ? { mark: v.mark } : {}) };
  }
  return null;
}
