// The math field's setup (from the original project's design notes): one
// schema for every field, typed with ^ for powers, and its value kept as plain
// text like "(x+2)(x-3)" so it can travel in a link.

import { charTokenType, defineSchema, type Doc } from '@oomba-mathfield/core';
import {
	docToText,
	fractionTokenType,
	mathCommands,
	parenthesesTokenType,
	subSupTokenType,
	textToDoc
} from '@oomba-mathfield/math';

export const schema = defineSchema({
	tokenTypes: new Set([charTokenType, fractionTokenType, parenthesesTokenType, subSupTokenType])
});
export const commands = mathCommands;
export const fromText = (text: string | null | undefined): Doc<typeof schema> =>
	textToDoc(String(text ?? ''), { fractions: false });
export const toText = (doc: Doc<typeof schema>): string => docToText(doc);
