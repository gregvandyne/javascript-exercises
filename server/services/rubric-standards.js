// Rubric scores on the class Standards tab (docs/decisions.md "Rubrics" and "Standards beyond computer science"): the
// rubric source services/standards-ccss.js was built to take (registerRubricSource). A score a teacher gave with a
// library rubric (services/rubrics.js, table rubric_scores) is evidence for the Common Core codes the scored work is
// tagged with:
//   a step's score    the codes on that step, else the codes on the whole lesson (the rule quiz items follow)
//   a lesson's score  the codes on the whole lesson
// as points out of the most possible for the criteria scored (7/10 -> 0.7; a student meets a code from 2/3). Only what
// the gradebook counts: current assignments, steps still in the lesson, scores given with the rubric the step or lesson
// still carries (or none), with a level picked (max_points > 0). Nothing new is stored. Imported for its side effect
// by the Standards routes (and anything else that draws the class view).
import { q } from '../db.js';
import { registerRubricSource } from './standards-ccss.js';

/** [{ userId, code, score, max, at }] for a class in one framework. studentIds: a Set of the class's students. */
export function rubricEvidence({ classId, framework, studentIds }) {
  if (!classId) return [];
  const rows = q.all(`SELECT r.user_id u, r.step_id step, c.lesson_id lesson, r.points, r.max_points mx, r.scored_at at FROM rubric_scores r
    JOIN class_lessons c ON c.id=r.class_lesson_id AND c.removed_at IS NULL JOIN lessons l ON l.id=c.lesson_id
    LEFT JOIN lesson_steps s ON r.step_id!='' AND s.id=r.step_id AND s.lesson_id=c.lesson_id
    WHERE c.class_id=? AND r.max_points>0 AND (r.step_id='' OR s.id IS NOT NULL)
      AND COALESCE(CASE WHEN r.step_id='' THEN l.rubric_id WHEN s.kind IN ('question','build') THEN s.rubric_id END, r.rubric_id)=r.rubric_id`, classId);
  if (!rows.length) return [];
  const lessonIds = [...new Set(rows.map(r => r.lesson))];
  const tags = q.all(`SELECT lesson_id, step_id, code FROM lesson_standards WHERE framework=? AND lesson_id IN (${lessonIds.map(() => '?').join(',')})`, framework, ...lessonIds);
  const of = (lesson, step) => tags.filter(t => t.lesson_id === lesson && t.step_id === step).map(t => t.code);
  const out = [];
  for (const r of rows) {
    if (studentIds && !studentIds.has(r.u)) continue;
    const own = r.step ? of(r.lesson, r.step) : [];
    for (const code of new Set(own.length ? own : of(r.lesson, ''))) out.push({ userId: r.u, code, score: r.points, max: r.mx, at: r.at });
  }
  return out;
}
registerRubricSource(rubricEvidence);
