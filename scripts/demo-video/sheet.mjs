// Contact sheets for checking clips: node scripts/demo-video/sheet.mjs <fps> <cols>x<rows> <width> file.mp4...
// Writes <file>-sheet.png next to each file and prints its duration.
import { execFileSync } from 'node:child_process';
const [fps, tile, width, ...files] = process.argv.slice(2);
for (const f of files) {
  const d = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();
  const out = f.replace(/\.mp4$/, '-sheet.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', `fps=${fps},scale=${width}:-1,tile=${tile}`, '-frames:v', '1', out]);
  console.log(out, d.toFixed(2) + 's');
}
