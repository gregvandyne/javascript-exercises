// The Remy stage for Oomba Breathe & Bend (/move): one inline SVG of Remy the Red Panda in a
// cloud-forest clearing, drawn once and posed entirely by CSS. The player (public/js/move.js) sets
// data-pose (intro, spark, mountain, tree, star, waterfall, butterfly, boat, cobra, rest) and
// data-seated on the stage; public/css/move.css holds every pose as settled transforms with slow
// transitions between them, so a reduced-motion frame is the same finished picture, just reached
// without the glide. The same markup is reused small, in a corner circle, for the seated version of
// a pose (always data-seated="1" there). No ids inside: the stage is on a page twice.
import { html } from './html.js';

export function remyStage(extraClass = '') {
  return html`<svg class="mv-art ${extraClass}" viewBox="0 0 400 300" role="img" aria-label="Remy the Red Panda" focusable="false">
  <rect class="sky" x="0" y="0" width="400" height="300" fill="#FFFDF2"/>
  <g class="sun"><circle cx="330" cy="52" r="21" fill="#FFD23F"/><g stroke="#FFD23F" stroke-width="4" stroke-linecap="round">
    <line x1="330" y1="18" x2="330" y2="26"/><line x1="330" y1="78" x2="330" y2="86"/><line x1="296" y1="52" x2="304" y2="52"/>
    <line x1="356" y1="52" x2="364" y2="52"/><line x1="306" y1="28" x2="312" y2="34"/><line x1="348" y1="70" x2="354" y2="76"/>
    <line x1="354" y1="28" x2="348" y2="34"/><line x1="312" y1="70" x2="306" y2="76"/></g></g>
  <polygon points="0,214 92,118 176,214" fill="#66C792" opacity="0.5"/>
  <polygon points="118,214 232,98 348,214" fill="#66C792" opacity="0.35"/>
  <g class="tree-l"><rect x="36" y="176" width="9" height="42" rx="4" fill="#A9743F"/><circle cx="40" cy="152" r="30" fill="#1F9D63" opacity="0.85"/><circle cx="62" cy="168" r="20" fill="#1F9D63" opacity="0.7"/></g>
  <g class="tree-r"><rect x="356" y="188" width="8" height="32" rx="4" fill="#A9743F"/><circle cx="360" cy="166" r="24" fill="#1F9D63" opacity="0.8"/></g>
  <ellipse cx="200" cy="264" rx="212" ry="34" fill="#BDE8CE"/>
  <ellipse class="mat" cx="200" cy="250" rx="88" ry="13" fill="#FFD23F" opacity="0.5"/>
  <g class="sparkstar" opacity="0">
    <circle class="trace" cx="292" cy="86" r="34" fill="none" stroke="#1F9D63" stroke-width="2.5" stroke-dasharray="5 7" stroke-linecap="round"/>
    <polygon points="292,62 299,78 316,79 303,90 307,106 292,97 277,106 281,90 268,79 285,78" fill="#FFD23F" stroke="#E8A90C" stroke-width="2" stroke-linejoin="round"/>
  </g>
  <g class="twinkles" opacity="0" fill="#FFD23F">
    <polygon points="96,120 100,130 110,131 102,137 104,147 96,141 88,147 90,137 82,131 92,130"/>
    <polygon points="312,140 315,148 323,149 317,154 319,162 312,157 305,162 307,154 301,149 309,148"/>
  </g>
  <g class="roots" opacity="0" stroke="#1F9D63" stroke-width="3.5" fill="none" stroke-linecap="round">
    <path d="M182,258 C176,266 168,268 162,272"/><path d="M200,260 C200,268 198,272 196,278"/><path d="M218,258 C224,266 232,268 238,272"/>
  </g>
  <g class="chair" opacity="0">
    <rect x="147" y="98" width="10" height="84" rx="5" fill="#A9743F"/>
    <rect x="243" y="98" width="10" height="84" rx="5" fill="#A9743F"/>
    <rect x="143" y="176" width="114" height="11" rx="5" fill="#A9743F"/>
    <rect x="151" y="187" width="8" height="56" rx="4" fill="#A9743F"/><rect x="241" y="187" width="8" height="56" rx="4" fill="#A9743F"/>
  </g>
  <g class="remy">
    <path d="M232,214 C288,226 308,196 292,166" stroke="#B34A1F" stroke-width="17" fill="none" stroke-linecap="round"/>
    <path d="M232,214 C288,226 308,196 292,166" stroke="#7E3410" stroke-width="17" fill="none" stroke-linecap="round" stroke-dasharray="5 16" opacity="0.5"/>
    <g class="torso">
      <ellipse cx="200" cy="190" rx="44" ry="46" fill="#C65D21"/>
      <ellipse cx="200" cy="204" rx="26" ry="30" fill="#FFF3DC"/>
      <g class="arm-l"><rect x="147" y="148" width="17" height="54" rx="8.5" fill="#B34A1F"/><circle cx="155" cy="202" r="9" fill="#7E3410"/></g>
      <g class="arm-r"><rect x="236" y="148" width="17" height="54" rx="8.5" fill="#B34A1F"/><circle cx="244" cy="202" r="9" fill="#7E3410"/></g>
      <g class="head">
        <circle cx="171" cy="95" r="13" fill="#B34A1F"/><circle cx="171" cy="95" r="6" fill="#FFF3DC"/>
        <circle cx="229" cy="95" r="13" fill="#B34A1F"/><circle cx="229" cy="95" r="6" fill="#FFF3DC"/>
        <circle cx="200" cy="118" r="36" fill="#C65D21"/>
        <ellipse cx="186" cy="105" rx="8" ry="5" fill="#FFF3DC"/><ellipse cx="214" cy="105" rx="8" ry="5" fill="#FFF3DC"/>
        <ellipse cx="200" cy="127" rx="24" ry="19" fill="#FFF3DC"/>
        <circle class="eye" cx="188" cy="116" r="3.4" fill="#141414"/><circle class="eye" cx="212" cy="116" r="3.4" fill="#141414"/>
        <ellipse cx="200" cy="124" rx="4.5" ry="3.2" fill="#7E3410"/>
        <path d="M193,132 C197,136 203,136 207,132" stroke="#7E3410" stroke-width="2" fill="none" stroke-linecap="round"/>
        <ellipse cx="176" cy="128" rx="6" ry="4" fill="#F2A65A" opacity="0.65"/><ellipse cx="224" cy="128" rx="6" ry="4" fill="#F2A65A" opacity="0.65"/>
      </g>
      <polygon points="177,146 223,146 200,169" fill="#1F9D63"/>
    </g>
    <g class="leg-l"><rect x="171" y="220" width="21" height="36" rx="10" fill="#A34A1C"/><ellipse cx="181" cy="257" rx="14" ry="6" fill="#7E3410"/></g>
    <g class="leg-r"><rect x="208" y="220" width="21" height="36" rx="10" fill="#A34A1C"/><ellipse cx="219" cy="257" rx="14" ry="6" fill="#7E3410"/></g>
    <g class="seated-feet" opacity="0"><ellipse cx="172" cy="252" rx="14" ry="7" fill="#7E3410"/><ellipse cx="228" cy="252" rx="14" ry="7" fill="#7E3410"/></g>
  </g>
</svg>`;
}
