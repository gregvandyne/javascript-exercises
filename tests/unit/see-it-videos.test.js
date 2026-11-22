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

const THREE = ['manipulatives', 'figures', 'room'];

test('the three videos, their posters and captions are in public/video and ready', () => {
  for (const id of THREE) {
    for (const f of videoFiles(id)) assert.ok(fs.existsSync(new URL(`../../public/video/${f}`, import.meta.url)), f);
    const vtt = fs.readFileSync(new URL(`../../public/video/oomba-${id}.en.vtt`, import.meta.url), 'utf8');
    assert.match(vtt, /^WEBVTT\n/, `${id}: a WebVTT file`);
    assert.doesNotMatch(vtt, /—/, `${id}: no em dashes in the captions`);
  }
  assert.deepEqual(readyVideos().map(v => v.id), THREE);
  // A listed video without its files is left out, never an empty player.
  assert.ok(VIDEOS.every(v => readyVideos().includes(v) || !videoFiles(v.id).every(f => fs.existsSync(new URL(`../../public/video/${f}`, import.meta.url)))));
});

for (const path of ['/', '/teachers']) {
  test(`${path}: the "See it in action" section with the three videos`, async () => {
    const page = await get(path);
    assert.equal(page.status, 200);
    const sec = (page.text.match(/<section class="lp-sec pv[^"]*" id="see-it"[\s\S]*?<\/section>/) || [])[0];
    assert.ok(sec, 'the section is on the page');
    assert.match(sec, /<h2 id="see-it-h">The new teaching tools, a minute each<\/h2>/);
    assert.match(sec, /<ul class="pv-grid" data-n="3">/);
    assert.equal((sec.match(/<video /g) || []).length, 3);
    for (const id of THREE) {
      assert.match(sec, new RegExp(`<video class="pv-video" controls muted playsinline preload="none" width="1280" height="720" poster="/video/oomba-${id}-poster\\.jpg" aria-labelledby="pv-${id}-h" aria-describedby="pv-${id}-p">`));
      assert.match(sec, new RegExp(`<source src="/video/oomba-${id}\\.mp4" type="video/mp4">`));
      assert.match(sec, new RegExp(`<track kind="captions" src="/video/oomba-${id}\\.en\\.vtt" srclang="en" label="English">`));
      assert.match(sec, new RegExp(`id="pv-${id}-h"`));
    }
    assert.doesNotMatch(sec, /autoplay/);
    assert.match(sec, /Virtual Math Manipulatives/);
    assert.match(sec, /Oomba Figures/);
    // Billing is off in the tests: the tools are with the testers only, and the note says so (no plan, no price).
    assert.match(sec, /These tools are being tried out in a few classrooms now\./);
    assert.doesNotMatch(sec, /\$\d/);
    assert.doesNotMatch(sec, /—/);
    // The page's own sign-up, never a link into the tools.
    assert.doesNotMatch(sec, /href="\/(manipulatives|figures)/);
    assert.match(sec, path === '/' ? /href="\/signup\?trial=1"/ : /href="#start"/);
  });
}

test('in another language: translated words, English captions', async () => {
  const sec = (await get('/es/teachers')).text.match(/id="see-it"[\s\S]*?<\/section>/)[0];
  assert.match(sec, /Manipulativos matemáticos virtuales/);
  assert.match(sec, /srclang="en"/);
  const gb = (await get('/en-GB/teachers'));
  if (gb.status === 200) assert.match(gb.text, /Virtual Maths Manipulatives/);
});

test('the files are served with the right types', async () => {
  for (const id of THREE) {
    const [mp4, poster, vtt] = videoFiles(id).map(f => `/video/${f}`);
    assert.match((await get(mp4)).type, /^video\/mp4/);
    assert.match((await get(poster)).type, /^image\/jpeg/);
    const v = await get(vtt);
    assert.equal(v.status, 200);
    assert.match(v.text, /^WEBVTT/);
  }
});
