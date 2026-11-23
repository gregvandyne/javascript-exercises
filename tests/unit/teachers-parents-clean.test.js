// /teachers and /parents after the owner's cleanup (docs/decisions.md "Teachers and Parents pages: lead with the new
// tools, no 'always free'"): no raw emoji in the page (icons are the site's own, ico()); no floating "For teachers" or
// "Games by subject" headings, no "Play to learn" game list, no kicker pill; the new tools (Manipulatives with Oomba, live
// manipulatives, the Classroom Dashboard) right under the hero, with real screenshots and alt text, and the Manipulatives
// in the hero picture; two teaching-loop screens (the gradebook and the feedback); and no "free" claims in the hero.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const fake = await startFakeStripe({ webhookSecret: 'whsec_fake_clean', apiKey: 'rk_test_fake' });
Object.assign(process.env, { STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake_clean', STRIPE_API_BASE: fake.url, BILLING_PUBLIC: '1' });
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { EMOJI_RE, textIcons } = await import('../../server/views/icon.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
const get = async path => (await fetch(base + path, { headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' } })).text();
/** The page's own content: <main>, without its JSON data blocks. ico() draws an svg or img, never an emoji character. */
const mainOf = s => s.slice(s.indexOf('<main'), s.indexOf('</main>')).replace(/<script[\s\S]*?<\/script>/g, '');
const emojiIn = s => [...s.split(/<[^>]*>/).join(' ').matchAll(new RegExp(EMOJI_RE.source, 'gu'))].map(m => m[0]);
const heroOf = s => /<section class="lp-hero[\s\S]*?<\/section>/.exec(s)[0];

test('no raw emoji in the content of /teachers and /parents (in English and in a translation)', async () => {
  for (const path of ['/teachers', '/parents', '/es/teachers', '/es/parents', '/ja/parents']) {
    const m = mainOf(await get(path));
    assert.ok(m.length > 1000, path);
    assert.deepEqual(emojiIn(m), [], `${path}: raw emoji in the page`);
    assert.match(m, /<svg class="fx fx-oo"/, `${path}: the site's own icons are there`);
  }
});

test('textIcons: an emoji in text becomes its icon (or goes); tags, attributes and © stay as they are', () => {
  const out = String(textIcons('<p title="🌐">Pick one with the 🌐 button. © 2026 🦔</p>'));
  assert.match(out, /^<p title="🌐">Pick one with the <svg class="fx fx-oo" data-fx="globe-with-meridians"[^>]*>.*<\/svg> button\. © 2026 <\/p>$/);
});

test('/teachers: the removed sections are gone; the new tools lead, with real screens; the Manipulatives are in the hero', async () => {
  const s = await get('/teachers');
  const m = mainOf(s);
  for (const gone of [/Play to learn/, /Games by subject/, /id="play"/, /id="subjects"/, /id="brain-breaks"/, /class="lp-kicker"/, /class="lp-games"/, /<h2[^>]*>For teachers<\/h2>/, /Free to start/, /Always free/, /free website/, /it(?:’|&#39;)s free/, /Get a free school account/, /Set up your school \(free\)/]) {
    assert.doesNotMatch(m, gone, String(gone));
  }
  const hero = heroOf(m);
  assert.match(hero, /srcset="\/img\/how\/tools-board-d-1024\.webp 1024w/, 'the Manipulatives board on the laptop');
  assert.match(hero, /src="\/img\/how\/tools-student-p-390\.webp"/, 'a student\'s live square on the phone');
  assert.match(hero, /<a class="btn btn-primary btn-big" href="\/trial">Start free trial<\/a>/, 'with paid plans on, the Teacher plan trial (it starts at sign-up, no card)');
  assert.match(hero, /<ul class="lp-badges"><li><span>No ads<\/span><\/li>/, 'plain chips, no "Free to start"');
  // Right after the hero: the new tools, three cards, each a real screen with alt text and a line.
  const after = m.slice(m.indexOf(hero) + hero.length).trimStart();
  assert.match(after, /^<section class="lp-sec tt" id="tools"/, 'the tools come straight after the hero');
  const tools = /<section class="lp-sec tt" id="tools"[\s\S]*?<\/section>/.exec(m)[0];
  const shots = [...tools.matchAll(/<img src="\/img\/how\/([\w-]+)-d-1024\.webp"[^>]*alt="([^"]+)"/g)].map(x => [x[1], x[2]]);
  assert.deepEqual(shots.map(x => x[0]), ['tools-board', 'tools-room', 'dash-teacher']);
  assert.ok(shots.every(([, alt]) => alt.length > 40), 'each screen has real alt text');
  assert.match(tools, /Math manipulatives with Oomba[\s\S]*Live manipulatives[\s\S]*Classroom Dashboard/);
  assert.match(tools, /href="#see-it">Watch the one-minute video/, 'a visitor goes to the video');
  assert.match(tools, /part of the Teacher plan/, 'the Manipulatives are not sold as free');
  assert.doesNotMatch(tools, /\bfree\b/i);
  // The teaching loop: two screens side by side, the gradebook and the written feedback.
  const loop = /<section class="tl tl-page[\s\S]*?<\/section>/.exec(m)[0];
  assert.deepEqual([...loop.matchAll(/teach-loop\/(\w+)\.webp/g)].map(x => x[1]), ['gradebook', 'feedback']);
});

test('/teachers, school staff: each tool card opens the real page', async () => {
  const auth = await import('../../server/auth.js');
  const S = await import('../../server/services/schools.js');
  const boss = auth.createUser({ username: 'CleanBoss', password: 'secret123', role: 'admin' });
  const sc = S.createSchool(boss, { name: 'Clean Demo School' }).school;
  const tch = auth.createUser({ username: 'CleanTeacher', password: 'secret123' });
  S.addMember(boss, sc.id, tch.id, 'teacher', { rosterName: 'Ms. Demo' });
  let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, tch.id);
  const s = await (await fetch(`${base}/teachers`, { headers: { accept: 'text/html', cookie: c } })).text();
  const tools = /<section class="lp-sec tt" id="tools"[\s\S]*?<\/section>/.exec(s)[0];
  assert.deepEqual([...tools.matchAll(/<p class="tt-link"><a href="([^"]+)"/g)].map(x => x[1]), ['/manipulatives', '/manipulatives', '/teach']);
});

test('/parents: no kicker, no game list, no "Pick by subject", no "free" in the hero or the title; four panels, none alone', async () => {
  const s = await get('/parents');
  const m = mainOf(s);
  for (const gone of [/class="lp-kicker"/, /id="play"/, /id="subjects"/, /class="lp-games"/, /Pick by subject/, /Free to play/, /start free<\/a>/i, /— free/]) assert.doesNotMatch(m, gone, String(gone));
  assert.doesNotMatch(heroOf(m), /\bfree\b/i, 'no "free" in the hero');
  assert.doesNotMatch(/<title>([^<]*)<\/title>/.exec(s)[1], /free/i);
  const cols = /<div class="lp-cols">([\s\S]*?)<\/div>\s*<section class="panel" id="private"/.exec(m)[1];
  assert.deepEqual([...cols.matchAll(/<section class="panel" id="(\w+)"/g)].map(x => x[1]), ['make', 'home', 'ages', 'guides']);
});
