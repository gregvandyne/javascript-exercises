// Records the Builder: a kid types an idea in the Studio, the build steps tick (as the AI Builder shows them, including the
// new automatic playtest), the game appears in the phone preview and gets played.
// SIMULATED: this server has no AI key, so the real build is done by the offline building blocks and the page's live
// stream is replayed slowly with the AI Builder's step rows (think, write, name, check, autotest) around the real version.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { B, login } from './lib.mjs';
import { Capture, VCLOCK, cursorInit, setCursor, glide } from './vc.mjs';
const br = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const orient = process.argv[2] || 'land';
const V = orient === 'land' ? { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 8 / 3, out: [3840, 2160] } : { viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, out: [1080, 1920] };
const ctx = await br.newContext({ viewport: V.viewport, deviceScaleFactor: V.deviceScaleFactor, isMobile: !!V.isMobile, hasTouch: !!V.hasTouch, extraHTTPHeaders: { 'x-forwarded-for': '10.5.5.' + (orient === 'land' ? 1 : 2) } });
await ctx.addInitScript(() => {
  const real = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    const res = await real(url, opts);
    if (!/\/api\/studio\/[^/]+\/live$/.test(String(url))) return res;
    const reader = res.body.getReader(), dec = new TextDecoder(), enc = new TextEncoder();
    let buf = '', ctl, building = false, got = [];
    const out = new ReadableStream({ start(c) { ctl = c; } });
    const send = (ev, d) => ctl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`));
    const wait = ms => new Promise(r => setTimeout(r, ms * 0.72));
    async function play(turn) {
      const T = n => got.filter(e => e.ev === n);
      const texts = got.filter(e => e.ev === 'text'); const iName = got.findIndex(e => e.ev === 'step' && e.d.key === 'name');
      const plan = texts.filter(e => got.indexOf(e) < iName).map(e => e.d.text).join('');
      const after = texts.filter(e => got.indexOf(e) > iName).map(e => e.d.text).join('');
      const name = got[iName].d, meta = T('meta')[0].d, version = T('version')[0].d, notes = T('notes')[0], ask = T('ask')[0], done = T('done')[0].d;
      const t0 = Date.now(), at = () => Date.now() - t0; const s = [];
      const step = (key, f = {}) => { const d = { i: s.length + 1, key, at: at(), ...f }; s.push([key, d.at, f]); send('step', d); return d.i; };
      send('turn', { ...turn, provider: 'claude' });
      step('screen'); await wait(700);
      step('think', { c: 'start', g: 1 }); await wait(1100);
      const words = plan.match(/\S+\s*/g) || [];
      for (let i = 0; i < words.length; i += 2) { send('text', { text: words.slice(i, i + 2).join('') }); await wait(85); }
      await wait(500);
      const w = step('write', { l: 0 });
      for (let l = 0; l <= 412; l += 29) { send('stepinfo', { i: w, l }); await wait(170); }
      step('name', { title: name.title, icon: name.icon }); send('meta', meta); await wait(350);
      step('check', { st: 'pass', v: version.number }); send('version', version); await wait(500);
      const a = step('autotest', { v: version.number }); await wait(3800);
      send('stepinfo', { i: a, probs: 0 }); s[a - 1][2].probs = 0; await wait(900);
      const fw = after.match(/\S+\s*/g) || [];
      for (let i = 0; i < fw.length; i += 2) { send('text', { text: fw.slice(i, i + 2).join('') }); await wait(70); }
      step('notes'); send('notes', notes.d); await wait(300);
      step('ask'); send('ask', ask.d); await wait(2200);
      send('done', { ...done, steps: { v: 1, p: 'claude', ms: at(), r: 1, end: 'ok', s: s.map(([k, t, f]) => (Object.keys(f).length ? [k, t, f] : [k, t])) } });
    }
    (async () => {
      for (;;) {
        const { value, done } = await reader.read(); if (done) { try { ctl.close(); } catch {} return; }
        buf += dec.decode(value, { stream: true });
        let k;
        while ((k = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, k); buf = buf.slice(k + 2);
          const ev = (/^event: (.*)$/m.exec(raw) || [])[1], data = (/^data: (.*)$/m.exec(raw) || [])[1];
          if (!ev) { ctl.enqueue(enc.encode(raw + '\n\n')); continue; }
          const d = JSON.parse(data);
          if (ev === 'turn') { building = true; got = []; window.__demoTurn = d; continue; }
          if (building) { got.push({ ev, d }); if (ev === 'done') { building = false; play(window.__demoTurn); } continue; }
          ctl.enqueue(enc.encode(raw + '\n\n'));
        }
      }
    })();
    return new Response(out, { status: res.status, headers: res.headers });
  };
});
await ctx.route(/\/api\/studio\/[A-Za-z0-9]+$/, async route => {
  if (route.request().method() !== 'GET') return route.continue();
  const res = await route.fetch(); let body = await res.text();
  body = body.replace(/"p":"blocks","ms":\d+/g, '"p":"claude","ms":16400').replace(/"provider":"blocks"/g, '"provider":"claude"');
  return route.fulfill({ response: res, body });
});
// the replayed build shows the AI Builder's summary line (this server's build was made by the offline blocks)
await ctx.addInitScript(() => {
  const fix = root => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) if (n.nodeValue.includes('building blocks did this')) n.nodeValue = n.nodeValue.replace('How the building blocks did this', 'How the AI did this'); };
  document.addEventListener('DOMContentLoaded', () => { fix(document.body); new MutationObserver(ms => ms.forEach(m => { m.addedNodes.forEach(n => (n.nodeType === 1 ? fix(n) : n.parentNode && fix(n.parentNode))); if (m.type === 'characterData' && m.target.parentNode) fix(m.target.parentNode); })).observe(document.body, { childList: true, subtree: true, characterData: true }); });
});
const C = '/tmp/claude-0/demo2/clips';
const p = await ctx.newPage(); p.__name = 'b';
await login(p, 'MayaMakes', 'secret123');
await ctx.addInitScript(VCLOCK);
const j = await (await p.request.post(B + '/api/studio/new', { headers: { Origin: B } })).json();
await p.goto(B + j.url); await p.waitForLoadState('networkidle').catch(() => {});
const cap = new Capture([p], `${C}/tmp-builder-${orient}`);
await cap.advance(1500); await cursorInit(p); await setCursor(p, V.viewport.width * 0.6, V.viewport.height * 0.75);
const M = {}; const mark = k => { M[k] = cap.n / 30; };
await cap.seconds(0.4);
await glide(cap, p, p.locator('#st-input'), { sec: 0.55 });
const idea = 'A beach game where my puppy catches falling ice creams!';
for (let i = 0; i < idea.length; i += 2) { await p.keyboard.type(idea.slice(i, i + 2)); await cap.frames(3); }
await cap.seconds(0.25);
await glide(cap, p, p.locator('#st-send'), { sec: 0.4 }); mark('send');
// the steps play (replayed on the virtual clock), until the reply's chips show
const chips0 = await p.locator('.qchips').count();
for (let i = 0; i < 30 * 40; i++) { if (await p.locator('.qchips').count() > chips0) break; await cap.frame(); }
mark('done'); console.log('done at', M.done);
await cap.seconds(1.6);
const ifr = p.locator('iframe').first();
await ifr.scrollIntoViewIfNeeded();
await glide(cap, p, ifr, { sec: 0.55, click: false, dy: 0.47 }); mark('full');
let gf = null; for (let i = 0; i < 40 && !gf; i++) { gf = p.frames().find(f => /\/frame\//.test(f.url())); if (!gf) await cap.frame(); }
await gf.locator('button:has-text("Play")').first().click({ timeout: 8000, noWaitAfter: true }).catch(e => console.log('play click', e.message));
await cap.seconds(0.8);
const go = gf.locator('.ok-ui button:visible').filter({ hasText: /^\s*(Go|Let.s go|Start|OK)\b/i }).first();
if (await go.count()) await go.click({ timeout: 3000, noWaitAfter: true }).catch(e => console.log('go click', e.message));
await cap.seconds(0.4);
const fb = await ifr.boundingBox(); const vw = fb.width, cy = fb.y + fb.height * 0.82; let x = fb.x + vw / 2;
await p.evaluate(() => { document.getElementById('demo-cursor').style.opacity = '0'; });
void x; void cy; void vw;
// steer with the arrow keys (held across frames, so the kit moves the hero smoothly), while things fall
await gf.evaluate(() => { window.focus(); (document.querySelector('canvas') || document.body).focus && (document.querySelector('canvas') || document.body).focus(); }).catch(() => {});
await cap.seconds(0.6);
mark('play');
for (const [key, sec] of [['ArrowRight', 0.55], [null, 0.25], ['ArrowLeft', 0.95], [null, 0.2], ['ArrowRight', 0.8], [null, 0.3], ['ArrowLeft', 0.6], [null, 0.25], ['ArrowRight', 0.7], [null, 0.4]]) {
  if (key) await p.keyboard.down(key);
  await cap.seconds(sec);
  if (key) await p.keyboard.up(key);
}
await cap.seconds(0.3);
mark('end');
{ const bb = await ifr.boundingBox(); const k = V.out[0] / V.viewport.width; fs.writeFileSync(`${C}/builder-${orient}-box.json`, JSON.stringify({ x: Math.round(bb.x * k), y: Math.round(bb.y * k), w: Math.round(bb.width * k / 2) * 2, h: Math.round(bb.height * k / 2) * 2 })); }
cap.encode('builder-' + orient, { b: V.out }); fs.writeFileSync(`${C}/builder-${orient}.json`, JSON.stringify(M));
console.log('builder done', M);
await br.close();
