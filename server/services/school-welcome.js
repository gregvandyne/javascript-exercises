// "Your school is ready": the email a new school's admin gets when the platform admin sets up their school from a
// "Set up my school" request (routes/schools.js POST /api/admin/schools/setup; docs/decisions.md "Setting up a school
// from a request"). One email, in the language of the page they sent the request from, to the address on the request:
// how to sign in (a new school account gets a link to choose its own password: no password is ever written in an email),
// the school page's checklist, how teachers start, and "reply to this email". Transactional: they asked for it, so it
// needs no unsubscribe and no postal address. Logged in email_log like every send (never the body or the link).
import { esc } from '../views/html.js';
import * as F from './email-frame.js';
import * as E from './email.js';

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
  const html = F.frame({ lang, dir, subject: t(k('subject'), v), base: E.siteBase(), body: [
    F.p(esc(hi)), F.p(esc(intro)),
    F.h(t(k('signInH'), v)), F.p(esc(signIn[0])),
    F.box(`${F.p(`<span class="muted" style="color:${F.COLORS.muted}">${esc(t(k('usernameLabel'), v))}</span> <b dir="ltr">${esc(username)}</b>`, { last: true })}`),
    F.p(esc(t(k('changeLater'), v)), { muted: true, small: true }),
    F.button(buttonUrl, button),
    signIn[1] ? F.p(esc(signIn[1]), { muted: true, small: true }) : '',
    F.h(t(k('firstH'), v)), F.p(`${esc(t(k('firstText'), v))} <span dir="ltr">${F.link(schoolUrl, schoolUrl.replace(/^https?:\/\//, ''))}</span>`),
    F.list(steps.map(esc), { ordered: true }),
    F.h(t(k('teachersH'), v)), ...teach.map(x => F.p(esc(x))),
    F.p(esc(help)), F.signoff([bye, t(k('signature'), v)]),
  ].filter(Boolean).join('\n') });
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
