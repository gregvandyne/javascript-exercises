// ======================================================================================================
// DELTA ISLE: the overworld map. Tiles (16 x 16) are painted once into small tile canvases, then the whole island is
// pre-rendered into three big offscreen canvases: ground (two frames, for the water), and the "over" layer (tree tops,
// roofs, arch beams) drawn after the characters so they can walk behind things.
// Map coordinates are tiles; JC.world.arch(id) gives each sport's arch.
// ======================================================================================================
const TS = 16, MW = 72, MH = 68;
const T_DEEP = 0, T_WATER = 1, T_SAND = 2, T_GRASS = 3, T_FLOWER = 4, T_PATH = 5, T_PLANK = 6, T_STONE = 7, T_BRIDGE = 8, T_MUD = 9,
  T_LILY = 10, T_PITCH = 11, T_COURT = 12, T_HILL = 13, T_DARK = 14, T_RAPID = 15;
const WALKABLE = [false, false, true, true, true, true, true, true, true, false, false, true, true, false, true, false];
const WORLD = { tiles: new Uint8Array(MW * MH), solid: new Uint8Array(MW * MH), objects: [], arches: {}, npcs: [], items: [], signs: [],
  ground: [null, null], over: null, ready: false, W: MW, H: MH, TS, totem: { x: 36, y: 37 }, lift: { x: 36, y: 16 }, dock: { x: 36, y: 61 } };
JC.world = WORLD;
const idx = (x, y) => y * MW + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
const tileAt = (x, y) => (inMap(x, y) ? WORLD.tiles[idx(x, y)] : T_DEEP);
const isWater = k => k === T_DEEP || k === T_WATER || k === T_LILY || k === T_RAPID;
function hash(x, y, k) { let h = (x * 374761393 + y * 668265263 + (k || 0) * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
JC.hash = hash;

/* ---------- layout ---------- */
// The sports' arches: the tile you stand on to play; the arena lies behind it.
const ARCHES = {
  paddle: { x: 26, y: 31, champ: 'jada' }, leaf: { x: 16, y: 22, champ: 'kiki' }, seed: { x: 12, y: 46, champ: 'tico' },
  kick: { x: 20, y: 50, champ: 'mico' }, frog: { x: 46, y: 51, champ: 'rana' }, rapids: { x: 61, y: 38, champ: 'otters' }, vine: { x: 46, y: 21, champ: 'sloane' },
  dash: { x: 59, y: 31, champ: 'pecca' },
};
function paint(x0, y0, x1, y1, k) { for (let y = Math.max(0, y0); y <= Math.min(MH - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(MW - 1, x1); x++) WORLD.tiles[idx(x, y)] = k; }
function paintIf(x, y, k, onlyLand) { if (!inMap(x, y)) return; const c = WORLD.tiles[idx(x, y)]; if (onlyLand && isWater(c)) return; WORLD.tiles[idx(x, y)] = k; }
function ellipse(cx, cy, rx, ry, k, onlyLand) { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1) paintIf(x, y, k, onlyLand); } }
/** A path of width w through points [[x, y], ...] (axis-aligned steps). */
function road(pts, k, w) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let j = 0; j < (w || 1); j++) paintIf(ax === bx ? x + j : x, ax === bx ? y : y + j, k, k !== T_PLANK && k !== T_STONE && k !== T_BRIDGE);
  }
}
function buildLayout() {
  const T = WORLD.tiles; T.fill(T_DEEP);
  // the island: a rounded square with a wobbly coast
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const a = Math.atan2(y - 34, x - 36), wob = 0.045 * Math.sin(a * 5 + 1) + 0.03 * Math.sin(a * 11 + 2) + 0.02 * Math.sin(a * 17);
    const dx = Math.abs(x - 36) / 31, dy = Math.abs(y - 34) / 30, d = Math.pow(dx * dx * dx + dy * dy * dy, 1 / 3) - wob;
    T[idx(x, y)] = d < 0.9 ? T_GRASS : d < 1 ? T_SAND : d < 1.07 ? T_WATER : T_DEEP;
  }
  // the river (north to south, east of the village) and its second mouth (the delta)
  for (let y = 0; y < MH; y++) { const cx = 53 + Math.round(1.6 * Math.sin(y / 6.5)); for (let x = cx - 2; x <= cx + 1; x++) if (!isWater(tileAt(x, y)) || tileAt(x, y) === T_WATER) paintIf(x, y, y < 20 ? T_RAPID : T_WATER); paintIf(cx - 3, y, T_SAND, true); paintIf(cx + 2, y, T_SAND, true); }
  for (let i = 0; i <= 22; i++) { const x = 53 + i * 0.55, y = 50 + i; for (let dx = -1; dx <= 1; dx++) paintIf(Math.round(x) + dx, y, T_WATER); paintIf(Math.round(x) - 2, y, T_SAND, true); paintIf(Math.round(x) + 2, y, T_SAND, true); }
  // the lagoon (west) and its lily pads
  ellipse(11, 39, 7.5, 5.5, T_SAND, true); ellipse(11, 39, 6.5, 4.6, T_WATER);
  for (const [x, y] of [[8, 37], [12, 36], [14, 40], [9, 41], [6, 39]]) paintIf(x, y, T_LILY);
  // the hills (north-west) with the mud slope
  for (let y = 5; y <= 19; y++) for (let x = 5; x <= 25; x++) { const e = (x - 15) * (x - 15) / 110 + (y - 12) * (y - 12) / 52; if (e < 1 && tileAt(x, y) !== T_DEEP) paintIf(x, y, T_HILL); }
  for (let i = 0; i < 12; i++) { paintIf(11 + (i >> 1), 8 + i, T_MUD); paintIf(12 + (i >> 1), 8 + i, T_MUD); paintIf(13 + (i >> 1), 8 + i, T_MUD); }
  // the village clearing and the roads (dirt), the boardwalk and the dock (planks)
  ellipse(36, 38, 6.6, 6.2, T_PATH);
  road([[36, 31], [36, 18]], T_PATH, 2);
  road([[16, 24], [46, 24]], T_PATH, 2);
  road([[16, 24], [16, 23]], T_PATH);
  road([[46, 24], [46, 22]], T_PATH);
  road([[30, 38], [24, 38], [24, 32], [26, 32]], T_PATH, 2);
  road([[24, 38], [24, 47], [12, 47]], T_PATH, 2);
  road([[20, 47], [20, 49]], T_PATH);
  road([[42, 38], [49, 38], [49, 34], [50, 34]], T_PATH, 2);
  road([[56, 34], [61, 34], [61, 37]], T_PATH, 2);
  road([[40, 43], [49, 43], [49, 44], [50, 44]], T_PATH, 2);
  road([[56, 44], [61, 44], [61, 39]], T_PATH, 2);
  road([[37, 52], [46, 52]], T_PATH, 2);
  ellipse(36.5, 66, 8, 4.2, T_SAND, true); ellipse(36.5, 66.5, 7, 3.6, T_WATER); // the little bay at the dock
  road([[36, 44], [36, 60]], T_PLANK, 2);
  road([[35, 60], [35, 67]], T_PLANK, 3);
  // stepping stones and the rope bridge over the river
  for (let x = 50; x <= 55; x++) if (isWater(tileAt(x, 34)) || tileAt(x, 34) === T_SAND) paintIf(x, 34, isWater(tileAt(x, 34)) ? T_STONE : T_PATH);
  for (let x = 50; x <= 55; x++) paintIf(x, 44, T_BRIDGE);
  // arenas
  paint(22, 26, 30, 30, T_COURT);                                       // the canopy court (paddle)
  paint(12, 52, 28, 59, T_PITCH);                                       // the clearing pitch (kick)
  ellipse(46, 56, 4.2, 3.2, T_SAND, true); ellipse(46, 56.3, 3.2, 2.3, T_WATER); paintIf(45, 56, T_LILY); paintIf(47, 57, T_LILY); // the lily pond (frog)
  for (let y = 7; y <= 18; y++) for (let x = 40; x <= 50; x++) if (tileAt(x, y) === T_GRASS) WORLD.tiles[idx(x, y)] = T_DARK; // the giant grove floor
  for (let y = 26; y <= 30; y++) for (let x = 21; x <= 31; x++) if (tileAt(x, y) === T_GRASS) WORLD.tiles[idx(x, y)] = T_DARK;
  // the muddy clearing (dash) behind its arch: trampled dirt with mud puddles, a path down to the road
  const da = ARCHES.dash;
  ellipse(da.x + 0.2, da.y - 5.5, 3.4, 4.6, T_PATH, true); road([[da.x, da.y + 3], [da.x, da.y - 1]], T_PATH);
  for (const [dx, dy] of [[-2, -8], [2, -4], [1, -9]]) paintIf(da.x + dx, da.y + dy, T_MUD, true);
  // flower meadows
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (tileAt(x, y) === T_GRASS && hash(x, y, 3) < 0.07 + 0.08 * (Math.sin(x / 4) * Math.cos(y / 5) > 0.5 ? 1 : 0)) WORLD.tiles[idx(x, y)] = T_FLOWER;
}

/* ---------- objects ---------- */
// { k: kind, x, y (tile of the base), w (solid width in tiles, left from x), id?, col?, flip? }
function addObj(o) { WORLD.objects.push(o); return o; }
const KEEP = new Uint8Array(MW * MH); // tiles kept clear of trees
function keep(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inMap(x, y)) KEEP[idx(x, y)] = 1; }
function buildObjects() {
  WORLD.objects.length = 0; WORLD.npcs.length = 0; WORLD.items.length = 0; WORLD.signs.length = 0; KEEP.fill(0);
  // the Great Kapok and its vine lift
  addObj({ k: 'kapok', x: 36, y: 15 }); keep(28, 3, 44, 18);
  addObj({ k: 'lift', x: 36, y: 16 });
  // the village: the Cup Totem, huts on stilts, lanterns
  addObj({ k: 'totem', x: 36, y: 37 }); keep(29, 31, 43, 45);
  addObj({ k: 'hut', x: 31, y: 34, roof: '#c9a050' }); addObj({ k: 'hut', x: 41, y: 34, roof: '#b88a3a' });
  addObj({ k: 'hut', x: 31, y: 42, roof: '#b88a3a' }); addObj({ k: 'hut', x: 41, y: 42, roof: '#d4ac5c', shop: true });
  for (const [x, y] of [[33, 38], [39, 38], [36, 33]]) addObj({ k: 'lantern', x, y });
  // the dock: signs and the raft
  addObj({ k: 'raft', x: 38, y: 65 }); keep(32, 55, 41, 67);
  WORLD.signs.push({ x: 34, y: 58, key: 'sign.welcome' }, { x: 38, y: 58, key: 'sign.village' });
  for (const s of WORLD.signs) addObj({ k: 'sign', x: s.x, y: s.y });
  WORLD.signs.push({ x: 35, y: 18, key: 'sign.kapok' }); addObj({ k: 'sign', x: 35, y: 18 });
  // the arches and their arenas
  for (const id in ARCHES) { const a = ARCHES[id]; WORLD.arches[id] = a; addObj({ k: 'arch', x: a.x, y: a.y, id, col: SPORT_COLOURS[id] }); keep(a.x - 2, a.y - 2, a.x + 2, a.y + 2); }
  addObj({ k: 'table', x: 26, y: 28 }); keep(21, 25, 31, 31);
  addObj({ k: 'goal', x: 14, y: 55 }); addObj({ k: 'goal', x: 26, y: 55, flip: true }); keep(11, 49, 29, 60);
  addObj({ k: 'targets', x: 11, y: 37 }); keep(3, 33, 19, 47);
  addObj({ k: 'canoe', x: 59, y: 36 }); addObj({ k: 'canoe', x: 63, y: 36, col: '#3fb7ff' }); keep(57, 33, 65, 40);
  for (const [x, y] of [[43, 53], [44, 52], [48, 52], [49, 53]]) addObj({ k: 'log', x, y });
  addObj({ k: 'drums', x: 46, y: 53 }); keep(41, 49, 51, 60);
  addObj({ k: 'sled', x: 18, y: 21 }); keep(13, 20, 19, 25);
  { const a = ARCHES.dash; for (const [dx, dy] of [[-2, -5], [2, -7]]) addObj({ k: 'log', x: a.x + dx, y: a.y + dy }); addObj({ k: 'mangoes', x: a.x, y: a.y - 10 }); keep(a.x - 4, a.y - 12, a.x + 4, a.y + 2); }
  for (const [x, y] of [[42, 12], [48, 10], [44, 17], [49, 16]]) { addObj({ k: 'giant', x, y }); keep(x - 1, y - 3, x + 1, y + 1); }
  keep(43, 19, 49, 23);
  // keep the roads clear
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const k = tileAt(x, y); if (k === T_PATH || k === T_PLANK || k === T_BRIDGE || k === T_STONE) keep(x - 1, y - 1, x + 1, y + 1); }
  // trees, palms, bushes and rocks
  for (let y = 2; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    if (KEEP[idx(x, y)]) continue;
    const k = tileAt(x, y), r = hash(x, y, 1);
    if (k === T_GRASS || k === T_FLOWER || k === T_DARK) {
      const dense = k === T_DARK ? 0.25 : 0.14;
      if (r < dense && !occupied(x, y, 1)) addObj({ k: 'tree', x, y, v: (hash(x, y, 2) * 3) | 0 });
      else if (r > 0.965 && !occupied(x, y, 0)) addObj({ k: 'bush', x, y });
      else if (r > 0.95 && r <= 0.955 && !occupied(x, y, 0)) addObj({ k: 'rock', x, y });
    } else if (k === T_SAND && r < 0.07 && !occupied(x, y, 1) && !isWater(tileAt(x, y - 1))) addObj({ k: 'palm', x, y, flip: hash(x, y, 4) < 0.5 });
    else if (k === T_HILL && r < 0.1 && tileAt(x, y + 1) === T_HILL && !occupied(x, y, 1)) addObj({ k: 'tree', x, y, v: 1, hill: true });
  }
  // solid tiles
  const S = WORLD.solid;
  for (let i = 0; i < S.length; i++) S[i] = WALKABLE[WORLD.tiles[i]] ? 0 : 1;
  for (const o of WORLD.objects) for (const [dx, dy] of footprint(o)) if (inMap(o.x + dx, o.y + dy)) S[idx(o.x + dx, o.y + dy)] = 1;
}
const TREE_SPOTS = new Uint8Array(MW * MH);
function occupied(x, y, gap) {
  for (let dy = -gap - 1; dy <= gap; dy++) for (let dx = -gap; dx <= gap; dx++) if (inMap(x + dx, y + dy) && TREE_SPOTS[idx(x + dx, y + dy)]) return true;
  TREE_SPOTS[idx(x, y)] = 1; return false;
}
function footprint(o) {
  switch (o.k) {
    case 'kapok': return [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, -1], [0, -1], [1, -1]];
    case 'hut': return [[-1, 0], [0, 0], [1, 0], [-1, -1], [0, -1], [1, -1]];
    case 'arch': return [[-1, 0], [1, 0]];
    case 'table': return [[-1, 0], [0, 0], [1, 0]];
    case 'goal': return [[0, -1], [0, 0], [0, 1]];
    case 'raft': return [];
    case 'targets': return [];
    case 'canoe': return [[0, 0], [1, 0]];
    case 'drums': return [[-1, 0], [0, 0], [1, 0]];
    case 'giant': return [[0, 0], [-1, 0], [1, 0]];
    case 'sled': return [[0, 0]];
    default: return [[0, 0]];
  }
}
JC.footprint = footprint;
WORLD.isSolid = (x, y) => !inMap(x, y) || WORLD.solid[idx(x, y)] === 1;
WORLD.tileAt = tileAt;

/* ---------- tile art ---------- */
const TILECACHE = {};
function tileCanvas(kind, v, frame) {
  const key = kind + '_' + v + '_' + frame; let c = TILECACHE[key]; if (c) return c;
  c = canvas(TS, TS); const g = c.getContext('2d');
  const R = rng(kind * 97 + v * 13 + 1);
  const dots = (n, col, w, h) => { g.fillStyle = col; for (let i = 0; i < n; i++) g.fillRect((R() * (TS - (w || 1))) | 0, (R() * (TS - (h || 1))) | 0, w || 1, h || 1); };
  const tuft = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 2); g.fillRect(x + 2, y, 1, 2); g.fillRect(x + 1, y - 1, 1, 3); };
  switch (kind) {
    case T_GRASS: case T_FLOWER: case T_HILL: case T_DARK: case T_PITCH: {
      const base = kind === T_HILL ? '#4f9a3a' : kind === T_DARK ? '#2f7034' : kind === T_PITCH ? '#5cb845' : '#4fa83f';
      g.fillStyle = base; g.fillRect(0, 0, TS, TS);
      if (kind === T_PITCH) { g.fillStyle = v % 2 ? '#66c24c' : '#56b040'; g.fillRect(0, 0, TS, TS); break; }
      dots(10, shade(base, -0.18)); dots(6, shade(base, 0.2));
      for (let i = 0; i < 2 + v % 2; i++) tuft(1 + ((R() * 12) | 0), 2 + ((R() * 12) | 0), shade(base, kind === T_DARK ? 0.25 : 0.32));
      if (kind === T_FLOWER) for (let i = 0; i < 3; i++) { const x = 2 + ((R() * 11) | 0), y = 2 + ((R() * 11) | 0), col = ['#ff6fb5', '#ffd23f', '#fff8e8', '#ff8b3d'][(v + i) % 4]; g.fillStyle = col; g.fillRect(x, y, 1, 1); g.fillRect(x - 1, y + 1, 3, 1); g.fillRect(x, y + 2, 1, 1); g.fillStyle = '#ffe9a0'; g.fillRect(x, y + 1, 1, 1); }
      break;
    }
    case T_PATH: case T_COURT: {
      const base = kind === T_COURT ? '#c97c4c' : '#c99a5e'; g.fillStyle = base; g.fillRect(0, 0, TS, TS);
      dots(9, shade(base, -0.14)); dots(5, shade(base, 0.18)); dots(2, shade(base, -0.3), 2, 1);
      break;
    }
    case T_SAND: { g.fillStyle = '#e8cd8a'; g.fillRect(0, 0, TS, TS); dots(8, '#d4b26c'); dots(5, '#f6e3ac'); break; }
    case T_MUD: { g.fillStyle = '#7a4a2a'; g.fillRect(0, 0, TS, TS); dots(10, '#5e3820', 2, 1); dots(5, '#a8703e', 2, 1); g.fillStyle = '#c99a6a'; g.fillRect(3 + v * 2, 4, 3, 1); g.fillRect(9, 10 - v, 2, 1); break; }
    case T_WATER: case T_DEEP: case T_LILY: case T_STONE: case T_RAPID: {
      const base = kind === T_DEEP ? '#1f62a0' : kind === T_RAPID ? '#3b9ad0' : '#3393cc';
      g.fillStyle = base; g.fillRect(0, 0, TS, TS);
      const wl = kind === T_DEEP ? '#2a74b4' : '#55b4e0';
      g.fillStyle = wl;
      for (let i = 0; i < 3; i++) { const y = (i * 5 + v * 3 + frame * 2) % TS, x = (i * 7 + v * 5 + frame * 3) % 12; g.fillRect(x, y, 4, 1); g.fillRect(x + 1, y - 1 < 0 ? 0 : y - 1, 2, 1); }
      if (kind === T_RAPID) { g.fillStyle = '#e8fbff'; for (let i = 0; i < 4; i++) { const x = (i * 5 + frame * 4 + v) % 14, y = (i * 4 + frame * 3) % 15; g.fillRect(x, y, 3, 1); g.fillRect(x + 1, y + 1, 1, 1); } }
      if (kind === T_LILY) { disc(g, 8, 8, 5, '#2f8a3a'); disc(g, 8, 8, 4, '#4fb84a'); g.fillStyle = '#3393cc'; g.fillRect(8, 3, 1, 5); g.fillRect(9, 4, 1, 4); if (v % 2) { disc(g, 6, 6, 1, '#ff9ac8'); g.fillStyle = '#fff'; g.fillRect(6, 6, 1, 1); } }
      if (kind === T_STONE) { oval(g, 8, 9, 6, 4, '#3d4652'); oval(g, 8, 8, 6, 4, '#8a93a0'); oval(g, 7, 7, 4, 2, '#b4bcc6'); g.fillStyle = '#e8fbff'; g.fillRect(1, 12 - frame, 3, 1); g.fillRect(12, 12 + frame, 3, 1); }
      break;
    }
    case T_PLANK: case T_BRIDGE: {
      g.fillStyle = kind === T_BRIDGE ? '#3393cc' : '#6e4325'; g.fillRect(0, 0, TS, TS);
      for (let i = 0; i < 4; i++) {
        const y = i * 4, col = ['#b07a44', '#a06c3a', '#b98448', '#a87240'][(i + v) % 4];
        g.fillStyle = col; g.fillRect(kind === T_BRIDGE ? 0 : 0, y, TS, 3); g.fillStyle = shade(col, 0.25); g.fillRect(0, y, TS, 1);
        g.fillStyle = '#5e3820'; g.fillRect(((i * 5 + v * 3) % 12) + 2, y + 1, 3, 1);
        g.fillStyle = '#3b2416'; g.fillRect(1, y + 1, 1, 1); g.fillRect(TS - 2, y + 1, 1, 1);
      }
      if (kind === T_BRIDGE) { g.fillStyle = '#e8d6a0'; g.fillRect(0, 0, TS, 1); g.fillRect(0, TS - 1, TS, 1); g.fillStyle = '#8a6a3a'; for (let x = 0; x < TS; x += 4) { g.fillRect(x, 0, 1, 2); g.fillRect(x, TS - 2, 1, 2); } }
      break;
    }
  }
  TILECACHE[key] = c; return c;
}

/* ---------- object art (drawn into the big layers) ---------- */
function drawTreeBase(g, px, py, v) {
  // trunk and roots in the ground layer (px, py: the tile's top-left)
  shadowOval(g, px + 8, py + 14, 9, 3);
  rect(g, px + 6, py + 4, 5, 11, '#5e3820'); rect(g, px + 7, py + 4, 2, 11, '#7a4a26'); rect(g, px + 5, py + 13, 7, 2, '#4a2c18');
  rect(g, px + 6, py + 4, 1, 11, OUT); rect(g, px + 10, py + 4, 1, 11, OUT);
}
function canopy(g, cx, cy, r, cols) {
  disc(g, cx, cy + 1, r + 1, OUT);
  disc(g, cx, cy, r, cols[0]);
  disc(g, cx - 2, cy - 2, r - 2, cols[1]);
  disc(g, cx - 3, cy - 4, Math.max(2, r - 5), cols[2]);
  for (let i = 0; i < 5; i++) { const a = i * 1.3 + r, rr = r - 2; const x = cx + Math.cos(a) * rr * 0.7, y = cy + Math.sin(a) * rr * 0.6; g.fillStyle = cols[3]; g.fillRect(x | 0, y | 0, 2, 1); }
}
const TREE_COLS = [['#1f6a35', '#2f8a3f', '#56b84a', '#8ee070'], ['#236e2c', '#3a9a38', '#6cc84a', '#a8e870'], ['#1d5e3a', '#2a7d4a', '#48a85a', '#7ad890']];
function drawTreeTop(g, px, py, v, hill) {
  const cols = TREE_COLS[v % 3];
  canopy(g, px + 8, py - 6, 11, cols);
  if (v === 2) { g.fillStyle = '#ff6fb5'; g.fillRect(px + 3, py - 9, 2, 2); g.fillRect(px + 12, py - 4, 2, 2); g.fillStyle = '#ffd23f'; g.fillRect(px + 9, py - 12, 2, 2); }
}
function shadowOval(g, cx, cy, rx, ry) { g.globalAlpha = 0.25; oval(g, cx, cy, rx, ry, '#000'); g.globalAlpha = 1; }
function drawPalm(g, gt, px, py, flip) {
  shadowOval(g, px + 8, py + 14, 7, 2);
  const s = flip ? -1 : 1;
  for (let i = 0; i < 26; i++) { const x = px + 8 + s * Math.round(Math.sin(i / 10) * 4), y = py + 14 - i; rect(g, x - 2, y, 5, 1, i % 4 === 0 ? '#7a5030' : '#9a6a3a'); rect(g, x - 2, y, 1, 1, OUT); rect(g, x + 2, y, 1, 1, OUT); }
  const tx = px + 8 + s * Math.round(Math.sin(2.6) * 4), ty = py - 12;
  for (const [dx, dy, len] of [[-1, 0, 11], [1, 0, 11], [-1, -1, 8], [1, -1, 8], [0, -1, 6], [-1, 1, 7], [1, 1, 7]]) {
    for (let i = 0; i < len; i++) { const x = tx + dx * i, y = ty + dy * i + (i * i) / 14; rect(gt, x - 1, y - 1, 3, 3, OUT); }
  }
  for (const [dx, dy, len] of [[-1, 0, 11], [1, 0, 11], [-1, -1, 8], [1, -1, 8], [0, -1, 6], [-1, 1, 7], [1, 1, 7]]) {
    for (let i = 0; i < len; i++) { const x = tx + dx * i, y = ty + dy * i + (i * i) / 14; rect(gt, x, y, 1, 1, i % 2 ? '#3a9a38' : '#5cc04a'); rect(gt, x, y - 1, 1, 1, '#2a7a30'); }
  }
  disc(gt, tx, ty + 1, 2, '#6e4a2a'); rect(gt, tx - 1, ty, 1, 1, '#a8703e');
}
function drawHut(g, gt, px, py, o) {
  // px, py: the centre tile's top-left; the hut spans x-1..x+1, rows y-2..y
  const x0 = px - 16, base = py + 16;
  shadowOval(g, px + 8, base - 1, 26, 4);
  for (const sx of [x0 + 4, x0 + 22, x0 + 40]) { rect(g, sx, base - 12, 4, 12, '#5e3820'); rect(g, sx, base - 12, 1, 12, OUT); rect(g, sx + 3, base - 12, 1, 12, OUT); }
  rect(g, x0 + 1, base - 26, 46, 15, OUT); rect(g, x0 + 2, base - 25, 44, 13, '#c99a5e');
  for (let i = 0; i < 44; i += 4) rect(g, x0 + 2 + i, base - 25, 1, 13, '#a87a44');
  rect(g, x0 + 2, base - 13, 44, 2, '#8a5a33');
  rect(g, x0 + 19, base - 22, 10, 11, OUT); rect(g, x0 + 20, base - 21, 8, 10, '#3b2416'); rect(g, x0 + 20, base - 21, 8, 2, '#5e3820');
  rect(g, x0 + 6, base - 21, 8, 6, OUT); rect(g, x0 + 7, base - 20, 6, 4, '#ffe9a0'); rect(g, x0 + 34, base - 21, 8, 6, OUT); rect(g, x0 + 35, base - 20, 6, 4, '#ffe9a0');
  // a little ladder
  for (let i = 0; i < 4; i++) rect(g, x0 + 21, base - 9 + i * 3, 6, 1, '#7a4a26');
  rect(g, x0 + 20, base - 11, 1, 12, '#5e3820'); rect(g, x0 + 27, base - 11, 1, 12, '#5e3820');
  // the thatched roof (over layer)
  const rc = o.roof || '#c9a050';
  for (let j = 0; j < 18; j++) { const w = 18 + j * 2 + (j > 14 ? 0 : 0); rect(gt, px + 8 - w / 2 - 1, base - 44 + j, w + 2, 1, OUT); }
  for (let j = 1; j < 17; j++) { const w = 18 + j * 2; rect(gt, px + 8 - w / 2, base - 44 + j, w, 1, j % 3 === 0 ? shade(rc, -0.25) : rc); }
  for (let j = 3; j < 17; j += 2) for (let i = -14; i <= 14; i += 5) rect(gt, px + 8 + i + (j % 4), base - 44 + j, 1, 2, shade(rc, 0.25));
  rect(gt, px + 8 - 22, base - 27, 46, 2, shade(rc, -0.4));
  if (o.shop) { // the tapir's tip stall: a striped awning
    for (let i = 0; i < 8; i++) rect(gt, x0 + 4 + i * 5, base - 12, 5, 4, i % 2 ? '#fff8e8' : '#3fb7ff');
    rect(gt, x0 + 4, base - 8, 40, 1, OUT);
  }
}
function drawKapok(g, gt, px, py) {
  // trunk: px is the centre tile; roots spread over x-2..x+2 at row y; trunk rises to the canopy.
  const cx = px + 8, base = py + 16;
  shadowOval(g, cx, base - 2, 44, 7);
  // buttress roots
  for (const [dx, w] of [[-34, 14], [-18, 10], [10, 10], [22, 14]]) { rect(g, cx + dx, base - 10, w, 10, OUT); rect(g, cx + dx + 1, base - 9, w - 2, 9, '#8a6a4a'); rect(g, cx + dx + 2, base - 9, 2, 9, '#a8886a'); }
  rect(g, cx - 18, base - 60, 36, 60, OUT); rect(g, cx - 17, base - 60, 34, 59, '#9a7a58');
  for (let i = 0; i < 6; i++) rect(g, cx - 14 + i * 6, base - 58, 2, 56, i % 2 ? '#7d5f42' : '#b8987a');
  rect(g, cx - 5, base - 30, 10, 14, OUT); rect(g, cx - 4, base - 29, 8, 13, '#3b2416');
  // canopy (over layer): a huge layered crown
  const top = base - 150;
  for (const [dx, dy, r, k] of [[-40, 70, 30, 0], [40, 70, 30, 0], [0, 60, 40, 0], [-56, 50, 22, 1], [56, 50, 22, 1], [-24, 34, 30, 1], [24, 34, 30, 1], [0, 22, 30, 2]]) {
    canopy(gt, cx + dx, top + dy, r, TREE_COLS[k]);
  }
  // hanging vines
  for (const dx of [-50, -30, 30, 50]) for (let i = 0; i < 26; i++) rect(gt, cx + dx + Math.round(Math.sin(i / 4) * 2), top + 92 + i, 1, 1, i % 5 === 0 ? '#8ee070' : '#2a7a30');
}
function drawTotemBase(g, px, py) {
  const cx = px + 8, base = py + 15;
  shadowOval(g, cx, base, 12, 3);
  rect(g, cx - 10, base - 4, 20, 5, OUT); rect(g, cx - 9, base - 3, 18, 3, '#7a7a8a');
  rect(g, cx - 7, base - 34, 14, 31, OUT); rect(g, cx - 6, base - 34, 12, 30, '#a8703e');
  rect(g, cx - 6, base - 34, 3, 30, '#c48a4c');
  // carved faces
  rect(g, cx - 4, base - 30, 3, 2, OUT); rect(g, cx + 1, base - 30, 3, 2, OUT); rect(g, cx - 3, base - 25, 6, 2, '#5e3820');
  rect(g, cx - 6, base - 20, 12, 1, OUT);
  rect(g, cx - 4, base - 16, 2, 3, '#3fb7ff'); rect(g, cx + 2, base - 16, 2, 3, '#3fb7ff'); rect(g, cx - 2, base - 11, 4, 2, OUT);
}
function drawTotemTop(gt, px, py) {
  const cx = px + 8, base = py + 15;
  rect(gt, cx - 7, base - 58, 14, 25, OUT); rect(gt, cx - 6, base - 57, 12, 24, '#a8703e'); rect(gt, cx - 6, base - 57, 3, 24, '#c48a4c');
  // a fan of carved leaves, one per champion (each Feather socket sits on one), and a carved sun on top of the pole
  const so = totemSockets();
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < NSPORTS; i++) {
    const s = so[i], x0 = cx, y0 = base - 46, n = 10;
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + (s.x - x0) * k / n), y = Math.round(y0 + (s.y + 2 - y0) * k / n);
      if (pass === 0) rect(gt, x - 1, y - 1, 3, 3, OUT); else rect(gt, x, y, 1, 1, '#c48a4c');
    }
    if (pass === 0) oval(gt, s.x, s.y + 1, 5, 4, OUT); else { oval(gt, s.x, s.y + 1, 4, 3, '#a8703e'); rect(gt, s.x - 2, s.y + 1, 4, 1, '#7a4a26'); }
  }
  disc(gt, cx, base - 48, 6, OUT); disc(gt, cx, base - 48, 5, '#ffc544'); disc(gt, cx, base - 48, 3, '#d39a22'); rect(gt, cx - 1, base - 49, 2, 2, '#fff3a8');
}
/** Where the totem's sockets are (pixels, in map space): a fan, one per sport, the middle ones highest. */
const SOCKETS = [];
function totemSockets() {
  const px = WORLD.totem.x * TS, py = WORLD.totem.y * TS, cx = px + 8, base = py + 15, n = NSPORTS, mid = (n - 1) / 2;
  if (SOCKETS.length === n && SOCKETS.px === px) return SOCKETS;
  SOCKETS.length = 0; SOCKETS.px = px;
  for (let i = 0; i < n; i++) { const a = (i - mid) / mid; SOCKETS.push({ x: Math.round(cx + a * 28), y: Math.round(base - 60 + a * a * 10 + Math.abs(a) * 2) }); }
  return SOCKETS;
}
WORLD.sockets = totemSockets;
const SPORT_ICONS = {
  paddle: ['.ooo.', 'orrro', 'orrro', '.ooo.', '..o..', '..o..'],
  vine: ['..oo.', '.ogo.', 'oggo.', '.oog.', '..og.', '...o.'],
  seed: ['.ooo.', 'orwro', 'owrwo', 'orwro', '.ooo.'],
  rapids: ['.....', 'o...o', 'obbbo', '.obo.', '.....'],
  frog: ['.ooo.', 'owwwo', 'obbbo', 'obbbo', '.ooo.'],
  kick: ['.ooo.', 'owkwo', 'okwko', 'owkwo', '.ooo.'],
  leaf: ['...oo', '..ogo', '.ogoo', 'ogoo.', 'oo...'],
  dash: ['...g.', '.oog.', 'oyyyo', 'oyywo', 'oyyyo', '.ooo.'],
};
function iconSprite(id) {
  const k = 'icon_' + id; if (SPRITES[k]) return SPRITES[k];
  return sprite(k, SPORT_ICONS[id], { o: OUT, r: SPORT_COLOURS[id], g: '#6ad34a', w: '#fff8e8', b: '#8a5a33', k: OUT, y: '#ff9b2e' });
}
JC.iconSprite = iconSprite;
function drawArch(g, gt, px, py, o) {
  const col = o.col, x0 = px - 16;
  for (const sx of [x0 + 2, x0 + 34]) {
    shadowOval(g, sx + 6, py + 15, 8, 2);
    rect(g, sx, py - 22, 12, 37, OUT); rect(g, sx + 1, py - 21, 10, 36, '#8a5a33'); rect(g, sx + 1, py - 21, 3, 36, '#a8703e');
    for (let j = 0; j < 4; j++) { rect(g, sx + 3, py - 16 + j * 8, 6, 1, '#5e3820'); rect(g, sx + 5, py - 14 + j * 8, 2, 2, '#5e3820'); }
    for (let j = 0; j < 5; j++) { rect(g, sx + (j % 2 ? 9 : 0), py - 18 + j * 7, 3, 3, col); rect(g, sx + (j % 2 ? 10 : 1), py - 17 + j * 7, 1, 1, '#fff8e8'); }
    for (let j = 0; j < 6; j++) rect(g, sx + (j % 2 ? 1 : 10), py - 20 + j * 6, 1, 3, '#3d9a2e');
  }
  // the top (over layer): a round arch of twisted vines between the posts, woven with flowers, and the sport's
  // plaque hanging under it on two vine strings
  const cx = px + 8, cy = py - 20, rx = 16, ry = 15;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI * i / 24, x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy - Math.sin(a) * ry);
      if (pass === 0) rect(gt, x - 4, y - 4, 8, 8, OUT);
      else if (pass === 1) { rect(gt, x - 3, y - 3, 6, 6, i % 2 ? '#7a4a26' : '#8a5a33'); rect(gt, x - 3, y - 3, 6, 1, '#b07a44'); }
      else if (i % 3 === 0) { rect(gt, x - 3 + (i % 2), y - 1, 2, 2, '#3d9a2e'); rect(gt, x + 1, y - 3, 2, 2, '#56b84a'); }
    }
  }
  for (let i = 1; i < 8; i++) { const a = Math.PI * i / 8, fx = Math.round(cx + Math.cos(a) * rx) - 1, fy = Math.round(cy - Math.sin(a) * ry) - 1; rect(gt, fx, fy, 3, 3, col); rect(gt, fx + 1, fy + 1, 1, 1, '#fff8e8'); }
  rect(gt, cx - 5, cy - ry + 3, 1, 4, '#3d9a2e'); rect(gt, cx + 5, cy - ry + 3, 1, 4, '#3d9a2e');
  disc(gt, cx, py - 25, 8, OUT); disc(gt, cx, py - 25, 7, '#fff0c8'); disc(gt, cx, py - 25, 6, shade(col, 0.55));
  const ic = iconSprite(o.id); spr(gt, ic, cx - (ic.w >> 1), py - 25 - (ic.h >> 1));
}
function drawMisc(g, gt, o, px, py) {
  switch (o.k) {
    case 'bush': shadowOval(g, px + 8, py + 13, 8, 2); disc(g, px + 8, py + 9, 7, OUT); disc(g, px + 8, py + 8, 6, '#2f8a3f'); disc(g, px + 6, py + 6, 3, '#56b84a'); rect(g, px + 10, py + 9, 2, 2, '#ff6fb5'); break;
    case 'rock': shadowOval(g, px + 8, py + 13, 7, 2); oval(g, px + 8, py + 10, 6, 5, OUT); oval(g, px + 8, py + 9, 5, 4, '#8a93a0'); oval(g, px + 7, py + 8, 3, 2, '#b4bcc6'); break;
    case 'lantern': rect(g, px + 7, py - 6, 2, 20, OUT); rect(g, px + 7, py - 6, 1, 20, '#7a4a26'); rect(gt, px + 4, py - 12, 8, 8, OUT); rect(gt, px + 5, py - 11, 6, 6, '#ffc544'); rect(gt, px + 6, py - 10, 2, 2, '#fff3a8'); break;
    case 'sign': shadowOval(g, px + 8, py + 14, 6, 2); rect(g, px + 7, py + 6, 2, 9, '#5e3820'); rect(g, px + 1, py - 1, 14, 9, OUT); rect(g, px + 2, py, 12, 7, '#c48a4c'); rect(g, px + 4, py + 2, 8, 1, '#7a4a26'); rect(g, px + 4, py + 4, 6, 1, '#7a4a26'); break;
    case 'table':
      rect(g, px - 14, py + 4, 44, 3, OUT); rect(g, px - 13, py + 4, 42, 2, '#3a7bd5'); rect(g, px + 7, py + 1, 2, 6, '#fff8e8');
      rect(g, px - 12, py + 7, 2, 8, OUT); rect(g, px + 26, py + 7, 2, 8, OUT); rect(g, px + 7, py + 7, 2, 8, OUT); break;
    case 'goal': {
      const fx = o.flip ? px + 2 : px + 4;
      rect(g, fx, py - 14, 10, 44, OUT); rect(g, fx + 1, py - 13, 8, 42, '#e8f4ff');
      for (let j = 0; j < 42; j += 3) rect(g, fx + 2, py - 13 + j, 6, 1, '#b8c8d8');
      rect(g, o.flip ? fx + 7 : fx, py - 14, 3, 44, '#fff8e8'); break;
    }
    case 'targets': for (const [dx, dy] of [[-40, 6], [20, -18], [50, 28]]) { const x = px + dx, y = py + dy; rect(g, x + 3, y + 6, 2, 8, '#5e3820'); disc(g, x + 4, y + 4, 5, OUT); disc(g, x + 4, y + 4, 4, '#fff8e8'); disc(g, x + 4, y + 4, 2, '#ff5a5a'); } break;
    case 'canoe': {
      const col = o.col || '#c97c4c';
      shadowOval(g, px + 16, py + 12, 16, 3);
      rect(g, px + 1, py + 6, 30, 7, OUT); rect(g, px + 2, py + 7, 28, 5, col); rect(g, px + 2, py + 7, 28, 1, shade(col, 0.4)); rect(g, px + 4, py + 9, 24, 2, shade(col, -0.35));
      rect(g, px + 14, py + 2, 2, 8, '#7a4a26'); rect(g, px + 12, py + 1, 6, 3, OUT); break;
    }
    case 'log': shadowOval(g, px + 8, py + 13, 8, 2); rect(g, px + 1, py + 6, 14, 8, OUT); rect(g, px + 2, py + 7, 12, 6, '#8a5a33'); rect(g, px + 2, py + 7, 12, 1, '#b07a44'); disc(g, px + 3, py + 10, 2, '#c99a6a'); break;
    case 'mangoes': shadowOval(g, px + 8, py + 14, 8, 2); rect(g, px + 1, py + 6, 14, 9, OUT); rect(g, px + 2, py + 7, 12, 7, '#a8703e'); for (let i = 0; i < 3; i++) rect(g, px + 3, py + 8 + i * 2, 10, 1, '#7a4a26');
      for (const [dx, dy] of [[4, 4], [8, 3], [12, 4], [6, 1], [10, 1]]) { disc(g, px + dx, py + dy + 1, 3, OUT); disc(g, px + dx, py + dy + 1, 2, '#ff9b2e'); rect(g, px + dx - 1, py + dy, 1, 1, '#ffd24a'); } rect(g, px + 8, py - 2, 2, 2, '#3d9a2e'); break;
    case 'drums': for (const [dx, c, r] of [[-14, '#2f8a3f', 6], [0, '#6ad34a', 7], [14, '#a8e870', 5]]) { const cx = px + 8 + dx; rect(g, cx - r, py + 2, r * 2, 12, OUT); rect(g, cx - r + 1, py + 3, r * 2 - 2, 10, '#8a5a33'); oval(g, cx, py + 3, r, 2, OUT); oval(g, cx, py + 3, r - 1, 1, c); for (let i = 0; i < 3; i++) rect(g, cx - r + 2 + i * 4, py + 6, 1, 7, '#5e3820'); } break;
    case 'sled': rect(g, px + 1, py + 6, 15, 7, OUT); rect(g, px + 2, py + 7, 13, 5, '#56b84a'); rect(g, px + 3, py + 7, 11, 1, '#8ee070'); rect(g, px + 8, py + 6, 1, 7, '#2a7a30'); break;
    case 'giant': {
      const cx = px + 8, base = py + 16;
      shadowOval(g, cx, base - 2, 22, 4);
      rect(g, cx - 12, base - 40, 24, 40, OUT); rect(g, cx - 11, base - 40, 22, 39, '#7a5a3a'); for (let i = 0; i < 4; i++) rect(g, cx - 9 + i * 6, base - 40, 2, 38, '#9a7a58');
      rect(g, cx - 18, base - 8, 10, 8, OUT); rect(g, cx + 8, base - 8, 10, 8, OUT); rect(g, cx - 17, base - 7, 8, 7, '#7a5a3a'); rect(g, cx + 9, base - 7, 8, 7, '#7a5a3a');
      canopy(gt, cx, base - 64, 24, TREE_COLS[2]); canopy(gt, cx - 14, base - 50, 14, TREE_COLS[0]); canopy(gt, cx + 14, base - 52, 14, TREE_COLS[1]);
      for (const dx of [-16, 0, 16]) for (let i = 0; i < 24; i++) rect(gt, cx + dx + Math.round(Math.sin(i / 3) * 2), base - 44 + i, 1, 1, i % 4 ? '#2a7a30' : '#8ee070');
      break;
    }
    case 'raft': break; // drawn live (it bobs, and carries Cappy's flag)
    case 'lift': break; // drawn live (it opens)
  }
}

/* ---------- pre-render ---------- */
function prerender() {
  const W = MW * TS, H = MH * TS;
  const g0 = canvas(W, H), g1 = canvas(W, H), ov = canvas(W, H);
  const c0 = g0.getContext('2d'), c1 = g1.getContext('2d'), co = ov.getContext('2d');
  for (const [c, f] of [[c0, 0], [c1, 1]]) {
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const k = tileAt(x, y), v = (hash(x, y, 7) * 4) | 0;
      c.drawImage(tileCanvas(k, k === T_PITCH ? ((x >> 1) % 2) : v, f), x * TS, y * TS);
      // shore foam on water next to land; dark lip under land edges
      if (isWater(k) || k === T_STONE || k === T_BRIDGE) {
        c.fillStyle = f ? '#d8f6ff' : '#ffffff';
        if (!isWater(tileAt(x, y - 1)) && tileAt(x, y - 1) !== T_STONE && tileAt(x, y - 1) !== T_BRIDGE && tileAt(x, y - 1) !== T_PLANK) { c.fillStyle = '#1b4a6e'; c.fillRect(x * TS, y * TS, TS, 2); c.fillStyle = f ? '#d8f6ff' : '#ffffff'; for (let i = f; i < TS; i += 3) c.fillRect(x * TS + i, y * TS + 2 + ((i + f) % 2), 2, 1); }
        if (!isWater(tileAt(x, y + 1)) && tileAt(x, y + 1) !== T_STONE && tileAt(x, y + 1) !== T_BRIDGE && tileAt(x, y + 1) !== T_PLANK) for (let i = 1 - f; i < TS; i += 3) c.fillRect(x * TS + i, y * TS + TS - 2 - ((i + f) % 2), 2, 1);
        if (!isWater(tileAt(x - 1, y)) && tileAt(x - 1, y) !== T_STONE && tileAt(x - 1, y) !== T_BRIDGE && tileAt(x - 1, y) !== T_PLANK) for (let i = f; i < TS; i += 3) c.fillRect(x * TS + 1 + ((i + f) % 2), y * TS + i, 1, 2);
        if (!isWater(tileAt(x + 1, y)) && tileAt(x + 1, y) !== T_STONE && tileAt(x + 1, y) !== T_BRIDGE && tileAt(x + 1, y) !== T_PLANK) for (let i = 1 - f; i < TS; i += 3) c.fillRect(x * TS + TS - 2 - ((i + f) % 2), y * TS + i, 1, 2);
      }
    }
  }
  // edges that do not animate: sand meets grass, hill cliffs, plank posts
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const k = tileAt(x, y), px = x * TS, py = y * TS;
    for (const c of [c0, c1]) {
      if (k === T_HILL && tileAt(x, y + 1) !== T_HILL) { c.fillStyle = '#8a6a4a'; c.fillRect(px, py + 9, TS, 7); c.fillStyle = '#6e5238'; c.fillRect(px, py + 13, TS, 3); c.fillStyle = '#a8886a'; c.fillRect(px + (x % 3) * 5, py + 10, 3, 1); c.fillStyle = OUT; c.fillRect(px, py + 8, TS, 1); }
      if (k === T_HILL && tileAt(x, y - 1) !== T_HILL && tileAt(x, y - 1) !== T_DEEP) { c.fillStyle = '#7cc84a'; c.fillRect(px, py, TS, 1); }
      if (k === T_HILL && tileAt(x - 1, y) !== T_HILL) { c.fillStyle = '#3d7a2e'; c.fillRect(px, py, 2, TS); }
      if (k === T_HILL && tileAt(x + 1, y) !== T_HILL) { c.fillStyle = '#3d7a2e'; c.fillRect(px + TS - 2, py, 2, TS); }
      if ((k === T_GRASS || k === T_FLOWER || k === T_DARK) && tileAt(x, y - 1) === T_HILL) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(px, py, TS, 4); }
      if (k === T_PLANK) { const wat = isWater(tileAt(x, y + 1)) || isWater(tileAt(x - 1, y)) || isWater(tileAt(x + 1, y)); if (wat && (x + y) % 2 === 0) { c.fillStyle = '#3b2416'; c.fillRect(px + 1, py + 12, 3, 4); c.fillRect(px + TS - 4, py + 12, 3, 4); } }
      if (k === T_PITCH) { c.fillStyle = '#f4f8ec'; if (tileAt(x, y - 1) !== T_PITCH) c.fillRect(px, py + 2, TS, 1); if (tileAt(x, y + 1) !== T_PITCH) c.fillRect(px, py + 13, TS, 1); if (tileAt(x - 1, y) !== T_PITCH) c.fillRect(px + 2, py, 1, TS); if (tileAt(x + 1, y) !== T_PITCH) c.fillRect(px + 13, py, 1, TS); if (x === 20) c.fillRect(px + 7, py, 2, TS); }
      if ((k === T_GRASS || k === T_FLOWER) && tileAt(x, y + 1) === T_SAND) { c.fillStyle = '#3d8a33'; c.fillRect(px, py + 15, TS, 1); }
      if ((k === T_PATH || k === T_COURT) && (tileAt(x, y - 1) === T_GRASS || tileAt(x, y - 1) === T_FLOWER || tileAt(x, y - 1) === T_DARK)) { c.fillStyle = '#4fa83f'; for (let i = 0; i < TS; i += 2) c.fillRect(px + i, py, 1, 1 + ((i * 7 + x) % 3 === 0 ? 1 : 0)); }
    }
  }
  if (WORLD.tiles[idx(20, 55)] === T_PITCH) for (const c of [c0, c1]) { c.strokeStyle = '#f4f8ec'; c.lineWidth = 1; disc(c, 20 * TS + 8, 55 * TS + 8, 14, '#f4f8ec'); disc(c, 20 * TS + 8, 55 * TS + 8, 13, '#5cb845'); c.fillStyle = '#f4f8ec'; c.fillRect(20 * TS + 7, 52 * TS, 2, 6 * TS); }
  // objects, from the top of the map down so lower things overlap higher ones
  const objs = WORLD.objects.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const dummy = canvas(1, 1).getContext('2d');
  for (const o of objs) {
    const px = o.x * TS, py = o.y * TS;
    for (const [c, top] of [[c0, co], [c1, null]]) {
      const gt = top || dummy;
      if (o.k === 'tree') { drawTreeBase(c, px, py, o.v); if (top) drawTreeTop(top, px, py, o.v, o.hill); }
      else if (o.k === 'palm') drawPalm(c, gt, px, py, o.flip);
      else if (o.k === 'hut') drawHut(c, gt, px, py, o);
      else if (o.k === 'kapok') drawKapok(c, gt, px, py);
      else if (o.k === 'totem') { drawTotemBase(c, px, py); if (top) drawTotemTop(top, px, py); }
      else if (o.k === 'arch') drawArch(c, gt, px, py, o);
      else drawMisc(c, gt, o, px, py);
    }
  }
  WORLD.ground[0] = g0; WORLD.ground[1] = g1; WORLD.over = ov;
}
WORLD.build = function () {
  if (WORLD.ready) return;
  buildLayout(); buildObjects(); prerender();
  WORLD.ready = true;
};
WORLD.arch = id => ARCHES[id];
WORLD.ARCHES = ARCHES;
