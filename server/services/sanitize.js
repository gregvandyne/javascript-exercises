// Strip things a game document must never contain before we store or serve it.
// The sandbox + CSP are the real wall; this keeps stored HTML tidy and removes obvious escape hatches.
export const MAX_GAME_BYTES = 2 * 1024 * 1024;
const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//i;

export function sanitizeGameHtml(html) {
  let h = String(html || '');
  const removed = [];
  const drop = (re, what) => { h = h.replace(re, m => { removed.push(what); return ''; }); };
  drop(/<base\b[^>]*>/gi, 'base');
  drop(/<meta\b[^>]*http-equiv[^>]*>/gi, 'meta http-equiv');
  drop(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, 'iframe'); drop(/<iframe\b[^>]*>/gi, 'iframe');
  drop(/<frame\b[^>]*>/gi, 'frame');
  drop(/<object\b[\s\S]*?<\/object\s*>/gi, 'object'); drop(/<object\b[^>]*>/gi, 'object');
  drop(/<embed\b[^>]*>/gi, 'embed');
  drop(/<portal\b[^>]*>/gi, 'portal');
  // External <link>s other than Google Fonts (stylesheets/preconnect to fonts are fine)
  h = h.replace(/<link\b[^>]*>/gi, tag => {
    const href = (tag.match(/href\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '';
    if (FONT_HOSTS.test(href)) return tag;
    removed.push('link'); return '';
  });
  // Forms may exist for layout but can never submit anywhere.
  h = h.replace(/<form\b([^>]*)>/gi, (m, attrs) => { const a = attrs.replace(/\s(action|target|method)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ''); if (a !== attrs) removed.push('form target'); return `<form${a} onsubmit="return false">`; });
  h = h.replace(/\s(formaction|formtarget)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, () => { removed.push('formaction'); return ''; });
  return { html: h, removed };
}
