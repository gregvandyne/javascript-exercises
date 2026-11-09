// Google Classroom sync: the one place that talks to Google (OAuth token, refresh and revoke, and the Classroom API).
// Everything else (accounts, grades, the database) lives in services/gclassroom.js. The API's address comes from
// config.classroomApiBase (CLASSROOM_API_BASE, default https://classroom.googleapis.com), and the OAuth endpoints from
// oidc.js endpoints() (GOOGLE_OIDC_BASE in tests), so unit and e2e tests use tests/support/fake-classroom.js and
// tests/support/fake-google.js and never reach Google. No npm dependency. See docs/google-classroom.md.
import { config } from '../config.js';
import { endpoints } from '../oidc.js';

/** The Classroom scopes we ask for (incremental authorization, on top of Sign in with Google's openid email profile).
 *  courses.readonly: list the teacher's courses. rosters.readonly: the students of a course. coursework.students: create
 *  coursework in courses they teach and grade it. Nothing else (no emails, no guardians, no Drive). */
export const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students',
];

/** A failed call. code: 'reconnect' (the token was revoked or expired for good), 'denied' (Google said no: not this
 *  teacher's course, or coursework another app made), 'notFound', 'rateLimited', 'badRequest', 'googleDown'. */
export class GcError extends Error {
  constructor(code, reason = code, status = 0) { super(reason); this.code = code; this.reason = String(reason).slice(0, 120); this.status = status; }
}

const revokeUrl = () => (config.googleOidcBase ? `${config.googleOidcBase}/revoke` : 'https://oauth2.googleapis.com/revoke');

async function readCapped(r, cap) {
  const reader = r.body?.getReader(); if (!reader) return '';
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > cap) { reader.cancel().catch(() => {}); throw new GcError('googleDown', 'response too large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function call(url, init, cap = 2 * 1024 * 1024) {
  let r;
  try { r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000), ...init }); }
  catch (e) { throw new GcError('googleDown', e.name === 'TimeoutError' ? 'timeout' : 'fetch failed'); }
  const text = await readCapped(r, cap);
  let j = {}; if (text) { try { j = JSON.parse(text); } catch { if (r.ok) throw new GcError('googleDown', 'not json', r.status); } }
  return { r, j };
}
const tokenPost = params => call(endpoints().token, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
  body: new URLSearchParams({ client_id: config.googleClientId, client_secret: config.googleClientSecret, ...params }),
}, 64 * 1024);
const oauthFail = (r, j) => {
  const e = typeof j.error === 'string' ? j.error.slice(0, 40) : '';
  if (e === 'invalid_grant') return new GcError('reconnect', 'invalid_grant', r.status);
  return new GcError('googleDown', `token ${r.status} ${e}`.trim(), r.status);
};

/** The OAuth code from the consent screen -> { refreshToken, accessToken, expiresIn, scopes: [..], idToken }. */
export async function exchangeCode({ code, redirect, verifier }) {
  const { r, j } = await tokenPost({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier });
  if (!r.ok) throw oauthFail(r, j);
  if (typeof j.access_token !== 'string') throw new GcError('googleDown', 'no access_token');
  return { refreshToken: typeof j.refresh_token === 'string' ? j.refresh_token : '', accessToken: j.access_token, expiresIn: +j.expires_in || 3600,
    scopes: String(j.scope || '').split(/\s+/).filter(Boolean), idToken: typeof j.id_token === 'string' ? j.id_token : '' };
}
/** A new access token from the stored refresh token -> { accessToken, expiresIn, scopes }. */
export async function refresh(refreshToken) {
  const { r, j } = await tokenPost({ grant_type: 'refresh_token', refresh_token: refreshToken });
  if (!r.ok) throw oauthFail(r, j);
  if (typeof j.access_token !== 'string') throw new GcError('googleDown', 'no access_token');
  return { accessToken: j.access_token, expiresIn: +j.expires_in || 3600, scopes: String(j.scope || '').split(/\s+/).filter(Boolean) };
}
/** Revoke a token at Google (Disconnect). A token Google no longer knows counts as revoked. -> true */
export async function revoke(token) {
  const { r, j } = await call(revokeUrl(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }, 16 * 1024);
  if (r.ok || (r.status === 400 && j.error === 'invalid_token')) return true;
  throw new GcError('googleDown', `revoke ${r.status}`, r.status);
}

/** One Classroom API call with an access token. query: object; body: JSON. -> the parsed reply. */
export async function api(accessToken, method, path, { query, body } = {}) {
  const u = new URL(config.classroomApiBase + path);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  const { r, j } = await call(u.href, {
    method, headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (r.ok) return j;
  const status = j?.error?.status || '';
  const why = `${r.status} ${status}`.trim();
  if (r.status === 401) throw new GcError('auth', why, 401);
  if (r.status === 403) throw new GcError(/RATE_LIMIT|QUOTA/i.test(JSON.stringify(j?.error?.details || '')) || status === 'RESOURCE_EXHAUSTED' ? 'rateLimited' : 'denied', why, 403);
  if (r.status === 404) throw new GcError('notFound', why, 404);
  if (r.status === 429) throw new GcError('rateLimited', why, 429);
  if (r.status === 400 || r.status === 409) throw new GcError('badRequest', why, r.status);
  throw new GcError('googleDown', why, r.status);
}
/** Every page of a list call (at most `maxPages` of `pageSize`). -> the concatenated `key` arrays. */
export async function listAll(accessToken, path, key, query = {}, { pageSize = 100, maxPages = 20 } = {}) {
  const out = []; let pageToken = '';
  for (let i = 0; i < maxPages; i++) {
    const j = await api(accessToken, 'GET', path, { query: { ...query, pageSize, pageToken } });
    if (Array.isArray(j[key])) out.push(...j[key]);
    pageToken = typeof j.nextPageToken === 'string' ? j.nextPageToken : '';
    if (!pageToken) return out;
  }
  throw new GcError('badRequest', 'too many pages');
}
