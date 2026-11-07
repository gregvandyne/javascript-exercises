// ======================================================================================================
// MANGO DASH vs Pecca the peccary and her Grunt Gang: carry the mango 100 m up the muddy clearing.
//   Cappy runs up the screen by himself; steer with the joystick / arrows (push up to sprint, down to slow).
//   Coco, Pip and Tapo run alongside. Tap PASS (or Space / A) to throw the mango to the teammate with the arrow:
//   the gang charges whoever holds the mango. Each charge is shown first (the pig paws the mud, a red line points
//   where it will run), so you can dodge it or pass. Logs trip you, mud slows you. Caught = the run ends (try again
//   at once). Near the end, Pecca herself charges twice. Reach the mango basket at 100 m to win her Feather.
// World units: x across the field (-FW/2 .. FW/2), d up the field in pixels (PPM pixels per metre).
// ======================================================================================================
(function () {
  const FW = 150, PPM = 26, END = 100 * PPM, BASE = 38, LAT = 66, MAXP = 8, MAXO = 28, NT = 4;
  const D = JC.draw;
  const S = {
    over: false, won: false, t: 0, score: 0, dodges: 0, passes: 0, stumbles: 0, carrier: 0, passT: 9, marked: -1,
    ball: { fly: false, t: 0, dur: 0.36, from: 0, to: 0, x: 0, d: 0, x0: 0, d0: 0 },
    team: [], pigs: [], obs: [], nPig: 0, nextPig: 0, genD: 0, boss: 0, camD: 0, z: 1, ox: 0, baseY: 0,
    hint: 1, auto: false, skill: 'good', botT: 0, botX: 0, botY: 0, botPass: false, bg: null, bgGen: -1, overT: 0, endMsg: '',
    mudT: 0, best: 0, marks: [], drawList: [], fwd: 0, catcher: -1, flash: 0,
  };
  const SLOTS = [{ x: 0, d: 0 }, { x: -40, d: -18 }, { x: 40, d: -18 }, { x: 0, d: -38 }];
  const WHO = ['cappy', 'coco', 'pip', 'tapir'];
  for (let i = 0; i < NT; i++) S.team.push({ who: WHO[i], x: 0, d: 0, slot: i, down: 0, hop: 0, run: 0, vd: 0 });
  for (let i = 0; i < MAXP; i++) S.pigs.push({ on: false, x: 0, d: 0, st: '', t: 0, dx: 0, dd: 0, sp: 0, boss: false, aimX: 0, aimD: 0, passed: false, off: 0 });
  for (let i = 0; i < MAXO; i++) S.obs.push({ on: false, kind: '', x: 0, d: 0, w: 0, h: 0, hit: false });
  for (let i = 0; i < NT + MAXP; i++) S.drawList.push(null);
  const HINT = { align: 'center', col: '#fff8e8' }, MARK = { align: 'center', col: '#fff8e8', edge: '#3b2416' }, BANG = { align: 'center', col: '#ff5a5a', edge: '#24150f' };
  const PASS_OPT = { align: 'center', col: '#fff8e8', edge: '#24150f' }, WHITE = { col: '#fff8e8' };
  const TUNE = {
    normal: { wind: 0.85, gap: 150, sp: 106, r: 8, i0: 3.6, i1: 2.1, pairAt: 55, pair: 0.3, lead0: 0, lead1: 0.24, mud: 0.55, stum: 0.5, bossSp: 124, bossWind: 0.7 },
    easy: { wind: 1.2, gap: 175, sp: 88, r: 6.5, i0: 4.6, i1: 2.9, pairAt: 75, pair: 0.15, lead0: 0, lead1: 0.1, mud: 0.7, stum: 0.3, bossSp: 102, bossWind: 1.0 },
  };
  const tune = ctx => (ctx.easy ? TUNE.easy : TUNE.normal);
  const metres = d => clamp(Math.floor(d / PPM), 0, 100);
  const car = () => S.team[S.carrier];

  /* ---------- sprites (the gang, Tapo from behind) ---------- */
  const PIG_PAL = { o: OUT, p: '#8a6a5a', P: '#5e463c', m: '#2e2420', w: '#ffffff', k: '#120e14', s: '#e0a898', K: '#7a3a3a', c: '#efe4d0' };
  const PIG_TOP = ['...o.o.o.o....', '..omomomomo...', '.oPpppppppPo..', 'oPpwkpppwkpPo.', 'oppkkpppkkppo.', '.oppossssoppo.', '..opsKssKspo..', '..oocccccccoo.', '.oPppppppppPo.', 'oPPoppppppoPPo'];
  JC.sprite('md_pig', PIG_TOP.concat(['.oo.oPooPo.oo.', '....oo..oo....']), PIG_PAL);
  JC.sprite('md_pig2', PIG_TOP.concat(['.oo.oPo.oPo.oo', '...oo....oo...']), PIG_PAL);
  JC.sprite('md_tapir', ['................', '..oo........oo..', '.oddo......oddo.', '.odDooooooooDdo.', '..oddddddddddo..', '.oddddddddddddo.', '.oddddddddddddo.', '..oddddddddddo..',
    '..oWWWWWWWWWWo..', '.oWWaaaaaaaaWWo.', '.oWaaaaaaaaaaWo.', '.oDaaaaaaaaaaDo.', '.oDdaaaaaaaadDo.', '..oDaaaaaaaaDo..', '...oddo..oddo...', '...ooo....ooo...'],
  { o: OUT, d: '#4a4658', D: '#2e2b3a', W: '#ece6d8', a: '#6fb6e8' });
  JC.sprite('md_mango', ['..oGo.', '.ooooo', 'oyyrro', 'oyrrro', 'oyyrro', '.oooo.'], { o: OUT, y: '#ffd24a', r: '#ff8a2a', G: '#3d9a2e' });
  const SPR = { cappy: 'cappy_up', coco: 'coco_up', pip: 'pip_up', tapir: 'md_tapir' };
  const SPRW = { cappy: 'cappy_up_w', coco: 'coco_up_w', pip: 'pip_up_w', tapir: 'md_tapir' };

  /* ---------- the field: obstacles made ahead as Cappy runs ---------- */
  function addOb(kind, x, d, w, h) { for (const o of S.obs) if (!o.on) { o.on = true; o.kind = kind; o.x = x; o.d = d; o.w = w; o.h = h; o.hit = false; return o; } return null; }
  function genAhead(ctx) {
    const R = ctx.rng;
    while (S.genD < Math.min(END - 3 * PPM, car().d + 700)) {
      const r = R(), x = (R() - 0.5) * (FW - 50);
      if (S.genD > 8 * PPM) {
        if (r < 0.36) addOb('log', x, S.genD, 26 + R() * 24, 8);
        else if (r < 0.62) addOb('mud', x, S.genD, 34 + R() * 22, 18 + R() * 6);
        else if (r < 0.72 && S.genD > 40 * PPM) { addOb('log', -FW / 2 + 20 + R() * 20, S.genD, 30, 8); addOb('mud', FW / 2 - 26 - R() * 16, S.genD + 30, 36, 18); }
      }
      S.genD += 64 + R() * 40;
    }
    for (const o of S.obs) if (o.on && o.d < car().d - 300) o.on = false;
  }
  function inMud(x, d) { for (const o of S.obs) if (o.on && o.kind === 'mud') { const a = (x - o.x) / (o.w / 2), b = (d - o.d) / (o.h / 2); if (a * a + b * b < 1) return true; } return false; }

  /* ---------- the Grunt Gang ---------- */
  function spawnPig(ctx, boss) {
    let p = null; for (const q of S.pigs) if (!q.on) { p = q; break; } if (!p) return;
    const c = car(), R = ctx.rng, ahead = (S.baseY - 10) / S.z;
    p.on = true; p.boss = !!boss; p.st = 'trot'; p.t = 0; p.passed = false; p.off = 0;
    p.d = c.d + ahead + 12; p.x = clamp(c.x + (R() - 0.5) * 110, -FW / 2 + 10, FW / 2 - 10);
    p.dx = 0; p.dd = -1; p.sp = 0;
    ctx.sfx('oink');
  }
  function lockAim(ctx, p) {
    // aim where the mango is (a little ahead of it later in the run); the line shows during the paw-scrape
    const T = tune(ctx), c = S.ball.fly ? S.team[S.ball.to] : car(), m = metres(c.d) / 100, lead = lerp(T.lead0, T.lead1, m) + (p.boss ? 0.15 : 0);
    p.aimX = c.x + c.run * lead * 40; p.aimD = c.d + BASE * lead;
    const dx = p.aimX - p.x, dd = p.aimD - p.d, L = Math.max(1, Math.hypot(dx, dd));
    p.dx = dx / L; p.dd = dd / L;
  }
  function updatePigs(dt, ctx) {
    const T = tune(ctx), c = car();
    for (const p of S.pigs) {
      if (!p.on) continue;
      p.t += dt;
      const target = S.ball.fly ? S.team[S.ball.to] : c;
      if (p.st === 'trot') {
        // amble down toward the mango's lane until close enough, then scrape and charge
        p.d -= 20 * dt; p.x += clamp(target.x - p.x, -1, 1) * 22 * dt;
        if (p.d - target.d < (p.boss ? T.gap + 20 : T.gap) || p.t > 4) { p.st = 'wind'; p.t = 0; lockAim(ctx, p); ctx.sfx('oink'); }
      } else if (p.st === 'wind') {
        if (p.t < 0.5) lockAim(ctx, p);
        if (p.t > (p.boss ? T.bossWind : T.wind)) { p.st = 'charge'; p.t = 0; p.sp = p.boss ? T.bossSp : T.sp; ctx.sfx('whoosh'); }
      } else if (p.st === 'charge') {
        p.x += p.dx * p.sp * dt; p.d += p.dd * p.sp * dt;
        if (!p.passed && p.d < target.d - 4) {
          p.passed = true;
          if (!S.over && Math.abs(p.x - target.x) < 26) { S.dodges++; S.score += 30; UI.float(S.sx(target.x), S.sy(target.d) - 22, t('md.dodge'), '#8ee070'); }
        }
        if (p.t > 2.2 || p.d < target.d - 70 || Math.abs(p.x) > FW / 2 + 20) { p.st = 'skid'; p.t = 0; }
      } else if (p.st === 'skid') {
        p.x += p.dx * p.sp * dt * Math.max(0, 1 - p.t * 2); p.d += p.dd * p.sp * dt * Math.max(0, 1 - p.t * 2);
        if (p.t > 1) { p.st = 'off'; p.t = 0; p.off = p.x < 0 ? -1 : 1; }
      } else if (p.st === 'off') {
        p.x += p.off * 60 * dt;
        if (Math.abs(p.x) > FW / 2 + 40 || p.d < c.d - 260) p.on = false;
      }
      if (p.st === 'charge' && !S.over) {
        const R = p.boss ? T.r + 2 : T.r;
        for (let i = 0; i < NT; i++) {
          const m = S.team[i];
          if (Math.abs(m.x - p.x) > R + 4 || Math.abs(m.d - p.d) > R + 4) continue;
          if (Math.hypot(m.x - p.x, m.d - p.d) > R + 4) continue;
          if (S.ball.fly && i === S.ball.to) continue;     // the catcher ducks
          if (i === S.carrier && !S.ball.fly) { caught(ctx, p); break; }
          if (i !== S.carrier && !m.down) { m.down = 1.1; ctx.sfx('bonk'); UI.burst(S.sx(m.x), S.sy(m.d) - 6, 6, '#c99a6a', 40); }
        }
      }
    }
  }
  function caught(ctx, p) {
    S.over = true; S.won = false; S.overT = 0; S.endMsg = p.boss ? 'md.caughtPecca' : 'md.caught';
    ctx.sfx('bonk'); ctx.sfx('lose');
    UI.burst(S.sx(car().x), S.sy(car().d) - 8, 14, '#ff9b2e', 70);
    if (!BRBX.reduced()) S.flash = 0.25;
    p.st = 'skid'; p.t = 0.6;
    const m = metres(car().d);
    S.score += m * 10;
    ctx.finish({ score: S.score, stars: 0, won: false, frac: 0.3 * m / 100, stats: { metres: m, dodges: S.dodges, passes: S.passes } });
  }

  /* ---------- the team: running, passing, the formation ---------- */
  function pickMarked() {
    let best = -1, bestV = -1;
    for (let i = 0; i < NT; i++) {
      if (i === S.carrier) continue;
      const m = S.team[i];
      if (m.down > 0 || Math.abs(m.x - car().x) > 120 || m.d < car().d - 80) continue;
      let safe = 200;
      for (const p of S.pigs) if (p.on && (p.st === 'wind' || p.st === 'charge' || p.st === 'trot')) safe = Math.min(safe, Math.hypot(m.x - p.x, m.d - p.d));
      const v = safe + (m.d - car().d) * 0.3;
      if (v > bestV) { bestV = v; best = i; }
    }
    // sticky: keep the arrow where it is unless another teammate is clearly safer (no flicker)
    if (S.marked >= 0 && S.marked !== best && S.team[S.marked].down <= 0 && S.marked !== S.carrier) {
      const m = S.team[S.marked]; let safe = 200;
      for (const p of S.pigs) if (p.on && (p.st === 'wind' || p.st === 'charge' || p.st === 'trot')) safe = Math.min(safe, Math.hypot(m.x - p.x, m.d - p.d));
      if (safe + (m.d - car().d) * 0.3 > bestV - 15) return;
    }
    S.marked = best;
  }
  function pass(ctx) {
    if (S.over || S.ball.fly || S.passT < 0.45 || S.marked < 0) return;
    const b = S.ball, c = car();
    b.fly = true; b.t = 0; b.from = S.carrier; b.to = S.marked; b.x0 = c.x; b.d0 = c.d;
    S.passT = 0; S.passes++; if (S.passes <= 20) S.score += 20;
    S.hint = Math.max(0, S.hint - 0.4);
    ctx.sfx('toss');
  }
  function catchBall(ctx) {
    const b = S.ball, old = S.carrier, nu = b.to, os = S.team[old].slot;
    b.fly = false;
    S.team[old].slot = S.team[nu].slot; S.team[nu].slot = os;
    S.carrier = nu; S.marked = -1;
    ctx.sfx('catch');
    UI.float(S.sx(S.team[nu].x), S.sy(S.team[nu].d) - 22, t('md.caughtIt'), '#ffd24a');
  }
  function steer(ctx) {
    // the analog axis, or the play-bot's
    if (S.auto) { S.ax = S.botX; S.ay = S.botY; } else { S.ax = ctx.axis.mag > 0 ? ctx.axis.x : 0; S.ay = ctx.axis.mag > 0 ? ctx.axis.y : 0; }
  }
  function updateTeam(dt, ctx) {
    const T = tune(ctx), c = car();
    steer(ctx);
    // the carrier: always running; up = sprint, down = slow; mud and logs slow him
    let fwd = BASE * clamp(1 - S.ay * 0.25, 0.62, 1.25);
    const mud = inMud(c.x, c.d);
    if (mud) { fwd *= T.mud; S.mudT += dt; if (((S.t * 8) | 0) % 2 && ctx.rng() < 0.3) UI.particle(S.sx(c.x), S.sy(c.d), (ctx.rng() - 0.5) * 30, -20, '#7a4a2a', 0.4, 2, 80); }
    if (c.down > 0) fwd *= 0.25;
    S.fwd = fwd;
    c.run = S.ax;
    c.x = clamp(c.x + S.ax * LAT * (mud ? 0.75 : 1) * dt, -FW / 2 + 8, FW / 2 - 8); c.d += fwd * dt; c.vd = fwd;
    if (c.down > 0) c.down -= dt;
    for (const o of S.obs) {
      if (!o.on || o.kind !== 'log' || o.hit) continue;
      if (Math.abs(c.d - o.d) < 5 && Math.abs(c.x - o.x) < o.w / 2 + 3) {
        o.hit = true; c.down = T.stum; S.stumbles++; ctx.sfx('bonk');
        UI.float(S.sx(c.x), S.sy(c.d) - 20, t('md.trip'), '#ffb3d6'); UI.burst(S.sx(c.x), S.sy(c.d), 6, '#8a5a33', 40);
      }
    }
    // the others keep their places beside and behind the mango
    for (let i = 0; i < NT; i++) {
      if (i === S.carrier) continue;
      const m = S.team[i], sl = SLOTS[m.slot];
      if (m.down > 0) { m.down -= dt; continue; }
      const tx = clamp(c.x + sl.x, -FW / 2 + 8, FW / 2 - 8), td = c.d + sl.d;
      m.run = clamp((tx - m.x) / 20, -1, 1);
      m.x += clamp(tx - m.x, -80 * dt, 80 * dt);
      m.vd = clamp(fwd + (td - m.d) * 2.2, 0, BASE * 2.2); m.d += m.vd * dt;
      // teammates hop the logs (only Cappy's runner trips)
      if (m.hop > 0) m.hop -= dt;
      else for (const o of S.obs) if (o.on && o.kind === 'log' && Math.abs(m.d - o.d) < 6 && Math.abs(m.x - o.x) < o.w / 2 + 3) { m.hop = 0.35; break; }
    }
    if (c.hop > 0) c.hop -= dt;
  }
  function updateBall(dt, ctx) {
    const b = S.ball; if (!b.fly) return;
    b.t += dt;
    const r = S.team[b.to], k = clamp(b.t / b.dur, 0, 1);
    b.x = lerp(b.x0, r.x, k); b.d = lerp(b.d0, r.d, k);
    if (k >= 1) catchBall(ctx);
  }

  /* ---------- the play-bot (test.auto): looks ahead, dodges charges, passes when it can't, skirts logs and mud ---------- */
  const SKILL = { good: { react: 0.12, noise: 0, passUse: 1 }, decent: { react: 0.28, noise: 0.25, passUse: 0.8 }, sloppy: { react: 0.45, noise: 0.5, passUse: 0.5 } };
  const ADV = { x: 0, y: 0, pass: false };
  function bot(dt, ctx) {
    S.botT -= dt; if (S.botT > 0) return;
    const K = SKILL[S.skill] || SKILL.good; S.botT = K.react;
    think(ctx, K.noise);
    S.botX = ADV.x; S.botY = ADV.y;
    if (ADV.pass && ctx.rng() < K.passUse) pass(ctx);
  }
  /** What the bot would do now: ADV = { x, y (the stick), pass }. */
  function think(ctx, noise) {
    const c = car(), R = ctx.rng;
    let want = 0, danger = 0, wantPass = false;
    for (const p of S.pigs) {
      if (!p.on || (p.st !== 'charge' && p.st !== 'wind')) continue;
      if (p.d < c.d - 4) continue;
      // where the pig's line crosses Cappy's row, and how soon
      const dd = p.d - c.d, tHit = p.st === 'charge' ? dd / Math.max(1, -p.dd * p.sp + S.fwd) : 0.6 + dd / 200;
      const px = p.x + p.dx * (p.st === 'charge' ? p.sp : 110) * tHit, gap = c.x - px;
      if (Math.abs(gap) < 24 && tHit < 1.6) {
        const dir = Math.abs(gap) < 2 ? (c.x > 0 ? -1 : 1) : Math.sign(gap);
        const room = dir > 0 ? FW / 2 - 8 - c.x : c.x + FW / 2 - 8;
        if (room < 18) want = -dir; else want = dir;
        danger = Math.max(danger, 1 - tHit / 1.6);
        if (tHit < 0.55 && (Math.abs(gap) < 12 || room < 18)) wantPass = true;
      }
    }
    if (!danger) {
      // steer round logs and mud just ahead, else drift back to the middle
      for (const o of S.obs) {
        if (!o.on || o.d < c.d || o.d > c.d + 70 || (o.kind === 'log' && o.hit)) continue;
        if (Math.abs(c.x - o.x) < o.w / 2 + 10) { want = c.x >= o.x ? (o.x + o.w / 2 + 12 > FW / 2 - 8 ? -1 : 1) : (o.x - o.w / 2 - 12 < -FW / 2 + 8 ? 1 : -1); break; }
      }
      if (!want && Math.abs(c.x) > 30) want = -Math.sign(c.x) * 0.5;
    }
    ADV.x = clamp(want + (R() - 0.5) * noise, -1, 1); ADV.y = danger > 0.6 ? 0 : -1; ADV.pass = wantPass;
    return ADV;
  }

  /* ---------- update ---------- */
  function update(dt, ctx) {
    S.t += dt; S.passT += dt; if (S.flash > 0) S.flash -= dt;
    if (S.hint > 0 && S.t > 8) S.hint -= dt * 0.25;
    if (S.over) { S.overT += dt; updatePigs(dt, ctx); return; }
    const T = tune(ctx), c = car();
    if (S.auto) bot(dt, ctx);
    updateTeam(dt, ctx);
    updateBall(dt, ctx);
    genAhead(ctx);
    // the gang: more often further up the field, sometimes two at once; Pecca twice near the end
    S.nextPig -= dt;
    const m = metres(c.d);
    if (m >= 6 && m < 96 && S.nextPig <= 0) {
      spawnPig(ctx, false);
      if (m >= T.pairAt && ctx.rng() < T.pair) spawnPig(ctx, false);
      S.nextPig = lerp(T.i0, T.i1, m / 100) * (0.85 + ctx.rng() * 0.3);
    }
    if ((S.boss === 0 && m >= 80) || (S.boss === 1 && m >= 90)) { S.boss++; spawnPig(ctx, true); if (S.boss === 1) { UI.banner(t('md.pecca'), '#1fc8a8', 1.4); ctx.sfx('oink'); } }
    updatePigs(dt, ctx);
    if (S.over) return;
    pickMarked();
    // the camera follows the mango, easing after a pass
    const follow = S.ball.fly ? S.ball.d : c.d;
    S.camD += (follow - S.camD) * Math.min(1, dt * 6);
    if (c.d >= END) win(ctx);
  }
  function win(ctx) {
    S.over = true; S.won = true; S.overT = 0;
    const T = ctx.easy ? 70 : 64, secs = S.t;
    const stars = 1 + (secs <= T ? 1 : 0) + (secs <= T && S.dodges >= 6 && S.stumbles <= 2 ? 1 : 0);
    S.score += 1000 + 500 + Math.max(0, Math.round((90 - secs) * 8));
    ctx.sfx('cheer'); UI.confetti(ctx.W / 2, ctx.H * 0.3, 40);
    ctx.finish({ score: S.score, stars, won: true, frac: stars / 3, stats: { metres: 100, secs: Math.round(secs), dodges: S.dodges, passes: S.passes, trips: S.stumbles } });
  }

  /* ---------- drawing ---------- */
  function layout(ctx) {
    const W = ctx.W, H = ctx.H;
    S.z = Math.max(1, Math.min(3, Math.floor(Math.min((W - 16) / FW, H / 230))));
    S.ox = Math.round(W / 2); S.baseY = Math.round(H * (H > W ? 0.72 : 0.76));
  }
  S.sx = x => Math.round(S.ox + x * S.z);
  S.sy = d => Math.round(S.baseY - (d - S.camD) * S.z);
  const PAT = 96;
  function buildBg(ctx) {
    const W = ctx.W, z = S.z, c = JC.canvas2(W, PAT * z), g = c.getContext('2d');
    const fx0 = S.sx(-FW / 2), fx1 = S.sx(FW / 2);
    // jungle at both sides
    g.fillStyle = '#245a32'; g.fillRect(0, 0, W, PAT * z);
    for (let i = 0; i < 26; i++) { const x = (JC.hash(i, 3, 1) * W) | 0, y = (JC.hash(i, 4, 1) * PAT * z) | 0; D.disc(g, x, y, (6 + JC.hash(i, 5, 1) * 8) * z, i % 3 ? '#2f7a3c' : '#3d8a44'); }
    for (let i = 0; i < 14; i++) { const x = (JC.hash(i, 6, 2) * W) | 0, y = (JC.hash(i, 7, 2) * PAT * z) | 0; g.fillStyle = '#ff6fb5'; g.fillRect(x, y, z, z); g.fillStyle = '#ffd23f'; g.fillRect(x + 3 * z, y + 2 * z, z, z); }
    // the trampled mud field
    g.fillStyle = '#9a6a3e'; g.fillRect(fx0, 0, fx1 - fx0, PAT * z);
    for (let i = 0; i < 40; i++) { const x = fx0 + JC.hash(i, 8, 3) * (fx1 - fx0), y = JC.hash(i, 9, 3) * PAT * z; g.fillStyle = i % 2 ? '#8a5a33' : '#b07a48'; g.fillRect(x | 0, y | 0, (2 + (i % 3)) * z, z); }
    for (let i = 0; i < 8; i++) { const y = JC.hash(i, 10, 4) * PAT * z; g.fillStyle = '#7a4a2a'; g.fillRect(fx0 + JC.hash(i, 11, 4) * (fx1 - fx0) | 0, y | 0, 6 * z, z); }
    // grass edges
    g.fillStyle = '#3d8a3a'; g.fillRect(fx0 - 3 * z, 0, 3 * z, PAT * z); g.fillRect(fx1, 0, 3 * z, PAT * z);
    for (let y = 0; y < PAT * z; y += 4 * z) { g.fillStyle = '#56b84a'; g.fillRect(fx0 - z, y, 2 * z, 2 * z); g.fillRect(fx1, y + 2 * z, 2 * z, 2 * z); }
    S.bg = c; S.bgGen = VIEW.gen; S.bgZ = z; S.bgW = W;
  }
  function drawLog(g, o) {
    const x0 = S.sx(o.x - o.w / 2), x1 = S.sx(o.x + o.w / 2), y = S.sy(o.d), z = S.z, h = 7 * z;
    if (o.hit) { g.globalAlpha = 0.6; }
    D.shadow(g, (x0 + x1) / 2, y + h / 2 + z, (x1 - x0) / 2);
    D.rect(g, x0, y - h / 2, x1 - x0, h, OUT); D.rect(g, x0 + z, y - h / 2 + z, x1 - x0 - 2 * z, h - 2 * z, '#8a5a33');
    D.rect(g, x0 + z, y - h / 2 + z, x1 - x0 - 2 * z, z, '#b07a44'); for (let x = x0 + 6 * z; x < x1 - 4 * z; x += 9 * z) D.rect(g, x, y - z, 3 * z, z, '#5e3820');
    D.disc(g, x1 - 2 * z, y, 3 * z, OUT); D.disc(g, x1 - 2 * z, y, 2 * z, '#c99a6a');
    g.globalAlpha = 1;
  }
  function drawMud(g, o) {
    const x = S.sx(o.x), y = S.sy(o.d), z = S.z;
    D.oval(g, x, y, o.w / 2 * z + z, o.h / 2 * z + z, '#5e3820'); D.oval(g, x, y, o.w / 2 * z, o.h / 2 * z, '#6e4224');
    D.oval(g, x - o.w / 6 * z, y - o.h / 6 * z, o.w / 5 * z, o.h / 6 * z, '#87532e');
    const bub = ((S.t * 2 + o.x) | 0) % 3;
    D.disc(g, x + (bub - 1) * 6 * z, y + z, z + 1, '#a8703e');
  }
  function drawMarks(g, ctx) {
    // a chalk line every 10 m with its number at the side, the mango basket at 100 m
    const z = S.z, fx0 = S.sx(-FW / 2), fx1 = S.sx(FW / 2);
    for (let i = 1; i <= 10; i++) {
      const y = S.sy(i * 10 * PPM); if (y < -20 || y > ctx.H + 10) continue;
      if (i === 10) {
        for (let x = fx0; x < fx1; x += 8 * z) D.rect(g, x, y - z, 4 * z, 2 * z, '#fff8e8');
        for (let k = 0; k < 4; k++) { const bx = S.sx(-36 + k * 24); D.rect(g, bx - 7 * z, y - 12 * z, 14 * z, 9 * z, OUT); D.rect(g, bx - 6 * z, y - 11 * z, 12 * z, 7 * z, '#a8703e'); D.disc(g, bx - 2 * z, y - 12 * z, 3 * z, '#ff9b2e'); D.disc(g, bx + 3 * z, y - 13 * z, 3 * z, '#ffb030'); }
      } else for (let x = fx0 + 2 * z; x < fx1; x += 10 * z) D.rect(g, x, y, 5 * z, z, 'rgba(255,248,232,0.55)');
      text(g, S.marks[i], fx1 + 12 * z > ctx.W - 4 ? fx1 - 14 * z : fx1 + 12 * z, y - 6, MARK);
    }
  }
  function drawMember(g, i, ctx) {
    const m = S.team[i], z = S.z, x = S.sx(m.x), y = S.sy(m.d), isC = i === S.carrier && !S.ball.fly;
    const hop = m.hop > 0 ? Math.round(Math.sin((0.35 - m.hop) / 0.35 * Math.PI) * 6 * z) : 0;
    const walk = ((S.t * 8 + i) | 0) % 2, s = SPRITES[walk && !S.over ? SPRW[m.who] : SPR[m.who]];
    if (isC) { g.globalAlpha = 0.5; D.oval(g, x, y + z, 10 * z, 4 * z, '#ffd24a'); g.globalAlpha = 1; }
    if (i === S.marked && !S.over && !S.ball.fly) { g.globalAlpha = 0.45; D.oval(g, x, y + z, 9 * z, 3 * z, '#1fc8a8'); g.globalAlpha = 1; }
    D.shadow(g, x, y + z, 6 * z);
    if (m.down > 0 || (isC && S.over && !S.won)) {
      // tumbled over: sideways, with dizzy stars
      JC.sprK(g, s, x - 8 * z, y - 10 * z, z, (i % 2) === 1);
      for (let k = 0; k < 3; k++) { const a = S.t * 6 + k * 2.1; D.rect(g, x + Math.cos(a) * 7 * z, y - 14 * z + Math.sin(a) * 2 * z, z + 1, z + 1, '#ffd24a'); }
    } else JC.sprK(g, s, x - 8 * z, y - 15 * z - hop, z);
    if (isC) JC.sprK(g, SPRITES.md_mango, x - 3 * z, y - 19 * z - hop, z);
    if (i === S.marked && !S.over && !S.ball.fly) {
      const ay = y - 24 * z - hop - (((S.t * 4) | 0) % 2) * z;
      D.rect(g, x - 3 * z, ay, 7 * z, 2 * z, OUT); D.rect(g, x - 2 * z, ay + 2 * z, 5 * z, z, '#1fc8a8'); D.rect(g, x - z, ay + 3 * z, 3 * z, z, '#1fc8a8'); D.rect(g, x, ay + 4 * z, z, z, '#1fc8a8');
      D.rect(g, x - 2 * z, ay + z, 5 * z, z, '#7ff0dc');
    }
  }
  function drawPig(g, p, ctx) {
    const z = S.z, k = p.boss ? z * 2 : z, x = S.sx(p.x), y = S.sy(p.d);
    if (y < -40 || y > ctx.H + 40) return;
    if (p.st === 'wind') {
      // the telegraph: a dotted red line to where it will charge, dust from its hooves, a "!"
      const L = 200; for (let s = 10; s < L; s += 9) { const lx = S.sx(p.x + p.dx * s), ly = S.sy(p.d + p.dd * s); g.globalAlpha = 0.55 * (1 - s / L); D.rect(g, lx - z, ly - z, 2 * z, 2 * z, '#ff5a5a'); }
      g.globalAlpha = 1;
      if (((p.t * 10) | 0) % 2) UI.particle(x + (Math.random() - 0.5) * 8 * k, y, (Math.random() - 0.5) * 30, -15, '#c99a6a', 0.35, 1, 40);
      text(g, '!', x, y - (p.boss ? 40 : 26) * z, BANG);
    }
    if (p.st === 'charge' && !BRBX.reduced()) for (let s = 1; s <= 3; s++) { g.globalAlpha = 0.25 / s; D.rect(g, x - 5 * k - p.dx * s * 6 * z, y - 6 * k - p.dd * -s * 6 * z, 10 * k, 2 * z, '#fff8e8'); g.globalAlpha = 1; }
    D.shadow(g, x, y + z, (p.boss ? 9 : 6) * z);
    const fr = (p.st === 'charge' || p.st === 'off') && ((S.t * 12) | 0) % 2;
    const sp = p.boss ? SPRITES.pecca : SPRITES[fr ? 'md_pig2' : 'md_pig'];
    const dizzy = p.st === 'skid' && p.t > 0.4;
    JC.sprK(g, sp, x - (sp.w * k) / 2, y - sp.h * k + z - (p.st === 'wind' && ((p.t * 8) | 0) % 2 ? z : 0), k, p.dx > 0.3);
    if (dizzy) for (let s = 0; s < 3; s++) { const a = S.t * 5 + s * 2.1; D.rect(g, x + Math.cos(a) * 6 * k, y - sp.h * k - 2 * z + Math.sin(a) * 2 * z, z + 1, z + 1, '#ffd24a'); }
  }
  function sortDraw() {
    // characters far up the field are drawn first (insertion sort in place: nothing new per frame)
    let n = 0;
    for (let i = 0; i < NT; i++) S.drawList[n++] = S.team[i];
    for (const p of S.pigs) if (p.on) S.drawList[n++] = p;
    for (let i = 1; i < n; i++) { const a = S.drawList[i]; let j = i - 1; while (j >= 0 && S.drawList[j].d < a.d) { S.drawList[j + 1] = S.drawList[j]; j--; } S.drawList[j + 1] = a; }
    return n;
  }
  function draw(g, ctx) {
    layout(ctx);
    if (S.bgGen !== VIEW.gen || S.bgZ !== S.z || S.bgW !== ctx.W || !S.bg) buildBg(ctx);
    // the field pattern scrolls with the camera; the first tile starts above the top edge (no unpainted strip)
    const z = S.z, ph = PAT * z, y0 = ((((S.baseY + S.camD * z) % ph) + ph) % ph) - ph;
    for (let y = y0; y < ctx.H; y += ph) g.drawImage(S.bg, 0, Math.round(y));
    drawMarks(g, ctx);
    for (const o of S.obs) if (o.on && o.kind === 'mud') { const y = S.sy(o.d); if (y > -30 && y < ctx.H + 30) drawMud(g, o); }
    for (const o of S.obs) if (o.on && o.kind === 'log') { const y = S.sy(o.d); if (y > -30 && y < ctx.H + 30) drawLog(g, o); }
    const n = sortDraw();
    for (let i = 0; i < n; i++) { const e = S.drawList[i]; if (e.who) drawMember(g, S.team.indexOf(e), ctx); else drawPig(g, e, ctx); }
    // the mango in the air
    const b = S.ball;
    if (b.fly) {
      const k = clamp(b.t / b.dur, 0, 1), hgt = Math.sin(k * Math.PI) * 18 * z, x = S.sx(b.x), y = S.sy(b.d);
      D.shadow(g, x, y, 3 * z); JC.sprK(g, SPRITES.md_mango, x - 3 * z, y - 12 * z - hgt, z);
    }
    if (S.flash > 0) { g.globalAlpha = S.flash; D.rect(g, 0, 0, ctx.W, ctx.H, '#fff8e8'); g.globalAlpha = 1; }
    drawHud(g, ctx);
  }
  function drawHud(g, ctx) {
    const l = HUD.left(), w = Math.min(150, ctx.W - l - 80), m = metres(S.ball.fly ? S.team[S.ball.to].d : car().d);
    D.box(g, l, 4, w, 24, 'rgba(27,19,37,0.82)', PAL.ink);
    text(g, label('md.metres', m), l + 4, 5, WHITE);
    UI.bar(g, l + 4, 18, w - 8, 6, m / 100, '#1fc8a8');
    HUD.score(g, S.score + m * 10);
    // the PASS button (bottom right)
    const r = Math.max(22, Math.round(ctx.tap * 0.85)), bx = ctx.W - r - 10, by = ctx.H - r - 12, ok = S.marked >= 0 && !S.ball.fly && !S.over;
    UI.addHit('mdpass', bx - r, by - r, r * 2, r * 2);
    D.disc(g, bx, by + 2, r, PAL.ink); D.disc(g, bx, by, r, PAL.ink); D.disc(g, bx, by, r - 2, ok ? '#1fc8a8' : '#5c7a74'); D.disc(g, bx - r / 4, by - r / 4, r / 3, ok ? '#7ff0dc' : '#7a948e');
    JC.sprK(g, SPRITES.md_mango, bx - 6, by - 14, 2);
    text(g, t('md.pass'), bx, by + 2, PASS_OPT);
    if (S.hint > 0.05 && !S.over) {
      g.globalAlpha = clamp(S.hint * 2, 0, 1);
      textBlock(g, t(ctx.touch ? 'md.hintTouch' : 'md.hintKeys'), 6, 34, ctx.W - 12, HINT);
      g.globalAlpha = 1;
    }
  }

  AUDIO.addSfx('oink', (tt, b) => { const P = AUDIO.prims; P.tone(b, 'square', 190, tt, 0.12, 0.2, 120); P.tone(b, 'square', 150, tt + 0.1, 0.1, 0.16, 100); P.noise(b, tt, 0.08, 0.12, 'lowpass', 700); });
  AUDIO.addSfx('toss', (tt, b) => { const P = AUDIO.prims; P.tone(b, 'triangle', 420, tt, 0.18, 0.2, 880); P.noise(b, tt, 0.12, 0.08, 'highpass', 2500); });
  AUDIO.addSfx('catch', (tt, b) => { const P = AUDIO.prims; P.tone(b, 'square', 660, tt, 0.05, 0.18, 0); P.tone(b, 'square', 990, tt + 0.05, 0.08, 0.16, 0); });
  // an original bouncy jungle march for Mango Dash
  AUDIO.songs.dash = { bpm: 132, steps: 32, leadWave: 'square', harmWave: 'triangle', swing: 0.1,
    lead: 'G4 . B4 D5 . B4 G4 . A4 . C5 E5 . C5 A4 . B4 . D5 G5 . D5 B4 . C5 . A4 F#4 . . . .',
    harm: 'D4 . . . D4 . . . E4 . . . E4 . . . D4 . . . D4 . . . C4 . . . D4 . . .',
    bass: 'G2 . D3 . G2 . D3 . A2 . E3 . A2 . E3 . G2 . D3 . G2 . D3 . C3 . G2 . D3 . A2 .',
    drums: 'k.h.s.h.k.hks.h.k.h.s.h.k.hkst.u' };

  JC.register({
    id: 'dash',
    champion: 'pecca',
    music: 'dash',
    stick: (x, y, ctx) => x < ctx.W * 0.6 && UI.hitAt(x, y) !== 'mdpass',
    start(ctx) {
      S.over = false; S.won = false; S.t = 0; S.score = 0; S.dodges = 0; S.passes = 0; S.stumbles = 0; S.passT = 9; S.marked = -1; S.carrier = 0;
      S.ball.fly = false; S.nextPig = 2.5; S.genD = 0; S.boss = 0; S.camD = 0; S.mudT = 0; S.overT = 0; S.flash = 0; S.botT = 0; S.botX = 0; S.botY = 0; S.auto = false;
      S.hint = ctx.firstTime ? 1.6 : 0.6;
      for (let i = 0; i < NT; i++) { const m = S.team[i]; m.slot = i; m.x = SLOTS[i].x; m.d = SLOTS[i].d + 40; m.down = 0; m.hop = 0; m.run = 0; }
      for (const p of S.pigs) p.on = false;
      for (const o of S.obs) o.on = false;
      S.camD = S.team[0].d;
      S.marks.length = 0; for (let i = 0; i <= 10; i++) S.marks.push(t('md.mark', { n: i * 10 }));
      layout(ctx); genAhead(ctx);
    },
    update,
    draw,
    onInput(e, ctx) {
      if (e.type === 'press' && e.key === 'a') pass(ctx);
      else if (e.type === 'down' && UI.hitAt(e.x, e.y) === 'mdpass') pass(ctx);
    },
    outro(dt, ctx) {
      S.t += dt; S.overT += dt;
      updatePigs(dt, ctx);
      if (S.won) for (const m of S.team) if (m.hop <= 0) m.hop = 0.35; else m.hop -= dt;
    },
    testState() {
      const c = car();
      let pigs = 0, charging = 0, logs = 0, muds = 0; for (const p of S.pigs) if (p.on) { pigs++; if (p.st === 'charge') charging++; }
      for (const o of S.obs) if (o.on) { if (o.kind === 'log') logs++; else muds++; }
      return { metres: metres(c.d), x: Math.round(c.x), carrier: WHO[S.carrier], marked: S.marked >= 0 ? WHO[S.marked] : '', flying: S.ball.fly, over: S.over, won: S.won,
        dodges: S.dodges, passes: S.passes, trips: S.stumbles, pigs, charging, boss: S.boss, logs, muds, t: Math.round(S.t * 10) / 10, score: S.score, auto: S.auto, skill: S.skill };
    },
    test: {
      auto(ctx, on, skill) { S.auto = !!on; S.skill = skill || 'good'; return S.auto; },
      /** The bot's advice without acting on it (a test turns it into real joystick drags and PASS taps). */
      advice(ctx) { const a = think(ctx, 0); return { x: a.x, y: a.y, pass: a.pass, marked: S.marked, phase: S.over ? 'over' : 'play' }; },
      /** Where the PASS button is (virtual pixels). */
      passBtn(ctx) { const r = Math.max(22, Math.round(ctx.tap * 0.85)); return { x: ctx.W - r - 10, y: ctx.H - r - 12, r }; },
      /** Teleport the run near the end (tests of the finish and Pecca's charge). */
      jump(ctx, m) { const dd = clamp(m, 0, 99) * PPM - car().d; for (const tm of S.team) tm.d += dd; S.camD += dd; S.genD = Math.max(S.genD, car().d); for (const p of S.pigs) p.on = false; return metres(car().d); },
    },
    cheat(won) { return won ? { score: 2600, stars: 2, won: true, frac: 0.67 } : { score: 420, stars: 0, won: false, frac: 0.12 }; },
  });
})();
