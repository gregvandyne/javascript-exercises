// Oomba Breathe & Bend completions (the "Move" area, /move). A Brain Break counts only when playback
// actually reaches the end of Starfish Rest: the player posts once at that moment, and only then.
// Opening the page, starting it, or leaving halfway writes nothing (Greg's win-gated completion rule,
// applied to a video-length activity). Guests play free and store nothing: their finish is a
// session-only acknowledgement on the page (Greg's guest rule). Signed-in, non-guest users get one
// row per episode (move_completions, migration 0052); a repeat finish is the same row, never two.
import { q, now } from '../db.js';
import { episodeById } from './move-data.js';

export * from './move-data.js';

/** May this user's finish be stored? Signed in and not a guest. */
export const canStore = u => !!u && !u.is_guest;

/** Record a finished episode. -> { ok, stored, already } (stored false for a guest, by design). */
export function complete(u, episodeId) {
  const e = episodeById(String(episodeId || ''));
  if (!e) return { ok: false, code: 'notFound' };
  if (!canStore(u)) return { ok: true, stored: false, already: false };
  const had = q.get('SELECT user_id FROM move_completions WHERE user_id=? AND episode=?', u.id, e.id);
  q.run('INSERT OR IGNORE INTO move_completions (user_id, episode, completed_at) VALUES (?, ?, ?)', u.id, e.id, now());
  return { ok: true, stored: true, already: !!had };
}

/** This user's finished episodes: { <episodeId>: completed_at }. */
export const completionsFor = u => (canStore(u)
  ? Object.fromEntries(q.all('SELECT episode, completed_at FROM move_completions WHERE user_id=?', u.id).map(r => [r.episode, r.completed_at]))
  : {});
