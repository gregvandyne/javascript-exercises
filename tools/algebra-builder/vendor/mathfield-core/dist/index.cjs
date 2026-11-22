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
let zod = require("zod");
zod = __toESM(zod);
//#region src/pool.ts
function idsEqual(a, b) {
	if (typeof a === "string" && typeof b === "string") return a === b;
	if (Array.isArray(a) && Array.isArray(b)) return a[0] === b[0] && a[1] === b[1];
	return false;
}
function* getDotsFromPool(pool) {
	for (const tokenKey of pool.tokens.keys()) {
		yield tokenKey;
		const token = pool.tokens.get(tokenKey);
		yield token.origin.dot;
		for (const prop of token.props.values()) yield prop.dot;
	}
}
function getCurrentCounter(pool) {
	let maxCounter = 0;
	for (const dot of getDotsFromPool(pool)) {
		const [_, counterStr] = dot.split("/");
		const counter = parseInt(counterStr, 10);
		if (counter > maxCounter) maxCounter = counter;
	}
	return maxCounter;
}
function generateNewDot(pool, clientId) {
	return `${clientId}/${getCurrentCounter(pool) + 1}`;
}
//#endregion
//#region src/tokens/char.ts
const charTokenType = defineTokenType("core/char", {
	props: zod.object({ char: zod.string() }),
	childKeys: []
});
//#endregion
//#region src/doc.ts
function isStrandPath(path) {
	if (!Array.isArray(path)) return false;
	return path.every((segment) => typeof segment === "object" && typeof segment.tokenIndex === "number" && typeof segment.childName === "string");
}
function strandPathsEqual(a, b) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i].tokenIndex !== b[i].tokenIndex) return false;
		if (a[i].childName !== b[i].childName) return false;
	}
	return true;
}
function strandPathIsAncestor(parent, child) {
	if (parent.length >= child.length) return false;
	for (let i = 0; i < parent.length; i++) {
		if (parent[i].tokenIndex !== child[i].tokenIndex) return false;
		if (parent[i].childName !== child[i].childName) return false;
	}
	return true;
}
function getStrandByPath(doc, strandPath) {
	let currentStrand = "root" in doc ? doc.root : doc;
	for (const { tokenIndex, childName } of strandPath) {
		const token = currentStrand.tokens[tokenIndex];
		if (!token) return null;
		const childStrand = token.children.get(childName);
		if (!childStrand) return null;
		currentStrand = childStrand;
	}
	return currentStrand;
}
function getStrandById(doc, id) {
	const root = "root" in doc ? doc.root : doc;
	for (const strand of traverseStrands(root)) if (idsEqual(strand.id, id)) return strand;
	return null;
}
function findStrandPath(rootStrand, targetStrand) {
	const path = [];
	let found = false;
	const searchStrand = (currentStrand, currentPath) => {
		if (currentStrand === targetStrand) {
			path.push(...currentPath);
			found = true;
			return;
		}
		for (let i = 0; i < currentStrand.tokens.length; i++) {
			const currentToken = currentStrand.tokens[i];
			for (const childName of currentToken.children.keys()) {
				searchStrand(currentToken.children.get(childName), [...currentPath, {
					tokenIndex: i,
					childName
				}]);
				if (found) return;
			}
		}
	};
	searchStrand(rootStrand, []);
	return found ? path : null;
}
function* traverseStrands(strand) {
	yield strand;
	for (const token of strand.tokens) for (const childStrand of token.children.values()) yield* traverseStrands(childStrand);
}
function getToken(doc, tokenPath) {
	const strand = getStrandByPath(doc, tokenPath.strandPath);
	if (!strand) return null;
	return strand.tokens[tokenPath.tokenIndex] ?? null;
}
function createDocToken(id, type, props, children = /* @__PURE__ */ new Map()) {
	return {
		id,
		type: type.type,
		props,
		children
	};
}
function tokenIs(token, type) {
	if (!token) return false;
	if (typeof type === "string") {
		if (!tokenIs(token, charTokenType)) return false;
		return token.props.char === type;
	}
	return token.type === type.type;
}
function getCursorFromSelection(selection, type) {
	return {
		strandId: selection.strandId,
		tokenIndex: type === "anchor" ? selection.anchorIndex : selection.headIndex
	};
}
//#endregion
//#region src/schema.ts
function defineTokenType(type, options) {
	return {
		type,
		props: options.props ?? zod.record(zod.string(), zod.unknown()),
		childKeys: options.childKeys ?? []
	};
}
function defineSchema(schema) {
	return schema;
}
function constructDoc(pool, schema, options = {}) {
	const root = constructDocStrand(schema, "[ROOT]", pool, options);
	return {
		root,
		selection: constructDocSelection(pool, schema, root)
	};
}
function constructDocStrand(schema, id, pool, options = {}) {
	const { includeDeleted = false } = options;
	const strand = {
		id,
		tokens: []
	};
	const unplacedIds = new Set(pool.tokens.keys());
	const placedIds = /* @__PURE__ */ new Set();
	const getCandidates = () => {
		const candidates = /* @__PURE__ */ new Set();
		for (const [tokenId, token] of pool.tokens.entries()) {
			if (placedIds.has(tokenId)) continue;
			if (!idsEqual(token.origin.left, id) && !placedIds.has(token.origin.left)) continue;
			if ([...unplacedIds].some((otherId) => idsEqual(pool.tokens.get(otherId).origin.right, tokenId))) continue;
			candidates.add(tokenId);
		}
		return candidates;
	};
	while (true) {
		const candidates = getCandidates();
		if (candidates.size === 0) break;
		let nextTokenId = null;
		for (const candidateId of candidates) if (nextTokenId === null || candidateId < nextTokenId) nextTokenId = candidateId;
		if (!nextTokenId) break;
		if (!pool.tokens.get(nextTokenId)?.deleted || includeDeleted) strand.tokens.push(constructDocToken(schema, pool, nextTokenId, options));
		unplacedIds.delete(nextTokenId);
		placedIds.add(nextTokenId);
	}
	return strand;
}
function constructDocToken(schema, pool, id, options = {}) {
	const token = pool.tokens.get(id);
	if (!token) throw new Error(`Token with id ${id} not found in pool`);
	const tokenSchema = [...schema.tokenTypes].find((t) => t.type === token.type);
	if (!tokenSchema) throw new Error(`Token type ${token.type} not found in schema`);
	const propsObj = Object.fromEntries([...token.props.entries()].map(([key, { value }]) => [key, value]));
	const propsValidation = tokenSchema.props["~standard"].validate(propsObj);
	if (propsValidation instanceof Promise) throw new Error(`Async props validation not supported for token ${id}`);
	if (!("value" in propsValidation)) {
		console.error(`Props validation failed for token ${id}:`, propsValidation);
		throw new Error(`Props validation failed for token ${id}`);
	}
	const childKeys = typeof tokenSchema.childKeys === "function" ? tokenSchema.childKeys({ props: propsValidation.value }) : tokenSchema.childKeys;
	const children = /* @__PURE__ */ new Map();
	for (const childKey of childKeys) {
		const childId = [id, childKey];
		children.set(childKey, constructDocStrand(schema, childId, pool, options));
	}
	return {
		id,
		type: token.type,
		props: propsValidation.value,
		children
	};
}
function constructDocSelection(pool, schema, rootStrand) {
	const anchor = constructDocCursor(pool, schema, "anchor");
	const head = constructDocCursor(pool, schema, "head");
	if (!anchor || !head) return null;
	const anchorStrand = getStrandById(rootStrand, anchor.strandId);
	const headStrand = getStrandById(rootStrand, head.strandId);
	if (!anchorStrand || !headStrand) throw new Error("Strand IDs in selection do not exist in document");
	const anchorStrandPath = findStrandPath(rootStrand, anchorStrand);
	const headStrandPath = findStrandPath(rootStrand, headStrand);
	if (!anchorStrandPath || !headStrandPath) throw new Error("Strand IDs in selection do not exist in document");
	let strandPath = [];
	const minPathLength = Math.min(anchorStrandPath.length, headStrandPath.length);
	for (let i = 0; i < minPathLength; i++) {
		if (anchorStrandPath[i].tokenIndex !== headStrandPath[i].tokenIndex || anchorStrandPath[i].childName !== headStrandPath[i].childName) break;
		strandPath = [...strandPath, anchorStrandPath[i]];
	}
	const orientation = findSelectionOrientation(schema, rootStrand, anchor, head);
	let anchorIndex;
	if (anchorStrandPath.length > strandPath.length) {
		const tokenIndexAtCommonStrand = anchorStrandPath[strandPath.length].tokenIndex;
		anchorIndex = orientation === "ltr" ? tokenIndexAtCommonStrand : tokenIndexAtCommonStrand + 1;
	} else anchorIndex = anchor.tokenIndex;
	let headIndex;
	if (headStrandPath.length > strandPath.length) {
		const tokenIndexAtCommonStrand = headStrandPath[strandPath.length].tokenIndex;
		headIndex = orientation === "ltr" ? tokenIndexAtCommonStrand + 1 : tokenIndexAtCommonStrand;
	} else headIndex = head.tokenIndex;
	const strand = getStrandByPath(rootStrand, strandPath);
	if (!strand) throw new Error("Common strand not found");
	return {
		strandId: strand.id,
		anchorIndex,
		headIndex
	};
}
function constructDocCursor(pool, schema, cursorName) {
	const poolCursor = pool.selection?.[cursorName];
	if (!poolCursor) return null;
	const containsCursor = (strand) => {
		if (idsEqual(strand.id, poolCursor.left) || idsEqual(strand.id, poolCursor.right)) return true;
		for (const token of strand.tokens) {
			const tokenId = token.id;
			if (idsEqual(tokenId, poolCursor.left) || idsEqual(tokenId, poolCursor.right)) return true;
		}
		return false;
	};
	const rootStrandWithDeleted = constructDocStrand(schema, "[ROOT]", pool, { includeDeleted: true });
	const rootStrandWithoutDeleted = constructDocStrand(schema, "[ROOT]", pool);
	for (const strandWithDeleted of traverseStrands(rootStrandWithDeleted)) if (containsCursor(strandWithDeleted)) {
		const strandWithoutDeleted = getStrandById(rootStrandWithoutDeleted, strandWithDeleted.id);
		if (!strandWithoutDeleted) continue;
		const cursorIndexInWithDeleted = strandWithDeleted.tokens.findIndex((token) => idsEqual(token.id, poolCursor.left));
		if (cursorIndexInWithDeleted === -1) return {
			strandId: strandWithoutDeleted.id,
			tokenIndex: 0
		};
		const tokensBeforeCursor = strandWithDeleted.tokens.slice(0, cursorIndexInWithDeleted + 1).filter((token) => strandWithoutDeleted.tokens.some((t) => idsEqual(t.id, token.id)));
		return {
			strandId: strandWithoutDeleted.id,
			tokenIndex: tokensBeforeCursor.length
		};
	}
	return null;
}
function findSelectionOrientation(schema, rootStrand, cursorA, cursorB) {
	const strandA = getStrandById(rootStrand, cursorA.strandId);
	const strandB = getStrandById(rootStrand, cursorB.strandId);
	if (!strandA || !strandB) throw new Error("Strand IDs in selection do not exist in document");
	const strandPathA = findStrandPath(rootStrand, strandA);
	const strandPathB = findStrandPath(rootStrand, strandB);
	if (!strandPathA || !strandPathB) throw new Error("Strand IDs in selection do not exist in document");
	const minPathLength = Math.min(strandPathA.length, strandPathB.length);
	for (let i = 0; i < minPathLength; i++) {
		if (strandPathA[i].tokenIndex < strandPathB[i].tokenIndex) return "ltr";
		if (strandPathA[i].tokenIndex > strandPathB[i].tokenIndex) return "rtl";
		const tokenA = getToken(rootStrand, {
			strandPath: strandPathA.slice(0, i),
			tokenIndex: strandPathA[i].tokenIndex
		});
		const tokenB = getToken(rootStrand, {
			strandPath: strandPathB.slice(0, i),
			tokenIndex: strandPathB[i].tokenIndex
		});
		if (!tokenA || !tokenB) throw new Error("Token not found at expected path");
		const childKeysA = getChildkeys(schema, tokenA);
		const childKeysB = getChildkeys(schema, tokenB);
		const childKeyA = strandPathA[i].childName;
		const childKeyB = strandPathB[i].childName;
		const indexA = childKeysA.indexOf(childKeyA);
		const indexB = childKeysB.indexOf(childKeyB);
		if (indexA < indexB) return "ltr";
		if (indexA > indexB) return "rtl";
	}
	if (strandPathA.length > strandPathB.length) return strandPathA[minPathLength].tokenIndex < cursorB.tokenIndex ? "ltr" : "rtl";
	else if (strandPathB.length > strandPathA.length) return strandPathB[minPathLength].tokenIndex < cursorA.tokenIndex ? "rtl" : "ltr";
	else {
		if (cursorA.tokenIndex < cursorB.tokenIndex) return "ltr";
		if (cursorA.tokenIndex > cursorB.tokenIndex) return "rtl";
	}
	return "equal";
}
/** A token's child keys, in order. Types whose children depend on their props
*  (like a sub/superscript) are asked with this token's own props. */
function getChildkeys(schema, token) {
	const tokenSchema = [...schema.tokenTypes].find((t) => t.type === token.type);
	if (!tokenSchema) throw new Error(`Token type ${token.type} not found in schema`);
	return typeof tokenSchema.childKeys === "function" ? tokenSchema.childKeys({ props: token.props }) : tokenSchema.childKeys;
}
function getPoolCursor(pool, rootStrand, docCursor) {
	const strand = getStrandById(rootStrand, docCursor.strandId);
	if (!strand) throw new Error("Strand ID in cursor does not exist in document");
	const tokensBeforeCursor = strand.tokens.slice(0, docCursor.tokenIndex);
	const tokensAfterCursor = strand.tokens.slice(docCursor.tokenIndex);
	return {
		left: tokensBeforeCursor.length > 0 ? tokensBeforeCursor[tokensBeforeCursor.length - 1].id : strand.id,
		right: tokensAfterCursor.length > 0 ? tokensAfterCursor[0].id : strand.id
	};
}
//#endregion
//#region src/utils/indent.ts
function indent(str, indentation = 4) {
	const indentStr = typeof indentation === "number" ? " ".repeat(indentation) : indentation;
	return str.split("\n").map((line) => indentStr + line).join("\n");
}
//#endregion
//#region src/vdom.ts
function h(type, attributesAndKey = {}, ...children) {
	let namespaceURI;
	if (mathmlTagNames.includes(type)) namespaceURI = "http://www.w3.org/1998/Math/MathML";
	else if (svgTagNames.includes(type)) namespaceURI = "http://www.w3.org/2000/svg";
	const { key, ...attributes } = attributesAndKey;
	return {
		key,
		type,
		namespaceURI,
		attributes,
		children: children.filter((child) => !!child)
	};
}
function t(text) {
	return { text };
}
function renderVNode(node) {
	if (node === null || node === void 0) return null;
	if ("text" in node) return document.createTextNode(node.text);
	if ("fragment" in node) return node.fragment.flatMap((n) => renderVNode(n));
	const elem = node.namespaceURI ? document.createElementNS(node.namespaceURI, node.type) : document.createElement(node.type);
	for (const [key, value] of Object.entries(node.attributes)) elem.setAttribute(key, value);
	for (const child of node.children) {
		const renderedChild = renderVNode(child);
		if (Array.isArray(renderedChild)) renderedChild.forEach((c) => {
			if (c) elem.appendChild(c);
		});
		else if (renderedChild) elem.appendChild(renderedChild);
	}
	return elem;
}
function renderVNodeToHTMLString(node) {
	if (node === null || node === void 0) return "";
	if ("text" in node) return node.text;
	if ("fragment" in node) return node.fragment.map(renderVNodeToHTMLString).join("");
	const attrs = Object.entries(node.attributes).map(([key, value]) => `${key}="${value}"`).join(" ");
	const children = node.children.map((child) => renderVNodeToHTMLString(child)).join("");
	return `<${node.type}${attrs ? " " + attrs : ""}>${children}</${node.type}>`;
}
const svgTagNames = [
	"a",
	"altGlyph",
	"altGlyphDef",
	"altGlyphItem",
	"animate",
	"animateColor",
	"animateMotion",
	"animateTransform",
	"animation",
	"audio",
	"canvas",
	"circle",
	"clipPath",
	"color-profile",
	"cursor",
	"defs",
	"desc",
	"discard",
	"ellipse",
	"feBlend",
	"feColorMatrix",
	"feComponentTransfer",
	"feComposite",
	"feConvolveMatrix",
	"feDiffuseLighting",
	"feDisplacementMap",
	"feDistantLight",
	"feDropShadow",
	"feFlood",
	"feFuncA",
	"feFuncB",
	"feFuncG",
	"feFuncR",
	"feGaussianBlur",
	"feImage",
	"feMerge",
	"feMergeNode",
	"feMorphology",
	"feOffset",
	"fePointLight",
	"feSpecularLighting",
	"feSpotLight",
	"feTile",
	"feTurbulence",
	"filter",
	"font",
	"font-face",
	"font-face-format",
	"font-face-name",
	"font-face-src",
	"font-face-uri",
	"foreignObject",
	"g",
	"glyph",
	"glyphRef",
	"handler",
	"hkern",
	"iframe",
	"image",
	"line",
	"linearGradient",
	"listener",
	"marker",
	"mask",
	"metadata",
	"missing-glyph",
	"mpath",
	"path",
	"pattern",
	"polygon",
	"polyline",
	"prefetch",
	"radialGradient",
	"rect",
	"script",
	"set",
	"solidColor",
	"stop",
	"style",
	"svg",
	"switch",
	"symbol",
	"tbreak",
	"text",
	"textArea",
	"textPath",
	"title",
	"tref",
	"tspan",
	"unknown",
	"use",
	"video",
	"view",
	"vkern"
];
const mathmlTagNames = [
	"abs",
	"and",
	"annotation",
	"annotation-xml",
	"apply",
	"approx",
	"arccos",
	"arccosh",
	"arccot",
	"arccoth",
	"arccsc",
	"arccsch",
	"arcsec",
	"arcsech",
	"arcsin",
	"arcsinh",
	"arctan",
	"arctanh",
	"arg",
	"bind",
	"bvar",
	"card",
	"cartesianproduct",
	"cbytes",
	"ceiling",
	"cerror",
	"ci",
	"cn",
	"codomain",
	"complexes",
	"compose",
	"condition",
	"conjugate",
	"cos",
	"cosh",
	"cot",
	"coth",
	"cs",
	"csc",
	"csch",
	"csymbol",
	"curl",
	"declare",
	"degree",
	"determinant",
	"diff",
	"divergence",
	"divide",
	"domain",
	"domainofapplication",
	"emptyset",
	"encoding",
	"eq",
	"equivalent",
	"eulergamma",
	"exists",
	"exp",
	"exponentiale",
	"factorial",
	"factorof",
	"false",
	"floor",
	"fn",
	"forall",
	"function",
	"gcd",
	"geq",
	"grad",
	"gt",
	"ident",
	"image",
	"imaginary",
	"imaginaryi",
	"implies",
	"in",
	"infinity",
	"int",
	"integers",
	"intersect",
	"interval",
	"inverse",
	"lambda",
	"laplacian",
	"lcm",
	"leq",
	"limit",
	"list",
	"ln",
	"log",
	"logbase",
	"lowlimit",
	"lt",
	"maction",
	"malign",
	"maligngroup",
	"malignmark",
	"malignscope",
	"math",
	"matrix",
	"matrixrow",
	"max",
	"mean",
	"median",
	"menclose",
	"merror",
	"mfenced",
	"mfrac",
	"mfraction",
	"mglyph",
	"mi",
	"min",
	"minus",
	"mlabeledtr",
	"mlongdiv",
	"mmultiscripts",
	"mn",
	"mo",
	"mode",
	"moment",
	"momentabout",
	"mover",
	"mpadded",
	"mphantom",
	"mprescripts",
	"mroot",
	"mrow",
	"ms",
	"mscarries",
	"mscarry",
	"msgroup",
	"msline",
	"mspace",
	"msqrt",
	"msrow",
	"mstack",
	"mstyle",
	"msub",
	"msubsup",
	"msup",
	"mtable",
	"mtd",
	"mtext",
	"mtr",
	"munder",
	"munderover",
	"naturalnumbers",
	"neq",
	"none",
	"not",
	"notanumber",
	"notin",
	"notprsubset",
	"notsubset",
	"or",
	"otherwise",
	"outerproduct",
	"partialdiff",
	"pi",
	"piece",
	"piecewice",
	"piecewise",
	"plus",
	"power",
	"primes",
	"product",
	"prsubset",
	"quotient",
	"rationals",
	"real",
	"reals",
	"reln",
	"rem",
	"root",
	"scalarproduct",
	"sdev",
	"sec",
	"sech",
	"select",
	"selector",
	"semantics",
	"sep",
	"set",
	"setdiff",
	"share",
	"sin",
	"sinh",
	"subset",
	"sum",
	"tan",
	"tanh",
	"tendsto",
	"times",
	"transpose",
	"true",
	"union",
	"uplimit",
	"var",
	"variance",
	"vector",
	"vectorproduct",
	"xor"
];
//#endregion
//#region src/node.ts
var TreeNode = class TreeNode {
	_tags = [];
	addTag(tag) {
		if (!tag.allowMultiple) {
			let existingTag = this._tags.find((t) => t instanceof tag.constructor);
			if (existingTag) {
				if (existingTag.combine) existingTag.combine(tag);
				else {
					this._tags = this._tags.filter((t) => t !== existingTag);
					this._tags.push(tag);
				}
				return this;
			}
		}
		this._tags.push(tag);
		return this;
	}
	getTag(type) {
		return this._tags.find((tag) => tag instanceof type);
	}
	getTags(type) {
		return this._tags.filter((tag) => tag instanceof type);
	}
	hasTag(tagMatcher) {
		return [...this._tags].some((t) => {
			if (tagMatcher instanceof NodeTag) return t.equals(tagMatcher);
			else return t instanceof tagMatcher;
		});
	}
	mergeTagsFromNodes(nodes) {
		for (const node of nodes) for (const tag of node._tags) this.addTag(tag);
		return this;
	}
	/** @deprecated This property is only for debugging purposes. */
	toDebugString() {
		return `${this.constructor.name}\n${indent(`${Object.entries(this).filter(([key, _]) => !key.startsWith("_")).map(([key, value]) => {
			if (Array.isArray(value)) return `${key}=[\n${indent(value.map((v) => v instanceof TreeNode ? v.toDebugString() : v.toString()).join("\n"))}\n]`;
			else if (value instanceof TreeNode) return `${key}=${value.toDebugString()}`;
			else return `${key}=${JSON.stringify(value)}`;
		}).filter(Boolean).join("\n")}`)}`;
	}
	/** @deprecated This property is only for debugging purposes. */
	toDebugHTML() {
		return `<div style="display:inline-block; border:1px solid black; padding:4px;">
      <strong>${this.constructor.name}</strong>
      <div style="display:flex; gap: 2px;">
        ${Object.entries(this).filter(([key, _]) => !key.startsWith("_")).map(([key, value]) => {
			if (key === "start" || key === "end") return "";
			return toDebugHTML(key + ":", value);
		}).join("\n")}
      </div>
    </div>`;
	}
	/** @deprecated This property is only for debugging purposes. */
	toDebugMathML() {
		return h("mrow", {});
	}
	*traverse() {
		yield this;
		for (const [key, value] of Object.entries(this)) {
			if (key.startsWith("_")) continue;
			if (Array.isArray(value)) {
				for (const v of value) if (v instanceof TreeNode) yield* v.traverse();
			} else if (value instanceof TreeNode) yield* value.traverse();
		}
	}
};
function toDebugHTML(name, value) {
	if (Array.isArray(value)) return `<div style="border:1px solid gray; padding: 2px;">${name}<div style="display: flex; gap: 2px">${value.map((v, i) => toDebugHTML(`${i}:`, v)).join("")}</div></div>`;
	else if (value instanceof TreeNode) return `<div style="border:1px solid gray; padding: 2px;">${name}${value.toDebugHTML()}</div>`;
	else return `<div style="border:1px solid gray; padding: 2px;">${name}<div>${JSON.stringify(value)}</div></div>`;
}
var NodeTag = class {};
var IsErrorNodeTag = class IsErrorNodeTag extends NodeTag {
	allowMultiple = false;
	equals(other) {
		return other instanceof IsErrorNodeTag;
	}
};
//#endregion
//#region src/nodes/missing.ts
var MissingNode = class MissingNode extends TreeNode {
	constructor() {
		super();
		this.addTag(new IsErrorNodeTag());
	}
	static from() {
		return new MissingNode();
	}
	toDebugMathML() {
		return h("mrow", {});
	}
};
//#endregion
//#region src/nodes/unparseable.ts
var UnparseableNode = class UnparseableNode extends TreeNode {
	constructor(parsed, unparsedTokens) {
		super();
		this.parsed = parsed;
		this.unparsedTokens = unparsedTokens;
		this.addTag(new IsErrorNodeTag());
	}
	static from(parsed, unparsedTokens) {
		return new UnparseableNode(parsed, unparsedTokens);
	}
	toDebugHTML() {
		return "<div style=\"color:red;\">Unparseable</div>";
	}
	toDebugMathML() {
		return h("mrow", {}, ...this.unparsedTokens.map((token) => h("mtext", { style: "color: red;" }, t(token.type))));
	}
};
//#endregion
//#region src/parselet.ts
var ParseletBase = class {
	assert(condition, errorMessage = `Assertion failed in ${this.constructor.name} parselet`) {
		if (!condition) throw new CannotParseError(this, errorMessage);
	}
};
/**
* A parselet used to handle leaf nodes. For example, variables and numbers ("x" or "42") can be implemented as leaf parselets.
*
* This parselet type is also used to handle standalone tokens like fractions and parentheses that contain their own sub-expressions
* but do not expect to be paired with any particular sibling tokens.
*/
var LeafParselet = class extends ParseletBase {};
/**
* A parselet used to handle prefix operators. For example, negation ("-a") can be implemented as a prefix parselet.
*/
var PrefixParselet = class extends ParseletBase {};
/**
* A parselet used to handle infix operators. For example, addition ("a + b") can be implemented as an infix parselet.
*/
var InfixParselet = class extends ParseletBase {};
/**
* A parselet used to handle postfix operators. For example, factorial ("n!")
* can be implemented as a postfix parselet.
*/
var PostfixParselet = class extends ParseletBase {};
/**
* A parselet that handles adjacent nodes. For example, implicit multiplication ("2x" or "3(x+1)")
* can be implemented as a juxtaposition parselet.
*/
var JuxtapositionParselet = class extends ParseletBase {};
var CannotParseError = class extends Error {
	constructor(parselet, message) {
		super(message);
		this.parselet = parselet;
		this.name = "CannotParseError";
	}
};
//#endregion
//#region src/parser.ts
var MfParser = class {
	_parselets;
	_parseletBindingPower = /* @__PURE__ */ new Map();
	constructor(parselets) {
		this._parselets = parselets.flatMap((p) => p instanceof Set ? Array.from(p) : p);
		for (let i = 0; i < parselets.length; i++) {
			const parseletOrSet = parselets[i];
			const bindingPower = parselets.length - i;
			if (parseletOrSet instanceof Set) for (const parselet of parseletOrSet) this._parseletBindingPower.set(parselet, bindingPower);
			else this._parseletBindingPower.set(parseletOrSet, bindingPower);
		}
	}
	parse(doc) {
		const { node } = this.parsePart(doc);
		return node;
	}
	parsePart(doc, strandOrPath = [], startPos = 0, minBindingPower = 0) {
		let strand;
		const foundPath = findStrandPath(doc.root, strandOrPath);
		if (foundPath) strand = getStrandByPath(doc, foundPath);
		else if (isStrandPath(strandOrPath)) strand = getStrandByPath(doc, strandOrPath);
		else throw new Error(`Strand not found in doc: ${JSON.stringify(strandOrPath)}`);
		if (!strand) throw new Error(`Strand not found at path: ${JSON.stringify(strandOrPath)}`);
		let pos = startPos;
		if (typeof minBindingPower !== "number") minBindingPower = this._parseletBindingPower.get(minBindingPower) ?? 0;
		const peek = () => {
			if (pos < strand.tokens.length) return strand.tokens[pos];
			return null;
		};
		let currentParselet;
		const consume = (tokenType) => {
			if (pos >= strand.tokens.length) {
				if (tokenType === void 0) return null;
				throw new CannotParseError(currentParselet, `Expected token${tokenType === true ? "" : typeof tokenType === "string" ? ` "${tokenType}"` : ` of type ${tokenType.type}`}, but reached end of strand`);
			}
			const token = strand.tokens[pos++];
			if (tokenType) {
				if (tokenType === true) {} else if (typeof tokenType === "string") {
					if (!tokenIs(token, tokenType)) throw new CannotParseError(currentParselet, `Expected token "${tokenType}", got ${tokenIs(token, charTokenType) ? `"${token.props.char}"` : `type ${token.type}`}`);
				} else if (!tokenIs(token, tokenType)) throw new CannotParseError(currentParselet, `Expected token of type ${tokenType.type}, got type ${token.type}`);
			}
			return token;
		};
		const parseChild = (strandPath) => {
			const { node } = this.parsePart(doc, strandPath);
			return node;
		};
		const done = () => pos >= strand.tokens.length;
		if (done()) return {
			node: new MissingNode(),
			endPos: pos
		};
		const parselets = this.filterParselets(["leaf", "prefix"]);
		let resultNode;
		for (const parselet of parselets) {
			const posBefore = pos;
			try {
				if (parselet instanceof LeafParselet) resultNode = parselet.parse({
					consume,
					peek,
					parseChild
				});
				else {
					const parseRight = () => {
						const { node, endPos } = this.parsePart(doc, strandOrPath, pos, parselet);
						pos = endPos;
						return node;
					};
					currentParselet = parselet;
					resultNode = parselet.parse({
						consume,
						peek,
						parseChild,
						parseRight
					});
				}
				break;
			} catch (error) {
				if (error instanceof CannotParseError) {
					pos = posBefore;
					continue;
				}
				throw error;
			}
		}
		if (!resultNode) {
			const unparsedTokens = strand.tokens.slice(pos);
			pos = strand.tokens.length;
			return {
				node: UnparseableNode.from(null, unparsedTokens),
				endPos: pos
			};
		}
		let left = resultNode;
		while (!done()) {
			let resultNode;
			{
				const parselets = this.filterParselets(["infix", "postfix"]);
				for (const parselet of parselets) {
					const bindingPower = this.getBindingPower(parselet);
					if (bindingPower < minBindingPower) continue;
					if (bindingPower === minBindingPower && parselet instanceof InfixParselet && parselet.associativity === "left") continue;
					const posBefore = pos;
					try {
						if (parselet instanceof InfixParselet) {
							const parseRight = () => {
								const { node, endPos } = this.parsePart(doc, strandOrPath, pos, bindingPower);
								pos = endPos;
								return node;
							};
							currentParselet = parselet;
							resultNode = parselet.parse({
								consume,
								peek,
								parseChild,
								parseRight
							}, left);
						} else {
							currentParselet = parselet;
							resultNode = parselet.parse({
								consume,
								peek,
								parseChild
							}, left);
						}
						break;
					} catch (error) {
						if (error instanceof CannotParseError) {
							pos = posBefore;
							continue;
						}
						throw error;
					}
				}
			}
			if (resultNode) {
				left = resultNode;
				continue;
			}
			{
				const parselets = this.filterParselets(["juxtaposition"]);
				for (const parselet of parselets) {
					const bindingPower = this.getBindingPower(parselet);
					if (bindingPower < minBindingPower) continue;
					const posBefore = pos;
					try {
						const { node: right, endPos } = this.parsePart(doc, strandOrPath, pos, bindingPower);
						pos = endPos;
						if (!(left instanceof UnparseableNode) && !(right instanceof UnparseableNode) && parselet.canParse(left, right)) {
							resultNode = parselet.parse(left, right);
							break;
						} else pos = posBefore;
					} catch (error) {
						if (error instanceof CannotParseError) {
							pos = posBefore;
							continue;
						}
						throw error;
					}
				}
			}
			if (resultNode) left = resultNode;
			else break;
		}
		if (!done() && minBindingPower === 0) return {
			node: UnparseableNode.from(left, strand.tokens.slice(pos)),
			endPos: pos
		};
		return {
			node: left,
			endPos: pos
		};
	}
	filterParselets(validTypes) {
		return this._parselets.filter((parselet) => validTypes.some((typeName) => {
			switch (typeName) {
				case "leaf": return parselet instanceof LeafParselet;
				case "prefix": return parselet instanceof PrefixParselet;
				case "infix": return parselet instanceof InfixParselet;
				case "postfix": return parselet instanceof PostfixParselet;
				case "juxtaposition": return parselet instanceof JuxtapositionParselet;
				default: return false;
			}
		}));
	}
	getBindingPower(parselet) {
		const bindingPower = this._parseletBindingPower.get(parselet);
		if (bindingPower === void 0) throw new Error(`Parselet not registered: ${parselet.constructor.name}`);
		return bindingPower;
	}
};
//#endregion
//#region src/tags/tokens.ts
var TokensTag = class TokensTag extends NodeTag {
	allowMultiple = false;
	constructor(ownTokens) {
		super();
		this.ownTokens = ownTokens;
	}
	equals(other) {
		if (!(other instanceof TokensTag)) return false;
		if (this.ownTokens.length !== other.ownTokens.length) return false;
		for (let i = 0; i < this.ownTokens.length; i++) if (this.ownTokens[i] !== other.ownTokens[i]) return false;
		return true;
	}
	combine(other) {
		this.ownTokens.push(...other.ownTokens);
	}
};
//#endregion
//#region src/component.ts
const isMfVDOMComponentFlag = Symbol("isMfVDOMComponentFlag");
function createMfVDOMComponent(fn) {
	return Object.assign(fn, { [isMfVDOMComponentFlag]: true });
}
function isMfVDOMComponent(value) {
	return typeof value === "function" && value[isMfVDOMComponentFlag] === true;
}
//#endregion
//#region src/components/char.ts
const CharTokenComponent = createMfVDOMComponent(({ token }) => {
	return h("span", {}, t(token.props.char));
});
//#endregion
//#region src/syntaxHighlighter.ts
var SyntaxHighlighter = class {};
//#endregion
//#region src/actions.ts
/**
* Mutate the `pool` to set the cursor position based on a `DocSelection` or `DocCursor`
*/
function setDocSelectionOnPool(pool, schema, newSelection) {
	if (!newSelection) {
		pool.selection = null;
		return;
	}
	if ("tokenIndex" in newSelection) newSelection = {
		strandId: newSelection.strandId,
		anchorIndex: newSelection.tokenIndex,
		headIndex: newSelection.tokenIndex
	};
	const getPoolCursor = (docCursor) => {
		const strand = getStrandById(constructDoc(pool, schema), docCursor.strandId);
		if (!strand) {
			pool.selection = null;
			return;
		}
		let left = docCursor.strandId;
		if (docCursor.tokenIndex > 0) left = strand.tokens[docCursor.tokenIndex - 1].id;
		let right = docCursor.strandId;
		if (docCursor.tokenIndex < strand.tokens.length) right = strand.tokens[docCursor.tokenIndex].id;
		return {
			left,
			right
		};
	};
	const anchor = getPoolCursor(getCursorFromSelection(newSelection, "anchor"));
	const head = getPoolCursor(getCursorFromSelection(newSelection, "head"));
	if (!anchor || !head) {
		pool.selection = null;
		return;
	}
	pool.selection = {
		anchor,
		head
	};
}
function moveCursor(pool, schema, direction, holdAnchor = false) {
	const doc = constructDoc(pool, schema);
	const selection = doc.selection;
	if (!selection) return;
	const cursor = getCursorFromSelection(selection, "head");
	if (!cursor) return;
	const strand = getStrandById(doc, cursor.strandId);
	if (!strand) return;
	const strandPath = findStrandPath(doc.root, strand);
	if (!strandPath) return;
	const setHead = (head) => {
		const anchor = holdAnchor ? getCursorFromSelection(selection, "anchor") : head;
		pool.selection = {
			anchor: getPoolCursor(pool, doc.root, anchor),
			head: getPoolCursor(pool, doc.root, head)
		};
	};
	if (!holdAnchor && selection.anchorIndex !== selection.headIndex) {
		const orientation = selection.anchorIndex < selection.headIndex ? "ltr" : "rtl";
		const movingTowardsAnchor = orientation === "ltr" && direction === "left" || orientation === "rtl" && direction === "right";
		const newCursor = {
			strandId: selection.strandId,
			tokenIndex: movingTowardsAnchor ? selection.anchorIndex : selection.headIndex
		};
		const poolCursor = getPoolCursor(pool, doc.root, newCursor);
		pool.selection = {
			anchor: poolCursor,
			head: poolCursor
		};
		return;
	}
	if (direction === "left") if (cursor.tokenIndex === 0) {
		const siblingStrand = getSiblingStrand(doc, strandPath, "left");
		if (siblingStrand) {
			setHead({
				strandId: siblingStrand.id,
				tokenIndex: siblingStrand.tokens.length
			});
			return;
		}
		const parentStrand = strandPath.length > 0 ? getStrandByPath(doc, strandPath.slice(0, -1)) : null;
		if (parentStrand) {
			setHead({
				strandId: parentStrand.id,
				tokenIndex: strandPath.at(-1).tokenIndex
			});
			return;
		}
		return;
	} else {
		if (!holdAnchor) {
			const prevToken = strand.tokens[cursor.tokenIndex - 1];
			const childNames = [...prevToken.children.keys()];
			if (childNames.length > 0) {
				const lastChildName = childNames[childNames.length - 1];
				const lastChildStrand = prevToken.children.get(lastChildName);
				setHead({
					strandId: lastChildStrand.id,
					tokenIndex: lastChildStrand.tokens.length
				});
				return;
			}
		}
		setHead({
			strandId: cursor.strandId,
			tokenIndex: cursor.tokenIndex - 1
		});
		return;
	}
	else if (cursor.tokenIndex === strand.tokens.length) {
		const siblingStrand = getSiblingStrand(doc, strandPath, "right");
		if (siblingStrand) {
			setHead({
				strandId: siblingStrand.id,
				tokenIndex: 0
			});
			return;
		}
		const parentStrand = strandPath.length > 0 ? getStrandByPath(doc, strandPath.slice(0, -1)) : null;
		if (parentStrand) {
			setHead({
				strandId: parentStrand.id,
				tokenIndex: strandPath.at(-1).tokenIndex + 1
			});
			return;
		}
		return;
	} else {
		if (!holdAnchor) {
			const nextToken = strand.tokens[cursor.tokenIndex];
			const childNames = [...nextToken.children.keys()];
			if (childNames.length > 0) {
				const firstChildName = childNames[0];
				setHead({
					strandId: nextToken.children.get(firstChildName).id,
					tokenIndex: 0
				});
				return;
			}
		}
		setHead({
			strandId: cursor.strandId,
			tokenIndex: cursor.tokenIndex + 1
		});
		return;
	}
}
function getSiblingStrand(doc, strandPath, direction) {
	if (strandPath.length === 0) return null;
	const parentToken = getToken(doc, {
		strandPath: strandPath.slice(0, -1),
		tokenIndex: strandPath.at(-1).tokenIndex
	});
	if (!parentToken) return null;
	const childNames = [...parentToken.children.keys()];
	const childIndex = childNames.indexOf(strandPath.at(-1).childName);
	if (childIndex === -1) return null;
	const siblingIndex = childIndex + (direction === "left" ? -1 : 1);
	if (siblingIndex < 0 || siblingIndex >= childNames.length) return null;
	const siblingChildName = childNames[siblingIndex];
	return parentToken.children.get(siblingChildName) || null;
}
/**
* Mutate the `pool` to insert a template at the current cursor position in the `doc`.
* @param pool The pool to mutate with new tokens and cursor position
* @param schema The schema for constructing the document
* @param clientId The ID of the client performing the insertion (used for token ids)
* @param template The template to insert
*/
function insertTemplate(pool, schema, clientId, template, origin, moveCursorToEnd = true) {
	const doc = constructDoc(pool, schema);
	if (origin === void 0) {
		const selection = doc.selection;
		if (selection) origin = {
			strandId: selection.strandId,
			tokenIndex: selection.anchorIndex
		};
	}
	if (!origin) return;
	const strand = getStrandById(doc, origin.strandId);
	if (!strand) return;
	let leftId = origin.strandId;
	if (origin.tokenIndex > 0) leftId = strand.tokens[origin.tokenIndex - 1].id;
	let rightId = origin.strandId;
	if (origin.tokenIndex < strand.tokens.length) rightId = strand.tokens[origin.tokenIndex].id;
	const generatedIds = /* @__PURE__ */ new Map();
	for (const templateToken of template) {
		const newTokenId = generateNewDot(pool, clientId);
		generatedIds.set(templateToken, newTokenId);
		pool.tokens.set(newTokenId, {
			type: templateToken.type,
			origin: {
				dot: newTokenId,
				left: leftId,
				right: rightId
			},
			props: new Map(Object.entries(templateToken.props).map(([key, value]) => [key, {
				dot: newTokenId,
				value
			}])),
			deleted: false
		});
		leftId = newTokenId;
	}
	for (const templateToken of template) for (const [childKey, childTemplate] of templateToken.children.entries()) insertTemplate(pool, schema, clientId, childTemplate, {
		strandId: [generatedIds.get(templateToken), childKey],
		tokenIndex: 0
	});
	if (moveCursorToEnd) pool.selection = {
		anchor: {
			left: leftId,
			right: rightId
		},
		head: {
			left: leftId,
			right: rightId
		}
	};
}
function deleteSelection(pool, schema, direction, selection) {
	const doc = constructDoc(pool, schema);
	if (!selection) selection = doc.selection;
	if (!selection) return;
	const strand = getStrandById(doc, selection.strandId);
	if (!strand) return;
	let startIndex, endIndex;
	if ("tokenIndex" in selection) startIndex = endIndex = selection.tokenIndex;
	else {
		startIndex = Math.min(selection.anchorIndex, selection.headIndex);
		endIndex = Math.max(selection.anchorIndex, selection.headIndex);
	}
	if (startIndex === endIndex) {
		const index = startIndex;
		if (direction === "left" && index === 0) return;
		if (direction === "right" && index === strand.tokens.length) return;
		const targetToken = direction === "left" ? strand.tokens[index - 1] : strand.tokens[index];
		const targetTokenInPool = pool.tokens.get(targetToken.id);
		if (targetTokenInPool) targetTokenInPool.deleted = true;
	} else for (let i = startIndex; i < endIndex; i++) {
		const targetToken = strand.tokens[i];
		const targetTokenInPool = pool.tokens.get(targetToken.id);
		if (targetTokenInPool) targetTokenInPool.deleted = true;
	}
}
//#endregion
//#region src/editor.ts
/** Plain tokens as a template, so a doc (or part of one) can be inserted again. */
function templateFromTokens(tokens) {
	return tokens.map((token) => ({
		type: token.type,
		props: { ...token.props },
		children: new Map([...token.children.entries()].map(([key, strand]) => [key, templateFromTokens(strand.tokens)]))
	}));
}
/** A fresh pool holding a copy of `doc`, with the cursor at the end. */
function poolFromDoc(doc, schema, clientId) {
	const root = {
		left: "[ROOT]",
		right: "[ROOT]"
	};
	const pool = {
		tokens: /* @__PURE__ */ new Map(),
		selection: {
			anchor: { ...root },
			head: { ...root }
		}
	};
	insertTemplate(pool, schema, clientId, templateFromTokens(doc.root.tokens));
	return pool;
}
/**
* Editing for a math input, apart from any UI: typing, typing rules, deleting,
* moving the cursor and selecting. A UI turns key presses and text input into
* calls on this, and renders `doc` after each one.
*/
var Editor = class {
	pool;
	clientId;
	typingRules;
	commands;
	keepWhitespace;
	constructor(schema, options = {}) {
		this.schema = schema;
		this.clientId = options.clientId ?? "editor";
		this.typingRules = options.typingRules ?? [];
		this.commands = options.commands ?? {};
		this.keepWhitespace = options.keepWhitespace ?? false;
		this.pool = poolFromDoc({
			root: {
				id: "[ROOT]",
				tokens: []
			},
			selection: null
		}, schema, this.clientId);
	}
	get doc() {
		return constructDoc(this.pool, this.schema);
	}
	/** Replace everything with a copy of `doc`, cursor at the end. */
	load(doc) {
		this.pool = poolFromDoc(doc, this.schema, this.clientId);
	}
	get selection() {
		return this.doc.selection;
	}
	get hasRange() {
		const s = this.selection;
		return !!s && s.anchorIndex !== s.headIndex;
	}
	/** The strand the cursor is in and the tokens either side of it. */
	get head() {
		const doc = this.doc;
		const s = doc.selection;
		if (!s) return null;
		const strand = getStrandById(doc, s.strandId);
		return {
			strand,
			index: s.headIndex,
			before: strand.tokens[s.headIndex - 1] ?? null,
			after: strand.tokens[s.headIndex] ?? null
		};
	}
	/** The selected tokens, all from one strand. */
	get selectedTokens() {
		const doc = this.doc;
		const s = doc.selection;
		if (!s) return [];
		const strand = getStrandById(doc, s.strandId);
		const [a, b] = [s.anchorIndex, s.headIndex].sort((x, y) => x - y);
		return strand.tokens.slice(a, b);
	}
	select(selection) {
		setDocSelectionOnPool(this.pool, this.schema, selection);
	}
	selectAll() {
		this.select({
			strandId: "[ROOT]",
			anchorIndex: 0,
			headIndex: this.doc.root.tokens.length
		});
	}
	/** Delete the selected range, if there is one. */
	deleteRange() {
		const s = this.selection;
		if (!s || s.anchorIndex === s.headIndex) return false;
		deleteSelection(this.pool, this.schema, "left");
		this.select({
			strandId: s.strandId,
			tokenIndex: Math.min(s.anchorIndex, s.headIndex)
		});
		return true;
	}
	/** Insert tokens at the cursor, replacing any selection. */
	insert(template) {
		this.deleteRange();
		insertTemplate(this.pool, this.schema, this.clientId, template);
	}
	/** Type text as if key by key, applying commands and typing rules. */
	type(text) {
		for (const char of text) this.typeChar(char);
	}
	typeChar(char) {
		if (!this.keepWhitespace && /\s/.test(char)) return;
		if (!this.selection) return;
		if (this.commands[char]?.(this)) return;
		this.insert([{
			type: charTokenType.type,
			props: { char },
			children: /* @__PURE__ */ new Map()
		}]);
		this.applyTypingRules();
	}
	applyTypingRules() {
		for (const rule of this.typingRules) {
			const head = this.head;
			if (!head) return;
			const chars = [...rule.match];
			const start = head.index - chars.length;
			if (start < 0) continue;
			if (!chars.every((c, i) => {
				const token = head.strand.tokens[start + i];
				return tokenIs(token, charTokenType) && token.props.char === c;
			})) continue;
			this.select({
				strandId: head.strand.id,
				anchorIndex: start,
				headIndex: head.index
			});
			this.insert("template" in rule ? rule.template : [{
				type: charTokenType.type,
				props: { char: rule.char },
				children: /* @__PURE__ */ new Map()
			}]);
			return;
		}
	}
	/**
	* Backspace (left) or Delete (right). Next to a token with boxes, like a fraction,
	* the cursor steps into it. At the edge of a box (like an empty denominator), an
	* empty token is removed; otherwise the cursor steps out.
	*/
	delete(direction) {
		if (this.deleteRange()) return;
		const head = this.head;
		if (!head) return;
		if (!(direction === "left" ? head.index === 0 : head.index === head.strand.tokens.length)) {
			const target = direction === "left" ? head.before : head.after;
			if (target && target.children.size > 0) {
				this.move(direction);
				return;
			}
			const index = head.index;
			deleteSelection(this.pool, this.schema, direction);
			this.select({
				strandId: head.strand.id,
				tokenIndex: direction === "left" ? index - 1 : index
			});
			return;
		}
		if (head.strand.id === "[ROOT]") return;
		const doc = this.doc;
		const path = findStrandPath(doc.root, getStrandById(doc, head.strand.id));
		const parentStrand = getStrandByPath(doc, path.slice(0, -1));
		const parentIndex = path.at(-1).tokenIndex;
		if ([...parentStrand.tokens[parentIndex].children.values()].every((s) => s.tokens.length === 0)) {
			this.select({
				strandId: parentStrand.id,
				anchorIndex: parentIndex,
				headIndex: parentIndex + 1
			});
			this.deleteRange();
		} else this.move(direction);
	}
	move(direction, extend = false) {
		moveCursor(this.pool, this.schema, direction, extend);
	}
	/** Home / End: to the start or end of the strand the cursor is in. */
	moveToEdge(direction, extend = false) {
		const s = this.selection;
		const head = this.head;
		if (!s || !head) return;
		const index = direction === "left" ? 0 : head.strand.tokens.length;
		this.select({
			strandId: s.strandId,
			anchorIndex: extend ? s.anchorIndex : index,
			headIndex: index
		});
	}
};
//#endregion
//#region src/render/doc.ts
function renderDoc({ doc, isFocused, components }) {
	return renderDocStrand({
		strand: doc.root,
		selection: doc.selection,
		components,
		isFocused
	});
}
function renderDocStrand({ strand, selection, components, isFocused }) {
	let children = [];
	let selectedChildren = [];
	const pushSelection = (i) => {
		if (selectedChildren.length > 0) {
			children.push({
				key: `selection-${i}`,
				type: "span",
				attributes: { class: "selected" },
				children: [{ fragment: selectedChildren }]
			});
			selectedChildren = [];
		}
	};
	for (let i = 0; i < strand.tokens.length; i++) {
		const pushChild = (child) => {
			if (isFocused && selection && idsEqual(selection.strandId, strand.id) && Math.min(selection.anchorIndex, selection.headIndex) <= i && i < Math.max(selection.anchorIndex, selection.headIndex)) selectedChildren.push(child);
			else {
				pushSelection(i);
				children.push(child);
			}
		};
		const token = strand.tokens[i];
		if (isFocused && selection && idsEqual(selection.strandId, strand.id) && selection.anchorIndex === i) pushChild(renderCursor({
			type: "anchor",
			loc: {
				strandId: strand.id,
				tokenIndex: i
			}
		}));
		else if (isFocused && selection && idsEqual(selection.strandId, strand.id) && selection.headIndex === i) pushChild(renderCursor({
			type: "head",
			loc: {
				strandId: strand.id,
				tokenIndex: i
			}
		}));
		else pushChild(renderCursor({
			type: "placeholder",
			loc: {
				strandId: strand.id,
				tokenIndex: i
			}
		}));
		pushChild(renderDocToken({
			token,
			selection,
			components,
			isFocused
		}));
	}
	pushSelection(strand.tokens.length);
	if (isFocused && selection && idsEqual(selection.strandId, strand.id) && selection.anchorIndex === strand.tokens.length) children.push(renderCursor({
		type: "anchor",
		loc: {
			strandId: strand.id,
			tokenIndex: strand.tokens.length
		}
	}));
	else if (isFocused && selection && idsEqual(selection.strandId, strand.id) && selection.headIndex === strand.tokens.length) children.push(renderCursor({
		type: "head",
		loc: {
			strandId: strand.id,
			tokenIndex: strand.tokens.length
		}
	}));
	else children.push(renderCursor({
		type: "placeholder",
		loc: {
			strandId: strand.id,
			tokenIndex: strand.tokens.length
		}
	}));
	return {
		key: JSON.stringify(strand.id),
		fragment: children
	};
}
function renderDocToken({ token, selection, components, isFocused }) {
	const Component = components[token.type];
	const children = new Map([...token.children.entries()].map(([key, value]) => [key, renderDocStrand({
		strand: value,
		selection,
		components,
		isFocused
	})]));
	if (isMfVDOMComponent(Component)) {
		let vnode = Component({
			token,
			children
		});
		if (vnode && ("type" in vnode || "foreign" in vnode || "fragment" in vnode)) vnode.key = token.id;
		return vnode;
	} else if (typeof Component === "function") return {
		key: token.id,
		fragment: [Component({
			token,
			children
		})]
	};
	throw new Error(`Component for token type ${token.type} not found`);
}
function renderCursor({ type, loc }) {
	return h("span", {
		class: ["cursor", type].filter(Boolean).join(" "),
		"data-mf-cursor": JSON.stringify(loc)
	}, t("​"));
}
//#endregion
exports.CannotParseError = CannotParseError;
exports.MfParser = MfParser;
exports.CharTokenComponent = CharTokenComponent;
exports.Editor = Editor;
exports.InfixParselet = InfixParselet;
exports.IsErrorNodeTag = IsErrorNodeTag;
exports.JuxtapositionParselet = JuxtapositionParselet;
exports.LeafParselet = LeafParselet;
exports.MissingNode = MissingNode;
exports.NodeTag = NodeTag;
exports.PostfixParselet = PostfixParselet;
exports.PrefixParselet = PrefixParselet;
exports.SyntaxHighlighter = SyntaxHighlighter;
exports.TokensTag = TokensTag;
exports.TreeNode = TreeNode;
exports.UnparseableNode = UnparseableNode;
exports.charTokenType = charTokenType;
exports.constructDoc = constructDoc;
exports.constructDocCursor = constructDocCursor;
exports.constructDocSelection = constructDocSelection;
exports.constructDocStrand = constructDocStrand;
exports.constructDocToken = constructDocToken;
exports.createMfVDOMComponent = createMfVDOMComponent;
exports.createDocToken = createDocToken;
exports.defineSchema = defineSchema;
exports.defineTokenType = defineTokenType;
exports.deleteSelection = deleteSelection;
exports.findStrandPath = findStrandPath;
exports.generateNewDot = generateNewDot;
exports.getCursorFromSelection = getCursorFromSelection;
exports.getPoolCursor = getPoolCursor;
exports.getStrandById = getStrandById;
exports.getStrandByPath = getStrandByPath;
exports.getToken = getToken;
exports.h = h;
exports.idsEqual = idsEqual;
exports.indent = indent;
exports.insertTemplate = insertTemplate;
exports.isMfVDOMComponent = isMfVDOMComponent;
exports.isStrandPath = isStrandPath;
exports.moveCursor = moveCursor;
exports.poolFromDoc = poolFromDoc;
exports.renderDoc = renderDoc;
exports.renderDocStrand = renderDocStrand;
exports.renderVNode = renderVNode;
exports.renderVNodeToHTMLString = renderVNodeToHTMLString;
exports.setDocSelectionOnPool = setDocSelectionOnPool;
exports.strandPathIsAncestor = strandPathIsAncestor;
exports.strandPathsEqual = strandPathsEqual;
exports.t = t;
exports.templateFromTokens = templateFromTokens;
exports.tokenIs = tokenIs;
exports.traverseStrands = traverseStrands;
