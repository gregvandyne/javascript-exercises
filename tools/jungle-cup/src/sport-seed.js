// ======================================================================================================
// SEED SHOT vs Tico the toucan: a slingshot target range on the lagoon. 60 seconds, head to head.
//   Fruit rides on lily pads drifting across the lagoon in four rows: near (50 points), mid (75), far (100) and the
//   star fruit right out at the back (150). Now and then a golden fruit floats by (double points), some fruit bobs
//   under the water and pops back up (it can't be hit while it is under), and a flock of swallows skims across one
//   row: a seed that lands under them is snapped up as a snack (no points). A frog hops between the empty pads and
//   fish jump in the lagoon (just for fun: nothing ever aims at them).
//   Touch: put a finger down anywhere, pull back (down = farther, sideways = aim) and let go to fire a seed.
//   Keys: Left / Right move the aim ring, Up / Down pick the row, Space fires.
//   Seeds take a moment to land, so aim a little ahead of a drifting fruit. Hits in a row add a combo bonus.
//   Tico fires from his post on the other side of the shore: steady at first, faster near the end. Beat his score.
// Targets are fruit only (nothing ever aims at an animal). Screen units are virtual pixels; the rows are laid out
// from the view size each frame.
// ======================================================================================================
(function () {
  const TIME = 60, ROWS = 4, PER_ROW = 14, SPACING = 88, POINTS = [150, 100, 75, 50], FLIGHT = [0.72, 0.62, 0.5, 0.38], RELOAD = 0.42;
  // golden fruit (double points), divers (bob under and pop back up) and the swallows: how often and how long
  const TICO_P = 0.72, TICO_P_EASY = 0.66, TICO_A = 2.0, TICO_B = 1.3, TICO_A_EASY = 2.4, TICO_B_EASY = 1.7;
  const GOLD_P = 0.08, DIVE_P = 0.2, DIVE_C = 3.4, FLOCK_W = 34, FLOCK_V = 62;
  // a seed that splashes takes longer to reload, and at most two of yours fly at once: firing without aiming never pays
  const MISS_RELOAD = 1.2, MAX_FLYING = 2;
  const S = {
    time: 0, you: 0, tico: 0, hits: 0, shots: 0, streak: 0, bestStreak: 0, over: false, won: false, finishT: 0,
    aimX: 0, aimRow: 1, aimOn: true, drag: false, dragId: -1, sx: 0, sy: 0, pullX: 0, pullY: 0, reload: 0, auto: false, autoT: 0, sigma: 0,
    ticoT: 2, ticoFlap: 0, cappyRecoil: 0, hint: 1, ctx: null,
    k: 1, bgK: 0, rowY: [0, 0, 0, 0], tagLift: [0, 0, 0, 0], kr: [1, 1, 2, 2], pullHint: 0, finishWait: 0, rowSpd: [0, 0, 0, 0], rowDir: [-1, 1, -1, 1], nPer: 4, wrap: 450, lagTop: 0, lagBot: 0, slX: 0, slY: 0, tcX: 0, tcY: 0, W: 0, H: 0,
    fruit: [], seeds: [], rips: [], bg: null, bgGen: -1, pads: null, padsGen: -1, golds: 0, snacks: 0,
    // the swallows (one flock at a time), the frog on the empty pads, a jumping fish
    flock: { on: false, warn: 0, x: 0, dir: 1, row: 1, next: 9, t: 0 },
    frog: { f: null, to: null, hop: 0, next: 2, sx: 0, sy: 0, hidden: true },
    fish: { on: false, x: 0, y: 0, t: 0, dir: 1, next: 2 },
    botRowK: [0.55, 0.75, 0.9, 1],   // a human-like test bot goes for the nearer rows more often
  };
  for (let r = 0; r < ROWS; r++) for (let i = 0; i < PER_ROW; i++) S.fruit.push({ row: r, i, x: 0, on: true, use: true, gone: 0, pop: 0, bob: 0, kind: 0, dv: 0, under: false });
  for (let i = 0; i < 8; i++) S.seeds.push({ on: false, who: 0, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, T: 0.5, row: 0, target: null, hit: false });
  for (let i = 0; i < 20; i++) S.rips.push({ on: false, x: 0, y: 0, t: 0, big: false });
  const HIT_R = [9, 10, 12, 14], BASE_K = [1, 1, 2, 2];   // BASE_K: the fruit scale the lily pads are sized for
  const FLOCK_DX = [-26, -13, 0, 13, 26], FLOCK_DY = [4, -3, 1, -4, 3];   // the five swallows of a flock
  /** How close a seed must land to a fruit's centre: the same on every screen (a short landscape lagoon draws the fruit
   *  smaller, but it is not harder to hit), a little more with Easier champions. */
  const hitR = (ctx, r) => HIT_R[r] + (ctx.easy ? 3 : 0);

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
  // the star fruit, right at the back (small: it is far away)
  sprite('ss_star', ['...o...', '..oyo..', 'ooyYyoo', 'oyYYYyo', '.oyYyo.', 'oyo.oyo', 'oo...oo'], { o: OUT, y: '#ffe36a', Y: '#f0b42a' });
  // a golden fruit (any row): shiny, worth double
  sprite('ss_golden', ['...oGo...', '..ooGoo..', '.owyyyyo.', 'owwyyyyYo', 'owyyyyyYo', 'oyyyyyYYo', 'oyyyyYYYo', '.oYYYYYo.', '..ooooo..'],
    { o: '#6a4a10', G: '#3d9a2e', w: '#fffbe0', y: '#ffd84a', Y: '#e8a020' });
  sprite('ss_seed', ['.oo.', 'obBo', 'oBBo', '.oo.'], { o: OUT, b: '#e8bd7c', B: '#9a6234' });
  // lagoon swallows (two wing frames), the pad frog (sitting and hopping) and a little silver fish
  const SWL = { o: OUT, b: '#2f5fa8', B: '#1f3f78', w: '#f4f8ff', r: '#ff8a5a' };
  sprite('ss_swallow1', ['o.......o', 'bo.....ob', '.bbo.obb.', '..bbwbb..', '...owro..', '....o....'], SWL);
  sprite('ss_swallow2', ['.........', '.........', '...owo...', 'obbbwbbbo', '.o.owro.o', '....o....'], SWL);
  const FRG = { o: OUT, g: '#5ec84a', G: '#3a9a34', w: '#ffffff', k: '#120e14', y: '#d8f08a' };
  sprite('ss_frog', ['.oo..oo.', 'owkoowko', 'oggggggo', 'oGyyyyGo', 'oGgggggo', '.oo..oo.'], FRG);
  sprite('ss_frogHop', ['.oo..oo.', 'owkoowko', 'oggggggo', 'oGyyyyGo', 'oG.oo.Go', 'oo....oo'], FRG);
  sprite('ss_fish', ['..oo...', '.owwoo.', 'owkwwwo', '.owwoo.', '..oo...'], { o: '#3a5a7a', w: '#d8eef8', k: '#120e14' });
  const FRUIT = ['ss_star', 'ss_berry', 'ss_mango', 'ss_papaya'];
  const T_L = { col: PAL.white, align: 'left' }, T_R = { col: PAL.white, align: 'right' }, T_VAL = { col: PAL.r4, align: 'left' };
  const GOLDLBL = { align: 'center', col: '#ffd84a' }, WARNLBL = { align: 'center', col: '#fff3a8' };
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
    S.rowY[0] = Math.round(S.lagTop + L * 0.11); S.rowY[1] = Math.round(S.lagTop + L * 0.36); S.rowY[2] = Math.round(S.lagTop + L * 0.62); S.rowY[3] = Math.round(S.lagTop + L * 0.88);
    const big = L > 150; S.kr[0] = big ? 2 : 1; S.kr[1] = big ? 2 : 1; S.kr[2] = 2; S.kr[3] = big ? 3 : 2; S.padsGen = -1;
    S.slX = Math.round(W * 0.42); S.slY = H - 10;
    S.tcX = W - 24; S.tcY = H - 12;
    if (first) S.aimX = S.slX;
    // spread the fruit across the row (wrapping round the edges), always the same distance apart, so a wide screen has
    // more fruit but never more crowded rows (the game is as hard on a phone as on a laptop)
    S.nPer = clamp(Math.ceil((W + 60) / SPACING), 3, PER_ROW); S.wrap = S.nPer * SPACING;
    for (const f of S.fruit) {
      f.use = f.i < S.nPer;
      f.x = ((f.i + (f.row % 2) * 0.5 + (f.row > 1 ? 0.25 : 0)) / S.nPer) * S.wrap - 30;
      if (!f.use) { f.on = false; f.gone = 1e9; } else if (f.gone > 1e8) { f.on = true; f.gone = 0; }
    }
  }
  const wrapW = () => S.wrap;

  /* ---------- play ---------- */
  const ROW_V = [38, 33, 25, 18];
  function rowSpeed(ctx, r) { const k = 1 + 0.25 * (S.time / TIME); return ROW_V[r] * (ctx.easy ? 0.72 : 1) * k; }
  /** A diver's phase in its cycle T seconds from now: up for most of it, then it sinks, stays under, and pops back up. */
  const divePh = (f, T) => (f.dv + T) % DIVE_C;
  /** Can a fruit be hit T seconds from now? (A diver can't while it is under the water.) */
  const hittableAt = (f, T) => f.kind !== 2 || divePh(f, T) < 2.35 || divePh(f, T) > 3.2;
  /** Will the swallows be over this spot of this row T seconds from now? */
  function flockAt(row, x, T) {
    const fl = S.flock; if (!fl.on || fl.row !== row) return false;
    return Math.abs(fl.x + fl.dir * FLOCK_V * T - x) < FLOCK_W;
  }
  /** A fruit that comes back (or starts) is sometimes golden, sometimes a diver. */
  function newKind(f, ctx) {
    const r = ctx.rng();
    f.kind = r < GOLD_P ? 1 : r < GOLD_P + DIVE_P && f.row > 0 ? 2 : 0;
    f.dv = ctx.rng() * 2; f.under = false;
  }
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
    let flying = 0; for (const sd of S.seeds) if (sd.on && sd.who === 0) flying++;
    if (flying >= MAX_FLYING) return;
    if (!fire(ctx, 0, S.aimX, S.aimRow, null)) return;
    S.reload = RELOAD; S.shots++; S.cappyRecoil = 0.25; S.hint = Math.max(0, S.hint - 0.35);
  }
  function land(ctx, sd) {
    const r = sd.row, R = hitR(ctx, r);
    let hit = null;
    if (sd.who === 0) {
      let bd = 1e9;
      for (const f of S.fruit) if (f.row === r && f.on && !f.under) { const d = Math.abs(f.x - sd.x1); if (d <= R && d < bd) { bd = d; hit = f; } }
    } else if (sd.target && sd.target.on && !sd.target.under && sd.hit) hit = sd.target;
    // the swallows snap up a seed that comes down under them (no points, no splash)
    if (flockAt(r, sd.x1, 0)) {
      S.snacks++; ctx.sfx('ssChirp');
      UI.float(sd.x1 * S.k, (S.rowY[r] - 26) * S.k, t('ss.snack'), '#c8e0ff', S.k);
      if (sd.who === 0) S.streak = 0;
      return;
    }
    // a seed that splashes down by the frog sends it hopping off to another pad
    const fr = S.frog; if (fr.f && !fr.hop && fr.f.row === r && Math.abs(fr.f.x - sd.x1) < 16) fr.next = 0;
    if (hit) {
      const gold = hit.kind === 1, pts = POINTS[r] * (gold ? 2 : 1);
      hit.on = false; hit.gone = 1.1 + Math.random() * 0.6; hit.pop = 0.5;
      const col = gold ? '#ffd84a' : r === 0 ? '#ffe36a' : r === 1 ? '#c07ae0' : r === 2 ? '#ff8a2a' : '#ff7a3a';
      if (gold) { UI.burst(hit.x * S.k, (S.rowY[r] - 6) * S.k, 14, '#fff3a8', 80); ctx.sfx('ssGold'); }
      UI.burst(hit.x * S.k, (S.rowY[r] - 6) * S.k, 10, col, 60); ctx.sfx('pop');
      if (sd.who === 0) {
        S.hits++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak);
        const bonus = S.streak >= 2 ? Math.min(25, (S.streak - 1) * 5) : 0;
        S.you += pts + bonus; if (gold) S.golds++;
        UI.float(hit.x * S.k, (S.rowY[r] - 22) * S.k, label('ss.plus' + r, pts + bonus), bonus || gold ? '#ffd24a' : '#8ee070', S.k);
        if (gold) UI.float(hit.x * S.k, (S.rowY[r] - 46) * S.k, t('ss.golden'), '#ffd84a', S.k);
        if (S.streak >= 3) UI.float(hit.x * S.k, (S.rowY[r] - 34) * S.k, label('ss.combo', S.streak), '#ffb030', S.k);
      } else {
        S.tico += pts;
        UI.float(hit.x * S.k, (S.rowY[r] - 22) * S.k, label('ss.tico' + r, pts), '#ffb3d6', S.k);
      }
    } else {
      ripple(sd.x1, S.rowY[r], r === 3);
      ctx.sfx('splash');
      if (sd.who === 0) { S.streak = 0; S.reload = Math.max(S.reload, MISS_RELOAD); }
    }
  }
  function ripple(x, y, big) { for (const p of S.rips) if (!p.on) { p.on = true; p.x = x; p.y = y; p.t = 0; p.big = big; UI.burst(x * S.k, (y - 2) * S.k, 5, '#c8f6ff', 40); return; } }
  /** Tico's turn: he picks a fruit, leads it, and lands it most of the time; faster as the clock runs down. */
  function ticoShoot(ctx) {
    const rr = ctx.rng();
    let row = rr < 0.1 ? 0 : rr < 0.32 ? 1 : rr < 0.64 ? 2 : 3, f = null;
    // his row first, then the others: on a narrow screen there are fewer fruit in view, and Tico must not lose turns
    for (let n = 0; n < ROWS && !f; n++, row = (row + 1) % ROWS) {
      const k0 = (ctx.rng() * S.nPer) | 0;
      for (let k = 0; k < S.nPer && !f; k++) {
        const c = S.fruit[row * PER_ROW + (k0 + k) % S.nPer], T = FLIGHT[row] + 0.08, lx = fruitX(c, T);
        if (c.on && lx > 16 && lx < S.W - 16 && Math.abs(lx - c.x) < 40 && hittableAt(c, T) && !flockAt(row, lx, T)) f = c;
      }
      if (f) break;
    }
    if (!f) return false;
    const T = FLIGHT[row] + 0.08, lead = fruitX(f, T);
    const p = ctx.easy ? TICO_P_EASY : TICO_P, hit = ctx.rng() < p;
    const sd = fire(ctx, 1, hit ? lead : lead + (ctx.rng() < 0.5 ? -1 : 1) * (hitR(ctx, row) + 6 + ctx.rng() * 8), row, f);
    if (sd) { sd.hit = hit; S.ticoFlap = 0.35; }
    return true;
  }
  /** The swallows, the frog and the fish: they come and go on their own. */
  function lagoonLife(dt, ctx) {
    const fl = S.flock;
    if (fl.on) {
      fl.x += fl.dir * FLOCK_V * dt; fl.t += dt;
      if (fl.x < -50 || fl.x > S.W + 50) { fl.on = false; fl.next = (ctx.easy ? 13 : 9) + ctx.rng() * 5; }
    } else if (fl.warn > 0) {
      fl.warn -= dt;
      if (fl.warn <= 0) { fl.on = true; fl.t = 0; fl.x = fl.dir > 0 ? -45 : S.W + 45; ctx.sfx('ssChirp'); }
    } else if (!S.over) {
      fl.next -= dt;
      // a second's warning at the edge they will come from, then they skim across one row (never the very first one)
      if (fl.next <= 0) { fl.dir = ctx.rng() < 0.5 ? 1 : -1; fl.row = 1 + ((ctx.rng() * 3) | 0); fl.warn = 1.1; }
    }
    const fr = S.frog;
    if (fr.hop > 0) {
      fr.hop -= dt;
      if (fr.hop <= 0) { fr.hop = 0; fr.f = fr.to; fr.to = null; if (fr.f) { ripple(fr.f.x, S.rowY[fr.f.row], false); fr.next = 2.5 + ctx.rng() * 3; } else { fr.hidden = true; fr.next = 2 + ctx.rng() * 3; } }
    } else {
      // the pad it is on drifts off the edge: it slips under and comes back later
      if (fr.f && (fr.f.x < 6 || fr.f.x > S.W - 6 || fr.f.on)) { fr.f = null; fr.hidden = true; fr.next = 2 + ctx.rng() * 2; }
      fr.next -= dt;
      if (fr.next <= 0) {
        let best = null, bd = 1e9;
        const fx = fr.f ? fr.f.x : S.W * (0.25 + ctx.rng() * 0.5), frow = fr.f ? fr.f.row : 2;
        for (const f of S.fruit) {
          if (f.on || !f.use || f === fr.f || f.row < 2 || f.x < 20 || f.x > S.W - 20) continue;
          const d = Math.abs(f.x - fx) + Math.abs(f.row - frow) * 30 + ctx.rng() * 20;
          if (d < bd && d < 110) { bd = d; best = f; }
        }
        if (best) {
          fr.sx = fr.f ? fr.f.x : best.x + (ctx.rng() < 0.5 ? -20 : 20); fr.sy = fr.f ? S.rowY[fr.f.row] : S.rowY[best.row] + 4;
          if (fr.hidden) ripple(fr.sx, fr.sy, false);
          fr.to = best; fr.hop = 0.55; fr.hidden = false; fr.f = null; ctx.sfx('frogCroak');
        } else fr.next = 0.8;
      }
    }
    const fi = S.fish;
    if (fi.on) { fi.t += dt; if (fi.t > 0.7) { fi.on = false; ripple(fi.x + fi.dir * 14, fi.y, false); fi.next = 1.5 + ctx.rng() * 3; } }
    else { fi.next -= dt; if (fi.next <= 0) { fi.on = true; fi.t = 0; fi.dir = ctx.rng() < 0.5 ? 1 : -1; fi.x = 20 + ctx.rng() * (S.W - 40); fi.y = S.rowY[(ctx.rng() * ROWS) | 0] + 10; ripple(fi.x, fi.y, false); } }
  }
  function update(dt, ctx) {
    S.ctx = ctx; layout(ctx);
    S.time += dt;
    if (S.reload > 0) S.reload -= dt;
    if (S.ticoFlap > 0) S.ticoFlap -= dt;
    if (S.cappyRecoil > 0) S.cappyRecoil -= dt;
    // keys: move the aim ring
    if (!S.drag) {
      // the ring speeds up while a key is held, so a long way across the lagoon takes well under a second
      const dx = (ctx.held.right ? 1 : 0) - (ctx.held.left ? 1 : 0);
      S.aimHold = dx ? (S.aimHold || 0) + dt : 0;
      if (dx) { S.aimX = clamp(S.aimX + dx * (120 + 200 * clamp((S.aimHold - 0.15) / 0.45, 0, 1)) * dt, 10, S.W - 10); S.aimOn = true; }
    }
    // the fruit drifts (and comes back after it is hit)
    for (let r = 0; r < ROWS; r++) S.rowSpd[r] = rowSpeed(ctx, r);
    for (const f of S.fruit) {
      f.x = fruitX(f, dt); f.bob += dt; f.dv += dt;
      if (f.pop > 0) f.pop -= dt;
      if (f.kind === 2) {
        const was = f.under; f.under = !hittableAt(f, 0);
        if (f.on && was !== f.under && f.x > 0 && f.x < S.W) ripple(f.x, S.rowY[f.row], f.row === 3);
      } else f.under = false;
      // a fruit comes back on its pad (off screen, or after a while), unless the frog is sitting there
      if (!f.on && f.use && S.frog.f !== f && S.frog.to !== f) { f.gone -= dt; if (f.gone <= 0 && (f.x < -10 || f.x > S.W + 10 || f.gone < -1.5)) { f.on = true; f.pop = 0; newKind(f, ctx); if (f.x > 0 && f.x < S.W) ripple(f.x, S.rowY[f.row], false); } }
    }
    lagoonLife(dt, ctx);
    for (const sd of S.seeds) if (sd.on) { sd.t += dt; if (sd.t >= sd.T) { sd.on = false; land(ctx, sd); } }
    for (const p of S.rips) if (p.on) { p.t += dt; if (p.t > 0.8) p.on = false; }
    // Tico: steady at first, quicker near the end
    S.ticoT -= dt;
    if (S.ticoT <= 0 && !S.over) {
      // nothing in view: he looks again in a moment instead of waiting a whole turn
      if (!ticoShoot(ctx)) S.ticoT = 0.3;
      else { const k = S.time / TIME, a = ctx.easy ? TICO_A_EASY : TICO_A, b = ctx.easy ? TICO_B_EASY : TICO_B; S.ticoT = lerp(a, b, k) * (0.85 + ctx.rng() * 0.3); }
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
    const stars = S.won ? 1 + (S.you >= 2300 ? 1 : 0) + (S.you >= 3000 ? 1 : 0) : 0;
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
      const T = FLIGHT[f.row], lx = fruitX(f, T);
      if (lx < 12 || lx > S.W - 12) continue;
      // a careful bot also checks the fruit will be up and the swallows away when its seed lands; a human-like one
      // (sigma) only sees what is happening now
      if (S.sigma ? f.under || flockAt(f.row, f.x, 0) : !hittableAt(f, T) || flockAt(f.row, lx, T)) continue;
      const v = POINTS[f.row] * (f.kind === 1 ? 2 : 1) * (S.sigma ? S.botRowK[f.row] : 1) - Math.abs(lx - S.aimX) * 0.1;
      if (v > bv) { bv = v; best = f; }
    }
    if (!best) return;
    // a careful bot leads exactly; a human-like one (sigma) leads about half as much and wobbles by up to sigma px
    const lead = fruitX(best, FLIGHT[best.row]), now = best.x;
    // a human-like bot wobbles more the farther the row is (sigma px at the near row, up to twice that at the back)
    const wob = S.sigma * (1 + (ROWS - 1 - best.row) * 0.33);
    S.aimRow = best.row; S.aimX = clamp(S.sigma ? lerp(now, lead, 0.6) + (Math.random() * 2 - 1) * wob : lead, 10, S.W - 10);
    shoot(ctx); S.autoT = S.sigma ? 1.5 : 0.9;
  }

  /* ---------- input: pull back and let go (touch / mouse), or keys ---------- */
  function pullAim() {
    // sideways pull aims the other way; pulling down picks a farther row
    const px = S.sx - S.pullX, py = S.pullY - S.sy, step = Math.max(11, Math.min(22, (S.H - S.lagBot) * 0.42));
    S.aimX = clamp(S.slX + px * 2.4, 10, S.W - 10);
    S.aimOn = py >= 6;
    S.aimRow = py < 6 + step ? 3 : py < 6 + step * 2 ? 2 : py < 6 + step * 3 ? 1 : 0;
  }
  function onInput(e, ctx) {
    if (e.type === 'press') {
      if (e.key === 'a') shoot(ctx);
      else if (e.key === 'up') { S.aimRow = Math.max(0, S.aimRow - 1); S.aimOn = true; ctx.sfx('blip'); }
      else if (e.key === 'down') { S.aimRow = Math.min(ROWS - 1, S.aimRow + 1); S.aimOn = true; ctx.sfx('blip'); }
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
    const sz = [[7, 2], [8, 2], [12, 3], [15, 4]];
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
  /** A diver: up on its pad, then sinking (pad and fruit dip under), a ring of bubbles while it is under, and a pop up. */
  function drawDiver(g, f, x, y, bob, pad, sp, k) {
    const ph = divePh(f, 0), D = JC.draw;
    // how far under (0 = up, 1 = all the way under)
    const u = ph < 2.35 ? 0 : ph < 2.6 ? (ph - 2.35) / 0.25 : ph < 3.1 ? 1 : ph < 3.2 ? 1 - (ph - 3.1) / 0.1 : 0;
    const shake = ph > 2.0 && ph < 2.35 ? (((S.time * 30) | 0) % 2) : 0;   // a little wobble just before it dives
    if (u < 1) {
      g.globalAlpha = 1 - u * 0.7; g.drawImage(pad.c, x - (pad.w >> 1), y - (pad.h >> 1) + bob); g.globalAlpha = 1;
      const hv = Math.max(1, Math.round(sp.h * (1 - u)));
      g.drawImage(sp.c, 0, 0, sp.w, hv, x - ((sp.w * k) >> 1) + shake, y - hv * k + 1 + bob, sp.w * k, hv * k);
    } else {
      // bubbles where it went down
      for (let i = 0; i < 3; i++) { const by = y - 1 - (((S.time * 8 + i * 3) | 0) % 6), bx = x - 4 + i * 4; rect(g, bx, by, 1, 1, '#c8f6ff'); }
      g.globalAlpha = 0.45; D.oval(g, x, y, 6, 2, '#c8f6ff'); g.globalAlpha = 1;
    }
  }
  function drawFrog(g) {
    const fr = S.frog; if (fr.hidden) return;
    if (fr.hop > 0 && fr.to) {
      const u = 1 - fr.hop / 0.55, tx = fr.to.x, ty = S.rowY[fr.to.row];
      const x = Math.round(lerp(fr.sx, tx, u)), y = Math.round(lerp(fr.sy, ty, u) - Math.sin(u * Math.PI) * 18);
      g.globalAlpha = 0.3; JC.draw.oval(g, Math.round(lerp(fr.sx, tx, u)), Math.round(lerp(fr.sy, ty, u)) + 1, 3, 1, '#000'); g.globalAlpha = 1;
      spr(g, SPRITES.ss_frogHop, x - 4, y - 7, tx < fr.sx);
    } else if (fr.f) {
      const f = fr.f, x = Math.round(f.x), y = S.rowY[f.row] + Math.round(Math.sin(f.bob * 2.4 + f.i) * 0.8);
      const blink = ((S.time + f.i) % 4) < 0.15 ? 1 : 0;
      spr(g, SPRITES.ss_frog, x - 4, y - 6 + blink);
    }
  }
  function drawFlock(g) {
    const fl = S.flock;
    if (fl.warn > 0 && !S.over) {
      // a flapping swallow and a "!" at the edge they are coming from, on their row
      const y = S.rowY[fl.row] - 18, x = fl.dir > 0 ? 10 : S.W - 10;
      if (((fl.warn * 8) | 0) % 2) { sprK(g, SPRITES.ss_swallow1, x - 9, y - 4, 2, fl.dir < 0); text(g, '!', x + (fl.dir > 0 ? 13 : -13), y - 6, WARNLBL); }
    }
    if (!fl.on) return;
    const y0 = S.rowY[fl.row] - 14, fr = ((fl.t * 10) | 0) % 2;
    // their shadow on the water: the strip where a seed would be snapped up
    g.globalAlpha = 0.18; rect(g, Math.round(fl.x - FLOCK_W), S.rowY[fl.row] - 1, FLOCK_W * 2, 3, '#0e2a4f'); g.globalAlpha = 1;
    for (let i = 0; i < FLOCK_DX.length; i++) {
      const x = Math.round(fl.x + FLOCK_DX[i] * fl.dir), y = Math.round(y0 + FLOCK_DY[i] + Math.sin(fl.t * 9 + i) * 1.5);
      sprK(g, (fr + i) % 2 ? SPRITES.ss_swallow1 : SPRITES.ss_swallow2, x - 9, y - 4, 2, fl.dir < 0);
    }
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
        if (f.row !== r || !f.use) continue;
        const x = Math.round(f.x), bob = Math.round(Math.sin(f.bob * 2.4 + f.i) * 0.8);
        if (f.on && f.kind === 2) { drawDiver(g, f, x, y, bob, pad, sp, k); continue; }
        g.drawImage(pad.c, x - (pad.w >> 1), y - (pad.h >> 1) + bob);
        if (f.on && f.kind === 1) {
          // golden: a soft glow, the shiny fruit and a twinkle
          const gs = SPRITES.ss_golden, gk = r < 2 ? 1 : 2, gl = 0.25 + 0.15 * Math.sin(S.time * 6 + f.i);
          g.globalAlpha = gl; D.disc(g, x, y - ((gs.h * gk) >> 1), 6 + gk * 3, '#fff3a8'); g.globalAlpha = 1;
          sprK(g, gs, x - ((gs.w * gk) >> 1), y - gs.h * gk + 1 + bob, gk);
          if (((S.time * 3 + f.i) | 0) % 3 === 0) spr(g, SPRITES.sparkle, x + 3 + gk * 2, y - gs.h * gk - 3);
        } else if (f.on) sprK(g, sp, x - ((sp.w * k) >> 1), y - sp.h * k + 1 + bob, k);
        else if (f.pop > 0) { const kk = f.pop / 0.5; g.globalAlpha = kk; spr(g, SPRITES.sparkle, x - 2, y - 14 - (1 - kk) * 14); g.globalAlpha = 1; }
      }
    }
    // the rows' value tags at the left edge, drawn over every row's pads (a nearer row's big pads never hide a tag);
    // always fully readable: while a fruit drifts past under one, the tag lifts above the fruit (eased), so neither
    // hides the other
    for (let r = 0; r < S.rowY.length; r++) {
      const lb = label('ss.row' + r, POINTS[r]), lw = textW(lb) + 6;
      let near = false; for (const f of S.fruit) if (f.row === r && f.use && f.on && f.x < lw + 14) near = true;
      S.tagLift[r] = clamp(S.tagLift[r] + (near ? 1 : -1) * 0.12, 0, 1);
      const y = Math.round(S.rowY[r] - S.tagLift[r] * 22);
      box(g, 1, y - 6, lw, 12, 'rgba(27,19,37,0.9)', PAL.ink); text(g, lb, 4, y - 5, ROWLBL);
    }
    if (showAim) {
      const y = S.rowY[ar], R = hitR(ctx, ar), x = Math.round(S.aimX), ry = Math.max(2, Math.round(R * 0.4)), pulse = ((S.time * 6) | 0) % 2;
      for (let a = 0; a < 20; a++) { const c = Math.cos(a * 0.314), s = Math.sin(a * 0.314); rect(g, x + c * R, y + s * ry, 2, 1, a % 2 ? '#ffd24a' : '#fff8e8'); }
      rect(g, x, y - ry - 3 - pulse, 1, 3, '#ffd24a'); rect(g, x, y + ry + 1, 1, 2, '#ffd24a');
      // a dotted arc from the slingshot to the ring
      if (S.drag) { for (let i = 1; i < 10; i++) { const k = i / 10, ax = lerp(S.slX, x, k), ay = lerp(S.slY - 40, y, k) - Math.sin(k * Math.PI) * 26; rect(g, ax, ay, 1, 1, '#fff8e8'); } }
    }
    drawFrog(g);
    if (S.fish.on) { const fi = S.fish, u = fi.t / 0.7, fx = Math.round(fi.x + fi.dir * u * 14), fy = Math.round(fi.y - Math.sin(u * Math.PI) * 12); spr(g, SPRITES.ss_fish, fx - 3, fy - 2, fi.dir < 0); }
    for (const p of S.rips) if (p.on) { const rr = 2 + p.t * (p.big ? 18 : 12); g.globalAlpha = 1 - p.t / 0.8; D.oval(g, p.x, p.y, Math.round(rr), Math.max(1, Math.round(rr * 0.35)), '#c8f6ff'); D.oval(g, p.x, p.y, Math.max(0, Math.round(rr) - 1), Math.max(0, Math.round(rr * 0.35) - 1), '#3398b4'); g.globalAlpha = 1; }
    drawFlock(g);
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
      // on a dark strip (pale words on the blue lagoon were hard to read): above the lagoon when there is room
      const str = t(hk), h = JC.font.wrap(str, W - 12, 1).length * JC.font.LINE_H + 2;
      let hy = S.lagTop - h - 4; if (hy < 56) hy = Math.round((S.rowY[1] + S.rowY[2]) / 2) - 8;
      g.globalAlpha = clamp(S.hint * 2, 0, 1); rect(g, 0, hy - 3, W, h + 5, 'rgba(27,19,37,0.65)'); textBlock(g, str, 6, hy, W - 12, HINT); g.globalAlpha = 1;
    }
    g.setTransform(VIEW.S, 0, 0, VIEW.S, 0, 0);
  }

  /* ---------- sound ---------- */
  AUDIO.addSfx('ssChirp', (tt, b) => { const P = AUDIO.prims; P.tone(b, 'square', 1800, tt, 0.05, 0.08, 2600); P.tone(b, 'square', 2100, tt + 0.07, 0.05, 0.07, 2900); P.tone(b, 'square', 1700, tt + 0.15, 0.05, 0.06, 2400); });
  AUDIO.addSfx('ssGold', (tt, b) => { const P = AUDIO.prims; P.tone(b, 'square', 988, tt, 0.07, 0.15); P.tone(b, 'square', 1319, tt + 0.07, 0.16, 0.15); P.tone(b, 'triangle', 1976, tt + 0.07, 0.2, 0.08); });
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
      S.aimX = S.slX; S.aimRow = 2; S.aimOn = true; S.drag = false; S.reload = 0; S.auto = false; S.autoT = 0; S.sigma = 0; S.golds = 0; S.snacks = 0;
      S.flock.on = false; S.flock.warn = 0; S.flock.next = ctx.easy ? 12 : 8; S.fish.on = false; S.fish.next = 1.5;
      S.frog.f = null; S.frog.to = null; S.frog.hop = 0; S.frog.hidden = true; S.frog.next = 3;
      S.ticoT = ctx.easy ? 3.2 : 2.4; S.ticoFlap = 0; S.cappyRecoil = 0; S.hint = ctx.firstTime ? 1.8 : 0.8;
      for (const f of S.fruit) { f.on = f.use; f.gone = f.use ? 0 : 1e9; f.pop = 0; f.bob = Math.random() * 3; newKind(f, ctx); if (f.kind === 1 && f.row === 3) f.kind = 0; }
      for (const s of S.seeds) s.on = false;
      for (const p of S.rips) p.on = false;
    },
    update,
    draw,
    onInput,
    outro(dt, ctx) { for (const sd of S.seeds) if (sd.on) { sd.t += dt; if (sd.t >= sd.T) sd.on = false; } for (const p of S.rips) if (p.on) { p.t += dt; if (p.t > 0.8) p.on = false; } },
    testState() {
      return { k: S.k, you: S.you, tico: S.tico, time: Math.round(S.time * 100) / 100, hits: S.hits, shots: S.shots, streak: S.streak, aimX: Math.round(S.aimX), aimRow: S.aimRow,
        aimOn: S.aimOn, drag: S.drag, reload: S.reload > 0, over: S.over, won: S.won, auto: S.auto, slX: S.slX, slY: S.slY, rowY: S.rowY.slice(), rows: ROWS,
        fruit: S.fruit.filter(f => f.on).map(f => ({ row: f.row, x: Math.round(f.x), kind: ['plain', 'golden', 'diver'][f.kind], under: f.under })), seeds: S.seeds.filter(s => s.on).length,
        golds: S.golds, snacks: S.snacks, flock: S.flock.on ? { row: S.flock.row, x: Math.round(S.flock.x) } : null, flockWarn: S.flock.warn > 0,
        frog: S.frog.hidden ? null : { hopping: S.frog.hop > 0 }, fish: S.fish.on };
    },
    test: {
      auto(ctx, on, sigma) { S.auto = !!on; S.sigma = +sigma || 0; S.autoT = 0; return S.auto; },
      /** Bring the swallows now (on a row), or a golden fruit into view: so a test sees them without waiting. */
      flock(ctx, row) { const fl = S.flock; fl.on = false; fl.dir = 1; fl.row = row === undefined ? 2 : row; fl.warn = 0.05; fl.next = 99; return true; },
      /** Make the fruit that lead(row) aims at golden. */
      golden(ctx, row) { let best = null, bx = 0; for (const f of S.fruit) if (f.on && f.row === row && hittableAt(f, FLIGHT[row])) { const x = fruitX(f, FLIGHT[row]); if (x > 20 && x < S.W - 20 && (!best || Math.abs(x - S.slX) < Math.abs(bx - S.slX))) { best = f; bx = x; } } if (best) { best.kind = 1; best.under = false; } return !!best; },
      lifeOff(ctx) { S.flock.next = 999; S.flock.on = false; S.flock.warn = 0; for (const f of S.fruit) if (f.kind === 2) f.kind = 0; return true; },
      /** Where a fruit in a row will be after its seed's flight time (to aim like a careful player). */
      lead(ctx, row) { let best = null; for (const f of S.fruit) if (f.on && f.row === row && hittableAt(f, FLIGHT[row])) { const x = fruitX(f, FLIGHT[row]); if (x > 20 && x < S.W - 20 && (!best || Math.abs(x - S.slX) < Math.abs(best - S.slX))) best = x; } return best === null ? null : Math.round(best); },
      ticoOff(ctx) { S.ticoT = 999; return true; },
      /** Make one fruit in a row a diver (so a test sees one dive and pop up without waiting for the dice). */
      diver(ctx, row) { const r = row || 1; for (const f of S.fruit) if (f.on && f.row === r) { f.kind = 2; f.dv = 0; f.under = false; return true; } return false; },
    },
    cheat(won) { S.you = won ? 1500 : 400; S.tico = won ? 900 : 1100; S.over = true; S.won = won; return { score: S.you, stars: won ? 2 : 0, won, frac: won ? 0.67 : 0.12 }; },
  });
})();
