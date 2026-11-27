// Who may see Grammar Lab (server/config.js GRAMMAR_LAB, GRAMMAR_LAB_USERS). Decided at read time, like every flag:
//   - GRAMMAR_LAB off (the default) is the kill switch: every Grammar Lab page, API and read-aloud answers the normal
//     404 for everyone, the platform admin included, and nothing on the site links to it.
//   - GRAMMAR_LAB on: the platform admin, and the accounts whose username is on GRAMMAR_LAB_USERS. '*' on the list
//     opens it to every visitor, guests included (guests play, but nothing they earn is stored: services/grammar-lab.js).
// Grammar Lab sits under /courses/grammar-lab, so the COURSES gate in app.js lets it through for whoever this allows.
import { config } from '../config.js';

/** Is the Grammar Lab flag on? */
export const grammarLabOn = () => !!config.grammarLab;
/** Is this account on GRAMMAR_LAB_USERS (by username; never a guest, whose made-up name is not theirs)? */
export const onGrammarList = u => !!u && !u.is_guest && config.grammarLabUsers.includes(String(u.username || '').toLowerCase());
/** Does GRAMMAR_LAB_USERS open it to everyone ('*')? */
export const openToAll = () => config.grammarLabUsers.includes('*');
/** May this visitor (an account, a guest, or null for no session) see Grammar Lab at all? */
export function mayOpenGrammarLab(u) {
  if (!grammarLabOn()) return false;
  if (u && u.banned) return false;
  if (openToAll()) return true;
  return !!u && !u.is_guest && (u.role === 'admin' || onGrammarList(u));
}
/** The Grammar Lab pages and APIs (the course page, its units and topics, and their APIs). */
export const GRAMMAR_LAB_PATH = /^\/(courses\/grammar-lab|api\/courses\/grammar-lab)(\/|$)/;
