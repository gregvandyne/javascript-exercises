// ======================================================================================================
// BANANA KICK vs Mico the howler monkey: a penalty shootout on the clearing pitch.
//   Five kicks each, taking turns (you shoot first), then sudden death. It ends early once one side cannot catch up.
//   SHOOT (camera behind Cappy): aim, then pick the power. More power = higher and faster, but past the green zone
//     the ball sails over the bamboo bar. Corners are hardest for Mico to reach.
//     Touch: drag from anywhere toward the spot in the goal you want, let go to kick (a longer drag = more power).
//     Keys / pad: Left / Right aim, Space / A starts the power meter, Space / A again kicks.
//   KEEP (camera behind Cappy in the goal): Mico shows where he will shoot with his eyes and his tail. Dive that way
//     (or stay in the middle) before the ball arrives. Touch: the three dive buttons, a tap on the left / middle /
//     right of the screen, or a swipe. Keys: Left / Right dive, Down (or Space) stays in the middle.
//   Mico gets craftier each round: he reads your favourite side, glances one way before the real look, and (late in
//   the match) sees a keeper who dives too early. Easier champions: longer looks, no tricks, and a slower ball.
// Goal units: x -1 (left post) .. 1 (right post), y 0 (the grass) .. 1 (the crossbar).
// ======================================================================================================
(function () {
  const REG = 5, MAXK = 40;
  const S = {
    r: Math.random, ctx: null, auto: false, sigma: 0, hint: 1, crafty: false,
    phase: 'aim', phaseT: 0, side: 'shoot', you: new Int8Array(MAXK), mico: new Int8Array(MAXK), nYou: 0, nMico: 0, gYou: 0, gMico: 0,
    saves: 0, corners: 0, lastZone: 9, lastDive: 9, over: false, won: false, wipeT: 0, nextSide: '', msg: '', msgCol: '', msgT: 0, shake: 0,
    // shooting
    aimX: 0, meterOn: false, meter: 0, meterDir: 1, drag: false, dragId: -1, dsx: 0, dsy: 0, dx: 0, dy: 0, idleT: 0,
    tx: 0, ty: 0, power: 0, outcome: '', flyT: 0, flyDur: 0.5, curve: 0, arc: 0, kZone: 0, kDive: 0, kDiveX: 0, kDiveY: 0, kDiveT: 0, runT: 0,
    // keeping
    mZone: 0, mTx: 0, mTy: 0, tellA: 0, tellB: 0, dA: 0, dB: 0, bluff: false, mT: 0, kickAt: 0, dive: 9, diveAt: 0, early: false, mOutcome: '', saw: false,
    // drawing
    K: 1, bgShoot: null, bgKeep: null, bgGen: -1, bgW: 0, bgH: 0, bgK: 0, cheer: 0, botT: 0, cappyCol: '', seed: 0, keepSaved: false,
  };
  const L = { gx: 0, gy0: 0, gy1: 0, gw: 0, gh: 0, bx: 0, by: 0, ks: 2, cs: 2, mx: 0, my: 0, mk: 2, kx: 0, ky: 0, kcs: 3, bar: 0, postL: 0, postR: 0, ground: 0, bottom: 0 };
  const after = p => p === 'res' || p === 'end' || p === 'done';
  const T_C = { align: 'center', col: PAL.white }, HINT = { align: 'center', col: '#fff8e8' };
  const T_ROUND = { align: 'center', col: PAL.r4 }, T_MSG = { align: 'center', col: PAL.r4, scale: 2 };
  const T_NY = { col: '#8ee070' }, T_NM = { col: '#ffd23f' }, T_R = { col: PAL.white, align: 'right' };
  const B_L = { col: '#3a7bd5', disabled: false, icon: null }, B_C = { col: '#7a6a8a', disabled: false }, B_R = { col: '#3a7bd5', disabled: false, icon: null };

  /* ---------- sprites: Mico in goal and at the spot, Cappy from behind (shooting and keeping) ---------- */
  function grid(w, h) { const g = []; for (let y = 0; y < h; y++) { const r = []; for (let x = 0; x < w; x++) r.push('.'); g.push(r); } return g; }
  function stamp(g, rows, ox, oy) { for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) { const c = rows[j][i], y = oy + j, x = ox + i; if (c !== '.' && c !== ' ' && y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c; } }
  /** A 2-pixel-wide outlined limb along points [x, y, x, y, ...], with an optional tip colour (a paw). */
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
  const M_HEAD = ['.....oooooo.....', '...oommmmmmoo...', '..ommmmmmmmmmo..', '.oomffffffffmoo.', 'ofomfwkffwkfmofo', 'offmffffffffmffo',
    '.oomffnnnnffmoo.', '...omffnnffmo...', '...oomffffmoo...'];
  const M_EYES = { '-1': 'ofomfkwffkwfmofo', 0: 'ofomfwkffkwfmofo', 1: 'ofomfwkffwkfmofo' };
  const M_HOOT = '...omfnkknfmo...';
  const M_BODY = ['...omMyyyyMmo...', '...omyYyyYymo...', '...omMyyyyMmo...', '...oomMMMMmoo...'];
  const M_LEGS = { stand: ['....oMMooMMo....', '....ooo..ooo....'], run1: ['....oMMo.oMMo...', '...ooo...oooo...'], run2: ['...oMMo..oMMo...', '...oooo...ooo...'],
    kick: ['....oMMo.........', '....ooo..........'] };
  const MPAL = Object.assign({}, MICO_PAL);
  /** Mico, 24 x 22: eyes -1 / 0 / 1 (screen left / straight / right), tail -1 / 0 / 1, arms and legs by pose. */
  function micoRows(pose, eyes, tail, hoot) {
    const g = grid(24, 22), ox = 4, oy = 3;
    // the tail first (the body is drawn over it): curled to a side, or standing straight up behind him
    if (tail === 0) limb(g, [12, 16, 12, 9, 13, 2, 15, 1, 16, 2], 'M');
    else if (tail < 0) limb(g, [9, 18, 4, 19, 1, 16, 1, 12, 3, 11], 'M');
    else limb(g, [14, 18, 19, 19, 22, 16, 22, 12, 20, 11], 'M');
    const head = M_HEAD.slice(); head[4] = M_EYES[eyes] || M_EYES[0]; if (hoot) head[7] = M_HOOT;
    stamp(g, head, ox, oy); stamp(g, M_BODY, ox, oy + 9);
    stamp(g, M_LEGS[pose] || M_LEGS.stand, ox, oy + 13);
    const sl = [ox + 3, oy + 10], sr = [ox + 12, oy + 10];
    if (pose === 'ready') { limb(g, [sl[0], sl[1], sl[0] - 4, sl[1] - 2, sl[0] - 6, sl[1] - 6], 'm', 'f'); limb(g, [sr[0], sr[1], sr[0] + 4, sr[1] - 2, sr[0] + 6, sr[1] - 6], 'm', 'f'); }
    else if (pose === 'cheer') { limb(g, [sl[0], sl[1], sl[0] - 2, sl[1] - 5, sl[0] - 2, sl[1] - 10], 'm', 'f'); limb(g, [sr[0], sr[1], sr[0] + 2, sr[1] - 5, sr[0] + 2, sr[1] - 10], 'm', 'f'); }
    else if (pose === 'run1') { limb(g, [sl[0], sl[1], sl[0] - 3, sl[1] + 3, sl[0] - 2, sl[1] + 5], 'm', 'f'); limb(g, [sr[0], sr[1], sr[0] + 3, sr[1] - 1, sr[0] + 4, sr[1] - 4], 'm', 'f'); }
    else if (pose === 'run2') { limb(g, [sl[0], sl[1], sl[0] - 3, sl[1] - 1, sl[0] - 4, sl[1] - 4], 'm', 'f'); limb(g, [sr[0], sr[1], sr[0] + 3, sr[1] + 3, sr[0] + 2, sr[1] + 5], 'm', 'f'); }
    else if (pose === 'kick') { limb(g, [sl[0], sl[1], sl[0] - 4, sl[1] + 1, sl[0] - 6, sl[1] - 2], 'm', 'f'); limb(g, [sr[0], sr[1], sr[0] + 4, sr[1] + 1, sr[0] + 6, sr[1] - 2], 'm', 'f'); limb(g, [ox + 10, oy + 13, ox + 13, oy + 16, ox + 17, oy + 16], 'M', 'n'); }
    else { limb(g, [sl[0], sl[1], sl[0] - 2, sl[1] + 3, sl[0] - 2, sl[1] + 6], 'm', 'f'); limb(g, [sr[0], sr[1], sr[0] + 2, sr[1] + 3, sr[0] + 2, sr[1] + 6], 'm', 'f'); }
    return rowsOf(g);
  }
  for (const e of [-1, 0, 1]) sprite('bk_mico_s' + (e + 1), micoRows('stand', e, e), MPAL);
  sprite('bk_mico_look', micoRows('stand', 0, 0), MPAL);
  sprite('bk_mico_ready', micoRows('ready', 0, 0), MPAL);
  sprite('bk_mico_ready2', micoRows('ready', 1, 0), MPAL);
  sprite('bk_mico_cheer', micoRows('cheer', 0, 0, true), MPAL);
  for (const e of [-1, 0, 1]) {
    sprite('bk_mico_r1' + (e + 1), micoRows('run1', 0, e), MPAL);
    sprite('bk_mico_r2' + (e + 1), micoRows('run2', 0, e), MPAL);
    sprite('bk_mico_k' + (e + 1), micoRows('kick', 0, e), MPAL);
  }
  /** Cappy from behind, 22 x 20: keeper (arms out), cheer (arms up), shooter stand / step / kick. */
  function cappyRows(pose) {
    const g = grid(22, 20), ox = 3, oy = 3, body = CAPPY.up.slice(1);
    if (pose === 'step') stamp(g, body.slice(0, 14).concat(['..offo....offo..']), ox, oy);
    else if (pose === 'kick') stamp(g, body.slice(0, 14).concat(['...offo.........']), ox, oy);
    else stamp(g, body, ox, oy);
    if (pose === 'keep') { limb(g, [ox + 2, oy + 10, ox - 1, oy + 7, ox - 2, oy + 2], 'b', 'l'); limb(g, [ox + 14, oy + 10, ox + 17, oy + 7, ox + 18, oy + 2], 'b', 'l'); }
    else if (pose === 'cheer') { limb(g, [ox + 2, oy + 9, ox, oy + 4, ox + 1, oy - 2], 'b', 'l'); limb(g, [ox + 14, oy + 9, ox + 16, oy + 4, ox + 15, oy - 2], 'b', 'l'); }
    else if (pose === 'kick') { limb(g, [ox + 10, oy + 13, ox + 12, oy + 16, ox + 14, oy + 16], 's', 'f'); limb(g, [ox + 2, oy + 10, ox - 1, oy + 12], 'b', 'l'); limb(g, [ox + 14, oy + 10, ox + 17, oy + 8], 'b', 'l'); }
    return rowsOf(g);
  }
  function buildCappySprites() {
    const col = (JC.bandanas && JC.bandanas[SAVE.data.cos.bandana]) || '#45c34e';
    if (col === S.cappyCol) return;
    S.cappyCol = col;
    const pal = Object.assign({}, CAPPY_PAL, { g: col, G: shade(col, -0.32) });
    for (const p of ['keep', 'cheer', 'stand', 'step', 'kick']) sprite('bk_cappy_' + p, cappyRows(p), pal);
  }
  const BALL = { o: OUT, y: '#ffe14a', Y: '#d8a81c', g: '#5fc04a', G: '#2f7d3c', w: '#fffbe0' };
  sprite('bk_ball', ['..ooooo..', '.oywyyyo.', 'oywggyyYo', 'oyygGyyYo', 'oyyyyggYo', 'oyyyyGgYo', 'oYyyyyYYo', '.oYYYYYo.', '..ooooo..'], BALL);
  sprite('bk_ball2', ['..ooooo..', '.oyyyygo.', 'oyyyyGgYo', 'oyyyyyyYo', 'oggyyyyYo', 'oGgyyyyYo', 'oYyyyyYYo', '.oYYYYYo.', '..ooooo..'], BALL);
  // a fan's leaf flag
  sprite('bk_flag', ['oooooo', 'oyyyyo', 'oyggyo', 'oyyyyo', 'oooooo', 'o.....', 'o.....', 'o.....'], { o: OUT, y: '#ffd23f', g: '#45c34e' });

  B_L.icon = UI.icons.back; B_R.icon = UI.icons.play;
  /* ---------- sounds and music ---------- */
  AUDIO.addSfx('bkNet', (t, b) => { const P = AUDIO.prims; P.noise(b, t, 0.3, 0.3, 'lowpass', 2400, 0.7, 500); P.tone(b, 'triangle', 220, t, 0.18, 0.2, 110); });
  AUDIO.addSfx('bkPost', (t, b) => { const P = AUDIO.prims; P.tone(b, 'square', 1480, t, 0.25, 0.14, 1400, 0.001, 0.08, 0.3); P.tone(b, 'square', 2210, t, 0.2, 0.08, 2100); });
  AUDIO.addSfx('bkSave', (t, b) => { const P = AUDIO.prims; P.tone(b, 'sine', 130, t, 0.14, 0.7, 60); P.noise(b, t, 0.08, 0.25, 'lowpass', 900); });
  AUDIO.addSfx('bkHoot', (t, b) => { const P = AUDIO.prims; P.tone(b, 'sawtooth', 260, t, 0.35, 0.08, 520, 0.03, 0.2, 0.6); P.tone(b, 'sawtooth', 300, t + 0.25, 0.45, 0.08, 620, 0.03, 0.2, 0.6); });
  AUDIO.songs.kick = { bpm: 128, steps: 32, leadWave: 'square', harmWave: 'triangle', swing: 0.1,
    lead: 'A5 . C6 . A5 . G5 E5 . . G5 . A5 - . . F5 . A5 . F5 . E5 D5 . . E5 . C5 - . .',
    harm: 'C5 . . . C5 . . . C5 . . . C5 . . . A4 . . . A4 . . . B4 . . . G4 . . .',
    bass: 'A2 . A2 E3 . A2 E3 . C3 . C3 G3 . C3 G3 . F2 . F2 C3 . F2 C3 . G2 . G2 D3 . G2 B2 .',
    drums: 'k.ctk.c.kcc.t.u.k.ctk.c.kcc.tutu' };

  /* ---------- layout (each frame; reused object) ---------- */
  function layout(ctx) {
    const W = ctx.W, H = ctx.H;
    S.K = Math.max(1, Math.floor(Math.min(W / 220, H / 170)));
    const K = S.K;
    L.gw = Math.round(Math.min(W - 26, H * 0.95)); L.gh = Math.round(L.gw / 3);
    L.gx = Math.round(W / 2);
    L.gy0 = Math.max(52, Math.round(H * 0.33 - L.gh * 0.65)); L.gy1 = L.gy0 + L.gh;
    L.by = Math.round(H - Math.max(52, H * 0.16)); L.bx = Math.round(W / 2);
    L.ks = Math.max(1, Math.round(L.gh / 27)); L.cs = Math.max(2 * K, Math.min(3, Math.floor(H / 130)));
    // the keeping camera, from the bottom up: room for the dive buttons, Cappy on the goal line close up (from
    // behind), and Mico on the spot just above Cappy's head
    L.bottom = H - Math.max(30, ctx.tap + 12);
    L.ky = L.bottom - 2; L.kx = Math.round(W / 2);
    L.kcs = Math.max(2, Math.min(4 * K, Math.floor(H * 0.3 / 20)));
    L.my = L.ky - 20 * L.kcs + 2; L.mx = Math.round(W / 2);
    L.mk = Math.max(1, Math.min(3 * K, Math.floor((L.my - 50) / 22)));
    L.ground = Math.max(48, L.my - 18 * L.mk);
    L.bar = Math.max(30, Math.round(H * 0.08)); L.postL = Math.max(4, Math.round(W * 0.04)); L.postR = W - L.postL;
  }

  /* ---------- the match ---------- */
  const zoneOf = x => (x < -0.34 ? -1 : x > 0.34 ? 1 : 0);
  function gauss() { let u = 0, v = 0; while (!u) u = S.r(); while (!v) v = S.r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); }
  const kicksTaken = () => S.nYou + S.nMico;
  /** Is the shootout decided? Regulation: the trailing side cannot catch up; sudden death: after each pair. */
  function decided() {
    if (S.nYou <= REG && S.nMico <= REG && !(S.nYou === REG && S.nMico === REG)) {
      const leftYou = REG - S.nYou, leftMico = REG - S.nMico;
      if (S.gYou > S.gMico + leftMico) return 'you';
      if (S.gMico > S.gYou + leftYou) return 'mico';
      return '';
    }
    if (S.nYou === S.nMico && S.gYou !== S.gMico) return S.gYou > S.gMico ? 'you' : 'mico';
    // a very long sudden death: Mico's legs get tired (he misses his next one) - never more than 15 rounds
    return '';
  }
  function startShoot(ctx) {
    S.side = 'shoot'; S.phase = 'aim'; S.phaseT = 0; S.meterOn = false; S.meter = 0; S.meterDir = 1; S.drag = false; S.idleT = 0; S.runT = 0;
    S.kDive = 0; S.kDiveT = 0; S.outcome = ''; S.flyT = 0; S.botT = 0.35 + S.r() * 0.3;
    S.aimX = 0;
    if (S.nYou === 2 && !ctx.easy && !S.crafty) { S.crafty = true; UI.banner(t('bk.crafty'), '#ffd23f', 1.4); ctx.sfx('bkHoot'); }
  }
  function startKeep(ctx) {
    S.side = 'keep'; S.phase = 'setup'; S.phaseT = 0; S.dive = 9; S.diveAt = 0; S.early = false; S.saw = false; S.mOutcome = ''; S.flyT = 0;
    const k = S.nMico, easy = ctx.easy;
    // where Mico will shoot: a corner most of the time; later he aims away from the side you like to dive to
    let z = S.r() < 0.2 ? 0 : S.r() < 0.5 ? -1 : 1;
    if (!easy && k >= 3 && (S.lastDive === -1 || S.lastDive === 1) && S.r() < 0.6) z = -S.lastDive;
    S.mZone = z; S.mTx = z * (0.62 + S.r() * 0.22) + (z === 0 ? (S.r() - 0.5) * 0.3 : 0); S.mTy = 0.18 + S.r() * 0.6;
    // his looks: one long honest look at first; then a quick glance the other way before the real look
    S.tellB = z; S.bluff = false;
    if (k < 2) { S.dA = 0; S.dB = easy ? 1.7 : 1.35; }
    else if (k < 4) { S.dA = easy ? 0.7 : 0.55; S.dB = easy ? 1.3 : 0.95; }
    else { S.dA = easy ? 0.6 : 0.45; S.dB = easy ? 1.2 : 0.75; if (!easy && S.r() < 0.18) { S.bluff = true; S.tellB = z === 0 ? (S.r() < 0.5 ? -1 : 1) : (S.r() < 0.5 ? -z : 0); } }
    S.tellA = S.tellB === 0 ? (S.r() < 0.5 ? -1 : 1) : -S.tellB;
    S.mT = 0; S.kickAt = 0.7 + S.dA + S.dB + 0.55;
  }
  /** The tell Mico is showing right now (what the player sees): -1 / 0 / 1 for eyes and tail. */
  function tellNow() {
    const tt = S.mT - 0.7;
    if (tt < 0) return 9;
    if (tt < S.dA) return S.tellA;
    return S.tellB;
  }
  function record(who, goal) {
    if (who === 'you') { S.you[Math.min(MAXK - 1, S.nYou++)] = goal ? 1 : 2; if (goal) S.gYou++; }
    else { S.mico[Math.min(MAXK - 1, S.nMico++)] = goal ? 1 : 2; if (goal) S.gMico++; }
  }
  function say(ctx, key, col) { S.msg = t(key); S.msgCol = col; S.msgT = 1.3; }
  /** Kick! tx: aim (-1.3..1.3), p: power 0..1.15. */
  function kick(ctx, tx, p) {
    if (S.phase !== 'aim') return;
    S.hint = Math.max(0, S.hint - 0.5);
    p = clamp(p, 0.05, 1.15);
    const err = (ctx.easy ? 0.035 : 0.05) + Math.max(0, p - 0.85) * 0.45 + S.sigma;
    S.tx = clamp(tx, -1.35, 1.35) + gauss() * err;
    S.ty = clamp(0.06 + p * 0.86 + gauss() * (0.03 + S.sigma * 0.5), 0.03, 1.4);
    S.power = p; S.flyDur = 0.62 - Math.min(1, p) * 0.26;
    S.curve = -clamp(S.tx, -1, 1) * L.gw * 0.1; S.arc = 6 + p * 10;
    const zb = zoneOf(S.tx), easy = ctx.easy;
    // Mico guesses: better each round, better still when you pick the same side again
    let pg = 0.36 + 0.05 * Math.min(S.nYou, 4) + (zb === S.lastZone ? 0.18 : 0) - (easy ? 0.12 : 0);
    pg = clamp(pg, 0.2, 0.72);
    S.kZone = S.r() < pg ? zb : (zb === 0 ? (S.r() < 0.5 ? -1 : 1) : (S.r() < 0.5 ? 0 : -zb));
    S.lastZone = zb;
    const ax = Math.abs(S.tx);
    if (S.ty > 1.0) S.outcome = 'over';
    else if (ax > 1.03) S.outcome = 'wide';
    else if (ax > 0.95) S.outcome = 'post';
    else {
      const corner = clamp((ax - 0.5) / 0.4, 0, 1), high = clamp((S.ty - 0.6) / 0.35, 0, 1), hard = clamp((p - 0.55) / 0.4, 0, 1), soft = clamp((0.45 - p) / 0.25, 0, 1);
      let save;
      if (S.kZone === zb) save = 0.9 - 0.38 * corner * (0.6 + 0.4 * high) - 0.25 * hard + 0.5 * soft - (easy ? 0.15 : 0);
      else save = soft * 0.8 + (ax < 0.45 ? 0.12 : 0) - (easy ? 0.05 : 0);
      S.outcome = S.r() < clamp(save, 0.02, 0.97) ? 'save' : 'goal';
    }
    // where the keeper ends up: on the ball for a save, else in the zone he picked
    if (S.outcome === 'save') { S.kDiveX = clamp(S.tx, -0.9, 0.9); S.kDiveY = S.ty; S.kDive = zoneOf(S.tx); }
    else { S.kDive = S.kZone; S.kDiveX = S.kZone * 0.7; S.kDiveY = 0.45; }
    S.phase = 'kick'; S.phaseT = 0; S.runT = 0;
  }
  function shootResult(ctx) {
    const o = S.outcome, goal = o === 'goal';
    record('you', goal);
    if (goal) {
      if (Math.abs(S.tx) > 0.7) S.corners++;
      ctx.sfx('bkNet'); ctx.sfx('cheer'); say(ctx, Math.abs(S.tx) > 0.7 && S.ty > 0.6 ? 'bk.topCorner' : 'bk.goal', '#8ee070'); S.shake = 0.3; S.cheer = 1.2;
      UI.burst(L.gx + S.tx * L.gw / 2, L.gy1 - S.ty * L.gh, 14, '#ffd23f', 70);
    } else if (o === 'save') { ctx.sfx('bkSave'); ctx.sfx('miss'); say(ctx, 'bk.saved', '#ffb3d6'); }
    else if (o === 'post') { ctx.sfx('bkPost'); say(ctx, 'bk.post', '#ffe9a0'); }
    else { ctx.sfx('miss'); say(ctx, o === 'over' ? 'bk.over' : 'bk.wide', '#ffe9a0'); }
    S.phase = 'res'; S.phaseT = 0; S.nextSide = 'keep';
  }
  function dive(ctx, z) {
    if (S.side !== 'keep' || S.dive !== 9) return;
    if (S.phase !== 'tell' && S.phase !== 'run' && S.phase !== 'fly') return;
    S.dive = z; S.diveAt = S.mT; S.lastDive = z; S.hint = Math.max(0, S.hint - 0.3);
    ctx.sfx(z === 0 ? 'grab' : 'whoosh');
  }
  function micoKicks(ctx) {
    // a keeper who moves long before the kick shows Mico the way (later rounds only)
    if (!ctx.easy && S.nMico >= 2 && S.dive !== 9 && S.diveAt < S.kickAt - 0.35 && S.r() < 0.6) {
      const z = S.dive === 0 ? (S.r() < 0.5 ? -1 : 1) : (S.r() < 0.5 ? -S.dive : 0);
      if (z !== S.mZone) { S.mZone = z; S.mTx = z * (0.62 + S.r() * 0.2) + (z === 0 ? (S.r() - 0.5) * 0.3 : 0); S.saw = true; }
    }
    ctx.sfx('kick');
    S.phase = 'fly'; S.phaseT = 0; S.flyT = 0; S.flyDur = ctx.easy ? 0.8 : 0.66;
    S.mOutcome = S.r() < (ctx.easy ? 0.15 : 0.07) ? (S.r() < 0.5 ? 'mwide' : 'mover') : '';
    if (S.mOutcome === 'mwide') S.mTx = (S.mTx < 0 ? -1 : 1) * 1.25;
    if (S.mOutcome === 'mover') S.mTy = 1.3;
  }
  function keepResult(ctx) {
    let goal = true;
    const reached = S.dive !== 9 && S.diveAt <= S.kickAt + S.flyDur - 0.12;
    const zone = reached ? S.dive : 0;   // no dive: Cappy stands in the middle
    if (S.mOutcome) { goal = false; ctx.sfx('miss'); say(ctx, 'bk.micoMissed', '#8ee070'); }
    else if (zone === S.mZone && S.r() < (ctx.easy ? 0.97 : 0.92)) { goal = false; }
    if (S.mOutcome) { /* said above */ }
    else if (!goal) { S.saves++; ctx.sfx('bkSave'); ctx.sfx('cheer'); say(ctx, 'bk.youSaved', '#8ee070'); S.cheer = 1.2; UI.burst(L.kx + S.dive * ctx.W * 0.28, L.ky - 20, 14, '#8ee070', 70); }
    else { ctx.sfx('bkNet'); say(ctx, S.saw ? 'bk.sawYou' : 'bk.micoScores', '#ffb3d6'); S.shake = 0.25; }
    S.keepSaved = !goal;
    record('mico', goal);
    S.phase = 'res'; S.phaseT = 0; S.nextSide = 'shoot';
  }
  function afterResult(ctx) {
    const w = decided();
    if (w) { endMatch(ctx, w === 'you'); return; }
    if (kicksTaken() >= 30) { endMatch(ctx, S.gYou >= S.gMico); return; }
    if (S.nYou === REG && S.nMico === REG && S.nextSide === 'shoot') UI.banner(t('bk.sudden'), '#ffd23f', 1.4);
    S.phase = 'wipe'; S.phaseT = 0;
  }
  function endMatch(ctx, won) {
    if (S.over) return;
    S.over = true; S.won = won; S.phase = 'end'; S.phaseT = 0; S.cheer = won ? 2 : 0;
    if (won) { ctx.sfx('cheer'); UI.confetti(ctx.W / 2, ctx.H * 0.3, 40); UI.banner(t('bk.youWin'), '#8ee070', 1.4); }
    else { ctx.sfx('bkHoot'); UI.banner(t('bk.micoWins'), '#ffb3d6', 1.4); }
  }
  function finishMatch(ctx) {
    const won = S.won, margin = S.gYou - S.gMico;
    const stars = won ? 1 + (margin >= 2 ? 1 : 0) + (margin >= 3 || (margin >= 2 && S.saves >= 3) ? 1 : 0) : 0;
    const score = S.gYou * 200 + S.saves * 150 + S.corners * 50 + (won ? 600 + Math.max(0, margin) * 100 : 0);
    ctx.finish({ score, stars, won, frac: won ? [0.34, 0.67, 1][stars - 1] : Math.min(0.3, S.gYou / REG * 0.3), stats: { you: S.gYou, mico: S.gMico, saves: S.saves } });
  }

  /* ---------- update ---------- */
  function update(dt, ctx) {
    S.ctx = ctx; layout(ctx);
    S.phaseT += dt;
    if (S.msgT > 0) S.msgT -= dt;
    if (S.shake > 0) S.shake -= dt;
    if (S.cheer > 0) S.cheer -= dt;
    if (S.side === 'shoot') {
      if (S.phase === 'aim') {
        S.idleT += dt;
        const dx = INPUT.dirX();
        if (dx && !S.meterOn) S.aimX = clamp(S.aimX + dx * 1.25 * dt, -1.2, 1.2);
        if (S.meterOn) { S.meter += S.meterDir * dt * (ctx.easy ? 0.85 : 1.05); if (S.meter >= 1.15) { S.meter = 1.15; S.meterDir = -1; } if (S.meter <= 0) { S.meter = 0; S.meterDir = 1; } }
        if (S.auto) { S.botT -= dt; if (S.botT <= 0) { const side = S.lastZone === 1 ? -1 : S.lastZone === -1 ? 1 : (S.r() < 0.5 ? -1 : 1); kick(ctx, side * 0.78, 0.84); } }
        // standing still too long: Cappy taps a soft one at the middle
        else if (S.idleT > 10 && !S.drag && !S.meterOn) { say(ctx, 'bk.tooSlow', '#ffe9a0'); kick(ctx, 0, 0.3); }
      } else if (S.phase === 'kick') {
        S.runT += dt;
        if (S.runT >= 0.22) { S.phase = 'fly'; S.phaseT = 0; S.flyT = 0; ctx.sfx('kick'); UI.burst(L.bx, L.by, 6, '#c9f08a', 40); }
      } else if (S.phase === 'fly') {
        S.flyT += dt;
        if (S.flyT > 0.1) S.kDiveT = Math.min(1, S.kDiveT + dt / Math.max(0.2, S.flyDur - 0.12));
        if (S.flyT >= S.flyDur) shootResult(ctx);
      }
    } else {
      S.mT += dt;
      if (S.phase === 'setup' && S.mT >= 0.7) { S.phase = 'tell'; S.phaseT = 0; }
      if (S.phase === 'tell' && S.mT >= S.kickAt - 0.55) { S.phase = 'run'; S.phaseT = 0; }
      if (S.phase === 'run' && S.mT >= S.kickAt) micoKicks(ctx);
      if (S.phase === 'fly') { S.flyT += dt; if (S.flyT >= S.flyDur) keepResult(ctx); }
      // the bot reads Mico's real look (a sloppy bot, for balance runs, guesses some of the time)
      if (S.auto && S.dive === 9 && S.phase === 'fly' && S.flyT > 0.08) dive(ctx, S.sigma && S.r() < S.sigma * 2 ? ((S.r() * 3) | 0) - 1 : S.tellB);
    }
    if (after(S.phase)) S.flyT += dt;
    if (S.phase === 'res') { if (S.phaseT > 1.35) afterResult(ctx); }
    else if (S.phase === 'wipe') {
      if (S.phaseT >= 0.25 && S.side !== S.nextSide) { if (S.nextSide === 'keep') startKeep(ctx); else startShoot(ctx); S.phase = 'wipe'; S.phaseT = 0.25; }
      if (S.phaseT >= 0.5) { S.phase = S.side === 'keep' ? 'setup' : 'aim'; S.phaseT = 0; if (S.side === 'keep') S.mT = 0; }
    } else if (S.phase === 'end' && S.phaseT > 1.4) { S.phase = 'done'; finishMatch(ctx); }
  }

  /* ---------- input ---------- */
  function onInput(e, ctx) {
    if (S.side === 'shoot') {
      if (S.phase !== 'aim') return;
      if (e.type === 'press') {
        if (e.key === 'a' || e.key === 'up') {
          S.idleT = 0;
          if (!S.meterOn) { S.meterOn = true; S.meter = 0; S.meterDir = 1; ctx.sfx('blip'); }
          else { S.meterOn = false; kick(ctx, S.aimX, S.meter); }
        }
      } else if (e.type === 'down') {
        if (S.drag) return;
        S.drag = true; S.dragId = e.id; S.dsx = e.x; S.dsy = e.y; S.dx = 0; S.dy = 0; S.meterOn = false; S.idleT = 0;
      } else if (e.type === 'move' && S.drag && e.id === S.dragId) { S.dx = e.x - S.dsx; S.dy = e.y - S.dsy; }
      else if (e.type === 'up' && S.drag && e.id === S.dragId) {
        S.drag = false; S.dx = e.x - S.dsx; S.dy = e.y - S.dsy;
        if (e.cancel) return;
        if (-S.dy >= 10) kick(ctx, dragAim(), dragPower());
        else if (Math.abs(S.dx) + Math.abs(S.dy) < 6) UI.float(L.bx, L.by - 30, t('bk.dragHint'), '#ffe9a0');
      }
      return;
    }
    // keeping
    if (e.type === 'press') {
      if (e.key === 'left') dive(ctx, -1); else if (e.key === 'right') dive(ctx, 1);
      else if (e.key === 'down' || e.key === 'a' || e.key === 'up') dive(ctx, 0);
    } else if (e.type === 'down') {
      const id = UI.hitAt(e.x, e.y);
      if (id === 'kdl') dive(ctx, -1); else if (id === 'kdr') dive(ctx, 1); else if (id === 'kdc') dive(ctx, 0);
    } else if (e.type === 'tap') {
      if (UI.hitAt(e.x, e.y)) return;
      dive(ctx, e.x < ctx.W / 3 ? -1 : e.x > ctx.W * 2 / 3 ? 1 : 0);
    } else if (e.type === 'swipe') dive(ctx, e.dir === 'left' ? -1 : e.dir === 'right' ? 1 : 0);
  }
  /** The drag, copied onto the ball (and stretched so a comfortable drag reaches the bar), is where the ball goes:
   *  across = the aim, up = the height and power (past the bar = over). What the marker shows is what you get. */
  const dragGain = () => Math.max(1, (L.by - L.gy0) / Math.max(60, ctx0().H * 0.34));
  function dragAim() { return clamp((S.dx * dragGain()) / (L.gw / 2), -1.3, 1.3); }
  function dragPower() { const ty = (L.gy1 - (L.by + S.dy * dragGain())) / L.gh; return clamp((ty - 0.06) / 0.86, 0, 1.15); }
  const ctx0 = () => S.ctx;

  /* ---------- drawing ---------- */
  function buildBgs(ctx) {
    const W = ctx.W, H = ctx.H, D = JC.draw, K = S.K;
    S.bgW = W; S.bgH = H; S.bgGen = VIEW.gen; S.bgK = K;
    // --- the shooting view: canopy, crowd on a log fence, the striped pitch and the box lines ---
    let c = JC.canvas2(W, H), g = c.getContext('2d');
    const hz = L.gy1 - Math.round(L.gh * 0.25);
    sky(g, W, hz - 6);
    crowd(g, W, hz - 4, K);
    for (let y = hz; y < H; y++) { const k = (y - hz) / (H - hz), band = Math.floor(Math.pow(k, 0.7) * 9); g.fillStyle = band % 2 ? '#4fa83f' : '#5cb848'; g.fillRect(0, y, W, 1); }
    // box lines in perspective: the goal line, the six-yard box, the penalty spot
    const lineC = '#f4f0dc';
    rect(g, 0, L.gy1, W, 1, lineC);
    const bxw = L.gw * 0.72, byy = L.gy1 + Math.round((L.by - L.gy1) * 0.28);
    D.line(g, L.gx - L.gw / 2 - 2, L.gy1, L.gx - bxw / 2 - 18, byy, lineC); D.line(g, L.gx + L.gw / 2 + 2, L.gy1, L.gx + bxw / 2 + 18, byy, lineC);
    rect(g, L.gx - bxw / 2 - 18, byy, bxw + 36, 1, lineC);
    D.line(g, 0, L.gy1 + Math.round((L.by - L.gy1) * 0.62), W, L.gy1 + Math.round((L.by - L.gy1) * 0.62), 'rgba(244,240,220,0.0)');
    D.oval(g, L.bx, L.by + 3, 4, 1, lineC);
    // the net (behind the keeper): vines in a diamond weave with leaves
    const gx0 = L.gx - L.gw / 2, gy0 = L.gy0;
    rect(g, gx0, gy0, L.gw, L.gh, 'rgba(18,53,36,0.55)');
    g.fillStyle = 'rgba(182,227,93,0.55)';
    for (let i = -L.gh; i < L.gw + L.gh; i += 6) for (let j = 0; j < L.gh; j++) { const x1 = gx0 + i + j, x2 = gx0 + i + L.gh - j; if (x1 >= gx0 && x1 < gx0 + L.gw) g.fillRect(x1, gy0 + j, 1, 1); if (x2 >= gx0 && x2 < gx0 + L.gw) g.fillRect(x2, gy0 + j, 1, 1); }
    for (let i = 0; i < 9; i++) spr(g, SPRITES.leaf, gx0 + 4 + ((i * 37) % (L.gw - 10)), gy0 + 3 + ((i * 13) % (L.gh - 10)));
    S.bgShoot = c;
    // --- the keeping view: from the goal line looking out at the pitch ---
    c = JC.canvas2(W, H); g = c.getContext('2d');
    sky(g, W, L.ground - 6);
    crowd(g, W, L.ground - 4, K);
    for (let y = L.ground; y < H; y++) { const k = (y - L.ground) / (H - L.ground), band = Math.floor(Math.pow(k, 0.7) * 10); g.fillStyle = band % 2 ? '#4fa83f' : '#5cb848'; g.fillRect(0, y, W, 1); }
    // the box seen from the goal: its far line, and the spot under Mico
    const far = L.ground + Math.round((L.my - L.ground) * 0.35);
    rect(g, Math.round(W * 0.18), far, Math.round(W * 0.64), 1, lineC);
    D.line(g, Math.round(W * 0.18), far, -10, L.ky + 20, lineC); D.line(g, Math.round(W * 0.82), far, W + 10, L.ky + 20, lineC);
    D.oval(g, L.mx, L.my + 2, 4, 1, lineC);
    rect(g, 0, L.ky + 4, W, 2, lineC);
    S.bgKeep = c;
  }
  function sky(g, W, hz) {
    for (let y = 0; y < hz; y++) { const k = y / Math.max(1, hz); g.fillStyle = k < 0.35 ? '#8fd8f0' : k < 0.6 ? '#b8ecf0' : '#d8f4d8'; g.fillRect(0, y, W, 1); }
    // far jungle hills and the treeline
    for (let x = 0; x < W; x++) { const h1 = 10 + Math.round(Math.sin(x / 23) * 4 + Math.sin(x / 9) * 2); g.fillStyle = '#5fae7a'; g.fillRect(x, hz - h1 - 8, 1, h1 + 8); }
    for (let x = -10; x < W + 10; x += 13) { const r = 6 + (JC.hash(x, 3, 7) * 5 | 0); JC.draw.disc(g, x, hz - 10, r, '#2f7d3c'); JC.draw.disc(g, x - 2, hz - 12, r - 3, '#4fa83f'); }
    // palm trunks at the sides
    for (const px of [8, W - 12]) { g.fillStyle = '#8a5a33'; g.fillRect(px, Math.max(0, hz - 60), 4, 60); g.fillStyle = '#5e3a20'; for (let y = hz - 58; y < hz; y += 5) g.fillRect(px, y, 4, 1); JC.draw.disc(g, px + 2, Math.max(4, hz - 62), 9, '#2f7d3c'); JC.draw.disc(g, px - 4, Math.max(6, hz - 58), 6, '#4fa83f'); JC.draw.disc(g, px + 8, Math.max(6, hz - 58), 6, '#4fa83f'); }
  }
  const FANS = ['marmoset', 'mango', 'ant', 'zuzu', 'coco_down', 'pip_down', 'ant2', 'marmoset', 'tapir', 'elder'];
  function crowd(g, W, y, K) {
    // a log fence with fans and leaf flags in Mico's colour
    rect(g, 0, y - 3, W, 5, '#7a4a26'); rect(g, 0, y - 3, W, 1, '#b07a44'); rect(g, 0, y + 1, W, 1, '#4f2e17');
    for (let x = 4; x < W; x += 26) rect(g, x, y - 7, 3, 9, '#6e4325');
    let i = 0;
    for (let x = 14; x < W - 8; x += 30) {
      const s = SPRITES[FANS[i++ % FANS.length]]; if (!s) continue;
      g.drawImage(s.c, x, y - 3 - s.h);
      if (i % 3 === 0) spr(g, SPRITES.bk_flag, x + s.w - 2, y - 3 - s.h - 6);
    }
  }
  /** A sprite drawn turned by quarter turns (q = 0..3) around its centre: crisp, since it is a whole quarter. */
  function rot(g, s, cx, cy, k, q, flip) {
    if (!s) return;
    if (!q) { g.drawImage(flip ? s.f : s.c, Math.round(cx - s.w * k / 2), Math.round(cy - s.h * k / 2), s.w * k, s.h * k); return; }
    g.save(); g.translate(Math.round(cx), Math.round(cy)); g.rotate(q * Math.PI / 2);
    g.drawImage(flip ? s.f : s.c, -Math.round(s.w * k / 2), -Math.round(s.h * k / 2), s.w * k, s.h * k); g.restore();
  }
  function drawBall(g, x, y, r) {
    const s = ((S.flyT * 14) | 0) % 2 ? SPRITES.bk_ball2 : SPRITES.bk_ball;
    if (r >= 4) { const k = Math.max(1, Math.round(r * 2 / 9)); g.drawImage(s.c, Math.round(x - s.w * k / 2), Math.round(y - s.h * k / 2), s.w * k, s.h * k); return; }
    JC.draw.disc(g, x, y, r + 1, OUT); JC.draw.disc(g, x, y, r, '#ffe14a'); if (r > 1) g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 1, 1);
  }
  function drawPosts(g, x0, y0, w, h, k) {
    // bamboo posts and crossbar: light green with darker rings
    const th = Math.max(3, Math.round(h / 14));
    for (const px of [x0 - th, x0 + w]) { rect(g, px - 1, y0 - th - 1, th + 2, h + th + 2, OUT); rect(g, px, y0 - th, th, h + th, '#c9e07a'); rect(g, px + th - 1, y0 - th, 1, h + th, '#8aa848'); for (let yy = y0 + 4; yy < y0 + h; yy += 9) rect(g, px, yy, th, 1, '#7a9a3a'); }
    rect(g, x0 - th - 1, y0 - th - 1, w + th * 2 + 2, th + 2, OUT); rect(g, x0 - th, y0 - th, w + th * 2, th, '#c9e07a'); rect(g, x0 - th, y0 - 1, w + th * 2, 1, '#8aa848');
    for (let xx = x0 + 6; xx < x0 + w; xx += 12) rect(g, xx, y0 - th, 1, th, '#7a9a3a');
    void k;
  }
  /** The shooting view. */
  function drawShoot(g, ctx) {
    g.drawImage(S.bgShoot, 0, 0);
    const K = S.K, ks = L.ks, fly = !!S.outcome && (S.phase === 'fly' || after(S.phase));
    const u = fly ? clamp(S.flyT / S.flyDur, 0, 1.6) : 0;
    // the keeper: swaying in the middle, then the dive
    const gx0 = L.gx - L.gw / 2;
    const ms = SPRITES.bk_mico_ready, mw = ms.w * ks, mh = ms.h * ks;
    let kx = L.gx + Math.round(Math.sin(ctx.t * 2.4) * L.gw * 0.05), ky = L.gy1 - mh / 2 + ks * 2, q = 0, flip = false;
    if (fly) {
      const k = easeOut(clamp(S.kDiveT, 0, 1));
      const tx = L.gx + S.kDiveX * L.gw / 2, ty = L.gy1 - S.kDiveY * L.gh;
      kx = lerp(kx, tx, k); ky = lerp(ky, S.kDive === 0 ? ty - mh * 0.2 : ty, k);
      if (S.kDive !== 0 && k > 0.25) { q = S.kDive < 0 ? 3 : 1; }
      if (after(S.phase) && S.kDive !== 0 && S.flyT > S.flyDur + 0.5) ky = Math.min(L.gy1 - mw / 2 + ks * 2, ky + (S.flyT - S.flyDur - 0.5) * 120);
      // his whole dive stays inside the posts (lying down he is as wide as he is tall)
      const half = (q ? mh : mw) / 2 + 1;
      kx = clamp(kx, gx0 + half, gx0 + L.gw - half);
    }
    const mSpr = after(S.phase) && S.outcome !== 'goal' && S.flyT > S.flyDur + 0.6 ? SPRITES.bk_mico_cheer : (((ctx.t * 3) | 0) % 2 && !fly ? SPRITES.bk_mico_ready2 : ms);
    JC.draw.shadow(g, Math.round(kx), L.gy1 + 1, Math.round(mw * 0.3));
    // a goal goes in behind the keeper: draw the ball first when it is past him
    const tx = L.gx + S.tx * L.gw / 2, ty = L.gy1 - S.ty * L.gh;
    let bx = L.bx, by = L.by, br = 4 * K;
    if (fly) {
      if (S.outcome === 'save' && u >= 1) { const k2 = Math.min(1, (u - 1) * 2); bx = tx + S.kDive * 8 * k2 + (S.kDive === 0 ? 10 * k2 : 0); by = ty + 40 * k2 * k2; br = Math.max(1, Math.round(2 * K)); }
      else if (S.outcome === 'post' && u >= 1) { const k2 = (u - 1); bx = tx + (S.tx > 0 ? 1 : -1) * 70 * k2; by = ty + 30 * k2 - 30 * k2 * (1 - k2); br = 2 * K; }
      else if (S.outcome === 'goal' && u >= 1) { bx = tx; by = Math.min(L.gy1 - 2, ty + (u - 1) * 60); br = Math.max(1, 2 * K - 1); }
      else { const uu = Math.min(u, 1.4); bx = lerp(L.bx, tx, uu) + Math.sin(Math.PI * Math.min(uu, 1)) * S.curve; by = lerp(L.by, ty, uu) - Math.sin(Math.PI * Math.min(uu, 1)) * S.arc; br = Math.max(1, Math.round(lerp(4 * K, 1.6 * K, Math.min(uu, 1)))); }
    }
    const behind = fly && u >= 1 && S.outcome === 'goal';
    if (behind) drawBall(g, bx, by, br);
    rot(g, mSpr, kx, ky, ks, q, flip);
    drawPosts(g, gx0, L.gy0, L.gw, L.gh, K);
    // the aim: a marker in the goal and a dotted line (keys), or the drag's line (touch)
    if (S.phase === 'aim') {
      const ax = S.drag ? dragAim() : S.aimX, p = S.drag ? dragPower() : S.meterOn ? S.meter : 0.75;
      const mx = L.gx + ax * L.gw / 2, my = L.gy1 - clamp(0.06 + p * 0.86, 0, 1.2) * L.gh;
      const show = S.drag ? -S.dy >= 6 : true;
      if (show) {
        const blink = ((ctx.t * 6) | 0) % 2;
        for (let i = 1; i < 10; i++) { const k = i / 10; g.fillStyle = 'rgba(255,248,232,0.75)'; g.fillRect(Math.round(lerp(L.bx, mx, k)), Math.round(lerp(L.by, my, k) - Math.sin(Math.PI * k) * 8), 2, 2); }
        const col = p > 1.0 ? '#ff5a5a' : p > 0.93 ? '#ffd23f' : '#8ee070';
        rect(g, mx - 5, my, 4, 1, col); rect(g, mx + 2, my, 4, 1, col); rect(g, mx, my - 5, 1, 4, col); rect(g, mx, my + 2, 1, 4, col);
        if (blink) rect(g, mx - 1, my - 1, 3, 3, col);
      }
    }
    // Cappy at the ball, from behind
    const cs = L.cs, cx = L.bx - 7 * cs - 3 + (S.phase === 'kick' ? Math.round(S.runT / 0.22 * 6 * K) : S.phase === 'aim' ? 0 : 6 * K);
    const cSpr = S.phase === 'kick' ? (S.runT > 0.12 ? SPRITES.bk_cappy_kick : SPRITES.bk_cappy_step) : (after(S.phase) && S.outcome === 'goal') ? SPRITES.bk_cappy_cheer : S.phase === 'fly' ? SPRITES.bk_cappy_kick : SPRITES.bk_cappy_stand;
    JC.draw.shadow(g, cx, L.by + 8 * K, 7 * K);
    const hop = after(S.phase) && S.outcome === 'goal' ? Math.round(Math.abs(Math.sin(S.flyT * 9)) * 5 * K) : 0;
    JC.sprK(g, cSpr, cx - cSpr.w * cs / 2, L.by + 9 * K - cSpr.h * cs - hop, cs);
    if (!behind) drawBall(g, bx, by, br);
    // the power meter (keys) or the drag's power, beside the ball
    if (S.phase === 'aim' && (S.meterOn || S.drag)) drawPower(g, L.bx + 14 * K, L.by - 40 * K, S.drag ? dragPower() : S.meter, K);
  }
  function drawPower(g, x, y, p, K) {
    const h = 40 * K, w = 7 * K;
    JC.draw.box(g, x - 1, y - 1, w + 2, h + 2, '#2a2238', PAL.ink);
    const z = v => y + h - Math.round(v / 1.15 * h);
    rect(g, x + 1, z(1.15), w - 2, z(1.0) - z(1.15), 'rgba(255,90,90,0.45)');
    rect(g, x + 1, z(1.0), w - 2, z(0.93) - z(1.0), 'rgba(255,210,63,0.45)');
    rect(g, x + 1, z(0.93), w - 2, z(0.55) - z(0.93), 'rgba(142,224,112,0.45)');
    const fy = z(clamp(p, 0, 1.15)), col = p > 1.0 ? '#ff5a5a' : p > 0.93 ? '#ffd23f' : p >= 0.55 ? '#8ee070' : '#fff8e8';
    rect(g, x + 1, fy, w - 2, y + h - fy, col); rect(g, x, fy - 1, w, 2, PAL.white);
  }
  /** The keeping view. */
  function drawKeep(g, ctx) {
    g.drawImage(S.bgKeep, 0, 0);
    const K = S.K, W = ctx.W;
    // Mico on the spot: standing with his tell, then the run-up and the kick
    const tell = tellNow(), sideIx = tell === 9 ? 1 : tell + 1;
    let ms = SPRITES.bk_mico_look, my = L.my, mx = L.mx;
    // the wind-up: he leans toward the side he means (with his eyes and his tail); straight up and down for the middle
    if (S.phase === 'tell') { ms = SPRITES['bk_mico_s' + sideIx]; mx += tell === 9 ? 0 : tell * 3 * L.mk; if (tell === 0) my -= Math.round(Math.abs(Math.sin(S.mT * 6)) * 2 * L.mk); }
    else if (S.phase === 'run') { const tl = S.tellB + 1; ms = ((S.phaseT * 9) | 0) % 2 ? SPRITES['bk_mico_r1' + tl] : SPRITES['bk_mico_r2' + tl]; my = L.my - Math.round((1 - S.phaseT / 0.55) * 12); }
    else if (S.phase === 'fly' || after(S.phase)) ms = (after(S.phase) && !S.keepSaved && S.flyT > S.flyDur + 0.35) ? SPRITES.bk_mico_cheer : SPRITES['bk_mico_k' + (S.tellB + 1)];
    const mk = L.mk;
    JC.draw.shadow(g, mx, L.my + 2, 6 * mk);
    const hopM = ms === SPRITES.bk_mico_cheer ? Math.round(Math.abs(Math.sin(ctx.t * 9)) * 4 * mk) : 0;
    JC.sprK(g, ms, mx - ms.w * mk / 2, my - (ms.h - 2) * mk - hopM, mk);
    // the ball: at Mico's feet, then flying at the camera
    const fly = S.phase === 'fly' || after(S.phase);
    const u = fly ? S.flyT / S.flyDur : 0;
    const tx = W / 2 + S.mTx * W * 0.36, ty = L.ky - 10 * K - S.mTy * (L.ky - L.ground) * 0.75;
    let bx = mx + 4 * mk, by = L.my - 2 * mk, br = Math.max(2, Math.round(1.5 * mk));
    if (fly) {
      if (after(S.phase) && S.keepSaved && !S.mOutcome) { const k2 = Math.min(1, (S.flyT - S.flyDur) * 2); bx = tx + S.dive * -30 * k2; by = ty - 20 * k2 + 50 * k2 * k2; br = Math.round(lerp(8 * K, 4 * K, k2)); }
      else { const uu = Math.min(u, 1.25); bx = lerp(mx + 4 * mk, tx, uu); by = lerp(L.my - 2 * mk, ty, uu) - Math.sin(Math.PI * Math.min(uu, 1)) * 14; br = Math.max(2, Math.round(lerp(1.5 * mk, 9 * K, uu * uu))); }
    }
    // Cappy on the goal line from behind: arms out, then the dive
    const cS = SPRITES.bk_cappy_keep, cs = L.kcs;
    let cx = L.kx + Math.round(Math.sin(ctx.t * 3) * 3), cy = L.ky - cS.h * cs / 2 + 4 * K, q = 0;
    if (S.dive !== 9) {
      const k = easeOut(clamp((S.mT - S.diveAt) / 0.28, 0, 1));
      if (S.dive === 0) cy -= Math.round(Math.sin(k * Math.PI) * 14 * K);
      else {
        // a dive stays on screen and above the dive buttons (lying down, Cappy is as wide as the sprite is tall)
        const hw = cS.h * cs / 2, hh = cS.w * cs / 2, reach = Math.min(W * 0.28, W / 2 - hw - 2);
        cx = lerp(L.kx, L.kx + S.dive * reach, k); cy = lerp(cy, Math.min(L.ky - 14 * K, L.bottom - hh - 2), k); if (k > 0.3) q = S.dive < 0 ? 3 : 1;
      }
    }
    const ballFirst = !(u > 0.8 && !S.keepSaved);
    if (ballFirst) drawBall(g, bx, by, br);
    JC.draw.shadow(g, Math.round(cx), L.ky + 6 * K, 9 * K);
    rot(g, after(S.phase) && S.keepSaved && S.flyT > S.flyDur + 0.5 ? SPRITES.bk_cappy_cheer : cS, cx, cy, cs, q, false);
    if (!ballFirst) drawBall(g, bx, by, br);
    // the goal around us: posts at the edges, the bar at the top, a bit of net
    const th = Math.max(5, 4 * K);
    g.fillStyle = 'rgba(182,227,93,0.35)';
    for (let y = L.bar; y < L.ky; y += 6) { g.fillRect(0, y, L.postL, 1); g.fillRect(L.postR, y, W - L.postR, 1); }
    rect(g, L.postL - th, L.bar - th, th + 1, L.ky - L.bar + th + 6, OUT); rect(g, L.postL - th + 1, L.bar - th + 1, th - 1, L.ky - L.bar + th + 4, '#c9e07a');
    rect(g, L.postR, L.bar - th, th + 1, L.ky - L.bar + th + 6, OUT); rect(g, L.postR + 1, L.bar - th + 1, th - 1, L.ky - L.bar + th + 4, '#c9e07a');
    rect(g, L.postL - th, L.bar - th, L.postR - L.postL + th * 2 + 1, th + 1, OUT); rect(g, L.postL - th + 1, L.bar - th + 1, L.postR - L.postL + th * 2 - 1, th - 1, '#c9e07a');
    for (let x = L.postL + 10; x < L.postR; x += 16) rect(g, x, L.bar - th + 1, 1, th - 1, '#7a9a3a');
    // the touch dive buttons
    if (ctx.touch && !S.over) drawDiveButtons(g, ctx);
  }
  function drawDiveButtons(g, ctx) {
    const bh = Math.max(24, ctx.tap), gap = 6, bw = Math.min(110, Math.floor((ctx.W - 16 - gap * 2) / 3)), y = ctx.H - bh - 6;
    const x0 = Math.round((ctx.W - (bw * 3 + gap * 2)) / 2), on = S.dive === 9 && (S.phase === 'tell' || S.phase === 'run' || S.phase === 'fly');
    B_L.disabled = !on; B_C.disabled = !on; B_R.disabled = !on;
    UI.button(g, 'kdl', x0, y, bw, bh, t('bk.diveL'), B_L);
    UI.button(g, 'kdc', x0 + bw + gap, y, bw, bh, t('bk.stay'), B_C);
    UI.button(g, 'kdr', x0 + (bw + gap) * 2, y, bw, bh, t('bk.diveR'), B_R);
  }
  function drawBoard(g, ctx) {
    // the penalty tally: a row of balls for each side (the last five in sudden death)
    const l = HUD.left(), w = Math.min(ctx.W - l - 6, 150), x = l, y = 4, h = 27;
    JC.draw.box(g, x, y, w, h, 'rgba(27,19,37,0.82)', PAL.ink);
    const nameW = Math.min(40, Math.round(w * 0.32)), dots = w - nameW - 30, step = Math.max(8, Math.min(12, Math.floor(dots / 5)));
    const from = Math.max(0, Math.max(S.nYou, S.nMico) - 5 + (S.nYou === S.nMico ? 0 : 0));
    for (let row = 0; row < 2; row++) {
      const yy = y + 2 + row * 12, arr = row ? S.mico : S.you, n = row ? S.nMico : S.nYou;
      text(g, t(row ? 'name.mico' : 'name.cappy'), x + 4, yy, row ? T_NM : T_NY);
      for (let i = 0; i < 5; i++) {
        const ix = from + i, cx = x + nameW + 6 + i * step + 3, cy = yy + 5, v = ix < n ? arr[ix] : 0;
        JC.draw.disc(g, cx, cy, 3, OUT);
        JC.draw.disc(g, cx, cy, 2, v === 1 ? '#6ad34a' : v === 2 ? '#e8553d' : '#5c5670');
        if (v === 0 && ix === n && !S.over && ((row === 0) === (S.side === 'shoot'))) { g.globalAlpha = 0.5 + 0.5 * Math.sin(ctx.t * 8); JC.draw.disc(g, cx, cy, 2, PAL.r4); g.globalAlpha = 1; }
      }
      text(g, label(row ? 'bk.gM' : 'bk.gY', row ? S.gMico : S.gYou), x + w - 4, yy, T_R);
    }
  }
  function draw(g, ctx) {
    layout(ctx);
    buildCappySprites();
    if (!S.bgShoot || S.bgGen !== VIEW.gen || S.bgW !== ctx.W || S.bgH !== ctx.H || S.bgK !== S.K) buildBgs(ctx);
    const sh = S.shake > 0 && !BRBX.reduced() ? Math.round(Math.sin(S.shake * 60) * 2) : 0;
    if (sh) { g.save(); g.translate(sh, 0); }
    if (S.side === 'shoot') drawShoot(g, ctx); else drawKeep(g, ctx);
    if (sh) g.restore();
    // the leafy wipe between shooting and keeping
    if (S.phase === 'wipe') {
      const k = S.phaseT < 0.25 ? S.phaseT / 0.25 : 1 - (S.phaseT - 0.25) / 0.25, w = Math.round(ctx.W * k);
      rect(g, 0, 0, w, ctx.H, '#2f7d3c');
      for (let y = -4; y < ctx.H; y += 10) spr(g, SPRITES.leaf, w - 3, y + ((y / 10) & 1) * 4);
    }
    drawBoard(g, ctx);
    // the round, and what to do
    // during the wipe: the kick just taken, then (once the view has changed sides) the next one, never "Kick 0"
    const pre = S.phase === 'wipe' ? S.side === S.nextSide : !after(S.phase), round = S.side === 'shoot' ? S.nYou + (pre ? 1 : 0) : S.nMico + (pre ? 1 : 0);
    const ry = 35;
    if (!S.over) text(g, round > REG ? t('bk.suddenShort') : label('bk.round', Math.min(REG, round)), ctx.W / 2, ry, T_ROUND);
    const roleRoom = S.side === 'keep' || L.gy0 - 6 >= ry + 24;
    if (!S.over && roleRoom && (S.phase === 'aim' || S.phase === 'setup' || S.phase === 'tell' || S.phase === 'run')) {
      const role = S.side === 'shoot' ? 'bk.youShoot' : 'bk.youKeep';
      text(g, t(role), ctx.W / 2, ry + 12, T_C);
    }
    if (S.msgT > 0) { g.globalAlpha = clamp(S.msgT * 3, 0, 1); T_MSG.col = S.msgCol; T_MSG.scale = textW(S.msg, 2) > ctx.W - 12 ? 1 : 2; text(g, S.msg, ctx.W / 2, Math.round(ctx.H * 0.36), T_MSG); g.globalAlpha = 1; }
    // hints at the bottom
    const showHint = S.hint > 0.05 || ctx.firstTime;
    if (!S.over && showHint) {
      let hk = '';
      if (S.side === 'shoot' && S.phase === 'aim') hk = ctx.touch ? 'bk.hintShootTouch' : (S.meterOn ? 'bk.hintPowerKeys' : 'bk.hintShootKeys');
      else if (S.side === 'keep' && (S.phase === 'setup' || S.phase === 'tell' || S.phase === 'run')) hk = ctx.touch ? 'bk.hintKeepTouch' : 'bk.hintKeepKeys';
      if (hk) {
        const str = t(hk), h = JC.font.wrap(str, ctx.W - 12, 1).length * 12;
        // keeping: under the round's title, in the sky (Cappy fills the bottom); shooting: at the bottom
        const by = S.side === 'keep' ? ry + 28 : ctx.H - 3 - h;
        rect(g, 0, by - 3, ctx.W, h + 4, 'rgba(27,19,37,0.6)');
        textBlock(g, str, 6, by, ctx.W - 12, HINT);
      }
    }
  }

  /* ---------- the bot (tests): kicks for the corners, reads Mico's real look ---------- */
  JC.register({
    id: 'kick',
    champion: 'mico',
    music: 'kick',
    start(ctx) {
      S.ctx = ctx; S.r = S.seed ? JC.rng(S.seed) : ctx.rng; S.seed = 0;
      S.nYou = 0; S.nMico = 0; S.gYou = 0; S.gMico = 0; S.you.fill(0); S.mico.fill(0); S.saves = 0; S.corners = 0; S.lastZone = 9; S.lastDive = 9;
      S.over = false; S.won = false; S.msgT = 0; S.shake = 0; S.cheer = 0; S.crafty = false; S.auto = false; S.sigma = 0;
      S.hint = ctx.firstTime ? 2 : 1;
      layout(ctx);
      startShoot(ctx);
    },
    update,
    draw,
    onInput,
    outro(dt, ctx) { S.phaseT += dt; if (S.msgT > 0) S.msgT -= dt; void ctx; },
    testState() {
      return { side: S.side, phase: S.phase, you: S.gYou, mico: S.gMico, nYou: S.nYou, nMico: S.nMico, saves: S.saves, aimX: Math.round(S.aimX * 100) / 100,
        meterOn: S.meterOn, meter: Math.round(S.meter * 100) / 100, tell: tellNow(), dive: S.dive, outcome: S.outcome, mZone: S.mZone, over: S.over, won: S.won, auto: S.auto, drag: S.drag,
        layout: { bx: L.bx, by: L.by, gx: L.gx, gy0: L.gy0, gw: L.gw, gh: L.gh, W: ctx0() ? ctx0().W : 0, H: ctx0() ? ctx0().H : 0, S: VIEW.S } };
    },
    test: {
      auto(ctx, on) { S.auto = !!on; return S.auto; },
      seed(ctx, n) { S.r = JC.rng(n | 0 || 1); S.seed = n | 0; return true; },
      /** For balance runs: an extra aiming error (sloppy kicks). */
      sigma(ctx, v) { S.sigma = +v || 0; return S.sigma; },
    },
    cheat(won) {
      S.gYou = won ? 4 : 2; S.gMico = won ? 2 : 4; S.saves = won ? 2 : 1;
      return { score: S.gYou * 200 + S.saves * 150 + (won ? 800 : 0), stars: won ? 2 : 0, won, frac: won ? 0.67 : 0.12 };
    },
  });
})();
