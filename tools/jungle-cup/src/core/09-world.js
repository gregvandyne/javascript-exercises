// ======================================================================================================
// DELTA ISLE: the overworld map. Tiles (16 x 16) are painted once into small tile canvases; the island is drawn into
// 256 x 256 chunks on demand (ground in two frames for the water, and the "over" layer: tree tops, roofs, arch beams,
// drawn after the characters so they can walk behind things). Only the chunks near the camera are kept (a small cache),
// so the big island never needs one giant canvas.
// Map coordinates are tiles; JC.world.arch(id) gives each sport's arch.
// The island (docs/jungle-cup-plan.md "Delta Isle"): the dock (south) → Mossy Village (the Cup Totem) → the sports spread
// round the island, each reached by a little adventure: the rope bridge over the gorge (west), stepping stones and lily
// pads to Tico's islet, the vine swing over the ravine to the hills (north-west), the long ladder up the cliffs to the
// high grove (north-east) and the zipline down, the mud trail to the clearing, the river ferry to the east bank, and the
// glowing cave that comes out behind the waterfall in Rana's grotto (south-east).
// ======================================================================================================
const TS = 16, MW = 112, MH = 100;
const T_DEEP = 0, T_WATER = 1, T_SAND = 2, T_GRASS = 3, T_FLOWER = 4, T_PATH = 5, T_PLANK = 6, T_STONE = 7, T_BRIDGE = 8, T_MUD = 9,
  T_LILY = 10, T_PITCH = 11, T_COURT = 12, T_HILL = 13, T_DARK = 14, T_RAPID = 15,
  T_CLIFF = 16, T_LADDER = 17, T_GORGE = 18, T_ROPE = 19, T_ROCK = 20, T_CAVE = 21, T_MUDT = 22, T_PAD = 23, T_FALLS = 24, T_HIGH = 25, T_LOG = 26;
const WALKABLE = [false, false, true, true, true, true, true, true, true, false, false, true, true, false, true, false,
  false, true, false, true, false, true, true, true, true, true, true];
const WORLD = { tiles: new Uint8Array(MW * MH), solid: new Uint8Array(MW * MH), objects: [], arches: {}, npcs: [], items: [], signs: [],
  ready: false, W: MW, H: MH, TS, totem: { x: 50, y: 62 }, lift: { x: 50, y: 23 }, dock: { x: 50, y: 93 }, dockRaft: { x: 52, y: 93 },
  village: { x: 50, y: 66 } };
JC.world = WORLD;
const idx = (x, y) => y * MW + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
const tileAt = (x, y) => (inMap(x, y) ? WORLD.tiles[idx(x, y)] : T_DEEP);
const isWater = k => k === T_DEEP || k === T_WATER || k === T_LILY || k === T_RAPID;
/** Water-ish tiles that get the animated water and the shore foam (the stones, pads and plank bridge stand in water). */
const wet = k => isWater(k) || k === T_STONE || k === T_BRIDGE || k === T_PAD;
function hash(x, y, k) { let h = (x * 374761393 + y * 668265263 + (k || 0) * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
JC.hash = hash;

/* ---------- layout ---------- */
// The sports' arches: the tile you stand on to play; the arena lies behind it.
const ARCHES = {
  paddle: { x: 40, y: 56, champ: 'jada' }, leaf: { x: 18, y: 29, champ: 'kiki' }, seed: { x: 16, y: 59, champ: 'tico' },
  kick: { x: 17, y: 70, champ: 'mico' }, frog: { x: 78, y: 75, champ: 'rana' }, rapids: { x: 97, y: 48, champ: 'otters' }, vine: { x: 71, y: 22, champ: 'sloane' },
  dash: { x: 74, y: 58, champ: 'pecca' },
};
// The ways round the island (tiles). Ladders are two tiles wide; the shortcut ladder and the log bridge open later.
const ROUTES = {
  ladder: { x: 77, y0: 34, y1: 37 },                    // the long ladder up the cliffs (to the high grove)
  kickLadder: { x: 64, y0: 34, y1: 37 },                // the shortcut ladder, rolled up at the top until Cappy kicks it down
  gorgeX: 30, gorgeW: 3, ravineY: 40, ravineH: 3,       // the gorge (west) and the ravine (north-west)
  rope: { y: 60 },                                      // the rope bridge over the gorge (two tiles high)
  logY: 84,                                             // the shortcut log bridge over the gorge, pushed in from the west
  swing: { a: [16, 44], b: [16, 38], anchor: [19, 41] },// the vine swing over the ravine
  zip: { a: [68, 31], b: [53, 44] },                    // the zipline from the high grove down to the Kapok road
  ferryY: 50,                                           // the river ferry (its landings are found on the banks)
  cave: [[63, 69], [66, 69], [66, 77], [69, 77], [69, 73], [71, 73]], falls: { x: 72, y0: 73, y1: 74 },
};
WORLD.routes = ROUTES;
function paint(x0, y0, x1, y1, k) { for (let y = Math.max(0, y0); y <= Math.min(MH - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(MW - 1, x1); x++) WORLD.tiles[idx(x, y)] = k; }
function paintIf(x, y, k, onlyLand) { if (!inMap(x, y)) return; const c = WORLD.tiles[idx(x, y)]; if (onlyLand && isWater(c)) return; WORLD.tiles[idx(x, y)] = k; }
/** Paint only over dry land (not water) in a box. */
function paintLand(x0, y0, x1, y1, k) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) paintIf(x, y, k, true); }
function ellipse(cx, cy, rx, ry, k, onlyLand) { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1) paintIf(x, y, k, onlyLand); } }
/** A path of width w through points [[x, y], ...] (axis-aligned steps). */
function road(pts, k, w) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let j = 0; j < (w || 1); j++) paintIf(ax === bx ? x + j : x, ax === bx ? y : y + j, k, k !== T_PLANK && k !== T_STONE && k !== T_BRIDGE && k !== T_PAD);
  }
}
const riverX = y => 88 + Math.round(1.4 * Math.sin(y / 6.5));
function buildLayout() {
  const T = WORLD.tiles; T.fill(T_DEEP);
  // the island: a rounded square with a wobbly coast
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const a = Math.atan2(y - 50, x - 56), wob = 0.035 * Math.sin(a * 5 + 1) + 0.025 * Math.sin(a * 11 + 2) + 0.015 * Math.sin(a * 17);
    const dx = Math.abs(x - 56) / 54, dy = Math.abs(y - 50) / 48, d = Math.pow(dx * dx * dx * dx + dy * dy * dy * dy, 0.25) - wob;
    T[idx(x, y)] = d < 0.9 ? T_GRASS : d < 0.97 ? T_SAND : d < 1.04 ? T_WATER : T_DEEP;
  }
  // the river (north to south, east side): rapids up north; sandy banks
  for (let y = 0; y < MH; y++) { const cx = riverX(y); for (let x = cx - 2; x <= cx + 2; x++) if (!isWater(tileAt(x, y)) || tileAt(x, y) === T_WATER) paintIf(x, y, y < 28 ? T_RAPID : T_WATER); paintIf(cx - 3, y, T_SAND, true); paintIf(cx + 3, y, T_SAND, true); }
  // the high grove (north-east): a plateau ringed by cliffs; two ladders up its south face
  paintLand(62, 0, 80, 33, T_HIGH);
  paintLand(62, 34, 80, 37, T_CLIFF); paintLand(61, 0, 61, 37, T_CLIFF); paintLand(81, 0, 81, 37, T_CLIFF);
  for (let y = ROUTES.ladder.y0; y <= ROUTES.ladder.y1; y++) { paintIf(ROUTES.ladder.x, y, T_LADDER); paintIf(ROUTES.ladder.x + 1, y, T_LADDER); }
  for (let y = 9; y <= 20; y++) for (let x = 66; x <= 76; x++) if (tileAt(x, y) === T_HIGH) T[idx(x, y)] = T_DARK; // the giant grove floor
  // the gorge (west, north to south) and the ravine that joins it (north-west)
  paintLand(ROUTES.gorgeX, 0, ROUTES.gorgeX + ROUTES.gorgeW - 1, MH - 1, T_GORGE);
  paintLand(0, ROUTES.ravineY, ROUTES.gorgeX - 1, ROUTES.ravineY + ROUTES.ravineH - 1, T_GORGE);
  paint(ROUTES.gorgeX, ROUTES.rope.y, ROUTES.gorgeX + ROUTES.gorgeW - 1, ROUTES.rope.y + 1, T_ROPE);
  // the lagoon (west) with Tico's islet, and the stepping stones and lily pads that lead to it
  ellipse(16, 56, 11.8, 9.8, T_SAND, true); ellipse(16, 56, 11, 9, T_WATER);
  ellipse(16, 60, 4.6, 3.2, T_SAND); ellipse(16, 60, 3.4, 2.2, T_GRASS);
  for (let x = 21; x <= 26; x++) for (let y = 60; y <= 61; y++) if (isWater(tileAt(x, y))) T[idx(x, y)] = (x + (y & 1)) % 3 === 0 ? T_STONE : T_PAD;
  for (const [x, y] of [[9, 52], [12, 50], [21, 53], [8, 57], [23, 57]]) paintIf(x, y, T_LILY);
  // the hills (north-west) with the mud slope
  for (let y = 6; y <= 34; y++) for (let x = 2; x <= 29; x++) { const e = (x - 17) * (x - 17) / 120 + (y - 19) * (y - 19) / 60; if (e < 1 && tileAt(x, y) === T_GRASS) paintIf(x, y, T_HILL); }
  for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) if (tileAt(13 + (i >> 1) + j, 13 + i) === T_HILL) T[idx(13 + (i >> 1) + j, 13 + i)] = T_MUD;
  // the rocky ridge (south-east) with the cave through it, and the band of rock that closes Rana's grotto
  paintLand(63, 64, 71, MH - 1, T_ROCK);
  for (let y = 70; y <= 71; y++) for (let x = 72; x < riverX(y) - 2; x++) { const k = tileAt(x, y); if (!isWater(k)) T[idx(x, y)] = T_ROCK; }
  road(ROUTES.cave, T_CAVE, 2);
  for (let y = ROUTES.falls.y0; y <= ROUTES.falls.y1; y++) paintIf(ROUTES.falls.x, y, T_FALLS);
  // the village clearing and the roads (dirt), the boardwalk and the dock (planks)
  ellipse(50, 63, 6.6, 6.2, T_PATH);
  road([[50, 57], [50, 25]], T_PATH, 2);                                   // north to the Great Kapok
  road([[44, 62], [36, 62], [36, 60], [33, 60]], T_PATH, 2);               // west to the rope bridge
  road([[40, 61], [40, 57]], T_PATH, 2);                                   // the canopy court
  road([[29, 60], [26, 60]], T_PATH, 2);                                   // over the bridge, to the stones
  road([[28, 59], [28, 46], [16, 46], [16, 45]], T_PATH, 2);               // north to the vine swing
  road([[16, 37], [16, 31], [18, 31], [18, 30]], T_PATH, 2);               // the hills, to Kiki's arch
  road([[28, 62], [28, 68], [17, 68], [17, 69]], T_PATH, 2);               // south to the pitch
  road([[28, 69], [28, ROUTES.logY]], T_PATH, 2);                          // on to the log over the gorge
  road([[33, ROUTES.logY], [49, ROUTES.logY]], T_PATH, 2);                 // ...and back to the boardwalk
  road([[51, 38], [80, 38]], T_PATH, 2);                                   // along the foot of the cliffs
  road([[77, 33], [77, 25], [71, 25], [71, 23]], T_PATH, 2);               // up top, to Sloane's grove
  road([[57, 63], [61, 63], [61, 69], [62, 69]], T_PATH, 2);               // east to the cave mouth
  road([[73, 73], [78, 73], [78, 74]], T_PATH, 2);                         // the grotto, from the waterfall
  road([[80, 40], [80, 60], [74, 60], [74, 59]], T_MUDT, 2);               // the mud trail down to the clearing
  const fy = ROUTES.ferryY;
  road([[82, fy], [riverX(fy) - 3, fy]], T_MUDT, 2);                       // ...and the branch to the ferry
  road([[riverX(fy) + 3, fy], [94, fy], [94, 49], [97, 49]], T_PATH, 2);   // the east bank, to the canoes
  ellipse(50.5, 96, 9, 4.2, T_SAND, true); ellipse(50.5, 96.6, 8, 3.4, T_WATER); // the little bay at the dock
  road([[50, 69], [50, 88]], T_PLANK, 2);
  road([[49, 88], [49, 95]], T_PLANK, 3);
  // arenas
  { const a = ARCHES.paddle; paint(a.x - 4, a.y - 5, a.x + 4, a.y - 1, T_COURT); for (let y = a.y - 5; y <= a.y - 1; y++) for (let x = a.x - 5; x <= a.x + 5; x++) if (tileAt(x, y) === T_GRASS) T[idx(x, y)] = T_DARK; }
  { const a = ARCHES.kick; paint(a.x - 8, a.y + 2, a.x + 8, a.y + 9, T_PITCH); }
  { const a = ARCHES.frog; ellipse(a.x, a.y + 5, 4.2, 3.2, T_SAND, true); ellipse(a.x, a.y + 5.3, 3.2, 2.3, T_WATER); paintIf(a.x - 1, a.y + 5, T_LILY); paintIf(a.x + 1, a.y + 6, T_LILY); }
  // the muddy clearing (dash) behind its arch: trampled dirt with mud puddles
  const da = ARCHES.dash;
  ellipse(da.x + 0.2, da.y - 5.5, 3.4, 4.6, T_PATH, true);
  for (const [dx, dy] of [[-2, -8], [2, -4], [1, -9]]) paintIf(da.x + dx, da.y + dy, T_MUD, true);
  // flower meadows
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const k = tileAt(x, y); if ((k === T_GRASS || k === T_HIGH) && hash(x, y, 3) < 0.07 + 0.08 * (Math.sin(x / 4) * Math.cos(y / 5) > 0.5 ? 1 : 0)) WORLD.tiles[idx(x, y)] = T_FLOWER; }
  WORLD.ferry = ferryLandings();
}
/** The ferry's two landings: the last dry tile on each bank of the river on the ferry row. */
function ferryLandings() {
  const y = ROUTES.ferryY; let x0 = 0, x1 = 0;
  for (let x = 82; x < MW; x++) if (isWater(tileAt(x, y))) { x0 = x - 1; break; }
  for (let x = x0 + 1; x < MW; x++) if (!isWater(tileAt(x, y))) { x1 = x; break; }
  return { a: [x0, y], b: [x1, y] };
}
/** The shortcuts change the map: the kicked-down ladder and the pushed log. Called whenever the flags may have changed. */
function applyShortcuts() {
  const f = SAVE.data.flags, L = ROUTES.kickLadder, gx = ROUTES.gorgeX;
  for (let y = L.y0; y <= L.y1; y++) { setTile(L.x, y, f.scLadder ? T_LADDER : T_CLIFF); setTile(L.x + 1, y, f.scLadder ? T_LADDER : T_CLIFF); }
  for (let x = gx; x < gx + ROUTES.gorgeW; x++) for (let y = ROUTES.logY; y <= ROUTES.logY + 1; y++) setTile(x, y, f.scLog ? T_LOG : T_GORGE);
}
WORLD.applyShortcuts = applyShortcuts;
function setTile(x, y, k) {
  if (!inMap(x, y)) return; const i = idx(x, y);
  if (WORLD.tiles[i] === k) return;
  WORLD.tiles[i] = k; WORLD.solid[i] = WALKABLE[k] ? 0 : 1;
  WORLD.invalidate(x - 1, y - 2, x + 1, y + 2);
}
WORLD.setTile = setTile;

/* ---------- objects ---------- */
// { k: kind, x, y (tile of the base), w (solid width in tiles, left from x), id?, col?, flip? }
function addObj(o) { WORLD.objects.push(o); return o; }
const KEEP = new Uint8Array(MW * MH); // tiles kept clear of trees
function keep(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inMap(x, y)) KEEP[idx(x, y)] = 1; }
// signposts: where they stand, what they say, and the sports whose icons point the way
const POSTS = [
  { x: 43, y: 60, key: 'sign.west', icons: ['paddle', 'seed', 'kick', 'leaf'] },
  { x: 52, y: 55, key: 'sign.north', icons: ['vine'] },
  { x: 57, y: 61, key: 'sign.east', icons: ['frog', 'dash', 'rapids'] },
  { x: 26, y: 58, key: 'sign.junction', icons: ['leaf', 'seed', 'kick'] },
  { x: 60, y: 67, key: 'sign.cave', icons: ['frog'] },
  { x: 83, y: 48, key: 'sign.ferry', icons: ['rapids'] },
  { x: 79, y: 40, key: 'sign.cliff', icons: ['vine'] },
];
// glowing mushrooms along the cave walls
const SHROOMS = [[63, 71], [65, 68], [67, 72], [65, 75], [67, 79], [68, 76], [70, 75], [70, 72]];
function buildObjects() {
  WORLD.objects.length = 0; WORLD.npcs.length = 0; WORLD.items.length = 0; WORLD.signs.length = 0; KEEP.fill(0); TREE_SPOTS.fill(0);
  // the Great Kapok and its vine lift
  addObj({ k: 'kapok', x: 50, y: 22 }); keep(42, 10, 58, 27);
  addObj({ k: 'lift', x: 50, y: 23 });
  // the village: the Cup Totem, huts on stilts, lanterns
  addObj({ k: 'totem', x: 50, y: 62 }); keep(43, 56, 57, 70);
  addObj({ k: 'hut', x: 45, y: 59, roof: '#c9a050' }); addObj({ k: 'hut', x: 55, y: 59, roof: '#b88a3a' });
  addObj({ k: 'hut', x: 45, y: 67, roof: '#b88a3a' }); addObj({ k: 'hut', x: 55, y: 67, roof: '#d4ac5c', shop: true });
  for (const [x, y] of [[47, 63], [53, 63], [50, 58]]) addObj({ k: 'lantern', x, y });
  // the dock: signs and the raft
  keep(44, 84, 56, 99);
  WORLD.signs.push({ x: 48, y: 86, key: 'sign.welcome' }, { x: 53, y: 86, key: 'sign.village' });
  for (const s of WORLD.signs) addObj({ k: 'sign', x: s.x, y: s.y });
  WORLD.signs.push({ x: 48, y: 26, key: 'sign.kapok' }); addObj({ k: 'sign', x: 48, y: 26 });
  for (const p of POSTS) { WORLD.signs.push({ x: p.x, y: p.y, key: p.key }); addObj({ k: 'post', x: p.x, y: p.y, icons: p.icons }); keep(p.x - 1, p.y - 1, p.x + 1, p.y + 1); }
  // the arches and their arenas
  for (const id in ARCHES) { const a = ARCHES[id]; WORLD.arches[id] = a; addObj({ k: 'arch', x: a.x, y: a.y, id, col: SPORT_COLOURS[id] }); keep(a.x - 2, a.y - 2, a.x + 2, a.y + 2); }
  { const a = ARCHES.paddle; addObj({ k: 'table', x: a.x, y: a.y - 3 }); keep(a.x - 5, a.y - 6, a.x + 5, a.y); }
  { const a = ARCHES.kick; addObj({ k: 'goal', x: a.x - 6, y: a.y + 5 }); addObj({ k: 'goal', x: a.x + 6, y: a.y + 5, flip: true }); keep(a.x - 9, a.y - 1, a.x + 9, a.y + 10); }
  { const a = ARCHES.seed; addObj({ k: 'targets', x: a.x - 1, y: a.y - 7 }); keep(a.x - 5, a.y - 3, a.x + 5, a.y + 5); }
  { const a = ARCHES.rapids; addObj({ k: 'canoe', x: a.x - 2, y: a.y - 2 }); addObj({ k: 'canoe', x: a.x + 2, y: a.y - 2, col: '#3fb7ff' }); keep(a.x - 4, a.y - 5, a.x + 4, a.y + 2); }
  { const a = ARCHES.frog; for (const [dx, dy] of [[-3, 2], [-2, 1], [2, 1], [3, 2]]) addObj({ k: 'log', x: a.x + dx, y: a.y + dy }); addObj({ k: 'drums', x: a.x, y: a.y + 2 }); keep(a.x - 5, a.y - 2, a.x + 5, a.y + 9); }
  { const a = ARCHES.leaf; addObj({ k: 'sled', x: a.x + 2, y: a.y - 1 }); keep(a.x - 3, a.y - 2, a.x + 3, a.y + 3); }
  { const a = ARCHES.dash; for (const [dx, dy] of [[-2, -5], [2, -7]]) addObj({ k: 'log', x: a.x + dx, y: a.y + dy }); addObj({ k: 'mangoes', x: a.x, y: a.y - 10 }); keep(a.x - 4, a.y - 12, a.x + 4, a.y + 2); }
  { const a = ARCHES.vine; for (const [dx, dy] of [[-4, -9], [2, -11], [-2, -4], [3, -5]]) { const x = a.x + dx, y = a.y + dy; addObj({ k: 'giant', x, y }); keep(x - 1, y - 3, x + 1, y + 1); } keep(a.x - 3, a.y - 3, a.x + 3, a.y + 2); }
  // the ways round: the zipline poles, the ferry posts, the swing tree, the rolled-up ladder, the log to push, the cave
  addObj({ k: 'zippole', x: ROUTES.zip.a[0] + 1, y: ROUTES.zip.a[1], tall: true }); addObj({ k: 'zippole', x: ROUTES.zip.b[0] + 1, y: ROUTES.zip.b[1] });
  keep(ROUTES.zip.a[0] - 2, ROUTES.zip.a[1] - 2, ROUTES.zip.a[0] + 2, ROUTES.zip.a[1] + 2); keep(ROUTES.zip.b[0] - 2, ROUTES.zip.b[1] - 2, ROUTES.zip.b[0] + 2, ROUTES.zip.b[1] + 2);
  for (const L of [ROUTES.ladder, ROUTES.kickLadder]) keep(L.x - 2, L.y0 - 3, L.x + 3, L.y1 + 2);
  addObj({ k: 'rolled', x: ROUTES.kickLadder.x, y: ROUTES.kickLadder.y0 - 1 });
  { const F = WORLD.ferry; addObj({ k: 'ferrypost', x: F.a[0], y: F.a[1] - 1 }); addObj({ k: 'ferrypost', x: F.b[0], y: F.b[1] - 1 }); keep(F.a[0] - 2, F.a[1] - 2, F.b[0] + 2, F.b[1] + 2); }
  addObj({ k: 'swingtree', x: ROUTES.swing.anchor[0] + 1, y: ROUTES.ravineY + ROUTES.ravineH }); keep(12, ROUTES.ravineY - 3, 21, ROUTES.ravineY + ROUTES.ravineH + 3);
  addObj({ k: 'pushlog', x: ROUTES.gorgeX - 1, y: ROUTES.logY }); keep(ROUTES.gorgeX - 3, ROUTES.logY - 2, ROUTES.gorgeX + ROUTES.gorgeW + 2, ROUTES.logY + 3);
  keep(ROUTES.gorgeX - 3, ROUTES.rope.y - 2, ROUTES.gorgeX + ROUTES.gorgeW + 2, ROUTES.rope.y + 3);
  for (const [x, y] of SHROOMS) addObj({ k: 'shroom', x, y, v: (hash(x, y, 5) * 3) | 0 });
  keep(60, 63, 63, 71); keep(71, 71, 80, 76);
  // keep the roads clear
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const k = tileAt(x, y); if (k === T_PATH || k === T_PLANK || k === T_BRIDGE || k === T_STONE || k === T_MUDT || k === T_ROPE || k === T_PAD) keep(x - 1, y - 1, x + 1, y + 1); }
  // trees, palms, bushes and rocks
  for (let y = 2; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    if (KEEP[idx(x, y)]) continue;
    const k = tileAt(x, y), r = hash(x, y, 1);
    if (k === T_GRASS || k === T_FLOWER || k === T_DARK || k === T_HIGH) {
      const dense = k === T_DARK ? 0.25 : 0.14;
      // no tree right on a cliff's lip or a gorge's rim (they would hide the edge)
      const rim = tileAt(x, y + 1) === T_CLIFF || tileAt(x, y + 1) === T_GORGE || tileAt(x, y - 1) === T_GORGE || tileAt(x - 1, y) === T_GORGE || tileAt(x + 1, y) === T_GORGE;
      if (rim) continue;
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
  // drawn from the top of the map down so lower things overlap higher ones
  WORLD.objects.sort((a, b) => a.y - b.y || a.x - b.x);
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
    case 'raft': case 'targets': case 'rolled': case 'pushlog': case 'shroom': case 'ferrypost': return [];
    case 'canoe': return [[0, 0], [1, 0]];
    case 'drums': return [[-1, 0], [0, 0], [1, 0]];
    case 'giant': return [[0, 0], [-1, 0], [1, 0]];
    case 'sled': return [[0, 0]];
    case 'swingtree': return [[0, 0], [1, 0]];
    default: return [[0, 0]];
  }
}
JC.footprint = footprint;
WORLD.isSolid = (x, y) => !inMap(x, y) || WORLD.solid[idx(x, y)] === 1;
WORLD.tileAt = tileAt;
WORLD.T = { CLIFF: T_CLIFF, LADDER: T_LADDER, GORGE: T_GORGE, ROPE: T_ROPE, ROCK: T_ROCK, CAVE: T_CAVE, MUDT: T_MUDT, PAD: T_PAD, FALLS: T_FALLS, HIGH: T_HIGH, LOG: T_LOG, STONE: T_STONE, WATER: T_WATER, SAND: T_SAND };

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
    case T_HIGH: {
      // the high grove's grass: a little lighter and warmer, so the plateau reads as higher ground
      const base = '#5fb447'; g.fillStyle = base; g.fillRect(0, 0, TS, TS);
      dots(10, shade(base, -0.18)); dots(6, shade(base, 0.22));
      for (let i = 0; i < 2 + v % 2; i++) tuft(1 + ((R() * 12) | 0), 2 + ((R() * 12) | 0), shade(base, 0.32));
      break;
    }
    case T_CLIFF: case T_LADDER: {
      // a rock face in layers (the ladder's rails and rungs go over it; v: 0 = the ladder's left tile, 1 = its right)
      g.fillStyle = '#8a7a68'; g.fillRect(0, 0, TS, TS);
      for (let y = 2 + (v & 1); y < TS; y += 5) { g.fillStyle = '#6e5e4e'; g.fillRect(0, y, TS, 1); g.fillStyle = '#a2927e'; g.fillRect(0, y + 1, TS, 1); }
      dots(6, '#5e5040', 2, 1); dots(5, '#b8a890');
      if (kind === T_LADDER) {
        const l = v === 1 ? -2 : 2;   // the rails are on the ladder's outer edges
        g.fillStyle = '#3b2416'; g.fillRect(v === 1 ? 12 : 1, 0, 3, TS);
        g.fillStyle = '#8a5a33'; g.fillRect(v === 1 ? 13 : 2, 0, 1, TS);
        for (let y = 1; y < TS; y += 4) { g.fillStyle = '#3b2416'; g.fillRect(v === 1 ? 0 : 3, y, 13, 3); g.fillStyle = '#c48a4c'; g.fillRect(v === 1 ? 0 : 3, y, 13, 1); g.fillStyle = '#a8703e'; g.fillRect(v === 1 ? 0 : 3, y + 1, 13, 1); }
        void l;
      }
      break;
    }
    case T_GORGE: case T_ROPE: case T_LOG: {
      // a deep ravine (dark, with a rushing stream far below; v: 1 the stream runs down, 2 across, 3 both), with the
      // rope bridge's planks or the pushed log over it
      g.fillStyle = '#24160d'; g.fillRect(0, 0, TS, TS); dots(8, '#3b2416', 2, 1); dots(4, '#4a3020');
      // far below, the stream rushes along the gorge's floor
      const sw = '#3a8ec4', fl = frame ? '#e8fbff' : '#a8e0fa';
      if (v & 1) { g.fillStyle = '#1b3a52'; g.fillRect(3, 0, 10, TS); g.fillStyle = sw; g.fillRect(4, 0, 8, TS); g.fillStyle = fl; for (let i = 0; i < 4; i++) g.fillRect(5 + (i * 2 + frame) % 6, (i * 5 + frame * 3) % TS, 1, 3); }
      if (v & 2) { g.fillStyle = '#1b3a52'; g.fillRect(0, 3, TS, 10); g.fillStyle = sw; g.fillRect(0, 4, TS, 8); g.fillStyle = fl; for (let i = 0; i < 4; i++) g.fillRect((i * 5 + frame * 3) % TS, 5 + (i * 2 + frame) % 6, 3, 1); }
      if (kind === T_ROPE) {
        for (let x = 0; x < TS; x += 4) { g.fillStyle = '#3b2416'; g.fillRect(x, 1, 4, 14); g.fillStyle = (x / 4 + v) % 2 ? '#b07a44' : '#c48a4c'; g.fillRect(x, 2, 3, 12); g.fillStyle = '#e0b070'; g.fillRect(x, 2, 3, 1); }
        g.fillStyle = '#e8d6a0'; g.fillRect(0, 0, TS, 1); g.fillRect(0, TS - 1, TS, 1);
      }
      if (kind === T_LOG) {
        g.fillStyle = OUT; g.fillRect(0, 1, TS, 14); g.fillStyle = '#8a5a33'; g.fillRect(0, 2, TS, 12); g.fillStyle = '#b07a44'; g.fillRect(0, 3, TS, 2);
        g.fillStyle = '#5e3820'; for (let i = 0; i < 3; i++) g.fillRect((i * 6 + v * 3) % 14, 7 + (i % 2) * 3, 4, 1);
      }
      break;
    }
    case T_ROCK: {
      // a jumble of boulders with moss between them (reads as rough high ground, not a road)
      g.fillStyle = '#4e463e'; g.fillRect(0, 0, TS, TS);
      for (const [bx, by, r] of [[4 + v, 4, 4], [12, 6 + (v & 1), 4], [6, 12, 4], [13, 13, 3]]) { disc(g, bx, by + 1, r, '#3a332c'); disc(g, bx, by, r, '#8a7e70'); disc(g, bx - 1, by - 1, Math.max(1, r - 2), '#a89c8c'); }
      g.fillStyle = '#4f8a3a'; g.fillRect(8 + (v & 1), 8, 2, 1); g.fillRect(1, 9 - v, 2, 1); g.fillRect(10, 1 + v, 2, 1);
      break;
    }
    case T_CAVE: case T_FALLS: {
      const base = kind === T_FALLS ? '#46566a' : '#3a3046';
      g.fillStyle = base; g.fillRect(0, 0, TS, TS); dots(8, shade(base, 0.15), 2, 1); dots(6, shade(base, -0.25));
      if (kind === T_FALLS) { g.fillStyle = '#7fb0d8'; g.fillRect(2 + v, 4, 3, 1); g.fillRect(9, 10 - v, 4, 1); }
      break;
    }
    case T_MUDT: {
      g.fillStyle = '#86562f'; g.fillRect(0, 0, TS, TS); dots(9, '#6a4224', 2, 1); dots(5, '#a8703e', 2, 1);
      if (v % 2 === 0) { oval(g, 5 + v, 9, 4, 2, '#5e3a1e'); oval(g, 5 + v, 9, 3, 1, '#7a6a5a'); g.fillStyle = '#c8b8a0'; g.fillRect(4 + v, 8, 2, 1); }
      g.fillStyle = '#5e3a1e'; g.fillRect(11, 3 + v, 2, 2); g.fillRect(13, 5 + v, 2, 2);  // footprints in the mud
      break;
    }
    case T_PAD: {
      g.fillStyle = '#3393cc'; g.fillRect(0, 0, TS, TS);
      g.fillStyle = '#55b4e0'; g.fillRect((v * 5 + frame * 3) % 12, 2, 4, 1); g.fillRect((v * 3 + frame * 5) % 12, 13, 3, 1);
      disc(g, 8, 8, 7, '#1f6a2e'); disc(g, 8, 8, 6, '#3fa844'); disc(g, 7, 7, 4, '#5cc04a');
      g.fillStyle = '#3393cc'; g.fillRect(8, 2, 1, 6); g.fillRect(9, 3, 1, 5);
      if (v === 1) { disc(g, 5, 10, 2, '#ff9ac8'); g.fillStyle = '#fff'; g.fillRect(5, 10, 1, 1); }
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
    case 'post': {
      // a signpost: arrow boards, each with a sport's icon (so the way reads without words)
      shadowOval(g, px + 8, py + 14, 6, 2); rect(g, px + 6, py - 14, 4, 29, OUT); rect(g, px + 7, py - 14, 2, 28, '#7a4a26');
      o.icons.forEach((id, i) => {
        const left = i % 2 === 1, by = py - 14 + i * 7, bx = left ? px - 8 : px + 6, w = 18;
        rect(gt, bx, by, w, 8, OUT); rect(gt, bx + 1, by + 1, w - 2, 6, '#c48a4c'); rect(gt, bx + 1, by + 1, w - 2, 1, '#e0b070');
        // the arrow tip
        const tx = left ? bx - 3 : bx + w; rect(gt, tx, by + 2, 3, 4, OUT); rect(gt, left ? tx + 1 : tx, by + 3, 2, 2, '#c48a4c');
        disc(gt, left ? bx + 5 : bx + w - 6, by + 4, 3, SPORT_COLOURS[id]);
        const ic = iconSprite(id); rect(gt, left ? bx + 9 : bx + 3, by + 2, 6, 4, '#e8cfa0'); spr(gt, ic, (left ? bx + 9 : bx + 3) + 3 - (ic.w >> 1), by + 1);
      });
      break;
    }
    case 'zippole': {
      const h = o.tall ? 38 : 24;
      shadowOval(g, px + 8, py + 14, 6, 2); rect(g, px + 5, py + 14 - h, 6, h, OUT); rect(g, px + 6, py + 14 - h, 4, h - 1, '#8a5a33'); rect(g, px + 6, py + 14 - h, 1, h - 1, '#b07a44');
      rect(gt, px + 2, py + 12 - h, 12, 4, OUT); rect(gt, px + 3, py + 13 - h, 10, 2, '#5e3820');
      if (o.tall) { rect(g, px + 1, py + 6, 14, 9, OUT); rect(g, px + 2, py + 7, 12, 7, '#a8703e'); for (let i = 0; i < 3; i++) rect(g, px + 2, py + 8 + i * 2, 12, 1, '#7a4a26'); }
      break;
    }
    case 'ferrypost': rect(g, px + 6, py + 2, 4, 14, OUT); rect(g, px + 7, py + 2, 2, 13, '#7a4a26'); rect(g, px + 5, py + 1, 6, 3, '#5e3820'); break;
    case 'swingtree': {
      // a big leaning tree on the ravine's south rim; its branch reaches over the ravine and holds the swinging vine
      drawTreeBase(g, px, py, 0); drawTreeBase(g, px + 10, py, 1);
      const ax = ROUTES.swing.anchor[0] * TS + 8, ay = ROUTES.swing.anchor[1] * TS - 34;
      for (let i = 0; i <= 20; i++) { const x = Math.round(px + 12 + (ax - px - 12) * i / 20), y = Math.round(py - 14 + (ay - py + 14) * i / 20 - Math.sin(i / 20 * Math.PI) * 8); rect(gt, x - 2, y - 2, 5, 5, OUT); rect(gt, x - 1, y - 1, 3, 3, '#7a4a26'); }
      canopy(gt, px + 12, py - 22, 16, TREE_COLS[0]); canopy(gt, ax + 6, ay - 6, 9, TREE_COLS[1]);
      break;
    }
    case 'rolled': if (!SAVE.data.flags.scLadder) {
      // the shortcut ladder, rolled up on the cliff's lip (Cappy kicks it down from up here)
      const x = px + 2, y = py + 8; rect(gt, x - 1, y - 1, 30, 10, OUT);
      for (let i = 0; i < 28; i += 4) { rect(gt, x + i, y, 3, 8, '#a8703e'); rect(gt, x + i, y, 3, 2, '#c48a4c'); }
      rect(gt, x, y + 3, 28, 1, '#5e3820'); disc(gt, x + 4, y + 4, 3, '#7a4a26'); disc(gt, x + 24, y + 4, 3, '#7a4a26');
    } break;
    case 'pushlog': if (!SAVE.data.flags.scLog) {
      // a big log on the gorge's west rim, ready to be pushed over as a bridge
      const x = px - 2, y = py + 2; shadowOval(g, x + 10, y + 26, 12, 3);
      rect(g, x + 4, y - 2, 12, 30, OUT); rect(g, x + 5, y - 1, 10, 28, '#8a5a33'); rect(g, x + 5, y - 1, 2, 28, '#b07a44');
      oval(g, x + 10, y - 1, 5, 3, OUT); oval(g, x + 10, y - 1, 4, 2, '#c99a6a'); rect(g, x + 9, y - 2, 2, 1, '#8a5a33');
    } break;
    case 'shroom': {
      const cols = [['#7affc8', '#2a8a6a'], ['#b48aff', '#5a3aa0'], ['#ffd27a', '#a0702a']][o.v];
      for (const [dx, dy, r] of [[3, 10, 3], [9, 12, 2], [12, 8, 2]]) { rect(g, px + dx, py + dy, 1, 3, '#d8d0c0'); disc(g, px + dx, py + dy - 1, r, cols[1]); disc(g, px + dx, py + dy - 2, r - 1, cols[0]); }
      break;
    }
    case 'raft': break; // drawn live (it bobs, and carries Cappy's flag)
    case 'lift': break; // drawn live (it opens)
  }
}

/* ---------- the island in chunks, drawn on demand ---------- */
const CH = 256, CT = CH / TS, CHUNK_MAX = 30;
const CHUNKS = new Map(), CHUNK_POOL = [];
let CHUNK_TICK = 0;
const DUMMY = canvas(1, 1).getContext('2d');
const noFoam = k => wet(k) || k === T_PLANK;
function gorgeV(x, y) { return (x === ROUTES.gorgeX + 1 ? 1 : 0) | (y === ROUTES.ravineY + 1 && x < ROUTES.gorgeX + 2 ? 2 : 0); }
function tileVariant(k, x, y) {
  if (k === T_PITCH) return (x >> 1) % 2;
  if (k === T_LADDER || k === T_CLIFF) return k === T_LADDER ? (tileAt(x - 1, y) === T_LADDER ? 1 : 0) : (y & 1);
  if (k === T_GORGE || k === T_ROPE || k === T_LOG) return gorgeV(x, y);
  return (hash(x, y, 7) * 4) | 0;
}
function takeChunk() {
  if (CHUNKS.size >= CHUNK_MAX) {
    let oldK = -1, oldU = Infinity;
    CHUNKS.forEach((c, k) => { if (c.used < oldU) { oldU = c.used; oldK = k; } });
    const c = CHUNKS.get(oldK); CHUNKS.delete(oldK); CHUNK_POOL.push(c);
  }
  return CHUNK_POOL.pop() || { g0: canvas(CH, CH), g1: canvas(CH, CH), ov: canvas(CH, CH), cx: 0, cy: 0, used: 0 };
}
function renderChunk(cx, cy) {
  const ch = takeChunk(); ch.cx = cx; ch.cy = cy;
  const ox = cx * CH, oy = cy * CH;
  const c0 = ch.g0.getContext('2d'), c1 = ch.g1.getContext('2d'), co = ch.ov.getContext('2d');
  co.setTransform(1, 0, 0, 1, 0, 0); co.clearRect(0, 0, CH, CH);
  for (const c of [c0, c1, co]) c.setTransform(1, 0, 0, 1, -ox, -oy);
  const tx0 = cx * CT, ty0 = cy * CT;
  for (const [c, f] of [[c0, 0], [c1, 1]]) {
    for (let y = ty0; y < ty0 + CT; y++) for (let x = tx0; x < tx0 + CT; x++) {
      const k = tileAt(x, y);
      c.drawImage(tileCanvas(k, tileVariant(k, x, y), f), x * TS, y * TS);
      // shore foam on water next to land; dark lip under land edges
      if (wet(k)) {
        c.fillStyle = f ? '#d8f6ff' : '#ffffff';
        if (!noFoam(tileAt(x, y - 1))) { c.fillStyle = '#1b4a6e'; c.fillRect(x * TS, y * TS, TS, 2); c.fillStyle = f ? '#d8f6ff' : '#ffffff'; for (let i = f; i < TS; i += 3) c.fillRect(x * TS + i, y * TS + 2 + ((i + f) % 2), 2, 1); }
        if (!noFoam(tileAt(x, y + 1))) for (let i = 1 - f; i < TS; i += 3) c.fillRect(x * TS + i, y * TS + TS - 2 - ((i + f) % 2), 2, 1);
        if (!noFoam(tileAt(x - 1, y))) for (let i = f; i < TS; i += 3) c.fillRect(x * TS + 1 + ((i + f) % 2), y * TS + i, 1, 2);
        if (!noFoam(tileAt(x + 1, y))) for (let i = 1 - f; i < TS; i += 3) c.fillRect(x * TS + TS - 2 - ((i + f) % 2), y * TS + i, 1, 2);
      }
    }
  }
  // edges that do not animate: sand meets grass, hill and cliff edges, the gorge's rims, rock tops, plank posts
  const isCliff = k => k === T_CLIFF || k === T_LADDER, isGorge = k => k === T_GORGE || k === T_ROPE || k === T_LOG;
  for (let y = ty0; y < ty0 + CT; y++) for (let x = tx0; x < tx0 + CT; x++) {
    const k = tileAt(x, y), px = x * TS, py = y * TS, up = tileAt(x, y - 1), dn = tileAt(x, y + 1), lf = tileAt(x - 1, y), rt = tileAt(x + 1, y);
    for (const c of [c0, c1]) {
      if (k === T_HILL && dn !== T_HILL && dn !== T_MUD) { c.fillStyle = '#8a6a4a'; c.fillRect(px, py + 9, TS, 7); c.fillStyle = '#6e5238'; c.fillRect(px, py + 13, TS, 3); c.fillStyle = '#a8886a'; c.fillRect(px + (x % 3) * 5, py + 10, 3, 1); c.fillStyle = OUT; c.fillRect(px, py + 8, TS, 1); }
      if (k === T_HILL && up !== T_HILL && up !== T_DEEP) { c.fillStyle = '#7cc84a'; c.fillRect(px, py, TS, 1); }
      if (k === T_HILL && lf !== T_HILL) { c.fillStyle = '#3d7a2e'; c.fillRect(px, py, 2, TS); }
      if (k === T_HILL && rt !== T_HILL) { c.fillStyle = '#3d7a2e'; c.fillRect(px + TS - 2, py, 2, TS); }
      if ((k === T_GRASS || k === T_FLOWER || k === T_DARK) && up === T_HILL) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(px, py, TS, 4); }
      // the cliffs: a grassy lip at the top, a shadow at the foot, darker sides
      if (isCliff(k) && !isCliff(up)) { c.fillStyle = '#3d7a2e'; c.fillRect(px, py, TS, 3); c.fillStyle = '#7cc84a'; c.fillRect(px, py, TS, 1); c.fillStyle = OUT; c.fillRect(px, py + 3, TS, 1); }
      if (isCliff(k) && !isCliff(dn)) { c.fillStyle = '#4e4034'; c.fillRect(px, py + 13, TS, 3); }
      if (k === T_CLIFF && !isCliff(lf)) { c.fillStyle = '#6a5a4a'; c.fillRect(px, py, 2, TS); }
      if (k === T_CLIFF && !isCliff(rt)) { c.fillStyle = '#6a5a4a'; c.fillRect(px + TS - 2, py, 2, TS); }
      if (!isCliff(k) && isCliff(up) && k !== T_LADDER) { c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(px, py, TS, 5); }
      if (k === T_HIGH && tileAt(x, y + 1) !== T_HIGH && !isCliff(dn) && dn !== T_FLOWER && dn !== T_DARK) { c.fillStyle = '#3d8a33'; c.fillRect(px, py + 15, TS, 1); }
      // the gorge: rock rims where the land drops away, and the far wall's face
      if (isGorge(k)) {
        if (!isGorge(up)) { c.fillStyle = '#5e4a38'; c.fillRect(px, py, TS, 6); c.fillStyle = '#7d6a56'; c.fillRect(px, py, TS, 2); c.fillStyle = '#3b2c20'; c.fillRect(px, py + 6, TS, 1); }
        if (!isGorge(dn)) { c.fillStyle = '#8a7a68'; c.fillRect(px, py + 13, TS, 3); c.fillStyle = '#4fa83f'; c.fillRect(px, py + 15, TS, 1); }
        if (!isGorge(lf)) { c.fillStyle = '#6a5848'; c.fillRect(px, py, 3, TS); c.fillStyle = '#9a8a76'; c.fillRect(px, py, 1, TS); }
        if (!isGorge(rt)) { c.fillStyle = '#6a5848'; c.fillRect(px + TS - 3, py, 3, TS); c.fillStyle = '#9a8a76'; c.fillRect(px + TS - 1, py, 1, TS); }
      }
      // the ridge: a grassy top edge and a rock face where it meets lower ground
      if (k === T_ROCK && up !== T_ROCK) { c.fillStyle = '#3d8a33'; c.fillRect(px, py, TS, 3); c.fillStyle = '#6cc84a'; c.fillRect(px, py, TS, 1); for (let i = 1; i < TS; i += 4) c.fillRect(px + i, py + 3, 1, 1); }
      if (k === T_ROCK && dn !== T_ROCK) { c.fillStyle = '#5e5246'; c.fillRect(px, py + 10, TS, 6); c.fillStyle = '#4a4038'; c.fillRect(px, py + 14, TS, 2); }
      if ((k === T_CAVE || k === T_FALLS) && up === T_ROCK) { c.fillStyle = '#211a2a'; c.fillRect(px, py, TS, 4); }
      if ((k === T_CAVE || k === T_FALLS) && lf === T_ROCK) { c.fillStyle = '#2a2234'; c.fillRect(px, py, 2, TS); }
      if ((k === T_CAVE || k === T_FALLS) && rt === T_ROCK) { c.fillStyle = '#2a2234'; c.fillRect(px + TS - 2, py, 2, TS); }
      if (k === T_PLANK) { const wat = isWater(dn) || isWater(lf) || isWater(rt); if (wat && (x + y) % 2 === 0) { c.fillStyle = '#3b2416'; c.fillRect(px + 1, py + 12, 3, 4); c.fillRect(px + TS - 4, py + 12, 3, 4); } }
      if (k === T_PITCH) { c.fillStyle = '#f4f8ec'; if (up !== T_PITCH) c.fillRect(px, py + 2, TS, 1); if (dn !== T_PITCH) c.fillRect(px, py + 13, TS, 1); if (lf !== T_PITCH) c.fillRect(px + 2, py, 1, TS); if (rt !== T_PITCH) c.fillRect(px + 13, py, 1, TS); if (x === ARCHES.kick.x) c.fillRect(px + 7, py, 2, TS); }
      if ((k === T_GRASS || k === T_FLOWER) && dn === T_SAND) { c.fillStyle = '#3d8a33'; c.fillRect(px, py + 15, TS, 1); }
      if ((k === T_PATH || k === T_COURT || k === T_MUDT) && (up === T_GRASS || up === T_FLOWER || up === T_DARK || up === T_HIGH)) { c.fillStyle = '#4fa83f'; for (let i = 0; i < TS; i += 2) c.fillRect(px + i, py, 1, 1 + ((i * 7 + x) % 3 === 0 ? 1 : 0)); }
    }
  }
  { // the centre circle of the pitch
    const a = ARCHES.kick, px = a.x * TS + 8, py = (a.y + 5) * TS + 8;
    if (px + 16 > ox && px - 16 < ox + CH && py + 16 > oy && py - 16 < oy + CH) for (const c of [c0, c1]) { disc(c, px, py, 14, '#f4f8ec'); disc(c, px, py, 13, '#5cb845'); c.fillStyle = '#f4f8ec'; c.fillRect(px - 1, (a.y + 2) * TS, 2, 8 * TS); }
  }
  // objects overlapping this chunk, in the map's top-down order
  for (const o of WORLD.objects) {
    const px = o.x * TS, py = o.y * TS;
    if (px < ox - 120 || px > ox + CH + 120 || py < oy - 48 || py > oy + CH + 200) continue;
    for (const [c, top] of [[c0, co], [c1, null]]) {
      const gt = top || DUMMY;
      if (o.k === 'tree') { drawTreeBase(c, px, py, o.v); if (top) drawTreeTop(top, px, py, o.v, o.hill); }
      else if (o.k === 'palm') drawPalm(c, gt, px, py, o.flip);
      else if (o.k === 'hut') drawHut(c, gt, px, py, o);
      else if (o.k === 'kapok') drawKapok(c, gt, px, py);
      else if (o.k === 'totem') { drawTotemBase(c, px, py); if (top) drawTotemTop(top, px, py); }
      else if (o.k === 'arch') drawArch(c, gt, px, py, o);
      else drawMisc(c, gt, o, px, py);
    }
  }
  for (const c of [c0, c1, co]) c.setTransform(1, 0, 0, 1, 0, 0);
  CHUNKS.set(cy * 64 + cx, ch);
  return ch;
}
/** The chunk at chunk coordinates (drawn now if it is not cached). */
WORLD.chunk = function (cx, cy) { let c = CHUNKS.get(cy * 64 + cx); if (!c) c = renderChunk(cx, cy); c.used = ++CHUNK_TICK; return c; };
/** Draw one missing chunk near the view, if any (called each frame so walking never waits on a big redraw). */
WORLD.warm = function (camX, camY, w, h) {
  const x0 = Math.max(0, Math.floor((camX - CH / 2) / CH)), y0 = Math.max(0, Math.floor((camY - CH / 2) / CH));
  const x1 = Math.min(Math.ceil(MW * TS / CH) - 1, Math.floor((camX + w + CH / 2) / CH)), y1 = Math.min(Math.ceil(MH * TS / CH) - 1, Math.floor((camY + h + CH / 2) / CH));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!CHUNKS.has(y * 64 + x)) { WORLD.chunk(x, y); return true; }
  return false;
};
/** Forget the chunks over a box of tiles (with room for tall objects), so they are drawn again with the new map. */
WORLD.invalidate = function (x0, y0, x1, y1) {
  const a = Math.floor((x0 * TS - 120) / CH), b = Math.floor((x1 * TS + 136) / CH), c = Math.floor((y0 * TS - 48) / CH), d = Math.floor((y1 * TS + 216) / CH);
  for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) { const k = y * 64 + x, ch = CHUNKS.get(k); if (ch) { CHUNKS.delete(k); CHUNK_POOL.push(ch); } }
};
WORLD.CH = CH;
WORLD.chunkCount = () => CHUNKS.size;
WORLD.build = function () {
  if (WORLD.ready) return;
  buildLayout(); buildObjects();
  WORLD.ready = true;
};
WORLD.arch = id => ARCHES[id];
WORLD.ARCHES = ARCHES;
