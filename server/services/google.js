// Sign in with Google: who may use it and which Oomba account a Google account belongs to.
// Matching is by Google's account id (sub) only; an email never links an account (docs/decisions.md).
import { q, audit } from '../db.js';
import { getUser } from '../auth.js';
import { getSchool, settingsOf } from './schools.js';

const now = () => Date.now();

// ------------------------------------------------------------------ identities
export const identityBySub = sub => q.get('SELECT * FROM google_identities WHERE sub=?', String(sub || '')) || null;
export const identityOf = userId => (userId ? q.get('SELECT * FROM google_identities WHERE user_id=?', userId) : null) || null;
export function touchIdentity(sub, { email, hd }) {
  q.run('UPDATE google_identities SET email=?, hd=?, last_used_at=? WHERE sub=?', email, hd, now(), sub);
}

// ------------------------------------------------------------------ domains
export const emailDomain = email => String(email || '').toLowerCase().split('@').pop() || '';
/** The school's Google Workspace domains (school settings; lower case, at most 10). */
export function schoolDomains(school) {
  const d = school ? settingsOf(school).googleDomains : [];
  return Array.isArray(d) ? [...new Set(d.map(x => String(x).toLowerCase()))].slice(0, 10) : [];
}
/** Both the account's Workspace (hd: managed by that school) and its email domain must be listed. */
export const inSchoolDomains = (domains, { email, hd }) =>
  domains.length > 0 && !!hd && domains.includes(hd) && domains.includes(emailDomain(email));

// ------------------------------------------------------------------ deciding a sign-in
/**
 * claims: the checked ID token ({ sub, email, hd, name }). -> { ok:true, user, via } or { ok:false, code }.
 * Codes are message keys under google.errors.
 */
export function resolveSignIn({ claims }) {
  const ident = identityBySub(claims.sub);
  if (ident) {
    const user = getUser(ident.user_id);
    if (!user || user.banned) return { ok: false, code: 'paused' };
    // A school-owned account follows its school's Google domains: clearing them is the school's off switch.
    if (user.managed_school) {
      const domains = schoolDomains(getSchool(user.managed_school));
      if (!domains.length) return { ok: false, code: 'schoolOff' };
      if (!inSchoolDomains(domains, claims)) return { ok: false, code: 'wrongDomain' };
    }
    touchIdentity(claims.sub, claims);
    return { ok: true, user, via: 'sub' };
  }
  return { ok: false, code: 'unknown' };
}

export function auditSignIn(user, via, hd) { audit(user.id, 'user.google_signin', user.id, JSON.stringify({ via, hd })); }
