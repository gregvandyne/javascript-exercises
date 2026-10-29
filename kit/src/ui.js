// The DOM layer every kit game shares: injected CSS (brand tokens for day and night), one <div class="ok-ui" dir lang>
// root, a polite live region, the caption strip, toasts, buttons and the touch-control styles. Real DOM (no shadow
// DOM), so the playtest inspect() sees it. Screens (title, pause, results) build on these in the UI module.
import { PALETTE, INK, CREAM, PAPER } from './tokens.js';
import { fontStack } from './text.js';
import { SCREEN_CSS } from './screens.js';

const P = PALETTE;
export const CSS = `
.ok-stage{position:fixed;inset:0;overflow:hidden;background:${PAPER};touch-action:none;-webkit-user-select:none;user-select:none}
.ok-stage canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.ok-ui{position:fixed;inset:0;pointer-events:none;font-family:var(--ok-font);color:var(--ok-text);z-index:10;
  --ok-text:${INK};--ok-card:${CREAM};--ok-scrim:rgba(20,20,20,.42);--ok-glow:rgba(255,253,242,.62);--ok-focus:${INK};--ok-edge:${INK};--ok-bg2:${PAPER};--ok-line:#E2DDCB;--ok-icon-card:${CREAM};font-size:calc(16px * var(--ok-ts,1))}
.ok-ui.ok-night{--ok-text:${CREAM};--ok-card:#1E1E1B;--ok-scrim:rgba(10,12,12,.55);--ok-glow:rgba(14,20,20,.5);--ok-focus:${P.spark[2]};--ok-edge:${CREAM};--ok-bg2:#262622;--ok-line:#36352F;--ok-icon-card:#2E2D28}
.ok-ui>*{pointer-events:auto}
.ok-ui :focus-visible{outline:3px solid var(--ok-focus);outline-offset:3px}
.ok-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.ok-btn{font:inherit;font-weight:700;font-size:1.1em;min-height:48px;padding:0 24px;border-radius:999px;border:2px solid ${INK};cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 0 var(--ok-press);transform:translateY(0);
  transition:transform 80ms ease-out,box-shadow 80ms ease-out;-webkit-tap-highlight-color:transparent;color:${INK};line-height:1.1}
.ok-btn:active,.ok-btn.ok-down{transform:translateY(3px);box-shadow:0 1px 0 var(--ok-press)}
.ok-btn svg{width:1.3em;height:1.3em}
.ok-hot{background:${P.spark[2]};--ok-press:${P.spark[3]}}
.ok-go{background:${P.mint[2]};--ok-press:${P.mint[3]}}
.ok-quiet{background:${CREAM};--ok-press:${INK}}
.ok-icon{width:48px;padding:0;background:${CREAM};--ok-press:${INK}}
.ok-big{min-height:64px;font-size:1.35em;padding:0 32px}
.ok-caption{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);max-width:min(92vw,720px);
  background:rgba(20,20,20,.86);color:${CREAM};padding:8px 16px;border-radius:14px;font-weight:600;line-height:1.35;text-align:center;
  opacity:0;transition:opacity 200ms;pointer-events:none}
.ok-caption.on{opacity:1}
.ok-toast{position:fixed;left:50%;top:calc(16px + env(safe-area-inset-top));transform:translate(-50%,-140%);background:var(--ok-card);color:var(--ok-text);
  border:2px solid ${INK};border-radius:999px;padding:10px 20px;font-weight:700;box-shadow:0 4px 0 ${INK};transition:transform 320ms cubic-bezier(.34,1.56,.64,1),visibility 0s 320ms;visibility:hidden;pointer-events:none}
.ok-toast.on{transform:translate(-50%,0);visibility:visible;transition:transform 320ms cubic-bezier(.34,1.56,.64,1)}
.ok-touch{position:fixed;inset:0;pointer-events:none}
.ok-touch>*{pointer-events:auto;position:absolute;opacity:.85;transition:opacity 120ms,transform 80ms ease-out}
.ok-touch>.on{opacity:1}
/* touch controls are stickers: Cream discs with an Ink outline and a hard drop (clear on dirt, sky or night) */
.ok-stick{width:136px;height:136px;border-radius:50%;background:${CREAM};border:3px solid ${INK};box-shadow:0 4px 0 ${INK},inset 0 0 0 10px ${PAPER};
  left:calc(22px + env(safe-area-inset-left));bottom:calc(22px + env(safe-area-inset-bottom))}
.ok-stick::before{content:"";position:absolute;inset:22px;border-radius:50%;border:2px dashed ${INK}55}
.ok-knob{position:absolute;left:50%;top:50%;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;background:${P.mint[2]};border:3px solid ${INK};box-shadow:0 3px 0 ${P.mint[3]}}
.ok-tbtn{width:80px;height:80px;border-radius:50%;background:${P.mint[2]};border:3px solid ${INK};box-shadow:0 5px 0 ${INK};display:flex;align-items:center;justify-content:center;color:#FFFFFF}
.ok-tbtn.on{transform:translateY(4px);box-shadow:0 1px 0 ${INK}}
.ok-tbtn svg{width:40px;height:40px;stroke:#FFFFFF;stroke-width:3.4;filter:drop-shadow(0 2px 0 ${P.mint[3]})}
.ok-jump{right:calc(24px + env(safe-area-inset-right));bottom:calc(34px + env(safe-area-inset-bottom))}
.ok-act{right:calc(118px + env(safe-area-inset-right));bottom:calc(24px + env(safe-area-inset-bottom));background:${P.sky[2]}}
.ok-d{width:60px;height:60px;background:${CREAM};color:${INK}}.ok-d svg{stroke:${INK};filter:none}
.ok-d-left{left:calc(16px + env(safe-area-inset-left));bottom:calc(76px + env(safe-area-inset-bottom))}
.ok-d-right{left:calc(136px + env(safe-area-inset-left));bottom:calc(76px + env(safe-area-inset-bottom))}
.ok-d-up{left:calc(76px + env(safe-area-inset-left));bottom:calc(136px + env(safe-area-inset-bottom))}
.ok-d-down{left:calc(76px + env(safe-area-inset-left));bottom:calc(16px + env(safe-area-inset-bottom))}
.ok-touch.ok-left .ok-stick,.ok-touch.ok-left .ok-d{left:auto;right:calc(24px + env(safe-area-inset-right))}
.ok-touch.ok-left .ok-jump{right:auto;left:calc(24px + env(safe-area-inset-left))}
[dir=rtl] .ok-touch:not(.ok-left) .ok-stick{left:auto;right:calc(24px + env(safe-area-inset-right))}
[dir=rtl] .ok-touch:not(.ok-left) .ok-jump{right:auto;left:calc(24px + env(safe-area-inset-left))}
.ok-ui[lang|=ar] *,.ok-ui[lang|=he] *{letter-spacing:0!important}
.ok-ui[lang|=ar]{line-height:1.6}
.ok-num{font-variant-numeric:tabular-nums}
@media (prefers-reduced-motion:reduce){.ok-btn,.ok-toast,.ok-caption{transition:none}}
`;

export class UI {
  constructor(kit) {
    this.kit = kit; this.doc = kit.doc; this.root = null;
  }
  mount() {
    if (this.root) return this.root;
    const d = this.doc;
    if (!d.getElementById('ok-css')) { const s = d.createElement('style'); s.id = 'ok-css'; s.textContent = CSS + SCREEN_CSS; (d.head || d.documentElement).appendChild(s); }
    const r = this.root = d.createElement('div'); r.className = 'ok-ui';
    this.live = d.createElement('div'); this.live.className = 'ok-sr'; this.live.setAttribute('aria-live', 'polite'); this.live.setAttribute('role', 'status'); r.appendChild(this.live);
    this.cap = d.createElement('div'); this.cap.className = 'ok-caption'; this.cap.setAttribute('aria-hidden', 'true'); r.appendChild(this.cap);
    this.toastEl = d.createElement('div'); this.toastEl.className = 'ok-toast'; this.toastEl.setAttribute('role', 'status'); r.appendChild(this.toastEl);
    (d.body || d.documentElement).appendChild(r);
    this.sync();
    return r;
  }
  /** Language, direction, font, theme and text size onto the root. */
  sync() {
    const r = this.root; if (!r) return;
    const k = this.kit;
    r.setAttribute('lang', k.i18n.raw); r.setAttribute('dir', k.i18n.dir);
    r.style.setProperty('--ok-font', fontStack(k.i18n.lang));
    r.style.setProperty('--ok-ts', String(k.settings.get('textSize')));
    r.classList.toggle('ok-night', k.theme.dark); r.classList.toggle('ok-rm', k.settings.reduced);
  }
  announce(text) { this.mount(); this.live.textContent = ''; this.live.textContent = String(text); }
  caption(text, o = {}) {
    this.mount();
    if (!this.kit.settings.get('captions')) return;
    this.cap.textContent = (o.icon ? o.icon + ' ' : '') + String(text); this.cap.classList.add('on');
    if (this._capOff) this._capOff();
    this._capOff = this.kit.loop.ui.after(o.ms || Math.max(1800, String(text).length * 70), () => this.cap.classList.remove('on'));
  }
  toast(text, o = {}) {
    this.mount();
    this.toastEl.textContent = String(text); this.toastEl.classList.add('on');
    if (this._toastOff) this._toastOff();
    this._toastOff = this.kit.loop.ui.after(o.ms || 1800, () => this.toastEl.classList.remove('on'));
  }
  /** button(label, {kind:'hot'|'go'|'quiet'|'icon', icon:svgString, big, onPress}) */
  button(label, o = {}) {
    const b = this.doc.createElement('button'); b.type = 'button';
    b.className = 'ok-btn ok-' + (o.kind || 'go') + (o.big ? ' ok-big' : '');
    if (o.icon) b.innerHTML = o.icon;
    if (o.kind === 'icon') b.setAttribute('aria-label', String(label)); else b.appendChild(this.doc.createTextNode(String(label)));
    b.addEventListener('click', e => { this.kit.audio.unlock(); this.kit.sfx('select'); if (o.onPress) o.onPress(e); });
    return b;
  }
}
/** Load the kit font (Bricolage Grotesque, self-hosted next to the kit) with FontFace. ready resolves on load or after
 *  1.5 s on the rAF clock (system fallback). */
export function loadFonts(win, base, waitFrames) {
  const FF = win && win.FontFace; const fonts = win && win.document && win.document.fonts;
  if (!FF || !fonts || !base) return Promise.resolve(false);
  const faces = [
    ['bricolage-latin.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
    ['bricolage-latin-ext.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'],
  ];
  const loads = faces.map(([f, range]) => {
    try { const face = new FF('Bricolage Grotesque', `url(${base}fonts/${f}) format('woff2')`, { weight: '200 800', unicodeRange: range, display: 'swap' }); fonts.add(face); return f === faces[0][0] ? face.load() : null; } catch (e) { return null; }
  }).filter(Boolean);
  return Promise.race([Promise.all(loads).then(() => true, () => false), waitFrames(90).then(() => false)]);
}
