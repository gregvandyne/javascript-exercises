// "✨ Draft questions with AI" in the question-set editor (/live/sets): Claude writes multiple-choice questions on the
// teacher's topic, at the level they ask for, in their language. The teacher reads and edits every question before
// saving (the set is never saved from here), and the usual text checks run when it is saved. Counts towards the AI
// spending cap. Without an API key (or with the AI budget resting) it answers { ok: false, code: 'aiOff' }.
import { anthropic } from '../builder/anthropic.js';
import * as aiBudget from './ai-budget.js';
import { config } from '../config.js';
import { localeInfo } from '../i18n/index.js';
import { LIMITS, SECS } from './classlive-sets.js';

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'items'],
  properties: {
    title: { type: 'string' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['q', 'right', 'wrong', 'secs'], properties: {
      q: { type: 'string' }, right: { type: 'string' }, wrong: { type: 'array', items: { type: 'string' } }, secs: { type: 'integer' } } } },
  },
};
const LANGS = { en: 'English (US)', 'en-GB': 'British English', pt: 'Brazilian Portuguese', fr: 'French', es: 'Spanish', de: 'German', he: 'Hebrew', ja: 'Japanese', ar: 'Arabic', ru: 'Russian', it: 'Italian', 'zh-Hant': 'Traditional Chinese', nl: 'Dutch' };
export const KINDS = ['mixed', 'choice4', 'truefalse'];

/** The nearest allowed time to what the AI asked for. */
const nearSecs = s => SECS.reduce((best, x) => (Math.abs(x - s) < Math.abs(best - s) ? x : best), 20);

/** { topic, level, count (1-30), kind, locale, t } -> { ok, title, items: [{ q, choices, answer, secs }] } | { ok: false, code } */
export async function draftQuestions({ topic, level = '', count = 10, kind = 'mixed', locale = 'en', t = null }) {
  const client = anthropic();
  if (!client) return { ok: false, code: 'aiOff' };
  const n = Math.max(1, Math.min(30, Math.round(+count) || 10));
  const lang = LANGS[localeInfo(locale).code] || 'English (US)';
  const tf = t ? [t('js.live-sets.true'), t('js.live-sets.false')] : ['True', 'False'];
  const shape = kind === 'truefalse' ? `Every question is a true-or-false statement: "right" is exactly "${tf[0]}" or "${tf[1]}" and "wrong" holds the other one.`
    : kind === 'choice4' ? 'Every question has exactly 3 wrong answers.'
      : `Mix it up: mostly questions with 3 wrong answers, some with 1 or 2, and a few true-or-false statements (right "${tf[0]}" or "${tf[1]}", wrong the other).`;
  const res = await client.messages.create({
    model: config.builderModel, max_tokens: 6000,
    system: `You write quiz questions for a teacher's live class quiz on Oomba Academy, a kid-safe learning website. The teacher will check and edit them.
Write in ${lang}. Match the level the teacher asks for exactly (it may be anything from early primary to high school or adult learners); make the questions accurate, unambiguous and fair, with one clearly right answer and believable wrong answers of similar length.
Questions at most ${LIMITS.q} characters, answers at most ${LIMITS.choice} characters, all answers of a question different. No links, no personal data, no brands, nothing scary or unkind.
${shape}
"secs" is the answer time in seconds that suits the question (pick from ${SECS.join(', ')}): short recall 10-20, reading or a calculation 30-60, harder problems more.
"title" is a short name for the set.`,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `Topic: ${String(topic).slice(0, 300)}\nLevel: ${String(level).slice(0, 60) || 'not given (aim for ages 8-14)'}\nNumber of questions: ${n}` }],
  }, { timeout: 90000, maxRetries: 1 });
  aiBudget.recordUsage(res.model || config.builderModel, res.usage);
  const block = (res.content || []).find(c => c.type === 'text');
  let d; try { d = JSON.parse(block ? block.text : '{}'); } catch { d = null; }
  if (!d || !Array.isArray(d.items) || !d.items.length) return { ok: false, code: 'aiFailed' };
  const items = [];
  for (const it of d.items.slice(0, n)) {
    const right = String(it.right || '').trim().slice(0, LIMITS.choice);
    const wrong = [...new Set((Array.isArray(it.wrong) ? it.wrong : []).map(w => String(w || '').trim().slice(0, LIMITS.choice)))].filter(w => w && w.toLowerCase() !== right.toLowerCase()).slice(0, 3);
    const q = String(it.q || '').trim().slice(0, LIMITS.q);
    if (!q || !right || !wrong.length) continue;
    // The right answer goes in a random place (players see the answers shuffled anyway; this is for the editor).
    // True or false keeps its usual order; otherwise the right answer goes in a random place (players see the
    // answers shuffled anyway; this is for the editor).
    const isTf = wrong.length === 1 && tf.includes(right) && tf.includes(wrong[0]);
    const choices = isTf ? tf.slice() : [...wrong];
    const at = isTf ? tf.indexOf(right) : Math.floor(Math.random() * (choices.length + 1));
    if (!isTf) choices.splice(at, 0, right);
    items.push({ q, choices, answer: at, secs: nearSecs(+it.secs || 20) });
  }
  if (!items.length) return { ok: false, code: 'aiFailed' };
  return { ok: true, title: String(d.title || topic).trim().slice(0, LIMITS.title), items };
}
