// Tiles on the board: their sizes, how a dropped tile snaps into place, and
// the checks for each step: the sides, the rectangle and the like-term groups.
//
// The board is measured in pixels at 100% zoom, with the inside corner of the
// T at (0, 0) and the rectangle growing right and down from it. There is no
// grid (from the original project's design notes): a tile snaps to the
// edges of the T and of tiles near it. A tile that snapped into a chain of
// edges starting at the T's corner also knows its position as a length — so
// many x's and so many units — and the checks read those lengths, never pixels.

import type { Factor, Poly } from './algebra';

export type Kind = 'x2' | 'x' | 'unit';
export type Sign = 1 | -1;

/** A length made of x's and units: { x: 2, u: 3 } is 2x + 3. */
export interface Len {
	x: number;
	u: number;
}

/** The side of a unit tile, in pixels at 100% zoom. */
export const UNIT = 32;
/** The length of an x tile. √11 units, so no number of unit tiles ever lines
 *  up with a number of x tiles and x never looks like it has a value. */
export const XLEN = UNIT * Math.sqrt(11);
/** The gap between the sides of the T and the rectangle. */
export const GAP = 6;

export const ZERO: Len = { x: 0, u: 0 };
export const lenPx = (l: Len) => l.x * XLEN + l.u * UNIT;
export const lenAdd = (a: Len, b: Len): Len => ({ x: a.x + b.x, u: a.u + b.u });
export const lenSub = (a: Len, b: Len): Len => ({ x: a.x - b.x, u: a.u - b.u });
export const lenEq = (a: Len, b: Len) => a.x === b.x && a.u === b.u;

/** A tile lying on the board. `turned` stands an x tile up. `at` is where it
 *  sits as lengths from the T's corner, on each axis it is lined up with the
 *  mat: a tile on the top side knows how far along it is, but not how far up. */
export interface Tile {
	id: number;
	kind: Kind;
	sign: Sign;
	turned: boolean;
	x: number;
	y: number;
	at: { x: Len | null; y: Len | null };
}

/** A tile on one of the T's sides. Sides hold only x tiles and unit tiles. */
export interface SideTile {
	id: number;
	kind: 'x' | 'unit';
	sign: Sign;
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export function size(kind: Kind, turned = false): { w: Len; h: Len } {
	const X = { x: 1, u: 0 };
	const U = { x: 0, u: 1 };
	if (kind === 'x2') return { w: X, h: X };
	if (kind === 'unit') return { w: U, h: U };
	return turned ? { w: U, h: X } : { w: X, h: U };
}

export function rectOf(t: Pick<Tile, 'kind' | 'turned' | 'x' | 'y'>): Rect {
	const { w, h } = size(t.kind, t.turned);
	return { x: t.x, y: t.y, w: lenPx(w), h: lenPx(h) };
}

const EPS = 0.5;
const overlaps = (a: Rect, b: Rect) =>
	a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
	Math.hypot(a.x - b.x, a.y - b.y);

// --- the sides ---

/** Where each tile on a side starts and ends, as lengths along the side. */
export function sideStops(tiles: SideTile[]): Len[] {
	const stops = [ZERO];
	for (const t of tiles) stops.push(lenAdd(stops[stops.length - 1], size(t.kind).w));
	return stops;
}

/** The factor a side's tiles spell out, counting zero pairs as nothing. */
export function sideFactor(tiles: SideTile[]): Factor {
	return {
		x: tiles.filter((t) => t.kind === 'x').reduce((n, t) => n + t.sign, 0),
		unit: tiles.filter((t) => t.kind === 'unit').reduce((n, t) => n + t.sign, 0)
	};
}

/** Whether a side is built from exactly the tiles for a factor: px + q is |p|
 *  x tiles and |q| unit tiles, signed, with no zero pairs. */
export function sideShows(tiles: SideTile[], f: Factor): boolean {
	const count = (kind: SideTile['kind'], sign: Sign) =>
		tiles.filter((t) => t.kind === kind && t.sign === sign).length;
	const want = (n: number, sign: Sign) => (Math.sign(n) === sign ? Math.abs(n) : 0);
	return ([1, -1] as Sign[]).every(
		(s) => count('x', s) === want(f.x, s) && count('unit', s) === want(f.unit, s)
	);
}

// --- snapping ---

/** A line a tile edge can snap to, along one axis. */
interface Anchor {
	px: number;
	len: Len | null;
	/** Only a tile's far edge lands on it, as on a side's line. */
	endOnly?: boolean;
}

/** How far, in screen pixels, a tile edge reaches for something to snap to. */
export const SNAP_REACH = 14;

/** The lines on each axis that a tile can snap to: the inside edges of the T,
 *  the stops along each side, and the edges of the tiles nearby. With no T on
 *  the board (`null` sides, as in Solve), only the tiles. */
function anchorsFor(drop: Rect, others: Tile[], top: SideTile[] | null, left: SideTile[] | null) {
	// The rectangle's edges of the T, and the sides' edges facing it: a tile on a
	// side sits with its inner edge on the side's line, GAP from the rectangle.
	const tee = (side: SideTile[] | null): Anchor[] =>
		side
			? [
					...sideStops(side).map((l) => ({ px: lenPx(l), len: l })),
					{ px: -GAP, len: null, endOnly: true }
				]
			: [];
	const xs = tee(top);
	const ys = tee(left);
	const near = XLEN * 1.2;
	for (const o of others) {
		const r = rectOf(o);
		const { w, h } = size(o.kind, o.turned);
		// Only tiles near the drop on the other axis pull on this one, so a tile
		// far down the board doesn't tug at one being placed up here.
		if (r.y < drop.y + drop.h + near && drop.y < r.y + r.h + near) {
			xs.push({ px: r.x, len: o.at.x }, { px: r.x + r.w, len: o.at.x && lenAdd(o.at.x, w) });
		}
		if (r.x < drop.x + drop.w + near && drop.x < r.x + r.w + near) {
			ys.push({ px: r.y, len: o.at.y }, { px: r.y + r.h, len: o.at.y && lenAdd(o.at.y, h) });
		}
	}
	// An edge lying on a side's line, like the inner edge of a tile already on
	// that side, is that line: only a tile's far edge lands on it.
	if (top && left) for (const a of [...xs, ...ys]) if (Math.abs(a.px + GAP) < EPS) a.endOnly = true;
	return { xs, ys };
}

/** Snap one edge position to the nearest anchor within reach, either the
 *  tile's start or its end landing on it. */
function snapAxis(start: number, extent: Len, anchors: Anchor[], reach: number): Anchor {
	let best: Anchor = { px: start, len: null };
	let bestD = reach;
	const extentPx = lenPx(extent);
	for (const a of anchors) {
		const options = [[a.px - extentPx, a.len && lenSub(a.len, extent)]] as [number, Len | null][];
		if (!a.endOnly) options.push([a.px, a.len]);
		for (const [px, len] of options) {
			const d = Math.abs(px - start);
			if (d < bestD) {
				best = { px, len };
				bestD = d;
			}
		}
	}
	return best;
}

/** A length is only a real place on the mat if it can't go behind the T. */
const onMat = (l: Len | null) => l !== null && lenPx(l) > -EPS;

/** Where a tile dropped at (x, y) comes to rest: snapped to the edges near
 *  it, then slid to the nearest free spot if it would lie on another tile.
 *  `reach` is the snap distance in board pixels at the current zoom. `fixed`
 *  pins an axis, as on a side of the T, which holds a single row of tiles.
 *  `top` and `left` are the T's sides, or null when there's no T. */
export function settle(
	tile: Pick<Tile, 'kind' | 'turned'>,
	x: number,
	y: number,
	others: Tile[],
	top: SideTile[] | null,
	left: SideTile[] | null,
	reach: number,
	fixed: { x?: number; y?: number } = {}
): Pick<Tile, 'x' | 'y' | 'at'> {
	const { w, h } = size(tile.kind, tile.turned);
	const wpx = lenPx(w);
	const hpx = lenPx(h);
	const drop = { x, y, w: wpx, h: hpx };
	const { xs, ys } = anchorsFor(drop, others, top, left);
	const sx = fixed.x !== undefined ? { px: fixed.x, len: null } : snapAxis(x, w, xs, reach);
	const sy = fixed.y !== undefined ? { px: fixed.y, len: null } : snapAxis(y, h, ys, reach);
	const at = (ax: Anchor, ay: Anchor) => ({
		x: onMat(ax.len) ? ax.len : null,
		y: onMat(ay.len) ? ay.len : null
	});
	const rects = others.map(rectOf);
	const free = (px: number, py: number) =>
		!rects.some((r) => overlaps(r, { x: px, y: py, w: wpx, h: hpx }));
	if (free(sx.px, sy.px)) return { x: sx.px, y: sy.px, at: at(sx, sy) };

	// It would lie on another tile: try every spot flush against a tile nearby,
	// lined up with that tile's edges, and take the free one nearest the drop.
	const spots: { x: Anchor; y: Anchor }[] = [];
	for (const o of others) {
		const r = rectOf(o);
		if (distance(r, drop) > XLEN * 4) continue;
		const ox = o.at.x;
		const oy = o.at.y;
		const s = size(o.kind, o.turned);
		const xLines: Anchor[] =
			fixed.x !== undefined
				? [sx]
				: [
						{ px: r.x + r.w, len: ox && lenAdd(ox, s.w) },
						{ px: r.x - wpx, len: ox && lenSub(ox, w) },
						{ px: r.x, len: ox },
						{ px: r.x + r.w - wpx, len: ox && lenSub(lenAdd(ox, s.w), w) },
						sx
					];
		const yLines: Anchor[] =
			fixed.y !== undefined
				? [sy]
				: [
						{ px: r.y + r.h, len: oy && lenAdd(oy, s.h) },
						{ px: r.y - hpx, len: oy && lenSub(oy, h) },
						{ px: r.y, len: oy },
						{ px: r.y + r.h - hpx, len: oy && lenSub(lenAdd(oy, s.h), h) },
						sy
					];
		for (const ax of xLines) for (const ay of yLines) spots.push({ x: ax, y: ay });
	}
	const away = (s: { x: Anchor; y: Anchor }) => distance({ x: s.x.px, y: s.y.px }, drop);
	spots.sort((a, b) => away(a) - away(b));
	for (const s of spots)
		if (free(s.x.px, s.y.px)) return { x: s.x.px, y: s.y.px, at: at(s.x, s.y) };

	// Nothing flush is free: walk outward from the drop until there's room.
	for (let r = UNIT / 2; r < XLEN * 20; r += UNIT / 2) {
		for (let k = 0; k < 16; k++) {
			const px = fixed.x ?? x + r * Math.cos((k / 16) * 2 * Math.PI);
			const py = fixed.y ?? y + r * Math.sin((k / 16) * 2 * Math.PI);
			if (free(px, py)) return { x: px, y: py, at: { x: null, y: null } };
		}
	}
	return { x, y, at: { x: null, y: null } };
}

// --- the sides' rows ---

/** Which side's row a tile lies in, if any: its inner edge on the side's line,
 *  and its middle along the side, between the corner and `arm`. */
export function rowOf(t: Tile, arm: number): 'top' | 'left' | null {
	const r = rectOf(t);
	if (Math.abs(r.y + r.h + GAP) < EPS && r.x + r.w / 2 > -GAP && r.x + r.w / 2 < arm) return 'top';
	if (Math.abs(r.x + r.w + GAP) < EPS && r.y + r.h / 2 > -GAP && r.y + r.h / 2 < arm) return 'left';
	return null;
}

/** A side of the T holds one row of tiles laid end to end from the corner, so a
 *  tile dropped on a side slides along until it meets the corner or the tile
 *  before it, and the row closes up when a tile leaves. Tiles keep their order
 *  along the side, except that `first` ones (locked in place) stay in front. */
export function packSides(
	tiles: Tile[],
	arm: number,
	first: (t: Tile) => boolean = () => false
): Tile[] {
	const out = new Map(tiles.map((t) => [t.id, t]));
	for (const which of ['top', 'left'] as const) {
		const along = (t: Tile) => (which === 'top' ? t.x + rectOf(t).w / 2 : t.y + rectOf(t).h / 2);
		const row = tiles
			.filter((t) => rowOf(t, arm) === which)
			.sort((a, b) => Number(first(b)) - Number(first(a)) || along(a) - along(b));
		let end = ZERO;
		for (const t of row) {
			const { w, h } = size(t.kind, t.turned);
			const ext = which === 'top' ? w : h;
			out.set(
				t.id,
				which === 'top'
					? { ...t, x: lenPx(end), at: { x: end, y: null } }
					: { ...t, y: lenPx(end), at: { x: null, y: end } }
			);
			end = lenAdd(end, ext);
		}
	}
	return tiles.map((t) => out.get(t.id)!);
}

// --- reading the rectangle ---

export interface Cell {
	col: number;
	row: number;
	x: Len;
	y: Len;
	w: Len;
	h: Len;
}

/** A finished check: whether it passed, which tiles to mark, which cells are
 *  missing a tile, and what to tell the student. */
export interface Result {
	ok: boolean;
	message: string;
	wrong: number[];
	gaps: Cell[];
}

const pass = (message = ''): Result => ({ ok: true, message, wrong: [], gaps: [] });
const fail = (message: string, wrong: number[] = [], gaps: Cell[] = []): Result => ({
	ok: false,
	message,
	wrong,
	gaps
});

/** The net number of each kind of tile: how many positive less how many negative. */
export function net(tiles: Pick<Tile, 'kind' | 'sign'>[]): Poly {
	const count = (kind: Kind) =>
		tiles.filter((t) => t.kind === kind).reduce((n, t) => n + t.sign, 0);
	return [count('unit'), count('x'), count('x2')];
}

const samePoly = (a: Poly, b: Poly) => [0, 1, 2].every((i) => (a[i] ?? 0) === (b[i] ?? 0));

/** The cells a rectangle with these sides has, one where each row meets each column. */
export function cellsFor(top: SideTile[], left: SideTile[]): (Cell & { sign: Sign })[] {
	const xs = sideStops(top);
	const ys = sideStops(left);
	return left.flatMap((r, row) =>
		top.map((c, col) => ({
			col,
			row,
			x: xs[col],
			y: ys[row],
			w: size(c.kind).w,
			h: size(r.kind).w,
			sign: (c.sign * r.sign) as Sign
		}))
	);
}

/** Multiply: check the rectangle against the sides already on the T. Every
 *  cell needs one tile of its size, signed by its row times its column. */
export function checkProduct(tiles: Tile[], top: SideTile[], left: SideTile[]): Result {
	const cells = cellsFor(top, left);
	const filled = new Set<Cell>();
	const misplaced: number[] = [];
	const missigned: number[] = [];
	for (const t of tiles) {
		const { w, h } = size(t.kind, t.turned);
		const { x, y } = t.at;
		const cell =
			x && y
				? cells.find((c) => lenEq(c.x, x) && lenEq(c.y, y) && lenEq(c.w, w) && lenEq(c.h, h))
				: undefined;
		if (!cell || filled.has(cell)) misplaced.push(t.id);
		else if (cell.sign !== t.sign) {
			missigned.push(t.id);
			filled.add(cell);
		} else filled.add(cell);
	}
	const gaps = cells.filter((c) => !filled.has(c));
	if (misplaced.length)
		return fail(
			'The red tiles don’t fit where they are. Each tile is as wide as its column and as tall as its row.',
			[...misplaced, ...missigned],
			gaps
		);
	if (missigned.length)
		return fail(
			'The red tiles have the wrong sign. A tile’s sign is its row’s sign times its column’s.',
			missigned,
			gaps
		);
	if (gaps.length)
		return fail('The rectangle isn’t full yet. Fill every space inside the T.', [], gaps);
	return pass();
}

/** A rectangle read from its tiles: the width of each column, the height of
 *  each row, and the sign of the tile in each cell. */
export interface Grid {
	cols: Len[];
	rows: Len[];
	signs: Sign[][];
	/** Each column's and row's sign, with the first column positive. */
	colSigns: Sign[];
	rowSigns: Sign[];
}

/** Factor: read a rectangle the student built freely, or say what's wrong with it. */
export function readRectangle(tiles: Tile[], poly: Poly): Result & { grid?: Grid } {
	if (!tiles.length) return fail('Build a rectangle in the corner of the T.');
	const loose = tiles.filter((t) => !t.at.x || !t.at.y).map((t) => t.id);
	if (loose.length)
		return fail('Line the red tiles up edge to edge with the T or the tiles next to them.', loose);
	const corner = tiles.some((t) => lenEq(t.at.x!, ZERO) && lenEq(t.at.y!, ZERO));
	if (!corner) return fail('Start the rectangle right in the corner of the T.');

	// Every edge in the rectangle, across and down, in order.
	const lines = (pick: (t: Tile) => [Len, Len]) => {
		const all: Len[] = [];
		for (const t of tiles) for (const l of pick(t)) if (!all.some((a) => lenEq(a, l))) all.push(l);
		return all.sort((a, b) => lenPx(a) - lenPx(b));
	};
	const xs = lines((t) => [t.at.x!, lenAdd(t.at.x!, size(t.kind, t.turned).w)]);
	const ys = lines((t) => [t.at.y!, lenAdd(t.at.y!, size(t.kind, t.turned).h)]);
	const index = (all: Len[], l: Len) => all.findIndex((a) => lenEq(a, l));

	// Each tile must fill exactly one cell between neighboring lines.
	const grid: (Tile | null)[][] = ys.slice(1).map(() => xs.slice(1).map(() => null));
	const unaligned: number[] = [];
	for (const t of tiles) {
		const { w, h } = size(t.kind, t.turned);
		const c = index(xs, t.at.x!);
		const r = index(ys, t.at.y!);
		if (
			index(xs, lenAdd(t.at.x!, w)) !== c + 1 ||
			index(ys, lenAdd(t.at.y!, h)) !== r + 1 ||
			grid[r][c]
		)
			unaligned.push(t.id);
		else grid[r][c] = t;
	}
	if (unaligned.length)
		return fail(
			'The red tiles break up the rows and columns. A rectangle’s tiles line up in straight rows and columns.',
			unaligned
		);

	const gaps: Cell[] = [];
	grid.forEach((row, r) =>
		row.forEach((t, c) => {
			if (!t)
				gaps.push({
					col: c,
					row: r,
					x: xs[c],
					y: ys[r],
					w: lenSub(xs[c + 1], xs[c]),
					h: lenSub(ys[r + 1], ys[r])
				});
		})
	);
	if (gaps.length)
		return fail('There are gaps. A rectangle has no holes and no missing corners.', [], gaps);

	const signs = grid.map((row) => row.map((t) => t!.sign));
	// The first column is positive; every row then follows from it, and every
	// other column from the first row.
	const rowSigns = signs.map((row) => row[0]);
	const colSigns = signs[0].map((s) => (s * rowSigns[0]) as Sign);
	const clashing = grid.flatMap((row, r) =>
		row.filter((t, c) => t!.sign !== rowSigns[r] * colSigns[c]).map((t) => t!.id)
	);
	if (clashing.length)
		return fail(
			'The signs don’t work. In a rectangle each tile’s sign is its row’s sign times its column’s, so try swapping the red tiles with others.',
			clashing
		);

	const built = net(tiles);
	if (!samePoly(built, poly))
		return fail(
			'Your rectangle doesn’t use exactly the polynomial’s tiles. Count them against the problem.'
		);
	return {
		...pass(),
		grid: {
			cols: xs.slice(1).map((l, i) => lenSub(l, xs[i])),
			rows: ys.slice(1).map((l, i) => lenSub(l, ys[i])),
			signs,
			colSigns,
			rowSigns
		}
	};
}

// --- checking the sides ---

const kindOfLen = (l: Len): SideTile['kind'] | null =>
	lenEq(l, { x: 1, u: 0 }) ? 'x' : lenEq(l, { x: 0, u: 1 }) ? 'unit' : null;

/** Multiply: whether the two sides show the problem's two factors, either way round. */
export function checkSides(top: SideTile[], left: SideTile[], factors: [Factor, Factor]): Result {
	const [f, g] = factors;
	if (!top.length || !left.length) return fail('Put a factor on each side of the T.');
	if ((sideShows(top, f) && sideShows(left, g)) || (sideShows(top, g) && sideShows(left, f)))
		return pass();
	const shows = (tiles: SideTile[]) => [f, g].some((h) => sideShows(tiles, h));
	const wrong = [...(shows(top) ? [] : top), ...(shows(left) ? [] : left)].map((t) => t.id);
	return fail(
		wrong.length
			? 'A side doesn’t match a factor. Each side needs exactly the tiles of one factor: an x tile for each x and a unit tile for each 1.'
			: 'Both sides show the same factor. Put one factor on each side.',
		wrong
	);
}

/** Factor: whether the sides measure the rectangle: one tile per column along
 *  the top and one per row down the side, the same lengths, with signs whose
 *  products give every tile's sign. */
export function checkSidesAgainst(top: SideTile[], left: SideTile[], grid: Grid): Result {
	const fits = (tiles: SideTile[], lens: Len[]) =>
		tiles.length === lens.length && tiles.every((t, i) => kindOfLen(lens[i]) === t.kind);
	if (!fits(top, grid.cols) || !fits(left, grid.rows)) {
		const wrongOn = (tiles: SideTile[], lens: Len[]) =>
			tiles.filter((t, i) => kindOfLen(lens[i] ?? ZERO) !== t.kind).map((t) => t.id);
		return fail(
			'The sides don’t measure the rectangle yet. Put one tile above each column and one beside each row, the same length.',
			[...wrongOn(top, grid.cols), ...wrongOn(left, grid.rows)]
		);
	}
	// The sides' signs can be the rectangle's own, or all of them flipped.
	for (const flip of [1, -1]) {
		if (
			top.every((t, i) => t.sign === grid.colSigns[i] * flip) &&
			left.every((t, i) => t.sign === grid.rowSigns[i] * flip)
		)
			return pass();
	}
	const flip = top[0].sign === grid.colSigns[0] ? 1 : -1;
	return fail(
		'Some signs on the sides don’t match the rectangle. A row’s sign times a column’s has to give the sign of the tile where they meet.',
		[
			...top.filter((t, i) => t.sign !== grid.colSigns[i] * flip),
			...left.filter((t, i) => t.sign !== grid.rowSigns[i] * flip)
		].map((t) => t.id)
	);
}

// --- like-term groups ---

export const GROUP_KINDS: Kind[] = ['x2', 'x', 'unit'];

/** Multiply: check the like-term groups once the rectangle's tiles have been
 *  moved into them. `outside` holds the rectangle's tiles not yet in a group;
 *  `groups` holds the tiles lying in each group. */
export function checkGroups(outside: Tile[], groups: Record<Kind, Tile[]>, product: Poly): Result {
	if (outside.length)
		return fail(
			'Move every tile from the rectangle into its group.',
			outside.map((t) => t.id)
		);
	const strays = GROUP_KINDS.flatMap((k) => groups[k].filter((t) => t.kind !== k)).map((t) => t.id);
	if (strays.length)
		return fail(
			'The red tiles are in the wrong group. Like terms are tiles of the same shape.',
			strays
		);
	const grouped = GROUP_KINDS.flatMap((k) => groups[k]);
	if (!samePoly(net(grouped), product))
		return fail('Every tile from the rectangle needs to end up in a group, and nothing else.');
	const pairs = GROUP_KINDS.filter((k) => new Set(groups[k].map((t) => t.sign)).size > 1);
	if (pairs.length)
		return fail(
			'There are still zero pairs. Push a negative tile up against a positive one of the same kind, then zero them out.',
			pairs.flatMap((k) => groups[k].map((t) => t.id))
		);
	return pass();
}

// --- reading a side ---

/** A side of the T read from the tiles lying on it: each runs along the side,
 *  end to end from the corner, with its inner edge against the rectangle. */
export function readSide(tiles: Tile[], which: 'top' | 'left'): Result & { side: SideTile[] } {
	const along = (t: Tile) => (which === 'top' ? t.at.x : t.at.y);
	const stop = (message: string, wrong: Tile[]) => ({
		...fail(
			message,
			wrong.map((t) => t.id)
		),
		side: []
	});
	const squares = tiles.filter((t) => t.kind === 'x2');
	if (squares.length)
		return stop('x² tiles don’t go on a side. A side holds x tiles and unit tiles.', squares);
	const across = tiles.filter((t) => t.kind === 'x' && t.turned !== (which === 'left'));
	if (across.length)
		return stop(
			`Turn the red x tile${across.length > 1 ? 's' : ''} to run ${which === 'top' ? 'along the top' : 'down the side'}.`,
			across
		);
	// Each tile's inner edge, the one facing the rectangle.
	const inner = (t: Tile) => {
		const r = rectOf(t);
		return which === 'top' ? r.y + r.h : r.x + r.w;
	};
	const adrift = tiles.filter((t) => Math.abs(inner(t) + GAP) > EPS || !along(t));
	if (adrift.length)
		return stop('Push the red tiles up against the rectangle, lined up with the side.', adrift);
	const sorted = [...tiles].sort((a, b) => lenPx(along(a)!) - lenPx(along(b)!));
	let end = ZERO;
	for (const [i, t] of sorted.entries()) {
		if (!lenEq(along(t)!, end))
			return stop(
				'Line the side’s tiles up end to end, starting at the corner of the T.',
				sorted.slice(i)
			);
		end = lenAdd(end, size(t.kind).w);
	}
	return {
		...pass(),
		side: sorted.map((t) => ({ id: t.id, kind: t.kind as SideTile['kind'], sign: t.sign }))
	};
}

// --- zero pairs ---

/** Opposite tiles lying flush against each other, a whole edge to a whole
 *  edge, which can zero out. Each tile is in at most one pair. */
export function zeroPairs(tiles: Tile[]): [Tile, Tile][] {
	const out: [Tile, Tile][] = [];
	const used = new Set<number>();
	const near = (a: number, b: number) => Math.abs(a - b) <= EPS;
	for (const a of tiles) {
		if (used.has(a.id)) continue;
		const ra = rectOf(a);
		const b = tiles.find((b) => {
			if (used.has(b.id) || b.id === a.id || b.kind !== a.kind || b.sign === a.sign) return false;
			const rb = rectOf(b);
			if (!near(ra.w, rb.w) || !near(ra.h, rb.h)) return false;
			const sideBySide = near(ra.y, rb.y) && (near(ra.x + ra.w, rb.x) || near(rb.x + rb.w, ra.x));
			const stacked = near(ra.x, rb.x) && (near(ra.y + ra.h, rb.y) || near(rb.y + rb.h, ra.y));
			return sideBySide || stacked;
		});
		if (b) {
			out.push([a, b]);
			used.add(a.id).add(b.id);
		}
	}
	return out;
}

/** Zero pairs among selected tiles, which needn't lie flush: every positive
 *  tile paired with a negative tile of the same kind, nearest first. Only
 *  tiles in the same region can pair, as tiles in one pan of Solve's balance,
 *  or both off it. Tiles left without a partner aren't in any pair. */
export function pairUp<T extends Tile>(tiles: T[], region: (t: T) => string | null = () => null) {
	const middle = (t: T) => {
		const r = rectOf(t);
		return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
	};
	const options: { a: T; b: T; d: number }[] = [];
	for (const a of tiles)
		for (const b of tiles)
			if (a.sign > 0 && b.sign < 0 && a.kind === b.kind && region(a) === region(b))
				options.push({ a, b, d: distance(middle(a), middle(b)) });
	options.sort((p, q) => p.d - q.d);
	const used = new Set<number>();
	const out: [T, T][] = [];
	for (const { a, b } of options) {
		if (used.has(a.id) || used.has(b.id)) continue;
		used.add(a.id).add(b.id);
		out.push([a, b]);
	}
	return out;
}

/** How far down to move a block of tiles so its copies lie directly below it,
 *  flush, laid out the same: one block's height, or further until no copy
 *  lies on anything in its way. `blocking(i)` is what copy i mustn't lie on. */
export function stackBelow(block: Rect[], blocking: (i: number) => Rect[]): number {
	const top = Math.min(...block.map((r) => r.y));
	let dy = Math.max(...block.map((r) => r.y + r.h)) - top;
	for (let n = 0; n < 500; n++) {
		let next = dy;
		block.forEach((r, i) => {
			const moved = { ...r, y: r.y + dy };
			for (const o of blocking(i)) if (overlaps(moved, o)) next = Math.max(next, o.y + o.h - r.y);
		});
		if (next === dy) return dy;
		dy = next;
	}
	return dy;
}
