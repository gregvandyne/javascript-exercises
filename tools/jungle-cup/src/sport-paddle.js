// ======================================================================================================
// PADDLE SMASH vs Jada the jaguar: table tennis seen from above (a 3/4 view), on a clay court in a jungle clearing.
//   Move Cappy round your end of the table (the joystick / arrows / pad) to the ring where the ball will be, then
//   Swing (the Swing button, a tap, Space / A) as the shrinking circle meets the ring: Perfect / Good / Early / Late.
//   Push the stick left or right as you swing to aim. Perfect and Good hits fill the Pounce meter; when it is full
//   your next hit is a super-fast Pounce. Swinging at a ball that is still far away loses it (no button mashing).
//   A swing a moment early or a moment late (touch and keys have a small delay) still hits, at most a Good.
//   Fruit Frenzy: at 10, 20 and 25 points the marmosets toss extra fruit-coloured balls onto the table. Every ball
//   counts: each one you get past Jada is your point, each one you miss is hers.
//   The extra balls come one at a time: a marmoset winds up ("!") only when the new ball can reach Cappy a fair gap
//   after the balls already coming (with time to run between them), and Jada paces her returns the same way.
//   First to 30, win by 2 (at 29-29 the next point wins). Fruit Frenzy at 10, 20 and 25. The first time, a warm-up
//   against two marmosets (first to 3). The ball starts gentle and speeds up a little as the score climbs.
// Court units: x runs across the table (-30..30), y along it (Jada's end -54, the net 0, Cappy's end +54), h is the
// height above the table top (the floor is at FLOOR_H). Tall views draw the table up the screen (Cappy at the bottom);
// wide views turn it sideways (Cappy on the left).
// ======================================================================================================
(function () {
  const TW = 30, TL = 54, NET_H = 7, GRAV = 170, BOUNCE = 0.78, FRICT = 0.8, FLOOR_H = -18, BACK = 92, SIDE = 50;
  const YOU_HOME = 78, NBALL = 3, NTRAIL = 6;
  /** Balance (Normal): Jada's return chance by hit quality, Cappy's reach, the ball's starting speed and how much it
   *  speeds up by the end of a match to 30, the speed each hit adds. Easier champions stay well below these. */
  const BAL = { pPerf: 0.94, pGood: 0.975, pWeak: 0.989, reach: 15.5, base: 106, gain: 22, add: 6, max: 170, rb: 0, eReach: 3.5, eBase: 12, eP: 0.05 };
  // (Easier champions keep their own help on top: Jada slower and with less reach, Cappy quicker, a gentler speed-up,
  //  Frenzies of two balls with longer gaps, and a forgiving early swing.)
  const STAR2 = 60, STAR3 = 85;                            // Perfects for 2 and 3 stars in a match to 30
  const FRZ_COLS = ['#b6f05a', '#ff9b2e', '#ff6fb5'], PLAIN = '#fff8e8';
  const S = {
    stage: 'match', you: 0, them: 0, target: 30, serve: 'you', serveN: 0, phase: 'serve', phaseT: 0, rally: 0, maxRally: 0,
    perfects: 0, whiffs: 0, hits: 0, pounce: 0, pounceReady: false, swingT: 9, themSwingT: 9, speed: 80, lastQ: 0.5,
    cx: 0, cy: YOU_HOME, cmoving: false, jx: 0, jy: -YOU_HOME, jmoving: false, jdive: 0, cdive: 0, jumpYou: 0, jumpThem: 0,
    ax: 0, ay: 0, am: 0, frenzy: 0, fzDone: 0, fzYou: 0, fzThem: 0, tossAt: [0, 0, 0], tossWarn: [9, 9, 9], tossWind: [0, 0, 0], tossWait: [0, 0, 0], tossN: 0, sinceServe: 0, lastTossT: -9, lastHitT: -9,
    // diagnostics for the tests and the balance check (how points are won and lost)
    dg: { far: 0, miss: 0, perf: 0, good: 0, weak: 0, toss: 0, swHit: 0, swLate: 0, swBuf: 0, swEarly: 0, swNone: 0, swCool: 0 },
    clock: 0, arr: [0, 0, 0, 0, 0, 0], arrI: 0, fzMinGap: 9, fzTight: 0, fzArr: 0,
    hint: 1, hintRound: false, auto: false, bot: null, botMashT: 0, port: true, k: 1, ky: 1, kh: 1, ks: 1, ox: 0, oy: 0,
    bg: null, bgGen: -1, bgK: 0, bgPort: null, ptYou: 0, ptThem: 0, ctx: null, reduced: false,
  };
  S.tossPlan = [{ t: 0, x: 0, y: 0, xb: 0, yb: 0 }, { t: 0, x: 0, y: 0, xb: 0, yb: 0 }, { t: 0, x: 0, y: 0, xb: 0, yb: 0 }];
  const BALLS = [];
  for (let i = 0; i < NBALL; i++) {
    const tr = []; for (let j = 0; j < NTRAIL; j++) tr.push({ x: 0, y: 0, h: 0 });
    BALLS.push({ i, live: false, fade: 0, x: 0, y: 0, h: 0, vx: 0, vy: 0, vh: 0, toward: 1, bounced: 0, age: 0, bx: 0, by: 0, bT: 0,
      sweetX: 0, sweetY: 0, sweetT: 0, col: PLAIN, pounce: false, smash: false, whiffed: false, willReturn: true, offX: 0,
      missFloat: false, botDT: 0, botSwung: false, botOX: 0, botOY: 0, trail: tr });
  }
  const BOT_AXIS = { x: 0, y: 0, mag: 0 };
  const HINT = { align: 'center', col: '#fff8e8' }, WARM = { align: 'center', col: PAL.r4 }, CHIP = { align: 'left', col: '#fff8e8' };
  const VA = { name: '', score: 0, of: 30, col: '#45c34e' }, VB = { name: '', score: 0, of: 30, col: '#ff9b2e' };
  const B_SW = { col: '#e04848', glow: false };
  const SPR_C = { up: ['cappy_up', 'cappy_up_w'], right: ['cappy_right', 'cappy_right_w'] };
  const WRAP = { str: '', w: 0, clear: null, n: 1 };
  const COL = { table: '#2a8a5a', tableHi: '#5fd08a', tableLo: '#1f6a44', line: '#fff8e8', clay: '#c98a52', clayLo: '#b8744a', clayHi: '#d89a62' };
  const rnd = () => Math.random();
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 2;          // about a normal spread (sd ~1)
  const warm = () => S.stage === 'warm';
  /** How far from Cappy's paddle a ball can be and still be hit (court units). */
  const reach = ctx => (ctx.easy ? BAL.reach + BAL.eReach : BAL.reach) + (warm() ? 4 : 0);
  const jReach = ctx => (warm() ? 17 : ctx.easy ? 13 : 15);
  const cSpeed = ctx => (ctx.easy ? 122 : 110);
  const jSpeed = ctx => (warm() ? 70 : ctx.easy ? 78 : 100);
  /** The ball starts gentle and speeds up a little as the score climbs (a long match to 30 stays fair early on). */
  const baseSpeed = ctx => (warm() ? 72 : (ctx.easy ? BAL.base - BAL.eBase : BAL.base) + Math.min(1, Math.max(S.you, S.them) / 25) * (ctx.easy ? BAL.gain * 0.5 : BAL.gain));
  const maxSpeed = ctx => (warm() ? 96 : ctx.easy ? BAL.max - 40 : BAL.max);
  AUDIO.addSfx('padPerfect', (t, b) => { const P = AUDIO.prims; P.tone(b, 'square', 1320, t, 0.07, 0.09, 1320); P.tone(b, 'square', 1760, t + 0.06, 0.1, 0.08, 1760); });
  AUDIO.addSfx('padToss', (t, b) => { const P = AUDIO.prims; P.tone(b, 'triangle', 660, t, 0.08, 0.1, 990); P.tone(b, 'square', 1200, t + 0.07, 0.05, 0.05, 1500); });
  AUDIO.addSfx('padWind', (t, b) => { const P = AUDIO.prims; P.tone(b, 'square', 520, t, 0.05, 0.06, 700); P.tone(b, 'square', 780, t + 0.09, 0.05, 0.06, 1040); });
  AUDIO.addSfx('padWhiff', (t, b) => { AUDIO.prims.noise(b, t, 0.12, 0.12, 'bandpass', 1400, 1.5, 700); });

  /* ---------- the court on the screen ---------- */
  function SX(x, y) { return S.port ? S.ox + x * S.k : S.ox - y * S.k; }
  function SY(x, y, h) { return (S.port ? S.oy + y * S.ky : S.oy + x * S.ky) - h * S.kh; }
  /** Snap a scale to whole screen pixels (crisp). */
  function snap(v) { return Math.max(1 / VIEW.S, Math.floor(v * VIEW.S) / VIEW.S); }
  function swingSize(ctx) { return Math.max(Math.round(ctx.tap * 1.5), 46); }
  function layout(ctx) {
    const W = ctx.W, H = ctx.H;
    S.port = H > W * 1.05;
    // keep Cappy's end clear of the joystick and the Swing button (tall views keep a strip for them at the bottom)
    const stickD = ctx.stick && ctx.stick.baseR ? ctx.stick.baseR * 2 : 60;
    const ctrl = ctx.touch ? Math.max(swingSize(ctx), stickD) + 12 : 22;
    // the court is (SIDE + 6) across each way and (BACK + 4) along; the characters stand up to ~26 units tall
    const AX = SIDE + 6, AL = BACK + 4;
    if (S.port) {
      const top = S.hintRound ? 84 : 56, k = Math.min((W - 6) / (AX * 2), (H - top - ctrl) / (AL * 2 * 0.8 + 26));
      S.k = k; S.ky = k * 0.8; S.kh = k * 0.85;
      const courtH = AL * 2 * S.ky + 26 * k;
      S.ox = Math.round(W / 2);
      S.oy = Math.round(top + 26 * k + AL * S.ky + Math.max(0, (H - top - ctrl - courtH) / 2));
    } else {
      const top = 34, bottom = ctx.touch ? 10 : 6, k = Math.min((W - 12) / (AL * 2), (H - top - bottom) / (AX * 2 * 0.8 + 26));
      S.k = k; S.ky = k * 0.8; S.kh = k * 0.85;
      S.ox = Math.round(W / 2);
      S.oy = Math.round(top + 26 * k + AX * S.ky + Math.max(0, (H - top - bottom - (AX * 2 * S.ky + 26 * k)) / 2));
    }
    S.ks = Math.max(1, snap(S.k * (S.port ? 1.15 : 1.3)));
  }

  /* ---------- balls ---------- */
  /** Where and when a ball sent from (x0, y0, h0) to bounce at (xb, yb) at speed v reaches its sweet spot (no ball needed). */
  const AIM = { t: 0, x: 0, y: 0, h: 0 };
  const FZ_MAXH = 30;                                 // a paced ball still has to come down low enough to hit
  function aimAt(x0, y0, h0, xb, yb, v) {
    const T = Math.max(0.35, Math.hypot(xb - x0, yb - y0) / v), vx = (xb - x0) / T, vy = (yb - y0) / T, vh = (GRAV * T * T / 2 - h0) / T;
    const toward = yb > 0 ? 1 : -1, vh2 = -(vh - GRAV * T) * BOUNCE, vx2 = vx * FRICT, vy2 = vy * FRICT;
    let ts = clamp(vh2 / GRAV, 0.12, 0.6);
    const lim = 94 * toward, ys = yb + vy2 * ts;
    if ((toward > 0 && ys > lim) || (toward < 0 && ys < lim)) ts = Math.max(0.08, (lim - yb) / vy2);
    AIM.t = T + ts; AIM.x = clamp(xb + vx2 * ts, -SIDE + 4, SIDE - 4); AIM.y = yb + vy2 * ts; AIM.h = vh2 * ts - GRAV * ts * ts / 2;
    return AIM;
  }
  /* Fruit Frenzy pacing: every ball heading for Cappy's end (and every ball Jada will send back, and every toss being
     wound up) is forecast; a new toss or a Jada return is only sent so that it reaches Cappy a fair gap after the
     others, with time to run between them. Fixed arrays: no allocation. */
  const FC_T = [0, 0, 0, 0, 0, 0], FC_X = [0, 0, 0, 0, 0, 0], FC_Y = [0, 0, 0, 0, 0, 0], FC_K = [0, 0, 0, 0, 0, 0];
  let fcN = 0;
  const FZ_GAP = ctx => (ctx.easy ? 1.5 : 1.1);          // seconds between balls reaching Cappy, plus his running time
  const FZ_WIND = ctx => (ctx.easy ? 1.1 : 0.85);        // the marmoset's wind-up (the "!" tell) before each toss
  function fcAdd(t, x, y, known) { if (fcN < FC_T.length) { FC_T[fcN] = t; FC_X[fcN] = x; FC_Y[fcN] = y; FC_K[fcN] = known ? 1 : 0; fcN++; } }
  function forecast(excl) {
    fcN = 0;
    for (const b of BALLS) {
      if (!b.live || b === excl) continue;
      const rem = b.sweetT - b.age;
      if (b.toward > 0) { if (!b.whiffed && rem > -0.1) fcAdd(rem, b.sweetX, b.sweetY, true); }
      else if (b.willReturn) fcAdd(Math.max(0, rem) + 0.15 + 95 / Math.max(60, S.speed) + 0.3, 0, 0, false);
    }
    for (let i = 0; i < S.tossN; i++) if (S.tossWind[i] > 0) fcAdd(S.tossWind[i] + S.tossPlan[i].t, S.tossPlan[i].x, S.tossPlan[i].y, true);
  }
  /** How much spare time a ball reaching Cappy's end at t (at x, y) leaves next to the forecast ones (< 0: too close). */
  function spare(ctx, t, x, y) {
    let m = 9;
    const g = FZ_GAP(ctx), run = cSpeed(ctx) * 0.85;
    for (let i = 0; i < fcN; i++) m = Math.min(m, Math.abs(t - FC_T[i]) - g - (FC_K[i] ? Math.hypot(x - FC_X[i], y - FC_Y[i]) / run : 0.3));
    return m;
  }
  /** Send ball b from (x0, y0, h0) to bounce at (xb, yb), moving at v court units a second along the ground. */
  function launch(b, x0, y0, h0, xb, yb, v) {
    const T = Math.max(0.35, Math.hypot(xb - x0, yb - y0) / v);
    b.x = x0; b.y = y0; b.h = h0; b.vx = (xb - x0) / T; b.vy = (yb - y0) / T; b.vh = (GRAV * T * T / 2 - h0) / T;
    b.live = true; b.fade = 0; b.bounced = 0; b.age = 0; b.bx = xb; b.by = yb; b.bT = T; b.toward = yb > 0 ? 1 : -1;
    b.whiffed = false; b.botSwung = false; b.smash = false; b.pounce = false; b.missFloat = false; b.offX = 0; b.tx = xb;
    // the sweet spot: the top of the hop after the bounce (the table slows the ball a little), kept inside the court
    const vh2 = -(b.vh - GRAV * T) * BOUNCE, vx2 = b.vx * FRICT, vy2 = b.vy * FRICT;
    let ts = clamp(vh2 / GRAV, 0.12, 0.6);
    const lim = 94 * b.toward, ys = yb + vy2 * ts;
    if ((b.toward > 0 && ys > lim) || (b.toward < 0 && ys < lim)) ts = Math.max(0.08, (lim - yb) / vy2);
    b.sweetT = T + ts; b.sweetX = clamp(xb + vx2 * ts, -SIDE + 4, SIDE - 4); b.sweetY = yb + vy2 * ts;
    if (S.frenzy && b.toward > 0) noteArrival(S.clock + b.sweetT);
    for (const p of b.trail) { p.x = x0; p.y = y0; p.h = h0; }
    // the play-bot's human faults for this ball (where it stands, when it swings)
    if (S.bot) { b.botOX = (rnd() - 0.5) * 2 * S.bot.pos; b.botOY = (rnd() - 0.5) * 2 * S.bot.pos; b.botDT = gauss() * S.bot.time; }
  }
  /** Frenzy bookkeeping (tests and the balance check): how close together balls reach Cappy's end. */
  function noteArrival(at) {
    let g = 9;
    for (let i = 0; i < S.arr.length; i++) if (S.arr[i] > 0 && S.arr[i] > S.clock - 2) g = Math.min(g, Math.abs(at - S.arr[i]));
    S.arr[S.arrI] = at; S.arrI = (S.arrI + 1) % S.arr.length; S.fzArr++;
    if (g < 9) { S.fzMinGap = Math.min(S.fzMinGap, g); if (g < 0.7) S.fzTight++; }
  }
  function liveCount() { let n = 0; for (const b of BALLS) if (b.live) n++; return n; }
  function freeBall() { for (const b of BALLS) if (!b.live && b.fade <= 0) return b; for (const b of BALLS) if (!b.live) return b; return BALLS[0]; }
  function pendingTosses() { let n = 0; for (let i = 0; i < S.tossN; i++) if (S.tossAt[i] > 0) n++; return n; }
  /** A ball is dead: the point goes to `who`. */
  function point(ctx, who, b) {
    if (!b.live) return;
    b.live = false; b.fade = 0.6;
    if (who === 'you') { S.you++; S.ptYou++; if (S.frenzy) S.fzYou++; S.jumpYou = 0.5; }
    else { S.them++; S.ptThem++; if (S.frenzy) S.fzThem++; S.jumpThem = 0.5; }
    // Frenzy: each ball shows its own result (a ball Cappy missed already said so where he stood)
    if (S.frenzy && (who === 'you' || !b.missFloat)) UI.float(SX(b.x, b.y), SY(b.x, b.y, Math.max(b.h, 0)) - 10, who === 'you' ? '+1' : t('pad.missShort'), who === 'you' ? PAL.r4 : '#ffb3d6');
    ctx.sfx(who === 'you' ? 'cheer' : 'miss');
    S.maxRally = Math.max(S.maxRally, S.rally);
    if (!liveCount() && !pendingTosses()) endRally(ctx);
  }
  function endRally(ctx) {
    S.phase = 'point'; S.phaseT = 0;
    if (S.frenzy) UI.banner(t('pad.frenzyEnd', { a: S.ptYou, b: S.ptThem }), S.ptYou >= S.ptThem ? PAL.r4 : '#ffb3d6', 1.4);
    else UI.float(ctx.W / 2, ctx.H * 0.3, t(S.ptYou ? 'pad.point' : warm() ? 'pad.pointMarm' : 'pad.pointJada'), S.ptYou ? PAL.r4 : '#ffb3d6', 2);
    S.frenzy = 0; S.tossN = 0; S.rally = 0;
    for (let i = 0; i < 3; i++) { S.tossWind[i] = 0; S.tossWarn[i] = 9; }
  }
  function gameWon() {
    const a = S.you, b = S.them, T = S.target;
    if (warm()) return a >= T ? 'you' : b >= T ? 'them' : '';
    // win by 2, but at (target-1)-(target-1) the next point wins (golden point), so it never drags on
    if (a >= T && a > b && (a - b >= 2 || b >= T - 1)) return 'you';
    if (b >= T && b > a && (b - a >= 2 || a >= T - 1)) return 'them';
    return '';
  }
  /** Fruit Frenzy comes once someone reaches 10 (two balls), 20 (three; two with Easier champions) and 25 (two). */
  function frenzyDue(ctx) {
    if (warm()) return 0;
    const top = Math.max(S.you, S.them);
    if (S.fzDone === 0 && top >= 10) return 2;
    if (S.fzDone === 1 && top >= 20) return ctx.easy ? 2 : 3;
    if (S.fzDone === 2 && top >= 25) return 2;
    return 0;
  }
  function nextServe(ctx) {
    S.serveN++;
    if (S.serveN % 2 === 0 || (S.you >= S.target - 1 && S.them >= S.target - 1)) S.serve = S.serve === 'you' ? 'them' : 'you';
    S.phase = 'serve'; S.phaseT = 0; S.speed = baseSpeed(ctx); S.ptYou = 0; S.ptThem = 0;
    const n = frenzyDue(ctx);
    if (n) {
      S.frenzy = n; S.fzDone++; S.tossN = n - 1;
      // the extra balls come one at a time: the first after the rally has started, the next only after a calm
      S.tossAt[0] = ctx.easy ? 2.0 : 1.4; S.tossAt[1] = 0.01; S.lastTossT = -9;
      for (let i = 0; i < 3; i++) { S.tossWarn[i] = 9; S.tossWind[i] = 0; S.tossWait[i] = 0; }
      UI.banner(t('pad.frenzy'), '#ffd24a', 1.8); ctx.sfx('fanfare');
    }
  }
  function startStage(ctx, stage) {
    for (const k in S.dg) S.dg[k] = 0;
    S.stage = stage; S.you = 0; S.them = 0; S.target = stage === 'warm' ? 3 : 30; S.serve = 'you'; S.serveN = 0;
    S.rally = 0; S.pounce = 0; S.pounceReady = false; S.phase = 'serve'; S.phaseT = 0; S.speed = baseSpeed(ctx);
    S.frenzy = 0; S.fzDone = 0; S.tossN = 0; S.ptYou = 0; S.ptThem = 0; S.buffer = 0;
    for (const b of BALLS) { b.live = false; b.fade = 0; }
    S.cx = 0; S.cy = YOU_HOME; S.jx = 0; S.jy = -YOU_HOME;
  }
  /** Cappy's paddle: just in front of him, on his right. */
  const hitX = () => S.cx + 4, hitY = () => S.cy - 7;
  /** Cappy swings. */
  function swing(ctx) {
    if (S.swingT < 0.26 && S.phase === 'rally') S.dg.swCool++;
    if (S.swingT < 0.26 || S.phase === 'over' || S.phase === 'point') return;
    // a deliberate swing (not one of a burst of taps) is the only kind the forgiving rules below help
    const deliberate = S.swingT > 0.5;
    S.swingT = 0;
    if (S.phase === 'serve') { if (S.serve === 'you') serveYou(ctx); return; }
    const R = reach(ctx), hx = hitX(), hy = hitY();
    // the closest ball in reach, after its bounce on Cappy's side
    let best = null, bd = 1e9;
    for (const b of BALLS) {
      if (!b.live || b.toward < 0 || b.whiffed || b.bounced < 1 || b.h > 40) continue;
      const d = Math.hypot(b.x - hx, b.y - hy);
      if (d <= R && d < bd) { best = b; bd = d; }
    }
    if (best) { S.dg.swHit++; hitYou(ctx, best, R); return; }
    // a swing a moment too late (the ball went past the ring up to 0.14 s ago and is still close) still hits it, at
    // most a Good: touch screens and keys have a small delay, and kids react a little late
    for (const b of BALLS) {
      if (!b.live || b.toward < 0 || b.whiffed || b.bounced < 1 || b.h > 40) continue;
      const past = b.age - b.sweetT, d = Math.hypot(b.x - hx, b.y - hy);
      if (past > 0 && past <= 0.14 && d <= R * 1.35) { S.dg.swLate++; hitYou(ctx, b, R * 1.35, 0.55); return; }
    }
    // a swing a moment too early (the ball reaches the ring within 0.13 s, and Cappy is there) waits for it, so a
    // touch screen's small delay never costs the ball; the hit is then at most Good
    for (const b of BALLS) {
      if (!b.live || b.toward < 0 || b.whiffed || b.h > 40) continue;
      const left = b.sweetT - b.age;
      if (deliberate && left > 0 && left < 0.13 && Math.hypot(b.sweetX - hx, b.sweetY - hy) <= R) { S.dg.swBuf++; S.buffer = 0.18; S.bufBall = b; return; }
    }
    // nothing in reach: a swing at a ball that is still coming (on Cappy's half, ahead of him) loses it, so tapping
    // over and over never wins points (Easier champions forgive a swing that is only a little early)
    let early = null, ed = 1e9;
    for (const b of BALLS) {
      if (!b.live || b.toward < 0 || b.whiffed || b.y < 0) continue;
      const dy = hy - b.y, dx = Math.abs(b.x - hx);
      if (dy > 0 && dy < R * 3.2 && dx < R * 1.6 && dy < ed) { early = b; ed = dy; }
    }
    ctx.sfx('padWhiff');
    if (early && !(ctx.easy && deliberate && ed < R * 1.5)) S.dg.swEarly++; else S.dg.swNone++;
    if (early && !(ctx.easy && deliberate && ed < R * 1.5)) {
      early.whiffed = true; S.whiffs++;
      UI.float(SX(hx, hy), SY(hx, hy, 24), t('pad.early'), '#ffe9a0');
    }
  }
  function hitYou(ctx, b, R, cap) {
    const dy = b.y - hitY(), dx = b.x - hitX();
    const q = Math.min(cap || 1, clamp(1 - Math.max(Math.abs(dy) / R, Math.abs(dx) / R * 0.75), 0, 1));
    let word, col = '#fff8e8';
    if (q > 0.62) { word = 'pad.perfect'; col = '#ffd24a'; S.perfects++; S.pounce = Math.min(1, S.pounce + 0.34); ctx.sfx('padPerfect'); }
    else if (q > 0.34) { word = 'pad.good'; col = '#8ee070'; S.pounce = Math.min(1, S.pounce + 0.15); }
    else word = dy < 0 ? 'pad.earlyHit' : 'pad.late';
    if (q > 0.62) S.dg.perf++; else if (q > 0.34) S.dg.good++; else S.dg.weak++;
    S.lastQ = q; S.hint = Math.max(0, S.hint - 0.25); S.rally++; S.hits++; S.lastHitT = S.clock;
    S.speed = Math.min(maxSpeed(ctx), S.speed + (warm() ? 4 : ctx.easy ? BAL.add * 0.7 : BAL.add));
    // aim: a sideways push on the stick picks the side; no push = away from Jada
    // (a firm sideways push aims; running to the ball doesn't count as aiming, so no push = away from Jada)
    const side = Math.abs(S.ax) > 0.7 && S.am > 0.6 ? S.ax : (S.jx > 0 ? -1 : 1) * (0.55 + rnd() * 0.4);
    let xb = clamp(side * 25 + (rnd() - 0.5) * 6, -27, 27), yb = -(18 + q * 24), v = S.speed * (0.85 + 0.35 * q), h0 = 10 + q * 4;
    if (q <= 0.34) { yb = -(14 + rnd() * 10); v *= 0.85; h0 = 16; }   // a weak hit floats up short: easy to smash
    const pounce = S.pounceReady && q > 0.2;
    if (pounce) {
      S.pounceReady = false; S.pounce = 0; word = 'pad.pounce'; col = '#ff9b2e';
      v = warm() ? 150 : ctx.easy ? 170 : 200; yb = -44; h0 = 9; ctx.sfx('pounce');
      UI.burst(SX(b.x, b.y), SY(b.x, b.y, b.h), 14, '#ff9b2e', 70);
    } else if (S.pounce >= 1) S.pounceReady = true;
    UI.float(SX(b.x, b.y), SY(b.x, b.y, b.h + 16), t(word), col);
    ctx.sfx('tick'); UI.burst(SX(b.x, b.y), SY(b.x, b.y, b.h), 5, '#fff8e8', 40);
    launch(b, b.x, b.y, Math.max(6, Math.min(b.h, 20)), xb, yb, v);
    b.tx = xb; b.pounce = pounce; decideThem(ctx, b, q);
  }
  /** Jada (or a marmoset) decides, as the ball leaves Cappy's paddle, whether this one comes back. */
  function decideThem(ctx, b, q) {
    // a better hit is harder to get back, and so is one placed away from her
    let p = q > 0.62 ? BAL.pPerf : q > 0.34 ? BAL.pGood : BAL.pWeak;
    if (warm()) p -= 0.14; else if (ctx.easy) p -= BAL.eP;
    if (Math.abs(b.tx || 0) > 14 && Math.sign(b.tx) !== Math.sign(S.jx || 1)) p -= 0.07;
    if (S.rally > 10) p -= (S.rally - 10) * 0.03;
    // a long match stays close: Jada eases off a little when she is well ahead, and tightens up when well behind
    if (!warm()) p += clamp((S.you - S.them) / 10, -1, 1) * BAL.rb;
    if (b.pounce) p = warm() ? 0.05 : ctx.easy ? 0.1 : 0.2;
    b.willReturn = rnd() < clamp(p, 0.04, 0.97);
    // a ball she won't get: she runs the wrong way a little
    b.offX = b.willReturn ? 0 : (rnd() < 0.5 ? -1 : 1) * (jReach(ctx) + 6);
  }
  function serveYou(ctx) {
    S.hint = Math.max(0, S.hint - 0.4);
    const b = freeBall();
    b.col = S.frenzy ? FRZ_COLS[0] : PLAIN;
    const side = Math.abs(S.ax) * S.am > 0.3 ? S.ax * S.am : (rnd() < 0.5 ? -1 : 1) * 0.5;
    launch(b, hitX(), hitY(), 14, clamp(side * 22, -24, 24), -(26 + rnd() * 14), S.speed * 0.9);
    decideThem(ctx, b, 0.5);
    ctx.sfx('tick'); startRally();
  }
  function serveThem(ctx) {
    const b = freeBall();
    b.col = S.frenzy ? FRZ_COLS[0] : PLAIN;
    shotAtYou(ctx, b, S.jx - 4, S.jy + 7, 14, 0.9);
    S.themSwingT = 0; ctx.sfx('tock'); startRally();
  }
  /** Fruit Frenzy: one extra ball at a time. A marmoset winds up (the "!" tell) only when the new ball can reach Cappy
   *  a fair gap after the balls already coming, and only just after he has hit one (or with nothing coming at him). */
  function tossTick(dt, ctx) {
    let i = -1;
    for (let k = 0; k < S.tossN; k++) if (S.tossAt[k] > 0) { i = k; break; }
    if (i < 0) return;
    if (S.tossWind[i] > 0) {
      S.tossWind[i] -= dt; S.tossWarn[i] = Math.max(0, S.tossWind[i]);
      if (S.tossWind[i] <= 0) { S.tossWind[i] = 0; S.tossAt[i] = 0; S.tossWarn[i] = 9; S.lastTossT = S.sinceServe; toss(ctx, i); }
      return;
    }
    // the first toss after the rally gets going; each later one after a calm (longer before the third ball)
    const calm = i === 0 ? 0 : (S.frenzy >= 3 && i === S.frenzy - 2 ? (ctx.easy ? 3.2 : 2.6) : (ctx.easy ? 2.4 : 1.8));
    if (S.sinceServe < (i === 0 ? S.tossAt[0] : S.lastTossT + calm)) return;
    S.tossWait[i] += dt;
    let coming = false;
    for (const b of BALLS) if (b.live && b.toward > 0 && !b.whiffed && b.sweetT - b.age > 0) coming = true;
    if (coming && S.clock - S.lastHitT > 0.5 && S.tossWait[i] < 6) return;
    // a long wait (a rally that never leaves a gap) settles for a slightly smaller one
    const m = planToss(ctx, i);
    if (m >= (S.tossWait[i] > 5 ? -0.3 * FZ_GAP(ctx) : 0)) {
      S.tossWind[i] = FZ_WIND(ctx); S.tossWarn[i] = S.tossWind[i]; ctx.sfx('padWind');
    }
  }
  function startRally() { S.phase = 'rally'; S.phaseT = 0; S.rally = 0; S.sinceServe = 0; }
  /** A shot from Jada's side to Cappy's: it makes him move (sideways, and short or long). */
  function shotAtYou(ctx, b, x0, y0, h0, mul) {
    const spread = warm() ? 16 : ctx.easy ? 20 : Math.min(28, 20 + S.rally * 2);
    const away = Math.abs(S.cx) > 6 && rnd() < 0.65 ? (S.cx > 0 ? -1 : 1) : (rnd() < 0.5 ? -1 : 1);
    let xb = away * spread * (0.35 + 0.65 * rnd());
    const long = warm() ? S.rally % 2 === 1 : rnd() < 0.5;
    let yb = long ? 38 + rnd() * 10 : 14 + rnd() * 10, v = S.speed * (0.95 + rnd() * 0.12) * mul, smash = false;
    if (!warm() && !S.frenzy && (S.lastQ <= 0.34 ? rnd() < 0.55 : S.lastQ <= 0.62 && !ctx.easy && rnd() < 0.25)) {
      v = Math.min(200, S.speed * 1.3); yb = 38 + rnd() * 8; smash = true;
      UI.float(SX(x0, y0), SY(x0, y0, 30), t('pad.smash'), '#ff9b2e');
    }
    if (S.frenzy) {
      // in a Frenzy Jada sends it so it doesn't reach Cappy on top of another ball: slower and/or longer, nearer the other
      forecast(b);
      if (fcN) {
        let bx = xb, by = yb, bv = v, best = spare(ctx, aimAt(x0, y0, h0, xb, yb, v).t, AIM.x, AIM.y);
        for (let k = 0; k < 10 && best < 0; k++) {
          const sv = v * (1 - 0.05 * (k + 1)), sy = k % 2 ? 40 + rnd() * 6 : yb, sx = xb * (k > 4 ? 0.4 : 0.75);
          const a = aimAt(x0, y0, h0, sx, sy, sv);
          if (a.h > FZ_MAXH) continue;
          const m = spare(ctx, a.t, a.x, a.y);
          if (m > best) { best = m; bx = sx; by = sy; bv = sv; }
        }
        xb = bx; yb = by; v = bv;
      }
    }
    launch(b, x0, y0, h0, xb, yb, v);
    b.smash = smash;
  }
  function hitThem(ctx, b) {
    S.themSwingT = 0; ctx.sfx('tock'); UI.burst(SX(b.x, b.y), SY(b.x, b.y, b.h), 5, '#fff8e8', 40);
    S.lastQ = S.lastQ || 0.5;
    shotAtYou(ctx, b, b.x, b.y, Math.max(6, Math.min(b.h, 20)), 1);
  }
  /** A marmoset tosses a fruit ball in from the side of the table (Fruit Frenzy). */
  const tossV = ctx => (ctx.easy ? 70 : 88);
  /** Pick where toss i will land: a spot Cappy can reach after the balls already coming, as far apart in time as it gets. */
  function planToss(ctx, i) {
    const side = i % 2 ? 1 : -1, x0 = side * (TW + 14), P = S.tossPlan[i], W = FZ_WIND(ctx);
    forecast(null);
    // aim near where Cappy will be (by the ball he must play next, else where he stands)
    let cx = S.cx, ct = 1e9;
    for (let k = 0; k < fcN; k++) if (FC_K[k] && FC_T[k] < ct) { ct = FC_T[k]; cx = FC_X[k]; }
    let best = -9;
    for (let k = 0; k < 6; k++) {
      const xb = clamp(cx + (rnd() - 0.5) * 30, -24, 24), yb = 22 + rnd() * 18;
      const a = aimAt(x0, -6, 22, xb, yb, tossV(ctx)), m = spare(ctx, W + a.t, a.x, a.y) - (a.h > FZ_MAXH ? 5 : 0);
      if (m > best) { best = m; P.t = a.t; P.x = a.x; P.y = a.y; P.xb = xb; P.yb = yb; }
    }
    return best;
  }
  function toss(ctx, i) {
    const b = freeBall(), side = i % 2 ? 1 : -1, x0 = side * (TW + 14), P = S.tossPlan[i];
    b.col = FRZ_COLS[Math.min(i + 1, 2)];
    launch(b, x0, -6, 22, P.xb, P.yb, tossV(ctx));
    ctx.sfx('padToss'); UI.float(SX(x0, -6), SY(x0, -6, 34), t('pad.toss'), b.col);
  }

  /* ---------- the play-bot (test.auto and the balance check): it really moves and swings ---------- */
  function botThink(dt, ctx) {
    const cfg = S.bot;
    // a key player (cfg.keys): looks and decides every tick (40 ms), arrow keys are on or off, Space a moment off
    if (cfg.keys) { S.botTickT = (S.botTickT || 0) + dt; if (S.botTickT < (cfg.tick || 0.04)) return; S.botTickT = 0; }
    BOT_AXIS.x = 0; BOT_AXIS.y = 0; BOT_AXIS.mag = 0;
    if (S.phase === 'serve') { if (S.serve === 'you' && S.phaseT > 0.5) swing(ctx); return; }
    if (cfg.mash) { S.botMashT += dt; if (S.botMashT > 0.2) { S.botMashT = 0; swing(ctx); } if (cfg.still) return; }
    let tb = null, tl = 1e9;
    for (const b of BALLS) {
      if (!b.live || b.toward < 0 || b.whiffed || b.age < cfg.react) continue;
      const left = b.sweetT - b.age;
      if (left > -0.3 && left < tl) { tb = b; tl = left; }
    }
    let gx = 0, gy = YOU_HOME;
    if (tb) {
      gx = tb.sweetX - 4 + tb.botOX; gy = tb.sweetY + 7 + tb.botOY;
      if (!cfg.mash && !tb.botSwung && tb.age >= tb.sweetT + tb.botDT) { tb.botSwung = true; if (!cfg.keys) S.swingT = 9; swing(ctx); }
    }
    const dx = gx - S.cx, dy = gy - S.cy, d = Math.hypot(dx, dy);
    if (cfg.keys) {
      const sx = S.port ? dx : -dy, sy = S.port ? dy : dx;
      BOT_AXIS.x = sx > 1.5 ? 1 : sx < -1.5 ? -1 : 0; BOT_AXIS.y = sy > 1.5 ? 1 : sy < -1.5 ? -1 : 0;
      BOT_AXIS.mag = BOT_AXIS.x || BOT_AXIS.y ? 1 : 0;
      return;
    }
    if (d > 0.5) {
      const ax = dx / d, ay = dy / d;
      // the bot pushes the screen stick: turn court directions back into screen ones
      if (S.port) { BOT_AXIS.x = ax; BOT_AXIS.y = ay; } else { BOT_AXIS.x = -ay; BOT_AXIS.y = ax; }
      BOT_AXIS.mag = Math.min(1, d / 6) * (cfg.speed || 1);
    }
  }

  /* ---------- update ---------- */
  function readAxis(ctx) {
    const a = S.bot ? BOT_AXIS : ctx.axis;
    if (!a || !a.mag) { S.ax = 0; S.ay = 0; S.am = 0; return; }
    const l = Math.hypot(a.x, a.y) || 1, x = a.x / l, y = a.y / l;
    if (S.port) { S.ax = x; S.ay = y; } else { S.ax = y; S.ay = -x; }
    S.am = a.mag;
  }
  function moveCappy(dt, ctx) {
    readAxis(ctx);
    S.cmoving = S.am > 0.05;
    if (!S.cmoving) return;
    const v = cSpeed(ctx) * S.am;
    S.cx = clamp(S.cx + S.ax * v * dt, -SIDE, SIDE);
    S.cy = clamp(S.cy + S.ay * v * dt, TL + 6, BACK - 2);
  }
  function moveJada(dt, ctx) {
    // the most urgent ball coming to Jada's side; else drift back to the middle
    let tb = null, tl = 1e9;
    for (const b of BALLS) { if (!b.live || b.toward > 0) continue; const left = b.sweetT - b.age; if (left > -0.2 && left < tl) { tb = b; tl = left; } }
    let gx = 0, gy = -YOU_HOME;
    if (tb && tb.age > 0.18) { gx = tb.sweetX + 4 + tb.offX; gy = tb.sweetY - 7; }
    const dx = gx - S.jx, dy = gy - S.jy, d = Math.hypot(dx, dy), sp = jSpeed(ctx) * (tb ? 1 : 0.5);
    S.jmoving = d > 1;
    if (d > 0.5) { const s = Math.min(d, sp * dt) / d; S.jx = clamp(S.jx + dx * s, -SIDE, SIDE); S.jy = clamp(S.jy + dy * s, -BACK + 2, -TL - 6); }
  }
  function stepBall(dt, ctx, b) {
    if (!b.live) {
      if (b.fade > 0) { b.fade -= dt; b.x += b.vx * dt * 0.5; b.y += b.vy * dt * 0.5; b.vh -= GRAV * dt; b.h = Math.max(FLOOR_H, b.h + b.vh * dt); }
      return;
    }
    for (let i = NTRAIL - 1; i > 0; i--) { b.trail[i].x = b.trail[i - 1].x; b.trail[i].y = b.trail[i - 1].y; b.trail[i].h = b.trail[i - 1].h; }
    b.trail[0].x = b.x; b.trail[0].y = b.y; b.trail[0].h = b.h;
    b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vh -= GRAV * dt; b.h += b.vh * dt;
    const onTable = Math.abs(b.x) <= TW && Math.abs(b.y) <= TL;
    if (b.vh < 0 && b.h <= 0 && onTable) {
      b.h = 0;
      if (b.bounced >= 1) { point(ctx, b.toward > 0 ? 'them' : 'you', b); return; }   // a second bounce
      b.vh = -b.vh * BOUNCE; b.vx *= FRICT; b.vy *= FRICT; b.bounced = 1; ctx.sfx('tock');
    }
    if (b.h <= FLOOR_H || Math.abs(b.y) > BACK + 10 || Math.abs(b.x) > SIDE + 16) {
      // off the table or away: a ball that never bounced on the far side was out (the hitter loses it)
      const toYou = b.toward > 0;
      point(ctx, b.bounced ? (toYou ? 'them' : 'you') : (toYou ? 'you' : 'them'), b);
      return;
    }
    if (b.toward < 0) {
      // Jada's side: at the sweet moment she hits it back if she reached it and means to
      if (b.bounced && b.age >= b.sweetT && b.willReturn) {
        const d = Math.hypot(b.x - (S.jx - 4), b.y - (S.jy + 7));
        if (d <= jReach(ctx)) hitThem(ctx, b);
        else { b.willReturn = false; S.jdive = 0.5; S.themSwingT = 0; }
      } else if (b.bounced && b.age >= b.sweetT && !S.jdive && !b.missFloat) { b.missFloat = true; S.jdive = 0.5; S.themSwingT = 0; }
    } else if (b.bounced && !b.whiffed && !b.missFloat && b.age > b.sweetT + 0.05 && b.y > hitY() + reach(ctx)) {
      b.missFloat = true;
      const far = Math.hypot(b.sweetX - hitX(), b.sweetY - hitY()) > reach(ctx);
      if (far) S.dg.far++; else S.dg.miss++;
      UI.float(SX(hitX(), hitY()), SY(hitX(), hitY(), 26), t(far ? 'pad.reach' : 'pad.miss'), '#ffb3d6');
      S.cdive = 0.4;
    }
  }
  function update(dt, ctx) {
    S.ctx = ctx; S.clock += dt;
    S.swingT += dt; S.themSwingT += dt; S.phaseT += dt;
    if (S.jumpYou > 0) S.jumpYou -= dt; if (S.jumpThem > 0) S.jumpThem -= dt;
    if (S.jdive > 0) S.jdive = Math.max(0, S.jdive - dt); if (S.cdive > 0) S.cdive = Math.max(0, S.cdive - dt);
    if (S.bot) botThink(dt, ctx);
    if (S.phase !== 'over') moveCappy(dt, ctx);
    // a swing pressed a moment early hits as soon as that ball is in reach (at most a Good hit)
    if (S.buffer > 0) {
      S.buffer -= dt;
      const b = S.bufBall, R = reach(ctx);
      if (!b || !b.live || b.toward < 0 || b.whiffed) S.buffer = 0;
      else if (b.bounced >= 1 && b.h <= 40 && Math.hypot(b.x - hitX(), b.y - hitY()) <= R) { S.buffer = 0; S.swingT = 0; hitYou(ctx, b, R, 0.55); }
    }
    moveJada(dt, ctx);
    if (S.phase === 'serve') {
      if (S.serve === 'them' && S.phaseT > (S.frenzy ? 1.5 : 0.7)) serveThem(ctx);
      else if (S.serve === 'you' && S.phaseT > 3.5) { S.swingT = 9; swing(ctx); }
    } else if (S.phase === 'rally') {
      S.sinceServe += dt;
      tossTick(dt, ctx);
    } else if (S.phase === 'point') {
      if (S.phaseT > (S.frenzy || warm() ? 1.4 : 1.0)) {
        const w = gameWon();
        if (w) {
          if (warm()) {
            ctx.markWarm(); startStage(ctx, 'match'); UI.banner(t('pad.warmDone'), PAL.r4, 2);
            ctx.say([{ who: 'jada', key: 'd.jada.ready' }]);
          } else {
            S.phase = 'over';
            const margin = S.you - S.them, won = w === 'you';
            // stars ask for good timing and the Frenzies too: 2 = a clear win or plenty of Perfects, 3 = plenty of
            // Perfects and more Frenzy balls won than lost
            const stars = won ? 1 + (margin >= 8 || S.perfects >= STAR2 ? 1 : 0) + (S.perfects >= STAR3 && S.fzYou > S.fzThem ? 1 : 0) : 0;
            const score = S.you * 100 + S.perfects * 20 + S.maxRally * 15 + S.fzYou * 60 + (won ? 500 + margin * 50 : 0);
            ctx.finish({ score, stars, won, frac: won ? stars / 3 : (S.you / S.target) * 0.3, stats: { you: S.you, them: S.them, perfects: S.perfects, early: S.whiffs, frenzyYou: S.fzYou, frenzyThem: S.fzThem } });
          }
        } else nextServe(ctx);
      }
    }
    for (const b of BALLS) stepBall(dt, ctx, b);
  }

  /* ---------- drawing ---------- */
  function buildBg(ctx) {
    const W = ctx.W, H = ctx.H, c = JC.canvas2(W, H), g = c.getContext('2d'), D = JC.draw;
    // grass all round, a clay court, the jungle at the edges
    g.fillStyle = '#3f8a4a'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 3) for (let x = (y * 7) % 5; x < W; x += 5) { const r = JC.hash(x, y, 4); if (r < 0.25) { g.fillStyle = r < 0.08 ? '#6fc060' : '#357a40'; g.fillRect(x, y, 1, 2); } }
    const ax = SX(-SIDE - 6, -BACK - 4), bx = SX(SIDE + 6, BACK + 4), ay = SY(-SIDE - 6, -BACK - 4, FLOOR_H), by = SY(SIDE + 6, BACK + 4, FLOOR_H);
    const cx0 = Math.round(Math.min(ax, bx)), cx1 = Math.round(Math.max(ax, bx)), cy0 = Math.round(Math.min(ay, by)), cy1 = Math.round(Math.max(ay, by));
    g.fillStyle = '#7a4a26'; g.fillRect(cx0 - 2, cy0 - 2, cx1 - cx0 + 4, cy1 - cy0 + 4);
    g.fillStyle = COL.clay; g.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
    for (let y = cy0 + 3; y < cy1; y += 5) { g.fillStyle = COL.clayLo; g.fillRect(cx0, y, cx1 - cx0, 1); }
    for (let i = 0; i < 90; i++) { const x = cx0 + JC.hash(i, 3, 7) * (cx1 - cx0), y = cy0 + JC.hash(i, 5, 7) * (cy1 - cy0); g.fillStyle = COL.clayHi; g.fillRect(x | 0, y | 0, 2, 1); }
    // white lines round the court
    g.fillStyle = 'rgba(255,248,232,0.55)';
    g.fillRect(cx0 + 3, cy0 + 3, cx1 - cx0 - 6, 1); g.fillRect(cx0 + 3, cy1 - 4, cx1 - cx0 - 6, 1);
    g.fillRect(cx0 + 3, cy0 + 3, 1, cy1 - cy0 - 6); g.fillRect(cx1 - 4, cy0 + 3, 1, cy1 - cy0 - 6);
    // bushes and big leaves round the clearing
    for (let i = 0; i < 30; i++) {
      const f = (i >> 2) / 7.5 + JC.hash(i, 9, 2) * 0.08, edge = i % 4;
      let x, y;
      if (edge === 0) { x = f * W; y = 4 + JC.hash(i, 1, 2) * 8; } else if (edge === 1) { x = f * W; y = H - 4 - JC.hash(i, 1, 2) * 6; }
      else if (edge === 2) { x = 2 + JC.hash(i, 2, 2) * 8; y = f * H; } else { x = W - 2 - JC.hash(i, 2, 2) * 8; y = f * H; }
      D.disc(g, x, y, 9 + (i % 3) * 3, '#1f5a34'); D.disc(g, x + 3, y - 2, 6 + (i % 2) * 2, '#2f7d3c'); D.disc(g, x + 4, y - 4, 2, '#5fae5a');
    }
    // the fans on logs along the sides (Mango and friends)
    const fans = ['mango', 'marmoset', 'zuzu', 'coco_down', 'pip_down', 'tapir'];
    for (let i = 0; i < fans.length; i++) {
      const s = SPRITES[fans[i]]; if (!s) continue;
      let x, y;
      if (S.port) { const left = i % 2 === 0; x = left ? Math.max(1, cx0 - s.w - 3) : Math.min(W - s.w - 1, cx1 + 3); y = cy0 + 24 + ((i / 2) | 0) * ((cy1 - cy0 - 60) / 2); }
      else { const top = i % 2 === 0; x = cx0 + 34 + ((i / 2) | 0) * ((cx1 - cx0 - 80) / 2); y = top ? Math.max(1, cy0 - s.h - 1) : Math.min(H - s.h - 1, cy1 + 1); }
      x = Math.round(x); y = Math.round(y);
      g.fillStyle = '#5e3820'; g.fillRect(x - 2, y + s.h - 2, s.w + 4, 3);
      g.drawImage(s.c, x, y);
    }
    drawTable(g);
    S.bg = c; S.bgGen = VIEW.gen; S.bgK = S.k; S.bgPort = S.port;
  }
  function drawTable(g) {
    const k = S.k;
    const x0 = Math.round(Math.min(SX(-TW, -TL), SX(TW, TL))), x1 = Math.round(Math.max(SX(-TW, -TL), SX(TW, TL)));
    const y0 = Math.round(Math.min(SY(-TW, -TL, 0), SY(TW, TL, 0))), y1 = Math.round(Math.max(SY(-TW, -TL, 0), SY(TW, TL, 0)));
    const legH = Math.round(-FLOOR_H * S.kh), th = Math.max(2, Math.round(3 * k));
    // the shadow on the floor, the legs, the front edge
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0 + Math.round(3 * k), y0 + legH, x1 - x0 - Math.round(2 * k), y1 - y0);
    for (const fx of [0.08, 0.92]) for (const fy of [0.12, 0.88]) {
      const lx = Math.round(x0 + (x1 - x0) * fx), ly = Math.round(y0 + (y1 - y0) * fy), lw = Math.max(2, Math.round(2 * k));
      g.fillStyle = OUT; g.fillRect(lx - 1, ly, lw + 2, legH + 1); g.fillStyle = '#5a5a6a'; g.fillRect(lx, ly, lw, legH);
    }
    g.fillStyle = OUT; g.fillRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + th + 2);
    g.fillStyle = COL.tableLo; g.fillRect(x0, y1, x1 - x0, th);
    g.fillStyle = COL.table; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    // white edge lines and the centre line, a sheen
    const lw = Math.max(1, Math.round(k));
    g.fillStyle = COL.line;
    g.fillRect(x0, y0, x1 - x0, lw); g.fillRect(x0, y1 - lw, x1 - x0, lw); g.fillRect(x0, y0, lw, y1 - y0); g.fillRect(x1 - lw, y0, lw, y1 - y0);
    if (S.port) g.fillRect(Math.round((x0 + x1) / 2), y0, 1, y1 - y0); else g.fillRect(x0, Math.round((y0 + y1) / 2), x1 - x0, 1);
    g.fillStyle = COL.tableHi; g.globalAlpha = 0.35; g.fillRect(x0 + lw, y0 + lw, x1 - x0 - 2 * lw, 1); g.globalAlpha = 1;
    // the net across the middle, on two posts
    const nh = Math.max(3, Math.round(NET_H * S.kh));
    if (S.port) {
      const ny = Math.round(SY(0, 0, 0)), nx0 = Math.round(SX(-TW - 3, 0)), nx1 = Math.round(SX(TW + 3, 0));
      g.fillStyle = OUT; g.fillRect(nx0 - 1, ny - nh - 1, nx1 - nx0 + 2, nh + 2);
      g.fillStyle = 'rgba(232,232,240,0.85)'; g.fillRect(nx0, ny - nh, nx1 - nx0, nh);
      g.fillStyle = '#9a9aac'; for (let x = nx0 + 1; x < nx1; x += 2) g.fillRect(x, ny - nh + 1, 1, nh - 1);
      g.fillStyle = '#ffffff'; g.fillRect(nx0, ny - nh, nx1 - nx0, 1);
      g.fillStyle = '#3a3a48'; g.fillRect(nx0 - 1, ny - nh - 1, 2, nh + 3); g.fillRect(nx1 - 1, ny - nh - 1, 2, nh + 3);
    } else {
      const nx = Math.round(SX(0, 0)), ny0 = Math.round(SY(-TW - 3, 0, 0)), ny1 = Math.round(SY(TW + 3, 0, 0)), w = Math.max(2, Math.round(k * 1.5));
      g.fillStyle = OUT; g.fillRect(nx - w, ny0 - nh - 1, w * 2, ny1 - ny0 + nh + 2);
      g.fillStyle = 'rgba(232,232,240,0.85)'; g.fillRect(nx - w + 1, ny0 - nh, w * 2 - 2, ny1 - ny0 + nh);
      g.fillStyle = '#9a9aac'; for (let y = ny0 - nh + 1; y < ny1; y += 2) g.fillRect(nx - w + 1, y, w * 2 - 2, 1);
      g.fillStyle = '#3a3a48'; g.fillRect(nx - 1, ny0 - nh - 2, 2, nh + 3); g.fillRect(nx - 1, ny1 - nh - 1, 2, nh + 3);
    }
  }
  function drawPaddle(g, x, y, sw, col, colHi, flip) {
    // a round paddle; sw 0..1 is the swing (it sweeps forward and across)
    const k = S.ks, a = (flip ? Math.PI + 2.2 - sw * 2.6 : -2.2 + sw * 2.6), px = x + Math.cos(a) * 5 * k, py = y + Math.sin(a) * 4 * k;
    JC.draw.line(g, x, y, px, py, '#5e3820');
    const r = Math.max(2, Math.round(2.4 * k));
    JC.draw.disc(g, px, py, r + 1, OUT); JC.draw.disc(g, px, py, r, col); JC.draw.disc(g, px - 1, py - 1, Math.max(1, r >> 1), colHi);
  }
  function drawCappy(g, ctx) {
    const ks = S.ks, x = Math.round(SX(S.cx, S.cy)), y = Math.round(SY(S.cx, S.cy, FLOOR_H));
    const hop = S.jumpYou > 0 && !S.reduced ? Math.round(Math.sin(S.jumpYou / 0.5 * Math.PI) * 6 * ks) : 0;
    const walk = S.cmoving && (((ctx.t * 8) | 0) % 2) ? 1 : 0, names = SPR_C[S.port ? 'up' : 'right'];
    const s = SPRITES[names[walk]] || SPRITES[names[0]];
    JC.draw.shadow(g, x, y, 7 * ks);
    if (s) JC.sprK(g, s, x - s.w * ks / 2, y - s.h * ks + ks - hop, ks);
    const hat = SAVE.data.cos.hat && SPRITES['hat_' + SAVE.data.cos.hat];
    if (hat && s) JC.sprK(g, hat, x - hat.w * ks / 2, y - s.h * ks - hat.h * ks + 4 * ks - hop, ks);
    // the paddle, in his right hand
    const sw = S.swingT < 0.22 ? easeOut(clamp(S.swingT / 0.22, 0, 1)) : 0;
    drawPaddle(g, x + 6 * ks, y - 8 * ks - hop, sw, '#e04848', '#ff9a9a', false);
  }
  function drawJada(g, ctx) {
    const ks = S.ks, x = Math.round(SX(S.jx, S.jy)), y = Math.round(SY(S.jx, S.jy, FLOOR_H));
    const hop = S.jumpThem > 0 && !S.reduced ? Math.round(Math.sin(S.jumpThem / 0.5 * Math.PI) * 6 * ks) : 0;
    const lean = S.jdive > 0 && !S.reduced ? Math.round(Math.sin(S.jdive / 0.5 * Math.PI) * 5 * ks) : 0;
    const sw = S.themSwingT < 0.22 ? easeOut(clamp(S.themSwingT / 0.22, 0, 1)) : 0;
    if (warm()) {
      const m = SPRITES.marmoset, active = S.rally % 2;
      for (let i = 0; i < 2; i++) {
        const off = (i ? 1 : -1) * 11 * ks, mx = S.port ? x + off : x, my = S.port ? y : y + off * 0.8, on = i === active;
        JC.draw.shadow(g, mx, my, 5 * ks);
        JC.sprK(g, m, mx - m.w * ks / 2, my - m.h * ks - (on ? hop : 0), ks, !S.port);
      }
      drawPaddle(g, x - 2 * ks, y - 8 * ks, sw, '#3a7bd5', '#9ac0ff', true);
      return;
    }
    const js = SPRITES.jada, bob = S.jmoving ? (((ctx.t * 6) | 0) % 2) : 0;
    JC.draw.shadow(g, x + lean, y, 7 * ks);
    JC.sprK(g, js, x - js.w * ks / 2 + lean, y - js.h * ks + ks - hop - bob, ks, !S.port);
    drawPaddle(g, x - 6 * ks + lean, y - 9 * ks - hop, sw, '#3a7bd5', '#9ac0ff', true);
  }
  function drawHelpers(g, ctx) {
    // Fruit Frenzy: two marmosets on stools by the net toss the extra balls in
    if (!S.frenzy) return;
    const m = SPRITES.marmoset, ks = S.ks;
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1, cx = side * (TW + 14), x = Math.round(SX(cx, -6)), y = Math.round(SY(cx, -6, FLOOR_H));
      const warn = i < S.tossN && S.tossAt[i] > 0 && S.tossWind[i] > 0;
      const jump = warn && !S.reduced ? Math.round(Math.abs(Math.sin(ctx.t * 12)) * 3 * ks) : 0;
      g.fillStyle = '#5e3820'; g.fillRect(x - 5 * ks, y - 2 * ks, 10 * ks, 3 * ks);
      JC.sprK(g, m, x - m.w * ks / 2, y - m.h * ks - 2 * ks - jump, ks, side > 0);
      if (warn) {
        const col = FRZ_COLS[Math.min(i + 1, 2)], r = Math.max(3, Math.round(2 * ks)), by = y - m.h * ks - 8 * ks - jump;
        JC.draw.disc(g, x, by, r + 1, OUT); JC.draw.disc(g, x, by, r, col);
        text(g, '!', x + r + 4, by - 8, WARM);
      }
    }
  }
  /** A pixel ellipse outline (no allocation). */
  function ring(g, cx, cy, rx, ry, col, w) {
    g.fillStyle = col;
    const n = Math.max(16, Math.round((rx + ry) * 1.3));
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), w, w); }
  }
  function drawMarkers(g, ctx) {
    // for each ball coming to Cappy: where it bounces (a little x), where to stand (the ring, filled once he is in
    // place), and when to swing (a white circle that shrinks onto the ring)
    const R = reach(ctx), hx = hitX(), hy = hitY();
    for (const b of BALLS) {
      if (!b.live || b.toward < 0 || b.whiffed || b.age > b.sweetT + 0.25) continue;
      const sx = SX(b.sweetX, b.sweetY), sy = SY(b.sweetX, b.sweetY, FLOOR_H), rx = R * 0.6 * S.k, ry = R * 0.6 * S.ky;
      const inPos = Math.hypot(b.sweetX - hx, b.sweetY - hy) <= R * 0.62;
      if (inPos) { g.globalAlpha = 0.3; JC.draw.oval(g, sx, sy, rx, ry, b.col); }
      g.globalAlpha = inPos ? 0.95 : 0.7; ring(g, sx, sy, rx, ry, b.col, inPos ? 2 : 1); g.globalAlpha = 1;
      const left = b.sweetT - b.age;
      if (left < 0.75 && left > -0.12) { const f = 1 + Math.max(0, left) / 0.75 * 1.6; g.globalAlpha = 0.9; ring(g, sx, sy, rx * f, ry * f, '#ffffff', 1); g.globalAlpha = 1; }
      if (!b.bounced) {
        const bx = Math.round(SX(b.bx, b.by)), by = Math.round(SY(b.bx, b.by, 0));
        g.fillStyle = b.col; g.globalAlpha = 0.8;
        g.fillRect(bx - 2, by - 2, 1, 1); g.fillRect(bx + 1, by - 2, 1, 1); g.fillRect(bx - 1, by - 1, 2, 2); g.fillRect(bx - 2, by + 1, 1, 1); g.fillRect(bx + 1, by + 1, 1, 1);
        g.globalAlpha = 1;
      }
    }
  }
  function drawBall(g, b) {
    if (!b.live && b.fade <= 0) return;
    const k = S.k, alpha = b.live ? 1 : clamp(b.fade / 0.6, 0, 1);
    const ground = Math.abs(b.x) <= TW && Math.abs(b.y) <= TL && b.h >= -0.5 ? 0 : FLOOR_H;
    g.globalAlpha = 0.32 * alpha; JC.draw.oval(g, SX(b.x, b.y), SY(b.x, b.y, ground), Math.max(2, 2 * k), Math.max(1, k), '#000'); g.globalAlpha = 1;
    if (b.live) for (let i = NTRAIL - 1; i >= 1; i--) {
      const p = b.trail[i]; g.globalAlpha = (1 - i / NTRAIL) * 0.5;
      JC.draw.disc(g, SX(p.x, p.y), SY(p.x, p.y, p.h), Math.max(1, Math.round(k)), b.pounce ? '#ff9b2e' : b.smash ? '#ff5a5a' : b.col);
    }
    const r = Math.max(2, Math.round(1.8 * k)), x = Math.round(SX(b.x, b.y)), y = Math.round(SY(b.x, b.y, b.h));
    g.globalAlpha = alpha;
    JC.draw.disc(g, x, y, r + 1, OUT); JC.draw.disc(g, x, y, r, b.pounce ? '#ffb030' : b.col);
    g.fillStyle = '#ffffff'; g.fillRect(x - 1, y - 1, 1, 1);
    g.globalAlpha = 1;
  }
  function draw(g, ctx) {
    S.reduced = BRBX.reduced();
    layout(ctx);
    if (!S.bg || S.bgGen !== VIEW.gen || S.bgK !== S.k || S.bgPort !== S.port) buildBg(ctx);
    g.drawImage(S.bg, 0, 0);
    drawMarkers(g, ctx);
    drawJada(g, ctx);
    drawHelpers(g, ctx);
    // the serve: the ball bobs over the server's paddle
    if (S.phase === 'serve') {
      const you = S.serve === 'you', bx = you ? hitX() : S.jx - 4, by = you ? hitY() : S.jy + 7, h = 14 + Math.abs(Math.sin(S.phaseT * 4)) * 8;
      const x = Math.round(SX(bx, by)), y = Math.round(SY(bx, by, h)), r = Math.max(2, Math.round(1.8 * S.k));
      JC.draw.disc(g, x, y, r + 1, OUT); JC.draw.disc(g, x, y, r, S.frenzy ? FRZ_COLS[0] : PLAIN);
    }
    drawCappy(g, ctx);
    for (const b of BALLS) drawBall(g, b);
    drawHud(g, ctx);
  }
  /** Centred text squeezed to fit a width (cached cut, no per-frame string while it is the same). */
  const FITC = { src: '', w: 0, clear: null, out: '' }, WARMC = { align: 'center', col: PAL.r4 };
  function textFit(g, str, cx, y, w) {
    if (FITC.src !== str || FITC.w !== w || FITC.clear !== TEXT.clear) {
      // narrowed to fit first (Japanese, German); only a very long label is also shortened
      let o = str; while (o.length > 4 && textW(o) * 0.68 > w) o = o.slice(0, -2) + '…';
      FITC.src = str; FITC.w = w; FITC.clear = TEXT.clear; FITC.out = o;
    }
    WARMC.maxW = w; text(g, FITC.out, cx, y, WARMC);
  }
  const FITL = { src: '', w: 0, clear: null, out: '' };
  function textFitL(g, str, x, y, w) {
    if (FITL.src !== str || FITL.w !== w || FITL.clear !== TEXT.clear) {
      let o = str; while (o.length > 3 && textW(o) > w) o = o.slice(0, -1);
      FITL.src = str; FITL.w = w; FITL.clear = TEXT.clear; FITL.out = o;
    }
    text(g, FITL.out, x, y, CHIP);
  }
  function hintLines(str, w) {
    if (WRAP.str !== str || WRAP.w !== w || WRAP.clear !== TEXT.clear) { WRAP.str = str; WRAP.w = w; WRAP.clear = TEXT.clear; WRAP.n = JC.font.wrap(str, w, 1).length; }
    return WRAP.n;
  }
  function drawHud(g, ctx) {
    const W = ctx.W, H = ctx.H;
    VA.name = t('name.cappy'); VA.score = S.you; VA.of = S.target;
    VB.name = warm() ? t('name.marm') : t('name.jada'); VB.score = S.them; VB.of = S.target;
    HUD.versus(g, VA, VB);
    // the Pounce meter: under the scores (tall), between them (wide), or at the bottom when that gap is too small
    const mw = S.port ? 80 : 96, pw = Math.min(150, (W - HUD.left() - 12) / 2 | 0), gap = W - 6 - HUD.left() - 2 * pw;
    const mx = S.port ? HUD.left() : Math.round(W / 2 - mw / 2), my = S.port ? 34 : gap >= mw + 8 ? 6 : H - 24;
    HUD.meter(g, mx, my, mw, t(S.pounceReady ? 'pad.pounceReady' : 'pad.pounceMeter'), S.pounceReady ? 1 : S.pounce, '#ff9b2e', S.pounceReady);
    if (warm() && S.phase !== 'over') {
      // tall: a chip beside the meter (the score bars already show first to 3)
      if (S.port) { const x = mx + mw + 6, w = W - x - 6; JC.draw.box(g, x, 34, w, 18, 'rgba(27,19,37,0.82)', PAL.ink); textFit(g, t('pad.warmBanner'), x + w / 2, 36, w - 6); }
      else text(g, t('pad.warm'), W / 2, 28, WARM);
    }
    // how far the match goes: a chip beside the meter (tall) or under it (wide), until a Frenzy takes its place
    if (!warm() && !S.frenzy && S.phase !== 'over') {
      const x = S.port ? mx + mw + 6 : Math.round(W / 2 - 48), w = S.port ? W - x - 6 : 96, y = S.port ? 34 : (my === 6 ? 26 : 6);
      JC.draw.box(g, x, y, w, 18, 'rgba(27,19,37,0.82)', PAL.ink); textFit(g, t('pad.firstTo', { n: S.target }), x + w / 2, y + 2, w - 6);
    }
    // Fruit Frenzy: a chip with the balls in play
    if (S.frenzy) {
      const x = S.port ? mx + mw + 6 : Math.round(W / 2 - 48), w = S.port ? W - x - 6 : 96, y = S.port ? 34 : (my === 6 ? 26 : 6);
      JC.draw.box(g, x, y, w, 18, '#e0701f', OUT);
      textFitL(g, t('pad.frenzyChip'), x + 4, y + 2, w - 8 - S.frenzy * 8);
      for (let i = 0; i < S.frenzy; i++) { const bx = x + w - 6 - (S.frenzy - 1 - i) * 8; JC.draw.disc(g, bx, y + 9, 3, OUT); JC.draw.disc(g, bx, y + 9, 2, FRZ_COLS[i]); }
    }
    // the Swing button (touch)
    if (ctx.touch && S.phase !== 'over') {
      const bs = swingSize(ctx);
      B_SW.glow = S.pounceReady; B_SW.col = S.pounceReady ? '#ff9b2e' : '#e04848';
      UI.button(g, 'pswing', W - bs - 8, H - bs - 8, bs, bs, t('pad.swing'), B_SW);
    }
    // the hint, above the controls
    if (S.hint > 0.05 && (S.phase === 'serve' || S.phase === 'rally')) {
      const serve = S.phase === 'serve' && S.serve === 'you';
      const str = t(serve ? (ctx.touch ? 'pad.hintServeTouch' : 'pad.hintServeKeys') : (ctx.touch ? 'pad.hintTouch' : 'pad.hintKeys'));
      // tall: under the scores, above Jada's end (never over Cappy's end); wide: low in the middle, between the stick
      // and the Swing button
      const bs = swingSize(ctx), wide = !S.port;
      const hx = wide && ctx.touch ? Math.round(W * 0.22) : 6;
      // the words keep a margin inside their dark bar (Chinese and Japanese wrap right up to the edge otherwise)
      const wMax = wide && ctx.touch ? W - bs - 16 - hx - 4 : W - 12, n = hintLines(str, wMax - 10), LH = JC.font.LINE_H;
      const by = wide ? (my > H / 2 ? my - 6 : H - 6) - n * LH : 56;
      g.globalAlpha = clamp(S.hint * 2, 0, 1);
      JC.draw.box(g, hx - 2, by - 2, wMax + 4, n * LH + 4, 'rgba(27,19,37,0.72)', 'rgba(27,19,37,0.72)');
      textBlock(g, str, hx + 5, by, wMax - 10, HINT); g.globalAlpha = 1;
    }
  }

  JC.register({
    id: 'paddle',
    champion: 'jada',
    music: 'paddle',
    // the floating joystick moves Cappy; a touch anywhere else (or the Swing button) swings
    stick: true,
    /** The intro card says that a warm-up comes first (until it has been played once). */
    introNote(ctx) { return ctx.warmedUp ? '' : t('pad.warmCard'); },
    start(ctx) {
      S.ctx = ctx; S.perfects = 0; S.whiffs = 0; S.hits = 0; S.maxRally = 0; S.hint = ctx.firstTime ? 1.6 : 0; S.hintRound = S.hint > 0; S.auto = false; S.bot = null;
      S.swingT = 9; S.themSwingT = 9; S.jumpYou = 0; S.jumpThem = 0; S.jdive = 0; S.cdive = 0; S.lastQ = 0.5; S.fzYou = 0; S.fzThem = 0;
      startStage(ctx, ctx.warmedUp ? 'match' : 'warm');
      if (!ctx.warmedUp) UI.banner(t('pad.warmBanner'), PAL.r4, 1.6);
    },
    update,
    draw,
    onInput(e, ctx) {
      if (e.type === 'press' && e.key === 'a') swing(ctx);
      else if (e.type === 'down') swing(ctx);       // the Swing button, or a touch / click anywhere outside the joystick
    },
    outro(dt, ctx) { update(dt, ctx); },
    /** Test hooks: the state, a play-bot that moves and swings, the balance check, and a quick result. */
    testState(ctx) {
      return { stage: S.stage, you: S.you, them: S.them, target: S.target, phase: S.phase, serve: S.serve, rally: S.rally, pounce: S.pounce,
        pounceReady: S.pounceReady, perfects: S.perfects, whiffs: S.whiffs, hits: S.hits, frenzy: S.frenzy, frenzyDone: S.fzDone, frenzyYou: S.fzYou, frenzyThem: S.fzThem, fzMinGap: +S.fzMinGap.toFixed(2), fzTight: S.fzTight, fzArr: S.fzArr,
        tossWarn: S.tossWarn.slice(0, 2), tossPending: pendingTosses(), dg: Object.assign({}, S.dg), speed: Math.round(S.speed), easy: !!(ctx && ctx.easy),
        port: S.port, reach: ctx ? reach(ctx) : 0, auto: S.auto,
        cappy: { x: +S.cx.toFixed(1), y: +S.cy.toFixed(1), hx: +hitX().toFixed(1), hy: +hitY().toFixed(1) }, jada: { x: Math.round(S.jx), y: Math.round(S.jy) },
        balls: BALLS.map(b => ({ live: b.live, toward: b.toward, x: +b.x.toFixed(1), y: +b.y.toFixed(1), h: +b.h.toFixed(1), bounced: b.bounced, whiffed: b.whiffed,
          age: +b.age.toFixed(3), sweetT: +b.sweetT.toFixed(3), sweetX: +b.sweetX.toFixed(1), sweetY: +b.sweetY.toFixed(1), col: b.col })),
        // where Cappy is on the screen (virtual px), for real-input tests
        screen: { cappy: [Math.round(SX(S.cx, S.cy)), Math.round(SY(S.cx, S.cy, FLOOR_H))], k: S.k } };
    },
    test: {
      auto(ctx, on) { S.auto = !!on; S.bot = on ? { react: 0.12, pos: 0, time: 0, speed: 1 } : null; return S.auto; },
      /** A play-bot with human-like faults: { react (s), pos (court units off), time (s timing spread), speed, mash, still }. */
      bot(ctx, cfg) { S.bot = cfg ? Object.assign({ react: 0.3, pos: 4, time: 0.06, speed: 1 }, cfg) : null; S.auto = !!cfg; return !!S.bot; },
      point(ctx, who) { const b = freeBall(); b.live = true; point(ctx, who === 'them' ? 'them' : 'you', b); return S.you + ':' + S.them; },
      /** The balance knobs (the balance check tries values; the game never calls this). */
      tune(ctx, o) { if (o) Object.assign(BAL, o); return Object.assign({}, BAL); },
      skipWarm(ctx) { ctx.markWarm(); startStage(ctx, 'match'); return S.stage; },
      /** Jump to a score between points (at 3 or 6 the next serve brings a Fruit Frenzy). */
      score(ctx, you, them) {
        S.you = you; S.them = them;
        for (const b of BALLS) { b.live = false; b.fade = 0; }
        S.frenzy = 0; S.tossN = 0; S.phase = 'point'; S.phaseT = 9; S.ptYou = 0; S.ptThem = 0;
        return S.you + ':' + S.them;
      },
      /** The balance check: n whole matches (no warm-up) with a bot, run at once without drawing. */
      sim(ctx, cfg, n) {
        const keep = S.bot, out = { n: n || 20, wins: 0, you: 0, them: 0, secs: 0, perfects: 0, fzYou: 0, fzThem: 0, fzMinGap: 9, fzTight: 0, fzArr: 0, stars: [0, 0, 0, 0] };
        let res = null;
        const fake = { easy: !!(cfg && cfg.easy), W: ctx.W, H: ctx.H, tap: ctx.tap, touch: false, firstTime: false, warmedUp: true, t: 0, axis: BOT_AXIS,
          sfx() {}, say() {}, markWarm() {}, finish(r) { res = r; } };
        for (let m = 0; m < out.n; m++) {
          res = null; S.bot = Object.assign({ react: 0.3, pos: 4, time: 0.06, speed: 1 }, cfg || {});
          S.perfects = 0; S.whiffs = 0; S.maxRally = 0; S.fzYou = 0; S.fzThem = 0; S.lastQ = 0.5; S.fzMinGap = 9; S.fzTight = 0; S.fzArr = 0; S.arr.fill(0);
          startStage(fake, 'match');
          let tt = 0;
          while (!res && tt < 900) { update(1 / 60, fake); tt += 1 / 60; fake.t = tt; }
          if (res) { out.wins += res.won ? 1 : 0; out.you += res.stats.you; out.them += res.stats.them; out.perfects += res.stats.perfects; out.fzYou += res.stats.frenzyYou; out.fzThem += res.stats.frenzyThem; out.stars[res.stars]++; }
          out.fzMinGap = Math.min(out.fzMinGap, S.fzMinGap); out.fzTight += S.fzTight; out.fzArr += S.fzArr;
          out.secs += tt;
        }
        S.bot = keep; S.auto = !!keep; startStage(ctx, 'match'); UI.clearFx();
        out.winRate = +(out.wins / out.n).toFixed(2); out.avgSecs = Math.round(out.secs / out.n); out.avgYou = +(out.you / out.n).toFixed(1); out.avgThem = +(out.them / out.n).toFixed(1);
        out.avgPerfects = +(out.perfects / out.n).toFixed(1);
        return out;
      },
    },
    cheat(won) { const you = won ? 30 : 18, them = won ? 18 : 30; S.you = you; S.them = them; return { score: you * 100 + (won ? 700 : 0), stars: won ? 2 : 0, won, frac: won ? 0.67 : 0.13 }; },
  });
})();
