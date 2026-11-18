// The Big Divide: decimal numbers, as text and as whole numbers of hundredths (or tenths), so the sheets never do
// arithmetic on floating point. No platform calls and no DOM here, so it runs as it is in Node too.

/** How many decimal places a number is written with: 12.6 -> 1, 7 -> 0 (99 for one too small or big to write plainly). */
export function placesOf(x: number): number {
	if (!Number.isFinite(x)) return 99;
	const s = String(x);
	if (/e/i.test(s)) return 99;
	const i = s.indexOf('.');
	return i < 0 ? 0 : s.length - i - 1;
}
export const isDecimal = (x: number) => placesOf(x) > 0;
/** x times 10^k, as a whole number: scaled(12.6, 1) -> 126. */
export const scaled = (x: number, k: number): number => {
	const [i, f = ''] = String(x).split('.');
	return Number(i + f.padEnd(k, '0').slice(0, k));
};
/** A whole number of 10^-k as a number: unscaled(126, 1) -> 12.6. */
export const unscaled = (n: number, k: number): number => Number(asText(n, k));
/** A whole number of 10^-k written out: asText(5, 2) -> "0.05", asText(300, 2) -> "3.00". */
export function asText(n: number, k: number): string {
	const neg = n < 0;
	const s = String(Math.abs(n)).padStart(k + 1, '0');
	const t = k ? `${s.slice(0, -k)}.${s.slice(-k)}` : s;
	return neg ? `-${t}` : t;
}
/** The number with its decimal point moved k places right, as written on paper: (4.5, 1) -> "45", (4.56, 1) -> "45.6",
 *  (4.5, 2) -> "450", (0.84, 1) -> "8.4", (0.05, 1) -> "0.5". */
export function shiftPoint(x: number, k: number): string {
	const [i, f = ''] = String(x).split('.');
	const int = (i + f.slice(0, k).padEnd(k, '0')).replace(/^0+(?=\d)/, '');
	const frac = f.slice(k);
	return frac ? `${int}.${frac}` : int;
}
/** Digits, with where the point goes: "12.6" -> { digits: [1, 2, 6], intLen: 2, places: 1 }. */
export function digitsOfText(t: string): { digits: number[]; intLen: number; places: number } {
	const [i, f = ''] = t.split('.');
	return { digits: [...(i + f)].map(Number), intLen: i.length, places: f.length };
}
/** How a number reads in a sentence: 1234.5 stays 1234.5 (as it is written on the paper). */
export const say = (x: number | string) => String(x);
const PLACE_WORDS = ['ones', 'tenths', 'hundredths', 'thousandths'];
export const placeWord = (k: number) => PLACE_WORDS[k] ?? `${k} decimal places`;
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
