// A lesson plan drafted by the AI and saved (docs/decisions.md "Oomba makes it, then reports what it checked"): the one
// pipeline behind the library's "Draft with AI" (routes/lessons.js POST /api/lessons/draft) and Oomba's makeLesson tool
// (services/companion-make.js), so the chat makes exactly what the page's button makes.
//   draft(u, schoolId, args): the AI draft (services/lesson-ai.js draftLesson, its template when the AI is resting), with
//     the game catalog the teacher may use and, for a Figures teacher, the figure catalog. No write.
//   save(u, schoolId, d, opts): the lesson and its steps written (figure steps through figures-steps.js), then read back:
//     how many steps are saved of how many planned. -> { ok, lesson, saved, planned, chk } | { ok: false, code }
import { audit } from '../db.js';
import * as L from './lessons.js';
import * as FS from './figures-steps.js';
import * as F from './figures.js';
import * as games from './games.js';
import { draftLesson } from './lesson-ai.js';
import { gameHidden, mayOpenHidden } from './game-focus.js';
import { liveGameOf } from '../live/live-games.js';

/** May a drafted lesson step use this game for this teacher? Published, not an official game hidden right now (unless
 *  the teacher may open it anyway: game-focus.js mayOpenHidden), and not an Oomba Live game hosted live only (it can't
 *  be a step students play on their own). Chat audit 3: a plan used Sum Racer while the chat said it was off. */
export function stepGameOk(u, g) {
  if (!g || g.status !== 'published') return false;
  if (gameHidden(g) && !mayOpenHidden(u, g)) return false;
  const lg = liveGameOf(g);
  return !(lg && !lg.play);
}

/** The games the draft may use (the teacher's, their school's, the site's) and the figure catalog for a Figures teacher. */
export function catalogs(u, schoolId) {
  const pick = L.gamesForPicker(u, schoolId);
  const catalog = [...pick.school, ...pick.site].map(g => ({ ...g, ...(games.getGame(g.id) || {}) })).filter(g => stepGameOk(u, g)).map(g => ({ id: g.id, title: g.title, description: g.description, tags: g.tags }));
  return { catalog, figures: F.canMake(u) ? F.figureCatalog() : [] };
}
/** The AI's draft (no write). args: { topic, grade, subject, minutes, locale, t } -> { draft, ai, report } */
export async function draft(u, schoolId, args) {
  const { catalog, figures } = catalogs(u, schoolId);
  return draftLesson({ ...args, minutes: Math.max(10, Math.min(180, +args.minutes || 40)) }, catalog, figures);
}
/** The draft saved as a lesson of the teacher's library, read back. */
export function save(u, schoolId, d, { topic = '', subject = '', grade = '', folderId = null, lang = 'en' } = {}) {
  const r = L.createLesson(u, schoolId, { title: d.draft.title || topic, folderId: folderId || null, summary: d.draft.summary, subject: subject || d.draft.subject || '', grade: grade || d.draft.grade || '', objectives: d.draft.objectives });
  if (!r.ok) return r;
  const planned = d.draft.steps || [];
  for (const s0 of planned) {
    // checked again at the save: a game step naming a game the teacher may not use becomes a written step
    const s = s0.kind === 'game' && !stepGameOk(u, games.getGame(s0.gameId)) ? { ...s0, kind: 'text', gameId: null } : s0;
    if (s.kind === L.FIGURES_KIND) { FS.draftedStep(u, r.lesson.id, s, { lang }); continue; }
    L.addStep(u, r.lesson.id, { kind: s.kind, title: s.title, body: s.body, minutes: s.minutes, gameId: s.gameId || null });
  }
  // Checked work (docs/decisions.md "Builders check their work"): the lesson read back as saved.
  const saved = L.steps(r.lesson.id).length, rep = d.report || null;
  const chk = d.ai && rep ? [saved, planned.length, rep.figures.fixed, rep.figures.replaced, rep.figures.dropped, rep.gamesSwapped].join('.') : '';
  audit(u.id, 'lesson.draft', r.lesson.id, { ai: d.ai, saved, planned: planned.length });
  return { ok: true, lesson: L.getLesson(r.lesson.id), saved, planned: planned.length, chk };
}
