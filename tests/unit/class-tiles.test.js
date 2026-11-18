// The class page on phones (docs/decisions.md "Action tiles on the class page, on phones"): a 2×2 grid of tiles under the
// class header (Host a live game, Class dashboard, Build new game, Find Oomba games), shown only where today's buttons
// show; the Games tab leads to the assigned games; the Assigned and Find chips leave the chip row on phones; the
// Google Classroom button moves into the Assigned card's head on phones. Phones vs wider screens is CSS only, so the
// tests check the markup and that the stylesheets hide and show the right things below 640px.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'fake-test-secret';
process.env.GOOGLE_CLASSROOM = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const get = async (who, path) => (await fetch(base + path, { headers: { cookie: cookieFor(who.id) }, redirect: 'manual' })).text();

const boss = createUser({ username: 'TilesBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Tile Hill Primary' }).school;
const head = S.createSchoolAccount(boss, school.id, { rosterName: 'Mrs Head', role: 'admin' }).user;
const teacher = S.createSchoolAccount(head, school.id, { rosterName: 'Ms Tile', role: 'teacher' }).user;
const c = S.createClass(teacher, school.id, { name: '4b math', grade: '4' }).class;

const tilesOf = text => { const m = text.match(/<div class="classtiles[^"]*">([\s\S]*?)<\/div>/); return m ? [...m[1].matchAll(/<a class="classtile([^"]*)" href="([^"]*)">[\s\S]*?<span class="classtile-l">([^<]*)<\/span><\/a>/g)].map(x => ({ hot: x[1].includes('is-hot'), href: x[2].replace(/&amp;/g, '&'), label: x[3] })) : []; };

test('class page: four tiles with the same links as the buttons they stand in for, Host a live game first', async () => {
  const text = await get(teacher, `/class/${c.id}`);
  const tiles = tilesOf(text);
  assert.deepEqual(tiles.map(x => x.href), [`/live?class=${c.id}`, `/class/${c.id}/dashboard`, `/build/new?for=class&class=${c.id}`, '/learn']);
  assert.deepEqual(tiles.map(x => x.label), ['Host a live game', 'Class dashboard', 'Build new game', 'Find Oomba games']);
  assert.deepEqual(tiles.map(x => x.hot), [true, false, false, false], 'only Host a live game is the green one');
  // The buttons and chip they replace on phones are still in the page (wider screens show them).
  assert.match(text, /id="class-dash-link"/); assert.match(text, /href="\/live\?class=/); assert.match(text, /id="cl-newgame"/);
  // The tiles sit above the tabs.
  assert.ok(text.indexOf('class="classtiles') < text.indexOf('classtabs'), 'tiles before the tabs');
});

test('the Games tab leads to the assigned games; Assigned and Find are in the chip row phones hide', async () => {
  const text = await get(teacher, `/class/${c.id}?tab=students`);
  assert.match(text, new RegExp(`<nav class="tabs classtabs"[^>]*><a href="/class/${c.id}\\?view=assigned"`), 'Games tab -> ?view=assigned');
  const games = await get(teacher, `/class/${c.id}?view=assigned`);
  assert.match(games, /<div class="shelf shelf-class" data-shelf/);
  const top = games.match(/<ul class="shelf-group shelf-cltop">([\s\S]*?)<\/ul>/);
  assert.ok(top, 'the class shelf marks its first group');
  assert.match(top[1], /data-shelf-key="assigned"/); assert.match(top[1], /href="\/learn"/);
  assert.match(games, /<h2 id="shelf-h"[^>]*>Assigned to 4b math<\/h2>/, '?view=assigned opens the assigned games');
  // Build's shelf is untouched.
  assert.doesNotMatch(await get(teacher, '/build'), /shelf-class|shelf-cltop/);
});

test('Google Classroom: in the sidebar foot and, for phones, in the Assigned card head', async () => {
  const text = await get(teacher, `/class/${c.id}?view=assigned`);
  assert.match(text, /<div class="shelf-foot"><a class="btn" href="\/class\/[^"]+\/google-classroom"/);
  assert.match(text, /<div class="shelf-tools shelf-phone-tools"><a class="btn" href="\/class\/[^"]+\/google-classroom"/);
  // The fragment the sidebar swaps in (public/js/shelf.js) has it too.
  const r = await fetch(`${base}/class/${c.id}?view=assigned`, { headers: { cookie: cookieFor(teacher.id), 'X-Shelf': '1' } });
  assert.match((await r.json()).html, /shelf-phone-tools/);
});

test('tiles follow the buttons: an archived class keeps only what it shows today; other class pages have them too', async () => {
  const text = await get(teacher, `/class/${c.id}/progress`);
  assert.equal(tilesOf(text).length, 4, 'the Progress page has the tiles as well');
  const old = S.createClass(teacher, school.id, { name: 'Old class' }).class;
  S.archiveClass(teacher, old.id);
  const arch = await get(teacher, `/class/${old.id}`);
  assert.equal(tilesOf(arch).length, 0, 'archived: no Host live, no dashboard, no Build or Find');
  assert.doesNotMatch(arch, /class="classtiles/);
});

test('CSS: tiles only below 640px; there the header buttons, the Build button, the Assigned and Find chips and the sidebar foot hide', () => {
  const sc = fs.readFileSync(new URL('../../public/css/schools.css', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../../public/css/app.css', import.meta.url), 'utf8');
  assert.match(sc, /\n\.classtiles\{display:none\}/);
  const phone = css => [...css.matchAll(/@media \(max-width:639px\)\{([\s\S]*?)\n\}/g)].map(m => m[1]).join('\n');
  assert.match(phone(sc), /\.classtiles\{display:grid/);
  assert.match(phone(sc), /\.classhead \.classacts>\.btn\{display:none\}/);
  assert.match(phone(sc), /\.classhead \.cx-chip\{min-height:44px/);
  assert.match(phone(sc), /\.classtile:focus-visible\{outline/);
  assert.match(phone(app), /\.shelf-class \.shelf-go,\.shelf-class \.shelf-group\.shelf-cltop,\.shelf-class \.shelf-foot\{display:none\}/);
  assert.match(phone(app), /\.shelf-class \.shelf-nav\{display:block/);
  assert.match(app, /\n\.shelf-phone-tools\{display:none\}/);
});
