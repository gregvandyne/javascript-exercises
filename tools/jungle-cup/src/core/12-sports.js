// ======================================================================================================
// SPORTS: the runner every sport plugs into. The core draws the intro card, 3-2-1-Go, the pause button and menu,
// and the results card; it saves bests, stars and Feathers and reports to the platform. A sport only plays.
// The interface is in docs/jungle-cup-plan.md ("Sport module interface"); sport-paddle.js is the reference.
// ======================================================================================================
const RUN = { name: 'sport', id: '', sport: null, phase: 'intro', t: 0, count: 0, result: null, ctx: null, prevBest: 0, newFeather: false,
  newBest: false, speed: 1, outroT: 0, warm: false, cardT: 0, starsShown: 0 };
JC.runner = RUN;
JC.register = function (sport) {
  if (!sport || !sport.id) throw new Error('JC.register: a sport needs an id');
  JC.sports[sport.id] = sport;
  return sport;
};
/** The context a sport gets in start(ctx) (and as the 2nd argument of update/draw/onInput). */
function makeCtx(id) {
  const ctx = {
    id, get W() { return VIEW.W; }, get H() { return VIEW.H; }, get tap() { return VIEW.tap; },
    get touch() { return INPUT.showTouch(); },
    easy: JC.easy(),
    firstTime: !SAVE.data.plays[id],
    warmedUp: !!SAVE.data.warm[id],
    best: SAVE.data.best[id] || 0,
    colour: SPORT_COLOURS[id],
    champion: ARCHES[id] ? ARCHES[id].champ : '',
    t: 0,
    rng: rng((Date.now() & 0xffff) + 1),
    sfx: name => AUDIO.sfx(name),
    music: song => { AUDIO.music(song); JC.audioWant = song; },
    /** End the round: { score, stars (0-3), won, frac (0-1 for the star bar, optional), stats (optional) }. */
    finish(res) { if (RUN.phase === 'play') { RUN.result = res; RUN.phase = 'outro'; RUN.outroT = 0; } },
    markWarm() { SAVE.data.warm[id] = true; SAVE.write(); ctx.warmedUp = true; },
    say(lines, done) { JC.say(lines, done); },
    held: INPUT.held,
    /** The analog axis { x, y, mag } (-1..1, y down): the touch joystick, the gamepad stick or the keys. */
    axis: INPUT.axis,
    /** The touch joystick (a sport opts in with stick: true, or stick: (x, y) => true where a thumb may start it). */
    stick: STICK,
    hud: HUD,
    ui: UI,
  };
  return ctx;
}
/** Start a sport from the overworld (its arch). */
JC.playSport = function (id) {
  const sp = JC.sports[id];
  if (!sp) { const champ = ARCHES[id] && ARCHES[id].champ; JC.say([{ who: champ || 'mango', key: `d.${champ}.soon` }]); return; }
  JC.go('sport', { id });
};
RUN.enter = function (opts) {
  RUN.id = opts.id; RUN.sport = JC.sports[opts.id]; RUN.phase = opts.phase || 'intro'; RUN.t = 0; RUN.result = null; RUN.cardT = 0;
  UI.clearFx(); TB.open = false;
  RUN.ctx = makeCtx(RUN.id);
  JC.audioWant = 'island';
  UI.setFocus('go');
  if (RUN.phase === 'count') RUN.begin();
};
/** (Re)start the round: the sport's start(), then the countdown. */
RUN.begin = function () {
  sendReport();
  RUN.ctx = makeCtx(RUN.id); RUN.result = null; RUN.t = 0; RUN.count = 3.6; RUN.phase = 'count'; RUN.lastBeep = 4;
  UI.clearFx();
  try { RUN.sport.start(RUN.ctx); } catch (e) { console.error(e); }
  const song = RUN.sport.music || 'paddle';
  AUDIO.music(song); JC.audioWant = song;
};
RUN.leave = function () { sendReport(); INPUT.releaseTouch(); if (RUN.sport && RUN.sport.stop) { try { RUN.sport.stop(RUN.ctx); } catch (e) { console.error(e); } } };
RUN.back = function () { AUDIO.sfx('back'); const a = ARCHES[RUN.id]; JC.go('world', { at: [a.x, a.y + 1, 'down'], away: RUN.id }); };
function finishRound() {
  const res = RUN.result || { score: 0, stars: 0, won: false };
  res.score = Math.max(0, Math.round(res.score || 0)); res.stars = clamp(res.stars | 0, 0, 3); res.won = !!res.won;
  const d = SAVE.data, id = RUN.id;
  RUN.prevBest = d.best[id] || 0;
  RUN.newBest = res.score > RUN.prevBest && (res.won || RUN.prevBest > 0);   // a first-ever loss is not a "New best!"
  if (RUN.newBest) d.best[id] = res.score;
  d.stars[id] = Math.max(d.stars[id] || 0, res.stars);
  d.plays[id] = (d.plays[id] || 0) + 1;
  RUN.newFeather = res.won && !d.feathers[id];
  if (res.won) d.feathers[id] = true;
  if (RUN.newFeather && SAVE.featherCount() === NSPORTS) d.flags.allFeathers = 1;
  // the first three-star round: a berry bandana (said on the card itself, which would cover a banner)
  RUN.newBandana = res.stars === 3 && JC.grantBandana('berry', false, true);
  if (RUN.newBandana) AUDIO.sfx('pickup');
  SAVE.write();
  // the platform hears about the round when the player leaves this card (Retry, Back, or leaving the sport), so the
  // site's "New best" message never lands on the card's buttons. Its number is the Cup points, shown on the card too.
  RUN.cupPts = SAVE.cupPoints();
  RUN.report = { won: res.won, pts: RUN.cupPts };
  RUN.phase = 'results'; RUN.cardT = 0; RUN.starsShown = 0;
  AUDIO.music(''); JC.audioWant = '';
  AUDIO.sfx(res.won ? 'win' : 'lose');
  if (res.won) UI.confetti(VIEW.W / 2, VIEW.H * 0.3, 50);
  UI.setFocus(res.won ? 'back' : 'retry');
}
RUN.finishNow = finishRound;
RUN.report = null;
function sendReport() { const r = RUN.report; if (!r) return; RUN.report = null; BRBX.gameOver(r.won, r.pts); }
RUN.sendReport = sendReport;
RUN.update = function (dt) {
  RUN.t += dt; RUN.cardT += dt;
  TB.update(dt);
  const sp = RUN.sport, ctx = RUN.ctx;
  if (RUN.phase === 'count') {
    RUN.count -= dt;
    const n = Math.ceil(RUN.count - 0.6);
    if (n !== RUN.lastBeep && n >= 0) { RUN.lastBeep = n; AUDIO.sfx(n > 0 ? 'beep' : 'go'); if (n === 0) UI.banner(t('go'), PAL.r4, 0.8); }
    if (RUN.count <= 0) RUN.phase = 'play';
  } else if (RUN.phase === 'play' && !TB.open) {
    ctx.t += dt;
    try { sp.update(dt, ctx); } catch (e) { console.error(e); RUN.phase = 'outro'; }
  } else if (RUN.phase === 'outro') {
    RUN.outroT += dt;
    try { if (sp.outro) sp.outro(dt, ctx); } catch (e) { console.error(e); }
    if (RUN.outroT > 1.1) finishRound();
  } else if (RUN.phase === 'results') {
    const want = RUN.result ? RUN.result.stars : 0;
    if (RUN.starsShown < want && RUN.cardT > 0.6 + RUN.starsShown * 0.35) { RUN.starsShown++; AUDIO.sfx('star'); }
  }
};
RUN.pause = function () { if (JC.scene === RUN && (RUN.phase === 'play' || RUN.phase === 'count')) { RUN.paused = RUN.phase; RUN.phase = 'paused'; AUDIO.sfx('select'); UI.setFocus('resume'); INPUT.releaseTouch(); } };
// leaving the tab or the window (or clicking the site around the game) pauses a round: no playing on without the keys
document.addEventListener('visibilitychange', () => { if (document.hidden) RUN.pause(); });
window.addEventListener('blur', () => RUN.pause());
RUN.onInput = function (e) {
  if (TB.input(e)) return;
  const ph = RUN.phase;
  if (ph === 'intro') {
    const id = UI.menuInput(e);
    if (id === 'go') { AUDIO.sfx('select'); RUN.begin(); } else if (id === 'back' || (e.type === 'press' && e.key === 'b')) RUN.back();
    return;
  }
  if (ph === 'paused') {
    const id = UI.menuInput(e);
    if (id === 'resume' || (e.type === 'press' && (e.key === 'b' || e.key === 'pause'))) { RUN.phase = RUN.paused || 'play'; AUDIO.sfx('select'); }
    else if (id === 'retry') { AUDIO.sfx('select'); RUN.begin(); }
    else if (id === 'back') RUN.back();
    return;
  }
  if (ph === 'results') {
    if (RUN.cardT < 0.4) return;
    const id = UI.menuInput(e);
    if (id === 'retry') { AUDIO.sfx('select'); RUN.begin(); } else if (id === 'back' || (e.type === 'press' && e.key === 'b')) RUN.leaveResults();
    return;
  }
  // playing (or counting down): the pause button, Esc / P, then the sport
  if (e.type === 'down' && UI.hitAt(e.x, e.y) === 'pause') { RUN.pause(); return; }
  if (e.type === 'press' && (e.key === 'b' || e.key === 'pause')) { RUN.pause(); return; }
  if (e.type === 'tap' && UI.hitAt(e.x, e.y) === 'pause') return;
  // a sport that opted in gets the floating joystick (touch): its own touch never reaches the sport
  if (RUN.sport.stick && INPUT.showTouch() && (ph === 'play' || ph === 'count')) {
    const sk = RUN.sport.stick;
    if (e.type === 'down') { if ((typeof sk !== 'function' || sk(e.x, e.y, RUN.ctx)) && STICK.down(e, typeof sk === 'function')) return; }
    else if ((e.type === 'move' || e.type === 'up') && e.id === STICK.id) { STICK.input(e); return; }
  }
  if (ph === 'play') { try { if (RUN.sport.onInput) RUN.sport.onInput(e, RUN.ctx); } catch (er) { console.error(er); } }
};
RUN.leaveResults = function () {
  AUDIO.sfx('back');
  const a = ARCHES[RUN.id];
  // the last Feather: once the totem has lit up, Zuzu flies in with the news (3.2 s of game time later)
  const news = RUN.newFeather && SAVE.featherCount() === NSPORTS ? [{ who: 'zuzu', key: 'd.zuzu.liftopen' }] : null;
  JC.go('world', { at: [a.x, a.y + 1, 'down'], away: RUN.id, celebrate: RUN.newFeather ? RUN.id : '', later: news, laterT: 3.2 });
};
/* ---------- drawing ---------- */
function portrait(g, who, x, y, size, bg) {
  const s = SPRITES[SPEAKERS[who] || who];
  box(g, x, y, size, size, bg || '#cde8a8', PAL.ink);
  rect(g, x + 1, y + size - 9, size - 2, 8, shade(bg || '#cde8a8', -0.15));
  if (!s) return;
  const k = Math.max(1, Math.floor((size - 4) / Math.max(s.w, s.h)));
  if (who === 'otters') { const k2 = Math.max(1, k - 1); sprK(g, s, x + size / 2 - s.w * k2 + 2, y + size - 2 - s.h * k2, k2); sprK(g, s, x + size / 2 - 2, y + size - 2 - s.h * k2, k2, true); return; }
  sprK(g, s, x + ((size - s.w * k) >> 1), y + size - 2 - s.h * k, k);
}
JC.portrait = portrait;
function drawIntro(g) {
  const sp = RUN.sport, id = RUN.id, col = SPORT_COLOURS[id];
  dimBackdrop(g, col);
  const w = Math.min(VIEW.W - 12, 330), compact = VIEW.H < 230, bh0 = Math.max(22, VIEW.tap);
  let ps = compact ? 40 : 52;
  // tall enough for the words (longer in some languages), never taller than the screen
  // a note from the sport (Paddle Smash's first warm-up), and the gamepad line for a player on a gamepad
  // only the controls for the device in hand (touch on a phone, keys on a laptop, the pad's line on a gamepad)
  let noteStr = sp.introNote ? sp.introNote(RUN.ctx) || '' : '';
  const dev = INPUT.device === 'pad' ? 'pad' : INPUT.showTouch() ? 'touch' : 'keys';
  let showDev = true;
  const introLines = () => (noteStr ? ['note'] : []).concat(showDev ? [dev] : []);
  const cw = w - 14, lineStr = k => (k === 'note' ? noteStr : k === 'pad' ? t('intro.pad') : t('sport.' + id + '.' + k));
  const needFor = () => ps + 6 + 4 + 4 + 18 + 6 + bh0 + LINE_H * (wrap(t('sport.' + id + '.goal'), cw - 4).length + introLines().reduce((n, k) => n + wrap(lineStr(k), cw - 14).length, 0)) + 2 * introLines().length;
  let need = needFor();
  // a short screen gives way in this order: the note, a smaller portrait, then the controls line (each sport's own
  // hint shows the controls again as play starts), so the words never run under the buttons
  if (need > VIEW.H - 12 && noteStr) { noteStr = ''; need = needFor(); }
  if (need > VIEW.H - 12 && ps > 40) { ps = 40; need = needFor(); }
  if (need > VIEW.H - 12) { showDev = false; need = needFor(); }
  const h = Math.min(VIEW.H - 12, Math.max(compact ? 186 : 222, need)), x = Math.round((VIEW.W - w) / 2), y = Math.round((VIEW.H - h) / 2);
  const c = UI.card(g, x, y, w, h);
  portrait(g, ARCHES[id].champ, RTL ? c.x + c.w - ps - 2 : c.x + 2, c.y + 2, ps, shade(col, 0.55));
  const tx = RTL ? c.x + c.w - ps - 8 : c.x + ps + 8, tw = c.w - ps - 10, al = RTL ? 'right' : 'left';
  // every sport's title at the same size on this screen: the biggest that fits all seven
  const title = t('sport.' + id), big = titleScale(JC.sportOrder.map(s2 => t('sport.' + s2)), tw);
  text(g, title, tx, c.y + 2, { col: col, edge: PAL.ink, scale: big, maxW: tw, align: al });
  text(g, t('vs.' + ARCHES[id].champ), tx, c.y + 4 + Math.round(12 * big), { col: PAL.ink, edge: null, maxW: tw, align: al });
  let yy = c.y + ps + 6;
  yy += textBlock(g, t('sport.' + id + '.goal'), c.x + 2, yy, c.w - 4, { col: '#3b2416', edge: null }) + 4;
  for (const k of introLines()) {
    const str = k === 'note' ? noteStr : k === 'pad' ? t('intro.pad') : t('sport.' + id + '.' + k);
    rect(g, RTL ? c.x + c.w - 8 : c.x + 2, yy + 1, 6, 6, k === 'touch' ? PAL.r3 : k === 'pad' ? PAL.p1 : k === 'note' ? PAL.g3 : PAL.w2);
    yy += textBlock(g, str, RTL ? c.x + 2 : c.x + 12, yy, c.w - 14, { col: PAL.ink2, edge: null }) + 2;
  }
  const bh = Math.max(22, VIEW.tap), bw = Math.min(150, (c.w - 10) / 2);
  const by = y + h - bh - 9;
  UI.button(g, 'back', c.x + 2, by, Math.min(bw, 110), bh, t('btn.back'), { col: '#7a6a8a', icon: UI.icons.back });
  UI.button(g, 'go', c.x + c.w - bw - 2, by, bw, bh, t('btn.play'), { col: '#3fae4a', icon: UI.icons.play });
}
/** The biggest title size (2, 1.5 or 1) at which every one of these words fits the width: titles that belong
 *  together (the seven sports, the map's panels) are drawn at one size instead of some big and some small. */
const TSCALE = new Map();
function titleScale(strs, w) {
  const key = strs.join('|') + '|' + w + '|' + TEXT.clear + '|' + VIEW.gen;
  let sc = TSCALE.get(key); if (sc) return sc;
  sc = 1; for (const k of [2, 1.5]) if (strs.every(s2 => textW(s2, k) <= w)) { sc = k; break; }
  if (TSCALE.size > 200) TSCALE.clear();
  TSCALE.set(key, sc); return sc;
}
JC.titleScale = titleScale;
function dimBackdrop(g, col) {
  // the sport's own scene behind, darkened (or a leafy pattern before it has started)
  g.fillStyle = shade(col, -0.55); g.fillRect(0, 0, VIEW.W, VIEW.H);
  for (let y = -16; y < VIEW.H + 16; y += 22) for (let x = -16; x < VIEW.W + 16; x += 22) { const o = ((y / 22) | 0) % 2 ? 11 : 0; spr(g, SPRITES.leaf, x + o + ((RUN.t * 6) % 22), y); }
  g.fillStyle = 'rgba(16,10,24,0.45)'; g.fillRect(0, 0, VIEW.W, VIEW.H);
}
function drawPauseMenu(g) {
  g.fillStyle = 'rgba(16,10,24,0.6)'; g.fillRect(0, 0, VIEW.W, VIEW.H);
  const bh = Math.max(22, VIEW.tap), w = Math.min(VIEW.W - 24, 220), h = bh * 3 + 50, x = Math.round((VIEW.W - w) / 2), y = Math.round((VIEW.H - h) / 2);
  const c = UI.card(g, x, y, w, h);
  text(g, t('paused'), x + w / 2, c.y + 1, { align: 'center', col: PAL.ink, edge: null });
  let yy = c.y + 16;
  UI.button(g, 'resume', c.x + 4, yy, c.w - 8, bh, t('btn.resume'), { col: '#3fae4a', icon: UI.icons.play }); yy += bh + 4;
  UI.button(g, 'retry', c.x + 4, yy, c.w - 8, bh, t('btn.retry'), { col: PAL.r3, icon: UI.icons.retry }); yy += bh + 4;
  UI.button(g, 'back', c.x + 4, yy, c.w - 8, bh, t('btn.island'), { col: '#7a6a8a', icon: UI.icons.back });
}
const bandanaStr = () => t('res.bandana', { name: t('band.berry') });
function drawResults(g) {
  const res = RUN.result || { score: 0, stars: 0, won: false }, id = RUN.id, col = SPORT_COLOURS[id];
  g.fillStyle = 'rgba(16,10,24,0.55)'; g.fillRect(0, 0, VIEW.W, VIEW.H);
  const k = easeOutBack(clamp(RUN.cardT / 0.35, 0, 1));
  const bh = Math.max(22, VIEW.tap), compact = VIEW.H < 230;
  const w = Math.min(VIEW.W - 12, 320), narrowCard = w - 14 < 250;
  const extra = (RUN.newFeather ? wrap(t('res.feather', { sport: t('sport.' + id) }), w - 30).length * LINE_H + 2 : 0) + (RUN.newBandana ? wrap(bandanaStr(), w - 30).length * LINE_H + 2 : 0);
  const subPush = Math.max(0, 6 + 24 + LINE_H - (compact ? 30 : 40) - 6);   // a big title and its line can reach below a small portrait
  const h = Math.min(VIEW.H - 10, (compact ? 104 : 118) + 12 + subPush + bh + (narrowCard ? bh + 4 : 0) + extra), x = Math.round((VIEW.W - w) / 2);
  const y = Math.round((VIEW.H - h) / 2 + (1 - k) * 40);
  const c = UI.card(g, x, y, w, h);
  const ps = compact ? 30 : 40;
  portrait(g, ARCHES[id].champ, RTL ? c.x + c.w - ps - 2 : c.x + 2, c.y + 2, ps, shade(col, 0.55));
  // a near miss is "So close!"; a big loss is "Good try!" (kind, and true); a win says what the kid just did
  // ("So close!" only when it really was: within about 15% of the champion)
  const close = res.won || (res.frac !== undefined ? res.frac / 0.3 : 0) >= 0.85;
  const head = t(res.won ? 'res.won' : close ? 'res.lost' : 'res.lostBig'), tw = c.w - ps - 8, hx = RTL ? c.x + c.w - ps - 8 : c.x + ps + 8, al = RTL ? 'right' : 'left';
  const sub = res.won ? t('res.wonSub.' + id) : t('res.lostSub');
  const hs = titleScale([t('res.won'), t('res.lost'), t('res.lostBig')], tw);
  text(g, head, hx, c.y + 2, { col: res.won ? '#2f8a3f' : '#b4302f', edge: null, scale: hs, align: al });
  const subH = textBlock(g, sub, RTL ? c.x + 2 : hx, c.y + 4 + Math.round(12 * hs), tw, { col: PAL.ink2, edge: null });
  let yy = Math.max(c.y + ps + 6, c.y + 6 + Math.round(12 * hs) + subH);
  const L0 = RTL ? c.x + c.w - 4 : c.x + 4, R0 = RTL ? c.x + 4 : c.x + c.w - 4, la = RTL ? 'right' : 'left', ra = RTL ? 'left' : 'right';
  text(g, t('res.score'), L0, yy, { col: PAL.ink, edge: null, align: la });
  text(g, fmt(res.score), R0, yy, { col: PAL.ink, edge: null, align: ra }); yy += 12;
  text(g, t(RUN.newBest ? 'res.newBest' : 'res.best'), L0, yy, { col: RUN.newBest ? '#c8641a' : PAL.ink2, edge: null, align: la });
  text(g, fmt(Math.max(res.score, RUN.prevBest)), R0, yy, { col: PAL.ink2, edge: null, align: ra }); yy += 12;
  // the Cup points: the number the site's "New best" message shows (stars, Feathers and the Cup, over every sport)
  text(g, t('res.cup'), L0, yy, { col: '#2f6a8a', edge: null, align: la });
  text(g, fmt(RUN.cupPts || 0), R0, yy, { col: '#2f6a8a', edge: null, align: ra }); yy += 14;
  const frac = res.frac !== undefined ? res.frac : res.stars / 3;
  UI.starBar(g, c.x + 8, yy, c.w - 20, clamp(frac * clamp(RUN.cardT / 1.2, 0, 1), 0, 1), res.marks || null, RUN.starsShown);
  yy += 16;
  if (RUN.newFeather) {
    spr(g, featherSprite(col), RTL ? c.x + c.w - 10 : c.x + 4, yy - 1);
    yy += textBlock(g, t('res.feather', { sport: t('sport.' + id) }), RTL ? c.x + 2 : c.x + 14, yy, c.w - 16, { col: '#3b2416', edge: null }) + 2;
  }
  if (RUN.newBandana) {
    rect(g, RTL ? c.x + c.w - 11 : c.x + 4, yy + 2, 7, 5, BANDANAS.berry); rect(g, RTL ? c.x + c.w - 11 : c.x + 4, yy + 2, 7, 1, shade(BANDANAS.berry, 0.4));
    yy += textBlock(g, bandanaStr(), RTL ? c.x + 2 : c.x + 14, yy, c.w - 16, { col: '#7a2a6a', edge: null }) + 2;
  }
  const narrow = c.w < 250, bw = narrow ? c.w - 4 : (c.w - 6) / 2;
  const by = y + h - bh - 9 - (narrow ? bh + 4 : 0);
  // after a win the island is the main way on; after a loss "Try again" is (first, green, where the thumb is)
  const pri = res.won ? 'back' : 'retry', sec2 = res.won ? 'retry' : 'back';
  const lab = id2 => (id2 === 'back' ? t('btn.island') : t('btn.retry')), ico = id2 => (id2 === 'back' ? UI.icons.back : UI.icons.retry);
  UI.button(g, pri, narrow ? c.x + 2 : c.x + 4 + bw, by, bw, bh, lab(pri), { col: '#3fae4a', icon: ico(pri) });
  UI.button(g, sec2, c.x + 2, narrow ? by + bh + 4 : by, bw, bh, lab(sec2), { col: res.won ? PAL.r3 : '#7a6a8a', icon: ico(sec2) });
}
RUN.draw = function (g) {
  const sp = RUN.sport, ctx = RUN.ctx;
  if (RUN.phase === 'intro') { drawIntro(g); UI.drawFx(g); return; }
  try { sp.draw(g, ctx); } catch (e) { console.error(e); }
  if (RUN.phase !== 'results') UI.drawFx(g);
  if (RUN.phase === 'play' || RUN.phase === 'count' || RUN.phase === 'outro') {
    UI.iconButton(g, 'pause', Math.max(14, VIEW.tap / 2 + 4), Math.max(14, VIEW.tap / 2 + 4), UI.icons.pause, { col: '#5b3a24' });
    if (sp.stick && INPUT.showTouch() && RUN.phase !== 'outro') STICK.draw(g, true);
  }
  if (RUN.phase === 'count' && RUN.count > 0.6) {
    const n = Math.ceil(RUN.count - 0.6), f = (RUN.count - 0.6) % 1;
    const sc = Math.max(3, Math.min(6, (VIEW.H / 40) | 0));
    g.globalAlpha = clamp(f * 2, 0, 1);
    text(g, String(n), VIEW.W / 2, VIEW.H * 0.38 - sc * 6, { align: 'center', col: PAL.r4, scale: sc });
    g.globalAlpha = 1;
  }
  if (RUN.phase === 'paused') drawPauseMenu(g);
  if (RUN.phase === 'results') { UI.drawFx(g); drawResults(g); }   // banners and confetti go behind the card, never over its words
  TB.draw(g);
};

/* ---------- HUD helpers for sports ---------- */
// the names in the score panels, cut to fit once per name and width (not every frame)
const FIT = [{ src: '', w: 0, out: '' }, { src: '', w: 0, out: '' }];
function fitName(i, src, maxW) {
  const f = FIT[i]; if (f.src === src && f.w === maxW && f.clear === TEXT.clear) return f.out;
  // a long name (German, Japanese) is narrowed to fit first; only a very long one is also shortened
  let name = src; while (name.length > 3 && textW(name) * 0.68 > maxW) name = name.slice(0, -1);
  f.src = src; f.w = maxW; f.clear = TEXT.clear; f.out = name; return name;
}
const VS_NAME = [{ col: PAL.white, align: 'left' }, { col: PAL.white, align: 'right' }];
const VS_SC = [{ col: PAL.r4, align: 'left' }, { col: PAL.r4, align: 'right' }];
const HUD_OPT = { white: { col: PAL.white }, timer: { align: 'center', col: PAL.white }, grey: { align: 'center', col: PAL.grey }, val: { align: 'center', col: PAL.r4 } };
const HUD = {
  /** The left edge a sport's HUD starts at (right of the pause button). */
  left: () => Math.max(28, VIEW.tap + 10),
  /** Two score panels (you and the champion) like "3 / 7" with bars. side: { name, score, of, col, who } */
  versus(g, a, b) {
    const l = HUD.left(), wAll = VIEW.W - l - 6, gap = 6, w = Math.min(150, (wAll - gap) / 2) | 0, y = 4;
    for (let i = 0; i < 2; i++) {
      const s = i ? b : a, x = i ? VIEW.W - 6 - w : l;
      box(g, x, y, w, 26, 'rgba(27,19,37,0.82)', PAL.ink);
      // the name on top (cut to fit), the score and its bar below
      const name = fitName(i, s.name, w - 8);
      VS_NAME[i].maxW = w - 8;
      text(g, name, i ? x + w - 4 : x + 4, y + 1, VS_NAME[i]);
      const sc = s.of ? label(i ? 'hud.vsB' : 'hud.vsA', s.score) : String(s.score), sw = textW(sc);
      const so = VS_SC[i]; so.col = s.col || PAL.r4;
      text(g, sc, i ? x + w - 4 : x + 4, y + 13, so);
      const bx = i ? x + 4 : x + sw + 8, bw = w - sw - 12;
      if (bw > 10) UI.bar(g, bx, y + 15, bw, 7, s.of ? s.score / s.of : 0, s.col || PAL.r4, s.of > 12 ? Math.round(s.of / 5) : s.of);   // a long match: a tick every 5
    }
  },
  /** A small labelled meter (Pounce, power, combo...). */
  meter(g, x, y, w, labelStr, frac, col, glow) {
    if (glow) { g.globalAlpha = 0.5 + 0.5 * Math.sin(RUN.t * 10); rect(g, x - 2, y - 2, w + 4, 22, col); g.globalAlpha = 1; }
    box(g, x, y, w, 18, 'rgba(27,19,37,0.82)', PAL.ink);
    text(g, labelStr, x + 3, y, HUD_OPT.white);
    UI.bar(g, x + 3, y + 11, w - 6, 5, frac, col);
  },
  /** Time left, top centre: seconds and a draining bar. */
  timer(g, secs, frac) {
    const w = 64, x = Math.round((VIEW.W - w) / 2), y = 32;
    box(g, x, y, w, 20, 'rgba(27,19,37,0.82)', PAL.ink);
    HUD_OPT.timer.col = secs < 10 ? PAL.r3 : PAL.white;
    text(g, label('hud.secs', Math.max(0, Math.ceil(secs))), x + w / 2, y + 1, HUD_OPT.timer);
    UI.bar(g, x + 3, y + 13, w - 6, 5, frac, secs < 10 ? PAL.r2 : PAL.w3);
  },
  /** A score box, top right. */
  score(g, value, labelKey) {
    const s = fmt(value), w = Math.max(56, textW(s) + 12), x = VIEW.W - w - 6, y = 4;
    box(g, x, y, w, 24, 'rgba(27,19,37,0.82)', PAL.ink);
    text(g, t(labelKey || 'hud.score'), x + w / 2, y + 1, HUD_OPT.grey);
    text(g, s, x + w / 2, y + 12, HUD_OPT.val);
  },
  /** A short message in the middle (Perfect! Good! Miss). */
  pop(x, y, key, col) { UI.float(x, y, t(key), col || PAL.r4); },
};
JC.hud = HUD;
