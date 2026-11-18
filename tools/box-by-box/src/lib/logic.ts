// Box by Box: the problems, the sheets they are worked on, their steps, checking, and making problem sets. No platform
// calls and no DOM here, so it runs as it is in Node too.

export type Kind = 'divide' | 'multiply';
export type Level = 'watch' | 'countUp' | 'guided' | 'prompted' | 'onMyOwn' | 'custom';
export type Problem = [number, number];
export type Values = Record<string, string>;

export type View = { top: number; left: number; bottom: number; right: number };
export type Cell =
	| { kind: 'given'; row: number; col: number; text: string; key: string; step?: number; label?: boolean; faint?: boolean }
	| { kind: 'box'; row: number; col: number; id: string; small?: boolean }
	| { kind: 'rule'; row: number; from: number; to: number; key: string; step?: number }
	| { kind: 'bracket'; row: number; col: number; to: number; key: string };
export type StepKind = 'divide' | 'multiply' | 'subtract' | 'bringDown' | 'zero' | 'add' | 'sumCarry' | 'carry';
export type Step = {
	kind: StepKind;
	boxes: string[];
	prompt: (v: Values) => string;
	told?: (v: Values) => string;
	lit: string[];
	grow?: string[];
	view: View;
	countUp?: { partial: number; divisor: number; row: number; onesCol: number };
	skipCount?: { by: number; times: number; carry: number; row: number; onesCol: number };
	liftCarry?: { ones: string; tens: string };
	slide?: { row: number; col: number };
};
export type Box = { id: string; digit: number };
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
};

const digitsOf = (n: number) => [...String(n)].map(Number);
const len = (n: number) => String(n).length;

// --- long division ---

export function checkDivide(dividend: number, divisor: number): string | null {
	if (!Number.isInteger(divisor) || divisor < 2 || divisor > 9999) return 'Divide by a number from 2 to 9,999.';
	if (!Number.isInteger(dividend) || dividend < 10 || dividend > 999999)
		return 'The number to divide needs two to six digits, 10 to 999,999.';
	if (dividend < divisor) return 'The number to divide needs to be at least the number it’s divided by.';
	return null;
}

/** The number the boxes ids make, from the student's own digits once they are all filled, else the fallback. */
function typedNumber(v: Values, ids: string[], fallback: number): number {
	const ds = ids.map((id) => v[id] ?? '');
	return ds.every((d) => d !== '') ? Number(ds.join('')) : fallback;
}

export function divideSheet({ dividend, divisor }: { dividend: number; divisor: number }): Sheet {
	const n = digitsOf(dividend);
	const a = n.length;
	const dv = digitsOf(divisor);
	const col = (i: number) => i + dv.length;
	const cells: Cell[] = [];
	const boxes: Box[] = [];
	const steps: Step[] = [];
	dv.forEach((d, i) => cells.push({ kind: 'given', row: 1, col: i, text: String(d), key: 'divisor' }));
	n.forEach((d, i) => cells.push({ kind: 'given', row: 1, col: col(i), text: String(d), key: `n${i}` }));
	cells.push({ kind: 'bracket', row: 1, col: col(0), to: col(a), key: 'bracket' });

	let i = 0;
	while (i < a - 1 && Number(n.slice(0, i + 1).join('')) < divisor) i++;
	const skipped = n.slice(0, i).join('');
	let partial = Number(n.slice(0, i + 1).join(''));
	let m = 0;
	let partialIds = n.slice(0, i + 1).map((_, k) => `n${k}`);
	let viewBottom = 1;
	let row = 2;
	const qIds: string[] = [];
	let remIds: string[] = [];

	for (; i < a; i++) {
		const q = Math.floor(partial / divisor);
		const product = q * divisor;
		const diff = partial - product;
		const thisPartial = partial;
		const last = i === a - 1;
		const ids = partialIds;
		const first = steps.length === 0;
		const qId = `q${i}`;
		qIds.push(qId);
		cells.push({ kind: 'box', row: 0, col: col(i), id: qId });
		boxes.push({ id: qId, digit: q });
		steps.push({
			kind: 'divide',
			boxes: [qId],
			prompt: (v) => {
				const p = first ? thisPartial : typedNumber(v, ids, thisPartial);
				return first && skipped
					? `${divisor} doesn’t go into ${skipped}, so how many times does ${divisor} go into ${p}?`
					: `How many times does ${divisor} go into ${p}?`;
			},
			lit: ['divisor', ...ids, qId],
			grow: first && skipped ? ['divisor', ...ids.slice(0, -1), qId] : undefined,
			view: { top: 0, left: 0, bottom: viewBottom, right: col(i) },
			countUp: { partial: thisPartial, divisor, row, onesCol: col(i) }
		});

		const mulStep = steps.length;
		const width = i - m + 1;
		const pDigits = String(product).padStart(width, '0').split('').map(Number);
		const pIds: string[] = [];
		cells.push({ kind: 'given', row, col: col(m) - 1, text: '−', key: `minus${i}`, step: mulStep });
		pDigits.forEach((d, k) => {
			const at = m + k;
			if (d === 0 && k < width - 1 && pDigits.slice(0, k).every((x) => x === 0)) return;
			const id = `p${i}${at}`;
			pIds.push(id);
			cells.push({ kind: 'box', row, col: col(at), id });
			boxes.push({ id, digit: d });
		});
		cells.push({ kind: 'rule', row, from: col(m) - 1, to: col(i) + 1, key: `rule${i}`, step: mulStep });
		steps.push({
			kind: 'multiply',
			boxes: pIds,
			prompt: (v) => `What is ${typedNumber(v, [qId], q)} × ${divisor}?`,
			lit: ['divisor', qId, `minus${i}`, `rule${i}`, ...pIds],
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
		dDigits.forEach((d, k) => {
			const id = dIds[k];
			cells.push({ kind: 'box', row, col: col(i) - (dDigits.length - 1 - k), id });
			boxes.push({ id, digit: d });
		});
		if (last) cells.push({ kind: 'given', row, col: col(i) - dDigits.length, text: 'R', key: 'rlabel', step: subStep, label: true });
		steps.push({
			kind: 'subtract',
			boxes: dIds,
			prompt: (v) => {
				const t = `What is ${typedNumber(v, ids, thisPartial)} − ${typedNumber(v, pIds, product)}?`;
				return last ? `${t} What’s left is the remainder.` : t;
			},
			lit: [...ids, `minus${i}`, `rule${i}`, ...pIds, ...dIds, 'rlabel'],
			view: { top: 0, left: 0, bottom: row, right: col(i) }
		});
		if (last) {
			remIds = dIds;
			break;
		}

		const next = n[i + 1];
		const bId = `b${i + 1}`;
		cells.push({ kind: 'box', row, col: col(i + 1), id: bId });
		boxes.push({ id: bId, digit: next });
		steps.push({
			kind: 'bringDown',
			boxes: [bId],
			prompt: () => `Bring down the ${next}.`,
			lit: [...dIds, `n${i + 1}`, bId],
			view: { top: 0, left: 0, bottom: row, right: col(i + 1) },
			slide: { row: 1, col: col(i + 1) }
		});
		partial = diff * 10 + next;
		partialIds = [...dIds, bId];
		viewBottom = row;
		m = i - (dDigits.length - 1);
		row++;
	}
	const quotient = Math.floor(dividend / divisor);
	const remainder = dividend % divisor;
	return {
		title: `${dividend} ÷ ${divisor}`,
		rows: row + 1,
		cols: dv.length + a,
		cells,
		boxes,
		answerBoxes: [...qIds, ...remIds],
		remainderBoxes: remIds,
		answer: `${quotient} R ${remainder}`,
		steps
	};
}

/** Count up (division): where a count stands against the partial. */
export function countState(partial: number, divisor: number, count: number): 'over' | 'under' | 'right' {
	const left = partial - count * divisor;
	return left < 0 ? 'over' : left >= divisor ? 'under' : 'right';
}
export function countNudge(partial: number, divisor: number, count: number): string | null {
	switch (countState(partial, divisor, count)) {
		case 'over':
			return `${count} × ${divisor} = ${count * divisor}, more than ${partial}. Step down.`;
		case 'under':
			return `${divisor} still fits into what’s left.`;
		default:
			return null;
	}
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
export const isRight = (sheet: Sheet, v: Values, id: string) => v[id] === String(boxOf(sheet, id).digit);
export const isWrong = (sheet: Sheet, v: Values, id: string) => !!v[id] && !isRight(sheet, v, id);
export const allRight = (sheet: Sheet, v: Values) => sheet.answerBoxes.every((id) => isRight(sheet, v, id));
export const allFilled = (sheet: Sheet, v: Values) => sheet.answerBoxes.every((id) => !!v[id]);

// --- making division problems ---

type Rand = () => number;
const rand = (lo: number, hi: number, r: Rand = Math.random) => lo + Math.floor(r() * (hi - lo + 1));

export type DividePlan = { count: number; dividends: [number, number]; divisors: [number, number]; remainders: boolean };
export type MultiplyPlan = { count: number; tops: [number, number]; bottoms: [number, number] };
export type Plan = DividePlan | MultiplyPlan;

const DIVIDENDS: [number, number] = [10, 999999];
const DIVISORS: [number, number] = [2, 9999];
const DIVIDE_PLAN: DividePlan = { count: 16, dividends: [100, 999], divisors: [2, 9], remainders: true };

function makeDivide(plan: DividePlan, r: Rand): { dividend: number; divisor: number } | null {
	const [lo0, hi0] = plan.dividends;
	const [dlo, dhi] = plan.divisors;
	const divisor = dlo + rand(0, dhi - dlo, r);
	const d = rand(len(lo0), len(hi0), r);
	const lo = Math.max(10 ** (d - 1), lo0, divisor);
	const hi = Math.min(10 ** d - 1, hi0);
	if (hi < lo) return null;
	if (plan.remainders) return { dividend: rand(lo, hi, r), divisor };
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

function parseDividePlan(raw: unknown): DividePlan {
	const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const count = Number(t.count);
	return {
		count: Number.isInteger(count) && count >= 1 && count <= 100 ? count : DIVIDE_PLAN.count,
		dividends: range(t.dividends ?? digitRange(t.dividendDigits), DIVIDENDS, DIVIDE_PLAN.dividends),
		divisors: range(t.divisorDigits === 2 ? [11, 99] : t.divisors, DIVISORS, DIVIDE_PLAN.divisors),
		remainders: remaindersOn(t.remainders)
	};
}

// --- multiplication ---

const TOPS: [number, number] = [10, 9999];
const BOTTOMS: [number, number] = [2, 999];

export function checkMultiply(top: number, bottom: number): string | null {
	if (!Number.isInteger(top) || top < TOPS[0] || top > TOPS[1]) return 'The top number needs two to four digits, 10 to 9,999.';
	if (!Number.isInteger(bottom) || bottom < BOTTOMS[0] || bottom > BOTTOMS[1]) return 'The bottom number needs to be 2 to 999.';
	if (len(bottom) > len(top)) return 'The number with more digits goes on top.';
	return null;
}

const reversed = (n: number) => [...String(n)].reverse().map(Number);
const PLACES = ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands', 'hundred thousands'];
const ROW_PLACES = ['ones', 'tens', 'hundreds'];

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

export function multiplySheet(problem: { top: number; bottom: number }): Sheet {
	const { top, bottom } = problem;
	const t = reversed(top);
	const b = reversed(bottom);
	const product = top * bottom;
	const L = len(product);
	const colOf = (p: number) => L - p;
	const cols = L + 1;
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
	t.forEach((d, k) => cells.push({ kind: 'given', row: m, col: colOf(k), text: String(d), key: `t${k}` }));
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
				prompt: () => `We’re multiplying by the ${bd} ${ROW_PLACES[n]} now. What goes in the ${PLACES[e]} place?`,
				told: () => `We’re multiplying by the ${bd} ${ROW_PLACES[n]} now, so a 0 holds the ${PLACES[e]} place.`,
				lit: [`m${n}`, id],
				view
			});
		}
		if (bd === 0) {
			const id = `${letter}${n}`;
			ids.push(id);
			add([{ id, digit: 0, row: r, col: colOf(n) }], {
				kind: 'multiply',
				prompt: () => `What is 0 × ${top}?`,
				told: () => 'Anything times 0 is 0, so this row is 0.',
				lit: [`m${n}`, ...t.map((_, k) => `t${k}`), id],
				view
			});
		} else
			t.forEach((td, i) => {
				const value = part.values[i];
				const carryIn = part.carries[i];
				const carryId = `${letter}c${i}`;
				const lastDigit = i === t.length - 1;
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
					prompt: (v) =>
						carryIn > 0 ? `What is ${bd} × ${td}? Then add the ${carried(v)} you carried.` : `What is ${bd} × ${td}?`,
					told: (v) =>
						(carryIn > 0
							? `${bd} × ${td} = ${bd * td}, and ${bd * td} + the ${carried(v)} you carried = ${value}.`
							: `${bd} × ${td} = ${value}.`) + (carryBox ? ` The ${out} is carried, over the ${t[i + 1]}.` : ''),
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
		return c && c.kind === 'box' ? L - c.col : -1;
	};
	const digitOf = (id: string) => boxes.find((x) => x.id === id)?.digit ?? 0;

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
				prompt: (v) => {
					const xs = ops.map((o) => val(v, o, digitOf(o)));
					const c = carryIn > 0 ? val(v, carryId, carryIn) : 0;
					if (!xs.length) return `Write the ${c} you carried.`;
					if (xs.length === 1 && !c) return `Bring down the ${xs[0]}: there’s nothing to add to it.`;
					return `What is ${xs.join(' + ')}${c ? ` + the ${c} you carried` : ''}?`;
				},
				lit: ['plus', 'rule1', ...ops, ...(carryIn > 0 ? [carryId] : []), id],
				view
			});
			const out = sc[p + 1] ?? 0;
			if (out > 0 && p + 1 < sum.length)
				add([{ id: `sc${p + 1}`, digit: out, row: sumCarryRow, col: colOf(p + 1), small: true }], {
					kind: 'sumCarry',
					prompt: () => `Carry the ${out} to the ${PLACES[p + 1]}, up here.`,
					told: () => `The ${out} is carried to the ${PLACES[p + 1]}.`,
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
function makeMultiply(plan: MultiplyPlan, r: Rand): { top: number; bottom: number } | null {
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
		bottoms: range(t.bottoms, BOTTOMS, MULTIPLY_PLAN.bottoms)
	}).plan;
}

// --- the two kinds ---

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
	check: (a: number, b: number) => string | null;
	sheet: (p: Problem) => Sheet;
	settings: {
		fresh: () => Plan;
		parse: (raw: unknown) => Plan;
		generate: (plan: Plan, r?: Rand, existing?: Problem[]) => Problem[];
		ranges: { key: RangeKey; name: string; limits: [number, number] }[];
		switches: { key: 'remainders'; name: string; about: string }[];
		fix: (plan: Plan) => { plan: Plan; note: string | null };
	};
	levels: Level[];
	levelText?: Partial<Record<Level, string>>;
	studentLevelText?: Partial<Record<Level, string>>;
	steps: string[];
	tagline: string;
};

const LEVELS: Level[] = ['watch', 'countUp', 'guided', 'prompted', 'onMyOwn'];

export const KINDS: KindInfo[] = [
	{
		name: 'divide',
		title: 'Long division',
		sign: '÷',
		labels: ['number to divide', 'divide by'],
		widths: [6, 4],
		setSize: DIVIDE_PLAN.count,
		makeSet: (r, n) => divideSet({ ...DIVIDE_PLAN, count: n }, r).map((p) => [p.dividend, p.divisor]),
		check: checkDivide,
		sheet: ([a, b]) => divideSheet({ dividend: a, divisor: b }),
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
				{ key: 'dividends', name: 'Dividend', limits: DIVIDENDS },
				{ key: 'divisors', name: 'Divisor', limits: DIVISORS }
			],
			switches: [
				{
					key: 'remainders',
					name: 'Remainders',
					about: 'On, problems leave a remainder as often as they happen to. Off, every problem divides evenly.'
				}
			],
			fix: (plan) => {
				const p = plan as DividePlan;
				const sort = ([a, b]: [number, number]): [number, number] => [Math.min(a, b), Math.max(a, b)];
				return { plan: { ...p, dividends: sort(p.dividends), divisors: sort(p.divisors) }, note: null };
			}
		},
		levels: LEVELS,
		steps: [
			'Divide: how many times does the divisor go in?',
			'Multiply, and write the product underneath.',
			'Subtract, then bring down the next digit.',
			'Repeat until there’s nothing to bring down: what’s left is the remainder.'
		],
		tagline: 'Up to six digits divided by up to four digits, grades 4 to 6.'
	},
	{
		name: 'multiply',
		title: 'Multiplication',
		sign: '×',
		labels: ['top number', 'bottom number'],
		widths: [4, 3],
		setSize: MULTIPLY_PLAN.count,
		makeSet: (r, n) => multiplySet({ ...MULTIPLY_PLAN, count: n }, r).map((p) => [p.top, p.bottom]),
		check: checkMultiply,
		sheet: ([a, b]) => multiplySheet({ top: a, bottom: b }),
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
				{ key: 'tops', name: 'Top number', limits: TOPS },
				{ key: 'bottoms', name: 'Bottom number', limits: BOTTOMS }
			],
			switches: [],
			fix: (plan) => {
				const f = fixMultiplyPlan(plan as MultiplyPlan);
				return { plan: f.plan, note: f.swapped ? 'Swapped: the bigger number goes on top.' : null };
			}
		},
		levels: LEVELS,
		levelText: { countUp: 'They skip-count with ▲ to find each product, and the page writes it in. They type the adding.' },
		studentLevelText: { countUp: 'Skip-count with ▲ to find each product, and the page writes it in. Then type the adding.' },
		steps: [
			'Multiply the top number by the bottom number’s ones, right to left, carrying as you go.',
			'Start each next row with a placeholder zero for each place it moves over, then multiply by the next digit.',
			'Add the rows.'
		],
		tagline: 'Up to four digits times up to three digits, grades 4 and 5.'
	}
];
export const kindInfo = (k: Kind): KindInfo => KINDS.find((x) => x.name === k)!;

export const FLAG_INFO: { name: Flag; label: string; detail: string }[] = [
	{ name: 'spotlight', label: 'Spotlight', detail: 'Only the numbers for this step at full strength.' },
	{ name: 'prompt', label: 'Prompt', detail: 'Ask each step as a question.' },
	{ name: 'zoom', label: 'Zoom', detail: 'Move in on the step being worked.' },
	{ name: 'build', label: 'Build as you go', detail: 'Each box, sign and line appears when its step comes up.' },
	{ name: 'drawSigns', label: 'Draw the signs', detail: 'Draw the − and the line as each row begins.' },
	{ name: 'bringDown', label: 'Bring down for me', detail: 'Slide the next digit down after each subtraction.' },
	{ name: 'markNow', label: 'Mark mistakes now', detail: 'Show a wrong digit when it’s typed, not at Check.' }
];
const ALL: Flags = { spotlight: true, prompt: true, zoom: true, build: true, drawSigns: true, bringDown: true, markNow: true };
const NONE: Flags = { spotlight: false, prompt: false, zoom: false, build: false, drawSigns: false, bringDown: false, markNow: false };

export type LevelInfo = { name: Level; label: string; way: 'watch' | 'countUp' | 'type'; flags: Flags; scored: boolean; detail: string };
export const LEVEL_INFO: LevelInfo[] = [
	{ name: 'watch', label: 'Watch', way: 'watch', flags: ALL, scored: false, detail: 'Next does one step at a time. Nothing to type.' },
	{ name: 'countUp', label: 'Count up', way: 'countUp', flags: ALL, scored: true, detail: 'Step each quotient digit up until the next one is too big.' },
	{ name: 'guided', label: 'Guided', way: 'type', flags: ALL, scored: true, detail: 'Type every digit. The box to fill lights up, with a question for each step.' },
	{ name: 'prompted', label: 'Prompted', way: 'type', flags: { ...NONE, prompt: true, build: true }, scored: true, detail: 'Type every digit, with a question for each step.' },
	{ name: 'onMyOwn', label: 'On my own', way: 'type', flags: NONE, scored: true, detail: 'Every box from the start, checked at the end.' }
];
export const levelInfo = (l: Level): LevelInfo | undefined => LEVEL_INFO.find((x) => x.name === l);

export const MAX_PROBLEMS = 100;
export type Settings = { level: Level; custom: Flags; perStudent: boolean };
export const freshSettings = (): Settings => ({ level: 'guided', custom: { ...ALL }, perStudent: false });

export const flagsCode = (f: Flags) => FLAG_INFO.map(({ name }) => (f[name] ? '1' : '0')).join('');
export function parseFlags(code: unknown): Flags {
	const f = { ...ALL };
	if (typeof code === 'string' && /^[01]{7}$/.test(code)) FLAG_INFO.forEach(({ name }, i) => (f[name] = code[i] === '1'));
	return f;
}

/** The problems that work for this kind (numbers as text are taken as numbers), at most 100. */
export function validProblems(raw: unknown, kind: Kind): Problem[] {
	if (!Array.isArray(raw)) return [];
	const out: Problem[] = [];
	for (const p of raw) {
		if (!Array.isArray(p)) continue;
		const [a, b] = p.map(Number);
		if (kindInfo(kind).check(a, b) === null) out.push([a, b]);
	}
	return out.slice(0, MAX_PROBLEMS);
}
const levelOr = (l: unknown, kind: Kind): Level =>
	l === 'custom' || (LEVEL_INFO.some((x) => x.name === l) && kindInfo(kind).levels.includes(l as Level)) ? (l as Level) : 'guided';

/** What a student plays: the kind, the problems, the support and (for a fresh set each time) the plan. */
export type Playable = { kind: Kind; problems: Problem[]; settings: Settings; plan: Plan };

/** One question-set item as Oomba keeps it (no title: nothing typed as free text leaves the teacher's save). */
export type Item = { k: Kind; p: Problem[]; l: Level; c?: string; d?: 1; g?: Plan };

/** An item from a link, checked the way links always were: bad problems dropped; none left (and not a fresh set for
 *  each student) means no activity. */
export function parseItem(raw: unknown): Playable | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	const kind: Kind = o.k === 'multiply' ? 'multiply' : 'divide';
	const problems = validProblems(o.p, kind);
	const perStudent = o.d === 1;
	if (!problems.length && !perStudent) return null;
	const s = kindInfo(kind).settings;
	return {
		kind,
		problems,
		settings: { level: levelOr(o.l, kind), custom: parseFlags(o.c), perStudent },
		plan: o.g ? s.parse(o.g) : s.fresh()
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
	return item;
}
export function cleanPlan(kind: Kind, plan: Plan): Plan {
	if (kind === 'divide') {
		const p = plan as DividePlan;
		return { count: p.count, dividends: [p.dividends[0], p.dividends[1]], divisors: [p.divisors[0], p.divisors[1]], remainders: !!p.remainders };
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

export const showAnswer = (s: string) => s.replace(' R 0', '');
