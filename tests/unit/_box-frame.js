// Arithmetic Lab in the production frame (frameDocument, the frame's CSP and sandbox, the real SDK) on a stand-in for
// the play page, on a 390x844 phone: it records what the frame asks the page (brb:tts for the AI voice, brb:print) and
// answers like the page does. Used by box-by-box-round2.test.js (and its screenshots).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const { silentMp3 } = await import('../../server/services/tts.js');

export const HOST = 'http://game.invalid';
const MP3 = silentMp3(48).toString('base64');
export const GAME = () => fs.readFileSync(path.join(ROOT, 'seed-games/arithmetic-lab.html'), 'utf8');

let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
// (Playwright's own browser, else a Chromium on the machine, as the site's browser tests find it)
const LOCAL = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter((p) => p && fs.existsSync(p) && fs.statSync(p).isFile());
let launchOpts = {};
let ok = false;
if (chromium) {
  for (const o of [{}, ...LOCAL.map((executablePath) => ({ executablePath, args: ['--no-sandbox'] }))]) {
    try { const b = await chromium.launch(o); await b.close(); ok = true; launchOpts = o; break; } catch { ok = false; }
  }
}
export const skip = ok ? false : 'no Chromium on this machine';

let browser = null;
export async function closeBrowser() { if (browser) await browser.close(); browser = null; }

/** Open the game. o: { lang, set (a question set's item), saveData (the game save it starts with: { key: JSON text }), tts (INIT.tts), print, canAssign, phone, voice: 'ok'|'no'|'none',
 *  printReply(doc) -> { html } | { error } (the page's answer), save, params (BRB.params), mySets (My worksheets),
 *  width/height (the phone's size), dark }. Every brb:* message the frame posts is kept (msgs(type)); a set save is answered as the page does. */
export async function openGame(o = {}) {
  browser ||= await chromium.launch({ ...launchOpts, args: [...(launchOpts.args || []), '--autoplay-policy=no-user-gesture-required'] });
  const phone = o.phone !== false;
  const scheme = o.dark ? { colorScheme: 'dark' } : {};
  const ctx = await browser.newContext(phone ? { viewport: { width: o.width || 390, height: o.height || 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce', ...scheme } : { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', ...scheme });
  // what reaches the device's own speech (must stay empty: the AI voice only)
  await ctx.addInitScript('(() => { try { const P = window.SpeechSynthesis && SpeechSynthesis.prototype; if (!P) return; const s = P.speak; window.__device = []; P.speak = function (u) { window.__device.push(u && u.text); return s.call(this, u); }; } catch (e) {} })();');
  const lang = o.lang || 'en';
  const init = {
    user: { displayName: 'T', avatar: 'x', lang, dir: ['ar', 'he'].includes(lang) ? 'rtl' : 'ltr', isGuest: false },
    game: { id: 'g', title: 'Arithmetic Lab', url: 'https://oomba.test/play/arithmetic-lab' },
    save: o.saveData || {}, canSave: true,
    ...(o.set ? { set: { id: 's-abcdefghjk', items: [o.set], mine: false } } : {}),
    ...(o.tts ? { tts: o.tts } : {}),
    ...(o.print ? { print: true } : {}),
    ...(o.canAssign ? { canAssign: true } : {}),
    ...(o.params ? { params: o.params } : {}),
    ...(o.mySets ? { mySets: true } : {}),
    ...(o.dark ? { theme: 'dark' } : {})
  };
  const doc = frameDocument(GAME(), init);
  // (a viewport, as the play page has: without it a phone lays the page out 980 wide and the game with it)
  const page = `<!doctype html><meta charset=utf-8><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>window.__tts = []; window.__print = []; window.__msgs = []; let __set = 0;
addEventListener('message', e => { const m = e.data; if (!m || m.brb !== 1) return; window.__msgs.push(JSON.parse(JSON.stringify(m)));
  if (m.type === 'brb:set-save') e.source.postMessage({ brb: 1, type: 'brb:set-saved', id: m.id, set: m.set || ('s-saved' + String(++__set).padStart(5, '0')) }, '*');
  if (m.type === 'brb:sets' && m.op === 'list') e.source.postMessage({ brb: 1, type: 'brb:sets-done', id: m.id, sets: [] }, '*'); }); const VOICE = ${JSON.stringify(o.voice || 'ok')}, MP3 = Uint8Array.from(atob('${MP3}'), c => c.charCodeAt(0));
addEventListener('message', async e => { const m = e.data; if (!m || m.brb !== 1) return;
  if (m.type === 'brb:tts') { window.__tts.push({ text: m.text, lang: m.lang, check: !!m.check, pre: !!m.pre }); if (VOICE === 'none' || m.pre) return;
    const ok = VOICE === 'ok' && (await window.__allowed(m.text, m.lang));
    if (m.check) return e.source.postMessage({ brb: 1, type: 'brb:tts', id: m.id, ok, check: true }, '*');
    if (ok) { const buf = MP3.slice().buffer; e.source.postMessage({ brb: 1, type: 'brb:tts', id: m.id, ok: true, buf }, '*', [buf]); }
    else e.source.postMessage({ brb: 1, type: 'brb:tts', id: m.id, ok: false }, '*'); }
  if (m.type === 'brb:print') { window.__print.push(m.doc); const r = await window.__printReply(m.doc); e.source.postMessage({ brb: 1, type: 'brb:printed', id: m.id, ...r }, '*'); } });</script>`;
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    return route.abort();
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  // the page answers as the server would: a line is read only when the game's allowlist has it
  const lines = await import('../../server/services/tts-lines.js');
  await p.exposeFunction('__allowed', (text, l) => !!lines.allowedLine('arithmetic-lab', l || 'en', text));
  await p.exposeFunction('__printReply', async (d) => (o.printReply ? o.printReply(d) : { ok: true }));
  await p.goto(HOST + '/');
  const frame = p.frames().find((f) => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => document.querySelector('#app')?.children.length > 0, null, { timeout: 30000 });
  return { ctx, page: p, frame, errors, msgs: (type) => p.evaluate((t) => window.__msgs.filter((m) => !t || m.type === t), type), asked: () => p.evaluate(() => window.__tts), printed: () => p.evaluate(() => window.__print), device: () => frame.evaluate(() => window.__device || []) };
}
