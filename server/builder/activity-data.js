// The Studio's Activity panel (docs/canvas-api.md "The Activity panel"): the part of a classroom activity a teacher edits
// without a Builder message. Pure: no database, no requests. routes/activity-panel.js saves what this makes.
//   panelOf(html)                    what the panel shows for a version: { data, kit } or null (not an activity)
//   cleanPanel(base, body)           the panel's data (config, problems, gen) on top of the version's own -> { data } | { code, at?, why? }
//   newTexts(base, data)             every piece of text in data that the version did not have (to screen)
//   applyPanel(html, data)           the page with only its oc-activity block rewritten, on Oomba Canvas 1.4.1
//   noteFor(changes, t)              the version's label: "Activity panel: problem 3 moved up, 6 in a set"
// Only the oc-activity JSON changes; task, steps and hints stay as the Builder wrote them. Problems are cleaned by the
// kit's own frozen 1.4.1 file (cleanProblem: its allow-list of fields), so nothing but data the kit reads is ever saved.
import { activityData, withActivityData, canvasVersion, canvasKit, canvasTag, CANVAS_PATH } from '../services/canvaskit.js';

export const PANEL_KIT = '1.4.1';
const SUPPORTS = ['watch', 'count', 'guided', 'own'];
const PURPOSES = ['screen', 'worksheet', 'generator'];
const MAX_PROBLEMS = 30, MAX_COUNT = 12, MAX_JSON = 60000, MAX_TEXT = 200;
// A generator's fields, by kind: a figure question's template (logic.js figGen) or a manipulative's ranges (each tool's gen).
const GEN_FIG = ['vars', 'where', 'q', 'fig', 'answer', 'dp', 'unit', 'work', 'hints', 'choices', 'tol'];
const GEN_TOOL = ['dens', 'mult', 'lo', 'hi', 'subs', 'digits', 'rule', 'n', 'tiles', 'fractions', 'dir'];
// Fields whose strings are names the kit knows, not words anyone reads.
const NOT_TEXT = new Set(['tool', 'kind', 'type', 'hide', 'rule', 'dir', 'element']);
export const CHANGE_KEYS = ['moved', 'edited', 'added', 'copied', 'deleted', 'list', 'gen', 'help', 'count', 'purpose'];

/** -> { data, kit } for a classroom activity version (its data block read as JSON), else null. */
export function panelOf(html) {
  const kit = canvasVersion(html); if (!kit) return null;
  const d = activityData(html);
  return d && d.data ? { data: d.data, kit } : null;
}

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const plainJson = v => { try { return JSON.parse(JSON.stringify(v)); } catch { return undefined; } };
/** A value made of numbers, short strings, booleans, arrays and plain objects only (at most depth 4). */
function plainValue(v, depth = 0) {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return v.length <= MAX_TEXT;
  if (typeof v === 'boolean' || v === null) return true;
  if (depth > 4) return false;
  if (Array.isArray(v)) return v.length <= 50 && v.every(x => plainValue(x, depth + 1));
  if (isObj(v)) return Object.keys(v).length <= 40 && Object.values(v).every(x => plainValue(x, depth + 1));
  return false;
}

/** The generator: null, or { tool, ...its fields } with only the fields that kind of generator has. */
function cleanGen(gen, tools) {
  if (gen === null || gen === undefined) return { gen: null };
  if (!isObj(gen) || !tools.includes(gen.tool)) return { code: 'gen' };
  const keys = String(gen.tool).startsWith('figure.') ? GEN_FIG : GEN_TOOL, out = { tool: gen.tool };
  for (const k of keys) if (gen[k] !== undefined) { if (!plainValue(gen[k])) return { code: 'gen' }; out[k] = plainJson(gen[k]); }
  return { gen: out };
}

/**
 * The panel's edit on top of the version's data. body: { config: { supports, support, count, purpose }, problems, gen }.
 * -> { data } (the whole new data block) or { code: 'data' | 'problems' | 'problem' | 'gen' | 'config' | 'big', at, why }.
 */
export function cleanPanel(base, body) {
  const b = isObj(body) ? body : {};
  const kit = canvasKit(PANEL_KIT), tools = [...kit.tools];
  if (!isObj(base)) return { code: 'data' };
  // config: the panel's four choices; everything else (lang, board...) stays as it was
  const c = isObj(b.config) ? b.config : {}, config = { ...(isObj(base.config) ? base.config : {}) };
  if (c.supports !== undefined) {
    if (!Array.isArray(c.supports) || !c.supports.length || c.supports.some(x => !SUPPORTS.includes(x))) return { code: 'config' };
    config.supports = SUPPORTS.filter(x => c.supports.includes(x));
    config.support = SUPPORTS.includes(c.support) && config.supports.includes(c.support) ? c.support : config.supports[0];
  }
  if (c.count !== undefined) { if (!Number.isInteger(c.count) || c.count < 1 || c.count > MAX_COUNT) return { code: 'config' }; config.count = c.count; }
  if (c.purpose !== undefined) {
    if (!Array.isArray(c.purpose) || !c.purpose.length || c.purpose.some(x => !PURPOSES.includes(x))) return { code: 'config' };
    config.purpose = PURPOSES.filter(x => c.purpose.includes(x));
  }
  // problems: each one cleaned by the kit itself (its own fields only)
  if (!Array.isArray(b.problems) || b.problems.length > MAX_PROBLEMS) return { code: 'problems' };
  const problems = [];
  for (let i = 0; i < b.problems.length; i++) {
    const raw = b.problems[i];
    if (!isObj(raw) || !plainValue(raw)) return { code: 'problem', at: i + 1 };
    const r = kit.logic.cleanProblem(plainJson(raw));
    if (!r.p) return { code: 'problem', at: i + 1, why: String(r.why || '') };
    problems.push(plainJson(r.p));
  }
  const g = cleanGen(b.gen, tools); if (g.code) return g;
  config.fresh = !!g.gen;
  if (!g.gen && Array.isArray(config.purpose) && config.purpose.includes('generator')) config.purpose = config.purpose.filter(x => x !== 'generator');
  if (!problems.length && !g.gen) return { code: 'problems' };
  const data = { ...base, config, problems, gen: g.gen };
  if (JSON.stringify(data).length > MAX_JSON) return { code: 'big' };
  return { data };
}

/** Every string in the problems and the generator (not the kit's own names), as [text]. */
function textsOf(data) {
  const out = [];
  const walk = (v, key) => {
    if (typeof v === 'string') { if (!NOT_TEXT.has(key) && v.trim()) out.push(v); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, key); return; }
    if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(isObj(data) ? data.problems : null, ''); walk(isObj(data) ? data.gen : null, '');
  return out;
}
/** The text in data that the version did not already have: what the teacher typed, to screen like a Builder message. */
export function newTexts(base, data) {
  const had = new Set(textsOf(base));
  return [...new Set(textsOf(data).filter(s => !had.has(s)))];
}
/** Text only: no markup in what a teacher types. */
export const hasMarkup = list => list.some(s => /[<>]/.test(s));

/** The page with its data block set to data, and its kit tag moved to 1.4.1, the newest (an activity saved from the panel, only). */
export function applyPanel(html, data) {
  let out = withActivityData(html, data);
  if (canvasVersion(out) !== PANEL_KIT) {
    out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, m => (m.slice(0, m.indexOf('>')).includes(CANVAS_PATH) ? canvasTag(PANEL_KIT) : m));
  }
  return out;
}

/** The changes the page lists ([{ k, n? }]) -> the same, cleaned (known kinds, small numbers, no repeats, at most 12). */
export function cleanChanges(list) {
  const out = [], seen = new Set();
  for (const c of Array.isArray(list) ? list.slice(0, 40) : []) {
    if (!isObj(c) || !CHANGE_KEYS.includes(c.k)) continue;
    const n = Number.isInteger(c.n) && c.n >= 1 && c.n <= 99 ? c.n : undefined, up = c.k === 'moved' ? (c.up ? 1 : 0) : undefined;
    const x = { k: c.k, ...(n ? { n } : {}), ...(up !== undefined ? { up } : {}) }, key = JSON.stringify(x);
    if (!seen.has(key)) { seen.add(key); out.push(x); }
    if (out.length >= 12) break;
  }
  return out;
}
/** The version's label, in the saver's language: "Activity panel: problem 3 moved up, 6 in a set" (three, then "+2 more"). */
export function noteFor(changes, t) {
  const one = c => (c.k === 'moved' ? t(c.up ? 'studio.activity.change.movedUp' : 'studio.activity.change.movedDown', { n: c.n || 1 }) : t(`studio.activity.change.${c.k}`, { n: c.n || 1 }));
  const list = changes.length ? changes : [{ k: 'list' }];
  const words = list.slice(0, 3).map(one).join(', ') + (list.length > 3 ? ` ${t('studio.activity.change.more', { n: list.length - 3 })}` : '');
  return t('studio.activity.note', { what: words });
}
