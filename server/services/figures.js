// Figures, the standalone product (docs/decisions.md "Figures, the standalone product"; routes/figures.js): the menu of
// figure kinds, one editor for every kind, worksheets of figure questions (print a student sheet and an answer key), the
// teacher's own presets, and the AI drafters Oomba's chat uses (services/figures-chat.js). FIGURES=0 (config.figures) hides it
// from everyone, the platform admin included.
//
// Who may use it (services/teacher-tools.js toolAccess, the same rule as the Manipulatives; docs/decisions.md "Figures
// and the Manipulatives: Teacher plan only"): the platform admin, school staff on the tester list, and, while paid plans
// are on, school staff with the Teacher plan (a trial and a school seat count). Other school staff see the "part of the
// Teacher plan" page; never a guest, a banned account, a student or kid account, or a grown-up (family) account (the
// normal 404, on the pages and on every API). Signed out, a page asks to sign in (like the /teach pages). Students never open /figures: a worksheet reaches a class through Assign to class
// (services/figures-steps.js), as a lesson step on the class's own lesson page.
// What each person sees: a worksheet is its owner's. Only the owner lists, opens, edits, prints (the student sheet and
// the answer key) or deletes it; for anyone else it is the same 404 as a wrong id. A preset is its owner's too.
// Every figure that is saved passed OF.check on the server with the pinned Oomba Figures version, and every answer is
// worked out here: from OF.solve (a generator's answer is the OF.solve value it names), never from the browser or the AI.
// Text a teacher types (a title, a question, a brief) is checked with the site's word and personal-information rules.
// The AI never sees students' names: a brief that names a student of the teacher's classes is refused.
import { q, uid, now, audit } from '../db.js';
import { config } from '../config.js';
import * as S from './schools.js';
import { toolAccess } from './teacher-tools.js';
import { anthropic } from '../builder/anthropic.js';
import * as aiBudget from './ai-budget.js';
import { hasProfanity, personalInfo } from './textfilter.js';
import { figuresKit, FIG_LATEST, FIG_VERSIONS } from './figlibs.js';
import { canvasKit } from './canvaskit.js';
import { log } from './log.js';
import { callAi, logAiFail, fallbackReason } from './ai-call.js';
import { forgetKey as forgetChat, forgetUser as forgetChats } from './oomba-chat.js';
import { tEn } from '../i18n/index.js';
import { KINDS, SUBJECTS, GRADE_BANDS, kindOf, genOf, flatSolve, solveOf, numText, PAST_GENS } from '../../public/js/figures-catalog.js';
import { localGen, genLang, labelLangs, isGenChoices, GEN_LANGS } from '../../public/js/figures-gen-words/index.js';

export { KINDS, SUBJECTS, GRADE_BANDS, kindOf, genOf, genLang, GEN_LANGS };
/** The language the AI writes in, for each site language (the lesson drafter uses the same). */
export const LANG_NAMES = Object.freeze({ en: 'English (US)', 'en-GB': 'British English', pt: 'Brazilian Portuguese', fr: 'French', es: 'Spanish', de: 'German', he: 'Hebrew', ja: 'Japanese', ar: 'Arabic', ru: 'Russian', it: 'Italian', 'zh-Hant': 'Traditional Chinese', nl: 'Dutch' });
export const LIMITS = Object.freeze({ worksheets: 200, items: 40, presets: 50, titleChars: 80, questionChars: 400, briefChars: 1000, dataChars: 20000, nameChars: 60, draftMax: 12 });
/** Test hooks: create replaces the AI client's messages.create (no network in tests); log receives each repair. */
export const hooks = { create: null, log: null };
const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, extra = {}) => ({ ok: false, code, ...extra });
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const clipStr = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, '').slice(0, n);

// ---------------------------------------------------------------- who may use it
export const on = () => !!config.figures;
/** May this account make figures and worksheets? (services/teacher-tools.js toolAccess, shared with the Manipulatives.) */
export const canMake = u => toolAccess(u, on()) === 'yes';
/** 'teacher' | 'plan' (school staff without the Teacher plan: the plan page) | null (the normal 404). */
export function roleOf(u) {
  const a = toolAccess(u, on());
  return a === 'yes' ? 'teacher' : a === 'plan' ? 'plan' : null;
}

// ---------------------------------------------------------------- Oomba Figures on the server
export const OF_VERSION = FIG_LATEST['oomba-figures'];
/** The pinned Oomba Figures a worksheet was checked with (its of_version), or the current one. */
const kit = (v = OF_VERSION) => figuresKit(FIG_VERSIONS['oomba-figures'][v] ? v : OF_VERSION);
/** What is wrong with this figure ([] = it can be drawn). */
export const checkFigure = (kind, data, v) => kit(v).check(kind, data);

/** Text someone typed: null when fine, else 'words' | 'personal'. */
export function textProblem(s) {
  const v = String(s || '');
  if (!v.trim()) return null;
  if (hasProfanity(v)) return 'words';
  const pi = personalInfo(v);
  return pi && pi !== 'handle' ? 'personal' : null;
}
/** Every string in a value (keys too), for the word check. */
function strings(v, out = [], depth = 0) {
  if (out.length > 2000 || depth > 10) return out;
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out, depth + 1);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); strings(x, out, depth + 1); }
  return out;
}
/** A figure's data as it may be kept: a plain JSON object of limited size, without kind and hide (an item's own), and
 *  with clean words. -> { data } | { code } */
export function cleanData(raw) {
  const o = typeof raw === 'string' ? (raw.length > LIMITS.dataChars ? null : json(raw, null)) : raw;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { code: 'badData' };
  let text; try { text = JSON.stringify(o); } catch { return { code: 'badData' }; }
  if (text.length > LIMITS.dataChars) return { code: 'tooBig' };
  const d = JSON.parse(text); delete d.kind; delete d.hide;
  for (const s of strings(d)) { const p = textProblem(s); if (p) return { code: p }; }
  return { data: d };
}
/** Canonical JSON (sorted keys), to tell whether data is still exactly what a generator made. */
const canon = v => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v));
/** What "Hide answer for students" leaves out: false, true, or one of the kind's hide parts. */
const cleanHide = (K, h) => (h === true || (typeof h === 'string' && K.hide.includes(h)) ? h : false);
/** The unit an OF.solve value is in, from the figure's own unit: square for an area, cubed for a volume, degrees for an
 *  angle, the unit for a length; nothing for a count, a ratio or a figure without a unit. */
export function keyUnit(key, data) {
  const last = String(key).split('.')[0], u = data && typeof data.unit === 'string' ? data.unit.slice(0, 12) : '';
  if (/^(angles|interior|exterior|central|angle|reading)$/.test(last)) return '°';
  if (!u) return '';
  if (/area$/i.test(last) || /Area$/.test(last)) return `${u}²`;
  if (/^volume$/.test(last)) return `${u}³`;
  return /^(sides|perimeter|height|heights|radius|diameter|side|slant|diagonals|apothem|length|width|circumference)$/.test(last) ? u : '';
}
/** A currency unit: written before the number ($125, -$3.5); every other unit after it (12 N, 45°, 50%). */
export const CURRENCY = /^[$€£¥₹]$/;
export function unitText(v, unit) {
  const s = String(v);
  if (!unit) return s;
  if (CURRENCY.test(unit)) return s.startsWith('-') ? `-${unit}${s.slice(1)}` : `${unit}${s}`;
  return /^[°′″%]/.test(unit) ? `${s}${unit}` : `${s} ${unit}`;
}
/** A stored answer as it shows: one saved before currency went first ("125 $") reads "$125". */
export const shownAnswer = a => (typeof a === 'string' ? a.replace(/^(-?)(\d[\d.,]*) ([$€£¥₹])$/, '$1$3$2') : a);

/** The numbers OF.solve gives for this figure, by path ({ 'sides.CA': 5, area: 6 }); {} for a kind without them. */
export const solved = (kind, data, v) => flatSolve(solveOf(kit(v), kind, data) || {});

const L = () => canvasKit().logic;
// ---------------------------------------------------------------- figure question generators
// The catalog's generators are written in the gen language of Oomba Canvas (docs/figures-api.md "Figure question
// generators in Figures worksheets"): Canvas deals the values and fills the text and the figure (TOOLS[tool].gen), and
// the Figures product checks what it made itself, because a worksheet takes more than a Canvas activity does: a number
// answer of any sign (a worksheet blank takes a minus sign; Canvas's keypad does not) and "figure.choice" with 2 to 6
// options whose worked lines say the right one with {choice}. A choice generator's right option comes from OF.solve:
// key is the OF.solve value (a number or a word, read from the solve result) and pick maps each of its values to the
// option it means ({ "ad": 0, "ar": 1, "xr": 2 }); the generator's own answer formula must agree (the tests check it).
export const CHOICES = Object.freeze({ min: 2, max: 6, chars: 80 });
/** An OF.solve value by its dotted path, a number or a string (flatSolve keeps numbers only). */
export function solveValue(kind, data, path, v) {
  let o = solveOf(kit(v), kind, data);
  for (const k of String(path || '').split('.')) { if (!o || typeof o !== 'object' || !(k in o)) return undefined; o = o[k]; }
  return typeof o === 'number' && Number.isFinite(o) ? o : typeof o === 'string' ? o : undefined;
}
/** The option a choice generator's key and pick give for this figure, or undefined. */
export function pickOf(g, kind, data, v) {
  if (!g || !g.key || !g.pick || typeof g.pick !== 'object') return undefined;
  const x = solveValue(kind, data, g.key, v);
  if (x === undefined) return undefined;
  const i = g.pick[String(x)];
  return Number.isInteger(i) && i >= 0 && i < (g.choices || []).length ? i : undefined;
}
const letter = i => String.fromCharCode(65 + i);
/** The answer as the key shows it for a choice question: "B) autosomal recessive". */
export const choiceText = (choices, i) => (Number.isInteger(i) && choices[i] ? `${letter(i)}) ${choices[i]}` : '');
const line = (s, n) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
/** What a generator dealt, checked the Figures way: { q, fig, work, unit, dp, answer } or { choices, answer: index }. */
function cleanDealt(p, tool) {
  if (!p || typeof p.why === 'string') return null;
  const q = line(p.q, LIMITS.questionChars), fig = p.fig;
  if (!q || !fig || typeof fig !== 'object' || Array.isArray(fig) || typeof fig.kind !== 'string') return null;
  const work = Array.isArray(p.work) && p.work.length >= 1 && p.work.length <= 8 && p.work.every(x => typeof x === 'string' && x.trim()) ? p.work.map(x => line(x, 200)) : null;
  if (!work) return null;
  if (tool === 'figure.choice') {
    const ch = Array.isArray(p.choices) ? p.choices.map(x => line(String(x ?? ''), CHOICES.chars)) : [];
    if (ch.length < CHOICES.min || ch.length > CHOICES.max || ch.some(x => !x) || new Set(ch.map(x => x.toLowerCase())).size !== ch.length) return null;
    if (!Number.isInteger(p.answer) || p.answer < 0 || p.answer >= ch.length) return null;
    return { q, fig, work, choices: ch, answer: p.answer };
  }
  if (typeof p.answer !== 'number' || !Number.isFinite(p.answer) || Math.abs(p.answer) > 1e9) return null;
  const dec = (numText(p.answer, 6).split('.')[1] || '').length;
  const dp = Number.isInteger(p.dp) && p.dp >= 0 && p.dp <= 3 ? p.dp : Math.min(3, dec);
  return { q, fig, work, unit: line(p.unit, 20), dp, answer: p.answer };
}
/** What a generator deals for this seed, before the figure is checked (also what the tests compare against OF.solve):
 *  the Canvas gen's own output, with {choice} still in the text. null for an unknown generator. */
export function dealRaw(genId, seed, g = genOf(genId)) {
  const lg = L();
  if (!g || !lg.TOOLS[g.tool]) return null;
  return lg.TOOLS[g.tool].gen(lg.seeded(Number.isInteger(seed) && seed > 0 ? seed : 1), g);
}
/** A generator's question with this seed, in a language (lang, English by default): { kind, data, hide, question,
 *  answer, work, unit, dp, value, answerType, choices, correct } or null. The numbers and the answer are the same in
 *  every language; only the words differ (and a figure's labels, for the few that have words). A number question's value is the OF.solve value the generator names (key); a generator
 *  for a kind without a solver keeps its own formula. A choice question's right option (correct, also value) is the one
 *  its key and pick give, and {choice} in its question and worked lines is that option's words. */
export function generate(genId, seed, v, past = null, lang = 'en') {
  // The catalog's generator in the language (public/js/figures-gen-words); an earlier definition (past) as it was.
  const g = past || localGen(genOf(genId), lang);
  const raw = g ? dealRaw(genId, seed, g) : null; if (!raw || !raw.fig || typeof raw.fig !== 'object') return null;
  const { kind, hide, ...data } = raw.fig;
  if (kind !== g.kind || checkFigure(kind, data, v).length) return null;
  if (g.tool === 'figure.choice') {
    const picked = pickOf(g, kind, data, v), idx = picked !== undefined ? picked : Math.round(raw.answer);
    const say = s => String(s).replace(/\{choice\}/g, () => String((raw.choices || [])[idx] ?? ''));
    const c = cleanDealt({ ...raw, answer: idx, q: say(raw.q || ''), work: (raw.work || []).map(say) }, g.tool);
    if (!c) return null;
    const last = c.work[c.work.length - 1].toLowerCase();
    if (!last.includes(c.choices[idx].toLowerCase())) return null;
    return { kind, data, hide: cleanHide(kindOf(kind), hide === undefined ? false : hide), question: c.q, answer: choiceText(c.choices, idx), work: c.work, unit: '', dp: 0, value: idx, answerType: 'choice', choices: c.choices, correct: idx };
  }
  const c = cleanDealt(raw, g.tool); if (!c) return null;
  const fromSolve = g.key ? solved(kind, data, v)[g.key] : undefined;
  const value = typeof fromSolve === 'number' ? fromSolve : c.answer;
  return { kind, data, hide: cleanHide(kindOf(kind), hide === undefined ? false : hide), question: c.q, answer: unitText(numText(value, c.dp), c.unit), work: c.work, unit: c.unit, dp: c.dp, value, answerType: 'number', choices: [], correct: null };
}
export const newSeed = () => 1 + Math.floor(Math.random() * 999999);
/** What a saved question's generator dealt for its seed: the current definition in the language, or, when the saved
 *  figure is not what it deals now, the same in the language its figure was dealt in (a generator whose figure has
 *  words: a figure dealt in Spanish has Spanish labels), else the earlier definition (PAST_GENS, in English) that dealt
 *  exactly that figure, so a generator changed after the question was saved keeps its answer. With no figure given, the
 *  current definition in the language. null when none deals it. */
export function dealtFor(genId, seed, data, v, lang = 'en') {
  const L = genLang(lang), now1 = generate(genId, seed, v, null, L);
  if (data === undefined || (now1 && canon(now1.data) === canon(data))) return now1;
  for (const other of [...new Set(['en', ...labelLangs(genId)])].filter(x => x !== L)) {
    const g = generate(genId, seed, v, null, other);
    if (g && canon(g.data) === canon(data)) return g;
  }
  for (const past of PAST_GENS[genId] || []) {
    const g = generate(genId, seed, v, { ...past, kind: past.kind || (genOf(genId) || {}).kind });
    if (g && canon(g.data) === canon(data)) return g;
  }
  return now1;
}

/** A choice question's options as typed: trimmed, blanks left out (the right one's index follows), at most 6, each through
 *  the word rules. -> { choices, correct } | { code } (words, personal, sameChoices) */
export function cleanChoices(list, correct) {
  const out = []; let right = null;
  (Array.isArray(list) ? list : []).slice(0, CHOICES.max + 4).forEach((x, i) => {
    const v = clipStr(typeof x === 'number' ? String(x) : typeof x === 'string' ? x : '', CHOICES.chars).replace(/\s+/g, ' ').trim();
    if (!v || out.length >= CHOICES.max) return;
    if (i === correct) right = out.length;
    out.push(v);
  });
  for (const v of out) { const p = textProblem(v); if (p) return { code: p }; }
  if (new Set(out.map(x => x.toLowerCase())).size !== out.length) return { code: 'sameChoices' };
  return { choices: out, correct: right };
}
/** A choice question's link to its generator ("gen:<id>"): while its options are still that generator's (in any
 *  language), the right one is worked out from the figure with OF.solve (key and pick), even after the teacher changes
 *  the figure. */
const GEN_LINK = /^gen:([A-Za-z.]{2,40})$/;
const linkedGen = (key, kind) => { const m = GEN_LINK.exec(String(key || '')); const g = m && genOf(m[1]); return g && g.kind === kind && g.tool === 'figure.choice' && g.pick ? g : null; };

/**
 * One worksheet question as it may be stored, worked out here from what the browser sent (never trusting its answer or
 * worked lines). An item from a generator keeps the generator's question, answer and worked lines while its data is
 * exactly what that generator makes for its seed; once the teacher changes the figure it is a figure of their own,
 * answered from OF.solve by answerKey. answerType 'number' (the default) or 'choice': a choice question has 2 to 6
 * options (choices) and the index of the right one (correct): from its generator (OF.solve through key and pick) while
 * it is linked to one (answerKey "gen:<id>"), else the one the teacher marked. -> { ok, item } | { ok: false, code, problems? }
 */
export function cleanItem(raw, v, lang = 'en') {
  const r = raw && typeof raw === 'object' ? raw : {};
  const K = kindOf(r.kind); if (!K) return fail('badKind');
  const question = clipStr(r.question, LIMITS.questionChars).replace(/\s+/g, ' ').trim();
  const tp = textProblem(question); if (tp) return fail(tp);
  const seed = Number.isInteger(r.seed) && r.seed > 0 && r.seed < 1e9 ? r.seed : null;
  const g = typeof r.gen === 'string' && genOf(r.gen) && genOf(r.gen).kind === K.id && seed ? dealtFor(r.gen, seed, r.data === undefined ? undefined : cleanData(r.data).data || undefined, v, lang) : null;
  let data;
  if (r.data === undefined && g) data = g.data;
  else { const c = cleanData(r.data); if (!c.data) return fail(c.code); data = c.data; }
  const problems = checkFigure(K.id, data, v);
  if (problems.length) return fail('cannotDraw', { problems: problems.slice(0, 5) });
  const fromGen = g && canon(g.data) === canon(data);
  const type = r.answerType === 'choice' || r.answerType === 'number' ? r.answerType : fromGen ? g.answerType : 'number';
  const hide = r.hide === undefined && fromGen ? g.hide : cleanHide(K, r.hide);
  const src = fromGen ? { gen: r.gen, seed } : { gen: null, seed: null };
  if (type === 'choice') {
    const fromGenChoice = fromGen && g.answerType === 'choice';
    const typed = r.choices === undefined && fromGenChoice ? { choices: g.choices, correct: g.correct } : cleanChoices(r.choices, Number.isInteger(r.correct) ? r.correct : null);
    if (typed.code) return fail(typed.code);
    const linkId = fromGenChoice && (r.answerKey === undefined || r.answerKey === `gen:${r.gen}`) ? r.gen : (GEN_LINK.exec(String(r.answerKey || '')) || [])[1];
    const link = linkId ? linkedGen(`gen:${linkId}`, K.id) : null;
    const linked = link && isGenChoices(link, typed.choices) ? link : null;
    let correct = typed.correct;
    if (linked) { const pk = pickOf(linked, K.id, data, v); correct = pk !== undefined ? pk : fromGenChoice ? g.correct : null; }
    if (typed.choices.length < CHOICES.min) correct = null;
    const base = { kind: K.id, data, hide, question: question || (fromGen ? g.question : ''), answerType: 'choice', choices: typed.choices, correct, answerKey: linked ? `gen:${linked.id}` : null };
    const work = fromGenChoice && linked ? g.work : [];
    return ok({ item: { ...base, ...src, answer: choiceText(base.choices, base.correct), work } });
  }
  const nums = solved(K.id, data, v);
  const key = typeof r.answerKey === 'string' && typeof nums[r.answerKey] === 'number' ? r.answerKey : null;
  // A number question keeps options the teacher wrote (switching back to multiple choice brings them back).
  const kept = r.choices === undefined ? { choices: [], correct: null } : cleanChoices(r.choices, Number.isInteger(r.correct) ? r.correct : null);
  const base = { kind: K.id, data, hide, question: question || (fromGen ? g.question : ''), answerKey: key, answerType: 'number', choices: kept.choices || [], correct: kept.code ? null : kept.correct };
  const keyAnswer = key ? unitText(numText(nums[key], 2), keyUnit(key, data)) : '';
  if (fromGen && g.answerType === 'number') return ok({ item: { ...base, gen: r.gen, seed, answer: key ? keyAnswer : g.answer, work: key ? [] : g.work } });
  return ok({ item: { ...base, ...src, answer: keyAnswer, work: [] } });
}

// ---------------------------------------------------------------- worksheets (question sets)
// One model for three uses (purpose): a 'worksheet' (printed, or assigned), a 'test' ("Build a test": the same builder,
// drafted from a topic, a grade and a subject with the generators) and a 'lesson' set (the questions of one lesson's
// Figure step while the teacher edits them; lesson_id names the lesson and "Save to lesson" snapshots them into the
// step, services/figures-steps.js). All three are their owner's only, and edited the same way.
export const PURPOSES = Object.freeze(['worksheet', 'test', 'lesson']);
const cleanTitle = (s, d) => { const v = clipStr(s, LIMITS.titleChars).replace(/\s+/g, ' ').trim(); return v && !textProblem(v) ? v : d; };
const cleanGrade = g => (GRADE_BANDS.includes(g) || /^(K|[1-9]|1[0-2])$/.test(String(g)) ? String(g) : '');
const rowItem = r => ({ id: r.id, kind: r.kind, data: json(r.data, {}), gen: r.gen || null, seed: r.seed || null, hide: r.hide === null || r.hide === undefined ? false : r.hide === 'true' ? true : r.hide,
  question: r.question, answerKey: r.answer_key || null, answer: shownAnswer(r.answer), work: json(r.work, []),
  answerType: r.answer_type === 'choice' ? 'choice' : 'number', choices: json(r.choices, []).filter(x => typeof x === 'string'), correct: Number.isInteger(r.correct) ? r.correct : null });
export const itemsOf = setId => q.all('SELECT * FROM question_set_items WHERE set_id=? ORDER BY pos, id', setId).map(rowItem);
/** The owner's own worksheet, or null (anyone else: null, the same as a wrong id). */
export function ownWorksheet(u, id) {
  if (!canMake(u)) return null;
  return q.get("SELECT * FROM question_sets WHERE id=? AND owner_id=? AND purpose IN ('worksheet','test','lesson')", String(id || ''), u.id) || null;
}
/** The teacher's worksheets and tests (newest first; a lesson's sets belong to their lesson and are not listed). */
export function listWorksheets(u, { purposes = ['worksheet', 'test'] } = {}) {
  if (!canMake(u)) return [];
  const ps = purposes.filter(p => PURPOSES.includes(p)); if (!ps.length) return [];
  return q.all(`SELECT s.id, s.title, s.grade, s.subject, s.purpose, s.updated_at, (SELECT COUNT(*) FROM question_set_items i WHERE i.set_id=s.id) n
    FROM question_sets s WHERE s.owner_id=? AND s.purpose IN (${ps.map(() => '?').join(',')}) ORDER BY s.updated_at DESC LIMIT 100`, u.id, ...ps);
}
/** Store a question at a position. -> its id. */
const storeItem = (setId, pos, it, id = uid(12)) => (q.run(`INSERT INTO question_set_items(id, set_id, pos, kind, data, gen, seed, hide, question, answer_key, answer, work, answer_type, choices, correct, points)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`, id, setId, pos, it.kind, JSON.stringify(it.data), it.gen, it.seed, it.hide === false ? null : String(it.hide), it.question, it.answerKey, it.answer, JSON.stringify(it.work),
  it.answerType === 'choice' ? 'choice' : 'number', JSON.stringify(it.choices || []), Number.isInteger(it.correct) ? it.correct : null), id);
/** Write a question's worked-out fields back to its row. */
const rewrite = (id, it) => q.run('UPDATE question_set_items SET data=?, gen=?, seed=?, hide=?, question=?, answer_key=?, answer=?, work=?, answer_type=?, choices=?, correct=? WHERE id=?',
  JSON.stringify(it.data), it.gen, it.seed, it.hide === false ? null : String(it.hide), it.question, it.answerKey, it.answer, JSON.stringify(it.work),
  it.answerType === 'choice' ? 'choice' : 'number', JSON.stringify(it.choices || []), Number.isInteger(it.correct) ? it.correct : null, id);
const touch = id => q.run('UPDATE question_sets SET updated_at=? WHERE id=?', now(), id);
/** The subject a worksheet is mostly about (its items' kinds). */
function subjectOf(setId) {
  const n = {}; for (const r of q.all('SELECT kind FROM question_set_items WHERE set_id=?', setId)) { const K = kindOf(r.kind); if (K) n[K.subject] = (n[K.subject] || 0) + 1; }
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
const resubject = id => q.run('UPDATE question_sets SET subject=? WHERE id=?', subjectOf(id), id);

/** A new worksheet, test or lesson set (purpose; a lesson set names its lesson: lessonId, checked by the caller). */
export function createWorksheet(u, { title, grade, items = [], purpose = 'worksheet', lessonId = null, lang = 'en' } = {}) {
  if (!canMake(u)) return fail('notFound');
  const pp = PURPOSES.includes(purpose) ? purpose : 'worksheet';
  if (pp === 'lesson' && !lessonId) return fail('notFound');
  if (q.get('SELECT COUNT(*) n FROM question_sets WHERE owner_id=? AND purpose=?', u.id, pp).n >= LIMITS.worksheets) return fail('tooMany');
  const list = [], L = genLang(lang);
  for (const raw of (Array.isArray(items) ? items : []).slice(0, LIMITS.items)) { const c = cleanItem(raw, undefined, L); if (!c.ok) return c; list.push(c.item); }
  const id = uid(12), t = now();
  q.run("INSERT INTO question_sets(id, owner_id, title, grade, subject, purpose, of_version, created_at, updated_at, lesson_id, lang) VALUES (?,?,?,?,'',?,?,?,?,?,?)",
    id, u.id, cleanTitle(title, tEn(pp === 'test' ? 'figures.sheet.untitledTest' : 'figures.sheet.untitled')), cleanGrade(grade), pp, OF_VERSION, t, t, pp === 'lesson' ? String(lessonId) : null, L);
  list.forEach((it, i) => storeItem(id, i, it));
  resubject(id);
  audit(u.id, 'figures.worksheet.create', id, { items: list.length, purpose: pp });
  return ok({ id });
}
export function updateWorksheet(u, id, { title, grade } = {}) {
  const w = ownWorksheet(u, id); if (!w) return fail('notFound');
  if (title !== undefined) { const v = clipStr(title, LIMITS.titleChars).replace(/\s+/g, ' ').trim(); const p = textProblem(v); if (p) return fail(p); if (v) q.run('UPDATE question_sets SET title=? WHERE id=?', v, w.id); }
  if (grade !== undefined) q.run('UPDATE question_sets SET grade=? WHERE id=?', cleanGrade(grade), w.id);
  touch(w.id);
  return ok({ id: w.id });
}
export function deleteWorksheet(u, id) {
  const w = ownWorksheet(u, id); if (!w) return fail('notFound');
  q.run('DELETE FROM question_set_items WHERE set_id=?', w.id);
  q.run('DELETE FROM question_sets WHERE id=?', w.id);
  forgetChat('figures', w.id);
  audit(u.id, 'figures.worksheet.delete', w.id, {});
  return ok();
}
export function addItem(u, id, raw) {
  const w = ownWorksheet(u, id); if (!w) return fail('notFound');
  if (q.get('SELECT COUNT(*) n FROM question_set_items WHERE set_id=?', w.id).n >= LIMITS.items) return fail('fullSheet');
  const c = cleanItem(raw, w.of_version, w.lang); if (!c.ok) return c;
  storeItem(w.id, q.get('SELECT COALESCE(MAX(pos), -1) + 1 p FROM question_set_items WHERE set_id=?', w.id).p, c.item);
  resubject(w.id); touch(w.id);
  return ok({ id: w.id });
}
const ownItem = (w, itemId) => q.get('SELECT * FROM question_set_items WHERE id=? AND set_id=?', String(itemId || ''), w.id) || null;
/** A change to one question: any of data, hide, question, answerKey, answerType, choices, correct (the rest is kept),
 *  worked out again. */
export function updateItem(u, id, itemId, patch = {}) {
  const w = ownWorksheet(u, id); if (!w) return fail('notFound');
  const r = ownItem(w, itemId); if (!r) return fail('notFound');
  const old = rowItem(r), p = patch && typeof patch === 'object' ? patch : {};
  const next = { kind: old.kind, gen: old.gen, seed: old.seed, data: 'data' in p ? p.data : old.data, hide: 'hide' in p ? p.hide : old.hide,
    question: 'question' in p ? p.question : old.question, answerKey: 'answerKey' in p ? p.answerKey : old.answerKey,
    answerType: 'answerType' in p ? p.answerType : old.answerType, choices: 'choices' in p ? p.choices : old.choices, correct: 'correct' in p ? p.correct : old.correct };
  const c = cleanItem(next, w.of_version, w.lang); if (!c.ok) return c;
  rewrite(r.id, c.item);
  touch(w.id);
  return ok({ id: w.id });
}
export function deleteItem(u, id, itemId) {
  const w = ownWorksheet(u, id); if (!w) return fail('notFound');
  const r = ownItem(w, itemId); if (!r) return fail('notFound');
  q.run('DELETE FROM question_set_items WHERE id=?', r.id);
  itemsOf(w.id).forEach((it, i) => q.run('UPDATE question_set_items SET pos=? WHERE id=?', i, it.id));
  resubject(w.id); touch(w.id);
  return ok({ id: w.id });
}
export function moveItem(u, id, itemId, dir) {
  const w = ownWorksheet(u, id); if (!w) return fail('notFound');
  const list = itemsOf(w.id), i = list.findIndex(x => x.id === itemId);
  if (i < 0) return fail('notFound');
  const j = i + (dir === 'up' ? -1 : 1);
  if (j >= 0 && j < list.length) { [list[i], list[j]] = [list[j], list[i]]; list.forEach((it, k) => q.run('UPDATE question_set_items SET pos=? WHERE id=?', k, it.id)); touch(w.id); }
  return ok({ id: w.id });
}
/** "Regenerate numbers": the same generator with a new seed (a question from a generator only). Without a seed given,
 *  a fresh random one, drawn again (up to 12 times) while it deals the same figure and question as now, so a re-deal
 *  always changes the question when its generator can make another. */
export function regenItem(u, id, itemId, seed) {
  const w = ownWorksheet(u, id); if (!w) return fail('notFound');
  const r = ownItem(w, itemId); if (!r) return fail('notFound');
  const gid = r.gen || (kindOf(r.kind) && kindOf(r.kind).gens[0] && kindOf(r.kind).gens[0].id);
  if (!gid) return fail('noGen');
  const deal = s => cleanItem({ kind: r.kind, gen: gid, seed: s }, w.of_version, w.lang);
  const was = rowItem(r), same = x => canon(x.item.data) === canon(was.data) && x.item.question === was.question;
  let c = deal(seed === undefined ? newSeed() : seed);
  for (let i = 0; seed === undefined && i < 12 && c.ok && same(c); i++) c = deal(newSeed());
  if (!c.ok) return c;
  rewrite(r.id, c.item);
  touch(w.id);
  return ok({ id: w.id });
}
/** "Swap figure": the question becomes a fresh one of another kind (from its generator, else its example), in place. */
export function swapItem(u, id, itemId, kind) {
  const w = ownWorksheet(u, id); if (!w) return fail('notFound');
  const r = ownItem(w, itemId); if (!r) return fail('notFound');
  const raw = starterItem(kind); if (!raw) return fail('badKind');
  const c = cleanItem(raw, w.of_version, w.lang); if (!c.ok) return c;
  q.run('UPDATE question_set_items SET kind=? WHERE id=?', c.item.kind, r.id);
  rewrite(r.id, c.item);
  resubject(w.id); touch(w.id);
  return ok({ id: w.id });
}
/** A new question of this kind for "Add figure question": a fresh one from its generator, else its example. */
export function starterItem(kind) {
  const K = kindOf(kind); if (!K) return null;
  if (K.gens.length) { const gid = K.gens[Math.floor(Math.random() * K.gens.length)].id; return { kind: K.id, gen: gid, seed: newSeed() }; }
  return { kind: K.id, data: K.presets[0] };
}

/** The answer a stored question has, for marking a student's answer (services/figures-steps.js). A number question: the
 *  OF.solve value of its answerKey (shown to 2 decimal places, as the answer is), else, while the figure is still exactly
 *  what its generator makes for its seed, the generator's value with the generator's dp and unit. A choice question: the
 *  index of the right option (worked out with OF.solve while it is linked to its generator) and its options. null when
 *  the question has no answer (the teacher has not chosen one, or a choice question has fewer than 2 options).
 *  -> { type?, value, dp, unit, choices? } | null */
export function answerOf(it, v) {
  if (!it || !kindOf(it.kind)) return null;
  if (it.answerType === 'choice') {
    const n = Array.isArray(it.choices) ? it.choices.length : 0;
    if (n < CHOICES.min || n > CHOICES.max) return null;
    const link = linkedGen(it.answerKey, it.kind);
    const pk = link && isGenChoices(link, it.choices) ? pickOf(link, it.kind, it.data, v) : undefined;
    const i = pk !== undefined ? pk : it.correct;
    return Number.isInteger(i) && i >= 0 && i < n ? { type: 'choice', value: i, dp: 0, unit: '', choices: it.choices.slice() } : null;
  }
  if (it.answerKey) {
    const x = solved(it.kind, it.data, v)[it.answerKey];
    if (typeof x === 'number' && Number.isFinite(x)) return { value: x, dp: 2, unit: keyUnit(it.answerKey, it.data) };
  }
  if (it.gen && it.seed) {
    const g = dealtFor(it.gen, it.seed, it.data, v);
    if (g && g.answerType === 'number' && canon(g.data) === canon(it.data) && typeof g.value === 'number' && Number.isFinite(g.value)) return { value: g.value, dp: g.dp, unit: g.unit };
  }
  return null;
}
/** The pinned Oomba Figures for a version (a stored step's of_version), or the current one. */
export const kitFor = v => kit(v);

/** A worksheet for its owner's page: its questions with their figures drawn (the screen's colors). */
export function worksheetView(u, id, { lang = 'en' } = {}) {
  const w = ownWorksheet(u, id); if (!w) return null;
  const F = kit(w.of_version);
  const items = itemsOf(w.id).map(it => ({ ...it, svg: F.svg(it.kind, it.data, { lang, hide: it.hide, title: it.question.slice(0, 120) || it.kind, width: 220 }), hasGen: !!(it.gen || kindOf(it.kind).gens.length) }));
  return { id: w.id, title: w.title, grade: w.grade, subject: w.subject, purpose: w.purpose, lessonId: w.lesson_id || null, ofVersion: w.of_version, lang: genLang(w.lang), updatedAt: w.updated_at, items };
}

// ---------------------------------------------------------------- print (student sheet and answer key)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/**
 * The printable page (a fragment): the student sheet (figures black on white, what the teacher hides left out, a blank
 * name and date line, an answer line under each question), then, when asked, the answer key on a page of its own (the
 * answers and worked lines, figures drawn in full). Nothing about any student. Every word is escaped here.
 * Only the worksheet's owner ever gets here (the route checks).
 */
export function printHtml(w, items, { t = tEn, lang = 'en', dir = 'ltr', key = false, sheet = true } = {}) {
  const F = kit(w.of_version);
  const fig = (it, full) => `<div class="fgp-fig">${F.svg(it.kind, it.data, { print: true, lang, hide: full ? false : it.hide, title: t('figures.print.figure', { n: it.n }) })}</div>`;
  const head = (h1, isKey) => `<header class="fgp-head"><h1 dir="auto">${esc(h1)}${isKey ? ` <span class="fgp-keytag">${esc(t('figures.print.keyTag'))}</span>` : ''}</h1>
<p class="fgp-lines"><span>${esc(t('figures.print.name'))} <i class="fgp-blank fgp-blank-name"></i></span><span>${esc(t('figures.print.date'))} <i class="fgp-blank"></i></span></p></header>`;
  const foot = `<footer class="fgp-foot">${esc(t('figures.print.made'))}</footer>`;
  const list = items.map((it, i) => ({ ...it, n: i + 1 }));
  // A choice question lists its options as A), B), C) with a box to tick; the key marks the right one and says its letter.
  const isChoice = it => it.answerType === 'choice' && Array.isArray(it.choices) && it.choices.length;
  const opts = (it, key) => `<ul class="fgp-choices" aria-label="${esc(t('figures.print.options'))}">${it.choices.map((c, i) => {
    const right = key && i === it.correct;
    return `<li${right ? ' class="fgp-right"' : ''}><i class="fgp-box" aria-hidden="true">${right ? '✓' : ''}</i><b class="fgp-letter">${letter(i)})</b> <span dir="auto">${esc(c)}</span>${right ? ` <span class="sr-only">${esc(t('figures.print.rightOne'))}</span>` : ''}</li>`; }).join('')}</ul>`;
  const blanks = '<p class="fgp-ans"><i class="fgp-blank fgp-wide"></i></p><p class="fgp-ans"><i class="fgp-blank fgp-wide"></i></p>';
  const q1 = it => `<li class="fgp-q" value="${it.n}"><div class="fgp-text"><p dir="auto">${esc(it.question || t('figures.print.noQuestion'))}</p>${isChoice(it) ? opts(it, false) : blanks}</div>${fig(it, false)}</li>`;
  const k1 = it => `<li class="fgp-q" value="${it.n}"><div class="fgp-text"><p dir="auto">${esc(it.question || t('figures.print.noQuestion'))}</p>${isChoice(it) ? opts(it, true) : ''}<p class="fgp-kans" dir="auto">${esc(it.answer || t('figures.print.noAnswer'))}</p>${it.work.length ? `<ul class="fgp-work">${it.work.map(x => `<li dir="auto">${esc(x)}</li>`).join('')}</ul>` : ''}</div>${fig(it, true)}</li>`;
  const sheetPage = sheet ? `<section class="fgp-page">${head(w.title, false)}<ol class="fgp-list">${list.map(q1).join('')}</ol>${foot}</section>` : '';
  const keyPage = key ? `<section class="fgp-page fgp-key">${head(w.title, true)}<ol class="fgp-list">${list.map(k1).join('')}</ol>${foot}</section>` : '';
  return `<div class="fgp" lang="${esc(lang)}" dir="${dir === 'rtl' ? 'rtl' : 'ltr'}" data-questions="${list.length}" data-key="${key ? 1 : 0}">${sheetPage}${keyPage}</div>`;
}

// ---------------------------------------------------------------- the teacher's presets and "Power with AI" switch
// A preset made in the editor's "Draw it" keeps its drawing too (the corners on the dot grid, its size and corner), so
// choosing it opens the drawing again. It is kept in the same JSON as the data, under _draw (a key no figure takes), and
// listPresets hands it back as draw beside the data.
const DRAW_SIZES = [6, 8, 10, 12, 16, 20];
const whole = v => Number.isInteger(v) && Math.abs(v) <= 40;
export function cleanDraw(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.pts) || d.pts.length < 3 || d.pts.length > 10) return null;
  if (!d.pts.every(p => Array.isArray(p) && p.length === 2 && p.every(whole))) return null;
  const n = DRAW_SIZES.includes(d.n) ? d.n : 10, o = Array.isArray(d.o) && d.o.length === 2 && d.o.every(whole) ? d.o : [0, 0];
  return { pts: d.pts.map(p => [p[0], p[1]]), n, o: [o[0], o[1]] };
}
export function listPresets(u, kind) {
  if (!canMake(u) || !kindOf(kind)) return [];
  return q.all('SELECT id, name, data FROM figure_presets WHERE owner_id=? AND kind=? ORDER BY created_at DESC LIMIT ?', u.id, kind, LIMITS.presets).map(r => {
    const data = json(r.data, {}), draw = cleanDraw(data._draw); delete data._draw;
    return { id: r.id, name: r.name, data, ...(draw ? { draw } : {}) };
  });
}
export function savePreset(u, { kind, name, data, draw } = {}) {
  if (!canMake(u)) return fail('notFound');
  const K = kindOf(kind); if (!K) return fail('badKind');
  const nm = clipStr(name, LIMITS.nameChars).replace(/\s+/g, ' ').trim();
  if (!nm) return fail('name');
  const tp = textProblem(nm); if (tp) return fail(tp);
  const c = cleanData(data); if (!c.data) return fail(c.code);
  const problems = checkFigure(K.id, c.data); if (problems.length) return fail('cannotDraw', { problems });
  if (q.get('SELECT COUNT(*) n FROM figure_presets WHERE owner_id=? AND kind=?', u.id, K.id).n >= LIMITS.presets) return fail('tooMany');
  const id = uid(12);
  const dr = cleanDraw(draw);
  q.run('INSERT INTO figure_presets(id, owner_id, kind, name, data, created_at) VALUES (?,?,?,?,?,?)', id, u.id, K.id, nm, JSON.stringify(dr ? { ...c.data, _draw: dr } : c.data), now());
  return ok({ preset: { id, name: nm, data: c.data, ...(dr ? { draw: dr } : {}) } });
}
export function deletePreset(u, id) {
  if (!canMake(u)) return fail('notFound');
  const r = q.run('DELETE FROM figure_presets WHERE id=? AND owner_id=?', String(id || ''), u.id);
  return r.changes ? ok() : fail('notFound');
}
/** "Power with AI", remembered per teacher (on until they turn it off). */
export const aiPref = u => { const r = u && q.get('SELECT ai FROM figure_prefs WHERE user_id=?', u.id); return r ? !!r.ai : true; };
export function setAiPref(u, onOff) {
  if (!canMake(u)) return fail('notFound');
  q.run('INSERT INTO figure_prefs(user_id, ai, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET ai=excluded.ai, updated_at=excluded.updated_at', u.id, onOff ? 1 : 0, now());
  return ok({ ai: !!onOff });
}

// ---------------------------------------------------------------- "Power with AI": draft a worksheet from a brief
/** Does the brief name one of the teacher's students (roster name, display name or username)? Names never go to the AI. */
export function namesIn(u, brief) {
  const words = new Set(String(brief || '').toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(w => w.length >= 3));
  const text = ` ${String(brief || '').toLowerCase().replace(/\s+/g, ' ')} `;
  const mine = S.classesOf(u.id, 'teacher');
  const admin = S.schoolsOf(u.id).filter(s => s.role === 'admin').flatMap(s => S.classesOfSchool(s.id));
  for (const c of [...mine, ...admin]) {
    for (const p of S.roster(c.id).filter(x => x.role === 'student')) {
      for (const n of [p.roster_name, p.display_name, p.username]) {
        const v = String(n || '').toLowerCase().trim(); if (v.length < 3) continue;
        if (words.has(v) || text.includes(` ${v} `) || v.split(/\s+/).some(part => part.length >= 3 && words.has(part))) return true;
      }
    }
  }
  return false;
}
/** The kinds the AI may choose from: those with a generator (so a bad item can always be repaired). */
export const draftKinds = () => KINDS.filter(K => K.gens.length);
/** A kind's parameter schema for the AI: each field of its example and its extra measures, with its type ('number',
 *  'text', 'bool', 'list', 'object') or its fixed list of values. */
export function paramSchema(K) {
  const out = {}, ex = (K && K.presets && K.presets[0]) || {};
  const typeOf = v => (typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'bool' : typeof v === 'string' ? 'text' : Array.isArray(v) ? 'list' : v && typeof v === 'object' ? 'object' : 'text');
  for (const [k, v] of Object.entries(ex)) out[k] = typeOf(v);
  for (const [k, v] of Object.entries(K.extra || {})) if (!(k in out)) out[k] = v;
  for (const [k, v] of Object.entries(K.options || {})) if (Array.isArray(v)) out[k] = v.filter(x => x !== '').slice(0, 12);
  return out;
}
/** The figure catalog (kinds with a generator, so a bad figure can always be repaired): id, subject, grade bands, a
 *  line about it, its parameter schema, its example and the OF.solve values (answerKey) the example gives. The worksheet
 *  drafter, the test drafter and the lesson drafter (services/lesson-ai.js) are all shown this, and only this. */
export function figureCatalog({ subject = '' } = {}) {
  return draftKinds().filter(K => !subject || K.subject === subject || (K.also || []).includes(subject)).map(K => ({
    id: K.id, subject: K.subject, grades: K.grades.slice(), description: tEn(`figures.kinds.${K.id}.desc`), params: paramSchema(K), example: K.presets[0],
    keys: Object.keys(solved(K.id, K.presets[0])).slice(0, 14),
  }));
}
/** One catalog entry as a line of the prompt. */
export const catalogLine = c => `- ${c.id} (${c.subject}; grades ${c.grades.join(', ')}): ${c.description}. Parameters: ${JSON.stringify(c.params)}. Example data: ${JSON.stringify(c.example)}.${c.keys.length ? ` answerKey choices for the example: ${c.keys.join(', ')}.` : ' (no answerKey: leave it "")'}`;
/** The catalog the AI is shown: each kind's id, what it draws, its parameters, its example data and the answers OF.solve can give. */
export function draftCatalog(opts) { return figureCatalog(opts).map(catalogLine).join('\n'); }
const DRAFT_SCHEMA = () => ({
  type: 'object', additionalProperties: false, required: ['title', 'items'],
  properties: {
    title: { type: 'string' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'question', 'data', 'answerType', 'answerKey', 'choices', 'correct'], properties: {
      kind: { type: 'string', enum: draftKinds().map(K => K.id) }, question: { type: 'string' }, data: { type: 'string' }, answerType: { type: 'string', enum: ['number', 'choice'] },
      answerKey: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, correct: { type: 'integer' } } } },
  },
});
function draftPrompt({ brief, grade, count, lang = 'en' }) {
  return [
    'You are drafting a printable worksheet of figure questions for a teacher on Oomba Academy. Each question has one figure drawn by Oomba Figures from data you give.',
    `Write the title, the questions and the options in ${LANG_NAMES[genLang(lang)]}, plain and clear for grade ${grade || 'the grade in the brief'} students. No names of people, no links, no brands.`,
    `Make exactly ${count} questions, different from each other, that fit the brief. Only use kinds from this catalog, and give each figure's data as JSON text in "data" with the same fields as the example (change the numbers and words to fit the question). Never draw or describe SVG.`,
    'Every figure must be drawable truthfully to scale: numbers that cannot make the figure are rejected and replaced.',
    'answerType "number" (most questions): answerKey is the name of the OF.solve value that answers the question (one of the kind\'s answerKey choices, for example "area" or "sides.CA"); choices [] and correct 0. You never work a number out yourself: Oomba Figures does. Numbers may be negative.',
    `answerType "choice" only for a question whose answer is a word, not a number (which way, which kind, which pattern, true or false): choices are ${CHOICES.min} to ${CHOICES.max} short, different options (under ${CHOICES.chars} characters each) and correct is the index of the one right option (0 for the first); answerKey "". The figure must show the answer plainly. Never ask for a number as a choice.`,
    'question: one or two short sentences. title: a short title for the worksheet (under 60 characters).',
    `Catalog:\n${draftCatalog()}`,
    `<brief>\n${brief}\n</brief>`,
  ].join('\n\n');
}
const KEYWORDS = [
  [/\barea\b/, ['rectangle', 'parallelogram', 'trapezoid', 'compositeShape', 'triangle']], [/\bvolume|prism|cylinder|cone|sphere|solid/, ['prism', 'cylinder', 'cone', 'pyramid', 'sphere']],
  [/surface|\bnet/, ['net', 'sphere']], [/pythag|hypotenuse|triangle/, ['triangle']], [/angle|protractor/, ['angles', 'parallelLines', 'protractor', 'circle']],
  [/polygon/, ['regularPolygon']], [/perimeter/, ['rectangle', 'kite']], [/fraction|number line/, ['numberLine']], [/coordinate|reflect|transform|grid/, ['grid']],
  [/bar graph|bar chart/, ['barGraph']], [/dot plot|line plot/, ['dotPlot']], [/histogram/, ['histogram']], [/box plot|quartile|iqr/, ['boxPlot']], [/scatter|best fit|correlation/, ['scatterPlot']],
  [/stem/, ['stemAndLeaf']], [/pie|circle graph/, ['pieChart']], [/cumulative/, ['cumulativeFrequency']], [/normal|z-score/, ['normalCurve']], [/probab|tree/, ['treeDiagram', 'vennDiagram']],
  [/venn/, ['vennDiagram']], [/two-way|table/, ['twoWayTable', 'tableOfValues']], [/mean|median|mode|range|statistic|data/, ['dotPlot', 'stemAndLeaf', 'boxPlot', 'barGraph']],
  [/force|newton/, ['freeBody', 'inclinedPlane', 'pulley']], [/vector/, ['vectors']], [/slope|incline|ramp/, ['inclinedPlane']], [/pulley/, ['pulley']], [/lens|mirror|optic|light|ray/, ['rays']],
  [/circuit|resist|current|voltage/, ['circuit']], [/motion|speed|velocity|acceleration/, ['motionGraph', 'motionMap']], [/projectile|launch/, ['projectile']], [/wave/, ['waves']],
  [/measur|ruler|caliper|micrometer|thermometer|temperature/, ['reading']], [/atom|electron|bohr|shell/, ['bohr']], [/half-life|half life|decay|radioactiv/, ['halfLife']],
  // biology (1.3.0)
  [/population|carrying capacity|logistic|exponential growth/, ['populationGrowth']], [/predator|prey|lotka/, ['predatorPrey']], [/enzyme|denatur|substrate/, ['enzymeActivity']],
  [/photosynth|limiting factor/, ['photosynthesis']], [/punnett|genotype|phenotype|allele|dominant|recessive|mendel/, ['punnett']], [/pedigree|inheritance|heredit/, ['pedigree']],
  [/transcription|translation|codon|mrna|protein synthesis|\bdna\b/, ['proteinSynthesis']], [/electrophoresis|\bgel\b|dna fingerprint/, ['gel']], [/osmosis|tonicity|hypertonic|hypotonic|diffusion/, ['osmosis']], [/pipette/, ['reading']],
  // chemistry (1.5.0)
  [/skeletal|structural formula|condensed formula|organic|hydrocarbon|alkane|alkene|alkyne|functional group|isomer/, ['skeletal']], [/energy level|electron transition|emission line|balmer|lyman|photon/, ['energyLevels']],
  // economics (1.4.0)
  [/supply and demand|demand curve|supply curve|equilibrium price|price ceiling|price floor|shortage|consumer surplus|producer surplus|deadweight|tax incidence/, ['supplyDemand']],
  [/money market|money supply|loanable funds|interest rate|reserves|monetary policy/, ['moneyMarket']], [/business cycle|recession|peaks? and troughs?/, ['businessCycle']],
  [/phillips|unemployment|inflation/, ['phillipsCurve']], [/production possibilit|\bppc\b|opportunity cost|comparative advantage/, ['possibilitiesCurve']],
  [/aggregate demand|aggregate supply|\bad-as\b|output gap|recessionary gap|inflationary gap|fiscal policy/, ['adAs']], [/marginal cost|average total cost|cost curves?|monopol|perfect competition|profit maxim/, ['costCurves']],
];
/** The kinds a topic's words point at (KEYWORDS), [] when none. */
export const topicKinds = text => [...new Set(KEYWORDS.filter(([re]) => re.test(String(text || '').toLowerCase())).flatMap(([, ks]) => ks))];
/** A plain starter set without the AI: kinds the brief's words point at (else its subject's), within its grade band. */
export function templateItems({ brief = '', grade = '', count = 6, lang = 'en' } = {}) {
  const b = String(brief).toLowerCase(), band = bandOf(grade || (/\bgrade\s*(\d{1,2}|k)\b/i.exec(b) || [])[1] || '');
  let ids = [...new Set(KEYWORDS.filter(([re]) => re.test(b)).flatMap(([, ks]) => ks))];
  if (!ids.length) {
    const subj = /physic/.test(b) ? 'physics' : /chem/.test(b) ? 'chem' : /biolog|life science|genetic|cell/.test(b) ? 'biology' : /econom|macro|micro/.test(b) ? 'economics' : /data|statistic|probab|graph/.test(b) ? 'data' : 'math';
    ids = draftKinds().filter(K => K.subject === subj).map(K => K.id);
  }
  let kinds = ids.map(kindOf).filter(K => K && K.gens.length);
  if (band && kinds.some(K => K.grades.includes(band))) kinds = kinds.filter(K => K.grades.includes(band));
  const out = [];
  for (let i = 0; out.length < count && i < count * 4; i++) {
    const K = kinds[i % kinds.length], gid = K.gens[Math.floor(i / kinds.length) % K.gens.length].id;
    const c = cleanItem({ kind: K.id, gen: gid, seed: newSeed() }, undefined, lang); if (c.ok) out.push(c.item);
  }
  return out;
}
export function bandOf(g) {
  const s = String(g || '').trim().toUpperCase();
  if (!s) return '';   // no grade: every band (Number('') is 0, which read as K-2)
  if (GRADE_BANDS.includes(s)) return s;
  if (s === 'K' || s === '1' || s === '2') return 'K-2';
  const n = Number(s); if (!Number.isInteger(n)) return '';
  return n <= 2 ? 'K-2' : n <= 5 ? '3-5' : n <= 8 ? '6-8' : n <= 12 ? '9-12' : '';
}
const logRepair = fields => (hooks.log ? hooks.log(fields) : log('warn', 'figures.draft.repair', fields));
/**
 * The AI's items made safe: a kind not in the catalog is dropped; data that does not pass OF.check, an answerKey that is
 * not one of the figure's OF.solve values, a choice question whose options are not 2 to 6 short different ones with one
 * marked right, or words that are not allowed (options too): the item is replaced by a fresh question from that kind's
 * generator. Every repair is logged (the kind and why, never the brief). -> { items, repaired, dropped }
 */
export function repairDraft(raw, { max = LIMITS.draftMax, lang = 'en' } = {}) {
  const items = [], allowed = new Set(draftKinds().map(K => K.id));
  let repaired = 0, dropped = 0;
  for (const [i, x] of (Array.isArray(raw) ? raw : []).slice(0, max).entries()) {
    const kind = x && typeof x.kind === 'string' ? x.kind : '';
    if (!allowed.has(kind)) { dropped++; logRepair({ item: i, kind: clipStr(kind, 30), action: 'dropped', why: 'not in the catalog' }); continue; }
    const data = typeof (x && x.data) === 'string' ? json(x.data, null) : x && x.data;
    const choice = x && x.answerType === 'choice';
    let keyOk, c;
    if (choice) {
      // Options as given: 2 to 6, each a short non-empty string, all different, one of them right (no blank left out).
      const list = Array.isArray(x.choices) ? x.choices : [];
      const shape = list.length >= CHOICES.min && list.length <= CHOICES.max && list.every(o => typeof o === 'string' && o.trim() && o.trim().length <= CHOICES.chars) && Number.isInteger(x.correct) && x.correct >= 0 && x.correct < list.length;
      c = data ? cleanItem({ kind, data, question: x.question, answerType: 'choice', choices: list, correct: x.correct, hide: false }, undefined, lang) : fail('badData');
      keyOk = shape && c.ok && c.item.choices.length === list.length && c.item.correct === x.correct;
      if (!shape && c.ok) c = fail('choices: 2 to 6 short different options and the index of the right one');
    } else {
      keyOk = data && typeof x.answerKey === 'string' && typeof solved(kind, data)[x.answerKey] === 'number';
      c = data ? cleanItem({ kind, data, question: x.question, answerKey: x.answerKey, hide: false }, undefined, lang) : fail('badData');
    }
    if (c.ok && keyOk && c.item.question) { items.push(c.item); continue; }
    const why = !data ? 'data is not JSON' : c.code === 'cannotDraw' ? `OF.check: ${c.problems[0]}` : !c.ok ? c.code : !keyOk ? (choice ? 'choices: 2 to 6 short different options and the index of the right one' : 'answerKey is not an OF.solve value') : 'no question';
    const K = kindOf(kind), gid = K.gens[0].id, g = cleanItem({ kind, gen: gid, seed: newSeed() }, undefined, lang);
    if (g.ok) { items.push(g.item); repaired++; logRepair({ item: i, kind, action: 'replaced by its generator', why: clipStr(why, 200) }); }
    else { dropped++; logRepair({ item: i, kind, action: 'dropped', why: clipStr(why, 200) }); }
  }
  return { items, repaired, dropped };
}
/**
 * "Power with AI" -> { ok, ai, added, repaired, dropped } (the questions are added to the worksheet; the teacher edits
 * them before anything else happens). Claude drafts from the catalog only; answers come from OF.solve. Without a key, or
 * while the AI budget is resting, or when the call fails, a template set from the generators is added instead (ai: false).
 */
export async function draftWorksheet(u, id, { brief, grade = '', count = 6 } = {}) {
  const w = ownWorksheet(u, id); if (!w) return fail('notFound');
  const b = clipStr(brief, LIMITS.briefChars).replace(/\s+/g, ' ').trim();
  if (b.length < 3) return fail('brief');
  const p = textProblem(b); if (p) return fail(p);
  if (namesIn(u, b)) return fail('names');
  const have = q.get('SELECT COUNT(*) n FROM question_set_items WHERE set_id=?', w.id).n;
  const n = Math.max(1, Math.min(LIMITS.draftMax, LIMITS.items - have, Number.isInteger(+count) ? +count : 6));
  if (LIMITS.items - have <= 0) return fail('fullSheet');
  const g = cleanGrade(grade) || w.grade;
  const client = hooks.create ? { messages: { create: hooks.create } } : anthropic();
  let items = null, ai = false, repaired = 0, dropped = 0, title = '', reason = client ? 'error' : 'resting';
  if (client) {
    const t0 = Date.now();
    try {
      const res = await callAi(client, {
        model: config.builderModel, max_tokens: 6000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: DRAFT_SCHEMA() } },
        messages: [{ role: 'user', content: draftPrompt({ brief: b, grade: g, count: n, lang: w.lang }) }],
      });
      if (res && res.usage) aiBudget.recordUsage(res.model || config.builderModel, res.usage);
      const block = ((res && res.content) || []).find(c => c.type === 'text');
      const d = JSON.parse(block ? block.text : '');
      const r = repairDraft(d && d.items, { max: n, lang: w.lang });
      if (r.items.length) { ({ items, repaired, dropped } = r); ai = true; title = d && typeof d.title === 'string' ? d.title : ''; }
    } catch (e) { reason = fallbackReason(logAiFail('figures worksheet draft ai failed', { sheet: w.id }, e, t0)); }
  }
  if (!items) items = templateItems({ brief: b, grade: g, count: n, lang: w.lang });
  items.forEach((it, i) => storeItem(w.id, have + i, it));
  if (title && w.title === tEn('figures.sheet.untitled')) { const tt = cleanTitle(title, ''); if (tt) q.run('UPDATE question_sets SET title=? WHERE id=?', tt, w.id); }
  if (g && !w.grade) q.run('UPDATE question_sets SET grade=? WHERE id=?', g, w.id);
  resubject(w.id); touch(w.id);
  audit(u.id, 'figures.draft', w.id, { ai, added: items.length, repaired, dropped });
  return ok({ ai, added: items.length, repaired, dropped, ...(ai ? {} : { reason }) });
}

// ---------------------------------------------------------------- "Build a test" (purpose 'test')
// A test is drafted from a topic, a grade and a subject. With "Power with AI" on, Claude picks question GENERATORS from
// the catalog (each question is then dealt here with a fresh seed, so the teacher can re-deal it), and may write its
// own figure question only when no generator fits (checked exactly like a worksheet draft: repairDraft). With AI off,
// or without a key, while the budget rests or when the call fails, a starter test is dealt from the generators the
// topic's words point at, within the subject and grade band. Either way the test is only a draft: nothing is assigned
// until the teacher assigns it (services/figures-steps.js assignWorksheet).
/** The AI client: the test hook (only while the AI budget is not resting, like the real client), or the real one. */
const aiClient = () => (hooks.create ? (aiBudget.ok() ? { messages: { create: hooks.create } } : null) : anthropic());
/** The generators the test drafter may pick: id, kind, subject, grade bands, number or choice, and its question. */
export function genCatalog({ subject = '', grade = '' } = {}) {
  const band = bandOf(grade);
  const kinds = draftKinds().filter(K => !subject || K.subject === subject || (K.also || []).includes(subject));
  const fit = band && kinds.some(K => K.grades.includes(band)) ? kinds.filter(K => K.grades.includes(band)) : kinds;
  return fit.flatMap(K => K.gens.map(g => ({ id: g.id, kind: K.id, subject: K.subject, grades: K.grades.slice(), type: g.tool === 'figure.choice' ? 'choice' : 'number', question: String(g.q || '').slice(0, 160), description: tEn(`figures.kinds.${K.id}.desc`) })));
}
const TEST_SCHEMA = () => ({
  type: 'object', additionalProperties: false, required: ['title', 'items'],
  properties: {
    title: { type: 'string' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['gen', 'kind', 'question', 'data', 'answerType', 'answerKey', 'choices', 'correct'], properties: {
      gen: { type: 'string' }, kind: { type: 'string' }, question: { type: 'string' }, data: { type: 'string' }, answerType: { type: 'string', enum: ['number', 'choice'] },
      answerKey: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, correct: { type: 'integer' } } } },
  },
});
function testPrompt({ topic, grade, subject, count, lang = 'en' }) {
  const gens = genCatalog({ subject, grade });
  return [
    'You are drafting a test of figure questions for a teacher on Oomba Academy. Each question has one figure drawn by Oomba Figures.',
    `Write the title and any question or option of your own in ${LANG_NAMES[genLang(lang)]} (the generators already speak it), plain and clear for grade ${grade || 'the grade the topic suits'} students. No names of people, no links, no brands.`,
    `Make exactly ${count} questions that fit the topic, different from each other, from easier to harder.`,
    'Prefer generators: put a generator id from the list below in "gen" and leave kind, question, data and answerKey "" (choices [], answerType "number", correct 0). Oomba Figures deals the numbers and works out the answer, so the teacher can deal new numbers for any question. Use each generator at most twice.',
    'Only when no generator fits the topic: gen "" and write your own figure question from the figure catalog (kind, question, data as JSON text with the same fields as the example, answerType and answerKey from the kind\'s answerKey choices, or answerType "choice" with 2 to 6 short options and the index of the right one). Never draw or describe SVG. Figures that cannot be drawn truthfully to scale are replaced.',
    'title: a short title for the test (under 60 characters).',
    `Generators:\n${gens.map(g => `- ${g.id} (figure ${g.kind}; ${g.subject}; grades ${g.grades.join(', ')}; ${g.type} answer): ${g.question}`).join('\n')}`,
    `Figure catalog:\n${draftCatalog({ subject })}`,
    `<topic>\n${topic}\n</topic>`,
  ].join('\n\n');
}
/** A generator's question in a language, dealt with a fresh seed (a few tries: a seed can fail a generator's own where). */
function dealt(gid, lang = 'en') {
  const g = genOf(gid); if (!g) return null;
  for (let i = 0; i < 6; i++) { const c = cleanItem({ kind: g.kind, gen: gid, seed: newSeed() }, undefined, lang); if (c.ok) return c.item; }
  return null;
}
/**
 * The test drafter's items made safe: a generator that is not in the catalog (or not of the chosen subject) is dropped;
 * a generator question is dealt here (fresh seed); an own figure question goes through repairDraft (OF.check, OF.solve
 * keys, choices, words: replaced by its kind's generator). Every repair is logged (the kind and why, never the topic).
 * -> { items, repaired, dropped }
 */
export function repairTestDraft(raw, { max = LIMITS.draftMax, subject = '', grade = '', lang = 'en' } = {}) {
  const allowed = new Set(genCatalog({ subject, grade }).map(g => g.id)), items = [];
  let repaired = 0, dropped = 0;
  for (const [i, x] of (Array.isArray(raw) ? raw : []).slice(0, max).entries()) {
    const gid = x && typeof x.gen === 'string' ? x.gen.trim() : '';
    if (gid) {
      if (!allowed.has(gid)) { dropped++; logRepair({ item: i, kind: clipStr(gid, 40), action: 'dropped', why: 'generator not in the catalog' }); continue; }
      const it = dealt(gid, lang);
      if (it) items.push(it); else { dropped++; logRepair({ item: i, kind: genOf(gid).kind, action: 'dropped', why: 'the generator dealt nothing' }); }
      continue;
    }
    const r = repairDraft([x], { max: 1, lang });
    items.push(...r.items); repaired += r.repaired; dropped += r.dropped;
  }
  return { items, repaired, dropped };
}
/** A starter test without the AI: the generators the topic's words point at, in the subject (if any) and grade band. */
export function templateTest({ topic = '', subject = '', grade = '', count = 6, lang = 'en' } = {}) {
  const cat = genCatalog({ subject, grade }), hit = new Set(topicKinds(topic));
  let pool = cat.filter(g => hit.has(g.kind));
  if (!pool.length) pool = cat;
  const out = [];
  for (let i = 0; out.length < count && i < count * 4 && pool.length; i++) { const it = dealt(pool[i % pool.length].id, lang); if (it) out.push(it); }
  return out;
}
/**
 * "Build a test with AI" -> { ok, ai, added, repaired, dropped }: the questions are added to the test (a question set of
 * purpose 'test'); the teacher edits them before anything is assigned. Usage counts towards the AI budget; without a key
 * or while it rests, or when the call fails, a starter test is dealt from the generators instead (ai: false).
 */
export async function draftTest(u, id, { topic, grade = '', subject = '', count = 8 } = {}) {
  const w = ownWorksheet(u, id); if (!w || w.purpose !== 'test') return fail('notFound');
  const b = clipStr(topic, LIMITS.briefChars).replace(/\s+/g, ' ').trim();
  if (b.length < 3) return fail('topic');
  const p = textProblem(b); if (p) return fail(p);
  if (namesIn(u, b)) return fail('names');
  const subj = SUBJECTS.includes(subject) ? subject : '';
  const have = q.get('SELECT COUNT(*) n FROM question_set_items WHERE set_id=?', w.id).n;
  if (LIMITS.items - have <= 0) return fail('fullSheet');
  const n = Math.max(1, Math.min(LIMITS.draftMax, LIMITS.items - have, Number.isInteger(+count) ? +count : 8));
  const g = cleanGrade(grade) || w.grade;
  const client = aiClient();
  let items = null, ai = false, repaired = 0, dropped = 0, title = '', reason = client ? 'error' : 'resting';
  if (client) {
    const t0 = Date.now();
    try {
      const res = await callAi(client, {
        model: config.builderModel, max_tokens: 6000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: TEST_SCHEMA() } },
        messages: [{ role: 'user', content: testPrompt({ topic: b, grade: g, subject: subj, count: n, lang: w.lang }) }],
      });
      if (res && res.usage) aiBudget.recordUsage(res.model || config.builderModel, res.usage);
      const block = ((res && res.content) || []).find(c => c.type === 'text');
      const d = JSON.parse(block ? block.text : '');
      const r = repairTestDraft(d && d.items, { max: n, subject: subj, grade: g, lang: w.lang });
      if (r.items.length) { ({ items, repaired, dropped } = r); ai = true; title = d && typeof d.title === 'string' ? d.title : ''; }
    } catch (e) { reason = fallbackReason(logAiFail('figures test draft ai failed', { sheet: w.id, subject: subj }, e, t0)); }
  }
  if (!items) { items = templateTest({ topic: b, subject: subj, grade: g, count: n, lang: w.lang }); if (!title) title = b; }
  items.forEach((it, i) => storeItem(w.id, have + i, it));
  if (title && w.title === tEn('figures.sheet.untitledTest')) { const tt = cleanTitle(title, ''); if (tt) q.run('UPDATE question_sets SET title=? WHERE id=?', tt, w.id); }
  if (g && !w.grade) q.run('UPDATE question_sets SET grade=? WHERE id=?', g, w.id);
  resubject(w.id); touch(w.id);
  audit(u.id, 'figures.test.draft', w.id, { ai, added: items.length, repaired, dropped });
  return ok({ ai, added: items.length, repaired, dropped, ...(ai ? {} : { reason }) });
}

// ---------------------------------------------------------------- a lesson step's snapshot, back into a set
/** A snapshot question (services/figures-steps.js snapshot) as a set question again, for "Edit questions" on a lesson's
 *  Figure step: its generator and seed while it has them, the answerKey (an older snapshot without one: the OF.solve
 *  value that equals the stored answer), the right option of a choice question. */
export function fromSnapshot(it, v) {
  const choice = it && it.type === 'choice';
  let key = typeof it.answerKey === 'string' ? it.answerKey : null;
  if (!choice && !key && !it.gen && typeof it.value === 'number') {
    const nums = solved(it.kind, it.data, v);
    key = Object.keys(nums).find(k => Math.abs(nums[k] - it.value) <= 1e-9 * Math.max(1, Math.abs(it.value))) || null;
  }
  return { kind: it.kind, data: it.data, hide: it.hide === undefined ? false : it.hide, question: String(it.question || ''), gen: it.gen || null, seed: it.seed || null,
    answerType: choice ? 'choice' : 'number', ...(choice ? { choices: it.choices, correct: it.value } : {}), ...(key ? { answerKey: key } : choice && it.answerKey ? { answerKey: it.answerKey } : {}) };
}

// ---------------------------------------------------------------- thumbnails (the menu's cards), cached
// A card is about 1.4 times as wide as it is tall. A kind whose example is a long strip (a number line, a motion map,
// an orbital diagram) would be a thin line on its card, so its card stacks two or three of its examples instead (its
// other presets, then THUMB_MORE), centered, until the picture is about as tall as the card. Every extra is checked with
// OF.check and left out if it cannot be drawn. The figures stay Oomba Figures' own drawings (cream paper, Ink lines,
// Mint fills, Leaf accents); nothing is cropped.
const THUMB_MORE = {
  motionMap: [{ segments: [{ kind: 'forward', speed: 1, duration: 2 }, { kind: 'forward', speed: 3, duration: 2 }], dt: 1, labels: 'times' }],
  segmentAddition: [{ points: ['P', 'Q', 'R'], unknown: { y: 4 }, parts: [{ expr: [3, 0] }, { expr: [1, 5] }], spans: [{ from: 'P', to: 'R', label: 21 }] }],
  tableOfValues: [{ rule: 'x^2', from: 0, to: 4 }],
  projectile: [{ speed: 15, angle: 60, height: 0, g: 9.8, positions: 3 }],
};
const WIDE = 3, ENOUGH = 1.9;
const sizeOf = svg => { const m = /viewBox="([^"]+)"/.exec(svg); const v = m ? m[1].trim().split(/\s+/).map(Number) : []; return v.length === 4 && v.every(Number.isFinite) ? v : null; };
/** One figure inside the stack: its own <svg> at (x, y), its title left out (the stack has one). */
const placed = (svg, x, y) => { const v = sizeOf(svg); return `<svg x="${x}" y="${y}" width="${v[2]}" height="${v[3]}" viewBox="${v.join(' ')}">${svg.replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>/, '')}</svg>`; };
export function thumbSvg(K, lang = 'en') {
  const F = kit(), title = tEn(`figures.kinds.${K.id}.name`);
  const first = F.svg(K.id, K.presets[0], { lang, title }), v0 = sizeOf(first);
  if (!v0 || v0[2] / v0[3] <= WIDE) return first;
  const rows = [first];
  for (const d of [...K.presets.slice(1), ...(THUMB_MORE[K.id] || [])]) {
    const W = Math.max(...rows.map(r => sizeOf(r)[2])), H = rows.reduce((n, r) => n + sizeOf(r)[3], 0);
    if (rows.length >= 3 || W / H <= ENOUGH) break;
    let bad; try { bad = F.check(K.id, d); } catch { bad = ['error']; }
    if (bad.length) continue;
    const svg = F.svg(K.id, d, { lang, title }), v = sizeOf(svg);
    if (v && v[2] / v[3] > 1.2) rows.push(svg);
  }
  if (rows.length === 1) return first;
  const GAP = 16, W = Math.max(...rows.map(r => sizeOf(r)[2]));
  let y = 0; const parts = rows.map(r => { const v = sizeOf(r), out = placed(r, Math.round((W - v[2]) / 2), y); y += v[3] + GAP; return out; });
  const H = y - GAP, font = (/font-family="([^"]*)"/.exec(first) || [])[1] || 'system-ui, sans-serif';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}" class="of-fig of-thumb" font-family="${font}" data-of="${K.id}"><title>${esc(title)}</title>${parts.join('')}</svg>`;
}
const thumbs = new Map();
/** A kind's card picture: its example drawn by the server's pinned Oomba Figures, once per kind and language. */
export function thumbnail(kind, lang = 'en') {
  const K = kindOf(kind); if (!K) return null;
  const k = `${K.id}|${lang}`;
  if (!thumbs.has(k)) thumbs.set(k, thumbSvg(K, lang));
  return thumbs.get(k);
}

// ---------------------------------------------------------------- cleanup
/** An account is deleted (services/account-delete.js): their worksheets, presets and switch. */
export function forgetUser(userId) {
  q.run('DELETE FROM question_set_items WHERE set_id IN (SELECT id FROM question_sets WHERE owner_id=?)', userId);
  q.run('DELETE FROM question_sets WHERE owner_id=?', userId);
  q.run('DELETE FROM figure_presets WHERE owner_id=?', userId);
  q.run('DELETE FROM figure_prefs WHERE user_id=?', userId);
  forgetChats(userId);
}
/** For Oomba's chat on a worksheet (services/figures-chat.js): the sheet's own writers, used inside its transactions. */
export const _sheet = Object.freeze({ storeItem, rewrite, touch, resubject, cleanGrade, cleanTitle, canon, rowItem });
