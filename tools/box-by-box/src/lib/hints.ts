// Hints for a student who is stuck on a step: from the idea of the step, to the numbers to work with, to the digits for
// this step's boxes (the last one, only when they ask for it). Built from the sheet's own step, so they fit any problem.

import { boxOf, type Sheet, type Values } from './logic';

const PLACES = ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands', 'hundred thousands'];
/** Count by n, `times` times: "4, 8, 12". */
const countBy = (n: number, times: number) => Array.from({ length: times }, (_, i) => n * (i + 1)).join(', ');

/** The hints for step i of a sheet, easiest first. */
export function hintsFor(sheet: Sheet, i: number, v: Values): string[] {
	const st = sheet.steps[i];
	if (!st) return [];
	if (st.hints) return st.hints(v);
	const digits = st.boxes.filter((id) => !id.includes('c') || id.startsWith('s')).map((id) => boxOf(sheet, id).digit).join('');
	const asked = st.prompt(v);
	switch (st.kind) {
		case 'divide': {
			const { partial, divisor: d } = st.countUp!;
			const q = Math.floor(partial / d);
			const upTo = Math.min(9, q + 1);
			return [
				`Divide: how many ${d}s fit into ${partial} without going over? It can be 0.`,
				`Count up by ${d}s: ${countBy(d, upTo)}. Which is the biggest that isn’t more than ${partial}?`,
				q === 0
					? `${d} is more than ${partial}, so it goes 0 times. Write 0.`
					: `${q} × ${d} = ${q * d}${q < 9 ? `, and ${q + 1} × ${d} = ${(q + 1) * d} is more than ${partial}` : ''}. Write ${q}.`
			];
		}
		case 'multiply': {
			const sc = st.skipCount;
			if (!sc) {
				// long division: the quotient digit times the divisor
				return [
					`Multiply: the digit you just wrote on top, times the number you’re dividing by.`,
					asked,
					`It’s ${digits}. Write it under the digits you divided into, lined up on the right.`
				];
			}
			if (sc.by === 0 || sc.times === 0) return [`Anything times 0 is 0.`, st.told ? st.told(v) : `It’s 0.`];
			return [
				`Multiply the ${sc.by} by the ${sc.times}${sc.carry ? `, then add the ${sc.carry} you carried` : ''}.`,
				`Count by ${sc.by}s, ${sc.times} times: ${countBy(sc.by, sc.times)}.${sc.carry ? ` Then add ${sc.carry}.` : ''}`,
				st.told ? st.told(v) : `It’s ${digits}.`
			];
		}
		case 'subtract':
			return [
				`Subtract: take the number you just wrote away from the number above it.`,
				asked,
				`It’s ${digits}.`
			];
		case 'bringDown':
			return [`Bring down: copy the next digit of the number you’re dividing straight down, beside what’s left.`, asked];
		case 'zero':
			return [`Each new row moves one place to the left, because you’re multiplying by tens (or hundreds) now.`, st.told ? st.told(v) : asked];
		case 'add':
			return [`Add the digits in this column, plus any number carried into it.`, asked, `It’s ${digits}.`];
		case 'sumCarry': {
			const col = sheet.cells.find((c): c is Extract<typeof c, { kind: 'box' }> => c.kind === 'box' && c.id === st.boxes[0]);
			const place = col ? PLACES[sheet.cols - 1 - col.col] : '';
			return [`That column added up to 10 or more, so the tens move to the next column${place ? `, the ${place}` : ''}.`, asked];
		}
		default:
			return [asked];
	}
}
