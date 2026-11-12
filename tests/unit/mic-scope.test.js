// The microphone is for ONE official game's play page, never for a game frame and never for any other game
// (server/services/mic-games.js; docs/safety.md "Loudness"; docs/decisions.md "Remi's Quiet Meadow"). A real app with the
// real seed games: Remi's play page gets microphone=(self) and page-data.mic; its frame, every other page and every
// look-alike (a byte copy of Remi's html, a similar slug or title, a "seed" game the official account does not own, the
// game once hidden or unpublished, an online match, the site-wide off switch) get nothing. The frame's sandbox, CSP and
// iframe attributes are exactly as for every other game, and the scanner still fails a game that asks for the mic.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-mic-scope-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const games = await import('../../server/services/games.js');
const auth = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const { micGame, MIC_GAMES, MIC_POLICY } = await import('../../server/services/mic-games.js');
const { SANDBOX, frameCsp } = await import('../../server/services/frame.js');
const { scanVersion } = await import('../../server/services/scanner.js');
seed({ quiet: true });

const server = createApp().listen(0);
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.closeAllConnections(); server.close(); fs.rmSync(process.env.BRB_DATA_DIR, { recursive: true, force: true }); });

const get = async path => { const r = await fetch(BASE + path, { redirect: 'manual' }); return { status: r.status, headers: r.headers, text: await r.text() }; };
const pageData = text => { const m = /<script[^>]*id="page-data"[^>]*>([\s\S]*?)<\/script>/.exec(text); return m ? JSON.parse(m[1]) : null; };
const micOf = h => (/microphone=([^,]*)/.exec(h.get('permissions-policy') || '') || [])[1];
const REMI = 'remis-quiet-meadow', html = fs.readFileSync(`seed-games/${REMI}.html`, 'utf8');
const kid = auth.createUser({ username: 'MicKid', password: 'secret123' });
function publish(owner, body, { slug = null, title = 'G', source = 'studio' } = {}) {
  const g = games.createGame(owner.id, { title, source, slug });
  const v = games.addVersion(g.id, body, { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, current_version_id=? WHERE id=?", v.id, v.id, g.id);
  return games.getGame(g.id);
}

test('Remi\'s play page may listen: microphone=(self) for this page, page-data.mic, the pill\'s words', async () => {
  assert.deepEqual([...MIC_GAMES], [REMI, 'quiet-bounce', 'popcorn-hush'], 'the three official noise meters, nothing else');
  const r = await get(`/play/${REMI}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('permissions-policy'), MIC_POLICY); assert.equal(micOf(r.headers), '(self)');
  assert.ok(!/microphone=\*/.test(r.headers.get('permissions-policy')), 'never *');
  assert.equal(r.headers.get('x-frame-options'), 'DENY', 'no other site can frame the page and borrow its permission');
  assert.equal(pageData(r.text).mic, true);
  assert.ok(r.text.includes('"js.loudness.listening"') || r.text.includes('js.loudness'), 'the pill\'s words ship with the page');
});

test('Remi\'s game frame is exactly like every other frame: same sandbox, same allow, microphone=(), same CSP', async () => {
  const r = await get(`/play/${REMI}`);
  const tag = /<iframe id="gameframe"[^>]*>/.exec(r.text)[0];
  assert.match(tag, new RegExp(`sandbox="${SANDBOX}"`)); assert.match(tag, /allow="fullscreen; autoplay"/);
  assert.ok(!/microphone/.test(tag) && !/allow-same-origin/.test(tag));
  const tug = await get('/play/tug-of-math'), tugTag = /<iframe id="gameframe"[^>]*>/.exec(tug.text)[0];
  assert.equal(tag.replace(/data-src="[^"]*"|title="[^"]*"/g, ''), tugTag.replace(/data-src="[^"]*"|title="[^"]*"/g, ''), 'the same iframe as Tug of Math');
  const f = await get(/data-src="([^"]+)"/.exec(tag)[1]);
  assert.equal(f.status, 200);
  assert.equal(micOf(f.headers), '()'); assert.match(f.headers.get('permissions-policy'), /camera=\(\), microphone=\(\)/);
  const csp = f.headers.get('content-security-policy');
  assert.ok(csp.startsWith(`sandbox ${SANDBOX};`)); assert.ok(!csp.includes('allow-same-origin')); assert.match(csp, /connect-src https?:\/\/[^\s;\/]+\/vendor\/themes\/;/, 'fetch reaches only Kit 2 theme art');
  const norm = c => c.replace(/https?:\/\/[^ ;]+/g, '').replace(/\s+/g, ' ').replace(/ ;/g, ';');
  assert.equal(norm(csp), norm(frameCsp(['https://oomba.example'])), 'the standard frame CSP');
  assert.ok(f.text.includes('BRB.loudness') || f.text.includes('loudApi'), 'the SDK only talks to the page');
});

test('every other game and page keeps microphone=() and gets no mic flag', async () => {
  for (const p of ['/play/tug-of-math', '/play/sum-racer', '/play/would-you-rather', `/g/${REMI}`, '/', '/teachers']) {
    const r = await get(p); assert.ok([200, 301, 302].includes(r.status), `${p} ${r.status}`);
    assert.equal(micOf(r.headers), '()', p);
    const d = pageData(r.text); assert.ok(!d || !d.mic, `${p}: no mic in page-data`);
  }
});

test('look-alikes get nothing: a byte copy of Remi, a similar slug and title, a "seed" game nobody official owns', async () => {
  const copy = publish(kid, html, { title: "Remi's Quiet Meadow" });
  const twin = publish(kid, html, { slug: 'remis-quiet-meadow-2', title: "Remi's Quiet Meadow" });
  const fake = publish(kid, html, { slug: 'remis-quiet-meadow-fake', title: 'Remi', source: 'seed' });
  for (const g of [copy, twin, fake]) {
    assert.equal(micGame(g), false, g.slug);
    const r = await get(`/play/${g.slug}`); assert.equal(r.status, 200, g.slug);
    assert.equal(micOf(r.headers), '()', g.slug); assert.ok(!pageData(r.text).mic, g.slug);
  }
  // a row that claims Remi's slug but is not the official account's (forced in the database) is refused too
  const official = games.getGameBySlug(REMI);
  assert.equal(micGame({ ...official, owner_id: kid.id }), false, 'owner checked');
  assert.equal(micGame({ ...official, source: 'studio' }), false, 'source checked');
  assert.equal(micGame({ ...official, slug: 'tug-of-math' }), false, 'slug checked');
  assert.equal(micGame(official), true);
});

test('Remi hidden or unpublished, in an online match, or switched off site-wide: no microphone', async () => {
  const g = games.getGameBySlug(REMI);
  assert.equal(micGame({ ...g, hidden_reason: 'review' }), false);
  assert.equal(micGame({ ...g, status: 'draft' }), false);
  assert.equal(micGame({ ...g, published_version_id: null }), false);
  // an online match link that is not the viewer's goes back to the plain game page, and the route never listens in a match
  const m = await get(`/play/${REMI}?match=nope`); assert.equal(m.status, 302); assert.equal(micOf(m.headers), '()');
  const route = fs.readFileSync('server/routes/games.js', 'utf8');
  assert.match(route, /const mic = micGame\(g\) && !inMatch;/);
  config.micGames = false;
  try {
    const r = await get(`/play/${REMI}`); assert.equal(micOf(r.headers), '()'); assert.ok(!pageData(r.text).mic);
  } finally { config.micGames = true; }
  q.run("UPDATE games SET hidden_reason='review' WHERE id=?", g.id);
  try { const r = await get(`/play/${REMI}`); assert.notEqual(micOf(r.headers), '(self)'); } finally { q.run("UPDATE games SET hidden_reason='' WHERE id=?", g.id); }
});

test('nothing else grants the microphone: no iframe allow names it, SANDBOX is unchanged, only Studio and Remi set (self)', () => {
  const files = [];
  const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = `${d}/${f.name}`; if (f.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(f.name)) files.push(p); } };
  ['server', 'public/js', 'public/sdk'].forEach(walk);
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    assert.ok(!/allow="[^"]*microphone/.test(s) && !/allow\s*=\s*['`][^'`]*microphone/.test(s), `${f}: an iframe allow= naming the microphone`);
    if (/microphone=\(self\)|microphone=\*/.test(s)) assert.ok(['server/routes/studio.js', 'server/services/mic-games.js'].includes(f), `${f} grants the microphone`);
  }
  assert.equal(SANDBOX, 'allow-scripts allow-pointer-lock allow-orientation-lock');
  assert.match(fs.readFileSync('public/js/live-common.js', 'utf8'), /allow-scripts allow-pointer-lock allow-orientation-lock/);
  for (const f of ['server/routes/studio.js', 'public/js/live-common.js', 'public/js/live-host.js', 'public/js/live-play.js', 'public/js/studio.js']) {
    if (fs.existsSync(f)) assert.ok(!fs.readFileSync(f, 'utf8').includes('brb:loud'), `${f} never handles loudness`);
  }
});

test('the scanner has no exemption: asking for the microphone fails, even inside a copy of Remi', () => {
  const ask = ['navigator.mediaDevices.getUserMedia({ audio: true })', "navigator.mediaDevices['getUser' + 'Media']({ audio: true })", 'var k = "getUserMedia"; navigator.mediaDevices[k]({audio:true})'];
  for (const a of ask) {
    const bad = html.replace('</script>\n', `\n${a};\n</script>\n`);
    assert.notEqual(scanVersion(bad).status, 'pass', a);
  }
  assert.equal(scanVersion(html).status, 'pass', 'Remi himself never asks');
});

test('play.js: brb:loud is accepted only with a known op; a page without the flag answers off', () => {
  const src = fs.readFileSync('public/js/play.js', 'utf8');
  const start = src.indexOf('const TYPES = {'), end = src.indexOf('let saveTimer');
  const validMessage = new Function(src.slice(start, end).replace('export function', 'function') + '\nreturn validMessage;')();
  const frame = {}, ev = data => ({ source: frame, origin: 'null', data });
  for (const op of ['hello', 'start', 'keep', 'stop']) assert.ok(validMessage(ev({ brb: 1, type: 'brb:loud', op }), frame), op);
  for (const op of ['record', 'open', undefined, 1]) assert.equal(validMessage(ev({ brb: 1, type: 'brb:loud', op }), frame), null, String(op));
  assert.equal(validMessage({ source: {}, origin: 'null', data: { brb: 1, type: 'brb:loud', op: 'start' } }, frame), null, 'only our frame');
  assert.match(src, /case 'brb:loud': if \(!d\.mic\) toFrame\(\{ type: 'brb:loudState', state: 'off' \}\); else loudMessage\(m\); break;/);
});

test('play.js: a start left over from before a reload never opens the mic for the new game; hello needs no module load', async () => {
  const src = fs.readFileSync('public/js/play.js', 'utf8');
  const a = src.indexOf('let loudBridge = null'), b = src.indexOf("function stopLoud() {");
  const end = src.indexOf('\n', b);
  const sent = [], log = [];
  let release;
  // the module loads slowly: the frame reloads (stopLoud) before it arrives
  const importer = () => new Promise(r => { release = () => r({ bridge: () => ({ message: (m, tap) => { log.push([m.op, tap]); }, stop: () => log.push(['stop']) }) }); });
  const make = new Function('toFrame', 'tappedJustNow', 'stage', 't', 'importLoud',
    src.slice(a, end).replace("import('/js/loudness.js')", 'importLoud()') + '\nreturn { loudMessage, stopLoud };');
  const { loudMessage, stopLoud } = make(m => sent.push(m.state), () => true, {}, k => k, importer);
  loudMessage({ op: 'hello' });
  assert.deepEqual(sent, ['ready'], 'hello is answered at once, before loudness.js loads');
  loudMessage({ op: 'start' });
  stopLoud();   // the frame reloaded
  release(); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(log, [], 'the old start is dropped');
  loudMessage({ op: 'start' }); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(log, [['start', true]], 'a fresh start goes through');
});
