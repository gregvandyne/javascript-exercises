// Builds the HTML served inside the sandboxed game iframe and the strict CSP for it.
// The SDK is inlined (the frame has an opaque origin, so 'self' would not work, and the CSP allows only inline scripts + cdnjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeGameHtml } from './sanitize.js';

const SDK_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/sdk/brb-sdk.js');
let SDK = fs.readFileSync(SDK_PATH, 'utf8');
export const reloadSdk = () => { SDK = fs.readFileSync(SDK_PATH, 'utf8'); };

export const FRAME_CSP = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob:; media-src data: blob:; connect-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'";
export const SANDBOX = 'allow-scripts allow-pointer-lock allow-orientation-lock';

const RESET = 'html,body{margin:0;padding:0;-webkit-tap-highlight-color:transparent}*,*::before,*::after{box-sizing:border-box}body{min-height:100vh;font-family:system-ui,sans-serif;overscroll-behavior:none}';
const safeJson = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** init: { user:{displayName,avatar,isGuest}, game:{id,title}, save:{}, canSave:boolean, preview:boolean } */
export function frameDocument(gameHtml, init) {
  const { html } = sanitizeGameHtml(gameHtml);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="referrer" content="no-referrer"><style>${RESET}</style><script>window.__BRB_INIT__=${safeJson(init)};</script><script>${SDK}</script>\n${html}`;
}
export function sendFrame(res, doc) {
  res.set({
    'Content-Security-Policy': FRAME_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
  });
  res.removeHeader('X-Frame-Options');
  res.type('html').send(doc);
}
