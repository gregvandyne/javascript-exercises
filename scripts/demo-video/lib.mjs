// Demo video helpers: screencast recording to an MP4, logins, game frames.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
export const B = 'http://localhost:3349';
export const OUT = '/tmp/claude-0/demo';
export const CLIPS = path.join(OUT, 'clips');
fs.mkdirSync(CLIPS, { recursive: true });
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Start a CDP screencast of page. -> { stop(): Promise<{ frames, t0, t1 }> } (frames: [{ ts, buf }]) */
export async function record(page, { quality = 92 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const frames = []; const t0 = Date.now() / 1000;
  cdp.on('Page.screencastFrame', async f => {
    frames.push({ ts: f.metadata.timestamp || Date.now() / 1000, buf: Buffer.from(f.data, 'base64') });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* closed */ }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, everyNthFrame: 1, maxWidth: 3840, maxHeight: 3840 });
  return {
    async stop() { const t1 = Date.now() / 1000; try { await cdp.send('Page.stopScreencast'); } catch { /* closed */ } await cdp.detach().catch(() => {}); return { frames, t0, t1 }; },
  };
}

/** Write recorded frames to an MP4 at a constant 30 fps, scaled to w x h. -> the file path. */
export function toClip({ frames, t0, t1 }, name, w, h) {
  const dir = path.join(CLIPS, name + '_frames'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  if (!frames.length) throw new Error('no frames for ' + name);
  // the screencast's clock: line its first frame up with the start of the recording
  const base = frames[0].ts; frames.forEach(f => { f.ts = f.ts - base; });
  t1 = frames[frames.length - 1].ts + Math.max(0.05, (t1 - t0) - frames[frames.length - 1].ts);
  let list = 'ffconcat version 1.0\n';
  frames.forEach((f, i) => {
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`); fs.writeFileSync(file, f.buf);
    const next = i + 1 < frames.length ? frames[i + 1].ts : Math.max(f.ts + 1 / 30, t1);
    list += `file '${file}'\nduration ${Math.max(0.001, next - f.ts).toFixed(4)}\n`;
  });
  list += `file '${path.join(dir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'\n`;
  const lf = path.join(dir, 'list.txt'); fs.writeFileSync(lf, list);
  const out = path.join(CLIPS, name + '.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lf, '-vf', `fps=30,scale=${w}:${h}:flags=lanczos,setsar=1`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', out]);
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

export async function login(page, user, pass) {
  await page.goto(B + '/login'); await page.fill('#username', user); await page.fill('#password', pass);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
}

/** A soft fake cursor (the screencast has no real one): moves smoothly to an element and "clicks". */
export async function cursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return;
    const c = document.createElement('div'); c.id = 'demo-cursor';
    c.innerHTML = '<svg width="34" height="40" viewBox="0 0 34 40"><path d="M3 2 L3 32 L11 25 L17 38 L23 35 L17 23 L28 23 Z" fill="#141414" stroke="#FFFDF2" stroke-width="2.5" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-200px,-200px)', transition: 'transform 0ms', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.25))' });
    document.documentElement.appendChild(c);
    const ring = document.createElement('div'); ring.id = 'demo-ring';
    Object.assign(ring.style, { position: 'fixed', left: '0', top: '0', width: '44px', height: '44px', margin: '-22px 0 0 -22px', borderRadius: '50%', border: '4px solid #FFD23F', zIndex: 2147483646, pointerEvents: 'none', opacity: '0' });
    document.documentElement.appendChild(ring);
  });
}
export async function moveTo(page, sel, { ms = 700, click = true, dx = 0.5, dy = 0.5 } = {}) {
  const loc = typeof sel === 'string' ? page.locator(sel).first() : sel;
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox(); if (!b) throw new Error('no box for ' + sel);
  const x = b.x + b.width * dx, y = b.y + b.height * dy;
  await page.evaluate(({ x, y, ms }) => {
    const c = document.getElementById('demo-cursor'); const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(c.style.transform) || [0, innerWidth * 0.6, innerHeight * 0.7];
    let sx = +m[1], sy = +m[2]; if (sx < -100) { sx = innerWidth * 0.6; sy = innerHeight * 0.75; }
    const t0 = performance.now();
    return new Promise(res => { const f = now => { const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.style.transform = `translate(${sx + (x - sx) * e}px,${sy + (y - sy) * e}px)`; if (k < 1) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  }, { x, y, ms });
  if (click) {
    await page.evaluate(({ x, y }) => { const r = document.getElementById('demo-ring'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.animate([{ opacity: 1, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.4)' }], { duration: 450, easing: 'ease-out' }); }, { x, y });
    await loc.click();
  }
}
export const gameFrame = async (page, re = /\/frame\//) => { for (let i = 0; i < 100; i++) { const f = page.frames().find(f => re.test(f.url())); if (f) return f; await sleep(150); } throw new Error('no frame'); };
/** Make the play page's game fill the whole window (no top bar). */
export async function fullGame(page) {
  await page.evaluate(() => {
    const fr = document.querySelector('iframe'); const anc = new Set(); for (let e = fr; e; e = e.parentElement) anc.add(e);
    for (const e of document.body.querySelectorAll('*')) if (!anc.has(e) && e.id !== 'demo-cursor' && e.id !== 'demo-ring') e.style.setProperty('visibility', 'hidden', 'important');
    for (const e of anc) if (e !== fr) { e.style.setProperty('transform', 'none', 'important'); e.style.setProperty('filter', 'none', 'important'); e.style.setProperty('contain', 'none', 'important'); }
    Object.assign(fr.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', zIndex: '999999', border: '0', visibility: 'visible' });
  });
}
