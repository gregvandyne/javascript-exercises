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
  { slug: 'math-games', key: 'math', emoji: '➗', games: ['sum-racer'], extra: 'tracks' },
  { slug: 'word-games', key: 'words', emoji: '🔤', games: ['shark-plank', 'word-hunt', 'word-peek'] },
  { slug: 'strategy-games', key: 'strategy', emoji: '♟️', games: ['castle-clash', 'connect-four', 'brick-drop'] },
  { slug: 'music-games', key: 'music', emoji: '🎵', games: ['loop-lab', 'beat-lanes'] },
  { slug: 'brain-break-games', key: 'brainBreaks', emoji: '⏱️', games: ['beat-lanes', 'swish-flick', 'brick-drop', 'munch-maze', 'word-peek'] },
  { slug: 'make-a-game', key: 'makeAGame', emoji: '🛠️', games: [], extra: 'builder' },
];
export const hubBySlug = slug => HUBS.find(h => h.slug === slug) || null;
/** The teacher page's "Play to learn" cards, in order. */
export const TEACHER_GAMES = ['sum-racer', 'word-hunt', 'shark-plank', 'word-peek', 'castle-clash', 'connect-four', 'loop-lab', 'beat-lanes'];
/** Questions on each page (learn.hubs.<key>.faq.q<n> / a<n>, teachers.faq.q<n> / a<n>). */
export const HUB_FAQ = { math: 4, words: 4, strategy: 4, music: 3, brainBreaks: 2, makeAGame: 7 };
/** Subject pages with an "At home" paragraph for parents (learn.hubs.<key>.home). */
export const HOME_TIPS = ['math', 'words', 'strategy', 'music'];
export const TEACHER_FAQ = 9;
/** Last change to the teacher and subject pages' text (sitemap lastmod). Change it with the text. */
export const CONTENT_UPDATED = '2026-10-28';

// ---------------------------------------------------------------------------------------------------- parents
// The parent pages (routes/parents.js): /parents, the guides under /parents/<guide>, and the age pages
// /learn/games-for-…. Same rule as above: only official launch games, looked up through canView. Ring Rumble (fighting),
// Happy Putt (film-inspired) and Footy Tycoon (its "legends" need a check for real players' names) stay off them.

/** A launch game's locale key under learn.games.* and learn.ages.<age>.fit.* (also for the games LEARNING doesn't list). */
export const gameKey = slug => (LEARNING[slug] ? LEARNING[slug].key : { 'hero-of-sunvale': 'heroOfSunvale' }[slug] || null);
/** The /parents page's "Learning that feels like play" cards, in order. */
export const PARENT_GAMES = ['sum-racer', 'word-hunt', 'shark-plank', 'word-peek', 'castle-clash', 'loop-lab', 'beat-lanes', 'hero-of-sunvale'];
/** Games with a two-player mode on one screen. */
export const TWO_PLAYER = ['sum-racer', 'castle-clash', 'connect-four'];
/** Age pages: path /learn/<slug>; key: locale key under learn.ages.*; games in order, each with a "why it fits" line
 *  (learn.ages.<key>.fit.<gameKey>); make: where the "make your own game" panel goes ('first' before the games). Grouped
 *  by two or three years, not one page per age: with 15 launch games, single-age pages would be thin. */
export const AGES = [
  { slug: 'games-for-8-and-9-year-olds', key: 'a8', min: 8, max: 9, emoji: '🎈', games: ['sum-racer', 'word-hunt', 'shark-plank', 'castle-clash', 'connect-four', 'loop-lab', 'beat-lanes', 'munch-maze'], faq: 4 },
  { slug: 'games-for-10-and-11-year-olds', key: 'a10', min: 10, max: 11, emoji: '🚀', games: ['sum-racer', 'word-peek', 'castle-clash', 'brick-drop', 'loop-lab', 'hero-of-sunvale', 'swish-flick'], make: 'after', faq: 4 },
  { slug: 'games-for-12-to-14-year-olds', key: 'a12', min: 12, max: 14, emoji: '🎧', games: ['castle-clash', 'word-peek', 'brick-drop', 'loop-lab', 'beat-lanes', 'hero-of-sunvale'], make: 'first', faq: 4 },
];
export const ageBySlug = slug => AGES.find(a => a.slug === slug) || null;
/** Guides for parents: path /parents/<slug>; key: locale key under parents.<key>.*. */
export const PARENT_GUIDES = [
  { slug: 'ai-builder-safety', key: 'ai', emoji: '🤖', faq: 5 },
  { slug: 'safety-and-screen-time', key: 'screen', emoji: '⏱️', faq: 4 },
];
export const guideBySlug = slug => PARENT_GUIDES.find(g => g.slug === slug) || null;
export const PARENTS_FAQ = 10;
/** A launch game's ages for the visible "Ages 8–11" line, from its grades (grade N is about age N+5 to N+6), within the
 *  site's 8 to 14: { from, to }, or null. */
export function ageBand(slug) {
  const b = gradeBand([slug]); if (!b) return null;
  const from = Math.max(8, (b.from === 'K' ? 0 : +b.from) + 5), to = Math.min(14, +b.to + 6);
  return to > from ? { from: String(from), to: String(to) } : null;
}
