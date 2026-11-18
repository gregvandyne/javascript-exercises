// Classroom dashboards, stage 5 (docs/decisions.md "Classroom dashboards, stage 5"): what the teacher's screen may show
// from outside Oomba, and the headers that make it safe. No database and no AI here.
// - Video: a pasted YouTube or Vimeo link becomes { p, id } (and Vimeo's unlisted hash): the provider and the video's id,
//   checked character by character. A link is never stored or echoed: anything that is not a valid id is refused.
//   Embeds use the privacy-enhanced hosts only (www.youtube-nocookie.com; player.vimeo.com with dnt=1).
// - Site window: an https address (dash.js cleanUrl) shown inside the teacher's dashboard only when the site says it
//   may be framed. The server asks the site once (its X-Frame-Options and CSP frame-ancestors headers), never following
//   an address that resolves to a private, loopback or link-local machine; no answer means "can't be shown".
// - CSP: the teacher's dashboard page may frame exactly the two video hosts (and itself); everything else keeps the
//   site's CSP. A site window is framed through a same-origin wrapper page whose own CSP names that one site's origin.
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

// ---------------------------------------------------------------- video
export const VIDEO_HOSTS = { youtube: 'https://www.youtube-nocookie.com', vimeo: 'https://player.vimeo.com' };
const YT_ID = /^[A-Za-z0-9_-]{11}$/, VIMEO_ID = /^\d{1,12}$/, VIMEO_HASH = /^[0-9a-f]{6,20}$/;
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
/** A start time in a link (t=90, t=1m30s, #t=1m30s) -> seconds, or 0. */
export function linkTime(v) {
  const s = String(v || '').trim().toLowerCase();
  if (/^\d{1,6}s?$/.test(s)) return Math.min(86400, parseInt(s, 10));
  const m = /^(?:(\d{1,2})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/.exec(s);
  if (!m || !s) return 0;
  return Math.min(86400, (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0));
}
/** A pasted link -> { p: 'youtube'|'vimeo', id, h?, t? } or null. Only https (or a scheme-less "youtu.be/..."), only the
 *  providers' own hosts, only a well-formed id. The link itself is never kept. */
export function parseVideo(raw) {
  let s = String(raw ?? '').trim();
  if (!s || s.length > 300 || /[\u0000- \u007F-\u009F‪-‮⁦-⁩]/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let u; try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  const host = u.hostname.toLowerCase(), parts = u.pathname.split('/').filter(Boolean);
  const t = linkTime(u.searchParams.get('t') || u.searchParams.get('start') || (/^#t=(.+)$/.exec(u.hash) || [])[1]);
  if (YT_HOSTS.has(host)) {
    let id = null;
    if (host.endsWith('youtu.be')) id = parts.length === 1 ? parts[0] : null;
    else if (parts[0] === 'watch' && parts.length === 1) id = u.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0]) && parts.length === 2) id = parts[1];
    return id && YT_ID.test(id) ? { p: 'youtube', id, ...(t ? { t } : {}) } : null;
  }
  if (VIMEO_HOSTS.has(host)) {
    let id = null, h = u.searchParams.get('h') || '';
    if (host === 'player.vimeo.com') id = parts[0] === 'video' && parts.length === 2 ? parts[1] : null;
    else if (parts.length === 1) id = parts[0];
    else if (parts.length === 2 && VIMEO_ID.test(parts[0]) && VIMEO_HASH.test(parts[1])) { id = parts[0]; h = parts[1]; }
    else if (parts.length === 3 && parts[0] === 'channels' && VIMEO_ID.test(parts[2])) id = parts[2];
    if (!id || !VIMEO_ID.test(id) || (h && !VIMEO_HASH.test(h))) return null;
    return { p: 'vimeo', id, ...(h ? { h } : {}), ...(t ? { t } : {}) };
  }
  return null;
}
/** A video setting as a browser sent it (a pasted link, or { p, id[, h] }) -> { p, id[, h] } or null. */
export function cleanVideo(v) {
  if (typeof v === 'string') { const x = parseVideo(v); return x ? { p: x.p, id: x.id, ...(x.h ? { h: x.h } : {}) } : null; }
  if (!v || typeof v !== 'object') return null;
  const id = String(v.id ?? ''), h = String(v.h ?? '');
  if (v.p === 'youtube' && YT_ID.test(id)) return { p: 'youtube', id };
  if (v.p === 'vimeo' && VIMEO_ID.test(id) && (!h || VIMEO_HASH.test(h))) return { p: 'vimeo', id, ...(h ? { h } : {}) };
  return null;
}
/** Where the player comes from: the privacy-enhanced host, with the teacher's start, end, mute and loop. */
export function videoSrc(v, { start = 0, end = 0, mute = false, loop = false } = {}) {
  const x = cleanVideo(v); if (!x) return null;
  const st = Math.max(0, Math.min(86400, Math.round(+start) || 0)), en = Math.max(0, Math.min(86400, Math.round(+end) || 0));
  if (x.p === 'youtube') {
    const q = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' });
    if (st) q.set('start', String(st));
    if (en > st) q.set('end', String(en));
    if (mute) q.set('mute', '1');
    if (loop) { q.set('loop', '1'); q.set('playlist', x.id); }
    return `${VIDEO_HOSTS.youtube}/embed/${x.id}?${q}`;
  }
  const q = new URLSearchParams({ dnt: '1' });
  if (x.h) q.set('h', x.h);
  if (mute) q.set('muted', '1');
  if (loop) q.set('loop', '1');
  return `${VIDEO_HOSTS.vimeo}/video/${x.id}?${q}${st ? `#t=${st}s` : ''}`;
}

// ---------------------------------------------------------------- Content-Security-Policy
/** The teacher's dashboard page: the site's own CSP, with frames from itself and the two video hosts only. */
export const dashCsp = siteCsp => siteCsp.replace("frame-src 'self'", `frame-src 'self' ${VIDEO_HOSTS.youtube} ${VIDEO_HOSTS.vimeo}`);
/** The teacher's dashboard page: the camera for the document camera and the microphone for the noise meter, on this
 *  page only ('self'), after the teacher's own tap. A student's page keeps camera=() and microphone=(). */
export const DASH_TEACHER_POLICY = 'camera=(self), microphone=(self), geolocation=(), payment=(), interest-cohort=()';
const ORIGIN_RE = /^https:\/\/[a-z0-9.-]+$/;
/** The wrapper page a site window is framed through: no scripts, no styles from anywhere, and frames from the site's own
 *  origin(s) only. Only the dashboard (same origin) may frame it. */
export function siteFrameCsp(origins) {
  const list = [...new Set([].concat(origins || []).filter(o => ORIGIN_RE.test(o)))];
  return `default-src 'none'; frame-src ${list.length ? list.join(' ') : "'none'"}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`;
}
/** What a site window's frame may do: run the site's scripts and forms in its own (cross-site) origin, open its own
 *  links in a new tab. Never navigate the dashboard, never reach the camera or microphone. */
export const SITE_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups';

// ---------------------------------------------------------------- may a site be framed?
/** Is this frame-ancestors source list met by our origin? */
function ancestorsAllow(sources, ours) {
  const o = new URL(ours);
  for (const raw of sources) {
    const s = raw.toLowerCase();
    if (s === "'none'") return false;
    if (s === '*') return true;
    if (s === `${o.protocol}`) return true;   // a scheme source, "https:"
    if (s.startsWith("'")) continue;          // 'self' is the site, never us
    const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([a-z0-9.-]+)(?::(\d+|\*))?(?:\/.*)?$/.exec(s);
    if (!m) continue;
    if (m[1] && `${m[1]}:` !== o.protocol) continue;
    const host = o.hostname.toLowerCase();
    if (m[2] ? host.endsWith(`.${m[3]}`) : host === m[3]) return true;
  }
  return false;
}
/** A page's response headers -> 'ok' (may be framed by `ours`) or 'blocked'. CSP frame-ancestors wins over
 *  X-Frame-Options, as in browsers. headers: a plain object, lower-case names, values as strings or arrays. */
export function frameVerdict(headers, ours) {
  const get = k => { const v = headers[k]; return v == null ? [] : [].concat(v).map(String); };
  const fa = [];
  for (const policy of get('content-security-policy').flatMap(p => p.split(','))) {
    const d = policy.split(';').map(x => x.trim()).find(x => /^frame-ancestors(\s|$)/i.test(x));
    if (d) fa.push(d.split(/\s+/).slice(1));
  }
  if (fa.length) return fa.every(list => ancestorsAllow(list, ours)) ? 'ok' : 'blocked';
  const xfo = get('x-frame-options').flatMap(v => v.split(',')).map(v => v.trim().toLowerCase()).filter(Boolean);
  if (xfo.some(v => v === 'deny' || v === 'sameorigin' || v.startsWith('allow-from'))) return 'blocked';
  return 'ok';
}
/** An address no school site should be: loopback, private, link-local, carrier NAT, multicast, unspecified... */
export function privateAddress(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s); if (mapped) return privateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s) || s.startsWith('64:ff9b:') || s.startsWith('2001:db8');
  }
  return true;
}
/** dns.lookup that refuses private addresses (the connection uses exactly the address checked: no rebinding). */
export function safeLookup(host, opts, cb) {
  dns.lookup(host, { all: true }, (err, list) => {
    if (err) return cb(err);
    const ok = (list || []).filter(a => !privateAddress(a.address));
    if (!ok.length || ok.length !== list.length) return cb(Object.assign(new Error('private address'), { code: 'EPRIVATE' }));
    if (opts && opts.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
}
/** One request for headers only (the body is never read). -> { status, headers, location } */
function headOnly(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', lookup: safeLookup, timeout: timeoutMs, headers: { 'user-agent': 'Mozilla/5.0 (compatible; classroom-dashboard frame check)', accept: 'text/html' } }, res => {
      resolve({ status: res.statusCode, headers: res.headers, location: res.headers.location });
      res.destroy();
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}
const probeCache = new Map();
export const PROBE_MS = 30 * 60e3, PROBE_MAX = 500;
let probeImpl = null;
/** Tests and the fit check swap the network out (and back with no argument). */
export function _setSiteProbe(f) { probeImpl = f || null; probeCache.clear(); }
/** May `url` (already through cleanUrl) be framed by `ours`? -> { frame: 'ok'|'blocked'|'unknown', origins }. Follows up
 *  to three redirects, each checked again; never throws; cached for half an hour. clean: dash.js cleanUrl. */
export async function siteFrame(url, ours, clean, timeoutMs = 5000) {
  const key = `${ours} ${url}`, hit = probeCache.get(key);
  if (hit && hit.until > Date.now()) return hit.v;
  let v;
  try {
    if (probeImpl) v = await probeImpl(url, ours);
    else {
      let at = url; const origins = [new URL(url).origin];
      v = { frame: 'unknown', origins };
      for (let hop = 0; hop < 4; hop++) {
        const r = await headOnly(at, timeoutMs);
        if (r.status >= 300 && r.status < 400 && r.location && hop < 3) {
          const next = clean(new URL(r.location, at).href); if (!next) break;
          at = next; origins.push(new URL(next).origin); continue;
        }
        if (r.status >= 200 && r.status < 300) v = { frame: frameVerdict(r.headers, ours), origins: [...new Set(origins)] };
        break;
      }
    }
  } catch { v = { frame: 'unknown', origins: [new URL(url).origin] }; }
  if (!v || !['ok', 'blocked', 'unknown'].includes(v.frame)) v = { frame: 'unknown', origins: [new URL(url).origin] };
  probeCache.set(key, { v, until: Date.now() + PROBE_MS });
  if (probeCache.size > PROBE_MAX) probeCache.delete(probeCache.keys().next().value);
  return v;
}
