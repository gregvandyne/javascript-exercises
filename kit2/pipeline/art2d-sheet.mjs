// A contact sheet of built 2D art packs, to look at every picture before it ships:
//   node kit2/pipeline/art2d-sheet.mjs <out.png> <pack-dir> [<pack-dir> ...] [--max 2900] [--scale 0.5] [--bg #cfe8f7]
// Each pack: its strips, ground and prop atlas, then every sprite sheet with its frame grid and the feet line.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : args[i + 1]; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i && args[i - 1].startsWith('--')));
const [outFile, ...dirs] = pos;
const packs = dirs.map(d => { const m = JSON.parse(fs.readFileSync(path.join(d, 'pack.json'), 'utf8')); const img = {}; for (const f of Object.keys(m.files)) if (f.endsWith('.webp')) img[f] = 'data:image/webp;base64,' + fs.readFileSync(path.join(d, f)).toString('base64'); return { m, img }; });
const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage();
const png = await page.evaluate(async ({ packs, max, scale, bg, only }) => {
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const blocks = [];   // { w, h, draw(g, x, y) }
  for (const { m, img } of packs) {
    const I = {}; for (const [n, s] of Object.entries(img)) I[n] = await load(s);
    const kb = Math.round(Object.values(m.files).reduce((n, f) => n + f.bytes, 0) / 1024);
    blocks.push({ w: max, h: 34, draw(g, x, y) { g.fillStyle = '#141414'; g.font = '700 22px system-ui, sans-serif'; g.fillText(`${m.id} ${m.version}  ·  ${kb} KB  ·  ${Object.keys(m.sprites).length} sprites`, x + 6, y + 25); } });
    const pic = (name, s, label, deco) => { const i = I[name]; if (!i) return; const w = Math.round(i.width * s), h = Math.round(i.height * s); blocks.push({ w: w + 8, h: h + 22, draw(g, x, y) {
      g.fillStyle = bg; g.fillRect(x + 4, y, w, h); g.drawImage(i, x + 4, y, w, h); if (deco) deco(g, x + 4, y, s);
      g.fillStyle = '#141414'; g.font = '12px system-ui, sans-serif'; g.fillText(`${label || name}  ${i.width}x${i.height}  ${Math.round(m.files[name].bytes / 1024)} KB`, x + 6, y + h + 15); } }); };
    if (m.kind === 'world') {
      // the far strip twice side by side, to see the seam
      for (const n of ['far.webp', 'mid.webp']) { const i = I[n]; if (!i) continue; const s = Math.min(scale, (max - 16) / (i.width * 1.5)), w = Math.round(i.width * s), h = Math.round(i.height * s);
        blocks.push({ w: w * 1.5 + 8, h: h + 22, draw(g, x, y) { g.save(); g.beginPath(); g.rect(x + 4, y, w * 1.5, h); g.clip(); const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, m.sky[0]); gr.addColorStop(0.6, m.sky[1]); gr.addColorStop(1, m.sky[2]); g.fillStyle = gr; g.fillRect(x + 4, y, w * 1.5, h); g.drawImage(i, x + 4, y, w, h); g.drawImage(i, x + 4 + w, y, w, h); g.restore(); g.fillStyle = '#141414'; g.font = '12px system-ui, sans-serif'; g.fillText(`${n} (one and a half times: the seam is at two thirds)  ${i.width}x${i.height}  ${Math.round(m.files[n].bytes / 1024)} KB`, x + 6, y + h + 15); } }); }
      pic('ground.webp', 1, 'ground.webp (twice)', null);
      { const i = I['ground.webp']; blocks.push({ w: i.width * 2 + 8, h: i.height + 6, draw(g, x, y) { g.fillStyle = bg; g.fillRect(x + 4, y, i.width * 2, i.height); g.drawImage(i, x + 4, y); g.drawImage(i, x + 4 + i.width, y); g.strokeStyle = '#e11'; g.beginPath(); g.moveTo(x + 4, y + m.ground.over + 0.5); g.lineTo(x + 4 + i.width * 2, y + m.ground.over + 0.5); g.stroke(); } }); }
      pic('props.webp', Math.min(1, (max - 16) / I['props.webp'].width) * 0.8, 'props.webp', (g, x, y, s) => { g.font = '11px system-ui, sans-serif'; for (const [n, sp] of Object.entries(m.sprites)) { const [rx, ry, rw, rh] = sp.rect; g.strokeStyle = 'rgba(0,0,0,.25)'; g.strokeRect(x + rx * s, y + ry * s, rw * s, rh * s); g.fillStyle = '#e11'; g.fillRect(x + (rx + sp.ax * rw) * s - 2, y + (ry + sp.ay * rh) * s - 2, 4, 4); g.fillStyle = '#141414'; g.fillText(`${n} ${sp.size}`, x + rx * s + 2, y + ry * s + 11); } });
    } else {
      for (const [id, sp] of Object.entries(m.sprites)) { if (only.length && !only.includes(id)) continue; pic(sp.image, scale, `${id} (${sp.name})`, (g, x, y, s) => {
        const rows = Math.ceil(14 / sp.cols); g.strokeStyle = 'rgba(0,0,0,.18)'; for (let c = 0; c <= sp.cols; c++) { g.beginPath(); g.moveTo(x + c * sp.fw * s, y); g.lineTo(x + c * sp.fw * s, y + rows * sp.fh * s); g.stroke(); }
        g.strokeStyle = '#e11'; for (let r = 0; r < rows; r++) { const yy = y + (r + sp.ay) * sp.fh * s; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + sp.cols * sp.fw * s, yy); g.stroke(); } }); }
    }
  }
  // flow the blocks into rows
  let x = 0, y = 0, rowH = 0; const at = [];
  for (const b of blocks) { if (x + b.w > max) { x = 0; y += rowH + 6; rowH = 0; } at.push([x, y]); x += b.w + 6; rowH = Math.max(rowH, b.h); }
  const H = y + rowH + 6, k = Math.min(1, max / H);
  const c = document.createElement('canvas'); c.width = Math.round(max * k); c.height = Math.round(H * k); const g = c.getContext('2d'); g.scale(k, k);
  g.fillStyle = '#FFFDF2'; g.fillRect(0, 0, max, H);
  blocks.forEach((b, i) => b.draw(g, at[i][0], at[i][1]));
  return c.toDataURL('image/png').split(',')[1];
}, { packs, max: +opt('max', 2400), scale: +opt('scale', 0.5), bg: opt('bg', '#cfe8f7'), only: opt('only', '').split(',').filter(Boolean) });
fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
fs.writeFileSync(outFile, Buffer.from(png, 'base64'));
console.log(outFile);
await browser.close();
