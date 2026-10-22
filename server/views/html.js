// Tiny template helpers. Every value interpolated into HTML goes through esc() unless it is already-built markup.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Tagged template: html`<p>${userText}</p>` escapes values; wrap trusted markup with raw(). Arrays are joined. */
export class Raw { constructor(s) { this.s = String(s); } toString() { return this.s; } }
export const raw = s => new Raw(s);
const val = v => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : (v === null || v === undefined || v === false) ? '' : esc(v);
export function html(strings, ...vals) { let out = strings[0]; for (let i = 0; i < vals.length; i++) out += val(vals[i]) + strings[i + 1]; return new Raw(out); }
/** JSON for <script type="application/json"> blocks (safe against </script>). */
export const jsonData = (id, data) => raw(`<script type="application/json" id="${esc(id)}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
export const fmtNum = n => { n = +n || 0; return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'K' : String(n); };
export const fmtMoney = cents => '$' + ((+cents || 0) / 100).toFixed(2);
export function timeAgo(t) {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now'; const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`; const d = Math.round(h / 24); if (d < 30) return `${d} day${d > 1 ? 's' : ''} ago`;
  return new Date(t).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}
