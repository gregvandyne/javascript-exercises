// AI voices warm-up: the spoken lines of official seed games, read from the repository's own files (trusted; never the
// copy in the database), generated ahead in the background so kids never wait for the first play of a line.
// - Only the game's `// ==== I18N START ==== … // ==== I18N END ====` block is evaluated, with node:vm in an empty
//   context and a 2-second limit. Plural objects and lines with {placeholders} are skipped (they change per player).
// - Roles: an optional `// ==== VOICES START ==== … // ==== VOICES END ====` block in the game defines
//   `const VOICE_ROLES = { <npc id>: '<role>', story: 'narrator', … }` and may define
//   `const VOICE_KEY_ROLES = { '<key prefix>': '<role>' }` for lines one character says under another's key (Granny's
//   shop line is d.shop.1). A line's role: the longest VOICE_KEY_ROLES prefix, else VOICE_ROLES[npc] for `d.<npc>.*`,
//   else VOICE_ROLES.story (else 'narrator'). The game picks a line's role with the same rule (Hero's voiceRole), and
//   the server takes the role from here, never from the page, so the warm cache always hits.
// - The same lines are the allowlist for POST /api/tts ctx 'game' (allowedLine): a game listed in GAMES may only have its
//   own words read, lines with {placeholders} only with numbers in their place.
// - One run at a time, two lines at a time; it stops when the daily characters or the AI budget run out, and pins
//   its lines so cache clean-ups keep them.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as tts from './tts.js';
import * as V from './tts-voices.js';
import * as usage from './tts-usage.js';
import { audit } from '../db.js';
import { config } from '../config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SEED_DIR = path.join(ROOT, 'seed-games');

/** Games that can be warmed and which of their keys are spoken. */
export const GAMES = {
  // The CS Quest games (one course, server/services/course-catalog.js) keep their words in language packs: English is
  // the key (scripts/data/cs-quest/<slug>/en.json) and each language a reviewed translation (<lang>.json). Every line is
  // the game's own (chrome, learn cards, hints, case files); one voice per game, the crew member who speaks.
  'robo-route': { title: 'Robo Route', pack: 'scripts/data/cs-quest/robo-route', role: 'bright', spoken: /./ },
  'data-detective': { title: 'Data Detective', pack: 'scripts/data/cs-quest/data-detective', role: 'friendly', spoken: /./ },
  'packet-post': { title: 'Packet Post', pack: 'scripts/data/cs-quest/packet-post', role: 'wise', spoken: /./ },
  'inside-the-machine': { title: 'Inside the Machine', pack: 'scripts/data/cs-quest/inside-the-machine', role: 'friendly', spoken: /./ },
  'hero-of-sunvale': { title: 'Hero of Sunvale', spoken: /^(intro\.\d+|end\.(\d+|free)|d\.[a-z]+\.[a-z0-9]+|hint\.[a-z0-9]+|say\.[a-zA-Z0-9]+|mg\.[a-z]+|sw\.[a-z0-9]+|cinder\.[a-z]+)$/ },
  // Every other official game (Greg's rule, 2026-11-05: ALL official games use the AI voice, and every game built
  // for a course ships registered here from day one — see docs/decisions.md). These keep their words in the marked
  // I18N block of their own file; every line in the block is the game's own, so the whole table is spoken. Roles:
  // the game's host or character where it has one (its VOICES block, where present), narrator where it has none.
  'atlas-quest': { title: 'Atlas Quest', role: 'narrator', spoken: /./ },
  'atlas-quest-live': { title: 'Atlas Quest (Live)', role: 'narrator', spoken: /./ },
  // Balance Bridge (Number Quest Launchpad, grades 1-2): every instruction, story, hint and answer line is spoken, in
  // the friendly voice (its VOICES block). What the number chip shows (show.*), the button labels (btn.*), the chapter
  // names and the round counter are shown, never read.
  'balance-bridge': { title: 'Balance Bridge', role: 'friendly', spoken: /^(?!btn\.|show\.|round$|title$|loading$|ch\.)/ },
  'beat-lanes': { title: 'Beat Lanes', role: 'narrator', spoken: /./ },
  'brain-board': { title: 'Brain Board', role: 'narrator', spoken: /./ },
  'brick-drop': { title: 'Brick Drop', role: 'narrator', spoken: /./ },
  'castle-clash': { title: 'Castle Clash', role: 'narrator', spoken: /./ },
  'code-isle': { title: 'Code Isle', role: 'bright', spoken: /./ },
  'connect-four': { title: 'Drop Four', role: 'friendly', spoken: /./ },
  // Crate Stacker (Number Quest Launchpad, grade 1): every instruction, hint and answer line is spoken, in the
  // friendly voice (its VOICES block). What the number chip shows (show.*, where a "?" or a sign may stand), the
  // button labels (btn.*) and the round counter are shown, never read.
  'crate-stacker': { title: 'Crate Stacker', role: 'friendly', spoken: /^(?!btn\.|show\.|round$|title$|loading$|ch\.)/ },
  'escape-the-post-office': { title: 'Escape the Post Office', role: 'wise', spoken: /./ },
  'footy-tycoon': { title: 'Footy Tycoon', role: 'narrator', spoken: /./ },
  // Number Quest's game: every line in its block is Tally the cat's, and its VOICES block gives them all the
  // friendly role its BRB.speak calls ask for.
  'fraction-factory': { title: 'Fraction Factory', role: 'friendly', spoken: /./ },
  // Garden Count (Number Quest Launchpad, kindergarten): every instruction, hint and number word is spoken, in the
  // friendly voice (its VOICES block). The button labels (btn.*) and the round counter are shown, never read.
  'garden-count': { title: 'Garden Count', role: 'friendly', spoken: /^(?!btn\.|round$|title$|loading$|ch\.)/ },
  'gulp-city': { title: 'Gulp City', role: 'friendly', spoken: /./ },
  'happy-putt': { title: 'Happy Putt', role: 'narrator', spoken: /./ },
  // Kitchen Rush (Number Quest Launchpad, grades K-2): every instruction, hint and answer line is spoken, in the
  // friendly voice (its VOICES block). What the chip and the board show (show.*), the button labels (btn.*), the
  // chapter names and the round counter are shown, never read.
  'kitchen-rush': { title: 'Kitchen Rush', role: 'friendly', spoken: /^(?!btn\.|show\.|round$|title$|loading$|ch\.)/ },
  // Lily Hop (Number Quest Launchpad, kindergarten to grade 1): every instruction, hint and answer line is spoken, in
  // the friendly voice (its VOICES block). The sums on screen (show.*, where a "?" may stand), the button labels (btn.*)
  // and the round counter are shown, never read.
  'lily-hop': { title: 'Lily Hop', role: 'friendly', spoken: /^(?!btn\.|show\.|round$|title$|loading$|ch\.)/ },
  'loop-lab': { title: 'Loop Lab', role: 'narrator', spoken: /./ },
  'munch-maze': { title: 'Munch Maze', role: 'narrator', spoken: /./ },
  'quest-race': { title: 'Quest Race', role: 'narrator', spoken: /./ },
  'question-battle': { title: 'Question Battle', role: 'narrator', spoken: /./ },
  // Remi's Quiet Meadow: only the title, the setup card, the privacy note and the end lines may be spoken (the game says
  // nothing while it listens to the room).
  'remis-quiet-meadow': { title: "Remi's Quiet Meadow", role: 'friendly', spoken: /^(?:title|tag|setupH|privacy|calibHint|end)/ },
  // Quiet Bounce and Popcorn Hush: like Remi's, only the title, setup, privacy and end lines are spoken.
  'quiet-bounce': { title: 'Quiet Bounce', role: 'friendly', spoken: /^(?:title|tag|setupH|privacy|calibHint|end)/ },
  'popcorn-hush': { title: 'Popcorn Hush', role: 'friendly', spoken: /^(?:title|tag|setupH|privacy|calibHint|end)/ },
  'ring-rumble': { title: 'Ring Rumble', role: 'narrator', spoken: /./ },
  // Rocket Supply (Number Quest Launchpad, grade 2): every instruction, hint and answer line is spoken, in the
  // friendly voice (its VOICES block). What is shown in a spoken line's place (show.*), the button labels (btn.*),
  // the chapter names and the round counter are shown, never read.
  'rocket-supply': { title: 'Rocket Supply', role: 'friendly', spoken: /^(?!btn\.|show\.|round$|title$|loading$|ch\.)/ },
  // Shape Hunt (Number Quest Launchpad, grades K-2): every instruction, hint and answer line is spoken, in the friendly
  // voice (its VOICES block). What the chip shows (show.*), the button labels (btn.*), the chapter names and the round
  // counter are shown, never read.
  'shape-hunt': { title: 'Shape Hunt', role: 'friendly', spoken: /^(?!btn\.|show\.|round$|title$|loading$|ch\.)/ },
  'shark-plank': { title: 'Shark Plank', role: 'deep', spoken: /./ },
  'sum-racer': { title: 'Sum Racer', role: 'bright', spoken: /./ },
  'swish-flick': { title: 'Swish Flick', role: 'narrator', spoken: /./ },
  'trick-inbox': { title: 'Trick Inbox', role: 'wise', spoken: /./ },
  // Tug of Math reads no questions aloud (they are numbers); its words (the setup card, results) are all its own.
  'tug-of-math': { title: 'Tug of Math', role: 'bright', spoken: /./ },
  'word-hunt': { title: 'Word Hunt', role: 'narrator', spoken: /./ },
  'word-peek': { title: 'Word Peek', role: 'narrator', spoken: /./ },
  'would-you-rather': { title: 'Would You Rather?', role: 'narrator', spoken: /./ },
  'would-you-rather-live': { title: 'Would You Rather? (Live)', role: 'narrator', spoken: /./ },
  // Doodle Hoot: the game's own lines; the secret words are never in its I18N block (and never spoken: a word read
  // aloud would tell the room the answer)
  'doodle-hoot': { title: 'Doodle Hoot', role: 'bright', spoken: /./ },
  // Word Trail (a sight-word game): Bramble the hedgehog reads every word (w.*), each word's example sentence (s.*) and
  // the same sentence with the word left out (c.*), the instructions and the praise, in the friendly voice (its VOICES
  // block). The screens' labels (ui.*) are never read. Each word is a line of its own, matched whole (no joins), so the
  // word list can never be strung into a sentence.
  'word-trail': { title: 'Word Trail', role: 'friendly', spoken: /^(?!ui\.)/ },
  // Jungle Cup: the story, the people's lines and the finale (d.*, story.*, end.*), each speaker's role from its VOICES block.
  'jungle-cup': { title: 'Jungle Cup', role: 'narrator', spoken: /^(?:d\.[a-z]+\.[a-z0-9]+|story\.\d+|end\.\d+|sign\.[a-z]+|lift\.(?:open|locked))$/ },
};
/** The official games that may use AI voices at all (routes/tts.js gameAllowed): only games listed in GAMES, whose
 *  spoken lines the server knows. Every official game is listed (the coverage test in tests/unit/tts-coverage.test.js
 *  fails if one is missing), so an unlisted official game is a bug, not a design choice. */
export const TTS_GAMES = new Set(Object.keys(GAMES));

// ---------------------------------------------------------------- Brain Breaks (Oomba Breathe & Bend)
// The narration of the Move area (/move, services/move-data.js) is registered here from day one, exactly
// like a game's lines: this registry is the ONLY source routes/tts.js ctx 'move' reads from, by episode,
// segment and line number, so the page never sends text and an unregistered line can never be spoken.
// One voice for the whole series: the warm adult narrator. English first; the lines live in move-data.js
// (pure data) so this file and the player can never drift apart. The coverage test is
// tests/unit/move.test.js: every line in move-data must resolve here, word for word.
import { EPISODES as MOVE_EPISODES, lineAt as moveLineAt } from './move-data.js';
export const MOVE_TTS_ROLE = 'narrator';
// Greg (2026-11-05): the yoga narrator is "a kind British male voice". Of the platform's
// voices, fable is the British-accented one: an expressive, warm storytelling voice, the
// narrator-style British voice the set offers. It is pinned per line below (the same
// explicit-voice mechanism the admin sample path uses), so an admin's narrator pick for
// other contexts never changes the yoga narrator, and the accent hint matches the voice
// (ACCENT['en-GB'], passed through by ctx 'move'). Voice selection only: the lines, the
// shared speak path and every other context's voice are untouched.
export const MOVE_TTS_VOICE = 'fable';
export const MOVE_TTS_ACCENT = 'en-GB';
/** Every registered Brain Break narration line: [{ episode, seg, line, text, role, voice, accent }] in spoken order. */
export const MOVE_LINES = MOVE_EPISODES.flatMap(e => [
  ...e.segments.flatMap((s, si) => s.lines.map((text, li) => ({ episode: e.id, seg: si, line: li, text, role: MOVE_TTS_ROLE, voice: MOVE_TTS_VOICE, accent: MOVE_TTS_ACCENT }))),
  ...e.endLines.map((text, li) => ({ episode: e.id, seg: e.segments.length, line: li, text, role: MOVE_TTS_ROLE, voice: MOVE_TTS_VOICE, accent: MOVE_TTS_ACCENT })),
]);
/** The registered line for (episode, segment index, line index), or null: routes/tts.js ctx 'move'. */
export const moveLine = (episodeId, seg, line) => {
  const text = moveLineAt(episodeId, seg, line);
  return text == null ? null : { text, role: MOVE_TTS_ROLE, voice: MOVE_TTS_VOICE, accent: MOVE_TTS_ACCENT };
};
/** Lines said under another character's key (used until the game has its own VOICE_KEY_ROLES). hint.* lines are read
 *  by the narrator in every character's card. */
export const DEFAULT_KEY_ROLES = { 'd.shop.': 'wise', 'd.gate.open': 'bright', 'mg.': 'bright', 'say.guard': 'deep', 'say.': 'friendly', 'sw.': 'grumpy', 'cinder.': 'deep', 'hint.': 'narrator' };
/** Used until the game has its own VOICES block (the same mapping as docs/tts-design.md §4). */
export const DEFAULT_VOICE_ROLES = {
  story: 'narrator', granny: 'wise', queen: 'wise', bo: 'deep', oakley: 'deep', finn: 'deep', plum: 'deep', chief: 'deep',
  tilly: 'friendly', ivy: 'friendly', hazel: 'friendly', maple: 'friendly', marigold: 'bright', hero: 'bright', snarlwick: 'grumpy', snarl: 'grumpy',
};

const block = (src, start, end) => {
  const a = src.indexOf(start), b = src.indexOf(end);
  return a >= 0 && b > a ? src.slice(a + start.length, b) : null;
};
const run = (code, name) => vm.runInNewContext(`${code}\n;${name}`, Object.create(null), { timeout: 2000 });
/** A game's I18N object and voice roles, from its file in seed-games/. */
export function readGame(slug, dir = SEED_DIR) {
  if (!GAMES[slug]) return null;
  if (GAMES[slug].pack) return readPack(GAMES[slug]);
  return parseGame(fs.readFileSync(path.join(dir, `${slug}.html`), 'utf8'));
}
/** A language-pack game: { strings: { en: { text: text }, <lang>: { text: translation } }, one role for every line }.
 *  Plural objects ({ one, other }) are left out: they change per count, so the device's voice reads them. */
function readPack({ pack, role }) {
  const d = path.join(ROOT, pack);
  let en; try { en = JSON.parse(fs.readFileSync(path.join(d, 'en.json'), 'utf8')).strings; } catch { return null; }
  if (!Array.isArray(en)) return null;
  const strings = { en: Object.fromEntries(en.filter(x => typeof x === 'string').map(x => [x, x])) };
  for (const f of fs.readdirSync(d)) {
    const m = /^([a-zA-Z-]+)\.json$/.exec(f); if (!m || m[1] === 'en') continue;
    try {
      const tr = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')).strings || {};
      strings[m[1]] = Object.fromEntries(Object.entries(tr).filter(([k, v]) => typeof v === 'string' && strings.en[k] !== undefined));
    } catch { /* a broken file keeps the device's voice for that language */ }
  }
  return { strings, roles: { story: role }, keyRoles: {} };
}
function parseGame(src) {
  const i18n = block(src, '// ==== I18N START ====', '// ==== I18N END ====');
  if (!i18n) return null;
  const strings = run(i18n, 'I18N');
  const v = block(src, '// ==== VOICES START ====', '// ==== VOICES END ====');
  let roles = DEFAULT_VOICE_ROLES, keyRoles = DEFAULT_KEY_ROLES;
  if (v) {
    const r = run(v, 'VOICE_ROLES'); if (r && typeof r === 'object') roles = { ...r };
    const k = run(v, "typeof VOICE_KEY_ROLES === 'undefined' ? null : VOICE_KEY_ROLES"); if (k && typeof k === 'object') keyRoles = { ...k };
  }
  return { strings, roles, keyRoles };
}
/** The role a key is spoken with. */
export function roleOf(key, roles, keyRoles = {}) {
  const pre = Object.keys(keyRoles).filter(p => key.startsWith(p)).sort((a, b) => b.length - a.length)[0];
  const m = /^d\.([a-z]+)\./.exec(key);
  const r = pre ? keyRoles[pre] : m && roles[m[1]] ? roles[m[1]] : roles.story;
  return V.ROLES.includes(r) ? r : 'narrator';
}
/** A game's spoken lines in one locale: [{ key, locale, role, text }] (falls back like the game's t(): locale, base, en).
 *  templates: true also lists lines with {placeholders} (for the allowlist; the warm-up skips them). */
export function gameLines(slug, locale, game = readGame(slug), { templates = false } = {}) {
  if (!game) return [];
  const { strings, roles, keyRoles } = game;
  const chain = [...new Set([locale, locale.split('-')[0], 'en'])].filter(c => Object.prototype.hasOwnProperty.call(strings, c));
  const keys = Object.keys(strings.en || {}).filter(k => GAMES[slug].spoken.test(k));
  const out = [];
  for (const key of keys) {
    let text; for (const c of chain) { if (strings[c][key] !== undefined) { text = strings[c][key]; break; } }
    if (typeof text !== 'string' || !text.trim() || (!templates && /\{\w+\}/.test(text))) continue;
    out.push({ key, locale, role: roleOf(key, roles, keyRoles), text });
  }
  return out;
}

// ---------------------------------------------------------------- the allowlist (routes/tts.js, ctx 'game')
// A game may only have its own spoken lines read: the server never sends text a player could have typed. A line with
// {placeholders} matches only with numbers in their place (a count like "Crystal smashed! 3/5"), never letters.
const NUM = "[0-9][0-9.,'’ ]{0,15}";
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const memo = new Map();   // `${slug}|${locale}` -> { mtime, exact: Map(text -> roles[]), tpl: [{ re, roles }] }
/** The allowlist of one game and locale (memoised per file modification time). */
export function allowlist(slug, locale, dir = SEED_DIR) {
  if (!GAMES[slug]) return null;
  const file = path.join(dir, `${slug}.html`);
  let mtime; try {
    mtime = GAMES[slug].pack ? Math.max(...fs.readdirSync(path.join(ROOT, GAMES[slug].pack)).map(f => fs.statSync(path.join(ROOT, GAMES[slug].pack, f)).mtimeMs)) : fs.statSync(file).mtimeMs;
  } catch { return null; }
  const k = `${slug}|${locale}|${dir}`, hit = memo.get(k);
  if (hit && hit.mtime === mtime) return hit;
  const exact = new Map(), tpl = [];
  for (const x of gameLines(slug, locale, readGame(slug, dir), { templates: true })) {
    const text = tts.tidy(x.text);
    if (/\{\w+\}/.test(text)) {
      const re = new RegExp(`^${text.split(/\{\w+\}/).map(escRe).join(NUM)}$`, 'u');
      const t = tpl.find(y => y.re.source === re.source);
      if (t) { if (!t.roles.includes(x.role)) t.roles.push(x.role); } else tpl.push({ re, roles: [x.role] });
    } else {
      const r = exact.get(text) || []; if (!r.includes(x.role)) r.push(x.role); exact.set(text, r);
    }
  }
  const out = { mtime, exact, tpl };
  memo.set(k, out);
  return out;
}
/**
 * Is this one of the game's own spoken lines in this locale? -> { text, role } (role: the line's own role; the asked
 * role only when the same words are also another character's line) or null.
 */
export function allowedLine(slug, locale, text, askedRole = null) {
  const a = allowlist(slug, locale); if (!a) return null;
  const s = tts.tidy(text);
  const pick = roles => ({ text: s, role: roles.includes(askedRole) ? askedRole : roles[0] });
  const ex = a.exact.get(s); if (ex) return pick(ex);
  const t = a.tpl.find(y => y.re.test(s));
  if (t) return pick(t.roles);
  // A language-pack game reads a card as one line ("Title. Text"): at most MAX_PARTS of its own lines, joined at
  // sentence ends, each one whole (a title may lose or gain its closing period). Never a piece of a line.
  if (GAMES[slug] && GAMES[slug].pack) { const r = joined(a, s); if (r) return pick(r); }
  return null;
}
const MAX_PARTS = 4;
function joined(a, s) {
  const cuts = [0]; const re = /[.!?…。！？](?=\s)/gu; let m;
  while ((m = re.exec(s))) cuts.push(m.index + 1);
  cuts.push(s.length);
  const has = part => { const p = part.trim(); if (!p) return null; return a.exact.get(p) || a.exact.get(p.replace(/[.。]$/u, '')) || a.exact.get(p + '.') || null; };
  // best[i]: roles of a split of s[0..cuts[i]) into whole lines, with how many parts
  const best = new Array(cuts.length).fill(null); best[0] = { roles: null, n: 0 };
  for (let i = 1; i < cuts.length; i++) for (let j = 0; j < i; j++) {
    if (!best[j] || best[j].n >= MAX_PARTS) continue;
    const r = has(s.slice(cuts[j], cuts[i])); if (!r) continue;
    if (!best[i] || best[j].n + 1 < best[i].n) best[i] = { roles: best[j].roles || r, n: best[j].n + 1 };
  }
  const end = best[cuts.length - 1];
  return end && end.n > 1 ? end.roles : null;
}

// ---------------------------------------------------------------- the warm-up run
const blank = () => ({ running: false, games: [], locales: [], total: 0, done: 0, cached: 0, skipped: 0, failed: 0, chars: 0, usd: 0, stopped: null, startedAt: null, endedAt: null });
let state = blank();
export const status = () => { const { promise, ...s } = state; void promise; return { ...s, usd: Math.round(s.usd * 10000) / 10000 }; };

/** All lines for these games and locales, and how many characters are not cached yet (with their estimated cost). */
export function estimate(games, locales) {
  const lines = [];
  for (const g of games) { const game = readGame(g); for (const l of locales) lines.push(...gameLines(g, l, game)); }
  let chars = 0, missing = 0;
  for (const x of lines) { const p = tts.plan(x); if (!tts.cached(p.hash)) { chars += p.text.length; missing++; } }
  return { lines: lines.length, missing, chars, usd: usage.usdFor(chars), list: lines };
}

/** Start one background run. -> { ok, status } or { ok: false, error }. */
export function start({ games = [], locales = [], by = null, concurrency = 2 } = {}) {
  if (state.running) return { ok: false, error: 'A warm-up is already running.' };
  if (!tts.ttsEnabled()) return { ok: false, error: 'AI voices are off (TTS_ENABLED and a key).' };
  const gs = games.filter(g => GAMES[g]);
  // Any locale TTS_LOCALES allows, switched on or not (the admin may warm a language before turning it on).
  const ls = [...new Set(locales)].filter(l => config.ttsLocales.includes(l));
  if (!gs.length || !ls.length) return { ok: false, error: 'Pick a game and at least one language.' };
  const { list } = estimate(gs, ls);
  state = { ...blank(), running: true, games: gs, locales: ls, total: list.length, startedAt: Date.now() };
  audit(by, 'admin.tts.warm', gs.join(','), { locales: ls, lines: list.length });
  const queue = list.slice();
  const worker = async () => {
    while (queue.length && !state.stopped) {
      const x = queue.shift();
      if (usage.blocked(x.text.length)) { state.stopped = 'budget'; break; }
      try {
        const r = await tts.synthesize({ text: x.text, locale: x.locale, role: x.role, ctx: 'warm', pin: true });
        if (r.cached) state.cached++; else { state.chars += x.text.length; state.usd += usage.usdFor(x.text.length); }
        state.done++;
      } catch (e) {
        if (e.code === 'site') { state.stopped = 'budget'; break; }
        if (e.code === 'long') state.skipped++; else state.failed++;
      }
    }
  };
  state.promise = Promise.all(Array.from({ length: Math.max(1, Math.min(4, concurrency)) }, worker))
    .finally(() => { state.running = false; state.endedAt = Date.now(); delete state.promise; });
  return { ok: true, status: status() };
}
/** Ask a running warm-up to stop after the lines in flight. */
export function stop() { if (state.running) state.stopped = 'admin'; return status(); }
/** Tests: wait for the run to end. */
export const _wait = () => state.promise || Promise.resolve();
export const _reset = () => { state = blank(); };
