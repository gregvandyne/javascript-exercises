// ======================================================================================================
// SCREENS: the title (a sunset river, Cappy on his raft, the Great Kapok behind, our leafy JUNGLE CUP logo), the
// map (fast travel, bests, stars, Feathers), Settings, Controls, Style (cosmetics), the Canopy Stage finale and credits.
// ======================================================================================================
/* ---------- the logo ---------- */
const LOGO = { c: null, gen: -1, k: 0, w: 0, h: 0 };
function glyphMask(str) {
  const cols = []; // [x][y] booleans, 9 rows
  for (const ch of str) {
    if (ch === ' ') { for (let i = 0; i < 3; i++) cols.push(0); continue; }
    const rows = GLYPHS[ch], w = GW[ch];
    for (let b = 0; b < w; b++) { let m = 0; for (let j = 0; j < 7; j++) if (rows[j] & (16 >> b)) m |= 1 << j; cols.push(m); }
    cols.push(0);
  }
  cols.pop();
  return cols;
}
function buildLogo() {
  const maxW = Math.min(VIEW.W - 16, 330);
  const top = glyphMask('JUNGLE'), bot = glyphMask('CUP');
  const k = Math.max(3, Math.min(7, Math.floor(maxW / (top.length + 2))));
  const W = (top.length + 2) * k + 6, H = (7 * 2 + 4) * k + 8;
  const c = canvas(W, H), g = c.getContext('2d');
  const draw = (cols, ox, oy, fill) => {
    const at = (x, y) => x >= 0 && x < cols.length && y >= 0 && y < 7 && (cols[x] >> y) & 1;
    // outline + extrusion
    for (let x = -1; x <= cols.length; x++) for (let y = -1; y <= 8; y++) {
      let near = false; for (let dx = -1; dx <= 1 && !near; dx++) for (let dy = -1; dy <= 1; dy++) if (at(x + dx, y + dy) || at(x + dx, y + dy - 1)) { near = true; break; }
      if (near) g.fillRect && (g.fillStyle = PAL.ink, g.fillRect(ox + x * k - 2, oy + y * k - 2, k + 4, k + 4));
    }
    for (let x = 0; x < cols.length; x++) for (let y = 0; y < 8; y++) if (at(x, y - 1) && !at(x, y)) { g.fillStyle = fill[3]; g.fillRect(ox + x * k, oy + y * k, k, k); }
    for (let x = 0; x < cols.length; x++) for (let y = 0; y < 7; y++) if (at(x, y)) {
      g.fillStyle = y < 2 ? fill[0] : y < 5 ? fill[1] : fill[2]; g.fillRect(ox + x * k, oy + y * k, k, k);
      if (!at(x, y - 1)) { g.fillStyle = fill[4]; g.fillRect(ox + x * k, oy + y * k, k, Math.max(1, k >> 2)); }
      if (hash(x, y, ox) < 0.18) { g.fillStyle = fill[3]; g.fillRect(ox + x * k + (k >> 2), oy + y * k + (k >> 2), Math.max(1, k >> 1), Math.max(1, k >> 2)); }
    }
  };
  const green = ['#a8e86a', '#56c040', '#2f8a3a', '#1c5a2a', '#e6ffb0'], gold = ['#fff3a8', '#ffd24a', '#e09a1e', '#8a5a12', '#ffffff'];
  const ox1 = Math.round((W - top.length * k) / 2);
  draw(top, ox1, 4, green);
  const ox2 = Math.round((W - bot.length * k) / 2);
  draw(bot, ox2, 4 + 9 * k, gold);
  // leaves sprouting from the J and the E
  const leaf = (x, y, flip) => { const L = SPRITES.leaf; g.save(); g.translate(x, y); if (flip) { g.scale(-1, 1); } g.drawImage(L.c, 0, 0, L.w * Math.max(1, k >> 1), L.h * Math.max(1, k >> 1)); g.restore(); };
  leaf(ox1 + 1 * k, 4 - k * 1.2, false); leaf(ox1 + (top.length - 1) * k, 4 - k * 1.2, true);
  LOGO.c = c; LOGO.w = W; LOGO.h = H; LOGO.k = k; LOGO.gen = VIEW.gen;
}
/* ---------- the title ---------- */
const TITLE = { name: 'title', t: 0, confirm: false, bg: null, bgGen: -1 };
const TAGLINE = { align: 'center', col: '#fff8e8', edge: '#3a2a6e' };
function buildTitleBg() {
  const W = VIEW.W, H = VIEW.H, c = canvas(W, H), g = c.getContext('2d');
  const hz = Math.round(H * 0.62);
  const bands = ['#3a2a6e', '#5a3488', '#8a3c94', '#c2488e', '#ef6a7a', '#ff8c5e', '#ffb05a', '#ffd27a'];
  for (let i = 0; i < bands.length; i++) {
    const y0 = Math.round(hz * i / bands.length), y1 = Math.round(hz * (i + 1) / bands.length);
    g.fillStyle = bands[i]; g.fillRect(0, y0, W, y1 - y0);
    if (i < bands.length - 1) { g.fillStyle = bands[i + 1]; for (let x = (i % 2); x < W; x += 2) g.fillRect(x, y1 - 1, 1, 1); for (let x = 0; x < W; x += 4) g.fillRect(x + (i % 2) * 2, y1 - 2, 1, 1); }
  }
  // the sun, with its stripes
  const sx = Math.round(W * 0.5), sy = hz - 4, sr = Math.round(Math.min(W, H) * 0.16);
  disc(g, sx, sy, sr + 3, '#ffe9a0'); disc(g, sx, sy, sr, '#fff3c0');
  for (let i = 0; i < 4; i++) { g.fillStyle = bands[6 - (i % 2)]; g.fillRect(sx - sr, sy - 4 - i * 5, sr * 2 + 1, 1 + (i >> 1)); }
  // the Great Kapok (a silhouette on the far bank)
  const kx = Math.round(W * 0.78), kb = hz;
  g.fillStyle = '#2a1c48'; g.fillRect(kx - 8, kb - 70, 16, 70); g.fillRect(kx - 16, kb - 12, 32, 12);
  for (const [dx, dy, r] of [[-30, -80, 22], [30, -82, 22], [0, -98, 28], [-48, -70, 14], [48, -70, 14], [-16, -112, 18], [18, -112, 18]]) disc(g, kx + dx, kb + dy, r, '#2a1c48');
  for (let i = 0; i < 6; i++) g.fillRect(kx - 40 + i * 16, kb - 64, 1, 20 + (i % 3) * 6);
  // jungle banks, far then near
  for (let x = -10; x < W + 10; x += 9) { const h = 14 + Math.round(8 * Math.sin(x * 0.13) + 5 * Math.sin(x * 0.31)); disc(g, x, hz - h + 10, 9, '#3b2560'); }
  g.fillStyle = '#3b2560'; g.fillRect(0, hz - 8, W, 8);
  // river
  for (let y = hz; y < H; y++) { const k = (y - hz) / (H - hz); g.fillStyle = k < 0.15 ? '#c25d8a' : k < 0.35 ? '#8a4a9a' : k < 0.6 ? '#5a3a8a' : '#3a2a6e'; g.fillRect(0, y, W, 1); }
  // the sun's path on the water
  for (let y = hz + 2; y < H; y += 3) { const w = Math.round(sr * (1.2 - (y - hz) / (H - hz) * 0.6)); g.fillStyle = (y >> 1) % 2 ? '#ffd27a' : '#ffb05a'; g.fillRect(sx - w + ((y * 7) % 5), y, w * 2 - ((y * 3) % 7), 1); }
  // near banks: big leaves left and right
  const leafy = (x, y, r, col) => { disc(g, x, y, r + 1, '#120c22'); disc(g, x, y, r, col); };
  for (const [x, y, r] of [[0, H - 10, 34], [22, H - 46, 22], [-6, H - 70, 18], [W, H - 12, 34], [W - 20, H - 44, 22], [W + 4, H - 74, 18]]) leafy(x, y, r, '#1e1438');
  for (const [x, y] of [[8, H - 60], [W - 10, H - 58], [30, H - 26], [W - 34, H - 30]]) { g.fillStyle = '#2a1c48'; g.fillRect(x, y, 2, 30); }
  TITLE.bg = c; TITLE.bgGen = VIEW.gen;
}
TITLE.enter = function () { JC.audioWant = 'title'; TITLE.confirm = false; UI.setFocus(SAVE.exists() ? 'continue' : 'play'); };
TITLE.update = function (dt) { TITLE.t += dt; };
TITLE.onInput = function (e) {
  const id = UI.menuInput(e);
  if (TITLE.confirm) {
    if (id === 'yes') { AUDIO.sfx('select'); newGame(); }
    else if (id === 'no' || (e.type === 'press' && e.key === 'b')) { TITLE.confirm = false; AUDIO.sfx('back'); UI.setFocus('continue'); }
    return;
  }
  if (id === 'continue') { AUDIO.sfx('select'); continueGame(); }
  else if (id === 'play') { AUDIO.sfx('select'); if (SAVE.exists()) { TITLE.confirm = true; UI.setFocus('no'); } else newGame(); }
};
function newGame() {
  SAVE.reset(true); SAVE.data.started = true; SAVE.write();
  JC.refreshCappy();
  JC.go('world', { at: [START_POS.x, START_POS.y, 'up'], intro: true });
}
function continueGame() {
  SAVE.load(); JC.refreshCappy();
  const p = SAVE.data.pos; const [x, y] = WORLD.isSolid(p.x, p.y) ? nearestFree(p.x, p.y) : [p.x, p.y];
  JC.go('world', { at: [x, y, p.d], story: true });
}
JC.newGame = newGame; JC.continueGame = continueGame;
TITLE.draw = function (g) {
  if (TITLE.bgGen !== VIEW.gen) buildTitleBg();
  if (LOGO.gen !== VIEW.gen) buildLogo();
  g.drawImage(TITLE.bg, 0, 0);
  const W = VIEW.W, H = VIEW.H, hz = Math.round(H * 0.62);
  // shimmering water lines
  for (let i = 0; i < 9; i++) { const y = hz + 6 + i * ((H - hz) / 9 | 0), x = ((i * 53 + TITLE.t * (14 + i * 3)) % (W + 40)) - 20; rect(g, x, y, 10 + (i % 3) * 4, 1, '#ffd9a0'); }
  // fireflies
  for (let i = 0; i < 10; i++) { const x = (i * 71 + Math.sin(TITLE.t * 0.7 + i) * 12 + W) % W, y = hz - 30 + Math.sin(TITLE.t * 1.3 + i * 2) * 20 + (i % 3) * 14; if (((TITLE.t * 2 + i) | 0) % 3) rect(g, x, y, 1, 1, '#fff3a8'); }
  // Cappy on his raft
  const RK = H > 300 && W > 260 ? 2 : 1;
  const rx = Math.round(W / 2 - 18 * RK), ry = Math.round(hz + (H - hz) * 0.36 + Math.sin(TITLE.t * 1.8) * 2);
  g.save(); g.translate(rx, ry); g.scale(RK, RK);
  rect(g, -4, 14, 44, 3, 'rgba(20,10,40,0.45)');
  rect(g, -2, 5, 40, 10, OUT);
  for (let i = 0; i < 7; i++) { rect(g, -1 + i * 6 - (i === 6 ? 1 : 0), 6, 5, 8, i % 2 ? '#a8703e' : '#c48a4c'); rect(g, -1 + i * 6, 6, 5, 1, '#e0b070'); }
  rect(g, 30, -18, 2, 24, '#5e3820'); rect(g, 32, -18, 11, 8, OUT); rect(g, 32, -17, 10, 6, SAVE.data.cos.flag === 'leaf' ? '#45c34e' : '#fff8e8');
  rect(g, 35, -15, 4, 2, '#e04848');
  spr(g, SPRITES.cappy_right, 8, -10);
  if (SAVE.data.cos.hat && SPRITES['hat_' + SAVE.data.cos.hat]) spr(g, SPRITES['hat_' + SAVE.data.cos.hat], 10, -12);
  if (((TITLE.t * 2) | 0) % 2) { rect(g, -8, 16, 6, 1, '#ffd9a0'); rect(g, 40, 16, 6, 1, '#ffd9a0'); }
  g.restore();
  // the logo
  const ly = Math.max(6, Math.round(H * 0.05)), bob = Math.round(Math.sin(TITLE.t * 1.4) * 1.5);
  g.drawImage(LOGO.c, Math.round((W - LOGO.w) / 2), ly + bob);
  textBlock(g, t('tagline'), 8, ly + LOGO.h + 2, W - 16, TAGLINE);
  // buttons
  const bh = Math.max(24, VIEW.tap), bw = Math.min(170, W - 40), bx = Math.round((W - bw) / 2);
  const has = SAVE.exists();
  let by = Math.min(H - (has ? bh * 2 + 14 : bh + 8), Math.round(hz + (H - hz) * 0.36 + 22 * RK));
  if (TITLE.confirm) {
    const cw = Math.min(W - 16, 280), ch = 60 + bh, cx = Math.round((W - cw) / 2), cy = Math.round((H - ch) / 2);
    g.fillStyle = 'rgba(16,10,24,0.55)'; g.fillRect(0, 0, W, H);
    const c = UI.card(g, cx, cy, cw, ch);
    textBlock(g, t('confirm.new'), c.x + 2, c.y + 1, c.w - 4, { col: PAL.ink, edge: null });
    const bw2 = (c.w - 6) / 2;
    UI.button(g, 'no', c.x + 2, cy + ch - bh - 9, bw2, bh, t('btn.no'), { col: '#3fae4a' });
    UI.button(g, 'yes', c.x + 4 + bw2, cy + ch - bh - 9, bw2, bh, t('btn.yesNew'), { col: PAL.r2 });
    return;
  }
  if (has) { UI.button(g, 'continue', bx, by, bw, bh, t('btn.continue'), { col: '#3fae4a', icon: UI.icons.play }); by += bh + 6; UI.button(g, 'play', bx, by, bw, bh, t('btn.newGame'), { col: PAL.r3 }); }
  else UI.button(g, 'play', bx, by, bw, bh, t('btn.play'), { col: '#3fae4a', icon: UI.icons.play });
};

/* ---------- the map (and its panels: settings, controls, style) ---------- */
const MAP = { name: 'map', tab: 'map', mini: null, t: 0 };
function buildMini() {
  const c = canvas(MW * 2, MH * 2), g = c.getContext('2d');
  const COL = ['#1f62a0', '#3393cc', '#e8cd8a', '#4fa83f', '#5cb845', '#c99a5e', '#a8703e', '#8a93a0', '#a8703e', '#7a4a2a', '#4fb84a', '#66c24c', '#c97c4c', '#3f8a32', '#2f7034', '#7fd4ee'];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { g.fillStyle = COL[tileAt(x, y)] || '#000'; g.fillRect(x * 2, y * 2, 2, 2); }
  for (const o of WORLD.objects) if (o.k === 'tree' || o.k === 'palm' || o.k === 'giant') { g.fillStyle = o.k === 'giant' ? '#1d5e3a' : '#236e2c'; g.fillRect(o.x * 2, o.y * 2 - 1, 2, 2); }
  for (const o of WORLD.objects) if (o.k === 'hut') { g.fillStyle = '#c9a050'; g.fillRect(o.x * 2 - 2, o.y * 2 - 2, 6, 3); }
  g.fillStyle = '#1d5e3a'; disc(g, 36 * 2 + 1, 10 * 2, 9, '#1d5e3a');
  MAP.mini = c;
}
MAP.enter = function (opts) { MAP.tab = (opts && opts.tab) || 'map'; MAP.from = (opts && opts.from) || 'world'; if (!MAP.mini) buildMini(); UI.setFocus('close'); };
MAP.update = function (dt) { MAP.t += dt; };
function closeMap() { AUDIO.sfx('back'); JC.go('world'); }
MAP.onInput = function (e) {
  const id = UI.menuInput(e);
  if (e.type === 'press' && e.key === 'b') { if (MAP.tab === 'map') closeMap(); else { MAP.tab = MAP.tab === 'confirm' ? 'settings' : 'map'; AUDIO.sfx('back'); UI.setFocus('close'); } return; }
  if (!id) return;
  AUDIO.sfx('select');
  if (id === 'close') { if (MAP.tab === 'map') closeMap(); else { MAP.tab = MAP.tab === 'confirm' ? 'settings' : 'map'; UI.setFocus('close'); } return; }
  if (id.startsWith('go:')) { const sp = id.slice(3), a = ARCHES[sp]; JC.go('world', { at: [a.x, a.y + 1, 'up'] }); return; }
  if (id === 'settings' || id === 'controls' || id === 'style') { MAP.tab = id; UI.setFocus('close'); return; }
  if (id === 'sound') { BRBX.mute(!BRBX.muted()); AUDIO.sync(); return; }
  if (id === 'font') { SAVE.data.settings.font = SAVE.data.settings.font === 'clear' ? 'pixel' : 'clear'; SAVE.apply(); SAVE.write(); return; }
  if (id === 'easy') { SAVE.data.settings.easy = !SAVE.data.settings.easy; SAVE.write(); return; }
  if (id === 'new') { MAP.tab = 'confirm'; UI.setFocus('no'); return; }
  if (id === 'no') { MAP.tab = 'settings'; return; }
  if (id === 'yes') { newGame(); return; }
  if (id === 'bandana' || id === 'hat' || id === 'flag') { cycleCos(id); return; }
};
function cycleCos(kind) {
  const c = SAVE.data.cos;
  let opts;
  if (kind === 'bandana') opts = c.own.filter(x => BANDANAS[x]);
  else opts = [''].concat(c.own.filter(x => x.startsWith(kind + '_')).map(x => x.slice(kind.length + 1)));
  const i = opts.indexOf(c[kind]); c[kind] = opts[(i + 1) % opts.length];
  if (kind === 'bandana') JC.refreshCappy();
  SAVE.write();
}
function panelFrame(g, titleKey) {
  g.fillStyle = '#123524'; g.fillRect(0, 0, VIEW.W, VIEW.H);
  for (let y = 0; y < VIEW.H; y += 24) for (let x = (y / 24 % 2) * 12; x < VIEW.W; x += 24) spr(g, SPRITES.leaf, x, y);
  g.fillStyle = 'rgba(10,30,20,0.6)'; g.fillRect(0, 0, VIEW.W, VIEW.H);
  const w = Math.min(VIEW.W - 8, 520), h = VIEW.H - 8, x = Math.round((VIEW.W - w) / 2), y = 4;
  const c = UI.card(g, x, y, w, h);
  const r = Math.max(10, (VIEW.tap / 2) | 0);
  text(g, t(titleKey), c.x + 2, c.y + Math.max(0, r - 8), { col: PAL.ink, edge: null, scale: textW(t(titleKey), 2) < c.w - r * 2 - 10 ? 2 : 1 });
  UI.iconButton(g, 'close', c.x + c.w - r, c.y + r - 2, UI.icons.close, { col: '#b4302f' });
  return { x: c.x, y: c.y + r * 2 + 2, w: c.w, h: c.h - r * 2 - 2 };
}
function drawMapTab(g) {
  const area = panelFrame(g, 'map.title');
  const land = area.w > area.h * 1.15;
  const rowH = Math.max(20, VIEW.tap), bh = Math.max(20, VIEW.tap);
  // the minimap
  let mx, my, mw, mh;
  const listW = land ? Math.min(250, area.w * 0.55) : area.w;
  const mapMaxW = land ? area.w - listW - 6 : area.w, mapMaxH = land ? area.h - bh - 6 : Math.max(60, area.h - rowH * 7 - 18 - bh - 10);
  const sc = Math.max(0.5, Math.min(mapMaxW / (MW * 2), mapMaxH / (MH * 2)));
  const k = sc >= 1 ? Math.floor(sc) : sc;
  mw = Math.round(MW * 2 * k); mh = Math.round(MH * 2 * k);
  mx = area.x + Math.round((mapMaxW - mw) / 2); my = area.y;
  box(g, mx - 2, my - 2, mw + 4, mh + 4, '#1f62a0', PAL.ink);
  g.drawImage(MAP.mini, mx, my, mw, mh);
  const mk = mw / MW;
  for (const id of JC.sportOrder) { const a = ARCHES[id]; disc(g, mx + a.x * mk + mk / 2, my + a.y * mk, 3, PAL.ink); disc(g, mx + a.x * mk + mk / 2, my + a.y * mk, 2, SPORT_COLOURS[id]); }
  disc(g, mx + 36 * mk + mk / 2, my + 37 * mk, 2, '#a8703e');
  if (((MAP.t * 3) | 0) % 3) { const cx = mx + P.x * mk + mk / 2, cy = my + P.y * mk; disc(g, cx, cy, 4, PAL.ink); disc(g, cx, cy, 3, PAL.white); disc(g, cx, cy, 1, '#b0703e'); }
  // the Feathers
  let fy = my + mh + 4;
  const fx0 = land ? area.x + listW + 6 : area.x;
  if (!land) { for (let i = 0; i < 7; i++) { const id = JC.sportOrder[i]; if (SAVE.data.feathers[id]) spr(g, featherSprite(SPORT_COLOURS[id]), area.x + 2 + i * 11, fy); else rect(g, area.x + 4 + i * 11, fy + 3, 3, 6, '#b8a888'); } text(g, label('map.feathers', SAVE.featherCount()), area.x + 82, fy, { col: PAL.ink, edge: null }); fy += 14; }
  // the sport rows
  const lx = land ? area.x + mapMaxW + 6 : area.x, ly0 = land ? area.y : fy;
  if (land) { for (let i = 0; i < 7; i++) { const id = JC.sportOrder[i]; if (SAVE.data.feathers[id]) spr(g, featherSprite(SPORT_COLOURS[id]), lx + 2 + i * 11, ly0); else rect(g, lx + 4 + i * 11, ly0 + 3, 3, 6, '#b8a888'); } }
  const rows0 = land ? ly0 + 14 : ly0;
  const avail = area.y + area.h - bh - 4 - rows0;
  const rh = Math.min(rowH, Math.max(16, Math.floor(avail / 7) - 2));
  for (let i = 0; i < 7; i++) {
    const id = JC.sportOrder[i], y = rows0 + i * (rh + 2), played = SAVE.data.plays[id], w = land ? listW : area.w;
    UI.addHit('go:' + id, lx, y, w, rh);
    const focused = UI.showFocus && UI.focusedId() === 'go:' + id;
    box(g, lx, y, w, rh, focused ? '#fff3a8' : '#f0dca8', PAL.ink);
    rect(g, lx + 1, y + 1, 4, rh - 2, SPORT_COLOURS[id]);
    const ic = iconSprite(id); spr(g, ic, lx + 8, y + ((rh - ic.h) >> 1));
    const best = played ? fmt(SAVE.data.best[id] || 0) : '???';
    ROWTEXT.maxW = w - 16 - 34 - textW(best) - 4;
    text(g, t('sport.' + id), lx + 16, y + ((rh - 12) >> 1), ROWTEXT);
    const st = SAVE.data.stars[id] || 0;
    for (let s = 0; s < 3; s++) disc(g, lx + w - 26 + s * 8, y + (rh >> 1), 2, s < st ? '#ffb020' : '#b8a888');
    text(g, best, lx + w - 32, y + ((rh - 12) >> 1), { col: '#5e3820', edge: null, align: 'right' });
  }
  // buttons
  const by = area.y + area.h - bh, bw = Math.floor((area.w - 8) / 3);
  UI.button(g, 'settings', area.x, by, bw, bh, t('btn.settings'), { col: '#7a6a8a', icon: UI.icons.gear });
  UI.button(g, 'controls', area.x + bw + 4, by, bw, bh, t('btn.controls'), { col: PAL.w2 });
  UI.button(g, 'style', area.x + (bw + 4) * 2, by, bw, bh, t('btn.style'), { col: '#c04aa8' });
}
const ROWTEXT = { col: PAL.ink, edge: null, maxW: 0 };
function toggleRow(g, id, x, y, w, h, labelKey, value) {
  const bw = Math.min(110, w * 0.45);
  ROWTEXT.maxW = w - bw - 6;
  text(g, t(labelKey), x + 2, y + ((h - 12) >> 1), ROWTEXT);
  UI.button(g, id, x + w - bw, y, bw, h, value, { col: '#3d8a3a' });
}
function drawSettings(g) {
  const area = panelFrame(g, 'settings.title'), bh = Math.max(20, VIEW.tap);
  let y = area.y;
  toggleRow(g, 'sound', area.x, y, area.w, bh, 'settings.sound', t(BRBX.muted() ? 'off' : 'on')); y += bh + 6;
  toggleRow(g, 'font', area.x, y, area.w, bh, 'settings.font', t(SAVE.data.settings.font === 'clear' ? 'settings.clear' : 'settings.pixel')); y += bh + 6;
  toggleRow(g, 'easy', area.x, y, area.w, bh, 'settings.easy', t(SAVE.data.settings.easy ? 'on' : 'off')); y += bh + 2;
  y += textBlock(g, t('settings.easyHelp'), area.x + 2, y, area.w - 4, { col: PAL.ink2, edge: null }) + 6;
  if (y + bh <= area.y + area.h) UI.button(g, 'new', area.x, Math.max(y, area.y + area.h - bh), Math.min(area.w, 200), bh, t('btn.newGame'), { col: PAL.r2 });
}
function drawConfirm(g) {
  const area = panelFrame(g, 'settings.title'), bh = Math.max(20, VIEW.tap);
  textBlock(g, t('confirm.new'), area.x + 2, area.y, area.w - 4, { col: PAL.ink, edge: null });
  const bw = Math.min(140, (area.w - 6) / 2), y = area.y + area.h - bh;
  UI.button(g, 'no', area.x, y, bw, bh, t('btn.no'), { col: '#3fae4a' });
  UI.button(g, 'yes', area.x + area.w - bw, y, bw, bh, t('btn.yesNew'), { col: PAL.r2 });
}
function drawControls(g) {
  const area = panelFrame(g, 'controls.title');
  let y = area.y;
  for (const k of ['touch', 'keys', 'pad']) {
    text(g, t('controls.' + k), area.x + 2, y, { col: '#2f8a3f', edge: null }); y += 12;
    y += textBlock(g, t('controls.' + k + '.body'), area.x + 6, y, area.w - 8, { col: PAL.ink, edge: null }) + 6;
  }
}
function drawStyle(g) {
  const area = panelFrame(g, 'style.title'), bh = Math.max(20, VIEW.tap), c = SAVE.data.cos;
  const k = area.h > 160 ? 3 : 2;
  box(g, area.x, area.y, 16 * k + 12, 16 * k + 12, '#cde8a8', PAL.ink);
  const s = SPRITES.cappy_down; sprK(g, s, area.x + 6, area.y + 6, k);
  if (c.hat) { const h = SPRITES['hat_' + c.hat]; if (h) sprK(g, h, area.x + 6 + k, area.y + 6 - 2 * k, k); }
  const rx = area.x + 16 * k + 18, rw = area.w - 16 * k - 18;
  let y = area.y;
  const bandName = t('band.' + c.bandana), hatName = c.hat ? t('hat.' + c.hat) : t('none'), flagName = c.flag ? t('flag.' + c.flag) : t('none');
  toggleRow(g, 'bandana', rx, y, rw, bh, 'style.bandana', bandName); y += bh + 6;
  toggleRow(g, 'hat', rx, y, rw, bh, 'style.hat', hatName); y += bh + 6;
  toggleRow(g, 'flag', rx, y, rw, bh, 'style.flag', flagName); y += bh + 6;
  textBlock(g, t('style.help'), area.x + 2, Math.max(y, area.y + 16 * k + 16), area.w - 4, { col: PAL.ink2, edge: null });
}
MAP.draw = function (g) {
  if (MAP.tab === 'map') drawMapTab(g);
  else if (MAP.tab === 'settings') drawSettings(g);
  else if (MAP.tab === 'confirm') drawConfirm(g);
  else if (MAP.tab === 'controls') drawControls(g);
  else if (MAP.tab === 'style') drawStyle(g);
  UI.drawFx(g);
};

/* ---------- the Canopy Stage finale and the credits ---------- */
const FIN = { name: 'finale', t: 0, step: 0, raised: false };
FIN.enter = function () {
  FIN.t = 0; FIN.raised = false; FIN.thanked = false; JC.audioWant = 'finale';
  // the painted panels (the lift, the Canopy Stage, the Cup), then Mango on the pixel stage and the Cup raised high
  JC.say(JC.storyLines('finale').concat([{ who: 'mango', key: 'end.4' }]), () => {
    FIN.raised = true; FIN.raiseT = FIN.t; AUDIO.sfx('fanfare'); UI.confetti(VIEW.W / 2, VIEW.H * 0.35, 90); UI.banner(t('end.cup'), PAL.gold2, 3);
    SAVE.data.cup = true; JC.grantBandana('gold', true, true); SAVE.write(); BRBX.gameOver(true, SAVE.cupPoints());
  });
};
FIN.update = function (dt) {
  FIN.t += dt; TB.update(dt); STORY.update(dt);
  // a moment with the Cup held high, then Cappy's thanks and the credits (game time, so pausing and tests stay in step)
  if (FIN.raised && !FIN.thanked && FIN.t - FIN.raiseT > 2.6) { FIN.thanked = true; JC.say([{ who: 'cappy', key: 'end.5' }], () => JC.go('credits')); } if (FIN.raised && ((FIN.t * 4) | 0) % 6 === 0) UI.particle(Math.random() * VIEW.W, -4, 0, 20, CONFETTI[(Math.random() * 7) | 0], 3, 2, 20); };
FIN.onInput = function (e) { if (!STORY.input(e)) TB.input(e); };
FIN.draw = function (g) {
  if (STORY.showing()) { STORY.draw(g); TB.draw(g); return; }
  const W = VIEW.W, H = VIEW.H;
  const bands = ['#5a3488', '#8a3c94', '#c2488e', '#ef6a7a', '#ff8c5e', '#ffb05a'];
  for (let i = 0; i < bands.length; i++) rect(g, 0, Math.round(H * 0.6 * i / bands.length), W, Math.ceil(H * 0.6 / bands.length) + 1, bands[i]);
  disc(g, W * 0.5, H * 0.6, Math.min(W, H) * 0.2, '#ffe9a0');
  // the canopy around the stage
  for (let x = -20; x < W + 20; x += 26) { canopy(g, x, H * 0.62 + Math.sin(x) * 6, 18, TREE_COLS[(x / 26 | 0) % 3]); }
  const sy = Math.round(H * 0.7);
  rect(g, 0, sy, W, H - sy, '#5e3820'); for (let x = 0; x < W; x += 10) rect(g, x, sy, 9, 3, '#8a5a33'); rect(g, 0, sy, W, 1, OUT);
  for (let y = sy + 6; y < H; y += 6) rect(g, 0, y, W, 1, '#4a2c18');
  // champions in a row (in their colours)
  const champs = ['jada', 'sloane', 'tico', 'otters', 'rana', 'mico', 'kiki'];
  const gap = Math.min(30, (W - 60) / 7);
  champs.forEach((c, i) => {
    const s = SPRITES[CHAMP_SPR[c]], x = Math.round(W / 2 + (i - 3) * gap - 8 + (i >= 3 ? 26 : -26) * (i === 3 ? 0 : 1)), y = sy - 16 + ((((FIN.t * 2) | 0) + i) % 2);
    if (i === 3) return;
    shadow(g, x + 8, sy, 6); spr(g, s, x, y, i > 3);
    spr(g, featherSprite(SPORT_COLOURS[JC.sportOrder[i]]), x + 12, y - 6);
  });
  // Cappy and the Jungle Cup
  const cx = Math.round(W / 2 - 8), cyy = sy - 16;
  shadow(g, cx + 8, sy, 7);
  spr(g, SPRITES.cappy_down, cx, cyy);
  const cup = SPRITES.cup, up = FIN.raised ? Math.min(14, (FIN.t - FIN.raiseT) * 30) : 0;
  sprK(g, cup, cx + 8 - cup.w, cyy - 22 - up, 2);
  if (FIN.raised && ((FIN.t * 3) | 0) % 2) { spr(g, SPRITES.sparkle, cx - 10, cyy - 30 - up); spr(g, SPRITES.sparkle, cx + 20, cyy - 20 - up); }
  UI.drawFx(g);
  TB.draw(g);
};
const CRED = { name: 'credits', t: 0 };
CRED.enter = function () { CRED.t = 0; JC.audioWant = 'finale'; UI.setFocus('done'); };
CRED.update = function (dt) { CRED.t += dt; };
CRED.onInput = function (e) {
  const id = UI.menuInput(e);
  if (id === 'done' || (e.type === 'press' && e.key === 'b')) { AUDIO.sfx('select'); JC.go('world', { at: [WORLD.lift.x, WORLD.lift.y + 1, 'down'], say: [{ who: 'mango', key: 'd.mango.free' }] }); }
};
CRED.draw = function (g) {
  const W = VIEW.W, H = VIEW.H;
  g.fillStyle = '#1a1030'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) rect(g, (i * 97) % W, (i * 61 + CRED.t * 4) % H, 1, 1, i % 3 ? '#fff3a8' : '#8ee070');
  const lines = ['credits.1', 'credits.2', 'credits.3', 'credits.4', 'credits.5', 'credits.6', 'credits.7', 'credits.8'];
  let y = H - CRED.t * 22;
  const stop = 20; if (y < stop) y = stop;
  if (LOGO.gen !== VIEW.gen) buildLogo();
  g.drawImage(LOGO.c, Math.round((W - LOGO.w) / 2), Math.round(y));
  y += LOGO.h + 8;
  for (const k of lines) { y += textBlock(g, t(k), 10, y, W - 20, { col: PAL.white, align: 'center' }) + 8; }
  const bh = Math.max(22, VIEW.tap), bw = Math.min(200, W - 40);
  UI.button(g, 'done', Math.round((W - bw) / 2), H - bh - 8, bw, bh, t('btn.freePlay'), { col: '#3fae4a', icon: UI.icons.play });
};
