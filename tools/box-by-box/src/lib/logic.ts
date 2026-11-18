// The Big Divide: the problems, the sheets they are worked on, their steps, checking, and making problem sets. No platform
// calls and no DOM here, so it runs as it is in Node too.

import { methodOr, type Method } from './methods.ts';
import { addSheet, checkColumns, subtractSheet } from './columns.ts';
import { asText, digitsOfText, isDecimal, placesOf, scaled, shiftPoint, unscaled } from './numbers.ts';
import { m as ln, orList, t, tn, tx, type Msg } from './i18n.ts';

export type Kind = 'divide' | 'multiply' | 'add' | 'subtract';
export const KIND_NAMES: Kind[] = ['divide', 'multiply', 'add', 'subtract'];
/** A kind as kept (in a save or a link): one of the four, else long division, as it always was. */
export const kindOr = (v: unknown): Kind => (KIND_NAMES.includes(v as Kind) ? (v as Kind) : 'divide');
export type Level = 'watch' | 'countUp' | 'guided' | 'prompted' | 'onMyOwn' | 'custom';
export type Problem = [number, number];
export type Values = Record<string, string>;

export type View = { top: number; left: number; bottom: number; right: number };
export type Cell =
	| {
			kind: 'given';
			row: number;
			col: number;
			text: string;
			key: string;
			step?: number;
			label?: boolean;
			faint?: boolean;
			/** A decimal point on the grid line after this square (multiplication keeps its digits lined up). */
			dot?: boolean;
			/** Drawn only once this box is right (a point placed, a zero in front of it); with when, once it holds that. */
			after?: string;
			when?: string;
			/** A small note in words (it may run to the left over empty squares). */
			note?: boolean;
			/** Crossed out once this box (the new digit written over it) is filled. */
			crossBy?: string;
			/** Set a little right, to leave room for a small regrouping 1 in the corner. */
			nudge?: boolean;
	  }
	| {
			kind: 'box';
			row: number;
			col: number;
			id: string;
			small?: boolean;
			/** A fraction's top or bottom: half a square. */
			half?: 'top' | 'bottom';
			/** A small 1 in the square's top left corner (regrouping: 2 becomes 12). */
			corner?: boolean;
			/** Takes a decimal point, not a digit: a small box on the line after its square, as a point is written. */
			point?: boolean;
	  }
	| { kind: 'rule'; row: number; from: number; to: number; key: string; step?: number; mid?: boolean }
	/** A decimal point's hop over the problem as given (from and to: where it is and where it goes, in squares). */
	| { kind: 'hop'; row: number; from: number; to: number; key: string; step?: number }
	| { kind: 'bracket'; row: number; col: number; to: number; key: string }
	/** A small arrow drawn on the paper, kept once its step is done: a bring-down (a digit straight down from the number
	 *  being divided) or a point lifted straight up. after: the box whose filling draws it. */
	| { kind: 'arrow'; row: number; col: number; toRow: number; key: string; step?: number; after?: string; x?: number };
export type StepKind =
	| 'divide'
	| 'multiply'
	| 'subtract'
	| 'bringDown'
	| 'zero'
	| 'add'
	| 'sumCarry'
	| 'carry'
	| 'point'
	| 'addZero'
	| 'shift'
	| 'fraction'
	| 'borrow';
export type Step = {
	kind: StepKind;
	boxes: string[];
	prompt: (v: Values) => string;
	told?: (v: Values) => string;
	/** The question (and the line said when the page writes it) as lines of the table, for the speaker button. */
	ask?: (v: Values) => Msg[];
	tell?: (v: Values) => Msg[];
	lit: string[];
	grow?: string[];
	view: View;
	countUp?: { partial: number; divisor: number; row: number; onesCol: number };
	/** Count up by skip-counting: `by`, `times` times (then add the carry). Addition and subtraction count by ones from
	 *  `start` (words: add counts on `times`; sub counts up from the bottom digit to the top one, and the count is it). */
	skipCount?: { by: number; times: number; carry: number; row: number; onesCol: number; start?: number; words?: 'add' | 'sub' };
	liftCarry?: { ones: string; tens: string };
	slide?: { row: number; col: number };
	/** The step's own hints, easiest first (else hints.ts works them out from its kind). */
	hints?: (v: Values) => string[];
};
export type Box = { id: string; digit: number | string };
export type Sheet = {
	title: string;
	rows: number;
	cols: number;
	cells: Cell[];
	boxes: Box[];
	answerBoxes: string[];
	remainderBoxes?: string[];
	answer: string;
	steps: Step[];
	crossed?: Record<string, number>;
	/** Boxes crossed out once another box (the new digit written over them) is filled (regrouping). */
	crossedBy?: Record<string, string>;
	/** A remainder as a fraction: its boxes, and what it is (any equal fraction is right: simplifying is up to them). */
	fraction?: { num: string[]; den: string[]; r: number; d: number };
	/** A line for the answer (a decimal that was stopped, and what it rounds to), and its lines for the speaker button. */
	note?: string;
	noteSay?: Msg[];
};

const digitsOf = (n: number) => [...String(n)].map(Number);
const list = (x: Msg | Msg[]) => (Array.isArray(x) ? x : [x]);
/** A step's question, from its lines (prompt: the words shown; ask: the lines, for the speaker button). */
export const Ask = (f: (v: Values) => Msg | Msg[]) => ({ prompt: (v: Values) => tx(f(v)), ask: (v: Values) => list(f(v)) });
/** The line said when the page writes a step's digits itself. */
export const Tell = (f: (v: Values) => Msg | Msg[]) => ({ told: (v: Values) => tx(f(v)), tell: (v: Values) => list(f(v)) });
/** Adding a column (multiplication's rows, addition): the digits in it and what was carried into it. */
export function addAsk(xs: number[], c: number): Msg {
	if (!xs.length) return ln('q.add.writeCarry', { c });
	if (xs.length === 1 && !c) return ln('q.add.bringDown', { d: xs[0] });
	return ln(c ? 'q.add.sumCarry' : 'q.add.sum', { xs: xs.join(' + '), c });
}
const len = (n: number) => String(n).length;

// --- long division ---

/** Whole numbers, or decimals too (a teacher's Numbers choice). */
export type Numbers = 'whole' | 'decimal';
export const numbersOf = (v: unknown): Numbers => (v === 'decimal' ? 'decimal' : 'whole');
/** A decimal for a problem: more than 0, at most 2 decimal places (hundredths, as grades 5 and 6 work them). */
const decimalFault = (x: number, what: string): string | null =>
	!Number.isFinite(x) || x <= 0 ? t(`ui.check.type.${what}`) : placesOf(x) > 2 ? t(`ui.check.places.${what}`) : null;

export function checkDivide(dividend: number, divisor: number, numbers: Numbers = 'whole'): string | null {
	if (numbers === 'decimal' && !(Number.isInteger(dividend) && Number.isInteger(divisor))) {
		const f = decimalFault(divisor, 'divisor') ?? decimalFault(dividend, 'dividend');
		if (f) return f;
		const s = placesOf(divisor);
		const B = scaled(divisor, s);
		if (B < 2 || B > 9999) return t('ui.check.decDivisor');
		const A = shiftPoint(dividend, s);
		if (A.replace('.', '').replace(/^0+/, '').length > 6 || dividend > 99999) return t('ui.check.decTooMany');
		return null;
	}
	if (!Number.isInteger(divisor) || divisor < 2 || divisor > 9999) return t('ui.check.divisor');
	if (!Number.isInteger(dividend) || dividend < 10 || dividend > 999999) return t('ui.check.dividend');
	if (dividend < divisor) return t('ui.check.smaller');
	return null;
}

/** The number the boxes ids make, from the student's own digits once they are all filled, else the fallback. */
function typedNumber(v: Values, ids: string[], fallback: number): number {
	const ds = ids.map((id) => v[id] ?? '');
	return ds.every((d) => d !== '') ? Number(ds.join('')) : fallback;
}

/** How a long division's remainder is written: none (the problems divide evenly; set by the plan, the sheet is as R),
 *  R (7 R 2), a fraction (7 2/3) or a decimal (7.66…). */
export type RemainderForm = 'none' | 'R' | 'fraction' | 'decimal';
export const REMAINDER_FORMS: RemainderForm[] = ['none', 'R', 'fraction', 'decimal'];
/** Decimal answers are worked to this many decimal places at most (or the dividend's own, when it has more): stop there,
 *  with "…" and the answer rounded in words, when it doesn't come out exactly first. */
export const DECIMAL_PLACES = 2;

/** Long division, box by box. The remainder as R, a fraction or (a decimal answer) worked on with zeros; a dividend with
 *  a decimal point has it lifted straight up into the quotient; a divisor with one is first made whole by moving both
 *  points the same number of places (shown above the work). Any decimal number in it makes the answer a decimal. */
export function divideSheet({ dividend, divisor, form = 'R' }: { dividend: number; divisor: number; form?: RemainderForm }): Sheet {
	const s = placesOf(divisor);
	const shifted = s > 0;
	const B = scaled(divisor, s);
	const A = shiftPoint(dividend, s);
	const { digits: n, intLen, places: given } = digitsOfText(A);
	const dec = form === 'decimal' || isDecimal(dividend) || shifted;
	const pointGiven = given > 0;
	const places = Math.max(DECIMAL_PLACES, given);
	// the zeros written on the end (a decimal answer): until it comes out, or the quotient has its places
	let left = n.reduce((r, d) => (r * 10 + d) % B, 0);
	let extra = 0;
	while (dec && left !== 0 && given + extra < places) {
		left = (left * 10) % B;
		extra++;
	}
	const hasPoint = pointGiven || extra > 0;
	const all = [...n, ...Array(extra).fill(0)];
	const total = all.length;
	const dv = digitsOf(B);
	const D = dv.length;
	// every digit in its own column, side by side as on paper; a point sits on the line after the last whole digit
	const col = (i: number) => D + i;
	const pointCol = D + intLen - 1;
	const T = shifted ? 2 : 0;
	const qRow = T;
	const dRow = T + 1;
	const cells: Cell[] = [];
	const boxes: Box[] = [];
	const steps: Step[] = [];
	const place = (id: string, digit: number | string, row: number, c: number, more: Partial<Extract<Cell, { kind: 'box' }>> = {}) => {
		cells.push({ kind: 'box', row, col: c, id, ...more });
		boxes.push({ id, digit });
	};
	const nKey = (k: number) => (k < total - extra ? `n${k}` : `z${k}`);
	const divKeys = shifted ? dv.map((_, k) => `v${k}`) : ['divisor'];

	// --- a divisor with a decimal point: move both points, shown on the problem as given (above the work) ---
	let headW = 0;
	if (shifted) {
		const x = String(dividend);
		const y = String(divisor);
		// the problem as given, compact: each digit in a square, the point on the line after its whole digits; each point's
		// hop s places right drawn over it (a whole number's from after its last digit), and a 0 where a place is empty
		const pad = Math.max(0, s - placesOf(dividend));
		let c = 0;
		const write = (t: string, key: string, step: number) => {
			const [int, frac = ''] = t.split('.');
			const start = c;
			[...(int + frac)].forEach((ch) => cells.push({ kind: 'given', row: 0, col: c++, text: ch, key }));
			if (frac) cells.push({ kind: 'given', row: 0, col: start + int.length - 1, text: '.', key, dot: true });
			for (let k = frac.length; k < s; k++) cells.push({ kind: 'given', row: 0, col: c++, text: '0', key: `hop-${key}`, faint: true, step });
			cells.push({ kind: 'hop', row: 0, from: start + int.length, to: start + int.length + s, key: `hop-${key}`, step });
		};
		write(x, 'o-dividend', 1);
		cells.push({ kind: 'given', row: 0, col: c++, text: '÷', key: 'o-sign' });
		write(y, 'o-divisor', 0);
		headW = c;
		const times = 10 ** s;
		dv.forEach((d, k) => place(`v${k}`, d, dRow, k));
		steps.push({
			kind: 'shift',
			boxes: dv.map((_, k) => `v${k}`),
			...Ask(() => ln('q.div.shiftDivisor', { y, times }, s)),
			...Tell(() => ln('q.div.shiftDivisorTold', { y, times, b: B }, s)),
			hints: () => [tn('h.div.shiftDivisor1', s, { times }), tn('h.div.shiftDivisor2', s, { y, times }), t('h.its', { x: B })],
			lit: ['o-divisor', 'hop-o-divisor', ...divKeys],
			view: { top: 0, left: 0, bottom: dRow, right: Math.max(headW, D) - 1 }
		});
		const dIds: string[] = [];
		n.forEach((d, k) => {
			if (pointGiven && k === intLen) {
				place('np', '.', dRow, pointCol, { point: true });
				dIds.push('np');
			}
			place(`n${k}`, d, dRow, col(k));
			dIds.push(`n${k}`);
		});
		steps.push({
			kind: 'shift',
			boxes: dIds,
			...Ask(() => [ln('q.div.shiftDividend', { x, times }, s), ...(pad ? [ln('q.div.shiftPad')] : [])]),
			...Tell(() => [ln('q.div.shiftDividendTold', { x, times, a: A }, s), ln('q.div.sameAs', { x, y, a: A, b: B })]),
			hints: () => [t('h.div.shiftDividend1', { x, y, a: A, b: B }), tn(pad ? 'h.div.shiftDividend2pad' : 'h.div.shiftDividend2', s, { x, times }), t('h.its', { x: A })],
			lit: ['o-dividend', 'hop-o-dividend', ...dIds],
			view: { top: 0, left: 0, bottom: dRow, right: Math.max(headW, col(total - 1) + 1) - 1 }
		});
	} else {
		dv.forEach((d, i) => cells.push({ kind: 'given', row: dRow, col: i, text: String(d), key: 'divisor' }));
		n.forEach((d, k) => {
			if (pointGiven && k === intLen) cells.push({ kind: 'given', row: dRow, col: pointCol, text: '.', key: 'np', dot: true });
			cells.push({ kind: 'given', row: dRow, col: col(k), text: String(d), key: `n${k}` });
		});
	}
	// the bracket over the digits as given; written on with a point and zeros, it grows over them as they're written
	cells.push({ kind: 'bracket', row: dRow, col: D, to: col(total - extra - 1) + 1, key: 'bracket' });

	// --- a point in the dividend: straight up into the quotient, first ---
	const lift = (afterWriting: boolean) => {
		place('qp', '.', qRow, pointCol, { point: true });
		const at = steps.length;
		steps.push({
			kind: 'point',
			boxes: ['qp'],
			...Ask(() => ln('q.div.lift', { a: afterWriting ? `${A}.0` : A })),
			...Tell(() => ln('q.div.liftTold')),
			hints: () => [t('h.div.lift1'), t('h.typePoint')],
			lit: ['np', 'qp', 'lift'],
			view: { top: 0, left: 0, bottom: dRow, right: col(total - 1) }
		});
		// up beside the points, in the gap before the first decimal digit
		cells.push({ kind: 'arrow', row: dRow, col: pointCol + 1, toRow: qRow, key: 'lift', step: at, after: 'qp', x: 0.2 });
	};
	if (pointGiven) lift(false);

	let i = 0;
	while (i < intLen - 1 && Number(all.slice(0, i + 1).join('')) < B) i++;
	const skipped = all.slice(0, i).join('');
	let partial = Number(all.slice(0, i + 1).join(''));
	let m = 0;
	let partialIds = all.slice(0, i + 1).map((_, k) => `n${k}`);
	let viewBottom = dRow;
	let row = dRow + 1;
	const qIds: string[] = [];
	const qDigits: { i: number; d: number }[] = [];
	let remIds: string[] = [];
	const lastLeft = left;
	const R_ = form !== 'fraction' && !dec;

	for (; i < total; i++) {
		const q = Math.floor(partial / B);
		const product = q * B;
		const diff = partial - product;
		const thisPartial = partial;
		const last = i === total - 1;
		const ids = partialIds;
		const first = qIds.length === 0;
		const qId = `q${i}`;
		qIds.push(qId);
		qDigits.push({ i, d: q });
		place(qId, q, qRow, col(i));
		steps.push({
			kind: 'divide',
			boxes: [qId],
			...Ask((v) => {
				const p = first ? thisPartial : typedNumber(v, ids, thisPartial);
				return first && skipped ? ln('q.div.skipped', { b: B, s: skipped, p }) : ln('q.div.howMany', { b: B, p });
			}),
			lit: [...divKeys, ...ids, qId],
			grow: first && skipped ? [...divKeys, ...ids.slice(0, -1), qId] : undefined,
			view: { top: 0, left: 0, bottom: viewBottom, right: col(i) },
			countUp: { partial: thisPartial, divisor: B, row, onesCol: col(i) }
		});

		const mulStep = steps.length;
		const width = i - m + 1;
		const pDigits = String(product).padStart(width, '0').split('').map(Number);
		const pIds: string[] = [];
		// the minus right before the product's first digit (a leading 0 isn't written: "− 6" under "10")
		const lead = pDigits.findIndex((d, k) => d !== 0 || k === width - 1);
		cells.push({ kind: 'given', row, col: col(m + lead) - 1, text: '−', key: `minus${i}`, step: mulStep });
		pDigits.forEach((d, k) => {
			const at = m + k;
			if (d === 0 && k < width - 1 && pDigits.slice(0, k).every((x) => x === 0)) return;
			const id = `p${i}${at}`;
			pIds.push(id);
			place(id, d, row, col(at));
		});
		cells.push({ kind: 'rule', row, from: col(m) - 1, to: col(i) + 1, key: `rule${i}`, step: mulStep });
		steps.push({
			kind: 'multiply',
			boxes: pIds,
			...Ask((v) => ln('q.whatIsTimes', { a: typedNumber(v, [qId], q), b: B })),
			lit: [...divKeys, qId, `minus${i}`, `rule${i}`, ...pIds],
			view: { top: 0, left: 0, bottom: row, right: col(i) }
		});
		row++;

		const subStep = steps.length;
		const base = last ? 'r' : `d${i}`;
		const dDigits = digitsOf(diff);
		const dIds = dDigits.map((_, k) => {
			const up = dDigits.length - 1 - k;
			return up === 0 ? base : `${base}_${up}`;
		});
		dDigits.forEach((d, k) => place(dIds[k], d, row, col(i - (dDigits.length - 1 - k))));
		if (last && R_) cells.push({ kind: 'given', row, col: col(i - dDigits.length + 1) - 1, text: 'R', key: 'rlabel', step: subStep, label: true });
		const capped = last && dec && lastLeft !== 0;
		steps.push({
			kind: 'subtract',
			boxes: dIds,
			...Ask((v) => {
				const q = ln('q.whatIsMinus', { a: typedNumber(v, ids, thisPartial), b: typedNumber(v, pIds, product) });
				if (!last) return q;
				if (dec) return capped ? [q, ln('q.div.stopHere', {}, places)] : q;
				return [q, ln(form === 'fraction' ? 'q.div.leftFraction' : 'q.div.leftRemainder')];
			}),
			lit: [...ids, `minus${i}`, `rule${i}`, ...pIds, ...dIds, 'rlabel'],
			view: { top: 0, left: 0, bottom: row, right: col(i) }
		});
		if (last) {
			remIds = dIds;
			break;
		}

		const k = i + 1;
		const fromGiven = k < total - extra;
		const r = diff;
		if (!fromGiven) {
			// no digits left to bring down, but something is: a point and a 0 on the end, then on with zeros
			const zId = `z${k}`;
			if (k === total - extra && !pointGiven) {
				place('np', '.', dRow, pointCol, { point: true });
				place(zId, 0, dRow, col(k));
				steps.push({
					kind: 'point',
					boxes: ['np', zId],
					...Ask(() => ln('q.div.writePoint', { r, a: A, a0: `${A}.0` })),
					...Tell(() => ln('q.div.writePointTold', { r, a: A, a0: `${A}.0` })),
					hints: () => [t('h.div.writePoint1', { a: A, a0: `${A}.0` }), t('h.div.writePoint2')],
					lit: [...dIds, 'np', zId],
					view: { top: 0, left: 0, bottom: row, right: col(k) }
				});
				cells.push({ kind: 'rule', row: qRow, from: col(k), to: col(k) + 1, key: `bracket${k}`, step: steps.length - 1 });
				lift(true);
			} else {
				place(zId, 0, dRow, col(k));
				steps.push({
					kind: 'addZero',
					boxes: [zId],
					...Ask(() => ln('q.div.addZero', { r })),
					...Tell(() => ln('q.div.addZeroTold', { r })),
					hints: () => [t('h.div.addZero1'), t('h.type0')],
					lit: [...dIds, zId],
					view: { top: 0, left: 0, bottom: row, right: col(k) }
				});
				cells.push({ kind: 'rule', row: qRow, from: col(k), to: col(k) + 1, key: `bracket${k}`, step: steps.length - 1 });
			}
		}
		const next = all[k];
		const bId = `b${k}`;
		place(bId, next, row, col(k));
		steps.push({
			kind: 'bringDown',
			boxes: [bId],
			...Ask(() => ln('q.div.bringDown', { d: next })),
			lit: [...dIds, nKey(k), bId, `down${k}`],
			view: { top: 0, left: 0, bottom: row, right: col(k) },
			slide: { row: dRow, col: col(k) }
		});
		cells.push({ kind: 'arrow', row: dRow, col: col(k), toRow: row, key: `down${k}`, step: steps.length - 1, after: bId });
		partial = r * 10 + next;
		partialIds = [...dIds, bId];
		viewBottom = row;
		m = i - (dDigits.length - 1);
		row++;
	}

	// --- the answer ---
	const remainder = lastLeft;
	const intPart = qDigits.filter((x) => x.i < intLen).map((x) => x.d).join('') || '0';
	const decPart = qDigits.filter((x) => x.i >= intLen).map((x) => x.d).join('');
	const quotient = decPart ? `${intPart}.${decPart}` : intPart;
	let cols = Math.max(headW, col(total - 1) + 1);
	let answer = `${quotient} R ${remainder}`;
	let answerBoxes = [...qIds, ...(hasPoint ? ['qp'] : []), ...remIds];
	let remainderBoxes: string[] | undefined = remIds;
	let fraction: Sheet['fraction'];
	let note: string | undefined;
	let noteSay: Msg[] | undefined;
	if (dec) {
		answerBoxes = [...qIds, ...(hasPoint ? ['qp'] : [])];
		remainderBoxes = undefined;
		answer = remainder ? `${quotient}…` : quotient;
		if (remainder) {
			const truncated = Number(quotient.replace('.', ''));
			const nextDigit = Math.floor((remainder * 10) / B);
			const rounded = asText(truncated + (nextDigit >= 5 ? 1 : 0), places);
			noteSay = [ln('q.div.notEven', {}, places), ln(places <= 3 ? `q.div.rounded${places}` : 'q.div.roundedN', { x: rounded, n: places })];
			note = tx(noteSay);
		}
	} else if (form === 'fraction') {
		answerBoxes = [...qIds];
		remainderBoxes = undefined;
		answer = remainder ? `${quotient} ${remainder}/${B}` : quotient;
		if (remainder) {
			const W = Math.max(len(remainder), D);
			const fc = col(total - 1) + 1;
			const num = digitsOf(remainder).map((d, k, a) => ({ id: `fn${a.length - 1 - k}`, d }));
			const den = dv.map((d, k, a) => ({ id: `fd${a.length - 1 - k}`, d }));
			const at = steps.length;
			num.forEach((x, k) => place(x.id, x.d, qRow, fc + W - num.length + k, { half: 'top' }));
			den.forEach((x, k) => place(x.id, x.d, qRow, fc + W - den.length + k, { half: 'bottom' }));
			cells.push({ kind: 'rule', row: qRow, from: fc, to: fc + W, key: 'fbar', step: at, mid: true });
			const g = gcd(remainder, B);
			const simpler = g > 1 ? [ln('q.simplify', { r: remainder, d: B, rs: remainder / g, ds: B / g })] : [];
			steps.push({
				kind: 'fraction',
				boxes: num.map((x) => x.id),
				...Ask(() => ln('q.frac.top', { r: remainder })),
				...Tell(() => ln('q.frac.topTold', { r: remainder })),
				hints: () => [t('h.frac.top1'), t('h.frac.top2', { r: remainder })],
				lit: [...remIds, 'fbar', ...num.map((x) => x.id)],
				view: { top: 0, left: 0, bottom: row, right: fc + W - 1 }
			});
			steps.push({
				kind: 'fraction',
				boxes: den.map((x) => x.id),
				...Ask(() => [ln('q.frac.bottom'), ...simpler]),
				...Tell(() => [ln('q.frac.bottomTold', { d: B, q: quotient, r: remainder }), ...simpler]),
				hints: () => [t('h.frac.bottom1'), tx([ln('h.its', { x: B }), ...simpler])],
				lit: [...divKeys, 'fbar', ...den.map((x) => x.id)],
				view: { top: 0, left: 0, bottom: row, right: fc + W - 1 }
			});
			answerBoxes = [...qIds, ...num.map((x) => x.id), ...den.map((x) => x.id)];
			remainderBoxes = num.map((x) => x.id);
			fraction = { num: num.map((x) => x.id), den: den.map((x) => x.id), r: remainder, d: B };
			cols = Math.max(cols, fc + W);
		}
	}
	return {
		title: `${dividend} ÷ ${divisor}`,
		rows: row + 1,
		cols,
		cells,
		boxes,
		answerBoxes,
		remainderBoxes,
		answer,
		steps,
		...(fraction ? { fraction } : {}),
		...(note ? { note, noteSay } : {})
	};
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Count up (division): where a count stands against the partial. */
export function countState(partial: number, divisor: number, count: number): 'over' | 'under' | 'right' {
	const left = partial - count * divisor;
	return left < 0 ? 'over' : left >= divisor ? 'under' : 'right';
}
export function countNudgeMsg(partial: number, divisor: number, count: number): Msg | null {
	switch (countState(partial, divisor, count)) {
		case 'over':
			return ln('q.count.over', { c: count, d: divisor, p: count * divisor, x: partial });
		case 'under':
			return ln('q.count.under', { d: divisor });
		default:
			return null;
	}
}
export function countNudge(partial: number, divisor: number, count: number): string | null {
	const n = countNudgeMsg(partial, divisor, count);
	return n ? tx(n) : null;
}

// --- sheets in general ---

export const cellKey = (c: Cell): string => (c.kind === 'box' ? c.id : (c.key ?? ''));
export const stepOfBox = (sheet: Sheet, id: string): number => sheet.steps?.findIndex((s) => s.boxes.includes(id)) ?? -1;
export function cellStep(sheet: Sheet, c: Cell): number {
	if (c.kind === 'box') return stepOfBox(sheet, c.id);
	if (c.kind === 'bracket') return -1;
	return c.step ?? -1;
}
export const correctValues = (sheet: Sheet): Values => Object.fromEntries(sheet.boxes.map((b) => [b.id, String(b.digit)]));
export function boxOf(sheet: Sheet, id: string): Box {
	const b = sheet.boxes.find((x) => x.id === id);
	if (!b) throw Error(`No box ${id}`);
	return b;
}
const read = (v: Values, ids: string[]) => ids.map((id) => v[id] ?? '').join('');
/** A remainder fraction's box: right when its part fits a fraction equal to r/d (2/4 or 1/2 for 2/4: simplifying is
 *  up to the student). While a part's last box is empty, its digits are taken as written, one by one. Null when the box
 *  isn't in a fraction. */
function fractionRight(sheet: Sheet, v: Values, id: string): boolean | null {
	const f = sheet.fraction;
	if (!f) return null;
	const inNum = f.num.includes(id);
	if (!inNum && !f.den.includes(id)) return null;
	const own = inNum ? f.num : f.den;
	if (!v[own.at(-1)!]) return v[id] === String(boxOf(sheet, id).digit);
	const n = Number(read(v, f.num));
	const numOk = read(v, f.num) !== '' && n >= 1 && n <= f.r && (n * f.d) % f.r === 0;
	if (inNum) return numOk;
	const d = Number(read(v, f.den));
	return numOk && d >= 1 && n * f.d === f.r * d;
}
export const isRight = (sheet: Sheet, v: Values, id: string) => fractionRight(sheet, v, id) ?? v[id] === String(boxOf(sheet, id).digit);
export const isWrong = (sheet: Sheet, v: Values, id: string) => !!v[id] && !isRight(sheet, v, id);
/** A fraction's boxes count as filled once each part's last box is (a simplified part may leave a box in front empty). */
const filled = (sheet: Sheet, v: Values, id: string) => {
	const f = sheet.fraction;
	if (f && f.num.includes(id)) return !!v[f.num.at(-1)!];
	if (f && f.den.includes(id)) return !!v[f.den.at(-1)!];
	return !!v[id];
};
export const allRight = (sheet: Sheet, v: Values) =>
	sheet.answerBoxes.every((id) => isRight(sheet, v, id) || (!v[id] && filled(sheet, v, id)));
export const allFilled = (sheet: Sheet, v: Values) => sheet.answerBoxes.every((id) => filled(sheet, v, id));

// --- making division problems ---

type Rand = () => number;
const rand = (lo: number, hi: number, r: Rand = Math.random) => lo + Math.floor(r() * (hi - lo + 1));

/** remainders: how they're written (none: every problem divides evenly). Saved before there was a choice, it was on
 *  or off: on reads as R, off as none. */
export type DividePlan = { count: number; dividends: [number, number]; divisors: [number, number]; remainders: RemainderForm; numbers?: Numbers };
export type MultiplyPlan = { count: number; tops: [number, number]; bottoms: [number, number]; numbers?: Numbers };
export type Plan = DividePlan | MultiplyPlan;

const DIVIDENDS: [number, number] = [10, 999999];
const DIVISORS: [number, number] = [2, 9999];
const DIVIDE_PLAN: DividePlan = { count: 16, dividends: [100, 999], divisors: [2, 9], remainders: 'R' };

/** A decimal problem made from the plan's whole-number sizes: the point placed in the dividend (12.6 from 126), and
 *  sometimes in the divisor too (0.3 from 3, 1.2 from 12); only problems that come out exactly by hundredths. */
function makeDecimalDivide(plan: DividePlan, r: Rand): { dividend: number; divisor: number } | null {
	// half of them a multiple of the divisor (any divisor), half any number that comes out once a zero or two is written
	const whole = makeDivide({ ...plan, numbers: 'whole', remainders: r() < 0.5 ? 'none' : 'R' }, r);
	if (!whole) return null;
	const N = whole.dividend;
	const k = rand(Math.min(1, len(N) - 1), Math.min(2, len(N) - 1), r);
	const s = r() < 0.35 ? 1 : 0;
	const dividend = unscaled(N, k);
	const divisor = unscaled(whole.divisor, s);
	if (!isDecimal(dividend) && !isDecimal(divisor)) return null;
	// it comes out by hundredths: N × 10^s × 100 is a whole number of (divisor × 10^k)
	if ((N * 10 ** (s + 2)) % (whole.divisor * 10 ** k) !== 0) return null;
	return checkDivide(dividend, divisor, 'decimal') ? null : { dividend, divisor };
}
function makeDivide(plan: DividePlan, r: Rand): { dividend: number; divisor: number } | null {
	if (plan.numbers === 'decimal') return makeDecimalDivide(plan, r);
	const [lo0, hi0] = plan.dividends;
	const [dlo, dhi] = plan.divisors;
	const divisor = dlo + rand(0, dhi - dlo, r);
	const d = rand(len(lo0), len(hi0), r);
	const lo = Math.max(10 ** (d - 1), lo0, divisor);
	const hi = Math.min(10 ** d - 1, hi0);
	if (hi < lo) return null;
	if (plan.remainders !== 'none') return { dividend: rand(lo, hi, r), divisor };
	const qlo = Math.ceil(lo / divisor);
	const qhi = Math.floor(hi / divisor);
	return qhi < qlo ? null : { dividend: rand(qlo, qhi, r) * divisor, divisor };
}

function makeSet<T>(n: number, make: () => T | null, key: (p: T) => string, existing: T[] = []): T[] {
	const seen = new Set(existing.map(key));
	const out: T[] = [];
	for (let i = 0; i < n; i++)
		for (let t = 0; t < 4000; t++) {
			const p = make();
			if (p && !seen.has(key(p))) {
				seen.add(key(p));
				out.push(p);
				break;
			}
		}
	return out;
}

function divideSet(plan: DividePlan, r: Rand = Math.random, existing: { dividend: number; divisor: number }[] = []) {
	return makeSet(
		Math.max(1, Math.min(100, Math.round(plan.count))),
		() => makeDivide(plan, r),
		(p) => `${p.dividend}/${p.divisor}`,
		existing
	);
}

function range(v: unknown, [lo, hi]: [number, number], dflt: [number, number]): [number, number] {
	if (!Array.isArray(v)) return [...dflt];
	const ok = v.filter((x) => Number.isInteger(x) && x >= lo && x <= hi) as number[];
	return ok.length ? [Math.min(...ok), Math.max(...ok)] : [...dflt];
}
function digitRange(v: unknown): [number, number] | undefined {
	const [a, b] = typeof v === 'number' ? [v, v] : Array.isArray(v) ? v : [];
	if (typeof a === 'number' && typeof b === 'number') return [Math.max(10, 10 ** (a - 1)), 10 ** b - 1];
}
const remaindersOn = (v: unknown) => v !== 0 && v !== false && v !== 'none' && v !== 'never';
/** The remainder form as kept: one of the forms, else on (R) or off (none) as it was saved before the choice. */
export const remainderForm = (v: unknown): RemainderForm =>
	REMAINDER_FORMS.includes(v as RemainderForm) ? (v as RemainderForm) : remaindersOn(v) ? 'R' : 'none';

function parseDividePlan(raw: unknown): DividePlan {
	const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const count = Number(t.count);
	return {
		count: Number.isInteger(count) && count >= 1 && count <= 100 ? count : DIVIDE_PLAN.count,
		dividends: range(t.dividends ?? digitRange(t.dividendDigits), DIVIDENDS, DIVIDE_PLAN.dividends),
		divisors: range(t.divisorDigits === 2 ? [11, 99] : t.divisors, DIVISORS, DIVIDE_PLAN.divisors),
		remainders: remainderForm(t.remainders),
		...(t.numbers === 'decimal' ? { numbers: 'decimal' as Numbers } : {})
	};
}

// --- multiplication ---

const TOPS: [number, number] = [10, 9999];
const BOTTOMS: [number, number] = [2, 999];

export function checkMultiply(top: number, bottom: number, numbers: Numbers = 'whole'): string | null {
	if (numbers === 'decimal' && !(Number.isInteger(top) && Number.isInteger(bottom))) {
		const f = decimalFault(top, 'top') ?? decimalFault(bottom, 'bottom');
		if (f) return f;
		const T = scaled(top, placesOf(top));
		const B = scaled(bottom, placesOf(bottom));
		if (T < 2 || T > TOPS[1]) return t('ui.check.mulDecTop');
		if (B < 2 || B > BOTTOMS[1]) return t('ui.check.mulDecBottom');
		if (len(B) > len(T)) return t('ui.check.moreOnTop');
		return null;
	}
	if (!Number.isInteger(top) || top < TOPS[0] || top > TOPS[1]) return t('ui.check.mulTop');
	if (!Number.isInteger(bottom) || bottom < BOTTOMS[0] || bottom > BOTTOMS[1]) return t('ui.check.mulBottom');
	if (len(bottom) > len(top)) return t('ui.check.moreOnTop');
	return null;
}

const reversed = (n: number) => [...String(n)].reverse().map(Number);
/** Place names, by place (0 the ones), as keys of the table's w.place.* words. */
export const PLACES = ['ones', 'tens', 'hundreds', 'thousands', 'tenThousands', 'hundredThousands'];

function partialRow(top: number, b: number) {
	const t = reversed(top);
	if (b === 0) return { values: t.map(() => 0), carries: t.map(() => 0), digits: [0] };
	const values: number[] = [];
	const carries: number[] = [];
	let carry = 0;
	t.forEach((d) => {
		carries.push(carry);
		const v = b * d + carry;
		values.push(v);
		carry = Math.floor(v / 10);
	});
	return { values, carries, digits: reversed(top * b) };
}

function sumCarries({ top, bottom }: { top: number; bottom: number }): number[] {
	const b = reversed(bottom);
	if (b.length < 2) return [];
	const rows = b.map((d, n) => [...Array(n).fill(0), ...partialRow(top, d).digits]);
	const L = len(top * bottom);
	const out = [0];
	let carry = 0;
	for (let p = 0; p < L; p++) {
		const s = rows.reduce((acc, r) => acc + (r[p] ?? 0), 0) + carry;
		carry = Math.floor(s / 10);
		out.push(carry);
	}
	return out;
}

type PlacedBox = { id: string; digit: number; row: number; col: number; small?: boolean };

export function multiplySheet(problem: { top: number; bottom: number }, lead = 0): Sheet {
	const { top, bottom } = problem;
	const tops = reversed(top);
	const b = reversed(bottom);
	const product = top * bottom;
	const L = len(product);
	const colOf = (p: number) => L + lead - p;
	const cols = L + lead + 1;
	const oneRow = b.length === 1;
	const parts = b.map((d) => partialRow(top, d));
	const hasCarries = parts.map((p) => p.carries.some((c, k) => k > 0 && c > 0));
	const sc = sumCarries(problem);
	const anySum = sc.some((c) => c > 0);
	const m = hasCarries.filter(Boolean).length;
	const bottomRow = m + 1;
	const sumCarryRow = bottomRow + 1;
	const firstPartial = bottomRow + 1 + +anySum;
	const partialRowAt = (n: number) => firstPartial + n;
	const sumRow = partialRowAt(b.length);
	const carryRowOf: number[] = [];
	let used = 0;
	parts.forEach((_, n) => (carryRowOf[n] = hasCarries[n] ? m - 1 - used++ : m));

	const cells: Cell[] = [];
	const boxes: Box[] = [];
	const steps: Step[] = [];
	const crossed: Record<string, number> = {};
	tops.forEach((d, k) => cells.push({ kind: 'given', row: m, col: colOf(k), text: String(d), key: `t${k}` }));
	b.forEach((d, k) => cells.push({ kind: 'given', row: bottomRow, col: colOf(k), text: String(d), key: `m${k}` }));
	cells.push({ kind: 'given', row: bottomRow, col: 0, text: '×', key: 'times' });
	cells.push({ kind: 'rule', row: bottomRow, from: 0, to: cols, key: 'rule0' });

	function add(list: PlacedBox[], step: Omit<Step, 'boxes'>) {
		for (const x of list) {
			cells.push({ kind: 'box', row: x.row, col: x.col, id: x.id, small: x.small });
			boxes.push({ id: x.id, digit: x.digit });
		}
		steps.push({ ...step, boxes: list.map((x) => x.id) });
	}
	const val = (v: Values, id: string, fallback: number) => (v[id] ? Number(v[id]) : fallback);
	const rowIds: string[][] = [];

	parts.forEach((part, n) => {
		const letter = String.fromCharCode(97 + n);
		const bd = b[n];
		const r = partialRowAt(n);
		const view: View = { top: Math.min(carryRowOf[n], m), left: 0, bottom: r, right: cols - 1 };
		const ids: string[] = [];
		const startStep = steps.length;
		if (n > 0)
			parts[n - 1].carries.forEach((c, k) => {
				if (k > 0 && c > 0) crossed[`${String.fromCharCode(96 + n)}c${k}`] = startStep;
			});
		for (let e = 0; e < n; e++) {
			const id = `${letter}z${e}`;
			ids.push(id);
			add([{ id, digit: 0, row: r, col: colOf(e) }], {
				kind: 'zero',
				...Ask(() => ln('q.mul.zero', { d: bd, row: t(`w.place.${PLACES[n]}`), p: t(`w.place.${PLACES[e]}`) })),
				...Tell(() => ln('q.mul.zeroTold', { d: bd, row: t(`w.place.${PLACES[n]}`), p: t(`w.place.${PLACES[e]}`) })),
				lit: [`m${n}`, id],
				view
			});
		}
		if (bd === 0) {
			const id = `${letter}${n}`;
			ids.push(id);
			add([{ id, digit: 0, row: r, col: colOf(n) }], {
				kind: 'multiply',
				...Ask(() => ln('q.whatIsTimes', { a: 0, b: top })),
				...Tell(() => ln('q.mul.zeroRow')),
				lit: [`m${n}`, ...tops.map((_, k) => `t${k}`), id],
				view
			});
		} else
			tops.forEach((td, i) => {
				const value = part.values[i];
				const carryIn = part.carries[i];
				const carryId = `${letter}c${i}`;
				const lastDigit = i === tops.length - 1;
				const placed: PlacedBox[] = (lastDigit ? reversed(value) : [value % 10])
					.map((d, k) => ({ id: `${letter}${i + k + n}`, digit: d, row: r, col: colOf(i + k + n) }))
					.reverse();
				ids.push(...placed.map((x) => x.id));
				const carried = (v: Values) => val(v, carryId, carryIn);
				const out = lastDigit ? 0 : Math.floor(value / 10);
				const carryBox: PlacedBox | null =
					out > 0 ? { id: `${letter}c${i + 1}`, digit: out, row: carryRowOf[n], col: colOf(i + 1), small: true } : null;
				add(carryBox ? [...placed, carryBox] : placed, {
					kind: 'multiply',
					...Ask((v) => (carryIn > 0 ? [ln('q.whatIsTimes', { a: bd, b: td }), ln('q.mul.addCarry', { c: carried(v) })] : ln('q.whatIsTimes', { a: bd, b: td }))),
					...Tell((v) => [
						carryIn > 0 ? ln('q.mul.toldCarry', { a: bd, b: td, p: bd * td, c: carried(v), x: value }) : ln('q.eq', { a: bd, b: td, x: value }),
						...(carryBox ? [ln('q.mul.carried', { c: out, d: tops[i + 1] })] : [])
					]),
					lit: [`m${n}`, `t${i}`, ...(carryIn > 0 ? [carryId] : []), ...placed.map((x) => x.id), ...(carryBox ? [carryBox.id] : [])],
					view,
					skipCount: { by: bd, times: td, carry: carryIn, row: r, onesCol: colOf(i + n) },
					...(carryBox ? { liftCarry: { ones: placed[0].id, tens: carryBox.id } } : {})
				});
			});
		rowIds.push(ids);
	});

	const placeOf = (id: string) => {
		const c = cells.find((x) => x.kind === 'box' && x.id === id);
		return c && c.kind === 'box' ? L + lead - c.col : -1;
	};
	const digitOf = (id: string) => Number(boxes.find((x) => x.id === id)?.digit ?? 0);

	let answerBoxes: string[];
	if (oneRow) answerBoxes = reversed(product).map((_, k) => `a${k}`);
	else {
		const addStep = steps.length;
		cells.push({ kind: 'given', row: partialRowAt(b.length - 1), col: 0, text: '+', key: 'plus', step: addStep });
		cells.push({ kind: 'rule', row: partialRowAt(b.length - 1), from: 0, to: cols, key: 'rule1', step: addStep });
		const view: View = { top: 0, left: 0, bottom: sumRow, right: cols - 1 };
		const operands = (p: number) => rowIds.flatMap((ids) => ids.filter((id) => placeOf(id) === p));
		const sum = reversed(product);
		sum.forEach((d, p) => {
			const id = `s${p}`;
			const ops = operands(p);
			const carryId = `sc${p}`;
			const carryIn = sc[p] ?? 0;
			add([{ id, digit: d, row: sumRow, col: colOf(p) }], {
				kind: 'add',
				...Ask((v) => {
					const xs = ops.map((o) => val(v, o, digitOf(o)));
					const c = carryIn > 0 ? val(v, carryId, carryIn) : 0;
					return addAsk(xs, c);
				}),
				lit: ['plus', 'rule1', ...ops, ...(carryIn > 0 ? [carryId] : []), id],
				view
			});
			const out = sc[p + 1] ?? 0;
			if (out > 0 && p + 1 < sum.length)
				add([{ id: `sc${p + 1}`, digit: out, row: sumCarryRow, col: colOf(p + 1), small: true }], {
					kind: 'sumCarry',
					...Ask(() => ln('q.mul.sumCarry', { c: out, p: t(`w.place.${PLACES[p + 1]}`) })),
					...Tell(() => ln('q.mul.sumCarryTold', { c: out, p: t(`w.place.${PLACES[p + 1]}`) })),
					lit: ['plus', 'rule1', id, `sc${p + 1}`],
					view
				});
		});
		answerBoxes = sum.map((_, k) => `s${k}`);
	}
	return {
		title: `${top} × ${bottom}`,
		rows: oneRow ? partialRowAt(0) + 1 : sumRow + 1,
		cols,
		cells,
		boxes,
		answerBoxes,
		answer: String(product),
		steps,
		crossed
	};
}

/** Decimal multiplication: multiply as whole numbers (2.4 × 1.3 as 24 × 13), then count the decimal places of both
 *  numbers and put the point in the answer that many places from the right (a step: the count typed in a box, and the
 *  point drawn on the line where it goes). The points sit on the grid lines, so every digit stays in its column. */
export function decimalMultiplySheet({ top, bottom }: { top: number; bottom: number }): Sheet {
	const pt = placesOf(top);
	const pb = placesOf(bottom);
	const P = pt + pb;
	if (!P) return multiplySheet({ top, bottom });
	const T = scaled(top, pt);
	const B = scaled(bottom, pb);
	const product = T * B;
	const L = len(product);
	const lead = Math.max(0, pt - L, pb + 1 - L, P - L);
	const s = multiplySheet({ top: T, bottom: B }, lead);
	const colOf = (p: number) => L + lead - p;
	const rowOf = (key: string) => (s.cells.find((c) => c.kind === 'given' && c.key === key) as { row: number }).row;
	const topRow = rowOf('t0');
	const bottomRow = rowOf('m0');
	const cells = [...s.cells];
	// the given numbers: a zero in front where there are no whole digits (0.6), and the point on its line
	const write = (row: number, digits: number, places: number, key: string) => {
		for (let p = digits; p <= places; p++) cells.push({ kind: 'given', row, col: colOf(p), text: '0', key: `${key}${p}` });
		if (places) cells.push({ kind: 'given', row, col: colOf(places), text: '.', key: `${key}pt`, dot: true });
	};
	write(topRow, len(T), pt, 't');
	write(bottomRow, len(B), pb, 'm');
	const answerRow = (s.cells.find((c) => c.kind === 'box' && c.id === s.answerBoxes[0]) as { row: number }).row;
	const countRow = answerRow + 1;
	const at = s.steps.length;
	const answer = asText(product, P);
	cells.push({ kind: 'given', row: countRow, col: s.cols - 2, text: t('ui.sheet.decimalPlaces'), key: 'dp', step: at, note: true });
	cells.push({ kind: 'box', row: countRow, col: s.cols - 1, id: 'dp' });
	// the point where the count typed puts it (so a wrong count shows where it would go), and the zeros in front once right
	for (let k = 1; k <= Math.max(P, Math.min(L, 4)); k++)
		cells.push({ kind: 'given', row: answerRow, col: colOf(k), text: '.', key: 'dp', dot: true, after: 'dp', when: String(k) });
	for (let p = L; p <= P; p++) cells.push({ kind: 'given', row: answerRow, col: colOf(p), text: '0', key: 'dp', after: 'dp' });
	// "2.4 has 1 decimal place and 1.3 has 2 decimal places" (each count its own plural form)
	const first = ln('q.mul.hasAnd', { x: top }, pt);
	const steps: Step[] = s.steps.map((st, i) =>
		i === 0 ? { ...st, ...Ask((v: Values) => [ln('q.mul.noPoints', { a: T, b: B }), ...(st.ask?.(v) ?? [])]) } : st
	);
	steps.push({
		kind: 'point',
		boxes: ['dp'],
		...Ask(() => [first, ln('q.mul.hasEnd', { x: bottom }, pb), ln('q.mul.howManyPlaces')]),
		...Tell(() => [first, ln('q.mul.hasSum', { x: bottom, a: pt, b: pb, p: P }, pb), ln('q.mul.countPlaces', { x: answer }, P)]),
		hints: () => [t('h.mul.points1'), tx([first, ln('q.mul.hasSum', { x: bottom, a: pt, b: pb, p: P }, pb)]), tn('h.mul.points3', P, { x: answer })],
		lit: ['tpt', 'mpt', 'dp', ...s.answerBoxes],
		view: { top: 0, left: 0, bottom: countRow, right: s.cols - 1 }
	});
	const trimmed = answer.replace(/\.?0+$/, '');
	return {
		...s,
		...(trimmed !== answer ? { note: t('q.mul.trimNote', { x: answer, y: trimmed }), noteSay: [ln('q.mul.trimNote', { x: answer, y: trimmed })] } : {}),
		title: `${top} × ${bottom}`,
		rows: countRow + 1,
		cells,
		boxes: [...s.boxes, { id: 'dp', digit: P }],
		answerBoxes: [...s.answerBoxes, 'dp'],
		answer,
		steps
	};
}

const MULTIPLY_PLAN: MultiplyPlan = { count: 12, tops: [10, 99], bottoms: [10, 99] };

/** Multiplication ranges put right: each in order, the bigger number on top, within the limits. */
export function fixMultiplyPlan(plan: MultiplyPlan): { plan: MultiplyPlan; swapped: boolean } {
	const sort = ([a, b]: [number, number]): [number, number] => [Math.min(a, b), Math.max(a, b)];
	let tops = sort(plan.tops);
	let bottoms = sort(plan.bottoms);
	let swapped = false;
	if (len(bottoms[0]) > len(tops[1])) {
		[tops, bottoms] = [bottoms, tops];
		swapped = true;
	}
	tops = [Math.max(TOPS[0], tops[0]), Math.min(TOPS[1], tops[1])];
	bottoms = [Math.max(BOTTOMS[0], bottoms[0]), Math.min(BOTTOMS[1], bottoms[1])];
	return { plan: { ...plan, tops: sort(tops), bottoms: sort(bottoms) }, swapped };
}

function within([lo, hi]: [number, number], digits: number, r: Rand): number | null {
	const a = Math.max(lo, 10 ** (digits - 1));
	const b = Math.min(hi, 10 ** digits - 1);
	return a > b ? null : rand(a, b, r);
}
/** A decimal multiplication from the plan's whole-number sizes: a point in the top number (2.4 from 24), and often in
 *  the bottom one (1.3 from 13, 0.6 from 6). */
function makeDecimalMultiply(plan: MultiplyPlan, r: Rand): { top: number; bottom: number } | null {
	const whole = makeMultiply({ ...plan, numbers: 'whole' }, r);
	if (!whole) return null;
	const pt = rand(1, Math.min(2, len(whole.top) - 1), r);
	const pb = r() < 0.6 ? 1 : 0;
	const top = unscaled(whole.top, pt);
	const bottom = unscaled(whole.bottom, pb);
	if (!isDecimal(top) || placesOf(top) + placesOf(bottom) > 3) return null;
	return checkMultiply(top, bottom, 'decimal') ? null : { top, bottom };
}
function makeMultiply(plan: MultiplyPlan, r: Rand): { top: number; bottom: number } | null {
	if (plan.numbers === 'decimal') return makeDecimalMultiply(plan, r);
	const nb = rand(len(plan.bottoms[0]), len(plan.bottoms[1]), r);
	const nt = rand(Math.max(nb, len(plan.tops[0])), len(plan.tops[1]), r);
	if (nt < nb) return null;
	const top = within(plan.tops, nt, r);
	const bottom = within(plan.bottoms, nb, r);
	return top === null || bottom === null || checkMultiply(top, bottom) ? null : { top, bottom };
}
function multiplySet(plan: MultiplyPlan, r: Rand = Math.random, existing: { top: number; bottom: number }[] = []) {
	return makeSet(Math.max(1, Math.round(plan.count)), () => makeMultiply(plan, r), (p) => `${p.top}×${p.bottom}`, existing);
}
function parseMultiplyPlan(raw: unknown): MultiplyPlan {
	const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const count = Number(t.count);
	return fixMultiplyPlan({
		count: Number.isInteger(count) && count >= 1 && count <= 100 ? count : MULTIPLY_PLAN.count,
		tops: range(t.tops, TOPS, MULTIPLY_PLAN.tops),
		bottoms: range(t.bottoms, BOTTOMS, MULTIPLY_PLAN.bottoms),
		...(t.numbers === 'decimal' ? { numbers: 'decimal' as Numbers } : {})
	}).plan;
}

// --- addition and subtraction (columns.ts has the sheets) ---

/** The same shape as multiplication's: the top and bottom numbers' ranges. */
export type ColumnPlan = MultiplyPlan;
const COLUMN_LIMITS: [number, number] = [10, 9999];
const ADD_PLAN: ColumnPlan = { count: 12, tops: [100, 999], bottoms: [100, 999] };
const SUBTRACT_PLAN: ColumnPlan = { count: 12, tops: [100, 999], bottoms: [10, 999] };
/** Two numbers from the plan's ranges (subtraction: the bigger on top); with decimals, a point placed in each, at one or
 *  two places (35.6 + 7.25), keeping a whole digit in front. */
function makeColumns(kind: 'add' | 'subtract', plan: ColumnPlan, r: Rand): Problem | null {
	let a = rand(plan.tops[0], plan.tops[1], r);
	let b = rand(plan.bottoms[0], plan.bottoms[1], r);
	if (plan.numbers === 'decimal') {
		a = unscaled(a, rand(1, Math.min(2, len(a) - 1), r));
		b = unscaled(b, rand(1, Math.min(2, len(b) - 1), r));
		if (!isDecimal(a) && !isDecimal(b)) return null;
	}
	if (kind === 'subtract' && a < b) [a, b] = [b, a];
	return checkColumns(kind, a, b, plan.numbers ?? 'whole') ? null : [a, b];
}
function columnSet(kind: 'add' | 'subtract', plan: ColumnPlan, r: Rand = Math.random, existing: Problem[] = []): Problem[] {
	return makeSet(Math.max(1, Math.min(100, Math.round(plan.count))), () => makeColumns(kind, plan, r), ([a, b]) => `${a}|${b}`, existing);
}
function parseColumnPlan(raw: unknown, dflt: ColumnPlan): ColumnPlan {
	const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const count = Number(t.count);
	return {
		count: Number.isInteger(count) && count >= 1 && count <= 100 ? count : dflt.count,
		tops: range(t.tops, COLUMN_LIMITS, dflt.tops),
		bottoms: range(t.bottoms, COLUMN_LIMITS, dflt.bottoms),
		...(t.numbers === 'decimal' ? { numbers: 'decimal' as Numbers } : {})
	};
}
const sortRange = ([a, b]: [number, number]): [number, number] => [Math.min(a, b), Math.max(a, b)];
function columnKind(kind: 'add' | 'subtract', dflt: ColumnPlan): KindInfo {
	const add = kind === 'add';
	return {
		name: kind,
		title: t(`ui.kind.${kind}`),
		sign: add ? '+' : '−',
		labels: [t('ui.label.top'), t('ui.label.bottom')],
		widths: [4, 4],
		setSize: dflt.count,
		makeSet: (r, n) => columnSet(kind, { ...dflt, count: n }, r),
		check: (a, b, numbers) => checkColumns(kind, a, b, numbers),
		sheet: ([a, b]) => (add ? addSheet({ top: a, bottom: b }) : subtractSheet({ top: a, bottom: b })),
		settings: {
			fresh: () => ({ ...dflt, tops: [...dflt.tops], bottoms: [...dflt.bottoms] }),
			parse: (raw) => parseColumnPlan(raw, dflt),
			generate: (plan, r = Math.random, existing = []) => columnSet(kind, plan as ColumnPlan, r, existing),
			ranges: [
				{ key: 'tops', name: t('ui.range.tops'), limits: COLUMN_LIMITS },
				{ key: 'bottoms', name: t('ui.range.bottoms'), limits: COLUMN_LIMITS }
			],
			choices: [NUMBERS_CHOICE],
			fix: (plan) => {
				const p = plan as ColumnPlan;
				let tops = sortRange(p.tops);
				let bottoms = sortRange(p.bottoms);
				const swap = !add && bottoms[0] > tops[1];
				if (swap) [tops, bottoms] = [bottoms, tops];
				return { plan: { ...p, tops, bottoms }, note: swap ? t('ui.swapped') : null };
			}
		},
		levels: LEVELS,
		levelText: { countUp: t(`ui.${kind}.countUp`) },
		studentLevelText: { countUp: t(`ui.${kind}.countUpStudent`) },
		steps: add ? [t('ui.add.step1'), t('ui.add.step2'), t('ui.add.step3')] : [t('ui.add.step1'), t('ui.subtract.step2'), t('ui.subtract.step3'), t('ui.subtract.step4')],
		tagline: t(`ui.${kind}.tagline`),
		sample: add ? [475, 368] : [400, 167]
	};
}

// --- the kinds ---

export type Flag = 'spotlight' | 'prompt' | 'zoom' | 'build' | 'drawSigns' | 'bringDown' | 'markNow';
export const FLAGS: Flag[] = ['spotlight', 'prompt', 'zoom', 'build', 'drawSigns', 'bringDown', 'markNow'];
export type Flags = Record<Flag, boolean>;
export type RangeKey = 'dividends' | 'divisors' | 'tops' | 'bottoms';

export type KindInfo = {
	name: Kind;
	title: string;
	sign: string;
	labels: [string, string];
	widths: [number, number];
	setSize: number;
	makeSet: (r: Rand, n: number) => Problem[];
	check: (a: number, b: number, numbers?: Numbers) => string | null;
	sheet: (p: Problem, plan?: Plan) => Sheet;
	settings: {
		fresh: () => Plan;
		parse: (raw: unknown) => Plan;
		generate: (plan: Plan, r?: Rand, existing?: Problem[]) => Problem[];
		ranges: { key: RangeKey; name: string; limits: [number, number] }[];
		/** A choice of a few named options (Remainders: none, R, fraction, decimal). */
		choices: { key: 'remainders' | 'numbers'; name: string; options: { value: string; label: string; about: string }[] }[];
		fix: (plan: Plan) => { plan: Plan; note: string | null };
	};
	levels: Level[];
	levelText?: Partial<Record<Level, string>>;
	studentLevelText?: Partial<Record<Level, string>>;
	steps: string[];
	tagline: string;
	/** The problem the editor's demo works. */
	sample: Problem;
};

const LEVELS: Level[] = ['watch', 'countUp', 'guided', 'prompted', 'onMyOwn'];

/** The Numbers choice (every kind): whole numbers, or decimals too. */
export const NUMBERS_CHOICE: KindInfo['settings']['choices'][number] = {
	key: 'numbers',
	name: t('ui.numbers.name'),
	options: [
		{ value: 'whole', label: t('ui.numbers.whole'), about: t('ui.numbers.wholeAbout') },
		{ value: 'decimal', label: t('ui.numbers.decimal'), about: t('ui.numbers.decimalAbout') }
	]
};

/** The Remainders choice (a teacher's settings; the label is what the choice shows). */
export const REMAINDER_OPTIONS: { value: RemainderForm; label: string; about: string }[] = REMAINDER_FORMS.map((value) => ({
	value,
	label: t(`ui.rem.${value}`),
	about: tn(`ui.rem.${value}About`, DECIMAL_PLACES)
}));

export const KINDS: KindInfo[] = [
	{
		name: 'divide',
		title: t('ui.kind.divide'),
		sign: '÷',
		labels: [t('ui.label.dividend'), t('ui.label.divisor')],
		widths: [6, 4],
		setSize: DIVIDE_PLAN.count,
		makeSet: (r, n) => divideSet({ ...DIVIDE_PLAN, count: n }, r).map((p) => [p.dividend, p.divisor]),
		check: checkDivide,
		sheet: ([a, b], plan) => divideSheet({ dividend: a, divisor: b, form: (plan as DividePlan | undefined)?.remainders }),
		settings: {
			fresh: () => ({ ...DIVIDE_PLAN, dividends: [...DIVIDE_PLAN.dividends], divisors: [...DIVIDE_PLAN.divisors] }),
			parse: parseDividePlan,
			generate: (plan, r = Math.random, existing = []) =>
				divideSet(
					plan as DividePlan,
					r,
					existing.map(([a, b]) => ({ dividend: a, divisor: b }))
				).map((p) => [p.dividend, p.divisor]),
			ranges: [
				{ key: 'dividends', name: t('ui.range.dividends'), limits: DIVIDENDS },
				{ key: 'divisors', name: t('ui.range.divisors'), limits: DIVISORS }
			],
			choices: [NUMBERS_CHOICE, { key: 'remainders', name: t('ui.rem.name'), options: REMAINDER_OPTIONS }],
			fix: (plan) => {
				const p = plan as DividePlan;
				const sort = ([a, b]: [number, number]): [number, number] => [Math.min(a, b), Math.max(a, b)];
				return { plan: { ...p, dividends: sort(p.dividends), divisors: sort(p.divisors) }, note: null };
			}
		},
		levels: LEVELS,
		steps: [t('ui.divide.step1'), t('ui.divide.step2'), t('ui.divide.step3'), t('ui.divide.step4')],
		tagline: t('ui.divide.tagline'),
		sample: [92, 4]
	},
	{
		name: 'multiply',
		title: t('ui.kind.multiply'),
		sign: '×',
		labels: [t('ui.label.top'), t('ui.label.bottom')],
		widths: [4, 3],
		setSize: MULTIPLY_PLAN.count,
		makeSet: (r, n) => multiplySet({ ...MULTIPLY_PLAN, count: n }, r).map((p) => [p.top, p.bottom]),
		check: checkMultiply,
		sheet: ([a, b]) => decimalMultiplySheet({ top: a, bottom: b }),
		settings: {
			fresh: () => ({ ...MULTIPLY_PLAN, tops: [...MULTIPLY_PLAN.tops], bottoms: [...MULTIPLY_PLAN.bottoms] }),
			parse: parseMultiplyPlan,
			generate: (plan, r = Math.random, existing = []) =>
				multiplySet(
					plan as MultiplyPlan,
					r,
					existing.map(([a, b]) => ({ top: a, bottom: b }))
				).map((p) => [p.top, p.bottom]),
			ranges: [
				{ key: 'tops', name: t('ui.range.tops'), limits: TOPS },
				{ key: 'bottoms', name: t('ui.range.bottoms'), limits: BOTTOMS }
			],
			choices: [NUMBERS_CHOICE],
			fix: (plan) => {
				const f = fixMultiplyPlan(plan as MultiplyPlan);
				return { plan: f.plan, note: f.swapped ? t('ui.swapped') : null };
			}
		},
		levels: LEVELS,
		levelText: { countUp: t('ui.multiply.countUp') },
		studentLevelText: { countUp: t('ui.multiply.countUpStudent') },
		steps: [t('ui.multiply.step1'), t('ui.multiply.step2'), t('ui.multiply.step3')],
		tagline: t('ui.multiply.tagline'),
		sample: [24, 13]
	},
	columnKind('add', ADD_PLAN),
	columnKind('subtract', SUBTRACT_PLAN)
];
export const kindInfo = (k: Kind): KindInfo => KINDS.find((x) => x.name === k)!;

export const FLAG_INFO: { name: Flag; label: string; detail: string }[] = FLAGS.map((name) => ({ name, label: t(`ui.flag.${name}`), detail: t(`ui.flag.${name}About`) }));
const ALL: Flags = { spotlight: true, prompt: true, zoom: true, build: true, drawSigns: true, bringDown: true, markNow: true };
const NONE: Flags = { spotlight: false, prompt: false, zoom: false, build: false, drawSigns: false, bringDown: false, markNow: false };

export type LevelInfo = { name: Level; label: string; way: 'watch' | 'countUp' | 'type'; flags: Flags; scored: boolean; detail: string };
export const LEVEL_INFO: LevelInfo[] = (
	[
		['watch', 'watch', ALL, false],
		['countUp', 'countUp', ALL, true],
		['guided', 'type', ALL, true],
		['prompted', 'type', { ...NONE, prompt: true, build: true }, true],
		['onMyOwn', 'type', NONE, true]
	] as const
).map(([name, way, flags, scored]) => ({ name, label: t(`ui.level.${name}`), way, flags, scored, detail: t(`ui.level.${name}About`) }));
export const levelInfo = (l: Level): LevelInfo | undefined => LEVEL_INFO.find((x) => x.name === l);

export const MAX_PROBLEMS = 100;
/** method: the way the problems are worked (the standard algorithm unless the teacher picks another; methods.ts). */
export type Settings = { level: Level; custom: Flags; perStudent: boolean; method: Method };
export const freshSettings = (): Settings => ({ level: 'guided', custom: { ...ALL }, perStudent: false, method: 'standard' });

export const flagsCode = (f: Flags) => FLAG_INFO.map(({ name }) => (f[name] ? '1' : '0')).join('');
export function parseFlags(code: unknown): Flags {
	const f = { ...ALL };
	if (typeof code === 'string' && /^[01]{7}$/.test(code)) FLAG_INFO.forEach(({ name }, i) => (f[name] = code[i] === '1'));
	return f;
}

/** The problems that work for this kind (numbers as text are taken as numbers), at most 100. */
export function validProblems(raw: unknown, kind: Kind, numbers: Numbers = 'whole'): Problem[] {
	if (!Array.isArray(raw)) return [];
	const out: Problem[] = [];
	for (const p of raw) {
		if (!Array.isArray(p)) continue;
		const [a, b] = p.map(Number);
		if (kindInfo(kind).check(a, b, numbers) === null) out.push([a, b]);
	}
	return out.slice(0, MAX_PROBLEMS);
}
const levelOr = (l: unknown, kind: Kind): Level =>
	l === 'custom' || (LEVEL_INFO.some((x) => x.name === l) && kindInfo(kind).levels.includes(l as Level)) ? (l as Level) : 'guided';

/** What a student plays: the kind, the problems, the support and (for a fresh set each time) the plan. */
export type Playable = { kind: Kind; problems: Problem[]; settings: Settings; plan: Plan };

/** One question-set item as Oomba keeps it (no title: nothing typed as free text leaves the teacher's save). m, the
 *  method, only when it isn't the standard algorithm (so an item saved before methods is still the same item). */
export type Item = { k: Kind; p: Problem[]; l: Level; c?: string; d?: 1; g?: Plan; m?: Method; r?: 'fraction' | 'decimal'; dec?: 1 };

/** An item from a link, checked the way links always were: bad problems dropped; none left (and not a fresh set for
 *  each student) means no activity. */
export function parseItem(raw: unknown): Playable | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	const kind = kindOr(o.k);
	const numbers: Numbers = o.dec === 1 ? 'decimal' : 'whole';
	const problems = validProblems(o.p, kind, numbers);
	const perStudent = o.d === 1;
	if (!problems.length && !perStudent) return null;
	const s = kindInfo(kind).settings;
	const plan = withForm(kind, o.g ? s.parse(o.g) : s.fresh(), o.r);
	return {
		kind,
		problems,
		// decimals: the standard method (the others take away and break up whole numbers)
		settings: { level: levelOr(o.l, kind), custom: parseFlags(o.c), perStudent, method: numbers === 'decimal' ? 'standard' : methodOr(kind, o.m) },
		plan: numbers === 'decimal' ? { ...plan, numbers } : plan
	};
}

/** The item to save on Oomba for an activity. */
export function toItem(a: Playable): Item {
	const { level, custom, perStudent } = a.settings;
	const item: Item = { k: a.kind, p: a.problems.map(([x, y]) => [x, y]), l: level };
	if (level === 'custom') item.c = flagsCode(custom);
	if (perStudent) {
		item.d = 1;
		item.g = cleanPlan(a.kind, a.plan);
	}
	const m = methodOr(a.kind, a.settings.method);
	if (m !== 'standard' && numbersOf(a.plan?.numbers) !== 'decimal') item.m = m;
	const form = formOf(a);
	const dec = numbersOf(a.plan?.numbers) === 'decimal';
	if (!dec && (form === 'fraction' || form === 'decimal')) item.r = form;
	if (dec) item.dec = 1;
	return item;
}
/** An item's remainder form (r, only when it is a fraction or a decimal) put on its plan. */
function withForm(kind: Kind, plan: Plan, r: unknown): Plan {
	if (kind !== 'divide' || (r !== 'fraction' && r !== 'decimal')) return plan;
	return { ...(plan as DividePlan), remainders: r };
}
/** How an activity's long division writes its remainders (other kinds: as R, which they never have). */
export const formOf = (a: { kind: Kind; plan?: Plan; settings?: { method?: Method } }): RemainderForm => {
	if (a.kind !== 'divide') return 'R';
	// decimals: division answers are decimals too
	if (numbersOf(a.plan?.numbers) === 'decimal') return 'decimal';
	const f = remainderForm((a.plan as DividePlan | undefined)?.remainders ?? 'R');
	// the ladder and the area model take away whole groups: a decimal remainder is written as R there
	return f === 'decimal' && a.settings?.method && a.settings.method !== 'standard' ? 'R' : f;
};
export function cleanPlan(kind: Kind, plan: Plan): Plan {
	if (kind === 'divide') {
		const p = plan as DividePlan;
		// (kept as on or off, as before the choice: the form itself rides in the item's r)
		return { count: p.count, dividends: [p.dividends[0], p.dividends[1]], divisors: [p.divisors[0], p.divisors[1]], remainders: remainderForm(p.remainders) !== 'none' } as unknown as Plan;
	}
	const p = plan as MultiplyPlan;
	return { count: p.count, tops: [p.tops[0], p.tops[1]], bottoms: [p.bottoms[0], p.bottoms[1]] };
}

/** The problems for one run: the activity's own, or (a fresh set for each student) new ones from the plan, as many as
 *  the activity has (the kind's usual number when it has none). */
export function problemsForRun(a: Playable, r: Rand = Math.random): Problem[] {
	if (!a.settings.perStudent) return a.problems;
	const k = kindInfo(a.kind);
	const count = a.problems.length || k.setSize;
	return k.settings.generate({ ...(a.plan ?? k.settings.fresh()), count }, r);
}

/** A problem's sheet, as this activity works it. */
export const sheetFor = (a: Playable, p: Problem): Sheet => kindInfo(a.kind).sheet(p, { ...a.plan, remainders: formOf(a) } as Plan);

export const showAnswer = (s: string) => s.replace(' R 0', '');
