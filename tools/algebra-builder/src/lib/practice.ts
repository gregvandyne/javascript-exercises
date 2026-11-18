// Practising on my own (a student without a teacher's code): an activity and a level, then a fresh set of problems,
// made at random and never one this student has had lately. The problems they have had are kept in their game save
// (per activity and level, the last 200), so a new set, today or next week, on this device or another, is new.

import { mul, polyText, readProblem, type Activity, type Poly } from './algebra';
import { keep, load, type Item } from './oomba';

export type Level = 'easy' | 'medium' | 'hard';
export const LEVELS: { level: Level; name: string; about: Record<Activity, string> }[] = [
	{
		level: 'easy',
		name: 'Easy',
		about: {
			solve: 'One step or two, like 2x + 3 = 7. Positive numbers.',
			multiply: 'Two factors like (x + 2)(x + 3). Positive numbers.',
			factor: 'Polynomials like x² + 5x + 6. Positive numbers.'
		}
	},
	{
		level: 'medium',
		name: 'Medium',
		about: {
			solve: 'Negative numbers come in, like 3x − 4 = 8.',
			multiply: 'Negative numbers come in, like (x − 2)(x + 4).',
			factor: 'Negative numbers come in, like x² + x − 6.'
		}
	},
	{
		level: 'hard',
		name: 'Hard',
		about: {
			solve: 'x on both sides, like 5x − 2 = 2x + 7.',
			multiply: 'More than one x in a factor, like (2x + 1)(x − 3).',
			factor: 'An x² term bigger than 1, like 2x² − 5x − 3.'
		}
	}
];
export const SET_SIZE = 5;

const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const nonzero = (lo: number, hi: number) => {
	let n = 0;
	while (n === 0) n = rand(lo, hi);
	return n;
};
/** a x + b as a polynomial (lowest power first). */
const lin = (a: number, b: number): Poly => [b, a];

/** One problem as a teacher would type it, or null (try again). */
function make(activity: Activity, level: Level): string | null {
	if (activity === 'solve') {
		const x = level === 'easy' ? rand(1, 9) : nonzero(-6, 9);
		if (level === 'hard') {
			let a = rand(1, 5), c = rand(1, 5);
			if (a === c) return null;
			if (Math.random() < 0.5) [a, c] = [c, a];
			const b = rand(-9, 9), d = a * x + b - c * x;
			if (Math.abs(d) > 12 || b === 0 && d === 0) return null;
			return `${polyText(lin(a, b))}=${polyText(lin(c, d))}`;
		}
		const a = level === 'easy' ? rand(1, 3) : rand(2, 4);
		const b = level === 'easy' ? rand(0, 9) : nonzero(-9, 9);
		if (a === 1 && b === 0) return null; // x = c is already solved
		const c = a * x + b;
		if (c === 0 || Math.abs(c) > 25) return null;
		return `${polyText(lin(a, b))}=${c}`;
	}
	// Multiply and Factor: two factors p x + a and q x + b.
	let p = 1, q = 1, a: number, b: number;
	if (level === 'easy') {
		// Mostly (x + a)(x + b); sometimes x or 2x times (x + b), like x(x + 3) or 2x(x + 1).
		if (Math.random() < 0.3) {
			p = rand(1, 2);
			a = 0;
		} else a = rand(1, 6);
		b = rand(1, 6);
	} else if (level === 'medium') {
		a = nonzero(-6, 6);
		b = nonzero(-6, 6);
		if (a > 0 && b > 0) return null; // a negative somewhere: that's the point of Medium
	} else {
		p = rand(1, 2);
		q = rand(2, 3);
		a = nonzero(-4, 4);
		b = nonzero(-4, 4);
		if (p * q > 4) return null;
	}
	const f1 = lin(p, a), f2 = lin(q, b);
	const first = a === 0 ? polyText(f1) : `(${polyText(f1)})`; // x(x+2), not (x)(x+2)
	return activity === 'multiply' ? `${first}(${polyText(f2)})` : polyText(mul(f1, f2));
}

const SEEN = 'algebra-builder-seen-v1';
type Seen = Record<string, string[]>;

/** n new problems of one activity and level, none of them in `avoid` (unless there are too few left: then the ones
 *  had longest ago may come back) and no two the same. Each is one a teacher could type (readProblem accepts it). */
export function generate(activity: Activity, level: Level, n: number, avoid: Set<string> = new Set()): string[] {
	const out: string[] = [];
	for (let tries = 0; out.length < n && tries < 4000; tries++) {
		const text = make(activity, level);
		if (!text || out.includes(text)) continue;
		if (avoid.has(text) && tries < 3000) continue;
		if (!readProblem(activity, text).ok) continue;
		out.push(text);
	}
	return out;
}

/** A fresh set for a student practising alone: SET_SIZE problems of this activity and level, none they have had
 *  lately, and the ones they get are remembered in their save. */
export function practiceSet(activity: Activity, level: Level): Item[] {
	const key = `${activity}-${level}`;
	const seen = load<Seen>(SEEN) ?? {};
	const had: string[] = Array.isArray(seen[key]) ? seen[key] : [];
	const out = generate(activity, level, SET_SIZE, new Set(had));
	keep(SEEN, { ...seen, [key]: [...had.filter((t) => !out.includes(t)), ...out].slice(-200) });
	return out.map((p) => ({ a: activity, p, s: 'all', l: true }));
}
