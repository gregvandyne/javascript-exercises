// Which screen is showing. In an Oomba game frame there is one page, so the screens are switched here (no browser
// history: the in-game buttons go back).

import type { Playable } from './logic';

export type View =
	| { name: 'home' }
	| { name: 'edit'; id: string }
	| { name: 'play'; activity: Playable; title: string; from: 'link' | 'editor'; id?: string; setId?: string; mine?: boolean; item?: unknown }
	| { name: 'invalid' }
	| { name: 'about' };

export const nav = $state<{ view: View; back: View[] }>({ view: { name: 'home' }, back: [] });

/** Show another screen; Back returns to this one. */
export function go(view: View) {
	nav.back.push(nav.view);
	nav.view = view;
	window.scrollTo(0, 0);
}
/** The screen before (the list of activities when there is none). */
export function goBack() {
	nav.view = nav.back.pop() ?? { name: 'home' };
	window.scrollTo(0, 0);
}
/** Show a screen with nothing to go back to. */
export function show(view: View) {
	nav.back = [];
	nav.view = view;
	window.scrollTo(0, 0);
}
