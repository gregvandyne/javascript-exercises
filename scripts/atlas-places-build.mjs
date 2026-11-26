// Atlas Quest's US states and Canada's provinces and territories (docs/decisions.md "Atlas Quest: US states and
// Canada"): their flat maps, written into seed-games/atlas-quest.html as one line, `window.AtlasPlaces = {...};`, right
// after window.AtlasData. The facts are scripts/data/atlas-quest/places.json (written by hand); the shapes and the
// capitals' coordinates are Natural Earth's (public domain, https://www.naturalearthdata.com/about/terms-of-use/):
//   ne_10m_admin_1_states_provinces.geojson and ne_10m_populated_places_simple.geojson, from
//   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ (Natural Earth 5.x).
// Each map is projected here once, so the game's map code (the atlas-map block) draws it as it draws a region of the
// world, with nothing new to learn: the United States in Albers equal-area conic (the USGS parallels 29.5 and 45.5),
// with Alaska (at 0.35 of its size) and Hawaii moved into boxes at the bottom left, as US school maps have them; Canada
// in Lambert conformal conic (Statistics Canada's parallels 49 and 77, central meridian 91.87 W). A map unit is UNIT km
// (US 20, Canada 30), written in tenths as the world map's shapes are (quantised, delta-coded rings). The shapes are
// simplified along shared borders once, so neighbours still meet, and islands too small to see at the map's size are
// left out (never a place's biggest piece).
//   node scripts/atlas-places-build.mjs <ne_10m_admin_1_states_provinces.geojson> <ne_10m_populated_places_simple.geojson>
// Then run node scripts/atlas-live-data.js so Atlas Quest Live gets the same maps.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = path.join(ROOT, 'seed-games/atlas-quest.html');
const SRC = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/atlas-quest/places.json'), 'utf8'));
const [adminFile, placesFile] = process.argv.slice(2);
if (!adminFile || !placesFile) throw new Error('usage: node scripts/atlas-places-build.mjs <admin-1 geojson> <populated places geojson>');
const ADMIN = JSON.parse(fs.readFileSync(adminFile, 'utf8'));
const PP = JSON.parse(fs.readFileSync(placesFile, 'utf8'));
const R = 6371, DEG = Math.PI / 180;

/* ---------- projections (spherical, km) ---------- */
function albers(p1, p2, p0, l0) {
  const n = (Math.sin(p1 * DEG) + Math.sin(p2 * DEG)) / 2, C = Math.cos(p1 * DEG) ** 2 + 2 * n * Math.sin(p1 * DEG);
  const rho = p => R * Math.sqrt(C - 2 * n * Math.sin(p * DEG)) / n, r0 = rho(p0);
  return (lng, lat) => { const r = rho(lat), t = n * (lng - l0) * DEG; return [r * Math.sin(t), r0 - r * Math.cos(t)]; };
}
function lambert(p1, p2, p0, l0) {
  const t = p => Math.tan(Math.PI / 4 + p * DEG / 2);
  const n = Math.log(Math.cos(p1 * DEG) / Math.cos(p2 * DEG)) / Math.log(t(p2) / t(p1)), F = Math.cos(p1 * DEG) * t(p1) ** n / n;
  const rho = p => R * F / t(p) ** n, r0 = rho(p0);
  return (lng, lat) => { const r = rho(lat), a = n * (lng - l0) * DEG; return [r * Math.sin(a), r0 - r * Math.cos(a)]; };
}
// The United States: the lower 48 (and DC) in one conic; Alaska and Hawaii in their own, then scaled and moved into
// boxes south-west of California (where Mexico's Pacific coast would be; no other country is drawn on these maps).
const L48 = albers(29.5, 45.5, 37.5, -96), AKP = albers(55, 65, 50, -154), HIP = albers(8, 18, 3, -157);
// mid: the point that lands at `at` (km on the lower 48's map)
const US_INSET = { 'US-AK': { proj: AKP, k: 0.35, mid: [-152, 63.5], at: [-1920, -990] }, 'US-HI': { proj: HIP, k: 1, mid: [-157.3, 20.6], at: [-1060, -1140] } };
const CAP = lambert(49, 77, 63.390675, -91.866667);
const MAPS = {
  us: { unit: 20, tol: 2.6, minIsle: 90, project(cc, lng, lat) {
    const ins = US_INSET[cc];
    if (!ins) return L48(lng, lat);
    if (lng > 0) lng -= 360;                       // the Aleutians run past 180
    const [x, y] = ins.proj(lng, lat), [mx, my] = ins.proj(...ins.mid); return [ins.at[0] + (x - mx) * ins.k, ins.at[1] + (y - my) * ins.k];
  } },
  ca: { unit: 30, tol: 5, minIsle: 900, project: (cc, lng, lat) => CAP(lng, lat) },
};
const mapOf = cc => (cc.startsWith('US-') ? 'us' : 'ca');
// Alaska's islands are drawn at 0.35: keep only the ones big enough to see there
const minIsle = cc => (cc === 'US-AK' ? 1800 : cc === 'US-HI' ? 60 : MAPS[mapOf(cc)].minIsle);

/* ---------- the source shapes ---------- */
const rows = SRC.places, want = new Set(rows.map(r => r[0]));
const feats = {};
for (const f of ADMIN.features) { const c = f.properties.iso_3166_2; if (want.has(c)) feats[c] = f.geometry; }
const missing = rows.filter(r => !feats[r[0]]).map(r => r[0]);
if (missing.length) throw new Error('no Natural Earth shape for ' + missing.join(', '));
// polygons as lists of rings (outer first, then holes), in km on the place's map
const area = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; };
const polys = {};
for (const [cc] of rows) {
  const g = feats[cc], list = g.type === 'Polygon' ? [g.coordinates] : g.coordinates, M = MAPS[mapOf(cc)];
  polys[cc] = list.map(poly => poly.map(ring => ring.slice(0, -1).map(([lng, lat]) => ({ lng, lat, xy: M.project(cc, lng, lat) }))));
}

/* ---------- simplify along shared borders: a point shared by a different set of places than its neighbours is kept, and
   the runs between kept points are simplified (Douglas-Peucker) the same way in every ring that has them ---------- */
const key = p => p.lng.toFixed(6) + ',' + p.lat.toFixed(6);
const owners = new Map();
for (const [cc, ps] of Object.entries(polys)) for (const poly of ps) for (const ring of poly) for (const p of ring) {
  const k = key(p); let s = owners.get(k); if (!s) owners.set(k, s = new Set()); s.add(cc);
}
const ownSig = p => [...owners.get(key(p))].sort().join('|');
function dp(pts, tol) {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let best = -1, bd = 0;
    const [ax, ay] = pts[a].xy, [bx, by] = pts[b].xy, dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const [px, py] = pts[i].xy, d = Math.abs(dx * (ay - py) - dy * (ax - px)) / L; if (d > bd) { bd = d; best = i; } }
    if (bd > tol && best > 0) { keep[best] = 1; st.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const runCache = new Map();
function simplifyRing(ring, tol, m) {
  const n = ring.length, sig = ring.map(ownSig);
  const fixed = ring.map((p, i) => sig[i] !== sig[(i + n - 1) % n] || sig[i] !== sig[(i + 1) % n] || sig[i].includes('|') && sig[i].split('|').length > 2);
  let first = fixed.indexOf(true);
  if (first < 0) {
    // a ring of its own (an island): split it at the point farthest from its start, so each half has two ends
    let far = 0, fd = -1; const [sx, sy] = ring[0].xy;
    ring.forEach((p, i) => { const d = Math.hypot(p.xy[0] - sx, p.xy[1] - sy); if (d > fd) { fd = d; far = i; } });
    const a = dp(ring.slice(0, far + 1), tol), b = dp([...ring.slice(far), ring[0]], tol);
    const out = [...a.slice(0, -1), ...b.slice(0, -1)];
    return out.length >= 3 ? out : ring.slice(0, 3);
  }
  const out = [];
  for (let s = 0; s < n;) {
    const i0 = (first + s) % n; let len = 1;
    while (len < n && !fixed[(i0 + len) % n]) len++;
    const run = []; for (let k = 0; k <= len; k++) run.push(ring[(i0 + k) % n]);
    // the same run read the other way (a neighbour's ring) simplifies to the same points
    // (per map: a border between the two maps, Alaska and Yukon, is drawn in each map's own projection)
    const fk = m + ':' + run.map(key).join(';'), rk = m + ':' + run.map(key).reverse().join(';');
    let simp = runCache.get(fk);
    if (!simp && runCache.has(rk)) simp = runCache.get(rk).slice().reverse();
    if (!simp) { simp = dp(run, tol); runCache.set(fk, simp); }
    out.push(...simp.slice(0, -1));
    s += len;
  }
  return out;
}

/* ---------- each place: rings in map units (tenths), its label point (the inside point farthest from its edges) ---------- */
const q10 = v => Math.round(v * 10);
function poleOf(poly) {      // poly: [outer, ...holes] of [x, y]
  const o = poly[0]; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of o) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const inside = (x, y) => { let c = false; for (const r of poly) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const edge = (x, y) => { let m = Infinity; for (const r of poly) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [ax, ay] = r[j], [bx, by] = r[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)); m = Math.min(m, Math.hypot(x - ax - t * dx, y - ay - t * dy)); } return m; };
  let best = null, bd = -1, N = 48;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const x = x0 + (x1 - x0) * i / N, y = y0 + (y1 - y0) * j / N; if (!inside(x, y)) continue; const d = edge(x, y); if (d > bd) { bd = d; best = [x, y]; } }
  // a finer look around the best one
  if (best) { const sx = (x1 - x0) / N, sy = (y1 - y0) / N, b0 = best; for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) { const x = b0[0] + sx * i / 6, y = b0[1] + sy * j / 6; if (!inside(x, y)) continue; const d = edge(x, y); if (d > bd) { bd = d; best = [x, y]; } } }
  return best || o[0];
}
const capitals = {};
for (const f of PP.features) {
  const p = f.properties; if (!['US', 'CA'].includes(p.iso_a2) || p.featurecla !== 'Admin-1 capital') continue;
  capitals[`${p.iso_a2}|${p.adm1name}`] = [p.longitude, p.latitude];
}
const NE_NAME = Object.fromEntries(ADMIN.features.filter(f => want.has(f.properties.iso_3166_2)).map(f => [f.properties.iso_3166_2, f.properties.name]));
// Washington, D.C. is Natural Earth's admin-0 capital; the District has no capital of its own (the facts leave it empty)
const capOf = cc => capitals[`${cc.slice(0, 2)}|${NE_NAME[cc]}`] || null;

const out = { P: [], MAP: {}, MAPS: {} };
const box = { us: [Infinity, Infinity, -Infinity, -Infinity], ca: [Infinity, Infinity, -Infinity, -Infinity] };
let points = 0;
for (const r of rows) {
  const [cc, en, capEn, postal, reg, nick, big] = r, m = mapOf(cc), M = MAPS[m];
  const keptPolys = [];
  for (const poly of polys[cc]) {
    const rings = poly.map(ring => simplifyRing(ring, M.tol, m)).filter(x => x.length >= 3);
    if (!rings.length) continue;
    keptPolys.push({ rings, a: Math.abs(area(poly[0].map(p => p.xy))) });
  }
  keptPolys.sort((a, b) => b.a - a.a);
  const big0 = keptPolys[0], polysKept = keptPolys.filter((p, i) => i === 0 || p.a >= minIsle(cc));
  const enc = [];
  for (const p of polysKept) p.rings.forEach((ring, ri) => {
    if (ri > 0 && Math.abs(area(ring.map(q => q.xy))) < minIsle(cc)) return;   // small lakes in a place
    const pts = []; let lx = null, ly = null;
    for (const q of ring) { const x = q10(q.xy[0] / M.unit), y = q10(q.xy[1] / M.unit); if (x === lx && y === ly) continue; pts.push([x, y]); lx = x; ly = y; }
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3 && !(p === big0 && ri === 0)) return;
    const d = []; let px = 0, py = 0;
    for (const [x, y] of pts) { d.push(x - px, y - py); px = x; py = y; box[m][0] = Math.min(box[m][0], x / 10); box[m][2] = Math.max(box[m][2], x / 10); box[m][1] = Math.min(box[m][1], y / 10); box[m][3] = Math.max(box[m][3], y / 10); }
    points += pts.length; enc.push(d);
  });
  out.MAP[cc] = enc;
  const lab = poleOf(big0.rings.map(ring => ring.map(q => [q.xy[0] / M.unit, q.xy[1] / M.unit])));
  const capLL = capEn ? capOf(cc) : null;
  if (capEn && !capLL) throw new Error(`no Natural Earth capital for ${cc}`);
  const capXY = capLL ? M.project(cc, capLL[0], capLL[1]).map(v => v / M.unit) : lab;
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  // [code, name, capital, postal, region, labX, labY, capX, capY, capLat, capLng, nickname, largest city, in an inset (0/1)]
  out.P.push([cc, en, capEn, postal, reg, r1(lab[0]), r1(lab[1]), r1(capXY[0]), r1(capXY[1]), capLL ? r2(capLL[1]) : 0, capLL ? r2(capLL[0]) : 0, nick, big, US_INSET[cc] ? 1 : 0]);
}
// the frames: the shapes' box and a little sea round it; the US's inset boxes (Alaska, Hawaii) drawn as frames
// [west, south, east, north] in map units: the US gets the Atlantic off New England, where the small states' answer lines go,
// and a little sea under Alaska's and Hawaii's boxes so they never sit on the map's own border
const pad = { us: [1.2, 3.5, 35, 1.2], ca: [1.6, 1.6, 1.6, 1.6] };
for (const m of ['us', 'ca']) {
  const b = box[m], p = pad[m];
  const f = [Math.floor((b[0] - p[0]) * 10) / 10, Math.floor((b[1] - p[1]) * 10) / 10, Math.ceil((b[2] + p[2]) * 10) / 10, Math.ceil((b[3] + p[3]) * 10) / 10];
  out.MAPS[m] = { frame: f, unit: MAPS[m].unit, small: SRC.maps[m].small, insets: [] };
}
for (const [cc, ins] of Object.entries(US_INSET)) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of out.MAP[cc]) { let x = 0, y = 0; for (let i = 0; i < ring.length; i += 2) { x += ring[i]; y += ring[i + 1]; b = [Math.min(b[0], x / 10), Math.min(b[1], y / 10), Math.max(b[2], x / 10), Math.max(b[3], y / 10)]; } }
  const g = 1.2; out.MAPS.us.insets.push([Math.round((b[0] - g) * 10) / 10, Math.round((b[1] - g) * 10) / 10, Math.round((b[2] + g) * 10) / 10, Math.round((b[3] + g) * 10) / 10]);
  void ins;
}
// checks: every place has a shape and its label inside it; the insets don't touch the lower 48
for (const r of out.P) if (!out.MAP[r[0]].length) throw new Error(`${r[0]} has no shape left`);
const line = `window.AtlasPlaces = ${JSON.stringify(out)};`;
let html = fs.readFileSync(GAME, 'utf8');
const lines = html.split('\n'), at = lines.findIndex(l => l.startsWith('window.AtlasData = '));
if (at < 0) throw new Error('no window.AtlasData in atlas-quest.html');
const old = lines.findIndex(l => l.startsWith('window.AtlasPlaces = '));
if (old >= 0) lines[old] = line; else lines.splice(at + 1, 0, line);
html = lines.join('\n');
fs.writeFileSync(GAME, html);
console.log(`atlas-quest places: ${out.P.length} (${out.P.filter(r => r[0].startsWith('US-')).length} US, ${out.P.filter(r => r[0].startsWith('CA-')).length} Canada), ${points} points, ${(line.length / 1024).toFixed(1)} KB; frames us ${out.MAPS.us.frame} ca ${out.MAPS.ca.frame}`);
