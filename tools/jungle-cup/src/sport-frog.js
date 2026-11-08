// ======================================================================================================
// FROG CHORUS vs Rana the poison-dart frog: fireflies float down three jungle streams to your three leaf drums.
//   Tap each drum as its firefly reaches the drum's ring (Perfect / Good). Hits in a row build a streak and a
//   x2 / x3 / x4 multiplier; a long streak starts a Frog Frenzy (double points for a few bars, the streams glow, the
//   whole pond sings). Missing a firefly only ends the streak. Tapping a drum with no firefly near does nothing, but
//   the drum stays quiet for a moment, so drumming on everything all the time never wins. Rana drums along on her
//   pad; score more than her by the end of the song (about 85 s) to win.
// Timing: our own beat clock (S.time, moved by update, so pause stops it) at 100 bpm; the groove is scheduled a few
// milliseconds ahead on that clock and every tap is judged against it, minus the speakers' / headphones' delay.
// Touch: tap the drums. Keys: Left (A) = low, Down (S) / Up / Space = mid, Right (D) = high (gamepad d-pad the same).
// ======================================================================================================
(function () {
  const BPM = 100, ST = 60 / BPM / 4, BAR = 16 * ST, SONG_BARS = 34, MAXN = 220;
  const DRUM_SFX = ['drumLow', 'drumMid', 'drumHigh'];
  const DCOL = ['#3fb7ff', '#6ad34a', '#ff6fb5'];
  const DCOL_D = ['#2373ad', '#3d9a2e', '#c8427e'];
  const FRENZY_AT = 20, FRENZY_BARS = 4, LOCK = 0.6, NEAR = 0.35, GRACE = 0.15;
  // rhythm shapes (16ths in the bar) by part of the song: two a bar, then on every beat, then a few simple pairs
  const PARTS = [
    { to: 4, easy: [[0, 8]], norm: [[0, 8]] },
    { to: 12, easy: [[0, 8], [0, 4, 8, 12]], norm: [[0, 4, 8, 12]] },
    { to: 20, easy: [[0, 4, 8, 12], [0, 8, 12]], norm: [[0, 4, 8, 12], [0, 4, 8, 12], [0, 4, 6, 8, 12], [0, 4, 8, 12, 14]] },
    { to: 28, easy: [[0, 4, 8, 12]], norm: [[0, 4, 8, 12], [0, 2, 4, 8, 12], [0, 4, 8, 10, 12], [0, 6, 8, 12], [0, 4, 6, 8, 12]] },
    { to: 33, easy: [[0, 4, 8, 12], [0, 4, 8, 10, 12]], norm: [[0, 4, 6, 8, 12], [0, 2, 4, 8, 12, 14], [0, 4, 8, 10, 12], [0, 4, 6, 8, 10, 12]] },
    { to: 34, easy: [[0]], norm: [[0]] },
  ];
  const S = {
    time: 0, nextStep: 0, nN: 0, open: 0, passed: 0, pts: 0, score: 0, combo: 0, maxCombo: 0, perfects: 0, goods: 0, misses: 0, wrong: 0,
    target: 0.6, lat: 0, perfW: 0.07, goodW: 0.15, look: 2, done: false, auto: false, ctx: null, rana: 0, frenzyEnd: 0, frenzies: 0, frenzyNext: FRENZY_AT,
    hitT: [9, 9, 9], hitQ: [0, 0, 0], ranaT: [9, 9, 9], lock: [0, 0, 0], lastHit: [-9, -9, -9], cappyT: 9, cappyDrum: 1,
    mash: 0, mashT: [0, 0, 0], jitter: 0, skip: 0, rand: Math.random,
    notes: [], bg: null, bgGen: -1, bgKey: 0,
    L: { rx: 0, ry: 0, rw: 0, rh: 0, zy: 0, zh: 0, dy: 0, dh: 0, dw: 0, dx: 0, gap: 0, k: 1, top: 0, hitY: 0, wide: false },
  };
  for (let i = 0; i < MAXN; i++) S.notes.push({ t: 0, drum: 0, j: 0, jt: 0, bot: 0, bo: 0 });

  // Rana's mark: the share of the best possible score she reaches (tuned with simulated players)
  const TARGET = 0.81, TARGET_EASY = 0.77, FORM = 0.15; // + or - FORM: Rana has good songs and so-so ones
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
  AUDIO.addSfx('frogSpark', (t, b) => { const P = AUDIO.prims; P.tone(b, 'triangle', 1320, t, 0.05, 0.05, 1760); P.tone(b, 'triangle', 1760, t + 0.04, 0.06, 0.04, 2093); });
  // the core plays a sport's song from the countdown on; ours is silent, our own beat clock plays the groove
  AUDIO.songs.frog = { bpm: BPM, steps: 16 };
  const ROOTS = ['C3', 'A2', 'F2', 'G2'];
  /** One 16th of the jungle groove (shaker, kick, a bass line, a soft marimba that grows with the song). */
  function playStep(i, delay) {
    const s = i & 15, bar = i >> 4, A = AUDIO;
    if (bar === 0) { // the count-in: four wood-block clicks
      if ((s & 3) === 0) A.tone('square', s === 0 ? 1568 : 1175, 0.04, 0.1, 0, delay);
      return;
    }
    if (bar > SONG_BARS) return;
    const root = A.noteFreq(ROOTS[((bar - 1) >> 1) & 3]), late = bar > 12, fr = S.time < S.frenzyEnd;
    if ((s & 1) === 0) A.drum('c', (s & 3) === 0 ? 0.55 : 0.32, delay);
    if (s === 0 || s === 10) A.drum('k', 0.55, delay);
    if (s === 4 || s === 12) A.drum('h', 0.4, delay);
    if (s === 0) A.tone('triangle', root, 0.32, 0.26, 0, delay);
    else if (s === 6) A.tone('triangle', root * 1.5, 0.18, 0.2, 0, delay);
    else if (s === 8) A.tone('triangle', root, 0.2, 0.22, 0, delay);
    else if (s === 14) A.tone('triangle', root * 2, 0.12, 0.18, 0, delay);
    if (late && (s === 2 || s === 10)) A.tone('triangle', root * 4, 0.1, 0.06, 0, delay);
    if ((late || fr) && s === 7) A.tone('triangle', root * 6, 0.1, 0.05, 0, delay);
    if (fr && (s === 3 || s === 11)) A.tone('square', root * 8, 0.05, 0.04, 0, delay);
  }

  /* ---------- the chart (made once from the seeded generator) ---------- */
  function buildChart(ctx) {
    const rng = ctx.rng;
    let n = 0, drum = 1, run = 0, lastT = -9, part = 0;
    for (let bar = 1; bar <= SONG_BARS; bar++) {
      while (bar > PARTS[part].to) part++;
      const list = ctx.easy ? PARTS[part].easy : PARTS[part].norm;
      // the plain pattern most of the time; a little shape now and then
      const shape = list.length === 1 || rng() < 0.45 ? list[0] : list[1 + ((rng() * (list.length - 1)) | 0)];
      for (let i = 0; i < shape.length && n < MAXN; i++) {
        const t = (bar * 16 + shape[i]) * ST + BAR;  // + one bar: notes reach the drums a bar after the count-in
        const quick = t - lastT < ST * 2.5;
        let nd = drum;
        if (n > 0) {
          const m = rng();
          if (quick) nd = m < 0.5 ? drum : clamp(drum + (m < 0.75 ? -1 : 1), 0, 2); // quick pairs stay close
          else nd = m < 0.3 ? drum : clamp(drum + (m < 0.65 ? -1 : 1), 0, 2);
          if (nd === drum && nd === 1 && run >= 2) nd = rng() < 0.5 ? 0 : 2;
          if (nd === drum && run >= 2) nd = drum === 0 ? 1 : drum === 2 ? 1 : (rng() < 0.5 ? 0 : 2);
          if (nd === drum && (drum === 0 || drum === 2) && clamp(drum + (drum ? -1 : 1), 0, 2) === drum) nd = 1;
        }
        run = nd === drum ? run + 1 : 0; drum = nd;
        const nt = S.notes[n++]; nt.t = t; nt.drum = drum; nt.j = 0; nt.jt = 0; nt.bot = 0; nt.bo = 0;
        lastT = t;
      }
    }
    S.nN = n;
  }
  const songEnd = () => (SONG_BARS + 2) * BAR;

  /* ---------- playing ---------- */
  const laneX = d => S.L.dx + d * (S.L.dw + S.L.gap) + S.L.dw / 2;
  const mult = () => Math.min(4, 1 + Math.floor(S.combo / 10));
  function judge(nt, q, ctx) {
    nt.j = q; nt.jt = S.time;
    const L = S.L, x = laneX(nt.drum), y = L.hitY - 14;
    if (q === 3) { S.misses++; S.combo = 0; UI.float(x, y, t('frog.miss'), '#ffb3d6'); return; }
    S.combo++; if (S.combo > S.maxCombo) S.maxCombo = S.combo;
    const fz = S.time < S.frenzyEnd ? 2 : 1, m = mult() * fz;
    if (q === 1) { S.perfects++; S.pts += 3; S.score += 100 * m; UI.float(x, y, t('frog.perfect'), PAL.gold2); UI.burst(x, L.hitY, 10, PAL.gold2, 60); }
    else { S.goods++; S.pts += 2; S.score += 60 * m; UI.float(x, y, t('frog.good'), '#8ee070'); UI.burst(x, L.hitY, 6, DCOL[nt.drum], 45); }
    if (S.combo === 10 || S.combo === 20 || S.combo === 30) ctx.sfx('frogSpark');
    if (S.combo >= S.frenzyNext && S.time >= S.frenzyEnd) {
      S.frenzyEnd = S.time + FRENZY_BARS * BAR; S.frenzies++; S.frenzyNext = S.combo + FRENZY_AT;
      UI.banner(t('frog.frenzy'), PAL.gold2, 0.9); ctx.sfx('frogCroak');
    } else if (S.combo > 0 && S.combo % 10 === 0) UI.banner(label('frog.comboBig', S.combo), PAL.r4, 0.9);
  }
  /** You hit drum d (0 low, 1 mid, 2 high) now. */
  function hit(d, ctx) {
    if (S.done) return;
    ctx.sfx(DRUM_SFX[d]);
    S.hitT[d] = 0; S.cappyT = 0; S.cappyDrum = d; S.hitQ[d] = 0;
    // judged against when the sound reached the ear: the speakers' (or headphones') delay is taken off
    const tm = S.time - S.lat;
    if (tm - S.lastHit[d] < GRACE) return;                  // a double tap right after a hit: ignored
    if (tm < S.lock[d]) { S.lock[d] = tm + LOCK; S.wrong++; return; } // still drumming wildly: the drum stays quiet
    let best = -1, bestDt = 9, near = false;
    for (let i = S.open; i < S.nN; i++) {
      const nt = S.notes[i]; if (nt.t - tm > NEAR) break;
      if (nt.j || nt.drum !== d) continue;
      const dt = Math.abs(nt.t - tm); if (dt <= NEAR) near = true;
      if (dt <= S.goodW && dt < bestDt) { bestDt = dt; best = i; }
    }
    if (best >= 0) { const q = bestDt <= S.perfW ? 1 : 2; S.hitQ[d] = q; S.lastHit[d] = tm; judge(S.notes[best], q, ctx); return; }
    if (!near) { S.lock[d] = tm + LOCK; S.wrong++; return; }   // no firefly near this drum: nothing happens
    // a firefly is close but not there yet (or just gone by): a gentle nudge, nothing lost
    for (let i = S.open; i < S.nN; i++) {
      const nt = S.notes[i]; if (nt.t - tm > NEAR) break;
      if (!nt.j && nt.drum === d) { UI.float(laneX(d), S.L.hitY - 26, t(nt.t > tm ? 'frog.early' : 'frog.late'), PAL.cream); break; }
    }
  }
  function update(dt, ctx) {
    S.ctx = ctx; S.time += dt;
    const tm = S.time;
    for (let i = 0; i < 3; i++) { S.hitT[i] += dt; S.ranaT[i] += dt; }
    S.cappyT += dt;
    // the groove, a moment ahead on our clock (only when the sound is running)
    const ac = AUDIO.ctx, live = ac && ac.state === 'running';
    while (S.nextStep * ST < tm + 0.09) {
      const when = S.nextStep * ST - tm;
      if (live && !AUDIO.muted && when > -0.03 && !S.done) playStep(S.nextStep, Math.max(0, when));
      S.nextStep++;
    }
    // the test bot: hits each note on time (jitter / skip: a sloppier player; mash: drums on every drum all the time)
    if (S.auto) for (let i = S.open; i < S.nN; i++) {
      const nt = S.notes[i]; if (nt.t - S.jitter - 0.05 > tm) break;
      if (nt.j || nt.bot === 2) continue;
      if (nt.bot === 0) { nt.bot = S.rand() < S.skip ? 2 : 1; nt.bo = S.jitter ? (S.rand() + S.rand() + S.rand() - 1.5) / 1.5 * S.jitter : 0; if (nt.bot === 2) continue; }
      if (tm >= nt.t + nt.bo + S.lat) { nt.bot = 2; hit(nt.drum, ctx); }
    }
    if (S.mash > 0 && !S.done && tm > BAR) for (let d = 0; d < 3; d++) {
      S.mashT[d] -= dt;
      if (S.mashT[d] <= 0) { S.mashT[d] = (0.7 + S.rand() * 0.6) / S.mash; hit(d, ctx); }
    }
    // fireflies whose window has closed are misses; Rana drums along and scores for every one that goes by
    while (S.open < S.nN) {
      const nt = S.notes[S.open];
      if (nt.j) { S.open++; continue; }
      if (tm - S.lat > nt.t + S.goodW) { judge(nt, 3, ctx); S.open++; continue; }
      break;
    }
    while (S.passed < S.nN && S.notes[S.passed].t <= tm) { S.ranaT[S.notes[S.passed].drum] = 0; S.passed++; }
    S.rana = Math.round(S.passed * 3 * S.target);
    if (!S.done && tm >= songEnd()) finishSong(ctx);
  }
  function finishSong(ctx) {
    S.done = true;
    const max = S.nN * 3, ranaFinal = Math.round(S.nN * 3 * S.target), won = S.pts > ranaFinal, acc = max ? S.pts / max : 0;
    const stars = won ? 1 + (acc >= 0.8 ? 1 : 0) + (acc >= 0.9 && S.maxCombo >= 30 ? 1 : 0) : 0;
    const score = S.score + S.maxCombo * 10 + (won ? 500 : 0);
    if (won) { ctx.sfx('frogCroak'); UI.confetti(S.L.rcx, S.L.zy + S.L.zh / 2, 40); }
    ctx.finish({ score, stars, won, frac: won ? stars / 3 : clamp(acc / Math.max(0.01, S.target), 0, 1) * 0.3,
      stats: { you: S.pts, rana: ranaFinal, perfects: S.perfects, goods: S.goods, misses: S.misses, maxCombo: S.maxCombo, accuracy: Math.round(acc * 100) } });
  }

  /* ---------- drawing ---------- */
  function layout(ctx) {
    const W = ctx.W, H = ctx.H, L = S.L;
    L.z = Math.max(1, Math.floor(Math.min(W / 200, H / 160)));
    L.gap = W < 260 ? 5 : 10;
    L.wide = W >= H * 1.5;
    L.top = 46;                          // under the score panels and the streak line
    if (L.wide) {
      // landscape: the streams stay vertical in the middle; Rana on the left of them, the frog band on the right
      L.dh = clamp(Math.round(H * 0.2), Math.max(44, ctx.tap + 14), 72 * L.z);
      const hw = Math.min(Math.round(W * 0.46), 330 * L.z);
      L.dw = Math.min(110 * L.z, Math.floor((hw - L.gap * 2) / 3));
      L.dx = Math.round((W - L.dw * 3 - L.gap * 2) / 2);
      L.dy = H - L.dh - (ctx.touch ? 8 : 18);
      const side = L.dx - 8;                       // the room on each side of the streams
      L.zy = L.top; L.zh = Math.max(30, H - 8 - L.zy);
      L.k = clamp(Math.floor(Math.min((L.zh - 10) / 22, (side - 8) / 40)), 1, 3 * L.z);
      L.rcx = Math.round(side / 2);
      L.pad = Math.round(L.zy + L.zh * 0.62);
      L.bandX = W - Math.round(side / 2);          // the chorus frogs' centre, right of the streams
      L.choY = Math.round(L.zy + L.zh * 0.35);
      L.laneTop = L.top;
    } else {
      L.dw = Math.min(104, Math.floor((W - 16 - L.gap * 2) / 3));
      L.dh = clamp(Math.round(H * 0.17), Math.max(44, ctx.tap + 14), 84);
      L.dx = Math.round((W - L.dw * 3 - L.gap * 2) / 2);
      L.dy = H - L.dh - (ctx.touch ? 8 : 18);
      // Rana's stage: a strip under the score panels
      L.k = clamp(Math.floor((H - 300) / 120), 1, 2);
      L.zy = L.top; L.zh = 26 * L.k + 12;
      L.rcx = Math.round(W / 2);
      L.pad = L.zy + L.zh - 2;
      L.choY = L.pad - 8;
      L.laneTop = L.pad + 6;
    }
    L.ry = Math.max(4, Math.round(L.dw * 0.16));
    L.hitY = L.dy + L.ry;
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
    const dy = L.dy - 14, x0 = L.wide ? L.dx - 12 : 0, dw = L.wide ? L.dw * 3 + L.gap * 2 + 24 : W;
    if (L.wide) { g.fillStyle = '#3d2414'; g.fillRect(x0 - 2, dy, 2, H - dy); g.fillRect(x0 + dw, dy, 2, H - dy); }
    g.fillStyle = '#5e3a20'; g.fillRect(x0, dy, dw, H - dy);
    for (let y = dy; y < H; y += 6) { g.fillStyle = '#8a5a33'; g.fillRect(x0, y, dw, 5); g.fillStyle = '#9a6a3f'; g.fillRect(x0, y, dw, 1); for (let x = x0 + ((y / 6) | 0) % 2 * 20; x < x0 + dw; x += 40) { g.fillStyle = '#5e3a20'; g.fillRect(x, y, 1, 5); } }
    g.fillStyle = '#3d2414'; g.fillRect(x0, dy, dw, 2);
    S.bg = c; S.bgGen = VIEW.gen; S.bgKey = L.dy * 1000 + L.zy + (ctx.touch ? 0.5 : 0) + L.laneTop / 1e4;
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
  /** The three streams the fireflies float down, the beat lines and the drum rings. */
  function drawLanes(g, ctx) {
    const L = S.L, tm = S.time, top = L.laneTop, hy = L.hitY, len = hy - top, fr = tm < S.frenzyEnd, still = BRBX.reduced();
    const lw = Math.round(L.dw * 0.72);
    for (let d = 0; d < 3; d++) {
      const cx = Math.round(laneX(d)), x = cx - (lw >> 1);
      g.globalAlpha = 0.55; rect(g, x, top, lw, len, fr ? '#3a2c10' : '#10303a'); g.globalAlpha = 1;
      rect(g, x - 1, top, 1, len, fr ? PAL.gold2 : DCOL_D[d]); rect(g, x + lw, top, 1, len, fr ? PAL.gold2 : DCOL_D[d]);
      // ripples drifting down with the music (still with reduced motion)
      const sp = len / S.look, off = still ? 0 : (tm * sp) % 18;
      g.globalAlpha = 0.25;
      for (let y = top + off; y < hy; y += 18) rect(g, x + 3 + ((y / 18 | 0) % 3) * 3, Math.round(y), Math.max(4, lw - 16), 1, '#c8f6ff');
      g.globalAlpha = 1;
    }
    // beat lines: one across the streams for every beat, moving down at the fireflies' speed
    const x0 = Math.round(laneX(0)) - (lw >> 1), x1 = Math.round(laneX(2)) + (lw >> 1), beat = ST * 4;
    for (let b = Math.ceil(tm / beat) * beat; b < tm + S.look; b += beat) {
      const y = Math.round(hy - (b - tm) / S.look * len), strong = Math.round(b / beat) % 4 === 0;
      if (y < top) continue;
      g.globalAlpha = strong ? 0.35 : 0.16; rect(g, x0, y, x1 - x0, 1, PAL.cream); g.globalAlpha = 1;
    }
    // the hit line across the drums
    g.globalAlpha = 0.5; rect(g, x0 - 2, hy, x1 - x0 + 4, 1, fr ? PAL.gold2 : PAL.cream); g.globalAlpha = 1;
  }
  /** A firefly: a soft glow, a body in the drum's colour, a bright heart and two tiny wings. */
  function drawFly(g, x, y, d, r, a) {
    const still = BRBX.reduced(), glow = still ? 0.3 : 0.25 + 0.1 * Math.sin(S.time * 12 + d * 2);
    g.globalAlpha = glow * a; disc(g, x, y, r + 4, DCOL[d]); g.globalAlpha = a;
    rect(g, x - r - 2, y - 2, 3, 2, '#e8f6ff'); rect(g, x + r, y - 2, 3, 2, '#e8f6ff');
    disc(g, x, y, r + 1, OUT); disc(g, x, y, r, DCOL[d]); disc(g, x, y, Math.max(1, r >> 1), '#fff8e8');
    g.globalAlpha = 1;
  }
  function drawNotes(g) {
    const L = S.L, tm = S.time, top = L.laneTop, hy = L.hitY, len = hy - top, r = Math.max(4, Math.round(L.dw * 0.11));
    for (let i = S.open > 4 ? S.open - 4 : 0; i < S.nN; i++) {
      const nt = S.notes[i], ahead = nt.t - tm; if (ahead > S.look) break;
      if (nt.j === 1 || nt.j === 2) continue;
      const y = Math.round(hy - ahead / S.look * len), x = Math.round(laneX(nt.drum));
      if (nt.j === 3) { const a = 1 - (tm - nt.jt) / 0.4; if (a > 0) drawFly(g, x, Math.min(y, hy + 30), nt.drum, r - 1, a * 0.4); continue; }
      if (y < top - r) continue;
      drawFly(g, x, y, nt.drum, ahead < S.perfW && ahead > -S.perfW ? r + 1 : r, 1);
    }
  }
  function draw(g, ctx) {
    layout(ctx);
    const L = S.L, W = ctx.W, tm = S.time;
    const key = L.dy * 1000 + L.zy + (ctx.touch ? 0.5 : 0) + L.laneTop / 1e4;
    if (S.bgGen !== VIEW.gen || S.bgKey !== key || !S.bg) buildBg(ctx);
    g.drawImage(S.bg, 0, 0);
    const beat = (tm / (ST * 4)) % 1, bop = beat < 0.2 ? 1 : 0, fr = tm < S.frenzyEnd, playing = tm > BAR && !S.done;
    // the band: frogs wake on the pads as your streak grows and bop on the beat (all sing in a Frenzy)
    const awake = fr ? 8 : Math.min(8, Math.floor(S.combo / 3));
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1, col = (i >> 1);
      const x = L.wide ? clamp(Math.round(L.bandX + side * (8 + (col & 1) * 18) - 4), 2, W - 12) : clamp(Math.round(L.rcx + side * Math.min(W * 0.46, 20 * L.k + 14 + col * 20) - 4), 2, W - 12);
      const y = L.wide ? Math.round(L.choY + (col >> 1) * 22 + (col & 1) * 11) : Math.round(L.choY - (i & 2 ? 3 : 0));
      spr(g, SPRITES.frog_pad, x - 2, y + 5);
      if (i < awake) { const hop = bop && playing ? (fr || S.combo >= 20 ? 2 : 1) : 0; spr(g, hop && (i + ((tm * 2) | 0)) % 2 ? SPRITES.frog_cho2 : SPRITES.frog_cho, x, y - hop); }
    }
    // Rana on her pad with her three small drums, drumming along with every firefly
    const k = L.k, cx = L.rcx, padY = L.pad;
    const singing = S.ranaT[0] < 0.18 || S.ranaT[1] < 0.18 || S.ranaT[2] < 0.18;
    const blink = !singing && (tm % 3.3) < 0.14;
    const rs = singing ? SPRITES.frog_rana_sing : blink ? SPRITES.frog_rana_blink : SPRITES.rana;
    const hop = singing ? k * 2 : bop && playing ? k : 0;
    const mdw = 10 * k, mdh = 8 * k, mdy = padY - mdh - 1, rTop = mdy + 3 * k - 16 * k - hop;
    shadow(g, cx, padY - 2, 12 * k);
    sprK(g, rs, cx - 8 * k, rTop, k);
    for (let d = 0; d < 3; d++) {
      const mx = cx + (d - 1) * (mdw + 2 * k) - (mdw >> 1), lit = clamp(1 - S.ranaT[d] / 0.2, 0, 1);
      drawDrum(g, mx, mdy, mdw, mdh, d, lit, 0);
      if (lit > 0) { const hx = cx + (d === 0 ? -6 : d === 2 ? 6 : 0) * k, hy = rTop + 11 * k; line(g, hx, hy, mx + (mdw >> 1), mdy + 2, '#e8bd7c'); }
    }
    drawLanes(g, ctx);
    // your drums (tap targets), Cappy behind the middle one
    const kc = clamp(Math.floor(L.dh / 30), 1, 3), cappyLit = S.cappyT < 0.15, live = RUN.phase === 'play' || RUN.phase === 'count';
    const cs = SPRITES[cappyLit ? 'cappy_down_w' : 'cappy_down'];
    const ccx = L.dx + L.dw + L.gap + (L.dw >> 1);
    if (cs && L.wide) sprK(g, cs, L.dx - 18 * kc, L.dy + L.dh - 16 * kc - (cappyLit ? 2 : 0), kc);
    for (let d = 0; d < 3; d++) {
      const x = L.dx + d * (L.dw + L.gap), lit = clamp(1 - S.hitT[d] / 0.16, 0, 1);
      if (live) UI.addHit(DRUM_IDS[d], x, L.dy - 6, L.dw, L.dh + 6);
      drawDrum(g, x, L.dy, L.dw, L.dh, d, lit, S.hitQ[d]);
      if (!ctx.touch) { box(g, x + (L.dw >> 1) - 7, L.dy + L.dh + 2, 14, 12, '#3a2a4a', PAL.ink); KEYICON[d](g, x + (L.dw >> 1), L.dy + L.dh + 7); }
    }
    void ccx;
    drawNotes(g);
    drawVersus(g, ctx);
    // the streak line under the score panels
    const sy = 32;
    if (tm < BAR) text(g, t('frog.ready'), 8, sy, { col: PAL.p4 });
    else if (S.done) text(g, t('frog.end'), 8, sy, { col: PAL.p4 });
    else text(g, label('frog.streak', S.combo), 8, sy, { col: S.combo >= 10 ? PAL.gold2 : PAL.cream });
    const m = mult() * (fr ? 2 : 1);
    if (fr) text(g, t('frog.frenzy'), W - 8, sy, { align: 'right', col: PAL.gold2 });
    else if (m > 1) text(g, label('frog.mult', m), W - 8, sy, { align: 'right', col: PAL.r4 });
    if (ctx.firstTime && tm < BAR * 4 && !S.done) {
      const hk = ctx.touch ? 'frog.hintTouch' : 'frog.hintKeys';
      textBlock(g, t(hk), 8, L.laneTop + 8, W - 16, HINT);
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
      S.done = false; S.auto = false; S.jitter = 0; S.skip = 0; S.mash = 0; S.rand = ctx.rng; S.rana = 0; S.frenzyEnd = 0; S.frenzies = 0; S.frenzyNext = FRENZY_AT;
      for (let i = 0; i < 3; i++) { S.hitT[i] = 9; S.ranaT[i] = 9; S.hitQ[i] = 0; S.lock[i] = 0; S.lastHit[i] = -9; S.mashT[i] = 0; }
      S.target = (ctx.easy ? TARGET_EASY : TARGET) + (ctx.rng() * 2 - 1) * FORM;
      // the output delay of the speakers or headphones (Bluetooth can be 0.2 s), at most 0.25 s
      S.lat = 0; try { const ac = AUDIO.ctx; if (ac) S.lat = clamp((ac.outputLatency || 0) || (ac.baseLatency || 0), 0, 0.25); } catch (e) { S.lat = 0; }
      S.perfW = ctx.easy ? 0.09 : 0.07; S.goodW = ctx.easy ? 0.2 : 0.15; S.look = ctx.easy ? 2.4 : 2;
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
      let next = null, onScreen = 0;
      for (let i = S.open; i < S.nN; i++) {
        const nt = S.notes[i]; if (nt.t - S.time > S.look) break;
        if (!nt.j) { onScreen++; if (!next) next = { t: Math.round(nt.t * 1000) / 1000, drum: nt.drum, inS: Math.round((nt.t - S.time) * 1000) / 1000 }; }
      }
      if (!next) for (let i = S.open; i < S.nN; i++) { const nt = S.notes[i]; if (!nt.j) { next = { t: Math.round(nt.t * 1000) / 1000, drum: nt.drum, inS: Math.round((nt.t - S.time) * 1000) / 1000 }; break; } }
      const L = S.L;
      return { time: Math.round(S.time * 1000) / 1000, phase: S.done ? 'end' : S.time < BAR ? 'count' : 'play', notes: S.nN, onScreen,
        you: S.pts, rana: S.rana, max: S.nN * 3, target: S.target, combo: S.combo, streak: S.combo, maxCombo: S.maxCombo, mult: mult(), frenzy: S.time < S.frenzyEnd, frenzies: S.frenzies,
        perfects: S.perfects, goods: S.goods, misses: S.misses, wrong: S.wrong, score: S.score, done: S.done, auto: S.auto, next,
        windows: { perfect: S.perfW, good: S.goodW }, look: S.look, lat: S.lat, songSecs: Math.round(songEnd() * 10) / 10,
        lanes: { top: L.laneTop, hitY: L.hitY, x: [laneX(0), laneX(1), laneX(2)] } };
    },
    test: {
      /** auto(on, jitter, skip, mash): a play-bot (jitter s of timing noise, skip a share of notes) or a masher (mash taps a second on every drum). */
      auto(ctx, on, jitter, skip, mash) { S.auto = !!on && !(+mash > 0); S.jitter = +jitter || 0; S.skip = +skip || 0; S.mash = on ? +mash || 0 : 0; return !!on; },
      /** Rana's mark for a balance check: target(share of the best score). */
      target(ctx, v) { if (v) S.target = +v; return S.target; },
    },
    cheat(won) {
      const max = S.nN * 3 || 400;
      S.pts = won ? Math.round(max * 0.85) : Math.round(max * 0.3);
      return { score: won ? 9000 : 2000, stars: won ? 2 : 0, won, frac: won ? 0.67 : 0.15 };
    },
  });
})();
