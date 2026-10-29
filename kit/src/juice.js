// Juice that works on DOM elements too (WAAPI), so DOM games get kit feel: pop, shake, flash. The flash limiter is
// global: at most 3 screen flashes a second (WCAG 2.3.1), and none with reduced motion.
import { motion } from './tokens.js';

export class FlashLimiter {
  constructor(perSecond = motion.flashPerSecond) { this.per = perSecond; this.times = []; }
  /** -> true if a flash may happen at time now (ms). */
  allow(now) {
    this.times = this.times.filter(t => now - t < 1000);
    if (this.times.length >= this.per) return false;
    this.times.push(now); return true;
  }
}
export function domPop(el, reduced) {
  if (!el || !el.animate) return;
  if (reduced) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'linear' }); return; }
  el.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: motion.pop.ms, easing: 'cubic-bezier(.34,1.56,.64,1)' });
}
export function domShake(el, trauma = 0.4, reduced) {
  if (!el || !el.animate || reduced) return;
  const a = 18 * trauma * trauma, k = [];
  for (let i = 0; i <= 6; i++) { const s = i === 6 ? 0 : (i % 2 ? -1 : 1) * a * (1 - i / 6); k.push({ transform: `translate(${s}px,${s * 0.4}px)` }); }
  el.animate(k, { duration: 360, easing: 'linear' });
}
