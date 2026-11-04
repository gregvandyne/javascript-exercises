// Accessibility regressions for the course surfaces (the 2026-11-04 WCAG 2.2 AA pass,
// docs: goals report course-accessibility-pass.md). Structural assertions on the rendered pages and the
// shared CSS/JS, in the same style as theme.test.js and cs-quest-pages.test.js:
//  - the slide deck is a labelled region (axe: aria-prohibited-attr on a bare labelled div)
//  - each check fieldset names its live feedback paragraph via aria-describedby
//  - the play page's bar is a <header> landmark, the game title is the page <h1>, the turn-your-device
//    hint is a labelled dialog, and play.js puts the game frame AFTER the fullscreen back link so the
//    link is the first Tab stop in fullscreen
//  - teacher-page status emoji are decorative (aria-hidden) next to their words
//  - the shared CSS keeps the 44px targets, the prose-link underline and the on-image focus rings
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const getAs = async (who, path) => { const r = await fetch(base + path, { headers: { ...H, cookie: cookieFor(who.id) }, redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
const C = await import('../../server/services/courses.js');

let n = 0;
const newKid = () => auth.createUser({ username: `a11ykid${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });

test('step page: the deck is a labelled region and every check fieldset describes its feedback', async () => {
  const kid = newKid();
  C.setBand(kid, C.getCourse('cs-quest'), '1b');
  // The intro step: the first page every learner sees, with a deck and a check (1.1 itself is locked behind it).
  const page = await getAs(kid, '/courses/cs-quest/1b-0.1');
  assert.equal(page.status, 200);
  assert.match(page.text, /<div class="deck" id="deck"[^>]*role="region"[^>]*aria-roledescription="carousel"/, 'deck is a carousel region');
  const described = [...page.text.matchAll(/<fieldset class="qq"[^>]*aria-describedby="(q-\d+-fb)"/g)].map(m => m[1]);
  assert.ok(described.length >= 1, 'check fieldsets carry aria-describedby');
  for (const id of described) assert.ok(page.text.includes(`<p class="qq-fb" id="${id}" role="status"`), `feedback paragraph #${id} exists and is the live region`);
});

test('play page: header landmark, h1 title, labelled orient dialog', async () => {
  const owner = auth.createUser({ username: `a11yplay${Date.now() % 1e6}x${++n}`, password: 'secret123' });
  const g = games.createGame(owner.id, { title: 'A11y Play' });
  const v = games.addVersion(g.id, '<div>hi</div>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET visibility='public', status='published', published_version_id=? WHERE id=?", v.id, g.id);
  const r = await fetch(`${base}/play/${games.getGame(g.id).slug}`);
  const body = await r.text();
  assert.equal(r.status, 200);
  assert.match(body, /<header class="playbar">/, 'the play bar is a header landmark');
  assert.match(body, /<h1 class="ptitle">/, 'the game title is the page h1');
  assert.match(body, /id="orient" role="dialog" aria-labelledby="orient-h" aria-describedby="orient-p"/, 'the orient hint is a labelled dialog');
  assert.match(body, /<h2 id="orient-h">/, 'the dialog heading carries the label id');
  assert.match(body, /<p id="orient-p">/, 'the dialog text carries the description id');
});

test('play.js: the game frame is inserted after the fullscreen back link (first Tab stop in fullscreen)', () => {
  const js = readFileSync(new URL('../../public/js/play.js', import.meta.url), 'utf8');
  assert.ok(js.includes('fsb.after(frame)'), 'frame follows .fsback in DOM order');
  assert.ok(js.includes("orientOk.focus()"), 'the orient dialog takes focus when it is shown');
});

test('teacher program page: status emoji are hidden from assistive tech, their words remain', async () => {
  const S = await import('../../server/services/schools.js');
  const boss = auth.createUser({ username: `a11yboss${Date.now() % 1e6}x${++n}`, password: 'secret123', role: 'admin' });
  const oak = S.createSchool(boss, { name: 'A11y Pages' }).school;
  const ana = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
  const p = await getAs(ana, '/teach/cs-quest?band=1B');
  assert.equal(p.status, 200);
  assert.match(p.text, /<span aria-hidden="true">(✅|⚠️|ℹ️|🟢|🟡)<\/span>/, 'checklist/builder status icons are aria-hidden');
  assert.ok(p.text.includes('Before you start'), 'the words the icons decorate are still there');
});

test('shared CSS: 44px targets, prose-link underlines, on-image and programmatic focus rings', () => {
  const css = readFileSync(new URL('../../public/css/app.css', import.meta.url), 'utf8');
  const csq = readFileSync(new URL('../../public/css/cs-quest.css', import.meta.url), 'utf8');
  assert.match(css, /\.btn-sm\{min-height:44px/, 'small buttons are 44px targets');
  assert.match(css, /\.seg button,\.seg>a\{min-height:44px/, 'segmented controls are 44px targets');
  assert.match(css, /\.rail-arrows button\{width:44px;height:44px/, 'rail arrows are 44px targets');
  assert.match(css, /\.gf-replay\{[^}]*min-height:44px/, 'the guided-focus Replay button is a 44px target');
  assert.match(csq, /\.csq-lrow \.acts \.btn-sm\{min-height:44px/, 'teacher lesson-row buttons are 44px targets');
  assert.match(css, /main p a:not\(\[class\]\)[^{]*\{[^}]*text-decoration:underline/, 'links in prose are underlined, not colour-only');
  assert.match(css, /\.stage:fullscreen \.fsback:focus-visible\{outline:3px solid var\(--brand-spark\)/, 'the fullscreen back link gets a Spark ring (Ink on Ink would vanish)');
  assert.match(css, /\.gf-replay:focus-visible\{outline:3px solid var\(--brand-spark\)/, 'Replay gets a Spark ring over slide images');
  assert.match(css, /\.slide-h:focus-visible,\.qq legend:focus-visible\{outline:3px solid var\(--focus\)/, 'programmatic focus landings (slide heading, question legend) show a ring');
  assert.match(css, /\.course-page>\.back,\.cl-page>\.back\{[^}]*min-height:44px/, 'course Back links are 44px targets');
});
