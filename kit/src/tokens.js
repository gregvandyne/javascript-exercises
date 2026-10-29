// Design tokens of "Oomba Ink" (spec §2): the palette ramps, colour roles, outline formula, radii, motion and z-layers.
// Games never write hex: they name a role ('player', 'hazard', ...) or a hue ('mint', 'coral', ...) and a step.
import { adjustHex, hexToOklab, deltaE } from './color.js';

export const STEPS = ['tint', 'light', 'base', 'shade'];
// Phase 1 starting values (spec §2.1). Brand values (mint base/shade, spark base/shade, ink, cream) are fixed.
export const PALETTE = {
  mint: ['#DDF3E6', '#9BDDB7', '#66C792', '#1F9D63'],
  spark: ['#FFF3C4', '#FFE27A', '#FFD23F', '#C99A00'],
  coral: ['#FFE1DC', '#FF9C8F', '#FF6B5B', '#C8402F'],
  sky: ['#DDEEFD', '#93CBF6', '#4FA8F0', '#2F6FC8'],
  grape: ['#ECE2FB', '#C6A9F3', '#9B6BE8', '#6C44C0'],
  peach: ['#FFEAD8', '#FFC89E', '#F5A26B', '#C9713A'],
  cocoa: ['#EEDFD0', '#BF957A', '#8A5A3C', '#5C3A26'],
  stone: ['#EEECE5', '#C6C2B5', '#8F8A7C', '#5E5A50'],
  snow: ['#FFFFFF', '#F4F7FA', '#DDE6EE', '#B4C3D1'],
  ink: ['#141414', '#141414', '#141414', '#141414'],
  cream: ['#FFFDF2', '#FFFDF2', '#FFFDF2', '#F4F1E6'],
};
export const HUES = Object.keys(PALETTE);
export const INK = '#141414', CREAM = '#FFFDF2', PAPER = '#F4F1E6';
export const ROLES = {
  friend: 'mint', player: 'mint', correct: 'mint', go: 'mint',
  reward: 'spark', hot: 'spark',
  hazard: 'coral', wrong: 'coral',
  interact: 'sky', neutral: 'sky', water: 'sky',
  magic: 'grape', special: 'grape',
  fur: 'peach', wood: 'cocoa', hair: 'cocoa', rock: 'stone', muted: 'stone', cloud: 'snow',
  outline: 'ink', text: 'ink', rim: 'cream', card: 'cream', belly: 'cream',
};
export const SKIN = ['#FCE1CB', '#F5CBA7', '#E8B48A', '#D29A6B', '#B97E4E', '#96603A', '#6E4529', '#4A2E1C'];
export const SKIN_SHADE = SKIN.map(h => adjustHex(h, -0.10));
export const HAIR = { cocoa: '#5C3A26', black: '#2B2220', blonde: '#E8C26A', copper: '#C8572F', stone: '#8F8A7C', grape: '#9B6BE8', sky: '#4FA8F0', mint: '#1F9D63' };

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** color('player') -> '#66C792'; color('coral','shade'); color('mint', 1). Unknown -> ink. night=true applies +0.05 L. */
export function color(role, step = 'base', night = false) {
  const hue = PALETTE[role] ? role : ROLES[role];
  const ramp = PALETTE[hue];
  if (!ramp) return HEX_RE.test(String(role)) ? nearestHue(role).hex : INK;
  const i = typeof step === 'number' ? Math.max(0, Math.min(3, step | 0)) : Math.max(0, STEPS.indexOf(step));
  const hex = ramp[i < 0 ? 2 : i];
  return night && hue !== 'spark' && hue !== 'ink' ? adjustHex(hex, 0.05) : hex;
}
/** The nearest palette hue/step to any hex (games that write hex get snapped to the palette). */
export function nearestHue(hex) {
  const p = hexToOklab(hex.startsWith('#') ? hex : '#' + hex);
  let best = { hue: 'ink', step: 'base', hex: INK, d: Infinity };
  for (const hue of HUES) PALETTE[hue].forEach((h, i) => { const d = deltaE(p, hexToOklab(h)); if (d < best.d) best = { hue, step: STEPS[i], hex: h, d }; });
  return best;
}
/** Outline width in device px for a sprite h_px tall: clamp(2, 0.055 h, 6). Sticker rim: max(2, 0.45 w). */
export const outline = hPx => Math.max(2, Math.min(6, 0.055 * hPx));
export const rimWidth = w => Math.max(2, 0.45 * w);
export const radius = { sm: 12, md: 20, lg: 32 };
export const space = [4, 8, 12, 16, 24, 32];
// Motion tokens (spec §2.6), the single source the Builder prompt cites.
export const motion = {
  tap: 80, ui: { ms: 200, ease: 'cubicOut' }, pop: { ms: 320, ease: 'backOut' }, scene: 500,
  spring: { play: { k: 180, zeta: 0.55 }, ui: { k: 260, zeta: 0.8 }, follow: { k: 120, zeta: 0.5 } },
  hitstop: 60, hitstopRange: [40, 80],
  shake: { px: 18, deg: 3, decay: 1.6, freq: 25 },
  squash: { jump: 1.15, land: 0.8 }, breathe: { amp: 0.02, hz: 0.4 }, blink: { min: 2000, max: 6000, ms: 120 },
  flashPerSecond: 3,
};
// Draw layers, back to front.
export const z = { sky: 0, far: 1, mid: 2, near: 3, shadow: 4, world: 5, actors: 6, fx: 7, front: 8, text: 9 };
export const LAYERS = ['sky', 'far', 'mid', 'near', 'shadow', 'world', 'actors', 'fx', 'front', 'text'];
// Night sky stops (spec §2.1).
export const NIGHT_SKY = ['#0E2A2E', '#163B3A'];
