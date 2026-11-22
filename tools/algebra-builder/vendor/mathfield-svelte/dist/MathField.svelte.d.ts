import { type Components, type Doc, type EditorCommand, type Schema, type TypingRule } from "@oomba-mathfield/core";
import type { SvelteForeign } from "./types";
type Props = {
    schema: Schema;
    value?: string;
    toText: (doc: Doc<any>) => string;
    fromText: (text: string) => Doc<any>;
    typingRules?: TypingRule<any>[];
    commands?: Record<string, EditorCommand<any>>;
    /** Extra components, by token type. The math ones are built in. */
    components?: Partial<Components<any, SvelteForeign>>;
    /** Classes for particular tokens, by token id, e.g. to space out keywords. */
    classify?: (doc: Doc<any>) => Map<string, string>;
    placeholder?: string;
    id?: string;
    class?: string;
    "aria-label"?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
};
declare const MathField: import("svelte").Component<Props, {}, "value">;
type MathField = ReturnType<typeof MathField>;
export default MathField;
