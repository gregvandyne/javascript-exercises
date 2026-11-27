// Cuts the frame-by-frame clips into the ~58 s teacher demo (silent master, 16:9): node scripts/demo-video/assemble.mjs
// Writes /tmp/claude-0/demo/v2/video-16x9.mp4, timeline.json (scene starts, for fit-music.mjs) and video-16x9.en.vtt.
//
// Layout: the caption sits in a strip at the top of the frame and the app plays in the band under it (1920 x 930 from
// y 150), so a caption never covers the page. The UI is shown big enough to read at 720p: the host's wizard, the
// games and the Builder are recorded in windows shaped like the band; the live room is cropped to the board (or the
// join code) next to the phone; the Builder is cropped to its chat and preview.
// Captions are one layer over the joined video, not part of the scenes, so two captions never cross-fade over each
// other: each fades out before the scene change and the next fades in after it. Scenes slide in, not cross-fade. The games fade to the end card's
// color and the end card fades in from it (no cross-fade of the end card's words over a game).
// The 9:16 cut is no longer made: the page plays the 16:9 web cut (mix.mjs skips a missing 9x16 master).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
if (process.argv[2] && process.argv[2] !== 'land') { console.error('Only the 16:9 cut (land) is made now.'); process.exit(1); }
const O = 'land', [W, H] = [1920, 1080];
const C = '/tmp/claude-0/demo2/clips', K = '/tmp/claude-0/demo/cards', S = `/tmp/claude-0/demo2/seg-${O}`, V2 = '/tmp/claude-0/demo/v2';
fs.mkdirSync(S, { recursive: true }); fs.mkdirSync(V2, { recursive: true });
const dur = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();
const ff = args => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', '30'];
const img = f => ['-loop', '1', '-framerate', '30', '-i', f];
const BAND = { y: 150, h: 930 };   // the app's band under the caption strip
const CREAM = '0xFFFDF2';          // the end card's background
/** trim [a, a+d*sp] and play it in d seconds (sp > 1 drops frames evenly; sp < 1 is avoided) */
const span = (a, d, sp = 1) => `trim=start=${a.toFixed(3)}:duration=${(d * sp + 0.1).toFixed(3)},setpts=(PTS-STARTPTS)/${sp.toFixed(4)},fps=30`;
const even = x => Math.round(x / 2) * 2;
const segs = [];
function seg(name, inputs, filter, d, caps = []) {
  const out = path.join(S, name + '.mp4');
  ff([...inputs, '-filter_complex', filter, '-map', '[out]', '-t', d.toFixed(3), ...ENC, out]);
  segs.push({ name, out, d, caps }); console.log(name, d);
}
const bj = JSON.parse(fs.readFileSync(`${C}/builder-${O}.json`, 'utf8'));
const gj = JSON.parse(fs.readFileSync(`${C}/live-game.json`, 'utf8'));
const D = { hook: 5.2, pick: 5.4, join: 4.8, battle: 9.4, build: 15.25, play: 5.0, games: 11.0, end: 5.0 };
const BG = ['-loop', '1', '-framerate', '30', '-i', `${K}/bg-${O}.png`];

// 1. Hook: Atlas Quest's lit globe turning, the title beside it
seg('1-hook', ['-i', `${C}/atlas-${O}.mp4`, ...img(`${K}/hook-${O}.png`)],
  `[0:v]${span(0.2, D.hook)},scale=${W}:${H}:flags=lanczos,setsar=1[v];[1:v]format=rgba,fade=t=in:st=0.45:d=0.5:alpha=1[t];[v][t]overlay=0:0,format=yuv420p[out]`, D.hook);

// 2a. The teacher picks a lesson, a level, who can join and teams (the wizard, recorded in the band's shape)
{ const f = `${C}/live-pick.mp4`, len = dur(f), a = 0.25, sp = Math.max(1, (len - a - 0.05) / D.pick);
  seg('2a-pick', [...BG, '-i', f], `[1:v]${span(a, D.pick, sp)},scale=${W}:${BAND.h}:flags=lanczos,setsar=1[p];[0:v]scale=${W}:${H}[bg];[bg][p]overlay=0:${BAND.y},format=yuv420p[out]`, D.pick, [['live1', 0, D.pick]]); }

// Board + phone: a crop of the host's page (css px of a 1440 x 810 window, recorded at gj.scale) beside the phone
const bez = JSON.parse(fs.readFileSync(`${K}/bezel-a.json`, 'utf8'));
const PH = { x: 1448, y: 160 }, AREA = { x: 40, y: 168, w: 1370, h: 892 };   // the phone (with bezel) and the board's box
/** input i played as parts [[a, d, sp], ...] one after another -> a filter that ends in [out] */
const parts = (i, ps, out) => ps.length === 1 ? `[${i}:v]${span(...ps[0])}[${out}]`
  : `[${i}:v]split=${ps.length}${ps.map((_, j) => `[${out}s${j}]`).join('')};` + ps.map((p, j) => `[${out}s${j}]${span(...p)},trim=duration=${p[1].toFixed(3)},setpts=PTS-STARTPTS[${out}p${j}]`).join(';') + ';' + ps.map((_, j) => `[${out}p${j}]`).join('') + `concat=n=${ps.length}:v=1:a=0[${out}]`;
function boardPhone(name, boardF, phoneF, ps, crop, cap) {
  const d = ps.reduce((t, p) => t + p[1], 0);
  const k = gj.scale, cw = even(crop.w * k), ch = even(crop.h * k), cx = even(crop.x * k), cy = even(crop.y * k);
  const s = Math.min(AREA.w / crop.w, AREA.h / crop.h), bw = even(crop.w * s), bh = even(crop.h * s);
  const bx = AREA.x + Math.round((AREA.w - bw) / 2), by = AREA.y + Math.round((AREA.h - bh) / 2);
  const f = `[2:v]scale=${W}:${H}[bg];` +
    parts(0, ps, 'b0') + `;[b0]crop=${cw}:${ch}:${cx}:${cy},scale=${bw}:${bh}:flags=lanczos,setsar=1[b];` +
    parts(1, ps, 'p0') + `;[p0]scale=${bez.sw}:${bez.sh}:flags=lanczos,setsar=1[p];` +
    `[bg][b]overlay=${bx}:${by}[v1];[v1][p]overlay=${PH.x + bez.b}:${PH.y + bez.b}[v2];[v2][3:v]overlay=${PH.x}:${PH.y},format=yuv420p[out]`;
  seg(name, ['-i', boardF, '-i', phoneF, ...img(`${K}/bg-${O}.png`), ...img(`${K}/bezel-a.png`)], f, d, [[cap, 0, d]]);
}
// 2b. a phone types the code and joins: the code card and the names in the room
{ const len = dur(`${C}/live-lobby-host.mp4`), g = gj.game, c = gj.card;
  const crop = { x: g.x - 4, y: c.y - 6, w: c.x + c.w + 10 - (g.x - 4), h: c.h + 16 };
  boardPhone('2b-join', `${C}/live-lobby-host.mp4`, `${C}/live-lobby-phone.mp4`, [[Math.max(0, len - D.join - 0.02), D.join]], crop, 'live2'); }
// 2c. the teacher opens a tile, everyone answers, the team scores go up: the game on the host's page
// (from just before the tile is picked to the new scores; the answer's still reveal card plays at double speed)
{ const g = gj.game, crop = { x: g.x, y: g.y, w: g.w, h: Math.min(g.h, 810 - g.y) }, a = Math.max(0, gj.pick - 0.4), m = gj.r + 0.8;
  const b = Math.min(gj.end - 0.05, gj.r + 4.9), d2 = (b - m) / 2, d1 = D.battle - d2, sp = Math.max(1, (m - a) / d1);
  boardPhone('2c-battle', `${C}/live-game-host.mp4`, `${C}/live-game-phone.mp4`, [[a, d1, sp], [m, d2, 2]], crop, 'live3'); }

// 3a. The Builder: type, build, playtest. Cropped to the chat and the preview (css px of its 1440 x 810 window, from
// under the Builder's header to the bottom), as wide as the band.
{ const f = `${C}/builder-${O}.mp4`, a = 0.25, b = bj.done + 0.5, sp = Math.max(1, (b - a) / D.build), cut = Math.min(D.build - 0.5, (bj.send - a) / sp + 1.4);
  const k = 3840 / 1440, cr = { x: 8, y: 300, w: 1072, h: 510 }, h = even(W * cr.h / cr.w);
  seg('3a-build', [...BG, '-i', f], `[1:v]${span(a, D.build, sp)},crop=${even(cr.w * k)}:${even(cr.h * k)}:${even(cr.x * k)}:${even(cr.y * k)},scale=${W}:${h}:flags=lanczos,setsar=1[p];[0:v]scale=${W}:${H}[bg];[bg][p]overlay=0:${H - h - 4},format=yuv420p[out]`,
    D.build, [['build1', 0, cut], ['build2', cut, D.build]]); }
// 3b. ...and play it: the sideways preview, as big as fits under the caption
{ const f = `${C}/builder-${O}.mp4`, a = Math.max(0, bj.end - D.play - 0.15), d = D.play;
  const z = JSON.parse(fs.readFileSync(`${C}/builder-${O}-box.json`, 'utf8'));
  seg('3b-play', [...BG, '-i', f], `[0:v]scale=${W}:${H}[bg];[1:v]${span(a, d)},crop=${z.w}:${z.h}:${z.x}:${z.y},scale=w=1760:h=900:force_original_aspect_ratio=decrease:flags=lanczos,setsar=1[g];[bg][g]overlay=(W-w)/2:${BAND.y + 8},format=yuv420p[out]`, d, [['build3', 0, d]]); }

// 4. Montage of official games a visitor can find today (each clip's own smooth motion), in the band; the last one
// fades to the end card's color
{ const parts = [['atlasq', 0.15], ['wordhunt', 0.1], ['crossword', 0.15], ['chess', 0.2]], each = D.games / parts.length;
  const ins = parts.flatMap(([g]) => ['-i', `${C}/${g}-${O}.mp4`]);
  const f = parts.map(([, ss], i) => `[${i + 1}:v]${span(ss, each)},scale=${W}:${BAND.h}:flags=lanczos,setsar=1,trim=duration=${each.toFixed(3)},setpts=PTS-STARTPTS[m${i}]`).join(';') + ';' +
    parts.map((_, i) => `[m${i}]`).join('') + `concat=n=${parts.length}:v=1:a=0[mv];[0:v]scale=${W}:${H},trim=duration=${D.games}[bg];[bg][mv]overlay=0:${BAND.y},fade=t=out:st=${(D.games - 0.45).toFixed(3)}:d=0.45:color=${CREAM},format=yuv420p[out]`;
  seg('4-games', [...BG, ...ins], f, D.games, [['games', 0, D.games - 0.45]]); }

// 5. End card, fading in from its own background color
seg('5-end', [...img(`${K}/end-${O}.png`)], `[0:v]scale=${W}:${H},setsar=1,fade=t=in:st=0:d=0.45:color=${CREAM},format=yuv420p[out]`, D.end);

// Join: a short slide from one scene to the next (a cross-fade shows two pages of text over each other), and a
// straight cut (both sides at the end card's color) into the end card
const X = 0.35;
let f = '', last = '0:v', t = 0; const starts = [];
segs.forEach((s, i) => {
  if (i === 0) { starts.push(0); t = s.d; return; }
  const x = i === segs.length - 1 ? 0 : X, o = `x${i}`;
  t -= x; starts.push(+t.toFixed(3));
  f += x ? `[${last}][${i}:v]xfade=transition=slideleft:duration=${x}:offset=${t.toFixed(3)}[${o}];` : `[${last}][${i}:v]concat=n=2:v=1:a=0[${o}];`;
  last = o; t += s.d;
});
const total = t;
// Captions: each in view from just after its scene's transition to just before the next one, 0.2 s fades
const CF = 0.2, capList = [];
segs.forEach((s, i) => s.caps.forEach(([name, a, b]) => {
  const inX = i > 0 && a === 0 ? X : 0, outX = b >= s.d - 0.01 && i + 1 < segs.length - 1 ? X : 0;   // the next scene slides in
  const t0 = starts[i] + a + inX + (a ? 0.06 : 0.04), t1 = starts[i] + b - outX - (b < s.d - 0.01 ? 0.06 : 0.04);
  capList.push({ name, t0: +t0.toFixed(3), t1: +t1.toFixed(3) });
}));
const nSeg = segs.length;
capList.forEach((c, j) => {
  const fi = nSeg + j, o = `c${j}`;
  f += `[${fi}:v]format=rgba,fade=t=in:st=${c.t0}:d=${CF}:alpha=1,fade=t=out:st=${(c.t1 - CF).toFixed(3)}:d=${CF}:alpha=1[k${j}];[${last}][k${j}]overlay=0:0:eof_action=pass[${o}];`;
  last = o;
});
f += `[${last}]format=yuv420p[out]`;
const out = path.join(V2, 'video-16x9.mp4');
ff([...segs.flatMap(s => ['-i', s.out]), ...capList.flatMap(c => ['-loop', '1', '-framerate', '30', '-t', total.toFixed(3), '-i', `${K}/cap-${c.name}-${O}.png`]),
  '-filter_complex', f, '-map', '[out]', '-t', total.toFixed(3), '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an', out]);
fs.writeFileSync(path.join(V2, 'timeline.json'), JSON.stringify(segs.map((s, i) => ({ scene: s.name, start: starts[i], dur: s.d })), null, 1));
console.log(out, dur(out).toFixed(2) + 's', (fs.statSync(out).size / 1e6).toFixed(1) + ' MB', 'end card at', starts[starts.length - 1]);
// Captions as WebVTT: the same words as on screen, at the same times (the hook's title and the end card are cards)
const TEXT = {
  live1: 'Pick any subject, any level.', live2: 'Students join with a code and get a safe made-up name.', live3: 'Everyone answers. Which team is on top?',
  build1: 'Kids describe a game in their own words.', build2: 'The Builder makes it, and plays it to check it works.', build3: 'Then they play it!', games: 'Learning games in 13 languages.',
};
const ts = x => { const m = Math.floor(x / 60), sec = x - m * 60; return `00:${String(m).padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`; };
let vtt = `WEBVTT\n\n${ts(0.5)} --> ${ts(starts[1])}\nLive class games your students love, and they can build their own.\n\n`;
for (const c of capList) vtt += `${ts(c.t0)} --> ${ts(c.t1)}\n${TEXT[c.name]}\n\n`;
vtt += `${ts(starts[starts.length - 1] + 0.3)} --> ${ts(total - 0.1)}\nLive class games your students love, and they can build their own. oomba.ai/teachers/live\n\n`;
fs.writeFileSync(out.replace(/\.mp4$/, '.en.vtt'), vtt);
console.log(capList);
