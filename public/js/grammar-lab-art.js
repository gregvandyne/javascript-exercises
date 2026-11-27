// Grammar Lab's pictures and animations, drawn in code (no image files to fetch, no video, no sound).
//
// The pictures are SVG strings (art.*). Their theme colours are CSS custom properties with the light palette as the
// fallback (style="fill:var(--gl-paper,#FFFDF2)"), so the same markup is themed when it sits inside a .gla element on a
// page (public/css/grammar-lab-art.css maps --gl-* to the app's tokens, light and dark) and stays in the light palette
// as a stand-alone file (public/img/grammar-lab/*.svg, written by scripts/grammar-lab-art.js). Brand colours (Mint,
// Leaf, Spark, Ink) are the same in both themes, as in the logo.
//
// The course character is Oomba itself, built from the brand mark (server/views/brand.js): a Mint body, the two "o"s of
// the wordmark as its eyes, looking up at the Spark of an idea.
//
// The four animations (mountGreeting, mountWelcome, mountMastery, mountTapTip) each draw their scene in its END state
// and play Web Animations "from" effects over it, so:
//   - with prefers-reduced-motion (or { still: true }) nothing plays and the end state simply shows;
//   - when they finish, the scene is exactly the reduced-motion still;
//   - they never cover anything: the scene sits in the container it is mounted in, ignores pointer events (only the
//     tip's Replay button takes clicks), and never makes a sound.
// Each mount returns { root, finished, replay(), seek(ms), finish(), destroy() }. root carries data-gla-state="playing" | "done"
// and data-gla-motion="full" | "still".

const TOK = { paper: '#FFFDF2', bg: '#F4F1E6', soft: '#F9F6EB', hair: '#E2DDCB', line: '#141414', muted: '#5B584F', edge: '#8A8573', mintsoft: '#E1F1E1', sparksoft: '#FFF3C4' };
const BRAND = { ink: '#141414', cream: '#FFFDF2', mint: '#66C792', leaf: '#1F9D63', spark: '#FFD23F', gold: '#C99A00', pale: '#9EDDBA', deep: '#0F5A37' };
const FONT = "font-family:'Bricolage Grotesque',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

/** A colour: a theme token (var with its light fallback), a brand colour, or a literal. */
const c = k => (TOK[k] ? `var(--gl-${k},${TOK[k]})` : BRAND[k] || k);
/** A style attribute: fill, stroke and stroke width, plus anything else. */
const st = (f, s, w = 5, more = '') => `style="fill:${f ? c(f) : 'none'};${s ? `stroke:${c(s)};stroke-width:${w};` : ''}${more}"`;
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const txt = (x, y, size, s, { f = 'line', w = 800, a = 'middle', more = '', cls = '' } = {}) =>
  `<text${cls ? ` class="${cls}"` : ''} x="${x}" y="${y}" text-anchor="${a}" style="fill:${c(f)};font-size:${size}px;font-weight:${w};${FONT};${more}">${esc(s)}</text>`;
const ROUND = 'style="stroke-linejoin:round;stroke-linecap:round"';
let uid = 0;
const nid = p => `gl${p}${(++uid).toString(36)}`;

/** The brand spark (the four-pointed star of the logo, server/views/brand.js) centred on (x, y), r its half-height. */
export function sparkPath(x, y, r) {
  const k = 0.136 * r, n = v => +v.toFixed(2);
  return `M${n(x)} ${n(y - r)} Q${n(x + k)} ${n(y - k)} ${n(x + r)} ${n(y)} Q${n(x + k)} ${n(y + k)} ${n(x)} ${n(y + r)} Q${n(x - k)} ${n(y + k)} ${n(x - r)} ${n(y)} Q${n(x - k)} ${n(y - k)} ${n(x)} ${n(y - r)}Z`;
}
/** A five-pointed star centred on (x, y). */
export function starPath(x, y, R, ratio = 0.48) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? R * ratio : R, a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i ? 'L' : 'M'}${(x + r * Math.cos(a)).toFixed(2)} ${(y + r * Math.sin(a)).toFixed(2)}`;
  }
  return d + 'Z';
}
const wrap = (vb, inner, label) => `<svg viewBox="${vb}" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"'}><g ${ROUND}>${inner}</g></svg>`;

// ---------------------------------------------------------------- Oomba, the course character (viewBox 0 0 340 340)
// Geometry the animations rely on: the waving arm turns about its shoulder (268, 214); the hand is at (306, 144).
export const MASCOT = { w: 340, h: 340, shoulder: [268, 214], hand: [306, 144] };
const arm = d => `<path d="${d}" ${st(null, 'ink', 30)}/><path d="${d}" ${st(null, 'mint', 18)}/>`;
/** Oomba in its greeting pose, as SVG markup in a 340 x 340 box. */
export function mascotArt({ shadow = true } = {}) {
  return `${shadow ? `<ellipse cx="160" cy="328" rx="96" ry="9" ${st('hair')}/>` : ''}
<ellipse cx="116" cy="318" rx="30" ry="15" ${st('mint', 'ink', 6)}/><ellipse cx="204" cy="318" rx="30" ry="15" ${st('mint', 'ink', 6)}/>
${arm('M54 216 Q24 236 30 270')}
<g class="gla-m-arm" style="transform-origin:268px 214px">${arm('M268 214 Q300 198 306 146')}<circle cx="306" cy="144" r="17" ${st('mint', 'ink', 6)}/></g>
<rect x="40" y="78" width="240" height="240" rx="66" ${st('mint', 'ink', 6)}/>
<path d="M62 120 Q70 96 96 90" ${st(null, 'pale', 10)}/>
<ellipse cx="80" cy="240" rx="15" ry="9" ${st('spark', null, 0, 'opacity:.55')}/><ellipse cx="240" cy="240" rx="15" ry="9" ${st('spark', null, 0, 'opacity:.55')}/>
<g class="gla-m-eyes" style="transform-box:fill-box;transform-origin:center">
<circle cx="104" cy="178" r="36" ${st('cream', 'ink', 26)}/><circle cx="216" cy="178" r="36" ${st('cream', 'ink', 26)}/>
<circle cx="112" cy="170" r="13" ${st('ink')}/><circle cx="220" cy="167" r="13" ${st('ink')}/>
<circle cx="116" cy="166" r="4" ${st('cream')}/><circle cx="224" cy="163" r="4" ${st('cream')}/></g>
<path d="M138 250 Q160 268 182 250" ${st(null, 'ink', 8)}/>
<path class="gla-m-spark" style="fill:${BRAND.spark};stroke:${BRAND.ink};stroke-width:5;transform-box:fill-box;transform-origin:center" d="${sparkPath(262, 40, 28)}"/>`;
}

// ---------------------------------------------------------------- the welcome doorway (viewBox 0 0 480 320)
const FLOATERS = [
  { k: 'a', x: 116, y: 118, s: 38, f: 'leaf' }, { k: 'B', x: 368, y: 116, s: 40, f: 'line' }, { k: '?', x: 336, y: 62, s: 34, f: 'leaf' },
  { k: '!', x: 150, y: 58, s: 34, f: 'line' }, { k: ',', x: 424, y: 170, s: 44, f: 'line' }, { k: '&', x: 132, y: 200, s: 30, f: 'leaf' },
  { k: '*', x: 206, y: 36, r: 11 }, { k: '*', x: 286, y: 30, r: 9 }, { k: '*', x: 430, y: 76, r: 12 }, { k: '*', x: 54, y: 92, r: 9 }, { k: '*', x: 252, y: 58, r: 7 },
];
export const DOOR = { hinge: 190, center: [240, 200], floaters: FLOATERS };
/** The doorway, open, warm light spilling out, letters and stars floated out around it. */
export function doorwayArt() {
  const g = nid('d'), s = nid('s'), l = nid('l');
  const floaters = FLOATERS.map(p => `<g class="gla-w-float" data-x="${p.x}" data-y="${p.y}" style="transform-origin:${p.x}px ${p.y}px">${p.k === '*'
    ? `<path d="${starPath(p.x, p.y, p.r)}" ${st('spark', 'ink', 3)}/>`
    : txt(p.x, p.y + p.s * 0.35, p.s, p.k, { f: p.f })}</g>`).join('');
  return `<defs><radialGradient id="${g}" cx="50%" cy="55%" r="50%"><stop offset="0" stop-color="${BRAND.spark}" stop-opacity=".55"/><stop offset="1" stop-color="${BRAND.spark}" stop-opacity="0"/></radialGradient>
<radialGradient id="${l}" cx="50%" cy="62%" r="70%"><stop offset="0" stop-color="#FFFBE6"/><stop offset=".55" stop-color="#FFE68A"/><stop offset="1" stop-color="${BRAND.spark}"/></radialGradient>
<linearGradient id="${s}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BRAND.spark}" stop-opacity=".7"/><stop offset="1" stop-color="${BRAND.spark}" stop-opacity="0"/></linearGradient></defs>
<rect width="480" height="320" ${st('soft')}/>
<rect y="262" width="480" height="58" ${st('hair')}/><path d="M0 262 H480" ${st(null, 'line', 4)}/>
<g class="gla-w-glow" style="transform-origin:240px 190px"><ellipse cx="240" cy="186" rx="150" ry="150" fill="url(#${g})"/></g>
<g><rect x="34" y="214" width="44" height="48" rx="8" ${st('spark', 'line', 4)}/><path d="M56 214 Q38 176 46 160 M56 214 Q56 170 62 150 M56 214 Q76 182 80 168" ${st(null, 'leaf', 6)}/>
<rect x="388" y="214" width="58" height="48" rx="6" ${st('paper', 'line', 4)}/><rect x="396" y="222" width="42" height="9" rx="3" ${st('mint')}/><rect x="396" y="237" width="30" height="7" rx="3" ${st('hair')}/><rect x="396" y="249" width="36" height="7" rx="3" ${st('hair')}/></g>
<path d="M170 268 V140 A70 70 0 0 1 310 140 V268 Z" ${st('mint', 'line', 6)}/>
<path d="M190 262 V140 A50 50 0 0 1 290 140 V262 Z" ${st(`url(#${l})`, 'ink', 4)}/>
<path d="M240 100 V84 M214 106 L206 92 M266 106 L274 92" ${st(null, 'cream', 4, 'opacity:.9')}/>
<g class="gla-w-spill" style="transform-origin:240px 262px"><path d="M192 262 H290 L372 320 H118 Z" fill="url(#${s})"/></g>
<g class="gla-w-door" style="transform-origin:190px 200px;transform:scaleX(.16)">
<path d="M190 262 V140 A50 50 0 0 1 290 140 V262 Z" ${st('leaf', 'ink', 5, 'vector-effect:non-scaling-stroke')}/>
<path d="M204 156 A36 36 0 0 1 276 156 V192 H204 Z M204 206 H276 V248 H204 Z" ${st('deep', null, 0, 'opacity:.45')}/>
<circle cx="276" cy="210" r="6" ${st('spark', 'ink', 3, 'vector-effect:non-scaling-stroke')}/></g>
${floaters}`;
}

// ---------------------------------------------------------------- mastery: a star into a constellation (0 0 480 320)
const CON = [[246, 104], [298, 62], [354, 92], [404, 52], [448, 104], [404, 156]];
export const MASTERY = { stars: CON, slot: CON[5], mascotAt: [18, 152], mascotScale: 0.5 };
const handAt = () => [MASTERY.mascotAt[0] + MASCOT.hand[0] * MASTERY.mascotScale, MASTERY.mascotAt[1] + MASCOT.hand[1] * MASTERY.mascotScale];
/** The arc a tossed star flies along: a quadratic curve from the hand to the empty slot. */
export const starArc = () => { const [x0, y0] = handAt(), [x2, y2] = MASTERY.slot; return { p0: [x0, y0], p1: [(x0 + x2) / 2 + 10, 50], p2: [x2, y2] }; };
const DOTS = [[40, 40], [92, 22], [150, 64], [196, 30], [118, 118], [470, 22], [330, 22], [462, 200], [300, 150], [214, 170], [60, 160]];
/** mode 'scene': the animation's end (Oomba below, the star in its place). mode 'image': the star in flight, with its trail. */
export function masteryArt({ mode = 'image' } = {}) {
  const sky = nid('k'), scene = mode === 'scene';
  const { p0, p1, p2 } = starArc();
  const at = t => [0, 1].map(i => (1 - t) ** 2 * p0[i] + 2 * (1 - t) * t * p1[i] + t * t * p2[i]);
  const flyT = 0.6, [fx, fy] = at(flyT);
  const trail = Array.from({ length: 9 }, (_, i) => { const [x, y] = at(0.08 + i * 0.058); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2 + i * 0.5).toFixed(1)}" ${st('spark', null, 0, `opacity:${(0.25 + i * 0.07).toFixed(2)}`)}/>`; }).join('');
  const lines = CON.slice(0, 5).map((p, i) => (i < 4 ? `<path d="M${p[0]} ${p[1]} L${CON[i + 1][0]} ${CON[i + 1][1]}" ${st(null, 'line', 2.5, 'opacity:.5')}/>` : '')).join('');
  const last = `<path class="gla-ms-last" pathLength="1" stroke-dasharray="1" d="M${CON[4][0]} ${CON[4][1]} L${CON[5][0]} ${CON[5][1]}" ${st(null, 'line', 2.5, `opacity:.5;stroke-dashoffset:${scene ? 0 : 1}`)}/>`;
  const stars = CON.slice(0, 5).map(([x, y], i) => `<path class="gla-ms-twinkle" d="${starPath(x, y, i % 2 ? 11 : 13)}" ${st('spark', 'ink', 3, 'transform-box:fill-box;transform-origin:center')}/>`).join('');
  const [sx, sy] = MASTERY.slot;
  const slot = `<circle class="gla-ms-slot" cx="${sx}" cy="${sy}" r="19" ${st(null, 'line', 2.5, `stroke-dasharray:5 6;opacity:${scene ? 0 : 0.6}`)}/>`;
  const big = (x, y) => `<path d="${starPath(x, y, 21)}" ${st('spark', 'ink', 4)}/><path d="${sparkPath(x - 6, y - 4, 5)}" ${st('cream')}/>`;
  const burst = Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4, r0 = 28, r1 = 40; return `M${(sx + r0 * Math.cos(a)).toFixed(1)} ${(sy + r0 * Math.sin(a)).toFixed(1)} L${(sx + r1 * Math.cos(a)).toFixed(1)} ${(sy + r1 * Math.sin(a)).toFixed(1)}`; }).join(' ');
  return `<defs><linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${c('mintsoft')}"/><stop offset="1" style="stop-color:${c('sparksoft')}"/></linearGradient></defs>
<rect width="480" height="320" fill="url(#${sky})"/>
${DOTS.map(([x, y], i) => `<path d="${sparkPath(x, y, i % 3 ? 4 : 6)}" ${st(i % 2 ? 'leaf' : 'spark', null, 0, 'opacity:.7')}/>`).join('')}
<path d="M0 272 Q120 236 240 262 T480 250 V320 H0 Z" ${st('mint', 'line', 4)}/><path d="M0 300 Q160 280 300 298 T480 292 V320 H0 Z" ${st('leaf', null, 0, 'opacity:.55')}/>
${lines}${last}${stars}${slot}
${scene
    ? `<g class="gla-ms-burst" style="opacity:0;transform-origin:${sx}px ${sy}px"><path d="${burst}" ${st(null, 'spark', 5)}/></g>
<g transform="translate(${MASTERY.mascotAt[0]} ${MASTERY.mascotAt[1]}) scale(${MASTERY.mascotScale})">${mascotArt({ shadow: false })}</g>
<g class="gla-ms-fly" style="transform-origin:${sx}px ${sy}px">${big(sx, sy)}</g>`
    : `${trail}<g transform="rotate(-18 ${fx.toFixed(1)} ${fy.toFixed(1)})">${big(fx, fy)}</g>
<g transform="translate(36 196) scale(.36)">${mascotArt({ shadow: false })}</g>`}`;
}

// ---------------------------------------------------------------- the double-tap tip
/** A cartoon pointing hand (no skin tone: a cream glove with a Mint cuff), fingertip at (25, 2), in an 80 x 110 box. */
export const FINGER = { w: 80, h: 110, tip: [25, 2] };
export function fingerArt() {
  return `<rect x="56" y="48" width="22" height="34" rx="11" ${st('cream', 'ink', 4)}/><rect x="40" y="44" width="22" height="38" rx="11" ${st('cream', 'ink', 4)}/>
<rect x="12" y="2" width="27" height="70" rx="13.5" ${st('cream', 'ink', 4)}/>
<path d="M10 60 Q2 70 8 84 Q14 102 40 104 Q70 104 76 84 L78 66 Q70 62 60 66 L12 62 Z" ${st('cream', 'ink', 4)}/>
<path d="M18 60 Q6 58 4 70 Q6 80 16 82" ${st('cream', 'ink', 4)}/>
<path d="M20 14 Q20 8 25 7" ${st(null, 'hair', 3)}/>
<rect x="16" y="96" width="58" height="14" rx="5" ${st('mint', 'ink', 4)}/>`;
}
/** The still picture of the tip: a sentence, the highlighted word tapped, its definition popped up above it. */
export function tapTipArt({ before = 'The', word = 'fluffy', after = 'cat naps.', def = 'soft and full of fur' } = {}) {
  return `<rect width="480" height="320" rx="0" ${st('bg')}/>
<rect x="24" y="140" width="432" height="108" rx="22" ${st('paper', 'hair', 3)}/>
${txt(126, 206, 34, before, { a: 'end', w: 600 })}
<rect x="136" y="172" width="116" height="46" rx="10" ${st('spark')}/><path d="M140 222 H248" ${st(null, 'gold', 4)}/>
${txt(194, 206, 34, word, { f: 'ink', w: 800 })}
${txt(264, 206, 34, after, { a: 'start', w: 600 })}
<circle cx="194" cy="236" r="16" ${st(null, 'leaf', 4, 'opacity:.8')}/><circle cx="194" cy="236" r="28" ${st(null, 'leaf', 3, 'opacity:.4')}/>
<g transform="translate(169 234)">${fingerArt()}</g>
<g><rect x="74" y="34" width="240" height="94" rx="18" ${st('paper', 'line', 4)}/><path d="M178 126 L194 146 L210 126" ${st('paper', 'line', 4)}/><path d="M180 124 H208" ${st('paper', 'paper', 6)}/>
${txt(96, 72, 26, word, { a: 'start', w: 800, f: 'leaf' })}${txt(96, 106, 22, def, { a: 'start', w: 600 })}
<path d="${sparkPath(290, 58, 12)}" ${st('spark', 'ink', 3)}/></g>`;
}

// ---------------------------------------------------------------- band covers (viewBox 0 0 800 450)
const block = (x, y, rot, fill, letter, size = 120) => `<g transform="rotate(${rot} ${x + size / 2} ${y + size / 2})"><rect x="${x}" y="${y + 10}" width="${size}" height="${size}" rx="26" ${st('ink', null, 0, 'opacity:.18')}/><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="26" ${st(fill, 'line', 6)}/>${txt(x + size / 2, y + size * 0.74, size * 0.7, letter, { f: fill === 'paper' ? 'line' : 'ink' })}</g>`;
const pencil = (x, y, len, rot, w = 34) => `<g transform="translate(${x} ${y}) rotate(${rot})">
<rect x="0" y="${-w / 2}" width="${len}" height="${w}" rx="6" ${st('spark', 'line', 5)}/><path d="M0 ${-w / 6} H${len} M0 ${w / 6} H${len}" ${st(null, 'gold', 3, 'opacity:.7')}/>
<path d="M${len} ${-w / 2} L${len + w * 1.3} 0 L${len} ${w / 2} Z" ${st('bg', 'line', 5)}/><path d="M${len + w * 0.9} ${-w * 0.16} L${len + w * 1.3} 0 L${len + w * 0.9} ${w * 0.16} Z" ${st('ink')}/>
<rect x="${-w * 0.55}" y="${-w / 2}" width="${w * 0.6}" height="${w}" ${st('hair', 'line', 5)}/><rect x="${-w * 1.35}" y="${-w / 2}" width="${w * 0.85}" height="${w}" rx="${w * 0.3}" ${st('mint', 'line', 5)}/></g>`;

function coverK2() {
  // Cute and playful: big chunky letter blocks, a giant pencil, a round owl and a snail, big floating punctuation.
  const owl = `<g transform="translate(560 128)">
<path d="M-50 -60 L-36 -96 L-18 -66 Z M50 -60 L36 -96 L18 -66 Z" ${st('gold', 'line', 6)}/>
<ellipse cx="0" cy="0" rx="78" ry="86" ${st('spark', 'line', 6)}/><ellipse cx="0" cy="26" rx="46" ry="50" ${st('paper', null, 0)}/>
<path d="M-26 22 q8 8 16 0 M10 22 q8 8 16 0 M-10 44 q8 8 16 0" ${st(null, 'gold', 4)}/>
<ellipse cx="-74" cy="14" rx="22" ry="40" transform="rotate(14 -74 14)" ${st('mint', 'line', 6)}/><ellipse cx="74" cy="14" rx="22" ry="40" transform="rotate(-14 74 14)" ${st('mint', 'line', 6)}/>
<circle cx="-30" cy="-30" r="26" ${st('paper', 'line', 6)}/><circle cx="30" cy="-30" r="26" ${st('paper', 'line', 6)}/>
<circle cx="-24" cy="-38" r="10" ${st('ink')}/><circle cx="36" cy="-38" r="10" ${st('ink')}/><circle cx="-21" cy="-41" r="3" ${st('cream')}/><circle cx="39" cy="-41" r="3" ${st('cream')}/>
<path d="M-10 -10 L10 -10 L0 6 Z" ${st('gold', 'line', 4)}/>
<path d="M-26 84 v14 M-36 98 h20 M26 84 v14 M16 98 h20" ${st(null, 'gold', 7)}/></g>`;
  const spiral = Array.from({ length: 60 }, (_, i) => { const t = i * 0.24, r = 3 + 3.1 * t; return `${i ? 'L' : 'M'}${(10 + r * Math.cos(t)).toFixed(1)} ${(-12 + r * Math.sin(t)).toFixed(1)}`; }).join(' ');
  const snail = `<g transform="translate(540 372) scale(.9)">
<path d="M-70 40 Q-80 0 -40 6 L80 10 Q104 12 104 30 Q104 44 80 44 H-60 Q-74 44 -70 40Z" ${st('pale', 'line', 6)}/>
<path d="M84 12 L76 -22 M98 14 L100 -20" ${st(null, 'line', 5)}/><circle cx="76" cy="-24" r="8" ${st('paper', 'line', 4)}/><circle cx="100" cy="-22" r="8" ${st('paper', 'line', 4)}/>
<circle cx="78" cy="-25" r="3.5" ${st('ink')}/><circle cx="102" cy="-23" r="3.5" ${st('ink')}/>
<path d="M86 30 q6 5 12 0" ${st(null, 'line', 4)}/>
<circle cx="10" cy="-12" r="52" ${st('spark', 'line', 6)}/><path d="${spiral}" ${st(null, 'gold', 6)}/></g>`;
  const cloud = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-60 20 Q-70 -10 -40 -12 Q-34 -40 -4 -34 Q14 -54 38 -36 Q66 -38 64 -10 Q84 4 64 20 Z" ${st('paper', 'line', 5)}/></g>`;
  return `<rect width="800" height="450" ${st('sparksoft')}/>
<circle cx="700" cy="58" r="120" ${st('spark', null, 0, 'opacity:.55')}/>
${cloud(120, 70, 1)}${cloud(400, 52, 0.8)}
${txt(300, 150, 120, '?', { f: 'leaf', more: 'opacity:.9' })}${txt(740, 250, 110, '!', { f: 'leaf' })}
<path d="${sparkPath(210, 70, 18)}" ${st('spark', 'line', 4)}/><path d="${sparkPath(470, 140, 14)}" ${st('spark', 'line', 4)}/><path d="${sparkPath(660, 290, 12)}" ${st('spark', 'line', 4)}/>
<path d="M0 300 Q200 240 400 290 T800 270 V450 H0 Z" ${st('mint', 'line', 6)}/>
<path d="M0 380 Q240 340 480 380 T800 370 V450 H0 Z" ${st('leaf', null, 0, 'opacity:.5')}/>
${block(40, 196, -8, 'mint', 'A')}${block(156, 250, 6, 'spark', 'b', 104)}${block(64, 318, 3, 'paper', 'c', 96)}
${pencil(390, 250, 250, -12, 40)}
${snail}${owl}`;
}

function cover35() {
  // Detailed flat illustration: a writing desk by a window, a notebook with a tagged sentence, a cat on the books.
  const book = (x, y, w, h, f, band) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" ${st(f, 'line', 4)}/><rect x="${x}" y="${y + h * 0.2}" width="${w}" height="${h * 0.1}" ${st(band, null, 0)}/>`;
  const cat = `<g transform="translate(640 196)">
<path d="M-56 70 Q-70 10 -20 -6 Q20 -16 44 6 Q66 28 60 70 Z" ${st('muted', 'line', 5)}/>
<path d="M60 64 Q96 60 100 30 Q102 14 90 16" ${st(null, 'line', 14)}/><path d="M60 64 Q96 60 100 30 Q102 14 90 16" ${st(null, 'muted', 6)}/>
<path d="M-22 8 Q2 -6 26 8 Q18 40 2 46 Q-14 40 -22 8Z" ${st('soft')}/>
<path d="M-36 -40 L-30 -74 L-8 -52 Z M30 -40 L24 -74 L4 -52 Z" ${st('muted', 'line', 5)}/>
<ellipse cx="-2" cy="-34" rx="40" ry="32" ${st('muted', 'line', 5)}/>
<path d="M-28 -60 L-27 -66 L-18 -57 M24 -60 L22 -66 L14 -57" ${st('pale')}/>
<path d="M-20 -36 q6 -6 12 0 M6 -36 q6 -6 12 0" ${st(null, 'ink', 4)}/><path d="M-4 -24 L0 -20 L4 -24 Z" ${st('ink')}/>
<path d="M-30 -22 H-52 M-30 -16 H-50 M26 -22 H48 M26 -16 H46" ${st(null, 'line', 2)}/></g>`;
  return `<rect width="800" height="450" ${st('soft')}/>
<rect x="36" y="34" width="232" height="190" rx="12" ${st('mintsoft', 'line', 5)}/><path d="M152 34 V224 M36 128 H268" ${st(null, 'line', 5)}/>
<circle cx="96" cy="84" r="22" ${st('spark')}/><path d="M172 196 Q170 180 186 180 Q190 164 208 168 Q220 156 234 168 Q252 166 250 184 Q262 190 252 198 Z" ${st('paper')}/>
<rect x="300" y="132" width="300" height="10" rx="3" ${st('edge')}/>
${book(316, 52, 30, 80, 'leaf', 'spark')}${book(348, 62, 24, 70, 'spark', 'leaf')}${book(374, 46, 34, 86, 'mint', 'paper')}${book(410, 70, 22, 62, 'paper', 'mint')}
<g transform="rotate(14 470 132)">${book(446, 66, 26, 66, 'ink', 'spark')}</g>
<rect x="528" y="84" width="44" height="48" rx="10" ${st('mint', 'line', 4)}/>${txt(550, 118, 26, 'Aa', { f: 'ink' })}
<rect x="0" y="262" width="800" height="188" ${st('hair')}/><path d="M0 262 H800" ${st(null, 'line', 5)}/>
${book(560, 224, 170, 26, 'leaf', 'spark')}${book(574, 250, 150, 22, 'spark', 'mint')}
${cat}
<g transform="rotate(-4 330 340)">
<rect x="118" y="252" width="440" height="176" rx="14" ${st('paper', 'line', 5)}/><path d="M338 252 V428" ${st(null, 'hair', 4)}/>
${[300, 334, 368, 402].map(y => `<path d="M136 ${y} H322 M354 ${y} H540" ${st(null, 'mintsoft', 3)}/>`).join('')}
${txt(138, 296, 30, 'My', { a: 'start', w: 650 })}${txt(190, 296, 30, 'dog', { a: 'start', w: 650 })}${txt(245, 296, 30, ',', { a: 'start', w: 650 })}
<path d="M190 306 H244" ${st(null, 'mint', 6)}/><circle cx="251" cy="296" r="11" ${st(null, 'leaf', 3)}/>
${txt(138, 334, 30, 'Max,', { a: 'start', w: 650 })}<path d="M138 342 H198" ${st(null, 'mint', 6)}/>
${txt(214, 334, 30, 'loves', { a: 'start', w: 650 })}<path d="M214 342 H289" ${st(null, 'spark', 6)}/>
${txt(138, 368, 30, 'to run!', { a: 'start', w: 650 })}
<rect x="360" y="278" width="76" height="40" rx="8" ${st('mint', 'line', 4)}/>${txt(398, 306, 22, 'noun', { f: 'ink', w: 700 })}
<rect x="448" y="278" width="76" height="40" rx="8" ${st('spark', 'line', 4)}/>${txt(486, 306, 22, 'verb', { f: 'ink', w: 700 })}
<path d="M366 350 H520 M366 384 H480" ${st(null, 'hair', 6)}/>
</g>
${pencil(470, 404, 170, -28, 24)}
<g transform="translate(46 300)"><rect x="0" y="40" width="56" height="74" rx="8" ${st('leaf', 'line', 5)}/>
<g transform="rotate(-10 20 40)"><rect x="10" y="-26" width="12" height="70" ${st('spark', 'line', 3)}/></g><rect x="30" y="-16" width="12" height="60" ${st('mint', 'line', 3)}/><g transform="rotate(12 48 40)"><rect x="40" y="-10" width="12" height="54" ${st('paper', 'line', 3)}/></g>
<rect x="0" y="40" width="56" height="74" rx="8" ${st('leaf', 'line', 5)}/></g>
<g transform="rotate(6 708 380)"><rect x="660" y="330" width="96" height="96" rx="6" ${st('spark', 'line', 4)}/>${txt(708, 402, 64, ';')}</g>
<g transform="rotate(-8 50 160)"><rect x="300" y="166" width="70" height="70" rx="6" ${st('pale', 'line', 4)}/>${txt(335, 220, 50, '?')}</g>`;
}

function cover68() {
  // Clean modern infographic: a sentence split into labelled parts, a sentence diagram, a word-type chart, end marks.
  const grid = Array.from({ length: 17 }, (_, i) => `M${i * 50} 0 V450`).join(' ') + ' ' + Array.from({ length: 10 }, (_, i) => `M0 ${i * 50} H800`).join(' ');
  const chip = (x, w, f, s, label) => `<rect x="${x}" y="64" width="${w}" height="58" rx="14" ${st(f, 'line', 4)}/>${txt(x + w / 2, 103, 28, s, { f: f === 'paper' ? 'line' : 'ink', w: 700 })}
<path d="M${x + 8} 136 V146 H${x + w - 8} V136" ${st(null, 'muted', 3)}/>${txt(x + w / 2, 172, 17, label, { f: 'muted', w: 700, more: 'letter-spacing:.08em' })}`;
  const arc = (r0, a0, a1, f) => { const p = a => [690 + r0 * Math.cos(a), 300 + r0 * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${r0} ${r0} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" ${st(null, f, 34, 'stroke-linecap:butt')}/>`; };
  const T = 2 * Math.PI, s0 = -Math.PI / 2;
  const marks = ['.', ',', ';', ':', '?', '!'];
  return `<rect width="800" height="450" ${st('paper')}/><path d="${grid}" ${st(null, 'hair', 1.5)}/>
${chip(40, 196, 'mint', 'The quick fox', 'SUBJECT')}${chip(248, 130, 'spark', 'jumped', 'VERB')}${chip(390, 214, 'paper', 'over the log', 'PHRASE')}${chip(616, 58, 'ink', '.', 'END')}
<text x="645" y="103" text-anchor="middle" style="fill:${BRAND.cream};font-size:36px;font-weight:800;${FONT}">.</text>
<g transform="translate(40 226)"><path d="M0 70 H380 M190 30 V96" ${st(null, 'line', 5)}/>
${txt(92, 58, 26, 'fox', { w: 700 })}${txt(284, 58, 26, 'jumped', { w: 700 })}
<path d="M40 72 L80 130 M110 72 L150 130 M232 72 L272 130 H360" ${st(null, 'line', 4)}/>
${txt(56, 80, 17, 'The', { a: 'start', w: 600, f: 'muted', more: 'transform:rotate(55deg);transform-box:fill-box;transform-origin:left' })}
${txt(126, 80, 17, 'quick', { a: 'start', w: 600, f: 'muted', more: 'transform:rotate(55deg);transform-box:fill-box;transform-origin:left' })}
${txt(248, 80, 17, 'over', { a: 'start', w: 600, f: 'muted', more: 'transform:rotate(55deg);transform-box:fill-box;transform-origin:left' })}
${txt(318, 124, 20, 'log', { w: 700 })}
<circle cx="190" cy="70" r="7" ${st('leaf')}/></g>
<g>${arc(70, s0, s0 + T * 0.38, 'mint')}${arc(70, s0 + T * 0.38, s0 + T * 0.62, 'spark')}${arc(70, s0 + T * 0.62, s0 + T * 0.82, 'leaf')}${arc(70, s0 + T * 0.82, s0 + T * 0.999, 'muted')}
${txt(690, 300, 28, '4', { w: 800 })}${txt(690, 320, 12, 'WORD TYPES', { f: 'muted', w: 700, more: 'letter-spacing:.08em' })}</g>
<g transform="translate(500 248)">${[['mint', 'noun'], ['spark', 'verb'], ['leaf', 'adj'], ['muted', 'prep']].map(([f, s], i) => `<rect x="0" y="${i * 30}" width="18" height="18" rx="5" ${st(f)}/>${txt(28, i * 30 + 15, 17, s, { a: 'start', w: 700 })}`).join('')}</g>
<g transform="translate(40 384)">${marks.map((m, i) => `<circle cx="${i * 64 + 24}" cy="24" r="24" ${st(i === 2 ? 'spark' : 'soft', 'line', 3)}/>${txt(i * 64 + 24, 36, 32, m, { f: i === 2 ? 'ink' : 'line' })}`).join('')}</g>
<path d="M440 408 H760" ${st(null, 'hair', 6)}/><path d="M440 408 H640" ${st(null, 'leaf', 6)}/><circle cx="640" cy="408" r="9" ${st('spark', 'line', 3)}/>`;
}

function cover912() {
  // Near-adult editorial: a manuscript with proofreading marks, a fountain pen, a large pilcrow. Muted.
  const lines = [[96, 340], [96, 300], [96, 360], [96, 220]];
  return `<rect width="800" height="450" ${st('bg')}/>
${txt(650, 380, 420, '¶', { f: 'hair', w: 300 })}
<rect x="58" y="44" width="452" height="370" rx="6" ${st('ink', null, 0, 'opacity:.08')} transform="translate(8 8)"/>
<rect x="58" y="44" width="452" height="370" rx="6" ${st('paper', 'line', 3)}/>
<path d="M98 44 V414" ${st(null, 'leaf', 1.5, 'opacity:.6')}/>
${lines.map(([x, w], i) => `<rect x="${x + 18}" y="${78 + i * 26}" width="${w}" height="8" rx="4" ${st('hair')}/>`).join('')}
${txt(116, 214, 26, 'However', { a: 'start', w: 600 })}${txt(244, 214, 26, 'the evidence', { a: 'start', w: 600 })}
<path d="M223 230 L230 218 L237 230" ${st(null, 'leaf', 3)}/>${txt(231, 194, 32, ',', { f: 'leaf', w: 800 })}
${txt(116, 244, 17, 'points to', { a: 'start', w: 600, f: 'leaf', more: 'font-style:italic' })}
${txt(116, 272, 26, 'suggests', { a: 'start', w: 600 })}<path d="M112 263 H232" ${st(null, 'line', 2.5)}/>${txt(242, 272, 26, 'otherwise.', { a: 'start', w: 600 })}
<circle cx="369" cy="266" r="12" ${st(null, 'spark', 3)}/>
${[304, 330, 356].map((y, i) => `<rect x="116" y="${y}" width="${[330, 290, 180][i]}" height="8" rx="4" ${st('hair')}/>`).join('')}
<path d="M490 206 Q470 190 420 198" ${st(null, 'leaf', 2)}/>${txt(418, 232, 15, 'add a comma', { a: 'start', w: 700, f: 'leaf' })}
<g transform="translate(600 136) rotate(32)">
<rect x="-14" y="-150" width="28" height="140" rx="12" ${st('line')}/><rect x="-14" y="-40" width="28" height="12" ${st('gold')}/>
<path d="M-14 -10 H14 L8 24 L0 46 L-8 24 Z" ${st('spark', 'ink', 3)}/><path d="M0 46 V10" ${st(null, 'ink', 2.5)}/><circle cx="0" cy="8" r="3" ${st('ink')}/></g>
${txt(560, 418, 18, 'REVISION', { a: 'start', w: 700, f: 'muted', more: 'letter-spacing:.18em' })}<path d="M560 430 H674" ${st(null, 'muted', 2)}/>
<circle cx="742" cy="64" r="8" ${st('spark')}/>`;
}
const COVERS = { 'k-2': coverK2, '3-5': cover35, '6-8': cover68, '9-12': cover912 };

/** The course card cover (3:4, 360 x 480): Oomba under a few letters, for the course card and its share picture. */
function cardArt() {
  return `<rect width="360" height="480" ${st('mintsoft')}/>
<circle cx="300" cy="40" r="110" ${st('sparksoft')}/>
${txt(70, 118, 76, 'Aa', { f: 'leaf' })}${txt(286, 176, 70, '?', { f: 'line' })}${txt(60, 236, 70, '!', { f: 'line' })}${txt(300, 92, 54, ',', { f: 'leaf' })}
<path d="${starPath(180, 70, 16)}" ${st('spark', 'ink', 3)}/><path d="${starPath(238, 128, 10)}" ${st('spark', 'ink', 3)}/><path d="${starPath(116, 168, 9)}" ${st('spark', 'ink', 3)}/>
<path d="M0 410 Q180 370 360 410 V480 H0 Z" ${st('mint', 'line', 5)}/>
<g transform="translate(50 166) scale(.8)">${mascotArt()}</g>`;
}

/** Every still picture, as SVG markup (aria-hidden, or role=img with label). */
export const art = {
  mascot: label => wrap('0 0 340 340', mascotArt(), label),
  doorway: label => wrap('0 0 480 320', doorwayArt(), label),
  masteryStars: label => wrap('0 0 480 320', masteryArt({ mode: 'image' }), label),
  doubleTapTip: (label, words) => wrap('0 0 480 320', tapTipArt(words), label),
  cover: (band, label) => wrap('0 0 800 450', COVERS[band](), label),
  card: label => wrap('0 0 360 480', cardArt(), label),
};
/** The picture files (public/img/grammar-lab/<name>.svg): name -> markup. */
export const FILES = {
  'k-2-cover': () => art.cover('k-2'), '3-5-cover': () => art.cover('3-5'), '6-8-cover': () => art.cover('6-8'), '9-12-cover': () => art.cover('9-12'),
  mascot: () => art.mascot(), doorway: () => art.doorway(), 'mastery-stars': () => art.masteryStars(), 'double-tap-tip': () => art.doubleTapTip(), card: () => art.card(),
};
/** A picture as a stand-alone .svg file. */
/** A picture as a stand-alone .svg file: the light palette written out (an image file cannot see the page's tokens). */
export const standalone = markup => `<?xml version="1.0" encoding="UTF-8"?>\n${markup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/var\(--gl-[\w-]+,(#[0-9A-Fa-f]{3,8})\)/g, '$1')}\n`;

// ---------------------------------------------------------------- the animations
/** True when the visitor asked for less motion. */
export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Builds the shared controller. build(root) draws the end state; plan(root) returns [element, keyframes, timing] steps.
 * Every step is created at once with its delay, so seek(ms) can show any moment and the end is the drawn still.
 */
function controller(el, cls, build, plan, opts = {}) {
  if (!el) throw new Error('grammar-lab-art: no container');
  const root = document.createElement('div');
  root.className = `gla ${cls}`;
  if (opts.label) { root.setAttribute('role', 'img'); root.setAttribute('aria-label', opts.label); } else root.setAttribute('aria-hidden', 'true');
  build(root);
  el.appendChild(root);
  let anims = [], resolveDone, finished = new Promise(r => { resolveDone = r; });
  const still = () => !!opts.still || prefersReducedMotion();
  const done = () => { root.dataset.glaState = 'done'; resolveDone(api); };
  function play() {
    anims.forEach(a => a.cancel());
    anims = [];
    root.dataset.glaMotion = still() ? 'still' : 'full';
    if (still() || typeof root.animate !== 'function') return done();
    root.dataset.glaState = 'playing';
    for (const [node, kf, t] of plan(root)) if (node) anims.push(node.animate(kf, { fill: 'backwards', easing: 'ease-out', ...t }));
    const mine = anims;
    Promise.all(mine.map(a => a.finished)).then(() => { if (mine === anims) done(); }, () => { /* replayed or destroyed */ });
  }
  const api = {
    root,
    get finished() { return finished; },
    /** Plays it again from the start (the tip's Replay button does this). */
    replay() { if (root.dataset.glaState === 'done') finished = new Promise(r => { resolveDone = r; }); play(); return api; },
    /** Holds the animation at ms from its start (for previews and screenshots). */
    seek(ms) { anims.forEach(a => { a.pause(); a.currentTime = ms; }); return api; },
    /** Jumps to the end (the still). */
    finish() { anims.forEach(a => a.finish()); return api; },
    /** Stops it and removes the scene. */
    destroy() { anims.forEach(a => a.cancel()); anims = []; root.remove(); if (opts.onDestroy) opts.onDestroy(); },
    get state() { return root.dataset.glaState; },
  };
  root.dataset.glaState = 'playing';
  play();
  return api;
}
const svgScene = (root, vb, inner) => { root.innerHTML = wrap(vb, inner); };
const $ = (root, s) => root.querySelector(s);
const $$ = (root, s) => [...root.querySelectorAll(s)];
const POP = 'cubic-bezier(.34,1.56,.64,1)';

/** Greeting: Oomba pops up, waves, blinks at you, then settles in its greeting pose. */
export function mountGreeting(el, opts = {}) {
  return controller(el, 'gla-scene gla-greet', root => svgScene(root, '0 0 340 340', `<g class="gla-m-all" style="transform-origin:160px 320px">${mascotArt()}</g>`), root => [
    [$(root, '.gla-m-all'), [{ transform: 'translateY(26px) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: POP }],
    [$(root, '.gla-m-arm'), [0, -12, 12, -12, 12, -8, 0].map(d => ({ transform: `rotate(${d}deg)` })), { delay: 380, duration: 1700, easing: 'ease-in-out' }],
    [$(root, '.gla-m-spark'), [{ transform: 'scale(.3) rotate(-60deg)', opacity: 0 }, { transform: 'scale(1.2) rotate(8deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { delay: 200, duration: 700 }],
    [$(root, '.gla-m-eyes'), [{ transform: 'none' }, { transform: 'scaleY(.12)', offset: 0.5 }, { transform: 'none' }], { delay: 2150, duration: 260, fill: 'none', easing: 'linear' }],
    [$(root, '.gla-m-all'), [{ transform: 'none' }, { transform: 'translateY(-6px)', offset: 0.4 }, { transform: 'none' }], { delay: 2150, duration: 460, fill: 'none', easing: 'ease-in-out' }],
  ], opts);
}

/** Welcome: the door opens, warm light spills out, stars and letters float out and settle round the doorway. */
export function mountWelcome(el, opts = {}) {
  const [cx, cy] = DOOR.center;
  return controller(el, 'gla-scene gla-welcome', root => svgScene(root, '0 0 480 320', doorwayArt()), root => [
    [$(root, '.gla-w-door'), [{ transform: 'scaleX(1)' }, { transform: 'scaleX(.96)', offset: 0.15 }, { transform: 'scaleX(.16)' }], { delay: 250, duration: 1150, easing: 'ease-in-out' }],
    [$(root, '.gla-w-glow'), [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }], { delay: 600, duration: 1000 }],
    [$(root, '.gla-w-spill'), [{ opacity: 0, transform: 'scaleY(0)' }, { opacity: 1, transform: 'none' }], { delay: 700, duration: 900 }],
    ...$$(root, '.gla-w-float').map((g, i) => {
      const dx = cx - +g.dataset.x, dy = cy - +g.dataset.y;
      return [g, [{ transform: `translate(${dx}px,${dy}px) scale(.2)`, opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'translate(0,-6px) scale(1.08)', offset: 0.8 }, { transform: 'none', opacity: 1 }], { delay: 1050 + i * 120, duration: 1100, easing: 'cubic-bezier(.2,.7,.3,1)' }];
    }),
  ], opts);
}

/** Mastery: Oomba tosses a star; it arcs up into the empty place in the constellation, which then twinkles. */
export function mountMastery(el, opts = {}) {
  const { p0, p1, p2 } = starArc();
  const N = 16, flight = Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N, x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
    return { transform: `translate(${(x - p2[0]).toFixed(1)}px,${(y - p2[1]).toFixed(1)}px) rotate(${(-300 * (1 - t)).toFixed(0)}deg) scale(${(0.55 + 0.45 * t).toFixed(2)})` };
  });
  return controller(el, 'gla-scene gla-mastery', root => svgScene(root, '0 0 480 320', masteryArt({ mode: 'scene' })), root => [
    [$(root, '.gla-m-arm'), [{ transform: 'none' }, { transform: 'rotate(34deg)', offset: 0.45 }, { transform: 'rotate(-22deg)', offset: 0.75 }, { transform: 'none' }], { duration: 900, easing: 'ease-in-out' }],
    [$(root, '.gla-ms-fly'), [{ ...flight[0], opacity: 0 }, { ...flight[0], opacity: 1, offset: 0.01 }, ...flight.slice(1)], { delay: 620, duration: 1200, easing: 'cubic-bezier(.3,.1,.4,1)' }],
    [$(root, '.gla-ms-slot'), [{ opacity: 0.6 }, { opacity: 0.6, offset: 0.8 }, { opacity: 0 }], { duration: 1900, easing: 'linear' }],
    [$(root, '.gla-ms-last'), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { delay: 1820, duration: 520 }],
    [$(root, '.gla-ms-burst'), [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1)', offset: 0.35 }, { opacity: 0, transform: 'scale(1.25)' }], { delay: 1800, duration: 600, fill: 'none' }],
    ...$$(root, '.gla-ms-twinkle').map((s, i) => [s, [{ transform: 'none', opacity: 1 }, { transform: 'scale(1.35) rotate(18deg)', opacity: 0.55, offset: 0.5 }, { transform: 'none', opacity: 1 }], { delay: 2150 + i * 140, duration: 640, iterations: 2, easing: 'ease-in-out' }]),
  ], opts);
}

/**
 * Double-tap tip: a finger taps the highlighted word twice and its definition pops up above it. Replayable (the
 * Replay button, or the controller's replay()). opts: before, word, after (the sentence round the word), def (the
 * definition), replayLabel (the button's words; '' for no button), label (an accessible name for the demo).
 */
export function mountTapTip(el, opts = {}) {
  const o = { before: 'The', word: 'fluffy', after: 'cat naps in the sun.', def: 'soft and full of fur', replayLabel: 'Replay', ...opts };
  let ro = null, api;
  const place = root => {
    const card = $(root, '.gla-tap-card'), w = $(root, '.gla-tap-word'), b = $(root, '.gla-tap-bubble'), f = $(root, '.gla-tap-finger');
    if (!card || !w) return;
    const cr = card.getBoundingClientRect(), wr = w.getBoundingClientRect();
    const x = wr.left - cr.left + wr.width / 2, top = wr.top - cr.top, bottom = wr.bottom - cr.top;
    const bw = b.offsetWidth, left = Math.max(8, Math.min(cr.width - bw - 8, x - bw / 2));
    b.style.left = `${left}px`; b.style.bottom = `${cr.height - top + 14}px`;
    b.style.setProperty('--tail', `${Math.max(16, Math.min(bw - 16, x - left))}px`);
    f.style.left = `${x - 25 * ((parseFloat(getComputedStyle(f).width) || 56) / 80)}px`; f.style.top = `${bottom - 6}px`;
    $$(root, '.gla-tap-ring').forEach(r => { r.style.left = `${x}px`; r.style.top = `${bottom - 4}px`; });
  };
  api = controller(el, 'gla-tap', root => {
    root.innerHTML = `<div class="gla-tap-card"><p class="gla-tap-sentence">${esc(o.before)} <span class="gla-tap-word"><span class="gla-tap-mark"></span><span class="gla-tap-text">${esc(o.word)}</span></span> ${esc(o.after)}</p>
<span class="gla-tap-ring"></span><span class="gla-tap-ring"></span>
<svg class="gla-tap-finger" viewBox="0 0 80 110" aria-hidden="true" focusable="false"><g ${ROUND}>${fingerArt()}</g></svg>
<div class="gla-tap-bubble"><b>${esc(o.word)}</b> ${esc(o.def)}</div></div>${o.replayLabel ? `<button type="button" class="btn btn-sm gla-replay"><span aria-hidden="true">↻</span> ${esc(o.replayLabel)}</button>` : ''}`;
    place(root);
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => place(root)); ro.observe($(root, '.gla-tap-card')); }
    const btn = $(root, '.gla-replay');
    if (btn) btn.addEventListener('click', () => api.replay());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => place(root));
  }, root => {
    const ring = $$(root, '.gla-tap-ring');
    return [
      [$(root, '.gla-tap-finger'), [{ transform: 'translate(70px,80px)', opacity: 0 }, { opacity: 1, offset: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 700 }],
      [$(root, '.gla-tap-finger'), [{ transform: 'none' }, { transform: 'scale(.86) translateY(3px)' }, { transform: 'none' }], { delay: 900, duration: 240, fill: 'none', easing: 'ease-in-out' }],
      [$(root, '.gla-tap-finger'), [{ transform: 'none' }, { transform: 'scale(.86) translateY(3px)' }, { transform: 'none' }], { delay: 1220, duration: 240, fill: 'none', easing: 'ease-in-out' }],
      [ring[0], [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0.9 }, { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 }], { delay: 960, duration: 520, fill: 'none' }],
      [ring[1], [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0.9 }, { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 }], { delay: 1280, duration: 520, fill: 'none' }],
      [$(root, '.gla-tap-mark'), [{ opacity: 0 }, { opacity: 1 }], { delay: 960, duration: 200 }],
      [$(root, '.gla-tap-text'), [{ color: 'var(--text)' }, { color: 'var(--brand-ink)' }], { delay: 960, duration: 200 }],
      [$(root, '.gla-tap-bubble'), [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1.06)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { delay: 1560, duration: 420 }],
    ];
  }, { ...opts, onDestroy: () => ro && ro.disconnect() });
  place(api.root);
  return api;
}

export const mounts = { greeting: mountGreeting, welcome: mountWelcome, mastery: mountMastery, tapTip: mountTapTip };
