// The Big Divide: the words on every screen, in the player's language. The tables are src/i18n/<locale>.json (English is
// en.json, the keys and the fallback for a key a language lacks); build.mjs writes them all into the page as the marked
// `// ==== I18N START ====` block (var I18N), which this reads, and which the server reads for the AI voice's allowlist
// (server/services/tts-lines.js). English is also bundled, so the sheets and their steps run as they are in Node too.
// Keys: ui.* the screens, q.* a step's question or instruction (what the speaker button reads), h.* hints, w.* words that
// stand in a line's {placeholders} (place names, "or", the words the voice says for × ÷ − + = and decimals).
// A key with a count has a form per plural category (key.one, key.few, key.other …; .other is always there).
// No platform calls here beyond reading BRB.user.lang.

import en from '../i18n/en.json' with { type: 'json' };

export type Vars = Record<string, string | number>;
/** A line to show (and maybe read): its key, its {placeholders}, and the count that picks its plural form. */
export type Msg = { k: string; v?: Vars; n?: number };
type Table = Record<string, string>;

const G = globalThis as unknown as { I18N?: Record<string, Table>; BRB?: { user?: { lang?: unknown; dir?: unknown } } };
const EN = en as Table;
const TABLES: Record<string, Table> = G.I18N && typeof G.I18N === 'object' ? G.I18N : {};

/** The player's site language ("en", "pt", "zh-Hant" …), from the frame (English outside one). */
export const LANG: string = (() => {
	try {
		const l = G.BRB?.user?.lang;
		return typeof l === 'string' && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(l) ? l : 'en';
	} catch {
		return 'en';
	}
})();
export const DIR: 'rtl' | 'ltr' = ['ar', 'he'].includes(LANG.split('-')[0].toLowerCase()) ? 'rtl' : 'ltr';

/** The tables to look in, best first: the language, its base ("pt" for "pt-BR"), then English. */
const CHAIN: { lang: string; t: Table }[] = [...new Set([LANG, LANG.split('-')[0]])]
	.filter((c) => c !== 'en' && TABLES[c] && typeof TABLES[c] === 'object')
	.map((c) => ({ lang: c, t: TABLES[c] }));
CHAIN.push({ lang: 'en', t: EN });

const rules = new Map<string, Intl.PluralRules>();
const category = (lang: string, n: number) => {
	if (!rules.has(lang)) rules.set(lang, new Intl.PluralRules(lang));
	return rules.get(lang)!.select(n);
};

/** The key as found (a counted key: its plural form, from the first table that has the key at all) and its words. */
export function lookup(k: string, n?: number): { key: string; text: string } {
	for (const { lang, t } of CHAIN) {
		if (n === undefined) {
			if (typeof t[k] === 'string') return { key: k, text: t[k] };
			continue;
		}
		const own = `${k}.${category(lang, n)}`;
		if (typeof t[own] === 'string') return { key: own, text: t[own] };
		if (typeof t[`${k}.other`] === 'string') return { key: `${k}.other`, text: t[`${k}.other`] };
	}
	return { key: k, text: k };
}
/** {name} takes vars.name (a count is also {n}). */
export const fill = (s: string, v: Vars = {}) => s.replace(/\{(\w+)\}/g, (m, x) => (v[x] !== undefined && v[x] !== null ? String(v[x]) : m));

/** The words for a key. */
export const t = (k: string, v?: Vars) => fill(lookup(k).text, v);
/** The words for a key with a count (its plural form; the count is {n}). */
export const tn = (k: string, n: number, v?: Vars) => fill(lookup(k, n).text, { n, ...v });
/** A line as data, to show with tx() and read with the speech module. */
export const m = (k: string, v?: Vars, n?: number): Msg => (n === undefined ? { k, v } : { k, v, n });
/** The words for one line or a few (joined with spaces). */
export const tx = (msg: Msg | Msg[]): string =>
	(Array.isArray(msg) ? msg : [msg])
		.map((x) => (x.n === undefined ? t(x.k, x.v) : tn(x.k, x.n, x.v)))
		.filter(Boolean)
		.join(' ');

/** A list of numbers: "10, 20 or 30" (the joiner is the language's own word). */
export const orList = (xs: (number | string)[]) =>
	xs.length > 1 ? `${xs.slice(0, -1).join(', ')} ${t('w.or')} ${xs.at(-1)}` : String(xs[0] ?? '');
/** The name of a place, by its key (ones, tens … tenths, hundredths). */
export const place = (p: string) => t(`w.place.${p}`);
/** One of a place ("ten" for tens). */
export const placeOne = (p: string) => t(`w.one.${p}`);
/** A line cut at its {placeholders}, to show some of its values in their own markup ("You got <b>3</b> right"):
 *  [{ s: 'You got ' }, { s: '', v: 'r' }, { s: ' right and ' } …]. */
export function segments(k: string, n?: number): { s: string; v?: string }[] {
	const out: { s: string; v?: string }[] = [];
	const text = lookup(k, n).text;
	let last = 0;
	for (const x of text.matchAll(/\{(\w+)\}/g)) {
		if (x.index! > last) out.push({ s: text.slice(last, x.index) });
		out.push({ s: '', v: x[1] });
		last = x.index! + x[0].length;
	}
	if (last < text.length) out.push({ s: text.slice(last) });
	return out;
}
/** The game's name in the player's language ("La Gran División"; the English one is lib/name.ts NAME). */
export const NAME_HERE = t('ui.name');
