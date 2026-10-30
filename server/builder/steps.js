// Live build steps ("Behind the scenes" in the Studio): what the Builder is really doing, one row per step.
// Rows come only from real server events, in the order they happen (agent.js, claude.js, tools.js, mock.js).
// Over SSE:  step {i, key, at, ...facts}  starts row i (1-based within the turn; the row before it is finished);
//                                      at = ms since this attempt started (structural, like i: not a fact, not stored
//                                      as one), so a page that joins mid-build replays real durations
//            stepinfo {i, ...facts}   updates row i (not always the newest row: a failed edit marks its own row)
// The record's end is ok, error, timeout, restart, deleted, banned, disabled or stopped (runner.js).
// When the turn ends, a compact record (keys, numbers and the AI's short plan only, never any label or learning
// text) is sent with 'done' and stored in the transcript as ['steps', rec]. summariseEvents ignores it, so it never
// reaches the model. Labels and learning lines are drawn by the Studio in the viewer's language.

// resume: instant, fact v (the newest saved version): the build carried on after a server restart (runner.js).
// read: instant, fact m: the building blocks read m new messages the builder sent while they worked (mock.js).
// search: the AI is looking a fact up on the web (search.js); never its query or the sites.
export const STEP_KEYS = ['screen', 'blocks', 'think', 'write', 'edit', 'fix', 'template', 'check', 'name', 'playtest', 'notes', 'ask', 'resume', 'read', 'search'];
const MAX_ROWS = 80;

/** One line of model or player text, safe to show: control and bidi-override characters become spaces, whitespace
 *  collapses, and it is cut to max characters (never in the middle of a surrogate pair). Used for version notes too. */
export function cleanNote(s, max = 200) {
  let out = String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
  if (out.length > max) { out = out.slice(0, max); if (/[\ud800-\udbff]$/.test(out)) out = out.slice(0, -1); out = out.trim(); }
  return out;
}

const cut = (s, n) => Array.from(cleanNote(s, n * 2)).slice(0, n).join('');
const int = (lo, hi) => x => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : undefined);
const oneOf = list => x => (list.includes(x) ? x : undefined);
const flag = x => (x === 1 || x === true ? 1 : undefined);
/** The only facts a row may carry (SSE and storage alike). Anything else is dropped. */
const FACTS = {
  n: int(1, 99),                                         // think: round number (one model call)
  c: oneOf(['start', 'look', 'scan', 'retry', 'next', 'msg']),   // think: why the round started (msg: new messages)
  m: x => (Number.isInteger(x) && x >= 1 && x <= 9 ? x : undefined),   // think (msg), read: how many new messages (1-9)
  g: flag,                                               // think (start): a game already exists, so the round reads it too
  th: flag,                                              // think: a thinking block really streamed in this round
  a: flag,                                               // think: the AI has the message and started answering (first stream event)
  via: oneOf(['write', 'edit']),                         // fix: the tool the fix used
  plan: x => (typeof x === 'string' ? cleanNote(x, 120) || undefined : undefined),   // write/edit/fix: the AI's own notes
  l: int(0, 999999),                                     // write, fix via write: lines of code written so far
  e: int(0, 9999),                                       // edit, fix via edit: find/replace changes so far
  ok: x => (x === false ? false : undefined),            // the step did not work
  why: oneOf(['cut']),                                   // the tool call was cut off at max_tokens
  st: oneOf(['pass', 'flag', 'fail']),                   // check: safety scan result
  k: int(1, 99),                                         // check (flag/fail): how many things the safety program listed
  v: int(1, 999999),                                     // check, playtest, resume: version number
  title: x => (typeof x === 'string' ? cut(x, 60) || undefined : undefined),        // name
  icon: x => (typeof x === 'string' ? cut(x, 8) || undefined : undefined),          // name
  pics: int(0, 2),                                       // playtest: pictures taken
  probs: int(0, 999),                                    // playtest: problems the automatic checks found
};
export function keep(facts) {
  const out = {};
  for (const [k, x] of Object.entries(facts || {})) {
    if (!Object.hasOwn(FACTS, k)) continue;   // own keys only: never __proto__, toString, constructor...
    const f = FACTS[k];
    const y = f(x); if (y !== undefined) out[k] = y;
  }
  return out;
}

/** Records the turn's steps and streams them. emit = the raw SSE emit (not agent.js relay: steps are not card events). */
export function stepRecorder(emit, t0 = Date.now()) {
  const list = [];   // [key, startMs, facts]
  return {
    /** Start a new row; returns its number i (0 when the key is unknown or the row cap is reached). */
    start(key, facts = {}) {
      if (!STEP_KEYS.includes(key) || list.length >= MAX_ROWS) return 0;
      const f = keep(facts); const at = Date.now() - t0; list.push([key, at, f]);
      emit('step', { i: list.length, key, at, ...f });
      return list.length;
    },
    /** Add facts to row i (default: the newest row). Unknown rows and empty patches are ignored. */
    info(patch, i = list.length) {
      const row = list[i - 1]; const f = keep(patch);
      if (!row || !Object.keys(f).length) return;
      Object.assign(row[2], f); emit('stepinfo', { i, ...f });
    },
    current: () => (list.length ? list[list.length - 1][0] : null),
    /** The compact record for 'done' and the transcript, or null when nothing past screening happened.
     *  fu: new messages the builder sent during the build that were read (only when above 0). */
    record({ p, ti = 0, to = 0, end = 'ok', fu = 0 }) {
      if (!list.some(r => r[0] !== 'screen')) return null;
      return {
        v: 1, p, ms: Date.now() - t0, r: list.filter(r => r[0] === 'think').length,
        ...(ti > 0 ? { ti: Math.round(ti) } : {}), ...(to > 0 ? { to: Math.round(to) } : {}), ...(fu > 0 ? { fu } : {}), end,
        s: list.map(([k, at, f]) => (Object.keys(f).length ? [k, at, { ...f }] : [k, at])),
      };
    },
  };
}
/** For toolbox() and providers called without a recorder (unit tests, scripts). */
export const NO_STEPS = { start: () => 0, info() {}, current: () => null, record: () => null };

/**
 * Reads write_game / edit_game input while it streams (eager input streaming: raw JSON fragments that can split
 * anywhere and are not validated). One pass over each character, never throws, never re-parses the buffer.
 * push(chunk) -> { plan, lines, edits }:
 *   plan  = the top-level "notes" string, cleaned, as soon as it is complete (whether it comes before or after html)
 *   lines = lines of the top-level "html" value so far (0 until it starts)
 *   edits = completed { find, replace } objects in the top-level "edits" array
 */
export function inputScanner() {
  let depth = 0, inStr = false, esc = false, val1 = false, val3 = false, top = null, key3 = null;
  let cap = null, raw = '', nl = 0, htmlStarted = false, edits = 0, plan = null, gaveUp = false;
  const decode = s => { try { return JSON.parse(`"${s}"`); } catch { return null; } };   // \" \\ \n \uXXXX and surrogate pairs
  const counting = () => (depth === 1 && val1 && top === 'html') || (depth === 3 && val3 && top === 'edits' && key3 === 'replace');
  const startString = () => {
    raw = ''; cap = null;
    if (depth === 1) {
      if (!val1) cap = 'key';
      else if (top === 'notes' && plan === null && !gaveUp) cap = 'notes';
      else if (top === 'html') htmlStarted = true;
    } else if (depth === 3 && top === 'edits' && !val3) cap = 'key3';
  };
  const endString = () => {
    if (cap === 'key') top = decode(raw);
    else if (cap === 'key3') key3 = decode(raw);
    else if (cap === 'notes') { const d = decode(raw); plan = d === null ? null : (cleanNote(d, 120) || null); if (!plan) gaveUp = true; }
    cap = null; raw = '';
  };
  const add = c => {
    if (!cap) return;
    raw += c;
    if (raw.length > 4000) { if (cap === 'notes') gaveUp = true; cap = null; raw = ''; }
  };
  function push(chunk) {
    const s = typeof chunk === 'string' ? chunk : '';
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (inStr) {
        if (esc) { esc = false; add(c); if (c === 'n' && counting()) nl++; continue; }
        if (c === '\\') { esc = true; add(c); continue; }
        if (c === '"') { inStr = false; endString(); continue; }
        add(c); if (c === '\n' && counting()) nl++;   // a raw newline is invalid JSON, but it is still a line
        continue;
      }
      if (c === '"') { inStr = true; startString(); }
      else if (c === '{' || c === '[') { depth++; if (depth === 3) { key3 = null; val3 = false; } }
      else if (c === '}' || c === ']') { if (depth === 3 && c === '}' && top === 'edits') edits++; depth = Math.max(0, depth - 1); }
      else if (c === ':') { if (depth === 1) val1 = true; else if (depth === 3) val3 = true; }
      else if (c === ',') { if (depth === 1) val1 = false; else if (depth === 3) val3 = false; }
    }
    return { plan, lines: htmlStarted ? nl + 1 : 0, edits };
  }
  return { push };
}
