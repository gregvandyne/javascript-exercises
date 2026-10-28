// The parent pages (routes/parents.js): /parents, its guides and the age pages are indexable, in the sitemap, with
// unique titles, one H1, a canonical, FAQPage, breadcrumbs and share pictures; they never show a price, a child's name,
// a child's game, or a promise the site doesn't keep (parental controls, COPPA); plans and grown-up accounts are
// linked only while paid-plan pages are public; and /parents still has every privacy section /privacy repeats.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { q, now } = await import('../../server/db.js');
const { AGES, PARENT_GUIDES, HUBS, HOME_TIPS } = await import('../../server/learn.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

seed({ quiet: true });
const kid = auth.createUser({ username: 'ParentPageKid', password: 'a-long-password-1', displayName: 'Mia Kidname' });
const kg = games.createGame(kid.id, { title: 'Mia Secret Game', slug: 'mia-secret-game', description: 'A game a child made.', category: 'learning' });
const v = games.addVersion(kg.id, '<p>hi</p>', { createdBy: kid.id });
q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, published_at=? WHERE id=?", v.id, now(), kg.id);
const sum = games.getGameBySlug('sum-racer');
q.run('INSERT INTO plays(id, game_id, user_id, started_at) VALUES (?,?,?,?)', 'p-par-1', sum.id, kid.id, now());
games.submitScore(sum.id, kid.id, 777, '');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => resetLimits());
/** Billing on (a fake test key; no page here calls Stripe) and public, or back to off. */
function paid(on, pub = on) { config.stripeApiKey = on ? 'rk_test_fake' : ''; config.stripeWebhookSecret = on ? 'whsec_fake_par' : ''; config.billingPublic = pub; }
test.afterEach(() => paid(false));
const get = async (path, headers = {}) => { const r = await fetch(base + path, { headers, redirect: 'manual' }); return { status: r.status, headers: r.headers, text: await r.text() }; };
const robotsMeta = h => (/<meta name="robots" content="([^"]+)">/.exec(h) || [])[1];
const canonical = h => (/<link rel="canonical" href="([^"]+)">/.exec(h) || [])[1];
const ld = h => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const ofType = (h, type) => ld(h).flatMap(d => d['@graph'] || [d]).filter(n => [].concat(n['@type']).includes(type));
const main = h => h.slice(h.indexOf('<main'), h.indexOf('<footer'));
const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const text = h => decode(h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');

const AGE_PAGES = AGES.map(a => `/learn/${a.slug}`);
const GUIDES = PARENT_GUIDES.map(g => `/parents/${g.slug}`);
const PAGES = ['/parents', ...GUIDES, ...AGE_PAGES];

test('parent pages: indexed, own canonical, one H1, unique titles and descriptions, share pictures', async () => {
  const titles = new Set(), descs = new Set();
  for (const p of [...PAGES, '/teachers', ...HUBS.map(h => `/learn/${h.slug}`), '/']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.match(robotsMeta(r.text), /^index, follow/, p);
    assert.equal(r.headers.get('x-robots-tag'), null, p);
    assert.equal(canonical(r.text), base + p, p);
    assert.equal((r.text.match(/<h1[\s>]/g) || []).length, 1, `${p}: one H1`);
    const title = /<title>([^<]+)<\/title>/.exec(r.text)[1]; const desc = /<meta name="description" content="([^"]+)">/.exec(r.text)[1];
    assert.ok(!titles.has(title), `${p}: title "${title}" is used twice`); titles.add(title);
    assert.ok(!descs.has(desc), `${p}: description is used twice`); descs.add(desc);
    assert.ok(desc.length <= 160, `${p}: description ${desc.length} chars`);
    if (PAGES.includes(p)) {
      assert.ok(title.length <= 75, `${p}: title ${title.length} chars`);
      const img = /<meta property="og:image" content="([^"]+)">/.exec(r.text)[1].slice(base.length);
      assert.match(img, /^\/og\/[\w-]+\.jpg$/, p);
      const res = await fetch(base + img); assert.equal(res.status, 200, img);
      const buf = Buffer.from(await res.arrayBuffer());
      const i = buf.findIndex((b, k) => b === 0xFF && (buf[k + 1] === 0xC0 || buf[k + 1] === 0xC2));
      assert.deepEqual([buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)], [1200, 630], `${img} is 1200x630`);
    }
  }
  assert.match((await get('/parents')).text, /<title>Safe, free learning games for kids 8–14 · Oomba Academy<\/title>/);
  assert.match((await get('/learn/games-for-10-and-11-year-olds')).text, /<h1 id="lp-h1"><span aria-hidden="true">🚀<\/span> Learning games for 10 and 11 year olds<\/h1>/);
  assert.equal((await get('/parents/nope')).status, 404);
  assert.equal((await get('/learn/games-for-99-year-olds')).status, 404);
});

test('sitemap lists /parents, its guides and the age pages with their share pictures', async () => {
  const xml = (await get('/sitemap.xml')).text;
  for (const p of PAGES) {
    const u = (xml.match(/<url>[\s\S]*?<\/url>/g) || []).find(x => x.includes(`<loc>${base}${p}</loc>`));
    assert.ok(u, `lists ${p}`);
    assert.match(u, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/, p);
    assert.match(u, /<image:loc>[^<]+\/og\/[\w-]+\.jpg<\/image:loc>/, p);
  }
  // English only until the pages are translated: no other language's address is listed.
  assert.ok(!xml.includes(`${base}/es/parents<`));
  // A language address answers, and points search engines at the English page until it is translated.
  const fr = await get('/fr/parents/ai-builder-safety');
  assert.equal(fr.status, 200);
  assert.equal(canonical(fr.text), `${base}/parents/ai-builder-safety`);
  assert.match(robotsMeta(fr.text), /^noindex/);
  assert.match(fr.text, /<html lang="fr"/);
  assert.equal((await get('/he/learn/games-for-8-and-9-year-olds')).status, 200);
});

test('structured data: FAQPage matches the questions on the page, breadcrumbs, item lists, parent audience', async () => {
  for (const p of PAGES) {
    const h = (await get(p)).text;
    const faq = ofType(h, 'FAQPage')[0];
    assert.ok(faq, `${p}: FAQPage`);
    const shown = (main(h).match(/<section class="panel faq lp-faq"[\s\S]*?<\/section>/)[0].match(/<h3[\s>]/g) || []).length;
    assert.equal(faq.mainEntity.length, shown, `${p}: every question on the page is in the FAQ data`);
    for (const qn of faq.mainEntity) { assert.ok(qn.name.endsWith('?'), qn.name); assert.doesNotMatch(qn.acceptedAnswer.text, /<|\{/, qn.name); }
    const crumbs = ofType(h, 'BreadcrumbList')[0].itemListElement;
    assert.equal(crumbs[0].item, `${base}/`);
    assert.equal(crumbs.length, p === '/parents' ? 2 : 3, p);
    if (p !== '/parents') assert.equal(crumbs[1].item, `${base}/parents`, `${p}: under Parents`);
  }
  const par = (await get('/parents')).text;
  const pg = ofType(par, 'WebPage')[0];
  assert.deepEqual(pg.audience, { '@type': 'ParentAudience', childMinAge: 8, childMaxAge: 14 });
  const list = ofType(par, 'ItemList')[0].itemListElement.map(i => i.url.slice(base.length));
  assert.ok(list.includes('/g/sum-racer') && list.includes('/g/castle-clash'));
  const a8 = ofType((await get('/learn/games-for-8-and-9-year-olds')).text, 'CollectionPage')[0];
  assert.deepEqual(a8.audience[0], { '@type': 'PeopleAudience', suggestedMinAge: 8, suggestedMaxAge: 9 });
  assert.equal(a8.mainEntity.itemListElement[0].url, `${base}/g/sum-racer`);
  const guide = ofType((await get('/parents/ai-builder-safety')).text, 'Article')[0];
  assert.match(guide.dateModified, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(guide.headline, 'Is the AI Builder safe for my child?');
});

/** Words that would promise something the site doesn't do, or a legal status it hasn't got. */
const PROMISES = [/COPPA/i, /kidSAFE/i, /parental controls?/i, /\bmonitor/i, /screen[- ]time limits? (?:in|on) Oomba/i];
const PRICE = /\$\s?\d|\d\.\d\d\b|\bUSD\b|€|£\s?\d|\/mo\b|a month\b/;
const NOT_ON_PARENT_PAGES = ['ring-rumble', 'happy-putt', 'footy-tycoon', 'mia-secret-game', 'Mia Kidname', 'ParentPageKid'];

test('no prices, no kids’ names or games, no promises the site doesn’t keep: billing off, on but private, and public', async () => {
  for (const [label, on, pub] of [['off', false, false], ['on, not public', true, false], ['public', true, true]]) {
    paid(on, pub);
    for (const p of [...PAGES, '/learn/make-a-game', '/learn/math-games']) {
      const h = main((await get(p)).text); const words = text(h);
      assert.doesNotMatch(words, PRICE, `${label} ${p}: no price: ${(new RegExp(`.{30}${PRICE.source}.{10}`).exec(words) || [''])[0]}`);
      for (const re of PROMISES) assert.doesNotMatch(words, re, `${label} ${p}: ${re}`);
      // "Dashboard" only where a page says there is none.
      for (const m of words.matchAll(/.{0,60}\bdashboard/gi)) assert.match(m[0], /\b(no|don’t have)\b/i, `${label} ${p}: "${m[0]}"`);
      for (const s of NOT_ON_PARENT_PAGES) assert.ok(!h.includes(s), `${label} ${p}: ${s}`);
      assert.doesNotMatch(h, /\b(parents|learn)\.[a-z][\w.]*\.(h|p\d|li\d|q\d|a\d|title)\b/, `${label} ${p}: a raw locale key`);
      const links = pub && on;
      assert.equal(/href="\/plans"/.test(h), links && p !== '/learn/math-games' && !p.startsWith('/learn/games-for') && !p.startsWith('/parents/'), `${label} ${p}: /plans link`);
      if (!links) assert.doesNotMatch(h, /href="\/grown-ups/, `${label} ${p}: no grown-up account link`);
    }
  }
  paid(true, true);
  const par = (await get('/parents')).text;
  assert.match(par, /<a class="btn btn-big" href="\/grown-ups">Make a grown-up account<\/a>/);
  assert.match(par, /<a class="btn btn-primary" href="\/plans">See plans and prices<\/a>/, 'the families section, as before');
  assert.ok(text(par).includes('A linked grown-up account sees only your child’s name'));
});

test('/parents keeps every privacy and safety section, saying the same as /privacy', async () => {
  const h = (await get('/parents')).text;
  for (const id of ['what', 'stored', 'never', 'ai', 'keep', 'friends', 'builder', 'languages']) assert.match(h, new RegExp(`<section class="panel" id="${id}">`), id);
  assert.doesNotMatch(h, /id="plans"/, 'plans only once public');
  const priv = (await get('/privacy')).text;
  const body = (page, id) => text(new RegExp(`<section class="panel" id="${id}">[\\s\\S]*?</section>`).exec(page)[0]);
  for (const id of ['stored', 'never', 'ai', 'keep']) assert.equal(body(h, id), body(priv, id), `${id}: the same words on /parents and /privacy`);
  // The sections sit under one heading on /parents (h3), and stay h2 on /privacy.
  assert.match(h, /<section class="panel" id="stored"><h3>What we keep<\/h3>/);
  assert.match(priv, /<section class="panel" id="stored"><h2>What we keep<\/h2>/);
  assert.match(h, /<h2 id="details-h">Safety and privacy, in detail<\/h2>/);
  // Contact (CONTACT_EMAIL): /parents#contact still works.
  const saved = config.contactEmail; config.contactEmail = 'hello@example.org';
  try { assert.match((await get('/parents')).text, /<section class="panel" id="contact"><h3>Contact us<\/h3>/); } finally { config.contactEmail = saved; }
});

test('calls to action and links: start free, try a game, teachers; menu, footer, home, subject and game pages', async () => {
  const par = (await get('/parents')).text;
  assert.match(par, /<a class="btn btn-primary btn-big" href="\/signup">Let your child start free<\/a>/);
  assert.match(par, /href="\/play\/sum-racer" rel="nofollow">▶ Try a game now, no sign-up/);
  assert.match(par, /href="\/teachers">Oomba Academy for teachers<\/a>/);
  for (const p of [...AGE_PAGES, ...GUIDES, '/learn/make-a-game', '/learn/math-games']) assert.ok(par.includes(`href="${p}"`), `/parents links ${p}`);
  // Signed out: Parents in the top menu and "For parents" in the footer; not in a child's menu.
  assert.match(par, /<a class="navlink" href="\/parents" aria-current="page"/);
  const home = (await get('/')).text;
  assert.match(home, /<a class="navlink" href="\/parents"/);
  assert.match(home, /<footer[\s\S]*<a href="\/parents">For parents<\/a>/);
  assert.match(home, /<section class="home-intro"[\s\S]*href="\/parents"[\s\S]*<\/section>/);
  let c = ''; auth.startSession({ append: (k, val) => { c = val.split(';')[0]; } }, kid.id);
  assert.doesNotMatch((await get('/', { cookie: c })).text, /class="navlink" href="\/parents"/);
  // Subject pages: an "At home" paragraph, the parent page and the age pages.
  for (const h of HUBS) {
    const page = (await get(`/learn/${h.slug}`)).text;
    assert.equal(/id="home"/.test(page), HOME_TIPS.includes(h.key), `${h.slug}: At home`);
    assert.ok(page.includes('href="/parents"'), `${h.slug} links /parents`);
    for (const a of AGE_PAGES) assert.ok(page.includes(`href="${a}"`), `${h.slug} links ${a}`);
  }
  const make = (await get('/learn/make-a-game')).text;
  for (const id of ['parents', 'ideas', 'scratch']) assert.match(make, new RegExp(`id="${id}"`), id);
  assert.ok(make.includes('href="/parents/ai-builder-safety"'));
  // Age pages: why each game fits, two-player games, the other ages; games that suit the age only.
  const a12 = (await get('/learn/games-for-12-to-14-year-olds')).text;
  assert.ok(a12.indexOf('id="make"') < a12.indexOf('id="g-castle-clash"'), '12 to 14: making comes first');
  assert.match(a12, /Why it fits this age:/);
  assert.ok(!a12.includes('id="g-shark-plank"'), 'no early-reader game for 12 to 14');
  assert.ok(a12.includes('href="/learn/games-for-8-and-9-year-olds"'));
  assert.match((await get('/learn/games-for-10-and-11-year-olds')).text, /Outgrowing ABCya\?/);
  // Game pages show their ages.
  assert.match((await get('/g/sum-racer')).text, /Grades 1–5 · Ages 8–11/);
  // The screen-time guide links the device makers' own tools.
  const screen = (await get('/parents/safety-and-screen-time')).text;
  for (const host of ['healthychildren.org', 'families.google', 'microsoft.com', 'apple.com']) assert.ok(screen.includes(host), host);
});

test('hidden games drop out of the parent pages', async () => {
  const wh = games.getGameBySlug('word-hunt');
  q.run("UPDATE games SET hidden_reason='reports' WHERE id=?", wh.id);
  try {
    for (const p of ['/parents', '/learn/games-for-8-and-9-year-olds']) assert.ok(!(await get(p)).text.includes('href="/g/word-hunt"'), p);
  } finally { q.run("UPDATE games SET hidden_reason='' WHERE id=?", wh.id); }
});

test('a grown-up account can open every page /parents and the guides link to', async () => {
  paid(true, true);
  const F = await import('../../server/services/family.js');
  const g = auth.createUser({ username: 'RevParent1', password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(g);
  let c = ''; auth.startSession({ append: (k, val) => { c = val.split(';')[0]; } }, g.id);
  const seen = new Set();
  for (const p of ['/parents', ...GUIDES, ...AGE_PAGES, '/learn/make-a-game']) {
    const r = await get(p, { cookie: c });
    assert.equal(r.status, 200, `grown-up: ${p}`);
    if (!['/parents', ...GUIDES].includes(p)) { assert.ok(!main(r.text).includes('href="/build"'), `${p}: no Builder button for a grown-up`); continue; }
    for (const [, href] of main(r.text).matchAll(/href="(\/[^"#?]*)/g)) seen.add(href);
  }
  for (const href of seen) assert.ok((await get(href, { cookie: c })).status < 400, `grown-up: ${href}`);
  assert.ok(seen.has('/parents/ai-builder-safety') && seen.has('/learn/games-for-12-to-14-year-olds'));
});

test('the AI guide lists every rule and everything the AI sees; titles fit; reports and reviews said right', async () => {
  const ai = (await get('/parents/ai-builder-safety')).text; const words = text(main(ai));
  for (const s of ['romantic', 'bullying', 'self-harm', 'drugs', 'alcohol', 'vaping', 'Mario', 'Pokémon', 'classmates, teachers or family', 'gambling', 'real brands', 'links']) assert.ok(words.includes(s), `rules: ${s}`);
  assert.ok(words.includes('profile photo, it is sent to Claude'), 'sees: profile photos');
  assert.ok(words.includes('share with everyone are reviewed by Claude'), 'sees: public review');
  assert.doesNotMatch(words, /three people report/, 'no fixed report count');
  assert.doesNotMatch(words, /checked by the AI and reviewed/, 'no promise of a second review');
  // FAQ answer 3 points at the full list.
  assert.match(ai, /<a href="#rules">See every rule it follows<\/a>/);
  const art = ofType(ai, 'Article')[0];
  assert.equal(art.datePublished, PARENT_GUIDES[0].published);
  assert.ok(art.dateModified >= art.datePublished);
  for (const p of PAGES) { const title = /<title>([^<]+)<\/title>/.exec((await get(p)).text)[1]; assert.ok(decode(title).length <= 60, `${p}: title "${title}" ${title.length} chars`); }
  // The parent pages end with a next step.
  for (const p of ['/parents', ...GUIDES]) {
    const m = main((await get(p)).text);
    assert.ok(m.lastIndexOf('Seen enough? Try a game with your child now.') > m.indexOf('id="faq"'), `${p}: a call to action after the questions`);
    assert.ok(m.lastIndexOf('href="/signup"') > m.indexOf('id="faq"'), `${p}: start free after the questions`);
  }
  // Screen-time guide: photos are named, honestly.
  assert.match(text(main((await get('/parents/safety-and-screen-time')).text)), /Photos are optional/);
  // Private by design does not claim everything stays private.
  assert.doesNotMatch(text(main((await get('/parents')).text)), /makes and says here stays private/);
});

test('age pages: "Playing together" names only games on the page; no repeated practise line; consistent Sum Racer', async () => {
  for (const age of AGES) {
    const h = main((await get(`/learn/${age.slug}`)).text);
    const together = (/<section class="panel" id="together"[\s\S]*?<\/section>/.exec(h) || [''])[0];
    for (const name of ['Sum Racer', 'Castle Clash', 'Drop Four']) {
      const slug = { 'Sum Racer': 'sum-racer', 'Castle Clash': 'castle-clash', 'Drop Four': 'connect-four' }[name];
      assert.equal(together.includes(name), age.games.includes(slug), `${age.key}: together names ${name} only when listed`);
    }
    const faq = text((/<section class="panel faq lp-faq"[\s\S]*?<\/section>/.exec(h) || [''])[0]);
    if (!age.games.includes('connect-four')) assert.ok(!faq.includes('Drop Four'), `${age.key}: FAQ names no unlisted game`);
    assert.ok(!h.includes('class="lp-practise"'), `${age.key}: the fit line only`);
  }
  assert.match(text((await get('/learn/games-for-12-to-14-year-olds')).text), /Castle Clash has a two-player mode on one screen/);
  assert.match(text((await get('/learn/games-for-8-and-9-year-olds')).text), /Sum Racer, Castle Clash and Drop Four each have a two-player mode/);
  const a8 = text((await get('/learn/games-for-8-and-9-year-olds')).text);
  assert.ok(a8.includes('adding to 10 or 20') && !a8.includes('Start with adding to 20'));
  // Parent wording in shared keys.
  const par = text(main((await get('/parents')).text));
  assert.ok(!/\bStudents? (design|can race)|Two students/.test(par), 'no teacher wording on /parents');
  assert.ok(par.includes('every player with an account'), 'building needs an account');
});

test('localized pages stay in one language: no untranslated additions on game, subject, home and teacher pages', async () => {
  const es = (await get('/es/g/sum-racer')).text;
  assert.match(robotsMeta(es), /^index/);
  assert.doesNotMatch(es, /Ages 8–11/, 'no English age line on a Spanish game page');
  const math = (await get('/es/learn/math-games')).text;
  assert.match(robotsMeta(math), /^index/);
  assert.doesNotMatch(main(math), /lang="en"/, '/es/learn/math-games has no English blocks');
  const faq = ofType(math, 'FAQPage')[0];
  for (const qn of faq.mainEntity) assert.doesNotMatch(qn.name, /\bmy child\b|\bthe\b/i, qn.name);
  const make = main((await get('/es/learn/make-a-game')).text);
  for (const id of ['parents', 'ideas', 'scratch']) assert.ok(!make.includes(`id="${id}"`), `/es make-a-game: no English ${id} section`);
  assert.doesNotMatch(make, /lang="en"/);
  // The "Parents" links use the translated footer label until the language has its own.
  const home = (await get('/es')).text;
  assert.match(home, /<span>Para las familias<\/span>/);
  assert.doesNotMatch(home, /lang="en"[^>]*>For parents|>Parents</);
  assert.match((await get('/es/teachers')).text, /<a class="navlink" href="\/parents"[^>]*><span class="emo" aria-hidden="true">👪<\/span>Para las familias/);
  // English keeps all of it.
  assert.match((await get('/g/sum-racer')).text, /Ages 8–11/);
  assert.match((await get('/learn/math-games')).text, /id="home"/);
});
