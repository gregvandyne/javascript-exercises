// The sign-up's screens (routes/onboarding.js; docs/decisions.md "One sign-up"): one question per screen, a back link,
// progress dots, big tap targets. Styles in public/css/signup.css; the little script is public/js/signup.js.
import { html, raw } from './html.js';
import { page, VERSION } from './layout.js';

export const SIGNUP_CSS = raw(`<link rel="stylesheet" href="/css/signup.css?v=${VERSION}">`);

/** "Step 2 of 4" with a dot per step (the dots are decoration; the words are what a screen reader hears). */
export function progress(req, at, total) {
  if (!total) return '';
  const label = req.t('onboard.step', { n: at, total });
  return html`<p class="ob-progress"><span class="ob-dots" aria-hidden="true">${Array.from({ length: total }, (_, i) => html`<span class="ob-dot${i + 1 < at ? ' done' : i + 1 === at ? ' now' : ''}"></span>`)}</span><span class="ob-count">${label}</span></p>`;
}
/** The back link at the top of a screen ('' for none). */
export const backLink = (req, href) => (href ? html`<a class="ob-back" href="${href}"><span class="flip" aria-hidden="true">‹</span> ${req.t('onboard.back')}</a>` : '');

/** One screen: back link and progress on top, an emoji, the question (h1), a line under it, then the body. */
export function screen(req, res, { title, back = '', at = 0, total = 0, emoji = '', heading, lead = '', body, status = 200, wide = false }) {
  const top = back || total ? html`<div class="ob-top">${backLink(req, back) || html`<span></span>`}${progress(req, at, total)}</div>` : '';
  const content = html`<div class="authbox ob${wide ? ' ob-wide' : ''}"><div class="panel">
    ${top}
    ${emoji ? html`<div class="ob-emoji" aria-hidden="true">${emoji}</div>` : ''}
    <h1 class="center ob-h" id="ob-h">${heading}</h1>
    ${lead ? html`<p class="center muted ob-lead">${lead}</p>` : ''}
    ${body}
  </div></div>`;
  res.set('Cache-Control', 'no-store');   // a step can show the account's username, and each answer changes the next
  page(req, res, { title: title || heading, active: 'me', body: content, head: SIGNUP_CSS, scripts: ['/js/signup.js'] }, status);
}

/** A big choice (the home page's door style): emoji, title, a line under it, the arrow. */
export const choice = ({ href, emoji, title, sub, cls = '', attrs = '' }) => html`<a class="door ob-choice${cls ? ` ${cls}` : ''}" href="${href}"${raw(attrs)}><span class="door-e" aria-hidden="true">${emoji}</span><span class="door-t"><span class="door-h">${title}</span>${sub ? html`<span class="door-s">${sub}</span>` : ''}</span><span class="door-go flip" aria-hidden="true">›</span></a>`;
