// Cuts the parents video (silent master, ~50 s): node scripts/demo-video/assemble-parents.mjs land|port
// Uses the game and Builder clips recorded for the teacher demo (rec-games.mjs, rec-builder.mjs) plus rec-safety.mjs.
// Writes <OUT>/parents/video-16x9.mp4 (or -9x16), its captions (.en.vtt) and timeline.json (scene starts, for the music).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const O = process.argv[2] || 'land', L = O === 'land';
const [W, H] = L ? [1920, 1080] : [1080, 1920];
const C = process.env.DEMO_CLIPS || '/tmp/claude-0/demo2/clips', K = '/tmp/claude-0/demo/cards';
const S = `/tmp/claude-0/demo2/pseg-${O}`, OUTD = '/tmp/claude-0/demo/parents';
fs.mkdirSync(S, { recursive: true }); fs.mkdirSync(OUTD, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const dur = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', '30'];
const capF = (inLabel, capIdx, a, b, out) => `[${capIdx}:v]format=rgba,fade=t=in:st=${a}:d=0.3:alpha=1,fade=t=out:st=${b - 0.3}:d=0.3:alpha=1[c${capIdx}];[${inLabel}][c${capIdx}]overlay=0:0[${out}]`;
const img = f => ['-loop', '1', '-framerate', '30', '-i', f];
const fit = `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1`;
const span = (a, d, sp = 1) => `trim=start=${a.toFixed(3)}:duration=${(d * sp + 0.1).toFixed(3)},setpts=(PTS-STARTPTS)/${sp.toFixed(4)},fps=30`;
// zoom into the middle of a landscape page recording (the pages are narrow columns on a wide screen)
const zoom = (cw, ch, cx, cy) => (L ? `crop=${cw}:${ch}:${cx}:${cy},scale=${W}:${H}:flags=lanczos,setsar=1` : fit);
const segs = [];
function seg(name, inputs, filter, d, text) {
  const out = path.join(S, name + '.mp4');
  ff([...inputs, '-filter_complex', filter, '-map', '[out]', '-t', d.toFixed(3), ...ENC, out]);
  segs.push({ name, out, d, text }); console.log(name, d);
}
const bj = JSON.parse(fs.readFileSync(`${C}/builder-${O}.json`, 'utf8'));
const D = { hook: 5.0, learn: 11.0, build: 14.0, play: 4.6, signup: 5.0, friends: 3.4, publish: 3.746, end: 5.0 };
const CAP = {
  hook: 'Screen time you can feel good about. Learning games kids love — and they can build their own.',
  learn: 'Learning games they actually want to play.',
  play: 'Then they play it!',
  signup: 'A made-up name — no email, no age.',
  friends: 'Friends only with a code — no chat with strangers.',
  publish: 'Games stay private until they choose to share.',
  end: 'Screen time you can feel good about. Free to play, no ads: oomba.ai/parents',
};

// 1. Hook: Gulp City under the title
seg('1-hook', ['-i', `${C}/gulp-${O}.mp4`, ...img(`${K}/p-hook-${O}.png`)],
  `[0:v]${span(0.4, D.hook)},${fit}[v];[1:v]format=rgba,fade=t=in:st=0.5:d=0.5:alpha=1[t];[v][t]overlay=0:0[out]`, D.hook, CAP.hook);

// 2. Learning games montage
{ const parts = [['atlas', 0.1], ['wyr', 0.35], ['chess', 0.2], ['gulpbig', 0.15]], each = D.learn / parts.length;
  const ins = parts.flatMap(([g]) => ['-i', `${C}/${g}-${O}.mp4`]);
  const f = parts.map(([, ss], i) => `[${i}:v]${span(ss, each)},${fit},trim=duration=${each.toFixed(3)},setpts=PTS-STARTPTS[m${i}]`).join(';') + ';' + parts.map((_, i) => `[m${i}]`).join('') + `concat=n=${parts.length}:v=1:a=0[mv];` + capF('mv', parts.length, 0.2, D.learn, 'out');
  seg('2-learn', [...ins, ...img(`${K}/p-cap-learn-${O}.png`)], f, D.learn, CAP.learn); }

// 3a. The Builder: type, build, playtest
let buildCut = 0;
{ const f = `${C}/builder-${O}.mp4`, a = 0.25, b = bj.done + 0.5, sp = Math.max(1, (b - a) / D.build), cut = Math.min(D.build - 0.5, (bj.send - a) / sp + 1.4);
  buildCut = cut;
  seg('3a-build', ['-i', f, ...img(`${K}/p-cap-build1-${O}.png`), ...img(`${K}/p-cap-build2-${O}.png`)],
    `[0:v]${span(a, D.build, sp)},${fit}[v];` + capF('v', 1, 0.2, cut, 'v2') + ';' + capF('v2', 2, cut, D.build, 'out'), D.build, null); }
// 3b. ...and play it (the preview phone, zoomed in)
{ const f = `${C}/builder-${O}.mp4`, a = Math.max(0, bj.end - D.play - 0.15), d = D.play;
  const z = JSON.parse(fs.readFileSync(`${C}/builder-${O}-box.json`, 'utf8'));
  const body = L ? `[2:v]scale=${W}:${H}[bg];[0:v]${span(a, d)},crop=${z.w}:${z.h}:${z.x}:${z.y},scale=-2:900:flags=lanczos,setsar=1[g];[bg][g]overlay=(W-w)/2:165[v];`
    : `[2:v]scale=${W}:${H}[bg];[0:v]${span(a, d)},crop=${z.w}:${z.h}:${z.x}:${z.y},scale=-2:1500:flags=lanczos,setsar=1[g];[bg][g]overlay=(W-w)/2:330[v];`;
  seg('3b-play', ['-i', f, ...img(`${K}/p-cap-play-${O}.png`), ...img(`${K}/bg-${O}.png`)], body + capF('v', 1, 0.15, d, 'out'), d, CAP.play); }

// 4. Safety: sign-up, friends, publishing (zoomed in on landscape)
const safe = (name, clip, d, z, cap) => {
  const f = `${C}/${clip}-${O}.mp4`, len = dur(f), sp = Math.max(1, (len - 0.05) / d);
  seg(name, ['-i', f, ...img(`${K}/p-cap-${cap}-${O}.png`)], `[0:v]${span(0, d, sp)},${zoom(...z)}[v];` + capF('v', 1, 0.15, d, 'out'), d, CAP[cap]);
};
safe('4a-signup', 'safe-signup', D.signup, [1200, 675, 360, 70], 'signup');
safe('4b-friends', 'safe-friends', D.friends, [1680, 945, 120, 0], 'friends');
safe('4c-publish', 'safe-publish', D.publish, [1440, 810, 240, 60], 'publish');

// 5. End card
seg('5-end', [...img(`${K}/p-end-${O}.png`)], `[0:v]scale=${W}:${H},setsar=1,format=yuv420p[out]`, D.end, CAP.end);

// Join with short crossfades
const X = 0.35;
let f = '', last = '0:v', t = 0; const starts = [];
segs.forEach((s, i) => {
  if (i === 0) { starts.push(0); t = s.d; return; }
  const o = i === segs.length - 1 ? 'out' : `x${i}`;
  t -= X; starts.push(+t.toFixed(3)); f += `[${last}][${i}:v]xfade=transition=fade:duration=${X}:offset=${t.toFixed(3)}[${o}];`; last = o; t += s.d;
});
const out = path.join(OUTD, L ? 'video-16x9.mp4' : 'video-9x16.mp4');
ff([...segs.flatMap(s => ['-i', s.out]), '-filter_complex', f.replace(/;$/, ''), '-map', '[out]', '-c:v', 'libx264', '-preset', 'slow', '-crf', L ? '21' : '22', '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an', out]);
fs.writeFileSync(path.join(OUTD, 'timeline.json'), JSON.stringify(segs.map((s, i) => ({ scene: s.name, start: starts[i], dur: s.d })), null, 1));
console.log(out, dur(out).toFixed(2) + 's', (fs.statSync(out).size / 1e6).toFixed(1) + ' MB', 'end card at', starts[starts.length - 1]);
// Captions (WebVTT): the same words as on screen
const ts = x => { const m = Math.floor(x / 60), sec = x - m * 60; return `00:${String(m).padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`; };
let vtt = 'WEBVTT\n\n';
segs.forEach((sg, i) => {
  const a = starts[i] + (i ? X : 0) + 0.2, b = starts[i] + sg.d - 0.1;
  if (sg.text) vtt += `${ts(a)} --> ${ts(b)}\n${sg.text}\n\n`;
  else if (sg.name === '3a-build') { const mid = starts[i] + buildCut; vtt += `${ts(a)} --> ${ts(mid)}\nThen they build their own — just by describing it.\n\n${ts(mid)} --> ${ts(b)}\nThe Builder makes it — and plays it to check it works.\n\n`; }
});
fs.writeFileSync(out.replace(/\.mp4$/, '.en.vtt'), vtt);
