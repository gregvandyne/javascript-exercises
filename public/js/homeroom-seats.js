// Homeroom's board geometry and seating (docs/homeroom.md "The board (teacher)"; shared by the page, public/js/homeroom.js,
// and the server, services/homeroom.js, which places new students and checks every saved seat with the same numbers).
// Board pixels, the front of the room at the top: the teacher's area (the yellow band everyone can see), the teacher's
// desk under it, then a desk per student. The presets match a real room: Rows (an aisle down the middle), Tables of 4,
// U-shape (open toward the front) and Circle; after a preset the teacher drags any desk where it really sits.
export const BOARD = { w: 2400, h: 1500, maxW: 6000, maxH: 6000 };
export const AREA = { x: 420, y: 40, w: 1560, h: 380 };
/** A sticky note and a text box in the teacher's area: their default size and limits (area pixels; the page and the
 *  server's cleaner use the same numbers). Both resize in width and height; their words wrap inside. */
export const NOTE_BOX = { w: 176, h: 110, wMin: 90, wMax: 600, hMin: 60, hMax: 380 };
export const TEXT_NEW = { w: 260, h: 40 };
/** The teacher's own desk, under the middle of the teacher's area: a real desk where the teacher stages games, lessons and
 *  tools to try and hand out later (services/homeroom-staged.js). Ends above the first row's names (SEATS_TOP - 34). */
export const TEACHER_DESK = { x: 880, y: 436, w: 640, h: 108 };
export const DESK = { w: 180, h: 124 };
/** A team desk (step 2c): students who share one desk. Wider than a desk, so every member's name fits on it. */
export const TEAM_DESK = { w: 300, h: 150 };
/** A team has 2 to TEAM_MAX members; a class has at most TEAMS_MAX teams. */
export const TEAM_MAX = 6, TEAMS_MAX = 30;
/** Room for a student's name above their desk: no preset puts a desk on the name of the one in front. */
export const NAME_H = 50;
/** Where students' desks start (under the teacher's desk), and the middle of the room. */
export const SEATS_TOP = 600, MID_X = AREA.x + AREA.w / 2;
export const PRESETS = ['rows', 'pods', 'u', 'circle'];
/** At most this many groups a class; group colors the teacher picks from (calm, readable on the card color). */
export const GROUPS_MAX = 8, GROUP_NAME_MAX = 30;
export const GROUP_COLORS = ['#8C6BD1', '#1F9D63', '#3F8FCF', '#E8833A', '#D6457A', '#6D4C41', '#00897B', '#5D5A50'];
/** The three groups every class starts with (their names follow the teacher's language until renamed). */
export const DEFAULT_GROUPS = [{ id: 'g1', key: 'stretch', name: '', color: '#8C6BD1' }, { id: 'g2', key: 'onTrack', name: '', color: '#1F9D63' }, { id: 'g3', key: 'building', name: '', color: '#3F8FCF' }];

const round10 = v => Math.round(v / 10) * 10;

/** The top-left corners of n desks in a preset (unknown presets: rows). -> [{ x, y }] */
export function layout(kind, n) {
  const out = [], W = DESK.w, H = DESK.h;
  if (n <= 0) return out;
  if (kind === 'pods') {
    // Tables of 4 (2 by 2), three tables to a row; a last table may have fewer desks.
    for (let i = 0; i < n; i++) {
      const p = Math.floor(i / 4), k = i % 4, col = p % 3, row = Math.floor(p / 3);
      out.push({ x: MID_X - 690 + col * 470 + (k % 2) * (W + 10), y: SEATS_TOP + row * 390 + Math.floor(k / 2) * (H + NAME_H) });
    }
  } else if (kind === 'u') {
    // Two sides and a bottom row, the open end toward the teacher.
    const side = Math.max(1, Math.round(n / 3)), bottom = Math.max(0, n - 2 * side), across = Math.max(bottom, 3);
    const left = MID_X - (across * 210) / 2 - 240, right = MID_X + (across * 210) / 2 + 60;
    for (let i = 0; i < Math.min(side, n); i++) { out.push({ x: left, y: SEATS_TOP + i * 170 }); if (out.length < n) out.push({ x: right, y: SEATS_TOP + i * 170 }); }
    const bw = (bottom - 1) * 210;
    for (let i = 0; i < bottom; i++) out.push({ x: MID_X - bw / 2 + i * 210 - W / 2, y: SEATS_TOP + side * 170 + 30 });
  } else if (kind === 'circle') {
    // A ring big enough that neighbors never touch, centered under the teacher's desk.
    const R = Math.max(380, (n * 220) / (2 * Math.PI)), cx = Math.max(MID_X, R * 1.15 + W / 2 + 60), cy = SEATS_TOP + R + 10;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      out.push({ x: cx + Math.cos(a) * R * 1.15 - W / 2, y: cy + Math.sin(a) * R - H / 2 });
    }
  } else {
    // Rows: 3, 4 or 6 across with an aisle down the middle.
    const cols = n <= 9 ? 3 : n <= 24 ? 4 : 6, gx = 230, gy = 190, w = (cols - 1) * gx;
    for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols); out.push({ x: MID_X - w / 2 + c * gx - W / 2 + (c >= cols / 2 ? 50 : -50), y: SEATS_TOP + r * gy }); }
  }
  // A big class can reach past the left edge (a wide U): the whole layout moves right, never one desk onto another.
  const dx = Math.max(0, 40 - Math.min(...out.map(p => p.x)));
  return out.map(p => ({ x: round10(p.x + dx), y: Math.max(SEATS_TOP, round10(p.y)) }));
}

/** A desk's place as it may be stored: whole numbers, inside the board, never above the students' part of the room. */
export function clampSeat(p) {
  const x = Number(p && p.x), y = Number(p && p.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(Math.min(Math.max(0, x), BOARD.maxW - DESK.w)), y: Math.round(Math.min(Math.max(SEATS_TOP, y), BOARD.maxH - DESK.h)) };
}

/** Every student a desk: their saved place, else the next free spot of the class's preset (new students join the room
 *  without moving anyone). ids: the roster's students in order; seats: { id: { x, y } }. -> { id: { x, y } } */
export function seatAll(ids, seats = {}, preset = 'rows') {
  const out = {}, missing = [];
  for (const id of ids) { const p = seats && seats[id] ? clampSeat(seats[id]) : null; if (p) out[id] = p; else missing.push(id); }
  if (!missing.length) return out;
  const taken = Object.values(out), spots = layout(preset, ids.length + missing.length);
  const free = spots.filter(s => !taken.some(t => Math.abs(t.x - s.x) < DESK.w && Math.abs(t.y - s.y) < DESK.h + NAME_H - 10));
  // More students than free spots in the preset: under everyone else, in rows.
  const lowest = Math.max(SEATS_TOP, ...taken.map(t => t.y + DESK.h + 60));
  const extra = layout('rows', missing.length).map(s => ({ x: s.x, y: s.y - SEATS_TOP + lowest }));
  missing.forEach((id, i) => { out[id] = free[i] || extra[i]; });
  return out;
}

/** The board's size: the default, grown to hold every desk (and every team desk: teams [{ x, y }]). */
export function boardSize(seats, teams = []) {
  const list = Object.values(seats || {}), tl = Array.isArray(teams) ? teams : [];
  return { w: Math.max(BOARD.w, ...list.map(p => p.x + DESK.w + 80), ...tl.map(p => p.x + TEAM_DESK.w + 80)), h: Math.max(BOARD.h, ...list.map(p => p.y + DESK.h + 80), ...tl.map(p => p.y + TEAM_DESK.h + 80)) };
}
