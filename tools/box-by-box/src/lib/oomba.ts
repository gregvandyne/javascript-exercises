// The Big Divide: everything that talks to the platform (the BRB SDK in the game frame) and to the Oomba Kit (its sounds
// and effects), in one place. Every call is optional: outside a game frame (or in an old one) it quietly does nothing.
//
// A teacher's activities live in their own game save. Sharing one saves it on Oomba as a question set of one item (the
// problems and the support, never the title), and the link opens it: /play/box-by-box?chapter=s-xxxxxxxxxx&lock=1

import type { Item } from './logic';

type SavedSet = { id: string; items?: readonly unknown[]; mine?: boolean; missing?: boolean };
type Brb = {
	questionSet?: SavedSet | null;
	saveQuestionSet?: (items: Item[], id?: string | null) => Promise<{ id?: string; error?: string }> | null;
	findQuestionSet?: (code: string) => Promise<{ id?: string; items?: readonly unknown[]; error?: string }> | null;
	storage?: { get: (k: string) => unknown; set: (k: string, v: unknown) => void };
	user?: { isGuest?: boolean };
	canAssign?: boolean;
	assign?: (query: string) => boolean;
	gameUrl?: string | null;
	copy?: (what: string | Blob) => Promise<boolean> | null;
	gameOver?: (o: { won: boolean; score?: number }) => void;
	aiVoiceCheck?: (lines: string[], o?: { lang?: string }) => Promise<boolean> | null;
	speak?: (text: string, o: Record<string, unknown>) => boolean;
	stopSpeaking?: () => void;
	canPrint?: boolean;
	print?: (doc: unknown) => Promise<{ ok?: boolean; error?: string }> | null;
};
type Kit = {
	sfx?: (name: string, o?: Record<string, unknown>) => void;
	juice?: { confetti?: () => void; pop?: (el: Element) => void; shake?: (trauma: number, el?: Element) => void };
};
const brb = (): Brb | null => (typeof window !== 'undefined' ? ((window as unknown as { BRB?: Brb }).BRB ?? null) : null);
const kit = (): Kit | null => (typeof window !== 'undefined' ? ((window as unknown as { Oomba?: Kit }).Oomba ?? null) : null);
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- the player's own save ---

export function load(key: string): unknown {
	try {
		return brb()?.storage?.get(key) ?? null;
	} catch {
		return null;
	}
}
export function store(key: string, value: unknown) {
	try {
		brb()?.storage?.set(key, value);
	} catch {
		/* not kept */
	}
}

// --- question sets ---

/** The activity this game was opened with (a student link, or a lesson): its item, 'missing', or null. */
export function openedSet(): { id: string; item: unknown; mine: boolean } | 'missing' | null {
	try {
		const s = brb()?.questionSet;
		if (!s || typeof s !== 'object') return null;
		if (s.missing || !Array.isArray(s.items) || !s.items.length) return 'missing';
		// a plain copy (the SDK's is frozen)
		return { id: String(s.id), item: JSON.parse(JSON.stringify(s.items[0])), mine: s.mine === true };
	} catch {
		return 'missing';
	}
}
/** The student link for a saved activity, or '' in a preview of the game (no published game, so no links). */
export function setLink(id: string | undefined): string {
	const base = brb()?.gameUrl;
	return base && id ? `${base}?chapter=${id}&lock=1` : '';
}
export const isPreview = () => !brb()?.gameUrl;
/** A saved activity's class code, as a teacher shows it and a student types it: "C5EXP 1CM9H". */
export const classCode = (id: string) => {
	const c = id.replace(/^s-/, '').toUpperCase();
	return `${c.slice(0, 5)} ${c.slice(5)}`;
};
/** The activity a student's class code opens (its set id and item), or why not: 'short', 'none', 'offline', 'preview'. */
export async function findSet(code: string): Promise<{ id: string; item: unknown } | { error: string }> {
	const t = code.toLowerCase().replace(/[^a-z0-9]/g, '');
	if (t.length !== 10) return { error: 'short' };
	try {
		const f = brb()?.findQuestionSet;
		if (!f) return { error: 'preview' };
		const r = await f(t);
		if (r && r.id && Array.isArray(r.items) && r.items.length) return { id: r.id, item: JSON.parse(JSON.stringify(r.items[0])) };
		return { error: r?.error === 'offline' ? 'offline' : 'none' };
	} catch {
		return { error: 'offline' };
	}
}
export const isGuest = () => brb()?.user?.isGuest === true;
/** Save the activity's item (a new set, or the teacher's own one again under the same id): its id, or why not. */
export async function saveSet(item: Item, id: string | undefined): Promise<{ id?: string; error?: string }> {
	try {
		if (isPreview()) return { error: 'preview' };
		if (isGuest()) return { error: 'guest' };
		const f = brb()?.saveQuestionSet;
		if (!f) return { error: 'preview' };
		const r = await f([item], id ?? null);
		return r && (r.id || r.error) ? r : { error: 'offline' };
	} catch {
		return { error: 'offline' };
	}
}
export const SAVE_ERRORS: Record<string, string> = {
	guest: 'Sign in to Oomba to share your activity.',
	preview: 'Student links work in the published game, not in a preview.',
	bad: 'Something in this activity can’t be shared. Check its problems and try again.',
	full: 'You have shared as many activities as you can. Share one you shared before instead.',
	notYours: 'This activity’s link belongs to someone else. Save it again for a link of your own.',
	offline: 'Couldn’t save just now. Check your connection and try again.'
};

// --- assigning to a class (teachers) ---

export const canAssign = () => brb()?.canAssign === true && !!brb()?.assign;
export function assign(setId: string): boolean {
	try {
		return brb()?.assign?.(`chapter=${setId}&lock=1`) === true;
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

// --- reading a step aloud (the speaker button) ---
// The platform's AI voice only, as the Oomba Kit's how-to cards do: the button shows once BRB.aiVoiceCheck says every
// line gets the AI voice, and BRB.speak({ ai: 'only' }) never falls back to the device's voice. Nothing is read by itself.

/** Will the AI voice read all these lines? (false outside a frame with AI voices, or when it can't tell) */
export async function voiceReady(lines: string[], lang: string): Promise<boolean> {
	try {
		const b = brb();
		if (!b?.aiVoiceCheck || !b.speak || !lines.length) return false;
		return (await b.aiVoiceCheck(lines, { lang })) === true;
	} catch {
		return false;
	}
}
/** Read the lines one after another with the AI voice only; done(true) after the last, done(false) when one isn't read
 *  (nothing is read by the device instead). -> stop(), or null when nothing started. */
export function readAloud(lines: string[], lang: string, done: (ok: boolean) => void): (() => void) | null {
	const b = brb();
	if (!b?.speak || !lines.length) return null;
	let over = false;
	const end = (ok: boolean) => {
		if (over) return;
		over = true;
		if (!ok) stopReading();
		done(ok);
	};
	for (let i = 0; i < lines.length; i++) {
		let ok = false;
		try {
			ok = !!b.speak(lines[i], { lang, ai: 'only', queue: i > 0, onend: i === lines.length - 1 ? () => end(true) : null, onfail: () => end(false) });
		} catch {
			ok = false;
		}
		if (!ok) {
			end(false);
			return null;
		}
	}
	return () => {
		if (over) return;
		over = true;
		stopReading();
	};
}
export function stopReading() {
	try {
		brb()?.stopSpeaking?.();
	} catch {
		/* fine */
	}
}

// --- sounds, effects and the finish ---

function sound(name: string) {
	try {
		kit()?.sfx?.(name, { caption: false });
	} catch {
		/* no sound */
	}
}
export function right(el?: Element | null) {
	sound('correct');
	try {
		if (el && !reducedMotion()) kit()?.juice?.pop?.(el);
	} catch {
		/* fine */
	}
}
export function wrong(el?: Element | null) {
	sound('wrong');
	try {
		if (el && !reducedMotion()) kit()?.juice?.shake?.(0.25, el);
	} catch {
		/* fine */
	}
}
export const tap = () => sound('pop');
/** The end of a run through the set: the cheer and the confetti, and the finish for a lesson step (once per run). */
export function finished(score: number) {
	sound('win');
	try {
		if (!reducedMotion()) kit()?.juice?.confetti?.();
	} catch {
		/* fine */
	}
	try {
		brb()?.gameOver?.({ won: true, score });
	} catch {
		/* no page */
	}
}
