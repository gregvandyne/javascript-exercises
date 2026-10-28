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
export const HUB_FAQ = { math: 3, words: 3, strategy: 3, music: 2, brainBreaks: 2, makeAGame: 3 };
export const TEACHER_FAQ = 9;
/** Last change to the teacher and subject pages' text (sitemap lastmod). Change it with the text. */
export const CONTENT_UPDATED = '2026-10-28';
