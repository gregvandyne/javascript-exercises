// The Big Divide: addition and subtraction in columns, box by box. Addition carries a 1 into a small box over the next
// column; subtraction regroups (borrows): the digit it borrows from is crossed out and its new digit written over it,
// and the column that borrows gets a small 1 in front (2 becomes 12). Across zeros (400 − 167), the zeros become 10 and
// then 9 on the way, each step a box. Decimals line up their points in a column of their own, and the point comes
// straight down into the answer. No platform calls and no DOM here, so it runs as it is in Node too.

import type { Box, Cell, Sheet, Step, View } from './logic.ts';
import { asText, placesOf, plural, scaled } from './numbers.ts';

const WHOLE = ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands'];
const PART = ['tenths', 'hundredths'];
const ONE = { ones: 'one', tens: 'ten', hundreds: 'hundred', thousands: 'thousand', 'ten thousands': 'ten thousand', tenths: 'tenth', hundredths: 'hundredth' } as Record<string, string>;

/** The columns of a problem in columns: each number's digits by place (0 the rightmost), lined up by their points. */
function lineUp(top: number, bottom: number, answer: (x: number, y: number) => number) {
	const P = Math.max(placesOf(top), placesOf(bottom));
	const X = scaled(top, P);
	const Y = scaled(bottom, P);
	const Z = answer(X, Y);
	// a decimal less than 1 still has its ones digit (0.75)
	const digits = (n: number) => [...String(n).padStart(P + 1, '0')].reverse().map(Number);
	const x = digits(X);
	const y = digits(Y);
	const z = digits(Z);
	const n = Math.max(x.length, y.length, z.length);
	// digits side by side; the points on the line after the ones
	const W = n;
	const colOf = (p: number) => W - p;
	const pointCol = W - P;
	const name = (p: number) => (p >= P ? WHOLE[p - P] : PART[P - p - 1]) ?? `${p}`;
	return { P, X, Y, Z, x, y, z, n, W, colOf, pointCol, name };
}

type Placed = { id: string; digit: number | string; row: number; col: number; small?: boolean; corner?: boolean; point?: boolean };

function builder() {
	const cells: Cell[] = [];
	const boxes: Box[] = [];
	const steps: Step[] = [];
	const add = (list: Placed[], step: Omit<Step, 'boxes'>) => {
		for (const b of list) {
			cells.push({ kind: 'box', row: b.row, col: b.col, id: b.id, ...(b.small ? { small: true } : {}), ...(b.corner ? { corner: true } : {}), ...(b.point ? { point: true } : {}) });
			boxes.push({ id: b.id, digit: b.digit });
		}
		steps.push({ ...step, boxes: list.map((b) => b.id) });
	};
	return { cells, boxes, steps, add };
}

/** The numbers as given: digits by place (a decimal's padded zeros faint), the point on its own column, the sign. */
function given(cells: Cell[], L: ReturnType<typeof lineUp>, sign: string, digitsTop: number, digitsBottom: number) {
	const write = (ds: number[], row: number, key: string, count: number, padFrom: number) => {
		ds.slice(0, count).forEach((d, p) => cells.push({ kind: 'given', row, col: L.colOf(p), text: String(d), key: `${key}${p}`, ...(p < padFrom ? { faint: true } : {}) }));
		if (L.P) cells.push({ kind: 'given', row, col: L.pointCol, text: '.', key: `${key}pt`, dot: true });
	};
	write(L.x, 1, 't', digitsTop, 0);
	write(L.y, 2, 'm', digitsBottom, 0);
	cells.push({ kind: 'given', row: 2, col: 0, text: sign, key: 'sign' });
	cells.push({ kind: 'rule', row: 2, from: 0, to: L.W + 1, key: 'rule' });
}
/** Zeros a decimal is padded with so the points line up (3.5 over 2.75 is 3.50): faint, they hold the place. */
function padFaint(cells: Cell[], top: number, bottom: number, P: number) {
	const pt = placesOf(top);
	const pb = placesOf(bottom);
	for (const c of cells)
		if (c.kind === 'given') {
			const m = /^(t|m)(\d+)$/.exec(c.key);
			if (m && Number(m[2]) < P - (m[1] === 't' ? pt : pb)) c.faint = true;
		}
}
/** How many digits a number shows: its own, but at least up to the ones place. */
const shows = (n: number, P: number) => Math.max(String(n).length, P + 1);

function pointStep(b: ReturnType<typeof builder>, L: ReturnType<typeof lineUp>, view: View) {
	b.add([{ id: 'ap', digit: '.', row: 3, col: L.pointCol, point: true }], {
		kind: 'point',
		prompt: () => 'Bring the decimal point straight down into the answer.',
		told: () => 'The decimal point comes straight down into the answer.',
		hints: () => ['The points stay lined up: the answer’s point goes right under the others.', 'Type a . (the decimal point) in the lit box.'],
		lit: ['tpt', 'mpt', 'ap'],
		view
	});
}

// --- addition ---

export function addSheet({ top, bottom }: { top: number; bottom: number }): Sheet {
	const L = lineUp(top, bottom, (x, y) => x + y);
	const b = builder();
	const { cells } = b;
	given(cells, L, '+', shows(L.X, L.P), shows(L.Y, L.P));
	padFaint(cells, top, bottom, L.P);
	const view: View = { top: 0, left: 0, bottom: 3, right: L.W };
	const zDigits = shows(L.Z, L.P);
	const has = (ds: number[], N: number, p: number) => p < shows(N, L.P) && p < ds.length;
	let carry = 0;
	const answerBoxes: string[] = [];
	for (let p = 0; p < zDigits; p++) {
		if (L.P && p === L.P) {
			pointStep(b, L, view);
			answerBoxes.push('ap');
		}
		const xs = has(L.x, L.X, p) ? [L.x[p]] : [];
		const ys = has(L.y, L.Y, p) ? [L.y[p]] : [];
		const sum = [...xs, ...ys].reduce((s, d) => s + d, 0) + carry;
		const c = carry;
		const id = `a${p}`;
		answerBoxes.push(id);
		const place = L.name(p);
		const parts = [...xs, ...ys];
		const asked = !parts.length
			? `Write the ${c} you carried.`
			: parts.length === 1 && !c
				? `Bring down the ${parts[0]}: there’s nothing to add to it.`
				: `What is ${parts.join(' + ')}${c ? ` + the ${c} you carried` : ''}?`;
		const counts = parts.length > 0;
		b.add([{ id, digit: sum % 10, row: 3, col: L.colOf(p) }], {
			kind: 'add',
			prompt: () => asked,
			told: () => (parts.length ? `${parts.join(' + ')}${c ? ` + ${c}` : ''} = ${sum}.` : `The ${c} you carried.`) + (sum >= 10 ? ` Write the ${sum % 10}.` : ''),
			hints: () => [
				`Add the ${place} column, top and bottom${c ? `, and the ${c} you carried` : ''}.`,
				parts.length > 1 ? `${parts[0]} + ${parts[1]}: count up ${plural(parts[1], 'more', 'more')} from ${parts[0]}${c ? `, then 1 more for the carry` : ''}.` : asked,
				sum >= 10 ? `${sum}: write the ${sum % 10} here, and the 1 is carried to the ${L.name(p + 1)}.` : `It’s ${sum}.`
			],
			lit: [...(xs.length ? [`t${p}`] : []), ...(ys.length ? [`m${p}`] : []), ...(c ? [`c${p}`] : []), 'sign', 'rule', id],
			view,
			...(counts
				? { skipCount: { by: 1, times: ys.length ? ys[0] : c, start: xs.length ? xs[0] + (ys.length ? c : 0) : c, carry: 0, row: 3, onesCol: L.colOf(p), words: 'add' as const } }
				: {})
		});
		carry = sum >= 10 ? 1 : 0;
		// the carry goes over the next column, small; past the last digits it is written in the answer itself
		const next = p + 1;
		if (carry && (has(L.x, L.X, next) || has(L.y, L.Y, next))) {
			const cid = `c${next}`;
			b.add([{ id: cid, digit: 1, row: 0, col: L.colOf(next), small: true }], {
				kind: 'carry',
				prompt: () => `${sum} ${place} is 1 ${ONE[L.name(next)]} and ${sum % 10} ${place}: carry the 1 to the ${L.name(next)}, up here.`,
				told: () => `The 1 is carried to the ${L.name(next)}.`,
				hints: () => [`Ten ${place} make 1 ${ONE[L.name(next)]}: it goes on top of the ${L.name(next)} column.`, 'Type 1 in the small box.'],
				lit: [id, cid],
				view
			});
		}
	}
	return {
		title: `${top} + ${bottom}`,
		rows: 4,
		cols: L.W + 1,
		cells,
		boxes: b.boxes,
		answerBoxes: answerBoxes.reverse(),
		answer: asText(L.Z, L.P),
		steps: b.steps
	};
}

// --- subtraction ---

export function subtractSheet({ top, bottom }: { top: number; bottom: number }): Sheet {
	const L = lineUp(top, bottom, (x, y) => x - y);
	const b = builder();
	const { cells } = b;
	const nTop = shows(L.X, L.P);
	given(cells, L, '−', nTop, shows(L.Y, L.P));
	padFaint(cells, top, bottom, L.P);
	const crossedBy: Record<string, string> = {};
	const cross = (key: string, by: string) => {
		const c = cells.find((x) => x.kind === 'given' && x.key === key);
		if (c && c.kind === 'given') c.crossBy = by;
		else crossedBy[key] = by;
	};
	const view: View = { top: 0, left: 0, bottom: 3, right: L.W };
	const nudge = (p: number) => {
		const c = cells.find((x) => x.kind === 'given' && x.key === `t${p}`);
		if (c && c.kind === 'given') c.nudge = true;
	};
	// each column's value as it stands, and where it is written: the given digit, or the new digit over it
	const cur = L.x.slice(0, nTop);
	const shownAt: ('t' | 'w')[] = cur.map(() => 't');
	const bottomAt = (p: number) => (p < shows(L.Y, L.P) ? L.y[p] : 0);
	const zShown = shows(L.Z, L.P);
	const answerBoxes: string[] = [];
	const said = (p: number) => (shownAt[p] === 't' ? `t${p}` : `w${p}`);
	for (let p = 0; p < nTop; p++) {
		if (L.P && p === L.P) {
			pointStep(b, L, view);
			answerBoxes.push('ap');
		}
		const bd = bottomAt(p);
		const place = L.name(p);
		if (cur[p] < bd) {
			let k = p + 1;
			while (cur[k] === 0) k++;
			const was = cur[p];
			const middle = Array.from({ length: k - p - 1 }, (_, i) => p + 1 + i);
			const lenderWas = cur[k];
			// the lender: cross it out, one less over it
			cur[k] -= 1;
			const wk = `w${k}`;
			cross(said(k), wk);
			shownAt[k] = 'w';
			b.add([{ id: wk, digit: cur[k], row: 0, col: L.colOf(k), small: true }], {
				kind: 'borrow',
				prompt: () =>
					middle.length
						? `${was} is less than ${bd}, and there’s nothing to regroup in the ${middle.map((m) => L.name(m)).reverse().join(' or the ')}. Go to the ${L.name(k)}: cross out the ${lenderWas} and write ${lenderWas - 1} over it.`
						: `${was} is less than ${bd}, so regroup: take 1 from the ${L.name(k)}. Cross out the ${lenderWas} and write ${lenderWas - 1} over it.`,
				told: () => `Regroup: 1 ${ONE[L.name(k)]} is taken from the ${L.name(k)}, so the ${lenderWas} becomes ${lenderWas - 1}.`,
				hints: () => [
					`You can’t take ${bd} from ${was}, so take 1 from the next place that has one: the ${L.name(k)}.`,
					`The ${lenderWas} gets crossed out, and ${lenderWas - 1} goes in the small box over it.`,
					`It’s ${lenderWas - 1}.`
				],
				lit: [`t${k}`, wk, `t${p}`, `m${p}`],
				view
			});
			// across zeros: each 0 becomes 10, then gives 1 on and is 9
			for (const m of [...middle].reverse()) {
				const om = `o${m}`;
				nudge(m);
				b.add([{ id: om, digit: 1, row: 1, col: L.colOf(m), corner: true }], {
					kind: 'borrow',
					prompt: () => `The 1 ${ONE[L.name(m + 1)]} is 10 ${L.name(m)}: write a small 1 in front of the 0 to make 10.`,
					told: () => `The 0 ${L.name(m)} become 10 ${L.name(m)}.`,
					hints: () => [`1 ${ONE[L.name(m + 1)]} is the same as 10 ${L.name(m)}.`, 'Type 1 in the small box in front of the 0.'],
					lit: [`w${m + 1}`, `t${m}`, om],
					view
				});
				const wm = `w${m}`;
				cross(`t${m}`, wm);
				crossedBy[om] = wm;
				cur[m] = 9;
				shownAt[m] = 'w';
				b.add([{ id: wm, digit: 9, row: 0, col: L.colOf(m), small: true }], {
					kind: 'borrow',
					prompt: () => `Now take 1 of those 10 ${L.name(m)} for the ${L.name(m - 1)}: cross out the 10 and write 9.`,
					told: () => `10 − 1 = 9: the 10 becomes 9.`,
					hints: () => ['One of the 10 goes on to the next place to the right, so 9 are left.', 'It’s 9.'],
					lit: [`t${m}`, om, wm],
					view
				});
			}
			// the column that borrows: a small 1 in front makes it 10 more
			const op = `o${p}`;
			const onW = shownAt[p] === 'w';
			if (!onW) nudge(p);
			b.add([{ id: op, digit: 1, row: onW ? 0 : 1, col: L.colOf(p), corner: true }], {
				kind: 'borrow',
				prompt: () => `The ${place} get 10 more: write a small 1 in front of the ${was} to make ${was + 10}.`,
				told: () => `${was} becomes ${was + 10}.`,
				hints: () => [`1 ${ONE[L.name(p + 1)]} is 10 ${place}, so the ${was} becomes ${was + 10}.`, `Type 1 in the small box in front of the ${was}.`],
				lit: [said(p), op, `w${p + 1}`],
				view
			});
			cur[p] = was + 10;
		}
		const diff = cur[p] - bd;
		const id = `a${p}`;
		// no box for zeros in front of the answer (400 − 367 = 33), but the ones (0.5) always
		if (p >= zShown && diff === 0) continue;
		answerBoxes.push(id);
		const top_ = cur[p];
		b.add([{ id, digit: diff, row: 3, col: L.colOf(p) }], {
			kind: 'subtract',
			prompt: () => (p < shows(L.Y, L.P) ? `What is ${top_} − ${bd}?` : `Bring down the ${top_}: there’s nothing to take away.`),
			told: () => `${top_} − ${bd} = ${diff}.`,
			hints: () => [
				`Subtract in the ${place} column: the top number take away the bottom one.`,
				bd ? `Count up from ${bd} to ${top_}: how many steps is that?` : `Taking away 0 leaves ${top_}.`,
				`It’s ${diff}.`
			],
			lit: [said(p), `o${p}`, `m${p}`, 'sign', 'rule', id],
			view,
			...(p < shows(L.Y, L.P) ? { skipCount: { by: 1, times: diff, start: bd, carry: 0, row: 3, onesCol: L.colOf(p), words: 'sub' as const } } : {})
		});
	}
	return {
		title: `${top} − ${bottom}`,
		rows: 4,
		cols: L.W + 1,
		cells,
		boxes: b.boxes,
		answerBoxes: answerBoxes.reverse(),
		answer: asText(L.Z, L.P),
		steps: b.steps,
		...(Object.keys(crossedBy).length ? { crossedBy } : {})
	};
}

// --- the problems ---

/** Addition and subtraction: whole numbers of 2 to 4 digits; with decimals, more than 0, at most 2 decimal places, at
 *  most 4 whole digits. Subtraction takes the smaller from the bigger. */
export function checkColumns(kind: 'add' | 'subtract', a: number, b: number, numbers: 'whole' | 'decimal' = 'whole'): string | null {
	const ok = (x: number) => (Number.isInteger(x) ? x >= 10 && x <= 9999 : numbers === 'decimal' && x > 0 && x < 10000 && placesOf(x) <= 2);
	if (!Number.isInteger(a) && !Number.isInteger(b) && numbers !== 'decimal') return 'Whole numbers, 10 to 9,999.';
	if (!ok(a)) return numbers === 'decimal' ? 'The top number needs to be 10 to 9,999, or a decimal with at most 2 decimal places.' : 'The top number needs two to four digits, 10 to 9,999.';
	if (!ok(b)) return numbers === 'decimal' ? 'The bottom number needs to be 10 to 9,999, or a decimal with at most 2 decimal places.' : 'The bottom number needs two to four digits, 10 to 9,999.';
	if (kind === 'subtract' && !(a > b)) return 'The top number needs to be bigger than the bottom one.';
	return null;
}
