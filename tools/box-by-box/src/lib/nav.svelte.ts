// Which screen is showing. In an Oomba game frame there is one page, so the screens are switched here (no browser
// history: the in-game buttons go back).

import type { Kind, Numbers, Playable } from './logic';
import type { Method } from './methods';

export type View =
	| { name: 'start' }
	| { name: 'student' }
	| { name: 'home' }
	| { name: 'sheets' }
	| { name: 'edit'; id: string }
	| { name: 'play'; activity: Playable; title: string; from: 'link' | 'editor' | 'code' | 'practice'; practice?: { kind: Kind; hard: 'easy' | 'medium' | 'hard'; numbers?: Numbers; method?: Method }; id?: string; setId?: string; mine?: boolean; item?: unknown }
	| { name: 'invalid' }
	| { name: 'about' };

export const nav = $state<{ view: View; back: View[] }>({ view: { name: 'start' }, back: [] });

/** Show another screen; Back returns to this one. */
export function go(view: View) {
	nav.back.push(nav.view);
	nav.view = view;
	window.scrollTo(0, 0);
}
/** The screen before (the list of activities when there is none). */
export function goBack() {
	nav.view = nav.back.pop() ?? { name: 'start' };
	window.scrollTo(0, 0);
}
/** Show a screen with nothing to go back to. */
export function show(view: View) {
	nav.back = [];
	nav.view = view;
	window.scrollTo(0, 0);
}
