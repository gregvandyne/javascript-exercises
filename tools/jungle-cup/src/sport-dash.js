// ======================================================================================================
// MANGO DASH vs Pecca the peccary and her Grunt Gang: carry the mango 280 m up the jungle, in four sections
// (Muddy Clearing, Bamboo Grove, Riverbank with a log bridge, Pecca's Stretch), each starting at a checkpoint.
//   Cappy runs by himself; steer with the joystick / arrows (push up to sprint, down to slow). Coco, Pip and Tapo run
//   alongside on open lines; tap PASS (or Space / A) to throw the mango to the teammate with the arrow (the safest).
//   The gang HUNTS whoever holds the mango: they close in, paw the mud with a "!" and a short dotted line (the tell),
//   then lunge. Pass and they switch to the new carrier at once (a lunge already flying is committed, so a pass dodges
//   it). A tackle is a cartoon tumble: you lose one of your mangoes and restart at the last checkpoint; with none left
//   the run ends. Kinds: pigs, fast zig-zag piglets, big slow bruisers, ambushers hiding behind rocks and bamboo, and
//   Pecca herself near the end. Obstacles: logs (trip), mud and puddles (slow), boulders and bamboo (solid), thorn
//   bushes (sting), rolling coconuts (trip), and a narrow log bridge over the river.
//   Power-ups: a lightning bolt (5 s faster) and a fireball (10 s flame aura: pigs won't come near); both stay with
//   the mango when it is passed.
// World units: x across the field (-FW/2 .. FW/2), d up the field in pixels (PPM pixels per metre).
// ======================================================================================================
(function () {
  const FW = 150, PPM = 26, LEN = 280, END = LEN * PPM, BASE = 40, LAT = 66, NT = 4, MAXP = 16, MAXO = 64, MAXC = 4, MAXU = 14;
  const SECT = [
    { m: 0, key: 'md.sec1', song: 'dash', ground: '#9a6a3e', g2: '#8a5a33', g3: '#b07a48', side: '#245a32', s2: '#2f7a3c', s3: '#3d8a44' },
    { m: 70, key: 'md.sec2', song: 'dash2', ground: '#8f7a46', g2: '#7a6634', g3: '#a8925a', side: '#1f4a2a', s2: '#4a8a3a', s3: '#7cc84a' },
    { m: 140, key: 'md.sec3', song: 'dash3', ground: '#c8a868', g2: '#b0905a', g3: '#dcc088', side: '#2a74b4', s2: '#3393cc', s3: '#55b4e0' },
    { m: 210, key: 'md.sec4', song: 'dash4', ground: '#7a4a2a', g2: '#5e3820', g3: '#8a5a33', side: '#1a3a24', s2: '#2a5a32', s3: '#ff6fb5' },
  ];
  const BRIDGE = { m0: 172, m1: 182, x: 0, hw: 22 };
  // per kind: hunt speed, tell (s), lunge speed and time, catch radius, the distance it lunges from, draw scale
  const KIND = {
    pig: { hunt: 48, tell: 0.75, lsp: 150, lt: 0.4, r: 7, from: 58, k: 1 },
    piglet: { hunt: 58, tell: 0.6, lsp: 165, lt: 0.3, r: 5, from: 46, k: 1 },
    brute: { hunt: 30, tell: 0.95, lsp: 115, lt: 0.55, r: 11, from: 62, k: 2 },
    pecca: { hunt: 44, tell: 0.7, lsp: 170, lt: 0.42, r: 9, from: 64, k: 2 },
    ambush: { hunt: 44, tell: 0.8, lsp: 160, lt: 0.38, r: 7, from: 70, k: 1 },
  };
  // the gang's waves per section: seconds between waves, pigs per wave (min, max), chances of each kind, coconuts
  const WAVE = {
    normal: [{ every: 4.6, n0: 1, n1: 1, pair: 0, piglet: 0, brute: 0, coco: 0, amb: 0 },
      { every: 3.6, n0: 1, n1: 2, pair: 0.15, piglet: 0.4, brute: 0, coco: 0, amb: 0.22 },
      { every: 2.9, n0: 1, n1: 2, pair: 0.3, piglet: 0.3, brute: 0.2, coco: 4.5, amb: 0.25 },
      { every: 2.5, n0: 1, n1: 2, pair: 0.38, piglet: 0.3, brute: 0.3, coco: 5.5, amb: 0.3 }],
    easy: [{ every: 4.6, n0: 1, n1: 1, pair: 0, piglet: 0, brute: 0, coco: 0, amb: 0 },
      { every: 4.2, n0: 1, n1: 1, pair: 0.1, piglet: 0.35, brute: 0, coco: 0, amb: 0.12 },
      { every: 4.0, n0: 1, n1: 1, pair: 0.12, piglet: 0.3, brute: 0.15, coco: 7, amb: 0.15 },
      { every: 3.6, n0: 1, n1: 2, pair: 0.18, piglet: 0.3, brute: 0.25, coco: 8, amb: 0.18 }],
  };
  const TUNE = {
    normal: { spd: 1, tell: 1.05, lunge: 1, rr: 0, lead: 0.3, cap: 4, lives: 3, mud: 0.55, pud: 0.75, stum: 0.5, ups: 3 },
    easy: { spd: 0.75, tell: 1.7, lunge: 0.78, rr: -2, lead: 0, cap: 2, lives: 5, mud: 0.7, pud: 0.85, stum: 0.32, ups: 4 },
  };
  const FIRE_R = 56, FIRE_T = 10, BOLT_T = 5, BOOST_T = 1;
  const D = JC.draw;
  const S = {
    over: false, won: false, t: 0, score: 0, dodges: 0, passes: 0, stumbles: 0, tackles: 0, lives: 3, cp: 0, sec: 0, carrier: 0, passT: 9, passQ: 0, marked: -1,
    ball: { fly: false, t: 0, dur: 0.28, to: 0, x: 0, d: 0, x0: 0, d0: 0 },
    team: [], pigs: [], obs: [], cocos: [], ups: [], drawList: [], marks: [],
    nextWave: 0, nextCoco: 0, genD: 0, boss: 0, camD: 0, z: 1, ox: 0, baseY: 0, resetT: 0, grace: 0,
    hint: 1, auto: false, skill: 'good', botT: 0, botX: 0, botY: 0, bg: [], bgGen: -1, bgZ: 0, bgW: 0, flash: 0, fwd: 0,
    boost: 0, bolt: 0, fire: 0, ax: 0, ay: 0, gotUps: 0, catchT: 0,
  };
  const SLOTS = [{ x: 0, d: 0 }, { x: -38, d: -22 }, { x: 38, d: -22 }, { x: 0, d: -44 }];
  const WHO = ['cappy', 'coco', 'pip', 'tapir'];
  for (let i = 0; i < NT; i++) S.team.push({ tp: 'm', i, who: WHO[i], x: 0, d: 0, vx: 0, vd: 0, slot: i, hop: 0, run: 0, down: 0, catchT: 0 });
  for (let i = 0; i < MAXP; i++) S.pigs.push({ tp: 'p', on: false, kind: 'pig', st: '', t: 0, x: 0, d: 0, vx: 0, vd: 0, sp: 0, ax: 0, ad: 0, tgt: 0, lastTgt: 0, minD: 999, ph: 0, side: 0 });
  for (let i = 0; i < MAXO; i++) S.obs.push({ tp: 'o', on: false, kind: '', x: 0, d: 0, w: 0, h: 0, r: 0, hit: 0 });
  for (let i = 0; i < MAXC; i++) S.cocos.push({ tp: 'c', on: false, x: 0, d: 0, vx: 0, spin: 0 });
  for (let i = 0; i < MAXU; i++) S.ups.push({ tp: 'u', on: false, kind: '', x: 0, d: 0 });
  for (let i = 0; i < NT + MAXP + MAXO + MAXC + MAXU; i++) S.drawList.push(null);
  const HINT = { align: 'center', col: '#fff8e8' }, MARK = { align: 'center', col: '#fff8e8', edge: '#3b2416' }, BANG = { align: 'center', col: '#ff5a5a', edge: '#24150f' };
  const PASS_OPT = { align: 'center', col: '#fff8e8', edge: '#24150f' }, WHITE = { col: '#fff8e8' }, SECT_OPT = { col: '#9ee8d8' }, Q = { align: 'center', col: '#ffd24a', edge: '#24150f' };
  const tune = ctx => (ctx.easy ? TUNE.easy : TUNE.normal);
  const metres = d => clamp(Math.floor(d / PPM), 0, LEN);
  const car = () => S.team[S.carrier];
  const holder = () => (S.ball.fly ? S.team[S.ball.to] : S.team[S.carrier]);
  const secAt = m => (m >= 210 ? 3 : m >= 140 ? 2 : m >= 70 ? 1 : 0);
  const onBridge = d => d >= BRIDGE.m0 * PPM && d <= BRIDGE.m1 * PPM;
  /** Near the log bridge the gang stays away (no waves, no lunges, no coconuts): crossing is its own challenge. */
  const nearBridge = d => d > (BRIDGE.m0 - 8) * PPM && d < (BRIDGE.m1 + 5) * PPM;
  const kindOf = p => KIND[p.kind];

  /* ---------- sprites (the gang, Tapo from behind, pickups) ---------- */
  const PIG_PAL = { o: OUT, p: '#8a6a5a', P: '#5e463c', m: '#2e2420', w: '#ffffff', k: '#120e14', s: '#e0a898', K: '#7a3a3a', c: '#efe4d0' };
  const PIG_TOP = ['...o.o.o.o....', '..omomomomo...', '.oPpppppppPo..', 'oPpwkpppwkpPo.', 'oppkkpppkkppo.', '.oppossssoppo.', '..opsKssKspo..', '..oocccccccoo.', '.oPppppppppPo.', 'oPPoppppppoPPo'];
  JC.sprite('md_pig', PIG_TOP.concat(['.oo.oPooPo.oo.', '....oo..oo....']), PIG_PAL);
  JC.sprite('md_pig2', PIG_TOP.concat(['.oo.oPo.oPo.oo', '...oo....oo...']), PIG_PAL);
  const BRUTE_PAL = Object.assign({}, PIG_PAL, { p: '#5e4a44', P: '#3e302c', c: '#d8cbb4', w: '#f4f0e8' });
  JC.sprite('md_brute', PIG_TOP.concat(['.oo.oPooPo.oo.', '....oo..oo....']), BRUTE_PAL);
  JC.sprite('md_brute2', PIG_TOP.concat(['.oo.oPo.oPo.oo', '...oo....oo...']), BRUTE_PAL);
  const LET_PAL = Object.assign({}, PIG_PAL, { p: '#c89a8a', P: '#a06a5c', m: '#7a4a3a' });
  JC.sprite('md_piglet', ['..o.o.o...', '.omomomo..', 'oPwkppwkPo', 'opkkppkkpo', '.opossopo.', '..oKssKo..', '.oPppppPo.', 'oPo.oo.oPo', '.o......o.'], LET_PAL);
  JC.sprite('md_piglet2', ['..o.o.o...', '.omomomo..', 'oPwkppwkPo', 'opkkppkkpo', '.opossopo.', '..oKssKo..', '.oPppppPo.', '.oPoooPo..', '..o...o...'], LET_PAL);
  JC.sprite('md_tapir', ['................', '..oo........oo..', '.oddo......oddo.', '.odDooooooooDdo.', '..oddddddddddo..', '.oddddddddddddo.', '.oddddddddddddo.', '..oddddddddddo..',
    '..oWWWWWWWWWWo..', '.oWWaaaaaaaaWWo.', '.oWaaaaaaaaaaWo.', '.oDaaaaaaaaaaDo.', '.oDdaaaaaaaadDo.', '..oDaaaaaaaaDo..', '...oddo..oddo...', '...ooo....ooo...'],
  { o: OUT, d: '#4a4658', D: '#2e2b3a', W: '#ece6d8', a: '#6fb6e8' });
  JC.sprite('md_mango', ['..oGo.', '.ooooo', 'oyyrro', 'oyrrro', 'oyyrro', '.oooo.'], { o: OUT, y: '#ffd24a', r: '#ff8a2a', G: '#3d9a2e' });
  JC.sprite('md_bolt', ['....ooo', '...oyyo', '..oyyo.', '.oyyooo', 'oyyyyyo', 'ooooyyo', '..oyyo.', '.oyyo..', '.oyo...', '.oo....'], { o: OUT, y: '#ffe14a' });
  JC.sprite('md_fire', ['...o....', '..oro...', '..orro..', '.oryro..', '.oryyro.', 'oryyyyro', 'oryWWyro', '.oyWWyo.', '..oooo..'], { o: OUT, r: '#ff5a2a', y: '#ffb030', W: '#fff3a8' });
  const SPR = { cappy: 'cappy_up', coco: 'coco_up', pip: 'pip_up', tapir: 'md_tapir' };
  const SPRW = { cappy: 'cappy_up_w', coco: 'coco_up_w', pip: 'pip_up_w', tapir: 'md_tapir' };
  const PIGSPR = { pig: 'md_pig', piglet: 'md_piglet', brute: 'md_brute', ambush: 'md_pig', pecca: 'pecca' };
  const PIGSPR2 = { pig: 'md_pig2', piglet: 'md_piglet2', brute: 'md_brute2', ambush: 'md_pig2', pecca: 'pecca' };

  /* ---------- the field: obstacles and pickups made ahead as the run goes on ---------- */
  function addOb(kind, x, d, w, h, r) { for (const o of S.obs) if (!o.on) { o.on = true; o.kind = kind; o.x = x; o.d = d; o.w = w; o.h = h; o.r = r || 0; o.hit = 0; return o; } return null; }
  function addUp(kind, x, d) { for (const u of S.ups) if (!u.on) { u.on = true; u.kind = kind; u.x = x; u.d = d; return u; } return null; }
  function nearCheckpoint(d) { for (const s of SECT) if (Math.abs(d - s.m * PPM) < 40) return true; return Math.abs(d - END) < 60; }
  function spawnAmbush(ctx, x, d) { const p = newPig(ctx, 'ambush'); if (!p) return; p.x = clamp(x, -FW / 2 + 10, FW / 2 - 10); p.d = d + 14; p.st = 'hide'; }
  function genAhead(ctx) {
    const R = ctx.rng, W = ctx.easy ? WAVE.easy : WAVE.normal;
    while (S.genD < Math.min(END - 2 * PPM, holder().d + 760)) {
      const d = S.genD, m = d / PPM, sec = secAt(m), dens = 0.5 + 0.5 * ((m - SECT[sec].m) / 70), r = R(), x = (R() - 0.5) * (FW - 50);
      let step = 70 + R() * 40 - dens * 18 - sec * 6;
      if (d > 8 * PPM && !nearCheckpoint(d) && !(d > (BRIDGE.m0 - 6) * PPM && d < (BRIDGE.m1 + 4) * PPM)) {
        if (sec === 0) {
          if (r < 0.34) addOb('log', x, d, 26 + R() * 24, 8);
          else if (r < 0.58) addOb('mud', x, d, 34 + R() * 22, 18 + R() * 6);
          else if (r < 0.76) addOb('puddle', x, d, 26 + R() * 16, 12);
          else if (r < 0.84) addOb('boulder', x, d, 0, 0, 9 + R() * 4);
        } else if (sec === 1) {
          if (r < 0.32) {
            // a row of bamboo stands with one or two gaps: it funnels the run
            const gap = (R() - 0.5) * (FW - 60), gap2 = R() < 0.4 ? -gap * 0.8 : 999;
            for (let bx = -FW / 2 + 8; bx < FW / 2 - 4; bx += 15) if (Math.abs(bx - gap) > 22 && Math.abs(bx - gap2) > 20) addOb('bamboo', bx, d + (R() - 0.5) * 6, 0, 0, 5);
            if (R() < W[1].amb) spawnAmbush(ctx, gap + (R() < 0.5 ? -30 : 30), d);
            step += 30;
          } else if (r < 0.5) addOb('thorn', x, d, 0, 0, 9);
          else if (r < 0.66) addOb('log', x, d, 26 + R() * 20, 8);
          else if (r < 0.82) addOb('puddle', x, d, 26 + R() * 16, 12);
        } else {
          if (r < 0.26) { addOb('boulder', x, d, 0, 0, 10 + R() * 5); if (R() < W[sec].amb) spawnAmbush(ctx, x, d); }
          else if (r < 0.42) addOb('thorn', x, d, 0, 0, 9);
          else if (r < 0.56) addOb('log', x, d, 26 + R() * 22, 8);
          else if (r < 0.72) addOb(sec === 2 ? 'puddle' : 'mud', x, d, 30 + R() * 20, 14 + R() * 6);
          else if (r < 0.8 && sec === 3) { addOb('bamboo', x - 12, d, 0, 0, 5); addOb('bamboo', x + 12, d + 4, 0, 0, 5); }
        }
        // power-ups: a few per section, often in risky spots (beside an obstacle); bolts more often than fireballs
        const chance = tune(ctx).ups / (70 * PPM / 90);
        if (R() < chance) addUp(R() < 0.68 ? 'bolt' : 'fire', clamp(x + (R() < 0.5 ? -24 : 24), -FW / 2 + 12, FW / 2 - 12), d + 22);
      }
      S.genD += Math.max(40, step);
    }
    for (const o of S.obs) if (o.on && o.d < holder().d - 320) o.on = false;
    for (const u of S.ups) if (u.on && u.d < holder().d - 320) u.on = false;
  }
  function slowAt(x, d, ctx) {
    const T = tune(ctx); let k = 1;
    for (const o of S.obs) {
      if (!o.on || (o.kind !== 'mud' && o.kind !== 'puddle')) continue;
      const a = (x - o.x) / (o.w / 2), b = (d - o.d) / (o.h / 2);
      if (a * a + b * b < 1) k = Math.min(k, o.kind === 'mud' ? T.mud : T.pud);
    }
    return k;
  }
  /** Push a body (radius rb) out of boulders, bamboo and thorns; returns the thorn it touched, if any. */
  function pushOut(b, rb) {
    let sting = null;
    for (const o of S.obs) {
      if (!o.on || (o.kind !== 'boulder' && o.kind !== 'bamboo' && o.kind !== 'thorn')) continue;
      const dx = b.x - o.x, dd = b.d - o.d, R = o.r + rb;
      if (Math.abs(dx) > R || Math.abs(dd) > R) continue;
      const L = Math.hypot(dx, dd); if (L >= R) continue;
      const nx = L > 0.01 ? dx / L : (b.x >= 0 ? -1 : 1), nd = L > 0.01 ? dd / L : 0;
      b.x = o.x + nx * R; b.d = o.d + nd * R;
      if (o.kind === 'thorn') sting = o;
    }
    return sting;
  }
  function clampField(b) {
    if (onBridge(b.d)) b.x = clamp(b.x, BRIDGE.x - BRIDGE.hw + 4, BRIDGE.x + BRIDGE.hw - 4);
    else b.x = clamp(b.x, -FW / 2 + 8, FW / 2 - 8);
  }

  /* ---------- the Grunt Gang ---------- */
  function newPig(ctx, kind) {
    let n = 0; for (const q of S.pigs) if (q.on && q.kind !== 'ambush') n++;
    if (kind !== 'ambush' && kind !== 'pecca' && n >= tune(ctx).cap) return null;
    for (const p of S.pigs) if (!p.on) { p.on = true; p.kind = kind; p.st = 'hunt'; p.t = 0; p.sp = 0; p.vx = 0; p.vd = -1; p.minD = 999; p.ph = ctx.rng() * 6; p.side = 0; p.tgt = S.carrier; p.lastTgt = S.carrier; return p; }
    return null;
  }
  function spawnPig(ctx, kind, x, side) {
    const p = newPig(ctx, kind); if (!p) return null;
    const h = holder(), ahead = (S.baseY - 12) / S.z;
    p.d = h.d + ahead + 10 + ctx.rng() * 20; p.x = clamp(x, -FW / 2 + 10, FW / 2 - 10); p.side = side || 0;
    ctx.sfx('oink');
    return p;
  }
  function wave(ctx) {
    const W = (ctx.easy ? WAVE.easy : WAVE.normal)[S.sec], R = ctx.rng, h = holder();
    if (R() < W.pair) { spawnPig(ctx, 'pig', -FW / 2 + 12, -1); spawnPig(ctx, 'pig', FW / 2 - 12, 1); }   // a pair closing from both sides
    else {
      const n = W.n0 + ((R() * (W.n1 - W.n0 + 1)) | 0);
      for (let i = 0; i < n; i++) { const r = R(); spawnPig(ctx, r < W.piglet ? 'piglet' : r < W.piglet + W.brute ? 'brute' : 'pig', h.x + (R() - 0.5) * 110); }
    }
    S.nextWave = W.every * (0.85 + R() * 0.3);
  }
  function aimLunge(ctx, p) {
    // aim where the mango will be if it keeps running forward (sideways moves are not guessed: stepping off the
    // dotted line is how you dodge); later in the run the gang guesses a little sideways too
    const K = kindOf(p), h = holder(), T = tune(ctx), left = Math.max(0, K.tell * T.tell * (1.3 - 0.12 * S.sec) - p.t) + K.lt * 0.5;
    const ahead = Math.min(Math.max(0, h.vd) * left, Math.max(0, p.d - h.d) * 0.5);   // the line always points toward the mango
    p.ax = h.x + h.vx * left * T.lead * (S.sec / 3); p.ad = h.d + ahead;
    const dx = p.ax - p.x, dd = p.ad - p.d, L = Math.max(1, Math.hypot(dx, dd));
    p.vx = dx / L; p.vd = dd / L;
  }
  function fireRepel(ctx, p) {
    // the flame aura: pigs skid away and keep clear of the mango
    const h = holder(), dx = p.x - h.x, dd = p.d - h.d, L = Math.max(0.01, Math.hypot(dx, dd));
    if (L < FIRE_R + 18 && (p.st === 'hunt' || p.st === 'tell' || p.st === 'lunge' || p.st === 'hide')) {
      p.st = 'flee'; p.t = 0; ctx.sfx('squeal'); if (!BRBX.reduced()) UI.burst(S.sx(p.x), S.sy(p.d), 4, '#c99a6a', 40);
    }
    if (L < FIRE_R) { p.x = h.x + dx / L * FIRE_R; p.d = h.d + dd / L * FIRE_R; }
  }
  function updatePigs(dt, ctx) {
    const T = tune(ctx), h = holder();
    for (const p of S.pigs) {
      if (!p.on) continue;
      const K = kindOf(p), sp = K.hunt * T.spd;
      p.t += dt; p.tgt = S.ball.fly ? S.ball.to : S.carrier;
      const dx = h.x - p.x, dd = h.d - p.d, L = Math.max(0.01, Math.hypot(dx, dd));
      if (p.st === 'hide') {
        // the ambusher waits behind its rock / bamboo and springs out when the mango comes close
        if (dd < 0 && -dd < K.from + 20 && Math.abs(dx) < 60 && S.fire <= 0 && !S.resetT) { p.st = 'tell'; p.t = 0; aimLunge(ctx, p); ctx.sfx('oink'); }
        if (dd > 40) p.on = false;
      } else if (p.st === 'hunt') {
        // track the mango: turn toward where it will be, speeding up; piglets zig-zag; a pair keeps to its flank a while
        p.sp = Math.min(sp, p.sp + sp * 1.6 * dt);
        let tx = h.x + h.vx * 0.3;
        const td = h.d + h.vd * 0.3;
        if (p.side && p.t < 1.4) tx = h.x + p.side * 40;
        if (p.kind === 'piglet') tx += Math.sin(S.t * 7 + p.ph) * 26;
        const ex = tx - p.x, ed = td - p.d, EL = Math.max(0.01, Math.hypot(ex, ed));
        p.vx += (ex / EL - p.vx) * Math.min(1, dt * 4); p.vd += (ed / EL - p.vd) * Math.min(1, dt * 4);
        const vl = Math.max(0.01, Math.hypot(p.vx, p.vd));
        p.x += p.vx / vl * p.sp * dt; p.d += p.vd / vl * p.sp * dt;
        p.lastTgt = p.tgt;
        if (nearBridge(h.d) && p.kind !== 'pecca') { p.st = 'off'; p.t = 0; p.side = p.x < 0 ? -1 : 1; continue; }
        if (S.fire <= 0 && !S.ball.fly && !S.resetT && S.catchT <= 0 && L < K.from && p.d > h.d - 8) { p.st = 'tell'; p.t = 0; aimLunge(ctx, p); ctx.sfx('oink'); }
        if (p.d < h.d - 40) { p.st = 'off'; p.t = 0; p.side = p.x < h.x ? -1 : 1; }
      } else if (p.st === 'tell') {
        // the tell: paw the mud, "!", a short dotted line where it will lunge (re-aimed for the first part, and at once
        // at the new carrier after a pass)
        // a pass breaks the wind-up: the pig turns to hunt the new carrier from scratch
        if (p.tgt !== p.lastTgt) { p.lastTgt = p.tgt; p.st = 'hunt'; p.t = 0; p.sp *= 0.4; continue; }
        if (p.t < 0.12) aimLunge(ctx, p);
        p.d += 6 * dt;
        if (p.t > K.tell * T.tell * (1.3 - 0.12 * S.sec)) { p.st = 'lunge'; p.t = 0; p.minD = 999; ctx.sfx('whoosh'); }
      } else if (p.st === 'lunge') {
        const ls = K.lsp * T.lunge;
        p.x += p.vx * ls * dt; p.d += p.vd * ls * dt;
        p.minD = Math.min(p.minD, L);
        if (!S.ball.fly && !S.resetT && !S.over && L < K.r + T.rr + 6) { tackle(ctx, p); continue; }
        if (p.t > K.lt) {
          p.st = 'tumble'; p.t = 0;
          if (!S.resetT && p.minD < K.r + 26) { S.dodges++; S.score += 30; UI.float(S.sx(h.x), S.sy(h.d) - 24, t('md.dodge'), '#8ee070'); }
        }
      } else if (p.st === 'tumble') {
        p.x += p.vx * 30 * Math.max(0, 1 - p.t * 2) * dt; p.d += p.vd * 30 * Math.max(0, 1 - p.t * 2) * dt;
        if (p.t > (p.kind === 'pecca' ? 0.6 : 1.0)) { p.st = p.d > h.d - 10 ? 'hunt' : 'off'; p.t = 0; p.sp = 0; p.side = p.x < h.x ? -1 : 1; }
      } else if (p.st === 'flee') {
        // on fire: skid, squeal, veer away; hunt again only once the flames are out
        const fx = p.x - h.x, fd = p.d - h.d, FL = Math.max(0.01, Math.hypot(fx, fd));
        p.x += fx / FL * 70 * dt; p.d += fd / FL * 70 * dt + h.vd * 0.5 * dt;
        if (S.fire <= 0 && p.t > 0.6) { p.st = 'hunt'; p.t = 0; p.sp = 0; }
        if (p.d < h.d - 90 || Math.abs(p.x) > FW / 2 + 50) p.on = false;
      } else if (p.st === 'off') {
        p.x += (p.side || 1) * 60 * dt;
        if (Math.abs(p.x) > FW / 2 + 40 || p.d < h.d - 260) p.on = false;
      }
      if (p.st !== 'off' && p.st !== 'flee' && p.st !== 'hide') { pushOut(p, K.r - 2); if (onBridge(p.d)) clampField(p); }
      if (S.fire > 0 && p.on) fireRepel(ctx, p);
      if (p.d < h.d - 300) p.on = false;
    }
  }
  function tackle(ctx, p) {
    const h = car();
    S.tackles++; S.lives--; S.resetT = 1.4; h.down = 1.4;
    p.st = 'tumble'; p.t = 0.2;
    ctx.sfx('bonk'); ctx.sfx('tackle');
    const n = BRBX.reduced() ? 6 : 16;
    for (let i = 0; i < n; i++) UI.particle(S.sx(h.x) + (Math.random() - 0.5) * 16, S.sy(h.d) - 4, (Math.random() - 0.5) * 70, -Math.random() * 50, i % 2 ? '#c99a6a' : '#e8cd8a', 0.6, 2, 60);
    if (!BRBX.reduced()) S.flash = 0.18;
    UI.float(S.sx(h.x), S.sy(h.d) - 26, t(S.lives > 0 ? 'md.tackled' : p.kind === 'pecca' ? 'md.caughtPecca' : 'md.caught'), '#ffb3d6', 1.5);
    S.bolt = 0; S.fire = 0;
    if (S.lives <= 0) {
      S.over = true; S.won = false;
      const m = metres(h.d);
      S.score += m * 10;
      ctx.finish({ score: S.score, stars: 0, won: false, frac: 0.3 * m / LEN, stats: { metres: m, dodges: S.dodges, passes: S.passes } });
    }
  }
  function restartAtCheckpoint(ctx) {
    // a kind restart: back to the last checkpoint with the mango, the gang gone, a moment to breathe
    const d0 = SECT[S.cp].m * PPM + 12;
    for (let i = 0; i < NT; i++) { const m = S.team[i]; m.slot = i; m.x = SLOTS[i].x; m.d = d0 + SLOTS[i].d; m.down = 0; m.hop = 0; m.vx = 0; m.vd = BASE; }
    S.carrier = 0; S.ball.fly = false; S.marked = -1; S.camD = d0; S.boost = 0;
    for (const p of S.pigs) p.on = false;
    for (const c of S.cocos) c.on = false;
    for (const o of S.obs) if (o.on && o.d > d0 - 20 && o.d < d0 + 90) o.on = false;
    S.grace = 2.2; S.nextWave = 2.2; S.nextCoco = 3;
    UI.banner(t('md.back'), '#1fc8a8', 1.6);
    if (S.lives === 1) UI.float(ctx.W / 2, ctx.H * 0.36, t('md.last'), '#ffd24a', 1.5);
  }

  /* ---------- the team: running, smart lines, passing ---------- */
  function safety(m) {
    let safe = 220;
    for (const p of S.pigs) if (p.on && p.st !== 'off' && p.st !== 'flee' && p.st !== 'tumble') safe = Math.min(safe, Math.hypot(m.x - p.x, m.d - p.d) * (p.st === 'hide' ? 1.5 : 1));
    return safe;
  }
  function pickMarked() {
    const c = car(); let best = -1, bestV = -1;
    for (let i = 0; i < NT; i++) {
      if (i === S.carrier) continue;
      const m = S.team[i];
      if (Math.abs(m.x - c.x) > 120 || m.d < c.d - 90) continue;
      const v = safety(m) + (m.d - c.d) * 0.3;
      if (v > bestV) { bestV = v; best = i; }
    }
    if (S.marked >= 0 && S.marked !== best && S.marked !== S.carrier) { const m = S.team[S.marked]; if (Math.abs(m.x - c.x) <= 120 && safety(m) + (m.d - c.d) * 0.3 > bestV - 15) return; }
    S.marked = best;
  }
  function pass(ctx) {
    if (S.over || S.resetT || S.ball.fly || S.passT < 0.35 || S.marked < 0) return false;
    const b = S.ball, c = car();
    b.fly = true; b.t = 0; b.to = S.marked; b.x0 = c.x; b.d0 = c.d; b.x = c.x; b.d = c.d;
    S.passT = 0; S.passes++; if (S.passes <= 30) S.score += 20;
    S.hint = Math.max(0, S.hint - 0.4);
    ctx.sfx('toss');
    return true;
  }
  function catchBall(ctx) {
    const b = S.ball, old = S.carrier, nu = b.to, os = S.team[old].slot, m = S.team[nu];
    b.fly = false;
    S.team[old].slot = m.slot; m.slot = os;
    S.carrier = nu; S.marked = -1; m.catchT = 0.3; m.hop = 0.25; S.boost = BOOST_T; S.catchT = 0.7;
    ctx.sfx('catch');
    UI.burst(S.sx(m.x), S.sy(m.d) - 14, BRBX.reduced() ? 3 : 8, '#ffd24a', 50);
    UI.float(S.sx(m.x), S.sy(m.d) - 24, t('md.caughtIt'), '#ffd24a');
  }
  function steer(ctx) {
    if (S.auto) { S.ax = S.botX; S.ay = S.botY; } else { S.ax = ctx.axis.mag > 0 ? ctx.axis.x : 0; S.ay = ctx.axis.mag > 0 ? ctx.axis.y : 0; }
  }
  function collect(ctx, m) {
    for (const u of S.ups) {
      if (!u.on || Math.abs(u.d - m.d) > 11 || Math.abs(u.x - m.x) > 11) continue;
      u.on = false; S.gotUps++;
      if (u.kind === 'bolt') { S.bolt = BOLT_T; ctx.sfx('zap'); UI.banner(t('md.bolt'), '#ffe14a', 1.2); }
      else { S.fire = FIRE_T; ctx.sfx('flame'); UI.banner(t('md.fire'), '#ff9b2e', 1.2); }
      S.score += 50;
    }
  }
  function updateTeam(dt, ctx) {
    const T = tune(ctx), c = car();
    steer(ctx);
    // the carrier: always running; up = sprint, down = slow; the bolt and the catch boost speed him up
    let fwd = BASE * clamp(1 - S.ay * 0.25, 0.62, 1.25) * slowAt(c.x, c.d, ctx);
    if (S.bolt > 0) fwd *= 1.45; else if (S.boost > 0) fwd *= 1.3;
    if (c.down > 0) fwd *= 0.25;
    let lat = S.ax * LAT * (S.bolt > 0 ? 1.2 : 1);
    // the log bridge: off the planks you wade (slow) and drift back on
    if (onBridge(c.d + 10) && Math.abs(c.x - BRIDGE.x) > BRIDGE.hw - 4) { fwd *= 0.5; lat += Math.sign(BRIDGE.x - c.x) * 90; }
    S.fwd = fwd;
    const ox = c.x, od = c.d;
    c.run = S.ax; c.x += lat * dt; c.d += fwd * dt;
    const sting = pushOut(c, 6); clampField(c);
    c.vx = (c.x - ox) / dt; c.vd = (c.d - od) / dt;
    if (c.down > 0) c.down -= dt;
    if (sting && sting.hit <= 0) { sting.hit = 1; c.down = T.stum * 0.7; S.stumbles++; ctx.sfx('bonk'); UI.float(S.sx(c.x), S.sy(c.d) - 20, t('md.ouch'), '#ffb3d6'); }
    for (const o of S.obs) {
      if (!o.on) continue;
      if (o.hit > 0 && o.hit < 50) o.hit = Math.max(0, o.hit - dt);
      if (o.kind === 'log' && o.hit === 0 && Math.abs(c.d - o.d) < 5 && Math.abs(c.x - o.x) < o.w / 2 + 3 && S.bolt <= 0) {
        o.hit = 99; c.down = T.stum; S.stumbles++; ctx.sfx('bonk');
        UI.float(S.sx(c.x), S.sy(c.d) - 20, t('md.trip'), '#ffb3d6'); UI.burst(S.sx(c.x), S.sy(c.d), 6, '#8a5a33', 40);
      }
      if (o.kind === 'puddle' && o.hit === 0 && Math.abs(c.d - o.d) < o.h / 2 && Math.abs(c.x - o.x) < o.w / 2) { o.hit = 0.6; ctx.sfx('splash'); if (!BRBX.reduced()) UI.burst(S.sx(c.x), S.sy(c.d), 6, '#9ad8f0', 50); }
    }
    for (const k of S.cocos) if (k.on && Math.abs(k.d - c.d) < 7 && Math.abs(k.x - c.x) < 8 && S.bolt <= 0 && c.down <= 0) { c.down = T.stum; S.stumbles++; ctx.sfx('bonk'); UI.float(S.sx(c.x), S.sy(c.d) - 20, t('md.coco'), '#ffb3d6'); k.vx *= -0.5; }
    collect(ctx, c);
    // the others run open lines beside and behind the mango, away from the nearest pig
    for (let i = 0; i < NT; i++) {
      if (i === S.carrier) continue;
      const m = S.team[i], sl = SLOTS[m.slot];
      let tx = c.x + sl.x;
      for (const p of S.pigs) if (p.on && p.st !== 'off' && Math.abs(p.d - (c.d + sl.d)) < 60 && Math.abs(p.x - tx) < 34) tx += (tx >= p.x ? 1 : -1) * 20;
      tx = clamp(tx, -FW / 2 + 8, FW / 2 - 8);
      const td = c.d + sl.d;
      m.run = clamp((tx - m.x) / 20, -1, 1);
      const ox2 = m.x, od2 = m.d;
      m.x += clamp(tx - m.x, -90 * dt, 90 * dt);
      m.d += clamp(fwd + (td - m.d) * 2.4, 0, BASE * 2.4) * dt;
      clampField(m);
      m.vx = (m.x - ox2) / dt; m.vd = (m.d - od2) / dt;
      if (m.hop > 0) m.hop -= dt;
      else for (const o of S.obs) if (o.on && o.kind === 'log' && Math.abs(m.d - o.d) < 6 && Math.abs(m.x - o.x) < o.w / 2 + 3) { m.hop = 0.35; break; }
      if (m.catchT > 0) m.catchT -= dt;
      if (S.ball.fly && S.ball.to === i) collect(ctx, m);
    }
    if (c.hop > 0) c.hop -= dt;
    if (c.catchT > 0) c.catchT -= dt;
  }
  function updateBall(dt, ctx) {
    const b = S.ball; if (!b.fly) return;
    b.t += dt;
    const r = S.team[b.to], k = clamp(b.t / b.dur, 0, 1);
    b.x = lerp(b.x0, r.x, k); b.d = lerp(b.d0, r.d, k);
    if (k >= 1) catchBall(ctx);
  }
  function updateCocos(dt, ctx) {
    if (S.sec >= 2 && !S.grace && !nearBridge(holder().d)) {
      const W = (ctx.easy ? WAVE.easy : WAVE.normal)[S.sec];
      S.nextCoco -= dt;
      if (W.coco && S.nextCoco <= 0) {
        S.nextCoco = W.coco * (0.8 + ctx.rng() * 0.4);
        for (const k of S.cocos) if (!k.on) { const side = ctx.rng() < 0.5 ? -1 : 1; k.on = true; k.x = side * (FW / 2 + 10); k.d = holder().d + 110 + ctx.rng() * 70; k.vx = -side * (62 + ctx.rng() * 20); k.spin = 0; ctx.sfx('roll'); break; }
      }
    }
    for (const k of S.cocos) { if (!k.on) continue; k.x += k.vx * dt; k.spin += k.vx * dt * 0.2; if (Math.abs(k.x) > FW / 2 + 30 || k.d < holder().d - 200) k.on = false; }
  }

  /* ---------- the play-bot (test.auto and the advice a real-input test follows) ---------- */
  const SKILL = { good: { react: 0.1, noise: 0, passUse: 1, look: 80, proact: 1 }, decent: { react: 0.24, noise: 0.25, passUse: 0.85, look: 60, proact: 0.5 }, sloppy: { react: 0.4, noise: 0.5, passUse: 0.6, look: 42, proact: 0.15 } };
  const ADV = { x: 0, y: 0, pass: false };
  function bot(dt, ctx) {
    S.botT -= dt; if (S.botT > 0) return;
    const K = SKILL[S.skill] || SKILL.good; S.botT = K.react;
    think(ctx, K);
    S.botX = ADV.x; S.botY = ADV.y;
    if (ADV.pass && ctx.rng() < K.passUse) pass(ctx);
  }
  /** The cost of being at lane x over the next stretch: obstacles, the bridge, pigs' lunge lines, power-ups (a bonus). */
  function laneCost(x, c, look) {
    let cost = Math.abs(x - c.x) * 0.25;
    for (const o of S.obs) {
      if (!o.on || o.d < c.d - 4 || o.d > c.d + look) continue;
      const near = 1 + (look - (o.d - c.d)) / look;
      if (o.kind === 'boulder' || o.kind === 'bamboo' || o.kind === 'thorn') { if (Math.abs(x - o.x) < o.r + 9) cost += (o.kind === 'thorn' ? 70 : 90) * near; }
      else if (o.kind === 'log') { if (o.hit === 0 && Math.abs(x - o.x) < o.w / 2 + 7) cost += 60 * near; }
      else if (Math.abs(x - o.x) < o.w / 2 + 4) cost += (o.kind === 'mud' ? 28 : 14) * near;
    }
    if (BRIDGE.m0 * PPM - c.d < 140 && c.d < BRIDGE.m1 * PPM && Math.abs(x - BRIDGE.x) > BRIDGE.hw - 8) cost += 160;
    for (const k of S.cocos) if (k.on && k.d > c.d - 4 && k.d < c.d + 60) { const tt = (k.d - c.d) / Math.max(10, S.fwd), kx = k.x + k.vx * tt; if (Math.abs(x - kx) < 14) cost += 80; }
    for (const p of S.pigs) {
      if (!p.on || p.st === 'off' || p.st === 'flee' || p.st === 'tumble') continue;
      if (p.st === 'tell' || p.st === 'lunge') {
        // where the lunge line crosses the mango's row (and just ahead of it)
        const K = kindOf(p), reach = K.lsp * K.lt;
        for (let s = 0; s <= reach; s += 12) { const lx = p.x + p.vx * s, ld = p.d + p.vd * s; if (ld < c.d + 30 && ld > c.d - 20 && Math.abs(x - lx) < K.r + 16) { cost += 140; break; } }
      }
      else if (p.d > c.d - 6 && p.d < c.d + 110 && S.fire <= 0) { const w = 1 - (p.d - c.d) / 110; if (Math.abs(x - p.x) < 34) cost += 50 * w; }
    }
    for (const u of S.ups) if (u.on && u.d > c.d && u.d < c.d + 80 && Math.abs(x - u.x) < 8) cost -= 30;
    return cost;
  }
  function think(ctx, K) {
    const c = car(), R = ctx.rng;
    let best = c.x, bestC = 1e9;
    for (let x = -FW / 2 + 9; x <= FW / 2 - 9; x += 5) { const cc = laneCost(x, c, K.look); if (cc < bestC) { bestC = cc; best = x; } }
    let danger = 0, wantPass = false;
    for (const p of S.pigs) {
      if (!p.on || S.fire > 0) continue;
      const dist = Math.hypot(p.x - c.x, p.d - c.d), Kp = kindOf(p);
      if ((p.st === 'tell' || p.st === 'lunge') && laneCost(c.x, c, 0) >= 140 && dist < 100) { danger = 1; if (Math.abs(best - c.x) > 26 || (p.st === 'lunge' && dist < 34)) wantPass = true; }
      else if (p.st === 'hunt' && p.d > c.d - 6 && dist < 64) { danger = Math.max(danger, 0.5); if (R() < K.proact * 0.5) wantPass = true; }
    }
    if (wantPass && (S.marked < 0 || safety(S.team[S.marked]) < 46)) wantPass = false;
    ADV.x = clamp((best - c.x) / 10 + (R() - 0.5) * K.noise, -1, 1); ADV.y = danger > 0.8 ? 0 : -1; ADV.pass = wantPass;
    return ADV;
  }

  /* ---------- update ---------- */
  function update(dt, ctx) {
    S.t += dt; S.passT += dt; if (S.flash > 0) S.flash -= dt;
    if (S.hint > 0 && S.t > 4) S.hint -= dt * 0.5;
    if (S.bolt > 0) S.bolt = Math.max(0, S.bolt - dt);
    if (S.fire > 0) { S.fire = Math.max(0, S.fire - dt); if (S.fire === 0) ctx.sfx('fizz'); }
    if (S.boost > 0) S.boost = Math.max(0, S.boost - dt);
    if (S.grace > 0) S.grace = Math.max(0, S.grace - dt);
    if (S.catchT > 0) S.catchT = Math.max(0, S.catchT - dt);
    if (S.over) { S.passQ = 0; updatePigs(dt, ctx); return; }
    // a PASS pressed a moment too early (ball still in the air, just after a catch) is kept for a short while, so a
    // tap is never silently lost
    if (S.passQ > 0) { S.passQ = Math.max(0, S.passQ - dt); if (pass(ctx)) S.passQ = 0; }
    if (S.resetT > 0) {
      S.resetT -= dt; updatePigs(dt, ctx);
      if (S.resetT <= 0) { S.resetT = 0; restartAtCheckpoint(ctx); }
      return;
    }
    const c = car();
    if (S.auto) bot(dt, ctx);
    updateTeam(dt, ctx);
    updateBall(dt, ctx);
    genAhead(ctx);
    // sections: a checkpoint banner, its own music, the last checkpoint reached
    const m = metres(c.d), sec = secAt(m);
    if (sec > S.sec) { S.sec = sec; S.cp = Math.max(S.cp, sec); UI.banner(t(SECT[sec].key) + ' - ' + t('md.checkpoint'), '#1fc8a8', 1.8); ctx.sfx('star'); ctx.music(SECT[sec].song); S.score += 100; }
    // the gang: waves (none in the first 6 m, a breather after a restart); Pecca twice near the end
    if (!S.grace) S.nextWave -= dt;
    if (m >= 6 && m < LEN - 6 && S.nextWave <= 0 && !nearBridge(c.d)) wave(ctx);
    if ((S.boss === 0 && m >= 255) || (S.boss === 1 && m >= 268)) { S.boss++; const p = spawnPig(ctx, 'pecca', c.x); if (p && S.boss === 1) UI.banner(t('md.pecca'), '#1fc8a8', 1.4); }
    updateCocos(dt, ctx);
    updatePigs(dt, ctx);
    if (S.over || S.resetT) return;
    pickMarked();
    const follow = S.ball.fly ? S.ball.d : c.d;
    S.camD += (follow - S.camD) * Math.min(1, dt * 6);
    if (c.d >= END) win(ctx);
  }
  function win(ctx) {
    S.over = true; S.won = true;
    const T = ctx.easy ? 185 : 170, secs = S.t;
    const stars = 1 + (S.tackles <= (ctx.easy ? 2 : 1) ? 1 : 0) + (S.tackles === 0 && secs <= T ? 1 : 0);
    S.score += LEN * 10 + 1500 + S.lives * 300 + Math.max(0, Math.round((T + 20 - secs) * 6));
    ctx.sfx('cheer'); UI.confetti(ctx.W / 2, ctx.H * 0.3, 40);
    ctx.finish({ score: S.score, stars, won: true, frac: stars / 3, stats: { metres: LEN, secs: Math.round(secs), tackles: S.tackles, dodges: S.dodges, passes: S.passes } });
  }

  /* ---------- drawing ---------- */
  function layout(ctx) {
    const W = ctx.W, H = ctx.H;
    S.z = Math.max(1, Math.min(3, Math.floor(Math.min((W - 16) / FW, H / 230))));
    // on a touch screen the runners sit higher, so the floating joystick and PASS (bottom corners) never cover the team
    S.ox = Math.round(W / 2); S.baseY = Math.round(H * (H > W ? (ctx.touch ? 0.6 : 0.72) : (ctx.touch ? 0.66 : 0.74)));
  }
  S.sx = x => Math.round(S.ox + x * S.z);
  S.sy = d => Math.round(S.baseY - (d - S.camD) * S.z);
  const PAT = 96;
  function buildBg(ctx) {
    const W = ctx.W, z = S.z;
    S.bg.length = 0;
    for (let si = 0; si < SECT.length; si++) {
      const sc = SECT[si], c = JC.canvas2(W, PAT * z), g = c.getContext('2d');
      const fx0 = S.sx(-FW / 2), fx1 = S.sx(FW / 2);
      g.fillStyle = sc.side; g.fillRect(0, 0, W, PAT * z);
      if (si === 2) {
        // the riverbank: water at both sides with ripples
        for (let i = 0; i < 30; i++) { const x = (JC.hash(i, 3, si) * W) | 0, y = (JC.hash(i, 4, si) * PAT * z) | 0; g.fillStyle = i % 2 ? sc.s2 : sc.s3; g.fillRect(x, y, 6 * z, z); }
      } else {
        for (let i = 0; i < 26; i++) { const x = (JC.hash(i, 3, si) * W) | 0, y = (JC.hash(i, 4, si) * PAT * z) | 0; D.disc(g, x, y, (6 + JC.hash(i, 5, si) * 8) * z, i % 3 ? sc.s2 : shade(sc.s2, 0.15)); }
        if (si === 1) for (let x = 4; x < W; x += 14 * z) { if (x > fx0 - 10 && x < fx1 + 10) continue; g.fillStyle = '#7cc84a'; g.fillRect(x, 0, 3 * z, PAT * z); g.fillStyle = '#4a8a3a'; for (let y = 0; y < PAT * z; y += 18 * z) g.fillRect(x, y, 3 * z, z); }
        for (let i = 0; i < 14; i++) { const x = (JC.hash(i, 6, si) * W) | 0, y = (JC.hash(i, 7, si) * PAT * z) | 0; g.fillStyle = si === 3 ? '#ff6fb5' : '#ffd23f'; g.fillRect(x, y, z, z); }
      }
      g.fillStyle = sc.ground; g.fillRect(fx0, 0, fx1 - fx0, PAT * z);
      for (let i = 0; i < 40; i++) { const x = fx0 + JC.hash(i, 8, si) * (fx1 - fx0), y = JC.hash(i, 9, si) * PAT * z; g.fillStyle = i % 2 ? sc.g2 : sc.g3; g.fillRect(x | 0, y | 0, (2 + (i % 3)) * z, z); }
      g.fillStyle = si === 2 ? '#e8cd8a' : '#3d8a3a'; g.fillRect(fx0 - 3 * z, 0, 3 * z, PAT * z); g.fillRect(fx1, 0, 3 * z, PAT * z);
      S.bg.push(c);
    }
    S.bgGen = VIEW.gen; S.bgZ = z; S.bgW = W;
  }
  function drawGroundOb(g, o) {
    const x = S.sx(o.x), y = S.sy(o.d), z = S.z;
    if (o.kind === 'mud') {
      D.oval(g, x, y, o.w / 2 * z + z, o.h / 2 * z + z, '#5e3820'); D.oval(g, x, y, o.w / 2 * z, o.h / 2 * z, '#6e4224');
      D.oval(g, x - o.w / 6 * z, y - o.h / 6 * z, o.w / 5 * z, o.h / 6 * z, '#87532e');
      D.disc(g, x + ((((S.t * 2 + o.x) | 0) % 3) - 1) * 6 * z, y + z, z + 1, '#a8703e');
    } else if (o.kind === 'puddle') {
      D.oval(g, x, y, o.w / 2 * z + z, o.h / 2 * z + z, '#2a74b4'); D.oval(g, x, y, o.w / 2 * z, o.h / 2 * z, '#55b4e0');
      D.rect(g, x - o.w / 5 * z, y - z, o.w / 3 * z, z, '#c8f0ff');
    } else if (o.kind === 'log') {
      const x0 = S.sx(o.x - o.w / 2), x1 = S.sx(o.x + o.w / 2), h = 7 * z;
      if (o.hit > 50) g.globalAlpha = 0.6;
      D.shadow(g, (x0 + x1) / 2, y + h / 2 + z, (x1 - x0) / 2);
      D.rect(g, x0, y - h / 2, x1 - x0, h, OUT); D.rect(g, x0 + z, y - h / 2 + z, x1 - x0 - 2 * z, h - 2 * z, '#8a5a33');
      D.rect(g, x0 + z, y - h / 2 + z, x1 - x0 - 2 * z, z, '#b07a44'); for (let xx = x0 + 6 * z; xx < x1 - 4 * z; xx += 9 * z) D.rect(g, xx, y - z, 3 * z, z, '#5e3820');
      D.disc(g, x1 - 2 * z, y, 3 * z, OUT); D.disc(g, x1 - 2 * z, y, 2 * z, '#c99a6a');
      g.globalAlpha = 1;
    }
  }
  function drawTallOb(g, o) {
    const x = S.sx(o.x), y = S.sy(o.d), z = S.z, r = o.r * z;
    if (o.kind === 'boulder') { D.shadow(g, x, y + r * 0.6, r); D.disc(g, x, y, r + z, OUT); D.disc(g, x, y, r, '#8a93a0'); D.disc(g, x - r / 3, y - r / 3, r / 2, '#b4bcc6'); D.rect(g, x + r / 4, y + r / 4, 2 * z, z, '#5a626e'); }
    else if (o.kind === 'thorn') {
      D.shadow(g, x, y + r * 0.6, r); D.disc(g, x, y, r + z, OUT); D.disc(g, x, y, r, '#2f6a34'); D.disc(g, x - r / 3, y - r / 3, r / 2, '#3d8a44');
      for (let i = 0; i < 6; i++) { const a = i * 1.05; D.rect(g, x + Math.cos(a) * r - z, y + Math.sin(a) * r - z, 2 * z, 2 * z, '#e8e0c8'); }
      D.rect(g, x - z, y - z, 2 * z, 2 * z, '#e04848');
    } else if (o.kind === 'bamboo') {
      D.shadow(g, x, y + 2 * z, 7 * z);
      for (let k = -1; k <= 1; k++) { const bx = x + k * 4 * z, top = y - (34 + (k + 1) * 6) * z; D.rect(g, bx - 2 * z, top, 4 * z, y - top, OUT); D.rect(g, bx - z, top + z, 2 * z, y - top - z, k ? '#7cc84a' : '#5aa84e'); for (let yy = top + 8 * z; yy < y; yy += 9 * z) D.rect(g, bx - 2 * z, yy, 4 * z, z, '#3d7a34'); D.rect(g, bx + z, top - 2 * z, 4 * z, 2 * z, '#56b84a'); }
    }
  }
  function drawRiver(g, ctx) {
    const z = S.z, y0 = S.sy(BRIDGE.m1 * PPM + 6), y1 = S.sy(BRIDGE.m0 * PPM - 6);
    if (y1 < -10 || y0 > ctx.H + 10) return;
    D.rect(g, 0, y0, ctx.W, y1 - y0, '#2a74b4');
    for (let i = 0; i < 24; i++) { const rx = ((i * 53 + S.t * 30) % ctx.W) | 0, ry = y0 + ((i * 37) % Math.max(1, y1 - y0)); D.rect(g, rx, ry, 6 * z, z, '#55b4e0'); }
    const bx0 = S.sx(BRIDGE.x - BRIDGE.hw), bx1 = S.sx(BRIDGE.x + BRIDGE.hw);
    D.rect(g, bx0 - z, y0 - 2 * z, bx1 - bx0 + 2 * z, y1 - y0 + 4 * z, OUT);
    for (let yy = y0; yy < y1; yy += 5 * z) D.rect(g, bx0, yy, bx1 - bx0, 4 * z, ((yy / (5 * z)) | 0) % 2 ? '#a8703e' : '#c48a4c');
    D.rect(g, bx0, y0, 2 * z, y1 - y0, '#5e3820'); D.rect(g, bx1 - 2 * z, y0, 2 * z, y1 - y0, '#5e3820');
  }
  function drawMarks(g, ctx) {
    const z = S.z, fx0 = S.sx(-FW / 2), fx1 = S.sx(FW / 2);
    for (let i = 1; i <= LEN / 10; i++) {
      const y = S.sy(i * 10 * PPM); if (y < -24 || y > ctx.H + 10) continue;
      if (i === LEN / 10) {
        for (let x = fx0; x < fx1; x += 8 * z) D.rect(g, x, y - z, 4 * z, 2 * z, '#fff8e8');
        for (let k = 0; k < 4; k++) { const bx = S.sx(-36 + k * 24); D.rect(g, bx - 7 * z, y - 12 * z, 14 * z, 9 * z, OUT); D.rect(g, bx - 6 * z, y - 11 * z, 12 * z, 7 * z, '#a8703e'); D.disc(g, bx - 2 * z, y - 12 * z, 3 * z, '#ff9b2e'); D.disc(g, bx + 3 * z, y - 13 * z, 3 * z, '#ffb030'); }
      } else if (i % 7 === 0) {
        // a checkpoint: a teal line of flags across the field, a flag pole at each side
        for (let x = fx0; x < fx1; x += 10 * z) { D.rect(g, x, y - z, 6 * z, 2 * z, '#1fc8a8'); D.rect(g, x + 2 * z, y + z, 2 * z, 2 * z, '#fff8e8'); }
        for (let s = 0; s < 2; s++) { const px = s ? fx1 : fx0 - 2 * z; D.rect(g, px, y - 22 * z, 2 * z, 22 * z, '#5e3820'); D.rect(g, px + 2 * z, y - 22 * z, 8 * z, 5 * z, '#1fc8a8'); }
      } else for (let x = fx0 + 2 * z; x < fx1; x += 10 * z) D.rect(g, x, y, 5 * z, z, 'rgba(255,248,232,0.5)');
      { const mw = textW(S.marks[i]) / 2 + 4; text(g, S.marks[i], clamp(fx1 + 14 * z, mw, ctx.W - mw), y - 6, MARK); }   // never clipped at the edge
    }
  }
  function drawAura(g, x, y, z) {
    // the fireball's flame aura: a fun cartoon glow (steady with reduced motion), flickers in the last 2 s
    const rm = BRBX.reduced();
    if (S.fire < 2 && !rm && ((S.t * 8) | 0) % 2) return;
    const fl = rm ? 0 : Math.sin(S.t * 18) * z;
    g.globalAlpha = 0.35; D.disc(g, x, y - 8 * z, 14 * z + fl, '#ff9b2e'); g.globalAlpha = 0.5; D.disc(g, x, y - 8 * z, 10 * z, '#ffd24a'); g.globalAlpha = 1;
    for (let k = 0; k < 5; k++) { const a = S.t * (rm ? 0 : 3) + k * 1.26, h = rm ? 3 : 3 + ((S.t * 9 + k) % 3); D.rect(g, x + Math.cos(a) * 11 * z, y - 8 * z + Math.sin(a) * 9 * z - h * z, 2 * z, h * z, k % 2 ? '#ff5a2a' : '#ffb030'); }
    if (!rm && ((S.t * 20) | 0) % 3 === 0) UI.particle(x + (Math.random() - 0.5) * 16 * z, y - 10 * z, (Math.random() - 0.5) * 20, -30, Math.random() < 0.5 ? '#ffb030' : '#ff5a2a', 0.4, 1, -10);
  }
  function drawMember(g, m) {
    const i = m.i, z = S.z, x = S.sx(m.x), y = S.sy(m.d), isC = i === S.carrier && !S.ball.fly;
    const hop = m.hop > 0 ? Math.round(Math.sin((0.35 - m.hop) / 0.35 * Math.PI) * 6 * z) : 0;
    const walk = ((S.t * (S.bolt > 0 && isC ? 14 : 8) + i) | 0) % 2, s = SPRITES[walk && !S.over ? SPRW[m.who] : SPR[m.who]];
    if (isC && S.fire > 0) drawAura(g, x, y, z);
    if (isC && S.bolt > 0 && !BRBX.reduced()) for (let k = 1; k <= 3; k++) { g.globalAlpha = 0.3 / k; JC.sprK(g, s, x - 8 * z, y - 15 * z + k * 6 * z, z); g.globalAlpha = 1; D.rect(g, x - 10 * z + k * 5 * z, y + k * 4 * z, z, 6 * z, '#ffe14a'); }
    if (isC) { g.globalAlpha = 0.5; D.oval(g, x, y + z, 10 * z, 4 * z, S.bolt > 0 ? '#ffe14a' : '#ffd24a'); g.globalAlpha = 1; }
    if (i === S.marked && !S.over && !S.ball.fly && !S.resetT) { g.globalAlpha = 0.45; D.oval(g, x, y + z, 9 * z, 3 * z, '#1fc8a8'); g.globalAlpha = 1; }
    D.shadow(g, x, y + z, 6 * z);
    if (m.down > 0 && isC && S.resetT) {
      // tackled: a tumble in a dust cloud, dizzy stars (cartoon)
      g.globalAlpha = 0.6; D.disc(g, x - 6 * z, y - 4 * z, 7 * z, '#e8cd8a'); D.disc(g, x + 6 * z, y - 3 * z, 6 * z, '#d4b26c'); g.globalAlpha = 1;
      JC.sprK(g, s, x - 8 * z, y - 10 * z, z, true);
      for (let k = 0; k < 3; k++) { const a = S.t * 6 + k * 2.1; D.rect(g, x + Math.cos(a) * 8 * z, y - 15 * z + Math.sin(a) * 2 * z, z + 1, z + 1, '#ffd24a'); }
    } else {
      JC.sprK(g, s, x - 8 * z, y - 15 * z - hop + (m.catchT > 0 ? z : 0), z);
      if (m.down > 0) for (let k = 0; k < 2; k++) { const a = S.t * 6 + k * 3; D.rect(g, x + Math.cos(a) * 7 * z, y - 16 * z, z + 1, z + 1, '#ffd24a'); }
    }
    if (isC && !S.resetT) JC.sprK(g, SPRITES.md_mango, x - 3 * z, y - 19 * z - hop, z);
    if (i === S.marked && !S.over && !S.ball.fly && !S.resetT) {
      const ay = y - 24 * z - hop - (((S.t * 4) | 0) % 2) * z;
      D.rect(g, x - 3 * z, ay, 7 * z, 2 * z, OUT); D.rect(g, x - 2 * z, ay + 2 * z, 5 * z, z, '#1fc8a8'); D.rect(g, x - z, ay + 3 * z, 3 * z, z, '#1fc8a8'); D.rect(g, x, ay + 4 * z, z, z, '#1fc8a8');
      D.rect(g, x - 2 * z, ay + z, 5 * z, z, '#7ff0dc');
    }
  }
  function drawPig(g, p, ctx) {
    const z = S.z, K = kindOf(p), k = K.k * z, x = S.sx(p.x), y = S.sy(p.d);
    if (p.st === 'tell') {
      // the tell: a short dotted lunge line, dust from the hooves, a "!"
      const L = K.lsp * tune(ctx).lunge * K.lt;
      for (let s = 8; s < L; s += 8) { g.globalAlpha = 0.7 * (1 - s / L) + 0.2; D.rect(g, S.sx(p.x + p.vx * s) - z, S.sy(p.d + p.vd * s) - z, 2 * z, 2 * z, '#ff5a5a'); }
      g.globalAlpha = 1;
      if (((p.t * 10) | 0) % 2) UI.particle(x + (Math.random() - 0.5) * 8 * k, y, (Math.random() - 0.5) * 30, -15, '#c99a6a', 0.35, 1, 40);
      text(g, '!', x, y - (K.k > 1 ? 34 : 22) * z, BANG);
    }
    if (p.st === 'hide') {
      // peeking out from behind its cover: eyes, and a "?" once the mango is near
      D.rect(g, x - 4 * z, y - 6 * z, 2 * z, 2 * z, '#fff8e8'); D.rect(g, x + 2 * z, y - 6 * z, 2 * z, 2 * z, '#fff8e8'); D.rect(g, x - 3 * z, y - 5 * z, z, z, OUT); D.rect(g, x + 3 * z, y - 5 * z, z, z, OUT);
      if (holder().d > p.d - 140) text(g, '?', x, y - 18 * z, Q);
      return;
    }
    if (p.st === 'lunge' && !BRBX.reduced()) for (let s = 1; s <= 3; s++) { g.globalAlpha = 0.25 / s; D.rect(g, x - 5 * k - p.vx * s * 6 * z, y - 6 * k + p.vd * s * 6 * z, 10 * k, 2 * z, '#fff8e8'); g.globalAlpha = 1; }
    D.shadow(g, x, y + z, (K.k > 1 ? 10 : 6) * z);
    const fr = (p.st === 'hunt' || p.st === 'lunge' || p.st === 'off' || p.st === 'flee') && ((S.t * 12) | 0) % 2;
    const sp = SPRITES[fr ? PIGSPR2[p.kind] : PIGSPR[p.kind]];
    const lean = p.st === 'lunge' ? -2 * z : 0, paw = p.st === 'tell' && ((p.t * 8) | 0) % 2 ? z : 0;
    JC.sprK(g, sp, x - (sp.w * k) / 2, y - sp.h * k + z + lean - paw, k, p.vx > 0.3);
    if (p.st === 'tumble' && p.t > 0.25) for (let s = 0; s < 3; s++) { const a = S.t * 5 + s * 2.1; D.rect(g, x + Math.cos(a) * 6 * k, y - sp.h * k - 2 * z + Math.sin(a) * 2 * z, z + 1, z + 1, '#ffd24a'); }
    if (p.st === 'flee' && p.t < 0.5) text(g, '!!', x, y - sp.h * k - 10 * z, Q);
  }
  function drawUp(g, u) {
    const z = S.z, x = S.sx(u.x), y = S.sy(u.d), bob = BRBX.reduced() ? 0 : Math.round(Math.sin(S.t * 4 + u.x) * 2 * z);
    D.shadow(g, x, y + 2 * z, 5 * z);
    g.globalAlpha = 0.35; D.disc(g, x, y - 6 * z + bob, 8 * z, u.kind === 'bolt' ? '#ffe14a' : '#ff9b2e'); g.globalAlpha = 1;
    const s = SPRITES[u.kind === 'bolt' ? 'md_bolt' : 'md_fire'];
    JC.sprK(g, s, x - (s.w * z) / 2, y - 6 * z - (s.h * z) / 2 + bob, z);
  }
  function drawCoco(g, k) {
    const z = S.z, x = S.sx(k.x), y = S.sy(k.d);
    D.shadow(g, x, y + 3 * z, 5 * z); D.disc(g, x, y - 2 * z, 5 * z, OUT); D.disc(g, x, y - 2 * z, 4 * z, '#7a4a26');
    D.rect(g, x + Math.cos(k.spin) * 2 * z - z, y - 2 * z + Math.sin(k.spin) * 2 * z - z, 2 * z, 2 * z, '#3b2416');
  }
  function sortDraw() {
    let n = 0;
    for (let i = 0; i < NT; i++) S.drawList[n++] = S.team[i];
    for (const p of S.pigs) if (p.on) S.drawList[n++] = p;
    for (const o of S.obs) if (o.on && (o.kind === 'boulder' || o.kind === 'thorn' || o.kind === 'bamboo')) S.drawList[n++] = o;
    for (const c of S.cocos) if (c.on) S.drawList[n++] = c;
    for (const u of S.ups) if (u.on) S.drawList[n++] = u;
    for (let i = 1; i < n; i++) { const a = S.drawList[i]; let j = i - 1; while (j >= 0 && S.drawList[j].d < a.d) { S.drawList[j + 1] = S.drawList[j]; j--; } S.drawList[j + 1] = a; }
    return n;
  }
  function draw(g, ctx) {
    layout(ctx);
    if (S.bgGen !== VIEW.gen || S.bgZ !== S.z || S.bgW !== ctx.W || S.bg.length !== SECT.length) buildBg(ctx);
    // the ground: each band of the screen in its own section's look; the pattern scrolls with the camera
    const z = S.z, ph = PAT * z, y0 = ((((S.baseY + S.camD * z) % ph) + ph) % ph) - ph;
    for (let y = y0; y < ctx.H; y += ph) g.drawImage(S.bg[secAt(clamp((S.camD + (S.baseY - (y + ph / 2)) / z) / PPM, 0, LEN))], 0, Math.round(y));
    drawRiver(g, ctx);
    drawMarks(g, ctx);
    for (const o of S.obs) if (o.on && (o.kind === 'mud' || o.kind === 'puddle' || o.kind === 'log')) { const y = S.sy(o.d); if (y > -30 && y < ctx.H + 30) drawGroundOb(g, o); }
    const n = sortDraw();
    for (let i = 0; i < n; i++) {
      const e = S.drawList[i], y = S.sy(e.d); if (y < -60 || y > ctx.H + 60) continue;
      if (e.tp === 'm') drawMember(g, e); else if (e.tp === 'p') drawPig(g, e, ctx); else if (e.tp === 'o') drawTallOb(g, e); else if (e.tp === 'c') drawCoco(g, e); else drawUp(g, e);
    }
    const b = S.ball;
    if (b.fly) {
      // a snappy throw: a high arc
      const k = clamp(b.t / b.dur, 0, 1), hgt = Math.sin(k * Math.PI) * 24 * z, x = S.sx(b.x), y = S.sy(b.d);
      D.shadow(g, x, y, 3 * z); if (S.fire > 0) { g.globalAlpha = 0.5; D.disc(g, x, y - 10 * z - hgt, 7 * z, '#ff9b2e'); g.globalAlpha = 1; }
      JC.sprK(g, SPRITES.md_mango, x - 3 * z, y - 12 * z - hgt, z);
    }
    if (S.flash > 0) { g.globalAlpha = S.flash; D.rect(g, 0, 0, ctx.W, ctx.H, '#fff8e8'); g.globalAlpha = 1; }
    drawHud(g, ctx);
  }
  function powerRing(g, x, y, frac, col, icon) {
    D.disc(g, x, y, 11, PAL.ink); D.disc(g, x, y, 9, '#3b3150');
    const n = 16, on = Math.ceil(frac * n);
    for (let i = 0; i < on; i++) { const a = -Math.PI / 2 + i / n * Math.PI * 2; D.rect(g, x + Math.cos(a) * 8 - 1, y + Math.sin(a) * 8 - 1, 3, 3, col); }
    JC.spr(g, icon, x - (icon.w >> 1), y - (icon.h >> 1));
  }
  function drawHud(g, ctx) {
    const l = HUD.left(), w = Math.min(150, ctx.W - l - 80), h = holder(), m = metres(h.d);
    D.box(g, l, 4, w, 36, 'rgba(27,19,37,0.82)', PAL.ink);
    text(g, label('md.metres', m), l + 4, 5, WHITE);
    UI.bar(g, l + 4, 18, w - 8, 6, m / LEN, '#1fc8a8');
    text(g, t(SECT[S.sec].key), l + 4, 26, SECT_OPT);
    HUD.score(g, S.score + m * 10);
    // the mangoes left (lives), under the score
    const nl = tune(ctx).lives;
    for (let i = 0; i < nl; i++) { g.globalAlpha = i < S.lives ? 1 : 0.25; JC.sprK(g, SPRITES.md_mango, ctx.W - 8 - (i + 1) * 14, 32, 2); g.globalAlpha = 1; }
    // active power-ups: a ring that drains (the fire ring flickers in its last 2 s)
    let px = l + 14, py = 56;
    if (S.bolt > 0) { powerRing(g, px, py, S.bolt / BOLT_T, '#ffe14a', SPRITES.md_bolt); px += 26; }
    if (S.fire > 0 && !(S.fire < 2 && !BRBX.reduced() && ((S.t * 8) | 0) % 2)) powerRing(g, px, py, S.fire / FIRE_T, '#ff9b2e', SPRITES.md_fire);
    // the PASS button (bottom right), gone once the run is over so the results card has only its own buttons
    if (S.over) return;
    const r = Math.max(22, Math.round(ctx.tap * 0.85)), bx = ctx.W - r - 10, by = ctx.H - r - 12, ok = S.marked >= 0 && !S.ball.fly && !S.over && !S.resetT;
    UI.addHit('mdpass', bx - r, by - r, r * 2, r * 2);
    D.disc(g, bx, by + 2, r, PAL.ink); D.disc(g, bx, by, r, PAL.ink); D.disc(g, bx, by, r - 2, ok ? '#1fc8a8' : '#5c7a74'); D.disc(g, bx - r / 4, by - r / 4, r / 3, ok ? '#7ff0dc' : '#7a948e');
    JC.sprK(g, SPRITES.md_mango, bx - 6, by - 14, 2);
    text(g, t('md.pass'), bx, by + 2, PASS_OPT);
    if (S.hint > 0.05 && !S.over) {
      g.globalAlpha = clamp(S.hint * 2, 0, 1);
      textBlock(g, t(ctx.touch ? 'md.hintTouch' : 'md.hintKeys'), 6, 72, ctx.W - 12, HINT);
      g.globalAlpha = 1;
    }
  }

  AUDIO.addSfx('oink', (tt, b) => { const P = AUDIO.prims; P.tone(b, 'square', 190, tt, 0.12, 0.2, 120); P.tone(b, 'square', 150, tt + 0.1, 0.1, 0.16, 100); P.noise(b, tt, 0.08, 0.12, 'lowpass', 700); });
  AUDIO.addSfx('squeal', (tt, b) => { const P = AUDIO.prims; P.tone(b, 'square', 520, tt, 0.16, 0.16, 980); P.tone(b, 'square', 760, tt + 0.08, 0.12, 0.12, 1200); });
  AUDIO.addSfx('tackle', (tt, b) => { const P = AUDIO.prims; P.noise(b, tt, 0.25, 0.3, 'lowpass', 900, 0.7, 200); P.tone(b, 'triangle', 300, tt, 0.25, 0.2, 90); });
  AUDIO.addSfx('toss', (tt, b) => { const P = AUDIO.prims; P.tone(b, 'triangle', 420, tt, 0.16, 0.2, 980); P.noise(b, tt, 0.1, 0.08, 'highpass', 2500); });
  AUDIO.addSfx('catch', (tt, b) => { const P = AUDIO.prims; P.tone(b, 'square', 660, tt, 0.05, 0.18, 0); P.tone(b, 'square', 990, tt + 0.05, 0.08, 0.16, 0); });
  AUDIO.addSfx('roll', (tt, b) => { const P = AUDIO.prims; P.noise(b, tt, 0.4, 0.1, 'lowpass', 400); });
  AUDIO.addSfx('zap', (tt, b) => { const P = AUDIO.prims; P.noise(b, tt, 0.18, 0.2, 'highpass', 4000); P.tone(b, 'square', 880, tt, 0.06, 0.15, 1760); P.tone(b, 'square', 1320, tt + 0.07, 0.1, 0.13, 2200); });
  AUDIO.addSfx('flame', (tt, b) => { const P = AUDIO.prims; P.noise(b, tt, 0.45, 0.22, 'bandpass', 600, 0.6, 1800); P.tone(b, 'triangle', 220, tt, 0.3, 0.12, 440); });
  AUDIO.addSfx('fizz', (tt, b) => { const P = AUDIO.prims; P.noise(b, tt, 0.25, 0.1, 'highpass', 3000, 0.7, 800); });
  // original jungle marches for the four sections (one tune, a new colour each time, faster at the end)
  AUDIO.songs.dash = { bpm: 132, steps: 32, leadWave: 'square', harmWave: 'triangle', swing: 0.1,
    lead: 'G4 . B4 D5 . B4 G4 . A4 . C5 E5 . C5 A4 . B4 . D5 G5 . D5 B4 . C5 . A4 F#4 . . . .',
    harm: 'D4 . . . D4 . . . E4 . . . E4 . . . D4 . . . D4 . . . C4 . . . D4 . . .',
    bass: 'G2 . D3 . G2 . D3 . A2 . E3 . A2 . E3 . G2 . D3 . G2 . D3 . C3 . G2 . D3 . A2 .',
    drums: 'k.h.s.h.k.hks.h.k.h.s.h.k.hkst.u' };
  AUDIO.songs.dash2 = Object.assign({}, AUDIO.songs.dash, { bpm: 136, leadWave: 'triangle', harmWave: 'square', drums: 'k.c.s.c.k.ckscc.k.c.s.c.k.ckst.u' });
  AUDIO.songs.dash3 = Object.assign({}, AUDIO.songs.dash, { bpm: 140, swing: 0.14,
    lead: 'B4 . D5 G5 . D5 B4 . C5 . E5 A5 . E5 C5 . D5 . G5 B5 . G5 D5 . E5 . C5 A4 . . . .', drums: 'k.h.s.hhk.hks.h.k.h.s.hhk.hkstuu' });
  AUDIO.songs.dash4 = Object.assign({}, AUDIO.songs.dash3, { bpm: 150, leadWave: 'square', harmWave: 'square', drums: 'k.hks.hkk.hks.hkk.hks.hkk.hkstuu' });

  JC.register({
    id: 'dash',
    champion: 'pecca',
    music: 'dash',
    stick: (x, y, ctx) => x < ctx.W * 0.6 && UI.hitAt(x, y) !== 'mdpass',
    start(ctx) {
      const T = tune(ctx);
      S.over = false; S.won = false; S.t = 0; S.score = 0; S.dodges = 0; S.passes = 0; S.stumbles = 0; S.tackles = 0; S.lives = T.lives; S.cp = 0; S.sec = 0;
      S.passT = 9; S.passQ = 0; S.marked = -1; S.carrier = 0; S.ball.fly = false; S.nextWave = 2.5; S.nextCoco = 3; S.genD = 0; S.boss = 0; S.resetT = 0; S.grace = 0;
      S.flash = 0; S.botT = 0; S.botX = 0; S.botY = 0; S.auto = false; S.bolt = 0; S.fire = 0; S.boost = 0; S.gotUps = 0; S.catchT = 0;
      S.hint = ctx.firstTime ? 1.4 : 0.6;
      if (ctx.firstTime) S.nextWave = 6;   // the first time, the hint is read before the gang arrives
      BRIDGE.x = Math.round((ctx.rng() - 0.5) * 60);
      for (let i = 0; i < NT; i++) { const m = S.team[i]; m.slot = i; m.x = SLOTS[i].x; m.d = SLOTS[i].d + 40; m.down = 0; m.hop = 0; m.run = 0; m.vx = 0; m.vd = 0; m.catchT = 0; }
      for (const p of S.pigs) p.on = false;
      for (const o of S.obs) o.on = false;
      for (const c of S.cocos) c.on = false;
      for (const u of S.ups) u.on = false;
      S.camD = S.team[0].d;
      S.marks.length = 0; for (let i = 0; i <= LEN / 10; i++) S.marks.push(t('md.mark', { n: i * 10 }));
      layout(ctx); genAhead(ctx);
    },
    update,
    draw,
    onInput(e, ctx) {
      if ((e.type === 'press' && e.key === 'a') || (e.type === 'down' && UI.hitAt(e.x, e.y) === 'mdpass')) { if (!pass(ctx) && !S.over) S.passQ = 0.45; }
    },
    outro(dt, ctx) {
      S.t += dt;
      updatePigs(dt, ctx);
      if (S.won) for (const m of S.team) if (m.hop <= 0) m.hop = 0.35; else m.hop -= dt;
    },
    testState() {
      const h = holder();
      let pigs = 0, lunging = 0, telling = 0, hiding = 0, logs = 0, solids = 0, slows = 0, nearest = 999;
      const targets = [];
      for (const p of S.pigs) if (p.on) {
        pigs++; if (p.st === 'lunge') lunging++; if (p.st === 'tell') telling++; if (p.st === 'hide') hiding++;
        if (p.st === 'hunt' || p.st === 'tell' || p.st === 'lunge') targets.push({ kind: p.kind, st: p.st, target: WHO[p.tgt] });
        if (p.st !== 'hide') nearest = Math.min(nearest, Math.hypot(p.x - h.x, p.d - h.d));
      }
      for (const o of S.obs) if (o.on) { if (o.kind === 'log') logs++; else if (o.kind === 'mud' || o.kind === 'puddle') slows++; else solids++; }
      let ups = 0; for (const u of S.ups) if (u.on) ups++;
      return { metres: metres(h.d), x: Math.round(h.x), carrier: WHO[S.carrier], holder: WHO[S.ball.fly ? S.ball.to : S.carrier], marked: S.marked >= 0 ? WHO[S.marked] : '', flying: S.ball.fly, over: S.over, won: S.won,
        lives: S.lives, tackles: S.tackles, checkpoint: SECT[S.cp].m, section: S.sec + 1, resetting: S.resetT > 0, dodges: S.dodges, passes: S.passes, trips: S.stumbles,
        pigs, lunging, telling, hiding, targets, nearestPig: Math.round(nearest), fireR: FIRE_R, logs, solids, slows, ups, gotUps: S.gotUps,
        power: S.fire > 0 ? 'fire' : S.bolt > 0 ? 'bolt' : '', fire: Math.round(S.fire * 10) / 10, bolt: Math.round(S.bolt * 10) / 10, speed: Math.round(S.fwd),
        boss: S.boss, t: Math.round(S.t * 10) / 10, score: S.score, auto: S.auto, skill: S.skill };
    },
    test: {
      auto(ctx, on, skill) { S.auto = !!on; S.skill = skill || 'good'; return S.auto; },
      /** The bot's advice without acting on it (a test turns it into real joystick drags and PASS taps). */
      advice(ctx) { const a = think(ctx, SKILL.good); return { x: a.x, y: a.y, pass: a.pass, marked: S.marked, phase: S.over ? 'over' : S.resetT ? 'reset' : 'play' }; },
      /** Where the PASS button is (virtual pixels). */
      passBtn(ctx) { const r = Math.max(22, Math.round(ctx.tap * 0.85)); return { x: ctx.W - r - 10, y: ctx.H - r - 12, r }; },
      /** Move the run to metre m (its checkpoint too), clearing the gang (tests of later sections and the finish). */
      jump(ctx, m) {
        const dd = clamp(m, 0, LEN - 1) * PPM - car().d; for (const tm of S.team) tm.d += dd; S.camD += dd;
        S.genD = Math.max(S.genD, car().d); for (const p of S.pigs) p.on = false; S.sec = secAt(metres(car().d)); S.cp = Math.max(S.cp, S.sec); return metres(car().d);
      },
      /** A pig (kind) at dx, dd from the mango, already hunting at full speed (a test of the lunge and the target switch). */
      spawn(ctx, kind, dx, dd) { const p = newPig(ctx, kind || 'pig'); if (!p) return false; const h = holder(); p.x = h.x + (dx || 0); p.d = h.d + (dd || 80); p.sp = KIND[p.kind].hunt; return true; },
      /** Clear the field around the mango and hold the waves for secs (a quiet test field). */
      quiet(ctx, secs) { for (const o of S.obs) o.on = false; for (const p of S.pigs) p.on = false; for (const c of S.cocos) c.on = false; for (const u of S.ups) u.on = false; S.genD = holder().d + 3000; S.nextWave = secs || 999; S.nextCoco = secs || 999; return true; },
      /** Hold (or let go of) the waves. */
      waves(ctx, on) { S.nextWave = on ? 0.5 : 999; return !!on; },
      /** A power-up right ahead of the mango, in its lane. */
      powerup(ctx, kind, dd) { const h = holder(); return !!addUp(kind === 'fire' ? 'fire' : 'bolt', h.x, h.d + (dd || 40)); },
    },
    cheat(won) { S.over = true; S.won = !!won; return won ? { score: 6200, stars: 2, won: true, frac: 0.67 } : { score: 900, stars: 0, won: false, frac: 0.1 }; },
  });
})();
