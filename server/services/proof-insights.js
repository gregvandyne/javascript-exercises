// "Oomba's read" of a graded Mistake Hunt step (docs/decisions.md "Mistake Hunt, Phase 3"): on the lesson's progress page,
// a card that says which kinds of mistake the class missed most and gives one or two teaching ideas.
//   - Who: the class's teachers (and school admins who manage the class), with the Teacher plan (proof-ai.js planTools:
//     plan holders, testers, the platform admin). A teacher without it sees a calm "part of the Teacher plan" note while
//     paid plans are on. Never students.
//   - What goes to the AI: counts only. For each kind of mistake in the set, how many times it was found and missed by
//     the students who handed in, its Common Core code, how many handed in, the grade and the number of passages. Never a
//     name, never a student's work or edits, never one student's result, never the passages' text.
//   - Fallback: the same facts as a few sentences written by code (summary), shown whenever there is no fresh read (the
//     AI is off, resting or failed, or nobody asked yet). No rankings of students anywhere.
//   - On demand ("Ask Oomba"), cached per assigned lesson and step (proof_insights) until a new hand-in arrives (hand-ins
//     are final, so the number handed in is the cache's key) or the teacher reads the page in another language.
import { q, now, audit } from '../db.js';
import { config } from '../config.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as PS from './proof-steps.js';
import * as aiBudget from './ai-budget.js';
import { anthropic } from '../builder/anthropic.js';
import { callAi, logAiFail, fallbackReason } from './ai-call.js';
import { jsonIn } from './manipulatives.js';
import { cleanText } from './textfilter.js';
import { proofT } from './proof-core.js';
import { planTools, hooks as aiHooks } from './proof-ai.js';
import { log } from './log.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
export const LIMITS = { read: 420, tip: 200, tips: 2 };
const LANG_NAMES = { en: 'US English', 'en-GB': 'British English', pt: 'Brazilian Portuguese', fr: 'French', es: 'Spanish', de: 'German', he: 'Hebrew', ja: 'Japanese', ar: 'Arabic', ru: 'Russian', it: 'Italian', 'zh-Hant': 'Traditional Chinese', nl: 'Dutch' };

/** The assigned lesson and step, when this teacher manages the class and it is a proofread step. */
function stepFor(u, clId, stepId) {
  const cl = L.getClassLesson(String(clId || '')); const c = cl && S.getClass(cl.class_id);
  if (!c || !S.canManageClass(u, c)) return null;
  const s = L.getStep(String(stepId || ''));
  if (!s || s.lesson_id !== cl.lesson_id || s.kind !== L.PROOF_KIND) return null;
  return { cl, step: s };
}
/** The class's students' rows for the step (the current roster only). */
function rowsOf(cl, step) {
  const ids = new Set(S.roster(cl.class_id).filter(p => p.role === 'student').map(p => p.id));
  return { rows: q.all('SELECT * FROM step_progress WHERE class_lesson_id=? AND step_id=?', cl.id, step.id).filter(r => ids.has(r.user_id)), students: ids.size };
}

/**
 * The facts, counts only: { handed, students, foundPct, grade, passages, kinds: [{ k, cc, found, missed }] }.
 * typeTotals already adds up across the students who handed in; nothing here is per student.
 */
export function factsOf(step, rows, students) {
  const tt = PS.typeTotals(step, rows), snap = PS.snapOf(step);
  const ps = Array.isArray(snap.passages) ? snap.passages : [];
  return { handed: tt.handed, students, foundPct: tt.foundPct, grade: ps.length && Number.isInteger(ps[0].g) ? ps[0].g : null, passages: ps.length,
    kinds: tt.kinds.map(x => ({ k: x.k, cc: x.cc, found: x.found, missed: x.missed })) };
}
const rate = x => { const all = x.found + x.missed; return all ? x.missed / all : 0; };
/** Kinds missed most first (share missed, then how many), only those missed at least once. */
export const missedMost = f => f.kinds.filter(x => x.missed > 0).sort((a, b) => rate(b) - rate(a) || b.missed - a.missed);

/** The code-written read (the fallback): { lines: [...], tips: [...] } in the viewer's language. */
export function summary(t, lang, f) {
  const name = k => proofT(lang)(`ty.${k}`);
  if (!f.handed) return { lines: [t('proof.insight.noneYet')], tips: [] };
  const lines = [t('proof.insight.foundLine', { done: f.handed, total: f.students, pct: f.foundPct ?? 0 })];
  const miss = missedMost(f).slice(0, 2);
  if (!miss.length) return { lines: [...lines, t('proof.insight.allFound')], tips: [t('proof.insight.tipHarder')] };
  lines.push(t('proof.insight.missedLine', { list: miss.map(x => t('proof.insight.missedItem', { kind: name(x.k), missed: x.missed, all: x.found + x.missed })).join('; ') }));
  const best = f.kinds.filter(x => x.found + x.missed > 0 && rate(x) <= 0.25 && !miss.includes(x)).sort((a, b) => rate(a) - rate(b) || b.found - a.found)[0];
  if (best) lines.push(t('proof.insight.foundWell', { kind: name(best.k) }));
  const tips = [t('proof.insight.tipSet', { kind: name(miss[0].k), code: miss[0].cc })];
  if (miss[1]) tips.push(t('proof.insight.tipAloud', { kind: name(miss[1].k) }));
  return { lines, tips };
}

/** The prompt: counts only (unit tests check no name or text can be in it). */
export function prompt(f, lang) {
  const en = proofT('en');
  const rows = f.kinds.map(x => `- ${en(`ty.${x.k}`)} (${x.cc}): found ${x.found} times, missed ${x.missed} times`).join('\n');
  return [
    'You help a teacher read their class\'s results on a proofreading activity (Mistake Hunt on Oomba Academy). Students fixed planted mistakes in short passages. You get only counts for the whole class: no names, no student work.',
    `${f.handed} of ${f.students} students handed in${f.grade !== null ? `, grade ${f.grade === 0 ? 'K' : f.grade}` : ''}, ${f.passages} passage${f.passages === 1 ? '' : 's'}. Across them the class found ${f.foundPct ?? 0}% of the mistakes.`,
    'By kind of mistake (Common Core code), totals for the class:',
    rows,
    `Write in ${LANG_NAMES[lang] || 'US English'}, warm and plain, for the teacher. "read": two or three short sentences saying which kinds the class missed most and what they found well, using the numbers. "tips": one or two short, practical teaching suggestions for the kinds missed most (a mini-lesson, a short practice set, a class routine). Never rank, compare or single out students, never guess about individual students, no names.`,
    'Answer with one JSON object and nothing else: {"read": "...", "tips": ["...", "..."]}.',
  ].join('\n');
}
/** The model's answer, checked: every sentence through the site's text filter, within its length. */
export function readAnswer(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SyntaxError('not an answer');
  const one = (s, n) => { const v = String(s || '').replace(/\s+/g, ' ').trim(); if (!v || v.length > n) return ''; const c = cleanText(v, n); return c.ok && c.value === v ? v : ''; };
  const read = one(raw.read, LIMITS.read);
  if (!read) throw new SyntaxError('no read');
  const tips = (Array.isArray(raw.tips) ? raw.tips : []).slice(0, LIMITS.tips).map(s => one(s, LIMITS.tip)).filter(Boolean);
  return { read, tips };
}

/** The cached read, when there is one: { read, tips, handed, lang, at }. */
const cached = (cl, step) => {
  const r = q.get('SELECT * FROM proof_insights WHERE class_lesson_id=? AND step_id=?', cl.id, step.id);
  if (!r) return null;
  try { const b = JSON.parse(r.body); return { read: String(b.read || ''), tips: Array.isArray(b.tips) ? b.tips.map(String) : [], handed: r.handed, lang: r.lang, at: r.created_at }; } catch { return null; }
};
const fresh = (c, f, lang) => !!c && c.handed === f.handed && c.lang === lang;

/**
 * Everything the card and GET need: { ok, access ('yes'|'plan'), facts, summary, insight (fresh cached read or null),
 * stale (an older read exists) } | fail ('notFound', 'notAllowed').
 */
export function card(u, clId, stepId, { t, lang = 'en' }) {
  const s = stepFor(u, clId, stepId); if (!s) return fail('notFound');
  const access = planTools(u); if (!access) return fail('notAllowed');
  const { rows, students } = rowsOf(s.cl, s.step);
  const f = factsOf(s.step, rows, students), c = cached(s.cl, s.step);
  return ok({ access, facts: f, summary: summary(t, lang, f), insight: fresh(c, f, lang) ? { read: c.read, tips: c.tips, at: c.at } : null, stale: !!c && !fresh(c, f, lang) });
}

/** "Ask Oomba": a fresh read from the counts, or the cached one when nothing changed. -> { ok, insight, ai, reason? } */
export async function ask(u, clId, stepId, { lang = 'en' } = {}) {
  const s = stepFor(u, clId, stepId); if (!s) return fail('notFound');
  const access = planTools(u);
  if (access !== 'yes') return fail(access === 'plan' ? 'teacherPlan' : 'notAllowed');
  const { rows, students } = rowsOf(s.cl, s.step);
  const f = factsOf(s.step, rows, students);
  if (!f.handed) return fail('noneYet');
  const c = cached(s.cl, s.step);
  if (fresh(c, f, lang)) return ok({ insight: { read: c.read, tips: c.tips, at: c.at }, ai: true, cached: true });
  const client = aiHooks.create ? { messages: { create: aiHooks.create } } : anthropic('free');
  if (!client) return ok({ insight: null, ai: false, reason: 'resting' });
  const t0 = Date.now();
  try {
    const res = await callAi(client, { model: config.builderModel, max_tokens: 700, output_config: { effort: 'low' }, messages: [{ role: 'user', content: prompt(f, lang) }] });
    if (res && res.usage) aiBudget.recordUsage(res.model || config.builderModel, res.usage);
    const block = ((res && res.content) || []).find(x => x.type === 'text');
    const out = readAnswer(jsonIn(block ? block.text : ''));
    q.run(`INSERT INTO proof_insights(class_lesson_id, step_id, lang, handed, body, created_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(class_lesson_id, step_id) DO UPDATE SET lang=excluded.lang, handed=excluded.handed, body=excluded.body, created_at=excluded.created_at`,
    s.cl.id, s.step.id, lang, f.handed, JSON.stringify(out), now());
    audit(u.id, 'proof.insight', s.cl.class_id, { step: s.step.id, handed: f.handed });
    log('info', 'mistake hunt insight ai answered', { step: s.step.id, ms: Date.now() - t0 });
    return ok({ insight: { ...out, at: now() }, ai: true });
  } catch (e) {
    return ok({ insight: null, ai: false, reason: fallbackReason(logAiFail('mistake hunt insight ai failed', { user: u.id, tool: 'mistake-hunt', step: s.step.id }, e, t0)) });
  }
}
