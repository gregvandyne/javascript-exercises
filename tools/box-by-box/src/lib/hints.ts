// Hints for a student who is stuck on a step: from the idea of the step, to the numbers to work with, to the digits for
// this step's boxes (the last one, only when they ask for it). Built from the sheet's own step, so they fit any problem.

import { boxOf, PLACES, type Sheet, type Values } from './logic';
import { t, tn } from './i18n';

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
				t('h.div.divide1', { d, p: partial }),
				t('h.div.divide2', { d, list: countBy(d, upTo), p: partial }),
				q === 0
					? t('h.div.divide3zero', { d, p: partial })
					: q < 9
						? t('h.div.divide3', { q, d, x: q * d, q1: q + 1, x1: (q + 1) * d, p: partial })
						: t('h.div.divide3nine', { q, d, x: q * d })
			];
		}
		case 'multiply': {
			const sc = st.skipCount;
			if (!sc) {
				// long division: the quotient digit times the divisor
				return [t('h.div.multiply1'), asked, t('h.div.multiply3', { x: digits })];
			}
			// (times 0: start at 0 and count 0 times, the same way as any count)
			if (sc.by === 0 || sc.times === 0) return [tn('h.mul.zero', sc.times, { a: sc.by }), st.told ? st.told(v) : t('h.its', { x: 0 })];
			return [
				t(sc.carry ? 'h.mul.mul1carry' : 'h.mul.mul1', { a: sc.by, b: sc.times, c: sc.carry }),
				t(sc.carry ? 'h.mul.mul2carry' : 'h.mul.mul2', { a: sc.by, b: sc.times, list: countBy(sc.by, sc.times), c: sc.carry }),
				st.told ? st.told(v) : t('h.its', { x: digits })
			];
		}
		case 'subtract':
			return [t('h.div.subtract1'), asked, t('h.its', { x: digits })];
		case 'bringDown':
			return [t('h.div.bringDown1'), asked];
		case 'zero':
			return [t('h.mul.zero1'), st.told ? st.told(v) : asked];
		case 'add':
			return [t('h.add1'), asked, t('h.its', { x: digits })];
		case 'sumCarry': {
			const col = sheet.cells.find((c): c is Extract<typeof c, { kind: 'box' }> => c.kind === 'box' && c.id === st.boxes[0]);
			const place = col ? PLACES[sheet.cols - 1 - col.col] : '';
			return [place ? t('h.mul.sumCarry1', { p: t(`w.place.${place}`) }) : t('h.mul.sumCarry1none'), asked];
		}
		default:
			return [asked];
	}
}
