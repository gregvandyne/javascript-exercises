// The focus on teaching tools (owner, 24 Nov 2026; docs/decisions.md "Focus: teaching tools first"). Two flags in
// server/config.js decide what the site shows; nothing is deleted and no row changes, so a seed re-import on startup
// can't undo it and turning a flag on brings everything back at once:
//   ARCADE (config.arcade, off by default): the official arcade games below are left out of every list (Play, Learn,
//     search, the sitemap, Oomba's game suggestions, the landing page) and their /g and /play pages say "not available
//     right now". Games people made with the Builder are never hidden. The Builder's Arcade kind is hidden too.
//   COURSES (config.courses, off by default): the ready-made courses (CS Quest, Number Quest, Cyber Defenders) answer
//     the normal 404 and are left off every page.
// Both are decided at read time. Exceptions, so nothing a class already has breaks: the platform admin, and the people
// of a class that has the game (or, for courses, a course lesson) assigned.
import { q } from '../db.js';
import { config } from '../config.js';
import { canonicalSlug } from './slug-aliases.js';

/** The official (seed-games/) games hidden while ARCADE is off. HIDDEN_GAMES (comma separated) replaces this list. */
export const HIDDEN_GAMES = Object.freeze([
  'quest-race', 'shark-plank', 'word-trail', 'balance-bridge', 'crate-stacker', 'fraction-factory', 'garden-count',
  'keep-builder', 'kitchen-rush', 'lantern-mix', 'launch-lab', 'lily-hop', 'machine-line', 'rocket-supply', 'scale-scout',
  'shape-hunt', 'sky-lines', 'sub-zero', 'sum-racer', 'sum-spotter', 'robo-route', 'code-isle', 'data-detective',
  'packet-post', 'inside-the-machine', 'trick-inbox', 'escape-the-post-office', 'connect-four', 'footy-tycoon',
  'gulp-city', 'munch-maze', 'ring-rumble', 'brick-drop', 'happy-putt', 'swish-flick', 'jungle-cup', 'hero-of-sunvale',
  'beat-lanes', 'loop-lab', 'would-you-rather',
]);

/** The official games taken off the site for good (owner, 25 Nov 2026; docs/decisions.md "Tug of Math and Question
 *  Battle taken off"): hidden as above whatever ARCADE says, and with them their Oomba Live modes ('tug', 'battle';
 *  classlive-access.js MODES). Nothing is deleted: plays, saves and results stay, and a class that has one assigned
 *  still opens it (mayOpenHidden). */
export const REMOVED_GAMES = Object.freeze(['tug-of-math', 'question-battle']);
/** The removed games right now: REMOVED_GAMES unless config.removedGames (env REMOVED_GAMES) replaces it. */
export const removedGames = () => (config.removedGames ? config.removedGames.map(canonicalSlug) : REMOVED_GAMES);
/** Is this official game's slug removed for good (whatever ARCADE says)? */
export const slugRemoved = slug => removedGames().includes(String(canonicalSlug(slug) || ''));

// (an old slug in HIDDEN_GAMES means the game under its new one: services/slug-aliases.js)
const list = () => [...(arcadeHidden() ? (config.hiddenGames ? config.hiddenGames.map(canonicalSlug) : HIDDEN_GAMES) : []), ...removedGames()];
/** Is the arcade hidden right now (ARCADE off)? */
export const arcadeHidden = () => !config.arcade;
/** Are the courses hidden right now (COURSES off)? */
export const coursesHidden = () => !config.courses;
/** Is this official game's slug hidden right now? */
export const slugHidden = slug => list().includes(String(canonicalSlug(slug) || ''));
/** Is this games row hidden right now? Only official games (source 'seed'): a game someone built is never hidden. */
export const gameHidden = g => !!(g && g.source === 'seed' && slugHidden(g.slug));
/** A list of slugs without the hidden ones (for hand-made lists: hubs, landing cards, suggestions). */
export const keepSlugs = slugs => slugs.filter(s => !slugHidden(s));
/** SQL to add to a games query (alias g) that leaves the hidden official games out (the removed ones whatever ARCADE says). */
export function hiddenSql(alias = 'g') {
  const slugs = list().map(s => `'${String(s).replace(/[^a-z0-9-]/g, '')}'`).join(',');
  return slugs ? ` AND NOT (${alias}.source='seed' AND ${alias}.slug IN (${slugs}))` : '';
}

/** Has one of this person's classes (as a student or a teacher) got this game in an assigned lesson, or did they
 *  assign it themselves? Removed assignments don't count, nor a lesson assigned to some students that leaves them out. */
const MINE = `(cl.assigned_by=? OR (cl.class_id IN (SELECT class_id FROM class_members WHERE user_id=? AND status='active')
    AND (NOT EXISTS (SELECT 1 FROM class_lesson_students x WHERE x.class_lesson_id=cl.id)
      OR EXISTS (SELECT 1 FROM class_lesson_students x WHERE x.class_lesson_id=cl.id AND x.user_id=?)
      OR cl.class_id IN (SELECT class_id FROM class_members WHERE user_id=? AND status='active' AND role!='student'))))`;
const mine = user => [user.id, user.id, user.id, user.id];
export const assignedToMe = (user, gameId) => !!(user && gameId && q.get(`SELECT 1 FROM class_lessons cl
  JOIN lesson_steps s ON s.lesson_id=cl.lesson_id AND s.game_id=?
  WHERE cl.removed_at IS NULL AND ${MINE} LIMIT 1`,
  gameId, ...mine(user)));
/** May this person open a hidden official game anyway? The platform admin, and a class that has it assigned. */
export const mayOpenHidden = (user, g) => !!(user && (user.role === 'admin' || assignedToMe(user, g && g.id)));

/** Has one of this person's classes a ready-made course lesson assigned (lessons.kind='course'), or did they assign
 *  one? Those classes keep their course pages while COURSES is off. */
export const hasCourseLesson = user => !!(user && q.get(`SELECT 1 FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id AND l.kind='course'
  WHERE cl.removed_at IS NULL AND ${MINE} LIMIT 1`,
  ...mine(user)));
/** May this person see the courses? Everyone while COURSES is on; else the platform admin and course-lesson classes. */
export const mayOpenCourses = user => !coursesHidden() || !!(user && (user.role === 'admin' || hasCourseLesson(user)));

/** The /learn/<hub> subject pages still worth a page (learn.js HUBS): the make-a-game page, and every page with a game
 *  that is not hidden. All of them while ARCADE is on. */
export const openHubs = hubs => hubs.filter(h => h.extra === 'builder' || keepSlugs(h.games).length);
/** The Learn tab's subject chips (learn.js SUBJECTS) that still have a game (learn.js SHELF_INFO) not hidden. */
export const openSubjects = (subjects, shelfInfo) => subjects.filter(x => Object.entries(shelfInfo).some(([slug, i]) => i.subject === x.key && !slugHidden(slug)));
