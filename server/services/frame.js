// Builds the HTML served inside the sandboxed game iframe and the strict CSP for it.
// The SDK is inlined (the frame has an opaque origin, and the CSP allows only inline scripts, cdnjs and the site's own
// self-hosted 3D library under /vendor/three/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeGameHtml } from './sanitize.js';
import { deviceNeeds, VENDOR_PATH } from './vendor.js';
import { config } from '../config.js';

const SDK_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/sdk/brb-sdk.js');
let SDK = fs.readFileSync(SDK_PATH, 'utf8');
export const reloadSdk = () => { SDK = fs.readFileSync(SDK_PATH, 'utf8'); };

export const SANDBOX = 'allow-scripts allow-pointer-lock allow-orientation-lock';
// The `sandbox` directive means a /frame document is opaque-origin with these same limits even if loaded top-level
// (not just inside the iframe), so a leaked frame URL can never run at the site origin. No allow-same-origin, ever.
// origins: the site's own origin(s) (e.g. https://oomba.example; a string or a list), so 3D games can load the
// self-hosted Three.js as module scripts. Named with the path rather than 'self': 'self' does match in an opaque-origin
// frame in Chromium, but it would also allow every other script on the site, and its meaning there is less certain in
// other browsers. Anything that is not a plain origin is left out.
const ORIGIN_URL_RE = /^https?:\/\/(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?$/i;
export function frameCsp(origins = '') {
  const vendor = [...new Set([].concat(origins || []).filter(o => typeof o === 'string' && ORIGIN_URL_RE.test(o)).map(o => o.toLowerCase()))]
    .map(o => ` ${o}${VENDOR_PATH}`).join('');
  return `sandbox ${SANDBOX}; default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com${vendor}; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob:; media-src data: blob:; connect-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'`;
}
export const FRAME_CSP = frameCsp();
const ORIGIN_RE = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?$/i;
/** The origin the request came in on: req.protocol and req.host (both honour trust proxy). '' if the host looks odd. */
function hostOrigin(req) {
  const host = String(req.host || '');
  return ORIGIN_RE.test(host) ? `${req.protocol === 'https' ? 'https' : 'http'}://${host.toLowerCase()}` : '';
}
/** The site's origin as the browser sees it: PUBLIC_URL (already an origin, see config.js) when it is set, because
 *  behind a CDN/gateway that rewrites Host (CloudFront, Front Door, Application Gateway) the request's Host is an
 *  internal name; otherwise the origin the request came in on. */
export function requestOrigin(req) {
  return config.publicUrl || hostOrigin(req);
}
/** The origins the frame CSP allows /vendor/three/ from: PUBLIC_URL and the request's own origin. The game's import map
 *  is relative, so it loads from whatever name the browser used: the public one behind a CDN, or another name that
 *  reaches the app directly (the temporary name before moving day, www, the platform's own address). */
export function frameOrigins(req) {
  return [...new Set([requestOrigin(req), hostOrigin(req)].filter(Boolean))];
}

const RESET = 'html,body{margin:0;padding:0;-webkit-tap-highlight-color:transparent}*,*::before,*::after{box-sizing:border-box}body{min-height:100vh;font-family:system-ui,sans-serif;overscroll-behavior:none}';
const safeJson = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** init: { user:{displayName,avatar,isGuest}, game:{id,title}, save:{}, canSave:boolean, preview:boolean,
 *         deviceText?:{title,text,lostTitle,lostText,retry} }
 *  For a 3D game the SDK is told what the browser must support (init.device), with deviceText as its friendly
 *  messages (the "newer device" card and the "3D picture stopped / Try again" card). */
export function frameDocument(gameHtml, init) {
  const { html } = sanitizeGameHtml(gameHtml);
  const { deviceText, ...rest } = init || {};
  const needs = deviceNeeds(html);
  const boot = needs ? { ...rest, device: { ...needs, ...(deviceText || {}) } } : rest;
  const lang = String((rest.user && rest.user.lang) || 'en').replace(/[^A-Za-z-]/g, '').slice(0, 12) || 'en';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="referrer" content="no-referrer"><style>${RESET}</style><script>window.__BRB_INIT__=${safeJson(boot)};</script><script>${SDK}</script>\n${html}`;
}
/** origins: frameOrigins(req), so the CSP allows the site's /vendor/three/ files. */
export function sendFrame(res, doc, origins = []) {
  res.set({
    'Content-Security-Policy': frameCsp(origins),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
  });
  res.removeHeader('X-Frame-Options');
  res.type('html').send(doc);
}
/** A refusal inside the game frame (link expired, game gone, site moving): plain text that the site's own pages may
 *  show in a frame, so the player reads the message instead of the browser's "refused to connect". */
export function frameSafeHeaders(res) {
  res.set({ 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'", 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  res.removeHeader('X-Frame-Options');
  return res;
}
export const sendFrameText = (res, status, text) => frameSafeHeaders(res).status(status).type('text').send(text);
