// A quick live game's pick and the one code that opens its room (docs/decisions.md "A first live game in under 3
// minutes"). Used by the "Quick game" chooser and POST /api/live/quick (routes/quick-live.js) and by Oomba's hostLive
// action (services/companion-actions/live.js), so a room opened from the chat is the same room the page opens.
import * as LS from './classlive-sessions.js';
import * as A from './classlive-access.js';
import * as ST from './classlive-settings.js';
import { pickerFor, SUBJECTS, LEVELS } from '../live/bank/index.js';
import { slugHidden } from './game-focus.js';

/** How many questions a quick game asks. */
export const QUICK_COUNT = 10;
/** The quick modes on offer: those whose game is not hidden (services/game-focus.js: Quest Race while ARCADE is off,
 *  Question Battle for good), so Brain Board is the quick game while both are. */
export const quickModes = () => ST.QUICK_MODES.filter(m => !slugHidden(A.MODES[m]));
export const MODE_KEY = { battle: 'battle', 'quest-race': 'questRace', board: 'board' };

/** The question bank level that fits a class's grade ("3", "Grade 5", "K"); null when the grade says nothing. */
export function levelForGrade(grade) {
  const g = String(grade ?? '').trim();
  if (/^(k|kg|kindergarten|pre-?k)$/i.test(g)) return 'a6';
  const m = /\d{1,2}/.exec(g);
  if (!m) return null;
  const n = +m[0];
  return n <= 1 ? 'a6' : n <= 3 ? 'a8' : n <= 5 ? 'a10' : n <= 12 ? 'a12' : null;
}
/** The quick pick for this host (and class): the last one used, else Question Battle, a bit of everything, the class's level. */
export function quickPick(u, c = null) {
  const last = (ST.loadPrefs(u.id) || {}).quick || null;
  const p = last && quickModes().includes(last.mode) ? last : { ...(last || { subject: 'mixed', level: 'a8' }), mode: quickModes()[0] };
  // A class's own grade wins over the level of the last game (which may have been another class's).
  const level = (c && levelForGrade(c.grade)) || p.level;
  return { mode: p.mode, subject: p.subject || 'mixed', level, remembered: !!last };
}
/** "Question Battle · Science · Ages 8–9" in the page's language (req: { locale, t }). */
export function pickLine(req, p) {
  const bank = pickerFor(req.locale);
  const subject = p.subject === 'mixed' ? bank.mixed : (bank.subjects.find(x => x.id === p.subject) || {}).name || bank.mixed;
  return [req.t(`live.mode.${MODE_KEY[p.mode]}`), subject, (bank.levels.find(x => x.id === p.level) || {}).name].filter(Boolean).join(' · ');
}
/** The pick for a quick game: last=1 (a class card's one tap) is the remembered pick as it is; otherwise the fields
 *  { mode, subject, level }, each checked (a mode only from quickModes(), so never a hidden game's), else the remembered. */
export function quickPlan(u, c, b = {}) {
  const base = quickPick(u, c);
  if (b.last) return base;
  return {
    mode: quickModes().includes(b.mode) ? b.mode : base.mode,
    subject: b.subject === 'mixed' || SUBJECTS.includes(String(b.subject)) ? String(b.subject) : base.subject,
    level: LEVELS.includes(String(b.level)) ? String(b.level) : base.level,
  };
}
/** Opens a quick room for this host (for class c, else an open room) with the pick. The pick is remembered as the last
 *  one when the room opens. -> LS.createSession's result ({ ok, session } | { ok: false, code, sid? }) */
export function openQuick(u, c, pick, lang = 'en') {
  // Brain Board's starter is a board of categories: the chosen subject first, then others to make five.
  const starter = pick.mode === 'board' ? `bank:board:${pick.level}:${[...new Set([...(SUBJECTS.includes(pick.subject) ? [pick.subject] : []), ...SUBJECTS])].slice(0, 5).join('+')}`
    : `bank:${pick.subject}:${pick.level}:${QUICK_COUNT}`;
  const r = LS.createSession(u, { mode: pick.mode, audience: c ? 'class' : 'open', classId: c ? c.id : null, starter, lang });
  if (r.ok) { try { ST.saveQuickPref(u.id, pick); } catch { /* not important */ } }
  return r;
}
