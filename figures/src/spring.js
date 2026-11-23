// Oomba Figures: springs (1.7.0, the physics pack). A spring (or 2 or 3 in series or in parallel) hanging from a ceiling
// or lying on a floor from a wall: one copy, before and after (at its natural length, then stretched or squashed by the
// object), or three positions of an oscillation (−A, equilibrium, +A) with its velocity and acceleration. Each coil is
// drawn for the length it has (ported/spring.js), never scaled. `stretch` is how far the drawing stretches it (a share
// of its natural length); the numbers are the teacher's: k in N/m for each spring, the extension x in m (negative
// squashes it), or the mass that hangs on it. OF.solve gives the springs' combined k (series 1/k = Σ 1/kᵢ, parallel
// k = Σ kᵢ), the extension, the force F = kx, the elastic energy ½kx², and with a mass the period 2π√(m/k).
// hide: "extension" (its value is left off: x shows), "force", "values" or true (every number: only the letters).
import { node, label, subLabel, line, frame, palette, fmt, isNum, text, hides } from './svg.js';
import { mechWords, keysCheck, boolCheck, oneOf, hatched, wallAt, block, ball, force, motion, dimension } from './mech.js';
import { spCoilPath, spTurnsFor } from './ported/spring.js';

const SP_KEYS = ['kind', 'hide', 'orientation', 'picture', 'springs', 'joined', 'stretch', 'k', 'extension', 'mass', 'g', 'object', 'coils', 'extensionMark', 'lengthMark', 'equilibriumLine', 'appliedForce', 'motion', 'moving', 'values', 'heading'];
const spG = d => (d.g === undefined ? 9.8 : d.g);
const nOf = d => (d.springs === undefined ? 1 : d.springs);
/** Each spring's k, from a number (all alike) or a list. */
const ksOf = d => (d.k === undefined ? null : Array.isArray(d.k) ? d.k.slice() : Array.from({ length: nOf(d) }, () => d.k));
function kEffOf(d) {
  const ks = ksOf(d); if (!ks) return undefined;
  return nOf(d) === 1 ? ks[0] : (d.joined || 'series') === 'parallel' ? ks.reduce((s, k) => s + k, 0) : 1 / ks.reduce((s, k) => s + 1 / k, 0);
}
/** The extension in m: given, or from the hanging mass (x = mg/k). */
function extOf(d) {
  if (d.extension !== undefined) return d.extension;
  const k = kEffOf(d);
  return (d.orientation || 'hanging') === 'hanging' && d.mass !== undefined && k !== undefined ? (d.mass * spG(d)) / k : undefined;
}

export const spring = {
  check(d) {
    const out = keysCheck(d, SP_KEYS, 'a spring figure'), hanging = (d.orientation || 'hanging') === 'hanging', pic = d.picture || 'beforeAfter';
    out.push(...oneOf(d, 'orientation', ['hanging', 'horizontal']), ...oneOf(d, 'picture', ['one', 'beforeAfter', 'positions']), ...oneOf(d, 'joined', ['series', 'parallel']),
      ...oneOf(d, 'object', ['block', 'ball', 'masses', 'none']), ...oneOf(d, 'coils', ['zigzag', 'loops']), ...oneOf(d, 'motion', ['none', 'velocity', 'acceleration', 'both']), ...oneOf(d, 'moving', ['toward', 'away']),
      ...boolCheck(d, ['extensionMark', 'lengthMark', 'equilibriumLine', 'appliedForce', 'values']));
    if (d.springs !== undefined && ![1, 2, 3].includes(d.springs)) out.push('"springs" must be 1, 2 or 3');
    if (pic === 'positions' && nOf(d) !== 1) out.push('three positions has one spring');
    if (d.stretch !== undefined && !isNum(d.stretch, pic === 'positions' ? 0.1 : -0.5, pic === 'positions' && !hanging ? 0.5 : 1)) out.push(pic === 'positions' ? `"stretch" is the amplitude as a share of the natural length, 0.1 to ${hanging ? 1 : 0.5}` : '"stretch" must be how far the drawing stretches it, a share of its natural length from -0.5 (squashed) to 1');
    if (hanging && pic !== 'positions' && d.stretch !== undefined && d.stretch < 0.05) out.push('a spring with something hanging on it is stretched: "stretch" at least 0.05');
    if (d.k !== undefined) {
      const ks = ksOf(d);
      if (Array.isArray(d.k) && d.k.length !== nOf(d)) out.push('"k" lists one spring constant for each spring');
      if (!ks.every(k => isNum(k, 0.001, 1e7))) out.push('"k" must be the spring constant in N/m, above 0 (one number, or one for each spring)');
    }
    if (d.extension !== undefined && !isNum(d.extension, -1000, 1000)) out.push('"extension" must be x in m (negative when squashed)');
    if (d.extension === 0) out.push('"extension" 0 is the natural length: leave it out');
    if (d.mass !== undefined && !isNum(d.mass, 0.001, 1e6)) out.push('"mass" must be the mass in kg');
    if (d.g !== undefined && !isNum(d.g, 0.1, 100)) out.push('"g" must be g in m/s²');
    if (!out.length && hanging && d.mass !== undefined && d.k !== undefined && d.extension !== undefined) out.push('a hanging mass sets the extension (x = mg/k): give the mass or the extension, not both');
    if (!out.length && hanging && d.extension !== undefined && d.extension < 0) out.push('a hanging spring is stretched: "extension" must be above 0');
    if (!out.length && d.extension !== undefined && d.stretch !== undefined && pic !== 'positions' && Math.sign(d.extension) !== Math.sign(d.stretch)) out.push('the drawing must stretch it the way "extension" says (both above 0, or both below)');
    if (!hanging && d.object === 'masses') out.push('slotted masses only hang');
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short text');
    return out;
  },
  /** The springs' combined k, the extension (m), the force F = kx, the energy ½kx² (J), whether it is stretched or
   *  squashed, and with a mass its weight, the period and the frequency of its oscillation. */
  solve(d) {
    if (spring.check(d).length) return null;
    const k = kEffOf(d), x = extOf(d), n = nOf(d), out = { springs: n, joined: n === 1 ? 'single' : d.joined || 'series' };
    if (k !== undefined) Object.assign(out, { k, kEach: ksOf(d)[0] });
    if (x !== undefined) Object.assign(out, { extension: x, state: x > 0 ? 'stretched' : 'compressed' });
    if (k !== undefined && x !== undefined) Object.assign(out, { force: k * Math.abs(x), energy: 0.5 * k * x * x });
    if (d.mass !== undefined) { out.mass = d.mass; out.weight = d.mass * spG(d); if (k !== undefined) { out.period = 2 * Math.PI * Math.sqrt(d.mass / k); out.frequency = 1 / out.period; } }
    return out;
  },
  draw(d, o) {
    const P = palette(o), lang = o.lang, W = mechWords(lang), hanging = (d.orientation || 'hanging') === 'hanging', pic = d.picture || 'beforeAfter', n = nOf(d), joined = n === 1 ? 'series' : d.joined || 'series';
    const all = o.hide === true || hides(o, 'values') || d.values === false, show = key => !all && !hides(o, key), s = spring.solve(d) || {};
    const stretch = d.stretch === undefined ? (pic === 'positions' ? 0.4 : d.extension !== undefined && d.extension < 0 ? -0.35 : 0.4) : d.stretch, style = d.coils || 'zigzag';
    const kind = d.object || 'block', top = d.heading ? 30 : 0, g = [], ks = ksOf(d);
    const kWords = i => { const sub = n > 1 ? String(i + 1) : ''; return [sub, show('k') && ks ? ` = ${fmt(ks[i], 3, lang)} N/m` : '']; };
    // the copies: each its free end's extension (a share of the natural length) and what is on it
    const copies = pic === 'one' ? [{ e: stretch, carries: kind !== 'none' }] : pic === 'beforeAfter' ? [{ e: 0, carries: false, natural: true }, { e: stretch, carries: kind !== 'none' }]
      : hanging ? [{ e: 0.5 - stretch, carries: true, pos: -1 }, { e: 0.5, carries: true, pos: 0 }, { e: 0.5 + stretch, carries: true, pos: 1 }] : [{ e: -stretch, carries: true, pos: -1 }, { e: 0, carries: true, pos: 0 }, { e: stretch, carries: true, pos: 1 }];
    const natural = hanging ? { one: 190, beforeAfter: 140, positions: 110 }[pic] : { one: 200, beforeAfter: 200, positions: 230 }[pic];
    const cols = hanging ? { one: [320], beforeAfter: [230, 440], positions: [150, 320, 490] }[pic] : null;
    const coilW = !hanging && joined === 'parallel' && n > 1 ? 12 : 22, spacing = hanging ? 70 : 38, spread = joined === 'parallel' ? ((n - 1) / 2) * spacing : 0;
    const bw = 56, bh = 48, br = 22, labelCopy = pic === 'positions' ? 0 : copies.length - 1;
    let H = 0;
    const baseY = 40 + top;
    if (hanging) g.push(hatched(Math.min(...cols) - 90, Math.max(...cols) + 90, baseY, P));
    copies.forEach((c, ci) => {
      const len = natural * (1 + c.e), ax = hanging ? { x: 0, y: 1 } : { x: 1, y: 0 }, across = hanging ? { x: 1, y: 0 } : { x: 0, y: 1 };
      const floorY = hanging ? 0 : baseY + 20 + ci * 136 + 96, axisY = hanging ? 0 : floorY - (kind === 'ball' ? br : bh / 2);
      const base = hanging ? { x: cols[ci], y: baseY } : { x: 50, y: axisY };
      if (!hanging) g.push(wallAt(50, floorY - 96, floorY, P, -1), hatched(50, 610, floorY, P, true));
      const at = (along, off = 0) => ({ x: base.x + ax.x * along + across.x * off, y: base.y + ax.y * along + across.y * off });
      let end = at(len);
      if (joined === 'series') {
        const piece = len / n;
        for (let i = 0; i < n; i++) {
          const a = at(piece * i), b = at(piece * (i + 1));
          g.push(node('path', { d: spCoilPath(a, b, spTurnsFor(natural / n), coilW, style), fill: 'none', stroke: P.ink, 'stroke-width': 1.8, 'stroke-linejoin': 'round', class: 'of-coil' }));
          if (i > 0) g.push(node('circle', { cx: a.x, cy: a.y, r: 3, fill: P.ink }));
          if (ci === labelCopy) {
            const m = at(piece * (i + 0.45)), [sub, val] = kWords(i);
            g.push(subLabel(hanging ? m.x + coilW / 2 + 8 : m.x, hanging ? m.y : m.y - coilW / 2 - 14, 'k', sub, { anchor: hanging ? 'start' : 'middle', size: 15, colour: P.ink, halo: P.paper, after: val }));
          }
        }
      } else {
        const reach = len - 14;
        for (let i = 0; i < n; i++) {
          const off = -spread + i * spacing, a = at(0, off), b = at(reach, off);
          g.push(node('path', { d: spCoilPath(a, b, spTurnsFor(natural - 14), coilW, style), fill: 'none', stroke: P.ink, 'stroke-width': 1.8, 'stroke-linejoin': 'round', class: 'of-coil' }));
          if (ci === labelCopy) {
            // the first spring's label on its outer side, the others on theirs, a little lower each, so they never meet
            const m = at(reach * (0.3 + 0.2 * i), off), [sub, val] = kWords(i), left = i === 0 && n > 1;
            g.push(subLabel(hanging ? m.x + (left ? -1 : 1) * (coilW / 2 + 6) : m.x - 40 + 80 * i, hanging ? m.y : i === 0 ? m.y - coilW / 2 - 12 : m.y + spacing * 0, 'k', sub, { anchor: hanging ? (left ? 'end' : 'start') : 'middle', size: 14, colour: P.ink, halo: P.paper, after: val }));
          }
        }
        const e1 = at(reach, -spread - 6), e2 = at(reach, spread + 6), mid = at(reach);
        g.push(line(e1.x, e1.y, e2.x, e2.y, P.ink, 3), line(mid.x, mid.y, end.x, end.y, P.ink, 1.8));
      }
      // what is on its free end
      const mWords = show('mass') && d.mass !== undefined ? `${fmt(d.mass, 3, lang)} kg` : 'm';
      let far = end;
      if (!c.carries) { g.push(node('circle', { cx: end.x + ax.x * 4, cy: end.y + ax.y * 4, r: 4, fill: P.paper, stroke: P.ink, 'stroke-width': 1.8 })); far = at(len + 8); }
      else if (hanging) {
        if (kind === 'ball') { g.push(ball(end.x, end.y + br, br, P), label(end.x, end.y + br, mWords, { anchor: 'middle', size: 13, italic: mWords === 'm', colour: P.ink })); far = { x: end.x, y: end.y + 2 * br }; }
        else if (kind === 'masses') {
          g.push(line(end.x, end.y, end.x, end.y + 14, P.ink, 2));
          for (let j = 0; j < 3; j++) g.push(node('rect', { x: end.x - 28, y: end.y + 14 + j * 11, width: 56, height: 10, rx: 2, fill: P.soft, stroke: P.ink, 'stroke-width': 1.6 }));
          g.push(label(end.x + 34, end.y + 30, mWords, { size: 14, italic: mWords === 'm', colour: P.ink, halo: P.paper })); far = { x: end.x, y: end.y + 48 };
        } else { g.push(block(end.x, end.y + bh, bw, bh, mWords, P, { italic: mWords === 'm' })); far = { x: end.x, y: end.y + bh }; }
      } else {
        if (kind === 'ball') { g.push(ball(end.x + br, end.y, br, P), label(end.x + br, end.y, mWords, { anchor: 'middle', size: 13, italic: mWords === 'm', colour: P.ink })); far = { x: end.x + 2 * br, y: end.y }; }
        else { g.push(block(end.x + bw / 2, floorY, bw, bh, mWords, P, { italic: mWords === 'm' })); far = { x: end.x + bw, y: end.y }; }
      }
      // the natural length's line, and the extension from it
      const nat = at(natural);
      if (pic !== 'positions' && c.e !== 0 && d.extensionMark !== false) {
        const xw = show('extension') && extOf(d) !== undefined ? `x = ${fmt(Math.abs(extOf(d)), 3, lang)} m` : 'x';
        if (hanging) {
          const lx = end.x + (joined === 'parallel' ? spread : 0) + 70;
          g.push(line(nat.x - 50 - spread, nat.y, lx + 6, nat.y, P.muted, 1.2, { 'stroke-dasharray': '5 4' }), line(end.x + 30, end.y, lx + 6, end.y, P.muted, 1.2, { 'stroke-dasharray': '5 4' }), dimension(lx, nat.y, lx, end.y, xw, P, { italic: xw === 'x' }));
        } else {
          const ly = floorY - bh - 26 - (joined === 'parallel' ? spread : 0);
          g.push(line(nat.x, nat.y + bh / 2 + 6, nat.x, ly - 6, P.muted, 1.2, { 'stroke-dasharray': '5 4' }), line(end.x, end.y - bh / 2, end.x, ly - 6, P.muted, 1.2, { 'stroke-dasharray': '5 4' }), dimension(nat.x, ly, end.x, ly, xw, P, { side: -1, off: 8, italic: xw === 'x' }));
        }
      }
      if (c.natural && d.lengthMark) {
        const p0 = at(0), lx = p0.x - (hanging ? 60 + spread : 0), ly = hanging ? 0 : p0.y + 40;
        g.push(hanging ? dimension(lx, p0.y, lx, nat.y, 'L₀', P, { side: -1, off: 8, italic: true }) : dimension(p0.x, ly, nat.x, ly, 'L₀', P, { italic: true }));
      }
      if (pic === 'positions') {
        const words = c.pos === 0 ? 'x = 0' : `x = ${c.pos < 0 ? '−' : '+'}A`;
        g.push(label(hanging ? far.x : far.x + 40, hanging ? far.y + 22 : end.y, words, { anchor: hanging ? 'middle' : 'start', size: 14, colour: P.ink, halo: P.paper }));
        const mo = d.motion || 'both', toward = (d.moving || 'away') === 'toward';
        // at the ends: at rest, pulled back to the middle; in the middle: fastest, no acceleration
        const cx = hanging ? far.x + 44 : (end.x + far.x) / 2, cy = hanging ? (end.y + far.y) / 2 : end.y - bh / 2 - 22;
        if (c.pos !== 0 && (mo === 'acceleration' || mo === 'both')) { const s1 = -c.pos; g.push(hanging ? motion(cx, cy - s1 * 26, cx, cy + s1 * 26, P.purple) : motion(cx - s1 * 26, cy, cx + s1 * 26, cy, P.purple), label(hanging ? cx + 10 : cx + 30, hanging ? cy : cy - 12, 'a', { size: 15, italic: true, colour: P.purple, halo: P.paper })); }
        if (c.pos === 0 && (mo === 'velocity' || mo === 'both')) { const s1 = toward ? -1 : 1; g.push(hanging ? motion(cx, cy - s1 * 26, cx, cy + s1 * 26, P.blue) : motion(cx - s1 * 26, cy, cx + s1 * 26, cy, P.blue), label(hanging ? cx + 10 : cx + 30, hanging ? cy : cy - 12, 'v', { size: 15, italic: true, colour: P.blue, halo: P.paper })); }
      }
      if (d.appliedForce && c.carries && pic !== 'positions' && c.e !== 0) {
        const sgn = Math.sign(c.e), fw = show('force') && s.force !== undefined ? `F = ${fmt(s.force, 3, lang)} N` : 'F';
        if (hanging) g.push(force(far.x, far.y, far.x, far.y + 56, P.red), label(far.x + 10, far.y + 44, fw, { size: 15, italic: fw === 'F', colour: P.red, halo: P.paper }));
        else { const fx = sgn > 0 ? far.x : far.x + 60; g.push(sgn > 0 ? force(far.x, end.y, far.x + 56, end.y, P.red) : force(far.x + 60, end.y, far.x + 4, end.y, P.red), label(fx + (sgn > 0 ? 30 : -30), end.y - 16, fw, { anchor: 'middle', size: 15, italic: fw === 'F', colour: P.red, halo: P.paper })); }
      }
      H = Math.max(H, hanging ? far.y + (pic === 'positions' ? 40 : d.appliedForce ? 70 : 24) : floorY + 24);
    });
    if (d.equilibriumLine && hanging) {
      const y = baseY + natural * (pic === 'positions' ? 1.5 : 1 + stretch) + (pic === 'positions' ? 0 : 0);
      g.push(line(30, y, 610, y, P.muted, 1.2, { 'stroke-dasharray': '8 5' }));
    }
    if (d.heading) g.push(label(320, 18, text(d.heading, 60), { anchor: 'middle', size: 15, colour: P.ink }));
    return frame(640, Math.max(H, 200), g, { ...o, kind: 'spring' }, o.title || W('spring'));
  },
};
export const SPRING_KINDS = { spring };
