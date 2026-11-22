//#region src/pool.d.ts
type UUID = string;
type ClientId = UUID;
type Dot = `${ClientId}/${number}`;
type TokenID = Dot;
type RootID = "[ROOT]";
type ChildID = [TokenID, string];
type JSONValue = string | number | boolean | null | JSONValue[] | {
  [key: string]: JSONValue;
};
type TokenType = `${string}/${string}`;
type TokenOrigin = {
  dot: Dot;
  left: RootID | TokenID | ChildID;
  right: RootID | TokenID | ChildID;
};
type TokenProps = Map<string, {
  dot: Dot;
  value: any;
}>;
type TokenValue = {
  type: TokenType;
  origin: TokenOrigin;
  props: TokenProps;
  deleted: boolean;
};
type PoolCursor = {
  left: RootID | TokenID | ChildID;
  right: RootID | TokenID | ChildID;
};
type PoolSelection = {
  anchor: PoolCursor;
  head: PoolCursor;
} | null;
type Pool = {
  tokens: Map<TokenID, TokenValue>;
  selection: PoolSelection;
};
declare function idsEqual(a: RootID | TokenID | ChildID, b: RootID | TokenID | ChildID): boolean;
declare function generateNewDot(pool: Pool, clientId: ClientId): Dot;
//#endregion
//#region src/tokens/char.d.ts
declare const charTokenType: TokenTypeSchema<"core/char", {
  char: string;
}, []>;
//#endregion
//#region src/doc.d.ts
type Doc<S extends Schema> = {
  root: DocStrand<S>;
  selection: DocSelection | null;
};
type DocStrand<S extends Schema> = {
  id: RootID | ChildID;
  tokens: SchemaDocToken<S>[];
};
type SetValues$1<S> = S extends Set<infer V> ? V : never;
type GetPropsFromTokenType<T extends TokenTypeSchema> = T extends TokenTypeSchema<any, infer P, any> ? P : never;
type GetChildKeysFromTokenType<T extends TokenTypeSchema> = T extends TokenTypeSchema<any, any, infer CK> ? CK[number] : never;
type DocToken<T extends TokenTypeSchema, S extends Schema> = {
  id: TokenID;
  type: T["type"];
  props: GetPropsFromTokenType<T>;
  children: Map<GetChildKeysFromTokenType<T>, DocStrand<S>>;
};
type SchemaDocToken<S extends Schema> = DocToken<SetValues$1<S["tokenTypes"]>, S>;
type DocSelection = {
  strandId: RootID | ChildID;
  anchorIndex: number;
  headIndex: number;
};
type DocCursor = {
  strandId: RootID | ChildID;
  tokenIndex: number;
};
type StrandPath = {
  tokenIndex: number;
  childName: string;
}[];
type TokenPath = {
  strandPath: StrandPath;
  tokenIndex: number;
};
declare function isStrandPath(path: any): path is StrandPath;
declare function strandPathsEqual(a: StrandPath, b: StrandPath): boolean;
declare function strandPathIsAncestor(parent: StrandPath, child: StrandPath): boolean;
declare function getStrandByPath<S extends Schema>(doc: Doc<S> | DocStrand<S>, strandPath: StrandPath): DocStrand<S> | null;
declare function getStrandById<S extends Schema>(doc: Doc<S> | DocStrand<S>, id: RootID | ChildID): DocStrand<S> | null;
declare function findStrandPath<S extends Schema>(rootStrand: DocStrand<S>, targetStrand: DocStrand<S>): StrandPath | null;
declare function traverseStrands<S extends Schema>(strand: DocStrand<S>): Generator<DocStrand<S>>;
declare function getToken<S extends Schema>(doc: Doc<S> | DocStrand<S>, tokenPath: TokenPath): SchemaDocToken<S> | null;
declare function createDocToken<T extends TokenTypeSchema, S extends Schema>(id: TokenID, type: T, props: GetPropsFromTokenType<T>, children?: Map<GetChildKeysFromTokenType<T>, DocStrand<S>>): DocToken<T, S>;
declare function tokenIs<T extends TokenTypeSchema | string, S extends Schema>(token: DocToken<any, S> | null | undefined, type: T): token is DocToken<T extends string ? TokenTypeSchema<(typeof charTokenType)["type"], {
  char: T;
}, []> : T, S>;
declare function getCursorFromSelection(selection: DocSelection, type: "anchor" | "head"): DocCursor;
//#endregion
//#region src/standard-schema.d.ts
/** The Standard Schema interface. */
interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}
declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  interface Props<Input = unknown, Output = Input> {
    /** The version number of the standard. */
    readonly version: 1;
    /** The vendor name of the schema library. */
    readonly vendor: string;
    /** Validates unknown input values. */
    readonly validate: (value: unknown, options?: StandardSchemaV1.Options | undefined) => Result<Output> | Promise<Result<Output>>;
    /** Inferred types associated with the schema. */
    readonly types?: Types<Input, Output> | undefined;
  }
  /** The result interface of the validate function. */
  type Result<Output> = SuccessResult<Output> | FailureResult;
  /** The result interface if validation succeeds. */
  interface SuccessResult<Output> {
    /** The typed output value. */
    readonly value: Output;
    /** A falsy value for `issues` indicates success. */
    readonly issues?: undefined;
  }
  interface Options {
    /** Explicit support for additional vendor-specific parameters, if needed. */
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }
  /** The result interface if validation fails. */
  interface FailureResult {
    /** The issues of failed validation. */
    readonly issues: ReadonlyArray<Issue>;
  }
  /** The issue interface of the failure output. */
  interface Issue {
    /** The error message of the issue. */
    readonly message: string;
    /** The path of the issue, if any. */
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  /** The path segment interface of the issue. */
  interface PathSegment {
    /** The key representing a path segment. */
    readonly key: PropertyKey;
  }
  /** The Standard Schema types interface. */
  interface Types<Input = unknown, Output = Input> {
    /** The input type of the schema. */
    readonly input: Input;
    /** The output type of the schema. */
    readonly output: Output;
  }
  /** Infers the input type of a Standard Schema. */
  type InferInput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["input"];
  /** Infers the output type of a Standard Schema. */
  type InferOutput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["output"];
}
//#endregion
//#region src/schema.d.ts
type TokenTypeSchema<Type extends TokenType = TokenType, Props = any, ChildKeys extends string[] = string[]> = {
  type: Type;
  props: StandardSchemaV1<Props>;
  childKeys: ChildKeys | ((data: {
    props: Props;
  }) => ChildKeys);
};
interface Schema<TokenTypes extends Set<TokenTypeSchema> = Set<TokenTypeSchema<TokenType, any, string[]>>> {
  tokenTypes: TokenTypes;
}
declare function defineTokenType<Type extends TokenType, Props, ChildKeys extends string[]>(type: Type, options: {
  props?: StandardSchemaV1<Props>;
  childKeys?: ChildKeys | ((data: {
    props: Props;
  }) => ChildKeys);
}): TokenTypeSchema<Type, Props, ChildKeys>;
declare function defineSchema<TokenTypes extends Set<TokenTypeSchema>>(schema: Schema<TokenTypes>): Schema<TokenTypes>;
interface ConstructDocOptions {
  includeDeleted?: boolean;
}
declare function constructDoc<S extends Schema<Set<TokenTypeSchema>>>(pool: Pool, schema: S, options?: ConstructDocOptions): Doc<S>;
declare function constructDocStrand<S extends Schema>(schema: S, id: RootID | ChildID, pool: Pool, options?: ConstructDocOptions): DocStrand<S>;
declare function constructDocToken<S extends Schema>(schema: S, pool: Pool, id: TokenID, options?: ConstructDocOptions): SchemaDocToken<S>;
declare function constructDocSelection<S extends Schema>(pool: Pool, schema: S, rootStrand: DocStrand<S>): DocSelection | null;
declare function constructDocCursor<S extends Schema>(pool: Pool, schema: S, cursorName: "anchor" | "head"): DocCursor | null;
declare function getPoolCursor<S extends Schema>(pool: Pool, rootStrand: DocStrand<S>, docCursor: DocCursor): PoolCursor;
//#endregion
//#region src/vdom.d.ts
type VNode<ForeignComponent = never> = {
  key?: string;
  type: string;
  namespaceURI?: string;
  attributes: {
    [key: string]: string;
  };
  children: VNode<ForeignComponent>[];
} | {
  text: string;
} | (ForeignComponent extends never ? never : {
  key?: string;
  foreign: ForeignComponent;
}) | {
  key?: string;
  fragment: VNode<ForeignComponent>[];
} | null | undefined;
declare function h<C>(type: string, attributesAndKey?: {
  [key: string]: string;
}, ...children: (VNode<C> | null | undefined | false)[]): VNode<C>;
declare function t(text: string): VNode;
declare function renderVNode(node: VNode): Node | null | (Node | null)[];
declare function renderVNodeToHTMLString(node: VNode): string;
//#endregion
//#region src/node.d.ts
declare abstract class TreeNode {
  private _tags;
  addTag(tag: NodeTag<boolean, this>): this;
  getTag<T extends NodeTag<false, this>>(type: new (...args: any[]) => T): T | undefined;
  getTags<T extends NodeTag<true, this>>(type: new (...args: any[]) => T): T[];
  hasTag(tagMatcher: (new (...args: any[]) => NodeTag<boolean>) | NodeTag<boolean>): boolean;
  mergeTagsFromNodes(nodes: TreeNode[]): this;
  /** @deprecated This property is only for debugging purposes. */
  toDebugString(): string;
  /** @deprecated This property is only for debugging purposes. */
  toDebugHTML(): string;
  /** @deprecated This property is only for debugging purposes. */
  toDebugMathML(): VNode;
  traverse(): Generator<TreeNode>;
}
declare abstract class NodeTag<AllowMultiple extends boolean, _NodeType extends TreeNode = TreeNode> {
  abstract readonly allowMultiple: AllowMultiple;
  abstract equals(other: this): boolean;
  combine?(other: this): void;
}
declare class IsErrorNodeTag extends NodeTag<false> {
  readonly allowMultiple = false;
  equals(other: this): boolean;
}
//#endregion
//#region src/parselet.d.ts
type Parselet<S extends Schema> = LeafParselet<S> | PrefixParselet<S> | InfixParselet<S> | PostfixParselet<S> | JuxtapositionParselet;
type OperatorParselet<S extends Schema> = PrefixParselet<S> | InfixParselet<S> | PostfixParselet<S> | JuxtapositionParselet;
type ConsumeMethod<S extends Schema> = <T extends TokenTypeSchema | string | true | undefined = undefined>(tokenType?: T) => T extends undefined ? SchemaDocToken<S> | null : T extends true ? SchemaDocToken<S> : T extends string ? DocToken<TokenTypeSchema<(typeof charTokenType)["type"], {
  char: T;
}, []>, S> : DocToken<Extract<T, TokenTypeSchema>, S>;
declare abstract class ParseletBase<S extends Schema> {
  assert(condition: boolean, errorMessage?: string): asserts condition;
}
/**
 * A parselet used to handle leaf nodes. For example, variables and numbers ("x" or "42") can be implemented as leaf parselets.
 *
 * This parselet type is also used to handle standalone tokens like fractions and parentheses that contain their own sub-expressions
 * but do not expect to be paired with any particular sibling tokens.
 */
declare abstract class LeafParselet<S extends Schema> extends ParseletBase<S> {
  /**
   * Parse beginning from here and return the resulting TreeNode.
   * @param methods An object containing methods to consume and parse additional tokens. See `LeafParseletMethods` for details.
   * @returns The resulting `TreeNode`.
   * @throws `CannotParseError` if this parselet cannot parse at the current position.
   */
  abstract parse(methods: LeafParseletMethods<S>): TreeNode;
}
interface LeafParseletMethods<S extends Schema> {
  consume: ConsumeMethod<S>;
  peek(): SchemaDocToken<S> | null;
  parseChild(strand: DocStrand<S> | StrandPath): TreeNode;
}
/**
 * A parselet used to handle prefix operators. For example, negation ("-a") can be implemented as a prefix parselet.
 */
declare abstract class PrefixParselet<S extends Schema> extends ParseletBase<S> {
  /**
   * Parse beginning from here and return the resulting TreeNode.
   * @param methods An object containing methods to consume and parse additional tokens. See `PrefixParseletMethods` for details.
   * @returns The resulting `TreeNode`.
   * @throws `CannotParseError` if this parselet cannot parse at the current position.
   */
  abstract parse(methods: PrefixParseletMethods<S>): TreeNode;
}
interface PrefixParseletMethods<S extends Schema> {
  consume: ConsumeMethod<S>;
  peek(): SchemaDocToken<S> | null;
  parseChild(strand: DocStrand<S> | StrandPath): TreeNode;
  parseRight(): TreeNode;
}
/**
 * A parselet used to handle infix operators. For example, addition ("a + b") can be implemented as an infix parselet.
 */
declare abstract class InfixParselet<S extends Schema> extends ParseletBase<S> {
  /**
   * The associativity of this infix operator: either "left" or "right". For example,
   * addition is left-associative (a + b + c is parsed as (a + b) + c), while exponentiation
   * is right-associative (a ^ b ^ c is parsed as a ^ (b ^ c)).
   */
  abstract readonly associativity: "left" | "right";
  /**
   * Parse an infix expression starting with the given left-hand side node.
   * @param methods An object containing methods to consume and parse additional tokens. See `InfixParseletMethods` for details.
   * @param left The left-hand side, which has already been parsed into a `TreeNode`.
   * @returns The resulting `TreeNode`.
   * @throws `CannotParseError` if this parselet cannot parse at the current position.
   */
  abstract parse(methods: InfixParseletMethods<S>, left: TreeNode): TreeNode;
}
interface InfixParseletMethods<S extends Schema> {
  consume: ConsumeMethod<S>;
  peek(): SchemaDocToken<S> | null;
  parseChild(strand: DocStrand<S> | StrandPath): TreeNode;
  parseRight(): TreeNode;
}
/**
 * A parselet used to handle postfix operators. For example, factorial ("n!")
 * can be implemented as a postfix parselet.
 */
declare abstract class PostfixParselet<S extends Schema> extends ParseletBase<S> {
  /**
   * Parse a postfix expression starting with the given left-hand side node.
   * @param methods An object containing methods to consume and parse additional tokens. See `PostfixParseletMethods` for details.
   * @param left The left-hand side, which has already been parsed into a `TreeNode`.
   * @returns The resulting `TreeNode`.
   * @throws `CannotParseError` if this parselet cannot parse at the current position.
   */
  abstract parse(methods: PostfixParseletMethods<S>, left: TreeNode): TreeNode;
}
interface PostfixParseletMethods<S extends Schema> {
  consume: ConsumeMethod<S>;
  peek(): SchemaDocToken<S> | null;
  parseChild(strand: DocStrand<S> | StrandPath): TreeNode;
}
/**
 * A parselet that handles adjacent nodes. For example, implicit multiplication ("2x" or "3(x+1)")
 * can be implemented as a juxtaposition parselet.
 */
declare abstract class JuxtapositionParselet extends ParseletBase<Schema> {
  /**
   * Determine whether this parselet can combine two adjacent ("juxtaposed") nodes. If true, the `parse()` method will be called.
   * @param left The left-hand side node.
   * @param right The right-hand side node.
   * @returns `true` if this parselet can process these two nodes, `false` otherwise.
   */
  abstract canParse(left: TreeNode, right: TreeNode): boolean;
  /**
   * Parse two adjacent ("juxtaposed") nodes into a single TreeNode.
   * @param left The left-hand side node.
   * @param right The right-hand side node.
   * @returns The resulting `TreeNode`.
   */
  abstract parse(left: TreeNode, right: TreeNode): TreeNode;
}
declare class CannotParseError<S extends Schema> extends Error {
  parselet: Parselet<S>;
  constructor(parselet: Parselet<S>, message?: string);
}
//#endregion
//#region src/parser.d.ts
declare class MfParser<S extends Schema> {
  private _parselets;
  private _parseletBindingPower;
  constructor(parselets: (Parselet<S> | Set<Parselet<S>>)[]);
  parse(doc: Doc<S>): TreeNode;
  parsePart(doc: Doc<S>, strandOrPath?: StrandPath | DocStrand<S>, startPos?: number, minBindingPower?: number | Parselet<S>): {
    node: TreeNode;
    endPos: number;
  };
  private filterParselets;
  private getBindingPower;
}
//#endregion
//#region src/nodes/missing.d.ts
declare class MissingNode extends TreeNode {
  constructor();
  static from(): MissingNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/unparseable.d.ts
declare class UnparseableNode<S extends Schema> extends TreeNode {
  parsed: TreeNode | null;
  unparsedTokens: SchemaDocToken<S>[];
  constructor(parsed: TreeNode | null, unparsedTokens: SchemaDocToken<S>[]);
  static from<S extends Schema>(parsed: TreeNode | null, unparsedTokens: SchemaDocToken<S>[]): UnparseableNode<S>;
  toDebugHTML(): string;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/tags/tokens.d.ts
declare class TokensTag<S extends Schema> extends NodeTag<false> {
  readonly ownTokens: DocToken<TokenTypeSchema, S>[];
  readonly allowMultiple = false;
  constructor(ownTokens: DocToken<TokenTypeSchema, S>[]);
  equals(other: this): boolean;
  combine(other: this): void;
}
//#endregion
//#region src/component.d.ts
declare const isMfVDOMComponentFlag: unique symbol;
type MfVDOMComponent<T extends TokenTypeSchema> = (<C = never>(props: {
  token: DocToken<T, any>;
  children: Map<GetChildKeysFromTokenType<T>, VNode<C> | null>;
}) => VNode<C> | null) & {
  [isMfVDOMComponentFlag]: true;
};
type MfVDOMComponentProps<T extends TokenTypeSchema, C = never> = {
  token: DocToken<T, any>;
  children: Map<GetChildKeysFromTokenType<T>, VNode<C> | null>;
};
declare function createMfVDOMComponent<T extends TokenTypeSchema>(fn: <C = never>(props: {
  token: DocToken<T, Schema>;
  children: Map<GetChildKeysFromTokenType<T>, VNode<C> | null>;
}) => VNode<C> | null): MfVDOMComponent<T>;
declare function isMfVDOMComponent<T extends TokenTypeSchema>(value: any): value is MfVDOMComponent<T>;
//#endregion
//#region src/components/char.d.ts
declare const CharTokenComponent: MfVDOMComponent<TokenTypeSchema<"core/char", {
  char: string;
}, []>>;
//#endregion
//#region src/syntaxHighlighter.d.ts
declare abstract class SyntaxHighlighter<S extends Schema> {
  abstract process(doc: Doc<S>, parsed: TreeNode): void;
  abstract getStyles(token: SchemaDocToken<S>): Record<string, string>;
}
//#endregion
//#region src/actions.d.ts
/**
 * Mutate the `pool` to set the cursor position based on a `DocSelection` or `DocCursor`
 */
declare function setDocSelectionOnPool<S extends Schema>(pool: Pool, schema: S, newSelection: DocSelection | DocCursor | null): void;
declare function moveCursor<S extends Schema>(pool: Pool, schema: S, direction: "left" | "right", holdAnchor?: boolean): void;
type SetValues<S> = S extends Set<infer V> ? V : never;
type DocTemplate<S extends Schema> = { [T in SetValues<S["tokenTypes"]>["type"]]: {
  type: T;
  props: GetPropsFromTokenType<Extract<SetValues<S["tokenTypes"]>, {
    type: T;
  }>>;
  children: Map<GetChildKeysFromTokenType<Extract<SetValues<S["tokenTypes"]>, {
    type: T;
  }>>, DocTemplate<S>>;
} }[SetValues<S["tokenTypes"]>["type"]][];
/**
 * Mutate the `pool` to insert a template at the current cursor position in the `doc`.
 * @param pool The pool to mutate with new tokens and cursor position
 * @param schema The schema for constructing the document
 * @param clientId The ID of the client performing the insertion (used for token ids)
 * @param template The template to insert
 */
declare function insertTemplate<S extends Schema>(pool: Pool, schema: S, clientId: string, template: DocTemplate<S>, origin?: {
  strandId: RootID | ChildID;
  tokenIndex: number;
} | null, moveCursorToEnd?: boolean): void;
declare function deleteSelection<S extends Schema>(pool: Pool, schema: S, direction: "left" | "right", selection?: DocSelection | DocCursor | null): void;
//#endregion
//#region src/editor.d.ts
/**
 * Characters that turn into something else as they're typed, like "<=" -> "≤" or
 * "sqrt" -> a radical. `char` replaces the match with one char token; `template`
 * replaces it with any tokens.
 */
type TypingRule<S extends Schema = Schema> = {
  match: string;
} & ({
  char: string;
} | {
  template: DocTemplate<S>;
});
/**
 * What typing one character does, when it's more than inserting it (like "/"
 * making a fraction). Return false to fall back to inserting the character.
 */
type EditorCommand<S extends Schema = Schema> = (editor: Editor<S>) => boolean;
type EditorOptions<S extends Schema> = {
  /** Prefixes the ids of tokens this editor creates. */clientId?: string;
  typingRules?: TypingRule<S>[]; /** Keyed by the character that triggers the command. */
  commands?: Record<string, EditorCommand<S>>; /** Whether typing whitespace inserts it. Default false: spacing is the renderer's job. */
  keepWhitespace?: boolean;
};
/** Plain tokens as a template, so a doc (or part of one) can be inserted again. */
declare function templateFromTokens<S extends Schema>(tokens: SchemaDocToken<S>[]): DocTemplate<S>;
/** A fresh pool holding a copy of `doc`, with the cursor at the end. */
declare function poolFromDoc<S extends Schema>(doc: Doc<S>, schema: S, clientId: string): Pool;
/**
 * Editing for a math input, apart from any UI: typing, typing rules, deleting,
 * moving the cursor and selecting. A UI turns key presses and text input into
 * calls on this, and renders `doc` after each one.
 */
declare class Editor<S extends Schema> {
  readonly schema: S;
  pool: Pool;
  readonly clientId: string;
  private typingRules;
  private commands;
  private keepWhitespace;
  constructor(schema: S, options?: EditorOptions<S>);
  get doc(): Doc<S>;
  /** Replace everything with a copy of `doc`, cursor at the end. */
  load(doc: Doc<S>): void;
  get selection(): DocSelection | null;
  get hasRange(): boolean;
  /** The strand the cursor is in and the tokens either side of it. */
  get head(): {
    strand: DocStrand<S>;
    index: number;
    before: SchemaDocToken<S>;
    after: SchemaDocToken<S>;
  } | null;
  /** The selected tokens, all from one strand. */
  get selectedTokens(): SchemaDocToken<S>[];
  select(selection: DocSelection | DocCursor | null): void;
  selectAll(): void;
  /** Delete the selected range, if there is one. */
  deleteRange(): boolean;
  /** Insert tokens at the cursor, replacing any selection. */
  insert(template: DocTemplate<S>): void;
  /** Type text as if key by key, applying commands and typing rules. */
  type(text: string): void;
  typeChar(char: string): void;
  private applyTypingRules;
  /**
   * Backspace (left) or Delete (right). Next to a token with boxes, like a fraction,
   * the cursor steps into it. At the edge of a box (like an empty denominator), an
   * empty token is removed; otherwise the cursor steps out.
   */
  delete(direction: "left" | "right"): void;
  move(direction: "left" | "right", extend?: boolean): void;
  /** Home / End: to the start or end of the strand the cursor is in. */
  moveToEdge(direction: "left" | "right", extend?: boolean): void;
}
//#endregion
//#region src/render/doc.d.ts
type SetValue<T> = T extends Set<infer U> ? U : never;
type Components<S extends Schema, ForeignComponent> = { [T in SetValue<S["tokenTypes"]> as T["type"]]: MfVDOMComponent<T> | ((props: {
  token: SchemaDocToken<S>;
  children: Map<string, VNode<ForeignComponent>>;
}) => ForeignComponent) };
declare function renderDoc<S extends Schema, ForeignComponent>({
  doc,
  isFocused,
  components
}: {
  doc: Doc<S>;
  isFocused: boolean;
  components: Components<S, ForeignComponent>;
}): VNode<ForeignComponent>;
declare function renderDocStrand<S extends Schema, ForeignComponent>({
  strand,
  selection,
  components,
  isFocused
}: {
  strand: DocStrand<S>;
  selection: DocSelection | null;
  components: Components<S, ForeignComponent>;
  isFocused: boolean;
}): VNode<ForeignComponent>;
//#endregion
//#region src/utils/indent.d.ts
declare function indent(str: string, indentation?: string | number): string;
//#endregion
export { CannotParseError, MfParser, MfVDOMComponent, MfVDOMComponentProps, CharTokenComponent, ChildID, Components, ConsumeMethod, Doc, DocCursor, DocSelection, DocStrand, DocTemplate, DocToken, Editor, EditorCommand, EditorOptions, GetChildKeysFromTokenType, GetPropsFromTokenType, InfixParselet, InfixParseletMethods, IsErrorNodeTag, JSONValue, JuxtapositionParselet, LeafParselet, LeafParseletMethods, MissingNode, NodeTag, OperatorParselet, Parselet, Pool, PoolCursor, PoolSelection, PostfixParselet, PostfixParseletMethods, PrefixParselet, PrefixParseletMethods, RootID, Schema, SchemaDocToken, StrandPath, SyntaxHighlighter, TokenID, TokenPath, TokenType, TokenTypeSchema, TokenValue, TokensTag, TreeNode, TypingRule, UnparseableNode, VNode, charTokenType, constructDoc, constructDocCursor, constructDocSelection, constructDocStrand, constructDocToken, createMfVDOMComponent, createDocToken, defineSchema, defineTokenType, deleteSelection, findStrandPath, generateNewDot, getCursorFromSelection, getPoolCursor, getStrandById, getStrandByPath, getToken, h, idsEqual, indent, insertTemplate, isMfVDOMComponent, isStrandPath, moveCursor, poolFromDoc, renderDoc, renderDocStrand, renderVNode, renderVNodeToHTMLString, setDocSelectionOnPool, strandPathIsAncestor, strandPathsEqual, t, templateFromTokens, tokenIs, traverseStrands };