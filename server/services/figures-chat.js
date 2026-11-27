// The Figures page workflow of Oomba, the teaching companion (docs/decisions.md "Figures: Oomba's chat and the shared
// chat engine" and "Oomba teaching companion: one chat everywhere"). Since the owner's "one chat everywhere" decision the
// worksheet has no chat of its own: the companion (services/companion.js) knows it is on a Figures worksheet or test and
// has this page's tool, editWorksheet. What stays here is the workflow itself, unchanged:
//
// - Who: whoever may make figures (services/figures.js canMake: the Teacher plan gate), on their own worksheet, test or
//   lesson set only. Students and kids never see it.
// - What the AI gets, built HERE from the teacher's own worksheet (sheetContext): its kind (worksheet or test), title,
//   grade and language, and each question by number (its figure's kind and data, its question, how it is answered, its
//   options and its worked answer). A title, question or option that fails the word rules or names one of the teacher's
//   students is left out (the AI sees "(left out)"). Never classes, assignments, students' answers or results.
// - What it sends (editWorksheet's input): { title?, grade?, units?, edits: [{ op: 'add', after?, item } | { op:
//   'replace', n, item } | { op: 'remove', n }] }. n is a question's number as the teacher saw it. An item is a
//   generator ({ gen }) or a figure question of its own; either way it goes through the same checks as a draft
//   (repairDraft / repairTestDraft: OF.check, OF.solve answer keys, options, words; a bad one is replaced by its kind's
//   generator and logged). Units are the app's: every figure that takes a unit gets it and its answer is worked out
//   again with OF.solve. Questions the teacher didn't name are never sent back through the AI.
// - Applied in one transaction with Oomba's reply (the engine), by question id, so a question the teacher edited or
//   deleted while Oomba was thinking is left alone. Undo puts back only the questions that are still as Oomba left them.
// - Limits: at most LIMITS.draftMax (12) questions added in one answer, LIMITS.items (40) on a worksheet.
import { q, now, audit } from '../db.js';
import * as F from './figures.js';

/** The old per-worksheet chat's surface name (its rows are pruned by services/companion.js). */
export const SURFACE = 'figures';
export const UNITS = Object.freeze(['mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi']);
const S = F._sheet;
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, n);
const fine = (u, s) => !!s && !F.textProblem(s) && !F.namesIn(u, s);
const sheetName = w => (w.purpose === 'test' ? 'test' : w.purpose === 'lesson' ? "lesson's figure questions" : 'worksheet');

// ---------------------------------------------------------------- the worksheet, as the AI may see it
/** One question as the AI sees it (numbered from 1). */
function itemContext(u, it, i) {
  const q0 = fine(u, it.question) ? it.question : it.question ? '(left out)' : '';
  return {
    n: i + 1, kind: it.kind, question: q0, data: it.data, answerType: it.answerType,
    ...(it.answerType === 'choice' ? { choices: it.choices.map(o => (fine(u, o) ? o : '(left out)')), correct: it.correct } : { answerKey: it.answerKey || (it.gen ? '(from its generator)' : '') }),
    ...(it.gen ? { generator: it.gen } : {}), answer: it.answer || '',
  };
}
export function sheetContext(u, w, items = F.itemsOf(w.id)) {
  return {
    kind: sheetName(w), title: fine(u, w.title) ? w.title : '(left out)', grade: w.grade || '', language: F.LANG_NAMES[F.genLang(w.lang)] || 'English (US)',
    questions: items.map((it, i) => itemContext(u, it, i)),
  };
}

/** The page workflow's rules for the companion's system prompt (only on this worksheet's page). */
export function workflowRules(u, w, items = F.itemsOf(w.id)) {
  const test = w.purpose === 'test';
  const gens = F.genCatalog({ grade: w.grade });
  return [
    `# This page: a printable ${sheetName(w)} of figure questions in Figures`,
    `The teacher has their ${sheetName(w)} open. To draft it or change it, call editWorksheet. Each question has one figure drawn by Oomba Figures from data. You decide WHAT the questions are; the app draws every figure, checks it can be drawn truthfully to scale, and works out every answer itself. You never work out an answer.`,
    `Write questions, options and titles in ${F.LANG_NAMES[F.genLang(w.lang)]}, plain and clear for ${w.grade ? `grade ${w.grade}` : 'the grade the teacher names'} students. No names of people, no links, no brands or product names.`,
    'editWorksheet answers with the worksheet read back after the change: "landed" (each question as it now shows: its words, multiple choice or number, its options), "notLanded" (with why) and "worksheetNow". After it, say in one to three short sentences what changed, only from landed. If something is under notLanded (a figure that cannot be drawn, a question that is not there) or a question was repaired other than you asked, say so plainly and either call editWorksheet again now with data that can be drawn, or offer to try again. Never say a question changed unless landed shows it. If what the teacher wants for the worksheet is unclear, ask one short question and change nothing.',
    `- title: a new short title (under 60 characters) only when there is none yet or the teacher asks. grade: "K" or "1" to "12" only when the teacher asks for another grade.`,
    `- units: one of ${UNITS.join(', ')} when the teacher asks for other units. The app then changes the unit of every figure and works every answer out again, so do not replace questions just to change units (only replace a question whose own words name a unit).`,
    '- edits: what changes, in order. n is a question number as it is now (1 is the first). {"op": "replace", "n": 3, "item": ITEM} changes a question (harder, easier, other numbers, other words, another kind): give the whole new question. {"op": "remove", "n": 5}. {"op": "add", "after": 4, "item": ITEM} ("after": 0 for the start, null for the end).',
    `- Only touch the questions the teacher asks about; every other question stays exactly as it is (never repeat it). At most ${F.LIMITS.draftMax} questions added in one answer; the ${sheetName(w)} holds at most ${F.LIMITS.items}. A first draft: ${test ? '8' : '6 to 8'} questions unless the teacher says how many, from easier to harder. Asked for more than ${F.LIMITS.draftMax}: add ${F.LIMITS.draftMax} now (in calls of at most 6 questions each) and say they can ask for the rest next.`,
    '- A worksheet holds figure questions only: no instruction, explanation or worked-example pages. Asked for those, make the questions and say in one short sentence that the worksheet cannot hold such pages.',
    `- ITEM is ${test ? 'preferably' : 'either'} {"gen": "<generator id>"} (a fresh question from a generator: the app deals the numbers and the teacher can deal new ones${test ? '; use each generator at most twice' : ''}) or a figure question of your own: {"kind": "<catalog kind>", "question": "...", "data": {same fields as the kind's example}, "answerType": "number", "answerKey": "<one of the kind's answerKey choices>"}.`,
    'answerType "number" (most questions): answerKey is the name of the OF.solve value that answers the question (for example "area" or "sides.CA"). Numbers may be negative.',
    `answerType "choice" only for a question whose answer is a word, not a number: {"kind", "question", "data", "answerType": "choice", "choices": [${F.CHOICES.min} to ${F.CHOICES.max} short different options], "correct": index of the right one}. The figure must show the answer plainly. Never draw or describe SVG.`,
    'Every figure must be drawable truthfully to scale: numbers that cannot make the figure are rejected and replaced.',
    `Generators:\n${gens.map(g => `- ${g.id} (figure ${g.kind}; ${g.subject}; grades ${g.grades.join(', ')}; ${g.type} answer): ${g.question}`).join('\n')}`,
    `Figure catalog:\n${F.draftCatalog()}`,
    `The ${sheetName(w)} now (questions numbered from 1; "answer" is what the app worked out):`,
    `<sheet>\n${JSON.stringify(sheetContext(u, w, items))}\n</sheet>`,
  ].join('\n');
}
// ---------------------------------------------------------------- the answer, checked
/** One ITEM from the AI, checked and repaired like a draft's. A multiple-choice question whose figure cannot be drawn
 *  (even without a measure OF.check says to leave out) is NOT swapped for its kind's number generator: that would turn
 *  "Which shape is this?" into "What is the area of the rectangle?" and lose its options (the owner's report, 25 Nov
 *  2026). It is rejected with the reason instead, so the AI can send it again with data that can be drawn.
 *  -> { item, repaired, dropped, fixed, status: 'ok' | 'fixed' | 'replaced' | 'rejected' | 'dropped', why?, left? } */
function checkItem(raw, w, facts = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { item: null, repaired: 0, dropped: 1, fixed: 0, status: 'dropped', why: 'not a question' };
  const plot = plotOf(raw);
  const x = plot ? plot.raw : { ...raw };
  if (x.data && typeof x.data === 'object') x.data = JSON.stringify(x.data);
  if (facts.plotPrint && !plot) return { item: null, repaired: 0, dropped: 0, fixed: 0, status: 'rejected', why: 'the teacher chose plotting questions: send each as {"plot": {"from", "to", "step", "at", "label"}, "question"}' };
  // A plotting question has no answer the app can work out (the student draws the point): checked as the page's own
  // editor checks a question (cleanItem: the figure drawn truthfully), never repaired into another question.
  if (plot) {
    const c = F.cleanItem({ ...x, data: plot.raw.data }, undefined, w.lang);
    if (!c.ok) return { item: null, repaired: 0, dropped: 0, fixed: 0, status: 'rejected', why: (c.problems || [c.code]).join('; '), say: explainOf('numberLine', plot.raw.data, `OF.check: ${(c.problems || []).join('; ')}`) };
    const item = { ...c.item, hide: 'points', answer: plot.answer };
    const off = factProblem(item, facts);
    if (off) return { item: null, repaired: 0, dropped: 0, fixed: 0, status: 'rejected', why: off, say: { key: 'notAsked', what: off } };
    return { item, repaired: 0, dropped: 0, fixed: 0, status: 'ok' };
  }
  const r = typeof x.gen === 'string' && x.gen.trim()
    ? F.repairTestDraft([x], { max: 1, grade: '', lang: w.lang })
    : F.repairDraft([x], { max: 1, lang: w.lang });
  const nt = r.notes[0] || { action: r.items.length ? 'kept' : 'dropped' };
  // The owner's live audit (27 Nov 2026): a question of Oomba's own whose figure cannot be drawn is never swapped for
  // another question, multiple choice or number: it is not applied, with the reason in plain words (say), so the AI
  // explains and offers what can be drawn.
  if (nt.action === 'replaced' && !(typeof x.gen === 'string' && x.gen.trim())) {
    const data = typeof x.data === 'string' ? (() => { try { return JSON.parse(x.data); } catch { return {}; } })() : x.data || {};
    return { item: null, repaired: 0, dropped: 0, fixed: 0, status: 'rejected', why: nt.why || 'the figure cannot be drawn', say: explainOf(x.kind, data, nt.why) };
  }
  const item = r.items[0] || null;
  const off = item ? factProblem(item, facts) : '';
  if (off) return { item: null, repaired: 0, dropped: 0, fixed: 0, status: 'rejected', why: off, say: { key: 'notAsked', what: off } };
  const status = nt.action === 'kept' ? 'ok' : nt.action;
  return { item, repaired: r.repaired, dropped: r.dropped, fixed: r.fixed || 0, status, ...(nt.why ? { why: nt.why } : {}), ...(nt.left ? { left: nt.left } : {}) };
}
// ---------------------------------------------------------------- what the teacher asked for (companion-make.js requestFacts)
/** A plotting question: { plot: { from, to, step, at, label }, question } -> a number line with the point hidden from the
 *  student (the answer key shows it), the student draws the point on the printed line. Figures has no way to check a
 *  plotted point online, so the chat says so first (companion-make.js formatAsk). */
function plotOf(raw) {
  const p = raw && raw.plot && typeof raw.plot === 'object' ? raw.plot : null;
  if (!p) return null;
  const n = v => (Number.isFinite(+v) ? +v : null);
  const from = n(p.from), to = n(p.to), step = n(p.step) || 1, at = n(p.at);
  if (from === null || to === null || at === null) return null;
  const label = /^[A-Z]$/.test(String(p.label || '')) ? String(p.label) : 'P';
  return { raw: { kind: 'numberLine', question: clip(raw.question || `Plot point ${label} at ${at} on the number line.`, 300), data: { from, to, step, points: [{ at, label }] }, answerType: 'number', answerKey: '' }, answer: `${label} = ${at}` };
}
const isInt = v => Number.isFinite(+v) && Math.abs(+v - Math.round(+v)) < 1e-9;
/** Why a checked question is not what the teacher asked for (the range of the line, whole numbers), or ''. */
export function factProblem(it, facts = {}) {
  if (!facts || it.kind !== 'numberLine') return '';
  const d = it.data || {};
  if (facts.range && (+d.from !== facts.range[0] || +d.to !== facts.range[1])) return `the line runs ${d.from} to ${d.to}, not ${facts.range[0]} to ${facts.range[1]} as the teacher asked`;
  if (facts.whole) {
    const pts = Array.isArray(d.points) ? d.points.map(x => x && x.at) : [];
    const nums = it.answerType === 'choice' ? (it.choices || []).filter(c => Number.isFinite(+c)) : [];
    if (!isInt(d.step ?? 1) || pts.some(v => !isInt(v)) || nums.some(v => !isInt(v))) return 'its numbers are not all whole numbers, as the teacher asked';
  }
  return '';
}
/** The reason a figure cannot be drawn, in one plain line's parts (the page's words: js.companion.why.*), or null. */
export function explainOf(kind, data, why) {
  const d = data || {}, w = String(why || '');
  if (kind === 'triangle' && ['AB', 'BC', 'CA'].every(k => Number.isFinite(+d[k]))) {
    const [a, b, c] = ['AB', 'BC', 'CA'].map(k => +d[k]).sort((x, y) => x - y);
    if (a + b <= c) return { key: a + b === c ? 'triangleEqual' : 'triangle', a, b, c, sum: a + b };
  }
  const m = /(-?\d+(?:\.\d+)?) is past the end of the line \(the line runs from (-?\d+(?:\.\d+)?) to (-?\d+(?:\.\d+)?)/.exec(w);
  if (m) return { key: 'pastEnd', v: +m[1], from: +m[2], to: +m[3] };
  return w ? { key: 'other', what: clip(w.replace(/^OF\.check:\s*/, ''), 160) } : null;
}
/** The right option of Oomba's own multiple-choice questions moved so they are not all at the same letter (the owner's
 *  audit: every answer was B). Only questions with options of their own (not a generator's, whose order its key
 *  follows), and only when the plan has two or more of them. */
export function spreadChoices(ops, rand = Math.random) {
  const own = ops.filter(o => o.item && o.item.answerType === 'choice' && !o.item.gen && !String(o.item.answerKey || '').startsWith('gen:') && Number.isInteger(o.item.correct) && (o.item.choices || []).length >= 2);
  if (own.length < 2) return ops;
  const start = Math.floor(rand() * 6);
  own.forEach((o, k) => {
    const it = o.item, list = [...it.choices], right = list[it.correct];
    const to = (start + k) % list.length;
    list.splice(it.correct, 1); list.splice(to, 0, right);
    o.item = { ...it, choices: list, correct: to, answer: F.choiceText(list, to) };
  });
  return ops;
}
/** The title's range ("Number Line 0 to 10") made to match the worksheet's number lines when they all run over one
 *  other range now (the owner's audit: the title stayed 0 to 10 on a 0 to 1000 line). -> the new title or ''. */
export function retitle(title, items) {
  const re = /(-?\d+(?:\.\d+)?)(\s*(?:to|-|\u2013)\s*)(-?\d+(?:\.\d+)?)/;
  const m = re.exec(String(title || ''));
  if (!m) return '';
  const ranges = [...new Set(items.filter(it => it.kind === 'numberLine' && it.data).map(it => `${+it.data.from}|${+it.data.to}`))];
  if (ranges.length !== 1) return '';
  const [a, b] = ranges[0].split('|');
  if (a === String(+m[1]) && b === String(+m[3])) return '';
  return S.cleanTitle(String(title).replace(re, `${a}${m[2]}${b}`), '');
}
/**
 * The model's answer made into a plan: { reply, title, grade, units, ops: [{ op, id?, after?, item? }], repaired, dropped,
 * report }. Numbers become question ids (as the teacher saw them when the message was sent). report: one line per edit
 * sent, in order ({ k, at (its op's index in ops, -1 when none), op, n?, status, why?, left? }; status 'ok' | 'fixed' (drawn without a measure) | 'replaced' (by
 * its kind's generator) | 'rejected' (not applied: the reason) | 'dropped' | 'noSuch' (no question n) | 'full'), so the
 * tool's result can say what landed and what didn't. Throws SyntaxError when there is neither a reply nor a change.
 */
export function readAnswer(raw, w, items, { facts = {} } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SyntaxError('not an answer');
  let reply = clip(raw.reply, 600).replace(/\s+/g, ' ').trim();
  if (reply && F.textProblem(reply)) reply = '';
  const idOf = n => (Number.isInteger(+n) && +n >= 1 && +n <= items.length ? items[+n - 1].id : null);
  const ops = [], report = []; let repaired = 0, dropped = 0, adds = 0;
  const room = () => Math.min(F.LIMITS.draftMax - adds, F.LIMITS.items - items.length - adds + ops.filter(o => o.op === 'remove').length);
  const seen = new Set();
  const line = (k, e, c, at = -1) => ({ k, at, op: e.op, ...(e.op !== 'add' ? { n: Number.isInteger(+e.n) ? +e.n : null } : {}), status: c.status, ...(c.why ? { why: c.why } : {}), ...(c.left ? { left: c.left } : {}), ...(c.say ? { say: c.say } : {}) });
  for (const [k, e] of (Array.isArray(raw.edits) ? raw.edits : []).slice(0, F.LIMITS.items).entries()) {
    if (!e || typeof e !== 'object') continue;
    if (e.op === 'remove') { const id = idOf(e.n); if (id && !seen.has(id)) { seen.add(id); report.push(line(k, e, { status: 'ok' }, ops.length)); ops.push({ op: 'remove', id }); } else report.push(line(k, e, { status: 'noSuch' })); continue; }
    if (e.op === 'replace') {
      const id = idOf(e.n); if (!id || seen.has(id)) { report.push(line(k, e, { status: 'noSuch' })); continue; }
      const c = checkItem(e.item, w, facts); repaired += c.repaired; dropped += c.dropped;
      report.push(line(k, e, c, c.item ? ops.length : -1));
      if (c.item) { seen.add(id); ops.push({ op: 'replace', id, item: c.item }); }
      continue;
    }
    if (e.op === 'add') {
      if (room() <= 0) { dropped++; report.push(line(k, e, { status: 'full', why: `at most ${F.LIMITS.draftMax} added in one answer and ${F.LIMITS.items} on the sheet` })); continue; }
      const c = checkItem(e.item, w, facts); repaired += c.repaired; dropped += c.dropped;
      report.push(line(k, e, c, c.item ? ops.length : -1));
      if (!c.item) continue;
      const after = e.after === 0 || e.after === '0' ? 0 : idOf(e.after);
      // Its id is chosen here, so the check before writing (a dry run) and the write itself make the same question.
      ops.push({ op: 'add', after: after === 0 ? 'start' : after || 'end', item: c.item, newId: F.newItemId() }); adds++;
    }
  }
  spreadChoices(ops);
  const title = typeof raw.title === 'string' ? S.cleanTitle(raw.title, '') : '';
  const grade = raw.grade !== null && raw.grade !== undefined ? S.cleanGrade(String(raw.grade).toUpperCase() === 'K' ? 'K' : String(raw.grade)) : '';
  const units = UNITS.includes(raw.units) ? raw.units : '';
  if (!reply && !ops.length && !title && !grade && !units && !report.length) throw new SyntaxError('no reply');
  return { reply, title, grade, units, ops, repaired, dropped, report };
}

// ---------------------------------------------------------------- reading back what is on the worksheet
/** One question as the teacher sees it on the page now (numbered from 1): what the tool's result and the check after
 *  writing compare. */
export function shownItem(u, it, i) {
  const q0 = fine(u, it.question) ? clip(it.question, 160) : it.question ? '(left out)' : '';
  return { n: i + 1, kind: it.kind, question: q0, answerType: it.answerType, ...(it.answerType === 'choice' ? { choices: it.choices.map(o => (fine(u, o) ? o : '(left out)')), correct: it.correct } : {}), answer: clip(it.answer || '', 60) };
}
/** The worksheet as it is now: its title, grade and every question as shown, with each question's id (server-side
 *  only: never sent to the AI). */
export function readBack(u, w0) {
  const w = F.ownWorksheet(u, w0.id); if (!w) return null;
  const items = F.itemsOf(w.id);
  return { title: fine(u, w.title) ? w.title : '', grade: w.grade || '', count: items.length, items: items.map((it, i) => ({ id: it.id, ...shownItem(u, it, i) })) };
}
const sameShown = (a, b) => !!a && !!b && JSON.stringify({ ...a, n: 0, id: 0 }) === JSON.stringify({ ...b, n: 0, id: 0 });
/**
 * What landed, checked against the worksheet as it is after writing (back: readBack after applyPlan; before: readBack
 * before it): every edit's own line (report), each changed or added question as it now shows, and what did not land
 * with why. -> { landed: [...], notLanded: [...], shown: [...], ok, partial }
 */
export function verifyPlan(plan, a, before, back) {
  const landed = [], notLanded = [];
  const byId = new Map((back ? back.items : []).map(x => [x.id, x]));
  const was = new Map((before ? before.items : []).map(x => [x.id, x]));
  const miss = (code, r, why) => notLanded.push({ code, op: r.op, ...(r.n ? { n: r.n } : {}), why });
  for (const r of plan.report || []) {
    const o = r.at >= 0 ? plan.ops[r.at] : null;
    if (!o) {
      if (r.status === 'rejected') { miss(r.say && r.say.key === 'notAsked' ? 'notAsked' : 'cannotDraw', r, r.say && r.say.key === 'notAsked' ? `not changed: ${r.why}` : `not changed: its figure cannot be drawn (${r.why})`); if (r.say) notLanded[notLanded.length - 1].say = r.say; }
      else if (r.status === 'noSuch') miss('noSuch', r, `there is no question ${r.n} (or it was named twice)`);
      else if (r.status === 'full') miss('full', r, `not added (${r.why})`);
      else miss('dropped', r, `left out (${r.why || 'not a question the app can draw'})`);
      continue;
    }
    if (o.op === 'remove') {
      if (!byId.has(o.id) && was.has(o.id)) landed.push({ op: 'remove', n: r.n, removed: was.get(o.id).question });
      else miss('meanwhile', r, 'it is still on the worksheet (changed by hand while Oomba was working)');
      continue;
    }
    const id = o.op === 'replace' ? o.id : o.newId;
    const now0 = id ? byId.get(id) : null;
    if (!now0) { miss('meanwhile', r, 'it is not on the worksheet after saving (edited or deleted by hand while Oomba was working, or the worksheet is full)'); continue; }
    if (o.op === 'replace' && sameShown(now0, was.get(id))) { miss('same', r, 'the question on the worksheet is the same as before'); continue; }
    const extra = r.status === 'fixed' ? { repaired: `drawn without ${r.left.join(', ')} (the figure works it out from the other measures)` } : r.status === 'replaced' ? { repaired: `the question sent could not be drawn (${r.why}), so a question from its kind's generator is there instead`, notAsAsked: true } : {};
    const { id: _i, ...shown } = now0;
    landed.push({ op: o.op, ...(o.op === 'replace' ? { n: r.n } : {}), now: shown, ...extra });
  }
  if (plan.title) (back && back.title === plan.title ? landed.push({ title: plan.title }) : notLanded.push({ code: 'meanwhile', title: plan.title, why: 'the title on the worksheet is different' }));
  if (plan.grade) (back && back.grade === plan.grade ? landed.push({ grade: plan.grade }) : notLanded.push({ code: 'meanwhile', grade: plan.grade, why: 'the grade on the worksheet is different' }));
  if (plan.units) (a && a.change && a.change.unitsOn ? landed.push({ units: plan.units, questions: a.change.unitsOn }) : notLanded.push({ code: 'units', units: plan.units, why: 'no figure here takes that unit, or every one already had it' }));
  const notAsAsked = landed.filter(x => x.notAsAsked).length;
  return { landed, notLanded, ok: !notLanded.length && !notAsAsked, nothing: !landed.length, notAsAsked };
}
/** What the turn's card shows of a check (no question words: those are on the worksheet): how many landed, and each
 *  thing that did not land or landed other than asked, by code and question number. */
export function verifyCard(v) {
  return { ok: v.ok, landed: v.landed.length, notLanded: v.notLanded.map(x => ({ code: x.code, ...(x.n ? { n: x.n } : {}), ...(x.units ? { units: x.units } : {}) })),
    swapped: v.landed.filter(x => x.notAsAsked).map(x => x.now.n) };
}
/** The check as the AI is told it: what landed (each question as it shows now), what did not and why. */
export function verifyResult(v, back) {
  return {
    applied: !v.nothing, landed: v.landed, notLanded: v.notLanded.map(({ code, ...x }) => x),
    worksheetNow: back ? { count: back.count, questions: back.items.map(x => `${x.n}. ${x.question || '(no words)'} [${x.answerType === 'choice' ? `multiple choice: ${(x.choices || []).join(' / ') || 'no options'}` : 'number'}]`) } : null,
  };
}

// ---------------------------------------------------------------- applying and undoing (inside the engine's transaction)
const ROW_COLS = ['kind', 'data', 'gen', 'seed', 'hide', 'question', 'answer_key', 'answer', 'work', 'answer_type', 'choices', 'correct', 'points'];
const rowOf = id => q.get('SELECT * FROM question_set_items WHERE id=?', id) || null;
const snap = r => Object.fromEntries(ROW_COLS.map(k => [k, r[k]]));
/** What a question is now, for "still as Oomba left it". */
const hashOf = r => (r ? JSON.stringify(['kind', 'data', 'gen', 'seed', 'hide', 'question', 'answer_key', 'answer_type', 'choices', 'correct'].map(k => r[k] ?? null)) : '');
const putRow = (id, s0) => q.run(`UPDATE question_set_items SET ${ROW_COLS.map(k => `${k}=?`).join(', ')} WHERE id=?`, ...ROW_COLS.map(k => s0[k]), id);
const renumber = (setId, ids) => ids.forEach((id, i) => q.run('UPDATE question_set_items SET pos=? WHERE id=? AND set_id=?', i, id, setId));
/** A figure in other units, worked out again (null when it takes no unit, already has it, or cannot be redone). */
function inUnits(it, unit, w) {
  const K = F.kindOf(it.kind); if (!K) return null;
  const takes = typeof it.data.unit === 'string' || F.paramSchema(K).unit === 'text';
  if (!takes || it.data.unit === unit) return null;
  let key = it.answerKey;
  if (it.answerType !== 'choice' && !key && it.gen) {
    const a = F.answerOf(it, w.of_version), nums = F.solved(it.kind, it.data, w.of_version);
    key = a ? Object.keys(nums).find(k => Math.abs(nums[k] - a.value) <= 1e-9 * Math.max(1, Math.abs(a.value))) || null : null;
    if (!key) return null;
  }
  const c = F.cleanItem({ kind: it.kind, gen: it.gen, seed: it.seed, data: { ...it.data, unit }, hide: it.hide, question: it.question, answerKey: key, answerType: it.answerType, choices: it.choices, correct: it.correct }, w.of_version, w.lang);
  return c.ok ? c.item : null;
}
/**
 * The plan written to the worksheet. -> { change, undo } (change: what the chat shows; undo: what Undo needs).
 * A question named by an edit that is gone (deleted while Oomba thought) is skipped.
 */
export function applyPlan(u, w0, plan, { first = false } = {}) {
  const w = F.ownWorksheet(u, w0.id); if (!w) return { code: 'notFound' };
  let order = F.itemsOf(w.id).map(it => it.id);
  const before = new Map(), adds = new Set(), removed = [], changed = new Set(), reunit = new Set();
  const oldNum = new Map(order.map((id, i) => [id, i + 1]));
  const remember = id => { if (!before.has(id) && !adds.has(id)) { const r = rowOf(id); if (r) before.set(id, { ...snap(r), pos: r.pos }); } };
  for (const o of plan.ops) {
    if (o.op === 'remove') {
      if (!order.includes(o.id)) continue;
      remember(o.id);
      q.run('DELETE FROM question_set_items WHERE id=?', o.id);
      order = order.filter(x => x !== o.id); if (!adds.has(o.id)) removed.push(o.id); adds.delete(o.id); changed.delete(o.id); reunit.delete(o.id);
    } else if (o.op === 'replace') {
      if (!order.includes(o.id)) continue;
      remember(o.id);
      q.run('UPDATE question_set_items SET kind=? WHERE id=?', o.item.kind, o.id);
      S.rewrite(o.id, o.item);
      if (!adds.has(o.id)) changed.add(o.id);
    } else if (o.op === 'add') {
      if (order.length >= F.LIMITS.items) continue;
      const id = S.storeItem(w.id, order.length, o.item, o.newId);
      adds.add(id);
      const at = o.after === 'start' ? 0 : o.after === 'end' || !order.includes(o.after) ? order.length : order.indexOf(o.after) + 1;
      order.splice(at, 0, id);
    }
  }
  if (plan.units) {
    for (const it of F.itemsOf(w.id)) {
      const next = inUnits(it, plan.units, w); if (!next) continue;
      remember(it.id);
      S.rewrite(it.id, next);
      reunit.add(it.id);
    }
  }
  renumber(w.id, order);
  const sheet = {};
  if (plan.title && plan.title !== w.title) { sheet.title = { before: w.title, after: plan.title }; q.run('UPDATE question_sets SET title=? WHERE id=?', plan.title, w.id); }
  if (plan.grade && plan.grade !== w.grade) { sheet.grade = { before: w.grade, after: plan.grade }; q.run('UPDATE question_sets SET grade=? WHERE id=?', plan.grade, w.id); }
  S.resubject(w.id); S.touch(w.id);
  const num = id => order.indexOf(id) + 1;
  const undoItems = [
    ...[...before].map(([id, b]) => ({ id, before: b, after: hashOf(rowOf(id)), gone: !order.includes(id) })),
    ...[...adds].map(id => ({ id, added: true, after: hashOf(rowOf(id)) })),
  ];
  const change = {
    first, added: [...adds].map(num).sort((a, b) => a - b), changed: [...changed].filter(id => order.includes(id)).map(num).sort((a, b) => a - b),
    removed: removed.map(id => oldNum.get(id)).filter(Boolean).sort((a, b) => a - b), units: reunit.size ? plan.units : '', unitsOn: reunit.size,
    title: sheet.title ? sheet.title.after : '', grade: sheet.grade ? sheet.grade.after : '', repaired: plan.repaired || 0, dropped: plan.dropped || 0,
    ids: [...adds, ...changed].filter(id => order.includes(id)), count: order.length,
  };
  const any = undoItems.length || sheet.title || sheet.grade;
  audit(u.id, 'figures.chat.change', w.id, { added: change.added.length, changed: change.changed.length, removed: change.removed.length, units: !!change.units, repaired: change.repaired, dropped: change.dropped });
  return any ? { change, undo: { items: undoItems, sheet } } : {};
}
/** Undo a turn's change: each question still as Oomba left it goes back; others (edited since) stay. -> { ok, kept, skipped } */
export function undoPlan(u, w0, data) {
  const w = F.ownWorksheet(u, w0.id); if (!w) return { ok: false, code: 'notFound' };
  let order = F.itemsOf(w.id).map(it => it.id), skipped = 0;
  for (const x of [...(data.items || [])].reverse()) {
    const cur = rowOf(x.id);
    if (x.added) { if (cur && cur.set_id === w.id && hashOf(cur) === x.after) { q.run('DELETE FROM question_set_items WHERE id=?', x.id); order = order.filter(i => i !== x.id); } else if (cur) skipped++; continue; }
    if (x.gone) {
      if (cur) { skipped++; continue; }
      if (order.length >= F.LIMITS.items) { skipped++; continue; }
      const { pos, ...b } = x.before;
      q.run(`INSERT INTO question_set_items(id, set_id, pos, ${ROW_COLS.join(', ')}) VALUES (?,?,?,${ROW_COLS.map(() => '?').join(',')})`, x.id, w.id, order.length, ...ROW_COLS.map(k => b[k]));
      order.splice(Math.min(pos, order.length), 0, x.id);
      continue;
    }
    if (!cur || cur.set_id !== w.id || hashOf(cur) !== x.after) { skipped++; continue; }
    putRow(x.id, x.before);
  }
  renumber(w.id, order);
  const s0 = data.sheet || {}, now0 = F.ownWorksheet(u, w.id);
  if (s0.title) { if (now0.title === s0.title.after) q.run('UPDATE question_sets SET title=? WHERE id=?', s0.title.before, w.id); else skipped++; }
  if (s0.grade) { if (now0.grade === s0.grade.after) q.run('UPDATE question_sets SET grade=? WHERE id=?', s0.grade.before, w.id); else skipped++; }
  S.resubject(w.id); S.touch(w.id);
  audit(u.id, 'figures.chat.undo', w.id, { skipped });
  return { ok: true, skipped };
}

/** The JSON object in the model's text (a code fence or words around it are tolerated). */
export function jsonIn(text) {
  const t = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try { return JSON.parse(t); } catch { /* look for the object inside */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new SyntaxError('no JSON object');
  return JSON.parse(t.slice(a, b + 1));
}

// ---------------------------------------------------------------- the companion's calls
/** "Ask Oomba about this": a question of the teacher's own worksheet, as the message quotes it. */
export function quoteOf(u, w, itemId) {
  const items = F.itemsOf(w.id), i = items.findIndex(x => x.id === String(itemId || ''));
  if (i < 0) return null;
  return { ref: `${w.id}:${items[i].id}`, sheetId: w.id, n: i + 1, text: fine(u, items[i].question) ? clip(items[i].question, 160) : '' };
}
/** "Add a starter set instead" after a first draft Oomba couldn't make: the generators the words point at, without the
 *  AI, written like a plan (the companion adds it as a turn with Undo). Only for an empty worksheet. -> plan | null */
export function starterPlan(w, words) {
  if (F.itemsOf(w.id).length) return null;
  const items = w.purpose === 'test' ? F.templateTest({ topic: words, grade: w.grade, count: 8, lang: w.lang }) : F.templateItems({ brief: words, grade: w.grade, count: 8, lang: w.lang });
  return items.length ? { ops: items.map(item => ({ op: 'add', after: 'end', item })), title: '', grade: '', units: '' } : null;
}
