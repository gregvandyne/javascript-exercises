// The parents video's captions, hook and end card (PNG overlays like cards.mjs, prefixed p-).
// Every claim matches the parents page (server/i18n/locales/en.json "parents": badges, safe.li1-li5).
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
.cap b{color:#1F9D63}`;
async function png(name, w, h, html, transparent = true) {
  const p = await (await br.newContext({ viewport: { width: w, height: h } })).newPage();
  await p.setContent(`<!doctype html><meta charset=utf-8><style>${CSS}</style><body style="width:${w}px;height:${h}px;position:relative;overflow:hidden">${html}</body>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(DIR, name + '.png'), omitBackground: transparent });
  await p.context().close();
}
export const PCAPS = {
  learn: '<b>Learning games</b> they actually want to play',
  build1: 'Then they build their own — <b>just by describing it</b>',
  build2: 'The Builder makes it — and <b>plays it to check it works</b>',
  play: 'Then they play it!',
  signup: 'A made-up name — <b>no email, no age</b>',
  friends: 'Friends only with a code — <b>no chat with strangers</b>',
  publish: 'Games stay <b>private</b> until they choose to share',
};
for (const [k, t] of Object.entries(PCAPS)) {
  await png(`p-cap-${k}-land`, 1920, 1080, `<div class="cap" style="top:34px;font-size:54px">${t}</div>`);
  await png(`p-cap-${k}-port`, 1080, 1920, `<div class="cap wrap" style="top:110px;font-size:62px">${t}</div>`);
}
const hook = (fs1, fs2, pad) => `<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,20,20,0) 35%,rgba(20,20,20,.78) 100%)"></div>
<div style="position:absolute;left:${pad}px;right:${pad}px;bottom:${pad}px;color:#FFFDF2">
<div style="font-size:${fs1}px;font-weight:800;line-height:1;letter-spacing:-.02em;text-shadow:0 4px 18px rgba(0,0,0,.35)">Screen time you can<br><span style="color:#FFD23F">feel good about</span></div>
<div style="font-size:${fs2}px;font-weight:650;margin-top:.45em;color:#DDF3E6">Learning games kids love — and they can build their own.</div></div>`;
await png('p-hook-land', 1920, 1080, hook(128, 52, 90));
await png('p-hook-port', 1080, 1920, hook(112, 50, 70));
const end = port => `<div style="position:absolute;inset:0;background:#FFFDF2"></div>
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:${port ? 56 : 40}px;padding:0 70px">
<div class="logo" style="height:${port ? 150 : 130}px">${logo}</div>
<div style="font-size:${port ? 82 : 78}px;font-weight:800;line-height:1.05;letter-spacing:-.02em;max-width:${port ? 940 : 1500}px">Screen time you can <span style="color:#1F9D63">feel good about.</span></div>
<div style="display:flex;gap:22px;flex-wrap:wrap;justify-content:center;font-size:${port ? 44 : 42}px;font-weight:700">
<span style="background:#66C792;border:5px solid #141414;border-radius:999px;padding:.25em .9em;box-shadow:0 7px 0 #141414">Free to play · No ads</span>
<span style="background:#FFD23F;border:5px solid #141414;border-radius:999px;padding:.25em .9em;box-shadow:0 7px 0 #141414">oomba.ai/parents</span></div></div>`;
await png('p-end-land', 1920, 1080, end(false), false);
await png('p-end-port', 1080, 1920, end(true), false);
await br.close();
console.log('parents cards in', DIR);
