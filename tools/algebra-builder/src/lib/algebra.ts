// The algebra behind a problem: reading typed math with Mf, the
// polynomials it stands for, which problems tiles can build or solve, and
// whether a student's equation or answer is right. Everything here is in one variable, x, with
// whole-number coefficients, because that is what algebra tiles can show.

import {
	MfParser,
	IsErrorNodeTag,
	MissingNode,
	UnparseableNode,
	type TreeNode
} from '@oomba-mathfield/core';
import {
	AddNode,
	ComparisonNode,
	DecimalNode,
	ExponentNode,
	MultiplyNode,
	NegativeNode,
	PositiveNode,
	SubtractNode,
	VariableNode,
	equationParselets,
	textToDoc
} from '@oomba-mathfield/math';

/** A polynomial in x as its coefficients, lowest power first: [c, b, a] is ax² + bx + c. */
export type Poly = number[];

/** A factor laid out on a side: px + q, as x tiles and unit tiles. */
export interface Factor {
	x: number;
	unit: number;
}

export type Activity = 'multiply' | 'factor' | 'solve';

const parser = new MfParser(equationParselets());

/** Typed or linked text as Mf reads it. A few characters people paste or
 *  type on a phone (−, ², ·) become the plain ones Mf parses. */
export function parseText(text: string): TreeNode {
	const plain = text.replace(/[−–]/g, '-').replace(/²/g, '^2').replace(/[·×]/g, '*');
	return parser.parse(textToDoc(plain, { fractions: true }) as never);
}

/** Whether text has a bracket left open or closed twice. A math field always
 *  pairs its brackets, but text from a link may not, and Mf drops a lone one. */
function unbalanced(text: string): boolean {
	let depth = 0;
	for (const ch of text) {
		depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
		if (depth < 0) return true;
	}
	return depth !== 0;
}

/** Whether any part of a parsed expression is unfinished or unreadable. */
function hasErrors(node: TreeNode): boolean {
	for (const n of node.traverse()) {
		if (n instanceof MissingNode || n instanceof UnparseableNode || n.hasTag(IsErrorNodeTag))
			return true;
	}
	return false;
}

// --- polynomials ---

function trim(p: Poly): Poly {
	const out = [...p];
	while (out.length > 1 && out[out.length - 1] === 0) out.pop();
	return out.length ? out : [0];
}

export function add(a: Poly, b: Poly): Poly {
	return trim(
		Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0))
	);
}

export function scale(a: Poly, k: number): Poly {
	return trim(a.map((c) => c * k));
}

export function mul(a: Poly, b: Poly): Poly {
	const out: number[] = Array(a.length + b.length - 1).fill(0);
	a.forEach((ca, i) => b.forEach((cb, j) => (out[i + j] += ca * cb)));
	return trim(out);
}

export function degree(p: Poly): number {
	const t = trim(p);
	return t.length === 1 && t[0] === 0 ? -1 : t.length - 1;
}

export function polyEquals(a: Poly, b: Poly): boolean {
	const ta = trim(a);
	const tb = trim(b);
	return ta.length === tb.length && ta.every((c, i) => c === tb[i]);
}

export const factorPoly = (f: Factor): Poly => trim([f.unit, f.x]);

/** Why an expression isn't a polynomial in x with whole-number coefficients. */
class NotAPolynomial extends Error {}

/** The polynomial an expression stands for, or an error saying why it isn't one. */
export function toPoly(node: TreeNode): Poly {
	if (node instanceof DecimalNode) {
		const v = node.toFloat();
		if (!Number.isInteger(v)) throw new NotAPolynomial('Use whole numbers only.');
		return [v];
	}
	if (node instanceof VariableNode) {
		if (node.name !== 'x') throw new NotAPolynomial(`Use x as the letter, not ${node.name}.`);
		return [0, 1];
	}
	if (node instanceof AddNode) return node.addends.map(toPoly).reduce(add, [0]);
	if (node instanceof SubtractNode)
		return add(toPoly(node.minuend), scale(toPoly(node.subtrahend), -1));
	if (node instanceof NegativeNode) return scale(toPoly(node.child), -1);
	if (node instanceof PositiveNode) return toPoly(node.child);
	if (node instanceof MultiplyNode) return node.factors.map(toPoly).reduce(mul, [1]);
	if (node instanceof ExponentNode) {
		const power = toPoly(node.power);
		if (degree(power) > 0 || power[0] < 0)
			throw new NotAPolynomial('Powers have to be whole numbers, like x^2.');
		let out: Poly = [1];
		for (let i = 0; i < power[0]; i++) out = mul(out, toPoly(node.base));
		return out;
	}
	throw new NotAPolynomial('Algebra tiles can only show +, − and multiplying.');
}

// --- reading problems ---

/** A Multiply or Factor problem a teacher typed, read as tiles see it. Either
 *  form can be typed for either activity: `given` is the form the student
 *  starts from (the factors to Multiply, the polynomial to Factor), as plain
 *  text, and `factors` is one way to build it. */
export interface Built {
	ok: true;
	type: 'multiply' | 'factor';
	factors: [Factor, Factor];
	poly: Poly;
	given: string;
}

/** A Solve problem: an equation in x, its two sides as polynomials, and the
 *  whole number x stands for. `given` is the equation as typed. */
export interface Equation {
	ok: true;
	type: 'solve';
	left: Poly;
	right: Poly;
	solution: number;
	given: string;
}

/** A problem a teacher typed, read as tiles see it, or why it can't be one. */
export type Problem = Built | Equation | { ok: false; reason: string };

/** The factors written in a product, as typed: (x+2)(x−3) is two, 2x(x+3)
 *  is three (2, x and x+3), and (x+1)^2 is two. */
function typedFactors(node: TreeNode): TreeNode[] {
	if (node instanceof MultiplyNode) return node.factors.flatMap(typedFactors);
	if (node instanceof NegativeNode) return [new DecimalNode('-1'), ...typedFactors(node.child)];
	if (node instanceof ExponentNode && node.power instanceof DecimalNode) {
		const n = node.power.toFloat();
		if (Number.isInteger(n) && n >= 1 && n <= 2) return Array(n).fill(node.base);
	}
	return [node];
}

/** A typed product read as the two sides of a rectangle. Single-term factors
 *  (numbers and x) are joined together first, so 2x(x+3) has sides 2x and
 *  x + 3; anything left over with more than two factors can't be one rectangle. */
function asTwoFactors(polys: Poly[]): [Factor, Factor] | null {
	if (polys.length < 2 || polys.some((p) => degree(p) > 1 || degree(p) < 0)) return null;
	let sides = polys;
	if (sides.length > 2) {
		const single = (p: Poly) => p.filter((c) => c !== 0).length === 1;
		sides = [polys.filter(single).reduce(mul, [1]), ...polys.filter((p) => !single(p))];
	}
	if (sides.length !== 2 || sides.some((p) => degree(p) > 1)) return null;
	const [a, b] = sides.map((p) => ({ x: p[1] ?? 0, unit: p[0] ?? 0 }));
	return [a, b];
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

/** The whole numbers that divide n, positive and negative. */
function divisors(n: number): number[] {
	const m = Math.abs(n);
	const ds: number[] = [];
	for (let d = 1; d <= m; d++) if (m % d === 0) ds.push(d, -d);
	return ds;
}

/** Every way to write a polynomial of degree 2 or less as two factors px + q
 *  with whole-number coefficients, or none. */
export function factorizations(poly: Poly): [Factor, Factor][] {
	const [c = 0, b = 0, a = 0] = poly;
	const out: [Factor, Factor][] = [];
	const push = (p: number, q: number, r: number, s: number) => {
		if ([q, r, s].every(Number.isInteger) && p * s + q * r === b && q * s === c)
			out.push([
				{ x: p, unit: q },
				{ x: r, unit: s }
			]);
	};
	// (px + q)(rx + s) = pr·x² + (ps + qr)·x + qs
	if (a !== 0) {
		for (const p of divisors(a)) {
			const r = a / p;
			if (c !== 0) for (const q of divisors(c)) push(p, q, r, c / q);
			else {
				push(p, 0, r, b / p);
				if (b !== 0) push(p, b / r, r, 0);
			}
		}
	} else if (degree(poly) >= 0) {
		// No x², so one side is all unit tiles: q times (rx + s).
		for (const q of divisors(gcd(b, c))) push(0, q, b / q, c / q);
	}
	return out;
}

/** Whether an expression is written as factors multiplied, rather than as a sum. */
function isProduct(node: TreeNode): boolean {
	if (node instanceof MultiplyNode) return true;
	if (node instanceof NegativeNode) return isProduct(node.child);
	return node instanceof ExponentNode && !(node.base instanceof VariableNode);
}

/** The factorization to show for a polynomial: positive leading terms where
 *  possible, and any number taken out in front, as in 2x(x + 3). */
function niceFactors(poly: Poly): [Factor, Factor] | null {
	const negative = (f: Factor) => (f.x !== 0 ? f.x < 0 : f.unit < 0);
	const content = (f: Factor) => gcd(f.x, f.unit);
	const one = (f: Factor) => f.x === 0 && Math.abs(f.unit) === 1;
	const score = (w: [Factor, Factor]) =>
		w.reduce(
			(n, f) =>
				n + (negative(f) ? 10 : 0) + (one(f) ? 3 : 0) + (f.x && f.unit && content(f) > 1 ? 1 : 0),
			0
		);
	const ways = factorizations(poly);
	return ways.length ? ways.reduce((best, w) => (score(w) < score(best) ? w : best)) : null;
}

/** A polynomial as plain text, the way it would be typed: x^2-x-6. */
export function polyText(p: Poly): string {
	return formatPoly(p).replace(/²/g, '^2').replace(/−/g, '-').replace(/\s+/g, '');
}

/** Two factors as plain text: (x+2)(x-3), or 2x(x+3) with a single term in front. */
export function productText(factors: [Factor, Factor]): string {
	const single = (f: Factor) => !f.x || !f.unit;
	const [a, b] = single(factors[1]) && !single(factors[0]) ? [factors[1], factors[0]] : factors;
	const text = (f: Factor) => polyText(factorPoly(f));
	return `${single(a) ? text(a) : `(${text(a)})`}(${text(b)})`;
}

/** Read what a teacher typed as a problem of one activity, or say why it
 *  can't be one. Multiply takes the factors or the polynomial they make;
 *  Factor takes the polynomial or its factors; Solve takes an equation. */
export function readProblem(type: Activity, text: string): Problem {
	if (type === 'solve') return readEquation(text);
	if (!text.trim()) return { ok: false, reason: 'Type a problem.' };
	const node = parseText(text);
	if (unbalanced(text) || hasErrors(node)) return { ok: false, reason: 'That isn’t finished yet.' };
	if (node instanceof ComparisonNode)
		return { ok: false, reason: 'Type just the expression, without an = sign.' };
	let poly: Poly;
	try {
		poly = toPoly(node);
	} catch (e) {
		if (e instanceof NotAPolynomial) return { ok: false, reason: e.message };
		throw e;
	}
	if (degree(poly) < 0) return { ok: false, reason: 'That’s zero, so there’s nothing to build.' };
	if (degree(poly) > 2)
		return { ok: false, reason: 'Tiles go up to x², so keep the highest power at 2.' };

	const typed = text.replace(/\s+/g, '');
	const product = isProduct(node);
	if (product) {
		const sides = asTwoFactors(typedFactors(node).map(toPoly));
		if (!sides)
			return {
				ok: false,
				reason: 'Write it as two factors multiplied, like (x + 2)(x − 3) or 2x(x + 3).'
			};
		return {
			ok: true,
			type,
			factors: sides,
			poly,
			given: type === 'multiply' ? typed : polyText(poly)
		};
	}
	const sides = niceFactors(poly);
	if (!sides)
		return {
			ok: false,
			reason: 'That doesn’t factor with whole numbers, so tiles can’t make a rectangle from it.'
		};
	// To multiply, there have to be two factors: x + 2 is only itself times 1.
	if (type === 'multiply' && sides.some((f) => f.x === 0 && Math.abs(f.unit) === 1))
		return {
			ok: false,
			reason: 'Write it as two factors multiplied, like (x + 2)(x − 3) or 2x(x + 3).'
		};
	return {
		ok: true,
		type,
		factors: sides,
		poly,
		given: type === 'multiply' ? productText(sides) : typed
	};
}

/** Solve: read an equation a teacher typed, or say why tiles can't solve it.
 *  It has to be linear in x with whole numbers, x on either side or both, and
 *  a whole-number answer. x² may appear only if it cancels between the sides,
 *  as in x² + 3x = x² + 6. Brackets are left to Multiply. */
export function readEquation(text: string): Problem {
	if (!text.trim()) return { ok: false, reason: 'Type an equation.' };
	const node = parseText(text);
	if (unbalanced(text) || hasErrors(node)) return { ok: false, reason: 'That isn’t finished yet.' };
	if (!(node instanceof ComparisonNode) || node.operators.length !== 1 || node.operators[0] !== '=')
		return { ok: false, reason: 'Type an equation, with one = sign, like 2x + 3 = 7.' };
	if (/[()]/.test(text))
		return {
			ok: false,
			reason: 'Leave out the parentheses: multiply them out first. Multiply is the activity for that.'
		};
	let left: Poly;
	let right: Poly;
	try {
		[left, right] = node.operands.map(toPoly);
	} catch (e) {
		if (e instanceof NotAPolynomial) return { ok: false, reason: e.message };
		throw e;
	}
	if (degree(left) > 2 || degree(right) > 2)
		return { ok: false, reason: 'Tiles go up to x², so keep the highest power at 2.' };
	if ((left[2] ?? 0) !== (right[2] ?? 0))
		return {
			ok: false,
			reason:
				'Tiles can’t solve that with x² in it. x² can only be there if it’s the same on both sides, like x^2 + 3x = x^2 + 6.'
		};
	// Everything moved to the left: bx + c = 0.
	const [c = 0, b = 0] = add(left, scale(right, -1));
	if (b === 0)
		return {
			ok: false,
			reason:
				c === 0
					? 'Every number is a solution to that, so there’s nothing to find.'
					: 'That has no solution: the x’s cancel out but the numbers don’t.'
		};
	const solution = -c / b || 0;
	if (!Number.isInteger(solution))
		return {
			ok: false,
			reason: 'x isn’t a whole number there, so the units can’t split evenly. Try one like 2x = 6.'
		};
	const alone = (p: Poly) => polyEquals(p, [0, 1]);
	const number = (p: Poly) => degree(p) <= 0;
	if ((alone(left) && number(right)) || (alone(right) && number(left)))
		return { ok: false, reason: 'That’s already solved: x is on its own.' };
	return { ok: true, type: 'solve', left, right, solution, given: text.replace(/\s+/g, '') };
}

// --- checking the student's equation ---

export type Verdict = { ok: true; note?: string } | { ok: false; message: string };

/** The terms of a sum as written, each with its sign: x² − x − 6 is [x², −x, −6]. */
function terms(node: TreeNode, sign = 1): { node: TreeNode; sign: number }[] {
	if (node instanceof AddNode) return node.addends.flatMap((a) => terms(a, sign));
	if (node instanceof SubtractNode)
		return [...terms(node.minuend, sign), ...terms(node.subtrahend, -sign)];
	return [{ node, sign }];
}

/** The power of x in a single written term like 3x², −x or 6, or null when the
 *  term is more than one number times a power of x. */
function termPower(node: TreeNode): number | null {
	if (node instanceof NegativeNode || node instanceof PositiveNode) return termPower(node.child);
	if (node instanceof DecimalNode) return 0;
	if (node instanceof VariableNode) return node.name === 'x' ? 1 : null;
	if (node instanceof ExponentNode)
		return node.base instanceof VariableNode && node.power instanceof DecimalNode
			? node.power.toFloat()
			: null;
	if (node instanceof MultiplyNode) {
		if (node.factors.length !== 2 || !(node.factors[0] instanceof DecimalNode)) return null;
		const p = termPower(node.factors[1]);
		return p && p > 0 ? p : null;
	}
	return null;
}

/** Whether a side is written as a simplified polynomial: like terms combined, no zero terms. */
function isSimplified(node: TreeNode): boolean {
	const seen = new Set<number>();
	for (const t of terms(node)) {
		const p = termPower(t.node);
		if (p === null || seen.has(p)) return false;
		if (polyEquals(toPoly(t.node), [0])) return false;
		seen.add(p);
	}
	return true;
}

/** Whether a side is written as factors whose product tiles could show. */
function isFactored(node: TreeNode): boolean {
	const factors = typedFactors(node);
	return factors.length >= 2 && factors.every((f) => degree(toPoly(f)) <= 1);
}

/** Check the equation a student typed for a problem: one side the product of
 *  factors, the other the simplified polynomial, either way round, both equal
 *  to the problem. */
export function checkEquation(problem: Built, text: string): Verdict {
	if (!text.trim()) return { ok: false, message: 'Type the whole equation, with an = sign.' };
	const node = parseText(text);
	if (unbalanced(text) || hasErrors(node))
		return { ok: false, message: 'That isn’t finished yet.' };
	if (!(node instanceof ComparisonNode) || node.operators.length !== 1 || node.operators[0] !== '=')
		return {
			ok: false,
			message: 'Write it as an equation, with one = sign between the two forms.'
		};
	const target = problem.poly;
	let polys: Poly[];
	try {
		polys = node.operands.map(toPoly);
	} catch (e) {
		if (e instanceof NotAPolynomial) return { ok: false, message: e.message };
		throw e;
	}
	const wrongSide = polys.findIndex((p) => !polyEquals(p, target));
	if (wrongSide >= 0)
		return {
			ok: false,
			message: `The ${wrongSide === 0 ? 'left' : 'right'} side isn’t equal to ${problem.type === 'multiply' ? 'the product' : 'the polynomial'}. Look at your tiles again.`
		};
	const [left, right] = node.operands;
	const factoredSide = isFactored(left) ? left : isFactored(right) ? right : null;
	if (!factoredSide)
		return {
			ok: false,
			message: 'One side should be the factors multiplied, like (x + 2)(x − 3).'
		};
	const other = factoredSide === left ? right : left;
	if (!isSimplified(other))
		return {
			ok: false,
			message: isFactored(other)
				? 'Both sides are factors. Write one side as the polynomial.'
				: 'That’s equal, but combine the like terms on the polynomial side.'
		};
	const leading = typedFactors(factoredSide)
		.map(toPoly)
		.filter((p) => degree(p) === 1);
	if (leading.length && leading.every((p) => p[1] < 0))
		return {
			ok: true,
			note: 'Correct. Most people would take the minus signs out of both factors.'
		};
	return { ok: true };
}

/** Solve: check the number a student typed after the printed x =. */
export function checkSolution(problem: Equation, text: string): Verdict {
	if (!text.trim()) return { ok: false, message: 'Type the number x stands for.' };
	if (text.includes('='))
		return { ok: false, message: 'Type just the number. The x = is already there.' };
	const node = parseText(text);
	if (unbalanced(text) || hasErrors(node))
		return { ok: false, message: 'That isn’t finished yet.' };
	let value: Poly;
	try {
		value = toPoly(node);
	} catch (e) {
		if (e instanceof NotAPolynomial) return { ok: false, message: e.message };
		throw e;
	}
	if (degree(value) > 0) return { ok: false, message: 'Type a number, without x in it.' };
	if (value[0] !== problem.solution)
		return {
			ok: false,
			message: 'That isn’t what x is. Count the unit tiles across from the x tile.'
		};
	return { ok: true };
}

/** What a polynomial comes to with x set to a number. */
export const evaluate = (p: Poly, x: number): number =>
	p.reduce((sum, c, i) => sum + c * x ** i, 0);

// --- writing math for people ---

/** A polynomial written out, like x² − x − 6. */
export function formatPoly(p: Poly): string {
	const parts: string[] = [];
	for (let i = p.length - 1; i >= 0; i--) {
		const c = p[i];
		if (!c) continue;
		const mag = Math.abs(c);
		const body = i === 0 ? `${mag}` : `${mag === 1 ? '' : mag}x${i === 2 ? '²' : ''}`;
		parts.push(parts.length ? `${c < 0 ? '−' : '+'} ${body}` : `${c < 0 ? '−' : ''}${body}`);
	}
	return parts.length ? parts.join(' ') : '0';
}

/** A factor written out, like x − 3 or 2x. */
export const formatFactor = (f: Factor): string => formatPoly(factorPoly(f));

/** Typed text dressed for reading: − for -, ² for ^2, and spaces around + and −. */
export function prettyText(text: string): string {
	return text
		.replace(/\s+/g, '')
		.replace(/\^2/g, '²')
		.replace(/\*/g, '·')
		.replace(/(?<=[\w)²])([+-])/g, ' $1 ')
		.replace(/=/g, ' = ')
		.replace(/-/g, '−');
}
