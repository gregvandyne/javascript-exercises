// Sign in with Google: the OpenID Connect protocol part (code flow with PKCE, state and nonce; scopes openid email
// profile only). Account decisions live in services/google.js and the routes in routes/google.js.
// See docs/decisions.md "Sign in with Google". No npm dependency: Node's crypto checks the ID token's RS256 signature.
import crypto from 'node:crypto';
import { config } from './config.js';
import { signToken, readToken } from './auth.js';
import { log } from './services/log.js';

// On only when the client id and secret are both set, and in production also PUBLIC_URL (the redirect address).
// Read per call, so tests can switch it in one process.
export const googleEnabled = () => !!(config.googleClientId && config.googleClientSecret)
  && !!(config.publicUrl || config.env !== 'production');

const GOOGLE = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  jwks: 'https://www.googleapis.com/oauth2/v3/certs',
  issuers: ['https://accounts.google.com', 'accounts.google.com'],
};
export function endpoints() {
  const b = config.googleOidcBase;
  return b ? { authorize: b + '/o/oauth2/v2/auth', token: b + '/token', jwks: b + '/oauth2/v3/certs', issuers: [b] } : GOOGLE;
}

export class OidcError extends Error {
  constructor(code, reason) { super(reason || code); this.code = code; this.reason = reason || code; }
}

const b64url = buf => Buffer.from(buf).toString('base64url');
const sha256 = v => crypto.createHash('sha256').update(v).digest();
export const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function newFlow() {
  const verifier = b64url(crypto.randomBytes(32));
  return { state: b64url(crypto.randomBytes(32)), nonce: b64url(crypto.randomBytes(32)), verifier, challenge: b64url(sha256(verifier)) };
}

export function redirectUri(req) {
  return (config.publicUrl || `${req.protocol}://${req.get('host')}`) + '/auth/google/callback';
}

export function authorizationUrl({ state, nonce, challenge, redirect }) {
  const u = new URL(endpoints().authorize);
  const p = { client_id: config.googleClientId, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile',
    state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' };
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  return u.href;
}

// The flow cookie: signed, HttpOnly, only sent to /auth/google/*, 10 minutes. One flow at a time per browser.
export const FLOW_COOKIE = 'brb_gflow';
const FLOW_TTL = 600;
const flowCookie = (value, maxAge) => `${FLOW_COOKIE}=${value}; Path=/auth/google; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.env === 'production' ? '; Secure' : ''}`;
export function writeFlow(res, data) { res.append('Set-Cookie', flowCookie(signToken({ p: 'gflow', ...data }, FLOW_TTL), FLOW_TTL)); }
export function readFlow(cookies) { const f = readToken(cookies[FLOW_COOKIE]); return f && f.p === 'gflow' ? f : null; }
export function clearFlow(res) { res.append('Set-Cookie', flowCookie('', 0)); }

// A second use of the same state (a replayed cookie + callback URL pair) is refused for the flow's lifetime.
const usedStates = new Map();
export function useState(state) {
  const now = Date.now();
  if (usedStates.size > 5000) for (const [k, exp] of usedStates) if (exp < now) usedStates.delete(k);
  if ((usedStates.get(state) || 0) > now) return false;
  usedStates.set(state, now + FLOW_TTL * 1000); return true;
}

async function readCapped(r, cap = 64 * 1024) {
  const reader = r.body?.getReader(); if (!reader) return '';
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > cap) { reader.cancel().catch(() => {}); throw new OidcError('googleDown', 'response too large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function exchangeCode({ code, redirect, verifier }) {
  let r;
  try {
    r = await fetch(endpoints().token, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect,
        client_id: config.googleClientId, client_secret: config.googleClientSecret, code_verifier: verifier }),
    });
  } catch (e) { throw new OidcError('googleDown', e.name === 'TimeoutError' ? 'token timeout' : 'token fetch failed'); }
  const text = await readCapped(r);
  let j; try { j = JSON.parse(text); } catch { throw new OidcError('googleDown', 'token not json'); }
  if (!r.ok) throw new OidcError('googleDown', `token ${r.status} ${typeof j.error === 'string' ? j.error.slice(0, 40) : ''}`.trim());
  if (typeof j.id_token !== 'string') throw new OidcError('googleDown', 'no id_token');
  return j.id_token; // the access token is dropped here: we never call Google APIs
}

// Google's signing keys, cached by Cache-Control (5 min to 24 h). An unknown key id refetches at most once a minute;
// if Google can't be reached, keys up to 24 h old still work.
const jwks = { keys: new Map(), fetchedAt: 0, maxAge: 0, lastTry: 0, inflight: null };
/** Tests: pretend the last key fetch was `ms` earlier. */
export function _ageJwks(ms) { jwks.lastTry -= ms; jwks.fetchedAt -= ms; }
export function _resetJwks() { jwks.keys = new Map(); jwks.fetchedAt = 0; jwks.maxAge = 0; jwks.lastTry = 0; jwks.inflight = null; }
function refreshJwks() {
  if (jwks.inflight) return jwks.inflight;
  jwks.lastTry = Date.now();
  jwks.inflight = (async () => {
    const r = await fetch(endpoints().jwks, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('jwks ' + r.status);
    const j = JSON.parse(await readCapped(r));
    const keys = new Map();
    for (const k of Array.isArray(j.keys) ? j.keys : []) {
      if (k?.kty !== 'RSA' || typeof k.kid !== 'string' || (k.alg && k.alg !== 'RS256') || (k.use && k.use !== 'sig')) continue;
      try {
        const key = crypto.createPublicKey({ key: { kty: 'RSA', n: k.n, e: k.e }, format: 'jwk' });
        if ((key.asymmetricKeyDetails?.modulusLength || 0) >= 2048) keys.set(k.kid, key);
      } catch { /* skip a bad key */ }
    }
    if (!keys.size) throw new Error('jwks empty');
    const m = /max-age=(\d+)/i.exec(r.headers.get('cache-control') || '');
    jwks.keys = keys; jwks.fetchedAt = Date.now();
    jwks.maxAge = Math.min(24 * 3600e3, Math.max(300e3, m ? +m[1] * 1000 : 3600e3));
  })().finally(() => { jwks.inflight = null; });
  return jwks.inflight;
}
async function jwksKey(kid) {
  const age = Date.now() - jwks.fetchedAt;
  if (age >= jwks.maxAge || (!jwks.keys.has(kid) && Date.now() - jwks.lastTry > 60e3)) {
    await refreshJwks().catch(e => log('warn', 'google keys refresh failed', { error: String(e.message).slice(0, 80) }));
  }
  const k = jwks.keys.get(kid);
  if (k && Date.now() - jwks.fetchedAt < 24 * 3600e3) return k;
  throw new OidcError('googleDown', 'unknown kid');
}

const DOMAIN_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const cut = v => (typeof v === 'string' ? v.trim().slice(0, 60) : '');

export async function verifyIdToken(idToken, { nonce, now = Date.now() }) {
  const parts = typeof idToken === 'string' && idToken.length <= 8192 ? idToken.split('.') : [];
  if (parts.length !== 3 || !parts.every(p => /^[\w-]*$/.test(p))) throw new OidcError('googleDown', 'malformed');
  const [h, p, s] = parts;
  let header, claims;
  try { header = JSON.parse(Buffer.from(h, 'base64url').toString()); } catch { throw new OidcError('googleDown', 'bad header'); }
  if (header?.alg !== 'RS256' || typeof header.kid !== 'string') throw new OidcError('googleDown', 'bad alg or kid');
  const key = await jwksKey(header.kid);
  if (!crypto.verify('RSA-SHA256', Buffer.from(h + '.' + p), key, Buffer.from(s, 'base64url'))) throw new OidcError('googleDown', 'bad signature');
  try { claims = JSON.parse(Buffer.from(p, 'base64url').toString()); } catch { throw new OidcError('googleDown', 'bad payload'); }
  const cid = config.googleClientId;
  if (!endpoints().issuers.includes(claims.iss)) throw new OidcError('googleDown', 'bad iss');
  const audOk = claims.aud === cid || (Array.isArray(claims.aud) && claims.aud.includes(cid) && claims.azp === cid);
  if (!audOk || (claims.azp !== undefined && claims.azp !== cid)) throw new OidcError('googleDown', 'bad aud');
  if (!(typeof claims.exp === 'number' && claims.exp * 1000 > now - 120e3)) throw new OidcError('googleDown', 'expired');
  if (!(typeof claims.iat === 'number' && claims.iat * 1000 <= now + 120e3 && now - claims.iat * 1000 <= 10 * 60e3)) throw new OidcError('googleDown', 'bad iat');
  if (typeof claims.nonce !== 'string' || !safeEqual(claims.nonce, nonce)) throw new OidcError('googleDown', 'bad nonce');
  if (typeof claims.sub !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(claims.sub)) throw new OidcError('googleDown', 'bad sub');
  if (typeof claims.email !== 'string' || claims.email.length > 254 || !claims.email.includes('@')) throw new OidcError('googleDown', 'bad email');
  if (!(claims.email_verified === true || claims.email_verified === 'true')) throw new OidcError('unverified', 'email not verified');
  const hd = typeof claims.hd === 'string' && DOMAIN_RE.test(claims.hd.toLowerCase()) ? claims.hd.toLowerCase() : '';
  const name = cut(claims.name) || [cut(claims.given_name), cut(claims.family_name)].filter(Boolean).join(' ').slice(0, 60);
  return { sub: claims.sub, email: claims.email.toLowerCase(), hd, name };
}

// Google `error` values become a fixed message code; nothing from the URL is ever shown.
export function errorCode(googleError) {
  const e = String(googleError || '');
  if (e === 'access_denied') return 'denied';
  if (e === 'admin_policy_enforced') return 'schoolBlocked';
  if (['org_internal', 'invalid_client', 'unauthorized_client', 'redirect_uri_mismatch'].includes(e)) {
    log('error', 'google sign-in is not set up right', { error: e }); return 'notSetUp';
  }
  if (e === 'disallowed_useragent') return 'browser';
  return 'googleDown';
}
