#!/usr/bin/env node
// Render a story script to a video without the web app (docs/story-builder.md):
//   node scripts/story-render.js --script scripts/story-samples/lost-stars.json --out /tmp/story [--quality full|preview|tiny]
//        [--locale en] [--voice auto|service|local|silent] [--idea "a mouse who..."  (writes the script with Claude first)]
// Prints progress, then the measured numbers (render seconds per second of video).
process.env.BRB_DB = process.env.BRB_DB || ':memory:';
process.env.BRB_SILENT = '1';
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const fs = await import('node:fs');
const path = await import('node:path');
const { produce } = await import('../server/stories/pipeline.js');
const { createRenderer } = await import('../server/stories/renderer.js');
const { validateScript } = await import('../server/services/story-script.js');
const out = path.resolve(args.out || 'story-out');
let script;
if (args.idea) {
  const { writeStory } = await import('../server/services/story-writer.js');
  const r = await writeStory({ idea: args.idea, seconds: +args.seconds || 45, locale: args.locale || 'en' });
  if (!r.ok) { console.error('writer:', r.code, r.errors || ''); process.exit(1); }
  script = r.script;
} else {
  const v = validateScript(JSON.parse(fs.readFileSync(args.script, 'utf8')));
  if (!v.ok) { console.error('script problems:\n- ' + v.errors.join('\n- ')); process.exit(1); }
  script = v.script;
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'script.json'), JSON.stringify(script, null, 1));
let lastPct = -1;
const t0 = Date.now();
const res = await produce({
  id: args.id || path.basename(out), script, locale: args.locale || 'en', workDir: out, quality: args.quality || 'full',
  voice: args.voice && args.voice !== 'auto' ? args.voice : null, renderer: createRenderer(),
  onStage: s => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`),
  onProgress: p => { const pct = Math.floor(p * 100); if (pct !== lastPct) { lastPct = pct; if (pct % 5 === 0) console.log(`  ${pct}%`); } },
});
console.log(JSON.stringify({ video: res.video, poster: res.poster, vtt: res.vtt, wallSeconds: Math.round((Date.now() - t0) / 1000), ...res.meta.render, total: res.meta.total, voice: res.meta.voice, music: res.meta.music }, null, 1));
