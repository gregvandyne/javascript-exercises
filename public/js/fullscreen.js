// Full screen for one element (the Studio's preview, the play page's stage). The real Fullscreen API where the browser
// has it (requestFullscreen, or webkitRequestFullscreen on older Safari); where it has none (iPhone Safari: only a video
// can go full screen there) or the request is refused, a CSS full screen instead: the element fixed over the whole
// window (inset 0, 100dvh, above everything), the page behind it locked, and an "✕ Exit full screen" button in a
// safe-area corner. Esc and that button leave it. public/css/app.css ".css-full" draws it.
//   const fs = fullScreen(el, { label, onChange(on) }) -> { toggle(), enter(), exit(), on() }
import { t } from '/js/app.js';

const apiOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const apiExit = () => { const f = document.exitFullscreen || document.webkitExitFullscreen; if (f) { try { Promise.resolve(f.call(document)).catch(() => {}); } catch { /* gone already */ } } };

export function fullScreen(el, { onChange = () => {}, onEnter = () => {} } = {}) {
  let css = false, btn = null, back = null;
  const on = () => css || apiOn();
  const key = e => { if (e.key === 'Escape' && css) { e.preventDefault(); exitCss(); } };
  function enterCss() {
    if (css) return;
    css = true; back = document.activeElement;
    el.classList.add('css-full'); document.documentElement.classList.add('css-full-on');
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'fs-exit';
    btn.innerHTML = `<span aria-hidden="true">✕</span> `; btn.append(t('js.app.fullExit'));
    btn.addEventListener('click', exitCss);
    el.append(btn); btn.focus();
    addEventListener('keydown', key, true);
    onChange(true);
  }
  function exitCss() {
    if (!css) return;
    css = false;
    el.classList.remove('css-full'); document.documentElement.classList.remove('css-full-on');
    if (btn) btn.remove(); btn = null;
    removeEventListener('keydown', key, true);
    if (back && back.isConnected && typeof back.focus === 'function') back.focus();
    onChange(false);
  }
  function enter() {
    if (on()) return;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req || document.fullscreenEnabled === false) { enterCss(); onEnter(); return; }
    let p;
    try { p = req.call(el); } catch { enterCss(); onEnter(); return; }
    // (old Safari's webkitRequestFullscreen returns nothing: it either worked by a moment later or it was refused)
    if (!p || typeof p.then !== 'function') { setTimeout(() => { if (!apiOn()) enterCss(); onEnter(); }, 300); return; }
    p.then(() => { if (!apiOn()) enterCss(); onEnter(); }, () => { enterCss(); onEnter(); });
  }
  function exit() { if (css) exitCss(); else if (apiOn()) apiExit(); }
  const sync = () => onChange(on());
  document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
  return { enter, exit, toggle: () => (on() ? exit() : enter()), on };
}
