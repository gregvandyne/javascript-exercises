// ======================================================================================================
// GETTING ROUND DELTA ISLE: the little adventures between the sports.
//   ladders (push the stick up or down to climb; stop anywhere), the swaying rope bridge, stepping stones and bobbing
//   lily pads, the mud trail (splashy, a little slower), the glowing cave and the waterfall, and the rides: the vine
//   swing over the ravine, the zipline down from the high grove, the river ferry. Two shortcuts open once you get
//   there (kick the rolled-up ladder down; push the log over the gorge). Golden acorns hide along the way; friendly
//   animals live here too. Nothing hurts and nothing traps: a ride always ends on solid ground, and if Cappy is ever
//   somewhere he shouldn't be he is gently put back.
// ======================================================================================================
const R_ = ROUTES;
const TRAVEL = { ride: null, near: null, caveK: 0, stuckT: 0, acornN: 0, discT: 0 };
JC.travel = TRAVEL;
// the rides and the places to use them (pixels of the standing spot; generous reach)
const TRAV_REACH = 26;
const tilePx = (x, y) => [x * TS, y * TS];
const RIDES = [
  { kind: 'swing', a: R_.swing.a, b: R_.swing.b, two: true },
  { kind: 'zip', a: R_.zip.a, b: R_.zip.b, two: false },
  { kind: 'ferry', a: null, b: null, two: true },          // its landings come from the map (WORLD.ferry)
  { kind: 'kick', a: [R_.kickLadder.x, R_.kickLadder.y0 - 1], flag: 'scLadder' },
  { kind: 'push', a: [R_.gorgeX - 2, R_.logY], flag: 'scLog' },
];
// golden acorns, tucked along the ways round (found with nearestFree so each sits on open ground)
const ACORN_SPOTS = [[55, 50], [70, 29], [74, 12], [58, 24], [38, 18], [22, 47], [18, 59], [8, 66], [12, 84], [25, 35], [12, 22],
  [67, 73], [83, 82], [98, 22], [101, 58], [84, 44]];
const ACORNS = [];
WORLD.acorns = ACORNS;
// friendly animals (no talking, just life): butterflies, a beach turtle, jumping fish, fireflies in the cave
const BUTTERFLIES = [[44, 50], [56, 46], [24, 52], [20, 34], [70, 26], [58, 80], [38, 78], [97, 30]].map(([x, y], i) => ({ x: x * TS, y: y * TS, i, col: ['#ff6fb5', '#ffd23f', '#7fd4ee', '#fff8e8'][i % 4] }));
const FISH = [[12, 53], [20, 56], [46, 97], [88, 64]].map(([x, y], i) => ({ x: x * TS + 8, y: y * TS + 8, t: i * 1.7 }));
const TURTLE = { x0: 56 * TS, x1: 64 * TS, y: 0, t: 0 };
function buildTravel() {
  RIDES[2].a = WORLD.ferry.a; RIDES[2].b = WORLD.ferry.b;
  ACORNS.length = 0;
  ACORN_SPOTS.forEach(([x, y], i) => { const [fx, fy] = nearestFree(x, y); ACORNS.push({ i, x: fx, y: fy }); });
  TRAVEL.acornN = ACORNS.length;
  // the turtle walks the sand south of the dock
  for (let y = MH - 1; y > 80; y--) if (tileAt(60, y) === T_SAND) { TURTLE.y = y * TS; break; }
}
JC.buildTravel = buildTravel;
const flags = () => SAVE.data.flags;
TRAVEL.acornsGot = () => { let n = 0; for (const a of ACORNS) if (flags()['ac' + a.i]) n++; return n; };
/* ---------- where Cappy is ---------- */
function feetTile() { return tileAt(Math.floor((P.fpx + 8) / TS), Math.floor((P.fpy + 12) / TS)); }
TRAVEL.feetTile = feetTile;
TRAVEL.onLadder = () => feetTile() === T_LADDER;
/** For walking: on a ladder only up and down count, and Cappy slides to the ladder's middle. */
TRAVEL.ladderAxis = function (dt) {
  const tx = Math.floor((P.fpx + 8) / TS), ty = Math.floor((P.fpy + 12) / TS);
  let lx = tx; while (tileAt(lx - 1, ty) === T_LADDER) lx--;
  const mid = lx * TS + TS - 8;   // two tiles wide: Cappy's left edge so his middle is the ladder's middle
  P.fpx += clamp(mid - P.fpx, -60 * dt, 60 * dt);
};
/** Speed for the ground under his feet (mud is a little slower; ladders are climbed at a steady pace). */
TRAVEL.speedK = function () { const k = feetTile(); return k === T_MUDT ? 0.82 : k === T_LADDER ? 0.66 : 1; };
/* ---------- the ride prompt ---------- */
function rideDist(r, end) { const p = r[end]; if (!p) return 1e9; return Math.hypot(P.fpx + 8 - (p[0] * TS + 8), P.fpy + 12 - (p[1] * TS + 8)); }
TRAVEL.find = function () {
  TRAVEL.near = null;
  if (TRAVEL.ride) return null;
  let best = TRAV_REACH;
  for (const r of RIDES) {
    if (r.flag && flags()[r.flag]) continue;
    const da = rideDist(r, 'a'); if (da < best) { best = da; TRAVEL.near = r; TRAVEL.from = 'a'; }
    if (r.two) { const db = rideDist(r, 'b'); if (db < best) { best = db; TRAVEL.near = r; TRAVEL.from = 'b'; } }
  }
  return TRAVEL.near;
};
TRAVEL.label = () => (TRAVEL.near ? t('trav.' + TRAVEL.near.kind) : '');
/* ---------- using a ride or a shortcut ---------- */
TRAVEL.act = function () {
  const r = TRAVEL.near; if (!r || TRAVEL.ride) return false;
  if (r.kind === 'kick' || r.kind === 'push') {
    flags()[r.flag] = 1; SAVE.write(); applyShortcuts();
    AUDIO.sfx(r.kind === 'kick' ? 'kick' : 'bonk'); AUDIO.sfx('whoosh', 0.08); AUDIO.sfx('pickup', 0.35);
    const bx = r.kind === 'kick' ? (R_.kickLadder.x + 1) * TS : (R_.gorgeX + 1.5) * TS, by = r.kind === 'kick' ? (R_.kickLadder.y0 + 2) * TS : R_.logY * TS + 16;
    TRAVEL.puff = { x: bx, y: by, t: 0 };
    UI.banner(t('trav.shortcut'), PAL.r4, 2.2); JUICE.shake(2, 0.25);
    TRAVEL.near = null;
    return true;
  }
  const from = TRAVEL.from === 'b' ? r.b : r.a, to = TRAVEL.from === 'b' ? r.a : r.b;
  const dur = r.kind === 'swing' ? 1.25 : r.kind === 'zip' ? 2.3 : 2.6;
  TRAVEL.ride = { kind: r.kind, t: 0, dur, ax: from[0] * TS, ay: from[1] * TS, bx: to[0] * TS, by: to[1] * TS, dir: to[0] >= from[0] ? 1 : -1 };
  P.fpx = from[0] * TS; P.fpy = from[1] * TS;
  AUDIO.sfx(r.kind === 'ferry' ? 'splash' : 'whoosh'); if (r.kind === 'swing') AUDIO.sfx('grab'); if (r.kind === 'zip') AUDIO.sfx('twang');
  TRAVEL.near = null;
  return true;
};
const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
/** The ride's position at k (0..1): ground position (P), plus how high above the ground Cappy is (for the drawing). */
const RIDEPOS = { x: 0, y: 0, lift: 0 };
function ridePos(rd, k) {
  if (rd.kind === 'swing') {
    const e = ease(k); RIDEPOS.x = lerp(rd.ax, rd.bx, e) + Math.sin(k * Math.PI) * 14; RIDEPOS.y = lerp(rd.ay, rd.by, e); RIDEPOS.lift = Math.sin(k * Math.PI) * 12;
  } else if (rd.kind === 'zip') {
    const e = Math.pow(k, 1.35); RIDEPOS.x = lerp(rd.ax, rd.bx, e); RIDEPOS.y = lerp(rd.ay, rd.by, e); RIDEPOS.lift = 0;
  } else { const e = ease(k); RIDEPOS.x = lerp(rd.ax, rd.bx, e); RIDEPOS.y = lerp(rd.ay, rd.by, e); RIDEPOS.lift = 0; }
  return RIDEPOS;
}
TRAVEL.updateRide = function (dt) {
  const rd = TRAVEL.ride; if (!rd) return false;
  rd.t += dt;
  const k = Math.min(1, rd.t / rd.dur), p = ridePos(rd, k);
  P.fpx = p.x; P.fpy = p.y; P.moving = false; P.dir = rd.kind === 'swing' ? (rd.by < rd.ay ? 'up' : 'down') : (rd.dir > 0 ? 'right' : 'left');
  if (rd.kind === 'zip' && ((rd.t * 20) | 0) % 2 === 0) UI.particle(p.x + 8 - JC.cam.x, p.y - 26 - JC.cam.y, -rd.dir * 20, 10, '#ffe9a0', 0.3, 1, 0);
  if (k >= 1) {
    TRAVEL.ride = null; P.fpx = rd.bx; P.fpy = rd.by;
    AUDIO.sfx(rd.kind === 'ferry' ? 'splash' : 'step'); if (rd.kind !== 'ferry') AUDIO.sfx('grab', 0.05);
    UI.burst(P.fpx + 8 - JC.cam.x, P.fpy + 14 - JC.cam.y, 8, '#e8cd8a');
    SAVE.soon();
  }
  return true;
};
/* ---------- each frame on the island ---------- */
TRAVEL.update = function (dt) {
  const fx = P.fpx + 8, fy = P.fpy + 12;
  // golden acorns
  for (const a of ACORNS) {
    if (flags()['ac' + a.i]) continue;
    if (Math.abs(a.x * TS + 8 - fx) < 13 && Math.abs(a.y * TS + 8 - fy) < 13) {
      flags()['ac' + a.i] = 1;
      const n = TRAVEL.acornsGot(), all = n >= ACORNS.length;
      AUDIO.sfx('pickup'); UI.burst(a.x * TS + 8 - JC.cam.x, a.y * TS + 6 - JC.cam.y, 12, '#ffd23f');
      if (all) {
        const c = SAVE.data.cos; if (!c.own.includes('hat_acorn')) { c.own.push('hat_acorn'); c.hat = 'acorn'; }
        AUDIO.sfx('fanfare', 0.2); UI.confetti(VIEW.W / 2, VIEW.H / 3, 50); UI.banner(t('acorn.all'), '#d39a22', 3);
      } else UI.banner(t('acorn.got', { n, total: ACORNS.length }), '#d39a22', 1.6);
      SAVE.write();
    }
  }
  // the places Cappy has walked to: a sport's arch (fast travel back opens), and the parts of the map he has seen
  const ty = Math.floor(fy / TS), tx = Math.floor(fx / TS);
  discover(tx, ty);
  // splashes in the mud, ripples on the pads
  const k = feetTile();
  if (P.moving && k === T_MUDT && ((OW.time * 8) | 0) !== ((OW.time - dt) * 8 | 0)) {
    UI.particle(fx - JC.cam.x, fy + 2 - JC.cam.y, (Math.random() - 0.5) * 40, -30, '#7a5030', 0.4, 1, 120);
    if (((OW.time * 2) | 0) !== (((OW.time - dt) * 2) | 0)) AUDIO.sfx('splash');
  }
  // the cave's darkness fades in and out
  const inCave = k === T_CAVE || (k === T_FALLS && P.fpx < R_.falls.x * TS);
  TRAVEL.caveK = clamp(TRAVEL.caveK + (inCave ? dt * 2.5 : -dt * 2.5), 0, 1);
  // never stuck: if Cappy ever ends up inside something solid (an old save, a changed map), he is put back
  if (!TRAVEL.ride && WORLD.isSolid(tx, ty) && tileAt(tx, ty) !== T_LADDER) {
    TRAVEL.stuckT += dt;
    if (TRAVEL.stuckT > 0.8) { const [nx, ny] = nearestFree(tx, ty); placePlayer(nx, ny); TRAVEL.stuckT = 0; UI.burst(VIEW.W / 2, VIEW.H / 2, 8, PAL.white); }
  } else TRAVEL.stuckT = 0;
  if (TRAVEL.puff) { TRAVEL.puff.t += dt; if (TRAVEL.puff.t > 0.8) TRAVEL.puff = null; }
  TURTLE.t += dt;
  for (const f of FISH) f.t += dt;
};
// the map's discovered parts: 8 x 8 tile cells, kept as a string of 0/1 in the save (flags.disc)
const DCW = Math.ceil(MW / 8), DCH = Math.ceil(MH / 8);
function discovered(cx, cy) { const s = flags().disc; return !!(s && s.charCodeAt(cy * DCW + cx) === 49); }
TRAVEL.discovered = discovered;
TRAVEL.DCW = DCW; TRAVEL.DCH = DCH;
function discover(tx, ty) {
  const cx = tx >> 3, cy = ty >> 3; if (TRAVEL.lastCell === cy * DCW + cx) return; TRAVEL.lastCell = cy * DCW + cx;
  let s = flags().disc; if (typeof s !== 'string' || s.length !== DCW * DCH) s = '0'.repeat(DCW * DCH);
  let changed = false; const a = s.split('');
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (x >= 0 && y >= 0 && x < DCW && y < DCH && a[y * DCW + x] !== '1') { a[y * DCW + x] = '1'; changed = true; }
  if (changed) { flags().disc = a.join(''); SAVE.soon(); }
}
TRAVEL.discoverAt = (tx, ty) => { TRAVEL.lastCell = -1; discover(tx, ty); };
/* ---------- drawing ---------- */
// a golden acorn (and the acorn-cap hat, the reward for finding them all)
sprite('acorn', ['..oo..', '.obbo.', 'oCCCCo', 'oyyyyo', 'oyYyyo', '.oyyo.', '..oo..'], { o: OUT, b: '#5e3820', C: '#a8703e', y: '#ffd23f', Y: '#fff3a8' });
sprite('hat_acorn', ['......oo......', '......bb......', '...oooooooo...', '..oCcCcCcCco..', '.oCcCcCcCcCco.', 'oCCCCCCCCCCCCo', '.oooooooooooo.'], { o: OUT, b: '#5e3820', C: '#7a4a26', c: '#a8703e' });
/** The things under Cappy's level that move: the ferry raft, the acorns, the turtle, the fish, the butterflies. */
TRAVEL.drawLow = function (g, cx, cy, vw, vh) {
  const vis = (x, y, m) => x > cx - m && x < cx + vw + m && y > cy - m && y < cy + vh + m;
  // the ferry raft: at the landing nearest Cappy, or carrying him over
  const F = WORLD.ferry, rd = TRAVEL.ride;
  let rx, ry;
  if (rd && rd.kind === 'ferry') { rx = P.fpx; ry = P.fpy; } else { const da = Math.hypot(P.fpx - F.a[0] * TS, P.fpy - F.a[1] * TS), db = Math.hypot(P.fpx - F.b[0] * TS, P.fpy - F.b[1] * TS); [rx, ry] = da <= db ? [(F.a[0] + 1) * TS, F.a[1] * TS] : [(F.b[0] - 1) * TS, F.b[1] * TS]; }
  // the ferry rope, bank to bank
  if (vis(F.a[0] * TS, F.a[1] * TS, 200)) { const y = F.a[1] * TS - 9 - cy; for (let x = F.a[0] * TS + 8; x < F.b[0] * TS + 8; x += 2) rect(g, x - cx, y + Math.round(Math.sin((x - F.a[0] * TS) / 40) * 2), 2, 1, '#e8d6a0'); }
  if (vis(rx, ry, 40)) {
    const x = Math.round(rx) - cx - 6, y = Math.round(ry) - cy + Math.round(Math.sin(OW.time * 2.2) * 1);
    rect(g, x - 1, y + 4, 30, 12, OUT); for (let i = 0; i < 5; i++) { rect(g, x + i * 6, y + 5, 5, 10, i % 2 ? '#a8703e' : '#c48a4c'); rect(g, x + i * 6, y + 5, 5, 1, '#e0b070'); }
    rect(g, x + 1, y + 8, 26, 1, '#5e3820'); rect(g, x + 1, y + 12, 26, 1, '#5e3820');
    if (rd && rd.kind === 'ferry' && ((OW.time * 10) | 0) % 3 === 0) UI.particle(x + (rd.dir > 0 ? 0 : 28), y + 14, -rd.dir * 20, -6, '#d8f6ff', 0.4, 1, 40);
  }
  // acorns (bobbing, with a sparkle)
  for (const a of ACORNS) {
    if (flags()['ac' + a.i]) continue;
    const x = a.x * TS + 5, y = a.y * TS + 2 + Math.round(Math.sin(OW.time * 3 + a.i) * (BRBX.reduced() ? 0 : 1.5));
    if (!vis(x, y, 16)) continue;
    shadow(g, x + 3 - cx, a.y * TS + 14 - cy, 3); spr(g, SPRITES.acorn, x - cx, y - cy);
    if (((OW.time * 2 + a.i) | 0) % 3 === 0) spr(g, SPRITES.sparkle, x + 5 - cx, y - 4 - cy);
  }
  // the beach turtle, slowly back and forth
  { const span = TURTLE.x1 - TURTLE.x0, ph = (TURTLE.t * 6) % (span * 2), tx = TURTLE.x0 + (ph < span ? ph : span * 2 - ph), dir = ph < span ? 1 : -1;
    if (TURTLE.y && vis(tx, TURTLE.y, 20)) { const x = Math.round(tx) - cx, y = TURTLE.y - cy + 6, st = ((TURTLE.t * 3) | 0) % 2;
      shadow(g, x + 6, y + 8, 6); oval(g, x + 6, y + 4, 6, 4, OUT); oval(g, x + 6, y + 4, 5, 3, '#4f8a3a'); rect(g, x + 3, y + 3, 6, 1, '#7ab84a'); rect(g, x + 5, y + 1, 2, 6, '#3d6e2e');
      rect(g, dir > 0 ? x + 11 : x - 2, y + 3, 3, 3, '#8ac86a'); rect(g, dir > 0 ? x + 13 : x - 2, y + 3, 1, 1, OUT);
      rect(g, x + 2, y + 7 + st, 2, 2, '#8ac86a'); rect(g, x + 8, y + 8 - st, 2, 2, '#8ac86a'); } }
  // fish that jump now and then
  for (const f of FISH) {
    const ph = f.t % 4.5; if (ph > 0.9 || !vis(f.x, f.y, 20)) continue;
    const k = ph / 0.9, x = f.x - cx + Math.round((k - 0.5) * 16), y = f.y - cy - Math.round(Math.sin(k * Math.PI) * 12);
    rect(g, x - 3, y - 1, 6, 3, OUT); rect(g, x - 2, y, 4, 1, '#ff9b2e'); rect(g, x + 3, y - 1, 2, 3, '#ff9b2e');
    if (k < 0.15 || k > 0.85) rect(g, f.x - cx - 4 + (k > 0.5 ? 8 : -8), f.y - cy + 2, 6, 1, '#d8f6ff');
  }
};
/** Butterflies flutter above everything on the ground (drawn after the characters). */
TRAVEL.drawHigh = function (g, cx, cy, vw, vh) {
  const red = BRBX.reduced();
  for (const b of BUTTERFLIES) {
    const tt = OW.time * 0.6 + b.i * 2.1, x = b.x + Math.sin(tt) * 30 + Math.sin(tt * 2.7) * 8, y = b.y + Math.cos(tt * 0.8) * 18 - 10;
    if (x < cx - 10 || x > cx + vw + 10 || y < cy - 10 || y > cy + vh + 10) continue;
    const flap = red ? 1 : ((OW.time * 10 + b.i) | 0) % 2, sx = Math.round(x) - cx, sy = Math.round(y) - cy;
    rect(g, sx, sy, 1, 3, OUT);
    if (flap) { rect(g, sx - 2, sy - 1, 2, 2, b.col); rect(g, sx + 1, sy - 1, 2, 2, b.col); rect(g, sx - 1, sy + 1, 1, 1, b.col); rect(g, sx + 1, sy + 1, 1, 1, b.col); }
    else { rect(g, sx - 1, sy, 1, 2, b.col); rect(g, sx + 1, sy, 1, 2, b.col); }
  }
  // the shortcut's dust
  if (TRAVEL.puff) { const p = TRAVEL.puff, k = p.t / 0.8; g.globalAlpha = 1 - k; for (let i = 0; i < 6; i++) disc(g, p.x - cx + Math.cos(i) * 14 * k * (1 + i % 2), p.y - cy + Math.sin(i * 2) * 8 * k, 4 - k * 2, '#e8d6a0'); g.globalAlpha = 1; }
};
/** The zipline's cable (always) and the swing's vine (hanging at the end nearest Cappy, or carrying him). */
TRAVEL.drawLines = function (g, cx, cy) {
  const Z = R_.zip, x0 = (Z.a[0] + 1) * TS + 8, y0 = (Z.a[1] + 1) * TS - 24 - 14 + 2, x1 = (Z.b[0] + 1) * TS + 8, y1 = (Z.b[1] + 1) * TS - 10 - 14 + 2;
  for (let i = 0; i <= 64; i++) { const k = i / 64, x = lerp(x0, x1, k), y = lerp(y0, y1, k) + Math.sin(k * Math.PI) * 6; rect(g, Math.round(x) - cx, Math.round(y) - cy, 2, 1, '#3b3b3b'); }
  const rd = TRAVEL.ride;
  const ax = R_.swing.anchor[0] * TS + 8, ay = R_.swing.anchor[1] * TS - 34;
  let hx, hy;
  if (rd && rd.kind === 'swing') { hx = P.fpx + 8; hy = P.fpy + 2 - ridePos(rd, Math.min(1, rd.t / rd.dur)).lift; }
  else { const a = R_.swing.a, b = R_.swing.b, da = Math.hypot(P.fpx - a[0] * TS, P.fpy - a[1] * TS), db = Math.hypot(P.fpx - b[0] * TS, P.fpy - b[1] * TS), e = da <= db ? a : b; hx = e[0] * TS + 10 + Math.round(Math.sin(OW.time * 1.5) * 2); hy = e[1] * TS + (e === a ? -6 : 10); }
  for (let i = 0; i <= 24; i++) { const k = i / 24, x = lerp(ax, hx, k) + Math.sin(k * Math.PI) * 3, y = lerp(ay, hy, k); rect(g, Math.round(x) - cx, Math.round(y) - cy, 2, 1, i % 6 ? '#2a7a30' : '#8ee070'); }
  disc(g, hx - cx, hy - cy, 2, '#3d9a2e');
};
/** Cappy on a ride (instead of walking): swinging high, hanging under the zipline, sitting on the raft. */
TRAVEL.drawRider = function (g, cx, cy) {
  const rd = TRAVEL.ride, p = ridePos(rd, Math.min(1, rd.t / rd.dur)), x = Math.round(P.fpx) - cx, y = Math.round(P.fpy) - cy;
  if (rd.kind === 'swing') {
    shadow(g, x + 8, y + 15 + Math.round(p.lift * 0.4), Math.max(2, 6 - p.lift / 4));
    spr(g, SPRITES[rd.by < rd.ay ? 'cappy_up' : 'cappy_down'], x, y - Math.round(p.lift), false);
    return;
  }
  if (rd.kind === 'zip') {
    const Z = R_.zip, k = Math.pow(Math.min(1, rd.t / rd.dur), 1.35);
    const lx = lerp((Z.a[0] + 1) * TS + 8, (Z.b[0] + 1) * TS + 8, k), ly = lerp((Z.a[1] + 1) * TS - 36, (Z.b[1] + 1) * TS - 22, k) + Math.sin(k * Math.PI) * 6;
    shadow(g, x + 8, y + 15, 5);
    rect(g, Math.round(lx) - cx - 3, Math.round(ly) - cy - 1, 6, 3, '#5e3820'); rect(g, Math.round(lx) - cx, Math.round(ly) - cy + 2, 1, 6, '#e8d6a0');
    spr(g, SPRITES.cappy_down, Math.round(lx) - cx - 8, Math.round(ly) - cy + 6, rd.dir < 0);
    return;
  }
  // the ferry: Cappy rides on the raft (drawn under him already)
  drawCappy(g, x, y - 2, rd.dir > 0 ? 'right' : 'left', false, 0);
};
/** The waterfall's curtain over the cave's way out (Cappy walks through it). */
TRAVEL.drawFalls = function (g, cx, cy, vw, vh) {
  const F = R_.falls, x = F.x * TS - 2, top = (F.y0 - 3) * TS, bot = (F.y1 + 1) * TS + 4;
  if (x - cx > vw + 20 || x - cx < -40 || top - cy > vh || bot - cy < 0) return;
  const sp = BRBX.reduced() ? 20 : 60;
  g.globalAlpha = 0.72;
  for (let i = 0; i < 10; i++) {
    const col = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#bfeaff' : '#7fd0f8';
    for (let y = top; y < bot; y += 6) { const yy = y + ((OW.time * sp + i * 7) % 6); rect(g, x + i * 2 - cx, Math.round(yy) - cy, 2, 4, col); }
  }
  g.globalAlpha = 1;
  if (((OW.time * 8) | 0) % 2 === 0) for (let i = 0; i < 3; i++) rect(g, x + 2 + i * 7 - cx, bot - 2 - cy - ((i + (OW.time * 4 | 0)) % 3), 2, 2, '#ffffff');
};
/** The cave: dark around Cappy, the mushrooms glowing through, fireflies. */
const DARK = { c: null, w: 0, h: 0 };
TRAVEL.drawDark = function (g, cx, cy, vw, vh) {
  if (TRAVEL.caveK <= 0.01) return;
  if (!DARK.c || DARK.w !== vw || DARK.h !== vh) {
    DARK.w = vw; DARK.h = vh; DARK.c = canvas(vw * 2, vh * 2);
    const d = DARK.c.getContext('2d'), gr = d.createRadialGradient(vw, vh, 30, vw, vh, 110);
    gr.addColorStop(0, 'rgba(10,6,20,0)'); gr.addColorStop(1, 'rgba(10,6,20,0.86)');
    d.fillStyle = gr; d.fillRect(0, 0, vw * 2, vh * 2);
  }
  g.globalAlpha = TRAVEL.caveK;
  g.drawImage(DARK.c, Math.round(P.fpx + 8 - cx) - vw, Math.round(P.fpy + 8 - cy) - vh);
  // glowing mushrooms and fireflies
  const pulse = BRBX.reduced() ? 0.3 : 0.25 + 0.12 * Math.sin(OW.time * 2);
  for (const [x, y] of SHROOMS) {
    const sx = x * TS + 8 - cx, sy = y * TS + 9 - cy; if (sx < -20 || sx > vw + 20 || sy < -20 || sy > vh + 20) continue;
    g.globalAlpha = TRAVEL.caveK * pulse; disc(g, sx, sy, 10, '#9affe0'); g.globalAlpha = TRAVEL.caveK * 0.9; disc(g, sx - 5, sy + 1, 2, '#c8fff0'); disc(g, sx + 1, sy + 3, 1, '#e0d0ff');
  }
  g.globalAlpha = TRAVEL.caveK;
  for (let i = 0; i < 8; i++) { const tt = OW.time * 0.7 + i * 1.3, x = (65 + (i % 4) * 1.6) * TS + Math.sin(tt) * 24 - cx, y = (70 + (i >> 1) * 2.2) * TS + Math.cos(tt * 1.3) * 16 - cy; if (((OW.time * 3 + i) | 0) % 4) rect(g, Math.round(x), Math.round(y), 1, 1, '#fff3a8'); }
  g.globalAlpha = 1;
};
