// The site's public address. Behind a CDN or gateway that rewrites the Host header (CloudFront, Front Door,
// Application Gateway), Host is an internal name: PUBLIC_URL (e.g. https://play.example.com) says the real one.
// Unset, everything uses the Host header as before.
import net from 'node:net';
import { config, hostOnly, HOST_RE } from './config.js';
export { hostOnly };

/** The host people type (login cards): PUBLIC_URL's, else the request's Host header. */
export const siteHost = req => (config.publicUrl ? new URL(config.publicUrl).host : String(req.get('host') || ''));

/** Is this Origin header our own site? PUBLIC_URL's origin, or the host the request came in on. */
export function isOwnOrigin(req, origin) {
  let u; try { u = new URL(origin); } catch { return false; }
  if (config.publicUrl && u.origin === config.publicUrl) return true;
  return u.host === req.headers.host;
}

/** PUBLIC_URL's host, compared with hostOnly(Host) ("oomba.ai"); '' when PUBLIC_URL is unset. */
export const publicHost = () => (config.publicUrl ? hostOnly(new URL(config.publicUrl).host) : '');
/** oomba.ai <-> www.oomba.ai. None for an IP address or a name without a dot (localhost). */
export function wwwTwin(host) {
  if (host.startsWith('www.')) return host.slice(4);
  const name = host.replace(/:\d+$/, '');
  return net.isIP(name) || !name.includes('.') ? '' : 'www.' + host;
}
let memo = { key: null, hosts: new Set() };
/**
 * The old names of the site (server/domain.js): page loads arriving on one of these go to the same page on PUBLIC_URL.
 * Render's own name (RENDER_EXTERNAL_HOSTNAME, e.g. magic-cup.onrender.com), PUBLIC_URL's www. twin and REDIRECT_HOSTS.
 * A named list on purpose, never "any other host": behind a CDN that rewrites Host, every request arrives on an
 * internal name, which must be served, not redirected. Empty when PUBLIC_URL is unset; never contains PUBLIC_URL's host.
 */
export function legacyHosts() {
  const key = `${config.publicUrl}|${config.renderHost}|${config.redirectHosts.join(',')}`;
  if (memo.key === key) return memo.hosts;
  const own = publicHost(); const hosts = new Set();
  if (own) for (const h of [config.renderHost, wwwTwin(own), ...config.redirectHosts].map(hostOnly)) if (h && h !== own && HOST_RE.test(h)) hosts.add(h);
  memo = { key, hosts };
  return hosts;
}
