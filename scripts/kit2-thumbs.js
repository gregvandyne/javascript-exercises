// The small pictures of the Kit 2 worlds and characters for the Studio picker and the Build page:
//   public/img/kit2/worlds/<world>.webp        96x64 (shown at 48x32 on a chip), from the world's own cover picture
//   public/img/kit2/worlds/<world>-card.webp   320x200 (a card on /build), from the same cover
//   public/img/kit2/heroes/<id>.webp           96x96 (shown at 36x36 on a chip): the character itself, waving, drawn by
//                                              Oomba3D in the real game frame (the same frame and CSP players get)
// One picture per world and character in the generated catalogue (server/builder/kit2-catalog.js), so a newly shipped
// theme gets its pictures by running this again: node scripts/kit2-thumbs.js
// Needs the Playwright Chromium (BRB_CHROMIUM, or the one Playwright installed). Chromium itself encodes the WebP.
// tests/unit/builder-kit2.test.js fails when a world or character has no picture.
process.env.BRB_DB = process.env.BRB_DB || ':memory:'; process.env.BRB_SILENT = '1';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { KIT2_WORLDS, KIT2_CHARACTERS } = await import('../server/builder/kit2.js');
const { kit2ImportMap } = await import('../server/services/vendor.js');
const { frameDocument, frameCsp, SANDBOX } = await import('../server/services/frame.js');
const { vendorFile } = await import('../server/services/snapshot.js');
const OUT = path.join(ROOT, 'public/img/kit2');
const HOST = 'http://game.invalid';
const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
fs.mkdirSync(path.join(OUT, 'worlds'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'heroes'), { recursive: true });

/** Crop the middle of a picture to w:h, scale it and encode it as WebP (in a blank page). */
async function webp(page, buf, mime, w, h, q = 0.82) {
  const b64 = await page.evaluate(async ({ src, w, h, q }) => {
    const img = new Image(); img.src = src; await img.decode();
    const k = Math.max(w / img.width, h / img.height), cw = w / k, ch = h / k;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, (img.width - cw) / 2, (img.height - ch) / 2, cw, ch, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, 'image/webp', q));
    const a = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (const x of a) s += String.fromCharCode(x); return btoa(s);
  }, { src: `data:${mime};base64,${buf.toString('base64')}`, w, h, q });
  return Buffer.from(b64, 'base64');
}
const save = (rel, buf) => { fs.writeFileSync(path.join(OUT, rel), buf); console.log(`public/img/kit2/${rel}`, buf.length, 'bytes'); };

const blank = await (await browser.newContext()).newPage();
await blank.setContent('<!doctype html><title>t</title>');
for (const w of KIT2_WORLDS) {
  const cover = fs.readFileSync(path.join(ROOT, 'public/vendor/themes', w.id, w.version, 'cover.webp'));
  save(`worlds/${w.id}.webp`, await webp(blank, cover, 'image/webp', 96, 64));
  save(`worlds/${w.id}-card.webp`, await webp(blank, cover, 'image/webp', 320, 200));
}

// Each character alone, close up, in the first world that has it.
const ctx = await browser.newContext({ viewport: { width: 384, height: 384 } });
for (const c of KIT2_CHARACTERS) {
  const w = KIT2_WORLDS.find(x => x.id === c.worlds[0]);
  const game = `<title>${c.id}</title>\n${kit2ImportMap()}\n<style>html, body { margin: 0; height: 100%; overflow: hidden; }</style>
<script type="module">
import { start } from 'oomba3d';
const g = await start({ theme: '${w.id}', version: '${w.version}', graphics: 'high', outline: true, settings: false, reducedMotion: true });
g.scene.fog = null;   // a clear portrait: no haze, and high above the soft clouds
const me = await g.hero('${c.id}', { x: 0, y: 40, z: 0, face: 0.3 });
me.play('wave');
g.camera.fov = 26; g.camera.updateProjectionMatrix();
g.camera.position.set(0.5, 41.9, 5.4); g.camera.lookAt(0, 41.45, 0);
setTimeout(() => { window.__ready = true; }, 900);
</script>`;
  const doc = frameDocument(game, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: c.id }, save: {}, canSave: false });
  const outer = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const page = await ctx.newPage();
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: outer });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    const types = { js: 'text/javascript', mjs: 'text/javascript', glb: 'model/gltf-binary', ogg: 'audio/ogg', json: 'application/json', webp: 'image/webp' };
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': types[f.split('.').pop()] || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    return route.abort();
  });
  await page.goto(HOST + '/');
  const frame = page.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__ready === true, null, { timeout: 90_000 });
  save(`heroes/${c.id}.webp`, await webp(blank, await page.screenshot({ type: 'png' }), 'image/png', 96, 96, 0.85));
  await page.close();
}
await browser.close();
