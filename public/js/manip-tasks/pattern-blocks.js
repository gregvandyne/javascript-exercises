// Pattern Blocks: the tool's 16 tasks as practice (docs/manip-practice-tasks.md). As in rekenreks.js: each task keeps its
// title, code, grade and notes; make(R) gives one variation; conds are this tool's board checks, read from the board's
// pieces by kind (manip-data.js HEX_SIXTHS: a hexagon is 6 triangles, a trapezoid 3, the blue parallelogram 2; the
// square and the thin tan rhombus are not counted in hexagons). The checks count the blocks a student placed (unlocked);
// locked blocks are the task's own (a hexagon to cover, a design to copy). Every variation hides the board's totals
// ("Hexagons 1 1/2" would give the answers away).
import { boardWith, rowPlaces, objSizeOf, fmt, countTo, endLine } from '../manip-task-kit.js';
import { allPieceDefs, HEX_SIXTHS } from '../manip-data.js';

export const SLUG = 'pattern-blocks';
const DEFS = Object.fromEntries(allPieceDefs(SLUG).map(d => [d.kind, d]));
const KINDS = Object.keys(DEFS);
/** What the blocks are called (the palette says Hexagon, Trapezoid, Triangle, Parallelogram, Rhombus, Square). */
const NAME = { hex: 'hexagon', trap: 'trapezoid', tri: 'triangle', para: 'parallelogram', rhom: 'tan rhombus', sq: 'square' };
/** A kind's plural ("trapezoids", "tan rhombuses"); nm(k, n): "1 trapezoid", "3 trapezoids". */
const pl = k => `${NAME[k]}${k === 'rhom' ? 'es' : 's'}`;
const nm = (k, n) => `${fmt(n)} ${n === 1 ? NAME[k] : pl(k)}`;
const one = k => `${/^[aeiou]/.test(NAME[k]) ? 'an' : 'a'} ${NAME[k]}`;
const S = HEX_SIXTHS;   // value in triangles
/** The blocks each block can be rebuilt from, edge to edge with no gaps: a hexagon from 6 triangles, 3 parallelograms
 * or 2 trapezoids; a trapezoid or a parallelogram from triangles. Nothing is rebuilt from a bigger block. */
export const BUILDS = { hex: ['tri', 'para', 'trap'], trap: ['tri'], para: ['tri'] };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
/** A number of sixths of a hexagon as hexagons: "2", "1 1/2", "2/3". */
export const hexText = six => { const w = Math.floor(six / 6), r = six % 6, g = gcd(r, 6), f = r ? `${r / g}/${6 / g}` : ''; return w && f ? `${w} ${f}` : f || String(w); };
/** a/b in lowest terms ("3/2", "2", "1/3"). */
const frac = (a, b) => { const g = gcd(a, b); return b / g === 1 ? String(a / g) : `${a / g}/${b / g}`; };
/** "1 trapezoid, 2 parallelograms and 3 triangles". */
const listOf = has => { const l = Object.entries(has).filter(([, n]) => n).map(([k, n]) => nm(k, n)); return l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`; };
const plus = (k, n, has) => ({ ...has, [k]: (has[k] || 0) + n });

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
/** A block as the page makes one (manip.js mkPiece); ids are set by the board (the same on the page and the server). */
const block = (kind, x, y, locked) => { const d = DEFS[kind]; return { kind, x: Math.round(x), y: Math.round(y), rot: 0, flipped: false, filled: true, locked, color: d.color, label: d.label, value: d.value, w: d.w, h: d.h }; };
/** Blocks for `has` in rows from (x0, y0), at most `wide` across, biggest first. */
function blocksAt(x0, y0, wide, has, locked) {
  const out = []; let x = x0, y = y0, rowH = 0;
  for (const kind of ['hex', 'trap', 'para', 'rhom', 'sq', 'tri']) {
    for (let j = 0; j < (has[kind] || 0); j++) {
      const d = DEFS[kind];
      if (x + d.w > x0 + wide) { x = x0; y += rowH + 10; rowH = 0; }
      out.push(block(kind, x, y, locked)); x += d.w + 10; rowH = Math.max(rowH, d.h);
    }
  }
  return out;
}
/** A board: work mats [{ label, has, locked }] in a row, centered (their blocks inside), and loose blocks under them. */
export function pbBoard({ mats = [], loose = null } = {}) {
  const objs = mats.map((m, i) => ({ id: `m${i + 1}`, k: 'mat', s: 1, st: { ...(m.label ? { label: m.label } : {}) } }));
  const places = objs.length ? rowPlaces(objs.map(o => objSizeOf(SLUG, o.k, o.st))) : [];
  const pieces = [];
  objs.forEach((o, i) => { o.x = places[i].x; o.y = places[i].y; if (mats[i].has) pieces.push(...blocksAt(o.x + 20, o.y + 50, 400, mats[i].has, mats[i].locked !== false)); });
  if (loose) pieces.push(...blocksAt(1700, objs.length ? 1400 : 1050, 600, loose.has, loose.locked !== false));
  pieces.forEach((p, i) => { p.id = `b${i + 1}`; });
  return boardWith(SLUG, objs, pieces);
}
/** The same board with these blocks added (the student's, unlocked), for the solutions. */
function solved(setup, has) {
  const b = JSON.parse(JSON.stringify(setup));
  b.pieces.push(...blocksAt(1500, 300, 900, has, false).map((p, i) => ({ ...p, id: `s${i + 1}` })));
  return b;
}

// ---------------------------------------------------------------- the checks
/** The student's blocks (unlocked), read defensively. */
const mine = b => ((b && Array.isArray(b.pieces)) ? b.pieces : []).filter(p => p && typeof p === 'object' && DEFS[p.kind] && !p.locked);
const countOf = (ps, k) => ps.filter(p => p.kind === k).length;
export const conds = {
  /** Exactly these many of each kind named, and none of any other kind. */
  counts: (c, b) => { const ps = mine(b); return KINDS.every(k => countOf(ps, k) === num(c.has && c.has[k])); },
  /** At least these many of each kind named (others may be there too). */
  some: (c, b) => { const ps = mine(b); return Object.entries(c.has || {}).every(([k, n]) => countOf(ps, k) >= num(n)); },
  /** A flower around the hexagon (c.a the inner ring's kind, c.b the outer's): 6 blocks touching the hexagon all the way
   *  around it, then 6 more each touching the inner ring, all the way around and farther out. Not a heap of the right
   *  counts beside it. */
  ring: (c, b) => ringOk(b, c.a, c.b),
};

// ---------------------------------------------------------------- the board's geometry (for the shape checks)
/** Each block's outline on its w x h box (manip.js SHAPES, the clip-path polygons), in fractions of the box. */
const OUTLINE = { hex: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]], trap: [[0.25, 0], [0.75, 0], [1, 1], [0, 1]], tri: [[0.5, 0], [1, 1], [0, 1]],
  para: [[0.25, 0], [1, 0], [0.75, 1], [0, 1]], rhom: [[0.12, 0], [1, 0], [0.88, 1], [0, 1]], sq: [[0, 0], [1, 0], [1, 1], [0, 1]] };
const OUTLINE_FLIPPED = { para: [[0, 0], [0.75, 0], [1, 1], [0.25, 1]] };
/** A block on the plane: its middle and its corners (its outline turned by rot degrees, clockwise, about the middle). */
export function shapeOf(p) {
  const w = num(p.w, DEFS[p.kind] ? DEFS[p.kind].w : 40), h = num(p.h, DEFS[p.kind] ? DEFS[p.kind].h : 40), cx = num(p.x) + w / 2, cy = num(p.y) + h / 2;
  const a = (num(p.rot) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const out = ((p.flipped && OUTLINE_FLIPPED[p.kind]) || OUTLINE[p.kind] || OUTLINE.sq).map(([fx, fy]) => { const x = (fx - 0.5) * w, y = (fy - 0.5) * h; return [cx + x * cos - y * sin, cy + x * sin + y * cos]; });
  return { kind: p.kind, cx, cy, pts: out, size: Math.min(w, h) };
}
const segPt = ([ax, ay], [bx, by], [px, py]) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0; return Math.hypot(ax + t * dx - px, ay + t * dy - py); };
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const segsCross = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
const edges = P => P.map((q, i) => [q, P[(i + 1) % P.length]]);
const inPoly = (P, [x, y]) => { let n = false; for (const [[ax, ay], [bx, by]] of edges(P)) if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) n = !n; return n; };
/** How far apart two blocks' outlines are (0 when they touch or overlap). */
export function gapOf(A, B) {
  const ea = edges(A.pts), eb = edges(B.pts);
  if (ea.some(([a, b]) => eb.some(([c, d]) => segsCross(a, b, c, d))) || inPoly(A.pts, B.pts[0]) || inPoly(B.pts, A.pts[0])) return 0;
  return Math.min(...ea.flatMap(([a, b]) => B.pts.map(q => segPt(a, b, q))), ...eb.flatMap(([a, b]) => A.pts.map(q => segPt(a, b, q))));
}
/** Blocks this close count as touching: a block placed by hand beside another, a snapped one flush. */
const TOUCH = 10;
/** The largest gap, in degrees, between the directions of these blocks from a middle (360 for none): a ring goes all the way around. */
const widestGap = (list, o) => { const a = list.map(p => (Math.atan2(p.cy - o.cy, p.cx - o.cx) * 180) / Math.PI).sort((x, y) => x - y); return a.length ? Math.max(...a.map((x, i) => (i ? x - a[i - 1] : x + 360 - a[a.length - 1]))) : 360; };
function ringOk(b, ka, kb) {
  const all = ((b && Array.isArray(b.pieces)) ? b.pieces : []).filter(p => p && typeof p === 'object' && DEFS[p.kind]);
  const hubP = all.find(p => p.kind === 'hex' && p.locked) || all.find(p => p.kind === 'hex'); if (!hubP) return false;
  const hub = shapeOf(hubP), ps = mine(b).filter(p => p !== hubP).map(shapeOf), d = s => Math.hypot(s.cx - hub.cx, s.cy - hub.cy);
  const inner = ps.filter(s => s.kind === ka).sort((x, y) => d(x) - d(y)).slice(0, 6), outer = ps.filter(s => !inner.includes(s) && s.kind === kb);
  if (inner.length !== 6 || outer.length !== 6) return false;
  // no two blocks on top of each other (a heap): their middles at least half a block apart
  if (ps.some((s, i) => ps.some((q, j) => j > i && Math.hypot(s.cx - q.cx, s.cy - q.cy) < 0.5 * Math.min(s.size, q.size)))) return false;
  if (!inner.every(s => gapOf(s, hub) <= TOUCH) || widestGap(inner, hub) > 100) return false;
  const near = Math.min(...inner.map(d));
  return outer.every(s => d(s) > near && inner.some(q => gapOf(s, q) <= TOUCH)) && widestGap(outer, hub) > 0 && widestGap(outer, hub) <= 100;
}
/** Where each block of a ring goes: 6 of `kind` around `inside` (the hexagon, or the ring before), one on each side,
 *  its inner side flush against it (for the solutions; the run-through builds them by hand: Rotate, then a drag). */
const INNER = { trap: { e: [[0.25, 0], [0.75, 0]], n: -90 }, tri: { e: [[0, 1], [1, 1]], n: 90 }, sq: { e: [[0, 1], [1, 1]], n: 90 }, para: { e: [[1, 0], [0.75, 1]], n: 30 } };
function ringAround(hub, inside, kind) {
  const D = DEFS[kind], { e, n } = INNER[kind], out = [];
  for (let k = 0; k < 6; k++) {
    const phi = -90 + 60 * k, u = [Math.cos((phi * Math.PI) / 180), Math.sin((phi * Math.PI) / 180)];
    // how far out the shape inside reaches in this direction (from the hexagon's middle)
    const reach = Math.max(...inside.flatMap(s => s.pts).map(([x, y]) => (x - hub.cx) * u[0] + (y - hub.cy) * u[1]));
    const rot = (((phi + 180 - n) % 360) + 360) % 360, a = (rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    const mx = ((e[0][0] + e[1][0]) / 2 - 0.5) * D.w, my = ((e[0][1] + e[1][1]) / 2 - 0.5) * D.h;   // the inner side's middle, from the box's middle
    const tx = hub.cx + (reach + 1) * u[0], ty = hub.cy + (reach + 1) * u[1];
    const cx = tx - (mx * cos - my * sin), cy = ty - (mx * sin + my * cos);
    out.push({ ...block(kind, cx - D.w / 2, cy - D.h / 2, false), rot, x: Math.round(cx - D.w / 2), y: Math.round(cy - D.h / 2) });
  }
  return out;
}
/** The flower of stage 2 on the setup's board: ring 1 of `a` around the hexagon, ring 2 of `b` around ring 1. */
function flower(setup, a, b) {
  const s = JSON.parse(JSON.stringify(setup)), hub = shapeOf(s.pieces.find(p => p.kind === 'hex'));
  const r1 = ringAround(hub, [hub], a);
  // ring 2 reaches past the ring-1 block on the same side
  const r2 = r1.map((p, k) => ringAround(hub, [shapeOf(p)], b)[k]);
  s.pieces.push(...[...r1, ...r2].map((p, i) => ({ ...p, id: `s${i + 1}` })));
  return s;
}

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
const ANGLES = { tri: [60], sq: [90], hex: [120], para: [60, 120], rhom: [30, 150], trap: [60, 120] };
/** A block's corner: "corner" for one-angle blocks, else "narrow corner" / "wide corner". */
const cornerOf = (k, deg) => (ANGLES[k].length === 1 ? 'corner' : deg === ANGLES[k][0] ? 'narrow corner' : 'wide corner');
const shuffleChoice = (R, options, right) => { const o = R.shuffle(options); return { options: o, correct: o.indexOf(right) }; };

export const TASKS = [
  T('cover-the-hexagon', 'Cover the hexagon', '1.G.A.3', '1',
    'Cover the yellow hexagon with the blocks named, then fill the rest with triangles. How many triangles do you need? (Each question names a different way to cover it.)',
    '2 trapezoids, 3 parallelograms, 6 triangles. The hexagon is the whole, so each cover is a sum that makes 1.',
    R => {
      const opts = [];
      for (const h of [1, 2, 3]) for (const k of ['trap', 'para', 'tri']) opts.push({ h, a: 0, b: 0, only: k });
      for (const h of [1, 2]) for (let a = 0; a <= 2 * h; a++) for (let b = 0; b <= 3 * h; b++) if ((a || b) && 6 * h - 3 * a - 2 * b >= 1) opts.push({ h, a, b });
      const o = R.pick(opts), hx = o.h === 1 ? 'the yellow hexagon' : `the ${o.h} yellow hexagons`;
      const setup = pbBoard({ loose: { has: { hex: o.h } } });
      if (o.only) {
        const n = (6 * o.h) / S[o.only];
        return {
          prompt: `Cover ${hx} using only ${pl(o.only)}. How many ${pl(o.only)} do you need?`,
          setup, answer: { board: [{ t: 'counts', has: { [o.only]: n }, say: `Use only ${pl(o.only)}, just enough to cover ${hx}.` }], box: { key: String(n), label: pl(o.only) } },
          hints: [`Put ${one(o.only)} on a hexagon. How much of it does it cover?`, `A hexagon is the same as ${{ trap: '2 trapezoids', para: '3 parallelograms', tri: '6 triangles' }[o.only]}.`, `${o.h} hexagon${o.h > 1 ? 's' : ''} need ${n}. Add ${n}.`],
          explain: `${hexText(6 * o.h)} hexagon${o.h > 1 ? 's' : ''} = ${n} ${pl(o.only)}. Each ${NAME[o.only]} is ${frac(S[o.only], 6)} of a hexagon.`,
          solution: { board: solved(setup, { [o.only]: n }), box: String(n) },
        };
      }
      const t = 6 * o.h - 3 * o.a - 2 * o.b, has = { trap: o.a, para: o.b, tri: t }, given = listOf({ trap: o.a, para: o.b });
      return {
        prompt: `Cover ${hx}. Use ${given}, then fill the rest with triangles. How many triangles do you need?`,
        setup, answer: { board: [{ t: 'counts', has, say: `Use ${given}, and triangles for the rest.` }], box: { key: String(t), label: 'triangles' } },
        hints: [`Put the ${given} on the hexagon${o.h > 1 ? 's' : ''} first.`, `A hexagon is 6 triangles. A trapezoid covers 3 of them and a parallelogram covers 2.`, `${6 * o.h} - ${3 * o.a + 2 * o.b} = ${t}. Add ${t} triangle${t > 1 ? 's' : ''}.`],
        explain: `${o.a ? `${o.a} trapezoid${o.a > 1 ? 's' : ''} (${3 * o.a} triangles) ` : ''}${o.a && o.b ? '+ ' : ''}${o.b ? `${o.b} parallelogram${o.b > 1 ? 's' : ''} (${2 * o.b} triangles) ` : ''}+ ${t} triangle${t > 1 ? 's' : ''} = ${6 * o.h} triangles, which is ${o.h} whole hexagon${o.h > 1 ? 's' : ''}.`,
        solution: { board: solved(setup, has), box: String(t) },
      };
    }),
  T('fraction-trading', 'Fraction trading', '4.NF.A.1', '4',
    'A design is on the mat. Trade it: build the same amount using only one kind of block, and type how many you used.',
    'Trading up and down between shapes is equivalence again, in geometry clothes. Require exact edges, no overhang.',
    R => {
      let has, v, k;
      for (;;) {
        has = { hex: R.int(0, 1), trap: R.int(0, 2), para: R.int(0, 3), tri: R.int(0, 3) };
        v = Object.entries(has).reduce((s, [kk, n]) => s + S[kk] * n, 0);
        const ks = ['tri', 'para', 'trap', 'hex'].filter(kk => v % S[kk] === 0 && (kk !== 'tri' || v <= 15) && !(has[kk] && Object.values(has).filter(Boolean).length === 1));
        if (Object.values(has).filter(Boolean).length >= 2 && v >= 4 && ks.length) { k = R.pick(ks); break; }
      }
      const n = v / S[k], setup = pbBoard({ mats: [{ label: 'Design', has }] }), kn = pl(k);
      return {
        prompt: `The design on the mat is ${listOf(has)}. Build the same amount using only ${kn}. How many ${kn} do you need?`,
        setup, answer: { board: [{ t: 'counts', has: { [k]: n }, say: `Use only ${kn}, the same amount as the design.` }], box: { key: String(n), label: kn } },
        hints: ['Count the design in triangles: a hexagon is 6, a trapezoid 3, a parallelogram 2.', `The design is worth ${v} triangles. Each ${NAME[k]} is ${S[k]} triangle${S[k] > 1 ? 's' : ''}.`, `${v} ÷ ${S[k]} = ${n}. Build ${n} ${kn}.`],
        explain: `The design is ${v} triangles, which is ${hexText(v)} hexagon${v === 6 ? '' : 's'}. ${n} ${kn} make the same amount: ${n} × ${S[k]} = ${v}.`,
        solution: { board: solved(setup, { [k]: n }), box: String(n) },
      };
    }),
  T('symmetric-design', 'Symmetric design', '4.G.A.3', '4',
    'The left half of a design is on its mat. Build the right half as its mirror image with the same blocks (Rotate and Flip turn them to face the other way), then type how many blocks the whole design has.',
    'Rotating in 30 degree steps matches the block angles. A mirror held on the line is the honest check for symmetry.',
    R => {
      const kinds = R.shuffle(['hex', 'trap', 'tri', 'para', 'sq', 'rhom']).slice(0, R.int(2, 4)), has = {};
      for (const k of kinds) has[k] = R.int(1, 3);
      const n = Object.values(has).reduce((s, x) => s + x, 0), setup = pbBoard({ mats: [{ label: 'Left half', has }, { label: 'Right half', locked: false }] });
      return {
        prompt: `The left half of a design is ${listOf(has)}. Build the right half as its mirror image, with the same blocks. How many blocks are in the whole design?`,
        setup, answer: { board: [{ t: 'counts', has, say: 'The right half needs the same blocks as the left half, no more and no less.' }], box: { key: String(2 * n), label: 'blocks in the whole design' } },
        hints: ['A mirror image has the same blocks, each one turned to face the other way.', 'Hold a block and pick Rotate to turn it; the parallelogram can also Flip.', `Each half has ${n} blocks, so the whole design has ${n} + ${n} = ${2 * n}.`],
        explain: `A line of symmetry splits a design into two halves that match like a mirror: the same blocks on both sides, so ${n} + ${n} = ${2 * n} blocks in all.`,
        solution: { board: solved(setup, has), box: String(2 * n) },
      };
    }),
  T('grow-the-pattern', 'Grow the pattern', '4.OA.C.5', '4',
    'A hexagon flower grows by a ring of 6 blocks at each stage. Build stage 2, then use the rule to find how many blocks a later stage has.',
    'Counting a growing pattern organizes nicely in a table: ring 1 uses 7 blocks. Predict ring 3 before building it.',
    R => {
      const ring = ['trap', 'tri', 'sq', 'para'], a = R.pick(ring), b = R.pick(ring), st = R.int(3, 10), n = 1 + 6 * st;
      const has = a === b ? { [a]: 12 } : { [a]: 6, [b]: 6 }, setup = pbBoard({ loose: { has: { hex: 1 } } });
      return {
        prompt: `A flower starts with 1 hexagon. Stage 1 adds a ring of 6 ${pl(a)} around it, one on each side. Stage 2 adds a ring of 6 ${pl(b)} around that. Each stage adds 6 more blocks. Build stage 2. How many blocks will stage ${st} have?`,
        setup, answer: { board: [{ t: 'counts', has, say: `Stage 2 is the hexagon, 6 ${pl(a)} and 6 ${pl(b)}.` },
          { t: 'ring', a, b, say: `Put the 6 ${pl(a)} around the hexagon, one on each side, touching it. Then put the 6 ${pl(b)} around them, each touching a block of the first ring.` }], box: { key: String(n), label: `blocks at stage ${st}` } },
        hints: [`Put a ${NAME[a]} against each side of the hexagon (hold a block and pick Rotate to turn it), then a ${NAME[b]} against each of those. Stage 1 has 1 + 6 = 7 blocks, stage 2 has 7 + 6 = 13.`, 'Each stage adds 6, so stage s has 1 + 6 × s blocks.', `1 + 6 × ${st} = ${n}.`],
        explain: `The rule is "add 6": ${endLine(countTo(st, i => 1 + 6 * i, null))} Stage ${st} has 1 + 6 × ${st} = ${n} blocks.`,
        solution: { board: flower(setup, a, b), box: String(n) },
      };
    }),
  T('trapezoid-whole', 'Trapezoid whole', '4.NF.A.1', '4',
    'The Whole mat shows the block (or blocks) that count as 1 whole. What fraction of that whole are the blocks on the Part mat?',
    'Triangle is 1/3 of a trapezoid, parallelogram is 2/3. Changing the whole changes every fraction, which is the lesson.',
    R => {
      const wholes = [{ hex: 1 }, { trap: 1 }, { para: 1 }, { hex: 2 }, { hex: 1, trap: 1 }, { trap: 2 }];
      let w, part, wv, pv;
      do {
        w = R.pick(wholes); const k = R.pick(['tri', 'para', 'trap', 'hex']); part = { [k]: R.int(1, 3) };
        wv = Object.entries(w).reduce((s, [kk, n]) => s + S[kk] * n, 0); pv = Object.entries(part).reduce((s, [kk, n]) => s + S[kk] * n, 0);
      } while (pv === wv || pv > 2 * wv || (Object.keys(w).length === 1 && Object.keys(part)[0] === Object.keys(w)[0]));
      const key = frac(pv, wv), setup = pbBoard({ mats: [{ label: 'Whole', has: w }, { label: 'Part', has: part }] });
      return {
        prompt: `If ${listOf(w).replace(/^1 /, 'one ')} ${Object.values(w).reduce((s, x) => s + x, 0) > 1 ? 'are' : 'is'} 1 whole, what fraction ${Object.values(part)[0] > 1 ? 'are' : 'is'} ${listOf(part).replace(/^1 /, 'one ')}?`,
        setup, answer: { box: { key, label: 'fraction of the whole', say: 'Count the whole and the part in triangles, then compare.' } },
        hints: ['Use triangles as the measure: a hexagon is 6, a trapezoid 3, a parallelogram 2.', `The whole is ${nm('tri', wv)} and the part is ${nm('tri', pv)}.`, `${pv} out of ${wv} is ${pv}/${wv}${key !== `${pv}/${wv}` ? `, which is ${key}` : ''}.`],
        explain: `The part is ${nm('tri', pv)} and the whole is ${nm('tri', wv)}, so the part is ${pv}/${wv}${key !== `${pv}/${wv}` ? ` = ${key}` : ''} of the whole. A different whole gives the same block a different fraction.`,
        solution: { box: key },
      };
    }),
  T('build-a-larger-hexagon', 'Build a larger hexagon', '5.NF.B.4', '5',
    'A hexagon twice as wide as the yellow one covers 24 triangles. Build it with the blocks named and triangles for the rest. How many triangles?',
    'The larger hexagon is not a pattern block, so children compose it: worth discussing what counts as the whole now.',
    R => {
      let h, a, b, t;
      do { h = R.int(0, 2); a = R.int(0, 4); b = R.int(0, 3); t = 24 - 6 * h - 3 * a - 2 * b; } while (t < 2 || t > 12 || h + a + b === 0);
      const has = { hex: h, trap: a, para: b, tri: t }, given = listOf({ hex: h, trap: a, para: b }), setup = pbBoard({});
      return {
        prompt: `A hexagon with sides twice as long as the yellow one covers 24 triangles, as much as 4 yellow hexagons. Build it with ${given}, then fill the rest with triangles. How many triangles do you need?`,
        setup, answer: { board: [{ t: 'counts', has, say: `Use ${given}, and triangles for the rest.` }], box: { key: String(t), label: 'triangles' } },
        hints: ['Count everything in triangles: a hexagon is 6, a trapezoid 3, a parallelogram 2.', `${given} cover ${24 - t} triangles.`, `24 - ${24 - t} = ${t}. Add ${nm('tri', t)}.`],
        explain: `${24 - t} + ${t} = 24 triangles, the same as 4 yellow hexagons. When the sides double, the area is 2 × 2 = 4 times as big.`,
        solution: { board: solved(setup, has), box: String(t) },
      };
    }),
  T('angle-sums', 'Angle sums', '4.MD.C.5', '4',
    'Put blocks around one point, corners touching. How many close the full turn, or how many degrees do they cover?',
    'Six triangle angles of 60 degrees close the turn. Angle as a fraction of a turn is the concept being built.',
    R => {
      const items = [];
      for (const [k, as] of Object.entries(ANGLES)) for (const deg of as) {
        if (360 % deg === 0) items.push({ k, deg, full: true });
        for (let n = 2; n * deg < 360 && n <= 6; n++) items.push({ k, deg, n });
      }
      const it = R.pick(items), cn = cornerOf(it.k, it.deg), kn = pl(it.k);
      const setup = pbBoard({});
      if (it.full) {
        const n = 360 / it.deg;
        return {
          prompt: `Put ${kn} around one point, with their ${cn}s touching, until they close the full turn. Each ${cn} is ${it.deg} degrees. How many ${kn} fit?`,
          setup, answer: { board: [{ t: 'counts', has: { [it.k]: n }, say: `Use just enough ${kn} to close the turn.` }], box: { key: String(n), label: kn } },
          hints: ['A full turn is 360 degrees.', `Each ${cn} is ${it.deg} degrees. How many ${it.deg}s make 360?`, `360 ÷ ${it.deg} = ${n}.`],
          explain: `${n} × ${it.deg} = 360 degrees, a full turn. Each ${cn} is 1/${n} of the turn.`,
          solution: { board: solved(setup, { [it.k]: n }), box: String(n) },
        };
      }
      const d = it.n * it.deg;
      return {
        prompt: `Put ${it.n} ${kn} around one point, with their ${cn}s touching. Each ${cn} is ${it.deg} degrees. How many degrees do they cover?`,
        setup, answer: { board: [{ t: 'counts', has: { [it.k]: it.n }, say: `Put ${it.n} ${kn} on the board.` }], box: { key: String(d), label: 'degrees' } },
        hints: ['Angles side by side add up.', `${it.n} corners of ${it.deg} degrees each.`, `${it.n} × ${it.deg} = ${d}.`],
        explain: `${it.n} × ${it.deg} = ${d} degrees, which is ${frac(d, 360)} of a full turn.`,
        solution: { board: solved(setup, { [it.k]: it.n }), box: String(d) },
      };
    }),
  T('design-with-value', 'Design with value', '4.NF.B.3', '4',
    'Build a design worth an exact number of hexagons with two kinds of block. One count is given; find the other.',
    'Many combinations reach 2, for example 2 trapezoids and 3 parallelograms. Requiring exact value adds arithmetic to design.',
    R => {
      const pairs = [['trap', 'para'], ['para', 'trap'], ['trap', 'tri'], ['para', 'tri'], ['hex', 'para']];
      let p, a, b, v;
      do { p = R.pick(pairs); a = R.int(1, 4); b = R.int(1, 5); v = a * S[p[0]] + b * S[p[1]]; } while (v < 6 || v > 18);
      const has = { [p[0]]: a, [p[1]]: b }, bn = pl(p[1]), setup = pbBoard({});
      return {
        prompt: `Build a design worth exactly ${hexText(v)} hexagon${v === 6 ? '' : 's'} using only ${bn} and ${nm(p[0], a)}. How many ${bn} do you need?`,
        setup, answer: { board: [{ t: 'counts', has, say: `Use ${nm(p[0], a)} and ${bn} only, worth ${v < 6 ? `${hexText(v)} of a hexagon` : `${hexText(v)} ${v === 6 ? 'hexagon' : 'hexagons'}`} in all.` }], box: { key: String(b), label: bn } },
        hints: [`Count in triangles: ${hexText(v)} hexagon${v === 6 ? ' is' : 's are'} ${v} triangles.`, `${nm(p[0], a)} make ${a * S[p[0]]} triangles. ${v - a * S[p[0]]} are left.`, S[p[1]] === 1 ? `Each triangle is 1, so you need ${b}.` : `Each ${NAME[p[1]]} is ${S[p[1]]} triangles: ${v - a * S[p[0]]} ÷ ${S[p[1]]} = ${b}.`],
        explain: `${a} × ${frac(S[p[0]], 6)} + ${b} × ${frac(S[p[1]], 6)} = ${hexText(v)}. Counting in triangles (sixths) makes the fractions easy to add.`,
        solution: { board: solved(setup, has), box: String(b) },
      };
    }),
  T('rhombus-talk', 'Rhombus talk', '4.G.A.1', '4',
    'Compare the corners of the blue parallelogram, the tan rhombus and the other blocks: put the blocks on the board and pick the right angle size.',
    'Area equal does not mean shape equal. Naming the skinny and wide angles prepares for angle measurement.',
    R => {
      const items = [];
      for (const [k, as] of Object.entries(ANGLES)) for (const deg of as) items.push({ q: 'size', k, deg });
      for (const [k, deg] of [['para', 60], ['para', 120], ['sq', 90], ['hex', 120], ['tri', 60], ['rhom', 150], ['trap', 120], ['trap', 60]]) items.push({ q: 'fit', k, deg });
      for (const k of ['para', 'rhom', 'trap']) items.push({ q: 'pair', k });
      for (const k of ['para', 'rhom']) items.push({ q: 'diff', k });
      for (const n of [2, 3, 4, 5]) { items.push({ q: 'many', k: 'rhom', deg: 30, n }); items.push({ q: 'many', k: 'para', deg: 60, n }); }
      const it = R.pick(items), setup = pbBoard({});
      const both = it.k === 'rhom' ? { rhom: 1, para: 1 } : { rhom: 1, [it.k]: 1 };
      const board = [{ t: 'some', has: both, say: `Put ${listOf(both).replace(/\b1 /g, 'a ').replace(/\ba ([aeiou])/g, 'an $1')} on the board to compare.` }];
      const put = `Put ${listOf(both).replace(/\b1 /g, 'a ').replace(/\ba ([aeiou])/g, 'an $1')} on the board.`;
      const degs = (right, pool) => { const o = R.shuffle(pool.filter(x => x !== right)).slice(0, 3).concat(right).sort((x, y) => x - y); return { options: o.map(x => `${x}°`), correct: o.indexOf(right) }; };
      let prompt, choice, hints, explain;
      if (it.q === 'size') {
        const cn = cornerOf(it.k, it.deg);
        prompt = `${put} How big is the ${cn} of the ${NAME[it.k]}?`; choice = degs(it.deg, [30, 60, 90, 120, 150]);
        hints = ['Fit the tan rhombus\'s narrow corner into it: that corner is 30 degrees.', `Count how many 30 degree corners fill the ${cn}.`, `The ${cn} of the ${NAME[it.k]} is ${it.deg} degrees.`];
        explain = `The ${NAME[it.k]}'s ${cn} is ${it.deg} degrees: ${it.deg === 30 ? '1 narrow corner of the tan rhombus fits' : `${it.deg / 30} narrow corners of the tan rhombus fit`} in it.`;
      } else if (it.q === 'fit') {
        const n = it.deg / 30, cn = cornerOf(it.k, it.deg);
        prompt = `${put} How many narrow corners of the tan rhombus (30 degrees each) fit into the ${cn} of the ${NAME[it.k]}?`;
        const o = [n - 1, n, n + 1, n + 2].filter(x => x > 0).slice(0, 4); choice = { options: o.map(String), correct: o.indexOf(n) };
        hints = ['Lay the tan rhombus\'s narrow corner inside that corner, point to point.', `The ${cn} of the ${NAME[it.k]} is ${it.deg} degrees.`, `${it.deg} ÷ 30 = ${n}.`];
        explain = `${n} × 30 = ${it.deg} degrees. The thin corner works like a small unit for measuring angles.`;
      } else if (it.q === 'pair') {
        const [a, b] = ANGLES[it.k];
        prompt = `${put} The ${NAME[it.k]} has a narrow corner of ${a} degrees. Together with its wide corner, they make how many degrees?`;
        choice = degs(180, [90, 150, 180, 240, 360]);
        hints = [`Its wide corner is ${b} degrees.`, `Add the two: ${a} + ${b}.`, `${a} + ${b} = 180.`];
        explain = `${a} + ${b} = 180 degrees. A narrow corner and a wide corner next to each other make a straight line.`;
      } else if (it.q === 'diff') {
        const [a, b] = ANGLES[it.k];
        prompt = `${put} How many degrees bigger is the wide corner of the ${NAME[it.k]} than its narrow corner?`;
        choice = degs(b - a, [30, 60, 90, 120, 150]);
        hints = [`The narrow corner of the ${NAME[it.k]} is ${a} degrees.`, `Its wide corner is ${b} degrees.`, `${b} - ${a} = ${b - a}.`];
        explain = `${b} - ${a} = ${b - a} degrees. The parallelogram and the rhombus both have 4 equal sides, but their corners are different sizes.`;
      } else {
        const d = it.n * it.deg, cn = 'narrow corner';
        prompt = `${put} Put ${it.n} ${pl(it.k)} with their ${cn}s around one point. How many degrees is that?`;
        choice = degs(d, [...new Set([d - 30, d, d + 30, d + 60, 2 * d].filter(x => x > 0))]);
        hints = [`The ${cn} of the ${NAME[it.k]} is ${it.deg} degrees.`, 'Angles side by side add up.', `${it.n} × ${it.deg} = ${d}.`];
        explain = `${it.n} × ${it.deg} = ${d} degrees. The tan rhombus's 30 degree corner is half of the blue parallelogram's 60.`;
      }
      return { prompt, setup, answer: { board, choice: { ...choice, say: 'Fit the corners together and compare.' } }, hints, explain, solution: { board: solved(setup, both), choice: choice.correct } };
    }),
  T('pattern-train', 'Pattern train', 'K.G.B.5', 'K',
    'Build a pattern train with the blocks named, repeating until it has the number of blocks asked for. How many of one shape are in it?',
    'Repeating units can be counted in pairs: 5 hexagons and 5 trapezoids in 10 blocks. Unit language matters.',
    R => {
      const shapes = R.shuffle(['hex', 'trap', 'tri', 'sq', 'para']);
      const unit = R.pick([[0, 1], [0, 0, 1], [0, 1, 1], [0, 1, 2]]).map(i => shapes[i]);
      const n = R.pick(unit.length === 2 ? [6, 8, 10] : [6, 9]), has = {};
      for (let i = 0; i < n; i++) has[unit[i % unit.length]] = (has[unit[i % unit.length]] || 0) + 1;
      const ask = R.pick([...new Set(unit)]), m = has[ask], an = pl(ask);
      return {
        prompt: `Build a train: ${[...unit, ...unit].map(k => NAME[k]).join(', ')}, and so on, until it has ${n} blocks. How many ${an} are in your train?`,
        setup: pbBoard({}), answer: { board: [{ t: 'counts', has, say: `Keep the pattern going until there are ${n} blocks.` }], box: { key: String(m), label: an } },
        hints: [`The part that repeats is ${unit.map(k => NAME[k]).join(', ')}.`, `${n} blocks is the repeating part ${n / unit.length} times.`, `There are ${m} ${an}.`],
        explain: `The pattern ${unit.map(k => NAME[k]).join(', ')} repeats ${n / unit.length} times in ${n} blocks, so there are ${m} ${an}.`,
        solution: { board: solved(pbBoard({}), has), box: String(m) },
      };
    }),
  T('fill-the-outline', 'Fill the outline', '1.G.A.2', '1',
    'A big triangle is made of small triangles. Fill it with the blocks named and triangles, type how many triangles, and pick which way uses fewer blocks.',
    'Fewer larger blocks usually wins, but exact fit decides. Misfits should be kept visible as learning moments.',
    R => {
      const opts = [];
      for (const s of [2, 3, 4]) for (let t = 0; t <= s - 2; t++) for (let p = 0; p <= (s * (s - 1)) / 2; p++) if ((t || p) && 3 * t + 2 * p <= s * s - 1) opts.push({ s, t, p });
      const o = R.pick(opts), noun = R.pick(['big triangle', 'tent', 'sail']), all = o.s * o.s, tri = all - 3 * o.t - 2 * o.p;
      const has = { trap: o.t, para: o.p, tri }, given = listOf({ trap: o.t, para: o.p });
      const choice = shuffleChoice(R, ['Only triangles', 'My mix'], 'My mix');
      return {
        prompt: `A ${noun} with sides ${o.s} triangles long is ${all} small triangles. Fill it with ${given} and triangles. How many triangles? Which way uses fewer blocks?`,
        setup: pbBoard({}), answer: { board: [{ t: 'counts', has, say: `Use ${given}, and triangles for the rest.` }], box: { key: String(tri), label: 'triangles' }, choice: { ...choice, say: 'Count the blocks each way.' } },
        hints: [`A trapezoid covers 3 small triangles and a parallelogram covers 2.`, `${given} cover ${all - tri}. ${all} - ${all - tri} = ${nm('tri', tri)}.`, `Only triangles: ${all} blocks. Your mix: ${o.t + o.p + tri} blocks.`],
        explain: `${all} triangles, or ${o.t + o.p + tri} blocks with the mix: bigger blocks cover more, so fewer blocks fill the ${noun}.`,
        solution: { board: solved(pbBoard({}), has), box: String(tri), choice: choice.correct },
      };
    }),
  T('thirds-in-three-ways', 'Fractions of a hexagon', '3.NF.A.3b', '3',
    'Show a fraction of the hexagon using only the block named. How many of that block is it? (Each question names a different block, so the same fraction is shown different ways.)',
    'One whole, three representations of a third. Equivalence across shapes is deeper than within one shape.',
    R => {
      const items = [];
      for (const d of [2, 3, 6]) for (let n = 1; n < 2 * d; n++) { if (n === d) continue; const v = (6 * n) / d; for (const k of ['tri', 'para', 'trap']) if (v % S[k] === 0) items.push({ n, d, k, v }); }
      const it = R.pick(items), c = it.v / S[it.k], kn = pl(it.k), setup = pbBoard({ mats: [{ label: 'Whole', has: { hex: 1 } }] });
      return {
        prompt: `The hexagon is 1 whole. Show ${it.n}/${it.d} of a hexagon using only ${kn}. How many ${kn} is that?`,
        setup, answer: { board: [{ t: 'counts', has: { [it.k]: c }, say: `Use only ${kn} to show ${it.n}/${it.d}.` }], box: { key: String(c), label: kn } },
        hints: [`One ${NAME[it.k]} is ${frac(S[it.k], 6)} of the hexagon.`, `${it.n}/${it.d} of a hexagon is ${nm('tri', it.v)}' worth.`, `${it.v} ÷ ${S[it.k]} = ${c} ${c === 1 ? NAME[it.k] : kn}.`],
        explain: `${c} × ${frac(S[it.k], 6)} = ${it.n}/${it.d}. The same fraction can be shown with different blocks.`,
        solution: { board: solved(setup, { [it.k]: c }), box: String(c) },
      };
    }),
  T('square-from-blocks', 'Square from blocks', '2.G.A.1', '2',
    'Put orange squares together into a bigger shape the size asked for. How many squares did you use, and is the shape a square?',
    'A square block plus triangles can compose larger squares. Worth-in-triangles gives a common measure.',
    R => {
      const r = R.int(1, 4), c = R.int(2, 5), noun = R.pick(['quilt', 'patio', 'window']), n = r * c, sq = r === c;
      const choice = { options: ['Yes', 'No'], correct: sq ? 0 : 1 };
      return {
        prompt: `Make a ${noun} from orange squares: ${c} squares across and ${r} square${r > 1 ? 's' : ''} down. How many squares did you use? Is your ${noun} a square?`,
        setup: pbBoard({}), answer: { board: [{ t: 'counts', has: { sq: n }, say: `Use ${c} squares across and ${r} down.` }], box: { key: String(n), label: 'squares' }, choice: { ...choice, say: 'A square has 4 sides that are all the same length.' } },
        hints: [`Make one row of ${c} squares${r > 1 ? `, then ${r - 1} more row${r > 2 ? 's' : ''} like it` : ''}.`, `${r} row${r > 1 ? 's' : ''} of ${c} is ${n} squares.`, sq ? `${c} across and ${r} down: all 4 sides are the same length, so it is a square.` : `${c} across and ${r} down are different lengths, so it is not a square.`],
        explain: `${r} × ${c} = ${n} squares. ${sq ? 'Its sides are all the same length, so it is a square.' : 'Its sides are not all the same length, so it is a rectangle but not a square.'}`,
        solution: { board: solved(pbBoard({}), { sq: n }), box: String(n), choice: choice.correct },
      };
    }),
  T('deci-blocks-link', 'Deci blocks link', '5.NBT.A.3', '5',
    'Choose a block as 1 whole and the others become decimals (if the parallelogram is 1, a triangle is 0.5). Build a decimal amount or find what a design is worth.',
    'A triangle is one sixth, not a tidy decimal, which sparks honest discussion about which wholes give tidy decimals.',
    R => {
      const sys = R.pick(['hex', 'para']), unit = S[sys];
      const val = k => S[k] / unit, kinds = sys === 'hex' ? ['trap', 'hex'] : ['tri', 'para', 'trap', 'hex'];
      const dec = x => String(+x.toFixed(2));
      const lead = sys === 'hex' ? 'The hexagon is 1, so a trapezoid is 0.5.' : 'The parallelogram is 1, so a triangle is 0.5, a trapezoid 1.5 and a hexagon 3.';
      if (R.chance(0.5)) {
        let k, v;
        do { k = R.pick(kinds.filter(x => x !== sys || R.chance(0.3))); v = val(k) * R.int(2, 8); } while (v > 6 || v === Math.round(val(k)) || (k === 'tri' && v > 5));
        const n = Math.round(v / val(k)), kn = pl(k);
        return {
          prompt: `${lead} Build ${dec(v)} using only ${kn}. How many ${kn} is that?`,
          setup: pbBoard({}), answer: { board: [{ t: 'counts', has: { [k]: n }, say: `Use only ${kn} to make ${dec(v)}.` }], box: { key: String(n), label: kn } },
          hints: [`Each ${NAME[k]} is ${dec(val(k))}.`, `Count by ${dec(val(k))}s up to ${dec(v)}.`, `${n} × ${dec(val(k))} = ${dec(v)}.`],
          explain: `${n} × ${dec(val(k))} = ${dec(v)}. When the whole changes, each block's decimal changes too.`,
          solution: { board: solved(pbBoard({}), { [k]: n }), box: String(n) },
        };
      }
      let has, v;
      do { has = {}; for (const k of kinds) has[k] = R.int(0, 2); v = Object.entries(has).reduce((s, [k, n]) => s + val(k) * n, 0); } while (Object.values(has).filter(Boolean).length < 2 || Number.isInteger(v) && R.chance(0.5));
      return {
        prompt: `${lead} The design on the mat is ${listOf(has)}. What is it worth as a decimal?`, sig: `${sys} ${JSON.stringify(has)}`,
        setup: pbBoard({ mats: [{ label: 'Design', has }] }), answer: { box: { key: dec(v), label: 'the design\'s value', say: 'Add up the value of each block.' } },
        hints: [lead, Object.entries(has).filter(([, n]) => n).map(([k, n]) => `${nm(k, n)}: ${dec(n * val(k))}`).join('; ') + '.', `In all: ${dec(v)}.`],
        explain: `${Object.entries(has).filter(([, n]) => n).map(([k, n]) => dec(n * val(k))).join(' + ')} = ${dec(v)}.`,
        solution: { box: dec(v) },
      };
    }),
  T('border-a-hexagon', 'Border a hexagon', '4.G.A.1', '4',
    'Ring a block with a border of squares, one on each side. Then answer a question about the corner gaps: their size, or which block fills them.',
    'Squares do not share hexagon angles neatly, so gaps appear. Angle mismatch is discoverable, not a failure.',
    R => {
      const SIDES = { hex: 6, tri: 3, sq: 4, para: 4, rhom: 4, trap: 5 };
      const FILL = { 60: 'Triangle', 90: 'Square', 120: 'Hexagon', 30: 'Tan rhombus', 150: 'Tan rhombus' };
      const items = [];
      for (const k of Object.keys(SIDES)) { items.push({ k, q: 'count' }); for (const deg of ANGLES[k]) for (const q of ['gap', 'fill', 'many']) items.push({ k, deg, q }); }
      const it = R.pick(items), n = SIDES[it.k], setup = pbBoard({ loose: { has: { [it.k]: 1 } } });
      const board = [{ t: 'counts', has: { sq: n }, say: `Put one square on each side of the ${NAME[it.k]}${it.k === 'trap' ? ' (its long side takes 2)' : ''}.` }];
      const base = `Ring the ${NAME[it.k]} with squares, one on each side${it.k === 'trap' ? ' (its long side takes 2)' : ''}.`;
      const sol = { board: solved(setup, { sq: n }) };
      if (it.q === 'count') {
        return {
          prompt: `${base} How many squares do you need?`, setup, answer: { board, box: { key: String(n), label: 'squares' } },
          hints: [`Count the sides of the ${NAME[it.k]}.`, 'Each side of length 1 takes one square.', `The ${NAME[it.k]} needs ${n} squares.`],
          explain: `${n} squares, one for each side. At each corner a gap is left: squares and ${pl(it.k)} do not share the same angles.`,
          solution: { ...sol, box: String(n) },
        };
      }
      const cn = cornerOf(it.k, it.deg), gap = 180 - it.deg, cnt = it.k === 'trap' ? 2 : ANGLES[it.k].length === 1 ? n : 2;
      const why = `At the ${cn} there are the ${NAME[it.k]} (${it.deg}°) and two squares (90° each): 360 - ${it.deg} - 180 = ${gap}°.`;
      if (it.q === 'gap') {
        return {
          prompt: `${base} How many degrees is the gap at a ${cn} of the ${NAME[it.k]}?`, setup, answer: { board, box: { key: String(gap), label: 'degrees', say: 'A full turn around the corner is 360 degrees.' } },
          hints: ['All the way around one point is 360 degrees.', `The ${cn} is ${it.deg}° and each square corner is 90°.`, `360 - ${it.deg} - 90 - 90 = ${gap}.`],
          explain: why, solution: { ...sol, box: String(gap) },
        };
      }
      if (it.q === 'fill') {
        const opts = ['Triangle', 'Square', 'Hexagon', 'Tan rhombus'], c = opts.indexOf(FILL[gap]);
        return {
          prompt: `${base} Which block fits exactly into the gap at a ${cn} of the ${NAME[it.k]}?`, setup, answer: { board, choice: { options: opts, correct: c, say: 'Work out the gap in degrees, then find a block with that corner.' } },
          hints: [`The gap is 360 - ${it.deg} - 90 - 90 degrees.`, `The gap is ${gap}°. Which block has a ${gap}° corner?`, `${FILL[gap]}: it has a ${gap}° corner.`],
          explain: `${why} The ${FILL[gap].toLowerCase()} has a ${gap}° corner, so it fills the gap.`, solution: { ...sol, choice: c },
        };
      }
      return {
        prompt: `${base} Then fill the gap at every ${cn} of the ${NAME[it.k]} with ${one(FILL[gap] === 'Tan rhombus' ? 'rhom' : { Triangle: 'tri', Square: 'sq', Hexagon: 'hex' }[FILL[gap]])}. How many of them do you need?`,
        setup, answer: { board, box: { key: String(cnt), label: `${FILL[gap].toLowerCase()} blocks` } },
        hints: [`Count the ${cn}s of the ${NAME[it.k]}.`, `The ${NAME[it.k]} has ${cnt} ${cn}${cnt > 1 ? 's' : ''}.`, `${cnt} gaps, so ${cnt}.`],
        explain: `${why} One ${FILL[gap].toLowerCase()} fills each of the ${cnt} gaps.`, solution: { ...sol, box: String(cnt) },
      };
    }),
  T('invent-a-whole', 'Invent a whole', '3.NF.A.1', '3',
    'Choose a block as the whole. Rebuild another block (or a few) from it where you can, and say what it is worth in this new system.',
    'The hexagon is worth 3 parallelograms. Renaming the whole revalues everything, the essence of unit fractions.',
    R => {
      let w, k, m, v;
      do { w = R.pick(['tri', 'para', 'trap', 'hex']); k = R.pick(['tri', 'para', 'trap', 'hex']); m = R.int(1, 3); v = m * S[k]; } while (k === w || v / S[w] > 6);
      const key = frac(v, S[w]), can = (BUILDS[k] || []).includes(w), n = v / S[w], what = m === 1 ? one(k) : nm(k, m), wn = pl(w);
      const setup = pbBoard({ mats: [{ label: 'Whole', has: { [w]: 1 } }] });
      return {
        prompt: `Choose the ${NAME[w]} as 1 whole. ${can ? `Rebuild ${what} out of ${wn}.` : `Put ${what} on the board next to the ${NAME[w]}.`} What ${m === 1 ? 'is' : 'are'} ${m === 1 ? what.replace(/^an? /, 'the ') : `the ${what}`} worth now?`,
        setup, answer: { board: [can ? { t: 'counts', has: { [w]: n }, say: `Use only ${wn} to rebuild ${what}.` } : { t: 'some', has: { [k]: m }, say: `Put ${what} on the board.` }], box: { key, label: 'its value', say: 'Count both in triangles and compare.' } },
        hints: ['Count in triangles: a hexagon is 6, a trapezoid 3, a parallelogram 2, a triangle 1.', `The whole (${one(w)}) is ${S[w]} triangle${S[w] > 1 ? 's' : ''}. ${what[0].toUpperCase()}${what.slice(1)} ${m === 1 ? 'is' : 'are'} ${v} triangle${v > 1 ? 's' : ''}.`, `${v} ÷ ${S[w]} = ${key}.`],
        explain: `${what[0].toUpperCase()}${what.slice(1)} ${m === 1 ? 'is' : 'are'} ${nm('tri', v)} and the whole is ${S[w]}, so ${m === 1 ? 'it is' : 'they are'} worth ${key}. Change the whole and every value changes.`,
        solution: { board: solved(setup, can ? { [w]: n } : { [k]: m }), box: key },
      };
    }),
];
