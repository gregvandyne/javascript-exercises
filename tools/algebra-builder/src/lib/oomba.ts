// Algebra Builder: everything that talks to the platform (the BRB SDK in the game frame) and to the Oomba Kit
// (its sounds and effects), in one place, so the original app's files stay as they were.
//
// One link, one problem, as before (an activity link carries its problem), but in Oomba's lesson parameters, which
// allow only a few keys of letters, digits and "-": /play/algebra-builder?mode=solve&chapter=2xp3q7&level=1&lock=1
//   mode     the activity: solve, multiply or factor
//   chapter  the problem as typed, without spaces, with + = ^ ( ) written as p q e o c (2x+3=7 is 2xp3q7)
//   level    Solve: 1 the live balance, 2 without it; Multiply and Factor: 1 all the tiles they need, 2 none
//   lock     1: straight to the problem (no gallery), as the original's student links
// A lesson step can carry the same query, so a teacher can put one problem in a lesson.

import type { Activity } from './algebra';
import type { Start } from './settings';

/** One question of a set: the activity, the problem as typed, what students start with (Multiply and Factor) and
 *  whether the balance is live (Solve). */
export type Item = { a: Activity; p: string; s: Start; l: boolean };
type SavedSet = { id: string; items?: readonly Item[]; mine?: boolean; missing?: boolean };
type Brb = {
	params?: Record<string, string | number | undefined>;
	questionSet?: SavedSet | null;
	saveQuestionSet?: (items: Item[], id?: string | null) => Promise<{ id?: string; error?: string }> | null;
	canListSets?: boolean;
	mySets?: () => Promise<{ sets?: SavedOnOomba[]; error?: string }> | null;
	deleteQuestionSet?: (id: string) => Promise<{ ok?: boolean; error?: string }> | null;
	renameQuestionSet?: (id: string, title: string) => Promise<{ ok?: boolean; title?: string; error?: string }> | null;
	duplicateQuestionSet?: (id: string) => Promise<{ id?: string; set?: SavedOnOomba | null; error?: string }> | null;
	findQuestionSet?: (code: string) => Promise<{ id?: string; items?: readonly Item[]; error?: string }> | null;
	storage?: { get: (k: string) => unknown; set: (k: string, v: unknown) => void };
	user?: { isGuest?: boolean };
	canAssign?: boolean;
	assign?: (query: string) => boolean;
	gameUrl?: string | null;
	copy?: (what: string | Blob) => Promise<boolean> | null;
	gameOver?: (o: { won: boolean; score?: number }) => void;
	sfx?: { play: (name: string) => void };
};
type Kit = {
	sfx?: (name: string, o?: Record<string, unknown>) => void;
	juice?: { confetti?: () => void; pop?: (el: Element) => void; shake?: (trauma: number, el?: Element) => void };
};
const brb = (): Brb | null => (typeof window !== 'undefined' ? ((window as unknown as { BRB?: Brb }).BRB ?? null) : null);
const kit = (): Kit | null => (typeof window !== 'undefined' ? ((window as unknown as { Oomba?: Kit }).Oomba ?? null) : null);
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- the problem in a link ---

const TO: Record<string, string> = { '+': 'p', '=': 'q', '^': 'e', '(': 'o', ')': 'c' };
const FROM: Record<string, string> = Object.fromEntries(Object.entries(TO).map(([k, v]) => [v, k]));
export const ACTIVITIES: Activity[] = ['solve', 'multiply', 'factor'];

/** The problem as a lesson parameter, or null when it can't be one (a letter other than x, a symbol the code has no
 *  letter for, or longer than 16 characters once written). */
export function encodeProblem(text: string): string | null {
	const t = text.replace(/\s+/g, '').toLowerCase().replace(/[−–]/g, '-');
	if (!t || /[^0-9x+\-=^()]/.test(t)) return null;
	const code = [...t].map((c) => TO[c] ?? c).join('');
	return /^[a-z0-9-]{1,16}$/.test(code) ? code : null;
}
export const decodeProblem = (code: string): string => [...String(code)].map((c) => FROM[c] ?? c).join('');

/** The link to one problem on Oomba, or '' when the game can't make one (a preview, or a problem too long for a link). */
export function shareLink(activity: Activity, text: string, start: Start, live: boolean): string {
	const base = brb()?.gameUrl;
	const code = encodeProblem(text);
	if (!base || !code) return '';
	const level = activity === 'solve' ? (live ? 1 : 2) : start === 'all' ? 1 : 2;
	return `${base}?mode=${activity}&chapter=${code}&level=${level}&lock=1`;
}
/** Why there is no link, for the setup page (or '' when there is one, or the problem doesn't work yet). */
export function noLinkReason(text: string): string {
	if (!brb()?.gameUrl) return 'Activity links work in the published game, not in a preview.';
	if (!encodeProblem(text)) return 'That problem is too long for an activity link. Try one with fewer terms or smaller numbers.';
	return '';
}

/** The problem this game was opened with (an activity link, or a lesson step), or null for the gallery. */
export function openedWith(): { type: Activity; p: string; start: Start; live: boolean } | null {
	const p = brb()?.params ?? {};
	const type = ACTIVITIES.find((a) => a === p.mode);
	if (!type || typeof p.chapter !== 'string' || !p.chapter) return null;
	const two = p.level === 2;
	return { type, p: decodeProblem(p.chapter), start: type !== 'solve' && two ? 'none' : 'all', live: !(type === 'solve' && two) };
}

// --- question sets: saved on Oomba under a short code (s- and 10 letters and digits), which the link carries ---

export const MAX_ITEMS = 20;
/** The link to a saved set, or '' in a preview. */
export function setLink(id: string): string {
	const base = brb()?.gameUrl;
	return base ? `${base}?chapter=${id}&lock=1` : '';
}
/** The set this game was opened with: its questions, 'missing' (deleted, or a wrong code), or null. */
export function openedSet(): { items: Item[]; id: string; mine: boolean } | 'missing' | null {
	const s = brb()?.questionSet;
	if (!s) return null;
	if (s.missing || !s.items?.length) return 'missing';
	return { id: s.id, items: s.items.map((i) => ({ ...i })), mine: !!s.mine };
}
/** A set's class code as a teacher shows it and a student types it: "C5EXP 1CM9H". */
export const classCode = (id: string) => {
	const c = id.replace(/^s-/, '').toUpperCase();
	return `${c.slice(0, 5)} ${c.slice(5)}`;
};
/** The set a student's class code opens: its questions, or why not ('none': no such code; 'offline'; 'preview'). */
export async function findSet(code: string): Promise<{ id: string; items: Item[] } | { error: string }> {
	const t = code.toLowerCase().replace(/[^a-z0-9]/g, '');
	if (t.length !== 10) return { error: 'short' };
	try {
		const f = brb()?.findQuestionSet;
		if (!f) return { error: 'preview' };
		const r = await f(t);
		if (r && r.id && Array.isArray(r.items) && r.items.length) return { id: r.id, items: r.items.map((i) => ({ ...i })) };
		return { error: r?.error === 'offline' ? 'offline' : 'none' };
	} catch {
		return { error: 'offline' };
	}
}
/** The player's own save: a small value under a key (or null). */
export function load<T>(key: string): T | null {
	try {
		return (brb()?.storage?.get(key) as T) ?? null;
	} catch {
		return null;
	}
}
export function keep(key: string, value: unknown) {
	try {
		brb()?.storage?.set(key, value);
	} catch {
		/* not kept */
	}
}

/** In a preview (no published game, so no links). */
export const isPreview = () => !brb()?.gameUrl;
/** Whether this player can save a set (signed in, not a guest, not a preview). */
export const canSaveSets = () => !!brb()?.saveQuestionSet && !!brb()?.gameUrl && brb()?.user?.isGuest !== true;
/** Save the set (a new one, or the teacher's own one again): its code, or why not. */
export async function saveSet(items: Item[], id: string | null): Promise<{ id?: string; error?: string }> {
	try {
		const f = brb()?.saveQuestionSet;
		if (!f) return { error: 'preview' };
		return (await f(items, id)) ?? { error: 'offline' };
	} catch {
		return { error: 'offline' };
	}
}

/** The sets this teacher made, kept in their game save (newest first): the code and the questions. */
const MINE = 'algebra-builder-sets-v1';
export type MySet = { id: string; items: Item[]; at: number };
export function mySets(): MySet[] {
	try {
		const v = brb()?.storage?.get(MINE);
		return Array.isArray(v) ? (v as MySet[]).filter((s) => s && typeof s.id === 'string' && Array.isArray(s.items)) : [];
	} catch {
		return [];
	}
}
export function keepMySet(id: string, items: Item[]) {
	try {
		const list = [{ id, items, at: Date.now() }, ...mySets().filter((s) => s.id !== id)].slice(0, 50);
		brb()?.storage?.set(MINE, list);
	} catch {
		/* not kept */
	}
}
export function forgetMySet(id: string) {
	try {
		brb()?.storage?.set(MINE, mySets().filter((s) => s.id !== id));
	} catch {
		/* fine */
	}
}

// --- My question sets: every set this teacher saved on Oomba (school staff: BRB.canListSets) ---

/** One saved set as the server lists it: its id and class code, its name ('' when it has none), the server's label,
 *  how many questions, when it last changed, and its questions. */
export type SavedOnOomba = { id: string; code: string; title: string; label: string; n: number; updated: number; items: Item[] };
export const canListSets = () => brb()?.canListSets === true && typeof brb()?.mySets === 'function' && !!brb()?.gameUrl;
async function ask<T extends { error?: string }>(fn: () => Promise<T> | null | undefined): Promise<T | { error: string }> {
	try {
		const p = fn();
		if (!p) return { error: 'offline' };
		return (await p) ?? { error: 'offline' };
	} catch {
		return { error: 'offline' };
	}
}
export const listSets = () => ask(() => brb()?.mySets?.());
export const deleteSet = (id: string) => ask(() => brb()?.deleteQuestionSet?.(id));
export const renameSet = (id: string, title: string) => ask(() => brb()?.renameQuestionSet?.(id, title));
export const duplicateSet = (id: string) => ask(() => brb()?.duplicateQuestionSet?.(id));

// --- assigning to a class (teachers): Oomba's Assign page, with "Also post to Google Classroom" ---

/** Whether this player is a teacher who can assign what they made to a class. */
export const canAssign = () => brb()?.canAssign === true && !!brb()?.assign;
/** Open Oomba's Assign page for this problem or set (its lesson parameters: the part of its link after '?'). */
export function assignLink(link: string) {
	const q = link.split('?')[1] ?? '';
	try {
		return !!q && brb()?.assign?.(q) === true;
	} catch {
		return false;
	}
}

/** Copy through the play page (the frame can't use the clipboard). */
export async function copy(what: string | Blob): Promise<boolean> {
	try {
		const c = brb()?.copy;
		return c ? (await c(what)) === true : false;
	} catch {
		return false;
	}
}

// --- sounds and effects: the Oomba Kit's ---

function sound(name: string) {
	try {
		const k = kit();
		if (k?.sfx) k.sfx(name, { caption: false });
		else brb()?.sfx?.play(name === 'wrong' ? 'hit' : 'coin');
	} catch {
		/* no sound */
	}
}
/** A step's Check passed: its sound, and the bar's steps pop. */
export function stepPassed(el?: Element | null) {
	sound('correct');
	try {
		if (el && !reducedMotion()) kit()?.juice?.pop?.(el);
	} catch {
		/* fine */
	}
}
/** A Check found something wrong: a soft sound and a small shake of the message (never a buzzer). */
export function stepWrong(el?: Element | null) {
	sound('wrong');
	try {
		if (el && !reducedMotion()) kit()?.juice?.shake?.(0.25, el);
	} catch {
		/* fine */
	}
}
let reported = false;
/** One question of a set is complete (not the last): a smaller cheer, no finish yet. */
export function questionDone(el?: Element | null) {
	sound('levelup');
	try {
		if (el && !reducedMotion()) kit()?.juice?.pop?.(el);
	} catch {
		/* fine */
	}
}
/** The problem (or the whole set) is complete: the cheer and the confetti, and (once) the finish for a lesson step. */
export function complete() {
	sound('win');
	try {
		if (!reducedMotion()) kit()?.juice?.confetti?.();
	} catch {
		/* fine */
	}
	if (reported) return;
	reported = true;
	try {
		brb()?.gameOver?.({ won: true });
	} catch {
		/* no page */
	}
}
/** Tiles zeroed out, or a tile came out of the tray: a small sound. */
export const tap = () => sound('pop');
