// The stored Builder conversation (builder_chats). One row per game.
// The transcript holds what was SAID plus short summaries of what the Builder DID ("Built version 3: Added a dragon").
// It never holds game source (that lives in game_versions) and never holds upload bytes (only "[picture: x.png]" notes).
import { q, uid, now } from '../db.js';

const MAX_MESSAGES = 300;
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

export function loadChat(gameId) {
  const r = q.get('SELECT * FROM builder_chats WHERE game_id=?', gameId);
  if (!r) return { id: null, messages: [], state: {}, tokensIn: 0, tokensOut: 0 };
  return { id: r.id, messages: parse(r.messages, []), state: parse(r.state, {}), tokensIn: r.tokens_in, tokensOut: r.tokens_out };
}
export function saveChat(gameId, userId, { messages, state, tokensIn = 0, tokensOut = 0 }) {
  const t = now(); const msgs = JSON.stringify((messages || []).slice(-MAX_MESSAGES)); const st = JSON.stringify(state || {});
  const r = q.get('SELECT id FROM builder_chats WHERE game_id=?', gameId);
  if (r) q.run('UPDATE builder_chats SET messages=?, state=?, tokens_in=tokens_in+?, tokens_out=tokens_out+?, updated_at=? WHERE id=?', msgs, st, tokensIn, tokensOut, t, r.id);
  else q.run('INSERT INTO builder_chats(id, game_id, user_id, messages, state, tokens_in, tokens_out, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)', uid(), gameId, userId, msgs, st, tokensIn, tokensOut, t, t);
}

/** One line per Builder action, for the transcript the model sees on later turns. */
export function summariseEvents(events) {
  return (events || []).map(([name, d]) => {
    if (name === 'version') return `[Built version ${d.number}: ${d.notes} (safety check: ${d.status})]`;
    if (name === 'ask') return `[Asked: "${d.question}" with options: ${(d.options || []).join(' | ')}]`;
    if (name === 'meta') return `[Set game details: "${d.title}" ${d.icon}, ${d.category}]`;
    if (name === 'notes') return `[Things to try: ${(d.checklist || []).join('; ')}]`;
    return '';
  }).filter(Boolean).join('\n');
}
