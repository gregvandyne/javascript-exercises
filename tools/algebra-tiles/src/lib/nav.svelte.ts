// Which screen is showing. The original app had a page per screen (the gallery at /, a setup page per activity,
// /play and /about); in an Oomba game frame there is one page, so the screens are switched here instead, and the
// way back is the in-game Back button (a game frame's own history would fight the play page's).

import type { Activity } from './algebra';
import type { Start } from './settings';

export type View =
	| { name: 'home' }
	| { name: 'setup'; activity: Activity; text?: string; start?: Start; live?: boolean }
	| { name: 'play'; type: Activity; p: string; start: Start; live: boolean; from: 'link' | 'setup' }
	| { name: 'about' };

export const nav = $state<{ view: View; back: View[] }>({ view: { name: 'home' }, back: [] });

/** Show another screen; Back returns to this one. */
export function go(view: View) {
	nav.back.push(nav.view);
	nav.view = view;
	window.scrollTo(0, 0);
}

/** The screen before (the gallery when there is none). */
export function goBack() {
	nav.view = nav.back.pop() ?? { name: 'home' };
	window.scrollTo(0, 0);
}
