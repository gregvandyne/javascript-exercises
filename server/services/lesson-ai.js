// "✨ Draft with AI": Claude drafts a lesson (title, summary, objectives, steps) from a topic and grade, choosing games
// from the ones this teacher can use. The teacher edits the draft before using it. Counts towards the AI spending cap.
// Without an API key (or when the AI budget is resting), or when the AI fails or doesn't answer in time (one warn line,
// services/ai-call.js), a simple template draft is made instead.
//
// Figure questions (docs/decisions.md "Figures: the lesson Figure step and Build a test"): for a Figures tester the
// caller also passes the figure catalog (services/figures.js figureCatalog: kinds with a generator, each with its id, a
// line about it, its parameter schema and its OF.solve keys), the same way it passes the game catalog. Claude may then
// add "figures" steps whose figures come only from that catalog. Every figure is checked here (F.repairDraft: OF.check
// with the pinned Oomba Figures, the answerKey an OF.solve value, choices, words): a bad one is replaced by its kind's
// generator, a kind not in the catalog is dropped and its question kept (as a written question step when no figure is
// left), and every repair is logged with the kind and why (never the topic). The template draft adds a starter step
// from the generators the topic points at.
import { anthropic } from '../builder/anthropic.js';
import * as aiBudget from './ai-budget.js';
import { config } from '../config.js';
import { localeInfo, tEn } from '../i18n/index.js';
import { log } from './log.js';
import { callAi, logAiFail, fallbackReason } from './ai-call.js';
import * as F from './figures.js';

/** Test hooks: create replaces the AI client's messages.create (no network in tests; the AI budget still applies, as
 *  with the real client); log receives each figure repair. */
export const hooks = { create: null, log: null };
const logRepair = fields => (hooks.log ? hooks.log(fields) : log('warn', 'lesson.draft.figureRepair', fields));
const client0 = () => (hooks.create ? (aiBudget.ok() ? { messages: { create: hooks.create } } : null) : anthropic());

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'summary', 'objectives', 'steps'],
  properties: {
    title: { type: 'string' }, summary: { type: 'string' }, objectives: { type: 'string' },
    steps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'title', 'body', 'minutes', 'gameId'], properties: {
      kind: { type: 'string', enum: ['text', 'game', 'build', 'question'] }, title: { type: 'string' }, body: { type: 'string' },
      minutes: { type: 'integer' }, gameId: { type: 'string' } } } },
  },
};
/** The schema with figure steps: kind "figures" and, on every step, its figure questions ([] for the other kinds). */
const FIG_ITEM = { type: 'object', additionalProperties: false, required: ['kind', 'question', 'data', 'answerType', 'answerKey', 'choices', 'correct'], properties: {
  kind: { type: 'string' }, question: { type: 'string' }, data: { type: 'string' }, answerType: { type: 'string', enum: ['number', 'choice'] },
  answerKey: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, correct: { type: 'integer' } } };
const schemaWithFigures = () => {
  const st = SCHEMA.properties.steps.items;
  return { ...SCHEMA, properties: { ...SCHEMA.properties, steps: { type: 'array', items: { ...st, required: [...st.required, 'figures'],
    properties: { ...st.properties, kind: { type: 'string', enum: [...st.properties.kind.enum, 'figures'] }, figures: { type: 'array', items: FIG_ITEM } } } } } };
};
/** The figure catalog as the prompt lists it (services/figures.js catalogLine). */
const figureLines = figures => figures.slice(0, 120).map(F.catalogLine).join('\n');
const LANGS = { en: 'English (US)', 'en-GB': 'British English', pt: 'Brazilian Portuguese', fr: 'French', es: 'Spanish', de: 'German', he: 'Hebrew', ja: 'Japanese', ar: 'Arabic', ru: 'Russian', it: 'Italian', 'zh-Hant': 'Traditional Chinese', nl: 'Dutch' };

/** catalog: [{ id, title, description, tags }] games the teacher may use. figures: the figure catalog (F.figureCatalog)
 *  for a teacher who may use Figures, else [] (no figure steps). Returns { draft, ai: boolean }; a figures step of the
 *  draft carries its checked questions in figures (services/figures.js items, ready to store). */
export async function draftLesson({ topic, grade = '', subject = '', minutes = 40, locale = 'en', t = tEn }, catalog = [], figures = []) {
  const ids = new Set(catalog.map(g => g.id));
  const withFigs = Array.isArray(figures) && figures.length > 0;
  const client = client0();
  if (!client) return { draft: templateDraft({ topic, grade, subject, minutes }, catalog, t, { figures }), ai: false };
  const lang = LANGS[localeInfo(locale).code] || 'English (US)';
  const games = catalog.slice(0, 80).map(g => `- ${g.id}: ${g.title}${g.description ? `: ${String(g.description).slice(0, 120)}` : ''}${g.tags ? ` [${String(g.tags).slice(0, 60)}]` : ''}`).join('\n');
  const params = {
    model: config.builderModel, max_tokens: 3000,
    system: `You help primary and middle school teachers plan lessons on Oomba Academy, a kid-safe website where children play and build small web games.
Write a practical lesson plan for the teacher, in ${lang}. Keep it kind, clear and age-appropriate. No external links, no personal data, no brands.
Steps are one of:
- "text": instructions or a short reading for the students (plain text, short paragraphs, written for the students' age),
- "game": the students play one of the available games (put its id in gameId; only use ids from the list, and only when a game really fits the topic),
- "build": the students build their own small game with the Oomba Academy Builder; body is the idea they type to the Builder (one or two sentences a child could write, e.g. "a quiz with 8 questions about the planets"),
- "question": the students answer a question in writing and the teacher reads the answers; body is the question (one clear, open question; use one or two per lesson, for example an exit ticket near the end).
${withFigs ? `- "figures": the students answer 2 to 6 questions about exact, to-scale figures drawn by Oomba Figures (put them in "figures"; only when a figure really fits the topic; body is a one-line instruction). Each figure question: kind (only an id from the figure catalog), question (one or two short sentences), data (the figure's data as JSON text, with the same fields as the kind's example and its parameters), answerType "number" with answerKey one of the kind's answerKey choices (choices [], correct 0; you never work the number out: Oomba Figures does), or answerType "choice" only when the answer is a word the figure shows plainly (2 to 6 short different options, correct the index of the right one, answerKey ""). Figures that cannot be drawn truthfully to scale are replaced. "figures" is [] for every other kind of step.
` : ''}Use 3 to 7 steps that fill about ${minutes} minutes in total (minutes per step). Start with a short warm-up, end with a wrap-up. gameId is "" for non-game steps.
Objectives: 2 to 4 short lines, one per line.`,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: withFigs ? schemaWithFigures() : SCHEMA } },
    messages: [{ role: 'user', content: `Topic: ${String(topic).slice(0, 200)}\nGrade: ${String(grade).slice(0, 20) || 'not given'}\nSubject: ${String(subject).slice(0, 40) || 'not given'}\n\nAvailable games:\n${games || '(none)'}${withFigs ? `\n\nFigure catalog:\n${figureLines(figures)}` : ''}` }],
  };
  const t0 = Date.now();
  let res;
  try { res = await callAi(client, params); } catch (e) {   // failed or didn't answer in time: one warn line (never the topic), and the template draft
    const reason = fallbackReason(logAiFail('lesson draft ai failed', { figures: withFigs }, e, t0));
    return { draft: templateDraft({ topic, grade, subject, minutes }, catalog, t, { figures }), ai: false, reason };
  }
  if (res && res.usage) aiBudget.recordUsage(res.model || config.builderModel, res.usage);
  const block = ((res && res.content) || []).find(c => c.type === 'text');
  let d; try { d = JSON.parse(block ? block.text : '{}'); } catch (e) { logAiFail('lesson draft ai failed', { figures: withFigs }, e, t0); d = null; }
  if (!d || !Array.isArray(d.steps)) return { draft: templateDraft({ topic, grade, subject, minutes }, catalog, t, { figures }), ai: false, reason: 'error' };
  d.steps = d.steps.slice(0, 10).map(s => ({ ...s, gameId: s.kind === 'game' && ids.has(s.gameId) ? s.gameId : '' }))
    .map(s => (s.kind === 'game' && !s.gameId ? { ...s, kind: 'text' } : s))
    .map((s, i) => figureStep(s, i, withFigs ? figures : []))
    .map(({ figures: f, ...s }) => (s.kind === 'figures' ? { ...s, figures: f } : s));
  return { draft: d, ai: true };
}

/** One drafted step's figure questions made safe. A figures step: each question through F.repairDraft (only kinds of
 *  the catalog given; data that fails OF.check, a wrong answerKey or bad choices: its kind's generator instead); a
 *  question whose kind is not in the catalog loses its figure and keeps its words. No figure left: the step becomes a
 *  written question (the kept questions) or, with none, a text step. Every repair is logged (step, kind, why). */
export function figureStep(s, i, figures = []) {
  if (!s || s.kind !== 'figures') return s;
  const allowed = new Set(figures.map(c => c.id)), list = Array.isArray(s.figures) ? s.figures.slice(0, F.LIMITS.draftMax) : [];
  const keep = [], kept = [];
  list.forEach((x, k) => {
    const kind = x && typeof x.kind === 'string' ? x.kind : '';
    if (!allowed.has(kind)) {
      logRepair({ step: i, item: k, kind: String(kind).slice(0, 30), action: 'figure dropped, question kept', why: 'not in the figure catalog' });
      const qq = x && typeof x.question === 'string' ? x.question.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
      if (qq && !F.textProblem(qq)) kept.push(qq);
      return;
    }
    keep.push(x);
  });
  // F.repairDraft logs through its own hook: here each of its repairs is this step's.
  const before = F.hooks.log; F.hooks.log = f => logRepair({ step: i, ...f });
  let r;
  try { r = F.repairDraft(keep, { max: F.LIMITS.draftMax }); } finally { F.hooks.log = before; }
  if (r.items.length) return { ...s, figures: r.items, body: String(s.body || '') };
  if (kept.length) return { ...s, kind: 'question', body: [String(s.body || '').trim(), ...kept].filter(Boolean).join('\n\n'), figures: [] };
  logRepair({ step: i, kind: '', action: 'step became text', why: 'no figure question could be used' });
  return { ...s, kind: 'text', body: String(s.body || s.title || ''), figures: [] };
}

/** Small words that say nothing about the topic (they matched unrelated games before). */
const STOP = new Set(['and', 'the', 'for', 'with', 'about', 'from', 'into', 'what', 'how', 'this', 'that', 'your']);
/** Words of a text, lower case, with a simple plural trim ("planets" also finds "Planet Quiz"). */
const wordsOf = s => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2 && !STOP.has(w)).map(w => (w.length > 3 ? w.replace(/(?<!s)s$/, '').replace(/e$/, '') : w));

/** A plain starting point without the AI: warm-up, a matching game if one is found, a build activity, an exit ticket.
 *  A game matches on its tags first, then its title (topic words before subject words), never on its description alone.
 *  Step minutes are scaled to the length asked for (weights 1 · 2 · 4 · 1). */
export function templateDraft({ topic, grade, subject, minutes = 40 }, catalog = [], t = tEn, { figures = [] } = {}) {
  const find = words => {
    if (!words.length) return null;
    const hit = field => catalog.find(g => wordsOf(g[field]).some(w => words.includes(w)));
    return hit('tags') || hit('title');
  };
  const match = find(wordsOf(topic)) || find(wordsOf(subject));
  const steps = [
    { kind: 'text', title: t('lessons.template.warmup'), body: t('lessons.template.warmupText', { topic }), w: 1, gameId: '' },
    match && { kind: 'game', title: t('lessons.template.play', { title: match.title }), body: '', w: 2, gameId: match.id },
    { kind: 'build', title: t('lessons.template.build'), body: t('lessons.template.buildText', { topic }), w: 4, gameId: '' },
    // A Figures tester whose topic points at figures (services/figures.js templateTest: its words, the grade band)
    // gets a starter Figure step dealt from the generators.
    ...figureTemplate({ topic, subject, grade }, figures, t),
    { kind: 'question', title: t('lessons.template.exit'), body: t('lessons.template.exitText', { topic }), w: 1, gameId: '' },
  ].filter(Boolean);
  const total = Math.max(steps.length, Math.round(+minutes || 40)), weight = steps.reduce((n, s) => n + s.w, 0);
  for (const s of steps) s.minutes = Math.max(1, Math.round((total * s.w) / weight));
  const build = steps.find(s => s.kind === 'build');
  build.minutes = Math.max(1, build.minutes + total - steps.reduce((n, s) => n + s.minutes, 0)); // rounding: the totals add up
  return { title: String(topic || '').slice(0, 100), summary: '', objectives: '', steps: steps.map(({ w, ...s }) => s), grade, subject };
}
/** The template's Figure step: only when the figure catalog is given and the topic's words name a figure. */
function figureTemplate({ topic, subject, grade }, figures, t) {
  if (!Array.isArray(figures) || !figures.length || !F.topicKinds(`${topic || ''} ${subject || ''}`).length) return [];
  const items = F.templateTest({ topic: `${topic || ''} ${subject || ''}`, grade, count: 4 }).filter(it => figures.some(c => c.id === it.kind));
  return items.length ? [{ kind: 'figures', title: t('lessons.template.figures'), body: t('lessons.template.figuresText'), w: 2, gameId: '', figures: items }] : [];
}
