// Icons on server-rendered pages (public/js/icons.js: the one map and the one way to draw them).
import { raw } from './html.js';
import { iconHtml, toolIconHtml, hasIcon } from '../../public/js/icons.js';
export { hasIcon };
/** An icon for an emoji (or the emoji itself when there is none). See public/js/icons.js iconHtml. */
export const ico = (e, opts) => raw(iconHtml(e, opts));
export const toolIco = (slug, opts) => raw(toolIconHtml(slug, opts));
/** An emoji in running text: a pictograph with its variation selector and joined parts (not ©, ® or ™, which are text). */
export const EMOJI_RE = /(?![©®™])\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*/gu;
/**
 * Markup whose text (never a tag or its attributes) has each emoji drawn as its icon, or left out when it has none. For
 * translated sentences that name a button by its emoji ("the 🌐 button"), on pages that show no raw emoji (/parents,
 * /teachers: docs/decisions.md "Teachers and Parents pages: lead with the new tools, no 'always free'").
 */
export const textIcons = (markup, size = 18) => raw(String(markup).split(/(<[^>]*>)/).map(p => (p.startsWith('<') ? p
  : p.replace(EMOJI_RE, m => (hasIcon(m) ? iconHtml(m, { size }) : '')))).join(''));
