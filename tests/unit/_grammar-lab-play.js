// Shared by Grammar Lab's Phase 4 browser tests (grammar-lab-phone-browser, grammar-lab-locale-browser,
// grammar-lab-playthrough-browser): a server and Chromium, signed-in students, answering any question format (the test
// reads the course data for the item on screen; the page itself never has the answer), and the phone layout checks:
// nothing sideways, nothing cut off, nothing under the sticky top bar or the bottom nav, no line that starts with a
// punctuation mark, and (in a translated page) every piece of course text marked lang="en".
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const { createApp } = await import('../../server/app.js');
const { config } = await import('../../server/config.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
export const GL = await import('../../server/services/grammar-lab.js');
const { proofCore } = await import('../../server/services/proof-core.js');

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
const ROOT = path.resolve(import.meta.dirname, '../..');
export const SHOTS = process.env.GL_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

/** Start the server and Chromium with Grammar Lab on for everyone. -> { skip } (a reason, or false). */
export async function startAll(env) {
  config.grammarLab = true; config.grammarLabUsers = ['*'];
  // The official Mistake Hunt game, from its seed page (the rooms open in it).
  if (!q.get("SELECT 1 FROM games WHERE slug='mistake-hunt'")) {
    const official = auth.getUserByName('OombaAcademy') || auth.createUser({ username: 'OombaAcademy', password: 'secret123' });
    const g = games.createGame(official.id, { title: 'Mistake Hunt', source: 'seed', slug: 'mistake-hunt' });
    const v = games.addVersion(g.id, fs.readFileSync(path.join(ROOT, 'seed-games/mistake-hunt.html'), 'utf8'), { createdBy: official.id, safetyStatus: 'pass' });
    q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, current_version_id=? WHERE id=?", v.id, v.id, g.id);
  }
  if (!pw) return (env.skip = 'needs Playwright');
  try { env.browser = await pw.chromium.launch(); } catch (e) {
    if (!exe) return (env.skip = 'needs Chromium');
    try { env.browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } catch { return (env.skip = 'needs Chromium'); }
  }
  env.server = createApp().listen(0); env.server.keepAliveTimeout = 0;
  await new Promise(r => env.server.once('listening', r));
  env.base = `http://127.0.0.1:${env.server.address().port}`;
  return (env.skip = false);
}
export async function stopAll(env) {
  if (env.browser) await env.browser.close();
  if (env.server) env.server.close();
  config.grammarLab = false; config.grammarLabUsers = [];
}

let n = 0;
export const newKid = (tag = 'glp') => auth.createUser({ username: `${tag}${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
export const master = (u, id, band) => q.run("INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', ?, ?, 1, 1, 0, NULL, 1)", u.id, id, band);
export const sessionCookie = (id, base) => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); const at = c.indexOf('='); return { name: c.slice(0, at), value: c.slice(at + 1), url: base }; };
export async function shot(page, name) { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); }

/** The question on screen, as the server last sent it. */
export function watch(page) {
  const box = { q: null };
  page.on('response', async r => {
    if (!/\/api\/courses\/grammar-lab\/topic\/[^/]+\/(start|answer|state)$/.test(r.url())) return;
    try { const j = await r.json(); if (j && j.question) box.q = j.question; } catch { /* not json */ }
  });
  return box;
}
export const itemOf = (topic, id) => GL.topic(topic).items.find(it => it.id === id);
/** The question a page opened on (a run picked up on load comes in the page data, not a response). */
export async function syncBox(page, box) {
  if (box.q) return;
  const d = await page.evaluate(() => JSON.parse(document.getElementById('page-data').textContent));
  if (d.run && d.run.question) box.q = d.run.question;
}

/** Set a punctuation-chips sentence to these marks ([[gap, mark]]), from the marks it shows now. */
async function setMarks(page, it, target) {
  const want = new Map(target);
  for (let g = 0; g < it.words.length - 1; g++) {
    const now = (await page.getAttribute(`#gl-sentence .gl-mgap[data-m="${g}"]`, 'data-mark')) || '';
    const to = want.get(g) || '';
    if (now === to) continue;
    if (await page.isVisible('#gl-chips')) await page.click(`#gl-chips .gl-chip[data-c="${to || now}"]`);
    await page.click(`#gl-sentence .gl-mgap[data-m="${g}"]`);
  }
}
/** Clear what a wrong answer left marked, so the right answer can go in (choices and cycles replace the pick). */
export async function clearPicks(page, box, topic) {
  const qn = box.q, it = itemOf(topic, qn.id);
  if (qn.kind === 'marks') await setMarks(page, it, it.start);
  else if (qn.kind === 'tap' || qn.kind === 'gaps') for (const b of await page.$$('#gl-sentence [aria-pressed="true"]')) await b.click();
}
/** Answer the question on screen, right or (wrong) with a plain mistake. -> the item. */
export async function answer(page, box, topic, { wrong = false, retry = false } = {}) {
  await syncBox(page, box);
  const qn = box.q, it = itemOf(topic, qn.id);
  assert.ok(it, `the item ${qn.id}`);
  if (!retry) assert.ok(await page.isDisabled('#gl-submit'), `${qn.id}: Submit is off until the student acts`);
  const other = () => it.options.findIndex((_, i) => !it.answer.includes(i));
  if (qn.kind === 'marks') {
    const start = new Map(it.start), needsNone = it.want.length === start.size && it.want.every(([g, m]) => start.get(g) === m);
    if (wrong) {
      const g = [...Array(it.words.length - 1).keys()].find(x => !it.want.some(([h]) => h === x) && !it.optional.some(([h]) => h === x) && !start.has(x));
      await setMarks(page, it, [...it.start, [g, ',']]);
    } else if (needsNone) await page.click('#gl-asis');
    else await setMarks(page, it, it.want);
  } else if (qn.kind === 'fix') {
    if (qn.options) { const k = wrong ? other() : it.answer[0]; for (let i = 0; i <= k; i++) await page.click('#gl-cycle'); }
    else if (wrong) await page.fill('#gl-fix', `${it.text.replace(/\.$/, '')} today.`);
    else if (it.right === it.text) await page.click('#gl-asis');
    else await page.fill('#gl-fix', it.right);
  } else if (qn.kind === 'gaps') {
    const gaps = wrong ? [[...Array(qn.words.length - 1).keys()].find(g => !it.answer.includes(g) && !(it.optional || []).includes(g))] : [...it.answer, ...(it.optional || [])];
    for (const g of gaps) await page.click(`#gl-sentence .gl-gap[data-g="${g}"]`);
  } else if (qn.kind === 'tap' && !wrong && !it.answer.length) {
    await page.click('#gl-asis');
  } else if (qn.kind === 'tap') {
    const places = wrong ? [[...Array(qn.words.length).keys()].find(i => !it.answer.includes(i) && !(it.optional || []).includes(i))] : it.answer;
    for (const i of places) await page.click(`#gl-sentence .gl-w[data-i="${i}"]`);
  } else if (qn.kind === 'choice') {
    const k = wrong ? other() : it.answer[0];
    if (qn.passage) await page.click(`#gl-sentence .gl-sent[data-k="${k}"]`);
    else if (qn.cycle) for (let i = 0; i <= k; i++) await page.click('#gl-cycle');
    else await page.click(`#gl-options .gl-opt[data-k="${k}"]`);
  }
  assert.ok(await page.isEnabled('#gl-submit'), `${qn.id}: Submit is on once the student acted`);
  await page.click('#gl-submit');
  return it;
}
/** The double-tap tip opens on a first visit, just after the quiz: close it. */
export async function closeTip(page) {
  try { await page.waitForSelector('#gl-tip[open]', { timeout: 1500 }); } catch { return; }
  await page.click('#gl-tip-ok'); await page.waitForSelector('#gl-tip', { state: 'hidden' });
}
/** After a right answer: the green confirmation (a tap ends it sooner), then what comes next. */
export async function passFlash(page) {
  await page.waitForSelector('#gl-correct:not([hidden])');
  await page.click('#gl-correct').catch(() => {});
  await page.waitForSelector('#gl-correct', { state: 'hidden', timeout: 5000 });
}

/**
 * The phone layout checks, in the page (or a frame). -> a list of problems ([] is good).
 *   keys: selectors that must be fully in view between the top bar and the bottom nav, as the page placed them now;
 *   bottom: also scroll to the end and check that nothing there sits under the bottom nav;
 *   en: course strings (unit and topic names) that must sit inside lang="en" when the page is not English.
 */
export async function layoutProblems(page, { keys = [], bottom = true, en = [], root = 'main' } = {}) {
  return page.evaluate(async ({ keys, bottom, en, root }) => {
    const out = [];
    const de = document.documentElement, vw = de.clientWidth, vh = innerHeight;
    const name = e => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;
    const shown = e => { if (e.closest('[hidden]') || e.closest('dialog:not([open])')) return false; const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0; };
    const scroller = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox !== 'visible') return p; } return null; };
    const top = document.querySelector('.topbar'), tab = document.querySelector('.tabbar');
    const bars = [top, tab].filter(b => b && shown(b));
    const topEdge = top && shown(top) ? top.getBoundingClientRect().bottom : 0, botEdge = tab && shown(tab) ? tab.getBoundingClientRect().top : vh;
    const base = document.querySelector(root) || document.body;
    const all = [...base.querySelectorAll('*'), ...document.querySelectorAll('dialog[open] *, .gl-overlay:not([hidden]) *')].filter(shown);
    if (de.scrollWidth > vw + 1) out.push(`the page scrolls sideways (${de.scrollWidth} > ${vw})`);
    for (const e of all) {
      const r = e.getBoundingClientRect();
      if ((r.right > vw + 1 || r.left < -1) && !scroller(e) && getComputedStyle(e).position !== 'fixed') out.push(`sticks out sideways: ${name(e)} (${Math.round(r.left)} to ${Math.round(r.right)} of ${vw})`);
      const cs = getComputedStyle(e);
      if (e.clientWidth > 2 && !e.classList.contains('sr-only') && (cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 2 && e.textContent.trim() && !e.matches('svg *, .gl-stage, .gl-stage *, .gl-cover, .gl-ring, .gl-ring *, .gla, .gla *')) out.push(`cut off: ${name(e)} ("${e.textContent.trim().slice(0, 40)}")`);
    }
    // under a bar: a point of the element that the bar covers
    const underBar = (e, what, ends = false) => {
      const r = e.getBoundingClientRect();
      const pts = ends ? [[r.left + r.width / 2, r.bottom - 2], [r.left + 4, r.bottom - 2], [r.right - 4, r.bottom - 2]]
        : [[r.left + r.width / 2, r.top + 2], [r.left + r.width / 2, r.bottom - 2], [r.left + 4, r.top + r.height / 2], [r.right - 4, r.top + r.height / 2]];
      for (const [x, y] of pts) {
        if (y < 0 || y > vh || x < 0 || x > vw) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && bars.some(b => b.contains(hit))) { out.push(`${what}: ${name(e)} is under the ${hit.closest('.topbar') ? 'top bar' : 'bottom nav'}`); return; }
      }
    };
    for (const sel of keys) {
      const e = document.querySelector(sel);
      if (!e || !shown(e)) { out.push(`missing: ${sel}`); continue; }
      const r = e.getBoundingClientRect();
      if (r.top < topEdge - 1) out.push(`${sel} starts under the top bar (${Math.round(r.top)} < ${Math.round(topEdge)})`);
      else if (r.bottom > botEdge + 1 && r.height < botEdge - topEdge) out.push(`${sel} ends under the bottom nav or off the screen (${Math.round(r.bottom)} > ${Math.round(botEdge)})`);
      underBar(e, 'in view');
    }
    // the end of the page: its last things clear the bottom nav
    if (bottom && !document.querySelector('dialog[open], .gl-overlay:not([hidden])')) {
      const y0 = scrollY;
      scrollTo(0, de.scrollHeight);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const lasts = all.filter(e => (e.matches('a, button, p, h1, h2, h3, li, label, input, textarea, select, summary')) && !e.closest('.topbar, .tabbar, .gl-flash, .gl-bubble')).filter(shown);
      const maxB = Math.max(...lasts.map(e => e.getBoundingClientRect().bottom));
      for (const e of lasts) if (e.getBoundingClientRect().bottom > maxB - 60) underBar(e, 'at the end', true);
      scrollTo(0, y0);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    // a line that starts with a punctuation mark: per text block (a box of its own, not an inline piece), each line's
    // first visible character
    const PUNCT = /[.,;:!?)\]}»”’،؛؟。、，．！？：；·]/u;
    const blockOf = el => { for (let p = el; p; p = p.parentElement) { const d = getComputedStyle(p).display; if (!/^inline|^contents$/.test(d)) return p; } return document.body; };
    const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT);
    const last = new Map();
    const scan = node => {
      const el = node.parentElement;
      if (!el || !shown(el) || el.closest('svg, .gl-stage, .sr-only, script, style, noscript')) return;
      const blk = blockOf(el), text = node.textContent;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (/\s/.test(ch)) continue;
        const rg = document.createRange(); rg.setStart(node, i); rg.setEnd(node, i + 1);
        const r = rg.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        const prev = last.get(blk);
        if (prev && r.top >= prev.bottom - 2 && PUNCT.test(ch)) out.push(`a line starts with "${ch}": ${name(blk)} ("${(blk.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50)}")`);
        last.set(blk, r);
      }
    };
    for (let nd = walker.nextNode(); nd; nd = walker.nextNode()) scan(nd);
    for (const dlg of document.querySelectorAll('dialog[open], .gl-overlay:not([hidden])')) { const w2 = document.createTreeWalker(dlg, NodeFilter.SHOW_TEXT); for (let nd = w2.nextNode(); nd; nd = w2.nextNode()) scan(nd); }
    // course text inside a translated page: marked English
    const pageLang = (de.lang || 'en').toLowerCase();
    if (!pageLang.startsWith('en') && en.length) {
      const w3 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let nd = w3.nextNode(); nd; nd = w3.nextNode()) {
        const el = nd.parentElement, s = nd.textContent.trim();
        if (!el || !s || el.closest('script, style, title') || !shown(el)) continue;
        if (en.some(x => s === x || (x.length > 8 && s.includes(x)))) { const l = (el.closest('[lang]') || de).getAttribute('lang') || ''; if (!l.toLowerCase().startsWith('en')) out.push(`course text not marked lang="en": ${name(el)} ("${s.slice(0, 50)}")`); }
      }
    }
    return [...new Set(out)];
  }, { keys, bottom, en, root });
}

/** Play a topic's Mistake Hunt room from its unit's menu: every mistake fixed, handed in, checked on the server.
 *  check(page, frame, name): the caller's layout checks inside the room. */
export async function playRoom(page, base, p, topic, { check = null, name = '' } = {}) {
  await page.goto(`${base}/courses/grammar-lab/${p.band}/${p.id}`);
  await page.click(`#gl-topic-${topic} summary`);
  await Promise.all([page.waitForURL(/\/play\/mistake-hunt\?glroom=/), page.click(`#gl-topic-${topic} a.gl-mi[href*="glroom"]`)]);
  await page.waitForSelector('#gameframe');
  const f = await (await page.$('#gameframe')).contentFrame();
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.mhState);
  await f.waitForSelector('#mh-handin');
  await page.waitForTimeout(400);
  if (check) await check(page, f, `${name}-room`);
  const P = proofCore(), r = GL.room(topic);
  for (const ps of r.passages) for (const x of P.key(ps.x, ps.m)) await f.evaluate(([a, b, s]) => window.__brbTest.mhFix(a, b, s), [x.a, x.b, x.right]);
  await f.click('#mh-handin');
  await f.waitForSelector('#mh-handin-yes');
  await f.click('#mh-handin-yes');
  await f.waitForSelector('#mh-gscore');
  if ((await page.evaluate(() => document.documentElement.lang)) === 'en') assert.match(await f.textContent('#mh'), /pass this room/);
  if (check) await check(page, f, `${name}-room-done`);
}

/**
 * The teaching card's marked words, in the page: -> a list of problems ([] is good). Inside root (the card's body), the
 * boxes of every word (each word of its text, from its glyphs), every mark (a colored highlight, a capital or a comma
 * marker) and every label under a mark are compared: no two may overlap (a word inside its own mark is part of it), and
 * none may stick out of the card sideways, out of the box it sits in, or be cut off. The page never scrolls sideways.
 */
export async function cardOverlaps(page, root = '.gl-card-body') {
  return page.evaluate(sel => {
    const out = [], de = document.documentElement, vw = de.clientWidth;
    if (de.scrollWidth > vw + 1) out.push(`the page scrolls sideways (${de.scrollWidth} > ${vw})`);
    const scopes = [...document.querySelectorAll(sel)].filter(e => !e.closest('[hidden]') && e.getBoundingClientRect().height > 0);
    if (!scopes.length) return [`missing: ${sel}`];
    const say = s => s.replace(/\s+/g, ' ').trim().slice(0, 30);
    for (const scope of scopes) {
      const sr = scope.getBoundingClientRect();
      const boxes = [];
      for (const m of scope.querySelectorAll('.gl-mk')) { const r = m.getBoundingClientRect(); boxes.push({ kind: 'mark', el: m, r, text: say(m.firstChild ? m.firstChild.textContent : '') }); }
      // (a label's own text: a comma's label box takes no width, its words hang centered under the comma)
      for (const l of scope.querySelectorAll('.gl-mk-tag')) { const rg = document.createRange(); rg.selectNodeContents(l); boxes.push({ kind: 'label', el: l, r: rg.getBoundingClientRect(), text: say(l.textContent) }); }
      const walk = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      for (let nd = walk.nextNode(); nd; nd = walk.nextNode()) {
        const el = nd.parentElement;
        if (!el || el.closest('.gl-mk-tag, .sr-only, [hidden]')) continue;
        const re = /\S+/g; let m;
        while ((m = re.exec(nd.textContent))) {
          const rg = document.createRange(); rg.setStart(nd, m.index); rg.setEnd(nd, m.index + m[0].length);
          for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0.5) boxes.push({ kind: 'word', el, r, text: m[0] });
        }
      }
      const inside = (a, b) => a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el);
      const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      for (let i = 0; i < boxes.length; i++) {
        const a = boxes[i];
        if (a.r.right > sr.right + 1 || a.r.left < sr.left - 1) out.push(`${a.kind} "${a.text}" sticks out of the card sideways (${Math.round(a.r.left)} to ${Math.round(a.r.right)}, card ${Math.round(sr.left)} to ${Math.round(sr.right)})`);
        if (a.kind === 'label') {
          const holder = a.el.closest('.gl-example, .gl-tips, .gl-section, .gl-card-body');
          const hr = holder.getBoundingClientRect();
          if (a.r.bottom > hr.bottom + 1) out.push(`label "${a.text}" hangs out of the bottom of its box`);
        }
        for (let k = i + 1; k < boxes.length; k++) {
          const b = boxes[k];
          if (a.kind === 'word' && b.kind === 'word' && a.el === b.el) { if (hit(a.r, b.r)) out.push(`words overlap: "${a.text}" and "${b.text}"`); continue; }
          if (inside(a, b)) continue;
          if (hit(a.r, b.r)) out.push(`${a.kind} "${a.text}" overlaps ${b.kind} "${b.text}"`);
        }
      }
      for (const e of scope.querySelectorAll('*')) {
        const cs = getComputedStyle(e);
        if (/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY) && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)) out.push(`cut off: ${e.className} ("${say(e.textContent)}")`);
      }
    }
    return [...new Set(out)];
  }, root);
}
