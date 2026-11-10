// /research and /compliance (routes/trust.js) and the K-8 age range (docs/decisions.md "Research and compliance pages",
// "One age range"): both pages render, are indexable and in the sitemap in every language, carry only the three
// verified studies with their DOIs, never claim compliance the product hasn't got, show the owner/lawyer placeholders
// only to the platform admin, and the site's audience is "5 to 14" (K-8) everywhere outside the course bands, the
// per-age pages and the signed-off legal text.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const { AGES, ageBand } = await import('../../server/learn.js');
const { RESEARCH, PENDING } = await import('../../server/routes/trust.js');
const { CODES } = await import('../../server/i18n/index.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

seed({ quiet: true });
const admin = auth.createUser({ username: 'TrustAdmin', password: 'a-long-password-for-admin-1', displayName: 'Trust Admin' });
q.run("UPDATE users SET role='admin' WHERE id=?", admin.id);
const kid = auth.createUser({ username: 'TrustKid', password: 'a-long-password-1', displayName: 'Trust Kid' });

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => resetLimits());
const cookieFor = u => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id); return c; };
const get = async (path, user) => { const r = await fetch(base + path, { headers: user ? { cookie: cookieFor(user) } : {}, redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
const ld = h => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const ofType = (h, type) => ld(h).flatMap(d => d['@graph'] || [d]).filter(n => [].concat(n['@type']).includes(type));
const main = h => h.slice(h.indexOf('<main'), h.indexOf('<footer'));
const text = h => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
const locale = c => JSON.parse(fs.readFileSync(new URL(`../../server/i18n/locales/${c}.json`, import.meta.url), 'utf8'));
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));

test('/research and /compliance: 200, indexable, one H1, canonical, share picture, breadcrumbs under Teachers', async () => {
  for (const p of ['/research', '/compliance']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.text, /<meta name="robots" content="index, follow/, p);
    assert.match(r.text, new RegExp(`<link rel="canonical" href="${base}${p}">`), p);
    assert.equal((r.text.match(/<h1[\s>]/g) || []).length, 1, p);
    const img = /<meta property="og:image" content="([^"]+)">/.exec(r.text)[1].slice(base.length);
    assert.equal((await fetch(base + img)).status, 200, img);
    const crumbs = ofType(r.text, 'BreadcrumbList')[0].itemListElement;
    assert.deepEqual(crumbs.map(c => c.item.slice(base.length)), ['/', '/teachers', p]);
    const desc = /<meta name="description" content="([^"]+)">/.exec(r.text)[1];
    assert.ok(desc.length <= 160, `${p}: description ${desc.length}`);
  }
  // Every language has its own address, in its own language.
  for (const c of CODES.filter(c => !c.startsWith('en'))) {
    const seg = c.toLowerCase();
    for (const p of ['/research', '/compliance']) {
      const r = await get(`/${seg}${p}`);
      assert.equal(r.status, 200, `/${seg}${p}`);
      assert.doesNotMatch(main(r.text).replace(/<ol class="trust-cites" lang="en" dir="ltr">[\s\S]*?<\/ol>/, '').replace(/<p class="notice warn small trust-pending"[\s\S]*?<\/p>/g, ''), /lang="en"/, `/${seg}${p}: no English blocks`);
    }
  }
});

test('sitemap lists /research, /compliance and the 5 to 7 age page in every language', async () => {
  const xml = (await get('/sitemap.xml')).text;
  for (const p of ['/research', '/compliance', '/learn/games-for-5-to-7-year-olds']) {
    assert.ok(xml.includes(`<loc>${base}${p}</loc>`), p);
    assert.ok(xml.includes(`<loc>${base}/es${p}</loc>`), `/es${p}`);
    assert.ok(xml.includes(`<loc>${base}/ja${p}</loc>`), `/ja${p}`);
  }
  assert.ok(xml.includes(`${base}/og/research.jpg`) && xml.includes(`${base}/og/compliance.jpg`) && xml.includes(`${base}/og/ages-5-7.jpg`));
});

test('/research: only the three verified studies, percentiles up front, effect sizes in small print, DOIs, honest limits', async () => {
  const h = main((await get('/research')).text); const words = text(h);
  assert.deepEqual(RESEARCH.map(r => r.doi), ['10.3102/0034654315582065', '10.1037/a0031311', '10.1007/s10648-019-09498-w']);
  for (const r of RESEARCH) assert.ok(h.includes(`href="https://doi.org/${r.doi}"`), r.doi);
  for (const s of ['From the 50th to about the 63rd percentile', 'About the 61st percentile for learning, and the 64th', 'About the 69th percentile',
    'g = 0.33', 'd = 0.29', 'd = 0.36', 'g = 0.49', 'None of these studies tested Oomba Academy', 'not more motivating']) assert.ok(words.includes(s), s);
  // The plain-words line comes before its effect size.
  assert.ok(words.indexOf('63rd percentile') < words.indexOf('g = 0.33'));
  assert.match(h, /<p class="trust-fine">Clark, Tanner-Smith and Killingsworth \(2016\)/);
  // No other effect size or study.
  assert.deepEqual([...words.matchAll(/\b[gd] = (\d\.\d\d)/g)].map(m => m[1]).sort(), ['0.29', '0.33', '0.36', '0.49']);
  const art = ofType((await get('/research')).text, 'Article')[0];
  assert.equal(art.citation.length, 3);
  assert.deepEqual(art.audience, { '@type': 'EducationalAudience', educationalRole: 'teacher' });
});

test('/compliance: facts from the Privacy Policy, no compliance claims, contact for DPA/FERPA/GDPR, placeholders admin-only', async () => {
  for (const [who, user] of [['signed out', null], ['kid', kid]]) {
    const h = main((await get('/compliance', user)).text); const words = text(h);
    for (const s of ['COPPA', 'FERPA', 'GDPR', 'Data Processing Agreement', 'mailto:', 'never sell', 'as long as the account exists', 'the Privacy Policy is the one that counts']) assert.ok(h.includes(s) || words.includes(s), `${who}: ${s}`);
    // Never a claim the product hasn't got.
    for (const re of [/\bcompliant\b/i, /\bcertified\b/i, /safe harbor/i, /\bkidSAFE\b/i, /school official/i, /we offer a (DPA|Data Processing Agreement)/i, /DPA is available/i, /\bSOC ?2\b/i])
      assert.doesNotMatch(words, re, `${who}: ${re}`);
    assert.doesNotMatch(h, /Not shown publicly|OWNER AND LAWYER/, `${who}: no placeholder`);
  }
  const a = main((await get('/compliance', admin)).text);
  for (const k of Object.keys(PENDING)) assert.ok(a.includes(PENDING[k].replace(/"/g, '&quot;').replace(/'/g, '&#39;').slice(0, 60)) || a.includes(PENDING[k].slice(0, 40)), `admin sees the ${k} placeholder`);
  assert.equal((a.match(/Not shown publicly/g) || []).length, 4);
  // Not translated: the placeholders never reach a locale file.
  for (const c of CODES) assert.ok(!JSON.stringify(locale(c)).includes('OWNER AND LAWYER'), c);
});

test('footer links to /research and /compliance for grown-ups who teach and the signed-out, not for kids', async () => {
  const out = (await get('/teachers')).text;
  const foot = out.slice(out.lastIndexOf('<footer'));
  assert.match(foot, /href="\/research"/); assert.match(foot, /href="\/compliance"/);
  const k = (await get('/teachers', kid)).text;
  assert.doesNotMatch(k.slice(k.lastIndexOf('<footer')), /href="\/compliance"/);
});

test('ages 5 to 7: an honest guide, early-years games only, says the courses start in grade 3', async () => {
  const a5 = AGES.find(a => a.key === 'a5');
  assert.deepEqual([a5.min, a5.max, a5.slug], [5, 7, 'games-for-5-to-7-year-olds']);
  assert.equal(AGES[0], a5, 'first in the list of ages');
  const { SHELF_INFO, LEARNING } = await import('../../server/learn.js');
  for (const slug of a5.games) {
    const from = SHELF_INFO[slug] ? SHELF_INFO[slug].from : (/^Grades (K|\d)/.exec(LEARNING[slug].level)[1]);
    assert.ok(from === 0 || from === 'K' || +from <= 2, `${slug}: its own grade band starts by grade 2`);
  }
  const r = await get('/learn/games-for-5-to-7-year-olds');
  assert.equal(r.status, 200);
  const words = text(main(r.text));
  assert.ok(words.includes('Ages 5–7'));
  assert.ok(words.includes('full courses start in grade 3'));
  assert.ok(words.includes('Not yet. Number Quest, CS Quest and Cyber Defenders start in grade 3'));
  const cp = ofType(r.text, 'CollectionPage')[0];
  assert.equal(cp.typicalAgeRange, '5-7');
  // /parents links it, and says the guides start at 5.
  const par = (await get('/parents')).text;
  assert.ok(par.includes('href="/learn/games-for-5-to-7-year-olds"'));
  assert.ok(text(par).includes('Kids change a lot between 5 and 14'));
  for (const c of CODES.filter(c => !c.startsWith('en'))) assert.doesNotMatch(locale(c).parents.ages.p, /(^|\D)8(\D|$)/, `${c}: parents.ages.p`);
  // A game's age line now starts from the K-8 range (grade N is about age N+5).
  assert.deepEqual(ageBand('shark-plank'), { from: '5', to: '9' });
  assert.deepEqual(ageBand('sum-racer'), { from: '6', to: '11' });
});

test('one age range: no "ages 8 to 14" as the site audience left in en.json (outside course bands, per-age pages and legal text)', () => {
  // Allowed: the signed-off Terms (not edited; listed in the report), each course's own grade band, the per-age pages,
  // live question levels and the Brain Board starter set (its own band).
  const ALLOW = /^(info\.terms\.|learn\.ages\.a(5|8|10|12)\.|live\.|teachers\.(cs|cd|nq)\.|cs\.|teach\.cd\.|courses\.|lessons\.library\.|landing\.courses\.|learn\.hubs\.cs\.|stories\.)/;
  const bad = flat(locale('en')).filter(([k, v]) => typeof v === 'string' && !ALLOW.test(k) &&
    /\b(ages?|aged|kids?|children|students?)\b[^.]{0,20}\b8\s*(to|–|-)\s*14\b|\b8\s*(to|–|-)\s*14\b|between 8 and 14|grades? 3\s*(to|–|-)\s*8\b/i.test(v));
  assert.deepEqual(bad.map(([k]) => k), []);
});

test('no em dashes in the new English strings', () => {
  const en = locale('en');
  const fresh = [...flat(en.research, 'research.'), ...flat(en.compliance, 'compliance.'), ...flat(en.learn.ages.a5, 'learn.ages.a5.'), ['parents.ages.p', en.parents.ages.p]];
  assert.ok(fresh.length > 60);
  for (const [k, v] of fresh) assert.ok(!String(v).includes('\u2014'), k);
  for (const v of Object.values(PENDING)) assert.ok(!v.includes('\u2014'));
});
