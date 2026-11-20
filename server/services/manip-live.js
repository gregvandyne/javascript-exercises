// The moving parts of a manipulatives live room that are never stored (docs/decisions.md "Virtual math manipulatives:
// the shared room"): everyone's cursor, raised hands, the deck's current step, the teacher's last "Bring everyone to me", and who is listening.
// Memory only: nothing here is written to the database or to a log line. A cursor goes when its socket closes, after
// IDLE_MS without a move, or when the session ends (forget); the whole room goes with its last listener.
export const IDLE_MS = 10e3;
export const TICK_MS = 100;
/** World bounds a cursor is clamped to (room pixels). */
const LO = -2000, HI = 20000;
const rooms = new Map();   // session id -> { cursors: Map(key -> { x, y, touch, at }), bring: { seq, view }, subs: Set(fn), changed, timer }
const roomOf = sid => {
  let r = rooms.get(sid);
  if (!r) { r = { cursors: new Map(), hands: new Map(), conns: new Map(), step: { cur: 0, pace: false, mine: new Map() }, bring: { seq: 0, view: null }, subs: new Set(), changed: false, timer: null }; rooms.set(sid, r); }
  return r;
};
const n = v => Math.min(HI, Math.max(LO, Math.round(Number(v) || 0)));
/** A cursor moved (key: a student's user id, or 't' for the teacher). */
export function setCursor(sid, key, { x, y, touch = false } = {}) {
  const r = roomOf(sid);
  r.cursors.set(String(key), { x: n(x), y: n(y), touch: !!touch, at: Date.now() });
  r.changed = true;
}
export function dropCursor(sid, key) { const r = rooms.get(sid); if (r && r.cursors.delete(String(key))) r.changed = true; }
/** The live cursors (idle ones dropped): [{ k, x, y, touch }]. */
export function cursorsOf(sid) {
  const r = rooms.get(sid); if (!r) return [];
  const t = Date.now();
  for (const [k, c] of r.cursors) if (t - c.at > IDLE_MS) { r.cursors.delete(k); r.changed = true; }
  return [...r.cursors].map(([k, c]) => ({ k, x: c.x, y: c.y, touch: c.touch }));
}
/** Raised hands, in the order they went up: [{ k, at }]. */
export const handsOf = sid => [...((rooms.get(sid) || {}).hands || new Map())].map(([k, at]) => ({ k, at }));
/** A hand goes up or down (key: a student's id). -> whether anything changed; everyone is told. */
export function setHand(sid, key, up) {
  const r = roomOf(sid), k = String(key), had = r.hands.has(k);
  if (up && !had) r.hands.set(k, Date.now()); else if (!up && had) r.hands.delete(k); else return false;
  publish(sid, { t: 'hands', list: handsOf(sid) });
  return true;
}
/** The teacher lowers every hand. */
export function clearHands(sid) { const r = rooms.get(sid); if (r && r.hands.size) { r.hands.clear(); publish(sid, { t: 'hands', list: [] }); } }
/** A socket of key opened or closed: when someone's last socket closes, their cursor and their hand go. */
export function connected(sid, key, delta) {
  const r = delta > 0 ? roomOf(sid) : rooms.get(sid); if (!r) return;   // a room already forgotten stays forgotten
  const k = String(key), n = (r.conns.get(k) || 0) + delta;
  if (n > 0) { r.conns.set(k, n); return; }
  r.conns.delete(k); dropCursor(sid, k);
  if (r.hands.has(k)) { r.hands.delete(k); publish(sid, { t: 'hands', list: handsOf(sid) }); }
}
/** The deck's position (live, never stored): the teacher's step, whether students go at their own pace, and each
 *  student's own step while they do. */
export const stepOf = sid => { const r = rooms.get(sid); return r ? r.step : { cur: 0, pace: false, mine: new Map() }; };
export function setStep(sid, cur) { const r = roomOf(sid); r.step.cur = cur; if (!r.step.pace) r.step.mine.clear(); publish(sid, { t: 'step' }); }
export function setPace(sid, on) { const r = roomOf(sid); r.step.pace = !!on; r.step.mine.clear(); publish(sid, { t: 'step' }); }
export function setMine(sid, key, i) { const r = roomOf(sid); r.step.mine.set(String(key), i); publish(sid, { t: 'step' }); }
/** The teacher's "Bring everyone to me": the view (a room rectangle) and a number that grows each time. */
export function setBring(sid, view) { const r = roomOf(sid); r.bring = { seq: r.bring.seq + 1, view }; publish(sid, { t: 'bring', ...r.bring }); return r.bring.seq; }
export const bringOf = sid => (rooms.get(sid) || { bring: { seq: 0, view: null } }).bring;
/** Tell every listener of a room (its sockets). */
export function publish(sid, msg) { const r = rooms.get(sid); if (r) for (const fn of r.subs) { try { fn(msg); } catch { /* a closed socket */ } } }
/** A socket listens to a room; cursor batches go out every TICK_MS while something moved. -> unsubscribe */
export function subscribe(sid, fn) {
  const r = roomOf(sid);
  r.subs.add(fn);
  if (!r.timer) {
    r.timer = setInterval(() => {
      const list = cursorsOf(sid);
      if (r.changed) { r.changed = false; publish(sid, { t: 'cur', list }); }
    }, TICK_MS);
    r.timer.unref?.();
  }
  return () => {
    r.subs.delete(fn);
    if (!r.subs.size) { clearInterval(r.timer); r.timer = null; if (!r.cursors.size && !r.hands.size && !r.step.cur && !r.step.pace) rooms.delete(sid); }
  };
}
/** The session ended (or was deleted): everything about it goes. */
export function forget(sid) {
  const r = rooms.get(sid); if (!r) return;
  publish(sid, { t: 'end' });
  clearInterval(r.timer); rooms.delete(sid);
}
/** Tests: what is held right now. */
export const _rooms = rooms;
