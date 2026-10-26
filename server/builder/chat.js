// The stored Builder conversation (builder_chats). One row per game.
// The transcript holds what was SAID plus short summaries of what the Builder DID ("Built version 3: Added a dragon").
// It never holds game source (that lives in game_versions) and never holds upload bytes (only "[picture: x.png]" notes).
// While a build runs, the transcript is written as it goes (user message, final reply, the interrupted reply at a
// restart), always through appendChat/updateChat on a freshly read row: never hold a loaded chat across an await.
import { q, uid, now, tx } from '../db.js';

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

/** Append entries in one transaction, always to the fresh row (others may have written during the build). Inserts the
 *  row for a brand-new game, like saveChat. state: replaces the stored Builder state when given. */
export function appendChat(gameId, userId, entries, { state, tokensIn = 0, tokensOut = 0 } = {}) {
  tx(() => {
    const chat = loadChat(gameId);
    saveChat(gameId, userId, { messages: [...chat.messages, ...(entries || [])], state: state === undefined ? chat.state : state, tokensIn, tokensOut });
  });
}
/** Change entries in place (e.g. statuses), in one transaction, on the fresh row. fn(messages) mutates the list. */
export function updateChat(gameId, fn) {
  tx(() => {
    const r = q.get('SELECT id, messages FROM builder_chats WHERE game_id=?', gameId); if (!r) return;
    const messages = parse(r.messages, []); fn(messages);
    q.run('UPDATE builder_chats SET messages=?, updated_at=? WHERE id=?', JSON.stringify(messages.slice(-MAX_MESSAGES)), now(), r.id);
  });
}

/** One line per Builder action, for the transcript the model sees on later turns.
 *  Anything else gives '' and is dropped: ['steps', rec] (the live build steps record, steps.js) and ['carried', …]
 *  are for the Studio only and must never reach the model. */
export function summariseEvents(events) {
  return (events || []).map(([name, d]) => {
    if (name === 'version') return `[Built version ${d.number}: ${d.notes} (safety check: ${d.status})]`;
    if (name === 'ask') return `[Asked: "${d.question}" with options: ${(d.options || []).join(' | ')}]`;
    if (name === 'meta') return `[Set game details: "${d.title}" ${d.icon}, ${d.category}]`;
    if (name === 'notes') return `[Things to try: ${(d.checklist || []).join('; ')}]`;
    if (name === 'playtest') return `[Playtested version ${d.version}: ${d.problems ? `${d.problems} problem(s) found` : 'no problems found'}]`;
    if (name === 'stopped') return '[The build stopped early because the server restarted. Anything built before that is saved.]';
    if (name === 'resumed') return `[The server restarted during this build; carried on${d && d.v ? ` from version ${d.v}` : ''}.]`;
    return '';
  }).filter(Boolean).join('\n');
}
