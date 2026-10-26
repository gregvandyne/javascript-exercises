// Shared client helpers for every page. Other page modules import from here:
//   import { api, toast, sheet, pageData, $, $$ } from '/js/app.js';
// Text for the reader's language comes from /js/i18n.js (t, fmtNum).
import { t, fmtNum, RTL } from '/js/i18n.js';
export { t };
// The page loads /js/app.js?v=… and page scripts import '/js/app.js': two copies of this module. Only the first one
// adds the page-wide listeners below, so one click or one form submit is handled once.
const FIRST = !globalThis.__brbAppStarted; globalThis.__brbAppStarted = true;
const on = (target, ...args) => { if (FIRST) target.addEventListener(...args); };
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** For a game's "Try again" (brb:retry): true only right after a tap or key press (one inside the game frame counts
 *  too), so a game can't reload itself over and over. A browser that can't tell gets one a minute. */
export function tappedJustNow() {
  const ua = navigator.userActivation;
  if (ua) return ua.isActive;
  try { const last = +sessionStorage.getItem('brb-retry-at') || 0; if (Date.now() - last < 60e3) return false; sessionStorage.setItem('brb-retry-at', String(Date.now())); return true; } catch { return false; }
}
export function pageData(id = 'page-data') { const el = document.getElementById(id); if (!el) return {}; try { return JSON.parse(el.textContent); } catch { return {}; } }

/** fetch JSON with same-origin credentials. Throws Error(message) with .status on failure, and .signedOut when the
 *  sign-in this page was opened with has ended (timed out, or signed out on another device).
 *  background: a refresh nobody asked for (live counts, polling): never keeps a sign-in awake (server/auth.js decides).
 *  active: a game page's own call made just after the player pressed or tapped something (public/js/play.js). */
export async function api(url, { method = 'GET', body, signal, background = false, active = false } = {}) {
  const headers = { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(background ? { 'X-Brb-Background': '1' } : {}), ...(active ? { 'X-Brb-Active': '1' } : {}) };
  const res = await fetch(url, { method, signal, credentials: 'same-origin', headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    // Only the first request after the end hears it from the server, so the page says it the same way every time.
    const out = res.status === 401 && !!document.body.dataset.user;
    const e = new Error(out ? t('js.app.signedOut') : (data && data.error) || t('js.app.wentWrong')); e.status = res.status; e.data = data; e.signedOut = out; throw e;
  }
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
/** The sign-in ended while on this page (timed out, or signed out on another device). What was typed in the given
 *  fields is kept for the same person on this page, then the sign-in page brings them back here. */
export function signedOut(fields = []) {
  const who = document.body.dataset.user || '';
  try { for (const el of fields) if (el && el.id && el.value.trim()) sessionStorage.setItem(`brb-draft:${who}:${location.pathname}:${el.id}`, el.value); } catch { /* storage off */ }
  location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}&signedout=1`;
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ } ta.remove(); return ok;
  }
}

// ---- [data-copy] buttons copy their text (e.g. the Google client ID on a school's settings) ----
on(document, 'click', async e => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  if (await copyText(b.dataset.copy)) toast(t('js.app.copied'));
});

// ---- Rail arrows (desktop) ----
on(document, 'click', e => {
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
    const { counts } = await api('/api/live?ids=' + encodeURIComponent(ids.join(',')), { background: true });
    for (const el of els) {
      const n = counts[el.dataset.live] || 0; const f = el.dataset.liveFormat || 'pill'; el.dataset.count = String(n);
      if (f === 'pill') { el.textContent = t('js.app.playing', { n: fmtNum(n) }); el.hidden = !n; }
      else if (f === 'number') el.textContent = fmtNum(n);
      else if (f === 'bar') el.textContent = n ? `🟢 ${t('js.app.playing', { n: fmtNum(n) })}` : '';
    }
  } catch { /* offline: try again later */ }
}
if (FIRST && document.querySelector('[data-live]')) setInterval(() => { if (!document.hidden) refreshLive(); }, 30000);

// ---- Forms with data-api: submit as JSON, show inline errors, then redirect/reload ----
on(document, 'submit', async e => {
  const f = e.target.closest('form[data-api]'); if (!f) return;
  e.preventDefault();
  // A chosen <option data-confirm> (e.g. merging accounts) asks its own question, read at submit time.
  const ask = (f.querySelector('select option:checked[data-confirm]') || {}).dataset?.confirm || f.dataset.confirm;
  if (ask && !window.confirm(ask)) return;
  // The clicked button (it may sit outside the form, with form="…") stays disabled until the reply, so a double click posts once.
  const btn = e.submitter || f.querySelector('[type=submit]'); if (btn) { btn.disabled = true; btn.dataset.busy = '1'; }
  $$('.err', f).forEach(x => (x.textContent = '')); $$('[aria-invalid]', f).forEach(x => x.removeAttribute('aria-invalid'));
  // Fields that repeat (a list of checkboxes with one name) are sent as arrays.
  const body = {};
  for (const [k, v] of new FormData(f).entries()) body[k] = k in body ? [].concat(body[k], v) : v;
  let left = false;
  try {
    const r = await api(f.dataset.api, { method: f.dataset.method || 'POST', body });
    const msg = (r && r.toast) || f.dataset.toast;
    const next = (r && r.redirect) || f.dataset.next;
    const leaving = next || f.dataset.reload !== undefined;
    // A confirmation shown just before a reload would vanish: keep it for the next page instead.
    if (msg) { if (leaving) { try { sessionStorage.setItem('brb-toast', msg); } catch { toast(msg); } } else toast(msg); }
    left = !!leaving;
    if (next) location.href = next; else if (f.dataset.reload !== undefined) location.reload();
    else if (f.dataset.reset !== undefined) f.reset();
  } catch (err) {
    // Signed out meanwhile: keep what was typed on the page (never passwords) and come back here after signing in.
    if (err.signedOut) { left = true; signedOut($$('textarea,input[type=text]')); return; }
    const field = err.data && err.data.field; const target = field && f.querySelector(`[name="${field}"]`);
    if (target) { target.setAttribute('aria-invalid', 'true'); const er = f.querySelector(`#${target.id}-err`); if (er) er.textContent = err.message; else toast(err.message, { bad: true }); target.focus(); }
    else {
      const er = f.querySelector('.form-err'); if (er) er.textContent = err.message; else toast(err.message, { bad: true });
      // A form with a single field (e.g. a class code): that field is the one to fix.
      const only = $$('.input', f); if (er && only.length === 1) { only[0].setAttribute('aria-invalid', 'true'); only[0].focus(); }
    }
  } finally { if (btn && !left) { btn.disabled = false; delete btn.dataset.busy; } }   // leaving: stays disabled until the next page
});
// Back to a page kept in the browser's cache: buttons we disabled while leaving work again.
on(window, 'pageshow', e => { if (e.persisted) $$('[data-busy]').forEach(b => { b.disabled = false; delete b.dataset.busy; }); });

// ---- 🌐 language and ☀️/🌙/🌓 theme menus: a <details> of plain links (works without JS); here we add Escape, outside-click and arrow keys ----
if (FIRST) for (const d of $$('[data-langpick],[data-themepick]')) {
  const links = () => $$('li > a', d);
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
// ---- Top-bar search: the short placeholder ("Search") when the long one would be cut off ----
const topq = document.getElementById('topq');
if (FIRST && topq && topq.dataset.short) {
  const long = topq.placeholder, ctx = document.createElement('canvas').getContext('2d');
  const fit = () => {
    const cs = getComputedStyle(topq); ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const room = topq.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    topq.placeholder = ctx.measureText(long).width + 4 <= room ? long : topq.dataset.short;   // 4px: rounding between canvas and layout
  };
  fit(); document.fonts.ready.then(fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(topq);
}
// The Me page's language form saves as soon as a language is picked.
const langSel = document.getElementById('lang-select');
if (FIRST && langSel) langSel.addEventListener('change', () => langSel.form.submit());

// ---- Theme: Same as my device / Light / Dark. The menu links and the Me page form work without JS (?theme=); here a pick
// applies at once: <html data-theme>, the color-scheme and theme-color metas change, the menus follow, and the server saves it.
/** The browser's toolbar takes the top bar's colour (--bar, read from the CSS): one value for Light or Dark, one per
 *  device scheme for "Same as my device" (as server/views/layout.js writes it). */
function setThemeColor(pinned) {
  const root = document.documentElement, was = root.dataset.theme;
  const bar = th => { root.dataset.theme = th; return getComputedStyle(root).getPropertyValue('--bar').trim(); };
  const metas = pinned ? [[bar(pinned), '']] : [[bar('light'), '(prefers-color-scheme: light)'], [bar('dark'), '(prefers-color-scheme: dark)']];
  if (was) root.dataset.theme = was; else delete root.dataset.theme;
  const old = $$('meta[name="theme-color"]'); const at = old[0] || $('meta[name="color-scheme"]');
  for (const [color, media] of metas) {
    const m = document.createElement('meta'); m.name = 'theme-color'; m.content = color; if (media) m.media = media;
    at.before(m);
  }
  old.forEach(m => m.remove());
}
function applyTheme(theme) {
  const pinned = theme === 'light' || theme === 'dark';
  if (pinned) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
  const meta = $('meta[name="color-scheme"]'); if (meta) meta.content = pinned ? theme : 'light dark';
  setThemeColor(pinned ? theme : null);
  for (const a of $$('a[data-theme-choice]')) {
    const on = a.dataset.themeChoice === theme;
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    const check = $('.lang-check', a); if (check) check.textContent = on ? '✓' : '';
    if (on) for (const s of $$('[data-themepick] > summary')) { s.setAttribute('aria-label', a.dataset.label); $('.theme-ico', s).textContent = $('.theme-ico', a).textContent; }
  }
  for (const r of $$('#themeform input[name="theme"]')) r.checked = r.value === theme;
}
let themeSaving = Promise.resolve();   // one save at a time, so the last pick is the one kept
function chooseTheme(theme, fallback) {
  applyTheme(theme);
  themeSaving = themeSaving.then(() => api('/api/me/theme', { method: 'POST', body: { theme } })).catch(fallback);
}
on(document, 'click', e => {
  const a = e.target.closest('a[data-theme-choice]');
  if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  const d = a.closest('details'); if (d) { d.open = false; $('summary', d).focus(); }
  chooseTheme(a.dataset.themeChoice, () => { location.href = a.href; });   // saving failed: the plain link saves it instead
});
const themeForm = document.getElementById('themeform');
if (FIRST && themeForm) {
  themeForm.addEventListener('change', e => { if (e.target.name === 'theme') chooseTheme(e.target.value, () => themeForm.submit()); });
  const save = $('[type=submit]', themeForm); if (save) save.hidden = true;   // picks apply at once
}

// ---- "Play as guest" buttons anywhere ----
on(document, 'click', async e => {
  const b = e.target.closest('[data-guest-play]'); if (!b) return;
  e.preventDefault(); b.disabled = true;
  try { await api('/api/auth/guest', { method: 'POST', body: {} }); location.href = b.dataset.guestPlay || location.href; }
  catch (err) { toast(err.message, { bad: true }); b.disabled = false; }
});

// Text kept by signedOut() for the person now signed in comes back into its field. Drafts of anyone else are dropped
// (a shared classroom device): only kept while nobody is signed in, for the sign-in page.
if (FIRST) try {
  const who = document.body.dataset.user, here = `brb-draft:${who}:${location.pathname}:`; let kept = false;
  for (const k of Object.keys(sessionStorage).filter(k => k.startsWith('brb-draft:'))) {
    if (!who) continue;
    if (k.startsWith(here)) { const el = document.getElementById(k.slice(here.length)); if (el && 'value' in el) { el.value = sessionStorage.getItem(k); kept = true; } }
    if (k.startsWith(here) || !k.startsWith(`brb-draft:${who}:`)) sessionStorage.removeItem(k);
  }
  if (kept) setTimeout(() => toast(t('js.app.draftKept')), 300);
} catch { /* storage off */ }
// A confirmation saved by a form just before it reloaded or moved to another page.
if (FIRST) try { const m = sessionStorage.getItem('brb-toast'); if (m) { sessionStorage.removeItem('brb-toast'); toast(m); } } catch { /* storage off */ }
