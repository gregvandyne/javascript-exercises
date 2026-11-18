// Practicing on my own (a student without a teacher's code): long division or multiplication, a level, and the help they
// want; then a fresh set of problems, made at random and never one this student has had lately. The problems they have
// had are kept in their game save (per kind and level, the last 300), so a new set, on any day or device, is new.

import { kindInfo, type Kind, type Level as Mode, type Numbers, type Plan, type Playable, type Problem } from './logic';
import { methodOr, type Method } from './methods';
import { load, store } from './oomba';

export type Hard = 'easy' | 'medium' | 'hard';
export const SET_SIZE = 5;

const PLANS: Record<Kind, Record<Hard, Plan>> = {
	divide: {
		easy: { count: SET_SIZE, dividends: [10, 99], divisors: [2, 5], remainders: 'none' },
		medium: { count: SET_SIZE, dividends: [100, 999], divisors: [2, 9], remainders: 'R' },
		hard: { count: SET_SIZE, dividends: [1000, 9999], divisors: [11, 25], remainders: 'R' }
	},
	multiply: {
		easy: { count: SET_SIZE, tops: [10, 99], bottoms: [2, 9] },
		medium: { count: SET_SIZE, tops: [100, 999], bottoms: [2, 9] },
		hard: { count: SET_SIZE, tops: [100, 999], bottoms: [10, 99] }
	}
};

export const HARDS: { hard: Hard; name: string; about: Record<Kind, string> }[] = [
	{ hard: 'easy', name: 'Easy', about: { divide: '2 digits by 1 digit, like 84 ÷ 4. No remainders.', multiply: '2 digits times 1 digit, like 46 × 3.' } },
	{ hard: 'medium', name: 'Medium', about: { divide: '3 digits by 1 digit, like 735 ÷ 6. Remainders too.', multiply: '3 digits times 1 digit, like 418 × 7.' } },
	{ hard: 'hard', name: 'Hard', about: { divide: '4 digits by 2 digits, like 5184 ÷ 16.', multiply: '3 digits times 2 digits, like 352 × 47.' } }
];
export const HELPS: { mode: Mode; name: string; about: string }[] = [
	{ mode: 'guided', name: 'Guided', about: 'The box to fill lights up, with a question for each step.' },
	{ mode: 'countUp', name: 'Count up', about: 'Count each answer up with ▲, then the page writes it in.' },
	{ mode: 'onMyOwn', name: 'On my own', about: 'Every box from the start, checked at the end.' }
];

/** Whole numbers or decimals (the same sizes, with a point placed in them: 8.4 ÷ 2, 2.4 × 1.3). */
export const NUMBER_KINDS: { numbers: Numbers; name: string; about: string }[] = [
	{ numbers: 'whole', name: 'Whole numbers', about: 'Like 84 and 735.' },
	{ numbers: 'decimal', name: 'Decimals', about: 'Like 8.4 and 7.35, to hundredths.' }
];
const planOf = (kind: Kind, hard: Hard, numbers: Numbers): Plan => (numbers === 'decimal' ? { ...PLANS[kind][hard], numbers } : PLANS[kind][hard]);

const SEEN = 'box-by-box-seen-v1';
type Seen = Record<string, Problem[]>;
const keyOf = ([a, b]: Problem) => `${a}|${b}`;

/** A fresh set of this kind and level, none the student has had lately (when there are too few left, any new set). */
export function practiceProblems(kind: Kind, hard: Hard, numbers: Numbers = 'whole'): Problem[] {
	const seen = (load(SEEN) as Seen | null) ?? {};
	const slot = numbers === 'decimal' ? `${kind}-${hard}-decimal` : `${kind}-${hard}`;
	const plan = planOf(kind, hard, numbers);
	const had: Problem[] = Array.isArray(seen[slot]) ? seen[slot] : [];
	const gen = kindInfo(kind).settings.generate;
	let out = gen(plan, Math.random, had);
	if (out.length < SET_SIZE) out = gen(plan, Math.random, had.slice(-SET_SIZE * 4));
	const fresh = new Set(out.map(keyOf));
	store(SEEN, { ...seen, [slot]: [...had.filter((p) => !fresh.has(keyOf(p))), ...out].slice(-300) });
	return out;
}

/** The activity for a practice run: its kind, the help they chose, the way they work it, and its plan (for the player's
 *  own labels). */
export function practiceActivity(kind: Kind, hard: Hard, mode: Mode, method: Method = 'standard', numbers: Numbers = 'whole'): Playable {
	const s = kindInfo(kind).settings;
	return {
		kind,
		problems: practiceProblems(kind, hard, numbers),
		settings: {
			level: mode,
			custom: { spotlight: true, prompt: true, zoom: true, build: true, drawSigns: true, bringDown: true, markNow: true },
			perStudent: false,
			// decimals: the standard method
			method: numbers === 'decimal' ? 'standard' : methodOr(kind, method)
		},
		plan: s.parse(planOf(kind, hard, numbers))
	};
}
