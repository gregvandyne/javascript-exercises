// Which screen is showing. The original app had a page per screen (the gallery at /, a setup page per activity,
// /play and /about); in an Oomba game frame there is one page, so the screens are switched here instead, and the
// way back is the in-game Back button (a game frame's own history would fight the play page's).

import type { Activity } from './algebra';
import type { Start } from './settings';
import type { Item } from './oomba';
import type { Level } from './practice';

export type View =
	| { name: 'start' }
	| { name: 'student' }
	| { name: 'home' }
	| { name: 'setup'; activity: Activity; text?: string; start?: Start; live?: boolean; forSet?: number }
	| { name: 'play'; type: Activity; p: string; start: Start; live: boolean; from: 'link' | 'setup' }
	| { name: 'set' }
	| {
			name: 'set-play';
			items: Item[];
			from: 'link' | 'set' | 'code' | 'practice';
			id?: string;
			mine?: boolean;
			/** Practising alone: what to make more of. */
			practice?: { activity: Activity; level: Level };
	  }
	| { name: 'set-missing' }
	| { name: 'about' };

/** A question set being made or changed: its questions, and its code once saved (with whether what's on screen is
 *  what was saved). */
export type Draft = { items: Item[]; id: string | null; saved: boolean };

/** The set being made (one at a time; setup pages add to it). */
export const sets = $state<{ draft: Draft | null }>({ draft: null });

export const nav = $state<{ view: View; back: View[] }>({ view: { name: 'start' }, back: [] });

/** Show another screen; Back returns to this one. */
export function go(view: View) {
	nav.back.push(nav.view);
	nav.view = view;
	window.scrollTo(0, 0);
}

/** The screen before (the gallery when there is none). */
export function goBack() {
	nav.view = nav.back.pop() ?? { name: 'start' };
	window.scrollTo(0, 0);
}
