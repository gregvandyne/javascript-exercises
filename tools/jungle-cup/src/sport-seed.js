// ======================================================================================================
// SEED SHOT vs Tico the toucan: a slingshot target range on the lagoon. 60 seconds, head to head.
//   Fruit rides on lily pads drifting across the lagoon in three rows: near (50 points), mid (75), far (100).
//   Touch: put a finger down anywhere, pull back (down = farther, sideways = aim) and let go to fire a seed.
//   Keys: Left / Right move the aim ring, Up / Down pick the row, Space fires.
//   Seeds take a moment to land, so aim a little ahead of a drifting fruit. Hits in a row add a combo bonus.
//   Tico fires from his post on the other side of the shore: steady at first, faster near the end. Beat his score.
// Targets are fruit only (nothing ever aims at an animal). Screen units are virtual pixels; the rows are laid out
// from the view size each frame.
// ======================================================================================================
(function () {
  const TIME = 60, ROWS = 3, PER_ROW = 4, POINTS = [100, 75, 50], FLIGHT = [0.62, 0.5, 0.38], RELOAD = 0.42;
  const S = {
    time: 0, you: 0, tico: 0, hits: 0, shots: 0, streak: 0, bestStreak: 0, over: false, won: false, finishT: 0,
    aimX: 0, aimRow: 1, aimOn: true, drag: false, dragId: -1, sx: 0, sy: 0, pullX: 0, pullY: 0, reload: 0, auto: false, autoT: 0, sigma: 0,
    ticoT: 2, ticoFlap: 0, cappyRecoil: 0, hint: 1, ctx: null,
    k: 1, bgK: 0, rowY: [0, 0, 0], kr: [1, 1, 2], pullHint: 0, finishWait: 0, rowSpd: [0, 0, 0], rowDir: [1, -1, 1], lagTop: 0, lagBot: 0, slX: 0, slY: 0, tcX: 0, tcY: 0, W: 0, H: 0,
    fruit: [], seeds: [], rips: [], bg: null, bgGen: -1, pads: null, padsGen: -1,
  };
  for (let r = 0; r < ROWS; r++) for (let i = 0; i < PER_ROW; i++) S.fruit.push({ row: r, i, x: 0, on: true, gone: 0, pop: 0, bob: 0, kind: 0 });
  for (let i = 0; i < 8; i++) S.seeds.push({ on: false, who: 0, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, T: 0.5, row: 0, target: null, hit: false });
  for (let i = 0; i < 12; i++) S.rips.push({ on: false, x: 0, y: 0, t: 0, big: false });
  const HIT_R = [7, 10, 12], BASE_K = [1, 2, 2];
  /** How close a seed must land to a fruit's centre (bigger when the fruit is drawn bigger, and with Easier champions). */
  const hitR = (ctx, r) => Math.round(HIT_R[r] * (1 + (S.kr[r] / BASE_K[r] - 1) * 0.5)) + (ctx.easy ? 3 : 0);

  /* ---------- sprites ---------- */
  function grid(w, h) { const g = []; for (let y = 0; y < h; y++) { const r = []; for (let x = 0; x < w; x++) r.push('.'); g.push(r); } return g; }
  function stamp(g, rows, ox, oy) { for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) { const c = rows[j][i], y = oy + j, x = ox + i; if (c !== '.' && c !== ' ' && y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c; } }
  /** A 2-pixel-wide outlined limb (here: a raised wing) along points [x, y, x, y, ...]. */
  function limb(g, pts, fill) {
    const H = g.length, W = g[0].length, cells = [];
    for (let s = 0; s + 3 < pts.length; s += 2) {
      const x0 = pts[s], y0 = pts[s + 1], x1 = pts[s + 2], y1 = pts[s + 3], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
      for (let k = 0; k <= n; k++) { const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n); cells.push(x, y, x + 1, y); }
    }
    const inside = (x, y) => y >= 0 && y < H && x >= 0 && x < W;
    for (let c = 0; c < cells.length; c += 2) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = cells[c] + dx, y = cells[c + 1] + dy; if (inside(x, y) && g[y][x] === '.') g[y][x] = 'o'; }
    for (let c = 0; c < cells.length; c += 2) if (inside(cells[c], cells[c + 1])) g[cells[c + 1]][cells[c]] = fill;
  }
  const rowsOf = g => g.map(r => r.join(''));
  const TICO_ROWS = [
    '................', '.....ooooo......', '....okkkkko.....', '...okkkkkkko....', '...okyyyewkooo..', '..okyyyyyekbbboo',
    '..okyyyyyobbbbbo', '..okkyyyyoBrrbBo', '..okkkyyoooooooo', '..okkkkrrko.....', '.okKkkkkkko.....', '.okKKkkkkko.....',
    '.okKKkkkkko.....', '..okkkkkko......', '...okk.kko......', '...ooo.ooo......'];
  function ticoFlap() {
    const g = grid(16, 18); stamp(g, TICO_ROWS, 0, 2);
    limb(g, [3, 12, 1, 7, 0, 2], 'K'); limb(g, [4, 12, 3, 8], 'K');
    return rowsOf(g);
  }
  sprite('ss_tico1', ['................', '................'].concat(TICO_ROWS), TICO_PAL);
  sprite('ss_tico2', ticoFlap(), TICO_PAL);
  // the fruit: papaya half (near), mango (mid), a bunch of acai berries (far)
  sprite('ss_papaya', ['....oooooooo....', '..ooGGGGGGGGoo..', '.oGyyyyyyyyyyGo.', 'oGyrrrrrrrrrryGo', 'oGyrrkKkKkKrryGo', 'oGyrrrrrrrrrryGo', '.oGyyyyyyyyyyGo.', '..ooGGGGGGGGoo..', '....oooooooo....'],
    { o: OUT, y: '#ffd24a', r: '#ff7a3a', k: '#2a1a12', K: '#5a3a2a', G: '#6ad34a' });
  sprite('ss_mango', ['....oo..', '...oGGo.', '..ooGoo.', '.oyyrro.', 'oyyyrrro', 'oyyrrrro', 'oyrrrrro', '.orrrro.', '..oooo..'],
    { o: OUT, y: '#ffd24a', r: '#ff8a2a', G: '#3d9a2e' });
  sprite('ss_berry', ['....oGo..', '..ooGGoo.', '.opPoopPo', 'oPPPopPPo', 'opPoPPPo.', 'oPPopPoPo', '.oooPPPo.', '...ooo...'],
    { o: OUT, p: '#d08af0', P: '#7a3ab0', G: '#3d9a2e' });
  sprite('ss_seed', ['.oo.', 'obBo', 'oBBo', '.oo.'], { o: OUT, b: '#e8bd7c', B: '#9a6234' });
  const FRUIT = ['ss_berry', 'ss_mango', 'ss_papaya'];
  const T_L = { col: PAL.white, align: 'left' }, T_R = { col: PAL.white, align: 'right' }, T_VAL = { col: PAL.r4, align: 'left' };
  const HINT = { align: 'center', col: '#fff8e8' }, ROWLBL = { align: 'left', col: '#fff8e8' }, STREAK = { align: 'center', col: '#ffb030' }, T_TIME = { align: 'center', col: PAL.white };

  /* ---------- layout ---------- */
  /** The scene is drawn k times bigger on big views (whole pixels), so the lagoon reads the same on a phone and a laptop. */
  function layout(ctx) {
    S.k = Math.max(1, Math.floor(Math.min(ctx.W / 300, ctx.H / 165)));
    const W = Math.ceil(ctx.W / S.k), H = Math.ceil(ctx.H / S.k);
    if (W === S.W && H === S.H) return;
    const first = !S.W;
    S.W = W; S.H = H;
    S.lagTop = Math.max(60, Math.round(H * 0.24));
    S.lagBot = H - Math.max(46, Math.round(H * 0.13));
    const L = S.lagBot - S.lagTop;
    S.rowY[0] = Math.round(S.lagTop + L * 0.2); S.rowY[1] = Math.round(S.lagTop + L * 0.5); S.rowY[2] = Math.round(S.lagTop + L * 0.82);
    const big = L > 150; S.kr[0] = big ? 2 : 1; S.kr[1] = 2; S.kr[2] = big ? 3 : 2; S.padsGen = -1;
    S.slX = Math.round(W * 0.42); S.slY = H - 10;
    S.tcX = W - 24; S.tcY = H - 12;
    if (first) S.aimX = S.slX;
    // spread the fruit across the row (wrapping round the edges)
    for (const f of S.fruit) f.x = ((f.i + (f.row % 2) * 0.5) / PER_ROW) * (W + 60) - 30;
  }
  const wrapW = () => S.W + 60;

  /* ---------- play ---------- */
  function rowSpeed(ctx, r) { const k = 1 + 0.25 * (S.time / TIME); return [33, 25, 18][r] * (ctx.easy ? 0.72 : 1) * k; }
  function fruitX(f, dt) { let x = f.x + S.rowDir[f.row] * S.rowSpd[f.row] * dt; const w = wrapW(); x = ((x + 30) % w + w) % w - 30; return x; }
  function fire(ctx, who, x1, row, target) {
    let sd = null; for (const s of S.seeds) if (!s.on) { sd = s; break; }
    if (!sd) return null;
    sd.on = true; sd.who = who; sd.row = row; sd.target = target; sd.t = 0; sd.T = FLIGHT[row] + (who ? 0.08 : 0);
    sd.x0 = who ? S.tcX - 16 : S.slX; sd.y0 = who ? S.tcY - 38 : S.slY - 44; sd.x1 = x1; sd.y1 = S.rowY[row] - 4; sd.hit = false;
    ctx.sfx('twang');
    return sd;
  }
  function shoot(ctx) {
    if (S.over || S.reload > 0) return;
    if (!fire(ctx, 0, S.aimX, S.aimRow, null)) return;
    S.reload = RELOAD; S.shots++; S.cappyRecoil = 0.25; S.hint = Math.max(0, S.hint - 0.35);
  }
  function land(ctx, sd) {
    const r = sd.row, R = hitR(ctx, r);
    let hit = null;
    if (sd.who === 0) {
      let bd = 1e9;
      for (const f of S.fruit) if (f.row === r && f.on) { const d = Math.abs(f.x - sd.x1); if (d <= R && d < bd) { bd = d; hit = f; } }
    } else if (sd.target && sd.target.on && sd.hit) hit = sd.target;
    if (hit) {
      hit.on = false; hit.gone = 1.4 + Math.random() * 0.6; hit.pop = 0.5;
      const col = r === 0 ? '#c07ae0' : r === 1 ? '#ff8a2a' : '#ff7a3a';
      UI.burst(hit.x * S.k, (S.rowY[r] - 6) * S.k, 10, col, 60); ctx.sfx('pop');
      if (sd.who === 0) {
        S.hits++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak);
        const bonus = S.streak >= 2 ? Math.min(25, (S.streak - 1) * 5) : 0;
        S.you += POINTS[r] + bonus;
        UI.float(hit.x * S.k, (S.rowY[r] - 22) * S.k, label('ss.plus' + r, POINTS[r] + bonus), bonus ? '#ffd24a' : '#8ee070', S.k);
        if (S.streak >= 3) UI.float(hit.x * S.k, (S.rowY[r] - 34) * S.k, label('ss.combo', S.streak), '#ffb030', S.k);
      } else {
        S.tico += POINTS[r];
        UI.float(hit.x * S.k, (S.rowY[r] - 22) * S.k, label('ss.tico' + r, POINTS[r]), '#ffb3d6', S.k);
      }
    } else {
      ripple(sd.x1, S.rowY[r], r === 2);
      ctx.sfx('splash');
      if (sd.who === 0) { S.streak = 0; }
    }
  }
  function ripple(x, y, big) { for (const p of S.rips) if (!p.on) { p.on = true; p.x = x; p.y = y; p.t = 0; p.big = big; UI.burst(x * S.k, (y - 2) * S.k, 5, '#c8f6ff', 40); return; } }
  /** Tico's turn: he picks a fruit, leads it, and lands it most of the time; faster as the clock runs down. */
  function ticoShoot(ctx) {
    const rr = ctx.rng(), row = rr < 0.2 ? 0 : rr < 0.55 ? 1 : 2;
    let f = null;
    for (let k = 0; k < PER_ROW * 2 && !f; k++) { const c = S.fruit[row * PER_ROW + ((ctx.rng() * PER_ROW) | 0)]; if (c.on && c.x > 20 && c.x < S.W - 40) f = c; }
    if (!f) return;
    const T = FLIGHT[row] + 0.08, lead = fruitX(f, T);
    const p = ctx.easy ? 0.5 : 0.6, hit = ctx.rng() < p;
    const sd = fire(ctx, 1, hit ? lead : lead + (ctx.rng() < 0.5 ? -1 : 1) * (hitR(ctx, row) + 6 + ctx.rng() * 8), row, f);
    if (sd) { sd.hit = hit; S.ticoFlap = 0.35; }
  }
  function update(dt, ctx) {
    S.ctx = ctx; layout(ctx);
    S.time += dt;
    if (S.reload > 0) S.reload -= dt;
    if (S.ticoFlap > 0) S.ticoFlap -= dt;
    if (S.cappyRecoil > 0) S.cappyRecoil -= dt;
    // keys: move the aim ring
    if (!S.drag) {
      const dx = (ctx.held.right ? 1 : 0) - (ctx.held.left ? 1 : 0);
      if (dx) { S.aimX = clamp(S.aimX + dx * 120 * dt, 10, S.W - 10); S.aimOn = true; }
    }
    // the fruit drifts (and comes back after it is hit)
    for (let r = 0; r < ROWS; r++) S.rowSpd[r] = rowSpeed(ctx, r);
    for (const f of S.fruit) {
      f.x = fruitX(f, dt); f.bob += dt;
      if (f.pop > 0) f.pop -= dt;
      if (!f.on) { f.gone -= dt; if (f.gone <= 0 && (f.x < -10 || f.x > S.W + 10 || f.gone < -2)) { f.on = true; f.pop = 0; } }
    }
    for (const sd of S.seeds) if (sd.on) { sd.t += dt; if (sd.t >= sd.T) { sd.on = false; land(ctx, sd); } }
    for (const p of S.rips) if (p.on) { p.t += dt; if (p.t > 0.8) p.on = false; }
    // Tico: steady at first, quicker near the end
    S.ticoT -= dt;
    if (S.ticoT <= 0 && !S.over) {
      ticoShoot(ctx);
      const k = S.time / TIME, a = ctx.easy ? 3.8 : 3.0, b = ctx.easy ? 2.6 : 1.9;
      S.ticoT = lerp(a, b, k) * (0.85 + ctx.rng() * 0.3);
    }
    if (S.auto) bot(dt, ctx);
    if (!S.over && S.time >= TIME) {
      S.over = true; S.finishT = S.time;
      let busy = false; for (const sd of S.seeds) if (sd.on) busy = true;
      if (busy) S.finishWait = 0.7; else end(ctx);
    }
    if (S.over && S.finishWait > 0) { S.finishWait -= dt; if (S.finishWait <= 0) end(ctx); }
  }
  function end(ctx) {
    S.finishWait = 0;
    S.won = S.you > S.tico;
    const stars = S.won ? 1 + (S.you >= 1300 ? 1 : 0) + (S.you >= 1800 ? 1 : 0) : 0;
    const frac = S.won ? [0.34, 0.67, 1][stars - 1] : clamp(S.you / Math.max(1, S.tico), 0, 1) * 0.32;
    UI.banner(t(S.won ? 'ss.youWin' : 'ss.ticoWins'), S.won ? PAL.r4 : '#ffb3d6', 1.2);
    ctx.sfx(S.won ? 'cheer' : 'miss');
    ctx.finish({ score: S.you, stars, won: S.won, frac, stats: { you: S.you, tico: S.tico, hits: S.hits, shots: S.shots, streak: S.bestStreak } });
  }
  /** The test bot: aims at the most valuable fruit it can lead well, fires about once a second (sigma = aim error in px). */
  function bot(dt, ctx) {
    S.autoT -= dt;
    if (S.autoT > 0 || S.reload > 0 || S.over) return;
    let best = null, bv = -1;
    for (const f of S.fruit) {
      if (!f.on) continue;
      const lx = fruitX(f, FLIGHT[f.row]);
      if (lx < 12 || lx > S.W - 12) continue;
      const v = POINTS[f.row] - Math.abs(lx - S.aimX) * 0.1;
      if (v > bv) { bv = v; best = f; }
    }
    if (!best) return;
    // a careful bot leads exactly; a human-like one (sigma) leads about half as much and wobbles by up to sigma px
    const lead = fruitX(best, FLIGHT[best.row]), now = best.x;
    S.aimRow = best.row; S.aimX = clamp(S.sigma ? lerp(now, lead, 0.6) + (Math.random() * 2 - 1) * S.sigma : lead, 10, S.W - 10);
    shoot(ctx); S.autoT = S.sigma ? 1.5 : 0.9;
  }

  /* ---------- input: pull back and let go (touch / mouse), or keys ---------- */
  function pullAim() {
    // sideways pull aims the other way; pulling down picks a farther row
    const px = S.sx - S.pullX, py = S.pullY - S.sy, step = Math.max(12, Math.min(26, (S.H - S.lagBot) * 0.5));
    S.aimX = clamp(S.slX + px * 2.4, 10, S.W - 10);
    S.aimOn = py >= 6;
    S.aimRow = py < 6 + step ? 2 : py < 6 + step * 2 ? 1 : 0;
  }
  function onInput(e, ctx) {
    if (e.type === 'press') {
      if (e.key === 'a') shoot(ctx);
      else if (e.key === 'up') { S.aimRow = Math.max(0, S.aimRow - 1); S.aimOn = true; ctx.sfx('blip'); }
      else if (e.key === 'down') { S.aimRow = Math.min(2, S.aimRow + 1); S.aimOn = true; ctx.sfx('blip'); }
    } else if (e.type === 'down') {
      S.drag = true; S.dragId = e.id; S.sx = e.x / S.k; S.sy = e.y / S.k; S.pullX = S.sx; S.pullY = S.sy; S.aimOn = false;
    } else if (e.type === 'move' && S.drag && e.id === S.dragId) {
      S.pullX = e.x / S.k; S.pullY = e.y / S.k; pullAim();
    } else if (e.type === 'up' && S.drag && e.id === S.dragId) {
      S.pullX = e.x / S.k; S.pullY = e.y / S.k; pullAim(); S.drag = false;
      if (e.cancel) return;
      if (S.aimOn) shoot(ctx); else { S.aimOn = true; S.hint = Math.max(S.hint, 0.6); UI.float(S.slX * S.k, (S.slY - 56) * S.k, t('ss.pull'), '#ffe9a0', S.k); }
    }
  }

  /* ---------- drawing ---------- */
  function buildBg(ctx) {
    const W = S.W, H = S.H, c = JC.canvas2(W, H), g = c.getContext('2d'), D = JC.draw;
    // far bank: sky, jungle trees, the lagoon's edge
    for (let y = 0; y < S.lagTop; y += 2) { const k = y / S.lagTop; g.fillStyle = k < 0.25 ? '#9fe0f0' : k < 0.5 ? '#bfeccc' : '#86c99a'; g.fillRect(0, y, W, 2); }
    for (let x = -10; x < W + 20; x += 18) { D.disc(g, x, S.lagTop - 22 + ((x * 7) % 11), 16, '#1f5a34'); }
    for (let x = -4; x < W + 20; x += 15) { D.disc(g, x, S.lagTop - 12 + ((x * 5) % 7), 11, '#2f7d3c'); D.disc(g, x - 3, S.lagTop - 16 + ((x * 3) % 5), 5, '#4fa83f'); }
    for (let x = 8; x < W; x += 37) { g.fillStyle = '#5e3820'; g.fillRect(x, S.lagTop - 30, 3, 26); D.disc(g, x + 1, S.lagTop - 34, 9, '#3d8a44'); D.disc(g, x - 2, S.lagTop - 37, 4, '#7cc84a'); }
    for (let x = 12; x < W; x += 29) D.disc(g, x, S.lagTop - 6 - (x % 5), 1, x % 2 ? '#ff6fb5' : '#ffd24a');
    // the lagoon: bands that get lighter towards you
    const L = S.lagBot - S.lagTop, cols = ['#1f6a8a', '#23799a', '#2a88a8', '#3398b4', '#3fa3c0', '#4cb0c8'];
    for (let y = 0; y < L; y += 2) { const i = Math.min(cols.length - 1, Math.floor((y / L) * cols.length)); g.fillStyle = cols[i]; g.fillRect(0, S.lagTop + y, W, 2); }
    g.fillStyle = '#6ad0e0'; g.fillRect(0, S.lagTop, W, 1);
    for (let i = 0; i < 40; i++) { const x = (JC.hash(i, 3, 1) * W) | 0, y = S.lagTop + 4 + ((JC.hash(i, 4, 1) * (L - 8)) | 0); g.fillStyle = 'rgba(200,246,255,0.35)'; g.fillRect(x, y, 4 + (i % 4) * 2, 1); }
    // row guide lines (faint), so the three distances read clearly
    for (let r = 0; r < ROWS; r++) { g.globalAlpha = 0.12; g.fillStyle = '#ffffff'; g.fillRect(0, S.rowY[r] + 3, W, 1); g.globalAlpha = 1; }
    // the near shore: sand, reeds, flowers
    g.fillStyle = '#7fbf5a'; g.fillRect(0, S.lagBot, W, H - S.lagBot); g.fillStyle = '#e3c27d'; g.fillRect(0, S.lagBot, W, 4); g.fillStyle = '#c79a5a'; g.fillRect(0, S.lagBot + 4, W, 1);
    g.fillStyle = '#5fa848'; for (let y = S.lagBot + 8; y < H; y += 5) for (let x = (y * 3) % 7; x < W; x += 9) g.fillRect(x, y, 2, 1);
    for (let x = 3; x < W; x += 11) { if (Math.abs(x - S.slX) < 22 || Math.abs(x - S.tcX) < 18) continue; g.fillStyle = '#3d9a2e'; g.fillRect(x, S.lagBot - 6 - (x % 4), 1, 8 + (x % 4)); g.fillRect(x + 2, S.lagBot - 3, 1, 5); g.fillStyle = '#6b4a2a'; g.fillRect(x, S.lagBot - 8 - (x % 4), 1, 3); }
    // Tico's post
    g.fillStyle = OUT; g.fillRect(S.tcX - 6, S.tcY - 16, 12, H - S.tcY + 16); g.fillStyle = '#8a5a33'; g.fillRect(S.tcX - 5, S.tcY - 15, 10, H - S.tcY + 15);
    g.fillStyle = '#b07a44'; g.fillRect(S.tcX - 5, S.tcY - 15, 10, 2); g.fillStyle = '#5e3a20'; g.fillRect(S.tcX - 1, S.tcY - 10, 1, 9);
    S.bg = c; S.bgGen = VIEW.gen;
  }
  function buildPads() {
    // a lily pad per row (smaller with distance), with the notch and a highlight
    S.pads = [];
    const sz = [[8, 2], [12, 3], [15, 4]];
    for (let r = 0; r < ROWS; r++) {
      const kp = S.kr[r] / BASE_K[r], rx = Math.round(sz[r][0] * kp), ry = Math.round(sz[r][1] * kp), c = JC.canvas2(rx * 2 + 3, ry * 2 + 3), g = c.getContext('2d');
      JC.draw.oval(g, rx + 1, ry + 1, rx + 1, ry + 1, '#123524'); JC.draw.oval(g, rx + 1, ry + 1, rx, ry, '#3d9a2e'); JC.draw.oval(g, rx, ry, rx - 2, Math.max(1, ry - 1), '#6ad34a');
      g.clearRect(rx + 1, ry - 1, rx + 2, 2); g.fillStyle = '#123524'; g.fillRect(rx + 1, ry, Math.round(rx * 0.7), 1);
      S.pads.push({ c, w: rx * 2 + 3, h: ry * 2 + 3 });
    }
    S.padsGen = VIEW.gen;
  }
  function panel(g, x, y, w, name, val, frac, col, right) {
    box(g, x, y, w, 26, 'rgba(27,19,37,0.82)', PAL.ink);
    text(g, name, right ? x + w - 4 : x + 4, y + 1, right ? T_R : T_L);
    T_VAL.col = col; T_VAL.align = right ? 'right' : 'left';
    const vw = text(g, val, right ? x + w - 4 : x + 4, y + 13, T_VAL);
    const bw = w - vw - 12; if (bw > 10) UI.bar(g, right ? x + 4 : x + vw + 8, y + 15, bw, 7, frac, col);
  }
  /** Time left, top centre (like JC.hud.timer, but in the scene's scale). */
  function timerBox(g, W, secs, frac) {
    const w = 64, x = Math.round((W - w) / 2), y = 32;
    box(g, x, y, w, 20, 'rgba(27,19,37,0.82)', PAL.ink);
    T_TIME.col = secs < 10 ? PAL.r3 : PAL.white;
    text(g, label('hud.secs', Math.max(0, Math.ceil(secs))), x + w / 2, y + 1, T_TIME);
    UI.bar(g, x + 3, y + 13, w - 6, 5, frac, secs < 10 ? PAL.r2 : PAL.w3);
  }
  function drawSling(g, ctx) {
    // Cappy from behind, the slingshot raised, the band pulled back while aiming
    const x = S.slX, y = S.slY, rec = S.cappyRecoil > 0 ? 2 : 0;
    shadow(g, x, y, 12);
    sprK(g, SPRITES.cappy_up, x - 16, y - 32 + rec, 2);
    const hat = SAVE.data.cos.hat && SPRITES['hat_' + SAVE.data.cos.hat]; if (hat) sprK(g, hat, x - 14, y - 36 + rec, 2);
    const fy = y - 44 + rec;
    // the fork
    rect(g, x - 2, fy + 6, 5, 12, OUT); rect(g, x - 1, fy + 6, 3, 12, '#8a5a33');
    rect(g, x - 8, fy - 1, 4, 9, OUT); rect(g, x + 5, fy - 1, 4, 9, OUT); rect(g, x - 7, fy, 2, 8, '#a8743e'); rect(g, x + 6, fy, 2, 8, '#a8743e');
    rect(g, x - 7, fy + 6, 15, 3, OUT); rect(g, x - 6, fy + 7, 13, 1, '#a8743e');
    // the band and the pouch (pulled towards the finger while aiming)
    let px = x, py = fy + 1;
    if (S.drag && S.aimOn) { px = x + clamp((S.pullX - S.sx) * 0.4, -10, 10); py = fy + 1 + clamp((S.pullY - S.sy) * 0.25, 0, 12); }
    line(g, x - 6, fy, px - 1, py, '#ffb030'); line(g, x + 6, fy, px + 1, py, '#ffb030');
    rect(g, px - 2, py - 1, 5, 3, '#5e3a20');
    if (S.reload <= 0) spr(g, SPRITES.ss_seed, px - 2, py - 3);
  }
  function draw(g, ctx) {
    S.ctx = ctx; layout(ctx);
    if (S.bgGen !== VIEW.gen || !S.bg || S.bgK !== S.k || S.bg.width !== S.W) { buildBg(ctx); S.bgK = S.k; }
    g.setTransform(VIEW.S * S.k, 0, 0, VIEW.S * S.k, 0, 0);
    if (S.padsGen !== VIEW.gen || !S.pads) buildPads();
    const W = S.W, H = S.H, D = JC.draw;
    g.drawImage(S.bg, 0, 0);
    // shimmer
    for (let i = 0; i < 14; i++) { const x = ((JC.hash(i, 9, 2) * W + S.time * (8 + i)) % (W + 10)) - 5, y = S.lagTop + 6 + ((JC.hash(i, 8, 2) * (S.lagBot - S.lagTop - 12)) | 0); g.globalAlpha = 0.4 + 0.3 * Math.sin(S.time * 3 + i); rect(g, x, y, 3, 1, '#e8fbff'); }
    g.globalAlpha = 1;
    // the aim ring under the fruit row it points at
    const ar = S.aimRow, showAim = !S.over && S.aimOn;
    if (showAim) { const y = S.rowY[ar]; g.globalAlpha = 0.18; rect(g, 0, y - 10 - ar * 2, W, 16 + ar * 3, '#fff3a8'); g.globalAlpha = 1; }
    // fruit on lily pads, far to near
    for (let r = 0; r < ROWS; r++) {
      const y = S.rowY[r], pad = S.pads[r], sp = SPRITES[FRUIT[r]], k = S.kr[r];
      for (const f of S.fruit) {
        if (f.row !== r) continue;
        const x = Math.round(f.x), bob = Math.round(Math.sin(f.bob * 2.4 + f.i) * 0.8);
        g.drawImage(pad.c, x - (pad.w >> 1), y - (pad.h >> 1) + bob);
        if (f.on) sprK(g, sp, x - ((sp.w * k) >> 1), y - sp.h * k + 1 + bob, k);
        else if (f.pop > 0) { const kk = f.pop / 0.5; g.globalAlpha = kk; spr(g, SPRITES.sparkle, x - 2, y - 14 - (1 - kk) * 14); g.globalAlpha = 1; }
      }
      // row value tag at the left edge
      const lb = label('ss.row' + r, POINTS[r]); box(g, 1, y - 6, textW(lb) + 6, 12, 'rgba(27,19,37,0.7)', PAL.ink); text(g, lb, 4, y - 5, ROWLBL);
    }
    if (showAim) {
      const y = S.rowY[ar], R = hitR(ctx, ar), x = Math.round(S.aimX), ry = Math.max(2, Math.round(R * 0.4)), pulse = ((S.time * 6) | 0) % 2;
      for (let a = 0; a < 20; a++) { const c = Math.cos(a * 0.314), s = Math.sin(a * 0.314); rect(g, x + c * R, y + s * ry, 2, 1, a % 2 ? '#ffd24a' : '#fff8e8'); }
      rect(g, x, y - ry - 3 - pulse, 1, 3, '#ffd24a'); rect(g, x, y + ry + 1, 1, 2, '#ffd24a');
      // a dotted arc from the slingshot to the ring
      if (S.drag) { for (let i = 1; i < 10; i++) { const k = i / 10, ax = lerp(S.slX, x, k), ay = lerp(S.slY - 40, y, k) - Math.sin(k * Math.PI) * 26; rect(g, ax, ay, 1, 1, '#fff8e8'); } }
    }
    for (const p of S.rips) if (p.on) { const rr = 2 + p.t * (p.big ? 18 : 12); g.globalAlpha = 1 - p.t / 0.8; D.oval(g, p.x, p.y, Math.round(rr), Math.max(1, Math.round(rr * 0.35)), '#c8f6ff'); D.oval(g, p.x, p.y, Math.max(0, Math.round(rr) - 1), Math.max(0, Math.round(rr * 0.35) - 1), '#3398b4'); g.globalAlpha = 1; }
    // Tico on his post, Cappy at the slingshot
    const tf = S.ticoFlap > 0 ? 'ss_tico2' : 'ss_tico1', tb = S.ticoFlap > 0 ? 0 : (((S.time * 2) | 0) % 2);
    sprK(g, SPRITES[tf], S.tcX - 16, S.tcY - 18 - 36 + tb, 2, true);
    drawSling(g, ctx);
    // seeds in flight (with their shadows on the water)
    for (const sd of S.seeds) {
      if (!sd.on) continue;
      const k = sd.t / sd.T, x = lerp(sd.x0, sd.x1, k), yb = lerp(sd.y0, sd.y1, k), y = yb - Math.sin(k * Math.PI) * (20 + sd.T * 30);
      g.globalAlpha = 0.3; D.oval(g, x, Math.max(S.lagTop, yb + 4), 2, 1, '#000'); g.globalAlpha = 1;
      sprK(g, SPRITES.ss_seed, x - 2, y - 2, k < 0.5 ? 2 : 1);
    }
    // HUD: scores, the clock, the hint
    const l = Math.ceil(HUD.left() / S.k), wAll = W - l - 6, w = Math.min(150, (wAll - 6) / 2) | 0, top = Math.max(1, S.you, S.tico);
    panel(g, l, 4, w, t('name.cappy'), label('ss.you', S.you), S.you / top, '#45c34e', false);
    panel(g, W - 6 - w, 4, w, t('name.tico'), label('ss.them', S.tico), S.tico / top, '#ff8a2a', true);
    const tNow = S.over ? S.finishT : S.time;
    timerBox(g, W, TIME - tNow, 1 - tNow / TIME);
    if (S.streak >= 2 && !S.over) text(g, label('ss.streak', S.streak), W / 2, 54, STREAK);
    if (S.hint > 0.05 && !S.over) {
      const hk = ctx.touch ? 'ss.hintTouch' : 'ss.hintKeys';
      g.globalAlpha = clamp(S.hint * 2, 0, 1); textBlock(g, t(hk), 6, Math.round((S.rowY[1] + S.rowY[2]) / 2) - 8, W - 12, HINT); g.globalAlpha = 1;
    }
    g.setTransform(VIEW.S, 0, 0, VIEW.S, 0, 0);
  }

  /* ---------- sound ---------- */
  AUDIO.addSfx('pop', (tt, b) => { const P = AUDIO.prims; P.tone(b, 'square', 520, tt, 0.06, 0.18, 1040); P.tone(b, 'square', 1040, tt + 0.05, 0.08, 0.14, 1560); P.noise(b, tt, 0.06, 0.15, 'highpass', 3000); });
  AUDIO.songs.seed = { bpm: 124, steps: 32, leadWave: 'square', harmWave: 'triangle', swing: 0.14,
    lead: 'C5 . E5 G5 . E5 C5 . D5 . F5 A5 . F5 D5 . E5 . G5 C6 . G5 E5 . D5 . B4 G4 . . . .',
    harm: 'E4 . . . E4 . . . F4 . . . F4 . . . G4 . . . G4 . . . F4 . . . D4 . . .',
    bass: 'C3 . G2 . C3 . G2 . D3 . A2 . D3 . A2 . E3 . B2 . E3 . B2 . G2 . D3 . G2 . B2 .',
    drums: 'k.c.s.c.k.ckscc.k.c.s.c.k.cks.uu' };

  JC.register({
    id: 'seed',
    champion: 'tico',
    music: 'seed',
    start(ctx) {
      S.ctx = ctx; S.W = 0; layout(ctx);
      S.time = 0; S.you = 0; S.tico = 0; S.hits = 0; S.shots = 0; S.streak = 0; S.bestStreak = 0; S.over = false; S.won = false; S.finishWait = 0;
      S.aimX = S.slX; S.aimRow = 1; S.aimOn = true; S.drag = false; S.reload = 0; S.auto = false; S.autoT = 0; S.sigma = 0;
      S.ticoT = ctx.easy ? 3.2 : 2.4; S.ticoFlap = 0; S.cappyRecoil = 0; S.hint = ctx.firstTime ? 1.8 : 0.8;
      for (const f of S.fruit) { f.on = true; f.gone = 0; f.pop = 0; f.bob = Math.random() * 3; }
      for (const s of S.seeds) s.on = false;
      for (const p of S.rips) p.on = false;
    },
    update,
    draw,
    onInput,
    outro(dt, ctx) { for (const sd of S.seeds) if (sd.on) { sd.t += dt; if (sd.t >= sd.T) sd.on = false; } for (const p of S.rips) if (p.on) { p.t += dt; if (p.t > 0.8) p.on = false; } },
    testState() {
      return { k: S.k, you: S.you, tico: S.tico, time: Math.round(S.time * 100) / 100, hits: S.hits, shots: S.shots, streak: S.streak, aimX: Math.round(S.aimX), aimRow: S.aimRow,
        aimOn: S.aimOn, drag: S.drag, reload: S.reload > 0, over: S.over, won: S.won, auto: S.auto, slX: S.slX, slY: S.slY, rowY: S.rowY.slice(),
        fruit: S.fruit.filter(f => f.on).map(f => ({ row: f.row, x: Math.round(f.x) })), seeds: S.seeds.filter(s => s.on).length };
    },
    test: {
      auto(ctx, on, sigma) { S.auto = !!on; S.sigma = +sigma || 0; S.autoT = 0; return S.auto; },
      /** Where a fruit in a row will be after its seed's flight time (to aim like a careful player). */
      lead(ctx, row) { let best = null; for (const f of S.fruit) if (f.on && f.row === row) { const x = fruitX(f, FLIGHT[row]); if (x > 20 && x < S.W - 20 && (!best || Math.abs(x - S.slX) < Math.abs(best - S.slX))) best = x; } return best === null ? null : Math.round(best); },
      ticoOff(ctx) { S.ticoT = 999; return true; },
    },
    cheat(won) { S.you = won ? 1500 : 400; S.tico = won ? 900 : 1100; S.over = true; S.won = won; return { score: S.you, stars: won ? 2 : 0, won, frac: won ? 0.67 : 0.12 }; },
  });
})();
