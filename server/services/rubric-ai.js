// "✨ Draft a rubric with AI" (teachers only): the same drafting path as "Draft with AI" for lessons (services/lesson-ai.js):
// Claude drafts a rubric (criteria × levels with descriptors) from the task the teacher describes and a grade. Only what
// the teacher typed is sent: never a student's name, answer or game (docs/decisions.md "Rubrics"). The teacher edits the
// draft before using it. Counts towards the AI spending cap. Without an API key (or when the AI is resting) a plain
// template draft is made instead.
import { anthropic } from '../builder/anthropic.js';
import * as aiBudget from './ai-budget.js';
import { config } from '../config.js';
import { localeInfo, tEn } from '../i18n/index.js';
import { LIMITS } from './rubrics.js';

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'levels', 'criteria'],
  properties: {
    title: { type: 'string' },
    levels: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'points'], properties: { label: { type: 'string' }, points: { type: 'integer' } } } },
    criteria: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'descs'], properties: { name: { type: 'string' }, descs: { type: 'array', items: { type: 'string' } } } } },
  },
};
const LANGS = { en: 'English (US)', 'en-GB': 'British English', pt: 'Brazilian Portuguese', fr: 'French', es: 'Spanish', de: 'German', he: 'Hebrew', ja: 'Japanese', ar: 'Arabic', ru: 'Russian', it: 'Italian', 'zh-Hant': 'Traditional Chinese', nl: 'Dutch' };
/** Test hook: a fake client (tests/unit/rubrics.test.js) instead of the real one. */
export const _hooks = { client: null };

/** -> { draft: { title, levels, criteria }, ai: boolean }. task: what the students do (the teacher's words). */
export async function draftRubric({ task, grade = '', levels = 4, locale = 'en', t = tEn }) {
  const n = Math.max(LIMITS.levels[0], Math.min(LIMITS.levels[1], Math.round(+levels || 4)));
  const client = _hooks.client || anthropic();
  if (!client) return { draft: templateRubric({ task, levels: n }, t), ai: false };
  const lang = LANGS[localeInfo(locale).code] || 'English (US)';
  const res = await client.messages.create({
    model: config.builderModel, max_tokens: 2500,
    system: `You help primary and middle school teachers (students aged 8 to 14) write marking rubrics on Oomba Academy.
Write one analytic rubric for the task the teacher describes, in ${lang}. Plain, kind words a child can understand when the teacher shares the result. No names, no personal data, no links.
levels: exactly ${n} performance levels from lowest to highest, each with a short label (one or two words) and whole-number points going up (for example 1 to ${n}).
criteria: 3 to 5 criteria, each with a short name and exactly ${n} descriptors (one per level, lowest first), each one sentence saying what the work shows at that level.
title: a short title for the rubric.`,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `Task: ${String(task).slice(0, 300)}\nGrade: ${String(grade).slice(0, 20) || 'not given'}` }],
  }, { timeout: 60000, maxRetries: 1 });
  aiBudget.recordUsage(res.model || config.builderModel, res.usage);
  const block = (res.content || []).find(c => c.type === 'text');
  let d; try { d = JSON.parse(block ? block.text : '{}'); } catch { d = null; }
  if (!d || !Array.isArray(d.levels) || !Array.isArray(d.criteria) || d.levels.length < 2 || !d.criteria.length) return { draft: templateRubric({ task, levels: n }, t), ai: false };
  return {
    draft: {
      title: String(d.title || task || '').slice(0, LIMITS.title),
      levels: d.levels.slice(0, LIMITS.levels[1]).map((l, i) => ({ label: String(l.label || i + 1).slice(0, LIMITS.label), points: Math.max(0, Math.min(LIMITS.points, Math.round(+l.points) || i + 1)) })),
      criteria: d.criteria.slice(0, LIMITS.criteria[1]).map(c => ({ name: String(c.name || '').slice(0, LIMITS.name) || '—', descs: (Array.isArray(c.descs) ? c.descs : []).map(x => String(x || '')) })),
    },
    ai: true,
  };
}

/** A plain starting point without the AI: three criteria (understanding, explaining, care) with one general phrase per
 *  level, in the teacher's language. Levels: Beginning 1 · Developing 2 · Secure 3 · Excellent 4 (as many as asked). */
export function templateRubric({ task, levels = 4 }, t = tEn) {
  const names = ['beginning', 'developing', 'secure', 'excellent', 'excellent', 'excellent'];
  const lv = Array.from({ length: levels }, (_, i) => ({ label: t(`rubrics.levelNames.${names[Math.min(i, 3)]}`), points: i + 1 }));
  const phrase = i => t(`rubrics.template.level${Math.min(3, Math.round((3 * i) / Math.max(1, levels - 1)))}`);
  return {
    title: String(task || t('rubrics.untitled')).slice(0, LIMITS.title),
    levels: lv,
    criteria: ['understanding', 'explaining', 'care'].map(k => ({ name: t(`rubrics.template.${k}`), descs: lv.map((_, i) => phrase(i)) })),
  };
}
