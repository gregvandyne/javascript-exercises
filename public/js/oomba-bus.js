// The meeting point of Oomba, the teaching companion (public/js/companion.js), and a page that has its own Oomba
// workflow (docs/decisions.md "Oomba teaching companion: one chat everywhere"): a Figures worksheet
// (public/js/figures-sheet.js) and a Manipulatives board (public/js/manip.js). There is one Oomba panel on every page;
// such a page registers an adapter here (what the page is, what goes with a message, how its changes look and are put
// on the page, its ideas and its buttons), and talks to the panel through chat() (open, quote, send, its state).
// Both sides import this file by the same address, so they share it whichever loads first.
const B = { page: null, chat: null, pageWaiters: new Set(), chatWaiters: [] };
/** The page's adapter (null when the page leaves). */
export function setPage(adapter) { B.page = adapter || null; for (const f of B.pageWaiters) { try { f(B.page); } catch { /* a listener's own problem */ } } }
export const page = () => B.page;
/** The panel tells the bus it is up (companion.js). */
export function setChat(handle) { B.chat = handle; const w = B.chatWaiters; B.chatWaiters = []; for (const f of w) f(handle); }
export const chat = () => B.chat;
/** f(chat) now, or once the panel is up. */
export function whenChat(f) { if (B.chat) f(B.chat); else B.chatWaiters.push(f); }
/** f(adapter) whenever the page's adapter changes. */
export function onPage(f) { B.pageWaiters.add(f); return () => B.pageWaiters.delete(f); }
