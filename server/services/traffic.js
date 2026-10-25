// Site visits for the admin stats page, counted without tracking anyone:
// - only daily totals per page area are kept (traffic table);
// - a visitor is counted once per day through a salted hash of (day, IP, browser). The salt is the session secret and
//   changes the hash every day, so visitors cannot be followed across days; the day's hashes are deleted after two days.
// Counted: successful GET page loads (HTML) by people. Not counted: APIs, files, game frames, admin pages, bots.
import crypto from 'node:crypto';
import { q, today } from '../db.js';
import { config } from '../config.js';
import { register } from './jobs.js';
import { ipOf } from './ratelimit.js';

const SKIP = /^\/(api|frame|shots|covers|sdk|js|css|fonts|img|health|admin|favicon|robots|manifest)/;
const BOTS = /bot|crawl|spider|slurp|preview|monitor|uptime|curl|wget|python|node-fetch|headless|lighthouse|render/i;
const AREAS = [[/^\/$/, 'home'], [/^\/g\//, 'game'], [/^\/play\//, 'play'], [/^\/(build|studio)/, 'build'], [/^\/search/, 'search'],
  [/^\/favorites/, 'favorites'], [/^\/(friends|chat)/, 'friends'], [/^\/u\//, 'profile'], [/^\/me/, 'me'], [/^\/(signup|login)/, 'signup'],
  [/^\/(teach|class|school|classes)\b/, 'school']]; // teacher, class and school pages (lessons and progress live under /teach and /class)
export const areaOf = path => (AREAS.find(([re]) => re.test(path)) || [null, 'other'])[1];

const salt = () => config.sessionSecret || 'magic-cups';
const visitorHash = (day, ip, ua) => crypto.createHash('sha256').update(`${salt()}|${day}|${ip}|${ua}`).digest('base64url').slice(0, 16);

/** Record one page view (and, if this visitor is new today, one visitor). */
export function recordView(path, ip, ua, day = today()) {
  q.run('INSERT INTO traffic(day, area, views) VALUES (?,?,1) ON CONFLICT(day, area) DO UPDATE SET views=views+1', day, areaOf(path));
  const r = q.run('INSERT OR IGNORE INTO visit_seen(day, h) VALUES (?,?)', day, visitorHash(day, ip, ua));
  if (r.changes) q.run("INSERT INTO traffic(day, area, views) VALUES (?, '_visitors', 1) ON CONFLICT(day, area) DO UPDATE SET views=views+1", day);
}

/** Express middleware: counts after the response, only for real page views. */
export function countVisits(req, res, next) {
  if (req.method !== 'GET' || SKIP.test(req.path) || !String(req.headers.accept || '').includes('text/html')) return next();
  const ua = String(req.headers['user-agent'] || '');
  if (!ua || BOTS.test(ua)) return next();
  res.on('finish', () => {
    if (res.statusCode !== 200 || !String(res.getHeader('content-type') || '').includes('text/html')) return;
    try { recordView(req.path, ipOf(req), ua); } catch { /* stats must never break a page */ }
  });
  next();
}

/** Forget visitor hashes older than yesterday. */
export function pruneVisitors(day = today()) {
  const cut = today(Date.parse(day + 'T00:00:00Z') - 86400e3);
  return q.run('DELETE FROM visit_seen WHERE day < ?', cut).changes;
}
register('prune-visitors', 3600e3, () => pruneVisitors());
