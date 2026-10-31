// Oomba Live teacher dashboard data (docs/decisions.md "Oomba Live, part 3"; protocol `dq`, `dp`, `sup`). Pure. These
// messages go to the host's dashboard connection only (s.dash): never to a player, the projector or a game frame.

/** Why a seat may need help: '' (no), 'lowScore', 'wrongRun', 'missRun'.
 *  Quiz: at least 3 answered and under half right; 2 wrong in a row; 2 missed in a row while connected.
 *  Game modes: at least 3 items and under half right (no idle rule: games have their own pace). */
export function needsHelp(seat, { quiz = true } = {}) {
  if (seat.answered >= 3 && seat.correct / seat.answered < 0.5) return 'lowScore';
  if (!quiz) return '';
  if ((seat.wrongRun || 0) >= 2) return 'wrongRun';
  if ((seat.missRun || 0) >= 2 && seat.conn) return 'missRun';
  return '';
}

/** dp: every seat's progress [[seat, answered, correct, wrongRun, missRun, flag]]. */
export const dpMsg = s => ({ t: 'dp', p: [...s.seats.values()].map(x => [x.no, x.answered, x.correct, x.wrongRun || 0, x.missRun || 0, needsHelp(x, { quiz: !!s.quiz })]) });

/** dq: the open question's live answer counts and who has answered (the dashboard's answer bars), and the right answer
 *  (the dashboard keeps it behind "Show answer"; it never reaches a player, the projector or a frame). */
export function dqMsg(s) {
  const c = s.qz && s.qz.cur;
  if (!c) return null;
  const counts = c.choices.map(() => 0);
  for (const a of s.qz.answers.values()) counts[a.c]++;
  const waiting = [...s.seats.values()].filter(x => x.conn && x.ready && !s.qz.answers.has(x.no));
  return { t: 'dq', i: c.i, answer: c.answer, counts, answered: [...s.qz.answers.keys()], extra: waiting.filter(x => (x.acc && x.acc.time > 100)).length };
}

/** sup: support per seat [[seat, time (100|150|200), read 0/1, simple 0/1, saved 0/1]] (seats with any support). */
export const supMsg = s => ({ t: 'sup', p: [...s.seats.values()].filter(x => x.acc).map(x => [x.no, x.acc.time, x.acc.read ? 1 : 0, x.acc.simple ? 1 : 0, x.acc.saved ? 1 : 0]) });
