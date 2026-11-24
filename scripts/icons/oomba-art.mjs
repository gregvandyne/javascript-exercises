// The Oomba icons (ours; docs/decisions.md "Icons: Oomba geometric for controls, Fluent 3D for big spots"): the
// drawings, one function per concept, on a 24-unit grid. The rules every drawing keeps:
//   - one brand color per icon (mint, spark or, for live, record and stop signals, coral) plus ink;
//   - ink that sits on the page is currentColor (it follows the text: dark on light, cream on dark, cream on the black
//     "current" pill); ink that sits on a colored piece is always #141414 (K), so it reads on that color in both themes;
//   - chunky rounded shapes (corners about 2.5 to 3.5), strokes 2 to 2.6 with round ends, nothing thinner than 1.5;
//   - spark yellow never carries the meaning alone (it is faint on cream): an ink detail sits on it, as on the logo;
//   - owl eyes only on Me, Classroom and Eyes up.
// scripts/icons/build_oomba.mjs writes public/icons/oomba/<concept>.svg from these and public/js/icons-oomba.js.
export const G = '#66C792', Y = '#FFD23F', R = '#FF8A6B', K = '#141414', T = 'currentColor', W = '#FFFDF2';
const S = (w = 2.2) => `stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
const line = (d, c = T, w = 2.2) => `<path d="${d}" stroke="${c}" ${S(w)}/>`;
const shape = (d, c, round = 0) => `<path d="${d}" fill="${c}"${round ? ` stroke="${c}" stroke-width="${round}" stroke-linejoin="round"` : ''}/>`;
const rr = (x, y, w, h, r, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c}"/>`;
const ci = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
const ring = (x, y, r, c = T, w = 2.2) => `<circle cx="${x}" cy="${y}" r="${r}" stroke="${c}" ${S(w)}/>`;
const owl = (x1, x2, y, r, c = K, w = 1.8) => `${ring(x1, y, r, c, w)}${ring(x2, y, r, c, w)}${ci(x1 + r * .25, y - r * .2, r * .4, c)}${ci(x2 + r * .25, y - r * .2, r * .4, c)}`;
const gearPath = (cx, cy, r1, r2, n) => { let d = ''; for (let i = 0; i < n * 2; i++) { const a = (i * Math.PI) / n - Math.PI / 2, r = i % 2 ? r2 : r1, a1 = a - Math.PI / n * .42, a2 = a + Math.PI / n * .42; d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a1)).toFixed(2)} ${(cy + r * Math.sin(a1)).toFixed(2)}L${(cx + r * Math.cos(a2)).toFixed(2)} ${(cy + r * Math.sin(a2)).toFixed(2)}`; } return d + 'Z'; };
const star5 = (cx, cy, ro, ri) => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`; } return d + 'Z'; };
const person = (hx, hy, hr, bx, bw, by, c, head = T) => `${ci(hx, hy, hr, head)}${shape(`M${bx} ${by}a${bw / 2} ${bw / 2 * 1.05} 0 0 1 ${bw} 0Z`, c)}`;
const chip = (c = G) => ci(12, 12, 10.5, c);
const sun = (c = Y) => `${ci(12, 12, 5, c)}${line('M12 1.8v2.4M12 19.8v2.4M1.8 12h2.4M19.8 12h2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M4.8 19.2l1.7-1.7M17.5 6.5l1.7-1.7')}`;
const pageShape = c => shape('M5 4.2A2.2 2.2 0 0 1 7.2 2h7.3L19 6.5v13.3a2.2 2.2 0 0 1-2.2 2.2H7.2A2.2 2.2 0 0 1 5 19.8Z', c);

export const ART = {
  // ---- places and people
  home: () => `${shape('M2.5 11 12 3.2 21.5 11v8.2a2.6 2.6 0 0 1-2.6 2.6H5.1a2.6 2.6 0 0 1-2.6-2.6Z', G, 1.4)}${rr(9.4, 13, 5.2, 8.8, 2.6, K)}`,
  classroom: () => `${rr(1.5, 3, 21, 14, 3.2, G)}${owl(8.8, 15.2, 10, 2.5, K, 1.6)}${line('M12 17v4M8 21.2h8')}`,
  school: () => `${shape('M12 2.5 21.5 8H2.5Z', T, 1.6)}${rr(3.5, 9.5, 17, 12, 1.6, G)}${rr(10, 14.5, 4, 7, 1.2, K)}${rr(5.6, 12, 2.6, 3, .6, K)}${rr(15.8, 12, 2.6, 3, .6, K)}`,
  me: () => `${rr(1.5, 1.5, 21, 21, 6, Y)}${owl(7.8, 16.2, 12, 3.3, K, 2.2)}`,
  person: () => person(12, 7.2, 4.2, 3.5, 17, 21.5, G),
  kid: () => `${ci(12, 8.4, 3.9, T)}${shape('M5.5 21.5a6.5 7 0 0 1 13 0Z', Y)}${ci(12, 8.4, 3.9, T)}${shape('M8.2 7.2a3.9 3.9 0 0 1 7.6 0c-1.6-.6-2.4-1.6-2.8-2.8-.8 1.4-2.6 2.6-4.8 2.8Z', T)}`,
  student: () => `${shape('M5.2 21.5a6.8 6.5 0 0 1 13.6 0Z', G)}${ci(12, 10.6, 3.8, T)}${shape('M12 2.4 20 5.8 12 9.2 4 5.8Z', T, 1.4)}${line('M19 6.4v3.6', T, 1.8)}`,
  students: () => `${ci(16.8, 8.4, 3.1, T)}${shape('M12.2 20.5a4.8 4.8 0 0 1 9.6 0Z', G)}${ci(8.6, 7.6, 3.6, T)}${shape('M2 20.5a6.6 6.6 0 0 1 13.2 0Z', G)}`,
  teacher: () => `${rr(9.5, 2.5, 12.5, 9, 2.2, G)}${line('M12.5 6.5h6.5M12.5 9h4', K, 1.6)}${ci(6.5, 8.2, 3.3, T)}${shape('M1 21.5a5.8 6.5 0 0 1 11.6 0Z', G)}${line('M10.4 13.6 13.2 10.6', T, 2)}`,
  grownups: () => `${ci(8, 6, 3.6, T)}${shape('M1.5 21.5a6.5 7.4 0 0 1 13 0Z', Y)}${ci(17.6, 11.2, 2.7, T)}${shape('M13.4 21.5a4.2 4.8 0 0 1 8.4 0Z', Y)}`,
  friends: () => `${ci(7.2, 8, 3.3, T)}${ci(16.8, 8, 3.3, T)}${shape('M1.3 21a5.9 6.2 0 0 1 11.8 0Z', G)}${shape('M10.9 21a5.9 6.2 0 0 1 11.8 0Z', G)}${shape('M12 3.4c.9-1.4 3-1 3 .7 0 1.5-3 3.3-3 3.3s-3-1.8-3-3.3c0-1.7 2.1-2.1 3-.7Z', R)}`,
  players: () => `${ci(7, 7.6, 3.2, T)}${ci(17, 7.6, 3.2, T)}${shape('M1.4 20.6a5.6 6 0 0 1 11.2 0Z', Y)}${shape('M11.4 20.6a5.6 6 0 0 1 11.2 0Z', Y)}${ci(7, 16.6, 1.3, K)}${ci(17, 16.6, 1.3, K)}`,
  // ---- the main doors
  search: () => `${ci(10.2, 10.2, 6.6, G)}${ring(10.2, 10.2, 6.6, T, 2.4)}${line('M15.2 15.2 20.8 20.8', T, 3.2)}${ci(8.3, 8.4, 1.6, W)}`,
  settings: () => `${shape(gearPath(12, 12, 10.6, 7.6, 8), T, 1.2)}${ci(12, 12, 5.2, G)}${ci(12, 12, 2, K)}`,
  play: () => `${chip(Y)}${shape('M9.5 7.6 17 12 9.5 16.4Z', K, 1.6)}`,
  learn: () => `${shape('M5.5 10.5V16c0 1.8 3 3.4 6.5 3.4s6.5-1.6 6.5-3.4v-5.5', T)}${shape('M12 3.5 22.5 8.8 12 14.1 1.5 8.8Z', G, 1.5)}${line('M21 9.4v5.4', T, 1.9)}${ci(21, 16, 1.5, T)}`,
  build: () => `${rr(2.5, 12.5, 9, 9, 2.3, Y)}${rr(12.5, 12.5, 9, 9, 2.3, Y)}${rr(7.5, 2.5, 9, 9, 2.3, T)}${line('M5.6 17h2.8M15.6 17h2.8', K, 1.8)}`,
  live: () => `${ci(12, 12, 3.6, R)}${line('M7.4 7.4a6.5 6.5 0 0 0 0 9.2M16.6 7.4a6.5 6.5 0 0 1 0 9.2M4.2 4.2a11 11 0 0 0 0 15.6M19.8 4.2a11 11 0 0 1 0 15.6', T, 2.3)}`,
  games: () => `${rr(1.5, 6.5, 21, 12, 6, Y)}${line('M7.5 9.6v5.8M4.6 12.5h5.8', K)}${ci(15.6, 11, 1.5, K)}${ci(18.6, 14, 1.5, K)}`,
  tools: () => `${line('M8 9V6.2A1.7 1.7 0 0 1 9.7 4.5h4.6A1.7 1.7 0 0 1 16 6.2V9')}${rr(1.5, 8.5, 21, 12.5, 3.2, Y)}<path d="M1.5 13.2h21" stroke="${K}" stroke-width="2"/>${rr(10, 11.4, 4, 4.8, 1.2, K)}`,
  wrench: () => `${shape('M14.7 3.2a5.2 5.2 0 0 0-5 6.8L3.4 16.3a2.3 2.3 0 0 0 3.3 3.3L13 13.3a5.2 5.2 0 0 0 6.8-5l-3 3-3.3-.8-.8-3.3Z', T, 1.4)}${ci(5.2, 18, 1.3, G)}`,
  dashboard: () => `${rr(2, 2.5, 9, 11, 2.5, G)}${rr(13, 2.5, 9, 6.5, 2.5, G)}${rr(2, 15.5, 9, 6, 2.5, T)}${rr(13, 11, 9, 10.5, 2.5, T)}`,
  lessons: () => `${shape('M1.8 5.2c3.6-1.3 7.2-.9 9.6 1v14.4c-2.4-1.6-6-2-9.6-.8Z', G)}${shape('M22.2 5.2c-3.6-1.3-7.2-.9-9.6 1v14.4c2.4-1.6 6-2 9.6-.8Z', G)}${line('M5 9.4h3.4M5 12.6h3.4M15.6 9.4H19M15.6 12.6H19', K, 1.6)}`,
  // An open book: paper pages with an ink outline, so it reads on a Mint button too (the owner, 24 Nov 2026: the old
  // closed Mint book vanished on the Mint Read button and showed only its spine).
  book: () => `${shape('M2 5.6c3.4-1.4 6.9-1.1 10 1.1v14c-3.1-2-6.6-2.3-10-1.2Z', W)}${shape('M22 5.6c-3.4-1.4-6.9-1.1-10 1.1v14c3.1-2 6.6-2.3 10-1.2Z', W)}${line('M2 5.6c3.4-1.4 6.9-1.1 10 1.1c3.1-2.2 6.6-2.5 10-1.1v13.9c-3.4-1.1-6.9-.8-10 1.2c-3.1-2-6.6-2.3-10-1.2Z', K, 2)}${line('M12 6.7v13.6', K, 2)}${line('M5 10.4h3.6M15.4 10.4H19', G, 1.8)}`,
  manipulatives: () => `${ci(7, 7, 4.6, Y)}${rr(12.6, 2.4, 9.2, 9.2, 2.3, Y)}${shape('M7 13.2 11.6 21.3H2.4Z', T, 1.6)}${shape('M17.2 12.6l4.4 2.5v5L17.2 22.6l-4.4-2.5v-5Z', T, 1)}${line('M5.2 7h3.6M15.4 7h3.6M17.2 5.2v3.6', K, 1.6)}`,
  figures: () => `${shape('M3 21V3.6L20.4 21Z', G, 2)}${line('M3 15.6h5.4V21', K, 1.8)}${line('M3 21V3.6L20.4 21Z', T, 1.9)}`,
  ruler: () => `${shape('M2.8 16.2 16.2 2.8l5 5L7.8 21.2Z', Y, 1.4)}${line('M7 12l2 2M10 9l2 2M13 6l2 2M8.5 10.5l1 1M11.5 7.5l1 1', K, 1.6)}`,
  // ---- class tools
  timer: () => `${ci(12, 13.5, 9, Y)}${line('M12 13.5V8.6M12 13.5l3 2', K)}${rr(9.5, 1.2, 5, 2.6, 1.3, T)}${ci(12, 13.5, 1.5, K)}`,
  clock: () => `${ci(12, 12, 10.3, G)}${line('M12 6.6V12l3.6 2.2', K, 2.3)}`,
  hourglass: () => `${line('M5 2.8h14M5 21.2h14', T, 2.4)}${shape('M7 4.5h10c0 3.6-2.5 5.6-5 7.5-2.5-1.9-5-3.9-5-7.5Z', Y, 1.4)}${shape('M7 19.5h10c0-3.6-2.5-5.6-5-7.5-2.5 1.9-5 3.9-5 7.5Z', Y, 1.4)}${shape('M9.4 18.8h5.2c-.4-1.6-1.4-2.7-2.6-3.6-1.2.9-2.2 2-2.6 3.6Z', K)}`,
  calendar: () => `${rr(2.5, 4, 19, 18, 3.2, G)}${shape('M2.5 7.2A3.2 3.2 0 0 1 5.7 4h12.6a3.2 3.2 0 0 1 3.2 3.2V9.5h-19Z', T)}${line('M7.5 2v4M16.5 2v4')}${rr(6, 12.5, 3, 3, .8, K)}${rr(10.5, 12.5, 3, 3, .8, K)}${rr(15, 12.5, 3, 3, .8, K)}${rr(6, 16.8, 3, 3, .8, K)}`,
  progress: () => `${rr(2.5, 13, 5, 8.5, 1.8, G)}${rr(9.5, 8, 5, 13.5, 1.8, G)}${rr(16.5, 2.5, 5, 19, 1.8, T)}`,
  growth: () => `${rr(2.5, 3, 19, 18.5, 3.2, G)}${line('M6 16.5l4-4.5 3 2.6 5-6.1', K, 2.3)}${line('M14.6 8.5H18v3.4', K, 2.3)}`,
  eyes: () => `${ci(7, 12, 5.6, Y)}${ci(17, 12, 5.6, Y)}${owl(7, 17, 12, 3.4, K, 2)}`,
  eye: () => `${shape('M1.8 12C4.3 7.4 7.8 5 12 5s7.7 2.4 10.2 7c-2.5 4.6-6 7-10.2 7S4.3 16.6 1.8 12Z', G)}${ci(12, 12, 3.6, K)}${ci(13.2, 10.8, 1.1, W)}`,
  broom: () => `${line('M20.5 3 13.2 10.3', T, 2.6)}${shape('M11.6 9.4l3 3c.8.8.8 2.2 0 3l-5.4 5.4c-1.4 1.4-6 .6-6-.2s-.8-4.6.6-6Z', Y)}${line('M6 16.6l2.6 2.6M8.4 14.2l2.6 2.6', K, 1.5)}`,
  shuffle: () => `${line('M2.5 6.5h3.6c4.6 0 7 11 11.6 11h3.8M2.5 17.5h3.6c4.6 0 7-11 11.6-11h3.8', T, 2.3)}${line('M18.8 3.4l3 3.1-3 3.1M18.8 14.4l3 3.1-3 3.1', G, 2.5)}`,
  repeat: () => `${chip(G)}${line('M7 11V9.8a2 2 0 0 1 2-2h8.2M14.6 5.2l2.6 2.6-2.6 2.6M17 13v1.2a2 2 0 0 1-2 2H6.8M9.4 18.8l-2.6-2.6 2.6-2.6', K, 2)}`,
  refresh: () => `${chip(G)}${line('M17 9.2A5.6 5.6 0 1 0 17.4 14', K, 2.2)}${line('M17.6 5.4v4.2h-4.2', K, 2.2)}`,
  undo: () => `${line('M9 5.5 4.5 10 9 14.5', T, 2.4)}${line('M4.8 10h9.7a5.5 5.5 0 0 1 0 11H10', T, 2.4)}${ci(10, 21, 1.6, G)}`,
  dice: () => `${rr(2.5, 2.5, 19, 19, 5, Y)}${ci(8, 8, 1.8, K)}${ci(16, 8, 1.8, K)}${ci(12, 12, 1.8, K)}${ci(8, 16, 1.8, K)}${ci(16, 16, 1.8, K)}`,
  target: () => `${ci(12, 12, 10.3, R)}${ci(12, 12, 6.2, W)}${ci(12, 12, 3, K)}`,
  pin: () => `${line('M12 14.4V22', T, 2.4)}${ci(12, 8.4, 6.4, R)}${ci(10, 6.6, 1.7, W)}`,
  clip: () => `${line('M15.5 7.5 8.4 14.6a2 2 0 0 0 2.8 2.8l7.8-7.8a4 4 0 0 0-5.6-5.6L5.6 11.8a6 6 0 0 0 8.5 8.5l5.6-5.6', T, 2.3)}${ci(19.7, 14.7, 1.8, G)}`,
  traffic: () => `${rr(6.5, 1.5, 11, 21, 4.5, T)}${ci(12, 6.4, 2.4, R)}${ci(12, 12, 2.4, Y)}${ci(12, 17.6, 2.4, G)}`,
  // ---- the class dashboard's own tools and passes
  eraser: () => `${shape('M13.6 3.2a2.4 2.4 0 0 1 3.4 0l3.8 3.8a2.4 2.4 0 0 1 0 3.4L11.4 19.8H7.6l-4.4-4.4a2.4 2.4 0 0 1 0-3.4Z', R)}${shape('M3.2 15.4 7.6 19.8h3.8l2.4-2.4-6.8-6.8-3.8 3.8a1.7 1.7 0 0 0 0 1Z', T)}${line('M11 21h10', T, 2.2)}`,
  marker: () => `${shape('M16.4 2.6a2.3 2.3 0 0 1 3.3 0l1.7 1.7a2.3 2.3 0 0 1 0 3.3l-9.8 9.8-5-5Z', R)}${shape('M6.6 12.4l5 5-2.6 2.6H4.6v-4.4Z', T)}${line('M2.5 21.5h5', T, 2.2)}${line('M13.8 5.2l5 5', K, 1.8)}`,
  pointer: () => `${shape('M9 11.5V4.2a1.8 1.8 0 0 1 3.6 0v6.3l5.1.9a2.6 2.6 0 0 1 2.1 2.9l-.8 5.4a2.6 2.6 0 0 1-2.6 2.3h-5.2a2.6 2.6 0 0 1-2.1-1.1L5.2 16a1.8 1.8 0 0 1 2.7-2.4Z', Y)}${line('M12.6 10.5V14M16 11.1V14', K, 1.5)}`,
  restroom: () => `${rr(2, 2, 20, 20, 4.5, G)}${ci(7.6, 6.6, 1.7, K)}${ci(16.4, 6.6, 1.7, K)}${shape('M5.6 9.6h4v4.4H8.7v4.8H6.5V14H5.6Z', K, 1)}${shape('M16.4 9.4l2.6 6h-1.4v3.4h-2.4v-3.4h-1.4Z', K, 1)}${line('M12 5.5v13', K, 1.4)}`,
  water: () => `${shape('M12 2.5c3.6 4.4 6.6 8.2 6.6 11.6a6.6 6.6 0 0 1-13.2 0C5.4 10.7 8.4 6.9 12 2.5Z', G, 1)}${line('M9 14.2a3 3 0 0 0 3 3', K, 1.8)}`,
  bandage: () => `${shape('M3.8 13.4 13.4 3.8a3.6 3.6 0 0 1 5.1 0l1.7 1.7a3.6 3.6 0 0 1 0 5.1l-9.6 9.6a3.6 3.6 0 0 1-5.1 0l-1.7-1.7a3.6 3.6 0 0 1 0-5.1Z', Y)}${rr(9.2, 9.2, 5.6, 5.6, 1.2, R)}${ci(11, 11, .7, K)}${ci(13, 13, .7, K)}${ci(13, 11, .7, K)}${ci(11, 13, .7, K)}`,
  steps: () => `${shape('M5.4 2.6c1.8 0 3 2 3 4.6 0 2.4-.6 4.6-2.6 4.6S3 10 3 7.6c0-2.8.8-5 2.4-5Z', G)}${rr(3.6, 12.8, 4.6, 3, 1.5, T)}${shape('M17.6 8c1.8 0 3 2 3 4.6 0 2.4-.6 4.6-2.6 4.6s-2.8-1.8-2.8-4.2c0-2.8.8-5 2.4-5Z', G)}${rr(15.8, 18.2, 4.6, 3, 1.5, T)}`,
  brain: () => `${shape('M11.2 3.6A3.4 3.4 0 0 0 5 5.2a3.6 3.6 0 0 0-2 5.6A3.6 3.6 0 0 0 5 16.6a3.6 3.6 0 0 0 6.2 2.8ZM12.8 3.6A3.4 3.4 0 0 1 19 5.2a3.6 3.6 0 0 1 2 5.6 3.6 3.6 0 0 1-2 5.8 3.6 3.6 0 0 1-6.2 2.8Z', R)}${line('M7.4 9.4a2.2 2.2 0 0 1 2.4 2M16.6 9.4a2.2 2.2 0 0 0-2.4 2M8 15.4h1.8M16 15.4h-1.8', K, 1.6)}`,
  battery: () => `${rr(1.5, 6, 18.5, 12, 3, T)}${rr(20.2, 9.4, 2.3, 5.2, 1, T)}${rr(3.8, 8.3, 9.5, 7.4, 1.4, G)}`,
  // ---- the class dashboard's widgets
  qr: () => `${rr(2.5, 2.5, 19, 19, 4, G)}${rr(5.5, 5.5, 5, 5, 1.2, K)}${rr(13.5, 5.5, 5, 5, 1.2, K)}${rr(5.5, 13.5, 5, 5, 1.2, K)}${rr(13.5, 13.5, 2.2, 2.2, .5, K)}${rr(16.3, 16.3, 2.2, 2.2, .5, K)}`,
  area: () => `${rr(2.5, 2.5, 19, 19, 3.6, G)}${line('M8.8 3v18M15.2 3v18M3 8.8h18M3 15.2h18', K, 1.6)}`,
  pattern: () => `${shape('M7 2.8 11.6 7.4 7 12 2.4 7.4Z', G, 1.4)}${shape('M17 2.8l4.6 4.6L17 12l-4.6-4.6Z', T, 1.4)}${shape('M7 12l4.6 4.6L7 21.2l-4.6-4.6Z', T, 1.4)}${shape('M17 12l4.6 4.6-4.6 4.6-4.6-4.6Z', G, 1.4)}`,
  algebra: () => `${rr(2.5, 2.5, 19, 19, 4, G)}${line('M7.6 7.6l8.8 8.8M16.4 7.6l-8.8 8.8', K, 2.6)}`,
  rods: () => `${rr(2.5, 3, 19, 4.6, 2, Y)}${rr(2.5, 9.7, 13, 4.6, 2, T)}${rr(2.5, 16.4, 7, 4.6, 2, Y)}${line('M8.6 3.4v4M15 3.4v4', K, 1.4)}`,
  placeval: () => `${rr(1.5, 3.5, 21, 17, 4, G)}${line('M6.6 9l2.2-1.6v9.2', K, 2.3)}${ring(15.2, 12, 3.4, K, 2.3)}`,
  hundreds: () => `${rr(2.5, 2.5, 19, 19, 3.6, Y)}${[6.2, 10.1, 14, 17.9].map(x => [6.2, 10.1, 14, 17.9].map(y => ci(x, y, 1.25, K)).join('')).join('')}`,
  breathe: () => `${ci(9.5, 14, 7.5, G)}${ring(9.5, 14, 7.5, T, 1.8)}${ci(18.6, 6.4, 3.4, G)}${ring(18.6, 6.4, 3.4, T, 1.6)}${ci(6.8, 11.2, 1.8, W)}`,
  morning: () => `${shape('M4.5 17a7.5 7.5 0 0 1 15 0Z', Y)}${line('M2 17h20M12 3.6v2.6M4.6 7.4l1.8 1.8M19.4 7.4l-1.8 1.8M6.5 20.6h11', T, 2.2)}`,
  quiet: () => `${shape('M2.5 9A1.5 1.5 0 0 1 4 7.5h3.2L12.5 3v18l-5.3-4.5H4A1.5 1.5 0 0 1 2.5 15Z', G)}${line('M16 9l5 6M21 9l-5 6', T, 2.4)}`,
  weather: () => `${ci(9, 8.6, 5, Y)}${line('M9 1.6v1.4M2 8.6h1.4M4 3.6l1 1M14 3.6l-1 1', T, 2)}${shape('M7.4 21a4.4 4.4 0 0 1-.4-8.8 6 6 0 0 1 11.4 1.6A3.6 3.6 0 0 1 18 21Z', G)}`,
  mood: () => `${chip(Y)}${ci(8.6, 10, 1.45, K)}${ci(15.4, 10, 1.45, K)}${line('M8 14.2a4.6 4.6 0 0 0 8 0', K, 2.1)}`,
  // ---- writing and files
  folder: () => `${shape('M1.8 6.2A2.2 2.2 0 0 1 4 4h4.6l2.2 2.4h9.2a2.2 2.2 0 0 1 2.2 2.2v9.8a2.2 2.2 0 0 1-2.2 2.2H4a2.2 2.2 0 0 1-2.2-2.2Z', Y)}${rr(1.8, 9, 20.4, 2.2, 0, K)}`,
  cabinet: () => `${rr(3.5, 2, 17, 20, 3, G)}${line('M3.8 12h16.4', K, 2)}${rr(9.5, 5.8, 5, 2.2, 1.1, K)}${rr(9.5, 15.2, 5, 2.2, 1.1, K)}`,
  clipboard: () => `${rr(3.5, 3.8, 17, 18.2, 3.2, G)}${rr(8.2, 1.6, 7.6, 4.6, 1.6, T)}${line('M8 13.6l2.8 2.8 5.4-5.6', K, 2.4)}`,
  note: () => `${rr(3, 2.5, 15, 19, 3, G)}${line('M6.5 8h7M6.5 11.5h5', K, 1.8)}${shape('M19.4 9.2a1.9 1.9 0 0 1 2.7 2.7l-7.6 7.6-3.6.9.9-3.6Z', T, 1)}`,
  page: () => `${pageShape(G)}${shape('M14.5 2v3.3a1.2 1.2 0 0 0 1.2 1.2H19Z', K)}${line('M8.5 12h7M8.5 15.5h7M8.5 8.5h3', K, 1.8)}`,
  pencil: () => `${shape('M15.4 3.6a2.6 2.6 0 0 1 3.7 0l1.3 1.3a2.6 2.6 0 0 1 0 3.7L9.2 19.8 3 21l1.2-6.2Z', Y)}${shape('M4.2 14.8 3 21l6.2-1.2Z', T)}<path d="M13.4 5.6l5 5" stroke="${K}" stroke-width="2"/>`,
  checkbox: () => `${rr(2.5, 2.5, 19, 19, 4.5, G)}${line('M7.2 12.4l3.2 3.2 6.4-6.6', K, 2.6)}`,
  save: () => `${shape('M2.5 5A2.5 2.5 0 0 1 5 2.5h11.5l5 5V19a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 19Z', G)}${rr(7, 2.5, 8.5, 6, 1.2, K)}${rr(6.5, 13, 11, 8.5, 1.6, W)}${line('M9 16.2h6', K, 1.6)}`,
  box: () => `${shape('M12 2 21.5 6.6v10.8L12 22 2.5 17.4V6.6Z', Y, 1.2)}${line('M2.8 6.8 12 11.3l9.2-4.5M12 11.3V21.6', K, 1.8)}${line('M7.2 4.4l9.3 4.6', K, 1.8)}`,
  tag: () => `${shape('M2.5 4.6A2.1 2.1 0 0 1 4.6 2.5h6.8l10.1 10.1a2.1 2.1 0 0 1 0 3l-5.9 5.9a2.1 2.1 0 0 1-3 0L2.5 11.4Z', G)}${ci(7.6, 7.6, 2.1, K)}${line('M11 13l4.4 4.4M13.6 10.4l4.4 4.4', K, 1.8)}`,
  bookmark: () => `${shape('M5 4.5A2.5 2.5 0 0 1 7.5 2h9A2.5 2.5 0 0 1 19 4.5V22l-7-4.6L5 22Z', R)}${shape(star5(12, 9.4, 3.6, 1.6), K)}`,
  id: () => `${rr(1.5, 4, 21, 16, 3.2, G)}${ci(8, 10.6, 2.4, K)}${shape('M4.2 16.8a3.8 3.6 0 0 1 7.6 0Z', K)}${line('M14 10h5M14 14h3.6', K, 1.8)}`,
  card: () => `${rr(1.5, 4.5, 21, 15, 3.2, G)}${rr(1.5, 8, 21, 3.2, 0, K)}${rr(5, 14.5, 5, 2, 1, K)}`,
  money: () => `${ci(12, 12, 10.3, Y)}${ring(12, 12, 7.2, K, 1.4)}${line('M14.4 9.2c-.5-.8-1.4-1.2-2.4-1.2-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.6.8 2.6 2.1-1.2 2-2.6 2c-1.1 0-2.1-.5-2.6-1.3M12 6.6v1.4M12 16v1.4', K, 1.6)}`,
  cart: () => `${line('M1.8 3h2.8l2.6 12.4h11.4L21 6.6H6', T, 2.2)}${shape('M6.6 6.6H21l-2.4 8.8H8.2Z', G)}${ci(9, 19.5, 1.9, T)}${ci(17.4, 19.5, 1.9, T)}`,
  // ---- messages and sharing
  message: () => `${shape('M3 5.6A3.1 3.1 0 0 1 6.1 2.5h11.8A3.1 3.1 0 0 1 21 5.6v8.3a3.1 3.1 0 0 1-3.1 3.1H11l-5 4.5v-4.5A3.1 3.1 0 0 1 3 13.9Z', G)}${ci(8, 9.8, 1.35, K)}${ci(12, 9.8, 1.35, K)}${ci(16, 9.8, 1.35, K)}`,
  mail: () => `${rr(1.5, 4.5, 21, 15, 3.2, G)}${line('M3 6.5 12 13l9-6.5', K, 2)}`,
  mailbox: () => `${shape('M6.5 5h11a4.5 4.5 0 0 1 4.5 4.5V17H2V9.5A4.5 4.5 0 0 1 6.5 5Z', G)}${line('M6.5 9.5a2 2 0 0 1 2 2V17', K, 1.8)}${line('M12 21.5V17', T, 2.4)}${shape('M15 2.2h4.2v3.2H16.6V11', R)}${line('M16.6 3v8', R, 1.8)}`,
  megaphone: () => `${shape('M3 9.5A1.5 1.5 0 0 1 4.5 8H8l9-5v18l-9-5H4.5A1.5 1.5 0 0 1 3 14.5Z', Y)}${line('M8 8.4v7.2', K, 1.8)}${line('M20 9.2a3.8 3.8 0 0 1 0 5.6', T, 2.2)}${line('M7 16.5l1.4 4.5', T, 2.4)}`,
  link: () => `${line('M10.2 13.8a4 4 0 0 0 5.6 0l3.4-3.4a4 4 0 0 0-5.6-5.6L12 6.4', T, 2.5)}${line('M13.8 10.2a4 4 0 0 0-5.6 0l-3.4 3.4a4 4 0 0 0 5.6 5.6l1.6-1.6', G, 2.5)}`,
  share: () => `${line('M6.5 12 17.5 6M6.5 12l11 6')}${ci(6, 12, 3.8, G)}${ci(18, 5.6, 3.2, G)}${ci(18, 18.4, 3.2, G)}`,
  send: () => `${shape('M21.4 2.6 2.6 10.2l7.2 3 3 7.2Z', G, 1.6)}${line('M21.4 2.6 9.8 13.2', K, 2)}`,
  inbox: () => `${rr(2.5, 13, 19, 8.5, 2.6, G)}${line('M12 2.8v10M7.2 8.2l4.8 4.8 4.8-4.8', T, 2.6)}${line('M7 16.8h10', K, 1.8)}`,
  upload: () => `${rr(2.5, 14, 19, 7.5, 2.6, G)}${line('M12 15V3.6M7 8.4l5-5 5 5', T, 2.6)}`,
  print: () => `${rr(6, 2, 12, 7, 1.6, G)}${rr(1.5, 7.5, 21, 10, 3, T)}${rr(6, 13.5, 12, 8.5, 1.6, G)}${line('M8.5 17h7', K, 1.6)}`,
  // ---- sound, pictures and screens
  mic: () => `${rr(8, 1.8, 8, 13, 4, R)}${line('M4.8 11a7.2 7.2 0 0 0 14.4 0M12 18.4v3.6')}`,
  speaker: () => `${shape('M2.5 9A1.5 1.5 0 0 1 4 7.5h3.2L12.5 3v18l-5.3-4.5H4A1.5 1.5 0 0 1 2.5 15Z', G)}${line('M16 8.6a4.6 4.6 0 0 1 0 6.8M18.8 5.6a8.6 8.6 0 0 1 0 12.8', T, 2.2)}`,
  headphones: () => `${line('M3.5 15v-3a8.5 8.5 0 0 1 17 0v3', T, 2.3)}${rr(2.2, 13.2, 5.4, 8.6, 2.4, G)}${rr(16.4, 13.2, 5.4, 8.6, 2.4, G)}`,
  ear: () => `${shape('M6 9a6.5 6.5 0 0 1 13 0c0 3.2-2 4.4-3.2 5.6-1 1-1.3 2.2-1.6 3.6a3.4 3.4 0 0 1-6.4.6', G)}${line('M6 9a6.5 6.5 0 0 1 13 0c0 3.2-2 4.4-3.2 5.6-1 1-1.3 2.2-1.6 3.6a3.4 3.4 0 0 1-6.4.6', T, 2.2)}${line('M10 9.4a2.6 2.6 0 0 1 5.2 0c0 1.6-1.6 2.2-1.6 3.6', K, 1.8)}`,
  music: () => `${line('M9 18V5.2L20 3v12.6', T, 2.3)}${ci(6.4, 18, 3.2, Y)}${ci(17.4, 15.6, 3.2, Y)}${line('M9 9l11-2.2', T, 2.3)}`,
  picture: () => `${rr(2, 3.5, 20, 17, 3.2, G)}${shape('M2.8 19.2 9 12.2l4.4 4.6 2.6-2.6 5.4 5.4', K, 1.4)}${ci(16.4, 8.6, 2.3, W)}`,
  camera: () => `${shape('M2 8.5A2.5 2.5 0 0 1 4.5 6h2.6l1.6-2.5h6.6L16.9 6h2.6A2.5 2.5 0 0 1 22 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5Z', G)}${ci(12, 13, 4.4, K)}${ci(12, 13, 2.2, W)}`,
  video: () => `${rr(2, 9, 20, 12.5, 2.8, G)}${shape('M2.6 5.8 19.8 2.4l.8 3.7L3.4 9.5Z', T, 1.2)}${shape('M10 12.4v6l4.8-3Z', K, 1.2)}`,
  projector: () => `${rr(1.5, 7, 21, 10.5, 3.2, T)}${ci(15.4, 12.2, 3.4, Y)}${ci(15.4, 12.2, 1.3, K)}${line('M5.5 17.5 4.4 21M18.5 17.5l1.1 3.5', T, 2)}`,
  laptop: () => `${rr(4, 4, 16, 12, 2.4, G)}${shape('M1.5 17.5h21l-1.3 2.6a2 2 0 0 1-1.8 1.1H4.6a2 2 0 0 1-1.8-1.1Z', T)}${rr(7, 7, 10, 6, 1.2, W)}`,
  phone: () => `${rr(5.5, 1.5, 13, 21, 3.4, G)}${rr(8, 4.5, 8, 12, 1.4, K)}${ci(12, 19.4, 1.3, K)}`,
  // ---- marks and states
  check: () => `${chip(G)}${line('M7.2 12.4l3.2 3.2 6.4-6.6', K, 2.6)}`,
  tick: () => line('M4 12.8l5 5L20.2 6.4', T, 3),
  cross: () => `${chip(R)}${line('M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6', K, 2.6)}`,
  warning: () => `${shape('M12 3 21.6 20H2.4Z', Y, 3)}${line('M12 9.2v5', K, 2.5)}${ci(12, 17.3, 1.4, K)}`,
  blocked: () => `${chip(R)}${rr(6, 10.6, 12, 2.8, 1.4, K)}`,
  help: () => `${chip(G)}${line('M9.2 9.4a2.9 2.9 0 1 1 4 2.7c-.8.4-1.2 1-1.2 1.8v.4', K, 2.4)}${ci(12, 17.6, 1.45, K)}`,
  info: () => `${chip(G)}${line('M12 11v6', K, 2.6)}${ci(12, 7.4, 1.5, K)}`,
  idea: () => `${shape('M12 2a7 7 0 0 0-4.2 12.6c.7.6 1.2 1.4 1.2 2.3V18h6v-1.1c0-.9.5-1.7 1.2-2.3A7 7 0 0 0 12 2Z', Y)}${line('M9.5 21.5h5', T, 2.4)}${line('M12 11.5V18', K, 1.8)}${ci(9.6, 7.4, 1.3, W)}`,
  star: () => shape(star5(12, 12.6, 10.4, 4.6), Y, 2) + shape(star5(12, 12.6, 3.6, 1.6), K),
  sparkle: () => `${shape('M10 2.5c.7 4.4 2.8 6.6 7.4 7.4-4.6.8-6.7 3-7.4 7.4-.7-4.4-2.8-6.6-7.4-7.4 4.6-.8 6.7-3 7.4-7.4Z', Y, 1.4)}${shape('M18.4 14.6c.3 1.9 1.2 2.8 3.1 3.1-1.9.3-2.8 1.2-3.1 3.1-.3-1.9-1.2-2.8-3.1-3.1 1.9-.3 2.8-1.2 3.1-3.1Z', T, 1)}${ci(10, 9.9, 1.3, K)}`,
  wand: () => `${line('M3.5 20.5 14 10', T, 2.8)}${shape('M17 2.5c.4 2.3 1.5 3.4 3.8 3.8-2.3.4-3.4 1.5-3.8 3.8-.4-2.3-1.5-3.4-3.8-3.8 2.3-.4 3.4-1.5 3.8-3.8Z', Y, 1.2)}${ci(17, 6.3, .9, K)}${ci(6.5, 4.5, 1.3, Y)}${ci(20.2, 15.5, 1.3, Y)}`,
  heart: () => `${shape('M12 20.8S2.5 15.4 2.5 8.6A4.9 4.9 0 0 1 12 6.4a4.9 4.9 0 0 1 9.5 2.2c0 6.8-9.5 12.2-9.5 12.2Z', R, 1.4)}${line('M12 20.8S2.5 15.4 2.5 8.6A4.9 4.9 0 0 1 12 6.4a4.9 4.9 0 0 1 9.5 2.2c0 6.8-9.5 12.2-9.5 12.2Z', T, 1.8)}${ci(7.6, 8.8, 1.4, W)}`,
  like: () => `${rr(2, 10, 4.5, 11, 1.4, T)}${shape('M8.5 10.2 12.2 3c1.6 0 2.8 1.3 2.6 2.9l-.6 3.6h5a2.2 2.2 0 0 1 2.2 2.6l-1.3 7a2.2 2.2 0 0 1-2.2 1.9H8.5Z', Y)}${line('M12 13.6h4.6', K, 1.6)}`,
  hand: () => `${shape('M7 12.5V5.5a1.6 1.6 0 0 1 3.2 0V11V3.8a1.6 1.6 0 0 1 3.2 0V11V5a1.6 1.6 0 0 1 3.2 0v7.5V8.6a1.6 1.6 0 0 1 3.2 0v6.2a7.2 7.2 0 0 1-7.2 7.2h-.6c-2.3 0-4.1-1.1-5.4-3L3.6 14.4a1.7 1.7 0 0 1 2.7-2Z', Y)}${line('M10.2 11V6.6M13.4 11V4.8M16.6 12.5V6.8', K, 1.4)}`,
  handshake: () => `${shape('M1.5 8.5 6 5.5l4.5 1.6L15 5.2l7.5 3.6v6.6l-3 1.6-6 4.2a1.8 1.8 0 0 1-2.3-.2L4.5 15.8 1.5 14Z', G)}${line('M10.5 7.1 7.4 10a1.7 1.7 0 0 0 2.3 2.4l3.6-2.6 5.4 4.6M10.6 15.6l2 1.8M8.2 13.8l2 1.8', K, 1.7)}`,
  trophy: () => `${line('M6.5 5.5H3.4v1.6a4 4 0 0 0 4 4M17.5 5.5h3.1v1.6a4 4 0 0 1-4 4', T, 2)}${shape('M6.3 2.5h11.4v6.2a5.7 5.7 0 0 1-11.4 0Z', Y)}<path d="M12 14.4v3.4" stroke="${T}" stroke-width="2.4"/>${rr(7, 17.6, 10, 4, 1.6, T)}${shape(star5(12, 8, 2.6, 1.15), K)}`,
  medal: () => `${shape('M6.5 2h4.2l2.6 6.2-3.4 1.6Z', T)}${shape('M17.5 2h-4.2l-1.5 3.6 2.2 4.2Z', T)}${ci(12, 15.2, 6.8, Y)}${shape(star5(12, 15.4, 3.3, 1.45), K)}`,
  party: () => `${shape('M3 21 7.6 7.4l9 9Z', Y, 1.6)}${line('M5.2 14.4l4.4 4.4M6.6 10.6l6.8 6.8', K, 1.6)}${line('M14 4.5c1.2 1.5.4 3 1.5 3.6M19.5 10c-1.5-1.2-3-.4-3.6-1.5', T, 1.8)}${ci(19, 4.4, 1.4, T)}${ci(12.5, 2.6, 1, T)}${ci(21.2, 13.6, 1, T)}`,
  gift: () => `${rr(2.5, 8, 19, 5, 1.6, Y)}${rr(4, 12.5, 16, 9.5, 1.8, Y)}${rr(10.6, 8, 2.8, 14, 0, K)}${line('M12 8C10.8 4.2 6.2 3.6 6.4 6.2 6.6 8 12 8 12 8s5.4 0 5.6-1.8C17.8 3.6 13.2 4.2 12 8Z', T, 2)}`,
  fire: () => `${shape('M12 22c-4.4 0-7.5-3-7.5-7.1 0-3.4 2.1-5.4 3.8-7.6.3 1.9 1.4 3 2.4 3.5.2-3.4 1.6-6.3 4.4-8.6.2 3.7 4.4 6.4 4.4 12.6C19.5 19 16.4 22 12 22Z', R)}${shape('M12 22c-2 0-3.4-1.4-3.4-3.3 0-1.9 1.6-3.1 2.9-4.5.2 1.3.9 2 1.7 2.2.6-.9.9-1.8 1-2.8 1.1 1 2 2.4 2 4.6 0 2.4-1.8 3.8-4.2 3.8Z', K)}`,
  bolt: () => shape('M13.6 2 4.5 13.4h6.2L9.6 22l9.9-12.2h-6.4Z', Y, 1.8) + line('M11.5 13.4 10.6 18', K, 1.6),
  rocket: () => `${shape('M12 2c3.8 2.4 5.6 6.4 5 11.2l-2.2 3.4H9.2L7 13.2C6.4 8.4 8.2 4.4 12 2Z', G)}${ci(12, 9, 2.1, K)}${shape('M7 12.4 3.5 16l.5 3.6 4-2.4ZM17 12.4l3.5 3.6-.5 3.6-4-2.4Z', T)}${shape('M10 18h4l-2 4Z', R)}`,
  // ---- things
  lock: () => `${line('M7.4 10.5V7.6a4.6 4.6 0 0 1 9.2 0v2.9', T, 2.4)}${rr(3.5, 10, 17, 12, 3.4, Y)}${ci(12, 15, 1.7, K)}${line('M12 15.8v2.6', K, 2)}`,
  key: () => `${ci(7.5, 12, 5.3, Y)}${ci(7.5, 12, 1.8, K)}${line('M12.6 12h9M18.4 12v3.6M21.4 12v2.8', T, 2.4)}`,
  shield: () => `${shape('M12 2 20.5 5v6.4c0 5.1-3.6 9-8.5 10.6C7.1 20.4 3.5 16.5 3.5 11.4V5Z', G, 1.2)}${line('M8.2 12.2l2.6 2.6 5-5.2', K, 2.3)}`,
  scissors: () => `${ring(6.2, 17.8, 3, T, 2.3)}${ring(17.8, 17.8, 3, T, 2.3)}${shape('M8.6 15.6 18.6 2.5l1.2 1.2-8.2 13.8Z', G, 1)}${shape('M15.4 15.6 5.4 2.5 4.2 3.7l8.2 13.8Z', G, 1)}${ci(12, 11.7, 1.2, K)}`,
  backpack: () => `${line('M9 5V4a3 3 0 0 1 6 0v1', T, 2.2)}${rr(4, 5, 16, 17, 5, Y)}${rr(7.5, 13, 9, 6, 2, K)}${line('M7.5 9.6h9', K, 1.6)}`,
  scale: () => `${line('M12 3v17M6 21h12M4 6.5h16', T, 2.2)}${shape('M1.5 13.5 4 7.5l2.5 6Z', T, 0)}${shape('M17.5 13.5 20 7.5l2.5 6Z', T, 0)}${shape('M1.2 13.2h5.6a2.8 2.8 0 0 1-5.6 0Z', G, 1)}${shape('M17.2 13.2h5.6a2.8 2.8 0 0 1-5.6 0Z', G, 1)}`,
  compass: () => `${chip(G)}${shape('M15.8 8.2 13.4 13.4 8.2 15.8 10.6 10.6Z', K, 1.2)}${ci(12, 12, 1.1, G)}`,
  // Lat/long globe drawn like the old Fluent one (lines only, no fill): outline, equator, two parallels, center meridian and one meridian pair.
  globe: () => line('M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 1 0 0-19ZM2.5 12h19M3.8 7.2h16.4M3.8 16.8h16.4M12 2.5v19M12 2.5c-2.9 2.6-4.3 5.8-4.3 9.5s1.4 6.9 4.3 9.5M12 2.5c2.9 2.6 4.3 5.8 4.3 9.5s-1.4 6.9-4.3 9.5', K, 1.7),
  world: () => `${ci(12, 12, 10, G)}${shape('M7 4.2c1.6 1.2 1.2 2.8 3 3.4 1.4.5 1.6 2 .6 2.9-1.2 1-3 .4-4 1.6-.9 1.1-.2 2.6-1.4 3.4A10 10 0 0 1 7 4.2ZM15.6 21.4c-.3-2 .6-3 1.6-4.2 1.2-1.4.4-3 1.8-3.8.9-.5 1.8-.4 2.8.3a10 10 0 0 1-6.2 7.7Z', K)}`,
  map: () => `${shape('M2 5.5 8 3l8 2.6 6-2.5v15.4L16 21l-8-2.6L2 21Z', G)}${line('M8 3.2v15.2M16 5.6v15.2', K, 1.8)}`,
  flag: () => `${line('M5 22V3', T, 2.4)}${shape('M5.2 3.5h13.6l-3.2 4.6 3.2 4.6H5.2Z', R, 1.4)}`,
  finish: () => `${line('M5 22V3', T, 2.4)}${rr(5.2, 3, 14.6, 10, 1.4, G)}${rr(5.2, 3, 3.65, 3.33, 0, K)}${rr(12.5, 3, 3.65, 3.33, 0, K)}${rr(8.85, 6.33, 3.65, 3.33, 0, K)}${rr(16.15, 6.33, 3.65, 3.33, 0, K)}${rr(5.2, 9.66, 3.65, 3.34, 0, K)}${rr(12.5, 9.66, 3.65, 3.34, 0, K)}`,
  trash: () => `${line('M3 6h18M9.5 6V3.6h5V6', T, 2.2)}${shape('M5 8h14l-1.1 12a2.2 2.2 0 0 1-2.2 2H8.3a2.2 2.2 0 0 1-2.2-2Z', G)}${line('M10 11.5v6.5M14 11.5v6.5', K, 1.8)}`,
  puzzle: () => shape('M4 6.5A2.5 2.5 0 0 1 6.5 4h2.8a2.6 2.6 0 1 1 5.2 0h2.8a2.5 2.5 0 0 1 2.5 2.5v2.8a2.6 2.6 0 1 1 0 5.2v2.8a2.5 2.5 0 0 1-2.5 2.5h-2.8a2.6 2.6 0 1 0-5.2 0H6.5A2.5 2.5 0 0 1 4 17.5v-2.8a2.6 2.6 0 1 0 0-5.2Z', G) + rr(8.6, 8.6, 6.8, 6.8, 1.6, K),
  art: () => `${shape('M12 2.2C6.4 2.2 2 6.4 2 11.7c0 5.6 4.6 9.9 10 9.9 1.4 0 2-.9 2-1.9 0-1.4-1-1.9-1-3 0-1.2 1-2.1 2.4-2.1h2.2c2.6 0 4.4-1.8 4.4-4.4 0-4.4-4.6-8-10-8Z', Y)}${ci(7.2, 11.4, 1.6, K)}${ci(9.6, 6.8, 1.6, K)}${ci(14.6, 6.6, 1.6, K)}${ci(17.6, 10.4, 1.6, K)}`,
  science: () => `${line('M8.5 2.5h7', T, 2.4)}${shape('M9.8 3h4.4v6.2l5.4 9.4a2.3 2.3 0 0 1-2 3.4H6.4a2.3 2.3 0 0 1-2-3.4l5.4-9.4Z', G)}${shape('M6.6 15h10.8l1.9 3.6a1.5 1.5 0 0 1-1.3 2.2H6a1.5 1.5 0 0 1-1.3-2.2Z', K)}${ci(10, 17.8, 1, G)}${ci(13.8, 17, .8, G)}`,
  sprout: () => `${line('M12 22v-9', T, 2.4)}${shape('M12 13.2C12 8 8.6 5 3.5 5 3.5 10 6.8 13.2 12 13.2Z', G)}${shape('M12 11.2C12 6.6 15 3.5 20.5 3.5c0 4.6-3 7.7-8.5 7.7Z', G)}${line('M6.6 8.2 11 12.2M17.2 6.8 13 10.2', K, 1.5)}`,
  ticket: () => `${shape('M2 7.2A2.2 2.2 0 0 1 4.2 5h15.6A2.2 2.2 0 0 1 22 7.2v2.6a2.2 2.2 0 0 0 0 4.4v2.6a2.2 2.2 0 0 1-2.2 2.2H4.2A2.2 2.2 0 0 1 2 16.8v-2.6a2.2 2.2 0 0 0 0-4.4Z', R)}${line('M15 7.5v1.4M15 11.3v1.4M15 15.1v1.4', K, 1.8)}`,
  // ---- media controls and arrows
  playBtn: () => `${rr(2, 2, 20, 20, 5, G)}${shape('M9.5 7.6 17 12 9.5 16.4Z', K, 1.6)}`,
  stop: () => `${rr(2, 2, 20, 20, 5, R)}${rr(7.5, 7.5, 9, 9, 1.6, K)}`,
  next: () => `${rr(2, 2, 20, 20, 5, G)}${shape('M6.5 7.6 12.5 12l-6 4.4Z', K, 1.4)}${shape('M12 7.6 18 12l-6 4.4Z', K, 1.4)}${line('M18.2 7.4v9.2', K, 1.8)}`,
  down: () => `${chip(G)}${line('M12 6.5v11M7.5 13l4.5 4.5 4.5-4.5', K, 2.5)}`,
  up: () => `${chip(G)}${line('M12 17.5v-11M7.5 11 12 6.5l4.5 4.5', K, 2.5)}`,
  right: () => `${chip(G)}${line('M6.5 12h11M13 7.5l4.5 4.5-4.5 4.5', K, 2.5)}`,
  // ---- math and words
  plus: () => `${chip(G)}${line('M12 7v10M7 12h10', K, 2.6)}`,
  minus: () => `${chip(G)}${line('M7 12h10', K, 2.6)}`,
  times: () => `${chip(G)}${line('M8.4 8.4l7.2 7.2M15.6 8.4l-7.2 7.2', K, 2.6)}`,
  divide: () => `${chip(G)}${line('M7 12h10', K, 2.6)}${ci(12, 7.8, 1.5, K)}${ci(12, 16.2, 1.5, K)}`,
  equals: () => `${chip(G)}${line('M7.4 9.8h9.2M7.4 14.2h9.2', K, 2.6)}`,
  letters: () => `${rr(1.5, 3, 21, 18, 4, G)}${line('M5 17 8.5 7l3.5 10M6.2 13.6h4.6', K, 2.1)}${ring(16.6, 14, 2.6, K, 2)}${line('M19.2 11.2V17', K, 2)}`,
  numbers: () => `${rr(1.5, 3, 21, 18, 4, G)}${line('M4.6 9l1.8-1.4V17', K, 2)}${line('M9.6 9.4a2 2 0 0 1 3.8.8c0 2.2-3.8 3.6-3.8 6.8h4', K, 2)}${line('M16 8h3.6l-2 3a2.6 2.6 0 1 1-1.8 4.8', K, 2)}`,
  // ---- theme and leaving
  sun: () => sun(Y),
  moon: () => `${shape('M20.4 14.6A8.8 8.8 0 1 1 9.4 3.6a7 7 0 0 0 11 11Z', Y, 1.2)}${ci(9.4, 13.6, 1.2, K)}${ci(13, 17, .9, K)}`,
  auto: () => `${ci(12, 12, 9.4, Y)}${shape('M12 2.6a9.4 9.4 0 0 1 0 18.8Z', T)}${ring(12, 12, 9.4, T, 1.8)}`,
  door: () => `${rr(4, 2, 13, 20, 2.6, G)}${ci(13.6, 12.4, 1.4, K)}${line('M2 22h20')}`,
};

// Fluent file name (public/js/icons.js FLUENT) -> Oomba concept. Names not here stay Fluent: they are content (animals,
// food, weather, characters, faces, hands as gestures, color swatches, sports, the class signs), not controls.
export const CONCEPT = {
  'magnifying-glass-tilted-left': 'search', 'magnifying-glass-tilted-right': 'search', gear: 'settings', 'red-apple': 'classroom', 'satellite-antenna': 'live',
  'hammer-and-wrench': 'build', toolbox: 'tools', wrench: 'wrench', 'video-game': 'games', books: 'lessons', 'open-book': 'book', 'graduation-cap': 'learn',
  'woman-student': 'student', student: 'student', teacher: 'teacher', 'house-with-garden': 'grownups', 'hugging-face': 'friends', 'person-with-bunny-ears': 'players',
  person: 'person', child: 'kid', 'desktop-computer': 'dashboard', laptop: 'laptop', 'mobile-phone': 'phone', 'bar-chart': 'progress', 'chart-increasing': 'growth',
  calendar: 'calendar', 'spiral-calendar': 'calendar', 'tear-off-calendar': 'calendar', 'three-oclock': 'clock', 'nine-oclock': 'clock', 'mantelpiece-clock': 'clock',
  stopwatch: 'timer', 'alarm-clock': 'timer', 'hourglass-done': 'hourglass', 'hourglass-not-done': 'hourglass', 'file-folder': 'folder', 'card-index-dividers': 'folder',
  'card-file-box': 'cabinet', clipboard: 'clipboard', memo: 'note', 'spiral-notepad': 'note', 'page-facing-up': 'page', scroll: 'page', pencil: 'pencil', pen: 'pencil',
  'writing-hand': 'pencil', 'speech-balloon': 'message', envelope: 'mail', 'e-mail': 'mail', 'incoming-envelope': 'mail', 'open-mailbox-with-raised-flag': 'mailbox',
  megaphone: 'megaphone', link: 'link', printer: 'print', 'outbox-tray': 'send', 'inbox-tray': 'inbox', microphone: 'mic', 'speaker-high-volume': 'speaker',
  headphone: 'headphones', ear: 'ear', star: 'star', 'glowing-star': 'star', sparkles: 'sparkle', 'magic-wand': 'wand', trophy: 'trophy', 'sports-medal': 'medal',
  'party-popper': 'party', 'wrapped-gift': 'gift', 'check-mark-button': 'check', 'check-mark': 'tick', 'check-box-with-check': 'checkbox', 'cross-mark': 'cross',
  multiply: 'times', warning: 'warning', 'no-entry': 'blocked', prohibited: 'blocked', 'red-question-mark': 'help', information: 'info', 'light-bulb': 'idea', house: 'home',
  'globe-with-meridians': 'globe', 'globe-showing-europe-africa': 'world', 'world-map': 'map', compass: 'compass', locked: 'lock', key: 'key', shield: 'shield',
  pushpin: 'pin', 'round-pushpin': 'pin', paperclip: 'clip', scissors: 'scissors', bullseye: 'target', 'triangular-flag': 'flag', 'chequered-flag': 'finish', eyes: 'eyes',
  eye: 'eye', broom: 'broom', wastebasket: 'trash', 'shuffle-tracks-button': 'shuffle', 'repeat-button': 'repeat', 'counterclockwise-arrows-button': 'refresh',
  'next-track-button': 'next', 'play-button': 'playBtn', 'stop-button': 'stop', 'right-arrow-curving-left': 'undo', 'down-arrow': 'down', 'up-arrow': 'up',
  'right-arrow': 'right', 'framed-picture': 'picture', camera: 'camera', 'clapper-board': 'video', 'film-projector': 'projector', 'floppy-disk': 'save', package: 'box',
  label: 'tag', bookmark: 'bookmark', 'identification-card': 'id', 'credit-card': 'card', 'dollar-banknote': 'money', coin: 'money', 'shopping-cart': 'cart',
  'shopping-bags': 'cart', 'musical-score': 'music', 'artist-palette': 'art', 'puzzle-piece': 'puzzle', 'game-die': 'dice', rocket: 'rocket', fire: 'fire',
  'high-voltage': 'bolt', 'red-heart': 'heart', 'white-heart': 'heart', 'yellow-heart': 'heart', school: 'school', 'classical-building': 'school', backpack: 'backpack',
  'balance-scale': 'scale', 'straight-ruler': 'ruler', 'triangular-ruler': 'figures', abacus: 'manipulatives', 'test-tube': 'science', handshake: 'handshake',
  'thumbs-up': 'like', 'raised-hand': 'hand', 'person-raising-hand': 'hand', plus: 'plus', minus: 'minus', divide: 'divide', 'heavy-equals-sign': 'equals',
  'input-latin-letters': 'letters', 'input-numbers': 'numbers', sun: 'sun', 'crescent-moon': 'moon', 'first-quarter-moon': 'auto', door: 'door',
  'admission-tickets': 'ticket', seedling: 'sprout', 'vertical-traffic-light': 'traffic', 'slightly-smiling-face': 'me', sponge: 'eraser', crayon: 'marker',
  'backhand-index-pointing-up': 'pointer', 'index-pointing-up': 'pointer', restroom: 'restroom', 'potable-water': 'water', 'adhesive-bandage': 'bandage',
  'recycling-symbol': 'refresh', footprints: 'steps', brain: 'brain', battery: 'battery', 'white-square-button': 'qr', 'black-square-button': 'area',
  'large-blue-diamond': 'pattern', 'purple-square': 'algebra', 'orange-square': 'rods', 'keycap-10': 'placeval', 'hundred-points': 'hundreds', bubbles: 'breathe',
  sunrise: 'morning', 'shushing-face': 'quiet', 'sun-behind-cloud': 'weather', 'smiling-face-with-smiling-eyes': 'mood',
};
