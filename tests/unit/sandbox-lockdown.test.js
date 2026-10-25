// The in-frame SDK lockdown, proven against a hostile game in real Chromium, inside the exact
// production wrapper (frameDocument + FRAME_CSP + the sandbox attribute). Needs a local Chromium;
// skipped when there is none. See public/sdk/brb-sdk.js and docs/safety.md.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;

const { frameDocument, FRAME_CSP, SANDBOX } = await import('../../server/services/frame.js');
const HOST = 'http://game.invalid';

// A hostile game: tries every way to reach WebRTC and to borrow another window's objects.
const HOSTILE = `<title>Hostile</title><body><script>
var R = {};
function t(name, fn){ try { R[name] = fn(); } catch(e){ R[name] = 'threw ' + e.name; } }
t('rtc', function(){ return typeof window.RTCPeerConnection; });
t('rtcBracket', function(){ return typeof window['RTC'+'PeerConnection']; });
t('rtcDataChannel', function(){ return typeof window.RTCDataChannel; });
t('rtcRestore', function(){ try { Object.defineProperty(window,'RTCPeerConnection',{value:function(){}}); } catch(e){ return 'blocked ' + e.name; } return typeof window.RTCPeerConnection; });
t('rtcAssign', function(){ try { window.RTCPeerConnection = function(){}; } catch(e){} return typeof window.RTCPeerConnection; });
t('iframe', function(){ var f=document.createElement('iframe'); document.body.appendChild(f); return { connected:f.isConnected, cw:f.contentWindow, cd:f.contentDocument, frames:window.frames.length, win0: typeof window[0] }; });
t('iframeSrcdoc', function(){ var f=document.createElement('iframe'); f.srcdoc='<b>x</b>'; document.body.appendChild(f); return { cw:f.contentWindow, frames:window.frames.length }; });
t('innerHTML', function(){ var d=document.createElement('div'); document.body.appendChild(d); d.innerHTML='<iframe id=a></iframe><b>keep</b>'; return { iframe: !!document.getElementById('a'), frames:window.frames.length, keep:/keep/.test(d.innerHTML) }; });
t('insertAdjacent', function(){ var d=document.createElement('div'); document.body.appendChild(d); d.insertAdjacentHTML('beforeend','<iframe id=b></iframe>'); return { iframe: !!document.getElementById('b'), frames:window.frames.length }; });
t('insertAdjacentEl', function(){ var f=document.createElement('iframe'); document.body.insertAdjacentElement('beforeend', f); return { connected:f.isConnected, frames:window.frames.length }; });
t('rangeInsert', function(){ var f=document.createElement('iframe'); var r=document.createRange(); r.selectNodeContents(document.body); r.collapse(false); r.insertNode(f); return { connected:f.isConnected, frames:window.frames.length }; });
t('object', function(){ var o=document.createElement('object'); document.body.appendChild(o); return { cw:o.contentWindow, svg: o.getSVGDocument ? o.getSVGDocument() : 'none' }; });
t('docWrite', function(){ document.write('<iframe id=c></iframe>'); return { wrote: !!document.getElementById('c'), frames:window.frames.length }; });
t('domParser', function(){ return new DOMParser().parseFromString('<i></i>','text/html').defaultView; });
R.finalFrames = window.frames.length;
window.__R = R;
</script></body>`;

let browser;
test.after(async () => { if (browser) await browser.close(); });

test('a hostile game cannot use WebRTC or borrow another window', { skip, timeout: 60_000 }, async () => {
  const { chromium } = await import('playwright-core');
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext();
  const doc = frameDocument(HOSTILE, { user: { displayName: 'P', avatar: 'x' }, game: { id: 'g', title: 'H' }, save: {}, canSave: false, preview: true });
  const host = `<!doctype html><meta charset=utf-8><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': FRAME_CSP }, body: doc });
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto(HOST + '/', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const frame = page.frames().find(f => f.url() === HOST + '/frame');
  const R = await frame.evaluate(() => window.__R);

  // WebRTC is gone and cannot be put back.
  assert.equal(R.rtc, 'undefined');
  assert.equal(R.rtcBracket, 'undefined');
  assert.equal(R.rtcDataChannel, 'undefined');
  assert.equal(R.rtcRestore, 'blocked TypeError', 'defineProperty cannot restore it');
  assert.equal(R.rtcAssign, 'undefined', 'assignment cannot restore it');

  // No inner window/document is ever reachable, and no child browsing context is created.
  assert.equal(R.iframe.connected, false);
  assert.equal(R.iframe.cw, null);
  assert.equal(R.iframe.cd, null);
  assert.equal(R.iframe.frames, 0);
  assert.equal(R.iframe.win0, 'undefined');
  assert.equal(R.iframeSrcdoc.cw, null);
  assert.equal(R.innerHTML.iframe, false);
  assert.equal(R.innerHTML.keep, true, 'non-frame markup is left alone');
  assert.equal(R.insertAdjacent.iframe, false);
  assert.equal(R.insertAdjacentEl.connected, false, 'insertAdjacentElement never attaches a frame');
  assert.equal(R.insertAdjacentEl.frames, 0);
  assert.equal(R.rangeInsert.connected, false, 'Range.insertNode never attaches a frame');
  assert.equal(R.rangeInsert.frames, 0);
  assert.equal(R.object.cw, null);
  assert.equal(R.object.svg, null);
  assert.equal(R.docWrite.wrote, false, 'document.write is neutralised');
  assert.equal(R.domParser, null, 'a parsed document has no window to borrow');
  assert.equal(R.finalFrames, 0, 'window.frames stayed empty throughout');
});
