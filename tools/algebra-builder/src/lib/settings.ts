// What tiles an activity starts with, set by the teacher and carried in the
// link as `start`.

import type { Built, Equation, Poly } from './algebra';
import { lenPx, size, type Kind, type Sign, type Tile } from './mat';

/** Every tile the student needs, or none. */
export type Start = 'all' | 'none';

export const STARTS: { value: Start; name: string; about: string }[] = [
	{
		value: 'all',
		name: 'All the tiles they need',
		about: 'Ready to arrange, zero pairs included.'
	},
	{ value: 'none', name: 'No tiles', about: 'Students bring out every tile from the tray.' }
];

/** The start a link asks for. Anything else, like the `positive` older links
 *  carry, starts with all the tiles. */
export const readStart = (value: string | null): Start =>
	STARTS.find((s) => s.value === value)?.value ?? 'all';

export interface Pile {
	kind: Kind;
	sign: Sign;
	n: number;
}

/** The tiles of the problem's rectangle, by kind and sign: (x + 2)(x − 3)
 *  has one x², two x, three −x and six −1. */
export function rectangleTiles(problem: Built): Pile[] {
	const [f, g] = problem.factors;
	return piles([
		...signed('x2', f.x * g.x),
		...signed('x', f.x * g.unit),
		...signed('x', f.unit * g.x),
		...signed('unit', f.unit * g.unit)
	]);
}

/** The tiles a student starts with, beside the mat. Multiply's are the tiles
 *  for both sides as well as the rectangle's. */
export function startingPiles(problem: Built, start: Start): Pile[] {
	if (start === 'none') return [];
	const rect = rectangleTiles(problem);
	const sides = problem.factors.flatMap((f) => [...signed('x', f.x), ...signed('unit', f.unit)]);
	return problem.type === 'factor' ? rect : piles([...sides, ...rect]);
}

/** Solve: the tiles a student starts with in each pan, left and right: each
 *  side of the equation, or nothing. */
export function panPiles(problem: Equation, start: Start): [Pile[], Pile[]] {
	const side = (p: Poly): Pile[] => {
		if (start === 'none') return [];
		return piles([
			...signed('x2', p[2] ?? 0),
			...signed('x', p[1] ?? 0),
			...signed('unit', p[0] ?? 0)
		]);
	};
	return [side(problem.left), side(problem.right)];
}

const signed = (kind: Kind, n: number): Pile[] =>
	n ? [{ kind, sign: Math.sign(n) as Sign, n: Math.abs(n) }] : [];

/** Add up piles of the same kind and sign, in the order x², x, unit; positive first. */
function piles(all: Pile[]): Pile[] {
	const out: Pile[] = [];
	for (const kind of ['x2', 'x', 'unit'] as Kind[])
		for (const sign of [1, -1] as Sign[]) {
			const n = all.filter((p) => p.kind === kind && p.sign === sign).reduce((a, p) => a + p.n, 0);
			if (n) out.push({ kind, sign, n });
		}
	return out;
}

/** Piles of tiles laid out flush from (x, y), each pile starting a new row
 *  under the last, no row wider than `width`. `id` numbers each new tile. */
export function layPiles(
	all: Pile[],
	x: number,
	y: number,
	width: number,
	id: () => number
): Tile[] {
	const out: Tile[] = [];
	for (const { kind, sign, n } of all) {
		const w = lenPx(size(kind).w);
		const h = lenPx(size(kind).h);
		const perRow = Math.max(1, Math.floor(width / w));
		for (let i = 0; i < n; i++)
			out.push({
				id: id(),
				kind,
				sign,
				turned: false,
				x: x + (i % perRow) * w,
				y: y + Math.floor(i / perRow) * h,
				at: { x: null, y: null }
			});
		y += Math.ceil(n / perRow) * h;
	}
	return out;
}
