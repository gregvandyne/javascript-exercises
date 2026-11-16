// Classroom dashboards, stage 5: the video widget's links (docs/decisions.md "Classroom dashboards, stage 5"). The same
// rules as server/services/dash-media.js (tests/unit/dash-stage5.test.js checks they agree): a pasted YouTube or Vimeo
// link becomes { p, id } (and Vimeo's unlisted hash), anything else is refused, and the player comes from the
// privacy-enhanced hosts only. Pure: no network, no storage, no page.
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

/** The site window's address: the browser's copy of services/dash.js cleanUrl (tests/unit/dash-stage5.test.js checks
 *  they agree), so the settings say at once when an address will be refused (http, a port, an IP address, a local name)
 *  instead of the server dropping it on save. -> the address, or null. */
export function siteUrl(v) {
  const s = String(v ?? '').trim();
  if (!s || s.length > 500 || /[\u0000- \u007F-\u009F‪-‮⁦-⁩]/.test(s)) return null;
  let u; try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host) || !host.includes('.') || host.startsWith('.') || host.endsWith('.') || /^[\d.]+$/.test(host)) return null;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  return u.href;
}
/** The QR widget's "A website" box: services/dash.js webAddress in the browser (tests/unit/dash-stage2.test.js checks
 *  they agree). "example.org/page" without a scheme is read as https://example.org/page; then every siteUrl rule. */
export function webAddress(v) {
  const s = String(v ?? '').trim();
  return siteUrl(s && !/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s) ? `https://${s}` : s);
}
/** The longest address (in bytes) the dashboard's QR code takes: services/qr.js capacity(MAX_DASH_VERSION). */
export const QR_WEB_MAX = 331;
export const tooLongForQr = href => new TextEncoder().encode(String(href)).length > QR_WEB_MAX;
