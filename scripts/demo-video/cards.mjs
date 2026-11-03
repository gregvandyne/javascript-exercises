// Caption overlays, the end card, a title card and a phone bezel, rendered as PNGs (transparent where they overlay video).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { B, OUT } from './lib.mjs';
const DIR = path.join(OUT, 'cards'); fs.mkdirSync(DIR, { recursive: true });
const FONT = path.resolve('public/fonts/bricolage-grotesque-latin-opsz-normal.woff2');
const br = await chromium.launch();
const pg = await (await br.newContext({ deviceScaleFactor: 5, viewport: { width: 1440, height: 800 } })).newPage();
await pg.goto(B + '/'); const logoPng = await pg.locator('a.logo').first().screenshot({ omitBackground: true });
const logo = `<img src="data:image/png;base64,${logoPng.toString('base64')}" style="height:100%">`;
const CSS = `@font-face{font-family:B;src:url(data:font/woff2;base64,${fs.readFileSync(FONT).toString('base64')}) format('woff2');font-weight:200 800}
*{box-sizing:border-box;margin:0}html,body{background:transparent;font-family:B,sans-serif;color:#141414}
.cap{position:absolute;left:50%;transform:translateX(-50%);background:#FFFDF2;border:5px solid #141414;border-radius:999px;padding:.32em 1.05em .38em;font-weight:780;letter-spacing:-.01em;box-shadow:0 8px 0 #141414;white-space:nowrap;text-align:center;line-height:1.08}
.cap.wrap{white-space:normal;border-radius:44px;width:max-content;max-width:90%}
.cap b{color:#1F9D63}.cap i{font-style:normal;background:#FFD23F;border-radius:12px;padding:0 .18em}
.logo svg{height:100%;width:auto}.logo{display:flex;align-items:center;gap:.25em}.logo .logo-sub{display:block;font-weight:700;letter-spacing:.42em;text-transform:uppercase;color:#1F9D63;font-size:.24em;text-align:center}
.logo-lockup{display:flex;flex-direction:column;align-items:center}`;
async function png(name, w, h, html, transparent = true) {
  const p = await (await br.newContext({ viewport: { width: w, height: h } })).newPage();
  await p.setContent(`<!doctype html><meta charset=utf-8><style>${CSS}</style><body style="width:${w}px;height:${h}px;position:relative;overflow:hidden">${html}</body>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(DIR, name + '.png'), omitBackground: transparent });
  await p.context().close();
}
const CAPS = {
  live1: 'Pick <b>any subject</b>, any level',
  live2: 'Students join with a code — <b>no accounts</b>',
  live3: 'Everyone answers. <b>The race is on!</b>',
  build1: 'Kids describe a game in their own words',
  build2: 'The Builder makes it — and <b>plays it to check it works</b>',
  build3: 'Then they play it!',
  games: '<b>Learning games</b> in 13 languages',
};
for (const [k, t] of Object.entries(CAPS)) {
  await png(`cap-${k}-land`, 1920, 1080, `<div class="cap" style="top:34px;font-size:54px">${t}</div>`);
  await png(`cap-${k}-port`, 1080, 1920, `<div class="cap wrap" style="top:110px;font-size:62px">${t}</div>`);
}
// The hook: a big title over gameplay (dark bottom gradient)
const hook = (W, H, fs1, fs2, pad) => `<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,20,20,0) 35%,rgba(20,20,20,.78) 100%)"></div>
<div style="position:absolute;left:${pad}px;right:${pad}px;bottom:${pad}px;color:#FFFDF2">
<div style="font-size:${fs1}px;font-weight:800;line-height:1;letter-spacing:-.02em;text-shadow:0 4px 18px rgba(0,0,0,.35)">Live class games<br>your students <span style="color:#FFD23F">love</span></div>
<div style="font-size:${fs2}px;font-weight:650;margin-top:.45em;color:#DDF3E6">— and they can build their own.</div></div>`;
await png('hook-land', 1920, 1080, hook(1920, 1080, 128, 56, 90));
await png('hook-port', 1080, 1920, hook(1080, 1920, 118, 54, 70));
// End card (opaque)
const end = (W, H, port) => `<div style="position:absolute;inset:0;background:#FFFDF2"></div>
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:${port ? 56 : 40}px;padding:0 70px">
<div class="logo" style="height:${port ? 150 : 130}px;font-size:${port ? 150 : 130}px">${logo}</div>
<div style="font-size:${port ? 78 : 74}px;font-weight:800;line-height:1.05;letter-spacing:-.02em;max-width:${port ? 940 : 1500}px">Live class games your students love — <span style="color:#1F9D63">and they can build their own.</span></div>
<div style="display:flex;gap:22px;flex-wrap:wrap;justify-content:center;font-size:${port ? 44 : 42}px;font-weight:700">
<span style="background:#66C792;border:5px solid #141414;border-radius:999px;padding:.25em .9em;box-shadow:0 7px 0 #141414">Free for teachers</span>
<span style="background:#FFD23F;border:5px solid #141414;border-radius:999px;padding:.25em .9em;box-shadow:0 7px 0 #141414">oomba.ai/teachers/live</span></div></div>`;
await png('end-land', 1920, 1080, end(1920, 1080, false), false);
await png('end-port', 1080, 1920, end(1080, 1920, true), false);
// Backgrounds for composed scenes and a phone bezel (transparent screen hole)
await png('bg-land', 1920, 1080, `<div style="position:absolute;inset:0;background:radial-gradient(circle at 20% 15%,#DDF3E6,#F4F1E6 55%)"></div>`, false);
await png('bg-port', 1080, 1920, `<div style="position:absolute;inset:0;background:radial-gradient(circle at 20% 15%,#DDF3E6,#F4F1E6 55%)"></div>`, false);
// bezel for a 390x844 screen shown at scale s: outer box = screen + 2*border
for (const [name, sw, sh, b] of [['bezel-a', 400, 866, 16], ['bezel-b', 470, 1017, 18]]) {
  await png(name, sw + 2 * b, sh + 2 * b, `<div style="position:absolute;inset:0;border:${b}px solid #141414;border-radius:${b * 3.6}px;box-shadow:inset 0 0 0 3px #3B3A35"></div>`);
  fs.writeFileSync(path.join(DIR, name + '.json'), JSON.stringify({ sw, sh, b }));
}
await br.close();
console.log('cards in', DIR);
