// The Big Divide: the other ways to work a problem, chosen per activity (the standard algorithms stay the default and
// keep their own sheets in logic.ts). Division: the ladder (partial quotients) and the area model (box method), where
// the student picks how many of the divisor to take away each time, so any sensible path is right. Multiplication: the
// area model and partial products, where each factor is broken into its place-value parts.
// The work is a list of number fields, worked out again from what the student has typed (a ladder grows a rung when the
// last difference still holds the divisor). No platform calls and no DOM here, so it runs as it is in Node too.

import type { Kind, Problem, RemainderForm, Values } from './logic';
import { m as ln, orList, t, tn, tx, type Msg } from './i18n.ts';
import { asText, placesOf, scaled } from './numbers.ts';

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

const STEPS: Record<string, number> = { 'divide.ladder': 4, 'divide.area': 4, 'multiply.area': 3, 'multiply.partial': 3 };
const info = (kind: Kind, name: Method): MethodInfo => ({
	name,
	label: t(`ui.method.${name}`),
	about: t(`ui.method.${kind}.${name}`),
	steps: Array.from({ length: STEPS[`${kind}.${name}`] ?? 0 }, (_, i) => t(`ui.method.${kind}.${name}.${i + 1}`))
});
export const METHODS: Record<Kind, MethodInfo[]> = {
	add: [info('add', 'standard')],
	subtract: [info('subtract', 'standard')],
	divide: [info('divide', 'standard'), info('divide', 'ladder'), info('divide', 'area')],
	multiply: [info('multiply', 'standard'), info('multiply', 'area'), info('multiply', 'partial')]
};

export const methodsFor = (kind: Kind): MethodInfo[] => METHODS[kind];
export const methodInfo = (kind: Kind, m: Method): MethodInfo => METHODS[kind].find((x) => x.name === m) ?? METHODS[kind][0];
/** The method as kept (in a save or a link): one of this kind's, else the standard algorithm. */
export const methodOr = (kind: Kind, raw: unknown): Method => (METHODS[kind].some((x) => x.name === raw) ? (raw as Method) : 'standard');

// --- numbers ---

const len = (n: number) => String(n).length;
/** "0035" -> "35", "" stays "". */
export const norm = (s: string) => (s === '' ? '' : s.replace(/^0+(?=\d)/, ''));
const countBy = (n: number, times: number) => Array.from({ length: times }, (_, i) => n * (i + 1)).join(', ');
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
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

// --- decimals in the work ---

/** How the numbers in a piece of work are written and read back. k = 0: whole numbers. k = 2 (the area model with
 *  decimals, 7.5 ÷ 3): the work is done in whole hundredths (750 ÷ 3), so every rule and check is the whole-number one,
 *  and each number is shown and typed as a decimal ("2", "0.5", "1.5"; a typed "0.50" or ".5" is the same number). */
export type Nums = { k: number; show: (n: number) => string; read: (s: string) => number };
const trimZeros = (s: string) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
/** A decimal as written with as few places as it needs: 2.50 -> "2.5", 3.00 -> "3". */
export const decText = (n: number, k: number) => trimZeros(asText(n, k));
export const nums = (k: number): Nums =>
	k
		? {
				k,
				show: (n) => (Number.isFinite(n) ? decText(n, k) : '?'),
				read: (s) => (/^(\d+\.?\d*|\.\d+)$/.test(s) && placesOf(Number(s)) <= k ? scaled(Number(s), k) : NaN)
			}
		: { k: 0, show: (n) => String(n), read: (s) => Number(s) };
const WHOLE = nums(0);

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
export function chooseNudgeMsg(left: number, divisor: number, q: number, last = false, f: Nums = WHOLE): Msg | null {
	switch (chooseCheck(left, divisor, q, last)) {
		case 'zero':
			return ln(f.k ? 'q.lad.atLeastSome' : 'q.lad.atLeastOne', { d: divisor });
		case 'over':
			return ln('q.lad.over', { q: f.show(q), d: divisor, x: f.show(q * divisor), l: f.show(left) });
		case 'short':
			return ln('q.lad.short', { x: f.show(left - q * divisor) });
		default:
			return null;
	}
}
export function chooseNudge(left: number, divisor: number, q: number, last = false, f: Nums = WHOLE): string | null {
	const n = chooseNudgeMsg(left, divisor, q, last, f);
	return n ? tx(n) : null;
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
/** The area model's advice (not a mistake) on a first section that takes the whole quotient at once (68 ÷ 2: 34) when
 *  it has more than one place: the classroom model splits it into place-value sections (30, then 4). Null otherwise. */
export function wholeChunkAdviceMsg(dividend: number, divisor: number, q: number, f: Nums = WHOLE): Msg | null {
	const most = Math.floor(dividend / divisor);
	if (q !== most || placeValueMultiple(dividend, divisor) === most) return null;
	return ln('q.area.advice', { q: f.show(q), d: divisor, x: f.show(q * divisor), list: orList(placeChunks(dividend, divisor).map(f.show)) });
}
export function wholeChunkAdvice(dividend: number, divisor: number, q: number, f: Nums = WHOLE): string | null {
	const a = wholeChunkAdviceMsg(dividend, divisor, q, f);
	return a ? tx(a) : null;
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
export function checkLadder(dividend: number, divisor: number, qs: string[], products: string[], diffs: string[], quotient: string, remainder: string, f: Nums = WHOLE): LadderCheck {
	const wrong: string[] = [];
	let left = dividend;
	let closed = false;
	const n = qs.length;
	for (let i = 0; i < n; i++) {
		const q = f.read(qs[i]);
		if (qs[i] === '' || chooseCheck(left, divisor, q, i === MAX_RUNGS - 1)) {
			wrong.push(`q${i}`);
			break;
		}
		if (f.read(products[i]) !== q * divisor || products[i] === '' || products[i] === undefined) wrong.push(`p${i}`);
		const diff = left - q * divisor;
		if (diffs[i] === '' || diffs[i] === undefined || f.read(diffs[i]) !== diff) wrong.push(`r${i}`);
		left = diff;
		if (left < divisor) {
			closed = i === n - 1;
			break;
		}
	}
	const Q = Math.floor(dividend / divisor);
	const R = dividend % divisor;
	if (quotient === '' || f.read(quotient) !== Q) wrong.push('quotient');
	if (remainder === '' || f.read(remainder) !== R) wrong.push('remainder');
	return { right: closed && wrong.length === 0, wrong, closed, quotient: Q, remainder: R };
}

// --- multiplication: the area model and partial products ---

/** A part times a part. With decimals the parts and the product are also written out (2.3 × 1.4: 0.3 × 0.4 = 0.12),
 *  worked from whole numbers so no floating point creeps in: tk, bk, k are the decimal places of each. */
export type PartProduct = { id: string; top: number; bottom: number; value: number; text?: { top: string; bottom: string; value: string; places: number } };
/** A number's place-value parts, as whole numbers of 10^-k, with the places it is written with: 2.3 -> [20, 3], 1. */
function decParts(x: number) {
	const k = placesOf(x);
	return { k, parts: placeParts(scaled(x, k)) };
}
/** The area model's boxes, row by row (a row for each part of the bottom number, a column for each part of the top).
 *  Decimals split by place value too: 2.3 is 2 + 0.3. */
export function areaCells(top: number, bottom: number): PartProduct[][] {
	if (placesOf(top) || placesOf(bottom)) {
		const T = decParts(top);
		const B = decParts(bottom);
		const k = T.k + B.k;
		return B.parts.map((b, i) =>
			T.parts.map((tp, j) => {
				const text = { top: decText(tp, T.k), bottom: decText(b, B.k), value: decText(tp * b, k), places: k };
				return { id: `c${i}_${j}`, top: Number(text.top), bottom: Number(text.bottom), value: Number(text.value), text };
			})
		);
	}
	return placeParts(bottom).map((b, i) => placeParts(top).map((t, j) => ({ id: `c${i}_${j}`, top: t, bottom: b, value: t * b })));
}
/** The product of two decimals, written out exactly: 2.3 × 1.4 -> "3.22". */
export const decProduct = (a: number, b: number) => decText(scaled(a, placesOf(a)) * scaled(b, placesOf(b)), placesOf(a) + placesOf(b));
/** How a part or a total is written: its text with decimals, else the number. */
export const partValue = (p: PartProduct) => p.text?.value ?? String(p.value);
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

export type Role = 'choice' | 'product' | 'difference' | 'cell' | 'sum' | 'quotient' | 'remainder' | 'denominator';
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
	nudgeSay?: (v: string) => Msg | null;
	/** A fraction's part: any part of a fraction equal to the remainder over the divisor is right (simplifying is up
	 *  to the student), so this says whether what's typed is, in place of expect. */
	accept?: (v: string) => boolean;
	/** A choice that works but isn't the method's way (an area model's one section for all of it): Guided says so once,
	 *  and Next keeps it. */
	advice?: (v: string) => string | null;
	adviceSay?: (v: string) => Msg | null;
	/** The question Guided asks, the line said when the page writes it, and up to three hints. */
	prompt: string;
	told: string;
	/** The question and that line as lines of the table (the speaker button reads them). */
	ask?: Msg[];
	tell?: Msg[];
	hints: string[];
	/** The keys to keep at full strength while it is worked (the spotlight). */
	lit: string[];
	/** Count up: choose a partial quotient with ▲ ▼, skip-count a product (by, times, then the zeros), or the page writes it. */
	countUp?:
		| { choose: { left: number; divisor: number; last: boolean; f: Nums } }
		| { skip: { by: number; times: number; zeros: number; places?: number; value: number | string } }
		| { auto: true };
	/** Typed with a decimal point (the area model with decimals). */
	point?: boolean;
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
			/** (in whole hundredths with decimals: f.k is 2) */
			dividend: number;
			divisor: number;
			rungs: Rung[];
			/** The remainder as a fraction (beside the quotient), not as R. */
			fraction?: boolean;
			/** How its numbers are written (decimals: no remainder; the problems come out by hundredths). */
			f: Nums;
	  }
	| { method: 'area'; kind: 'multiply'; title: string; answer: string; fields: Field[]; closed: true; top: number; bottom: number; cells: PartProduct[][]; sum: string | null }
	| { method: 'partial'; kind: 'multiply'; title: string; answer: string; fields: Field[]; closed: true; top: number; bottom: number; rows: PartProduct[]; sum: string | null };

const has = (v: Values, id: string) => !!v[id];
const lines = (x: Msg | Msg[]) => (Array.isArray(x) ? x : [x]);
/** A field's question and told line, from lines of the table. */
const words = (ask: Msg | Msg[], tell: Msg | Msg[]) => ({ prompt: tx(ask), ask: lines(ask), told: tx(tell), tell: lines(tell) });

function divisionWork(method: 'ladder' | 'area', given: number, divisor: number, v: Values, form: RemainderForm = 'R'): Work {
	// decimals (the area model: a decimal divided by a whole number, coming out by hundredths): worked in hundredths
	const f = nums(form === 'decimal' && method === 'area' ? 2 : 0);
	const S = f.show;
	const rd = f.read;
	const dividend = f.k ? scaled(given, f.k) : given;
	/** How many squares a number up to n takes, written as this work writes it (with decimals: up to hundredths). */
	const width = (n: number) => (f.k ? len(Math.floor(n / 10 ** f.k)) + 1 + f.k : len(n));
	const Q = Math.floor(dividend / divisor);
	const R = dividend % divisor;
	const fields: Field[] = [];
	const rungs: Rung[] = [];
	const on = method === 'ladder' ? 'Side' : 'Top';
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
			len: Math.max(1, width(Q)),
			role: 'choice',
			expect: null,
			nudge: (s) => (s === '' ? null : chooseNudge(thisLeft, divisor, rd(s), last, f)),
			nudgeSay: (s) => (s === '' ? null : chooseNudgeMsg(thisLeft, divisor, rd(s), last, f)),
			...words(
				last
					? ln('q.lad.last', { d: divisor, l: S(left) })
					: method === 'area'
						? [ln('q.area.howWide', { d: divisor, l: S(left) }), ...(chunks.length ? [ln('q.area.chunk', { list: orList(chunks.map(S)) })] : [])]
						: [ln('q.lad.howMany', { d: divisor, l: left }), ...(fits.length ? [ln('q.lad.friendly', { list: orList(fits.slice(0, 2)) })] : [])],
				method === 'area' ? ln('q.area.told', { q: S(pv), d: divisor, x: S(pv * divisor), l: S(left) }) : ln('q.lad.told', { d: divisor }, pv)
			),
			hints: [
				tx([ln(f.k ? 'h.lad.choose1dec' : 'h.lad.choose1', { d: divisor, l: S(thisLeft) }), ...(i > 0 ? [ln('h.lad.anyFits')] : [])]),
				pv >= 10 || (f.k && pv > 0)
					? t('h.lad.choose2pv', { c: pvCore, d: divisor, x: pvCore * divisor, q: S(pv), y: S(pv * divisor), l: S(thisLeft) })
					: fr > 1
						? tx([ln('h.lad.choose2fr', { q: fr, d: divisor, x: fr * divisor, l: thisLeft }), ...(fr * 2 * divisor <= thisLeft ? [ln('h.lad.even', { q: fr * 2, d: divisor, x: fr * 2 * divisor })] : [])])
						: tn('h.lad.choose2one', Math.floor(thisLeft / divisor), { d: divisor, l: thisLeft }),
				t('h.lad.choose3', { q: S(pv), d: divisor, x: S(pv * divisor) })
			],
			advice: method === 'area' && i === 0 ? (s) => (s === '' ? null : wholeChunkAdvice(dividend, divisor, rd(s), f)) : undefined,
			adviceSay: method === 'area' && i === 0 ? (s) => (s === '' ? null : wholeChunkAdviceMsg(dividend, divisor, rd(s), f)) : undefined,
			lit: [leftKey, 'divisor', qId],
			countUp: { choose: { left, divisor, last, f } },
			...(f.k ? { point: true } : {})
		});
		const qs_ = v[qId] ?? '';
		const q = rd(qs_);
		const ok = qs_ !== '' && chooseCheck(left, divisor, q, last) === null;
		const product = q * divisor;
		const diff = left - product;
		const zq = zerosOf(q);
		const core = q / 10 ** zq;
		const pt = f.k ? { point: true } : {};
		fields.push({
			id: pId,
			len: width(left),
			role: 'product',
			expect: qs_ !== '' && q >= 1 && product <= left ? S(product) : null,
			...words(
				ln(method === 'area' ? 'q.area.area' : 'q.whatIsTimes', { a: qs_ || '?', b: divisor }),
				ln('q.eq', { a: qs_ || S(pv), b: divisor, x: S(qs_ ? product : pv * divisor) })
			),
			hints: [
				t(`h.lad.product1${on}`, { d: divisor }),
				f.k
					? t('h.lad.product2dec', { c: core, d: divisor, x: core * divisor, q: S(q), y: S(product) })
					: zq > 0
						? tn('h.lad.product2zeros', zq, { c: core, d: divisor, x: core * divisor })
						: q >= 1 && q <= 10
							? tn('h.lad.product2count', q, { d: divisor, list: countBy(divisor, q) })
							: t('h.lad.product2parts', { q, parts: placeParts(q).map((x) => `${x} × ${divisor} = ${x * divisor}`).join(', ') }),
				t('h.its', { x: S(product) })
			],
			lit: [qId, 'divisor', pId],
			countUp: { auto: true },
			...pt
		});
		fields.push({
			id: rId,
			len: width(left),
			role: 'difference',
			expect: ok ? S(diff) : null,
			...words(ln('q.whatIsMinus', { a: S(left), b: v[pId] || S(product) }), [
				ln('q.sub.diffTold', { a: S(left), b: S(product), x: S(diff) }),
				...(diff < divisor ? [f.k ? ln('q.lad.doneDec') : ln('q.lad.done', { x: diff, d: divisor })] : [])
			]),
			hints: [t('h.lad.diff1', { a: S(left), b: v[pId] || S(product) }), t(f.k ? 'h.lad.diff2dec' : 'h.lad.diff2'), t('h.its', { x: S(diff) })],
			lit: [leftKey, pId, rId],
			...pt
		});
		if (qs_ !== '') qs.push(q);
		const typed = v[rId] ?? '';
		// the next rung: once the difference is written and still holds the divisor
		if (typed === '' || rd(typed) < divisor || last) {
			closed = typed !== '' && (rd(typed) < divisor || last);
			break;
		}
		left = ok ? diff : rd(typed);
	}
	const sumText = qs.length ? qs.map(S).join(' + ') : '';
	fields.push({
		id: 'quotient',
		len: Math.max(1, width(Q)),
		role: 'quotient',
		expect: S(Q),
		...words(
			ln(sumText && qs.length > 1 ? `q.lad.add${on}List` : `q.lad.add${on}`, { xs: sumText }),
			qs.length > 1 ? ln('q.col.sumIs', { xs: sumText, s: S(Q) }) : ln('q.lad.quotientIs', { q: S(Q) })
		),
		hints: [t(`h.lad.quot1${on}`, { d: divisor }), qs.length > 1 ? t('h.lad.quot2', { xs: sumText }) : t(`h.lad.quot2one${on}`), t('h.its', { x: S(Q) })],
		lit: [...rungs.map((r) => r.q), 'quotient'],
		...(f.k ? { point: true } : {})
	});
	const lastR = rungs.at(-1)!.r;
	const title = `${given} ÷ ${divisor}`;
	// decimals come out by hundredths: nothing left over, so no remainder to write; a number may be typed with more
	// zeros than it needs (0.50 for 0.5)
	if (f.k) {
		for (const x of fields) if (x.role !== 'choice' && x.expect !== null) x.accept = sameNumber(x.expect);
		return { method, kind: 'divide', title, answer: S(Q), fields, closed, dividend, divisor, rungs, f };
	}
	if (form === 'fraction') {
		// the remainder over the divisor, beside the quotient (nothing left over: no fraction)
		if (R > 0) {
			const g = gcd(R, divisor);
			const simpler = g > 1 ? [ln('q.simplify', { r: R, d: divisor, rs: R / g, ds: divisor / g })] : [];
			const numOk = (s: string) => s !== '' && rd(s) >= 1 && rd(s) <= R && (rd(s) * divisor) % R === 0;
			fields.push({
				id: 'remainder',
				len: len(R),
				role: 'remainder',
				expect: String(R),
				accept: numOk,
				...words(ln(`q.lad.fracTop${method === 'ladder' ? 'Ladder' : 'Area'}`, { r: R }), ln('q.frac.topTold', { r: R })),
				hints: [t('h.lad.fracTop1'), t('h.lad.copyLast'), t('h.its', { x: R })],
				lit: [lastR, 'remainder']
			});
			const n = rd(v.remainder ?? '');
			fields.push({
				id: 'den',
				len: len(divisor),
				role: 'denominator',
				expect: String(divisor),
				accept: (s) => numOk(v.remainder ?? '') && s !== '' && rd(s) >= 1 && n * divisor === R * rd(s),
				...words([ln('q.frac.bottom'), ...simpler], [ln('q.frac.bottomTold', { d: divisor, q: Q, r: R }), ...simpler]),
				hints: [t('h.frac.bottom1'), tx([ln('h.its', { x: divisor }), ...simpler])],
				lit: ['divisor', 'den']
			});
		}
		return {
			method,
			kind: 'divide',
			title,
			answer: R ? `${Q} ${R}/${divisor}` : String(Q),
			fields,
			closed,
			dividend,
			divisor,
			rungs,
			fraction: true,
			f
		};
	}
	fields.push({
		id: 'remainder',
		len: Math.max(1, len(divisor - 1)),
		role: 'remainder',
		expect: String(R),
		...words(ln(`q.lad.rem${method === 'ladder' ? 'Ladder' : 'Area'}`), R ? ln('q.lad.remTold', { r: R }) : ln('q.lad.remNone')),
		hints: [t('h.lad.rem1', { d: divisor }), t('h.lad.copyLast'), t('h.its', { x: R })],
		lit: [lastR, 'remainder']
	});
	return {
		method,
		kind: 'divide',
		title,
		answer: `${Q} R ${R}`,
		fields,
		closed,
		dividend,
		divisor,
		rungs,
		f
	};
}

/** The words for a part's product: the area model says top × side (40 × 20), partial products bottom × top (3 × 40). */
export const partText = (p: PartProduct, role: 'cell' | 'product') =>
	role === 'cell' ? `${p.text?.top ?? p.top} × ${p.text?.bottom ?? p.bottom}` : `${p.text?.bottom ?? p.bottom} × ${p.text?.top ?? p.top}`;
/** The same number, however it is typed: "0.30" or ".3" for 0.3 (a decimal field), else the digits as they are. */
const sameNumber = (want: string) => (s: string) => s !== '' && /^(\d+\.?\d*|\.\d+)$/.test(s) && Number(s) === Number(want);
function partField(p: PartProduct, role: 'cell' | 'product', where: string): Field {
	// a part is one digit and a power of ten: 40 is 4 and a zero, 0.3 is 3 and a decimal place
	const digitOf = (x: string) => Number(x.replace('.', '').replace(/^0+/, '').replace(/0+$/, '') || '0');
	const shift = (x: string) => (x.includes('.') ? -(x.length - x.indexOf('.') - 1) : String(Number(x)).length - String(digitOf(x)).length);
	const ts = p.text?.top ?? String(p.top);
	const bs = p.text?.bottom ?? String(p.bottom);
	const a = digitOf(ts);
	const b = digitOf(bs);
	const e10 = shift(ts) + shift(bs);
	const zeros = Math.max(0, e10);
	const places = Math.max(0, -e10);
	const e = partText(p, role);
	const value = partValue(p);
	return {
		id: p.id,
		len: value.length,
		role,
		expect: value,
		...(p.text ? { accept: sameNumber(value), point: true } : {}),
		...words(ln('q.part.whatIs', { e }), ln('q.part.is', { e, x: value })),
		hints: [
			t(`h.part.mul1.${where}`, { e }),
			places > 0
				? tn('h.part.mul2places', places, { a, b, x: a * b, y: value })
				: zeros > 0
					? tn('h.part.mul2zeros', zeros, { a, b, x: a * b, t: ts, s: bs })
					: tn('h.part.mul2count', b, { a, list: countBy(a, b) }),
			t('h.its', { x: value })
		],
		lit: [`top${p.top}`, `bottom${p.bottom}`, p.id],
		countUp: { skip: { by: a, times: b, zeros, ...(places ? { places } : {}), value: p.text ? value : p.value } }
	};
}
function sumField(parts: PartProduct[], v: Values, total: string, what: string, point: boolean): Field {
	const list = parts.map((p) => v[p.id] || partValue(p));
	return {
		id: 'sum',
		len: total.length,
		role: 'sum',
		expect: total,
		...(point ? { accept: sameNumber(total), point: true } : {}),
		...words(ln(`q.part.add.${what}`, { xs: list.join(' + ') }), ln('q.col.sumIs', { xs: list.join(' + '), s: total })),
		hints: [t(`h.part.add1.${what}`), t(point ? 'h.part.add2dec' : 'h.part.add2'), t('h.its', { x: total })],
		lit: [...parts.map((p) => p.id), 'sum']
	};
}

/** The work for a problem by a method (not the standard one), from what has been typed so far. */
export function buildWork(method: Method, kind: Kind, [a, b]: Problem, v: Values = {}, form: RemainderForm = 'R'): Work {
	if (kind === 'divide') return divisionWork(method === 'area' ? 'area' : 'ladder', a, b, v, form);
	const dec = !!(placesOf(a) || placesOf(b));
	const product = dec ? decProduct(a, b) : String(a * b);
	if (method === 'partial') {
		const rows = partialProducts(a, b);
		const fields = rows.map((p) => partField(p, 'product', 'partial'));
		const one = rows.length === 1;
		if (!one) fields.push(sumField(rows, v, product, 'lines', false));
		return { method: 'partial', kind: 'multiply', title: `${a} × ${b}`, answer: product, fields, closed: true, top: a, bottom: b, rows, sum: one ? null : 'sum' };
	}
	const cells = areaCells(a, b);
	const flat = cells.flat();
	const fields = flat.map((p) => partField(p, 'cell', 'area'));
	const one = flat.length === 1;
	if (!one) fields.push(sumField(flat, v, product, 'boxes', dec));
	return { method: 'area', kind: 'multiply', title: `${a} × ${b}`, answer: product, fields, closed: true, top: a, bottom: b, cells, sum: one ? null : 'sum' };
}

/** Whether what's typed in a field is wrong (empty is not wrong): a choice that doesn't work, or not what it must be. */
export function fieldWrong(f: Field, v: Values): boolean {
	const s = v[f.id] ?? '';
	if (!s) return false;
	if (f.role === 'choice') return !!f.nudge?.(s);
	if (f.accept) return !f.accept(norm(s));
	return f.expect !== null && norm(s) !== f.expect;
}
/** Which typed digits are wrong, lined up on the right with what it must be (for a choice: all, when it doesn't work). */
export function wrongDigits(f: Field, s: string): boolean[] {
	if (!s) return [];
	if (f.role === 'choice') return [...s].map(() => !!f.nudge?.(s));
	if (f.accept?.(norm(s))) return [...s].map(() => false);
	if (f.expect === null || norm(s) === f.expect) return [...s].map(() => false);
	const e = f.expect;
	// the k-th digit from the right against the k-th digit from the right
	return [...s].map((ch, i) => ch !== e[e.length - (s.length - i)]);
}
export const allFilled = (w: Work, v: Values) => w.closed && w.fields.every((f) => has(v, f.id));
export const allRight = (w: Work, v: Values) => allFilled(w, v) && w.fields.every((f) => !fieldWrong(f, v) && (f.role === 'choice' || f.expect !== null));

/** The whole work done one sensible way (Watch, and the answer shown after the second try). */
export function watchValues(method: Method, kind: Kind, p: Problem, form: RemainderForm = 'R'): Values {
	const v: Values = {};
	if (kind === 'divide') {
		const { f, dividend, divisor } = buildWork(method, kind, p, {}, form) as Extract<Work, { kind: 'divide' }>;
		let left = dividend;
		watchPath(dividend, divisor).forEach((q, i) => {
			v[`q${i}`] = f.show(q);
			v[`p${i}`] = f.show(q * divisor);
			left -= q * divisor;
			v[`r${i}`] = f.show(left);
		});
		v.quotient = f.show(Math.floor(dividend / divisor));
		if (f.k) return v;
		v.remainder = String(dividend % divisor);
		if (form === 'fraction') {
			if (dividend % divisor) v.den = String(divisor);
			else delete v.remainder;
		}
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
		if (w.fraction) {
			// the ladder as R (what's left must be right), then the fraction's own parts, either of them simplified
			const R = w.dividend % w.divisor;
			const c = checkLadder(w.dividend, w.divisor, at('q'), at('p'), at('r'), v.quotient ?? '', String(R), w.f);
			const parts = w.fields.filter((f) => f.role === 'remainder' || f.role === 'denominator');
			const wrong = [...c.wrong.filter((x) => x !== 'remainder'), ...parts.filter((f) => !has(v, f.id) || fieldWrong(f, v)).map((f) => f.id)];
			return { right: c.closed && wrong.length === 0, wrong };
		}
		// (decimals come out by hundredths: nothing is left, and there is no remainder to write)
		const c = checkLadder(w.dividend, w.divisor, at('q'), at('p'), at('r'), v.quotient ?? '', w.f.k ? '0' : (v.remainder ?? ''), w.f);
		return { right: c.right, wrong: c.wrong };
	}
	const wrong = w.fields.filter((f) => !has(v, f.id) || fieldWrong(f, v)).map((f) => f.id);
	return { right: wrong.length === 0, wrong };
}

/** About how many squares wide the work is laid out (Work.svelte), so the player can size its squares to fit. */
export function workWidth(w: Work): number {
	if (w.kind === 'divide') {
		const N = w.f.show(w.dividend).length + (w.f.k ? 1 : 0);
		// the area model: a section side by side for each chunk (as many as the place-value path takes, or as typed)
		const frac = w.fraction ? len(w.divisor) * 2 + 2 : 0;
		return w.method === 'ladder'
			? len(w.divisor) + N + 1 + Math.max(1, len(Math.floor(w.dividend / w.divisor))) + frac
			: Math.max(len(w.divisor) + Math.max(2, w.rungs.length, watchPath(w.dividend, w.divisor).length) * (N + 1), 8 + frac);
	}
	if (w.method === 'area') return len(w.bottom) + 1 + w.cells[0].reduce((s, _, j) => s + Math.max(...w.cells.map((r) => partValue(r[j]).length)) + 0.5, 0);
	return w.answer.length + 1 + 3.5;
}
