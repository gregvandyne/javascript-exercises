// Cuts the parents video (silent master, 16:9, ~49 s): node scripts/demo-video/assemble-parents.mjs
// Uses the game and Builder clips recorded for the teacher demo (rec-games.mjs, rec-builder.mjs) plus rec-safety.mjs.
// Writes /tmp/claude-0/demo/parents/video-16x9.mp4, its captions (.en.vtt) and timeline.json (scene starts, for the music).
//
// The same layout as the teacher cut (assemble.mjs): the caption sits in a strip at the top and the app plays in the
// band under it (1920 x 930 from y 150), so a caption never covers the page; games and safety pages are recorded in
// windows shaped like the band, the Builder is cropped to its chat and preview. Captions are one layer over the joined
// scenes (two never cross-fade into each other), scenes slide in, and the last scene fades to the end card's color.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
if (process.argv[2] && process.argv[2] !== 'land') { console.error('Only the 16:9 cut (land) is made now.'); process.exit(1); }
const O = 'land', [W, H] = [1920, 1080];
const C = process.env.DEMO_CLIPS || '/tmp/claude-0/demo2/clips', K = '/tmp/claude-0/demo/cards';
const S = `/tmp/claude-0/demo2/pseg-${O}`, OUTD = '/tmp/claude-0/demo/parents';
fs.mkdirSync(S, { recursive: true }); fs.mkdirSync(OUTD, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const dur = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', '30'];
const img = f => ['-loop', '1', '-framerate', '30', '-i', f];
const BAND = { y: 150, h: 930 };
const CREAM = '0xFFFDF2';
const BG = img(`${K}/bg-${O}.png`);
const span = (a, d, sp = 1) => `trim=start=${a.toFixed(3)}:duration=${(d * sp + 0.1).toFixed(3)},setpts=(PTS-STARTPTS)/${sp.toFixed(4)},fps=30`;
const even = x => Math.round(x / 2) * 2;
const segs = [];
function seg(name, inputs, filter, d, caps = []) {
  const out = path.join(S, name + '.mp4');
  ff([...inputs, '-filter_complex', filter, '-map', '[out]', '-t', d.toFixed(3), ...ENC, out]);
  segs.push({ name, out, d, caps }); console.log(name, d);
}
/** a clip in the band under the caption strip (input 1 over the background, input 0) */
const inBand = (pre, d) => `[1:v]${pre},scale=${W}:${BAND.h}:flags=lanczos,setsar=1[p];[0:v]scale=${W}:${H},trim=duration=${d}[bg];[bg][p]overlay=0:${BAND.y},format=yuv420p[out]`;
const bj = JSON.parse(fs.readFileSync(`${C}/builder-${O}.json`, 'utf8'));
const D = { hook: 5.0, learn: 11.0, build: 14.0, play: 4.6, signup: 5.0, friends: 3.4, publish: 3.4, end: 5.0 };

// 1. Hook: Atlas Quest's lit globe turning, the title beside it
seg('1-hook', ['-i', `${C}/atlas-${O}.mp4`, ...img(`${K}/p-hook-${O}.png`)],
  `[0:v]${span(0.2, D.hook)},scale=${W}:${H}:flags=lanczos,setsar=1[v];[1:v]format=rgba,fade=t=in:st=0.45:d=0.5:alpha=1[t];[v][t]overlay=0:0,format=yuv420p[out]`, D.hook);

// 2. Learning games montage (games a visitor can find today, recorded in the band's shape)
{ const parts = [['wordhunt', 0.1], ['atlasq', 0.15], ['chess', 0.2], ['crossword', 0.15]], each = D.learn / parts.length;
  const ins = parts.flatMap(([g]) => ['-i', `${C}/${g}-${O}.mp4`]);
  const f = parts.map(([, ss], i) => `[${i + 1}:v]${span(ss, each)},scale=${W}:${BAND.h}:flags=lanczos,setsar=1,trim=duration=${each.toFixed(3)},setpts=PTS-STARTPTS[m${i}]`).join(';') + ';' +
    parts.map((_, i) => `[m${i}]`).join('') + `concat=n=${parts.length}:v=1:a=0[mv];[0:v]scale=${W}:${H},trim=duration=${D.learn}[bg];[bg][mv]overlay=0:${BAND.y},format=yuv420p[out]`;
  seg('2-learn', [...BG, ...ins], f, D.learn, [['learn', 0, D.learn]]); }

// 3a. The Builder: type, build, playtest. Cropped to the chat and the preview (as in assemble.mjs).
{ const f = `${C}/builder-${O}.mp4`, a = 0.25, b = bj.done + 0.5, sp = Math.max(1, (b - a) / D.build), cut = Math.min(D.build - 0.5, (bj.send - a) / sp + 1.4);
  const k = 3840 / 1440, cr = { x: 8, y: 300, w: 1072, h: 510 }, h = even(W * cr.h / cr.w);
  seg('3a-build', [...BG, '-i', f], `[1:v]${span(a, D.build, sp)},crop=${even(cr.w * k)}:${even(cr.h * k)}:${even(cr.x * k)}:${even(cr.y * k)},scale=${W}:${h}:flags=lanczos,setsar=1[p];[0:v]scale=${W}:${H}[bg];[bg][p]overlay=0:${H - h - 4},format=yuv420p[out]`,
    D.build, [['build1', 0, cut], ['build2', cut, D.build]]); }
// 3b. ...and play it: the sideways preview, as big as fits under the caption
{ const f = `${C}/builder-${O}.mp4`, a = Math.max(0, bj.end - D.play - 0.15), d = D.play;
  const z = JSON.parse(fs.readFileSync(`${C}/builder-${O}-box.json`, 'utf8'));
  seg('3b-play', [...BG, '-i', f], `[0:v]scale=${W}:${H}[bg];[1:v]${span(a, d)},crop=${z.w}:${z.h}:${z.x}:${z.y},scale=w=1760:h=900:force_original_aspect_ratio=decrease:flags=lanczos,setsar=1[g];[bg][g]overlay=(W-w)/2:${BAND.y + 8},format=yuv420p[out]`, d, [['play', 0, d]]); }

// 4. Safety: sign-up, friends, publishing (rec-safety.mjs, recorded in the band's shape); the last one fades to the
// end card's color
const safe = (name, clip, d, cap, last = false) => {
  const f = `${C}/${clip}-${O}.mp4`, len = dur(f), sp = Math.max(1, (len - 0.05) / d);
  const fl = inBand(span(0, d, sp), d).replace('format=yuv420p[out]', last ? `fade=t=out:st=${(d - 0.45).toFixed(3)}:d=0.45:color=${CREAM},format=yuv420p[out]` : 'format=yuv420p[out]');
  seg(name, [...BG, '-i', f], fl, d, [[cap, 0, last ? d - 0.45 : d]]);
};
safe('4a-signup', 'safe-signup', D.signup, 'signup');
safe('4b-friends', 'safe-friends', D.friends, 'friends');
safe('4c-publish', 'safe-publish', D.publish, 'publish', true);

// 5. End card, fading in from its own background color
seg('5-end', [...img(`${K}/p-end-${O}.png`)], `[0:v]scale=${W}:${H},setsar=1,fade=t=in:st=0:d=0.45:color=${CREAM},format=yuv420p[out]`, D.end);

// Join: a short slide from one scene to the next, a straight cut into the end card; then the caption layer
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
const CF = 0.2, capList = [];
segs.forEach((s, i) => s.caps.forEach(([name, a, b]) => {
  const inX = i > 0 && a === 0 ? X : 0, outX = b >= s.d - 0.01 && i + 1 < segs.length - 1 ? X : 0;   // the next scene slides in
  const t0 = starts[i] + a + inX + (a ? 0.06 : 0.04), t1 = starts[i] + b - outX - (b < s.d - 0.01 ? 0.06 : 0.04);
  capList.push({ name, t0: +t0.toFixed(3), t1: +t1.toFixed(3) });
}));
capList.forEach((c, j) => {
  f += `[${segs.length + j}:v]format=rgba,fade=t=in:st=${c.t0}:d=${CF}:alpha=1,fade=t=out:st=${(c.t1 - CF).toFixed(3)}:d=${CF}:alpha=1[k${j}];[${last}][k${j}]overlay=0:0:eof_action=pass[c${j}];`;
  last = `c${j}`;
});
f += `[${last}]format=yuv420p[out]`;
const out = path.join(OUTD, 'video-16x9.mp4');
ff([...segs.flatMap(s => ['-i', s.out]), ...capList.flatMap(c => ['-loop', '1', '-framerate', '30', '-t', total.toFixed(3), '-i', `${K}/p-cap-${c.name}-${O}.png`]),
  '-filter_complex', f, '-map', '[out]', '-t', total.toFixed(3), '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an', out]);
fs.writeFileSync(path.join(OUTD, 'timeline.json'), JSON.stringify(segs.map((s, i) => ({ scene: s.name, start: starts[i], dur: s.d })), null, 1));
console.log(out, dur(out).toFixed(2) + 's', (fs.statSync(out).size / 1e6).toFixed(1) + ' MB', 'end card at', starts[starts.length - 1]);
// Captions (WebVTT): the same words as on screen, at the same times (the hook's title and the end card are cards)
const TEXT = {
  learn: 'Learning games they actually want to play.', build1: 'Then they build their own, just by describing it.', build2: 'The Builder makes it, and plays it to check it works.',
  play: 'Then they play it!', signup: 'A made-up name: no email, no age.', friends: 'Friends only with a code: no chat with strangers.', publish: 'Games stay private until they choose to share.',
};
const ts = x => { const m = Math.floor(x / 60), sec = x - m * 60; return `00:${String(m).padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`; };
let vtt = `WEBVTT\n\n${ts(0.5)} --> ${ts(starts[1])}\nScreen time you can feel good about. Learning games kids love, and they can build their own.\n\n`;
for (const c of capList) vtt += `${ts(c.t0)} --> ${ts(c.t1)}\n${TEXT[c.name]}\n\n`;
vtt += `${ts(starts[starts.length - 1] + 0.3)} --> ${ts(total - 0.1)}\nScreen time you can feel good about. No ads. oomba.ai/parents\n\n`;
fs.writeFileSync(out.replace(/\.mp4$/, '.en.vtt'), vtt);
console.log(capList);
