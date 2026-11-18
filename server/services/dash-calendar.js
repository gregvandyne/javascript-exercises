// A calendar connected to a class's schedule widget (docs/decisions.md "Schedule: a standard week, uploaded agendas, a
// connected calendar"). The teacher pastes a calendar's iCal address (Google's "secret address in iCal format",
// Outlook's published ICS link, an Apple public calendar; webcal:// is read as https://). The address is private: it is
// kept in dash_feeds and never sent to any screen; the widget keeps only the row's id and the calendar's name.
// The server fetches the file (https only, never a private address, at most MAX_BYTES, three redirects), keeps it for
// FEED_MS, and a screen gets today's timed events (in the school's time zone) with its live state. No AI here.
import https from 'node:https';
import { q, now, uid, audit } from '../db.js';
import { safeLookup } from './dash-media.js';
import { readIcs, icsDay } from '../../public/js/agenda.js';

export const FEED_MS = 15 * 60e3, FEED_RESTING_MS = 5 * 60e3, FEED_STALE_MS = 24 * 3600e3, MAX_BYTES = 3 * 1024 * 1024, MAX_FEEDS_CACHED = 300, MAX_FEEDS_PER_CLASS = 20;
const FEED_ID = /^[A-Za-z0-9_-]{8,40}$/;

/** A pasted calendar address -> an https URL, or null. webcal:// (Apple, Outlook) is the same file over https. */
export function feedAddress(v, cleanUrl) {
  let s = String(v ?? '').trim();
  if (/^webcals?:\/\//i.test(s)) s = s.replace(/^webcals?:/i, 'https:');
  return cleanUrl(s);
}

/** One GET with the body (at most MAX_BYTES), through the private-address check. -> { status, location, body } */
function get(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', lookup: safeLookup, timeout: timeoutMs, headers: { 'user-agent': 'Mozilla/5.0 (compatible; classroom-dashboard calendar)', accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400) { resolve({ status: res.statusCode, location: res.headers.location }); res.destroy(); return; }
      const chunks = []; let n = 0;
      res.on('data', c => { n += c.length; if (n > MAX_BYTES) { res.destroy(); reject(new Error('too big')); } else chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    const all = setTimeout(() => req.destroy(new Error('timeout')), timeoutMs * 2); all.unref?.();
    req.on('close', () => clearTimeout(all));
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}
let fetchImpl = null;
/** Tests swap the network out (and back with no argument): f(url) -> the file's text, or throws. */
export function _setFeedFetch(f) { fetchImpl = f || null; feedCache.clear(); }
/** The calendar file at `url` (already through feedAddress) as text. Throws 'notCalendar' / network errors. */
export async function fetchCalendar(url, cleanUrl, timeoutMs = 8000) {
  let text;
  if (fetchImpl) text = await fetchImpl(url);
  else {
    let at = url;
    for (let hop = 0; ; hop++) {
      const r = await get(at, timeoutMs);
      if (r.location && hop < 3) { const next = feedAddress(new URL(r.location, at).href, cleanUrl); if (!next) throw new Error('bad redirect'); at = next; continue; }
      if (!(r.status >= 200 && r.status < 300) || r.body === undefined) throw new Error(`calendar ${r.status}`);
      text = r.body; break;
    }
  }
  if (!/BEGIN:VCALENDAR/i.test(String(text || '').slice(0, 4096))) throw Object.assign(new Error('not a calendar'), { code: 'notCalendar' });
  return String(text);
}
/** The calendar's own name (X-WR-CALNAME), or ''. */
export const calendarName = text => ((/^X-WR-CALNAME:(.*)$/im.exec(text) || [])[1] || '').replace(/\\([,;\\])/g, '$1').trim().slice(0, 60);

// ---------------------------------------------------------------- the class's connected calendars
export const getFeed = id => (FEED_ID.test(String(id || '')) ? q.get('SELECT * FROM dash_feeds WHERE id=?', String(id)) : null);
/** A teacher connects a calendar to a class: checked by fetching it once. -> { feed: { id, name }, events: n } or { error }. */
export async function connectFeed(u, c, raw, cleanUrl) {
  const url = feedAddress(raw, cleanUrl);
  if (!url) return { error: 'feedAddress', status: 400 };
  if (q.get('SELECT COUNT(*) n FROM dash_feeds WHERE class_id=?', c.id).n >= MAX_FEEDS_PER_CLASS) return { error: 'feedTooMany', status: 400 };
  let text;
  try { text = await fetchCalendar(url, cleanUrl); } catch (e) { return { error: e.code === 'notCalendar' ? 'feedNotCalendar' : 'feedUnreachable', status: 400 }; }
  const events = readIcs(text);
  const id = uid(), name = calendarName(text) || new URL(url).hostname.replace(/^www\./, '').slice(0, 60);
  q.run('INSERT INTO dash_feeds(id, class_id, owner_id, url, name, created_at) VALUES (?,?,?,?,?,?)', id, c.id, u.id, url, name, now());
  feedCache.set(id, { events, until: now() + FEED_MS, at: now() });
  audit(u.id, 'dash.calendar_connected', c.id, { feed: id });
  return { feed: { id, name }, events: events.length };
}
/** Disconnect: the row (and its address) goes. Only its teacher, in its class. */
export function dropFeed(u, c, id) {
  const f = getFeed(id);
  if (!f || f.class_id !== c.id || f.owner_id !== u.id) return { error: 'notFound', status: 404 };
  q.run('DELETE FROM dash_feeds WHERE id=?', f.id); feedCache.delete(f.id);
  audit(u.id, 'dash.calendar_removed', c.id, { feed: f.id });
  return { ok: true };
}
/** A teacher's account goes: the calendars they connected go with it. */
export function forgetFeedsOf(userId) { for (const r of q.all('SELECT id FROM dash_feeds WHERE owner_id=?', userId)) feedCache.delete(r.id); q.run('DELETE FROM dash_feeds WHERE owner_id=?', userId); }

// ---------------------------------------------------------------- what a screen shows
export const feedCache = new Map();
async function refresh(f, cleanUrl, t) {
  const old = feedCache.get(f.id);
  feedCache.set(f.id, { ...(old || {}), pending: true, until: t + FEED_RESTING_MS });
  try {
    const events = readIcs(await fetchCalendar(f.url, cleanUrl));
    feedCache.set(f.id, { events, until: t + FEED_MS, at: t });
  } catch {
    // Keep yesterday's copy through an outage; otherwise the widget falls back to the typed schedule.
    const keep = old && old.events && t - old.at < FEED_STALE_MS ? old : null;
    feedCache.set(f.id, keep ? { ...keep, until: t + FEED_RESTING_MS, pending: false } : { resting: true, until: t + FEED_RESTING_MS });
  }
  if (feedCache.size > MAX_FEEDS_CACHED) feedCache.delete(feedCache.keys().next().value);
}
/** Today's periods from a widget's connected calendar: { periods } , { loading } or { resting }. Never waits for the
 *  network: a stale copy is refreshed in the background. Only a calendar connected to this class is read. */
export function feedDay(c, ref, ymd, tz, cleanUrl, t = now()) {
  const f = ref && getFeed(ref.id);
  if (!f || f.class_id !== c.id) return { resting: true };
  const e = feedCache.get(f.id);
  if ((!e || e.until <= t) && !(e && e.pending)) refresh(f, cleanUrl, t).catch(() => {});
  const cur = feedCache.get(f.id);
  if (cur && cur.events) return { periods: icsDay(cur.events, ymd, tz) };
  return cur && cur.resting ? { resting: true } : { loading: true };
}
/** A widget's calendar setting: the row's id and the name shown, nothing else. */
export function cleanFeedRef(v) {
  if (!v || typeof v !== 'object' || !FEED_ID.test(String(v.id || ''))) return null;
  return { id: String(v.id), name: String(v.name || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 60) };
}
