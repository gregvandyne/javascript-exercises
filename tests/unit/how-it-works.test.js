// "How it works" on /parents and /teachers (server/views/how.js): the steps render in order under one h2, every
// screenshot exists on disk with width, height, alt text and lazy loading, the hero picture is decoration only, the
// family step shows only while paid-plan pages are public, the words promise nothing the site doesn't do and show no
// price, the page's section ids are all still there (but the removed game lists), and right-to-left pages render.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { STEPS, howFiles } = await import('../../server/views/how.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales/en.json'), 'utf8'));

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => resetLimits());
function paid(on) { config.stripeApiKey = on ? 'rk_test_fake' : ''; config.stripeWebhookSecret = on ? 'whsec_fake_how' : ''; config.billingPublic = on; }
test.afterEach(() => paid(false));
const get = async p => { const r = await fetch(base + p); assert.equal(r.status, 200, p); return r.text(); };
/** The markup of the element that starts at `start` (balanced on that tag name). */
function element(h, start) {
  const i = h.indexOf(start); if (i < 0) return null;
  const tag = /^<(\w+)/.exec(start)[1]; const re = new RegExp(`<(/?)${tag}[\\s>]`, 'g'); re.lastIndex = i + 1;
  let depth = 1, m;
  while ((m = re.exec(h))) { depth += m[1] ? -1 : 1; if (!depth) return h.slice(i, h.indexOf('>', m.index) + 1); }
  return null;
}
const attr = (tag, name) => (new RegExp(`\\s${name}="([^"]*)"`).exec(tag) || [])[1];
const text = h => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const PRICE = /\$\s?\d|\d\.\d\d\b|\bUSD\b|€|£\s?\d|\/mo\b|a month\b|per (month|year)/i;
const PROMISES = [/COPPA/i, /kidSAFE/i, /parental controls?/i, /\bmonitor/i, /\btrack/i];

/** The section's opening tag: /parents keeps the app's steps; /teachers has the homepage's click-through tour. */
const HOW = { parents: '<section class="lp-sec how" id="how-it-works"', teachers: '<section class="lp-sec lp-dots lp-alt" id="how-it-works"' };
for (const page of ['parents']) {
  test(`/${page}: "How it works" comes right after the hero (on /parents, after the short video and the short safety section), with numbered steps and real screenshots`, async () => {
    const h = await get(`/${page}`);
    const sec = element(h, '<section class="lp-sec how" id="how-it-works"');
    assert.ok(sec, 'the section is there');
    // What comes next: on /parents the folded panels, on /teachers the teaching loop (the game lists are gone: docs/
    // decisions.md "Teachers and Parents pages: lead with the new tools, no 'always free'").
    const END = page === 'parents' ? '<div class="lp-cols">' : 'id="teach-loop"';
    assert.ok(h.indexOf('id="how-it-works"') < h.indexOf(END), `before ${END}`);
    assert.ok(h.indexOf('class="lp-hero lp-hero-how"') < h.indexOf('id="how-it-works"'), 'after the hero');
    // Headings in order: the page's one h1, (on /parents: "See it in under a minute" and "What makes it safe", two h2s;
    // on /teachers: every tool, an h2 and an h3 per card), then this h2, then one h3 per step.
    const before = page === 'parents' ? [1, 2, 2] : [1, 2, ...[...h.matchAll(/class="panel tt-card"/g)].map(() => 3)];
    if (page === 'teachers') assert.ok(h.indexOf('id="tools"') < h.indexOf('id="how-it-works"'), 'the new tools come first');
    if (page === 'parents') {
      const at = s => h.indexOf(s);
      assert.ok(at('class="lp-hero lp-hero-how"') < at('id="video"') && at('id="video"') < at('id="safe"') && at('id="safe"') < at('id="how-it-works"'), 'the one parent page: hero, video, safety, How it works');
      assert.match(h.slice(at('id="video"'), at('id="safe"')), /<h2 id="video-h">[^<]+<\/h2>/);
    }
    const heads = [...h.slice(h.indexOf('<main'), h.indexOf(END)).matchAll(/<h([1-6])[\s>]/g)].map(m => +m[1]);
    assert.deepEqual(heads, [...before, 2, ...Array(heads.length - before.length - 1).fill(3)]);
    assert.match(sec, /<h2 id="how-h">[^<]+<\/h2>/);
    const steps = [...sec.matchAll(/<li class="how-step" id="how-(\d+)" data-step="(\d+)">/g)];
    assert.equal(steps.length, STEPS[page].filter(s => !s.when).length, 'every step whose screen is on');
    steps.forEach((m, i) => { assert.equal(+m[1], i + 1); assert.equal(+m[2], i + 1); });
    assert.equal(heads.length - before.length - 1, steps.length, 'one h3 per step');
    // Every picture: a file on disk, a size, alt text, lazy.
    const imgs = [...sec.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
    assert.equal(imgs.length, steps.length);
    for (const img of imgs) {
      assert.ok(attr(img, 'alt') && attr(img, 'alt').length > 30, `alt text: ${img}`);
      assert.equal(attr(img, 'width'), '390'); assert.equal(attr(img, 'height'), '844');
      assert.equal(attr(img, 'loading'), 'lazy');
    }
    for (const src of [...sec.matchAll(/\b(?:src|srcset)="([^"]+)"/g)].flatMap(m => m[1].split(',').map(s => s.trim().split(' ')[0]))) {
      assert.match(src, /^\/img\/how\/[\w-]+\.webp$/, src);
      assert.ok(fs.existsSync(path.join(ROOT, 'public', src)), `${src} exists`);
      const r = await fetch(base + src); assert.equal(r.status, 200, src); assert.match(r.headers.get('content-type'), /image\/webp/);
    }
    // The desktop sources (from 960px) are 1024x640; a dark phone source (views/shot.js) is the phone's 390x844.
    for (const s of sec.matchAll(/<source\b[^>]*>/g)) {
      const desk = /min-width:960px/.test(attr(s[0], 'data-media') ?? attr(s[0], 'media') ?? '');
      assert.equal(attr(s[0], 'width'), desk ? '1024' : '390'); assert.equal(attr(s[0], 'height'), desk ? '640' : '844');
    }
    // The stage that how.js fills is hidden and silent until then.
    assert.match(sec, /<div class="how-stage" aria-hidden="true" hidden>/);
    // The hero picture is decoration: hidden from screen readers, empty alt, the same files as the steps.
    const art = element(h, '<div class="how-art" aria-hidden="true">');
    assert.ok(art, 'hero picture');
    for (const img of art.match(/<img\b[^>]*>/g)) { assert.equal(attr(img, 'alt'), ''); assert.ok(attr(img, 'width') && attr(img, 'height')); }
    // It sits next to the h1 on wide screens: not lazy.
    for (const img of art.match(/<img\b[^>]*>/g)) assert.equal(attr(img, 'loading'), undefined);
    // The step counter reads "3 / 5" in right-to-left pages too.
    assert.match(sec, /<span class="how-count" dir="ltr">/);
    // /parents: the same files as the steps; /teachers: the new tools (scripts/tools-shots.js), the board also in its card.
    const shown = page === 'parents' ? sec : element(h, '<section class="lp-sec tt" id="tools"');
    for (const src of [...art.matchAll(/\bsrcset="([^"]+)"/g)].flatMap(m => m[1].split(',').map(s => s.trim().split(' ')[0]))) {
      assert.ok(fs.existsSync(path.join(ROOT, 'public', src)), `${src} exists`);
      if (page === 'parents' || src.includes('-d-')) assert.ok(shown.includes(src), `${src} is on the page below too`);
    }
    // Its own stylesheet and script, nothing inline.
    assert.match(h, /<link rel="stylesheet" href="\/css\/how\.css\?v=[^"]+">/);
    assert.match(h, /<script type="module" src="\/js\/how\.js\?v=[^"]+"><\/script>/);
  });

}

test('/teachers: "How it works" right after the tools, as the homepage\'s click-through tour: a step each, its real screen whole, light and dark', async () => {
  const h = await get('/teachers');
  const sec = element(h, HOW.teachers);
  assert.ok(sec, 'the section is there');
  assert.ok(h.indexOf('class="lp-hero') < h.indexOf('id="tools"') && h.indexOf('id="tools"') < h.indexOf('id="how-it-works"') && h.indexOf('id="how-it-works"') < h.indexOf('id="teach-loop"'), 'hero, tools, How it works, the loop');
  assert.match(sec, /<p class="lp-eyebrow">How it works<\/p><h2 id="how-h">How it works in your classroom<\/h2>/);
  assert.match(sec, /<div class="lp-card lp-tour" data-tour aria-label="How it works in your classroom" role="region">/);
  const steps = [...sec.matchAll(/<li class="lp-tstep" id="how-(\d+)" data-step="(\d+)">/g)];
  assert.equal(steps.length, STEPS.teachers.filter(s => !s.when).length, 'every step whose screen is on');
  steps.forEach((m, i) => { assert.equal(+m[1], i + 1); assert.equal(+m[2], i); });
  assert.equal((sec.match(/<button type="button" class="lp-step" data-go="\d+"/g) || []).length, steps.length, 'a stepper button each');
  assert.equal((sec.match(/<h3 tabindex="-1">/g) || []).length, steps.length, 'one h3 per step');
  // Every picture: the desktop capture, whole (no zoom), with its size and alt text; only the first one not lazy.
  const imgs = [...sec.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
  assert.equal(imgs.length, steps.length);
  imgs.forEach((img, i) => {
    assert.ok(attr(img, 'alt') && attr(img, 'alt').length > 30, `alt text: ${img}`);
    assert.equal(attr(img, 'width'), '1024'); assert.equal(attr(img, 'height'), '640');
    assert.equal(attr(img, 'loading'), i ? 'lazy' : undefined);
  });
  assert.equal((sec.match(/data-cam="50,50,100"/g) || []).length, steps.length);
  assert.doesNotMatch(sec, /lp-ring/, 'nothing ringed: the whole screen');
  for (const src of [...sec.matchAll(/\b(?:src|srcset)="([^"]+)"/g)].flatMap(m => m[1].split(',').map(x => x.trim().split(' ')[0]))) {
    assert.match(src, /^\/img\/how\/[\w-]+-d-(1024|2048)\.webp$/, src);
    assert.ok(fs.existsSync(path.join(ROOT, 'public', src)), `${src} exists`);
  }
  assert.match(sec, /<source data-scheme="dark"[^>]*srcset="\/img\/how\/teachers-classes-dark-d-1024\.webp 1024w/, 'the dark screens for a dark page');
  // The homepage's script and styles; the app's how.css and how.js are not on the page.
  assert.match(h, /\/css\/landing\.css/); assert.match(h, /\/js\/landing\.js/);
  assert.doesNotMatch(h, /\/css\/how\.css|\/js\/how\.js/);
});

for (const page of ['parents', 'teachers']) {
  test(`/${page}: the words show no price and promise nothing the site doesn't do`, async () => {
    for (const on of [false, true]) {
      paid(on);
      const sec = element(await get(`/${page}`), HOW[page]);
      const words = text(sec) + ' ' + [...sec.matchAll(/alt="([^"]*)"/g)].map(m => m[1]).join(' ');
      assert.doesNotMatch(words, PRICE);
      for (const re of PROMISES) assert.doesNotMatch(words, re);
      for (const m of words.matchAll(/.{0,60}\bdashboard/gi)) assert.match(m[0], /\b(no|don’t have)\b/i, m[0]);
      assert.doesNotMatch(sec, /\b(parents|teachers)\.how\./, 'no raw locale key');
    }
    const strings = JSON.stringify(en[page].how);
    assert.doesNotMatch(strings, PRICE);
    for (const re of PROMISES) assert.doesNotMatch(strings, re);
    assert.doesNotMatch(strings, /dashboard/i);
  });
}

test('/parents: the family step shows only while paid-plan pages are public', async () => {
  const off = await get('/parents');
  assert.doesNotMatch(off, /parents-family-/);
  assert.equal((off.match(/class="how-step"/g) || []).length, 5);
  paid(true);
  const on = await get('/parents');
  assert.equal((on.match(/class="how-step"/g) || []).length, 6);
  assert.match(on, /<li class="how-step" id="how-6"[\s\S]*?parents-family-p-390\.webp/);
});

test('/parents and /teachers keep every section id', async () => {
  const par = await get('/parents');
  for (const id of ['lp-h1', 'how-it-works', 'ages', 'make', 'safe', 'private', 'home', 'guides', 'details', 'faq', 'what', 'stored', 'never', 'ai', 'keep', 'friends', 'builder', 'languages']) assert.match(par, new RegExp(`id="${id}"`), `/parents #${id}`);
  // While paid-plan pages are on, also Plans and Family accounts (what /grown-ups said; /grown-ups#… had no ids).
  paid(true);
  const on = await get('/parents');
  for (const id of ['plans', 'families']) assert.match(on, new RegExp(`id="${id}"`), `/parents #${id}`);
  paid(false);
  const tea = await get('/teachers');
  for (const id of ['lp-h1', 'tools', 'how-it-works', 'build', 'class', 'safe', 'uses', 'start', 'faq']) assert.match(tea, new RegExp(`id="${id}"`), `/teachers #${id}`);
});

test('every step has its four pictures in public/img/how, and English words', () => {
  for (const [page, steps] of Object.entries(STEPS)) {
    for (const s of steps) {
      for (const f of howFiles(s.slug)) assert.ok(fs.existsSync(path.join(ROOT, 'public/img/how', f)), f);
      for (const k of ['h', 'p', 'alt']) assert.ok(en[page].how[s.n][k], `${page}.how.${s.n}.${k}`);
    }
  }
  assert.ok(en.teachers.how.s2.pgoogle.startsWith(en.teachers.how.s2.p));
});

test('right-to-left pages render the steps', async () => {
  for (const p of ['/he/parents', '/ar/teachers']) {
    const h = await get(p);
    assert.match(h, /<html lang="(he|ar)" dir="rtl"/);
    assert.match(h, /id="how-it-works"/);
    // Translated: no English heading left in the walkthrough.
    assert.match(h, /<h2 id="how-h">/);
    assert.doesNotMatch(element(h, HOW[p.split('/')[2]]), /\slang="en"/);
  }
});

test('the client script and styles add motion only, and stop for reduced motion', () => {
  const js = fs.readFileSync(path.join(ROOT, 'public/js/how.js'), 'utf8');
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /if \(!reduce && IO\)/);
  assert.match(js, /requestAnimationFrame/);
  const css = fs.readFileSync(path.join(ROOT, 'public/css/how.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // Hiding (the reveal) and moving (the parallax) only inside the no-preference block.
  const outside = css.replace(/@media \(prefers-reduced-motion:no-preference\)\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g, '');
  assert.match(css, /\.how-rv:not\(\.is-in\)\{opacity:0/);
  assert.doesNotMatch(outside, /how-rv:not/);
  assert.doesNotMatch(outside, /animation-timeline/);
  // Motion uses transform and opacity only.
  for (const m of css.matchAll(/transition:([^;}]+)/g)) for (const part of m[1].split(/,(?![^(]*\))/)) assert.match(part.trim(), /^(opacity|transform)\b/, part);
});
