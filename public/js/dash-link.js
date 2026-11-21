// Class Board parity: the link tile (docs/decisions.md "Class Board: PDF, link tile and stickers"). A title and an
// http(s) address the teacher typed, shown as one big tile that opens the address in a new tab
// (rel="noopener noreferrer": the new tab can't reach the board, and the site isn't told where the tap came from).
// linkUrl is the browser's copy of services/dash.js cleanLink (tests/unit/dash-board-p0.test.js checks they agree).
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/** An address as the teacher typed it -> the address to open (http or https only), or null. */
export function linkUrl(v) {
  let s = String(v ?? '').trim();
  if (!s || s.length > 500 || /[\u0000- \u007F-\u009F‪-‮⁦-⁩]/.test(s)) return null;
  // A scheme is a word and a colon not followed by a digit ("javascript:", "data:"; "example.org:8080" is a port).
  if (!/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
  let u; try { u = new URL(s); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!host || !/^[a-z0-9.-]+$|^\[[0-9a-f:.]+\]$/.test(host) || host.startsWith('.') || host.startsWith('-')) return null;
  return u.href.length > 500 ? null : u.href;
}
/** The host shown under the title ("www." dropped). */
export const linkHost = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function link(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-link');
  const url = s.url ? linkUrl(s.url) : null;
  if (!url) {
    const box = el('div', 'dw5-emptybox');
    const ic = el('span', 'dw5-bigic', '🔗'); ic.setAttribute('aria-hidden', 'true');
    box.append(ic, el('p', 'dw-empty', W.empty));
    body.appendChild(box);
    return null;
  }
  const host = linkHost(url);
  const a = el('a', 'dw-linktile');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  const title = el('span', 'dw-linktitle', s.title || host); title.dir = 'auto';
  const hostEl = el('span', 'dw-linkhost', host); hostEl.dir = 'ltr';
  const go = el('span', 'dw-linkgo', '↗'); go.setAttribute('aria-hidden', 'true');
  a.append(title, hostEl, go);
  // "Opens in a new tab" for screen readers, after the title and the site.
  a.setAttribute('aria-label', `${s.title || host}, ${host}. ${W.opens}`);
  a.title = url;
  body.appendChild(a);
  return null;
}
