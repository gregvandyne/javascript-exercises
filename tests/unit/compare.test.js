// /compare, "How Oomba compares" (routes/compare.js; docs/decisions.md "Comparison page: the one page that names other
// products"): the page renders and is indexable in every language, its table is real table markup with text labels,
// every claim about another product has a source footnote to that product's own website, the three product names
// appear nowhere else the site serves, prompts or tests, no prices, no em dashes, and its strings pass the i18n check.
// The grammar section (Grammar Lab beside NoRedInk) and the homepage's sixth name appear only while Grammar Lab is open
// to every visitor (compare.js grammarCompareOn).
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
const { config } = await import('../../server/config.js');

seed({ quiet: true });
const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => resetLimits());
const get = async p => { const r = await fetch(base + p, { redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
const main = h => h.slice(h.indexOf('<main'), h.indexOf('<footer'));
const text = h => h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const NAMES = /kahoot|classroomscreen|brainingcamp|noredink/i;
/** The homepage's five (routes/landing.js NAMED): /compare's three plus two it only names. */
const HOME_NAMES = ['Kahoot!', 'Classroomscreen', 'Blooket', 'Brainingcamp', 'Typing.com'];
const ANY_NAME = /kahoot|classroomscreen|brainingcamp|blooket|typing\.com|noredink/i;
/** With Grammar Lab open to every visitor, the homepage's sixth (routes/compare.js GRAMMAR_RIVAL). */
const HOME_NAMES_OPEN = [...HOME_NAMES, 'NoRedInk'];
/** Run fn with Grammar Lab's flag set (on: GRAMMAR_LAB; users: GRAMMAR_LAB_USERS), then put it back as it was. */
async function withGrammarLab(on, users, fn) {
  const was = [config.grammarLab, config.grammarLabUsers];
  config.grammarLab = on; config.grammarLabUsers = users;
  try { return await fn(); } finally { [config.grammarLab, config.grammarLabUsers] = was; }
}
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
    const rest = main(p.text).replace(/<(th|span|b)[^>]*lang="en" dir="ltr">(?:Kahoot!|Classroomscreen|Brainingcamp|NoRedInk)<\/\1>/g, '').replace(/<q( class="cmp-quote")? lang="en" dir="ltr">[^<]*<\/q>/g, '');
    assert.doesNotMatch(rest, /lang="en"/, `/${seg}/compare: every string translated`);
  }
});

// The table's rows: each need's row and, right after it, its detail row.
const tbody = h => h.slice(h.indexOf('<tbody>'), h.indexOf('</tbody>'));
const tableRows = h => tbody(h).split('<tr ').slice(1).filter(x => x.startsWith('id="row-'));
const detailOf = (h, id) => { const m = new RegExp(`<tr class="cmp-det" id="det-${id}" hidden><td colspan="5">([\\s\\S]*?)</td></tr>`).exec(h); return m && m[1]; };

test('the table: one word per cell (plus the gate tag); each need opens its detail row, closed by default; one notice line', async () => {
  const h = main((await get('/compare')).text);
  assert.match(h, /<table class="cmp-table">\s*<caption>/);
  const heads = [...h.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(m => m[1]);
  assert.deepEqual(heads, ['Classroom need', 'Oomba', 'Kahoot!', 'Classroomscreen', 'Brainingcamp']);
  assert.doesNotMatch(h, /cmp-i\b|cmp-pop|<sup|cmp-fn/, 'no "i" buttons, notes or footnote numbers');
  const trs = tableRows(h);
  assert.equal(trs.length, rows().length);
  assert.equal((tbody(h).match(/<tr class="cmp-det"/g) || []).length, rows().length, 'a detail row for every need');
  const gated = new Set(C.ROWS.filter(r => r.gated).map(r => r.id));
  for (const tr of trs) {
    const id = /id="row-([a-zA-Z]+)"/.exec(tr)[1];
    // The need's label is the toggle: a real button, closed, controlling the detail row right under it.
    assert.match(tr, new RegExp(`<th scope="row" class="cmp-need"><button type="button" class="cmp-tog" aria-expanded="false" aria-controls="det-${id}">(<svg[^>]*aria-hidden="true"[\\s\\S]*?</svg>|<img[^>]*aria-hidden="true"[^>]*>)<span>[^<]+</span></button></th>`), `${id}: the label is the toggle button`);
    assert.match(tbody(h), new RegExp(`<tr id="row-${id}" class="cmp-row">(?:(?!<tr )[\\s\\S])*?</tr>\\s*<tr class="cmp-det" id="det-${id}" hidden>`), `${id}: its detail row follows, hidden`);
    const cells = tr.split('</tr>')[0].split('<td').slice(1);
    assert.equal(cells.length, 4, 'Oomba and three products');
    cells.forEach((td, i) => {
      assert.match(td, /<span class="cmp-mark cmp-(yes|partial|no|notStated)">(?:<svg[^>]*aria-hidden="true"[\s\S]*?<\/svg>|<img[^>]*aria-hidden="true"[^>]*>)?<b>(Yes|Partial|No|Not stated)<\/b>/, 'a word, never color or an icon alone');
      const visible = text(`<td${td}`).trim();
      assert.equal(visible, i === 0 ? (gated.has(id) ? 'Yes Teacher plan' : 'Yes') : { yes: 'Yes', partial: 'Partial', notStated: 'Not stated' }[C.cellOf(id, C.COMPETITORS[i - 1].id).s], `${id}: only the word (and the tag)`);
    });
    // Oomba's detail is the first line of the detail row.
    const det = detailOf(h, id); assert.ok(det, id);
    assert.match(text(det).replace(/ :/g, ":").trim(), /^Oomba: .{15,}/, `${id}: Oomba's detail`);
  }
  assert.ok(text(h).includes('Not stated means we did not find it on their public website.'));
  assert.ok(h.includes('Teacher plan</span>'), 'the teaching tools say Teacher plan, as the homepage does, with paid plans on or off');
  assert.ok(!h.includes('In testing'));
  const line = /<p class="cmp-line" id="notice">([\s\S]*?)<\/p>/.exec(h)[1];
  assert.match(text(line).replace(/ ([.;])/g, '$1').trim(), /^Last checked November 22, 2026\. Kahoot!, Classroomscreen and Brainingcamp are trademarks of their owners; Oomba is not affiliated with them\. Tell us if something changed\.$/);
  assert.match(line, /<a href="mailto:[^"]+">Tell us if something changed<\/a>/, 'the notice links the site contact address');
  // Short: a one-sentence intro, three short lines, the sign-up button.
  const lead = /<p class="lead">([\s\S]*?)<\/p>/.exec(h)[1];
  assert.equal((lead.match(/\.(\s|$)/g) || []).length, 1, 'one sentence');
  const why = /<ul class="cmp-why">([\s\S]*?)<\/ul>/.exec(h)[1].split('<li').slice(1).map(x => text(`<li${x}`).trim());
  assert.equal(why.length, 3); for (const w of why) assert.ok(w.length <= 80, w);
  assert.match(h, /<a class="btn btn-primary btn-big" href="\/teachers#start">Create a teacher account<\/a>|href="\/trial"/, 'the sign-up button');
  assert.match((await get('/compare')).text, /<script type="module" src="\/js\/compare-rows\.js\?v=/);
  assert.ok(text(h).includes('Tap or click a row to see the details and sources.'));
});

test('every claim about another product has a source: in its row\'s detail and in the Sources, collapsed by default', async () => {
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
  for (const r of rows()) {
    const det = detailOf(h, r.id);
    for (const comp of C.COMPETITORS) {
      const cell = C.cellOf(r.id, comp.id);
      const line = new RegExp(`<li[^>]*><b lang="en" dir="ltr">${comp.name.replace('!', '\\!')}</b>([\\s\\S]*?)</li>`).exec(det);
      assert.ok(line, `${r.id}.${comp.id}: a line in the row's detail`);
      if (cell.s === 'notStated') { assert.equal(text(line[1]).trim(), ': Not stated on their site', `${r.id}.${comp.id}`); continue; }
      assert.ok(line[1].includes(`<q lang="en" dir="ltr">${esc(cell.src.quote)}</q>`), `${r.id}.${comp.id}: the quote in its row's detail`);
      assert.ok(line[1].includes(`href="${cell.src.url}"`) && text(line[1]).includes('Open their page'), `${r.id}.${comp.id}: the link to their page`);
      assert.ok(text(line[1]).includes('read on November 22, 2026'), `${r.id}.${comp.id}: the day it was read`);
    }
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

test('the names appear only on /compare and the homepage: no other file the site serves, prompts or tests, and no locale string', async () => {
  // The two exceptions (docs/decisions.md): /compare names its three products; the homepage at "/" (routes/landing.js,
  // NAMED) names exactly five, the three plus Blooket and Typing.com, as plain text with the trademark line.
  const ALLOWED = new Set(['server/routes/compare.js', 'server/routes/landing.js', 'tests/unit/compare.test.js', 'tests/unit/compare-browser.test.js']);
  const TEXT = /\.(js|mjs|cjs|json|html|css|txt|md|svg|vtt|yaml|yml|csv|py|sh)$/i;
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean);
  const scanned = files.filter(f => !f.startsWith('docs/') && TEXT.test(f) && !ALLOWED.has(f));
  assert.ok(scanned.some(f => f.startsWith('server/views/')) && scanned.some(f => f.startsWith('public/')) && scanned.some(f => f.startsWith('server/i18n/locales/')));
  const leaks = [];
  for (const f of scanned) {
    const p = path.join(ROOT, f); let st; try { st = fs.statSync(p); } catch { continue; }
    if (!st.isFile() || st.size > 8e6) continue;
    if (ANY_NAME.test(fs.readFileSync(p, 'utf8'))) leaks.push(f);
  }
  assert.deepEqual(leaks, [], 'the product names are only in routes/compare.js and routes/landing.js (docs/decisions.md: the two exceptions)');
  // routes/landing.js names exactly the five, in NAMED, and its three side-by-side cards are /compare's products.
  const L = await import('../../server/routes/landing.js');
  assert.deepEqual(L.NAMED, HOME_NAMES);
  assert.deepEqual(L.VERSUS.map(v => v.id), C.COMPETITORS.map(c => c.id));
  const src = fs.readFileSync(path.join(ROOT, 'server/routes/landing.js'), 'utf8');
  assert.deepEqual([...new Set(src.match(new RegExp(ANY_NAME.source, 'gi')).map(m => m.toLowerCase()))].sort(), ['blooket', 'brainingcamp', 'classroomscreen', 'kahoot', 'noredink', 'typing.com'],
    'routes/landing.js names no product beyond the five, and NoRedInk only as the grammar card\'s id and in comments');
  const code = src.replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, '');
  assert.equal((code.match(/Blooket|Typing\.com/g) || []).length, 2, 'in the code, Blooket and Typing.com are only in NAMED');
  assert.ok(!/NoRedInk/.test(code), 'routes/landing.js takes the sixth name from compare.js (GRAMMAR_RIVAL), never spelled out in code');
  // The pages around them never name any of the five.
  for (const p of ['/teachers', '/research', '/compliance', '/safety', '/privacy', '/parents', '/learn', '/plans', '/teachers/live', '/search']) {
    const r = await get(p); if (r.status !== 200) continue; assert.doesNotMatch(r.text, ANY_NAME, p);
  }
});

test('the homepage names exactly the five products, with the trademark line, and quotes only what /compare quotes', async () => {
  process.env.LANDING_AT_ROOT = '1';
  try {
    const h = (await get('/')).text;
    const found = [...new Set([...text(h).matchAll(new RegExp(ANY_NAME.source, 'gi'))].map(m => m[0].toLowerCase()))].sort();
    assert.deepEqual(found, ['blooket', 'brainingcamp', 'classroomscreen', 'kahoot', 'typing.com'], 'Grammar Lab closed: the five');
    assert.doesNotMatch(h, /grammar-lab|Grammar Lab/, 'Grammar Lab closed: the homepage never mentions it');
    assert.ok(text(h).includes('One subscription instead of five: Kahoot! Classroomscreen Blooket Brainingcamp Typing.com'), 'the strip');
    assert.ok(text(h).includes('Kahoot!, Classroomscreen, Blooket, Brainingcamp and Typing.com are trademarks of their owners. Oomba Academy is not affiliated with them.'), 'the trademark line');
    assert.doesNotMatch(h, /<img[^>]*(kahoot|classroomscreen|blooket|brainingcamp|typing\.com)/i, 'no logos');
    // No amounts (the words "prices" and "per teacher per year" may appear, never a figure): "Pay for one plan instead of five" and a link to /compare.
    assert.doesNotMatch(text(main(h)), /[$€£¥]\s?\d|\d\s?(?:USD|EUR|GBP|dollars?)\b|\/(?:month|mo|year|yr)\b/i, 'no amounts');
    assert.match(h, /Pay for one plan instead of five\. <a href="\/compare">See how we compare<\/a>/);
    // The side-by-side cards: each quote is one /compare shows for that product, with its address and the day it was read.
    const cards = [...h.matchAll(/<article class="lp-card lp-vs-card">([\s\S]*?)<\/article>/g)].map(m => m[1]);
    assert.equal(cards.length, 3);
    const esc = s => s.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const allQuotes = Object.values(C.CELLS).flatMap(r => Object.entries(r)).filter(([, c]) => c.src);
    cards.forEach((card, i) => {
      const comp = C.COMPETITORS[i];
      const quotes = [...card.matchAll(/<q lang="en" dir="ltr">([^<]*)<\/q> <a href="([^"]+)"/g)];
      assert.ok(quotes.length >= 2, comp.id);
      for (const [, q, url] of quotes) assert.ok(allQuotes.some(([id, c]) => id === comp.id && esc(c.src.quote) === q && c.src.url === url), `${comp.id}: "${q}" is a /compare quote with its own address`);
      assert.match(text(card), /Source: [a-z.]+, read on November 22, 2026/);
    });
    // Every other page stays free of the names (spot check of the app's signed-out pages).
    for (const p of ['/es/teachers', '/read']) { const r = await get(p); if (r.status === 200) assert.doesNotMatch(r.text, ANY_NAME, p); }
  } finally { process.env.LANDING_AT_ROOT = '0'; }
});

test('Grammar Lab closed, or open to testers only: no NoRedInk and no Grammar Lab on /compare or "/"', async () => {
  process.env.LANDING_AT_ROOT = '1';
  try {
    for (const [on, users] of [[false, []], [false, ['*']], [true, []], [true, ['someone']]]) {
      await withGrammarLab(on, users, async () => {
        assert.equal(C.grammarCompareOn(), false, `${on} ${users}`);
        const cmp = (await get('/compare')).text;
        assert.doesNotMatch(cmp, /noredink|grammar-lab|Grammar Lab|id="grammar"/i, `/compare with ${on} ${users}`);
        const home = (await get('/')).text;
        assert.doesNotMatch(home, /noredink|grammar-lab|Grammar Lab/i, `"/" with ${on} ${users}`);
        assert.equal((home.match(/<article class="lp-card lp-vs-card">/g) || []).length, 3);
      });
    }
  } finally { process.env.LANDING_AT_ROOT = '0'; }
});

test('Grammar Lab open to every visitor: /compare sets Grammar Lab beside NoRedInk, sourced; "/" names six with a fourth card', async () => {
  process.env.LANDING_AT_ROOT = '1';
  try {
    await withGrammarLab(true, ['*'], async () => {
      assert.equal(C.grammarCompareOn(), true);
      const facts = C.grammarFacts();
      assert.deepEqual(facts.bands, ['K-2', '3-5', '6-8', '9-12']);
      assert.ok(facts.topics > 100 && facts.units > 20 && facts.rooms > 0, JSON.stringify(facts));
      // /compare: the section, its rows that open, Grammar Lab's own Yes and No, NoRedInk's sourced cells.
      const page = (await get('/compare')).text; const h = main(page);
      const sec = /<section class="lp-sec" id="grammar"[\s\S]*?<\/section>/.exec(h);
      assert.ok(sec, 'the grammar section');
      const heads = [...sec[0].matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(m => m[1]);
      assert.deepEqual(heads, ['Classroom need', 'Grammar Lab', 'NoRedInk']);
      assert.ok(text(sec[0]).includes(`Grammar Lab is Oomba's grammar course for grades K-2, 3-5, 6-8 and 9-12: ${facts.topics} topics in ${facts.units} units.`));
      for (const r of C.GRAMMAR_ROWS) {
        const row = new RegExp(`<tr id="row-gl-${r.id}" class="cmp-row">([\\s\\S]*?)</tr>`).exec(sec[0]);
        assert.ok(row, r.id);
        const cells = row[1].split('<td').slice(1).map(x => text(`<td${x}`).trim());
        const cell = C.cellOf(r.id, 'noredink', C.GRAMMAR_CELLS);
        assert.deepEqual(cells, [{ yes: 'Yes', no: 'No' }[r.us], { yes: 'Yes', partial: 'Partial', notStated: 'Not stated' }[cell.s]], r.id);
        const det = new RegExp(`<tr class="cmp-det" id="det-gl-${r.id}" hidden><td colspan="3">([\\s\\S]*?)</td></tr>`).exec(sec[0]);
        assert.ok(det, `${r.id}: its detail row`);
        if (cell.s === 'notStated') { assert.ok(text(det[1]).includes('Not stated on their site')); continue; }
        assert.ok(det[1].includes(`href="${cell.src.url}"`), `${r.id}: the link`);
        assert.ok(text(det[1]).includes('read on November 27, 2026'), `${r.id}: the day`);
      }
      // Honest about what Grammar Lab does not do.
      assert.ok(text(sec[0]).includes("By design, Oomba's AI never reads student work"));
      assert.ok(C.GRAMMAR_ROWS.filter(r => r.us === 'no').map(r => r.id).includes('essays'));
      // Every NoRedInk source is on its own website, and listed in the Sources.
      for (const [rowId, byComp] of Object.entries(C.GRAMMAR_CELLS)) {
        assert.ok(C.GRAMMAR_ROWS.some(r => r.id === rowId), rowId);
        const cell = byComp.noredink; const u = new URL(cell.src.url);
        assert.ok(u.protocol === 'https:' && (u.hostname === 'www.noredink.com' || u.hostname === 'noredink.com'), rowId);
        assert.ok(cell.src.quote.length >= 8 && !/—/.test(cell.src.quote), rowId);
        assert.equal(cell.src.checked, C.GRAMMAR_CHECKED);
      }
      const srcs = /<details class="panel cmp-src" id="sources">([\s\S]*?)<\/details>/.exec(h)[1];
      const glList = C.footnotes(C.GRAMMAR_CELLS, C.GRAMMAR_ROWS, [C.GRAMMAR_RIVAL]).list;
      assert.match(srcs, new RegExp(`\\((${C.footnotes(C.CELLS, rows()).list.length + glList.length})\\)</summary>`));
      for (const f of glList) assert.ok(srcs.includes(`href="${f.url}"`), f.url);
      // The notice names the four; no prices; the link goes to a page an anonymous visitor can open.
      assert.match(text(/<p class="cmp-line" id="notice">([\s\S]*?)<\/p>/.exec(h)[1]), /Kahoot!, Classroomscreen, Brainingcamp and NoRedInk are trademarks of their owners/);
      assert.doesNotMatch(text(h), PRICE);
      assert.doesNotMatch(text(h), /—/);
      assert.match(sec[0], /href="\/courses\/grammar-lab"/);
      assert.equal((await get('/courses/grammar-lab')).status, 200, 'the link opens for a visitor with no session');
      for (const c of CODES.filter(c => !c.startsWith('en'))) {
        const p = await get(`/${c.toLowerCase()}/compare`);
        assert.match(p.text, /id="grammar"/, c);
      }
      // "/": six names (the strip keeps the five), the trademark line with six, a fourth card quoting only /compare.
      const home = (await get('/')).text;
      const found = [...new Set([...text(home).matchAll(new RegExp(ANY_NAME.source, 'gi'))].map(m => m[0].toLowerCase()))].sort();
      assert.deepEqual(found, ['blooket', 'brainingcamp', 'classroomscreen', 'kahoot', 'noredink', 'typing.com'], 'the six');
      assert.ok(text(home).includes('One subscription instead of five: Kahoot! Classroomscreen Blooket Brainingcamp Typing.com Pay'), 'the strip keeps the five');
      assert.ok(text(home).includes('Kahoot!, Classroomscreen, Blooket, Brainingcamp, Typing.com and NoRedInk are trademarks of their owners.'), 'the trademark line');
      const cards = [...home.matchAll(/<article class="lp-card lp-vs-card">([\s\S]*?)<\/article>/g)].map(m => m[1]);
      assert.equal(cards.length, 4);
      const card = cards[3];
      assert.match(card, /<h3 lang="en" dir="ltr">NoRedInk<\/h3>/);
      const esc = s => s.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const quotes = [...card.matchAll(/<q lang="en" dir="ltr">([^<]*)<\/q> <a href="([^"]+)"/g)];
      assert.ok(quotes.length >= 2);
      const all = Object.values(C.GRAMMAR_CELLS).map(r => r.noredink.src);
      for (const [, q, url] of quotes) assert.ok(all.some(s => esc(s.quote) === q && s.url === url), `"${q}" is a /compare quote`);
      assert.match(text(card), /What Oomba's Grammar Lab covers/);
      assert.match(text(card), new RegExp(`${facts.topics} grammar topics for kindergarten to grade 12`));
      assert.match(text(card), /No essay writing or writing feedback/);
      assert.match(text(card), /Source: noredink\.com, read on November 27, 2026/);
      assert.doesNotMatch(text(main(home)), /[$€£¥]\s?\d|\d\s?(?:USD|EUR|GBP|dollars?)\b|\/(?:month|mo|year|yr)\b/i, 'no amounts');
      // Every other page still names none, Grammar Lab's own included.
      for (const p of ['/teachers', '/research', '/plans', '/learn', '/courses/grammar-lab', '/es/teachers']) {
        const r = await get(p); if (r.status === 200) assert.doesNotMatch(r.text, ANY_NAME, p);
      }
    });
  } finally { process.env.LANDING_AT_ROOT = '0'; }
});

test('/teachers links to /compare once, calmly, and the link names no product', async () => {
  const h = main((await get('/teachers')).text);
  assert.equal((h.match(/href="\/compare"/g) || []).length, 1);
  // In the folded "Ways to use it" panel, next to the research link (the cleanup moved it there from a line of its own).
  assert.match(h, /<section class="lp-card lp-foldcard" id="uses"[\s\S]*?<a href="\/research">[^<]+<\/a> · <a href="\/compare">How Oomba compares with other classroom tools<\/a><\/p>/);
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
