// The teacher landing page at "/" (server/routes/landing.js, docs/decisions.md "Teacher landing page"): what a visitor
// with no session (and a search engine) gets at "/", what everyone with a session still gets, "Just Play" (/play), the
// search tags, the structured data, the sitemap, the click counts, and the honesty rules (no prices on "/", no ratings,
// reviews or testimonials).
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
    assert.match(r.text, /<h1 id="lp-h1" class="lp-h1">Turn your lesson plans into games your class begs to play<\/h1>/);
    assert.match(r.text, /<meta name="robots" content="index, follow, max-image-preview:large">/);
    assert.match(r.text, new RegExp(`<link rel="canonical" href="${base}/">`));
    assert.match(r.text, /<title>Turn lesson plans into classroom games · Oomba Academy<\/title>/);
    assert.match(r.text, /<meta name="description" content="Game-based learning for teachers: [^"]{40,}">/);
    assert.match(r.text, /<meta property="og:image" content="[^"]+\/og\/landing\.jpg">/);
    assert.match(r.text, /<meta name="twitter:card" content="summary_large_image">/);
    for (const lm of ['<header class="lp-bar"', '<main id="lp-main">', '<footer class="lp-foot">', '<nav class="lp-nav"']) assert.ok(r.text.includes(lm), lm);
    assert.doesNotMatch(r.text, /class="topbar"|class="tabbar"|\/css\/app\.css/, 'its own header and footer, not the app shell');
  }
});

test('the top bar: Just Play (JUST_PLAY_URL) and Start free trial; every trial button goes to /trial; pricing to /plans', async () => {
  const s = (await call(null, '/')).text;
  const bar = /<header class="lp-bar"[\s\S]*?<\/header>/.exec(s)[0];
  assert.equal(L.JUST_PLAY_URL, '/play');
  assert.match(bar, /<a class="lp-btn lp-btn-ghost lp-btn-sm lp-justplay" href="\/play" data-cta="play">Just Play /);
  assert.match(bar, /<a class="lp-btn lp-btn-primary lp-btn-sm" href="\/trial" data-cta="trial">/);
  assert.ok(bar.indexOf('lp-justplay') < bar.indexOf('href="/trial"'), 'Just Play, then the trial, at the right');
  const trials = [...s.matchAll(/<a [^>]*data-cta="trial"[^>]*>/g)].map(m => /href="([^"]+)"/.exec(m[0])[1]);
  assert.ok(trials.length >= 5); assert.ok(trials.every(h => h === '/trial'), trials.join());
  assert.match(s, /href="\/plans" data-cta="pricing"/);
  assert.match(s, /No card needed[\s\S]*Cancel anytime[\s\S]*Unlimited students/, 'the trust line');
  assert.match(s, /href="mailto:Greg@oomba\.ai\?subject=/, 'schools: talk to us');
  assert.match(s, /<section class="lp-play" id="play"[\s\S]*?href="\/play"/, 'old "/#play" links land on a way to the games');
  for (const p of ['/teachers', '/teachers/cs-quest', '/teachers/number-quest', '/teachers/cyber-defenders', '/parents', '/learn', '/privacy', '/terms']) assert.ok(s.includes(`href="${p}"`), `links ${p}`);
});

test('honest page: no prices on "/" (LANDING_SHOW_PRICE off), no ratings, reviews, testimonials or user counts', async () => {
  assert.equal(L.LANDING_SHOW_PRICE, false);
  const s = (await call(null, '/')).text;
  assert.doesNotMatch(s, /\$\d|€\d|£\d|\d+\s*(?:USD|dollars)/i, 'no amounts: kids may open "/" too, prices live on /plans');
  assert.doesNotMatch(s, /aggregateRating|ratingValue|reviewCount|"@type":"Review"|itemprop="review"|★|☆|testimonial|trusted by|\d[\d,.]*\+?\s*(?:teachers|schools|students) (?:use|love|trust)/i);
  assert.match(s, /One simple yearly price/);
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
  assert.match(es.text, /<h1 id="lp-h1" class="lp-h1">Convierte tus planes de clase en juegos/);
  assert.match(es.text, new RegExp(`<link rel="canonical" href="${base}/es">`));
  assert.doesNotMatch(es.text, / lang="en" dir="ltr">(?!Roediger|Hattie|Fraction)/, 'nothing left in English but the citations and a game name');
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

test('Just Play: /play is today\'s guest home (the game rows), private to search engines; "/" without the switch is unchanged', async () => {
  const p = await call(null, '/play');
  assert.equal(p.status, 200);
  assert.ok(!isLanding(p.text));
  assert.match(p.text, /class="doors"/); assert.match(p.text, /<div id="play" class="home-play">/); assert.match(p.text, /class="rail/);
  assert.match(p.headers.get('x-robots-tag') || '', /noindex/, '/play is never indexed (seo.js PRIVATE_RE)');
  assert.equal((await call(null, '/play?x=1')).status, 200);
  assert.equal((await call(kid(), '/play')).status, 200, 'a kid with an account too');
  assert.equal((await call(null, '/play/sum-racer')).status, 200, 'game pages under /play/ are untouched');
  process.env.LANDING_AT_ROOT = '0';
  const old = await call(null, '/');
  assert.ok(!isLanding(old.text)); assert.match(old.text, /class="doors"/);
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
  assert.match(s, /<figure class="lp-demo" data-stage="done"/, 'the hero shows the whole lesson → game picture before any script');
});
