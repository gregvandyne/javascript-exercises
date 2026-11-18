// Solve's balance: where its two pans lie on the board, which way it leans,
// and the checks for doing the same to both pans and for the division step.
//
// The balance weighs the pans:
// it hangs level when they weigh the same with x set to the answer, and tips
// toward the heavier pan. With the live balance off, it is drawn level
// whatever is in the pans, and only step 1's Check weighs them.

import { evaluate, type Equation, type Poly } from './algebra';
import { UNIT, XLEN, net, rectOf, type Rect, type Result, type Tile } from './mat';

export type Pan = 'left' | 'right';

/** Which way the balance hangs: level, or tipped down toward the heavier pan. */
export type Lean = { toward: Pan | null };

/** Whether pans holding `left` and `right` weigh the same with x set to the
 *  answer: x² tiles weigh x², x tiles x, unit tiles 1, and a negative tile the
 *  opposite of its twin. Two empty pans weigh the same. */
export function isLevel(left: Poly, right: Poly, problem: Equation): boolean {
	return evaluate(left, problem.solution) === evaluate(right, problem.solution);
}

/** Which way the balance hangs with these tiles in its pans: toward the pan
 *  that weighs more with x set to the answer. */
export function lean(left: Poly, right: Poly, problem: Equation): Lean {
	const d = evaluate(left, problem.solution) - evaluate(right, problem.solution);
	return { toward: d > 0 ? 'left' : d < 0 ? 'right' : null };
}

const pass = (message = ''): Result => ({ ok: true, message, wrong: [], gaps: [] });
const fail = (message: string, wrong: Tile[] = []): Result => ({
	ok: false,
	message,
	wrong: wrong.map((t) => t.id),
	gaps: []
});

/** Step 1, doing the same to both pans: passes when the pans weigh the same,
 *  one pan holds only positive x tiles and the other only unit tiles (or
 *  nothing), with no x² tiles and no zero pairs left in either. Tiles off the
 *  balance don't count. On a pass, says which pan holds the x tiles. With the
 *  live balance off, the pans are the equation's two sides, and a fail never
 *  says which side is heavier. */
export function checkPans(
	left: Tile[],
	right: Tile[],
	problem: Equation,
	live = true
): Result & { xPan?: Pan } {
	// With the live balance off there's no balance on the board, only the
	// equation's two sides, so the messages say "side", never "pan" or "balance".
	const say = (balance: string, sides: string) => (live ? balance : sides);
	if (!isLevel(net(left), net(right), problem))
		return fail(
			say(
				'The balance isn’t level. Whatever you do to one pan, do the same to the other, so it stays level.',
				'The two sides aren’t equal. Whatever you do to one side, do the same to the other.'
			)
		);
	const both = [...left, ...right];
	const squares = both.filter((t) => t.kind === 'x2');
	if (squares.length)
		return fail(
			say(
				'Take the x² tiles off. The same x² tiles come off both pans, so the balance stays level.',
				'Take the x² tiles away. The same x² tiles come off both sides.'
			),
			squares
		);
	const pairs = [left, right].flatMap((pan) =>
		(['x', 'unit'] as const).flatMap((kind) => {
			const of = pan.filter((t) => t.kind === kind);
			return new Set(of.map((t) => t.sign)).size > 1 ? of : [];
		})
	);
	if (pairs.length)
		return fail(
			say(
				'There are still zero pairs in a pan. Select them, or push a negative tile up against a positive one of the same kind, then zero them out.',
				'There are still zero pairs on a side. Select them, or push a negative tile up against a positive one of the same kind, then zero them out.'
			),
			pairs
		);
	const xs = (pan: Tile[]) => pan.filter((t) => t.kind === 'x');
	if (xs(left).length && xs(right).length) {
		// Mark the pan with fewer x tiles: that's where they should all go.
		const fewer =
			xs(left).length === xs(right).length
				? both.filter((t) => t.kind === 'x')
				: xs(left).length < xs(right).length
					? xs(left)
					: xs(right);
		return fail(
			say(
				'Get the x tiles alone in one pan and the unit tiles in the other. There are x tiles in both pans: take the same x tiles away from both.',
				'Get the x tiles alone on one side and the unit tiles on the other. There are x tiles on both sides: take the same x tiles away from both.'
			),
			fewer
		);
	}
	const xPan: Pan | null = xs(left).length ? 'left' : xs(right).length ? 'right' : null;
	if (!xPan)
		return fail(
			say(
				'There are no x tiles on the balance. Put the problem’s tiles in the pans.',
				'There are no x tiles on either side. Put the problem’s tiles on its two sides.'
			)
		);
	const units = (xPan === 'left' ? left : right).filter((t) => t.kind === 'unit');
	if (units.length)
		return fail(
			say(
				'Get the x tiles alone in one pan and the unit tiles in the other. Add the red tiles’ opposites to both pans, then zero out the zero pairs.',
				'Get the x tiles alone on one side and the unit tiles on the other. Add the red tiles’ opposites to both sides, then zero out the zero pairs.'
			),
			units
		);
	const negative = xs(xPan === 'left' ? left : right).filter((t) => t.sign < 0);
	if (negative.length)
		return fail(
			say(
				'The x tiles are negative. Select every tile in both pans and flip them all: the balance stays level.',
				'The x tiles are negative. Select every tile on both sides and flip them all: the sides stay equal.'
			),
			negative
		);
	return { ...pass(), xPan };
}

/** The division step: every unit tile has to lie in a box, beside its x
 *  tile, with no zero pairs and the same number in every box. `boxOf` says
 *  which box a tile lies in, if any; `want` is how many units there were when
 *  step 1 passed. On a fail, `badBoxes` are the boxes that don't hold the
 *  right number. */
export function checkBoxes(
	units: Tile[],
	boxOf: (t: Tile) => number | null,
	boxes: number,
	want: number
): Result & { badBoxes: number[] } {
	const stop = (message: string, wrong: Tile[] = []) => ({ ...fail(message, wrong), badBoxes: [] });
	const others = units.filter((t) => t.kind !== 'unit');
	if (others.length)
		return stop('Only unit tiles go in the boxes. Take the red tiles away.', others);
	if (new Set(units.map((t) => t.sign)).size > 1)
		return stop('There are zero pairs among the units. Zero them out first.', units);
	if (units.length !== want)
		return stop(
			`There were ${want} unit tiles to share out. Share out all of them, no more and no fewer.`
		);
	const loose = units.filter((t) => boxOf(t) === null);
	if (loose.length)
		return stop(
			'Put every unit tile in a box, beside an x tile. The red ones aren’t in one yet.',
			loose
		);
	const counts = Array.from({ length: boxes }, (_, i) => units.filter((t) => boxOf(t) === i));
	if (counts.every((box) => box.length === counts[0].length)) return { ...pass(), badBoxes: [] };
	// When the units can't split evenly, there's no fair share to measure by,
	// so the boxes unlike the most common count are the ones marked.
	const sizes = counts.map((box) => box.length);
	const common = sizes
		.slice()
		.sort((a, b) => sizes.filter((n) => n === b).length - sizes.filter((n) => n === a).length)[0];
	const fair = units.length / boxes;
	const target = Number.isInteger(fair) ? fair : common;
	const badBoxes = sizes.flatMap((n, i) => (n === target ? [] : [i]));
	return {
		...fail(
			'The boxes aren’t even. Every x tile needs the same number of unit tiles, so move tiles from the red boxes.',
			badBoxes.flatMap((i) => counts[i])
		),
		badBoxes
	};
}

// --- where the balance lies on the board ---

/** The space round the inside of a pan's border. */
export const PAN_PAD = UNIT * 0.75;
/** The space between the two pans, where the post stands. */
export const PAN_GAP = 1.5 * XLEN;
/** How far the beam lies above the pans. */
export const HANG = 1.6 * XLEN;

export interface Balance {
	left: Rect;
	right: Rect;
	/** The middle of the beam, which it turns about: a pin, fixed to the post. */
	pivot: { x: number; y: number };
	/** Half the beam: from the pivot to where each pan hangs. */
	arm: number;
	/** Where the stand's foot rests, under the pans. */
	foot: number;
	/** How many x tiles are left at the end of step 1, one box each. */
	rows: number;
}

const area = (p: Poly) =>
	Math.abs(p[2] ?? 0) * XLEN * XLEN +
	Math.abs(p[1] ?? 0) * XLEN * UNIT +
	Math.abs(p[0] ?? 0) * UNIT * UNIT;

/** The balance for a problem, its pans big enough for its tiles with room to
 *  work, for both sides' tiles in either pan. The left pan's corner is at (0, 0). */
export function balanceFor(problem: Equation): Balance {
	const [, b = 0] = [
		(problem.left[0] ?? 0) - (problem.right[0] ?? 0),
		(problem.left[1] ?? 0) - (problem.right[1] ?? 0)
	];
	const w = 5 * XLEN;
	const h = Math.max(
		3.2 * XLEN,
		((area(problem.left) + area(problem.right)) * 2) / w + 2 * PAN_PAD
	);
	return withHeight(
		{
			left: { x: 0, y: 0, w, h },
			right: { x: w + PAN_GAP, y: 0, w, h },
			pivot: { x: w + PAN_GAP / 2, y: -HANG },
			arm: (w + PAN_GAP) / 2,
			foot: 0,
			rows: Math.abs(b)
		},
		h
	);
}

/** The balance with both pans grown (or shrunk) to height `h`, the foot under them. */
export function withHeight(b: Balance, h: number): Balance {
	return {
		...b,
		left: { ...b.left, h },
		right: { ...b.right, h },
		foot: b.left.y + h + 0.6 * XLEN
	};
}

/** How far the balance turns for a lean, in degrees, clockwise: tipping
 *  toward the right pan turns it clockwise. */
export function tiltOf(l: Lean): number {
	return l.toward === 'right' ? 4 : l.toward === 'left' ? -4 : 0;
}

/** How far each pan drops for a turn of the beam, in board pixels (up is negative). */
export function panDrops(b: Balance, deg: number): Record<Pan, number> {
	const dy = b.arm * Math.sin((deg * Math.PI) / 180);
	return { left: -dy, right: dy };
}

// --- the division step ---

/** The space inside a division box, round its tiles. */
export const BOX_PAD = UNIT * 0.5;
/** The space between one box and the next. */
export const BOX_GAP = UNIT * 0.5;

/** The division step, once the balance has faded: a line down the middle
 *  standing for =, and a dashed box across it for each x tile, stacked
 *  down, each x tile in the half on its own side and its share of the units
 *  in the other. The units wait in a heap above the boxes, on their side. */
export interface Division {
	/** Where the line stands, and how far it runs. */
	line: { x: number; top: number; bottom: number };
	boxes: Rect[];
	/** The side of the line the x tiles are on. */
	xSide: Pan;
	/** Where the units wait to be shared out. */
	heap: Rect;
	/** The width of each half of a box. */
	half: number;
}

/** How many units fit across one half of a box. */
const perRow = (half: number) => Math.max(1, Math.floor((half - 2 * BOX_PAD) / UNIT));

/** The division step's layout for `boxes` x tiles and `units` unit tiles, the
 *  line at `x` and the heap's top at `top`. The boxes take as much height as
 *  `aspect` (the view's height over its width) allows the drawing, so the
 *  whole thing fills the screen, but never less than they need. Where tiles
 *  lie in it doesn't depend on how the balance hung. */
export function divisionFor(
	x: number,
	top: number,
	boxes: number,
	units: number,
	xSide: Pan,
	aspect: number
): Division {
	const share = Math.ceil(units / Math.max(1, boxes));
	const half = Math.max(XLEN + 2 * BOX_PAD, Math.min(Math.max(share, 3), 8) * UNIT + 2 * BOX_PAD);
	const across = perRow(half);
	const heapH = Math.max(1, Math.ceil(units / across)) * UNIT;
	const least = Math.max(UNIT * 2, Math.ceil(share / across) * UNIT + 2 * BOX_PAD);
	const width = 2 * half + 2 * UNIT;
	const room = width * aspect - heapH - 3 * UNIT;
	const h = Math.min(4 * XLEN, Math.max(least, room / Math.max(1, boxes) - BOX_GAP));
	const first = top + heapH + UNIT;
	const rects = Array.from({ length: boxes }, (_, i) => ({
		x: x - half,
		y: first + i * (h + BOX_GAP),
		w: 2 * half,
		h
	}));
	const bottom = first + boxes * (h + BOX_GAP) - BOX_GAP;
	const heapX = xSide === 'left' ? x + BOX_PAD : x - half + BOX_PAD;
	return {
		line: { x, top: top - UNIT / 2, bottom: bottom + UNIT / 2 },
		boxes: rects,
		xSide,
		heap: { x: heapX, y: top, w: half - 2 * BOX_PAD, h: heapH },
		half
	};
}

/** The half of box i that holds the units, or the x tile. */
export function boxHalf(d: Division, i: number, units: boolean): Rect {
	const b = d.boxes[i];
	const right = units === (d.xSide === 'left');
	return { x: right ? b.x + d.half : b.x, y: b.y, w: d.half, h: b.h };
}

/** Which box's units half a tile lies in, by where its middle is, if any. */
export function boxIn(d: Division, t: Tile): number | null {
	const r = rectOf(t);
	const mx = r.x + r.w / 2;
	const my = r.y + r.h / 2;
	for (let i = 0; i < d.boxes.length; i++) {
		const h = boxHalf(d, i, true);
		if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) return i;
	}
	return null;
}

/** Where unit i of the heap waits: in rows across the heap, flush. */
export function heapSpot(d: Division, i: number): { x: number; y: number } {
	const across = perRow(d.half);
	return { x: d.heap.x + (i % across) * UNIT, y: d.heap.y + Math.floor(i / across) * UNIT };
}
