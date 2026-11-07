// ======================================================================================================
// LEAF SLIDE vs Kiki the kinkajou: a 90-second score attack down the muddy slope on a giant leaf (side-on).
//   Cappy slides by himself. Jump (tap / Space / Up) on a mud ramp for a big pop off its lip; a jump on flat mud is
//   only a hop (for hopping logs). In the air, do tricks: Spin (Left / Right, or a tap), Flip (Up), Leaf Grab (Down);
//   on touch, swipe or press the trick buttons. Tricks in one jump make a combo: their points times the number of
//   tricks (a repeat is worth half). Land with no trick still going to bank the points; land mid-trick and it is a
//   wipeout (the combo is lost and the leaf slows down). Berries floating over the landings and hopped logs add a
//   few points. Kiki rides the same slope just ahead and scores on every ramp: beat her score when time runs out.
// World units are virtual pixels: x to the right, y down the screen (the slope goes down to the right).
// ======================================================================================================
(function () {
  const TIME = 90, STEP = 4, LEN = 19000, NS = (LEN / STEP) | 0, GRAV = 480, HOP_V = 75, POP_V = 100, MIN_AIR = 12;
  const TRICKS = { spin: { pts: 100, dur: 0.42 }, flip: { pts: 150, dur: 0.52 }, grab: { pts: 80, dur: 0.34 } };
  const MAXR = 48, MAXL = 48, MAXB = 160, MAXM = 32;
  const S = {
    r: Math.random, ctx: null, seed: 0, auto: false, skill: 1, time: 0, over: false, won: false, endT: 0, hint: 1,
    G: new Float32Array(NS + 2), F: new Uint8Array(NS + 2),
    ramps: new Float32Array(MAXR), rampBig: new Uint8Array(MAXR), rampH: new Float32Array(MAXR), nR: 0,
    logs: new Float32Array(MAXL), nL: 0, mud0: new Float32Array(MAXM), mud1: new Float32Array(MAXM), nM: 0,
    bx: new Float32Array(MAXB), by: new Float32Array(MAXB), bOn: new Uint8Array(MAXB), nB: 0,
    // Cappy
    x: 40, y: 0, vx: 60, vy: 0, air: false, airT: 0, pop: false, crash: 0, landCd: 0, nextLip: 0, nextLog: 0, lowMsg: false,
    trick: '', trickT: 0, trickDur: 0, queue: '', nTr: 0, cSpin: 0, cFlip: 0, cGrab: 0, pend: 0, score: 0, crashes: 0, combos: 0, bestCombo: 0, tricksDone: 0, berries: 0, hops: 0, pops: 0,
    // Kiki
    kx: 90, ky: 0, kvx: 60, kvy: 0, kair: false, kairT: 0, kNextLip: 0, kNextLog: 0, kScore: 0, kTrickQ: 0, kTotal: 0,
    // camera and drawing
    camX: 0, camY: 0, K: 1, A: 2, bgFar: null, bgNear: null, bgGen: -1, bgH: 0, bgW: 0, flash: 0, botCd: 0, botRamp: -1, finished: false,
  };
  const HINT = { align: 'center', col: '#fff8e8' }, T_TR = { align: 'center', col: '#ffe9a0' };
  const T_MULT = { align: 'left', col: PAL.r4 };
  const VA = { name: '', score: 0, col: '#8ee070' }, VB = { name: '', score: 0, col: '#ff6fb5' };
  const B_J = { col: '#3fae4a', glow: false }, B_S = { col: '#ff6fb5', disabled: false }, B_F = { col: '#b06cff', disabled: false }, B_G = { col: '#3fb7ff', disabled: false };

  /* ---------- sprites ---------- */
  const LEAF_ROWS = ['.oo.....................', 'o..o...oooooooooooo.....', '....oooggggggggggggooo..', '...ogllllllllllllllllggoo',
    '...ogggGggggGggggGgggggo', '....ooGGGGGGGGGGGGGGGGoo.', '......ooooooooooooooooo..'];
  sprite('ls_leaf', LEAF_ROWS, { o: OUT, g: '#4fa83f', l: '#c6ec6a', G: '#2f7d3c' });
  sprite('ls_petal', LEAF_ROWS, { o: OUT, g: '#ff6fb5', l: '#ffd0e6', G: '#c8427e' });
  sprite('ls_log', ['..oooooooooooo..', '.obbbbbbbbbbbbo.', 'oolBbbbBbbbbBboo', 'oyrolbbbbBbbbboo', 'oyyolbBbbbbBbboo', '.oo.oooooooooo..'], { o: OUT, b: '#8a5a33', B: '#5e3a20', l: '#b07a44', y: '#e8c88a', r: '#b0885a' });
  sprite('ls_berry', ['..oGo.', '.oppo.', 'opPppo', 'oppPpo', '.oppo.', '..oo..'], { o: OUT, p: '#b06cff', P: '#e0c0ff', G: '#3d9a2e' });
  sprite('ls_fern', ['o...o...o', 'go..g..og', '.go.g.og.', '..gogog..', '...ggg...', '....g....'], { o: '#1f5a34', g: '#4fa83f' });
  sprite('ls_flower', ['.o.o.', 'opopo', '.oyo.', 'opopo', '.o.o.', '..g..', '..g..'], { o: OUT, p: '#ff6fb5', y: '#ffd23f', g: '#2f7d3c' });
  sprite('ls_arrow', ['...o...', '..oyo..', '.oyyyo.', 'oyyyyyo', 'oooyooo', '..oyo..', '..oyo..', '..ooo..'], { o: OUT, y: '#ffd23f' });

  /* ---------- sounds and music ---------- */
  AUDIO.addSfx('lsPop', (t, b) => { const P = AUDIO.prims; P.tone(b, 'square', 260, t, 0.14, 0.18, 720, 0.002, 0.05, 0.4); P.noise(b, t, 0.2, 0.2, 'lowpass', 1200, 0.8, 300); });
  AUDIO.addSfx('lsTrick', (t, b) => { const P = AUDIO.prims; P.tone(b, 'square', 880, t, 0.06, 0.12); P.tone(b, 'square', 1320, t + 0.05, 0.08, 0.12); });
  AUDIO.addSfx('lsLand', (t, b) => { const P = AUDIO.prims; P.noise(b, t, 0.18, 0.3, 'lowpass', 900, 0.7, 200); P.tone(b, 'sine', 140, t, 0.1, 0.4, 70); });
  AUDIO.addSfx('lsSplat', (t, b) => { const P = AUDIO.prims; P.noise(b, t, 0.4, 0.35, 'lowpass', 1600, 0.6, 150); P.tone(b, 'triangle', 300, t, 0.3, 0.2, 90); });
  AUDIO.songs.leaf = { bpm: 150, steps: 32, leadWave: 'square', harmWave: 'triangle', swing: 0.06,
    lead: 'E5 . G5 . B5 - A5 . G5 . E5 . D5 - . . E5 . G5 . B5 - D6 . C6 - B5 . A5 - G5 .',
    harm: 'B4 . . . B4 . . . C5 . . . A4 . . . B4 . . . B4 . . . E5 . . . D5 . . .',
    bass: 'E2 . E3 . E2 . E3 . C3 . C3 . D3 . D3 . E2 . E3 . E2 . E3 . A2 . A2 . B2 . B2 .',
    drums: 'k.h.s.hkk.hks.h.k.h.s.hkk.hksutu' };

  /* ---------- the slope ---------- */
  function build(ctx) {
    const r = S.r, G = S.G, F = S.F;
    S.nR = 0; S.nL = 0; S.nM = 0; S.nB = 0;
    F.fill(0);
    // features along the slope: a ramp, then a stretch with a roller, a log or a mud puddle
    const off = new Float32Array(NS + 2), slope = new Float32Array(NS + 2);
    slope.fill(0.24);
    let x = 300, n = 0;
    while (x < LEN - 700 && S.nR < MAXR) {
      const big = n % 3 === 2, RL = big ? 84 : 64, h = big ? 26 : 17, lip = x + RL;
      S.ramps[S.nR] = lip; S.rampBig[S.nR] = big ? 1 : 0; S.rampH[S.nR] = h; S.nR++;
      for (let px = x; px < lip; px += STEP) { const i = (px / STEP) | 0, k = (px - x) / RL; off[i] -= h * Math.pow(k, 1.7); F[i] = 1; }
      F[(lip / STEP) | 0] = 2;
      // the landing: steeper for a while, so the air is long
      for (let px = lip; px < lip + 210; px += STEP) slope[(px / STEP) | 0] = 0.52;
      x = lip + 210 + 40;
      // the flat stretch between ramps
      const gap = 170 + r() * 110; let gx = x + 20;
      while (gx < x + gap - 50) {
        const pick = r();
        if (pick < 0.4 && S.nL < MAXL) { S.logs[S.nL++] = gx + 30; gx += 90; }
        else if (pick < 0.7) { const len = 70 + r() * 30, hh = 5 + r() * 5; for (let px = gx; px < gx + len; px += STEP) off[(px / STEP) | 0] -= hh * Math.sin(Math.PI * (px - gx) / len); gx += len + 40; }
        else if (S.nM < MAXM) { const len = 60 + r() * 30; S.mud0[S.nM] = gx; S.mud1[S.nM] = gx + len; S.nM++; for (let px = gx; px < gx + len; px += STEP) { const i = (px / STEP) | 0; slope[i] = 0.12; F[i] = 4; } gx += len + 40; }
        else gx += 60;
      }
      x += gap;
      n++;
    }
    let y = 0;
    for (let i = 0; i <= NS + 1; i++) { G[i] = y + off[i]; y += slope[i] * STEP; }
    // berries: an arc over each landing, high enough that only a popped jump reaches them
    for (let k = 0; k < S.nR && S.nB < MAXB - 3; k++) {
      const lip = S.ramps[k], big = S.rampBig[k];
      for (let j = 0; j < 3; j++) { const bx = lip + 50 + j * 34; S.bx[S.nB] = bx; S.by[S.nB] = groundAt(lip) - (big ? 58 : 50) + j * j * 4 + (bx - lip) * 0.2; S.bOn[S.nB] = 1; S.nB++; }
    }
    void ctx;
  }
  function groundAt(x) {
    const f = clamp(x, 0, LEN - STEP) / STEP, i = f | 0, k = f - i;
    return S.G[i] + (S.G[i + 1] - S.G[i]) * k;
  }
  const slopeAt = x => (groundAt(x + 2) - groundAt(x - 2)) / 4;
  const flagAt = x => S.F[(clamp(x, 0, LEN - STEP) / STEP) | 0];
  const onRamp = x => flagAt(x) === 1;
  function nextIndexAfter(arr, n, x) { for (let i = 0; i < n; i++) if (arr[i] > x) return i; return n; }

  /* ---------- riding (shared by Cappy and Kiki) ---------- */
  function groundAccel(x, vx) {
    const f = flagAt(x);
    if (f === 1) return -0.05 * vx;            // the ramp keeps your speed
    if (f === 4) return -30;                   // mud puddles are sticky
    return slopeAt(x) * 330 - 0.55 * vx;
  }
  /** Seconds until a body in the air at (x, y) with (vx, vy) lands (a quick forward simulation, for bots and tests). */
  function landIn(x, y, vx, vy) {
    for (let i = 1; i < 240; i++) { const dt = 1 / 60; vy += GRAV * dt; x += vx * dt; y += vy * dt; if (y >= groundAt(x)) return i / 60; }
    return 4;
  }

  /* ---------- Cappy ---------- */
  function jump(ctx) {
    if (S.over || S.crash > 0) return;
    if (S.air) { trickInput(ctx, 'spin'); return; }
    if (S.landCd > 0) return;
    S.hint = Math.max(0, S.hint - 0.15);
    if (onRamp(S.x)) { if (!S.pop) { S.pop = true; ctx.sfx('blip'); } return; }   // pop off the lip
    takeOff(ctx, -HOP_V);
  }
  function takeOff(ctx, vy) {
    S.air = true; S.airT = 0; S.vy = vy + S.vx * slopeAt(S.x) * 0.5; S.lowMsg = false;
    S.nTr = 0; S.cSpin = 0; S.cFlip = 0; S.cGrab = 0; S.pend = 0; S.trick = ''; S.queue = '';
    ctx.sfx(vy < -HOP_V - 10 ? 'lsPop' : 'whoosh');
  }
  function trickInput(ctx, id) {
    if (!S.air || S.over || S.crash > 0) return;
    if (S.trick) { if (!S.queue) S.queue = id; return; }
    startTrick(ctx, id);
  }
  function startTrick(ctx, id) {
    const h = groundAt(S.x) - S.y;
    if (h < MIN_AIR && S.airT > 0.05) { if (!S.lowMsg) { S.lowMsg = true; UI.float(sx(S.x), sy(S.y) - 30, t('ls.low'), '#ffe9a0'); } return; }
    S.trick = id; S.trickT = 0; S.trickDur = TRICKS[id].dur * (S.ctx.easy ? 0.85 : 1);
    S.hint = Math.max(0, S.hint - 0.2);
    ctx.sfx('whoosh');
  }
  function trickDone(ctx) {
    const id = S.trick, base = TRICKS[id].pts;
    const c = id === 'spin' ? S.cSpin++ : id === 'flip' ? S.cFlip++ : S.cGrab++;
    S.pend += c ? base / 2 : base; S.nTr++; S.tricksDone++;
    S.trick = '';
    ctx.sfx('lsTrick');
    UI.float(sx(S.x), sy(S.y) - 28, t('ls.' + id), '#ffe9a0');
    if (S.queue) { const q = S.queue; S.queue = ''; startTrick(ctx, q); }
  }
  function land(ctx) {
    S.air = false; S.y = groundAt(S.x); S.vy = 0; S.landCd = 0.12; S.pop = false;
    if (S.trick) {
      // landed mid-trick: wipeout
      S.trick = ''; S.queue = ''; S.crash = 0.85; S.crashes++; S.vx = Math.min(S.vx, 70);
      ctx.sfx('lsSplat'); UI.burst(sx(S.x), sy(S.y), 16, '#7a4a26', 70);
      UI.float(sx(S.x), sy(S.y) - 30, t('ls.wipeout'), '#ffb3d6');
      S.pend = 0; S.nTr = 0;
      return;
    }
    ctx.sfx('lsLand'); UI.burst(sx(S.x), sy(S.y), 6, '#9a6234', 40);
    if (S.nTr > 0) {
      const pts = Math.round(S.pend * S.nTr + 25);
      S.score += pts; S.combos++; S.bestCombo = Math.max(S.bestCombo, S.nTr);
      UI.float(sx(S.x), sy(S.y) - 40, '+' + pts, S.nTr > 1 ? '#ffd24a' : '#8ee070', S.nTr > 2 ? 2 : 1);
      if (S.nTr > 1) { ctx.sfx('star'); S.flash = 0.25; }
      S.pend = 0; S.nTr = 0;
    }
  }
  function moveCappy(dt, ctx) {
    if (S.landCd > 0) S.landCd -= dt;
    if (S.crash > 0) { S.crash -= dt; }
    if (!S.air) {
      S.vx = clamp(S.vx + groundAccel(S.x, S.vx) * dt * (S.crash > 0 ? 0.3 : 1), 55, 215);
      const x0 = S.x;
      S.x += S.vx * dt; S.y = groundAt(S.x);
      // the lip of a ramp: off you go
      if (S.nextLip < S.nR && x0 <= S.ramps[S.nextLip] && S.x > S.ramps[S.nextLip]) {
        const k = S.nextLip; S.nextLip++;
        if (S.crash <= 0) {
          const rs = -(S.rampH[k] * 1.7) / (S.rampBig[k] ? 84 : 64);
          let vy = S.vx * rs;
          if (S.pop) { vy -= POP_V + (S.rampBig[k] ? 15 : 0); S.pops++; UI.float(sx(S.x), sy(S.y) - 26, t('ls.pop'), '#8ee070'); }
          takeOff(ctx, vy); S.vy = vy;
        }
      }
      // logs: hop them or bonk
      if (S.nextLog < S.nL && S.x + 6 > S.logs[S.nextLog]) {
        S.nextLog++;
        if (S.crash <= 0) { S.vx *= 0.55; ctx.sfx('bonk'); UI.float(sx(S.x), sy(S.y) - 28, t('ls.bonk'), '#ffb3d6'); S.crash = Math.max(S.crash, 0.3); }
      }
      // mud splashes (just for fun)
      if (flagAt(S.x) === 4 && ((S.time * 20) | 0) % 3 === 0) UI.particle(sx(S.x) - 4, sy(S.y) - 2, -20 - S.r() * 30, -30 - S.r() * 40, '#6e4325', 0.5, 2, 200);
    } else {
      S.airT += dt;
      S.vy += GRAV * dt; S.x += S.vx * dt; S.y += S.vy * dt;
      if (S.trick) { S.trickT += dt; if (S.trickT >= S.trickDur) trickDone(ctx); }
      if (S.nextLog < S.nL && S.x > S.logs[S.nextLog]) { S.nextLog++; S.hops++; S.score += 30; UI.float(sx(S.x), sy(S.y) - 24, t('ls.hop'), '#8ee070'); ctx.sfx('pickup'); }
      while (S.nextLip < S.nR && S.ramps[S.nextLip] < S.x) S.nextLip++;
      if (S.y >= groundAt(S.x)) land(ctx);
    }
    // berries
    for (let i = 0; i < S.nB; i++) {
      if (!S.bOn[i]) continue;
      const dx = S.bx[i] - S.x; if (dx > 24) break; if (dx < -24) continue;
      if (Math.abs(dx) < 14 && Math.abs(S.by[i] - (S.y - 20)) < 18) { S.bOn[i] = 0; S.score += 25; S.berries++; ctx.sfx('pickup'); UI.burst(sx(S.bx[i]), sy(S.by[i]), 6, '#b06cff', 40); }
    }
  }

  /* ---------- Kiki: rides the same slope, always pops, scores on every ramp ---------- */
  function moveKiki(dt, ctx) {
    if (!S.kair) {
      S.kvx = clamp(S.kvx + groundAccel(S.kx, S.kvx) * dt, 55, 215);
      const x0 = S.kx; S.kx += S.kvx * dt; S.ky = groundAt(S.kx);
      if (S.kNextLip < S.nR && x0 <= S.ramps[S.kNextLip] && S.kx > S.ramps[S.kNextLip]) {
        const k = S.kNextLip++;
        S.kvy = S.kvx * -(S.rampH[k] * 1.7) / (S.rampBig[k] ? 84 : 64) - POP_V; S.kair = true; S.kairT = 0;
        S.kTrickQ = Math.round((ctx.easy ? 125 : 195) + S.r() * (ctx.easy ? 55 : 70) + (S.rampBig[k] ? 40 : 0));
      }
      if (S.kNextLog < S.nL && S.kx + 26 > S.logs[S.kNextLog]) { S.kNextLog++; S.kvy = -HOP_V - 10; S.kair = true; S.kairT = 0; S.kTrickQ = 30; }
    } else {
      S.kairT += dt; S.kvy += GRAV * dt; S.kx += S.kvx * dt; S.ky += S.kvy * dt;
      while (S.kNextLip < S.nR && S.ramps[S.kNextLip] < S.kx) S.kNextLip++;
      if (S.ky >= groundAt(S.kx)) {
        S.kair = false; S.ky = groundAt(S.kx);
        if (S.kTrickQ) { S.kScore += S.kTrickQ; S.kTrickQ = 0; }
      }
    }
    // a little steady style score too
    S.kScore += dt * (ctx.easy ? 3 : 5);
  }

  /* ---------- the bot (tests and balance): pops every ramp, fits tricks into the air it has ---------- */
  const BOT_ORDER = ['flip', 'spin', 'grab', 'spin'];
  function bot(ctx, dt) {
    if (S.botCd > 0) { S.botCd -= dt; return; }
    if (!S.air) {
      // decide once per ramp whether to pop (a sloppy rider forgets some)
      if (onRamp(S.x) && !S.pop && S.botRamp !== S.nextLip) { S.botRamp = S.nextLip; if (S.r() < 0.25 + S.skill * 0.75) jump(ctx); }
      else if (S.nextLog < S.nL && S.logs[S.nextLog] - S.x < S.vx * 0.2 && S.logs[S.nextLog] - S.x > 0) jump(ctx);
      return;
    }
    if (S.trick || S.queue) return;
    const left = landIn(S.x, S.y, S.vx, S.vy), want = BOT_ORDER[S.nTr % BOT_ORDER.length];
    const margin = 0.06 + (1 - S.skill) * 0.25 * S.r();
    if (left > TRICKS[want].dur * (ctx.easy ? 0.85 : 1) + margin) { trickInput(ctx, want); S.botCd = 0.05 + (1 - S.skill) * 0.2; }
    else if (left > TRICKS.grab.dur * (ctx.easy ? 0.85 : 1) + margin && S.skill > 0.5) { trickInput(ctx, 'grab'); S.botCd = 0.05; }
    else if (S.skill < 0.6 && S.r() < 0.012) trickInput(ctx, 'spin');   // a sloppy rider sometimes starts one too late
  }

  /* ---------- update ---------- */
  function finishSlide(ctx) {
    if (S.over) return;
    S.over = true; S.endT = 0;
    const score = Math.round(S.score), kiki = Math.round(S.kScore);
    S.won = score > kiki;
    ctx.sfx(S.won ? 'cheer' : 'miss');
    UI.banner(t(S.won ? 'ls.youWin' : 'ls.kikiWins'), S.won ? '#8ee070' : '#ff6fb5', 1.2);
  }
  function update(dt, ctx) {
    S.ctx = ctx;
    if (S.flash > 0) S.flash -= dt;
    if (!S.over) {
      S.time += dt;
      if (S.auto) bot(ctx, dt);
      moveCappy(dt, ctx);
      moveKiki(dt, ctx);
      if (S.time >= TIME || S.x > LEN - 400) finishSlide(ctx);
    } else {
      S.endT += dt;
      // coast to a stop
      if (!S.air) { S.vx = Math.max(0, S.vx - 140 * dt); S.x += S.vx * dt; S.y = groundAt(S.x); } else { S.vy += GRAV * dt; S.x += S.vx * dt; S.y += S.vy * dt; if (S.y >= groundAt(S.x)) { S.air = false; S.trick = ''; S.y = groundAt(S.x); } }
      if (S.endT > 1.3 && !S.finished) {
        S.finished = true;
        const score = Math.round(S.score), kiki = Math.max(1, Math.round(S.kScore)), won = S.won;
        const stars = won ? 1 + (score >= kiki * 1.35 ? 1 : 0) + (score >= kiki * 1.8 ? 1 : 0) : 0;
        ctx.finish({ score, stars, won, frac: won ? [0.34, 0.67, 1][stars - 1] : Math.min(0.3, score / kiki * 0.3), stats: { kiki, crashes: S.crashes, bestCombo: S.bestCombo, tricks: S.tricksDone } });
      }
    }
    camera(dt, ctx);
  }
  function camera(dt, ctx) {
    const W = ctx.W / S.K, H = ctx.H / S.K;
    const wantX = S.x - W * 0.28, wantY = Math.min(S.y, groundAt(S.x)) - H * 0.5 + 14;
    S.camX = wantX;
    S.camY += (wantY - S.camY) * Math.min(1, dt * 6);
  }
  const sx = x => Math.round((x - S.camX) * S.K);
  const sy = y => Math.round((y - S.camY) * S.K);

  /* ---------- input ---------- */
  function onInput(e, ctx) {
    if (S.over) return;
    if (e.type === 'press') {
      const k = e.key;
      if (k === 'a') { if (S.air) trickInput(ctx, 'spin'); else jump(ctx); }
      else if (k === 'up') { if (S.air) trickInput(ctx, 'flip'); else jump(ctx); }
      else if (S.air && (k === 'left' || k === 'right')) trickInput(ctx, 'spin');
      else if (S.air && k === 'down') trickInput(ctx, 'grab');
    } else if (e.type === 'down') {
      const id = UI.hitAt(e.x, e.y);
      if (id === 'ljump') jump(ctx);
      else if (id === 'lspin') trickInput(ctx, 'spin');
      else if (id === 'lflip') trickInput(ctx, 'flip');
      else if (id === 'lgrab') trickInput(ctx, 'grab');
      else if (!id && !S.air) jump(ctx);           // a touch anywhere jumps (in the air, wait for the tap or swipe)
    } else if (e.type === 'tap') {
      if (UI.hitAt(e.x, e.y)) return;
      if (S.air && S.airT > 0.04) trickInput(ctx, 'spin');
    } else if (e.type === 'swipe') {
      if (!S.air) { if (e.dir === 'up') jump(ctx); return; }
      trickInput(ctx, e.dir === 'up' ? 'flip' : e.dir === 'down' ? 'grab' : 'spin');
    }
  }

  /* ---------- drawing ---------- */
  function buildBg(ctx) {
    const W = ctx.W, H = ctx.H;
    S.bgGen = VIEW.gen; S.bgW = W; S.bgH = H;
    // far: sky and blue-green mountains (a 256-px tile that repeats), near: jungle trees (192-px tile)
    let c = JC.canvas2(256 + W, H), g = c.getContext('2d');
    for (let y = 0; y < H; y++) { const k = y / H; g.fillStyle = k < 0.25 ? '#7fd0ee' : k < 0.45 ? '#a8e2f0' : k < 0.6 ? '#cdeedd' : '#e6f4c8'; g.fillRect(0, y, 256 + W, 1); }
    for (let x = 0; x < 256 + W; x++) {
      const p = (x % 256) / 256 * Math.PI * 2, h = H * 0.3 + Math.sin(p) * 14 + Math.sin(p * 3 + 1) * 7 + Math.sin(p * 5) * 3;
      g.fillStyle = '#7fb8a8'; g.fillRect(x, Math.round(H - h - H * 0.25), 1, Math.round(h + H * 0.25));
      const h2 = H * 0.2 + Math.sin(p * 2 + 2) * 10 + Math.sin(p * 7) * 3;
      g.fillStyle = '#5f9a7a'; g.fillRect(x, Math.round(H - h2 - H * 0.12), 1, Math.round(h2 + H * 0.12));
    }
    // a waterfall far away
    for (let x = 0; x < 256 + W; x += 256) { rect(g, x + 170, Math.round(H * 0.42), 5, Math.round(H * 0.3), '#e8f8ff'); rect(g, x + 171, Math.round(H * 0.42), 1, Math.round(H * 0.3), '#b8e8f8'); }
    S.bgFar = c;
    c = JC.canvas2(192 + W, H); g = c.getContext('2d');
    for (let x = 0; x < 192 + W; x += 48) {
      const tx = x + 10, th = Math.round(H * 0.45);
      rect(g, tx, H - th, 5, th, '#3b5a3a'); rect(g, tx + 4, H - th, 1, th, '#2a422a');
      for (let j = 0; j < 4; j++) JC.draw.disc(g, tx + 2 + (j % 2 ? 9 : -7), H - th + j * 3, 9 - j, j % 2 ? '#2f7d3c' : '#1f5a34');
      JC.draw.disc(g, tx + 2, H - th - 6, 10, '#2f7d3c'); JC.draw.disc(g, tx - 1, H - th - 8, 6, '#4fa83f');
      // a hanging vine
      for (let y = H - th; y < H - th + 30; y++) { g.fillStyle = '#2a7a30'; g.fillRect(tx + 22 + Math.round(Math.sin(y / 5) * 1.5), y, 1, 1); }
    }
    S.bgNear = c;
  }
  function drawRider(g, x, y, board, who, trick, tt, crash) {
    // x, y: the board's bottom centre on screen; the rider sits on the board (drawn at twice the world's scale)
    const K = S.A, bs = SPRITES[board], rs = who === 'kiki' ? SPRITES.kiki : SPRITES.cappy_right;
    const bw = bs.w * K, bh = bs.h * K;
    if (crash > 0) {
      // tumbling: the rider rolls, the leaf flips away
      const q = ((crash * 10) | 0) % 4;
      rot(g, rs, x, y - 9 * K, K, q, false);
      rot(g, bs, x - 14 * K, y - 4 * K - Math.round(Math.sin(crash * 6) * 4 * K), K, (q + 2) % 4, false);
      return;
    }
    if (trick === 'flip') {
      const q = Math.min(3, Math.floor(tt * 4));
      g.save(); g.translate(Math.round(x), Math.round(y - 10 * K)); g.rotate(-q * Math.PI / 2);
      g.drawImage(bs.c, -Math.round(bw / 2), 10 * K - bh, bw, bh);
      g.drawImage(rs.c, -8 * K, 10 * K - bh - 16 * K + 3 * K, 16 * K, 16 * K);
      g.restore();
      return;
    }
    if (trick === 'grab') {
      // the leaf held up behind, like a sail
      rot(g, bs, x - 2 * K, y - 16 * K, K, 3, false);
      const s2 = who === 'kiki' ? SPRITES.kiki : SPRITES.cappy_right_w;
      g.drawImage(s2.c, Math.round(x - 8 * K), Math.round(y - 18 * K), 16 * K, 16 * K);
      return;
    }
    g.drawImage(bs.c, Math.round(x - bw / 2), Math.round(y - bh), bw, bh);
    let s = rs, flip = false;
    if (trick === 'spin') {
      const f = Math.min(3, Math.floor(tt * 4));
      if (who === 'kiki') { flip = f % 2 === 1; }
      else { s = f === 0 ? SPRITES.cappy_down : f === 1 ? SPRITES.cappy_right : f === 2 ? SPRITES.cappy_up : SPRITES.cappy_right; flip = f === 1; }
    }
    g.drawImage(flip ? s.f : s.c, Math.round(x - 9 * K), Math.round(y - bh - 16 * K + 3 * K), 16 * K, 16 * K);
  }
  function rot(g, s, cx, cy, k, q, flip) {
    if (!s) return;
    g.save(); g.translate(Math.round(cx), Math.round(cy)); if (q) g.rotate(q * Math.PI / 2);
    g.drawImage(flip ? s.f : s.c, -Math.round(s.w * k / 2), -Math.round(s.h * k / 2), s.w * k, s.h * k); g.restore();
  }
  function draw(g, ctx) {
    S.K = Math.max(1, Math.floor(Math.min(ctx.W / 260, ctx.H / 200))); S.A = 2 * S.K;
    const K = S.K, W = ctx.W, H = ctx.H;
    if (!S.bgFar || S.bgGen !== VIEW.gen || S.bgW !== W || S.bgH !== H) buildBg(ctx);
    // parallax background
    g.drawImage(S.bgFar, -Math.round((S.camX * 0.1) % 256), 0);
    g.drawImage(S.bgNear, -Math.round((S.camX * 0.35) % 192), Math.round(H * 0.08));
    // the slope, column by column (2-px columns): mud, a wet shiny lip, grass tufts
    const cw = 2 * K;
    for (let px = 0; px < W; px += cw) {
      const wx = S.camX + px / K, gy = sy(groundAt(wx)), f = flagAt(wx);
      const top = f === 1 ? '#c48a4c' : f === 4 ? '#4a2c1a' : '#9a6234';
      rect(g, px, gy, cw, H - gy, '#6e4325');
      rect(g, px, gy, cw, 2 * K, top);
      rect(g, px, gy + 2 * K, cw, K, f === 4 ? '#5e3820' : '#7a4a26');
      const band = gy + 14 * K + ((JC.hash((wx / 2) | 0, 5, 3) * 3) | 0) * K;
      if (band < H) rect(g, px, band, cw, K, '#5e3820');
      if (f === 0 && JC.hash((wx / 4) | 0, 9, 1) < 0.18) rect(g, px, gy - K, K, K, '#4fa83f');
    }
    // decorations on the slope: ferns and flowers (from a hash, so they stay put)
    const x0 = Math.floor(S.camX / 40) * 40;
    for (let wx = x0; wx < S.camX + W / K + 40; wx += 40) {
      const h = JC.hash(wx / 40, 2, 8); if (h > 0.55 || flagAt(wx) === 1) continue;
      const s = h < 0.2 ? SPRITES.ls_flower : SPRITES.ls_fern;
      g.drawImage(s.c, sx(wx), sy(groundAt(wx)) - s.h * K + K, s.w * K, s.h * K);
    }
    // mud puddles shine, ramps get arrows, logs and berries
    for (let i = 0; i < S.nM; i++) {
      if (S.mud1[i] < S.camX - 10 || S.mud0[i] > S.camX + W / K + 10) continue;
      for (let wx = S.mud0[i] + 6; wx < S.mud1[i] - 6; wx += 10) rect(g, sx(wx), sy(groundAt(wx)) + K, 3 * K, K, '#8a6a50');
    }
    for (let i = 0; i < S.nR; i++) {
      const lip = S.ramps[i]; if (lip < S.camX - 100 || lip > S.camX + W / K + 100) continue;
      const len = S.rampBig[i] ? 84 : 64, on = !S.air && S.x > lip - len && S.x < lip && i === S.nextLip;
      // wooden boards on the kicker and arrows that blink while you ride it
      for (let wx = lip - len + 10; wx < lip; wx += 10) rect(g, sx(wx), sy(groundAt(wx)) + 2 * K, K, 3 * K, '#5e3a20');
      rect(g, sx(lip) - 2 * K, sy(groundAt(lip - 1)), 3 * K, 6 * K, '#c9a37a');
      const blink = ((S.time * 6) | 0) % 2;
      if (on && !S.pop && blink) { const a = SPRITES.ls_arrow; g.drawImage(a.c, sx(lip - len * 0.45) - 3 * K, sy(groundAt(lip - len * 0.45)) - 26 * K, a.w * K, a.h * K); }
      if (on && S.pop) { g.globalAlpha = 0.5; rect(g, sx(lip - len), sy(groundAt(lip)) - 2 * K, len * K, 2 * K, '#8ee070'); g.globalAlpha = 1; }
    }
    for (let i = 0; i < S.nL; i++) {
      const lx = S.logs[i]; if (lx < S.camX - 20 || lx > S.camX + W / K + 20) continue;
      const s = SPRITES.ls_log, A = S.A; g.drawImage(s.c, sx(lx) - 8 * A, sy(groundAt(lx)) - s.h * A + 2 * K, s.w * A, s.h * A);
    }
    for (let i = 0; i < S.nB; i++) {
      if (!S.bOn[i]) continue; const bx = S.bx[i]; if (bx < S.camX - 10) continue; if (bx > S.camX + W / K + 10) break;
      const s = SPRITES.ls_berry, bob = Math.round(Math.sin(S.time * 4 + i) * 2) * K, A = S.A;
      g.drawImage(s.c, sx(bx) - 3 * A, sy(S.by[i]) - 3 * A + bob, s.w * A, s.h * A);
    }
    // Kiki (behind Cappy), then Cappy, with ground shadows; the shadow turns red if a trick is still going near the ground
    const kOn = S.kx > S.camX - 20 && S.kx < S.camX + W / K + 20;
    if (kOn) {
      // Kiki rides a lane further back on the slope (a little higher on screen, a little faded)
      const lane = 5 * K;
      JC.draw.shadow(g, sx(S.kx), sy(groundAt(S.kx)) - lane, 9 * S.A);
      const kt = S.kair && S.kTrickQ > 30 ? (S.kairT % 0.5) / 0.5 : 0;
      g.globalAlpha = 0.85;
      drawRider(g, sx(S.kx), sy(S.ky) - lane, 'ls_petal', 'kiki', S.kair && S.kTrickQ > 30 ? (S.kTrickQ % 2 ? 'spin' : 'flip') : '', kt, 0);
      g.globalAlpha = 1;
    } else if (S.kx > S.camX) {
      // Kiki is ahead, off screen: a little marker at the right edge
      const yy = clamp(sy(S.ky) - 10, 50, H - 40);
      JC.portrait(g, 'kiki', W - 26, yy, 22, '#ffd0e6');
    }
    const gy = sy(groundAt(S.x)), near = S.air && S.trick && groundAt(S.x) - S.y < 26;
    if (near) { g.globalAlpha = 0.5; JC.draw.oval(g, sx(S.x), gy, 10 * S.A, 2 * S.A, '#ff3a3a'); g.globalAlpha = 1; }
    else JC.draw.shadow(g, sx(S.x), gy, 10 * S.A);
    const tt = S.trick ? S.trickT / S.trickDur : 0;
    drawRider(g, sx(S.x), sy(S.y), 'ls_leaf', 'cappy', S.trick, tt, S.crash > 0.3 ? S.crash : 0);
    if (S.flash > 0) { g.globalAlpha = S.flash * 1.2; rect(g, 0, 0, W, H, '#fff8e8'); g.globalAlpha = 1; }
    // HUD: the two scores, the clock, the combo in the air
    VA.name = t('name.cappy'); VA.score = Math.round(S.score); VB.name = t('name.kiki'); VB.score = Math.round(S.kScore);
    HUD.versus(g, VA, VB);
    HUD.timer(g, TIME - S.time, clamp(1 - S.time / TIME, 0, 1));
    if (S.air && (S.nTr > 0 || S.trick)) {
      const yy = 56;
      const n = S.nTr + (S.trick ? 1 : 0);
      if (n > 1 || S.nTr > 0) text(g, label('ls.mult', Math.max(1, S.nTr)), W / 2 + 36, yy, T_MULT);
      if (S.trick) text(g, t('ls.' + S.trick), W / 2, yy, T_TR); else if (S.nTr > 0) text(g, label('ls.pend', Math.round(S.pend)), W / 2, yy, T_TR);
    }
    // touch buttons (bottom row) or the key hints
    if (ctx.touch && !S.over) {
      const bh = Math.max(24, ctx.tap), gap = 4, y = H - bh - 6, w4 = W - 12 - gap * 3;
      const jw = Math.max(ctx.tap, Math.floor(w4 * 0.31)), tw = Math.max(ctx.tap, Math.floor((w4 - jw) / 3));
      let x = 6;
      B_J.glow = !S.air && onRamp(S.x) && !S.pop; B_S.disabled = B_F.disabled = B_G.disabled = !S.air;
      UI.button(g, 'ljump', x, y, jw, bh, t('ls.jump'), B_J); x += jw + gap;
      UI.button(g, 'lspin', x, y, tw, bh, t('ls.spin'), B_S); x += tw + gap;
      UI.button(g, 'lflip', x, y, tw, bh, t('ls.flip'), B_F); x += tw + gap;
      UI.button(g, 'lgrab', x, y, tw, bh, t('ls.grab'), B_G);
    }
    if (!S.over && (S.hint > 0.05) && S.time < 30) {
      const str = t(ctx.touch ? 'ls.hintTouch' : 'ls.hintKeys'), h = JC.font.wrap(str, W - 12, 1).length * 12;
      const by = (ctx.touch ? H - Math.max(24, ctx.tap) - 12 : H - 3) - h;
      g.globalAlpha = clamp(S.hint * 2, 0, 1);
      rect(g, 0, by - 3, W, h + 4, 'rgba(27,19,37,0.6)'); textBlock(g, str, 6, by, W - 12, HINT);
      g.globalAlpha = 1;
    }
  }

  JC.register({
    id: 'leaf',
    champion: 'kiki',
    music: 'leaf',
    start(ctx) {
      S.ctx = ctx; S.r = S.seed ? JC.rng(S.seed) : ctx.rng; S.seed = 0;
      build(ctx);
      S.time = 0; S.over = false; S.won = false; S.finished = false; S.endT = 0; S.auto = false; S.skill = 1; S.botCd = 0; S.botRamp = -1;
      S.x = 40; S.y = groundAt(40); S.vx = 70; S.vy = 0; S.air = false; S.pop = false; S.crash = 0; S.landCd = 0; S.nextLip = 0; S.nextLog = 0;
      S.trick = ''; S.queue = ''; S.nTr = 0; S.pend = 0; S.score = 0; S.crashes = 0; S.combos = 0; S.bestCombo = 0; S.tricksDone = 0; S.berries = 0; S.hops = 0; S.pops = 0;
      S.kx = 100; S.ky = groundAt(100); S.kvx = 70; S.kvy = 0; S.kair = false; S.kNextLip = 0; S.kNextLog = 0; S.kScore = 0; S.kTrickQ = 0;
      S.hint = ctx.firstTime ? 2 : 0.8; S.flash = 0;
      S.K = Math.max(1, Math.floor(Math.min(ctx.W / 260, ctx.H / 200))); S.A = 2 * S.K;
      S.camX = S.x - ctx.W / S.K * 0.28; S.camY = S.y - ctx.H / S.K * 0.5 + 14;
    },
    update,
    draw,
    onInput,
    outro(dt, ctx) { if (S.flash > 0) S.flash -= dt; camera(dt, ctx); },
    testState() {
      return { time: Math.round(S.time * 10) / 10, x: Math.round(S.x), vx: Math.round(S.vx), air: S.air, onRamp: onRamp(S.x), pop: S.pop, trick: S.trick, queue: S.queue,
        landIn: S.air ? landIn(S.x, S.y, S.vx, S.vy) : 0, h: Math.round(groundAt(S.x) - S.y), nTr: S.nTr, score: Math.round(S.score), kiki: Math.round(S.kScore), kx: Math.round(S.kx),
        crashes: S.crashes, combos: S.combos, bestCombo: S.bestCombo, pops: S.pops, hops: S.hops, berries: S.berries, ramps: S.nR, nextLog: S.nextLog < S.nL ? Math.round(S.logs[S.nextLog] - S.x) : -1,
        over: S.over, won: S.won, auto: S.auto, crash: S.crash > 0 };
    },
    test: {
      auto(ctx, on) { S.auto = !!on; return S.auto; },
      /** 0..1: how well the bot rides (1 = pops every ramp and never lands mid-trick). */
      skill(ctx, v) { S.skill = clamp(+v, 0, 1); return S.skill; },
      seed(ctx, n) { S.seed = n | 0; return true; },
      time(ctx, secs) { S.time = clamp(+secs, 0, TIME); return S.time; },
    },
    cheat(won) {
      const kiki = 4200, score = won ? 6200 : 2600;
      S.score = score; S.kScore = kiki;
      return { score, stars: won ? 2 : 0, won, frac: won ? 0.67 : 0.19 };
    },
  });
})();
