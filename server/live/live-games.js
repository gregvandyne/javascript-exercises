// The official games that are Oomba Live built-in modes (classlive-access.js MODES), by slug: the mode to preselect on
// /live, and the game to practise alone ("Practice solo"). Their cards carry a "Live" badge and their game page leads
// with how to join and host (routes/games.js), so a class game never opens straight into solo play from the home page.
// play: true when the game itself is a full game on its own too (Tug of Math: vs the computer or two players).
// No imports: the views use it too. tests/unit/live-entry.test.js checks it matches MODES.
export const LIVE_GAMES = {
  'quest-race': { mode: 'quest-race', solo: 'quest-race' },
  'question-battle': { mode: 'battle', solo: 'question-battle' },
  'brain-board': { mode: 'board', solo: 'brain-board' },
  'would-you-rather-live': { mode: 'wyr', solo: 'would-you-rather' },
  'atlas-quest-live': { mode: 'atlas', solo: 'atlas-quest' },
  // one game for both: hosted live for a class, or played here against the computer or two on one screen (play: the
  // second button says so, not "Practice solo")
  'tug-of-math': { mode: 'tug', solo: 'tug-of-math', play: true },
};
/** The live entry for an official launch game, or null. */
export const liveGameOf = g => (g && g.source === 'seed' && Object.hasOwn(LIVE_GAMES, g.slug) ? LIVE_GAMES[g.slug] : null);
