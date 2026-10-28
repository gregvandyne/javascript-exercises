// Search engines (server/seo.js, routes/seo.js, routes/teachers.js): robots.txt, the sitemap, noindex on everything
// private (children's profiles, names, unpublished and child-made games), canonical and hreflang, language addresses,
// structured data that parses, unique titles and descriptions, compression and caching.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { q, now } = await import('../../server/db.js');
const { HUBS } = await import('../../server/learn.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const seo = await import('../../server/seo.js');

seed({ quiet: true });
// A child, their published and reviewed public game, their private game, and a class-only game.
const kid = auth.createUser({ username: 'KidBuilder7', password: 'a-long-password-1', displayName: 'Zoe Kidname' });
function kidGame(slug, visibility) {
  const g = games.createGame(kid.id, { title: `Kid game ${slug}`, slug, description: 'A game a child made.', category: 'arcade' });
  const v = games.addVersion(g.id, '<p>hi</p>', { createdBy: kid.id });
  q.run("UPDATE games SET status='published', visibility=?, published_version_id=?, published_at=? WHERE id=?", visibility, v.id, now(), g.id);
  return games.getGame(g.id);
}
const kidPublic = kidGame('kid-public-game', 'public');
kidGame('kid-private-game', 'private');
kidGame('kid-class-game', 'class');
const guest = auth.createGuest();
// Kid's name on the Sum Racer leaderboard.
const sum = games.getGameBySlug('sum-racer');
q.run('INSERT INTO plays(id, game_id, user_id, started_at) VALUES (?,?,?,?)', 'p-seo-1', sum.id, kid.id, now());
games.submitScore(sum.id, kid.id, 999, '');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => resetLimits());
function cookieOf(u) { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id); return c; }
const get = async (path, headers = {}) => { const r = await fetch(base + path, { headers, redirect: 'manual' }); return { status: r.status, headers: r.headers, text: await r.text() }; };
const robotsMeta = html => (/<meta name="robots" content="([^"]+)">/.exec(html) || [])[1];
const canonical = html => (/<link rel="canonical" href="([^"]+)">/.exec(html) || [])[1];
const hreflangs = html => [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(m => [m[1], m[2]]);
const ld = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const nodes = html => ld(html).flatMap(d => d['@graph'] || [d]);
const ofType = (html, type) => nodes(html).filter(n => [].concat(n['@type']).includes(type));

const PUBLIC = ['/', '/teachers', ...HUBS.map(h => `/learn/${h.slug}`), '/g/sum-racer', '/g/castle-clash', '/safety', '/parents', '/privacy', '/terms', '/refunds', '/sdk/'];

test('robots.txt: private app paths disallowed, the rest allowed, the sitemap named', async () => {
  const r = await get('/robots.txt');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/plain/);
  for (const p of ['/api/', '/frame/', '/play/', '/studio/', '/search', '/*?lang=']) assert.ok(r.text.includes(`Disallow: ${p}\n`), p);
  assert.match(r.text, /^User-agent: \*$/m);
  assert.match(r.text, new RegExp(`^Sitemap: ${base}/sitemap.xml$`, 'm'));
  // Profiles and classes are NOT disallowed: search engines must read their noindex.
  assert.doesNotMatch(r.text, /Disallow: \/(u|class|school)\b/);
});

test('sitemap.xml: public pages and live launch games with lastmod and hreflang; never a child, a guest or a child\'s game', async () => {
  const r = await get('/sitemap.xml');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^application\/xml/);
  assert.match(r.text, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
  const locs = [...r.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].slice(base.length));
  for (const p of PUBLIC) assert.ok(locs.includes(p), `lists ${p}`);
  for (const slug of ['sum-racer', 'word-hunt', 'hero-of-sunvale']) assert.ok(locs.includes(`/g/${slug}`), slug);
  assert.ok(locs.includes('/es/g/sum-racer'), 'a translated game is listed per language');
  for (const bad of [kidPublic.slug, 'kid-private-game', 'kid-class-game', kid.username, guest.username, '/u/', '/play/', '/search', '/class']) {
    assert.ok(!r.text.includes(bad), `never lists ${bad}`);
  }
  // Every <url> is well formed; lastmod is a date; alternates carry x-default.
  const urls = r.text.match(/<url>[\s\S]*?<\/url>/g);
  assert.equal(urls.length, (r.text.match(/<url>/g) || []).length);
  for (const u of urls) { const m = /<lastmod>([^<]+)<\/lastmod>/.exec(u); if (m) assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/); }
  const sumUrl = urls.find(u => u.includes(`<loc>${base}/g/sum-racer</loc>`));
  assert.match(sumUrl, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  assert.match(sumUrl, /hreflang="x-default" href="[^"]+\/g\/sum-racer"/);
  assert.match(sumUrl, /hreflang="fr" href="[^"]+\/fr\/g\/sum-racer"/);
  assert.match(sumUrl, /<image:loc>[^<]+\/covers\/sum-racer\.jpg<\/image:loc>/);
  // Pages only written in English have no language alternates.
  const teachers = urls.find(u => u.includes(`<loc>${base}/teachers</loc>`));
  assert.doesNotMatch(teachers, /hreflang/);
});

test('noindex: profiles, sign-in, search, play, a child\'s published game and its pictures; the 404 page', async () => {
  for (const p of [`/u/${kid.username}`, `/u/${guest.username}`, '/u/OombaAcademy', '/login', '/signup', '/search?q=kid', '/friends', '/chat', '/classes', '/teach', '/build']) {
    const r = await get(p);
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow', p);
    if (r.status === 200) assert.equal(robotsMeta(r.text), 'noindex', `${p} meta`);
  }
  const kg = await get(`/g/${kidPublic.slug}`);
  assert.equal(kg.status, 200);
  assert.equal(kg.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(robotsMeta(kg.text), 'noindex');
  assert.equal(canonical(kg.text), undefined, 'no canonical, no share tags');
  assert.doesNotMatch(kg.text, /og:image|application\/ld\+json/);
  const nf = await get('/no-such-page');
  assert.equal(nf.status, 404); assert.equal(robotsMeta(nf.text), 'noindex');
  assert.equal((await get('/shots/abcd1234.jpg')).headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('indexable pages: robots index, an absolute canonical, unique titles and descriptions, share tags', async () => {
  const titles = new Map(), descs = new Map();
  for (const p of PUBLIC) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.headers.get('x-robots-tag'), null, p);
    assert.match(robotsMeta(r.text), /^index, follow/, p);
    assert.equal(canonical(r.text), base + p, `${p} canonical`);
    const title = /<title>([^<]+)<\/title>/.exec(r.text)[1]; const desc = /<meta name="description" content="([^"]+)">/.exec(r.text)[1];
    assert.ok(!titles.has(title), `${p}: title also on ${titles.get(title)}`); titles.set(title, p);
    assert.ok(!descs.has(desc), `${p}: description also on ${descs.get(desc)}`); descs.set(desc, p);
    assert.ok(desc.length <= 160, `${p} description ${desc.length} chars`);
    for (const tag of ['og:title', 'og:description', 'og:url', 'og:image', 'og:site_name']) assert.match(r.text, new RegExp(`<meta property="${tag}" content="[^"]+">`), `${p} ${tag}`);
    assert.match(r.text, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(r.text, new RegExp(`<meta property="og:image" content="${base}/`), `${p}: absolute og:image`);
  }
  // Share pictures are 1200x630 files that exist.
  for (const p of ['/', '/teachers', '/g/sum-racer']) {
    const img = /<meta property="og:image" content="([^"]+)">/.exec((await get(p)).text)[1].slice(base.length);
    assert.match(img, /^\/og\/[\w-]+\.jpg$/, p);
    const r = await fetch(base + img); assert.equal(r.status, 200, img);
    const buf = Buffer.from(await r.arrayBuffer());
    // JPEG SOF0/SOF2 marker: height then width.
    const i = buf.findIndex((b, k) => b === 0xFF && (buf[k + 1] === 0xC0 || buf[k + 1] === 0xC2));
    assert.deepEqual([buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)], [1200, 630], `${img} is 1200x630`);
  }
  // Game titles say what the game is; descriptions end on a whole word.
  const g = await get('/g/sum-racer');
  assert.match(g.text, /<title>Sum Racer: math racing game for kids · Oomba Academy<\/title>/);
  assert.match(/<meta name="description" content="([^"]+)">/.exec(g.text)[1], /(\w|…)$/);
});

test('structured data parses: Organization and WebSite, VideoGame + LearningResource, FAQPage, breadcrumbs', async () => {
  const home = (await get('/')).text;
  assert.equal(ofType(home, 'Organization').length, 1);
  const site = ofType(home, 'WebSite')[0];
  assert.equal(site.potentialAction['@type'], 'SearchAction');
  assert.match(site.potentialAction.target.urlTemplate, /\/search\?q=\{search_term_string\}$/);
  for (const d of ld(home)) assert.equal(d['@context'], 'https://schema.org');

  const sr = ofType((await get('/g/sum-racer')).text, 'VideoGame')[0];
  assert.deepEqual(sr['@type'], ['VideoGame', 'LearningResource']);
  assert.equal(sr.name, 'Sum Racer'); assert.equal(sr.typicalAgeRange, '8-14'); assert.equal(sr.isAccessibleForFree, true);
  assert.equal(sr.educationalLevel, 'Grades 1-5'); assert.ok(sr.teaches.includes('Times tables'));
  assert.deepEqual(sr.audience.map(a => a['@type']), ['PeopleAudience', 'EducationalAudience']);
  assert.equal(sr.audience[0].suggestedMinAge, 8); assert.equal(sr.audience[0].suggestedMaxAge, 14);
  assert.equal(sr.offers.price, 0);
  assert.ok(sr.inLanguage.includes('fr'));
  assert.equal(sr.aggregateRating, undefined, 'no rating until there are enough real ones');
  const hero = ofType((await get('/g/ring-rumble')).text, 'VideoGame')[0];
  assert.equal(hero['@type'], 'VideoGame', 'a game with nothing to learn is not a LearningResource');

  const teach = (await get('/teachers')).text;
  const faq = ofType(teach, 'FAQPage')[0];
  assert.equal(faq.mainEntity.length, (teach.match(/<h3>/g) || []).length, 'every question on the page is in the FAQ data');
  for (const qn of faq.mainEntity) { assert.ok(qn.name.endsWith('?')); assert.ok(qn.acceptedAnswer.text.length > 20); assert.doesNotMatch(qn.acceptedAnswer.text, /<|\{/); }
  assert.equal(ofType(teach, 'BreadcrumbList')[0].itemListElement.length, 2);
  for (const h of HUBS) {
    const page = (await get(`/learn/${h.slug}`)).text;
    assert.ok(ofType(page, 'FAQPage')[0].mainEntity.length >= 2, h.slug);
    assert.equal(ofType(page, 'BreadcrumbList')[0].itemListElement.length, 3, h.slug);
  }
  // No text can close the JSON-LD element.
  assert.equal(seo.ldScript({ a: '</script><b>' }).includes('</script><b>'), false);
});

test('languages: /<code>/ addresses, hreflang only for written languages, no cookie, the picker keeps the address', async () => {
  const en = await get('/g/sum-racer');
  const alts = Object.fromEntries(hreflangs(en.text));
  assert.equal(alts['x-default'], `${base}/g/sum-racer`);
  assert.equal(alts.en, `${base}/g/sum-racer`);
  assert.equal(alts.fr, `${base}/fr/g/sum-racer`);
  assert.equal(alts['zh-Hant'], `${base}/zh-hant/g/sum-racer`);
  const fr = await get('/fr/g/sum-racer');
  assert.equal(fr.status, 200);
  assert.match(fr.text, /<html lang="fr" dir="ltr"/);
  assert.equal(canonical(fr.text), `${base}/fr/g/sum-racer`);
  assert.match(robotsMeta(fr.text), /^index/);
  assert.equal(fr.headers.get('set-cookie'), null, 'a language address writes no cookie');
  assert.match(fr.text, /<meta property="og:locale" content="fr_FR">/);
  // The picker: rel=nofollow; on a language address it keeps the page and switches the address.
  assert.match(fr.text, /<a href="\/de\/g\/sum-racer\?lang=de" hreflang="de" rel="nofollow"/);
  const he = await get('/he/g/sum-racer');
  assert.match(he.text, /<html lang="he" dir="rtl"/);
  // A page not written in that language yet: served, but pointing at the English page and not indexed.
  const es = await get('/es/teachers');
  assert.equal(es.status, 200);
  assert.equal(canonical(es.text), `${base}/teachers`);
  assert.equal(robotsMeta(es.text), 'noindex, follow');
  assert.deepEqual(hreflangs((await get('/teachers')).text), [], 'English only: no alternates');
  // Only public pages have language addresses; one address per page.
  assert.equal((await get('/fr/login')).status, 404);
  assert.equal((await get('/fr/u/OombaAcademy')).status, 404);
  for (const [from, to] of [['/teachers/', '/teachers'], ['/fr/g/sum-racer/', '/fr/g/sum-racer'], ['/fr/', '/fr']]) {
    const r = await get(from); assert.equal(r.status, 301, from); assert.equal(r.headers.get('location'), to, from);
  }
  // ?lang= on a language address goes to the chosen language's address.
  const pick = await get('/fr/teachers?lang=de', { 'sec-fetch-site': 'same-origin' });
  assert.equal(pick.status, 303); assert.equal(pick.headers.get('location'), '/fr/teachers');
});

test('children\'s names never reach a signed-out page; signed in, the leaderboard shows them', async () => {
  for (const p of ['/', '/g/sum-racer', '/search?q=Kid', '/search?q=Zoe', '/teachers', `/g/${kidPublic.slug}`.replace(kidPublic.slug, 'castle-clash')]) {
    const r = await get(p);
    assert.ok(!r.text.includes('Zoe Kidname'), `${p} shows no child's display name`);
  }
  const out = await get('/g/sum-racer');
  assert.match(out.text, /Sign in to see the players(&#39;|')? names\./);
  const signedIn = await get('/g/sum-racer', { cookie: cookieOf(kid) });
  assert.ok(signedIn.text.includes('Zoe Kidname'), 'players see the leaderboard names');
  // Cards for signed-out visitors credit only the official account.
  const home = await get('/');
  assert.ok(!home.text.includes(`by ${kid.display_name}`));
});

test('teacher and subject pages: one H1, real launch games only, links in the menu and footer', async () => {
  const t = await get('/teachers');
  assert.equal((t.text.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(t.text, /<h1 id="lp-h1">Fun, interactive learning games your class will ask for<\/h1>/);
  for (const slug of ['sum-racer', 'word-hunt', 'castle-clash', 'loop-lab']) assert.ok(t.text.includes(`href="/g/${slug}"`), slug);
  assert.ok(!t.text.includes(kidPublic.slug));
  assert.match(t.text, /href="mailto:[^"]+\?subject=/, 'a working way to start');
  assert.match(t.text, /<a class="navlink" href="\/teachers"/, 'top menu, signed out');
  assert.match(t.text, /<footer[\s\S]*href="\/teachers"/, 'footer, signed out');
  const kidHome = await get('/', { cookie: cookieOf(kid) });
  assert.doesNotMatch(kidHome.text, /class="navlink" href="\/teachers"/, 'not in a child\'s menu');
  // Hidden games drop out of the pages.
  const wh = games.getGameBySlug('word-hunt');
  q.run("UPDATE games SET hidden_reason='reports' WHERE id=?", wh.id);
  try {
    assert.ok(!(await get('/learn/word-games')).text.includes('href="/g/word-hunt"'));
    assert.ok(!(await get('/sitemap.xml')).text.includes('/g/word-hunt<'));
  } finally { q.run("UPDATE games SET hidden_reason='' WHERE id=?", wh.id); }
  assert.equal((await get('/learn/nope')).status, 404);
  // The home page's H1 is about the site, not the featured game.
  const home = await get('/');
  assert.equal((home.text.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(home.text, /<h1 id="home-h1">Fun, interactive learning games for kids<\/h1>/);
});

test('speed: signed-out pages compressed, signed-in ones not; versioned CSS and JS cached for a year', async () => {
  const r = await fetch(base + '/teachers', { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(r.headers.get('content-encoding'), 'gzip');
  assert.match(r.headers.get('vary'), /Accept-Encoding/);
  const raw = await fetch(base + '/teachers', { headers: { 'accept-encoding': 'gzip', cookie: cookieOf(kid) } });
  assert.equal(raw.headers.get('content-encoding'), null, 'signed-in pages may hold secrets: never compressed (BREACH)');
  // The CSP is untouched by the JSON-LD.
  assert.match(r.headers.get('content-security-policy'), /script-src 'self';/);
  const http = await import('node:http');
  const fetchRaw = (path, enc) => new Promise((res, rej) => http.get(base + path, { headers: { 'accept-encoding': enc } }, m => { const c = []; m.on('data', d => c.push(d)); m.on('end', () => res({ headers: m.headers, body: Buffer.concat(c) })); }).on('error', rej));
  const css = await fetchRaw('/css/app.css?v=test1', 'br');
  assert.equal(css.headers['content-encoding'], 'br');
  assert.equal(css.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.match(zlib.brotliDecompressSync(css.body).toString(), /\.lp-hero\{/);
  const plain = await fetchRaw('/css/app.css', 'br');
  assert.equal(plain.headers['content-encoding'], undefined, 'without ?v= express.static answers as before');
  const cover = await fetchRaw('/covers/sum-racer.jpg?v=x', '');
  assert.equal(cover.headers['cache-control'], 'public, max-age=31536000, immutable');
});

test('no guest account for search-engine robots on /play', async () => {
  const before = q.get('SELECT COUNT(*) n FROM users WHERE is_guest=1').n;
  const r = await get('/play/sum-racer', { 'sec-fetch-mode': 'navigate', 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
  assert.equal(r.status, 200);
  assert.equal(q.get('SELECT COUNT(*) n FROM users WHERE is_guest=1').n, before);
  assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
});
