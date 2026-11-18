// The activities a teacher can set, as the teacher pages describe them: the
// gallery's cards and details, and each activity's setup page.

import type { Activity } from './algebra';

export interface ActivityInfo {
	activity: Activity;
	/** The title on its card, its details and its setup page. */
	name: string;
	tagline: string;
	/** What students do, step by step, as Activity.svelte takes them through it. */
	steps: string[];
	/** Problems the activity takes, as a teacher would type them. */
	problemsLike: string[];
	/** The worked example its picture shows, which its setup page starts with:
	 *  the problem as typed, as it reads, and what the student finds. */
	example: { typed: string; problem: string; answer: string };
	/** The math field's label on the setup page. */
	fieldLabel: string;
}

export const ACTIVITIES: ActivityInfo[] = [
	{
		activity: 'solve',
		name: 'Solve an Equation',
		tagline: 'Keep the balance level to find x.',
		steps: [
			'Isolate: x tiles in one pan, units in the other.',
			'Divide the units equally among the x tiles.',
			'Write what x is.'
		],
		problemsLike: ['2x+3=7', '3x-4=x+6', '-2x=6'],
		example: { typed: '2x+3=7', problem: '2x + 3 = 7', answer: 'x = 2' },
		fieldLabel: 'The equation to solve, with an = sign'
	},
	{
		activity: 'multiply',
		name: 'Multiply Factors',
		tagline: 'Build the product of two factors.',
		steps: [
			'Lay the factors along the sides of the T.',
			'Fill in the rectangle.',
			'Group like terms and zero out pairs.',
			'Write the product.'
		],
		problemsLike: ['(x+2)(x-3)', '(2x+1)(-x+4)', '(x+3)^2'],
		example: { typed: '(x+2)(x+1)', problem: '(x + 2)(x + 1)', answer: '= x² + 3x + 2' },
		fieldLabel: 'The factors to multiply, or the polynomial they make'
	},
	{
		activity: 'factor',
		name: 'Factor a Polynomial',
		tagline: 'Turn a polynomial into a rectangle.',
		steps: ['Build the polynomial into a rectangle.', 'Measure its sides.', 'Write the factors.'],
		problemsLike: ['x^2-x-6', '6x^2+x-2', 'x^2-9'],
		example: { typed: 'x^2+3x+2', problem: 'x² + 3x + 2', answer: '= (x + 1)(x + 2)' },
		fieldLabel: 'The polynomial to factor, or its factors'
	}
];

export const activityInfo = (a: Activity): ActivityInfo =>
	ACTIVITIES.find((i) => i.activity === a)!;
