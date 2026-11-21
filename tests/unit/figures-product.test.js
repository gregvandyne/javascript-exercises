// Figures, the standalone product (services/figures.js, routes/figures.js; docs/decisions.md "Figures, the standalone
// product"): hidden like the Manipulatives (the normal 404 with noindex for everyone but the testers), the menu and the
// editor for kinds from every pack (only the packs a page needs, pinned with SRI), the catalog's generators and presets,
// the export notice in the SVG and PNG bytes, worksheets (create, change, reorder, regenerate, delete, owner only, print
// with the answer key for the owner only, answers worked out on the server), presets, the "Power with AI" switch, the AI
// drafter (mocked: only catalog kinds, every item checked with OF.check, repairs logged, answers from OF.solve, the
// template fallback without a key, names refused), the switcher between the two teaching tools, and account deletion.
import './_setup.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const F = await import('../../server/services/figures.js');
const { figuresKit, FIG_PACKS, FIG_LATEST } = await import('../../server/services/figlibs.js');
const { canvasKit } = await import('../../server/services/canvaskit.js');
const { deleteAccount } = await import('../../server/services/account-delete.js');
const { createApp } = await import('../../server/app.js');
const CAT = await import('../../public/js/figures-catalog.js');
const { pngWithNotice, pngText, crc32 } = await import('../../public/js/figures-export.js');
const OF = figuresKit(FIG_LATEST['oomba-figures']);

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) { headers['content-type'] = 'application/json'; method = method === 'GET' ? 'POST' : method; }
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
};
const withFlags = async (flags, fn) => { const old = { f: config.figures, m: config.manipulatives, u: config.manipulativesUsers }; Object.assign(config, flags); try { await fn(); } finally { config.figures = old.f; config.manipulatives = old.m; config.manipulativesUsers = old.u; } };

// The platform admin teaches a class of their own school; T is a teacher of the same school, a1 a student.
const boss = createUser({ username: 'FigBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Figures Oak' }).school;
S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
const A = S.createClass(boss, oak.id, { name: '7A' }).class;
const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tom Teacher', role: 'teacher' }).user.id);
const T2 = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user.id);
const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Zelda Quokka' }).user.id);
S.addToClass(boss, A.id, kid.id);

test('migration 0095: once, after the manipulatives, its tables exist', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.equal(names.filter(n => n.startsWith('0095')).length, 1);
  assert.ok(names.indexOf('0095_figures_question_sets') > names.indexOf('0094_manipulatives_show_work'));
  for (const tb of ['question_sets', 'question_set_items', 'figure_presets', 'figure_prefs']) assert.ok(q.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", tb), tb);
  assert.ok(q.all('PRAGMA table_info(question_sets)').some(c => c.name === 'purpose'), 'one question-set model: purpose');
});

test('hidden: signed out, guests, grown-ups, students and teachers off the list get the normal 404; testers get noindex pages', async () => {
  const grown = createUser({ username: 'FigParent', password: 'secret123', accountType: 'grownup' });
  const guest = createUser({ username: 'FigGuest', isGuest: true });
  for (const who of [null, guest, grown, kid, T]) {
    for (const p of ['/figures', '/figures/triangle', '/figures/worksheets/new', '/figures/thumb/triangle.svg']) {
      const r = await as(who)(p);
      assert.equal(r.status, 404, `${p} for ${who ? who.username : 'signed out'}`);
      assert.doesNotMatch(r.text, /figures\.css|figures-editor\.js|Build a worksheet/, 'the normal 404 page, nothing of the product');
      if (p !== '/figures/thumb/triangle.svg') assert.match(r.text, /<meta name="robots" content="noindex/, 'the 404 page is not indexed either');
    }
    assert.equal((await as(who)('/api/figures/state')).status, 404);
    assert.equal((await as(who)('/api/figures/worksheets', { body: { title: 'x' } })).status, 404);
  }
  const ok = await as(boss)('/figures');
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('x-robots-tag'), /noindex/);
  assert.match(ok.headers.get('cache-control'), /no-store/);
  assert.match(ok.text, /<meta name="robots" content="noindex/);
  assert.match(ok.text, /\/js\/figures\.js/);
  await withFlags({ figures: false }, async () => assert.equal((await as(boss)('/figures')).status, 404, 'FIGURES=0 hides it from the admin too'));
  await withFlags({ manipulativesUsers: [T.username.toLowerCase(), kid.username.toLowerCase()] }, async () => {
    assert.equal((await as(T)('/figures')).status, 200, 'a teacher on the Manipulatives tester list');
    assert.equal((await as(kid)('/figures')).status, 404, 'the list is for school staff only');
  });
  const banned = createUser({ username: 'FigBanned', password: 'secret123', role: 'admin' });
  q.run('UPDATE users SET banned=1 WHERE id=?', banned.id);
  assert.equal(F.canMake(getUser(banned.id)), false);
  assert.equal(F.canMake(guest), false);
  assert.equal(F.canMake(grown), false);
});

test('the menu: every catalog kind as a card with a server-drawn thumbnail; Math, Data, Physics and Chemistry open, Biology and Economics coming soon', async () => {
  const r = await as(boss)('/figures');
  assert.equal((r.text.match(/class="fg-card"/g) || []).length, CAT.KINDS.length + CAT.KINDS.reduce((n, K) => n + (K.also || []).length, 0));
  // The lab readings are physics and chemistry: listed under both tabs, once under All (the second card is data-also).
  assert.match(r.text, /<section class="fg-sec" data-subject="chem"[\s\S]*?href="\/figures\/reading" data-subject="chem" data-also/);
  assert.match(r.text, /href="\/figures\/reading" data-subject="physics" data-grades/);
  for (const s of ['math', 'data', 'physics', 'chem']) assert.match(r.text, new RegExp(`data-tab="${s}"`));
  assert.match(r.text, /Biology <span class="fg-soontag">Coming soon<\/span>/);
  assert.match(r.text, /Economics <span class="fg-soontag">Coming soon<\/span>/);
  assert.doesNotMatch(r.text, /data-tab="biology"|href="\/figures\/biology/);
  assert.match(r.text, /Build a worksheet[\s\S]*Draft with AI[\s\S]*Start from scratch[\s\S]*My worksheets/);
  const th = await as(boss)('/figures/thumb/boxPlot.svg');
  assert.equal(th.status, 200);
  assert.match(th.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(th.text, /^<svg/);
  assert.equal(F.thumbnail('boxPlot'), F.thumbnail('boxPlot'), 'cached');
  assert.equal((await as(boss)('/figures/thumb/nope.svg')).status, 404);
  assert.doesNotMatch(r.text, /\u2014/, 'no em dashes');
});

test('the editor: a kind from every pack loads the core and only its own pack, pinned with SRI; unknown kinds are a 404', async () => {
  const sample = { triangle: 'math', boxPlot: 'data', circuit: 'physics', bohr: 'chem', reading: 'measure', grid: null };
  const packs = Object.keys(FIG_PACKS[F.OF_VERSION]);
  for (const [kind, pack] of Object.entries(sample)) {
    const r = await as(boss)(`/figures/${kind}`);
    assert.equal(r.status, 200, kind);
    assert.match(r.text, new RegExp(`<script src="/vendor/oomba-figures/${F.OF_VERSION}/oomba-figures.js" integrity="sha384-[^"]+" crossorigin="anonymous"></script>`));
    for (const p of packs) assert.equal(r.text.includes(`/packs/${p}.js`), p === pack, `${kind}: pack ${p}`);
    const data = JSON.parse(/<script type="application\/json" id="fg-editor">([\s\S]*?)<\/script>/.exec(r.text)[1].replace(/\\u003c/g, '<'));
    assert.equal(data.kind.id, kind);
    assert.ok(data.presets.length >= 1 && data.presets.every(p => OF.check(kind, p.data).length === 0), `${kind} presets draw`);
    assert.match(r.text, /\/js\/figures-editor\.js/);
  }
  assert.equal((await as(boss)('/figures/notAKind')).status, 404);
  // ?d= opens a linked figure (even one that cannot be drawn: the page says why)
  const d = CAT.encodeData({ AB: 1, BC: 2, CA: 10 });
  const r = await as(boss)(`/figures/triangle?d=${d}`);
  assert.match(r.text, /"start":\{"data":\{"AB":1,"BC":2,"CA":10\}\}/);
  assert.equal(OF.check('triangle', { AB: 1, BC: 2, CA: 10 }).length, 1);
});

test('the catalog: every preset draws, the docs\' generators are the catalog\'s, and each generator\'s answer is its OF.solve value', () => {
  const md = fs.readFileSync(path.join(ROOT, 'docs/figures-api.md'), 'utf8'), docs = {};
  for (const m of md.matchAll(/```json\n([\s\S]*?)\n```/g)) for (const p of m[1].split(/\n(?=\{ ?"tool")/)) { try { const g = JSON.parse(p); if (g.fig) docs[g.fig.kind === 'reading' ? `reading.${g.fig.type}` : g.fig.kind] = g; } catch { /* not a generator */ } }
  assert.ok(Object.keys(docs).length >= 40);
  for (const [id, g] of Object.entries(docs)) { const c = CAT.genOf(id); assert.ok(c, id); const { id: _i, key: _k, kind: _kk, ...rest } = c; assert.deepEqual(rest, g, `${id} is the docs' generator`); }
  const L = canvasKit().logic;
  for (const K of CAT.KINDS) {
    assert.equal(OF.packOf(K.id) === 'core' || OF.packOf(K.id) !== null, true);
    for (const p of K.presets) assert.equal(OF.check(K.id, p).length, 0, `${K.id} ${JSON.stringify(p)}`);
    if (K.nts) assert.equal(OF.check(K.id, { ...K.presets[0], notToScale: true }).length, 0, `${K.id} notToScale`);
    for (const g of K.gens) for (const seed of [11, 222, 3333, 44444]) {
      const r = F.generate(g.id, seed); assert.ok(r, `${g.id} ${seed}`);
      assert.equal(OF.check(r.kind, r.data).length, 0);
      const raw = L.cleanProblem(L.TOOLS[g.tool].gen(L.seeded(seed), g)).p;
      assert.ok(Math.abs(r.value - raw.answer) <= 0.5 * 10 ** -(raw.dp ?? 3) + 1e-9, `${g.id}: OF.solve ${r.value} is the generator's ${raw.answer}`);
      if (g.key) assert.equal(r.value, CAT.flatSolve(OF.solve[r.kind](r.data))[g.key]);
    }
  }
  assert.deepEqual(CAT.KINDS.filter(K => !K.gens.length).map(K => K.id).sort(), ['lewis', 'orbitals', 'titration'], 'these randomize from their presets');
});

test('export: the SVG carries the CC0 notice as metadata; the PNG carries it in a tEXt chunk and XMP, with good CRCs', () => {
  const NOTICE = 'Made with Oomba Academy. Everything Oomba Academy contributes to this figure is dedicated to the public domain under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/). Anything original added by the person who made it is theirs.';
  assert.equal(OF.notice, NOTICE);
  const svg = OF.withNotice(OF.svg('triangle', { AB: 3, BC: 4, B: 90 }));
  assert.match(svg, /<metadata class="of-notice">/);
  assert.ok(svg.includes(`<dc:rights>${NOTICE}</dc:rights>`));
  assert.ok(svg.includes('<cc:license rdf:resource="https://creativecommons.org/publicdomain/zero/1.0/"'));
  // a real 1x1 PNG (IHDR, IDAT, IEND)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const out = pngWithNotice(new Uint8Array(png), NOTICE);
  const buf = Buffer.from(out);
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(buf.toString('latin1', 12, 16), 'IHDR');
  assert.equal(buf.toString('latin1', 37, 41), 'tEXt', 'the notice right after the header');
  assert.ok(buf.includes(Buffer.from(`Copyright\0${NOTICE}`, 'latin1')), 'the tEXt chunk, byte for byte');
  assert.ok(buf.includes(Buffer.from('XML:com.adobe.xmp\0\0\0\0\0', 'latin1')), 'an uncompressed iTXt XMP chunk');
  assert.equal(buf.toString('latin1', buf.length - 8, buf.length - 4), 'IEND');
  const txt = pngText(out);
  assert.equal(txt.Copyright, NOTICE);
  assert.ok(txt['XML:com.adobe.xmp'].includes(`<rdf:li xml:lang="x-default">${NOTICE}</rdf:li>`));
  assert.ok(txt['XML:com.adobe.xmp'].includes('<xmpRights:WebStatement>https://creativecommons.org/publicdomain/zero/1.0/</xmpRights:WebStatement>'));
  assert.equal(txt['Copyright:crc'], undefined); assert.equal(txt['XML:com.adobe.xmp:crc'], undefined);
  assert.equal(crc32(Buffer.from('IEND', 'latin1')), 0xAE426082);
  assert.throws(() => pngWithNotice(new Uint8Array([1, 2, 3]), NOTICE), /not a PNG/);
});

test('worksheets: create, add, change, reorder, regenerate and delete; answers worked out on the server, never taken from the browser', async () => {
  const B = as(boss);
  let r = await B('/api/figures/worksheets', { body: { title: 'Area practice', grade: '7', items: [
    { kind: 'rectangle', data: { AB: 6, BC: 2, unit: 'm' }, answerKey: 'area', question: 'Find the area.', answer: '999', work: ['made up'] },
    { kind: 'triangle', gen: 'triangle', seed: 42 },
  ] } });
  assert.equal(r.status, 200);
  let w = r.json.worksheet;
  assert.equal(w.title, 'Area practice'); assert.equal(w.grade, '7'); assert.equal(w.subject, 'math');
  assert.equal(w.items[0].answer, '12 m²', 'OF.solve, not the browser');
  assert.deepEqual(w.items[0].work, []);
  const g = F.generate('triangle', 42);
  assert.equal(w.items[1].answer, g.answer); assert.equal(w.items[1].question, g.question); assert.ok(w.items[1].work.length >= 2);
  assert.match(w.items[0].svg, /^<svg/);
  // a figure that cannot be drawn is refused, with OF.check's reason
  r = await B(`/api/figures/worksheets/${w.id}/items`, { body: { item: { kind: 'triangle', data: { AB: 1, BC: 2, CA: 10 } } } });
  assert.equal(r.status, 400); assert.equal(r.json.code, 'cannotDraw'); assert.match(r.json.problems[0], /cannot make a triangle/);
  r = await B(`/api/figures/worksheets/${w.id}/items`, { body: { item: { kind: 'nope', data: {} } } });
  assert.equal(r.json.code, 'badKind');
  // a starter question from the picker
  r = await B(`/api/figures/worksheets/${w.id}/items`, { body: { kind: 'boxPlot' } });
  w = r.json.worksheet; assert.equal(w.items.length, 3); assert.equal(w.items[2].kind, 'boxPlot'); assert.ok(w.items[2].gen);
  // change the generated triangle's numbers: it becomes the teacher's own (no generator, answered by answerKey)
  r = await B(`/api/figures/worksheets/${w.id}/items/${w.items[1].id}`, { body: { data: { AB: 5, BC: 12, B: 90, labels: { CA: 'x' } }, answerKey: 'sides.CA' } });
  w = r.json.worksheet; assert.equal(w.items[1].gen, null); assert.equal(w.items[1].answer, '13');
  // hide: only the kind's own parts
  r = await B(`/api/figures/worksheets/${w.id}/items/${w.items[0].id}`, { body: { hide: 'sides' } }); assert.equal(r.json.worksheet.items[0].hide, 'sides');
  r = await B(`/api/figures/worksheets/${w.id}/items/${w.items[0].id}`, { body: { hide: '<script>' } }); assert.equal(r.json.worksheet.items[0].hide, false);
  // words
  r = await B(`/api/figures/worksheets/${w.id}/items/${w.items[0].id}`, { body: { question: 'call me at 555-123-4567' } }); assert.equal(r.json.code, 'personal');
  // reorder
  const ids = w.items.map(x => x.id);
  r = await B(`/api/figures/worksheets/${w.id}/items/${ids[2]}/move`, { body: { dir: 'up' } });
  assert.deepEqual(r.json.worksheet.items.map(x => x.id), [ids[0], ids[2], ids[1]]);
  // regenerate numbers
  const before = r.json.worksheet.items[1];
  r = await B(`/api/figures/worksheets/${w.id}/items/${before.id}/regen`, { body: {} });
  const after = r.json.worksheet.items[1];
  assert.equal(after.kind, 'boxPlot'); assert.notEqual(after.seed, before.seed); assert.equal(OF.check('boxPlot', after.data).length, 0);
  // delete a question, rename
  r = await B(`/api/figures/worksheets/${w.id}/items/${ids[0]}/delete`, { body: {} });
  assert.equal(r.json.worksheet.items.length, 2);
  r = await B(`/api/figures/worksheets/${w.id}`, { body: { title: 'Area and triangles', grade: '8' } });
  assert.equal(r.json.worksheet.title, 'Area and triangles'); assert.equal(r.json.worksheet.grade, '8');
  assert.ok((await as(boss)('/api/figures/state')).json.worksheets.some(x => x.id === w.id && x.n === 2));
  const menu = await B('/figures'); assert.match(menu.text, /Area and triangles/);
  // delete the worksheet
  r = await B(`/api/figures/worksheets/${w.id}/delete`, { body: {} }); assert.equal(r.status, 200);
  assert.equal(q.get('SELECT COUNT(*) n FROM question_set_items WHERE set_id=?', w.id).n, 0);
  assert.equal((await B(`/api/figures/worksheets/${w.id}`)).status, 404);
});

test('a worksheet is its owner\'s: another tester gets the same 404 for it, its print page and its answer key', async () => {
  await withFlags({ manipulativesUsers: [T.username.toLowerCase(), T2.username.toLowerCase()] }, async () => {
    const r = await as(T)('/api/figures/worksheets', { body: { title: 'Tom\'s sheet', items: [{ kind: 'rectangle', data: { AB: 7, BC: 3, unit: 'cm' }, answerKey: 'area', question: 'What is the area?' }] } });
    const id = r.json.worksheet.id;
    for (const p of [`/api/figures/worksheets/${id}`, `/figures/worksheets/${id}`, `/figures/worksheets/${id}/print?key=1`, `/figures/worksheets/${id}/print?key=0`]) {
      const x = await as(T2)(p);
      assert.equal(x.status, 404, p); assert.doesNotMatch(x.text, /21 cm²|What is the area/);
    }
    assert.equal((await as(T2)(`/api/figures/worksheets/${id}/items`, { body: { kind: 'triangle' } })).status, 404);
    assert.equal((await as(T2)(`/api/figures/worksheets/${id}/delete`, { body: {} })).status, 404);
    assert.equal((await as(boss)(`/figures/worksheets/${id}/print?key=1`)).status, 404, 'not even the platform admin');
    // the owner: the student sheet has no answers; the key has them
    const sheet = await as(T)(`/figures/worksheets/${id}/print?key=0`);
    assert.equal(sheet.status, 200); assert.match(sheet.text, /What is the area\?/); assert.doesNotMatch(sheet.text, /21 cm²/); assert.match(sheet.text, /data-key="0"/);
    assert.match(sheet.text, /Name <i class="fgp-blank fgp-blank-name"><\/i>/);
    const key = await as(T)(`/figures/worksheets/${id}/print?key=1`);
    assert.match(key.text, /fgp-key/); assert.match(key.text, /21 cm²/); assert.match(key.text, /Answer key/);
    // the printed figures are black on white
    assert.doesNotMatch(sheet.text.slice(sheet.text.indexOf('class="fgp"')), /#1F9D63|#FFFDF2/i);
    const api = await as(T)(`/api/figures/worksheets/${id}`);
    assert.match(api.json.worksheet.preview.key, /21 cm²/); assert.doesNotMatch(api.json.worksheet.preview.sheet, /21 cm²/);
  });
});

test('presets are the teacher\'s own; the "Power with AI" switch is remembered', async () => {
  const B = as(boss);
  let r = await B('/api/figures/presets', { body: { kind: 'triangle', name: '5, 12, 13', data: { AB: 5, BC: 12, B: 90 } } });
  assert.equal(r.status, 200);
  const id = r.json.preset.id;
  assert.equal((await B('/api/figures/presets', { body: { kind: 'triangle', name: 'bad', data: { AB: 1, BC: 2, CA: 10 } } })).json.code, 'cannotDraw');
  assert.equal((await B('/api/figures/presets', { body: { kind: 'triangle', name: '', data: { AB: 3, BC: 4, B: 90 } } })).json.code, 'name');
  assert.deepEqual((await B('/api/figures/presets/triangle')).json.presets.map(p => p.name), ['5, 12, 13']);
  const ed = await B('/figures/triangle'); assert.match(ed.text, /"mine":\[\{"id":"[^"]+","name":"5, 12, 13"/);
  await withFlags({ manipulativesUsers: [T.username.toLowerCase()] }, async () => {
    assert.deepEqual((await as(T)('/api/figures/presets/triangle')).json.presets, []);
    assert.equal((await as(T)(`/api/figures/presets/${id}/delete`, { body: {} })).status, 404);
  });
  assert.equal((await B(`/api/figures/presets/${id}/delete`, { body: {} })).status, 200);
  assert.equal(F.aiPref(boss), true, 'on until turned off');
  await B('/api/figures/prefs', { body: { ai: false } }); assert.equal(F.aiPref(boss), false);
  assert.match((await B('/figures/worksheets/new')).text, /"ai":false/);
  await B('/api/figures/prefs', { body: { ai: true } }); assert.equal(F.aiPref(boss), true);
});

test('Power with AI (mocked): catalog kinds only, every item checked with OF.check, repairs logged, answers from OF.solve', async () => {
  const B = as(boss), logs = [];
  const id = (await B('/api/figures/worksheets', { body: { title: '' } })).json.worksheet.id;
  let seen = null;
  F.hooks.log = x => logs.push(x);
  F.hooks.create = async req => {
    seen = req;
    const items = [
      { kind: 'rectangle', question: 'A garden is 9 m by 4 m. What is its area?', data: JSON.stringify({ AB: 9, BC: 4, unit: 'm' }), answerKey: 'area' },
      { kind: 'triangle', question: 'Find CA.', data: JSON.stringify({ AB: 1, BC: 2, CA: 10 }), answerKey: 'sides.CA' },
      { kind: 'pentagram', question: 'Draw a star.', data: '{}', answerKey: '' },
      { kind: 'cylinder', question: 'What is the volume?', data: JSON.stringify({ radius: 2, height: 5, unit: 'cm' }), answerKey: 'volumeOfTheMoon' },
      { kind: 'boxPlot', question: 'What is the IQR?', data: 'not json', answerKey: 'iqr' },
    ];
    return { model: config.builderModel, usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify({ title: 'Area and volume', items }) }] };
  };
  try {
    const r = await B(`/api/figures/worksheets/${id}/draft`, { body: { brief: 'Grade 7 area and volume, 5 questions', count: 5 } });
    assert.equal(r.status, 200);
    assert.equal(r.json.ai, true); assert.equal(r.json.added, 4); assert.equal(r.json.repaired, 3); assert.equal(r.json.dropped, 1);
    // what Claude was asked: the repo's model setting, a JSON schema whose kinds are the catalog's
    assert.equal(seen.model, config.builderModel);
    const schema = seen.output_config.format.schema;
    assert.deepEqual(schema.properties.items.items.properties.kind.enum.sort(), F.draftKinds().map(K => K.id).sort());
    assert.match(seen.messages[0].content, /rectangle \(math; grades/);
    assert.doesNotMatch(seen.messages[0].content, /Zelda|Quokka/);
    const w = r.json.worksheet;
    assert.equal(w.title, 'Area and volume');
    assert.deepEqual(w.items.map(x => x.kind), ['rectangle', 'triangle', 'cylinder', 'boxPlot']);
    assert.equal(w.items[0].answer, '36 m²', 'from OF.solve');
    assert.equal(w.items[0].question, 'A garden is 9 m by 4 m. What is its area?');
    for (const it of w.items) assert.equal(OF.check(it.kind, it.data).length, 0, `${it.kind} draws`);
    assert.ok(w.items.slice(1).every(it => it.gen), 'the bad ones were replaced by their generators');
    assert.deepEqual(logs.map(l => [l.kind, l.action]), [['triangle', 'replaced by its generator'], ['pentagram', 'dropped'], ['cylinder', 'replaced by its generator'], ['boxPlot', 'replaced by its generator']]);
    assert.match(logs[0].why, /OF\.check: these sides cannot make a triangle/);
    assert.match(logs[2].why, /answerKey/);
    const a = q.get("SELECT details FROM audit_log WHERE action='figures.draft' AND target=? ORDER BY rowid DESC", id);
    assert.deepEqual(JSON.parse(a.details), { ai: true, added: 4, repaired: 3, dropped: 1 });
    // a failing call falls back to the starter set
    F.hooks.create = async () => { throw new Error('overloaded'); };
    const f = await B(`/api/figures/worksheets/${id}/draft`, { body: { brief: 'box plots and histograms', count: 2 } });
    assert.equal(f.json.ai, false); assert.equal(f.json.added, 2);
  } finally { F.hooks.create = null; F.hooks.log = null; }
});

test('Power with AI without a key: a template starter set from the generators; names and bad words are refused', async () => {
  config.anthropicKey = '';
  const B = as(boss), id = (await B('/api/figures/worksheets', { body: { title: 'Fallback' } })).json.worksheet.id;
  const r = await B(`/api/figures/worksheets/${id}/draft`, { body: { brief: 'Grade 8 Pythagorean theorem and volume of cylinders', count: 4 } });
  assert.equal(r.status, 200); assert.equal(r.json.ai, false); assert.equal(r.json.added, 4);
  const kinds = new Set(r.json.worksheet.items.map(x => x.kind));
  assert.ok([...kinds].every(k => ['triangle', 'prism', 'cylinder', 'cone', 'pyramid', 'sphere'].includes(k)), [...kinds].join());
  for (const it of r.json.worksheet.items) { assert.equal(OF.check(it.kind, it.data).length, 0); assert.ok(it.answer, 'answered'); }
  assert.equal((await B(`/api/figures/worksheets/${id}/draft`, { body: { brief: 'a worksheet for Zelda about angles' } })).json.code, 'names');
  assert.equal((await B(`/api/figures/worksheets/${id}/draft`, { body: { brief: 'ab' } })).json.code, 'brief');
  assert.equal((await B(`/api/figures/worksheets/${id}/draft`, { body: { brief: 'email me at a@b.co about area' } })).json.code, 'personal');
  // the template picks from the subject the brief names, in its grade band
  const items = F.templateItems({ brief: 'physics for grade 9', count: 3 });
  assert.equal(items.length, 3); assert.ok(items.every(it => CAT.kindOf(it.kind).subject === 'physics'));
});

test('the teaching tools switcher shows only to someone who can open both tools', async () => {
  let r = await as(boss)('/figures');
  assert.match(r.text, /class="fg-tools"[\s\S]*href="\/manipulatives"[\s\S]*href="\/figures"/);
  r = await as(boss)('/manipulatives');
  assert.match(r.text, /class="fg-tools"/); assert.match(r.text, /figures\.css/);
  await withFlags({ manipulatives: false }, async () => assert.doesNotMatch((await as(boss)('/figures')).text, /class="fg-tools"/));
  await withFlags({ figures: false }, async () => assert.doesNotMatch((await as(boss)('/manipulatives')).text, /class="fg-tools"|figures\.css/));
});

test('i18n: every kind has a name and a line in English and in every translated language; no em dashes', () => {
  const dir = path.join(ROOT, 'server/i18n/locales');
  const load = c => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8'));
  const en = load('en');
  for (const K of CAT.KINDS) { assert.ok(en.figures.kinds[K.id].name, K.id); assert.ok(en.figures.kinds[K.id].desc, K.id); }
  const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') flat(v, `${p}${k}.`, out); else out[`${p}${k}`] = v; } return out; };
  const want = Object.keys({ ...flat(en.figures, 'figures.'), ...flat(en.js['figures-editor'], 'js.figures-editor.'), ...flat(en.js['figures-sheet'], 'js.figures-sheet.') });
  for (const c of ['pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) {
    const l = load(c), have = { ...flat(l.figures || {}, 'figures.'), ...flat((l.js || {})['figures-editor'] || {}, 'js.figures-editor.'), ...flat((l.js || {})['figures-sheet'] || {}, 'js.figures-sheet.') };
    const missing = want.filter(k => !(k in have));
    assert.deepEqual(missing, [], `${c} is missing Figures strings`);
    for (const [k, v] of Object.entries(have)) assert.doesNotMatch(String(v), /\u2014/, `${c} ${k}`);
  }
  for (const [k, v] of Object.entries(flat(en.figures))) assert.doesNotMatch(String(v), /\u2014|Maths|colour/, k);
  assert.equal(load('en-GB').figures.subjects.math, 'Maths', 'British English says Maths');
});

test('deleting an account takes its worksheets, presets and switch', () => {
  const u = createUser({ username: 'FigGone', password: 'secret123', role: 'admin' });
  const id = F.createWorksheet(u, { title: 'Bye', items: [{ kind: 'rectangle', data: { AB: 2, BC: 1 } }] }).id;
  F.savePreset(u, { kind: 'rectangle', name: 'tiny', data: { AB: 2, BC: 1 } }); F.setAiPref(u, false);
  deleteAccount(u.id, u, { by: 'self', parentMade: false });
  assert.equal(q.get('SELECT COUNT(*) n FROM question_sets WHERE id=?', id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM question_set_items WHERE set_id=?', id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM figure_presets WHERE owner_id=?', u.id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM figure_prefs WHERE user_id=?', u.id).n, 0);
});
