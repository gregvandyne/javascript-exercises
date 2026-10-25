// "✨ Draft with AI": Claude drafts a lesson (title, summary, objectives, steps) from a topic and grade, choosing games
// from the ones this teacher can use. The teacher edits the draft before using it. Counts towards the AI spending cap.
// Without an API key (or when the AI budget is resting) a simple template draft is made instead.
import { anthropic } from '../builder/anthropic.js';
import * as aiBudget from './ai-budget.js';
import { config } from '../config.js';
import { localeInfo, tEn } from '../i18n/index.js';

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'summary', 'objectives', 'steps'],
  properties: {
    title: { type: 'string' }, summary: { type: 'string' }, objectives: { type: 'string' },
    steps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'title', 'body', 'minutes', 'gameId'], properties: {
      kind: { type: 'string', enum: ['text', 'game', 'build', 'question'] }, title: { type: 'string' }, body: { type: 'string' },
      minutes: { type: 'integer' }, gameId: { type: 'string' } } } },
  },
};
const LANGS = { en: 'English (US)', 'en-GB': 'British English', pt: 'Brazilian Portuguese', fr: 'French', es: 'Spanish', de: 'German', he: 'Hebrew', ja: 'Japanese', ar: 'Arabic', ru: 'Russian', it: 'Italian', 'zh-Hant': 'Traditional Chinese', nl: 'Dutch' };

/** catalog: [{ id, title, description, tags }] games the teacher may use. Returns { draft, ai: boolean }. */
export async function draftLesson({ topic, grade = '', subject = '', minutes = 40, locale = 'en', t = tEn }, catalog = []) {
  const ids = new Set(catalog.map(g => g.id));
  const client = anthropic();
  if (!client) return { draft: templateDraft({ topic, grade, subject, minutes }, catalog, t), ai: false };
  const lang = LANGS[localeInfo(locale).code] || 'English (US)';
  const games = catalog.slice(0, 80).map(g => `- ${g.id}: ${g.title}${g.description ? ` — ${String(g.description).slice(0, 120)}` : ''}${g.tags ? ` [${String(g.tags).slice(0, 60)}]` : ''}`).join('\n');
  const res = await client.messages.create({
    model: config.builderModel, max_tokens: 3000,
    system: `You help primary and middle school teachers plan lessons on Oomba Academy, a kid-safe website where children play and build small web games.
Write a practical lesson plan for the teacher, in ${lang}. Keep it kind, clear and age-appropriate. No external links, no personal data, no brands.
Steps are one of:
- "text": instructions or a short reading for the students (plain text, short paragraphs, written for the students' age),
- "game": the students play one of the available games (put its id in gameId; only use ids from the list, and only when a game really fits the topic),
- "build": the students build their own small game with the Oomba Academy Builder; body is the idea they type to the Builder (one or two sentences a child could write, e.g. "a quiz with 8 questions about the planets"),
- "question": the students answer a question in writing and the teacher reads the answers; body is the question (one clear, open question; use one or two per lesson, for example an exit ticket near the end).
Use 3 to 7 steps that fill about ${minutes} minutes in total (minutes per step). Start with a short warm-up, end with a wrap-up. gameId is "" for non-game steps.
Objectives: 2 to 4 short lines, one per line.`,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `Topic: ${String(topic).slice(0, 200)}\nGrade: ${String(grade).slice(0, 20) || 'not given'}\nSubject: ${String(subject).slice(0, 40) || 'not given'}\n\nAvailable games:\n${games || '(none)'}` }],
  }, { timeout: 60000, maxRetries: 1 });
  aiBudget.recordUsage(res.model || config.builderModel, res.usage);
  const block = (res.content || []).find(c => c.type === 'text');
  let d; try { d = JSON.parse(block ? block.text : '{}'); } catch { d = null; }
  if (!d || !Array.isArray(d.steps)) return { draft: templateDraft({ topic, grade, subject, minutes }, catalog, t), ai: false };
  d.steps = d.steps.slice(0, 10).map(s => ({ ...s, gameId: s.kind === 'game' && ids.has(s.gameId) ? s.gameId : '' }))
    .map(s => (s.kind === 'game' && !s.gameId ? { ...s, kind: 'text' } : s));
  return { draft: d, ai: true };
}

/** Small words that say nothing about the topic (they matched unrelated games before). */
const STOP = new Set(['and', 'the', 'for', 'with', 'about', 'from', 'into', 'what', 'how', 'this', 'that', 'your']);
/** Words of a text, lower case, with a simple plural trim ("planets" also finds "Planet Quiz"). */
const wordsOf = s => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2 && !STOP.has(w)).map(w => (w.length > 3 ? w.replace(/(?<!s)s$/, '').replace(/e$/, '') : w));

/** A plain starting point without the AI: warm-up, a matching game if one is found, a build activity, an exit ticket.
 *  A game matches on its tags first, then its title (topic words before subject words), never on its description alone.
 *  Step minutes are scaled to the length asked for (weights 1 · 2 · 4 · 1). */
export function templateDraft({ topic, grade, subject, minutes = 40 }, catalog = [], t = tEn) {
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
    { kind: 'question', title: t('lessons.template.exit'), body: t('lessons.template.exitText', { topic }), w: 1, gameId: '' },
  ].filter(Boolean);
  const total = Math.max(steps.length, Math.round(+minutes || 40)), weight = steps.reduce((n, s) => n + s.w, 0);
  for (const s of steps) s.minutes = Math.max(1, Math.round((total * s.w) / weight));
  const build = steps.find(s => s.kind === 'build');
  build.minutes = Math.max(1, build.minutes + total - steps.reduce((n, s) => n + s.minutes, 0)); // rounding: the totals add up
  return { title: String(topic || '').slice(0, 100), summary: '', objectives: '', steps: steps.map(({ w, ...s }) => s), grade, subject };
}
