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
    // Only the product names (never translated) and the quoted words from their websites are marked English.
    const rest = main(p.text).replace(/<(th|span)[^>]*lang="en" dir="ltr">(?:Kahoot!|Classroomscreen|Brainingcamp)<\/\1>/g, '').replace(/<q( class="cmp-quote")? lang="en" dir="ltr">[^<]*<\/q>/g, '');
    assert.doesNotMatch(rest, /lang="en"/, `/${seg}/compare: every string translated`);
  }
});

// One <td>: its visible text (the "i" note left out), and its note, if it has one.
const cellParts = td => {
  const pop = /<div class="cmp-pop" id="([^"]+)" hidden>([\s\S]*?)<\/div>/.exec(td);
  const btn = /<button type="button" class="cmp-i" aria-expanded="false" aria-controls="([^"]+)" aria-label="([^"]+)">/.exec(td);
  return { visible: text(`<td${td}`.replace(/<div class="cmp-pop"[\s\S]*?<\/div>/, '').replace(/<button[\s\S]*?<\/button>/, '')).trim(), pop: pop && { id: pop[1], html: pop[2] }, btn: btn && { controls: btn[1], label: btn[2] } };
};
const tableRows = h => h.slice(h.indexOf('<tbody>'), h.indexOf('</tbody>')).split('<tr ').slice(1);

test('the table: real table markup, one word per cell (plus the gate tag), details behind an accessible "i", legend and one notice line', async () => {
  const h = main((await get('/compare')).text);
  assert.match(h, /<table class="cmp-table">\s*<caption>/);
  const heads = [...h.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(m => m[1]);
  assert.deepEqual(heads, ['Classroom need', 'Oomba', 'Kahoot!', 'Classroomscreen', 'Brainingcamp']);
  const trs = tableRows(h);
  assert.equal(trs.length, rows().length);
  const gated = new Set(C.ROWS.filter(r => r.gated).map(r => r.id));
  for (const tr of trs) {
    const id = /id="row-([a-zA-Z]+)"/.exec(tr)[1];
    assert.equal((tr.match(/<th scope="row"/g) || []).length, 1);
    assert.doesNotMatch(tr, /<sup|cmp-fn|cmp-detail/, `${id}: no footnote numbers or long text in the table`);
    const tds = tr.split('<td').slice(1);
    assert.equal(tds.length, 4, 'Oomba and three products');
    for (const td of tds) {
      assert.match(td, /<span class="cmp-mark cmp-(yes|partial|no|notStated)">(?:<svg[^>]*aria-hidden="true"[\s\S]*?<\/svg>|<img[^>]*aria-hidden="true"[^>]*>)?<b>(Yes|Partial|No|Not stated)<\/b>/, 'a word, never color or an icon alone');
      const p = cellParts(td);
      assert.match(p.visible, /^(Yes|Partial|No|Not stated)( In testing)?$/, `${id}: only the word (and the tag): "${p.visible}"`);
      if (p.btn) { assert.ok(p.pop && p.btn.controls === p.pop.id, `${id}: the button controls its note`); assert.match(p.btn.label, /^More about .+: .+/); assert.match(td, /class="cmp-i"[^>]*>(<svg|<img)[^>]*aria-hidden="true"/, 'the icon is decorative; the button has its name'); }
    }
    // Oomba: Yes, the tag on the teaching tools (plans are off in unit tests: "In testing"), its detail behind the "i".
    const us = cellParts(tds[0]);
    assert.equal(us.visible, gated.has(id) ? 'Yes In testing' : 'Yes', id);
    assert.ok(us.btn && us.pop && text(us.pop.html).trim().length > 10, `${id}: Oomba's detail is behind its "i"`);
  }
  assert.ok(text(h).includes('Not stated means we did not find it on their public website.'));
  assert.ok(!h.includes('Teacher plan</span>'));
  const line = /<p class="cmp-line" id="notice">([\s\S]*?)<\/p>/.exec(h)[1];
  assert.match(text(line).replace(/ ([.;])/g, '$1').trim(), /^Last checked November 22, 2026\. Kahoot!, Classroomscreen and Brainingcamp are trademarks of their owners; Oomba is not affiliated with them\. Tell us if something changed\.$/);
  assert.match(line, /<a href="mailto:[^"]+">Tell us if something changed<\/a>/, 'the notice links the site contact address');
  // Short: a one-sentence intro, three short lines, the sign-up button.
  const lead = /<p class="lead">([\s\S]*?)<\/p>/.exec(h)[1];
  assert.equal((lead.match(/\.(\s|$)/g) || []).length, 1, 'one sentence');
  const why = /<ul class="cmp-why">([\s\S]*?)<\/ul>/.exec(h)[1].split('<li').slice(1).map(x => text(`<li${x}`).trim());
  assert.equal(why.length, 3); for (const w of why) assert.ok(w.length <= 80, w);
  assert.match(h, /<a class="btn btn-primary btn-big" href="\/teachers#start">Get a free school account<\/a>|href="\/trial"/, 'the sign-up button');
  assert.match((await get('/compare')).text, /<script type="module" src="\/js\/compare-info\.js\?v=/);
});

test('every claim about another product has a source: behind its cell\'s "i" and in the Sources, collapsed by default', async () => {
  assert.ok(Object.values(C.CELLS).some(r => Object.values(r).some(c => c.s !== 'notStated')), 'the researched cells are there');
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
  const esc = s => s.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  for (const tr of tableRows(h)) {
    const id = /id="row-([a-zA-Z]+)"/.exec(tr)[1];
    tr.split('<td').slice(2).forEach((td, i) => {
      const comp = C.COMPETITORS[i]; const cell = C.cellOf(id, comp.id); const p = cellParts(td);
      if (cell.s === 'notStated') { assert.ok(!p.btn, `${id}.${comp.id}: Not stated makes no claim and has no "i"`); return; }
      assert.ok(p.btn && p.pop, `${id}.${comp.id}: the claim's source is reachable from its cell`);
      assert.ok(p.pop.html.includes(`<q lang="en" dir="ltr">${esc(cell.src.quote)}</q>`), `${id}.${comp.id}: the quote`);
      assert.ok(p.pop.html.includes(`href="${cell.src.url}"`), `${id}.${comp.id}: the link to their page`);
      assert.ok(text(p.pop.html).includes('November 22, 2026'), `${id}.${comp.id}: the day it was read`);
    });
  }
  // The Sources: a native <details>, collapsed by default, with every source's words, address and day.
  const det = /<details class="panel cmp-src" id="sources">([\s\S]*?)<\/details>/.exec(h);
  assert.ok(det, 'Sources is a <details> with no open attribute: collapsed by default');
  const list = C.footnotes(C.CELLS, rows()).list;
  assert.match(det[1], new RegExp(`<summary>Sources and how we checked \\(${list.length}\\)</summary>`));
  for (const f of list) assert.ok(det[1].includes(`<q class="cmp-quote" lang="en" dir="ltr">${esc(f.quote)}</q>`) && det[1].includes(`href="${f.url}"`), `source ${f.n} in the Sources`);
  // The sources list itself: one entry per source (address and words), in table order.
  const fake = { games: { kahoot: { s: 'yes', src: { url: 'https://kahoot.com/a', checked: '2026-11-01', quote: 'supporting words' } } },
    build: { kahoot: { s: 'partial', src: { url: 'https://kahoot.com/a', checked: '2026-11-01', quote: 'more words here' } }, brainingcamp: { s: 'no', src: { url: 'https://www.brainingcamp.com/b', checked: '2026-11-01', quote: 'other words' } } } };
  const n = C.footnotes(fake);
  assert.deepEqual(n.list.map(f => [f.n, f.url]), [[1, 'https://kahoot.com/a'], [2, 'https://kahoot.com/a'], [3, 'https://www.brainingcamp.com/b']]);
  assert.equal(n.numOf('games', 'kahoot'), 1); assert.equal(n.numOf('build', 'kahoot'), 2); assert.equal(n.numOf('build', 'brainingcamp'), 3); assert.equal(n.numOf('games', 'classroomscreen'), 0);
  assert.equal(C.footnotes({ games: fake.games, build: { kahoot: fake.games.kahoot } }).list.length, 1, 'the same source twice is one entry');
  assert.deepEqual(C.cellOf('free', 'kahoot', {}), { s: 'notStated' });
});

test('the three names appear only on /compare: no other file the site serves, prompts or tests, and no locale string', async () => {
  const ALLOWED = new Set(['server/routes/compare.js', 'tests/unit/compare.test.js', 'tests/unit/compare-browser.test.js']);
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
