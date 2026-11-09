// The weekly class summary email (services/digest.js; docs/decisions.md "Weekly class summary email"): an HTML part
// (tables, inline CSS, phone-friendly, dark-mode safe, right-to-left for Hebrew and Arabic) and a plain-text part, in
// the teacher's site language (the digest.email.* strings, all 13 languages). Counts per class and links to the site,
// nothing else: never a student's name or answer.
import { esc } from '../views/html.js';
import { tFor, fmt, localeInfo } from '../i18n/index.js';
import * as E from './email.js';
import { staffName } from './schools.js';
import { firstNameOf } from './email-templates.js';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
/** A site link with the campaign tags (utm_content says which link). */
export function link(base, path, content) {
  const u = new URL(path, base);
  u.searchParams.set('utm_source', 'oomba'); u.searchParams.set('utm_medium', 'email');
  u.searchParams.set('utm_campaign', 'class_digest'); u.searchParams.set('utm_content', content);
  return u.href;
}
/** The rows of one class (label text, value) for both parts. */
function rows(t, c) {
  return [
    ['📚', t('digest.email.due', { count: c.due })],
    ['📊', c.pct == null ? t('digest.email.noWork') : t('digest.email.pct', { pct: c.pct })],
    ['✍️', t('digest.email.toRead', { count: c.toRead })],
    ['⏳', t('digest.email.notStarted', { count: c.notStarted })],
    ['📡', t('digest.email.live', { count: c.live })],
  ];
}

/**
 * One teacher's summary. sum: digest.summaryFor() (counts only are used); slot: digest.slotFor().
 * opts: { locale, base, unsubscribeUrl, postalAddress, firstName } (defaults from the account and the settings).
 * -> { subject, preview, html, text, locale, dir }
 */
export function renderDigest(u, sum, slot, opts = {}) {
  const locale = opts.locale || u?.lang || 'en';
  const t = tFor(locale), f = fmt(locale), dir = localeInfo(t.locale).dir;
  const base = opts.base || E.siteBase();
  const unsub = opts.unsubscribeUrl ?? E.unsubscribeUrl(u?.id || '', 'digest');
  const addr = opts.postalAddress ?? E.emailStatus().postalAddress ?? '';
  const name = opts.firstName ?? firstNameOf(u, u?.id ? staffName(u) : '');
  const date = f.day(slot.day, { weekday: 'long', month: 'long', day: 'numeric' });
  const subject = t('digest.email.subject', { date });
  const preview = t('digest.email.preview', { count: sum.active.length });
  const greet = name ? t('digest.email.greeting', { name }) : t('digest.email.greetingNoName');
  const intro = t('digest.email.intro');
  const P = `margin:0 0 16px;font-size:16px;line-height:1.55;color:#1f2937;font-family:${FONT}`;
  const A = 'color:#1d4ed8;text-decoration:underline';
  const htmlClasses = [], textClasses = [];
  for (const c of sum.active) {
    const r = rows(t, c);
    const open = link(base, `/class/${c.id}`, 'class'), prog = link(base, `/class/${c.id}/progress${c.toRead ? '#to-review' : ''}`, c.toRead ? 'review' : 'progress');
    htmlClasses.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cls" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:12px">
<tr><td style="padding:16px 16px 4px"><a href="${esc(open)}" style="font-size:18px;font-weight:700;color:#111827;text-decoration:none;font-family:${FONT}" class="clsname">${esc(c.name)}</a>${c.school ? `<div style="font-size:13px;color:#6b7280;font-family:${FONT}" class="sub">${esc(c.school)}</div>` : ''}</td></tr>
${r.map(([emo, txt]) => `<tr><td style="padding:4px 16px;font-size:15px;line-height:1.5;color:#1f2937;font-family:${FONT}"><span aria-hidden="true">${emo}</span>&nbsp; ${esc(txt)}</td></tr>`).join('\n')}
<tr><td style="padding:8px 16px 16px;font-size:15px;font-family:${FONT}"><a href="${esc(open)}" style="${A}">${esc(t('digest.email.openClass'))}</a> &nbsp;·&nbsp; <a href="${esc(prog)}" style="${A}">${esc(c.toRead ? t('digest.email.review') : t('digest.email.progress'))}</a></td></tr>
</table>`);
    textClasses.push([`== ${c.name}${c.school ? ` (${c.school})` : ''} ==`, ...r.map(([, txt]) => `- ${txt}`), `${t('digest.email.openClass')}: ${open}`, `${c.toRead ? t('digest.email.review') : t('digest.email.progress')}: ${prog}`].join('\n'));
  }
  const quiet = sum.quiet.length ? t('digest.email.quiet', { count: sum.quiet.length }) : '';
  const cta = link(base, '/teach/summary', 'summary'), home = link(base, '/teach', 'classroom'), settings = link(base, '/me#digest', 'settings');
  const why = t('digest.email.why'), stop = t('digest.email.stop'), change = t('digest.email.change');
  const html = `<!doctype html>
<html lang="${esc(t.locale)}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(subject)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .bg { background:#0f172a !important; } .card { background:#111827 !important; border-color:#374151 !important; }
  .card p, .card td { color:#e5e7eb !important; } .card a { color:#93c5fd !important; } .card a.btn { color:#ffffff !important; }
  .cls { border-color:#374151 !important; } .card a.clsname { color:#f9fafb !important; } .sub { color:#9ca3af !important; }
  .foot, .foot a { color:#9ca3af !important; }
}
@media (max-width: 600px) { .card { padding:20px !important; } }
</style></head>
<body style="margin:0;padding:0;background:#f3f4f6" class="bg">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all" aria-hidden="true">${esc(preview)}${'&#847;&zwnj;&nbsp;'.repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td class="card" dir="${dir}" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:32px;text-align:${dir === 'rtl' ? 'right' : 'left'}">
<p style="${P};font-weight:700;color:#2f6bff">Oomba Academy</p>
<p style="${P};font-size:20px;font-weight:700">${esc(t('digest.email.heading', { date }))}</p>
<p style="${P}">${esc(greet)}</p>
<p style="${P}">${esc(intro)}</p>
${htmlClasses.join('\n')}
${quiet ? `<p style="${P};font-size:14px;color:#6b7280">${esc(quiet)}</p>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px"><tr><td style="border-radius:10px;background:#2f6bff">
<a class="btn" href="${esc(cta)}" style="display:inline-block;padding:14px 22px;font-size:16px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:10px;font-family:${FONT}">${esc(t('digest.email.cta'))}</a></td></tr></table>
<p style="${P};font-size:14px;margin-bottom:0"><a href="${esc(home)}" style="${A}">${esc(t('digest.email.classroom'))}</a></p>
</td></tr>
<tr><td class="foot" dir="${dir}" style="padding:16px 8px;font-size:13px;line-height:1.5;color:#6b7280;font-family:${FONT};text-align:center">
${esc(why)} · <a href="${esc(settings)}" style="color:#6b7280;text-decoration:underline">${esc(change)}</a> · <a href="${esc(unsub)}" style="color:#6b7280;text-decoration:underline">${esc(stop)}</a>${addr ? ` · ${esc(addr)}` : ''}
</td></tr></table></td></tr></table>
</body></html>`;
  const text = [t('digest.email.heading', { date }), greet, intro, ...textClasses, quiet, `${t('digest.email.cta')}: ${cta}`, `${t('digest.email.classroom')}: ${home}`,
    '--', `${why}\n${change}: ${settings}\n${stop}: ${unsub}${addr ? `\n${addr}` : ''}`].filter(Boolean).join('\n\n') + '\n';
  return { subject, preview, html, text, locale: t.locale, dir };
}
