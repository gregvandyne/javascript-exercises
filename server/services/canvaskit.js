// Oomba Canvas: the classroom activity kit (canvas/, docs/canvas-api.md), self-hosted under
// public/vendor/oomba-canvas/<version>/ and loaded with exactly the tag canvasTag() makes (pinned version, SRI,
// crossorigin="anonymous"), the same way as the Oomba Kit (kit.js). Version folders never change and CANVAS_VERSIONS only
// grows; scripts/build-canvas.js writes the hash, canvas/SHIPPED.json locks it.
// Also here: the scanner's pinned-tag check (checkCanvas, like kit.js checkKit), and the Builder's self-test of an
// activity, run with the kit's OWN frozen file (the maths a published activity really uses), never the source.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { figureLibs, figuresKit } from './figlibs.js';

export const CANVAS_PATH = '/vendor/oomba-canvas/';
// version -> sha384 of oomba-canvas.js (tests/unit/canvas-kit.test.js checks these against the files on disk).
export const CANVAS_VERSIONS = Object.freeze({
  '1.0.0': 'sha384-flFB2WSAsKElDVg0GmNowkuiZ1BK2p6gcygy6l0MgomzZl6alrNHMRgtwrNl7u6V',
  // 1.1.0: config.supports, the help modes an activity offers, and a switcher between them (docs/canvas-api.md).
  // Activities saved on 1.0.0 keep their pin and keep working: the scanner admits both tags, the self-test runs each
  // activity with the kit file it pins.
  '1.1.0': 'sha384-C0DFMSJtEKN3ZjnzoMjRGbKZ36KZSolo6OknV5vnJ5fcKvI5WlZjNUHtVdbt1MHK',
  // 1.2.0: config.purpose (practice on screen, a printable worksheet, a question generator), the print panel (BRB.print:
  // the page and server/services/canvas-print.js make the printable sheet from the activity's own data, sheet.js), and
  // figure questions (figure.number, figure.choice) drawn by Oomba Figures. 1.0.0 and 1.1.0 stay as they are.
  '1.2.0': 'sha384-ioyClGMBQEaIiIDCGa+zeMkl4MbfUZrKcUewnP9QCsxMCeVxYZxbaEtli6AH3UKD',
  // 1.3.0: the teacher's controls inside an activity (Show answer, Board mode, Help on this screen, New set) for its
  // maker and school staff only (BRB.canTeach, from INIT.teach), a worked answer's own lines on screen, and a result
  // marked helped when the teacher showed an answer. Older activities move to it only when saved from the Studio's
  // Activity panel (server/builder/activity-data.js), never on their own.
  '1.3.0': 'sha384-Y9ODTlYNiRPfeIC7I1iKqhk8Eu55RJ8/xuCQGDe/Px6xCVU0+oT1yYiOyntno79+',
  // 1.3.1: the phone layout. The top strip in three groups (title; help mode, ✓, ✗, to go; New sheet, Print, Teacher,
  // Keypad), each one row that scrolls sideways rather than leaving a button alone on a line; short labels on narrow
  // phones; 44 px tap targets; the end card's buttons stacked full width on a narrow card, never overlapping or cut.
  // Same data, same behaviour as 1.3.0. Older activities move to it when saved from the Activity panel.
  '1.3.1': 'sha384-nBxrzjj32SwbLiMLJCVazX7WMixUv1Rp3dy3n75rCki8YUpEKdjgN6xlNPOtXDrV',
});
export const CANVAS_LATEST = '1.3.1';
export const canvasSrc = (v = CANVAS_LATEST) => `${CANVAS_PATH}${v}/oomba-canvas.js`;
const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

/** The one script tag an activity uses to load the kit. */
export function canvasTag(v = CANVAS_LATEST) {
  if (!CANVAS_VERSIONS[v]) throw new Error(`unknown Oomba Canvas version ${v}`);
  return `<script src="${canvasSrc(v)}" integrity="${CANVAS_VERSIONS[v]}" crossorigin="anonymous"></script>`;
}

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const ATTR_RE = /([a-z-]+)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/gi;
function attrs(s) {
  const out = {}; let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(s))) out[m[1].toLowerCase()] = m[2] == null ? '' : m[2].replace(/^["']|["']$/g, '');
  return out;
}
const PIN_RE = /^\/vendor\/oomba-canvas\/(\d+\.\d+\.\d+)\/oomba-canvas\.js$/;

/** The pinned Oomba Canvas version a game loads (a valid pin), or null: this version is a classroom activity. */
export function canvasVersion(html) {
  for (const m of String(html || '').matchAll(SCRIPT_RE)) {
    const a = attrs(m[1]), p = PIN_RE.exec(a.src || '');
    if (p && CANVAS_VERSIONS[p[1]] === a.integrity && a.crossorigin === 'anonymous') return p[1];
  }
  return null;
}
/** Does this game name the kit at all (a pin, or a wrong one)? */
export const usesCanvas = html => String(html || '').includes(CANVAS_PATH);

/**
 * Scanner rule (scanner.js), the same as kit.js checkKit -> { issues: [{ level, code, message }], rest } where rest is the
 * game with the pinned tag taken out (so the external-script check never sees it). Accepted: exactly canvasTag(v) for a
 * known v (attributes in any order and quoting, nothing else in the tag). Anything else that names /vendor/oomba-canvas/
 * fails, with a message the Builder can act on.
 */
export function checkCanvas(src) {
  src = String(src || '');
  const issues = [];
  const add = (code, message) => { if (!issues.some(i => i.message === message)) issues.push({ level: 'fail', code, message }); };
  const rest = src.replace(SCRIPT_RE, (block, attrText, body) => {
    const a = attrs(attrText);
    if (!(a.src || '').includes(CANVAS_PATH)) return block;
    const p = PIN_RE.exec(a.src), extra = Object.keys(a).filter(k => !['src', 'integrity', 'crossorigin'].includes(k));
    if (!p || !CANVAS_VERSIONS[p[1]]) { add('canvas_pin', `Loads an Oomba Canvas version we do not have. Use exactly: ${canvasTag()}`); return block; }
    if (a.integrity !== CANVAS_VERSIONS[p[1]]) { add('canvas_pin', `The Oomba Canvas tag has the wrong integrity value. Use exactly: ${canvasTag(p[1])}`); return block; }
    if (a.crossorigin !== 'anonymous') { add('canvas_pin', `The Oomba Canvas tag needs crossorigin="anonymous". Use exactly: ${canvasTag(p[1])}`); return block; }
    if (extra.length || body.trim()) { add('canvas_pin', `The Oomba Canvas tag must be exactly: ${canvasTag(p[1])}`); return block; }
    return ' ';
  });
  if (rest.includes(CANVAS_PATH) || /\/vendor\/oomba-canvas\b/.test(rest)) add('canvas_tag', `Uses the Oomba Canvas files in a way we do not allow (only the script tag may name them). Load it with exactly: ${canvasTag()}`);
  return { issues, rest };
}

// ---------------------------------------------------------------- the activity's data and the self-test
const DATA_RE = /<script\b[^>]*\bid\s*=\s*["']?oc-activity["']?[^>]*>([\s\S]*?)<\/script\s*>/i;
/** The activity's data block (<script type="application/json" id="oc-activity">) -> { data } or { why } or null (none). */
export function activityData(html) {
  const m = DATA_RE.exec(String(html || ''));
  if (!m) return null;
  try { const data = JSON.parse(m[1]); return data && typeof data === 'object' && !Array.isArray(data) ? { data } : { why: 'the oc-activity block must be one JSON object' }; } catch (e) { return { why: `the oc-activity block is not valid JSON (${String(e.message).slice(0, 80)})` }; }
}

const kits = new Map();
/** The pure parts of a kit version, from its own frozen file (run once in an empty context: no document, no network). */
export function canvasKit(v = CANVAS_LATEST) {
  if (!CANVAS_VERSIONS[v]) return null;
  if (!kits.has(v)) {
    const src = fs.readFileSync(path.join(PUBLIC, 'vendor/oomba-canvas', v, 'oomba-canvas.js'), 'utf8');
    const ctx = vm.createContext({});
    vm.runInContext(src, ctx, { timeout: 2000, filename: `oomba-canvas-${v}.js` });
    kits.set(v, ctx.OombaCanvas);
  }
  return kits.get(v);
}
/**
 * The Builder's self-test of an activity version (builder/autotest.js canvasSelfTest): null when the version is not an
 * Oomba Canvas activity; else { ok, problems: [{ at, why }] } from the kit's own selfTest (every problem solvable by its
 * worked answer, the empty start never right, steps and hints there), plus a missing or broken data block.
 */
export function selfTestHtml(html) {
  const v = canvasVersion(html); if (!v) return null;
  const d = activityData(html);
  if (!d) return { ok: false, problems: [{ at: 'activity', why: 'there is no <script type="application/json" id="oc-activity"> block with the activity' }] };
  if (d.why) return { ok: false, problems: [{ at: 'activity', why: d.why }] };
  if (!/\bOc\s*\.\s*activity\s*\(|\bOombaCanvas\s*\.\s*activity\s*\(/.test(String(html))) return { ok: false, problems: [{ at: 'activity', why: 'the page never calls Oc.activity() with the activity' }] };
  const r = canvasKit(v).selfTest(d.data);
  const problems = JSON.parse(JSON.stringify(r.problems || []));
  if (problems.length < 12) problems.push(...figureProblems(v, d.data, html).slice(0, 12 - problems.length));
  return { ok: !problems.length, problems };
}
/**
 * 1.2.0: the activity's figures. Every problem with a "fig" (the fixed ones, and three sets from a generator) needs the
 * pinned Oomba Figures tag on the page, and its data must pass that version's own check() (an element it knows, a ray
 * diagram with an image, a reading on its scale, electrons that add up...): a wrong figure is never saved.
 */
export function figureProblems(v, data, html) {
  const kit = canvasKit(v); if (!kit || !kit.logic || typeof kit.sheet !== 'function') return [];
  const out = [], seen = new Set(), list = [];
  (Array.isArray(data.problems) ? data.problems : []).slice(0, 30).forEach((raw, i) => { const c = kit.logic.cleanProblem(raw); if (c.p) list.push([`problem ${i + 1}`, c.p]); });
  if (data.gen) for (const seed of [1, 2, 3]) for (const p of kit.logic.deal(data, { seed: seed * 7919, count: 12 })) list.push(['generator', p]);
  const withFig = list.filter(([, p]) => p.fig);
  if (!withFig.length) return out;
  const fv = figureLibs(html)['oomba-figures'];
  if (!fv) return [{ at: 'figures', why: 'the activity draws figures but the page does not load Oomba Figures: add its pinned tag (the FIGURE RULES) before the kit\'s' }];
  const F = figuresKit(fv);
  for (const [at, p] of withFig) {
    const { kind, hide, ...rest } = p.fig, why = F.check(kind, { kind, ...rest });
    const key = `${at}:${why.join(';')}`;
    if (why.length && !seen.has(key)) { seen.add(key); out.push({ at, why: `its figure (${String(kind).slice(0, 20)}): ${why.slice(0, 2).join('; ')}` }); }
    if (out.length >= 6) break;
  }
  return out;
}
/** The page with its oc-activity block set to this data (pretty JSON, one key per line: easy for edit_game). */
export function withActivityData(html, data) {
  const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
  return String(html).replace(DATA_RE, m => m.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)$/i, (x, a, b) => `${a}\n${json}\n${b}`));
}
