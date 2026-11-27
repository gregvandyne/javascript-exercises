// Oomba makes it, then reports what it checked (docs/decisions.md "Oomba makes it, then reports what it checked", the
// owner's live audit of 27 Nov 2026: "NOT seamless"). The chat used to write a brief and ask the teacher to open a card
// and press the page's final button, and it said "I set up..." before anything existed. Now, from any page:
//   - makeBoard: a Manipulatives board built by the board's own checks (services/manip-chat.js buildChange, the same
//     sanitizeDraft as Draft with AI) and saved the way Draft with AI saves one (manipulatives.js addRecent, a board in
//     My boards). The tool runs the save in a dry run and reads the board back; the real save comes with the answer and
//     is read back again; the card's Open button opens that exact board (/manipulatives#board/<id>).
//   - makeWorksheet: a Figures worksheet made (figures.js createWorksheet) and filled with the questions sent, through
//     the worksheet tool's own checks (figures-chat.js readAnswer, applyPlan, readBack, verifyPlan), in one step.
//   - makeLesson: a lesson plan drafted and saved by the library's own Draft with AI (services/lesson-draft.js).
//   - claims(): a reply never says something was made, set up or replaced unless a tool made it in this answer: the
//     sentences that claim it are taken out and the app says plainly that nothing was made yet (the server-side guard).
//   - classReport: a class's progress in counts only (assignments done, Needs a look reasons, Grammar Lab and courses).
//     Students are placeholders ("Student A", services/homeroom-look.js forAi) or counts; never a name, never supports.
//   - findLessons: the teacher's own game folders and the class's assigned lessons besides the catalog; a hidden arcade
//     game is named as turned off (services/game-focus.js), with the closest open lesson of the same topic. Grammar Lab
//     units and topics for a teacher it lets in (services/grammar-lab-access.js).
import { q, now, uid, audit } from '../db.js';
import * as S from './schools.js';
import * as D from './dash.js';
import * as M from './manipulatives.js';
import * as MC from './manip-chat.js';
import * as F from './figures.js';
import * as FC from './figures-chat.js';
import * as VC from './verify-change.js';
import * as L from './lessons.js';
import * as P from './progress.js';
import * as HR from './homeroom.js';
import * as NL from './homeroom-look.js';
import * as GL from './grammar-lab.js';
import * as GLA from './grammar-lab-assign.js';
import * as GA from './grammar-lab-access.js';
import * as CR from './courses.js';
import * as games from './games.js';
import { GAMES_META } from './companion-games.js';
import { gameHidden, arcadeHidden } from './game-focus.js';
import { TOOLS as MANIP_TOOLS, toolOf } from '../../public/js/manip-data.js';
import { PRACTICE_TABLE, PRACTICE_HELP } from '../../public/js/manip-practice.js';
import { studentNames, scrub } from '../builder/lesson.js';
import { tFor } from '../i18n/index.js';

const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, '').slice(0, n);
const fold = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s-]+/gu, ' ').replace(/\s+/g, ' ').trim();
const clean = (u, s, names) => scrub(String(s || ''), names || studentNames(u)).text;

// ---------------------------------------------------------------- the guard: no claim without a made thing
// "I set up a base-ten blocks board", "I replaced question 1", "The board is ready", "Done!": a sentence that says
// something exists. English patterns (the reply is in the teacher's language; the main check is that the tool made it).
const CLAIM = /\b(I|I've|I have|I just|we've|we have)\s+(?:already\s+)?(set up|made|created|built|replaced|added|put|saved|drafted and saved|assigned|gave|given)\b|\b(is|are)\s+(?:now\s+)?(ready|set up|created|saved|on your board|in My boards)\b|\bDone!/i;
export const claims = text => CLAIM.test(String(text || ''));
/** The reply without its claim sentences, and whether any was taken out. */
export function withoutClaims(text) {
  const parts = String(text || '').split(/(?<=[.!?])\s+/);
  const kept = parts.filter(p => !claims(p));
  return { text: kept.join(' ').trim(), cut: kept.length !== parts.length };
}

// ---------------------------------------------------------------- Manipulatives: makeBoard
export const BOARD_TOOL_LIST = MANIP_TOOLS.map(x => x.slug);
/** What one item is on each tool (for the tool's description): "slug: what one item shows". */
export const boardCatalog = () => MANIP_TOOLS.filter(x => PRACTICE_TABLE[x.slug]).map(x => `${x.slug} (${x.name}, grades ${x.grades}): ${PRACTICE_TABLE[x.slug]}`).join('\n');
/** makeBoard's input checked and built (no write). -> { plan, back, dropped } | { error, help? } */
export function boardPlan(u, i) {
  if (!M.canHost(u)) return { error: 'This account cannot make Manipulatives boards (they come with the Teacher plan). Nothing was made.' };
  const tl = toolOf(String(i.tool || ''));
  if (!tl) return { error: `Unknown tool. Tools: ${BOARD_TOOL_LIST.join(', ')}. Nothing was made.` };
  const help = { item: PRACTICE_TABLE[tl.slug] || '', settings: PRACTICE_HELP[tl.slug] || '' };
  if (!Array.isArray(i.items) || !i.items.length) return { error: 'Send the items to put on the board (at least one). Nothing was made.', help };
  const r = MC.buildChange({ title: i.title, steps: Array.isArray(i.steps) ? i.steps : [], items: i.items }, tl.slug);
  if (!r.change) return { error: `None of the items can be built on ${tl.name} (a number out of its range, or a setting it does not have). Nothing was made. Tell the teacher why in one line and offer the closest thing this tool can show.`, help };
  const c = r.change;
  return { plan: { id: uid(10), tool: tl.slug, toolName: tl.name, title: c.title || tl.name, state: c.state, n: c.n, dropped: c.dropped || 0 }, back: MC.readBack(tl.slug, c), help };
}
/** The board saved as Draft with AI saves one (a board in My boards), read back. -> { ok, board } | { ok: false } */
export function saveBoard(u, plan) {
  if (!M.canHost(u)) return { ok: false, code: 'notFound' };
  const b = M.addRecent(u, plan.tool, plan.title, plan.state);
  const back = M.ownBoard(u, b.id);
  // Checked work: the board is there, with the tool and the board asked for.
  if (!back || back.tool !== plan.tool || back.state !== plan.state) return { ok: false, code: 'error' };
  audit(u.id, 'companion.board.make', back.id, { tool: plan.tool, items: plan.n });
  return { ok: true, board: { id: back.id, title: back.title, tool: back.tool } };
}
export const boardHref = id => `/manipulatives#board/${encodeURIComponent(id)}`;

// ---------------------------------------------------------------- Figures: what the teacher asked for
const NUM = '(-?\\d+(?:\\.\\d+)?)';
/** The facts a worksheet request states, read from the teacher's words: { range: [a, b] | null, whole, plot, format }. */
export function requestFacts(text) {
  const s = String(text || '').toLowerCase().replace(/[\u2013\u2014]/g, '-');
  let m = new RegExp(`\\bfrom\\s+${NUM}\\s+(?:to|through|-)\\s+${NUM}`).exec(s);
  if (!m && /\bline\b|\brange\b/.test(s)) m = new RegExp(`\\b${NUM}\\s*(?:to|through|-)\\s*${NUM}\\b`).exec(s);
  const range = m && +m[2] > +m[1] ? [+m[1], +m[2]] : null;
  const whole = /\bwhole[- ]numbers?\b|\bintegers?\b|\bno (?:decimals|fractions)\b/.test(s);
  const plot = /\bplot(?:s|ting|ted)?\b|\bplace (?:the |a |each )?(?:points?|numbers?)\b|\bmark (?:the |a |each )?(?:points?|numbers?) on\b/.test(s);
  const format = /column addition|regroup|carry(?:ing)? (?:the|a|over)|borrowing|long division|standard algorithm|vertical (?:addition|subtraction)/.test(s) ? 'columns' : null;
  return { range, whole, plot, format };
}
/** The format question asked earlier in this chat and its answer: { kind: 'plot' | 'columns', chosen, request } | null. */
export function formatAnswer(history) {
  for (let k = (history || []).length - 1; k >= 0; k--) {
    const a = history[k].note && history[k].note.ask;
    if (a && a.format) return a.state === 'answered' && Number.isInteger(a.chosen) ? { kind: a.format, chosen: a.chosen, request: a.request || '' } : null;
  }
  return null;
}
/** The ask card for a format Figures does not have (plotted points checked online, column addition): asked before
 *  anything is built. Option 0 builds the closest thing; the last is Not now. */
export function formatAsk(kind, lang, request) {
  const t = tFor(lang);
  const options = kind === 'plot' ? [t('js.companion.fmt.plotPrint'), t('js.companion.fmt.plotRead'), t('js.companion.fmt.no')] : [t('js.companion.fmt.closest'), t('js.companion.fmt.no')];
  return { id: uid(10), format: kind, question: t(kind === 'plot' ? 'js.companion.fmt.plotQ' : 'js.companion.fmt.columnsQ'), options: options.map(label => ({ label })), request: clip(request, 1000), state: 'open', noOther: true };
}

// ---------------------------------------------------------------- Figures: makeWorksheet
/** A new worksheet made and filled in one step, all inside fn's transaction. -> { w, plan, v, back } | { error } */
function fillNew(u, i, opts) {
  const made = F.createWorksheet(u, { purpose: i.purpose === 'test' ? 'test' : 'worksheet', grade: opts.grade, lang: opts.lang });
  if (!made.ok) return { error: made.code === 'tooMany' ? 'The teacher has as many worksheets as Figures keeps: they delete some first. Nothing was made.' : 'The worksheet could not be made. Nothing was made.' };
  const w = F.ownWorksheet(u, made.id);
  let plan;
  try { plan = FC.readAnswer({ reply: 'ok', title: i.title, units: i.units, edits: (Array.isArray(i.items) ? i.items : []).slice(0, F.LIMITS.draftMax).map(item => ({ op: 'add', after: null, item })) }, w, [], { facts: opts.facts }); }
  catch { return { error: 'Send the questions as items. Nothing was made.' }; }
  if (opts.plan) plan = { ...opts.plan, title: plan.title || opts.plan.title };
  const before = FC.readBack(u, w);
  const a = FC.applyPlan(u, w, plan, { first: true });
  const back = FC.readBack(u, w);
  return { w, plan, v: FC.verifyPlan(plan, a, before, back), back };
}
/** makeWorksheet's input checked in a dry run (the worksheet made, filled and read back, then rolled back).
 *  -> { plan, v, back } (plan carries the checked ops; nothing written) | { error } */
export function sheetPlan(u, i, { lang = 'en', facts = {} } = {}) {
  if (!F.canMake(u)) return { error: 'This account cannot make Figures worksheets. Nothing was made.' };
  if (!Array.isArray(i.items) || !i.items.length) return { error: 'Send the questions (items) to put on the worksheet. Nothing was made.' };
  const grade = i.grade !== undefined && i.grade !== null ? String(i.grade).toUpperCase() === 'K' ? 'K' : String(i.grade) : '';
  const r = VC.dryRun(() => fillNew(u, i, { lang, grade, facts }));
  if (r.error) return r;
  // Made means at least one question on it (a title alone is not a worksheet).
  if (!r.v.landed.some(x => x.now)) r.v = { ...r.v, nothing: true };
  return { plan: { id: uid(10), purpose: i.purpose === 'test' ? 'test' : 'worksheet', grade, lang, ops: r.plan, title: r.plan.title || '' }, v: r.v, back: r.back };
}
/** The worksheet made for real with the plan checked at the tool, read back. -> { ok, sheet, v } | { ok: false } */
export function saveSheet(u, p) {
  const r = fillNew(u, { purpose: p.purpose }, { lang: p.lang, grade: p.grade, plan: p.ops });
  if (r.error || !r.v.landed.some(x => x.now)) return { ok: false, code: 'error', v: r.v || null };
  audit(u.id, 'companion.sheet.make', r.w.id, { questions: r.back.count });
  return { ok: true, sheet: { id: r.w.id, title: r.back.title || '', count: r.back.count }, v: r.v };
}
export const sheetHref = id => `/figures/worksheets/${encodeURIComponent(id)}`;

// ---------------------------------------------------------------- the topic of a build: never guessed
/** Did the teacher ask to build something (not only to find it)? English and the site's main languages. */
const BUILD_VERB = /\b(build|make|create|draft|write|plan|design|put together|set up|crea|haz|construye|prepara|cr[ée]e|fais|construis|pr[ée]pare|erstelle|mach|baue|crie|fa[çc]a|fai|maak|bouw)\b/i;
export const asksToBuild = text => BUILD_VERB.test(String(text || ''));
/** Is the topic in the teacher's own words of this message (or a file they attached to it)? Never from history. */
export function topicInWords(topic, words) {
  const t = fold(topic).split(' ').filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'grade', 'lesson', 'about'].includes(w));
  const hay = fold(words);
  return t.length > 0 && t.some(w => hay.includes(w) || hay.includes(w.replace(/s$/, '')));
}

// ---------------------------------------------------------------- the class: who and how many
/** The classes this teacher manages, and the one a request means: { c } | { ask: [classes] } | { none: true }. */
export function classOf(u, page, ref = '') {
  const mine = S.classesOf(u.id, 'teacher').map(c => S.getClass(c.id)).filter(c => c && !c.archived_at && S.canManageClass(u, c));
  if (!mine.length) return { none: true };
  const r = fold(ref);
  let c = ref ? mine.find(x => x.id === ref) || mine.find(x => fold(x.name) === r) || null : null;
  if (!c && r) { const near = mine.filter(x => fold(x.name).includes(r) || r.includes(fold(x.name))); if (near.length === 1) c = near[0]; }
  if (!c && !ref && page.classId) c = mine.find(x => x.id === page.classId) || null;
  if (!c && mine.length === 1) c = mine[0];
  return c ? { c } : { ask: mine };
}
export const studentCount = c => S.roster(c.id).filter(r => r.role === 'student').length;

// ---------------------------------------------------------------- the progress report (counts only)
/**
 * A class's progress, as the AI may see it: counts only. Assignments (how many of the students they are for finished,
 * started, are late, have answers waiting to be read), Needs a look (how many students for each reason, each student a
 * placeholder the page names in the browser: who), Grammar Lab (topics mastered and started, for a teacher it lets in)
 * and courses begun. Never a name, an answer, a score of one student, or whether a student has supports.
 * Grammar Lab also in all (grammarLabAll: how many students mastered a topic, and how many topics in all, assigned or not).
 * -> { students, assignments, needsLook, grammarLab?, grammarLabAll?, courses?, who }
 */
export function classReport(u, c, { lang = 'en', names = studentNames(u) } = {}) {
  const n = studentCount(c);
  if (!n) return { students: 0, who: {} };
  const gb = P.classProgress(c.id);
  const assignments = gb.lessons.slice(0, 30).map((l, i) => {
    const cells = gb.students.map(p => p.cells[i]).filter(x => x && !x.na);
    const graded = cells.filter(x => !x.locked);
    return { title: clip(clean(u, l.title, names), 80), for: cells.length, finished: graded.filter(x => x.total && x.done >= x.total).length,
      started: graded.filter(x => x.done > 0 && x.done < x.total).length, notStarted: graded.filter(x => !x.done).length, late: graded.filter(x => x.late).length,
      toRead: graded.reduce((s, x) => s + (x.toRead || 0), 0), ...(l.locked ? { opensLater: true } : {}), ...(l.due_at ? { due: String(l.due_at).slice(0, 10) } : {}) };
  });
  const out = { students: n, assignments, who: {} };
  if (HR.canUseClass(u, c)) {
    const v = NL.shown(c, NL.compute(c, { lang }));
    const byRule = {};
    for (const it of v.items) for (const r of it.reasons) byRule[r.rule] = (byRule[r.rule] || 0) + 1;
    const r = NL.forAi(u, v.items);
    out.needsLook = { reasons: byRule, students: r.students.map(s => ({ student: s.student, reasons: s.reasons.map(x => x.reason) })) };
    out.who = r.who;
  }
  if (GLA.canView(u, c)) {
    const g = GLA.classGrid(c);
    if (g.units && g.units.length) {
      out.grammarLab = g.units.slice(0, 8).map(un => ({ unit: un.title, topics: un.topics.slice(0, 12).map(tp => ({ topic: tp.title, mastered: (g.counts[tp.id] || {}).mastered || 0, started: (g.counts[tp.id] || {}).started || 0 })) }));
    }
    // and what the class mastered in all of Grammar Lab, assigned or not (students practice on their own where it is
    // open to everyone): counts only, never who
    const per = S.roster(c.id).filter(r => r.role === 'student').map(p => GL.masteredSet(p).size);
    const any = per.filter(x => x > 0).length;
    if (any) out.grammarLabAll = { studentsWithTopicsMastered: any, topicsMastered: per.reduce((a, b) => a + b, 0) };
  }
  const studs = S.roster(c.id).filter(r => r.role === 'student');
  const courses = [];
  for (const course of CR.COURSES) {
    let rows = [];
    try { rows = CR.classCourseProgress(studs, CR.getCourse(course.slug)); } catch { rows = []; }
    const started = rows.filter(r => r.status !== 'not-started').length;
    if (started) courses.push({ course: tFor('en')(`${course.key}.title`), started, completed: rows.filter(r => r.status === 'completed').length, of: rows.length });
  }
  if (courses.length) out.courses = courses;
  return out;
}

// ---------------------------------------------------------------- finding a lesson by its name
/**
 * A lesson the teacher named, wherever it is: their own game folders, the class's assigned lessons, the catalog's
 * games (with the hidden arcade games named as turned off) and, for a teacher Grammar Lab lets in, its units and
 * topics. -> { mine: [...], assigned: [...], hidden: [...], grammarLab: [...] }
 */
export function findByName(u, words, { classId = null, names = studentNames(u) } = {}) {
  const w = fold(words);
  const hit = title => { const t = fold(title); return !!t && !!w && (t === w || t.includes(w) || (w.includes(t) && t.length >= 4)); };
  const out = { mine: [], assigned: [], hidden: [], grammarLab: [] };
  if (!w || w.length < 3) return out;
  const folders = q.all(`SELECT f.name folder, g.id, g.slug, g.title, g.source FROM game_folders f JOIN game_folder_items i ON i.folder_id=f.id JOIN games g ON g.id=i.game_id
    WHERE f.owner_id=? AND g.status!='deleted' ORDER BY f.position, i.position LIMIT 400`, u.id);
  for (const r of folders) {
    if (!hit(r.title) && !hit(r.slug)) continue;
    const off = gameHidden(r);
    out.mine.push({ id: r.slug || r.id, title: r.title, folder: clip(clean(u, r.folder, names), 60), ...(off ? { turnedOff: true } : {}) });
  }
  if (classId) {
    for (const cl of L.classLessons(classId).slice(0, 200)) if (hit(cl.title)) out.assigned.push({ title: clip(clean(u, cl.title, names), 80), kind: cl.kind || 'lesson' });
  }
  if (arcadeHidden()) {
    for (const m of GAMES_META) {
      const g = games.getGameBySlug(m.slug);
      if (g && gameHidden(g) && (hit(g.title) || hit(m.slug)) && !out.mine.some(x => x.id === m.slug)) out.hidden.push({ id: m.slug, title: g.title, turnedOff: true });
    }
  }
  if (GA.mayAssignGrammarLab(u)) {
    // the class's own grade band first (a 4th grade class: the grades 3-5 unit before the K-2 one)
    const c = classId ? S.getClass(classId) : null, g = c ? GL.gradeNumber(c.grade) : null, pref = g === null ? null : GL.bandOfGrade(g);
    const found = grammarFind(words);
    out.grammarLab = (pref ? [...found.filter(x => x.band === pref), ...found.filter(x => x.band !== pref)] : found).slice(0, 6);
  }
  return out;
}
/** The closest open lesson for a turned-off game: an open official game that shares one of its topics exactly (never a
 *  topic that only contains the word: "column addition" is not "addition"). -> [{ id, title }] */
export function closestOpen(slug) {
  const m = GAMES_META.find(x => x.slug === slug); if (!m) return [];
  const topics = new Set(m.topics.map(fold));
  const out = [];
  for (const x of GAMES_META) {
    if (x.slug === slug || x.subject !== m.subject) continue;
    const g = games.getGameBySlug(x.slug);
    if (!g || g.status !== 'published' || gameHidden(g)) continue;
    const shared = x.topics.map(fold).filter(tp => topics.has(tp));
    if (shared.length) out.push({ id: x.slug, gameId: g.id, title: g.title, shared, grades: x.grades });
  }
  return out.sort((a, b) => b.shared.length - a.shared.length).slice(0, 3);
}
/** The words for a turned-off game the teacher has: "<title> is in your <folder> folder, but ..." */
export const hiddenLine = (t, x) => (x.folder ? t('js.companion.find.hiddenFolder', { title: x.title, folder: x.folder }) : t('js.companion.find.hidden', { title: x.title }));

// ---------------------------------------------------------------- Grammar Lab: find and assign
/** Words a teacher puts around a Grammar Lab topic ("practice for commas", "a grammar lesson on nouns"), never part of
 *  what they look for. */
const GL_STOP = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'of', 'to', 'in', 'on', 'with', 'about', 'some', 'my', 'our', 'me', 'please', 'practice',
  'practise', 'lesson', 'lessons', 'unit', 'units', 'topic', 'topics', 'grammar', 'lab', 'class', 'students', 'kids', 'grade', 'grades', 'assign',
  'find', 'give', 'work', 'help', 'skill', 'skills', 'game', 'games', 'worksheet', 'quiz', 'review', 'using', 'use', 'vs', 'k']);
// a word's start, either way round: "comma" finds "Commas", "capitals" finds "Capital Letters" and "Capitalizing"
const glStem = w => (w.length > 4 ? w.replace(/(ies|es|s)$/, '') : w);
const glHit = (w, title) => fold(title).split(' ').some(h => h.startsWith(glStem(w)) || (h.length > 3 && w.startsWith(glStem(h))));
/** Grammar Lab units and topics that fit the words: [{ what: 'unit' | 'topic', unit, band, topic?, title }], best first:
 *  the exact title, then a title holding the words, then one where every word the teacher used (without the words
 *  around a topic: practice, for, lesson...) starts a word of the title. */
export function grammarFind(words) {
  const w = fold(words); if (!w) return [];
  const terms = w.split(' ').filter(x => x.length > 1 && !GL_STOP.has(x) && !/^\d+$/.test(x));
  if (!terms.length) return [];
  const score = title => {
    const t = fold(title); if (t === w) return 10; if (w.length > 3 && ` ${t} `.includes(` ${w} `)) return 6;
    const n = terms.filter(x => glHit(x, title)).length;
    return n === terms.length ? 2 + n : n >= Math.max(2, Math.ceil(terms.length * 2 / 3)) ? n : 0;
  };
  const out = [], seen = new Set();
  for (const b of GL.bands()) {
    for (const p of GL.pathwaysOf(b.id)) {
      if (!p) continue;
      const su = score(p.title);
      if (su > 0) out.push({ s: su + 0.5, x: { what: 'unit', unit: p.id, band: p.band, title: p.title, topics: p.topics.length } });
      for (const id of p.topics) {
        const tp = GL.topic(id); if (!tp || seen.has(`${b.id}:${id}`)) continue;
        const st = score(tp.title);
        if (st > 0) { seen.add(`${b.id}:${id}`); out.push({ s: st, x: { what: 'topic', unit: p.id, band: p.band, topic: id, title: tp.title } }); }
      }
    }
  }
  return out.sort((a, b) => b.s - a.s).map(o => o.x);
}
/** The Grammar Lab assignment itself (grammar-lab-assign.js assign, the course page's own). */
export function runGrammar(u, p) {
  return GLA.assign(u, { classId: p.classId, what: p.what, unit: p.unit, band: p.band, topic: p.topic || null, students: p.students || [], dueAt: p.due || null });
}
export const mayGrammar = u => GA.mayAssignGrammarLab(u);
export { now };
