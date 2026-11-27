// The teacher landing page at "/" (server/routes/landing.js, docs/decisions.md "Teacher landing page"): what a visitor
// with no session (and a search engine) gets at "/", what everyone with a session still gets, "Just Play" (/learn), the
// search tags, the structured data, the sitemap, the click counts, the honesty rules (no prices on "/", no ratings,
// reviews or testimonials), and the page itself (docs/decisions.md "Homepage: the one classroom tool for everything"):
// its sections in order, the screenshots, the Teacher plan lines, the tour and the videos as sent, before any script.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.LANDING_AT_ROOT = '1';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q, today } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const F = await import('../../server/services/family.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/routes/landing.js');
const { availableCodes, CODES } = await import('../../server/i18n/index.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => { process.env.LANDING_AT_ROOT = '1'; resetLimits(); });

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(u, path, { ua = CHROME, method = 'GET', headers = {} } = {}) {
  const h = { accept: 'text/html', ...headers }; if (u) h.cookie = cookieFor(u.id); if (ua) h['user-agent'] = ua;
  const r = await fetch(base + path, { method, headers: h, redirect: 'manual' });
  return { status: r.status, text: await r.text(), location: r.headers.get('location'), headers: r.headers };
}
const isLanding = s => /<h1 id="lp-h1" class="lp-h1"/.test(s) && /\/css\/landing\.css/.test(s);
const ldOf = s => [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const nodes = s => ldOf(s).flatMap(d => d['@graph'] || [d]);
const clicks = step => (q.get('SELECT SUM(n) n FROM funnel_counts WHERE day=? AND step=?', today(), step) || {}).n || 0;

let n = 0;
const kid = () => auth.createUser({ username: `LandKid${++n}`, password: 'rainbow-77' });
const grownup = () => { const u = auth.createUser({ username: `LandParent${++n}`, password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(u); return auth.getUser(u.id); };
const boss = auth.createUser({ username: 'LandBoss', password: 'a-long-password-1' });
q.run("UPDATE users SET role='admin' WHERE id=?", boss.id);
const school = S.createSchool(auth.getUser(boss.id), { name: 'Landing Test School' }).school;
const inSchool = role => { const u = kid(); assert.ok(S.addMember(auth.getUser(boss.id), school.id, u.id, role).ok); return auth.getUser(u.id); };

test('no session (a first visit or a search engine): "/" is the teacher landing page, indexable, one h1', async () => {
  for (const ua of [CHROME, GOOGLEBOT]) {
    const r = await call(null, '/', { ua });
    assert.equal(r.status, 200);
    assert.ok(isLanding(r.text), ua);
    assert.equal(r.text.match(/<h1\b/g).length, 1, 'one h1');
    assert.doesNotMatch(r.text, /lp-floats?\b|lp-bob/, 'no game covers floating round the hero (too distracting)');
    assert.match(r.text, /<h1 id="lp-h1" class="lp-h1">The one classroom tool for everything\.<\/h1>/);
    assert.match(r.text, /<meta name="robots" content="index, follow, max-image-preview:large">/);
    assert.match(r.text, new RegExp(`<link rel="canonical" href="${base}/">`));
    assert.match(r.text, /<title>Oomba Academy: the one classroom tool for everything<\/title>/);
    assert.match(r.text, /<meta name="description" content="Live games, math manipulatives, worksheets, picture books, a class dashboard and an AI helper [^"]{40,}">/);
    assert.match(r.text, /<meta property="og:image" content="[^"]+\/og\/landing\.jpg">/);
    assert.match(r.text, /<meta name="twitter:card" content="summary_large_image">/);
    for (const lm of ['<header class="lp-bar"', '<main id="lp-main">', '<footer class="lp-foot">', '<nav class="lp-nav"']) assert.ok(r.text.includes(lm), lm);
    assert.doesNotMatch(r.text, /class="topbar"|class="tabbar"|\/css\/app\.css/, 'its own header and footer, not the app shell');
  }
});

test('the top bar: the sections and Start free trial; every trial button asks who\'s signing up; Just Play in the menu and the footer', async () => {
  const s = (await call(null, '/')).text;
  const bar = /<header class="lp-bar"[\s\S]*?<\/header>/.exec(s)[0];
  assert.equal(L.JUST_PLAY_URL, '/learn', 'Just Play opens Learn (every game; /play answers 301 there)');
  assert.equal(L.TRIAL_URL, '/signup?trial=1');
  assert.deepEqual([.../<nav class="lp-nav"[\s\S]*?<\/nav>/.exec(bar)[0].matchAll(/href="([^"]+)"/g)].map(m => m[1]), ['#hub', '#tools', '#ask', '#tour', '#videos', '/compare']);
  // The link has a name of its own: on a phone only its short, aria-hidden words show.
  assert.match(bar, /<a class="lp-btn lp-btn-primary lp-btn-sm" href="\/signup\?trial=1" data-cta="trial" aria-label="Start free trial"><span class="lp-long">Start free trial<\/span>/);
  assert.match(bar, /<nav class="lp-menu-panel"[\s\S]*href="\/learn" data-cta="play">Just Play/, 'Just Play for kids, in the menu');
  const trials = [...s.matchAll(/<a [^>]*data-cta="trial"[^>]*>/g)].map(m => /href="([^"]+)"/.exec(m[0])[1]);
  assert.ok(trials.length >= 4); assert.ok(trials.every(h => h === '/signup?trial=1'), trials.join());
  assert.match(s, /href="\/plans" data-cta="pricing"/);
  assert.match(s, /No card needed[\s\S]*Cancel anytime[\s\S]*Unlimited students/, 'the trust line');
  assert.match(s, /href="mailto:Greg@oomba\.ai\?subject=/, 'schools: talk to us');
  assert.match(s, /<section class="lp-play" id="play"[\s\S]*?href="\/learn"/, 'old "/#play" links land on a way to the games');
  for (const p of ['/teachers', '/parents', '/learn', '/privacy', '/terms', '/compare']) assert.ok(s.includes(`href="${p}"`), `links ${p}`);
});

test('under the questions: a box each for /parents and /teachers, in their own words, the whole box a link', async () => {
  const s = (await call(null, '/')).text;
  const faq = /<section class="lp-sec lp-alt" id="faq"[\s\S]*?<\/section>/.exec(s)[0];
  const doors = [...faq.matchAll(/<a class="lp-card lp-door" href="([^"]+)">([\s\S]*?)<\/a>/g)];
  assert.deepEqual(doors.map(m => m[1]), ['/parents', '/teachers']);
  assert.match(doors[0][2], /For parents[\s\S]*<h3>Fun learning games for kids 5–14, safe by design<\/h3>[\s\S]*No chat with strangers/);
  assert.match(doors[1][2], /For teachers[\s\S]*<h3>Fun, interactive lessons your class will ask for<\/h3>[\s\S]*Sign in with Google/);
  assert.ok(faq.indexOf('lp-faq') < faq.indexOf('lp-doors'), 'after the questions');
});

test('the game pages (Learn and search), signed out: every link (Learn is the indexed hub grown-ups find too), no Play now; elsewhere Play now goes straight to Learn\'s games', async () => {
  const bar = h => /<header class="topbar">[\s\S]*?<\/header>/.exec(h)[0];
  for (const p of ['/learn', '/search']) {
    const b = bar((await call(null, p)).text);
    assert.deepEqual([...b.matchAll(/class="navlink" href="([^"]+)"/g)].map(m => m[1]), ['/learn', '/read', '/build', '/parents', '/teachers'], p);
    assert.match(b, /class="me-btn" href="\/login"/, p);
    assert.doesNotMatch(b, /playnow/, p);
  }
  for (const p of ['/read', '/safety']) {
    const b = bar((await call(null, p)).text);
    assert.match(b, /class="navlink" href="\/teachers"/, `${p}: every link`);
    assert.match(b, /class="btn btn-hot playnow" href="\/learn#play"/, `${p}: Play now goes to Learn's games, not through the landing`);
  }
  assert.match(bar((await call(null, '/es/teachers')).text), /class="btn btn-hot playnow" href="\/es\/learn#play"/, 'in the page\'s language');
});

test('honest page: no prices on "/" (LANDING_SHOW_PRICE off), no ratings, reviews, testimonials or user counts', async () => {
  assert.equal(L.LANDING_SHOW_PRICE, false);
  const s = (await call(null, '/')).text;
  assert.doesNotMatch(s, /\$\d|€\d|£\d|\d+\s*(?:USD|dollars)/i, 'no amounts: kids may open "/" too, prices live on /plans');
  assert.doesNotMatch(s, /aggregateRating|ratingValue|reviewCount|"@type":"Review"|itemprop="review"|★|☆|testimonial|trusted by|\d[\d,.]*\+?\s*(?:teachers|schools|students) (?:use|love|trust)/i);
  assert.match(s, /Pay for one plan instead of five\. <a href="\/compare">See how we compare<\/a>/, 'no cost line: a link to /compare');
  assert.match(s, /Plans are on the <a href="\/plans">Plans page<\/a>/);
  const app = nodes(s).find(x => x['@type'] === 'SoftwareApplication');
  assert.ok(app); assert.equal(app.offers, undefined, 'no price in the structured data either');
  assert.equal(app.aggregateRating, undefined);
});

test('structured data: one valid JSON-LD graph with the organization, site, page, app and the FAQ shown on the page', async () => {
  const s = (await call(null, '/')).text;
  const all = nodes(s);
  for (const t of ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage']) assert.ok(all.some(x => x['@type'] === t), t);
  const faq = all.find(x => x['@type'] === 'FAQPage').mainEntity;
  assert.equal(faq.length, 9);
  for (const qa of faq) {
    assert.ok(s.includes(`<h3>${qa.name.replace(/'/g, '&#39;')}</h3>`), `the question is on the page: ${qa.name}`);
    assert.ok(qa.acceptedAnswer.text.length > 30);
  }
  assert.match(all.find(x => x['@type'] === 'SoftwareApplication').audience[0].educationalRole, /teacher/);
});

test('every language: hreflang for all 13, /es is the Spanish landing (its own canonical), RTL for Arabic and Hebrew', async () => {
  const s = (await call(null, '/')).text;
  const langs = [...s.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(m => [m[1], m[2].replace(base, '')]);
  const want = CODES.filter(c => c !== 'en-GB' && availableCodes().includes(c));
  for (const c of want) assert.ok(langs.some(([h, p]) => h === c && p === (c === 'en' ? '/' : `/${c.toLowerCase()}`)), c);
  assert.ok(langs.some(([h, p]) => h === 'x-default' && p === '/'));
  const es = await call(null, '/es', { ua: GOOGLEBOT });
  assert.ok(isLanding(es.text));
  assert.match(es.text, /<html lang="es" dir="ltr"/);
  assert.match(es.text, /<h1 id="lp-h1" class="lp-h1">La única herramienta de clase para todo\.<\/h1>/);
  assert.match(es.text, new RegExp(`<link rel="canonical" href="${base}/es">`));
  // Nothing left in English but names: the products, the manipulatives' names, the videos' titles, the quotes from the
  // other products' own websites and their addresses.
  const rest = es.text.replace(/<(li|h3|span|q|a)\b[^>]*lang="en" dir="ltr"[^>]*>[^<]*<\/\1>/g, '').replace(/<h2 id="lp-vd-h" class="lp-vd-h" lang="en" dir="ltr"><\/h2>/, '');
  assert.doesNotMatch(rest, / lang="en" dir="ltr"/, 'every sentence is in Spanish');
  for (const c of ['ar', 'he']) assert.match((await call(null, `/${c}`)).text, new RegExp(`<html lang="${c}" dir="rtl"`));
});

test('everyone with a session keeps the home page they have today: kids, students, teachers, grown-ups, guests', async () => {
  for (const [who, u] of [['kid', kid()], ['student', inSchool('student')], ['teacher', inSchool('teacher')], ['grown-up', grownup()], ['guest', auth.createGuest()]]) {
    const on = await call(u, '/');
    process.env.LANDING_AT_ROOT = '0';
    const off = await call(u, '/');
    process.env.LANDING_AT_ROOT = '1';
    assert.ok(!isLanding(on.text), who);
    assert.equal(on.status, off.status, who);
    assert.equal(on.location, off.location, who);
    assert.equal(on.text.match(/<h1\b[^>]*>/)?.[0], off.text.match(/<h1\b[^>]*>/)?.[0], `${who}: the same page`);
  }
  assert.match((await call(auth.createGuest(), '/')).text, /class="doors"/, 'a guest still gets the doors');
});

test('Just Play: /learn is the games (by topic, no doors: the landing is the front door); /play answers 301 there; "/" without the switch is unchanged', async () => {
  const p = await call(null, '/learn');
  assert.equal(p.status, 200);
  assert.ok(!isLanding(p.text));
  assert.doesNotMatch(p.text, /class="doors"/, 'Learn has no doors: "/" is the front door'); assert.match(p.text, /<div id="play" class="learn-games-wrap">/); assert.match(p.text, /class="rail/);
  const old = await call(null, '/play?x=1');
  assert.equal(old.status, 301); assert.equal(old.headers.get('location'), '/learn?x=1');
  assert.equal((await call(kid(), '/play')).headers.get('location'), '/learn', 'a kid with an account too');
  assert.equal((await call(kid(), '/learn')).status, 200);
  assert.equal((await call(null, '/play/sum-racer')).status, 200, 'game pages under /play/ are untouched');
  process.env.LANDING_AT_ROOT = '0';
  const root = await call(null, '/');
  assert.ok(!isLanding(root.text)); assert.match(root.text, /class="doors"/);
});

test('sitemap: "/" lists the landing in every language with its share picture', async () => {
  const x = (await call(null, '/sitemap.xml')).text;
  const root = x.split('<url>').find(u => u.startsWith(`<loc>${base}/</loc>`));
  assert.ok(root);
  assert.match(root, /<image:loc>[^<]+\/og\/landing\.jpg<\/image:loc>/);
  assert.ok((root.match(/hreflang=/g) || []).length >= 13, 'every language and x-default');
  assert.match(x, new RegExp(`<loc>${base}/ja</loc>`));
});

test('clicks are counted by the page\'s beacon: daily totals, people on this site only', async () => {
  q.run('DELETE FROM funnel_counts');
  await call(null, '/');
  await call(null, '/', { ua: GOOGLEBOT });
  assert.equal(clicks('landing.view'), 1, 'a person\'s view, not a robot\'s');
  const beacon = (cta, headers = { 'sec-fetch-site': 'same-origin' }, ua) => call(null, `/landing/count/${cta}`, { method: 'POST', headers, ua });
  for (const c of ['trial', 'trial', 'play', 'pricing', 'how']) assert.equal((await beacon(c)).status, 204);
  assert.equal((await beacon('trial', { 'sec-fetch-site': 'cross-site' })).status, 403);
  await beacon('trial', {}); await beacon('trial', undefined, 'curl/8.0'); await beacon('trial', undefined, GOOGLEBOT);
  assert.equal((await beacon('nope')).status, 404);
  assert.equal((await beacon('__proto__')).status, 404);
  assert.deepEqual(['landing.trial', 'landing.play', 'landing.pricing', 'landing.how'].map(clicks), [2, 1, 1, 1]);
});

test('the page works without JavaScript and loads nothing from elsewhere', async () => {
  const s = (await call(null, '/')).text;
  assert.deepEqual([...s.matchAll(/<script\b(?![^>]*application\/ld\+json)[^>]*>/g)].map(m => m[0].replace(/\?v=\w+/, '')), ['<script type="module" src="/js/landing.js">']);
  assert.doesNotMatch(s, /\bsrc="https?:|srcset="https?:|<link rel="(?:stylesheet|preload)" href="https?:/, 'no outside scripts, styles, fonts or pictures');
  for (const m of s.matchAll(/<img\b[^>]*>/g)) {
    assert.match(m[0], /\bwidth="\d+"/, m[0]); assert.match(m[0], /\bheight="\d+"/, m[0]);
    assert.match(m[0], /\balt="/, m[0]);
  }
  const lazy = [...s.matchAll(/<img\b[^>]*>/g)].filter(m => /loading="lazy"/.test(m[0])).length;
  assert.ok(lazy >= 10, 'pictures below the first screen load lazily');
  // The first screen's pictures load at once, the big one first (preloaded, high priority); none of them lazily.
  const hero = s.slice(s.indexOf('<section class="lp-hero'), s.indexOf('</section>', s.indexOf('<section class="lp-hero')));
  assert.doesNotMatch(hero, /loading="lazy"/);
  assert.match(s, /<link rel="preload" as="image" type="image\/webp" href="\/img\/landing\/tool-dash-640\.webp" imagesrcset="[^"]+" imagesizes="[^"]+" fetchpriority="high">/);
  // The tour without script: every step with its picture, words and step number; the buttons are the script's.
  const tour = s.slice(s.indexOf('id="tour"'), s.indexOf('</section>', s.indexOf('id="tour"')));
  assert.equal([...tour.matchAll(/<li class="lp-tstep" data-step="\d"/g)].length, 6);
  assert.equal([...tour.matchAll(/<span class="lp-tipbtns" hidden>/g)].length, 6);
  assert.doesNotMatch(tour, /class="lp-card lp-tour is-on"/);
  // Each video link opens the video file itself without script; the player is a <dialog>.
  for (const m of s.matchAll(/<a class="[^"]*" href="([^"]+)" data-video="([^"]+)"/g)) { assert.equal(m[1], m[2]); assert.match(m[1], /^\/video\/.+\.mp4$/); }
  assert.match(s, /<dialog class="lp-vd" id="lp-vd" aria-labelledby="lp-vd-h">/);
});

test('the page in order: hero, the five named products, in one place, the Hub, Ask Oomba, the tools, side by side, the tour, videos, safety, questions', async () => {
  const s = (await call(null, '/')).text;
  const at = id => s.indexOf(`id="${id}"`);
  const order = ['lp-h1', 'names-h', 'one', 'hub', 'ask', 'tools', 'side-by-side', 'tour', 'videos', 'safety', 'faq', 'final-h'];
  for (const id of order) assert.ok(at(id) > 0, id);
  for (let i = 1; i < order.length; i++) assert.ok(at(order[i - 1]) < at(order[i]), `${order[i - 1]} before ${order[i]}`);
  // The hero is every tool (a collage of real screens), not the Hub; the Hub has its own section after it. The one
  // mention is the play button: the Hub's 60-second video.
  const hero = s.slice(s.indexOf('<main'), at('names-h'));
  const play = (hero.match(/<a class="lp-playbtn"[\s\S]*?<\/a>/) || [''])[0];
  assert.match(play, /The Hub in 60 seconds/);
  assert.doesNotMatch(hero.replace(/<header[\s\S]*?<\/header>/, '').replace(play, ''), /\bHub\b/, 'the first screen does not introduce the Hub');
  for (const n of ['tool-dash', 'tool-manip', 'tool-figures', 'tool-library', 'tool-brain-board']) assert.ok(hero.includes(`/img/landing/${n}-`), n);
  assert.match(hero, /<div class="lp-collage-in" role="img" aria-label="Real screens from Oomba Academy: [^"]+">/);
  assert.match(s, /<h2 id="hub-h">Run it all from the Hub\.<\/h2>/);
  assert.match(s, /<h2 id="tour-h">Try the Hub before you sign up\.<\/h2>/);
  // The numbers come from the code.
  const { TOOLS } = await import('../../public/js/manip-data.js'); const D = await import('../../server/services/dash.js');
  assert.match(hero, new RegExp(`<li><b>${TOOLS.length}</b><span>virtual manipulatives</span></li>`));
  assert.match(hero, new RegExp(`<li><b>${D.WIDGETS.length}</b><span>dashboard widgets</span></li>`));
  // Grammar and proofreading is Mistake Hunt; there is no "highlights" game.
  assert.match(s, /Grammar and proofreading<\/h3><p>Mistake Hunt plants mistakes/);
});

test('the screenshots: every one at 1x and 2x WebP with its size, in the repo, and the Hub\'s in both themes', async () => {
  const fs = await import('node:fs');
  const shots = JSON.parse(fs.readFileSync(new URL('../../public/img/landing/shots.json', import.meta.url), 'utf8'));
  let bytes = 0;
  for (const [name, { w }] of Object.entries(shots)) for (const x of w) {
    const f = new URL(`../../public/img/landing/${name}-${x}.webp`, import.meta.url);
    assert.ok(fs.existsSync(f), `${name}-${x}.webp`); bytes += fs.statSync(f).size;
  }
  assert.ok(bytes < 3_000_000, `all the landing screenshots together are ${bytes} bytes`);
  const s = (await call(null, '/')).text;
  for (const m of s.matchAll(/<img[^>]*src="\/img\/landing\/([a-z-]+)-(\d+)\.webp"[^>]*>/g)) {
    assert.equal(+m[2], shots[m[1]].w[0], m[1]);
    assert.match(m[0], new RegExp(`srcset="/img/landing/${m[1]}-${shots[m[1]].w[0]}\\.webp ${shots[m[1]].w[0]}w, /img/landing/${m[1]}-${shots[m[1]].w[1]}\\.webp ${shots[m[1]].w[1]}w"`));
    assert.match(m[0], new RegExp(`width="${shots[m[1]].w[0]}" height="${shots[m[1]].h}"`));
  }
  // The Hub: the dark capture for the dark theme (picked, or the device's own with nothing picked); light by default.
  assert.match(s, /<source data-scheme="dark" data-media="" media="\(prefers-color-scheme: dark\)"[^>]*srcset="\/img\/landing\/hub-dark-1200\.webp/);
  assert.doesNotMatch(s, /<html[^>]*data-theme=/, 'no theme picked: the device decides, light unless it prefers dark');
  assert.match(s, /<meta name="color-scheme" content="light dark">/);
  assert.match((await call(null, '/', { headers: { cookie: 'theme=dark' } })).text, /<html lang="en" dir="ltr" data-theme="dark"/);
  assert.match((await call(null, '/', { headers: { cookie: 'theme=light' } })).text, /<html lang="en" dir="ltr" data-theme="light"[\s\S]*<a href="\?theme=light" rel="nofollow" aria-current="true">/);
});

test('the Teacher plan: the Hub, Ask Oomba, the tour, the Manipulatives and Figures say so (a link to /plans); nothing else does', async () => {
  const { config } = await import('../../server/config.js');
  const paid = on => { config.stripeApiKey = on ? 'rk_test_fake' : ''; config.stripeWebhookSecret = on ? 'whsec_fake_l' : ''; config.billingPublic = on; };
  try {
    paid(true);
    const s = (await call(null, '/')).text;
    const tags = s.match(/<p class="lp-plan">Available with the <a href="\/plans">Teacher plan<\/a><\/p>/g) || [];
    assert.equal(tags.length, 5, 'the Hub, Ask Oomba, the Manipulatives, Figures and the tour');
    for (const id of ['hub', 'ask', 'tour']) { const sec = s.slice(s.indexOf(`id="${id}"`), s.indexOf('</section>', s.indexOf(`id="${id}"`))); assert.match(sec, /Available with the <a href="\/plans">Teacher plan<\/a>/, id); }
    const tools = s.slice(s.indexOf('id="tools"'), s.indexOf('</section>', s.indexOf('id="tools"')));
    const cards = tools.split('<article').slice(1);
    assert.deepEqual(cards.map(c => /Teacher plan/.test(c)), [true, true, false, false, false, false, false, false, false, false], 'the Manipulatives and Figures only');
    paid(false);
    const off = (await call(null, '/')).text;
    assert.equal((off.match(/<p class="lp-plan">Available with the <a href="\/plans">Teacher plan<\/a><\/p>/g) || []).length, 5, 'with paid plans off too: always the Teacher plan');
    assert.doesNotMatch(off, /Being tried out in a few classrooms now/);
  } finally { paid(false); }
});

test('the tour and the videos as sent: six steps on real screens, each zoomed to its control with a ring, no hotspots, progress; the tool videos and the 18 How it works', async () => {
  const s = (await call(null, '/')).text;
  const tour = s.slice(s.indexOf('id="tour"'), s.indexOf('</section>', s.indexOf('id="tour"')));
  assert.deepEqual([...tour.matchAll(/<button type="button" class="lp-step" data-go="\d"[^>]*><i aria-hidden="true">\d<\/i><span>([^<]+)<\/span>/g)].map(m => m[1]),
    ['Arrange seats', 'Hand out a lesson', 'Watch every desk', 'Answer hands', 'Ask Oomba', 'Finish class']);
  for (const n of ['tour-seats', 'tour-handout', 'tour-watch', 'tour-hands', 'tour-oomba', 'tour-finish']) assert.ok(tour.includes(`/img/landing/${n}-1100.webp`), n);
  // Each step's camera (centre and width in % of the picture) and its one ring; no numbered dots on the picture.
  assert.equal([...tour.matchAll(/<div class="lp-tcam" data-cam="[\d.]+,[\d.]+,[\d.]+" style="--cx:[\d.]+;--cy:[\d.]+;--w:[\d.]+">/g)].length, 6);
  assert.equal([...tour.matchAll(/<span class="lp-ring" style="left:[\d.]+%;top:[\d.]+%;width:[\d.]+%;height:[\d.]+%" aria-hidden="true"><\/span>/g)].length, 6);
  assert.doesNotMatch(tour, /lp-hot|yellow dots/);
  // The tools heading (it was "Wow, it does all of this.").
  assert.match(s, /<h2 id="tools-h">Every tool your class needs\. In one place\.<\/h2>/);
  assert.doesNotMatch(s, /Wow, it does all of this/);
  assert.match(tour, /<p class="lp-sub">Six steps through a class in the Hub\. Press Next\.<\/p>/);
  assert.match(tour, /<h3 tabindex="-1">Ask Oomba<\/h3><p>Ask for today(?:'|&#39;|&#x27;)s plan\. Nothing goes on desks until you tap Use this plan\.<\/p>/);
  assert.match(tour, /role="progressbar" aria-label="The Hub tour" aria-valuemin="1" aria-valuemax="6" aria-valuenow="1"/);
  assert.match(tour, /<p class="sr-only" aria-live="polite" data-tour-live><\/p>/);
  const vids = s.slice(s.indexOf('id="videos"'), s.indexOf('</section>', s.indexOf('id="videos"')));
  assert.equal([...vids.matchAll(/class="lp-vid( lp-vid-big)?" href="\/video\/oomba-[a-z-]+\.mp4"/g)].length, 6);
  assert.match(vids, new RegExp(`class="lp-vid lp-vid-big" href="/video/oomba-${L.HERO_VIDEO}\\.mp4"`), 'the promo first');
  assert.match(vids, /class="lp-vid" href="\/video\/oomba-hub\.mp4"[^>]*data-title="The Hub in 2 minutes"/, 'then the two-minute overview');
  assert.equal([...vids.matchAll(/class="lp-how" href="\/video\/manip\/manip-[a-z-]+\.mp4" data-video="[^"]+" data-poster="\/video\/manip\/manip-[a-z-]+-poster\.jpg" data-vtt="\/video\/manip\/manip-[a-z-]+\.en\.vtt"/g)].length, 18);
  // Six of them show; the rest fold open under "Show all 18 videos".
  const [preview, rest] = vids.split('<details class="lp-howmore">');
  assert.equal([...preview.matchAll(/class="lp-how" href=/g)].length, 6);
  assert.equal([...rest.matchAll(/class="lp-how" href=/g)].length, 12);
  assert.match(rest, /<summary class="lp-btn lp-btn-ghost lp-btn-sm"><span class="lp-howmore-o">Show all 18 videos<\/span><span class="lp-howmore-c">Show fewer<\/span><\/summary>/);
  // The hero's play button: the Hub in 60 seconds (scripts/hub-promo.mjs), with its captions as the player's track.
  assert.equal(L.HERO_VIDEO, 'hub-promo');
  assert.match(s, /<a class="lp-playbtn" href="\/video\/oomba-hub-promo\.mp4" data-video="\/video\/oomba-hub-promo\.mp4" data-poster="\/video\/oomba-hub-promo-poster\.jpg" data-vtt="\/video\/oomba-hub-promo\.en\.vtt" data-title="The Hub in 60 seconds" aria-label="[^"]+"><i aria-hidden="true"><\/i><span>Watch the 1-minute video<small>The Hub: your whole class on one board<\/small><\/span><\/a>/);
});
