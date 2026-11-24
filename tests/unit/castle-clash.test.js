// Castle Clash: the chess game with its own board UI (no Oomba Kit), the Beginner path, 4,000+ Lichess puzzles in
// packs, Puzzle Rush, the progress page and synthesized wood sounds. Static checks on the file, the words and the
// puzzle packs (every puzzle replayed with the game's own engine), then real Chromium through the production frame
// wrapper and CSP: rules, storage migration, the puzzle flow and rating, progress, sounds, the online protocol and a
// 390 px phone with no sideways scroll.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/castle-clash.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/castle-clash.json'), 'utf8'));
const { loadEngine, checkPuzzle } = await import('../../scripts/chess-puzzles.mjs');
const E = loadEngine(HTML);
const block = (name) => new RegExp(`// ==== ${name} START ====([\\s\\S]*?)// ==== ${name} END ====`).exec(HTML)[1];
const I18N = (() => { const c = vm.createContext({}); vm.runInContext(block('I18N').replace('const I18N', 'globalThis.I18N'), c); return c.I18N; })();
const PACKS = (() => { const c = vm.createContext({}); vm.runInContext(block('PUZZLE PACKS').replace(/const (\w+)/g, 'globalThis.$1'), c); return c; })();
const PACK_DIR = path.join(ROOT, 'public/vendor/data/castle-clash', PACKS.PZ_VER);
const readPack = b => { const w = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(PACK_DIR, `p${b}.js`), 'utf8'), w); return w.window.CCPuzzles['p' + b]; };

test('castle-clash: no Oomba Kit (tags, packs, world, title, pause, icons, busts); passes the scanner; keeps its slug and title', async () => {
  assert.doesNotMatch(HTML, /\/vendor\/oomba-kit\//, 'no kit script tags');
  assert.doesNotMatch(HTML, /\bOomba\.(stage|ui|char|avatar|color|icon|fonts|settings|scene|juice)\b/, 'no kit calls');
  assert.doesNotMatch(HTML, /Wizard Hoot|ok-title|ok-pause|ok-portrait/);
  assert.equal([...HTML.matchAll(/<script\b[^>]*\bsrc=/g)].length, 0, 'no external scripts in the page (packs are added on demand)');
  const { scanVersion } = await import('../../server/services/scanner.js');
  assert.equal(scanVersion(HTML).status, 'pass');
  assert.equal(META.slug, 'castle-clash'); assert.equal(META.title, 'Castle Clash');
  assert.doesNotMatch(META.notes + META.description, /Oomba Kit|Wizard Hoot|owl/i);
  assert.deepEqual(Object.keys(META.l10n).sort(), ['ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant']);
  for (const [l, v] of Object.entries(META.l10n)) { assert.ok(v.description.length > 80 && v.description.length < 600, l); assert.doesNotMatch(v.description + v.tags, /https?:|Hoot/); }
});

test('castle-clash: every word in all 13 languages, no em dashes and US spelling in English', () => {
  const en = I18N.en, langs = Object.keys(I18N);
  assert.deepEqual(langs, ['en', 'en-GB', 'pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']);
  for (const l of langs) if (l !== 'en' && l !== 'en-GB') {
    const miss = Object.keys(en).filter(k => !(k in I18N[l])); assert.deepEqual(miss, [], `${l} has every key`);
    const extra = Object.keys(I18N[l]).filter(k => !(k in en)); assert.deepEqual(extra, [], `${l} has no old keys`);
  }
  const words = JSON.stringify(en);
  assert.doesNotMatch(words, /—/, 'no em dashes in English');
  assert.doesNotMatch(words, /\b(colour|favourite|centre|practise)\b/i, 'US spelling');
  // every key the code asks for exists
  const code = HTML.replace(block('I18N'), '');
  for (const m of code.matchAll(/\bt\('([a-zA-Z0-9.]+)'[,)]/g)) assert.ok(m[1] in en, `en has ${m[1]}`);
  for (const m of code.matchAll(/data-i18n(?:-aria|-ph)?="([^"]+)"/g)) assert.ok(m[1] in en, `en has ${m[1]}`);
  for (const th of ['mateIn1', 'fork', 'pin', 'endgame', 'trappedPiece']) assert.ok(en['th.' + th]);
});

test('castle-clash: the puzzle packs are the files the game names (sha384), 3,000 to 5,000 Lichess puzzles in rating bands, every one replays', () => {
  assert.match(PACKS.PZ_VER, /^v1-[a-z]{8}$/);
  assert.deepEqual([...PACKS.PZ_BANDS], [600, 800, 1000, 1200, 1400, 1600, 1800, 2000]);
  assert.deepEqual(fs.readdirSync(path.dirname(PACK_DIR)), [PACKS.PZ_VER], 'one version folder');
  let total = 0; const ids = new Set(), themes = {};
  for (const b of PACKS.PZ_BANDS) {
    const body = fs.readFileSync(path.join(PACK_DIR, `p${b}.js`));
    assert.equal(PACKS.PZ_SRI['p' + b], 'sha384-' + crypto.createHash('sha384').update(body).digest('base64'), `p${b} checksum`);
    assert.doesNotMatch(body.toString(), /https?:\/\/(?!database\.lichess)|lichess\.org\/|GameUrl/, 'no game links');
    const list = readPack(b);
    assert.ok(list.length >= 300, `band ${b} has puzzles`);
    for (const [id, fen, moves, rating, mask] of list) {
      assert.ok(/^[A-Za-z0-9]{5}$/.test(id) && !ids.has(id), id); ids.add(id);
      assert.ok(rating >= b && rating < b + 200, `${id} rating in band`);
      const tags = PACKS.PZ_THEMES.filter((t, i) => mask & (1 << i)); for (const t of tags) themes[t] = (themes[t] || 0) + 1;
      assert.equal(checkPuzzle(E, fen, moves.split(' '), tags), null, `${id} replays with the engine`);
    }
    total += list.length;
  }
  assert.ok(total >= 3000 && total <= 5000, `${total} puzzles`);
  for (const t of ['mateIn1', 'mateIn2', 'mateIn3', 'fork', 'pin', 'skewer', 'hangingPiece', 'discoveredAttack', 'backRankMate', 'promotion', 'endgame', 'sacrifice', 'deflection'])
    assert.ok(themes[t] >= 60, `theme ${t}: ${themes[t]}`);
});

test('castle-clash: the engine still matches perft and the Beginner path is intact', () => {
  assert.equal(E.perft(undefined, 3), 8902);
  assert.equal(E.perft('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 2), 2039);
  assert.equal((HTML.match(/mateIn: [12], solution:/g) || []).length, 24);
});

/* ---------- real Chromium, the production frame wrapper and CSP, packs served from disk ---------- */
const { chromiumPath } = await import('../../scripts/chromium.js');
const exe = chromiumPath();
const skip = !exe ? 'no Chromium on this machine' : false;
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
async function open({ size = { width: 1280, height: 800 }, save = {}, lang = 'en' } = {}) {
  const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); }
  const ctx = await browser.newContext({ viewport: size, hasTouch: size.width < 500 });
  const doc = frameDocument(HTML, { user: { displayName: 'Mia', avatar: 'x', lang, dir: 'ltr' }, game: { id: 'g', title: 'Castle Clash' }, save, canSave: false, preview: true, deviceText: { title: 'x', text: 'y' } });
  const host = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const errors = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html', body: host });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    if (/^https:\/\/fonts\.googleapis\.com\//.test(u)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (/^https:\/\/fonts\.googleapis\.com\//.test(u)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    const d = /^http:\/\/game\.invalid\/vendor\/data\/(.+)$/.exec(u);
    if (d) { const f = path.join(ROOT, 'public/vendor/data', d[1]); if (fs.existsSync(f)) return route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }); }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(HOST + '/');
  let frame = null;
  for (let i = 0; i < 200 && !frame; i++) { frame = page.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await page.waitForTimeout(25); }
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state().screen === 'home', null, { timeout: 30000 });
  return { ctx, page, frame, errors };
}
const T = (frame, js) => frame.evaluate(`(async () => { const T = window.__brbTest; ${js} })()`);

test('castle-clash: a version 1 save migrates (wins, stars, theme) and play works by taps and drags', { skip, timeout: 120000 }, async () => {
  const v1 = { settings: { theme: 'wood', coords: true, dots: false, rotate: false, faces: true }, wins: { pawn: 2, knight: 1, bishop: 0, queen: 0 }, stars: { pawn: true }, puzzles: { 0: true, 3: true }, nicks: [0, 1], level: 'knight', side: 'b', clockMin: 5 };
  const { ctx, page, frame, errors } = await open({ save: { 'castle-clash-v1': JSON.stringify(v1) } });
  try {
    const first = await T(frame, 'return T.save();');
    assert.equal(first.v, 2, 'the old save is written in the new shape at once'); assert.ok(!('nicks' in first)); assert.equal(first.pz.r, 800);
    const st = await T(frame, 'return T.state();');
    assert.equal(st.theme, 'walnut'); assert.deepEqual(st.wins, { pawn: 2, knight: 1, bishop: 0, queen: 0 }); assert.equal(st.points, 4);
    assert.equal(await T(frame, 'return T.progress().r;'), 800, 'a new puzzle rating');
    await T(frame, "T.seed(5); T.start({ mode: 'two' }); return 1;");
    const c = sq => T(frame, `return T.squareCenter('${sq}');`);
    let a = await c('e2'), b = await c('e4');
    await page.mouse.click(a.x, a.y); await page.mouse.click(b.x, b.y); await page.waitForTimeout(400);
    a = await c('e7'); b = await c('e5');
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
    assert.deepEqual((await T(frame, 'return T.state();')).history, ['e4', 'e5']);
    const saved = await T(frame, 'return T.save();');
    assert.equal(saved.v, 2); assert.equal(saved.settings.theme, 'walnut'); assert.ok(!('faces' in saved.settings)); assert.deepEqual(saved.stars, { pawn: true }); assert.deepEqual(saved.puzzles, { 0: true, 3: true });
    // the robot answers, undo takes back both moves, a back-rank mate ends the game with a robot point
    const r = await T(frame, "T.skipAnimations(true); T.start({ mode: 'robot', level: 'knight', side: 'w' }); await T.move('d4', { waitRobot: true }); const h = T.state().history.length; T.undo(); return [h, T.state().history.length];");
    assert.deepEqual(r, [2, 0]);
    const end = await T(frame, "T.start({ mode: 'robot', level: 'pawn', side: 'w', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1' }); await T.move('Ra8#'); await T.idle(); const s = T.state(); return [s.result, s.reason, s.points, s.endShown];");
    assert.deepEqual(end, ['1-0', 'checkmate', 5, true]);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('castle-clash: a rated puzzle: the opponent moves first, a wrong move costs rating and is taken back, hints, the solution, then the next', { skip, timeout: 120000 }, async () => {
  const { ctx, frame, errors } = await open();
  try {
    let s = await T(frame, "T.skipAnimations(true); return T.lp.start({ kind: 'rated' });");
    assert.equal(s.kind, 'rated'); assert.equal(s.step, 1, 'the opponent\'s move was played'); assert.ok(s.rated); assert.ok(Math.abs(s.rating - 800) < 450);
    assert.equal((await T(frame, 'return T.state();')).history.length, 1);
    // a wrong move: rating down once, the move is taken back
    s = await T(frame, "const sol = T.lp.solution(); const w = T.state().legalMoves.find(m => m.from + m.to + (m.promo || '') !== sol[0]); await T.move(w.san); await T.idle(); return T.lp.state();");
    assert.ok(s.failed); assert.ok(s.delta < 0, 'rating went down'); assert.equal(s.step, 1);
    assert.equal((await T(frame, 'return T.state();')).history.length, 1, 'taken back');
    const r1 = await T(frame, 'return T.progress().r;'); assert.equal(r1, 800 + s.delta);
    // the solution plays itself
    s = await T(frame, 'return T.lp.show();');
    assert.ok(s.shown); assert.equal(s.step, s.total);
    assert.equal(await T(frame, 'return T.progress().r;'), r1, 'no second loss');
    // the next puzzle; a hint (piece, then square) then solving gives no rating change
    s = await T(frame, 'return T.lp.next();');
    assert.equal(s.step, 1); assert.ok(!s.failed);
    s = await T(frame, 'T.lp.hint(); T.lp.hint(); return T.lp.state();'); assert.ok(s.hinted);
    s = await T(frame, 'for (const u of T.lp.solution()) await T.move(u); await T.idle(); return T.lp.state();');
    assert.ok(s.solved); assert.equal(s.delta, 0);
    // a clean solve raises the rating
    s = await T(frame, "await T.lp.next(); for (const u of T.lp.solution()) await T.move(u); await T.idle(); return T.lp.state();");
    assert.ok(s.solved); assert.ok(s.delta > 0);
    const p = await T(frame, 'return T.progress();');
    assert.equal(p.n, 3); assert.equal(p.ok, 1); assert.equal(p.solved, 2); assert.equal(p.run, 1); assert.equal(p.days.streak, 1); assert.equal(p.today.n, 2);
    assert.equal(p.hist.length, 3); assert.equal(p.seen.length, 3);
    // a theme pack only serves its theme; the daily puzzle is the same one twice in a day
    s = await T(frame, "return T.lp.start({ kind: 'theme', theme: 'fork' });"); assert.ok(s.themes.includes('fork'));
    const d1 = await T(frame, "return T.lp.start({ kind: 'daily' });"), d2 = await T(frame, "return T.lp.start({ kind: 'daily' });");
    assert.equal(d1.id, d2.id); assert.equal(d1.kind, 'daily');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('castle-clash: Puzzle Rush counts solves and mistakes and keeps the best score; the progress page shows it all', { skip, timeout: 120000 }, async () => {
  const { ctx, frame, errors } = await open();
  try {
    let s = await T(frame, "T.skipAnimations(true); return T.lp.start({ kind: 'rush' });");
    assert.equal(s.kind, 'rush'); assert.equal(s.rated, false); assert.deepEqual([s.rush.score, s.rush.strikes], [0, 0]); assert.ok(s.rush.left > 170000);
    s = await T(frame, 'for (let i = 0; i < 3; i++) { for (const u of T.lp.solution()) await T.move(u); await T.idle(); } return T.lp.state();');
    assert.equal(s.rush.score, 3);
    s = await T(frame, "for (let i = 0; i < 3; i++) { const sol = T.lp.solution(); const w = T.state().legalMoves.find(m => m.from + m.to + (m.promo || '') !== sol[0]); await T.move(w.san); await T.idle(); } return T.lp.state();");
    assert.ok(s.rush.over); assert.equal(s.rush.strikes, 3);
    assert.equal((await T(frame, 'return T.progress();')).rushBest, 3);
    assert.equal(await T(frame, "return T.state().endShown;"), true);
    await T(frame, "T.start({ mode: 'puzzle', puzzle: 0 }); await T.move('Rd8#'); T.show('progress'); return 1;");
    const txt = await frame.evaluate(() => [...document.querySelectorAll('#progStats .stat')].map(e => e.textContent));
    assert.ok(txt.includes('Best Puzzle Rush3'), JSON.stringify(txt)); assert.ok(txt.includes('Puzzles solved4'));
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#progThemes .mrow').length), 15);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#progPath svg').length), 24);
    assert.match(await frame.evaluate(() => document.getElementById('progGraph').innerHTML), /<text/, 'no rated puzzles yet: the graph says how to start');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('castle-clash: wood sounds play only while sound is on, and are real waveforms', { skip, timeout: 60000 }, async () => {
  const { ctx, frame } = await open();
  try {
    const r = await T(frame, `
      T.skipAnimations(true); BRB.sfx.mute(true); T.start({ mode: 'two' }); await T.move('e4'); await T.move('d5');
      const off = T.sounds().slice(); BRB.sfx.mute(false); await T.move('exd5'); await T.move('Qxd5'); await T.move('Nc3');
      const s = T.soundSamples('move', 22050); let pk = 0, e = 0; for (const x of s) { pk = Math.max(pk, Math.abs(x)); e += x * x; }
      return { off, on: T.sounds(), pk, e, names: ['capture', 'castle', 'check', 'promote', 'illegal', 'correct', 'wrong', 'end'].map(n => T.soundSamples(n, 8000).some(x => Math.abs(x) > 0.01)) };`);
    assert.deepEqual(r.off, [], 'muted: nothing');
    assert.ok(r.on.includes('capture') && r.on.includes('move'), JSON.stringify(r.on));
    assert.ok(r.pk > 0.05 && r.e > 0.01, 'a move sound is not silent');
    assert.deepEqual(r.names, Array(8).fill(true));
  } finally { await ctx.close(); }
});

test('castle-clash: the online protocol is unchanged (numbers only, seats, replay of the history)', { skip, timeout: 60000 }, async () => {
  const { ctx, frame } = await open();
  try {
    const r = await T(frame, `
      T.skipAnimations(true);
      T.online.inject({ t: 'go', seat: 0, me: { name: 'Mia' }, opp: { name: 'Leo' }, hist: [] });
      const a = T.online.state(); await T.move('e4');
      T.online.inject({ t: 'ev', f: 1, k: 'mv', d: { g: 0, n: 1, f: 100, t: 68, p: 0 } }); await T.idle();
      T.online.inject({ t: 'go', seat: 0, me: { name: 'Mia' }, opp: { name: 'Leo' }, hist: [[0, 'mv', { g: 0, n: 0, f: 20, t: 52, p: 0 }], [1, 'mv', { g: 0, n: 1, f: 100, t: 68, p: 0 }], [0, 'act', { g: 0, a: 2 }]] });
      return { a, sent: T.online.sent(), hist: T.state().history, drawBy: T.online.state().drawBy, mode: T.state().mode };`);
    assert.equal(r.a.side, 'w'); assert.equal(r.a.opp, 'Leo');
    assert.deepEqual(r.sent[0], ['mv', { g: 0, n: 0, f: 20, t: 52, p: 0 }]);
    assert.deepEqual(r.hist, ['e4', 'e5']); assert.equal(r.drawBy, 0); assert.equal(r.mode, 'online');
  } finally { await ctx.close(); }
});

test('castle-clash: a 390 px phone has no sideways scroll on any screen, and the board is the full width', { skip, timeout: 90000 }, async () => {
  const { ctx, frame, errors } = await open({ size: { width: 390, height: 844 } });
  try {
    const wide = () => frame.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    for (const s of ['home', 'robot', 'two', 'learn', 'puzzle', 'progress']) { await T(frame, `T.show('${s}'); return 1;`); assert.equal(await wide(), false, s); }
    await T(frame, "T.skipAnimations(true); await T.lp.start({ kind: 'rated' }); return 1;");
    assert.equal(await wide(), false, 'puzzle');
    const w = await frame.evaluate(() => document.getElementById('board').getBoundingClientRect().width);
    assert.ok(w >= 380, `board ${w}px`);
    await T(frame, "T.start({ mode: 'robot', level: 'pawn' }); await T.move('e4', { waitRobot: true }); return 1;");
    assert.equal(await wide(), false, 'robot game');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
