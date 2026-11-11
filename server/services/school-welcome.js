// "Your school is ready": the email a new school's admin gets when the platform admin sets up their school from a
// "Set up my school" request (routes/schools.js POST /api/admin/schools/setup; docs/decisions.md "Setting up a school
// from a request"). One email, in the language of the page they sent the request from, to the address on the request:
// how to sign in (a new school account gets a link to choose its own password: no password is ever written in an email),
// the school page's checklist, how teachers start, and "reply to this email". Transactional: they asked for it, so it
// needs no unsubscribe and no postal address. Logged in email_log like every send (never the body or the link).
import { esc } from '../views/html.js';
import * as E from './email.js';

const FONT = 'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
const P = `margin:0 0 16px;font-size:16px;line-height:1.55;color:#1f2937;${FONT}`;
const H = `margin:24px 0 8px;font-size:17px;line-height:1.3;color:#141414;${FONT}`;
const LI = `margin:0 0 8px;font-size:16px;line-height:1.55;color:#1f2937;${FONT}`;
const BTN = 'display:inline-block;padding:12px 20px;border-radius:999px;background:#141414;color:#ffffff;font-weight:700;text-decoration:none';

/** The first word of a name, for "Hi Ana" (a title keeps the word after it: "Ms Rivera"). */
export function greetName(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  return /^(mr|mrs|ms|mx|miss|dr|prof)\.?$/i.test(w[0]) && w[1] ? `${w[0]} ${w[1]}` : w[0];
}

/**
 * The email. t: the translator for the request's language. { name, school, username, setUrl (a new school account's
 * "choose your password" link) | null (their own account: they sign in as usual), schoolUrl, loginUrl, days }
 * -> { subject, html, text }
 */
export function schoolWelcomeEmail(t, { name, school, username, setUrl = null, schoolUrl, loginUrl, days = 7 }) {
  const k = key => `schoolWelcome.email.${key}`;
  const first = greetName(name);
  const v = { name: first, school, username, days };
  const hi = first ? t(k('hi'), v) : t(k('hiNoName'), v);
  const intro = t(k('intro'), v);
  const signIn = setUrl ? [t(k('newAccount'), v), t(k('setExpires'), v)] : [t(k('ownAccount'), v)];
  const steps = ['step1', 'step2', 'step3', 'step4'].map(s => t(k(s), v));
  const teach = [t(k('teachersText'), v), t(k('google'), v)];
  const help = t(k('help'), v), bye = t(k('bye'), v);
  const button = setUrl ? t(k('setButton'), v) : t(k('signInButton'), v);
  const buttonUrl = setUrl || loginUrl;
  const dir = t.dir || 'ltr', lang = t.locale || 'en';
  const html = `<!doctype html><html lang="${esc(lang)}" dir="${dir}"><body style="margin:0;padding:24px;background:#ffffff">
<p style="${P}">${esc(hi)}</p>
<p style="${P}">${esc(intro)}</p>
<h2 style="${H}">${esc(t(k('signInH'), v))}</h2>
<p style="${P}">${esc(signIn[0])}</p>
<p style="${P}"><span style="color:#4b5563">${esc(t(k('usernameLabel'), v))}</span> <b dir="ltr">${esc(username)}</b></p>
<p style="${P};color:#4b5563">${esc(t(k('changeLater'), v))}</p>
<p style="${P}"><a href="${esc(buttonUrl)}" style="${BTN}">${esc(button)}</a></p>
${signIn[1] ? `<p style="${P};color:#4b5563">${esc(signIn[1])}</p>` : ''}
<h2 style="${H}">${esc(t(k('firstH'), v))}</h2>
<p style="${P}">${esc(t(k('firstText'), v))} <a href="${esc(schoolUrl)}" dir="ltr">${esc(schoolUrl.replace(/^https?:\/\//, ''))}</a></p>
<ol style="margin:0 0 16px;padding-inline-start:22px">${steps.map(s => `<li style="${LI}">${esc(s)}</li>`).join('')}</ol>
<h2 style="${H}">${esc(t(k('teachersH'), v))}</h2>
${teach.map(s => `<p style="${P}">${esc(s)}</p>`).join('\n')}
<p style="${P}">${esc(help)}</p>
<p style="${P}">${esc(bye)}<br>${esc(t(k('signature'), v))}</p>
</body></html>`;
  const text = [hi, '', intro, '', `## ${t(k('signInH'), v)}`, signIn[0], `${t(k('usernameLabel'), v)} ${username}`, t(k('changeLater'), v), `${button}: ${buttonUrl}`,
    ...(signIn[1] ? [signIn[1]] : []), '', `## ${t(k('firstH'), v)}`, `${t(k('firstText'), v)} ${schoolUrl}`,
    ...steps.map((s, i) => `${i + 1}. ${s}`), '', `## ${t(k('teachersH'), v)}`, ...teach, '', help, '', bye, t(k('signature'), v), ''].join('\n');
  return { subject: t(k('subject'), v), html, text };
}

/** Sends it to the school admin's account at the request's address (kept for the account, so a lost password can be
 *  reset by email later). -> email.send's { status, reason? } */
export async function sendSchoolWelcome(t, { user, email, ...vars }) {
  E.rememberAddress(user.id, email, 'school-request');
  const m = schoolWelcomeEmail(t, { username: user.username, ...vars });
  return E.send({ userId: user.id, template: 'school_welcome', category: 'transactional', subject: m.subject, html: m.html, text: m.text, idemKey: `schoolwelcome-${user.id}-${Date.now().toString(36)}` });
}
