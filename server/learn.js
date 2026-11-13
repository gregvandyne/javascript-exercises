// What the launch games teach, and the subject pages (/learn/<hub>) that list them. Plain data, no database work, so
// server/seo.js (sitemap, structured data), routes/teachers.js and routes/games.js can all use it.
//
// Only official launch games (source='seed') are ever listed here: never a game a child made. A slug that is not live
// (hidden, unpublished, renamed) simply drops out of the pages: routes/teachers.js looks each one up through canView.
// Text a person reads is in the locale files (learn.games.<key>, learn.hubs.<key>.*); the English below only feeds
// structured data (schema.org "teaches", "educationalLevel"), which search engines read in English.

/** Launch games with something to learn. key: the locale key under learn.games.*; teaches/level: schema.org values. */
export const LEARNING = {
  'sum-racer': { key: 'sumRacer', teaches: ['Addition', 'Subtraction', 'Times tables', 'Division facts', 'Mental math'], level: 'Grades 1-5' },
  'word-hunt': { key: 'wordHunt', teaches: ['Spelling', 'Vocabulary', 'Word recognition'], level: 'Grades 1-5' },
  'shark-plank': { key: 'sharkPlank', teaches: ['Spelling', 'Letter sounds', 'Early reading'], level: 'Grades K-3' },
  'word-peek': { key: 'wordPeek', teaches: ['Spelling', 'Vocabulary', 'Logical reasoning'], level: 'Grades 3-8' },
  'castle-clash': { key: 'castleClash', teaches: ['Chess', 'Strategic thinking', 'Planning ahead'], level: 'Grades 2-8' },
  'connect-four': { key: 'connectFour', teaches: ['Strategic thinking', 'Pattern recognition'], level: 'Grades 1-8' },
  'brick-drop': { key: 'brickDrop', teaches: ['Spatial reasoning', 'Pattern recognition'], level: 'Grades 2-8' },
  'loop-lab': { key: 'loopLab', teaches: ['Rhythm', 'Musical patterns', 'Composition'], level: 'Grades 2-8' },
  'beat-lanes': { key: 'beatLanes', teaches: ['Rhythm', 'Timing'], level: 'Grades 1-8' },
  'swish-flick': { key: 'swishFlick', teaches: ['Aim and force', 'Hand-eye coordination'], level: 'Grades 2-8', fun: true },
  'munch-maze': { key: 'munchMaze', teaches: ['Route planning'], level: 'Grades 2-8', fun: true },
  // Tug of Math: the grade picked before each game (1-8) sets the questions, from adding within 20 to equations.
  'tug-of-math': { key: 'tugOfMath', teaches: ['Addition', 'Subtraction', 'Multiplication', 'Division', 'Order of operations', 'Percentages', 'Integers', 'Equations'], level: 'Grades 1-8' },
  // Remi's Quiet Meadow: a classroom noise meter (the play page measures how loud the room is; nothing is recorded). A
  // class tool, so on the teacher page's "Play to learn" cards but in no subject hub or age page.
  'remis-quiet-meadow': { key: 'remisQuietMeadow', teaches: ['Self-regulation', 'Voice levels', 'Classroom routines'], level: 'Grades K-8' },
  // Quiet Bounce and Popcorn Hush: two more noise meters on the same page-side loudness as Remi's (a box of bouncy balls
  // that rattle and jump, a popcorn machine whose kernels pop when the room is too loud).
  'quiet-bounce': { key: 'quietBounce', teaches: ['Self-regulation', 'Voice levels', 'Classroom routines'], level: 'Grades K-8' },
  'popcorn-hush': { key: 'popcornHush', teaches: ['Self-regulation', 'Voice levels', 'Classroom routines'], level: 'Grades K-8' },
  // The CS Quest games (docs/cs-quest.md): each chapter is a lesson of the program, grades 3-5 (Explorer) and 6-8 (Pro).
  'robo-route': { key: 'roboRoute', teaches: ['Sequences', 'Loops', 'Conditionals', 'Variables', 'Functions', 'Debugging'], level: 'Grades 3-8' },
  'data-detective': { key: 'dataDetective', teaches: ['Organizing data', 'Charts', 'Claims from data', 'Cleaning data', 'Fairness in data'], level: 'Grades 3-8' },
  'packet-post': { key: 'packetPost', teaches: ['Packets', 'Routing', 'Protocols', 'Passphrases', 'Spotting tricks', 'Ciphers'], level: 'Grades 3-8' },
  'inside-the-machine': { key: 'insideTheMachine', teaches: ['Computer parts', 'Hardware and software', 'Troubleshooting', 'Bits and pixels', 'Designing for everyone'], level: 'Grades 3-8' },
  // Doodle Hoot: draw a word, or guess one (typed, out loud, or with letter tiles); Easy, Medium or Tricky words in 13 languages.
  'doodle-hoot': { key: 'doodleHoot', teaches: ['Spelling', 'Vocabulary', 'Drawing', 'Languages'], level: 'Grades 1-8' },
  // Word Trail: the 220 Dolch sight words (Pre-primer to Grade 3) in short lessons on a trail, every word read aloud.
  'word-trail': { key: 'wordTrail', teaches: ['Sight words', 'Early reading', 'Listening', 'Spelling'], level: 'Grades K-3' },
};
/** The grade band of some launch games, for the visible "Grades 1–5" line: { from, to } ('K' or a number), or null. */
export function gradeBand(slugs) {
  const bands = slugs.map(s => /^Grades (K|\d+)-(\d+)$/.exec((LEARNING[s] || {}).level || '')).filter(Boolean);
  if (!bands.length) return null;
  const n = v => (v === 'K' ? 0 : +v);
  const from = Math.min(...bands.map(b => n(b[1]))), to = Math.max(...bands.map(b => n(b[2])));
  return { from: from === 0 ? 'K' : String(from), to: String(to) };
}
/** The subject page a launch game belongs to (its first one; brain breaks are a mix, never a game's home). */
export const hubOfGame = slug => HUBS.find(h => h.games.includes(slug) && h.slug !== 'brain-break-games') || null;
/** Games that count as learning resources in structured data (the rest are only VideoGame). */
export const isLearningGame = slug => !!LEARNING[slug] && !LEARNING[slug].fun;

/** The subject pages, in menu order. path: /learn/<slug>; key: locale key under learn.hubs.*; games: launch-game slugs. */
export const HUBS = [
  { slug: 'math-games', key: 'math', emoji: '➗', games: ['sum-racer', 'tug-of-math'], extra: 'tracks' },
  { slug: 'word-games', key: 'words', emoji: '🔤', games: ['word-trail', 'shark-plank', 'word-hunt', 'word-peek', 'doodle-hoot'] },
  { slug: 'strategy-games', key: 'strategy', emoji: '♟️', games: ['castle-clash', 'connect-four', 'brick-drop'] },
  { slug: 'music-games', key: 'music', emoji: '🎵', games: ['loop-lab', 'beat-lanes'] },
  // The four CS Quest games; the page also points teachers at the program (/teachers/cs-quest).
  { slug: 'computer-science', key: 'cs', emoji: '💻', games: ['robo-route', 'data-detective', 'packet-post', 'inside-the-machine'], extra: 'cs' },
  { slug: 'brain-break-games', key: 'brainBreaks', emoji: '⏱️', games: ['beat-lanes', 'swish-flick', 'brick-drop', 'munch-maze', 'word-peek'] },
  { slug: 'make-a-game', key: 'makeAGame', emoji: '🛠️', games: [], extra: 'builder' },
];
export const hubBySlug = slug => HUBS.find(h => h.slug === slug) || null;
/** The teacher page's "Play to learn" cards, in order. */
export const TEACHER_GAMES = ['sum-racer', 'word-hunt', 'shark-plank', 'word-peek', 'castle-clash', 'connect-four', 'loop-lab', 'beat-lanes', 'remis-quiet-meadow', 'quiet-bounce', 'popcorn-hush', 'doodle-hoot', 'word-trail'];
/** Questions on each page (learn.hubs.<key>.faq.q<n> / a<n>, teachers.faq.q<n> / a<n>). */
export const HUB_FAQ = { math: 4, words: 4, strategy: 4, music: 3, cs: 3, brainBreaks: 2, makeAGame: 7 };
/** Subject pages with an "At home" paragraph for parents (learn.hubs.<key>.home). */
export const HOME_TIPS = ['math', 'words', 'strategy', 'music'];
export const TEACHER_FAQ = 9;
/** Last change to the teacher and subject pages' text (sitemap lastmod). Change it with the text. */
export const CONTENT_UPDATED = '2026-11-10';

// ---------------------------------------------------------------------------------------------------- parents
// The parent pages (routes/parents.js): /parents, the guides under /parents/<guide>, and the age pages
// /learn/games-for-…. Same rule as above: only official launch games, looked up through canView. Ring Rumble (fighting),
// Happy Putt (film-inspired) and Footy Tycoon (its "legends" need a check for real players' names) stay off them.

/** A launch game's locale key under learn.games.* and learn.ages.<age>.fit.* (also for the games LEARNING doesn't list). */
export const gameKey = slug => (LEARNING[slug] ? LEARNING[slug].key : { 'hero-of-sunvale': 'heroOfSunvale' }[slug] || null);
/** The /parents page's "Learning that feels like play" cards, in order. */
export const PARENT_GAMES = ['sum-racer', 'word-hunt', 'shark-plank', 'word-peek', 'castle-clash', 'loop-lab', 'beat-lanes', 'hero-of-sunvale'];
/** Games with a two-player mode on one screen. */
export const TWO_PLAYER = ['sum-racer', 'castle-clash', 'connect-four', 'tug-of-math'];
/** Age pages: path /learn/<slug>; key: locale key under learn.ages.*; games in order, each with a "why it fits" line
 *  (learn.ages.<key>.fit.<gameKey>); make: where the "make your own game" panel goes ('first' before the games). Grouped
 *  by two or three years, not one page per age: with 15 launch games, single-age pages would be thin. */
export const AGES = [
  // Ages 5 to 7 (kindergarten to grade 2): only games whose own grade band starts at K, 1 or 2 and that a child who is
  // still learning to read can play (words read aloud, or numbers, music and pictures). The courses start in grade 3,
  // and the page says so.
  { slug: 'games-for-5-to-7-year-olds', key: 'a5', min: 5, max: 7, emoji: '🧸', games: ['word-trail', 'shark-plank', 'sum-racer', 'word-hunt', 'tug-of-math', 'beat-lanes', 'connect-four', 'doodle-hoot'], faq: 4 },
  { slug: 'games-for-8-and-9-year-olds', key: 'a8', min: 8, max: 9, emoji: '🎈', games: ['sum-racer', 'word-hunt', 'shark-plank', 'castle-clash', 'connect-four', 'loop-lab', 'beat-lanes', 'munch-maze', 'tug-of-math', 'doodle-hoot'], faq: 4 },
  { slug: 'games-for-10-and-11-year-olds', key: 'a10', min: 10, max: 11, emoji: '🚀', games: ['sum-racer', 'word-peek', 'castle-clash', 'brick-drop', 'loop-lab', 'hero-of-sunvale', 'swish-flick', 'tug-of-math', 'doodle-hoot'], make: 'after', faq: 4 },
  { slug: 'games-for-12-to-14-year-olds', key: 'a12', min: 12, max: 14, emoji: '🎧', games: ['castle-clash', 'word-peek', 'brick-drop', 'loop-lab', 'beat-lanes', 'hero-of-sunvale', 'tug-of-math'], make: 'first', faq: 4 },
];
export const ageBySlug = slug => AGES.find(a => a.slug === slug) || null;
/** Guides for parents: path /parents/<slug>; key: locale key under parents.<key>.*. */
export const PARENT_GUIDES = [
  { slug: 'ai-builder-safety', key: 'ai', emoji: '🤖', faq: 5, published: '2026-10-28' },
  { slug: 'safety-and-screen-time', key: 'screen', emoji: '⏱️', faq: 4, published: '2026-10-28' },
];
export const guideBySlug = slug => PARENT_GUIDES.find(g => g.slug === slug) || null;
export const PARENTS_FAQ = 10;
/** A launch game's ages for the visible "Ages 6–11" line, from its grades (grade N is about age N+5 to N+6, so
 *  kindergarten is about 5), within the site's 5 to 14 (seo.AGE): { from, to }, or null. */
export function ageBand(slug) {
  const b = gradeBand([slug]); if (!b) return null;
  const from = Math.max(5, (b.from === 'K' ? 0 : +b.from) + 5), to = Math.min(14, +b.to + 6);
  return to > from ? { from: String(from), to: String(to) } : null;
}

// ---------------------------------------------------------------------------------------------------- Play and Learn
// The game library's two shelves (docs/decisions.md "Play and Learn"): every official game is on Play (fun first) or
// Learn (teaches something); seed JSON "shelf" is the source of truth (services/games.js SHELF_SQL). The Learn tab's
// filters read this: each Learn game's subject and grades (from, to: 0 = Kindergarten). live: hosted for a whole class
// (live/live-games.js LIVE_GAMES), two: two players on one screen.
/** The Learn tab's subjects, in chip order. hub: the subject page with more about it (/learn/<hub>), if there is one. */
export const SUBJECTS = [
  { key: 'math', emoji: '➗', hub: 'math-games' },
  { key: 'words', emoji: '🔤', hub: 'word-games' },
  { key: 'maps', emoji: '🌍', hub: null },
  { key: 'code', emoji: '💻', hub: 'computer-science' },
  { key: 'thinking', emoji: '♟️', hub: 'strategy-games' },
  { key: 'music', emoji: '🎵', hub: 'music-games' },
];
const band = s => { const m = /^(K|\d+)-(\d+)$/.exec(s); return { from: m[1] === 'K' ? 0 : +m[1], to: +m[2] }; };
/** Each Learn-shelf launch game: subject ('any' = live quizzes for any subject) and grades. */
export const SHELF_INFO = Object.fromEntries(Object.entries({
  'shark-plank': ['words', 'K-3'], 'word-hunt': ['words', '1-5'], 'word-peek': ['words', '3-8'], 'word-trail': ['words', 'K-3'], 'doodle-hoot': ['words', '1-8'],
  'sum-racer': ['math', '1-5'], 'fraction-factory': ['math', '3-5'], 'tug-of-math': ['math', '1-8'], 'garden-count': ['math', 'K-1'], 'lily-hop': ['math', 'K-1'], 'crate-stacker': ['math', '1-2'], 'balance-bridge': ['math', '1-2'], 'rocket-supply': ['math', '2-2'], 'shape-hunt': ['math', 'K-2'],
  'castle-clash': ['thinking', '2-8'], 'loop-lab': ['music', '2-8'],
  'atlas-quest': ['maps', '3-8'], 'atlas-quest-live': ['maps', '3-8'],
  'code-isle': ['code', '4-8'], 'packet-post': ['code', '3-8'], 'inside-the-machine': ['code', '3-8'], 'data-detective': ['code', '3-8'], 'robo-route': ['code', '3-8'],
  'trick-inbox': ['code', '3-6'], 'escape-the-post-office': ['code', '3-6'],
  'quest-race': ['any', 'K-8'], 'question-battle': ['any', 'K-8'], 'brain-board': ['any', 'K-8'], 'would-you-rather-live': ['any', 'K-8'],
}).map(([slug, [subject, grades]]) => [slug, { subject, ...band(grades) }]));
/** Fun Play games a teacher can put on the big screen for a few minutes (the Classroom home's "Brain breaks"). */
export const BRAIN_BREAKS = ['swish-flick', 'beat-lanes', 'would-you-rather', 'brick-drop', 'remis-quiet-meadow'];
/** Learn games kids pick for fun: Play's "From Learn: fun ones" shelf. */
export const LEARN_FUN = ['atlas-quest', 'sum-racer', 'code-isle', 'tug-of-math'];
/** Classroom tools on the Play shelf (the noise meters: Remi, Quiet Bounce, Popcorn Hush): never Play's hero or featured, still in search. */
export const CLASS_TOOLS = ['remis-quiet-meadow', 'quiet-bounce', 'popcorn-hush'];
/** Grades for display ({ from: 'K' | '1'.., to }) of a Learn game, or null. */
export const shelfGrades = slug => { const i = SHELF_INFO[slug]; return i ? { from: i.from === 0 ? 'K' : String(i.from), to: String(i.to) } : null; };
