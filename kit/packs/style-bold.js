// Art pack "style-bold" (public/vendor/oomba-kit/<version>/packs/style-bold.js): the Bold style for 12-14 year olds.
// A game opts in with Oomba.game({ style: 'bold' }) (or Oomba.style('bold') before Oomba.stage) and this pack's tag.
// Same Oomba Ink rules (Ink line, sticker rim, ring eyes, the 4-point spark); what changes:
// - the cast: about 3 heads tall (longer legs, a smaller head), no blush, narrowed eyes, 'determined' by default
//   (the core does the faces; this pack sets the proportions);
// - wear: hood (up), visor, headset, helmet, cap-back; jersey, bomber, techvest (the strip glows at night);
// - the UI: deep surfaces, neon accents (mint, cyan, magenta, volt), 8-10 px corners;
//   pill-shaped big buttons with a neon glow (the kit's rounded Play), a slanted condensed title with a neon edge,
//   HUD numbers in the game font with tabular figures; characters on the dark cards get a light rim;
// - scenes start at golden hour / dusk;
// - biomes: cyber (a neon skyline at night), skate (a concrete park), station (a space station), haunted (friendly).
export const PACK = { name: 'style-bold' };
export function define(K) {
  const P = K.P, m = K.mix, TAU = Math.PI * 2, I = K.ink, INK = K.INK, kit = K.kit;
  const NEON = { mint: '#2EF2A0', cyan: '#2ED8FF', mag: '#FF3DA8', volt: '#FFE14D' }, DEEP = '#121826', SURF = '#1E2738';
  Object.assign(K.style, { legs: 1.6, head: 0.84, body: 0.9 });
  // ---- wear ----
  const st = (ctx, k, p, fill, shade, o) => I.sticker(ctx, k, p, Object.assign({ fill, shade, shadeOff: 2, rim: false }, o));
  K.wear('hood', { hat: (hx, top, rx) => {
    const p = new Path2D(); p.ellipse(hx, top + rx * 0.95, rx + 8, rx + 9, 0, Math.PI * 1.02, Math.PI * 1.98); p.lineTo(hx + rx + 8, top + rx * 1.6); p.quadraticCurveTo(hx + rx * 0.7, top + rx * 0.5, hx, top + rx * 0.35); p.quadraticCurveTo(hx - rx * 0.7, top + rx * 0.5, hx - rx - 8, top + rx * 1.6); p.closePath();
    return { p, draw: (ctx, k) => st(ctx, k, p, '#2B3550', '#1B2236', { shadeOff: 3 }) };
  } });
  K.wear('visor', { hat: (hx, top, rx) => {
    const p = I.rrect(hx - rx - 3, top + rx * 0.62, rx * 2 + 6, rx * 0.42, rx * 0.2);
    return { p, draw: (ctx, k) => { st(ctx, k, p, NEON.cyan, '#1D8FB0', { unlit: true }); I.glow(k, p); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(hx - rx * 0.6, top + rx * 0.68, rx * 0.5, rx * 0.08); } };
  } });
  K.wear('headset', { hat: (hx, top, rx) => {
    const band = new Path2D(); band.ellipse(hx, top + 24, rx + 4, rx - 3, 0, Math.PI + 0.3, TAU - 0.3);
    const cup = I.rrect(hx - rx - 6, top + 22, 13, 22, 5), mic = new Path2D(); mic.moveTo(hx - rx, top + 40); mic.quadraticCurveTo(hx - rx * 0.6, top + rx * 2.2, hx - rx * 0.1, top + rx * 2.05);
    return { p: cup, draw: (ctx, k) => { ctx.lineCap = 'round'; for (const [s, c] of [[I.lines(k).w * 1.8, INK], [I.lines(k).w * 0.8, '#3A4560']]) { ctx.strokeStyle = c; ctx.lineWidth = s; ctx.stroke(band); ctx.stroke(mic); } st(ctx, k, cup, '#3A4560', '#232B40'); const l = I.ellipse(hx - rx * 0.1, top + rx * 2.05, 3, 3); st(ctx, k, l, NEON.mag, NEON.mag, { unlit: true }); I.glow(k, l); } };
  } });
  K.wear('helmet', { hat: (hx, top, rx) => {
    const p = new Path2D(); p.ellipse(hx, top + rx * 0.62, rx + 6, rx * 0.9, 0, Math.PI, TAU); p.closePath();
    return { p, draw: (ctx, k) => { st(ctx, k, p, NEON.mag, '#B0206F', { shadeOff: 3, gloss: [hx - rx * 0.4, top + 4, 6, 2.5, -0.3] }); ctx.fillStyle = NEON.volt; ctx.fillRect(hx - 3, top - rx * 0.25, 6, rx * 0.85); } };
  } });
  K.wear('cap-back', { hat: (hx, top, rx) => {
    const p = new Path2D(); p.ellipse(hx, top + rx * 0.55, rx + 2, rx * 0.72, 0, Math.PI, TAU); p.closePath(); const b = I.rrect(hx + rx * 0.5, top + rx * 0.3, rx * 0.75, 7, 3.5);
    return { p, draw: (ctx, k) => { st(ctx, k, b, '#2B3550', '#1B2236'); st(ctx, k, p, NEON.mint, '#18A86C', { shadeOff: 3 }); } };
  } });
  const bodyWear = (name, draw) => K.wear(name, { body: draw });
  bodyWear('jersey', (ctx, k, b) => { ctx.save(); ctx.fillStyle = NEON.volt; ctx.fillRect(b.cx - b.w / 2, b.mid + 6, b.w, 5); ctx.fillStyle = '#FFFFFF'; ctx.font = `800 ${b.w * 0.42}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('7', b.cx, b.mid + 2); ctx.restore(); });
  bodyWear('bomber', (ctx, k, b) => { const z = new Path2D(); z.moveTo(b.cx, b.top + 4); z.lineTo(b.cx, b.bot - 2); I.detail(ctx, k, z, 1.4); const c = I.rrect(b.cx - b.w * 0.4, b.top - 2, b.w * 0.8, 7, 3.5); st(ctx, k, c, NEON.mag, '#B0206F', { line: 0.7 }); const pt = I.ellipse(b.cx - b.w * 0.22, b.mid - 2, 4, 4); st(ctx, k, pt, NEON.volt, NEON.volt, { line: 0.6 }); });
  bodyWear('techvest', (ctx, k, b) => { for (const s of [-1, 1]) { const v = I.rrect(b.cx + s * b.w * 0.27 - b.w * 0.17, b.top + 2, b.w * 0.34, b.bot - b.top - 4, 4); st(ctx, k, v, '#2B3550', '#1B2236', { line: 0.8 }); } const g = I.rrect(b.cx - b.w * 0.44, b.mid, b.w * 0.88, 4, 2); ctx.fillStyle = NEON.cyan; ctx.fill(g); I.glow(k, g); });
  // ---- the UI overlay (only under .ok-bold) ----
  const css = `.ok-ui.ok-bold.ok-bold{--ok-card:${SURF};--ok-text:#EAF2FF;--ok-edge:#EAF2FF;--ok-bg2:#263149;--ok-line:#33405C;--ok-glow:rgba(18,24,38,.55);--ok-focus:${NEON.volt};--ok-scrim:rgba(8,10,18,.6)}
.ok-ui.ok-bold .ok-btn{border-radius:14px;border-color:#0A0D14}.ok-ui.ok-bold .ok-big{border-radius:999px;border-width:3.5px;box-shadow:0 6px 0 #0A0D14,0 0 18px rgba(255,225,77,.45)}
.ok-ui.ok-bold .ok-card .ok-portrait{filter:drop-shadow(0 0 1.5px #EAF2FF) drop-shadow(0 0 9px ${NEON.cyan}88)}
.ok-ui.ok-bold .ok-hot{background:${NEON.volt}}.ok-ui.ok-bold .ok-go{background:${NEON.mint}}.ok-ui.ok-bold .ok-quiet,.ok-ui.ok-bold .ok-icon{background:${SURF};color:#EAF2FF}
.ok-ui.ok-bold .ok-card,.ok-ui.ok-bold .ok-bubble{border-radius:12px;border-color:${NEON.cyan};box-shadow:4px 4px 0 #0A0D14}.ok-ui.ok-bold .ok-bubble::after{background:${SURF}}.ok-ui.ok-bold .ok-bubble{background:${SURF};color:#EAF2FF}
.ok-ui.ok-bold .ok-pill{border-radius:10px;border-color:${NEON.cyan};font-variant-numeric:tabular-nums}
.ok-ui.ok-bold .ok-brand{background:#0A0D14;color:#EAF2FF;border-color:${NEON.cyan};box-shadow:0 2px 0 #000,0 0 10px ${NEON.cyan}66}
.ok-ui.ok-bold .ok-title-screen .ok-p{border-radius:8px;border-color:${NEON.mag};font-style:normal}
.ok-ui.ok-bold .ok-h1{letter-spacing:-.035em;transform:skewX(-8deg)}.ok-ui.ok-bold .ok-title-word{rotate:-2deg}.ok-ui.ok-bold .ok-title-word:nth-child(even){rotate:0deg}
.ok-ui.ok-bold .ok-title-word i{background-image:linear-gradient(${NEON.cyan} 15%,#FFFFFF 50%,${NEON.mag} 90%)}
.ok-ui.ok-bold .ok-title-word::before{color:#0A0D14;-webkit-text-stroke-color:#0A0D14}.ok-ui.ok-bold .ok-title-word::after{color:${NEON.mag};-webkit-text-stroke-color:${NEON.mag};filter:drop-shadow(0 .1em 0 #0A0D14) drop-shadow(0 0 .12em ${NEON.mag})}
.ok-ui.ok-bold .ok-tiles{background:#0A0D14;border-radius:12px;border-color:${NEON.cyan}}.ok-ui.ok-bold .ok-tile{border-radius:8px}`;
  const doc = kit.doc, el = doc.createElement('style'); el.textContent = css; (doc.head || doc.documentElement).appendChild(el);
  // scenes start warm (golden hour) in Bold, unless the theme is dark
  const att = kit.attachStage; kit.attachStage = s => { att(s); if (K.style.name === 'bold' && s.tod < 0.5) s.tod = 0.5; };
  // ---- biomes ----
  const blocks = ({ vh, amp, W, R }) => { const b = []; for (let x = 0; x < W;) { const w = 30 + R() * 70; b.push([x, x + w, R()]); x += w + (R() < 0.25 ? 6 + R() * 16 : 0); } return x => { const s = b.find(q => x >= q[0] && x < q[1]); return s ? -s[2] - (s[2] > 0.8 ? 0.4 : 0) : 0; }; };
  const ramps = ({ W }) => x => { const u = (x / W * 7) % 1; return u < 0.5 ? -Math.sin(u * Math.PI * 2) * 0.8 : 0; };
  const D = {
    neon(ctx, mx, x, y, s, R, fill, shade, k, Dk) { const c = [NEON.cyan, NEON.mag, NEON.mint, NEON.volt][(R() * 4) | 0]; ctx.fillStyle = c; mx.fillStyle = 'rgba(255,255,255,.95)'; for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) if (R() < 0.6) { const p = new Path2D(); p.rect(x - 10 * s + j * 12 * s, y + 8 * s + i * 12 * s, 7 * s, 6 * s); ctx.fill(p); mx.fill(p); } },
    sign(ctx, mx, x, y, s, R, fill, shade, k, Dk) { const c = [NEON.cyan, NEON.mag, NEON.volt][(R() * 3) | 0], h = 40 * s, p = I.rrect(x - 16 * s, y - h - 18 * s, 32 * s, 16 * s, 3 * s), pole = new Path2D(); pole.rect(x - 1.5 * s, y - h, 3 * s, h); Dk.blob(ctx, mx, pole, '#3A4560', INK, k, 2 * s); ctx.fillStyle = '#0A0D14'; ctx.fill(p); ctx.strokeStyle = c; ctx.lineWidth = 2.5 * s; ctx.stroke(p); mx.strokeStyle = 'rgba(255,255,255,.95)'; mx.lineWidth = 2.5 * s; mx.stroke(p); },
    rail(ctx, mx, x, y, s, R, fill, shade, k, Dk) { const p = new Path2D(); p.rect(x - 34 * s, y - 16 * s, 68 * s, 3.5 * s); for (const dx of [-28, 28]) p.rect(x + dx * s - 1.6 * s, y - 16 * s, 3.2 * s, 16 * s); Dk.blob(ctx, mx, p, '#C6CFE0', '#7E8AA3', k, 3 * s); },
    graffiti(ctx, mx, x, y, s, R) { const c = [NEON.mag, NEON.cyan, NEON.volt, NEON.mint][(R() * 4) | 0]; ctx.strokeStyle = c; ctx.lineWidth = 4 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 14 * s, y + 18 * s); ctx.quadraticCurveTo(x, y + 4 * s, x + 6 * s, y + 20 * s); ctx.quadraticCurveTo(x + 12 * s, y + 30 * s, x + 18 * s, y + 12 * s); ctx.stroke(); },
    porthole(ctx, mx, x, y, s, R, fill, shade, k, Dk) { const r = 11 * s, p = I.ellipse(x, y + 26 * s, r, r); ctx.fillStyle = '#0B1030'; ctx.fill(p); ctx.fillStyle = '#FFFFFF'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + (R() - 0.5) * r * 1.4, y + 26 * s + (R() - 0.5) * r * 1.4, 1 * s, 0, TAU); ctx.fill(); } Dk.ink(ctx, mx, p, 3 * s); },
    ghost(ctx, mx, x, y, s, R, fill, shade, k, Dk) { if (R() < 0.5) return; const h = 30 * s, w = 20 * s, p = new Path2D(), gy = y - h - 10 * s - R() * 20 * s; p.moveTo(x - w / 2, gy + h); p.lineTo(x - w / 2, gy + w / 2); p.arc(x, gy + w / 2, w / 2, Math.PI, 0); p.lineTo(x + w / 2, gy + h); for (let i = 0; i < 3; i++) p.quadraticCurveTo(x + w / 2 - (i + 0.5) * w / 3, gy + h - 6 * s, x + w / 2 - (i + 1) * w / 3, gy + h); p.closePath(); Dk.blob(ctx, mx, p, '#EEF0FF', '#B8B2E8', k, w / 2); for (const dx of [-4, 4]) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + dx * s, gy + w * 0.55, 2.4 * s, 0, TAU); ctx.fill(); } },
  };
  const night = ['#0B1030', '#3A1F6B'];
  K.biome('cyber', { sky: [night[0], '#5B2A86', 1], skyHold: true, stars: 0.6, clouds: false, bands: [
    ['#4A3F9B', '#36307A', 'blocks', 'neon'], ['#3A3486', '#2A2668', 'blocks', 'neon'], ['#2A2A66', '#1E1E4E', 'blocks', 'neon'], ['#2B3550', '#1B2236', 'hills', 'sign:160']],
  ground: ['#3A4560', '#2B3550', '#1B2236', NEON.cyan] }, { decos: D, profiles: { blocks } });
  K.biome('skate', { sky: ['#2E9BE8', '#FFC59A', 0.7], bands: [
    [m('#7CC4F5', P.stone[1], 0.4), m('#5E9FD8', P.stone[2], 0.4), 'blocks', ''], [P.stone[1], P.stone[2], 'ramps', 'graffiti:90'], ['#C6CFE0', '#9AA5BD', 'ramps', 'rail:260,graffiti:120'], ['#D7DEEA', '#A9B3C8', 'hills', 'rail:300']],
  ground: ['#C6CFE0', '#9AA5BD', '#7E8AA3', NEON.mag] }, { decos: D, profiles: { blocks, ramps } });
  K.biome('station', { sky: ['#05071A', '#1B1F4A', 1], skyHold: true, clouds: false, sun: false, stars: 1, bands: [
    ['#33416B', '#24305A', 'blocks', 'porthole:60,neon'], ['#3D4F80', '#2B3A66', 'blocks', 'neon'], ['#4A5E92', '#36487A', 'blocks', 'porthole:80,neon'], ['#5B6E9E', '#465985', 'hills', 'sign:220']],
  ground: ['#6D7A99', '#4A5672', '#2B3550', NEON.cyan] }, { decos: D, profiles: { blocks } });
  K.biome('haunted', { sky: ['#2A1E5C', '#7A55C9', 1], skyHold: true, clouds: false, sun: 'moon', bands: [
    ['#3B2E73', '#2A1E5C', 'peaks', ''], ['#45357F', '#33266A', 'blocks', 'ghost:120'], ['#3A5A4A', '#2A4436', 'hills', 'pine:70c,ghost:200'], ['#466B54', '#335040', 'hills', 'pine:160c,rocks:200']],
  ground: ['#466B54', '#335040', '#3A2A4A', P.grape[1]] }, { decos: D });
  K.dress({ recipes: { cyber: { fg: 'rocksfg', life: '' }, skate: { fg: 'rocksfg', life: 'bird' }, station: { life: '' }, haunted: { fg: 'fern', life: 'leaf' } } });
}
