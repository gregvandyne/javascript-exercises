// Sign in with Google: the routes (/auth/google/start and /callback) and the bits other pages show (the button and
// its notices). Everything answers like an unknown page while Google is off (oidc.js googleEnabled).
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import * as auth from '../auth.js';
import { allow, count, ipOf } from '../services/ratelimit.js';
import { log } from '../services/log.js';
import { googleEnabled, newFlow, redirectUri, authorizationUrl, writeFlow, readFlow, clearFlow, useState, safeEqual,
  exchangeCode, verifyIdToken, errorCode, OidcError } from '../oidc.js';
import { resolveSignIn, auditSignIn } from '../services/google.js';
import { LOGIN, homeFor, safeNext, wantedNext } from './auth.js';

export const router = Router();
const on = (req, res, next) => (googleEnabled() ? next() : next('router'));

// Message codes a page may show (?gerr=). Anything else is ignored.
export const ERROR_CODES = ['expired', 'denied', 'schoolBlocked', 'unknown', 'joinNoWay', 'schoolOnly', 'wrongDomain', 'inUse',
  'alreadyLinked', 'unverified', 'schoolOff', 'googleDown', 'browser', 'notSetUp', 'tooMany', 'paused'];
const REFUSED = new Set(['unknown', 'joinNoWay', 'wrongDomain', 'schoolOnly', 'inUse', 'unverified', 'schoolOff']);

// ------------------------------------------------------------------ start
router.get('/auth/google/start', on, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const next = safeNext(req.query.next);
  if (!allow(`g-start:${ipOf(req)}`, 120, 900e3)) return res.redirect(303, `/login?gerr=tooMany`);
  const f = newFlow(); const redirect = redirectUri(req);
  writeFlow(res, { s: f.state, n: f.nonce, v: f.verifier, r: redirect, i: 'signin', nx: next });
  res.redirect(302, authorizationUrl({ ...f, redirect }));
});

// ------------------------------------------------------------------ callback
const back = (flow, code) => {
  const nx = flow && wantedNext(flow.nx);
  return `/login?gerr=${code}${nx ? `&next=${encodeURIComponent(nx)}` : ''}`;
};
router.get('/auth/google/callback', on, async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  clearFlow(res);
  const flow = readFlow(auth.parseCookies(req));
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!flow) return res.redirect(303, req.user && !req.user.is_guest ? homeFor(req.user) : back(null, 'expired'));
  if (!state || !safeEqual(state, flow.s) || !useState(flow.s)) {
    log('warn', 'google state mismatch'); return res.redirect(303, back(flow, 'expired'));
  }
  if (req.query.error) return res.redirect(303, back(flow, errorCode(req.query.error)));
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) return res.redirect(303, back(flow, 'googleDown'));

  // The same limits as the password sign-in, so Google can't buy extra tries from one address.
  const ip = ipOf(req); const failKey = `login-ip-fail:${ip}`;
  if (count(failKey) >= LOGIN.ipFails || !allow(`login-ip:${ip}`, LOGIN.ipTries, LOGIN.window)) return res.redirect(303, back(flow, 'tooMany'));

  let claims;
  try { claims = await verifyIdToken(await exchangeCode({ code, redirect: flow.r, verifier: flow.v }), { nonce: flow.n }); }
  catch (e) {
    const c = e instanceof OidcError ? e.code : 'googleDown';
    if (c === 'googleDown') log('warn', 'google sign-in failed', { reason: e instanceof OidcError ? e.reason : 'error' });
    if (REFUSED.has(c)) allow(failKey, LOGIN.ipFails, LOGIN.window);
    return res.redirect(303, back(flow, c));
  }
  const r = resolveSignIn({ claims });
  if (!r.ok) { if (REFUSED.has(r.code)) allow(failKey, LOGIN.ipFails, LOGIN.window); return res.redirect(303, back(flow, r.code)); }

  const user = r.user;
  if (req.user) auth.endSession(req, res);
  auth.startSession(res, user.id, req.headers['user-agent']);
  const was = auth.endedUser(req); auth.clearEnded(req, res);
  const next = was === null || was === user.id ? wantedNext(flow.nx) : null;
  auditSignIn(user, r.via, claims.hd);
  res.redirect(303, next || homeFor(user));
});

// ------------------------------------------------------------------ pieces for other pages
const G_LOGO = raw(`<svg class="gbtn-g" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`);
export const googleButton = (req, href) => html`<a class="gbtn" href="${href}">${G_LOGO}<span>${req.t('google.button.signIn')}</span></a>`;

/** The error notice for ?gerr= (allowlisted codes only). */
export function googleNotice(req) {
  const c = String(req.query.gerr || '');
  if (!googleEnabled() || !ERROR_CODES.includes(c)) return '';
  const text = c === 'tooMany' ? req.t('auth.api.tooManyTries') : c === 'paused' ? req.t('auth.api.paused') : req.t(`google.errors.${c}`);
  return html`<p class="notice warn" role="alert">${text}</p>`;
}

/** The sign-in page's Google part: the button, its hint and the "or" line. '' while Google is off. */
export function loginGoogle(req, next) {
  if (!googleEnabled()) return '';
  const href = `/auth/google/start${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;
  return html`<div class="gsign">${googleButton(req, href)}<p class="center small muted gsign-hint">${req.t('google.button.hint')}</p></div>
    <div class="divider">${req.t('google.login.orName')}</div>`;
}
