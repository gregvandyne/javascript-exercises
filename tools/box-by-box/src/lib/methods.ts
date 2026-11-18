// The Big Divide: the other ways to work a problem, chosen per activity (the standard algorithms stay the default and
// keep their own sheets in logic.ts). Division: the ladder (partial quotients) and the area model (box method), where
// the student picks how many of the divisor to take away each time, so any sensible path is right. Multiplication: the
// area model and partial products, where each factor is broken into its place-value parts.
// The work is a list of number fields, worked out again from what the student has typed (a ladder grows a rung when the
// last difference still holds the divisor). No platform calls and no DOM here, so it runs as it is in Node too.

import type { Kind, Problem, Values } from './logic';

export type Method = 'standard' | 'ladder' | 'area' | 'partial';
export const METHOD_NAMES: Method[] = ['standard', 'ladder', 'area', 'partial'];

export type MethodInfo = {
	name: Method;
	/** Its name in the editor, the player and the activity's label. */
	label: string;
	/** One line for the teacher, under the choice. */
	about: string;
	/** For a student: what to do, in order (the player's start screen, the About page). */
	steps: string[];
};

export const METHODS: Record<Kind, MethodInfo[]> = {
	divide: [
		{
			name: 'standard',
			label: 'Standard',
			about: 'Long division: divide, multiply, subtract and bring down, one digit at a time.',
			steps: []
		},
		{
			name: 'ladder',
			label: 'Ladder',
			about: 'Partial quotients: take away friendly groups of the divisor (×100, ×10, ×5 …) down a ladder, then add them up.',
			steps: [
				'Pick how many groups of the divisor to take away, like 100, 10, 5 or 2. Write it on the side.',
				'Multiply to see how much that is, and write it under what’s left.',
				'Subtract. Keep going down the ladder until what’s left is smaller than the divisor.',
				'Add the numbers on the side: that’s the quotient. What’s left at the bottom is the remainder.'
			]
		},
		{
			name: 'area',
			label: 'Area model',
			about: 'Box method: fill sections of a rectangle with the divisor on the side, then add the section widths.',
			steps: [
				'The divisor goes on the side of a rectangle, and the number to divide goes inside.',
				'Pick a width for a section, like 100, 10 or 5, and write it on top. Multiply it by the divisor and take it away.',
				'Start a new section with what’s left, until it’s smaller than the divisor.',
				'Add the widths on top: that’s the quotient. What’s left in the last section is the remainder.'
			]
		}
	],
	multiply: [
		{
			name: 'standard',
			label: 'Standard',
			about: 'The standard algorithm: multiply each digit, carry, and add the rows.',
			steps: []
		},
		{
			name: 'area',
			label: 'Area model',
			about: 'Break both numbers into place-value parts, like (40 + 6) × (20 + 3), fill each box of a rectangle, then add the boxes.',
			steps: [
				'Break both numbers into their place values: 46 is 40 + 6, and 23 is 20 + 3.',
				'Each box of the rectangle is one part times another. Multiply to fill it.',
				'Add all the boxes together: that’s the answer.'
			]
		},
		{
			name: 'partial',
			label: 'Partial products',
			about: 'List each place-value product down the page (3 × 6, 3 × 40, 20 × 6, 20 × 40), then add the list.',
			steps: [
				'Multiply each place of the bottom number by each place of the top number, starting with the ones.',
				'Write each product on its own line, lined up on the right.',
				'Add all the lines together: that’s the answer.'
			]
		}
	]
};

export const methodsFor = (kind: Kind): MethodInfo[] => METHODS[kind];
export const methodInfo = (kind: Kind, m: Method): MethodInfo => METHODS[kind].find((x) => x.name === m) ?? METHODS[kind][0];
/** The method as kept (in a save or a link): one of this kind's, else the standard algorithm. */
export const methodOr = (kind: Kind, raw: unknown): Method => (METHODS[kind].some((x) => x.name === raw) ? (raw as Method) : 'standard');

// --- numbers ---

const len = (n: number) => String(n).length;
/** "0035" -> "35", "" stays "". */
export const norm = (s: string) => (s === '' ? '' : s.replace(/^0+(?=\d)/, ''));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const countBy = (n: number, times: number) => Array.from({ length: times }, (_, i) => n * (i + 1)).join(', ');
/** The trailing zeros of a number: 400 -> 2. */
const zerosOf = (n: number) => {
	let z = 0;
	while (n >= 10 && n % 10 === 0) {
		n /= 10;
		z++;
	}
	return z;
};
/** A number's place-value parts, biggest first: 406 -> [400, 6]. */
export function placeParts(n: number): number[] {
	const d = [...String(n)].map(Number);
	return d.map((x, i) => x * 10 ** (d.length - 1 - i)).filter((x) => x > 0);
}

// --- division: the ladder and the area model ---

/** The most rungs (or sections) one problem may take: past this, a choice must finish it. */
export const MAX_RUNGS = 10;

/** Why a partial quotient doesn't work, or null when it does: none typed, 0, more than what's left, or (on the last
 *  rung allowed) too small to finish. */
export function chooseCheck(left: number, divisor: number, q: number, last = false): null | 'zero' | 'over' | 'short' {
	if (!Number.isInteger(q) || q < 1) return 'zero';
	if (q * divisor > left) return 'over';
	if (last && left - q * divisor >= divisor) return 'short';
	return null;
}
export function chooseNudge(left: number, divisor: number, q: number, last = false): string | null {
	switch (chooseCheck(left, divisor, q, last)) {
		case 'zero':
			return `Take away at least one ${divisor}.`;
		case 'over':
			return `${q} × ${divisor} = ${q * divisor}, more than ${left}. Try a smaller number.`;
		case 'short':
			return `That leaves ${left - q * divisor}, and this is the last step. Take away more.`;
		default:
			return null;
	}
}
/** The biggest "one digit and zeros" number of divisors that fits: 945 ÷ 7 -> 100, 245 ÷ 7 -> 30. */
export function placeValueMultiple(left: number, divisor: number): number {
	const most = Math.floor(left / divisor);
	if (most < 1) return 0;
	const p = 10 ** (len(most) - 1);
	return Math.floor(most / p) * p;
}
/** The biggest of 1000, 100, 10, 5, 2, 1 (as many as needed) that fits: a friendly one to suggest. */
export function friendlyMultiple(left: number, divisor: number): number {
	const most = Math.floor(left / divisor);
	for (const p of [100000, 10000, 1000, 100, 10, 5, 2, 1]) if (p <= most) return p;
	return 0;
}
/** One sensible path down the ladder (Watch, and the answer shown after two tries): the greatest place-value multiple
 *  each time, which is the standard algorithm's digits. */
export function watchPath(dividend: number, divisor: number): number[] {
	const out: number[] = [];
	let left = dividend;
	while (left >= divisor && out.length < MAX_RUNGS) {
		const q = placeValueMultiple(left, divisor);
		out.push(q);
		left -= q * divisor;
	}
	return out;
}
/** Count up's partial quotients: 1, 2, 5, 10, 20, 50, 100 …, up to the first that is too many (so ▲ can show it). */
/** The place-value chunks that fit, up to the biggest (68 ÷ 2: 10, 20, 30), at most the last three: the widths to
 *  suggest for an area model's section. */
export function placeChunks(left: number, divisor: number): number[] {
	const pv = placeValueMultiple(left, divisor);
	if (pv < 1) return [];
	const p = 10 ** (len(pv) - 1);
	return Array.from({ length: pv / p }, (_, k) => (k + 1) * p).slice(-3);
}
const orList = (xs: number[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}` : String(xs[0] ?? ''));
/** The area model's advice (not a mistake) on a first section that takes the whole quotient at once (68 ÷ 2: 34) when
 *  it has more than one place: the classroom model splits it into place-value sections (30, then 4). Null otherwise. */
export function wholeChunkAdvice(dividend: number, divisor: number, q: number): string | null {
	const most = Math.floor(dividend / divisor);
	if (q !== most || placeValueMultiple(dividend, divisor) === most) return null;
	return `${q} × ${divisor} = ${q * divisor} works, but the area model splits it into sections. Try a friendly chunk like ${orList(placeChunks(dividend, divisor))} first, or press Next to keep ${q}.`;
}

export function friendlySteps(left: number, divisor: number): number[] {
	const out: number[] = [];
	for (let p = 1; p <= 1e6; p *= 10)
		for (const x of [1, 2, 5]) {
			out.push(x * p);
			if (x * p * divisor > left) return out;
		}
	return out;
}

export type LadderCheck = { right: boolean; wrong: string[]; closed: boolean; quotient: number; remainder: number };
/** A whole ladder, checked: each rung must take away a whole number (at least 1) of divisors, no more than is left; each
 *  product and difference must be worked out right; it must go on until less than the divisor is left; and the quotient
 *  and remainder must be right. Any path that does so is right. qs, products, diffs are what was typed, rung by rung. */
export function checkLadder(dividend: number, divisor: number, qs: string[], products: string[], diffs: string[], quotient: string, remainder: string): LadderCheck {
	const wrong: string[] = [];
	let left = dividend;
	let closed = false;
	const n = qs.length;
	for (let i = 0; i < n; i++) {
		const q = Number(qs[i]);
		if (qs[i] === '' || chooseCheck(left, divisor, q, i === MAX_RUNGS - 1)) {
			wrong.push(`q${i}`);
			break;
		}
		if (Number(products[i]) !== q * divisor || products[i] === '' || products[i] === undefined) wrong.push(`p${i}`);
		const diff = left - q * divisor;
		if (diffs[i] === '' || diffs[i] === undefined || Number(diffs[i]) !== diff) wrong.push(`r${i}`);
		left = diff;
		if (left < divisor) {
			closed = i === n - 1;
			break;
		}
	}
	const Q = Math.floor(dividend / divisor);
	const R = dividend % divisor;
	if (quotient === '' || Number(quotient) !== Q) wrong.push('quotient');
	if (remainder === '' || Number(remainder) !== R) wrong.push('remainder');
	return { right: closed && wrong.length === 0, wrong, closed, quotient: Q, remainder: R };
}

// --- multiplication: the area model and partial products ---

export type PartProduct = { id: string; top: number; bottom: number; value: number };
/** The area model's boxes, row by row (a row for each part of the bottom number, a column for each part of the top). */
export function areaCells(top: number, bottom: number): PartProduct[][] {
	return placeParts(bottom).map((b, i) => placeParts(top).map((t, j) => ({ id: `c${i}_${j}`, top: t, bottom: b, value: t * b })));
}
/** Partial products, in the order they're written: each place of the bottom number (ones first) times each place of the
 *  top number (ones first). */
export function partialProducts(top: number, bottom: number): PartProduct[] {
	const out: PartProduct[] = [];
	const bs = placeParts(bottom).reverse();
	const ts = placeParts(top).reverse();
	bs.forEach((b, i) => ts.forEach((t, j) => out.push({ id: `pp${i}_${j}`, top: t, bottom: b, value: t * b })));
	return out;
}
/** The parts add up to the product (they always do: checked in the tests). */
export const partsTotal = (ps: PartProduct[]) => ps.reduce((s, p) => s + p.value, 0);

// --- the work: the fields to fill, in order, from what has been typed ---

export type Role = 'choice' | 'product' | 'difference' | 'cell' | 'sum' | 'quotient' | 'remainder';
export type Field = {
	id: string;
	/** How many squares it takes. */
	len: number;
	role: Role;
	/** What it must be (from what was typed before it), or null when the student chooses (a partial quotient) or it
	 *  can't be known yet (a product after a choice that doesn't work). */
	expect: string | null;
	/** A choice: null when it works, else why not (Guided says so at once; Check marks it). */
	nudge?: (v: string) => string | null;
	/** A choice that works but isn't the method's way (an area model's one section for all of it): Guided says so once,
	 *  and Next keeps it. */
	advice?: (v: string) => string | null;
	/** The question Guided asks, the line said when the page writes it, and up to three hints. */
	prompt: string;
	told: string;
	hints: string[];
	/** The keys to keep at full strength while it is worked (the spotlight). */
	lit: string[];
	/** Count up: choose a partial quotient with ▲ ▼, skip-count a product (by, times, then the zeros), or the page writes it. */
	countUp?: { choose: { left: number; divisor: number; last: boolean } } | { skip: { by: number; times: number; zeros: number; value: number } } | { auto: true };
};
export type Rung = { q: string; p: string; r: string; left: number; leftKey: string };
export type Work =
	| {
			method: 'ladder' | 'area';
			kind: 'divide';
			title: string;
			answer: string;
			fields: Field[];
			closed: boolean;
			dividend: number;
			divisor: number;
			rungs: Rung[];
	  }
	| { method: 'area'; kind: 'multiply'; title: string; answer: string; fields: Field[]; closed: true; top: number; bottom: number; cells: PartProduct[][]; sum: string | null }
	| { method: 'partial'; kind: 'multiply'; title: string; answer: string; fields: Field[]; closed: true; top: number; bottom: number; rows: PartProduct[]; sum: string | null };

const has = (v: Values, id: string) => !!v[id];

function divisionWork(method: 'ladder' | 'area', dividend: number, divisor: number, v: Values): Work {
	const Q = Math.floor(dividend / divisor);
	const R = dividend % divisor;
	const fields: Field[] = [];
	const rungs: Rung[] = [];
	const side = method === 'ladder' ? 'on the side' : 'on top';
	let left = dividend;
	let closed = false;
	const qs: number[] = [];
	for (let i = 0; i < MAX_RUNGS; i++) {
		const last = i === MAX_RUNGS - 1;
		const qId = `q${i}`;
		const pId = `p${i}`;
		const rId = `r${i}`;
		const leftKey = i === 0 ? 'dividend' : `r${i - 1}`;
		rungs.push({ q: qId, p: pId, r: rId, left, leftKey });
		const pv = placeValueMultiple(left, divisor);
		const fr = friendlyMultiple(left, divisor);
		const fits = [1000, 100, 10, 5, 2].filter((x) => x * divisor <= left);
		const thisLeft = left;
		const chunks = placeChunks(left, divisor);
		const pvCore = pv / 10 ** zerosOf(pv);
		fields.push({
			id: qId,
			len: Math.max(1, len(Q)),
			role: 'choice',
			expect: null,
			nudge: (s) => (s === '' ? null : chooseNudge(thisLeft, divisor, Number(s), last)),
			prompt: last
				? `This is the last step: how many ${divisor}s can you take away from ${left}? Take away as many as you can.`
				: method === 'area'
					? `How wide is this section? Pick how many ${divisor}s to take from ${left}.${chunks.length ? ` A place-value chunk like ${orList(chunks)} works well.` : ''}`
					: `How many ${divisor}s will you take away from ${left}?${fits.length ? ` A friendly number like ${fits.slice(0, 2).join(' or ')} is easy.` : ''}`,
			told:
				method === 'area'
					? `Make a section ${pv} wide: ${pv} × ${divisor} = ${pv * divisor} fits in ${left}. Write ${pv} on top.`
					: `Take away ${pv} ${pv === 1 ? 'group' : 'groups'} of ${divisor}. Write ${pv} ${side}.`,
			hints: [
				`Take away a friendly number of ${divisor}s, no more than ${thisLeft}: groups of 10 or 100 are the easiest to multiply.${i > 0 ? ' Any number that fits is fine.' : ''}`,
				pv >= 10
					? `Think in place values: ${pvCore} × ${divisor} = ${pvCore * divisor}, so ${pv} × ${divisor} = ${pv * divisor}, and that isn’t more than ${thisLeft}. So ${pv} fits.`
					: fr > 1
						? `${fr} × ${divisor} = ${fr * divisor}, and that isn’t more than ${thisLeft}, so ${fr} fits.${fr * 2 * divisor <= thisLeft ? ` Even ${fr * 2} × ${divisor} = ${fr * 2 * divisor} fits.` : ''}`
						: `${divisor} goes into ${thisLeft} just ${plural(Math.floor(thisLeft / divisor), 'time', 'times')}.`,
				`Try ${pv}: ${pv} × ${divisor} = ${pv * divisor}, the most you can take away with one digit and zeros. Write ${pv}.`
			],
			advice: method === 'area' && i === 0 ? (s) => (s === '' ? null : wholeChunkAdvice(dividend, divisor, Number(s))) : undefined,
			lit: [leftKey, 'divisor', qId],
			countUp: { choose: { left, divisor, last } }
		});
		const qs_ = v[qId] ?? '';
		const q = Number(qs_);
		const ok = qs_ !== '' && chooseCheck(left, divisor, q, last) === null;
		const product = q * divisor;
		const diff = left - product;
		const zq = zerosOf(q);
		const core = q / 10 ** zq;
		fields.push({
			id: pId,
			len: len(left),
			role: 'product',
			expect: qs_ !== '' && q >= 1 && product <= left ? String(product) : null,
			prompt: method === 'area' ? `The section’s area: what is ${qs_ || '?'} × ${divisor}?` : `What is ${qs_ || '?'} × ${divisor}?`,
			told: `${qs_ || pv} × ${divisor} = ${qs_ ? product : pv * divisor}.`,
			hints: [
				`Multiply the number you wrote ${side} by ${divisor}.`,
				zq > 0
					? `Work out ${core} × ${divisor} = ${core * divisor}, then put the ${plural(zq, 'zero', 'zeros')} back on.`
					: q >= 1 && q <= 10
						? `Count by ${divisor}s, ${plural(q, 'time', 'times')}: ${countBy(divisor, q)}.`
						: `Break ${q} into parts: ${placeParts(q).map((x) => `${x} × ${divisor} = ${x * divisor}`).join(', ')}. Then add them.`,
				`It’s ${product}.`
			],
			lit: [qId, 'divisor', pId],
			countUp: { auto: true }
		});
		fields.push({
			id: rId,
			len: len(left),
			role: 'difference',
			expect: ok ? String(diff) : null,
			prompt: `What is ${left} − ${v[pId] || product}?`,
			told: `${left} − ${product} = ${diff}.${diff < divisor ? ` ${diff} is less than ${divisor}, so you’re done taking away.` : ''}`,
			hints: [
				`Subtract: take ${v[pId] || product} away from ${left}.`,
				`Subtract one column at a time, starting with the ones. Regroup when the top digit is smaller.`,
				`It’s ${diff}.`
			],
			lit: [leftKey, pId, rId]
		});
		if (qs_ !== '') qs.push(q);
		const typed = v[rId] ?? '';
		// the next rung: once the difference is written and still holds the divisor
		if (typed === '' || Number(typed) < divisor || last) {
			closed = typed !== '' && (Number(typed) < divisor || last);
			break;
		}
		left = ok ? diff : Number(typed);
	}
	const sumText = qs.length ? qs.join(' + ') : '';
	fields.push({
		id: 'quotient',
		len: Math.max(1, len(Q)),
		role: 'quotient',
		expect: String(Q),
		prompt: `Add the numbers ${side}${sumText && qs.length > 1 ? `: ${sumText}` : ''}. What’s the quotient?`,
		told: `${qs.length > 1 ? `${sumText} = ${Q}` : `The quotient is ${Q}`}.`,
		hints: [
			`The quotient is how many ${divisor}s you took away in all: add up the numbers ${side}.`,
			qs.length > 1 ? `${sumText}: add them one at a time.` : `There’s just the one number ${side}.`,
			`It’s ${Q}.`
		],
		lit: [...rungs.map((r) => r.q), 'quotient']
	});
	const lastR = rungs.at(-1)!.r;
	fields.push({
		id: 'remainder',
		len: Math.max(1, len(divisor - 1)),
		role: 'remainder',
		expect: String(R),
		prompt: `What’s left ${method === 'ladder' ? 'at the bottom' : 'in the last section'} is the remainder. What is it?`,
		told: R ? `${R} is left over: the remainder is ${R}.` : `Nothing is left over: the remainder is 0.`,
		hints: [`The remainder is what’s left at the end, less than ${divisor}.`, `Copy the last number you got when you subtracted.`, `It’s ${R}.`],
		lit: [lastR, 'remainder']
	});
	return {
		method,
		kind: 'divide',
		title: `${dividend} ÷ ${divisor}`,
		answer: `${Q} R ${R}`,
		fields,
		closed,
		dividend,
		divisor,
		rungs
	};
}

/** The words for a part's product: the area model says top × side (40 × 20), partial products bottom × top (3 × 40). */
export const partText = (p: PartProduct, role: 'cell' | 'product') => (role === 'cell' ? `${p.top} × ${p.bottom}` : `${p.bottom} × ${p.top}`);
function partField(p: PartProduct, role: 'cell' | 'product', where: string): Field {
	const a = p.top / 10 ** zerosOf(p.top);
	const b = p.bottom / 10 ** zerosOf(p.bottom);
	const zeros = zerosOf(p.top) + zerosOf(p.bottom);
	const t = partText(p, role);
	return {
		id: p.id,
		len: len(p.value),
		role,
		expect: String(p.value),
		prompt: `What is ${t}?`,
		told: `${t} = ${p.value}.`,
		hints: [
			`Multiply ${where}: ${t}.`,
			zeros > 0
				? `${a} × ${b} = ${a * b}. Then put on ${plural(zeros, 'zero', 'zeros')}, one for each zero in ${p.top} and ${p.bottom}.`
				: `Count by ${a}s, ${plural(b, 'time', 'times')}: ${countBy(a, b)}.`,
			`It’s ${p.value}.`
		],
		lit: [`top${p.top}`, `bottom${p.bottom}`, p.id],
		countUp: { skip: { by: a, times: b, zeros, value: p.value } }
	};
}
function sumField(parts: PartProduct[], v: Values, total: number, what: string): Field {
	const list = parts.map((p) => v[p.id] || String(p.value));
	return {
		id: 'sum',
		len: len(total),
		role: 'sum',
		expect: String(total),
		prompt: `Add ${what}: ${list.join(' + ')}.`,
		told: `${list.join(' + ')} = ${total}.`,
		hints: [
			`Add up ${what}.`,
			`Line them up on the right and add one column at a time, starting with the ones. Carry when a column makes 10 or more.`,
			`It’s ${total}.`
		],
		lit: [...parts.map((p) => p.id), 'sum']
	};
}

/** The work for a problem by a method (not the standard one), from what has been typed so far. */
export function buildWork(method: Method, kind: Kind, [a, b]: Problem, v: Values = {}): Work {
	if (kind === 'divide') return divisionWork(method === 'area' ? 'area' : 'ladder', a, b, v);
	const product = a * b;
	if (method === 'partial') {
		const rows = partialProducts(a, b);
		const fields = rows.map((p) => partField(p, 'product', 'this place of the bottom number by this place of the top'));
		const one = rows.length === 1;
		if (!one) fields.push(sumField(rows, v, product, 'all the lines'));
		return { method: 'partial', kind: 'multiply', title: `${a} × ${b}`, answer: String(product), fields, closed: true, top: a, bottom: b, rows, sum: one ? null : 'sum' };
	}
	const cells = areaCells(a, b);
	const flat = cells.flat();
	const fields = flat.map((p) => partField(p, 'cell', 'the part on top by the part on the side'));
	const one = flat.length === 1;
	if (!one) fields.push(sumField(flat, v, product, 'all the boxes'));
	return { method: 'area', kind: 'multiply', title: `${a} × ${b}`, answer: String(product), fields, closed: true, top: a, bottom: b, cells, sum: one ? null : 'sum' };
}

/** Whether what's typed in a field is wrong (empty is not wrong): a choice that doesn't work, or not what it must be. */
export function fieldWrong(f: Field, v: Values): boolean {
	const s = v[f.id] ?? '';
	if (!s) return false;
	if (f.role === 'choice') return !!f.nudge?.(s);
	return f.expect !== null && norm(s) !== f.expect;
}
/** Which typed digits are wrong, lined up on the right with what it must be (for a choice: all, when it doesn't work). */
export function wrongDigits(f: Field, s: string): boolean[] {
	if (!s) return [];
	if (f.role === 'choice') return [...s].map(() => !!f.nudge?.(s));
	if (f.expect === null || norm(s) === f.expect) return [...s].map(() => false);
	const e = f.expect;
	// the k-th digit from the right against the k-th digit from the right
	return [...s].map((ch, i) => ch !== e[e.length - (s.length - i)]);
}
export const allFilled = (w: Work, v: Values) => w.closed && w.fields.every((f) => has(v, f.id));
export const allRight = (w: Work, v: Values) => allFilled(w, v) && w.fields.every((f) => !fieldWrong(f, v) && (f.role === 'choice' || f.expect !== null));

/** The whole work done one sensible way (Watch, and the answer shown after the second try). */
export function watchValues(method: Method, kind: Kind, p: Problem): Values {
	const v: Values = {};
	if (kind === 'divide') {
		const [dividend, divisor] = p;
		let left = dividend;
		watchPath(dividend, divisor).forEach((q, i) => {
			v[`q${i}`] = String(q);
			v[`p${i}`] = String(q * divisor);
			left -= q * divisor;
			v[`r${i}`] = String(left);
		});
		v.quotient = String(Math.floor(dividend / divisor));
		v.remainder = String(dividend % divisor);
		return v;
	}
	for (const f of buildWork(method, kind, p).fields) if (f.expect) v[f.id] = f.expect;
	return v;
}
/** The ladder as typed, checked as a whole (the same rules as the fields, from what was typed). */
export function checkWork(w: Work, v: Values): { right: boolean; wrong: string[] } {
	if (w.kind === 'divide') {
		const n = w.rungs.length;
		const at = (k: string) => Array.from({ length: n }, (_, i) => v[`${k}${i}`] ?? '');
		const c = checkLadder(w.dividend, w.divisor, at('q'), at('p'), at('r'), v.quotient ?? '', v.remainder ?? '');
		return { right: c.right, wrong: c.wrong };
	}
	const wrong = w.fields.filter((f) => !has(v, f.id) || fieldWrong(f, v)).map((f) => f.id);
	return { right: wrong.length === 0, wrong };
}

/** About how many squares wide the work is laid out (Work.svelte), so the player can size its squares to fit. */
export function workWidth(w: Work): number {
	if (w.kind === 'divide') {
		const N = len(w.dividend);
		// the area model: a section side by side for each chunk (as many as the place-value path takes, or as typed)
		return w.method === 'ladder'
			? len(w.divisor) + N + 1 + Math.max(1, len(Math.floor(w.dividend / w.divisor)))
			: len(w.divisor) + Math.max(2, w.rungs.length, watchPath(w.dividend, w.divisor).length) * (N + 1);
	}
	if (w.method === 'area') return len(w.bottom) + 1 + w.cells[0].reduce((s, _, j) => s + Math.max(...w.cells.map((r) => len(r[j].value))) + 0.5, 0);
	return len(w.top * w.bottom) + 1 + 3.5;
}
