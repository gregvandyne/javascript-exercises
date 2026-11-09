// Email rendering (docs/decisions.md "Trial emails"): one simple layout for every email, an HTML part (tables, inline
// CSS, mobile-friendly, dark-mode safe, accessible) and a plain-text part from the same blocks. The words live in
// server/emails/trial-<locale>.js; a locale without a file falls back to English.
import { esc } from '../views/html.js';
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
  .replace(EMAIL_IN_TEXT, m => `<a href="mailto:${m}" style="color:#1d4ed8;text-decoration:underline">${m}</a>`);
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

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const P = `margin:0 0 16px;font-size:16px;line-height:1.55;color:#1f2937;font-family:${FONT}`;

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
      htmlBlocks.push(`<p style="${P}">${inline(t)}</p>`);
      textBlocks.push(plain(t));
    } else if (b.ol || b.ul) {
      const items = (b.ol || b.ul).map(x => fill(x, v));
      const tag = b.ol ? 'ol' : 'ul';
      htmlBlocks.push(`<${tag} style="margin:0 0 16px;padding-left:24px;font-size:16px;line-height:1.55;color:#1f2937;font-family:${FONT}">${items.map(x => `<li style="margin:0 0 8px">${inline(x)}</li>`).join('')}</${tag}>`);
      textBlocks.push(items.map((x, i) => `${b.ol ? `${i + 1}.` : '•'} ${plain(x)}`).join('\n'));
    } else if (b.cta) {
      const href = withUtm(base, b.cta.path, step);
      htmlBlocks.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td style="border-radius:10px;background:#2f6bff">`
        + `<a class="btn" href="${esc(href)}" style="display:inline-block;padding:14px 22px;font-size:16px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:10px;font-family:${FONT}">${esc(b.cta.label)}</a></td></tr></table>`);
      textBlocks.push(`${b.cta.label.replace(/\s*→$/, '')}: ${href}`);
    }
  }
  const why = c.footerWhy;
  const addr = vars.postalAddress || '';
  const unsub = vars.unsubscribeUrl || '';
  const preview = s.preview;
  const html = `<!doctype html>
<html lang="${esc(c.locale)}" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(s.subject)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .bg { background:#0f172a !important; } .card { background:#111827 !important; border-color:#374151 !important; }
  .card p, .card li, .card td { color:#e5e7eb !important; } .card a { color:#93c5fd !important; } .card a.btn { color:#ffffff !important; }
  .foot, .foot a { color:#9ca3af !important; }
}
@media (max-width: 600px) { .card { padding:20px !important; } }
</style></head>
<body style="margin:0;padding:0;background:#f3f4f6" class="bg">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all" aria-hidden="true">${esc(preview)}${'&#847;&zwnj;&nbsp;'.repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td class="card" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:32px">
<p style="${P};font-weight:700;color:#2f6bff">Oomba Academy</p>
<p style="${P}">${esc(greet)}</p>
${htmlBlocks.join('\n')}
<p style="${P};margin-bottom:0">${sign.map(esc).join('<br>')}</p>
</td></tr>
<tr><td class="foot" style="padding:16px 8px;font-size:13px;line-height:1.5;color:#6b7280;font-family:${FONT};text-align:center">
${esc(why)} · <a href="${esc(unsub)}" style="color:#6b7280;text-decoration:underline">${esc(c.unsubscribe)}</a>${addr ? ` · ${esc(addr)}` : ''}
</td></tr></table></td></tr></table>
</body></html>`;
  const text = [greet, ...textBlocks, sign.join('\n'), '--', `${why} · ${c.unsubscribe}: ${unsub}${addr ? ` · ${addr}` : ''}`].join('\n\n') + '\n';
  return { subject: s.subject, preview, html, text, locale: c.locale };
}
