// AI voices (docs/decisions.md "AI voices"; server/services/tts.js). The page asks for a line, gets back the URL of a
// cached MP3 and plays it (a game frame gets the bytes from its play page, because frames can't fetch).
//   POST /api/tts   { ctx, … }  -> 200 { u: '/tts/<sha256>.mp3' } | 404 off | 422 filtered/long | 429 fast/site | 503 busy
//     ctx 'game'   { tok, text, lang, role, rate }  tok: from the play page's page-data (official games only, bound to the
//                  signed-in player, 2 hours). The text is the game's own words.
//     ctx 'live'   { sid, tok, i, lang? }  the live question i (only the one open now), by number: the server reads the
//                  teacher's question and its answer choices. tok: the player's seat token or the host/co-host token.
//     ctx 'lesson' { clId, stepId, i, lang? }  a lesson quiz step's question i, behind the same access as its quiz API.
//   GET /tts/<sha256>.mp3   the cached audio (same-origin only; immutable).
//   Admin (role admin): GET /admin/voices, POST /api/admin/tts/sample, POST /api/admin/tts/settings,
//   GET|POST /api/admin/tts/warm, POST /api/admin/tts/warm/stop.
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
import * as games from '../services/games.js';
import { isOfficial } from '../services/classlive-access.js';
import * as LS from '../services/classlive-sessions.js';
import * as PROG from '../services/progress.js';
import * as aiBudget from '../services/ai-budget.js';
import { LOCALES } from '../i18n/index.js';
import { COMMUNITY_CSS } from './social.js';

export const router = Router();

/** Requests a minute per person (cache hits are cheap), new audio a minute per person, new audio per address in 10 min. */
export const LIMITS = { perMinute: 120, ipGenPer10Min: 200 };
export const GAME_TOKEN_SEC = 2 * 3600;

// ---------------------------------------------------------------- game tokens (minted by the play page)
/** May this game use AI voices: an official seed game, published and not hidden? */
export const gameAllowed = g => !!g && isOfficial(g) && g.status === 'published' && !!g.published_version_id && !g.hidden_reason;
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
const fail = (res, status, code) => res.status(status).json({ code });
const LETTERS = ['A', 'B', 'C', 'D'];
/** A quiz question read aloud: the question, then each choice with its letter. */
export const questionText = (qq, choices = []) => [String(qq || ''), ...choices.map((c, k) => `${LETTERS[k] || k + 1}: ${c}`)].map(s => tts.tidy(s)).filter(Boolean).map(s => (/[.!?。！？]$/.test(s) ? s : s + '.')).join(' ');

/** -> { text, locale, role, rate } or { error: [status, code] }. */
function resolve(req, b) {
  const lang = l => V.ttsLocale(l) || V.ttsLocale(req.locale) || 'en';
  if (b.ctx === 'game') {
    const tok = readToken(typeof b.tok === 'string' ? b.tok : '');
    if (!tok || tok.k !== 'tts' || !tok.u || !req.user || req.user.id !== tok.u) return { error: [403, 'token'] };
    const g = games.getGame(tok.g);
    if (!gameAllowed(g) || !games.canView(req.user, g)) return { error: [404, 'off'] };
    if (typeof b.text !== 'string') return { error: [422, 'long'] };
    const locale = V.ttsLocale(b.lang);
    if (!locale) return { error: [404, 'off'] };
    return { text: b.text, locale, role: V.ROLES.includes(b.role) ? b.role : 'narrator', rate: V.rateBucket(b.rate) };
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
    return { text: questionText(cur.q, cur.choices), locale: lang(b.lang || s.lang), role: 'narrator', rate: 'normal' };
  }
  if (b.ctx === 'lesson') {
    if (!req.user || !config.liveHomework) return { error: [404, 'off'] };
    const r = PROG.quizFor(req.user, String(b.clId || ''), String(b.stepId || ''));
    if (!r.ok) return { error: [404, 'off'] };
    const it = Number.isInteger(b.i) ? r.items[b.i] : null;
    if (!it) return { error: [404, 'off'] };
    return { text: questionText(it.q, it.choices), locale: lang(b.lang), role: 'narrator', rate: 'normal' };
  }
  return { error: [400, 'ctx'] };
}

const STATUS = { off: 404, long: 422, filtered: 422, fast: 429, site: 429, busy: 503, provider: 503 };
router.post('/api/tts', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!tts.ttsEnabled()) return fail(res, 404, 'off');
  if (!allow(`tts:${who(req)}`, LIMITS.perMinute, 60e3)) return fail(res, 429, 'fast');
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const r = resolve(req, b);
  if (r.error) return fail(res, r.error[0], r.error[1]);
  if (!tts.localeOn(r.locale)) return fail(res, 404, 'off');
  const why = tts.speakable(r.text, { user: req.user, ctx: b.ctx });
  if (why) return fail(res, 422, why);
  // New audio only: per person and per address (a whole school behind one address still fits).
  const gate = () => (!allow(`tts-gen:${who(req)}`, config.ttsPerMinute, 60e3) || !allow(`tts-gen-ip:${ipOf(req)}`, LIMITS.ipGenPer10Min, 600e3) ? 'fast' : null);
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
  const body = html`
  <div class="pagehead"><h1>🔊 AI voices</h1></div>
  ${on ? '' : html`<section class="panel" role="status"><b>AI voices are off.</b> They need TTS_ENABLED=1 and a key (TTS_API_KEY, or STT_API_KEY when both providers are openai). Until then nothing here can play, and every page uses the device's own voice.</section>`}
  <section class="panel small">
    <p><b>Provider</b> ${config.ttsProvider || '–'} · <b>model</b> ${config.ttsProvider === 'mock' ? 'mock (silent audio)' : config.ttsModel} · <b>TTS_LOCALES</b> ${config.ttsLocales.join(', ')}</p>
    <p><b>Today</b> ${use.chars.toLocaleString('en-US')} of ${config.ttsDailyChars.toLocaleString('en-US')} characters (${use.calls} new, ${use.hits} from the cache, ${use.fails} failed) · about ${usd(usage.usdFor(use.chars))} · AI budget today ${usd(b.today)} of ${usd(b.daily)}${b.ok ? '' : html` <b>(cap reached: no new audio)</b>`}</p>
    <p><b>Cache</b> ${st.n} lines, ${mb(st.bytes)} of ${config.ttsCacheMb} MB (${st.pinned} kept by warm-up and samples)</p>
    <p class="muted">Only text written by us, a game's makers or a teacher is ever spoken, never what a kid types and never a name. Players are told the voices are AI voices from OpenAI. Each language stays silent until you switch it on here; listen to it first.</p>
  </section>
  <h2 class="stats-h">Languages and narrator voices</h2>
  <p class="muted small">▶ plays the sample sentence in that language with that voice (made once, then kept). Narrator: the voice that reads stories, lessons and quiz questions in that language.</p>
  <form id="tv-form">
  <div class="panel tblwrap"><table class="tbl tv-grid">
    <thead><tr><th>Language</th><th>On</th><th>Narrator</th>${V.VOICES.map(v => html`<th>${v}</th>`)}</tr></thead>
    <tbody>${locales.map(l => html`<tr data-locale="${l.code}">
      <th scope="row">${l.name} <span class="muted small">${l.code}</span><div class="small tv-sample" lang="${l.code}" dir="${l.dir}">${V.sampleFor(l.code)}</div></th>
      <td><input type="checkbox" name="on-${l.code}" aria-label="${l.name} on" ${s.locales[l.code].on ? raw('checked') : ''} ${allowed.has(l.code) ? '' : raw('disabled title="Not in TTS_LOCALES"')}></td>
      <td><select name="narrator-${l.code}" aria-label="${l.name} narrator">${V.VOICES.map(v => html`<option ${v === s.locales[l.code].narrator ? raw('selected') : ''}>${v}</option>`)}</select></td>
      ${V.VOICES.map(v => html`<td><button class="btn btn-s" type="button" data-play data-locale="${l.code}" data-voice="${v}" aria-label="Play ${l.name} with ${v}" ${on ? '' : raw('disabled')}>▶</button></td>`)}
    </tr>`)}</tbody>
  </table></div>
  <h2 class="stats-h">Character voices (every language)</h2>
  <div class="panel row">${Object.keys(V.DEFAULT_ROLES).map(r => html`<label>${r} <select name="role-${r}">${V.VOICES.map(v => html`<option ${v === s.roles[r] ? raw('selected') : ''}>${v}</option>`)}</select></label>`)}</div>
  <div class="row"><button class="btn btn-primary" type="submit">Save</button></div>
  </form>
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
