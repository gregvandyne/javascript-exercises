// The Flashcards page (seed-games/flashcards.html) in real Chromium inside the production game frame, on a stand-in for
// the play page that answers the SDK (save a set, find a class code, AI cards, a document, copy, print, card progress).
// Shared by tests/unit/flashcards-browser.test.js and scripts/flashcards-shots.js. Skipped where there is no Chromium.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell'];
export const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f) && fs.statSync(f).isFile());
export const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
export const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/flashcards.html'), 'utf8');
export const HOST = 'http://game.invalid';
export const SETID = 's-abcdefghjk';
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');

let browser;
export async function closeBrowser() { if (browser) await browser.close(); browser = null; }
/** opts: width, height, lang, theme, save, set ({ id, items, mine }), canAssign, clues (AI on), make, mySets, print,
 *  lesson (the play page passes card progress on, as when opened from a lesson step), sets (My worksheets' list). */
/** A picture the stand-in page hands the frame for a card (BRB.flashPicUrl): a painted-looking PNG, as a data: URL. */
const { paint: paintPng } = await import('../support/fake-gemini.js');
export const picUrl = (seed = 'a', w = 320, h = 240) => `data:image/png;base64,${paintPng(`Mood: bright ${seed}`, { w, h }).toString('base64')}`;
/** flashPics: { upload, paint, left } (a grown-up who may add pictures); makePrivate: a student's or a child's own sets.
 *  The stand-in answers an upload with img:Up<n>..., a painting with img:Pt<n>... (its first look says "painting"). */
export async function open({ width = 1280, height = 900, lang = 'en', theme = 'light', save = {}, set = null, canAssign = true, clues = true, make = true, mySets = false, print = true, lesson = false, sets = [], flashPics = null, makePrivate = false } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 700, colorScheme: theme });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang, dir: ['ar', 'he'].includes(lang) ? 'rtl' : 'ltr' }, game: { id: 'g', title: 'Flashcards', url: `${HOST}/play/flashcards` }, save, canSave: true, tts: { langs: [] }, theme,
    ...(set ? { set } : {}), ...(flashPics ? { flashPics } : {}), ...(makePrivate ? { makePrivate: true } : {}), ...(canAssign ? { canAssign: true } : {}), ...(clues ? { clues: true } : {}), ...(make ? { make: true } : {}), ...(mySets ? { mySets: true } : {}), ...(print ? { print: true } : {}) });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>window.__pics = ${JSON.stringify([picUrl('a'), picUrl('b'), picUrl('c'), picUrl('d')])}; window.__picN = 0; window.__looks = {};
window.__msgs = []; window.__lesson = ${lesson ? 'true' : 'false'}; window.__sets = ${JSON.stringify(sets)};
addEventListener('message', e => { const d = e.data; if (!d || d.brb !== 1) return; window.__msgs.push(d);
  const back = m => e.source.postMessage(Object.assign({ brb: 1 }, m), '*');
  if (d.type === 'brb:tts' && !d.pre) back({ type: 'brb:tts', id: d.id, ok: false, why: 'off' });
  if (d.type === 'brb:set-save') back({ type: 'brb:set-saved', id: d.id, set: '${SETID}' });
  if (d.type === 'brb:set-find') back(d.code.replace(/[^a-z0-9]/gi, '').toLowerCase() === 'abcdefghjk' ? { type: 'brb:set-found', id: d.id, set: '${SETID}', items: window.__setItems } : { type: 'brb:set-found', id: d.id, error: 'none' });
  if (d.type === 'brb:cards') back({ type: 'brb:cards-done', id: d.id, title: 'Plants', cards: [['root', 'Holds the plant in the soil', '🪴'], ['stem', 'Carries water up the plant', '🌿'], ['leaf', 'Makes food from sunlight', '🍃'], ['seed', 'Grows into a new plant', '🌰']] });
  if (d.type === 'brb:doc') back({ type: 'brb:doc-done', id: d.id, title: 'Ecosystems', words: [['habitat', 'Where an animal lives'], ['predator', 'An animal that hunts'], ['erosion', '']], cut: false, ai: true });
  if (d.type === 'brb:fpic-up') { const n = ++window.__picN; back({ type: 'brb:fpic-done', id: d.id, ref: 'img:Up' + n + 'aaaaaaaaaaaa', width: 480, height: 360 }); }
  if (d.type === 'brb:fpic-paint') back({ type: 'brb:fpic-done', id: d.id, refs: d.asks.map(() => 'img:Pt' + (++window.__picN) + 'aaaaaaaaaaaa'), more: 0, left: 9 });
  if (d.type === 'brb:fpic-get') { const k = window.__looks[d.ref] = (window.__looks[d.ref] || 0) + 1; const n = parseInt(d.ref.slice(6), 10) || 0;
    back(/^img:Pt/.test(d.ref) && k === 1 ? { type: 'brb:fpic-done', id: d.id, painting: true } : { type: 'brb:fpic-done', id: d.id, url: window.__pics[n % window.__pics.length] }); }
  if (d.type === 'brb:copy') back({ type: 'brb:copied', id: d.id, ok: true });
  if (d.type === 'brb:print') back({ type: 'brb:printed', id: d.id, ok: true });
  if (d.type === 'brb:flash') back(window.__lesson ? { type: 'brb:flash-done', id: d.id, ok: true, mastered: d.cards.filter(c => c[0] === 3).length, n: d.cards.length } : { type: 'brb:flash-done', id: d.id, error: 'notLesson' });
  if (d.type === 'brb:sets') back(d.op === 'list' ? { type: 'brb:sets-done', id: d.id, sets: window.__sets } : { type: 'brb:sets-done', id: d.id, ok: true });
}); window.__setItems = ${JSON.stringify(set && set.items ? set.items : [])};</script>`;
  const outside = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return process.env.FC_FONTS ? route.continue() : route.abort();
    outside.push(u); return route.abort();
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.fcState, null, { timeout: 60_000 });
  const state = () => frame.evaluate(() => window.__brbTest.fcState());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const until = (fn, arg, timeout = 20_000) => frame.waitForFunction(fn, arg, { timeout });
  const on = want => until(w => window.__brbTest.fcState().screen === w, want);
  const shot = async (dir, name) => { if (dir) await p.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false }); };
  const noSideScroll = () => frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  return { ctx, p, frame, state, msgs, until, on, errors, outside, shot, noSideScroll };
}
/** Answer the Learn question on screen: right (or wrong, ok false), by clicking a choice or typing. */
export async function learnAnswer(g, ok = true) {
  const s = await g.state();
  if (s.learn.kind === 'mc') {
    await g.frame.click(`#fc-choices .fc-choice[data-right="${ok}"]`);
  } else {
    await g.frame.fill('#fc-ans', ok ? s.learn.answer : 'zzz wrong');
    await g.frame.click('#fc-checkbtn');
  }
  await g.until(() => !!document.getElementById('fc-continue'));
  await g.frame.click('#fc-continue');
}
