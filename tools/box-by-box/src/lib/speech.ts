// Arithmetic Lab: how a step's question sounds when the speaker button reads it. The screen writes math ("745 ÷ 6",
// "7 R 2", "2/3", "0.7"); the voice says it the way a teacher reads it aloud ("745 divided by 6", "7 R 2", "2 over 3",
// "7 tenths"), in the player's language: every word it adds is one of the table's own w.* words.
// The same change makes the spoken form of each q.* line (build.mjs writes them into the page's I18N block as say.<key>),
// so the line read is always one of the game's own lines with numbers (and those w.* words) in its {placeholders}: the
// server's allowlist for the AI voice (server/services/tts-lines.js, the game's `fills`). No DOM here.

import { lookup, fill, type Msg, type Vars } from './i18n.ts';

/** Words, by w.* key (without the prefix), in the language being spoken. */
export type Words = (k: string) => string;

const NUMBER = /\d+(?:\.\d+)?/g;
/** A decimal as a teacher reads it: 0.7 "7 tenths", 12.6 "12 and 6 tenths", 0.05 "5 hundredths", 0.1 "1 tenth". In
 *  a language whose table leaves w.dec.* empty the number stays as it is written (the voice reads the point). */
function decimal(int: string, frac: string, w: Words): string {
	const places = frac.length;
	const f = String(Number(frac));
	if (!w('dec.tenths')) return `${int}.${frac}`;
	// zeros after the point (7.0, 3.00): read digit by digit, "7 point 0"
	if (f === '0') return [int, w('point'), ...frac].join(' ');
	const kind = places === 1 ? 'tenths' : places === 2 ? 'hundredths' : places === 3 ? 'thousandths' : '';
	const tpl = kind && w(`dec.${kind}${f === '1' ? '1' : ''}${Number(int) === 0 ? '' : 'Whole'}`);
	return tpl ? fill(tpl, { i: String(Number(int)), f }) : `${int}.${frac}`;
}

/** The spoken form of written math, in a line or a template (its {placeholders} are kept as they are). */
export function sayText(s: string, w: Words): string {
	const word = (k: string) => ` ${w(k)} `;
	let out = s
		// a fraction (2/3, {r}/{d}) and a remainder (7 R 2) first, while the numbers are still digits
		.replace(/(\d+|\{\w+\}) (\d+|\{\w+\})\/(\d+|\{\w+\})/g, (_, q, a, b) => `${q}${word('and')}${a}/${b}`)
		.replace(/(\d+|\{\w+\})\/(\d+|\{\w+\})/g, (_, a, b) => `${a}${word('over')}${b}`)
		.replace(/(\d|\})\s+R\s+(\d|\{)/g, (_, a, b) => `${a}${word('r')}${b}`)
		.replace(NUMBER, (x) => (x.includes('.') ? decimal(x.split('.')[0], x.split('.')[1], w) : x))
		.replace(/\s*×\s*/g, word('times'))
		.replace(/\s*÷\s*/g, word('div'))
		.replace(/\s+[−-]\s+/g, word('minus'))
		.replace(/\s*\+\s*/g, word('plus'))
		.replace(/\s*=\s*/g, word('eq'))
		.replace(/▲/g, word('up'))
		.replace(/▼/g, word('down'))
		// a lone decimal point ("Type a . in the box")
		.replace(/(^|\s)\.(?=\s|$)/g, (_, a) => `${a}${w('point')}`)
		.replace(/…/g, '');
	out = out.replace(/\s+([,.:;?!)。、，：？！])/g, '$1').replace(/\s{2,}/g, ' ').trim();
	return out;
}

/** The w.* words of the language being spoken (as the screen's). */
export const words: Words = (k) => lookup(`w.${k}`).text;
/** The spoken form of a line's template in this language (what build.mjs writes as say.<key>). */
export const sayTemplate = (key: string, w: Words = words) => sayText(lookup(key).text, w);
/** One line as the voice reads it: its spoken template with each value said the same way. */
export function sayLine(msg: Msg, w: Words = words): string {
	const { key, text } = lookup(msg.k, msg.n);
	const v: Vars = {};
	for (const [k, x] of Object.entries({ ...(msg.n === undefined ? {} : { n: msg.n }), ...msg.v })) v[k] = sayText(String(x), w);
	return fill(sayText(text, w), v).replace(/\s{2,}/g, ' ').trim() || key;
}
/** The lines the speaker button reads for a step's question (one line per part). */
export const sayAll = (msgs: Msg[], w: Words = words) => msgs.map((x) => sayLine(x, w)).filter(Boolean);
