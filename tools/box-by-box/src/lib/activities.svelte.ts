// The teacher's activities, kept in their own game save (BRB.storage) under one key: a list of
//   { id, savedAt, edited?, title, kind, problems, settings: { level, custom, perStudent, method }, plan, setId?, shared? }
// (method came later: an activity saved before it is worked the standard way)
// setId is the question set it was last shared as (its link), and shared the item saved there then, so the editor can
// tell whether what's on screen is what students get.

import {
	freshSettings,
	kindInfo,
	parseItem,
	kindOr,
	methodFor,
	numbersOf,
	parseFlags,
	toItem,
	validProblems,
	type Item,
	type Kind,
	type Level,
	type Plan,
	type Playable,
	type Problem,
	type Settings
} from './logic';
import { SAVE_ERRORS, load, saveSet, store } from './oomba';

export type Activity = {
	id: string;
	savedAt: number;
	edited?: boolean;
	title: string;
	kind: Kind;
	problems: Problem[];
	settings: Settings;
	plan: Plan;
	setId?: string;
	shared?: string;
	/** The teacher's own words for the top of the printed worksheet (plain text, at most PRINT_NOTE_MAX). */
	printNote?: string;
};

export const PRINT_NOTE_MAX = 300;
export const cleanPrintNote = (v: unknown): string =>
	typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, PRINT_NOTE_MAX) : '';

const KEY = 'box-by-box-activities-v1';
export const list = $state<{ items: Activity[]; loaded: boolean }>({ items: [], loaded: false });

const newId = () => globalThis.crypto?.randomUUID?.() ?? `a${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const LEVELS: Level[] = ['watch', 'countUp', 'guided', 'prompted', 'onMyOwn', 'custom'];

/** An entry from the save, checked (an entry that isn't an activity any more is left out). */
function fromSave(raw: unknown): Activity | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	if (typeof o.id !== 'string') return null;
	const kind: Kind = kindOr(o.kind);
	const k = kindInfo(kind).settings;
	const plan = o.plan ? k.parse(o.plan) : k.fresh();
	const problems = validProblems(o.problems, kind, numbersOf(plan.numbers));
	if (!problems.length) return null;
	const s = (o.settings && typeof o.settings === 'object' ? o.settings : {}) as Record<string, unknown>;
	const custom = s.custom && typeof s.custom === 'object' ? parseFlags(flagString(s.custom as Record<string, unknown>)) : parseFlags(null);
	return {
		id: o.id,
		savedAt: Number(o.savedAt) || 0,
		...(o.edited === true ? { edited: true } : {}),
		title: typeof o.title === 'string' ? o.title : '',
		kind,
		problems,
		settings: {
			level: LEVELS.includes(s.level as Level) ? (s.level as Level) : 'guided',
			custom,
			perStudent: s.perStudent === true,
			method: methodFor(kind, s.method, numbersOf(plan.numbers))
		},
		plan,
		...(typeof o.setId === 'string' ? { setId: o.setId } : {}),
		...(typeof o.shared === 'string' ? { shared: o.shared } : {}),
		...(cleanPrintNote(o.printNote) ? { printNote: cleanPrintNote(o.printNote) } : {})
	};
}
const flagString = (f: Record<string, unknown>) =>
	['spotlight', 'prompt', 'zoom', 'build', 'drawSigns', 'bringDown', 'markNow'].map((n) => (f[n] === false ? '0' : '1')).join('');

export function loadList() {
	if (list.loaded) return;
	const raw = load(KEY);
	list.items = Array.isArray(raw) ? (raw.map(fromSave).filter(Boolean) as Activity[]) : [];
	list.loaded = true;
}
function persist() {
	store(KEY, $state.snapshot(list.items));
}

export const find = (id: string) => list.items.find((a) => a.id === id);
export const sorted = () => [...list.items].sort((a, b) => b.savedAt - a.savedAt);

export function create(kind: Kind): Activity {
	const k = kindInfo(kind);
	const a: Activity = {
		id: newId(),
		savedAt: Date.now(),
		title: '',
		kind,
		problems: k.makeSet(Math.random, k.setSize),
		settings: freshSettings(),
		plan: k.settings.fresh()
	};
	list.items = [a, ...list.items];
	persist();
	return list.items[0];
}
/** Something about this activity changed: it is saved at once. */
export function touch(id: string) {
	const a = find(id);
	if (!a) return;
	a.savedAt = Date.now();
	persist();
}
export function remove(id: string) {
	list.items = list.items.filter((a) => a.id !== id);
	persist();
}

/** The question-set item for an activity, and whether it is what was last shared. */
export const itemOf = (a: Activity): Item => toItem(a);
export const isShared = (a: Activity) => !!a.setId && a.shared === JSON.stringify(itemOf(a));
export function markShared(id: string, setId: string, item: Item) {
	const a = find(id);
	if (!a) return;
	a.setId = setId;
	a.shared = JSON.stringify(item);
	persist();
}
/** The teacher's instructions for the printed worksheet; saved with the activity, not with the shared set. */
export function setPrintNote(id: string, text: string) {
	const a = find(id);
	if (!a) return;
	const v = cleanPrintNote(text);
	if (v) a.printNote = v;
	else delete a.printNote;
	persist();
}
export function forgetShare(id: string) {
	const a = find(id);
	if (!a) return;
	delete a.setId;
	delete a.shared;
	persist();
}

/** The teacher's own set, opened from its link: the activity for it in their list (added when it isn't there). */
export function adopt(setId: string, p: Playable, item: unknown): Activity {
	loadList();
	const have = list.items.find((a) => a.setId === setId);
	if (have) return have;
	const a: Activity = {
		id: newId(),
		savedAt: Date.now(),
		title: '',
		kind: p.kind,
		problems: p.problems.length ? p.problems : kindInfo(p.kind).makeSet(Math.random, kindInfo(p.kind).setSize),
		settings: { ...p.settings, custom: { ...p.settings.custom } },
		plan: p.settings.perStudent || !p.problems.length ? p.plan : { ...p.plan, count: p.problems.length },
		setId
	};
	const it = toItem(a);
	if (JSON.stringify(it) === JSON.stringify(item)) a.shared = JSON.stringify(it);
	list.items = [a, ...list.items];
	persist();
	return list.items[0];
}

/** A saved activity from My worksheets, to open in the editor: the activity for it in the list (added when it isn't
 *  there; given the set's name when it has none of its own). null when the item isn't one this game plays. */
export function openSaved(setId: string, item: unknown, title: string): Activity | null {
	const p = parseItem(item);
	if (!p) return null;
	const a = adopt(setId, p, item);
	if (!a.title.trim() && title.trim()) {
		a.title = title.trim();
		persist();
	}
	return a;
}
/** The set was renamed in My worksheets: its activities take the name. */
export function renamedSet(setId: string, title: string) {
	loadList();
	let any = false;
	for (const a of list.items) if (a.setId === setId) { a.title = title; any = true; }
	if (any) persist();
}
/** The set was deleted in My worksheets: its activities go with it. */
export function deletedSet(setId: string) {
	loadList();
	const left = list.items.filter((a) => a.setId !== setId);
	if (left.length !== list.items.length) {
		list.items = left;
		persist();
	}
}
/** The teacher's own instructions for a saved set's printed worksheet (from its activity), or ''. */
export const printNoteFor = (setId: string) => (loadList(), list.items.find((a) => a.setId === setId)?.printNote ?? '');

export const titleOf = (a: { title: string; kind: Kind }) => a.title.trim() || kindInfo(a.kind).title;

/** Save the activity on Oomba (again, under the same link, when it was saved before): its set id, or a message. */
export async function shareActivity(a: Activity): Promise<{ id?: string; error?: string }> {
	const item = itemOf(a);
	const r = await saveSet(item, a.setId, a.title);
	if (r.id) {
		markShared(a.id, r.id, item);
		return { id: r.id };
	}
	if (r.error === 'notYours') forgetShare(a.id);
	return { error: SAVE_ERRORS[r.error ?? 'offline'] ?? SAVE_ERRORS.offline };
}
