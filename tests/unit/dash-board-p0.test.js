// Class Board parity, P0 (docs/decisions.md "Class Board: PDF, link tile and stickers"): the PDF widget, the link tile
// and stickers (back after their 16 Nov 2026 removal). The registry, the link tile's address check (server and browser
// agree), who can upload and fetch a PDF (its owner only) and the size cap, the sticker library as served (every
// sticker of the supplied index, the index's own words, files that exist) and its search, and stickers saved with a
// layout (not counted in the 24 widgets, at most MAX_STICKERS, an unknown sticker dropped).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-dashp0-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const W = await import('../../public/js/dash-widgets.js');
const ST = await import('../../public/js/dash-stickers.js');
const LK = await import('../../public/js/dash-link.js');
const PD = await import('../../public/js/dash-pdf.js');
const { createApp } = await import('../../server/app.js');
const { tFor } = await import('../../server/i18n/index.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body, raw, type } = {}) => {
  const headers = { ...(who ? { cookie: cookieFor(who.id) } : {}) };
  if (raw !== undefined) headers['content-type'] = type || 'application/pdf';
  else if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const buf = Buffer.from(await r.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString()); } catch { /* not json */ }
  return { status: r.status, buf, text: buf.toString(), json, headers: r.headers };
};
const POST = (body = {}) => ({ method: 'POST', body });

const boss = createUser({ username: 'DashP0Boss', password: 'secret123', role: 'admin' });
let worlds = 0;
function world() {
  const k = ++worlds;
  const oak = S.createSchool(boss, { name: `P0 Oak ${k}` }).school;
  const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user.id);
  const T2 = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tom Other', role: 'teacher' }).user.id);
  const SA = createUser({ username: `P0SA${k}`, password: 'secret123' }); S.addMember(boss, oak.id, SA.id, 'admin');
  const A = S.createClass(T, oak.id, { name: '4A' }).class, B = S.createClass(T2, oak.id, { name: '4B' }).class;
  const a1 = getUser(S.createSchoolAccount(T, oak.id, { rosterName: 'Ada Apple' }).user.id); S.addToClass(boss, A.id, a1.id);
  const stranger = createUser({ username: `P0Str${k}`, password: 'secret123' });
  return { oak, T, T2, SA, A, B, a1, stranger };
}
async function layout(w, widgets) {
  await as(w.T)(`/class/${w.A.id}/dashboard`);
  const l = D.layoutsOf(w.A.id, w.T.id)[0];
  const r = await as(w.T)(`/api/dash/${w.A.id}/layouts/${l.id}`, POST({ widgets }));
  assert.equal(r.status, 200, r.text);
  return r.json.layout;
}
/** A small real PDF (two pages), written by hand. */
function samplePdf() {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

// ---------------------------------------------------------------- the registry
test('registry: PDF, link tile and stickers; teacher only, never pinned or pushed; words in every language', () => {
  for (const id of ['pdf', 'link', 'stickers']) {
    const x = D.widgetType(id);
    assert.ok(x, id); assert.equal(x.who, 'teacher', id); assert.equal(D.canPin(x), false, id); assert.ok(D.TEACHER_ONLY.includes(id), id); assert.ok(!x.send, id);
  }
  assert.equal(typeof W.RENDER.pdf, 'function'); assert.equal(typeof W.RENDER.link, 'function');
  assert.equal(D.widgetType('stickers').free, true);
  const reg = D.registryFor(tFor('en'), 'teacher');
  assert.equal(reg.types.find(x => x.id === 'stickers').free, true);
  assert.equal(reg.types.find(x => x.id === 'stickers').words.search, 'Search stickers');
  assert.equal(reg.types.find(x => x.id === 'stickers').words['th_maths-stem'], 'Math and STEM', 'US spelling on screen');
  for (const x of reg.types.filter(y => ['pdf', 'link', 'stickers'].includes(y.id))) assert.equal(x.add, true);
  assert.ok(!D.registryFor(tFor('en'), 'student').types.find(x => x.id === 'stickers').add, 'students never add stickers');
  // Every new string, in every locale (en-GB only overrides what UK English spells differently, as everywhere else).
  const en = JSON.parse(fs.readFileSync('server/i18n/locales/en.json', 'utf8')).dash;
  const keysOf = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keysOf(v, `${p}${k}.`) : [`${p}${k}`]));
  const want = ['pdf', 'link', 'stickers'].flatMap(id => keysOf(en.w[id], `${id}.`));
  for (const code of ['it', 'es', 'fr', 'de', 'nl', 'pt', 'ru', 'he', 'ja', 'zh-Hant', 'ar']) {
    const l = JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8')).dash;
    assert.deepEqual(['pdf', 'link', 'stickers'].flatMap(id => keysOf(l.w[id], `${id}.`)).sort(), [...want].sort(), code);
    assert.ok(l.errors.pdf_tooBig && l.errors.pdf_badType, code);
  }
  assert.equal(JSON.parse(fs.readFileSync('server/i18n/locales/en-GB.json', 'utf8')).dash.w.stickers.favorites, 'Favourites');
  // No em dashes and US spelling in the English copy.
  const valuesOf = o => Object.values(o).flatMap(v => (v && typeof v === 'object' ? valuesOf(v) : [v]));
  const copy = valuesOf([en.w.pdf, en.w.link, en.w.stickers, en.errors.pdf_tooBig, en.errors.pdf_badType]).join('\n');
  assert.doesNotMatch(copy, /\u2014/);
  assert.doesNotMatch(copy, /favourite|colour|maths\b|centre/i);
  for (const code of ['en', 'it', 'es', 'fr', 'de', 'nl', 'pt', 'ru', 'he', 'ja', 'zh-Hant', 'ar', 'en-GB']) {
    const l = JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8')).dash;
    assert.doesNotMatch(JSON.stringify([l.w.pdf, l.w.link, l.w.stickers]), /\u2014/, code);
  }
});

// ---------------------------------------------------------------- the link tile
test('link tile: http and https only (never javascript:, data: or a password), checked the same on the server and in the browser', () => {
  const ok = { 'https://example.org/page': 'https://example.org/page', 'http://example.org': 'http://example.org/', 'example.org/x?y=1': 'https://example.org/x?y=1',
    'www.mathplayground.com': 'https://www.mathplayground.com/', 'HTTPS://Example.ORG': 'https://example.org/', 'example.org:8080/a': 'https://example.org:8080/a',
    'http://localhost:3000/': 'http://localhost:3000/' };
  for (const [v, want] of Object.entries(ok)) { assert.equal(D.cleanLink(v), want, v); assert.equal(LK.linkUrl(v), want, v); }
  const bad = ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', 'file:///etc/passwd', 'ftp://example.org',
    'mailto:a@b.c', 'https://user:pw@example.org', 'https://exa mple.org', 'https://example.org/\u0000', '', '   ', 'http://', `https://example.org/${'a'.repeat(500)}`,
    'blob:https://example.org/x', 'about:blank', 'https://-bad.example'];
  for (const v of bad) { assert.equal(D.cleanLink(v), null, v); assert.equal(LK.linkUrl(v), null, v); }
  const c = s => D.cleanSettings(D.widgetType('link'), s);
  assert.deepEqual(c({ title: '  Fraction games  ', url: 'javascript:alert(1)' }), { title: 'Fraction games', url: '' });
  assert.deepEqual(c({ title: 'x'.repeat(80), url: 'example.org' }), { title: 'x'.repeat(60), url: 'https://example.org/' });
  assert.equal(LK.linkHost('https://www.example.org/a'), 'example.org');
  // The tile opens a new tab and tells the site nothing about the board.
  const src = fs.readFileSync('public/js/dash-link.js', 'utf8');
  assert.match(src, /a\.target = '_blank'; a\.rel = 'noopener noreferrer'/);
  assert.doesNotMatch(src, /innerHTML/);
});

test('link tile: a bad address sent in a layout is never stored', async () => {
  const w = world();
  const l = await layout(w, [{ id: 'lk1', type: 'link', x: 0, y: 0, w: 3, h: 2, s: { title: 'Games', url: 'javascript:alert(document.cookie)' } },
    { id: 'lk2', type: 'link', x: 3, y: 0, w: 3, h: 2, s: { title: 'Library', url: 'https://example.org/books' }, pin: true }]);
  assert.deepEqual(l.widgets.map(x => [x.id, x.s.url, !!x.pin]), [['lk1', '', false], ['lk2', 'https://example.org/books', false]]);
  assert.deepEqual(D.pinsOf(w.A.id).filter(x => x.type === 'link'), [], 'never on student screens');
});

// ---------------------------------------------------------------- PDFs
test('PDF: the class teacher uploads; only they can fetch it (not a co-teacher, another teacher, a school admin, a student or a stranger)', async () => {
  const w = world();
  S.addToClass(boss, w.A.id, w.T2.id);   // T2 co-teaches 4A too
  assert.ok(D.isTeacher(w.T2, w.A), 'a co-teacher of the class');
  const pdf = samplePdf();
  for (const who of [w.a1, w.SA, w.stranger]) assert.equal((await as(who)(`/api/dash/${w.A.id}/pdfs`, { method: 'POST', raw: pdf })).status, 404);
  assert.equal((await as(null)(`/api/dash/${w.A.id}/pdfs`, { method: 'POST', raw: pdf })).status, 401);
  const up = await as(w.T)(`/api/dash/${w.A.id}/pdfs`, { method: 'POST', raw: pdf });
  assert.equal(up.status, 200, up.text);
  const id = up.json.id;
  const got = await as(w.T)(`/dash/pdfs/${id}`);
  assert.equal(got.status, 200); assert.match(got.headers.get('content-type'), /application\/pdf/); assert.ok(got.buf.equals(pdf));
  assert.match(got.headers.get('cache-control'), /no-store/); assert.match(got.headers.get('content-security-policy'), /sandbox/);
  for (const who of [w.T2, w.SA, w.a1, w.stranger, null]) assert.equal((await as(who)(`/dash/pdfs/${id}`)).status, 404, who ? who.username || who.id : 'signed out');
  // Never handed out as a picture either.
  assert.equal((await as(w.T)(`/dash/pictures/${id}`)).status, 404);
  // A widget may show only its teacher's own PDF for this class: T2 can't point a widget of theirs at T's file.
  const l2 = D.layoutsOf(w.A.id, w.T2.id)[0] || (await as(w.T2)(`/class/${w.A.id}/dashboard`), D.layoutsOf(w.A.id, w.T2.id)[0]);
  const r2 = await as(w.T2)(`/api/dash/${w.A.id}/layouts/${l2.id}`, POST({ widgets: [{ id: 'p1', type: 'pdf', x: 0, y: 0, w: 6, h: 6, s: { doc: id } }] }));
  assert.equal(r2.json.layout.widgets[0].s.doc, '');
  const l = await layout(w, [{ id: 'p1', type: 'pdf', x: 0, y: 0, w: 6, h: 6, s: { doc: id, title: 'Lesson plan' }, pin: true }]);
  assert.deepEqual(l.widgets[0].s, { doc: id, title: 'Lesson plan' }); assert.ok(!l.widgets[0].pin);
  // Only the file is kept: nothing about which page was shown.
  assert.deepEqual(Object.keys(D.widgetType('pdf').settings.map(f => f.key)), ['0', '1']);
  // Another class's teacher can't upload into this class.
  assert.equal((await as(w.T2)(`/api/dash/${w.B.id}/pdfs`, { method: 'POST', raw: pdf })).status, 200, 'their own class is fine');
  // The owner can take it down; the file goes too.
  assert.ok(fs.existsSync(D.pdfFile(id)));
  assert.equal((await as(w.T)(`/api/dash/${w.A.id}/pictures/${id}/remove`, POST())).status, 200);
  assert.ok(!fs.existsSync(D.pdfFile(id)));
  assert.equal((await as(w.T)(`/dash/pdfs/${id}`)).status, 404);
});

test('PDF: PDF files only, at most 10 MB; the newest 12 per teacher per class are kept; account deletion takes the files', async () => {
  const w = world();
  const T = as(w.T);
  const bad = await T(`/api/dash/${w.A.id}/pdfs`, { method: 'POST', raw: Buffer.from('<html><script>alert(1)</script></html>'), type: 'text/html' });
  assert.equal(bad.status, 400); assert.equal(bad.json.error, "That file isn't a PDF.");
  assert.equal((await T(`/api/dash/${w.A.id}/pdfs`, { method: 'POST', raw: Buffer.alloc(0) })).status, 400);
  const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(D.PDF_MAX_BYTES)]);
  const tooBig = await T(`/api/dash/${w.A.id}/pdfs`, { method: 'POST', raw: big });
  assert.equal(tooBig.status, 413); assert.equal(tooBig.json.error, 'That PDF is too big. The limit is 10 MB.');
  assert.throws(() => D.savePdf(w.T, w.A, big), e => e instanceof D.PdfError && e.code === 'tooBig');
  assert.equal(D.isPdf(samplePdf()), true); assert.equal(D.isPdf(Buffer.from('GIF89a')), false);
  assert.equal(PD.PDF_MAX_BYTES, D.PDF_MAX_BYTES, 'the browser checks the same cap before it uploads');
  const ids = [];
  for (let i = 0; i < D.PDFS_KEPT + 2; i++) ids.push(D.savePdf(w.T, w.A, samplePdf()).id);
  const kept = q.all("SELECT id FROM dash_pictures WHERE owner_id=? AND class_id=? AND use='pdf'", w.T.id, w.A.id).map(r => r.id);
  assert.equal(kept.length, D.PDFS_KEPT);
  assert.ok(!fs.existsSync(D.pdfFile(ids[0])) && !fs.existsSync(D.pdfFile(ids[1])));
  assert.ok(fs.existsSync(D.pdfFile(ids.at(-1))));
  D.forgetUser(w.T.id);
  assert.ok(ids.every(id => !fs.existsSync(D.pdfFile(id))));
  assert.equal(q.get("SELECT COUNT(*) n FROM dash_pictures WHERE owner_id=?", w.T.id).n, 0);
});

test('PDF widget helpers: a page fits inside the widget; paging stays between the first and last page', () => {
  assert.equal(PD.fitScale(612, 792, 612, 792), 1);
  assert.equal(PD.fitScale(612, 792, 306, 1000), 0.5);
  assert.equal(PD.fitScale(612, 792, 2000, 396), 0.5);
  assert.equal(PD.fitScale(0, 792, 100, 100), 1);
  assert.equal(PD.stepPage(1, -1, 3), 1); assert.equal(PD.stepPage(1, 1, 3), 2); assert.equal(PD.stepPage(3, 1, 3), 3); assert.equal(PD.stepPage(9, 0, 3), 3);
  // Self-hosted pdf.js, no scripts from the PDF, nothing stored in the browser.
  const src = fs.readFileSync('public/js/dash-pdf.js', 'utf8');
  assert.match(src, /isEvalSupported: false/); assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB|https?:\/\//);
  for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs', 'LICENSE']) assert.ok(fs.existsSync(path.join('public', PD.PDFJS, f)), f);
});

// ---------------------------------------------------------------- the sticker library
const supplied = JSON.parse(fs.readFileSync('docs/class-board/sticker-library/search-index.json', 'utf8'));
const served = JSON.parse(fs.readFileSync('public/img/stickers/index.json', 'utf8'));
test('sticker library: every supplied sticker is served, with the index\'s own words; illustrated as transparent WebP, greetings as the supplied SVG', () => {
  assert.equal(supplied.entries.length, 3657); assert.equal(served.entries.length, 3657); assert.equal(served.total, 3657);
  const byId = new Map(served.entries.map(e => [e.id, e]));
  for (const e of supplied.entries) {
    const s = byId.get(e.id); assert.ok(s, e.id);
    for (const k of ['sheet', 'theme', 'name', 'text', 'language', 'keywords', 'palette', 'shape', 'position']) assert.equal(s[k], e[k], `${e.id} ${k}`);
    assert.ok(fs.existsSync(path.join('public/img/stickers', s.file)), s.file);
    if (e.file.startsWith('illustrated-individual/')) {
      assert.match(s.file, /^ill\/[a-z0-9-]+\.webp$/); assert.ok(fs.existsSync(path.join('public/img/stickers', s.thumb)), s.thumb);
      assert.ok(Math.max(s.w, s.h) <= 512 && Math.max(s.w, s.h) >= 400, `${s.id} ${s.w}x${s.h}`);
      const head = fs.readFileSync(path.join('public/img/stickers', s.file)).subarray(0, 40);
      assert.equal(head.subarray(0, 4).toString(), 'RIFF'); assert.equal(head.subarray(8, 12).toString(), 'WEBP');
    } else {
      assert.match(s.file, /^gr\/[a-z]{2}_[a-z0-9-]+_[a-z]+_(rect|circle|bubble)\.svg$/);
      const svg = fs.readFileSync(path.join('public/img/stickers', s.file), 'utf8');
      assert.doesNotMatch(svg, /<script|\son[a-z]+=|href=|<foreignObject|<image/i, s.file);
    }
  }
  assert.equal(new Set(served.entries.map(e => e.id)).size, 3657);
  assert.equal(D.stickerSet().size, 3657);
  assert.equal(D.stickerKey('ill-praise-words-1'), 'ill-praise-words-1'); assert.equal(D.stickerKey('gr-it_buongiorno_mint_bubble'), 'gr-it_buongiorno_mint_bubble');
  for (const bad of ['nope', '', '../index', 'ill-praise-words-1.png', null, 3]) assert.equal(D.stickerKey(bad), '');
});

test('sticker search: the index is read once; whole-phrase, case- and accent-blind; filters combine; the six owner queries', () => {
  const words = D.registryFor(tFor('en'), 'teacher').types.find(x => x.id === 'stickers').words;
  const idx = ST.buildIndex(served, words);
  const n = (q, f = {}) => ST.search(idx, { q, ...f }).length;
  const counts = Object.fromEntries(['good morning', 'buongiorno', 'trophy', 'rocket', 'hello', 'birthday'].map(q => [q, n(q)]));
  console.log('# sticker search counts', JSON.stringify(counts));
  assert.deepEqual(counts, { 'good morning': 225, buongiorno: 24, trophy: 2, rocket: 3, hello: 228, birthday: 217 });
  // "buongiorno" is Italian Good morning; "trophy" the trophies; "rocket" the rockets.
  assert.ok(ST.search(idx, { q: 'buongiorno' }).every(x => x.lang === 'Italian' && x.text === 'Buongiorno'));
  assert.ok(ST.search(idx, { q: 'trophy' }).every(x => /trophy/i.test(`${x.name} ${x.hay}`)));
  assert.ok(ST.search(idx, { q: 'rocket' }).some(x => x.name === 'rocket'));
  assert.equal(n('GOOD MORNING'), 225); assert.equal(n('  good   morning '), 225);
  assert.equal(n('buenos dias'), n('Buenos días')); assert.ok(n('buenos dias') > 0);
  assert.equal(n(''), 3657);
  assert.equal(n('', { sheet: 'greetings' }), 3504); assert.equal(n('', { sheet: 'praise-words' }), 9);
  assert.equal(n('', { lang: 'Italian' }), 288); assert.equal(n('', { lang: 'English' }), 1200 + 153);
  assert.equal(n('', { shape: 'circle' }), 1168);
  assert.equal(n('good morning', { lang: 'Italian', shape: 'bubble' }), 8);
  assert.equal(n('zzzz-nothing'), 0);
  // Fast enough to run on every keystroke.
  const t0 = performance.now(); for (let i = 0; i < 50; i++) ST.search(idx, { q: 'good morning' }); assert.ok((performance.now() - t0) / 50 < 15);
  assert.deepEqual(ST.pushRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
  assert.equal(ST.pushRecent(Array.from({ length: 20 }, (_, i) => `s${i}`), 'new').length, 12);
  assert.equal(ST.clampSize(10), 60); assert.equal(ST.clampSize(9000), 600); assert.equal(ST.turn(345, 15), 0); assert.equal(ST.turn(0, -15), 345);
  assert.deepEqual(ST.boxOf({ w: 600, h: 400 }, 300), { w: 300, h: 200 }); assert.deepEqual(ST.boxOf({ w: 400, h: 600 }, 300), { w: 200, h: 300 });
});

// ---------------------------------------------------------------- stickers saved with the layout
test('stickers save with the layout: each its own entry, not counted in the 24 widgets, at most MAX_STICKERS, unknown stickers dropped', async () => {
  const w = world();
  const grid = Array.from({ length: D.MAX_WIDGETS }, (_, i) => ({ id: `n${i}`, type: 'note', x: (i % 4) * 3, y: Math.floor(i / 4) * 3, w: 3, h: 3, s: { body: `${i}` } }));
  const st = (id, k, s = {}) => ({ id, type: 'stickers', s: { k, x: 3.5, y: 2.25, size: 200, r: 0, back: false, ...s } });
  const l = await layout(w, [...grid, st('s1', 'ill-praise-words-1', { size: 360, r: 30 }), st('s2', 'gr-it_buongiorno_mint_bubble', { x: 99, y: -4, size: 9000, r: 400, back: true }),
    st('s3', 'ill-oomba-4', { x: '7.123', size: 10 }), st('s4', 'not-a-sticker'), { id: 's5', type: 'stickers', x: 0, y: 0, w: 3, h: 3, s: { stamps: [{ e: 3, x: 50, y: 50 }] } }, st('s1', 'ill-food-1')]);
  assert.equal(l.widgets.filter(x => x.type === 'note').length, 24, 'the 24 widgets are all kept');
  assert.deepEqual(l.widgets.filter(x => x.type === 'stickers'), [
    { id: 's1', type: 'stickers', s: { k: 'ill-praise-words-1', x: 3.5, y: 2.25, size: 360, r: 30, back: false } },
    { id: 's2', type: 'stickers', s: { k: 'gr-it_buongiorno_mint_bubble', x: 12, y: 0, size: 600, r: 359, back: true } },
    { id: 's3', type: 'stickers', s: { k: 'ill-oomba-4', x: 7.12, y: 2.25, size: 60, r: 0, back: false } }]);
  // Read back as stored, on the teacher's page too; never on a student screen.
  assert.deepEqual(D.getLayout(l.id).widgets.filter(x => x.type === 'stickers').map(x => x.id), ['s1', 's2', 's3']);
  const page = await as(w.T)(`/class/${w.A.id}/dashboard`);
  assert.match(page.text, /"k":"ill-praise-words-1"/);
  assert.doesNotMatch((await as(w.a1)(`/class/${w.A.id}/dashboard`)).text, /ill-praise-words-1/);
  assert.equal((await as(w.a1)(`/api/dash/${w.A.id}/me`, POST({ widgets: [st('m1', 'ill-oomba-1')] }))).status, 200);
  assert.deepEqual(D.studentState(w.A.id, w.a1.id).widgets, [], 'a student cannot add stickers');
  // At most MAX_STICKERS.
  const many = Array.from({ length: D.MAX_STICKERS + 5 }, (_, i) => st(`m${i}`, 'ill-oomba-1'));
  const l2 = await layout(w, many);
  assert.equal(l2.widgets.length, D.MAX_STICKERS);
  // Copying a layout copies its stickers.
  const copy = await as(w.T)(`/api/dash/${w.A.id}/layouts`, POST({ name: 'Copy', copyFrom: l2.id }));
  assert.equal(copy.status, 200, copy.text);
  assert.equal(copy.json.layout.widgets.filter(x => x.type === 'stickers').length, D.MAX_STICKERS);
});

test('PDF: deleting the school deletes its PDF files', async () => {
  const SD = await import('../../server/services/school-delete.js');
  const w = world();
  const { id } = D.savePdf(w.T, w.A, samplePdf());
  assert.ok(fs.existsSync(D.pdfFile(id)));
  assert.equal(SD.deleteSchool(boss, w.oak.id).ok, true);
  assert.ok(!fs.existsSync(D.pdfFile(id)));
  assert.equal(D.getPicture(id), null);
});
