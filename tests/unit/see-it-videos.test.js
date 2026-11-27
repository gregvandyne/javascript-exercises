// "See it in action" (server/views/see-it.js): the tool videos on the teacher landing at "/" and on /teachers. Each
// video has its file, a poster and a captions track, plays only when asked (no autoplay, muted, preload none), and the
// note under them says who can use the tools today without opening anything up (services/teacher-tools.js is unchanged).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.LANDING_AT_ROOT = '1';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { VIDEOS, readyVideos, videoFiles } = await import('../../server/views/see-it.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => { process.env.LANDING_AT_ROOT = '1'; resetLimits(); });
const get = async path => { const r = await fetch(base + path, { headers: { accept: 'text/html' } }); return { status: r.status, text: await r.text(), type: r.headers.get('content-type') }; };

const ALL = ['manipulatives', 'figures', 'room', 'dashboard'];
// The Hub's own videos, the homepage's, not among the "a minute each" tool videos: the 60-second promo
// (scripts/hub-promo.mjs, behind the hero) and the two-minute overview (scripts/hub-video.mjs).
const OVERVIEWS = ['hub-promo', 'hub'];

test('the overview and the four videos, their posters and captions are in public/video and ready', () => {
  for (const id of [...OVERVIEWS, ...ALL]) {
    for (const f of videoFiles(id)) assert.ok(fs.existsSync(new URL(`../../public/video/${f}`, import.meta.url)), f);
    const vtt = fs.readFileSync(new URL(`../../public/video/oomba-${id}.en.vtt`, import.meta.url), 'utf8');
    assert.match(vtt, /^WEBVTT\n/, `${id}: a WebVTT file`);
    assert.doesNotMatch(vtt, /\u2014/, `${id}: no em dashes in the captions`);
  }
  assert.deepEqual(readyVideos().map(v => v.id), [...OVERVIEWS, ...ALL]);
  assert.deepEqual(readyVideos().filter(v => v.overview).map(v => v.id), OVERVIEWS);
  // the overview: 1280 x 720 H.264 like the others, under about 8 MB, captions for each step and the end card
  assert.ok(fs.statSync(new URL('../../public/video/oomba-hub.mp4', import.meta.url)).size < 8 * 1048576);
  const cues = fs.readFileSync(new URL('../../public/video/oomba-hub.en.vtt', import.meta.url), 'utf8').split('\n\n').slice(1);
  assert.ok(cues.length >= 15, `${cues.length} captions`);
  assert.match(cues.at(-1), /The Hub\. Available with the Teacher plan\./);
  // the promo: about a minute, under about 8 MB at 1080p, a caption for each headline and the end card
  assert.ok(fs.statSync(new URL('../../public/video/oomba-hub-promo.mp4', import.meta.url)).size < 8 * 1048576);
  const promo = fs.readFileSync(new URL('../../public/video/oomba-hub-promo.en.vtt', import.meta.url), 'utf8').split('\n\n').slice(1);
  assert.equal(promo.length, 7);
  assert.match(promo[0], /Every desk\. Live\./);
  assert.match(promo.at(-1), /The one classroom tool for everything\. The Hub\. Available with the Teacher plan\./);
  // A listed video without its files is left out, never an empty player.
  assert.ok(VIDEOS.every(v => readyVideos().includes(v) || !videoFiles(v.id).every(f => fs.existsSync(new URL(`../../public/video/${f}`, import.meta.url)))));
});

for (const path of ['/teachers']) {
  test(`${path}: the "See it in action" section with the Hub's promo and the four videos`, async () => {
    const page = await get(path);
    assert.equal(page.status, 200);
    // The homepage's video strip (docs/decisions.md "Teachers pages in the homepage's design"): posters that play in the
    // page's one player (public/js/landing.js), or open the file itself without script.
    const sec = (page.text.match(/<section class="lp-sec lp-dots lp-alt" id="see-it"[\s\S]*?<\/section>/) || [])[0];
    assert.ok(sec, 'the section is on the page');
    assert.match(sec, /<h2 id="see-it-h">The new teaching tools, a minute each<\/h2>/);
    assert.match(sec, /<div class="lp-vids" data-n="5">/);
    assert.equal((sec.match(/class="lp-vid[ "]/g) || []).length, 5);
    assert.equal((sec.match(/<video /g) || []).length, 1, 'one player for them all');
    assert.match(sec, /<video class="lp-vd-v" controls playsinline muted preload="none"/);
    // The Hub's 60-second promo first (its card in the tools above plays it too); never the two-minute overview.
    assert.ok(sec.indexOf('oomba-hub-promo.mp4') > 0 && sec.indexOf('oomba-hub-promo.mp4') < sec.indexOf(`oomba-${ALL[0]}.mp4`));
    for (const id of ALL) {
      assert.match(sec, new RegExp(`href="/video/oomba-${id}\\.mp4" data-video="/video/oomba-${id}\\.mp4" data-poster="/video/oomba-${id}-poster\\.jpg" data-vtt="/video/oomba-${id}\\.en\\.vtt"`), id);
      assert.match(sec, new RegExp(`<img src="/video/oomba-${id}-poster\\.jpg" width="1280" height="720" alt="" loading="lazy"`), id);
    }
    assert.doesNotMatch(sec, /autoplay/);
    assert.doesNotMatch(sec, /oomba-hub\./, 'the two-minute overview is the homepage\'s, not one of the minute-each videos');
    assert.match(sec, /Virtual Math Manipulatives/);
    assert.match(sec, /Oomba Figures/);
    assert.match(sec, /Classroom Dashboard/);
    // Billing is off in the tests (no plan, no price on the note).
    // The dashboard is free for every class (routes/dash.js); the note says so and keeps the others with the testers.
    // On /teachers the new-tools section above the videos says who can use them, so the videos leave their note out.
    if (path === '/') assert.match(sec, /The Classroom Dashboard is free for every class\. The other three tools are being tried out in a few classrooms now\./);
    else {
      assert.doesNotMatch(sec, /pv-plan/);
      assert.match(page.text, /<p class="lp-small lp-center tt-note">The Classroom Dashboard comes with every class\. The Hub, the Manipulatives and their live rooms, Figures and Ask Oomba are available with the Teacher plan\.<\/p>/);
    }
    assert.doesNotMatch(sec, /Teacher plan/);
    assert.doesNotMatch(sec, /\$\d/);
    assert.doesNotMatch(sec, /\u2014/);
    // Never a link into the tools. "/": the page's own sign-up under the videos; /teachers keeps its buttons in the hero
    // and the start panel (one fewer button: docs/decisions.md "Teachers and Parents pages: lead with the new tools").
    assert.doesNotMatch(sec, /href="\/(manipulatives|figures|dashboard|class\/)/);
    if (path === '/') assert.match(sec, /href="\/signup\?trial=1"/);
    else assert.doesNotMatch(sec, /pv-cta/);
  });
}

test('/: the Hub\'s promo and overview first, then the same four videos in the homepage\'s own player (posters, captions, no autoplay), and no link into the tools', async () => {
  const page = await get('/');
  const sec = page.text.slice(page.text.indexOf('id="videos"'), page.text.indexOf('</section>', page.text.indexOf('id="videos"')));
  assert.deepEqual([...sec.matchAll(/class="lp-vid[^"]*" href="\/video\/oomba-([a-z-]+)\.mp4"/g)].map(m => m[1]), [...OVERVIEWS, ...ALL]);
  assert.match(sec, /<b>The Hub in 60 seconds<\/b>/);
  assert.match(sec, /<b>The Hub in 2 minutes<\/b>/);
  for (const id of [...OVERVIEWS, ...ALL]) assert.match(sec, new RegExp(`href="/video/oomba-${id}\\.mp4" data-video="/video/oomba-${id}\\.mp4" data-poster="/video/oomba-${id}-poster\\.jpg" data-vtt="/video/oomba-${id}\\.en\\.vtt"`), id);
  assert.match(sec, /<video class="lp-vd-v" controls playsinline muted preload="none"/);
  assert.doesNotMatch(sec, /autoplay|\$\d|\u2014/);
  assert.doesNotMatch(sec, /href="\/(manipulatives|figures|dashboard|class\/)/);
});

test('in another language: translated words, English captions', async () => {
  const sec = (await get('/es/teachers')).text.match(/id="see-it"[\s\S]*?<\/section>/)[0];
  assert.match(sec, /Manipulativos matemáticos virtuales/);
  assert.match(sec, /Panel de clase/);
  assert.match(sec, /data-vtt="\/video\/oomba-manipulatives\.en\.vtt"/, 'English captions');
  const gb = (await get('/en-GB/teachers'));
  if (gb.status === 200) { assert.match(gb.text, /Virtual Maths Manipulatives/); assert.match(gb.text, /maths tools for your whole class day/); }
});

test('the files are served with the right types', async () => {
  for (const id of ALL) {
    const [mp4, poster, vtt] = videoFiles(id).map(f => `/video/${f}`);
    assert.match((await get(mp4)).type, /^video\/mp4/);
    assert.match((await get(poster)).type, /^image\/jpeg/);
    const v = await get(vtt);
    assert.equal(v.status, 200);
    assert.match(v.text, /^WEBVTT/);
  }
});
