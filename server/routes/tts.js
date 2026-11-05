// AI voices (docs/decisions.md "AI voices"; server/services/tts.js). The page asks for a line, gets back the URL of a
// cached MP3 and plays it (a game frame gets the bytes from its play page, because frames can't fetch).
//   POST /api/tts   { ctx, … }  -> 200 { u: '/tts/<sha256>.mp3' } | 404 off | 422 filtered/long | 429 fast/site | 503 busy
//     ctx 'game'   { tok, text, lang, role, rate }  tok: from the play page's page-data (official games listed in
//                  tts-lines GAMES, and games the admin switched on (services/tts-games.js); bound to the signed-in
//                  player, 2 hours). The text must be one of that game's own spoken lines in that language (tts-lines
//                  allowedLine; numbers only in a line's {placeholders}), or for a switched-on game its own words from
//                  its published version (tts-games allowedText): anything else is 422 filtered. The role comes from the
//                  line for a listed game; a switched-on game gets the role asked for if it is a known one, else narrator.
//     ctx 'live'   { sid, tok, i }  the live question i (only the one open now), by number: the server reads the
//                  teacher's question and its answer choices, in the session's language. tok: the player's seat token or
//                  the host/co-host token.
//     ctx 'course' { course, step, i }  slide i of a course step's lesson (seed-lessons/cs-quest/course), read in English
//                  with the voice of that step's game character; only a step the player has open (staff and the admin:
//                  any step). The server reads the slide: the page never sends text.
//     ctx 'lesson' { clId, stepId, i }  a lesson quiz step's question i, behind the same access as its quiz API, in the
//                  page's language.
//   GET /tts/<sha256>.mp3   the cached audio (same-origin only; immutable).
//   Admin (role admin): GET /admin/voices, POST /api/admin/tts/sample, POST /api/admin/tts/settings,
//   GET|POST /api/admin/tts/warm, POST /api/admin/tts/warm/stop, GET|POST /api/admin/tts/games (a game's switch).
// Every refusal means "use the device's own voice": pages never show an error for it.
import { Router } from 'express';
import { requireAdmin, signToken, readToken } from '../auth.js';
import { config } from '../config.js';
import { html, raw, jsonData } from '../views/html.js';
import { page } from '../views/layout.js';
import { allow, ipOf } from '../services/ratelimit.js';
import * as tts from '../services/tts.js';
import * as V from '../services/tts-voices.js';
import * as usage from '../services/tts-usage.js';
import * as lines from '../services/tts-lines.js';
import * as TG from '../services/tts-games.js';
import * as games from '../services/games.js';
import { isOfficial } from '../services/classlive-access.js';
import * as LS from '../services/classlive-sessions.js';
import * as PROG from '../services/progress.js';
import * as aiBudget from '../services/ai-budget.js';
import { LOCALES } from '../i18n/index.js';
import { COMMUNITY_CSS } from './social.js';
import * as COURSES from '../services/courses.js';
import { sayOf } from '../views/courses.js';
import { isStaff } from '../services/schools.js';

export const router = Router();

/** Requests a minute per person (cache hits are cheap), new audio per address in 10 min. New audio a minute per person:
 *  TTS_PER_MINUTE; new characters a day per person and per address: TTS_USER_DAILY_CHARS, TTS_IP_DAILY_CHARS. */
export const LIMITS = { perMinute: 120, ipGenPer10Min: 200 };
export const GAME_TOKEN_SEC = 2 * 3600;

// ---------------------------------------------------------------- game tokens (minted by the play page)
/** May this game use AI voices: an official seed game listed in tts-lines GAMES (its spoken lines are known), published
 *  and not hidden? Every official game is on the list (a coverage test fails otherwise); one missing from it gets no
 *  token until it is registered. Also a game the admin switched on (services/tts-games.js: made by a teacher, staff
 *  or the admin, published, not hidden; never a draft or a preview). */
export const listedGame = g => !!g && lines.TTS_GAMES.has(g.slug) && isOfficial(g) && g.status === 'published' && !!g.published_version_id && !g.hidden_reason;
export const gameAllowed = g => listedGame(g) || TG.allowed(g);
/**
 * The play page's tts data for a game, or null (TTS off, no locale on, not an official game, nobody signed in, a guest
 * included). -> { tok, langs } where tok is bound to the user and the game for 2 hours.
 */
export function playData(user, game) {
  if (!user || !tts.ttsEnabled() || !gameAllowed(game)) return null;
  const langs = tts.onLocales();
  if (!langs.length) return null;
  return { tok: signToken({ k: 'tts', g: game.id, u: user.id }, GAME_TOKEN_SEC), langs };
}
/** The frame's INIT.tts for a game ({ langs }) or null: the same rule as playData. */
export const frameData = (user, game) => { const d = playData(user, game); return d ? { langs: d.langs } : null; };

// ---------------------------------------------------------------- POST /api/tts
const who = req => (req.user ? `u:${req.user.id}` : `ip:${ipOf(req)}`);
/** Whose request this is, for the request limit: a live seat counts as its own person (a school behind one address). */
const whoFor = (req, b) => {
  if (b.ctx === 'live' && typeof b.tok === 'string') { const tok = readToken(b.tok); if (tok && tok.r === 'p' && tok.s && tok.n != null) return `seat:${tok.s}:${tok.n}`; }
  return who(req);
};
const fail = (res, status, code) => res.status(status).json({ code });
const LETTERS = ['A', 'B', 'C', 'D'];
/** A quiz question read aloud: the question, then each choice with its letter. */
// A map question (Atlas Quest Live: every country's code as its choices) is read without them.
export const questionText = (qq, choices = []) => [String(qq || ''), ...(choices.length > 4 ? [] : choices).map((c, k) => `${LETTERS[k] || k + 1}: ${c}`)].map(s => tts.tidy(s)).filter(Boolean).map(s => (/[.!?。！？]$/.test(s) ? s : s + '.')).join(' ');

/** -> { text, locale, role, rate } or { error: [status, code] }. */
function resolve(req, b) {
  if (b.ctx === 'game') {
    const tok = readToken(typeof b.tok === 'string' ? b.tok : '');
    if (!tok || tok.k !== 'tts' || !tok.u || !req.user || req.user.id !== tok.u) return { error: [403, 'token'] };
    const g = games.getGame(tok.g);
    if (!gameAllowed(g) || !games.canView(req.user, g)) return { error: [404, 'off'] };
    if (typeof b.text !== 'string') return { error: [422, 'long'] };
    const locale = V.ttsLocale(b.lang);
    if (!locale || !tts.localeOn(locale)) return { error: [404, 'off'] };
    // Only the game's own words (never what a player typed), with the line's own role.
    if (listedGame(g)) {
      const line = lines.allowedLine(g.slug, locale, b.text, b.role);
      if (!line) return { error: [422, 'filtered'] };
      return { text: line.text, locale, role: line.role, rate: V.rateBucket(b.rate) };
    }
    // A game the admin switched on: words from its published version's own source only.
    const text = TG.allowedText(g, b.text);
    if (!text) return { error: [422, 'filtered'] };
    return { text, locale, role: V.ROLES.includes(b.role) ? b.role : 'narrator', rate: V.rateBucket(b.rate) };
  }
  if (b.ctx === 'live') {
    const s = LS.get(b.sid);
    const tok = readToken(typeof b.tok === 'string' ? b.tok : '');
    if (!s || !tok || tok.s !== s.id || s.phase === 'ended') return { error: [404, 'off'] };
    if (tok.u && (!req.user || req.user.id !== tok.u)) return { error: [403, 'token'] };
    const ok = tok.r === 'p' ? !!LS.seatFor(s, tok) : LS.controllerFor(s, tok, req.user).ok;
    if (!ok) return { error: [403, 'token'] };
    if (s.settings && s.settings.voices === 'device') return { error: [404, 'off'] };
    const cur = s.qz && s.qz.cur;
    // Only the question open now: never one that is still to come.
    if (!cur || !Number.isInteger(b.i) || b.i !== cur.i) return { error: [404, 'notNow'] };
    // The session's language only (the text is never translated: another language would only be a wrong accent).
    return { text: questionText(cur.q, cur.choices), locale: V.ttsLocale(s.lang) || 'en', role: 'narrator', rate: 'normal' };
  }
  if (b.ctx === 'course') {
    if (!req.user) return { error: [404, 'off'] };
    const c = COURSES.getCourse(String(b.course || ''));
    const step = c && COURSES.getStep(c, String(b.step || ''));
    if (!step) return { error: [404, 'off'] };
    const st = COURSES.stateOf(req.user, c, step.key);
    const preview = req.user.role === 'admin' || isStaff(req.user);
    if (!preview && !(st && st.open)) return { error: [404, 'off'] };
    const slide = Number.isInteger(b.i) ? (step.slides || [])[b.i] : null;
    if (!slide) return { error: [404, 'off'] };
    const g = step.game && lines.GAMES[step.game.slug];
    // Lesson slides are English (the course content is English first): read with the English voice.
    return { text: sayOf(slide), locale: 'en', role: (g && g.role) || 'narrator', rate: 'normal' };
  }
  if (b.ctx === 'lesson') {
    if (!req.user || !config.liveHomework) return { error: [404, 'off'] };
    const r = PROG.quizFor(req.user, String(b.clId || ''), String(b.stepId || ''));
    if (!r.ok) return { error: [404, 'off'] };
    const it = Number.isInteger(b.i) ? r.items[b.i] : null;
    if (!it) return { error: [404, 'off'] };
    return { text: questionText(it.q, it.choices), locale: V.ttsLocale(req.locale) || 'en', role: 'narrator', rate: 'normal' };
  }
  return { error: [400, 'ctx'] };
}

const STATUS = { off: 404, long: 422, filtered: 422, fast: 429, site: 429, busy: 503, provider: 503 };
router.post('/api/tts', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!tts.ttsEnabled()) return fail(res, 404, 'off');
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  if (!allow(`tts:${whoFor(req, b)}`, LIMITS.perMinute, 60e3)) return fail(res, 429, 'fast');
  const r = resolve(req, b);
  if (r.error) return fail(res, r.error[0], r.error[1]);
  if (!tts.localeOn(r.locale)) return fail(res, 404, 'off');
  const why = tts.speakable(r.text, { user: req.user, ctx: b.ctx });
  if (why) return fail(res, 422, why);
  // New audio only: per person and per address, a minute and a day (a whole school behind one address still fits:
  // a class shares one question's audio). The day's characters are counted in memory under a salted hash.
  const gate = p => {
    if (!allow(`tts-gen:${whoFor(req, b)}`, config.ttsPerMinute, 60e3) || !allow(`tts-gen-ip:${ipOf(req)}`, LIMITS.ipGenPer10Min, 600e3)) return 'fast';
    return usage.takeQuota([whoFor(req, b), `ip:${ipOf(req)}`], [config.ttsUserDailyChars, config.ttsIpDailyChars], p.text.length) ? null : 'fast';
  };
  try {
    const out = await tts.synthesize({ ...r, ctx: b.ctx, gate });
    res.json({ u: out.url });
  } catch (e) {
    const code = e.code === 'provider' ? 'busy' : e.code;
    fail(res, STATUS[code] || 503, STATUS[code] ? code : 'busy');
  }
});

// ---------------------------------------------------------------- GET /tts/<hash>.mp3
router.get('/tts/:file', (req, res) => {
  const m = /^([0-9a-f]{64})\.mp3$/.exec(req.params.file);
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return res.status(403).end();
  const row = m && tts.cached(m[1]);
  if (!row) return res.status(404).end();
  res.set({ 'Cache-Control': 'private, max-age=2592000, immutable', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' });
  res.type('audio/mpeg').sendFile(tts.fileOf(m[1]), { dotfiles: 'deny', acceptRanges: true, cacheControl: false });
});

// ---------------------------------------------------------------- admin: /admin/voices
router.use('/admin/voices', requireAdmin);
router.use('/api/admin/tts', requireAdmin);

const usd = n => '$' + (+n || 0).toFixed(2);
const mb = b => (b / 1048576).toFixed(1) + ' MB';
const ttsLocaleList = () => LOCALES.map(l => l.code);
router.get('/admin/voices', (req, res) => {
  const on = tts.ttsEnabled(), s = V.load(), st = tts.cacheStats(), use = usage.todayUse(), b = aiBudget.status();
  const allowed = new Set(config.ttsLocales);
  const onNow = config.ttsLocales.filter(l => s.locales[l].on);
  let est = null; try { est = lines.estimate(['hero-of-sunvale'], onNow.length ? onNow : config.ttsLocales); delete est.list; } catch { est = null; }
  const locales = LOCALES.filter(l => ttsLocaleList().includes(l.code));
  const games_ = TG.list(), silent = TG.silentWhy();
  const body = html`
  <div class="pagehead"><h1>🔊 AI voices</h1></div>
  ${on ? '' : html`<section class="panel" role="status"><b>AI voices are off.</b> They need TTS_ENABLED=1 and a key (TTS_API_KEY, or STT_API_KEY when both providers are openai). Until then nothing here can play, and every page uses the device's own voice.</section>`}
  <section class="panel small">
    <p><b>Provider</b> ${config.ttsProvider || '–'} · <b>model</b> ${config.ttsProvider === 'mock' ? 'mock (silent audio)' : config.ttsModel} · <b>TTS_LOCALES</b> ${config.ttsLocales.join(', ')}</p>
    <p><b>Today</b> ${use.chars.toLocaleString('en-US')} of ${usage.dailyCap().toLocaleString('en-US')} characters (${use.calls} new, ${use.hits} from the cache, ${use.fails} failed) · about ${usd(usage.usdFor(use.chars))} · AI budget today ${usd(b.today)} of ${usd(b.daily)}${b.ok ? '' : html` <b>(cap reached: no new audio)</b>`}</p>
    <p><b>Cache</b> ${st.n} lines, ${mb(st.bytes)} of ${config.ttsCacheMb} MB (${st.pinned} kept by warm-up and samples)</p>
    <p class="muted">Only text written by us, a game's makers or a teacher is ever spoken, never what a kid types and never a name. Players are told the voices are AI voices from OpenAI. Each language stays silent until you switch it on here; listen to it first.</p>
  </section>
  <h2 class="stats-h">Languages and narrator voices</h2>
  <p class="muted small">▶ plays the sample sentence in that language with that voice (made once, then kept; the narrator's ▶ is marked). Narrator: the voice that reads stories, lessons and quiz questions in that language. On a phone, ▶ plays the narrator chosen in that row.</p>
  <form id="tv-form">
  <div class="panel tblwrap"><table class="tbl tv-grid">
    <thead><tr><th>Language</th><th>On</th><th>Narrator</th><th class="tv-one">Play</th>${V.VOICES.map(v => html`<th class="tv-v">${v}</th>`)}</tr></thead>
    <tbody>${locales.map(l => html`<tr data-locale="${l.code}">
      <th scope="row">${l.name} <span class="muted small">${l.code}</span></th>
      <td><input type="checkbox" name="on-${l.code}" aria-label="${l.name} on" ${s.locales[l.code].on ? raw('checked') : ''} ${allowed.has(l.code) ? '' : raw('disabled title="Not in TTS_LOCALES"')}>
        <div class="small tv-sample" lang="${l.code}" dir="${l.dir}">${V.sampleFor(l.code)}</div></td>
      <td><select name="narrator-${l.code}" aria-label="${l.name} narrator" data-narrator="${l.code}">${V.VOICES.map(v => html`<option ${v === s.locales[l.code].narrator ? raw('selected') : ''}>${v}</option>`)}</select></td>
      <td class="tv-one"><button class="btn btn-sm" type="button" data-play-narrator data-locale="${l.code}" aria-label="Play ${l.name} with the narrator chosen" ${on ? '' : raw('disabled')}>▶</button></td>
      ${V.VOICES.map(v => html`<td class="tv-v"><button class="btn btn-sm" type="button" data-play data-locale="${l.code}" data-voice="${v}" aria-label="Play ${l.name} with ${v}" ${v === s.locales[l.code].narrator ? raw('aria-current="true"') : ''} ${on ? '' : raw('disabled')}>▶</button></td>`)}
    </tr>`)}</tbody>
  </table></div>
  <h2 class="stats-h">Character voices (every language)</h2>
  <div class="panel row">${Object.keys(V.DEFAULT_ROLES).map(r => html`<label>${r} <select name="role-${r}">${V.VOICES.map(v => html`<option ${v === s.roles[r] ? raw('selected') : ''}>${v}</option>`)}</select></label>`)}</div>
  <div class="row"><button class="btn btn-primary" type="submit">Save</button></div>
  </form>
  <h2 class="stats-h" id="tv-games-h">Games with AI voices</h2>
  <section class="panel" id="tv-games" aria-labelledby="tv-games-h">
    <p class="small">Official games listed for voices (${[...lines.TTS_GAMES].join(', ')}) always have them. Here you can switch them on for one more game made by a teacher, school staff or you: it reads only that game's own words from its published version (numbers may change, and a placeholder may take one of the game's own names), never what a player types or a player's name. A student's game can't be switched on, and official games don't need it: every one of them is listed for voices. You can also switch a game on or off on its own page.</p>
    ${games_.length ? html`<div class="tblwrap"><table class="tbl" id="tv-games-list"><thead><tr><th>Game</th><th>Made by</th><th>State</th><th></th></tr></thead><tbody>${games_.map(x => html`<tr data-game="${x.id}">
      <th scope="row"><a href="/g/${x.slug}">${x.title}</a> <span class="muted small">${x.slug}</span></th><td>@${x.owner}</td>
      <td class="small">${!x.ok ? html`<b>Not allowed:</b> ${x.why}` : !x.live ? 'On once published (not published, or hidden now)' : silent ? html`On, but nothing plays yet: ${silent}` : 'On'}</td>
      <td><button class="btn btn-sm" type="button" data-tg-off="${x.id}">Switch off</button></td></tr>`)}</tbody></table></div>` : html`<p class="small muted" id="tv-games-none">No other game has AI voices.</p>`}
    <form class="row" id="tv-game-add" novalidate>
      <label class="field" style="flex:1;min-width:220px"><span>Add a game: paste its link or name (slug)</span><input class="input" name="game" id="tv-game-input" autocomplete="off" placeholder="https://oomba.ai/g/my-game" maxlength="500"></label>
      <button class="btn btn-primary" type="submit">Switch on AI voices</button>
    </form>
    <p class="small" id="tv-games-status" role="status"></p>
  </section>
  <h2 class="stats-h">Warm-up</h2>
  <section class="panel" id="tv-warm">
    <p class="small">Makes every spoken line of Hero of Sunvale ahead of time for the languages switched on, so kids never wait. Lines already made are skipped. It stops by itself at the daily character cap or the AI budget.</p>
    ${est ? html`<p class="small" id="tv-est">${est.lines} lines for ${onNow.length ? onNow.join(', ') : html`<b>all allowed languages</b> (none is switched on yet)`}: ${est.missing} still to make, ${est.chars.toLocaleString('en-US')} characters, about <b>${usd(est.usd)}</b>.</p>` : ''}
    <div class="row"><button class="btn" type="button" id="tv-warm-go" ${on ? '' : raw('disabled')}>Warm up Hero of Sunvale</button><button class="btn" type="button" id="tv-warm-stop" hidden>Stop</button></div>
    <p class="small" id="tv-warm-status" role="status"></p>
  </section>
  ${jsonData('page-data', { on, warm: lines.status(), onLocales: onNow, allowed: config.ttsLocales })}`;
  page(req, res, { title: 'AI voices', active: 'me', body, head: raw(`${COMMUNITY_CSS}<link rel="stylesheet" href="/css/stats.css">`), scripts: ['/js/admin-voices.js'], back: '/admin', backLabel: 'Admin' });
});

router.post('/api/admin/tts/sample', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!tts.ttsEnabled()) return res.status(404).json({ code: 'off', error: 'AI voices are off.' });
  const b = req.body || {};
  const locale = ttsLocaleList().includes(b.locale) ? b.locale : null;
  if (!locale || !V.VOICES.includes(b.voice)) return res.status(400).json({ error: 'Pick a language and a voice.' });
  if (!allow(`tts-admin:${req.user.id}`, 60, 60e3)) return res.status(429).json({ code: 'fast', error: 'Slow down a little.' });
  try {
    const r = await tts.synthesize({ text: V.sampleFor(locale), locale, role: 'narrator', voice: b.voice, ctx: 'admin', pin: true });
    res.json({ u: r.url, cached: r.cached });
  } catch (e) {
    res.status(STATUS[e.code] || 503).json({ code: e.code, error: e.code === 'site' ? 'The daily characters or the AI budget are used up.' : e.code === 'busy' ? 'The voice service is busy. Try again.' : 'The voice service did not answer.' });
  }
});
router.post('/api/admin/tts/settings', (req, res) => {
  const r = V.save(req.user.id, req.body || {});
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true, settings: r.settings });
});
router.get('/api/admin/tts/warm', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(lines.status()); });
router.post('/api/admin/tts/warm', (req, res) => {
  const b = req.body || {};
  const gs = Array.isArray(b.games) && b.games.length ? b.games.map(String) : ['hero-of-sunvale'];
  const ls = Array.isArray(b.locales) && b.locales.length ? b.locales.map(String) : V.onLocales();
  const r = lines.start({ games: gs, locales: ls, by: req.user.id });
  if (!r.ok) return res.status(409).json({ error: r.error });
  res.json(r.status);
});
router.post('/api/admin/tts/warm/stop', (req, res) => res.json(lines.stop()));
// A game's own switch (services/tts-games.js). GET ?game=<slug, id or link> -> { game }; POST { game, on } -> { ok, game }.
router.get('/api/admin/tts/games', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.query.game == null) return res.json({ games: TG.list() });
  const g = TG.findGame(req.query.game);
  return g ? res.json({ game: TG.info(g) }) : res.status(404).json({ error: 'No game with that name or link.' });
});
router.post('/api/admin/tts/games', (req, res) => {
  const b = req.body || {};
  if (typeof b.on !== 'boolean') return res.status(400).json({ error: 'Say on or off.' });
  const r = TG.set(req.user, TG.findGame(b.game), b.on);
  return r.ok ? res.json(r) : res.status(r.status).json({ error: r.error });
});
