// The standard screens and HUD every kit game shares (spec §7.5): title, how-to, countdown, pause, results (win),
// try-again (never "game over"), settings, the quiz widget (ask), correct/wrong banners, speech bubbles, dialogs and
// the HUD (score, lives, timer, progress, combo, count). Real DOM in the kit's .ok-ui root: labelled buttons, focus
// trapped in modals, arrow keys / d-pad / 1-4 move and answer, mirrored for RTL, day and night, reduced motion aware.
import { PALETTE, INK, CREAM, z as Z } from './tokens.js';
import { icon } from './icons.js';

const P = PALETTE;
/** The "oomba" wordmark (the site logo's geometry: the two o's are Oomba's eyes, looking up at a spark). */
export const WORDMARK = `<svg viewBox="0 -24 616 184" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"><circle cx="60" cy="100" r="36"/><circle cx="172" cy="100" r="36"/><path d="M248 136V95a30 30 0 0 1 60 0v41M308 95a30 30 0 0 1 60 0v41"/><path d="M408 14v122"/><circle cx="444" cy="100" r="36"/><circle cx="556" cy="100" r="36"/><path d="M592 64v72"/></g><g fill="currentColor"><circle cx="67" cy="94" r="12"/><circle cx="179" cy="94" r="12"/></g><path d="M300-14q4 22 26 26q-22 4-26 26q-4-22-26-26q22-4 26-26z" fill="${P.spark[2]}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/></svg>`;
export const SCREEN_CSS = `
.ok-modal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));z-index:20;animation:ok-fade 200ms ease-out}
.ok-scrim{background:var(--ok-scrim);-webkit-backdrop-filter:saturate(.75) blur(2px);backdrop-filter:saturate(.75) blur(2px)}
.ok-win.ok-scrim{background:radial-gradient(ellipse 80% 90% at 50% 50%,var(--ok-scrim) 50%,rgba(10,12,12,.12));-webkit-backdrop-filter:none;backdrop-filter:none}
.ok-ask.ok-side-start{justify-content:flex-start}.ok-ask.ok-side-end{justify-content:flex-end}
.ok-asker{display:flex;align-items:center;gap:10px;font-weight:700;margin:-10px 0 -6px}.ok-asker canvas{display:block}
.ok-scrimlayer{position:absolute;inset:0;z-index:-1;background:var(--ok-scrim);-webkit-backdrop-filter:saturate(.75) blur(2px);backdrop-filter:saturate(.75) blur(2px);pointer-events:none}
.ok-ask.ok-top{align-items:flex-start}
.ok-card{position:relative;background:var(--ok-card);color:var(--ok-text);border:3px solid ${INK};border-radius:32px;box-shadow:0 8px 0 ${INK};padding:28px 24px 24px;
  width:min(440px,100%);max-height:100%;overflow:auto;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1)}
.ok-night .ok-card{border-color:${CREAM}33;box-shadow:0 8px 0 #000}
.ok-night .ok-card .ok-portrait{filter:drop-shadow(0 0 1.5px ${CREAM}) drop-shadow(0 0 10px rgba(255,253,242,.35))}
.ok-h1{margin:0;font-weight:800;font-size:clamp(2rem,7vmin,3.6rem);line-height:1.02;font-variation-settings:"opsz" 72;color:var(--ok-text);
  -webkit-text-stroke:0;paint-order:stroke fill;text-wrap:balance}
.ok-h2{margin:0;font-weight:800;font-size:1.7em;line-height:1.1;font-variation-settings:"opsz" 48;text-wrap:balance}
.ok-p{margin:0;font-weight:600;font-size:1.05em;line-height:1.4;max-width:34ch;text-wrap:pretty}
.ok-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center}
.ok-col{display:flex;flex-direction:column;gap:10px;align-items:stretch;width:100%;max-width:300px}
.ok-portrait{display:block;filter:none}
.ok-title-screen{flex-direction:column;justify-content:flex-start;padding-top:calc(max(18px,5vh) + env(safe-area-inset-top))}
/* the title block sits above the horizon (the cast stands on the ground below it, never behind the button); its soft
   cream glow falls off radially and never reaches the characters */
.ok-title-block{position:relative;display:flex;flex-direction:column;align-items:center;gap:clamp(8px,1.6vh,16px);max-height:min(64vh,calc(100% - 24vh));padding:4px 28px 10px}
.ok-title-block::before{content:"";position:absolute;inset:-4% -12%;z-index:-1;background:radial-gradient(closest-side,var(--ok-glow) 45%,transparent);pointer-events:none}
/* a clear zone around Play: a soft dim halo, so nothing in the scene reads as touching the button (no blur: a blurred
   strip of scenery looks like a rendering bug) */
.ok-cta{position:relative;display:flex;justify-content:center}
.ok-cta::before{content:"";position:absolute;inset:-18px -40px -24px;z-index:-1;border-radius:999px;background:radial-gradient(closest-side,var(--ok-glow) 55%,transparent);pointer-events:none}
.ok-title-screen .ok-h1{font-size:clamp(3rem,min(14vmin,15vw),7rem);line-height:.98;letter-spacing:-.01em;margin:0 0 .2em;text-align:center}
/* the lockup: each word a sticker with a gradient face (spark to coral by default, spec.titleHue), an Ink edge, a Cream
   rim and a 3D Ink extrude; words tilt alternately and drop in one after another */
.ok-title-word{position:relative;display:inline-block;isolation:isolate;rotate:-4deg;animation:ok-sticker 640ms cubic-bezier(.34,1.56,.64,1) both}
.ok-title-word:nth-child(even){rotate:2deg}.ok-stack .ok-title-word{display:block}
.ok-title-word i{font-style:normal;background:linear-gradient(var(--ok-t1,#FFE14D) 20%,var(--ok-t2,#FF7A3D) 85%);-webkit-background-clip:text;background-clip:text;color:transparent}
.ok-title-word::before,.ok-title-word::after{content:attr(data-w);position:absolute;inset:0;z-index:-1;color:${INK};-webkit-text-stroke:.24em ${INK};pointer-events:none}
.ok-title-word::after{z-index:-2;color:${CREAM};-webkit-text-stroke:.46em ${CREAM};filter:drop-shadow(0 .12em 0 ${INK})}
.ok-title-screen [lang|=ar] .ok-title-word,.ok-ui[lang|=ar] .ok-title-screen .ok-h1,.ok-ui[lang|=he] .ok-title-screen .ok-h1{line-height:1.15}
.ok-title-hero{position:fixed;bottom:max(3vh,14px);inset-inline-start:max(4vw,14px);z-index:-1;pointer-events:none;animation:ok-sticker 640ms 120ms cubic-bezier(.34,1.56,.64,1) both}
.ok-title-hero canvas{animation:ok-bob 2.4s ease-in-out infinite}
.ok-title-badge{margin:-.6em 0 -.2em;animation:ok-sticker 640ms 200ms cubic-bezier(.34,1.56,.64,1) both}.ok-title-badge>*{display:block;max-height:min(110px,13vh);width:auto}
.ok-title-screen .ok-brand{position:fixed;top:calc(14px + env(safe-area-inset-top));inset-inline-start:14px}
.ok-title-screen .ok-big{min-height:clamp(76px,10.5vh,90px);min-width:240px;font-size:clamp(1.6rem,3.7vh,2.05rem);border-width:3.5px;box-shadow:0 6px 0 ${INK};margin-top:10px;animation:ok-pop 420ms 260ms both,ok-glow 1.2s 900ms ease-in-out infinite}
@keyframes ok-glow{50%{box-shadow:0 6px 0 ${INK},0 0 0 9px rgba(255,210,63,.5)}}
.ok-title-screen .ok-big:focus-visible{outline-offset:4px;animation:ok-pop 420ms 260ms both}   /* one ring: the focus ring, or the pulse, never both */
.ok-brand{display:inline-flex;align-items:center;gap:6px;font-weight:800;font-size:.85em;color:${INK};background:${CREAM};border:2px solid ${INK};border-radius:999px;padding:3px 10px;box-shadow:0 2px 0 ${INK}}
.ok-brand svg{height:1.25em;width:auto}
.ok-title-screen .ok-p{text-align:center;background:var(--ok-card);border:3px solid ${INK};box-shadow:0 4px 0 ${INK};border-radius:18px;padding:10px 18px;max-width:min(40ch,calc(100vw - 48px));font-size:clamp(1rem,2.6vmin,1.35rem)}
.ok-night .ok-title-screen .ok-p{border-color:${CREAM}55;box-shadow:0 3px 0 #000}
.ok-corner{position:fixed;top:calc(12px + env(safe-area-inset-top));inset-inline-end:calc(12px + env(safe-area-inset-right));display:flex;gap:8px}
.ok-sparks{display:flex;gap:6px;justify-content:center}
.ok-sparks .ok-slot{width:clamp(52px,14vmin,76px);height:clamp(52px,14vmin,76px);color:${INK};--ok-fill:${P.stone[0]}}
.ok-sparks .ok-slot svg{width:100%;height:100%;stroke-width:1.5}
.ok-night .ok-sparks .ok-slot{--ok-fill:#3A3933}
.ok-sparks .ok-slot:nth-child(2){transform:translateY(-10px) scale(1.12)}
.ok-sparks .ok-on{--ok-fill:${P.spark[2]};animation:ok-land 420ms cubic-bezier(.34,1.56,.64,1)}
.ok-win .ok-card{z-index:1}
.ok-sparks{position:relative;isolation:isolate}
.ok-sparks::before{content:"";position:absolute;inset:-34% -18%;z-index:-1;border-radius:50%;background:radial-gradient(closest-side,rgba(255,210,63,.55),rgba(255,210,63,0));opacity:0;transition:opacity 500ms ease-out;pointer-events:none}
.ok-sparks.ok-lit::before{opacity:1}
.ok-score{font-weight:800;font-size:2.2em;font-variant-numeric:tabular-nums;line-height:1}
.ok-best{font-weight:600;color:var(--ok-text);opacity:.8}
.ok-badge{display:inline-flex;align-items:center;gap:6px;background:${P.spark[2]};color:${INK};border:2px solid ${INK};border-radius:999px;padding:4px 14px;font-weight:800;animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1);transform:rotate(-3deg)}
.ok-badge svg{width:1.1em;height:1.1em}
.ok-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;width:100%}
.ok-howcard{background:var(--ok-bg2);border:2px solid var(--ok-edge);border-radius:20px;padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:8px;font-weight:600;line-height:1.3;animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1) both}
.ok-howcard svg{width:44px;height:44px;color:var(--ok-text)}
.ok-count{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:25}
.ok-count b{font-weight:800;font-size:clamp(5rem,30vmin,14rem);color:${CREAM};-webkit-text-stroke:max(3px,1.4vmin) ${INK};paint-order:stroke fill;font-variant-numeric:tabular-nums;animation:ok-countpop 700ms cubic-bezier(.34,1.56,.64,1) both}
.ok-count b.ok-go{color:${P.mint[2]}}
.ok-set{width:min(520px,100%)}
.ok-set .ok-srow{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:8px 0;border-bottom:2px dashed var(--ok-line);text-align:start;font-weight:700}
.ok-seg{display:inline-flex;border:2px solid ${INK};border-radius:999px;overflow:hidden;flex-shrink:0}
.ok-seg button{font:inherit;font-weight:700;min-height:44px;min-width:44px;padding:0 12px;border:0;background:${CREAM};color:${INK};cursor:pointer}
.ok-seg button+button{border-inline-start:2px solid ${INK}}
.ok-seg button[aria-pressed=true]{background:${P.mint[2]}}
.ok-switch{position:relative;width:64px;height:40px;border-radius:999px;border:2px solid ${INK};background:${P.stone[0]};cursor:pointer;flex-shrink:0;padding:0}
.ok-switch::after{content:"";position:absolute;top:4px;inset-inline-start:4px;width:28px;height:28px;border-radius:50%;background:${CREAM};border:2px solid ${INK};transition:inset-inline-start 160ms ease-out}
.ok-switch[aria-checked=true]{background:${P.mint[2]}}
.ok-switch[aria-checked=true]::after{inset-inline-start:24px}
.ok-ask .ok-card{width:min(560px,100%)}
.ok-q{font-weight:800;margin:0;font-size:clamp(1.6rem,6vmin,2.6rem);line-height:1.15;font-variant-numeric:tabular-nums;text-wrap:balance}
.ok-tiles{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;background:#2B1F5C;padding:14px;border-radius:26px;border:3px solid ${INK}}
.ok-tile{position:relative;font:inherit;font-weight:800;font-size:clamp(1.4rem,5vmin,2.1rem);min-height:72px;border-radius:22px;border:3px solid ${INK};background:${CREAM};color:${INK};
  box-shadow:inset 0 -6px 0 var(--ok-lip,${P.coral[2]}),0 5px 0 ${INK};cursor:pointer;transition:transform 80ms ease-out,box-shadow 80ms ease-out;font-variant-numeric:tabular-nums}
/* the answer dock: deep grape behind white tiles, each with a coloured lip (the zone reads apart from the world) */
.ok-tile:nth-child(4n+2){--ok-lip:${P.sky[2]}}.ok-tile:nth-child(4n+3){--ok-lip:${P.grape[2]}}.ok-tile:nth-child(4n){--ok-lip:${P.mint[2]}}
.ok-tile:active{transform:translateY(4px);box-shadow:inset 0 -6px 0 var(--ok-lip,${P.coral[2]}),0 1px 0 ${INK}}
.ok-tile .ok-key{position:absolute;top:6px;inset-inline-start:8px;font-size:.5em;font-weight:700;opacity:.55}
.ok-tile .ok-mark{position:absolute;top:-12px;inset-inline-end:-10px;width:34px;height:34px;border-radius:50%;border:2px solid ${INK};display:flex;align-items:center;justify-content:center;animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1)}
.ok-tile .ok-mark svg{width:22px;height:22px}
.ok-tile.ok-right{background:${P.mint[2]};animation:ok-punch 220ms ease-out}.ok-tile.ok-right .ok-mark{background:${P.mint[2]};border-radius:50%}
.ok-tile.ok-bad{background:${P.coral[1]};animation:ok-shake 240ms linear}.ok-tile.ok-bad .ok-mark{background:${P.coral[2]};border-radius:6px;transform:rotate(45deg)}.ok-tile.ok-bad .ok-mark svg{transform:rotate(-45deg)}
.ok-hint{display:flex;align-items:center;gap:8px;font-weight:700;background:${P.sky[0]};color:${INK};border-radius:16px;padding:8px 14px;animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1)}
.ok-hint svg{width:1.3em;height:1.3em;flex-shrink:0}
.ok-banner{position:fixed;top:calc(74px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:10px 20px 10px 12px;border:3px solid ${INK};border-radius:999px;
  font-weight:800;font-size:1.15em;color:${INK};box-shadow:0 5px 0 ${INK};z-index:22;animation:ok-drop 420ms cubic-bezier(.34,1.56,.64,1);max-width:calc(100vw - 32px)}
.ok-banner.ok-inline{position:relative;top:auto;left:auto;transform:none;align-self:center;font-size:1em;padding:6px 16px 6px 8px;box-shadow:0 3px 0 ${INK};animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1)}
.ok-banner .ok-mark{width:34px;height:34px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:2px solid ${INK};background:${CREAM}}
.ok-banner .ok-mark svg{width:22px;height:22px}
.ok-banner.ok-correct{background:${P.mint[2]}}.ok-banner.ok-correct .ok-mark{border-radius:50%}
.ok-banner.ok-wrong{background:${P.coral[1]}}.ok-banner.ok-wrong .ok-mark{border-radius:6px;transform:rotate(45deg)}.ok-banner.ok-wrong .ok-mark svg{transform:rotate(-45deg)}
.ok-bubble{position:fixed;max-width:min(86vw,calc(28ch + 72px));background:${CREAM};color:${INK};border:3px solid ${INK};border-radius:24px;padding:14px 18px;box-shadow:0 5px 0 ${INK};font-weight:650;font-size:20px;line-height:1.4;hyphens:none;-webkit-hyphens:none;overflow-wrap:normal;word-break:normal;
  z-index:18;animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1);transform-origin:var(--ok-tx,50%) 100%;display:flex;gap:12px;align-items:flex-start;cursor:pointer;text-align:start}
.ok-bubble::after{content:"";position:absolute;bottom:-17px;left:var(--ok-tx,50%);margin-left:-14px;width:28px;height:18px;background:${CREAM};clip-path:polygon(0 0,100% 0,30% 100%);
  filter:drop-shadow(0 3px 0 ${INK})}
.ok-bubble::before{content:"";position:absolute;bottom:-22px;left:var(--ok-tx,50%);margin-left:-17px;width:34px;height:23px;background:${INK};clip-path:polygon(0 0,100% 0,29% 100%)}
.ok-bubble .ok-more{position:absolute;bottom:6px;inset-inline-end:10px;width:18px;height:18px;opacity:.6;animation:ok-nudge 900ms ease-in-out infinite}
.ok-bubble .ok-txt{min-height:1.4em;padding-inline-end:12px;max-width:28ch;text-wrap:pretty}
@media (max-width:600px){.ok-bubble{font-size:18px;padding:12px 14px}}
.ok-hud{position:fixed;inset:0;pointer-events:none;padding:calc(10px + env(safe-area-inset-top)) calc(10px + env(safe-area-inset-right)) 0 calc(10px + env(safe-area-inset-left));display:flex;justify-content:space-between;align-items:flex-start;gap:8px;z-index:12}
.ok-hud>div{display:flex;gap:8px;align-items:center;flex-wrap:nowrap;pointer-events:auto;min-width:0}
.ok-pill{display:inline-flex;align-items:center;gap:6px;min-height:46px;padding:0 14px 0 8px;border-radius:999px;background:var(--ok-card);color:var(--ok-text);border:3px solid ${INK};box-shadow:0 3px 0 ${INK};font-weight:800;font-size:clamp(1.15rem,3.6vmin,1.5rem);font-variant-numeric:tabular-nums;white-space:nowrap}
.ok-night .ok-pill{border-color:${CREAM}55;box-shadow:0 3px 0 #000}
.ok-pill svg{width:28px;height:28px;flex-shrink:0}
.ok-pill .ok-sp{display:flex}.ok-pill .ok-sp svg{stroke-width:2}
.ok-pill[hidden]{display:none}
.ok-hearts{gap:2px;padding:0 10px}
.ok-hearts svg{transition:transform 200ms;stroke-width:2.2}
.ok-hearts .ok-lost{opacity:.45}
.ok-hearts .ok-pop{animation:ok-heartpop 420ms ease-out}
.ok-timer .ok-clock{width:30px;height:30px;overflow:visible}
.ok-timer .ok-face{fill:${CREAM};stroke:${INK};stroke-width:2.2}.ok-timer .ok-pie{fill:${P.mint[1]}}.ok-timer .ok-hand,.ok-timer .ok-knob{stroke:${INK};stroke-width:2.2;stroke-linecap:round;fill:none}.ok-timer .ok-knob{fill:${INK}}
.ok-timer.ok-low .ok-pie{fill:${P.coral[1]}}.ok-timer.ok-low{animation:ok-pulse 1s ease-in-out infinite}
.ok-progress{width:clamp(120px,24vw,240px);padding:0 8px 0 12px;gap:6px}
.ok-bar{flex:1;height:14px;border-radius:999px;background:${P.stone[0]};border:2px solid ${INK};overflow:hidden;min-width:28px}
.ok-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,${P.mint[2]},${P.spark[2]});border-inline-end:2px solid ${INK};transition:width 300ms cubic-bezier(.34,1.56,.64,1)}
.ok-progress .ok-flag{width:22px;height:22px;flex-shrink:0;color:${P.mint[2]}}
.ok-scorepill{position:relative}
.ok-scorepill:has(.ok-combo:not([hidden])){padding-inline-end:24px}
.ok-combo{position:absolute;top:-11px;inset-inline-end:-10px;min-height:0;padding:1px 7px;border-radius:999px;border:2px solid ${INK};font-weight:800;font-size:.8em;background:${P.grape[1]};color:${INK};box-shadow:0 2px 0 ${INK}}
.ok-combo.ok-bump{animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1)}
.ok-hud .ok-btn.ok-icon{min-height:48px;width:48px}
/* phones: one compact row (counter, hearts, clock, flag meter, and one menu button: sound lives in the pause screen) */
@media (max-width:600px){
  .ok-hud{padding:calc(8px + env(safe-area-inset-top)) calc(8px + env(safe-area-inset-right)) 0 calc(8px + env(safe-area-inset-left));gap:6px}
  .ok-hud>div{gap:5px}
  .ok-pill{min-height:40px;padding:0 9px 0 6px;font-size:1.02rem;gap:4px;border-width:2px;box-shadow:0 2px 0 ${INK}}
  .ok-pill svg,.ok-timer .ok-clock{width:21px;height:21px}
  .ok-hearts{gap:0;padding:0 6px}
  .ok-progress{width:auto;padding:0 8px}.ok-progress .ok-bar{width:34px;flex:none;height:12px}.ok-progress .ok-flag{width:18px;height:18px}
  .ok-hud .ok-sound{display:none}
}
.ok-dialog .ok-card{width:min(480px,100%)}
.ok-pause .ok-srow{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;font-weight:700;padding:2px 4px}
@keyframes ok-fade{from{opacity:0}}
@keyframes ok-pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.04);opacity:1}100%{transform:scale(1)}}
@keyframes ok-drop{0%{transform:translateY(-40px) scale(.8);opacity:0}100%{transform:none;opacity:1}}
.ok-banner{animation-name:ok-bannerdrop}
@keyframes ok-bannerdrop{0%{transform:translate(-50%,-40px) scale(.8);opacity:0}100%{transform:translate(-50%,0);opacity:1}}
@keyframes ok-sticker{0%{transform:translateY(-30px) scale(.4) rotate(-8deg);opacity:0}60%{transform:translateY(2px) scale(1.08) rotate(2deg);opacity:1}100%{transform:none}}
@keyframes ok-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes ok-land{0%{transform:scale(2.2) rotate(-40deg);opacity:0}60%{transform:scale(.9) rotate(6deg);opacity:1}100%{transform:none}}
@keyframes ok-countpop{0%{transform:scale(2.4);opacity:0}30%{transform:scale(.92);opacity:1}45%{transform:scale(1.04)}80%{transform:scale(1);opacity:1}100%{transform:scale(.8);opacity:0}}
@keyframes ok-punch{50%{transform:scale(1.12)}}
@keyframes ok-shake{25%,75%{translate:-6px}50%{translate:6px}}
@keyframes ok-heartpop{0%{transform:scale(1)}40%{transform:scale(1.5)}100%{transform:scale(1)}}
@keyframes ok-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes ok-nudge{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}
.ok-rm .ok-modal,.ok-rm .ok-card,.ok-rm .ok-title-hero canvas,.ok-rm .ok-title-word,.ok-rm .ok-title-hero,.ok-rm .ok-title-badge,.ok-rm .ok-big,.ok-rm .ok-on,.ok-rm .ok-badge,.ok-rm .ok-howcard,.ok-rm .ok-tile,.ok-rm .ok-banner,.ok-rm .ok-bubble,.ok-rm .ok-hint,.ok-rm .ok-pop,.ok-rm .ok-low,.ok-rm .ok-bump,.ok-rm .ok-more{animation:ok-fade 200ms ease-out!important}
.ok-rm .ok-count b{animation:ok-countfade 700ms both!important}
@keyframes ok-countfade{0%,100%{opacity:0}20%,80%{opacity:1}}
@media (max-width:420px){.ok-card{padding:22px 16px 18px;border-radius:26px}.ok-tiles{gap:10px}}
`;

/** 'rtl' for Hebrew/Arabic script, 'ltr' for other letters, and 'ltr' for text with no letters (maths, numbers). */
/** Title lockup gradients (spec.titleHue). */
export const TITLE_HUES = { spark: ['#FFE14D', '#FF7A3D'], mint: ['#9BF0B8', '#2FB7E8'], sky: ['#7FD3FF', '#9B6BE8'], coral: ['#FFB36B', '#FF4F6E'] };
export function textDir(s) {
  const m = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u08FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.exec(String(s));
  return m && /[\u0590-\u08FF]/.test(m[0]) ? 'rtl' : 'ltr';
}
/** Distractor tiles for a numeric answer (seeded by the question, so the same question shows the same tiles). */
export function distractors(answer, n = 4, seedText = '') {
  const a = Number(answer); n = Math.max(2, Math.min(4, n | 0));
  if (!isFinite(a)) return [String(answer)];
  let h = 2166136261; for (const ch of seedText + '|' + a) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  const pool = [a + 1, a - 1, a + 2, a - 2, a + 10, a - 10, a + 5, a - 5, a * 2, Math.round(a / 2)].filter(x => x >= 0 && x !== a && Number.isInteger(x) === Number.isInteger(a));
  const out = [a]; while (out.length < n && pool.length) { const x = pool.splice((rnd() * Math.min(pool.length, 6)) | 0, 1)[0]; if (!out.includes(x)) out.push(x); }
  for (let i = out.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [out[i], out[j]] = [out[j], out[i]]; }
  return out.map(String);
}
export function screens(kit) {
  const doc = kit.doc, T = (k, v) => kit.i18n.t(k, v), ui = kit.ui;
  const el = (tag, cls, html) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const txt = (tag, cls, s) => { const e = el(tag, cls); e.textContent = String(s); return e; };
  // Game text keeps its own direction (an English title in an Arabic UI); maths and numbers never mirror.
  const gtxt = (tag, cls, s) => { const e = txt(tag, cls, s); e.dir = textDir(s); return e; };
  const later = (ms, fn) => kit.loop.ui.after(ms, fn);
  const reduced = () => kit.settings.reduced;
  const stage = () => kit.stage;
  const btn = (label, kind, onPress, o = {}) => { const b = ui.button(label, Object.assign({ kind, onPress }, o)); return b; };
  let open = 0;
  const live = new Set();   // open modals' close functions (closeAll: a test jumping straight into play)
  /** A modal: scrim, card, focus trap, arrow-key moves; pauses the game while open. -> {root, card, close(v), done} */
  function modal(kind, o = {}) {
    const root = el('div', 'ok-modal ok-' + kind + (o.scrim === false ? '' : ' ok-scrim'));
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    const card = o.bare ? root : el('div', 'ok-card');
    if (!o.bare) root.appendChild(card);
    const prev = doc.activeElement; let resolve;
    const done = new Promise(r => { resolve = r; });
    const pause = o.pause !== false; if (pause) kit.loop.pause('ui:' + kind);
    open++;
    const keys = e => {
      const top = [...doc.querySelectorAll('.ok-modal')].pop(); if (top !== root) return;   // only the top-most modal
      const bs = [...root.querySelectorAll('button:not([disabled])')]; if (!bs.length) return;
      const i = bs.indexOf(doc.activeElement);
      if (e.key === 'Tab') { e.preventDefault(); bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus(); }
      else if (/^Arrow/.test(e.key)) {
        const rtl = kit.i18n.dir === 'rtl', back = e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && !rtl) || (e.key === 'ArrowRight' && rtl);
        e.preventDefault(); bs[(Math.max(0, i) + (back ? -1 : 1) + bs.length) % bs.length].focus();
      } else if (e.key === 'Escape' && o.onEscape) { e.preventDefault(); o.onEscape(); }
      else if (o.onKey) o.onKey(e);
      e.stopPropagation();
    };
    root.tabIndex = -1; doc.addEventListener('keydown', keys, true);
    const close = v => {
      if (!root.parentNode) return;
      root.parentNode.removeChild(root); open--; live.delete(close); doc.removeEventListener('keydown', keys, true);
      if (pause) kit.loop.resume('ui:' + kind);
      try { if (prev && prev.focus) prev.focus(); } catch (e) { /* gone */ }
      resolve(v);
    };
    ui.mount().appendChild(root); live.add(close);
    later(0, () => { const f = root.querySelector('[data-ok-focus]') || root.querySelector('button'); if (f) f.focus({ preventScroll: true }); });
    return { root, card, close, done };
  }
  const announce = s => ui.announce(s);
  /** A character portrait as a canvas element (DOM screens, the Builder preview). */
  function portrait(spec, o = {}) {
    const px = o.size || 160, dpr = Math.min(2, kit.win.devicePixelRatio || 1);
    const c = kit.portraitCanvas(spec || kit.meSpec(), Math.round(px * dpr), o.mood);
    c.className = 'ok-portrait'; c.style.height = px + 'px'; c.style.width = Math.round(px * c.width / c.height) + 'px';
    c.setAttribute('aria-hidden', 'true');
    return c;
  }
  const S = {
    portrait,
    /** title({title, subtitle, hero, heroSize, brand}) -> Promise. The block sits above the horizon so the world's cast
     *  stays in view; the title is a sticker (Ink outline, Cream rim, backOut pop) in the same family as the art. */
    title(o = {}) {
      const m = modal('title-screen', { bare: true, scrim: false, pause: o.pause === true });   // the world stays alive behind the title
      const block = el('div', 'ok-title-block'); m.root.appendChild(block);
      if (o.brand !== false) { const b = el('div', 'ok-brand', WORDMARK); b.setAttribute('dir', 'ltr'); block.appendChild(b); }
      // the game's hero stands big in the bottom-start corner of the scene (about a third of the screen's height)
      if (o.hero !== false) { const w = el('div', 'ok-title-hero'), W = kit.win; w.appendChild(portrait(o.hero, { size: o.heroSize || Math.round(Math.min(W.innerHeight * 0.4, W.innerWidth * (W.innerHeight > W.innerWidth ? 0.46 : 0.36))), mood: 'cheer' })); m.root.appendChild(w); }
      const h = el('h1', 'ok-h1'), words = String(o.title || '').split(/(\s+)/), hue = TITLE_HUES[o.titleHue] || TITLE_HUES.spark; h.id = 'ok-t-' + (++uid); h.dir = textDir(o.title || '');
      h.style.setProperty('--ok-t1', hue[0]); h.style.setProperty('--ok-t2', hue[1]); if (words.length === 3) h.classList.add('ok-stack');
      words.forEach((w, i) => { if (/^\s+$/.test(w)) h.appendChild(doc.createTextNode(w)); else { const s = el('span', 'ok-title-word'), f = txt('i', '', w); s.appendChild(f); s.setAttribute('data-w', w); s.style.animationDelay = (i * 70) + 'ms'; h.appendChild(s); } });
      m.root.setAttribute('aria-labelledby', h.id); block.appendChild(h);
      if (o.badge && o.badge.nodeType) { const bd = el('div', 'ok-title-badge'); bd.setAttribute('aria-hidden', 'true'); bd.appendChild(o.badge); block.appendChild(bd); }   // the game's motif (a pie, a letter) under the lockup
      if (o.subtitle) block.appendChild(gtxt('p', 'ok-p', o.subtitle));
      const play = btn(T('play'), 'hot', () => { kit.sfx('whoosh'); m.close(); if (o.play) o.play(); }, { big: true, icon: icon('play') });
      play.setAttribute('data-ok-focus', '');
      const cta = el('div', 'ok-cta'); cta.appendChild(play); block.appendChild(cta);
      const corner = el('div', 'ok-corner'); corner.appendChild(btn(T('settings'), 'icon', () => S.settings(), { icon: icon('settings') })); m.root.appendChild(corner);
      return m.done;
    },
    howTo(cards = []) {
      const m = modal('howto'); m.card.appendChild(txt('h2', 'ok-h2', T('howTo')));
      const g = el('div', 'ok-cards');
      cards.slice(0, 3).forEach((c, i) => { const d = el('div', 'ok-howcard', icon(c.icon || 'tap')); d.appendChild(gtxt('span', '', c.text || '')); d.style.animationDelay = (i * 90) + 'ms'; g.appendChild(d); });
      m.card.appendChild(g);
      const go = btn(T('go'), 'hot', () => m.close(), { big: true }); go.setAttribute('data-ok-focus', ''); m.card.appendChild(go);
      return m.done;
    },
    countdown(n = 3) {
      const root = el('div', 'ok-count'); root.setAttribute('aria-live', 'assertive'); ui.mount().appendChild(root);
      return new Promise(res => {
        const tick = i => {
          root.innerHTML = ''; const b = txt('b', i ? '' : 'ok-go', i ? kit.i18n.num(i) : T('go')); root.appendChild(b);
          kit.sfx('count', { pitch: i ? 1 : 1.5 });
          later(i ? 700 : 600, () => { if (i) tick(i - 1); else { root.remove(); res(); } });
        };
        tick(Math.max(0, n | 0));
      });
    },
    pause() {
      let m;
      const pick = v => () => m.close(v);
      m = modal('pause', { onEscape: pick('resume') });
      m.card.appendChild(txt('h2', 'ok-h2', T('pause')));
      const c = el('div', 'ok-col');
      const r = btn(T('resume'), 'go', pick('resume'), { big: true, icon: icon('play') }); r.setAttribute('data-ok-focus', '');
      c.append(r, btn(T('restart'), 'quiet', pick('restart'), { icon: icon('restart') }), btn(T('settings'), 'quiet', () => S.settings(), { icon: icon('settings') }), btn(T('quit'), 'quiet', pick('quit'), { icon: icon('quit') }));
      m.card.appendChild(c);
      // sound on/off lives here too (on phones the HUD has one menu button, not two)
      const row = el('div', 'ok-srow'); row.appendChild(txt('span', '', T('sound')));
      const sw = el('button', 'ok-switch'); sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-label', T('sound')); sw.setAttribute('aria-checked', String(!kit.audio.muted));
      sw.addEventListener('click', () => { kit.audio.setMuted(!kit.audio.muted); sw.setAttribute('aria-checked', String(!kit.audio.muted)); kit.sfx('select'); kit.emit('sound', !kit.audio.muted); });
      row.appendChild(sw); c.appendChild(row);
      if (stage()) stage().transition();
      return m.done;
    },
    win(o = {}) {
      const stars = Math.max(0, Math.min(3, o.stars == null ? 3 : o.stars | 0)), score = +o.score || 0, best = o.best != null ? +o.best : null;
      const m = modal('win', { pause: o.pause !== false });
      if (o.hero !== false) m.card.appendChild(portrait(o.hero, { size: 156, mood: 'cheer' }));
      m.card.appendChild(gtxt('h2', 'ok-h2', o.title || T('youWon')));
      const row = el('div', 'ok-sparks'); row.setAttribute('role', 'img'); row.setAttribute('aria-label', T('sparks', { n: stars }));
      const slots = [0, 1, 2].map(() => { const s = el('span', 'ok-slot', icon('spark')); row.appendChild(s); return s; });
      m.card.appendChild(row);
      const sc = txt('div', 'ok-score', kit.i18n.num(0)); m.card.appendChild(sc);
      const newBest = best != null && score > best;
      if (best != null) m.card.appendChild(txt('div', 'ok-best', T('best') + ' ' + kit.i18n.num(Math.max(best, score))));
      // next: false (a single level, the last level): "Play again" is the big, focused button and there is no Next
      const r = el('div', 'ok-row');
      if (o.next === false) { const again = btn(T('playAgain'), 'hot', () => m.close('again'), { big: true, icon: icon('restart') }); again.setAttribute('data-ok-focus', ''); r.append(again); }
      else { const again = btn(T('playAgain'), 'quiet', () => m.close('again'), { icon: icon('restart') }), next = btn(T('next'), 'hot', () => m.close('next'), { big: true, icon: icon('next') }); next.setAttribute('data-ok-focus', ''); r.append(again, next); }
      m.card.appendChild(r);
      const roll = { v: 0 }; kit.loop.ui.tween(roll, { v: score }, { ms: reduced() ? 1 : 900, ease: 'cubicOut', onUpdate: () => { sc.textContent = kit.i18n.num(Math.round(roll.v)); } }).then(() => { sc.textContent = kit.i18n.num(score); });
      slots.forEach((s, i) => { if (i < stars) later(350 + i * 380, () => { s.classList.add('ok-on'); kit.sfx('spark', { pitch: 1 + i * 0.12 }); }); });
      later(350 + stars * 380, () => {
        if (newBest) { const b = el('div', 'ok-badge', icon('spark')); b.appendChild(doc.createTextNode(T('newBest'))); sc.after(b); kit.sfx('levelup'); }
        row.classList.add('ok-lit');
        if (!reduced() && kit.celebrate) kit.celebrate(m.root);   // the dress pack: confetti behind the card (never over its text)
        const s = stage(); if (s && !reduced()) s.burst('confetti', s.camera.x, s.camera.y - s.view.vh * 0.45, { w: s.view.vw * 0.8 }); kit.sfx('win');
      });
      announce((o.title || T('youWon')) + ' ' + T('sparks', { n: stars }));
      return m.done;
    },
    tryAgain(o = {}) {
      const m = modal('try', { pause: o.pause !== false });
      let pic = null;
      if (o.hero !== false) { pic = el('div', ''); pic.appendChild(portrait(o.hero, { size: 120, mood: 'sad' })); m.card.appendChild(pic); later(900, () => { pic.innerHTML = ''; pic.appendChild(portrait(o.hero, { size: 120, mood: 'cheer' })); }); }
      m.card.appendChild(txt('h2', 'ok-h2', o.title || T('soClose')));
      if (o.say) m.card.appendChild(gtxt('p', 'ok-p', o.say));
      if (o.score != null) m.card.appendChild(txt('div', 'ok-score', kit.i18n.num(+o.score || 0)));
      if (o.best != null) m.card.appendChild(txt('div', 'ok-best', T('best') + ' ' + kit.i18n.num(+o.best || 0)));
      const b = btn(T('tryAgain'), 'hot', () => m.close('again'), { big: true, icon: icon('restart') }); b.setAttribute('data-ok-focus', ''); m.card.appendChild(b);
      announce(o.title || T('soClose'));
      return m.done;
    },
    settings() {
      const m = modal('settings', { onEscape: () => m.close() });
      m.card.classList.add('ok-set');
      m.card.appendChild(txt('h2', 'ok-h2', T('settings')));
      const set = kit.settings, pct = n => kit.i18n.num(n, { style: 'percent' });
      const row = (label, ctl) => { const r = el('div', 'ok-srow'); r.appendChild(txt('span', '', label)); r.appendChild(ctl); m.card.appendChild(r); };
      const seg = (key, opts) => { const s = el('div', 'ok-seg'); s.setAttribute('role', 'group'); opts.forEach(([v, l]) => { const b = el('button'); b.type = 'button'; b.textContent = l; b.setAttribute('aria-pressed', String(set.get(key) === v)); b.addEventListener('click', () => { set.patch({ [key]: v }); [...s.children].forEach((c, j) => c.setAttribute('aria-pressed', String(opts[j][0] === set.get(key)))); kit.sfx('select'); }); s.appendChild(b); }); return s; };
      const sw = (key, label) => { const b = el('button', 'ok-switch'); b.type = 'button'; b.setAttribute('role', 'switch'); b.setAttribute('aria-label', label); b.setAttribute('aria-checked', String(!!set.get(key))); b.addEventListener('click', () => { set.patch({ [key]: !set.get(key) }); b.setAttribute('aria-checked', String(!!set.get(key))); kit.sfx('select'); }); return b; };
      row(T('motion'), seg('motion', [['auto', T('motionAuto')], ['reduce', T('motionReduce')], ['full', T('motionFull')]]));
      row(T('music'), sw('music', T('music')));
      row(T('captions'), sw('captions', T('captions')));
      row(T('readAloud'), sw('readAloud', T('readAloud')));
      row(T('textSize'), seg('textSize', [[1, pct(1)], [1.25, pct(1.25)], [1.5, pct(1.5)]]));
      row(T('speed'), seg('speed', [[0.5, pct(0.5)], [0.75, pct(0.75)], [1, pct(1)]]));
      row(T('assist'), seg('assist', [['none', T('assistNone')], ['hearts', T('assistHearts')], ['nofail', T('assistNofail')]]));
      row(T('contrast'), sw('contrast', T('contrast')));
      row(T('colorCues'), sw('cvd', T('colorCues')));
      row(T('leftHanded'), sw('leftHanded', T('leftHanded')));
      row(T('graphics'), seg('graphics', [['auto', T('gfxAuto')], ['simple', T('gfxSimple')], ['fancy', T('gfxFancy')]]));
      const c = btn(T('close'), 'go', () => m.close(), { big: true, icon: icon('check') }); c.setAttribute('data-ok-focus', ''); m.card.appendChild(c);
      return m.done.then(() => { const s = stage(); if (s) s.transition(); });
    },
    /** ask({q, a (or answer), choices, hint, tries = 2, who, index}) -> Promise<boolean>. Pauses the game while open.
     *  a / answer is the right VALUE (index: n names the right tile instead). choices: the tiles (2-4), or a number of
     *  tiles to make from a numeric answer. A first miss shows the hint and lets the player try again (the right tile is
     *  never pre-marked); only the last miss reveals the answer. Resolves true when answered right on any try.
     *  who: the entity asking (shown in the card, kept clear of the scrim). Rejects (with a warning) if the answer is
     *  not one of the choices. */
    ask(q = {}) {
      const want = q.a != null ? q.a : q.answer;
      let choices = q.choices;
      if (typeof choices === 'number' || choices == null) choices = distractors(want, typeof choices === 'number' ? choices : 4, String(q.q || q.question || ''));
      choices = [].concat(choices).slice(0, 4).map(String);
      let ans = q.index != null ? q.index | 0 : choices.indexOf(String(want));
      if (!(ans >= 0 && ans < choices.length)) {
        const msg = `ui.ask: the answer ${JSON.stringify(want != null ? want : q.index)} is not one of the choices ${JSON.stringify(choices)} (give the right value as a: or answer:, or its tile as index:)`;
        kit.warn(msg); return Promise.reject(new Error(msg));
      }
      const tries = Math.max(1, Math.min(choices.length - 1, q.tries == null ? 2 : q.tries | 0));
      let done = false, misses = 0;
      const m = modal('ask', { onKey: e => { const n = +e.key; if (n >= 1 && n <= tiles.length) tiles[n - 1].click(); } });
      const who = q.who && q.who.stage ? q.who : null;
      if (who) {
        if (who.spec || who.charB) { const a = el('div', 'ok-asker'); a.appendChild(portrait(who.spec || who.charB.spec, { size: 92, mood: 'thinking' })); m.card.prepend(a); }
        // the asker stays clear of the scrim: a soft hole around them (in the scrim layer only, never the card), and the
        // card moves to the other side (wide screens) or to the top (phones)
        const s = stage();
        if (s && s.fit) {
          const p = s.camera.toScreen({ x: who.x, y: who.y - who.size * 0.55 }), x = s.fit.offX + p.x * s.fit.k, y = s.fit.offY + p.y * s.fit.k, r = Math.max(70, who.size * s.fit.k * s.camera.effZoom * 0.75);
          const hole = `radial-gradient(circle at ${Math.round(x)}px ${Math.round(y)}px, transparent ${Math.round(r)}px, #000 ${Math.round(r * 1.5)}px)`;
          const layer = el('div', 'ok-scrimlayer'); layer.style.webkitMaskImage = hole; layer.style.maskImage = hole;
          m.root.classList.remove('ok-scrim'); m.root.prepend(layer);
          if (kit.win.innerWidth >= 900) m.root.classList.add(x > kit.win.innerWidth / 2 ? 'ok-side-start' : 'ok-side-end');
          else if (y > kit.win.innerHeight * 0.45) m.root.classList.add('ok-top');
        }
      }
      const qe = gtxt('div', 'ok-q', q.q || q.question || ''); qe.id = 'ok-q-' + (++uid); m.root.setAttribute('aria-labelledby', qe.id); m.card.appendChild(qe);
      const grid = el('div', 'ok-tiles'); m.card.appendChild(grid);
      const mark = (t, ok) => { const s = el('span', 'ok-mark', icon(ok ? 'check' : 'cross', { stroke: 3.2 })); t.appendChild(s); };
      let hintShown = false;
      const showHint = () => { if (hintShown || !q.hint) return; hintShown = true; const h = el('div', 'ok-hint', icon('hint')); h.appendChild(gtxt('span', '', q.hint)); m.card.appendChild(h); };
      const tiles = choices.map((c, i) => {
        const t = el('button', 'ok-tile'); t.type = 'button'; t.setAttribute('aria-label', c);
        t.appendChild(txt('span', 'ok-key', kit.i18n.num(i + 1))); t.appendChild(gtxt('span', '', c));
        t.addEventListener('click', () => {
          if (done || t.disabled) return; const right = i === ans;
          if (right) {
            done = true; tiles.forEach(x => x.setAttribute('aria-disabled', 'true'));
            t.classList.add('ok-right'); mark(t, true); S.banner('correct'); kit.sfx('correct'); const s = stage(); if (s) s.burst('sparkle', s.camera.x, s.camera.y, { n: 18 });
            later(900, () => m.close(true)); return;
          }
          misses++; t.classList.add('ok-bad'); mark(t, false); t.disabled = true; t.setAttribute('aria-disabled', 'true'); kit.sfx('wrong');
          if (misses < tries) {   // a hint and another go: nothing gives the answer away yet
            S.banner('wrong', null, T('tryOnce')); showHint();
            const next = tiles.find(x => !x.disabled); if (next) next.focus({ preventScroll: true });
            return;
          }
          done = true; tiles.forEach(x => x.setAttribute('aria-disabled', 'true'));
          const good = tiles[ans]; if (good) { good.classList.add('ok-right'); mark(good, true); }
          S.banner('wrong', T('answerIs', { a: (textDir(choices[ans]) === 'ltr' && kit.i18n.dir === 'rtl' ? '\u2066' + choices[ans] + '\u2069' : choices[ans]) })); showHint();
          later(1900, () => m.close(false));
        });
        grid.appendChild(t); return t;
      });
      if (tiles[0]) tiles[0].setAttribute('data-ok-focus', '');
      return m.done;
    },
    /** banner('correct' | 'wrong', reason?, text?): "Correct!" / "Not quite." then the reason (a string key or text; maths
     *  keeps reading left to right in Arabic and Hebrew), or text alone in place of both. It drops into the banner band
     *  under the HUD (games keep their own pieces below var(--ok-safe-top)); while the quiz card is open it shows inside
     *  the card, under the answers, so it never covers the question. */
    banner(kind, reason, text) {
      const ok = kind !== 'wrong';
      for (const old of ui.mount().querySelectorAll('.ok-banner')) old.remove();
      const b = el('div', 'ok-banner ok-' + (ok ? 'correct' : 'wrong'));
      b.setAttribute('role', 'status');
      b.appendChild(el('span', 'ok-mark', icon(ok ? 'check' : 'cross', { stroke: 3.2 })));
      const words = el('span', '');
      const iso = s => { const i = doc.createElement('bdi'); i.textContent = String(s); i.dir = textDir(s); return i; };
      if (text) words.appendChild(iso(text));
      else {
        words.appendChild(doc.createTextNode(ok ? T('correct') : T('wrong')));
        if (reason != null && reason !== '') { words.appendChild(doc.createTextNode(' ')); words.appendChild(iso(kit.i18n.has(reason) ? T(reason) : reason)); }
      }
      b.appendChild(words);
      const asking = [...ui.mount().querySelectorAll('.ok-ask')].pop(), card = asking && asking.querySelector('.ok-card');
      if (card) { b.classList.add('ok-inline'); card.appendChild(b); } else ui.mount().appendChild(b);
      announce(b.textContent);
      later(ok ? 1400 : 2200, () => b.remove());
      return b;
    },
    /** bubble(entity | {x, y}, textOrKey, {portrait, readAloud, ms}) -> Promise (resolves when tapped away). */
    bubble(at, textOrKey, o = {}) {
      // a hyphenated word never splits across lines (non-breaking hyphen): "times-table" stays whole for young readers
      const text = (kit.i18n.has(textOrKey) ? kit.i18n.t(textOrKey, o.vars) : String(textOrKey)).replace(/(\p{L})-(?=\p{L})/gu, '$1\u2011');
      const b = el('div', 'ok-bubble'); b.setAttribute('role', 'dialog'); b.tabIndex = 0;
      if (o.portrait) b.appendChild(portrait(o.portrait, { size: 56, mood: 'happy' }));
      const t = el('div', 'ok-txt'); t.dir = textDir(text); b.appendChild(t); b.appendChild(el('span', 'ok-more', icon('down')));
      t.setAttribute('aria-label', text);
      ui.mount().appendChild(b);
      const place = () => {
        const s = stage(); let x = innerW() / 2, y = innerH() * 0.4;
        if (s && s.fit) { const w = at && at.x != null ? at : { x: 0, y: 0 }; const top = w.size ? { x: w.x, y: w.y - w.size * 1.18 } : w; const p = s.camera.toScreen(top); x = s.fit.offX + p.x * s.fit.k; y = s.fit.offY + p.y * s.fit.k; }
        const bw = b.offsetWidth, bh = b.offsetHeight, W = innerW();
        // never cover a pickup, a letter block or another face: the cast and pickups on screen (and any element the
        // game marks data-ok-keep) are kept clear. Try centred, then shifted left or right, then higher.
        const keep = [];
        if (s && s.fit) for (const e of s.entities) {
          if (e.dead || e.taken || e === at || e.layer !== Z.actors || e.visible === false) continue;
          const p = s.camera.toScreen({ x: e.x, y: e.y - e.size * 0.5 }), cx = s.fit.offX + p.x * s.fit.k, cy = s.fit.offY + p.y * s.fit.k, r = e.size * 0.55 * s.fit.k * (s.camera.effZoom || 1);
          if (cx > -r && cx < W + r) keep.push([cx - r, cy - r, cx + r, cy + r]);
        }
        if (doc.querySelectorAll) for (const k of doc.querySelectorAll('[data-ok-keep]')) { const q = k.getBoundingClientRect(); keep.push([q.left, q.top, q.right, q.bottom]); }
        const clampL = l => Math.max(8, Math.min(W - bw - 8, l)), hits = (l, t) => keep.reduce((n, k) => n + (l < k[2] && l + bw > k[0] && t < k[3] && t + bh + 18 > k[1] ? 1 : 0), 0);
        const top0 = Math.max(8, y - bh - 30), tries = [[x - bw / 2, top0], [x - bw + 40, top0], [x - 40, top0], [x - bw / 2, Math.max(8, top0 - bh * 0.6)], [x - bw + 40, Math.max(8, top0 - bh * 0.6)], [x - 40, Math.max(8, top0 - bh * 0.6)]];
        let best = null;
        for (const [l0, t] of tries) { const l = clampL(l0), n = hits(l, t); if (!best || n < best[2]) best = [l, t, n]; if (!n) break; }
        const left = best[0];
        b.style.left = left + 'px'; b.style.top = best[1] + 'px';
        b.style.setProperty('--ok-tx', Math.max(24, Math.min(bw - 24, x - left)) + 'px');
      };
      const innerW = () => kit.win.innerWidth, innerH = () => kit.win.innerHeight;
      const units = kit.i18n.units(text); let i = 0, stop = null;
      const full = () => { if (stop) stop(); stop = null; t.textContent = text; i = units.length; };
      if (reduced()) full(); else { stop = kit.loop.ui.every(28, () => { i++; t.textContent = units.slice(0, i).join(''); place(); if (i >= units.length) full(); }); }
      place(); const off = kit.loop.ui.every(100, place);
      if (o.readAloud !== false) kit.say(text, { who: at && at.state ? at : null });
      announce(text);
      return new Promise(res => {
        const go = () => { if (i < units.length) { full(); return; } off(); b.remove(); res(); };
        b.addEventListener('click', go); b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        if (o.ms) later(o.ms, () => { full(); go(); });
      });
    },
    /** dialog({title, text, buttons:[{label, kind, value}], portrait}) -> Promise<value> */
    dialog(o = {}) {
      const m = modal('dialog', { onEscape: () => m.close(null) });
      if (o.portrait) m.card.appendChild(portrait(o.portrait, { size: 110, mood: o.mood || 'happy' }));
      if (o.title) m.card.appendChild(gtxt('h2', 'ok-h2', o.title));
      if (o.text) m.card.appendChild(gtxt('p', 'ok-p', o.text));
      const r = el('div', 'ok-row');
      (o.buttons || [{ label: T('close'), kind: 'go', value: true }]).forEach((d, i, a) => { const b = btn(d.label, d.kind || (i === a.length - 1 ? 'hot' : 'quiet'), () => m.close(d.value !== undefined ? d.value : d.label), d.icon ? { icon: icon(d.icon) } : {}); if (i === a.length - 1) b.setAttribute('data-ok-focus', ''); r.appendChild(b); });
      m.card.appendChild(r);
      return m.done;
    },
    /** hud(['score', 'lives:3', 'timer:60', 'progress', 'combo', 'count:spark'], {lives, countIcon, total, pause,
     *  sound, onPause}) -> live widgets. 'name:arg' sets the hearts, the seconds (the timer starts at once) or the
     *  count's icon. P / Esc / Start and the pause button open the pause screen; onPause(result) and
     *  Oomba.on('pause', fn) get 'resume' | 'restart' | 'quit'. Pause and sound sit at the end edge (one menu on phones). */
    hud(widgets = ['score'], o = {}) {
      const old = ui.mount().querySelector('.ok-hud'); if (old) old.remove();
      const root = el('div', 'ok-hud'), start = el('div', 'ok-hud-start'), end = el('div', 'ok-hud-end');
      root.append(start, end); ui.mount().appendChild(root);
      const H = { root };
      const roll = (node, from, to) => { const r = { v: from }; kit.loop.ui.tween(r, { v: to }, { ms: reduced() ? 1 : 380, ease: 'cubicOut', onUpdate: () => { node.textContent = kit.i18n.num(Math.round(r.v)); } }).then(() => { node.textContent = kit.i18n.num(to); }); };
      const KNOWN = ['score', 'lives', 'timer', 'progress', 'combo', 'count'];
      let startTimer = 0;
      for (const spec of [].concat(widgets)) {
        const [w, arg] = String(spec).split(':').map(x => x.trim());
        if (!KNOWN.includes(w)) { kit.warn(`ui.hud: unknown widget "${spec}" (use ${KNOWN.join(', ')}; lives:3, timer:60, count:spark)`); continue; }
        if (w === 'score') {
          const p = el('div', 'ok-pill ok-scorepill', `<span class="ok-sp">${icon('spark')}</span>`); const n = txt('span', 'ok-num', kit.i18n.num(0)); p.appendChild(n); p.setAttribute('aria-label', T('score')); start.appendChild(p);
          H.score = { value: 0, set(v) { const f = this.value; this.value = +v || 0; roll(n, f, this.value); }, add(d = 1) { this.set(this.value + d); p.classList.remove('ok-bump'); void p.offsetWidth; p.classList.add('ok-bump'); } };
        } else if (w === 'lives') {
          const p = el('div', 'ok-pill ok-hearts'); p.setAttribute('role', 'img'); start.appendChild(p);
          const max = Math.max(1, Math.min(9, (arg ? +arg : o.lives) || 3));
          const draw = () => { p.innerHTML = ''; for (let i = 0; i < Math.max(max, H.lives.value); i++) p.insertAdjacentHTML('beforeend', icon(i < H.lives.value ? 'heart' : 'heart-off')); [...p.children].forEach((s, i) => s.classList.toggle('ok-lost', i >= H.lives.value)); p.setAttribute('aria-label', T('lives') + ' ' + kit.i18n.num(H.lives.value)); };
          H.lives = { value: max, max, lose() { if (this.value <= 0) return 0; this.value--; draw(); const h = p.children[this.value]; if (h) h.classList.add('ok-pop'); return this.value; }, gain() { this.value++; draw(); const h = p.children[this.value - 1]; if (h) h.classList.add('ok-pop'); return this.value; }, set(v) { this.value = Math.max(0, v | 0); draw(); } };
          draw();
        } else if (w === 'timer') {
          // a clock face: the mint pie drains clockwise and the hand sweeps with it (coral in the last 10 s)
          const p = el('div', 'ok-pill ok-timer', '<svg class="ok-clock" viewBox="-16 -16 32 32" aria-hidden="true"><circle class="ok-face" r="13"/><path class="ok-pie"/><path class="ok-hand"/><path class="ok-knob" d="M-3-17.5h6"/></svg>');
          const n = txt('span', 'ok-num', '0'); p.appendChild(n); p.setAttribute('aria-label', T('time')); start.appendChild(p);
          const pie = p.querySelector('.ok-pie'), hand = p.querySelector('.ok-hand'); let stopT = null;
          const face = f => { const a = Math.PI * 2 * Math.max(0, Math.min(1, f)), x = 11.6 * Math.sin(a), y = -11.6 * Math.cos(a);
            pie.setAttribute('d', f >= 0.999 ? 'M0-11.6a11.6 11.6 0 1 1 0 23.2a11.6 11.6 0 1 1 0-23.2z' : f <= 0.001 ? '' : `M0 0V-11.6A11.6 11.6 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}z`);
            hand.setAttribute('d', `M0 0L${(x * 0.72).toFixed(2)} ${(y * 0.72).toFixed(2)}`); };
          H.timer = { left: 0, total: 0, start(s, onEnd) { this.stop(); this.total = this.left = Math.max(0, +s || 0); const show = () => { n.textContent = kit.i18n.num(Math.ceil(this.left)); face(this.left / (this.total || 1)); p.classList.toggle('ok-low', this.left <= 10 && this.left > 0); }; show();
            stopT = kit.loop.tw.every(100, () => { this.left = Math.max(0, this.left - 0.1); show(); if (this.left <= 0) { this.stop(); if (onEnd) onEnd(); } }); },
            stop() { if (stopT) stopT(); stopT = null; p.classList.remove('ok-low'); } };
          face(1);
          if (arg) startTimer = +arg || 0;
        } else if (w === 'progress') {
          const p = el('div', 'ok-pill ok-progress', `<span class="ok-bar"><i></i></span><span class="ok-flag">${icon('flag')}</span>`); p.setAttribute('role', 'progressbar'); p.setAttribute('aria-valuemin', '0'); p.setAttribute('aria-valuemax', '100'); p.setAttribute('aria-label', T('level')); start.appendChild(p);
          const bar = p.querySelector('i'); H.progress = { value: 0, set(v) { this.value = Math.max(0, Math.min(1, +v || 0)); bar.style.width = (this.value * 100) + '%'; p.setAttribute('aria-valuenow', String(Math.round(this.value * 100))); } };
        } else if (w === 'combo') {
          // a small badge on the score counter (never a pill of its own: the phone HUD stays one row)
          const host = start.querySelector('.ok-scorepill') || start;
          const p = el('div', 'ok-combo'); p.hidden = true; p.dir = 'ltr'; host.appendChild(p);
          H.combo = { value: 0, bump() { this.value++; p.hidden = this.value < 2; p.textContent = '×' + kit.i18n.num(this.value); p.classList.remove('ok-bump'); void p.offsetWidth; p.classList.add('ok-bump'); return this.value; }, reset() { this.value = 0; p.hidden = true; } };
        } else if (w === 'count') {
          const p = el('div', 'ok-pill', icon(arg || o.countIcon || 'check')); const n = txt('span', 'ok-num', ''); p.appendChild(n); start.appendChild(p);
          H.count = { value: 0, total: o.total || 0, add(d = 1) { this.value += d; this.show(); }, set(v, total) { this.value = v; if (total != null) this.total = total; this.show(); }, show() { n.textContent = this.total ? kit.i18n.t('sparksOf', { n: this.value, total: this.total }) : kit.i18n.num(this.value); } };
          H.count.show();
        }
      }
      // pause: the button, P / Esc / Start (the kit polls the action) and a lost focus all open the same screen
      const openPause = async () => {
        if (!root.isConnected || open) return null;
        const v = await S.pause(); kit.emit('pause', v); if (o.onPause) { try { o.onPause(v); } catch (e) { kit.warn(e); } }
        return v;
      };
      if (o.pause !== false) { end.appendChild(btn(T('pause'), 'icon', openPause, { icon: icon('pause') })); kit.hudPause = openPause; H.pause = openPause; }
      if (o.sound !== false) { const b = btn(T('sound'), 'icon', () => { kit.audio.setMuted(!kit.audio.muted); b.innerHTML = icon(kit.audio.muted ? 'mute' : 'sound'); }, { icon: icon(kit.audio.muted ? 'mute' : 'sound') }); b.classList.add('ok-sound'); end.appendChild(b); }
      // removing the HUD (root.remove()) unhooks the pause key with it
      const stopWatch = kit.loop.ui.every(400, () => { if (root.isConnected) return; if (kit.hudPause === openPause) kit.hudPause = null; stopWatch(); });
      if (startTimer && H.timer) H.timer.start(startTimer);
      return H;
    },
    get open() { return open; },
    /** Close every open modal (each resolves undefined) and speech bubble. */
    closeAll() { for (const c of [...live]) c(); for (const b of ui.mount().querySelectorAll('.ok-bubble')) b.remove(); },
  };
  let uid = 0;
  return S;
}
