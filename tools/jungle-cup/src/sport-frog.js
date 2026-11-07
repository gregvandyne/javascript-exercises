// ======================================================================================================
// FROG CHORUS vs Rana the poison-dart frog: a call-and-response drum circle on the lily pond.
//   Rana plays a one-bar beat on her three leaf drums (low, mid, high); in the next bar you play it back in time.
//   The beats grow longer and bouncier (off-beats, then quick pairs). Each note is Perfect, Good or Miss, and a combo
//   wakes the pond's frog chorus. Rana's score climbs steadily; beat it by the end of the song (about 90 s) to win.
// Timing: our own beat clock (S.time, moved by update, so pause stops it) at 100 bpm; the groove and Rana's notes
// are scheduled a few milliseconds ahead on that clock, and every note is judged against it.
// Touch: tap the drums. Keys: Left = low, Down / Up / Space = mid, Right = high (gamepad d-pad the same, A = mid).
// ======================================================================================================
(function () {
  const BPM = 100, ST = 60 / BPM / 4, BAR = 16 * ST, ROUNDS = 18, TOTAL_BARS = 1 + ROUNDS * 2, MAXN = 160;
  const DRUM_SFX = ['drumLow', 'drumMid', 'drumHigh'];
  const DCOL = ['#3fb7ff', '#6ad34a', '#ff6fb5'];
  const DCOL_D = ['#2373ad', '#3d9a2e', '#c8427e'];
  // rhythm shapes (16ths in the bar), by tier: on the beat; with eighths; off-beats; quick pairs
  const TIERS = [
    [[0, 4, 8], [0, 8, 12], [0, 4, 8, 12], [0, 4, 12], [0, 8]],
    [[0, 4, 6, 8], [0, 2, 4, 8, 12], [0, 4, 8, 10, 12], [0, 6, 8, 12], [0, 4, 6, 12]],
    [[0, 3, 6, 8, 12], [0, 2, 6, 8, 11], [0, 3, 6, 10, 12], [0, 4, 7, 10, 12], [0, 6, 10, 12, 14]],
    [[0, 1, 4, 8, 9, 12], [0, 3, 4, 6, 8, 12, 14], [0, 2, 3, 6, 8, 10, 12], [0, 4, 5, 8, 11, 12], [0, 3, 6, 8, 9, 12, 14]],
  ];
  const S = {
    time: 0, nextStep: 0, nN: 0, open: 0, passed: 0, pts: 0, score: 0, combo: 0, maxCombo: 0, perfects: 0, goods: 0, misses: 0, wrong: 0,
    target: 0.65, lat: 0, perfW: 0.075, goodW: 0.16, done: false, auto: false, ctx: null, rana: 0,
    hitT: [9, 9, 9], hitQ: [0, 0, 0], ranaT: [9, 9, 9], lastRanaDrum: 1, cappyT: 9, cappyDrum: 1, roundFlash: 0, roundDone: -1,
    notes: [], first: new Int16Array(ROUNDS), count: new Int8Array(ROUNDS), call: new Int8Array(TOTAL_BARS * 16 + 32),
    bg: null, bgGen: -1, bgKey: 0, L: { rx: 0, ry: 0, rw: 0, rh: 0, zy: 0, zh: 0, dy: 0, dh: 0, dw: 0, dx: 0, gap: 0, k: 1 },
  };
  for (let i = 0; i < MAXN; i++) S.notes.push({ t: 0, tc: 0, drum: 0, step: 0, round: 0, j: 0, jt: 0, bot: 0, bo: 0 });

  /* ---------- art ---------- */
  const RANA_PAL2 = { o: OUT, v: '#9d5cf0', V: '#6a34b8', y: '#ffd23f', Y: '#d09a10', k: '#120e14', w: '#ffffff', l: '#c9a0ff', r: '#ff6f8a' };
  // Rana singing (mouth open) and blinking: her idle look is the shared 'rana' sprite
  sprite('frog_rana_sing', [
    '................',
    '...ooo....ooo...',
    '..owkvo..ovkwo..',
    '..okkvoooovkko..',
    '.ovvvvvvvvvvvvo.',
    '.ovyyvvvvvvyyvo.',
    'ovvvvvvvvvvvvvvo',
    'ovvkkkkkkkkkkvvo',
    'ovvkrrrrrrrrkvvo',
    '.ovvkrrrrrrkvvo.',
    '..ovykkkkkkyvo..',
    '.oVvvvllllvvvVo.',
    'oVVovvvvvvvvoVVo',
    'oyVo.oVvvVo.oVyo',
    '.oo...oooo...oo.',
    '................'], RANA_PAL2);
  sprite('frog_rana_blink', [
    '................',
    '................',
    '...ooo....ooo...',
    '..ovvvo..ovvvo..',
    '..okkkoooookkko.',
    '.ovvvvvvvvvvvvo.',
    '.ovyyvvvvvvyyvo.',
    'ovvvvvvvvvvvvvvo',
    'ovvkkkkkkkkkkvvo',
    '.ovvvvvvvvvvvvo.',
    '..ovyyvllvyyvo..',
    '.oVvvvllllvvvVo.',
    'oVVovvvvvvvvoVVo',
    'oyVo.oVvvVo.oVyo',
    '.oo...oooo...oo.',
    '................'], RANA_PAL2);
  // the pond's chorus frogs (small, two poses)
  const CHO_PAL = { o: OUT, g: '#4fc85a', G: '#2f8a3a', y: '#fff08a', k: '#120e14', w: '#ffffff', p: '#ff8ab0' };
  sprite('frog_cho', ['.oo..oo.', 'owkoowko', 'oggggggo', 'oyyyyyyo', 'oGggggGo', '.oo..oo.'], CHO_PAL);
  sprite('frog_cho2', ['.oo..oo.', 'owkoowko', 'oggggggo', 'ogppppgo', 'oGppppGo', '.oooooo.'], CHO_PAL);
  sprite('frog_pad', ['...ooooooo..', '.oogggggggoo', 'ogggGgggggGo', 'ogggggGgggo.', '.oogggggooo.', '...oooooo...'], { o: '#1f5a34', g: '#4fa83f', G: '#7cc84a' });

  /* ---------- sounds ---------- */
  AUDIO.addSfx('frogCroak', (t, b) => { const P = AUDIO.prims; P.tone(b, 'square', 180, t, 0.09, 0.08, 120); P.tone(b, 'square', 220, t + 0.08, 0.08, 0.06, 140); });
  AUDIO.addSfx('frogWrong', (t, b) => { AUDIO.prims.tone(b, 'triangle', 220, t, 0.12, 0.12, 160); });
  // the core plays a sport's song from the countdown on; ours is silent, our own beat clock plays the groove
  AUDIO.songs.frog = { bpm: BPM, steps: 16 };
  const ROOTS = ['C3', 'A2', 'F2', 'G2'];
  /** One 16th of the jungle groove (shaker, kick, a bass line, a soft marimba), plus Rana's call notes. */
  function playStep(i, delay) {
    const s = i & 15, bar = i >> 4, A = AUDIO;
    if (bar === 0) { // the count-in: four wood-block clicks
      if ((s & 3) === 0) A.tone('square', s === 0 ? 1568 : 1175, 0.04, 0.1, 0, delay);
      return;
    }
    if (bar > TOTAL_BARS) return;
    const resp = ((bar - 1) & 1) === 1, root = A.noteFreq(ROOTS[((bar - 1) >> 1) & 3]);
    if ((s & 1) === 0) A.drum('c', (s & 3) === 0 ? 0.55 : 0.32, delay);
    if (s === 0 || s === 10) A.drum('k', 0.55, delay);
    if (s === 4 || s === 12) A.drum('h', 0.4, delay);
    if (s === 0) A.tone('triangle', root, 0.32, 0.26, 0, delay);
    else if (s === 6) A.tone('triangle', root * 1.5, 0.18, 0.2, 0, delay);
    else if (s === 8) A.tone('triangle', root, 0.2, 0.22, 0, delay);
    else if (s === 14) A.tone('triangle', root * 2, 0.12, 0.18, 0, delay);
    if (resp && (s === 2 || s === 10)) A.tone('triangle', root * 4, 0.1, 0.06, 0, delay);
    if (resp && s === 7) A.tone('triangle', root * 6, 0.1, 0.05, 0, delay);
    const d = S.call[i];
    if (d) A.sfx(DRUM_SFX[d - 1], delay);
  }

  /* ---------- the chart (made once per round from the seeded generator) ---------- */
  function buildChart(ctx) {
    const rng = ctx.rng, maxTier = ctx.easy ? 2 : 3;
    S.call.fill(0);
    let n = 0, lastShape = -1;
    for (let r = 0; r < ROUNDS; r++) {
      const tier = Math.min(maxTier, r < 3 ? 0 : r < 7 ? 1 : r < 12 ? 2 : 3);
      const shapes = TIERS[tier];
      let si = (rng() * shapes.length) | 0; if (si === lastShape) si = (si + 1) % shapes.length; lastShape = si;
      const shape = shapes[si], callBar = 1 + r * 2;
      // drums: tier 0 uses two drums; later a small tune that steps between neighbours
      const pairLo = (rng() * 2) | 0;
      let drum = tier === 0 ? pairLo : (rng() * 3) | 0, same = 0;
      S.first[r] = n; S.count[r] = shape.length;
      for (let i = 0; i < shape.length; i++) {
        if (i > 0) {
          if (tier === 0) drum = rng() < 0.5 ? pairLo : pairLo + 1;
          else { const m = rng(); drum = clamp(drum + (m < 0.35 ? -1 : m < 0.7 ? 1 : m < 0.85 ? 2 * (drum === 0 ? 1 : -1) : 0), 0, 2); }
          if (drum === S.notes[n - 1].drum) same++;
          if (same >= 2 && tier > 0) { drum = (drum + 1) % 3; same = 0; }
        }
        const nt = S.notes[n++], step = shape[i];
        nt.step = step; nt.drum = drum; nt.round = r; nt.j = 0; nt.jt = 0; nt.bot = 0; nt.bo = 0;
        nt.tc = (callBar * 16 + step) * ST; nt.t = nt.tc + BAR;
        S.call[callBar * 16 + step] = drum + 1;
      }
    }
    S.nN = n;
  }

  /* ---------- playing ---------- */
  function phaseAt(time) {
    const bar = Math.floor(time / BAR);
    if (bar <= 0) return 0;              // 0 count-in
    if (bar > ROUNDS * 2) return 3;      // 3 the end
    return ((bar - 1) & 1) ? 2 : 1;      // 1 Rana's call, 2 your answer
  }
  const roundAt = time => clamp(Math.floor((Math.floor(time / BAR) - 1) / 2), 0, ROUNDS - 1);
  function judge(nt, q, ctx) {
    nt.j = q; nt.jt = S.time;
    const L = S.L, x = L.dx + nt.drum * (L.dw + L.gap) + L.dw / 2, y = L.dy - 4;
    if (q === 3) {
      S.misses++; S.combo = 0;
      UI.float(x, y, t('frog.miss'), '#ffb3d6');
      return;
    }
    S.combo++; if (S.combo > S.maxCombo) S.maxCombo = S.combo;
    const mult = Math.min(3, 1 + Math.floor(S.combo / 8) * 0.5);
    if (q === 1) { S.perfects++; S.pts += 3; S.score += Math.round(100 * mult); UI.float(x, y, t('frog.perfect'), PAL.gold2); UI.burst(x, L.dy + 6, 10, PAL.gold2, 60); }
    else { S.goods++; S.pts += 2; S.score += Math.round(60 * mult); UI.float(x, y, t('frog.good'), '#8ee070'); UI.burst(x, L.dy + 6, 6, DCOL[nt.drum], 45); }
    if (S.combo > 0 && S.combo % 10 === 0) { UI.banner(label('frog.comboBig', S.combo), PAL.r4, 0.9); ctx.sfx('frogCroak'); }
  }
  /** You hit drum d (0 low, 1 mid, 2 high) now. */
  function hit(d, ctx) {
    if (S.done) return;
    ctx.sfx(DRUM_SFX[d]);
    S.hitT[d] = 0; S.cappyT = 0; S.cappyDrum = d;
    // judged against when the sound reached the ear: the speakers' (or headphones') delay is taken off
    const tm = S.time - S.lat;
    let best = -1, bestDt = 9, other = false;
    for (let i = S.open; i < S.nN; i++) {
      const nt = S.notes[i]; if (nt.t - tm > S.goodW) break;
      if (nt.j) continue;
      const dt = Math.abs(nt.t - tm); if (dt > S.goodW) continue;
      if (nt.drum !== d) { other = true; continue; }
      if (dt < bestDt) { bestDt = dt; best = i; }
    }
    if (best >= 0) { const q = bestDt <= S.perfW ? 1 : 2; S.hitQ[d] = q; judge(S.notes[best], q, ctx); }
    else if (other || phaseAt(tm) === 2) {
      // the wrong drum, or an extra beat in your answer bar: it counts like a miss and costs a point
      // (so drumming on everything all the time never beats Rana)
      S.wrong++; S.combo = 0; S.hitQ[d] = 3; S.pts = Math.max(0, S.pts - 1); S.score = Math.max(0, S.score - 40);
      ctx.sfx('frogWrong');
      if (other) { const L = S.L; UI.float(L.dx + d * (L.dw + L.gap) + L.dw / 2, L.dy - 4, t('frog.wrong'), '#ffb3d6'); }
    }
    else S.hitQ[d] = 0;
  }
  function update(dt, ctx) {
    S.ctx = ctx; S.time += dt;
    const tm = S.time;
    for (let i = 0; i < 3; i++) { S.hitT[i] += dt; S.ranaT[i] += dt; }
    S.cappyT += dt; if (S.roundFlash > 0) S.roundFlash -= dt;
    // the groove and Rana's notes, a moment ahead on our clock (only when the sound is running)
    const ac = AUDIO.ctx, live = ac && ac.state === 'running';
    while (S.nextStep * ST < tm + 0.09) {
      const when = S.nextStep * ST - tm;
      if (live && !AUDIO.muted && when > -0.03 && !S.done) playStep(S.nextStep, Math.max(0, when));
      S.nextStep++;
    }
    // Rana's drums light up as she plays them
    const ph = phaseAt(tm);
    if (ph === 1) {
      const r = roundAt(tm), a = S.first[r], b = a + S.count[r];
      for (let i = a; i < b; i++) { const nt = S.notes[i]; if (nt.tc <= tm && nt.tc > tm - dt - 1e-6) { S.ranaT[nt.drum] = 0; S.lastRanaDrum = nt.drum; } }
    }
    // the test bot: hits each note right on time
    // (with jitter / skip set, a sloppier bot for balance checks: each note gets its own random offset)
    if (S.auto) for (let i = S.open; i < S.nN; i++) {
      const nt = S.notes[i]; if (nt.t - S.jitter > tm) break;
      if (nt.j || nt.bot === 2) continue;
      if (nt.bot === 0) { nt.bot = S.rand() < S.skip ? 2 : 1; nt.bo = (S.rand() * 2 - 1) * S.jitter; if (nt.bot === 2) continue; }
      if (tm >= nt.t + nt.bo + S.lat) { nt.bot = 2; hit(nt.drum, ctx); }
    }
    // notes whose window has closed are misses; Rana scores for every note that goes by
    while (S.open < S.nN) {
      const nt = S.notes[S.open];
      if (nt.j) { S.open++; continue; }
      if (tm > nt.t + S.goodW) { judge(nt, 3, ctx); S.open++; continue; }
      break;
    }
    while (S.passed < S.nN && S.notes[S.passed].t <= tm) S.passed++;
    S.rana = Math.round(S.passed * 3 * S.target);
    // a round just ended: praise a clean one
    const r = roundAt(tm);
    if (ph === 1 || ph === 3) {
      const pr = ph === 1 ? r - 1 : ROUNDS - 1;
      if (pr >= 0 && S.roundDone < pr && tm > S.notes[S.first[pr] + S.count[pr] - 1].t + S.goodW) {
        let clean = true, perfect = true;
        for (let i = S.first[pr]; i < S.first[pr] + S.count[pr]; i++) { const q = S.notes[i].j; if (q !== 1 && q !== 2) clean = false; if (q !== 1) perfect = false; }
        if (clean) { UI.banner(t(perfect ? 'frog.roundPerfect' : 'frog.roundClean'), perfect ? PAL.gold2 : '#8ee070', 0.9); S.roundFlash = 0.5; }
        S.roundDone = pr;
      }
    }
    if (!S.done && tm >= TOTAL_BARS * BAR + S.goodW + 0.25) finishSong(ctx);
  }
  function finishSong(ctx) {
    S.done = true;
    const max = S.nN * 3, ranaFinal = Math.round(S.nN * 3 * S.target), won = S.pts >= ranaFinal, acc = max ? S.pts / max : 0;
    const stars = won ? 1 + (acc >= 0.8 ? 1 : 0) + (acc >= 0.92 ? 1 : 0) : 0;
    const score = S.score + S.maxCombo * 10 + (won ? 500 : 0);
    if (won) { ctx.sfx('frogCroak'); UI.confetti(S.L.rcx, S.L.zy + S.L.zh / 2, 40); }
    ctx.finish({ score, stars, won, frac: won ? stars / 3 : clamp(acc / Math.max(0.01, S.target), 0, 1) * 0.3,
      stats: { you: S.pts, rana: ranaFinal, perfects: S.perfects, goods: S.goods, misses: S.misses, maxCombo: S.maxCombo, accuracy: Math.round(acc * 100) } });
  }

  /* ---------- drawing ---------- */
  function layout(ctx) {
    const W = ctx.W, H = ctx.H, L = S.L;
    // z: a zoom for the ribbon and the drums when a short, wide screen is drawn at 1x pixels
    L.z = Math.max(1, Math.floor(Math.min(W / 200, H / 160)));
    L.rx = 6; L.ry = 34; L.rw = W - 12; L.rh = 32 * L.z;
    L.gap = W < 260 ? 5 : 10;
    L.wide = W >= H * 1.5;
    L.zy = L.ry + L.rh + 16;
    if (L.wide) {
      // landscape: Rana and her pad on the left, your drums on the right
      L.zh = Math.max(30, H - 8 - L.zy);
      L.k = clamp(Math.floor((L.zh - 10) / 22), 1, 3 * L.z);
      L.rcx = Math.round(Math.max(17 * L.k + 8, W * 0.17));
      L.pad = L.zy + L.zh - 6;
      const x0 = L.rcx + 17 * L.k + 16, aw = W - 8 - x0;
      L.dh = clamp(Math.round(H * 0.32), Math.max(48, ctx.tap + 18), 84 * L.z);
      L.dw = Math.min(96 * L.z, Math.floor((aw - L.gap * 2) / 3), Math.round(L.dh * 1.25));
      L.dx = Math.round(x0 + (aw - L.dw * 3 - L.gap * 2) / 2);
      L.dy = H - L.dh - (ctx.touch ? 8 : 18);
      L.choY = L.zy + 14;
    } else {
      L.dw = Math.min(104, Math.floor((W - 16 - L.gap * 2) / 3));
      L.dh = clamp(Math.round(H * 0.22), Math.max(48, ctx.tap + 18), 96);
      L.dx = Math.round((W - L.dw * 3 - L.gap * 2) / 2);
      L.dy = H - L.dh - (ctx.touch ? 8 : 18);
      L.zh = Math.max(30, L.dy - 20 - L.zy);
      L.k = clamp(Math.floor((L.zh - 14) / 24), 1, 4);
      L.rcx = Math.round(W / 2);
      L.pad = Math.min(L.zy + L.zh - 6, L.zy + Math.round(L.zh * 0.6) + 4 * L.k);
      L.choY = L.pad - 8;
    }
  }
  function buildBg(ctx) {
    const W = ctx.W, H = ctx.H, L = S.L, c = JC.canvas2(W, H), g = c.getContext('2d');
    // dusk sky, the far jungle, the pond, the stone steps of the amphitheatre, the drum deck
    g.fillStyle = '#1b4a5a'; g.fillRect(0, 0, W, H);
    const sky = ['#2c1a4a', '#3c1f5c', '#55307e', '#7a3f8e', '#a24c8e', '#c25d9a'];
    const horizon = L.zy + Math.round(L.zh * 0.25);
    for (let y = 0; y < horizon; y += 2) { g.fillStyle = sky[Math.min(sky.length - 1, Math.floor(y / horizon * sky.length))]; g.fillRect(0, y, W, 2); }
    for (let i = 0; i < 40; i++) { const x = (JC.hash(i, 1, 3) * W) | 0, y = (JC.hash(i, 2, 3) * horizon * 0.8) | 0; g.fillStyle = i % 5 ? 'rgba(255,248,232,0.5)' : '#fff8e8'; g.fillRect(x, y, 1, 1); }
    const my = L.zy + 10; disc(g, Math.round(W * 0.84), my, 7, '#fff3c8'); disc(g, Math.round(W * 0.84) + 3, my - 2, 6, sky[Math.min(sky.length - 1, Math.floor(my / horizon * sky.length))]);
    for (let x = -10; x < W + 20; x += 14) { const h = 10 + JC.hash(x, 5, 1) * 18; disc(g, x, horizon - h * 0.4, Math.round(h * 0.6), '#24123a'); }
    g.fillStyle = '#24123a'; g.fillRect(0, horizon - 4, W, 6);
    // pond
    const py0 = horizon + 2;
    const pondB = L.wide ? H : L.dy;
    for (let y = py0; y < pondB; y += 3) { g.fillStyle = (y >> 1) % 3 ? '#1f5a6a' : '#246878'; g.fillRect(0, y, W, 1); }
    for (let i = 0; i < 26; i++) { const x = (JC.hash(i, 7, 2) * W) | 0, y = py0 + ((JC.hash(i, 8, 2) * (pondB - py0)) | 0); g.fillStyle = 'rgba(200,246,255,0.35)'; g.fillRect(x, y, 4 + (i % 3) * 2, 1); }
    // stone steps (two arcs of stones behind the pond)
    for (let row = 0; row < 2; row++) {
      const y = horizon - 2 + row * 5;
      for (let x = (row ? 6 : 0); x < W; x += 12) { box(g, x, y, 11, 5, row ? '#8a8478' : '#6a645a', OUT); g.fillStyle = '#c8c2b4'; g.fillRect(x + 2, y + 1, 3, 1); }
    }
    // lily pads and reeds
    const P = SPRITES.frog_pad;
    for (let i = 0; i < 9; i++) { const x = (JC.hash(i, 9, 4) * (W - 12)) | 0, y = py0 + 12 + ((JC.hash(i, 10, 4) * Math.max(8, pondB - py0 - 30)) | 0); g.drawImage(P.c, x, y); if (i % 3 === 0) { g.fillStyle = PAL.p3; g.fillRect(x + 5, y + 1, 2, 2); } }
    for (let x = 0; x < W; x += W - 10) for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? PAL.g3 : PAL.g2; g.fillRect(x + i * 2, py0 - 8 + (i % 3) * 3, 1, 22); g.fillStyle = '#8a5a33'; g.fillRect(x + i * 2, py0 - 10 + (i % 3) * 3, 1, 4); }
    // Rana's big lily pad
    const cx = L.rcx, ry = L.pad, k = L.k;
    oval(g, cx, ry, 30 * k, 6 * k, '#1f5a34'); oval(g, cx, ry - 1, 29 * k, 5 * k, PAL.g3); oval(g, cx, ry - 2, 22 * k, 3 * k, PAL.g4);
    g.fillStyle = '#1b4a5a'; g.fillRect(cx + 18 * k, ry - 2, 12 * k, 2);
    // the drum deck: planks
    const dy = L.dy - 14, x0 = L.wide ? L.dx - 12 : 0, dw = W - x0;
    if (L.wide) { g.fillStyle = '#3d2414'; g.fillRect(x0 - 2, dy, 2, H - dy); }
    g.fillStyle = '#5e3a20'; g.fillRect(x0, dy, dw, H - dy);
    for (let y = dy; y < H; y += 6) { g.fillStyle = '#8a5a33'; g.fillRect(x0, y, dw, 5); g.fillStyle = '#9a6a3f'; g.fillRect(x0, y, dw, 1); for (let x = x0 + ((y / 6) | 0) % 2 * 20; x < W; x += 40) { g.fillStyle = '#5e3a20'; g.fillRect(x, y, 1, 5); } }
    g.fillStyle = '#3d2414'; g.fillRect(x0, dy, dw, 2);
    S.bg = c; S.bgGen = VIEW.gen; S.bgKey = L.dy * 1000 + L.zy + (ctx.touch ? 0.5 : 0);
  }
  /** A leaf drum: wooden body with rope, a leaf skin in the drum's colour with 1-3 dots (low, mid, high). */
  function drawDrum(g, x, y, w, h, d, lit, q) {
    const ry = Math.max(4, Math.round(w * 0.16)), rx = Math.floor(w / 2) - 1, cx = x + Math.floor(w / 2), sq = lit > 0 ? Math.round(lit * 3) : 0;
    const top = y + ry + sq, bot = y + h - ry;
    // body
    oval(g, cx, bot, rx, ry, OUT); oval(g, cx, bot - 1, rx - 1, ry - 1, '#7a4a26');
    rect(g, x + 1, top, w - 2, bot - top, OUT);
    rect(g, x + 2, top, w - 4, bot - top, '#9a6234');
    for (let sx = x + 5; sx < x + w - 4; sx += 7) rect(g, sx, top, 2, bot - top + ry - 2, '#7a4a26');
    rect(g, x + 2, top, 3, bot - top, '#c48a4c');
    // rope zigzag
    for (let zx = x + 3, i = 0; zx < x + w - 4; zx += 4, i++) line(g, zx, top + 4 + (i & 1 ? 6 : 0), zx + 4, top + 4 + (i & 1 ? 0 : 6), '#f4e4bc');
    rect(g, x + 2, top + 2, w - 4, 2, '#5e3a20'); rect(g, x + 2, bot - ry - 2, w - 4, 2, '#5e3a20');
    // skin
    const skin = lit > 0.5 ? '#ffffff' : lit > 0 ? shade(DCOL[d], 0.6) : DCOL[d];
    oval(g, cx, top, rx + 1, ry + 1, OUT); oval(g, cx, top, rx, ry, DCOL_D[d]); oval(g, cx, top - 1, rx - 2, ry - 1, skin);
    rect(g, cx - Math.round(rx * 0.5), top - ry + 2, Math.round(rx * 0.4), 1, shade(skin, 0.5));
    line(g, cx - rx + 4, top, cx + rx - 4, top, shade(DCOL_D[d], 0.1));
    // dots: 1 low, 2 mid, 3 high (shape as well as colour)
    for (let i = 0; i <= d; i++) disc(g, cx + (i - d / 2) * 7, top - 1, 2, lit > 0.5 ? DCOL_D[d] : '#fff8e8');
    if (lit > 0 && q) { g.globalAlpha = lit; oval(g, cx, top, rx + 4, ry + 3, q === 1 ? PAL.gold2 : q === 2 ? '#8ee070' : '#ff8a8a'); g.globalAlpha = 1; oval(g, cx, top, rx + 1, ry + 1, OUT); oval(g, cx, top, rx, ry, skin); }
  }
  const KEYICON = [
    (g, cx, cy) => { for (let i = 0; i < 4; i++) rect(g, cx - 3 + i, cy - i, 1, i * 2 + 1, PAL.white); rect(g, cx + 1, cy - 1, 3, 3, PAL.white); },
    (g, cx, cy) => { for (let i = 0; i < 4; i++) rect(g, cx - i, cy + 3 - i, i * 2 + 1, 1, PAL.white); rect(g, cx - 1, cy - 3, 3, 3, PAL.white); },
    (g, cx, cy) => { for (let i = 0; i < 4; i++) rect(g, cx + 3 - i, cy - i, 1, i * 2 + 1, PAL.white); rect(g, cx - 3, cy - 1, 3, 3, PAL.white); },
  ];
  function drawRibbon(g, ctx, ph, r) {
    const L = S.L, x = L.rx, y = L.ry, w = L.rw, h = L.rh, tm = S.time;
    const edge = ph === 2 ? (S.roundFlash > 0 ? PAL.gold2 : PAL.r4) : PAL.ink;
    box(g, x, y, w, h, 'rgba(27,19,37,0.86)', edge);
    if (ph === 2) { rect(g, x + 1, y, w - 2, 1, PAL.r4); rect(g, x + 1, y + h - 1, w - 2, 1, PAL.r4); }
    const z = L.z, lx = x + 12 * z, cw = (w - 16 * z) / 16, rowY = d => y + h - 8 * z - d * 9 * z;
    for (let d = 0; d < 3; d++) { disc(g, x + 6 * z, rowY(d), 2 * z, DCOL[d]); rect(g, lx, rowY(d), w - 16 * z, z, 'rgba(255,248,232,0.08)'); }
    for (let b = 0; b <= 4; b++) rect(g, Math.round(lx + b * 4 * cw), y + 3, 1, h - 6, b % 4 ? 'rgba(255,248,232,0.22)' : 'rgba(255,248,232,0.4)');
    const barStart = Math.floor(tm / BAR) * BAR, f = (tm - barStart) / BAR, px = Math.round(lx + f * 16 * cw);
    if (ph === 0) {
      for (let b = 0; b < 4; b++) { const on = f * 4 >= b; disc(g, Math.round(lx + (b * 4 + 0.5) * cw), y + h / 2, (on ? 3 : 2) * z, on ? PAL.r4 : PAL.grey2); }
    } else if (ph === 1 || ph === 2) {
      const a = S.first[r], n = S.count[r];
      for (let i = a; i < a + n; i++) {
        const nt = S.notes[i], nx = Math.round(lx + (nt.step + 0.5) * cw), ny = rowY(nt.drum);
        if (ph === 1) {
          if (nt.tc > tm) continue;
          const pop = clamp((tm - nt.tc) / 0.12, 0, 1);
          disc(g, nx, ny, (pop < 1 ? 5 : 4) * z, OUT); disc(g, nx, ny, 3 * z, DCOL[nt.drum]);
        } else {
          // your turn: hollow targets that fill when you hit them
          const col = nt.j === 1 ? PAL.gold2 : nt.j === 2 ? '#8ee070' : nt.j === 3 ? PAL.grey2 : DCOL[nt.drum];
          disc(g, nx, ny, 4 * z, OUT);
          if (nt.j === 1 || nt.j === 2) disc(g, nx, ny, 3 * z, col);
          else { disc(g, nx, ny, 3 * z, col); disc(g, nx, ny, z, OUT); }
          if (nt.j === 3) { line(g, nx - 2 * z, ny - 2 * z, nx + 2 * z, ny + 2 * z, '#ff8a8a'); line(g, nx + 2 * z, ny - 2 * z, nx - 2 * z, ny + 2 * z, '#ff8a8a'); }
        }
      }
    }
    if (ph === 1 || ph === 2) { rect(g, px, y + 2, z, h - 4, ph === 2 ? PAL.r4 : PAL.p4); rect(g, px - z, y + 1, 3 * z, 2 * z, ph === 2 ? PAL.r4 : PAL.p4); }
    // status line under the ribbon
    const sy = y + h + 2;
    const msg = ph === 0 ? 'frog.ready' : ph === 1 ? 'frog.listen' : ph === 2 ? 'frog.yourTurn' : 'frog.end';
    text(g, t(msg), x + 2, sy, { col: ph === 2 ? PAL.r4 : PAL.p4 });
    const rs = label('frog.round', r + 1);
    if (S.combo >= 2) text(g, label('frog.combo', S.combo), x + w - 2, sy, { align: 'right', col: PAL.gold2 });
    else text(g, rs, x + w - 2, sy, { align: 'right', col: PAL.cream });
  }
  function draw(g, ctx) {
    layout(ctx);
    const L = S.L, W = ctx.W, tm = S.time, ph = phaseAt(tm), r = roundAt(tm);
    const key = L.dy * 1000 + L.zy + (ctx.touch ? 0.5 : 0);
    if (S.bgGen !== VIEW.gen || S.bgKey !== key || !S.bg) buildBg(ctx);
    g.drawImage(S.bg, 0, 0);
    const beat = (tm / (ST * 4)) % 1, bop = beat < 0.2 ? 1 : 0;
    // fireflies
    for (let i = 0; i < 10; i++) {
      const fx = Math.round(W * ((i * 0.137 + 0.05) % 1) + Math.sin(tm * 0.7 + i) * 10), fy = Math.round(L.zy + 4 + ((i * 0.29) % 1) * L.zh * 0.7 + Math.cos(tm * 0.9 + i * 2) * 6);
      if (((tm * 2 + i * 0.37) % 2) < 1.4) { rect(g, fx, fy, 1, 1, '#fff3a8'); g.globalAlpha = 0.3; rect(g, fx - 1, fy - 1, 3, 3, '#fff3a8'); g.globalAlpha = 1; }
    }
    // the chorus: frogs wake on the pads as your combo grows, and bop on the beat
    const awake = Math.min(8, Math.floor(S.combo / 3));
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1, col = (i >> 1), x = clamp(Math.round(L.rcx + side * (L.wide ? 20 * L.k + 10 + col * 16 : Math.min(W * 0.46, 46 * L.k + 22 + col * 22)) - 4), 2, W - 12);
      const y = Math.round(L.choY - col * 6 - (i & 2 ? 4 : 0) + (L.wide ? col * 12 : 0));
      spr(g, SPRITES.frog_pad, x - 2, y + 5);
      if (i < awake) spr(g, bop && (i + ((tm * 2) | 0)) % 2 ? SPRITES.frog_cho2 : SPRITES.frog_cho, x, y - (bop ? 1 : 0));
    }
    // Rana on her pad with her three small drums
    const k = L.k, cx = L.rcx, padY = L.pad;
    const singing = S.ranaT[0] < 0.18 || S.ranaT[1] < 0.18 || S.ranaT[2] < 0.18;
    const blink = !singing && (tm % 3.3) < 0.14;
    const rs = singing ? SPRITES.frog_rana_sing : blink ? SPRITES.frog_rana_blink : SPRITES.rana;
    const hop = singing ? k * 2 : bop && ph !== 3 ? k : 0;
    const mdw = 10 * k, mdh = 8 * k, mdy = padY - mdh - 1, rTop = mdy + 3 * k - 16 * k - hop;
    shadow(g, cx, padY - 2, 12 * k);
    sprK(g, rs, cx - 8 * k, rTop, k);
    for (let d = 0; d < 3; d++) {
      const mx = cx + (d - 1) * (mdw + 2 * k) - (mdw >> 1);
      const lit = clamp(1 - S.ranaT[d] / 0.2, 0, 1);
      drawDrum(g, mx, mdy, mdw, mdh, d, lit, 0);
      if (lit > 0) { // a drumstick from Rana's hand to the drum
        const hx = cx + (d === 0 ? -6 : d === 2 ? 6 : 0) * k, hy = rTop + 11 * k;
        line(g, hx, hy, mx + (mdw >> 1), mdy + 2, '#e8bd7c'); disc(g, mx + (mdw >> 1), mdy + 2, 1 + (k >> 1), '#fff8e8');
      }
    }
    // the big drums: yours (tap targets), approach rings for the next notes, Cappy behind them
    const kc = clamp(Math.floor(L.dh / 30), 1, 3), cappyLit = S.cappyT < 0.15, live = RUN.phase === 'play' || RUN.phase === 'count';
    const cs = SPRITES[cappyLit ? 'cappy_down_w' : 'cappy_down'];
    const ccx = L.dx + L.dw + L.gap + (L.dw >> 1);
    if (cs) sprK(g, cs, ccx - 8 * kc, L.dy - 16 * kc + 4 - (cappyLit ? 2 : bop && ph === 2 ? 1 : 0), kc);
    const hat = SAVE.data.cos.hat && SPRITES['hat_' + SAVE.data.cos.hat]; if (hat && kc === 1) spr(g, hat, ccx - (hat.w >> 1), L.dy - 16 + 1 - (cappyLit ? 2 : 0));
    for (let d = 0; d < 3; d++) {
      const x = L.dx + d * (L.dw + L.gap), lit = clamp(1 - S.hitT[d] / 0.16, 0, 1);
      if (live) UI.addHit(DRUM_IDS[d], x, L.dy - 6, L.dw, L.dh + 6);
      drawDrum(g, x, L.dy, L.dw, L.dh, d, lit, S.hitQ[d]);
      if (!ctx.touch) { box(g, x + (L.dw >> 1) - 7, L.dy + L.dh + 2, 14, 12, '#3a2a4a', PAL.ink); KEYICON[d](g, x + (L.dw >> 1), L.dy + L.dh + 7); }
    }
    if (cappyLit) { const tx = L.dx + S.cappyDrum * (L.dw + L.gap) + (L.dw >> 1); line(g, ccx + (S.cappyDrum - 1) * 4 * kc, L.dy - 6 * kc, tx, L.dy + 2, '#e8bd7c'); }
    if (ph === 2 || ph === 1) {
      // approach rings: the next note on each drum, closing in as its moment comes
      for (let i = S.open; i < S.nN; i++) {
        const nt = S.notes[i], ahead = nt.t - tm; if (ahead > 0.6) break;
        if (nt.j || ahead < -0.05) continue;
        const x = L.dx + nt.drum * (L.dw + L.gap), rx = Math.floor(L.dw / 2) - 1, ry = Math.max(4, Math.round(L.dw * 0.16)), grow = Math.max(0, ahead) / 0.6;
        g.globalAlpha = 1 - grow * 0.6;
        const ex = Math.round(rx + 2 + grow * 14), ey = Math.round(ry + 2 + grow * 8), ccx = x + Math.floor(L.dw / 2), ccy = L.dy + ry;
        // a pixel ellipse outline (eight points per quarter is plenty)
        for (let a = 0; a < 32; a++) { const an = a / 32 * Math.PI * 2; rect(g, ccx + Math.round(Math.cos(an) * ex), ccy + Math.round(Math.sin(an) * ey), 2, 1, ahead < S.perfW ? PAL.gold2 : PAL.white); }
        g.globalAlpha = 1;
      }
    }
    drawRibbon(g, ctx, ph, r);
    drawVersus(g, ctx);
    if (ctx.firstTime && tm < BAR * 3 && ph !== 3) {
      const hk = ctx.touch ? 'frog.hintTouch' : 'frog.hintKeys';
      textBlock(g, t(hk), 8, L.zy, W - 16, HINT);
    }
  }
  const HINT = { align: 'center', col: '#fff8e8' };
  /** Two score panels like JC.hud.versus, but with plain bars (the scores run into the hundreds) and Rana's mark on yours. */
  function drawVersus(g, ctx) {
    const l = HUD.left(), W = ctx.W, wAll = W - l - 6, w = Math.min(150, (wAll - 6) / 2) | 0, y = 4, max = Math.max(1, S.nN * 3);
    for (let i = 0; i < 2; i++) {
      const x = i ? W - 6 - w : l, sc = i ? S.rana : S.pts, col = i ? '#b06cff' : '#45c34e';
      box(g, x, y, w, 26, 'rgba(27,19,37,0.82)', PAL.ink);
      text(g, t(i ? 'name.rana' : 'name.cappy'), i ? x + w - 4 : x + 4, y + 1, { col: PAL.white, align: i ? 'right' : 'left' });
      const s = label(i ? 'frog.ptsB' : 'frog.ptsA', sc), sw = textW(s);
      text(g, s, i ? x + w - 4 : x + 4, y + 13, { col, align: i ? 'right' : 'left' });
      const bx = i ? x + 4 : x + sw + 8, bw = w - sw - 12;
      if (bw > 10) {
        UI.bar(g, bx, y + 15, bw, 7, sc / max, col);
        if (!i) { const mx = bx + Math.round(bw * S.rana / max); rect(g, mx, y + 13, 1, 11, '#d8b4ff'); rect(g, mx - 1, y + 13, 3, 1, '#d8b4ff'); }
      }
    }
  }
  const DRUM_IDS = ['drum0', 'drum1', 'drum2'];
  const KEY_DRUM = { left: 0, down: 1, up: 1, a: 1, right: 2 };

  JC.register({
    id: 'frog',
    champion: 'rana',
    music: 'frog',
    start(ctx) {
      S.ctx = ctx; layout(ctx);
      S.time = 0; S.nextStep = 0; S.open = 0; S.passed = 0; S.pts = 0; S.score = 0; S.combo = 0; S.maxCombo = 0; S.perfects = 0; S.goods = 0; S.misses = 0; S.wrong = 0;
      S.done = false; S.auto = false; S.jitter = 0; S.skip = 0; S.rand = ctx.rng; S.rana = 0; S.roundFlash = 0; S.roundDone = -1;
      for (let i = 0; i < 3; i++) { S.hitT[i] = 9; S.ranaT[i] = 9; S.hitQ[i] = 0; }
      S.target = ctx.easy ? 0.45 : 0.65;
      // the output delay of the speakers or headphones (Bluetooth can be 0.2 s), at most 0.25 s
      S.lat = 0; try { const ac = AUDIO.ctx; if (ac) S.lat = clamp((ac.outputLatency || 0) || (ac.baseLatency || 0), 0, 0.25); } catch (e) { S.lat = 0; } S.perfW = ctx.easy ? 0.1 : 0.075; S.goodW = ctx.easy ? 0.22 : 0.16;
      buildChart(ctx);
    },
    update,
    draw,
    onInput(e, ctx) {
      if (e.type === 'press') { const d = KEY_DRUM[e.key]; if (d !== undefined) hit(d, ctx); return; }
      if (e.type === 'down') { const id = UI.hitAt(e.x, e.y); const d = DRUM_IDS.indexOf(id); if (d >= 0) hit(d, ctx); }
    },
    outro(dt, ctx) { S.time += dt; for (let i = 0; i < 3; i++) { S.hitT[i] += dt; S.ranaT[i] += dt; } void ctx; },
    testState() {
      let next = null;
      for (let i = S.open; i < S.nN; i++) { const nt = S.notes[i]; if (!nt.j) { next = { t: Math.round(nt.t * 1000) / 1000, drum: nt.drum, inS: Math.round((nt.t - S.time) * 1000) / 1000, round: nt.round }; break; } }
      const ph = phaseAt(S.time);
      return { time: Math.round(S.time * 1000) / 1000, phase: ['count', 'call', 'answer', 'end'][ph], round: roundAt(S.time) + 1, rounds: ROUNDS, notes: S.nN,
        you: S.pts, rana: S.rana, max: S.nN * 3, target: S.target, combo: S.combo, maxCombo: S.maxCombo, perfects: S.perfects, goods: S.goods, misses: S.misses, wrong: S.wrong,
        score: S.score, done: S.done, auto: S.auto, next, songSecs: Math.round(TOTAL_BARS * BAR * 10) / 10 };
    },
    test: {
      auto(ctx, on, jitter, skip) { S.auto = !!on; S.jitter = +jitter || 0; S.skip = +skip || 0; return S.auto; },
    },
    cheat(won) {
      const max = S.nN * 3 || 270;
      S.pts = won ? Math.round(max * 0.85) : Math.round(max * 0.3);
      return { score: won ? 9000 : 2000, stars: won ? 2 : 0, won, frac: won ? 0.67 : 0.15 };
    },
  });
})();
