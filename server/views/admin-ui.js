// Shared pieces of the admin pages (/admin and its tabs, /admin/stats, /admin/billing, /admin/messages, /admin/schools,
// /admin/voices). Admin text is English-only by design. Styles: public/css/admin.css, loaded after the page's other CSS,
// with `bodyClass: ADMIN_BODY` on page() so its rules stay on admin pages.
import { html, raw } from './html.js';
import { VERSION } from './layout.js';

export const ADMIN_BODY = 'adminpage';
/** The admin stylesheet link. Pass it last in `head`, after community.css / stats.css / schools.css. */
export const ADMIN_CSS = raw(`<link rel="stylesheet" href="/css/admin.css?v=${VERSION}">`);

/** "Jump to" chips linking to section ids: [[id, label, count?, kind?], …]. Wraps on phones; each chip is 44 px tall.
 *  Without kind a count shows only above 0. kind 'need' (something to act on): always shown, highlighted above 0, grey at
 *  0. kind 'info': always shown, grey. */
export const jumpNav = items => html`<nav class="chips ajump" aria-label="On this page"><span class="ajump-l" aria-hidden="true">Jump to</span>${items.filter(Boolean).map(([id, label, n, kind]) => {
  const quiet = kind === 'info' || (kind === 'need' && !n), show = n || (kind && n === 0);
  return html`<a class="chip" href="#${id}">${label}${show ? html`&nbsp;<span class="badge${quiet ? ' quiet' : ''}">${n}</span>` : ''}</a>`;
})}</nav>`;

/** A long explanation folded behind a one-line summary (the text itself is unchanged). */
export const note = (summary, body, cls = '') => html`<details class="anote ${cls}" data-open-wide><summary><span aria-hidden="true">ⓘ</span> ${summary}</summary><div class="small muted">${body}</div></details>`;
