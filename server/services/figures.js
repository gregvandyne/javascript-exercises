// Figures, the standalone product (docs/decisions.md "Figures, the standalone product"; routes/figures.js): the menu of
// figure kinds, one editor for every kind, worksheets of figure questions (print a student sheet and an answer key), the
// teacher's own presets, and "Power with AI" (a worksheet drafted from a brief). Hidden while it is tested
// (config.figures), exactly like the manipulatives.
//
// Who may use it: the platform admin, and school staff whose username is in MANIPULATIVES_USERS (the same tester list as
// the manipulatives); never a guest, a banned account or a grown-up (family) account. Everyone else gets the normal 404,
// on the pages and on every API. Students never open /figures (assigning a worksheet to a class is next: see the
// decision record).
// What each person sees: a worksheet is its owner's. Only the owner lists, opens, edits, prints (the student sheet and
// the answer key) or deletes it; for anyone else it is the same 404 as a wrong id. A preset is its owner's too.
// Every figure that is saved passed OF.check on the server with the pinned Oomba Figures version, and every answer is
// worked out here: from OF.solve (a generator's answer is the OF.solve value it names), never from the browser or the AI.
// Text a teacher types (a title, a question, a brief) is checked with the site's word and personal-information rules.
// The AI never sees students' names: a brief that names a student of the teacher's classes is refused.
import { q, uid, now, audit } from '../db.js';
import { config } from '../config.js';
import { isGrownup } from '../auth.js';
import * as S from './schools.js';
import { anthropic } from '../builder/anthropic.js';
import * as aiBudget from './ai-budget.js';
import { hasProfanity, personalInfo } from './textfilter.js';
import { figuresKit, FIG_LATEST, FIG_VERSIONS } from './figlibs.js';
import { canvasKit } from './canvaskit.js';
import { log } from './log.js';
import { tEn } from '../i18n/index.js';
import { KINDS, SUBJECTS, GRADE_BANDS, kindOf, genOf, flatSolve, solveOf, numText } from '../../public/js/figures-catalog.js';

export { KINDS, SUBJECTS, GRADE_BANDS, kindOf, genOf };
export const LIMITS = Object.freeze({ worksheets: 200, items: 40, presets: 50, titleChars: 80, questionChars: 400, briefChars: 1000, dataChars: 20000, nameChars: 60, draftMax: 12 });
/** Test hooks: create replaces the AI client's messages.create (no network in tests); log receives each repair. */
export const hooks = { create: null, log: null };
const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, extra = {}) => ({ ok: false, code, ...extra });
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const clipStr = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, '').slice(0, n);

// ---------------------------------------------------------------- who may use it
export const on = () => !!config.figures;
/** May this account make figures and worksheets? The manipulatives' host rule, with the same tester list. */
export function canMake(u) {
  if (!on() || !u || u.is_guest || u.banned || isGrownup(u)) return false;
  if (S.isPlatformAdmin(u)) return true;
  return config.manipulativesUsers.includes(String(u.username || '').toLowerCase()) && S.isSchoolStaff(u);
}
/** 'teacher' | null (null: the normal 404). */
export const roleOf = u => (canMake(u) ? 'teacher' : null);

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
const unitText = (v, unit) => (unit ? (/^[°′″%]/.test(unit) ? `${v}${unit}` : `${v} ${unit}`) : String(v));

/** The numbers OF.solve gives for this figure, by path ({ 'sides.CA': 5, area: 6 }); {} for a kind without them. */
export const solved = (kind, data, v) => flatSolve(solveOf(kit(v), kind, data) || {});

const L = () => canvasKit().logic;
/** A generator's question with this seed: { kind, data, hide, question, answer, work, unit, dp } or null. The answer is
 *  the OF.solve value the generator names (key); a generator for a kind without a solver keeps its own formula. */
export function generate(genId, seed, v) {
  const g = genOf(genId), lg = L();
  if (!g || !lg.TOOLS[g.tool]) return null;
  const s = Number.isInteger(seed) && seed > 0 ? seed : 1;
  const c = lg.cleanProblem(lg.TOOLS[g.tool].gen(lg.seeded(s), g));
  if (!c.p || !c.p.fig) return null;
  const { kind, hide, ...data } = c.p.fig;
  if (kind !== g.kind || checkFigure(kind, data, v).length) return null;
  const dp = Number.isInteger(c.p.dp) ? c.p.dp : 2;
  const fromSolve = g.key ? solved(kind, data, v)[g.key] : undefined;
  const value = typeof fromSolve === 'number' ? fromSolve : c.p.answer;
  return { kind, data, hide: cleanHide(kindOf(kind), hide === undefined ? false : hide), question: String(c.p.q || ''), answer: unitText(numText(value, dp), c.p.unit || ''), work: (c.p.work || []).map(String).slice(0, 8), unit: c.p.unit || '', dp, value };
}
export const newSeed = () => 1 + Math.floor(Math.random() * 999999);

/**
 * One worksheet question as it may be stored, worked out here from what the browser sent (never trusting its answer or
 * worked lines). An item from a generator keeps the generator's question, answer and worked lines while its data is
 * exactly what that generator makes for its seed; once the teacher changes the figure it is a figure of their own,
 * answered from OF.solve by answerKey. -> { ok, item } | { ok: false, code, problems? }
 */
export function cleanItem(raw, v) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const K = kindOf(r.kind); if (!K) return fail('badKind');
  const question = clipStr(r.question, LIMITS.questionChars).replace(/\s+/g, ' ').trim();
  const tp = textProblem(question); if (tp) return fail(tp);
  const seed = Number.isInteger(r.seed) && r.seed > 0 && r.seed < 1e9 ? r.seed : null;
  const g = typeof r.gen === 'string' && genOf(r.gen) && genOf(r.gen).kind === K.id && seed ? generate(r.gen, seed, v) : null;
  let data;
  if (r.data === undefined && g) data = g.data;
  else { const c = cleanData(r.data); if (!c.data) return fail(c.code); data = c.data; }
  const problems = checkFigure(K.id, data, v);
  if (problems.length) return fail('cannotDraw', { problems: problems.slice(0, 5) });
  const fromGen = g && canon(g.data) === canon(data);
  const nums = solved(K.id, data, v);
  const key = typeof r.answerKey === 'string' && typeof nums[r.answerKey] === 'number' ? r.answerKey : null;
  const hide = r.hide === undefined && fromGen ? g.hide : cleanHide(K, r.hide);
  const base = { kind: K.id, data, hide, question: question || (fromGen ? g.question : ''), answerKey: key };
  const keyAnswer = key ? unitText(numText(nums[key], 2), keyUnit(key, data)) : '';
  if (fromGen) return ok({ item: { ...base, gen: r.gen, seed, answer: key ? keyAnswer : g.answer, work: key ? [] : g.work } });
  return ok({ item: { ...base, gen: null, seed: null, answer: keyAnswer, work: [] } });
}

// ---------------------------------------------------------------- worksheets (question sets, purpose 'worksheet')
const cleanTitle = (s, d) => { const v = clipStr(s, LIMITS.titleChars).replace(/\s+/g, ' ').trim(); return v && !textProblem(v) ? v : d; };
const cleanGrade = g => (GRADE_BANDS.includes(g) || /^(K|[1-9]|1[0-2])$/.test(String(g)) ? String(g) : '');
const rowItem = r => ({ id: r.id, kind: r.kind, data: json(r.data, {}), gen: r.gen || null, seed: r.seed || null, hide: r.hide === null || r.hide === undefined ? false : r.hide === 'true' ? true : r.hide,
  question: r.question, answerKey: r.answer_key || null, answer: r.answer, work: json(r.work, []) });
export const itemsOf = setId => q.all('SELECT * FROM question_set_items WHERE set_id=? ORDER BY pos, id', setId).map(rowItem);
/** The owner's own worksheet, or null (anyone else: null, the same as a wrong id). */
export function ownWorksheet(u, id) {
  if (!canMake(u)) return null;
  return q.get("SELECT * FROM question_sets WHERE id=? AND owner_id=? AND purpose='worksheet'", String(id || ''), u.id) || null;
}
export function listWorksheets(u) {
  if (!canMake(u)) return [];
  return q.all(`SELECT s.id, s.title, s.grade, s.subject, s.updated_at, (SELECT COUNT(*) FROM question_set_items i WHERE i.set_id=s.id) n
    FROM question_sets s WHERE s.owner_id=? AND s.purpose='worksheet' ORDER BY s.updated_at DESC LIMIT 100`, u.id);
}
const storeItem = (setId, pos, it) => q.run(`INSERT INTO question_set_items(id, set_id, pos, kind, data, gen, seed, hide, question, answer_key, answer, work, points)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`, uid(12), setId, pos, it.kind, JSON.stringify(it.data), it.gen, it.seed, it.hide === false ? null : String(it.hide), it.question, it.answerKey, it.answer, JSON.stringify(it.work));
const touch = id => q.run('UPDATE question_sets SET updated_at=? WHERE id=?', now(), id);
/** The subject a worksheet is mostly about (its items' kinds). */
function subjectOf(setId) {
  const n = {}; for (const r of q.all('SELECT kind FROM question_set_items WHERE set_id=?', setId)) { const K = kindOf(r.kind); if (K) n[K.subject] = (n[K.subject] || 0) + 1; }
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
const resubject = id => q.run('UPDATE question_sets SET subject=? WHERE id=?', subjectOf(id), id);

export function createWorksheet(u, { title, grade, items = [] } = {}) {
  if (!canMake(u)) return fail('notFound');
  if (q.get("SELECT COUNT(*) n FROM question_sets WHERE owner_id=? AND purpose='worksheet'", u.id).n >= LIMITS.worksheets) return fail('tooMany');
  const list = [];
  for (const raw of (Array.isArray(items) ? items : []).slice(0, LIMITS.items)) { const c = cleanItem(raw); if (!c.ok) return c; list.push(c.item); }
  const id = uid(12), t = now();
  q.run("INSERT INTO question_sets(id, owner_id, title, grade, subject, purpose, of_version, created_at, updated_at) VALUES (?,?,?,?,'','worksheet',?,?,?)",
    id, u.id, cleanTitle(title, tEn('figures.sheet.untitled')), cleanGrade(grade), OF_VERSION, t, t);
  list.forEach((it, i) => storeItem(id, i, it));
  resubject(id);
  audit(u.id, 'figures.worksheet.create', id, { items: list.length });
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
  audit(u.id, 'figures.worksheet.delete', w.id, {});
  return ok();
}
export function addItem(u, id, raw) {
  const w = ownWorksheet(u, id); if (!w) return fail('notFound');
  if (q.get('SELECT COUNT(*) n FROM question_set_items WHERE set_id=?', w.id).n >= LIMITS.items) return fail('fullSheet');
  const c = cleanItem(raw, w.of_version); if (!c.ok) return c;
  storeItem(w.id, q.get('SELECT COALESCE(MAX(pos), -1) + 1 p FROM question_set_items WHERE set_id=?', w.id).p, c.item);
  resubject(w.id); touch(w.id);
  return ok({ id: w.id });
}
const ownItem = (w, itemId) => q.get('SELECT * FROM question_set_items WHERE id=? AND set_id=?', String(itemId || ''), w.id) || null;
/** A change to one question: any of data, hide, question, answerKey (the rest is kept), worked out again. */
export function updateItem(u, id, itemId, patch = {}) {
  const w = ownWorksheet(u, id); if (!w) return fail('notFound');
  const r = ownItem(w, itemId); if (!r) return fail('notFound');
  const old = rowItem(r), p = patch && typeof patch === 'object' ? patch : {};
  const next = { kind: old.kind, gen: old.gen, seed: old.seed, data: 'data' in p ? p.data : old.data, hide: 'hide' in p ? p.hide : old.hide,
    question: 'question' in p ? p.question : old.question, answerKey: 'answerKey' in p ? p.answerKey : old.answerKey };
  const c = cleanItem(next, w.of_version); if (!c.ok) return c;
  const it = c.item;
  q.run('UPDATE question_set_items SET data=?, gen=?, seed=?, hide=?, question=?, answer_key=?, answer=?, work=? WHERE id=?',
    JSON.stringify(it.data), it.gen, it.seed, it.hide === false ? null : String(it.hide), it.question, it.answerKey, it.answer, JSON.stringify(it.work), r.id);
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
/** "Regenerate numbers": the same generator with a new seed (a question from a generator only). */
export function regenItem(u, id, itemId, seed = newSeed()) {
  const w = ownWorksheet(u, id); if (!w) return fail('notFound');
  const r = ownItem(w, itemId); if (!r) return fail('notFound');
  const gid = r.gen || (kindOf(r.kind) && kindOf(r.kind).gens[0] && kindOf(r.kind).gens[0].id);
  if (!gid) return fail('noGen');
  const c = cleanItem({ kind: r.kind, gen: gid, seed }, w.of_version); if (!c.ok) return c;
  const it = c.item;
  q.run('UPDATE question_set_items SET data=?, gen=?, seed=?, hide=?, question=?, answer_key=?, answer=?, work=? WHERE id=?',
    JSON.stringify(it.data), it.gen, it.seed, it.hide === false ? null : String(it.hide), it.question, it.answerKey, it.answer, JSON.stringify(it.work), r.id);
  touch(w.id);
  return ok({ id: w.id });
}
/** A new question of this kind for "Add figure question": a fresh one from its generator, else its example. */
export function starterItem(kind) {
  const K = kindOf(kind); if (!K) return null;
  if (K.gens.length) { const gid = K.gens[Math.floor(Math.random() * K.gens.length)].id; return { kind: K.id, gen: gid, seed: newSeed() }; }
  return { kind: K.id, data: K.presets[0] };
}

/** A worksheet for its owner's page: its questions with their figures drawn (the screen's colors). */
export function worksheetView(u, id, { lang = 'en' } = {}) {
  const w = ownWorksheet(u, id); if (!w) return null;
  const F = kit(w.of_version);
  const items = itemsOf(w.id).map(it => ({ ...it, svg: F.svg(it.kind, it.data, { lang, hide: it.hide, title: it.question.slice(0, 120) || it.kind, width: 220 }), hasGen: !!(it.gen || kindOf(it.kind).gens.length) }));
  return { id: w.id, title: w.title, grade: w.grade, subject: w.subject, ofVersion: w.of_version, updatedAt: w.updated_at, items };
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
  const q1 = it => `<li class="fgp-q" value="${it.n}"><div class="fgp-text"><p dir="auto">${esc(it.question || t('figures.print.noQuestion'))}</p><p class="fgp-ans"><i class="fgp-blank fgp-wide"></i></p><p class="fgp-ans"><i class="fgp-blank fgp-wide"></i></p></div>${fig(it, false)}</li>`;
  const k1 = it => `<li class="fgp-q" value="${it.n}"><div class="fgp-text"><p dir="auto">${esc(it.question || t('figures.print.noQuestion'))}</p><p class="fgp-kans" dir="auto">${esc(it.answer || t('figures.print.noAnswer'))}</p>${it.work.length ? `<ul class="fgp-work">${it.work.map(x => `<li dir="auto">${esc(x)}</li>`).join('')}</ul>` : ''}</div>${fig(it, true)}</li>`;
  const sheetPage = sheet ? `<section class="fgp-page">${head(w.title, false)}<ol class="fgp-list">${list.map(q1).join('')}</ol>${foot}</section>` : '';
  const keyPage = key ? `<section class="fgp-page fgp-key">${head(w.title, true)}<ol class="fgp-list">${list.map(k1).join('')}</ol>${foot}</section>` : '';
  return `<div class="fgp" lang="${esc(lang)}" dir="${dir === 'rtl' ? 'rtl' : 'ltr'}" data-questions="${list.length}" data-key="${key ? 1 : 0}">${sheetPage}${keyPage}</div>`;
}

// ---------------------------------------------------------------- the teacher's presets and "Power with AI" switch
export function listPresets(u, kind) {
  if (!canMake(u) || !kindOf(kind)) return [];
  return q.all('SELECT id, name, data FROM figure_presets WHERE owner_id=? AND kind=? ORDER BY created_at DESC LIMIT ?', u.id, kind, LIMITS.presets).map(r => ({ id: r.id, name: r.name, data: json(r.data, {}) }));
}
export function savePreset(u, { kind, name, data } = {}) {
  if (!canMake(u)) return fail('notFound');
  const K = kindOf(kind); if (!K) return fail('badKind');
  const nm = clipStr(name, LIMITS.nameChars).replace(/\s+/g, ' ').trim();
  if (!nm) return fail('name');
  const tp = textProblem(nm); if (tp) return fail(tp);
  const c = cleanData(data); if (!c.data) return fail(c.code);
  const problems = checkFigure(K.id, c.data); if (problems.length) return fail('cannotDraw', { problems });
  if (q.get('SELECT COUNT(*) n FROM figure_presets WHERE owner_id=? AND kind=?', u.id, K.id).n >= LIMITS.presets) return fail('tooMany');
  const id = uid(12);
  q.run('INSERT INTO figure_presets(id, owner_id, kind, name, data, created_at) VALUES (?,?,?,?,?,?)', id, u.id, K.id, nm, JSON.stringify(c.data), now());
  return ok({ preset: { id, name: nm, data: c.data } });
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
/** The catalog the AI is shown: each kind's id, what it draws, its example data and the answers OF.solve can give. */
export function draftCatalog() {
  return draftKinds().map(K => {
    const keys = Object.keys(solved(K.id, K.presets[0])).slice(0, 14);
    return `- ${K.id} (${K.subject}; grades ${K.grades.join(', ')}): ${tEn(`figures.kinds.${K.id}.desc`)}. Example data: ${JSON.stringify(K.presets[0])}.${keys.length ? ` answerKey choices for the example: ${keys.join(', ')}.` : ' (no answerKey: leave it "")'}`;
  }).join('\n');
}
const DRAFT_SCHEMA = () => ({
  type: 'object', additionalProperties: false, required: ['title', 'items'],
  properties: {
    title: { type: 'string' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'question', 'data', 'answerKey'], properties: {
      kind: { type: 'string', enum: draftKinds().map(K => K.id) }, question: { type: 'string' }, data: { type: 'string' }, answerKey: { type: 'string' } } } },
  },
});
function draftPrompt({ brief, grade, count }) {
  return [
    'You are drafting a printable worksheet of figure questions for a teacher on Oomba Academy. Each question has one figure drawn by Oomba Figures from data you give.',
    `Write in US English, plain and clear for grade ${grade || 'the grade in the brief'} students. No names of people, no links, no brands.`,
    `Make exactly ${count} questions, different from each other, that fit the brief. Only use kinds from this catalog, and give each figure's data as JSON text in "data" with the same fields as the example (change the numbers and words to fit the question). Never draw or describe SVG.`,
    'Every figure must be drawable truthfully to scale: numbers that cannot make the figure are rejected and replaced.',
    'answerKey: the name of the OF.solve value that answers the question (one of the kind\'s answerKey choices, for example "area" or "sides.CA"). You never work the answer out yourself: Oomba Figures does.',
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
];
/** A plain starter set without the AI: kinds the brief's words point at (else its subject's), within its grade band. */
export function templateItems({ brief = '', grade = '', count = 6 } = {}) {
  const b = String(brief).toLowerCase(), band = bandOf(grade || (/\bgrade\s*(\d{1,2}|k)\b/i.exec(b) || [])[1] || '');
  let ids = [...new Set(KEYWORDS.filter(([re]) => re.test(b)).flatMap(([, ks]) => ks))];
  if (!ids.length) {
    const subj = /physic/.test(b) ? 'physics' : /chem/.test(b) ? 'chem' : /data|statistic|probab|graph/.test(b) ? 'data' : 'math';
    ids = draftKinds().filter(K => K.subject === subj).map(K => K.id);
  }
  let kinds = ids.map(kindOf).filter(K => K && K.gens.length);
  if (band && kinds.some(K => K.grades.includes(band))) kinds = kinds.filter(K => K.grades.includes(band));
  const out = [];
  for (let i = 0; out.length < count && i < count * 4; i++) {
    const K = kinds[i % kinds.length], gid = K.gens[Math.floor(i / kinds.length) % K.gens.length].id;
    const c = cleanItem({ kind: K.id, gen: gid, seed: newSeed() }); if (c.ok) out.push(c.item);
  }
  return out;
}
export function bandOf(g) {
  const s = String(g || '').toUpperCase();
  if (GRADE_BANDS.includes(s)) return s;
  if (s === 'K' || s === '1' || s === '2') return 'K-2';
  const n = Number(s); if (!Number.isInteger(n)) return '';
  return n <= 2 ? 'K-2' : n <= 5 ? '3-5' : n <= 8 ? '6-8' : n <= 12 ? '9-12' : '';
}
const logRepair = fields => (hooks.log ? hooks.log(fields) : log('warn', 'figures.draft.repair', fields));
/**
 * The AI's items made safe: a kind not in the catalog is dropped; data that does not pass OF.check, an answerKey that is
 * not one of the figure's OF.solve values, or words that are not allowed: the item is replaced by a fresh question from
 * that kind's generator. Every repair is logged (the kind and why, never the brief). -> { items, repaired, dropped }
 */
export function repairDraft(raw, { max = LIMITS.draftMax } = {}) {
  const items = [], allowed = new Set(draftKinds().map(K => K.id));
  let repaired = 0, dropped = 0;
  for (const [i, x] of (Array.isArray(raw) ? raw : []).slice(0, max).entries()) {
    const kind = x && typeof x.kind === 'string' ? x.kind : '';
    if (!allowed.has(kind)) { dropped++; logRepair({ item: i, kind: clipStr(kind, 30), action: 'dropped', why: 'not in the catalog' }); continue; }
    const data = typeof (x && x.data) === 'string' ? json(x.data, null) : x && x.data;
    const keyOk = data && typeof x.answerKey === 'string' && typeof solved(kind, data)[x.answerKey] === 'number';
    const c = data ? cleanItem({ kind, data, question: x.question, answerKey: x.answerKey, hide: false }) : fail('badData');
    if (c.ok && keyOk && c.item.question) { items.push(c.item); continue; }
    const why = !data ? 'data is not JSON' : c.code === 'cannotDraw' ? `OF.check: ${c.problems[0]}` : !c.ok ? c.code : !keyOk ? 'answerKey is not an OF.solve value' : 'no question';
    const K = kindOf(kind), gid = K.gens[0].id, g = cleanItem({ kind, gen: gid, seed: newSeed() });
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
  let items = null, ai = false, repaired = 0, dropped = 0, title = '';
  if (client) {
    try {
      const res = await client.messages.create({
        model: config.builderModel, max_tokens: 6000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: DRAFT_SCHEMA() } },
        messages: [{ role: 'user', content: draftPrompt({ brief: b, grade: g, count: n }) }],
      }, { timeout: 60000, maxRetries: 1 });
      if (res && res.usage) aiBudget.recordUsage(res.model || config.builderModel, res.usage);
      const block = ((res && res.content) || []).find(c => c.type === 'text');
      const d = JSON.parse(block ? block.text : '');
      const r = repairDraft(d && d.items, { max: n });
      if (r.items.length) { ({ items, repaired, dropped } = r); ai = true; title = d && typeof d.title === 'string' ? d.title : ''; }
    } catch (e) { log('warn', 'figures.draft.failed', { error: String(e && e.message || e).slice(0, 200) }); }
  }
  if (!items) items = templateItems({ brief: b, grade: g, count: n });
  items.forEach((it, i) => storeItem(w.id, have + i, it));
  if (title && w.title === tEn('figures.sheet.untitled')) { const tt = cleanTitle(title, ''); if (tt) q.run('UPDATE question_sets SET title=? WHERE id=?', tt, w.id); }
  if (g && !w.grade) q.run('UPDATE question_sets SET grade=? WHERE id=?', g, w.id);
  resubject(w.id); touch(w.id);
  audit(u.id, 'figures.draft', w.id, { ai, added: items.length, repaired, dropped });
  return ok({ ai, added: items.length, repaired, dropped });
}

// ---------------------------------------------------------------- thumbnails (the menu's cards), cached
const thumbs = new Map();
/** A kind's card picture: its example drawn by the server's pinned Oomba Figures, once per kind and language. */
export function thumbnail(kind, lang = 'en') {
  const K = kindOf(kind); if (!K) return null;
  const k = `${K.id}|${lang}`;
  if (!thumbs.has(k)) thumbs.set(k, kit().svg(K.id, K.presets[0], { lang, title: tEn(`figures.kinds.${K.id}.name`) }));
  return thumbs.get(k);
}

// ---------------------------------------------------------------- cleanup
/** An account is deleted (services/account-delete.js): their worksheets, presets and switch. */
export function forgetUser(userId) {
  q.run('DELETE FROM question_set_items WHERE set_id IN (SELECT id FROM question_sets WHERE owner_id=?)', userId);
  q.run('DELETE FROM question_sets WHERE owner_id=?', userId);
  q.run('DELETE FROM figure_presets WHERE owner_id=?', userId);
  q.run('DELETE FROM figure_prefs WHERE user_id=?', userId);
}
