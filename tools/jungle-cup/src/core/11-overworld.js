// ======================================================================================================
// OVERWORLD: Cappy walks Delta Isle freely (analog: a light push walks slowly, a full push trots; he slides along
// walls and round corners), talks to people, picks things up, and plays a sport from its arch. Arches, people, signs and
// the lift answer from a generous distance, so one approach is always enough. Touch: the floating joystick (left)
// and A (bottom right); keys: arrows / WASD and Space; gamepad: left stick and A. The map button opens the map.
// ======================================================================================================
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const P = { x: 50, y: 92, px: 0, py: 0, fpx: 0, fpy: 0, fx: 0, fy: 0, dir: 'up', moving: false, t: 0, step: 0.15, walk: 0, bump: 0, hop: 0, dist: 0, slide: 0 };
JC.player = P;
const CAM = { x: 0, y: 0 };
const OW = { name: 'world', time: 0, water: 0, prompt: null, promptT: 0, celebrate: null, steps: 0, aPtr: -1, wantArch: '', glide: 0 };
// what Cappy can talk to or use right now (found each step, no allocation)
const TARGET = { kind: '', ref: null, tx: 0, ty: 0, d: 0, score: 0 };
JC.overworld = OW;
JC.refreshCappy = function () { const c = SAVE.data.cos; buildCappy('cappy', BANDANAS[c.bandana] || BANDANAS.green); };
function placePlayer(x, y, d) { P.x = x; P.y = y; P.fpx = x * TS; P.fpy = y * TS; P.px = P.fpx; P.py = P.fpy; P.dir = d || P.dir; P.moving = false; P.t = 0; P.glideT = 0; OW.prompt = ''; }
JC.placePlayer = placePlayer;
OW.enter = function (opts) {
  JC.audioWant = 'island';
  if (!TRAVEL.built) { buildTravel(); TRAVEL.built = true; }
  applyShortcuts();
  TRAVEL.ride = null;
  if (opts && opts.at) placePlayer(opts.at[0], opts.at[1], opts.at[2]);
  if (opts && opts.away && ARCHES[opts.away]) stepAway(ARCHES[opts.away]);
  OW.celebrate = opts && opts.celebrate ? { id: opts.celebrate, t: 0 } : null;
  if (OW.celebrate) { AUDIO.sfx('fanfare'); UI.confetti(VIEW.W / 2, VIEW.H / 3, 60); UI.banner(t('feather.won'), SPORT_COLOURS[OW.celebrate.id], 2.4); }
  OW.camSnap = true;
  TRAVEL.discoverAt(P.x, P.y);
  // the raft-arrival panels open a new game (skippable), then the cousins say hello; Continue shows them once if missed
  if (opts && opts.intro) { JC.introSeen = true; SAVE.data.flags.storySeen = 1; JC.say(JC.storyLines('intro').concat([{ who: 'coco', key: 'd.coco.hi' }, { who: 'pip', key: 'd.pip.hi0' }])); }
  // Continue: the panels only for a player who has not seen them yet (once is enough)
  else if (opts && opts.story && !JC.introSeen && !SAVE.data.flags.storySeen) { JC.introSeen = true; SAVE.data.flags.storySeen = 1; JC.say(JC.storyLines('intro')); }
  else if (opts && opts.say) JC.say(opts.say);
  // news for later (Zuzu with the lift news) waits on the island's own clock, so it survives a trip to the map or a sport
  if (opts && opts.later) { OW.later = opts.later; OW.laterT = OW.time + (opts.laterT || 0); }
  else if (opts && (opts.intro || opts.reset)) OW.later = null;
};
function npcAt(x, y) { for (const n of WORLD.npcs) if (n.x === x && n.y === y) return n; return null; }
function itemAt(x, y) { for (const it of WORLD.items) if (it.x === x && it.y === y && JC.questVisible(it)) return it; return null; }
function signAt(x, y) { for (const s of WORLD.signs) if (s.x === x && s.y === y) return s; return null; }
/* ---------- free movement with collision (Cappy's feet are a small box inside his 16 x 16 tile) ---------- */
const FOOT_L = 3, FOOT_R = 12, FOOT_T = 9, FOOT_B = 15, WALK_SPEED = 96;
function feetHit(px, py) {
  const x0 = Math.floor((px + FOOT_L) / TS), x1 = Math.floor((px + FOOT_R) / TS), y0 = Math.floor((py + FOOT_T) / TS), y1 = Math.floor((py + FOOT_B) / TS);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (WORLD.isSolid(x, y)) return true;
  return false;
}
/** Feet centre in world pixels. */
const feetX = () => P.fpx + 8, feetY = () => P.fpy + 12;
/** Move along one axis; when blocked, slip round a corner by up to 7 px (so a near miss of a gap or a bridge still goes in). */
function moveAxis(dx, dy) {
  if (!dx && !dy) return false;
  const stuck = feetHit(P.fpx, P.fpy); // started inside something (an old save): let him walk out
  if (stuck || !feetHit(P.fpx + dx, P.fpy + dy)) { P.fpx += dx; P.fpy += dy; return true; }
  for (let k = 1; k <= 7; k++) for (let sgn = -1; sgn <= 1; sgn += 2) {
    const ox = dy ? sgn * k : 0, oy = dx ? sgn * k : 0;
    if (!feetHit(P.fpx + ox, P.fpy + oy) && !feetHit(P.fpx + ox + dx, P.fpy + oy + dy)) {
      const st = Math.min(Math.abs(dx || dy), 1) * sgn; P.fpx += dy ? st : 0; P.fpy += dx ? st : 0; P.slide = 0.1; return true;
    }
  }
  return false;
}
/** One frame of walking with the analog axis (0..1 push): returns how far he went. */
function walkStep(ax, ay, mag, dt) {
  if (!mag) return 0;
  // on a ladder only up and down count (Cappy keeps to the ladder's middle)
  P.climb = TRAVEL.onLadder();
  if (P.climb) { TRAVEL.ladderAxis(dt); ax = 0; if (Math.abs(ay) < 0.2) return 0; }
  const speed = WALK_SPEED * (0.32 + 0.68 * mag) * TRAVEL.speedK(), len = Math.hypot(ax, ay) || 1;
  const vx = ax / len * speed * dt, vy = ay / len * speed * dt;
  const x0 = P.fpx, y0 = P.fpy;
  // small sub-steps so nothing is skipped, x and y apart so he slides along walls
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) / 1.5));
  for (let i = 0; i < n; i++) { moveAxis(vx / n, 0); moveAxis(0, vy / n); }
  // facing: the way the stick points most (on a ladder Cappy always faces it)
  P.dir = P.climb ? 'up' : Math.abs(ax) > Math.abs(ay) * 1.15 ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
  return Math.hypot(P.fpx - x0, P.fpy - y0);
}
function updateTile() {
  const tx = Math.floor(feetX() / TS), ty = Math.floor(feetY() / TS);
  if (tx !== P.x || ty !== P.y) {
    P.x = tx; P.y = ty; OW.steps++;
    SAVE.data.pos.x = tx; SAVE.data.pos.y = ty; SAVE.data.pos.d = P.dir; SAVE.soon();
  }
}
function npcAt(x, y) { for (const n of WORLD.npcs) if (n.x === x && n.y === y) return n; return null; }
function itemAt(x, y) { for (const it of WORLD.items) if (it.x === x && it.y === y && JC.questVisible(it)) return it; return null; }
function signAt(x, y) { for (const s of WORLD.signs) if (s.x === x && s.y === y) return s; return null; }
/** Back from a sport: Cappy stands a step outside the arch's zone (facing away), so its "Tap to play" button doesn't
 *  pop straight up again and invite a second go by accident; one step back towards it brings it back. */
function stepAway(a) {
  const ax = a.x * TS + 8, ay = a.y * TS + 8;
  const dirs = [[0, 1, 'down'], [-1, 0, 'left'], [1, 0, 'right'], [0.7, 0.7, 'down'], [-0.7, 0.7, 'down'], [0, -1, 'up'], [0.7, -0.7, 'up'], [-0.7, -0.7, 'up']];
  for (let d = ARCH_IN + 4; d <= ARCH_IN + 24; d += 4) for (const [dx, dy, face] of dirs) {
    const px = Math.round(ax + dx * d - 8), py = Math.round(ay + dy * d - 12);
    if (feetHit(px, py)) continue;
    P.fpx = px; P.fpy = py; P.px = px; P.py = py; P.dir = face; P.x = Math.floor((px + 8) / TS); P.y = Math.floor((py + 12) / TS); OW.prompt = '';
    return true;
  }
  return false;
}
/* ---------- arches: a generous zone round each one (any side, any speed), kept a little longer once shown ---------- */
const ARCH_IN = 24, ARCH_OUT = 32;
function archDist(a) { return Math.hypot(feetX() - (a.x * TS + 8), feetY() - (a.y * TS + 8)); }
function archNear() {
  if (OW.prompt && ARCHES[OW.prompt] && archDist(ARCHES[OW.prompt]) <= ARCH_OUT) return OW.prompt;
  let best = '', bd = ARCH_IN;
  for (const id in ARCHES) { const d = archDist(ARCHES[id]); if (d <= bd) { bd = d; best = id; } }
  return best;
}
function archHere() { return archNear(); }
/* ---------- who or what Cappy can talk to / use: the nearest within reach, in front of him or right beside him ---------- */
const REACH = 27, BESIDE = 18;
function consider(kind, ref, tx, ty) {
  const cx = tx * TS + 8, cy = ty * TS + 8, vx = cx - feetX(), vy = cy - feetY(), d = Math.hypot(vx, vy);
  if (d > REACH) return;
  const [fx, fy] = DIRS[P.dir], front = (vx * fx + vy * fy) / (d || 1) >= 0.35;
  if (d > BESIDE && !front) return; // further away: only in front
  // what Cappy faces wins over what is beside or behind him (a sign at his back never beats the friend he looks at)
  const score = d + (front ? 0 : 12);
  if (score >= TARGET.score) return;
  TARGET.kind = kind; TARGET.ref = ref; TARGET.tx = tx; TARGET.ty = ty; TARGET.d = d; TARGET.score = score;
}
function findTarget() {
  TARGET.kind = ''; TARGET.ref = null; TARGET.d = 1e9; TARGET.score = 1e9;
  for (const n of WORLD.npcs) consider('npc', n, n.x, n.y);
  for (const s of WORLD.signs) consider('sign', s, s.x, s.y);
  consider('lift', null, WORLD.lift.x, WORLD.lift.y);
  for (const it of WORLD.items) if (JC.questVisible(it)) consider('item', it, it.x, it.y);
  return TARGET.kind ? TARGET : null;
}
/** Kept for the tests (and keys tapped one at a time): one whole tile in a direction, if it is free. */
function tryStep(dir) {
  P.dir = dir;
  const nx = P.x + DIRS[dir][0], ny = P.y + DIRS[dir][1];
  const it = itemAt(nx, ny); if (it) { pickItem(it); }
  if (WORLD.isSolid(nx, ny)) { if (P.bump <= 0) { AUDIO.sfx('bonk'); P.bump = 0.35; } return false; }
  P.fpx = nx * TS; P.fpy = ny * TS; P.walk++; P.dist += TS;
  updateTile();
  if ((P.walk & 1) === 0) AUDIO.sfx('step');
  return true;
}
JC.tryStep = tryStep;
/** Act: play the sport whose arch is near, or talk / read / ride the lift / pick up what is in reach. */
function act() {
  if (TB.open) { TB.advance(); return; }
  if (TRAVEL.ride) return;
  const arch = archNear(), tg = findTarget();
  // someone right in front and closer than the arch's middle gets the talk; otherwise the arch always wins
  if (arch && !(tg && tg.kind === 'npc' && tg.d < 20 && tg.d < archDist(ARCHES[arch]))) { JC.playSport(arch); return; }
  // a ride or a shortcut right here (the swing, the zipline, the ferry, the ladder to kick, the log to push)
  if (TRAVEL.near && !(tg && tg.kind === 'npc' && tg.d < 20)) { TRAVEL.act(); return; }
  // the open vine lift: a whole zone round it, like an arch
  if (OW.liftNear && !(tg && tg.kind === 'npc' && tg.d < 20)) { rideLift(); return; }
  if (!tg) return;
  if (tg.kind === 'npc') {
    const n = tg.ref, vx = n.x * TS + 8 - feetX(), vy = n.y * TS + 8 - feetY();
    // face each other
    P.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
    n.face = P.dir === 'up' ? 'down' : P.dir === 'down' ? 'up' : P.dir === 'left' ? 'right' : 'left';
    const lines = talkLines(n);
    if (lines.length) JC.say(lines, () => { SAVE.write(); if (n.id === 'coco') SAVE.data.flags.metCoco = 1; });
    return;
  }
  if (tg.kind === 'sign') { JC.say([{ who: 'sign', key: tg.ref.key }]); return; }
  if (tg.kind === 'lift') {
    const f = SAVE.featherCount();
    if (f >= NSPORTS) rideLift();
    else JC.say([{ who: 'lift', key: 'lift.locked', vars: { n: f } }]);
    return;
  }
  if (tg.kind === 'item') pickItem(tg.ref);
}
JC.act = act;
function rideLift() { JC.say([{ who: 'lift', key: 'lift.open' }], () => JC.go('finale')); }
/* ---------- touch controls (virtual pixels): the floating joystick and A ---------- */
const PAD = { ax: 0, ay: 0, ar: 0 };
function layoutPad() {
  PAD.ar = Math.max(17, Math.round(VIEW.tap * 0.75));
  PAD.ax = VIEW.W - PAD.ar - 14; PAD.ay = VIEW.H - PAD.ar - 16;
}
OW.onInput = function (e) {
  if (STORY.input(e)) return;
  if (TB.input(e)) { if (e.type === 'down') UI.menuInput(e); return; }
  if (e.type === 'press' && e.key === 'a') { act(); return; }
  if (e.type === 'press' && (e.key === 'b' || e.key === 'pause')) { JC.go('map'); return; }
  const touch = INPUT.showTouch();
  if (e.type === 'down') {
    const hit = UI.hitAt(e.x, e.y);
    if (hit) { UI.menuInput(e); OW.btnDown = hit; return; }
    if (touch && Math.hypot(e.x - PAD.ax, e.y - PAD.ay) < PAD.ar * 1.5) { OW.aPtr = e.id; act(); return; }
    if (touch && STICK.down(e)) return;
  } else if (e.type === 'move') {
    STICK.move(e);
  } else if (e.type === 'up') {
    STICK.up(e);
    if (e.id === OW.aPtr) OW.aPtr = -1;
  } else if (e.type === 'tap') {
    const hit = UI.hitAt(e.x, e.y);
    if (hit === 'map') { AUDIO.sfx('select'); JC.go('map'); }
    else if (hit === 'prompt' && OW.prompt) JC.playSport(OW.prompt);
    else if (hit === 'trav' && TRAVEL.near) TRAVEL.act();
    else if (hit === 'lift' && OW.liftNear) rideLift();
  }
};
OW.leave = function () { OW.aPtr = -1; INPUT.releaseTouch(); };
OW.update = function (dt) {
  OW.time += dt; OW.water += dt;
  if (P.bump > 0) P.bump -= dt;
  TB.update(dt); STORY.update(dt);
  for (const n of WORLD.npcs) n.t += dt;
  if (P.slide > 0) P.slide -= dt;
  // walk with the analog axis (stick, keys or pad)
  const ax = INPUT.axis;
  let went = 0;
  const riding = TRAVEL.updateRide(dt);
  if (!riding && !TB.open && !JC.fading() && !STORY.showing()) went = walkStep(ax.x, ax.y, ax.mag, dt);
  if (went > 0.01) {
    const before = (P.dist / TS) | 0; P.dist += went;
    if (((P.dist / TS) | 0) !== before) { P.walk++; if ((P.walk & 1) === 0) AUDIO.sfx('step'); }
    P.moving = true; P.glideT = 0.12;
  } else {
    if (ax.mag > 0.5 && !riding && !P.climb && !TB.open && P.bump <= 0 && !JC.fading()) { AUDIO.sfx('bonk'); P.bump = 0.6; }
    if (P.glideT > 0) P.glideT -= dt; else P.moving = false;
  }
  P.t = (P.dist % TS) / TS;
  updateTile();
  // a quest item underfoot is picked up
  if (went > 0.01) { const it = itemAt(P.x, P.y); if (it) pickItem(it); }
  P.px = Math.round(P.fpx); P.py = Math.round(P.fpy);
  P.hop = P.moving && !P.climb ? Math.round(Math.abs(Math.sin(P.t * Math.PI)) * 2) : 0;
  TRAVEL.update(dt);
  findTarget();
  TRAVEL.find();
  // the camera follows (integer pixels)
  const tx = clamp(P.px + 8 - VIEW.W / 2, 0, MW * TS - VIEW.W), ty = clamp(P.py + 8 - VIEW.H / 2 - 10, 0, MH * TS - VIEW.H);
  if (OW.camSnap) { CAM.x = tx; CAM.y = ty; OW.camSnap = false; }
  CAM.x += (tx - CAM.x) * Math.min(1, dt * 10); CAM.y += (ty - CAM.y) * Math.min(1, dt * 10);
  if (Math.abs(tx - CAM.x) < 0.5) CAM.x = tx; if (Math.abs(ty - CAM.y) < 0.5) CAM.y = ty;
  // the arch prompt (and the arch counts as visited: the map can bring Cappy back here)
  OW.prompt = TB.open || riding ? '' : archNear();
  if (OW.prompt && !SAVE.data.flags['v_' + OW.prompt]) { SAVE.data.flags['v_' + OW.prompt] = 1; SAVE.soon(); }
  // with every Feather the lift answers from a generous zone round its plank, from any side
  OW.liftNear = !OW.prompt && !TB.open && !riding && SAVE.featherCount() >= NSPORTS && Math.hypot(feetX() - (WORLD.lift.x * TS + 8), feetY() - (WORLD.lift.y * TS + 10)) <= 30;
  // the rope bridge sways a little under Cappy (the camera too, unless motion is reduced)
  OW.sway = TRAVEL.feetTile() === WORLD.T.ROPE ? Math.sin(OW.time * 4.5) : 0;
  WORLD.warm(CAM.x, CAM.y, VIEW.W, VIEW.H);
  if (OW.celebrate) { OW.celebrate.t += dt; if (OW.celebrate.t > 4) OW.celebrate = null; }
  if (OW.later && OW.time >= OW.laterT && !TB.open) { const l = OW.later; OW.later = null; JC.say(l); }
};
/* ---------- drawing ---------- */
const DRAWLIST = []; for (let i = 0; i < 64; i++) DRAWLIST.push({ y: 0, kind: 0, ref: null, x: 0 });
let DRAWN = 0;
function queue(kind, ref, x, y) { if (DRAWN >= DRAWLIST.length) return; const d = DRAWLIST[DRAWN++]; d.kind = kind; d.ref = ref; d.x = x; d.y = y; }
function sortQueue() { // insertion sort (tiny list, no allocation)
  for (let i = 1; i < DRAWN; i++) { const a = DRAWLIST[i]; let j = i - 1; while (j >= 0 && DRAWLIST[j].y > a.y) { DRAWLIST[j + 1] = DRAWLIST[j]; j--; } DRAWLIST[j + 1] = a; }
}
function drawCappy(g, x, y, dir, walk, hop) {
  const flip = dir === 'left', d = dir === 'left' ? 'right' : dir;
  const s = SPRITES[`cappy_${d}${walk ? '_w' : ''}`];
  shadow(g, x + 8, y + 15, 6);
  spr(g, s, x, y - hop, flip);
  const c = SAVE.data.cos;
  if (c.hat) { const h = SPRITES['hat_' + c.hat]; if (h) spr(g, h, x + 1 + (d === 'right' ? (flip ? -2 : 2) : 0), y - 2 - hop, flip); }
}
JC.drawCappy = drawCappy;
/** A small speech bubble with "!" over someone who has news (drawn as pixels, no text). */
function newsBubble(g, x, y, t) {
  const by = y - 13 + (((t * 3) | 0) % 2);
  rect(g, x + 4, by, 9, 9, PAL.ink); rect(g, x + 5, by + 1, 7, 7, PAL.white); rect(g, x + 7, by + 9, 3, 2, PAL.ink); rect(g, x + 8, by + 8, 1, 2, PAL.white);
  rect(g, x + 8, by + 2, 1, 3, PAL.r1); rect(g, x + 8, by + 6, 1, 1, PAL.r1);
}
function drawNpc(g, n, x, y) {
  if (!TB.open && ((n.newsT = (n.newsT || 0) + 1) % 30 === 1 ? (n.news = hasNews(n)) : n.news)) newsBubble(g, x, y, n.t);
  drawNpcBody(g, n, x, y);
}
function drawNpcBody(g, n, x, y) {
  const s = SPRITES[n.spr]; if (!s) return;
  const bob = ((n.t * 2) | 0) % 2;
  const flip = n.face === 'left';
  if (n.fly) {
    const hy = Math.round(Math.sin(n.t * 3) * 3);
    shadow(g, x + 8, y + 15, 4);
    spr(g, ((n.t * 12) | 0) % 2 ? SPRITES.zuzu2 : s, x + 3, y - 2 + hy, flip);
    return;
  }
  if (n.many) {
    for (let i = 0; i < n.many; i++) {
      const ox = n.spr === 'ant' ? (i - 1) * 6 : i * 9 - 4, oy = n.spr === 'ant' ? (i % 2) * 4 + 4 : 2;
      const ss = n.spr === 'ant' && ((n.t * 4 + i) | 0) % 2 ? SPRITES.ant2 : s;
      shadow(g, x + ox + (ss.w >> 1) + 3, y + 15, 3); spr(g, ss, x + ox + 3, y + oy + 16 - ss.h - (bob && i === 1 ? 1 : 0), i === 1);
    }
    return;
  }
  shadow(g, x + 8, y + 15, 6);
  spr(g, s, x + ((16 - s.w) >> 1), y + 16 - s.h - (n.bob || n.sport ? bob : 0), flip);
  if (n.sport && SAVE.data.feathers[n.sport]) { const f = featherSprite(SPORT_COLOURS[n.sport]); spr(g, f, x + 12, y - 4); }
}
function drawRaft(g, x, y) {
  const bob = Math.round(Math.sin(OW.time * 2) * 1);
  y += bob;
  rect(g, x - 2, y + 5, 36, 10, OUT);
  for (let i = 0; i < 6; i++) { rect(g, x - 1 + i * 6, y + 6, 5, 8, i % 2 ? '#a8703e' : '#c48a4c'); rect(g, x - 1 + i * 6, y + 6, 5, 1, '#e0b070'); }
  rect(g, x + 2, y + 8, 28, 1, '#5e3820'); rect(g, x + 2, y + 12, 28, 1, '#5e3820');
  rect(g, x + 14, y - 16, 2, 22, '#5e3820');
  const fl = SAVE.data.cos.flag;
  const fc = fl === 'leaf' ? '#45c34e' : '#fff8e8';
  rect(g, x + 16, y - 16, 10, 7, OUT); rect(g, x + 16, y - 15, 9, 5, fc);
  if (fl === 'leaf') { rect(g, x + 19, y - 14, 3, 3, '#ffd23f'); } else rect(g, x + 18, y - 13, 5, 1, '#e04848');
}
function drawLift(g, x, y) {
  const open = SAVE.featherCount() >= NSPORTS;
  // the vines up the trunk
  for (const dx of [2, 13]) for (let i = 0; i < 40; i++) rect(g, x + dx + Math.round(Math.sin((i + OW.time * (open ? 6 : 0)) / 4)), y - 40 + i, 1, 1, i % 5 ? '#2a7a30' : '#8ee070');
  rect(g, x - 1, y + 4, 18, 9, OUT); rect(g, x, y + 5, 16, 6, '#b07a44'); rect(g, x, y + 5, 16, 1, '#e0b070'); rect(g, x, y + 10, 16, 1, '#5e3820');
  if (!open) {
    // a knot of vines with an empty feather badge
    rect(g, x + 1, y + 2, 14, 2, '#2a7a30'); rect(g, x + 6, y, 4, 6, '#3d9a2e');
    text(g, label('lift.n', SAVE.featherCount()), x + 8, y - 12, { align: 'center', col: PAL.white, edge: PAL.ink });
  } else {
    text(g, label('lift.n', SAVE.featherCount()), x + 8, y - 12, { align: 'center', col: '#ffd23f', edge: PAL.ink });
    if (((OW.time * 3) | 0) % 2) spr(g, SPRITES.sparkle, x + 5, y - 6);
  }
}
function drawTotemSockets(g, ox, oy) {
  const sk = totemSockets();
  for (let i = 0; i < NSPORTS; i++) {
    const id = JC.sportOrder[i], s = sk[i], x = s.x - ox, y = s.y - oy;
    const lit = SAVE.data.feathers[id], fresh = OW.celebrate && OW.celebrate.id === id;
    disc(g, x, y, 3, OUT);
    if (lit) {
      if (fresh) { const r = 4 + Math.round(Math.sin(OW.celebrate.t * 8) * 1.5); g.globalAlpha = 0.5; disc(g, x, y - 4, r + 3, SPORT_COLOURS[id]); g.globalAlpha = 1; }
      disc(g, x, y, 2, SPORT_COLOURS[id]); spr(g, featherSprite(SPORT_COLOURS[id]), x - 3, y - 10);
    } else disc(g, x, y, 2, '#3b2416');
  }
}
/** The island's chunks under the view: the ground (frame 0 or 1 for the water) or the over layer. */
function drawChunks(g, cx, cy, frame, over) {
  const CH = WORLD.CH, x0 = Math.max(0, Math.floor(cx / CH)), y0 = Math.max(0, Math.floor(cy / CH));
  const x1 = Math.min(Math.ceil(MW * TS / CH) - 1, Math.floor((cx + VIEW.W - 1) / CH)), y1 = Math.min(Math.ceil(MH * TS / CH) - 1, Math.floor((cy + VIEW.H - 1) / CH));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const c = WORLD.chunk(x, y); g.drawImage(over ? c.ov : frame ? c.g1 : c.g0, x * CH - cx, y * CH - cy); }
}
OW.draw = function (g) {
  if (STORY.showing()) { STORY.draw(g); TB.draw(g); return; }
  const cx = Math.round(CAM.x), cy = Math.round(CAM.y) + (OW.sway && !BRBX.reduced() ? Math.round(OW.sway) : 0);
  const frame = ((OW.water * 2) | 0) % 2;
  g.fillStyle = '#1f62a0'; g.fillRect(0, 0, VIEW.W, VIEW.H);
  drawChunks(g, cx, cy, frame, false);
  TRAVEL.drawLow(g, cx, cy, VIEW.W, VIEW.H);
  // live things: raft, lift, quest items, NPCs, Cappy (sorted by y)
  DRAWN = 0;
  const vx0 = cx - 32, vy0 = cy - 32, vx1 = cx + VIEW.W + 32, vy1 = cy + VIEW.H + 48;
  for (const n of WORLD.npcs) { const x = n.x * TS, y = n.y * TS; if (x > vx0 && x < vx1 && y > vy0 && y < vy1) queue(1, n, x, y); }
  for (const it of WORLD.items) { if (!JC.questVisible(it)) continue; const x = it.x * TS, y = it.y * TS; if (x > vx0 && x < vx1 && y > vy0 && y < vy1) queue(2, it, x, y); }
  queue(0, null, P.px, P.py);
  sortQueue();
  drawRaft(g, WORLD.dockRaft.x * TS + 6 - cx, WORLD.dockRaft.y * TS + 2 - cy);
  drawLift(g, WORLD.lift.x * TS - cx, WORLD.lift.y * TS - cy);
  for (let i = 0; i < DRAWN; i++) {
    const d = DRAWLIST[i], x = d.x - cx, y = d.y - cy;
    if (d.kind === 0) {
      if (TRAVEL.ride) { if (TRAVEL.ride.kind !== 'zip') TRAVEL.drawRider(g, cx, cy); }
      else {
        const ft = TRAVEL.feetTile(), pad = ft === WORLD.T.PAD, sx = OW.sway ? Math.round(OW.sway * 1.5) : 0;
        if (pad) { const r = 6 + (((OW.time * 3) | 0) % 3); g.globalAlpha = 0.5; oval(g, x + 8, y + 14, r, 2, '#d8f6ff'); g.globalAlpha = 1; }
        // climbing: his back to us, left and right paws in turn
        if (P.climb) spr(g, SPRITES[`cappy_up${P.moving ? '_w' : ''}`], x, y, P.moving && ((P.dist / 8) | 0) % 2 === 1);
        else drawCappy(g, x + sx, y + (pad ? Math.round(Math.sin(OW.time * 4)) : 0), P.dir, P.moving && P.t < 0.6, P.hop);
      }
    }
    else if (d.kind === 1) drawNpc(g, d.ref, x, y);
    else { const s = SPRITES[d.ref.spr], b = Math.round(Math.sin(OW.time * 4) * 1); shadow(g, x + 8, y + 14, 4); spr(g, s, x + ((16 - s.w) >> 1), y + 6 - (s.h >> 1) + b); if (((OW.time * 3) | 0) % 3 === 0) spr(g, SPRITES.sparkle, x + 10, y); }
  }
  TRAVEL.drawFalls(g, cx, cy, VIEW.W, VIEW.H);
  drawChunks(g, cx, cy, frame, true);
  TRAVEL.drawLines(g, cx, cy);
  if (TRAVEL.ride && TRAVEL.ride.kind === 'zip') TRAVEL.drawRider(g, cx, cy);
  drawTotemSockets(g, cx, cy);
  TRAVEL.drawHigh(g, cx, cy, VIEW.W, VIEW.H);
  TRAVEL.drawDark(g, cx, cy, VIEW.W, VIEW.H);
  // the "talk" hint above someone Cappy faces
  if (!TB.open && TARGET.kind && TARGET.kind !== 'item' && !OW.prompt && !OW.liftNear && !TRAVEL.near && !TRAVEL.ride) {
    const fx = TARGET.tx, fy = TARGET.ty;
    {
      const bx = fx * TS + 8 - cx, by = fy * TS - 14 - cy + (((OW.time * 2) | 0) % 2);
      box(g, bx - 6, by - 6, 13, 11, PAL.white, PAL.ink); rect(g, bx - 1, by + 4, 3, 2, PAL.white); rect(g, bx - 1, by + 6, 1, 1, PAL.ink);
      rect(g, bx - 3, by - 1, 2, 2, PAL.ink); rect(g, bx, by - 1, 2, 2, PAL.ink); rect(g, bx + 3, by - 1, 2, 2, PAL.ink);
    }
  }
  UI.drawFx(g);
  OW.drawHud(g);
  TB.draw(g);
};
OW.drawHud = function (g) {
  layoutPad();
  // the Feathers, top left
  const n = NSPORTS, sw = 11, x0 = 6, y0 = 6;
  box(g, x0 - 2, y0 - 2, n * sw + 4, 18, 'rgba(27,19,37,0.72)', PAL.ink);
  const cel = OW.celebrate, flying = cel && cel.t < 1.5;
  for (let i = 0; i < n; i++) {
    const id = JC.sportOrder[i], on = SAVE.data.feathers[id] && !(flying && cel.id === id), hx = x0 + i * sw + 2;
    if (on) {
      // the new Feather's place glows a moment after it lands
      if (cel && cel.id === id) { g.globalAlpha = 0.6 * (1 - (cel.t - 1.5) / 2.5); disc(g, hx + 3, y0 + 6, 7, SPORT_COLOURS[id]); g.globalAlpha = 1; }
      spr(g, featherSprite(SPORT_COLOURS[id]), hx, y0 + 1);
    } else spr(g, featherSprite('#4a4060'), hx, y0 + 1);
  }
  // a new Feather flies from the middle of the screen into its place in the bar (the totem in the village lights too)
  if (flying) {
    const i = JC.sportOrder.indexOf(cel.id), k = easeOut(clamp(cel.t / 1.5, 0, 1));
    const tx = x0 + i * sw + 2, fx = lerp(VIEW.W / 2, tx, k), fy = lerp(VIEW.H / 2, y0 + 1, k) - Math.sin(k * Math.PI) * 30;
    sprK(g, featherSprite(SPORT_COLOURS[cel.id]), fx - 3 * (2 - k), fy - 5 * (2 - k), k < 0.6 ? 2 : 1);
    if (((cel.t * 20) | 0) % 3 === 0) UI.particle(fx, fy, (Math.random() - 0.5) * 30, -10, SPORT_COLOURS[cel.id], 0.5, 1, 20);
  }
  // map button, top right
  UI.iconButton(g, 'map', VIEW.W - Math.max(14, VIEW.tap / 2 + 4), Math.max(14, VIEW.tap / 2 + 4), UI.icons.map, { col: '#3d8a3a' });
  // the arch prompt
  if (OW.prompt && !TB.open) {
    const sp = OW.prompt, name = t('sport.' + sp);
    const msg = INPUT.showTouch() ? t('arch.tap', { sport: name }) : t('arch.key', { sport: name });
    // a long sport name (Portuguese, Dutch) goes onto two lines in a taller button instead of being squeezed
    const long = textW(msg) + 30 > VIEW.W - 20;
    const w = Math.min(VIEW.W - 20, textW(msg) + 30), h = Math.max(long ? 28 : 22, VIEW.tap), x = Math.round((VIEW.W - w) / 2), y = Math.round(VIEW.H * 0.2);
    UI.button(g, 'prompt', x, y, w, h, msg, { col: SPORT_COLOURS[sp], tcol: PAL.white, icon: UI.icons.play, glow: BRBX.reduced() || ((OW.time * 2) | 0) % 2 === 0 });
  }
  // the open vine lift: a big button like the arches'
  if (OW.liftNear && !TB.open) {
    const msg = t('lift.ride'), w = Math.min(VIEW.W - 20, textW(msg) + 30), h = Math.max(22, VIEW.tap), x = Math.round((VIEW.W - w) / 2), y = Math.round(VIEW.H * 0.2);
    UI.button(g, 'lift', x, y, w, h, msg, { col: '#c8961e', tcol: PAL.white, icon: UI.icons.play, glow: BRBX.reduced() || ((OW.time * 2) | 0) % 2 === 0 });
  }
  // a ride or a shortcut right here: the same big button (tap it, or A / Space)
  if (!OW.prompt && !OW.liftNear && TRAVEL.near && !TB.open && !TRAVEL.ride) {
    const msg = TRAVEL.label(), w = Math.min(VIEW.W - 20, textW(msg) + 30), h = Math.max(22, VIEW.tap), x = Math.round((VIEW.W - w) / 2), y = Math.round(VIEW.H * 0.2);
    UI.button(g, 'trav', x, y, w, h, msg, { col: '#3d8a3a', tcol: PAL.white, icon: UI.icons.play, glow: BRBX.reduced() || ((OW.time * 2) | 0) % 2 === 0 });
  }
  // golden acorns found (once the first one is)
  { const got = TRAVEL.acornsGot(); if (got > 0) { const s = label('acorn.n', got, TRAVEL.acornN), w = textW(s) + 18; box(g, x0 - 2, y0 + 18, w, 15, 'rgba(27,19,37,0.72)', PAL.ink); spr(g, SPRITES.acorn, x0 + 1, y0 + 21); text(g, s, x0 + 10, y0 + 19, { col: '#ffd23f' }); } }
  // touch controls
  if (INPUT.showTouch() && !TB.open && !TRAVEL.ride) {
    STICK.draw(g, true);
    g.globalAlpha = 0.85;
    const aOn = OW.aPtr >= 0 || INPUT.held.a;
    disc(g, PAD.ax, PAD.ay + 2, PAD.ar, 'rgba(0,0,0,0.3)');
    disc(g, PAD.ax, PAD.ay + (aOn ? 1 : 0), PAD.ar, PAL.ink); disc(g, PAD.ax, PAD.ay + (aOn ? 1 : 0), PAD.ar - 2, aOn ? '#ffb030' : '#ff8b3d');
    disc(g, PAD.ax - 3, PAD.ay - 3 + (aOn ? 1 : 0), Math.max(3, PAD.ar - 9), '#ffb060');
    text(g, 'A', PAD.ax, PAD.ay - 6 + (aOn ? 1 : 0), { align: 'center', col: PAL.white, scale: 1 });
    g.globalAlpha = 1;
  }
};
JC.cam = CAM;
