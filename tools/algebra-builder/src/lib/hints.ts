// Hints for a student who is stuck: for the step they are on, up to three, from the idea of the step to what to do
// with this problem's own tiles. They never do the step for the student, but the last one says what it should look
// like when it's done. Worked out from the problem itself, so they fit whatever the teacher typed.

import { formatPoly, productText, type Built, type Equation, type Factor, type Poly } from './algebra';

export type HintStep = 'sides' | 'rectangle' | 'groups' | 'equation' | 'balance' | 'divide' | 'answer';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const at = (p: Poly, i: number) => p[i] ?? 0;
/** Tiles for a number of one kind: "3 unit tiles", "2 red −1 tiles", "1 x tile", "1 red −x tile". */
function tiles(n: number, kind: 'x' | 'unit' | 'x2'): string {
	const m = Math.abs(n);
	const name = kind === 'x2' ? (n < 0 ? 'red −x²' : 'x²') : kind === 'x' ? (n < 0 ? 'red −x' : 'x') : n < 0 ? 'red −1' : 'unit';
	return plural(m, `${name} tile`);
}
/** A factor as tiles: "1 x tile and 2 unit tiles". */
function factorTiles(f: Factor): string {
	const parts = [f.x ? tiles(f.x, 'x') : '', f.unit ? tiles(f.unit, 'unit') : ''].filter(Boolean);
	return parts.join(' and ') || 'no tiles';
}
const signWord = (n: number) => (n < 0 ? 'negative' : 'positive');

// --- Solve ---

/** The equation once x is alone: k x on one side, u on the other (k > 0). */
function isolated(eq: Equation) {
	const a = at(eq.left, 1), c = at(eq.right, 1), b = at(eq.left, 0), d = at(eq.right, 0);
	// x stays in the pan with more x tiles, so it stays positive.
	const xLeft = a >= c;
	const k = Math.abs(a - c);
	const u = xLeft ? d - b : b - d;
	return { a, b, c, d, xLeft, k, u, xPan: xLeft ? 'left' : 'right', otherPan: xLeft ? 'right' : 'left' };
}

function solveHints(step: HintStep, eq: Equation, live: boolean): string[] {
	const pan = live ? 'pan' : 'side';
	const i = isolated(eq);
	if (step === 'balance') {
		const out = [
			`Goal: the x tiles alone in one ${pan}, the unit tiles in the other. Whatever you add to or take from one ${pan}, do the same to the other${live ? ', so the balance stays level' : ''}.`
		];
		const moves: string[] = [];
		const sq = at(eq.left, 2);
		if (sq) moves.push(`take the ${tiles(sq, 'x2')} off both ${pan}s`);
		// x tiles on the side x leaves: cancel them on both sides with their opposites.
		const xOff = i.xLeft ? i.c : i.a;
		if (xOff) moves.push(`put ${tiles(-xOff, 'x')} in both ${pan}s, then zero out the zero pairs`);
		const unitsOff = i.xLeft ? i.b : i.d;
		if (unitsOff) moves.push(`put ${tiles(-unitsOff, 'unit')} in both ${pan}s, then zero out the zero pairs`);
		if (moves.length)
			out.push(
				`Here: ${moves.join('; then ')}. Use Flip in the toolbar to get red tiles, and select a pair to zero it out.`
			);
		out.push(
			`When it’s done, the ${i.xPan} ${pan} holds ${tiles(i.k, 'x')} and the ${i.otherPan} ${pan} holds ${i.u === 0 ? 'nothing' : tiles(i.u, 'unit')}. Then press Check.`
		);
		return out;
	}
	if (step === 'divide') {
		const share = i.u / i.k;
		return [
			`Share the unit tiles out equally: one box for each x tile, and the same number in every box.`,
			`There are ${tiles(i.u, 'unit')} to share between ${plural(i.k, 'x tile')}. ${Math.abs(i.u)} ÷ ${i.k} = ?`,
			`Put ${tiles(share, 'unit')} in each box, beside its x tile.`
		];
	}
	// answer
	return [
		`Look at one box: one x tile is worth the unit tiles beside it.`,
		`Count the tiles in one box. They are ${signWord(eq.solution)}, so x is ${eq.solution < 0 ? 'negative' : 'positive'}.`,
		`Type the number of tiles in one box${eq.solution < 0 ? ', with a − in front' : ''}.`
	];
}

// --- Multiply and Factor ---

function rectangleCounts(b: Built) {
	const [f, g] = b.factors;
	return { x2: f.x * g.x, xs: [f.x * g.unit, g.x * f.unit], units: f.unit * g.unit };
}

function builtHints(step: HintStep, b: Built): string[] {
	const [top, left] = b.factors;
	const c = rectangleCounts(b);
	const inside = [
		c.x2 ? tiles(c.x2, 'x2') : '',
		...c.xs.filter(Boolean).map((n) => tiles(n, 'x')),
		c.units ? tiles(c.units, 'unit') : ''
	].filter(Boolean);
	const product = productText(b.factors).replace(/-/g, '−').replace(/\^2/g, '²');
	const poly = formatPoly(b.poly);
	if (step === 'sides') {
		if (b.type === 'multiply')
			return [
				`Build each factor on a side of the T: one along the top, one down the left side.`,
				`Along the top: ${factorTiles(top)}. Down the left: ${factorTiles(left)}.`,
				`Push the tiles up against the T, starting right at its corner, with no gaps.`
			];
		return [
			`Read the sides off your rectangle: the tiles along its top edge and down its left edge.`,
			`Along the top, match the rectangle’s columns: ${factorTiles(top)}. Down the left, match its rows: ${factorTiles(left)}.`,
			`Each side tile is as long as the column or row it sits beside. Line them up against the T.`
		];
	}
	if (step === 'rectangle') {
		if (b.type === 'multiply')
			return [
				`Fill the inside of the T. Each tile is as wide as the side tile above its column and as tall as the side tile beside its row.`,
				`x times x makes an x² tile, x times 1 makes an x tile, 1 times 1 makes a unit tile. Same signs make a positive tile, different signs a red negative one.`,
				`Inside the T you need ${inside.join(', ')}.`
			];
		return [
			`Make one rectangle from all the tiles, right in the corner of the T, with no gaps.`,
			`Put the x² ${Math.abs(c.x2) === 1 ? 'tile' : 'tiles'} in the corner. Unit tiles go in the opposite corner, and x tiles fill the edges between them.`,
			`It works as ${product}: its rectangle holds ${inside.join(', ')}.${
				c.xs[0] * c.xs[1] < 0
					? ' That’s more x tiles than you were given: add zero pairs (an x tile and a red −x tile) to get them.'
					: ''
			}`
		];
	}
	if (step === 'groups')
		return [
			`Sort the tiles from the rectangle into groups of the same kind: x² tiles, x tiles, unit tiles.`,
			`A positive and a negative tile of the same kind make a zero pair. Zero them out.`,
			`When it’s done, the groups show ${poly}.`
		];
	// equation
	return b.type === 'multiply'
		? [
				`Write what you found: the factors on one side of the =, the tiles you grouped on the other.`,
				`Count each group: the x² tiles, the x tiles and the unit tiles.`,
				`It starts ${product} = …`
			]
		: [
				`Write what you found: the polynomial on one side of the =, the sides of your rectangle multiplied on the other.`,
				`Read each side of the T as a factor, in brackets, then write them next to each other.`,
				`It starts ${poly} = (…)(…)`
			];
}

/** The hints for the step a student is on, easiest first. */
export function hintsFor(step: HintStep, problem: Built | Equation, live = true): string[] {
	return problem.type === 'solve' ? solveHints(step, problem, live) : builtHints(step, problem);
}
