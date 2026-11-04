// Courses: a few official games played in order as one course (docs/decisions.md "Courses on the home page").
// A course is listed on the home page as one wide card with its games nested inside it, and has its own page
// (/courses/<slug>). Nothing is stored: a game counts as started when the player has a play of it.
import { q } from '../db.js';
import * as games from './games.js';

import { COURSES, courseOfSlug } from './course-catalog.js';
export { COURSES, courseOfSlug };
export const getCourse = slug => COURSES.find(c => c.slug === slug) || null;

/** The course's games the viewer may see, in course order, decorated like any card (localized, rated, plays). */
export function courseGames(user, course) {
  const slugs = course.games.map(g => g.slug);
  const v = games.visibleWhere(user);
  const rows = q.all(`${games.SELECT} WHERE g.slug IN (${slugs.map(() => '?').join(',')}) AND ${v.sql}`, ...slugs, ...v.params);
  const bySlug = new Map(games.decorate(rows).map(g => [g.slug, g]));
  return course.games.map((cg, i) => bySlug.get(cg.slug) && { ...bySlug.get(cg.slug), step: i + 1, topic: cg.topic }).filter(Boolean);
}

/** Which of these games the player has started (a play on record). Guests and signed-out players: none. */
export function startedIds(user, list) {
  if (!user || !list.length) return new Set();
  const ids = list.map(g => g.id);
  return new Set(q.all(`SELECT DISTINCT game_id FROM plays WHERE user_id=? AND game_id IN (${ids.map(() => '?').join(',')})`, user.id, ...ids).map(r => r.game_id));
}
