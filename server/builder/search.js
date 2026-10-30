// Web search for the Builder ("open web, filtered"; docs/decisions.md). The Builder model may look facts up on the web
// (a real animal, a sport's rules, a planet) with Anthropic's web search server tool, so a game gets them right.
// - Off unless BUILDER_WEB_SEARCH=1 (config.builderWebSearch). The Anthropic Console's web search setting is a second
//   switch, and can hold the same blocked list for the whole account.
// - The tool is the same, byte for byte, in every round of a build and never added or removed partway through one
//   (that would break the model's kept thinking and the prompt cache). It is decided once, when a build starts.
// - Blocked sites: adult, dating, gambling, gore and hate, forums and imageboards, social networks and messaging, AI
//   companions, user video and streaming, drugs, piracy (BLOCKED_DOMAINS; subdomains are covered by the API itself).
// - Direct calls only (allowed_callers ['direct']): plain query/result pairs we can read while they stream, and no code
//   execution, so the request stays eligible for zero data retention. No user location is ever sent.
// - A cap per build (SEARCHES_PER_BUILD), counted by us: max_uses only counts within one request.
// - Screening: each query is checked as soon as it is complete (screenQuery); after a round with results, the queries,
//   titles, sites and cited quotes are checked (screenFound). Page text itself comes back encrypted, so it can't be read;
//   what the model makes from it is still checked as chat text and by the game safety scan.
// - Kids never see a link, a page, a query or a site name: the Studio only shows "Looking something up".
// - Every search is logged for the admin (builder_searches): the build, the game, the query, the sites, flagged or not.
//   Never a user id or name; a query that looks like personal details or names the builder is stored as [redacted].
//   Kept 90 days. A search runs as soon as the model asks for it, so query checks can't stop it leaving: SEARCH_RULES
//   and the screen on kids' own messages are the first guard.
import { config } from '../config.js';
import { q, uid, today } from '../db.js';
import { personalInfo } from '../services/textfilter.js';
import { prefilter, mockClassify, webClassify } from './screen.js';
import { log } from '../services/log.js';
import { register } from '../services/jobs.js';

/** Searches one build may make in all (each API request may make up to MAX_USES of them). */
export const SEARCHES_PER_BUILD = 4;
export const MAX_USES = 3;
/** Beyond the cap plus this many, the build stops (the model ignored the note). */
export const SEARCH_BACKSTOP = 2;
/** Blocked queries in one build before it stops. */
export const MAX_BLOCKED = 2;
const KEEP_DAYS = 90;

// ASCII, no scheme, no "*." (the API covers subdomains itself and refuses wildcards there). Encyclopedias, science and
// news-for-kids sites stay allowed on purpose.
export const BLOCKED_DOMAINS = Object.freeze([
  // adult / sexual
  'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com', 'youporn.com', 'spankbang.com', 'eporner.com', 'tube8.com',
  'brazzers.com', 'onlyfans.com', 'fansly.com', 'chaturbate.com', 'stripchat.com', 'livejasmin.com', 'bongacams.com', 'cam4.com',
  'myfreecams.com', 'motherless.com', 'efukt.com', 'rule34.xxx', 'rule34.paheal.net', 'e-hentai.org', 'nhentai.net', 'hentaihaven.xxx',
  'literotica.com', 'adultfriendfinder.com', 'ashleymadison.com',
  // dating
  'tinder.com', 'bumble.com', 'grindr.com', 'hinge.co', 'match.com',
  // gambling, betting, skin casinos, prediction markets
  'bet365.com', 'draftkings.com', 'fanduel.com', 'betmgm.com', 'pokerstars.com', 'williamhill.com',
  'paddypower.com', 'betfair.com', 'ladbrokes.com', 'betway.com', 'bwin.com', 'unibet.com', '888casino.com', '888poker.com', 'bovada.lv',
  'stake.com', 'stake.us', 'roobet.com', 'rollbit.com', 'gamdom.com', 'csgoempire.com', 'csgoroll.com', 'chumbacasino.com',
  'prizepicks.com', 'underdogfantasy.com', 'polymarket.com', 'kalshi.com',
  // gore, shock, extremist, hate
  'kiwifarms.net', 'stormfront.org', 'theync.com', 'documentingreality.com', 'kaotic.com', 'crazyshit.com', 'goregrish.com', 'bestgore.fun',
  'gab.com', '8kun.top', 'sanctioned-suicide.net',
  // anonymous imageboards and forums (some per language)
  '4chan.org', '4channel.org', '2ch.hk', '5ch.net', '2chan.net', 'reddit.com', 'quora.com', '9gag.com', 'ifunny.co', 'pikabu.ru',
  'ptt.cc', 'dcard.tw', 'rotter.net', 'fxp.co.il', 'ask.fm', 'tellonym.me',
  // social networks, messaging, random chat, AI companions
  'facebook.com', 'instagram.com', 'threads.net', 'tiktok.com', 'douyin.com', 'x.com', 'twitter.com', 'snapchat.com', 'bsky.app',
  'tumblr.com', 'pinterest.com', 'linkedin.com', 'vk.com', 'ok.ru', 'weibo.com', 'xiaohongshu.com', 'discord.com', 'discord.gg',
  'telegram.org', 't.me', 'whatsapp.com', 'kik.com', 'line.me', 'ome.tv', 'chatroulette.com', 'monkey.app', 'yubo.live', 'wizz.chat',
  'character.ai', 'replika.com',
  // user video and live streaming
  'youtube.com', 'youtu.be', 'twitch.tv', 'kick.com', 'rumble.com', 'bitchute.com', 'dailymotion.com', 'vimeo.com', 'odysee.com',
  'bilibili.com', 'nicovideo.jp', 'trovo.live',
  // drugs
  'leafly.com', 'weedmaps.com', 'erowid.org', 'bluelight.org', 'shroomery.org',
  // piracy
  'thepiratebay.org', '1337x.to',
]);

/** The server tool, exactly as every request of a build sends it. */
export const WEB_SEARCH_TOOL = Object.freeze({
  type: 'web_search_20260209', name: 'web_search', max_uses: MAX_USES, allowed_callers: ['direct'], blocked_domains: BLOCKED_DOMAINS,
});

// The API refused the tool (for example a blocked-site entry it doesn't accept, or web search switched off for the
// account): searches stay off until the next restart, so builds keep working.
let broken = null;
/** Is web search on for builds starting now? */
export const webSearchOn = () => !!config.builderWebSearch && !broken;
/** The request was refused because of the web search tool: turn it off for this process. */
export function disable(reason) { if (!broken) { broken = String(reason || 'refused').slice(0, 200); log('error', 'builder web search turned off', { reason: broken }); } }
export const _reset = () => { broken = null; };
/** A 400 from the API that names the web search tool or its settings. */
export const isToolRefusal = e => !!e && e.status === 400 && /web_search|blocked_domains|allowed_callers|server tool|domain/i.test(String(e.message || ''));

/** The Builder's tools for a build that starts now: base, plus web search when it is on. Decided once per build. */
export const toolsFor = base => (webSearchOn() ? [...base, WEB_SEARCH_TOOL] : base);

/** Model-facing rules, a fixed system block sent right after the system prompt while web search is on. */
export const SEARCH_RULES = `# Looking things up on the web (web_search)
- You can use web_search, but only to get a real-world fact right for the game: a real animal, a planet, a sport's rules, a
  country's flag colours, a holiday, a science fact. Most games need no search at all: never search for ideas, code or pictures.
- At most ${SEARCHES_PER_BUILD} searches in one build. Short, plain queries about the fact you need.
- Never search for people the builder knows, the builder themself, their school, town or anything personal, and never for a
  private person. Never search for anything that would not be OK in a game for children.
- Put facts into the game and the chat in your own simple words. Never copy text, links, site names, pictures or quotes from
  web pages into the game or the chat. The game still has no network: never load anything from the web.
- Every other rule still applies. Searching a film, a show or a brand does not make its characters or names allowed.
- If a note says a search was not allowed or not suitable, don't use anything from it and carry on without it.`;

/** Platform notes for the model (no locale key: the model reads them). */
export const NOTES = {
  cap: `[Note from the platform: that was the last web search for this build (${SEARCHES_PER_BUILD} in all). Don't search again; carry on with what you know.]`,
  blocked: '[Note from the platform: that web search was not allowed, so it was stopped. Don\'t search for that again; carry on without it.]',
  unsafe: '[Note from the platform: what that web search found is not suitable for a children\'s game. Don\'t use anything from it; carry on without it.]',
};

// ---- Screening --------------------------------------------------------------------------------------------------
// Words that name a school or a home town: a capitalised "First Last" next to one of them looks like a private person.
const PLACE_WORDS = /\b(school|elementary|primary|secondary|academy|kindergarten|preschool|nursery|middle school|high school|junior high|class|teacher|town|village|neighbou?rhood|escuela|colegio|école|ecole|collège|schule|grundschule|gymnasium|scuola|escola|school|школа|学校|小学|中学|幼稚園|בית ספר|مدرسة)\b/iu;
const FULL_NAME = /(?:^|[^\p{L}])\p{Lu}\p{Ll}{1,20}\s+\p{Lu}\p{Ll}{1,20}(?![\p{L}])/u;
/** The account's own names as search words: usernames and display names, also with "_" read as a space. */
export function namesOf(...users) {
  const out = new Set();
  for (const u of users) {
    if (!u) continue;
    for (const v of [u.username, u.display_name, u.real_name, u.first_name, u.last_name]) {
      const s = String(v || '').trim().toLowerCase(); if (s.length < 3) continue;
      out.add(s); if (/[_.]/.test(s)) { const sp = s.replace(/[_.]+/g, ' ').trim(); if (sp.length >= 3) out.add(sp); }
    }
  }
  return [...out];
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A query that names the builder (their username or display name) or looks like a private person at a school or town. */
export function personalQuery(query, names = []) {
  const s = String(query || '');
  const low = s.toLowerCase();
  for (const n of names) if (n && new RegExp(`(?<![\\p{L}\\p{N}])${esc(n)}(?![\\p{L}\\p{N}])`, 'iu').test(low)) return true;
  return FULL_NAME.test(s) && PLACE_WORDS.test(s);
}
/**
 * A query as it finished streaming: the word rules and the personal-details check. names: the builder's own names
 * (namesOf). -> category | null. The search itself has already run by then (it is a server tool): this stops its
 * results being used and keeps the query out of the log; the main guard is SEARCH_RULES and the screen on kids' messages.
 */
export function screenQuery(query, names = []) {
  const s = String(query || '');
  if (!s.trim()) return null;
  const pi = personalInfo(s);
  if (pi && pi !== 'link') return 'personal';   // a site name in a query is fine; phone numbers, emails, addresses are not
  if (personalQuery(s, names)) return 'personal';
  const cat = prefilter(s);
  if (cat && cat !== 'links') return cat;
  return mockClassify(s);
}
// Categories that make found content unsuitable when only the word rules see it (titles name films and people
// naturally, so copyright and real-people words alone don't flag a fact search).
const UNSAFE_RULES = new Set(['sexual', 'selfharm', 'hate', 'drugs', 'gambling', 'profanity', 'rules']);
/**
 * What a round's searches found, as far as we can read it. -> Promise<category | 'unchecked' | null>. Never throws.
 * null only when the classifier really allowed it; when it can't run (no key, timeout, error) -> 'unchecked', and the
 * caller treats the round like an unsuitable one.
 */
export async function screenFound(found, { model = !!config.anthropicKey } = {}) {
  const lines = [...(found.queries || []).map(x => `search: ${x}`), ...(found.titles || []).map(x => `result: ${x}`),
    ...(found.domains || []).map(x => `site: ${x}`), ...(found.quotes || []).map(x => `quote: ${x}`)];
  if (!lines.length) return null;
  if ((found.domains || []).some(isBlocked)) return 'other';   // a blocked site should never come back
  for (const l of [...(found.titles || []), ...(found.quotes || [])]) {
    const c = mockClassify(l) || prefilter(l);
    if (c && UNSAFE_RULES.has(c)) return c;
  }
  if (!model) return 'unchecked';
  try { return await webClassify(lines.join('\n')); } catch { return 'unchecked'; }
}

/**
 * The Builder's own chat text written after a search (any later round of the build too), before it is shown: no rude
 * words, nothing unsafe, no personal details or contact requests (a page may tell the model to ask for them), no links.
 * Pass the text with links already stripped.
 */
export function textOk(text) {
  const c = prefilter(text) || mockClassify(text);
  if (c && (UNSAFE_RULES.has(c) || c === 'personal' || c === 'links')) return false;
  const pi = personalInfo(text);
  return !(pi && pi !== 'link');
}

// ---- Sites and links --------------------------------------------------------------------------------------------
/** "https://www.Example.com/x" -> "example.com"; '' when it isn't a web address. */
export function domainOf(url) {
  try { const u = new URL(String(url)); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '') : ''; } catch { return ''; }
}
/** A site (or one of its subdomains) on BLOCKED_DOMAINS (entries with a path block the whole site here). */
export function isBlocked(domain) {
  const d = String(domain || '').toLowerCase();
  return !!d && BLOCKED_DOMAINS.some(b => { const host = b.split('/')[0]; return d === host || d.endsWith(`.${host}`); });
}
// Links and site names, anywhere in the text (inside brackets, quotes, markdown or CJK text with no spaces too).
const ZERO_WIDTH = /[\u00ad\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/g;
const URLS = /(?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+/gi;
// word.tld (2-24 letters) with any subdomains and path; not a file name (dragon.png) or a decimal (3.5).
const DOMAINS = /(?<![A-Za-z0-9@-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?!(?:png|jpe?g|gif|webp|svg|bmp|ico|txt|pdf|mp[34]|mov|wav|ogg|zip|rar|docx?|xlsx?|pptx?|csv|js|mjs|json|html?|css|md|exe|dmg|apk)(?![a-z]))[a-z]{2,24}(?![A-Za-z0-9])(?:\/[A-Za-z0-9\-._~:/?#@!$&*+,;=%]*)?/giu;
const MD_LINK = /\[([^\]\n]{0,200})\]\([^)\n]*\)/g;
/** Removes links and site names from a piece of finished text (a markdown link keeps its words, without the link). */
export const stripLinks = text => String(text || '').replace(ZERO_WIDTH, '').replace(MD_LINK, '$1').replace(URLS, '').replace(DOMAINS, '')
  .replace(/(?:<\s*>|\(\s*\)|\[\s*\]|"\s*"|«\s*»|“\s*”|「\s*」)/g, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([,.!?;:])/g, '$1');
/**
 * Removes links from streamed text: holds back only the word still being written (up to the next space), so the
 * chat keeps streaming. push(chunk) -> text safe to show now; flush() -> the rest.
 */
export function linkFilter() {
  let tail = '';
  return {
    push(chunk) {
      const s = tail + String(chunk || ''); const cut = Math.max(s.lastIndexOf(' '), s.lastIndexOf('\n'), s.lastIndexOf('\t'));
      if (cut < 0) { tail = s; if (tail.length < 400) return ''; tail = ''; return stripLinks(s); }
      tail = s.slice(cut + 1); return stripLinks(s.slice(0, cut + 1));
    },
    flush() { const s = tail; tail = ''; return stripLinks(s); },
  };
}

// ---- Admin log --------------------------------------------------------------------------------------------------
/** Logs one search. Never stores a user id or name; a query with personal details or the builder's own names
 *  (names: namesOf) is stored as [redacted]. */
export function logSearch({ turnId = null, gameId = null, query = '', domains = [], results = 0, flagged = false, reason = null, names = [] }) {
  try {
    const pi = personalInfo(query);
    const stored = (pi && pi !== 'link') || personalQuery(query, names) || reason === 'personal' ? '[redacted]' : String(query || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 300);
    const id = uid();
    q.run('INSERT INTO builder_searches(id, turn_id, game_id, day, query, domains, results, flagged, reason, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      id, turnId, gameId, today(), stored, JSON.stringify([...new Set(domains)].slice(0, 20)), results | 0, flagged ? 1 : 0, reason ? String(reason).slice(0, 40) : null, Date.now());
    return id;
  } catch { return null; }   // the log never breaks a build
}
/** Marks logged searches as flagged (what they found was not suitable). A 'personal' verdict also redacts the query. */
export function flag(ids, reason) {
  for (const id of ids || []) {
    try {
      q.run('UPDATE builder_searches SET flagged=1, reason=COALESCE(reason, ?) WHERE id=?', reason ? String(reason).slice(0, 40) : 'found', id);
      if (reason === 'personal') q.run("UPDATE builder_searches SET query='[redacted]' WHERE id=?", id);
    } catch { /* ignore */ }
  }
}
/** For the admin page: newest first. */
export function listSearches({ flagged = false, limit = 200 } = {}) {
  const rows = q.all(`SELECT s.*, g.title AS game_title, g.slug AS game_slug FROM builder_searches s LEFT JOIN games g ON g.id=s.game_id
    ${flagged ? 'WHERE s.flagged=1' : ''} ORDER BY s.created_at DESC LIMIT ?`, Math.min(1000, Math.max(1, limit | 0)));
  return rows.map(r => { let d = []; try { d = JSON.parse(r.domains); } catch { /* ignore */ } return { ...r, domains: d }; });
}
export const flaggedCount = () => q.get("SELECT COUNT(*) AS n FROM builder_searches WHERE flagged=1 AND created_at > ?", Date.now() - 7 * 864e5).n;
/** Retention: rows older than 90 days go. */
export function forget(now = Date.now()) { return q.run('DELETE FROM builder_searches WHERE created_at < ?', now - KEEP_DAYS * 864e5).changes; }
register('builder-searches-retention', 864e5, () => forget(), { firstAfterMs: 9 * 60e3 });
