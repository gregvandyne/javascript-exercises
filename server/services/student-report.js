// One student's work in one class, for the class's staff (routes/student-report.js; docs/decisions.md "Real scores in the
// gradebook"): the same figures as the gradebook row (Work done, Score, late), what the Score is made of, a standards
// summary, recent written answers with the teacher's feedback, and live game results. Read only; nothing here is shown
// to a student, another family or the projector, and nothing is sent to an AI.
import { q, now } from '../db.js';
import * as P from './progress.js';
import * as SC from './scores.js';
import * as STD from './standards.js';
import * as CC from './standards-ccss.js';
import './rubric-standards.js';   // rubric scores as standards evidence (the same view the Standards tab shows)
import * as FW from '../standards/frameworks.js';

/** -> null (not an active student of the class) | { student, lessons: [{ cl, cell }], workDone | null, score, lateCount,
 *  toRead, answers, notes, live: [{ run, result }], standards: [{ fw, meets, developing, practiced }] } */
export function studentReport(classId, userId, t = now()) {
  const gb = P.classProgress(classId, t);
  const p = gb.students.find(x => x.id === userId);
  if (!p) return null;
  const answers = q.all(`SELECT p.class_lesson_id cl, p.step_id sid, p.answer, p.feedback, p.reviewed_at, p.updated_at, p.status, s.kind, s.title, s.body, l.title lesson
    FROM step_progress p JOIN class_lessons c ON c.id=p.class_lesson_id AND c.removed_at IS NULL JOIN lessons l ON l.id=c.lesson_id
    JOIN lesson_steps s ON s.id=p.step_id AND s.lesson_id=c.lesson_id
    WHERE c.class_id=? AND p.user_id=? AND ((s.kind='question' AND p.answer!='') OR (s.kind='build' AND p.feedback!='')) ORDER BY p.updated_at DESC LIMIT 10`, classId, userId);
  // The teacher's written feedback given with a rubric score (a step's or the whole lesson's).
  const notes = q.all(`SELECT r.class_lesson_id cl, r.step_id sid, r.feedback, r.scored_at, l.title lesson, s.title FROM rubric_scores r
    JOIN class_lessons c ON c.id=r.class_lesson_id AND c.removed_at IS NULL JOIN lessons l ON l.id=c.lesson_id
    LEFT JOIN lesson_steps s ON r.step_id!='' AND s.id=r.step_id AND s.lesson_id=c.lesson_id
    WHERE c.class_id=? AND r.user_id=? AND r.feedback!='' AND (r.step_id='' OR s.id IS NOT NULL) ORDER BY r.scored_at DESC LIMIT 10`, classId, userId);
  const lv = SC.classLive(classId, 12);
  const live = lv.runs.filter(r => lv.by.has(`${r.id}:${userId}`)).map(r => ({ run: r, result: lv.by.get(`${r.id}:${userId}`) }));
  // Standards: how many this student meets, is developing or has practiced, per framework with any evidence.
  const standards = [];
  const count = (fw, levels) => { const n = { fw, meets: 0, developing: 0, practiced: 0 }; for (const l of levels) if (l in n) n[l]++; if (n.meets + n.developing + n.practiced) standards.push(n); };
  count('csta', STD.classStandards(classId).rows.map(r => { const x = r.by.get(userId); return !x ? 'none' : x.meets ? 'meets' : x.checked || x.applied ? 'developing' : x.practiced ? 'practiced' : 'none'; }));
  for (const fw of FW.IDS.filter(FW.isCcss)) count(fw, CC.classView(classId, fw).rows.map(r => (r.by.get(userId) || { level: 'none' }).level));
  return {
    student: p, lessons: gb.lessons.map((cl, i) => ({ cl, cell: p.cells[i] })),
    workDone: p.cells.some(x => !x.locked && x.total) ? p.overall : null, score: p.score, lateCount: p.lateCount,
    toRead: p.cells.reduce((n, x) => n + (x.toRead || 0), 0), answers, notes, live, standards,
  };
}
