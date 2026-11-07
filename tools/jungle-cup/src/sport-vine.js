// ======================================================================================================
// VINE CLIMB vs Sloane the sloth: race up the Great Grove tree, 60 m in 75 s.
//   Cappy hangs on a swinging vine. The next vine (the one with the ring) is above; tap / Space / A when your swing
//   brings you under it (the ring turns green) to leap and grab it. Too far away: nothing happens ("Wait for it").
//   Close but not close enough: your paws slip and you fall to the last branch platform (at 15, 30 and 45 m).
//   Standing on a branch, the next vine swings over you: grab it as it passes.
//   Hazards: coconuts shake, then drop past the next vine; angry bees buzz in from the edge, then fly across the gap.
//   Leap into either and Cappy is knocked off: "Bonk!", a tumble, and he drops to the last branch platform he passed
//   (with Easier champions, only a couple of vines: he catches one on the way down). Hanging on is safe: wait for it to
//   pass, then leap. Sloane is slow but never stops: reach the canopy (60 m) before she does.
// World units: x in pixels from the trunk's centre, y (wy) in pixels upwards from the forest floor (PXM per metre).
// ======================================================================================================
(function () {
  const PXM = 40 / 3, GAP = 3, N = 20, TOP_M = 60, TIME = 75, LEAP = 0.3, TRUNK = 21;
  const BRANCHES = { 5: true, 10: true, 15: true }, BR_LIST = [5, 10, 15];
  const S = {
    T: [], cur: 0, state: 'stand', x: -26, y: 28, hm: 0, maxM: 0, facing: 1, vx: 0, vy: 0, walkTo: -26,
    leapT: 0, leapFrom: 0, leapX0: 0, leapY0: 0, leapOk: true, leapBack: 0, tapAt: -1, tapFor: 0, daze: 0, time: 0, auto: false, sigma: 0, eps: 0,
    sloane: 0, sloaneV: 1, falls: 0, perfects: 0, grabs: 0, bonks: 0, knocks: 0, knock: 0, spin: 0, fallTo: -1, cam: 0, waitMsg: 0, over: false, won: false, hint: 1,
    coco: { on: false, x: 0, wy: 0, vy: 0, shake: 0, next: 8, hit: false },
    bee: { on: false, x: 0, wy: 0, dir: 1, warn: 0, next: 10, hit: false, t: 0 },
    cheer: 0, bg: null, bgGen: -1, bgH: 0, trunk: null, floor: null, canopy: null, branch: null, finishT: 0,
    hangCol: '', ctx: null, k: 1, vw: 320, vh: 240, bgK: 0,
  };
  for (let i = 0; i <= N; i++) S.T.push({ i, kind: 'vine', h: i * GAP, X: 0, L: 46, ax: 0, ah: 0, A: 0.1, w: 3, p: 0, sx: 0 });
  const R = ctx => (ctx.easy ? 12 : 8);
  const isStand = k => k === 'ground' || k === 'branch';
  /** The scene is drawn k times bigger on big views (whole pixels), so the tree reads the same on a phone and a laptop. */
  function view(ctx) { const k = Math.max(1, Math.floor(Math.min(ctx.W / 190, ctx.H / 165))); S.k = k; S.vw = Math.ceil(ctx.W / k); S.vh = Math.ceil(ctx.H / k); }
  const fl = (x, y, str, col) => UI.float(x * S.k, y * S.k, str, col, S.k);
  const bu = (x, y, n, col, sp) => UI.burst(x * S.k, y * S.k, n, col, sp);

  /* ---------- sprites: small pixel maps, plus a helper that paints limbs onto a base map ---------- */
  function grid(w, h) { const g = []; for (let y = 0; y < h; y++) { const r = []; for (let x = 0; x < w; x++) r.push('.'); g.push(r); } return g; }
  function stamp(g, rows, ox, oy) { for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) { const c = rows[j][i], y = oy + j, x = ox + i; if (c !== '.' && c !== ' ' && y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c; } }
  /** A 2-pixel-wide outlined limb along points [x, y, x, y, ...] (sprite pixels), with an optional tip colour (claws). */
  function limb(g, pts, fill, tip) {
    const H = g.length, W = g[0].length, cells = [];
    for (let s = 0; s + 3 < pts.length; s += 2) {
      const x0 = pts[s], y0 = pts[s + 1], x1 = pts[s + 2], y1 = pts[s + 3], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
      for (let k = 0; k <= n; k++) { const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n); cells.push(x, y, x + 1, y); }
    }
    const inside = (x, y) => y >= 0 && y < H && x >= 0 && x < W;
    for (let c = 0; c < cells.length; c += 2) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = cells[c] + dx, y = cells[c + 1] + dy; if (inside(x, y) && g[y][x] === '.') g[y][x] = 'o'; }
    for (let c = 0; c < cells.length; c += 2) if (inside(cells[c], cells[c + 1])) g[cells[c + 1]][cells[c]] = fill;
    if (tip) { const x = pts[pts.length - 2], y = pts[pts.length - 1]; if (inside(x, y)) g[y][x] = tip; if (inside(x + 1, y)) g[y][x + 1] = tip; }
  }
  const rowsOf = g => g.map(r => r.join(''));
  // Sloane hugging the trunk: the base map with one arm reaching up (two frames, left and right).
  const SL_PAL = Object.assign({}, SLOANE_PAL, { m: '#3a2a20' });
  function sloaneFrame(right) {
    const g = grid(18, 18); stamp(g, SLOANE_ROWS, 1, 2);
    if (right) limb(g, [15, 13, 16, 8, 16, 1], 'F', 'm'); else limb(g, [1, 13, 0, 8, 0, 1], 'F', 'm');
    return rowsOf(g);
  }
  const SLOANE_ROWS = [
    '................', '.....oooooo.....', '...oofffffffoo..', '..offllllllffo..', '.ofllllllllllfo.', '.oflmmmllmmmlfo.',
    '.ofmmkwllwkmmfo.', '.oflmmllllmmlfo.', '.ofllllnnllllfo.', '..oflllllllllo..', '..ofFlgggglFfo..', '.oFffffffffffFo.',
    'oFFoffffffffoFFo', 'oFo.offFFffo.oFo', '.o..oFFooFFo..o.', '.....oo..oo.....'];
  sprite('vc_sloane1', sloaneFrame(false), SL_PAL);
  sprite('vc_sloane2', sloaneFrame(true), SL_PAL);
  // Cappy hanging by both paws (front view), two frames (feet together / kicked out).
  // Cappy hanging by both paws (front view): the walking-down map with two arms reaching up around the ears to the vine.
  function hangRows(kick) {
    const g = grid(20, 21), body = CAPPY.down.slice(1);
    stamp(g, kick ? body.slice(0, body.length - 1).concat(['..offo....offo..']) : body, 2, 6);
    limb(g, [2, 16, 1, 9, 4, 4, 8, 1], 'b', 'l');
    limb(g, [16, 16, 17, 9, 14, 4, 10, 1], 'b', 'l');
    return rowsOf(g);
  }
  function buildHang() {
    const col = (JC.bandanas && JC.bandanas[SAVE.data.cos.bandana]) || '#45c34e';
    if (col === S.hangCol) return;
    S.hangCol = col;
    const pal = Object.assign({}, CAPPY_PAL, { g: col, G: shade(col, -0.32) });
    sprite('vc_hang', hangRows(false), pal);
    sprite('vc_hang2', hangRows(true), pal);
  }
  const NUT = { o: OUT, n: '#8a5a33', N: '#5e3a20', k: '#2a1a12', l: '#b07a44' };
  sprite('vc_coconut', ['..oooo..', '.olnnNo.', 'olnnnnNo', 'onknknNo', 'onnnnnNo', 'onnnnNNo', '.onNNNo.', '..oooo..'], NUT);
  const BEE = { o: OUT, y: '#ffd23f', Y: '#e0a020', k: '#1a1220', w: '#e8f6ff', r: '#ff5a5a' };
  sprite('vc_bee1', ['...ww.ww..', '...wwwww..', '..ooooooo.', '.oykykyrko', 'ooYkYkyyyo', '..ooooooo.'], BEE);
  sprite('vc_bee2', ['..........', '..........', '..ooooooo.', '.oykykyrko', 'ooYkYkyyyo', '..owwwwwo.'], BEE);
  const LEAF = { o: '#123524', g: '#4fa83f', G: '#2f7d3c', l: '#7cc84a', f: '#ff6fb5', y: '#ffd24a' };
  sprite('vc_clump', [
    '......oooo........', '...oooggllooo.....', '..oggGgllgGggoo...', '.oggfgGgggggGlgo..', 'ogGgggggGgglggggo.',
    '.oggGgggggGgfgGgo.', '..ooGggoooGggoo...', '....oo.....oo.....'], LEAF);
  const NOOPT2 = {};
  const T_L = { col: PAL.white, align: 'left' }, T_R = { col: PAL.white, align: 'right' }, T_C = { col: PAL.white, align: 'center' };
  const T_VAL = { col: PAL.r4, align: 'left' }, HINT = { align: 'center', col: '#fff8e8' }, SIGN = { align: 'center', col: '#3b2416', edge: null };
  const T_TIME = { align: 'center', col: PAL.white }, WARN = { align: 'center', col: PAL.r3 }, WARN2 = { align: 'center', col: PAL.white }, ARROW = { col: '#c9a37a' };

  /* ---------- the tree: targets ---------- */
  function build(ctx) {
    const r = ctx.rng;
    let base = -26, side = -1;
    const T = S.T;
    T[0].kind = 'ground'; T[0].sx = -26; T[0].X = -26;
    for (let i = 1; i <= N; i++) {
      const v = T[i], prev = T[i - 1];
      v.h = i * GAP;
      // the swing gets a little quicker as you climb
      const per = (ctx.easy ? 3.0 : 2.6) - 0.4 * (i / N);
      v.w = (Math.PI * 2) / per;
      if (BRANCHES[i]) { v.kind = 'branch'; v.sx = clamp(base, -40, 40); v.X = v.sx; base = v.sx; continue; }
      v.kind = i === N ? 'top' : 'vine';
      const D = 22 + r() * 10;
      if (base > 26) side = -1; else if (base < -26) side = 1; else side = -side;
      v.X = clamp(base + side * D, -62, 62);
      v.L = 44 + Math.round(r() * 8);
      v.ax = v.X; v.ah = v.h * PXM + v.L;
      // waiting to be grabbed: a gentle sway, or (above a branch) a swing that passes over Cappy standing there
      if (isStand(prev.kind)) v.A = Math.asin(clamp((Math.abs(v.X - prev.sx) + 3) / v.L, 0.1, 0.95));
      else v.A = 0.1;
      v.p = r() * 6.28;
      base = v.X;
    }
  }
  const ang = (v, tt) => v.A * Math.sin(v.w * tt + v.p);
  /** The tip of vine v at time tt (world px): x and wy. */
  const tipX = (v, tt) => v.ax + v.L * Math.sin(ang(v, tt));
  const tipY = (v, tt) => v.ah - v.L * Math.cos(ang(v, tt));
  /** Where the next target is (its grab point) at time tt. */
  function nextX(tt) { const n = S.T[S.cur + 1]; if (!n) return S.x; return n.kind === 'branch' ? S.x : tipX(n, tt); }
  function cappyX(tt) { const c = S.T[S.cur]; return S.state === 'hang' && c.kind !== 'ground' && c.kind !== 'branch' ? tipX(c, tt) : S.x; }
  /** Start riding vine v from angle a0, swinging first away from the next target (a full swing before the leap). */
  function ride(v, a0) {
    const n = S.T[v.i + 1];
    const tx = n ? (n.kind === 'branch' ? n.sx : n.X) : v.X;
    v.A = Math.asin(clamp((Math.abs(tx - v.X) + 4) / v.L, 0.25, 0.92));
    const away = tx >= v.X ? -1 : 1, s = Math.asin(clamp(a0 / v.A, -1, 1));
    const ph = away > 0 ? s : Math.PI - s;
    v.p = ph - v.w * S.time;
  }

  /* ---------- play ---------- */
  function tryGrab(ctx) {
    if (S.over || S.daze > 0 || (S.state !== 'hang' && S.state !== 'stand')) return;
    const n = S.T[S.cur + 1]; if (!n) return;
    const r = R(ctx) + (S.state === 'stand' ? 2 : 0);
    const dx = n.kind === 'branch' ? 0 : nextX(S.time) - cappyX(S.time), ad = Math.abs(dx);
    // standing on the ground or a branch, nothing is lost by waiting: a jump only goes when the vine is in reach
    if (ad > (S.state === 'stand' ? r : r * 2.4)) { if (S.waitMsg <= 0) { fl(sxOf(S.x), syOf(S.y) - 34, t('vc.wait'), '#ffe9a0'); S.waitMsg = 0.7; } return; }
    S.hint = Math.max(0, S.hint - 0.25);
    S.leapX0 = cappyX(S.time); S.leapY0 = S.y; S.leapFrom = S.cur; S.leapT = 0; S.leapOk = ad <= r; S.state = 'leap';
    ctx.sfx('whoosh');
    if (S.leapOk && n.kind !== 'branch') {
      const q = 1 - ad / r;
      if (q > 0.55) { S.perfects++; fl(sxOf(S.leapX0), syOf(S.y) - 40, t('vc.perfect'), '#ffd24a'); }
      else fl(sxOf(S.leapX0), syOf(S.y) - 40, t('vc.good'), '#8ee070');
    }
    S.eps = S.sigma ? gauss() * S.sigma : 0;
  }
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283 * v); }
  function landOn(ctx, i) {
    const v = S.T[i]; S.cur = i; S.grabs++;
    if (v.kind === 'branch') {
      S.state = 'stand'; S.x = v.sx; S.walkTo = v.sx; S.y = v.h * PXM + 28; ctx.sfx('step');
      fl(sxOf(S.x), syOf(S.y) - 36, t('vc.checkpoint'), '#9fe8ff');
      const n = S.T[i + 1]; if (n) n.p = Math.PI * 0.9 - n.w * S.time;    // the next vine starts its swing toward you
    } else {
      ctx.sfx('grab');
      // continuity: take the vine at the angle that puts its tip under Cappy's paws
      const a0 = Math.asin(clamp((S.x - v.ax) / v.L, -0.95, 0.95));
      ride(v, a0); S.state = 'hang';
      bu(sxOf(S.x), syOf(S.y), 6, '#7cc84a', 40);
      if (v.kind === 'top') win(ctx);
    }
    S.hm = v.h; S.maxM = Math.max(S.maxM, v.h);
  }
  function fall(ctx) {
    S.state = 'fall'; S.vy = 0; S.falls++; S.fallTo = lastStand(S.cur);
    ctx.sfx('miss'); fl(sxOf(S.x), syOf(S.y) - 30, t('vc.slip'), '#ffb3d6');
  }
  /** Hit by a coconut or a bee: knocked off, a tumble, and down to the last branch (Easier: catch a vine two below). */
  function knock(ctx, msg, col) {
    S.bonks++; S.knocks++; S.knock = 1; S.spin = 0;
    ctx.sfx('bonk'); ctx.sfx('miss');
    fl(sxOf(S.x), syOf(S.y) - 40, msg, col);
    bu(sxOf(S.x), syOf(S.y - 8), 10, '#ffe9a0', 70);
    JC.juice.shake(3, 0.3);
    const ls = lastStand(S.cur);
    if (S.state === 'stand') { S.daze = 1.1; S.knock = 0.9; return; }       // on a branch: knocked flat where you stand
    let to = ls;
    if (ctx.easy) { const c = Math.max(ls, S.cur - 2); if (c > ls && S.T[c].kind === 'vine') to = c; }
    S.state = 'fall'; S.vy = 80; S.fallTo = to;
  }
  function lastStand(i) { for (let k = i; k >= 0; k--) if (isStand(S.T[k].kind)) return k; return 0; }
  function win(ctx) {
    if (S.over) return;
    S.over = true; S.won = true; S.state = 'top'; S.finishT = S.time; S.y = TOP_M * PXM + 28; S.cheer = 2; S.hm = TOP_M; S.maxM = TOP_M;
    ctx.sfx('cheer'); UI.confetti(sxOf(S.x) * S.k, (syOf(S.y) - 20) * S.k, 40); UI.banner(t('vc.top'), PAL.r4, 1.4);
    finishRound(ctx);
  }
  function finishRound(ctx) {
    S.finishT = S.time;
    const won = S.won, secs = S.time;
    let stars = 0;
    if (won) stars = 1 + (secs <= 46 ? 1 : 0) + (secs <= 34 ? 1 : 0);
    const score = Math.round(S.maxM * 10 + S.perfects * 20 + (won ? 500 + Math.max(0, TIME - secs) * 10 : 0));
    ctx.finish({ score, stars, won, frac: won ? [0.34, 0.67, 1][stars - 1] : (S.maxM / TOP_M) * 0.32, stats: { metres: S.maxM, secs: Math.round(secs), falls: S.falls, knocks: S.knocks, sloane: Math.round(S.sloane) } });
  }
  function update(dt, ctx) {
    S.ctx = ctx; view(ctx);
    S.time += dt;
    if (S.waitMsg > 0) S.waitMsg -= dt;
    if (S.daze > 0) S.daze -= dt;
    if (S.knock > 0 && S.state !== 'fall') S.knock -= dt;
    JC.juice.tick(dt);
    if (S.cheer > 0) S.cheer -= dt;
    // Sloane: slow, steady, never stops
    if (!S.over) S.sloane = Math.min(TOP_M, S.sloane + S.sloaneV * dt);
    moveCappy(dt, ctx);
    hazards(dt, ctx);
    if (S.auto && !S.over) bot(ctx);
    // the camera follows Cappy's paws (a little ahead upwards)
    const want = Math.max(40, S.y + 10);
    S.cam += (want - S.cam) * Math.min(1, dt * 5);
    if (S.over) return;
    if (S.sloane >= TOP_M) { S.over = true; S.won = false; ctx.sfx('miss'); UI.banner(t('vc.sloaneTop'), '#ffb3d6', 1.4); finishRound(ctx); return; }
    if (S.time >= TIME) { S.over = true; S.won = S.hm > S.sloane; finishRound(ctx); }
  }
  function moveCappy(dt, ctx) {
    const c = S.T[S.cur];
    if (S.state === 'hang') {
      S.x = tipX(c, S.time); S.y = tipY(c, S.time);
      const v = Math.cos(c.w * S.time + c.p); S.facing = v >= 0 ? 1 : -1;
    } else if (S.state === 'stand') {
      if (Math.abs(S.walkTo - S.x) > 0.5) { const d = sign(S.walkTo - S.x); S.x += d * Math.min(Math.abs(S.walkTo - S.x), 60 * dt); S.facing = d; }
      else { const n = S.T[S.cur + 1]; if (n) S.facing = n.X >= S.x ? 1 : -1; }
      S.y = c.h * PXM + 28;
    } else if (S.state === 'leap') {
      S.leapT += dt;
      const k = clamp(S.leapT / LEAP, 0, 1), n = S.T[S.leapFrom + 1];
      const tx = n.kind === 'branch' ? n.sx : tipX(n, S.time), ty = n.kind === 'branch' ? n.h * PXM + 28 : tipY(n, S.time);
      // a miss falls short: the paws reach the vine's side, not the vine
      const ex = S.leapOk ? tx : lerp(S.leapX0, tx, 0.75), ey = S.leapOk ? ty : ty - 8;
      S.x = lerp(S.leapX0, ex, k); S.y = lerp(S.leapY0, ey, easeOut(k)) + Math.sin(k * Math.PI) * 8;
      S.facing = ex >= S.leapX0 ? 1 : -1;
      S.hm = lerp(S.T[S.leapFrom].h, n.h, k);
      // an angry bee in the way bounces you back to where you were
      const b = S.bee;
      if (b.on && !b.hit && Math.abs(b.x - S.x) < 11 && Math.abs(b.wy - (S.y - 12)) < 14) {
        b.hit = true; S.cur = S.leapFrom; knock(ctx, t('vc.buzz'), '#ffd23f');
        return;
      }
      if (k >= 1) { if (S.leapOk) landOn(ctx, S.leapFrom + 1); else fall(ctx); }
    } else if (S.state === 'fall') {
      S.vy -= 520 * dt; S.y += S.vy * dt;
      if (S.knock > 0) S.spin += dt * 14;
      const li = S.fallTo >= 0 ? S.fallTo : lastStand(S.cur), v = S.T[li];
      S.hm = Math.max(0, (S.y - 28) / PXM);
      if (!isStand(v.kind)) {
        // Easier: grab a vine on the way down
        const ty = tipY(v, S.time);
        S.x += (tipX(v, S.time) - S.x) * Math.min(1, dt * 8);
        if (S.vy < 0 && S.y <= ty) { S.cur = li; ride(v, ang(v, S.time)); S.state = 'hang'; S.daze = 0.6; S.knock = 0; S.fallTo = -1; S.hm = v.h; ctx.sfx('grab'); bu(sxOf(S.x), syOf(S.y), 6, '#7cc84a', 40); }
        return;
      }
      const floor = v.h * PXM + 28;
      if (S.y <= floor) {
        S.y = floor; S.cur = li; S.state = 'stand'; S.walkTo = v.sx; S.hm = v.h; S.daze = S.knock > 0 ? 1.0 : 0.4; S.knock = S.knock > 0 ? 0.8 : 0; S.fallTo = -1;
        ctx.sfx('bonk'); bu(sxOf(S.x), syOf(S.y - 28), 10, '#c48a4c', 60);
        const n = S.T[li + 1]; if (n) n.p = Math.PI * 0.9 - n.w * S.time;
      }
    }
  }
  function hazards(dt, ctx) {
    const co = S.coco, b = S.bee, easy = ctx.easy;
    // coconuts from 15 m: one shakes on a clump above Cappy, then drops
    if (!co.on && !S.over) {
      co.next -= dt;
      if (co.next <= 0 && S.hm >= 14 && S.state === 'hang') {
        const n = S.T[Math.min(N, S.cur + 1)];
        co.on = true; co.hit = false; co.shake = 1.0; co.vy = 0;
        co.x = clamp((n.kind === 'branch' ? n.sx : n.X) + (ctx.rng() - 0.5) * 16, -50, 50);
        co.wy = S.y + 70;
        co.next = (easy ? 11 : 8.5) + ctx.rng() * 3;
      }
    } else if (co.on) {
      if (co.shake > 0) { co.shake -= dt; if (co.shake <= 0) ctx.sfx('whoosh'); }
      else {
        co.vy -= 420 * dt; co.wy += co.vy * dt;
        // a leap into a falling coconut knocks you down (hanging on, you're safe: wait for it to drop past)
        if (!co.hit && S.state === 'leap' && Math.abs(co.x - S.x) < 11 && co.wy < S.y + 4 && co.wy > S.y - 34) {
          co.hit = true; bu(sxOf(co.x), syOf(co.wy), 8, '#b07a44', 60); co.on = false;
          S.cur = S.leapFrom;
          knock(ctx, t('vc.bonk'), '#ffb3d6');
        }
        if (co.wy < S.cam - 260) co.on = false;
      }
    }
    // angry bees from 30 m: a warning at the edge, then one flies across between Cappy and the next vine
    if (!b.on && !S.over) {
      b.next -= dt;
      if (b.next <= 0 && S.hm >= 28 && (S.state === 'hang' || S.state === 'stand')) {
        b.on = true; b.hit = false; b.warn = 1.0; b.t = 0; b.dir = ctx.rng() < 0.5 ? 1 : -1;
        b.x = -b.dir * (S.vw / 2 + 10); b.wy = S.y + 18;
        b.next = (easy ? 13 : 9.5) + ctx.rng() * 3; ctx.sfx('buzz');
      }
    } else if (b.on) {
      b.t += dt;
      if (b.warn > 0) b.warn -= dt;
      else {
        b.x += b.dir * (easy ? 42 : 52) * dt;
        if (Math.abs(b.x) > S.vw / 2 + 20) b.on = false;

      }
    }
  }
  /** The test bot: predicts the best moment and taps then (sigma adds a human-like timing error, in seconds). */
  function bot(ctx) {
    if (S.daze > 0 || (S.state !== 'hang' && S.state !== 'stand')) { S.tapAt = -1; return; }
    const n = S.T[S.cur + 1]; if (!n) return;
    const b = S.bee;
    // the careful bot waits for a bee in the gap, or a coconut over the next vine (then times its leap afresh)
    const co = S.coco;
    if (!S.sigma && ((b.on && !b.hit && Math.abs(b.x - S.x) < 40) || (co.on && !co.hit && Math.abs(co.x - (n.kind === 'branch' ? n.sx : n.X)) < 26))) { S.tapAt = -1; return; }
    if (n.kind === 'branch') { tryGrab(ctx); return; }
    let best = 1e9, bestT = 0;
    for (let k = 0; k <= 150; k++) { const tt = S.time + k / 60, d = Math.abs(nextX(tt) - cappyX(tt)); if (d < best - 0.01) { best = d; bestT = k / 60; } if (k > 10 && d > best + 12) break; }
    if (S.tapAt < 0) { if (best > R(ctx)) return; S.tapAt = S.time + Math.max(0, bestT + (S.sigma ? gauss() * S.sigma : 0)); S.tapFor = S.cur; }
    if (S.tapFor !== S.cur) { S.tapAt = -1; return; }
    if (S.time >= S.tapAt - 0.5 / 60) { S.tapAt = -1; tryGrab(ctx); }
  }

  /* ---------- drawing ---------- */
  let BASEY = 120;
  const sxOf = x => Math.round(S.vw / 2 + x);
  const syOf = wy => Math.round(BASEY - (wy - S.cam));
  function buildBg(ctx) {
    const W = S.vw, H = S.vh, D = JC.draw;
    // the far forest, taller than the screen: it scrolls at 0.35 of the climb
    const bgH = H + Math.round((TOP_M * PXM + 80) * 0.35), c = JC.canvas2(W, bgH), g = c.getContext('2d');
    const bands = ['#cfeec0', '#a8deb0', '#86c99a', '#64b07e', '#4a9668', '#367e56', '#286646', '#1f5238'];
    for (let y = 0; y < bgH; y += 2) { const k = y / bgH, i = Math.min(bands.length - 1, Math.floor(k * bands.length)); g.fillStyle = bands[i]; g.fillRect(0, y, W, 2); }
    // sun rays at the top
    g.globalAlpha = 0.18; for (let i = 0; i < 6; i++) { g.fillStyle = '#fff8c8'; const x0 = (i * 71) % W; for (let y = 0; y < bgH * 0.4; y += 2) g.fillRect(x0 + y * 0.35, y, 6, 2); } g.globalAlpha = 1;
    // far trunks and hanging moss
    for (let i = 0; i < 10; i++) {
      const x = Math.round(((i * 89 + 23) % (W + 40)) - 20), w = 8 + (i % 3) * 5, dark = 0.25 + (i % 4) * 0.08;
      g.globalAlpha = 0.35 + dark; g.fillStyle = i % 2 ? '#2a4a34' : '#355a3c'; g.fillRect(x, 0, w, bgH); g.globalAlpha = 1;
      for (let y = 20 + i * 13; y < bgH; y += 90 + i * 7) { D.disc(g, x + w / 2, y, 7 + (i % 3) * 2, i % 2 ? '#2f7d3c' : '#3d8a44'); D.disc(g, x + w / 2 - 4, y - 2, 5, '#4fa83f'); }
    }
    for (let x = 0; x < W; x += 4) { const r = JC.hash(x, 7, 2); if (r < 0.3) { g.fillStyle = r < 0.1 ? '#7cc84a' : '#3d9a2e'; const len = 10 + r * 160; for (let y = 0; y < len; y += 3) g.fillRect(x + Math.round(Math.sin(y / 9 + x) * 1.5), (x * 7) % bgH + y, 1, 2); } }
    S.bg = c; S.bgH = bgH;
    // the trunk: one tile of bark that repeats
    const tk = JC.canvas2(TRUNK * 2, 64), tg = tk.getContext('2d');
    tg.fillStyle = '#6e4325'; tg.fillRect(0, 0, TRUNK * 2, 64);
    tg.fillStyle = '#5a361d'; for (let y = 0; y < 64; y += 1) for (let x = 0; x < TRUNK * 2; x += 1) { const r = JC.hash(x, y, 5); if (r < 0.12 || ((x + (y >> 3)) % 9 === 0 && r < 0.7)) tg.fillRect(x, y, 1, 1); }
    tg.fillStyle = '#8a5a33'; for (let y = 0; y < 64; y += 1) for (let x = 2; x < TRUNK * 2 - 2; x += 1) { if ((x + 3 + (y >> 4)) % 9 === 0 && JC.hash(x, y, 6) < 0.7) tg.fillRect(x + 1, y, 1, 1); }
    tg.fillStyle = '#3b2414'; tg.fillRect(0, 0, 2, 64); tg.fillRect(TRUNK * 2 - 3, 0, 3, 64); tg.fillStyle = '#9a6234'; tg.fillRect(2, 0, 1, 64);
    for (let y = 6; y < 64; y += 21) { tg.fillStyle = '#4fa83f'; tg.fillRect(4 + (y % 7), y, 3, 2); tg.fillRect(5 + (y % 7), y + 2, 1, 4); }
    S.trunk = tk;
    // the forest floor (roots and ferns)
    const fl = JC.canvas2(W, 60), fg = fl.getContext('2d');
    fg.fillStyle = '#3b5a2a'; fg.fillRect(0, 8, W, 52); fg.fillStyle = '#4a7a30'; fg.fillRect(0, 8, W, 3);
    for (let x = 0; x < W; x += 7) { D.disc(fg, x, 8, 4 + ((x * 3) % 4), x % 2 ? '#2f7d3c' : '#4fa83f'); }
    for (let x = 4; x < W; x += 13) { fg.fillStyle = '#6ad34a'; fg.fillRect(x, 2 + (x % 5), 1, 7); fg.fillRect(x - 2, 4 + (x % 5), 2, 1); fg.fillRect(x + 1, 3 + (x % 5), 2, 1); }
    fg.fillStyle = '#5a361d'; for (let i = 0; i < 4; i++) { const x0 = W / 2 - TRUNK - 14 + i * 22; fg.fillRect(x0, 8, 14, 5); fg.fillStyle = '#6e4325'; fg.fillRect(x0 + 2, 8, 10, 2); fg.fillStyle = '#5a361d'; }
    S.floor = fl;
    // the canopy (top, 60 m): leaves, flowers and the golden finish flag
    const cn = JC.canvas2(W, 90), cg = cn.getContext('2d');
    for (let x = -10; x < W + 20; x += 16) { D.disc(cg, x, 30 + ((x * 7) % 9), 18, '#1f5a34'); }
    for (let x = -4; x < W + 20; x += 14) { D.disc(cg, x, 40 + ((x * 5) % 7), 14, '#2f7d3c'); D.disc(cg, x - 4, 36 + ((x * 3) % 6), 7, '#4fa83f'); D.disc(cg, x - 6, 34, 2, '#b6e35d'); }
    for (let x = 6; x < W; x += 23) { D.disc(cg, x, 50 + (x % 6), 2, x % 2 ? '#ff6fb5' : '#ffd24a'); }
    const fx = Math.round(W / 2) + TRUNK + 6;
    cg.fillStyle = OUT; cg.fillRect(fx - 1, 18, 3, 37); cg.fillStyle = '#c48a4c'; cg.fillRect(fx, 18, 1, 36);
    for (let i = 0; i < 11; i++) { const w = Math.round(16 * (1 - Math.abs(i - 5) / 6)); cg.fillStyle = OUT; cg.fillRect(fx + 2, 17 + i, w + 1, 1); if (w > 1) { cg.fillStyle = i < 4 ? '#fff3a8' : '#ffd24a'; cg.fillRect(fx + 2, 17 + i, w - 1, 1); } }
    cg.fillStyle = '#7a4a26'; cg.fillRect(0, 54, W, 7); cg.fillStyle = '#9a6234'; cg.fillRect(0, 54, W, 2); cg.fillStyle = '#4f2e17'; cg.fillRect(0, 60, W, 1);
    S.canopy = cn;
    // a branch platform (drawn mirrored for the left side)
    const br = JC.canvas2(104, 22), bgc = br.getContext('2d');
    bgc.fillStyle = OUT; bgc.fillRect(0, 7, 92, 9); bgc.fillStyle = '#7a4a26'; bgc.fillRect(0, 8, 91, 7); bgc.fillStyle = '#9a6234'; bgc.fillRect(0, 8, 91, 2);
    bgc.fillStyle = '#5e3820'; for (let x = 6; x < 88; x += 9) bgc.fillRect(x, 11 + (x % 3), 4, 1);
    for (let i = 0; i < 4; i++) { D.disc(bgc, 84 + (i % 2) * 8, 6 + i * 3, 7 - i, i % 2 ? '#2f7d3c' : '#4fa83f'); }
    D.disc(bgc, 90, 4, 3, '#7cc84a'); D.disc(bgc, 96, 12, 2, '#ff6fb5');
    S.branch = { c: br, f: (function () { const f = JC.canvas2(104, 22), x = f.getContext('2d'); x.translate(104, 0); x.scale(-1, 1); x.drawImage(br, 0, 0); return f; })() };
    S.bgGen = VIEW.gen; S.bgK = S.k;
  }
  function drawVine(g, v, glow) {
    const a = ang(v, S.time), x0 = sxOf(v.ax), y0 = syOf(v.ah), x1 = sxOf(v.ax + v.L * Math.sin(a)), y1 = syOf(v.ah - v.L * Math.cos(a));
    // a twig from the trunk to the leafy clump the vine hangs from
    const tx = v.ax >= 0 ? TRUNK - 2 : -TRUNK + 2;
    if (Math.abs(v.ax) > TRUNK - 4) { line(g, sxOf(tx), y0 + 6, x0, y0 + 1, '#5e3820'); line(g, sxOf(tx), y0 + 5, x0, y0, '#7a4a26'); }
    if (glow) { g.globalAlpha = 0.45; line(g, x0 - 1, y0, x1 - 1, y1, '#fff3a8'); line(g, x0 + 2, y0, x1 + 2, y1, '#fff3a8'); g.globalAlpha = 1; }
    line(g, x0, y0, x1, y1, '#2a7a30'); line(g, x0 + 1, y0, x1 + 1, y1, '#4fa83f');
    const n = Math.max(2, (v.L / 8) | 0);
    for (let i = 1; i < n; i++) { const k = i / n, lx = Math.round(x0 + (x1 - x0) * k), ly = Math.round(y0 + (y1 - y0) * k); rect(g, lx + (i % 2 ? 2 : -3), ly, 3, 2, i % 2 ? '#7cc84a' : '#3d9a2e'); }
    rect(g, x1 - 1, y1 - 1, 4, 3, '#2a7a30'); rect(g, x1, y1, 2, 1, '#b6e35d');
    spr(g, SPRITES.vc_clump, x0 - 9, y0 - 6);
  }
  function drawCappy(g, ctx) {
    const x = sxOf(S.x), y = syOf(S.y);
    if (S.state === 'stand' || S.state === 'top') {
      const walk = S.state === 'stand' && Math.abs(S.walkTo - S.x) > 0.5 && ((S.time * 8) | 0) % 2;
      const hop = S.state === 'top' ? Math.abs(Math.sin(S.time * 8)) * 6 : 0;
      const feet = y + 28;
      shadow(g, x, feet, 9);
      sprK(g, SPRITES[walk ? 'cappy_right_w' : 'cappy_right'], x - 16, feet - 30 - hop, 2, S.facing < 0);
      const hat = SAVE.data.cos.hat && SPRITES['hat_' + SAVE.data.cos.hat]; if (hat) sprK(g, hat, x - 14 + S.facing * 4, feet - 36 - hop, 2, S.facing < 0);
    } else {
      buildHang();
      const fr = S.state === 'leap' || S.state === 'fall' || ((S.time * 3) | 0) % 2 ? 'vc_hang2' : 'vc_hang';
      if (S.state === 'fall' && S.knock > 0) {
        // knocked off: tumbling head over heels on the way down
        const sp = SPRITES[fr];
        g.save(); g.translate(x, y + 20); g.rotate(BRBX.reduced() ? 0.6 : S.spin); g.drawImage(sp.c, -sp.w, -sp.h, sp.w * 2, sp.h * 2); g.restore();
      } else {
        sprK(g, SPRITES[fr], x - 19, y - 1, 2);
        const hat = SAVE.data.cos.hat && SPRITES['hat_' + SAVE.data.cos.hat]; if (hat) sprK(g, hat, x - 15, y + 8, 2);
      }
    }
    // knocked down: a ring of little stars and a "bonk" mark over Cappy's head
    if (S.knock > 0 && S.state !== 'fall') {
      const top = S.state === 'stand' ? y - 4 : y + 6;
      for (let i = 0; i < 5; i++) { const a = S.time * 7 + i * 1.257; spr(g, SPRITES.sparkle, x - 3 + Math.cos(a) * 12, top + Math.sin(a) * 3); }
      return;
    }
    if (S.daze > 0) for (let i = 0; i < 3; i++) { const a = S.time * 6 + i * 2.1; spr(g, SPRITES.sparkle, x - 2 + Math.cos(a) * 10, y + (S.state === 'stand' ? -4 : 6) + Math.sin(a) * 3); }
  }
  function panel(g, x, y, w, name, val, frac, col, right) {
    box(g, x, y, w, 26, 'rgba(27,19,37,0.82)', PAL.ink);
    text(g, name, right ? x + w - 4 : x + 4, y + 1, right ? T_R : T_L);
    T_VAL.col = col; T_VAL.align = right ? 'right' : 'left';
    const vw = text(g, val, right ? x + w - 4 : x + 4, y + 13, T_VAL);
    const bw = w - vw - 12; if (bw > 10) UI.bar(g, right ? x + 4 : x + vw + 8, y + 15, bw, 7, frac, col, 4);
  }
  function draw(g, ctx) {
    S.ctx = ctx; view(ctx);
    const W = S.vw, H = S.vh, k = S.k;
    if (S.bgGen !== VIEW.gen || S.bgK !== k || !S.bg) buildBg(ctx);
    g.setTransform(VIEW.S * k, 0, 0, VIEW.S * k, JC.juice.ox * VIEW.S * k, JC.juice.oy * VIEW.S * k);
    BASEY = Math.round(H * 0.55);
    // the far forest (parallax)
    const off = Math.round(Math.min(0, H - S.bgH + S.cam * 0.35));
    g.drawImage(S.bg, 0, off);
    // the trunk
    const tx = Math.round(W / 2 - TRUNK), floorY = syOf(0), topY = syOf(TOP_M * PXM);
    const k0 = Math.max(0, Math.floor((S.cam + BASEY - H) / 64)), k1 = Math.min(Math.floor(TOP_M * PXM / 64), Math.ceil((S.cam + BASEY) / 64));
    for (let i = k0; i <= k1; i++) g.drawImage(S.trunk, tx, syOf((i + 1) * 64));
    if (floorY < H + 60) g.drawImage(S.floor, 0, floorY - 8);
    // branch platforms with height signs
    for (let bi = 0; bi < 3; bi++) {
      const v = S.T[BR_LIST[bi]], y = syOf(v.h * PXM); if (y < -30 || y > H + 30) continue;
      const right = v.sx >= 0, bx = right ? Math.round(W / 2 - 10) : Math.round(W / 2 + 10 - 104);
      g.drawImage(right ? S.branch.c : S.branch.f, bx, y - 8);
      const sx = right ? Math.round(W / 2 + 10) : Math.round(W / 2 - 34);
      box(g, sx, y + 9, 24, 11, '#c48a4c', OUT); text(g, label('vc.sign' + bi, v.h), sx + 12, y + 8, SIGN);
    }
    // Sloane, hugging the trunk
    const sly = syOf(S.sloane * PXM) - 34;
    if (sly > -40 && sly < H + 4) sprK(g, SPRITES[((S.time * (S.over ? 6 : 1.6)) | 0) % 2 ? 'vc_sloane2' : 'vc_sloane1'], Math.round(W / 2 - 10), sly, 2);
    // vines (the next one glows, with a ring at its tip that turns green when you can grab it)
    const nI = S.cur + 1;
    for (let i = 1; i <= N; i++) {
      const v = S.T[i]; if (v.kind === 'branch') continue;
      const yy = syOf(v.ah); if (yy > H + 10 || yy + v.L + 20 < 0) continue;
      drawVine(g, v, i === nI && !S.over);
    }
    if (topY > -100) g.drawImage(S.canopy, 0, topY - 54);
    if (!S.over && S.T[nI] && S.T[nI].kind !== 'branch' && (S.state === 'hang' || S.state === 'stand')) {
      const v = S.T[nI], dx = Math.abs(nextX(S.time) - cappyX(S.time)), r = R(ctx) + (S.state === 'stand' ? 2 : 0);
      const col = S.daze > 0 ? '#9a94a8' : dx <= r ? '#6ad34a' : dx <= r * 2.4 ? '#ffd24a' : '#fff8e8';
      const x = sxOf(tipX(v, S.time)), y = syOf(tipY(v, S.time)), rr = dx <= r ? 7 + ((S.time * 10) | 0) % 2 : 6;
      g.globalAlpha = dx <= r ? 1 : 0.7;
      for (let a = 0; a < 16; a++) { const c = Math.cos(a * 0.3927), s = Math.sin(a * 0.3927); rect(g, x + c * rr, y + s * rr * 0.8, 2, 2, col); }
      g.globalAlpha = 1;
    }
    // coconut, Cappy, bee
    const co = S.coco;
    if (co.on) { const sh = co.shake > 0 ? Math.round(Math.sin(S.time * 40) * 1.5) : 0; sprK(g, SPRITES.vc_coconut, sxOf(co.x) - 8 + sh, syOf(co.wy) - 8, 2); if (co.shake > 0) text(g, '!', sxOf(co.x), syOf(co.wy) - 22, WARN); }
    drawCappy(g, ctx);
    const b = S.bee;
    if (b.on) {
      if (b.warn > 0) { const ex = b.dir > 0 ? 6 : W - 14; if (((S.time * 8) | 0) % 2) { box(g, ex - 2, syOf(b.wy) - 8, 14, 14, PAL.r2, PAL.ink); text(g, '!', ex + 5, syOf(b.wy) - 7, WARN2); } }
      else sprK(g, SPRITES[((S.time * 12) | 0) % 2 ? 'vc_bee1' : 'vc_bee2'], sxOf(b.x) - 10, syOf(b.wy + Math.sin(b.t * 8) * 3) - 6, 2, b.dir < 0);
    }
    // HUD (screen size): the two climbers, the timer, the height meter, Sloane's marker when she is off screen, the hint
    drawHud(g, ctx, sly);
    g.setTransform(VIEW.S, 0, 0, VIEW.S, 0, 0);
  }
  /** Time left, top centre (like JC.hud.timer, but in the scene's scale). */
  function timerBox(g, W, secs, frac) {
    const w = 64, x = Math.round((W - w) / 2), y = 32;
    box(g, x, y, w, 20, 'rgba(27,19,37,0.82)', PAL.ink);
    T_TIME.col = secs < 10 ? PAL.r3 : PAL.white;
    text(g, label('hud.secs', Math.max(0, Math.ceil(secs))), x + w / 2, y + 1, T_TIME);
    UI.bar(g, x + 3, y + 13, w - 6, 5, frac, secs < 10 ? PAL.r2 : PAL.w3);
  }
  function drawHud(g, ctx, sly) {
    const W = S.vw, H = S.vh;
    const l = Math.ceil(HUD.left() / S.k), wAll = W - l - 6, w = Math.min(150, (wAll - 6) / 2) | 0;
    panel(g, l, 4, w, t('name.cappy'), label('vc.m', Math.floor(S.hm)), S.hm / TOP_M, '#45c34e', false);
    panel(g, W - 6 - w, 4, w, t('name.sloane'), label('vc.mB', Math.floor(S.sloane)), S.sloane / TOP_M, '#c9a37a', true);
    const tNow = S.over ? S.finishT : S.time;
    timerBox(g, W, TIME - tNow, 1 - tNow / TIME);
    const mx = W - 9, my0 = 62, my1 = H - 26;
    if (my1 - my0 > 60) {
      rect(g, mx - 2, my0, 5, my1 - my0, PAL.ink); rect(g, mx - 1, my0 + 1, 3, my1 - my0 - 2, '#5c3a22');
      for (let m = 0; m <= TOP_M; m += 15) rect(g, mx - 4, Math.round(my1 - (my1 - my0) * m / TOP_M), 9, 1, m === TOP_M ? PAL.gold2 : PAL.cream);
      const sy = Math.round(my1 - (my1 - my0) * S.sloane / TOP_M), cy = Math.round(my1 - (my1 - my0) * S.hm / TOP_M);
      disc(g, mx, sy, 3, PAL.ink); disc(g, mx, sy, 2, '#c9a37a');
      disc(g, mx, cy, 4, PAL.ink); disc(g, mx, cy, 3, '#45c34e'); rect(g, mx - 1, cy - 1, 1, 1, '#b6f5a0');
    }
    if (sly < 52 || sly > H - 4) {
      const up = sly < 52, yy = up ? 56 : H - 40, xx = W - 76;
      box(g, xx, yy, 58, 18, 'rgba(27,19,37,0.82)', PAL.ink); spr(g, SPRITES.sloane, xx + 1, yy + 1);
      text(g, up ? '↑' : '↓', xx + 20, yy + 3, ARROW); text(g, label('vc.mS', Math.floor(S.sloane)), xx + 27, yy + 3, ARROW);
    }
    if (S.hint > 0.05 && !S.over) {
      const hk = S.state === 'stand' && S.cur === 0 ? (ctx.touch ? 'vc.hintStartTouch' : 'vc.hintStartKeys') : (ctx.touch ? 'vc.hintTouch' : 'vc.hintKeys');
      g.globalAlpha = clamp(S.hint * 2, 0, 1); textBlock(g, t(hk), 6, H - 28, W - 30, HINT); g.globalAlpha = 1;
    }
  }

  /* ---------- sound ---------- */
  AUDIO.addSfx('buzz', (tt, b) => { const P = AUDIO.prims; P.tone(b, 'sawtooth', 210, tt, 0.35, 0.08, 230, 0.01, 0.1, 0.8); P.tone(b, 'square', 216, tt, 0.35, 0.05, 200, 0.01, 0.1, 0.8); });
  AUDIO.songs.vine = { bpm: 112, steps: 32, leadWave: 'triangle', harmWave: 'square', swing: 0.1,
    lead: 'A4 . C5 . E5 . A5 - G5 . E5 . D5 - E5 . C5 . E5 . G5 . C6 - B5 . G5 . A5 - - .',
    harm: '. . E4 . . . E4 . . . D4 . . . D4 . . . E4 . . . E4 . . . D4 . . . C4 .',
    bass: 'A2 . . A2 E3 . . . G2 . . G2 D3 . . . C3 . . C3 G3 . . . F2 . . F2 E2 . G2 .',
    drums: 'k.c.u.c.k.c.t.c.k.c.u.c.k.ct.u.c' };

  JC.register({
    id: 'vine',
    champion: 'sloane',
    music: 'vine',
    start(ctx) {
      S.ctx = ctx; view(ctx); build(ctx);
      S.cur = 0; S.state = 'stand'; S.x = -26; S.walkTo = -26; S.y = 28; S.hm = 0; S.maxM = 0; S.facing = 1; S.time = 0; S.daze = 0; S.knock = 0; S.knocks = 0; S.spin = 0; S.fallTo = -1; JC.juice.reset();
      S.sloane = 0; S.sloaneV = TOP_M / (ctx.easy ? 72 : 62); S.falls = 0; S.perfects = 0; S.grabs = 0; S.bonks = 0; S.over = false; S.won = false;
      S.cam = 40; S.waitMsg = 0; S.cheer = 0; S.auto = false; S.sigma = 0; S.eps = 0; S.hint = ctx.firstTime ? 1.6 : 0.7;
      S.coco.on = false; S.coco.next = ctx.easy ? 6 : 3; S.bee.on = false; S.bee.next = ctx.easy ? 5 : 2;
      const n = S.T[1]; n.p = Math.PI * 0.9;
    },
    update,
    draw,
    onInput(e, ctx) {
      if ((e.type === 'press' && (e.key === 'a' || e.key === 'up')) || e.type === 'down') tryGrab(ctx);
    },
    outro(dt, ctx) { S.time += dt; if (S.cheer > 0) S.cheer -= dt; if (S.state === 'leap' || S.state === 'fall') moveCappy(dt, ctx); },
    testState(ctx) {
      const n = S.T[S.cur + 1];
      return { state: S.state, cur: S.cur, metres: Math.round(S.hm * 10) / 10, best: S.maxM, sloane: Math.round(S.sloane * 10) / 10, time: Math.round(S.time * 100) / 100,
        dx: n ? Math.round((n.kind === 'branch' ? 0 : nextX(S.time) - cappyX(S.time)) * 10) / 10 : 0, next: n ? n.kind : '', r: R(ctx), daze: S.daze > 0,
        falls: S.falls, perfects: S.perfects, grabs: S.grabs, bonks: S.bonks, knocks: S.knocks, knocked: S.knock > 0, fallTo: S.fallTo, over: S.over, won: S.won, auto: S.auto, coconut: S.coco.on, bee: S.bee.on };
    },
    test: {
      auto(ctx, on, sigma) { S.auto = !!on; S.sigma = +sigma || 0; S.eps = 0; S.tapAt = -1; return S.auto; },
      /** Jump to target i (e.g. 19, just under the top). */
      to(ctx, i) { i = clamp(i | 0, 0, N - 1); const v = S.T[i]; if (isStand(v.kind)) { S.state = 'stand'; S.cur = i; S.x = v.sx; S.walkTo = v.sx; S.y = v.h * PXM + 28; } else { S.cur = i; ride(v, 0); S.state = 'hang'; S.x = tipX(v, S.time); S.y = tipY(v, S.time); } S.hm = v.h; S.maxM = Math.max(S.maxM, v.h); S.cam = S.y + 10; return S.cur; },
      sloane(ctx, m) { S.sloane = clamp(+m || 0, 0, TOP_M); return S.sloane; },
      hazards(ctx, on) { S.coco.next = on ? 0 : 999; S.bee.next = on ? 0 : 999; S.coco.on = false; S.bee.on = false; return !!on; },
      /** Drop a coconut right above Cappy, or send a bee straight at him (tests of the knockdown). */
      drop(ctx, kind) {
        if (kind === 'bee') { const b = S.bee; b.on = true; b.hit = false; b.warn = 0; b.t = 0; b.dir = 1; b.x = S.x - 3; b.wy = S.y - 16; return true; }
        const co = S.coco; co.on = true; co.hit = false; co.shake = 0; co.vy = -30; co.x = S.x; co.wy = S.y + 2; return true;
      },
    },
    cheat(won) { S.over = true; S.won = won; S.maxM = won ? TOP_M : 27; return { score: won ? 1300 : 270, stars: won ? 2 : 0, won, frac: won ? 0.67 : 0.14 }; },
  });
})();
