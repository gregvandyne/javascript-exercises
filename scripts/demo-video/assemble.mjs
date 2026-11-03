// Cuts the frame-by-frame clips into the ~57 s demo (silent master): node .demo2/assemble.mjs land|port
// Scene starts are fixed so the music's end-card downbeat (52.35 s) lines up; written to v2/timeline.json.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const O = process.argv[2] || 'land', L = O === 'land';
const [W, H] = L ? [1920, 1080] : [1080, 1920];
const C = '/tmp/claude-0/demo2/clips', K = '/tmp/claude-0/demo/cards', S = `/tmp/claude-0/demo2/seg-${O}`, V2 = '/tmp/claude-0/demo/v2';
fs.mkdirSync(S, { recursive: true }); fs.mkdirSync(V2, { recursive: true });
const dur = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();
const ff = args => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', '30'];
const capF = (inLabel, capIdx, a, b, out) => `[${capIdx}:v]format=rgba,fade=t=in:st=${a}:d=0.3:alpha=1,fade=t=out:st=${b - 0.3}:d=0.3:alpha=1[c${capIdx}];[${inLabel}][c${capIdx}]overlay=0:0[${out}]`;
const img = f => ['-loop', '1', '-framerate', '30', '-i', f];
const fit = `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1`;
/** trim [a, a+d*sp] and play it in d seconds (sp > 1 drops frames evenly; sp < 1 is avoided) */
const span = (a, d, sp = 1) => `trim=start=${a.toFixed(3)}:duration=${(d * sp + 0.1).toFixed(3)},setpts=(PTS-STARTPTS)/${sp.toFixed(4)},fps=30`;
const segs = [];
function seg(name, inputs, filter, d) {
  const out = path.join(S, name + '.mp4');
  ff([...inputs, '-filter_complex', filter, '-map', '[out]', '-t', d.toFixed(3), ...ENC, out]);
  segs.push({ name, out, d }); console.log(name, d);
}
const bj = JSON.parse(fs.readFileSync(`${C}/builder-${O}.json`, 'utf8'));
const gj = JSON.parse(fs.readFileSync(`${C}/live-game.json`, 'utf8'));
const D = { hook: 5.2, pick: 5.4, join: 4.8, race: 8.15, build: 15.25, play: 5.0, games: 11.0, end: 5.0 };

// 1. Hook: Gulp City with the title
seg('1-hook', ['-i', `${C}/gulp-${O}.mp4`, ...img(`${K}/hook-${O}.png`)],
  `[0:v]${span(0.4, D.hook)},${fit}[v];[1:v]format=rgba,fade=t=in:st=0.5:d=0.5:alpha=1[t];[v][t]overlay=0:0[out]`, D.hook);

// 2a. The teacher picks a game, subject and level
{ const f = `${C}/live-pick.mp4`, len = dur(f), a = 0.25, sp = Math.max(1, (len - a - 0.05) / D.pick);
  const board = L ? `[0:v]${span(a, D.pick, sp)},${fit}[v]`
    : `[0:v]${span(a, D.pick, sp)},crop=1460:1080:30:0,scale=1080:-2:flags=lanczos,setsar=1[b];[2:v]scale=${W}:${H}[bg];[bg][b]overlay=0:(H-h)/2+120[v]`;
  seg('2a-pick', ['-i', f, ...img(`${K}/cap-live1-${O}.png`), ...(L ? [] : img(`${K}/bg-port.png`))], `${board};${capF('v', 1, 0.2, D.pick, 'out')}`, D.pick); }

// Board + phone composition
const bez = JSON.parse(fs.readFileSync(`${K}/bezel-${L ? 'a' : 'b'}.json`, 'utf8'));
const lay = L ? { bw: 1380, bx: 40, by: 196, px: 1448, py: 150 } : { bw: 1040, bx: 20, by: 330, px: 287, py: 860 };
function boardPhone(name, boardF, phoneF, a, d, cap) {
  const { bw, bx, by, px, py } = lay;
  const f = `[2:v]scale=${W}:${H}[bg];` +
    `[0:v]${span(a, d)},scale=${bw}:-2:flags=lanczos,setsar=1[b];` +
    `[1:v]${span(a, d)},scale=${bez.sw}:${bez.sh}:flags=lanczos,setsar=1[p];` +
    `[bg][b]overlay=${bx}:${by}[v1];[v1][p]overlay=${px + bez.b}:${py + bez.b}[v2];[v2][3:v]overlay=${px}:${py}[v3];` + capF('v3', 4, 0.2, d, 'out');
  seg(name, ['-i', boardF, '-i', phoneF, ...img(`${K}/bg-${O}.png`), ...img(`${K}/bezel-${L ? 'a' : 'b'}.png`), ...img(`${K}/cap-${cap}-${O}.png`)], f, d);
}
{ const len = dur(`${C}/live-lobby-host.mp4`); boardPhone('2b-join', `${C}/live-lobby-host.mp4`, `${C}/live-lobby-phone.mp4`, Math.max(0, len - D.join - 0.02), D.join, 'live2'); }
{ const a = Math.max(0, gj.q - 0.3); boardPhone('2c-race', `${C}/live-game-host.mp4`, `${C}/live-game-phone.mp4`, a, Math.min(D.race, gj.end - a - 0.05), 'live3'); }

// 3a. The Builder: type, build, playtest
{ const f = `${C}/builder-${O}.mp4`, a = 0.25, b = bj.done + 0.5, sp = Math.max(1, (b - a) / D.build), cut = Math.min(D.build - 0.5, (bj.send - a) / sp + 1.4);
  seg('3a-build', ['-i', f, ...img(`${K}/cap-build1-${O}.png`), ...img(`${K}/cap-build2-${O}.png`)],
    `[0:v]${span(a, D.build, sp)},${fit}[v];` + capF('v', 1, 0.2, cut, 'v2') + ';' + capF('v2', 2, cut, D.build, 'out'), D.build); }
// 3b. ...and play it: the preview phone, zoomed in (landscape)
{ const f = `${C}/builder-${O}.mp4`, a = Math.max(0, bj.end - D.play - 0.15), d = D.play;
  const z = JSON.parse(fs.readFileSync(`${C}/builder-${O}-box.json`, 'utf8'));
  const body = L ? `[2:v]scale=${W}:${H}[bg];[0:v]${span(a, d)},crop=${z.w}:${z.h}:${z.x}:${z.y},scale=-2:900:flags=lanczos,setsar=1[g];[bg][g]overlay=(W-w)/2:165[v];`
    : `[2:v]scale=${W}:${H}[bg];[0:v]${span(a, d)},crop=${z.w}:${z.h}:${z.x}:${z.y},scale=-2:1500:flags=lanczos,setsar=1[g];[bg][g]overlay=(W-w)/2:330[v];`;
  seg('3b-play', ['-i', f, ...img(`${K}/cap-build3-${O}.png`), ...img(`${K}/bg-${O}.png`)], body + capF('v', 1, 0.15, d, 'out'), d); }

// 4. Montage of official games (each clip's own smooth motion, 2.75 s each)
{ const parts = [['gulpbig', 0.15], ['atlas', 0.1], ['wyr', 0.35], ['chess', 0.2]], each = D.games / parts.length;
  const ins = parts.flatMap(([g]) => ['-i', `${C}/${g}-${O}.mp4`]);
  const f = parts.map(([, ss], i) => `[${i}:v]${span(ss, each)},${fit},trim=duration=${each.toFixed(3)},setpts=PTS-STARTPTS[m${i}]`).join(';') + ';' + parts.map((_, i) => `[m${i}]`).join('') + `concat=n=${parts.length}:v=1:a=0[mv];` + capF('mv', parts.length, 0.2, D.games, 'out');
  seg('4-games', [...ins, ...img(`${K}/cap-games-${O}.png`)], f, D.games); }

// 5. End card
seg('5-end', [...img(`${K}/end-${O}.png`)], `[0:v]scale=${W}:${H},setsar=1,format=yuv420p[out]`, D.end);

// Join with short crossfades
const X = 0.35;
let f = '', last = '0:v', t = 0; const starts = [];
segs.forEach((s, i) => {
  if (i === 0) { starts.push(0); t = s.d; return; }
  const o = i === segs.length - 1 ? 'out' : `x${i}`;
  t -= X; starts.push(+t.toFixed(3)); f += `[${last}][${i}:v]xfade=transition=fade:duration=${X}:offset=${t.toFixed(3)}[${o}];`; last = o; t += s.d;
});
const out = path.join(V2, L ? 'video-16x9.mp4' : 'video-9x16.mp4');
ff([...segs.flatMap(s => ['-i', s.out]), '-filter_complex', f.replace(/;$/, ''), '-map', '[out]', '-c:v', 'libx264', '-preset', 'slow', '-crf', L ? '21' : '22', '-maxrate', L ? '6M' : '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an', out]);
fs.writeFileSync(path.join(V2, 'timeline.json'), JSON.stringify(segs.map((s, i) => ({ scene: s.name, start: starts[i], dur: s.d })), null, 1));
console.log(out, dur(out).toFixed(2) + 's', (fs.statSync(out).size / 1e6).toFixed(1) + ' MB', 'end card at', starts[starts.length - 1]);
// Captions as WebVTT (the same words as on screen)
const TEXT = ['Live class games your students love — and they can build their own.', 'Pick any subject, any level.', 'Students join with a code — no accounts.', 'Everyone answers. The race is on!', null, 'Then they play it!', 'Learning games in 13 languages.', 'Live class games your students love — and they can build their own. Free for teachers: oomba.ai/teachers/live'];
const ts = x => { const m = Math.floor(x / 60), sec = x - m * 60; return `00:${String(m).padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`; };
let vtt = 'WEBVTT\n\n';
segs.forEach((sg, i) => {
  const a = starts[i] + (i ? X : 0) + 0.2, b = starts[i] + sg.d - 0.1;
  if (TEXT[i]) vtt += `${ts(a)} --> ${ts(b)}\n${TEXT[i]}\n\n`;
  else { const mid = starts[i] + Math.min(sg.d - 0.5, (bj.send - 0.25) / Math.max(1, (bj.done + 0.5 - 0.25) / D.build) + 1.4); vtt += `${ts(a)} --> ${ts(mid)}\nKids describe a game in their own words.\n\n${ts(mid)} --> ${ts(b)}\nThe Builder makes it — and plays it to check it works.\n\n`; }
});
fs.writeFileSync(out.replace(/\.mp4$/, '.en.vtt'), vtt);
