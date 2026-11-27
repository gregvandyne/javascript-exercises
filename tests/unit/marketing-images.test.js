// The public marketing pages' pictures: every image, picture source, video poster and share picture a signed-out page
// points at is a file that is there, in the light theme, the dark one and the device's own (views/shot.js), with paid-plan
// pages off and on; every <img> outside a decoration has alt text; the themed screenshots carry their dark files.
import './_setup.js';
process.env.LANDING_AT_ROOT = '1';   // "/" is the teacher landing, as on the live site
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const { darkMedia } = await import('../../server/views/shot.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => resetLimits());
function paid(on) { config.stripeApiKey = on ? 'rk_test_fake' : ''; config.stripeWebhookSecret = on ? 'whsec_fake_img' : ''; config.billingPublic = on; }
test.afterEach(() => paid(false));

const PAGES = ['/', '/teachers', '/teachers/live', '/teachers/host', '/parents', '/parents/ai-builder-safety', '/parents/safety-and-screen-time', '/safety', '/research', '/compliance', '/he/teachers', '/es'];
const get = async (p, theme) => {
  const r = await fetch(base + p, { headers: theme ? { cookie: `theme=${theme}` } : {} });
  assert.equal(r.status, 200, p); return r.text();
};
/** Every local file a page's markup points at for a picture: img src/srcset, source srcset, video poster, og/twitter image. */
function pictures(h) {
  const out = new Set();
  const add = u => { u = u.trim().split(/\s+/)[0]; if (!u || u.startsWith('data:')) return; const p = u.replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, ''); if (p.startsWith('/')) out.add(p); };
  for (const m of h.matchAll(/<(?:img|source)\b[^>]*>/g)) {
    const tag = m[0];
    for (const a of ['src', 'srcset']) { const v = (new RegExp(`\\s${a}="([^"]*)"`).exec(tag) || [])[1]; if (v && !/\.(mp4|vtt)$/.test(v)) v.split(',').forEach(add); }
  }
  for (const m of h.matchAll(/\sposter="([^"]+)"/g)) add(m[1]);
  for (const m of h.matchAll(/<meta (?:property="og:image"|name="twitter:image") content="([^"]+)"/g)) add(m[1]);
  return out;
}
// Pictures the server makes on the fly (not files in public/).
const DYNAMIC = /^\/(icons\/|stories\/|games\/|g\/|u\/|api\/)/;

test('every picture on the marketing pages is a file that is there, in each theme, with plans off and on', async () => {
  const missing = [];
  for (const on of [false, true]) {
    paid(on);
    for (const p of PAGES) for (const theme of [null, 'light', 'dark']) {
      for (const src of pictures(await get(p, theme))) {
        if (DYNAMIC.test(src) && !src.startsWith('/icons/')) continue;
        if (!fs.existsSync(path.join(ROOT, 'public', decodeURIComponent(src)))) missing.push(`${p} (${theme || 'auto'}, plans ${on ? 'on' : 'off'}): ${src}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('every <img> on the marketing pages has alt text, unless it is a decoration', async () => {
  const bad = [];
  for (const p of PAGES) {
    const h = await get(p);
    for (const m of h.matchAll(/<img\b[^>]*>/g)) {
      const tag = m[0];
      if (!/\salt="/.test(tag)) bad.push(`${p}: no alt: ${tag.slice(0, 120)}`);   // alt="" is a decoration screen readers skip
    }
    // The screenshots in a figure with words beside them (the landing's device pictures, the loop's) say what they show.
    for (const m of h.matchAll(/<div class="lp-screen[^"]*">(?:<picture>(?:<source[^>]*>)*)?<img\b[^>]*>/g)) {
      if (/\salt=""/.test(m[0])) bad.push(`${p}: screenshot without words: ${m[0].slice(0, 160)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the screenshots come in the page\'s theme: the Hub\'s dark capture on the dark landing, light ones with Light picked, the device\'s own on /teachers', async () => {
  const dark = await get('/', 'dark');
  assert.match(dark, /<source data-scheme="dark" data-media="" media="all"[^>]*srcset="\/img\/landing\/hub-dark-1200\.webp/);
  const light = await get('/', 'light');
  assert.match(light, /<source data-scheme="dark" data-media="" media="not all"/);
  const auto = await get('/teachers');
  assert.match(auto, /<source data-scheme="dark" data-media="\(min-width:960px\)" media="\(prefers-color-scheme: dark\) and \(min-width:960px\)"/);
  assert.match(auto, /srcset="\/img\/teach-loop\/gradebook-dark\.webp\?v=\d+"/);
  assert.equal(darkMedia('auto', ''), '(prefers-color-scheme: dark)');
  assert.equal(darkMedia('dark', '(min-width:960px)'), '(min-width:960px)');
  assert.equal(darkMedia('light', '(min-width:960px)'), 'not all');
  // The theme menu on the page retargets them without a reload (public/js/app.js applyTheme).
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8'), /source\[data-scheme="dark"\]/);
});

test('the share pictures: /teachers/live and /teachers/host have their own, /plans too while it is public', async () => {
  assert.match(await get('/teachers/live'), /<meta property="og:image" content="[^"]*\/og\/teachers-live\.jpg">/);
  assert.match(await get('/teachers/host'), /<meta property="og:image" content="[^"]*\/og\/teachers-host\.jpg">/);
  paid(true);
  assert.match(await get('/plans'), /<meta property="og:image" content="[^"]*\/og\/plans\.jpg">/);
  for (const f of ['teachers', 'teachers-live', 'teachers-host', 'plans']) {
    const file = path.join(ROOT, 'public/og', `${f}.jpg`);
    assert.ok(fs.existsSync(file), f);
    assert.ok(fs.statSync(file).size < 200 * 1024, `${f}.jpg under 200 KB`);
  }
});
