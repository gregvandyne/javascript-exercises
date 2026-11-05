// The courses (server/services/courses.js) as plain data, so the game lists can leave course games out without an
// import cycle. A course's games are played only as part of the course (docs/decisions.md "Courses on the home page").
// A game entry may be marked `shared`: the course's steps play it, but the course does not own it — the game keeps
// its own page and its place in the open lists, and another course (or no course) is its owner. Cyber Defenders
// shares two games it borrows: Packet Post is CS Quest's, and Would You Rather is an open game whose "online"
// topic bank carries the Defender judgement missions. Its other two games (Trick Inbox, Escape the Post Office)
// were built solely for Cyber Defenders, so the course owns them: they are unshared here and carry
// course_only=1 on the games row (migration 0047, seed JSON "course_only"), which keeps them out of every
// public catalogue surface — they are played only inside the course.
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
    slug: 'cyber-defenders', emoji: '🦉', key: 'courses.cd', teacherPath: '/teachers/cyber-defenders',
    // The order the units teach them in (units 1-2 and 4 play Packet Post; unit 3 plays Would You Rather;
    // unit 4's response missions and 6.3 play Trick Inbox; the 6.4 finale plays Escape the Post Office —
    // both Phase 2 games are Cyber Defenders' own, so they are unshared and course-only).
    games: [
      { slug: 'packet-post', topic: 'networks', shared: true },
      { slug: 'would-you-rather', topic: 'choices', shared: true },
      { slug: 'trick-inbox', topic: 'cybersecurity' },
      { slug: 'escape-the-post-office', topic: 'cybersecurity' },
    ],
  },
  {
    slug: 'number-quest', emoji: '🔢', key: 'courses.nq', teacherPath: '/teachers/number-quest',
    // The order the units teach them in (Unit 1 plays Brain Board and Quest Race, Units 2-3 Sum Racer,
    // Unit 4 Fraction Factory). All four are shared: three are open-library engines whose maths lives in
    // this course's banks, and Fraction Factory keeps its own page in the library too.
    games: [
      { slug: 'brain-board', topic: 'numbers', shared: true },
      { slug: 'quest-race', topic: 'numbers', shared: true },
      { slug: 'sum-racer', topic: 'numbers', shared: true },
      { slug: 'fraction-factory', topic: 'fractions', shared: true },
    ],
  },
]);
/** The course that owns a game (an unshared listing), or null: shared games and open games have no owner here. */
export const courseOfSlug = slug => COURSES.find(c => c.games.some(g => g.slug === slug && !g.shared)) || null;
/** The slugs of every owned course game: they stay out of the open game lists (rails, search, similar, playing now). */
export const COURSE_GAME_SLUGS = Object.freeze([...new Set(COURSES.flatMap(c => c.games.filter(g => !g.shared).map(g => g.slug)))]);
