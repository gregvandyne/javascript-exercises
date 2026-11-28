// The skill check of a classroom activity's arithmetic (docs/decisions.md "Builder class games: audit 4 quality"):
// does every column sum the activity deals practise the skill the teacher asked for? The owner's audit found a
// "regrouping" game with 2 of 6 problems that never carried (40 + 37, 42 + 15, 21 + 64), and "make the numbers bigger"
// turning two-digit sums into three-digit ones up to 1910. Pure: no database, no model.
//   statedSkill(texts, data)                 what was asked: { regroup: 'some' | 'all' | 'none' | null, digits, op, from }
//   skillProblems(html, { requests, topic, before })  -> [{ at, why }] (none: it fits, or there is nothing to check)
//   skillText(list)                          the findings as one note for the model (what to change, and how)
// The teacher's words come first (the setup's topic, then their messages, the newest mention winning); the activity's
// own "skill" block ({ "regroup": "some", "digits": 2 }, written by the Builder) is used when their words say nothing.
// Every problem is read from the activity's data: its fixed problems and three sets its generator deals, with the kit
// version the page pins (services/canvaskit.js), so what is checked is what students get.
import { activityData, canvasVersion, canvasKit } from '../services/canvaskit.js';

const REGROUP_WORD = /\bregroup\w*|\bborrow\w*|\btrad(e|es|ing) (a |one )?tens?\b|\bexchang\w*/;
const CARRY_WORD = /\b(carry|carrying|carries|carried|carry-over|carrying over)\b/;
const MATHS_WORD = /\b(add\w*|sum|sums|plus|columns?|tens?|ones|subtract\w*|minus|take away|digits?)\b/;
const NONE_WORD = /\b(no|without|not|never|don't|do not|zero)\s+(any\s+|need(ing)?\s+(to\s+)?|requir\w*\s+)?(regroup\w*|carry\w*|carries|borrow\w*|trad\w*|exchang\w*)|\bno[- ]regroup\w*/;
const ALL_WORD = /\b(both|every|each|all)\s+(the\s+)?(columns?|places?|digits?|times)\b|\btwice\b|\bdouble[- ]regroup\w*|\bregroup\w* (in|across) (both|every|each|all)\b/;
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, single: 1, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 };
const DIGITS_WORD = /\b(one|two|three|four|five|single|[1-5])[- ]?digits?\b/g;
const SUB_WORD = /\b(subtract\w*|minus|take away|difference|borrow\w*)\b/, ADD_WORD = /\b(add\w*|sum|sums|plus|carry\w*)\b/;

/** One piece of the teacher's words -> what it says about the skill (only what it mentions). */
function readText(text) {
  const s = String(text || '').toLowerCase().replace(/[‐-―]/g, '-');
  const out = {};
  if (NONE_WORD.test(s)) out.regroup = 'none';
  else if (REGROUP_WORD.test(s) || (CARRY_WORD.test(s) && MATHS_WORD.test(s))) out.regroup = ALL_WORD.test(s) ? 'all' : 'some';
  const ds = [...new Set([...s.matchAll(DIGITS_WORD)].map(m => NUM[m[1]]))];
  if (ds.length === 1) out.digits = ds[0];
  if (SUB_WORD.test(s) && !ADD_WORD.test(s)) out.op = 'sub'; else if (ADD_WORD.test(s) && !SUB_WORD.test(s)) out.op = 'add';
  // "bigger numbers", "larger", "harder numbers" (and nothing about digits): the same number of digits, larger
  if (/\b(bigger|larger|greater|higher|harder|tougher)\s+(numbers?|sums?|ones)\b|\bmake (the )?numbers? (bigger|larger|harder)\b/.test(s)) out.bigger = true;
  if (/\b(more|extra)\s+digits?\b|\bhundreds\b|\bthousands\b|\bfour[- ]figure|\bthree[- ]figure/.test(s)) out.moreDigits = true;
  return out;
}
/** What the teacher asked for, from their words (newest mention wins), else the activity's own skill block. */
export function statedSkill(texts = [], data = null) {
  const st = { regroup: null, digits: null, op: null, from: null, bigger: false, moreDigits: false };
  for (const t of texts) {
    const r = readText(t);
    if (r.regroup) { st.regroup = r.regroup; st.from = 'words'; }
    if (r.digits) st.digits = r.digits;
    if (r.op) st.op = r.op;
    if (r.bigger) st.bigger = true;
    if (r.moreDigits) st.moreDigits = true;
  }
  const own = data && data.skill && typeof data.skill === 'object' ? data.skill : null;
  if (own) {
    if (!st.regroup && ['some', 'all', 'none'].includes(own.regroup)) { st.regroup = own.regroup; st.from = 'data'; }
    if (!st.digits && Number.isInteger(own.digits) && own.digits >= 1 && own.digits <= 5) st.digits = own.digits;
  }
  return st;
}

const digitsOf = n => String(Math.abs(n)).split('').reverse().map(Number);
const len = n => String(Math.abs(n)).length;
/** How a column sum regroups: { n (columns that carry or borrow), all (every column that can) }. */
export function regroupOf(tool, a, b) {
  const A = digitsOf(a), B = digitsOf(b), outs = [];
  if (tool === 'digits.add') { let c = 0; for (let i = 0; i < Math.max(A.length, B.length); i++) { const s = (A[i] || 0) + (B[i] || 0) + c; c = s >= 10 ? 1 : 0; outs.push(c); } }
  else if (tool === 'digits.sub') { let bw = 0; for (let i = 0; i < A.length; i++) { const x = A[i] - bw, y = B[i] || 0; bw = x < y ? 1 : 0; outs.push(bw); } }
  else return null;
  const can = tool === 'digits.add' ? Math.min(A.length, B.length) : A.length - 1;
  return { n: outs.filter(Boolean).length, all: can > 0 && outs.slice(0, can).every(Boolean) };
}
const fits = (r, want) => (want === 'none' ? r.n === 0 : want === 'all' ? r.all : r.n > 0);

/** The column problems an activity deals: [{ at, p }] (its fixed problems, then three sets from its generator). */
function problemsOf(html) {
  const v = canvasVersion(html); if (!v) return null;
  const d = activityData(html); if (!d || !d.data) return null;
  const kit = canvasKit(v), data = d.data, out = [];
  (Array.isArray(data.problems) ? data.problems : []).slice(0, 30).forEach((raw, i) => { const c = kit.logic.cleanProblem(raw); if (c.p && /^digits\.(add|sub)$/.test(c.p.tool)) out.push({ at: `problem ${i + 1}`, p: c.p }); });
  if (data.gen && /^digits\.(add|sub)$/.test(data.gen.tool) && (data.config || {}).fresh !== false) {
    for (const seed of [11, 23, 37]) for (const p of kit.logic.deal(data, { seed, count: 12 })) out.push({ at: 'generator', p });
  }
  return { data, list: out };
}
const say = p => `${p.a} ${p.tool === 'digits.sub' ? '−' : '+'} ${p.b}`;
const digitWord = n => ['', 'one', 'two', 'three', 'four', 'five'][n] || String(n);
const sizeOf = list => { const s = new Set(list.map(({ p }) => Math.max(len(p.a), len(p.b)))); return s.size === 1 ? [...s][0] : null; };

/**
 * The findings for a version: [{ at, why }]. requests: the builder's own messages for this game, oldest first; topic: the
 * setup's typed topic (or the chip's name); before: the version this build started from (its html), so a change in the
 * number of digits that nobody asked for is caught.
 */
export function skillProblems(html, { requests = [], topic = '', before = null } = {}) {
  const got = problemsOf(html); if (!got || !got.list.length) return [];
  const { data, list } = got, st = statedSkill([topic, ...requests].filter(Boolean), data), out = [], add = (at, why) => { if (out.length < 8 && !out.some(x => x.at === at && x.why === why)) out.push({ at, why }); };
  const want = st.regroup;
  if (want) {
    const name = { some: 'regrouping (every problem must carry or borrow at least once)', all: 'regrouping in every column (each column must carry or borrow)', none: 'no regrouping (no problem may carry or borrow)' }[want];
    for (const { at, p } of list) {
      const r = regroupOf(p.tool, p.a, p.b); if (!r || fits(r, want)) continue;
      add(at, `${say(p)} ${want === 'none' ? 'regroups' : r.n === 0 ? 'needs no regrouping' : 'regroups in only some columns'}, but the skill asked for is ${name}`);
    }
  }
  // the number of digits: what they asked for, else what the version this build started from had (unless they asked for more)

  const was = !st.digits && before ? (() => { const b = problemsOf(before); return b && b.list.length ? sizeOf(b.list) : null; })() : null;
  const keep = st.digits || (was && !st.moreDigits ? was : null);
  if (keep) {
    for (const { at, p } of list) {
      const n = Math.max(len(p.a), len(p.b));
      if (n === keep) continue;
      add(at, `${say(p)} uses ${digitWord(n)}-digit numbers, but ${st.digits ? `the teacher asked for ${digitWord(keep)}-digit numbers` : `the activity had ${digitWord(keep)}-digit numbers and nobody asked for more digits`}${st.bigger ? ' ("bigger numbers" means larger numbers with the same number of digits)' : ''}`);
    }
  }
  return out;
}
/** The findings as one note for the model: what is wrong and how to fix it in the data. */
export function skillText(list) {
  if (!list || !list.length) return '';
  const lines = list.map(x => `${x.at}: ${x.why}`).join('; ');
  return `The problems do not all practise the skill asked for: ${lines}. Fix the oc-activity data so every problem does: with a generator, set "regroup" ("some", "all" or "none") and keep "digits" as asked (for bigger numbers, raise "lo" and "hi" inside the same number of digits, e.g. digits 2, lo 50, hi 99); with fixed problems, choose numbers that carry or borrow (for addition the ones digits add up to 10 or more) and have the asked number of digits. Keep "skill" in the data block saying what was asked.`;
}
