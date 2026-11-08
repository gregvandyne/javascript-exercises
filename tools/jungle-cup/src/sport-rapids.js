// ======================================================================================================
// RAPIDS RUN vs the Otter Twins: a canoe race down a winding jungle river, seen from above and behind.
//   The canoe paddles forward by itself. Steer between 3 lanes (Left / Right, swipes, the arrow buttons, or a tap
//   left or right of the canoe). Jump (Up / Space / swipe up) over floating logs, duck (Down / swipe down) under low
//   branches, steer round rocks and crocodile snouts (harmless bonks that only slow you), and grab bubble boosts.
//   Four canoes race 1,350 m through four stretches of river: Lazy Bend, Croc Creek, Beaver Woods and Waterfall Run.
//   Further down come whirlpools (steer round: they spin you and slow you), beaver dams with one gap, curtains of
//   hanging vines (duck), small waterfalls (jump them for a big drop and a burst of speed), rolling logs that drift
//   across the lanes (jump or steer clear), and fast channels: a lane of quick water that pays to stay in.
//   Cappy, the Otter Twins (Ripple and Splash) and the marmoset crew race. Finish first to win.
// River units: d = metres down the river (0 = start), lanes 0 1 2. The camera follows Cappy's canoe.
// ======================================================================================================
(function () {
  const LEN = 1350, V0 = 14, VBOOST = 7, BOOST_T = 1.6, JUMP_T = 0.62, DUCK_T = 0.75, MAXOB = 340, VCHAN = 5;
  const LOG = 1, BRANCH = 2, ROCK = 3, CROC = 4, BUBBLE = 5, WHIRL = 6, DAM = 7, VINE = 8, FALL = 9, ROLL = 10, CHAN = 11;
  const KIND_NAMES = ['', 'log', 'branch', 'rock', 'croc', 'bubble', 'whirl', 'dam', 'vine', 'fall', 'roll', 'chan'];
  // the four stretches of river: where each starts, and its banks and water
  const SEC_D = [0, 320, 680, 1020];
  const SEC_BANK = [['#3d9a3a', '#2a7438'], ['#4f8a3a', '#3a6a2e'], ['#2f7a40', '#22603a'], ['#6a8a5a', '#55704a']];
  const SEC_MUD = ['#c79a5a', '#8a6a3a', '#9a6a3a', '#a8a090'];
  const SEC_WATER = [['#2373ad', '#2a7fbb', '#2f8cc6', '#3496cf'], ['#2a6f8a', '#30798f', '#3a8a9a', '#4092a0'], ['#1f6a9a', '#2576a6', '#2b84b4', '#318ec0'], ['#2580c0', '#2c8cca', '#3a9ad6', '#44a4de']];
  const secOf = d => d >= SEC_D[3] ? 3 : d >= SEC_D[2] ? 2 : d >= SEC_D[1] ? 1 : 0;
  const S = {
    d: 0, prevD: 0, lane: 1, lx: 1, v: V0, slow: 1, boostT: 0, jumpT: 0, jumpCD: 0, duckT: 0, inv: 0, shake: 0, bonks: 0, boosts: 0,
    raceT: 0, place: 1, done: false, finT: 0, auto: false, oi: 0, strokeT: 0, time: 0, hintT: 0, tipLog: false, tipBranch: false, tipRock: false,
    sec: 0, tips: 0, spins: 0, drops: 0, fastT: 0, chanOn: false,
    obs: [], nObs: 0, rivals: [], ctx: null, chans: [], nChan: 0,
    // layout (virtual px)
    laneW: 32, half: 56, amp: 20, ppm: 3, py: 300, ctrlH: 0, Z: 1, mid: 160, camY: 0,
  };
  for (let i = 0; i < MAXOB; i++) S.obs.push({ d: 0, kind: 0, lanes: 0, hit: 0, ph: 0, taken: false, len: 0 });

  /* ---------- art (built once) ---------- */
  function canoeRows() {
    const rows = [], W = 14, H = 28;
    for (let r = 0; r < H; r++) {
      const u = (r + 0.5) / H, hw = 7 * Math.pow(Math.sin(Math.PI * u), 0.5);
      let row = '';
      for (let x = 0; x < W; x++) {
        const dx = Math.abs(x + 0.5 - W / 2);
        let ch = '.';
        if (dx <= hw) {
          if (dx > hw - 1) ch = 'o';
          else if (dx > hw - 2) ch = (r >= 3 && r <= 4) || (r >= 23 && r <= 24) ? 'c' : x < W / 2 ? 'l' : 'w';
          else ch = r < 3 || r > 25 ? 'c' : r === 9 || r === 19 ? 's' : 'W';
        }
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }
  const CANOE = canoeRows();
  const canoePal = col => ({ o: OUT, l: shade(col, 0.3), w: shade(col, -0.28), W: '#c48a4c', s: '#6e4325', c: '#fff8e8' });
  sprite('rap_canoe_cappy', CANOE, canoePal('#e8553d'));
  sprite('rap_canoe_ripple', CANOE, canoePal('#3fb7ff'));
  sprite('rap_canoe_splash', CANOE, canoePal('#3fe0c0'));
  sprite('rap_canoe_marm', CANOE, canoePal('#e8b820'));
  const OTTER_BACK = [
    '...oo....oo...',
    '..obbo..obbo..',
    '..obbboobbbo..',
    '.obbbbbbbbbbo.',
    '.obbbbbbbbbbo.',
    '.oBbbbbbbbbBo.',
    '.ohhhhhhhhhho.',
    '.oHhhhhhhhhHo.',
    'obbbbbbbbbbbbo',
    'oBbbbbbbbbbbBo',
    '.oooooooooooo.'];
  sprite('rap_ripple', OTTER_BACK, { o: OUT, b: '#8a5a33', B: '#5e3a20', h: '#3fb7ff', H: '#2481c4' });
  sprite('rap_splash', OTTER_BACK, { o: OUT, b: '#9a6a3f', B: '#6a4426', h: '#3fe0c0', H: '#1f9a80' });
  sprite('rap_marm', [
    '.ww......ww.',
    'owwo....owwo',
    '.oggoooogg o',
    '.oggggggggo.',
    'oggggggggggo',
    '.oGgggggGGo.',
    'oGgyyyyyygGo',
    'oGggggggggGo',
    '.oooooooooo.'].map(r => r.replace(' ', 'g')), { o: OUT, g: '#9a948a', G: '#6a645a', w: '#f4f0e8', y: '#ff9b2e' });
  sprite('rap_rock', [
    '....oooo......',
    '..ooggGGoo....',
    '.oggwggGGGoo..',
    'oggwwgggGGGGo.',
    'ogwggggggGGGGo',
    'oggggggggGGGGo',
    'oGgggggGGGGGdo',
    '.oGGGGGGGGddo.',
    '..ooddddddoo..',
    '....oooooo....'], { o: OUT, g: '#8a8478', G: '#6a645a', w: '#c8c2b4', d: '#4a4640' });
  const CROC_PAL = { o: OUT, g: '#4f8a3a', G: '#2f5a24', y: '#e8e070', k: '#120e14', l: '#7cb84a', n: '#1f3a18' };
  sprite('rap_croc', [
    '..ooo....ooo....',
    '.oylko..oylko...',
    '.oggGo..oggGo...',
    'ooggggooggggooo.',
    'ogllgggggggggggo',
    'oggggggggggnggno',
    '.oGGGGGGGGGGGGo.',
    '..oooooooooooo..'], CROC_PAL);
  sprite('rap_croc2', [
    '................',
    '.ooooo..ooooo...',
    '.oggGo..oggGo...',
    'ooggggooggggooo.',
    'ogllgggggggggggo',
    'oggggggggggnggno',
    '.oGGGGGGGGGGGGo.',
    '..oooooooooooo..'], CROC_PAL);
  sprite('rap_beaver', [
    '..o....o..',
    '.obo..obo.',
    '.obbbbbbo.',
    'obkbbbbkbo',
    'obbbnnbbbo',
    '.obbwwbbo.',
    '.oBbbbbBo.',
    'oBBbbbbBBo',
    '.oooooooo.'], { o: OUT, b: '#9a6a3f', B: '#6a4426', k: '#120e14', n: '#3a2414', w: '#fff8e8' });
  sprite('rap_bubble', [
    '...ooooo...',
    '..owwbbbo..',
    '.owwbbbbbo.',
    'owwbbbbbbbo',
    'owbbbbbbbbo',
    'obbbbbbbbbo',
    'obbbbbbbbBo',
    'obbbbbbbBBo',
    '.obbbbbBBo.',
    '..oBBBBBo..',
    '...ooooo...'], { o: '#1f6aa0', w: '#ffffff', b: '#a8ecff', B: '#6fd0f0' });
  // bank plants: drawn once into small canvases
  function plant(w, h, fn) { const c = JC.canvas2(w, h); fn(c.getContext('2d')); return { c, f: c, w, h }; }
  const TREE = plant(26, 24, g => {
    disc(g, 13, 13, 10, PAL.g0); disc(g, 9, 10, 7, PAL.g1); disc(g, 17, 11, 7, PAL.g1); disc(g, 13, 15, 7, PAL.g1);
    disc(g, 10, 9, 4, PAL.g2); disc(g, 16, 9, 4, PAL.g2); disc(g, 13, 13, 4, PAL.g3); rect(g, 9, 7, 2, 1, PAL.g4); rect(g, 15, 7, 2, 1, PAL.g4); rect(g, 12, 11, 2, 1, PAL.g5);
  });
  const PALM = plant(24, 24, g => {
    const leaf = (x0, y0, x1, y1) => { line(g, x0, y0, x1, y1, PAL.g1); line(g, x0, y0 + 1, x1, y1 + 1, PAL.g3); };
    leaf(12, 12, 2, 6); leaf(12, 12, 22, 6); leaf(12, 12, 3, 19); leaf(12, 12, 21, 19); leaf(12, 12, 12, 1); leaf(12, 12, 12, 22);
    disc(g, 12, 12, 2, '#8a5a33'); rect(g, 11, 11, 1, 1, '#c48a4c');
  });
  const BUSH = plant(16, 12, g => { disc(g, 5, 7, 4, PAL.g1); disc(g, 10, 6, 5, PAL.g1); disc(g, 9, 5, 3, PAL.g3); disc(g, 5, 6, 2, PAL.g2); rect(g, 8, 3, 2, 1, PAL.g4); });
  const FLOWERS = plant(12, 10, g => { disc(g, 6, 6, 4, PAL.g2); rect(g, 3, 3, 2, 2, PAL.p3); rect(g, 8, 5, 2, 2, PAL.r4); rect(g, 5, 7, 2, 2, PAL.p4); rect(g, 4, 4, 1, 1, PAL.r5); });
  const REEDS = plant(10, 12, g => { for (let i = 0; i < 4; i++) { rect(g, 1 + i * 2, 3 + (i % 2) * 2, 1, 9, PAL.g3); rect(g, 1 + i * 2, 1 + (i % 2) * 2, 1, 3, '#8a5a33'); } });
  const DECOR = [TREE, PALM, BUSH, FLOWERS, REEDS, BUSH, TREE];
  // a mossy boulder and a dead tree for the later stretches
  const STONE = plant(16, 12, g => { disc(g, 8, 7, 6, '#6a645a'); disc(g, 7, 6, 4, '#8a8478'); rect(g, 5, 3, 3, 1, '#c8c2b4'); rect(g, 9, 9, 4, 1, '#4a4640'); rect(g, 4, 4, 4, 2, PAL.g2); });
  const SNAG = plant(18, 18, g => { line(g, 9, 17, 9, 4, '#5e3a20'); line(g, 10, 17, 10, 5, '#3a2414'); line(g, 9, 8, 3, 3, '#5e3a20'); line(g, 10, 10, 16, 5, '#5e3a20'); disc(g, 3, 3, 2, PAL.g1); disc(g, 16, 5, 2, PAL.g1); });
  const SEC_DECOR = [DECOR, [REEDS, BUSH, REEDS, TREE, FLOWERS, PALM], [TREE, TREE, SNAG, BUSH, TREE, PALM], [STONE, PALM, STONE, BUSH, FLOWERS, SNAG]];

  /* ---------- sounds (our own, added to the shared bank) ---------- */
  AUDIO.addSfx('rapJump', (t, b) => { const P = AUDIO.prims; P.tone(b, 'square', 330, t, 0.16, 0.18, 760, 0.002, 0.06, 0.4); P.noise(b, t, 0.12, 0.12, 'bandpass', 1200, 1, 3000); });
  AUDIO.addSfx('rapDuck', (t, b) => { const P = AUDIO.prims; P.tone(b, 'square', 520, t, 0.12, 0.14, 220, 0.002, 0.05, 0.4); });
  AUDIO.addSfx('rapBoost', (t, b) => { const P = AUDIO.prims; P.tone(b, 'square', 523, t, 0.07, 0.15); P.tone(b, 'square', 784, t + 0.06, 0.07, 0.15); P.tone(b, 'square', 1046, t + 0.12, 0.12, 0.15); P.noise(b, t, 0.3, 0.15, 'bandpass', 800, 1.4, 4000); });
  AUDIO.addSfx('rapStroke', (t, b) => { AUDIO.prims.noise(b, t, 0.09, 0.07, 'lowpass', 1400, 0.7, 500); });
  // the race song: quick, bouncy, 152 bpm
  AUDIO.songs.rapids = { bpm: 152, steps: 32, leadWave: 'square', harmWave: 'triangle', swing: 0.08,
    lead: 'E5 . G5 . A5 . G5 E5 . . D5 . E5 - . . G5 . A5 . C6 . A5 G5 . . E5 . D5 - . .',
    harm: 'C5 . . . C5 . . . B4 . . . B4 . . . C5 . . . E5 . . . D5 . . . B4 . . .',
    bass: 'C3 . C3 G2 . . C3 . G2 . G2 D3 . . G2 . A2 . A2 E3 . . A2 . F2 . G2 . A2 . B2 .',
    drums: 'k.hck.h.s.hck.hsk.hck.h.s.hcksss' };

  /* ---------- the course ---------- */
  let NO = 0;
  function addOb(d, kind, lanes, len) { if (NO >= MAXOB) return; const o = S.obs[NO++]; o.d = d; o.kind = kind; o.lanes = lanes; o.hit = 0; o.ph = (d * 7.31) % 6.28; o.taken = false; o.len = len || 0; }
  /** A rolling log drifts from lane to lane: where it is (0..2, a fraction while moving) at a given time. */
  const rollPos = (o, tm) => 1 + Math.sin(tm * 0.9 + o.ph) * 1.05;
  const rollLane = (o, tm) => clamp(Math.round(rollPos(o, tm)), 0, 2);
  function buildCourse(rng) {
    NO = 0;
    // a short lesson first: a bubble, a rock, a log (jump), a branch (duck), a crocodile
    addOb(45, BUBBLE, 2); addOb(52, BUBBLE, 2);
    addOb(85, ROCK, 2); addOb(85, BUBBLE, 1);
    addOb(125, LOG, 7);
    addOb(165, BRANCH, 7);
    addOb(205, CROC, 3); addOb(211, BUBBLE, 4);
    // each stretch brings in its own new hazard with a gentle first one (and a tip), then mixes it with the rest
    addOb(SEC_D[1] + 20, WHIRL, 2); addOb(SEC_D[1] + 26, BUBBLE, 1);
    addOb(SEC_D[2] + 20, DAM, 6); addOb(SEC_D[2] + 50, ROLL, 0);
    addOb(SEC_D[3] + 20, FALL, 7);
    const MIX = [
      // rock1 rock2 log branch croc bubbles whirl dam vine fall roll chan
      [22, 20, 15, 14, 15, 14, 0, 0, 0, 0, 0, 0],
      [16, 14, 10, 8, 16, 12, 14, 0, 4, 0, 0, 6],
      [12, 10, 8, 6, 10, 12, 8, 12, 10, 0, 12, 6],
      [10, 10, 8, 4, 8, 12, 8, 8, 8, 14, 10, 6]];
    const NAMES = ['rock1', 'rock2', 'log', 'branch', 'croc', 'bubbles', 'whirl', 'dam', 'vine', 'fall', 'roll', 'chan'];
    let d = 240, last = '', chanEnd = -1, chanLane = -1, hadChan = false, hadVine = false;
    while (d < LEN - 35) {
      const late = d / LEN, sec = secOf(d), w = MIX[sec];
      // skip the stretch where a new hazard is taught
      if (sec > 0 && d >= SEC_D[sec] - 6 && d < SEC_D[sec] + (sec === 2 ? 64 : 34)) { d = SEC_D[sec] + (sec === 2 ? 64 : 34); continue; }
      let tot = 0; for (let i = 0; i < w.length; i++) tot += w[i];
      let r = rng() * tot, ki = 0; while (r >= w[ki]) { r -= w[ki]; ki++; }
      let kind = NAMES[ki];
      if (kind === last && kind !== 'rock1' && kind !== 'bubbles') kind = 'rock2';
      // every river has fast water near the end of Lazy Bend and a vine curtain in Croc Creek
      if (!hadChan && d >= 262) kind = 'chan';
      if (!hadVine && sec === 1 && d >= SEC_D[1] + 110) kind = 'vine';
      if (kind === 'chan') hadChan = true; if (kind === 'vine') hadVine = true;
      if (kind === 'chan' && d < chanEnd + 40) { kind = 'bubbles'; }
      // inside a fast channel, only things that leave its lane open (or that you jump/duck)
      const inChan = d < chanEnd;
      if (inChan && (kind === 'dam' || kind === 'rock2' || kind === 'roll' || kind === 'whirl')) kind = 'rock1';
      last = kind;
      let free = (rng() * 3) | 0; if (inChan) free = chanLane;
      const other = (free + 1 + ((rng() * 2) | 0)) % 3;
      if (kind === 'rock1') { addOb(d, ROCK, 1 << other); if (rng() < 0.5) addOb(d, BUBBLE, 1 << free); }
      else if (kind === 'rock2') { addOb(d, ROCK, 7 & ~(1 << free)); if (rng() < 0.5) addOb(d, BUBBLE, 1 << free); }
      else if (kind === 'log') { addOb(d, LOG, 7); if (rng() < 0.4) addOb(d + 8, BUBBLE, 1 << free); }
      else if (kind === 'branch') addOb(d, BRANCH, 7);
      else if (kind === 'vine') { addOb(d, VINE, 7); if (rng() < 0.4) addOb(d + 7, BUBBLE, 1 << free); }
      else if (kind === 'croc') { addOb(d, CROC, rng() < 0.5 ? 1 << other : 7 & ~(1 << free)); }
      else if (kind === 'whirl') { addOb(d, WHIRL, 1 << other); if (rng() < 0.5) addOb(d + 2, BUBBLE, 1 << free); }
      else if (kind === 'dam') { addOb(d, DAM, 7 & ~(1 << free)); addOb(d + 6, BUBBLE, 1 << free); }
      else if (kind === 'fall') { addOb(d, FALL, 7); }
      else if (kind === 'roll') { addOb(d, ROLL, 0); }
      else if (kind === 'chan') { chanLane = free; chanEnd = d + 46; addOb(d, CHAN, 1 << free, 46); for (let i = 0; i < 2; i++) addOb(d + 14 + i * 16, BUBBLE, 1 << free); }
      else { for (let i = 0; i < 3; i++) addOb(d + i * 6, BUBBLE, 1 << free); }
      d += 21 + rng() * 11 - late * 5;
    }
    // sort by distance (insertion sort: small, once per round)
    for (let i = 1; i < NO; i++) { const o = S.obs[i]; let j = i - 1; while (j >= 0 && S.obs[j].d > o.d) { S.obs[j + 1] = S.obs[j]; j--; } S.obs[j + 1] = o; }
    S.nObs = NO;
    S.nChan = 0; for (let i = 0; i < NO; i++) if (S.obs[i].kind === CHAN) { S.chans[S.nChan++] = S.obs[i]; }
  }

  /* ---------- racers ---------- */
  function mkRival(id, nameKey, rider, canoe, lane, base, easyBase, err, bit) {
    return { id, nameKey, rider, canoe, lane, lx: lane, d: 0, prevD: 0, v: V0, slow: 1, boostT: 0, jumpT: 0, duckT: 0, bonkT: 0, inv: 0,
      base, easyBase, err, oi: 0, finT: 0, bit, ph: 0, strokeT: 0, spinT: 0 };
  }
  S.rivals.push(mkRival('ripple', 'rap.ripple', 'rap_ripple', 'rap_canoe_ripple', 0, 14.5, 13.8, 0.05, 2));
  S.rivals.push(mkRival('splash', 'rap.splash', 'rap_splash', 'rap_canoe_splash', 2, 14.3, 13.5, 0.08, 4));
  S.rivals.push(mkRival('marm', 'name.marm', 'rap_marm', 'rap_canoe_marm', 1, 13.5, 12.6, 0.16, 8));
  const laneBlocked = (o, l) => (o.kind === ROCK || o.kind === CROC || o.kind === WHIRL || o.kind === DAM) && (o.lanes & (1 << l));
  /** Is this spot in a fast channel's lane? (Channels are few: a short scan back from the racer.) */
  function inChannel(d, lane) {
    for (let i = 0; i < S.nChan; i++) { const o = S.chans[i]; if (d >= o.d && d < o.d + o.len && (o.lanes & (1 << lane))) return true; }
    return false;
  }
  const isJump = k => k === LOG || k === FALL || k === ROLL, isDuck = k => k === BRANCH || k === VINE;
  /** A rival picks a lane free of rocks and crocodiles a little ahead (and away from Cappy's canoe). */
  function rivalSteer(r) {
    for (let i = r.oi; i < S.nObs; i++) {
      const o = S.obs[i]; if (o.d - r.d > 22) break;
      if (o.d - r.d < 2) continue;
      if (laneBlocked(o, r.lane)) {
        let best = r.lane, bestCost = 99;
        for (let l = 0; l < 3; l++) {
          if (laneBlocked(o, l)) continue;
          const cost = Math.abs(l - r.lane) + (Math.abs(S.d - r.d) < 8 && S.lane === l ? 2 : 0) - (inChannel(o.d, l) ? 0.6 : 0);
          if (cost < bestCost) { bestCost = cost; best = l; }
        }
        r.lane = best;
        return;
      }
    }
  }
  /** Effects at Cappy's canoe (world pixels, times the zoom, to the screen). */
  function youFloat(dy, str, col) { UI.float((S.cx(S.d) + (S.lx - 1) * S.laneW) * S.Z, (S.py + dy) * S.Z, str, col); }
  function youBurst(dy, n, col, sp) { UI.burst((S.cx(S.d) + (S.lx - 1) * S.laneW) * S.Z, (S.py + dy) * S.Z, n, col, sp); }
  function bonk(who, isYou, ctx) {
    who.slow = 0.25; who.inv = 1.0;
    if (isYou) {
      S.bonks++; S.shake = 0.25; ctx.sfx('bonk'); ctx.sfx('splash');
      youFloat(-22, t('rap.bonk'), '#ffb3d6');
      youBurst(0, 8, PAL.w5, 50);
    }
  }
  /** A whirlpool spins the canoe round: slower than a bonk, but not as bad. */
  function spin(who, isYou, ctx) {
    who.slow = 0.45; who.inv = 0.8; who.spinT = 0.8;
    if (isYou) { S.spins++; S.shake = 0.15; ctx.sfx('splash'); youFloat(-22, t('rap.spin'), '#c8f6ff'); youBurst(0, 8, '#c8f6ff', 40); }
  }
  /** Resolve the obstacles a racer's bow has just passed. */
  function pass(r, isYou, ctx) {
    while (r.oi < S.nObs && S.obs[r.oi].d <= r.d) {
      const o = S.obs[r.oi++], l = Math.round(r.lx);
      if (o.kind === CHAN) continue;
      // a rolling log is in one lane at a time: whichever it has drifted to now
      if (o.kind === ROLL) { if (rollLane(o, S.time) !== l) continue; }
      else if (!(o.lanes & (1 << l))) continue;
      if (o.kind === FALL && r.jumpT > 0) {
        // jumping a waterfall: a big drop and a burst of speed
        r.boostT = Math.max(r.boostT, BOOST_T * 0.6);
        if (isYou) { S.drops++; ctx.sfx('rapBoost'); youFloat(-30, t('rap.bigDrop'), PAL.r4); youBurst(4, 12, PAL.w5, 70); }
        continue;
      }
      if (o.kind === BUBBLE) {
        if (isYou && !o.taken) {
          o.taken = true; S.boosts++; S.boostT = BOOST_T; ctx.sfx('rapBoost');
          youFloat(-26, t('rap.boost'), PAL.w4);
          youBurst(-4, 10, PAL.w4, 60);
        }
        continue;
      }
      if (r.inv > 0) continue;
      if (isJump(o.kind) && r.jumpT > 0) { if (isYou) { youFloat(-30, t('rap.nice'), PAL.r4); } continue; }
      if (isDuck(o.kind) && r.duckT > 0) { if (isYou) { youFloat(-30, t('rap.nice'), PAL.r4); } continue; }
      if (o.kind === WHIRL) { spin(r, isYou, ctx); continue; }
      bonk(r, isYou, ctx);
    }
  }
  function rivalUpdate(r, dt, ctx) {
    r.prevD = r.d;
    if (r.finT && r.d > LEN + 40) { r.v = 0; return; }
    rivalSteer(r);
    // jump the next log, duck the next branch (or, now and then, make a kid-sized mistake)
    for (let i = r.oi; i < S.nObs; i++) {
      const o = S.obs[i]; if (o.d - r.d > 6) break;
      if (o.hit & r.bit) continue;
      o.hit |= r.bit;
      const slip = S.rand() < r.err * (ctx.easy ? 1.6 : 1);
      if (slip) continue;
      if (o.kind === LOG || o.kind === FALL || (o.kind === ROLL && rollLane(o, S.time + (o.d - r.d) / Math.max(1, r.v)) === r.lane)) r.jumpT = JUMP_T;
      else if (isDuck(o.kind)) r.duckT = DUCK_T;
      else if (o.kind === BUBBLE && (o.lanes & (1 << r.lane)) && S.rand() < 0.5) r.boostT = BOOST_T * 0.8;
    }
    const k = 1 - Math.exp(-dt * 10);
    r.lx += (r.lane - r.lx) * k;
    if (r.jumpT > 0) r.jumpT -= dt; if (r.duckT > 0) r.duckT -= dt; if (r.boostT > 0) r.boostT -= dt; if (r.inv > 0) r.inv -= dt; if (r.spinT > 0) r.spinT -= dt;
    r.slow = Math.min(1, r.slow + dt * 0.55);
    // its own pace, a gentle wobble, and a soft rubber band so the pack stays in sight
    let base = (ctx.easy ? r.easyBase : r.base) * (1 + 0.04 * Math.sin(S.time * 0.7 + r.ph));
    const gap = r.d - S.d;
    if (gap > 55) base *= 0.93; else if (gap < -60) base *= 1.05;
    if (r.finT) base *= 0.5;
    r.v = (base + (r.boostT > 0 ? VBOOST * 0.8 : 0) + (inChannel(r.d, r.lane) ? VCHAN * 0.8 : 0)) * r.slow;
    r.d += r.v * dt;
    pass(r, false, ctx);
    if (!r.finT && r.d >= LEN) r.finT = S.raceT;
    r.strokeT += dt;
  }

  /* ---------- the player's moves ---------- */
  function steer(dir, ctx) {
    if (S.done) return;
    const n = clamp(S.lane + dir, 0, 2);
    if (n !== S.lane) { S.lane = n; ctx.sfx('rapStroke'); }
    S.hintT = Math.max(S.hintT, 0); S.usedSteer = true;
  }
  function jump(ctx) {
    if (S.done || S.jumpT > 0 || S.jumpCD > 0) return;
    S.duckT = 0; S.jumpT = JUMP_T; S.jumpCD = JUMP_T + 0.12; ctx.sfx('rapJump'); S.usedJump = true;
  }
  function duck(ctx) {
    if (S.done || S.duckT > 0 || S.jumpT > 0) return;
    S.duckT = DUCK_T; ctx.sfx('rapDuck'); S.usedDuck = true;
  }
  /** The autopilot used by the tests (and only them): steer for free lanes and bubbles, jump logs, duck branches. */
  function autopilot() {
    let want = S.lane, logAhead = 99, branchAhead = 99, first = null, blocked = 0;
    for (let i = S.oi; i < S.nObs; i++) {
      const o = S.obs[i], ahead = o.d - S.d; if (ahead > 26) break;
      // a less-than-perfect bot (skill < 1) simply does not notice some things (for balance checks)
      if (!(o.hit & 16)) { o.hit |= 16; if (S.rand() > S.autoSkill) o.hit |= 32; }
      if (o.hit & 32) continue;
      if ((o.kind === LOG || o.kind === FALL) && ahead < logAhead) logAhead = ahead;
      if (o.kind === ROLL && ahead < logAhead && rollLane(o, S.time + ahead / Math.max(1, S.v)) === S.lane) logAhead = ahead;
      if (isDuck(o.kind) && ahead < branchAhead) branchAhead = ahead;
      if (ahead < 2) continue;
      // fast water or a bubble pulls it over only into a lane nothing nearer blocks
      if (o.kind === CHAN && ahead < 12 && want === S.lane) { for (let l = 0; l < 3; l++) if ((o.lanes & (1 << l)) && !(blocked & (1 << l))) want = l; continue; }
      if (o.kind === ROCK || o.kind === CROC || o.kind === WHIRL || o.kind === DAM) blocked |= o.lanes;
      // a farther rock may only move Cappy to a lane that is also free at the nearer one
      if (laneBlocked(o, want)) { for (let l = 0; l < 3; l++) if (!laneBlocked(o, l) && !(first && first !== o && laneBlocked(first, l))) { want = l; if (Math.abs(l - S.lane) <= 1) break; } }
      if (!first && (o.kind === ROCK || o.kind === CROC || o.kind === WHIRL || o.kind === DAM)) first = o;
      else if (o.kind === BUBBLE && ahead < 16 && !o.taken && want === S.lane) { for (let l = 0; l < 3; l++) if ((o.lanes & (1 << l)) && !(blocked & (1 << l)) && Math.abs(l - S.lane) <= 1) want = l; }
    }
    if (want !== S.lane) steer(sign(want - S.lane), S.ctx);
    if (logAhead < 3.2) jump(S.ctx);
    if (branchAhead < 3.6) duck(S.ctx);
  }

  function update(dt, ctx) {
    S.ctx = ctx; S.time += dt;
    if (!S.done) S.raceT += dt;
    if (S.auto && !S.done) autopilot();
    S.prevD = S.d;
    if (S.jumpT > 0) { S.jumpT -= dt; if (S.jumpT <= 0) { ctx.sfx('splash'); youBurst(0, 6, PAL.w5, 40); } }
    if (S.jumpCD > 0) S.jumpCD -= dt; if (S.duckT > 0) S.duckT -= dt; if (S.boostT > 0) S.boostT -= dt; if (S.inv > 0) S.inv -= dt; if (S.shake > 0) S.shake -= dt; if (S.spinT > 0) S.spinT -= dt;
    if (S.hintT > 0) S.hintT -= dt;
    S.slow = Math.min(1, S.slow + dt * 0.5);
    const k = 1 - Math.exp(-dt * 14);
    S.lx += (S.lane - S.lx) * k;
    // fast water: staying in a channel's lane carries you along quicker
    const chan = !S.done && inChannel(S.d, Math.round(S.lx));
    if (chan && !S.chanOn) { youFloat(-26, t('rap.fast'), '#a8ecff'); ctx.sfx('rapBoost'); }
    S.chanOn = chan; if (chan) S.fastT += dt;
    S.v = S.done ? Math.max(0, S.v - dt * 9) : (V0 + (S.boostT > 0 ? VBOOST : 0) + (chan ? VCHAN : 0)) * S.slow;
    S.d += S.v * dt;
    if (!S.done) pass(S, true, ctx);
    S.strokeT += dt * (S.boostT > 0 ? 1.5 : 1);
    if (!S.done && ((S.strokeT * 1.2) | 0) !== ((S.lastStroke * 1.2) | 0)) ctx.sfx('rapStroke');
    S.lastStroke = S.strokeT;
    for (let i = 0; i < S.rivals.length; i++) rivalUpdate(S.rivals[i], dt, ctx);
    let place = 1;
    for (let i = 0; i < S.rivals.length; i++) { const r = S.rivals[i]; if (r.finT ? r.finT <= S.raceT : r.d > S.d) place++; }
    if (!S.done) S.place = place;
    // a new stretch of river: its name
    const sec = secOf(S.d);
    if (sec !== S.sec && !S.done) { S.sec = sec; UI.banner(t('rap.sec' + sec), PAL.w4, 1.4); ctx.sfx('tock'); }
    // the tips the first time each hazard comes along
    for (let i = S.oi; i < S.nObs && i < S.oi + 6; i++) {
      const o = S.obs[i], ahead = o.d - S.d; if (ahead > 34) break;
      if (o.kind === LOG && !S.tipLog && ahead < 30) { S.tipLog = true; UI.banner(t(ctx.touch ? 'rap.tipJumpTouch' : 'rap.tipJumpKeys'), PAL.r4, 1.6); }
      if (o.kind === BRANCH && !S.tipBranch && ahead < 30) { S.tipBranch = true; UI.banner(t(ctx.touch ? 'rap.tipDuckTouch' : 'rap.tipDuckKeys'), PAL.r4, 1.6); }
      if (o.kind === ROCK && !S.tipRock && ahead < 30) { S.tipRock = true; UI.banner(t('rap.tipSteer'), PAL.r4, 1.4); }
      const bit = o.kind === WHIRL ? 1 : o.kind === DAM ? 2 : o.kind === FALL ? 4 : o.kind === ROLL ? 8 : o.kind === CHAN ? 16 : o.kind === VINE ? 32 : 0;
      if (bit && !(S.tips & bit) && ahead < 28) { S.tips |= bit; UI.banner(t('rap.tip' + KIND_NAMES[o.kind]), PAL.r4, 1.6); }
    }
    if (!S.done && S.d >= LEN) finishRace(ctx);
  }
  function finishRace(ctx) {
    S.done = true; S.finT = S.raceT;
    const won = S.place === 1;
    const stars = won ? 1 + (S.bonks <= 4 ? 1 : 0) + (S.bonks <= 2 ? 1 : 0) : 0;
    const placePts = S.place === 1 ? 1500 : S.place === 2 ? 800 : S.place === 3 ? 400 : 200;
    const score = placePts + S.boosts * 50 + S.drops * 60 + Math.max(0, 12 - S.bonks) * 40 + Math.max(0, Math.round((115 - S.finT) * 20));
    if (won) { UI.confetti(ctx.W / 2, (S.py - 40) * S.Z, 40); ctx.sfx('cheer'); }
    UI.banner(t(won ? 'rap.first' : 'rap.finished', { n: S.place }), won ? PAL.r4 : PAL.w4, 1.2);
    ctx.finish({ score, stars, won, frac: won ? stars / 3 : (4 - S.place) / 4 * 0.3, stats: { place: S.place, time: Math.round(S.finT * 10) / 10, bonks: S.bonks, boosts: S.boosts, drops: S.drops, spins: S.spins } });
  }

  /* ---------- drawing ---------- */
  S.cx = d => S.mid + S.amp * (0.65 * Math.sin(d / 47) + 0.35 * Math.sin(d / 19 + 1.3));
  const yOf = d => S.py - Math.round(d * S.ppm) + S.camY;
  // The river is drawn zoomed (VW: the world's view in world pixels) when the screen has room for it (a short wide
  // screen at 1x pixels); the HUD and the buttons stay at the screen's own scale.
  const VW = { W: 320, H: 240 };
  function layout(ctx) {
    const W = ctx.W, H = ctx.H;
    S.Z = Math.max(1, Math.floor(Math.min(W / 200, H / 160)));
    S.ctrlH = ctx.touch ? Math.max(24, ctx.tap) + 8 : 16;
    VW.W = Math.ceil(W / S.Z); VW.H = Math.ceil(H / S.Z);
    S.mid = Math.round(VW.W / 2);
    S.laneW = clamp(Math.floor(VW.W / 6), 28, 40);
    S.half = Math.round(S.laneW * 1.5 + 8);
    S.amp = clamp(Math.floor(VW.W / 2 - S.half - 18), 0, 44);
    S.ppm = VW.H < 300 ? 2.5 : 3.4;
    S.py = Math.round(VW.H - S.ctrlH / S.Z - (VW.H < 300 ? 30 : 46));
    // a wide, short view: Cappy's canoe a little higher, so there is room under it and he still sees what is coming
    if (VW.W > VW.H) S.py = Math.min(S.py, Math.round(VW.H * 0.7));
  }
  // The river and its banks are painted once per layout into two tall strips (two water frames for the current),
  // covering the whole course; each frame draws one slice of a strip plus a few moving streaks.
  const D_MIN = -60, D_MAX = LEN + 170, STRIP = { c0: null, c1: null, key: -1 };
  function buildStrips() {
    const W = VW.W, H = Math.ceil((D_MAX - D_MIN) * S.ppm) + 4, half = S.half;
    for (let f = 0; f < 2; f++) {
      const c = JC.canvas2(W, H), g = c.getContext('2d');
      g.fillStyle = PAL.g2; g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 2) {
        const d = D_MAX - y / S.ppm, cx = S.cx(d), L = Math.round(cx - half), R = Math.round(cx + half);
        // bank: grass stripes, a darker band, then mud and sand (each stretch of river has its own colours)
        const band = ((d / 4) | 0) & 1, sc = secOf(Math.max(0, d)), BK = SEC_BANK[sc], WT = SEC_WATER[sc];
        g.fillStyle = band ? BK[0] : BK[1]; g.fillRect(0, y, L - 12, 2); g.fillRect(R + 12, y, W - R - 12, 2);
        g.fillStyle = PAL.g1; g.fillRect(L - 12, y, 6, 2); g.fillRect(R + 6, y, 6, 2);
        g.fillStyle = SEC_MUD[sc]; g.fillRect(L - 6, y, 4, 2); g.fillRect(R + 2, y, 4, 2);
        g.fillStyle = PAL.b4; g.fillRect(L - 2, y, 2, 2); g.fillRect(R, y, 2, 2);
        // water: bands that shift between the two frames (the current), a lighter middle
        const flow = (((d + f * 1.5) / 3) | 0) & 1;
        g.fillStyle = flow ? WT[0] : WT[1]; g.fillRect(L, y, R - L, 2);
        g.fillStyle = flow ? WT[2] : WT[3]; g.fillRect(L + 8, y, R - L - 16, 2);
        // foam at the shore, lane marks
        g.fillStyle = PAL.w5; if ((((d * 3) | 0) + f) % 3 === 0) { g.fillRect(L, y, 2, 2); g.fillRect(R - 2, y, 2, 2); }
        if ((y >> 1) % 5 === 0) { g.fillStyle = 'rgba(200,246,255,0.16)'; g.fillRect(Math.round(cx - S.laneW / 2), y, 1, 2); g.fillRect(Math.round(cx + S.laneW / 2), y, 1, 2); }
      }
      // plants along the banks (fixed spots every 7 m)
      for (let i = Math.floor(D_MIN / 7); i <= Math.ceil(D_MAX / 7); i++) {
        for (let side = 0; side < 2; side++) {
          const h = JC.hash(i, side, 17); if (h < 0.18) continue;
          const d = i * 7 + h * 5, sc = secOf(Math.max(0, d)), set = SEC_DECOR[sc], pl = set[(h * 977 | 0) % set.length], cx = S.cx(d), y = Math.round((D_MAX - d) * S.ppm) - (pl.h >> 1);
          const off = 14 + ((h * 131) % 1) * Math.max(4, S.mid - S.half - 30);
          const x = side ? Math.round(cx + S.half + off) : Math.round(cx - S.half - off - pl.w);
          if (x > W || x + pl.w < 0) continue;
          g.drawImage(pl.c, x, y);
        }
      }
      if (f) STRIP.c1 = c; else STRIP.c0 = c;
    }
    STRIP.key = stripKey();
  }
  const stripKey = () => VIEW.gen * 4096 + VW.W * 8 + (S.ppm > 3 ? 1 : 0);
  function drawRiver(g) {
    const W = VW.W, H = VW.H, half = S.half, tm = S.time;
    if (STRIP.key !== stripKey() || !STRIP.c0) buildStrips();
    const c = ((tm * 4) | 0) & 1 ? STRIP.c1 : STRIP.c0;
    const sy = Math.round(D_MAX * S.ppm) - S.camY - S.py, y0 = Math.max(0, -sy), y1 = Math.min(H, c.height - sy);
    if (y0 > 0 || y1 < H) { g.fillStyle = PAL.g2; g.fillRect(0, 0, W, H); }
    if (y1 > y0) g.drawImage(c, 0, sy + y0, W, y1 - y0, 0, y0, W, y1 - y0);
    // streaks drifting on the water
    g.fillStyle = 'rgba(200,246,255,0.55)';
    for (let y = 0; y < H; y += 4) {
      const d = S.d + (S.py - y) / S.ppm, hs = JC.hash((d * 1.2 + tm * 4) | 0, 3, 5);
      if (hs >= 0.12) continue;
      const cx = S.cx(d), L = Math.round(cx - half), R = Math.round(cx + half);
      g.fillRect(L + 6 + Math.round(hs * 8 * (R - L - 16)), y, 5, 1);
    }
  }
  function laneX(d, l) { return S.cx(d) + (l - 1) * S.laneW; }
  function drawBanner(g, d, key, col, ctx) {
    const y = Math.round(yOf(d)); if (y < -20 || y > VW.H + 10) return;
    const c = S.cx(d), L = Math.round(c - S.half - 8), R = Math.round(c + S.half + 8);
    rect(g, L - 2, y - 26, 4, 30, OUT); rect(g, L - 1, y - 25, 2, 28, PAL.b3); rect(g, R - 2, y - 26, 4, 30, OUT); rect(g, R - 1, y - 25, 2, 28, PAL.b3);
    rect(g, L, y - 24, R - L, 1, '#5e3a20');
    for (let x = L + 2, i = 0; x < R - 4; x += 7, i++) { const fc = i % 3 === 0 ? col : i % 3 === 1 ? PAL.r4 : PAL.white; rect(g, x, y - 23, 5, 3, fc); rect(g, x + 1, y - 20, 3, 1, fc); rect(g, x + 2, y - 19, 1, 1, fc); }
    const s = t(key), w = textW(s) + 8;
    box(g, c - w / 2, y - 14, w, 13, col, OUT, shade(col, 0.4));
    text(g, s, c, y - 14, { align: 'center', col: PAL.white });
    // the line on the water
    for (let x = Math.round(c - S.half); x < c + S.half; x += 4) rect(g, x, y + 2, 2, 1, PAL.white);
  }
  function drawOb(g, o, ctx) {
    const y = Math.round(yOf(o.d)); if (y < -16 || y > VW.H + 16) return;
    const tm = S.time;
    if (o.kind === LOG) {
      let lo = 0, hi = 2; while (!(o.lanes & (1 << lo))) lo++; while (!(o.lanes & (1 << hi))) hi--;
      const x0 = Math.round(laneX(o.d, lo) - S.laneW / 2 + 1), x1 = Math.round(laneX(o.d, hi) + S.laneW / 2 - 1), bob = Math.round(Math.sin(tm * 3 + o.ph));
      rect(g, x0 + 2, y + 4 + bob, x1 - x0, 3, 'rgba(14,42,79,0.45)');
      box(g, x0, y - 4 + bob, x1 - x0, 9, '#8a5a33', OUT);
      rect(g, x0 + 1, y - 3 + bob, x1 - x0 - 2, 2, '#c48a4c'); rect(g, x0 + 1, y + 2 + bob, x1 - x0 - 2, 2, '#5e3a20');
      for (let x = x0 + 6; x < x1 - 6; x += 9) rect(g, x, y - 1 + bob, 4, 1, '#6e4325');
      logEnd(g, x0, y + bob); logEnd(g, x1 - 7, y + bob);
      rect(g, x0 + 3, y - 6 + bob, 3, 2, PAL.g3); rect(g, x0 + 4, y - 7 + bob, 2, 1, PAL.g4);
      if (((tm * 6) | 0) % 2) { rect(g, x0 - 2, y + 3, 2, 1, PAL.w5); rect(g, x1, y + 3, 2, 1, PAL.w5); }
    } else if (o.kind === ROCK || o.kind === CROC) {
      for (let l = 0; l < 3; l++) {
        if (!(o.lanes & (1 << l))) continue;
        const x = Math.round(laneX(o.d, l));
        // foam ring
        const f = ((tm * 5 + l) | 0) % 2;
        g.fillStyle = PAL.w5; g.fillRect(x - 8 - f, y + 3, 3, 1); g.fillRect(x + 6 + f, y + 3, 3, 1); g.fillRect(x - 3, y + 6 + f, 6, 1);
        if (o.kind === ROCK) spr(g, SPRITES.rap_rock, x - 7, y - 5);
        else { const blink = ((tm + o.ph) % 3) < 0.18; const bob = Math.round(Math.sin(tm * 2.4 + o.ph + l)); spr(g, blink ? SPRITES.rap_croc2 : SPRITES.rap_croc, x - 8, y - 4 + bob); }
      }
    } else if (o.kind === WHIRL) {
      for (let l = 0; l < 3; l++) {
        if (!(o.lanes & (1 << l))) continue;
        const x = Math.round(laneX(o.d, l)), a0 = tm * 5 + o.ph;
        oval(g, x, y, 11, 5, '#1a5a8a'); oval(g, x, y, 8, 4, '#174f7a'); oval(g, x, y, 4, 2, '#0e2a4f');
        // the spinning streaks
        for (let i = 0; i < 6; i++) { const a = a0 + i * 1.047, rr = 4 + (i % 3) * 3; rect(g, Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr * 0.45), 2, 1, i % 2 ? PAL.w5 : '#a8ecff'); }
      }
    } else if (o.kind === DAM) {
      // a beaver dam of sticks across the river, with one gap of open water
      for (let l = 0; l < 3; l++) {
        const x = Math.round(laneX(o.d, l)), hw = Math.round(S.laneW / 2);
        if (!(o.lanes & (1 << l))) { if (((tm * 4 + l) | 0) % 2) { rect(g, x - 3, y - 6, 1, 4, PAL.w5); rect(g, x + 3, y - 4, 1, 4, PAL.w5); } continue; }
        rect(g, x - hw, y - 3, hw * 2, 8, OUT); rect(g, x - hw + 1, y - 2, hw * 2 - 2, 6, '#7a5030');
        for (let i = 0; i < 5; i++) { const sx = x - hw + 2 + ((i * 7 + l * 3) % (hw * 2 - 6)); line(g, sx, y - 5 + (i % 2), sx + 6, y + 3 - (i % 2), i % 2 ? '#a8743e' : '#5e3a20'); }
        rect(g, x - hw + 1, y - 2, hw * 2 - 2, 1, '#a8743e'); rect(g, x - hw + 2, y + 5, hw * 2 - 4, 1, PAL.w5);
        // sticks poking up out of the dam
        for (let i = 0; i < 3; i++) { const sx = x - hw + 4 + i * Math.round((hw * 2 - 8) / 2); line(g, sx, y - 3, sx + (i % 2 ? 2 : -2), y - 9, '#5e3a20'); }
      }
      // the beaver who built it, on the first piece, keeping an eye on things
      for (let l = 0; l < 3; l++) if (o.lanes & (1 << l)) { const bx = Math.round(laneX(o.d, l)) - 5, bb = ((tm * 2 + o.ph) | 0) % 2; spr(g, SPRITES.rap_beaver, bx, y - 13 + bb); break; }
    } else if (o.kind === FALL) {
      // a little waterfall: a lip of rock with white water spilling over (the river drops towards the top)
      // the water curls over the lip (bottom), pours down the face (white streaks) into deeper, darker water beyond
      const c = S.cx(o.d), L = Math.round(c - S.half), R = Math.round(c + S.half), sp = (tm * 14) | 0;
      rect(g, L, y - 22, R - L, 10, '#1a5f94'); rect(g, L, y - 22, R - L, 2, '#14507e');
      for (let x = L; x < R; x += 2) {
        const k = (x * 7 + sp) % 9, top = y - 12 - (k % 3);
        rect(g, x, top, 2, 12 + (k % 3), k < 3 ? PAL.white : k < 6 ? '#e8fbff' : '#a8dcf4');
      }
      // spray where it lands, and the smooth curl at the lip
      for (let x = L + 1; x < R - 1; x += 3) { const k = (x + sp) % 4; rect(g, x, y - 15 - k, 1, 1, PAL.white); if (k === 0) rect(g, x + 1, y - 17 - (sp % 3), 1, 1, '#e8fbff'); }
      rect(g, L, y, R - L, 2, '#a8ecff'); rect(g, L, y + 2, R - L, 1, '#5ab8e0');
      for (let x = L + 3; x < R - 3; x += 6) rect(g, x, y + 4 + (((tm * 6 + x) | 0) % 2), 3, 1, PAL.w5);
      spr(g, SPRITES.rap_rock, L - 10, y - 10); spr(g, SPRITES.rap_rock, R - 4, y - 10);
    } else if (o.kind === ROLL) {
      // a short log rolling across the lanes (it turns as it goes)
      const x = Math.round(laneX(o.d, rollPos(o, tm))), hw = Math.round(S.laneW / 2) - 2, roll = ((tm * 10 + o.ph) | 0) % 3;
      rect(g, x - hw + 2, y + 4, hw * 2, 3, 'rgba(14,42,79,0.45)');
      box(g, x - hw, y - 4, hw * 2, 9, '#8a5a33', OUT);
      for (let i = 0; i < 3; i++) rect(g, x - hw + 3 + ((i * 6 + roll * 2) % (hw * 2 - 6)), y - 3, 2, 7, '#5e3a20');
      logEnd(g, x - hw, y); logEnd(g, x + hw - 7, y);
      const dir = Math.cos(tm * 0.9 + o.ph) >= 0 ? 1 : -1;
      if (((tm * 6) | 0) % 2) { rect(g, x - dir * (hw + 3), y - 1, 2, 1, PAL.w5); rect(g, x - dir * (hw + 5), y + 2, 2, 1, PAL.w5); }
    } else if (o.kind === BUBBLE) {
      if (o.taken) return;
      for (let l = 0; l < 3; l++) {
        if (!(o.lanes & (1 << l))) continue;
        const x = Math.round(laneX(o.d, l)), bob = Math.round(Math.sin(tm * 4 + o.ph) * 1.5);
        if (((tm * 3 + o.ph) | 0) % 2) { g.globalAlpha = 0.35; disc(g, x, y + bob, 8, PAL.w4); g.globalAlpha = 1; }
        spr(g, SPRITES.rap_bubble, x - 5, y - 5 + bob);
      }
    }
  }
  function logEnd(g, ex, y) { oval(g, ex + 3, y, 3, 4, OUT); oval(g, ex + 3, y, 2, 3, '#e8bd7c'); rect(g, ex + 3, y, 1, 1, '#9a6234'); }
  function drawBranch(g, o, ctx) {
    const y = Math.round(yOf(o.d)); if (y < -20 || y > VW.H + 20) return;
    const c = S.cx(o.d), L = Math.round(c - S.half - 16), R = Math.round(c + S.half + 16), sway = Math.round(Math.sin(S.time * 1.5 + o.ph));
    // its shadow on the water (it hangs low, so the shadow is close)
    g.globalAlpha = 0.3; rect(g, L + 10, y + 7, R - L - 20, 4, '#0e2a4f'); g.globalAlpha = 1;
    rect(g, L, y - 3 + sway, R - L, 6, OUT);
    rect(g, L, y - 2 + sway, R - L, 4, '#6e4325'); rect(g, L, y - 2 + sway, R - L, 1, '#9a6234');
    for (let x = L + 8, i = 0; x < R - 4; x += 12, i++) {
      const ly = y + 2 + sway + (i % 2) * 2;
      line(g, x, y + 1 + sway, x, ly + 4, PAL.g1);
      spr(g, SPRITES.leaf, x - 2, ly + 3, i % 2 === 1);
      if (i % 3 === 0) { rect(g, x + 3, y - 4 + sway, 3, 3, PAL.p3); rect(g, x + 4, y - 3 + sway, 1, 1, PAL.r5); }
    }
  }
  /** A fast channel: a lane of quicker, lighter water with arrows running downstream. */
  function drawChannel(g, o) {
    let lane = 0; while (!(o.lanes & (1 << lane))) lane++;
    const tm = S.time, step = 8;
    for (let dd = o.d; dd < o.d + o.len; dd += 1.5) {
      const y = Math.round(yOf(dd)); if (y < -4 || y > VW.H + 4) continue;
      const x = Math.round(laneX(dd, lane)), hw = Math.round(S.laneW / 2) - 3;
      g.globalAlpha = 0.28; rect(g, x - hw, y, hw * 2, Math.ceil(1.5 * S.ppm), '#a8ecff'); g.globalAlpha = 1;
    }
    for (let dd = o.d + 4 + ((tm * 10) % step); dd < o.d + o.len - 2; dd += step) {
      const y = Math.round(yOf(dd)); if (y < -6 || y > VW.H + 6) continue;
      const x = Math.round(laneX(dd, lane));
      for (let i = 0; i < 4; i++) { rect(g, x - 4 + i, y + i, 1, 1, PAL.white); rect(g, x + 4 - i, y + i, 1, 1, PAL.white); }
    }
  }
  /** A curtain of hanging vines across the river (duck under it). */
  function drawVines(g, o) {
    const y = Math.round(yOf(o.d)); if (y < -24 || y > VW.H + 24) return;
    const c = S.cx(o.d), L = Math.round(c - S.half - 16), R = Math.round(c + S.half + 16), sway = Math.sin(S.time * 1.8 + o.ph);
    g.globalAlpha = 0.3; rect(g, L + 10, y + 8, R - L - 20, 3, '#0e2a4f'); g.globalAlpha = 1;
    rect(g, L, y - 6, R - L, 3, OUT); rect(g, L, y - 5, R - L, 1, '#3a6a2e');
    for (let x = L + 4, i = 0; x < R - 2; x += 6, i++) {
      const len = 7 + (i * 5) % 6, dx = Math.round(sway * (1 + (i % 3)));
      line(g, x, y - 4, x + dx, y - 4 + len, i % 2 ? PAL.g1 : '#2f7a40');
      if (i % 2 === 0) { rect(g, x + dx - 1, y - 4 + len, 3, 2, PAL.g3); }
      if (i % 5 === 2) { rect(g, x + dx, y - 1 + (len >> 1), 2, 2, PAL.p3); }
    }
  }
  function drawCanoe(g, x, y, canoe, rider, jumpT, duckT, strokeT, boosting, isYou, inv, spinT) {
    const h = jumpT > 0 ? Math.round(Math.sin(Math.PI * (1 - jumpT / JUMP_T)) * 12) : 0;
    x = Math.round(x); y = Math.round(y);
    // spinning in a whirlpool: a wobble side to side and a ring of foam
    if (spinT > 0) { if (!BRBX.reduced()) x += Math.round(Math.sin(spinT * 30) * 3); g.globalAlpha = 0.5; oval(g, x + 1, y + 14, 12, 6, '#c8f6ff'); g.globalAlpha = 1; }
    // wake
    const wl = boosting ? 14 : 8;
    for (let i = 2; i < wl; i += 2) { g.fillStyle = i < 6 ? PAL.white : 'rgba(255,255,255,0.5)'; g.fillRect(x - 5 - (i >> 1), y + 24 + i, 2, 1); g.fillRect(x + 4 + (i >> 1), y + 24 + i, 2, 1); }
    g.globalAlpha = h ? 0.2 : 0.3; oval(g, x + 1, y + 15, 7, 13, '#0e2a4f'); g.globalAlpha = 1;
    if (inv > 0 && ((inv * 12) | 0) % 2) g.globalAlpha = 0.55;
    const yy = y - h;
    spr(g, SPRITES[canoe], x - 7, yy);
    // paddle strokes, left then right
    const side = ((strokeT * 2.4) | 0) % 2 ? 1 : -1, sw = (strokeT * 2.4) % 1;
    if (duckT <= 0) {
      const px = x + side * (6 + Math.round(sw * 3)), py = yy + 12 + Math.round(sw * 6);
      line(g, x + side * 2, yy + 11, px, py, '#e8bd7c'); rect(g, px - 1, py, 3, 4, '#c48a4c');
      if (!h && sw > 0.6) { g.fillStyle = PAL.w5; g.fillRect(px - 2, py + 5, 1, 1); g.fillRect(px + 2, py + 4, 1, 1); }
    }
    // the rider, seen from behind (ducked: only the top of the head shows)
    const s = SPRITES[rider];
    if (s) {
      if (duckT > 0) g.drawImage(s.c, 0, 0, s.w, 5, x - (s.w >> 1), yy + 14, s.w, 5);
      else if (isYou) g.drawImage(s.c, 0, 0, s.w, 12, x - (s.w >> 1), yy + 7, s.w, 12);
      else spr(g, s, x - (s.w >> 1), yy + 8);
    }
    g.globalAlpha = 1;
    if (boosting) { g.fillStyle = PAL.w4; for (let i = 0; i < 3; i++) g.fillRect(x - 6 + i * 6, yy + 30 + ((S.time * 40 + i * 5) % 8), 1, 4); }
  }
  /** Touch controls: steer arrows at the sides, jump and duck in the middle. */
  const ARROW = {
    left(g, cx, cy) { for (let i = 0; i < 6; i++) rect(g, cx - 4 + i, cy - i, 1, i * 2 + 1, PAL.white); rect(g, cx + 2, cy - 2, 4, 5, PAL.white); },
    right(g, cx, cy) { for (let i = 0; i < 6; i++) rect(g, cx + 4 - i, cy - i, 1, i * 2 + 1, PAL.white); rect(g, cx - 5, cy - 2, 4, 5, PAL.white); },
    jump(g, cx, cy) { for (let i = 0; i < 6; i++) rect(g, cx - i, cy - 5 + i, i * 2 + 1, 1, PAL.white); rect(g, cx - 2, cy + 1, 5, 4, PAL.white); },
    duck(g, cx, cy) { for (let i = 0; i < 6; i++) rect(g, cx - i, cy + 5 - i, i * 2 + 1, 1, PAL.white); rect(g, cx - 2, cy - 4, 5, 4, PAL.white); },
  };
  const BTN_OPT = { left: { col: '#2481c4', icon: ARROW.left }, right: { col: '#2481c4', icon: ARROW.right }, jump: { col: '#3fae4a', icon: ARROW.jump }, duck: { col: '#c8641a', icon: ARROW.duck } };
  function drawControls(g, ctx) {
    const W = ctx.W, H = ctx.H;
    // the buttons only take taps while racing (not under the pause menu or the results card)
    if (RUN.phase !== 'play' && RUN.phase !== 'count') return;
    if (!ctx.touch) {
      g.fillStyle = 'rgba(27,19,37,0.7)'; g.fillRect(0, H - 14, W, 14);
      text(g, t('rap.keysHint'), W / 2, H - 13, { align: 'center', col: PAL.cream });
      return;
    }
    const bh = Math.max(24, ctx.tap), gap = 4, bw = Math.min(Math.floor((W - 8 - gap * 3) / 4), 96), total = bw * 4 + gap * 3, x0 = Math.round((W - total) / 2), y = H - bh - 4;
    g.fillStyle = 'rgba(27,19,37,0.55)'; g.fillRect(0, y - 4, W, bh + 8);
    UI.button(g, 'rleft', x0, y, bw, bh, '', BTN_OPT.left);
    UI.button(g, 'rjump', x0 + bw + gap, y, bw, bh, '', BTN_OPT.jump);
    UI.button(g, 'rduck', x0 + (bw + gap) * 2, y, bw, bh, '', BTN_OPT.duck);
    UI.button(g, 'rright', x0 + (bw + gap) * 3, y, bw, bh, '', BTN_OPT.right);
  }
  const PKEYS = ['', 'rap.p1', 'rap.p2', 'rap.p3', 'rap.p4'];
  function drawHud(g, ctx) {
    const W = ctx.W, l = HUD.left();
    // place (big), then the metres to go, then the race bar with every canoe on it
    box(g, l, 4, 50, 26, 'rgba(27,19,37,0.82)', PAL.ink);
    text(g, t(PKEYS[S.place]), l + 25, 4, { align: 'center', col: S.place === 1 ? PAL.r4 : PAL.white, scale: 2 });
    const togo = Math.max(0, Math.ceil(LEN - S.d));
    const s = label('rap.togo', togo), w = Math.max(56, textW(s) + 10);
    box(g, W - w - 6, 4, w, 26, 'rgba(27,19,37,0.82)', PAL.ink);
    text(g, t('rap.dist'), W - 6 - w / 2, 4, { align: 'center', col: PAL.grey });
    text(g, s, W - 6 - w / 2, 15, { align: 'center', col: PAL.w4 });
    const bx = l + 56, bw = W - w - 12 - bx, by = 10;
    if (bw > 30) {
      UI.bar(g, bx, by + 4, bw, 7, S.d / LEN, '#3fb7ff');
      // finish flag
      rect(g, bx + bw - 2, by - 2, 1, 14, PAL.white); rect(g, bx + bw - 1, by - 2, 4, 3, PAL.r2);
      for (let i = S.rivals.length - 1; i >= 0; i--) { const r = S.rivals[i], mx = bx + Math.round(clamp(r.d / LEN, 0, 1) * (bw - 4)); rect(g, mx, by + 1, 4, 4, OUT); rect(g, mx + 1, by + 2, 2, 2, i === 2 ? '#e8b820' : i === 1 ? '#3fe0c0' : '#3fb7ff'); }
      const mx = bx + Math.round(clamp(S.d / LEN, 0, 1) * (bw - 6));
      rect(g, mx, by + 11, 6, 6, OUT); rect(g, mx + 1, by + 12, 4, 4, '#e8553d'); rect(g, mx + 2, by + 13, 2, 1, PAL.white);
    }
  }
  function draw(g, ctx) {
    layout(ctx);
    const shake = S.shake > 0 && !BRBX.reduced() ? Math.round(Math.sin(S.time * 70) * 2) : 0;
    S.camY = Math.round(S.d * S.ppm);
    g.save();
    if (S.Z > 1) g.scale(S.Z, S.Z);
    if (shake) g.translate(shake, 0);
    drawRiver(g);
    drawBanner(g, 2, 'rap.start', '#2481c4', ctx);
    drawBanner(g, LEN, 'rap.finish', '#c8641a', ctx);
    // water-level things, far to near
    const dFar = S.d + S.py / S.ppm + 10, dNear = S.d - (VW.H - S.py) / S.ppm - 10;
    for (let i = 0; i < S.nChan; i++) { const o = S.chans[i]; if (o.d > dFar || o.d + o.len < dNear) continue; drawChannel(g, o); }
    for (let i = S.nObs - 1; i >= 0; i--) { const o = S.obs[i]; if (o.d > dFar || o.d < dNear || o.kind === BRANCH || o.kind === VINE || o.kind === CHAN) continue; drawOb(g, o, ctx); }
    // canoes, far to near (rivals sorted on the fly: just three)
    for (let pass2 = 0; pass2 < 4; pass2++) {
      // draw the rivals ahead of Cappy first, then Cappy, then the ones behind
      if (pass2 < 3) {
        const r = S.rivals[pass2]; if (r.d <= S.d) continue;
        const y = yOf(r.d); if (y < -40 || y > VW.H + 10) continue;
        drawCanoe(g, laneX(r.d, r.lx), y, r.canoe, r.rider, r.jumpT, r.duckT, r.strokeT, r.boostT > 0, false, r.inv, r.spinT);
      } else {
        drawCanoe(g, laneX(S.d, S.lx), S.py, 'rap_canoe_cappy', 'cappy_up', S.jumpT, S.duckT, S.strokeT, S.boostT > 0 || S.chanOn, true, S.inv, S.spinT);
        const hat = SAVE.data.cos.hat && SPRITES['hat_' + SAVE.data.cos.hat];
        if (hat && S.duckT <= 0) { const h = S.jumpT > 0 ? Math.round(Math.sin(Math.PI * (1 - S.jumpT / JUMP_T)) * 12) : 0; spr(g, hat, laneX(S.d, S.lx) - (hat.w >> 1), S.py + 4 - h); }
      }
    }
    for (let i = 0; i < 3; i++) { const r = S.rivals[i]; if (r.d > S.d) continue; const y = yOf(r.d); if (y > VW.H + 10) continue; drawCanoe(g, laneX(r.d, r.lx), y, r.canoe, r.rider, r.jumpT, r.duckT, r.strokeT, r.boostT > 0, false, r.inv, r.spinT); }
    // overhead branches last
    for (let i = S.nObs - 1; i >= 0; i--) { const o = S.obs[i]; if (!isDuck(o.kind) || o.d > dFar || o.d < dNear) continue; if (o.kind === VINE) drawVines(g, o); else drawBranch(g, o, ctx); }
    // the approach warnings for logs and branches right ahead of Cappy
    for (let i = S.oi; i < S.nObs; i++) {
      const o = S.obs[i], ahead = o.d - S.d; if (ahead > 16) break;
      const needJump = o.kind === LOG || o.kind === FALL || (o.kind === ROLL && rollLane(o, S.time + ahead / Math.max(1, S.v)) === S.lane);
      if ((needJump && S.jumpT <= 0) || (isDuck(o.kind) && S.duckT <= 0)) {
        if (((S.time * 8) | 0) % 2) { const x = laneX(S.d, S.lx), yy = S.py - 16; (needJump ? ARROW.jump : ARROW.duck)(g, x, yy); }
        break;
      }
    }
    // rivals out of sight ahead: their face at the top edge in their lane, with an arrow, so the race is always visible
    const topY = Math.round(40 / S.Z);
    for (let i = 0; i < 3; i++) {
      const r = S.rivals[i]; if (r.finT && r.d > LEN + 40) continue;
      const y = yOf(r.d), botY = Math.round(VW.H - S.ctrlH / S.Z - 12);
      if (y < topY) {
        const x = Math.round(laneX(S.d + S.py / S.ppm, r.lx)), sp = SPRITES[r.rider];
        ARROW.jump(g, x, topY - 2);
        if (sp) spr(g, sp, x - (sp.w >> 1), topY + 4);
      } else if (y > VW.H + 4) {
        // behind, out of sight: a small arrow at the bottom edge in their lane
        ARROW.duck(g, Math.round(laneX(S.d, r.lx)), botY);
      }
    }
    g.restore();
    drawHud(g, ctx);
    drawControls(g, ctx);
  }

  function onInput(e, ctx) {
    if (e.type === 'press') {
      if (e.key === 'left') steer(-1, ctx); else if (e.key === 'right') steer(1, ctx);
      else if (e.key === 'up' || e.key === 'a') jump(ctx); else if (e.key === 'down') duck(ctx);
      return;
    }
    if (e.type === 'down') {
      const id = UI.hitAt(e.x, e.y);
      if (id === 'rleft') steer(-1, ctx); else if (id === 'rright') steer(1, ctx); else if (id === 'rjump') jump(ctx); else if (id === 'rduck') duck(ctx);
      if (id) { UI.pressId = id; UI.pressT = 0.12; }
      return;
    }
    if (e.type === 'swipe') {
      if (UI.hitAt(e.sx, e.sy)) return;
      if (e.dir === 'left') steer(-1, ctx); else if (e.dir === 'right') steer(1, ctx); else if (e.dir === 'up') jump(ctx); else duck(ctx);
      return;
    }
    if (e.type === 'tap') {
      if (UI.hitAt(e.x, e.y) || e.y > ctx.H - S.ctrlH - 4) return;
      const cx = laneX(S.d, S.lx) * S.Z;
      if (e.x < cx - 6 * S.Z) steer(-1, ctx); else if (e.x > cx + 6 * S.Z) steer(1, ctx); else jump(ctx);
    }
  }

  JC.register({
    id: 'rapids',
    champion: 'otters',
    music: 'rapids',
    start(ctx) {
      S.ctx = ctx; S.rand = ctx.rng; layout(ctx);
      buildCourse(ctx.rng);
      S.d = 0; S.prevD = 0; S.lane = 1; S.lx = 1; S.v = V0; S.slow = 1; S.boostT = 0; S.jumpT = 0; S.jumpCD = 0; S.duckT = 0; S.inv = 0; S.shake = 0;
      S.bonks = 0; S.boosts = 0; S.raceT = 0; S.place = 1; S.done = false; S.finT = 0; S.auto = false; S.autoSkill = 1; S.oi = 0; S.strokeT = 0; S.lastStroke = 0; S.time = 0;
      S.tipLog = false; S.tipBranch = false; S.tipRock = false; S.usedSteer = false; S.usedJump = false; S.usedDuck = false;
      S.sec = 0; S.tips = 0; S.spins = 0; S.drops = 0; S.fastT = 0; S.chanOn = false; S.spinT = 0;
      const starts = [[0, -3], [2, -3], [0, -12]];
      for (let i = 0; i < S.rivals.length; i++) {
        const r = S.rivals[i]; r.lane = starts[i][0]; r.lx = r.lane; r.d = starts[i][1]; r.prevD = r.d; r.v = V0; r.slow = 1; r.boostT = 0; r.jumpT = 0; r.duckT = 0; r.inv = 0; r.spinT = 0;
        r.oi = 0; r.finT = 0; r.ph = i * 2.1 + ctx.rng() * 3; r.strokeT = i * 0.3;
        for (let j = 0; j < S.nObs; j++) S.obs[j].hit &= ~r.bit;
      }
    },
    update,
    draw,
    onInput,
    outro(dt, ctx) { update(dt, ctx); },
    testState() {
      const ahead = [];
      for (let i = S.oi; i < S.nObs && ahead.length < 4; i++) { const o = S.obs[i]; if (o.d - S.d > 40) break; ahead.push({ kind: KIND_NAMES[o.kind], lanes: o.kind === ROLL ? 1 << rollLane(o, S.time) : o.lanes, ahead: Math.round((o.d - S.d) * 10) / 10 }); }
      const kinds = {}; for (let i = 0; i < S.nObs; i++) { const k = KIND_NAMES[S.obs[i].kind]; kinds[k] = (kinds[k] || 0) + 1; }
      return { d: Math.round(S.d * 10) / 10, lane: S.lane, lx: Math.round(S.lx * 100) / 100, v: Math.round(S.v * 10) / 10, place: S.place, bonks: S.bonks, boosts: S.boosts,
        raceT: Math.round(S.raceT * 100) / 100, done: S.done, jumping: S.jumpT > 0, ducking: S.duckT > 0, auto: S.auto, len: LEN, obstacles: S.nObs,
        kinds, section: S.sec, spins: S.spins, drops: S.drops, fast: Math.round(S.fastT * 10) / 10, inChannel: S.chanOn,
        rivals: S.rivals.map(r => ({ id: r.id, d: Math.round(r.d), lane: r.lane, finT: Math.round(r.finT * 10) / 10 })), ahead };
    },
    test: {
      auto(ctx, on, skill) { S.auto = !!on; S.autoSkill = skill === undefined ? 1 : +skill; return S.auto; },
      /** Jump ahead to a distance (a test seeing a later stretch without racing all of it); the rivals come along. */
      skipTo(ctx, d) { const dd = d - S.d; S.d = d; S.prevD = d; while (S.oi < S.nObs && S.obs[S.oi].d <= d) S.oi++; for (const r of S.rivals) { r.d += dd; r.prevD = r.d; while (r.oi < S.nObs && S.obs[r.oi].d <= r.d) r.oi++; } S.sec = secOf(d); return true; },
    },
    cheat(won) {
      S.place = won ? 1 : 3; S.bonks = won ? 1 : 6; S.done = true;
      return { score: won ? 2600 : 900, stars: won ? 2 : 0, won, frac: won ? 0.67 : 0.08, stats: { place: S.place } };
    },
  });
})();
