// Icons on server-rendered pages (public/js/icons.js: the one map and the one way to draw them).
import { raw } from './html.js';
import { iconHtml, toolIconHtml, hasIcon } from '../../public/js/icons.js';
export { hasIcon };
/** An icon for an emoji (or the emoji itself when there is none). See public/js/icons.js iconHtml. */
export const ico = (e, opts) => raw(iconHtml(e, opts));
export const toolIco = (slug, opts) => raw(toolIconHtml(slug, opts));
