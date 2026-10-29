// Level C: drop-in drawing helpers for porting hand-drawn Canvas 2D games one function at a time. All kit-styled.
import { INK, CREAM, color, outline } from './tokens.js';
import { sky, skyAt } from './sky.js';
import { fontStack } from './text.js';

export function makeDraw(kit) {
  const D = {
    rrect(ctx, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); return ctx; },
    panel(ctx, x, y, w, h, o = {}) {
      D.rrect(ctx, x, y + 4, w, h, o.radius || 20); ctx.fillStyle = INK; ctx.fill();
      D.rrect(ctx, x, y, w, h, o.radius || 20); ctx.fillStyle = o.fill || CREAM; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    },
    button(ctx, x, y, w, h, o = {}) {
      const kind = o.kind || 'go', fill = kind === 'hot' ? color('spark') : kind === 'quiet' ? CREAM : color('mint'), press = kind === 'hot' ? color('spark', 'shade') : kind === 'quiet' ? INK : color('mint', 'shade');
      const down = o.down ? 3 : 0;
      D.rrect(ctx, x, y + 4, w, h, h / 2); ctx.fillStyle = press; ctx.fill();
      D.rrect(ctx, x, y + down, w, h, h / 2); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      if (o.label) D.text(ctx, o.label, x + w / 2, y + down + h / 2, { size: Math.min(28, h * 0.42), weight: 700, rim: false });
    },
    ring(ctx, x, y, r, w = 4) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.stroke(); },
    spark(ctx, x, y, r, o = {}) {
      const q = r * 0.2; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + q, y - q, x + r, y); ctx.quadraticCurveTo(x + q, y + q, x, y + r); ctx.quadraticCurveTo(x - q, y + q, x - r, y); ctx.quadraticCurveTo(x - q, y - q, x, y - r); ctx.closePath();
      ctx.fillStyle = o.fill || color('spark'); ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = outline(r * 2); ctx.strokeStyle = INK; ctx.stroke();
    },
    /** text(ctx, str, x, y, {size, weight, max, align, role, rim, pill}) with the kit font, direction and auto-shrink
     *  to 70%. Big text gets the sticker treatment (Ink outline, Cream rim); text under 18 px on screen is set as Ink on
     *  a Cream pill instead (a thick halo smudges small letters). */
    text(ctx, str, x, y, o = {}) {
      const t = ctx.getTransform ? ctx.getTransform() : null, onScreen = t ? Math.hypot(t.a, t.b) / Math.max(1, kit.win.devicePixelRatio || 1) : 1;
      const size = Math.max(o.size && o.size * onScreen < 12 ? 12 / onScreen : 1, o.size || 24), weight = o.weight || 800;
      ctx.save(); ctx.font = `${weight} ${size}px ${fontStack(kit.i18n.lang)}`; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
      try { ctx.direction = kit.i18n.dir; } catch (e) { /* ignore */ }
      let w = ctx.measureText(str).width;
      if (o.max && w > o.max) { const k = Math.max(0.7, o.max / w); ctx.translate(x, y); ctx.scale(k, 1); x = 0; y = 0; }
      const fill = o.role ? color(o.role) : (o.color || INK);
      const pill = o.pill != null ? o.pill : size * onScreen < 18 && o.rim !== true;
      if (pill) {
        const ph = size * 1.5, pw = w + size * 1.1, x0 = (ctx.textAlign === 'center' ? x - pw / 2 : ctx.textAlign === 'right' || ctx.textAlign === 'end' ? x - pw + size * 0.55 : x - size * 0.55);
        D.rrect(ctx, x0, y - ph / 2, pw, ph, ph / 2); ctx.fillStyle = CREAM; ctx.fill(); ctx.lineWidth = Math.max(1.2, size * 0.09); ctx.strokeStyle = INK; ctx.stroke();
        ctx.fillStyle = o.role || o.color ? fill : INK; ctx.fillText(str, x, y + size * 0.04); ctx.restore(); return;
      }
      if (o.rim !== false) { ctx.lineJoin = 'round'; ctx.strokeStyle = CREAM; ctx.lineWidth = Math.max(4, size * 0.22); ctx.strokeText(str, x, y); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, size * 0.1); ctx.strokeText(str, x, y); }
      ctx.fillStyle = fill; ctx.fillText(str, x, y); ctx.restore();
    },
    /** sprite(ctx, name, x, y, {size, flip}): any kit sprite drawn into a plain canvas (baked once in a helper atlas). */
    sprite(ctx, name, x, y, o = {}) {
      const A = kit.helperAtlas(); const def = A.defs.get(name); if (!def) return;
      const size = o.size || 64; const t = ctx.getTransform ? ctx.getTransform() : null; const s = t ? Math.hypot(t.a, t.b) : 1;
      const id = A.sprite(name, size * s, o.state || ''); const e = A.entries[id]; if (!e) return;
      const w = size * def.w / def.h, ax = def.ax == null ? 0.5 : def.ax, ay = def.ay == null ? 0.5 : def.ay;
      ctx.save(); ctx.translate(x, y); if (o.flip) ctx.scale(-1, 1);
      ctx.drawImage(A.pages[e.page].canvas, e.x, e.y, e.w, e.h, -ax * w, -ay * size, w, size); ctx.restore();
    },
    /** sky(ctx, w, h, {mode:'light'|'dark', timeOfDay}) the biome sky gradient. */
    sky(ctx, w, h, o = {}) {
      const s = sky(o.timeOfDay != null ? o.timeOfDay : o.mode === 'dark' ? 1 : 0); const g = ctx.createLinearGradient(0, 0, 0, h);
      for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, skyAt(s, i / 8));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    },
  };
  return D;
}
