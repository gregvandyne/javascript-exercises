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
    'After editWorksheet, say in one to three short sentences what you changed. If what the teacher wants for the worksheet is unclear, ask one short question and change nothing.',
    `- title: a new short title (under 60 characters) only when there is none yet or the teacher asks. grade: "K" or "1" to "12" only when the teacher asks for another grade.`,
    `- units: one of ${UNITS.join(', ')} when the teacher asks for other units. The app then changes the unit of every figure and works every answer out again, so do not replace questions just to change units (only replace a question whose own words name a unit).`,
    '- edits: what changes, in order. n is a question number as it is now (1 is the first). {"op": "replace", "n": 3, "item": ITEM} changes a question (harder, easier, other numbers, other words, another kind): give the whole new question. {"op": "remove", "n": 5}. {"op": "add", "after": 4, "item": ITEM} ("after": 0 for the start, null for the end).',
    `- Only touch the questions the teacher asks about; every other question stays exactly as it is (never repeat it). At most ${F.LIMITS.draftMax} questions added in one answer; the ${sheetName(w)} holds at most ${F.LIMITS.items}. A first draft: ${test ? '8' : '6 to 8'} questions unless the teacher says how many, from easier to harder.`,
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
/** One ITEM from the AI, checked and repaired like a draft's. -> { item, repaired, dropped } */
function checkItem(raw, w) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { item: null, repaired: 0, dropped: 1 };
  const x = { ...raw };
  if (x.data && typeof x.data === 'object') x.data = JSON.stringify(x.data);
  const r = typeof x.gen === 'string' && x.gen.trim()
    ? F.repairTestDraft([x], { max: 1, grade: '', lang: w.lang })
    : F.repairDraft([x], { max: 1, lang: w.lang });
  return { item: r.items[0] || null, repaired: r.repaired, dropped: r.dropped };
}
/**
 * The model's answer made into a plan: { reply, title, grade, units, ops: [{ op, id?, after?, item? }], repaired, dropped }.
 * Numbers become question ids (as the teacher saw them when the message was sent). Throws SyntaxError when there is
 * neither a reply nor a change.
 */
export function readAnswer(raw, w, items) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SyntaxError('not an answer');
  let reply = clip(raw.reply, 600).replace(/\s+/g, ' ').trim();
  if (reply && F.textProblem(reply)) reply = '';
  const idOf = n => (Number.isInteger(+n) && +n >= 1 && +n <= items.length ? items[+n - 1].id : null);
  const ops = []; let repaired = 0, dropped = 0, adds = 0;
  const room = () => Math.min(F.LIMITS.draftMax - adds, F.LIMITS.items - items.length - adds + ops.filter(o => o.op === 'remove').length);
  const seen = new Set();
  for (const e of (Array.isArray(raw.edits) ? raw.edits : []).slice(0, F.LIMITS.items)) {
    if (!e || typeof e !== 'object') continue;
    if (e.op === 'remove') { const id = idOf(e.n); if (id && !seen.has(id)) { seen.add(id); ops.push({ op: 'remove', id }); } continue; }
    if (e.op === 'replace') {
      const id = idOf(e.n); if (!id || seen.has(id)) continue;
      const c = checkItem(e.item, w); repaired += c.repaired; dropped += c.dropped;
      if (c.item) { seen.add(id); ops.push({ op: 'replace', id, item: c.item }); }
      continue;
    }
    if (e.op === 'add') {
      if (room() <= 0) { dropped++; continue; }
      const c = checkItem(e.item, w); repaired += c.repaired; dropped += c.dropped;
      if (!c.item) continue;
      const after = e.after === 0 || e.after === '0' ? 0 : idOf(e.after);
      ops.push({ op: 'add', after: after === 0 ? 'start' : after || 'end', item: c.item }); adds++;
    }
  }
  const title = typeof raw.title === 'string' ? S.cleanTitle(raw.title, '') : '';
  const grade = raw.grade !== null && raw.grade !== undefined ? S.cleanGrade(String(raw.grade).toUpperCase() === 'K' ? 'K' : String(raw.grade)) : '';
  const units = UNITS.includes(raw.units) ? raw.units : '';
  if (!reply && !ops.length && !title && !grade && !units) throw new SyntaxError('no reply');
  return { reply, title, grade, units, ops, repaired, dropped };
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
      const id = S.storeItem(w.id, order.length, o.item);
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
