// The courses (server/services/courses.js) as plain data, so the game lists can leave course games out without an
// import cycle. A course's games are played only as part of the course (docs/decisions.md "Courses on the home page").
// A game entry may be marked `shared`: the course's steps play it, but the course does not own it — the game keeps
// its own page and its place in the open lists, and another course (or no course) is its owner. Cyber Defenders
// shares both of its games: Packet Post is CS Quest's, and Would You Rather is an open game whose "online" topic
// bank carries the Defender judgement missions.
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
  {
    slug: 'cyber-defenders', emoji: '🦉', key: 'courses.cd', teacherPath: '/teachers',
    // The order the units teach them in (units 1-2 and 4 play Packet Post; unit 3 plays Would You Rather).
    games: [
      { slug: 'packet-post', topic: 'networks', shared: true },
      { slug: 'would-you-rather', topic: 'choices', shared: true },
    ],
  },
]);
/** The course that owns a game (an unshared listing), or null: shared games and open games have no owner here. */
export const courseOfSlug = slug => COURSES.find(c => c.games.some(g => g.slug === slug && !g.shared)) || null;
/** The slugs of every owned course game: they stay out of the open game lists (rails, search, similar, playing now). */
export const COURSE_GAME_SLUGS = Object.freeze([...new Set(COURSES.flatMap(c => c.games.filter(g => !g.shared).map(g => g.slug)))]);
