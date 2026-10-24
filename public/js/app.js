// Shared client helpers for every page. Other page modules import from here:
//   import { api, toast, sheet, pageData, $, $$ } from '/js/app.js';
// Text for the reader's language comes from /js/i18n.js (t, fmtNum).
import { t, fmtNum, RTL } from '/js/i18n.js';
export { t };
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function pageData(id = 'page-data') { const el = document.getElementById(id); if (!el) return {}; try { return JSON.parse(el.textContent); } catch { return {}; } }

/** fetch JSON with same-origin credentials. Throws Error(message) with .status on failure. */
export async function api(url, { method = 'GET', body, signal } = {}) {
  const res = await fetch(url, { method, signal, credentials: 'same-origin', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) { const e = new Error((data && data.error) || t('js.app.wentWrong')); e.status = res.status; e.data = data; throw e; }
  return data;
}
export function toast(msg, { bad = false, ms = 2800 } = {}) {
  const box = document.getElementById('toasts'); if (!box) return;
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
/** Modal sheet. content: HTML string (escape user text yourself!). Returns { el, close }. */
export function sheet({ title, content, onClose } = {}) {
  const prev = document.activeElement;
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><button class="iconbtn close" type="button" aria-label="${esc(t('js.app.close'))}"><span class="emo">✖️</span></button><h2 id="sheet-title">${esc(title)}</h2><div class="sheet-body">${content}</div></div>`;
  document.body.appendChild(bg);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); onClose && onClose(); };
  const onKey = e => { if (e.key === 'Escape') close(); if (e.key === 'Tab') trap(e); };
  const trap = e => { const f = $$('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', bg).filter(x => !x.disabled && x.offsetParent !== null); if (!f.length) return; const first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } };
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  $('.close', bg).addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  setTimeout(() => { const f = $('.sheet-body input,.sheet-body button,.sheet-body a', bg) || $('.close', bg); f.focus(); }, 30);
  return { el: bg, close };
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ } ta.remove(); return ok;
  }
}

// ---- Rail arrows (desktop) ----
document.addEventListener('click', e => {
  const b = e.target.closest('[data-rail]'); if (!b) return;
  const track = document.getElementById(b.dataset.rail); if (!track) return;
  // In right-to-left pages "forward" scrolls toward the left.
  track.scrollBy({ left: +b.dataset.dir * (RTL ? -1 : 1) * track.clientWidth * 0.85, behavior: 'smooth' });
});

// ---- Live player counts: refresh every 30 s without reloads ----
export async function refreshLive() {
  const els = $$('[data-live]'); if (!els.length) return;
  const ids = [...new Set(els.map(e => e.dataset.live))].slice(0, 100);
  try {
    const { counts } = await api('/api/live?ids=' + encodeURIComponent(ids.join(',')));
    for (const el of els) {
      const n = counts[el.dataset.live] || 0; const f = el.dataset.liveFormat || 'pill'; el.dataset.count = String(n);
      if (f === 'pill') { el.textContent = t('js.app.playing', { n: fmtNum(n) }); el.hidden = !n; }
      else if (f === 'number') el.textContent = fmtNum(n);
      else if (f === 'bar') el.textContent = n ? `🟢 ${t('js.app.playing', { n: fmtNum(n) })}` : '';
    }
  } catch { /* offline: try again later */ }
}
if (document.querySelector('[data-live]')) setInterval(() => { if (!document.hidden) refreshLive(); }, 30000);

// ---- Forms with data-api: submit as JSON, show inline errors, then redirect/reload ----
document.addEventListener('submit', async e => {
  const f = e.target.closest('form[data-api]'); if (!f) return;
  e.preventDefault();
  if (f.dataset.confirm && !window.confirm(f.dataset.confirm)) return;
  const btn = f.querySelector('[type=submit]'); if (btn) btn.disabled = true;
  $$('.err', f).forEach(x => (x.textContent = '')); $$('[aria-invalid]', f).forEach(x => x.removeAttribute('aria-invalid'));
  // Fields that repeat (a list of checkboxes with one name) are sent as arrays.
  const body = {};
  for (const [k, v] of new FormData(f).entries()) body[k] = k in body ? [].concat(body[k], v) : v;
  try {
    const r = await api(f.dataset.api, { method: f.dataset.method || 'POST', body });
    const msg = (r && r.toast) || f.dataset.toast;
    const next = (r && r.redirect) || f.dataset.next;
    const leaving = next || f.dataset.reload !== undefined;
    // A confirmation shown just before a reload would vanish: keep it for the next page instead.
    if (msg) { if (leaving) { try { sessionStorage.setItem('brb-toast', msg); } catch { toast(msg); } } else toast(msg); }
    if (next) location.href = next; else if (f.dataset.reload !== undefined) location.reload();
  } catch (err) {
    const field = err.data && err.data.field; const target = field && f.querySelector(`[name="${field}"]`);
    if (target) { target.setAttribute('aria-invalid', 'true'); const er = f.querySelector(`#${target.id}-err`); if (er) er.textContent = err.message; else toast(err.message, { bad: true }); target.focus(); }
    else { const er = f.querySelector('.form-err'); if (er) er.textContent = err.message; else toast(err.message, { bad: true }); }
  } finally { if (btn) btn.disabled = false; }
});

// ---- 🌐 language menu: a <details> of plain links (works without JS); here we add Escape, outside-click and arrow keys ----
for (const d of $$('[data-langpick]')) {
  const links = () => $$('.lang-list a', d);
  const close = (focus = true) => { if (!d.open) return; d.open = false; if (focus) $('summary', d).focus(); };
  d.addEventListener('toggle', () => { if (d.open) { const cur = links().find(a => a.getAttribute('aria-current') === 'true') || links()[0]; if (cur) cur.focus(); } });
  d.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (!d.open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const list = links(); const i = list.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
    list[next].focus();
  });
  document.addEventListener('click', e => { if (d.open && !d.contains(e.target)) close(false); });
  d.addEventListener('focusout', e => { if (d.open && e.relatedTarget && !d.contains(e.relatedTarget)) close(false); });
}
// The Me page's language form saves as soon as a language is picked.
const langSel = document.getElementById('lang-select');
if (langSel) langSel.addEventListener('change', () => langSel.form.submit());

// ---- "Play as guest" buttons anywhere ----
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-guest-play]'); if (!b) return;
  e.preventDefault(); b.disabled = true;
  try { await api('/api/auth/guest', { method: 'POST', body: {} }); location.href = b.dataset.guestPlay || location.href; }
  catch (err) { toast(err.message, { bad: true }); b.disabled = false; }
});

// A confirmation saved by a form just before it reloaded or moved to another page.
try { const m = sessionStorage.getItem('brb-toast'); if (m) { sessionStorage.removeItem('brb-toast'); toast(m); } } catch { /* storage off */ }
