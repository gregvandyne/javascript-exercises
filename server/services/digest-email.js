// The weekly class summary email (services/digest.js; docs/decisions.md "Weekly class summary email"): an HTML part
// (tables, inline CSS, phone-friendly, dark-mode safe, right-to-left for Hebrew and Arabic) and a plain-text part, in
// the teacher's site language (the digest.email.* strings, all 13 languages). Counts per class and links to the site,
// nothing else: never a student's name or answer.
import { esc } from '../views/html.js';
import * as F from './email-frame.js';
import { tFor, fmt, localeInfo } from '../i18n/index.js';
import * as E from './email.js';
import { staffName } from './schools.js';
import { firstNameOf } from './email-templates.js';

const { FONT, COLORS: K } = F;
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
  const htmlClasses = [], textClasses = [];
  for (const c of sum.active) {
    const r = rows(t, c);
    const open = link(base, `/class/${c.id}`, 'class'), prog = link(base, `/class/${c.id}/progress${c.toRead ? '#to-review' : ''}`, c.toRead ? 'review' : 'progress');
    htmlClasses.push(F.box(`<a href="${esc(open)}" class="clsname" style="display:block;font-family:${FONT};font-size:18px;line-height:1.3;font-weight:800;color:${K.ink};text-decoration:none">${esc(c.name)}</a>`
      + (c.school ? `<div class="muted" style="margin:2px 0 0;font-family:${FONT};font-size:13px;color:${K.muted}">${esc(c.school)}</div>` : '')
      + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 10px">${r.map(([emo, txt]) => `<tr><td style="padding:3px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${K.text}"><span aria-hidden="true">${emo}</span>&nbsp; ${esc(txt)}</td></tr>`).join('')}</table>`
      + `<div style="font-family:${FONT};font-size:15px">${F.link(open, t('digest.email.openClass'))} &nbsp;·&nbsp; ${F.link(prog, c.toRead ? t('digest.email.review') : t('digest.email.progress'))}</div>`, { cls: 'box cls' }));
    textClasses.push([`== ${c.name}${c.school ? ` (${c.school})` : ''} ==`, ...r.map(([, txt]) => `- ${txt}`), `${t('digest.email.openClass')}: ${open}`, `${c.toRead ? t('digest.email.review') : t('digest.email.progress')}: ${prog}`].join('\n'));
  }
  const quiet = sum.quiet.length ? t('digest.email.quiet', { count: sum.quiet.length }) : '';
  const cta = link(base, '/teach/summary', 'summary'), home = link(base, '/teach', 'classroom'), settings = link(base, '/me#digest', 'settings');
  const why = t('digest.email.why'), stop = t('digest.email.stop'), change = t('digest.email.change');
  const html = F.frame({ lang: t.locale, dir, subject, preview, base,
    body: [F.title(t('digest.email.heading', { date })), F.p(esc(greet)), F.p(esc(intro)), htmlClasses.join('\n'),
      quiet ? F.p(esc(quiet), { muted: true, small: true }) : '', F.button(cta, t('digest.email.cta')),
      F.p(F.link(home, t('digest.email.classroom')), { small: true, last: true })].filter(Boolean).join('\n'),
    foot: `${esc(why)}<br>${F.footLink(settings, change)} · ${F.footLink(unsub, stop)}${addr ? `<br>${esc(addr)}` : ''}` });
  const text = [t('digest.email.heading', { date }), greet, intro, ...textClasses, quiet, `${t('digest.email.cta')}: ${cta}`, `${t('digest.email.classroom')}: ${home}`,
    '--', `${why}\n${change}: ${settings}\n${stop}: ${unsub}${addr ? `\n${addr}` : ''}`].filter(Boolean).join('\n\n') + '\n';
  return { subject, preview, html, text, locale: t.locale, dir };
}
