import * as _$_mf_js_core0 from "@oomba-mathfield/core";
import { Doc, EditorCommand, InfixParselet, InfixParseletMethods, JuxtapositionParselet, LeafParselet, LeafParseletMethods, NodeTag, Parselet, PostfixParselet, PostfixParseletMethods, PrefixParselet, PrefixParseletMethods, Schema, TreeNode, VNode } from "@oomba-mathfield/core";

//#region src/tokens/fraction.d.ts
declare const fractionTokenType: _$_mf_js_core0.TokenTypeSchema<"math/fraction", Record<string, unknown>, ["numerator", "denominator"]>;
//#endregion
//#region src/tokens/matrix.d.ts
declare const matrixTokenType: _$_mf_js_core0.TokenTypeSchema<"math/matrix", {
  rows: number;
  cols: number;
  style?: "square" | "none" | undefined;
}, string[]>;
//#endregion
//#region src/tokens/parentheses.d.ts
declare const parenthesesTokenType: _$_mf_js_core0.TokenTypeSchema<"math/parentheses", Record<string, unknown>, ["content"]>;
//#endregion
//#region src/tokens/radical.d.ts
declare const radicalTokenType: _$_mf_js_core0.TokenTypeSchema<"math/radical", {
  isSqrt: boolean;
}, ["radicand"] | ["index", "radicand"]>;
//#endregion
//#region src/tokens/subsup.d.ts
declare const subSupTokenType: _$_mf_js_core0.TokenTypeSchema<"math/subsup", {
  hasSubscript: boolean;
  hasSuperscript: boolean;
}, ["subscript", "superscript"] | ["subscript"] | ["superscript"] | []>;
//#endregion
//#region src/nodes/add.d.ts
declare class AddNode extends TreeNode {
  addends: TreeNode[];
  constructor(addends: TreeNode[]);
  static from(addends: TreeNode[]): AddNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/commaList.d.ts
declare class CommaListNode extends TreeNode {
  expressions: TreeNode[];
  constructor(expressions: TreeNode[]);
  /** Joins lists into one, except a bracketed list, which stays one item:
   *  "(1, 2), (3, 4)" is a list of two lists. */
  static from(expressions: TreeNode[]): CommaListNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/comparison.d.ts
type Comparator = "<" | ">" | "≤" | "≥" | "≠" | "=";
declare class ComparisonNode extends TreeNode {
  operands: TreeNode[];
  operators: Comparator[];
  constructor(operands: TreeNode[], operators: Comparator[]);
  static from(operands: TreeNode[], operators: Comparator[]): ComparisonNode;
  /** Extend this chain by one more comparison, as in (a < x) ≤ b -> a < x ≤ b. */
  extend(operator: Comparator, operand: TreeNode): ComparisonNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/constant.d.ts
declare class ConstantNode extends TreeNode {
  name: string;
  value: number;
  constructor(name: string, value: number);
  static from(name: string, value: number): ConstantNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/decimal.d.ts
declare class DecimalNode extends TreeNode {
  value: string;
  constructor(value: string);
  static from(value: string): DecimalNode;
  toFloat(): number;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/divide.d.ts
declare class DivideNode extends TreeNode {
  dividend: TreeNode;
  divisor: TreeNode;
  constructor(dividend: TreeNode, divisor: TreeNode);
  static from(dividend: TreeNode, divisor: TreeNode): DivideNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/variable.d.ts
declare class VariableNode extends TreeNode {
  name: string;
  constructor(name: string);
  static from(name: string): VariableNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/functionDefinition.d.ts
declare class FunctionDefinitionNode extends TreeNode {
  name: string;
  args: VariableNode[];
  body: TreeNode;
  constructor(name: string, args: VariableNode[] | undefined, body: TreeNode);
  static from(name: string, args: VariableNode[] | undefined, body: TreeNode): FunctionDefinitionNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/equation.d.ts
declare class EquationNode extends TreeNode {
  expressions: TreeNode[];
  constructor(expressions: TreeNode[]);
  static from(expressions: TreeNode[]): EquationNode | FunctionDefinitionNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/exponent.d.ts
declare class ExponentNode extends TreeNode {
  base: TreeNode;
  power: TreeNode;
  constructor(base: TreeNode, power: TreeNode);
  static from(base: TreeNode, power: TreeNode): ExponentNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/functionCall.d.ts
declare class FunctionCallNode extends TreeNode {
  name: string;
  args: TreeNode[];
  constructor(name: string, args?: TreeNode[]);
  static from(name: string, args?: TreeNode[]): FunctionCallNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/keyword.d.ts
declare class KeywordNode extends TreeNode {
  word: string;
  constructor(word: string);
  static from(word: string): KeywordNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/logic.d.ts
declare class LogicNode extends TreeNode {
  operator: "and" | "or";
  clauses: TreeNode[];
  constructor(operator: "and" | "or", clauses: TreeNode[]);
  static from(operator: "and" | "or", clauses: TreeNode[]): LogicNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/multiply.d.ts
declare class MultiplyNode extends TreeNode {
  factors: TreeNode[];
  constructor(factors: TreeNode[]);
  static from(factors: TreeNode[]): MultiplyNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/negative.d.ts
declare class NegativeNode extends TreeNode {
  child: TreeNode;
  constructor(child: TreeNode);
  static from(child: TreeNode): NegativeNode | DecimalNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/positive.d.ts
declare class PositiveNode extends TreeNode {
  child: TreeNode;
  constructor(child: TreeNode);
  static from(child: TreeNode): PositiveNode | DecimalNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/radical.d.ts
declare class RadicalNode extends TreeNode {
  radicand: TreeNode;
  index: TreeNode | null;
  constructor(radicand: TreeNode, index?: TreeNode | null);
  static from(radicand: TreeNode, index?: TreeNode | null): RadicalNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/subscript.d.ts
declare class SubscriptNode extends TreeNode {
  child: TreeNode;
  subscript: TreeNode;
  constructor(child: TreeNode, subscript: TreeNode);
  static from(child: TreeNode, subscript: TreeNode): SubscriptNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/nodes/subtract.d.ts
declare class SubtractNode extends TreeNode {
  minuend: TreeNode;
  subtrahend: TreeNode;
  constructor(minuend: TreeNode, subtrahend: TreeNode);
  static from(minuend: TreeNode, subtrahend: TreeNode): SubtractNode;
  toDebugMathML(): VNode;
}
//#endregion
//#region src/parselets/add.d.ts
declare class AddParselet<S extends Schema> extends InfixParselet<S> {
  readonly associativity = "left";
  parse({
    consume,
    parseRight
  }: InfixParseletMethods<S>, left: TreeNode): AddNode;
}
//#endregion
//#region src/parselets/adjacentMultiplication.d.ts
/**
 * There are some relatively complicated rules for deciding when adjacent multiplication is/isn't allowed.
 * The rules are implemented using tags so that custom node types can specify their own behavior.
 *
 * There are four tags that nodes can use to control whether or not they appear in adjacent multiplication:
 * 1. `MathExpressionTag`: This tag indicates that a node represents a math expression (as opposed to, for example,
 *    a math statement like an equation, or a non-math node). Nodes with this tag are enrolled in the default adjacent
 *    multiplication behavior, which is to accept math expression nodes or error nodes on both sides only.
 * 2. `IsErrorNodeTag`: This tag indicates that a node is an error node (like MissingNode), which is allowed to appear
 *    in adjacent multiplication by default so that as much of the expression as possible can be parsed and errors can be
 *    contained.
 * 3. `CanBeAdjacentMultLeftSideTag`: This tag can be added to nodes to customize whether they can appear on the left side.
 *    The tag can either contain a boolean value (true/false) or a function that takes the left and right nodes
 *    and returns a boolean. (Both nodes must return true for adjacent multiplication to be allowed.)
 * 4. `CanBeAdjacentMultRightSideTag`: This tag can be added to nodes to customize whether they can appear on the right side.
 *    The tag can either contain a boolean value (true/false) or a function that takes the left and right nodes
 *    and returns a boolean. (Both nodes must return true for adjacent multiplication to be allowed.)
 *
 * A node that does not have any of these tags will never appear in adjacent multiplication.
 */
declare class AdjacentMultiplicationParselet extends JuxtapositionParselet {
  canParse(left: TreeNode, right: TreeNode): boolean;
  parse(left: TreeNode, right: TreeNode): TreeNode;
}
declare class CanBeAdjacentMultLeftSideTag<N extends TreeNode> extends NodeTag<false, N> {
  readonly condition: boolean | ((left: N, right: TreeNode) => boolean);
  readonly allowMultiple = false;
  constructor(condition: boolean | ((left: N, right: TreeNode) => boolean));
  equals(other: this): boolean;
}
declare class CanBeAdjacentMultRightSideTag<N extends TreeNode> extends NodeTag<false, N> {
  readonly condition: boolean | ((left: TreeNode, right: N) => boolean);
  readonly allowMultiple = false;
  constructor(condition: boolean | ((left: TreeNode, right: N) => boolean));
  equals(other: this): boolean;
}
declare class MultiplicationStyleTag extends NodeTag<false> {
  readonly style: "implicit" | "dot" | "cross";
  readonly allowMultiple = false;
  constructor(style: "implicit" | "dot" | "cross");
  equals(other: this): boolean;
}
//#endregion
//#region src/parselets/commaList.d.ts
declare class CommaListParselet<S extends Schema> extends InfixParselet<S> {
  readonly associativity = "left";
  parse({
    consume,
    parseRight
  }: InfixParseletMethods<S>, left: TreeNode): CommaListNode;
}
//#endregion
//#region src/parselets/comparison.d.ts
declare class ComparisonParselet<S extends Schema> extends InfixParselet<S> {
  readonly comparators: Comparator[];
  readonly associativity = "left";
  constructor(comparators?: Comparator[]);
  parse({
    consume,
    parseRight
  }: InfixParseletMethods<S>, left: TreeNode): ComparisonNode;
}
//#endregion
//#region src/parselets/constant.d.ts
declare class ConstantParselet<S extends Schema> extends LeafParselet<S> {
  readonly char: string;
  readonly value: number;
  constructor(char: string, value: number);
  parse({
    consume
  }: LeafParseletMethods<S>): ConstantNode;
}
//#endregion
//#region src/parselets/decimal.d.ts
declare class DecimalParselet<S extends Schema> extends LeafParselet<S> {
  parse({
    consume,
    peek
  }: LeafParseletMethods<S>): DecimalNode;
}
//#endregion
//#region src/parselets/equation.d.ts
declare class EquationParselet<S extends Schema> extends InfixParselet<S> {
  readonly associativity = "left";
  parse({
    consume,
    parseRight
  }: InfixParseletMethods<S>, left: TreeNode): EquationNode | FunctionDefinitionNode;
}
//#endregion
//#region src/parselets/fraction.d.ts
declare class FractionParselet<S extends Schema> extends LeafParselet<S> {
  parse({
    consume,
    parseChild
  }: LeafParseletMethods<S>): DivideNode;
}
//#endregion
//#region src/parselets/functionCall.d.ts
declare class FunctionCallParselet extends JuxtapositionParselet {
  private funcNames;
  constructor(funcNames: Set<string>);
  canParse(left: TreeNode, right: TreeNode): boolean;
  parse(left: VariableNode, right: TreeNode): TreeNode;
}
//#endregion
//#region src/parselets/keyword.d.ts
declare class KeywordParselet<S extends Schema> extends LeafParselet<S> {
  readonly word: string;
  constructor(word: string);
  parse({
    consume
  }: LeafParseletMethods<S>): KeywordNode;
}
//#endregion
//#region src/parselets/logic.d.ts
declare class LogicParselet<S extends Schema> extends InfixParselet<S> {
  readonly operator: "and" | "or";
  readonly associativity = "left";
  constructor(operator: "and" | "or");
  parse({
    consume,
    parseRight
  }: InfixParseletMethods<S>, left: TreeNode): LogicNode;
}
//#endregion
//#region src/parselets/multiply.d.ts
declare class MultiplyParselet<S extends Schema> extends InfixParselet<S> {
  readonly associativity = "left";
  parse({
    consume,
    parseRight
  }: InfixParseletMethods<S>, left: TreeNode): MultiplyNode;
}
//#endregion
//#region src/parselets/parentheses.d.ts
declare class ParenthesesChildTag extends NodeTag<false> {
  readonly allowMultiple = false;
  equals(other: this): boolean;
}
declare class ParenthesesParselet<S extends Schema> extends LeafParselet<S> {
  parse({
    consume,
    parseChild
  }: LeafParseletMethods<S>): TreeNode;
}
//#endregion
//#region src/parselets/radical.d.ts
declare class RadicalParselet<S extends Schema> extends LeafParselet<S> {
  parse({
    consume,
    parseChild
  }: LeafParseletMethods<S>): TreeNode;
}
//#endregion
//#region src/parselets/slashDivide.d.ts
declare class SlashDivideParselet<S extends Schema> extends InfixParselet<S> {
  readonly associativity = "left";
  parse({
    consume,
    parseRight
  }: InfixParseletMethods<S>, left: TreeNode): DivideNode;
}
//#endregion
//#region src/parselets/subsup.d.ts
declare class SubSupParselet<S extends Schema> extends PostfixParselet<S> {
  parse({
    consume,
    parseChild
  }: PostfixParseletMethods<S>, left: TreeNode): TreeNode;
}
//#endregion
//#region src/parselets/subtract.d.ts
declare class SubtractParselet<S extends Schema> extends InfixParselet<S> {
  readonly associativity = "left";
  parse({
    consume,
    parseRight
  }: InfixParseletMethods<S>, left: TreeNode): SubtractNode;
}
//#endregion
//#region src/parselets/unaryMinus.d.ts
declare class UnaryMinusParselet<S extends Schema> extends PrefixParselet<S> {
  parse({
    consume,
    parseRight
  }: PrefixParseletMethods<S>): NegativeNode | DecimalNode;
}
//#endregion
//#region src/parselets/unaryPlus.d.ts
declare class UnaryPlusParselet<S extends Schema> extends PrefixParselet<S> {
  parse({
    consume,
    parseRight
  }: PrefixParseletMethods<S>): TreeNode;
}
//#endregion
//#region src/parselets/variable.d.ts
declare class VariableParselet<S extends Schema> extends LeafParselet<S> {
  readonly isVariable: (char: string) => boolean;
  /** `isVariable` decides which characters are variables: a–z and A–Z by default. */
  constructor(isVariable?: (char: string) => boolean);
  parse({
    consume
  }: LeafParseletMethods<S>): VariableNode;
}
//#endregion
//#region src/defaultParselets.d.ts
/**
 * The default parselet configuration for mathematical expressions.
 */
declare function defaultParselets<S extends Schema>(options?: {
  funcNames?: Set<string>;
}): (Parselet<S> | Set<Parselet<S>>)[];
//#endregion
//#region src/inequalityParselets.d.ts
/**
 * Numbers only: decimals, π, fractions, radicals and arithmetic, like "3π/2" or "-2.5".
 * No variables, so "2x" doesn't parse.
 */
declare function numberParselets<S extends Schema>(): (Parselet<S> | Set<Parselet<S>>)[];
/**
 * Inequalities in one variable, as graphed on a number line: "-2 < x ≤ 5",
 * "x < -1 or x ≥ 3", "x ≠ 2", "all real numbers", "no solution". "and" binds tighter
 * than "or". Any single letter is a variable, including Greek ones like θ.
 */
declare function inequalityParselets<S extends Schema>(): (Parselet<S> | Set<Parselet<S>>)[];
/**
 * Equations, inequalities, points and lists in any letters, as graphed on a
 * coordinate grid: "y = 2x + 1", "2x + 3y = 6", "(1, 2), (3, 4)". A bracketed
 * list stays one item of the list around it. Comparisons chain as in
 * inequalityParselets; commas bind loosest.
 */
declare function equationParselets<S extends Schema>(): (Parselet<S> | Set<Parselet<S>>)[];
//#endregion
//#region src/tags/mathExpression.d.ts
declare class MathExpressionTag extends NodeTag<false> {
  readonly allowMultiple = false;
  equals(other: this): boolean;
}
//#endregion
//#region src/tags/mathStatement.d.ts
declare class MathStatementTag extends NodeTag<false> {
  readonly allowMultiple = false;
  equals(other: this): boolean;
}
//#endregion
//#region src/components/fraction.d.ts
declare const FractionTokenComponent: _$_mf_js_core0.MfVDOMComponent<_$_mf_js_core0.TokenTypeSchema<"math/fraction", Record<string, unknown>, ["numerator", "denominator"]>>;
//#endregion
//#region src/components/matrix.d.ts
declare const MatrixTokenComponent: _$_mf_js_core0.MfVDOMComponent<_$_mf_js_core0.TokenTypeSchema<"math/matrix", {
  rows: number;
  cols: number;
  style?: "square" | "none" | undefined;
}, string[]>>;
//#endregion
//#region src/components/radical.d.ts
declare const RadicalTokenComponent: _$_mf_js_core0.MfVDOMComponent<_$_mf_js_core0.TokenTypeSchema<"math/radical", {
  isSqrt: boolean;
}, ["radicand"] | ["index", "radicand"]>>;
//#endregion
//#region src/components/subsup.d.ts
declare const SubSupTokenComponent: _$_mf_js_core0.MfVDOMComponent<_$_mf_js_core0.TokenTypeSchema<"math/subsup", {
  hasSubscript: boolean;
  hasSuperscript: boolean;
}, ["subscript", "superscript"] | ["subscript"] | ["superscript"] | []>>;
//#endregion
//#region src/components/parentheses.d.ts
declare const ParenthesesTokenComponent: _$_mf_js_core0.MfVDOMComponent<_$_mf_js_core0.TokenTypeSchema<"math/parentheses", Record<string, unknown>, ["content"]>>;
//#endregion
//#region src/toText.d.ts
declare function toText(node: TreeNode): string;
//#endregion
//#region src/typingRules.d.ts
type TypingRule = {
  match: string;
  char: string;
};
declare const comparisonTypingRules: TypingRule[];
declare const piTypingRule: TypingRule;
/** Apply typing rules to plain text, in order. */
declare function applyTypingRules(text: string, rules: TypingRule[]): string;
//#endregion
//#region src/text.d.ts
/** Build a Doc from plain text. `typingRules` (like "<=" -> "≤") are applied first. */
declare function textToDoc<S extends Schema>(text: string, {
  clientId,
  typingRules,
  fractions
}?: {
  clientId?: string;
  typingRules?: TypingRule[];
  fractions?: boolean;
}): Doc<S>;
/** Write a Doc as plain text. A fraction is written numerator/denominator, with
 *  brackets around either part unless it is just a number: 3π/2, (x+1)/2.
 *  An exponent is written ^2, ^x, ^{1/2} or, with brackets typed in it, ^(n+1).
 *  A square root is written sqrt(…).
 *  Throws for tokens with no text form yet (other roots, subscripts, matrices). */
declare function docToText<S extends Schema>(doc: Doc<S>): string;
//#endregion
//#region src/commands.d.ts
/** Chars that belong to a number, which "/" pulls into a numerator: 3π/2. */
declare const isNumberChar: (char: string) => boolean;
/** "/" makes a fraction, taking the number before the cursor as its numerator. */
declare const fractionCommand: EditorCommand<any>;
/** "(" opens brackets with the cursor inside, or wraps the selection in them.
 *  In an empty square root it does nothing: the root's own box is the brackets,
 *  so typing sqrt(2) gives √2. */
declare const openParenthesesCommand: EditorCommand<any>;
/** ")" steps out of the brackets the cursor is in (first out of an exponent at
 *  its end, as in (x^2)), or out of the square root it's in, as in sqrt(2).
 *  Elsewhere it does nothing. */
declare const closeParenthesesCommand: EditorCommand<any>;
/** "√" makes a square root with the cursor in it, or puts the selection under one. */
declare const sqrtCommand: EditorCommand<any>;
/** The math editing commands: fractions, brackets, exponents and square roots,
 *  and typing on past the end of a box. */
declare const mathCommands: Record<string, EditorCommand<any>>;
//#endregion
//#region src/evaluate.d.ts
/** The value of an expression made of numbers, constants and the given
 *  variables, like 3π/2, or 2x + 1 with { x: 3 }. Returns null for anything
 *  else: an unknown variable, a statement or a parse error. */
declare function evaluate(node: TreeNode, variables?: Record<string, number>): number | null;
//#endregion
export { AddNode, AddParselet, AdjacentMultiplicationParselet, CanBeAdjacentMultLeftSideTag, CanBeAdjacentMultRightSideTag, CommaListNode, CommaListParselet, type Comparator, ComparisonNode, ComparisonParselet, ConstantNode, ConstantParselet, DecimalNode, DecimalParselet, DivideNode, EquationNode, EquationParselet, ExponentNode, FractionParselet, FractionTokenComponent, FunctionCallNode, FunctionCallParselet, FunctionDefinitionNode, KeywordNode, KeywordParselet, LogicNode, LogicParselet, MathExpressionTag, MathStatementTag, MatrixTokenComponent, MultiplicationStyleTag, MultiplyNode, MultiplyParselet, NegativeNode, ParenthesesChildTag, ParenthesesParselet, ParenthesesTokenComponent, PositiveNode, RadicalNode, RadicalParselet, RadicalTokenComponent, SlashDivideParselet, SubSupParselet, SubSupTokenComponent, SubscriptNode, SubtractNode, SubtractParselet, type TypingRule, UnaryMinusParselet, UnaryPlusParselet, VariableNode, VariableParselet, applyTypingRules, closeParenthesesCommand, comparisonTypingRules, defaultParselets, docToText, equationParselets, evaluate, fractionCommand, fractionTokenType, inequalityParselets, isNumberChar, mathCommands, matrixTokenType, numberParselets, openParenthesesCommand, parenthesesTokenType, piTypingRule, radicalTokenType, sqrtCommand, subSupTokenType, textToDoc, toText };