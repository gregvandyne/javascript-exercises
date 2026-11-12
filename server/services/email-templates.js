// Email rendering (docs/decisions.md "Trial emails"): one simple layout for every email, an HTML part (tables, inline
// CSS, mobile-friendly, dark-mode safe, accessible) and a plain-text part from the same blocks. The words live in
// server/emails/trial-<locale>.js; a locale without a file falls back to English.
import { esc } from '../views/html.js';
import * as F from './email-frame.js';
import en from '../emails/trial-en.js';

/** Copy per site locale. Only English for now: translations of the approved copy wait for the owner. */
const COPY = { en };
/** The trial sequence, in order. 'thanks' replaces what is left once the trial converts. */
export const TRIAL_STEPS = ['welcome', 'class', 'ideas', 'ending', 'ended', 'thanks'];
/** A site locale -> the copy to use (its own, its base language's, or English). */
export function copyFor(locale) {
  const l = String(locale || '');
  return COPY[l] || COPY[l.split('-')[0]] || COPY.en;
}
/** The campaign tags on every link of an email (utm_content says which email and which link). */
export function withUtm(base, path, step) {
  const u = new URL(path, base);
  u.searchParams.set('utm_source', 'oomba');
  u.searchParams.set('utm_medium', 'email');
  u.searchParams.set('utm_campaign', 'teacher_trial');
  u.searchParams.set('utm_content', step);
  return u.href;
}
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// HTML of one line of copy: escaped, **bold**, email addresses as mailto links.
const inline = s => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(EMAIL_IN_TEXT, m => `<a href="mailto:${m}" style="color:${F.COLORS.link};font-weight:600;text-decoration:underline">${m}</a>`);
const plain = s => String(s).replace(/\*\*(.+?)\*\*/g, '$1');
const TITLE = /^(mr|mrs|ms|miss|mx|dr|prof|sr|sra|mme|mlle|herr|frau)\.?$/i;
/** The name to greet: the first word of the name (a teacher's school roster name, else the display name), or the
 *  whole name when it starts with a title ("Ms Owl"). '' when it doesn't look like a name (then "Hi there,"). */
export function firstNameOf(u, rosterName = '') {
  const words = String(rosterName || u?.display_name || '').trim().split(/\s+/).filter(Boolean);
  const ok = w => /^[\p{L}][\p{L}'’.-]{0,39}$/u.test(w);
  if (words.length > 1 && TITLE.test(words[0]) && words.slice(1, 3).every(ok)) return words.slice(0, 3).join(' ');
  return words[0] && ok(words[0]) && !TITLE.test(words[0]) && !/\./.test(words[0]) ? words[0] : '';
}
/** A date in words in the copy's language, e.g. "Monday, November 23". In US Eastern time (most teachers are in the
 *  US, and the earliest US date is the safe one to promise). */
export const TRIAL_TZ = 'America/New_York';
export const dateWords = (t, dateLocale = 'en-US') => new Date(t).toLocaleDateString(dateLocale, { weekday: 'long', month: 'long', day: 'numeric', timeZone: TRIAL_TZ });

/**
 * One email of the trial sequence.
 * vars: { firstName, trialStart, trialEnd (ms), base (the site's origin), unsubscribeUrl, postalAddress, locale }
 * -> { subject, preview, html, text, locale }
 */
export function renderTrial(step, vars = {}) {
  const c = copyFor(vars.locale);
  const s = c.steps[step];
  if (!s) throw new Error(`no trial email called ${step}`);
  const base = vars.base || 'https://oomba.ai';
  const days = vars.trialStart && vars.trialEnd ? Math.round((vars.trialEnd - vars.trialStart) / 864e5) : 0;
  const v = { firstName: vars.firstName || '', trialEndDate: vars.trialEnd ? dateWords(vars.trialEnd, c.dateLocale) : '', trialDays: days > 0 ? days : 14 };
  const greet = v.firstName ? fill(c.greeting, v) : c.greetingNoName;
  const sign = s.sign === 'full' ? c.signFull : c.signShort;
  const htmlBlocks = [], textBlocks = [];
  for (const b of s.blocks) {
    if (b.p || b.tour) {
      const t = fill(b.p || b.tour, v);
      htmlBlocks.push(F.p(inline(t)));
      textBlocks.push(plain(t));
    } else if (b.ol || b.ul) {
      const items = (b.ol || b.ul).map(x => fill(x, v));
      const tag = b.ol ? 'ol' : 'ul';
      htmlBlocks.push(F.list(items.map(inline), { ordered: tag === 'ol' }));
      textBlocks.push(items.map((x, i) => `${b.ol ? `${i + 1}.` : '•'} ${plain(x)}`).join('\n'));
    } else if (b.cta) {
      const href = withUtm(base, b.cta.path, step);
      htmlBlocks.push(F.button(href, b.cta.label));
      textBlocks.push(`${b.cta.label.replace(/\s*→$/, '')}: ${href}`);
    }
  }
  const why = c.footerWhy;
  const addr = vars.postalAddress || '';
  const unsub = vars.unsubscribeUrl || '';
  const preview = s.preview;
  const html = F.frame({ lang: c.locale, subject: s.subject, preview, base,
    body: `${F.p(esc(greet))}\n${htmlBlocks.join('\n')}\n${F.signoff(sign)}`,
    foot: `${esc(why)} · ${F.footLink(unsub, c.unsubscribe)}${addr ? `<br>${esc(addr)}` : ''}` });
  const text = [greet, ...textBlocks, sign.join('\n'), '--', `${why} · ${c.unsubscribe}: ${unsub}${addr ? ` · ${addr}` : ''}`].join('\n\n') + '\n';
  return { subject: s.subject, preview, html, text, locale: c.locale };
}
