// /compare, "How Oomba compares" (routes/compare.js; docs/decisions.md "Comparison page: the one page that names other
// products"): the page renders and is indexable in every language, its table is real table markup with text labels,
// every claim about another product has a source footnote to that product's own website, the three product names
// appear nowhere else the site serves, prompts or tests, no prices, no em dashes, and its strings pass the i18n check.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const C = await import('../../server/routes/compare.js');
const { CODES, flatten } = await import('../../server/i18n/index.js');
const { checkLocale, loadLocale } = await import('../../server/i18n/check.js');
const { readyVideos } = await import('../../server/views/see-it.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

seed({ quiet: true });
const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => resetLimits());
const get = async p => { const r = await fetch(base + p, { redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
const main = h => h.slice(h.indexOf('<main'), h.indexOf('<footer'));
const text = h => h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const NAMES = /kahoot|classroomscreen|brainingcamp/i;
const PRICE = /[$€£¥]\s?\d|\d\s?(?:USD|EUR|GBP|dollars?)\b|\bper (?:month|year|seat|student)\b|\/(?:month|mo|year|yr)\b|\bpric(?:e|es|ing)\b/i;
const en = flatten(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales/en.json'), 'utf8')));
const compareKeys = Object.keys(en).filter(k => k.startsWith('compare.'));
const rows = () => C.ROWS.filter(r => r.id !== 'videos' || readyVideos().length);

test('/compare: 200, indexable, one H1, canonical, breadcrumbs under Teachers, in the sitemap, every language at its own address', async () => {
  const r = await get('/compare');
  assert.equal(r.status, 200);
  assert.match(r.text, /<meta name="robots" content="index, follow/);
  assert.match(r.text, new RegExp(`<link rel="canonical" href="${base}/compare">`));
  assert.equal((r.text.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(r.text, /<title>How Oomba compares/);
  const desc = /<meta name="description" content="([^"]+)">/.exec(r.text)[1];
  assert.ok(desc.length <= 200, `description ${desc.length}`);
  const ld = [...r.text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(m => { const d = JSON.parse(m[1]); return d['@graph'] || [d]; });
  assert.deepEqual(ld.find(n => n['@type'] === 'BreadcrumbList').itemListElement.map(c => c.item.slice(base.length)), ['/', '/teachers', '/compare']);
  const xml = (await get('/sitemap.xml')).text;
  assert.ok(xml.includes(`<loc>${base}/compare</loc>`) && xml.includes(`<loc>${base}/es/compare</loc>`) && xml.includes(`<loc>${base}/ja/compare</loc>`));
  for (const c of CODES.filter(c => !c.startsWith('en'))) {
    const seg = c.toLowerCase(); const p = await get(`/${seg}/compare`);
    assert.equal(p.status, 200, `/${seg}/compare`);
    // Only the product names (never translated) are marked English on a translated page.
    const rest = main(p.text).replace(/<(th|span)[^>]*lang="en" dir="ltr">(?:Kahoot!|Classroomscreen|Brainingcamp)<\/\1>/g, '');
    assert.doesNotMatch(rest, /lang="en"/, `/${seg}/compare: every string translated`);
  }
});

test('the table: real table markup, a header per product, a row header per need, a text label in every cell, legend and gate wording', async () => {
  const h = main((await get('/compare')).text);
  assert.match(h, /<table class="cmp-table">\s*<caption>/);
  const heads = [...h.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(m => m[1]);
  assert.deepEqual(heads, ['Classroom need', 'Oomba', 'Kahoot!', 'Classroomscreen', 'Brainingcamp']);
  const body = h.slice(h.indexOf('<tbody>'), h.indexOf('</tbody>'));
  const trs = body.split('<tr ').slice(1);
  assert.equal(trs.length, rows().length);
  for (const tr of trs) {
    assert.equal((tr.match(/<th scope="row"/g) || []).length, 1);
    const tds = tr.split('<td').slice(1);
    assert.equal(tds.length, 4, 'Oomba and three products');
    for (const td of tds) assert.match(td, /<span class="cmp-mark cmp-(yes|partial|no|notStated)">(?:<img[^>]*alt=""[^>]*aria-hidden="true"[^>]*>)?<b>(Yes|Partial|No|Not stated)<\/b>/, 'a word, never color or an icon alone');
  }
  assert.ok(text(h).includes('Not stated: we have not confirmed it from their public website.'), 'the legend says what Not stated means');
  assert.match(h, /role="region" aria-labelledby="table-h" tabindex="0"/, 'the scroll box can be reached by keyboard');
  // Plans are off in unit tests: the teaching tools are "In testing", like the See it in action note.
  const gated = new Set(C.ROWS.filter(r => r.gated).map(r => r.id));
  for (const tr of trs) { const id = /id="row-([a-zA-Z]+)"/.exec(tr)[1]; assert.equal(tr.includes('<span class="cmp-tag">In testing</span>'), gated.has(id), id); }
  assert.ok(!h.includes('Teacher plan</span>'));
  for (const s of ['Last checked:', 'Why teachers pick Oomba', 'Kahoot!, Classroomscreen and Brainingcamp are trademarks of their owners. Oomba is not affiliated with them. Comparison based on their public websites as of'])
    assert.ok(text(h).includes(s), s);
  assert.match(h, /<a href="mailto:[^"]+">tell us if something changed<\/a>/, 'the notice links the site contact address');
  assert.match(h, /<a class="btn btn-primary btn-big" href="\/teachers#start">Get a free school account<\/a>|href="\/trial"/, 'the sign-up button');
});

test('every claim about another product has a source on its own website, shown as a footnote; Not stated has none', async () => {
  const sites = Object.fromEntries(C.COMPETITORS.map(c => [c.id, new URL(c.site).hostname.replace(/^www\./, '')]));
  for (const [rowId, byComp] of Object.entries(C.CELLS)) {
    assert.ok(C.ROWS.some(r => r.id === rowId), `CELLS.${rowId} is a row`);
    for (const [compId, cell] of Object.entries(byComp)) {
      assert.ok(compId in sites, `${rowId}.${compId} is a product`);
      assert.ok(cell.s in C.STATUSES, `${rowId}.${compId}: status`);
      if (cell.s === 'notStated') continue;
      const src = cell.src; assert.ok(src, `${rowId}.${compId}: a ${cell.s} needs a source`);
      const u = new URL(src.url);
      assert.equal(u.protocol, 'https:');
      assert.ok(u.hostname === sites[compId] || u.hostname.endsWith(`.${sites[compId]}`), `${rowId}.${compId}: the source is on their own website`);
      assert.match(src.checked, /^\d{4}-\d{2}-\d{2}$/); assert.ok(src.checked <= C.COMPARE_CHECKED);
      assert.ok(src.quote && src.quote.trim().length >= 8, `${rowId}.${compId}: the exact supporting words`);
    }
  }
  const h = main((await get('/compare')).text);
  const body = h.slice(h.indexOf('<tbody>'), h.indexOf('</tbody>'));
  for (const tr of body.split('<tr ').slice(1)) {
    for (const td of tr.split('<td').slice(2)) {
      const claim = !td.includes('cmp-notStated');
      const fn = /<a href="#fn-(\d+)"/.exec(td);
      assert.equal(!!fn, claim, 'a footnote exactly when the cell claims something');
      if (fn) assert.match(h, new RegExp(`<li id="fn-${fn[1]}">`));
    }
  }
  // The footnote numbering itself: one number per source address, in table order.
  const fake = { games: { kahoot: { s: 'yes', src: { url: 'https://kahoot.com/a', checked: '2026-11-01', quote: 'supporting words' } } },
    build: { kahoot: { s: 'partial', src: { url: 'https://kahoot.com/a', checked: '2026-11-01', quote: 'more words here' } }, brainingcamp: { s: 'no', src: { url: 'https://www.brainingcamp.com/b', checked: '2026-11-01', quote: 'other words' } } } };
  const n = C.footnotes(fake);
  assert.deepEqual(n.list.map(f => [f.n, f.url]), [[1, 'https://kahoot.com/a'], [2, 'https://www.brainingcamp.com/b']]);
  assert.equal(n.numOf('build', 'kahoot'), 1); assert.equal(n.numOf('build', 'brainingcamp'), 2); assert.equal(n.numOf('games', 'classroomscreen'), 0);
  assert.deepEqual(C.cellOf('free', 'kahoot', {}), { s: 'notStated' });
});

test('the three names appear only on /compare: no other file the site serves, prompts or tests, and no locale string', async () => {
  const ALLOWED = new Set(['server/routes/compare.js', 'tests/unit/compare.test.js']);
  const TEXT = /\.(js|mjs|cjs|json|html|css|txt|md|svg|vtt|yaml|yml|csv|py|sh)$/i;
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean);
  const scanned = files.filter(f => !f.startsWith('docs/') && TEXT.test(f) && !ALLOWED.has(f));
  assert.ok(scanned.some(f => f.startsWith('server/views/')) && scanned.some(f => f.startsWith('public/')) && scanned.some(f => f.startsWith('server/i18n/locales/')));
  const leaks = [];
  for (const f of scanned) {
    const p = path.join(ROOT, f); let st; try { st = fs.statSync(p); } catch { continue; }
    if (!st.isFile() || st.size > 8e6) continue;
    if (NAMES.test(fs.readFileSync(p, 'utf8'))) leaks.push(f);
  }
  assert.deepEqual(leaks, [], 'the product names are only in routes/compare.js (docs/decisions.md: the one-page exception)');
  // The pages around it never name them either.
  for (const p of ['/teachers', '/research', '/compliance', '/safety', '/privacy', '/parents', '/learn']) {
    const r = await get(p); assert.equal(r.status, 200, p); assert.doesNotMatch(r.text, NAMES, p);
  }
});

test('/teachers links to /compare once, calmly, and the link names no product', async () => {
  const h = main((await get('/teachers')).text);
  assert.equal((h.match(/href="\/compare"/g) || []).length, 1);
  assert.match(h, /<p class="lp-research lp-compare">.*<a href="\/compare">How Oomba compares with other classroom tools<\/a><\/p>/);
  const es = main((await get('/es/teachers')).text);
  assert.ok(es.includes('href="/es/compare"'));
});

test('no prices, no em dashes, US spelling: the page in every language and its strings', async () => {
  for (const c of CODES) {
    const seg = c === 'en' ? '' : `/${c.toLowerCase()}`;
    const r = await get(`${seg}/compare`); if (r.status !== 200) continue;   // en-GB has no address of its own
    const words = text(main(r.text));
    assert.doesNotMatch(words, PRICE, `${seg}/compare: no prices`);
    assert.doesNotMatch(words, /—/, `${seg}/compare: no em dashes`);
  }
  const src = fs.readFileSync(path.join(ROOT, 'server/routes/compare.js'), 'utf8');
  assert.doesNotMatch(src, /—/);
  assert.doesNotMatch(src.replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, ''), PRICE);
  for (const c of CODES) {
    const loc = loadLocale(c) || {};
    for (const k of compareKeys) if (loc[k]) { assert.doesNotMatch(loc[k], /—/, `${c} ${k}`); assert.doesNotMatch(loc[k], NAMES, `${c} ${k}`); }
  }
  const enText = compareKeys.map(k => en[k]).join('\n');
  assert.doesNotMatch(enText, /\b(colour|labell|centre|customis|organis|recognis|favourite|maths|grey|programme)\b/i, 'US spelling');
  assert.doesNotMatch(enText, /K-12|K-9/, 'grades K-8');
  // Nothing disparaging: the page states what Oomba has; the others' cells are only their statuses.
  assert.doesNotMatch(enText, /\b(better than|worse|unlike|lacks?|fails?|outdated|clunky|only Oomba)\b/i);
});

test('i18n: every language has every compare string (en-GB only where the spelling differs), with valid placeholders', () => {
  const enAll = loadLocale('en');
  for (const c of CODES.filter(c => c !== 'en')) {
    const loc = loadLocale(c); const res = checkLocale(c, enAll, loc);
    assert.deepEqual(res.extra.filter(k => k.startsWith('compare.')), [], c);
    assert.deepEqual(res.placeholderErrors.filter(e => e.startsWith('compare.')), [], c);
    assert.deepEqual(res.parseErrors.filter(e => e.startsWith('compare.')), [], c);
    if (c === 'en-GB') {
      for (const k of compareKeys) if (loc[k]) assert.equal(loc[k], enAll[k].replace(/\bmath\b/g, 'maths'), k);
      continue;
    }
    assert.deepEqual(res.missing.filter(k => k.startsWith('compare.')), [], `${c}: every compare string`);
  }
});
