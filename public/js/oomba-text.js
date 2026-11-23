// Oomba's words: a small, safe Markdown (paragraphs, numbered and bulleted lists, **bold**, [links](...), [^n] citation
// numbers) to html, and the same words as clean text for Copy (docs/decisions.md "Oomba companion: how-to answers
// with links, Create class and Copy"). Everything is escaped first; a link is kept only when it is a same-site path
// ("/class/abc") or an https address, and a same-site link opens in the same tab. No DOM: tests import it in Node.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
const LINK = /\[([^\]\n]{1,120})\]\(([^)\s]{1,300})\)/g;
const LIST = /^\s*(?:([-•*])|(\d{1,2})[.)])\s+/;

/** A link target that may be shown: a same-site path, or https. -> { href, out } | null */
export function safeHref(raw) {
  const h = String(raw || '').trim();
  if (/^\/(?![/\\])[^\s"'<>`]*$/.test(h)) return { href: h, out: false };
  try { const u = new URL(h); if (u.protocol === 'https:' && !u.username && !u.password) return { href: u.href, out: true }; } catch { /* not a link */ }
  return null;
}
function inline(s) {
  // Links are cut out before escaping (their words escaped on their own), then put back as anchors.
  const links = [];
  const held = String(s).replace(LINK, (m, words, href) => {
    const h = safeHref(href);
    if (!h) return words;
    links.push(`<a href="${esc(h.href)}"${h.out ? ' target="_blank" rel="noopener noreferrer nofollow"' : ''}>${bold(esc(words))}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  return bold(esc(held)).replace(/\s?\[\^(\d{1,2})\]/g, '<sup class="oc-c">$1</sup>').replace(/\u0000(\d+)\u0000/g, (m, n) => links[Number(n)] || '');
}
const bold = s => s.replace(/\*\*([^*]{1,200})\*\*/g, '<b>$1</b>');

/** Oomba's words as html. */
export function formatText(text) {
  const out = [];
  for (const block of String(text || '').split(/\n{2,}/)) {
    let para = [], list = null;
    const endPara = () => { if (para.length) out.push(`<p class="oc-p" dir="auto">${para.map(inline).join('<br>')}</p>`); para = []; };
    const endList = () => { if (list) out.push(list.num ? `<ol class="oc-ol"${list.start > 1 ? ` start="${list.start}"` : ''}>${list.items.join('')}</ol>` : `<ul class="oc-ul">${list.items.join('')}</ul>`); list = null; };
    for (const line of block.split('\n')) {
      const m = line.match(LIST);
      if (m) {
        const num = !!m[2];
        endPara();
        if (list && list.num !== num) endList();
        if (!list) list = { num, start: num ? Number(m[2]) : 1, items: [] };
        list.items.push(`<li dir="auto">${inline(line.replace(LIST, ''))}</li>`);
      } else if (line.trim()) { endList(); para.push(line); }
    }
    endPara(); endList();
  }
  return out.join('');
}

/** The same words as plain text for Copy: links as "words (address)", steps numbered, no bold marks or citations.
 *  origin makes a same-site path a full address. */
export function copyText(text, origin = '') {
  const lines = [];
  for (const block of String(text || '').split(/\n{2,}/)) {
    let n = 0;
    for (const line of block.split('\n')) {
      if (!line.trim()) continue;
      const m = line.match(LIST);
      let s = (m ? line.replace(LIST, '') : line)
        .replace(LINK, (x, words, href) => { const h = safeHref(href); return h ? `${words} (${h.out ? h.href : `${origin}${h.href}`})` : words; })
        .replace(/\*\*([^*]{1,200})\*\*/g, '$1').replace(/\s?\[\^\d{1,2}\]/g, '').trim();
      if (m && m[2]) { n = n ? n + 1 : Number(m[2]); s = `${n}. ${s}`; } else if (m) s = `- ${s}`;
      lines.push(s);
    }
    lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Copy text to the clipboard, also on iPhone Safari and without https (a hidden text box). -> Promise<boolean> */
export async function toClipboard(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* the fallback below */ }
  const box = document.createElement('textarea');
  box.value = text; box.setAttribute('readonly', ''); box.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px';
  document.body.appendChild(box);
  const sel = document.getSelection(), was = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  box.focus(); box.select(); box.setSelectionRange(0, text.length);
  let done = false;
  try { done = document.execCommand('copy'); } catch { done = false; }
  box.remove();
  if (was && sel) { sel.removeAllRanges(); sel.addRange(was); }
  return done;
}
