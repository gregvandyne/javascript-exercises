// Shared client helpers for every page. Other page modules import from here:
//   import { api, toast, sheet, pageData, $, $$ } from '/js/app.js';
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function pageData(id = 'page-data') { const el = document.getElementById(id); if (!el) return {}; try { return JSON.parse(el.textContent); } catch { return {}; } }

/** fetch JSON with same-origin credentials. Throws Error(message) with .status on failure. */
export async function api(url, { method = 'GET', body, signal } = {}) {
  const res = await fetch(url, { method, signal, credentials: 'same-origin', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) { const e = new Error((data && data.error) || 'Something went wrong. Please try again.'); e.status = res.status; e.data = data; throw e; }
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
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><button class="iconbtn close" type="button" aria-label="Close"><span class="emo">✖️</span></button><h2 id="sheet-title">${esc(title)}</h2><div class="sheet-body">${content}</div></div>`;
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
  track.scrollBy({ left: +b.dataset.dir * track.clientWidth * 0.85, behavior: 'smooth' });
});

// ---- Live player counts: refresh every 30 s without reloads ----
const fmt = n => (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n));
export async function refreshLive() {
  const els = $$('[data-live]'); if (!els.length) return;
  const ids = [...new Set(els.map(e => e.dataset.live))].slice(0, 100);
  try {
    const { counts } = await api('/api/live?ids=' + encodeURIComponent(ids.join(',')));
    for (const el of els) {
      const n = counts[el.dataset.live] || 0; const f = el.dataset.liveFormat || 'pill';
      if (f === 'pill') { el.textContent = `${fmt(n)} playing`; el.hidden = !n; }
      else if (f === 'number') el.textContent = fmt(n);
      else if (f === 'bar') el.textContent = n ? `🟢 ${fmt(n)} playing` : '';
    }
  } catch { /* offline: try again later */ }
}
if (document.querySelector('[data-live]')) setInterval(() => { if (!document.hidden) refreshLive(); }, 30000);

// ---- Forms with data-api: submit as JSON, show inline errors, then redirect/reload ----
document.addEventListener('submit', async e => {
  const f = e.target.closest('form[data-api]'); if (!f) return;
  e.preventDefault();
  const btn = f.querySelector('[type=submit]'); if (btn) btn.disabled = true;
  $$('.err', f).forEach(x => (x.textContent = '')); $$('[aria-invalid]', f).forEach(x => x.removeAttribute('aria-invalid'));
  const body = Object.fromEntries(new FormData(f).entries());
  try {
    const r = await api(f.dataset.api, { method: f.dataset.method || 'POST', body });
    if (f.dataset.toast) toast(f.dataset.toast);
    const next = (r && r.redirect) || f.dataset.next;
    if (next) location.href = next; else if (f.dataset.reload !== undefined) location.reload();
  } catch (err) {
    const field = err.data && err.data.field; const target = field && f.querySelector(`[name="${field}"]`);
    if (target) { target.setAttribute('aria-invalid', 'true'); const er = f.querySelector(`#${target.id}-err`); if (er) er.textContent = err.message; else toast(err.message, { bad: true }); target.focus(); }
    else { const er = f.querySelector('.form-err'); if (er) er.textContent = err.message; else toast(err.message, { bad: true }); }
  } finally { if (btn) btn.disabled = false; }
});

// ---- "Play as guest" buttons anywhere ----
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-guest-play]'); if (!b) return;
  e.preventDefault(); b.disabled = true;
  try { await api('/api/auth/guest', { method: 'POST', body: {} }); location.href = b.dataset.guestPlay || location.href; }
  catch (err) { toast(err.message, { bad: true }); b.disabled = false; }
});
