// ======================================================================================================
// PADDLE SMASH vs Jada the jaguar: table tennis seen from the side, under the jungle canopy.
// The reference sport: it shows the whole module interface (docs/jungle-cup-plan.md "Sport module interface").
//   Swing (tap anywhere / Space / A) when the ball reaches your hit zone. Early = a short shot, late = a long one.
//   Perfect and Good swings fill the Pounce meter; when it is full your next hit is a super-fast Pounce.
//   First to 7, win by 2. The first time, a quick warm-up against two marmosets (first to 3).
// Court units: x = 0 is the net, the table top is height 0, Cappy plays from the left.
// ======================================================================================================
(function () {
  const TABLE = 54, NET_H = 9, FLOOR = -46, HIT_X = 64, STAND_X = 79, DEAD_X = 108, GRAV = 430;
  const S = {
    stage: 'match', you: 0, them: 0, target: 7, serve: 'you', serveN: 0, phase: 'serve', phaseT: 0, rally: 0, maxRally: 0, perfects: 0,
    pounce: 0, pounceReady: false, swingT: 9, swingQ: '', themSwingT: 9, speed: 115,
    ball: { x: 0, h: 0, vx: 0, vh: 0, dir: 1, live: false, bounced: 0, pounce: false, smash: false, decided: false, willReturn: true, fromX: 0 },
    trail: [], hitsYou: 0, lastQ: 0, auto: false, pointTo: '', k: 1, ox: 0, oy: 0, bg: null, bgGen: -1, bgK: 0, hint: 1, msg: '', jumpYou: 0, jumpThem: 0, diveThem: 0, diveYou: 0,
  };
  for (let i = 0; i < 6; i++) S.trail.push({ x: 0, h: 0 });
  const HINT = { align: 'center', col: '#fff8e8' };
  const zoneHalf = ctx => (ctx.easy ? 38 : 26) + (S.stage === 'warm' ? 6 : 0);
  function baseSpeed(ctx) { return S.stage === 'warm' ? 85 : ctx.easy ? 96 : 112; }
  function maxSpeed(ctx) { return S.stage === 'warm' ? 125 : ctx.easy ? 170 : 205; }
  /** Launch the ball from (x0, h0) to bounce at xb (the far half) at speed vx (units/s, signed by direction). */
  function launch(x0, h0, xb, vx) {
    const b = S.ball, T = Math.abs(xb - x0) / Math.abs(vx);
    b.x = x0; b.h = h0; b.vx = vx; b.dir = vx > 0 ? 1 : -1; b.vh = (GRAV * T * T / 2 - h0) / T;
    b.live = true; b.bounced = 0; b.decided = false; b.fromX = x0;
    for (const p of S.trail) { p.x = x0; p.h = h0; }
  }
  function point(ctx, who) {
    if (S.phase === 'point') return;
    S.phase = 'point'; S.phaseT = 0; S.pointTo = who;
    if (who === 'you') { S.you++; S.jumpYou = 0.6; ctx.sfx('cheer'); UI.float(ctx.W / 2, ctx.H * 0.3, t('pad.point'), PAL.r4, 2); }
    else { S.them++; S.jumpThem = 0.6; ctx.sfx('miss'); UI.float(ctx.W / 2, ctx.H * 0.3, t(S.stage === 'warm' ? 'pad.pointMarm' : 'pad.pointJada'), '#ffb3d6', 1); }
    S.maxRally = Math.max(S.maxRally, S.rally);
    S.rally = 0; S.ball.smash = false;
  }
  function gameWon() {
    const a = S.you, b = S.them, T = S.target;
    if (S.stage === 'warm') return a >= T ? 'you' : b >= T ? 'them' : '';
    if (a >= T && a - b >= 2) return 'you';
    if (b >= T && b - a >= 2) return 'them';
    // a long deuce ends at 11: the next point after 10-10 wins (golden point)
    if (a >= 11 && a > b) return 'you';
    if (b >= 11 && b > a) return 'them';
    return '';
  }
  function nextServe() {
    S.serveN++;
    if (S.serveN % 2 === 0 || (S.you >= S.target - 1 && S.them >= S.target - 1)) S.serve = S.serve === 'you' ? 'them' : 'you';
    S.phase = 'serve'; S.phaseT = 0; S.ball.live = false; S.speed = baseSpeed(S.ctx);
  }
  function startStage(ctx, stage) {
    S.stage = stage; S.you = 0; S.them = 0; S.target = stage === 'warm' ? 3 : 7; S.serve = 'you'; S.serveN = 0;
    S.rally = 0; S.pounce = 0; S.pounceReady = false; S.phase = 'serve'; S.phaseT = 0; S.ball.live = false; S.speed = baseSpeed(ctx);
  }
  /** Cappy's swing: judge the timing against the ball. */
  function swing(ctx) {
    if (S.swingT < 0.22) return;
    S.swingT = 0;
    ctx.sfx('whoosh');
    if (S.phase === 'serve' && S.serve === 'you') { S.hint = Math.max(0, S.hint - 0.5); serveFrom('you', ctx, 0.7); return; }
    const b = S.ball;
    if (S.phase !== 'rally' || !b.live || b.dir > 0) return;
    const Z = zoneHalf(ctx), d = b.x - (-HIT_X);
    if (Math.abs(d) > Z) { if (d > Z && d < Z * 2.2) UI.float(S.sx(-HIT_X), S.sy(30), t('pad.early'), '#ffe9a0'); return; }
    hitYou(ctx, d / Z);
  }
  function hitYou(ctx, s) {   // s: -1 (late) .. 1 (early)
    const q = 1 - Math.abs(s), b = S.ball;
    let word = 'pad.ok', col = '#fff8e8';
    if (q > 0.72) { word = 'pad.perfect'; col = '#ffd24a'; S.perfects++; S.pounce = Math.min(1, S.pounce + 0.34); }
    else if (q > 0.38) { word = 'pad.good'; col = '#8ee070'; S.pounce = Math.min(1, S.pounce + 0.15); }
    S.lastQ = q; S.swingQ = word; S.hint = Math.max(0, S.hint - 0.2);
    S.rally++; S.speed = Math.min(maxSpeed(ctx), S.speed + 6);
    let vx = S.speed * (0.9 + 0.3 * q), xb = 36 - s * 18, h0 = 12 + (s < 0 ? 6 : 0);
    b.pounce = false; b.smash = false;
    if (S.pounceReady) { S.pounceReady = false; S.pounce = 0; b.pounce = true; vx = ctx.easy ? 250 : 285; xb = 46; h0 = 16; word = 'pad.pounce'; col = '#ff9b2e'; ctx.sfx('pounce'); UI.burst(S.sx(-HIT_X), S.sy(b.h), 14, '#ff9b2e', 70); }
    else if (S.pounce >= 1) S.pounceReady = true;
    UI.float(S.sx(-HIT_X), S.sy(b.h + 18), t(word), col);
    ctx.sfx('tick'); UI.burst(S.sx(-HIT_X), S.sy(b.h), 5, '#fff8e8', 40);
    launch(-HIT_X, Math.max(4, b.h), xb, vx);
  }
  function serveFrom(who, ctx, q) {
    S.phase = 'rally'; S.phaseT = 0; S.rally = 0;
    const dir = who === 'you' ? 1 : -1;
    const xb = (30 + Math.random() * 18) * dir;
    if (who === 'you') { S.swingT = 0; ctx.sfx('tick'); } else { S.themSwingT = 0; ctx.sfx('tock'); }
    launch(-HIT_X * dir, 14, xb, S.speed * 0.95 * dir);
    S.ball.pounce = false; S.ball.smash = false;
    void q;
  }
  /** The champion decides, as the ball crosses the net, whether this one comes back. */
  function decide(ctx) {
    const b = S.ball; b.decided = true;
    let p = S.stage === 'warm' ? 0.8 : ctx.easy ? 0.72 : 0.9;
    p -= Math.max(0, (Math.abs(b.vx) - 110) / 300);
    const xb = Math.abs(b.fromX) > 0 ? 0 : 0; void xb;
    if (S.lastQ > 0.72) p -= 0.07;
    if (S.rally > 9) p -= (S.rally - 9) * 0.05;
    if (b.pounce) p = S.stage === 'warm' ? 0.05 : ctx.easy ? 0.12 : 0.22;
    b.willReturn = Math.random() < clamp(p, 0.04, 0.97);
  }
  function hitThem(ctx) {
    const b = S.ball;
    S.themSwingT = 0; ctx.sfx('tock'); UI.burst(S.sx(HIT_X), S.sy(b.h), 5, '#fff8e8', 40);
    let vx = S.speed * (0.95 + Math.random() * 0.15), xb = -(20 + Math.random() * 36), h0 = 13;
    b.smash = false;
    if (S.stage !== 'warm' && S.lastQ < 0.38 && Math.random() < 0.5) { vx = Math.min(250, S.speed * 1.35); xb = -(32 + Math.random() * 14); h0 = 20; b.smash = true; UI.float(S.sx(HIT_X), S.sy(b.h + 20), t('pad.smash'), '#ff9b2e'); }
    b.pounce = false;
    launch(HIT_X, Math.max(4, b.h), xb, -vx);
  }
  function update(dt, ctx) {
    S.ctx = ctx;
    S.swingT += dt; S.themSwingT += dt; S.phaseT += dt;
    if (S.jumpYou > 0) S.jumpYou -= dt; if (S.jumpThem > 0) S.jumpThem -= dt; if (S.diveThem > 0) S.diveThem -= dt; if (S.diveYou > 0) S.diveYou -= dt;
    const b = S.ball;
    if (S.phase === 'serve') {
      if (S.serve === 'them' && S.phaseT > 1.0) serveFrom('them', ctx, 0.7);
      else if (S.serve === 'you' && (S.phaseT > 4 || (S.auto && S.phaseT > 0.4))) { S.swingT = 9; swing(ctx); }
    } else if (S.phase === 'point') {
      if (S.phaseT > 1.3) {
        const w = gameWon();
        if (w) {
          if (S.stage === 'warm') {
            ctx.markWarm(); startStage(ctx, 'match'); UI.banner(t('pad.warmDone'), PAL.r4, 2);
            ctx.say([{ who: 'jada', key: 'd.jada.ready' }]);
          } else {
            S.phase = 'over';
            const margin = S.you - S.them, won = w === 'you';
            const stars = won ? 1 + (margin >= 3 ? 1 : 0) + (margin >= 5 || (margin >= 3 && S.perfects >= 10) ? 1 : 0) : 0;
            const score = S.you * 100 + S.perfects * 20 + S.maxRally * 15 + (won ? 500 + margin * 50 : 0);
            ctx.finish({ score, stars, won, frac: won ? stars / 3 : (S.you / S.target) * 0.3, stats: { you: S.you, them: S.them, perfects: S.perfects } });
          }
        } else nextServe();
      }
    }
    if (b.live) {
      // the trail (ring buffer, no allocation)
      for (let i = S.trail.length - 1; i > 0; i--) { S.trail[i].x = S.trail[i - 1].x; S.trail[i].h = S.trail[i - 1].h; }
      S.trail[0].x = b.x; S.trail[0].h = b.h;
      b.x += b.vx * dt; b.vh -= GRAV * dt; b.h += b.vh * dt;
      // bounce on the table, or on the floor past it
      if (b.h <= 0 && b.vh < 0 && Math.abs(b.x) <= TABLE) { b.h = 0; b.vh = -b.vh * 0.82; b.bounced++; ctx.sfx('tock'); }
      if (b.h <= FLOOR && b.vh < 0) { b.h = FLOOR; b.vh = -b.vh * 0.5; }
      if (S.phase === 'rally') {
        if (b.dir > 0) {
          if (!b.decided && b.x > 0) decide(ctx);
          if (b.decided && b.x >= HIT_X) {
            if (b.willReturn) hitThem(ctx);
            else if (!S.diveThem) { S.diveThem = 0.5; S.themSwingT = 0; }
          }
          if (b.x > DEAD_X) point(ctx, 'you');
        } else {
          if (S.auto && b.x <= -HIT_X + 1 && b.x > -HIT_X - 6) { S.swingT = 9; swing(ctx); }
          if (b.x < -HIT_X - zoneHalf(ctx) && !S.diveYou) { S.diveYou = 0.5; UI.float(S.sx(-HIT_X), S.sy(26), t('pad.miss'), '#ffb3d6'); }
          if (b.x < -DEAD_X) point(ctx, 'them');
        }
      }
      if (Math.abs(b.x) > 140) b.live = false;
    }
  }
  /* ---------- drawing ---------- */
  function layout(ctx) {
    const W = ctx.W, H = ctx.H;
    S.k = Math.max(1, Math.floor(Math.min(W / 200, (H - 70) / 130)));
    // the floor sits low, leaving room under it for the Pounce meter and the hint
    S.ox = Math.round(W / 2); S.oy = Math.round(H - 58 + FLOOR * S.k);
    if (S.oy - 72 * S.k < 34) S.oy = 34 + 72 * S.k;
  }
  S.sx = x => S.ox + x * S.k;
  S.sy = h => S.oy - h * S.k;
  function buildBg(ctx) {
    const W = ctx.W, H = ctx.H, c = JC.canvas2(W, H), g = c.getContext('2d'), k = S.k;
    const D = JC.draw;
    // sky through the canopy, tree trunks, vines, the clay court floor
    g.fillStyle = '#2f6a4a'; g.fillRect(0, 0, W, H);
    const floorY = S.sy(FLOOR);
    for (let y = 0; y < floorY; y += 2) { const kk = y / floorY; g.fillStyle = kk < 0.3 ? '#9fd8a8' : kk < 0.55 ? '#5fae7a' : kk < 0.8 ? '#3f8a5a' : '#2f6a4a'; g.fillRect(0, y, W, 2); }
    for (let i = 0; i < 9; i++) { const x = ((i * 97) % (W + 60)) - 30, w = 10 + (i % 3) * 8; g.fillStyle = i % 2 ? '#3b5a3a' : '#4a6a42'; g.fillRect(x, 0, w, floorY); g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x + w - 3, 0, 3, floorY); }
    for (let x = -20; x < W + 20; x += 22) { D.disc(g, x, 6 + (x % 3) * 4, 20, '#1f5a34'); D.disc(g, x + 8, 2, 14, '#2f7d3c'); }
    for (let x = 0; x < W; x += 3) { const r = JC.hash(x, 1, 9); if (r < 0.35) for (let y = 10; y < 10 + r * 120; y++) { g.fillStyle = y % 6 ? '#2a7a30' : '#8ee070'; g.fillRect(x + Math.round(Math.sin(y / 6) * 1.5), y, 1, 1); } }
    // spectators on a branch (Mango and friends)
    const by = Math.max(30, S.sy(70) - 8);
    g.fillStyle = '#5e3820'; g.fillRect(0, by + 14, W, 4); g.fillStyle = '#7a4a26'; g.fillRect(0, by + 14, W, 1);
    const fans = ['mango', 'marmoset', 'zuzu', 'coco_down', 'pip_down', 'marmoset'];
    for (let i = 0; i < fans.length; i++) { const s = SPRITES[fans[i]]; if (!s) continue; const x = Math.round(W * (0.12 + i * 0.16)); if (Math.abs(x - W / 2) < 12) continue; g.drawImage(s.c, x, by + 14 - s.h); }
    // floor
    g.fillStyle = '#b8744a'; g.fillRect(0, floorY, W, H - floorY);
    g.fillStyle = '#a0623c'; for (let y = floorY + 4; y < H; y += 6) g.fillRect(0, y, W, 1);
    g.fillStyle = '#d08a5a'; g.fillRect(0, floorY, W, 1);
    // the table (side-on): top edge, front face, legs, the net
    const tx0 = S.sx(-TABLE), tx1 = S.sx(TABLE), ty = S.sy(0);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(tx0 + 4 * k, floorY - k, tx1 - tx0 - 8 * k, 3 * k);
    for (const lx of [-TABLE + 6, -6, 6, TABLE - 6]) { g.fillStyle = OUT; g.fillRect(S.sx(lx) - k, ty, 3 * k, floorY - ty); g.fillStyle = '#5a5a6a'; g.fillRect(S.sx(lx), ty, k, floorY - ty); }
    g.fillStyle = OUT; g.fillRect(tx0 - k, ty - k, tx1 - tx0 + 2 * k, 6 * k);
    g.fillStyle = '#2a8a5a'; g.fillRect(tx0, ty, tx1 - tx0, 4 * k);
    g.fillStyle = '#5fd08a'; g.fillRect(tx0, ty, tx1 - tx0, k);
    g.fillStyle = '#fff8e8'; g.fillRect(tx0, ty, 2 * k, 4 * k); g.fillRect(tx1 - 2 * k, ty, 2 * k, 4 * k);
    g.fillStyle = '#1f6a44'; g.fillRect(tx0, ty + 3 * k, tx1 - tx0, k);
    // net
    const nx = S.sx(0);
    g.fillStyle = OUT; g.fillRect(nx - k, S.sy(NET_H) - k, 3 * k, (NET_H + 1) * k);
    g.fillStyle = '#e8e8f0'; g.fillRect(nx, S.sy(NET_H), k, NET_H * k);
    for (let h = 1; h < NET_H; h += 2) { g.fillStyle = '#b8b8c8'; g.fillRect(nx - k, S.sy(h), 3 * k, k); }
    g.fillStyle = '#fff8e8'; g.fillRect(nx - k, S.sy(NET_H) - k, 3 * k, k);
    S.bg = c; S.bgGen = VIEW.gen; S.bgK = k;
  }
  function drawPaddle(g, x, y, ang, col) {
    // a round paddle at (x, y) (screen), angle in radians
    const k = S.k, D = JC.draw, hx = x - Math.cos(ang) * 5 * k, hy = y - Math.sin(ang) * 5 * k;
    D.line(g, x, y, hx, hy, '#5e3820');
    D.disc(g, x, y, 3 * k + 1, OUT); D.disc(g, x, y, 3 * k, col); D.disc(g, x - k, y - k, k, shade(col, 0.5));
  }
  function drawPlayers(g, ctx) {
    const k = S.k, floorY = S.sy(FLOOR);
    // Cappy (left), facing right
    const yJ = S.jumpYou > 0 ? Math.round(Math.sin(S.jumpYou / 0.6 * Math.PI) * 8 * k) : 0;
    const cx = S.sx(-STAND_X), sprC = SPRITES[(((ctx.t * 4) | 0) % 2 && S.phase === 'rally') ? 'cappy_right_w' : 'cappy_right'];
    JC.draw.shadow(g, cx, floorY, 8 * k);
    JC.sprK(g, sprC, cx - 8 * k * 2 / 2, floorY - 16 * k * 2 + 2 * k - yJ, 2 * k);
    const hat = SAVE.data.cos.hat && SPRITES['hat_' + SAVE.data.cos.hat]; if (hat) JC.sprK(g, hat, cx - 2 * k, floorY - 32 * k - yJ, 2 * k);
    const sw = clamp(S.swingT / 0.22, 0, 1), angC = S.swingT < 0.22 ? lerp(2.4, -0.6, easeOut(sw)) : 1.2;
    drawPaddle(g, cx + 12 * k + Math.round(Math.cos(angC) * 4 * k), floorY - 22 * k - yJ - Math.round(Math.sin(angC) * 6 * k), angC + Math.PI, '#e04848');
    // the champion (right)
    const yT = S.jumpThem > 0 ? Math.round(Math.sin(S.jumpThem / 0.6 * Math.PI) * 8 * k) : 0;
    const jx = S.sx(STAND_X) + (S.diveThem > 0 ? Math.round(Math.sin(S.diveThem / 0.5 * Math.PI) * 6 * k) : 0);
    if (S.stage === 'warm') {
      const m = SPRITES.marmoset, active = S.rally % 2;
      for (let i = 0; i < 2; i++) { const x = jx - 10 * k + i * 18 * k, on = i === active; JC.draw.shadow(g, x, floorY, 6 * k); JC.sprK(g, m, x - m.w * k, floorY - m.h * 2 * k - (on ? yT : 0), 2 * k, true); }
    } else {
      const js = SPRITES.jada, bob = S.phase === 'rally' ? (((ctx.t * 4) | 0) % 2) * k : 0;
      JC.draw.shadow(g, jx, floorY, 8 * k);
      JC.sprK(g, js, jx - 8 * 2 * k, floorY - 32 * k - yT - bob, 2 * k);
    }
    const swT = clamp(S.themSwingT / 0.22, 0, 1), angJ = S.themSwingT < 0.22 ? lerp(0.6, 3.6, easeOut(swT)) : 2.0;
    drawPaddle(g, jx - 12 * k - Math.round(Math.cos(angJ - Math.PI) * 4 * k), floorY - 22 * k - yT - Math.round(Math.sin(angJ) * 6 * k), angJ - Math.PI, '#3a7bd5');
  }
  function draw(g, ctx) {
    layout(ctx);
    if (S.bgGen !== VIEW.gen || S.bgK !== S.k || !S.bg) buildBg(ctx);
    g.drawImage(S.bg, 0, 0);
    const k = S.k, b = S.ball;
    // the hit zone: a soft band at Cappy's end that glows while the ball is in it
    const Z = zoneHalf(ctx), zx0 = S.sx(-HIT_X - Z), zw = Z * 2 * k, zy = S.sy(40), zh = S.sy(-2) - zy;
    const inZone = b.live && b.dir < 0 && S.phase === 'rally' && Math.abs(b.x + HIT_X) <= Z;
    for (let i = 0; i < 4; i++) { g.globalAlpha = (inZone ? 0.3 : 0.1) * (1 - i * 0.22); g.fillStyle = inZone ? '#ffd24a' : '#fff8e8'; g.fillRect(zx0 + i * 2 * k, zy + i * 3 * k, zw - i * 4 * k, zh - i * 3 * k); }
    const pz = Math.max(1, Math.round(Z * 0.28 * k)); g.globalAlpha = inZone ? 0.45 : 0.18; g.fillStyle = '#ffd24a'; g.fillRect(S.sx(-HIT_X) - pz, zy, pz * 2, zh); g.globalAlpha = 1;
    for (let x = zx0; x < zx0 + zw; x += 4 * k) { g.fillStyle = inZone ? '#ffd24a' : 'rgba(255,248,232,0.5)'; g.fillRect(x, S.sy(-2), 2 * k, k); }
    drawPlayers(g, ctx);
    // the ball, its trail and its shadow
    if (b.live) {
      const shH = Math.abs(b.x) <= TABLE && b.h >= 0 ? 0 : FLOOR;
      g.globalAlpha = 0.3; JC.draw.oval(g, S.sx(b.x), S.sy(shH) + (shH ? 0 : -k), 2 * k, k, '#000'); g.globalAlpha = 1;
      for (let i = S.trail.length - 1; i >= 1; i--) { const p = S.trail[i]; g.globalAlpha = (1 - i / S.trail.length) * 0.5; JC.draw.disc(g, S.sx(p.x), S.sy(p.h), Math.max(1, k), b.pounce ? '#ff9b2e' : b.smash ? '#ff5a5a' : '#fff3c0'); }
      g.globalAlpha = 1;
      const r = Math.max(2, Math.round(1.5 * k));
      JC.draw.disc(g, S.sx(b.x), S.sy(b.h), r + 1, OUT); JC.draw.disc(g, S.sx(b.x), S.sy(b.h), r, b.pounce ? '#ffb030' : '#fff8e8'); g.fillStyle = '#ffffff'; g.fillRect(S.sx(b.x) - 1, S.sy(b.h) - 1, 1, 1);
    } else if (S.phase === 'serve') {
      const sxv = S.serve === 'you' ? S.sx(-HIT_X + 6) : S.sx(HIT_X - 6), toss = Math.abs(Math.sin(S.phaseT * 4)) * 10 * k;
      JC.draw.disc(g, sxv, S.sy(18) - toss, Math.max(2, Math.round(1.5 * k)) + 1, OUT); JC.draw.disc(g, sxv, S.sy(18) - toss, Math.max(2, Math.round(1.5 * k)), '#fff8e8');
    }
    // HUD: the score panels, the Pounce meter, the hint
    const champ = S.stage === 'warm' ? t('name.marm') : t('name.jada');
    HUD.versus(g, { name: t('name.cappy'), score: S.you, of: S.target, col: '#45c34e' }, { name: champ, score: S.them, of: S.target, col: '#ff9b2e' });
    const mw = Math.min(110, ctx.W - 20), my = Math.min(ctx.H - 26, S.sy(FLOOR) + 6);
    HUD.meter(g, 8, my, mw, t(S.pounceReady ? 'pad.pounceReady' : 'pad.pounceMeter'), S.pounceReady ? 1 : S.pounce, '#ff9b2e', S.pounceReady);
    if (S.stage === 'warm' && S.phase !== 'over') text(g, t('pad.warm'), ctx.W / 2, 32, { align: 'center', col: PAL.r4 });
    if (S.hint > 0.05 && (S.phase === 'serve' || S.phase === 'rally')) {
      const hk = S.phase === 'serve' && S.serve === 'you' ? (ctx.touch ? 'pad.hintServeTouch' : 'pad.hintServeKeys') : (ctx.touch ? 'pad.hintTouch' : 'pad.hintKeys');
      g.globalAlpha = clamp(S.hint * 2, 0, 1); textBlock(g, t(hk), 6, my + 22, ctx.W - 12, HINT); g.globalAlpha = 1;
    }
  }
  JC.register({
    id: 'paddle',
    champion: 'jada',
    music: 'paddle',
    start(ctx) {
      S.ctx = ctx; S.perfects = 0; S.maxRally = 0; S.hint = ctx.firstTime ? 1.5 : 0.6; S.auto = false;
      S.swingT = 9; S.themSwingT = 9; S.jumpYou = 0; S.jumpThem = 0; S.diveThem = 0; S.diveYou = 0; S.lastQ = 0;
      startStage(ctx, ctx.warmedUp ? 'match' : 'warm');
      if (!ctx.warmedUp) UI.banner(t('pad.warmBanner'), PAL.r4, 1.6);
    },
    update,
    draw,
    onInput(e, ctx) {
      if ((e.type === 'press' && e.key === 'a') || e.type === 'down') swing(ctx);
    },
    outro(dt, ctx) { update(dt, ctx); },
    /** Test hooks: the state, a bot that swings perfectly, and a quick result. */
    testState() { return { stage: S.stage, you: S.you, them: S.them, target: S.target, phase: S.phase, serve: S.serve, rally: S.rally, pounce: S.pounce, pounceReady: S.pounceReady, perfects: S.perfects, ball: { x: Math.round(S.ball.x), h: Math.round(S.ball.h), live: S.ball.live, dir: S.ball.dir }, auto: S.auto }; },
    test: {
      auto(ctx, on) { S.auto = !!on; return S.auto; },
      point(ctx, who) { point(ctx, who === 'them' ? 'them' : 'you'); return S.you + ':' + S.them; },
      skipWarm(ctx) { ctx.markWarm(); startStage(ctx, 'match'); return S.stage; },
    },
    cheat(won) { const you = won ? 7 : 3, them = won ? 3 : 7; S.you = you; S.them = them; return { score: you * 100 + (won ? 700 : 0), stars: won ? 2 : 0, won, frac: won ? 0.67 : 0.13 }; },
  });
})();
