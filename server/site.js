// The site's public address. Behind a CDN or gateway that rewrites the Host header (CloudFront, Front Door,
// Application Gateway), Host is an internal name: PUBLIC_URL (e.g. https://play.example.com) says the real one.
// Unset, everything uses the Host header as before.
import { config } from './config.js';

/** The host people type (login cards): PUBLIC_URL's, else the request's Host header. */
export const siteHost = req => (config.publicUrl ? new URL(config.publicUrl).host : String(req.get('host') || ''));

/** Is this Origin header our own site? PUBLIC_URL's origin, or the host the request came in on. */
export function isOwnOrigin(req, origin) {
  let u; try { u = new URL(origin); } catch { return false; }
  if (config.publicUrl && u.origin === config.publicUrl) return true;
  return u.host === req.headers.host;
}
