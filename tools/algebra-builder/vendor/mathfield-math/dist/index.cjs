Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let _mf_js_core = require("@oomba-mathfield/core");
let zod = require("zod");
zod = __toESM(zod);
//#region src/tokens/fraction.ts
const fractionTokenType = (0, _mf_js_core.defineTokenType)("math/fraction", {
	props: zod.record(zod.string(), zod.unknown()),
	childKeys: ["numerator", "denominator"]
});
//#endregion
//#region src/tokens/matrix.ts
const matrixTokenType = (0, _mf_js_core.defineTokenType)("math/matrix", {
	props: zod.object({
		rows: zod.number().int().min(1),
		cols: zod.number().int().min(1),
		style: zod.enum(["square", "none"]).default("square")
	}),
	childKeys: ({ props: { rows, cols } }) => {
		let keys = [];
		for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) keys.push(`${r}-${c}`);
		return keys;
	}
});
//#endregion
//#region src/tokens/parentheses.ts
const parenthesesTokenType = (0, _mf_js_core.defineTokenType)("math/parentheses", {
	props: zod.record(zod.string(), zod.unknown()),
	childKeys: ["content"]
});
//#endregion
//#region src/tokens/radical.ts
const radicalTokenType = (0, _mf_js_core.defineTokenType)("math/radical", {
	props: zod.object({ isSqrt: zod.boolean() }),
	childKeys: ({ props: { isSqrt } }) => isSqrt ? ["radicand"] : ["index", "radicand"]
});
//#endregion
//#region src/tokens/subsup.ts
const subSupTokenType = (0, _mf_js_core.defineTokenType)("math/subsup", {
	props: zod.object({
		hasSubscript: zod.boolean(),
		hasSuperscript: zod.boolean()
	}),
	childKeys: ({ props: { hasSubscript, hasSuperscript } }) => {
		if (hasSubscript && hasSuperscript) return ["subscript", "superscript"];
		else if (hasSubscript) return ["subscript"];
		else if (hasSuperscript) return ["superscript"];
		else return [];
	}
});
//#endregion
//#region src/tags/mathExpression.ts
var MathExpressionTag = class MathExpressionTag extends _mf_js_core.NodeTag {
	allowMultiple = false;
	equals(other) {
		return other instanceof MathExpressionTag;
	}
};
//#endregion
//#region src/nodes/add.ts
var AddNode = class AddNode extends _mf_js_core.TreeNode {
	constructor(addends) {
		super();
		this.addends = addends;
		this.addTag(new MathExpressionTag());
	}
	static from(addends) {
		return new AddNode(addends.flatMap((node) => node instanceof AddNode ? node.addends : [node])).mergeTagsFromNodes(addends.filter((node) => node instanceof AddNode));
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mrow", {}, ...this.addends.flatMap((addend, index) => [addend.toDebugMathML(), index < this.addends.length - 1 ? (0, _mf_js_core.h)("mo", {}, (0, _mf_js_core.t)("+")) : null]));
	}
};
//#endregion
//#region src/parselets/parentheses.ts
var ParenthesesChildTag = class ParenthesesChildTag extends _mf_js_core.NodeTag {
	allowMultiple = false;
	equals(other) {
		return other instanceof ParenthesesChildTag;
	}
};
var ParenthesesParselet = class extends _mf_js_core.LeafParselet {
	parse({ consume, parseChild }) {
		const token = consume(parenthesesTokenType);
		return parseChild(token.children.get("content")).addTag(new _mf_js_core.TokensTag([token])).addTag(new ParenthesesChildTag());
	}
};
//#endregion
//#region src/nodes/commaList.ts
var CommaListNode = class CommaListNode extends _mf_js_core.TreeNode {
	constructor(expressions) {
		super();
		this.expressions = expressions;
	}
	/** Joins lists into one, except a bracketed list, which stays one item:
	*  "(1, 2), (3, 4)" is a list of two lists. */
	static from(expressions) {
		const flat = (node) => node instanceof CommaListNode && !node.hasTag(ParenthesesChildTag);
		return new CommaListNode(expressions.flatMap((node) => flat(node) ? node.expressions : [node])).mergeTagsFromNodes(expressions.filter(flat));
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mrow", {}, ...this.expressions.flatMap((expr, index) => [expr.toDebugMathML(), index < this.expressions.length - 1 ? (0, _mf_js_core.h)("mo", {}, (0, _mf_js_core.t)(",")) : null]));
	}
};
//#endregion
//#region src/tags/mathStatement.ts
var MathStatementTag = class MathStatementTag extends _mf_js_core.NodeTag {
	allowMultiple = false;
	equals(other) {
		return other instanceof MathStatementTag;
	}
};
//#endregion
//#region src/nodes/comparison.ts
var ComparisonNode = class ComparisonNode extends _mf_js_core.TreeNode {
	constructor(operands, operators) {
		super();
		this.operands = operands;
		this.operators = operators;
		this.addTag(new MathStatementTag());
	}
	static from(operands, operators) {
		return new ComparisonNode(operands, operators);
	}
	/** Extend this chain by one more comparison, as in (a < x) ≤ b -> a < x ≤ b. */
	extend(operator, operand) {
		return new ComparisonNode([...this.operands, operand], [...this.operators, operator]).mergeTagsFromNodes([this]);
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mrow", {}, ...this.operands.flatMap((operand, index) => [operand.toDebugMathML(), index < this.operators.length ? (0, _mf_js_core.h)("mo", {}, (0, _mf_js_core.t)(this.operators[index])) : null]));
	}
};
//#endregion
//#region src/nodes/constant.ts
var ConstantNode = class ConstantNode extends _mf_js_core.TreeNode {
	constructor(name, value) {
		super();
		this.name = name;
		this.value = value;
		this.addTag(new MathExpressionTag());
	}
	static from(name, value) {
		return new ConstantNode(name, value);
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mi", {}, (0, _mf_js_core.t)(this.name));
	}
};
//#endregion
//#region src/nodes/multiply.ts
var MultiplyNode = class MultiplyNode extends _mf_js_core.TreeNode {
	constructor(factors) {
		super();
		this.factors = factors;
		this.addTag(new MathExpressionTag());
	}
	static from(factors) {
		return new MultiplyNode(factors.flatMap((node) => node instanceof MultiplyNode ? node.factors : [node])).mergeTagsFromNodes(factors.filter((node) => node instanceof MultiplyNode));
	}
	toDebugMathML() {
		const separator = () => {
			const tag = this.getTag(MultiplicationStyleTag);
			if (tag?.style === "dot") return (0, _mf_js_core.h)("mo", {}, (0, _mf_js_core.t)("·"));
			else if (tag?.style === "cross") return (0, _mf_js_core.h)("mo", {}, (0, _mf_js_core.t)("×"));
			else if (tag?.style === "implicit") return null;
			return null;
		};
		return (0, _mf_js_core.h)("mrow", {}, ...this.factors.flatMap((factor, index) => [factor.toDebugMathML(), index < this.factors.length - 1 ? separator() : null]));
	}
};
//#endregion
//#region src/parselets/adjacentMultiplication.ts
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
var AdjacentMultiplicationParselet = class extends _mf_js_core.JuxtapositionParselet {
	canParse(left, right) {
		return isLeftAllowed(left, right) && isRightAllowed(left, right);
	}
	parse(left, right) {
		return MultiplyNode.from([left, right]).addTag(new MultiplicationStyleTag("implicit"));
	}
};
function isLeftAllowed(left, right) {
	if (left instanceof MultiplyNode && left.getTag(MultiplicationStyleTag)?.style === "implicit" && left.factors.length > 0) return isLeftAllowed(left.factors.at(-1), right);
	const leftTag = left.getTag(CanBeAdjacentMultLeftSideTag);
	if (leftTag) if (typeof leftTag.condition === "boolean") return leftTag.condition;
	else return leftTag.condition(left, right);
	return left.hasTag(MathExpressionTag) || left.hasTag(_mf_js_core.IsErrorNodeTag);
}
function isRightAllowed(left, right) {
	if (right instanceof MultiplyNode && right.getTag(MultiplicationStyleTag)?.style === "implicit" && right.factors.length > 0) return isRightAllowed(left, right.factors.at(0));
	const rightTag = right.getTag(CanBeAdjacentMultRightSideTag);
	if (rightTag) if (typeof rightTag.condition === "boolean") return rightTag.condition;
	else return rightTag.condition(left, right);
	return right.hasTag(MathExpressionTag) || right.hasTag(_mf_js_core.IsErrorNodeTag);
}
var CanBeAdjacentMultLeftSideTag = class CanBeAdjacentMultLeftSideTag extends _mf_js_core.NodeTag {
	allowMultiple = false;
	constructor(condition) {
		super();
		this.condition = condition;
	}
	equals(other) {
		return other instanceof CanBeAdjacentMultLeftSideTag && other.condition === this.condition;
	}
};
var CanBeAdjacentMultRightSideTag = class CanBeAdjacentMultRightSideTag extends _mf_js_core.NodeTag {
	allowMultiple = false;
	constructor(condition) {
		super();
		this.condition = condition;
	}
	equals(other) {
		return other instanceof CanBeAdjacentMultRightSideTag && other.condition === this.condition;
	}
};
var MultiplicationStyleTag = class MultiplicationStyleTag extends _mf_js_core.NodeTag {
	allowMultiple = false;
	constructor(style) {
		super();
		this.style = style;
	}
	equals(other) {
		return other instanceof MultiplicationStyleTag && other.style === this.style;
	}
};
//#endregion
//#region src/nodes/decimal.ts
var DecimalNode = class DecimalNode extends _mf_js_core.TreeNode {
	constructor(value) {
		super();
		this.value = value;
		this.addTag(new MathExpressionTag()).addTag(new CanBeAdjacentMultRightSideTag(decimalAdjacentMultiplicationRightSideCheck));
	}
	static from(value) {
		return new DecimalNode(value);
	}
	toFloat() {
		return parseFloat(this.value);
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mn", {}, (0, _mf_js_core.t)(this.value));
	}
};
function decimalAdjacentMultiplicationRightSideCheck(left, right) {
	if (right.hasTag(ParenthesesChildTag)) return true;
	if (right.toFloat() < 0) return false;
	if (left.hasTag(ParenthesesChildTag)) return true;
	if (left instanceof DecimalNode) return false;
	return false;
}
//#endregion
//#region src/nodes/divide.ts
var DivideNode = class DivideNode extends _mf_js_core.TreeNode {
	constructor(dividend, divisor) {
		super();
		this.dividend = dividend;
		this.divisor = divisor;
		this.addTag(new MathExpressionTag());
	}
	static from(dividend, divisor) {
		return new DivideNode(dividend, divisor);
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mfrac", {}, this.dividend.toDebugMathML(), this.divisor.toDebugMathML());
	}
};
//#endregion
//#region src/nodes/functionCall.ts
var FunctionCallNode = class FunctionCallNode extends _mf_js_core.TreeNode {
	constructor(name, args = []) {
		super();
		this.name = name;
		this.args = args;
		this.addTag(new MathExpressionTag());
	}
	static from(name, args = []) {
		args = args.flatMap((node) => node instanceof CommaListNode ? node.expressions : [node]);
		return new FunctionCallNode(name, args).mergeTagsFromNodes(args.filter((node) => node instanceof CommaListNode));
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mrow", {}, (0, _mf_js_core.h)("mi", {}, (0, _mf_js_core.t)(this.name)), (0, _mf_js_core.h)("mo", { stretchy: "true" }, (0, _mf_js_core.t)("(")), ...this.args.flatMap((arg, index) => [arg.toDebugMathML(), index < this.args.length - 1 ? (0, _mf_js_core.h)("mo", {}, (0, _mf_js_core.t)(",")) : null]), (0, _mf_js_core.h)("mo", { stretchy: "true" }, (0, _mf_js_core.t)(")")));
	}
};
//#endregion
//#region src/nodes/functionDefinition.ts
var FunctionDefinitionNode = class FunctionDefinitionNode extends _mf_js_core.TreeNode {
	constructor(name, args = [], body) {
		super();
		this.name = name;
		this.args = args;
		this.body = body;
	}
	static from(name, args = [], body) {
		return new FunctionDefinitionNode(name, args, body);
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mrow", {}, (0, _mf_js_core.h)("mi", {}, (0, _mf_js_core.t)(this.name)), (0, _mf_js_core.h)("mo", { stretchy: "true" }, (0, _mf_js_core.t)("(")), ...this.args.flatMap((arg, index) => [arg.toDebugMathML(), index < this.args.length - 1 ? (0, _mf_js_core.h)("mo", {}, (0, _mf_js_core.t)(",")) : null]), (0, _mf_js_core.h)("mo", { stretchy: "true" }, (0, _mf_js_core.t)(")")), (0, _mf_js_core.h)("mo", {}, (0, _mf_js_core.t)("=")), this.body.toDebugMathML());
	}
};
//#endregion
//#region src/nodes/variable.ts
var VariableNode = class VariableNode extends _mf_js_core.TreeNode {
	constructor(name) {
		super();
		this.name = name;
		this.addTag(new MathExpressionTag());
	}
	static from(name) {
		return new VariableNode(name);
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mi", {}, (0, _mf_js_core.t)(this.name));
	}
};
//#endregion
//#region src/nodes/equation.ts
var EquationNode = class EquationNode extends _mf_js_core.TreeNode {
	constructor(expressions) {
		super();
		this.expressions = expressions;
	}
	static from(expressions) {
		const flattenedExpressions = expressions.flatMap((node) => node instanceof EquationNode ? node.expressions : node instanceof FunctionDefinitionNode ? [new FunctionCallNode(node.name, node.args), node.body] : [node]);
		if (flattenedExpressions.length === 2) {
			if (flattenedExpressions[0] instanceof FunctionCallNode) {
				const funcCall = flattenedExpressions[0];
				const name = funcCall.name;
				const args = funcCall.args;
				if (args.every((arg) => arg instanceof VariableNode)) {
					const body = flattenedExpressions[1];
					return FunctionDefinitionNode.from(name, args, body).addTag(new _mf_js_core.TokensTag([...funcCall.getTag(_mf_js_core.TokensTag)?.ownTokens ?? []]));
				}
			}
		}
		return new EquationNode(flattenedExpressions).mergeTagsFromNodes(expressions.filter((node) => node instanceof EquationNode || node instanceof FunctionDefinitionNode));
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mrow", {}, ...this.expressions.flatMap((expr, index) => [expr.toDebugMathML(), index < this.expressions.length - 1 ? (0, _mf_js_core.h)("mo", {}, (0, _mf_js_core.t)("=")) : null]));
	}
};
//#endregion
//#region src/nodes/subscript.ts
var SubscriptNode = class SubscriptNode extends _mf_js_core.TreeNode {
	constructor(child, subscript) {
		super();
		this.child = child;
		this.subscript = subscript;
		this.addTag(new MathExpressionTag());
	}
	static from(child, subscript) {
		return new SubscriptNode(child, subscript);
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("msub", {}, this.child.toDebugMathML(), this.subscript.toDebugMathML());
	}
};
//#endregion
//#region src/nodes/exponent.ts
var ExponentNode = class ExponentNode extends _mf_js_core.TreeNode {
	constructor(base, power) {
		super();
		this.base = base;
		this.power = power;
		this.addTag(new MathExpressionTag());
	}
	static from(base, power) {
		return new ExponentNode(base, power);
	}
	toDebugMathML() {
		if (this.base instanceof SubscriptNode) return (0, _mf_js_core.h)("msubsup", {}, this.base.child.toDebugMathML(), this.base.subscript.toDebugMathML(), this.power.toDebugMathML());
		return (0, _mf_js_core.h)("msup", {}, this.base.toDebugMathML(), this.power.toDebugMathML());
	}
};
//#endregion
//#region src/nodes/keyword.ts
var KeywordNode = class KeywordNode extends _mf_js_core.TreeNode {
	constructor(word) {
		super();
		this.word = word;
	}
	static from(word) {
		return new KeywordNode(word);
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mtext", {}, (0, _mf_js_core.t)(this.word));
	}
};
//#endregion
//#region src/nodes/logic.ts
var LogicNode = class LogicNode extends _mf_js_core.TreeNode {
	constructor(operator, clauses) {
		super();
		this.operator = operator;
		this.clauses = clauses;
		this.addTag(new MathStatementTag());
	}
	static from(operator, clauses) {
		const flattens = (node) => node instanceof LogicNode && node.operator === operator && !node.hasTag(ParenthesesChildTag);
		return new LogicNode(operator, clauses.flatMap((node) => flattens(node) ? node.clauses : [node])).mergeTagsFromNodes(clauses.filter(flattens));
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mrow", {}, ...this.clauses.flatMap((clause, index) => [clause.toDebugMathML(), index < this.clauses.length - 1 ? (0, _mf_js_core.h)("mtext", {}, (0, _mf_js_core.t)(` ${this.operator} `)) : null]));
	}
};
//#endregion
//#region src/nodes/negative.ts
var NegativeNode = class NegativeNode extends _mf_js_core.TreeNode {
	constructor(child) {
		super();
		this.child = child;
		this.addTag(new MathExpressionTag()).addTag(new CanBeAdjacentMultRightSideTag(false));
	}
	static from(child) {
		if (child instanceof DecimalNode && !child.value.startsWith("-") && !child.hasTag(ParenthesesChildTag)) return new DecimalNode(`-${child.value}`);
		return new NegativeNode(child);
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mrow", {}, (0, _mf_js_core.h)("mo", {}, (0, _mf_js_core.t)("-")), this.child.toDebugMathML());
	}
};
//#endregion
//#region src/nodes/positive.ts
var PositiveNode = class PositiveNode extends _mf_js_core.TreeNode {
	constructor(child) {
		super();
		this.child = child;
		this.addTag(new MathExpressionTag()).addTag(new CanBeAdjacentMultRightSideTag(false));
	}
	static from(child) {
		return new PositiveNode(child);
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mrow", {}, (0, _mf_js_core.h)("mo", {}, (0, _mf_js_core.t)("+")), this.child.toDebugMathML());
	}
};
//#endregion
//#region src/nodes/radical.ts
var RadicalNode = class RadicalNode extends _mf_js_core.TreeNode {
	constructor(radicand, index = null) {
		super();
		this.radicand = radicand;
		this.index = index;
		this.addTag(new MathExpressionTag());
	}
	static from(radicand, index = null) {
		return new RadicalNode(radicand, index);
	}
	toDebugMathML() {
		if (this.index === null) return (0, _mf_js_core.h)("msqrt", {}, this.radicand.toDebugMathML());
		return (0, _mf_js_core.h)("mroot", {}, this.radicand.toDebugMathML(), this.index.toDebugMathML());
	}
};
//#endregion
//#region src/nodes/subtract.ts
var SubtractNode = class SubtractNode extends _mf_js_core.TreeNode {
	constructor(minuend, subtrahend) {
		super();
		this.minuend = minuend;
		this.subtrahend = subtrahend;
		this.addTag(new MathExpressionTag());
	}
	static from(minuend, subtrahend) {
		return new SubtractNode(minuend, subtrahend);
	}
	toDebugMathML() {
		return (0, _mf_js_core.h)("mrow", {}, this.minuend.toDebugMathML(), (0, _mf_js_core.h)("mo", {}, (0, _mf_js_core.t)("-")), this.subtrahend.toDebugMathML());
	}
};
//#endregion
//#region src/parselets/add.ts
var AddParselet = class extends _mf_js_core.InfixParselet {
	associativity = "left";
	parse({ consume, parseRight }, left) {
		const token = consume("+");
		const right = parseRight();
		return AddNode.from([left, right]).addTag(new _mf_js_core.TokensTag([token]));
	}
};
//#endregion
//#region src/parselets/commaList.ts
var CommaListParselet = class extends _mf_js_core.InfixParselet {
	associativity = "left";
	parse({ consume, parseRight }, left) {
		const token = consume(",");
		const right = parseRight();
		return CommaListNode.from([left, right]).addTag(new _mf_js_core.TokensTag([token]));
	}
};
//#endregion
//#region src/parselets/comparison.ts
const ALL_COMPARATORS = [
	"<",
	">",
	"≤",
	"≥",
	"≠",
	"="
];
var ComparisonParselet = class extends _mf_js_core.InfixParselet {
	associativity = "left";
	constructor(comparators = ALL_COMPARATORS.filter((c) => c !== "=")) {
		super();
		this.comparators = comparators;
	}
	parse({ consume, parseRight }, left) {
		const token = consume(_mf_js_core.charTokenType);
		const operator = token.props.char;
		this.assert(this.comparators.includes(operator), `Expected one of ${this.comparators.join(" ")}`);
		const right = parseRight();
		if (left instanceof ComparisonNode && !left.hasTag(ParenthesesChildTag)) return left.extend(operator, right).addTag(new _mf_js_core.TokensTag([token]));
		return ComparisonNode.from([left, right], [operator]).addTag(new _mf_js_core.TokensTag([token]));
	}
};
//#endregion
//#region src/parselets/constant.ts
var ConstantParselet = class extends _mf_js_core.LeafParselet {
	constructor(char, value) {
		super();
		this.char = char;
		this.value = value;
	}
	parse({ consume }) {
		const token = consume(this.char);
		return ConstantNode.from(this.char, this.value).addTag(new _mf_js_core.TokensTag([token]));
	}
};
//#endregion
//#region src/parselets/decimal.ts
var DecimalParselet = class extends _mf_js_core.LeafParselet {
	parse({ consume, peek }) {
		let value = "";
		let hasDecimalPoint = false;
		let hasDigits = false;
		let consumedTokens = [];
		const consumedToken = consume(_mf_js_core.charTokenType);
		const consumedChar = consumedToken.props.char;
		this.assert(consumedChar >= "0" && consumedChar <= "9" || consumedChar === "." || consumedChar === "-", "Decimal number must start with a digit or a minus sign");
		let currentToken = consumedToken;
		consumedTokens.push(currentToken);
		while (true) {
			const currentChar = currentToken.props.char;
			if (currentChar === ".") hasDecimalPoint = true;
			else if (currentChar >= "0" && currentChar <= "9") hasDigits = true;
			else if (currentChar === "-") {}
			value += currentChar;
			const nextToken = peek();
			if (!(0, _mf_js_core.tokenIs)(nextToken, _mf_js_core.charTokenType)) break;
			const nextChar = nextToken.props.char;
			if (!(nextChar >= "0" && nextChar <= "9" || nextChar === "." && !hasDecimalPoint)) break;
			currentToken = nextToken;
			consume(true);
			consumedTokens.push(currentToken);
		}
		if (!hasDigits) throw new _mf_js_core.CannotParseError(this, "Decimal must have at least one digit");
		return DecimalNode.from(value).addTag(new _mf_js_core.TokensTag(consumedTokens));
	}
};
//#endregion
//#region src/parselets/equation.ts
var EquationParselet = class extends _mf_js_core.InfixParselet {
	associativity = "left";
	parse({ consume, parseRight }, left) {
		const token = consume("=");
		const right = parseRight();
		return EquationNode.from([left, right]).addTag(new _mf_js_core.TokensTag([token]));
	}
};
//#endregion
//#region src/parselets/fraction.ts
var FractionParselet = class extends _mf_js_core.LeafParselet {
	parse({ consume, parseChild }) {
		const token = consume(fractionTokenType);
		return DivideNode.from(parseChild(token.children.get("numerator")), parseChild(token.children.get("denominator"))).addTag(new _mf_js_core.TokensTag([token]));
	}
};
//#endregion
//#region src/parselets/functionCall.ts
var FunctionCallParselet = class extends _mf_js_core.JuxtapositionParselet {
	constructor(funcNames) {
		super();
		this.funcNames = funcNames;
	}
	canParse(left, right) {
		return left instanceof VariableNode && this.funcNames.has(left.name) && right.hasTag(ParenthesesChildTag);
	}
	parse(left, right) {
		return FunctionCallNode.from(left.name, [right]).addTag(new _mf_js_core.TokensTag([...left.getTag(_mf_js_core.TokensTag)?.ownTokens ?? []]));
	}
};
//#endregion
//#region src/parselets/keyword.ts
var KeywordParselet = class extends _mf_js_core.LeafParselet {
	constructor(word) {
		super();
		this.word = word;
	}
	parse({ consume }) {
		const tokens = [...this.word.replace(/\s+/g, "")].map((char) => consume(char));
		return KeywordNode.from(this.word).addTag(new _mf_js_core.TokensTag(tokens));
	}
};
//#endregion
//#region src/parselets/logic.ts
var LogicParselet = class extends _mf_js_core.InfixParselet {
	associativity = "left";
	constructor(operator) {
		super();
		this.operator = operator;
	}
	parse({ consume, parseRight }, left) {
		const tokens = [...this.operator].map((char) => consume(char));
		const right = parseRight();
		return LogicNode.from(this.operator, [left, right]).addTag(new _mf_js_core.TokensTag(tokens));
	}
};
//#endregion
//#region src/parselets/multiply.ts
var MultiplyParselet = class extends _mf_js_core.InfixParselet {
	associativity = "left";
	parse({ consume, parseRight }, left) {
		const token = consume("*");
		const right = parseRight();
		return MultiplyNode.from([left, right]).addTag(new _mf_js_core.TokensTag([token])).addTag(new MultiplicationStyleTag("dot"));
	}
};
//#endregion
//#region src/parselets/radical.ts
var RadicalParselet = class extends _mf_js_core.LeafParselet {
	parse({ consume, parseChild }) {
		const token = consume(radicalTokenType);
		const index = token.props.isSqrt ? null : parseChild(token.children.get("index"));
		const radicand = parseChild(token.children.get("radicand"));
		return RadicalNode.from(radicand, index).addTag(new _mf_js_core.TokensTag([token]));
	}
};
//#endregion
//#region src/parselets/slashDivide.ts
var SlashDivideParselet = class extends _mf_js_core.InfixParselet {
	associativity = "left";
	parse({ consume, parseRight }, left) {
		const token = consume("/");
		const right = parseRight();
		return DivideNode.from(left, right).addTag(new _mf_js_core.TokensTag([token]));
	}
};
//#endregion
//#region src/parselets/subsup.ts
var SubSupParselet = class extends _mf_js_core.PostfixParselet {
	parse({ consume, parseChild }, left) {
		const token = consume(subSupTokenType);
		const child = left;
		let sub = void 0;
		if (token.props.hasSubscript) sub = parseChild(token.children.get("subscript"));
		let sup = void 0;
		if (token.props.hasSuperscript) sup = parseChild(token.children.get("superscript"));
		if (sub && sup) return ExponentNode.from(SubscriptNode.from(child, sub), sup).addTag(new _mf_js_core.TokensTag([token]));
		if (sub) return SubscriptNode.from(child, sub).addTag(new _mf_js_core.TokensTag([token]));
		if (sup) return ExponentNode.from(child, sup).addTag(new _mf_js_core.TokensTag([token]));
		return child;
	}
};
//#endregion
//#region src/parselets/subtract.ts
var SubtractParselet = class extends _mf_js_core.InfixParselet {
	associativity = "left";
	parse({ consume, parseRight }, left) {
		const token = consume("-");
		const right = parseRight();
		return SubtractNode.from(left, right).addTag(new _mf_js_core.TokensTag([token]));
	}
};
//#endregion
//#region src/parselets/unaryMinus.ts
var UnaryMinusParselet = class extends _mf_js_core.PrefixParselet {
	parse({ consume, parseRight }) {
		const token = consume("-");
		const child = parseRight();
		return NegativeNode.from(child).addTag(new _mf_js_core.TokensTag([token]));
	}
};
//#endregion
//#region src/parselets/unaryPlus.ts
var UnaryPlusParselet = class extends _mf_js_core.PrefixParselet {
	parse({ consume, parseRight }) {
		const token = consume("+");
		const child = parseRight();
		return PositiveNode.from(child).addTag(new _mf_js_core.TokensTag([token]));
	}
};
//#endregion
//#region src/parselets/variable.ts
const isLatinLetter = (char) => char >= "a" && char <= "z" || char >= "A" && char <= "Z";
var VariableParselet = class extends _mf_js_core.LeafParselet {
	/** `isVariable` decides which characters are variables: a–z and A–Z by default. */
	constructor(isVariable = isLatinLetter) {
		super();
		this.isVariable = isVariable;
	}
	parse({ consume }) {
		const token = consume(_mf_js_core.charTokenType);
		this.assert(this.isVariable(token.props.char), "Expected CharToken for variable");
		return VariableNode.from(token.props.char).addTag(new _mf_js_core.TokensTag([token]));
	}
};
//#endregion
//#region src/defaultParselets.ts
/**
* The default parselet configuration for mathematical expressions.
*/
function defaultParselets(options = {}) {
	return [
		new Set([
			new DecimalParselet(),
			new VariableParselet(),
			new ParenthesesParselet(),
			new FractionParselet(),
			new RadicalParselet()
		]),
		new SubSupParselet(),
		new FunctionCallParselet(options.funcNames ?? new Set([
			"f",
			"g",
			"h"
		])),
		new Set([new MultiplyParselet(), new AdjacentMultiplicationParselet()]),
		new Set([new UnaryMinusParselet(), new UnaryPlusParselet()]),
		new Set([new SubtractParselet(), new AddParselet()]),
		new Set([new CommaListParselet()]),
		new Set([new EquationParselet(), new ComparisonParselet()])
	];
}
//#endregion
//#region src/inequalityParselets.ts
const PI = () => new ConstantParselet("π", Math.PI);
/**
* Numbers only: decimals, π, fractions, radicals and arithmetic, like "3π/2" or "-2.5".
* No variables, so "2x" doesn't parse.
*/
function numberParselets() {
	return [
		new Set([
			new DecimalParselet(),
			PI(),
			new ParenthesesParselet(),
			new FractionParselet(),
			new RadicalParselet()
		]),
		new SubSupParselet(),
		new Set([
			new MultiplyParselet(),
			new SlashDivideParselet(),
			new AdjacentMultiplicationParselet()
		]),
		new Set([new UnaryMinusParselet(), new UnaryPlusParselet()]),
		new Set([new SubtractParselet(), new AddParselet()])
	];
}
/**
* Inequalities in one variable, as graphed on a number line: "-2 < x ≤ 5",
* "x < -1 or x ≥ 3", "x ≠ 2", "all real numbers", "no solution". "and" binds tighter
* than "or". Any single letter is a variable, including Greek ones like θ.
*/
function inequalityParselets() {
	const [leaves, ...operators] = numberParselets();
	return [
		new Set([
			new KeywordParselet("all real numbers"),
			new KeywordParselet("no solution"),
			new KeywordParselet("and"),
			new KeywordParselet("or"),
			...leaves,
			new VariableParselet((char) => /^\p{L}$/u.test(char) && char !== "π")
		]),
		...operators,
		new ComparisonParselet([
			"<",
			">",
			"≤",
			"≥",
			"≠",
			"="
		]),
		new LogicParselet("and"),
		new LogicParselet("or")
	];
}
/**
* Equations, inequalities, points and lists in any letters, as graphed on a
* coordinate grid: "y = 2x + 1", "2x + 3y = 6", "(1, 2), (3, 4)". A bracketed
* list stays one item of the list around it. Comparisons chain as in
* inequalityParselets; commas bind loosest.
*/
function equationParselets() {
	const [leaves, ...operators] = numberParselets();
	return [
		new Set([...leaves, new VariableParselet((char) => /^\p{L}$/u.test(char) && char !== "π")]),
		...operators,
		new ComparisonParselet([
			"<",
			">",
			"≤",
			"≥",
			"≠",
			"="
		]),
		new CommaListParselet()
	];
}
//#endregion
//#region src/components/fraction.ts
const FractionTokenComponent = (0, _mf_js_core.createMfVDOMComponent)(({ token, children }) => {
	return (0, _mf_js_core.h)("span", { class: "fraction" }, (0, _mf_js_core.h)("span", { class: "numerator" }, children.get("numerator")), (0, _mf_js_core.h)("span", { class: "denominator" }, children.get("denominator")));
});
//#endregion
//#region src/components/matrix.ts
const MatrixTokenComponent = (0, _mf_js_core.createMfVDOMComponent)(({ token, children }) => {
	const { rows, cols, style } = token.props;
	let rowsHTML = [];
	for (let r = 0; r < rows; r++) {
		let rowCellsHTML = [];
		for (let c = 0; c < cols; c++) rowCellsHTML.push((0, _mf_js_core.h)("td", {}, children.get(`${r}-${c}`)));
		rowsHTML.push((0, _mf_js_core.h)("tr", {}, ...rowCellsHTML));
	}
	return (0, _mf_js_core.h)("table", { class: `matrix matrix-${style}` }, (0, _mf_js_core.h)("tbody", {}, ...rowsHTML));
});
//#endregion
//#region src/components/radical.ts
const RadicalTokenComponent = (0, _mf_js_core.createMfVDOMComponent)(({ token, children }) => {
	const { isSqrt } = token.props;
	return (0, _mf_js_core.h)("span", { class: "radical" }, !isSqrt && (0, _mf_js_core.h)("span", { class: "radical-index" }, children.get("index")), (0, _mf_js_core.h)("span", { class: "radicand" }, children.get("radicand")));
});
//#endregion
//#region src/components/subsup.ts
const SubSupTokenComponent = (0, _mf_js_core.createMfVDOMComponent)(({ token, children }) => {
	return (0, _mf_js_core.h)("span", { class: "subsup" }, token.props.hasSuperscript ? (0, _mf_js_core.h)("span", { class: "superscript" }, children.get("superscript")) : null, token.props.hasSubscript ? (0, _mf_js_core.h)("span", { class: "subscript" }, children.get("subscript")) : null);
});
//#endregion
//#region src/components/parentheses.ts
const ParenthesesTokenComponent = (0, _mf_js_core.createMfVDOMComponent)(({ token, children }) => {
	return (0, _mf_js_core.h)("span", { class: "parentheses" }, (0, _mf_js_core.h)("span", {}, (0, _mf_js_core.t)("(")), (0, _mf_js_core.h)("span", {}, children.get("content")), (0, _mf_js_core.h)("span", {}, (0, _mf_js_core.t)(")")));
});
//#endregion
//#region src/toText.ts
function toText(node) {
	return toTextWithMetadata(node).text;
}
function toTextWithMetadata(node) {
	if (node instanceof VariableNode) return {
		text: node.name,
		bindingPower: 0,
		hasAmbiguousEnd: false
	};
	if (node instanceof DecimalNode) return {
		text: node.value,
		bindingPower: 0,
		hasAmbiguousEnd: false
	};
	if (node instanceof AddNode) return {
		text: node.addends.map((node, i, arr) => insertText(node, { allowTrailingComma: i !== arr.length - 1 })).join(" plus "),
		bindingPower: 1,
		hasAmbiguousEnd: true
	};
	if (node instanceof MultiplyNode) {
		const isImplicit = node.getTag(MultiplicationStyleTag)?.style === "implicit";
		return {
			text: node.factors.map((node, i, arr) => insertText(node, { allowTrailingComma: i !== arr.length - 1 })).join(isImplicit ? " " : " times "),
			bindingPower: isImplicit ? 2 : 3,
			hasAmbiguousEnd: !isImplicit
		};
	}
	if (node instanceof SubtractNode) return {
		text: `${insertText(node.minuend, { allowTrailingComma: true })} minus ${insertText(node.subtrahend)}`,
		bindingPower: 1,
		hasAmbiguousEnd: true
	};
	if (node instanceof DivideNode) {
		if (node.dividend instanceof DecimalNode && node.divisor instanceof DecimalNode) {
			if (node.divisor.value === "2") return {
				text: `${node.dividend.value} ${node.dividend.value === "1" ? "half" : "halves"}`,
				bindingPower: 0,
				hasAmbiguousEnd: false
			};
			const denominatorWords = numberWords.get(node.divisor.value);
			if (denominatorWords && node.divisor.value !== "1") {
				const denominatorText = node.dividend.value === "1" ? denominatorWords.singularOrdinal : denominatorWords.pluralOrdinal;
				return {
					text: `${node.dividend.value} ${denominatorText}`,
					bindingPower: 0,
					hasAmbiguousEnd: false
				};
			}
			return {
				text: `${insertText(node.dividend)} over ${insertText(node.divisor)}`,
				bindingPower: 0,
				hasAmbiguousEnd: false
			};
		}
		return {
			text: `${insertText(node.dividend)} divided by ${toText(node.divisor)}`,
			bindingPower: 3,
			hasAmbiguousEnd: true
		};
	}
	if (node instanceof ExponentNode) {
		if (node.power instanceof DecimalNode) {
			if (node.power.value === "2") return {
				text: `${insertText(node.base)} squared`,
				bindingPower: 4,
				hasAmbiguousEnd: false
			};
			if (node.power.value === "3") return {
				text: `${insertText(node.base)} cubed`,
				bindingPower: 4,
				hasAmbiguousEnd: false
			};
			const words = numberWords.get(node.power.value);
			if (words) {
				const { singularOrdinal, pluralOrdinal } = words;
				return {
					text: `${insertText(node.base)} to the ${node.power.value === "1" ? singularOrdinal : pluralOrdinal}`,
					bindingPower: 4,
					hasAmbiguousEnd: false
				};
			}
		}
		return {
			text: `${insertText(node.base)} to the power of ${insertText(node.power)}`,
			bindingPower: 4,
			hasAmbiguousEnd: true
		};
	}
	if (node instanceof EquationNode) return {
		text: node.expressions.map((expr) => insertText(expr)).join(" equals "),
		bindingPower: 4,
		hasAmbiguousEnd: true
	};
	if (node instanceof PositiveNode) return {
		text: `positive ${insertText(node.child)}`,
		bindingPower: 1,
		hasAmbiguousEnd: true
	};
	if (node instanceof NegativeNode) return {
		text: `negative ${insertText(node.child)}`,
		bindingPower: 1,
		hasAmbiguousEnd: true
	};
	if (node instanceof FunctionCallNode) return {
		text: `${node.name} of ${node.args.map((node) => insertText(node)).join(" ")}`,
		bindingPower: 5,
		hasAmbiguousEnd: true
	};
	if (node instanceof FunctionDefinitionNode) return {
		text: `${node.name} of ${node.args.map((node) => insertText(node)).join(" ")} equals ${insertText(node.body)}`,
		bindingPower: 0,
		hasAmbiguousEnd: true
	};
	if (node instanceof RadicalNode) {
		if (node.index === null) return {
			text: `square root of ${insertText(node.radicand)}`,
			bindingPower: 4,
			hasAmbiguousEnd: true
		};
		if (node.index instanceof DecimalNode) {
			if (node.index.value === "2") return {
				text: `square root of ${insertText(node.radicand)}`,
				bindingPower: 4,
				hasAmbiguousEnd: true
			};
			if (node.index.value === "3") return {
				text: `cube root of ${insertText(node.radicand)}`,
				bindingPower: 4,
				hasAmbiguousEnd: true
			};
			const words = numberWords.get(node.index.value);
			if (words) return {
				text: `${words.singularOrdinal} root of ${insertText(node.radicand)}`,
				bindingPower: 4,
				hasAmbiguousEnd: true
			};
		}
		return {
			text: `${insertText(node.index)} root of ${insertText(node.radicand)}`,
			bindingPower: 4,
			hasAmbiguousEnd: true
		};
	}
	if (node instanceof _mf_js_core.MissingNode) return {
		text: "",
		bindingPower: 0,
		hasAmbiguousEnd: false
	};
	return {
		text: "[Unknown]",
		bindingPower: 0,
		hasAmbiguousEnd: false
	};
}
function insertText(node, options = { allowTrailingComma: false }) {
	const textWithMetadata = toTextWithMetadata(node);
	if (options.allowTrailingComma && textWithMetadata.hasAmbiguousEnd) return `${textWithMetadata.text},`;
	return textWithMetadata.text;
}
const numberWords = new Map([
	["1", {
		singularCardinal: "one",
		pluralCardinal: "ones",
		singularOrdinal: "first",
		pluralOrdinal: "firsts"
	}],
	["2", {
		singularCardinal: "two",
		pluralCardinal: "twos",
		singularOrdinal: "second",
		pluralOrdinal: "seconds"
	}],
	["3", {
		singularCardinal: "three",
		pluralCardinal: "threes",
		singularOrdinal: "third",
		pluralOrdinal: "thirds"
	}],
	["4", {
		singularCardinal: "four",
		pluralCardinal: "fours",
		singularOrdinal: "fourth",
		pluralOrdinal: "fourths"
	}],
	["5", {
		singularCardinal: "five",
		pluralCardinal: "fives",
		singularOrdinal: "fifth",
		pluralOrdinal: "fifths"
	}],
	["6", {
		singularCardinal: "six",
		pluralCardinal: "sixes",
		singularOrdinal: "sixth",
		pluralOrdinal: "sixths"
	}],
	["7", {
		singularCardinal: "seven",
		pluralCardinal: "sevens",
		singularOrdinal: "seventh",
		pluralOrdinal: "sevenths"
	}],
	["8", {
		singularCardinal: "eight",
		pluralCardinal: "eights",
		singularOrdinal: "eighth",
		pluralOrdinal: "eighths"
	}],
	["9", {
		singularCardinal: "nine",
		pluralCardinal: "nines",
		singularOrdinal: "ninth",
		pluralOrdinal: "ninths"
	}],
	["10", {
		singularCardinal: "ten",
		pluralCardinal: "tens",
		singularOrdinal: "tenth",
		pluralOrdinal: "tenths"
	}],
	["11", {
		singularCardinal: "eleven",
		pluralCardinal: "elevens",
		singularOrdinal: "eleventh",
		pluralOrdinal: "elevenths"
	}],
	["12", {
		singularCardinal: "twelve",
		pluralCardinal: "twelves",
		singularOrdinal: "twelfth",
		pluralOrdinal: "twelfths"
	}],
	["13", {
		singularCardinal: "thirteen",
		pluralCardinal: "thirteens",
		singularOrdinal: "thirteenth",
		pluralOrdinal: "thirteenths"
	}],
	["14", {
		singularCardinal: "fourteen",
		pluralCardinal: "fourteens",
		singularOrdinal: "fourteenth",
		pluralOrdinal: "fourteenths"
	}],
	["15", {
		singularCardinal: "fifteen",
		pluralCardinal: "fifteens",
		singularOrdinal: "fifteenth",
		pluralOrdinal: "fifteenths"
	}],
	["16", {
		singularCardinal: "sixteen",
		pluralCardinal: "sixteens",
		singularOrdinal: "sixteenth",
		pluralOrdinal: "sixteenths"
	}],
	["17", {
		singularCardinal: "seventeen",
		pluralCardinal: "seventeens",
		singularOrdinal: "seventeenth",
		pluralOrdinal: "seventeenths"
	}],
	["18", {
		singularCardinal: "eighteen",
		pluralCardinal: "eighteens",
		singularOrdinal: "eighteenth",
		pluralOrdinal: "eighteenths"
	}],
	["19", {
		singularCardinal: "nineteen",
		pluralCardinal: "nineteens",
		singularOrdinal: "nineteenth",
		pluralOrdinal: "nineteenths"
	}],
	["20", {
		singularCardinal: "twenty",
		pluralCardinal: "twenties",
		singularOrdinal: "twentieth",
		pluralOrdinal: "twentieths"
	}],
	["30", {
		singularCardinal: "thirty",
		pluralCardinal: "thirties",
		singularOrdinal: "thirtieth",
		pluralOrdinal: "thirtieths"
	}],
	["40", {
		singularCardinal: "forty",
		pluralCardinal: "forties",
		singularOrdinal: "fortieth",
		pluralOrdinal: "fortieths"
	}],
	["50", {
		singularCardinal: "fifty",
		pluralCardinal: "fifties",
		singularOrdinal: "fiftieth",
		pluralOrdinal: "fiftieths"
	}],
	["60", {
		singularCardinal: "sixty",
		pluralCardinal: "sixties",
		singularOrdinal: "sixtieth",
		pluralOrdinal: "sixtieths"
	}],
	["70", {
		singularCardinal: "seventy",
		pluralCardinal: "seventies",
		singularOrdinal: "seventieth",
		pluralOrdinal: "seventieths"
	}],
	["80", {
		singularCardinal: "eighty",
		pluralCardinal: "eighties",
		singularOrdinal: "eightieth",
		pluralOrdinal: "eightieths"
	}],
	["90", {
		singularCardinal: "ninety",
		pluralCardinal: "nineties",
		singularOrdinal: "ninetieth",
		pluralOrdinal: "ninetieths"
	}]
]);
//#endregion
//#region src/typingRules.ts
const comparisonTypingRules = [
	{
		match: "<=",
		char: "≤"
	},
	{
		match: ">=",
		char: "≥"
	},
	{
		match: "!=",
		char: "≠"
	},
	{
		match: "/=",
		char: "≠"
	}
];
const piTypingRule = {
	match: "pi",
	char: "π"
};
/** Apply typing rules to plain text, in order. */
function applyTypingRules(text, rules) {
	return rules.reduce((s, { match, char }) => s.split(match).join(char), text);
}
//#endregion
//#region src/commands.ts
/** Chars that belong to a number, which "/" pulls into a numerator: 3π/2. */
const isNumberChar = (char) => /^[0-9.π]$/u.test(char);
/**
* The tokens just before index `end` that "/" takes as a numerator: the selection
* if there is one, else a run of number chars, else one bracketed or fraction token.
* A power goes up whole, base and exponent: x²/2 puts x² on top. So does a
* square root with the number before it: 5√2/2 puts 5√2 on top.
*/
function numeratorStart(tokens, end) {
	if (end > 0 && (0, _mf_js_core.tokenIs)(tokens[end - 1], subSupTokenType)) {
		const base = end - 1;
		let start = base;
		while (start > 0 && (0, _mf_js_core.tokenIs)(tokens[start - 1], _mf_js_core.charTokenType) && isNumberChar(tokens[start - 1].props.char)) start--;
		return start === base && base > 0 ? base - 1 : start;
	}
	let start = end;
	if (end > 0 && (0, _mf_js_core.tokenIs)(tokens[end - 1], radicalTokenType)) {
		start = end - 1;
		while (start > 0 && (0, _mf_js_core.tokenIs)(tokens[start - 1], _mf_js_core.charTokenType) && isNumberChar(tokens[start - 1].props.char)) start--;
		return start;
	}
	while (start > 0 && (0, _mf_js_core.tokenIs)(tokens[start - 1], _mf_js_core.charTokenType) && isNumberChar(tokens[start - 1].props.char)) start--;
	if (start === end && end > 0 && !(0, _mf_js_core.tokenIs)(tokens[end - 1], _mf_js_core.charTokenType)) start = end - 1;
	return start;
}
/** A lone parentheses token gives its contents: (a+b)/c puts a+b on top. */
function unwrap(tokens) {
	if (tokens.length === 1 && (0, _mf_js_core.tokenIs)(tokens[0], parenthesesTokenType)) return tokens[0].children.get("content")?.tokens ?? [];
	return tokens;
}
/** "/" makes a fraction, taking the number before the cursor as its numerator. */
const fractionCommand = (editor) => {
	const s = editor.selection;
	const head = editor.head;
	if (!s || !head) return false;
	let numerator;
	let start;
	if (s.anchorIndex !== s.headIndex) {
		numerator = editor.selectedTokens;
		start = Math.min(s.anchorIndex, s.headIndex);
	} else {
		start = numeratorStart(head.strand.tokens, head.index);
		numerator = head.strand.tokens.slice(start, head.index);
		editor.select({
			strandId: head.strand.id,
			anchorIndex: start,
			headIndex: head.index
		});
	}
	editor.insert([{
		type: fractionTokenType.type,
		props: {},
		children: new Map([["numerator", (0, _mf_js_core.templateFromTokens)(unwrap(numerator))], ["denominator", []]])
	}]);
	const fraction = (0, _mf_js_core.getStrandById)(editor.doc, head.strand.id).tokens[start];
	editor.select({
		strandId: [fraction.id, numerator.length ? "denominator" : "numerator"],
		tokenIndex: 0
	});
	return true;
};
/** "(" opens brackets with the cursor inside, or wraps the selection in them.
*  In an empty square root it does nothing: the root's own box is the brackets,
*  so typing sqrt(2) gives √2. */
const openParenthesesCommand = (editor) => {
	const s = editor.selection;
	if (!s) return false;
	const head = editor.head;
	if (head && head.strand.id !== "[ROOT]" && head.strand.id[1] === "radicand" && !head.strand.tokens.length) return true;
	const inside = editor.selectedTokens;
	const start = Math.min(s.anchorIndex, s.headIndex);
	editor.insert([{
		type: parenthesesTokenType.type,
		props: {},
		children: new Map([["content", (0, _mf_js_core.templateFromTokens)(inside)]])
	}]);
	if (!inside.length) {
		const strand = (0, _mf_js_core.getStrandById)(editor.doc, s.strandId);
		editor.select({
			strandId: [strand.tokens[start].id, "content"],
			tokenIndex: 0
		});
	}
	return true;
};
/** The token that owns the strand the cursor is in, and where it sits. */
function owner(editor) {
	const head = editor.head;
	if (!head || head.strand.id === "[ROOT]") return null;
	const id = head.strand.id;
	for (const [strandId, strand] of strandsOf(editor.doc.root)) {
		const index = strand.tokens.findIndex((t) => t.id === id[0]);
		if (index >= 0) return {
			strandId,
			index,
			token: strand.tokens[index],
			box: id[1]
		};
	}
	return null;
}
/**
* The box the cursor is at the end of, when it has something in it: an
* exponent or a denominator. Typing on past a box's end is how you leave it.
*/
function endOfBox(editor) {
	const head = editor.head;
	if (!head || editor.hasRange) return null;
	if (head.index === 0 || head.index !== head.strand.tokens.length) return null;
	const o = owner(editor);
	if (!o) return null;
	if ((0, _mf_js_core.tokenIs)(o.token, subSupTokenType) && o.box === "superscript") return {
		kind: "exponent",
		tokens: head.strand.tokens
	};
	if ((0, _mf_js_core.tokenIs)(o.token, fractionTokenType) && o.box === "denominator") return {
		kind: "denominator",
		tokens: head.strand.tokens
	};
	return null;
}
const charOf = (t) => (0, _mf_js_core.tokenIs)(t, _mf_js_core.charTokenType) ? t.props.char : null;
const isNumber = (tokens) => tokens.every((t) => {
	const c = charOf(t);
	return c !== null && isNumberChar(c);
});
/** Step out after the token that owns the cursor's strand. */
function stepOut(editor) {
	const o = owner(editor);
	if (o) editor.select({
		strandId: o.strandId,
		tokenIndex: o.index + 1
	});
}
/** "^" makes a superscript after the cursor and puts the cursor in it: x^2 is x². */
const superscriptCommand = (editor) => {
	const s = editor.selection;
	if (!s) return false;
	const at = Math.min(s.anchorIndex, s.headIndex);
	editor.insert([{
		type: subSupTokenType.type,
		props: {
			hasSubscript: false,
			hasSuperscript: true
		},
		children: new Map([["superscript", []]])
	}]);
	const strand = (0, _mf_js_core.getStrandById)(editor.doc, s.strandId);
	editor.select({
		strandId: [strand.tokens[at].id, "superscript"],
		tokenIndex: 0
	});
	return true;
};
/**
* An operator typed at the end of an exponent or denominator goes after it, so
* x^2+1 is x² + 1 and 1/2+x is ½ + x. Returns false so the char is then typed
* as usual. Brackets keep more in the box: x^(n+1), 1/(2+x).
*/
const leaveBoxCommand = (editor) => {
	if (endOfBox(editor)) stepOut(editor);
	return false;
};
/**
* A letter typed after a plain number in a denominator, or after a number or one
* letter in an exponent, goes after the box too, the way the text form reads it:
* 1/2x is ½x, x^2y is x²y, 2^xy is 2^x·y. Use brackets for more: 1/(2x).
*/
const letterAfterBoxCommand = (editor) => {
	const box = endOfBox(editor);
	if (!box) return false;
	const oneLetter = box.tokens.length === 1 && /^\p{L}$/u.test(charOf(box.tokens[0]) ?? "");
	if (isNumber(box.tokens) || box.kind === "exponent" && oneLetter) stepOut(editor);
	return false;
};
/** ")" steps out of the brackets the cursor is in (first out of an exponent at
*  its end, as in (x^2)), or out of the square root it's in, as in sqrt(2).
*  Elsewhere it does nothing. */
const closeParenthesesCommand = (editor) => {
	if (endOfBox(editor)?.kind === "exponent") stepOut(editor);
	const head = editor.head;
	if (!head) return true;
	const id = head.strand.id;
	if (id !== "[ROOT]" && id[1] === "radicand") {
		stepOut(editor);
		return true;
	}
	if (id === "[ROOT]" || id[1] !== "content") return true;
	const doc = editor.doc;
	for (const [strandId, strand] of strandsOf(doc.root)) {
		const index = strand.tokens.findIndex((t) => t.id === id[0]);
		if (index >= 0 && (0, _mf_js_core.tokenIs)(strand.tokens[index], parenthesesTokenType)) {
			editor.select({
				strandId,
				tokenIndex: index + 1
			});
			return true;
		}
	}
	return true;
};
/** "√" makes a square root with the cursor in it, or puts the selection under one. */
const sqrtCommand = (editor) => {
	const s = editor.selection;
	if (!s) return false;
	const inside = editor.selectedTokens;
	const at = Math.min(s.anchorIndex, s.headIndex);
	editor.insert([{
		type: radicalTokenType.type,
		props: { isSqrt: true },
		children: new Map([["radicand", (0, _mf_js_core.templateFromTokens)(inside)]])
	}]);
	const strand = (0, _mf_js_core.getStrandById)(editor.doc, s.strandId);
	if (inside.length) editor.select({
		strandId: s.strandId,
		tokenIndex: at + 1
	});
	else editor.select({
		strandId: [strand.tokens[at].id, "radicand"],
		tokenIndex: 0
	});
	return true;
};
/** Typing the "t" of "sqrt" turns the word into a square root, like "√". */
const sqrtWordCommand = (editor) => {
	const head = editor.head;
	if (head && !editor.hasRange) {
		if (head.strand.tokens.slice(Math.max(0, head.index - 3), head.index).map(charOf).join("") === "sqr") {
			editor.select({
				strandId: head.strand.id,
				anchorIndex: head.index - 3,
				headIndex: head.index
			});
			editor.deleteRange();
			return sqrtCommand(editor);
		}
	}
	return letterAfterBoxCommand(editor);
};
function* strandsOf(strand) {
	yield [strand.id, strand];
	for (const token of strand.tokens) for (const child of token.children.values()) yield* strandsOf(child);
}
/** The math editing commands: fractions, brackets, exponents and square roots,
*  and typing on past the end of a box. */
const mathCommands = {
	"/": fractionCommand,
	"(": openParenthesesCommand,
	")": closeParenthesesCommand,
	"^": superscriptCommand,
	"√": sqrtCommand,
	...Object.fromEntries([
		"+",
		"-",
		"−",
		"=",
		"<",
		">",
		",",
		"!"
	].map((c) => [c, leaveBoxCommand])),
	...Object.fromEntries([..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZαβγδθλμσφω"].map((c) => [c, letterAfterBoxCommand])),
	t: sqrtWordCommand
};
//#endregion
//#region src/text.ts
/** Build a Doc from plain text. `typingRules` (like "<=" -> "≤") are applied first. */
function textToDoc(text, { clientId = "text", typingRules = [], fractions = false } = {}) {
	const chars = [...applyTypingRules(text, typingRules)].filter((c) => !/\s/.test(c));
	let counter = 0;
	let i = 0;
	const nextId = () => `${clientId}/${counter++}`;
	const readStrand = (id, close = id === "[ROOT]" ? null : ")") => {
		const tokens = [];
		while (i < chars.length) {
			const char = chars[i++];
			if (char === close) break;
			if (char === "^") {
				const token = (0, _mf_js_core.createDocToken)(nextId(), subSupTokenType, {
					hasSubscript: false,
					hasSuperscript: true
				});
				const supId = [token.id, "superscript"];
				if (chars[i] === "{") {
					i++;
					token.children.set("superscript", readStrand(supId, "}"));
				} else if (chars[i] === "(") {
					i++;
					const brackets = (0, _mf_js_core.createDocToken)(nextId(), parenthesesTokenType, {});
					brackets.children.set("content", readStrand([brackets.id, "content"]));
					token.children.set("superscript", {
						id: supId,
						tokens: [brackets]
					});
				} else {
					const start = i;
					if (chars[i] === "-" || chars[i] === "−") i++;
					const digits = i;
					while (i < chars.length && isNumberChar(chars[i])) i++;
					if (i === digits && i < chars.length && /\p{L}/u.test(chars[i])) i++;
					const tokens = chars.slice(start, i).map((c) => (0, _mf_js_core.createDocToken)(nextId(), _mf_js_core.charTokenType, { char: c }));
					token.children.set("superscript", {
						id: supId,
						tokens
					});
				}
				tokens.push(token);
			} else if (char === "√" || char === "s" && chars.slice(i, i + 4).join("") === "qrt(") {
				if (char === "s") i += 3;
				const token = (0, _mf_js_core.createDocToken)(nextId(), radicalTokenType, { isSqrt: true });
				const id = [token.id, "radicand"];
				if (chars[i] === "(") {
					i++;
					token.children.set("radicand", readStrand(id));
				} else {
					const start = i;
					while (i < chars.length && isNumberChar(chars[i])) i++;
					if (i === start && i < chars.length && /\p{L}/u.test(chars[i])) i++;
					const tokens = chars.slice(start, i).map((c) => (0, _mf_js_core.createDocToken)(nextId(), _mf_js_core.charTokenType, { char: c }));
					token.children.set("radicand", {
						id,
						tokens
					});
				}
				tokens.push(token);
			} else if (char === "(") {
				const token = (0, _mf_js_core.createDocToken)(nextId(), parenthesesTokenType, {});
				token.children.set("content", readStrand([token.id, "content"]));
				tokens.push(token);
			} else tokens.push((0, _mf_js_core.createDocToken)(nextId(), _mf_js_core.charTokenType, { char }));
		}
		return {
			id,
			tokens: fractions ? makeFractions(tokens, nextId) : tokens
		};
	};
	return {
		root: readStrand("[ROOT]"),
		selection: null
	};
}
const isNumberToken = (token) => (0, _mf_js_core.tokenIs)(token, _mf_js_core.charTokenType) && isNumberChar(token.props.char);
const isSlash = (token) => (0, _mf_js_core.tokenIs)(token, _mf_js_core.charTokenType) && token.props.char === "/";
/** Turn each "/" between two operands into a fraction token, left to right. */
function makeFractions(tokens, nextId) {
	const out = [...tokens];
	const contents = (part) => part.length === 1 && (0, _mf_js_core.tokenIs)(part[0], parenthesesTokenType) ? part[0].children.get("content")?.tokens ?? [] : part;
	for (let k = 0; k < out.length; k++) {
		if (!isSlash(out[k])) continue;
		const start = numeratorStart(out, k);
		let end = k + 1;
		while (end < out.length && isNumberToken(out[end])) end++;
		if (end === k + 1 && end < out.length && !(0, _mf_js_core.tokenIs)(out[end], _mf_js_core.charTokenType)) end++;
		if (start === k || end === k + 1) continue;
		const fraction = (0, _mf_js_core.createDocToken)(nextId(), fractionTokenType, {});
		const numerator = contents(out.slice(start, k));
		const denominator = contents(out.slice(k + 1, end));
		fraction.children.set("numerator", {
			id: [fraction.id, "numerator"],
			tokens: numerator
		});
		fraction.children.set("denominator", {
			id: [fraction.id, "denominator"],
			tokens: denominator
		});
		out.splice(start, end - start, fraction);
		k = start;
	}
	return out;
}
/** Write a Doc as plain text. A fraction is written numerator/denominator, with
*  brackets around either part unless it is just a number: 3π/2, (x+1)/2.
*  An exponent is written ^2, ^x, ^{1/2} or, with brackets typed in it, ^(n+1).
*  A square root is written sqrt(…).
*  Throws for tokens with no text form yet (other roots, subscripts, matrices). */
function docToText(doc) {
	const part = (strand) => {
		const tokens = strand?.tokens ?? [];
		const text = write(strand);
		return tokens.length && tokens.every((t, k) => isNumberToken(t) || k === tokens.length - 1 && (0, _mf_js_core.tokenIs)(t, radicalTokenType)) ? text : `(${text})`;
	};
	const write = (strand) => (strand?.tokens ?? []).map((token) => {
		if ((0, _mf_js_core.tokenIs)(token, _mf_js_core.charTokenType)) return token.props.char;
		if ((0, _mf_js_core.tokenIs)(token, parenthesesTokenType)) return `(${write(token.children.get("content"))})`;
		if ((0, _mf_js_core.tokenIs)(token, fractionTokenType)) return `${part(token.children.get("numerator"))}/${part(token.children.get("denominator"))}`;
		if ((0, _mf_js_core.tokenIs)(token, subSupTokenType) && !token.props.hasSubscript) {
			const sup = token.children.get("superscript");
			const text = write(sup);
			return `^${sup?.tokens.length === 1 && (0, _mf_js_core.tokenIs)(sup.tokens[0], parenthesesTokenType) || /^[-−]?[0-9.π]+$|^\p{L}$/u.test(text) ? text : `{${text}}`}`;
		}
		if ((0, _mf_js_core.tokenIs)(token, radicalTokenType) && token.props.isSqrt) return `sqrt(${write(token.children.get("radicand"))})`;
		throw new Error(`No text form for token type ${token.type}`);
	}).join("");
	return write(doc.root);
}
//#endregion
//#region src/evaluate.ts
/** The value of an expression made of numbers, constants and the given
*  variables, like 3π/2, or 2x + 1 with { x: 3 }. Returns null for anything
*  else: an unknown variable, a statement or a parse error. */
function evaluate(node, variables = {}) {
	const evaluate_ = (n) => evaluate(n, variables);
	const all = (nodes) => {
		const values = nodes.map(evaluate_);
		return values.every((v) => v !== null) ? values : null;
	};
	if (node instanceof DecimalNode) return node.toFloat();
	if (node instanceof ConstantNode) return node.value;
	if (node instanceof VariableNode) return Object.hasOwn(variables, node.name) ? variables[node.name] : null;
	if (node instanceof NegativeNode) {
		const v = evaluate_(node.child);
		return v === null ? null : -v;
	}
	if (node instanceof PositiveNode) return evaluate_(node.child);
	if (node instanceof AddNode) return all(node.addends)?.reduce((a, b) => a + b, 0) ?? null;
	if (node instanceof MultiplyNode) return all(node.factors)?.reduce((a, b) => a * b, 1) ?? null;
	if (node instanceof SubtractNode) {
		const v = all([node.minuend, node.subtrahend]);
		return v && v[0] - v[1];
	}
	if (node instanceof DivideNode) {
		const v = all([node.dividend, node.divisor]);
		return v && v[1] !== 0 ? v[0] / v[1] : null;
	}
	if (node instanceof ExponentNode) {
		const v = all([node.base, node.power]);
		return v && v[0] ** v[1];
	}
	if (node instanceof RadicalNode) {
		const v = all(node.index ? [node.radicand, node.index] : [node.radicand]);
		return v && v[0] ** (1 / (v[1] ?? 2));
	}
	return null;
}
//#endregion
exports.AddNode = AddNode;
exports.AddParselet = AddParselet;
exports.AdjacentMultiplicationParselet = AdjacentMultiplicationParselet;
exports.CanBeAdjacentMultLeftSideTag = CanBeAdjacentMultLeftSideTag;
exports.CanBeAdjacentMultRightSideTag = CanBeAdjacentMultRightSideTag;
exports.CommaListNode = CommaListNode;
exports.CommaListParselet = CommaListParselet;
exports.ComparisonNode = ComparisonNode;
exports.ComparisonParselet = ComparisonParselet;
exports.ConstantNode = ConstantNode;
exports.ConstantParselet = ConstantParselet;
exports.DecimalNode = DecimalNode;
exports.DecimalParselet = DecimalParselet;
exports.DivideNode = DivideNode;
exports.EquationNode = EquationNode;
exports.EquationParselet = EquationParselet;
exports.ExponentNode = ExponentNode;
exports.FractionParselet = FractionParselet;
exports.FractionTokenComponent = FractionTokenComponent;
exports.FunctionCallNode = FunctionCallNode;
exports.FunctionCallParselet = FunctionCallParselet;
exports.FunctionDefinitionNode = FunctionDefinitionNode;
exports.KeywordNode = KeywordNode;
exports.KeywordParselet = KeywordParselet;
exports.LogicNode = LogicNode;
exports.LogicParselet = LogicParselet;
exports.MathExpressionTag = MathExpressionTag;
exports.MathStatementTag = MathStatementTag;
exports.MatrixTokenComponent = MatrixTokenComponent;
exports.MultiplicationStyleTag = MultiplicationStyleTag;
exports.MultiplyNode = MultiplyNode;
exports.MultiplyParselet = MultiplyParselet;
exports.NegativeNode = NegativeNode;
exports.ParenthesesChildTag = ParenthesesChildTag;
exports.ParenthesesParselet = ParenthesesParselet;
exports.ParenthesesTokenComponent = ParenthesesTokenComponent;
exports.PositiveNode = PositiveNode;
exports.RadicalNode = RadicalNode;
exports.RadicalParselet = RadicalParselet;
exports.RadicalTokenComponent = RadicalTokenComponent;
exports.SlashDivideParselet = SlashDivideParselet;
exports.SubSupParselet = SubSupParselet;
exports.SubSupTokenComponent = SubSupTokenComponent;
exports.SubscriptNode = SubscriptNode;
exports.SubtractNode = SubtractNode;
exports.SubtractParselet = SubtractParselet;
exports.UnaryMinusParselet = UnaryMinusParselet;
exports.UnaryPlusParselet = UnaryPlusParselet;
exports.VariableNode = VariableNode;
exports.VariableParselet = VariableParselet;
exports.applyTypingRules = applyTypingRules;
exports.closeParenthesesCommand = closeParenthesesCommand;
exports.comparisonTypingRules = comparisonTypingRules;
exports.defaultParselets = defaultParselets;
exports.docToText = docToText;
exports.equationParselets = equationParselets;
exports.evaluate = evaluate;
exports.fractionCommand = fractionCommand;
exports.fractionTokenType = fractionTokenType;
exports.inequalityParselets = inequalityParselets;
exports.isNumberChar = isNumberChar;
exports.mathCommands = mathCommands;
exports.matrixTokenType = matrixTokenType;
exports.numberParselets = numberParselets;
exports.openParenthesesCommand = openParenthesesCommand;
exports.parenthesesTokenType = parenthesesTokenType;
exports.piTypingRule = piTypingRule;
exports.radicalTokenType = radicalTokenType;
exports.sqrtCommand = sqrtCommand;
exports.subSupTokenType = subSupTokenType;
exports.textToDoc = textToDoc;
exports.toText = toText;
