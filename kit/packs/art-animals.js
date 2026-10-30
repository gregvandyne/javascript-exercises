// Art pack "art-animals" (public/vendor/oomba-kit/<version>/packs/art-animals.js): seven more rigged species in the
// "Oomba Ink" style, so the cast reaches 13 (with the core's oomba, kid, fox, bunny, frog and bee): cat, dog, bear,
// mouse, owl, penguin and duck. Each is geometry plus a few drawing hooks on the core character builder, so they get
// every clip, face, mood, blink, look-at, wear item and the night grade for free. No creature wears spark yellow.
export const PACK = { name: 'art-animals' };
export function define(K) {
  const P = K.P;
  const two = (o = {}) => Object.assign({ head: [60, 54, 34, 28], neck: [60, 80], eyes: [[47, 53], [73, 53]], eyeD: 19, mouth: [60, 71], body: [76, 124, 42], hips: [[51, 118], [69, 118]], leg: [22, 7], sh: [[44, 91], [76, 91]], arm: [21, 6], armOut: 7, tail: [74, 118], ring: 0.17 }, o);
  const one = (o = {}) => Object.assign({ head: [60, 98, 39, 46], neck: [60, 146], eyes: [[46, 86], [74, 86]], eyeD: 24, mouth: [60, 104], hips: [[47, 140], [73, 140]], leg: [5, 7], sh: [[22, 106], [98, 106]], arm: [17, 9], armOut: 3, ears: [60, 56], one: true, ring: 0.18 }, o);
  const clipHead = (ctx, H, fn) => { ctx.save(); ctx.clip(H.head); fn(); ctx.restore(); };
  const whiskers = (ctx, k, H, y) => { const [hx] = H.G.head; for (const s of [-1, 1]) for (const d of [-3, 3]) { const w = new Path2D(); w.moveTo(hx + s * 13, y + d * 0.6); w.quadraticCurveTo(hx + s * 24, y + d * 1.4 - 1, hx + s * 33, y + d * 2.2); H.detail(ctx, k, w, 0.8); } };
  const nose = (ctx, k, H, y, w, fill) => { const [hx] = H.G.head, n = new Path2D(); n.moveTo(hx - w, y - 1.5); n.quadraticCurveTo(hx, y - 3.5, hx + w, y - 1.5); n.quadraticCurveTo(hx, y + w * 1.1, hx - w, y - 1.5); n.closePath(); H.flat(ctx, k, n, fill, 0.6); };
  const tailPart = (H, box, paths, fill, shade, tip) => ({ box, pivot: H.G.tail, draw(ctx, k) { H.rim(ctx, k, paths); for (const p of paths) H.shaded(ctx, k, p, fill, shade, null, 3); if (tip) H.shaded(ctx, k, tip, H.CREAM, P.cream[3], null, 2); } });
  const feet = H => [P.peach[2], P.peach[3], P.peach[2]];
  // a beak is the mouth: drawn with the face, so it opens to talk, cheer or gasp
  const beak = (x, y, w, h) => (ctx, k, H, open) => {
    const top = new Path2D(); top.moveTo(x - w, y); top.quadraticCurveTo(x, y - h * 0.35, x + w, y); top.quadraticCurveTo(x + w * 0.2, y + h * 0.7, x, y + h); top.quadraticCurveTo(x - w * 0.2, y + h * 0.7, x - w, y); top.closePath();
    if (open) { const low = new Path2D(); low.moveTo(x - w * 0.7, y + h * 0.5); low.quadraticCurveTo(x, y + h * 1.6, x + w * 0.7, y + h * 0.5); low.closePath(); H.sticker(ctx, k, low, { fill: P.coral[2], shade: P.peach[3], shadeOff: 1, rim: false }); }
    H.sticker(ctx, k, top, { fill: P.peach[2], shade: P.peach[3], shadeOff: 2, rim: false });
  };

  // cat: lilac, pointed ears with pink insides, a little muzzle, whiskers and a long curling tail
  K.species('cat', { color: 'grape', belly: 'cream', browed: true, mouth: 'w', hats: true, geom: two({ head: [60, 54, 33, 29], mouth: [60, 70] }),
    paw: H => H.light,
    headBack: H => { const [hx, hy] = H.G.head; return [-1, 1].map(s => { const p = new Path2D(); p.moveTo(hx + s * 30, hy - 2); p.quadraticCurveTo(hx + s * 33, hy - 32, hx + s * 26, hy - 40); p.quadraticCurveTo(hx + s * 14, hy - 34, hx + s * 7, hy - 22); p.closePath();
      const q = new Path2D(); q.moveTo(hx + s * 25, hy - 10); q.quadraticCurveTo(hx + s * 27, hy - 28, hx + s * 24, hy - 32); q.quadraticCurveTo(hx + s * 16, hy - 27, hx + s * 12, hy - 20); q.closePath();
      return { p, draw: (ctx, k) => { H.shaded(ctx, k, p, H.fill, H.shade, null, 3); H.flat(ctx, k, q, P.coral[1], 0.5); } }; }); },
    headFront: (ctx, k, H) => { const [hx, hy] = H.G.head; clipHead(ctx, H, () => H.flat(ctx, k, H.ellipse(hx, hy + 13, 13, 9), H.CREAM, 0.6)); nose(ctx, k, H, hy + 8, 3.6, P.coral[2]); whiskers(ctx, k, H, hy + 12); },
    parts: H => ({ tail: tailPart(H, [60, 70, 118, 134], [H.capsule(72, 120, 98, 113, 5.5), H.capsule(98, 113, 103, 88, 5.5)], H.fill, H.shade, H.circ(103, 88, 5.6)) }),
  });
  // dog: golden, floppy cocoa ears, a pale muzzle with a big Ink nose and a soft smile, a short wagging tail
  K.species('dog', { color: 'peach', belly: 'cream', browed: true, hats: true, geom: two({ head: [60, 54, 35, 29], eyes: [[47, 52], [73, 52]], mouth: [60, 73], tail: [76, 116] }),
    paw: H => H.light,
    headBack: H => { const [hx, hy] = H.G.head; return [-1, 1].map(s => { const p = H.ellipse(hx + s * 33, hy + 4, 9.5, 19, s * 0.32); return { p, fill: P.cocoa[2], shade: P.cocoa[3] }; }); },
    headFront: (ctx, k, H) => { const [hx, hy] = H.G.head; clipHead(ctx, H, () => H.flat(ctx, k, H.ellipse(hx, hy + 15, 14, 9.5), P.peach[0], 0.6)); H.flat(ctx, k, H.ellipse(hx, hy + 8, 5.6, 4), H.INK, 0.6); },   // a soft smile: no teeth
    parts: H => ({ tail: tailPart(H, [62, 80, 106, 128], [H.capsule(74, 114, 91, 93, 5.5)], H.fill, H.shade, H.circ(91, 93, 5.6)) }),
  });
  // bear: cocoa, round ears, a light muzzle, a stubby round tail, a wider body
  K.species('bear', { color: 'cocoa', belly: 'peach', browed: true, hats: true, geom: two({ head: [60, 56, 36, 30], neck: [60, 84], eyes: [[47, 54], [73, 54]], eyeD: 18, mouth: [60, 74], body: [80, 126, 50], hips: [[49, 120], [71, 120]], leg: [20, 8], sh: [[41, 95], [79, 95]], arm: [20, 7], armOut: 8, tail: [82, 120] }),
    paw: H => P.cocoa[1],
    headBack: H => { const [hx, hy] = H.G.head; return [-1, 1].map(s => { const p = H.circ(hx + s * 26, hy - 24, 10.5); return { p, draw: (ctx, k) => { H.shaded(ctx, k, p, H.fill, H.shade, null, 2.5); H.flat(ctx, k, H.circ(hx + s * 26, hy - 23, 5.2), P.cocoa[1], 0.5); } }; }); },
    headFront: (ctx, k, H) => { const [hx, hy] = H.G.head; clipHead(ctx, H, () => H.flat(ctx, k, H.ellipse(hx, hy + 15, 14, 10), P.cocoa[1], 0.6)); nose(ctx, k, H, hy + 10, 5, H.INK); },
    parts: H => ({ tail: tailPart(H, [68, 106, 98, 134], [H.circ(84, 121, 8)], H.fill, H.shade) }),
  });
  // mouse: stone grey, big round ears with pink insides, a pink nose, whiskers, a long thin tail
  K.species('mouse', { color: 'stone', belly: 'cream', browed: true, hats: true, geom: two({ head: [60, 62, 30, 26], neck: [60, 86], eyes: [[48, 60], [72, 60]], eyeD: 18, mouth: [60, 76], body: [84, 128, 38], hips: [[52, 122], [68, 122]], leg: [18, 6], sh: [[46, 98], [74, 98]], arm: [18, 5], armOut: 6, tail: [72, 124] }),
    paw: H => P.coral[1],
    headBack: H => { const [hx, hy] = H.G.head; return [-1, 1].map(s => { const p = H.circ(hx + s * 25, hy - 21, 15); return { p, draw: (ctx, k) => { H.shaded(ctx, k, p, H.fill, H.shade, null, 3); H.flat(ctx, k, H.circ(hx + s * 25, hy - 20, 9), P.coral[1], 0.5); } }; }); },
    headFront: (ctx, k, H) => { const [, hy] = H.G.head; nose(ctx, k, H, hy + 9, 3.4, P.coral[2]); whiskers(ctx, k, H, hy + 11); },
    parts: H => ({ tail: tailPart(H, [62, 98, 120, 140], [H.capsule(72, 124, 98, 129, 2.6), H.capsule(98, 129, 110, 110, 2.6)], P.coral[1], P.coral[2]) }),
  });
  // owl: a round cocoa body, ear tufts, light facial discs around big eyes, a small beak, a cream chest with feathers
  K.species('owl', { color: 'cocoa', belly: 'cream', browed: true, mouth: 'beak', lid: P.peach[0], geom: one({ eyeD: 26, eyes: [[45, 86], [75, 86]], ring: 0.12 }), legs: feet,
    headBack: H => { const [hx, hy, rx, ry] = H.G.head, top = hy - ry; return [-1, 1].map(s => { const p = new Path2D(); p.moveTo(hx + s * (rx - 10), top + 14); p.quadraticCurveTo(hx + s * (rx - 4), top + 2, hx + s * (rx - 2), top - 5); p.quadraticCurveTo(hx + s * (rx - 14), top + 1, hx + s * (rx - 22), top + 9); p.closePath(); return { p }; }); },
    headFront: (ctx, k, H) => { const [hx] = H.G.head;
      // pale facial discs (no outline of their own, so the eye is one clean ring on a light face, never a mask)
      for (const [x, y] of H.G.eyes) H.sticker(ctx, k, H.circ(x, y + 1, 17), { fill: P.peach[0], rim: false, ink: false });
      clipHead(ctx, H, () => { H.flat(ctx, k, H.ellipse(hx, 128, 25, 19), H.CREAM, 0.6); for (const [x, y] of [[50, 124], [62, 120], [56, 132], [70, 130]]) { const v = new Path2D(); v.moveTo(x - 4, y - 2); v.quadraticCurveTo(x, y + 2, x + 4, y - 2); H.detail(ctx, k, v, 0.8); } });
    },
    beak: beak(60, 98, 6, 11),
  });
  // penguin: sky blue with a cream face and front, a peach beak and feet, flipper arms
  K.species('penguin', { color: 'sky', belly: 'cream', browed: true, mouth: 'beak', geom: one({ head: [60, 98, 37, 47], eyes: [[48, 86], [72, 86]], eyeD: 21, sh: [[24, 106], [96, 106]], arm: [22, 7], armOut: 6 }), legs: feet,
    headFront: (ctx, k, H) => { const [hx] = H.G.head;
      clipHead(ctx, H, () => { const f = new Path2D(); f.moveTo(hx, 80); f.bezierCurveTo(hx - 10, 64, hx - 34, 70, hx - 30, 92); f.bezierCurveTo(hx - 32, 120, hx - 24, 148, hx, 148); f.bezierCurveTo(hx + 24, 148, hx + 32, 120, hx + 30, 92); f.bezierCurveTo(hx + 34, 70, hx + 10, 64, hx, 80); f.closePath(); H.flat(ctx, k, f, H.CREAM, 0.7); });
    },
    beak: beak(60, 97, 7, 9),
  });
  // duck: snow white with a wide peach bill, a little head curl, peach feet
  K.species('duck', { color: 'snow', belly: 'cream', browed: true, mouth: 'beak', hats: true, geom: one({ head: [60, 100, 38, 44], eyes: [[48, 86], [72, 86]], eyeD: 20 }), legs: feet,
    headBack: H => { const p = H.capsule(60, 60, 68, 48, 3.6); return [{ p }]; },
    beak: (ctx, k, H, open) => { const b = H.rrect(45, open ? 92 : 96, 30, 13, 6.5); if (open) H.sticker(ctx, k, H.rrect(48, 101, 24, 11, 5.5), { fill: P.peach[3], rim: false }); H.sticker(ctx, k, b, { fill: P.peach[2], shade: P.peach[3], shadeOff: 2, rim: false }); const m = new Path2D(); m.moveTo(49, open ? 99 : 103); m.quadraticCurveTo(60, open ? 102 : 106, 71, open ? 99 : 103); H.detail(ctx, k, m, 0.9); },
  });
}
