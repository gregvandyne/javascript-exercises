// The courses (server/services/courses.js) as plain data, so the game lists can leave course games out without an
// import cycle. A course's games are played only as part of the course (docs/decisions.md "Courses on the home page").
export const COURSES = Object.freeze([
  {
    slug: 'cs-quest', emoji: '💻', key: 'courses.cs', teacherPath: '/teachers/cs-quest',
    // The order the lessons teach them in (units 1-2, 3, 4, 5).
    games: [
      { slug: 'robo-route', topic: 'coding' },
      { slug: 'data-detective', topic: 'data' },
      { slug: 'packet-post', topic: 'networks' },
      { slug: 'inside-the-machine', topic: 'computers' },
    ],
  },
]);
/** The course a game belongs to, or null. */
export const courseOfSlug = slug => COURSES.find(c => c.games.some(g => g.slug === slug)) || null;
/** The slugs of every course game: they stay out of the open game lists (rails, search, similar, playing now). */
export const COURSE_GAME_SLUGS = Object.freeze(COURSES.flatMap(c => c.games.map(g => g.slug)));
