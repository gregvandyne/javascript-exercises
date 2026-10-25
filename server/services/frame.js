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
// origin: the site's own origin (e.g. https://oomba.example), so 3D games can load the self-hosted Three.js as module
// scripts. It is named with its path rather than 'self': 'self' does match in an opaque-origin frame in Chromium, but it
// would also allow every other script on the site, and its meaning there is less certain in other browsers.
export function frameCsp(origin = '') {
  const vendor = /^https?:\/\/(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?$/i.test(origin) ? ` ${origin.toLowerCase()}${VENDOR_PATH}` : '';
  return `sandbox ${SANDBOX}; default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com${vendor}; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob:; media-src data: blob:; connect-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'`;
}
export const FRAME_CSP = frameCsp();
const ORIGIN_RE = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?$/i;
/** The site's origin as the browser sees it. Behind a CDN/gateway that rewrites Host (CloudFront, Front Door,
 *  Application Gateway) the request's Host is an internal name, so PUBLIC_URL (parsed to an origin by config)
 *  wins when it is set. Otherwise req.protocol and req.host (both honour trust proxy). '' if the host looks odd. */
export function requestOrigin(req) {
  const pub = (config && config.publicUrl) || '';
  if (pub && /^https?:\/\//i.test(pub)) return pub.toLowerCase().replace(/\/+$/, '');
  const host = String(req.host || '');
  return ORIGIN_RE.test(host) ? `${req.protocol === 'https' ? 'https' : 'http'}://${host.toLowerCase()}` : '';
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
/** origin: requestOrigin(req), so the CSP allows the site's /vendor/three/ files. */
export function sendFrame(res, doc, origin = '') {
  res.set({
    'Content-Security-Policy': frameCsp(origin),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
  });
  res.removeHeader('X-Frame-Options');
  res.type('html').send(doc);
}
