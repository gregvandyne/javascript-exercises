// One branded layout for every email Oomba sends (the trial emails, the weekly class summary, password reset and
// "password changed", "your school is ready", admin alerts). The app's own colours (cream card on a warm paper
// background, charcoal ink, mint button with a leaf edge like the site's tactile buttons), the app icon and wordmark at
// the top, generous spacing, and a quiet footer. Tables and inline CSS so it holds up in Gmail, Outlook and Apple Mail;
// a dark scheme in the app's dark colours for clients that honour prefers-color-scheme; right to left for Hebrew and
// Arabic. Helpers (p, h, list, button, link) give every email the same type sizes and rhythm.
import { esc } from '../views/html.js';

export const COLORS = Object.freeze({
  page: '#F4F1E6', card: '#FFFDF2', line: '#E2DDCB', ink: '#141414', text: '#2A2925', muted: '#5B584F',
  mint: '#66C792', leaf: '#1F9D63', link: '#14744A', soft: '#F9F6EB',
});
const C = COLORS;
export const FONT = "'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BODY = `font-family:${FONT};font-size:16px;line-height:1.6;color:${C.text}`;

/** A paragraph. opts: { muted, small, bold, last } (last: no space under it). `inner` is HTML (escape it first). */
export function p(inner, { muted = false, small = false, bold = false, last = false } = {}) {
  return `<p${muted ? ' class="muted"' : ''} style="margin:0 0 ${last ? 0 : 18}px;${BODY};${small ? 'font-size:14px;line-height:1.55;' : ''}${muted ? `color:${C.muted};` : ''}${bold ? 'font-weight:700;' : ''}">${inner}</p>`;
}
/** A section heading. */
export const h = text => `<h2 style="margin:30px 0 10px;font-family:${FONT};font-size:18px;line-height:1.3;font-weight:800;color:${C.ink}">${esc(text)}</h2>`;
/** The big title under the logo (optional). */
export const title = text => `<h1 style="margin:0 0 18px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-.01em;color:${C.ink}">${esc(text)}</h1>`;
/** A list. items: HTML strings. */
export function list(items, { ordered = false } = {}) {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag} style="margin:0 0 20px;padding-inline-start:24px;${BODY}">${items.map(x => `<li style="margin:0 0 10px;padding-inline-start:4px">${x}</li>`).join('')}</${tag}>`;
}
/** A link in the text. */
export const link = (href, text) => `<a href="${esc(href)}" style="color:${C.link};font-weight:600;text-decoration:underline">${esc(text)}</a>`;
/** The main button: mint with a darker leaf edge, charcoal text, pill shaped (the site's primary button). */
export function button(href, label, { last = false } = {}) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 ${last ? 0 : 26}px"><tr><td class="btn-td" style="border-radius:999px;background:${C.mint};border-bottom:3px solid ${C.leaf}">`
    + `<a class="btn" href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:800;line-height:1.2;color:${C.ink};text-decoration:none;border-radius:999px">${esc(label)}</a></td></tr></table>`;
}
/** A soft box (a username, a class's numbers). inner: HTML. */
export const box = (inner, { cls = 'box' } = {}) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="${cls}" style="margin:0 0 18px;background:${C.soft};border:1px solid ${C.line};border-radius:16px"><tr><td style="padding:16px 18px">${inner}</td></tr></table>`;
/** A thin rule between parts. */
export const rule = () => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td class="rule" style="border-top:1px solid ${C.line};font-size:0;line-height:0">&nbsp;</td></tr></table>`;
/** The sign-off: lines (escaped here). */
export const signoff = lines => `<p style="margin:26px 0 0;${BODY}">${lines.map(esc).join('<br>')}</p>`;

/**
 * The whole email around a body.
 * { lang, dir, subject, preview, body (HTML), foot (HTML, small and muted under the card), base (the site's origin, for
 *   the logo image), tag (a short line next to the wordmark, e.g. "Admin alerts") }
 */
export function frame({ lang = 'en', dir = 'ltr', subject = '', preview = '', body = '', foot = '', base = 'https://oomba.ai', tag = '' }) {
  const align = dir === 'rtl' ? 'right' : 'left';
  const logo = `${String(base).replace(/\/$/, '')}/icons/icon-192.png`;
  return `<!doctype html>
<html lang="${esc(lang)}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(subject)}</title>
<style>
body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
@media (max-width: 600px) { .card { padding:28px 22px !important; } .outer { padding:16px 10px 8px !important; } }
@media (prefers-color-scheme: dark) {
  .bg { background:#141414 !important; } .card { background:#1E1E1B !important; border-color:#36352F !important; }
  .card p, .card li, .card td, .card ol, .card ul { color:#E3DED0 !important; } .card h1, .card h2, .card b, .card strong, .word { color:#FFFDF2 !important; }
  .card a { color:#66C792 !important; } .card a.btn { color:#141414 !important; } .muted, .card p.muted { color:#B8B3A1 !important; }
  .box { background:#262622 !important; border-color:#36352F !important; } .rule { border-color:#36352F !important; }
  .foot, .foot a { color:#B8B3A1 !important; } .tag { color:#66C792 !important; }
}
</style></head>
<body class="bg" style="margin:0;padding:0;background:${C.page}">
${preview ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all" aria-hidden="true">${esc(preview)}${'&#847;&zwnj;&nbsp;'.repeat(30)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:${C.page}"><tr><td align="center" class="outer" style="padding:32px 16px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px">
<tr><td dir="${dir}" style="padding:0 6px 18px;text-align:${align}">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="vertical-align:middle;padding-inline-end:10px"><img src="${esc(logo)}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border-radius:10px;border:0"></td>
    <td style="vertical-align:middle;font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-.01em;color:${C.ink}" class="word">Oomba Academy${tag ? `<span class="tag" style="font-size:14px;font-weight:700;color:${C.leaf};letter-spacing:0"> &nbsp;·&nbsp; ${esc(tag)}</span>` : ''}</td>
  </tr></table>
</td></tr>
<tr><td class="card" dir="${dir}" style="background:${C.card};border:1px solid ${C.line};border-radius:24px;padding:36px 36px 34px;text-align:${align}">
${body}
</td></tr>
${foot ? `<tr><td class="foot" dir="${dir}" style="padding:20px 18px 28px;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${C.muted};text-align:center">${foot}</td></tr>` : '<tr><td style="padding:0 0 20px"></td></tr>'}
</table></td></tr></table>
</body></html>`;
}
/** A footer link (muted, underlined). */
export const footLink = (href, text) => `<a href="${esc(href)}" style="color:${C.muted};text-decoration:underline">${esc(text)}</a>`;
